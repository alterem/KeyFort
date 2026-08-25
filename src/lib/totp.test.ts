import { describe, expect, it } from 'vitest'
import { normalizeSecret, parseOtpUri, secondsRemaining } from './totp'

describe('totp helpers', () => {
  it('normalizes grouped base32 secrets', () => {
    expect(normalizeSecret('jbsw y3dp-ehpk 3pxp')).toBe('JBSWY3DPEHPK3PXP')
  })

  it('parses standard otpauth URIs', () => {
    const account = parseOtpUri('otpauth://totp/Acme%3Aalice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme&digits=8&period=60&algorithm=SHA256')
    expect(account).toMatchObject({
      name: 'Acme',
      account: 'alice@example.com',
      issuer: 'Acme',
      secret: 'JBSWY3DPEHPK3PXP',
      digits: 8,
      period: 60,
      algorithm: 'SHA256',
    })
  })

  it('calculates the remaining period seconds', () => {
    expect(secondsRemaining(30, 1_700_000_000_000)).toBe(10)
    expect(secondsRemaining(60, 1_700_000_029_000)).toBe(11)
  })
})
