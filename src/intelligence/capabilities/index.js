/*
 * Phase 4 TASK 1.76｜Analysis Capability Execution Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/index.js 同樣的角色：把
 * src/intelligence/capabilities/ 底下所有可對外使用的東西集中在
 * 這裡re-export。這是Phase 4新增的頂層目錄，跟Phase 3既有的
 * src/intelligence/application/capabilities/（Application
 * Capability，包裝Use Case Layer）是完全不同的東西——這裡放的是
 * 直接包裝Runtime層（Analysis Runner/Recommendation Runner）的
 * Intelligence Capability。
 *
 * 原本只有`analysis`一個子namespace（TASK1.76建立），TASK1.77
 * 新增平行的`recommendation`子namespace（`createRecommendationCapability({recommendationRunner})`，
 * 包裝Recommendation Runner），兩者互不import、互不認識。TASK1.78
 * 新增第三個子namespace`orchestration`
 * （`createCapabilityOrchestrator({analysisCapability, recommendationCapability})`）——
 * 跟前兩者不同的是，這個新namespace不是再包裝一個新的Runtime
 * Runner，而是把`analysis`跟`recommendation`這兩個Capability實例
 * 組合成一條完整的Intelligence Capability Flow，是Capability層級
 * 的協調邊界，不是又一個平行的Runner包裝。未來若有其他Runtime層
 * Capability或協調邊界，會以同樣的模式繼續新增平行的nested子目錄
 * 跟re-export一行。
 */
export * as analysis from './analysis/index.js';
export * as recommendation from './recommendation/index.js';
export * as orchestration from './orchestration/index.js';
