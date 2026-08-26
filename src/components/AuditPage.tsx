import { useEffect, useState } from 'react'
import { Activity, ShieldCheck } from 'lucide-react'
import { listAuditLogs, type AuditLog } from '../lib/api'
import { PageHeading } from './PageHeading'

const ACTION_LABELS: Record<string, string> = {
  'auth.setup': '创建管理员', 'auth.login': '登录', 'auth.login_failed': '登录失败', 'auth.logout': '退出登录',
  'auth.password_changed': '修改密码', 'auth.session_revoked': '撤销会话', 'account.created': '添加验证项',
  'account.updated': '编辑验证项', 'account.trashed': '移入回收站', 'account.restored': '恢复验证项',
  'account.destroyed': '永久删除', 'account.favorite': '修改收藏', 'account.publicAccess': '修改公开状态',
  'account.imported': '批量导入', 'member.created': '添加成员', 'member.deleted': '移除成员',
  'member.password_reset': '重置成员密码', 'share.created': '创建分享', 'share.revoked': '撤销分享',
  'backup.exported': '导出备份', 'backup.imported': '导入备份',
}

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    void listAuditLogs().then((result) => setLogs(result.logs)).catch((reason) => setError(reason instanceof Error ? reason.message : '无法加载审计日志'))
  }, [])

  return (
    <div className="management-page">
      <PageHeading kicker="AUDIT LOG" title="操作审计" description={`${logs.length} 条记录 · 不记录 Secret Key 和验证码`} statusIcon={<ShieldCheck size={16} />} statusLabel="仅管理员" />
      {error && <div className="form-error management-error" role="alert">{error}</div>}
      <section className="management-panel management-panel-wide">
        <div className="management-list audit-list">
          {logs.length === 0 ? <p className="muted-text">暂时没有审计记录。</p> : logs.map((log) => (
            <div className="management-row audit-row" key={log.id}>
              <span className="audit-icon"><Activity size={16} /></span>
              <div><strong>{ACTION_LABELS[log.action] || log.action}</strong><small>{log.userName || log.userEmail || '系统'} · {log.targetName || log.targetType}</small></div>
              <time dateTime={new Date(log.createdAt).toISOString()}>{new Date(log.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
