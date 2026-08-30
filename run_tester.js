const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  console.log("Navigating to testers.ai...");
  await page.goto('https://www.testers.ai/index.html', { waitUntil: 'networkidle2' });
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log("Page text snippet:");
  console.log(text.substring(0, 1500));
  
  await browser.close();
})();
