import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, QrCode, Upload } from 'lucide-react'
import QrScanner from 'qr-scanner'
import { importAccounts, type AccountPayload } from '../lib/api'
import { parseOtpUri } from '../lib/totp'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'

interface ImportDialogProps { onClose: () => void; onImported: () => Promise<void>; onToast: (message: string) => void }

function parseLines(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const accounts: AccountPayload[] = []
  const errors: string[] = []
  lines.forEach((line, index) => {
    const parsed = parseOtpUri(line)
    if (!parsed?.secret) { errors.push(`第 ${index + 1} 行不是有效的 otpauth:// 链接`); return }
    accounts.push({
      name: parsed.name || parsed.issuer || `验证项 ${index + 1}`,
      account: parsed.account || '', issuer: parsed.issuer || '', secret: parsed.secret,
      digits: parsed.digits || 6, period: parsed.period || 30, algorithm: parsed.algorithm || 'SHA1',
      notes: '', favorite: false, publicAccess: false, color: '#287a5d', tags: [], accessMode: 'all', memberIds: [], pinned: false,
    })
  })
  return { accounts, errors }
}

export function ImportDialog({ onClose, onImported, onToast }: ImportDialogProps) {
  const [text, setText] = useState('')
  const [scanError, setScanError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const preview = useMemo(() => parseLines(text), [text])

  useEffect(() => () => scannerRef.current?.destroy(), [])

  async function toggleCamera() {
    if (cameraOpen) {
      scannerRef.current?.destroy()
      scannerRef.current = null
      setCameraOpen(false)
      return
    }
    setCameraOpen(true)
    window.setTimeout(async () => {
      if (!videoRef.current) return
      const scanner = new QrScanner(videoRef.current, (result) => {
        setText((current) => [current, result.data].filter(Boolean).join('\n'))
        scanner.stop()
        scanner.destroy()
        scannerRef.current = null
        setCameraOpen(false)
      }, { returnDetailedScanResult: true, highlightScanRegion: true })
      scannerRef.current = scanner
      try { await scanner.start(); setScanError('') }
      catch { setScanError('无法访问摄像头，请检查浏览器权限'); setCameraOpen(false) }
    })
  }

  async function scan(file: File) {
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      setText((current) => [current, result.data].filter(Boolean).join('\n'))
      setScanError('')
    } catch { setScanError('无法识别二维码，请选择清晰的验证器二维码图片') }
  }

  async function submit() {
    if (!preview.accounts.length) return
    setLoading(true)
    try {
      const result = await importAccounts(preview.accounts)
      await onImported()
      onToast(`已导入 ${result.accounts.length} 个验证项`)
      onClose()
    } catch (reason) { setScanError(reason instanceof Error ? reason.message : '导入失败') }
    finally { setLoading(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="import-dialog" aria-labelledby="import-title">
      <div className="dialog-panel">
        <div className="panel-heading"><span><FileUp size={18} /></span><div><h2 id="import-title">批量导入</h2><p>粘贴 otpauth:// 链接，或从二维码图片识别。</p></div></div>
        <textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} placeholder={'每行一个链接\notpauth://totp/...'} />
        <div className="qr-actions">
          <label className="qr-upload"><QrCode size={17} /><span>识别二维码图片</span><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void scan(file) }} /></label>
          <button className="qr-upload" type="button" onClick={() => void toggleCamera()}><QrCode size={17} />{cameraOpen ? '关闭摄像头' : '打开摄像头'}</button>
        </div>
        {cameraOpen && <video className="qr-camera" ref={videoRef} muted playsInline />}
        <div className="import-summary"><strong>{preview.accounts.length} 个有效验证项</strong>{preview.errors.length > 0 && <span>{preview.errors.length} 个错误</span>}</div>
        {(scanError || preview.errors.length > 0) && <div className="form-error" role="alert">{scanError || preview.errors.slice(0, 3).join('；')}</div>}
        <div className="modal-actions"><Button className="secondary-button" type="button" onClick={onClose}>取消</Button><Button className="primary-button" type="button" disabled={!preview.accounts.length || loading} onClick={() => void submit()}><Upload size={16} />{loading ? '导入中…' : '确认导入'}</Button></div>
      </div>
    </DialogContent>
  </Dialog>
}
