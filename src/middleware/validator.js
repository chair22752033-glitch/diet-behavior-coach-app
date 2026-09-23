/*
 * Phase 1 TASK 1.27｜Request Schema Validator
 *
 * validateBody(schema, data) 提供最基本的 request body schema 驗證：
 * 每個欄位可以標記 {required, type}，本次只需要「架構」，不需要支援
 * 巢狀物件、陣列元素型別等進階規則——那些留給實際有 route 需要驗證時
 * 再依需求擴充。這裡完全不知道任何具體業務欄位長什麼樣，schema 一律
 * 由呼叫端（未來的route/controller）提供。
 */

/**
 * @param {object} schema - {[field]: {required?:boolean, type?:string}}
 * @param {object} data - 要驗證的資料（例如 request body 解析後的物件）
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateBody(schema, data) {
  schema = schema || {};
  data = data && typeof data === 'object' ? data : {};
  const errors = [];

  for (const field of Object.keys(schema)) {
    const rule = schema[field] || {};
    const value = data[field];
    const missing = value === undefined || value === null;

    if (rule.required && missing) {
      errors.push(`${field} is required`);
      continue;
    }
    if (!missing && rule.type && typeof value !== rule.type) {
      errors.push(`${field} must be of type ${rule.type}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
