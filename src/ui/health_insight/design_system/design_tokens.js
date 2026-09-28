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
  // 主色調——赤陶橘，溫暖、友善、不刺眼（延續TASK1.114-A設計
  // 規格 + 使用者提供的角色參考圖，用在Health Summary Card）
  primary: '#C8794A',
  primaryDark: '#A85F35',
  primaryLight: '#E8B98C',
  // 強調色——蜂蜜黃，用在Recommendation/正向強調（延續
  // TASK1.115參考圖v2 Dashboard的"建議"卡按鈕顏色）
  accent: '#E0A845',
  accentLight: '#F3D89A',
  // 鼠尾草綠——TASK1.115新增，延續DESIGN_SPECIFICATION.md第2節
  // 已規劃、TASK1.114尚未落地的色彩，對應參考圖角色頭頂嫩芽跟
  // "健康觀察"卡片專屬強調色
  sage: '#8A9B5E',
  sageDark: '#5F6F3E',
  sageLight: '#D7DEC0',
  // 溫和霧藍——TASK1.115新增，對應使用者提供的v2 Dashboard
  // 參考圖裡"進度追蹤"卡片使用的柔和藍色——刻意跟其他三張"有
  // 內容"的卡片（Summary/Observation/Recommendation使用暖色系）
  // 做出區隔，語意是"這是還沒準備好的功能"，不是警示，只是
  // 一種"安靜等待"的視覺語言
  mutedBlue: '#93A7B0',
  mutedBlueDark: '#5F7480',
  mutedBlueLight: '#E1E9EA',
  // 文字色——暖棕灰，不是純黑，降低視覺壓迫感
  textPrimary: '#4A3F35',
  textSecondary: '#8A7A68',
  textOnPrimary: '#FFFDF8',
  // 警示/失敗狀態——溫和霧玫瑰色，延續TASK1.115參考圖角色
  // "抱歉"表情插畫的柔和暖色調整（比TASK1.114既有的赭石色
  // 更貼近參考圖的"溫柔道歉"感，刻意不用刺眼紅色）
  caution: '#C68B76',
  cautionSurface: '#F3E0D6',
  // 邊框/分隔線——柔和、低對比
  border: '#E8D9C3',
  // 選項Chip四色循環——延續TASK1.115參考圖Input Experience
  // v2（4選項灰階排列）觀察到的"依位置循環四色"規則，見
  // components/question_card.js的CHIP_PALETTE
  chipTerracotta: '#E7A98C',
  chipHoney: '#EFCD8E',
  chipSage: '#C3D19E',
  chipRose: '#E3B5AE',
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
  // TASK1.115新增：邊框式卡片變體（用於Question
  // Card）——延續使用者提供的Input Experience參考圖觀察到的
  // "問題卡是白底+暖棕色細邊框，陰影很淺"處理方式，跟Dashboard
  // 卡片"陰影為主、無明顯邊框"的既有樣式刻意做出區隔（見
  // DESIGN_SPECIFICATION.md第4節QuestionCard小節已經記錄的
  // 這個落差，本次任務落地）。
  borderedBorder: `2px solid ${COLOR_TOKENS.primaryLight}`,
  borderedBoxShadow: '0 2px 8px rgba(168, 95, 53, 0.06)',
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
    // TASK1.115新增：box-sizing reset——沒有這條規則時，
    // `.hi-friendly-input`等元件的padding會疊加在width之外，
    // 導致在邊框式卡片（`.hi-card--bordered`）裡跟旁邊的單位
    // 文字（cm/kg/歲）一起排列時，內容可能溢出卡片邊界。這是
    // 標準的CSS reset做法，只影響排版計算，不影響任何顏色/
    // 資料邏輯。
    '.hi-dashboard, .hi-dashboard *, .hi-input-experience, .hi-input-experience * {',
    '  box-sizing: border-box;',
    '}',
    ':root {',
    `  --hi-color-background: ${COLOR_TOKENS.background};`,
    `  --hi-color-surface: ${COLOR_TOKENS.surface};`,
    `  --hi-color-surface-alt: ${COLOR_TOKENS.surfaceAlt};`,
    `  --hi-color-primary: ${COLOR_TOKENS.primary};`,
    `  --hi-color-primary-dark: ${COLOR_TOKENS.primaryDark};`,
    `  --hi-color-primary-light: ${COLOR_TOKENS.primaryLight};`,
    `  --hi-color-accent: ${COLOR_TOKENS.accent};`,
    `  --hi-color-accent-light: ${COLOR_TOKENS.accentLight};`,
    `  --hi-color-sage: ${COLOR_TOKENS.sage};`,
    `  --hi-color-sage-dark: ${COLOR_TOKENS.sageDark};`,
    `  --hi-color-sage-light: ${COLOR_TOKENS.sageLight};`,
    `  --hi-color-muted-blue: ${COLOR_TOKENS.mutedBlue};`,
    `  --hi-color-muted-blue-dark: ${COLOR_TOKENS.mutedBlueDark};`,
    `  --hi-color-muted-blue-light: ${COLOR_TOKENS.mutedBlueLight};`,
    `  --hi-color-text-primary: ${COLOR_TOKENS.textPrimary};`,
    `  --hi-color-text-secondary: ${COLOR_TOKENS.textSecondary};`,
    `  --hi-color-text-on-primary: ${COLOR_TOKENS.textOnPrimary};`,
    `  --hi-color-caution: ${COLOR_TOKENS.caution};`,
    `  --hi-color-caution-surface: ${COLOR_TOKENS.cautionSurface};`,
    `  --hi-color-border: ${COLOR_TOKENS.border};`,
    `  --hi-color-chip-terracotta: ${COLOR_TOKENS.chipTerracotta};`,
    `  --hi-color-chip-honey: ${COLOR_TOKENS.chipHoney};`,
    `  --hi-color-chip-sage: ${COLOR_TOKENS.chipSage};`,
    `  --hi-color-chip-rose: ${COLOR_TOKENS.chipRose};`,
    `  --hi-font-family: ${TYPOGRAPHY_TOKENS.fontFamily};`,
    `  --hi-spacing-outer: ${SPACING_TOKENS.layout.outer};`,
    `  --hi-spacing-section: ${SPACING_TOKENS.layout.section};`,
    `  --hi-card-padding: ${SPACING_TOKENS.card.padding};`,
    `  --hi-card-gap: ${SPACING_TOKENS.card.gap};`,
    `  --hi-card-radius: ${CARD_STYLE_TOKENS.borderRadius};`,
    `  --hi-card-shadow: ${CARD_STYLE_TOKENS.boxShadow};`,
    `  --hi-card-border: ${CARD_STYLE_TOKENS.border};`,
    `  --hi-card-bordered-border: ${CARD_STYLE_TOKENS.borderedBorder};`,
    `  --hi-card-bordered-shadow: ${CARD_STYLE_TOKENS.borderedBoxShadow};`,
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
    '  display: flex;',
    '  align-items: flex-start;',
    '  gap: var(--hi-card-gap);',
    '}',
    // TASK1.115新增：邊框式卡片變體，見CARD_STYLE_TOKENS.
    // borderedBorder的說明——Question Card專用，陰影刻意很淺。
    '.hi-card--bordered {',
    '  box-shadow: var(--hi-card-bordered-shadow);',
    '  border: var(--hi-card-bordered-border);',
    '}',
    // TASK1.115新增：卡片內文字區塊跟插畫區塊各自的排版容器，
    // 讓插畫可以固定在一側（Dashboard卡片靠右、Question
    // Card靠左，由呼叫端決定順序，這裡只提供彈性容器樣式）。
    '.hi-card-body {',
    '  flex: 1;',
    '  min-width: 0;',
    '}',
    '.hi-illustration {',
    '  width: 84px;',
    '  height: 84px;',
    '  object-fit: contain;',
    '  flex-shrink: 0;',
    '  display: block;',
    '}',
    '.hi-illustration--small {',
    '  width: 56px;',
    '  height: 56px;',
    '}',
    // TASK1.115新增：手繪底線裝飾——延續使用者提供的圖示素材
    // （underline-terracotta/sage/honey.webp），放在卡片標題
    // 下方。mutedBlue系列（Behavior Pattern/Progress
    // Placeholder）刻意不用手繪底線圖片（使用者沒有提供藍色
    // 手繪底線素材），改用純CSS畫的虛線取代，語意上也呼應
    // "這是還沒準備好的功能"（虛線＝尚未完成，不是實心手繪
    // 筆觸）。
    '.hi-title-row {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  margin-bottom: 6px;',
    '}',
    '.hi-card-label {',
    `  font-size: ${TYPOGRAPHY_TOKENS.subheading.fontSize};`,
    `  font-weight: ${TYPOGRAPHY_TOKENS.subheading.fontWeight};`,
    '  color: var(--hi-color-text-primary);',
    '}',
    '.hi-title-underline {',
    '  display: block;',
    '  height: 10px;',
    '  width: 72px;',
    '  margin: 2px 0 10px;',
    '  object-fit: contain;',
    '  object-position: left center;',
    '}',
    '.hi-title-underline--muted {',
    '  height: 0;',
    '  width: 56px;',
    '  border-bottom: 3px dashed var(--hi-color-muted-blue);',
    '  margin: 8px 0 12px;',
    '}',
    // TASK1.115新增：卡片底部的行動小標籤（CTA
    // chip）——延續使用者提供的v2 Dashboard參考圖，每張卡片
    // 底部都有一個顏色對應的小按鈕（"查看詳細紀錄"/"查看更多
    // 分析"/"我知道了"/"敬請期待"）。這裡只提供純粹的視覺
    // 樣式，不綁定任何點擊事件（延續整個Health Insight UI
    // Foundation"建立但不接線"的既有模式，未來真正的互動邏輯
    // 由接上路由的任務決定）。
    '.hi-card-cta {',
    '  display: inline-block;',
    '  margin-top: 10px;',
    '  padding: 6px 14px;',
    '  border-radius: 999px;',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  border: none;',
    '  cursor: default;',
    '  font-family: var(--hi-font-family);',
    '}',
    '.hi-card-cta--terracotta { background: var(--hi-color-primary); color: var(--hi-color-text-on-primary); }',
    '.hi-card-cta--sage { background: var(--hi-color-sage); color: var(--hi-color-text-on-primary); }',
    '.hi-card-cta--honey { background: var(--hi-color-accent); color: var(--hi-color-text-on-primary); }',
    '.hi-card-cta--muted { background: var(--hi-color-muted-blue-light); color: var(--hi-color-muted-blue-dark); }',
    // TASK1.115新增：選項Chip——延續使用者提供的Input
    // Experience v2參考圖觀察到的"依位置循環四色"規則（見
    // components/question_card.js的CHIP_PALETTE），不是依語意
    // 判斷正向/負向（那會落入"UI裡做判斷邏輯"的疑慮，純位置
    // 循環才是安全的呈現層規則）。
    '.hi-chip {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '  padding: 10px 16px;',
    '  border-radius: 999px;',
    '  border: none;',
    '  font-family: var(--hi-font-family);',
    `  font-size: ${TYPOGRAPHY_TOKENS.cardText.fontSize};`,
    '  font-weight: 600;',
    '  color: var(--hi-color-text-primary);',
    '  min-height: var(--hi-touch-target);',
    '}',
    '.hi-chip--terracotta { background: var(--hi-color-chip-terracotta); }',
    '.hi-chip--honey { background: var(--hi-color-chip-honey); }',
    '.hi-chip--sage { background: var(--hi-color-chip-sage); }',
    '.hi-chip--rose { background: var(--hi-color-chip-rose); }',
    // TASK1.116新增：Chip現在是真的可以點選的互動元件（見
    // client/interaction_script.js），這裡補上"已選取"的視覺
    // 狀態——用內縮陰影標示，不改變Chip本身的底色（延續"依位置
    // 循環四色，不做語意判斷"既有規則，選取狀態純粹是"這個被
    // 選了"的中性標示）。
    '.hi-chip {',
    '  cursor: pointer;',
    '}',
    '.hi-chip--selected {',
    '  box-shadow: inset 0 0 0 3px var(--hi-color-primary-dark);',
    '}',
    '.hi-empty-state {',
    '  align-items: center;',
    '}',
    // TASK1.115新增：Dashboard標題區塊——延續使用者提供的
    // 參考圖，主標題+副標題+角色歡迎插畫，背景延續頁面底色
    // （不額外加卡片框，見DESIGN_SPECIFICATION.md第6節Section
    // Background既有規則）。
    '.hi-dashboard, .hi-input-experience {',
    '  background: var(--hi-color-background);',
    '  padding: var(--hi-spacing-outer);',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: var(--hi-spacing-section);',
    '  font-family: var(--hi-font-family);',
    '}',
    '.hi-dashboard-header {',
    '  position: relative;',
    '  padding-right: 96px;',
    '}',
    '.hi-dashboard-header-illustration {',
    '  position: absolute;',
    '  top: 0;',
    '  right: 0;',
    '}',
    '.hi-dashboard-title {',
    `  font-size: ${TYPOGRAPHY_TOKENS.heading.fontSize};`,
    `  font-weight: ${TYPOGRAPHY_TOKENS.heading.fontWeight};`,
    '  color: var(--hi-color-text-primary);',
    '  margin: 0 0 6px;',
    '}',
    '.hi-dashboard-subtitle {',
    `  font-size: ${TYPOGRAPHY_TOKENS.body.fontSize};`,
    '  color: var(--hi-color-text-secondary);',
    '  margin: 0;',
    '}',
    // TASK1.115新增：Observation/Recommendation單卡清單樣式——
    // 對應observation_card.js/recommendation_card.js從"每筆
    // 一張卡"改成"一張卡裡的清單"的結構調整。
    '.hi-observation-list, .hi-recommendation-list {',
    '  list-style: none;',
    '  margin: 0;',
    '  padding: 0;',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 8px;',
    '}',
    '.hi-observation-item, .hi-recommendation-item {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  gap: 12px;',
    `  font-size: ${TYPOGRAPHY_TOKENS.cardText.fontSize};`,
    '}',
    '.hi-observation-item-label, .hi-recommendation-item-label {',
    '  color: var(--hi-color-text-secondary);',
    '}',
    '.hi-observation-item-value, .hi-recommendation-item-value {',
    '  color: var(--hi-color-text-primary);',
    '  font-weight: 600;',
    '}',
    '.hi-card-explanation {',
    `  font-size: ${TYPOGRAPHY_TOKENS.body.fontSize};`,
    '  line-height: 1.7;',
    '  color: var(--hi-color-text-primary);',
    '}',
    // TASK1.115新增：Question Card內部排版——問題文字、選項
    // 排列、輸入框樣式。
    '.hi-card-question {',
    `  font-size: ${TYPOGRAPHY_TOKENS.subheading.fontSize};`,
    `  font-weight: ${TYPOGRAPHY_TOKENS.subheading.fontWeight};`,
    '  margin-bottom: 10px;',
    '}',
    '.hi-choice-options {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  gap: 8px;',
    '}',
    '.hi-input-row {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  min-width: 0;',
    '  width: 100%;',
    '}',
    '.hi-friendly-input {',
    '  flex: 1 1 auto;',
    '  min-width: 0;',
    '  width: 100%;',
    '  border: var(--hi-card-bordered-border);',
    '  border-radius: 14px;',
    '  padding: 12px 14px;',
    `  font-size: ${TYPOGRAPHY_TOKENS.heading.fontSize};`,
    '  font-family: var(--hi-font-family);',
    '  color: var(--hi-color-text-primary);',
    '  background: var(--hi-color-surface-alt);',
    '  min-height: var(--hi-touch-target);',
    '}',
    '.hi-input-unit {',
    '  flex: 0 0 auto;',
    '  color: var(--hi-color-text-secondary);',
    `  font-size: ${TYPOGRAPHY_TOKENS.cardText.fontSize};`,
    '  white-space: nowrap;',
    '}',
    // TASK1.115新增：Input Experience底部的大型CTA主按鈕——
    // 延續使用者提供的參考圖"開始整理我的健康洞察 →"/"開始
    // 記錄今天"按鈕樣式，滿版寬度、完全圓角、赤陶橘實心底。
    '.hi-primary-button {',
    '  display: block;',
    '  width: 100%;',
    '  border: none;',
    '  border-radius: 999px;',
    '  background: var(--hi-color-primary);',
    '  color: var(--hi-color-text-on-primary);',
    '  padding: 16px 24px;',
    '  font-size: 17px;',
    '  font-weight: 700;',
    '  font-family: var(--hi-font-family);',
    '  min-height: var(--hi-touch-target);',
    '  cursor: pointer;',
    '}',
    // TASK1.116新增：主按鈕現在是真的會觸發送出動作的互動元件
    // （見client/interaction_script.js），這裡補上loading/disabled
    // 視覺狀態——降低透明度＋游標恢復預設，不新增任何動畫/圖示，
    // 延續"低壓力、不製造等待焦慮"的既有設計原則。
    '.hi-primary-button:disabled, .hi-primary-button--loading {',
    '  opacity: 0.6;',
    '  cursor: default;',
    '}',
    `@media (min-width: ${BREAKPOINT_TOKENS.tablet}) {`,
    '  .hi-card { padding: calc(var(--hi-card-padding) * 1.2); }',
    '  .hi-illustration { width: 104px; height: 104px; }',
    '}',
    `@media (min-width: ${BREAKPOINT_TOKENS.desktop}) {`,
    '  .hi-dashboard { max-width: 720px; margin: 0 auto; }',
    '  .hi-input-experience { max-width: 720px; margin: 0 auto; }',
    '}',
  ].join('\n');
}
