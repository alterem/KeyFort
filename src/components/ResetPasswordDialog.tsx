import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import type { Member } from '../lib/api'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'

interface ResetPasswordDialogProps {
  member: Member
  onClose: () => void
  onSubmit: (password: string) => Promise<void>
}

export function ResetPasswordDialog({ member, onClose, onSubmit }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 8) { setError('临时密码至少需要 8 个字符'); return }
    setLoading(true)
    setError('')
    try { await onSubmit(password); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重置密码失败') }
    finally { setLoading(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="reauth-dialog" aria-labelledby="reset-password-title">
      <div className="dialog-panel">
        <div className="panel-heading"><span><KeyRound size={18} /></span><div><h2 id="reset-password-title">重置 {member.name} 的密码</h2><p>保存后该成员的所有登录设备都会退出。</p></div></div>
        <form className="stack-form" onSubmit={(event) => void submit(event)}>
          <label><span>临时密码</span><input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="至少 8 个字符" /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions"><Button className="secondary-button" type="button" onClick={onClose}>取消</Button><Button className="primary-button" type="submit" disabled={loading}>{loading ? '重置中…' : '重置密码'}</Button></div>
        </form>
      </div>
    </DialogContent>
  </Dialog>
}
