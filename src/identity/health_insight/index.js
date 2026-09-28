/*
 * Phase 6 TASK 1.118｜Health Insight User Identity Foundation
 * - 統一輸出入口
 *
 * 把 src/identity/health_insight/ 底下所有可對外使用的東西集中
 * 在這裡re-export，跟整個系列既有的"統一輸出入口"慣例一致。
 *
 * 目前沒有任何route/controller/worker.js import這個目錄——這是
 * 純粹的Foundation extension point，本次任務明確禁止把這裡接進
 * 任何真實的Health Insight request流程，見`README.md`
 * "Current Limitations"說明。
 */
export { ANONYMOUS_IDENTITY, buildUserIdentity, isValidUserIdentity } from './user_identity.js';
export { resolveHealthInsightIdentity } from './resolve_identity.js';
export { attachIdentityToOptions, buildHealthInsightProductRequest } from './request_context.js';
export { createMembershipPlaceholder, resolveFeaturePermission } from './membership_placeholder.js';
