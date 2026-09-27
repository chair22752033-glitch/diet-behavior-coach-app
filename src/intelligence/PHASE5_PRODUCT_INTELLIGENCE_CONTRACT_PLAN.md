# Phase 5 Product Intelligence Application Contract Foundation（TASK1.94）

## 目的

在TASK1.90/1.91/1.92/1.93建立的Product Integration/Entry/
Adapter/Feature Flow規劃基礎上，定義Product Feature跟Intelligence
Integration之間**穩定的Contract邊界**——本次任務**不是**實作HTTP
路由、**不是**導入AI，是Architecture Foundation任務，把TASK1.93
七層Flow裡"Product Feature"跟"Product Entry"之間**新增一層**
明確的Contract定義，**不實作**任何實際的Contract程式碼。

跟TASK1.90/1.91/1.92/1.93的差異：
- TASK1.90規劃四層責任邊界整體方向。
- TASK1.91聚焦Product Entry（HTTP↔Intelligence概念轉換）。
- TASK1.92聚焦Intelligence Adapter（純轉換層）。
- TASK1.93把User Scenario/Product Feature接上，形成完整七層
  Flow，並定義Request/Response/Error三種Lifecycle。
- 本次任務（TASK1.94）在Product Feature跟Product Entry之間
  **新增一層契約邊界**——"Product Intelligence
  Contract"，明確定義Product Feature呼叫Intelligence
  能力時，**輸入/輸出/錯誤的介面規範本身**（不是資料的實際
  轉換邏輯，那是Entry/Adapter的職責），並且首次引入"版本相容性"
  這個規劃維度，確保未來Contract演進時不會破壞既有的Product
  Feature。

完整的規格目標Flow：

```
Product Feature
  ↓
Product Intelligence Contract（本次任務新增定義）
  ↓
Product Entry
  ↓
Intelligence Adapter
  ↓
Intelligence Feature
  ↓
Capability Layer
  ↓
Runtime Layer
```

完整的規劃/落地/審查任務序列（跨Phase）：

```
Phase 1 Foundation（TASK1.1~1.39）
Phase 2 Intelligence Runtime Foundation（TASK1.40~1.58）
Phase 3 Intelligence Application Layer（TASK1.59~1.74）
Phase 4 Intelligence Capability Architecture（TASK1.75~1.89）
Phase 5 Product Integration
  TASK1.90 Product Integration Architecture Planning（規劃）
  TASK1.91 Intelligence Product Entry Boundary Foundation（規劃）
  TASK1.92 Intelligence Product Adapter Architecture Foundation（規劃）
  TASK1.93 Product Intelligence Feature Flow Architecture Planning（規劃）
  TASK1.94 Product Intelligence Application Contract Foundation（這裡，規劃）
```

驗證方式見`backups/phase5-task1.94-product-contract/
test_product_intelligence_contract.mjs`。

---

## Contract Boundary

### Product Feature → Intelligence Contract

"Product Intelligence Contract"是Product Feature跟下游整條
Intelligence Chain之間的**介面規範**——它不是一段轉換邏輯（那是
Adapter的職責，TASK1.92已規劃），而是"Product Feature可以依賴
什麼、不可以依賴什麼"的**穩定承諾**。這層Contract的存在，讓
Product Feature的開發者不需要知道Entry/Adapter/Feature/
Capability/Runtime內部任何一層如何運作，只需要知道這份Contract
文件裡承諾的介面形狀。

### Responsibility（職責）

- 定義Product Feature呼叫Intelligence能力時，**輸入**必須符合
  的形狀（Request Contract）。
- 定義Product Feature會收到的**輸出**形狀（Response Contract）。
- 定義Product Feature需要處理的**錯誤**分類（Error Contract）。
- 定義這份Contract未來**如何演進**而不破壞既有呼叫端（Version
  Compatibility）。

Contract**不負責**任何實際的資料轉換、驗證邏輯執行、或HTTP
處理——這些依然分別歸屬Adapter（TASK1.92）、Entry/Feature/
Capability層（既有）、Entry（TASK1.91）。Contract是一份**規範
文件**（規劃上，未來可能對應到一個型別定義檔案，例如
TypeScript的`.d.ts`或JSON Schema，但本次任務不建立任何這樣的
檔案）。

### Ownership（歸屬）

- **Product Intelligence Contract本身**歸屬Phase 5規劃系列
  （本文件），不歸屬任何單一Product Feature——這是刻意的
  設計，讓多個未來的Product Feature可以共用同一份Contract，
  不需要每個Feature各自重新定義一套介面規範。
- **Contract裡引用的形狀**（`{context, options?}`、`{ok,
  feature, data}`等）歸屬既有的Feature Intelligence
  Integration/Capability Orchestrator既有定義——Contract
  **不得**重新定義這些既有形狀，只能原樣引用並在此基礎上規劃
  Product層要暴露的子集或轉換規則。

### Compatibility（相容性，跟既有架構的關係）

本次任務定義的Contract**完全建立在**既有的Phase 4/TASK1.79
形狀之上，不新增任何實際欄位、不修改任何既有介面——這是
"Contract"這個詞在本次任務裡的意義：**把已經存在、但分散在
TASK1.79/TASK1.91/TASK1.92/TASK1.93多份文件裡的介面約定，統一
收斂成一份正式命名的規範文件**，本身不引入新的技術決策。

---

## Request Contract

### Required Fields（必要欄位）

規劃上，Product Feature呼叫Intelligence Contract時，**必須**
提供：

```js
{
  context: { /* Insight Context，見TASK1.42既有定義，必要 */ }
}
```

`context`是唯一的必要欄位——這跟Feature Intelligence
Integration既有的`requestIntelligence({context, options?})`
要求完全一致（TASK1.79），Contract**沒有**額外要求任何Product
層自訂的必要欄位。

### Optional Fields（選填欄位）

```js
{
  options: { /* 選填，見TASK1.78/1.79既有定義 */ }
}
```

`options`是唯一規劃中的選填欄位，同樣直接沿用既有Capability
Orchestrator的既有定義（TASK1.78），Contract不新增任何選填
欄位。

### Validation Responsibility（驗證責任，延續並收斂TASK1.91/1.92/1.93已規劃的分工）

Contract本身**不執行**任何驗證——它只是**宣告**"這裡有哪些
欄位、誰負責驗證"，實際驗證動作依然發生在下游各層：

| 驗證項目 | 執行層級（Contract只是宣告，不執行） |
|---|---|
| HTTP層級形狀 | Product Entry（TASK1.91） |
| Product資料轉換正確性 | Intelligence Adapter（TASK1.92） |
| `{context, options?}`形狀本身 | Capability Orchestrator既有驗證 |
| Insight Context內容合法性 | Analysis Capability/Analysis Runner既有驗證 |

### Version Strategy（版本策略，Request這一段）

Request Contract目前定為**v1**——`context`必要、`options`
選填，這個形狀直接繼承自TASK1.79建立時的既有形狀，沒有獨立於
既有架構之外的版本演進歷史。未來若要新增選填欄位（例如未來
Decision相關的選項），規劃上遵循下方Version
Compatibility章節的"只新增選填欄位"原則。

---

## Response Contract

### Exposed Fields（暴露欄位，延續並收斂TASK1.91/1.92/1.93已規劃的內容）

```js
{
  ok: true,
  data: {
    analysis: { /* 原樣暴露 */ },
    recommendation: { /* 原樣暴露 */ },
    decision: { /* 選填，只在提供decisionCapability時出現 */ }
  }
}
```

`analysis`/`recommendation`兩欄位**保證存在**（只要`ok:
true`）；`decision`欄位**不保證存在**——這是Contract對Product
Feature的明確承諾：Product Feature的程式碼**必須**用選填/
存在性檢查的方式讀取`decision`欄位，不能假設它一定存在。

### Hidden Fields（隱藏欄位，延續TASK1.92/1.93已規劃的過濾點）

Contract**明確排除**以下欄位，Product Feature**不應該**依賴
它們的存在（即使實際執行時，中間層目前尚未真的過濾掉）：

- `feature: 'intelligence'`——Feature層內部標籤。
- `capability: 'orchestration'`——Capability Orchestrator內部
  標籤。
- `decision.status: 'decision_not_available'`——Decision
  Capability佔位形狀的內部狀態字串。

**重要說明**：目前（本次任務結束時）這些欄位**依然會**出現在
真實的Feature Intelligence Integration回傳結果裡——因為
Adapter層（TASK1.92規劃的過濾邏輯）**尚未落地**。Contract在
此刻先行"宣告"這些欄位是"不應該依賴"的，是為了讓未來
Adapter真正落地、開始過濾這些欄位時，遵守本Contract撰寫的
Product Feature程式碼不會因此breaking。

### Compatibility Strategy（相容性策略）

- 目前Contract的Response形狀**恰好等同**Feature Intelligence
  Integration的既有回傳形狀（因為Adapter尚未落地，沒有實際的
  轉換發生）——這是刻意的過渡期設計：Contract先"畫出未來的
  界線"，即使現在界線內外看起來一樣。
- 未來Adapter落地、開始過濾Hidden Fields時，遵守本Contract的
  Product Feature**不受影響**（因為它們一開始就不應該讀取這些
  欄位）；沒有遵守Contract、直接讀取了`feature`/`capability`
  等內部欄位的Product Feature，屆時會遭遇breaking change——
  這是Contract存在的核心價值：提前告知邊界，避免未來的
  破壞性影響。

---

## Error Contract

延續並收斂TASK1.93已規劃的五階段Error Lifecycle（Product
Error→Entry Error→Adapter Error→Capability Error→Runtime
Error），本次任務把它收斂成Product Feature**實際需要處理**的
四種錯誤類型（規格原文用詞）：

### Product Error

Product Feature自己的業務邏輯錯誤（例如權限檢查失敗）——
**不屬於**Intelligence Contract的範圍，Contract不定義這一類
錯誤的形狀，因為它完全是Product層自己的責任。

### Adapter Error

延續TASK1.93新增定義的Adapter Error分類——Product資料轉換
Insight Context失敗。Contract規劃上承諾這類錯誤會被轉換成跟
Intelligence Error**相同的錯誤形狀**（見下方），讓Product
Feature不需要分辨"是Adapter轉換失敗還是Capability驗證失敗"，
只需要處理統一的失敗形狀。

### Intelligence Error

Feature Intelligence Integration/Capability Orchestrator既有
的失敗形狀（TASK1.78/1.79/1.86）：

```js
{
  ok: false,
  reason: string,     // 例如'invalid_context'、'analysis_capability_unavailable'
  field?: string,
  stage?: string       // 'analysis'|'recommendation'|'decision'
}
```

Contract**承諾**這個形狀的頂層key（`ok`、`reason`）永遠存在，
`field`/`stage`是選填的——Product Feature應該用選填檢查方式
讀取這兩個欄位。

### Runtime Error

Analysis/Recommendation Runner內部若拋出未預期例外——Contract
承諾Product Feature**永遠不會**直接看到原始例外（stack
trace、內部訊息），這類錯誤規劃上會被降級成跟Intelligence
Error相同形狀的一個特定`reason`值（例如`'internal_error'`），
延續TASK1.92/1.93已規劃的隔離策略。

### 四種錯誤的Contract總結

Product Feature最終**只需要處理兩種**Contract層級的失敗
形狀：自己拋出的Product Error（規劃上不透過Intelligence
Contract回傳，是Product Feature自己的try/catch或業務判斷）跟
統一的`{ok:false, reason, field?, stage?}`形狀（涵蓋Adapter/
Intelligence/Runtime三類，一律轉換成這個形狀）——這是本次任務
Error Contract章節相對於TASK1.93五階段Lifecycle的**簡化與
收斂**：Lifecycle描述的是"錯誤怎麼流動"，Contract描述的是
"Product Feature最終看到什麼"。

---

## Version Strategy

### Contract Evolution（Contract演進原則）

- Contract的版本演進**只能新增**選填欄位（Request的`options`
  底下、Response的`data`底下），**不得**移除既有欄位、**不得**
  把選填欄位改成必要欄位、**不得**改變既有欄位的型別或語意。
- 任何違反上述原則的變動，規劃上視為"Breaking
  Change"，需要一個新的Contract版本號（例如v2），並且v1/v2
  應該可以並存一段時間，讓既有Product Feature有時間遷移。

### Backward Compatibility（向後相容）

- 延續TASK1.78/1.86已建立的Backward Compatibility保證：
  `decisionCapability`選填注入不影響既有只用
  `analysis`/`recommendation`兩欄位的Product Feature。
- Contract層級的向後相容策略，本質上是把這個既有的Capability
  層Backward Compatibility保證，原樣傳遞給Product層——只要
  Product Feature遵守"用選填檢查方式讀取`decision`欄位"這條
  Contract規則，未來Capability層的任何合法擴充都不會破壞它。

### Future Extension Strategy（未來擴充策略）

- 若未來要新增更多Intelligence能力（例如TASK1.89規劃的
  Intelligence Enhancement方向新增的modules），規劃上這些擴充
  應該反映在既有欄位**內容**的豐富化（例如`analysis.insights`
  陣列裡出現新的`type`值），而不是Contract**形狀**本身的變動——
  這樣可以在不驚動Contract版本號的前提下持續擴充Intelligence
  能力。
- 若未來要支援AI（延續TASK1.89 AI Integration
  Timing的判斷），規劃上AI產生的內容應該落在既有`decision`
  欄位內部（結構化內容，延續TASK1.87 Decision Output
  Evolution的規劃方向），而不是在Contract上新增一個獨立的
  `aiResult`欄位——維持"Product Feature不需要知道AI是什麼"的
  既有邊界（延續整個Phase 4/Phase 5系列反覆確認的AI Extension
  Point設計）。

---

## Phase 5 Roadmap

### 已完成（TASK1.90~1.94累積規劃）

- Product Integration整體方向（TASK1.90）。
- Product Entry Boundary（TASK1.91）。
- Intelligence Adapter Boundary（TASK1.92）。
- 完整七層Feature Flow跟三種Lifecycle（TASK1.93）。
- Product Intelligence Contract跟版本策略（TASK1.94，這裡）。

### 尚未落地（留給未來任務）

1. 實際建立Product Entry/Intelligence Adapter/Contract定義檔的
   程式碼（目前完全不存在）。
2. 在`src/bootstrap/application.js`新增對應欄位。
3. 建立`errorCode`到HTTP status code的完整對照表。
4. 選擇第一個真實User Scenario/Product Feature落地案例，驗證
   本文件定義的Contract在真實情境下是否需要調整。
5. 決定Contract是否要用具體的型別系統（TypeScript `.d.ts`、
   JSON Schema等）落地，或維持純文件約定的形式。

### Known Limitations

見下方獨立章節。

---

## Known Limitations

1. **本次任務完全沒有建立任何Contract定義檔案**——`src/`底下
   沒有新增任何`.d.ts`、JSON Schema、或其他型別定義檔案，本次
   任務純粹是文件層級的規範。
2. **沒有變更任何既有production程式碼**——Phase 1~4建立的所有
   既有程式碼、TASK1.90/1.91/1.92/1.93規劃的文件，本次任務
   完全沒有修改。
3. **Hidden Fields目前依然會出現在真實回傳結果裡**——因為
   Adapter層尚未落地，本文件Response Contract章節描述的過濾
   規則目前純屬規劃，Contract先行宣告邊界，等Adapter真正落地
   後才會真的產生行為上的差異。
4. **Contract版本號目前只有v1，沒有實際的版本切換機制**——
   Version Strategy章節描述的是原則，不是實作，本次任務沒有
   建立任何版本協商或路由機制。
5. **Contract跟TASK1.84 Decision Contract結論的關係**——本次
   任務的"Product Intelligence
   Contract"是Product層跟Intelligence層之間的介面規範，跟
   TASK1.84評估的"Decision Request/Response
   Contract"（Capability內部Decision這一段是否需要獨立Contract
   Layer）是**不同層級**的概念，兩者不衝突——TASK1.84的階段性
   結論（"目前不需要"）依然成立，本次任務不改變它。
6. **async限制延續**——延續TASK1.75~1.93已記錄的Known
   Limitation：目前所有Capability都是同步函式，Contract本身
   沒有規定同步或非同步，這個決定留給Entry層落地時處理。

---

## Completion Criteria 確認

✅ Product Intelligence Contract defined——Product Feature跟
Intelligence Chain之間的職責、歸屬、相容性關係已在Contract
Boundary章節明確記錄。

✅ Request contract defined——必要/選填欄位、驗證責任分工表、
版本策略已記錄。

✅ Response contract defined——暴露/隱藏欄位、相容性策略已
記錄，明確說明Hidden Fields目前依然會出現、是為了未來Adapter
落地做準備。

✅ Error contract defined——四種錯誤類型（Product/Adapter/
Intelligence/Runtime）跟收斂後Product Feature實際需要處理的
兩種形狀已記錄。

✅ Version strategy defined——Contract Evolution原則、
Backward Compatibility保證來源、Future Extension
Strategy（Intelligence Enhancement跟未來AI能力各自的擴充方向）
已記錄。

✅ AI Provider not enabled——本次規劃沒有呼叫任何AI SDK、沒有
建立Prompt Logic。

✅ Runtime Boundary preserved——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Capability Architecture preserved——Phase 4整條Capability
Chain本次完全沒有被修改。

✅ No Database change——本地與遠端D1所有domain table維持0筆。
