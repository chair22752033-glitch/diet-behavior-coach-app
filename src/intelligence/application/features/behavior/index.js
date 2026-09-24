/*
 * Phase 3 TASK 1.72｜Behavior Feature Foundation
 * - 統一輸出入口
 *
 * 跟 src/intelligence/application/features/insight/index.js 同樣的
 * 角色：把 src/intelligence/application/features/behavior/ 底下
 * 所有可對外使用的東西集中在這裡re-export。
 *
 * 目前沒有任何 controller/route/worker.js import 這個目錄——這是
 * 純粹的Phase 3 extension point（見src/bootstrap/application.js的
 * `intelligence.behaviorFeature`），也還沒有任何真實的User
 * Application呼叫它，本次任務明確禁止新增任何API route。
 */
export { createBehaviorFeature } from './behavior_feature.js';
export { createBehaviorUseCase, createBehaviorCapability } from './behavior_capability.js';
export { createBehaviorResultMapper } from './behavior_result_mapper.js';
