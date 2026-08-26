import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Globe2, KeyRound } from 'lucide-react'
import { normalizeSecret, parseOtpUri } from '../lib/totp'
import type { Algorithm, TokenDigits, TokenPeriod, TotpAccount } from '../types'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'

const COLORS = [
  '#287a5d', '#2364aa', '#c2415d', '#9a6700', '#6f55a5', '#087e8b', '#c85a32',
  '#3f718f', '#4f8b68', '#a34d70', '#735c39', '#5366a8', '#8a5b47', '#4c7a78',
  '#936b2d', '#69547f', '#a64f3c', '#39705e',
]

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}


interface AccountModalProps {
  account: TotpAccount | null
  onClose: () => void
  onSave: (account: TotpAccount) => Promise<void>
  allowPublic?: boolean
  localMode?: boolean
}

function makeAccount(): TotpAccount {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: '',
    account: '',
    issuer: '',
    secret: '',
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
    notes: '',
    favorite: false,
    publicAccess: false,
    color: randomColor(),
    createdAt: now,
    updatedAt: now,
  }
}

export function AccountModal({ account, onClose, onSave, allowPublic = false, localMode = false }: AccountModalProps) {
  const [draft, setDraft] = useState<TotpAccount>(() => account ? { ...account, publicAccess: account.publicAccess ?? false } : makeAccount())
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function update<K extends keyof TotpAccount>(key: K, value: TotpAccount[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function handleSecretChange(value: string) {
    const parsed = parseOtpUri(value)
    if (parsed) {
      setDraft((current) => ({ ...current, ...parsed }))
      setError('')
      return
    }
    update('secret', normalizeSecret(value))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('请填写名称')
      return
    }
    if (!account && (!draft.secret || !/^[A-Z2-7]+=*$/.test(draft.secret))) {
      setError('请输入有效的 Base32 Secret Key 或 otpauth 链接')
      return
    }
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        account: draft.account.trim(),
        issuer: draft.issuer.trim(),
        notes: draft.notes.trim(),
        secret: normalizeSecret(draft.secret),
        updatedAt: Date.now(),
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="account-modal" aria-labelledby="account-modal-title" aria-describedby="account-modal-description">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">TOTP ACCOUNT</span>
            <h2 id="account-modal-title">{account ? '编辑验证项' : '添加验证项'}</h2>
            <p id="account-modal-description" className="sr-only">配置 TOTP 验证项的名称、密钥、算法和备注。</p>
          </div>
        </header>

        <form onSubmit={submit}>
          <div className="modal-body">
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="account-name">名称 *</label>
                <input id="account-name" autoFocus value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="例如 GitHub" />
              </div>
              <div className="form-field">
                <label htmlFor="account-identifier">账号</label>
                <input id="account-identifier" value={draft.account} onChange={(event) => update('account', event.target.value)} placeholder="name@example.com" />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="account-issuer">服务商 / 组织</label>
              <input id="account-issuer" value={draft.issuer} onChange={(event) => update('issuer', event.target.value)} placeholder="例如 Acme Inc." />
            </div>

            <div className="form-field">
              <label htmlFor="account-secret">Secret Key {account ? '(留空保留原密钥)' : '*'}</label>
              <div className="password-field">
                <input
                  id="account-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={draft.secret}
                  onChange={(event) => handleSecretChange(event.target.value)}
                  placeholder="Base32 密钥或 otpauth:// 链接"
                  spellCheck={false}
                />
                <button className="icon-button field-action" type="button" onClick={() => setShowSecret((value) => !value)} title={showSecret ? '隐藏密钥' : '显示密钥'} aria-label={showSecret ? '隐藏密钥' : '显示密钥'}>
                  {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-grid form-grid-three">
              <div className="form-field">
                <label htmlFor="account-digits">位数</label>
                <select id="account-digits" value={draft.digits} onChange={(event) => update('digits', Number(event.target.value) as TokenDigits)}>
                  <option value={6}>6 位</option><option value={7}>7 位</option><option value={8}>8 位</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="account-period">周期</label>
                <select id="account-period" value={draft.period} onChange={(event) => update('period', Number(event.target.value) as TokenPeriod)}>
                  <option value={30}>30 秒</option><option value={60}>60 秒</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="account-algorithm">算法</label>
                <select id="account-algorithm" value={draft.algorithm} onChange={(event) => update('algorithm', event.target.value as Algorithm)}>
                  <option>SHA1</option><option>SHA256</option><option>SHA512</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>标记颜色</label>
              <div className="color-swatches">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    className={`color-swatch ${draft.color === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    type="button"
                    onClick={() => update('color', color)}
                    title={`选择颜色 ${color}`}
                    aria-label={`选择颜色 ${color}`}
                  />
                ))}
              </div>
            </div>

            {allowPublic && (
              <div className={`public-access-option ${draft.publicAccess ? 'enabled' : ''}`}>
                <div className="public-access-copy">
                  <span className="public-access-icon"><Globe2 size={17} /></span>
                  <div><strong>无需登录访问</strong><p>任何访问 KeyFort 的人都能看到此账号的实时验证码。</p></div>
                </div>
                <label className="switch-control">
                  <input type="checkbox" checked={draft.publicAccess} onChange={(event) => update('publicAccess', event.target.checked)} />
                  <span aria-hidden="true" />
                </label>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="account-notes">备注</label>
              <textarea id="account-notes" rows={3} value={draft.notes} onChange={(event) => update('notes', event.target.value)} placeholder="恢复方式、用途或其他信息" />
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
          </div>

          <footer className="modal-footer">
            <span className="encrypted-hint"><KeyRound size={15} />{localMode ? '保存在当前浏览器' : '保存后由服务端加密'}</span>
            <div className="modal-actions">
              <Button className="secondary-button" type="button" onClick={onClose}>取消</Button>
              <Button className="primary-button" type="submit">{account ? '保存修改' : '添加账号'}</Button>
            </div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
