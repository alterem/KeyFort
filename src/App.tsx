import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArchiveRestore, ShieldCheck } from 'lucide-react'
import { AccountModal } from './components/AccountModal'
import { AuthScreen } from './components/AuthScreen'
import { TeamPage } from './components/TeamPage'
import { WorkspaceHeader, AccountWorkspace } from './components/WorkspaceContent'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { createAccount, deleteAccount, getAuthStatus, listAccounts, login, logout, setupAccount, updateAccount, updateFavorite, type AccountView, type User } from './lib/api'

import { enterGuestMode, isGuestActive, leaveGuestMode, loadGuestAccounts, saveGuestAccounts, toGuestAccountView } from './lib/guest'
import { normalizeSecret } from './lib/totp'
import { copyText } from './lib/clipboard'
import type { TotpAccount } from './types'

type AuthMode = 'create' | 'unlock'
type WorkspaceMode = 'team' | 'guest'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const filter = location.pathname === '/favorites' ? 'favorites' : 'all'
  const [authMode, setAuthMode] = useState<AuthMode>('unlock')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TotpAccount | null | undefined>(undefined)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState('')
  const guestAccounts = useRef<TotpAccount[]>([])

  useEffect(() => {
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
    if (loading) return
    const dashboardPath = [
      '/accounts',
      '/favorites',
    ].includes(location.pathname) || (
      location.pathname === '/team' && workspaceMode === 'team' && user?.role === 'admin'
    )
    if (!workspaceMode && location.pathname !== '/') navigate('/', { replace: true })
    if (workspaceMode && !dashboardPath) navigate('/accounts', { replace: true })
  }, [loading, location.pathname, navigate, user?.role, workspaceMode])

  useEffect(() => {
    if (!workspaceMode) return undefined
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
    navigate('/accounts')
    setServerError('')
    await refreshTeamAccounts()
  }

  function startGuestMode() {
    guestAccounts.current = enterGuestMode()
    setAccounts(guestAccounts.current.map((account) => toGuestAccountView(account)))
    setWorkspaceMode('guest')
    setUser(null)
    navigate('/accounts')
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
    const nextFavorite = !account.favorite
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, favorite: nextFavorite } : item))

    if (workspaceMode === 'guest') {
      persistGuestAccounts(guestAccounts.current.map((item) => item.id === account.id ? { ...item, favorite: nextFavorite, updatedAt: Date.now() } : item))
      showToast(nextFavorite ? '已添加到收藏' : '已取消收藏')
      return
    }

    try {
      const result = await updateFavorite(account.id, nextFavorite)
      setAccounts((current) => current.map((item) => item.id === account.id ? result.account : item))
      showToast(nextFavorite ? '已添加到收藏' : '已取消收藏')
    } catch (reason) {
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, favorite: account.favorite } : item))
      showToast(reason instanceof Error ? reason.message : '收藏操作失败')
    }
  }

  async function copyToken(account: AccountView) {
    if (!account.token) return
    try {
      await copyText(account.token)
      setCopiedId(account.id)
      window.setTimeout(() => setCopiedId(null), 1600)
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : '复制失败，请手动复制验证码')
    }
  }

  async function exitWorkspace() {
    if (workspaceMode === 'guest') leaveGuestMode()
    else await logout().catch(() => undefined)
    setUser(null)
    setWorkspaceMode(null)
    setAccounts([])
    setSearch('')
    setSidebarOpen(false)
    navigate('/')
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


  if (loading) return <div className="app-loading"><ShieldCheck size={26} /><span>正在打开 KeyFort…</span></div>
  if (!workspaceMode) return <AuthScreen mode={authMode} onSubmit={authenticate} onTryGuest={startGuestMode} serverError={serverError} />

  const isGuest = workspaceMode === 'guest'
  const isTeamPage = location.pathname === '/team' && !isGuest && user?.role === 'admin'
  const favoriteCount = accounts.filter((account) => account.favorite).length

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        isGuest={isGuest}
        user={user}
        accountCount={accounts.length}
        favoriteCount={favoriteCount}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onExit={() => void exitWorkspace()}
      />
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="workspace">
        <WorkspaceHeader
          isTeamPage={isTeamPage}
          search={search}
          setSearch={setSearch}
          onOpenSidebar={() => setSidebarOpen(true)}
          onAdd={() => setEditing(null)}
        />

        <div className="workspace-content">
          {isTeamPage ? <TeamPage onToast={showToast} /> : (
            <AccountWorkspace
              visibleAccounts={visibleAccounts}
              filter={filter}
              search={search}
              isGuest={isGuest}
              serverError={serverError}
              copiedId={copiedId}
              onAdd={() => setEditing(null)}
              onCopy={(account) => void copyToken(account)}
              onEdit={openEditor}
              onDelete={(account) => void removeAccount(account)}
              onFavorite={(account) => void toggleFavorite(account)}
            />
          )}
        </div>
      </main>

      {editing !== undefined && (
        <AccountModal
          account={editing}
          onClose={() => setEditing(undefined)}
          onSave={saveAccount}
          allowPublic={!isGuest && user?.role === 'admin'}
          localMode={isGuest}
        />
      )}
      {toast && <div className="toast" role="status"><ArchiveRestore size={17} />{toast}</div>}
    </div>
  )
}
