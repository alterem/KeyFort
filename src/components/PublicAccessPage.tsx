import { useEffect, useState } from 'react'
import { ArrowLeft, Globe2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listPublicAccounts, type AccountView } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { AccountCard } from './AccountCard'
import { PageHeading } from './PageHeading'

export function PublicAccessPage() {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copyError, setCopyError] = useState('')

  useEffect(() => {
    async function refresh() {
      try {
        setAccounts((await listPublicAccounts()).accounts)
      } finally {
        setLoading(false)
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function copyToken(account: AccountView) {
    if (!account.token) return
    try {
      await copyText(account.token)
      setCopyError('')
      setCopiedId(account.id)
      window.setTimeout(() => setCopiedId(null), 1400)
    } catch (reason) {
      setCopyError(reason instanceof Error ? reason.message : '复制失败，请手动复制验证码')
    }
  }

  return (
    <main className="public-page">
      <header className="public-page-header">
        <Link className="brand-lockup" to="/"><span className="brand-mark"><ShieldCheck size={21} /></span><span>KeyFort</span></Link>
        <Link className="public-login-link" to="/"><ArrowLeft size={15} />团队登录</Link>
      </header>

      <section className="public-page-content">
        <PageHeading
          kicker="PUBLIC AUTHENTICATOR"
          title="公开验证码"
          description={`${accounts.length} 个账号 · 无需登录即可查看实时验证码`}
          statusIcon={<Globe2 size={16} />}
          statusLabel="公开访问"
        />

        {loading ? (
          <div className="empty-state public-page-state">正在加载公开验证项…</div>
        ) : accounts.length === 0 ? (
          <div className="empty-state public-page-state">
            <div className="empty-icon"><Globe2 size={27} /></div>
            <h2>暂时没有公开验证项</h2>
            <p>管理员开放账号后，会显示在这里。</p>
          </div>
        ) : (
          <div className="account-grid">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                copied={copiedId === account.id}
                onCopy={() => void copyToken(account)}
                readOnly
              />
            ))}
          </div>
        )}
        {copyError && <div className="form-error public-copy-error" role="alert">{copyError}</div>}
        <p className="public-page-disclaimer">公开验证码由管理员主动开放，仅用于授权的访客、演示或协作场景。</p>
      </section>
    </main>
  )
}
