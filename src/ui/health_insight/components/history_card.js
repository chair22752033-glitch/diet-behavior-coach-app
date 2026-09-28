/*
 * Phase 6 TASK 1.124｜Health Insight Product Completion
 * - History Card（陪伴紀錄呈現）
 *
 * 責任：呈現History Retrieval Boundary（TASK1.124新增，見
 * `src/history/health_insight/`）查詢完的**結果**——這個元件是
 * 純呈現層，完全不呼叫History Service、不直接讀取D1/persistence
 * 任何檔案，只接收呼叫端（`render_product_response.js`）已經
 * 算好、safe的`previousRecords`摘要陣列。
 *
 * 延續TASK1.123`gemini_insight_card.js`已經確立的"純呈現層接收
 * 已算好旗標"既有模式——這個檔案完全不import
 * `src/persistence/`或`src/history/`任何檔案。
 *
 * ## 三種狀態
 *
 * - 匿名使用者（`isAuthenticated!==true`）→ 顯示"登入之後才會
 *   開始累積"的引導卡片（不是"會員專屬"——History跟Premium/
 *   Gemini完全無關，任何登入使用者都能用，見規格PART1"Support:
 *   Authenticated retrieve own records only / Anonymous: no
 *   history access"，這裡刻意用不同文案跟`gemini_insight_
 *   card.js`的"會員專屬"鎖定卡區分，避免使用者誤以為歷史紀錄
 *   也是premium功能）
 * - 已登入但沒有任何先前紀錄（`previousRecords`為空陣列）→
 *   顯示"這是你的第一筆紀錄"的友善開場文案
 * - 已登入且有先前紀錄 → 逐筆列出（最多顯示
 *   `MAX_DISPLAYED_RECORDS`筆，摘要格式`M/D · 健康目標中文標籤`），
 *   這是規格PART1"previous insight display"的具體落地——純粹
 *   列表呈現，不含任何連結/導向詳細記錄頁面（本次任務沒有建立
 *   任何單筆紀錄詳細檢視頁面，也沒有這個需求）
 *
 * 這個元件跟`history_placeholder_card.js`（TASK1.123既有）完全
 * 獨立、互不影響——`history_placeholder_card.js`本身保持零diff，
 * 繼續可以單獨被import/呼叫，只是`dashboard_page.js`從TASK1.124
 * 起改呼叫這個檔案取代它在Dashboard上的位置（見該檔案TASK1.124
 * 更新說明）。
 */
import { escapeHtml } from './html_utils.js';
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * Health Goal代碼→中文標籤——刻意獨立於
 * `src/ui/health_insight/pages/input_page.js`裡的
 * `HEALTH_GOAL_QUESTION.options`（延續整個系列"不共用內部實作
 * 細節，各自對公開行為負責"的既有原則，且`input_page.js`本身是
 * PROTECTED_FILES零diff檔案，不應該被本次任務import）。
 */
const HEALTH_GOAL_LABELS = {
  weight_loss: '想瘦一點',
  weight_maintenance: '維持現在的狀態',
  muscle_gain: '想變得更結實',
  healthy_lifestyle: '單純想過得健康一點',
};

const MAX_DISPLAYED_RECORDS = 5;

function formatRecordDate(isoString) {
  if (typeof isoString !== 'string' || isoString.length === 0) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatHealthGoalLabel(healthGoal) {
  if (typeof healthGoal !== 'string') return '';
  return HEALTH_GOAL_LABELS[healthGoal] || '';
}

function renderRecordLine(record) {
  const safeRecord = record && typeof record === 'object' ? record : {};
  const dateLabel = formatRecordDate(safeRecord.createdAt);
  const goalLabel = formatHealthGoalLabel(safeRecord.healthGoal);
  const parts = [dateLabel, goalLabel].filter((part) => part !== '');
  const lineText = parts.length > 0 ? parts.join(' · ') : '一筆先前的紀錄';
  return `    <li class="hi-history-record-item">${escapeHtml(lineText)}</li>`;
}

/**
 * @param {{isAuthenticated?:boolean, previousRecords?:Array<{id?:string, createdAt?:string, healthGoal?:string}>}} [context]
 * @returns {string}
 */
export function createHistoryCard(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const previousRecords = Array.isArray(safeContext.previousRecords) ? safeContext.previousRecords : [];

  if (!safeContext.isAuthenticated) {
    return [
      '<div class="hi-card hi-history-card hi-history-card--anonymous hi-placeholder-card">',
      createIllustration('behaviorPatternPlaceholder'),
      '  <div class="hi-card-body">',
      createCardHeader({ title: '陪伴紀錄', underline: 'muted' }),
      '    <div class="hi-card-explanation">登入之後，這裡就會開始保留你每一次的健康小洞察，讓你慢慢看見自己的變化</div>',
      createCardCta({ label: '敬請期待', accent: 'muted', action: 'history-login-required' }),
      '  </div>',
      '</div>',
    ].join('\n');
  }

  if (previousRecords.length === 0) {
    return [
      '<div class="hi-card hi-history-card hi-history-card--empty hi-placeholder-card">',
      createIllustration('behaviorPatternPlaceholder'),
      '  <div class="hi-card-body">',
      createCardHeader({ title: '陪伴紀錄', underline: 'muted' }),
      '    <div class="hi-card-explanation">這是你在健康小洞察的第一筆紀錄，持續累積，才能看見自己的變化</div>',
      createCardCta({ label: '敬請期待', accent: 'muted', action: 'history-first-record' }),
      '  </div>',
      '</div>',
    ].join('\n');
  }

  const displayedRecords = previousRecords.slice(0, MAX_DISPLAYED_RECORDS);

  return [
    '<div class="hi-card hi-history-card hi-history-card--filled">',
    createIllustration('behaviorPatternPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '陪伴紀錄', underline: 'muted' }),
    '    <div class="hi-card-explanation">你過去的洞察都留在這裡，一起看看走過的路</div>',
    '    <ul class="hi-history-record-list">',
    displayedRecords.map(renderRecordLine).join('\n'),
    '    </ul>',
    '  </div>',
    '</div>',
  ].join('\n');
}
