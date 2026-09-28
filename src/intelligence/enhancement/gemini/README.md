# Gemini Enhancement Layer（Phase 6 TASK1.121）

## 目的

在既有 Health Insight 結果算好之後，選填地用 Gemini 把
`recommendation`/`healthObservation`等內容改寫成更口語化、更友善
的說明文字（`enhancedExplanation`），提升使用者體驗。**Gemini
不是智慧來源**——analysis/recommendation/health insight result
的產生完全由既有 Capability 負責，Gemini 只負責「解釋得更好」。

## 架構位置

```
Health Insight Result（成功的Structured Product Response，TASK1.117既有形狀）
  ↓
Gemini Enhancement Layer（這裡）
  ↓
Enhanced Explanation
  ↓
User Presentation
```

## Provider Abstraction

```
任何AI供應商（Gemini/未來的其他供應商）
  ↓ 實作
AI Provider Interface（src/intelligence/enhancement/provider/）
  ↓ 被呼叫
Enhancement Service（這裡的gemini_enhancer.js）→ Product Layer
```

Gemini 只是第一個插進 Provider Interface 的具體實作
（`gemini_provider.js`）。未來如果要換/加別的供應商，只需要新增一個
符合 `{name, requestEnhancement(input)}` 介面的新 provider，
`gemini_enhancer.js` 完全不需要跟著改（把 provider 換掉即可）。

## 目錄結構

```
src/intelligence/enhancement/
  provider/
    ai_provider_contract.js   AI Provider Interface定義（isValidAiProvider）
    index.js
  gemini/
    README.md                  本文件
    gemini_client.js            純HTTP client，唯一呼叫Gemini API的地方
    gemini_provider.js          把gemini_client包成AI Provider Interface，含prompt組裝與Output Boundary過濾
    gemini_enhancer.js          Enhancement Service，唯一對外進入點，含Input Boundary過濾與Failure Handling
    index.js                    統一輸出入口
```

對應的設定層：

```
src/config/gemini_config.js   讀取env.GEMINI_API_KEY，延續auth_config.js既有慣例
```

## Core Principle（規格明確要求）

Gemini **不會**、也**不能**：
- 取代 Analysis Capability / Recommendation Capability
- 修改 Capability Orchestrator / Runtime
- 產生醫療診斷
- 捏造資料裡沒有的健康數據
- 覆寫既有的 `structuredResponse`（`enhanceHealthInsightResult()`
  永遠回傳一段獨立的 `enhancedExplanation`字串，不會修改傳入的
  `structuredResponse`本身）

## Input Boundary（規格明確要求）

送給 Gemini 的內容只有 `buildEnhancementInput()` 從
`structuredResponse.data`挑出的四個欄位：
`healthObservation`/`recommendation`/`behaviorPattern`/
`progressTrend`。

**明確不送**：`decision`欄位、identity（userId/provider）、OAuth
token、session token、db credentials、runtime metadata、
capability internal tags、execution stages、stack trace——這整條
呼叫鏈（route → enhancer → provider → client）從頭到尾都拿不到這些
東西，因為呼叫端只會傳 `structuredResponse` 本身。

## Output Boundary（規格明確要求）

Gemini 回應的原始文字視為不可信的外部內容，`gemini_provider.js`
的 `sanitizeExplanation()` 只允許純文字通過（移除控制字元、限制
長度上限600字），**不會**回傳：internal reasoning、hidden chain of
thought、Gemini API 原始回應物件（safety ratings/finish
reason/token usage等）。呼叫端只會拿到一個乾淨的字串或
`{ok:false, reason}`。

## Failure Handling（規格明確要求）

`enhanceHealthInsightResult()` 永遠不會拋出例外，任何失敗（未設定
`GEMINI_API_KEY`、網路錯誤、Gemini API回傳非200、回應格式不符、
Health Insight本身失敗、任何未預期例外）都安全回傳
`{ok:false, reason}`。`src/routes/health_insight_routes.js`呼叫
這個函式後，只在成功時才把 `enhancedExplanation` 加進回應的
`data`欄位——失敗時回應維持跟TASK1.120之前完全一樣的
`{ok:true, data:{html}}`形狀，使用者永遠拿得到原本的 Health
Insight 結果。

## Health Insight Flow Integration

`src/routes/health_insight_routes.js`的POST `/api/health-insight`
handler在既有的`saveHealthInsightRecord()`呼叫之後，額外呼叫一次
`enhanceHealthInsightResult(structuredResponse, {env: ctx.env})`。
成功時把`enhancedExplanation`加進回應的`data`（`{html,
enhancedExplanation}`），失敗時`data`維持`{html}`不變。這個呼叫
**不會**影響已經算好的`html`、也**不會**影響
`saveHealthInsightRecord()`存進D1的內容（Persistence Service持續
只存原始`structuredResponse`，不含任何Gemini產生的內容——本次
任務沒有修改資料庫schema）。

## Configuration

- `GEMINI_API_KEY`：透過 Cloudflare 既有的環境變數/secret機制設定
  （例如`wrangler secret put GEMINI_API_KEY`），本次任務**沒有**在
  `wrangler.toml`寫入任何真正的金鑰值，也沒有在任何程式碼裡硬編碼
  金鑰。
- 沒有設定這個環境變數時，`getGeminiConfig(env).configured`為
  `false`，`enhanceHealthInsightResult()`安全回傳
  `{ok:false, reason:'missing_api_key'}`，不影響任何既有功能。

## Future Compatibility（規格明確要求，本次任務不實作）

- **UI呈現**：`enhancedExplanation`目前只出現在API JSON回應裡，
  `src/ui/health_insight/render_product_response.js`完全沒有被
  修改，還不會把這段文字渲染進HTML——留給未來任務決定怎麼呈現。
- **Premium/Membership**：未來如果「Gemini增強說明」變成付費功能，
  可以在呼叫`enhanceHealthInsightResult()`之前，外面包一層
  `resolveFeaturePermission()`（TASK1.118既有的inert
  placeholder）檢查，本次任務沒有串接。
- **多供應商**：Provider Abstraction已經準備好，未來新增別的AI
  供應商只需要實作`{name, requestEnhancement(input)}`介面。

## Current Limitations（目前限制）

- 沒有把`enhancedExplanation`存進D1（Persistence Service只存
  原始結果，Gemini增強說明是ephemeral、每次請求各自獨立產生）。
- 沒有任何UI改動去顯示這段文字。
- 沒有重試機制——Gemini API呼叫失敗一次就視為這次請求的增強
  失敗，不會自動重試。
