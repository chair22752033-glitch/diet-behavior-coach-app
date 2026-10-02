/*
 * C-stage prototype — consent API handler (ISOLATED; NOT mounted in src/worker.js).
 *
 * A fetch-style handler for the consent flow, kept environment-agnostic:
 *   - documents are injected (no fs import), so it runs in Node tests and could later
 *     run in a Worker with documents served from static assets;
 *   - the account id is resolved via an injected resolveUserId(request) — in this
 *     prototype a test header; PRODUCTION MUST replace this with the real session lookup
 *     (getCurrentUser). Never trust a client header for identity in production.
 *
 * Routes (prefixed /c/ so they can never collide with real routes):
 *   GET  /c/consent/documents              -> list registered doc versions (no content)
 *   GET  /c/consent/document?type&version  -> one doc: title, status, hash, content
 *   POST /c/consent  {purpose,docType,docVersion,action,sourceScreen,orderId?}
 *   GET  /c/consent/status?purpose&type&version -> { active, reason }
 */
import { registerDocumentVersion, recordConsent, hasActiveConsent, CONSENT_ACTIONS } from './consent_store.mjs';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/**
 * @param {object} opts
 * @param {object} opts.db                 real D1 (env.DIET_COACH_DB)
 * @param {Array}  opts.documents          [{docType, version, title, status, content, contentSha256}]
 * @param {(req:Request)=>(string|null)} opts.resolveUserId
 */
export function createConsentApi({ db, documents, resolveUserId }) {
  const byKey = new Map(documents.map((d) => [d.docType + '@' + d.version, d]));

  async function registerAll() {
    for (const d of documents) {
      const r = await registerDocumentVersion(db, { docType: d.docType, version: d.version, contentSha256: d.contentSha256 });
      if (!r.ok) return { ok: false, reason: r.reason, doc: d.docType + '@' + d.version };
    }
    return { ok: true };
  }

  async function handle(request) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (request.method === 'GET' && p === '/c/consent/documents') {
      return json({ ok: true, documents: documents.map((d) => ({ docType: d.docType, version: d.version, title: d.title, status: d.status, contentSha256: d.contentSha256 })) });
    }

    if (request.method === 'GET' && p === '/c/consent/document') {
      const d = byKey.get(url.searchParams.get('type') + '@' + url.searchParams.get('version'));
      if (!d) return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: true, docType: d.docType, version: d.version, title: d.title, status: d.status, contentSha256: d.contentSha256, content: d.content });
    }

    if (request.method === 'POST' && p === '/c/consent') {
      const userId = resolveUserId(request);
      if (!userId) return json({ ok: false, error: 'unauthenticated' }, 401);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
      if (!CONSENT_ACTIONS.includes(body.action)) return json({ ok: false, error: 'bad_action' }, 400);
      const r = await recordConsent(db, {
        userId, purpose: body.purpose, docType: body.docType, docVersion: body.docVersion,
        action: body.action, sourceScreen: body.sourceScreen, orderId: body.orderId || null,
      });
      if (!r.ok) return json({ ok: false, error: r.reason }, 400);
      return json({ ok: true, eventId: r.eventId });
    }

    if (request.method === 'GET' && p === '/c/consent/status') {
      const userId = resolveUserId(request);
      if (!userId) return json({ ok: false, error: 'unauthenticated' }, 401);
      const r = await hasActiveConsent(db, userId, url.searchParams.get('purpose'), {
        docType: url.searchParams.get('type'), requiredVersion: url.searchParams.get('version'),
      });
      return json({ ok: true, active: !!r.active, reason: r.reason || null });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  }

  return { handle, registerAll };
}
