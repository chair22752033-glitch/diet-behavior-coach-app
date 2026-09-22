const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(__dirname + '/../phase1-task1.4-r2-upload/manifest.json', 'utf8'));
const r2ByPath = {};
for (const item of manifest) {
  r2ByPath[item.r2path] = fs.readFileSync(path.join(__dirname, '../phase1-task1.4-r2-upload/local-source', item.localName));
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-gpu'] });

  const log = [];
  const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

  // ---- 情境 A：模擬 R2/Worker /img/ 路由正常運作（正式來源成功）----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    let imgHits = 0;
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.route('**/img/**', route => {
      const url = new URL(route.request().url());
      const key = url.pathname.replace(/^\/img\//, '');
      const buf = r2ByPath[key];
      imgHits++;
      if (buf) route.fulfill({ status: 200, contentType: 'image/jpeg', body: buf });
      else route.fulfill({ status: 404, body: 'Not Found' });
    });
    await page.goto('http://127.0.0.1:8765/test.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const sk = page.locator('#sk-btn');
    if (await sk.isVisible({ timeout: 2000 }).catch(() => false)) { await sk.click(); await page.waitForTimeout(400); }

    for (const mode of ['single', 'map', 'panorama']) {
      await page.evaluate((m) => { showQuestScreen(); qstDraw(m); }, mode);
      await page.waitForTimeout(500);
      const info = await page.evaluate(() => {
        const im = document.querySelector('#qst-body .qst-art-wrap img, #qst-body .qst-scene img, #qst-body img');
        if (!im) return { found: false };
        return { found: true, src: im.src, loaded: im.complete && im.naturalWidth > 0, usesR2: im.src.indexOf('/img/') >= 0, hasFallbackAttr: im.hasAttribute('data-fb') };
      });
      record('情境A（R2正常）QUEST ' + mode + ' 模式：畫面有圖片且圖片實際載入成功', info.found && info.loaded, JSON.stringify(info));
      record('情境A（R2正常）QUEST ' + mode + ' 模式：圖片來源為 /img/（R2為主要來源）', info.found && info.usesR2, info.src);
      await page.screenshot({ path: __dirname + '/scnA_' + mode + '.png' });
    }
    record('情境A 全程無 page error', errs.length === 0, errs.join(' | '));
    record('情境A /img/ 路由確實被呼叫（證明 R2 為主要來源，不是略過直接用Base64）', imgHits > 0, imgHits + ' 次');
    await page.close();
  }

  // ---- 情境 B：模擬 R2/Worker /img/ 路由完全失效（全部404，模擬R2失效情況）----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.route('**/img/**', route => route.fulfill({ status: 404, body: 'Not Found' }));
    await page.goto('http://127.0.0.1:8765/test.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const sk = page.locator('#sk-btn');
    if (await sk.isVisible({ timeout: 2000 }).catch(() => false)) { await sk.click(); await page.waitForTimeout(400); }

    for (const mode of ['single', 'map', 'panorama']) {
      await page.evaluate((m) => { showQuestScreen(); qstDraw(m); }, mode);
      await page.waitForTimeout(600);
      const info = await page.evaluate(() => {
        const im = document.querySelector('#qst-body .qst-art-wrap img, #qst-body .qst-scene img, #qst-body img');
        if (!im) return { found: false };
        return { found: true, src: im.src.slice(0, 40), loaded: im.complete && im.naturalWidth > 0, usesFallback: im.src.indexOf('data:image/jpeg;base64,') === 0 };
      });
      record('情境B（R2失效）QUEST ' + mode + ' 模式：畫面有圖片且圖片實際載入成功（走fallback）', info.found && info.loaded, JSON.stringify(info));
      record('情境B（R2失效）QUEST ' + mode + ' 模式：圖片來源已退回 data:base64 fallback', info.found && info.usesFallback, info.src);
      await page.screenshot({ path: __dirname + '/scnB_' + mode + '.png' });
    }
    record('情境B（R2失效）全程無 page error', errs.length === 0, errs.join(' | '));

    // 連續多次抽卡確認 fallback 機制在各分類/物件下都穩定
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => { showQuestScreen(); qstDraw('single'); });
      await page.waitForTimeout(200);
    }
    const stillOk = await page.evaluate(() => {
      const im = document.querySelector('#qst-body img');
      return im && im.complete && im.naturalWidth > 0;
    });
    record('情境B（R2失效）連續10次抽卡後，fallback圖片仍正常載入', stillOk);
    await page.close();
  }

  fs.writeFileSync(__dirname + '/task1.6-verify-log.json', JSON.stringify(log, null, 2));
  console.log('---SUMMARY---');
  console.log('PASS:', log.filter(l => l.ok).length, '/', log.length);
  const failed = log.filter(l => !l.ok);
  if (failed.length) console.log('FAILED:', failed);

  await browser.close();
})();
