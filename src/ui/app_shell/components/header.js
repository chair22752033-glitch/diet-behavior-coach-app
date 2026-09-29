/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - App Header（Global User Entry / 使用者狀態區）
 *
 * 責任：規格PART1「App Shell Foundation」要求的Header跟User
 * status area——純呈現層，只接收呼叫端（`app_shell.js`）已經
 * 算好的`isAuthenticated`/`isGuest`兩個布林值，不查詢db、不
 * 解析cookie、不判斷任何持久化/歷史/會員邏輯。
 *
 * ## 三種狀態（延續TASK1.126已確認的Guest/Registered/Anonymous
 * 三層語意，這裡是它在App Shell層級的呈現）
 *
 * - 完全匿名（`isAuthenticated!==true`）→ 顯示低壓力的登入
 *   引導連結，**不強制登入**（規格PART4明確要求"Do not force
 *   login"），只是一個可以忽略的連結
 * - 訪客（`isAuthenticated===true && isGuest===true`）→ 顯示
 *   "體驗模式"徽章 + 登入引導，延續TASK1.126
 *   `history_card.js`/`progress_summary_card.js`已經確立的
 *   "目前為體驗模式"文案語言
 * - 註冊使用者（`isAuthenticated===true && isGuest!==true`）→
 *   顯示簡短的"已登入"狀態，不暴露任何email/provider等敏感
 *   識別資訊（延續`user_identity.js`"往下游看不到超過三欄位"
 *   既有的最小揭露原則）
 */
import { escapeHtml } from '../../health_insight/components/html_utils.js';

/**
 * @param {{isAuthenticated?:boolean, isGuest?:boolean}} [context]
 * @returns {string}
 */
export function renderAppHeader(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const isAuthenticated = !!safeContext.isAuthenticated;
  const isGuest = !!safeContext.isGuest;

  let statusMarkup;
  if (!isAuthenticated) {
    statusMarkup = [
      '<div class="app-user-status app-user-status--anonymous">',
      '  <a class="app-user-status-cta" href="/health-insight">開始體驗</a>',
      '</div>',
    ].join('\n');
  } else if (isGuest) {
    statusMarkup = [
      '<div class="app-user-status app-user-status--guest">',
      '  <span class="app-user-status-badge">體驗模式</span>',
      '  <a class="app-user-status-cta" href="/app/me">登入保存紀錄</a>',
      '</div>',
    ].join('\n');
  } else {
    statusMarkup = [
      '<div class="app-user-status app-user-status--registered">',
      '  <span class="app-user-status-badge">已登入</span>',
      '</div>',
    ].join('\n');
  }

  return [
    '<header class="app-shell-header">',
    '  <a class="app-shell-brand" href="/app">健康陪伴</a>',
    statusMarkup,
    '</header>',
  ].join('\n');
}
