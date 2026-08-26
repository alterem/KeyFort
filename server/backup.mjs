import crypto from 'node:crypto'

const iterations = 210_000

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
}

export function encryptBackup(data, password) {
  if (String(password).length < 10) throw new Error('备份密码至少需要 10 个字符')
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  return {
    format: 'keyfort-backup',
    version: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: salt.toString('base64') },
    cipher: { name: 'AES-256-GCM', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') },
    data: encrypted.toString('base64'),
  }
}

export function decryptBackup(payload, password) {
  if (payload?.format !== 'keyfort-backup' || payload?.version !== 1) throw new Error('备份文件格式不受支持')
  const salt = Buffer.from(payload.kdf.salt, 'base64')
  const iv = Buffer.from(payload.cipher.iv, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv)
  decipher.setAuthTag(Buffer.from(payload.cipher.tag, 'base64'))
  try {
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8')
    return JSON.parse(plaintext)
  } catch {
    throw new Error('备份密码错误或文件已损坏')
  }
}
