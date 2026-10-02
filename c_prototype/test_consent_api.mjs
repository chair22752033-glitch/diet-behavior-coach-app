/*
 * C-stage prototype — consent API over a REAL file-backed node:sqlite D1, driven with
 * fetch-style Requests (same shape as a Worker). Isolated; not mounted in production.
 *
 * Run: node c_prototype/test_consent_api.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createConsentApi } from './consent_api.mjs';
import { loadDocuments } from './load_documents.mjs';

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };
const sec = (t) => console.log('\n== ' + t + ' ==');

function makeD1(sqlite) {
  function stmt(sql, params) {
    params = params || [];
    return {
      bind(...p) { return stmt(sql, p); },
      run() { const s = sqlite.prepare(sql); const i = s.run(...params); return { success: true, meta: { changes: i.changes, last_row_id: Number(i.lastInsertRowid || 0) } }; },
      all() { const s = sqlite.prepare(sql); return { results: s.all(...params), success: true, meta: {} }; },
      first() { const s = sqlite.prepare(sql); const r = s.get(...params); return r === undefined ? null : r; },
    };
  }
  return { prepare(sql) { return stmt(sql); }, batch(p) { sqlite.exec('BEGIN'); try { const r = p.map((s) => s.run()); sqlite.exec('COMMIT'); return r; } catch (e) { try { sqlite.exec('ROLLBACK'); } catch (_) {} throw e; } } };
}

const BASE = 'http://proto.local';
const req = (method, path, { user, body } = {}) => new Request(BASE + path, {
  method,
  headers: Object.assign({ 'content-type': 'application/json' }, user ? { 'x-prototype-user': user } : {}),
  body: body ? JSON.stringify(body) : undefined,
});

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-api-'));
  const dbFile = path.join(dir, 'c.sqlite');
  const sqlite = new DatabaseSync(dbFile);
  sqlite.exec(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'consent_schema.sql'), 'utf8'));
  const db = makeD1(sqlite);
  const documents = await loadDocuments();
  const api = createConsentApi({ db, documents, resolveUserId: (r) => r.headers.get('x-prototype-user') });

  sec('0. register documents from manifest');
  ok((await api.registerAll()).ok, 'registerAll ok');

  sec('1. GET documents list + one document');
  let r = await api.handle(req('GET', '/c/consent/documents'));
  let j = await r.json();
  ok(r.status === 200 && j.ok && j.documents.length === 2, 'list returns 2 docs');
  ok(j.documents.every((d) => /^[0-9a-f]{64}$/.test(d.contentSha256)) && !('content' in j.documents[0]), 'list has hashes, no content');
  r = await api.handle(req('GET', '/c/consent/document?type=terms&version=v0.1-draft'));
  j = await r.json();
  ok(r.status === 200 && j.ok && j.content.indexOf('服務條款') > -1 && j.status === 'draft', 'GET terms returns draft content');
  const servedHash = j.contentSha256;

  sec('2. served content hash matches what gets recorded on consent');
  r = await api.handle(req('POST', '/c/consent', { user: 'u1', body: { purpose: 'accept_terms', docType: 'terms', docVersion: 'v0.1-draft', action: 'granted', sourceScreen: 'first_login' } }));
  j = await r.json();
  ok(r.status === 200 && j.ok && j.eventId, 'POST consent granted');
  const latest = sqlite.prepare("SELECT doc_content_sha256 FROM consent_events WHERE user_id='u1' ORDER BY seq DESC LIMIT 1").get();
  ok(latest.doc_content_sha256 === servedHash, 'recorded hash == served document hash (provable what they agreed to)');

  sec('3. status endpoint');
  r = await api.handle(req('GET', '/c/consent/status?purpose=accept_terms&type=terms&version=v0.1-draft', { user: 'u1' }));
  j = await r.json();
  ok(j.active === true, 'status active after grant');
  r = await api.handle(req('GET', '/c/consent/status?purpose=accept_terms&type=terms&version=v0.1-draft', { user: 'u2' }));
  j = await r.json();
  ok(j.active === false, 'different user has no consent');

  sec('4. auth + validation');
  r = await api.handle(req('POST', '/c/consent', { body: { purpose: 'x', docType: 'terms', docVersion: 'v0.1-draft', action: 'granted', sourceScreen: 's' } }));
  ok(r.status === 401, 'no user -> 401 (prototype auth; prod uses session)');
  r = await api.handle(req('POST', '/c/consent', { user: 'u1', body: { purpose: 'x', docType: 'terms', docVersion: 'v0.1-draft', action: 'bogus', sourceScreen: 's' } }));
  ok(r.status === 400, 'bad action -> 400');
  r = await api.handle(req('POST', '/c/consent', { user: 'u1', body: { purpose: 'x', docType: 'terms', docVersion: 'v9', action: 'granted', sourceScreen: 's' } }));
  j = await r.json();
  ok(r.status === 400 && j.error === 'unregistered_doc_version', 'unregistered version -> 400');
  r = await api.handle(req('GET', '/c/consent/nope'));
  ok(r.status === 404, 'unknown route -> 404');

  sec('5. withdraw via API is append-only');
  await api.handle(req('POST', '/c/consent', { user: 'u1', body: { purpose: 'accept_terms', docType: 'terms', docVersion: 'v0.1-draft', action: 'withdrawn', sourceScreen: 'settings' } }));
  r = await api.handle(req('GET', '/c/consent/status?purpose=accept_terms&type=terms&version=v0.1-draft', { user: 'u1' }));
  j = await r.json();
  ok(j.active === false && j.reason === 'withdrawn', 'after withdraw -> not active');
  const rows = sqlite.prepare("SELECT action FROM consent_events WHERE user_id='u1' AND purpose='accept_terms' ORDER BY seq").all().map((x) => x.action);
  ok(rows.length === 2 && rows[0] === 'granted' && rows[1] === 'withdrawn', 'both rows retained (append-only)');

  sqlite.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\n──────────────────────────────');
  console.log('consent API: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
