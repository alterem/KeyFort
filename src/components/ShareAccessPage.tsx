import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Link2, ShieldCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { accessShare, refreshShare, type AccountView } from '../lib/api'
import { copyText, waitForFreshToken } from '../lib/clipboard'
import { AccountCard } from './AccountCard'
import { Button } from './ui/button'

export function ShareAccessPage() {
  const { token = '' } = useParams()
  const [account, setAccount] = useState<AccountView | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [accessNonce, setAccessNonce] = useState('')

  function applyResult(result: Awaited<ReturnType<typeof accessShare>>) {
    setAccount(result.account)
    setAccessNonce(result.share.accessNonce)
    setError('')
    setPasswordRequired(false)
  }

  async function load(passwordValue = '') {
    try {
      applyResult(await accessShare(token, passwordValue))
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '无法打开分享链接'
      setError(message)
      setPasswordRequired(message.includes('密码'))
    }
  }

  useEffect(() => {
    void accessShare(token).then(applyResult).catch((reason) => {
      const message = reason instanceof Error ? reason.message : '无法打开分享链接'
      setError(message)
      setPasswordRequired(message.includes('密码'))
    })
  }, [token])

  useEffect(() => {
    if (!accessNonce) return undefined
    const timer = window.setInterval(() => {
      void refreshShare(token, accessNonce).then((result) => setAccount(result.account)).catch((reason) => {
        setError(reason instanceof Error ? reason.message : '分享链接已失效')
        window.clearInterval(timer)
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [accessNonce, token])

  async function submit(event: FormEvent) { event.preventDefault(); await load(password) }
  async function copy() {
    if (!account?.token) return
    const fresh = await waitForFreshToken(account, async () => (await refreshShare(token, accessNonce)).account)
    if (!fresh.token) throw new Error('验证码暂时不可用')
    await copyText(fresh.token)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return <main className="public-page">
    <header className="public-page-header"><Link className="brand-lockup" to="/"><span className="brand-mark"><ShieldCheck size={21} /></span><span>KeyFort</span></Link><Link className="public-login-link" to="/"><ArrowLeft size={15} />团队登录</Link></header>
    <section className="share-access-content">
      <div className="share-access-heading"><span><Link2 size={22} /></span><h1>安全分享</h1><p>此验证码通过可撤销链接共享。</p></div>
      {passwordRequired && <form className="share-password-form" onSubmit={(event) => void submit(event)}><input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="访问密码" /><Button className="primary-button" type="submit">查看验证码</Button></form>}
      {error && !passwordRequired && <div className="form-error" role="alert">{error}</div>}
      {account && <div className="share-card"><AccountCard account={account} copied={copied} onCopy={() => void copy()} readOnly /></div>}
    </section>
  </main>
}
