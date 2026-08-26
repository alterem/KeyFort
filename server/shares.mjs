import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { hashToken } from './security.mjs'

// A successful /access grants a short refresh window instead of unlimited
// refreshes, so an exhausted or long-lived share cannot be replayed forever.
const accessWindowMs = 10 * 60 * 1000

const shareColumns = `shares.id AS share_id, shares.password_hash AS share_password_hash,
  shares.expires_at AS share_expires_at, shares.max_views AS share_max_views,
  shares.view_count AS share_view_count, accounts.*`

export function createShareService({ db, serializePublic }) {
  async function create({ accountId, password, expiresIn, maxViews, userId }) {
    const token = crypto.randomBytes(24).toString('base64url')
    const now = Date.now()
    const expiresAt = expiresIn ? now + Math.max(60, Number(expiresIn)) * 1000 : null
    const passwordHash = password ? await bcrypt.hash(String(password), 12) : null
    const id = crypto.randomUUID()
    db.prepare(`INSERT INTO shares
      (id, account_id, token_hash, password_hash, expires_at, max_views, view_count, revoked_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`)
      .run(id, accountId, hashToken(token), passwordHash, expiresAt, maxViews ? Math.max(1, Number(maxViews)) : null, userId, now)
    return { id, token, expiresAt, maxViews: maxViews ? Number(maxViews) : null, passwordProtected: Boolean(passwordHash) }
  }

  function list() {
    return db.prepare(`SELECT shares.id, shares.account_id AS accountId, accounts.name AS accountName,
      shares.expires_at AS expiresAt, shares.max_views AS maxViews, shares.view_count AS viewCount,
      shares.password_hash IS NOT NULL AS passwordProtected, shares.revoked_at AS revokedAt,
      shares.created_at AS createdAt FROM shares JOIN accounts ON accounts.id = shares.account_id
      ORDER BY shares.created_at DESC`).all().map((row) => ({ ...row, passwordProtected: Boolean(row.passwordProtected) }))
  }

  function revoke(id) {
    const revoked = db.prepare('UPDATE shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), id).changes > 0
    if (revoked) db.prepare('DELETE FROM share_accesses WHERE share_id = ?').run(id)
    return revoked
  }

  async function resolve(token, password) {
    const row = db.prepare(`SELECT ${shareColumns}
      FROM shares JOIN accounts ON accounts.id = shares.account_id
      WHERE shares.token_hash = ? AND shares.revoked_at IS NULL AND accounts.deleted_at IS NULL`).get(hashToken(token))
    if (!row) return { error: '分享链接不存在或已撤销', status: 404 }
    if (row.share_expires_at && row.share_expires_at <= Date.now()) return { error: '分享链接已过期', status: 410 }
    if (row.share_max_views && row.share_view_count >= row.share_max_views) return { error: '分享链接访问次数已用尽', status: 410 }
    if (row.share_password_hash && !(await bcrypt.compare(String(password || ''), row.share_password_hash))) {
      return { passwordRequired: true, error: '请输入正确的访问密码', status: 401 }
    }
    const now = Date.now()
    const accessNonce = crypto.randomBytes(24).toString('base64url')
    const accessExpiresAt = Math.min(now + accessWindowMs, row.share_expires_at || Number.MAX_SAFE_INTEGER)
    db.transaction(() => {
      db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(row.share_id)
      db.prepare('DELETE FROM share_accesses WHERE expires_at <= ?').run(now)
      db.prepare('INSERT INTO share_accesses (id, share_id, nonce_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), row.share_id, hashToken(accessNonce), accessExpiresAt, now)
    })()
    return {
      account: serializePublic(row),
      share: {
        accessNonce,
        expiresAt: row.share_expires_at,
        accessExpiresAt,
        remainingViews: row.share_max_views ? row.share_max_views - row.share_view_count - 1 : null,
      },
    }
  }

  function refresh(token, accessNonce) {
    const row = db.prepare(`SELECT ${shareColumns}, share_accesses.expires_at AS access_expires_at
      FROM shares
      JOIN accounts ON accounts.id = shares.account_id
      JOIN share_accesses ON share_accesses.share_id = shares.id
      WHERE shares.token_hash = ? AND share_accesses.nonce_hash = ?
        AND shares.revoked_at IS NULL AND accounts.deleted_at IS NULL`)
      .get(hashToken(token), hashToken(String(accessNonce || '')))
    if (!row) return { error: '分享访问凭证无效', status: 401 }
    if (row.access_expires_at <= Date.now()) return { error: '分享访问凭证已过期，请重新打开分享链接', status: 401 }
    if (row.share_expires_at && row.share_expires_at <= Date.now()) return { error: '分享链接已过期', status: 410 }
    return { account: serializePublic(row), share: { accessExpiresAt: row.access_expires_at } }
  }

  return { create, list, revoke, resolve, refresh }
}
