# Intelligence Capability（Phase 4）

## 目的

`src/intelligence/capabilities/`是Phase 4新增的頂層目錄，存放
直接包裝Runtime層（Analysis Runner/Recommendation Runner等）的
Intelligence Capability——跟Phase 3既有的
`src/intelligence/application/capabilities/`（Application
Capability，包裝Use Case Layer）是完全不同架構位置、互不認識的
兩個東西，刻意分別放在不同目錄避免混淆。

## 子namespace

- `analysis/`（TASK1.76建立）：`createAnalysisCapability({analysisRunner})`，
  讓Application Feature（未來）可以透過明確的Capability邊界使用
  Analysis Framework（TASK1.43），詳見`./analysis/README.md`。
- `recommendation/`（TASK1.77建立）：`createRecommendationCapability({recommendationRunner})`，
  讓Application Feature（未來）可以透過明確的Capability邊界使用
  Recommendation Framework（TASK1.44），詳見
  `./recommendation/README.md`。跟`analysis/`是完全平行、互不
  import、互不認識的兩個Capability。

未來若有其他Runtime層Capability，會以同樣的模式繼續新增平行的
nested子目錄。

## 目前狀態

`src/intelligence/index.js`透過`export * as capabilities from
'./capabilities/index.js'`re-export這個目錄，純粹是Phase 4
extension point，目前沒有任何既有Feature/Workflow/Capability
（Phase 3 Application Layer）呼叫這裡的任何內容，也沒有接進
`src/bootstrap/application.js`。
