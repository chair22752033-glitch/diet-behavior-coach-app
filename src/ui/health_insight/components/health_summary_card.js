/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Health Summary Card（Today's Insight Summary）
 *
 * 責任：呈現Dashboard最上方的"今日摘要"——一段簡短、友善的
 * 整體概覽，延續規格"Show a simple overview of user's current
 * state"。這個元件**只讀取陣列長度**（`.length`），完全不讀取
 * 陣列元素的實際內容/數值，也不做任何加總、平均、比較、判斷
 * ——這是刻意的邊界，延續TASK1.44/1.87/1.111反覆確認的"只做
 * 事實計數，不做評分/判斷"既有哲學，確保這個UI元件不會不小心
 * 變成一個新的、UI層級的分析邏輯。
 *
 * ## Do NOT create fake intelligence logic（規格明確要求）
 *
 * 這個元件**不會**在沒有真實資料時編造一段"你今天表現得很好"
 * 這類聽起來像是分析結果、但實際上是憑空產生的文字——摘要文字
 * 只依據"陣列是否為空/有幾筆"這個結構性事實產生，空的時候顯示
 * 鼓勵但誠實的引導文字，不假裝有分析內容。
 */
import { escapeHtml } from './html_utils.js';
import { getAssetPlaceholder } from '../assets/asset_registry.js';

/**
 * @param {{healthObservation?:Array, recommendation?:Array}} healthInsightOutput - TASK1.108/1.111/1.112既有輸出形狀的其中兩個欄位，其餘欄位（behaviorPattern/progressTrend/decision）這個元件不需要
 * @returns {string}
 */
export function createHealthSummaryCard(healthInsightOutput) {
  const output = healthInsightOutput && typeof healthInsightOutput === 'object' ? healthInsightOutput : {};
  const observationCount = Array.isArray(output.healthObservation) ? output.healthObservation.length : 0;
  const recommendationCount = Array.isArray(output.recommendation) ? output.recommendation.length : 0;
  const icon = getAssetPlaceholder('greeting');

  const summaryText = observationCount === 0
    ? '今天先從記錄一點點開始，我會陪你一起看看'
    : `今天幫你整理了 ${observationCount} 項觀察${recommendationCount > 0 ? `，還有 ${recommendationCount} 個小建議` : ''}`;

  return [
    '<div class="hi-card hi-health-summary-card">',
    `  <div class="hi-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>`,
    '  <div class="hi-card-label">今日摘要</div>',
    `  <div class="hi-card-explanation">${escapeHtml(summaryText)}</div>`,
    '</div>',
  ].join('\n');
}
