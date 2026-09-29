/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - History Page（規格PART2導覽列「紀錄」入口的實際頁面）
 *
 * 責任：讓「紀錄」不再只是POST /api/health-insight之後Dashboard
 * 裡的一張摘要卡片，而是一個可以獨立造訪的頁面——重用TASK1.124
 * 既有的`getHealthInsightHistoryForIdentity()`（由呼叫端
 * `app_shell_routes.js`負責查詢，這裡只接收查詢完的`records`
 * 陣列），純呈現層。
 *
 * ## Guest Conversion Experience（規格PART4的具體落地）
 *
 * Guest／完全匿名兩種狀態都看到"目前為體驗模式"/"登入後可以
 * 保存你的健康歷程"文案跟一個**純樣式**的登入CTA
 * （`createCardCta()`，延續`history_card.js`/
 * `progress_summary_card.js`既有的"建立但不接線"模式——這個
 * 按鈕本身不觸發任何真正的OAuth流程，規格明確要求"Do not force
 * login"、"Only prepare boundary"，真正接上Google OAuth的入口
 * 交給未來任務決定，這裡不新增/不修改`src/oauth/`任何檔案）。
 */
import { escapeHtml } from '../../health_insight/components/html_utils.js';
import { createIllustration } from '../../health_insight/components/illustration.js';
import { createCardHeader } from '../../health_insight/components/card_header.js';
import { createCardCta } from '../../health_insight/components/card_cta.js';

const HEALTH_GOAL_LABELS = {
  weight_loss: '想瘦一點',
  weight_maintenance: '維持現在的狀態',
  muscle_gain: '想變得更結實',
  healthy_lifestyle: '單純想過得健康一點',
};

function formatRecordDate(isoString) {
  if (typeof isoString !== 'string' || isoString.length === 0) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function renderGuestConversionCard() {
  return [
    '<div class="hi-card app-history-page-card">',
    createIllustration('behaviorPatternPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '你的健康紀錄', underline: 'muted' }),
    '    <div class="hi-card-explanation">目前為體驗模式，這裡還沒有可以保存的紀錄；登入後可以保存你的健康歷程，累積成屬於你的健康紀錄</div>',
    createCardCta({ label: '登入保存你的健康紀錄', accent: 'muted', action: 'app-history-guest-login' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

function renderEmptyHistoryCard() {
  return [
    '<div class="hi-card app-history-page-card">',
    createIllustration('behaviorPatternPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '你的健康紀錄', underline: 'muted' }),
    '    <div class="hi-card-explanation">還沒有任何紀錄，去體驗一次健康小洞察，開始累積屬於你的健康歷程吧</div>',
    createCardCta({ label: '開始體驗', accent: 'muted', action: 'app-history-empty-cta' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

function renderRecordListItem(record) {
  const safeRecord = record && typeof record === 'object' ? record : {};
  const dateLabel = formatRecordDate(safeRecord.createdAt);
  const goalLabel = typeof safeRecord.healthGoal === 'string' ? (HEALTH_GOAL_LABELS[safeRecord.healthGoal] || '') : '';
  const parts = [dateLabel, goalLabel].filter((part) => part !== '');
  const lineText = parts.length > 0 ? parts.join(' · ') : '一筆先前的紀錄';
  return `  <li class="app-history-record-item">${escapeHtml(lineText)}</li>`;
}

function renderRecordListCard(records) {
  return [
    '<div class="hi-card app-history-page-card">',
    '  <div class="hi-card-body">',
    createCardHeader({ title: '你的健康紀錄', underline: 'muted' }),
    '    <ul class="app-history-record-list">',
    records.map(renderRecordListItem).join('\n'),
    '    </ul>',
    '  </div>',
    '</div>',
  ].join('\n');
}

/**
 * @param {{isAuthenticated?:boolean, isGuest?:boolean, records?:Array}} [context]
 * @returns {string}
 */
export function renderHistoryPageContent(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const records = Array.isArray(safeContext.records) ? safeContext.records : [];

  let contentCard;
  if (!safeContext.isAuthenticated || safeContext.isGuest) {
    contentCard = renderGuestConversionCard();
  } else if (records.length === 0) {
    contentCard = renderEmptyHistoryCard();
  } else {
    contentCard = renderRecordListCard(records);
  }

  return [
    '<section class="app-history-page" data-app-page="history">',
    contentCard,
    '</section>',
  ].join('\n');
}
