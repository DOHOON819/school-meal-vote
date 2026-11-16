const { chromium } = require('C:/Users/do819/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const pageText = await page.locator('body').innerText();
  if (!(await page.locator('#topOpinions').count())) throw new Error('TOP 5 section missing');
  if (await page.locator('[data-ranking-kind]').count() !== 2) throw new Error('TOP 5 switch is missing');
  if (!(await page.locator('#rankingTitle').innerText()).includes('급식 메뉴')) throw new Error('Meal TOP 5 is missing on meal tab');
  await page.locator('[data-ranking-kind="opinion"]').click();
  if (!(await page.locator('#rankingTitle').innerText()).includes('학생 의견')) throw new Error('TOP 5 switch did not open student opinions');
  if (!(await page.locator('[data-kind="opinion"].active').count())) throw new Error('Lower student opinion tab did not sync with TOP 5 switch');
  await page.locator('[data-ranking-kind="meal"]').click();
  if (await page.locator('.poster-download').count()) throw new Error('Paper/poster promotion must not appear on the website');
  for (const paperCopy of ['A4', '인쇄', '학교에 바로 붙일', '포스터']) {
    if (pageText.includes(paperCopy)) throw new Error(`Paper-related copy is visible on the website: ${paperCopy}`);
  }
  for (const banned of ['바삭한 치킨 데이', '운동장 그늘막', '오늘 급식, 그냥 기다리지 말고 직접 골라요', '재료를 입력', '한 줄 올리기', '일요일 밤 12시', '매주 월요일 00:00']) {
    if (pageText.includes(banned)) throw new Error(`Removed text is still visible: ${banned}`);
  }
  if (!(await page.locator('#heroDescription').innerText()).includes('진짜 급식이 될 수도 있습니다')) throw new Error('Required student council promise copy is missing');
  const footerLogo = page.locator('.footer-logo-panel');
  if (!(await footerLogo.count())) throw new Error('Footer logo contrast panel is missing');
  const footerBackground = await footerLogo.evaluate(node => getComputedStyle(node).backgroundColor);
  if (footerBackground !== 'rgb(255, 255, 255)') throw new Error(`Footer logo panel is not white: ${footerBackground}`);
  const footerImageSize = await page.locator('.footer-logo-panel img').evaluate(img => ({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height }));
  if (footerImageSize.naturalWidth !== 220 || footerImageSize.naturalHeight !== 42 || footerImageSize.width !== 220 || footerImageSize.height !== 42) throw new Error(`Footer logo dimensions are wrong: ${JSON.stringify(footerImageSize)}`);
  await page.locator('[data-open-composer]').first().click();
  await page.locator('[data-proposal-type="opinion"]').click();
  const placeholder = await page.locator('#titleInput').getAttribute('placeholder');
  if (!placeholder.includes('신청곡')) throw new Error(`Opinion composer did not switch: ${placeholder}; ${errors.join(' | ')}`);
  if ((await page.locator('[data-proposal-type="opinion"]').innerText()).includes('급식')) throw new Error('Meal keyword is mixed into the student opinion composer');
  if (await page.locator('#opinionTopicInput, #opinionTopicField').count()) throw new Error('Unneeded opinion type field is still present');
  if (!(await page.locator('#remainingVoteCount').innerText()).includes('/2')) throw new Error('Two-vote allowance is not shown');
  if ((await page.locator('#proposalForm textarea').count())) throw new Error('Complex description or ingredient field is present');
  if (await page.locator('#authorInput').getAttribute('placeholder') !== '10101 OOO') throw new Error('Author format placeholder missing');
  await page.locator('[data-close-modal]').click();
  await page.goto('http://127.0.0.1:4173/?tab=opinion#topOpinions', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body.opinion-mode');
  if (!(await page.locator('[data-kind="opinion"].active').count())) throw new Error('Opinion tab is not active on opinion TOP 5 URL');
  if (!(await page.locator('#rankingTitle').innerText()).includes('학생 의견')) throw new Error('Student opinion TOP 5 is missing on opinion tab');
  if (!(await page.locator('[data-ranking-kind="opinion"].active').count())) throw new Error('Student opinion TOP 5 switch is not active');
  if (!(await page.locator('#topOpinions').innerText()).includes('반영되지 않으면 다음 순위')) throw new Error('Student TOP 5 follow-up policy is missing');
  if ((await page.locator('#rankingDescription').innerText()).includes('급식')) throw new Error('Meal keyword is mixed into the student opinion TOP 5 copy');
  if ((await page.locator('.qr-card.opinion-qr').innerText()).includes('급식')) throw new Error('Meal keyword is mixed into the student opinion QR copy');
  if ((await page.locator('#heroTagOne').innerText()).includes('🍝')) throw new Error('Food icon is still visible in opinion hero');
  if (!(await page.locator('#boardTitle').innerText()).includes('학생 의견')) throw new Error('Opinion vote board copy is missing');
  if (await page.locator('.vote-cap').count()) throw new Error('Unverified 2,000-vote cap note is still visible');
  if ((await page.locator('body').innerText()).includes('2,000')) throw new Error('Unverified 2,000 figure is still visible');
  await page.screenshot({ path: 'D:/CodexData/temp/seoun-vote-desktop.png', fullPage: true });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await mobile.waitForTimeout(500);
  if (!(await mobile.locator('[data-ranking-kind="opinion"]').isVisible())) throw new Error('Student opinion TOP 5 switch is hidden on mobile');
  await mobile.locator('[data-ranking-kind="opinion"]').click();
  if (!(await mobile.locator('#rankingTitle').innerText()).includes('학생 의견')) throw new Error('Mobile TOP 5 switch did not open student opinions');
  const mobileFooterImage = await mobile.locator('.footer-logo-panel img').evaluate(img => ({ width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height }));
  if (mobileFooterImage.width !== 180 || mobileFooterImage.height !== 34) throw new Error(`Mobile footer logo dimensions are wrong: ${JSON.stringify(mobileFooterImage)}`);
  await mobile.screenshot({ path: 'D:/CodexData/temp/seoun-vote-mobile.png', fullPage: true });
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
