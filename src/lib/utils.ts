import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// crypto.randomUUID 仅在安全上下文（HTTPS 或 localhost）下存在，局域网以
// http://<ip> 访问时为 undefined，直接调用会抛 TypeError 并让页面白屏。
// crypto.getRandomValues 不受该限制，据此按 RFC 4122 拼出 v4 UUID。
//
// 该 id 仅用于前端表单的临时标识：服务端 create() 会自行生成入库 id 并
// 忽略请求中的值，因此降级实现不影响服务端的唯一性或安全保证。
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
