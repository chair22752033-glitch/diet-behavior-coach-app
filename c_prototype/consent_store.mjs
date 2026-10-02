/*
 * C-stage prototype — consent-event store (ISOLATED; not wired to production).
 *
 * GPT consent-doc §8 realized:
 *   - append-only: granted / declined / withdrawn each ADD a row; nothing is updated or
 *     deleted, so a past consent can never be rewritten into "never consented".
 *   - every event pins the document version AND a snapshot of that version's content hash,
 *     so you can later prove exactly what text the user agreed to.
 *   - server is the authority: a front-end checkbox only expresses a choice; the server
 *     records it against the currently-registered version, and a FAILED record must never
 *     be treated as success (hasActiveConsent only returns true for a persisted granted row
 *     that matches the current registered content hash).
 *   - structurally stores NO recovery code / key / token / food plaintext / full IP — there
 *     are simply no columns for them.
 *
 * Isomorphic: uses globalThis.crypto for uuid + sha256 (Node 22 + Workers).
 */
import { run, all, first } from '../src/db/query.js';

export const CONSENT_ACTIONS = ['granted', 'declined', 'withdrawn'];
export const DOC_TYPES = ['terms', 'privacy', 'plan_confirmation', 'community', 'recording', 'marketing', 'vault_activation'];

const te = new TextEncoder();
export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', te.encode(String(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Register (pin) a document version to the exact content shown. A version is immutable:
 *  re-registering the same version with a different hash is rejected. */
export async function registerDocumentVersion(db, { docType, version, contentSha256 }) {
  if (!DOC_TYPES.includes(docType)) return { ok: false, reason: 'bad_doc_type' };
  if (!version || typeof version !== 'string') return { ok: false, reason: 'bad_version' };
  if (!/^[0-9a-f]{64}$/.test(contentSha256 || '')) return { ok: false, reason: 'bad_hash' };
  const ex = await first(db, 'SELECT content_sha256 FROM consent_documents WHERE doc_type = ? AND version = ?', [docType, version]);
  if (ex.ok && ex.row) {
    if (ex.row.content_sha256 !== contentSha256) return { ok: false, reason: 'version_content_immutable' };
    return { ok: true, already: true };
  }
  const r = await run(db, 'INSERT INTO consent_documents (doc_type, version, content_sha256) VALUES (?, ?, ?)', [docType, version, contentSha256]);
  return r.ok ? { ok: true } : { ok: false, reason: r.error || 'insert_failed' };
}

/** Append one consent event. Returns {ok, eventId} or {ok:false, reason}. Never overwrites. */
export async function recordConsent(db, { userId, purpose, docType, docVersion, action, sourceScreen, orderId = null }) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_user' };
  if (!purpose || typeof purpose !== 'string') return { ok: false, reason: 'missing_purpose' };
  if (!DOC_TYPES.includes(docType)) return { ok: false, reason: 'bad_doc_type' };
  if (!CONSENT_ACTIONS.includes(action)) return { ok: false, reason: 'bad_action' };
  if (!sourceScreen || typeof sourceScreen !== 'string') return { ok: false, reason: 'missing_source' };

  // the document version must be registered, so we can snapshot its content hash
  const doc = await first(db, 'SELECT content_sha256 FROM consent_documents WHERE doc_type = ? AND version = ?', [docType, docVersion]);
  if (!doc.ok) return { ok: false, reason: doc.error || 'read_failed' };
  if (!doc.row) return { ok: false, reason: 'unregistered_doc_version' };

  const mx = await first(db, 'SELECT COALESCE(MAX(seq),0) AS m FROM consent_events WHERE user_id = ?', [userId]);
  const seq = ((mx.ok && mx.row ? mx.row.m : 0) || 0) + 1;
  const eventId = globalThis.crypto.randomUUID();
  const r = await run(db,
    'INSERT INTO consent_events (event_id, user_id, purpose, doc_type, doc_version, doc_content_sha256, action, source_screen, order_id, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [eventId, userId, purpose, docType, docVersion, doc.row.content_sha256, action, sourceScreen, orderId, seq]);
  return r.ok ? { ok: true, eventId, seq } : { ok: false, reason: r.error || 'insert_failed' };
}

export async function getLatestConsent(db, userId, purpose) {
  const r = await first(db, 'SELECT * FROM consent_events WHERE user_id = ? AND purpose = ? ORDER BY seq DESC LIMIT 1', [userId, purpose]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed' };
  return { ok: true, event: r.row || null };
}

export async function listConsentHistory(db, userId, purpose) {
  const sql = purpose
    ? 'SELECT * FROM consent_events WHERE user_id = ? AND purpose = ? ORDER BY seq ASC'
    : 'SELECT * FROM consent_events WHERE user_id = ? ORDER BY seq ASC';
  const r = await all(db, sql, purpose ? [userId, purpose] : [userId]);
  return r.ok ? { ok: true, events: r.results || [] } : { ok: false, reason: r.error || 'read_failed', events: [] };
}

/**
 * Authoritative check: does this account currently have VALID consent for `purpose`,
 * for the required document version? True only if the latest event is `granted`, the
 * version matches, and the snapshotted hash still matches the registered content hash
 * (i.e. the text wasn't changed out from under the recorded consent).
 */
export async function hasActiveConsent(db, userId, purpose, { docType, requiredVersion }) {
  const latest = await getLatestConsent(db, userId, purpose);
  if (!latest.ok) return { ok: false, active: false, reason: latest.reason };
  const ev = latest.event;
  if (!ev) return { ok: true, active: false, reason: 'no_consent' };
  if (ev.action !== 'granted') return { ok: true, active: false, reason: ev.action };
  if (requiredVersion && ev.doc_version !== requiredVersion) return { ok: true, active: false, reason: 'version_outdated' };
  const doc = await first(db, 'SELECT content_sha256 FROM consent_documents WHERE doc_type = ? AND version = ?', [docType, ev.doc_version]);
  if (!doc.ok || !doc.row) return { ok: true, active: false, reason: 'doc_unregistered' };
  if (doc.row.content_sha256 !== ev.doc_content_sha256) return { ok: true, active: false, reason: 'content_changed' };
  return { ok: true, active: true, event: ev };
}
