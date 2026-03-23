"use strict";
/**
 * SQLite DDL for app tables (users, sessions, characters, dice_models).
 * Shared by app/store.js and scripts/dbRefresh.ts so db:refresh can apply
 * campaign migrations that FK to users/characters.
 */
const SQLITE_APP_BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  edition TEXT NOT NULL,
  ancestry_slug TEXT,
  class_slug TEXT,
  background_slug TEXT,
  level INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_characters_owner_user_id ON characters (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_characters_updated_at ON characters (updated_at);

CREATE TABLE IF NOT EXISTS dice_models (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  asset_path TEXT NOT NULL,
  theme TEXT NOT NULL,
  theme_color TEXT,
  external_theme_url TEXT,
  config_json TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dice_models_enabled_sort ON dice_models (is_enabled, sort_order, name);
`;
module.exports = { SQLITE_APP_BASE_SCHEMA_SQL };
