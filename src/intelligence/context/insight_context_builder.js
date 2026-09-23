/*
 * Phase 1 TASK 1.42｜Insight Context Integration Layer
 * - Insight Context Builder
 *
 * 責任：把 Data Preparation Layer（TASK1.41）的輸出轉成穩定、通過
 * 驗證的 Insight Context（見 src/intelligence/contracts/
 * insight_context_contract.js），架構位置：
 *
 *   Domain Services
 *     ↓
 *   Data Preparation Layer（TASK1.41）
 *     ↓
 *   Insight Context Builder（這裡）
 *     ↓
 *   Insight Service（TASK1.40，新增getInsightContext()呼叫這裡）
 *     ↓
 *   Analysis Engine
 *
 * 明確要求：
 * - 只消費 dataPreparation 層的輸出（`prepare()`/`normalize()`產生的
 *   {user, explorations, foodEvents, emotions, behaviors, reports}
 *   形狀），完全不直接呼叫任何 Domain Service（不 import
 *   src/services/ 底下任何檔案）
 * - 不直接操作 SQL（不 import src/db/ 底下任何檔案，這個檔案甚至不
 *   接受db參數）
 * - 不處理 HTTP（不知道 Request/Response 是什麼）
 * - 不解析 Session（不 import src/auth/ 或 src/identity/）
 *
 * 完全是純函式：buildInsightContext()不讀取Date.now()/Math.random()/
 * 任何外部狀態，同樣的輸入永遠得到deterministic的輸出，不做任何解讀/
 * 分類/摘要/評分/建議/prompt組裝。
 */
import { validateInsightContext } from '../contracts/insight_context_contract.js';

const EMPTY_SECTION = Object.freeze({ count: 0, items: [] });

/**
 * @param {*} section - dataPreparation正規化後的 {count, items} 形狀
 * @returns {{count:number, items:Array}}
 */
function normalizeSection(section) {
  if (!section || typeof section !== 'object' || !Array.isArray(section.items)) {
    return { count: 0, items: [] };
  }
  // 注意：這裡刻意對每個item做一層shallow copy（Object.assign({}, item)），
  // 不是只用Array.prototype.slice()複製陣列容器本身——slice()只會複製
  // 陣列，裡面的每個item物件仍然是同一個參考，修改
  // buildInsightContext()回傳結果裡的item欄位會直接改到
  // dataPreparation層的原始資料。沿用TASK1.41
  // data_normalizer.js的normalizeList()已經建立的慣例，維持兩層
  // 一致的不可變性保證。
  const items = section.items.map((item) => Object.assign({}, item));
  return { count: typeof section.count === 'number' ? section.count : items.length, items };
}

/**
 * 純結構性統計摘要，不含任何解讀——只是把五個來源各自的count整理成
 * 單一物件方便未來Analysis Engine不用自己重新算一次，這裡完全不新增
 * 任何「分數」或「信心值」，只是既有count的加總跟複製。
 *
 * @param {object} sections - {nutritionContext, behaviorContext, emotionContext, activityContext, reportContext}
 * @returns {{totalRecords:number, sourceCounts:object}}
 */
function buildMetadata(sections) {
  const sourceCounts = {
    nutrition: sections.nutritionContext.count,
    behavior: sections.behaviorContext.count,
    emotion: sections.emotionContext.count,
    activity: sections.activityContext.count,
    report: sections.reportContext.count,
  };
  const totalRecords = Object.values(sourceCounts).reduce((sum, n) => sum + n, 0);
  return { totalRecords, sourceCounts };
}

/**
 * @returns {{buildInsightContext: (preparedContext:*) => {context:object, validation:{ok:boolean, reason?:string, field?:string}}}}
 */
export function createInsightContextBuilder() {
  /**
   * @param {*} preparedContext - dataPreparation.prepare()/normalize()
   *   的輸出（{user, explorations, foodEvents, emotions, behaviors,
   *   reports}），格式不正確或缺漏時安全視為空值，不拋出例外
   * @returns {{context:object, validation:{ok:boolean, reason?:string, field?:string}}}
   */
  function buildInsightContext(preparedContext) {
    preparedContext = preparedContext && typeof preparedContext === 'object' ? preparedContext : {};

    const nutritionContext = normalizeSection(preparedContext.foodEvents);
    const behaviorContext = normalizeSection(preparedContext.behaviors);
    const emotionContext = normalizeSection(preparedContext.emotions);
    const activityContext = normalizeSection(preparedContext.explorations);
    const reportContext = normalizeSection(preparedContext.reports);

    const metadata = buildMetadata({ nutritionContext, behaviorContext, emotionContext, activityContext, reportContext });

    const context = {
      user: preparedContext.user !== undefined ? preparedContext.user : null,
      nutritionContext,
      behaviorContext,
      emotionContext,
      activityContext,
      reportContext,
      metadata,
    };

    const validation = validateInsightContext(context);
    return { context, validation };
  }

  return { buildInsightContext };
}

export { EMPTY_SECTION };
