const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const html = path.resolve(__dirname, 'ai-for-beginners-guide.html');
  const pdf = path.resolve(__dirname, 'ai-for-beginners-companion-guide.pdf');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('file://' + html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();
  console.log('Wrote', pdf);
})();
