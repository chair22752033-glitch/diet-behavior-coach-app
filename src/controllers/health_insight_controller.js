/*
 * Phase 6 TASK 1.116｜Health Insight Product Activation Implementation
 * （TASK1.117後更新：Response Boundary Refinement，見下方
 * "TASK1.117更新"區塊）
 * - Health Insight Controller
 *
 * 責任：第一次把TASK1.114/1.115的UI Foundation跟TASK1.112的
 * Health Insight Product Integration接在一起，是這條產品線
 * 第一個真正被route呼叫的controller。這個檔案本身**不**修改
 * Product Entry/Contract/Adapter/Execution/Operational/Health
 * Insight Feature/Capability Orchestrator/Analysis
 * Runner/Recommendation Runner/Runtime任何一個既有檔案，只是
 * 依照它們既有的公開介面組裝一條真實可用的呼叫鏈。
 *
 * ## 唯一需要新增的橋接邏輯：Input Experience答案 → Insight Context
 *
 * TASK1.112既有文件已經確認：Product Adapter把`rawInput`原樣當作
 * `context`使用，而`context`必須符合`src/intelligence/contracts/
 * insight_context_contract.js`定義的固定形狀
 * `{user, nutritionContext, behaviorContext, emotionContext,
 * activityContext, reportContext, metadata}`（每個`xxxContext`都是
 * `{count, items}`）——這跟Input Experience UI（age/gender/height/
 * weight/healthGoal這些扁平欄位）的形狀完全不同，中間需要一層轉換。
 *
 * 這裡刻意重用TASK1.42既有的`createInsightContextBuilder()`（純
 * 函式，不接受db參數，不做任何AI/推論邏輯）完成這個轉換，而不是
 * 自己手刻一份新的Context組裝邏輯——把Input Experience收集到的
 * 使用者輪廓答案放進`preparedContext.user`，五個domain
 * 資料來源（explorations/foodEvents/emotions/behaviors/reports）
 * 目前固定給空陣列，因為Input Experience本身只收集使用者輪廓，
 * 不收集/不查詢任何既有domain資料表（延續本次任務"D1 domain
 * tables維持0筆"的驗證要求，這個檔案完全不import`src/db/`，
 * 完全不接受db參數）。
 *
 * ## TASK1.117更新：Controller不再直接產生HTML
 *
 * TASK1.116原本的`submitHealthInsightController()`直接呼叫
 * `renderHealthInsightDashboard()`/`renderHealthInsightDashboardError()`
 * 回傳HTML字串。TASK1.117把這個職責拆出去——`submitHealthInsight
 * Controller()`現在改呼叫`health_insight_response_builder.js`
 * （TASK1.117新增），回傳一個跟呈現方式無關的**結構化Product
 * Response**（`{ok, data}`或`{ok:false, error:{type, category}}`），
 * 不再import/呼叫任何`src/ui/health_insight/`底下的render函式。
 * 「把結構化回應轉成HTML」的責任交給呼叫端（`src/routes/
 * health_insight_routes.js`）在拿到這個回應之後，另外呼叫
 * `src/ui/health_insight/render_product_response.js`（TASK1.117
 * 新增的UI Renderer連接點）完成——這個檔案完全不知道HTML長怎樣，
 * 也完全不知道呼叫端最終會不會把它渲染成HTML（延續"未來可能有
 * 非HTML的API消費者"的設計方向）。
 *
 * ## Error Boundary（TASK1.117後：分類邊界前移到Response Builder）
 *
 * 不論失敗發生在哪一層（Entry/Adapter/Execution/Operational/
 * Feature/Capability/Analysis/Recommendation），這裡一律只把
 * 失敗結果原樣轉交給`responseBuilder.buildFailureResponse()`
 * （TASK1.117新增，內部做`reason → category`分類），這個
 * controller本身完全不讀取/不解讀`reason`字串本身，也完全不會把
 * `field`/`stage`/例外物件本身放進回傳值裡。
 */
import { createHealthInsightProductIntegration } from '../intelligence/product/health_insight_integration.js';
import { createInsightContextBuilder } from '../intelligence/context/insight_context_builder.js';
import { createHealthInsightResponseBuilder } from './health_insight_response_builder.js';
import { renderHealthInsightInputExperience } from '../ui/health_insight/index.js';

/**
 * Input Experience目前收集的使用者輪廓欄位白名單——延續
 * `src/ui/health_insight/pages/input_page.js`既有的
 * `data-field`欄位命名（age/height/weight/gender/healthGoal）。
 */
const PROFILE_FIELDS = ['gender', 'age', 'height', 'weight', 'healthGoal'];
const MAX_STRING_VALUE_LENGTH = 100;

/**
 * 只做最基本的防禦性清理（字串長度上限、數字必須是有限值），不做
 * 任何業務驗證——業務驗證留給既有Product Entry/Contract/Health
 * Insight Feature（延續整個Phase 5/6系列已確認的既有驗證責任
 * 分工，這裡不重新實作那些規則）。
 *
 * @param {*} value
 * @returns {string|number|null}
 */
function sanitizeProfileValue(value) {
  if (typeof value === 'string') {
    return value.slice(0, MAX_STRING_VALUE_LENGTH);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

/**
 * @param {*} payload - POST /api/health-insight的HTTP body（已經被
 *   worker.js/router解析成JS物件）
 * @returns {object}
 */
function buildProfileFromPayload(payload) {
  const safePayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const profile = {};
  PROFILE_FIELDS.forEach((field) => {
    const value = sanitizeProfileValue(safePayload[field]);
    if (value !== null) {
      profile[field] = value;
    }
  });
  return profile;
}

/**
 * GET /health-insight controller——回傳Input Experience頁面內容
 * （純排版，呼叫既有`renderHealthInsightInputExperience()`，完全
 * 不讀取任何使用者資料）。
 *
 * @returns {{ok:true, data:{html:string}}}
 */
export function getHealthInsightPageController() {
  return { ok: true, data: { html: renderHealthInsightInputExperience() } };
}

/**
 * POST /api/health-insight controller——把Input Experience答案
 * 轉成Insight Context、呼叫Health Insight Product
 * Integration、把結果交給Response Builder組裝成**結構化Product
 * Response**回傳（TASK1.117後不再直接回傳HTML，見上方"TASK1.117
 * 更新"說明）。不論Health Insight內部流程成功或失敗，這個函式的
 * 回傳值都是一個乾淨的資料物件（`{ok:true, data}`或
 * `{ok:false, error:{type, category}}`），呼叫端（route層）要
 * 自己決定怎麼把這個回應轉成HTTP回應（例如呼叫UI
 * Renderer轉成HTML，或未來直接以JSON回傳給API消費者）。
 *
 * @param {*} payload
 * @param {object} [dependencies] - 選填依賴注入，供測試替換
 * @param {{buildInsightContext: Function}} [dependencies.contextBuilder]
 * @param {{requestProductEntry: Function}} [dependencies.integration]
 * @param {{buildSuccessResponse: Function, buildFailureResponse: Function}} [dependencies.responseBuilder]
 * @returns {{ok:true, data:{healthObservation:Array, behaviorPattern:Array, recommendation:Array, progressTrend:object, decision:*}}|{ok:false, error:{type:'friendly_error', category:string}}}
 */
export function submitHealthInsightController(payload, dependencies) {
  const deps = dependencies || {};
  const contextBuilder = deps.contextBuilder || createInsightContextBuilder();
  const integration = deps.integration || createHealthInsightProductIntegration();
  const responseBuilder = deps.responseBuilder || createHealthInsightResponseBuilder();

  const profile = buildProfileFromPayload(payload);
  const preparedContext = {
    user: Object.keys(profile).length > 0 ? profile : null,
    explorations: [],
    foodEvents: [],
    emotions: [],
    behaviors: [],
    reports: [],
  };

  let context;
  try {
    context = contextBuilder.buildInsightContext(preparedContext).context;
  } catch (e) {
    return responseBuilder.buildFailureResponse({ reason: 'unknown_error' });
  }

  let outcome;
  try {
    outcome = integration.requestProductEntry({ rawInput: context });
  } catch (e) {
    return responseBuilder.buildFailureResponse({ reason: 'unknown_error' });
  }

  if (!outcome || typeof outcome !== 'object') {
    return responseBuilder.buildFailureResponse({ reason: 'unknown_error' });
  }

  if (!outcome.ok) {
    return responseBuilder.buildFailureResponse(outcome);
  }

  return responseBuilder.buildSuccessResponse(outcome.result);
}
