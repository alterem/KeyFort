import { useEffect, useState } from 'react'
import { Link2, ShieldCheck, Trash2 } from 'lucide-react'
import { listShares, revokeShare, type ShareView } from '../lib/api'
import { PageHeading } from './PageHeading'

interface SharesPageProps { onToast: (message: string) => void }

export function SharesPage({ onToast }: SharesPageProps) {
  const [shares, setShares] = useState<ShareView[]>([])
  const [error, setError] = useState('')

  async function refresh() {
    try { setShares((await listShares()).shares); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载分享链接') }
  }
  useEffect(() => { void refresh() }, [])

  async function revoke(share: ShareView) {
    if (!window.confirm(`撤销“${share.accountName}”的分享链接？`)) return
    await revokeShare(share.id)
    onToast('分享链接已撤销')
    await refresh()
  }

  return <div className="management-page">
    <PageHeading kicker="SECURE SHARING" title="分享管理" description={`${shares.filter((share) => !share.revokedAt).length} 个有效链接`} statusIcon={<ShieldCheck size={16} />} statusLabel="限时访问" />
    {error && <div className="form-error management-error" role="alert">{error}</div>}
    <section className="management-panel management-panel-wide">
      <div className="management-list">
        {shares.length === 0 ? <p className="muted-text">还没有创建分享链接，请从验证项右键菜单创建。</p> : shares.map((share) => <div className="management-row" key={share.id}>
          <span className="audit-icon"><Link2 size={16} /></span>
          <div><strong>{share.accountName}</strong><small>{share.revokedAt ? '已撤销' : share.expiresAt ? `${new Date(share.expiresAt).toLocaleString()} 到期` : '永久有效'} · 已访问 {share.viewCount}{share.maxViews ? `/${share.maxViews}` : ''} 次{share.passwordProtected ? ' · 密码保护' : ''}</small></div>
          {!share.revokedAt && <button className="icon-button member-remove" type="button" onClick={() => void revoke(share)} title="撤销分享" aria-label={`撤销 ${share.accountName} 的分享`}><Trash2 size={16} /></button>}
        </div>)}
      </div>
    </section>
  </div>
}
