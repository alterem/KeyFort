import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import express from 'express'
import cookieParser from 'cookie-parser'
import * as OTPAuth from 'otpauth'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'keyfort.db')
const port = Number(process.env.PORT || 3001)
const isProduction = process.env.NODE_ENV === 'production'
const sessionCookie = 'keyfort_session'
const sessionDays = 7
const serverConfigPath = path.join(__dirname, 'config.json')
const serverConfig = fs.existsSync(serverConfigPath) ? JSON.parse(fs.readFileSync(serverConfigPath, 'utf8')) : {}

fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
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
    color TEXT NOT NULL DEFAULT '#287a5d',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

const accountColumns = db.prepare('PRAGMA table_info(accounts)').all()
if (!accountColumns.some((column) => column.name === 'public_access')) {
  db.exec('ALTER TABLE accounts ADD COLUMN public_access INTEGER NOT NULL DEFAULT 0')
}
function getEncryptionKey() {
  const configured = process.env.TOTP_ENCRYPTION_KEY
  if (configured) {
    const key = /^[0-9a-f]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64')
    if (key.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes in hex or base64')
    return key
  }

  const keyPath = path.join(dataDir, 'encryption.key')
  if (isProduction) throw new Error('TOTP_ENCRYPTION_KEY is required in production')
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath)
  const key = crypto.randomBytes(32)
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
  console.warn(`Generated development encryption key at ${keyPath}`)
  return key
}

const encryptionKey = getEncryptionKey()

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64') }
}

function decryptSecret(row) {
  const payload = Buffer.from(row.secret_ciphertext, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(row.secret_iv, 'base64'))
  const tag = payload.subarray(-16)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()]).toString('utf8')
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function issueSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = Date.now() + sessionDays * 24 * 60 * 60 * 1000
  db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), userId, hashToken(token), expiresAt)
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

function serializeUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

function getUser(req) {
  const token = req.cookies[sessionCookie]
  if (!token) return null
  const row = db.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), Date.now())
  return row || null
}

function requireAuth(req, res, next) {
  const user = getUser(req)
  if (!user) return res.status(401).json({ message: '请先登录' })
  req.user = user
  return next()
}

function normalizeSecret(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '')
}

function validSecret(value) {
  return /^[A-Z2-7]+=*$/.test(value)
}

function getToken(row) {
  try {
    const secret = decryptSecret(row)
    const totp = new OTPAuth.TOTP({
      issuer: row.issuer,
      label: row.account || row.name,
      algorithm: row.algorithm,
      digits: row.digits,
      period: row.period,
      secret: OTPAuth.Secret.fromBase32(secret),
    })
    const remaining = row.period - (Math.floor(Date.now() / 1000) % row.period)
    return { token: totp.generate(), remaining }
  } catch {
    return { token: null, remaining: row.period }
  }
}

function serializeAccount(row) {
  return {
    id: row.id,
    name: row.name,
    account: row.account,
    issuer: row.issuer,
    digits: row.digits,
    period: row.period,
    algorithm: row.algorithm,
    notes: row.notes,
    favorite: Boolean(row.favorite),
    publicAccess: Boolean(row.public_access),
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...getToken(row),
  }
}

function serializePublicAccount(row) {
  const account = serializeAccount(row)
  return { ...account, notes: '', favorite: false }
}

function seedDefaultAccount() {
  if (db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count > 0) return
  const source = serverConfig.defaultAccount ?? (process.env.DEFAULT_TOTP_SECRET ? { secret: process.env.DEFAULT_TOTP_SECRET } : undefined)
  const secret = normalizeSecret(source?.secret)
  if (!source?.secret || !validSecret(secret)) return
  const now = Date.now()
  const encrypted = encryptSecret(secret)
  db.prepare(`INSERT INTO accounts
    (id, name, account, issuer, secret_ciphertext, secret_iv, digits, period, algorithm, notes, favorite, public_access, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), source.name || '默认账号', source.account || '', source.issuer || '', encrypted.ciphertext, encrypted.iv,
      [6, 7, 8].includes(source.digits) ? source.digits : 6, [30, 60].includes(source.period) ? source.period : 30,
      ['SHA1', 'SHA256', 'SHA512'].includes(source.algorithm) ? source.algorithm : 'SHA1', source.notes || '', source.favorite ? 1 : 0, source.publicAccess ? 1 : 0, source.color || '#287a5d', now, now)
}
function validateAccount(body, requiresSecret = true) {
  const secret = normalizeSecret(body.secret)
  if (!String(body.name || '').trim()) return { error: '请填写验证项名称' }
  if (requiresSecret && !validSecret(secret)) return { error: '请输入有效的 Base32 Secret Key' }
  if (body.digits !== undefined && ![6, 7, 8].includes(Number(body.digits))) return { error: '验证码位数无效' }
  if (body.period !== undefined && ![30, 60].includes(Number(body.period))) return { error: '验证码周期无效' }
  if (body.algorithm !== undefined && !['SHA1', 'SHA256', 'SHA512'].includes(body.algorithm)) return { error: '验证码算法无效' }
  return { secret }
}


const app = express()
app.use(cookieParser())
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: false }))
app.use((req, _res, next) => {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  next()
})

app.get('/api/auth/status', (req, res) => {
  const user = getUser(req)
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count
  res.json({ setupRequired: count === 0, user: user ? serializeUser(user) : null })
})

app.post('/api/auth/setup', async (req, res) => {
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) {
    return res.status(409).json({ message: '管理员已经创建，请直接登录' })
  }
  const email = String(req.body.email || '').trim().toLowerCase()
  const name = String(req.body.name || '').trim() || email.split('@')[0]
  const password = String(req.body.password || '')
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: '请输入有效邮箱' })
  if (password.length < 8) return res.status(400).json({ message: '密码至少需要 8 个字符' })

  const userId = crypto.randomUUID()
  db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, email, name, await bcrypt.hash(password, 12), 'admin', Date.now())
  issueSession(userId, res)
  seedDefaultAccount()
  return res.status(201).json({ user: serializeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) })
})

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: '邮箱或密码错误' })
  }
  issueSession(user.id, res)
  return res.json({ user: serializeUser(user) })
})

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies[sessionCookie]
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' })
  res.status(204).end()
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: serializeUser(req.user) }))

app.get('/api/public/accounts', (_req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE public_access = 1 ORDER BY name COLLATE NOCASE ASC').all()
  res.json({ accounts: accounts.map(serializePublicAccount) })
})

app.get('/api/accounts', requireAuth, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY favorite DESC, name COLLATE NOCASE ASC').all()
  res.json({ accounts: accounts.map(serializeAccount) })
})

app.post('/api/accounts', requireAuth, (req, res) => {
  if (req.body.publicAccess && req.user.role !== 'admin') return res.status(403).json({ message: '只有管理员可以开放公开访问' })
  const validation = validateAccount(req.body)
  if (validation.error) return res.status(400).json({ message: validation.error })
  const now = Date.now()
  const id = crypto.randomUUID()
  const encrypted = encryptSecret(validation.secret)
  db.prepare(`INSERT INTO accounts
    (id, name, account, issuer, secret_ciphertext, secret_iv, digits, period, algorithm, notes, favorite, public_access, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, String(req.body.name).trim(), String(req.body.account || '').trim(), String(req.body.issuer || '').trim(), encrypted.ciphertext, encrypted.iv,
      Number(req.body.digits || 6), Number(req.body.period || 30), req.body.algorithm || 'SHA1', String(req.body.notes || '').trim(), req.body.favorite ? 1 : 0, req.body.publicAccess ? 1 : 0, req.body.color || '#287a5d', now, now)
  return res.status(201).json({ account: serializeAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)) })
})

app.put('/api/accounts/:id', requireAuth, (req, res) => {
  const current = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id)
  if (!current) return res.status(404).json({ message: '验证项不存在' })
  if (req.body.publicAccess !== undefined && req.user.role !== 'admin' && Boolean(req.body.publicAccess) !== Boolean(current.public_access)) {
    return res.status(403).json({ message: '只有管理员可以修改公开访问设置' })
  }
  const validation = validateAccount({ ...current, ...req.body }, false)
  if (validation.error) return res.status(400).json({ message: validation.error })
  const encrypted = validation.secret ? encryptSecret(validation.secret) : { ciphertext: current.secret_ciphertext, iv: current.secret_iv }
  db.prepare(`UPDATE accounts SET name = ?, account = ?, issuer = ?, secret_ciphertext = ?, secret_iv = ?, digits = ?, period = ?, algorithm = ?, notes = ?, favorite = ?, public_access = ?, color = ?, updated_at = ? WHERE id = ?`)
    .run(String(req.body.name ?? current.name).trim(), String(req.body.account ?? current.account).trim(), String(req.body.issuer ?? current.issuer).trim(), encrypted.ciphertext, encrypted.iv,
      Number(req.body.digits || current.digits), Number(req.body.period || current.period), req.body.algorithm || current.algorithm, String(req.body.notes ?? current.notes).trim(), req.body.favorite === undefined ? current.favorite : (req.body.favorite ? 1 : 0), req.body.publicAccess === undefined ? current.public_access : (req.body.publicAccess ? 1 : 0), req.body.color || current.color, Date.now(), req.params.id)
  return res.json({ account: serializeAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id)) })
})

app.delete('/api/accounts/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ message: '验证项不存在' })
  return res.status(204).end()
})

app.get('/api/team/members', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: '只有管理员可以管理成员' })
  const members = db.prepare('SELECT id, email, name, role, created_at AS createdAt FROM users ORDER BY created_at ASC').all()
  return res.json({ members })
})

app.post('/api/team/members', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: '只有管理员可以管理成员' })
  const email = String(req.body.email || '').trim().toLowerCase()
  const name = String(req.body.name || '').trim() || email.split('@')[0]
  const password = String(req.body.password || '')
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: '请输入有效邮箱' })
  if (password.length < 8) return res.status(400).json({ message: '临时密码至少需要 8 个字符' })
  try {
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, name, await bcrypt.hash(password, 12), 'member', Date.now())
    return res.status(201).json({ member: db.prepare('SELECT id, email, name, role, created_at AS createdAt FROM users WHERE id = ?').get(id) })
  } catch {
    return res.status(409).json({ message: '该邮箱已经存在' })
  }
})

app.delete('/api/team/members/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: '只有管理员可以管理成员' })
  if (req.params.id === req.user.id) return res.status(400).json({ message: '不能删除当前管理员' })
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  return res.status(204).end()
})

if (isProduction) {
  const distDir = path.join(rootDir, 'dist')
  app.use(express.static(distDir))
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.listen(port, () => console.log(`KeyFort API listening on http://localhost:${port}`))
