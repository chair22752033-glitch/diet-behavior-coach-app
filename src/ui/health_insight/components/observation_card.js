/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：視覺重構+結構調整，見下方"TASK1.115
 * 更新"區塊）
 * - Observation Card（Health Observation Card / Insight Card）
 *
 * 責任：把TASK1.108/1.111/1.112既有輸出`healthObservation`
 * 陣列，呈現成**一張**"拙趣"風格的卡片——顯示health
 * observation本身跟簡單的說明文字（延續規格"Display: health
 * observation, simple explanation"）。這個元件是純函式：接收
 * 資料、回傳HTML字串，**不**呼叫任何Capability/Feature/
 * Integration程式碼，**不**做任何計算/推論，只做資料格式化跟
 * 排版。
 *
 * ## Intelligence Boundary（規格明確要求）
 *
 * 這個檔案完全不import`src/intelligence/`底下任何檔案——它
 * 只接受**已經**由Health Insight Integration（TASK1.112）
 * 產出、且已經通過`label_map.js`轉換過的資料，職責是"收集使用
 * 者互動、顯示產品輸出、處理使用者體驗"（規格原文UI
 * Responsibility），不是"分析、建議、產生洞察"（規格原文
 * Intelligence Responsibility）。
 *
 * ## Output Boundary（延續TASK1.108，規格要求"不暴露runtime
 * metadata/internal capability fields/execution
 * information"）
 *
 * 這個元件只讀取每筆項目的`type`跟`value`兩個欄位——這正好是
 * TASK1.111 Health Insight Feature Result Mapper已經過濾過的
 * 安全形狀（`source`/`status`/`capability`標籤已經在Feature
 * 層被拿掉），元件這裡**不會**、也**沒有能力**意外顯示這些
 * 內部欄位，因為它們根本不存在於傳入的資料形狀裡。
 *
 * ## TASK1.115更新：視覺重構+結構調整
 *
 * TASK1.114的既有實作是"每一筆healthObservation項目各自變成
 * 一張獨立的`.hi-card`"，跟使用者提供的參考圖（Dashboard只有
 * **一張**"健康觀察"卡片，裡面放一段整合過的敘述）有落差——
 * 這正是`DESIGN_SPECIFICATION.md`第7節已經記錄的既知落差。
 * 本次任務把結構調整成**一張卡片**、內部用精簡的列表呈現
 * 每一筆觀察（`label：value`），不是N張獨立卡片——這是**呈現
 * 層的排版調整**，不是新增分析邏輯：每一筆資料的`label`/
 * `value`依然完全來自既有Analysis Capability，這裡只是把
 * 「怎麼排版」從「一筆一張卡」改成「一張卡裡的一份清單」。
 * emoji圖示（🔍）換成真正的插畫
 * （`companion-observing.webp`，角色拿放大鏡看幼苗），標題
 * 下方新增鼠尾草綠手繪底線，底部新增"查看更多分析"行動
 * 小標籤。
 */
import { escapeHtml } from './html_utils.js';
import { getObservationLabel } from './label_map.js';
import { createIllustration } from './illustration.js';
import { createCardHeader } from './card_header.js';
import { createCardCta } from './card_cta.js';

/**
 * @param {{type:*, value:*}} item
 * @returns {string}
 */
function renderObservationItem(item) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const { label } = getObservationLabel(safeItem.type);
  return `    <li class="hi-observation-item"><span class="hi-observation-item-label">${escapeHtml(label)}</span><span class="hi-observation-item-value">${escapeHtml(safeItem.value)}</span></li>`;
}

/**
 * 把整個`healthObservation`陣列組裝成**一張**Health
 * Observation Card——陣列為空時顯示友善的空狀態內容（延續
 * "low pressure"設計原則，不是顯示冷冰冰的"No data"）。
 *
 * @param {Array<{type:*, value:*}>} healthObservation
 * @returns {string}
 */
export function createObservationCard(healthObservation) {
  const items = Array.isArray(healthObservation) ? healthObservation : [];

  const body = items.length === 0
    ? '    <div class="hi-card-explanation">還沒有足夠的記錄，先從今天開始累積一點點吧</div>'
    : ['    <ul class="hi-observation-list">', ...items.map((item) => renderObservationItem(item)), '    </ul>'].join('\n');

  return [
    `<div class="hi-card hi-observation-card${items.length === 0 ? ' hi-empty-state' : ''}">`,
    createIllustration('observation'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '健康觀察', underline: 'sage' }),
    body,
    createCardCta({ label: '查看更多分析', accent: 'sage', action: 'view-observation-details' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

/**
 * @deprecated TASK1.115後：`createObservationCard()`本身已經
 * 接受完整陣列並組裝成一張卡片，這個函式只是保留舊名稱的
 * 轉發，避免任何還在使用舊名稱的呼叫端完全失去這個函式。新
 * 程式碼請直接呼叫`createObservationCard()`。
 *
 * @param {Array<{type:*, value:*}>} healthObservation
 * @returns {string}
 */
export function createObservationCardList(healthObservation) {
  return createObservationCard(healthObservation);
}
