import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { createMember, deleteMember, listMembers, type Member } from '../lib/api'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'

interface TeamModalProps {
  onClose: () => void
  onToast: (message: string) => void
}

export function TeamModal({ onClose, onToast }: TeamModalProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function refresh() {
    try {
      setMembers((await listMembers()).members)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法加载成员')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createMember({ email, name, password })
      setEmail('')
      setName('')
      setPassword('')
      await refresh()
      onToast('成员已添加')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '添加成员失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`确定移除成员“${member.name}”吗？`)) return
    try {
      await deleteMember(member.id)
      await refresh()
      onToast('成员已移除')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '移除成员失败')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="team-modal" aria-labelledby="team-modal-title" aria-describedby="team-modal-description">
        <header className="team-modal-header">
          <div className="team-modal-title-row">
            <span className="team-modal-icon"><Users size={19} /></span>
            <div>
              <span className="modal-kicker">TEAM MEMBERS</span>
              <h2 id="team-modal-title">成员管理</h2>
            </div>
          </div>
          <p id="team-modal-description">管理可以访问共享验证码的团队成员。</p>
        </header>

        <div className="team-modal-body">
          <section className="member-section" aria-labelledby="member-list-heading">
            <div className="section-heading">
              <div><h3 id="member-list-heading">团队成员</h3><p>已添加的成员可以查看和使用共享验证码。</p></div>
              <span className="member-count">{members.length} 人</span>
            </div>
            <div className="member-list">
              {loading ? <p className="muted-text">正在加载成员…</p> : members.length === 0 ? <p className="muted-text">还没有团队成员。</p> : members.map((member) => (
                <div className="member-row" key={member.id}>
                  <span className="member-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
                  <div className="member-main"><strong>{member.name}</strong><small>{member.email}</small></div>
                  <span className={`member-role ${member.role === 'admin' ? 'member-role-admin' : ''}`}>{member.role === 'admin' ? '管理员' : '成员'}</span>
                  {member.role !== 'admin' && <button className="icon-button member-remove" type="button" onClick={() => void remove(member)} title="移除成员" aria-label={`移除 ${member.name}`}><Trash2 size={15} /></button>}
                </div>
              ))}
            </div>
          </section>

          <section className="member-add-section" aria-labelledby="member-add-heading">
            <div className="section-heading section-heading-add"><div><h3 id="member-add-heading"><UserPlus size={17} />添加成员</h3><p>创建账号后，将临时密码安全地交给成员。</p></div></div>
            <form className="member-form" onSubmit={(event) => void submit(event)}>
              <label><span>姓名</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 李四" autoComplete="name" /></label>
              <label><span>成员邮箱</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="email" /></label>
              <label><span>临时密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 个字符" autoComplete="new-password" /></label>
              <Button className="primary-button member-submit" type="submit" disabled={submitting}><UserPlus size={16} />{submitting ? '添加中…' : '添加成员'}</Button>
            </form>
            <div className="member-security-note"><ShieldCheck size={14} />密码会经过哈希处理，不会以明文保存。</div>
          </section>
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
