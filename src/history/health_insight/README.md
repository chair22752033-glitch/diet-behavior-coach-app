# Health Insight History Retrieval Boundary（TASK1.124）

## 目的

把TASK1.120就已經存在、但至今沒有任何route/controller呼叫過的
`listHealthInsightRecordsForUser()`（見
`src/persistence/health_insight/`），接上一層乾淨的History存取
邊界，讓Dashboard能顯示"陪伴紀錄"跟"進度方向"這兩個規格明確要求
的產品體驗，同時不讓UI直接碰資料庫。

## 架構位置

```
User Identity（TASK1.118/1.119既有）
  ↓
History Service（這個模組）
  ↓
Persistence Layer（src/persistence/health_insight/，TASK1.120既有，本次任務不修改）
  ↓
D1 Database（health_insight_records表，本次任務不新增migration）
```

呼叫端只有`src/routes/health_insight_routes.js`。
`src/ui/health_insight/`底下所有檔案完全不import這個模組，只接收
route層已經整理好的安全摘要資料（純JS物件），符合規格"Do NOT
query database directly from UI"的明確要求。

## Security（規格明確要求）

公開函式`getHealthInsightHistoryForIdentity(db, identity, options)`
**只接受`identity`物件，不接受任意`userId`字串**——實際查詢用的
`userId`永遠只能來自`identity.userId`（由既有session/OAuth身份
解析產生），呼叫端沒有任何管道指定「想查誰的紀錄」，結構性地
保證一個使用者永遠查不到別人的紀錄。

## Anonymous behavior

匿名使用者（`identity.authenticated !== true`）完全不會觸發任何
D1查詢，直接安全回傳`{ok:true, authenticated:false, records:[]}`。

## 摘要格式（不做AI/評分判斷）

`summarizeHealthInsightRecord()`只從既有存好的
`input_snapshot`/`output_snapshot`兩個JSON欄位挑出
`healthGoal`/`observationCount`/`recommendationCount`跟`id`/
`createdAt`，純粹是既有已存資料的欄位挑選跟計數，不產生任何新的
健康評分、醫療判讀、或AI生成文字（延續規格"Progress must be
based on existing stored product data only"、"Do not create
complex health scoring system / medical evaluation / AI-generated
progress judgment"的明確限制）。

## Failure isolation

`getHealthInsightHistoryForIdentity()`永遠不會拋出例外，也永遠
回傳`ok:true`——任何查詢失敗都安全退回空紀錄清單，不影響使用者
當次的Health Insight主要體驗。
