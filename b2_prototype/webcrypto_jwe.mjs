/*
 * Native Web Crypto JWE compact (A256KW + A256GCM) — the shipped record-crypto for the
 * no-bundler browser. Standard algorithms + standard RFC 7516 compact serialization, so it
 * interoperates with jose (verified by test_webcrypto_jwe_interop.mjs), without shipping the
 * ~80-file jose browser build into the page.
 *
 * Envelope: BASE64URL(header) . BASE64URL(wrappedCEK) . BASE64URL(iv) . BASE64URL(ct) . BASE64URL(tag)
 * AAD = ASCII(BASE64URL(header)) per RFC 7516 §5.1.
 *
 * Isomorphic: Node 22 + browsers via globalThis.crypto.subtle.
 */
const ALG = 'A256KW', ENC = 'A256GCM';
const te = new TextEncoder(), td = new TextDecoder();

function b64u(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(s); const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return o;
}
function subtle() { return globalThis.crypto.subtle; }

async function vkKwKey(vkBytes, usage) {
  return subtle().importKey('raw', vkBytes, { name: 'AES-KW' }, false, usage);
}

/** Encrypt an object as a compact JWE under VK. `header` extras are merged into the protected header. */
export async function jweEncrypt(vkBytes, obj, headerExtras) {
  const header = Object.assign({ alg: ALG, enc: ENC }, headerExtras || {});
  const headerB64 = b64u(te.encode(JSON.stringify(header)));
  const cek = new Uint8Array(32); globalThis.crypto.getRandomValues(cek);
  const cekKey = await subtle().importKey('raw', cek, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  const wrapped = await subtle().wrapKey('raw', cekKey, await vkKwKey(vkBytes, ['wrapKey']), 'AES-KW');
  const iv = new Uint8Array(12); globalThis.crypto.getRandomValues(iv);
  const aad = te.encode(headerB64);
  const ctAndTag = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, cekKey, te.encode(JSON.stringify(obj))));
  const tag = ctAndTag.slice(ctAndTag.length - 16);
  const ct = ctAndTag.slice(0, ctAndTag.length - 16);
  return [headerB64, b64u(wrapped), b64u(iv), b64u(ct), b64u(tag)].join('.');
}

/** Decrypt a compact JWE under VK; returns { obj, header }. Throws on bad tag / wrong key / tamper. */
export async function jweDecrypt(vkBytes, jwe) {
  const parts = String(jwe).split('.');
  if (parts.length !== 5) throw new Error('not a compact JWE');
  const [h, ek, iv, ct, tag] = parts;
  const header = JSON.parse(td.decode(unb64u(h)));
  if (header.alg !== ALG || header.enc !== ENC) throw new Error('unexpected alg/enc');
  const cekKey = await subtle().unwrapKey('raw', unb64u(ek), await vkKwKey(vkBytes, ['unwrapKey']), 'AES-KW', { name: 'AES-GCM' }, false, ['decrypt']);
  const data = new Uint8Array([...unb64u(ct), ...unb64u(tag)]);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64u(iv), additionalData: te.encode(h) }, cekKey, data);
  return { obj: JSON.parse(td.decode(pt)), header };
}
