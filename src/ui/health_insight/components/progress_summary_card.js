/*
 * Phase 6 TASK 1.124｜Health Insight Product Completion
 * （Phase 7 TASK1.126後更新：新增訪客體驗模式狀態，見下方"五種
 * 狀態"區塊）
 * - Progress Summary Card（進度方向呈現）
 *
 * 責任：把規格PART2"Connect existing progress concept into actual
 * UI"落地——完全不建立任何健康評分系統/醫療判讀/AI生成的進度
 * 判斷（規格明確禁止），純粹比對**既有已存**的兩筆輸入快照
 * （這次填的`healthGoal` vs 上一筆紀錄存的`healthGoal`）跟簡單的
 * 紀錄筆數/日期，用固定樣板文字呈現，延續`gemini_insight_
 * card.js`/`history_card.js`已經確立的"純呈現層接收已算好旗標"
 * 既有模式——這個檔案完全不import `src/history/`或
 * `src/persistence/`任何檔案。
 *
 * ## 五種狀態（TASK1.126後更新：新增訪客體驗模式）
 *
 * - 匿名使用者 → 引導登入才能開始累積進度方向（跟History Card
 *   一樣，不是"會員專屬"文案，進度追蹤只跟"有沒有登入/有沒有
 *   歷史紀錄"有關，跟Gemini/Premium完全無關）
 * - **已登入但是訪客帳號**（`isGuest===true`，TASK1.126新增）→
 *   顯示"目前為體驗模式"引導文案——訪客的`previousRecordCount`
 *   在route層已經結構性地保證永遠是0（見History Retrieval
 *   Boundary的`isGuestIdentity()`排除），這裡額外用專屬文案跟
 *   "已登入但第一次使用"的Registered使用者區分開
 * - 已登入（非訪客）但沒有任何先前紀錄（第一次使用）→ 顯示
 *   "這是你的起點"文案，不做任何比較
 * - 已登入（非訪客）、有先前紀錄、且這次填的健康目標跟上一筆
 *   相同 → 顯示"持續朝著『目標』前進，第N次紀錄"
 * - 已登入（非訪客）、有先前紀錄、且這次填的健康目標跟上一筆
 *   不同 → 顯示"方向從『舊目標』轉向『新目標』"（中性描述事實，
 *   不做任何好壞評價）
 *
 * 這個元件跟`progress_card.js`（TASK1.114既有，PROTECTED_FILES
 * 保護，零diff）完全獨立、互不影響——`progress_card.js`本身
 * 保持零diff，繼續可以單獨被import/呼叫，只是`dashboard_page.js`
 * 從TASK1.124起改呼叫這個檔案取代它在Dashboard上的位置（見該
 * 檔案TASK1.124更新說明）。
 */
import { escapeHtml } from './html_utils.js';
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * Health Goal代碼→中文標籤——刻意獨立於`history_card.js`同名對照
 * 表（延續整個系列"不共用內部實作細節，各自對公開行為負責"的
 * 既有原則）。
 */
const HEALTH_GOAL_LABELS = {
  weight_loss: '想瘦一點',
  weight_maintenance: '維持現在的狀態',
  muscle_gain: '想變得更結實',
  healthy_lifestyle: '單純想過得健康一點',
};

function formatHealthGoalLabel(healthGoal) {
  if (typeof healthGoal !== 'string') return '';
  return HEALTH_GOAL_LABELS[healthGoal] || '';
}

function renderCard(explanationText) {
  return [
    '<div class="hi-card hi-progress-summary-card hi-placeholder-card">',
    createIllustration('progressPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '進度方向', underline: 'muted' }),
    `    <div class="hi-card-explanation">${escapeHtml(explanationText)}</div>`,
    createCardCta({ label: '敬請期待', accent: 'muted', action: 'progress-summary' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

/**
 * @param {{isAuthenticated?:boolean, isGuest?:boolean, previousRecordCount?:number, previousHealthGoal?:string|null, currentHealthGoal?:string|null}} [context]
 * @returns {string}
 */
export function createProgressSummaryCard(context) {
  const safeContext = context && typeof context === 'object' ? context : {};

  if (!safeContext.isAuthenticated) {
    return renderCard('登入之後，這裡會幫你記住每一次的方向，讓你看見自己一步一步往前走');
  }

  if (safeContext.isGuest) {
    return renderCard('目前為體驗模式，這次的方向不會被記住；登入後可以保存你的健康歷程，看見自己一步一步往前走');
  }

  const previousRecordCount = typeof safeContext.previousRecordCount === 'number' && safeContext.previousRecordCount > 0
    ? safeContext.previousRecordCount
    : 0;

  if (previousRecordCount === 0) {
    return renderCard('這是你在健康小洞察的起點，之後這裡會顯示你的方向怎麼一步步展開');
  }

  const previousGoalLabel = formatHealthGoalLabel(safeContext.previousHealthGoal);
  const currentGoalLabel = formatHealthGoalLabel(safeContext.currentHealthGoal);
  const recordOrdinal = previousRecordCount + 1;

  if (previousGoalLabel && currentGoalLabel && previousGoalLabel !== currentGoalLabel) {
    return renderCard(`你的方向從「${previousGoalLabel}」轉向「${currentGoalLabel}」，慢慢調整也是一種前進`);
  }

  if (currentGoalLabel) {
    return renderCard(`你持續朝著「${currentGoalLabel}」前進，這是你第 ${recordOrdinal} 次記錄`);
  }

  return renderCard(`這是你第 ${recordOrdinal} 次記錄，持續累積才能看見自己的變化`);
}
