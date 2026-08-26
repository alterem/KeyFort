import crypto from 'node:crypto'

export function createAudit(db) {
  function record(req, action, targetType, target = {}, details = {}) {
    db.prepare(`INSERT INTO audit_logs
      (id, user_id, action, target_type, target_id, target_name, details, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        crypto.randomUUID(), req.user?.id || null, action, targetType, target.id || null,
        String(target.name || ''), JSON.stringify(details), String(req.ip || '').slice(0, 120), Date.now(),
      )
  }

  function list({ limit = 100, offset = 0 } = {}) {
    return db.prepare(`
      SELECT audit_logs.id, audit_logs.action, audit_logs.target_type AS targetType,
        audit_logs.target_id AS targetId, audit_logs.target_name AS targetName,
        audit_logs.details, audit_logs.ip, audit_logs.created_at AS createdAt,
        users.name AS userName, users.email AS userEmail
      FROM audit_logs LEFT JOIN users ON users.id = audit_logs.user_id
      ORDER BY audit_logs.created_at DESC LIMIT ? OFFSET ?
    `).all(Math.min(Number(limit) || 100, 200), Math.max(Number(offset) || 0, 0)).map((row) => ({
      ...row,
      details: JSON.parse(row.details || '{}'),
    }))
  }

  return { record, list }
}
