import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { createAccountService } from './accounts.mjs'
import { createAudit } from './audit.mjs'
import { decryptBackup, encryptBackup } from './backup.mjs'
import { openDatabase } from './database.mjs'
import { createSecurity, csrfCookie, hashToken, sessionCookie } from './security.mjs'
import { createShareService } from './shares.mjs'
import { accountSettings, normalizeSecret, validSecret } from './totp.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'keyfort.db')
const port = Number(process.env.PORT || 3001)
const isProduction = process.env.NODE_ENV === 'production'
const configPath = path.join(__dirname, 'config.json')
const serverConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const db = openDatabase(dbPath)
const security = createSecurity({ db, dataDir, isProduction })
const accounts = createAccountService({ db, encryptSecret: security.encryptText, decryptSecret: security.decryptText })
const audit = createAudit(db)
const shares = createShareService({ db, serializePublic })

function serializeUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

function serializePublic(row) {
  const account = accounts.serialize(row)
  return { ...account, notes: '', favorite: false, memberIds: [], tags: [] }
}

function configuredDefault() {
  const source = serverConfig.defaultAccount ?? (process.env.DEFAULT_TOTP_SECRET ? { secret: process.env.DEFAULT_TOTP_SECRET } : undefined)
  const secret = normalizeSecret(source?.secret)
  return source?.secret && validSecret(secret) ? { source, secret } : null
}

function markLegacyDefault() {
  const configured = configuredDefault()
  if (!configured) return
  for (const row of db.prepare('SELECT * FROM accounts WHERE config_default = 0').all()) {
    try {
      const matches = security.decryptText(row) === configured.secret
        && row.name === (configured.source.name || '默认账号')
        && row.account === (configured.source.account || '')
        && row.issuer === (configured.source.issuer || '')
      if (matches) db.prepare('UPDATE accounts SET config_default = 1, public_access = 1 WHERE id = ?').run(row.id)
    } catch { /* Ignore rows encrypted with another key. */ }
  }
}

function seedDefault() {
  if (db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE config_default = 1').get().count > 0) return
  if (db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count > 0) return
  const configured = configuredDefault()
  if (!configured) return
  const settings = accountSettings(configured.source)
  const encrypted = security.encryptText(configured.secret)
  const now = Date.now()
  db.prepare(`INSERT INTO accounts
    (id, name, account, issuer, secret_ciphertext, secret_iv, digits, period, algorithm, notes, favorite, public_access, config_default, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?, ?)`)
    .run(crypto.randomUUID(), configured.source.name || '默认账号', configured.source.account || '', configured.source.issuer || '',
      encrypted.ciphertext, encrypted.iv, settings.digits, settings.period, settings.algorithm, configured.source.notes || '', settings.color, now, now)
}

function publicAccounts() {
  const rows = db.prepare('SELECT * FROM accounts WHERE public_access = 1 AND deleted_at IS NULL ORDER BY name COLLATE NOCASE').all()
  const configured = configuredDefault()
  const hasStoredDefault = rows.some((row) => row.config_default)
  if (!configured || hasStoredDefault) return rows
  const encrypted = security.encryptText(configured.secret)
  const settings = accountSettings(configured.source)
  const now = Date.now()
  return [{
    id: 'config-default', name: configured.source.name || '默认账号', account: configured.source.account || '',
    issuer: configured.source.issuer || '', secret_ciphertext: encrypted.ciphertext, secret_iv: encrypted.iv,
    notes: '', favorite: 0, public_access: 1, config_default: 1, tags: '[]', access_mode: 'all', pinned: 0,
    sort_order: 0, deleted_at: null, created_at: now, updated_at: now, ...settings,
  }, ...rows]
}

function currentTokenHash(req) {
  return req.cookies[sessionCookie] ? hashToken(req.cookies[sessionCookie]) : ''
}

function clearAuth(res) {
  const common = { sameSite: 'lax', secure: isProduction, path: '/' }
  res.clearCookie(sessionCookie, { ...common, httpOnly: true })
  res.clearCookie(csrfCookie, { ...common, httpOnly: false })
}

function memberView(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at }
}

function accountOr404(req, res) {
  const row = accounts.get(req.params.id)
  if (!row || row.deleted_at || !accounts.canAccess(row, req.user)) {
    res.status(404).json({ message: '验证项不存在' })
    return null
  }
  return row
}

markLegacyDefault()
seedDefault()

const app = express()
app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }))
app.use(cookieParser())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: false }))
app.use(security.csrfProtection)

function runCleanup() {
  const now = Date.now()
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
  db.prepare('DELETE FROM share_accesses WHERE expires_at <= ?').run(now)
  db.prepare('DELETE FROM accounts WHERE deleted_at IS NOT NULL AND deleted_at <= ?').run(now - 30 * 24 * 60 * 60 * 1000)
}

// Runs on a timer instead of per request: the old middleware issued write
// transactions for every HTTP call, including each static asset in production.
runCleanup()
const cleanupTimer = setInterval(runCleanup, 60 * 60 * 1000)
cleanupTimer.unref?.()

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { message: '尝试次数过多，请稍后再试' } })
// Separate bucket so re-authenticating for sensitive actions cannot lock out logins.
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { message: '验证次数过多，请稍后再试' } })
const shareLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false })

app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ status: 'ok', version: process.env.npm_package_version || '2.0.0', database: 'ok', encryption: 'ok', timestamp: Date.now() })
  } catch { res.status(503).json({ status: 'error', database: 'error' }) }
})

app.get('/api/auth/status', (req, res) => {
  const user = security.getSession(req)
  security.setCsrfCookie(res)
  res.json({ setupRequired: db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0, user: user ? serializeUser(user) : null })
})

app.post('/api/auth/setup', authLimiter, async (req, res) => {
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) return res.status(409).json({ message: '管理员已经创建，请直接登录' })
  const email = String(req.body.email || '').trim().toLowerCase()
  const name = String(req.body.name || '').trim() || email.split('@')[0]
  const password = String(req.body.password || '')
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: '请输入有效邮箱' })
  if (password.length < 8) return res.status(400).json({ message: '密码至少需要 8 个字符' })
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, email, name, await bcrypt.hash(password, 12), 'admin', Date.now())
  security.issueSession(id, req, res)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  req.user = user
  audit.record(req, 'auth.setup', 'user', user)
  return res.status(201).json({ user: serializeUser(user) })
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    audit.record(req, 'auth.login_failed', 'user', { name: email })
    return res.status(401).json({ message: '邮箱或密码错误' })
  }
  security.issueSession(user.id, req, res)
  req.user = user
  audit.record(req, 'auth.login', 'user', user)
  return res.json({ user: serializeUser(user) })
})

app.post('/api/auth/logout', security.requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId)
  audit.record(req, 'auth.logout', 'session', { id: req.sessionId })
  clearAuth(res)
  res.status(204).end()
})

app.post('/api/auth/verify', security.requireAuth, verifyLimiter, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ message: '密码错误' })
  db.prepare('UPDATE sessions SET verified_at = ? WHERE id = ?').run(Date.now(), req.sessionId)
  return res.status(204).end()
})

app.put('/api/auth/password', security.requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  const currentPassword = String(req.body.currentPassword || '')
  const newPassword = String(req.body.newPassword || '')
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) return res.status(401).json({ message: '当前密码错误' })
  if (newPassword.length < 8) return res.status(400).json({ message: '新密码至少需要 8 个字符' })
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(newPassword, 12), user.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(user.id, req.sessionId)
  db.prepare('UPDATE sessions SET verified_at = ? WHERE id = ?').run(Date.now(), req.sessionId)
  audit.record(req, 'auth.password_changed', 'user', user)
  return res.status(204).end()
})

app.get('/api/auth/sessions', security.requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT id, created_at AS createdAt, last_seen_at AS lastSeenAt, ip, user_agent AS userAgent
    FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC`).all(req.user.id)
  res.json({ sessions: rows.map((row) => ({ ...row, current: row.id === req.sessionId })) })
})

app.delete('/api/auth/sessions/:id', security.requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  if (!result.changes) return res.status(404).json({ message: '会话不存在' })
  if (req.params.id === req.sessionId) clearAuth(res)
  audit.record(req, 'auth.session_revoked', 'session', { id: req.params.id })
  return res.status(204).end()
})

app.get('/api/public/accounts', (_req, res) => res.json({ accounts: publicAccounts().map(serializePublic) }))
app.post('/api/share/:token/access', shareLimiter, async (req, res) => {
  const result = await shares.resolve(req.params.token, req.body.password)
  if (result.error) return res.status(result.status).json({ message: result.error, passwordRequired: result.passwordRequired })
  return res.json(result)
})
app.post('/api/share/:token/refresh', shareLimiter, (req, res) => {
  const result = shares.refresh(req.params.token, req.body.accessNonce)
  if (result.error) return res.status(result.status).json({ message: result.error })
  return res.json(result)
})

app.use('/api/accounts', security.requireAuth)
app.get('/api/accounts', (req, res) => res.json({ accounts: accounts.list(req.user) }))
app.get('/api/accounts/trash', security.requireAdmin, (req, res) => res.json({ accounts: accounts.list(req.user, { deleted: true }) }))

app.post('/api/accounts', (req, res) => {
  const requestsRestrictedAccess = req.body.publicAccess || (req.body.accessMode && req.body.accessMode !== 'all') || req.body.memberIds?.length
  if (requestsRestrictedAccess && req.user.role !== 'admin') return res.status(403).json({ message: '只有管理员可以设置公开访问和成员权限' })
  if (requestsRestrictedAccess && Date.now() - Number(req.user.verified_at || 0) > 10 * 60 * 1000) {
    return res.status(428).json({ message: '请重新验证密码后设置访问权限', reauthRequired: true })
  }
  const result = accounts.create(req.body)
  if (result.error) return res.status(result.status || 400).json({ message: result.error })
  audit.record(req, 'account.created', 'account', result.account)
  return res.status(201).json(result)
})

app.post('/api/accounts/import', (req, res) => {
  if (!Array.isArray(req.body.accounts) || req.body.accounts.length > 200) return res.status(400).json({ message: '导入内容无效或超过 200 条' })
  const requestsRestrictedAccess = req.body.accounts.some((item) => item.publicAccess || (item.accessMode && item.accessMode !== 'all') || item.memberIds?.length)
  if (requestsRestrictedAccess && req.user.role !== 'admin') {
    return res.status(403).json({ message: '只有管理员可以导入公开或受限验证项' })
  }
  // Mirrors POST /api/accounts so import cannot be used to skip the password re-check.
  if (requestsRestrictedAccess && Date.now() - Number(req.user.verified_at || 0) > 10 * 60 * 1000) {
    return res.status(428).json({ message: '请重新验证密码后导入公开或受限验证项', reauthRequired: true })
  }
  const created = []
  const errors = []
  req.body.accounts.forEach((item, index) => {
    const result = accounts.create(item)
    if (result.error) errors.push({ index, message: result.error })
    else created.push(result.account)
  })
  audit.record(req, 'account.imported', 'account', { name: `${created.length} items` }, { count: created.length })
  return res.status(201).json({ accounts: created, errors })
})

app.put('/api/accounts/:id', (req, res) => {
  const current = accountOr404(req, res)
  if (!current) return
  const changesProtectedFields = Boolean(req.body.publicAccess) !== Boolean(current.public_access)
    || (req.body.accessMode !== undefined && req.body.accessMode !== current.access_mode)
    || (req.user.role === 'admin' && req.body.memberIds !== undefined && JSON.stringify([...req.body.memberIds].sort()) !== JSON.stringify(accounts.serialize(current, true).memberIds.sort()))
  if (req.user.role !== 'admin' && changesProtectedFields) return res.status(403).json({ message: '只有管理员可以修改公开访问和成员权限' })
  if (changesProtectedFields && Date.now() - Number(req.user.verified_at || 0) > 10 * 60 * 1000) {
    return res.status(428).json({ message: '请重新验证密码后修改访问权限', reauthRequired: true })
  }
  const updateBody = req.user.role === 'admin'
    ? req.body
    : { ...req.body, publicAccess: Boolean(current.public_access), accessMode: current.access_mode, memberIds: undefined }
  const result = accounts.update(req.params.id, updateBody)
  if (result.error) return res.status(result.status || 400).json({ message: result.error })
  audit.record(req, 'account.updated', 'account', result.account)
  return res.json(result)
})

app.patch('/api/accounts/reorder', (req, res) => {
  if (!Array.isArray(req.body.ids) || req.body.ids.length > 500) return res.status(400).json({ message: '排序数据无效' })
  const visibleIds = new Set(accounts.list(req.user).map((account) => account.id))
  if (req.body.ids.some((id) => !visibleIds.has(String(id)))) return res.status(403).json({ message: '排序包含无权访问的验证项' })
  const update = db.prepare('UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
  db.transaction(() => req.body.ids.forEach((id, index) => update.run(index, Date.now(), id)))()
  audit.record(req, 'account.reordered', 'account', { name: `${req.body.ids.length} items` })
  return res.status(204).end()
})

for (const [route, field, adminOnly] of [['favorite', 'favorite', false], ['public-access', 'publicAccess', true], ['pinned', 'pinned', false]]) {
  app.patch(`/api/accounts/:id/${route}`, ...(adminOnly ? [security.requireAdmin, security.requireRecentVerification] : []), (req, res) => {
    const current = accountOr404(req, res)
    if (!current) return
    if (typeof req.body[field] !== 'boolean') return res.status(400).json({ message: '参数无效' })
    const account = accounts.setField(req.params.id, field, req.body[field])
    if (!account) return res.status(404).json({ message: '验证项不存在' })
    audit.record(req, `account.${field}`, 'account', account, { value: req.body[field] })
    return res.json({ account })
  })
}

app.delete('/api/accounts/:id', (req, res) => {
  const current = accountOr404(req, res)
  if (!current) return
  if (!accounts.trash(req.params.id)) return res.status(404).json({ message: '验证项不存在' })
  audit.record(req, 'account.trashed', 'account', current)
  return res.status(204).end()
})

app.post('/api/accounts/:id/restore', security.requireAdmin, (req, res) => {
  if (!accounts.restore(req.params.id)) return res.status(404).json({ message: '回收站中不存在该验证项' })
  audit.record(req, 'account.restored', 'account', { id: req.params.id })
  return res.status(204).end()
})

app.delete('/api/accounts/:id/permanent', security.requireAdmin, security.requireRecentVerification, (req, res) => {
  if (!accounts.destroy(req.params.id)) return res.status(404).json({ message: '回收站中不存在该验证项' })
  audit.record(req, 'account.destroyed', 'account', { id: req.params.id })
  return res.status(204).end()
})

app.post('/api/accounts/:id/shares', security.requireAdmin, (req, res, next) => security.requireRecentVerification(req, res, next), async (req, res) => {
  const current = accountOr404(req, res)
  if (!current) return
  const share = await shares.create({ accountId: current.id, password: req.body.password, expiresIn: req.body.expiresIn, maxViews: req.body.maxViews, userId: req.user.id })
  audit.record(req, 'share.created', 'account', current, { shareId: share.id, expiresAt: share.expiresAt })
  return res.status(201).json({ share })
})

app.use('/api/team', security.requireAuth, security.requireAdmin)
app.get('/api/team/members', (_req, res) => res.json({ members: db.prepare('SELECT * FROM users ORDER BY created_at').all().map(memberView) }))
app.post('/api/team/members', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const name = String(req.body.name || '').trim() || email.split('@')[0]
  const password = String(req.body.password || '')
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: '请输入有效邮箱' })
  if (password.length < 8) return res.status(400).json({ message: '临时密码至少需要 8 个字符' })
  try {
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, name, await bcrypt.hash(password, 12), 'member', Date.now())
    const member = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    audit.record(req, 'member.created', 'user', member)
    return res.status(201).json({ member: memberView(member) })
  } catch (error) {
    if (String(error?.code || '').includes('CONSTRAINT')) return res.status(409).json({ message: '该邮箱已经存在' })
    throw error
  }
})

app.put('/api/team/members/:id/password', security.requireRecentVerification, async (req, res) => {
  const password = String(req.body.password || '')
  if (password.length < 8) return res.status(400).json({ message: '临时密码至少需要 8 个字符' })
  const member = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!member) return res.status(404).json({ message: '成员不存在' })
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(password, 12), member.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(member.id)
  audit.record(req, 'member.password_reset', 'user', member)
  return res.status(204).end()
})

app.delete('/api/team/members/:id', security.requireRecentVerification, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ message: '不能删除当前管理员' })
  const member = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!member) return res.status(404).json({ message: '成员不存在' })
  db.prepare('DELETE FROM users WHERE id = ?').run(member.id)
  audit.record(req, 'member.deleted', 'user', member)
  return res.status(204).end()
})

app.get('/api/admin/audit', security.requireAuth, security.requireAdmin, (req, res) => res.json({ logs: audit.list(req.query) }))
app.get('/api/admin/shares', security.requireAuth, security.requireAdmin, (req, res) => res.json({ shares: shares.list() }))
app.delete('/api/admin/shares/:id', security.requireAuth, security.requireAdmin, (req, res) => {
  if (!shares.revoke(req.params.id)) return res.status(404).json({ message: '分享不存在或已撤销' })
  audit.record(req, 'share.revoked', 'share', { id: req.params.id })
  return res.status(204).end()
})

app.post('/api/admin/backup/export', security.requireAuth, security.requireAdmin, security.requireRecentVerification, (req, res) => {
  try {
    const backup = encryptBackup({ exportedAt: Date.now(), accounts: accounts.exportRows() }, String(req.body.password || ''))
    audit.record(req, 'backup.exported', 'backup')
    return res.json({ backup })
  } catch (error) { return res.status(400).json({ message: error.message }) }
})

app.post('/api/admin/backup/preview', security.requireAuth, security.requireAdmin, security.requireRecentVerification, (req, res) => {
  try {
    const backup = decryptBackup(req.body.backup, String(req.body.password || ''))
    if (!Array.isArray(backup.accounts)) throw new Error('备份内容无效')
    const existing = new Set(db.prepare('SELECT name, account, issuer FROM accounts WHERE config_default = 0 AND deleted_at IS NULL').all().map((row) => `${row.name}\0${row.account}\0${row.issuer}`))
    const duplicates = backup.accounts.filter((row) => existing.has(`${row.name}\0${row.account || ''}\0${row.issuer || ''}`)).length
    return res.json({ count: backup.accounts.length, duplicates, exportedAt: backup.exportedAt || null })
  } catch (error) { return res.status(400).json({ message: error.message }) }
})

app.post('/api/admin/backup/import', security.requireAuth, security.requireAdmin, security.requireRecentVerification, (req, res) => {
  try {
    const backup = decryptBackup(req.body.backup, String(req.body.password || ''))
    if (!Array.isArray(backup.accounts)) throw new Error('备份内容无效')
    const results = backup.accounts.map((account) => accounts.create(account))
    const imported = results.filter((result) => result.account).length
    audit.record(req, 'backup.imported', 'backup', {}, { imported })
    return res.json({ imported, errors: results.length - imported })
  } catch (error) { return res.status(400).json({ message: error.message }) }
})

// Must stay after every /api route: otherwise the SPA fallback answers unknown
// API paths with 200 + index.html instead of a JSON 404.
app.use('/api', (_req, res) => res.status(404).json({ message: '接口不存在' }))

if (isProduction) {
  const distDir = path.join(rootDir, 'dist')
  app.use(express.static(distDir))
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.use((error, req, res, _next) => {
  console.error(`[KeyFort] ${req.method} ${req.originalUrl}`, error)
  if (res.headersSent) return
  const status = Number(error?.status || error?.statusCode) || 500
  const message = status < 500 && error?.expose ? error.message : '服务器内部错误，请稍后重试'
  res.status(status).json({ message })
})

if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`KeyFort API listening on http://localhost:${port}`))

export { app, db }
