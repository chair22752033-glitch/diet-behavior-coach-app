/*
 * Phase 6 TASK 1.121｜Gemini Enhancement Layer - Gemini Client
 *
 * 責任：唯一允許出現「真正呼叫Gemini API」的地方——純粹的HTTP
 * client，不知道Health Insight/Product Response長怎樣，只知道
 * 「送一段prompt文字過去，拿一段原始文字回來」。
 *
 * 刻意讓`fetch`可以被注入（`options.fetchImpl`）——Cloudflare
 * Workers執行環境本身就有全域`fetch`，這裡預設使用它，但測試環境
 * 不能依賴真正的網路（延續整個系列「測試不能打真正的外部服務」的
 * 既有慣例），呼叫端（`gemini_provider.js`/測試）可以注入假的
 * fetchImpl，或直接置換全域`fetch`。
 *
 * 這個檔案完全不做Input/Output Boundary的過濾——組prompt跟過濾
 * Gemini回應是`gemini_provider.js`的責任，這裡只負責「怎麼打這支
 * API、怎麼安全地把HTTP/網路層的各種失敗轉成穩定的{ok,reason}」。
 */

const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_TIMEOUT_MS = 8000;

function extractTextFromGeminiResponse(json) {
  try {
    const candidates = json && Array.isArray(json.candidates) ? json.candidates : [];
    const first = candidates[0];
    const parts = first && first.content && Array.isArray(first.content.parts) ? first.content.parts : [];
    const text = parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
    return text;
  } catch (e) {
    return null;
  }
}

/**
 * @param {string} apiKey
 * @param {string} prompt
 * @param {object} [options] - {fetchImpl, model, endpointBase, timeoutMs}
 * @returns {Promise<{ok:true, rawText:string}|{ok:false, reason:string}>}
 *   reason 可能是 'missing_api_key' | 'missing_prompt' |
 *   'fetch_unavailable' | 'network_error' | 'timeout' | 'http_error' |
 *   'invalid_response_shape'
 */
export async function callGeminiApi(apiKey, prompt, options) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const fetchImpl = safeOptions.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const model = safeOptions.model || DEFAULT_MODEL;
  const endpointBase = safeOptions.endpointBase || DEFAULT_ENDPOINT_BASE;
  const timeoutMs = typeof safeOptions.timeoutMs === 'number' ? safeOptions.timeoutMs : DEFAULT_TIMEOUT_MS;

  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return { ok: false, reason: 'missing_api_key' };
  }
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return { ok: false, reason: 'missing_prompt' };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'fetch_unavailable' };
  }

  const url = `${endpointBase}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = { contents: [{ parts: [{ text: prompt }] }] };

  let response;
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutHandle = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  } catch (e) {
    const isAbort = !!(e && (e.name === 'AbortError' || /abort/i.test(e.message || '')));
    return { ok: false, reason: isAbort ? 'timeout' : 'network_error' };
  }

  if (!response || typeof response.ok !== 'boolean') {
    return { ok: false, reason: 'invalid_response_shape' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'http_error' };
  }

  let json;
  try {
    json = await response.json();
  } catch (e) {
    return { ok: false, reason: 'invalid_response_shape' };
  }

  const rawText = extractTextFromGeminiResponse(json);
  if (typeof rawText !== 'string' || rawText.length === 0) {
    return { ok: false, reason: 'invalid_response_shape' };
  }

  return { ok: true, rawText };
}
