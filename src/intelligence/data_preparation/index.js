/*
 * Phase 1 TASK 1.41｜Intelligence Data Preparation Layer
 * - 統一輸出入口
 *
 * 跟 src/intelligence/index.js 同樣的角色：把
 * src/intelligence/data_preparation/ 底下所有可對外使用的東西集中在
 * 這裡re-export，並額外組合出 createDataPreparationService()——把
 * Context Builder 跟 Data Normalizer 串成單一入口，對應規格圖：
 *
 *   Domain Services
 *     ↓
 *   Context Builder（蒐集原始資料）
 *     ↓
 *   Data Normalizer（轉成穩定格式，不解讀、不產生建議）
 *     ↓
 *   （這裡組合成單一 prepare()）
 *
 * 目前沒有任何 controller/route import 這個目錄——這是純粹的Phase 2
 * extension point（見 src/bootstrap/application.js 的
 * `intelligence.dataPreparation`），也沒有被 insight_service.js
 * 呼叫（TASK1.40既有的insight_service.js本次完全不修改）。
 */
import { createContextBuilder } from './context_builder.js';
import { createDataNormalizer } from './data_normalizer.js';

export { createContextBuilder } from './context_builder.js';
export { createDataNormalizer } from './data_normalizer.js';

/**
 * @returns {{
 *   buildContext: (db:object, userId:string, options?:object) => Promise<object>,
 *   normalize: (context:object) => object,
 *   prepare: (db:object, userId:string, options?:object) => Promise<{ok:boolean, context?:object, reason?:string, error?:string}>
 * }}
 */
export function createDataPreparationService() {
  const contextBuilder = createContextBuilder();
  const dataNormalizer = createDataNormalizer();

  /**
   * buildContext() + normalize() 合併成單一呼叫：先從既有Domain
   * Service蒐集原始資料，成功時才進一步做normalize()轉換；任何一步
   * 失敗都直接回傳失敗結果，不會用未normalize的原始資料頂替。
   *
   * @param {object} db
   * @param {string} userId
   * @param {object} [options]
   * @returns {Promise<{ok:boolean, context?:object, reason?:string, error?:string}>}
   */
  async function prepare(db, userId, options) {
    const contextResult = await contextBuilder.buildContext(db, userId, options);
    if (!contextResult.ok) {
      return contextResult;
    }
    return { ok: true, context: dataNormalizer.normalize(contextResult.context) };
  }

  return {
    buildContext: contextBuilder.buildContext,
    normalize: dataNormalizer.normalize,
    prepare,
  };
}
