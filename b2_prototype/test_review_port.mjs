/*
 * B2: device-side review port — edge cases vs the production algorithm.
 * Replaces the earlier "zero risk" claim with "tested-sample results match":
 * timezone (UTC+8) date rollover, missing stress_raw (未填 != 0), <3 distinct
 * dates (basic), 0 records, and window-boundary inclusion — each asserted equal
 * to src/review/review_service.js.
 *
 * Run: node b2_prototype/test_review_port.mjs
 */
import * as portable from './review_portable.mjs';
import * as server from '../src/review/review_service.js';

let pass = 0, fail = 0; const fails = [];
function eq(doc, now, name) {
  const pf = portable.computeFacts(doc, now), sf = server.computeFacts(doc, now);
  const pr = portable.buildReview(pf), sr = server.buildReview(sf);
  const okFacts = JSON.stringify(pf) === JSON.stringify(sf);
  const okRev = JSON.stringify(pr) === JSON.stringify(sr);
  const okKey = portable.reportKey(pf) === server.reportKey(sf);
  if (okFacts && okRev && okKey) { pass++; }
  else { fail++; fails.push(name + (okFacts ? '' : ' [facts]') + (okRev ? '' : ' [review]') + (okKey ? '' : ' [key]')); console.log('  ✗ ' + name); }
  return { pf, pr };
}
function assert(cond, name) { if (cond) pass++; else { fail++; fails.push(name); console.log('  ✗ ' + name); } }

const DAY = 86400000;
// Pick a "now" where UTC and local (UTC+8) fall on different calendar dates:
// 2026-10-02T17:00Z == 2026-10-03T01:00 local. Records straddle local midnight.
const NOW = Date.UTC(2026, 9, 2, 17, 0, 0);

// 1. timezone rollover: two records minutes apart but on different LOCAL dates
const tzDoc = { ins: [
  { id: 'a', ts: Date.UTC(2026, 9, 2, 15, 30), crave: 'sweet', st: { crave: 'sweet', stress_raw: 5 } }, // local 2026-10-02 23:30
  { id: 'b', ts: Date.UTC(2026, 9, 2, 16, 30), crave: 'sweet', st: { crave: 'sweet', stress_raw: 7 } }, // local 2026-10-03 00:30
  { id: 'c', ts: Date.UTC(2026, 9, 1, 2, 0), crave: 'fried', st: { crave: 'fried', stress_raw: 8 } },    // local 2026-10-01 10:00
]};
const r1 = eq(tzDoc, NOW, 'timezone: local-date rollover counted correctly');
assert(r1.pf.distinctDateCount === 3, 'timezone: 3 distinct LOCAL dates (not 2 UTC)');

// 2. missing stress_raw must NOT be treated as 0
const missDoc = { ins: [
  { id: 'a', ts: NOW - 1 * DAY, crave: 'soup', st: { crave: 'soup' } },                 // no stress_raw
  { id: 'b', ts: NOW - 2 * DAY, crave: 'soup', st: { crave: 'soup', stress_raw: 8 } },
  { id: 'c', ts: NOW - 3 * DAY, crave: 'soup', st: { crave: 'soup' } },                 // no stress_raw
]};
const r2 = eq(missDoc, NOW, 'missing stress_raw excluded from average');
assert(r2.pf.stressSampleCount === 1 && r2.pf.stressAvg === 8, 'missing stress_raw: avg from the one present value only');

// 3. fewer than 3 distinct dates -> basic kind, no personalized observation
const basicDoc = { ins: [
  { id: 'a', ts: NOW - 1000, crave: 'fried', st: { crave: 'fried', stress_raw: 9 } },
  { id: 'b', ts: NOW - 2000, crave: 'fried', st: { crave: 'fried', stress_raw: 9 } },
]};
const r3 = eq(basicDoc, NOW, '<3 distinct dates -> basic');
assert(r3.pr.kind === 'basic' && r3.pr.dataLimitation === true, 'basic: dataLimitation flagged, no over-reading');

// 4. zero records
const r4 = eq({ ins: [] }, NOW, 'empty doc');
assert(r4.pr.kind === 'basic' && r4.pf.recordCount === 0, 'empty: basic + no records');

// 5. window boundary: a record exactly 7 days old is IN, one just outside is OUT
const boundDoc = { ins: [
  { id: 'in', ts: NOW - 7 * DAY, crave: 'bbq', st: { crave: 'bbq' } },
  { id: 'out', ts: NOW - 7 * DAY - 60000, crave: 'bbq', st: { crave: 'bbq' } },
  { id: 'd2', ts: NOW - 1 * DAY, crave: 'bbq', st: { crave: 'bbq' } },
  { id: 'd3', ts: NOW - 3 * DAY, crave: 'bbq', st: { crave: 'bbq' } },
]};
const r5 = eq(boundDoc, NOW, 'window boundary inclusion');
assert(r5.pf.recordCount === 3, 'boundary: 7-day-old in, older out');

// 6. future ts ignored (> now)
const futDoc = { ins: [
  { id: 'f', ts: NOW + DAY, crave: 'sweet', st: { crave: 'sweet' } },
  { id: 'a', ts: NOW - 1 * DAY, crave: 'sweet', st: { crave: 'sweet' } },
  { id: 'b', ts: NOW - 2 * DAY, crave: 'sweet', st: { crave: 'sweet' } },
  { id: 'c', ts: NOW - 3 * DAY, crave: 'sweet', st: { crave: 'sweet' } },
]};
const r6 = eq(futDoc, NOW, 'future ts excluded');
assert(r6.pf.recordCount === 3, 'future ts not counted');

console.log('\nReview port edge cases: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
process.exit(0);
