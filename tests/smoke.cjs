const { chromium } = require('C:/Users/do819/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  if (!(await page.locator('#topOpinions').count())) throw new Error('TOP 5 section missing');
  if ((await page.locator('text=바삭한 치킨 데이').count())) throw new Error('Old sample meal is still visible');
  await page.locator('[data-open-composer]').first().click();
  await page.locator('[data-proposal-type="opinion"]').click();
  const placeholder = await page.locator('#titleInput').getAttribute('placeholder');
  if (!placeholder.includes('그늘막')) throw new Error(`Opinion composer did not switch: ${placeholder}; ${errors.join(' | ')}`);
  await page.locator('[data-close-modal]').click();
  await page.screenshot({ path: 'D:/CodexData/temp/seoun-vote-desktop.png', fullPage: true });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: 'D:/CodexData/temp/seoun-vote-mobile.png', fullPage: false });
  if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  await browser.close();
  console.log('smoke test passed');
})().catch(error => { console.error(error); process.exit(1); });
