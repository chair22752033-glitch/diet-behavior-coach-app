/*
 * Phase 9｜7 日回顧的 Gemini 增強 adapter —— 預設「關閉」。
 *
 * ⚠️ 本輪產品決策：確定性回顧先上，Gemini 先關著。本檔案寫好但不被呼叫。
 *
 * 啟用前「必須」先完成（否則不得開啟，涉及條款與個資風險）：
 *   1. 核對 Gemini API 附加條款（https://ai.google.dev/gemini-api/terms）：
 *      - 禁止醫療用途；本功能用語已避免診斷，但仍須確認定位。
 *      - 免費方案不得送入個人／敏感／機密資料；個人化回顧屬個人資料，
 *        需確認使用「付費方案」且資料處理條款相符。
 *      - 若受眾包含未成年人，需確認可用部署方案（勾選框不等於合規）。
 *   2. 確認帳單（billing）與用量上限、逾時與重試、輸出品質驗證。
 *   3. 確認傳給模型的是「最小化事實摘要」，不含直接識別資訊與原始日記文字。
 *
 * 雙重關閉條件（兩者皆成立才會啟用）：
 *   - env.GEMINI_REVIEW_ENABLED === 'true'（明確旗標，預設不存在）
 *   - env.GEMINI_API_KEY 存在
 * 預設兩者皆無 → isEnabled() 回 false → 回顧完全走確定性路徑。
 */

export function isEnabled(env) {
  if (!env) return false;
  return env.GEMINI_REVIEW_ENABLED === 'true' && typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.length > 0;
}

/**
 * 把 facts 壓成「最小化、去識別」的摘要，作為送模型的唯一輸入。
 * 不含 user_id、原始 ts、原始日記文字——只有彙總數字與類別。
 */
export function minimizeFacts(facts) {
  return {
    window_days: facts.windowDays,
    recorded_days: facts.distinctDateCount,
    record_count: facts.recordCount,
    top_crave: facts.topCrave || null,
    top_crave_count: facts.topCraveCount || 0,
    crave_total: facts.craveTotal || 0,
    stress_avg: facts.stressAvg
  };
}

/**
 * 呼叫 Gemini 產生「解讀文字」。本輪不會被呼叫（isEnabled 回 false）。
 * 回傳 { ok, explanation } 或 { ok:false, reason }。呼叫端在失敗時必須
 * 保留確定性摘要（不可因 AI 失敗而讓整個回顧壞掉）。
 */
export async function enhanceReview(facts, env, options) {
  if (!isEnabled(env)) return { ok: false, reason: 'disabled' };
  const minimized = minimizeFacts(facts);
  const timeoutMs = (options && options.timeoutMs) || 8000;
  const model = (options && options.model) || 'gemini-2.5-flash';
  const prompt =
    '你是一個溫和的飲食行為陪伴者。以下是某人最近的「彙總統計」（非原始資料）：\n' +
    JSON.stringify(minimized) +
    '\n請用繁體中文寫 2-3 句「幫助理解、不是取代健康判斷」的觀察。' +
    '不要診斷、不要宣稱營養缺乏、不要斷定心理需求；用「可能」「或許」等保留語氣。';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + env.GEMINI_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, reason: 'http_' + resp.status };
    const data = await resp.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      && data.candidates[0].content.parts[0].text;
    if (typeof text !== 'string' || text.trim().length === 0) return { ok: false, reason: 'empty' };
    return { ok: true, explanation: text.trim() };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'error' };
  }
}
