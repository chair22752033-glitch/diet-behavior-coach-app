/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - Home Dashboard（規格PART3「Home Experience」）
 *
 * 責任：使用者進入App Shell之後的第一印象頁面——歡迎區塊＋
 * 功能入口卡片＋Premium入口佔位。純呈現層，只接收呼叫端
 * （`src/routes/app_shell_routes.js`）已經算好的
 * `isAuthenticated`/`isGuest`，不查詢db。
 *
 * ## 歡迎文案的三種身份對應（規格原文＋既有Guest/Registered
 * 語意的延伸）
 *
 * 規格PART3明確只寫了Guest跟Registered兩種歡迎文案。這裡把
 * 「完全匿名（從未登入過）」也歸進Guest的文案桶——理由：兩者
 * 都還沒有累積任何個人健康歷程，"開始了解自己的健康方向"這句
 * 文案對兩者都成立，且延續TASK1.126已經確立的
 * 「Guest跟Anonymous是體驗上相近、但底層identity不同的兩種
 * 狀態」既有結論，不需要為了這裡的歡迎文案另外新增第三種
 * 措辭。
 */
import { escapeHtml } from '../../health_insight/components/html_utils.js';
import { createIllustration } from '../../health_insight/components/illustration.js';
import { createFeatureEntryCard } from '../components/feature_entry_card.js';
import { createPremiumEntryCard } from '../components/premium_entry_card.js';

function renderWelcomeArea(isRegistered) {
  const message = isRegistered ? '歡迎回來，看看你的健康歷程' : '開始了解自己的健康方向';
  return [
    '<section class="app-home-welcome">',
    createIllustration('greeting'),
    `  <h1 class="app-home-welcome-title">${escapeHtml(message)}</h1>`,
    '</section>',
  ].join('\n');
}

/**
 * @param {{isAuthenticated?:boolean, isGuest?:boolean}} [context]
 * @returns {string}
 */
export function renderHomePageContent(context) {
  const safeContext = context && typeof context === 'object' ? context : {};
  const isRegistered = !!safeContext.isAuthenticated && !safeContext.isGuest;

  const featureCards = [
    createFeatureEntryCard({
      key: 'health-insight',
      title: '健康洞察',
      description: '花幾分鐘認識自己現在的健康方向，得到一份屬於你的健康小洞察',
      href: '/health-insight',
      ctaLabel: '開始體驗',
      enabled: true,
    }),
    createFeatureEntryCard({
      key: 'history',
      title: '紀錄',
      description: '回顧你走過的健康歷程，看見自己一步一步往前走',
      href: '/app/history',
      ctaLabel: '查看紀錄',
      enabled: true,
    }),
    createFeatureEntryCard({
      key: 'ai-coach',
      title: 'AI陪伴',
      description: '未來這裡會有更貼近你生活習慣的AI陪伴對話',
      href: '#',
      ctaLabel: '',
      enabled: false,
    }),
    createFeatureEntryCard({
      key: 'nutrition',
      title: '飲食紀錄',
      description: '未來這裡會幫你輕鬆記錄每天的飲食狀態',
      href: '#',
      ctaLabel: '',
      enabled: false,
    }),
  ];

  return [
    renderWelcomeArea(isRegistered),
    '<section class="app-home-features">',
    featureCards.join('\n'),
    '</section>',
    '<section class="app-home-premium">',
    createPremiumEntryCard(),
    '</section>',
  ].join('\n');
}
