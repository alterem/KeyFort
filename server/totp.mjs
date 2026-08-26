import * as OTPAuth from 'otpauth'

export const allowedDigits = [6, 7, 8]
export const allowedPeriods = [30, 60]
export const allowedAlgorithms = ['SHA1', 'SHA256', 'SHA512']

export function normalizeSecret(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '')
}

export function validSecret(value) {
  return /^[A-Z2-7]+=*$/.test(value)
}

export function accountSettings(source = {}) {
  return {
    digits: allowedDigits.includes(Number(source.digits)) ? Number(source.digits) : 6,
    period: allowedPeriods.includes(Number(source.period)) ? Number(source.period) : 30,
    algorithm: allowedAlgorithms.includes(source.algorithm) ? source.algorithm : 'SHA1',
    color: source.color || '#287a5d',
  }
}

export function validateAccount(body, requiresSecret = true) {
  const secret = normalizeSecret(body.secret)
  if (!String(body.name || '').trim()) return { error: '请填写验证项名称' }
  if (requiresSecret && !validSecret(secret)) return { error: '请输入有效的 Base32 Secret Key' }
  if (body.digits !== undefined && !allowedDigits.includes(Number(body.digits))) return { error: '验证码位数无效' }
  if (body.period !== undefined && !allowedPeriods.includes(Number(body.period))) return { error: '验证码周期无效' }
  if (body.algorithm !== undefined && !allowedAlgorithms.includes(body.algorithm)) return { error: '验证码算法无效' }
  return { secret }
}

export function tokenForAccount(row, decryptSecret) {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: row.issuer,
      label: row.account || row.name,
      algorithm: row.algorithm,
      digits: row.digits,
      period: row.period,
      secret: OTPAuth.Secret.fromBase32(decryptSecret(row)),
    })
    const remaining = row.period - (Math.floor(Date.now() / 1000) % row.period)
    return { token: totp.generate(), remaining }
  } catch {
    return { token: null, remaining: row.period }
  }
}
