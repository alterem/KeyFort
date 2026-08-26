import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react'
import { createMember, deleteMember, listMembers, resetMemberPassword, type Member } from '../lib/api'
import { Button } from './ui/button'
import { PageHeading } from './PageHeading'
import { ResetPasswordDialog } from './ResetPasswordDialog'

interface TeamPageProps {
  onToast: (message: string) => void
  onReauth: <T>(action: () => Promise<T>) => Promise<T | undefined>
}

export function TeamPage({ onToast, onReauth }: TeamPageProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [resettingMember, setResettingMember] = useState<Member | null>(null)

  async function refresh() {
    try {
      setMembers((await listMembers()).members)
      setError('')
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

  async function resetPassword(member: Member, password: string) {
    await onReauth(() => resetMemberPassword(member.id, password))
    onToast('临时密码已更新，该成员的所有设备已退出')
  }

  async function remove(member: Member) {
    if (!window.confirm(`确定移除成员“${member.name}”吗？`)) return
    try {
      await onReauth(() => deleteMember(member.id))
      await refresh()
      onToast('成员已移除')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '移除成员失败') }
  }

  return (
    <div className="team-page">
      <PageHeading
        kicker="TEAM AUTHENTICATOR"
        title="成员管理"
        description={`${members.length} 位成员 · 管理团队共享验证码的访问权限`}
        statusIcon={<Users size={16} />}
        statusLabel="团队管理"
      />

      {error && <div className="form-error team-page-error" role="alert">{error}</div>}

      <section className="team-members-section" aria-labelledby="team-members-heading">
        <div className="section-heading"><div><h2 id="team-members-heading">团队成员</h2><p>管理员可以添加成员并移除不需要访问权限的账号。</p></div></div>
        <div className="member-list team-member-list">
          {loading ? <p className="muted-text">正在加载成员…</p> : members.map((member) => (
            <div className="member-row" key={member.id}>
              <span className="member-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
              <div className="member-main"><strong>{member.name}</strong><small>{member.email}</small></div>
              <span className={`member-role ${member.role === 'admin' ? 'member-role-admin' : ''}`}>{member.role === 'admin' ? '管理员' : '成员'}</span>
              {member.role !== 'admin' && <div className="member-actions"><button className="icon-button" type="button" onClick={() => setResettingMember(member)} title="重置密码" aria-label={`重置 ${member.name} 的密码`}><KeyRound size={15} /></button><button className="icon-button member-remove" type="button" onClick={() => void remove(member)} title="移除成员" aria-label={`移除 ${member.name}`}><Trash2 size={15} /></button></div>}
            </div>
          ))}
        </div>
      </section>

      <section className="team-member-create" aria-labelledby="team-member-create-heading">
        <div className="team-create-intro"><span><UserPlus size={19} /></span><div><h2 id="team-member-create-heading">添加成员</h2><p>创建账号后，将临时密码安全地交给团队成员。</p></div></div>
        <form className="team-member-form" onSubmit={(event) => void submit(event)}>
          <label><span>姓名</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 李四" autoComplete="name" /></label>
          <label><span>成员邮箱</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="email" /></label>
          <label><span>临时密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 个字符" autoComplete="new-password" /></label>
          <Button className="primary-button team-member-submit" type="submit" disabled={submitting}><UserPlus size={16} />{submitting ? '添加中…' : '添加成员'}</Button>
        </form>
        <div className="member-security-note"><ShieldCheck size={14} />密码经过 bcrypt 哈希处理，服务端不会保存明文密码。</div>
      </section>
      {resettingMember && <ResetPasswordDialog member={resettingMember} onClose={() => setResettingMember(null)} onSubmit={(password) => resetPassword(resettingMember, password)} />}
    </div>
  )
}
