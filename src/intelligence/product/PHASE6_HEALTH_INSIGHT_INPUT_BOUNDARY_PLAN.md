# Health Insight Data Input Boundary Definition（Phase 6 TASK1.107）

## 目的

TASK1.106已經定義了Health Insight的產品方向、目標使用者、
User Journey、Feature Scope跟Future Gemini
Boundary。本次任務接續往下一層規劃：**Health Insight需要
使用者/系統提供哪些資料**——這份文件的產出應該成為**未來
Product Input的參考基準**，本次任務**不**實作任何實際的
儲存機制或API、**不**建立database schema、**不**建立
UI、**不**整合任何AI。

驗證方式見`backups/phase6-task1.107-health-insight-input-boundary/
test_health_insight_input_boundary.mjs`。

### 跟TASK1.106的關係

TASK1.106第7節Input Boundary Planning已經列出兩大類、九個
欄位（Basic：age/gender/height/weight/goal；Daily：
food/exercise/sleep/activity）作為**初步的**輸入分類。本次
任務（TASK1.107）在這個基礎上**更細緻地**展開：把每個欄位
拆解成Required/Optional/Future三個層級、定義驗證責任歸屬、
定義隱私邊界、定義跟既有Intelligence Chain的對應關係——這是
TASK1.106規劃的自然延伸，不是另起爐灶。

---

## 1. Input Boundary Goal

### Why Health Insight Needs Input Data（為什麼Health Insight需要輸入資料）

Health Insight的核心價值是"把資料轉換成洞察"（TASK1.106第1節
Product Vision已確認）——沒有輸入資料，Analysis
Capability（既有，TASK1.76）就沒有任何東西可以分析，
Recommendation Capability（既有，TASK1.77）也就沒有任何
Analysis結果可以依據。因此，明確定義"需要什麼資料"是
Health Insight能夠產生任何價值的**前提**，而不是可有可無的
附加規劃。

### Relationship Between User Data and Intelligence Analysis
（使用者資料跟智慧分析的關係）

使用者資料本身**不是**Intelligence
Analysis——它是Analysis Capability的**原料**。既有的
Insight Context形狀（`activityContext`/`nutritionContext`/
`emotionContext`/`behaviorContext`/`reportContext`/
`metadata`，TASK1.42既有定義）已經展示了這個關係：使用者
資料經過整理、分類後，才會變成Analysis Capability看得懂的
Insight Context，Analysis Capability再把Insight
Context轉換成結構化的insights（洞察）。本次任務規劃的
是"使用者資料"這一端，不重新定義Insight Context本身
（那是TASK1.42既有、本次任務不修改的範疇）。

### Difference Between Raw Data and Intelligence Input
（原始資料跟智慧輸入的差異）

- **Raw Data（原始資料）**：使用者直接輸入的內容，例如"今天
  午餐吃了雞胸肉沙拉"、"今天走了8000步"——這些資料**尚未**
  經過任何結構化整理，可能包含使用者自由輸入的文字、數字、
  時間戳記等雜亂格式。
- **Intelligence Input（智慧輸入）**：Raw Data經過Product
  層（Health Insight Feature，未來落地）整理、分類後，
  符合既有Product Entry Contract形狀（`{userId?, rawInput,
  options?}`，TASK1.99既有定義）的乾淨資料——`rawInput`
  本身應該已經是分類過的健康/行為資料（延續TASK1.100
  Adapter既有"直接把rawInput當作context使用"的簡化設計），
  而不是使用者輸入的原始文字。
- **關鍵邊界**：Raw Data → Intelligence Input的轉換，**歸屬
  Product Feature層**（Health Insight Feature未來落地時的
  職責），**不歸屬**Phase 5既有的五個Product
  Boundary（Entry/Contract/Adapter/Execution/
  Operational）——這五層假設收到的`rawInput`已經是"乾淨"的
  資料，不負責把使用者的自由輸入轉換成結構化格式（延續
  TASK1.99 Entry"只驗證形狀，不轉換內容"的既有設計）。

---

## 2. Input Data Categories

### A. User Profile Data（使用者基本資料）

延續TASK1.106第7節的Basic欄位，本次任務更細緻地拆解：

**Required Fields（必要欄位）**：
- `age`（年齡）——沒有年齡，無法判斷任何年齡相關的健康基準。
- `gender`（性別）——沒有性別，無法判斷任何性別相關的健康
  基準（例如基礎代謝率的計算基準不同）。
- `height`（身高）——身高是計算BMI等基礎健康指標的必要輸入。
- `weight`（體重）——體重是Health Weight Management
  Intelligence（TASK1.106確認的第一個產品入口）最核心的
  追蹤指標，沒有體重就沒有"體重管理"可言。

**Optional Fields（選填欄位）**：
- `bodyInformation`（body information，規格原文，例如體脂率、
  肌肉量等更細緻的身體組成資料）——這些資料能提升分析品質
  （延續下方第3節"Optional：能提升分析品質的資料"定義），
  但不是產生最小可用Health Insight的必要條件，因為不是每個
  使用者都有測量體脂率/肌肉量的裝置。

**Future Extension Fields（未來擴充欄位）**：
- 延續下方第7節Future Extension Boundary，User Profile
  Data未來可能擴充的欄位（例如病史、過敏資訊、用藥紀錄）本次
  任務**不**具體列出，只確認"User Profile Data這個分類本身
  是可擴充的"，具體要擴充哪些欄位留給未來任務決定。

### B. Health Goal Data（健康目標資料）

**Possible Goals（可能的目標，規格原文列出的四種）**：
- `weight loss`（減重）
- `weight maintenance`（維持體重）
- `muscle gain`（增肌）
- `healthy lifestyle`（健康生活型態，不特別聚焦體重數字，
  而是整體生活習慣的改善）

**Goal Ownership（目標歸屬）**：目標**由使用者自己設定**，
Health Insight Feature**不會**替使用者決定目標——這延續
TASK1.106第1節"不做決定"的產品定位跟Phase 1~5系列反覆確認
的"不做Decision Algorithm"邊界。使用者輸入自己的目標，
系統只根據這個既定目標分析資料、產生建議，不評判目標本身
是否"正確"或自動更改它。

**Goal Impact on Recommendation（目標對建議的影響）**：不同
的Goal會影響Recommendation Capability（既有，TASK1.77）
未來如何解讀Analysis
Capability的輸出——例如同樣"這週活動量下降"的觀察，對
`weight loss`目標的使用者跟`muscle gain`目標的使用者，
未來可能對應到不同方向的建議內容。**本次任務不定義**
Recommendation Capability內部如何根據Goal調整輸出邏輯（那
會涉及修改既有Recommendation Runner，是Phase 4既有架構、
本次任務明確禁止修改的範圍）——本次任務只確認Goal是Health
Insight Feature需要收集、並在未來某個層級（很可能是Health
Insight Feature自己組裝Insight Context時）納入考量的一項
輸入資料。

### C. Daily Behavior Data（每日行為資料）

延續TASK1.106第7節的Daily欄位，本次任務更細緻地拆解成三個
子分類：

**Food（飲食，規格原文列出的四項）**：
- `breakfast`（早餐）
- `lunch`（午餐）
- `dinner`（晚餐）
- `snacks`（點心/零食）

**Activity（活動，規格原文列出的兩項）**：
- `exercise`（運動）
- `walking`/`activityLevel`（走路/活動量）

**Lifestyle（生活型態，規格原文列出的兩項）**：
- `sleep`（睡眠）
- `waterIntake`（水分攝取）

**明確的範圍限制（規格原文要求）**：**本次任務不建立任何
database表**——上面列出的八個欄位（四項Food+兩項
Activity+兩項Lifestyle）純粹是規劃層級的分類，用來讓未來的
Health Insight Feature知道"每日行為資料大致會落在哪些類別
裡"，不是任何資料表的欄位定義。

### D. Measurement Data（量測資料）

**Possible Measurements（可能的量測項目，規格原文列出的
三項）**：
- `weightTrend`（體重趨勢）
- `bodyMeasurement`（身體量測，例如腰圍、臀圍等）
- `progressTracking`（進度追蹤）

**Current V1 Requirement vs Future Extension（V1需求
vs未來擴充的區隔）**：
- **V1需求**：只需要`weightTrend`——因為第一個產品入口是
  Health **Weight Management** Intelligence（TASK1.106
  確認），體重趨勢是驗證"整條Intelligence
  Chain能否支撐一個真實場景"最基本、最直接的量測指標，
  不需要任何額外的量測裝置或使用者額外輸入更多資料（`weight`
  本身已經在User Profile Data的Required
  Fields裡收集過，`weightTrend`只是這個既有欄位隨時間的
  變化序列，不是一個全新的輸入項目）。
- **Future Extension**：`bodyMeasurement`（身體量測）跟
  `progressTracking`（進度追蹤，超出單純體重趨勢的更全面
  進度呈現）留給未來擴充——這兩項需要使用者提供更多資料
  （腰圍、臀圍等），或需要更長時間的歷史資料累積才有意義，
  不屬於V1的最小可用範圍。

---

## 3. Required vs Optional Data Boundary

### Required（必要資料的定義）

**Required = 產生最小可用Health Insight所必須的資料**——
延續第2節A小節的定義，Required資料是：`age`、`gender`、
`height`、`weight`（User Profile Data四項）。這四項資料
**同時滿足**兩個條件：(1) 沒有它們，連最基礎的健康觀察
（例如BMI）都無法計算；(2) 幾乎所有使用者都可以立即提供，
不需要額外的裝置或專業知識。

### Optional（選填資料的定義）

**Optional = 能提升分析品質、但不是產生Health
Insight的必要條件的資料**——包含：`bodyInformation`
（body information，User Profile Data選填欄位）、Health
Goal Data（`goal`本身雖然重要，但沒有明確設定Goal時，系統
依然可以呈現中性的Health observation，只是Recommendation
的針對性會降低）、Daily Behavior Data（Food/Activity/
Lifestyle八項）——這些資料使用者可能只提供其中一部分（例如
只記錄飲食、不記錄睡眠），Analysis Capability既有的設計
（TASK1.76）本身就允許"部分資料缺席"（既有的
`activityContext`/`nutritionContext`等各自獨立，缺少某一項
不影響其他項目的分析），因此Daily Behavior Data整體歸類為
Optional，而不是Required。

### Future（未來保留資料的定義）

**Future = 保留給未來擴充、V1完全不收集的資料**——包含：
User Profile Data的Future Extension
Fields（病史/過敏/用藥等）、Measurement Data的
`bodyMeasurement`跟`progressTracking`、第7節列出的所有
Future Extension Boundary項目（穿戴裝置、健康裝置、病歷、
營養資料庫、活動追蹤的深度整合）。這些資料之所以歸類為
Future而不是Optional，是因為**V1完全沒有對應的收集/使用
機制規劃**——Optional資料是"V1規劃裡已經存在、但非必要"的
欄位，Future資料是"V1規劃裡根本不存在對應功能"的欄位，
兩者的差異是"存在但非必要"跟"根本不存在"的差異。

### 為什麼各分類歸屬各自的層級（總結）

| 資料類別 | 層級 | 理由 |
|---|---|---|
| age/gender/height/weight | Required | 最小可用Health Insight的計算基礎，幾乎所有使用者都能立即提供 |
| bodyInformation | Optional | 提升分析精細度，但非計算BMI等基礎指標所必須 |
| goal | Optional | 影響Recommendation針對性，但缺席時仍可呈現中性觀察 |
| Daily Behavior（Food/Activity/Lifestyle） | Optional | Analysis Capability既有設計允許部分資料缺席 |
| weightTrend | V1 Required（衍生自weight） | 體重管理場景的核心追蹤指標，不需要額外輸入 |
| bodyMeasurement/progressTracking | Future | V1沒有對應的收集/呈現機制 |
| 病史/過敏/用藥/穿戴裝置等 | Future | 完全超出V1規劃範圍，需要獨立的未來任務評估 |

---

## 4. Input Validation Responsibility

延續Phase 5系列（TASK1.99~1.103）已經確認的"每一層只在自己
新增的驗證範圍裡新增判斷邏輯"分工原則，本次任務把這個原則
延伸到Health Insight的輸入資料驗證：

### Product Layer（Health Insight Feature，未來落地）

**責任：user input format**——確認使用者輸入的原始格式本身
可以被解析（例如數字欄位真的是數字、日期欄位真的是合法
日期），這是Raw Data → Intelligence Input轉換的第一道關卡
（見第1節"關鍵邊界"）。**本次任務不實作**任何驗證器。

### Contract Layer（Product Contract，TASK1.103既有）

**責任：request structure validation**——確認組裝好的
Product Request整體形狀合法（`rawInput`必要物件、`userId`/
`options`選填，延續TASK1.103既有的
`validateProductRequestShape()`實作），**不**重新驗證
Health Insight特定的欄位內容（例如不會在Contract層檢查
"age是否為合理的年齡範圍"）。

### Adapter Layer（Product Adapter，TASK1.100既有）

**責任：product format conversion**——把Health Insight的
`rawInput`轉換成Intelligence Feature要求的`{context,
options?}`形狀（延續TASK1.100既有的簡化設計：直接把
`rawInput`當作`context`），**不**驗證Health Insight特定的
業務邏輯合理性。

### Feature Layer（Feature Intelligence Integration，
TASK1.79既有 / 未來的Health Insight Feature自己）

**責任：feature-specific requirement validation**——確認
Health Insight**特定**的必要欄位齊全（例如"沒有weight就
無法產生Health Insight"這類判斷），這一層的驗證**歸屬
Health Insight Feature自己**（未來落地），**不歸屬**既有的
Feature Intelligence Integration（TASK1.79，它驗證的是
通用的`{context, options?}`形狀，不知道"Health
Insight"這個具體產品概念的存在）。

### Capability Layer（Analysis/Recommendation Capability，
既有）

**責任：intelligence processing requirement**——確認
Insight Context本身的形狀合法（延續既有Analysis
Capability/Analysis Runner的既有驗證邏輯，TASK1.43/1.76），
這一層完全不知道"Health Insight"這個產品概念，只認識
Insight Context這個既有的、通用的資料形狀。

### 分工總結

```
使用者原始輸入
  ↓（Product Layer：格式可解析性）
Health Insight rawInput
  ↓（Contract Layer：Product Request整體形狀）
  ↓（Adapter Layer：格式轉換，不驗證業務邏輯）
{context, options?}
  ↓（Feature Layer：Health Insight特定必要欄位，例如weight必須存在）
  ↓（Capability Layer：Insight Context形狀本身）
Analysis/Recommendation結果
```

**本次任務不實作任何一層的驗證器**——上面的分工純粹是
規劃層級的責任歸屬確認，延續Phase 5系列的既有分工原則。

---

## 5. Data Privacy Boundary

### Allowed Usage（允許的用途）

- **intelligence analysis input**：使用者提供的健康/行為
  資料，唯一允許的用途是作為Analysis
  Capability的輸入，用來產生Health Insight跟
  Recommendation——不做其他用途（例如不做廣告投放的行為
  分析、不做跟Health Insight無關的資料探勘）。

### Forbidden（禁止事項，規格原文列出）

- ❌ **unnecessary personal information**（不必要的個人
  資訊）：Health Insight不會收集跟健康分析無關的個人資訊
  （例如聯絡方式、地址、社交關係），只收集第2節列出的健康/
  行為資料類別。
- ❌ **authentication data**（身份驗證資料）：Health
  Insight的輸入資料完全不包含密碼、token、session
  ID等任何身份驗證相關的資訊——延續整個Phase 1~5系列
  反覆確認的"Intelligence Chain不知道Auth是什麼"邊界。
- ❌ **private system data**（私有系統資料）：Health
  Insight不會收集/使用任何系統內部資料（例如其他使用者的
  資料、系統管理資訊）。

### 確認：Health Insight不直接存取auth/oauth/session/database層

**明確確認（規格要求）**：延續Phase 5五個Product
Boundary（Entry/Contract/Adapter/Execution/Operational）
已經反覆驗證過的既有邊界（TASK1.99~1.104逐檔案掃描確認
完全不import `src/auth/`、`src/oauth/`、`src/middleware/`、
`src/db/`），Health Insight Feature（未來落地）**規劃上
同樣必須遵守**這個邊界——它只透過既有的
`entry.requestProductEntry({userId?, rawInput})`介面跟
Product Entry互動，`userId`本身（如果需要）由**呼叫Health
Insight Feature的更上層**（規劃上可能是route/controller，
本次任務不建立）負責從既有Auth/Session機制取得後傳入，
Health Insight Feature自己**不會**、也**不需要**直接呼叫
`src/auth/`、`src/oauth/`、`src/db/`底下任何模組。

---

## 6. Intelligence Mapping

### 輸入資料類別 → 既有Capability的對應

```
User Input（第2節四大類：User Profile/Health Goal/Daily Behavior/Measurement）
  ↓
Health Insight Feature（規劃中，本次任務不建立程式碼）
  ↓
Analysis Capability（TASK1.76，既有，完全不修改）
  ↓
Recommendation Capability（TASK1.77，既有，完全不修改）
  ↓
Future Decision Capability（TASK1.83，既有，目前decision:null佔位，V1不使用）
```

### 各類資料被哪個Capability消費

- **User Profile Data**（age/gender/height/weight/
  bodyInformation）：規劃上會被組裝進Insight
  Context的哪個既有欄位，取決於未來Health Insight
  Feature的具體實作，但邏輯上這類"靜態基準資料"最貼近
  既有`metadata`欄位的角色（TASK1.42既有定義：Insight
  Context的`metadata`欄位記錄"總筆數"這類跨類別的中繼
  資訊）——Analysis Capability會用這類資料計算基礎健康
  指標（例如BMI）。
- **Health Goal Data**（goal）：規劃上不直接被Analysis
  Capability消費（Analysis Capability既有設計是"事實計數，
  不做判斷"，TASK1.44/1.87既有原則），而是被
  Recommendation Capability在既有的
  Analysis結果基礎上，用來調整建議的方向性（見第2節B小節
  "Goal Impact on Recommendation"）。
- **Daily Behavior Data**（Food/Activity/Lifestyle八項）：
  規劃上直接對應既有Insight Context的
  `nutritionContext`（Food）、`activityContext`
  （Activity）、`behaviorContext`（Lifestyle，例如睡眠/
  水分攝取這類生活習慣資料）——這是TASK1.42既有欄位
  設計本來就預留的分類，Health Insight只是**第一個**真正
  把資料填進這些既有欄位的Product Feature。
- **Measurement Data**（weightTrend，V1範圍）：規劃上是
  `weight`（User Profile Data）隨時間累積的序列，用來讓
  Recommendation Capability在既有輸出基礎上，未來可能
  納入"趨勢方向"作為建議依據的一部分——本次任務只規劃這個
  對應關係的存在，不定義具體的趨勢計算邏輯。
- **Future Decision Capability**（decision，目前佔位）：
  V1完全不使用（延續TASK1.106第4節Feature Scope的Exclude
  範圍），未來如果Decision Capability真正落地判斷邏輯，
  規劃上會是"根據Analysis+Recommendation的結果，加上Goal
  資料，自動判斷使用者屬於哪個階段"這類場景的銜接點，
  但目前仍只是規劃層級的預留位置。

---

## 7. Future Extension Boundary

以下輸入來源**規劃上**是未來可能的擴充方向，本次任務**只
記錄可能性、不實作**：

- **wearable devices**（穿戴裝置）：例如智慧手環/手錶
  自動同步的心率、步數、睡眠品質資料——比使用者手動輸入
  更準確、更即時，但需要額外的裝置整合機制（規劃上超出
  本次任務範圍）。
- **health devices**（健康裝置）：例如智慧體重計、血壓計
  自動同步的量測資料——同樣需要額外的裝置整合機制。
- **medical records**（病歷）：使用者的既有病史/用藥紀錄，
  這類資料涉及更高規格的隱私/合規要求（可能涉及醫療資料
  法規），規劃上需要獨立的隱私/合規評估任務，不是本次任務
  或近期任務的範圍。
- **nutrition database**（營養資料庫）：讓使用者輸入的
  食物名稱能自動對應到精確的營養成分數值（而不是使用者
  自己估算），需要整合外部或內部的營養資料庫，規劃上是
  提升Analysis精確度的方向，但不影響現有的輸入分類架構
  （使用者依然是輸入`breakfast`/`lunch`/`dinner`/
  `snacks`這幾個既有分類，只是內容從自由文字變成資料庫
  查詢結果）。
- **activity tracking**（活動追蹤的深度整合）：比V1單純的
  `exercise`/`walking`欄位更細緻的活動類型/強度/時長追蹤。

---

## 8. Free vs Premium Input Direction

延續TASK1.106第9節Premium Direction的商業方向規劃，本次
任務針對**輸入資料**這個維度具體展開：

### Free（免費層級）

- **basic profile**（基本資料）：第2節A小節的User Profile
  Data（Required + Optional欄位）。
- **manual daily input**（手動每日輸入）：第2節C小節的
  Daily Behavior Data，使用者自行手動輸入。

### Premium（付費層級，未來規劃）

- **richer history**（更豐富的歷史資料）：規劃上可能是
  更長時間範圍的歷史資料保留跟分析（例如免費層級只能看
  近30天，付費層級可以看一年）——這涉及未來的資料保留
  策略，本次任務不定義具體規則。
- **connected devices**（連接裝置）：對應第7節Future
  Extension Boundary的wearable/health
  devices，規劃上可能是Premium專屬的裝置整合能力。
- **advanced analysis**（進階分析）：規劃上可能是更多
  Analysis模組（延續Analysis Runner既有的
  `dependencies.modules`延伸點設計，TASK1.43已建立）或
  Decision Capability真正落地後的自動化能力。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何會員機制**——上面的Free/Premium分類
純粹是規劃層級的商業方向，不涉及任何實際的訂閱/權限判斷
程式碼。

---

## 9. Gemini Future Boundary

### 確認：Gemini不會收到未經限制的原始使用者資料

**明確確認（規格要求）**：Gemini（或任何未來的AI
Provider）**不會**直接接觸第2節列出的原始輸入資料
（`age`/`weight`/`breakfast`內容等）——這些原始資料只會
流向既有的Analysis Capability（透過Insight
Context），Gemini**只有**在Analysis/Recommendation
Capability已經產生**結構化、已驗證**的輸出**之後**，才
可能在規劃中的未來銜接點介入。

### 未來的Flow（規劃，本次任務不建立）

```
Validated Intelligence Input（已驗證的Insight Context，
  既有Capability Layer既有驗證機制把關）
  ↓
Analysis Capability（TASK1.76，既有，完全不修改）
  ↓
【規劃中的未來銜接點】Gemini Enhancement Layer（尚未存在，
  本次任務不建立）
```

這條Flow延續TASK1.106第10節Future Gemini
Extension已經確認的結論：Gemini的銜接點規劃上落在**Analysis
Capability輸出之後**，**不會**插入Insight Context的組裝
過程、**不會**接觸使用者的原始輸入資料本身。

### Gemini依然只是Enhancement Layer（重申）

延續TASK1.106第10節已經確認、本次任務重新確認依然成立的
結論：Gemini**不會取代**Analysis Capability、
**不會取代**Recommendation Capability、**不會取代**
Runtime——即使未來Gemini真正銜接，它處理的也只是"已經由
既有Capability產生的結構化結果"，不是"使用者的原始健康
資料"。這個邊界確保即使Gemini本身non-deterministic/
可能失敗，也不會影響既有Intelligence Chain
（Entry→Contract→Adapter→Execution→Operational→Feature→
Capability→Runtime）本身的正確性跟穩定性。

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

✅ Health Insight input boundary defined——見第1節Input
Boundary Goal跟第2節Input Data Categories，四大類輸入資料
（User Profile/Health Goal/Daily Behavior/Measurement）
明確定義。

✅ Required and optional data defined——見第3節Required vs
Optional Data Boundary，含完整的分類理由總結表格。

✅ Validation responsibility defined——見第4節Input
Validation Responsibility，五層（Product/Contract/
Adapter/Feature/Capability）驗證責任分工明確。

✅ Privacy boundary defined——見第5節Data Privacy
Boundary，Allowed/Forbidden用途明確，確認Health
Insight不直接存取auth/oauth/session/database層。

✅ Intelligence mapping defined——見第6節Intelligence
Mapping，四大類輸入資料對應既有Analysis/Recommendation/
Decision三個Capability的關係明確。

✅ Future extension boundary defined——見第7節Future
Extension Boundary（穿戴裝置/健康裝置/病歷/營養資料庫/
活動追蹤）跟第8節Free vs Premium Input Direction。

✅ AI Provider not enabled——本次任務沒有呼叫任何AI
SDK、沒有建立Prompt Logic，第9節Gemini Future
Boundary明確記錄"這應該是規劃、不是落地"。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次任務完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次任務完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。
