import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore,
  FileKey,
  HardDrive,
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
import { PublicAccessPage } from './components/PublicAccessPage'
import { TeamModal } from './components/TeamModal'
import { createAccount, deleteAccount, getAuthStatus, listAccounts, login, logout, setupAccount, updateAccount, type AccountView, type User } from './lib/api'

import { enterGuestMode, isGuestActive, leaveGuestMode, loadGuestAccounts, saveGuestAccounts, toGuestAccountView } from './lib/guest'
import { normalizeSecret } from './lib/totp'
import type { TotpAccount } from './types'

type Filter = 'all' | 'favorites'
type AuthMode = 'create' | 'unlock'
type WorkspaceMode = 'team' | 'guest'

export default function App() {
  const isPublicPage = window.location.pathname === '/public'
  const [authMode, setAuthMode] = useState<AuthMode>('unlock')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TotpAccount | null | undefined>(undefined)
  const [teamOpen, setTeamOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState('')
  const guestAccounts = useRef<TotpAccount[]>([])

  useEffect(() => {
    if (isPublicPage) {
      setLoading(false)
      return
    }
    if (isGuestActive()) {
      guestAccounts.current = loadGuestAccounts()
      setAccounts(guestAccounts.current.map((account) => toGuestAccountView(account)))
      setWorkspaceMode('guest')
      setLoading(false)
      return
    }

    void getAuthStatus()
      .then((status) => {
        setUser(status.user)
        setAuthMode(status.setupRequired ? 'create' : 'unlock')
        if (status.user) {
          setWorkspaceMode('team')
          void refreshTeamAccounts()
        }
      })
      .catch((reason) => {
        setAuthMode('unlock')
        setServerError(reason instanceof Error ? reason.message : '无法连接服务端')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (isPublicPage || !workspaceMode) return undefined
    const timer = window.setInterval(() => {
      if (workspaceMode === 'team') void refreshTeamAccounts()
      else refreshGuestAccounts()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [workspaceMode])

  async function refreshTeamAccounts() {
    try {
      const result = await listAccounts()
      setAccounts(result.accounts)
      setServerError('')
    } catch (reason) {
      if (reason instanceof Error && reason.message === '请先登录') {
        setUser(null)
        setWorkspaceMode(null)
        setAuthMode('unlock')
      } else {
        setServerError(reason instanceof Error ? reason.message : '同步失败')
      }
    }
  }

  function refreshGuestAccounts() {
    setAccounts(guestAccounts.current.map((account) => toGuestAccountView(account)))
  }

  function persistGuestAccounts(next: TotpAccount[]) {
    guestAccounts.current = next
    saveGuestAccounts(next)
    refreshGuestAccounts()
  }

  async function authenticate(payload: { email: string; name: string; password: string }) {
    const result = authMode === 'create' ? await setupAccount(payload) : await login(payload)
    setUser(result.user)
    setWorkspaceMode('team')
    setServerError('')
    await refreshTeamAccounts()
  }

  function startGuestMode() {
    guestAccounts.current = enterGuestMode()
    setAccounts(guestAccounts.current.map((account) => toGuestAccountView(account)))
    setWorkspaceMode('guest')
    setUser(null)
    setServerError('')
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  async function saveAccount(draft: TotpAccount) {
    if (workspaceMode === 'guest') {
      const exists = guestAccounts.current.some((account) => account.id === draft.id)
      const next = exists
        ? guestAccounts.current.map((account) => account.id === draft.id ? draft : account)
        : [...guestAccounts.current, draft]
      persistGuestAccounts(next)
      setEditing(undefined)
      showToast(exists ? '本地验证项已更新' : '验证项已保存到本地')
      return
    }

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
      publicAccess: draft.publicAccess ?? false,
      color: draft.color,
    }
    const exists = accounts.some((account) => account.id === draft.id)
    if (exists) {
      await updateAccount(draft.id, payload)
      showToast('验证项已更新')
    } else {
      await createAccount(payload as typeof payload & { secret: string })
      showToast('验证项已添加')
    }
    setEditing(undefined)
    await refreshTeamAccounts()
  }

  function openEditor(account: AccountView) {
    if (workspaceMode === 'guest') {
      setEditing(guestAccounts.current.find((item) => item.id === account.id) ?? null)
      return
    }
    setEditing({ ...account, secret: '' })
  }

  async function removeAccount(account: AccountView) {
    if (!window.confirm(`确定删除“${account.name}”吗？此操作无法撤销。`)) return
    if (workspaceMode === 'guest') {
      persistGuestAccounts(guestAccounts.current.filter((item) => item.id !== account.id))
      showToast('本地验证项已删除')
      return
    }
    await deleteAccount(account.id)
    showToast('验证项已删除')
    await refreshTeamAccounts()
  }

  async function toggleFavorite(account: AccountView) {
    if (workspaceMode === 'guest') {
      persistGuestAccounts(guestAccounts.current.map((item) => item.id === account.id ? { ...item, favorite: !item.favorite, updatedAt: Date.now() } : item))
      return
    }
    await updateAccount(account.id, {
      name: account.name,
      account: account.account,
      issuer: account.issuer,
      digits: account.digits,
      period: account.period,
      algorithm: account.algorithm,
      notes: account.notes,
      favorite: !account.favorite,
      publicAccess: account.publicAccess,
      color: account.color,
    })
    await refreshTeamAccounts()
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

  async function exitWorkspace() {
    if (workspaceMode === 'guest') leaveGuestMode()
    else await logout().catch(() => undefined)
    setUser(null)
    setWorkspaceMode(null)
    setAccounts([])
    setSearch('')
    setSidebarOpen(false)
    try {
      const status = await getAuthStatus()
      setAuthMode(status.setupRequired ? 'create' : 'unlock')
    } catch {
      setAuthMode('unlock')
    }
  }

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return accounts
      .filter((account) => filter === 'all' || account.favorite)
      .filter((account) => !query || [account.name, account.account, account.issuer, account.notes].some((value) => value.toLocaleLowerCase().includes(query)))
  }, [accounts, filter, search])

  if (isPublicPage) return <PublicAccessPage />

  if (loading) return <div className="app-loading"><ShieldCheck size={26} /><span>正在打开 KeyFort…</span></div>
  if (!workspaceMode) return <AuthScreen mode={authMode} onSubmit={authenticate} onTryGuest={startGuestMode} serverError={serverError} />

  const isGuest = workspaceMode === 'guest'
  const favoriteCount = accounts.filter((account) => account.favorite).length

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></span><span>KeyFort</span></div>
          <button className="icon-button sidebar-close" type="button" onClick={() => setSidebarOpen(false)} title="关闭菜单" aria-label="关闭菜单"><X size={20} /></button>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          <span className="nav-label">{isGuest ? '本地保险库' : '共享保险库'}</span>
          <button className={filter === 'all' ? 'active' : ''} type="button" onClick={() => { setFilter('all'); setSidebarOpen(false) }}><LayoutGrid size={18} /><span>全部验证项</span><b>{accounts.length}</b></button>
          <button className={filter === 'favorites' ? 'active' : ''} type="button" onClick={() => { setFilter('favorites'); setSidebarOpen(false) }}><Star size={18} /><span>收藏</span><b>{favoriteCount}</b></button>
        </nav>

        {!isGuest && user?.role === 'admin' && <div className="sidebar-tools"><span className="nav-label">团队</span><button type="button" onClick={() => setTeamOpen(true)}><Users size={18} /><span>成员管理</span></button></div>}

        <div className="sidebar-footer">
          <div className="vault-status"><span>{isGuest ? <HardDrive size={16} /> : <Users size={16} />}</span><div><strong>{isGuest ? '本地试用' : user?.name}</strong><small>{isGuest ? '仅此浏览器' : user?.role === 'admin' ? '管理员' : '团队成员'}</small></div></div>
          <button className="icon-button" type="button" onClick={() => void exitWorkspace()} title={isGuest ? '退出试用' : '退出登录'} aria-label={isGuest ? '退出试用' : '退出登录'}><LogOut size={18} /></button>
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
          <div className="page-heading"><div><span className="page-kicker">{isGuest ? 'LOCAL AUTHENTICATOR' : 'TEAM AUTHENTICATOR'}</span><h1>{filter === 'favorites' ? '我的收藏' : isGuest ? '本地验证项' : '共享验证项'}</h1><p>{visibleAccounts.length} 个账号 · {isGuest ? '保存在当前浏览器' : '团队实时同步'}</p></div><div className={`security-pill ${isGuest ? 'local-pill' : ''}`}>{isGuest ? <HardDrive size={16} /> : <ShieldCheck size={16} />}{isGuest ? '本地试用' : '已连接'}</div></div>
          {isGuest && <div className="local-mode-notice"><HardDrive size={16} /><div><strong>本地试用模式</strong><span>数据和 Secret Key 保存在当前浏览器，请勿用于重要的正式凭证。</span></div></div>}
          {!isGuest && serverError && <div className="sync-warning"><Settings2 size={16} />{serverError}</div>}

          {visibleAccounts.length > 0 ? <div className="account-grid">{visibleAccounts.map((account) => <AccountCard key={account.id} account={account} copied={copiedId === account.id} onCopy={() => void copyToken(account)} onEdit={() => openEditor(account)} onDelete={() => void removeAccount(account)} onFavorite={() => void toggleFavorite(account)} />)}</div> : (
            <div className="empty-state"><div className="empty-icon">{search ? <Search size={27} /> : filter === 'favorites' ? <Star size={27} /> : <FileKey size={27} />}</div><h2>{search ? '没有匹配的验证项' : filter === 'favorites' ? '还没有收藏' : isGuest ? '本地保险库还是空的' : '共享保险库还是空的'}</h2><p>{search ? '尝试搜索其他名称、账号或备注' : filter === 'favorites' ? '在验证项菜单中添加收藏' : '添加第一个验证项开始使用'}</p>{!search && filter === 'all' && <button className="primary-button" type="button" onClick={() => setEditing(null)}><Plus size={18} />添加验证项</button>}</div>
          )}
        </div>
      </main>

      {editing !== undefined && <AccountModal account={editing} onClose={() => setEditing(undefined)} onSave={saveAccount} allowPublic={!isGuest && user?.role === 'admin'} localMode={isGuest} />}
      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} onToast={showToast} />}
      {toast && <div className="toast" role="status"><ArchiveRestore size={17} />{toast}</div>}
    </div>
  )
}
