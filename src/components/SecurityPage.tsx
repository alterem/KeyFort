import { useEffect, useState, type FormEvent } from 'react'
import { DatabaseBackup, HeartPulse, KeyRound, LockKeyhole, MonitorSmartphone, ShieldCheck, Trash2 } from 'lucide-react'
import { changePassword, exportBackup, getHealth, importBackup, listSessions, previewBackup, revokeSession, type HealthStatus, type SessionView } from '../lib/api'
import { PageHeading } from './PageHeading'
import { Button } from './ui/button'

interface SecurityPageProps {
  isAdmin: boolean
  onToast: (message: string) => void
  onReauth: <T>(action: () => Promise<T>) => Promise<T>
}

function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function SecurityPage({ isAdmin, onToast, onReauth }: SecurityPageProps) {
  const [sessions, setSessions] = useState<SessionView[]>([])
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [backupPassword, setBackupPassword] = useState('')
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      const [sessionResult, healthResult] = await Promise.all([listSessions(), getHealth()])
      setSessions(sessionResult.sessions)
      setHealth(healthResult)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载安全状态') }
  }

  useEffect(() => { void refresh() }, [])

  async function submitPassword(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      onToast('密码已修改，其他设备已退出')
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '修改密码失败') }
  }

  async function removeSession(session: SessionView) {
    if (!window.confirm(session.current ? '退出当前设备？' : '撤销这个设备的登录状态？')) return
    try {
      await revokeSession(session.id)
      onToast('会话已撤销')
      if (session.current) window.location.assign('/')
      else await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '撤销失败') }
  }

  async function downloadBackup() {
    try {
      const result = await onReauth(() => exportBackup(backupPassword))
      downloadJson(result.backup, `keyfort-backup-${new Date().toISOString().slice(0, 10)}.json`)
      onToast('加密备份已导出')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '导出失败') }
  }

  async function restoreBackup() {
    if (!backupFile || !window.confirm('导入备份会新增其中的验证项，是否继续？')) return
    try {
      const payload = JSON.parse(await backupFile.text()) as Record<string, unknown>
      const preview = await onReauth(() => previewBackup(payload, backupPassword))
      const exported = preview.exportedAt ? `，导出于 ${new Date(preview.exportedAt).toLocaleString()}` : ''
      const duplicates = preview.duplicates ? `，其中 ${preview.duplicates} 个可能与现有项重复` : ''
      if (!window.confirm(`备份包含 ${preview.count} 个验证项${duplicates}${exported}，确认导入？`)) return
      const result = await onReauth(() => importBackup(payload, backupPassword))
      onToast(`已导入 ${result.imported} 个验证项`)
      setBackupFile(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '导入失败') }
  }

  return (
    <div className="management-page">
      <PageHeading kicker="SECURITY CENTER" title="安全中心" description="管理密码、登录设备和加密备份" statusIcon={<ShieldCheck size={16} />} statusLabel={health?.status === 'ok' ? '服务正常' : '检查中'} />
      {error && <div className="form-error management-error" role="alert">{error}</div>}

      <div className="management-grid">
        <section className="management-panel">
          <div className="panel-heading"><span><KeyRound size={18} /></span><div><h2>修改密码</h2><p>修改后会撤销其他设备上的登录状态。</p></div></div>
          <form className="stack-form" onSubmit={(event) => void submitPassword(event)}>
            <label><span>当前密码</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
            <label><span>新密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 8 个字符" /></label>
            <Button className="primary-button" type="submit"><LockKeyhole size={16} />更新密码</Button>
          </form>
        </section>

        <section className="management-panel">
          <div className="panel-heading"><span><HeartPulse size={18} /></span><div><h2>服务状态</h2><p>当前 API、数据库和加密服务状态。</p></div></div>
          <div className="health-list">
            <div><span>API</span><strong>{health?.status || '检查中'}</strong></div>
            <div><span>数据库</span><strong>{health?.database || '检查中'}</strong></div>
            <div><span>加密服务</span><strong>{health?.encryption || '检查中'}</strong></div>
            <div><span>版本</span><strong>{health?.version || '-'}</strong></div>
          </div>
        </section>
      </div>

      <section className="management-panel management-panel-wide">
        <div className="panel-heading"><span><MonitorSmartphone size={18} /></span><div><h2>登录设备</h2><p>查看并撤销账号的活动会话。</p></div></div>
        <div className="management-list">
          {sessions.map((session) => <div className="management-row" key={session.id}>
            <MonitorSmartphone size={18} />
            <div><strong>{session.current ? '当前设备' : session.userAgent || '未知设备'}</strong><small>{session.ip || '未知 IP'} · {new Date(session.lastSeenAt).toLocaleString()}</small></div>
            <button className="icon-button member-remove" type="button" onClick={() => void removeSession(session)} title="撤销会话" aria-label="撤销会话"><Trash2 size={16} /></button>
          </div>)}
        </div>
      </section>

      {isAdmin && <section className="management-panel management-panel-wide">
        <div className="panel-heading"><span><DatabaseBackup size={18} /></span><div><h2>加密备份</h2><p>使用独立密码导出或恢复团队验证项。</p></div></div>
        <div className="backup-controls">
          <label><span>备份密码</span><input type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} placeholder="至少 10 个字符" /></label>
          <Button className="secondary-button" type="button" onClick={() => void downloadBackup()}><DatabaseBackup size={16} />导出备份</Button>
          <label className="file-field"><span>备份文件</span><input type="file" accept="application/json,.json" onChange={(event) => setBackupFile(event.target.files?.[0] || null)} /></label>
          <Button className="secondary-button" type="button" disabled={!backupFile} onClick={() => void restoreBackup()}>恢复备份</Button>
        </div>
      </section>}
    </div>
  )
}
