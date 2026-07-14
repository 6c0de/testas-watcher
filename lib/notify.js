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
