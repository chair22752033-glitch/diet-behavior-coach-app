# Phase 4 Intelligence Decision Flow Architecture Plan（TASK1.81）

## 目的

本文件是**TASK1.81 Intelligence Decision Flow Architecture
Planning**的規劃結論——本次任務**不是**導入AI、**不是**建立
Decision Model/Decision Algorithm、**不是**新增User Feature，目的
是在TASK1.75~1.80建立的Phase 4 Capability Architecture（Analysis
Capability、Recommendation Capability、Capability Orchestrator、
Feature Intelligence Integration、Consolidation Review）基礎上，
先定義未來Intelligence Decision Flow的**責任邊界**，再讓未來的
實作任務（本次不執行）依照這裡定義的邊界落地。

驗證方式見`backups/phase4-task1.81-decision-planning/
test_decision_flow_architecture.mjs`——本次沒有新增/修改任何既有
production程式碼，測試內容以確認：(1) 既有Phase 4 Capability
Architecture維持不變且完整、(2) 本文件描述的Decision Boundary/AI
Extension Strategy/Security Boundary跟既有架構的既定慣例一致、
(3) 本次規劃沒有意外建立任何Decision相關的production程式碼。

---

## Decision Flow Goal

目前Phase 4的Intelligence Capability Flow止步於：

```
Feature → Capability Orchestrator → Analysis Capability → Recommendation Capability → Output
```

`Output`是Unified Capability Result（`{analysis, recommendation}`
nested結構，見TASK1.78/1.79），本身已經是結構化資料，但**還不是
「決定」**——Recommendation Result只是把Analysis Result裡既有的
欄位值/陣列長度原樣包成一筆一筆的`{type, value, source}`，沒有
「在多筆recommendation之間做選擇/排序/篩選」這一步。

Decision Flow的目標是在Recommendation之後，新增一個**Decision**
階段，負責回答「這一筆一筆的recommendation，最終要採取哪一個/
哪幾個」這個問題，把「這裡有哪些選項」（Recommendation的責任）跟
「該選哪一個」（Decision的責任）明確分開，讓Decision成為Intelligence
Output演進到「可以真正驅動行為」的下一步。

**本次任務不建立Decision Runner、不建立Decision Capability、不
建立任何Decision Algorithm**——這裡只定義完成後應該長什麼樣子，
供未來任務對照實作。

---

## Layer Responsibility（Decision Boundary，Planning Scope 1）

延續Analysis/Recommendation既有的責任切分慣例，Decision（未建立）
在架構上會是Analysis/Recommendation之後的第三個Runtime階段，跟
Recommendation之間的責任邊界如下：

```
Analysis Result
  ↓
Recommendation Result
  ↓
Decision Output（未建立）
```

| 階段 | 輸入 | 輸出 | 責任 |
|---|---|---|---|
| Analysis（TASK1.43，已存在） | Insight Context | `{status, insights, metadata}` | 把原始資料整理成結構化的洞察（insights），不做任何選擇/排序 |
| Recommendation（TASK1.44，已存在） | Analysis Result | `{status, recommendations, metadata}` | 把Analysis Result裡的欄位值轉成一筆一筆結構化的候選建議（recommendations），仍然不做「選誰」的判斷——每一筆recommendation都是平等並列的候選項 |
| Decision（未建立，規劃中） | Recommendation Result | `{status, decision, metadata}`（暫定形狀） | 在多筆recommendations之間做出**一個明確的選擇/排序**，回答「該採取哪一個」，本身**不執行**任何行為，只回傳「決定了什麼」 |

**責任切分原則**（比照Analysis/Recommendation Runner既有的
deterministic設計哲學，見`recommendation_runner.js`開頭的
JSDoc）：Decision Layer初期（本次規劃、未來實作的第一版）**必須**
維持跟Analysis/Recommendation Runner同樣的deterministic
性質——同樣的Recommendation Result輸入，任何時候呼叫都得到完全
相同的Decision Output，不做任何推論、分類、摘要，也不產生任何
自然語言。真正需要判斷力/不確定性處理的AI增強邏輯，是後續
Intelligence Enhancement任務的範圍，不是本次規劃、也不是Decision
Layer第一版實作的範圍。

**跟Capability Orchestrator的關係**：比照TASK1.78 Capability
Orchestrator的模式，未來若要讓Decision加入Capability層級的組合
鏈路，會是在`capability_orchestrator.js`的
`requestCapabilityFlow()`裡，在Recommendation Capability成功之後
再多一步呼叫Decision Capability（暫定名稱），把
Recommendation Capability回傳的`result`包成
`{recommendationResult}`轉交給Decision
Capability——這條路徑目前**不存在**，本次規劃不修改
`capability_orchestrator.js`，只在文件裡記錄未來可能的擴充方式。

---

## Intelligence Output Evolution（Planning Scope 2）

| | 目前（TASK1.43~1.80已完成） | 未來（規劃方向，未建立） |
|---|---|---|
| 輸出階段 | Analysis、Recommendation | Decision、Action |
| Analysis | 產生結構化insights | （不變） |
| Recommendation | 產生結構化recommendations（候選項並列） | （不變） |
| Decision（新） | 不存在 | 在recommendations之間做選擇/排序，產生單一或排序過的Decision Output |
| Action（新） | 不存在 | 把Decision Output轉換成「可以被執行的具體行為」（例如觸發通知、更新使用者狀態）——這是比Decision更下游的階段，本次規劃只提及其存在與大致定位，不展開設計，因為要先有Decision才有討論Action責任邊界的基礎 |

擴充方向排序：先有Decision（本次規劃的重點），Decision穩定之後
才輪到規劃Action——這是刻意的分階段順序，避免同時規劃兩個都還
沒有Runtime基礎的新階段，重蹈「一次做太多」的風險。

---

## Data Flow

規劃中（未建立）的完整資料流：

```
Insight Context
  ↓
Analysis Runner（TASK1.43，已存在，完全不修改）
  ↓ Analysis Result {status, insights, metadata}
Recommendation Runner（TASK1.44，已存在，完全不修改）
  ↓ Recommendation Result {status, recommendations, metadata}
Decision Runner（規劃中，未建立）
  ↓ Decision Output {status, decision, metadata}（暫定形狀，
    比照Analysis/Recommendation Result Builder同樣的
    {status, <主要資料欄位>, metadata}三欄位慣例）
```

對應到Phase 4 Capability層（規劃中，未建立）：

```
Feature
  ↓
Capability Orchestrator（TASK1.78，未來擴充）
  ↓
Analysis Capability（TASK1.76，已存在，完全不修改）
  ↓
Recommendation Capability（TASK1.77，已存在，完全不修改）
  ↓
Decision Capability（規劃中，未建立）
  ↓
Output（Unified Capability Result，未來形狀擴充為
  {analysis, recommendation, decision}）
```

**本次審查確認**：這條規劃中的資料流跟目前已存在的
Feature→Capability Orchestrator→Analysis Capability→
Recommendation Capability→Output資料流**完全相容**——現有資料流
不需要被打破或重新設計，Decision只是在既有鏈路尾端**追加**一個
階段，不需要修改前面任何一段的輸入/輸出形狀。

---

## AI Extension Strategy（Planning Scope 3）

延續TASK1.75 Phase 4 Capability Architecture Plan
（`./PHASE4_CAPABILITY_PLAN.md`）已經確認的AI Extension
Point設計原則，未來AI合法可以進入的位置：

- **Analysis modules**（`analysis_runner.js`的
  `dependencies.modules`，已存在，TASK1.75/1.76/1.80已多次驗證）
- **Recommendation modules**（`recommendation_runner.js`的
  `dependencies.modules`，已存在，TASK1.75/1.77/1.80已多次驗證）
- **Decision modules**（規劃中，**未建立**）——比照前兩者同樣的
  模式，未來的Decision Runner應該提供
  `dependencies.modules`（或同樣語意的注入點），讓AI增強邏輯以
  「其中一個可替換的決策模組」的身分注入，而不是讓Decision
  Runner本身、或更上游的Decision Capability/Capability
  Orchestrator/Feature直接寫死AI呼叫邏輯。

**明確禁止（規格原文，延續TASK1.75~1.80一致的邊界）**：
`Feature → AI Provider`這條捷徑——不論是現有的Insight/Behavior/
Intelligence Feature，或未來任何新增的Feature，都不允許繞過
Runtime層的modules延伸點，直接在Feature層呼叫AI SDK。這條規則對
Decision Layer同樣適用：未來即使Decision Runner本身支援AI
modules，Feature/Capability Orchestrator/Decision
Capability都不應該知道「AI」是什麼，只知道「呼叫Decision
Runner，取得Decision Output」。

**本次規劃沒有建立任何modules**——`analysis_runner.js`/
`recommendation_runner.js`本次完全沒有被修改，Decision
Runner本身也完全不存在，這一節純粹是文件層級的方向記錄。

---

## Security Boundary（Planning Scope 4）

Decision Layer（未建立）未來實作時，必須遵守跟現有Analysis
Capability/Recommendation Capability/Capability
Orchestrator/Feature Integration完全一致的安全邊界（延續
TASK1.76~1.80已經確立、並在TASK1.80 Consolidation
Review逐一驗證過的既定規則）：

- ❌ 不得直接操作 **database**（不import`src/db/`，不接受db
  參數）
- ❌ 不得直接操作 **auth**（不import`src/auth/`、`src/oauth/`、
  `src/identity/`、`src/middleware/`，不接受userId/session
  相關參數）
- ❌ 不得直接操作 **session**（同上）
- ❌ 不得直接操作Execution Manager/History Store/Metrics
  Store/Event Dispatcher（延續Capability層既有邊界）
- ❌ 不得呼叫任何AI Provider/AI SDK、不得建立Prompt Logic（延續
  上一節AI Extension Strategy的邊界）

這些邊界目前**沒有任何程式碼需要遵守**（因為Decision Layer尚未
建立），本節純粹是把既有的安全邊界原則預先寫入規劃文件，確保
未來實作Decision Layer的任務有明確依據可循，不需要重新討論這些
已經在Phase 4其他四層反覆驗證過的規則。

---

## Known Limitations

1. **Decision Runner/Decision Capability完全不存在**——本次任務
   明確禁止建立Decision Algorithm/Decision Model，這份文件只是
   規劃，沒有對應的production程式碼。
2. **Decision Output的確切形狀尚未定案**——文件裡的
   `{status, decision, metadata}`是比照Analysis/Recommendation
   Result既有慣例推導出的暫定形狀，實際實作時（未來任務）可能
   需要根據「decision要包含單一選擇還是排序過的清單」等細節
   調整，本次規劃不做最終決定。
3. **Action階段只是提及，沒有展開設計**——見Intelligence Output
   Evolution一節，Action的責任邊界需要等Decision穩定後才能
   合理規劃，本次任務刻意不展開。
4. **Capability Orchestrator的擴充方式尚未實作**——文件裡描述的
   「未來在`requestCapabilityFlow()`裡多一步呼叫Decision
   Capability」只是規劃中的方向，`capability_orchestrator.js`
   本次完全沒有被修改，實際的Contract變化（例如是否需要新增
   `stage:'decision'`失敗標記，比照現有'analysis'|'recommendation'
   兩種stage）留給未來實作任務決定。
5. **async限制延續**——延續TASK1.75規劃文件已記錄的Known
   Limitation：Analysis/Recommendation Runner目前都是同步函式，
   Decision Runner若比照設計，第一版也會是同步函式；若未來
   Decision modules需要非同步AI呼叫，會跟Analysis/Recommendation
   modules面臨同樣的async遷移問題，這是整條鏈路（不只Decision）
   共同的架構限制。

---

## Completion Criteria 確認

✅ Decision Flow Boundary明確——Analysis Result→Recommendation
Result→Decision Output的責任切分、跟Capability Orchestrator的
未來擴充方式、跟現有資料流的相容性，都已在本文件記錄。

✅ Capability Architecture保持——TASK1.76~1.80建立的四層Phase 4
Capability（Analysis/Recommendation Capability、Capability
Orchestrator、Feature Integration）本次審查確認完全沒有被修改。

✅ AI Provider未啟用——本次規劃沒有呼叫任何AI SDK、沒有建立
Prompt Logic，`wrangler.toml`/`package.json`/`.env`皆無AI相關
新增。

✅ Runtime Boundary保持——Analysis Runner/Recommendation
Runner/Phase 2 Runtime Orchestrator本次完全沒有被修改。

✅ Application Pattern保持——Phase 3 Application
Pattern（Feature→Workflow→Capability→Use Case→Application
Service→Runtime）本次完全沒有被修改。

✅ 無Database改變——本次任務完全是文件跟測試，本地與遠端D1所有
domain table維持0筆。
