# P1～P6 基準操作紀錄

執行時間：2026-09-22
執行方式：以 Playwright 對「Phase 1 修改前」的 src/worker.js（未經任何改動）重新產生的 test.html 進行操作，
每一項皆截圖存證，並記錄通過/失敗於 baseline-log.json。

## 結果：8/8 全數通過

| 項目 | 結果 | 說明 |
|---|---|---|
| P6 現有 UI - 首頁 | PASS | 首頁畫面正常載入 |
| P1 身份測驗 - 進入測驗畫面 | PASS | |
| P1 身份測驗 - 產生結果 | PASS | 完整作答後正確產生 identity 結果 |
| P2 QUEST - 抽卡畫面正常 | PASS | 單抽模式，圖片正常顯示 |
| P3 五大系統互通 - 延伸連結存在 | PASS | 壓力系統頁面有 5 個延伸連結 |
| P4 情境演練 - 情境庫完整 | PASS | 14 個情境皆存在 |
| P5 營養素資料 - 內容完整 | PASS | 67 項營養素皆存在 |
| 整體 - 無 console 錯誤 | PASS | |

## 檔案

- `p6_home.png`：首頁截圖
- `p1_identity_quiz.png` / `p1_identity_result.png`：身份測驗導言頁與結果頁
- `p2_quest_intro.png` / `p2_quest_draw.png`：QUEST 導言頁與抽卡畫面
- `p3_five_system.png`：五大系統（壓力）頁面與延伸連結
- `p4_scenario_intro.png`：情境演練導言頁
- `p5_nutrients.png`：營養素指南頁面
- `baseline-log.json`：結構化結果紀錄
- `baseline_capture.script.js`：本次使用的測試腳本（供未來任務重跑同一套基準比對用）

此紀錄即為「基準比對原則」的具體依據：後續任何任務執行後，皆應重跑同一套流程並與此處截圖／結果比對。
