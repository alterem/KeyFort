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
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(body?.message || '请求失败，请重试')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function getAuthStatus() {
  return request<{ setupRequired: boolean; user: User | null }>('/api/auth/status')
}

export function setupAccount(payload: { email: string; name: string; password: string }) {
  return request<{ user: User }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(payload) })
}

export function login(payload: { email: string; password: string }) {
  return request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) })
}

export function logout() {
  return request<void>('/api/auth/logout', { method: 'POST' })
}

export function listPublicAccounts() {
  return request<{ accounts: AccountView[] }>('/api/public/accounts')
}

export function listAccounts() {
  return request<{ accounts: AccountView[] }>('/api/accounts')
}

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
}

export function createAccount(payload: AccountPayload) {
  return request<{ account: AccountView }>('/api/accounts', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateAccount(id: string, payload: AccountPayload) {
  return request<{ account: AccountView }>(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteAccount(id: string) {
  return request<void>(`/api/accounts/${id}`, { method: 'DELETE' })
}

export interface Member {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  createdAt: number
}

export function listMembers() {
  return request<{ members: Member[] }>('/api/team/members')
}

export function createMember(payload: { email: string; name: string; password: string }) {
  return request<{ member: Member }>('/api/team/members', { method: 'POST', body: JSON.stringify(payload) })
}

export function deleteMember(id: string) {
  return request<void>(`/api/team/members/${id}`, { method: 'DELETE' })
}
