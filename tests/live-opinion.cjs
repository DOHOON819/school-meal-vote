const { chromium } = require('C:/Users/do819/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const stamp = String(Date.now()).slice(-6);
  const title = `자동 확인용 의견 ${stamp}`;
  page.on('dialog', dialog => dialog.accept());
  await page.goto('http://127.0.0.1:4173/?tab=opinion#topOpinions', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-open-opinion]').click();
  await page.locator('#titleInput').fill(title);
  await page.locator('#authorInput').fill(`19999 검증${stamp.slice(-3)}`);
  await page.locator('#proposalForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => !document.querySelector('#composerDialog').open, null, { timeout: 30000 });
  await page.waitForFunction(expected => document.body.innerText.includes(expected), title, { timeout: 30000 });
  const card = page.locator('.idea-card', { hasText: title });
  if (!(await card.count())) throw new Error('Published opinion was not found in the opinion board');
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto('http://127.0.0.1:4173/?tab=opinion#topOpinions', { waitUntil: 'domcontentloaded' });
  await viewer.waitForFunction(expected => document.body.innerText.includes(expected), title, { timeout: 30000 });
  await viewerContext.close();
  await card.locator('[data-action="like"]').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('한 표를 눌렀어요'), null, { timeout: 20000 });
  await page.waitForFunction(expected => document.querySelector('#winnerTitle')?.textContent === expected, title, { timeout: 20000 });
  await page.waitForFunction(expected => [...document.querySelectorAll('.rank-card')].some(item => item.innerText.includes(expected) && item.innerText.includes('/ 2,000표')), title, { timeout: 20000 });
  await page.waitForFunction(expected => {
    const candidate = [...document.querySelectorAll('.idea-card')].find(item => item.innerText.includes(expected));
    return candidate && !candidate.querySelector('[data-action="like"]').disabled;
  }, title, { timeout: 20000 });
  await page.locator('.idea-card', { hasText: title }).locator('[data-action="like"]').click();
  await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('투표를 취소했어요'), null, { timeout: 20000 });
  await card.locator('[data-action="delete"]').click();
  await page.waitForFunction(expected => !document.body.innerText.includes(expected), title, { timeout: 30000 });
  console.log('live opinion publish/delete test passed');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
