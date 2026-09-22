# Legacy Import 基礎架構（Phase 1 TASK 1.9）

這個資料夾只放「框架」：把舊資料格式轉換成 D1 資料列的**純函式**，以及對應的測試。
**沒有任何檔案會連線 KV、連線 D1、呼叫 API，或修改 `src/worker.js`。**

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `field_mapping.js` | 共用對照表常數（ID_TYPES key→中文名稱、支援/排除的來源格式） |
| `parse_legacy_blob.js` | 核心 parser：`parseLegacyBlob(sourceKey, raw, opts)` — 把一段舊資料 JSON 轉成 D1 資料列物件陣列 |
| `build_import_log_entry.js` | 輔助函式：組出符合 `legacy_import_log` 表欄位的資料列 |
| `fixtures/sample_legacy_blob.json` | **完全虛構**的測試資料（所有文字皆為「測試用」占位內容），非任何真實使用者資料 |
| `verify_parser.js` | 對 fixture 執行 parser 並斷言驗證，純記憶體運算 |

## 使用方式（本次僅示範，不執行真實匯入）

```bash
node scripts/legacy_import/verify_parser.js
```

## 未來真正執行遷移時（不在本次 TASK1.9 範圍）

1. 從 KV 讀出 `sync:<code>` 內容（唯讀）
2. 呼叫 `parseLegacyBlob(sourceKey, rawJson)` 取得轉換後的資料列
3. 依序 INSERT：先寫 `users`，取得真正的 user id；再寫 `food_events`，記下每筆的真實自增 id；
   再用這個真實 id 把 `emotion_records` 裡暫存的 `linked_food_event_local_index` 換成真正的
   `linked_food_event_id`；再寫 `exploration_records`、`behavior_patterns`
4. 用 `buildImportLogEntry()` 記一筆 `legacy_import_log`（status 從 pending 更新為 imported/failed）
5. 全程建議包在一個 D1 transaction（`db.batch([...])`）裡，任何一步失敗就整批不寫入，避免半套資料

以上步驟本次**完全沒有執行**，只是把「將來要做這件事時，資料要怎麼轉換」的規則與程式碼準備好。
