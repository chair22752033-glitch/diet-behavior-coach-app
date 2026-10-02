/*
 * B2: real IndexedDB persistence across a browser RESTART + A->B account switch.
 * Uses a persistent Chromium profile so "reopen the browser" is genuine (not just reload).
 * Addresses GPT's "金鑰保存與日誌" gap: IndexedDB reopen recovery + A->B switch.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import pkg from '/home/user/diet-behavior-coach-app/node_modules/playwright/index.js';
const { chromium } = pkg;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = HERE + '/browser';
const JOSE_DIR = '/home/user/diet-behavior-coach-app/node_modules/jose/dist/webapi';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url === '/' ? '/idb_test.html' : req.url).split('?')[0];
    const file = url.startsWith('/jose/') ? JOSE_DIR + url.slice('/jose'.length)
      : url === '/vault_crypto.mjs' ? (HERE + '/vault_crypto.mjs')
      : DIR + url;
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = 'http://127.0.0.1:' + port + '/idb_test.html?phase=';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-idb-'));
const all = [];
async function runPhase(phase) {
  const ctx = await chromium.launchPersistentContext(userDataDir, { executablePath: '/opt/pw-browsers/chromium' });
  const page = await ctx.newPage();
  await page.goto(base + phase, { waitUntil: 'load' });
  await page.waitForFunction('window.__IDB !== undefined', { timeout: 15000 });
  const out = await page.evaluate('window.__IDB');
  await ctx.close(); // fully close the "browser" between phases -> genuine restart
  return out;
}

for (const phase of ['activate', 'reopen', 'switch']) {
  const out = await runPhase(phase);
  console.log('\n[' + phase + ']');
  for (const r of out.results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.note ? ' [' + r.note + ']' : ''));
  all.push(out);
}
server.close();
fs.rmSync(userDataDir, { recursive: true, force: true });

const passed = all.reduce((a, o) => a + o.passed, 0), failed = all.reduce((a, o) => a + o.failed, 0);
console.log('\nIndexedDB persistence check: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
