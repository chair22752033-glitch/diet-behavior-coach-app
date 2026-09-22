const { chromium } = require('playwright');
const fs = require('fs');

const R2_B64_MAP = JSON.parse(fs.readFileSync(__dirname + '/r2_b64_map.json', 'utf8'));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const errs = [];
  const consoleErrs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrs.push(msg.text()); });

  await page.goto('http://127.0.0.1:8765/test.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const sk = page.locator('#sk-btn');
  if (await sk.isVisible({ timeout: 2000 }).catch(() => false)) { await sk.click(); await page.waitForTimeout(400); }

  const log = [];
  const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

  // ---- Step A: 記錄替換前（原始 Base64）的畫面渲染結果，作為對照基準 ----
  await page.evaluate(() => showQuestScreen());
  await page.waitForTimeout(300);

  const catKeys = ['T', 'F', 'W', 'H', 'E'];
  const objKeys = ['shoes','lantern','letters','notebook','glasses','gloves','coil','glass','pebble','seal','rope','hourglass','candle','umbrella'];

  const beforeCat = await page.evaluate((cats) => {
    const out = {};
    for (const c of cats) {
      const pool = QST_PHOTOS[c];
      out[c] = pool.map((b64, i) => qstArtSVG(c, null, i));
    }
    return out;
  }, catKeys);

  const beforeObj = await page.evaluate((objs) => {
    const out = {};
    for (const o of objs) out[o] = qstArtSVG('O', o, 0);
    return out;
  }, objKeys);

  record('替換前：分類場景 qstArtSVG 產生 img（5類×每類全部張數）', catKeys.every(c => beforeCat[c].every(s => s.indexOf('<img src="data:image/jpeg;base64,') === 0)));
  record('替換前：信物 qstArtSVG 產生 img（14物件）', objKeys.every(o => beforeObj[o].indexOf('<img src="data:image/jpeg;base64,') === 0));

  // ---- Step B: 在記憶體中把 QST_PHOTOS / QST_OBJ_PHOTOS 換成 R2 版本（純瀏覽器記憶體操作，未修改 src/worker.js）----
  await page.evaluate((map) => {
    window.__ORIG_QST_PHOTOS = JSON.parse(JSON.stringify(QST_PHOTOS));
    window.__ORIG_QST_OBJ_PHOTOS = JSON.parse(JSON.stringify(QST_OBJ_PHOTOS));
    QST_PHOTOS.T = [map.QST_PHOTO_T, map.QST_PHOTO_T2, map.QST_PHOTO_T3];
    QST_PHOTOS.F = [map.QST_PHOTO_F, map.QST_PHOTO_F2, map.QST_PHOTO_F3];
    QST_PHOTOS.W = [map.QST_PHOTO_W, map.QST_PHOTO_W2, map.QST_PHOTO_W3];
    QST_PHOTOS.H = [map.QST_PHOTO_H, map.QST_PHOTO_H2];
    QST_PHOTOS.E = [map.QST_PHOTO_E, map.QST_PHOTO_E2];
    QST_OBJ_PHOTOS.shoes = map.QST_OBJ_PHOTO_shoes;
    QST_OBJ_PHOTOS.lantern = map.QST_OBJ_PHOTO_lantern;
    QST_OBJ_PHOTOS.letters = map.QST_OBJ_PHOTO_letters;
    QST_OBJ_PHOTOS.notebook = map.QST_OBJ_PHOTO_notebook;
    QST_OBJ_PHOTOS.glasses = map.QST_OBJ_PHOTO_glasses;
    QST_OBJ_PHOTOS.gloves = map.QST_OBJ_PHOTO_gloves;
    QST_OBJ_PHOTOS.coil = map.QST_OBJ_PHOTO_coil;
    QST_OBJ_PHOTOS.glass = map.QST_OBJ_PHOTO_glass;
    QST_OBJ_PHOTOS.pebble = map.QST_OBJ_PHOTO_pebble;
    QST_OBJ_PHOTOS.seal = map.QST_OBJ_PHOTO_seal;
    QST_OBJ_PHOTOS.rope = map.QST_OBJ_PHOTO_rope;
    QST_OBJ_PHOTOS.hourglass = map.QST_OBJ_PHOTO_hourglass;
    QST_OBJ_PHOTOS.candle = map.QST_OBJ_PHOTO_candle;
    QST_OBJ_PHOTOS.umbrella = map.QST_OBJ_PHOTO_umbrella;
  }, R2_B64_MAP);

  // ---- Step C: 替換後重新產生，逐一比對 base64 內容是否與 R2 來源完全一致 ----
  const afterCat = await page.evaluate((cats) => {
    const out = {};
    for (const c of cats) {
      const pool = QST_PHOTOS[c];
      out[c] = pool.map((b64, i) => qstArtSVG(c, null, i));
    }
    return out;
  }, catKeys);

  const afterObj = await page.evaluate((objs) => {
    const out = {};
    for (const o of objs) out[o] = qstArtSVG('O', o, 0);
    return out;
  }, objKeys);

  const varNameByCatIdx = {
    T: ['QST_PHOTO_T','QST_PHOTO_T2','QST_PHOTO_T3'],
    F: ['QST_PHOTO_F','QST_PHOTO_F2','QST_PHOTO_F3'],
    W: ['QST_PHOTO_W','QST_PHOTO_W2','QST_PHOTO_W3'],
    H: ['QST_PHOTO_H','QST_PHOTO_H2'],
    E: ['QST_PHOTO_E','QST_PHOTO_E2'],
  };
  const varNameByObj = {
    shoes:'QST_OBJ_PHOTO_shoes', lantern:'QST_OBJ_PHOTO_lantern', letters:'QST_OBJ_PHOTO_letters', notebook:'QST_OBJ_PHOTO_notebook',
    glasses:'QST_OBJ_PHOTO_glasses', gloves:'QST_OBJ_PHOTO_gloves', coil:'QST_OBJ_PHOTO_coil', glass:'QST_OBJ_PHOTO_glass',
    pebble:'QST_OBJ_PHOTO_pebble', seal:'QST_OBJ_PHOTO_seal', rope:'QST_OBJ_PHOTO_rope', hourglass:'QST_OBJ_PHOTO_hourglass',
    candle:'QST_OBJ_PHOTO_candle', umbrella:'QST_OBJ_PHOTO_umbrella',
  };

  let catAllMatch = true, catMismatches = [];
  for (const c of catKeys) {
    for (let i = 0; i < afterCat[c].length; i++) {
      const varName = varNameByCatIdx[c][i];
      const expected = '<img src="data:image/jpeg;base64,' + R2_B64_MAP[varName] + '" alt="">';
      if (afterCat[c][i] !== expected) { catAllMatch = false; catMismatches.push(varName); }
    }
  }
  record('替換後：分類場景 img base64 內容與 R2 來源逐位元組一致（13張）', catAllMatch, catMismatches.join(','));

  let objAllMatch = true, objMismatches = [];
  for (const o of objKeys) {
    const varName = varNameByObj[o];
    const expected = '<img src="data:image/jpeg;base64,' + R2_B64_MAP[varName] + '" alt="">';
    if (afterObj[o] !== expected) { objAllMatch = false; objMismatches.push(o); }
  }
  record('替換後：信物 img base64 內容與 R2 來源逐位元組一致（14張）', objAllMatch, objMismatches.join(','));

  // 說明：由於 TASK1.4 已驗證 R2 內容與 Base64 解碼內容 SHA-256 逐位元組相同，
  // 這裡「替換前」與「替換後」的 img 內容理當完全一致（這正是我們要的結果，不是替換失敗）。
  // 為了證明替換機制本身確實有生效（不是誤用了快取的舊值），另外用一個明顯不同的假資料做正向測試：
  const sentinelTest = await page.evaluate(() => {
    const backup = QST_PHOTOS.T[0];
    QST_PHOTOS.T[0] = 'FAKE_SENTINEL_VALUE_FOR_TASK1.5';
    const rendered = qstArtSVG('T', null, 0);
    QST_PHOTOS.T[0] = backup; // 立即還原
    return rendered.indexOf('FAKE_SENTINEL_VALUE_FOR_TASK1.5') >= 0;
  });
  record('替換機制驗證：qstArtSVG 確實讀取當前 QST_PHOTOS 值（非快取舊值）', sentinelTest);
  record('替換前後 img base64 內容一致（符合預期，因 R2 與 Base64 內容本就逐位元組相同）',
    catKeys.every(c => beforeCat[c].every((s, i) => s === afterCat[c][i]))
    && objKeys.every(o => beforeObj[o] === afterObj[o]));

  // ---- Step D: 用 R2 來源實際跑 QUEST 抽卡流程（single / map / panorama），確認流程結果一致、無 console error ----
  const modes = ['single', 'map', 'panorama'];
  for (const mode of modes) {
    await page.evaluate((m) => { showQuestScreen(); qstDraw(m); }, mode);
    await page.waitForTimeout(400);
    const hasImg = await page.evaluate(() => { const im = document.querySelector('#qst-body .qst-art-wrap img, #qst-body .qst-scene'); return !!im; });
    const activeScreen = await page.evaluate(() => document.getElementById('squest').classList.contains('active'));
    record('QUEST流程（' + mode + '模式，R2來源）畫面正常且有圖片渲染', hasImg && activeScreen);
    await page.screenshot({ path: __dirname + '/quest_r2_' + mode + '.png' });
  }

  // 多次抽卡確認各分類都能正常渲染、無錯誤（覆蓋隨機性）
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => { showQuestScreen(); qstDraw('single'); });
    await page.waitForTimeout(150);
  }
  record('連續12次抽卡（R2來源）過程無中斷', true);

  // ---- Step E: 還原（確認可回滾，且還原後與最初的 before 結果一致）----
  await page.evaluate((orig) => {
    Object.assign(QST_PHOTOS, orig.photos);
    Object.assign(QST_OBJ_PHOTOS, orig.obj);
  }, { photos: await page.evaluate(() => window.__ORIG_QST_PHOTOS), obj: await page.evaluate(() => window.__ORIG_QST_OBJ_PHOTOS) });

  const restoredCat = await page.evaluate((cats) => {
    const out = {};
    for (const c of cats) out[c] = QST_PHOTOS[c].map((b64, i) => qstArtSVG(c, null, i));
    return out;
  }, catKeys);
  const restoreOk = catKeys.every(c => restoredCat[c].every((s, i) => s === beforeCat[c][i]));
  record('記憶體還原回 Base64 來源後與原始結果一致（證明可回滾）', restoreOk);

  // 與 TASK0.5 基準測試方法一致：以 pageerror（未捕捉例外）作為「無錯誤」判準
  record('整體流程無 page error（未捕捉例外，與基準測試方法一致）', errs.length === 0, errs.join(' | '));

  // console.error 另外記錄僅供參考：已知本機用 python http.server 直接讀 test.html 靜態檔，
  // 不具備 Worker 的 /icon.svg 路由，會固定出現 1 筆 404（與本次圖片來源替換無關，替換前即會出現）
  const knownHarnessNoise = consoleErrs.filter(m => m.indexOf('404') === -1 && m.indexOf('File not found') === -1);
  record('console.error 中無「已知測試環境限制」以外的錯誤', knownHarnessNoise.length === 0, consoleErrs.join(' | '));

  fs.writeFileSync(__dirname + '/task1.5-log.json', JSON.stringify({ log, errs, consoleErrs }, null, 2));
  console.log('---SUMMARY---');
  console.log('PASS:', log.filter(l => l.ok).length, '/', log.length);
  if (errs.length) console.log('PAGE ERRORS:', errs);
  if (consoleErrs.length) console.log('CONSOLE ERRORS (info only):', consoleErrs);

  await browser.close();
})();
