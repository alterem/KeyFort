import { FileUp, HardDrive, Menu, Plus, Search, Settings2, ShieldCheck, X, FileKey, Star } from 'lucide-react'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { AccountCard } from './AccountCard'
import { PageHeading } from './PageHeading'
import type { AccountView } from '../lib/api'

type AccountFilter = 'all' | 'favorites'

interface WorkspaceHeaderProps {
  isTeamPage: boolean
  search: string
  setSearch: Dispatch<SetStateAction<string>>
  onOpenSidebar: () => void
  onAdd: () => void
  onImport?: () => void
}

export function WorkspaceHeader({ isTeamPage, search, setSearch, onOpenSidebar, onAdd, onImport }: WorkspaceHeaderProps) {
  return (
    <header className="workspace-header">
      <div className="mobile-title">
        <button className="icon-button" type="button" onClick={onOpenSidebar} title="打开菜单" aria-label="打开菜单"><Menu size={21} /></button>
        <div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={19} /></span><span>KeyFort</span></div>
      </div>
      {!isTeamPage && <>
        <div className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、账号或备注" aria-label="搜索验证项" />
          {search && <button className="icon-button" type="button" onClick={() => setSearch('')} title="清除搜索" aria-label="清除搜索"><X size={16} /></button>}
        </div>
        {onImport && <button className="icon-button header-tool-button" type="button" onClick={onImport} title="批量导入" aria-label="批量导入"><FileUp size={18} /></button>}
        <button className="primary-button add-button" type="button" onClick={onAdd}><Plus size={18} />添加验证项</button>
      </>}
    </header>
  )
}

interface AccountWorkspaceProps {
  visibleAccounts: AccountView[]
  filter: AccountFilter
  search: string
  activeTag: string
  isGuest: boolean
  serverError: string
  copiedId: string | null
  canManagePublic: boolean
  onAdd: () => void
  onCopy: (account: AccountView) => void
  onEdit: (account: AccountView) => void
  onDelete: (account: AccountView) => void
  onFavorite: (account: AccountView) => void
  onPublicAccess: (account: AccountView) => void
  onPinned: (account: AccountView) => void
  onShare: (account: AccountView) => void
  onReorder: (sourceId: string, targetId: string) => void
}

export function AccountWorkspace({
  visibleAccounts,
  filter,
  search,
  activeTag,
  isGuest,
  serverError,
  copiedId,
  canManagePublic,
  onAdd,
  onCopy,
  onEdit,
  onDelete,
  onFavorite,
  onPublicAccess,
  onPinned,
  onShare,
  onReorder,
}: AccountWorkspaceProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const emptyIcon = search ? <Search size={27} /> : filter === 'favorites' ? <Star size={27} /> : <FileKey size={27} />
  const emptyTitle = search ? '没有匹配的验证项' : filter === 'favorites' ? '还没有收藏' : isGuest ? '本地保险库还是空的' : '共享保险库还是空的'
  const emptyDescription = search ? '尝试搜索其他名称、账号或备注' : filter === 'favorites' ? '在验证项菜单中添加收藏' : '添加第一个验证项开始使用'

  return (
    <>
      <PageHeading
        kicker={isGuest ? 'LOCAL AUTHENTICATOR' : 'TEAM AUTHENTICATOR'}
        title={filter === 'favorites' ? '我的收藏' : isGuest ? '本地验证项' : '共享验证项'}
        description={`${visibleAccounts.length} 个账号${activeTag ? ` · 标签：${activeTag}` : ''} · ${isGuest ? '保存在当前浏览器' : '团队实时同步'}`}
        statusIcon={isGuest ? <HardDrive size={16} /> : <ShieldCheck size={16} />}
        statusLabel={isGuest ? '本地试用' : '已连接'}
        statusClassName={isGuest ? 'local-pill' : ''}
      />

      {isGuest && <div className="local-mode-notice"><HardDrive size={16} /><div><strong>本地试用模式</strong><span>数据和 Secret Key 保存在当前浏览器，请勿用于重要的正式凭证。</span></div></div>}
      {!isGuest && serverError && <div className="sync-warning"><Settings2 size={16} />{serverError}</div>}

      {visibleAccounts.length > 0 ? (
        <div className="account-grid">
          {visibleAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              copied={copiedId === account.id}
              onCopy={() => onCopy(account)}
              onEdit={() => onEdit(account)}
              onDelete={() => onDelete(account)}
              onFavorite={() => onFavorite(account)}
              onPublicAccess={canManagePublic ? () => onPublicAccess(account) : undefined}
              onPinned={() => onPinned(account)}
              onShare={canManagePublic ? () => onShare(account) : undefined}
              draggable={!search && !activeTag && filter === 'all'}
              onDragStart={() => setDraggedId(account.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (draggedId && draggedId !== account.id) onReorder(draggedId, account.id); setDraggedId(null) }}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">{emptyIcon}</div>
          <h2>{emptyTitle}</h2>
          <p>{emptyDescription}</p>
          {!search && filter === 'all' && (
            <button className="primary-button" type="button" onClick={onAdd}>
              <Plus size={18} />添加验证项
            </button>
          )}
        </div>
      )}
    </>
  )
}
