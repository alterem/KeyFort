import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText, waitForFreshToken } from './clipboard'

class MockElement {
  value = ''
  readOnly = false
  style = {}
  setAttribute = vi.fn()
  focus = vi.fn()
  select = vi.fn()
  setSelectionRange = vi.fn()
  remove = vi.fn()
}

function stubLegacyClipboard(result: boolean) {
  const textarea = new MockElement()
  const execCommand = vi.fn(() => result)
  vi.stubGlobal('HTMLElement', MockElement)
  vi.stubGlobal('document', {
    activeElement: null,
    body: { appendChild: vi.fn() },
    createElement: vi.fn(() => textarea),
    execCommand,
    getSelection: vi.fn(() => null),
  })
  return { execCommand, textarea }
}

afterEach(() => vi.unstubAllGlobals())

describe('waitForFreshToken', () => {
  it('returns the current token when it has enough time remaining', async () => {
    const account = { token: '123456', remaining: 10 }
    const refresh = vi.fn()
    await expect(waitForFreshToken(account, refresh)).resolves.toBe(account)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('waits for the next period when the token is expiring', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn().mockResolvedValue({ token: '654321', remaining: 30 })
    const result = waitForFreshToken({ token: '123456', remaining: 2 }, refresh)
    await vi.advanceTimersByTimeAsync(3000)
    await expect(result).resolves.toMatchObject({ token: '654321' })
    vi.useRealTimers()
  })
})

describe('copyText', () => {
  it('uses the Clipboard API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', { isSecureContext: true })
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await copyText('123456')

    expect(writeText).toHaveBeenCalledWith('123456')
  })

  it('falls back when Clipboard API access is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('window', { isSecureContext: true })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { execCommand, textarea } = stubLegacyClipboard(true)

    await copyText('654321')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(textarea.value).toBe('654321')
    expect(textarea.remove).toHaveBeenCalled()
  })

  it('reports a failure when neither method can copy', async () => {
    vi.stubGlobal('window', { isSecureContext: false })
    vi.stubGlobal('navigator', {})
    stubLegacyClipboard(false)

    await expect(copyText('123456')).rejects.toThrow('复制失败')
  })
})
