/*
 * Phase 6 TASK 1.121｜Gemini Enhancement Layer - Gemini Provider
 *
 * 責任：把底層的`gemini_client.js`（純HTTP client）包裝成符合
 * `../provider/ai_provider_contract.js`定義的AI Provider
 * Interface——這是Gemini具體實作「插進」Provider Abstraction的
 * 唯一位置。
 *
 * 這裡做兩件Provider層級的事：
 * - 把Input Boundary過濾後的安全input物件，組成一段給Gemini的
 *   prompt文字（只組字串，不夾帶任何原始物件結構、不夾帶任何
 *   identity/token/db相關內容——這個檔案從頭到尾拿不到那些東西）
 * - Output Boundary：Gemini回應的原始文字（`rawText`）在這裡被
 *   視為完全不可信的外部內容，套用`sanitizeExplanation()`過濾
 *   （長度上限、移除控制字元），只回傳一段乾淨的說明文字字串，
 *   其餘Gemini API原始回應（`rawText`本身以外的任何欄位，例如
 *   safety ratings/finish reason/token usage等內部後設資料）
 *   完全不會被回傳出去
 */
import { callGeminiApi } from './gemini_client.js';

const MAX_EXPLANATION_LENGTH = 600;

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toSafeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 只把Input Boundary已經允許的四個欄位組進prompt——這裡不重新做
 * 一次過濾判斷（那是`gemini_enhancer.js`的責任），只做最基本的
 * 防禦性正規化，避免`undefined`污染組出來的prompt字串。
 *
 * @param {*} input
 * @returns {string}
 */
function buildPrompt(input) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const payload = {
    healthObservation: toSafeArray(safeInput.healthObservation),
    recommendation: toSafeArray(safeInput.recommendation),
    behaviorPattern: toSafeArray(safeInput.behaviorPattern),
    progressTrend: toSafeObject(safeInput.progressTrend),
  };
  return [
    '你是一個健康教練助理。請只根據下面這份JSON資料，用溫暖、口語化、繁體中文改寫成一段簡短友善的說明文字。',
    '規則：不要下醫療診斷、不要新增資料裡沒有的內容、不要提到任何技術細節或JSON本身、只回傳說明文字。',
    JSON.stringify(payload),
  ].join('\n');
}

/**
 * Output Boundary——Gemini回應文字視為不可信的外部內容，這裡只
 * 允許純文字通過，移除控制字元並限制長度，不做任何HTML/Markdown
 * 解析（呼叫端只需要一段文字，不需要格式化內容）。
 *
 * @param {*} rawText
 * @returns {string|null}
 */
function sanitizeExplanation(rawText) {
  if (typeof rawText !== 'string') return null;
  const stripped = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (!stripped) return null;
  return stripped.slice(0, MAX_EXPLANATION_LENGTH);
}

/**
 * @param {{apiKey:string, fetchImpl?:Function, model?:string, endpointBase?:string, timeoutMs?:number}} options
 * @returns {{name:'gemini', requestEnhancement: (input:*) => Promise<{ok:true, explanation:string}|{ok:false, reason:string}>}}
 */
export function createGeminiProvider(options) {
  const safeOptions = options && typeof options === 'object' ? options : {};

  return {
    name: 'gemini',
    async requestEnhancement(input) {
      try {
        const prompt = buildPrompt(input);
        const result = await callGeminiApi(safeOptions.apiKey, prompt, safeOptions);
        if (!result || !result.ok) {
          return { ok: false, reason: result && result.reason ? result.reason : 'provider_error' };
        }
        const explanation = sanitizeExplanation(result.rawText);
        if (!explanation) {
          return { ok: false, reason: 'empty_explanation' };
        }
        return { ok: true, explanation };
      } catch (e) {
        return { ok: false, reason: 'unknown_error' };
      }
    },
  };
}
