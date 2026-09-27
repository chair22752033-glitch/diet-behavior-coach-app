/*
 * Phase 6 TASK 1.114｜Health Insight UI/UX Implementation
 * Foundation
 * （TASK1.115後更新：從emoji佔位符升級成真正的插畫資產，見
 * 下方"TASK1.115更新"區塊）
 * - Asset Registry（插畫資產整合邊界）
 *
 * 責任：定義Health Insight需要的「手繪插畫感」視覺資產有哪些
 * 語意化的插槽（slot），並提供存取函式，讓元件完全不需要知道
 * 資產實際存放在哪裡、用什麼格式——只需要呼叫
 * `getAssetUrl('greeting')`，就能拿到目前註冊的插畫檔案路徑。
 * 未來如果要整批更換插畫風格，只需要修改這個檔案裡的
 * `ASSET_REGISTRY`，**不需要修改任何一個元件檔案本身**。
 *
 * ## TASK1.115更新：從emoji佔位符升級成真正的插畫資產
 *
 * TASK1.114建立這個Registry時，本次任務規格明確禁止產生任何
 * 最終插畫資產，所以每個插槽的內容是純文字emoji（🌱/🔍/
 * 🌤️等），只是先把"插槽"這個抽象概念定義出來。
 *
 * TASK1.115（本次更新）收到使用者親自提供的八張「拙趣風格」
 * Health Insight參考圖（角色設定圖、Dashboard/Input
 * Experience手機模擬圖、表情速寫等），這些是**使用者自己
 * 提供、已經完成的插畫素材**，不是本次任務生成的——所以可以
 * 直接使用，不違反"不產生新圖片"的限制（限制針對的是"用AI
 * 生成新圖片"，不是"使用使用者已經給的既有素材"）。經過裁切/
 * 去背/壓縮（使用`sharp`函式庫做純粹的影像處理，不是AI生成）
 * 後，存放在`illustrations/`子目錄，這裡的`ASSET_REGISTRY`
 * 從"emoji佔位符"升級成"真正的插畫檔案路徑"。
 *
 * ## 資產存放方式：一般檔案路徑，不是base64（TASK1.115的
 * 明確技術決策，理由如下）
 *
 * - **檔案大小**：七張角色插畫+三張手繪底線，壓縮後總共約
 *   390KB。如果改成base64內嵌進JS原始碼，會膨脹成約520KB的
 *   純文字塞進元件檔案裡，讓原本輕量的"Foundation"程式碼變得
 *   臃腫，也會拖慢每次`import`這個模組時的parse時間。
 * - **可維護性**：延續TASK1.114已經確立的Asset
 *   Boundary設計原則——未來設計師要更新插畫時，應該能直接
 *   替換一個圖片檔案，不需要碰觸任何JS原始碼、不需要重新
 *   跑一次base64編碼流程。一般檔案路徑完全符合這個"檔案是
 *   檔案、程式碼是程式碼"的分離原則。
 * - **Cloudflare Workers環境考量**：這個App本身部署在
 *   Cloudflare Worker上，Worker script本身有大小限制，把
 *   數百KB的base64圖片內嵌進會被打包進Worker的JS檔案裡，
 *   會不必要地佔用這個限制額度；反之，真正的圖片檔案未來
 *   應該透過靜態資產機制（例如Cloudflare Pages/Workers
 *   Assets/R2）獨立提供，不佔用Worker script本身的大小預算。
 * - **本次任務沒有把這些資產接進真正的路由**（延續整個
 *   Health Insight UI Foundation"建立但不接線"的既有
 *   模式）——`ASSET_BASE_PATH`目前只是一個**約定路徑**
 *   （`/assets/health-insight/illustrations/`），代表"未來
 *   這些檔案應該被伺服在這個路徑底下"，真正把這個路徑接上
 *   實際的靜態檔案伺服機制，留給未來接上路由的任務決定。
 *
 * 簡言之：一般檔案路徑對這個階段的Foundation來說更輕量、更
 * 好維護，base64只有在"完全不能依賴外部檔案伺服"的極端情境
 * 才划算，這裡不是那種情境。
 */

/**
 * 未來實際伺服這些插畫檔案的路徑前綴——目前是**約定路徑**，
 * 本次任務沒有建立任何route/controller去真正伺服這個路徑
 * 底下的檔案（延續"建立但不接線"模式）。
 */
export const ASSET_BASE_PATH = '/assets/health-insight/illustrations/';

/**
 * 所有Health Insight需要的插畫語意插槽——每個插槽有：
 * - `description`：這個插畫要傳達的情境/情緒（給文件/設計
 *   討論用，不是給使用者看的內容）
 * - `file`：`illustrations/`子目錄底下的實際檔案名稱
 * - `alt`：圖片的無障礙替代文字（`<img alt="...">`），同時也
 *   是`getAssetPlaceholder()`向下相容回傳的文字內容（見下方
 *   說明）
 */
export const ASSET_REGISTRY = {
  greeting: {
    description: '陪伴角色抱著愛心、溫暖歡迎的插畫，用在Dashboard標題區塊跟Health Summary Card',
    file: 'companion-greeting.webp',
    alt: '陪伴角色開心地抱著一顆愛心',
  },
  observation: {
    description: '陪伴角色拿放大鏡溫柔觀察幼苗的插畫，用在Health Observation Card',
    file: 'companion-observing.webp',
    alt: '陪伴角色拿著放大鏡，好奇地看著土裡剛發芽的小幼苗',
  },
  recommendation: {
    description: '陪伴角色開心喝著溫飲、比讚的插畫，用在Recommendation Card',
    file: 'companion-recommending.webp',
    alt: '陪伴角色開心地喝著溫熱的飲品，對你比讚',
  },
  behaviorPatternPlaceholder: {
    description: '陪伴角色安靜坐著喝茶、若有所思的插畫，用在Behavior Pattern預留卡片',
    file: 'companion-reflecting.webp',
    alt: '陪伴角色安靜地坐著，捧著一杯溫茶，若有所思',
  },
  progressPlaceholder: {
    description: '陪伴角色開心走在探索小徑上的插畫，用在Progress預留卡片',
    file: 'companion-progressing.webp',
    alt: '陪伴角色開心地走在鋪著石頭的小徑上，一步一步向前',
  },
  questionCard: {
    description: '陪伴角色開心揮手、邀請互動的插畫，用在Input Experience問題卡片',
    file: 'companion-inviting.webp',
    alt: '陪伴角色開心地張開雙手，像是在邀請你聊聊今天的感受',
  },
  errorGentle: {
    description: '陪伴角色溫柔低頭、表示暫時遇到小狀況的插畫，用在Error Card',
    file: 'companion-apologetic.webp',
    alt: '陪伴角色輕輕低著頭，表情有點難過，像是在說暫時遇到一點小狀況',
  },
};

/**
 * 三種手繪底線裝飾——延續DESIGN_SPECIFICATION.md第5節已經
 * 記錄的"未來需要的插畫資產"清單，這裡是其中一項的落地。放在
 * 卡片標題下方，顏色對應各卡片的專屬強調色（Health Summary/
 * Recommendation用赤陶橘、Observation用鼠尾草綠、
 * 另一張用蜂蜜黃）。Behavior Pattern/Progress兩張"功能預留"
 * 卡片刻意**不使用**這三種手繪底線（使用者沒有提供霧藍色的
 * 手繪底線素材），改用純CSS虛線表示，見
 * `design_tokens.js`的`.hi-title-underline--muted`。
 */
export const UNDERLINE_REGISTRY = {
  terracotta: { file: 'underline-terracotta.webp', alt: '' },
  sage: { file: 'underline-sage.webp', alt: '' },
  honey: { file: 'underline-honey.webp', alt: '' },
};

const ASSET_KEYS = Object.freeze(Object.keys(ASSET_REGISTRY));
const UNDERLINE_KEYS = Object.freeze(Object.keys(UNDERLINE_REGISTRY));

/**
 * @returns {string[]} 目前註冊的所有插畫插槽名稱（唯讀）
 */
export function listAssetKeys() {
  return [...ASSET_KEYS];
}

/**
 * @returns {string[]} 目前註冊的所有底線顏色名稱（唯讀）
 */
export function listUnderlineKeys() {
  return [...UNDERLINE_KEYS];
}

/**
 * 讀取某個插槽的完整資產URL（`ASSET_BASE_PATH` +
 * 檔案名稱）——找不到對應插槽時安全回傳空字串，不拋出例外
 * （延續整個系列"缺席不是例外"的既有慣例）。
 *
 * @param {string} key
 * @returns {string}
 */
export function getAssetUrl(key) {
  const entry = ASSET_REGISTRY[key];
  return entry && typeof entry.file === 'string' ? ASSET_BASE_PATH + entry.file : '';
}

/**
 * 讀取某個插槽的無障礙替代文字——找不到對應插槽時安全回傳
 * 空字串。
 *
 * @param {string} key
 * @returns {string}
 */
export function getAssetAlt(key) {
  const entry = ASSET_REGISTRY[key];
  return entry && typeof entry.alt === 'string' ? entry.alt : '';
}

/**
 * 讀取某個底線顏色的完整資產URL——找不到對應顏色時安全回傳
 * 空字串。
 *
 * @param {string} colorKey - 'terracotta'|'sage'|'honey'
 * @returns {string}
 */
export function getUnderlineUrl(colorKey) {
  const entry = UNDERLINE_REGISTRY[colorKey];
  return entry && typeof entry.file === 'string' ? ASSET_BASE_PATH + entry.file : '';
}

/**
 * @deprecated TASK1.115後：這個插槽已經從emoji佔位符升級成
 * 真正的插畫檔案（見上方`getAssetUrl()`），這個函式**不再
 * 回傳emoji**——為了不讓既有呼叫端（如果有）完全失去這個
 * 函式可用，這裡改回傳跟`getAssetAlt()`相同的無障礙替代
 * 文字，當作純文字情境（例如沒有圖片支援的環境）下的文字
 * 後備內容。新程式碼請直接呼叫`getAssetUrl()`/
 * `getAssetAlt()`，不要依賴這個函式回傳emoji。
 *
 * @param {string} key
 * @returns {string}
 */
export function getAssetPlaceholder(key) {
  return getAssetAlt(key);
}

/**
 * 讀取某個插槽的說明文字——用於文件/設計討論，不是給使用者
 * 看的內容。
 *
 * @param {string} key
 * @returns {string}
 */
export function getAssetDescription(key) {
  const entry = ASSET_REGISTRY[key];
  return entry && typeof entry.description === 'string' ? entry.description : '';
}
