import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

function addColumn(db, table, definition) {
  const name = definition.trim().split(/\s+/)[0]
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((column) => column.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account TEXT NOT NULL DEFAULT '',
      issuer TEXT NOT NULL DEFAULT '',
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      digits INTEGER NOT NULL DEFAULT 6,
      period INTEGER NOT NULL DEFAULT 30,
      algorithm TEXT NOT NULL DEFAULT 'SHA1',
      notes TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      public_access INTEGER NOT NULL DEFAULT 0,
      config_default INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#287a5d',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  addColumn(db, 'accounts', 'public_access INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'accounts', 'config_default INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'accounts', "tags TEXT NOT NULL DEFAULT '[]'")
  addColumn(db, 'accounts', "access_mode TEXT NOT NULL DEFAULT 'all'")
  addColumn(db, 'accounts', 'pinned INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'accounts', 'sort_order INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'accounts', 'deleted_at INTEGER')
  addColumn(db, 'sessions', 'created_at INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'sessions', 'last_seen_at INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'sessions', "ip TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'sessions', "user_agent TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'sessions', 'verified_at INTEGER NOT NULL DEFAULT 0')

  db.exec(`
    CREATE TABLE IF NOT EXISTS account_members (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (account_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_name TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '{}',
      ip TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      expires_at INTEGER,
      max_views INTEGER,
      view_count INTEGER NOT NULL DEFAULT 0,
      revoked_at INTEGER,
      access_nonce_hash TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_deleted ON accounts(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token_hash);
  `)
  addColumn(db, 'shares', 'access_nonce_hash TEXT')

  return db
}
