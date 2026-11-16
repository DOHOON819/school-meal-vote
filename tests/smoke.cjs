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
  if (!placeholder.includes('신청곡')) throw new Error(`Opinion composer did not switch: ${placeholder}; ${errors.join(' | ')}`);
  if (!(await page.locator('#opinionTopicInput option', { hasText: '급식 의견' }).count())) throw new Error('Meal opinion topic is missing');
  if (await page.locator('#authorInput').getAttribute('placeholder') !== '10101 OOO') throw new Error('Author format placeholder missing');
  await page.locator('[data-close-modal]').click();
  await page.goto('http://127.0.0.1:4173/?tab=meal#topOpinions', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body.opinion-mode');
  if (!(await page.locator('body.opinion-mode').count())) throw new Error('TOP 5 URL did not force opinion mode');
  if (!(await page.locator('[data-kind="opinion"].active').count())) throw new Error('Opinion tab is not active on TOP 5 URL');
  if ((await page.locator('#heroTagOne').innerText()).includes('🍝')) throw new Error('Food icon is still visible in opinion hero');
  if (!(await page.locator('#boardTitle').innerText()).includes('학생 의견')) throw new Error('Opinion vote board copy is missing');
  if (!(await page.locator('.vote-cap').innerText()).includes('2,000')) throw new Error('2,000 vote cap note is missing');
  await page.screenshot({ path: 'D:/CodexData/temp/seoun-vote-desktop.png', fullPage: true });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: 'D:/CodexData/temp/seoun-vote-mobile.png', fullPage: false });
  if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);

  const kst = 9 * 60 * 60 * 1000;
  const nextReset = value => {
    const shifted = new Date(new Date(value).getTime() + kst);
    const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
    shifted.setUTCDate(shifted.getUTCDate() - daysSinceMonday + 7);
    shifted.setUTCHours(0, 0, 0, 0);
    return new Date(shifted.getTime() - kst).toISOString();
  };
  if (nextReset('2026-11-22T14:59:59.000Z') !== '2026-11-22T15:00:00.000Z') throw new Error('Weekly reset boundary is incorrect before midnight');
  if (nextReset('2026-11-22T15:00:00.000Z') !== '2026-11-29T15:00:00.000Z') throw new Error('Weekly reset boundary is incorrect after midnight');
  await browser.close();
  console.log('smoke test passed');
})().catch(error => { console.error(error); process.exit(1); });
