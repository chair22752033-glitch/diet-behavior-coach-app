/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：新增標題區塊+視覺重構，見下方"TASK1.115
 * 更新"區塊）
 * - Dashboard Page（Health Insight Dashboard）
 *
 * 責任：把TASK1.112 Health Insight
 * Integration（`integration.requestProductEntry()`）產出的
 * 結果，組裝成完整的Dashboard畫面結構——延續規格Expected UI
 * Areas第1節列出的四個區塊（Today's Insight Summary/Health
 * Observation Card/Recommendation Card/Progress
 * Placeholder）。這個檔案是**純函式組裝層**：接收既有
 * Integration的成功/失敗結果、呼叫`../components/`底下的元件、
 * 回傳一段完整的HTML字串，**不**呼叫Integration/Feature/
 * Capability本身（呼叫Integration是未來Route/Controller的
 * 職責，延續TASK1.113第9節已確認的既有分工），**不**做任何
 * 資料計算/推論。
 *
 * ## Intelligence Boundary（規格明確要求）
 *
 * 這個檔案完全不import`src/intelligence/`底下任何檔案——它的
 * 輸入是**已經**執行完Health Insight Integration之後的結果
 * 物件，職責只有"把這個結果排版成畫面"。
 *
 * ## TASK1.115更新：新增標題區塊+視覺重構
 *
 * 延續使用者提供的Dashboard參考圖，新增畫面最上方的標題
 * 區塊（主標題"今天的健康小洞察"+副標題"陪你慢慢理解自己"+
 * 角色歡迎插畫），改用`createObservationCard()`/
 * `createRecommendationCard()`新的單卡結構（見這兩個元件
 * 檔案的TASK1.115更新說明，不再是`*List()`的N張卡結構）。
 *
 * ## TASK1.123更新：Gemini呈現 + 歷史紀錄預留區塊
 *
 * `renderHealthInsightDashboard()`新增選填的第二個參數
 * `presentationContext`（`{isAuthenticated, geminiPermitted,
 * enhancedExplanation}`，由`../render_product_response.js`
 * 轉發，最終由`src/routes/health_insight_routes.js`組出——這個
 * 檔案本身完全不呼叫Gemini Enhancement Layer/Membership
 * Boundary，只把已經算好的旗標交給`createGeminiInsightCard()`
 * 排版，延續這個檔案自始至終"純函式組裝層"的既有定位）。省略
 * 這個參數時（`presentationContext`為`undefined`），效果等同於
 * 傳入`{}`——`createGeminiInsightCard({})`會安全回傳"會員專屬"
 * 邊界卡片（因為`geminiPermitted`預設是falsy），這是刻意的安全
 * 預設，不是巧合：沒有明確被授權的呼叫一律視為"未取得permission"，
 * 不會意外顯示AI內容。
 *
 * 新增`createHistoryPlaceholderCard()`區塊（規格"History
 * Experience Preparation"，純預留卡片，不接受任何真實歷史資料，
 * 見該元件檔案說明），固定顯示在Dashboard最下方。
 */
import { getDesignSystemCSS } from '../design_system/design_tokens.js';
import { createIllustration } from '../components/illustration.js';
import { createHealthSummaryCard } from '../components/health_summary_card.js';
import { createObservationCard } from '../components/observation_card.js';
import { createRecommendationCard } from '../components/recommendation_card.js';
import { createBehaviorPatternPlaceholderCard } from '../components/behavior_pattern_card.js';
import { createProgressPlaceholderCard } from '../components/progress_card.js';
import { createGeminiInsightCard } from '../components/gemini_insight_card.js';
import { createHistoryPlaceholderCard } from '../components/history_placeholder_card.js';
import { createErrorCard } from '../components/error_card.js';

/**
 * 組裝Dashboard最上方的標題區塊——延續使用者提供的參考圖，
 * 主標題+副標題+角色歡迎插畫，純排版，不讀取任何Health
 * Insight結果內容（延續"標題區塊背景延續頁面底色，不額外加
 * 卡片框"的DESIGN_SPECIFICATION.md第6節既有規則）。
 *
 * @returns {string}
 */
function renderDashboardHeader() {
  return [
    '<header class="hi-dashboard-header">',
    createIllustration('greeting', { className: 'hi-dashboard-header-illustration' }),
    '  <h1 class="hi-dashboard-title">今天的健康小洞察</h1>',
    '  <p class="hi-dashboard-subtitle">陪你慢慢理解自己</p>',
    '</header>',
  ].join('\n');
}

/**
 * 把Health Insight Integration**成功**時的`result`欄位（延續
 * TASK1.108/1.111/1.112既有輸出形狀
 * `{healthObservation, behaviorPattern, recommendation,
 * progressTrend, decision?}`）組裝成完整Dashboard HTML。這裡
 * 完全不讀取`decision`欄位（延續TASK1.111"decision目前固定為
 * null，UI不需要呈現這個佔位欄位"的既有結論），也完全不讀取
 * 任何`boundary`/`ok`這類最外層的Integration回傳標籤（延續
 * "不暴露internal capability structure"既有原則）。
 *
 * @param {{healthObservation?:Array, behaviorPattern?:Array, recommendation?:Array, progressTrend?:object}} healthInsightResult
 * @param {{isAuthenticated?:boolean, geminiPermitted?:boolean, enhancedExplanation?:string|null}} [presentationContext] - TASK1.123新增，選填，見上方"TASK1.123更新"說明
 * @returns {string}
 */
export function renderHealthInsightDashboard(healthInsightResult, presentationContext) {
  const result = healthInsightResult && typeof healthInsightResult === 'object' ? healthInsightResult : {};
  const geminiCard = createGeminiInsightCard(presentationContext);

  return [
    `<style>${getDesignSystemCSS()}</style>`,
    '<section class="hi-dashboard" data-hi-page="dashboard">',
    renderDashboardHeader(),
    '  <div class="hi-dashboard-section hi-dashboard-summary">',
    createHealthSummaryCard(result),
    '  </div>',
    '  <div class="hi-dashboard-section hi-dashboard-observation">',
    createObservationCard(result.healthObservation),
    '  </div>',
    '  <div class="hi-dashboard-section hi-dashboard-recommendation">',
    createRecommendationCard(result.recommendation),
    '  </div>',
    geminiCard ? '  <div class="hi-dashboard-section hi-dashboard-gemini-insight">' : '',
    geminiCard,
    geminiCard ? '  </div>' : '',
    '  <div class="hi-dashboard-section hi-dashboard-behavior-pattern">',
    createBehaviorPatternPlaceholderCard(),
    '  </div>',
    '  <div class="hi-dashboard-section hi-dashboard-progress">',
    createProgressPlaceholderCard(),
    '  </div>',
    '  <div class="hi-dashboard-section hi-dashboard-history">',
    createHistoryPlaceholderCard(),
    '  </div>',
    '</section>',
  ].filter((line) => line !== '').join('\n');
}

/**
 * 把Health Insight Integration**失敗**時的結果（延續
 * TASK1.112第10節既有失敗形狀
 * `{ok:false, boundary, reason, field?, stage?}`）組裝成
 * 錯誤呈現畫面——延續TASK1.113第8節/本次任務Error
 * Presentation要求，只顯示分類後的友善訊息，不暴露`reason`/
 * `field`/`stage`原始內容。
 *
 * @param {{reason?:string}} failureResult
 * @returns {string}
 */
export function renderHealthInsightDashboardError(failureResult) {
  return [
    `<style>${getDesignSystemCSS()}</style>`,
    '<section class="hi-dashboard hi-dashboard-error" data-hi-page="dashboard-error">',
    createErrorCard(failureResult),
    '</section>',
  ].join('\n');
}
