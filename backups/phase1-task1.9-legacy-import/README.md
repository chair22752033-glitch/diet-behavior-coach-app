# TASK 1.9 執行結果｜建立 Legacy Import 基礎架構

執行日期：2026-09-22

限制遵守情形：
✅ 未執行真實資料遷移（parser 只對虛構測試資料執行，未寫入任何 D1）｜✅ 未讀取正式 KV 使用者資料（全程未呼叫 `wrangler kv key get` 讀取 `sync:4741` 等任何正式資料）｜✅ 未修改 `src/worker.js`（`git diff --stat` 為空）｜✅ 未建立登入流程｜✅ 未建立任何 API endpoint｜✅ 只建立了未來 KV/localStorage → D1 的 mapping 文件與匯入框架

---

## 一、新增檔案

本次**只新增檔案，未修改任何既有檔案**（`src/worker.js`、`wrangler.toml` 皆零異動）：

```
docs/
└── phase1-legacy-import-mapping.md      # Legacy Import Mapping 文件（主要交付物）

scripts/legacy_import/
├── field_mapping.js                     # 共用對照表常數（ID_TYPES key→中文名稱、來源格式定義）
├── parse_legacy_blob.js                 # 核心 parser：parseLegacyBlob(sourceKey, raw, opts)
├── build_import_log_entry.js            # legacy_import_log 資料列建構輔助函式
├── fixtures/
│   └── sample_legacy_blob.json          # 完全虛構的測試資料（非真實使用者資料）
├── verify_parser.js                     # 對 fixture 的單元測試腳本
└── README.md                            # 使用說明
```

---

## 二、Mapping 設計

### 頂層結構（KV `sync:<code>` / localStorage `diet_app_v1`，兩者格式相同）

```
{ ft, ins[], identity, quest.entries[], meals.entries[], ba.entries[] }
```

### 對應到 D1（TASK1.7 schema）的規則摘要

| 來源 | 目標表 | 對應筆數 | pattern_type / 備註 |
|---|---|---|---|
| 每個來源 key | `users` | 1 → 1 | `is_guest=1`，`legacy_sync_code` 存來源 key 供追蹤與防重複匯入 |
| `identity` | `behavior_patterns` | 1 → 最多1 | `pattern_type='identity_quiz'`，key 透過內建 5 種 ID_TYPES 對照表轉中文 |
| `quest.entries[]` | `exploration_records` | N → N | 單卡時 `card_category/object_key/text/photo_idx` 直接填入；多卡時留空、完整內容在 `responses_json` |
| `meals.entries[]` | `food_events` | N → N | `description` 為餐點名稱組合，原始細節存 `nutrients_json` |
| `meals.entries[]`（僅有 mood 者） | `emotion_records` | 部分 → 部分 | 用陣列索引暫存與 `food_events` 的關聯，待真正 INSERT 取得自增 id 後才轉換為 `linked_food_event_id` |
| `ba.entries[]` | `behavior_patterns` | N → N | `pattern_type='behavior_breakdown'` |
| `ins[]` | `behavior_patterns` | N → N | `pattern_type='daily_checkin'` |
| `ft` | （不遷移） | — | 純前端 onboarding 旗標，非使用者內容 |

**設計原則**：純函式零 I/O、防呆優先（缺欄位/JSON 損毀不中斷、不拋例外）、無損保留（完整原始物件都存進 `_json` 欄位）、延遲外鍵綁定（D1 自增 id 要等真正寫入才存在，parser 階段先用陣列索引暫存關聯）。完整規則表格見 `docs/phase1-legacy-import-mapping.md`。

---

## 三、可支援的舊資料格式

| 格式 | 說明 | 是否支援 |
|---|---|---|
| KV `sync:<code>` | 主要來源，經 `/api/sync` 讀寫 | ✅ |
| 瀏覽器 localStorage `diet_app_v1` | 與 KV 結構完全相同，可用同一套 parser | ✅ |
| KV `qlive:<code>` | QUEST 即時同步暫存（1小時TTL），非歷史紀錄 | ❌ 明確排除，已在文件中說明原因 |

---

## 四、驗證方式

執行 `node scripts/legacy_import/verify_parser.js`，5 種情境全數通過：

```
✅ 主要 fixture 驗證通過，統計： {"exploration_records":2,"food_events":2,"emotion_records":1,"behavior_patterns":3}
   警告： ["ft 欄位（首次使用旗標，前端 onboarding 狀態）不在遷移範圍內，已略過"]
✅ 空物件邊界測試通過（不應報錯，也不應產生任何資料列）
✅ 損毀 JSON 邊界測試通過（正確回報 ok:false，不會拋出例外中斷程式）
✅ 頂層非物件（陣列）邊界測試通過
✅ 部分欄位缺漏／未知identity key 測試通過

✅✅✅ 全部驗證通過（純記憶體運算，未連線任何資料庫或API）
```

驗證重點：
1. **筆數正確性**：fixture 內 2 筆 quest 抽卡 → 2 筆 exploration_records；2 筆 meals（1筆有mood）→ 2 筆 food_events + 1 筆 emotion_records；1 筆 identity + 1 筆 ba + 1 筆 ins → 合計 3 筆 behavior_patterns
2. **單卡/多卡分流正確**：單張卡片時 `card_category` 正確填入 `'T'`；多張卡片時正確留空（完整內容改存 `responses_json`）
3. **關聯索引正確**：`emotion_records[0].linked_food_event_local_index` 正確對應到 `food_events[0]`
4. **防呆機制有效**：空物件、JSON 損毀、頂層陣列、未知 identity key 皆能正確處理不中斷
5. **測試資料完全虛構**：`fixtures/sample_legacy_blob.json` 所有文字皆標註「測試用」占位內容，全程未讀取、未接觸任何正式環境的真實使用者 KV 資料（未執行任何 `wrangler kv key get`）

---

## 五、回滾方式

本次只新增檔案，未修改任何既有檔案、未寫入任何資料庫：

```bash
git revert <本次commit hash>
```

即可完全移除 `docs/phase1-legacy-import-mapping.md` 與 `scripts/legacy_import/` 整個資料夾，不影響 `src/worker.js`、`wrangler.toml`、D1 資料庫或任何正式服務。

---

## 六、是否可以進入後續 TASK

**✅ 可以。** Mapping 文件與 parser/helper 框架皆已建立並通過驗證，且全程未修改 `src/worker.js`、未讀取任何正式使用者資料、未建立 API endpoint 或登入流程，完全符合本次限制範圍。
