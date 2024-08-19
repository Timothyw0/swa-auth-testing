const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://example.com');
    await page.screenshot({ path: 'example.png' });
    await browser.close();
    console.log('Screenshot taken');
  } catch (error) {
    console.error('Error:', error);
  }
})();
