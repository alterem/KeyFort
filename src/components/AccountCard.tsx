import { Check, Copy, Ellipsis, Globe2, Pencil, Star, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import type { AccountView } from '../lib/api'

interface AccountCardProps {
  account: AccountView
  copied: boolean
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onFavorite: () => void
  readOnly?: boolean
}

export function AccountCard({
  account,
  copied,
  onCopy,
  onEdit,
  onDelete,
  onFavorite,
  readOnly = false,
}: AccountCardProps) {
  const token = account.token
  const remaining = account.remaining
  const progress = remaining / account.period
  const critical = remaining <= 5
  const initials = (account.name || account.issuer || '?').slice(0, 2).toUpperCase()

  return (
    <article
      className={`account-card ${critical ? 'countdown-critical-card' : ''}`}
      style={{ '--card-color': account.color, '--countdown-progress': `${progress * 100}%` } as React.CSSProperties}
    >
      <div className="account-card-head">
        <div className="service-avatar" style={{ '--avatar-color': account.color } as React.CSSProperties}>{initials}</div>
        <div className="account-identity">
          <div className="service-name-row">
            <h3 title={account.name}>{account.name}</h3>
            {account.favorite && <Star className="favorite-indicator" size={15} fill="currentColor" aria-label="已收藏" />}
            {account.publicAccess && <Globe2 className="public-indicator" size={15} aria-label="无需登录访问" />}
          </div>
          <p title={account.account || account.issuer}>{account.account || account.issuer || '未填写账号'}</p>
        </div>
        <div className="card-menu-wrap">
          {!readOnly && <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="icon-button" type="button" title="更多操作" aria-label="更多操作">
                <Ellipsis size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onFavorite}><Star size={16} />{account.favorite ? '取消收藏' : '添加收藏'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}><Pencil size={16} />编辑</DropdownMenuItem>
              <DropdownMenuItem className="danger-menu-item" onSelect={onDelete}><Trash2 size={16} />删除</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </div>

      <button className="token-area" type="button" onClick={onCopy} disabled={!token} title="复制验证码">
        <span className="token-label">当前验证码 <span>· {remaining}s 后更新</span></span>
        <span className={`token-value ${token ? '' : 'token-invalid'}`}>{token ? `${token.slice(0, Math.ceil(token.length / 2))} ${token.slice(Math.ceil(token.length / 2))}` : '密钥无效'}</span>
        <span className="copy-indicator">{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? '已复制' : '复制'}</span>
      </button>
      {account.notes && <p className="account-note" title={account.notes}>{account.notes}</p>}

      <div className="account-card-foot">
        <span className="token-meta">{account.digits} 位 · {account.algorithm}</span>
        <div className={`countdown ${critical ? 'countdown-critical' : ''}`} title={`${remaining} 秒后更新`}>
          <span>{remaining}s</span>
        </div>
      </div>
    </article>
  )
}
