import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Globe2, HardDrive, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'

interface AuthScreenProps {
  mode: 'create' | 'unlock'
  onSubmit: (payload: { email: string; name: string; password: string }) => Promise<void>
  onTryGuest: () => void
  serverError?: string
}

export function AuthScreen({ mode, onSubmit, onTryGuest, serverError }: AuthScreenProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('请输入有效邮箱')
      return
    }
    if (password.length < 8) {
      setError('密码至少需要 8 个字符')
      return
    }
    if (mode === 'create' && password !== confirmation) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      await onSubmit({ email, name, password })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-label="KeyFort">
        <div className="brand-lockup brand-lockup-light">
          <span className="brand-mark"><ShieldCheck size={22} strokeWidth={2.2} /></span>
          <span>KeyFort</span>
        </div>
        <div className="auth-brand-copy">
          <span className="auth-kicker">TEAM AUTHENTICATOR</span>
          <h1>团队账号，<br />一个地方管理。</h1>
          <p>成员登录后共享同一组安全的验证码。</p>
        </div>
        <div className="security-note"><LockKeyhole size={18} /> 服务端加密存储</div>
      </section>

      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-icon"><KeyRound size={24} /></div>
          <h2>{mode === 'create' ? '创建团队管理员' : '欢迎回来'}</h2>
          <p className="auth-subtitle">
            {mode === 'create' ? '首次使用，设置管理员账号' : '登录团队验证码保险库'}
          </p>

          <label className="field-label" htmlFor="auth-email">邮箱</label>
          <input id="auth-email" autoFocus autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />

          {mode === 'create' && (
            <>
              <label className="field-label" htmlFor="auth-name">姓名</label>
              <input id="auth-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 张三" />
            </>
          )}

          <label className="field-label" htmlFor="master-password">密码</label>
          <div className="password-field">
            <input
              id="master-password"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
            />
            <button className="icon-button field-action" type="button" onClick={() => setShowPassword((value) => !value)} title={showPassword ? '隐藏密码' : '显示密码'} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {mode === 'create' && (
            <>
              <label className="field-label" htmlFor="confirm-password">确认密码</label>
              <input id="confirm-password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="再次输入密码" />
            </>
          )}

          {serverError && <div className="form-error" role="status">团队服务暂时不可用：{serverError}</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <Button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? '正在处理…' : mode === 'create' ? '创建并进入' : '登录团队'}
          </Button>

          <div className="auth-divider"><span>或者</span></div>
          <Button className="guest-button" variant="outline" type="button" onClick={onTryGuest}>
            <HardDrive size={17} />无需账号，本地试用
          </Button>
          <p className="guest-hint">试用数据只保存在当前浏览器，不会同步到团队。</p>
          <p className="auth-footnote">团队 TOTP 密钥由服务端加密存储</p>
          <a className="public-link" href="/public"><Globe2 size={14} />查看公开验证码</a>
        </form>
      </section>
    </main>
  )
}
