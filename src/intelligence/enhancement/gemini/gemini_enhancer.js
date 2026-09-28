/*
 * Phase 6 TASK 1.121｜Gemini Enhancement Layer - Enhancement Service
 *
 * 責任：Health Insight Result → Gemini Enhancement Layer的唯一
 * 進入點。這裡**不**知道也不需要知道底層是不是真的Gemini——只透過
 * `../provider/ai_provider_contract.js`定義的AI Provider
 * Interface跟provider溝通（預設用`gemini_provider.js`建立的
 * Gemini provider，可被注入替換，供未來別的供應商/測試使用）。
 *
 * 架構位置（規格原文）：
 *
 *   Health Insight Result（成功的Structured Product Response，
 *   TASK1.117既有形狀）
 *     ↓
 *   Gemini Enhancement Layer（這裡）
 *     ↓
 *   Enhanced Explanation
 *     ↓
 *   User Presentation
 *
 * ## Core Principle（規格明確要求）
 *
 * Gemini不是智慧來源——既有Capability（Analysis/Recommendation）
 * 依然是analysis/recommendation/health insight result的唯一
 * 負責者。這個服務**永遠不會**修改`structuredResponse`本身，只
 * 回傳一段獨立的`enhancedExplanation`字串供呼叫端（route層）自行
 * 決定要不要附加到回應裡——這個檔案完全不import/呼叫Capability
 * Orchestrator/Analysis Runner/Recommendation Runner/Runtime任何
 * 一個既有檔案。
 *
 * ## Input Boundary（規格明確要求：只送這些，不多送）
 *
 * `buildEnhancementInput()`是這個判斷的唯一入口——只從
 * `structuredResponse.data`挑出`healthObservation`/
 * `recommendation`/`behaviorPattern`/`progressTrend`四個欄位，
 * 各自再套用防禦性正規化（型別不符安全退回空陣列/空物件），
 * **刻意獨立實作**、不重用Response Builder/Persistence Service
 * 的正規化函式（延續整個系列"每一層各自對同一份安全輸出負責，不
 * 互相依賴內部實作"的既有慣例）。完全不會送出`decision`欄位、
 * 更不用說`identity`/OAuth token/session token/db credentials/
 * runtime metadata/capability internal tags/execution
 * stages/stack trace——這些東西這個檔案從頭到尾都拿不到（呼叫端
 * 只會傳`structuredResponse`，不會傳identity/db/env本身之外的
 * 任何東西）。
 *
 * ## Failure Handling（規格明確要求）
 *
 * `enhanceHealthInsightResult()`**永遠不會拋出例外**——任何失敗
 * （Health Insight本身失敗、Gemini未設定金鑰、Gemini API呼叫
 * 失敗、provider格式不符、任何未預期例外）都安全回傳
 * `{ok:false, reason}`，呼叫端即使完全不處理回傳值，使用者依然會
 * 拿到原本的Health Insight結果（沒有`enhancedExplanation`
 * 而已）——"Gemini failure must NOT break Health Insight"在這裡是
 * 結構性保證，不是呼叫端自己要記得try/catch。
 */
import { isValidAiProvider } from '../provider/ai_provider_contract.js';
import { createGeminiProvider } from './gemini_provider.js';
import { getGeminiConfig } from '../../../config/gemini_config.js';

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toSafeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Input Boundary——規格明確允許送給Gemini的四個欄位，刻意獨立
 * 實作，不重用其他層的正規化函式。
 *
 * @param {*} data - structuredResponse.data
 * @returns {{healthObservation:Array, recommendation:Array, behaviorPattern:Array, progressTrend:object}}
 */
export function buildEnhancementInput(data) {
  const safeData = toSafeObject(data);
  return {
    healthObservation: toSafeArray(safeData.healthObservation),
    recommendation: toSafeArray(safeData.recommendation),
    behaviorPattern: toSafeArray(safeData.behaviorPattern),
    progressTrend: toSafeObject(safeData.progressTrend),
  };
}

/**
 * @param {{ok:boolean, data?:object}} structuredResponse - TASK1.117既有的結構化Product Response
 * @param {object} [options]
 * @param {string} [options.apiKey] - 直接提供金鑰（測試用）；未提供時從options.env讀取
 * @param {object} [options.env] - Worker env，透過src/config/gemini_config.js讀取GEMINI_API_KEY
 * @param {{name:string, requestEnhancement:Function}} [options.provider] - 選填，注入自訂/測試用provider，取代預設的Gemini provider
 * @param {Function} [options.fetchImpl] - 選填，透傳給預設Gemini provider的fetch實作
 * @returns {Promise<{ok:true, enhancedExplanation:string}|{ok:false, reason:string}>}
 *   reason 可能是 'not_successful_result' | 'missing_api_key' |
 *   'invalid_provider' | 任何provider回傳的reason（例如
 *   'network_error'/'http_error'/'empty_explanation'） |
 *   'unknown_error'
 */
export async function enhanceHealthInsightResult(structuredResponse, options) {
  const safeOptions = options && typeof options === 'object' ? options : {};

  if (!structuredResponse || typeof structuredResponse !== 'object' || !structuredResponse.ok) {
    return { ok: false, reason: 'not_successful_result' };
  }

  try {
    let provider = safeOptions.provider;
    if (provider !== undefined && !isValidAiProvider(provider)) {
      return { ok: false, reason: 'invalid_provider' };
    }

    if (!provider) {
      let apiKey = typeof safeOptions.apiKey === 'string' && safeOptions.apiKey.length > 0 ? safeOptions.apiKey : null;
      if (!apiKey && safeOptions.env) {
        apiKey = getGeminiConfig(safeOptions.env).apiKey;
      }
      if (!apiKey) {
        return { ok: false, reason: 'missing_api_key' };
      }
      provider = createGeminiProvider({ apiKey, fetchImpl: safeOptions.fetchImpl });
    }

    const input = buildEnhancementInput(structuredResponse.data);
    const result = await provider.requestEnhancement(input);

    if (!result || typeof result !== 'object' || !result.ok) {
      return { ok: false, reason: result && result.reason ? result.reason : 'provider_error' };
    }
    if (typeof result.explanation !== 'string' || result.explanation.length === 0) {
      return { ok: false, reason: 'empty_explanation' };
    }

    return { ok: true, enhancedExplanation: result.explanation };
  } catch (e) {
    return { ok: false, reason: 'unknown_error' };
  }
}
