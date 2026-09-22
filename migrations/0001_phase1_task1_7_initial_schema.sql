-- Migration number: 0001 	 2026-09-22T14:49:49.012Z
-- Phase 1 TASK 1.7｜建立未來架構的 D1 資料表結構
-- 範圍：僅建立 schema（CREATE TABLE / CREATE INDEX），不寫入任何資料、不接入 src/worker.js、不建立登入系統。
-- 目標管線：User → Exploration Records → Food Events → Emotion Records → Behavior Patterns → Intervention History → AI Generated Reports

PRAGMA foreign_keys = ON;

-- ============================================================
-- users：使用者主表（訪客帳號與未來 OAuth 使用者共用一張表）
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT,
  auth_provider_id TEXT,
  display_name TEXT,
  is_guest INTEGER NOT NULL DEFAULT 1,
  legacy_sync_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_id
  ON users(auth_provider, auth_provider_id)
  WHERE auth_provider IS NOT NULL AND auth_provider_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_legacy_sync_code
  ON users(legacy_sync_code)
  WHERE legacy_sync_code IS NOT NULL;

-- ============================================================
-- images：圖片資產登記（涵蓋 QUEST 內建圖片與未來使用者上傳圖片，先於 food_events 建立以利外鍵參照）
-- ============================================================
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  r2_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  content_type TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_images_r2_key
  ON images(r2_key);

CREATE INDEX IF NOT EXISTS idx_images_user
  ON images(user_id);

-- ============================================================
-- exploration_records：探索紀錄（對應現有 QUEST 抽卡功能的未來資料層）
-- ============================================================
CREATE TABLE IF NOT EXISTS exploration_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draw_mode TEXT,
  card_category TEXT,
  card_object_key TEXT,
  card_text TEXT,
  photo_idx INTEGER,
  responses_json TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exploration_records_user
  ON exploration_records(user_id, occurred_at);

-- ============================================================
-- food_events：飲食事件
-- ============================================================
CREATE TABLE IF NOT EXISTS food_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meal_type TEXT,
  description TEXT,
  nutrients_json TEXT,
  image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_food_events_user
  ON food_events(user_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_food_events_image
  ON food_events(image_id);

-- ============================================================
-- emotion_records：情緒紀錄
-- ============================================================
CREATE TABLE IF NOT EXISTS emotion_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emotion_type TEXT,
  intensity INTEGER,
  trigger_note TEXT,
  linked_food_event_id INTEGER REFERENCES food_events(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emotion_records_user
  ON emotion_records(user_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_emotion_records_food_event
  ON emotion_records(linked_food_event_id);

-- ============================================================
-- behavior_patterns：行為模式拆解結果
-- ============================================================
CREATE TABLE IF NOT EXISTS behavior_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_type TEXT,
  summary TEXT,
  evidence_json TEXT,
  confidence_score REAL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_behavior_patterns_user
  ON behavior_patterns(user_id, pattern_type);

-- ============================================================
-- interventions：介入歷史
-- ============================================================
CREATE TABLE IF NOT EXISTS interventions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  behavior_pattern_id INTEGER REFERENCES behavior_patterns(id) ON DELETE SET NULL,
  intervention_type TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interventions_user
  ON interventions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_interventions_pattern
  ON interventions(behavior_pattern_id);

-- ============================================================
-- ai_reports：AI 產出報告
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type TEXT,
  period_start TEXT,
  period_end TEXT,
  content TEXT,
  model_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_user
  ON ai_reports(user_id, period_start);

-- ============================================================
-- nutrients：營養素參考資料（未來取代 src/worker.js 內建 NUTRI_DATA 常數，本次僅建表不搬資料）
-- ============================================================
CREATE TABLE IF NOT EXISTS nutrients (
  id TEXT PRIMARY KEY,
  category TEXT,
  name TEXT NOT NULL,
  unit TEXT,
  description TEXT,
  data_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nutrients_category
  ON nutrients(category);

-- ============================================================
-- scenarios：情境演練參考資料（未來取代 src/worker.js 內建 SCEN_DATA 常數，本次僅建表不搬資料）
-- ============================================================
CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  title TEXT,
  category TEXT,
  data_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scenarios_category
  ON scenarios(category);

-- ============================================================
-- legacy_import_log：舊資料（KV sync / qlive、瀏覽器 localStorage）遷移追蹤紀錄
-- ============================================================
CREATE TABLE IF NOT EXISTS legacy_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  detail_json TEXT,
  imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_legacy_import_log_source
  ON legacy_import_log(source_type, source_key);

CREATE INDEX IF NOT EXISTS idx_legacy_import_log_status
  ON legacy_import_log(status);
