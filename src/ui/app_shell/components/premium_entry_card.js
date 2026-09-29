/*
 * Phase 7 TASK 1.127｜Complete App Experience & UX Commercial Layer
 * - Premium Entry Placeholder（規格PART3「Premium entry
 *   placeholder」/PART5「Premium placeholder: membership status
 *   area」共用元件）
 *
 * 責任：純呈現層的Premium入口佔位卡片——**完全不實作付款/
 * 訂閱**（規格明確禁止），只顯示一個描述性的文案跟一個
 * disabled狀態的CTA（`enabled:false`，沒有`href`/沒有任何點擊
 * 會發生的行為），讓產品結構上先有「未來這裡會是付費入口」的
 * 位置。跟`src/membership/`完全無關——這裡不呼叫
 * `canUseFeature()`/`resolveMembershipState()`，純粹是UI層的
 * 視覺佔位，不做任何真正的權限判斷（那是Membership Boundary
 * 既有的職責，本次任務明確禁止修改）。
 */
import { createCardHeader } from '../../health_insight/components/card_header.js';
import { createCardCta } from '../../health_insight/components/card_cta.js';

/**
 * @returns {string}
 */
export function createPremiumEntryCard() {
  return [
    '<div class="hi-card app-premium-entry-card app-premium-entry-card--placeholder">',
    '  <div class="hi-card-body">',
    createCardHeader({ title: '升級你的健康陪伴', underline: 'muted' }),
    '    <div class="hi-card-explanation">未來這裡會是更深入的AI陪伴與個人化健康歷程分析，敬請期待</div>',
    createCardCta({ label: '敬請期待', accent: 'muted', action: 'premium-entry-placeholder' }),
    '  </div>',
    '</div>',
  ].join('\n');
}
