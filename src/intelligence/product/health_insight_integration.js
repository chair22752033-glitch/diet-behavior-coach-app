/*
 * Phase 6 TASK 1.112｜Health Insight Product Integration
 * Foundation
 * - Health Insight Product Integration
 *
 * 責任：把TASK1.111建立的Health Insight
 * Feature，接進TASK1.99~1.103已經各自獨立存在、完全沒有互相
 * 接線的五個既有Product Boundary，組成第一條**完整的**Product
 * → Intelligence執行路徑。這個檔案本身**不**呼叫AI、**不**
 * 建立Prompt Logic、**不**新增任何業務邏輯——單純是**組合根
 * （Composition Root）**：把已經存在的元件，依照既有的依賴注入
 * 介面，組裝成一條可以從頭走到尾的鏈路。
 *
 * ## 為什麼這是"整合"而不是"新架構"（規格原文："The goal is
 * integration, not new architecture"）
 *
 * TASK1.99~1.103建立五個Product Boundary時，每一個都刻意留下
 * **選填**的依賴注入介面（`adapter`/`intelligenceFeature`），
 * 但**沒有**互相連接（延續系列反覆確認的"建立但不接線"模式）。
 * TASK1.111建立Health Insight Feature時，同樣**沒有**接上任何
 * Product Boundary。本次任務**不新增任何新的業務邏輯、不修改
 * 任何一個既有Boundary/Feature檔案**，只是把這些已經存在、
 * 介面完全相容的元件，用一個組合函式串起來——這正是
 * `src/bootstrap/application.js`在Application層級扮演的同一種
 * 角色（組合根），這裡是**Health Insight這條產品線專屬**的
 * 組合根，刻意跟`application.js`分開，不修改`application.js`
 * 本身（延續TASK1.104/1.105已確認的"Product Boundary不接進
 * bootstrap"既定結論，app.intelligence維持24個欄位不變）。
 *
 * ## 完整執行路徑（規格原文架構）
 *
 * ```
 * Product Request（{userId?, rawInput, options?}）
 *   ↓
 * Product Contract（TASK1.103，完全不修改）
 *   ↓
 * Product Entry（TASK1.99，完全不修改）
 *   ↓
 * Product Adapter（TASK1.100，完全不修改）
 *   ↓
 * Product Execution（TASK1.101，完全不修改）
 *   ↓
 * Product Operational（TASK1.102，完全不修改）
 *   ↓
 * Health Insight Feature（TASK1.111，完全不修改）
 *   ↓
 * Capability Orchestrator（TASK1.78，完全不修改）
 *   ↓
 * Analysis Capability（TASK1.76，完全不修改）
 *   ↓
 * Recommendation Capability（TASK1.77，完全不修改）
 *   ↓
 * Runtime（Phase 2，完全不修改）
 * ```
 *
 * 規格畫出的視覺順序把Contract放在Entry**之前**，但延續
 * TASK1.103既有文件已經確認的實際呼叫順序——Contract的介面跟
 * Adapter完全相同（`forwardProductRequest`），是Entry呼叫
 * 的**下一層**（取代原本應該呼叫真正Adapter的位置），Contract
 * 內部再呼叫真正的Adapter。所以實際組裝方向是：
 *
 * ```
 * entry = createProductEntry({ adapter: contract })
 * contract = createProductContract({ adapter: adapter })
 * adapter = createProductAdapter({ intelligenceFeature: execution })
 * execution = createProductExecution({ intelligenceFeature: operational })
 * operational = createProductOperational({ intelligenceFeature: healthInsightAdapter })
 * healthInsightAdapter.requestIntelligence(request) = healthInsightFeature.requestHealthInsight(request)
 * healthInsightFeature = createHealthInsightFeature({ capabilityOrchestrator })
 * ```
 *
 * 這條組裝順序跟TASK1.103文件本身記錄的"視覺Flow由外而內、
 * 實際呼叫方向Entry→Contract→Adapter"完全一致，本次任務沒有
 * 改變這個既定關係，只是第一次把Health Insight Feature放在
 * 這條鏈路最終端。
 *
 * ## 唯一需要的新程式碼：介面名稱轉接（Interface Name
 * Adapter）
 *
 * Product Execution/Product Operational既有的依賴注入介面
 * 叫`intelligenceFeature`，要求的方法名稱是`requestIntelligence
 * (request)`——這是TASK1.79 Intelligence Feature Integration
 * 建立時定下的既有慣例。Health Insight Feature
 * （TASK1.111）刻意選用了不同的方法名稱`requestHealthInsight`
 * （因為它是**Health Insight專屬**的Feature，不是通用的
 * Intelligence Feature）。這兩個方法的request/response
 * 形狀**完全相同**（`{context, options?}` →
 * `{ok, feature, data|reason}`），差異只在方法名稱跟`data`
 * 欄位的內容形狀——所以整合唯一需要新增的程式碼，就是一個
 * **純轉發、不改變任何語意**的名稱轉接函式
 * `createHealthInsightIntelligenceAdapter()`，把
 * `requestIntelligence`方法名稱轉接到
 * `healthInsightFeature.requestHealthInsight`。這**不是**
 * 重新實作Adapter Boundary的職責（TASK1.100既有的Product
 * Adapter完全沒有被修改，這裡只是介面命名層級的轉接，不做
 * 任何request/response內容轉換），也**不是**新增抽象層
 * （只是一個單一函式，沒有新增任何class/新的資料形狀）。
 *
 * ## Architecture Rules確認（規格原文逐條列出，本次整合完全
 * 沒有違反）
 *
 * - **Product Entry**：依然只負責接收/驗證/轉交（完全沒有被
 *   修改，也沒有被要求知道Analysis/Recommendation
 *   Capability——它注入的`adapter`依賴是Contract，Contract
 *   注入的`adapter`依賴才是真正的Adapter，Entry從頭到尾只認識
 *   `adapter`這個抽象介面，不知道底層實際是Health Insight）
 * - **Adapter**：依然只負責request/feature request/response
 *   轉換（完全沒有被修改，不含任何health/analysis邏輯，它注入
 *   的`intelligenceFeature`依賴是Execution，同樣不知道底層
 *   實際是Health Insight）
 * - **Execution**：依然只負責lifecycle管理/execution
 *   state（完全沒有被修改，不產生任何insight內容，只是原樣
 *   轉發`data`欄位）
 * - **Operational**：依然只負責observation
 *   metadata/safe monitoring（完全沒有被修改，`extractVersion`/
 *   `extractResultCounts`嘗試讀取的是`data.analysis`/
 *   `data.recommendation.recommendations`這類既有Intelligence
 *   Feature形狀，Health Insight的`data`形狀完全不同
 *   （`data.recommendation`是陣列，不是有`.recommendations`
 *   屬性的物件），這兩個函式讀取不到預期形狀時安全地回傳
 *   `undefined`，**不會**、也**不能**意外記錄到userId/健康
 *   資料/insight內容/recommendation內容——這正是規格要求的
 *   "Operational must NOT record userId/health data/insight
 *   content/recommendation content"在真實資料流下的具體驗證，
 *   本次任務用測試逐一確認這個既有安全特性在Health Insight
 *   資料流下依然成立）
 * - **Health Insight Feature**：依然只負責Product-specific
 *   transformation/capability consumption/output
 *   mapping（完全沒有被修改，不存取database/authentication/
 *   session）
 *
 * ## Dependency Injection（規格原文要求）
 *
 * `createHealthInsightProductIntegration(dependencies)`
 * 的**每一層**都是選填依賴注入——呼叫端可以在任何一層傳入自己
 * 的替身（stub/mock/真實實例），沒有提供時才用預設的真實
 * factory函式建立。這個檔案本身：
 * - ❌ 不建立任何global singleton（每次呼叫
 *   `createHealthInsightProductIntegration()`都建立全新的一組
 *   實例，沒有模組級的共享狀態）
 * - ❌ 不接受/不建立任何database依賴（完全不import
 *   `src/db/`，也不接受db參數）
 * - ❌ 不接受/不建立任何authentication依賴（完全不import
 *   `src/auth/`、`src/oauth/`、`src/identity/`、
 *   `src/middleware/`）
 *
 * ## 本次任務沒有做的事（延續"Do NOT create unnecessary
 * abstraction"）
 *
 * - **沒有**把這條鏈路接進`src/bootstrap/application.js`
 *   （app.intelligence維持24個欄位、app.router.routes維持21個
 *   route，兩者完全不變）
 * - **沒有**建立任何route/controller/API endpoint
 * - **沒有**修改任何既有的五個Product
 *   Boundary/Health Insight Feature/Phase 4 Capability
 *   Chain/Phase 3 Application Layer/Phase 2 Runtime檔案
 * - **沒有**新增任何UI/frontend/CSS
 * - **沒有**新增任何獨立的目錄/index.js/README.md——這是單一
 *   檔案的組合根，不是新的Boundary，不需要比照既有Boundary的
 *   四檔案模式（實作+result_builder+index+README）
 */
import { createProductEntry } from './entry/index.js';
import { createProductContract } from './contract/index.js';
import { createProductAdapter } from './adapter/index.js';
import { createProductExecution } from './execution/index.js';
import { createProductOperational } from './operational/index.js';
import { createHealthInsightFeature } from './features/health_insight/index.js';
import { createCapabilityOrchestrator } from '../capabilities/orchestration/index.js';
import { createAnalysisCapability } from '../capabilities/analysis/index.js';
import { createRecommendationCapability } from '../capabilities/recommendation/index.js';
import { createAnalysisRunner } from '../analysis/index.js';
import { createRecommendationRunner } from '../recommendation/index.js';

/**
 * 純粹的方法名稱轉接——把Health Insight Feature的
 * `requestHealthInsight(request)`轉接成Product Execution/
 * Product Operational既有依賴注入介面要求的
 * `requestIntelligence(request)`方法名稱。不改變request/
 * response的內容，只是原樣轉發呼叫跟回傳值，這是唯一需要新增
 * 的整合程式碼（見上方檔案頭"介面名稱轉接"說明）。
 *
 * @param {{requestHealthInsight: (request:{context:object, options?:object}) => *}} healthInsightFeature
 * @returns {{requestIntelligence: (request:{context:object, options?:object}) => *}}
 */
export function createHealthInsightIntelligenceAdapter(healthInsightFeature) {
  return {
    requestIntelligence(request) {
      return healthInsightFeature.requestHealthInsight(request);
    },
  };
}

/**
 * 組合Product Contract → Product Entry → Product Adapter →
 * Product Execution → Product Operational → Health Insight
 * Feature → Capability Orchestrator → Analysis/Recommendation
 * Capability → Analysis/Recommendation Runner這一整條完整鏈路。
 * **每一層都是選填依賴注入**，沒有提供時才用預設的真實factory
 * 函式建立對應的既有元件——呼叫端可以在任何一層注入自己的
 * 替身（例如測試時注入會拋出例外的假Capability），驗證整條
 * 鏈路在各種失敗情境下的行為。
 *
 * @param {object} [dependencies]
 * @param {{requestAnalysis: Function}} [dependencies.analysisCapability] - 選填，預設用`createAnalysisCapability({analysisRunner})`建立
 * @param {{runAnalysis: Function}} [dependencies.analysisRunner] - 選填，預設用`createAnalysisRunner()`建立，只在沒有提供`analysisCapability`時使用
 * @param {{requestRecommendation: Function}} [dependencies.recommendationCapability] - 選填，預設用`createRecommendationCapability({recommendationRunner})`建立
 * @param {{runRecommendation: Function}} [dependencies.recommendationRunner] - 選填，預設用`createRecommendationRunner()`建立，只在沒有提供`recommendationCapability`時使用
 * @param {{requestCapabilityFlow: Function}} [dependencies.capabilityOrchestrator] - 選填，預設用`createCapabilityOrchestrator({analysisCapability, recommendationCapability})`建立
 * @param {{requestHealthInsight: Function}} [dependencies.healthInsightFeature] - 選填，預設用`createHealthInsightFeature({capabilityOrchestrator})`建立
 * @param {{requestIntelligence: Function}} [dependencies.operational] - 選填，預設用`createProductOperational({intelligenceFeature, observer, clock})`建立
 * @param {(metadata:object) => void} [dependencies.observer] - 選填，原樣轉交給Product Operational，只在沒有提供`operational`時使用
 * @param {() => number} [dependencies.clock] - 選填，原樣轉交給Product Operational，只在沒有提供`operational`時使用
 * @param {{requestIntelligence: Function}} [dependencies.execution] - 選填，預設用`createProductExecution({intelligenceFeature: operational})`建立
 * @param {{forwardProductRequest: Function}} [dependencies.adapter] - 選填，預設用`createProductAdapter({intelligenceFeature: execution})`建立
 * @param {{forwardProductRequest: Function}} [dependencies.contract] - 選填，預設用`createProductContract({adapter})`建立
 * @param {{requestProductEntry: Function}} [dependencies.entry] - 選填，預設用`createProductEntry({adapter: contract})`建立
 * @returns {{requestProductEntry: (request:{userId?:string, rawInput:object, options?:object}) => {ok:true, boundary:'product-entry', result:{healthObservation:Array, behaviorPattern:Array, recommendation:Array, progressTrend:object, decision:null}}|{ok:false, boundary:'product-entry', reason:string, field?:string, stage?:string}}}
 */
export function createHealthInsightProductIntegration(dependencies) {
  dependencies = dependencies || {};

  const analysisCapability = dependencies.analysisCapability
    || createAnalysisCapability({ analysisRunner: dependencies.analysisRunner || createAnalysisRunner() });

  const recommendationCapability = dependencies.recommendationCapability
    || createRecommendationCapability({ recommendationRunner: dependencies.recommendationRunner || createRecommendationRunner() });

  const capabilityOrchestrator = dependencies.capabilityOrchestrator
    || createCapabilityOrchestrator({ analysisCapability, recommendationCapability });

  const healthInsightFeature = dependencies.healthInsightFeature
    || createHealthInsightFeature({ capabilityOrchestrator });

  const operational = dependencies.operational
    || createProductOperational({
      intelligenceFeature: createHealthInsightIntelligenceAdapter(healthInsightFeature),
      observer: dependencies.observer,
      clock: dependencies.clock,
    });

  const execution = dependencies.execution
    || createProductExecution({ intelligenceFeature: operational });

  const adapter = dependencies.adapter
    || createProductAdapter({ intelligenceFeature: execution });

  const contract = dependencies.contract
    || createProductContract({ adapter });

  const entry = dependencies.entry
    || createProductEntry({ adapter: contract });

  return { requestProductEntry: entry.requestProductEntry };
}
