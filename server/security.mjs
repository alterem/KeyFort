import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const sessionCookie = 'keyfort_session'
export const csrfCookie = 'keyfort_csrf'
const sessionDays = 7
const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function requestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 120)
}

export function createSecurity({ db, dataDir, isProduction }) {
  const encryptionKey = getEncryptionKey({ dataDir, isProduction })

  function encryptText(value) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
    return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64') }
  }

  function decryptText(row) {
    const payload = Buffer.from(row.secret_ciphertext, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(row.secret_iv, 'base64'))
    decipher.setAuthTag(payload.subarray(-16))
    return Buffer.concat([decipher.update(payload.subarray(0, -16)), decipher.final()]).toString('utf8')
  }

  function setCsrfCookie(res) {
    const csrfToken = crypto.randomBytes(24).toString('base64url')
    res.cookie(csrfCookie, csrfToken, { sameSite: 'lax', secure: isProduction, path: '/', httpOnly: false, maxAge: sessionDays * 24 * 60 * 60 * 1000 })
    return csrfToken
  }

  function issueSession(userId, req, res) {
    const token = crypto.randomBytes(32).toString('base64url')
    const now = Date.now()
    const expiresAt = now + sessionDays * 24 * 60 * 60 * 1000
    db.prepare(`INSERT INTO sessions
      (id, user_id, token_hash, expires_at, created_at, last_seen_at, ip, user_agent, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), userId, hashToken(token), expiresAt, now, now, requestIp(req), String(req.get('user-agent') || '').slice(0, 300), 0)
    const common = { sameSite: 'lax', secure: isProduction, path: '/' }
    res.cookie(sessionCookie, token, { ...common, httpOnly: true, maxAge: expiresAt - now })
    setCsrfCookie(res)
  }

  function getSession(req) {
    const token = req.cookies[sessionCookie]
    if (!token) return null
    return db.prepare(`
      SELECT sessions.id AS session_id, sessions.verified_at, users.* FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashToken(token), Date.now()) || null
  }

  function requireAuth(req, res, next) {
    const session = getSession(req)
    if (!session) return res.status(401).json({ message: '请先登录' })
    req.user = session
    req.sessionId = session.session_id
    db.prepare('UPDATE sessions SET last_seen_at = ?, ip = ? WHERE id = ?').run(Date.now(), requestIp(req), session.session_id)
    return next()
  }

  function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ message: '只有管理员可以执行此操作' })
    return next()
  }

  function requireRecentVerification(req, res, next) {
    if (Date.now() - Number(req.user.verified_at || 0) > 10 * 60 * 1000) {
      return res.status(428).json({ message: '请重新验证密码后执行敏感操作', reauthRequired: true })
    }
    return next()
  }

  function csrfProtection(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !getSession(req)) return next()
    const origin = req.get('origin')
    if (origin) {
      try {
        const requestOrigin = new URL(origin).origin
        const sameOrigin = requestOrigin === `${req.protocol}://${req.get('host')}`
        const configuredOrigin = process.env.FRONTEND_ORIGIN && requestOrigin === process.env.FRONTEND_ORIGIN
        if (!sameOrigin && !configuredOrigin && !devOrigins.includes(requestOrigin)) return res.status(403).json({ message: '请求来源无效' })
      } catch { return res.status(403).json({ message: '请求来源无效' }) }
    }
    const cookie = req.cookies[csrfCookie]
    const header = req.get('x-csrf-token')
    if (!cookie || !header || cookie !== header) return res.status(403).json({ message: '安全令牌无效，请刷新页面重试' })
    return next()
  }

  return { encryptText, decryptText, issueSession, setCsrfCookie, getSession, requireAuth, requireAdmin, requireRecentVerification, csrfProtection, requestIp }
}

function getEncryptionKey({ dataDir, isProduction }) {
  const configured = process.env.TOTP_ENCRYPTION_KEY
  if (configured) {
    const key = /^[0-9a-f]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64')
    if (key.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes in hex or base64')
    return key
  }
  const keyPath = path.join(dataDir, 'encryption.key')
  if (isProduction) throw new Error('TOTP_ENCRYPTION_KEY is required in production')
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath)
  const key = crypto.randomBytes(32)
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
  console.warn(`Generated development encryption key at ${keyPath}`)
  return key
}
