/*
 * Phase 6 TASK 1.116｜Health Insight Product Activation Implementation
 * - Client Interaction Script
 *
 * 責任：把TASK1.114/1.115建立的「純樣式、未綁定任何事件」UI
 * 元件，第一次接上真正的瀏覽器互動邏輯——延續README.md
 * Current Limitations第三點"沒有任何前端互動JS"，這是這個限制
 * 第一次被解除。
 *
 * ## 明確邊界
 *
 * 這個檔案回傳的是**純字串**（要被塞進`<script>`標籤的JS原始
 * 碼），本身不執行任何程式碼、不import任何瀏覽器API、不知道
 * Cloudflare Worker/HTTP是什麼——單純是字串組裝，延續
 * `src/ui/health_insight/`目錄"純函式、回傳字串"的既有慣例。
 *
 * 腳本本身只做四件事（不多不少，延續"Do NOT place intelligence
 * logic inside UI"既有邊界）：
 * - 收集使用者在Question Card上的選擇/輸入（純DOM事件監聽，不做
 *   任何驗證/推論——驗證留給後端既有的Product Entry/Contract/
 *   Health Insight Feature）
 * - 管理按鈕的loading/disabled視覺狀態
 * - 呼叫`POST /api/health-insight`（唯一的網路呼叫，body是純
 *   JSON，不含任何cookie/session邏輯）
 * - 把回傳的HTML片段（伺服器端已經用既有Health Insight UI元件
 *   組裝完成）塞進畫面——腳本本身完全不組裝任何Dashboard/
 *   Observation/Recommendation卡片的HTML內容，只有網路失敗時的
 *   最小防禦性錯誤卡片是例外（見`FALLBACK_ERROR_HTML`，樣式
 *   完全沿用既有`.hi-card.hi-error-card`既有class，不新增任何
 *   視覺語言）。
 */

const FALLBACK_ERROR_HTML = [
  '<section class="hi-dashboard hi-dashboard-error" data-hi-page="dashboard-error">',
  '<div class="hi-card hi-error-card hi-error-temporary_failure">',
  '<div class="hi-card-body">',
  '<div class="hi-card-label">好像出了一點小狀況</div>',
  '<div class="hi-card-explanation">不是你的問題，稍後再試一次應該就可以了</div>',
  '</div></div>',
  '<button type="button" class="hi-primary-button" data-hi-action="restart-input-experience">重新開始</button>',
  '</section>',
].join('');

const RESTART_BUTTON_HTML = [
  '<div class="hi-dashboard-section" data-hi-restart-container="1">',
  '<button type="button" class="hi-primary-button" data-hi-action="restart-input-experience">重新開始</button>',
  '</div>',
].join('');

/**
 * @returns {string} 要被塞進`<script>...</script>`裡的JS原始碼
 *   （不含`<script>`標籤本身，由呼叫端負責包裝）。
 */
export function getHealthInsightClientScript() {
  return `(function () {
  "use strict";
  var STATE = {};
  var FALLBACK_ERROR_HTML = ${JSON.stringify(FALLBACK_ERROR_HTML)};
  var RESTART_BUTTON_HTML = ${JSON.stringify(RESTART_BUTTON_HTML)};

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function attachChipHandlers() {
    qsa('.hi-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var field = chip.getAttribute('data-field');
        var value = chip.getAttribute('data-value');
        if (!field) return;
        STATE[field] = value;
        qsa('.hi-chip[data-field="' + field + '"]').forEach(function (sibling) {
          sibling.classList.remove('hi-chip--selected');
        });
        chip.classList.add('hi-chip--selected');
      });
    });
  }

  function attachInputHandlers() {
    qsa('.hi-friendly-input').forEach(function (input) {
      input.addEventListener('input', function () {
        var field = input.getAttribute('data-field');
        if (!field) return;
        var raw = input.value;
        if (raw === '') {
          delete STATE[field];
          return;
        }
        var num = Number(raw);
        STATE[field] = !isNaN(num) ? num : raw;
      });
    });
  }

  function setLoadingState(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    button.classList.toggle('hi-primary-button--loading', isLoading);
    if (isLoading) {
      button.setAttribute('data-hi-original-label', button.textContent);
      button.textContent = '整理中\\u2026';
    } else if (button.getAttribute('data-hi-original-label')) {
      button.textContent = button.getAttribute('data-hi-original-label');
      button.removeAttribute('data-hi-original-label');
    }
  }

  function attachRestartHandler(root) {
    qsa('[data-hi-action="restart-input-experience"]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.location.reload();
      });
    });
  }

  function renderResult(appEl, html) {
    appEl.innerHTML = html + RESTART_BUTTON_HTML;
    attachRestartHandler(appEl);
  }

  function renderFallback(appEl) {
    appEl.innerHTML = FALLBACK_ERROR_HTML;
    attachRestartHandler(appEl);
  }

  function attachSubmitHandler() {
    var button = document.querySelector('[data-hi-action="submit-input-experience"]');
    var appEl = document.getElementById('hi-app');
    if (!button || !appEl) return;
    button.addEventListener('click', function () {
      setLoadingState(button, true);
      fetch('/api/health-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(STATE)
      }).then(function (response) {
        return response.json();
      }).then(function (body) {
        if (body && body.ok && body.data && typeof body.data.html === 'string') {
          renderResult(appEl, body.data.html);
        } else {
          renderFallback(appEl);
        }
      }).catch(function () {
        renderFallback(appEl);
      });
    });
  }

  function init() {
    attachChipHandlers();
    attachInputHandlers();
    attachSubmitHandler();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`;
}

export { FALLBACK_ERROR_HTML, RESTART_BUTTON_HTML };
