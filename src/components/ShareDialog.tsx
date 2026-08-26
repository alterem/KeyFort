import { useState, type FormEvent } from 'react'
import { Link2 } from 'lucide-react'
import { createShare, type AccountView } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'

interface ShareDialogProps {
  account: AccountView
  onClose: () => void
  onReauth: <T>(action: () => Promise<T>) => Promise<T | undefined>
  onToast: (message: string) => void
}

export function ShareDialog({ account, onClose, onReauth, onToast }: ShareDialogProps) {
  const [expiresIn, setExpiresIn] = useState('3600')
  const [password, setPassword] = useState('')
  const [maxViews, setMaxViews] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await onReauth(() => createShare(account.id, {
        expiresIn: expiresIn ? Number(expiresIn) : undefined,
        password: password || undefined,
        maxViews: maxViews ? Number(maxViews) : undefined,
      }))
      if (!result) return
      const url = `${window.location.origin}/share/${result.share.token}`
      await copyText(url)
      onToast('分享链接已创建并复制')
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '创建分享失败') }
    finally { setLoading(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="share-dialog" aria-labelledby="share-title">
      <div className="dialog-panel">
        <div className="panel-heading"><span><Link2 size={18} /></span><div><h2 id="share-title">分享 {account.name}</h2><p>创建可撤销的随机访问链接。</p></div></div>
        <form className="stack-form" onSubmit={(event) => void submit(event)}>
          <label><span>有效期</span><select value={expiresIn} onChange={(event) => setExpiresIn(event.target.value)}><option value="600">10 分钟</option><option value="3600">1 小时</option><option value="86400">1 天</option><option value="604800">7 天</option><option value="">永久</option></select></label>
          <label><span>访问密码（可选）</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label><span>最多访问次数（可选）</span><input type="number" min="1" value={maxViews} onChange={(event) => setMaxViews(event.target.value)} /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions"><Button className="secondary-button" type="button" onClick={onClose}>取消</Button><Button className="primary-button" type="submit" disabled={loading}>{loading ? '创建中…' : '创建并复制链接'}</Button></div>
        </form>
      </div>
    </DialogContent>
  </Dialog>
}
