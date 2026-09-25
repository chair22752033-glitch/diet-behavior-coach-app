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
 * 目前只有`analysis`一個子namespace（TASK1.76建立），未來若有
 * Recommendation Capability或其他Runtime層Capability，會以同樣的
 * 模式新增平行的nested子目錄跟re-export一行。
 */
export * as analysis from './analysis/index.js';
