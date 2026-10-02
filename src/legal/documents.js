/*
 * Phase C｜Legal document registry + content hashing.
 *
 * Documents are served as static pages under /ui-assets/legal/. For consent we hash the
 * ACTUAL served page content, so a recorded consent is pinned to the exact text shown; if
 * the page is later edited (e.g. after legal review), the hash changes and affected users
 * are asked to re-consent (by design).
 */
import { sha256Hex } from './consent_store.js';

export const LEGAL_DOCS = {
  intent:  { version: 'v0.1-draft', path: '/ui-assets/legal/index.html' },   // 意向書/服務說明
  terms:   { version: 'v0.1-draft', path: '/ui-assets/legal/terms.html' },
  privacy: { version: 'v0.1-draft', path: '/ui-assets/legal/privacy.html' },
};

export function isKnownDoc(docType) {
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCS, docType);
}

/** Fetch the served legal page via the UI_ASSETS binding and return its version + sha256. */
export async function fetchDocHash(env, requestUrl, docType) {
  const doc = LEGAL_DOCS[docType];
  if (!doc) return { ok: false, reason: 'unknown_doc' };
  if (!env || !env.UI_ASSETS || typeof env.UI_ASSETS.fetch !== 'function') return { ok: false, reason: 'assets_unavailable' };
  let resp;
  try {
    resp = await env.UI_ASSETS.fetch(new Request(new URL(doc.path, requestUrl).toString()));
  } catch (e) {
    return { ok: false, reason: 'doc_fetch_error' };
  }
  if (!resp || !resp.ok) return { ok: false, reason: 'doc_fetch_failed' };
  const text = await resp.text();
  return { ok: true, version: doc.version, hash: await sha256Hex(text) };
}
