/*
 * C-stage prototype — consent-event store over a REAL file-backed node:sqlite D1.
 * Proves GPT consent-doc §8 properties. Synthetic data only; not wired to production.
 *
 * Run: node c_prototype/test_consent.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  registerDocumentVersion, recordConsent, getLatestConsent, listConsentHistory,
  hasActiveConsent, sha256Hex,
} from './consent_store.mjs';

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

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c-consent-'));
  const dbFile = path.join(dir, 'consent.sqlite');
  const sqlite = new DatabaseSync(dbFile);
  sqlite.exec(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'consent_schema.sql'), 'utf8'));
  const db = makeD1(sqlite);
  const U = 'u_consent_1';

  sec('1. register document versions (immutable)');
  const termsV1Hash = await sha256Hex('服務條款內容 v1 ...');
  const privV1Hash = await sha256Hex('個資告知內容 v1 ...');
  ok((await registerDocumentVersion(db, { docType: 'terms', version: 'v1', contentSha256: termsV1Hash })).ok, 'register terms v1');
  ok((await registerDocumentVersion(db, { docType: 'privacy', version: 'v1', contentSha256: privV1Hash })).ok, 'register privacy v1');
  ok((await registerDocumentVersion(db, { docType: 'terms', version: 'v1', contentSha256: termsV1Hash })).already === true, 're-register same hash is idempotent');
  ok((await registerDocumentVersion(db, { docType: 'terms', version: 'v1', contentSha256: await sha256Hex('tampered') })).reason === 'version_content_immutable', 'version content is immutable');

  sec('2. grant -> active consent');
  const g = await recordConsent(db, { userId: U, purpose: 'accept_terms', docType: 'terms', docVersion: 'v1', action: 'granted', sourceScreen: 'first_login' });
  ok(g.ok && g.eventId, 'granted event recorded');
  let a = await hasActiveConsent(db, U, 'accept_terms', { docType: 'terms', requiredVersion: 'v1' });
  ok(a.active === true, 'hasActiveConsent true after grant');

  sec('3. version bump invalidates old consent');
  await registerDocumentVersion(db, { docType: 'terms', version: 'v2', contentSha256: await sha256Hex('服務條款內容 v2 ...') });
  a = await hasActiveConsent(db, U, 'accept_terms', { docType: 'terms', requiredVersion: 'v2' });
  ok(a.active === false && a.reason === 'version_outdated', 'old consent does not satisfy new required version');

  sec('4. append-only: withdraw adds a row, prior rows intact');
  const beforeCount = (await listConsentHistory(db, U, 'accept_terms')).events.length;
  await recordConsent(db, { userId: U, purpose: 'accept_terms', docType: 'terms', docVersion: 'v1', action: 'withdrawn', sourceScreen: 'settings' });
  const hist = (await listConsentHistory(db, U, 'accept_terms')).events;
  ok(hist.length === beforeCount + 1, 'withdraw appended a new row (not overwrite)');
  ok(hist.some((e) => e.action === 'granted'), 'original granted row still present');
  a = await hasActiveConsent(db, U, 'accept_terms', { docType: 'terms', requiredVersion: 'v1' });
  ok(a.active === false && a.reason === 'withdrawn', 'latest withdrawn -> not active');

  sec('5. decline semantics');
  await recordConsent(db, { userId: U, purpose: 'marketing_optin', docType: 'marketing', docVersion: 'v1', action: 'declined', sourceScreen: 'first_login' }).catch(() => {});
  // marketing v1 not registered yet -> should fail (unregistered)
  const decFail = await recordConsent(db, { userId: U, purpose: 'marketing_optin', docType: 'marketing', docVersion: 'v1', action: 'declined', sourceScreen: 'first_login' });
  ok(decFail.ok === false && decFail.reason === 'unregistered_doc_version', 'cannot record consent for unregistered doc version');
  await registerDocumentVersion(db, { docType: 'marketing', version: 'v1', contentSha256: await sha256Hex('行銷同意 v1') });
  await recordConsent(db, { userId: U, purpose: 'marketing_optin', docType: 'marketing', docVersion: 'v1', action: 'declined', sourceScreen: 'first_login' });
  a = await hasActiveConsent(db, U, 'marketing_optin', { docType: 'marketing', requiredVersion: 'v1' });
  ok(a.active === false && a.reason === 'declined', 'declined -> not active');

  sec('6. failed record never enables the feature');
  const r2 = await recordConsent(db, { userId: U, purpose: 'recording_optin', docType: 'recording', docVersion: 'v9', action: 'granted', sourceScreen: 'call' });
  ok(r2.ok === false, 'record against unregistered version fails');
  a = await hasActiveConsent(db, U, 'recording_optin', { docType: 'recording', requiredVersion: 'v9' });
  ok(a.active === false, 'no phantom enable after a failed record');

  sec('7. content changed under a recorded consent is detected');
  await registerDocumentVersion(db, { docType: 'privacy', version: 'v1', contentSha256: privV1Hash });
  await recordConsent(db, { userId: U, purpose: 'ack_privacy', docType: 'privacy', docVersion: 'v1', action: 'granted', sourceScreen: 'first_login' });
  ok((await hasActiveConsent(db, U, 'ack_privacy', { docType: 'privacy', requiredVersion: 'v1' })).active === true, 'privacy consent active');
  // simulate the registry's stored content hash changing (text swapped) after consent
  sqlite.prepare("UPDATE consent_documents SET content_sha256 = ? WHERE doc_type='privacy' AND version='v1'").run(await sha256Hex('swapped privacy text'));
  a = await hasActiveConsent(db, U, 'ack_privacy', { docType: 'privacy', requiredVersion: 'v1' });
  ok(a.active === false && a.reason === 'content_changed', 'consent invalid when the document text changed');

  sec('8. order-linked consent + event ids unique');
  await registerDocumentVersion(db, { docType: 'plan_confirmation', version: 'v1', contentSha256: await sha256Hex('方案確認單 v1') });
  const p1 = await recordConsent(db, { userId: U, purpose: 'purchase_plan_3000', docType: 'plan_confirmation', docVersion: 'v1', action: 'granted', sourceScreen: 'purchase_confirm', orderId: 'ord_123' });
  ok(p1.ok, 'purchase consent recorded with order id');
  const ev = (await getLatestConsent(db, U, 'purchase_plan_3000')).event;
  ok(ev && ev.order_id === 'ord_123', 'order id stored on purchase consent');
  const allEv = (await listConsentHistory(db, U)).events;
  ok(new Set(allEv.map((e) => e.event_id)).size === allEv.length, 'all event ids unique');

  sqlite.close();

  sec('9. NO sensitive data in the consent DB file');
  const bytes = fs.readFileSync(dbFile);
  const latin = bytes.toString('latin1');
  // things that must NEVER appear in consent storage
  for (const probe of ['ya29.', 'recovery', 'BEGIN PRIVATE', 'password', 'Bearer ']) ok(latin.indexOf(probe) === -1, 'consent file has no "' + probe + '"');
  // schema has no column for secrets/full IP
  const cols = new DatabaseSync(dbFile).prepare("SELECT name FROM pragma_table_info('consent_events')").all().map((r) => r.name).join(',');
  ok(!/token|recovery|password|ip_addr|food|payload/i.test(cols), 'consent_events has no sensitive columns (' + cols + ')');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\n──────────────────────────────');
  console.log('consent store: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
