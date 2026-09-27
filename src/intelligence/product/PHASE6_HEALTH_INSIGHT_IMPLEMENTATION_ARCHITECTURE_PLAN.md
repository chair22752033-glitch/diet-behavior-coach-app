# Health Insight Product Implementation Architecture Planning（Phase 6 TASK1.110）

## 目的

TASK1.106定義了Health Insight的產品方向，TASK1.107定義了
輸入邊界，TASK1.108定義了輸出邊界，TASK1.109定義了UX
流程。本次任務是**實作架構規劃**任務——把前四份文件累積的
產品定義，轉換成**落地前的實作藍圖**：哪些既有架構要重用、
哪些新元件需要建立、資料怎麼流動、跟UI/Route/會員/Gemini
的銜接點在哪裡、實作順序跟風險評估。本次任務**不**實作任何
production功能、**不**建立UI、**不**建立route/controller、
**不**建立database schema、**不**整合任何AI。

驗證方式見`backups/phase6-task1.110-health-insight-implementation-plan/
test_health_insight_implementation_architecture.mjs`。

### 跟TASK1.106~1.109的關係

TASK1.106~1.109回答的是"這個產品**是什麼**、需要**什麼**
資料、產出**什麼**、使用者**怎麼**互動"。本次任務
（TASK1.110）回答的是**"怎麼把這些定義變成程式碼"**——這是
Product Activation Stage從**規劃**過渡到**實作**之前的
最後一份規劃文件，延續TASK1.98（Phase 5
Implementation Readiness Plan）在Phase 5系列扮演過的同樣
角色：TASK1.98把Phase 5規劃（TASK1.90~1.97）轉換成落地
藍圖，本次任務把Phase 6規劃（TASK1.106~1.109）轉換成
落地藍圖。

---

## 1. Implementation Architecture Goal

### Why Implementation Planning Is Required（為什麼需要實作規劃）

TASK1.106~1.109累積的是**產品層級**的規劃（誰用、要什麼
資料、產出什麼、怎麼互動），但**沒有**回答"這些規劃要對應
到哪些具體的程式碼檔案、呼叫哪些既有函式、新增哪些新
函式"。如果沒有這一層實作規劃，直接跳進去寫程式碼，很
容易出現兩種問題：(1) 不小心重新實作了Phase 4/Phase
5已經存在的能力（例如重新寫一個資料驗證邏輯，而不是重用
既有Product Contract）；(2) 不小心破壞了Phase 1~5系列
反覆確認的既有邊界（例如讓Health Insight Feature直接
呼叫Capability Orchestrator，跳過既有的Product Adapter/
Execution/Operational Boundary）。

### Relationship Between Product Definition and Technical Implementation
（產品定義跟技術實作的關係）

產品定義（TASK1.106~1.109）是**需求**，技術實作是**如何
滿足這個需求**——兩者的關係類似"合約"跟"履行合約的方式"：
TASK1.108定義的"Health Insight要產出四類輸出"是合約，
本次任務規劃"這四類輸出要透過呼叫哪個既有Capability產生"
是履行合約的具體方式。**產品定義不應該因為實作規劃而
改變**（例如本次任務不會重新定義Health Insight要收集
哪些欄位，那已經是TASK1.107的既定結論），本次任務只回答
"用既有架構的哪些部分，去實現TASK1.106~1.109已經定義好的
需求"。

### Principles for Implementing Health Insight Without Breaking Existing Architecture
（在不破壞既有架構的前提下實作Health Insight的原則）

延續Phase 1~5系列反覆確認的既有原則，本次任務重申三條
對Health Insight實作最關鍵的原則：

1. **最大化重用，最小化新增**——延續TASK1.98已經確立的
   "建立但不接線"漸進模式，Health Insight應該**盡可能**
   重用既有的五個Product Boundary跟兩個既有Capability，
   只在**真正沒有既有能力覆蓋**的地方（例如"Health
   Insight特定"的輸出呈現轉換）新增程式碼。
2. **只認識下一層，不跳層呼叫**——延續TASK1.90~1.105
   反覆確認的分層原則，Health Insight Feature只能呼叫
   Product Adapter（或延續TASK1.100~1.103已建立的透明
   代理鏈，呼叫任何一層都可以，但不能繞過中間層直接呼叫
   Capability Orchestrator或Runtime）。
3. **新增優先於修改**——延續TASK1.95/1.104已確立的"新增
   的程式碼天然具有回滾優勢"原則，本次任務規劃的所有新
   元件都應該是**新增檔案**，不修改任何既有Phase 1~5
   檔案。

---

## 2. Existing Architecture Reuse Analysis

### Product Layer（Phase 5，TASK1.99~1.103，既有）

- **Product Entry**（TASK1.99）：**完全重用**，不需要
  任何修改——Health Insight Feature未來會呼叫
  `entry.requestProductEntry({userId?, rawInput,
  options?})`，這個介面已經是通用的，不需要針對Health
  Insight客製化。
- **Product Contract**（TASK1.103）：**完全重用**——
  Contract的Request/Response形狀驗證已經是通用的，Health
  Insight不需要新增自己的Contract層。
- **Product Adapter**（TASK1.100）：**完全重用**——
  Adapter把`rawInput`轉換成`{context, options?}`的既有
  邏輯已經是通用的（直接把`rawInput`當作`context`）。
- **Product Execution**（TASK1.101）：**完全重用**——
  五階段Execution Lifecycle跟三種失敗分類已經是通用的。
- **Product Operational**（TASK1.102）：**完全重用**——
  透明代理設計跟Metadata Security Boundary已經是通用的。

### Application/Feature Layer

- **Health Insight Feature（未來）**：**需要新實作**——
  這是本次任務規劃的**核心新元件**（見下方第4節），負責
  把TASK1.107/1.108定義的Health Insight特定輸入/輸出
  邏輯，跟既有通用的Feature Intelligence Integration
  （TASK1.79）銜接起來。
- **Existing Feature Pattern（既有Feature模式）**：
  **參考重用，不直接呼叫**——既有的Insight
  Feature（TASK1.66）/Behavior
  Feature（TASK1.72）走的是完全不同的Application
  Pattern（Feature→Workflow→UseCase→ApplicationService→
  Runtime），Health Insight Feature**不會**重用這條
  鏈路本身，而是重用Feature Intelligence
  Integration（TASK1.79）這條**平行**存在的Capability
  鏈路——這延續TASK1.79既有文件已經確認的"兩條路徑刻意
  平行、互不交叉"設計。

### Capability Layer（Phase 4，既有）

- **Analysis Capability**（TASK1.76）：**完全重用**——
  Health Insight Feature透過既有Feature Intelligence
  Integration/Capability Orchestrator間接呼叫，不直接
  呼叫。
- **Recommendation Capability**（TASK1.77）：**完全
  重用**，同上。
- **Decision Capability（未來）**（TASK1.83）：**保留
  選填銜接點，V1不使用**——延續TASK1.86已建立的選填
  依賴注入模式，Capability Orchestrator已經支援選填的
  `decisionCapability`，Health Insight V1不注入這個
  依賴（延續TASK1.106第4節Feature Scope的Exclude
  範圍）。

### Runtime Layer（Phase 2，既有）

- **既有Runtime（Analysis Runner/Recommendation
  Runner）**：**完全重用，完全不修改**——Health Insight
  透過完整的既有鏈路間接使用，不直接接觸。

### 重用分析總結表格

| 層級 | 元件 | 重用狀態 |
|---|---|---|
| Product | Entry/Contract/Adapter/Execution/Operational | 完全重用 |
| Feature | Health Insight Feature | 需要新實作 |
| Feature | Existing Feature Pattern（Insight/Behavior） | 不重用（平行路徑） |
| Feature | Feature Intelligence Integration | 完全重用 |
| Capability | Analysis/Recommendation Capability | 完全重用 |
| Capability | Decision Capability | 保留選填銜接點，V1不使用 |
| Runtime | Analysis/Recommendation Runner | 完全重用，完全不修改 |

---

## 3. Health Insight Implementation Flow

### 未來執行流程（規格原文架構，具體展開九層）

```
User（使用者，透過未來的UI互動，見第7節）
  ↓
Product Feature Entry（Health Insight Feature，規劃中的
  新元件，見第4節）
  ↓
Product Contract（TASK1.103，既有，完全重用）
  ↓
Product Adapter（TASK1.100，既有，完全重用）
  ↓
Product Execution Boundary（TASK1.101，既有，完全重用）
  ↓
Health Insight Feature（規劃中，這裡指Feature Intelligence
  Integration既有介面 + Health Insight特定的呼叫組裝邏輯）
  ↓
Analysis Capability（TASK1.76，既有，完全重用）
  ↓
Recommendation Capability（TASK1.77，既有，完全重用）
  ↓
Product Output（對應TASK1.108定義的四類輸出，透過既有
  Adapter/Entry回傳鏈路往上傳遞）
```

### 各層責任（延續TASK1.109第7節Intelligence Flow Mapping已確認的分工，本次任務聚焦在"實作"角度重新確認）

- **Product Feature Entry（Health Insight Feature）**：
  把使用者互動（第7節/TASK1.109已規劃）收斂成一次
  `rawInput`物件，呼叫`entry.requestProductEntry()`。
- **Product Contract/Adapter/Execution/Operational**：
  原樣執行既有的驗證/轉換/生命週期管理/觀察職責，**不需要
  任何Health Insight特定的修改**（這是TASK1.99~1.103
  刻意設計的"透明代理"精神帶來的好處——通用邊界層完全不
  需要知道"Health Insight"這個具體產品概念）。
- **Analysis/Recommendation Capability**：產生結構化的
  insights/recommendations，完全不知道呼叫端是Health
  Insight。
- **Product Output**：Health Insight Feature（或未來的
  呈現層）把Capability鏈路回傳的結構化結果，轉換成
  TASK1.108定義的四類使用者可見輸出。

---

## 4. New Component Boundary Planning

### Product（規格原文：Possible）

**可能的新元件：Health Insight Product Feature**——這是
規劃上**最上層**的新元件，負責組裝TASK1.99~1.103既有的
五個Product Boundary（例如`createProductEntry({adapter:
createProductContract({adapter:
createProductAdapter({...})})})`這類手動組裝邏輯，延續
TASK1.104/1.105已經在測試程式碼裡驗證過的組裝方式），
並提供Health Insight特定的輸入組裝（TASK1.107）跟輸出
呈現（TASK1.108）邏輯。

**為什麼歸屬Product層**：這個元件的職責是"把使用者的
Health Insight互動，轉換成既有Intelligence Chain認識的
`rawInput`格式，並把Chain回傳的結果轉換成使用者看得懂的
呈現內容"——這正是Product層（相對於Feature/Capability/
Runtime層）在整個Phase 1~5系列裡的既定定位。

### Feature（規格原文：Possible）

**可能的新元件：`health_insight_feature`**——規劃上是
Health Insight Product Feature內部呼叫Feature
Intelligence Integration（TASK1.79）時，用來組裝Insight
Context的Health Insight特定邏輯（把TASK1.107定義的
User Profile/Health Goal/Daily Behavior/Measurement
四大類輸入資料，轉換成既有Insight Context的
`activityContext`/`nutritionContext`/`emotionContext`/
`behaviorContext`/`reportContext`/`metadata`欄位）。

**為什麼歸屬Feature層**：這個轉換邏輯**知道**"Health
Insight"這個具體產品概念（知道要收集哪些欄位、要對應到
哪些既有Context欄位），但**不知道**HTTP/UI是什麼
（那是Product層的職責）、**不**直接接觸Capability
Orchestrator的內部實作（那要透過既有Feature Intelligence
Integration介面）——這個"知道產品概念、不知道呈現方式、
不繞過下一層"的定位，正是Feature層的既定角色。

### Capability（規格原文：Reuse）

**重用Analysis Capability + Recommendation
Capability**——**不新增**任何Capability層元件，延續第2節
已確認的"完全重用"結論。

### 明確的範圍限制（規格原文要求）

**本次任務不實作**上面列出的任何元件——這些是規劃層級的
"未來可能新增什麼"分類，不是任何實際的程式碼檔案。

---

## 5. Existing Component Protection Boundary

### 確認不得修改的元件（規格原文列出的六項）

- ❌ **Analysis Runner**（Phase 2，TASK1.43）
- ❌ **Recommendation Runner**（Phase 2，TASK1.44）
- ❌ **Phase 2 Runtime Orchestrator**（TASK1.45）
- ❌ **Phase 3 Application Pattern**（TASK1.59~1.74整條
  Application Layer）
- ❌ **既有Insight Feature**（TASK1.66）
- ❌ **既有Behavior Feature**（TASK1.72）

### 為什麼保護這些元件（規格要求解釋理由）

- **Analysis/Recommendation Runner**：這是整個Phase
  1~5系列（含TASK1.104/1.105的End-to-End驗證）反覆確認
  過完全正確運作的核心邏輯，Health
  Insight只需要**呼叫**它們產生的結構化結果，沒有任何理由
  需要修改其內部實作——修改它們會影響**所有**依賴這條
  鏈路的既有跟未來功能（延續TASK1.106確認的長期方向
  Personal Intelligence Platform，未來可能有多個Product
  Feature重用同一條Capability Chain）。
- **Phase 2 Runtime Orchestrator**：協調的是Runtime層
  既有的四個服務模組，Health Insight透過Phase 4/Phase
  5既有鏈路間接使用，完全不需要接觸這一層。
- **Phase 3 Application Pattern**：這是既有Insight/
  Behavior Feature使用的**另一條**Application
  Pattern（Feature→Workflow→UseCase→ApplicationService→
  Runtime），跟Health Insight要重用的Feature Intelligence
  Integration路徑（TASK1.79建立的**平行**路徑）完全
  不同——延續TASK1.79已經確認的"兩條路徑刻意平行、互不
  交叉"設計，修改Phase 3 Application Pattern**不會**
  幫助Health Insight的實作，反而會冒著破壞既有Insight/
  Behavior Feature的風險。
- **既有Insight Feature/Behavior Feature**：這兩個既有
  Feature服務的是**既有**的產品功能（跟Health Insight是
  不同的使用情境），修改它們沒有任何必要性，且會直接違反
  Phase 1~5系列反覆確認的"新增優先於修改"原則。

---

## 6. Data Flow Implementation Planning

### 完整映射（規格原文架構，具體展開五階段）

```
Input（TASK1.107定義的四大類輸入資料）
  ↓
Validation（見下方"Where validation happens"）
  ↓
Transformation（見下方"Where transformation happens"）
  ↓
Capability Execution（既有Analysis/Recommendation
  Capability，完全重用）
  ↓
Output Mapping（見下方"Where output formatting happens"）
```

### Where Validation Happens（驗證發生在哪裡）

延續TASK1.107第4節Input Validation
Responsibility已確立的五層分工，本次任務重新確認：
**Product Layer**（Health Insight Feature未來落地時）
負責"user input format"這一層最外圍的驗證；**Contract
Layer**（TASK1.103既有）負責Product Request整體形狀；
**Feature Layer**（Health Insight Feature自己）負責
"Health Insight特定的必要欄位是否齊全"（例如weight
是否存在）；**Capability Layer**（既有）負責Insight
Context形狀本身——**沒有一層是新增的驗證邏輯**，全部延續
既有分工，Health Insight Feature只需要補上"Health Insight
特定"這一小段。

### Where Transformation Happens（轉換發生在哪裡）

延續TASK1.107第1節已確立的"Raw Data → Intelligence
Input轉換歸屬Product Feature層"結論：**Health Insight
Feature**（新元件）負責把使用者提供的原始資料，轉換成
`rawInput`格式；**既有Product Adapter**（TASK1.100）
負責把`rawInput`轉換成`{context, options?}`（這一步是
既有的、通用的，不需要新增邏輯）。

### Where Output Formatting Happens（輸出格式化發生在哪裡）

延續TASK1.108第4節Output Responsibility
Mapping已確立的"呈現邏輯必須留在最外層Product Layer"
結論：**Health Insight Feature**（或未來為它新增的一個
呈現層）負責把Capability鏈路回傳的結構化結果（`{analysis,
recommendation}`），轉換成TASK1.108定義的四類使用者可見
輸出（Health Observation/Behavior Pattern/
Recommendation/Progress Trend）。

---

## 7. UI Integration Preparation

### UI Responsibility（UI責任，規格原文列出的三項）

- `collect input`（收集輸入）：對應TASK1.109第5節B
  畫面Data Input，UI負責提供輸入介面，把使用者填寫的
  內容整理成乾淨的資料傳給Health Insight Feature。
- `display output`（顯示輸出）：對應TASK1.109第5節A/C/D
  畫面，UI負責把Health Insight Feature回傳的結構化輸出
  呈現給使用者。
- `user interaction`（使用者互動）：對應TASK1.109第6節
  User Action Boundary定義的使用者動作（Input
  data/Update information/View insight/Review
  recommendation）。

### Intelligence Responsibility（智慧責任，規格原文列出的三項）

- `analysis`（分析）：既有Analysis Capability負責。
- `recommendation`（建議）：既有Recommendation
  Capability負責。
- `insight generation`（洞察產生）：Health Insight
  Feature負責組裝跟呈現轉換，底層資料來自Analysis
  Capability。

### UI跟Intelligence的邊界

延續TASK1.109第7節已經確立的"UX在Product Feature層結束、
Intelligence從Product Entry開始"結論，本次任務重新確認：
UI**只**跟Health Insight Feature互動（透過未來的、本次
任務不建立的某種呼叫方式，例如未來的API），**不會**、也
**不需要**知道Product Entry/Contract/Adapter/Execution/
Operational/Capability/Runtime的存在。**本次任務不建立
任何UI**——上面的責任分類純粹是規劃層級的邊界確認。

---

## 8. API / Route Integration Preparation

### 未來的整合方向（規格原文架構）

```
Route（規劃中，本次任務不建立）
  ↓
Controller（規劃中，本次任務不建立）
  ↓
Product Entry（TASK1.99，既有，完全重用）
```

### 明確的範圍限制（規格原文要求）

**本次任務不建立**routes、controllers、endpoints——這條
Flow純粹是規劃層級的未來整合方向，用來確認"未來如果要
接上真實的HTTP路由，應該長什麼樣子"：未來的Route/
Controller會是**唯一**知道HTTP是什麼的地方（延續整個
Phase 1~5系列"No HTTP"既有邊界），Controller會把HTTP
Request解析成乾淨的資料，呼叫Health Insight Feature（
而Health Insight Feature會呼叫`entry.
requestProductEntry()`），再把回傳結果包裝成HTTP
Response——這個既定分工完全延續TASK1.91已規劃、TASK1.99
落地時重新確認的"Entry層負責HTTP層級的事，不做業務轉換"
既有原則。

---

## 9. Membership Integration Preparation

延續TASK1.106第9節/TASK1.107第8節/TASK1.108第7節/
TASK1.109第9節已經規劃的商業方向，本次任務從**實作準備**
角度重新確認：

### Free（規格原文）

- **Basic Health Insight**：對應V1範圍內的既有Analysis+
  Recommendation Capability能力，**不需要**任何額外的
  實作準備——這正是V1範圍本身。

### Premium（規格原文，三項）

- **Advanced analysis**：規劃上需要新增Analysis
  Runner模組（延續TASK1.43既有的`dependencies.modules`
  延伸點設計），**實作準備**：未來若要落地，應該以"新增
  選填模組"的方式進行，不修改既有Analysis Runner的核心
  邏輯。
- **Gemini enhancement**：規劃上需要一個新的Enhancement
  Layer（見下方第10節），**實作準備**：這個Layer應該是
  Health Insight Feature之外、之後的**獨立**元件，不
  嵌入既有Capability鏈路內部。
- **Extended history**：規劃上需要更長時間範圍的歷史
  資料查詢能力，**實作準備**：這涉及資料儲存策略（本次
  任務不涉及database schema，留給未來獨立評估）。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何付款機制**——上面的分類純粹是規劃
層級的商業方向跟實作準備原則，不涉及任何實際的訂閱/
權限判斷程式碼。

---

## 10. Gemini Integration Preparation

### 未來的Gemini位置（規格原文架構）

```
Health Insight Structured Output（TASK1.108定義的四類
  結構化輸出，由Health Insight Feature整理完成）
  ↓
Gemini Enhancement（規劃中的未來銜接點，本次任務不建立）
  ↓
User Explanation（使用者說明，規劃中，本次任務不建立）
```

### 確認：Gemini不會取代既有架構（重申）

**明確確認（規格要求）**：延續TASK1.106/1.107/1.108/
1.109已經反覆確認、本次任務重新確認依然成立的結論——
Gemini**不會取代**Feature（Health Insight
Feature/Feature Intelligence Integration既有的組裝跟
轉換邏輯依然由既有程式碼負責）、**不會取代**
Capability（Analysis/Recommendation Capability依然
產生結構化資料）、**不會取代**Runtime（Phase 2既有
執行邏輯完全不受影響）。**實作準備角度的具體確認**：
未來Gemini Enhancement Layer的**輸入**必須是"已經由
Health Insight Feature整理完成的結構化輸出"，**不能**是
Insight Context或任何更底層的原始資料——這個輸入邊界
限制，本身就是"Gemini不會取代既有架構"這個原則在實作
層面的具體體現。

---

## 11. Implementation Sequence Plan

### 建議的實作順序（規格原文架構，五步驟）

**Step 1：Product Feature foundation（Product Feature
基礎）**——建立Health Insight Product Feature的最小骨架
（延續TASK1.99~1.103"最小可運作骨架"的既有模式），先
不接任何真實輸入/輸出邏輯，只驗證能否正確組裝五個既有
Product Boundary。

**Step 2：Product Entry integration（Product Entry
整合）**——把Step
1建立的骨架，跟TASK1.107/1.108定義的Health Insight
特定輸入/輸出邏輯串接起來，透過手動組裝的測試（延續
TASK1.104/1.105的End-to-End驗證模式）確認完整鏈路正確
運作。

**Step 3：UI integration（UI整合）**——**在Step
1/2完成、驗證過後**，才開始規劃/建立真實的UI（本次任務
明確不建立，這是未來任務的範圍）。

**Step 4：User testing（使用者測試）**——UI落地後，
邀請真實使用者測試完整的First-Time/Returning User
Journey（延續TASK1.109第3/4節），驗證產品假設是否成立。

**Step 5：Gemini enhancement（Gemini強化）**——**只有在
Step 1~4都驗證過**、確認核心價值主張成立之後，才評估是否
導入Gemini Enhancement Layer（延續第10節已確認的輸入
邊界限制）。

### 依賴關係說明（規格要求解釋）

這五個步驟是**嚴格循序**的，不建議跳步：
Step 2依賴Step 1（沒有骨架就無法整合）；Step
3依賴Step 2（沒有驗證過的資料流程，UI會呈現不正確或
不完整的內容）；Step 4依賴Step 3（沒有UI就無法讓真實
使用者測試）；Step 5依賴Step
4（延續TASK1.106/1.109已經反覆確認的"AI不是立刻要做的
事"原則，只有在確認核心產品價值成立之後，才值得投入
AI強化這個**加值**功能，而不是本末倒置先做AI再驗證
核心價值）。

---

## 12. Risk Assessment

### Architecture Risks（架構風險，規格原文列出的兩項）

- **Unnecessary abstraction（不必要的抽象）**：實作
  Health Insight Feature時，可能過度設計成一個通用的
  "任何Product Feature都能用"的框架，而不是先做出
  Health Insight這一個具體場景需要的最小實作——延續
  Phase 1~5系列反覆確認的"不建立不必要的抽象層"原則
  （例如TASK1.98已經明確記錄的"No Unnecessary
  Abstraction"）。**緩解方案**：先實作Health Insight
  這一個具體場景，如果未來真的有第二個Product
  Feature需要類似能力，再從兩個具體實例裡萃取共同模式，
  不要提前假設。
- **Duplicate logic（重複邏輯）**：可能不小心在Health
  Insight Feature裡重新實作了既有Product
  Adapter/Contract已經有的驗證/轉換邏輯——延續第2節
  Existing Architecture Reuse Analysis已經做的重用
  分析。**緩解方案**：實作前對照第2節的重用分析表格，
  確認每一段新程式碼都是"既有能力真的沒有覆蓋"的部分。

### Product Risks（產品風險，規格原文列出的一項）

- **Unclear user value（使用者價值不清楚）**：如果
  Analysis/Recommendation Capability產生的既有insight
  格式（例如`activity_count`這類事實計數）沒有經過
  足夠好的呈現轉換，使用者可能覺得"這些觀察沒有意義"。
  **緩解方案**：延續TASK1.109第11節Implementation
  Sequence Plan的Step 4（User
  testing），儘早讓真實使用者驗證呈現內容是否真的有
  價值，而不是假設既有Capability輸出本身就足夠。

### AI Risks（AI風險，規格原文列出的一項）

- **Premature AI dependency（過早依賴AI）**：如果
  在核心Analysis/Recommendation能力還沒驗證過使用者
  價值之前，就投入資源導入Gemini，可能造成"用AI掩蓋
  核心產品問題"的風險（例如核心Insight不夠有用，卻
  想靠AI包裝成看起來更好的文字）。**緩解方案**：延續
  第11節Implementation Sequence
  Plan明確把Gemini enhancement排在Step
  5（最後一步），且明確要求Step 1~4都驗證過才進行。

### Data Risks（資料風險，規格原文列出的一項）

- **Excessive personal data collection（過度收集個人
  資料）**：實作時可能為了"未來可能用得到"而收集超出
  TASK1.107定義範圍的個人資料，違反TASK1.107第5節
  Data Privacy Boundary的既有原則。**緩解方案**：
  實作時嚴格對照TASK1.107第2/3節定義的Required/
  Optional/Future三層分類，只收集Required跟
  Optional範圍內的資料，Future範圍的欄位（例如病史、
  穿戴裝置資料）在對應的落地任務明確評估隱私/合規
  要求之前，不得提前收集。

---

## Restrictions Confirmation（限制確認）

本次任務嚴格遵守規格明確列出的禁止清單：

- ❌ 沒有實作任何production功能、UI、frontend元件、CSS。
- ❌ 沒有建立任何route、controller、API endpoint。
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

✅ Health Insight implementation architecture
defined——見第1節Implementation Architecture
Goal跟第3節Health Insight Implementation Flow。

✅ Existing architecture reuse confirmed——見第2節
Existing Architecture Reuse Analysis，含完整的重用分析
總結表格。

✅ New component boundary defined——見第4節New Component
Boundary Planning，Product/Feature兩層可能新元件明確
（Capability層明確Reuse）。

✅ Data flow defined——見第6節Data Flow Implementation
Planning，Validation/Transformation/Output
Formatting三者各自發生在哪裡明確。

✅ UI integration boundary defined——見第7節UI Integration
Preparation，UI跟Intelligence責任分離明確。

✅ Future Gemini boundary defined——見第10節Gemini
Integration Preparation，明確確認Gemini不取代Feature/
Capability/Runtime。

✅ Implementation sequence defined——見第11節
Implementation Sequence Plan，五步驟跟依賴關係明確。

✅ Risk assessment completed——見第12節Risk
Assessment，四類風險（Architecture/Product/AI/Data）
各自的緩解方案明確。

✅ AI Provider not enabled——本次任務沒有呼叫任何AI
SDK、沒有建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次任務完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次任務完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。
