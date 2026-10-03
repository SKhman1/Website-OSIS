PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS cms_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','editor')),
  enabled INTEGER NOT NULL DEFAULT 1,
  auth_epoch INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cms_accounts(id),
  auth_epoch INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cms_sessions_expiry ON cms_sessions(expires_at);
CREATE TABLE IF NOT EXISTS cms_login_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  version INTEGER NOT NULL,
  draft TEXT NOT NULL,
  published TEXT NOT NULL,
  published_version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_operation TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cms_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('save','publish','restore','password')),
  account_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_assets (
  key TEXT PRIMARY KEY,
  bytes BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
