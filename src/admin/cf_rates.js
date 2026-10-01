/*
 * Phase 9（後台強化）｜Cloudflare 公告費率常數 + 每月成本粗估。
 *
 * ⚠️ 這是「估計值」，不是你真正的帳單。真帳單請看 Cloudflare Dashboard。
 * ⚠️ 費率會變動：每次部署時應同步核對官方價目並更新下面的常數與 RATES_VERIFIED。
 *   來源：
 *     D1  pricing: https://developers.cloudflare.com/d1/platform/pricing/
 *     R2  pricing: https://developers.cloudflare.com/r2/pricing/
 *     Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
 *
 * 目前成本結構（本專案）：
 *   - 每使用者的資料是「純文字」存在 D1（很小）。
 *   - R2 只放「共用圖片」（固定、不隨使用者成長），目前在免費額度內 ≈ $0。
 *   - 尚未開放使用者上傳圖片；一旦開放，R2 才會按人成長（屆時要再估）。
 */

export const RATES_VERIFIED = '2026-10-01';

export const CF_RATES = Object.freeze({
  // Workers 付費方案基本月費（USD）
  workersPaidBaseUSD: 5,
  // D1 免費額度（每日）
  d1FreeRowsReadPerDay: 5000000,
  d1FreeRowsWrittenPerDay: 100000,
  // D1 付費方案「每月已含」
  d1PaidIncludedRowsReadPerMonth: 25000000000,
  d1PaidIncludedRowsWrittenPerMonth: 50000000,
  // D1 超額（USD）
  d1OverageReadPerMillionUSD: 0.001,
  d1OverageWrittenPerMillionUSD: 1,
  // D1 儲存：每月已含 5GB，超額 USD/GB-month
  d1IncludedStorageGB: 5,
  d1StoragePerGBMonthUSD: 0.75,
  // R2：每月免費 10GB-month，超額 USD/GB-month，無出口流量費
  r2FreeStorageGB: 10,
  r2StoragePerGBMonthUSD: 0.015,
});

/**
 * 以 30 天用量 + 粗略資料量，估算「每月」成本（USD）。純估計。
 * @param {object} i
 *   rowsRead30d / rowsWritten30d：usage_metrics 近 30 天加總
 *   d1StorageBytes：D1 資料粗估位元組（來自 row 數 × 平均大小）
 *   r2StorageBytes：R2 粗估位元組（目前共用圖，可傳 0 或實測）
 *   plan：'paid' | 'free'（擁有者已開 CF 信用卡通常是 paid）
 */
export function estimateMonthlyUSD(i) {
  const r = CF_RATES;
  const read30 = Math.max(0, Number(i.rowsRead30d) || 0);
  const written30 = Math.max(0, Number(i.rowsWritten30d) || 0);
  const plan = i.plan === 'free' ? 'free' : 'paid';
  const d1StorageGB = (Number(i.d1StorageBytes) || 0) / (1024 * 1024 * 1024);
  const r2StorageGB = (Number(i.r2StorageBytes) || 0) / (1024 * 1024 * 1024);

  const lines = [];
  let total = 0;

  if (plan === 'paid') {
    lines.push({ item: 'Workers 付費基本月費', usd: r.workersPaidBaseUSD });
    total += r.workersPaidBaseUSD;
    // D1 rows 超額（超過每月已含才算）
    const readOverM = Math.max(0, (read30 - r.d1PaidIncludedRowsReadPerMonth)) / 1000000;
    const writtenOverM = Math.max(0, (written30 - r.d1PaidIncludedRowsWrittenPerMonth)) / 1000000;
    const readCost = readOverM * r.d1OverageReadPerMillionUSD;
    const writtenCost = writtenOverM * r.d1OverageWrittenPerMillionUSD;
    lines.push({ item: 'D1 讀取超額', usd: round(readCost) });
    lines.push({ item: 'D1 寫入超額', usd: round(writtenCost) });
    total += readCost + writtenCost;
    // D1 儲存超額
    const storOverGB = Math.max(0, d1StorageGB - r.d1IncludedStorageGB);
    const storCost = storOverGB * r.d1StoragePerGBMonthUSD;
    lines.push({ item: 'D1 儲存超額', usd: round(storCost) });
    total += storCost;
  } else {
    lines.push({ item: 'Workers 免費方案', usd: 0 });
    // 免費方案超限會報錯而非計費；這裡只標示是否接近上限
  }
  // R2 儲存超額
  const r2OverGB = Math.max(0, r2StorageGB - r.r2FreeStorageGB);
  const r2Cost = r2OverGB * r.r2StoragePerGBMonthUSD;
  lines.push({ item: 'R2 儲存超額（目前共用圖，通常為 0）', usd: round(r2Cost) });
  total += r2Cost;

  return {
    verified: RATES_VERIFIED,
    plan,
    rowsRead30d: read30,
    rowsWritten30d: written30,
    d1StorageMB: round(d1StorageGB * 1024),
    r2StorageMB: round(r2StorageGB * 1024),
    freeDailyReadLimit: r.d1FreeRowsReadPerDay,
    freeDailyWriteLimit: r.d1FreeRowsWrittenPerDay,
    lines,
    estMonthlyUSD: round(total),
  };
}

function round(n) { return Math.round((Number(n) || 0) * 100) / 100; }
