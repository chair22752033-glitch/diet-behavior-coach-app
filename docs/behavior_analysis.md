# 飲食行為拆解 — 資料架構與分析邏輯

本文件記錄「飲食行為拆解」(Behavior Analysis, 程式內代號 `BA`) 模組的資料架構、分類邏輯、判斷規則、結果模板與 UI 流程，對應 App 需求文件的第七項。

核心定位：**不是熱量計算 / 食物推薦 / 飲食紀錄工具，而是「透過吃下去的結果，反向分析造成這個選擇的原因」。**
理念：吃下去的是結果，真正要理解的是吃之前發生了什麼。

實作位置：`src/worker.js` 的 `getHTML()` script 內，`BA*` 系列變數與 `renderBA()` 流程機。資料存於 `localStorage` 的 `diet_app_v1.ba.entries`，並隨既有雲端同步機制上傳。

---

## 1. 使用者輸入資料欄位

一次拆解 (`BA` 物件 / 一筆 `ba.entries`) 的欄位：

| 欄位 | 意義 | 型別 | 可能值 |
|---|---|---|---|
| `ts` | 時間戳 | number | `Date.now()` |
| `food` | 今天吃了什麼 | string | 自由輸入 |
| `cat` | 飲食種類 | string | 正餐 / 輕食 / 點心甜點 / 飲料 / 宵夜 / 水果 / 速食炸物 / 其他 |
| `time` | 用餐時間 | string | 早餐 / 午餐 / 下午 / 晚餐 / 宵夜 / 兩餐間 |
| `situ` | 用餐情境 | enum | alone / coworker / family / friends / social / work / commute |
| `why` | 為什麼選這餐（驅動因素） | enum | hungry / tired / stress / busy / friends / habit / sudden |
| `mood` | 吃之前的心理狀態 | enum | calm / tired / stress / happy / bored / anxious / reward |
| `process` | 決策過程 | enum | decided / changed / healthy / convenient |
| `type` | 分析判定的飲食型態 | enum | emo / comp / eff / soc / hab / phys |
| `redo` | 如果重新選一次 | enum | yes / unsure / no |

前四欄 (`food/cat/time/situ`) 保留原本「飲食輸入」精神；`why/mood/process` 是新增的「決策分析層」。

---

## 2. 飲食行為分類邏輯（6 種型態）

`type` 由 `baClassify(BA)` 計算，六型：

| key | 名稱 | 特徵 |
|---|---|---|
| `emo` | 情緒型飲食 | 透過食物調節情緒 |
| `comp` | 補償型飲食 | 辛苦一天後用食物獎勵自己 |
| `eff` | 效率型飲食 | 時間不足，優先快速完成 |
| `soc` | 社交型飲食 | 重點是關係與場合，不是食物 |
| `hab` | 習慣型飲食 | 固定時間、情境的固定選擇 |
| `phys` | 生理需求型飲食 | 真正因飢餓、能量不足而進食 |

---

## 3. 判斷規則（加權計分）

對六型各累加分數，取最高分（同分依 `emo→comp→eff→soc→hab→phys` 優先；全 0 則歸 `phys`）。

**為什麼選這餐 (`why`)**
- hungry → phys +3
- tired → eff +2, comp +1
- stress → emo +3, comp +1
- busy → eff +3
- friends → soc +3
- habit → hab +3
- sudden → emo +2, phys +1

**吃之前心理狀態 (`mood`)**
- calm → phys +2
- tired → eff +1, comp +1
- stress → emo +2, comp +1
- happy → soc +1, phys +1
- bored → emo +2
- anxious → emo +3
- reward → comp +3

**決策過程 (`process`)**
- decided → hab +2, phys +1
- changed → emo +1
- healthy（原本想健康卻沒做到）→ eff +2（視為環境/便利性覆蓋）
- convenient → eff +3

**用餐情境 (`situ`)**
- coworker / friends / family / social → soc +2
- work（邊工作邊吃）→ eff +2

### 吃・動・睡・壓・人 反向主因 (`baFactor`)
依 `why` / `mood` / `time` / `situ` 判定「今天影響飲食最大的因素」，優先序：
1. 壓力：mood=stress/anxious 或 why=stress
2. 疲累/睡眠：why=tired 或 mood=tired 或 time=宵夜
3. 關係與場合：why=friends 或 situ∈{coworker,friends,family,social}
4. 時間壓力：why=busy 或 process=convenient
5. 生理需求：type=phys
6. 習慣與情境：其餘

`baReverse` 依上述條件，動態產出吃/動/睡/壓/人的反向連結列（每列可點進對應系統，與全站互通機制共用 `scenGoLink`）。

---

## 4. 分析結果模板

1. **餐點標籤**：`🍽️ {food} · {情境}`
2. **飲食型態卡**：icon + 名稱 + 特徵 + 非批判說明 (`BA_TYPES`)
3. **反向主因標題**：例如「今天影響你飲食最大的因素，可能是壓力，而不是食物本身。你不是控制力不足，而是在高壓狀態下尋找快速恢復的方式。」
4. **吃動睡壓人反向連結**：條件式列出相關維度 + 一句說明 + 可點進系統
5. **如果重新選一次**：會 / 不確定 / 不會 → 三種方向 (`baRedoDir`)
6. **換個角度看（不給限制）**：「今天不是『{food}』造成問題。真正的關鍵是——{主因}。下一次可以優化的是決策點，而不是禁止某種食物。」
7. **下一次可優化的決策點**：依型態給 2–3 條正向、具體建議 (`BA_OPT`)，例如提前準備替代方案、增加蛋白質、調整下午能量補充

輸出刻意**避免**「不可以吃炸物 / 少吃碳水」這類限制語言。

---

## 5. UI 流程修改建議（已實作）

- 保留既有 UI/UX 架構與設計風格；新增獨立畫面 `#sba`（沿用 `idq-hdr`/`idq-body` 版型）與首頁入口卡 `#bacard`。
- 流程機 `renderBA()`：`intro → input(1/5) → why(2/5) → mood(3/5) → process(4/5) → result(5/5) → final`。
- 輸入完成後**不直接給健康建議**，而是進入決策拆解與型態分析。
- 支援右滑返回堆疊（與情境/系統互通），結果頁每個反向連結都能深入對應系統再原路返回。
- 結果寫入 `localStorage.diet_app_v1.ba.entries`（保留最近 60 筆），供後續趨勢分析擴充。

> 免責：本模組為飲食行為衛教與自我覺察工具，不能取代醫師或營養師。有任何症狀請優先諮詢專業。
