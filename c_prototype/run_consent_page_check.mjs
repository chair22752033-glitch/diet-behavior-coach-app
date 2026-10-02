/*
 * C-stage prototype — end-to-end smoke of the shell document page + consent API in real
 * Chromium, backed by a real file-backed node:sqlite D1. Isolated; not production.
 *
 * Node http bridges /c/* to the consent API handler and serves the shell page; Chromium
 * loads the page, opens a draft document, ticks the box, submits consent, and we assert the
 * event landed in the real DB.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createConsentApi } from './consent_api.mjs';
import { loadDocuments } from './load_documents.mjs';
import pkg from '/home/user/diet-behavior-coach-app/node_modules/playwright/index.js';
const { chromium } = pkg;

const HERE = path.dirname(fileURLToPath(import.meta.url));
function makeD1(sqlite) {
  function stmt(sql, params) { params = params || []; return {
    bind(...p) { return stmt(sql, p); },
    run() { const s = sqlite.prepare(sql); const i = s.run(...params); return { success: true, meta: { changes: i.changes, last_row_id: Number(i.lastInsertRowid || 0) } }; },
    all() { const s = sqlite.prepare(sql); return { results: s.all(...params), success: true, meta: {} }; },
    first() { const s = sqlite.prepare(sql); const r = s.get(...params); return r === undefined ? null : r; },
  }; }
  return { prepare(sql) { return stmt(sql); }, batch(p) { sqlite.exec('BEGIN'); try { const r = p.map((s) => s.run()); sqlite.exec('COMMIT'); return r; } catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; } } };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-page-'));
const dbFile = path.join(dir, 'c.sqlite');
const sqlite = new DatabaseSync(dbFile);
sqlite.exec(fs.readFileSync(HERE + '/consent_schema.sql', 'utf8'));
const db = makeD1(sqlite);
const documents = await loadDocuments();
const api = createConsentApi({ db, documents, resolveUserId: (r) => r.headers.get('x-prototype-user') });
await api.registerAll();

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/c/')) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const webReq = new Request('http://local' + req.url, { method: req.method, headers: req.headers, body: (req.method === 'GET' || req.method === 'HEAD') ? undefined : body });
      const resp = await api.handle(webReq);
      const text = await resp.text();
      res.writeHead(resp.status, { 'content-type': resp.headers.get('content-type') || 'application/json' });
      res.end(text);
    });
    return;
  }
  const file = req.url === '/' ? '/consent_page.html' : req.url.split('?')[0];
  try { const buf = fs.readFileSync(HERE + '/browser' + file); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(buf); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
await page.waitForFunction('window.__CPAGE && window.__CPAGE.loaded');
await page.click('.doc-tabs button');               // open first doc (terms)
await page.waitForSelector('#dbody');
await page.check('#agree');
await page.click('#submit');
await page.waitForFunction('window.__CPAGE.status === true', { timeout: 10000 }).catch(() => {});
const state = await page.evaluate('window.__CPAGE');
await browser.close();
server.close();

// verify the event actually persisted in the real DB file
const s2 = new DatabaseSync(dbFile);
const row = s2.prepare("SELECT user_id, purpose, action, doc_content_sha256 FROM consent_events WHERE user_id='proto_user_1' ORDER BY seq DESC LIMIT 1").get();
s2.close();

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n); } };
ok(state && state.count === 2, 'page listed 2 documents');
ok(state && state.status === true, 'page reported active consent after submit');
ok(state && state.lastEventId, 'page received an event id');
ok(row && row.action === 'granted' && row.purpose === 'accept_terms', 'consent event persisted in real DB');
ok(/^[0-9a-f]{64}$/.test(row && row.doc_content_sha256 || ''), 'persisted event carries document content hash');
ok(errors.length === 0, 'no page errors (' + errors.slice(0, 2).join('; ') + ')');

fs.rmSync(dir, { recursive: true, force: true });
console.log('\nconsent page e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
