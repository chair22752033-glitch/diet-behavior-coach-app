/*
 * Phase 6 TASK 1.116｜Health Insight Product Activation Implementation
 * （TASK1.117後更新：POST /api/health-insight新增UI
 * Renderer轉接步驟，見下方"TASK1.117更新"區塊）
 * - Health Insight Routes
 *
 * 建立 GET /health-insight（Input Experience頁面）與
 * POST /api/health-insight（送出答案、取得結果）兩條路由的
 * mapping——這是Health Insight產品線第一次有真正掛在
 * app.router上的route。
 *
 * 延續 src/routes/dashboard_routes.js 等既有route檔案的既定分工：
 * route層只負責「從Router補好的context取出controller需要的
 * 參數、呼叫controller、把結果轉成Response」，完全不直接呼叫
 * db/Health Insight Integration本身（那是controller的責任，見
 * src/controllers/health_insight_controller.js）。
 *
 * ## TASK1.117更新：POST /api/health-insight新增UI Renderer轉接
 *
 * TASK1.117把`submitHealthInsightController()`的回傳值從HTML
 * 改成結構化Product Response（`{ok, data}`/`{ok:false,
 * error}`，見`health_insight_controller.js`/
 * `health_insight_response_builder.js`檔案頭說明）。既有的
 * `POST /api/health-insight` JSON回應外部形狀（`{ok:true,
 * data:{html}}`）完全沒有改變（延續"Existing POST
 * /api/health-insight behavior remains working"的完成標準）——
 * route層現在多做一步：把controller回傳的結構化回應，交給
 * `renderHealthInsightProductResponse()`（TASK1.117新增的UI
 * Renderer連接點）轉成HTML，再包成跟TASK1.116完全相同的
 * `{ok:true, data:{html}}`形狀回傳。`GET /health-insight`完全
 * 沒有被這次更新影響（Input Experience頁面本身不涉及Product
 * Response）。
 *
 * 安全/邊界考量：
 * - 兩條路由都**不**要求登入（不掛`requireAuth()`）——Health
 *   Insight Product Integration本身明確設計成不接受db/不接受
 *   auth依賴（延續TASK1.112檔案頭已確認的邊界），Input
 *   Experience只收集使用者當下填寫的輪廓答案，不讀取/不寫入
 *   任何既有使用者資料表，延續本次任務"D1 domain tables維持
 *   0筆"的驗證要求。
 * - GET /health-insight直接回傳真正的`Response`物件（HTML
 *   document，`Content-Type: text/html`）——延續
 *   `src/routes/router.js`"handler若回傳真正的Response就原樣
 *   透傳，不會被makeResponse()硬轉成JSON"的既有機制（TASK1.26
 *   起就存在，這裡是第一次在auth/legacy路由之外用到）。
 * - POST /api/health-insight回傳既有的`{ok,data}`物件，交給
 *   Router既有的makeResponse()包成JSON回應，跟其餘API路由一致。
 */
import { getHealthInsightPageController, submitHealthInsightController } from '../controllers/health_insight_controller.js';
import { getHealthInsightClientScript, renderHealthInsightProductResponse } from '../ui/health_insight/index.js';

/**
 * 組裝Input Experience的完整HTML document——`bodyHtml`是
 * controller已經組裝好的Input Experience片段（含自己的
 * `<style>`），這裡只負責補上`<!DOCTYPE html>`/`<head>`/一個
 * 可以讓瀏覽器互動腳本操作的容器`#hi-app`，跟一個回到既有App
 * 首頁的最小連結（Health Insight是既有App"額外新增"的產品
 * 能力，不是取代既有首頁，延續本次任務"Do not replace existing
 * application pages"要求）。
 *
 * @param {string} bodyHtml
 * @returns {string}
 */
function buildHealthInsightPage(bodyHtml) {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-Hant">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>健康小洞察</title>',
    '</head>',
    '<body>',
    '<div style="padding:12px 20px;font-family:-apple-system,\'PingFang TC\',\'Microsoft JhengHei\',sans-serif;">',
    '<a href="/" style="color:#8A7A68;text-decoration:none;font-size:14px;">‹ 回到主頁</a>',
    '</div>',
    '<div id="hi-app">',
    bodyHtml,
    '</div>',
    `<script>${getHealthInsightClientScript()}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

export function registerHealthInsightRoutes(router) {
  router.add('GET', '/health-insight', async () => {
    const page = getHealthInsightPageController();
    return new Response(buildHealthInsightPage(page.data.html), {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  });

  router.add('POST', '/api/health-insight', async (ctx) => {
    const req = ctx.req || {};
    const structuredResponse = submitHealthInsightController(req.payload);
    const html = renderHealthInsightProductResponse(structuredResponse);
    return { ok: true, data: { html } };
  });
}
