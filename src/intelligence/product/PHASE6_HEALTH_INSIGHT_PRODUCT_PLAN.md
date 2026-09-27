# Health Insight Product Definition Foundation（Phase 6 TASK1.106）

## 目的

Phase 5 Product Integration已經在TASK1.104/1.105確認完整結束
——五個Product Integration Boundary（Entry/Contract/Adapter/
Execution/Operational）全部落地、驗證、封存。TASK1.105
Phase 6 Candidate Directions記錄的五個候選方向裡，本次任務
啟動**第一個**：**Product Feature Activation**——但範圍收斂到
規格明確指定的具體產品方向：**Health Insight**。

本次任務是**產品架構規劃**任務——**不**實作任何production
功能、**不**建立UI、**不**建立route/controller、**不**整合
任何AI。目的是在動手寫任何程式碼之前，先把"這個產品要解決
什麼問題、給誰用、範圍多大、怎麼跟既有Intelligence架構對接"
講清楚。

驗證方式見`backups/phase6-task1.106-health-insight-plan/
test_health_insight_product_plan.mjs`。

### 跟Phase 5的關係

Phase 5建立的五個Boundary，全部是**規格中立**的骨架——它們
不知道自己未來會被拿來做"健康管理"還是別的產品，只知道怎麼
接收/驗證/轉換/執行/觀察一個抽象的"Product
Request"。本次任務**不修改**這五個Boundary任何一行程式碼，
只是規劃"Health Insight"這個具體的Product Feature未來要怎麼
呼叫它們（見下方第6節Intelligence Flow Mapping）。

### 產品方向（規格原文）

```
第一個產品入口：Health Weight Management Intelligence
長期方向：Personal Intelligence Platform
```

Health Weight Management Intelligence是進入點，不是終點——
長期方向是Personal Intelligence Platform，一個涵蓋飲食/行為/
情緒/健康多個面向的個人智慧平台。體重管理是**第一個**具體切入
的場景，因為它有明確可量測的目標（體重變化）跟明確可收集的
每日資料（飲食/運動/睡眠），適合驗證整條Intelligence Chain
（Analysis→Recommendation）在真實場景下是否站得住腳。

---

## 1. Product Vision

### Product Purpose（產品目的）

Health Insight的目的**不是**幫使用者做決定（那是Decision
Capability未來、也還沒落地的範疇），**也不是**取代真人教練或
醫療建議——它的目的是：**把使用者已經輸入的健康/行為資料，
轉換成使用者自己看得懂、用得上的洞察（Insight）跟建議
（Recommendation）**，讓使用者能夠自己判斷"我現在的狀況是
什麼、我可以做什麼調整"。

延續整個Phase 1~5系列反覆確認的架構邊界：Health Insight
Feature本身**不**做Scoring/Decision Algorithm/Rule
Engine——它只是Product Feature層，負責把使用者資料組裝成
`{rawInput}`丟進既有的Product Entry→Contract→Adapter→
Execution→Operational→Intelligence Feature鏈路，讀取
Analysis/Recommendation Capability既有產生的結構化結果，
原樣或輕度整理後呈現給使用者。

### Why Users Need Health Insight（為什麼使用者需要它）

一般的健康/體重管理App，通常只做兩件事：**記錄資料**（今天吃
了什麼、運動了多久）跟**顯示圖表**（體重趨勢線）。這兩件事
本身**不會**告訴使用者"為什麼"——使用者看著一條持平的體重
曲線，不知道是"熱量攝取太高"還是"活動量不足"還是"睡眠不足
影響代謝"。Health Insight存在的理由，就是在"記錄"跟"圖表"
之間，補上"**為什麼**"跟"**接下來怎麼做**"這兩層——這正是
既有Analysis Capability（產生insights）跟Recommendation
Capability（產生recommendations）已經具備、但從未真正被
Product層使用過的能力。

### Relationship Between Health Management and Personal Intelligence
（健康管理跟個人智慧平台的關係）

Health Weight Management Intelligence是Personal Intelligence
Platform**眾多可能場景中的第一個**，兩者的關係是"具體實例"
跟"長期方向"的關係，不是"部分"跟"全部"的關係——換句話說，
Health Insight不是Personal Intelligence Platform的一個
永久固定子模組，而是驗證"這一整套Intelligence
Chain（Entry→Contract→Adapter→Execution→Operational→
Feature→Capability→Runtime）是否能撐起一個真實使用者場景"的
**第一個試驗場**。如果Health Insight驗證成功，Personal
Intelligence Platform未來可能會有第二個、第三個場景（例如
情緒健康、睡眠品質），每一個都重用同一條Intelligence
Chain，只是Product Feature層各自不同。

---

## 2. Target User

### Primary User（主要使用者）

**正在嘗試自主管理體重、但缺乏專業營養/運動知識背景的一般
成年使用者**——不是專業運動員、不是需要臨床醫療介入的重症
病患，而是"知道自己想變健康、但不知道具體該怎麼調整"的日常
使用者。這群使用者通常已經在用某種方式記錄健康資料（手動
記帳、其他App、或紙本），但記錄本身沒有帶給他們任何行動上的
改變。

### User Motivation（使用者動機）

- 想知道"我現在的體重/體態變化，是不是我期望的方向"。
- 想知道"如果沒有變化，問題出在哪裡"（飲食？運動？睡眠？），
  而不是只看到一條沒有解釋的持平曲線。
- 想要**具體、可執行**的下一步建議，而不是"少吃多動"這種
  空泛到沒有行動力的建議。
- 想要**長期追蹤**——不是看一次性的分析結果，而是看隨著時間
  推移，自己的行為模式跟身體反應之間的關聯。

### User Problems（使用者的問題，延續下方第3節具體展開）

主要使用者遇到的問題可以歸納成一句話：**「有資料，沒洞察；
有洞察，沒行動」**——他們可能已經在記錄飲食/運動，但這些
資料停留在"記錄"層次，沒有被轉換成"理解"（為什麼會這樣）跟
"行動"（接下來怎麼做），這正是下方第3節User Pain
Points要具體展開的問題。

---

## 3. User Pain Points

### Pain Point 1：Cannot understand why weight does not change
（不理解為什麼體重沒有變化）

使用者持續記錄體重，看到一條持平甚至上升的曲線，但**不知道
原因**——可能是熱量攝取被低估（記錄不完整）、可能是活動量
被高估、也可能是水分/肌肉量變化掩蓋了脂肪流失，但使用者
自己無法從一堆零散的每日紀錄裡看出這些模式。

### Pain Point 2：Cannot identify unhealthy behavior patterns
（無法辨識不健康的行為模式）

單日的飲食/運動紀錄很難看出**模式**——例如"每週五晚上固定
暴飲暴食"、"連續三天沒運動之後食慾會明顯上升"，這些需要
**跨時間**觀察才會浮現的模式，使用者自己盯著每日紀錄很難
發現，需要系統幫忙從歷史資料裡萃取出結構性的觀察。

### Pain Point 3：Cannot maintain habits（無法維持習慣）

使用者知道"應該"要規律運動、規律飲食，但缺乏**持續的回饋
迴路**——沒有人在旁邊即時告訴他們"你這週的活動量比上週少了
30%"，導致習慣很容易在幾週後就中斷，而使用者自己往往要等到
體重明顯反彈才會注意到。

### Pain Point 4：Cannot translate data into actions
（無法把資料轉換成行動）

即使使用者看得懂圖表、也大致理解自己的問題，仍然常常卡在
"知道問題，不知道下一步"——例如知道自己睡眠不足，但不知道
"具體應該怎麼調整今天的行程"；知道蛋白質攝取不夠，但不知道
"具體今天晚餐應該加什麼"。這正是Recommendation
Capability（既有，Phase 4）存在的核心價值：**把Analysis
產生的觀察，轉換成結構化、可執行的建議**。

---

## 4. Feature Scope

### Version 1 Scope — Include（V1範圍：包含）

- **Basic health data**（基本健康資料）：年齡、性別、身高、
  體重、目標（增重/減重/維持）——見下方第7節Input Boundary
  Planning。
- **Daily behavior input**（每日行為輸入）：飲食、運動、
  睡眠、活動——同樣見第7節。
- **Insight generation**（洞察產生）：透過既有Analysis
  Capability（TASK1.76）產生結構化的insights（例如"活動量
  記錄筆數"、"營養攝取記錄筆數"這類既有的事實計數型insight，
  延續TASK1.44/1.87"事實計數，不是判斷"的既有設計原則）。
- **Recommendation output**（建議輸出）：透過既有
  Recommendation Capability（TASK1.77）產生結構化的
  recommendations，同樣延續既有"不計算新的分數/信心值"的
  設計原則。

### Version 1 Scope — Exclude（V1範圍：不包含）

- **AI Chat**：Health Insight**不是**聊天機器人，使用者不會
  跟系統"對話"，系統只會呈現結構化的Insight/Recommendation
  結果——這是規格明確要求的邊界（"Not: AI Chat / Generic
  chatbot / AI assistant wrapper"）。
- **Gemini integration**：V1完全不呼叫任何AI Provider（見
  下方第10節，Gemini被明確定位成**未來**的Enhancement
  Layer，不是V1範圍）。
- **Advanced decision automation**：V1不使用Decision
  Capability（TASK1.83，目前仍是`decision: null`佔位形狀），
  不做任何自動化決策（例如自動調整使用者的目標熱量），只
  呈現Analysis/Recommendation既有能提供的結構化資訊。

---

## 5. User Journey

### 範例流程（規格原文架構，具體展開）

```
使用者輸入健康資訊（Basic health data，見第7節）
  ↓
使用者輸入每日行為資料（Daily behavior input，見第7節）
  ↓
系統分析行為（透過既有Analysis Capability，TASK1.76）
  ↓
產生Health Insight（Analysis Capability既有輸出的insights，
  原樣或輕度整理後呈現）
  ↓
提供建議（透過既有Recommendation Capability，TASK1.77，
  基於Analysis的輸出產生recommendations）
  ↓
追蹤歷史（使用者可以回顧過去的Insight/Recommendation，
  觀察自己的行為模式跟身體反應隨時間的關聯——這一步**不**
  要求任何新的資料庫schema，規劃上延續使用者既有輸入資料本身
  的時間序列，not本次任務的落地範圍）
```

### 跟既有Intelligence Chain的對應（示意）

使用者的"輸入健康資訊"跟"輸入每日行為資料"兩步，最終會被
Health Insight Feature包裝成一個`rawInput`物件，透過
`entry.requestProductEntry({rawInput, userId?})`進入既有的
Phase 5鏈路（見下方第6節詳細展開）；"系統分析行為"對應
Analysis Capability；"產生Health Insight"對應Analysis
Capability的成功輸出；"提供建議"對應Recommendation
Capability；"追蹤歷史"是規劃層級的未來能力，本次任務**不**
定義它的實作方式。

---

## 6. Intelligence Flow Mapping

### Health Insight Feature → 既有Intelligence Chain（完整映射）

```
User Scenario（使用者輸入健康/行為資料）
  ↓
Health Insight Feature（規劃中，本次任務不建立程式碼）
  ↓
Product Entry（TASK1.99，既有，完全不修改）
  ↓
Product Contract（TASK1.103，既有，完全不修改）
  ↓
Product Adapter（TASK1.100，既有，完全不修改）
  ↓
Product Execution Boundary（TASK1.101，既有，完全不修改）
  ↓
Product Operational Boundary（TASK1.102，既有，完全不修改）
  ↓
Feature Intelligence Integration（TASK1.79，Phase 4，既有，
  完全不修改）
  ↓
Capability Orchestrator（TASK1.78，既有，完全不修改）
  ↓
Analysis Capability（TASK1.76）+ Recommendation
Capability（TASK1.77）
  ↓
Analysis Runner（Phase 2）+ Recommendation Runner（Phase 2）
```

### 對應到既有三個Capability

- **Analysis Capability（TASK1.76，既有）**：Health
  Insight Feature把使用者輸入的Basic health data + Daily
  behavior input，組裝成既有的Insight Context形狀
  （`activityContext`/`nutritionContext`/`emotionContext`/
  `behaviorContext`/`reportContext`/`metadata`，TASK1.42既有
  定義），交給Analysis Capability產生insights——本次任務
  **不**定義這個組裝的實際程式碼，只確認Health Insight
  Feature未來會是Analysis Capability的**呼叫端**，不是
  修改者。
- **Recommendation Capability（TASK1.77，既有）**：Analysis
  Capability的輸出，透過既有的Capability
  Orchestrator（TASK1.78）自動轉交給Recommendation
  Capability，Health Insight Feature不需要自己額外呼叫它。
- **Decision Capability（TASK1.83，既有，未來）**：目前
  Capability Orchestrator對Decision
  Capability的支援是**選填**的（TASK1.86已建立的模式），
  Health Insight V1**不**注入`decisionCapability`依賴——延續
  上方第4節Feature Scope"不使用Decision
  Capability"的範圍決定。未來如果Health Insight需要"自動
  判斷使用者屬於哪一種體重管理階段"這類決策邏輯，才會是
  Decision Capability真正派上用場的時機（但這仍然需要
  Decision Capability自己先落地實際邏輯，目前它仍是
  `decision: null`佔位形狀）。

---

## 7. Input Boundary Planning

### Basic（基本健康資料，規格原文列出的五項）

- `age`（年齡）
- `gender`（性別）
- `height`（身高）
- `weight`（體重）
- `goal`（目標，例如：減重/增重/維持）

### Daily（每日行為資料，規格原文列出的四項）

- `food`（飲食）
- `exercise`（運動）
- `sleep`（睡眠）
- `activity`（活動）

### 明確的範圍限制（規格原文要求）

**本次任務不建立任何database schema**——上面列出的九個欄位
純粹是**規劃層級的輸入分類**，用來讓未來的Health Insight
Feature知道"使用者輸入的健康/行為資料，大致會落在哪些類別
裡"，不是任何資料表的欄位定義、不是任何TypeScript/JSON
Schema型別定義。這些欄位最終如何對應到既有Insight
Context形狀（`activityContext`/`nutritionContext`/
`emotionContext`/`behaviorContext`/`reportContext`），
以及是否需要新的資料儲存方式，全部留給未來的落地任務決定。

---

## 8. Output Boundary Planning

### 使用者會看到的內容（規格原文列出的四類）

- **Health observation**（健康觀察）：對應Analysis
  Capability既有輸出的insights，例如"本週活動記錄筆數"、
  "本週飲食記錄筆數"這類既有的事實計數型觀察。
- **Behavior pattern**（行為模式）：延續第3節Pain Point
  2，未來可能是"連續N天沒運動"這類跨時間的模式觀察——本次
  任務只規劃這個輸出類別的存在，不定義具體的模式偵測邏輯
  （那會涉及新的Analysis模組，不在本次任務範圍）。
- **Recommendation**（建議）：對應Recommendation
  Capability既有輸出的recommendations。
- **Progress trend**（進度趨勢）：延續第5節User Journey"追蹤
  歷史"，使用者可以看到自己的Insight/Recommendation隨時間的
  變化趨勢——
  本次任務只規劃這個輸出類別的存在。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何output model**——上面四類輸出純粹是
**規劃層級的呈現分類**，不是任何API回傳格式的型別定義、不是
任何UI元件規格。這些輸出最終如何從Analysis/Recommendation
Capability既有的回傳形狀（`{status, insights/recommendations,
metadata}`）轉換成使用者看得懂的呈現方式，全部留給未來的
落地任務決定。

---

## 9. Premium Direction

### Free（免費層級）

- **Basic health insight**：V1範圍內的Analysis/
  Recommendation輸出（見第4節Feature Scope），完全對應
  既有Analysis+Recommendation Capability已經具備的能力，
  不需要任何額外的AI成本。

### Premium（付費層級，未來規劃）

- **Advanced intelligence**：規劃上可能是更豐富的Analysis
  模組（例如更細緻的行為模式偵測，延續Analysis Runner既有的
  `dependencies.modules`延伸點設計，TASK1.43已建立），或是
  未來Decision Capability真正落地後的自動化判斷能力。
- **Gemini enhanced insight**：規劃上是透過未來的AI
  Enhancement Layer（見下方第10節），把既有Analysis/
  Recommendation的結構化輸出，轉換成更自然、更個人化的
  文字說明——**不是**取代既有Capability的結構化輸出本身。
- **AI coaching**：規劃上是更進一步的、類似真人教練互動
  體驗的功能，但明確**不是**V1的"AI Chat"（第4節已排除），
  而是建立在Free層級既有Insight/Recommendation基礎上的
  加值服務。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何付款機制**——上面的Free/Premium分類純粹
是**規劃層級的商業方向**，不涉及任何實際的訂閱/付款程式碼、
不涉及`src/auth/`、`src/oauth/`、`src/session/`（既有身份
驗證邊界）的任何修改。

---

## 10. Future Gemini Extension

### Gemini可能的未來銜接點

延續TASK1.105 Phase 6 Candidate
Directions的Future AI Preparation方向，規劃上Gemini（或任何
未來的AI Provider）**可能**銜接的位置是：

```
Analysis Capability輸出（既有，結構化）
  ↓
Recommendation Capability輸出（既有，結構化）
  ↓
【規劃中的未來銜接點】AI Enhancement Layer（尚未存在、
  本次任務不建立）
  ↓
更自然語言化、更個人化的呈現（規劃中，本次任務不建立）
```

這個銜接點規劃上會落在**Product Feature層**（Health Insight
Feature本身，或未來為它新增的一個呈現層），**不會**插入
Phase 5既有的五個Boundary鏈路內部（Entry/Contract/Adapter/
Execution/Operational全部維持"不知道AI是什麼"的既有邊界），
也**不會**插入Phase 4既有的Capability鏈路內部。

### 確認：Gemini是Enhancement Layer，不會取代既有架構

**明確確認（規格要求）**：

- Gemini（或任何未來AI）**不會取代**Analysis
  Capability——結構化的insights依然由既有的Analysis
  Runner/Analysis Capability產生，AI只會是"把這些結構化
  insights轉換成更好讀的文字"這一層，不會自己憑空生成
  insight內容。
- Gemini**不會取代**Recommendation
  Capability——結構化的recommendations依然由既有的
  Recommendation Runner/Recommendation Capability產生，AI
  角色同上。
- Gemini**不會取代**Runtime（Phase
  2）——Analysis/Recommendation Runner的既有執行邏輯完全
  不受影響，這條規則延續整個Phase 1~5系列反覆確認的
  Runtime Isolation原則。

延續TASK1.95/1.105已經記錄的Known
Limitation：目前整條Intelligence Chain是**同步、
deterministic**的，AI Provider呼叫幾乎必然是**非同步**、
**non-deterministic**的——這個架構差異在Gemini真正落地之前
必須被重新評估（規劃上，這應該是"Phase 6.x AI Preparation"
這個未來獨立任務的範圍，不是本次任務的範圍）。

---

## Restrictions Confirmation（限制確認）

本次任務嚴格遵守規格明確列出的禁止清單：

- ❌ 沒有呼叫任何AI Provider（Gemini/Claude/OpenAI）、沒有
  建立任何Prompt Logic、沒有引入任何AI SDK。
- ❌ 沒有建立任何UI、route、controller。
- ❌ 沒有修改authentication/OAuth/session。
- ❌ 沒有修改database schema/migrations。
- ❌ 沒有修改Analysis Runner/Recommendation Runner/Phase 2
  Runtime Orchestrator/Phase 3 Application Layer/Phase 4
  Capability Architecture/Phase 5五個Product Boundary。

本次任務**唯一**的產出是這份文件本身跟對應的測試套件。

---

## Completion Criteria 確認

✅ Health Insight product direction defined——見第1節Product
Vision，明確定義Health Weight Management Intelligence作為
第一個產品入口、Personal Intelligence Platform作為長期方向。

✅ User scenario defined——見第2節Target User、第3節User Pain
Points、第5節User Journey。

✅ Feature scope defined——見第4節Feature Scope，V1
Include/Exclude清單明確。

✅ Intelligence mapping defined——見第6節Intelligence Flow
Mapping，Health Insight Feature到既有Analysis/Recommendation/
Decision三個Capability的對應關係明確。

✅ Future Gemini boundary defined——見第10節Future Gemini
Extension，明確確認Gemini是Enhancement Layer、不取代既有
Analysis/Recommendation Capability/Runtime。

✅ AI Provider not enabled——本次任務沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次任務完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次任務完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。
