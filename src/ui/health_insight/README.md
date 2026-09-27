# Health Insight UI/UX Implementation Foundation（Phase 6 TASK1.114）

## 目的

在Phase 6產品架構（TASK1.106~1.113）完成之後，建立Health
Insight**第一個使用者可見**的UI/UX基礎——視覺結構、元件基礎、
設計系統、互動基礎、未來資產整合邊界。本次任務**不**整合
Gemini、**不**修改Intelligence架構、**不**產生最終插畫資產、
**不**建立route/controller、**不**把這些檔案接進worker.js。

## 為什麼是「拙趣」風格

延續本次任務的Design Direction：Health Insight不應該看起來像
傳統醫療儀表板。核心原則是"陪伴使用者理解自己"，不是"監控使用者
健康數據"——溫暖、手感、簡單但好記、像朋友陪伴、降低對健康
追蹤的焦慮感。詳細的顏色/字體/間距方向見
`design_system/design_tokens.js`檔案頭說明。

## 目錄結構

```
src/ui/health_insight/
  design_system/
    design_tokens.js       設計系統基礎（顏色/字體/間距/卡片樣式/斷點）
  assets/
    asset_registry.js      未來插畫資產整合邊界（語意插槽 + 佔位符）
    README.md
    placeholders/          預留目錄，本次任務刻意留空
  components/
    html_utils.js          HTML escape工具
    label_map.js           呈現層措辭對照表（type代碼 → 友善中文標籤）
    health_summary_card.js Today's Insight Summary
    observation_card.js    Health Observation Card / Insight Card
    recommendation_card.js Recommendation Card
    behavior_pattern_card.js  Behavior Card Placeholder
    progress_card.js       Progress Card Placeholder
    question_card.js       Input Experience的引導式問題卡片
    error_card.js          Error Presentation
    index.js
  pages/
    dashboard_page.js      組裝完整Health Insight Dashboard
    input_page.js          組裝完整Input Experience畫面
  index.js                 統一輸出入口
```

## 元件責任（Intelligence Boundary）

延續TASK1.110/1.113已確認的UI/Intelligence責任分工：

- **UI responsibility（這個目錄）**：collect user
  interaction、display product output、handle user
  experience。
- **Intelligence responsibility（既有`src/intelligence/`）**：
  analysis、recommendation、insight generation。

**這個目錄底下沒有任何一個檔案import
`src/intelligence/`底下的任何東西**——所有元件都是純函式：
接收已經算好的資料（`{type, value}`這類已經過Health Insight
Integration/Feature處理過的安全形狀），回傳HTML字串，不做任何
分析/推論/計算（唯一的例外是`health_summary_card.js`讀取陣列
`.length`這種純結構性計數，不是分析）。

## Output Boundary（延續TASK1.108）

所有元件只讀取TASK1.108/1.111/1.112既有輸出形狀裡**已經被
過濾過**的欄位（`type`/`value`），完全不接觸、也沒有能力顯示
`source`/`status`/`capability`/`feature`這類Runtime
metadata/internal capability structure欄位——因為這些欄位
在傳入UI層之前，已經被Health Insight Feature Result
Mapper（TASK1.111）過濾掉了。

## Error Presentation

`components/error_card.js`把既有的結構化失敗結果（`{ok:false,
reason, field?, stage?}`）分類成四種使用者可見錯誤類別（Missing
data/Invalid input/Unavailable intelligence/Temporary
failure），只顯示分類後的友善訊息，完全不暴露原始`reason`/
`field`/`stage`/例外物件本身。

## Responsive Preparation

`design_system/design_tokens.js`的`getDesignSystemCSS()`包含
tablet（680px）跟desktop（1024px）兩個斷點的媒體查詢，基礎
排版不是只針對單一螢幕尺寸優化。

## Asset Boundary

`assets/asset_registry.js`定義語意化插畫插槽（例如`greeting`/
`observation`），目前全部使用純文字emoji佔位符，沒有任何真實
圖片檔案。未來替換真正的插畫時，只需要修改這個檔案，元件程式碼
完全不需要改動。

## Current Limitations（目前限制）

- **沒有接進worker.js/route/controller**：延續整個Phase 4~6
  系列一貫的"建立但不接線"模式，本次任務只用測試證明這些UI
  元件/頁面組裝函式可以被安全地呼叫、正確地反映輸入資料，
  實際接上真實Health Insight Integration/UI互動邏輯
  （data-field屬性目前只是靜態標記，沒有任何JS事件監聽）留給
  未來任務決定。
- **沒有任何真實插畫資產**：目前全部是emoji佔位符。
- **behaviorPattern/progressTrend固定顯示預留卡片**：延續
  TASK1.111/1.113已確認的"V1不產生實際內容"既有結論。
- **沒有任何前端互動JS（事件監聽/表單提交邏輯）**：這是"UI
  Structure"跟"Component Foundation"層級的基礎，互動邏輯的
  真正串接留給未來任務。
