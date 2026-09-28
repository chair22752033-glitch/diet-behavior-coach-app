/*
 * Phase 6 TASK 1.117｜Health Insight Response Boundary Refinement
 * - UI Renderer（Structured Product Response → HTML 連接點）
 *
 * 責任：把`src/controllers/health_insight_controller.js`
 * （TASK1.117後）回傳的**結構化Product Response**（`{ok:true,
 * data}`或`{ok:false, error:{type, category}}`），轉接成既有的
 * `renderHealthInsightDashboard()`/`renderHealthInsightDashboardError()`
 * （TASK1.114/1.115，完全沒有被重寫）呼叫方式——這是規格明確
 * 要求的"Only adapt the connection if required"，不是重新設計
 * Dashboard/Cards/Illustrations/Error Presentation。
 *
 * 架構位置：
 *
 *   Controller
 *     ↓
 *   Health Insight Response Builder（TASK1.117新增）
 *     ↓
 *   Structured Product Response
 *     ↓
 *   UI Renderer（這裡）
 *     ↓
 *   HTML（既有renderHealthInsightDashboard()/
 *         renderHealthInsightDashboardError()產生）
 *
 * 失敗時，Response Builder已經把原始`reason`分類成四類使用者
 * 可見錯誤分類之一（`missing_data`/`invalid_input`/
 * `unavailable_intelligence`/`temporary_failure`，存在
 * `error.category`），這裡把這個已經分類好的`category`直接當
 * 作`reason`傳給既有的`renderHealthInsightDashboardError()`——
 * `error_card.js`的`classifyErrorReason()`本次任務新增了4筆
 * "分類名稱本身也能被正確識別"的identity
 * mapping（見該檔案），讓這個轉接不需要重新解讀分類邏輯，也
 * 不會產生任何跟TASK1.114/1.115時代不同的呈現結果。
 */
import { renderHealthInsightDashboard, renderHealthInsightDashboardError } from './pages/dashboard_page.js';

/**
 * @param {{ok:true, data:object}|{ok:false, error:{type:string, category:string}}} structuredResponse
 * @returns {string}
 */
export function renderHealthInsightProductResponse(structuredResponse) {
  const safeResponse = structuredResponse && typeof structuredResponse === 'object' ? structuredResponse : {};

  if (safeResponse.ok) {
    return renderHealthInsightDashboard(safeResponse.data);
  }

  const category = safeResponse.error && typeof safeResponse.error === 'object'
    ? safeResponse.error.category
    : undefined;

  return renderHealthInsightDashboardError({ reason: category });
}
