/*
 * Brick 2b end-to-end: drive the real /ui-assets/migrate/ page in Chromium with stubbed APIs,
 * through unlock (recovery code) -> encrypt -> POST ciphertext -> read back -> verify. Then in
 * Node, decrypt the stored envelopes and confirm they equal the original plaintext records.
 * Non-destructive by design (plaintext sync stub is never mutated).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import pkg from '/home/user/diet-behavior-coach-app/node_modules/playwright/index.js';
const { chromium } = pkg;
import { createVaultLocal } from '../public/ui-assets/lib/vault_keys.mjs';
import { jweDecrypt } from '../public/ui-assets/lib/webcrypto_jwe.mjs';

const PUB = '/home/user/diet-behavior-coach-app/public';
const server = http.createServer((req, res) => {
  const url = (req.url === '/' ? '/ui-assets/migrate/index.html' : req.url).split('?')[0];
  const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };
  try { const b = fs.readFileSync(PUB + url); res.writeHead(200, { 'content-type': types[path.extname(url)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// make a vault in node (same lib the page uses)
const vault = await createVaultLocal();
const INS = [
  { id: 'ins_0', ts: 1759400000000, st: { crave: 'fried', stress_raw: 8 }, crave: 'fried', note: '宵夜炸雞' },
  { id: 'ins_1', ts: 1759300000000, st: { crave: 'sweet' }, crave: 'sweet', note: '下午茶' },
  { id: 'ins_2', ts: 1759200000000, st: { crave: 'soup' }, crave: 'soup', note: '晚餐' },
];
const store = new Map(); // recordId -> envelope

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));

await page.route('**/api/vault', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, exists: true, vault: { vault_id: vault.vaultId, epoch: 1, recovery_salt: vault.serverVaultRecord.recoverySalt, wrapped_vk_recovery: vault.serverVaultRecord.wrappedVkRecovery, format: vault.serverVaultRecord.format } }) }));
await page.route('**/api/sync', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ins: INS, quest: { entries: [] } } }) }));
await page.route('**/api/e2ee/records', (route) => {
  const req = route.request();
  if (req.method() === 'POST') { const b = JSON.parse(req.postData()); store.set(b.recordId, b.envelope); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); }
  const records = Array.from(store.entries()).map(([recordId, envelope], i) => ({ kind: 'ins', recordId, revisionId: 'm1', envelope, seq: i + 1 }));
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, records }) });
});

await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
await page.waitForSelector('#codeArea', { state: 'visible', timeout: 8000 });
await page.fill('#recInput', vault.recoveryCode);
await page.click('#unlockBtn');
await page.waitForSelector('#run', { state: 'visible' });
await page.click('#startBtn');
await page.waitForFunction("document.getElementById('runMsg').textContent.indexOf('驗證完成')>-1 || document.getElementById('runMsg').textContent.indexOf('未完全')>-1", { timeout: 15000 });
const runMsg = await page.evaluate(() => document.getElementById('runMsg').textContent);
await browser.close(); server.close();

// Node-side: decrypt what the page stored and compare to originals
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
ok(errs.length === 0, 'no page errors (' + errs.slice(0, 2).join('; ') + ')');
ok(runMsg.indexOf('驗證完成') > -1, 'page reports verify complete: ' + JSON.stringify(runMsg));
ok(store.size === 3, 'page wrote 3 ciphertext records (got ' + store.size + ')');
let matched = 0;
for (const rec of INS) {
  const env = store.get(rec.id);
  if (!env) continue;
  ok(env.split('.').length === 5, rec.id + ' stored as compact JWE');
  try { const d = await jweDecrypt(vault.vk, env); if (JSON.stringify(d.obj) === JSON.stringify(rec) && d.header.rid === rec.id) matched++; } catch (e) {}
}
ok(matched === 3, 'all 3 envelopes decrypt (node) to the originals with correct header (' + matched + '/3)');

console.log('\nmigrate page e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
