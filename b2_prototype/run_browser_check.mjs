/*
 * B2 real-browser verification: runs the SAME vault_crypto.mjs inside a real Chromium
 * engine (pre-installed) to confirm AES-KW / HKDF / non-extractable keys / jose JWE all
 * work in a browser, not just Node. Closes B1's "browser support unconfirmed" item for Chromium.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pkg from '/home/user/diet-behavior-coach-app/node_modules/playwright/index.js';
const { chromium } = pkg;

const DIR = path.dirname(fileURLToPath(import.meta.url)) + '/browser';
const JOSE_DIR = '/home/user/diet-behavior-coach-app/node_modules/jose/dist/webapi';
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript' };

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url === '/' ? '/index.html' : req.url).split('?')[0];
    // Serve the canonical vault_crypto.mjs (not a copy) so browser + node run identical source.
    const file = url.startsWith('/jose/') ? JOSE_DIR + url.slice('/jose'.length)
      : url === '/vault_crypto.mjs' ? (path.dirname(fileURLToPath(import.meta.url)) + '/vault_crypto.mjs')
      : DIR + url;
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nf'); }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
await page.waitForFunction('window.__B2 !== undefined', { timeout: 15000 });
const out = await page.evaluate('window.__B2');
await browser.close();
server.close();

console.log('UA:', out.ua);
console.log('format:', out.version);
for (const r of out.results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.note ? ' ['+r.note+']' : ''));
console.log('\nBrowser check: ' + out.passed + ' passed, ' + out.failed + ' failed');
process.exit(out.failed ? 1 : 0);
