/*
 * Phase 1 TASK 1.8｜Content Seed 產生腳本
 *
 * 用途：唯讀方式從 src/worker.js 的 getHTML() 取出現有的 NUTRI_DATA（67項營養素）
 * 與 SCEN_DATA（14個情境），轉換成 D1 的 nutrients / scenarios 資料表 seed SQL。
 *
 * 限制遵守：
 * - 只讀取 src/worker.js，完全不修改該檔案
 * - 不建立/呼叫任何 API endpoint
 * - 不寫入使用者資料，只搬「靜態內容」（營養素/情境本來就是寫死在程式碼裡的參考資料，非使用者個資）
 * - 產生的是 migration SQL 檔案，不會自動套用到任何資料庫；套用與否由後續指令另外執行
 *
 * 執行方式：node scripts/seed_content_from_worker.js > migrations/0002_phase1_task1_8_seed_content.sql
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WORKER_PATH = path.join(__dirname, '..', 'src', 'worker.js');

function loadWorkerData() {
  const code = fs.readFileSync(WORKER_PATH, 'utf8');
  const sandbox = { addEventListener: function () {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'worker.js' });
  const html = sandbox.getHTML();
  const s1 = html.indexOf('<script>');
  const s2 = html.indexOf('</script>', s1);
  const script = html.slice(s1 + 8, s2);
  sandbox.document = { addEventListener: function () {}, getElementById: function () { return null; } };
  sandbox.window = sandbox;
  try { vm.runInContext(script, sandbox, { filename: 'client.js' }); } catch (e) { /* 忽略 DOMContentLoaded 之後的執行期錯誤，NUTRI_DATA/SCEN_DATA 在此之前已宣告完成 */ }
  if (!sandbox.NUTRI_DATA || !sandbox.SCEN_DATA) {
    throw new Error('未能從 src/worker.js 取得 NUTRI_DATA 或 SCEN_DATA，請確認來源檔案結構是否變動');
  }
  return { NUTRI_DATA: sandbox.NUTRI_DATA, SCEN_DATA: sandbox.SCEN_DATA };
}

function sqlStr(v) {
  if (v === undefined || v === null) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function buildNutrientRows(NUTRI_DATA) {
  const rows = [];
  for (const category of Object.keys(NUTRI_DATA)) {
    const list = NUTRI_DATA[category];
    list.forEach((item, idx) => {
      const id = category + '_' + String(idx + 1).padStart(2, '0');
      rows.push({
        id,
        category,
        name: item.name,
        unit: null,
        description: item.role || null,
        data_json: JSON.stringify(item),
      });
    });
  }
  return rows;
}

function buildScenarioRows(SCEN_DATA) {
  return SCEN_DATA.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.sys,
    data_json: JSON.stringify(s),
  }));
}

function main() {
  const { NUTRI_DATA, SCEN_DATA } = loadWorkerData();
  const nutrientRows = buildNutrientRows(NUTRI_DATA);
  const scenarioRows = buildScenarioRows(SCEN_DATA);

  const lines = [];
  lines.push("-- Migration number: 0002 \t" + new Date().toISOString());
  lines.push('-- Phase 1 TASK 1.8｜Content Seed：把 src/worker.js 內建的 NUTRI_DATA / SCEN_DATA 靜態內容匯入 D1');
  lines.push('-- 範圍：只新增參考內容資料（非使用者個資），不涉及任何使用者資料遷移，App 仍完全讀取 src/worker.js 內建常數，不受影響。');
  lines.push('-- 本檔案由 scripts/seed_content_from_worker.js 自動產生，請勿手動編輯（如需調整請修改產生腳本後重新產生）。');
  lines.push('');
  lines.push('-- ============================================================');
  lines.push('-- nutrients：' + nutrientRows.length + ' 筆');
  lines.push('-- ============================================================');
  for (const r of nutrientRows) {
    lines.push(
      'INSERT INTO nutrients (id, category, name, unit, description, data_json) VALUES (' +
        [sqlStr(r.id), sqlStr(r.category), sqlStr(r.name), sqlStr(r.unit), sqlStr(r.description), sqlStr(r.data_json)].join(', ') +
        ') ON CONFLICT(id) DO UPDATE SET category=excluded.category, name=excluded.name, unit=excluded.unit, description=excluded.description, data_json=excluded.data_json;'
    );
  }
  lines.push('');
  lines.push('-- ============================================================');
  lines.push('-- scenarios：' + scenarioRows.length + ' 筆');
  lines.push('-- ============================================================');
  for (const r of scenarioRows) {
    lines.push(
      'INSERT INTO scenarios (id, title, category, data_json) VALUES (' +
        [sqlStr(r.id), sqlStr(r.title), sqlStr(r.category), sqlStr(r.data_json)].join(', ') +
        ') ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, data_json=excluded.data_json;'
    );
  }
  lines.push('');

  process.stdout.write(lines.join('\n'));

  process.stderr.write('nutrients: ' + nutrientRows.length + ' 筆, scenarios: ' + scenarioRows.length + ' 筆\n');
}

main();
