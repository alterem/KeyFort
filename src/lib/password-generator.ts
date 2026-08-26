export interface PasswordRules {
  length: number
  lowercase: boolean
  uppercase: boolean
  numbers: boolean
  symbols: boolean
  symbolCharacters: string
  excludeAmbiguous: boolean
  excludedCharacters: string
  startWithLetter: boolean
  avoidRepeating: boolean
}

export const DEFAULT_PASSWORD_RULES: PasswordRules = {
  length: 24,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
  symbolCharacters: '!@#$%^&*()-_=+[]{};:,.?',
  excludeAmbiguous: true,
  excludedCharacters: '',
  startWithLetter: true,
  avoidRepeating: true,
}

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const NUMBERS = '0123456789'
const AMBIGUOUS = 'Il1O0o|`\'"'

function uniqueCharacters(value: string) {
  return Array.from(new Set(value))
}

function randomIndex(max: number) {
  if (!Number.isSafeInteger(max) || max < 1) throw new Error('可用字符不足')
  const range = 0x1_0000_0000
  const limit = range - (range % max)
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value)
  while (value[0] >= limit)
  return value[0] % max
}

function pick(characters: string[], previous = '', avoidRepeating = false) {
  const available = avoidRepeating ? characters.filter((character) => character !== previous) : characters
  if (!available.length) throw new Error('当前规则无法避免连续重复字符')
  return available[randomIndex(available.length)]
}

function characterPools(rules: PasswordRules) {
  const excluded = new Set(rules.excludedCharacters)
  if (rules.excludeAmbiguous) Array.from(AMBIGUOUS).forEach((character) => excluded.add(character))
  const filter = (value: string) => uniqueCharacters(value).filter((character) => !excluded.has(character))
  return [
    rules.lowercase ? filter(LOWERCASE) : [],
    rules.uppercase ? filter(UPPERCASE) : [],
    rules.numbers ? filter(NUMBERS) : [],
    rules.symbols ? filter(rules.symbolCharacters) : [],
  ].filter((pool) => pool.length > 0)
}

function generateAttempt(rules: PasswordRules, pools: string[][]) {
  const letters = pools.filter((pool) => pool.some((character) => /[A-Za-z]/.test(character))).flat()
  if (rules.startWithLetter && !letters.length) throw new Error('首字符为字母时需要启用大小写字母')

  const requirements = new Map<number, string[]>()
  const availablePositions = Array.from({ length: rules.length }, (_, index) => index)
  if (rules.startWithLetter) {
    const firstPool = pools.filter((pool) => pool.some((character) => /[A-Za-z]/.test(character)))[randomIndex(pools.filter((pool) => pool.some((character) => /[A-Za-z]/.test(character))).length)]
    requirements.set(0, firstPool)
    availablePositions.shift()
    pools.filter((pool) => pool !== firstPool).forEach((pool) => {
      const positionIndex = randomIndex(availablePositions.length)
      requirements.set(availablePositions.splice(positionIndex, 1)[0], pool)
    })
  } else {
    pools.forEach((pool) => {
      const positionIndex = randomIndex(availablePositions.length)
      requirements.set(availablePositions.splice(positionIndex, 1)[0], pool)
    })
  }

  const combined = uniqueCharacters(pools.flat().join(''))
  let result = ''
  for (let index = 0; index < rules.length; index += 1) {
    result += pick(requirements.get(index) || combined, result.at(-1), rules.avoidRepeating)
  }
  return result
}

export function generatePassword(rules: PasswordRules) {
  if (!Number.isInteger(rules.length) || rules.length < 4 || rules.length > 128) throw new Error('密码长度必须在 4 到 128 之间')
  const pools = characterPools(rules)
  if (!pools.length) throw new Error('至少启用一种可用字符类型')
  if (rules.length < pools.length) throw new Error('密码长度不足以包含所有字符类型')

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { return generateAttempt(rules, pools) }
    catch (error) {
      if (attempt === 99) throw error
    }
  }
  throw new Error('无法按照当前规则生成密码')
}

export function passwordEntropy(rules: PasswordRules) {
  const size = uniqueCharacters(characterPools(rules).flat().join('')).length
  return size > 1 ? Math.floor(rules.length * Math.log2(size)) : 0
}

export function entropyLevel(bits: number) {
  if (bits < 50) return { label: '较弱', level: 1 }
  if (bits < 70) return { label: '一般', level: 2 }
  if (bits < 100) return { label: '强', level: 3 }
  return { label: '非常强', level: 4 }
}
