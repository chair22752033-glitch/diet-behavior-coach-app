# Phase 1 TASK 1.9｜Legacy Import Mapping 文件

執行日期：2026-09-22
用途：定義「舊資料（KV / localStorage）→ D1（TASK1.7 schema）」的欄位對應規則，供未來真正執行資料遷移的 TASK 依循。
**本文件與本次建立的程式框架，皆未讀取任何正式使用者的 KV 內容，也未執行任何真實資料遷移。**

---

## 一、可支援的舊資料格式

| 格式 | Key 樣式 | 讀取方式 | 內容結構 | 是否納入本次 mapping |
|---|---|---|---|---|
| **KV `sync:<code>`** | 例如 `sync:4741` | Worker `/api/sync?code=<code>` GET，或 `wrangler kv key get` | 見下方「頂層結構」 | ✅ 是（主要來源） |
| **瀏覽器 localStorage** | 固定 key `diet_app_v1`（程式中的 `SK` 常數） | 使用者裝置端 `localStorage.getItem('diet_app_v1')` | 與 KV `sync:<code>` **完全相同的 JSON 結構**（`sd()` 函式同時寫入兩處） | ✅ 是（與 KV 用同一套 parser 處理） |
| KV `qlive:<code>` | 例如 `qlive:4741` | `/api/qlive` | QUEST 即時同步用的暫存座標（1小時TTL） | ❌ 否，明確排除（純即時暫存，非歷史紀錄，見下方說明） |

**排除 `qlive:*` 的原因**：這組資料只用於「兩個裝置同時看同一場 QUEST 抽卡直播」的即時同步游標，TTL 僅 1 小時，內容是 `{ts, qst:{mode,phase,stepCats,stepIdx,confirmed,current,cards}}` 這種當下畫面狀態快照，不是使用者的歷史紀錄，沒有遷移到 D1 的價值或必要性。

---

## 二、頂層資料結構（`ld()` 回傳值 / KV `sync:<code>` 內容）

```
{
  ft: boolean,              // 首次使用旗標（onboarding），不遷移
  ins: [ {ts, st, beh, crave}, ... ],           // 每日打卡
  identity: { key, ts },                         // 身份測驗結果
  quest: { entries: [ {ts, mode, cards, note, carry, insight}, ... ] },   // QUEST探索紀錄
  meals: { entries: [ {ts, names, emojis, cats, mood, reasons}, ... ] },  // 飲食記錄
  ba: { entries: [ {ts, food, cat, time, situ, why, mood, process, type, redo}, ... ] }  // 行為拆解
}
```

以上 7 個欄位皆為可選（早期資料可能只有 `ft`+`ins`，例如目前正式環境唯一一筆 `sync:4741` 就沒有 `meals`/`ba`，代表這組資料是在飲食記錄／行為拆解功能上線前建立的）。Parser 對每個欄位都做了「不存在就跳過、不報錯」的防呆處理。

---

## 三、欄位對應規則

### 3.1 每個來源 key → 一筆 `users`

| 目標欄位 | 規則 |
|---|---|
| `id` | 匯入時新產生 UUID v4 |
| `auth_provider` / `auth_provider_id` | `NULL`（舊資料都是訪客，無登入資訊） |
| `display_name` | `NULL` |
| `is_guest` | `1` |
| `legacy_sync_code` | 來源 key 原文（例如 `"sync:4741"`），供日後追蹤來源、避免重複匯入 |
| `created_at` / `updated_at` | 匯入當下時間 |

### 3.2 `identity` → 1 筆 `behavior_patterns`（`pattern_type='identity_quiz'`）

| 來源欄位 | 目標欄位 | 說明 |
|---|---|---|
| （對應的 user） | `user_id` | 3.1 建立的 user id |
| 固定值 | `pattern_type` | `'identity_quiz'` |
| `identity.key`（查 `ID_TYPES` 對照表取得中文名稱） | `summary` | 例如 `"身份測驗結果：行動派"` |
| `identity`（原始物件）+ 對照到的中文名稱 | `evidence_json` | `{"raw":{...},"matched_title":"..."}`，保留原始資料無損 |
| `identity.ts`（epoch ms） | `detected_at` | 轉換為 ISO 字串 |

`ID_TYPES` 對照表（5 種身份，唯讀複製自 `src/worker.js`，未修改原檔）：

| key | 中文名稱 |
|---|---|
| intuitive | 直覺派 |
| active | 行動派 |
| healing | 療癒派 |
| connector | 連結派 |
| discipline | 自律派 |

若 `identity.key` 不在對照表中（理論上不會發生，但做了防呆），直接使用原始 key 字串，不會中斷匯入。

### 3.3 `quest.entries[]` → N 筆 `exploration_records`（一筆對一筆）

| 來源欄位 | 目標欄位 | 說明 |
|---|---|---|
| `entry.mode` | `draw_mode` | `single`/`map`/`panorama` |
| `entry.cards[0].c`（僅當該筆只抽 1 張卡） | `card_category` | 多張卡時留 `NULL`（完整內容在 `responses_json`） |
| `entry.cards[0].o` | `card_object_key` | 同上，僅單卡時填入 |
| `entry.cards[0].t` | `card_text` | 同上 |
| `entry.cards[0].photoIdx` | `photo_idx` | 同上 |
| `{cards, note, carry, insight}`（完整保留） | `responses_json` | 不論單卡或多卡，原始細節都完整保留在這裡，`card_category` 等欄位只是「單卡情境下的查詢捷徑」 |
| `entry.ts` | `occurred_at` | 轉換為 ISO 字串 |

### 3.4 `meals.entries[]` → N 筆 `food_events`（+ 有 `mood` 時額外 1 筆 `emotion_records`）

**`food_events`：**

| 來源欄位 | 目標欄位 | 說明 |
|---|---|---|
| `entry.names.join('、')` | `description` | 例如 `"測試餐點A、測試餐點B"` |
| （原始無對應欄位） | `meal_type` | `NULL`（舊資料沒有記錄早/中/晚餐分類） |
| `{names, emojis, cats}`（完整保留） | `nutrients_json` | 欄位命名沿用 schema，但目前存的是原始細節而非正式營養素計算結果 |
| `entry.ts` | `occurred_at` | |

**`emotion_records`（僅當 `entry.mood` 非空字串時才建立）：**

| 來源欄位 | 目標欄位 | 說明 |
|---|---|---|
| `entry.mood` | `emotion_type` | |
| （原始無強度數值） | `intensity` | `NULL` |
| `entry.reasons.join('、')` | `trigger_note` | |
| 對應的 `food_events` 資料列 | `linked_food_event_id` | **注意**：parser 產生階段還沒有真正的資料庫自增 id，先用 `linked_food_event_local_index` 暫存「對應到 food_events 陣列中第幾筆」，等真正 INSERT 進 D1、拿到自增 id 後，未來執行匯入的 TASK 需要自己把這個索引換成真正的 id 再寫入 |
| `entry.ts` | `occurred_at` | |

### 3.5 `ba.entries[]`（行為拆解）→ N 筆 `behavior_patterns`（`pattern_type='behavior_breakdown'`）

| 來源欄位 | 目標欄位 |
|---|---|
| 固定值 | `pattern_type = 'behavior_breakdown'` |
| `entry.food` + `entry.why`（以「｜」串接） | `summary` |
| 整個 `entry` 物件（含 `cat/time/situ/mood/process/type/redo`） | `evidence_json`（完整保留，無損） |
| `entry.ts` | `detected_at` |

### 3.6 `ins[]`（每日打卡）→ N 筆 `behavior_patterns`（`pattern_type='daily_checkin'`）

| 來源欄位 | 目標欄位 |
|---|---|
| 固定值 | `pattern_type = 'daily_checkin'` |
| `entry.beh` + （`entry.crave` 為真時加註「有渴望感」） | `summary` |
| 整個 `entry` 物件（含不透明的 `st` 狀態快照） | `evidence_json`（完整保留，無損） |
| `entry.ts` | `detected_at` |

### 3.7 不遷移的欄位

| 欄位 | 原因 |
|---|---|
| `ft` | 純前端 onboarding 顯示旗標，不是使用者內容，D1 schema 沒有對應欄位，也不需要 |

### 3.8 `images` 表

本次 mapping **不涉及** `images` 表。理由：QUEST 使用的圖片都是 App 內建固定圖片（已在 TASK1.4/1.6 直接以 R2 路徑對應處理，與使用者個人資料無關），舊資料（`sync:<code>`）裡也沒有任何「使用者自行上傳的圖片」欄位可供遷移。`images` 表會在未來使用者可以自行上傳照片的功能推出後才會用到。

### 3.9 `legacy_import_log` 使用規則

每處理一個來源 key（例如 `sync:4741`），未來執行匯入的 TASK 應該：

1. 匯入前先查一次 `legacy_import_log` 是否已有該 `source_key` 且 `status='imported'` 的紀錄，**避免重複匯入**
2. 匯入開始時寫入一筆 `status='pending'`
3. 成功後更新為 `status='imported'`，`detail_json` 記錄轉出的各表筆數統計
4. 失敗則更新為 `status='failed'`，`detail_json` 記錄錯誤訊息，方便之後重試

`build_import_log_entry.js` 已提供 `buildImportLogEntry(sourceType, sourceKey, status, detail)` 輔助函式產生對應資料列（純函式，本次未串接任何實際寫入）。

---

## 四、Parser / Helper 架構

```
scripts/legacy_import/
├── field_mapping.js         # 共用對照表常數（ID_TYPES key→中文名稱、來源格式定義）
├── parse_legacy_blob.js     # 核心 parser：parseLegacyBlob(sourceKey, raw, opts)
├── build_import_log_entry.js # legacy_import_log 資料列建構輔助函式
├── fixtures/
│   └── sample_legacy_blob.json  # 完全虛構的測試資料（非真實使用者資料）
├── verify_parser.js         # 對 fixture 的單元測試（純記憶體運算，不連線任何資料庫/API）
└── README.md                # 使用說明
```

**設計原則**：

- **純函式、零 I/O**：`parseLegacyBlob()` 不讀 KV、不讀 D1、不呼叫 fetch，輸入 JSON 字串（或已解析物件），輸出資料列陣列，方便單獨測試、也方便未來包進任何執行環境（Worker/Node script 皆可）
- **防呆優先**：任何欄位缺漏、型別不符、JSON 損毀，都回傳結構化的 `{ok:false, error}` 或在 `warnings` 陣列註記，**不會拋出例外中斷整批匯入**
- **無損保留**：所有轉換都同時把「完整原始物件」存進對應的 `_json` 欄位（`evidence_json`/`responses_json`/`nutrients_json`），即使欄位對應規則未來需要調整，原始資料不會遺失
- **延遲外鍵綁定**：`food_events`↔`emotion_records` 的關聯用陣列索引（`_localIndex`/`linked_food_event_local_index`）暫存，因為 D1 自增 id 只有實際 INSERT 後才會產生，parser 階段本來就無法預先知道

---

## 五、驗證方式

執行 `node scripts/legacy_import/verify_parser.js`，涵蓋 5 種情境（全部通過）：

1. **完整 fixture**：涵蓋 identity/quest(單卡+多卡)/meals(有mood+無mood)/ba/ins 全部欄位，驗證各表筆數、內容對應正確
2. **空物件 `{}`**：確認不報錯、不產生任何資料列
3. **JSON 格式損毀**：確認回傳 `{ok:false}` 而非拋出例外
4. **頂層非物件（陣列）**：確認正確擋下並回報錯誤原因
5. **欄位部分缺漏／未知 identity key**：確認防呆機制正常運作，不會因缺欄位而中斷

**測試資料完全虛構**（`fixtures/sample_legacy_blob.json` 所有文字皆標註「測試用」），未讀取、未接觸任何正式環境的真實使用者 KV 資料。

---

## 六、回滾方式

因為本次只新增檔案（`docs/phase1-legacy-import-mapping.md`、`scripts/legacy_import/*`），**沒有修改任何既有檔案，也沒有寫入任何資料庫**，回滾方式：

```bash
git revert <本次commit hash>
```

即可完全移除本次新增的所有檔案，不會影響 `src/worker.js`、`wrangler.toml`、D1 資料庫或任何正式服務。

---

## 七、限制遵守情形

✅ 未執行真實資料遷移（parser 只對合成測試資料執行，未寫入任何 D1）｜✅ 未讀取正式 KV 使用者資料（未呼叫 `wrangler kv key get` 讀取 `sync:4741` 等正式資料）｜✅ 未修改 `src/worker.js`｜✅ 未建立登入流程｜✅ 未建立任何 API endpoint｜✅ 只建立了 mapping 文件與 parser/helper 框架
