function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  const selection = document.getSelection()
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)) : []
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

  textarea.value = text
  textarea.readOnly = true
  textarea.setAttribute('aria-hidden', 'true')
  Object.assign(textarea.style, {
    position: 'fixed',
    top: '0',
    left: '-9999px',
    width: '1px',
    height: '1px',
    opacity: '0',
  })

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
    activeElement?.focus()
    if (selection) {
      selection.removeAllRanges()
      ranges.forEach((range) => selection.addRange(range))
    }
  }
  return copied
}

export async function copyText(text: string): Promise<void> {
  if (!text) throw new Error('没有可复制的内容')

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Some browsers expose the API but deny clipboard permission.
    }
  }

  if (!legacyCopy(text)) {
    throw new Error('复制失败，请长按验证码手动复制')
  }
}
