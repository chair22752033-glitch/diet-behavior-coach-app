/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - User Center（規格PART5「User Center Foundation」）
 *
 * 責任：「我的」頁面——Guest顯示體驗模式說明＋登入CTA，
 * Registered顯示帳號狀態＋紀錄入口，兩者都看得到Premium
 * membership狀態佔位區塊（規格明確要求：不實作付款/訂閱，只
 * 準備UI結構）。純呈現層，不查詢db、不判斷任何真正的權限。
 */
import { createIllustration } from '../../health_insight/components/illustration.js';
import { createCardHeader } from '../../health_insight/components/card_header.js';
import { createCardCta } from '../../health_insight/components/card_cta.js';
import { createPremiumEntryCard } from '../components/premium_entry_card.js';

function renderGuestAccountCard() {
  return [
    '<div class="hi-card app-user-center-card">',
    createIllustration('behaviorPatternPlaceholder'),
    '  <div class="hi-card-body">',
    createCardHeader({ title: '你的帳號', underline: 'muted' }),
    '    <div class="hi-card-explanation">目前為體驗模式——你可以自由使用健康小洞察，但這次的內容不會被保存；登入後可以保存你的健康歷程，開始累積屬於你的健康紀錄</div>',
    createCardCta({ label: '登入保存你的健康紀錄', accent: 'muted', action: 'app-user-center-guest-login' }),
    '  </div>',
    '</div>',
  ].join('\n');
}

function renderRegisteredAccountCard() {
  return [
    '<div class="hi-card app-user-center-card">',
    '  <div class="hi-card-body">',
    createCardHeader({ title: '你的帳號', underline: 'muted' }),
    '    <div class="hi-card-explanation">已登入，你的健康歷程會持續被保存下來</div>',
    '    <a class="app-user-center-history-entry" href="/app/history">查看我的紀錄</a>',
    '  </div>',
    '</div>',
  ].join('\n');
}

/**
 * @param {{isAuthenticated?:boolean, isGuest?:boolean}} [context]
 * @returns {string}
 */
export function renderUserCenterPageContent(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const isRegistered = !!safeContext.isAuthenticated && !safeContext.isGuest;

  const accountCard = isRegistered ? renderRegisteredAccountCard() : renderGuestAccountCard();

  return [
    '<section class="app-user-center-page" data-app-page="user-center">',
    accountCard,
    createPremiumEntryCard(),
    '</section>',
  ].join('\n');
}
