import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy, Globe2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listPublicAccounts, type AccountView } from '../lib/api'

export function PublicAccessPage() {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
      await navigator.clipboard.writeText(account.token)
      setCopiedId(account.id)
      window.setTimeout(() => setCopiedId(null), 1400)
    } catch {
      // Clipboard access requires a secure browser context.
    }
  }

  return (
    <main className="public-page">
      <header className="public-page-header">
        <Link className="brand-lockup" to="/"><span className="brand-mark"><ShieldCheck size={21} /></span><span>KeyFort</span></Link>
        <Link className="public-login-link" to="/"><ArrowLeft size={15} />团队登录</Link>
      </header>

      <section className="public-page-content">
        <div className="public-page-intro">
          <span className="public-page-icon"><Globe2 size={24} /></span>
          <span className="page-kicker">PUBLIC AUTHENTICATOR</span>
          <h1>公开验证码</h1>
          <p>无需登录即可查看管理员开放的实时验证码。</p>
        </div>

        {loading ? <div className="public-page-empty">正在加载公开验证项…</div> : accounts.length === 0 ? (
          <div className="public-page-empty"><Globe2 size={24} /><strong>暂时没有公开验证项</strong><span>管理员开放账号后，会显示在这里。</span></div>
        ) : (
          <div className="public-token-grid">
            {accounts.map((account) => {
              const token = account.token
              const midpoint = token ? Math.ceil(token.length / 2) : 0
              return (
                <button key={account.id} className="public-token-card" style={{ '--public-color': account.color } as React.CSSProperties} type="button" onClick={() => void copyToken(account)} disabled={!token}>
                  <div className="public-token-head"><span className="public-account-mark" style={{ backgroundColor: account.color }}>{account.name.slice(0, 2).toUpperCase()}</span><div><strong>{account.name}</strong><small>{account.account || account.issuer || '公开验证项'}</small></div><Globe2 size={16} /></div>
                  <div className="public-token-value">{token ? `${token.slice(0, midpoint)} ${token.slice(midpoint)}` : '无效密钥'}</div>
                  <div className="public-token-foot"><span>{account.digits} 位 · {account.algorithm}</span><span>{copiedId === account.id ? <><Check size={14} />已复制</> : <><Copy size={14} />复制验证码</>}</span></div>
                </button>
              )
            })}
          </div>
        )}
        <p className="public-page-disclaimer">公开验证码由管理员主动开放，仅用于授权的访客、演示或协作场景。</p>
      </section>
    </main>
  )
}
