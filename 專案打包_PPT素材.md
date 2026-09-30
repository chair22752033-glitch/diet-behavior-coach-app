# 飲食主場秀（Diet Behavior Coach）— 專案簡報素材包

> 用途：本文件供 AI 閱讀理解後**直接生成簡報（PPT）**。每個「##」章節約對應 1–3 張投影片；已附講者備註（> 引言）與可直接放上投影片的重點條列。內容取自實際程式碼與部署結果，非行銷誇飾。
> 生成投影片時建議語言：繁體中文；風格：溫暖手繪「拙趣」（terracotta 陶土橘 / sage 鼠尾草綠 / honey 蜂蜜黃 / 紙感米白）。

---

## 投影片 1｜封面
- **標題：** 飲食主場秀（Diet Behavior Coach）
- **副標：** 了解自己，才能真正吃好
- **一句話定位：** 不批判你吃了什麼，只幫你理解「為什麼會這樣吃」的飲食行為教練 App。
- **技術載體：** Cloudflare Workers 全端單一服務（邊緣運算）
- **狀態：** 已上線生產（version `62cf281f`）

> 講者備註：這是一款把「飲食」放回「生活狀態（吃・動・睡・壓・人）」脈絡裡理解的行為教練工具，訴求非節食、非計算卡路里，而是自我覺察。

---

## 投影片 2｜問題與洞察（Why）
- 傳統飲食 App 聚焦「熱量/份量計算」，讓使用者陷入意志力對抗與罪惡感。
- 真正影響「今天為什麼這樣吃」的是：睡眠、壓力、人際、情緒、疲勞——不是意志力。
- 使用者要的是「被理解」與「可執行的下一步」，不是又一張紅字報表。
- 產品核心信念：**「這不是意志力的問題，是你還沒找到屬於自己的飲食系統。」**

> 講者備註：這頁建立情緒共鳴與差異化定位。

---

## 投影片 3｜解決方案總覽（What）
- **每日檢視**：6 個低壓力問題（能量/睡眠/壓力/人際/運動/現在想吃什麼）→ 產生「狀態快照 + 冰山分析（表面想吃 vs. 水面下真正原因）+ 可行建議」。
- **飲食占卜**：從情緒出發，看你此刻「真正被什麼食物吸引」，回饋偏好洞察。
- **飲食身份測驗 / QUEST 投射卡**：用測驗與投射卡幫使用者建立自我認同與敘事。
- **飲食行為拆解**：把「一餐」拆成 記餐→為什麼→吃前心情→決策過程→行為型別 與五面向反向連結。
- **生活情境演練**：14 個真實情境（同事甜點、聚餐勸酒、加班嘴饞…），每情境 4 選項→後果→停損點→反思→整理。
- **營養素指南 / 外食搜尋 / 記錄歷史**：知識查詢與個人歷程回顧。
- **健康小洞察（Health Insight）+ 帳號系統**：Google 登入、會員、可選 AI 增強說明。

> 講者備註：一頁講完全部模組；後面每個模組各展開。

---

## 投影片 4｜設計語言（拙趣 / Warm hand-drawn）
- 色彩：陶土橘、鼠尾草綠、蜂蜜黃、陶紅，紙感米白底 + 顆粒紋理。
- 元件：手繪蠟筆風按鈕（雙層陰影、圓潤）、答題卡、情境選項卡。
- 圖像：AI 生成寫實食物照（9 種選項）、透明抱心吉祥物、手繪 SVG 語意圖示。
- 原則：**全站零內建裝飾 emoji**（改用向量圖示或真實圖片）；但**保留使用者自己輸入的 emoji**。
- 無障礙：真實可互動元件、可鍵盤操作、可見焦點、足夠觸控面積。

> 講者備註：可放 before/after 或首頁截圖。截圖清單見附錄。

---

## 投影片 5｜核心流程示意（每日檢視 → 結果）
- 流程：首頁「開始分析」→ 聊天式 6 題 →（依身份給鼓勵語）→ 產生結果並存檔。
- 結果卡：
  - **今天的狀態快照**：能量/睡眠/壓力/人際/運動，各有標籤與強度條（壓力以 1–10 尺規顯示，如 `7 / 10`）。
  - **今天你的飲食動機（冰山）**：你看到的（想吃的）↔ 水面下真正原因。
  - **行為分析 + 建議 + 延伸探索連結**。
- 分析為**決定式（deterministic）規則**（`analyze()`），穩定可解釋；AI 只做選用性口語化增強。

> 講者備註：強調「分析結果是規則決定、可解釋」，AI 不是智慧來源。

---

## 投影片 6｜資料與隱私模型
- **雙軌並存、互不干擾：**
  - 舊版主 App（`/`）：資料存**瀏覽器 localStorage**（key `diet_app_v1`）+ 選用 KV 雲端同步（`/api/sync`，以同步碼）。
  - 健康洞察/帳號系統：**Cloudflare D1（SQL）** + Google OAuth session。
- 訪客（guest）不寫入 D1、不可查歷史；註冊使用者才累積雲端健康歷程。
- 使用者輸入內容（含 emoji、反思文字）完整保留，永不被清理程序更動。

> 講者備註：一頁講清楚「本機優先、雲端選用、帳號分離」的隱私設計。

---

## 投影片 7｜系統架構（技術）
- **執行環境：** Cloudflare Workers（單一 Worker，邊緣部署，`wrangler` 4.x）。
- **前端：** 無框架，伺服器以 `getHTML()` 字串陣列輸出單頁 App（內嵌 CSS/JS + JSON 資料島 `<script id="D">`）。
- **後端分層（`src/` 269 個 JS 檔）：** adapters / auth / bootstrap / config / contracts / controllers / db / history / identity / intelligence / membership / middleware / oauth / persistence / routes / services / ui。
- **綁定（bindings）：** `SYNC_KV`(KV)、`DIET_COACH_DB`(D1)、`DIET_COACH_IMAGES`(R2)、`UI_ASSETS`(Static Assets)。
- **靜態資產：** Workers Static Assets 服務 `/ui-assets/diet-r5/*`（食物照/吉祥物）與 `/assets/health-insight/illustrations/*`（陪伴角色插畫）；缺圖回真正 404，不落 SPA fallback。

> 講者備註：架構亮點是「一個 Worker 打全端 + 邊緣 + 分層乾淨」。

---

## 投影片 8｜主要路由（API / 頁面）
- 頁面：`/`（主 App）、`/health-insight`、`/app`、`/app/history`、`/app/me`、`/auth/*`。
- 資料 API：`/api/sync`、`/api/qlive`、`/api/dashboard`、`/api/profile`、`/api/timeline`、`/api/reports`、`/api/food-events`、`/api/emotions`、`/api/behaviors`、`/api/explorations`。
- 健康洞察：`POST /api/health-insight`、`GET /api/health-insight/history`。
- 認證：`/auth/google/start`、`/auth/google/callback`、`/auth/guest`、`/auth/provider(/upgrade)`、`/auth/me`、`/auth/logout`。

> 講者備註：可精簡成三群（頁面 / 資料 / 認證）呈現。

---

## 投影片 9｜會員與 AI（Gemini）增強
- **會員權限：** `resolveMembershipState()` + `canUseFeature()`；`gemini_enhancement` 需 `premium`。
- **AI 定位：** Gemini 只在**授權且成功**時，附上一段更口語化的 `enhancedExplanation`；失敗/未授權一律安全略過，**保留決定式基底結果**（涵蓋：無金鑰、網路錯、HTTP 錯、格式非法、逾時）。
- **模型：** `gemini-3.8-flash`（可設定）。
- **目前狀態（誠實）：** 尚無「權威權益資料來源」（D1 無 tier/會員欄位），故所有使用者解析為 `free`、Gemini 結構性關閉。屬**未完成整合**，非缺一把金鑰即可。**未偽造 Premium、未建立計費。**

> 講者備註：這頁展現工程誠實度——AI 是選用增強、且權限缺口被清楚標記。

---

## 投影片 10｜品質與測試
- **回歸測試：** 17 個既有套件（TASK 1.111–1.127），合計 **約 12,074 個斷言，0 失敗**。
- **前端保證：** 外層 Worker 語法 + 每個輸出的內嵌 `<script>` + JSON 資料島皆通過解析驗證。
- **資產：** 21 張 WebP 全數 `200 image/webp`、解碼 21/21、缺圖 404。
- **真實互動驗證：** 完整檢視存檔（紀錄 1→2、reload 兩筆並存）、9 食物值、14 情境各 4 選項、圖片載入失敗自動退回手繪 SVG。

> 講者備註：用數字建立可信度。

---

## 投影片 11｜開發歷程（里程碑）
1. 基礎架構與資料層（D1 schema、session、identity、OAuth）。
2. Health Insight 智慧層 + Gemini 增強層 + 會員權限。
3. App Shell（首頁/歷史/帳號）與訪客/註冊身分邊界。
4. UI/UX 重設計：拙趣設計系統、蠟筆按鈕、emoji → SVG/實圖。
5. Round 5：接入 11 張 WebP 素材、全站移除內建裝飾 emoji、補齊各畫面。
6. 最終驗收：完整流程證據、資料保存、回歸全綠。
7. 發布：修正「壓力值空白」→ 部署生產（version `62cf281f`）。

> 講者備註：呈現迭代式、以驗證為核心的開發文化。

---

## 投影片 12｜現況與後續
- **已上線：** https://balance-diet.chair22752033.workers.dev （version `62cf281f`）。
- **本地/程式已驗證：** 全 UI 流程、資料保存、壓力值修正、資產、回歸。
- **待外部驗證：** Live URL 的 HTTP 回應與畫面、Google OAuth 正式登入（需互動帳號/允許網路的環境）。
- **未完成：** 會員→Gemini 權益來源（需 D1 權益欄位/表 + 服務 + 請求邊界接線）。
- **後續路線：** 建立權益來源以啟用 AI 增強、桌面版多欄排版、更多情境與插畫。

> 講者備註：收尾要分清「已上線 / 待驗證 / 未完成」，避免過度宣稱。

---

## 附錄 A｜關鍵數據（給圖表）
| 指標 | 數值 |
| --- | --- |
| `src/` JS 檔數 | 269 |
| 主檔 `src/worker.js` | 約 3,753 行 / 1.3 MB |
| D1 migrations | 7 |
| 回歸測試套件 / 斷言 | 17 / ~12,074（0 失敗） |
| 內建裝飾 emoji（served 原始碼） | 0 |
| WebP 素材（全數 200/解碼通過） | 21 |
| 食物選項 | 9；生活情境 | 14（各 4 選項） |
| 生產版本 | `62cf281f-58e9-469b-898b-4a9c8dda155f` |

## 附錄 B｜可用截圖（放在壓縮檔內，供投影片配圖）
- 首頁（手機 / 桌面）：`report_release_assets/home_mobile.png`、`home_desktop.png`
- 每日檢視食物題（9 張實照）：`report_round5_assets/checkin_food_grid_9photos.png`
- 檢視結果 / 壓力值修正：`report_release_assets/pressure_corrected_new.png`（7/10）、`pressure_corrected_legacy.png`、`pressure_missing.png`
- 圖片後備（SVG）：`report_release_assets/food_svg_fallback.png`
- 情境演練：`report_final_acceptance_assets/scenario_setup.png`、`scenario_result.png`
- 行為拆解：`report_final_acceptance_assets/behavior_result.png`
- QUEST 投射卡：`report_final_acceptance_assets/quest_result.png`
- 健康洞察：`report_final_acceptance_assets/page_health_insight.png`
- 帳號/會員（體驗模式）：`report_final_acceptance_assets/page_app_me.png`

## 附錄 C｜原始碼位置對照（若 AI 需深讀）
- 主 App（UI + 全部功能邏輯）：`src/worker.js`（`getHTML()` 內含 CSS/JS/JSON 資料島）。
- 路由：`src/routes/`（`index.js`、`legacy_routes.js`、`health_insight_routes.js`、`app_shell_routes.js`、`auth_routes.js` …）。
- 智慧/AI：`src/intelligence/`（`enhancement/gemini/*`）。
- 會員權限：`src/membership/`（`membership_resolver.js`、`feature_permission.js`）。
- 資料層：`migrations/*.sql`、`src/db/`、`src/persistence/`、`src/history/`。
- 健康洞察 UI：`src/ui/health_insight/`；App Shell：`src/ui/app_shell/`。
- 設定：`wrangler.toml`、`package.json`。
- 既有報告（更多細節）：`report_round5.md`、`report_final_acceptance.md`、`report_release.md`。

---

_資料截止：2026-09-30。本文件描述之狀態以 commit `fca0f26`／生產版本 `62cf281f` 為準。_
