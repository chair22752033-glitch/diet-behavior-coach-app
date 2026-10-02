/*
 * Brick 3 core: drive the shipped e2ee_sync.mjs override in real Chromium.
 * Trusted-device unlock -> installE2eeSync -> cloudPush encrypts to a stubbed ciphertext
 * store -> cloudPull decrypts + rebuilds localStorage -> device review. Verifies ciphertext
 * only + correct round-trip. (Non-e2ee accounts never run this; it's gated in the app.)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import pkg from '/home/user/diet-behavior-coach-app/node_modules/playwright/index.js';
const { chromium } = pkg;

const LIB = '/home/user/diet-behavior-coach-app/public/ui-assets/lib';
const TEST_HTML = `<!doctype html><meta charset=utf-8><body><script type="module">
import {createVaultLocal, trustDevice} from '/ui-assets/lib/vault_keys.mjs';
import {installE2eeSync} from '/ui-assets/lib/e2ee_sync.mjs';
import {jweDecrypt} from '/ui-assets/lib/webcrypto_jwe.mjs';
(async()=>{const R={};try{
 window.SK='diet_app_v1';
 window.ld=()=>{try{return JSON.parse(localStorage.getItem(window.SK))||{ins:[]};}catch(e){return {ins:[]};}};
 window.mergeData=(l,r)=>r;
 const store=[]; const realFetch=window.fetch.bind(window);
 window.fetch=async(url,opt)=>{const s=String(url);
  if(s.indexOf('/api/e2ee/records')>-1){
   if(opt&&opt.method==='POST'){const b=JSON.parse(opt.body);const i=store.findIndex(x=>x.kind===b.kind&&x.recordId===b.recordId);const row={kind:b.kind,recordId:b.recordId,revisionId:b.revisionId,envelope:b.envelope,seq:store.length+1};if(i>=0)store[i]=row;else store.push(row);return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});}
   const u=new URL(s,location.href);const kind=u.searchParams.get('kind');const recs=kind?store.filter(x=>x.kind===kind):store;return new Response(JSON.stringify({ok:true,records:recs}),{status:200,headers:{'content-type':'application/json'}});
  }
  return realFetch(url,opt);
 };
 const v=await createVaultLocal(); await trustDevice(v.vaultId,v.vk);
 installE2eeSync({vk:v.vk,vaultId:v.vaultId,epoch:1});
 const doc={ins:[{id:'ins_0',ts:1,crave:'fried',st:{crave:'fried'},note:'宵夜'},{id:'ins_1',ts:2,crave:'sweet',st:{crave:'sweet'}}],quest:{entries:[{id:'q_0',k:1}]},ft:false,identity:'self'};
 R.pushed=await new Promise(res=>window.cloudPush(doc,res));
 R.stored=store.length; R.kinds=store.map(x=>x.kind).sort().join(','); R.allJWE=store.every(x=>x.envelope.split('.').length===5);
 const insRow=store.find(x=>x.kind==='ins'&&x.recordId==='ins_0'); const d=await jweDecrypt(v.vk,insRow.envelope); R.insMatch=(d.obj.crave==='fried'&&d.obj.note==='宵夜');
 const rootRow=store.find(x=>x.kind==='root'); const dr=await jweDecrypt(v.vk,rootRow.envelope); R.rootOK=(dr.obj.identity==='self'&&dr.obj.ft===false&&!('ins' in dr.obj));
 localStorage.removeItem(window.SK);
 R.pulled=await new Promise(res=>window.cloudPull(res));
 const back=JSON.parse(localStorage.getItem(window.SK)); R.pullIns=back.ins.length; R.pullIdentity=back.identity;
 const rev=await window.__dmsDeviceReview(Date.now()); R.reviewKind=rev.review.kind;
}catch(e){R.err=e.message;} window.__R=R;})();
</script></body>`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(TEST_HTML); return; }
  if (u.startsWith('/ui-assets/lib/')) { try { const b = fs.readFileSync(LIB + u.slice('/ui-assets/lib'.length)); res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(b); return; } catch { res.writeHead(404); res.end('nf'); return; } }
  res.writeHead(404); res.end('nf');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
await page.waitForFunction('window.__R !== undefined', { timeout: 15000 });
const R = await page.evaluate('window.__R');
await browser.close(); server.close();

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + ' :: ' + JSON.stringify(R)); } };
ok(!R.err, 'no error (' + (R.err || '') + ')');
ok(errs.length === 0, 'no page errors');
ok(R.pushed === true, 'cloudPush succeeded');
ok(R.stored === 4, 'stored 4 ciphertext records (ins x2, quest, root)');
ok(R.kinds === 'ins,ins,quest,root', 'kinds = ins,ins,quest,root');
ok(R.allJWE === true, 'all stored records are compact JWE');
ok(R.insMatch === true, 'ins_0 decrypts to original');
ok(R.rootOK === true, 'root record holds scalars (identity/ft), not ins');
ok(R.pulled === true, 'cloudPull succeeded');
ok(R.pullIns === 2, 'pull rebuilt localStorage with 2 ins');
ok(R.pullIdentity === 'self', 'pull restored scalar identity');
ok(R.reviewKind === 'basic', 'device review ran (basic for <3 distinct dates)');

console.log('\ne2ee sync override: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
