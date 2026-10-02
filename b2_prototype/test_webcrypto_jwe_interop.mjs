/*
 * Proves the native-Web-Crypto JWE (webcrypto_jwe.mjs) is REAL RFC 7516 JWE:
 * it interoperates with jose both ways, round-trips, and rejects tamper/wrong-key/wrong-ctx.
 *
 * Run: node b2_prototype/test_webcrypto_jwe_interop.mjs
 */
import { jweEncrypt, jweDecrypt } from './webcrypto_jwe.mjs';
import { CompactEncrypt, compactDecrypt } from 'jose';

let pass = 0, fail = 0; const fails = [];
const ok = (c, n) => { if (c) pass++; else { fail++; fails.push(n); console.log('  ✗ ' + n); } };
async function thr(fn, n) { try { await fn(); fail++; fails.push(n + ' (no throw)'); } catch { pass++; } }
const td = new TextDecoder(), te = new TextEncoder();

function vk() { const b = new Uint8Array(32); globalThis.crypto.getRandomValues(b); return b; }

async function main() {
  const key = vk();
  const rec = { id: 'ins_0', ts: 1759400000000, st: { crave: 'fried', stress_raw: 8 }, note: '宵夜炸雞' };
  const hdr = { ver: 'dms-e2ee-1', vault_id: 'v_x', rid: 'ins_0', rev: 'r1', epoch: 1, use: 'record' };

  // 1. native round-trip
  const jwe = await jweEncrypt(key, rec, hdr);
  ok(jwe.split('.').length === 5, 'native produces 5-part compact JWE');
  const back = await jweDecrypt(key, jwe);
  ok(JSON.stringify(back.obj) === JSON.stringify(rec), 'native round-trip');
  ok(back.header.rid === 'ins_0' && back.header.use === 'record', 'protected header preserved');

  // 2. jose can decrypt what native produced (proves it is real JWE)
  const jd = await compactDecrypt(jwe, key);
  ok(JSON.stringify(JSON.parse(td.decode(jd.plaintext))) === JSON.stringify(rec), 'jose decrypts native JWE');
  ok(jd.protectedHeader.vault_id === 'v_x' && jd.protectedHeader.alg === 'A256KW', 'jose sees the protected header');

  // 3. native can decrypt what jose produced
  const joseJwe = await new CompactEncrypt(te.encode(JSON.stringify(rec)))
    .setProtectedHeader({ alg: 'A256KW', enc: 'A256GCM', ver: 'dms-e2ee-1', vault_id: 'v_x', rid: 'ins_0', rev: 'r1', epoch: 1, use: 'record' })
    .encrypt(key);
  const nd = await jweDecrypt(key, joseJwe);
  ok(JSON.stringify(nd.obj) === JSON.stringify(rec), 'native decrypts jose JWE');

  // 4. integrity
  const other = vk();
  await thr(() => jweDecrypt(other, jwe), 'wrong key rejected');
  const segs = jwe.split('.'); segs[3] = segs[3].slice(0, -2) + (segs[3].slice(-2) === 'AA' ? 'BB' : 'AA');
  await thr(() => jweDecrypt(key, segs.join('.')), 'tampered ciphertext rejected');
  const segsH = jwe.split('.'); // tamper header -> AAD mismatch
  const h = JSON.parse(td.decode(Buffer.from(segsH[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64')));
  h.vault_id = 'v_evil';
  segsH[0] = Buffer.from(JSON.stringify(h)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await thr(() => jweDecrypt(key, segsH.join('.')), 'tampered header (AAD) rejected');

  console.log('\n──────────────────────────────');
  console.log('webcrypto JWE interop: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
