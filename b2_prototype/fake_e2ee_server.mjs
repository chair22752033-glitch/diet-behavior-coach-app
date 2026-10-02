/*
 * B2 prototype — fake E2EE server + in-memory DB (ISOLATED).
 *
 * Models the server side AFTER GPT's §4 data-flow change:
 *   - sync_records.payload holds ONLY a JWE envelope (opaque ciphertext).
 *   - The server validates ownership, size, format(=JWE shape), and revision (CAS);
 *     all business-content validation moves to the device.
 *   - The server NEVER decrypts and holds no key that can decrypt content.
 *   - Per account there is one vault record (recovery-wrapped VK + salt), per GPT §5.3.
 *
 * It deliberately has NO access to VK/CEK/recovery code — proving the "database leak /
 * backend-read" threat is mitigated for migrated content (GPT §3.2).
 */

const MAX_ENVELOPE_BYTES = 12000; // JWE overhead over the 8000-byte plaintext cap
const RECORD_KINDS = ['ins', 'quest', 'review', 'health_insight']; // 4 private stores (B1 finding)

function isCompactJWE(s) {
  // 5 base64url segments separated by '.', none empty. We check shape only — never decode.
  return typeof s === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s);
}

export class FakeE2EEServer {
  constructor() { this.accounts = new Map(); this._seq = 0; }

  _acct(userId) {
    if (!userId || typeof userId !== 'string') throw new Error('missing owner');
    if (!this.accounts.has(userId)) {
      this.accounts.set(userId, { crypto_mode: 'legacy', vault: null, records: new Map(), deviceWraps: new Map() });
    }
    return this.accounts.get(userId);
  }

  /* ---- vault (one per account; §5.3 single-vault constraint) ---- */
  putVaultRecord(userId, serverVaultRecord) {
    const a = this._acct(userId);
    if (a.vault) return { ok: false, reason: 'vault_exists' }; // no silent overwrite across two first-time activations
    a.vault = serverVaultRecord;
    a.crypto_mode = 'e2ee_only';
    return { ok: true };
  }
  getVaultRecord(userId) {
    const a = this._acct(userId);
    return a.vault ? { ok: true, vault: a.vault } : { ok: false, reason: 'no_vault' };
  }

  /* ---- trusted-device wrap storage (device-local in reality; kept here only to
          prove device A's wrap is useless to device B — the server stores the wrapped
          blob but has no device key, and B2 asserts B cannot unlock from it) ---- */
  putDeviceWrap(userId, deviceId, wrappedVkByDevice) {
    const a = this._acct(userId);
    a.deviceWraps.set(deviceId, wrappedVkByDevice);
    return { ok: true };
  }
  getDeviceWrap(userId, deviceId) {
    const a = this._acct(userId);
    const w = a.deviceWraps.get(deviceId);
    return w ? { ok: true, wrap: w } : { ok: false, reason: 'no_device_wrap' };
  }

  /* ---- record envelopes (CAS on revision) ---- */
  putRecord(userId, { kind, recordId, baseRevision = null, revisionId, envelope }) {
    const a = this._acct(userId);
    if (!RECORD_KINDS.includes(kind)) return { ok: false, reason: 'bad_kind' };
    if (typeof recordId !== 'string' || recordId.length < 1 || recordId.length > 128) return { ok: false, reason: 'bad_record_id' };
    if (!isCompactJWE(envelope)) return { ok: false, reason: 'not_ciphertext' };     // reject plaintext outright
    if (envelope.length > MAX_ENVELOPE_BYTES) return { ok: false, reason: 'too_large' };
    if (typeof revisionId !== 'string' || !revisionId) return { ok: false, reason: 'bad_revision' };

    const key = kind + ':' + recordId;
    const cur = a.records.get(key);
    if (cur) {
      if (cur.revisionId === revisionId) return { ok: true, idempotent: true };       // idempotent replay
      if (baseRevision !== cur.revisionId) return { ok: false, reason: 'conflict', currentRevision: cur.revisionId };
    } else {
      if (baseRevision !== null) return { ok: false, reason: 'conflict', currentRevision: null };
    }
    a.records.set(key, { kind, recordId, revisionId, envelope, seq: ++this._seq });
    return { ok: true, idempotent: false };
  }

  listEnvelopes(userId, kind) {
    const a = this._acct(userId);
    const out = [];
    for (const r of a.records.values()) {
      if (kind && r.kind !== kind) continue;
      out.push({ kind: r.kind, recordId: r.recordId, revisionId: r.revisionId, envelope: r.envelope, seq: r.seq });
    }
    return out.sort((x, y) => x.seq - y.seq); // server orders by opaque seq, not by any plaintext ts
  }

  cryptoMode(userId) { return this._acct(userId).crypto_mode; }

  /* ---- leak scanner: everything the server physically stores, flattened to one string ---- */
  dumpAll() {
    const parts = [];
    for (const [uid, a] of this.accounts) {
      parts.push('user=' + uid, 'mode=' + a.crypto_mode);
      if (a.vault) parts.push(JSON.stringify(a.vault));
      for (const w of a.deviceWraps.values()) parts.push(String(w));
      for (const r of a.records.values()) parts.push(r.kind, r.recordId, r.revisionId, r.envelope);
    }
    return parts.join('\u0001');
  }
}
