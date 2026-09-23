/*
 * Phase 1 TASK 1.27｜Request Schema Validator（TASK1.28 起支援 contract validation）
 *
 * validateBody(schema, data) 提供最基本的 request body schema 驗證：
 * 每個欄位可以標記 {required, type}，本次只需要「架構」，不需要支援
 * 巢狀物件、陣列元素型別等進階規則——那些留給實際有 route 需要驗證時
 * 再依需求擴充。這裡完全不知道任何具體業務欄位長什麼樣，schema 一律
 * 由呼叫端（未來的route/controller）提供。
 *
 * TASK1.28：validateContract(contract, data) 是給
 * src/contracts/{auth_contract.js,user_contract.js}（TASK1.28）這種
 * `{request: <schema>, response: {...}}` 形狀的 contract 物件用的薄
 * 包裝，直接沿用 validateBody() 對 contract.request 做驗證——這是
 * 「route contract validation」的基礎能力，本次沒有接進任何實際 route
 * 的 middleware 清單（router.js 目前仍是空清單，見TASK1.27），只是把
 * 能力準備好。
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

/**
 * @param {{request?:object}} contract - 例如 src/contracts/auth_contract.js 匯出的物件
 * @param {object} data - 要驗證的資料（例如 request payload）
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateContract(contract, data) {
  const schema = (contract && contract.request) || {};
  return validateBody(schema, data);
}

/**
 * 把 validateContract() 包成 middleware pipeline（TASK1.27）可以使用的
 * (ctx, next) 形狀，驗證失敗時短路回傳 400，不呼叫 next()。目前沒有任何
 * route 把它加進 middleware 清單（見 router.js 的空清單），純粹是能力
 * 預留。
 *
 * @param {object} contract
 * @param {(ctx:object) => object} getData - 從 ctx 取出要驗證的資料，
 *   預設取 ctx.req.payload
 */
export function createContractValidationMiddleware(contract, getData) {
  const extractData = typeof getData === 'function' ? getData : (ctx) => ctx && ctx.req && ctx.req.payload;
  return async function contractValidationMiddleware(ctx, next) {
    const data = extractData(ctx);
    const result = validateContract(contract, data);
    if (!result.ok) {
      return { ok: false, reason: 'invalid_payload', status: 400, errors: result.errors };
    }
    return next(ctx);
  };
}
