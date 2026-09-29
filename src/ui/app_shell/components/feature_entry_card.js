/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - Feature Entry Card（首頁功能入口卡片）
 *
 * 責任：規格PART3「Home Experience」要求的「Feature entry
 * cards」——純呈現層，重用既有`src/ui/health_insight/
 * components/`的`createCardHeader()`/`createCardCta()`跟
 * `.hi-card`既有class（規格明確要求："Reuse existing 拙趣
 * design tokens / Health Insight visual language"，不建立新的
 * 設計系統），讓首頁的功能入口卡片跟Health Insight Dashboard
 * 既有卡片維持一致的視覺語言。
 *
 * 已上線功能（Health Insight／紀錄）用真正的`<a>`連結；尚未
 * 開發的功能（AI陪伴／飲食紀錄）用`enabled:false`標記成
 * placeholder——延續`navigation.js`同樣的placeholder原則，不
 * 產生死連結，只是先佔住產品結構的位置。
 */
import { escapeHtml } from '../../health_insight/components/html_utils.js';
import { createCardHeader } from '../../health_insight/components/card_header.js';
import { createCardCta } from '../../health_insight/components/card_cta.js';

/**
 * @param {{title:string, description:string, href:string, ctaLabel:string, enabled?:boolean}} config
 * @returns {string}
 */
export function createFeatureEntryCard(config) {
  const safeConfig = config && typeof config === 'object' ? config : {};
  const title = typeof safeConfig.title === 'string' ? safeConfig.title : '';
  const description = typeof safeConfig.description === 'string' ? safeConfig.description : '';
  const href = typeof safeConfig.href === 'string' ? safeConfig.href : '#';
  const ctaLabel = typeof safeConfig.ctaLabel === 'string' ? safeConfig.ctaLabel : '';
  const enabled = safeConfig.enabled !== false;

  const cardClassNames = ['hi-card', 'app-feature-entry-card'];
  if (!enabled) cardClassNames.push('app-feature-entry-card--placeholder');

  const body = [
    createCardHeader({ title, underline: 'muted' }),
    `    <div class="hi-card-explanation">${escapeHtml(description)}</div>`,
    enabled
      ? createCardCta({ label: ctaLabel, accent: 'muted', action: `feature-entry-${escapeHtml(safeConfig.key || title)}` })
      : createCardCta({ label: '敬請期待', accent: 'muted', action: `feature-entry-placeholder-${escapeHtml(safeConfig.key || title)}` }),
  ].join('\n');

  if (!enabled) {
    return [
      `<div class="${cardClassNames.join(' ')}">`,
      '  <div class="hi-card-body">',
      body,
      '  </div>',
      '</div>',
    ].join('\n');
  }

  return [
    `<a class="${cardClassNames.join(' ')}" href="${escapeHtml(href)}">`,
    '  <div class="hi-card-body">',
    body,
    '  </div>',
    '</a>',
  ].join('\n');
}
