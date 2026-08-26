import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { copyText } from '../lib/clipboard'
import { DEFAULT_PASSWORD_RULES, entropyLevel, generatePassword, passwordEntropy, type PasswordRules } from '../lib/password-generator'

export function PasswordGeneratorPage() {
  const [rules, setRules] = useState<PasswordRules>(DEFAULT_PASSWORD_RULES)
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const entropy = useMemo(() => passwordEntropy(rules), [rules])
  const strength = entropyLevel(entropy)

  function update<K extends keyof PasswordRules>(key: K, value: PasswordRules[K]) {
    setRules((current) => ({ ...current, [key]: value }))
  }

  function regenerate(currentRules = rules) {
    try { setPassword(generatePassword(currentRules)); setError('') }
    catch (reason) { setPassword(''); setError(reason instanceof Error ? reason.message : '无法生成密码') }
  }

  useEffect(() => {
    try { setPassword(generatePassword(rules)); setError('') }
    catch (reason) { setPassword(''); setError(reason instanceof Error ? reason.message : '无法生成密码') }
  }, [rules])

  async function copy() {
    if (!password) return
    try {
      await copyText(password)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '复制失败') }
  }

  return <main className="public-page generator-page">
    <header className="public-page-header">
      <Link className="brand-lockup" to="/"><span className="brand-mark"><ShieldCheck size={21} /></span><span>KeyFort</span></Link>
      <nav className="public-header-nav" aria-label="公共工具导航"><Link to="/public">公开验证码</Link><Link className="public-login-link" to="/"><ArrowLeft size={15} />团队登录</Link></nav>
    </header>

    <section className="generator-content">
      <div className="page-heading generator-heading">
        <div><span className="page-kicker">PASSWORD GENERATOR</span><h1>密码生成器</h1><p>使用浏览器安全随机源生成密码</p></div>
        <div className="security-pill"><ShieldCheck size={16} />本地生成</div>
      </div>

      <section className="generator-result" aria-live="polite">
        <div className="generator-password-row">
          <output className={`generator-password ${visible ? '' : 'masked'}`} aria-label="生成的密码">{visible ? password : '•'.repeat(Math.min(rules.length, 48))}</output>
          <button className="icon-button" type="button" onClick={() => setVisible((value) => !value)} title={visible ? '隐藏密码' : '显示密码'} aria-label={visible ? '隐藏密码' : '显示密码'}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
          <button className="icon-button" type="button" onClick={() => regenerate()} title="重新生成" aria-label="重新生成"><RefreshCw size={19} /></button>
          <button className="generator-copy" type="button" onClick={() => void copy()} disabled={!password}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? '已复制' : '复制密码'}</button>
        </div>
        <div className="strength-row"><span>强度：{strength.label}</span><div className="strength-meter" aria-label={`密码强度 ${strength.label}`}>{[1, 2, 3, 4].map((level) => <i className={level <= strength.level ? 'active' : ''} key={level} />)}</div><span>约 {entropy} bits</span></div>
      </section>

      {error && <div className="form-error generator-error" role="alert">{error}</div>}

      <section className="generator-settings">
        <div className="generator-section-heading"><span><KeyRound size={18} /></span><div><h2>生成规则</h2><p>调整后自动生成新密码。</p></div></div>

        <div className="length-control">
          <label htmlFor="password-length">长度</label>
          <input id="password-length" type="range" min="4" max="128" value={rules.length} onChange={(event) => update('length', Number(event.target.value))} />
          <input type="number" min="4" max="128" value={rules.length} onChange={(event) => update('length', Math.max(4, Math.min(128, Number(event.target.value) || 4)))} aria-label="密码长度" />
        </div>

        <div className="generator-options">
          <label><input type="checkbox" checked={rules.lowercase} onChange={(event) => update('lowercase', event.target.checked)} /><span><strong>小写字母</strong><small>a-z</small></span></label>
          <label><input type="checkbox" checked={rules.uppercase} onChange={(event) => update('uppercase', event.target.checked)} /><span><strong>大写字母</strong><small>A-Z</small></span></label>
          <label><input type="checkbox" checked={rules.numbers} onChange={(event) => update('numbers', event.target.checked)} /><span><strong>数字</strong><small>0-9</small></span></label>
          <label><input type="checkbox" checked={rules.symbols} onChange={(event) => update('symbols', event.target.checked)} /><span><strong>符号</strong><small>!@#$</small></span></label>
        </div>

        <div className="generator-fields">
          <label><span>符号字符</span><input value={rules.symbolCharacters} onChange={(event) => update('symbolCharacters', event.target.value)} disabled={!rules.symbols} spellCheck={false} /></label>
          <label><span>排除字符</span><input value={rules.excludedCharacters} onChange={(event) => update('excludedCharacters', event.target.value)} placeholder="例如 {}[]" spellCheck={false} /></label>
        </div>

        <div className="generator-toggles">
          <label><input type="checkbox" checked={rules.excludeAmbiguous} onChange={(event) => update('excludeAmbiguous', event.target.checked)} /><span><strong>排除易混淆字符</strong><small>I、l、1、O、0 等</small></span></label>
          <label><input type="checkbox" checked={rules.startWithLetter} onChange={(event) => update('startWithLetter', event.target.checked)} /><span><strong>首字符必须为字母</strong><small>兼容常见密码规则</small></span></label>
          <label><input type="checkbox" checked={rules.avoidRepeating} onChange={(event) => update('avoidRepeating', event.target.checked)} /><span><strong>避免连续重复</strong><small>相邻字符不相同</small></span></label>
        </div>
      </section>
    </section>
  </main>
}
