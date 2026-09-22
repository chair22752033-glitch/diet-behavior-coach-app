# Domain Service Layer（Phase 1 TASK 1.15）

未來業務邏輯層，目的是避免未來 UI 或 API 直接操作 D1。**本次任務不是新增功能**，
`src/worker.js` 沒有任何一行 import 這裡的任何檔案，現有 App 行為完全不受影響。

## 分層架構

```
worker.js
   ↓
future API          ← 尚未建立，本次任務範圍之外
   ↓
services/            ← 本次任務（這裡）
   ↓
db access layer      ← TASK1.12 建立（src/db/）
   ↓
D1
```

## 檔案

| 檔案 | 負責範圍 |
|---|---|
| `user_service.js` | 使用者查詢與狀態驗證，是其他 5 個 service 共用的入口 |
| `exploration_service.js` | QUEST / 探索紀錄 |
| `food_service.js` | 飲食紀錄（`nutrients_json` 原樣保留，不解析、不改寫） |
| `emotion_service.js` | 情緒紀錄（保留 `linked_food_event_id` 關聯能力） |
| `behavior_service.js` | 行為模式資料存取（不含任何 AI 分析邏輯） |
| `report_service.js` | AI 報告資料存取（本階段不串接 AI） |

## 設計規則

1. **不直接操作 D1 connection**：這裡完全不 `import` `src/db/query.js` 或 `transaction.js`，只透過呼叫端傳入的 `db`（`createDb(env)` 的回傳值，見 TASK1.12）操作
2. **一律透過 db access layer**：每個 service 函式的第一個參數都是 `db`，內部呼叫 `db.users.*`、`db.explorationRecords.*` 等既有方法，不寫任何原生 SQL
3. **不依賴 worker.js**：這些檔案完全獨立，`src/worker.js` 也沒有 import 它們
4. **不建立 API route**：全部是可被呼叫的函式，不是 HTTP handler
5. **每個寫入/查詢操作都先驗證 user**：全部透過 `user_service.js` 的 `requireActiveUser()`，狀態不允許（不存在/停權/已刪除）的使用者一律被拒絕，不會建立或查到任何資料

## 測試方式

`backups/phase1-task1.15-domain-service/test_domain_service_mock.mjs`：純記憶體 mock db 物件，測試每個 service 的正常流程與「錯誤 user 被拒絕」情境，完全不連線任何真實或本機模擬的資料庫。
