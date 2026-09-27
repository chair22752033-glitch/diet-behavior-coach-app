# Health Insight Asset Boundary（Phase 6 TASK1.114）

## 目的

準備Health Insight未來插畫資產的**整合邊界**，讓元件現在就能
正確排版跟測試，之後只要替換這個目錄底下的內容，**不需要修改
任何一個元件檔案**。本次任務**不產生任何最終插畫資產**、**不
做任何圖片生成**。

## 檔案

- `asset_registry.js`：語意化插槽定義（`ASSET_REGISTRY`）跟
  兩個存取函式（`getAssetPlaceholder(key)`/
  `getAssetDescription(key)`）。目前每個插槽的`placeholder`都
  是純文字emoji，不是任何圖片檔案。
- `placeholders/`：預留給未來低成本佔位圖（例如簡單的SVG
  草稿）的目錄，本次任務刻意留空（只有一個`.gitkeep`性質的
  `README.md`說明用途），沒有放入任何圖片檔案。

## 未來替換流程（規劃，本次任務不執行）

1. 設計師/插畫師產出真正的手繪風格插畫檔案，放進
   `placeholders/`（屆時目錄可能改名為`illustrations/`）。
2. 修改`asset_registry.js`裡對應插槽的`placeholder`欄位，
   從emoji字串改成檔案路徑（或新增一個`getAssetUrl(key)`
   函式）。
3. 呼叫`getAssetPlaceholder()`/未來的`getAssetUrl()`的元件
   程式碼**完全不需要修改**——這是這個Registry存在的唯一
   理由。

## 明確限制

- ❌ 本次任務沒有產生任何最終插畫/圖片檔案。
- ❌ 本次任務沒有呼叫任何圖片生成工具/AI圖片API。
- ✅ 只有語意化插槽定義跟純文字佔位符（emoji）。
