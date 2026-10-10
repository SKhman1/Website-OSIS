CREATE TABLE cms_mfa_enrollments (
  account_id TEXT PRIMARY KEY REFERENCES cms_accounts(id),
  token_hash TEXT NOT NULL UNIQUE,
  auth_epoch INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
