# TASK 1.8 執行結果｜建立 Content Seed 流程

執行日期：2026-09-22
資料庫：`diet-coach-db`（`database_id=9560446f-5d56-45e4-b605-ddec5cdf909f`）
Migration：`migrations/0002_phase1_task1_8_seed_content.sql`

限制遵守情形：
✅ 只將現有 nutrients/scenarios 靜態資料轉換為 D1 seed 資料｜✅ 未修改 `src/worker.js`（`git diff --stat` 為空）｜✅ 未改變現有 UI｜✅ 未讓 App 改讀 D1（`src/worker.js` 完全沒有讀取 D1 的程式碼，`NUTRI_DATA`/`SCEN_DATA` 兩個常數原封不動，App 行為 100% 不變）｜✅ 未建立任何 API endpoint｜✅ 未進行使用者資料遷移（本次搬的是寫死在程式碼裡的「靜態參考內容」，不是任何使用者的 KV/localStorage 個人資料，`users` 等其他表本次仍是 0 筆）

---

## 一、Seed Script

新增 `scripts/seed_content_from_worker.js`：

- **讀取方式**：用 Node `vm` sandbox 載入 `src/worker.js`（唯讀，不修改），執行其 `getHTML()` 取出內嵌的 `<script>`，在沙盒中還原出真正的 `NUTRI_DATA`、`SCEN_DATA` 兩個 JS 物件（與先前 TASK1.5/1.6 驗證時使用的手法一致）
- **轉換規則**：
  - `nutrients`：`NUTRI_DATA` 是 `{分類: [營養素物件,...]}` 的巢狀物件，共 7 個分類（macro/amino/fat/vitamin/mineral/fiber/phyto）。展開後每筆給一個穩定 id（`<分類>_<兩位數序號>`，例如 `macro_01`），`description` 取原始 `role` 欄位，`data_json` 存整包原始物件（無損，供未來還原用），`unit` 目前無對應原始欄位故留空
  - `scenarios`：`SCEN_DATA` 是陣列，每筆物件本身已有 `id`/`title`/`sys`，直接對應到 `id`/`title`/`category`，`data_json` 存整包原始物件
- **輸出**：`INSERT ... ON CONFLICT(id) DO UPDATE ...`（upsert）SQL 陳述式，可重複執行不會產生重複資料
- **執行方式**：`node scripts/seed_content_from_worker.js > migrations/0002_phase1_task1_8_seed_content.sql`（純文字輸出，不會自動連線任何資料庫，套用與否是後續獨立步驟）

過程說明：套用 migration 時同樣需要 `wrangler.toml` 暫時含有 `[[d1_databases]]` binding 供 CLI 解析（與 TASK1.7 相同做法），操作期間**全程未執行 `wrangler deploy`**，完成後已復原為純註解狀態；`src/worker.js` 全程零修改。

---

## 二、匯入資料數量

| 目的地 | nutrients | scenarios | 合計 |
|---|---|---|---|
| 本地（`--local`，Miniflare 模擬） | 67 | 14 | 81 |
| 正式（`--remote`，真實 D1） | 67 | 14 | 81 |

（`wrangler d1 migrations apply` 回報「82 commands executed」，多出的 1 筆是 wrangler 自動記錄本次 migration 已套用的 `d1_migrations` 表寫入，非資料表資料本身）

---

## 三、nutrients / scenarios 筆數

**nutrients：67 筆**（與 `src/worker.js` 內 `NUTRI_DATA` 總筆數完全一致）

| 分類 | 筆數 |
|---|---|
| macro（三大營養素） | 4 |
| amino（胺基酸） | 14 |
| fat（脂肪酸/油脂） | 7 |
| vitamin（維生素） | 13 |
| mineral（礦物質） | 12 |
| fiber（膳食纖維） | 3 |
| phyto（植化素） | 14 |
| **合計** | **67** |

**scenarios：14 筆**（與 `src/worker.js` 內 `SCEN_DATA` 總筆數完全一致）

| 系統分類（sys） | 筆數 |
|---|---|
| social（人際） | 5 |
| stress（壓力） | 3 |
| sleep（睡眠） | 2 |
| eat（飲食） | 2 |
| move（活動） | 2 |
| **合計** | **14** |

---

## 四、驗證結果

1. **筆數比對**：D1（本地+正式）與 `src/worker.js` 來源的 `NUTRI_DATA`（67）、`SCEN_DATA`（14）筆數完全一致
2. **分類分佈比對**：nutrients 7 個分類、scenarios 5 個系統分類的筆數分佈皆與來源程式碼逐一核對相符
3. **內容逐位元組比對**（最嚴格的驗證）：以來源 `NUTRI_DATA`/`SCEN_DATA` 物件重新用相同規則產生 `id → JSON字串`對照表，與 D1（本地）內每一筆 `data_json` 逐筆字串比對：
   - nutrients：67 / 67 筆完全一致，**0 筆不符**
   - scenarios：14 / 14 筆完全一致，**0 筆不符**
4. **中文內容完整性抽查**：隨機抽查 `macro_01`（碳水化合物）、`forced_drink`（飯局被勸酒）等筆，中文字、標點、emoji 皆正確無亂碼
5. **冪等性確認**：重複執行 `wrangler d1 migrations apply diet-coach-db --local` 顯示 `✅ No migrations to apply!`（不會重複寫入或報錯，`ON CONFLICT DO UPDATE` upsert 機制正常）
6. **App 行為未受影響確認**：
   - `git diff --stat src/worker.js` 為空
   - `wrangler deployments list` 確認正式環境版本仍是 TASK1.6 的 `f441a4da`，過程未觸發任何新部署
   - `users`、`exploration_records` 等其他 9 張表在正式 D1 中仍是 0 筆，本次操作範圍精準限定在 nutrients/scenarios 兩張表

---

## 五、回滾方式

**A. 清空 seed 資料（保留表結構）**
```bash
npx wrangler d1 execute diet-coach-db --remote --command "DELETE FROM nutrients; DELETE FROM scenarios;"
```
（本地驗證環境可加 `--local`）

**B. 版本控制回滾**
```bash
git revert <本次commit hash>
```
會移除 `scripts/seed_content_from_worker.js` 與 `migrations/0002_phase1_task1_8_seed_content.sql` 檔案本身（不會自動清空已寫入 remote D1 的資料，需搭配上述 A 手動執行）

**C. 完全不處理**：因為 `src/worker.js` 完全沒有讀取這兩張表，App 行為不受任何影響，即使不回滾也無風險，可留著等待後續任務決定何時真正接入。

---

## 六、是否可以進入後續 TASK

**✅ 可以。** nutrients、scenarios 兩張參考資料表已在本地與正式 D1 完成 seed，筆數、分類分佈、內容逐筆比對皆 100% 相符，且全程未修改 `src/worker.js`、未觸發新部署、未動到任何使用者資料表。

---

## 檔案結構

- `scripts/seed_content_from_worker.js`（位於專案根目錄）：seed SQL 產生腳本
- `migrations/0002_phase1_task1_8_seed_content.sql`（位於專案根目錄）：正式 migration 檔案（81 筆 upsert INSERT）
- `local_nutrients.json` / `local_scenarios.json`：本地驗證時完整撈出的 `data_json` 存檔（用於逐位元組比對）
- `remote-nutrients-list.json` / `remote-scenarios-list.json`：正式 D1 驗證時的清單存檔（id/name/title/category）
