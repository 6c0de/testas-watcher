# TestAS Test Center Watcher — Design

Date: 2026-07-15

## Purpose

Monitor the TestAS worldwide test-center search (hosted at `gast.de`, embedded
as an iframe in `testas.de`) for a single fixed exam date, **24.10.2026**, and
alert the user by Telegram + email the moment either of two specific Istanbul
test centers — **Goethe-Institut Istanbul** or **ALKEV Privatschule Istanbul**
— flips from fully booked ("Ausgebucht") to open for registration
("Anmelden"). The user wants to grab the freed slot before anyone else, so
speed of notification matters more than anything else.

Out of scope: any other date, any other country, any other test center,
auto-registering on the user's behalf (would need their TestAS login —
explicitly not requested and not something this tool should do).

## Findings from live investigation

- `testas.de`'s date/registration page embeds an iframe pointing at
  `https://www.gast.de/portal/center-search/center-search/testas/worldwide`.
- That page is an Angular SPA. There is **no discoverable backend JSON API**
  for the search — no XHR/fetch call was observed in the network log when
  submitting the form. The result list is rendered entirely client-side, so a
  plain `fetch()` + HTML parse will not work; the page must actually be
  executed in a browser.
- Confirmed working manual flow (reproduced live during design):
  1. Load the `.../testas/worldwide` route.
  2. Select `Türkei` in `<select id="land" name="country">` (option value `TR`).
  3. Type `24.10.2026` into `#date-from-input` and `#date-to-input`
     (format `TT.MM.JJJJ`).
  4. Click the `button[type=submit]` labeled "SUCHE STARTEN".
  5. Results render as repeated `div.row.entry` blocks. Each contains a
     `<strong>` with the school name and an `<a class="btn ...">` status
     link:
     - Full: `<a class="btn btn-testdaf btn-grey-small disabled">Ausgebucht</a>`
     - Open: same element **without** the `disabled` class, text "Anmelden"
       (confirmed by the second screenshot the user provided).
  - Live-checked during this session: both target schools show
    `Ausgebucht` for 24.10.2026 right now.

## Approaches considered

1. **Reverse-engineer a hidden JSON API.** Rejected — no such endpoint is
   observable; the data appears to be embedded in the compiled JS bundle, not
   fetched per-search. Chasing this would mean parsing hashed, versioned JS
   chunks — fragile and more work than just running the page.
2. **Plain HTTP GET + HTML parse (cheerio).** Rejected — the initial HTML has
   no result data; it's rendered by Angular after the form submits. This
   would only work if there were a server-rendered fallback, which there
   isn't.
3. **Headless browser automation (Playwright), replaying the exact manual
   steps above.** ✅ Chosen. It's guaranteed to see what a real user sees,
   independent of how the SPA gets its data internally, and it's the same
   flow already verified live in this session.

## Architecture

Single small Node.js project, no server process — it runs to completion once
per invocation and exits. Scheduled externally (GitHub Actions cron), not a
long-lived daemon.

```
testas-watcher/
  check.js              # entry point: launches Playwright, scrapes, compares, notifies
  lib/scrape.js          # returns [{ school, open: boolean }] for the two target schools
  lib/notify.js          # sendTelegram(msg), sendEmail(subject, msg)
  lib/state.js           # readState()/writeState() — reads/writes state.json
  state.json              # { "Goethe-Institut Istanbul": "closed", "ALKEV Privatschule Istanbul": "closed" }
  .github/workflows/watch.yml   # cron schedule, runs `node check.js`, commits state.json if changed
  package.json
  README.md               # setup steps (bot token, chat id, app password, secrets)
```

### Data flow

1. GitHub Actions cron fires `node check.js` every 5 minutes.
2. `scrape.js` launches headless Chromium, performs the 5-step flow above
   against the two hard-coded target school names and the hard-coded date
   `24.10.2026`, returns current open/closed status for each.
3. `check.js` loads `state.json` (previous status), diffs against the fresh
   scrape.
4. For any school whose status changed **closed → open**, call both
   `notify.sendTelegram` and `notify.sendEmail` with the school name, address,
   and a direct link back to the search page.
5. Write the new statuses to `state.json`. The GitHub Actions workflow commits
   this file back to the repo only if it changed (`git diff --quiet` guard),
   so there's no commit spam on unchanged runs.
6. Process exits. No state kept in memory between runs — `state.json` in the
   repo is the only persistence, so no external database or storage service
   is needed.

### Notification behavior

- Fires once per closed→open transition per school (not every 5-minute tick
  while it stays open) — this is what `state.json` is for, to avoid spamming
  the user every 5 minutes while a slot happens to stay open.
- Both channels are fired for every transition (Telegram primarily for speed,
  email as a backup in case Telegram delivery fails or the user's phone is
  offline).
- Message includes: which school, its address, and the exact date, so the
  user doesn't have to go re-check which one before rushing to register.

### Error handling

- If a selector isn't found (site layout changed, site down, network error),
  `check.js` logs the error to stdout (visible in the GitHub Actions run log)
  and exits non-zero **without** touching `state.json` and **without**
  sending a false "it's open" alert. The next scheduled run tries again from
  a clean slate.
- No retry-with-backoff inside a single run — a failed run just waits for the
  next 5-minute cron tick, which is effectively the retry.

### Hosting / scheduling

- GitHub Actions, public repo, `schedule: cron: '*/5 * * * *'` — free and
  unlimited for public repos, no server for the user to maintain, runs
  independent of their own computer being on.
- Each run: checkout → `npm ci` → `npx playwright install --with-deps
  chromium` → `node check.js` → commit `state.json` if changed. A single run
  is expected to take well under a minute of actual Playwright work; the
  Playwright browser install is the dominant cost per run.

### Secrets (GitHub Actions repository secrets — user sets these up)

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_TO`

None of these are committed to the repo; the workflow reads them from
`secrets.*` into environment variables at run time.

### Testing

- `lib/scrape.js` is exercised directly (manual `node -e` run, or a small
  script) against the live site once during setup to confirm selectors still
  match before wiring up the schedule.
- `lib/notify.js` has a manual "send test message" path (`node check.js
  --test-notify`) so the user can confirm Telegram + email both arrive before
  relying on the automation for real.
- No mocked test suite for the scraping logic — the site itself is the only
  meaningful test target, and a mock would just encode today's HTML
  structure, giving false confidence if the site changes.

## Setup steps for the user (cannot be done by the assistant)

1. Create a Telegram bot via @BotFather, get the bot token, message the bot
   once, then get the numeric chat id.
2. Create a Gmail app password for sending the email leg.
3. Create a new GitHub repository (public) and push this project to it.
4. Add the five secrets above under the repo's Settings → Secrets and
   variables → Actions.
5. Confirm the workflow is enabled under the Actions tab (scheduled workflows
   are disabled by default on repos with no recent activity if the repo is
   forked, but not for a freshly pushed own repo).
