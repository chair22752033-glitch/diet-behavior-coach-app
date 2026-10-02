/*
 * Phase B step 3｜E2EE sync override (shipped, gated).
 *
 * When an account is in crypto_mode='e2ee_only', this REPLACES the app's global cloudPush /
 * cloudPull so sync goes to the ciphertext store (/api/e2ee/records) with client-side
 * encrypt/decrypt, instead of the plaintext /api/sync. It also runs the 7-day review on the
 * device. Non-e2ee accounts never call this (bootstrap only installs it when e2ee_only), so
 * plaintext users are completely unaffected.
 *
 * Record model: ins -> kind 'ins', quest entries -> kind 'quest', everything else (scalars
 * like ft/identity/dims) -> one kind 'root' record. Records are mostly immutable; revisionId
 * is a content hash, so re-sending is idempotent; a changed record retries with the server's
 * current revision (CAS).
 */
import { jweEncrypt, jweDecrypt } from './webcrypto_jwe.mjs';
import { computeFacts, buildReview, reportKey } from './review_portable.mjs';

function djb2(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36); }
function revOf(obj) { return 'h' + djb2(JSON.stringify(obj)); }

async function putRecord(ctx, kind, recordId, obj) {
  const rid = String(recordId).slice(0, 128);
  const rev = revOf(obj);
  const env = await jweEncrypt(ctx.vk, obj, { ver: 'dms-e2ee-1', vault_id: ctx.vaultId, rid, rev, epoch: ctx.epoch, use: 'record' });
  async function post(baseRevision) {
    const r = await fetch('/api/e2ee/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, recordId: rid, baseRevision, revisionId: rev, envelope: env }) });
    return { status: r.status, j: await r.json().catch(() => null) };
  }
  let res = await post(null);
  if (res.j && res.j.error === 'conflict') {
    // record changed since last pull: retry against the server's current revision
    res = await post(res.j.currentRevision || null);
  }
  return !!(res.j && res.j.ok);
}

export function installE2eeSync(ctx) {
  // ctx = { vk (Uint8Array), vaultId, epoch }
  window.__DMS_E2EE = { on: true, ctx };

  window.cloudPush = function (d, cb) {
    d = (d && typeof d === 'object') ? d : { ins: [] };
    (async () => {
      try {
        const ins = Array.isArray(d.ins) ? d.ins : [];
        const quest = (d.quest && Array.isArray(d.quest.entries)) ? d.quest.entries : [];
        const scalars = {}; for (const k in d) { if (k !== 'ins' && k !== 'quest') scalars[k] = d[k]; }
        let okAll = true;
        for (let i = 0; i < ins.length; i++) { const r = ins[i]; const id = (r && r.id) ? r.id : ('ins_' + i); okAll = (await putRecord(ctx, 'ins', id, r)) && okAll; }
        for (let i = 0; i < quest.length; i++) { const r = quest[i]; const id = (r && r.id) ? r.id : ('quest_' + i); okAll = (await putRecord(ctx, 'quest', id, r)) && okAll; }
        okAll = (await putRecord(ctx, 'root', 'scalars', scalars)) && okAll;
        if (cb) cb(okAll);
      } catch (e) { if (cb) cb(false); }
    })();
  };

  window.cloudPull = function (cb) {
    (async () => {
      try {
        const r = await fetch('/api/e2ee/records', { headers: { 'Accept': 'application/json' } });
        const j = await r.json().catch(() => null);
        if (!j || !j.ok) { if (cb) cb(false); return; }
        const doc = { ins: [], quest: { entries: [] } };
        for (const rec of (j.records || [])) {
          let dec; try { dec = await jweDecrypt(ctx.vk, rec.envelope); } catch (e) { continue; }
          const obj = dec.obj;
          if (rec.kind === 'ins') doc.ins.push(obj);
          else if (rec.kind === 'quest') doc.quest.entries.push(obj);
          else if (rec.kind === 'root' && obj && typeof obj === 'object') { for (const k in obj) { if (k !== 'ins' && k !== 'quest') doc[k] = obj[k]; } }
        }
        const merged = (typeof window.mergeData === 'function' && typeof window.ld === 'function') ? window.mergeData(window.ld(), doc) : doc;
        try { localStorage.setItem(window.SK || 'diet_app_v1', JSON.stringify(merged)); } catch (e) { if (cb) cb(false); return; }
        // write back any locally-merged records as ciphertext (keeps both devices converged)
        window.cloudPush(merged, function () { if (cb) cb(true); });
      } catch (e) { if (cb) cb(false); }
    })();
  };

  // device-side 7-day review: decrypt ins, compute locally (server never sees plaintext)
  window.__dmsDeviceReview = async function (nowMs) {
    const r = await fetch('/api/e2ee/records?kind=ins', { headers: { 'Accept': 'application/json' } });
    const j = await r.json().catch(() => null);
    const ins = [];
    for (const rec of ((j && j.records) || [])) { try { const d = await jweDecrypt(ctx.vk, rec.envelope); ins.push(d.obj); } catch (e) {} }
    const facts = computeFacts({ ins }, nowMs);
    return { review: buildReview(facts), key: reportKey(facts), facts };
  };
}
