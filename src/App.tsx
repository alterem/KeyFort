import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore,
  FileKey,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Users,
  X,
} from 'lucide-react'
import { AccountCard } from './components/AccountCard'
import { AccountModal } from './components/AccountModal'
import { AuthScreen } from './components/AuthScreen'
import { TeamModal } from './components/TeamModal'
import { createAccount, deleteAccount, getAuthStatus, listAccounts, login, logout, setupAccount, updateAccount, type AccountView, type User } from './lib/api'
import { normalizeSecret } from './lib/totp'
import type { TotpAccount } from './types'

type Filter = 'all' | 'favorites'
type AuthMode = 'create' | 'unlock'

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AccountView | null | undefined>(undefined)
  const [teamOpen, setTeamOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState('')
  const refreshTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    void getAuthStatus()
      .then((status) => {
        setUser(status.user)
        setAuthMode(status.user ? null : status.setupRequired ? 'create' : 'unlock')
        if (status.user) void refreshAccounts()
      })
      .catch((reason) => setServerError(reason instanceof Error ? reason.message : '无法连接服务端'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!user) return undefined
    refreshTimer.current = window.setInterval(() => void refreshAccounts(), 1000)
    return () => {
      if (refreshTimer.current) window.clearInterval(refreshTimer.current)
    }
  }, [user])

  async function refreshAccounts() {
    try {
      const result = await listAccounts()
      setAccounts(result.accounts)
      setServerError('')
    } catch (reason) {
      if (reason instanceof Error && reason.message === '请先登录') {
        setUser(null)
        setAuthMode('unlock')
      } else {
        setServerError(reason instanceof Error ? reason.message : '同步失败')
      }
    }
  }

  async function authenticate(payload: { email: string; name: string; password: string }) {
    const result = authMode === 'create'
      ? await setupAccount(payload)
      : await login(payload)
    setUser(result.user)
    setAuthMode(null)
    await refreshAccounts()
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  async function saveAccount(draft: TotpAccount) {
    const payload = {
      name: draft.name,
      account: draft.account,
      issuer: draft.issuer,
      secret: draft.secret ? normalizeSecret(draft.secret) : undefined,
      digits: draft.digits,
      period: draft.period,
      algorithm: draft.algorithm,
      notes: draft.notes,
      favorite: draft.favorite,
      color: draft.color,
    }
    if (editing) {
      await updateAccount(editing.id, payload)
      showToast('验证项已更新')
    } else {
      await createAccount(payload as typeof payload & { secret: string })
      showToast('验证项已添加')
    }
    setEditing(undefined)
    await refreshAccounts()
  }

  async function removeAccount(account: AccountView) {
    if (!window.confirm(`确定删除“${account.name}”吗？此操作无法撤销。`)) return
    await deleteAccount(account.id)
    showToast('验证项已删除')
    await refreshAccounts()
  }

  async function toggleFavorite(account: AccountView) {
    await updateAccount(account.id, {
      name: account.name,
      account: account.account,
      issuer: account.issuer,
      digits: account.digits,
      period: account.period,
      algorithm: account.algorithm,
      notes: account.notes,
      favorite: !account.favorite,
      color: account.color,
    })
    await refreshAccounts()
  }

  async function copyToken(account: AccountView) {
    if (!account.token) return
    try {
      await navigator.clipboard.writeText(account.token)
    } catch {
      const input = document.createElement('textarea')
      input.value = account.token
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopiedId(account.id)
    window.setTimeout(() => setCopiedId(null), 1600)
  }

  async function lockVault() {
    await logout().catch(() => undefined)
    setUser(null)
    setAccounts([])
    setSearch('')
    setAuthMode('unlock')
    setSidebarOpen(false)
  }

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return accounts
      .filter((account) => filter === 'all' || account.favorite)
      .filter((account) => !query || [account.name, account.account, account.issuer, account.notes].some((value) => value.toLocaleLowerCase().includes(query)))
  }, [accounts, filter, search])

  if (loading) return <div className="app-loading"><ShieldCheck size={26} /><span>正在连接团队保险库…</span></div>
  if (serverError && !authMode && !user) return <div className="app-loading app-loading-error"><ShieldCheck size={26} /><h2>无法连接团队保险库</h2><p>{serverError}</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>重新连接</button></div>
  if (!user || authMode) return <AuthScreen mode={authMode || 'unlock'} onSubmit={authenticate} />

  const favoriteCount = accounts.filter((account) => account.favorite).length

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></span><span>KeyFort</span></div>
          <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} title="关闭菜单" aria-label="关闭菜单"><X size={20} /></button>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          <span className="nav-label">共享保险库</span>
          <button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => { setFilter('all'); setSidebarOpen(false) }}><LayoutGrid size={18} /><span>全部验证项</span><b>{accounts.length}</b></button>
          <button className={filter === 'favorites' ? 'active' : ''} type="button" onClick={() => { setFilter('favorites'); setSidebarOpen(false) }}><Star size={18} /><span>收藏</span><b>{favoriteCount}</b></button>
        </nav>

        {user.role === 'admin' && <div className="sidebar-tools"><span className="nav-label">团队</span><button type="button" onClick={() => setTeamOpen(true)}><Users size={18} /><span>成员管理</span></button></div>}

        <div className="sidebar-footer">
          <div className="vault-status"><span><Users size={16} /></span><div><strong>{user.name}</strong><small>{user.role === 'admin' ? '管理员' : '团队成员'}</small></div></div>
          <button className="icon-button" type="button" onClick={() => void lockVault()} title="退出登录" aria-label="退出登录"><LogOut size={18} /></button>
        </div>
      </aside>
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="workspace">
        <header className="workspace-header">
          <div className="mobile-title"><button className="icon-button" type="button" onClick={() => setSidebarOpen(true)} title="打开菜单" aria-label="打开菜单"><Menu size={21} /></button><div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={19} /></span><span>KeyFort</span></div></div>
          <div className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、账号或备注" aria-label="搜索验证项" />{search && <button className="icon-button" type="button" onClick={() => setSearch('')} title="清除搜索" aria-label="清除搜索"><X size={16} /></button>}</div>
          <button className="primary-button add-button" type="button" onClick={() => setEditing(null)}><Plus size={18} />添加验证项</button>
        </header>

        <div className="workspace-content">
          <div className="page-heading"><div><span className="page-kicker">TEAM AUTHENTICATOR</span><h1>{filter === 'all' ? '共享验证项' : '我的收藏'}</h1><p>{visibleAccounts.length} 个账号 · 团队实时同步</p></div><div className="security-pill"><ShieldCheck size={16} />已连接</div></div>
          {serverError && <div className="sync-warning"><Settings2 size={16} />{serverError}</div>}

          {visibleAccounts.length > 0 ? <div className="account-grid">{visibleAccounts.map((account) => <AccountCard key={account.id} account={account} copied={copiedId === account.id} onCopy={() => void copyToken(account)} onEdit={() => setEditing(account)} onDelete={() => void removeAccount(account)} onFavorite={() => void toggleFavorite(account)} />)}</div> : (
            <div className="empty-state"><div className="empty-icon">{search ? <Search size={27} /> : filter === 'favorites' ? <Star size={27} /> : <FileKey size={27} />}</div><h2>{search ? '没有匹配的验证项' : filter === 'favorites' ? '还没有收藏' : '共享保险库还是空的'}</h2><p>{search ? '尝试搜索其他名称、账号或备注' : filter === 'favorites' ? '在验证项菜单中添加收藏' : '添加第一个团队验证项开始使用'}</p>{!search && filter === 'all' && <button className="primary-button" type="button" onClick={() => setEditing(null)}><Plus size={18} />添加验证项</button>}</div>
          )}
        </div>
      </main>

      {editing !== undefined && <AccountModal account={editing ? { ...editing, secret: '' } : null} onClose={() => setEditing(undefined)} onSave={saveAccount} />}
      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} onToast={showToast} />}
      {toast && <div className="toast" role="status"><ArchiveRestore size={17} />{toast}</div>}
    </div>
  )
}
