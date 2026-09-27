/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * - Design Tokens（設計系統基礎）
 *
 * 責任：定義Health Insight視覺系統的「拙趣」風格基礎——顏色、
 * 字體、間距、卡片樣式。這個檔案本身**不**產生任何HTML、**不**
 * 依賴任何DOM/瀏覽器API，單純是一組純資料（token）跟一個把
 * token組成CSS字串的函式，供`components/`底下的元件跟未來的
 * 頁面組裝使用。
 *
 * ## 為什麼是「拙趣」而不是傳統醫療儀表板
 *
 * 延續本次任務規格的Design Direction："Health Insight UI
 * should not look like a traditional medical
 * dashboard"——傳統醫療/健康追蹤介面常見的冷色系（醫療藍/
 * 警示紅/純白底）容易讓使用者感到被"監控"、被"評判"，跟
 * TASK1.106已確認的產品願景"陪伴使用者理解自己"（而不是
 * "監控使用者健康數據"）互相矛盾。「拙趣」風格的核心是：
 * 溫暖、手感、簡單但好記、像朋友陪伴，不是精密儀器。
 *
 * ## 顏色方向（規格要求：warm and friendly，避免hospital
 * style/aggressive warning colors）
 *
 * 選用溫暖的米杏色（cream）當底色、赤陶橘（terracotta）當
 * 主色調、柔和的蜂蜜黃（honey）當強調色——刻意跟既有App首頁
 * 已經使用的鼠尾草綠（#6A7E50，見`src/worker.js`）區隔開來，
 * 讓Health Insight有自己獨立、可辨識的"陪伴感"視覺身分，
 * 但同時保持柔和飽和度、圓角、柔和陰影這些跟既有App一致的
 * 溫暖調性，不會顯得突兀。**完全不使用**醫療感的純白/冷藍/
 * 高飽和度警示紅——即使是"失敗/錯誤"狀態，也用溫暖的赭石色
 * （ochre）取代刺眼的警示紅，延續"降低焦慮感"的設計原則。
 *
 * 明確要求：
 * - ❌ 不使用醫療藍（#0066CC類型的冷色系藍）
 * - ❌ 不使用高飽和度警示紅（#FF0000類型）
 * - ❌ 不使用純白（#FFFFFF）當主要背景（改用米杏色）
 * - ✅ 使用溫暖、低飽和度的色調
 * - ✅ 失敗/警示狀態用溫暖的赭石色，不用刺眼紅色
 */

/**
 * 顏色Token——延續上方"拙趣"色彩方向。命名採用語意化
 * （semantic）命名（例如`surface`/`accent`/`caution`），不是
 * 直接寫死的十六進位色碼在元件裡到處出現，方便未來整體調整
 * 色彩而不需要修改每一個元件檔案。
 */
export const COLOR_TOKENS = {
  // 背景層——溫暖米杏色系，不是純白/冷灰
  background: '#FBF3E7',
  surface: '#FFFDF8',
  surfaceAlt: '#F5E9D8',
  // 主色調——赤陶橘，溫暖、友善、不刺眼
  primary: '#C8794A',
  primaryDark: '#A85F35',
  primaryLight: '#E8B98C',
  // 強調色——蜂蜜黃，用在Recommendation/正向強調
  accent: '#E0A845',
  accentLight: '#F3D89A',
  // 文字色——暖棕灰，不是純黑，降低視覺壓迫感
  textPrimary: '#4A3F35',
  textSecondary: '#8A7A68',
  textOnPrimary: '#FFFDF8',
  // 警示/失敗狀態——溫暖赭石色，刻意不用刺眼紅色
  caution: '#B8703F',
  cautionSurface: '#F2E0CC',
  // 邊框/分隔線——柔和、低對比
  border: '#E8D9C3',
};

/**
 * 字體Token——定義heading/body/card text三種樣式，延續規格
 * 要求的Typography分類。字體家族沿用既有App
 * 已使用的無襯線字體堆疊（延續一致的可讀性），但字重/字距
 * 刻意調得比醫療介面更柔和（不用超粗黑體製造壓迫感）。
 */
export const TYPOGRAPHY_TOKENS = {
  fontFamily: "-apple-system, 'PingFang TC', 'Microsoft JhengHei', sans-serif",
  heading: { fontSize: '22px', fontWeight: '700', lineHeight: '1.4', letterSpacing: '0.3px' },
  subheading: { fontSize: '16px', fontWeight: '600', lineHeight: '1.5', letterSpacing: '0.2px' },
  body: { fontSize: '15px', fontWeight: '400', lineHeight: '1.75', letterSpacing: '0px' },
  cardText: { fontSize: '14px', fontWeight: '500', lineHeight: '1.6', letterSpacing: '0.1px' },
  caption: { fontSize: '12px', fontWeight: '400', lineHeight: '1.5', letterSpacing: '0.2px' },
};

/**
 * 間距Token——定義layout/card/interaction三種間距情境，延續
 * 規格要求的Spacing分類。統一用4px為基準的等比級數，避免
 * 元件之間出現不一致的隨意數值。
 */
export const SPACING_TOKENS = {
  layout: { outer: '20px', section: '28px' },
  card: { padding: '18px', gap: '14px', radius: '20px' },
  interaction: { touchTarget: '44px', gap: '10px' },
};

/**
 * 卡片樣式Token——延續規格要求的Card Style分類（rounded
 * structure、friendly visual hierarchy）。大圓角（20px）+柔和
 * 陰影，刻意避免銳利直角邊框（延續"拙趣"手感、非精密儀器的
 * 視覺語言）。
 */
export const CARD_STYLE_TOKENS = {
  borderRadius: SPACING_TOKENS.card.radius,
  boxShadow: '0 6px 20px rgba(168, 95, 53, 0.12)',
  border: `1px solid ${COLOR_TOKENS.border}`,
};

/**
 * Responsive斷點Token——延續規格要求的Responsive
 * Preparation，確保基礎同時支援desktop/tablet/mobile，不是
 * 只針對單一尺寸優化。
 */
export const BREAKPOINT_TOKENS = {
  mobile: '0px',
  tablet: '680px',
  desktop: '1024px',
};

/**
 * 把上面所有token組成一份完整的CSS字串（使用CSS Custom
 * Properties，`:root`層級），供未來的頁面/元件`<style>`區塊
 * 直接引用。這個函式本身是純函式，輸入不變則輸出永遠相同
 * （deterministic），不讀取Date.now()/Math.random()/任何外部
 * 狀態。
 *
 * @returns {string}
 */
export function getDesignSystemCSS() {
  return [
    ':root {',
    `  --hi-color-background: ${COLOR_TOKENS.background};`,
    `  --hi-color-surface: ${COLOR_TOKENS.surface};`,
    `  --hi-color-surface-alt: ${COLOR_TOKENS.surfaceAlt};`,
    `  --hi-color-primary: ${COLOR_TOKENS.primary};`,
    `  --hi-color-primary-dark: ${COLOR_TOKENS.primaryDark};`,
    `  --hi-color-primary-light: ${COLOR_TOKENS.primaryLight};`,
    `  --hi-color-accent: ${COLOR_TOKENS.accent};`,
    `  --hi-color-accent-light: ${COLOR_TOKENS.accentLight};`,
    `  --hi-color-text-primary: ${COLOR_TOKENS.textPrimary};`,
    `  --hi-color-text-secondary: ${COLOR_TOKENS.textSecondary};`,
    `  --hi-color-text-on-primary: ${COLOR_TOKENS.textOnPrimary};`,
    `  --hi-color-caution: ${COLOR_TOKENS.caution};`,
    `  --hi-color-caution-surface: ${COLOR_TOKENS.cautionSurface};`,
    `  --hi-color-border: ${COLOR_TOKENS.border};`,
    `  --hi-font-family: ${TYPOGRAPHY_TOKENS.fontFamily};`,
    `  --hi-spacing-outer: ${SPACING_TOKENS.layout.outer};`,
    `  --hi-spacing-section: ${SPACING_TOKENS.layout.section};`,
    `  --hi-card-padding: ${SPACING_TOKENS.card.padding};`,
    `  --hi-card-gap: ${SPACING_TOKENS.card.gap};`,
    `  --hi-card-radius: ${CARD_STYLE_TOKENS.borderRadius};`,
    `  --hi-card-shadow: ${CARD_STYLE_TOKENS.boxShadow};`,
    `  --hi-card-border: ${CARD_STYLE_TOKENS.border};`,
    `  --hi-touch-target: ${SPACING_TOKENS.interaction.touchTarget};`,
    '}',
    '.hi-card {',
    '  background: var(--hi-color-surface);',
    '  border-radius: var(--hi-card-radius);',
    '  box-shadow: var(--hi-card-shadow);',
    '  border: var(--hi-card-border);',
    '  padding: var(--hi-card-padding);',
    '  font-family: var(--hi-font-family);',
    '  color: var(--hi-color-text-primary);',
    '}',
    `@media (min-width: ${BREAKPOINT_TOKENS.tablet}) {`,
    '  .hi-card { padding: calc(var(--hi-card-padding) * 1.2); }',
    '}',
    `@media (min-width: ${BREAKPOINT_TOKENS.desktop}) {`,
    '  .hi-dashboard { max-width: 720px; margin: 0 auto; }',
    '}',
  ].join('\n');
}
