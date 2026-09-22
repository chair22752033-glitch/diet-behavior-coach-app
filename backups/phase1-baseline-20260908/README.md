# TASK 0.5｜Phase 1 完整備份與版本基準

執行時間：2026-09-22T07:45:57Z
分支：claude/wrangler-deploy-c821f3

## 1. Git 版本基準

- **基準 commit（權威回復依據）**：`7c5522263bcf25f0e3ee5a65b4a019d759a6a481`
  （已存在於遠端分支 origin/claude/wrangler-deploy-c821f3，此為主要可回復依據）
- **Git tag**：`phase1-baseline-20260908`（已在本機建立，**推送到遠端時遇到 GitHub 端 403，未能推送成功**，詳見執行報告）
  → 因基準 commit 本身已在遠端分支上，此限制不影響實際的可回復性，僅是少了一個好記的標籤別名。

## 2. Cloudflare 部署版本

- 目前正式環境運作版本：`b7ac2ea6-5e18-480c-bce7-c9855837ed20`
- 部署時間：2026-08-08T18:34:21.441Z
- 與上述基準 commit 內容一致，無版本落差

## 3. 檔案備份

- `worker.js.bak`：src/worker.js 完整副本（SHA-256 與原檔比對一致）
- `wrangler.toml.bak`：wrangler.toml 完整副本（SHA-256 與原檔比對一致）

## 4. KV 資料匯出

詳見 `kv-export-manifest.md`。摘要：SYNC_KV 中僅 1 筆 key（`sync:4741`），已唯讀匯出、未刪除未修改；
原始個人資料內容基於隱私考量未提交至 Git，僅保存於本次工作環境。

## 5. P1～P6 基準操作紀錄

詳見 `p1-p6-baseline/README.md`。結果：**8/8 全數通過**，皆有截圖存證。

## 回復方式（若後續任務出問題）

1. 程式碼／設定：`git checkout 7c5522263bcf25f0e3ee5a65b4a019d759a6a481 -- src/worker.js wrangler.toml`，或直接從本資料夾的 `worker.js.bak`／`wrangler.toml.bak` 還原
2. 正式環境：重新部署基準 commit 對應的內容（`npx wrangler deploy src/worker.js --name balance-diet`）
3. KV 資料：目前僅 1 筆且未被任何 Phase 1 任務寫入，理論上不需回復；若需要，可用 `kv-export` 內保存的原始內容還原
4. 功能正確性：以 `p1-p6-baseline/baseline_capture.script.js` 重新跑一次，與本次截圖比對
