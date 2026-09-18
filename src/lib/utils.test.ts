import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomId } from './utils'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('randomId', () => {
  it('uses crypto.randomUUID when the page is a secure context', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() })

    expect(randomId()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  // Plain-HTTP LAN origins are not secure contexts, so randomUUID is absent.
  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xff)
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    const id = randomId()
    expect(id).toMatch(V4)
    expect(getRandomValues).toHaveBeenCalledOnce()
  })

  it('keeps the version and variant bits valid across random inputs', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index * 17
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    expect(randomId()).toMatch(V4)
  })

  it('produces distinct values on repeated calls', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = Math.floor(Math.random() * 256)
        }
        return bytes
      },
    })

    const ids = new Set(Array.from({ length: 200 }, () => randomId()))
    expect(ids.size).toBe(200)
  })
})
