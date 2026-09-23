/*
 * Phase 1 TASK 1.23｜Environment Configuration
 *
 * 集中整理 Worker env 裡跟「基礎設施 binding」有關的資訊（D1/KV/R2），
 * 讓未來其他層不需要各自散落地寫 `env.DIET_COACH_DB`、`env.SYNC_KV`、
 * `env.DIET_COACH_IMAGES`，而是統一透過 getEnvConfig(env) 取得。
 *
 * 這裡完全不含機密資訊（secret），binding 本身（D1/KV/R2 物件）不是
 * secret，只是 Cloudflare 平台注入的資源控制代碼；真正的機密（OAuth
 * client secret 等）在 auth_config.js 處理。
 */

function describeBinding(bindingName, bindingValue) {
  const present = !!bindingValue;
  return {
    bindingName,
    present,
    binding: present ? bindingValue : null,
    missingReason: present ? null : `env.${bindingName} 不存在，請確認 wrangler.toml 是否已設定此 binding`,
  };
}

/**
 * @param {object} env - Worker 的 env 物件
 * @returns {{environment:string, database:object, kv:object, r2:object}}
 */
export function getEnvConfig(env) {
  if (!env) {
    throw new Error('getEnvConfig(env)：env 不可為空');
  }

  return {
    environment: env.ENVIRONMENT || 'unknown',
    database: describeBinding('DIET_COACH_DB', env.DIET_COACH_DB),
    kv: describeBinding('SYNC_KV', env.SYNC_KV),
    r2: describeBinding('DIET_COACH_IMAGES', env.DIET_COACH_IMAGES),
  };
}
