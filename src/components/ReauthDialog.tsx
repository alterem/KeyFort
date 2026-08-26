import { useState, type FormEvent } from 'react'
import { LockKeyhole } from 'lucide-react'
import { verifyPassword } from '../lib/api'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'

interface ReauthDialogProps { onClose: () => void; onVerified: () => void }

export function ReauthDialog({ onClose, onVerified }: ReauthDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try { await verifyPassword(password); onVerified() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '验证失败') }
    finally { setLoading(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="reauth-dialog" aria-labelledby="reauth-title">
      <div className="reauth-content">
        <span className="auth-icon"><LockKeyhole size={22} /></span>
        <h2 id="reauth-title">重新验证身份</h2>
        <p>输入当前密码后继续执行敏感操作。</p>
        <form onSubmit={(event) => void submit(event)}>
          <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="当前密码" />
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions"><Button className="secondary-button" type="button" onClick={onClose}>取消</Button><Button className="primary-button" type="submit" disabled={loading}>{loading ? '验证中…' : '继续'}</Button></div>
        </form>
      </div>
    </DialogContent>
  </Dialog>
}
