# Health Insight Data Output Boundary Definition（Phase 6 TASK1.108）

## 目的

TASK1.106定義了Health Insight的產品方向，TASK1.107定義了
Health Insight需要什麼**輸入**資料。本次任務接續往下一層
規劃：**Health Insight處理完已驗證的Intelligence
Input之後，會產出什麼**——這份文件的產出應該成為**未來
Product Output的參考基準**，本次任務**不**實作任何實際的
output schema、**不**建立UI、**不**建立API
Response Model、**不**整合任何AI。

驗證方式見`backups/phase6-task1.108-health-insight-output-boundary/
test_health_insight_output_boundary.mjs`。

### 跟TASK1.106/1.107的關係

TASK1.106第8節Output Boundary Planning已經列出四類輸出
（Health observation/Behavior pattern/Recommendation/
Progress trend）作為**初步的**輸出分類。TASK1.107定義了
輸入資料如何流向既有的Analysis/Recommendation
Capability。本次任務（TASK1.108）在這兩份文件的基礎上，
把"Analysis/Recommendation Capability產出的結果"跟"使用者
最終看到的Health Insight輸出"之間的關係講清楚，並明確劃出
"使用者看得到"跟"系統內部、使用者看不到"的邊界。

---

## 1. Output Boundary Goal

### Why Health Insight Needs an Output Boundary（為什麼Health Insight需要輸出邊界）

延續TASK1.106第1節Product Vision已確認的定位：Health
Insight**不是**AI Chat，使用者看到的是**結構化、可預期**的
呈現內容，不是自由形式的對話回應。如果沒有明確定義"哪些
資訊可以呈現給使用者、哪些必須留在系統內部"，未來落地時
很容易不小心把Capability層的內部實作細節（例如`stage`欄位、
`boundary`標籤、Execution Lifecycle狀態）洩漏給使用者，
既讓使用者困惑，也違反Phase 5系列（TASK1.102 Operational
Boundary）已經確立的Metadata
Security Boundary精神。本次任務把這條精神從"可觀測性"
延伸到"產品輸出"這個更貼近使用者的層面。

### Difference Between Raw Intelligence Result and User-Facing Product Output
（原始智慧結果跟面向使用者的產品輸出的差異）

- **Raw Intelligence Result（原始智慧結果）**：Analysis/
  Recommendation Capability既有的回傳形狀（`{ok, feature,
  data:{analysis, recommendation}}`，TASK1.79既有定義），
  包含`status`（例如`'analysis_ready'`）、`insights`/
  `recommendations`陣列、`metadata`（含`version`）等欄位——
  這是**系統內部**流通的資料形狀，設計目的是讓Phase 4/
  Phase 5各層之間可以互相理解，不是為了呈現給使用者閱讀。
- **User-Facing Product Output（面向使用者的產品輸出）**：
  Raw Intelligence Result經過Health Insight
  Feature（規劃中，未來落地）整理、篩選、可能重新措辭後，
  才會變成使用者在畫面上看到的內容——例如把`{type:
  'activity_count', value:5, source:'activityContext'}`
  這類既有insight的原始形狀，轉換成"本週記錄了5次活動"這類
  使用者看得懂的呈現方式（本次任務**不**定義具體的轉換/
  措辭邏輯，那屬於未來UI/呈現層的範疇）。
- **關鍵邊界**：Raw Intelligence Result **不會**原封不動
  呈現給使用者——這個轉換動作**歸屬Product Layer**（Health
  Insight Feature），**不歸屬**Phase 4既有的Capability層
  （Analysis/Recommendation Capability完全不知道自己的輸出
  最終會被如何呈現，也不需要知道）。

### Relationship Between Capability Output and Product Output
（Capability輸出跟Product輸出的關係）

Capability輸出是Product輸出的**唯一資料來源**，但兩者**不是
一對一**的關係——Product輸出可能只呈現Capability輸出的一
部分（隱藏內部欄位）、可能把多個insight/recommendation
整併成一個使用者看到的觀察項目、也可能完全不呈現某些
Capability輸出的欄位（例如`metadata.version`這類格式標記，
使用者不需要知道）。這個關係延續TASK1.94 Response
Contract已經確認的"Exposed
Fields/Hidden Fields"精神（`analysis`/`recommendation`
保證存在、`feature`/`capability`等內部標籤明確排除），
本次任務把這條精神從"Contract層級的欄位可見性"進一步
延伸到"Product層級的使用者體驗設計"。

---

## 2. Output Categories

### A. Health Observation（健康觀察）

**Purpose（目的）**：把已分析的資料轉換成使用者看得懂的
觀察——這是Analysis Capability既有輸出（insights陣列）
最直接的呈現形式，延續TASK1.106 Pain Point 1"不理解為什麼
體重沒有變化"的產品目標，Health Observation的存在就是要
把"發生了什麼"講清楚。

**Examples（範例，規格原文列出的四類）**：
- `behavior observation`（行為觀察）
- `nutrition observation`（營養觀察）
- `activity observation`（活動觀察）
- `lifestyle observation`（生活型態觀察）

這四類觀察分別對應TASK1.42既有Insight
Context的`behaviorContext`/`nutritionContext`/
`activityContext`跟生活型態相關欄位——延續TASK1.107第6節
Intelligence Mapping已確認的對應關係，Analysis
Capability會針對這些既有Context個別產生insight（例如既有的
`activity_count`/`nutrition_count`這類事實計數型insight）。

**What User Can See（使用者看得到什麼）**：insight的**內容**
（例如"這週記錄了幾次活動"這類事實性觀察）——延續TASK1.44/
1.87既有原則"事實計數，不是判斷"，Health Observation呈現
的是客觀事實，不包含系統對這些事實的評分或判斷。

**What Remains Internal（什麼留在系統內部）**：insight
物件裡的`source`欄位（標記這個insight來自哪個Insight
Context欄位，例如`'activityContext'`）、Analysis
Capability整體回傳的`status`欄位（例如`'analysis_ready'`）—
—這些是系統內部用來確認資料完整性/串接正確性的欄位，對
使用者的健康理解沒有直接幫助，屬於下方第3節Internal
Only的範圍。

### B. Behavior Pattern（行為模式）

**Purpose（目的）**：辨識重複出現的行為趨勢——延續
TASK1.106 Pain Point 2"無法辨識不健康的行為模式"，這類
輸出需要**跨時間**觀察多筆資料才能產生，跟Health
Observation著重"單次/單期間的事實"不同。

**Examples（範例，規格原文列出的三類）**：
- `eating pattern`（飲食模式，例如"週末飲食量明顯高於平日"）
- `activity pattern`（活動模式，例如"連續三天沒運動"）
- `sleep pattern`（睡眠模式，例如"平日睡眠時數持續不足"）

**User Value（對使用者的價值）**：讓使用者發現自己可能沒有
意識到的規律性行為——這類洞察通常比單次觀察更有行動力，
因為它指出的是"習慣性"的問題，而不是"單一事件"。

**Future Extension Possibility（未來擴充可能性）**：**明確
記錄**——Behavior Pattern**目前不屬於V1範圍**（延續
TASK1.106第4節Feature Scope的判斷：V1只使用既有Analysis
Capability既有的事實計數型insight，**沒有**任何跨時間
模式偵測的Analysis模組）。要真正產生Behavior
Pattern這類輸出，需要新增Analysis
Runner的模組（延續TASK1.43既有的
`dependencies.modules`延伸點設計），這是留給未來任務的
落地範圍，本次任務只確認"Behavior Pattern"這個輸出類別
概念上的存在跟價值，不承諾V1會實際產生這類輸出。

### C. Recommendation Output（建議輸出）

**Purpose（目的）**：提供可執行的建議——延續TASK1.106
Pain Point 4"無法把資料轉換成行動"，這是Recommendation
Capability（既有，TASK1.77）存在的核心價值。

**Examples（範例，規格原文列出的兩類）**：
- `behavior improvement suggestion`（行為改善建議）
- `habit adjustment suggestion`（習慣調整建議）

**Relationship with Recommendation Capability（跟
Recommendation Capability的關係）**：Recommendation
Output**直接對應**Recommendation Capability既有輸出
（`recommendations`陣列，TASK1.77既有定義）——延續TASK1.44/
1.87"不計算新的分數/信心值"的既有原則，Recommendation
Capability產生的既有建議形狀是`{type, value,
source}`（例如既有的`insight_count`/`analysis_status`這類
衍生自Analysis結果的建議），本次任務規劃上這些既有欄位
需要經過Health Insight Feature的呈現層轉換（例如把
`{type:'insight_count', value:6}`轉換成"根據你這週6筆
記錄，建議..."這類使用者看得懂的句子），但**本次任務不
定義**具體的轉換/措辭邏輯。

### D. Progress Trend（進度趨勢）

**Purpose（目的）**：呈現隨時間的變化——延續TASK1.107第2節
D小節Measurement Data已規劃的"weightTrend是V1需求"結論，
Progress Trend是Measurement Data的**呈現層對應**。

**Examples（範例，規格原文列出的三類）**：
- `weight trend`（體重趨勢）
- `habit progress`（習慣進度）
- `consistency trend`（一致性趨勢，例如"連續記錄天數"）

**Current V1 Boundary（V1範圍）**：只有`weight
trend`——延續TASK1.107已確認的"V1只需要weightTrend"結論，
`weight`本身已經在User Profile Data的Required
Fields裡收集，`weightTrend`只是這個既有欄位隨時間累積的
序列呈現，不需要任何新的Analysis模組或新的輸入資料。

**Future Expansion（未來擴充）**：`habit progress`（習慣
進度，需要先有Behavior Pattern這類跨時間分析能力）跟
`consistency trend`（一致性趨勢，需要記錄"使用者是否持續
使用產品"這類產品使用行為資料，跟健康資料本身是不同性質
的資料）留給未來擴充，V1不實作。

---

## 3. Product Output vs Internal Output Boundary

### User Visible（使用者看得到，Allowed，規格原文列出的四類）

- `health observation`（健康觀察，見第2節A）
- `behavior pattern`（行為模式，見第2節B，V1不產生但類別
  本身是Allowed的）
- `recommendation`（建議，見第2節C）
- `progress information`（進度資訊，見第2節D）

### Internal Only（僅限系統內部，Forbidden Exposure，
規格原文列出的五類）

- ❌ `runtime metadata`（Runtime中繼資料）：延續TASK1.102
  Operational Boundary已確立的Allowed Metadata清單
  （`phase`/`ok`/`reason`/`stage`/`version`/`durationMs`/
  `resultCounts`）——這些是給**未來監控系統**看的，不是給
  **終端使用者**看的，兩者是完全不同的觀眾，即使Operational
  Boundary本身允許記錄這些欄位，Health Insight的使用者
  介面也**不應該**呈現它們。
- ❌ `execution state`（執行狀態）：延續TASK1.101 Execution
  Boundary的五階段Lifecycle概念（`request_received`/
  `validation_completed`/`execution_started`/
  `execution_completed`/`execution_failed`）——這些是
  系統內部的執行時序標記，使用者不需要知道自己的請求"目前
  在哪個階段"。
- ❌ `capability internal structure`（Capability內部結構）：
  例如Capability Orchestrator既有回傳形狀裡的
  `capability:'orchestration'`標籤、Feature Intelligence
  Integration既有回傳形狀裡的`feature:'intelligence'`
  標籤——延續TASK1.94 Response Contract已經明確列為Hidden
  Fields的既有結論。
- ❌ `system debug information`（系統除錯資訊）：任何例外
  訊息、stack trace、內部錯誤細節——延續整個Phase 5系列
  （TASK1.100 Adapter/TASK1.101 Execution/TASK1.102
  Operational）反覆確認的"不把原始例外訊息暴露給呼叫端"
  原則，這條原則同樣適用於Product層對使用者的呈現。
- ❌ `internal processing details`（內部處理細節）：例如
  Insight Context的組裝方式、Adapter把`rawInput`轉換成
  `context`的轉換邏輯本身——使用者只需要看到分析**結果**，
  不需要知道系統是如何一步步處理的。

---

## 4. Output Responsibility Mapping

### Capability Layer（既有，完全不修改）

**產出**：`analysis result`（Analysis Capability既有輸出）、
`recommendation result`（Recommendation Capability既有
輸出）——這一層產出的是**結構化的中繼資料**，延續TASK1.44/
1.87既有原則，只做事實計數/既有資料的組合，不做任何呈現層
的轉換或措辭。

### Feature Layer（既有Feature Intelligence Integration +
未來的Health Insight Feature自己）

**轉換**：`intelligence result`——既有的Feature
Intelligence Integration（TASK1.79）把Capability
Orchestrator的Unified Result轉換成Feature
Output（`{ok, feature, data:{analysis, recommendation}}`）
，這是**通用**的轉換，不知道"Health Insight"這個具體產品
概念。未來的Health Insight Feature會在這個通用轉換之上，
做**Health Insight特定**的二次轉換（例如決定哪些insight
要呈現為Health Observation、哪些要呈現為Progress Trend）。

### Product Layer（未來的Health Insight呈現層，本次任務
不建立程式碼）

**呈現**：`user-facing output`——把Feature
Layer整理過的結果，進一步轉換成第2節定義的四類輸出
（Health Observation/Behavior Pattern/Recommendation/
Progress Trend），過濾掉第3節列出的Internal Only欄位。

### 為什麼各層擁有不同責任（總結）

```
Capability Layer：只認識"資料"，不認識"使用者"或"產品"
  ↓（產出結構化中繼資料，跨Feature/Product共用）
Feature Layer：認識"Feature"的通用形狀，不認識"Health Insight"這個具體產品
  ↓（做通用轉換，維持Phase 4/Phase 5既有的分層原則）
Product Layer：認識"Health Insight"、認識"使用者"
  ↓（做產品特定的呈現轉換，決定使用者最終看到什麼）
```

這個分層延續Phase 1~5系列反覆確認的"每一層只認識自己該
認識的概念，不越界"設計原則——Capability層如果直接輸出
"適合使用者閱讀的句子"，會讓Capability層被綁定在單一產品
的呈現需求上，未來如果Personal Intelligence
Platform（TASK1.106確認的長期方向）需要第二個、第三個
Product Feature重用同一個Capability層，這種綁定會變成
阻礙——因此呈現邏輯必須留在最外層的Product Layer。

---

## 5. Output Validation Responsibility

延續TASK1.107第4節已經確立的輸入驗證分工原則，本次任務
定義輸出這一側對稱的驗證責任：

### Contract Layer（Product Contract，TASK1.103既有）

**責任：response structure validation**——確認Adapter
回傳的Product Response整體形狀合法（`{ok:true,
result:object}`/`{ok:false, reason:string, field?,
stage?}`，延續TASK1.103既有的
`validateProductResponseShape()`實作，**含**版本相容性
檢查），**不**驗證Health Insight特定的輸出內容是否合理
（例如不會在Contract層判斷"這個Health
Observation的措辭是否恰當"）。

### Adapter Layer（Product Adapter，TASK1.100既有）

**責任：product response conversion**——把Intelligence
Feature回傳的`data`欄位轉換成Product
Response的`result`欄位（延續TASK1.100既有實作：只取出
`outcome.data`，自然過濾掉`feature:'intelligence'`
內部標籤），**不**做Health Insight特定的呈現轉換。

### Feature Layer（未來的Health Insight Feature自己）

**責任：feature output requirement**——確認Health
Insight**特定**的輸出需求被滿足（例如"Health Observation
至少要有一項，否則不算是有效的Health Insight結果"這類
判斷），這一層的驗證**歸屬Health Insight Feature自己**
（未來落地），**不歸屬**既有的Feature Intelligence
Integration（TASK1.79，它只確認通用的`{ok, feature,
data}`形狀）。

### Capability Layer（既有）

**責任：intelligence generation**——Analysis/
Recommendation Capability負責產生結構化的中繼資料本身
（既有的insights/recommendations陣列），這一層完全不知道
"輸出驗證"這個概念，只負責**產生**資料，不負責**驗證產出
是否適合呈現給使用者**。

### 分工總結

```
Analysis/Recommendation結果（Capability Layer產生）
  ↓（Feature Layer：Health Insight特定輸出需求，例如Health Observation至少一項）
  ↓（Adapter Layer：格式轉換，取出data欄位）
  ↓（Contract Layer：Product Response整體形狀+版本相容性）
使用者最終看到的Health Insight輸出
```

**本次任務不實作任何一層的驗證器**——上面的分工純粹是
規劃層級的責任歸屬確認，延續TASK1.107已建立的分工原則。

---

## 6. Intelligence Flow Mapping

### 完整映射（規格原文架構，具體展開）

```
Input Boundary（TASK1.107已定義：User Profile/Health
  Goal/Daily Behavior/Measurement四大類輸入）
  ↓
Health Insight Feature（規劃中，本次任務不建立程式碼）
  ↓
Analysis Capability（TASK1.76，既有，完全不修改）
  ↓
Recommendation Capability（TASK1.77，既有，完全不修改）
  ↓
Output Boundary（本次任務規劃的四大類輸出）
```

### Analysis跟Recommendation如何變成面向使用者的Insight

- Analysis Capability消費TASK1.107已定義的輸入資料（透過
  既有Insight Context形狀），產生結構化的insights——這些
  insights是第2節A小節Health Observation的**資料來源**，
  但insights本身（例如`{type:'activity_count', value:5,
  source:'activityContext'}`）**還不是**Health
  Observation本身，需要經過Product Layer的呈現轉換（見
  第4節Output Responsibility Mapping），才會變成使用者
  看到的"本週記錄了5次活動"這類觀察。
- Recommendation Capability消費Analysis
  Capability的輸出，產生結構化的recommendations——這些
  recommendations是第2節C小節Recommendation
  Output的**資料來源**，同樣需要經過呈現轉換才會變成使用者
  看得懂的建議句子。
- 兩者共同的資料來源鏈路（Input→Analysis→
  Recommendation→Output）完全複用Phase 4/Phase 5既有的
  Capability Chain跟五個Product
  Boundary（延續TASK1.104/1.105已經End-to-End驗證過的
  完整鏈路），本次任務**沒有**在這條既有鏈路裡新增任何
  轉換步驟，只是在鏈路**之外**（Product Layer這一端）
  規劃"最終呈現"這一層的責任歸屬。

---

## 7. Free vs Premium Output Direction

延續TASK1.106第9節/TASK1.107第8節已經規劃的商業方向，本次
任務針對**輸出內容**這個維度具體展開（規格原文明確要求
使用"Possible"字樣，表示這是**可能性**，不是承諾）：

### Free（免費層級，Possible）

- **basic health observation**（基本健康觀察）：對應第2節
  A小節Health Observation的V1範圍（既有Analysis
  Capability既有的事實計數型insight）。
- **basic recommendation**（基本建議）：對應第2節C小節
  Recommendation Output的V1範圍（既有Recommendation
  Capability既有輸出）。

### Premium（付費層級，未來規劃，Possible）

- **advanced behavior analysis**（進階行為分析）：對應
  第2節B小節Behavior Pattern（跨時間模式偵測），延續該
  小節已確認的"V1不實作，需要新增Analysis模組"結論，規劃上
  可能是Premium專屬的進階Analysis能力。
- **deeper progress interpretation**（更深入的進度解讀）：
  對應第2節D小節Progress Trend的Future Expansion（habit
  progress/consistency trend）。
- **Gemini enhanced explanation**（Gemini強化說明）：
  對應下方第8節Future Gemini Extension Boundary，規劃上
  是把既有結構化輸出轉換成更自然語言化說明的加值服務。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何會員機制**——上面的Free/Premium分類
純粹是規劃層級的商業方向，不涉及任何實際的訂閱/權限判斷
程式碼。

---

## 8. Future Gemini Extension Boundary

### Gemini角色：僅為Enhancement Layer

**明確定義（規格要求）**：Gemini（或任何未來的AI
Provider）在Health Insight輸出這一側的角色，**僅限於**
Enhancement Layer——延續TASK1.106第10節/TASK1.107第9節
已經確認的結論，本次任務把這個結論具體落在"輸出"這個
環節上重新確認。

### 未來的Flow（規劃，本次任務不建立）

```
Structured Health Insight Output（本次任務第2節定義的
  四大類結構化輸出，由既有Analysis/Recommendation
  Capability產生資料來源、Product Layer完成呈現轉換）
  ↓
【規劃中的未來銜接點】Gemini Enhancement（尚未存在，
  本次任務不建立）
  ↓
Natural Language Explanation（自然語言說明，規劃中，
  本次任務不建立）
```

### 確認：Gemini不會取代既有架構（重申）

**明確確認（規格要求）**：延續TASK1.106/1.107已經反覆
確認、本次任務重新確認依然成立的結論——Gemini**不會取代**
Analysis Capability（結構化insights依然由既有Analysis
Runner/Analysis Capability產生）、**不會取代**
Recommendation Capability（結構化recommendations依然由
既有Recommendation Runner/Recommendation
Capability產生）、**不會取代**Runtime（Phase
2既有執行邏輯完全不受影響）。Gemini處理的**永遠**是"已經
由Product Layer整理成Structured Health Insight
Output之後"的內容，不會接觸第2節列出的任何原始Capability
輸出，更不會接觸TASK1.107第2節定義的任何原始輸入資料。

---

## 9. Output Version Strategy

### Future Compatibility Rules（未來相容性規則，規格原文
列出的三項）

- **additive extension preferred（優先採用新增式擴充）**：
  未來如果Health Insight需要新增輸出類別（例如真正落地
  Behavior Pattern），規劃上應該是在既有四大類輸出之外
  **新增**一個類別，而不是修改既有類別的既有形狀——延續
  TASK1.94 Version Strategy"Contract的版本演進只能新增
  選填欄位"的既有原則，把這條原則延伸到Product輸出層級。
- **avoid breaking existing output（避免破壞既有輸出）**：
  任何未來的輸出格式調整，都不應該讓"已經在消費既有輸出
  格式的使用者介面/未來的第二個Product Feature"無法正常
  運作——延續TASK1.94 Response Contract"Contract先畫出
  未來的界線，即使現在界線內外看起來一樣"的既有設計哲學。
- **preserve existing consumers（保留既有消費者的相容性）**：
  如果未來Personal Intelligence
  Platform（TASK1.106確認的長期方向）新增第二個、第三個
  Product Feature，這些新Feature如果重用Health
  Insight既有定義的輸出類別，既有的呈現邏輯不應該因為
  新Feature的加入而被破壞。

### 明確的範圍限制（規格原文要求）

**本次任務不建立任何JSON Schema**——上面三條規則純粹是
規劃層級的相容性原則，不是任何型別定義或schema驗證規則的
具體實作，延續TASK1.94已記錄的"沒有建立任何型別定義檔案"
既有限制。

---

## Restrictions Confirmation（限制確認）

本次任務嚴格遵守規格明確列出的禁止清單：

- ❌ 沒有呼叫任何AI Provider（Gemini/Claude/OpenAI）、沒有
  建立任何Prompt Logic、沒有引入任何AI SDK。
- ❌ 沒有建立任何UI、route、controller。
- ❌ 沒有修改worker.js/routes/controllers/auth/oauth/
  session。
- ❌ 沒有修改authentication/OAuth/session相關程式碼。
- ❌ 沒有修改database schema/migrations。
- ❌ 沒有修改Analysis Runner/Recommendation Runner/Phase 2
  Runtime Orchestrator/Phase 3 Application Layer/Phase 4
  Capability Architecture。

本次任務**唯一**的產出是這份文件本身跟對應的測試套件。

---

## Completion Criteria 確認

✅ Health Insight output boundary defined——見第1節Output
Boundary Goal跟第2節Output Categories，四大類輸出（Health
Observation/Behavior Pattern/Recommendation
Output/Progress Trend）明確定義。

✅ User-visible output defined——見第3節User
Visible清單（health observation/behavior
pattern/recommendation/progress information）。

✅ Internal output separated——見第3節Internal Only清單
（runtime metadata/execution state/capability internal
structure/system debug information/internal processing
details）。

✅ Responsibility mapping defined——見第4節Output
Responsibility Mapping，Capability/Feature/Product三層
責任分工明確。

✅ Intelligence flow mapping defined——見第6節Intelligence
Flow Mapping，Input Boundary到Output Boundary的完整鏈路
明確。

✅ Future Gemini boundary defined——見第8節Future Gemini
Extension Boundary，明確確認Gemini僅為Enhancement
Layer、不取代既有架構。

✅ Version strategy defined——見第9節Output Version
Strategy，三項未來相容性規則明確。

✅ AI Provider not enabled——本次任務沒有呼叫任何AI
SDK、沒有建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次任務完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次任務完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。
