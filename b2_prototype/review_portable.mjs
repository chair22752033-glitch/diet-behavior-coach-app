/*
 * B2 prototype — portable (device-side) 7-day review.
 *
 * Under E2EE the server can no longer read `ins` plaintext, so the review must run on
 * the user's device. These are the SAME deterministic pure functions as the production
 * src/review/review_service.js; B2 verifies byte-for-byte output equality against that
 * module on identical plaintext (acceptance: "回顧結果一致").
 *
 * This file is a line-for-line port. The B2 test imports BOTH this and the production
 * module and asserts deep equality, so any future drift is caught.
 */
export const REVIEW_WINDOW_DAYS = 7;
export const REVIEW_MIN_DISTINCT_DATES = 3;
export const REVIEW_MODEL_VERSION = 'det-v1';
const TZ_OFFSET_MINUTES = 8 * 60;

const CRAVE_LABELS = Object.freeze({
  fried: '炸物', sweet: '甜食', soup: '湯／熱食', fresh: '清爽蔬食',
  conv: '超商', yeshi: '夜市小吃', bbq: '燒烤', fastfood: '速食', any: '隨意'
});

function localDateKey(ts) {
  const d = new Date(Number(ts) + TZ_OFFSET_MINUTES * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return ('00000000' + h.toString(16)).slice(-8);
}

export function computeFacts(doc, nowMs) {
  const now = isFiniteNum(nowMs) ? nowMs : Date.now();
  const windowMs = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const windowStartMs = now - windowMs;
  const ins = (doc && Array.isArray(doc.ins)) ? doc.ins : [];
  const inWindow = ins.filter((r) => r && isFiniteNum(Number(r.ts)) && Number(r.ts) >= windowStartMs && Number(r.ts) <= now);
  const dateSet = {};
  const craveCounts = {};
  let craveTotal = 0;
  const stressVals = [];
  let latestTs = 0;
  inWindow.forEach((r) => {
    const ts = Number(r.ts);
    if (ts > latestTs) latestTs = ts;
    dateSet[localDateKey(ts)] = true;
    const st = (r.st && typeof r.st === 'object') ? r.st : {};
    const crave = r.crave || st.crave;
    if (typeof crave === 'string' && crave.length) {
      craveCounts[crave] = (craveCounts[crave] || 0) + 1;
      craveTotal++;
    }
    if (isFiniteNum(st.stress_raw)) stressVals.push(st.stress_raw);
  });
  const distinctDates = Object.keys(dateSet).sort();
  const topCrave = Object.keys(craveCounts).sort((a, b) => craveCounts[b] - craveCounts[a])[0] || null;
  return {
    windowDays: REVIEW_WINDOW_DAYS,
    windowStartKey: localDateKey(windowStartMs),
    windowEndKey: localDateKey(now),
    recordCount: inWindow.length,
    distinctDateCount: distinctDates.length,
    distinctDates,
    craveCounts,
    craveTotal,
    topCrave,
    topCraveCount: topCrave ? craveCounts[topCrave] : 0,
    stressSampleCount: stressVals.length,
    stressAvg: stressVals.length ? Math.round((stressVals.reduce((a, b) => a + b, 0) / stressVals.length) * 10) / 10 : null,
    latestTs
  };
}
export function dataSignature(facts) {
  return djb2([facts.recordCount, facts.distinctDateCount, facts.latestTs, facts.craveTotal].join(':'));
}
export function reportKey(facts, modelVersion) {
  return [facts.windowStartKey, facts.windowEndKey, dataSignature(facts), modelVersion || REVIEW_MODEL_VERSION].join('|');
}
function craveLabel(key) { return CRAVE_LABELS[key] || key; }

export function buildReview(facts) {
  const summary = {
    text: '最近 ' + facts.windowDays + ' 天（' + facts.windowStartKey + ' ~ ' + facts.windowEndKey + '），你在 '
      + facts.distinctDateCount + ' 天留下了 ' + facts.recordCount + ' 次記錄。',
    recordedDays: facts.distinctDateCount,
    recordCount: facts.recordCount,
    rangeStart: facts.windowStartKey,
    rangeEnd: facts.windowEndKey,
    missingNote: facts.recordCount === 0
      ? '這段期間沒有找到記錄；先累積幾天，回顧會更有依據。'
      : (facts.distinctDateCount < facts.windowDays ? '有些日子沒有記錄——缺漏的天數不代表沒發生，只是沒資料。' : '')
  };
  if (facts.distinctDateCount < REVIEW_MIN_DISTINCT_DATES) {
    return { kind: 'basic', dataLimitation: true, summary, observation: null, action: null, facts };
  }
  let observation = null;
  if (facts.topCrave && facts.topCraveCount >= 2) {
    const pct = facts.craveTotal ? Math.round((facts.topCraveCount / facts.craveTotal) * 100) : 0;
    observation = {
      pattern: '這幾天你最常被「' + craveLabel(facts.topCrave) + '」吸引（' + facts.topCraveCount + ' 次，約佔記錄的 ' + pct + '%）。',
      maybe: facts.stressAvg != null && facts.stressAvg >= 6
        ? '可能的解釋之一：這段期間你記錄的壓力平均偏高（約 ' + facts.stressAvg + '／10），壓力與想吃特定食物有時相關。'
        : '這是你記錄下來的傾向，背後原因可能很多種。',
      uncertain: '這只是從少量記錄看到的傾向，不是結論，也不代表任何健康判斷。'
    };
  } else {
    observation = {
      pattern: '這幾天的記錄還沒有出現明顯集中的食物傾向。',
      maybe: '可能是你的選擇本來就多元，也可能是記錄次數還不夠多。',
      uncertain: '再多記錄幾天，模式會更清楚。'
    };
  }
  let action = null;
  if (facts.topCrave && facts.topCraveCount >= 2) {
    action = {
      text: '下週可以留意一下：當你又想吃「' + craveLabel(facts.topCrave) + '」時，當下的心情和情境是什麼。只是觀察，不用改變什麼。',
      optional: true
    };
  } else {
    action = {
      text: '下週試著在用餐前花 10 秒記一下當下的狀態，累積一點資料，下次回顧會更貼近你。',
      optional: true
    };
  }
  return { kind: 'personalized', dataLimitation: false, summary, observation, action, facts };
}
