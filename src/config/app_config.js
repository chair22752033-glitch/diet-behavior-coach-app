/*
 * Phase 1 TASK 1.23｜App Configuration
 *
 * 集中管理應用層級的設定：目前的 environment 名稱、版本號、以及
 * 預留的 feature flags。本次所有 feature flag 預設值都是 false——
 * 這正確反映現況：D1/Auth/Legacy Import 全部還是「已建好但沒有接上」
 * 的基礎架構，不代表任何功能已經上線。
 */

const DEFAULT_FEATURES = {
  d1Enabled: false,
  authEnabled: false,
  legacyImportEnabled: false,
};

const DEFAULT_VERSION = '1.0.0-phase1';

function toBool(value) {
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}

function readFeatureOverrides(env) {
  const overrides = {};
  if (typeof env.FEATURE_D1_ENABLED !== 'undefined') {
    overrides.d1Enabled = toBool(env.FEATURE_D1_ENABLED);
  }
  if (typeof env.FEATURE_AUTH_ENABLED !== 'undefined') {
    overrides.authEnabled = toBool(env.FEATURE_AUTH_ENABLED);
  }
  if (typeof env.FEATURE_LEGACY_IMPORT_ENABLED !== 'undefined') {
    overrides.legacyImportEnabled = toBool(env.FEATURE_LEGACY_IMPORT_ENABLED);
  }
  return overrides;
}

/**
 * @param {object} env - Worker 的 env 物件
 * @returns {{features:object, environment:string, version:string}}
 */
export function getAppConfig(env) {
  if (!env) {
    throw new Error('getAppConfig(env)：env 不可為空');
  }

  return {
    environment: env.ENVIRONMENT || 'unknown',
    version: env.APP_VERSION || DEFAULT_VERSION,
    features: Object.assign({}, DEFAULT_FEATURES, readFeatureOverrides(env)),
  };
}
