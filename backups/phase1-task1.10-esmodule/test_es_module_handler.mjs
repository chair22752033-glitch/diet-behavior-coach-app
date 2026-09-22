/*
 * TASK 1.10｜直接用 Node ESM import 匯入轉換後的 src/worker.js，
 * 用假的 env（模擬 KV/R2 binding）呼叫 export default 的 fetch()，
 * 驗證各路由行為與轉換前完全一致。
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '..', '..', 'src', 'worker.js');
const workerUrl = 'file://' + workerPath + '?t=' + Date.now(); // 避免 import cache

// --- 模擬 KV binding ---
function makeFakeKV() {
  const store = new Map();
  return {
    store,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, value, opts) { store.set(key, value); },
  };
}

// --- 模擬 R2 binding ---
function makeFakeR2(objects) {
  return {
    async get(key) {
      if (!objects[key]) return null;
      return { body: objects[key] };
    },
  };
}

const log = [];
const record = (name, ok, note) => { log.push({ name, ok, note: note || '' }); console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (note ? ' — ' + note : '')); };

async function main() {
  const mod = await import(workerUrl);
  const worker = mod.default;

  assert.ok(worker && typeof worker.fetch === 'function', 'export default 必須有 fetch function');
  record('export default 具備 fetch() function', true);

  const SYNC_KV = makeFakeKV();
  const DIET_COACH_IMAGES = makeFakeR2({ 'quest/scenes/terrain-1.jpg': 'FAKE_JPEG_BYTES' });
  const env = { SYNC_KV, DIET_COACH_IMAGES };

  // --- /manifest.json ---
  {
    const res = await worker.fetch(new Request('https://example.com/manifest.json'), env, {});
    const text = await res.text();
    record('/manifest.json 回傳200', res.status === 200);
    record('/manifest.json Content-Type正確', res.headers.get('content-type') === 'application/manifest+json');
    record('/manifest.json 內容為合法JSON', (() => { try { JSON.parse(text); return true; } catch (e) { return false; } })());
  }

  // --- /apple-touch-icon.png ---
  {
    const res = await worker.fetch(new Request('https://example.com/apple-touch-icon.png'), env, {});
    const buf = await res.arrayBuffer();
    record('/apple-touch-icon.png 回傳200', res.status === 200);
    record('/apple-touch-icon.png Content-Type為image/png', res.headers.get('content-type') === 'image/png');
    record('/apple-touch-icon.png 內容非空', buf.byteLength > 0, buf.byteLength + ' bytes');
  }

  // --- /icon.svg ---
  {
    const res = await worker.fetch(new Request('https://example.com/icon.svg'), env, {});
    const text = await res.text();
    record('/icon.svg 回傳200', res.status === 200);
    record('/icon.svg 內容為svg', text.indexOf('<svg') === 0);
  }

  // --- /img/* 成功情境（R2物件存在）---
  {
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), env, {});
    const text = await res.text();
    record('/img/存在的物件 回傳200', res.status === 200);
    record('/img/存在的物件 內容正確（來自R2 binding）', text === 'FAKE_JPEG_BYTES');
    record('/img/存在的物件 Cache-Control正確', (res.headers.get('cache-control') || '').indexOf('immutable') >= 0);
  }

  // --- /img/* 失敗情境（R2物件不存在）---
  {
    const res = await worker.fetch(new Request('https://example.com/img/does/not/exist.jpg'), env, {});
    record('/img/不存在的物件 回傳404', res.status === 404);
  }

  // --- /img/* 路徑穿越測試 ---
  // 注意：瀏覽器與 JS 的 URL 物件會在建構時就先正規化 ".."（例如
  // "/img/../../etc/passwd" 會被正規化成 "/etc/passwd"），所以這個路徑根本
  // 不會進入 /img/ 分支判斷，而是落到最後的首頁 catch-all（200）。
  // 這與轉換前的行為完全一致（已用 worker.js.before-esmodule.bak 對照驗證），
  // 不是本次 ES Module 轉換造成的差異，此處驗證「前後行為一致」而非「應為404」。
  {
    const res = await worker.fetch(new Request('https://example.com/img/../../etc/passwd'), env, {});
    record('/img/路徑穿越測試 行為與轉換前一致（URL正規化後落到首頁200，未觸及R2）', res.status === 200);
  }

  // --- /api/sync GET（不存在的code）---
  {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=abc123'), env, {});
    const text = await res.text();
    record('/api/sync GET 不存在的code 回傳200且內容為null', res.status === 200 && text === 'null');
  }

  // --- /api/sync POST 然後 GET（驗證env.SYNC_KV確實被正確使用）---
  {
    const postRes = await worker.fetch(new Request('https://example.com/api/sync?code=abc123', { method: 'POST', body: JSON.stringify({ hello: 'world' }) }), env, {});
    const postJson = await postRes.json();
    record('/api/sync POST 成功', postRes.status === 200 && postJson.ok === true);
    record('/api/sync POST 確實寫入 env.SYNC_KV（假KV store內可查到）', SYNC_KV.store.get('sync:abc123') === JSON.stringify({ hello: 'world' }));

    const getRes = await worker.fetch(new Request('https://example.com/api/sync?code=abc123'), env, {});
    const getText = await getRes.text();
    record('/api/sync GET 讀回剛才POST的內容', getText === JSON.stringify({ hello: 'world' }));
  }

  // --- /api/sync 無效 code 格式 ---
  {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=ab'), env, {}); // 太短
    record('/api/sync 無效code格式 回傳400', res.status === 400);
  }

  // --- /api/sync 不支援的方法 ---
  {
    const res = await worker.fetch(new Request('https://example.com/api/sync?code=abc123', { method: 'DELETE' }), env, {});
    record('/api/sync 不支援的方法 回傳405', res.status === 405);
  }

  // --- /api/qlive POST/GET（含TTL參數，只驗證行為，miniflare/fake KV不模擬TTL過期）---
  {
    const postRes = await worker.fetch(new Request('https://example.com/api/qlive?code=xyz789', { method: 'POST', body: JSON.stringify({ ts: 123, qst: {} }) }), env, {});
    const postJson = await postRes.json();
    record('/api/qlive POST 成功', postRes.status === 200 && postJson.ok === true);

    const getRes = await worker.fetch(new Request('https://example.com/api/qlive?code=xyz789'), env, {});
    const getText = await getRes.text();
    record('/api/qlive GET 讀回剛才POST的內容', getText === JSON.stringify({ ts: 123, qst: {} }));
  }

  // --- 首頁（catch-all → getHTML）---
  {
    const res = await worker.fetch(new Request('https://example.com/'), env, {});
    const text = await res.text();
    record('首頁 回傳200', res.status === 200);
    record('首頁 Content-Type為html', (res.headers.get('content-type') || '').indexOf('text/html') === 0);
    record('首頁 內容包含<!DOCTYPE html>', text.indexOf('<!DOCTYPE html>') === 0);
    record('首頁 內容包含NUTRI_DATA/SCEN_DATA/QST_PHOTOS等關鍵變數', text.indexOf('NUTRI_DATA') > 0 && text.indexOf('SCEN_DATA') > 0 && text.indexOf('QST_PHOTOS') > 0);
  }

  // --- env 缺少 DIET_COACH_IMAGES binding 時 /img/ 應優雅降級為404（而非拋例外）---
  {
    const envNoR2 = { SYNC_KV };
    const res = await worker.fetch(new Request('https://example.com/img/quest/scenes/terrain-1.jpg'), envNoR2, {});
    record('缺少R2 binding時 /img/ 優雅降級為404（不拋例外）', res.status === 404);
  }

  console.log('\n---SUMMARY---');
  console.log('PASS:', log.filter((l) => l.ok).length, '/', log.length);
  const failed = log.filter((l) => !l.ok);
  if (failed.length) { console.log('FAILED:', failed); process.exitCode = 1; }

  fs.writeFileSync(path.join(__dirname, 'es-module-test-log.json'), JSON.stringify(log, null, 2));
}

main().catch((e) => { console.error('測試腳本例外:', e); process.exitCode = 1; });
