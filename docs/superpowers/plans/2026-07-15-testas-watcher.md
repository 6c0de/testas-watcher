# TestAS Test Center Watcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small Node.js tool that checks the TestAS worldwide test-center search for 24.10.2026 and notifies the user via Telegram + email the instant Goethe-Institut Istanbul or ALKEV Privatschule Istanbul flips from "Ausgebucht" (full) to open, running for free on a GitHub Actions cron schedule.

**Architecture:** A stateless CLI script (`check.js`) that Playwright-drives the real `gast.de` Angular search page (no backend API exists to call directly), diffs the result against a `state.json` committed in the repo, and fires Telegram + email only on a closed→open transition. GitHub Actions runs it every 5 minutes and commits `state.json` back when it changes.

**Tech Stack:** Node.js (built-in `node:test` runner, CommonJs `require`), Playwright (Chromium), Nodemailer (Gmail SMTP), Telegram Bot API (via global `fetch`), GitHub Actions.

## Global Constraints

- Target exam date is exactly `24.10.2026` — hardcoded, not user-configurable.
- Target schools are exactly `"Goethe-Institut Istanbul"` and `"ALKEV Privatschule Istanbul"` — must match the live site's `<strong>` text verbatim.
- Notify via **both** Telegram and email, and only on a closed→open transition per school — never repeat the alert every tick while a slot stays open.
- Check interval is every 5 minutes via GitHub Actions cron (`*/5 * * * *`).
- Persistence is `state.json` committed to the repo — no external database or storage service.
- `lib/scrape.js` has no automated test suite (the spec explicitly rejected mocking the site's HTML); it is verified by running it against the live site instead.
- Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_TO`) live only in GitHub Actions repo secrets, never committed to the repo.
- Repo is public (per the approved design) so GitHub Actions minutes are free and unlimited.

---

### Task 1: Project scaffolding + state module

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `lib/targets.js`
- Create: `lib/state.js`
- Test: `test/state.test.js`

**Interfaces:**
- Produces: `TARGET_SCHOOLS: string[]`, `TARGET_DATE: string`, `SEARCH_URL: string`, `STATE_PATH: string` from `lib/targets.js`.
- Produces: `readState(statePath: string): object`, `writeState(statePath: string, state: object): void`, `defaultState(): object` from `lib/state.js`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "testas-watcher",
  "version": "1.0.0",
  "private": true,
  "description": "Watches TestAS test-center availability for a fixed date and school list, and notifies via Telegram + email when a slot opens.",
  "main": "check.js",
  "scripts": {
    "test": "node --test",
    "check": "node check.js"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 3: Create `lib/targets.js`**

```js
const path = require('path');

module.exports = {
  SEARCH_URL: 'https://www.gast.de/portal/center-search/center-search/testas/worldwide',
  TARGET_DATE: '24.10.2026',
  TARGET_SCHOOLS: ['Goethe-Institut Istanbul', 'ALKEV Privatschule Istanbul'],
  STATE_PATH: path.join(__dirname, '..', 'state.json'),
};
```

- [ ] **Step 4: Write the failing test for `lib/state.js`**

Create `test/state.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readState, writeState, defaultState } = require('../lib/state');

test('readState returns defaultState when the file does not exist', () => {
  const missingPath = path.join(os.tmpdir(), `state-${Date.now()}-missing.json`);
  const result = readState(missingPath);
  assert.deepEqual(result, defaultState());
});

test('writeState then readState round-trips the same data', () => {
  const tmpPath = path.join(os.tmpdir(), `state-${Date.now()}-roundtrip.json`);
  const data = {
    'Goethe-Institut Istanbul': 'open',
    'ALKEV Privatschule Istanbul': 'closed',
  };
  writeState(tmpPath, data);
  const result = readState(tmpPath);
  assert.deepEqual(result, data);
  fs.unlinkSync(tmpPath);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../lib/state'`

- [ ] **Step 6: Implement `lib/state.js`**

```js
const fs = require('fs');
const { TARGET_SCHOOLS } = require('./targets');

function defaultState() {
  const state = {};
  for (const school of TARGET_SCHOOLS) state[school] = 'closed';
  return state;
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) return defaultState();
  const raw = fs.readFileSync(statePath, 'utf8');
  return JSON.parse(raw);
}

function writeState(statePath, state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

module.exports = { readState, writeState, defaultState };
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test`
Expected: PASS — `# pass 2`, `# fail 0`

- [ ] **Step 8: Commit**

```bash
git add package.json .gitignore lib/targets.js lib/state.js test/state.test.js
git commit -m "feat: add target constants and state persistence"
```

---

### Task 2: Transition detection (diff.js)

**Files:**
- Create: `lib/diff.js`
- Test: `test/diff.test.js`

**Interfaces:**
- Consumes: nothing (pure function, plain objects in).
- Produces: `transitionsToOpen(previous: Record<string,string>, current: Record<string,string>): string[]` — used by `check.js` in Task 5.

- [ ] **Step 1: Write the failing tests**

Create `test/diff.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { transitionsToOpen } = require('../lib/diff');

test('detects a closed-to-open transition', () => {
  const previous = { 'Goethe-Institut Istanbul': 'closed' };
  const current = { 'Goethe-Institut Istanbul': 'open' };
  assert.deepEqual(transitionsToOpen(previous, current), ['Goethe-Institut Istanbul']);
});

test('does not re-report a school that was already open', () => {
  const previous = { 'Goethe-Institut Istanbul': 'open' };
  const current = { 'Goethe-Institut Istanbul': 'open' };
  assert.deepEqual(transitionsToOpen(previous, current), []);
});

test('does not report a school that stays closed', () => {
  const previous = { 'ALKEV Privatschule Istanbul': 'closed' };
  const current = { 'ALKEV Privatschule Istanbul': 'closed' };
  assert.deepEqual(transitionsToOpen(previous, current), []);
});

test('treats a school missing from previous state as having been closed', () => {
  const previous = {};
  const current = { 'ALKEV Privatschule Istanbul': 'open' };
  assert.deepEqual(transitionsToOpen(previous, current), ['ALKEV Privatschule Istanbul']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `Cannot find module '../lib/diff'`

- [ ] **Step 3: Implement `lib/diff.js`**

```js
function transitionsToOpen(previous, current) {
  const opened = [];
  for (const [school, status] of Object.entries(current)) {
    const wasOpen = previous[school] === 'open';
    if (status === 'open' && !wasOpen) opened.push(school);
  }
  return opened;
}

module.exports = { transitionsToOpen };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — `# pass 6`, `# fail 0` (4 new + 2 from Task 1)

- [ ] **Step 5: Commit**

```bash
git add lib/diff.js test/diff.test.js
git commit -m "feat: add closed-to-open transition detection"
```

---

### Task 3: Notification module (notify.js)

**Files:**
- Modify: `package.json` (add `nodemailer` dependency)
- Create: `lib/notify.js`
- Test: `test/notify.test.js`

**Interfaces:**
- Produces: `formatMessage(school: string, address: string, date: string): string`, `sendTelegram({token, chatId, text}): Promise<void>`, `sendEmail({user, pass, to, subject, text}): Promise<void>` — used by `check.js` in Task 5.

- [ ] **Step 1: Write the failing test (pure formatting only — network calls are not unit-tested)**

Create `test/notify.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMessage } = require('../lib/notify');

test('formatMessage includes school, address and date', () => {
  const msg = formatMessage(
    'Goethe-Institut Istanbul',
    'Yeni Carsi Cd. No: 32 Beyoglu/Istanbul',
    '24.10.2026'
  );
  assert.match(msg, /Goethe-Institut Istanbul/);
  assert.match(msg, /Yeni Carsi Cd\. No: 32 Beyoglu\/Istanbul/);
  assert.match(msg, /24\.10\.2026/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../lib/notify'`

- [ ] **Step 3: Install nodemailer**

Run: `npm install nodemailer`
Expected: `package.json` gains a `dependencies` entry for `nodemailer`, `package-lock.json` is created/updated.

- [ ] **Step 4: Implement `lib/notify.js`**

```js
const nodemailer = require('nodemailer');

function formatMessage(school, address, date) {
  return [
    'TestAS yer acildi!',
    '',
    `Okul: ${school}`,
    `Adres: ${address}`,
    `Tarih: ${date}`,
    '',
    'Hemen kayit ol: https://www.gast.de/portal/center-search/center-search/testas/worldwide',
  ].join('\n');
}

async function sendTelegram({ token, chatId, text }) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }
}

async function sendEmail({ user, pass, to, subject, text }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  await transporter.sendMail({ from: user, to, subject, text });
}

module.exports = { formatMessage, sendTelegram, sendEmail };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test`
Expected: PASS — `# pass 7`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/notify.js test/notify.test.js
git commit -m "feat: add Telegram + email notification module"
```

---

### Task 4: Live-site scraper (scrape.js)

**Files:**
- Modify: `package.json` (add `playwright` dependency)
- Create: `lib/scrape.js`

**Interfaces:**
- Consumes: `SEARCH_URL`, `TARGET_DATE`, `TARGET_SCHOOLS` from `lib/targets.js`.
- Produces: `scrapeStatuses(): Promise<Record<string, {status: 'open'|'closed', address: string}>>` — used by `check.js` in Task 5.

This task has **no automated test** (per the spec's Global Constraints — the site itself, not a mock, is the only meaningful test target). Verification is a manual run against the live site.

- [ ] **Step 1: Install Playwright and its browser**

```bash
npm install playwright
npx playwright install --with-deps chromium
```

Expected: both commands exit 0; Playwright downloads a Chromium build.

- [ ] **Step 2: Implement `lib/scrape.js`**

This replays the exact manual flow confirmed live against `gast.de`: select `Türkei` (`TR`) in `#land`, type the target date into both `#date-from-input` and `#date-to-input`, submit, then read each `.row.entry` result row. Confirmed live markup for a row:

```html
<div class="row entry d-flex align-items-center">
  <div class="col-12 col-md-12 col-lg-7">
    <a href="/portal/center-search/center-search/testas/details/1388?dateFrom=2026-10-24&dateTo=2026-10-24">
      <strong>Goethe-Institut Istanbul</strong><br>Yeni Carsi Cd. No: 32  <br> Beyoglu/Istanbul
    </a>
  </div>
  <div class="col-8 col-md-8 col-lg-3 text-md-right">
    <a href="javascript:void(0);" class="btn btn-testdaf btn-grey-small disabled"> Ausgebucht </a>
  </div>
</div>
```

When a slot opens, the site drops the `disabled` class from that `a.btn` and changes its text to "Anmelden" (confirmed against the second reference screenshot).

```js
const { chromium } = require('playwright');
const { SEARCH_URL, TARGET_DATE, TARGET_SCHOOLS } = require('./targets');

async function scrapeStatuses() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle' });
    await page.selectOption('#land', 'TR');
    await page.fill('#date-from-input', TARGET_DATE);
    await page.fill('#date-to-input', TARGET_DATE);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.row.entry');

    const rows = await page.$$eval('.row.entry', (elements) =>
      elements.map((el) => {
        const link = el.querySelector('.col-lg-7 a');
        const nameEl = link ? link.querySelector('strong') : null;
        const name = nameEl ? nameEl.textContent.trim() : '';
        const address = link
          ? link.textContent.replace(name, '').replace(/\s+/g, ' ').trim()
          : '';
        const statusLink = el.querySelector('a.btn');
        const open = statusLink ? !statusLink.className.includes('disabled') : false;
        return { name, address, open };
      })
    );

    const result = {};
    for (const school of TARGET_SCHOOLS) {
      const row = rows.find((r) => r.name === school);
      result[school] = {
        status: row && row.open ? 'open' : 'closed',
        address: row ? row.address : '',
      };
    }
    return result;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeStatuses };
```

- [ ] **Step 3: Manually verify against the live site**

Run:

```bash
node -e "require('./lib/scrape').scrapeStatuses().then(r => console.log(JSON.stringify(r, null, 2)))"
```

Expected (as of this plan's writing — both schools were confirmed full during design): a JSON object with both schools present, each with `status: "closed"` and a non-empty `address` string resembling `"Yeni Carsi Cd. No: 32 Beyoglu/Istanbul"` and `"Alkent 2000 Mah. Mehmet Yesilgül Cd. No: 7 34535 Istanbul"`. If a school ever shows `status: "open"` here, that's real — treat it as a signal to register, not a bug.

If the addresses look garbled (e.g. run-together words) or a school's `status` is wrong, re-inspect the row's live HTML (`el.outerHTML` in a browser console against the same URL) and adjust the selectors in `lib/scrape.js` — the site's markup, not this plan, is authoritative.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/scrape.js
git commit -m "feat: add Playwright-based live availability scraper"
```

---

### Task 5: Entry point (check.js)

**Files:**
- Create: `check.js`

**Interfaces:**
- Consumes: `scrapeStatuses()` (Task 4), `readState`/`writeState` (Task 1), `transitionsToOpen` (Task 2), `formatMessage`/`sendTelegram`/`sendEmail` (Task 3), `TARGET_DATE`/`STATE_PATH` (Task 1).
- Produces: the `node check.js` and `node check.js --test-notify` CLI entry points used by the GitHub Actions workflow in Task 6.

- [ ] **Step 1: Implement `check.js`**

```js
const { scrapeStatuses } = require('./lib/scrape');
const { readState, writeState } = require('./lib/state');
const { transitionsToOpen } = require('./lib/diff');
const { formatMessage, sendTelegram, sendEmail } = require('./lib/notify');
const { TARGET_DATE, STATE_PATH } = require('./lib/targets');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function notifyBoth(text, subject) {
  const token = requireEnv('TELEGRAM_BOT_TOKEN');
  const chatId = requireEnv('TELEGRAM_CHAT_ID');
  const user = requireEnv('GMAIL_USER');
  const pass = requireEnv('GMAIL_APP_PASSWORD');
  const to = requireEnv('EMAIL_TO');

  await sendTelegram({ token, chatId, text });
  await sendEmail({ user, pass, to, subject, text });
}

async function main() {
  if (process.argv.includes('--test-notify')) {
    const msg = formatMessage('Goethe-Institut Istanbul', 'test address', TARGET_DATE);
    await notifyBoth(msg, 'TestAS watcher: test notification');
    console.log('Test notification sent.');
    return;
  }

  const previous = readState(STATE_PATH);
  const current = await scrapeStatuses();

  const currentStatusOnly = {};
  for (const [school, info] of Object.entries(current)) {
    currentStatusOnly[school] = info.status;
  }

  const opened = transitionsToOpen(previous, currentStatusOnly);

  for (const school of opened) {
    const msg = formatMessage(school, current[school].address, TARGET_DATE);
    await notifyBoth(msg, `TestAS: ${school} acildi!`);
    console.log(`Notified: ${school} opened.`);
  }

  writeState(STATE_PATH, currentStatusOnly);
  console.log('Check complete:', JSON.stringify(currentStatusOnly));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Manually verify the no-transition path (no secrets required)**

Since both schools are confirmed closed as of this plan, this path never calls `notifyBoth`, so it needs no credentials.

Run: `node check.js`
Expected: last line of output is `Check complete: {"Goethe-Institut Istanbul":"closed","ALKEV Privatschule Istanbul":"closed"}` (or whatever the live statuses are at run time), and a `state.json` file now exists at the repo root with that same content.

- [ ] **Step 3: Commit**

```bash
git add check.js state.json
git commit -m "feat: add check.js entry point wiring scrape, diff, state and notify"
```

Note: `node check.js --test-notify` requires real `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `EMAIL_TO` values, which only the user has. Verifying that path is Task 6's job, once those are configured as GitHub Actions secrets (or exported locally by the user).

---

### Task 6: Scheduling, docs, and going live

**Files:**
- Create: `.github/workflows/watch.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `check.js` (Task 5) as the command the workflow runs.
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Create `.github/workflows/watch.yml`**

```yaml
name: TestAS Watcher

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - run: npx playwright install --with-deps chromium

      - run: node check.js
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          GMAIL_USER: ${{ secrets.GMAIL_USER }}
          GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
          EMAIL_TO: ${{ secrets.EMAIL_TO }}

      - name: Commit state.json if it changed
        run: |
          git config user.name "testas-watcher-bot"
          git config user.email "actions@users.noreply.github.com"
          if ! git diff --quiet -- state.json; then
            git add state.json
            git commit -m "chore: update watcher state"
            git push
          fi
```

- [ ] **Step 2: Create `README.md`**

```markdown
# testas-watcher

Watches the TestAS worldwide test-center search for **24.10.2026** and pings
you on Telegram + email the moment Goethe-Institut Istanbul or ALKEV
Privatschule Istanbul opens up ("Anmelden" instead of "Ausgebucht"). Runs on
GitHub Actions every 5 minutes, for free — no server of your own required.

## One-time setup

1. **Telegram bot**
   - Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`,
     follow the prompts. It gives you a **bot token**.
   - Send any message to your new bot once (so it can see your chat).
   - Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser
     and read the `"chat":{"id": ...}` value — that's your **chat id**.

2. **Gmail app password**
   - Enable 2-Step Verification on the Gmail account you want to send from.
   - Create an **App Password** at
     https://myaccount.google.com/apppasswords (choose "Mail" as the app).

3. **GitHub repo secrets**
   - Push this repo to GitHub (public, so Actions minutes are free).
   - Go to Settings → Secrets and variables → Actions, and add:
     - `TELEGRAM_BOT_TOKEN`
     - `TELEGRAM_CHAT_ID`
     - `GMAIL_USER` (the Gmail address you created the app password for)
     - `GMAIL_APP_PASSWORD`
     - `EMAIL_TO` (where you want the email alert sent)

4. **Test it**
   - Go to the Actions tab → "TestAS Watcher" → "Run workflow" to trigger it
     by hand instead of waiting for the next 5-minute tick.
   - Or locally: export the five variables above in your shell, then run
     `node check.js --test-notify` to confirm both Telegram and email arrive.

## How it decides when to alert you

`check.js` scrapes the live page, compares it against `state.json` (committed
in this repo), and only sends a notification the moment a school flips from
`closed` to `open` — it will not spam you every 5 minutes while a slot
happens to stay open, and it will not re-alert if it closes and reopens
later (that counts as a new transition and does alert again).

## Changing what's being watched

Both the target date and the two school names are in `lib/targets.js`. If
you're done with this exam date, either edit that file or just disable the
scheduled workflow under the Actions tab.
```

- [ ] **Step 3: Push to GitHub (requires the user's explicit go-ahead — this creates a public repo and pushes code)**

Ask the user to confirm before running this step. If they have the `gh` CLI authenticated:

```bash
gh repo create testas-watcher --public --source=. --remote=origin --push
```

If not, have them create an empty repo on github.com named `testas-watcher`, then:

```bash
git remote add origin https://github.com/<their-username>/testas-watcher.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Confirm the schedule is live**

After pushing and adding the five secrets, have the user open the repo's
Actions tab and click "Run workflow" once on `TestAS Watcher` to confirm a
green run end-to-end (this is the first run that actually has real
credentials available, so it's the real confirmation that Telegram + email
both work). After that, the `*/5 * * * *` cron takes over automatically.
```
