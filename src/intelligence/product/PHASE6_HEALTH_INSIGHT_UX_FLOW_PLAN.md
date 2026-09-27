# Health Insight User Experience Flow Definition（Phase 6 TASK1.109）

## 目的

TASK1.106定義了Health Insight的產品方向，TASK1.107定義了
輸入邊界，TASK1.108定義了輸出邊界。本次任務接續往下一層
規劃：**使用者從進入Health Insight到獲得智慧價值之間，
具體是怎麼互動的**——這份文件的產出應該成為**未來UX落地的
參考基準**，本次任務**不**建立任何實際的UI、**不**建立
frontend元件、**不**建立route/controller、**不**整合任何
AI。

驗證方式見`backups/phase6-task1.109-health-insight-ux-flow/
test_health_insight_ux_flow.mjs`。

### 跟TASK1.106/1.107/1.108的關係

TASK1.106定義了"誰用、為什麼用、User Journey六步驟概觀"；
TASK1.107定義了"使用者要提供什麼資料"；TASK1.108定義了
"系統會產出什麼給使用者看"。這三份文件回答的是"What"（
是什麼）跟"Why"（為什麼）。本次任務（TASK1.109）回答的是
"How"（怎麼互動）——把TASK1.106第5節已經給出的六步驟User
Journey概觀，展開成更細緻的UX Flow：進入點、首次使用者
旅程、回訪使用者旅程、畫面規劃、使用者/系統責任邊界、
Insight消費循環。

---

## 1. UX Flow Goal

### Why Health Insight Needs a User Flow（為什麼Health Insight需要使用者流程）

延續TASK1.106第1節Product Vision已確認的定位：Health
Insight的核心價值是"把資料轉換成洞察"，但**價值本身不會
自動發生**——如果使用者不知道該從哪裡進入、不知道第一次
使用該做什麼、不知道回訪時該看什麼，再好的Analysis/
Recommendation Capability輸出也不會被使用者實際看到、
理解、採納。定義使用者流程的目的，就是確保"系統能產生的
智慧價值"跟"使用者實際體驗到的價值"之間沒有落差。

### Relationship Between User Behavior and Intelligence Value
（使用者行為跟智慧價值的關係）

使用者的**輸入行為**（提供健康資料、每日行為資料）跟使用者
的**消費行為**（查看Insight、閱讀建議）是一個**循環**，不是
單向的：使用者輸入資料→系統產生Insight→使用者消費
Insight→使用者根據Insight調整行為→行為調整反映在下一次
輸入的資料裡→系統產生新的Insight。這個循環正是TASK1.106
第3節Pain Point 3"無法維持習慣"要解決的核心問題——單次的
Insight很難改變行為，**持續的**輸入→產出→消費循環才有機會
建立長期的行為改變（見下方第8節Insight Consumption
Flow的完整展開）。

### Difference Between Data Input Flow and Insight Consumption Flow
（資料輸入流程跟洞察消費流程的差異）

- **Data Input Flow（資料輸入流程）**：使用者提供健康/行為
  資料給系統的過程——對應TASK1.107已定義的四大類輸入資料
  （User Profile/Health Goal/Daily Behavior/
  Measurement）。這個流程的使用者心理狀態是"記錄"，通常
  發生頻率較高（例如每天記錄飲食）、單次互動時間較短。
- **Insight Consumption Flow（洞察消費流程）**：使用者
  查看、理解、採納系統產生的Insight/Recommendation的
  過程——對應TASK1.108已定義的四大類輸出（Health
  Observation/Behavior Pattern/Recommendation/Progress
  Trend）。這個流程的使用者心理狀態是"理解跟決策"，發生
  頻率可能較低（例如每週查看一次完整報告）、單次互動時間
  可能較長（需要閱讀、思考）。
- **關鍵邊界**：這兩個流程**使用相同的底層Intelligence
  Chain**（TASK1.104/1.105已End-to-End驗證過的Entry→
  Contract→Adapter→Execution→Operational→Feature→
  Capability→Runtime），但**UX設計上必須分開規劃**——因為
  兩者的使用者心理狀態、互動節奏、畫面需求完全不同（見下方
  第5節Screen Flow Planning的畫面分工）。

---

## 2. User Entry Flow

### Possible Entry Points（可能的進入點，規格原文列出的三種）

- `Product homepage`（產品首頁）：使用者從整個產品的首頁
  導覽進入Health Insight，這是最通用的進入路徑，適合**還
  沒決定要用哪個功能**的使用者。
- `Health dashboard`（健康儀表板）：如果產品未來有一個
  綜合性的健康總覽畫面，使用者可能從這裡的某個健康指標
  卡片點擊進入Health Insight的詳細內容，這是**已經在健康
  情境裡**的使用者路徑。
- `Personal intelligence area`（個人智慧專區）：延續
  TASK1.106確認的長期方向Personal Intelligence
  Platform，如果產品未來有一個統整多個Intelligence
  Feature的專區（Health Insight只是其中之一），使用者可能
  從這裡進入，這是**已經熟悉"個人智慧"這個產品概念**的
  使用者路徑。

### User Intent（使用者意圖）

三種進入點對應的使用者意圖略有不同，但**收斂到同一個核心
意圖**：想知道"我現在的健康/體重狀況如何、接下來該做什麼"
——這正是TASK1.106第2節Target User已確認的User
Motivation。不論從哪個進入點進來，Health Insight呈現的
內容跟提供的價值應該一致，不應該因為進入點不同而有實質
內容上的差異（進入點只影響"使用者帶著什麼期待進來"，不
影響"系統提供什麼"）。

### Entry Conditions（進入條件）

規劃上，進入Health
Insight**不應該有阻擋性的前提條件**——即使使用者是**第一次
使用、完全沒有提供過任何健康資料**，也應該能夠進入
（見下方第3節First-Time User Journey，"Introduction"步驟
正是為了處理這個情境）。唯一合理的進入條件是**使用者身份
已確認**（延續TASK1.107第5節Data Privacy
Boundary已確認的"userId由呼叫端負責從既有Auth/Session機制
取得後傳入"的既有邊界，Health Insight本身不處理身份驗證）。

### Required User Context（需要的使用者情境資訊）

規劃上，進入Health Insight時，系統至少需要知道：`userId`
（用來關聯這位使用者過去是否已經提供過資料，決定要走
First-Time User Journey還是Returning User
Journey，見下方第3/4節）。**本次任務不建立任何route**——
上面列出的進入點純粹是規劃層級的入口分類，不是任何實際的
URL路徑或畫面元件定義。

---

## 3. First-Time User Journey

### 範例流程（規格原文架構，具體展開為六步驟）

```
使用者進入Health Insight
  ↓
Introduction（介紹：說明Health Insight是什麼、能提供什麼
  價值——延續第1節"確保系統能產生的智慧價值跟使用者實際
  體驗到的價值之間沒有落差"的目標）
  ↓
提供基本健康資訊（對應TASK1.107第2節A小節User Profile
  Data的Required Fields：age/gender/height/weight）
  ↓
設定健康目標（對應TASK1.107第2節B小節Health Goal
  Data：weight loss/weight maintenance/muscle
  gain/healthy lifestyle）
  ↓
提供選填的每日行為資訊（對應TASK1.107第2節C小節Daily
  Behavior Data，明確標示為選填，使用者可以跳過）
  ↓
產生第一份Insight（透過既有Intelligence Chain，
  見下方第7節Intelligence Flow Mapping）
  ↓
查看建議（對應TASK1.108第2節C小節Recommendation Output）
```

### 各步驟的User Action / System Responsibility / Expected Outcome

| 步驟 | User Action（使用者動作） | System Responsibility（系統責任） | Expected Outcome（預期結果） |
|---|---|---|---|
| Introduction | 閱讀介紹內容 | 呈現Health Insight的價值主張（延續TASK1.106第1節Product Vision） | 使用者理解"這個功能能為我做什麼" |
| 提供基本健康資訊 | 輸入age/gender/height/weight | 接收輸入（Product Layer的user input format驗證，延續TASK1.107第4節） | Required資料齊全，可以產生最小可用Health Insight |
| 設定健康目標 | 選擇一個Health Goal | 記錄使用者的目標選擇（Goal Ownership歸屬使用者，延續TASK1.107第2節B小節） | 系統知道未來Recommendation的方向性依據 |
| 提供選填每日行為資訊 | 選擇是否輸入Daily Behavior Data | 明確告知使用者這一步是選填、可以跳過 | 使用者不會因為缺少每日資料而卡在流程裡 |
| 產生第一份Insight | 等待系統處理（被動） | 呼叫既有Intelligence Chain（Entry→Contract→Adapter→Execution→Operational→Feature→Capability→Runtime） | 產出結構化的Health Observation（延續TASK1.108第2節A小節） |
| 查看建議 | 閱讀Recommendation內容 | 呈現Recommendation Output（延續TASK1.108第2節C小節） | 使用者得到至少一項可執行的建議，完成第一次完整體驗 |

---

## 4. Returning User Journey

### 範例流程（規格原文架構，具體展開為五步驟）

```
使用者回訪
  ↓
查看最新Insight（系統直接呈現，不需要重新走Introduction）
  ↓
回顧進度（對應TASK1.108第2節D小節Progress Trend）
  ↓
更新每日行為資料（延續第2節Data Input Flow的定位：高頻率、
  短時間的記錄行為）
  ↓
收到更新後的建議（系統根據新輸入的資料，重新跑一次
  Intelligence Chain）
```

### First-Time Experience跟Returning Experience的差異

| 面向 | First-Time Experience | Returning Experience |
|---|---|---|
| 起始步驟 | Introduction（說明價值主張） | 直接查看最新Insight（跳過介紹） |
| 資料輸入範圍 | 完整的User Profile + Health Goal + 選填Daily Behavior | 通常只需要更新Daily Behavior（User Profile/Goal已經存在，除非使用者主動修改） |
| Progress Trend的可用性 | 不可用（沒有歷史資料可以計算趨勢，延續TASK1.108第2節D小節"weightTrend需要時間累積"的既有限制） | 可用（累積了至少兩次以上的資料點） |
| 使用者心理狀態 | 探索、評估"這個功能值不值得用" | 習慣性使用、確認進度、尋求下一步行動 |
| 系統呈現重點 | 強調"價值主張"（這個功能能做什麼） | 強調"變化"（跟上次相比有什麼不同，延續Progress Trend） |

**關鍵設計原則**：Returning User**不應該**被要求重新走
Introduction步驟——這延續TASK1.106 Pain Point
3"無法維持習慣"的解法思路：降低回訪的互動成本，才能提高
使用者持續使用的機率。

---

## 5. Health Insight Screen Flow Planning

### A. Health Overview（健康總覽）

**Purpose（目的）**：呈現目前的健康狀態——這是使用者最
常查看的畫面（延續Returning User Journey"查看最新
Insight"步驟），內容對應TASK1.108第2節A小節Health
Observation跟第2節D小節Progress Trend的摘要版本。

### B. Data Input（資料輸入）

**Purpose（目的）**：收集必要跟選填的資訊——對應
TASK1.107定義的四大類輸入資料，這個畫面同時服務First-Time
User Journey的"提供基本健康資訊/設定健康目標/提供選填每日
行為資訊"三個步驟，跟Returning User Journey的"更新每日
行為資料"步驟。

### C. Insight Report（洞察報告）

**Purpose（目的）**：完整呈現四類輸出——

- Health observation（延續TASK1.108第2節A小節）
- Behavior pattern（延續TASK1.108第2節B小節，V1可能是空的
  或呈現"尚無足夠資料"的訊息，因為Behavior Pattern
  本身V1不實作）
- Recommendation（延續TASK1.108第2節C小節）
- Progress trend（延續TASK1.108第2節D小節）

這是**最完整**的呈現畫面，對應First-Time User
Journey的"產生第一份Insight+查看建議"兩步驟的完整版本。

### D. History / Progress（歷史/進度）

**Purpose（目的）**：呈現長期變化——延續TASK1.108第2節
D小節Progress Trend的"weight trend是V1需求"結論，這個畫面
規劃上是Progress Trend的**專屬深入呈現**（相對於Health
Overview畫面裡的摘要版本），使用者可以在這裡看到更完整的
時間序列資料。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何UI**——上面四個畫面純粹是規劃層級的
畫面分類，不是任何實際的frontend元件、不是任何HTML/CSS/
JavaScript實作。

---

## 6. User Action Boundary

### User Actions（使用者動作，規格原文列出的四項）

- `Input data`（輸入資料）：對應Data Input Flow（第1節已
  定義），使用者提供TASK1.107定義的輸入資料。
- `Update information`（更新資訊）：使用者修改先前已提供
  的資料（例如更新體重、更新健康目標）。
- `View insight`（查看洞察）：對應Insight Consumption
  Flow（第1節已定義），使用者查看TASK1.108定義的輸出內容。
- `Review recommendation`（檢視建議）：使用者閱讀
  Recommendation Output，決定是否採納。

### System Actions（系統動作，規格原文列出的四項）

- `Validate input`（驗證輸入）：延續TASK1.107第4節Input
  Validation Responsibility已定義的五層驗證分工（Product/
  Contract/Adapter/Feature/Capability）。
- `Execute intelligence flow`（執行智慧流程）：呼叫既有
  Intelligence Chain（見下方第7節）。
- `Generate output`（產生輸出）：延續TASK1.108第4節Output
  Responsibility Mapping已定義的Capability/Feature/
  Product三層責任分工。
- `Present result`（呈現結果）：對應第5節Screen Flow
  Planning定義的畫面。

### 使用者責任 vs 系統責任的分界

```
使用者負責：提供真實/完整的資料、決定是否採納建議、決定
  使用頻率
  ↕（互動邊界：Product Entry/Contract/Adapter，
    TASK1.99/1.103/1.100已建立的既有Boundary）
系統負責：驗證資料形狀、正確執行Analysis/Recommendation、
  呈現結構化結果、保護使用者隱私（延續TASK1.107第5節Data
  Privacy Boundary）
```

**關鍵原則**：系統**不負責**替使用者做決定（延續TASK1.106
第1節"不做決定"的產品定位、TASK1.107第2節B小節"Goal
Ownership歸屬使用者"的既有結論）——系統只負責把資料
"處理正確"跟"呈現清楚"，決策權始終在使用者身上。

---

## 7. Intelligence Flow Mapping

### 完整映射（規格原文架構，具體展開九層）

```
User Interaction（第2~6節定義的使用者互動：進入/輸入/
  查看/更新）
  ↓
Product Feature（Health Insight Feature，規劃中，本次
  任務不建立程式碼）
  ↓
Product Entry（TASK1.99，既有，完全不修改）
  ↓
Product Contract（TASK1.103，既有，完全不修改）
  ↓
Product Adapter（TASK1.100，既有，完全不修改）
  ↓
Product Execution Boundary（TASK1.101，既有，完全不修改）
  ↓
Health Insight Feature（規劃中的Health Insight特定邏輯，
  透過Product Operational Boundary/Feature Intelligence
  Integration既有介面呼叫下層）
  ↓
Capability Layer（Analysis+Recommendation Capability，
  TASK1.76/1.77，既有，完全不修改）
  ↓
Runtime（Analysis+Recommendation Runner，Phase 2，既有，
  完全不修改）
```

### UX在哪裡結束、Intelligence在哪裡開始

**明確的邊界（規格要求）**：UX（第2~6節定義的使用者互動跟
畫面）**在Product
Feature這一層結束**——使用者的所有互動（輸入資料、查看
畫面、點擊按鈕）最終都會被Health Insight
Feature收斂成一次`entry.requestProductEntry({userId?,
rawInput})`呼叫（延續TASK1.99既有的Entry介面）。從Product
Entry**開始**，就完全是Intelligence
Chain的範疇——這五層/三層既有Boundary（Entry/Contract/
Adapter/Execution/Operational + Capability + Runtime）
**不知道**使用者是透過哪個畫面、哪個按鈕觸發了這次呼叫，
它們只認識`rawInput`這個抽象的資料形狀（延續TASK1.99~1.104
反覆確認的"No HTTP"/"不知道UI是什麼"既有邊界）。這個邊界
確保UX層的任何調整（例如未來改版畫面配置），都不需要
影響Intelligence Chain既有的任何一行程式碼。

---

## 8. Insight Consumption Flow

### 範例流程（規格原文架構，具體展開為四步驟）

```
產生的Insight（Health Insight Feature呼叫既有Intelligence
  Chain後得到的結構化輸出，見第7節）
  ↓
觀察（Observation：使用者看到Health
  Observation/Progress Trend等結構化事實，對應TASK1.108
  第2節A/D小節）
  ↓
理解（Understanding：使用者消化這些觀察，形成對自己健康
  狀況的認知——這一步發生在使用者的認知過程裡，系統只能
  透過清楚的呈現方式來輔助，不能替使用者完成理解）
  ↓
建議（Recommendation：使用者看到Recommendation
  Output，對應TASK1.108第2節C小節，得到具體的下一步行動
  方向）
  ↓
行動（Action：使用者根據建議調整自己的實際行為——例如
  調整飲食、增加運動——這一步完全發生在系統之外，屬於
  使用者的真實生活）
```

### 這如何形成行為改善循環（Behavior Improvement Loop）

```
行動（使用者調整行為）
  ↓
新的每日行為資料（使用者在下一次Data Input Flow裡記錄
  調整後的行為，延續第1節"使用者行為跟智慧價值的關係"）
  ↓
新的Analysis結果（反映行為調整後的變化）
  ↓
新的Insight（可能顯示"進步"或"需要進一步調整"）
  ↓
（回到）觀察 → 理解 → 建議 → 行動……
```

**核心價值主張**：這個循環正是TASK1.106第1節Product
Vision"把資料轉換成使用者自己看得懂、用得上的洞察跟建議"
的具體實現方式——單次的Insight只能提供"快照式"的價值，
**持續的**循環才能真正幫助使用者建立長期的健康行為改變，
延續TASK1.106 Pain Point 3"無法維持習慣"要解決的核心問題。

---

## 9. Free vs Premium UX Direction

延續TASK1.106第9節/TASK1.107第8節/TASK1.108第7節已經規劃
的商業方向，本次任務針對**UX體驗**這個維度具體展開（規格
原文明確要求使用"Possible"字樣，表示這是**可能性**，不是
承諾）：

### Free（免費層級，Possible）

- **Basic health input**（基本健康輸入）：對應第5節B畫面
  Data Input的V1範圍（TASK1.107定義的Required/Optional
  欄位）。
- **Basic insight report**（基本洞察報告）：對應第5節
  C畫面Insight Report的V1範圍（TASK1.108定義的Health
  Observation/Recommendation）。

### Premium（付費層級，未來規劃，Possible）

- **Advanced insights**（進階洞察）：對應TASK1.108第7節
  Premium Direction的"advanced behavior analysis"，UX上
  可能是第5節C畫面的加值內容區塊。
- **Long-term trend analysis**（長期趨勢分析）：對應第5節
  D畫面History/Progress的加值版本（延續TASK1.108"deeper
  progress interpretation"）。
- **Gemini enhanced explanation**（Gemini強化說明）：對應
  下方第10節Future Gemini UX Boundary，UX上可能是在既有
  結構化呈現旁邊，額外提供一段自然語言化的說明文字。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何會員機制**——上面的Free/Premium分類
純粹是規劃層級的UX方向，不涉及任何實際的訂閱/權限判斷
程式碼。

---

## 10. Future Gemini UX Boundary

### 未來的Flow（規劃，本次任務不建立）

```
Health Insight Result（第5節C畫面Insight Report既有呈現的
  結構化內容，來源是TASK1.108已定義的四大類輸出）
  ↓
【規劃中的未來銜接點】Gemini Enhancement（尚未存在，本次
  任務不建立）
  ↓
Conversational Explanation（對話式說明，規劃中，本次任務
  不建立——**注意**：這裡的"conversational"指的是**說明
  的語氣風格**更自然、更口語化，**不是**TASK1.106第1節
  已經明確排除的"AI Chat"互動模式，使用者依然是查看結構化
  畫面，不是跟系統對話）
```

### 確認：Gemini互動不會取代既有架構

**明確確認（規格要求）**：延續TASK1.106/1.107/1.108已經
反覆確認、本次任務重新確認依然成立的結論——Gemini互動
**不會取代**Product Flow（第2~6節定義的User Entry/
First-Time Journey/Returning Journey/Screen
Flow/User Action Boundary本身完全不受影響，即使Premium
使用者未來啟用Gemini強化說明，走的依然是同一套UX
Flow）、**不會取代**Capability
Layer（Analysis/Recommendation Capability既有結構化輸出
依然是Gemini Enhancement的**輸入**，不是被取代的對象）、
**不會取代**Runtime（Phase 2既有執行邏輯完全不受影響）。

---

## 11. UX Error Handling Direction

### User-Facing Error Categories（使用者可見的錯誤分類，
規格原文列出的四種）

- **Missing input**（缺少輸入）：使用者沒有提供Required
  資料（延續TASK1.107第3節Required定義的age/gender/
  height/weight），對應既有Product Entry/Contract層
  既有的`invalid_raw_input`/`invalid_request`這類驗證
  失敗（TASK1.99/1.103既有實作）。
- **Invalid data**（無效資料）：使用者提供的資料格式不
  合法（例如年齡輸入負數），對應第1節Product Layer的
  "user input format"驗證職責（延續TASK1.107第4節）。
- **Intelligence unavailable**（智慧功能無法使用）：既有
  Intelligence Chain某一層依賴缺失（例如既有Adapter層的
  `intelligence_feature_unavailable`，TASK1.100既有
  reason），這種情況下使用者應該看到"服務暫時無法使用"這類
  訊息，而不是技術性的錯誤代碼。
- **Temporary system failure**（暫時性系統故障）：對應
  既有Execution Boundary的`runtime_failure`分類
  （TASK1.101既有），底層Capability/Runtime拋出未預期
  例外時，使用者應該看到"請稍後再試"這類訊息。

### User Message跟Internal Error Detail的分離

**明確的分離原則（規格要求）**：延續整個Phase 5系列
（TASK1.100 Adapter/TASK1.101 Execution/TASK1.102
Operational）反覆確認的"不把原始例外訊息暴露給呼叫端"
既有原則，本次任務把這條原則延伸到UX層——

- **User Message（使用者訊息）**：簡短、非技術性、
  可行動的訊息（例如"請填寫您的體重"、"服務暫時無法使用，
  請稍後再試"）——對應上面四種錯誤分類，每一種都應該有
  對應的、使用者看得懂的訊息版本。
- **Internal Error Detail（內部錯誤細節）**：既有
  Boundary回傳的`reason`/`field`/`stage`/`category`等
  技術性欄位（例如`invalid_raw_input`、`stage:'runtime'`）
  ——這些欄位**不應該**直接顯示給使用者，只能用來**對應**
  到上面定義的User Message分類，或用於未來的內部監控
  （延續TASK1.102 Operational Boundary的Metadata Security
  Boundary精神）。

**本次任務不實作任何錯誤UI**——上面的分類跟分離原則純粹是
規劃層級的錯誤處理方向，不是任何實際的錯誤畫面/元件實作。

---

## 12. Future UX Extension

以下功能**規劃上**是未來可能的UX擴充方向，本次任務**只
記錄可能性、不實作**：

- **Daily health coach**（每日健康教練）：規劃上可能是
  每天主動提供一則簡短建議的功能，比第5節C畫面的完整
  Insight Report更輕量、更高頻率。
- **Habit reminder**（習慣提醒）：規劃上可能是根據
  TASK1.108第2節B小節Behavior Pattern（跨時間模式偵測，
  V1不實作）未來落地後，主動提醒使用者"已經連續N天沒有
  記錄/運動"這類提醒機制。
- **Trend dashboard**（趨勢儀表板）：規劃上是第5節D畫面
  History/Progress的加強版，可能整合多種指標的視覺化
  呈現。
- **Wearable integration**（穿戴裝置整合）：對應
  TASK1.107第7節Future Extension Boundary已經記錄的
  wearable devices方向，UX上可能是自動同步資料、減少
  使用者手動輸入的負擔。

---

## Restrictions Confirmation（限制確認）

本次任務嚴格遵守規格明確列出的禁止清單：

- ❌ 沒有實作任何UI、frontend元件、CSS。
- ❌ 沒有建立任何route、controller、API endpoint。
- ❌ 沒有修改authentication/OAuth/session相關程式碼。
- ❌ 沒有修改database schema/migrations。
- ❌ 沒有呼叫任何AI Provider（Gemini/Claude/OpenAI）、沒有
  建立任何Prompt Logic、沒有引入任何AI SDK。
- ❌ 沒有修改worker.js/routes/controllers/auth/oauth/
  session。
- ❌ 沒有修改Analysis Runner/Recommendation Runner/Phase 2
  Runtime Orchestrator/Phase 3 Application Layer/Phase 4
  Capability Architecture。

本次任務**唯一**的產出是這份文件本身跟對應的測試套件。

---

## Completion Criteria 確認

✅ Health Insight UX flow defined——見第1節UX Flow
Goal，明確定義UX流程存在的理由跟Data Input Flow/Insight
Consumption Flow的差異。

✅ Entry journey defined——見第2節User Entry
Flow，三種進入點、使用者意圖、進入條件、需要的情境資訊
明確。

✅ First-time and returning user flow defined——見第3節
First-Time User Journey跟第4節Returning User
Journey，含完整的差異對照表格。

✅ Screen flow planned——見第5節Health Insight Screen Flow
Planning，四個畫面（Health Overview/Data Input/Insight
Report/History Progress）的目的明確。

✅ User/system responsibility separated——見第6節User
Action Boundary，使用者動作跟系統動作明確分離。

✅ Intelligence boundary preserved——見第7節Intelligence
Flow Mapping，明確UX在Product Feature層結束、Intelligence
從Product Entry開始。

✅ Future Gemini UX boundary defined——見第10節Future
Gemini UX Boundary，明確確認Gemini互動不取代Product
Flow/Capability Layer/Runtime。

✅ AI Provider not enabled——本次任務沒有呼叫任何AI
SDK、沒有建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次任務完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次任務完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。
