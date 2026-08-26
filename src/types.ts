export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512'
export type TokenDigits = 6 | 7 | 8
export type TokenPeriod = 30 | 60

export interface TotpAccount {
  id: string
  name: string
  account: string
  issuer: string
  secret: string
  digits: TokenDigits
  period: TokenPeriod
  algorithm: Algorithm
  notes: string
  favorite: boolean
  publicAccess: boolean
  color: string
  createdAt: number
  updatedAt: number
}

export interface VaultData {
  version: 1
  accounts: TotpAccount[]
}

export interface StoredVault {
  version: 1
  salt: string
  iv: string
  ciphertext: string
}

export interface UnlockedVault {
  data: VaultData
  key: CryptoKey
  salt: Uint8Array<ArrayBuffer>
}
