# 飲食主場秀 — Round 5 整合報告

**日期：** 2026-09-30
**分支：** `claude/wrangler-deploy-c821f3`
**基準 commit：** `7c78ffb`（上一輪已審核）
**本輪 commit：** `46772c6`（已推送 origin）

本輪一次完成三個 checkpoint：素材接入（Static Assets）、全站 UI/UX 套用與內建裝飾性 emoji 移除、本地驗證與修正。所有功能、驗證、會員權限、Gemini 行為與既存資料皆保留。

---

## 1. 變更檔案

| 檔案 | 變更 |
| --- | --- |
| `wrangler.toml` | 新增 `[assets]` binding（`directory=./public`、`binding=UI_ASSETS`、`run_worker_first=true`），共 +5 行 |
| `src/worker.js` | 素材接線、食物/情境照片、mascot 改外部檔、sync 向量圖示、全站 emoji 移除、向量圖示替代裝飾符號（489 insertions / 461 deletions） |
| `public/ui-assets/diet-r5/*.webp`（11 個，新檔） | 9 張食物照 + 1 張同事甜點情境照 + 1 張透明抱心角色 |
| `report_round5.md`、`report_round5_assets/*.png` | 本報告與實際截圖 |

`git diff --stat 7c78ffb..46772c6`：`src/worker.js`、`wrangler.toml` 為程式變更；`public/` 為新素材。

---

## 2. Checkpoint A — 素材接入與 R2 阻塞解除

### 路由設計
- `src/worker.js` fetch handler 最前面加入**窄範圍**分支：`/ui-assets/` 開頭且 `env.UI_ASSETS` 存在時，交給 Static Assets binding；其餘照舊走 HTML/API/中介層。
- **未**把整個 app 導向 asset binding；**未**啟用 SPA HTML fallback（缺圖回真正 404，不是 app shell）。
- 既有 `/img/` R2 路由保留（實測 `/img/` 缺圖回 `404 text/plain`，由 worker 的 R2 handler 處理，而非 asset binding 回 app shell）。
- Wrangler 4.118.0 支援 `[assets]`，已確認。

### 素材服務驗證（本地 `wrangler dev` 127.0.0.1:8791）

| 素材 | HTTP | Content-Type | 位元組（= asset-map.json） | 解碼 |
| --- | --- | --- | --- | --- |
| food_fried.webp | 200 | image/webp | 149696 | ✓ |
| food_sweet.webp | 200 | image/webp | 65292 | ✓ |
| food_soup.webp | 200 | image/webp | 71372 | ✓ |
| food_fresh.webp | 200 | image/webp | 120982 | ✓ |
| food_conv.webp | 200 | image/webp | 61610 | ✓ |
| food_yeshi.webp | 200 | image/webp | 105304 | ✓ |
| food_bbq.webp | 200 | image/webp | 147930 | ✓ |
| food_fastfood.webp | 200 | image/webp | 102046 | ✓ |
| food_any.webp | 200 | image/webp | 95696 | ✓ |
| scen_coworker_dessert.webp | 200 | image/webp | 126508 | ✓ |
| mascot_heart.webp | 200 | image/webp | 66710 | ✓ |

- **缺圖：** `/ui-assets/diet-r5/nope.webp` → `404`（非 app shell）✓
- **首頁：** `/` → `200 text/html`（未被 asset binding 攔截）✓
- **解碼：** `sharp` 對 11 張全部讀取 metadata 成功（ok:11 bad:0）。
- **落點：** 食物照取代原暫時 SVG，佔卡片實際面積（`aspect-ratio:1/1` + `object-fit:cover`，非舊 74×56 icon 槽），保留文字標籤與載入保留空間；`onerror` 退回既有 crayon SVG。角色照透明背景保留，`hero`/`heart` 由外部 WebP 載入，移除約 180KB base64。

---

## 3. Checkpoint B — 全站套用與 emoji 移除

### 內建裝飾性 emoji 移除（方法）
依上一輪回饋，**未使用廣域 surrogate 移除 regex**、**未觸碰使用者輸入內容**：
1. **具名資料鍵**：只清空內建資料裡的 `emoji:"…"` / `icon:"…"` 具名鍵（食物 60+、情緒、味覺、行為型別、身份、營養、QUEST 類別等），共 **215 個 `emoji` 鍵 + 45 個 `icon` 鍵**。所有渲染點原本就有 `x.emoji?…:""` 守衛，清空後自然不顯示。
2. **渲染守衛/空槽隱藏**：對未守衛的渲染點補上守衛；對可能留白的 icon 槽加 `:empty{display:none}`。
3. **裝飾符號 → 向量圖示**：10 處大型裝飾 mark 改為手繪向量（新增 `icoDiv` helper 與 `ICONS.crystal`（占卜）、`ICONS.bulb`（行為）、`ICONS.sprout`（身份）、`ICONS.social`（情境）、`ICONS.check`（完成）、`ICONS.star`）。
4. **標籤/按鈕/標題/分享文字**：移除殘餘裝飾 glyph（分享列 📋📷📤、使用說明 📖、身份卡按鈕 🖼️、占卜/行為分享文字 🔮🧠💡⚠️📝🧪 等，含 `\uXXXX` 逃逸形式），並清掉移除後殘留的行首空白（42 處）。

**結果掃描：** `src/worker.js` 非註解行的內建裝飾 emoji = **0**。（註解內的 → 箭號等排版符號保留，不影響 UI。）

### 具體修正（對應規格點名項目）
- **桌面首頁占卜卡水晶球 emoji** → 手繪水晶球向量。（見 `divination_intro.png`）
- **不清楚的同步小圖示** → 可辨識的圓形箭號同步圖示（`ICONS.sync`），動作/狀態不變。（見 `home_mobile.png` 右上）
- **首頁下方入口卡**（占卜/營養/情境/行為/身份/QUEST/使用說明）全部去 emoji、改向量或角色插圖。（見 `home_entry_cards.png`）
- **五大面向 tiles、五大面向速覽收折**保留，圖示為向量。
- **底部導覽維持 首頁 / 搜尋 / 記錄 順序。**

### 驗證的畫面（實際互動截圖，390×844，另附桌面 1280×900）

| 畫面 | 檔案 | 重點 |
| --- | --- | --- |
| 首頁（手機，含摺線下） | `report_round5_assets/home_mobile.png` | 角色照、向量同步圖示、向量五大面向、bulb 提示，無 emoji |
| 首頁（桌面 1280×900） | `report_round5_assets/home_desktop.png` | 桌面版面 |
| 首頁下方入口卡 | `report_round5_assets/home_entry_cards.png` | 各入口卡去 emoji、角色插圖 |
| 每日檢視食物題（9 張照片） | `report_round5_assets/checkin_food_grid_9photos.png` | 9 選項真實照片、佔卡片面積、文字標籤，無 emoji |
| 外食搜尋 | `report_round5_assets/search.png` | 分類 pill 無 emoji、空狀態文案 |
| 記錄（空狀態） | `report_round5_assets/history_empty.png` | 空狀態 |
| 營養素指南 | `report_round5_assets/nutrition.png` | 分類 pill、營養卡無 emoji |
| 飲食占卜 intro | `report_round5_assets/divination_intro.png` | 水晶球**向量**取代 🔮 |
| 占卜情緒選格（12） | `report_round5_assets/divination_mood_grid.png` | 12 情緒卡全去 emoji |
| 情境甜點照 | `report_round5_assets/scenario_dessert_photo.png` | 同事甜點照 + 角色 |
| 情境演練 intro | `report_round5_assets/scenario_intro.png` | social 向量取代 🎭、步驟為純數字、面向 tag 無 emoji |
| 行為拆解 intro | `report_round5_assets/behavior_intro.png` | bulb 向量取代 🧠 |
| 身份測驗 intro | `report_round5_assets/identity_intro.png` | sprout 向量取代 🧭 |

---

## 4. Checkpoint C — 驗證結果

### 4.1 語法/腳本驗證（字串陣列格式）
- `node --check src/worker.js` ✓
- 抽出並 `new Function()` 執行 `getHTML()` 產生的**內嵌可執行腳本**（第 2 個 `<script>`）✓
- `<script id="D">` JSON 資料島 `JSON.parse()` ✓
（外層 Worker 與每個輸出的內嵌腳本皆驗證，非只驗外層。）

### 4.2 回歸測試（既有套件，實際指令與結果）
指令：`PHASE1_REVIEW_NESTED=1 node <suite>`（此旗標為既有慣例，未加會讓 1.111–1.113 的巢狀 meta-scan 假性失敗）。

**17 個套件全數通過，0 失敗，合計約 12,074 個斷言：**

| 套件 | 結果 |
| --- | --- |
| test_health_insight_feature_foundation | 1078 passed, 0 failed |
| test_health_insight_product_integration | 1073 passed, 0 failed |
| test_health_insight_activation_foundation | 1061 passed, 0 failed |
| test_health_insight_uiux_foundation | 551 passed, 0 failed |
| test_health_insight_visual_integration | 1221 passed, 0 failed |
| test_health_insight_activation | 549 passed, 0 failed |
| test_health_insight_response_boundary | 525 passed, 0 failed |
| test_user_identity_foundation | 513 passed, 0 failed |
| test_health_insight_identity_binding | 521 passed, 0 failed |
| test_health_insight_persistence | 551 passed, 0 failed |
| test_gemini_enhancement_layer | 519 passed, 0 failed |
| test_premium_feature_boundary | 518 passed, 0 failed |
| test_health_insight_product_experience | 515 passed, 0 failed |
| test_health_insight_product_completion | 713 passed, 0 failed |
| test_health_insight_product_architecture_alignment | 521 passed, 0 failed |
| test_guest_auth_experience | 715 passed, 0 failed |
| test_app_experience_layer | 930 passed, 0 failed |

> 註：commit 前每個套件各有 2 個 `wrangler.toml 未被本次任務修改` 的邊界斷言失敗——因為它們檢查 `git diff --stat wrangler.toml`（工作區未提交變更）。本輪 Checkpoint A 依規格**必須**新增 `[assets]` binding；提交後工作區乾淨，斷言全數轉綠。此為預期中的設定變更，非行為回歸。另一斷言「wrangler.toml 未新增任何 AI 相關環境變數/binding」始終通過（`[assets]` 與 AI 無關）。

### 4.3 資料保存（實際互動）
以真實瀏覽器注入一筆既存紀錄（含使用者自行輸入、帶 🍜 的文字），重新載入後：
- `localStorage['diet_app_v1'].ins` 筆數 = 1（保留，開機未清除）；
- 使用者文字 `"昨天的紀錄 🍜 我自己打的字"` **原封不動**——證明 emoji 移除只作用於內建裝飾 UI，**完全不碰使用者輸入**；
- app 內 `ld().ins.length` = 1（讀取路徑完好）。
- localStorage/KV 與 D1 兩套資料系統維持分離；schema、storage key（`diet_app_v1`/`diet_sync_code`/`quest_live_pref`）、bindings、API 契約皆未變。

### 4.4 保存規則確認
- 保留 `/` 原 app 與全部模組（未以 `/app` 取代）。
- 保留路由、選項值、ID、分析規則、歷史與持久化。
- 保留 Google OAuth/session、會員授權、Gemini 既有選用增強/fallback；未偽造付費層、未移除權限檢查、未改 model ID。
- 9 個食物選項值與選取即前進、情境四選項/後果/反思流程皆保留。

---

## 5. 分項清單

### 已完成實作
- Static Assets 接線 + 11 素材服務 + 缺圖 404 + 保留 /img。
- 食物題 9 照片、情境甜點照、角色外部化。
- 全站內建裝飾 emoji 移除（非註解行 0 殘留）+ 向量圖示替代 + sync 圖示。
- 首頁（手機/桌面）、搜尋、營養、占卜（intro+情緒格）、行為、身份、情境、記錄空狀態 — 實際互動截圖驗證。
- 17 套件回歸全綠、腳本/JSON 島驗證、資料保存驗證。

### 需真實帳號/外部服務驗證（本環境阻塞）
- **Google OAuth 正式登入**：本地無正式 OAuth 憑證，僅能驗證未登入/訪客路徑與程式契約；正式登入態需在部署環境以真實 Google 帳號驗證。
- **Gemini 線上增強**：production 走 free tier、`options:{}` 不注入 `lookupTier`，結構上不會呼叫 Gemini（既有行為，未鬆動）；線上 Gemini 增強需真實金鑰在部署環境驗證。deterministic 基底結果不受影響。
- 以上兩者本地皆以清楚標示的 fixtures 檢查行為邊界；fixtures 不等同正式驗證。

### 可選打磨（未做，非阻塞）
- 為 12 情緒、行為型別、身份、QUEST 類別、60+ 食物項各自繪製專屬語意插圖（目前為乾淨文字，符合「不得用 emoji」但可再視覺化）。
- 聊天區最新訊息置頂/重置行為的更嚴謹長截圖比對。
- 桌面版卡片分組與內容寬度可再刻意化。

---

## 6. 部署狀態

- **本地驗證：** 完成（`wrangler dev`；素材、路由、UI、回歸、資料保存均通過）。
- **可部署狀態：** 是。程式與設定就緒，`public/` 素材隨 Worker 部署，不需手動上傳 R2。
- **正式上線：** **尚未部署，非 live。** 需在已授權且具憑證的環境執行既有部署流程：
  ```
  npx wrangler deploy
  ```
  部署後應複驗 `https://<production-host>/ui-assets/diet-r5/food_fried.webp` 等 11 個 URL 回 `200 image/webp`，並以真實 Google 帳號驗證 OAuth、以真實金鑰驗證 Gemini 增強。

---

## 7. 如何本地重現

```bash
# 啟動
npx wrangler dev --port 8791 --ip 127.0.0.1

# 素材
curl -I http://127.0.0.1:8791/ui-assets/diet-r5/food_fried.webp   # 200 image/webp
curl -I http://127.0.0.1:8791/ui-assets/diet-r5/nope.webp         # 404

# 回歸（單一範例）
PHASE1_REVIEW_NESTED=1 node backups/phase7-task1.127-app-experience/test_app_experience_layer.mjs
```
