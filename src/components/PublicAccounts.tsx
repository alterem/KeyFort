import { Check, Copy, Globe2 } from 'lucide-react'
import { useState } from 'react'
import type { AccountView } from '../lib/api'

interface PublicAccountsProps {
  accounts: AccountView[]
}

export function PublicAccounts({ accounts }: PublicAccountsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function copy(account: AccountView) {
    if (!account.token) return
    try {
      await navigator.clipboard.writeText(account.token)
      setCopiedId(account.id)
      window.setTimeout(() => setCopiedId(null), 1400)
    } catch {
      return
    }
  }

  if (accounts.length === 0) return null

  return (
    <section className="public-accounts" aria-labelledby="public-accounts-title">
      <div className="public-accounts-heading">
        <span><Globe2 size={15} /></span>
        <div><h3 id="public-accounts-title">公开验证码</h3><p>无需登录即可访问</p></div>
      </div>
      <div className="public-account-list">
        {accounts.map((account) => {
          const token = account.token
          const midpoint = token ? Math.ceil(token.length / 2) : 0
          return (
            <button key={account.id} className="public-account-row" type="button" onClick={() => void copy(account)} disabled={!token}>
              <span className="public-account-mark" style={{ backgroundColor: account.color }}>{account.name.slice(0, 2).toUpperCase()}</span>
              <span className="public-account-name"><strong>{account.name}</strong><small>{account.account || account.issuer || '公开验证项'}</small></span>
              <span className="public-account-token">{token ? `${token.slice(0, midpoint)} ${token.slice(midpoint)}` : '无效'}</span>
              <span className="public-account-copy">{copiedId === account.id ? <Check size={15} /> : <Copy size={15} />}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
