import crypto from 'node:crypto'
import { accountSettings, tokenForAccount, validateAccount } from './totp.mjs'

function parseJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

export function createAccountService({ db, encryptSecret, decryptSecret }) {
  function memberIds(id) {
    return db.prepare('SELECT user_id FROM account_members WHERE account_id = ?').all(id).map((row) => row.user_id)
  }

  function serialize(row, includeMembers = false) {
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
      tags: parseJson(row.tags, []),
      accessMode: row.access_mode,
      memberIds: includeMembers ? memberIds(row.id) : [],
      pinned: Boolean(row.pinned),
      sortOrder: row.sort_order,
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      ...tokenForAccount(row, decryptSecret),
    }
  }

  function get(id) {
    return db.prepare('SELECT * FROM accounts WHERE id = ? AND config_default = 0').get(id)
  }

  function canAccess(row, user) {
    if (!row || user.role === 'admin') return Boolean(row)
    if (row.access_mode === 'all') return true
    if (row.access_mode === 'admin') return false
    return Boolean(db.prepare('SELECT 1 FROM account_members WHERE account_id = ? AND user_id = ?').get(row.id, user.id))
  }

  function list(user, { deleted = false } = {}) {
    const rows = db.prepare(`
      SELECT DISTINCT accounts.* FROM accounts
      LEFT JOIN account_members ON account_members.account_id = accounts.id
      WHERE config_default = 0 AND deleted_at ${deleted ? 'IS NOT' : 'IS'} NULL
        AND (? = 'admin' OR access_mode = 'all' OR account_members.user_id = ?)
      ORDER BY pinned DESC, sort_order ASC, favorite DESC, name COLLATE NOCASE ASC
    `).all(user.role, user.id)
    return rows.map((row) => serialize(row, user.role === 'admin'))
  }

  function normalizeInput(body, current = {}) {
    const settings = accountSettings({ ...current, ...body })
    const tags = Array.from(new Set((Array.isArray(body.tags) ? body.tags : parseJson(current.tags, [])).map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 20)
    const accessMode = ['all', 'restricted', 'admin'].includes(body.accessMode) ? body.accessMode : (current.access_mode || 'all')
    return {
      name: String(body.name ?? current.name ?? '').trim(),
      account: String(body.account ?? current.account ?? '').trim(),
      issuer: String(body.issuer ?? current.issuer ?? '').trim(),
      notes: String(body.notes ?? current.notes ?? '').trim(),
      favorite: body.favorite === undefined ? Number(current.favorite || 0) : Number(Boolean(body.favorite)),
      publicAccess: body.publicAccess === undefined ? Number(current.public_access || 0) : Number(Boolean(body.publicAccess)),
      pinned: body.pinned === undefined ? Number(current.pinned || 0) : Number(Boolean(body.pinned)),
      sortOrder: Number(body.sortOrder ?? current.sort_order ?? 0),
      tags: JSON.stringify(tags),
      accessMode,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : memberIds(current.id || ''),
      ...settings,
    }
  }

  function setMembers(accountId, ids) {
    const replace = db.transaction(() => {
      db.prepare('DELETE FROM account_members WHERE account_id = ?').run(accountId)
      const insert = db.prepare('INSERT OR IGNORE INTO account_members (account_id, user_id) SELECT ?, id FROM users WHERE id = ?')
      ids.forEach((id) => insert.run(accountId, id))
    })
    replace()
  }

  function create(body) {
    const validation = validateAccount(body)
    if (validation.error) return validation
    const values = normalizeInput(body)
    const id = crypto.randomUUID()
    const now = Date.now()
    const encrypted = encryptSecret(validation.secret)
    db.prepare(`INSERT INTO accounts
      (id, name, account, issuer, secret_ciphertext, secret_iv, digits, period, algorithm, notes, favorite, public_access, config_default, color, tags, access_mode, pinned, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, values.name, values.account, values.issuer, encrypted.ciphertext, encrypted.iv, values.digits, values.period,
        values.algorithm, values.notes, values.favorite, values.publicAccess, values.color, values.tags, values.accessMode,
        values.pinned, values.sortOrder, now, now)
    setMembers(id, values.memberIds)
    return { account: serialize(get(id), true) }
  }

  function update(id, body) {
    const current = get(id)
    if (!current || current.deleted_at) return { error: '验证项不存在', status: 404 }
    const validation = validateAccount({ ...current, ...body }, false)
    if (validation.error) return validation
    const values = normalizeInput(body, current)
    const encrypted = validation.secret ? encryptSecret(validation.secret) : { ciphertext: current.secret_ciphertext, iv: current.secret_iv }
    db.prepare(`UPDATE accounts SET name=?, account=?, issuer=?, secret_ciphertext=?, secret_iv=?, digits=?, period=?, algorithm=?, notes=?, favorite=?, public_access=?, color=?, tags=?, access_mode=?, pinned=?, sort_order=?, updated_at=? WHERE id=?`)
      .run(values.name, values.account, values.issuer, encrypted.ciphertext, encrypted.iv, values.digits, values.period,
        values.algorithm, values.notes, values.favorite, values.publicAccess, values.color, values.tags, values.accessMode,
        values.pinned, values.sortOrder, Date.now(), id)
    setMembers(id, values.memberIds)
    return { account: serialize(get(id), true) }
  }

  function setField(id, field, value) {
    const allowed = new Map([['favorite', 'favorite'], ['publicAccess', 'public_access'], ['pinned', 'pinned'], ['sortOrder', 'sort_order']])
    const column = allowed.get(field)
    if (!column) throw new Error('Unsupported account field')
    const result = db.prepare(`UPDATE accounts SET ${column} = ?, updated_at = ? WHERE id = ? AND config_default = 0 AND deleted_at IS NULL`)
      .run(typeof value === 'boolean' ? Number(value) : Number(value), Date.now(), id)
    if (!result.changes) return null
    return serialize(get(id), true)
  }

  function trash(id) {
    return db.prepare('UPDATE accounts SET deleted_at = ?, public_access = 0, updated_at = ? WHERE id = ? AND config_default = 0 AND deleted_at IS NULL').run(Date.now(), Date.now(), id).changes > 0
  }

  function restore(id) {
    return db.prepare('UPDATE accounts SET deleted_at = NULL, updated_at = ? WHERE id = ? AND config_default = 0 AND deleted_at IS NOT NULL').run(Date.now(), id).changes > 0
  }

  function destroy(id) {
    return db.prepare('DELETE FROM accounts WHERE id = ? AND config_default = 0 AND deleted_at IS NOT NULL').run(id).changes > 0
  }

  function exportRows() {
    return db.prepare('SELECT * FROM accounts WHERE config_default = 0').all().map((row) => ({
      ...serialize(row, true),
      secret: decryptSecret(row),
      token: undefined,
      remaining: undefined,
    }))
  }

  return { serialize, get, canAccess, list, create, update, setField, trash, restore, destroy, exportRows }
}
