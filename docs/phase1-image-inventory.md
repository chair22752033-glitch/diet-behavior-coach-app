# Phase 1 圖片資產盤點清單（TASK 1.3）

執行日期：2026-09-22
用途：為 TASK 1.4（上傳圖片至 R2）預先規劃 R2 路徑對應表，本文件**不涉及任何程式碼修改、不上傳任何檔案**。

## 總覽

| 類別 | 數量 | 格式 | 總大小 |
|---|---|---|---|
| QUEST 分類場景照片（地形/身影/天象/門檻/異象） | 13 張 | JPEG | 231,763 bytes（約 226 KB） |
| QUEST 信物照片（O 類，14 個物件） | 14 張 | JPEG | 322,442 bytes（約 315 KB） |
| App Icon | 1 張 | PNG | 1,843 bytes |
| **合計** | **28 張** | — | **約 542 KB** |

重複檢查結果：**27 張 QUEST 照片經 MD5 雜湊比對，全部互不相同，無重複**。物件卡（O 類）14 個物件與照片一一對應，**無遺漏**。

---

## 一、QUEST 分類場景照片（5 大分類，13 張）

分類定義：`{T:地形, F:身影, W:天象, H:門檻, E:異象}`（信物 O 類另列於下方）

| 變數名稱 | 分類 | 用途 | 格式/大小 | 建議 R2 路徑 |
|---|---|---|---|---|
| `QST_PHOTO_T` | 🏞️ 地形 | QUEST 抽卡池之一（地形類第 1 張） | JPEG, 20,938 bytes | `quest/scenes/terrain-1.jpg` |
| `QST_PHOTO_T2` | 🏞️ 地形 | QUEST 抽卡池之一（地形類第 2 張） | JPEG, 22,166 bytes | `quest/scenes/terrain-2.jpg` |
| `QST_PHOTO_T3` | 🏞️ 地形 | QUEST 抽卡池之一（地形類第 3 張） | JPEG, 17,394 bytes | `quest/scenes/terrain-3.jpg` |
| `QST_PHOTO_F` | 🚶 身影 | QUEST 抽卡池之一（身影類第 1 張） | JPEG, 26,141 bytes | `quest/scenes/figure-1.jpg` |
| `QST_PHOTO_F2` | 🚶 身影 | QUEST 抽卡池之一（身影類第 2 張） | JPEG, 21,662 bytes | `quest/scenes/figure-2.jpg` |
| `QST_PHOTO_F3` | 🚶 身影 | QUEST 抽卡池之一（身影類第 3 張） | JPEG, 24,330 bytes | `quest/scenes/figure-3.jpg` |
| `QST_PHOTO_W` | 🌥️ 天象 | QUEST 抽卡池之一（天象類第 1 張） | JPEG, 13,217 bytes | `quest/scenes/weather-1.jpg` |
| `QST_PHOTO_W2` | 🌥️ 天象 | QUEST 抽卡池之一（天象類第 2 張） | JPEG, 14,270 bytes | `quest/scenes/weather-2.jpg` |
| `QST_PHOTO_W3` | 🌥️ 天象 | QUEST 抽卡池之一（天象類第 3 張） | JPEG, 8,639 bytes | `quest/scenes/weather-3.jpg` |
| `QST_PHOTO_H` | 🚪 門檻 | QUEST 抽卡池之一（門檻類第 1 張） | JPEG, 16,967 bytes | `quest/scenes/threshold-1.jpg` |
| `QST_PHOTO_H2` | 🚪 門檻 | QUEST 抽卡池之一（門檻類第 2 張） | JPEG, 21,308 bytes | `quest/scenes/threshold-2.jpg` |
| `QST_PHOTO_E` | ✨ 異象 | QUEST 抽卡池之一（異象類第 1 張） | JPEG, 12,856 bytes | `quest/scenes/wonder-1.jpg` |
| `QST_PHOTO_E2` | ✨ 異象 | QUEST 抽卡池之一（異象類第 2 張） | JPEG, 11,875 bytes | `quest/scenes/wonder-2.jpg` |

程式碼中這 13 張是透過 `QST_PHOTOS` 這個池物件分組管理：
```
{T:[T,T2,T3], F:[F,F2,F3], W:[W,W2,W3], H:[H,H2], E:[E,E2]}
```
抽卡時依分類從對應池中隨機取一張（`qstPickPhotoIdx`）。**遷移時建議保留這個「一個分類多張圖」的池結構**，未來新增同分類的第 4、5 張圖也能直接照命名規則延伸（`terrain-4.jpg`…）。

---

## 二、QUEST 信物照片（🎒 O 類，14 張，一物件一張圖）

| 物件 key | 卡片描述文字 | 格式/大小 | 建議 R2 路徑 |
|---|---|---|---|
| `shoes` | 一雙磨舊的皮鞋放在窗台上，一條鞋帶鬆開垂著，像剛走過很長的路 | JPEG, 25,752 bytes | `quest/objects/shoes.jpg` |
| `rope` | 一條被拉直又鬆開的繩子，蜿蜒落在木質地板上 | JPEG, 25,879 bytes | `quest/objects/rope.jpg` |
| `lantern` | 一盞鏽舊的提燈，掛在窗邊的鐵鉤上，玻璃罩裡沒有火光 | JPEG, 24,525 bytes | `quest/objects/lantern.jpg` |
| `letters` | 一疊泛黃的舊信，用麻繩綁成蝴蝶結，放在灑著光的木窗台上 | JPEG, 26,658 bytes | `quest/objects/letters.jpg` |
| `glass` | 一杯幾乎裝滿的清水，放在木桌邊角，陽光穿過杯身 | JPEG, 17,461 bytes | `quest/objects/glass.jpg` |
| `umbrella` | 一把摺疊起來、還沒撐開的傘，倚在牆邊 | JPEG, 17,777 bytes | `quest/objects/umbrella.jpg` |
| `pebble` | 一枚被磨得光滑的鵝卵石，安放在攤開的掌心裡 | JPEG, 22,770 bytes | `quest/objects/pebble.jpg` |
| `notebook` | 一本翻開的筆記本，書頁正被風掀起，攤在木桌上 | JPEG, 22,839 bytes | `quest/objects/notebook.jpg` |
| `glasses` | 一副掛在椅背上、鏡片反光看不清內側的眼鏡 | JPEG, 15,194 bytes | `quest/objects/glasses.jpg` |
| `coil` | 一條粗麻繩盤成一圈、中間打了個結，末端還沒收好，落在木地板上 | JPEG, 35,066 bytes | `quest/objects/coil.jpg` |
| `candle` | 一支蠟燭在沙地上燃著，火光還亮，蠟油順著側面流下 | JPEG, 23,214 bytes | `quest/objects/candle.jpg` |
| `hourglass` | 一個木框沙漏立在桌上，沙子正從上半緩緩落下 | JPEG, 21,962 bytes | `quest/objects/hourglass.jpg` |
| `gloves` | 一雙焦糖色皮手套，交疊擱在膝上，看不出是剛脫下還是準備戴上 | JPEG, 22,687 bytes | `quest/objects/gloves.jpg` |
| `seal` | 一個還沒被拆開的信封，封口壓著一枚火漆印章 | JPEG, 21,458 bytes | `quest/objects/seal.jpg` |

信物照片透過 `QST_OBJ_PHOTOS` 這個「物件 key → 照片」的字典管理（一對一，不像分類照片是一對多池），遷移時同樣可以直接對應成 `{shoes: "quest/objects/shoes.jpg", ...}` 這種 key→R2路徑的字典。

---

## 三、App Icon（1 張）

| 變數名稱 | 用途 | 格式/大小 | 建議 R2 路徑 |
|---|---|---|---|
| `ICON_PNG` | `/apple-touch-icon.png`、`/apple-touch-icon-precomposed.png` 兩個路由的回應內容（PWA 圖示） | PNG, 1,843 bytes | `icons/apple-touch-icon.png` |

備註：這張圖目前是**直接由 Worker 動態解碼回傳**（`atob()` 後組成 Uint8Array），不是走 `<img src="data:...">` 這種前端內嵌方式，遷移時的處理方式會跟其他 27 張不同（是換成 307/308 轉址到 R2 公開網址，或是 Worker fetch R2 物件再回傳，需要另外規劃，不在本次盤點的圖片遷移範圍內一併決定）。

---

## 四、遺漏與重複檢查結果

- ✅ **無重複**：27 張 QUEST 照片經 MD5 雜湊逐一比對，全部互不相同（先前手動核對時已擋掉幾次貼錯／重複的圖片，此次盤點確認最終結果乾淨）
- ✅ **無遺漏**：信物卡（O 類）程式碼中定義了 14 個物件，14 張照片全部對應齊全，沒有任何物件缺照片
- ℹ️ **命名不一致的小備註**：目前程式碼變數命名沒有統一規則（例如地形類用 `QST_PHOTO_T/T2/T3`，信物類用 `QST_OBJ_PHOTO_<物件名>`），這是歷史演進造成的，不影響功能；本次規劃的 R2 路徑刻意統一成語意化命名（`terrain-1.jpg` 而非沿用 `T` 這種縮寫），方便未來維護時直接看路徑就懂內容。

---

## 五、遷移時的建議處理方式（僅供 TASK 1.4 參考，本次不執行）

1. 分類場景照片（13 張）→ 上傳到 `quest/scenes/` 底下，維持池結構
2. 信物照片（14 張）→ 上傳到 `quest/objects/` 底下，一對一對應
3. App Icon（1 張）→ 上傳到 `icons/` 底下，但因為目前是動態路由回應（非前端 `<img>`），採用方式需另外評估
4. 上傳後，`QST_PHOTOS`、`QST_OBJ_PHOTOS` 這兩個字典結構**建議保留**，只需把值從 base64 字串改成 R2 路徑（或完整 URL），呼叫端（`qstArtSVG` 等函式）的介面不需要大改
