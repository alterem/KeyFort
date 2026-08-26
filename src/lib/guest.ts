import type { AccountView } from './api'
import { generateToken, secondsRemaining } from './totp'
import type { TotpAccount } from '../types'

const ACCOUNTS_KEY = 'keyfort.guest.accounts.v1'
const ACTIVE_KEY = 'keyfort.guest.active'

export function isGuestActive(): boolean {
  return localStorage.getItem(ACTIVE_KEY) === 'true'
}

export function enterGuestMode(): TotpAccount[] {
  localStorage.setItem(ACTIVE_KEY, 'true')
  return loadGuestAccounts()
}

export function leaveGuestMode(): void {
  localStorage.removeItem(ACTIVE_KEY)
}

export function loadGuestAccounts(): TotpAccount[] {
  const raw = localStorage.getItem(ACCOUNTS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((account): account is TotpAccount => (
      typeof account === 'object' && account !== null
      && typeof (account as TotpAccount).id === 'string'
      && typeof (account as TotpAccount).name === 'string'
      && typeof (account as TotpAccount).secret === 'string'
    ))
  } catch {
    return []
  }
}

export function saveGuestAccounts(accounts: TotpAccount[]): void {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function toGuestAccountView(account: TotpAccount, now = Date.now()): AccountView {
  return {
    id: account.id,
    name: account.name,
    account: account.account,
    issuer: account.issuer,
    digits: account.digits,
    period: account.period,
    algorithm: account.algorithm,
    notes: account.notes,
    favorite: account.favorite,
    publicAccess: account.publicAccess ?? false,
    color: account.color,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    token: generateToken(account),
    remaining: secondsRemaining(account.period, now),
  }
}
