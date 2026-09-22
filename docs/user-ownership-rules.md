# User Ownership Rules（資料歸屬規則）

Phase 1 TASK 1.14
本文件定義：未來業務資料表如何歸屬於使用者，以及訪客升級會員時的歸屬延續規則。
**本文件只是規則說明，不涉及任何程式碼接入，不影響現有 App 行為。**

---

## 一、資料歸屬規則

以下資料表（TASK1.7 建立）：

- `exploration_records`
- `food_events`
- `emotion_records`
- `behavior_patterns`
- `ai_reports`

**全部必須透過 `user_id` 欄位與 `users` 表建立關聯**（皆為 `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`，已在 TASK1.7 schema 中定義）。

這代表：

1. 任何一筆資料，永遠可以回答「這是誰的」——沒有孤兒資料（不屬於任何 user 的業務紀錄）
2. 使用者被刪除時（`users` 表該筆列被實際 DELETE），其名下所有業務資料一併被資料庫層級的 CASCADE 規則清除，不需要應用層額外寫刪除邏輯（注意：目前設計是「軟刪除」為主，見下方 `status='deleted'`，實際 DELETE 屬於例外情況，非常態流程）
3. 查詢某使用者的資料，一律用 `WHERE user_id = ?`，不會有第二種歸屬路徑

---

## 二、Guest（訪客）的歸屬定義

**`user_id` 永久存在。**

- 訪客第一次使用 App 時，就會被指派一個 `user_id`（`users.id`，見 `src/identity/lifecycle.js` 的 `createGuestIdentity()`）
- 這個 `user_id` 從那一刻起就是「這個人」的永久識別碼，不會因為任何後續事件（包含升級會員）而改變或作廢
- 訪客期間累積的所有 `exploration_records`/`food_events`/`emotion_records`/`behavior_patterns`/`ai_reports`，都掛在這個 `user_id` 底下

---

## 三、升級會員的歸屬規則

**`user_id` 不變。**

當訪客決定用某種方式（未來才會決定：Google OAuth 或其他）驗證身份、升級成正式會員時：

- 更新的是**同一列** `users` 資料（`UPDATE users SET auth_provider=?, auth_provider_id=?, is_guest=0 WHERE id=?`）
- `id` 欄位本身**絕對不會**在這個過程中被改變
- 因為所有業務資料表都是用 `user_id` 做外鍵關聯，`user_id` 沒變，代表訪客期間累積的**所有歷史資料自動、無縫地延續**成為會員身份底下的資料，不需要任何「資料搬移」或「資料合併」的動作

**具體實作**：見 `src/identity/account_upgrade.js` 的 `upgradeIdentity()`（本次任務新增的公開介面），內部委派給 `src/identity/upgrade.js` 的 `upgradeGuestToProvider()`（TASK1.13B 建立）。

---

## 四、明確禁止事項

**禁止建立新的 `user_id` 取代 guest。**

也就是說，升級會員的實作**不可以**採用以下這種（錯誤的）模式：

```
❌ 錯誤模式：
1. 使用者完成 OAuth 驗證，取得 provider+providerId
2. 建立一個全新的 users 列（新的 user_id），auth_provider/auth_provider_id 填入新驗證結果
3. 把舊 guest user_id 底下的資料想辦法「搬」到新 user_id 底下
4. 舊 guest user 列刪除或棄置
```

這種模式的風險：資料搬移過程可能遺漏、外鍵關聯需要逐表更新、萬一中途失敗容易產生資料不一致或遺失。

**正確模式**（本專案採用）：

```
✅ 正確模式：
1. 使用者完成身份驗證，取得 provider+providerId
2. 原地更新「同一個」guest 的 users 列：填入 auth_provider/auth_provider_id、is_guest改0
3. user_id 從頭到尾都是同一個值
4. 所有子表資料因為外鍵值沒變，自動延續，不需要搬移任何一筆資料
```

---

## 五、與其他任務的關聯

- Session 關聯規則（見 `src/identity/README.md`）：升級會員時，即使 `user_id` 沒變，仍會撤銷所有舊 session（防止 session fixation），這與「資料歸屬」是兩件獨立的事——**資料的歸屬不變，但登入憑證(session)基於資安考量會重新產生**
- Legacy Import（見 `docs/phase1-legacy-import-mapping.md`）：舊版 KV `sync:<code>` 資料匯入時，也是先建立一個新的 guest `user_id`（`legacy_sync_code` 欄位記錄原始 KV code），資料歸屬到這個新建立的 guest user_id 底下，之後若該使用者升級會員，同樣適用本文件的「`user_id` 不變」規則

---

## 六、本文件的範圍限制

本文件只是規則說明，**沒有任何一條規則已經被實際程式碼「強制執行」在正式環境**——因為：

- `src/worker.js` 完全沒有讀寫這些資料表的程式碼
- 沒有任何登入流程、沒有任何 OAuth，使用者也還無法真的「升級」
- 這份文件的用途是：等到未來真的要開放這些功能時，實作者（不論是誰）有一份明確、經過測試驗證（見 `backups/phase1-task1.14-guest-lifecycle/`）的規則可以依循，不需要重新設計資料歸屬邏輯
