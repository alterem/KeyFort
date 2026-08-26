import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { hashToken } from './security.mjs'

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
    return db.prepare('UPDATE shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), id).changes > 0
  }

  async function resolve(token, password) {
    const row = db.prepare(`SELECT shares.*, accounts.*,
      shares.id AS share_id, accounts.id AS account_id_value
      FROM shares JOIN accounts ON accounts.id = shares.account_id
      WHERE shares.token_hash = ? AND shares.revoked_at IS NULL AND accounts.deleted_at IS NULL`).get(hashToken(token))
    if (!row) return { error: '分享链接不存在或已撤销', status: 404 }
    if (row.expires_at && row.expires_at <= Date.now()) return { error: '分享链接已过期', status: 410 }
    if (row.max_views && row.view_count >= row.max_views) return { error: '分享链接访问次数已用尽', status: 410 }
    if (row.password_hash && !(await bcrypt.compare(String(password || ''), row.password_hash))) {
      return { passwordRequired: true, error: '请输入正确的访问密码', status: 401 }
    }
    const accessNonce = crypto.randomBytes(24).toString('base64url')
    db.prepare('UPDATE shares SET view_count = view_count + 1, access_nonce_hash = ? WHERE id = ?').run(hashToken(accessNonce), row.share_id)
    return {
      account: serializePublic({ ...row, id: row.account_id_value }),
      share: { accessNonce, expiresAt: row.expires_at, remainingViews: row.max_views ? row.max_views - row.view_count - 1 : null },
    }
  }

  function refresh(token, accessNonce) {
    const row = db.prepare(`SELECT shares.*, accounts.*, shares.id AS share_id, accounts.id AS account_id_value
      FROM shares JOIN accounts ON accounts.id = shares.account_id
      WHERE shares.token_hash = ? AND shares.access_nonce_hash = ? AND shares.revoked_at IS NULL AND accounts.deleted_at IS NULL`)
      .get(hashToken(token), hashToken(String(accessNonce || '')))
    if (!row) return { error: '分享访问凭证无效', status: 401 }
    if (row.expires_at && row.expires_at <= Date.now()) return { error: '分享链接已过期', status: 410 }
    return { account: serializePublic({ ...row, id: row.account_id_value }) }
  }

  return { create, list, revoke, resolve, refresh }
}
