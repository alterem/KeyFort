import * as OTPAuth from 'otpauth'
import type { Algorithm, TokenDigits, TokenPeriod, TotpAccount } from '../types'

export function normalizeSecret(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '')
}

export function generateToken(account: TotpAccount): string | null {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: account.issuer,
      label: account.account || account.name,
      algorithm: account.algorithm,
      digits: account.digits,
      period: account.period,
      secret: OTPAuth.Secret.fromBase32(normalizeSecret(account.secret)),
    })
    return totp.generate()
  } catch {
    return null
  }
}

export function secondsRemaining(period: number, now = Date.now()): number {
  return period - (Math.floor(now / 1000) % period)
}

export function parseOtpUri(value: string): Partial<TotpAccount> | null {
  if (!value.trim().toLowerCase().startsWith('otpauth://')) return null
  try {
    const uri = new URL(value.trim())
    if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp') return null
    const label = decodeURIComponent(uri.pathname.replace(/^\//, ''))
    const separator = label.indexOf(':')
    const labelIssuer = separator >= 0 ? label.slice(0, separator) : ''
    const labelAccount = separator >= 0 ? label.slice(separator + 1) : label
    const issuer = uri.searchParams.get('issuer') || labelIssuer
    const digits = Number(uri.searchParams.get('digits') || 6)
    const period = Number(uri.searchParams.get('period') || 30)
    const algorithm = (uri.searchParams.get('algorithm') || 'SHA1').toUpperCase()

    if (![6, 7, 8].includes(digits) || ![30, 60].includes(period)) return null
    if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) return null

    return {
      secret: normalizeSecret(uri.searchParams.get('secret') || ''),
      issuer,
      name: issuer || labelAccount || '未命名服务',
      account: labelAccount,
      digits: digits as TokenDigits,
      period: period as TokenPeriod,
      algorithm: algorithm as Algorithm,
    }
  } catch {
    return null
  }
}

export function formatToken(token: string | null): string {
  if (!token) return '------'
  const midpoint = Math.ceil(token.length / 2)
  return `${token.slice(0, midpoint)} ${token.slice(midpoint)}`
}
