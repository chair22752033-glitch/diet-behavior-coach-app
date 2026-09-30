# 飲食主場秀 — Round 5 最終驗收報告（Final Acceptance）

**日期：** 2026-09-30
**分支：** `claude/wrangler-deploy-c821f3`
**基準 commit：** `7c78ffb`
**本輪起點：** `46772c6`（Round 5 實作）→ `02c82d1`（Round 5 報告）
**最終驗收 commit：** `636d5ab`（已推送 origin）

本輪為「最終完成與驗收」：對照原始 inventory 逐一補齊/驗證、走完整儲存流程、驗證設定變更本身、正確歸類 Gemini、擷取真實截圖、確認可部署狀態。這不是新的重設計。

---

## 0. 本輪相對 Round 5 的變更檔案（`46772c6..636d5ab`）

| 檔案 | 變更 | 原因 |
| --- | --- | --- |
| `src/worker.js` | 資產分支同時比對 `/ui-assets/` 與 `/assets/health-insight/`；清掉 13 個殘留的跳脫 `‍`(ZWJ) 與其後多餘空白 | 讓 Health Insight 插畫能被服務；補完 Round 5 emoji strip 遺留的隱形字元 |
| `src/ui/health_insight/pages/input_page.js` | 清空性別/目標選項的 7 個 emoji `icon`（`question_card.js` 本就守衛空 icon → 不產生空 span） | 移除全站最後一批內建裝飾 emoji |
| `public/assets/health-insight/illustrations/*.webp`（10 新檔） | 從 `src/ui/health_insight/assets/illustrations/` 複製到可部署目錄 | 這些圖原本被引用卻沒有任何路由服務（base `7c78ffb` 無 `[assets]`），造成 `/app`、`/health-insight` 破圖 |

> 註：破圖是**既有問題**（不是 Round 5 造成的回歸）——base commit 沒有 `[assets]` binding，`/assets/health-insight/…` 一直落到 HTML catch-all。本輪視為「補完未完成 UI」修好。

---

## 1. 螢幕/狀態 inventory 對照與證據

所有截圖在 `report_final_acceptance_assets/`（本輪新增）與 `report_round5_assets/`（Round 5）。皆為 390×844 正常視窗（另含 1280×900 桌面樣本），非強制放大或直接操控 renderer。

| 區域 | 狀態/流程 | 證據 | 結果 |
| --- | --- | --- | --- |
| 首頁（手機/桌面） | 全卡、五大面向、速覽、導覽 | `report_round5_assets/home_mobile.png`、`home_desktop.png` | ✅ 無 emoji、向量同步圖示、角色照 |
| 每日檢視/結果 | 6 題 → 分析 → 結果 → 存檔 | 見第 2 節；`result_detail.png` | ✅ 完整流程、狀態快照+冰山分析 |
| 記錄 History | 空狀態 / 已填 / 明細 | `report_round5_assets`(空)、`history_populated.png`、`result_detail.png` | ✅ 兩筆並存、可開明細 |
| 五大面向 | 吃/動/睡/壓/人 向量 tile | `home_mobile.png` | ✅ 向量、保留各自入口 |
| 身份/QUEST | intro → 抽卡(單張) → 卡面 → 書寫 → 存檔 → 解讀 | `quest_picking.png`、`quest_review.png`、`quest_result.png` | ✅ 投射卡真實插圖、`身影卡`無 emoji、存檔+洞察 |
| 飲食占卜 | intro(水晶球向量) → 情緒 12 格 | `report_round5_assets/divination_intro.png`、`divination_mood_grid.png` | ✅ 🔮→向量、12 情緒無 emoji |
| 行為拆解 | intro → 記餐 → why/mood/process → 結果 → 重來一次 → final | `behavior_input.png`、`behavior_result.png`、`behavior_final.png` | ✅ 五步完整、型別卡、反向連結 |
| 情境演練 | intro → 選情境(14) → setup(4 選項) → 後果 → 停損 → 反思 → 結果 | `scenario_setup.png`、`scenario_consequence.png`、`scenario_reflection.png`、`scenario_result.png` | ✅ 4 選項、反思輸入保留、整理結果 |
| 營養/指南/搜尋 | 分類 pill、內容卡、空狀態 | `report_round5_assets/nutrition.png`、`search.png` | ✅ 無 emoji |
| Health Insight | 匿名/體驗入口問卷（性別/年齡/身高/體重/目標） | `page_health_insight.png`、`page_health_insight_desktop.png` | ✅ 角色插畫載入、選項無 emoji |
| 帳號/會員 | /app、/app/me、/app/history（體驗模式、登入引導、Premium「敬請期待」） | `page_app.png`、`page_app_me.png`、`page_app_history.png` | ✅ 誠實呈現體驗/未登入/未上線狀態，未偽造 Premium |
| 登入 | /auth/login | `page_auth_login.png` | ✅ 200 回應 |
| 聊天最新可見 | 檢視流程最新訊息在視窗內 | `chat_latest.png`（最後訊息 bottom≈436 < 視窗 844） | ✅ 最新對話可見、答題區在下方 |
| 圖片後備 | 阻擋食物照 → 9 卡改用手繪 SVG | `fallback_crave_svg.png`（9 卡 / 0 破圖 / 9 SVG） | ✅ onerror 後備正常 |

載入/空/錯誤/權限狀態：History 空/已填、帳號體驗模式（未登入）、Premium「敬請期待」（未解鎖）、圖片載入失敗後備、缺圖 404，皆已擷取或驗證。

---

## 2. 完整儲存流程（真實互動，非只載入一筆）

以真實瀏覽器點擊完成一輪檢視：

1. 先注入 1 筆既有紀錄（crave=`soup`，含使用者自打含 🍜 的 note）。`before count=1`。
2. 點「開始分析」→ 依序回答 energy/sleep/stress/social/move 五題（每題點第一個選項）。
3. 食物題出現 **9 個選項**，實測標籤：`炸的！雞排鹽酥雞 / 甜的！蛋糕珍奶 / 熱湯暖胃！麵湯飯 / 清爽蔬食！沙拉青菜 / 超商隨便湊 / 夜市小吃（滷味/鹹水雞）/ 燒烤/串燒 / 速食（麥當勞/肯德基）/ 隨便，吃什麼都好`。選第一個(`fried`)。
4. 產生結果 → `analyze()` 回 `emotion_eating`（stress 低 + fried），正確。`after count=2`。
5. **Reload 後 `count=2`，craves=`["fried","soup"]` 兩筆並存**；使用者的 `🍜` note 原封不動。

> 結論：既有紀錄 → 完成檢視 → 新結果 → 筆數 +1 → reload 兩筆都在。使用者輸入（含 emoji）完全保留，證明 emoji 移除只作用於內建裝飾、不碰使用者內容。

**九個食物值**：上面 9 標籤 + 值 `fried/sweet/soup/fresh/conv/yeshi/bbq/fastfood/any` 皆可達、值不變、選取即前進、無重複送出。
**四個情境選項**：以程式解析 `SCEN_DATA` 全 14 個情境，choices 數全部 =4（0 例外）；並以真實互動走完「下午茶手搖」情境 setup(4 選項)→後果→停損→反思→結果。

---

## 3. 對照 `7c78ffb` 的變更驗證（含設定變更本身）

不以「commit 後工作區乾淨」當作設定通過的證據；以下為對設定/路由的**直接**驗證（本地 `wrangler dev`）：

- **資產 MIME/解碼**：`/ui-assets/diet-r5/*`（11）+ `/assets/health-insight/illustrations/*`（10）全部 `200 image/webp`；`sharp` 解碼 **21/21** 成功。
- **缺圖行為**：兩個前綴的缺檔都回 **404**（非 app shell / 非 SPA fallback）。
- **不誤攔**：`/` → `200 text/html`；既有 `/img/*` R2 路由 → `404 text/plain`（仍由 worker 處理，未被資產 binding 接管）。
- **既有路由**：`/`、`/health-insight`、`/app`、`/app/history`、`/app/me`、`/auth/login`、`/api/health-insight`、`/api/sync` 全部 `200`。
- **產生的腳本**：`node --check src/worker.js` ✅；抽出 `getHTML()` 內嵌可執行 `<script>` `new Function()` ✅；`<script id="D">` JSON island `JSON.parse()` ✅。
- **可部署建置**：`wrangler deploy --dry-run` 成功——讀入 `public/` 26 檔、上傳 1796 KiB，綁定 `SYNC_KV`(KV)/`DIET_COACH_DB`(D1)/`DIET_COACH_IMAGES`(R2)/`UI_ASSETS`(Assets) 全部解析。
- **回歸**：17 個既有套件（1.111–1.127），指令 `PHASE1_REVIEW_NESTED=1 node <suite>`，**全數通過、0 失敗、合計 12,074 斷言**。
  - 說明：commit 前，`input_page.js` 與 `wrangler.toml`（Round 5）觸發「零-diff / 架構保護」邊界斷言失敗；這些斷言只掃 **未提交工作區**（控制組刻意用 `git log` 避免 commit 後假性失敗）。提交後工作區乾淨 → 通過。設定/資產本身的正確性已由上方直接驗證（curl/decode/dry-run），不是靠工作區乾淨。

---

## 4. Gemini 就緒度歸類（權威來源與確切缺口）

- **權威會員來源**：`src/membership/membership_resolver.js` 的 `resolveMembershipState(identity, options)`。設計上會呼叫 `options.lookupTier(userId)`（預留給真正的付費/會員系統，例如查 D1）；已登入但**未注入 `lookupTier`** 時一律回 `free`。
- **權限判斷**：`src/routes/health_insight_routes.js:251` `canUseFeature(identity,'gemini_enhancement',req.options)`；`gemini_enhancement` 於 `feature_permission.js` 要求 tier=`premium`。
- **確切缺口**：`src/worker.js` 的 HTTP dispatch 每一條路由都硬帶 `options: {}`（無 `lookupTier`）。因此已登入者永遠解析為 `free` → `geminiPermitted` 永遠 `false` → **即使設定了 `GEMINI_API_KEY` 也完全不會呼叫 Gemini**（連 API 都不打）。
- **本環境現況**：`CLOUDFLARE_API_TOKEN` 存在、`GEMINI_API_KEY` 未設定。**光有 API key 不構成可用的增強路徑**——還需要（a）真正的會員/付費來源判定某使用者為 `premium`，(b) 把 `lookupTier` 注入 dispatch→router→`req.options`，(c) 設定 `GEMINI_API_KEY`，(d) 一個 premium 使用者 session，四者齊備才會真正走到 Gemini。
- **歸類**：**保留、且結構性關閉（正確）**。deterministic 基底結果不受影響；Gemini 只是選用增強、失敗/未授權時安全略過。本輪**未**改動任何 Gemini／會員邏輯，**未**偽造 Premium、**未**繞過授權、**未**引入新會員系統。

---

## 5. 截圖 / 響應行為檢查（正常視窗）

- **捲動 / 底部導覽不遮擋**：首頁、記錄、搜尋、營養等長頁內容可捲動，固定底部導覽不壓內容（見各 fullPage 截圖）。
- **最新對話可見**：`chat_latest.png`——最後一則訊息 bottom≈436px（< 844 視窗），答題選項在下方；非「舊對話卡在最上面」。
- **重複流程**：檢視→結果→再檢視筆數持續累加（第 2 節）；QUEST/情境/行為皆可「重新來一次」。
- **底部導覽順序**：首頁 / 搜尋 / 記錄，維持不變。
- **圖片後備**：`fallback_crave_svg.png`——照片載入失敗時 9 張食物卡改顯示手繪 SVG，0 破圖。
- 未為了讓截圖過關而改動樣式或灌大視窗。

---

## 6. 三類狀態（明確分開）

### A. 已實作且已驗證（Implemented and verified）
- 素材接入：11 張 R5 + 10 張 Health Insight 插畫，全部 `200 image/webp`、解碼 21/21、缺圖 404、不誤攔既有路由；`--dry-run` 可部署。
- 全站內建裝飾 emoji 移除：**served 原始碼非註解行 emoji = 0**（含補掉 `input_page.js` 與 `‍` 殘留）；使用者輸入（含 emoji）保留。
- 完整儲存流程：1→2、reload 兩筆並存、9 食物值、4 情境選項（全 14 情境）。
- 全畫面家族真實互動截圖：首頁(手機/桌面)、檢視結果、History(空/已填/明細)、占卜(intro+情緒)、行為(五步+final)、情境(setup→反思→結果)、QUEST(卡面→書寫→解讀)、營養、搜尋、Health Insight、/app、/app/me、/app/history、/auth/login、聊天最新可見、圖片後備。
- 回歸：17 套件 / 0 失敗 / 12,074 斷言；worker 語法 + 內嵌腳本 + JSON island 全通過。
- Health Insight 插畫破圖修復（既有問題），/app 與 /health-insight 0 破圖。

### B. 已實作、待外部驗證（Implemented but awaiting external verification）
- **正式部署**：建置已就緒（`--dry-run` 通過）。本環境雖偵測到 `CLOUDFLARE_API_TOKEN`，但正式 `wrangler deploy` 會**取代線上生產站台（真實使用者 + KV/D1/R2 資料）**，屬對外且不易回復的動作，且本任務指示為 develop/commit/push、未明確要求現在部署 → 保留待明確授權。指令：`npx wrangler deploy`；部署後複驗 21 個資產 URL 回 `200 image/webp`、`/`、`/health-insight`、`/app` 核心流程。
- **Google OAuth 正式登入**：本地只驗證匿名/體驗/未登入路徑與程式契約；登入態需部署環境用真實 Google 帳號驗證。
- **Gemini 線上增強**：如第 4 節，結構性關閉；要成為「已驗證可運作」需 premium 會員來源 + 注入 `lookupTier` + `GEMINI_API_KEY` + premium session，屬產品決策，不在本輪 UI 範圍。

### C. 未完成實作（Unfinished implementation）
- 無「served UI 必需項」未完成。功能面 inventory 已全覆蓋並以真實互動驗證。
- 可選打磨（非必需、不阻擋）：為 12 情緒／行為型別／身份／QUEST 類別／60+ 食物項各繪專屬語意插圖（目前為乾淨文字，符合「不得用 emoji」）；桌面版可再做更刻意的多欄排版（目前為置中單欄，正確且無破版）。

---

## 7. 部署狀態

- **本地驗證**：完成。
- **可部署建置**：是（`wrangler deploy --dry-run` 通過，四個 binding 齊備）。
- **正式上線**：**尚未部署、非 live。** 待明確授權後執行 `npx wrangler deploy`，再複驗線上資產 URL 與核心/已登入路徑。

---

## 8. 本地重現

```bash
npx wrangler dev --port 8791 --ip 127.0.0.1
# 資產
curl -I http://127.0.0.1:8791/ui-assets/diet-r5/food_fried.webp                       # 200 image/webp
curl -I http://127.0.0.1:8791/assets/health-insight/illustrations/companion-greeting.webp  # 200 image/webp
curl -I http://127.0.0.1:8791/ui-assets/diet-r5/nope.webp                             # 404
# 回歸（示例）
PHASE1_REVIEW_NESTED=1 node backups/phase7-task1.127-app-experience/test_app_experience_layer.mjs
# 可部署建置
npx wrangler deploy --dry-run
```
