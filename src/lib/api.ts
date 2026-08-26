import type { Algorithm, TokenDigits, TokenPeriod, TotpAccount } from '../types'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
}

export interface AccountView extends Omit<TotpAccount, 'secret'> {
  token: string | null
  remaining: number
  deletedAt?: number | null
}

function cookieValue(name: string) {
  return document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || ''
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() || 'GET'
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD'].includes(method)) {
    const csrf = cookieValue('keyfort_csrf')
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }
  const response = await fetch(path, { ...options, credentials: 'include', headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; reauthRequired?: boolean } | null
    const error = new Error(body?.message || '请求失败，请重试') as ApiError
    error.status = response.status
    error.reauthRequired = body?.reauthRequired
    throw error
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export interface ApiError extends Error {
  status?: number
  reauthRequired?: boolean
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

export function getAuthStatus() { return request<{ setupRequired: boolean; user: User | null }>('/api/auth/status') }
export function setupAccount(payload: { email: string; name: string; password: string }) { return request<{ user: User }>('/api/auth/setup', json('POST', payload)) }
export function login(payload: { email: string; password: string }) { return request<{ user: User }>('/api/auth/login', json('POST', payload)) }
export function logout() { return request<void>('/api/auth/logout', json('POST')) }
export function verifyPassword(password: string) { return request<void>('/api/auth/verify', json('POST', { password })) }
export function changePassword(payload: { currentPassword: string; newPassword: string }) { return request<void>('/api/auth/password', json('PUT', payload)) }

export interface SessionView {
  id: string
  createdAt: number
  lastSeenAt: number
  ip: string
  userAgent: string
  current: boolean
}
export function listSessions() { return request<{ sessions: SessionView[] }>('/api/auth/sessions') }
export function revokeSession(id: string) { return request<void>(`/api/auth/sessions/${id}`, json('DELETE')) }

export function listPublicAccounts() { return request<{ accounts: AccountView[] }>('/api/public/accounts') }
export function accessShare(token: string, password = '') { return request<{ account: AccountView; share: { accessNonce: string; expiresAt: number | null; remainingViews: number | null } }>(`/api/share/${token}/access`, json('POST', { password })) }
export function refreshShare(token: string, accessNonce: string) { return request<{ account: AccountView }>(`/api/share/${token}/refresh`, json('POST', { accessNonce })) }
export function listAccounts() { return request<{ accounts: AccountView[] }>('/api/accounts') }
export function listTrash() { return request<{ accounts: AccountView[] }>('/api/accounts/trash') }

export interface AccountPayload {
  name: string
  account: string
  issuer: string
  secret?: string
  digits: TokenDigits
  period: TokenPeriod
  algorithm: Algorithm
  notes: string
  favorite: boolean
  publicAccess: boolean
  color: string
  tags?: string[]
  accessMode?: 'all' | 'restricted' | 'admin'
  memberIds?: string[]
  pinned?: boolean
  sortOrder?: number
}

export function createAccount(payload: AccountPayload) { return request<{ account: AccountView }>('/api/accounts', json('POST', payload)) }
export function importAccounts(accounts: AccountPayload[]) { return request<{ accounts: AccountView[]; errors: { index: number; message: string }[] }>('/api/accounts/import', json('POST', { accounts })) }
export function updateAccount(id: string, payload: AccountPayload) { return request<{ account: AccountView }>(`/api/accounts/${id}`, json('PUT', payload)) }
export function updateFavorite(id: string, favorite: boolean) { return request<{ account: AccountView }>(`/api/accounts/${id}/favorite`, json('PATCH', { favorite })) }
export function updatePublicAccess(id: string, publicAccess: boolean) { return request<{ account: AccountView }>(`/api/accounts/${id}/public-access`, json('PATCH', { publicAccess })) }
export function updatePinned(id: string, pinned: boolean) { return request<{ account: AccountView }>(`/api/accounts/${id}/pinned`, json('PATCH', { pinned })) }
export function reorderAccounts(ids: string[]) { return request<void>('/api/accounts/reorder', json('PATCH', { ids })) }
export function deleteAccount(id: string) { return request<void>(`/api/accounts/${id}`, json('DELETE')) }
export function restoreAccount(id: string) { return request<void>(`/api/accounts/${id}/restore`, json('POST')) }
export function destroyAccount(id: string) { return request<void>(`/api/accounts/${id}/permanent`, json('DELETE')) }

export interface Member { id: string; email: string; name: string; role: 'admin' | 'member'; createdAt: number }
export function listMembers() { return request<{ members: Member[] }>('/api/team/members') }
export function createMember(payload: { email: string; name: string; password: string }) { return request<{ member: Member }>('/api/team/members', json('POST', payload)) }
export function resetMemberPassword(id: string, password: string) { return request<void>(`/api/team/members/${id}/password`, json('PUT', { password })) }
export function deleteMember(id: string) { return request<void>(`/api/team/members/${id}`, json('DELETE')) }

export interface AuditLog { id: string; action: string; targetType: string; targetId: string | null; targetName: string; details: Record<string, unknown>; ip: string; createdAt: number; userName: string | null; userEmail: string | null }
export function listAuditLogs() { return request<{ logs: AuditLog[] }>('/api/admin/audit') }

export interface ShareView { id: string; accountId: string; accountName: string; expiresAt: number | null; maxViews: number | null; viewCount: number; passwordProtected: boolean; revokedAt: number | null; createdAt: number }
export function createShare(accountId: string, payload: { password?: string; expiresIn?: number; maxViews?: number }) { return request<{ share: { id: string; token: string; expiresAt: number | null; maxViews: number | null; passwordProtected: boolean } }>(`/api/accounts/${accountId}/shares`, json('POST', payload)) }
export function listShares() { return request<{ shares: ShareView[] }>('/api/admin/shares') }
export function revokeShare(id: string) { return request<void>(`/api/admin/shares/${id}`, json('DELETE')) }

export interface HealthStatus { status: string; version: string; database: string; encryption: string; timestamp: number }
export function getHealth() { return request<HealthStatus>('/api/health') }
export function exportBackup(password: string) { return request<{ backup: Record<string, unknown> }>('/api/admin/backup/export', json('POST', { password })) }
export function previewBackup(backup: Record<string, unknown>, password: string) { return request<{ count: number; duplicates: number; exportedAt: number | null }>('/api/admin/backup/preview', json('POST', { backup, password })) }
export function importBackup(backup: Record<string, unknown>, password: string) { return request<{ imported: number; errors: number }>('/api/admin/backup/import', json('POST', { backup, password })) }
