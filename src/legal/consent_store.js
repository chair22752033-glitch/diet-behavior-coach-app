/*
 * Phase C｜Consent event store (production).
 *
 * Append-only consent log. Each event snapshots the exact document content hash shown
 * (computed from the served legal page), so we can later prove what version a user agreed
 * to. Server is the authority: hasActiveConsent is true only for a persisted `granted` row
 * whose version matches and whose snapshotted hash still equals the currently-served hash.
 *
 * Structurally stores NO recovery code / key / token / food plaintext / full IP (no columns).
 * Uses RAW D1 via src/db/query.js (pass app.db.raw from the worker).
 */
import { run, all, first } from '../db/query.js';

export const CONSENT_ACTIONS = ['granted', 'declined', 'withdrawn'];

const te = new TextEncoder();
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(String(text)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function recordConsent(rawDb, { userId, purpose, docType, docVersion, docContentSha256, action, sourceScreen, orderId = null }) {
  if (!userId || typeof userId !== 'string') return { ok: false, reason: 'missing_user' };
  if (!purpose || typeof purpose !== 'string') return { ok: false, reason: 'missing_purpose' };
  if (!docType || typeof docType !== 'string') return { ok: false, reason: 'missing_doc_type' };
  if (!/^[0-9a-f]{64}$/.test(docContentSha256 || '')) return { ok: false, reason: 'bad_hash' };
  if (CONSENT_ACTIONS.indexOf(action) < 0) return { ok: false, reason: 'bad_action' };
  if (!sourceScreen || typeof sourceScreen !== 'string') return { ok: false, reason: 'missing_source' };

  const mx = await first(rawDb, 'SELECT COALESCE(MAX(seq),0) AS m FROM consent_events WHERE user_id = ?', [userId]);
  const seq = ((mx.ok && mx.row ? mx.row.m : 0) || 0) + 1;
  const eventId = crypto.randomUUID();
  const r = await run(rawDb,
    'INSERT INTO consent_events (event_id, user_id, purpose, doc_type, doc_version, doc_content_sha256, action, source_screen, order_id, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [eventId, userId, purpose, docType, docVersion, docContentSha256, action, sourceScreen, orderId, seq]);
  return r.ok ? { ok: true, eventId, seq } : { ok: false, reason: r.error || 'insert_failed' };
}

export async function getLatestConsent(rawDb, userId, purpose) {
  const r = await first(rawDb, 'SELECT * FROM consent_events WHERE user_id = ? AND purpose = ? ORDER BY seq DESC LIMIT 1', [userId, purpose]);
  if (!r.ok) return { ok: false, reason: r.error || 'read_failed' };
  return { ok: true, event: r.row || null };
}

export async function listConsentHistory(rawDb, userId) {
  const r = await all(rawDb, 'SELECT event_id, purpose, doc_type, doc_version, action, source_screen, order_id, server_time, seq FROM consent_events WHERE user_id = ? ORDER BY seq ASC', [userId]);
  return r.ok ? { ok: true, events: r.results || [] } : { ok: false, reason: r.error || 'read_failed', events: [] };
}

/**
 * Authoritative: is this account's latest choice for `purpose` a still-valid `granted`?
 * Requires the latest event be granted, the version match, and the snapshotted hash equal
 * the current served hash (so edited docs force re-consent).
 */
export async function hasActiveConsent(rawDb, userId, purpose, { requiredVersion, currentHash }) {
  const latest = await getLatestConsent(rawDb, userId, purpose);
  if (!latest.ok) return { active: false, reason: latest.reason };
  const ev = latest.event;
  if (!ev) return { active: false, reason: 'no_consent' };
  if (ev.action !== 'granted') return { active: false, reason: ev.action };
  if (requiredVersion && ev.doc_version !== requiredVersion) return { active: false, reason: 'version_outdated' };
  if (currentHash && ev.doc_content_sha256 !== currentHash) return { active: false, reason: 'content_changed' };
  return { active: true, event: ev };
}
