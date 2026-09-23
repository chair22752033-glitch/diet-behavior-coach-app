const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8765/test.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const sk = page.locator('#sk-btn');
  if (await sk.isVisible({ timeout: 2000 }).catch(() => false)) { await sk.click(); await page.waitForTimeout(400); }

  const OUT = process.env.OUT_DIR;
  const log = [];
  const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

  // P6：首頁 UI
  await page.evaluate(() => { showScreen('sh'); initHome(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p6_home.png' });
  record('P6 現有UI - 首頁', await page.evaluate(() => document.getElementById('sh').classList.contains('active')));

  // P1：身份測驗
  await page.evaluate(() => showIdentityQuiz());
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p1_identity_quiz.png' });
  const idqOk = await page.evaluate(() => document.getElementById('sidq').classList.contains('active') && document.querySelectorAll('#sidq .idq-btn, #sidq .ml-opt').length >= 0);
  record('P1 身份測驗 - 進入測驗畫面', idqOk);
  // 走完測驗流程確認能出結果（先跨過導言頁 IDQI=-1 → 0，再依序作答）
  await page.evaluate(() => { IDQI = 0; renderIdq(); for (let i = 0; i < ID_QUESTIONS.length; i++) idqAnswer(0); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p1_identity_result.png' });
  record('P1 身份測驗 - 產生結果', await page.evaluate(() => !!ld().identity));

  // P2：QUEST
  await page.evaluate(() => showQuestScreen());
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p2_quest_intro.png' });
  await page.evaluate(() => qstDraw('single'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p2_quest_draw.png' });
  const questImgOk = await page.evaluate(() => { const im = document.querySelector('#qst-body .qst-art-wrap img, #qst-body .qst-scene'); return !!im; });
  record('P2 QUEST - 抽卡畫面正常', questImgOk);

  // P3：五大系統互通
  await page.evaluate(() => showDimScreen('stress'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p3_five_system.png' });
  const crossLinkCount = await page.evaluate(() => document.querySelectorAll('#sdim-content .idq-btn').length);
  record('P3 五大系統互通 - 延伸連結存在', crossLinkCount > 0, crossLinkCount + ' 個連結');

  // P4：情境演練
  await page.evaluate(() => showScenScreen());
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p4_scenario_intro.png' });
  const scenCount = await page.evaluate(() => SCEN_DATA.length);
  record('P4 情境演練 - 情境庫完整', scenCount === 14, scenCount + ' 個情境');

  // P5：營養素資料
  await page.evaluate(() => showNutriScreen('macro'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/p5_nutrients.png' });
  const nutriCount = await page.evaluate(() => { let t = 0; for (const k in NUTRI_DATA) t += NUTRI_DATA[k].length; return t; });
  record('P5 營養素資料 - 內容完整', nutriCount === 67, nutriCount + ' 項');

  console.log('\nPage errors:', errs.length ? errs : 'none');
  record('整體 - 無 console 錯誤', errs.length === 0);

  require('fs').writeFileSync(OUT + '/baseline-log.json', JSON.stringify(log, null, 2));
  const passed = log.filter(l => l.ok).length;
  console.log('\n=== ' + passed + '/' + log.length + ' 項通過 ===');
  await browser.close();
  process.exit(log.some(l => !l.ok) ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
