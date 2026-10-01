/*
 * Phase 9｜7 日飲食行為回顧 — 確定性計算層（Premium 第一個付費功能）
 *
 * 規格（來自產品決策）：輸出固定三段
 *   1) 這週實際記錄了什麼：記錄天數、次數、資料範圍，標示缺漏。
 *   2) 一個值得留意的模式：只從可追溯紀錄歸納，區分「觀察 / 可能解釋 / 不確定」。
 *   3) 下週一個小行動：由觀察延伸的溫和建議，使用者可選擇是否嘗試。
 *
 * 嚴格界線（誠實、不過度解讀）：
 *   - 不把「選了某道食物 / 某個 crave」推論為確定的心理需求、診斷或營養缺乏。
 *   - 未填寫不等於 0；次數少不支持穩定趨勢結論。
 *   - 至少 3 個不同日期才產生個人化觀察，否則只給基本摘要 + 資料不足說明。
 *
 * 資料來源：使用者已同步到 D1 的 `ins`（每日 check-in）紀錄，每筆形如
 *   { id, ts, st:{ energy, sleep, stress, stress_raw, social, move, crave }, beh, crave }
 * （占卜 meals 目前未同步到 D1，故本版回顧不含 meals——為誠實聲明的已知限制。）
 *
 * 全部為純函式、確定性（同輸入同輸出），不呼叫任何網路/AI。Gemini 增強是
 * 另一個「預設關閉」的 adapter（見 gemini_review_adapter.js），本層不依賴它。
 */

export const REVIEW_WINDOW_DAYS = 7;
export const REVIEW_MIN_DISTINCT_DATES = 3;
export const REVIEW_MODEL_VERSION = 'det-v1';
// Asia/Taipei 固定 UTC+8（台灣無日光節約），用固定偏移把 ts 歸到當地日期。
const TZ_OFFSET_MINUTES = 8 * 60;

const CRAVE_LABELS = Object.freeze({
  fried: '炸物', sweet: '甜食', soup: '湯／熱食', fresh: '清爽蔬食',
  conv: '超商', yeshi: '夜市小吃', bbq: '燒烤', fastfood: '速食', any: '隨意'
});

function localDateKey(ts) {
  // 回傳當地（UTC+8）YYYY-MM-DD
  const d = new Date(Number(ts) + TZ_OFFSET_MINUTES * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function isFiniteNum(v) {
  return typeof v === 'number' && isFinite(v);
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return ('00000000' + h.toString(16)).slice(-8);
}

/**
 * 從同步文件計算確定性事實。
 * @param {{ins?:Array}} doc - getSyncDoc 回傳的 doc
 * @param {number} nowMs - 當下時間（ms），可注入以利測試
 * @returns {object} facts
 */
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
    // stress_raw 是 1-10；只在真的有填時納入（未填 != 0）
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

/** 資料指紋：資料改變才變（供快取 key / idempotency） */
export function dataSignature(facts) {
  return djb2([facts.recordCount, facts.distinctDateCount, facts.latestTs, facts.craveTotal].join(':'));
}

/** 穩定的報告 key：同視窗 + 同資料 + 同模型版本 → 同 key（重看不重算、不重複扣配額） */
export function reportKey(facts, modelVersion) {
  return [facts.windowStartKey, facts.windowEndKey, dataSignature(facts), modelVersion || REVIEW_MODEL_VERSION].join('|');
}

function craveLabel(key) {
  return CRAVE_LABELS[key] || key;
}

/**
 * 組出回顧內容（確定性、不呼叫 AI）。
 * @returns {{kind:'basic'|'personalized', dataLimitation:boolean, summary:object, observation:object|null, action:object|null, facts:object}}
 */
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

  // 資料不足：只給基本摘要 + 明確的資料限制說明（不產生個人化觀察）
  if (facts.distinctDateCount < REVIEW_MIN_DISTINCT_DATES) {
    return {
      kind: 'basic',
      dataLimitation: true,
      summary,
      observation: null,
      action: null,
      facts
    };
  }

  // 個人化觀察（只從可追溯紀錄歸納，明確區分觀察 / 可能解釋 / 不確定）
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

  // 一個小行動（溫和、可選、不命令）
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
