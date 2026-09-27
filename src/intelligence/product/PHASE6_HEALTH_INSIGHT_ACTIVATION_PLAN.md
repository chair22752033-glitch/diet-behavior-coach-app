# Health Insight User Product Activation Foundation（Phase 6 TASK1.113）

## 目的

TASK1.112完成了Health Insight Product Integration——一條完整、
可執行、但**沒有任何呼叫者**的Product → Intelligence鏈路
（`createHealthInsightProductIntegration()`目前只被測試呼叫）。
本次任務回答**下一個必然的問題**："真實使用者的什麼動作，會
觸發這條已經存在的鏈路？"——這是**使用者活化（User
Activation）**邊界，定義使用者情境跟既有Integration鏈路之間的
對應關係。本次任務**不**實作UI、**不**建立route/controller、
**不**整合任何AI、**不**建立database schema，純粹是規劃/文件
任務。

驗證方式見`backups/phase6-task1.113-health-insight-activation/
test_health_insight_activation_foundation.mjs`。

### 跟TASK1.106~1.112的關係

TASK1.106~1.110回答的是"這個產品是什麼、需要什麼資料、產出
什麼、使用者怎麼互動、怎麼實作"；TASK1.111~1.112把這些規劃
落地成可執行的程式碼（Feature→Integration鏈路）。本次任務
（TASK1.113）站在**已經存在的可執行鏈路**跟**TASK1.109已規劃
但尚未落地的UX Flow**之間，回答"具體是哪些使用者情境會呼叫
這條鏈路、呼叫時傳入什麼、預期拿回什麼"——這是**產品啟動**
規劃，跟TASK1.98（Phase 5 Implementation Readiness）、
TASK1.110（Health Insight Implementation Architecture）扮演
過的同一種"銜接規劃跟落地"角色一致，只是這次銜接的方向是"從
已經落地的程式碼銜接回使用者情境"，跟先前"從規劃銜接到程式碼"
方向相反——這正是TASK1.112完成之後，Product Activation Stage
唯一還沒有明確定義的一段拼圖。

---

## 1. Product Activation Goal

### What Activates Health Insight（什麼會活化Health Insight）

延續TASK1.109第2節User Entry Flow已規劃的三個入口
（Product homepage、Health dashboard、Personal intelligence
area），**活化Health Insight的根本動作**是：使用者提供（或
已經累積了）足夠的健康相關資料，並且表達出"我想知道我的健康
狀況"這個意圖。活化的具體技術定義是：某個未來的呼叫端（目前
唯一存在的呼叫端是測試程式碼）組出一個合法的Product
Request（`{userId?, rawInput, options?}`），呼叫TASK1.112
建立的`integration.requestProductEntry()`。

### User Intention（使用者意圖）

延續TASK1.106第3節User Pain Points已確認的四個痛點（不理解
體重沒有變化的原因、無法辨識不健康的行為模式、缺乏可執行的
改善方向、無法把資料轉換成行動），使用者活化Health
Insight的核心意圖可以歸納成一句話："我想知道我目前的健康
狀態，以及我該怎麼做"——這個意圖**不是**"我想跟AI聊天"
（延續TASK1.106已排除的"不是AI Chat"既定結論），而是"我想要
一份基於我自己資料的、結構化的健康觀察報告"。

### Relationship Between User Action and Intelligence Execution
（使用者動作跟智慧執行的關係）

使用者的**單一次**活化動作（例如"提交今天的健康資料"），
對應到**一次**`integration.requestProductEntry()`呼叫——這是
**一對一**的關係，延續TASK1.111/1.112已確認的"Health Insight
Feature/Integration從頭到尾是同步、deterministic的純函式鏈路"
既定結論：使用者的一次動作，觸發一次完整的Product→Contract→
Entry→Adapter→Execution→Operational→Feature→Capability→
Runtime執行，產出一次結構化的Health Insight輸出，**沒有**
背景工作、**沒有**非同步佇列、**沒有**跨請求的累積狀態（延續
TASK1.111已確認的"呼叫Health Insight Feature多次不會累積任何
跨呼叫的共享狀態"既定結論）。

---

## 2. User Scenario Definition

延續TASK1.109第3/4節已規劃的First-Time User Journey/Returning
User Journey，本次任務把這兩個既有Journey收斂成三個**具體
的、可以直接對應到一次Product Request**的使用情境。

### A. First Health Assessment（第一次健康評估）

- **User Action（使用者動作）**：使用者第一次使用Health
  Insight功能，完成TASK1.109第3節First-Time User
  Journey的Introduction跟基本資料填寫步驟後，第一次提交自己的
  健康資料。
- **Required Input（必要輸入）**：延續TASK1.107第2節A小節
  User Profile Data的Required
  Fields（age/gender/height/weight），這是第一次評估**唯一**
  必要的輸入——延續TASK1.107已確認的"Health Goal
  Data/Daily Behavior Data/Measurement Data在V1都是選填"結論，
  第一次評估不強制要求使用者提供每日行為資料。
- **Expected Output（預期輸出）**：延續TASK1.108第2節A小節
  Health Observation——因為使用者剛提供基本資料，還沒有累積
  任何Daily Behavior Data，Analysis Capability能產生的insight
  數量會偏少（例如各項Context的count可能是0），但輸出的**形狀**
  依然完整（`healthObservation`陣列存在，即使內容稀疏）。

### B. Daily Health Update（每日健康更新）

- **User Action（使用者動作）**：延續TASK1.109第4節Returning
  User Journey的"更新每日行為資料"步驟，使用者已經完成過第一
  次評估，現在提交當天的飲食/活動/生活型態資料。
- **Required Input（必要輸入）**：延續TASK1.107第2節C小節
  Daily Behavior Data，這次的Product Request會包含比第一次
  評估更完整的Context（activityContext/nutritionContext/
  behaviorContext等欄位有實際的count/items），User Profile
  Data可以省略（延續TASK1.107"Returning User不需要重複填寫
  Required Fields"的隱含結論，本次任務進一步明確標註在下方
  第3節）。
- **Expected Output（預期輸出）**：延續TASK1.108第2節A/C小節
  Health Observation + Recommendation Output——因為這次的
  Context有更豐富的count資料，Analysis Capability產生的
  insight數量會比情境A多，Recommendation Capability也能針對
  這些insight產生對應的建議項目。

### C. Progress Review（進度回顧）

- **User Action（使用者動作）**：延續TASK1.109第4節Returning
  User Journey的"查看最新Insight"/"回顧進度"步驟，使用者累積
  了一段時間的資料後，想要查看目前的整體狀態，而不是提交新
  資料。
- **Required Input（必要輸入）**：跟情境B使用同一份最新的
  Context資料（不需要使用者重新輸入，延續TASK1.109第6節User
  Action Boundary"View insight"跟"Input data"是兩個不同的
  使用者動作這個既有區分）——這裡的"Product Request"由呼叫端
  組裝**既有**的累積資料，而不是使用者當下手動輸入的資料，
  這個組裝過程屬於Product Feature層的職責（見下方第4節）。
- **Expected Output（預期輸出）**：延續TASK1.108第2節D小節
  Progress Trend——雖然本次任務不改變TASK1.111已確認的
  "progressTrend V1固定回傳空物件"既有行為（因為目前沒有
  任何Analysis模組讀取歷史weight序列），但這個情境的**使用者
  意圖**明確是"看趨勢"，這正是TASK1.108已經記錄的"Progress
  Trend是Measurement Data的呈現層對應，需要新Analysis模組"
  這個未來擴充點的具體使用情境，本次任務只確認這個情境的
  存在，不承諾V1會產生非空的progressTrend。

---

## 3. Product Request Contract Mapping

### 完整映射（規格原文架構）

```
User Input（使用者在畫面上填寫/累積的原始資料，TASK1.107
  定義的四大類）
  ↓
Product Request（{userId?, rawInput, options?}，TASK1.99/1.103
  既有的Product Request形狀）
  ↓
Health Insight Integration（TASK1.112既有，
  `integration.requestProductEntry(productRequest)`）
```

### Required Fields（必要欄位）

- `rawInput`（必要，物件）——延續TASK1.99/1.103既有驗證規則，
  這是Product Request**唯一**的必要欄位。`rawInput`本身的
  內容依照情境不同而不同（見上方第2節），但**形狀**上必須是
  一個物件，最終會被Product Adapter（TASK1.100既有，完全不
  修改）原樣轉換成Health Insight Feature/Capability
  Orchestrator要求的`context`欄位。

### Optional Fields（選填欄位）

- `userId`（選填，字串）——延續TASK1.99既有驗證規則。本次
  任務**確認**：Health Insight Integration鏈路本身（Adapter/
  Execution/Operational/Feature/Capability全部）從頭到尾都
  **不讀取**`userId`的值（延續TASK1.100/1.111已確認的"整條
  鏈路不接觸authentication/session"既定結論），`userId`目前
  只在Product Entry/Contract層的驗證階段被檢查型別，**沒有**
  被用來查詢任何使用者資料——這代表"使用者是誰"跟"要分析哪些
  資料"目前是**分離**的：呼叫端（未來的Product Feature/UI）
  自己負責"根據userId組裝出正確的rawInput"，Health Insight
  Integration鏈路本身不做這件事，也不應該做這件事（延續
  TASK1.111 Health Insight Feature"不存取database/
  authentication/session"的明確邊界）。
- `options`（選填，物件）——延續TASK1.103既有驗證規則，原樣
  轉發到Capability Orchestrator，目前沒有任何Capability讀取
  `options`的實際內容（Analysis/Recommendation
  Capability目前都不使用`options`參數）。

### Validation Responsibility（驗證責任）

延續TASK1.112第2/3節已經端對端驗證過的既有分工，本次任務
重新確認、不新增任何驗證邏輯：
- **Product Entry**（TASK1.99）：驗證`rawInput`是否為物件、
  `userId`若存在是否為字串。
- **Product Contract**（TASK1.103）：驗證`options`若存在是否
  為物件、驗證Adapter回傳的Response形狀、檢查版本相容性。
- **Product Adapter**（TASK1.100）：驗證`rawInput`是否為物件
  （防禦性重複檢查）。
- **Health Insight Feature**（TASK1.111）：驗證轉換後的
  `context`是否為物件。
- **Analysis/Recommendation Capability**（既有）：驗證
  `context`是否符合Insight Context Contract（例如是否有
  `user`欄位——這是TASK1.112端對端測試已經發現的既有行為，
  `rawInput`如果沒有`user`欄位，Analysis Runner會回傳
  `missing_field`失敗）。

**本次任務不新增任何一層的驗證邏輯**——上面五層驗證全部是
TASK1.99~1.112已經存在、已經測試過的既有行為，這裡只是把它們
放進"使用者活化"的情境脈絡裡重新確認一次。

---

## 4. Activation Flow

### 完整流程（規格原文架構，具體展開六層）

```
User Action（使用者在畫面上完成的動作，見第2節三個情境）
  ↓
Product Feature（規劃中，本次任務不建立——負責把User
  Action收斂成一個`rawInput`物件，這是TASK1.110第4節已規劃
  的"Health Insight Product Feature"未來新元件）
  ↓
Product Entry（TASK1.99既有，完全不修改）
  ↓
Health Insight Integration（TASK1.112既有，完全不修改——這一
  段本身就已經包含Contract/Adapter/Execution/Operational/
  Feature/Capability Orchestrator/Analysis+Recommendation
  Capability/Runtime整條鏈路）
  ↓
Capability Execution（既有，完全不修改）
  ↓
Product Output（TASK1.108定義的四類輸出，透過既有鏈路回傳）
```

### 各層責任（延續TASK1.112第3節已確認的完整鏈路，本次任務
從"使用者活化"角度重新確認）

- **User Action**：使用者在畫面上完成的具體互動（延續
  TASK1.109第6節User Action Boundary定義的Input
  data/Update information/View insight/Review
  recommendation四類動作），**不**知道Product Request是什麼
  形狀。
- **Product Feature**（規劃中）：**唯一**知道"使用者剛才做了
  什麼"到"要組出什麼樣的rawInput"這個轉換規則的地方——延續
  TASK1.110第6節Data Flow Implementation
  Planning已確認的"Transformation發生在Product Feature層"
  結論，本次任務不新增這個轉換邏輯的實作，只確認它未來屬於
  哪一層。
- **Product Entry → Health Insight Integration**：純粹的
  呼叫轉發，這兩層（以及Integration內部的所有既有邊界）
  完全不知道"使用者剛才做了什麼"，只認識`{userId?, rawInput,
  options?}`這個抽象形狀（延續整個Phase 5系列反覆確認的
  "No HTTP、每一層只認識下一層"既有原則）。
- **Product Output**：使用者最終看到的結構化結果，延續
  TASK1.108/1.111/1.112已確認的四類輸出形狀。

---

## 5. User Value Delivery

延續TASK1.108第2節Output Categories已定義的四類輸出，本次
任務從"使用者如何感受到價值"的角度重新確認每一類輸出對應的
價值主張：

- **Observation（觀察）**：對應`healthObservation`——延續
  TASK1.106 Pain Point 1，價值是"讓使用者第一次看清楚
  '發生了什麼'"（例如"這週記錄了幾次活動、幾筆飲食"），這是
  最基礎、V1就能提供的價值。
- **Behavior Understanding（行為理解）**：對應
  `behaviorPattern`——延續TASK1.106 Pain Point
  2，價值是"讓使用者發現自己可能沒有意識到的規律性行為"，
  延續TASK1.108/1.111已確認的"V1固定回傳空陣列"結論，這類
  價值**目前還沒有辦法交付**，需要新的Analysis模組（見第7節
  跟第9節的未來方向）。
- **Recommendation（建議）**：對應`recommendation`——延續
  TASK1.106 Pain Point 4，價值是"把資料轉換成下一步可以做的
  行動"，V1可以交付（Recommendation Capability既有能力已經
  可以產生建議項目，只是措辭轉換留給未來的Product呈現層，
  延續TASK1.108第2節C已確認的結論）。
- **Progress Tracking（進度追蹤）**：對應
  `progressTrend`——延續TASK1.107第2節D，價值是"讓使用者看到
  自己隨時間的變化"，同樣延續"V1固定回傳空物件"結論，目前
  還沒有辦法交付，是明確的未來擴充方向。

### 價值交付的誠實邊界（本次任務新增的重要確認）

延續TASK1.111 README.md已經記錄的Current
Limitations，本次任務**明確重申**：V1**實際能交付**的價值是
Observation跟Recommendation兩類（`healthObservation`跟
`recommendation`陣列有真實內容），Behavior
Understanding跟Progress Tracking兩類**目前只確認了輸出形狀
的存在，不承諾V1會有實際內容**——這個誠實邊界對於"使用者活化
後應該預期什麼"至關重要，避免產品規劃過度承諾V1還做不到的
價值。

---

## 6. Free / Premium Activation Boundary

延續TASK1.106第9節/TASK1.107第8節/TASK1.108第7節/TASK1.109
第9節/TASK1.110第9節已經反覆規劃的商業方向，本次任務從"活化
邊界"角度重新確認：

### Free（規格原文）

- **Basic Health Insight**：對應第2節三個情境（First Health
  Assessment/Daily Health Update/Progress Review）全部都屬於
  Free範圍——延續TASK1.106第9節已確認的"V1範圍即Free範圍"
  結論，本次任務**不**為Free層級新增任何活化限制（例如不限制
  呼叫次數、不限制情境種類）。

### Premium（規格原文，三項）

- **Advanced insight**：延續TASK1.109第9節，未來可能的活化
  差異是"Premium使用者的Product Request可能觸發額外的
  Analysis模組"（例如第9節提到的Behavior Pattern偵測），但
  **本次任務不定義**這個差異具體怎麼實作。
- **Extended history**：延續TASK1.109第9節，未來可能的活化
  差異是"Premium使用者的rawInput可以包含更長時間範圍的歷史
  資料"，同樣**本次任務不定義**具體實作。
- **Gemini enhancement**：見下方第7節。

### 明確的範圍限制（規格原文要求）

**本次任務不實作任何會員機制**——上面的分類純粹是規劃層級的
活化邊界方向，不涉及任何實際的訂閱/權限判斷程式碼，也不會在
Product Request形狀裡新增任何"membership tier"欄位。

---

## 7. Gemini Future Activation Boundary

### 未來的Flow（規格原文架構）

```
Structured Health Insight（TASK1.112既有Integration鏈路產出
  的{healthObservation, behaviorPattern, recommendation,
  progressTrend}結構化結果）
  ↓
Gemini Enhancement（規劃中的未來銜接點，本次任務不建立）
  ↓
Explanation（使用者說明，規劃中，本次任務不建立）
```

### 確認：Gemini不會取代既有鏈路

**明確確認（規格要求）**：延續TASK1.106/1.107/1.108/1.109/
1.110已經反覆確認、本次任務重新確認依然成立的結論——Gemini
**不會取代**Product Entry/Contract/Adapter/Execution/
Operational（既有五個Product Boundary依然負責它們既有的
職責）、**不會取代**Health Insight
Feature（TASK1.111的轉換/mapping邏輯依然由既有程式碼負責）、
**不會取代**Capability Orchestrator/Analysis/Recommendation
Capability（依然產生結構化資料）、**不會取代**Runtime。**活化
邊界角度的具體確認**：未來Gemini Enhancement的**觸發時機**
必須是在`integration.requestProductEntry()`**成功回傳**
之後（即已經拿到`{ok:true, result:{healthObservation,
...}}`），**不能**提前介入鏈路中間任何一個階段——這個時序
限制，是"Gemini不取代既有架構"這個原則在活化流程角度的具體
體現。

---

## 8. Error Experience Boundary

延續TASK1.112第10節Error boundary已經端對端驗證過的既有失敗
分類，本次任務從"使用者體驗"角度重新分類成四種使用者可見的
錯誤情境：

### User-Facing Error Categories（規格原文列出的四類）

- **Missing data（缺少資料）**：對應Product Entry/Contract
  層的`invalid_raw_input`/`invalid_options`——使用者可能忘記
  填寫必要欄位，延續TASK1.107第3節Required vs Optional Data
  Boundary的既有定義。
- **Invalid input（無效輸入）**：對應Analysis
  Capability層的`missing_field`（例如`rawInput`缺少`user`
  欄位）——延續TASK1.112端對端測試已經發現的既有行為，這類
  錯誤代表`rawInput`的**形狀**合法但**內容**不完整。
- **Unavailable intelligence（智慧服務不可用）**：對應
  `capability_orchestrator_unavailable`/
  `analysis_runner_unavailable`/
  `recommendation_runner_unavailable`這類依賴缺失錯誤——延續
  TASK1.111/1.112已確認的既有reason命名。
- **Temporary failure（暫時性失敗）**：對應
  `capability_execution_failed`/`internal_error`這類例外
  攔截後的通用錯誤碼——延續TASK1.100/1.101/1.111已確認的
  "不暴露原始例外訊息，用通用錯誤碼取代"既有原則。

### User Message跟Internal Error Detail的分離

延續TASK1.109第11節UX Error Handling
Direction已經規劃的分離原則，本次任務重新確認：**User
Message（使用者訊息）**應該是簡短、不帶技術細節的提示（例如
"請確認資料已完整填寫"），**Internal Error Detail（內部錯誤
細節）**是`{ok:false, boundary:'product-entry', reason,
field?, stage?}`這個既有結構化失敗形狀本身——延續TASK1.112
第10節已經逐一驗證過的"所有失敗情境的結果都不含stack
trace/例外訊息"既有保證，這個結構化失敗形狀本身已經是安全的，
未來的Product Feature/UI層只需要把`reason`對應到預先定義好的
使用者訊息字串（**本次任務不定義**這個對應表，那是UI落地
任務的範圍）。

---

## 9. Future UI/API Preparation

### 未來的整合方向（規格原文架構）

延續TASK1.112第4節Activation Flow跟TASK1.110第8節API/Route
Integration Preparation已規劃的方向，本次任務重新確認：

```
未來的Route/Controller（規劃中，本次任務不建立）
  ↓
未來的Product Feature（規劃中，本次任務不建立）
  ↓
Product Entry（TASK1.99既有）
  ↓
Health Insight Integration（TASK1.112既有）
```

### 明確的範圍限制（規格原文要求）

**本次任務不建立**任何route、controller、frontend
元件——上面的Flow純粹是規劃層級的未來整合方向，用來確認"未來
如果要接上真實的使用者介面，應該在哪個層級銜接"：未來的
Route/Controller會負責解析HTTP
Request，未來的Product Feature會負責把使用者的具體動作（見
第2節三個情境）轉換成`rawInput`，這兩層都會呼叫
`integration.requestProductEntry()`（TASK1.112既有介面，
**不需要任何修改**）——這正是TASK1.112組合根設計的價值：
未來的UI/API落地工作完全不需要碰觸Health Insight
Integration鏈路本身，只需要在它前面加上"把使用者動作/HTTP
Request轉換成Product Request"這一層轉換。

---

## Restrictions Confirmation（限制確認）

本次任務嚴格遵守規格明確列出的禁止清單：

- ❌ 沒有實作任何UI、frontend程式碼、CSS。
- ❌ 沒有建立任何route、controller、API endpoint。
- ❌ 沒有修改authentication、OAuth、session相關程式碼。
- ❌ 沒有修改database schema/migrations。
- ❌ 沒有呼叫任何Gemini API/AI Provider、沒有建立任何Prompt
  Logic、沒有引入任何AI SDK。
- ❌ 沒有修改worker.js、Phase 2 Runtime、Phase 3 Application
  Layer、Phase 4 Capability Architecture、既有五個Product
  Boundary（Entry/Contract/Adapter/Execution/Operational）。

本次任務**唯一**的產出是這份文件本身跟對應的測試套件。

---

## Completion Criteria 確認

✅ User activation boundary defined——見第1節Product
Activation Goal跟第4節Activation Flow。

✅ User scenarios defined——見第2節User Scenario
Definition，三個具體情境（First Health Assessment/Daily
Health Update/Progress Review）各自的User Action/Required
Input/Expected Output明確。

✅ Request mapping defined——見第3節Product Request Contract
Mapping，Required/Optional欄位跟五層驗證責任明確。

✅ Product value flow defined——見第5節User Value
Delivery，四類輸出各自的價值主張跟V1誠實邊界明確。

✅ Premium boundary defined——見第6節Free/Premium Activation
Boundary。

✅ Gemini boundary defined——見第7節Gemini Future Activation
Boundary，明確確認Gemini不取代既有鏈路且有明確的觸發時機
限制。

✅ Existing architecture preserved——本次任務沒有修改任何
Product Boundary/Health Insight Feature/Integration/
Capability/Runtime檔案。

✅ AI Provider not enabled——本次任務沒有呼叫任何AI
SDK、沒有建立Prompt Logic。

✅ No Database change——本地與遠端D1所有domain table維持0筆。
