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
