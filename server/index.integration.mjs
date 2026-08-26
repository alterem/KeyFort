import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyfort-test-'))
process.env.NODE_ENV = 'test'
process.env.DATABASE_PATH = path.join(tempDir, 'test.db')
process.env.DEFAULT_TOTP_SECRET = ''
process.env.TOTP_ENCRYPTION_KEY = Buffer.from('12345678901234567890123456789012').toString('base64')
const { app, db } = await import('./index.mjs')
let server
let base

class Client {
  cookies = {}
  async call(route, { method = 'GET', body, status = 200, headers: extraHeaders = {} } = {}) {
    const headers = { Cookie: Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join('; '), ...extraHeaders }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (!['GET', 'HEAD'].includes(method) && this.cookies.keyfort_csrf) headers['X-CSRF-Token'] = this.cookies.keyfort_csrf
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    response.headers.getSetCookie().forEach((value) => {
      const [pair] = value.split(';')
      const [name, ...parts] = pair.split('=')
      this.cookies[name] = parts.join('=')
    })
    const text = await response.text()
    assert.equal(response.status, status, `${method} ${route}: ${text}`)
    return text ? JSON.parse(text) : null
  }
}

const admin = new Client()
const member = new Client()
let accountId
let shareToken
let shareNonce

function accountPayload(overrides = {}) {
  return {
    name: 'Production', account: 'ops', issuer: 'Acme', secret: '', digits: 6,
    period: 30, algorithm: 'SHA1', notes: '', favorite: false, publicAccess: false, color: '#287a5d',
    tags: ['prod'], accessMode: 'admin', memberIds: [], pinned: true, ...overrides,
  }
}

before(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  await new Promise((resolve) => server.close(resolve))
  db.close()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

test('setup, CSRF and account metadata', async () => {
  await admin.call('/api/auth/status')
  await admin.call('/api/auth/setup', { method: 'POST', status: 201, body: { email: 'admin@example.com', name: 'Admin', password: 'password123' } })
  const payload = accountPayload({ secret: 'JBSWY3DPEHPK3PXP' })
  await admin.call('/api/accounts', { method: 'POST', status: 428, body: payload })
  await admin.call('/api/auth/verify', { method: 'POST', status: 204, body: { password: 'password123' } })
  const result = await admin.call('/api/accounts', { method: 'POST', status: 201, body: payload })
  accountId = result.account.id
  assert.deepEqual(result.account.tags, ['prod'])
  assert.equal(result.account.pinned, true)
})

test('member lifecycle and account permissions', async () => {
  await admin.call('/api/team/members', { method: 'POST', status: 201, body: { email: 'member@example.com', name: 'Member', password: 'password123' } })
  await member.call('/api/auth/status')
  await member.call('/api/auth/login', { method: 'POST', body: { email: 'member@example.com', password: 'password123' } })
  const list = await member.call('/api/accounts')
  assert.equal(list.accounts.some((account) => account.id === accountId), false)
  await member.call(`/api/accounts/${accountId}/public-access`, { method: 'PATCH', status: 403, body: { publicAccess: true } })

  await admin.call('/api/team/members', { method: 'POST', status: 201, body: { email: 'allowed@example.com', name: 'Allowed', password: 'password123' } })
  const allowedMember = (await admin.call('/api/team/members')).members.find((item) => item.email === 'allowed@example.com')
  await admin.call(`/api/accounts/${accountId}`, { method: 'PUT', body: accountPayload({ accessMode: 'restricted', memberIds: [allowedMember.id] }) })

  const allowed = new Client()
  await allowed.call('/api/auth/status')
  await allowed.call('/api/auth/login', { method: 'POST', body: { email: 'allowed@example.com', password: 'password123' } })
  const visible = await allowed.call('/api/accounts')
  const item = visible.accounts.find((account) => account.id === accountId)
  assert.ok(item)
  await allowed.call(`/api/accounts/${accountId}`, { method: 'PUT', body: { ...item, name: 'Production Updated', secret: undefined } })
  const updated = (await admin.call('/api/accounts')).accounts.find((account) => account.id === accountId)
  assert.equal(updated.memberIds.includes(allowedMember.id), true)
})

test('reorder uses one permission-checked transaction', async () => {
  await admin.call('/api/accounts/reorder', { method: 'PATCH', status: 204, body: { ids: [accountId] } })
  await member.call('/api/accounts/reorder', { method: 'PATCH', status: 403, body: { ids: [accountId] } })
})

test('CSRF allows the Vite origin and rejects unknown origins', async () => {
  await admin.call('/api/accounts/reorder', { method: 'PATCH', status: 204, headers: { Origin: 'http://localhost:5173' }, body: { ids: [accountId] } })
  await admin.call('/api/accounts', {
    method: 'POST', status: 403, headers: { Origin: 'https://evil.example' },
    body: accountPayload({ secret: 'JBSWY3DPEHPK3PXP', accessMode: 'all' }),
  })
})

test('trash requires explicit reauthentication for permanent deletion', async () => {
  db.prepare('UPDATE sessions SET verified_at = 0').run()
  await admin.call(`/api/accounts/${accountId}`, { method: 'DELETE', status: 204 })
  const trash = await admin.call('/api/accounts/trash')
  assert.equal(trash.accounts.some((account) => account.id === accountId), true)
  await admin.call(`/api/accounts/${accountId}/permanent`, { method: 'DELETE', status: 428 })
  await admin.call('/api/auth/verify', { method: 'POST', status: 204, body: { password: 'password123' } })
  await admin.call(`/api/accounts/${accountId}/restore`, { method: 'POST', status: 204 })
})

test('password-protected shares refresh without consuming another view', async () => {
  const result = await admin.call(`/api/accounts/${accountId}/shares`, { method: 'POST', status: 201, body: { expiresIn: 3600, password: 'sharepass', maxViews: 2 } })
  shareToken = result.share.token
  const anonymous = new Client()
  await anonymous.call(`/api/share/${shareToken}/access`, { method: 'POST', status: 401, body: { password: 'bad' } })
  const access = await anonymous.call(`/api/share/${shareToken}/access`, { method: 'POST', body: { password: 'sharepass' } })
  shareNonce = access.share.accessNonce
  assert.ok(access.account.token)
  const refreshed = await anonymous.call(`/api/share/${shareToken}/refresh`, { method: 'POST', body: { accessNonce: shareNonce } })
  assert.ok(refreshed.account.token)
  const shares = await admin.call('/api/admin/shares')
  assert.equal(shares.shares.find((share) => share.id === result.share.id).viewCount, 1)
})

test('downgrading to admin-only revokes member visibility', async () => {
  await admin.call('/api/auth/verify', { method: 'POST', status: 204, body: { password: 'password123' } })
  const memberId = (await admin.call('/api/team/members')).members.find((item) => item.email === 'member@example.com').id
  const target = (await admin.call('/api/accounts', {
    method: 'POST', status: 201,
    body: accountPayload({ name: 'Downgrade', secret: 'JBSWY3DPEHPK3PXP', accessMode: 'restricted', memberIds: [memberId] }),
  })).account
  assert.equal((await member.call('/api/accounts')).accounts.some((item) => item.id === target.id), true)

  await admin.call(`/api/accounts/${target.id}`, { method: 'PUT', body: accountPayload({ name: 'Downgrade', accessMode: 'admin', secret: undefined }) })
  const visible = (await member.call('/api/accounts')).accounts
  assert.equal(visible.some((item) => item.id === target.id), false, 'list() must agree with canAccess() for admin-only items')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account_members WHERE account_id = ?').get(target.id).count, 0)
})

test('import cannot skip the password re-check', async () => {
  const payload = { accounts: [accountPayload({ name: 'Imported', secret: 'JBSWY3DPEHPK3PXP', accessMode: 'all', publicAccess: true })] }
  db.prepare('UPDATE sessions SET verified_at = 0').run()
  await admin.call('/api/accounts/import', { method: 'POST', status: 428, body: payload })
  await admin.call('/api/auth/verify', { method: 'POST', status: 204, body: { password: 'password123' } })
  const result = await admin.call('/api/accounts/import', { method: 'POST', status: 201, body: payload })
  assert.equal(result.accounts.length, 1)
})

test('share refresh stops once the access window closes', async () => {
  const anonymous = new Client()
  const access = await anonymous.call(`/api/share/${shareToken}/access`, { method: 'POST', body: { password: 'sharepass' } })
  const refreshed = await anonymous.call(`/api/share/${shareToken}/refresh`, { method: 'POST', body: { accessNonce: access.share.accessNonce } })
  assert.ok(refreshed.account.token)
  db.prepare('UPDATE share_accesses SET expires_at = ?').run(Date.now() - 1)
  await anonymous.call(`/api/share/${shareToken}/refresh`, { method: 'POST', status: 401, body: { accessNonce: access.share.accessNonce } })
})

test('boolean toggles reject junk and unknown API routes return JSON', async () => {
  await admin.call(`/api/accounts/${accountId}/favorite`, { method: 'PATCH', status: 400, body: {} })
  const missing = await admin.call('/api/does-not-exist', { status: 404 })
  assert.equal(missing.message, '接口不存在')
})

test('audit, encrypted backup and health', async () => {
  const backup = await admin.call('/api/admin/backup/export', { method: 'POST', body: { password: 'backup-pass-123' } })
  assert.equal(backup.backup.format, 'keyfort-backup')
  const audit = await admin.call('/api/admin/audit')
  assert.ok(audit.logs.length >= 5)
  const health = await admin.call('/api/health')
  assert.equal(health.status, 'ok')
})
