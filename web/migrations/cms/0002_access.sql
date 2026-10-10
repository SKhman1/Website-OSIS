ALTER TABLE cms_sessions ADD COLUMN mfa_verified INTEGER NOT NULL DEFAULT 0;
CREATE TABLE cms_account_security (
  account_id TEXT PRIMARY KEY REFERENCES cms_accounts(id),
  secret TEXT,
  pending_secret TEXT,
  pending_expires INTEGER NOT NULL DEFAULT 0,
  last_step INTEGER NOT NULL DEFAULT -1
);
CREATE TABLE cms_recovery_codes (
  account_id TEXT NOT NULL REFERENCES cms_accounts(id),
  code_hash TEXT NOT NULL,
  PRIMARY KEY(account_id, code_hash)
);
CREATE TABLE cms_invitations (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','editor')),
  issuer_id TEXT NOT NULL REFERENCES cms_accounts(id),
  issuer_epoch INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE cms_access_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX cms_invitations_expiry ON cms_invitations(expires_at);
