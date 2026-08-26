import type { ReactNode } from 'react'
import { Check, Copy, Ellipsis, Globe2, Link2, LockKeyhole, Pin, PinOff, Pencil, Star, Trash2 } from 'lucide-react'
import type { AccountView } from '../lib/api'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

interface AccountCardProps {
  account: AccountView
  copied: boolean
  onCopy: () => void
  onEdit?: () => void
  onDelete?: () => void
  onFavorite?: () => void
  onPublicAccess?: () => void
  onPinned?: () => void
  onShare?: () => void
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: React.DragEventHandler<HTMLElement>
  onDrop?: () => void
  readOnly?: boolean
}

interface AccountActionsProps {
  account: AccountView
  Item: (props: { className?: string; onSelect?: () => void; children: ReactNode }) => ReactNode
  onEdit?: () => void
  onDelete?: () => void
  onFavorite?: () => void
  onPublicAccess?: () => void
  onPinned?: () => void
  onShare?: () => void
}

function AccountActions({ account, Item, onEdit, onDelete, onFavorite, onPublicAccess, onPinned, onShare }: AccountActionsProps) {
  return (
    <>
      <Item onSelect={onFavorite}><Star size={16} />{account.favorite ? '取消收藏' : '添加收藏'}</Item>
      <Item onSelect={onEdit}><Pencil size={16} />编辑</Item>
      {onPinned && <Item onSelect={onPinned}>{account.pinned ? <PinOff size={16} /> : <Pin size={16} />}{account.pinned ? '取消置顶' : '置顶'}</Item>}
      {onShare && <Item onSelect={onShare}><Link2 size={16} />创建分享链接</Item>}
      {onPublicAccess && (
        <Item onSelect={onPublicAccess}>
          {account.publicAccess ? <LockKeyhole size={16} /> : <Globe2 size={16} />}
          {account.publicAccess ? '设置私有' : '设置公开'}
        </Item>
      )}
      <Item className="danger-menu-item" onSelect={onDelete}><Trash2 size={16} />删除</Item>
    </>
  )
}

export function AccountCard({
  account,
  copied,
  onCopy,
  onEdit,
  onDelete,
  onFavorite,
  onPublicAccess,
  onPinned,
  onShare,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  readOnly = false,
}: AccountCardProps) {
  const token = account.token
  const remaining = account.remaining
  const progress = remaining / account.period
  const critical = remaining <= 5
  const initials = (account.name || account.issuer || '?').slice(0, 2).toUpperCase()

  const card = (
    <article
      className={`account-card ${critical ? 'countdown-critical-card' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ '--card-color': account.color, '--countdown-progress': `${progress * 100}%` } as React.CSSProperties}
    >
      <div className="account-card-head">
        <div className="service-avatar" style={{ '--avatar-color': account.color } as React.CSSProperties}>{initials}</div>
        <div className="account-identity">
          <div className="service-name-row">
            <h3 title={account.name}>{account.name}</h3>
            {account.publicAccess && <Globe2 className="public-indicator" size={15} aria-label="无需登录访问" />}
          </div>
          <p title={account.account || account.issuer}>{account.account || account.issuer || '未填写账号'}</p>
        </div>
        {!readOnly && (
          <div className="card-actions">
            <button className={`icon-button favorite-button ${account.favorite ? 'active' : ''}`} type="button" onClick={onFavorite} title={account.favorite ? '取消收藏' : '添加收藏'} aria-label={account.favorite ? '取消收藏' : '添加收藏'}>
              <Star size={17} fill={account.favorite ? 'currentColor' : 'none'} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="icon-button" type="button" title="更多操作" aria-label="更多操作"><Ellipsis size={20} /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <AccountActions account={account} Item={DropdownMenuItem} onEdit={onEdit} onDelete={onDelete} onFavorite={onFavorite} onPublicAccess={onPublicAccess} onPinned={onPinned} onShare={onShare} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <button className="token-area" type="button" onClick={onCopy} disabled={!token} title="复制验证码">
        <span className="token-label">当前验证码 <span>· {remaining}s 后更新</span></span>
        <span className={`token-value ${token ? '' : 'token-invalid'}`}>{token ? `${token.slice(0, Math.ceil(token.length / 2))} ${token.slice(Math.ceil(token.length / 2))}` : '密钥无效'}</span>
        <span className="copy-indicator">{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? '已复制' : '复制'}</span>
      </button>
      {account.notes && <p className="account-note" title={account.notes}>{account.notes}</p>}

      <div className="account-card-foot">
        <span className="token-meta">{account.digits} 位 · {account.algorithm}</span>
        <div className={`countdown ${critical ? 'countdown-critical' : ''}`} title={`${remaining} 秒后更新`}><span>{remaining}s</span></div>
      </div>
    </article>
  )

  if (readOnly) return card
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent>
        <AccountActions account={account} Item={ContextMenuItem} onEdit={onEdit} onDelete={onDelete} onFavorite={onFavorite} onPublicAccess={onPublicAccess} onPinned={onPinned} onShare={onShare} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
