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
