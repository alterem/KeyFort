import { describe, expect, it } from 'vitest'
import { DEFAULT_PASSWORD_RULES, generatePassword, passwordEntropy } from './password-generator'

describe('password generator', () => {
  it('generates a password that follows the default rules', () => {
    const password = generatePassword(DEFAULT_PASSWORD_RULES)
    expect(password).toHaveLength(DEFAULT_PASSWORD_RULES.length)
    expect(password[0]).toMatch(/[A-Za-z]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[0-9]/)
    expect(Array.from(password).some((character) => DEFAULT_PASSWORD_RULES.symbolCharacters.includes(character))).toBe(true)
    expect(password).not.toMatch(/(.)\1/)
    expect(Array.from(password).some((character) => 'Il1O0o|`\'"'.includes(character))).toBe(false)
  })

  it('honors excluded characters and custom character sets', () => {
    const password = generatePassword({
      ...DEFAULT_PASSWORD_RULES,
      length: 18,
      lowercase: true,
      uppercase: false,
      numbers: false,
      symbols: true,
      symbolCharacters: '_-+',
      excludeAmbiguous: false,
      excludedCharacters: 'ae_',
      startWithLetter: true,
      avoidRepeating: false,
    })
    expect(password).toHaveLength(18)
    expect(password[0]).toMatch(/[a-z]/)
    expect(password).toMatch(/[+-]/)
    expect(password).not.toMatch(/[ae_]/)
    expect(Array.from(password).every((character) => /[a-z]/.test(character) || '_-+'.includes(character))).toBe(true)
  })

  it('rejects rules that cannot produce a valid password', () => {
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_RULES, lowercase: false, uppercase: false, startWithLetter: true })).toThrow('首字符为字母')
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_RULES, lowercase: false, uppercase: false, numbers: false, symbols: false })).toThrow('至少启用')
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_RULES, length: 3 })).toThrow('长度必须')
  })

  it('estimates entropy from the active character set', () => {
    expect(passwordEntropy({ ...DEFAULT_PASSWORD_RULES, length: 32 })).toBeGreaterThan(passwordEntropy({ ...DEFAULT_PASSWORD_RULES, length: 12 }))
  })
})
