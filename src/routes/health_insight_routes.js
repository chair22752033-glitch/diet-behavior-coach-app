/*
 * Phase 6 TASK 1.116｜Health Insight Product Activation Implementation
 * （TASK1.117後更新：POST /api/health-insight新增UI
 * Renderer轉接步驟，見下方"TASK1.117更新"區塊；TASK1.119後更新：
 * POST /api/health-insight新增身份解析步驟，見下方"TASK1.119
 * 更新"區塊；TASK1.120後更新：POST /api/health-insight新增
 * persistence步驟，見下方"TASK1.120更新"區塊；TASK1.121後更新：
 * POST /api/health-insight新增Gemini Enhancement步驟，見下方
 * "TASK1.121更新"區塊；TASK1.122後更新：POST /api/health-insight
 * 新增Premium Feature Permission Check，見下方"TASK1.122更新"
 * 區塊）
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
 * ## TASK1.119更新：POST /api/health-insight新增身份解析步驟
 *
 * 延續規格目標架構"User → Existing Authentication/Session
 * System → resolve_identity() → Health Insight Request
 * Context → Health Insight Controller"，這裡在呼叫controller
 * 之前，先呼叫TASK1.118既有的`resolveHealthInsightIdentity()`
 * （重用既有session/使用者驗證系統，不建立新的），把解析出來的
 * 身份物件當作`dependencies.identity`傳給controller。**兩條
 * 路由依然都不掛`requireAuth()`**——沒有cookie/session過期/
 * 使用者被停權時，`resolveHealthInsightIdentity()`安全回傳
 * `ANONYMOUS_IDENTITY`，不會擋下request，延續"Anonymous users
 * MUST continue working"的明確要求。這是這條路由第一次讀取真正
 * 的Cookie標頭——對應`src/worker.js`新增的一行`cookieHeader`
 * 轉發（見該檔案TASK1.119區塊）。
 *
 * 安全/邊界考量：
 * - 兩條路由都**不**要求登入（不掛`requireAuth()`）——Health
 *   Insight Product Integration本身明確設計成不接受db/不接受
 *   auth依賴（延續TASK1.112檔案頭已確認的邊界），Input
 *   Experience只收集使用者當下填寫的輪廓答案，不讀取/不寫入
 *   任何既有使用者資料表，延續本次任務"D1 domain tables維持
 *   0筆"的驗證要求。TASK1.119新增的身份解析是**選填的加值**，
 *   不是登入門檻——即使`resolveHealthInsightIdentity()`本身會
 *   讀取session/使用者資料表，讀取的目的只是"認出這是誰"，
 *   讀不到/讀取失敗都不影響request繼續進行。
 * - GET /health-insight直接回傳真正的`Response`物件（HTML
 *   document，`Content-Type: text/html`）——延續
 *   `src/routes/router.js`"handler若回傳真正的Response就原樣
 *   透傳，不會被makeResponse()硬轉成JSON"的既有機制（TASK1.26
 *   起就存在，這裡是第一次在auth/legacy路由之外用到）。
 * - POST /api/health-insight回傳既有的`{ok,data}`物件，交給
 *   Router既有的makeResponse()包成JSON回應，跟其餘API路由一致。
 *
 * ## TASK1.120更新：POST /api/health-insight新增persistence步驟
 *
 * 延續規格目標架構"Successful Result → Persistence Service → UI
 * Response"，這裡在組出`html`之後、回傳response之前，額外呼叫
 * 一次TASK1.120新增的`saveHealthInsightRecord()`（見
 * `src/persistence/health_insight/`），把這次成功的結構化
 * Product Response存成一筆`health_insight_records`歷史紀錄——
 * 只有已登入使用者（`identity.authenticated`）才會真的寫入，
 * 匿名使用者/Health Insight本身失敗時這個函式會安全跳過（回傳
 * `{ok:false, reason}`，不拋出例外）。**這裡完全不檢查/不使用
 * 這個呼叫的回傳值**——儲存成功或失敗都不影響接下來回傳給
 * 使用者的`{ok:true, data:{html}}`，這是規格明確要求的"Failure
 * to save must NOT break the user's Health Insight experience"
 * 在route層的具體落地。
 *
 * ## TASK1.121更新：POST /api/health-insight新增Gemini Enhancement步驟
 *
 * 延續規格目標架構"Health Insight Result → Gemini Enhancement
 * Layer → Enhanced Explanation → User Presentation"，這裡在
 * `saveHealthInsightRecord()`之後、回傳response之前，額外呼叫
 * 一次TASK1.121新增的`enhanceHealthInsightResult()`（見
 * `src/intelligence/enhancement/gemini/`），嘗試把這次的結構化
 * Product Response改寫成一段更口語化的說明文字。**Gemini不是
 * 智慧來源**——只有在Gemini增強成功時，才把`enhancedExplanation`
 * 加進回應的`data`裡（`{html, enhancedExplanation}`）；沒有設定
 * `GEMINI_API_KEY`、Gemini API呼叫失敗、或任何其他原因導致增強
 * 失敗時，`data`維持跟TASK1.120之前完全相同的`{html}`形狀——這是
 * 規格明確要求的"Gemini failure must NOT break Health Insight"
 * 在route層的具體落地，使用者永遠拿得到原本算好的Health Insight
 * 結果。這個呼叫**不會**影響`saveHealthInsightRecord()`存進D1的
 * 內容（Persistence Service持續只存原始`structuredResponse`）。
 *
 * ## TASK1.122更新：POST /api/health-insight新增Premium Feature Permission Check
 *
 * 延續規格目標架構"Identity → Membership Resolver → Feature
 * Permission Check → Gemini Enhancement"，這裡在
 * `saveHealthInsightRecord()`之後、呼叫`enhanceHealthInsightResult()`
 * 之前，插入一次TASK1.122新增的`canUseFeature(identity,
 * 'gemini_enhancement', req.options)`（見`src/membership/`）權限
 * 判斷——只有回傳`true`才會呼叫Gemini Enhancement，回傳`false`時
 * **完全不會呼叫Gemini**（連API都不會打），直接回傳跟TASK1.121
 * 之前完全相同的`{html}`形狀。**Permission邏輯完全不活在Gemini
 * 程式碼裡**——`src/intelligence/enhancement/gemini/`底下的
 * `gemini_client.js`/`gemini_provider.js`/`gemini_enhancer.js`
 * 三個檔案完全沒有被這次任務修改。`req.options`延續TASK1.13B/
 * 1.29起既有的「單一請求層級選填覆寫」慣例，原樣轉發給
 * `canUseFeature()`——`src/worker.js`真正的HTTP dispatch永遠只會
 * 傳空物件，所以目前沒有任何真實使用者能通過這個權限檢查（見
 * `src/membership/README.md`"Future Payment Compatibility"）。
 */
import { getHealthInsightPageController, submitHealthInsightController } from '../controllers/health_insight_controller.js';
import { getHealthInsightClientScript, renderHealthInsightProductResponse } from '../ui/health_insight/index.js';
import { resolveHealthInsightIdentity } from '../identity/health_insight/index.js';
import { saveHealthInsightRecord } from '../persistence/health_insight/index.js';
import { enhanceHealthInsightResult } from '../intelligence/enhancement/gemini/index.js';
import { canUseFeature } from '../membership/index.js';

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
    const identity = await resolveHealthInsightIdentity(ctx.db, req.cookieHeader, {});
    const structuredResponse = submitHealthInsightController(req.payload, { identity });
    const html = renderHealthInsightProductResponse(structuredResponse);
    await saveHealthInsightRecord(ctx.db, { identity, payload: req.payload, structuredResponse });
    const data = { html };
    if (canUseFeature(identity, 'gemini_enhancement', req.options)) {
      const enhancement = await enhanceHealthInsightResult(structuredResponse, { env: ctx.env });
      if (enhancement && enhancement.ok) {
        data.enhancedExplanation = enhancement.enhancedExplanation;
      }
    }
    return { ok: true, data };
  });
}
