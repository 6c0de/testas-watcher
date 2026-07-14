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
      if (!row) {
        throw new Error(`Target school not found in search results: ${school}`);
      }
      result[school] = {
        status: row.open ? 'open' : 'closed',
        address: row.address,
      };
    }
    return result;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeStatuses };
