import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArchiveRestore, ShieldCheck } from 'lucide-react'
import { AccountModal } from './components/AccountModal'
import { AuditPage } from './components/AuditPage'
import { AuthScreen } from './components/AuthScreen'
import { ImportDialog } from './components/ImportDialog'
import { ReauthDialog } from './components/ReauthDialog'
import { SecurityPage } from './components/SecurityPage'
import { ShareDialog } from './components/ShareDialog'
import { SharesPage } from './components/SharesPage'
import { TeamPage } from './components/TeamPage'
import { TrashPage } from './components/TrashPage'
import { WorkspaceHeader, AccountWorkspace } from './components/WorkspaceContent'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { createAccount, deleteAccount, getAuthStatus, listAccounts, login, logout, reorderAccounts, setupAccount, updateAccount, updateFavorite, updatePinned, updatePublicAccess, type AccountView, type ApiError, type User } from './lib/api'

import { enterGuestMode, isGuestActive, leaveGuestMode, loadGuestAccounts, saveGuestAccounts, toGuestAccountView } from './lib/guest'
import { normalizeSecret } from './lib/totp'
import { copyText, waitForFreshToken } from './lib/clipboard'
import type { TotpAccount } from './types'

type AuthMode = 'create' | 'unlock'
type WorkspaceMode = 'team' | 'guest'

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const filter = location.pathname === '/favorites' ? 'favorites' : 'all'
  const activeTag = new URLSearchParams(location.search).get('tag') || ''
  const [authMode, setAuthMode] = useState<AuthMode>('unlock')
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TotpAccount | null | undefined>(undefined)
  const [sharing, setSharing] = useState<AccountView | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState('')
  const [reauthOpen, setReauthOpen] = useState(false)
  const reauthRequest = useRef<{
    action: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  } | null>(null)
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
    const workspacePaths = ['/accounts', '/favorites']
    const teamPaths = ['/security']
    const adminPaths = ['/team', '/audit', '/trash', '/shares']
    const dashboardPath = workspacePaths.includes(location.pathname)
      || (workspaceMode === 'team' && teamPaths.includes(location.pathname))
      || (workspaceMode === 'team' && user?.role === 'admin' && adminPaths.includes(location.pathname))
    if (!workspaceMode && location.pathname !== '/') navigate('/', { replace: true })
    if (workspaceMode && !dashboardPath) navigate('/accounts', { replace: true })
  }, [loading, location.pathname, navigate, user?.role, workspaceMode])

  useEffect(() => {
    if (!workspaceMode || !['/accounts', '/favorites'].includes(location.pathname)) return undefined
    const timer = window.setInterval(() => {
      if (workspaceMode === 'team') void refreshTeamAccounts()
      else refreshGuestAccounts()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [location.pathname, workspaceMode])

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
      tags: draft.tags,
      accessMode: draft.accessMode,
      memberIds: draft.memberIds,
      pinned: draft.pinned,
      sortOrder: draft.sortOrder,
      color: draft.color,
    }
    const exists = accounts.some((account) => account.id === draft.id)
    if (exists) {
      await withReauth(() => updateAccount(draft.id, payload))
      showToast('验证项已更新')
    } else {
      await withReauth(() => createAccount(payload as typeof payload & { secret: string }))
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
    const message = workspaceMode === 'guest' ? `确定删除“${account.name}”吗？此操作无法撤销。` : `将“${account.name}”移入回收站？`
    if (!window.confirm(message)) return
    if (workspaceMode === 'guest') {
      persistGuestAccounts(guestAccounts.current.filter((item) => item.id !== account.id))
      showToast('本地验证项已删除')
      return
    }
    await deleteAccount(account.id)
    showToast('验证项已移入回收站')
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

  async function togglePinned(account: AccountView) {
    const pinned = !account.pinned
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, pinned } : item))
    if (workspaceMode === 'guest') {
      persistGuestAccounts(guestAccounts.current.map((item) => item.id === account.id ? { ...item, pinned, updatedAt: Date.now() } : item))
      showToast(pinned ? '已置顶' : '已取消置顶')
      return
    }
    try {
      const result = await updatePinned(account.id, pinned)
      setAccounts((current) => current.map((item) => item.id === account.id ? result.account : item))
      showToast(pinned ? '已置顶' : '已取消置顶')
    } catch (reason) {
      setAccounts((current) => current.map((item) => item.id === account.id ? account : item))
      showToast(reason instanceof Error ? reason.message : '置顶操作失败')
    }
  }

  function shareAccount(account: AccountView) { setSharing(account) }

  async function handleReorder(sourceId: string, targetId: string) {
    const sourceIndex = accounts.findIndex((account) => account.id === sourceId)
    const targetIndex = accounts.findIndex((account) => account.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    const reordered = [...accounts]
    const [source] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, source)
    const next = reordered.map((account, index) => ({ ...account, sortOrder: index }))
    setAccounts(next)
    if (workspaceMode === 'guest') {
      const order = new Map(next.map((account) => [account.id, account.sortOrder]))
      persistGuestAccounts(guestAccounts.current.map((account) => ({ ...account, sortOrder: order.get(account.id) ?? 0 })))
      return
    }
    try {
      await reorderAccounts(next.map((account) => account.id))
    }
    catch (reason) { await refreshTeamAccounts(); showToast(reason instanceof Error ? reason.message : '排序保存失败') }
  }

  async function togglePublicAccess(account: AccountView) {
    const publicAccess = !account.publicAccess
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, publicAccess } : item))
    try {
      const result = await withReauth(() => updatePublicAccess(account.id, publicAccess))
      setAccounts((current) => current.map((item) => item.id === account.id ? result.account : item))
      showToast(publicAccess ? '已设置为公开' : '已设置为私有')
    } catch (reason) {
      setAccounts((current) => current.map((item) => item.id === account.id ? account : item))
      showToast(reason instanceof Error ? reason.message : '公开设置失败')
    }
  }

  async function withReauth<T>(action: () => Promise<T>): Promise<T> {
    try { return await action() }
    catch (reason) {
      const error = reason as ApiError
      if (!error.reauthRequired && error.status !== 428) throw reason
      return new Promise<T>((resolve, reject) => {
        reauthRequest.current = {
          action,
          resolve: (value) => resolve(value as T),
          reject,
        }
        setReauthOpen(true)
      })
    }
  }

  async function continueAfterReauth() {
    setReauthOpen(false)
    const request = reauthRequest.current
    reauthRequest.current = null
    if (!request) return
    try { request.resolve(await request.action()) }
    catch (reason) { request.reject(reason) }
  }

  function cancelReauth() {
    setReauthOpen(false)
    reauthRequest.current?.reject(new Error('操作已取消'))
    reauthRequest.current = null
  }

  async function copyToken(account: AccountView) {
    if (!account.token) return
    try {
      const fresh = await waitForFreshToken(account, async () => {
        if (workspaceMode === 'guest') return toGuestAccountView(guestAccounts.current.find((item) => item.id === account.id) || account as unknown as TotpAccount)
        const result = await listAccounts()
        return result.accounts.find((item) => item.id === account.id) || account
      })
      if (!fresh.token) throw new Error('验证码暂时不可用')
      await copyText(fresh.token)
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
      .filter((account) => !activeTag || account.tags?.includes(activeTag))
      .filter((account) => !query || [account.name, account.account, account.issuer, account.notes].some((value) => value.toLocaleLowerCase().includes(query)))
  }, [accounts, activeTag, filter, search])


  if (loading) return <div className="app-loading"><ShieldCheck size={26} /><span>正在打开 KeyFort…</span></div>
  if (!workspaceMode) return <AuthScreen mode={authMode} onSubmit={authenticate} onTryGuest={startGuestMode} serverError={serverError} />

  const isGuest = workspaceMode === 'guest'
  const isAdmin = !isGuest && user?.role === 'admin'
  const isSecurityPage = !isGuest && location.pathname === '/security'
  const isAdminPage = isAdmin && ['/team', '/audit', '/trash', '/shares'].includes(location.pathname)
  const isManagementPage = isSecurityPage || isAdminPage
  const favoriteCount = accounts.filter((account) => account.favorite).length

  return (
    <div className="app-shell">
      <WorkspaceSidebar
        isGuest={isGuest}
        user={user}
        accountCount={accounts.length}
        favoriteCount={favoriteCount}
        tags={Array.from(new Set(accounts.flatMap((account) => account.tags || []))).sort()}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onExit={() => void exitWorkspace()}
      />
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="workspace">
        <WorkspaceHeader
          isTeamPage={isManagementPage}
          search={search}
          setSearch={setSearch}
          onOpenSidebar={() => setSidebarOpen(true)}
          onAdd={() => setEditing(null)}
          onImport={!isGuest && !isManagementPage ? () => setImportOpen(true) : undefined}
        />

        <div className="workspace-content">
          {isAdmin && location.pathname === '/team' && <TeamPage onToast={showToast} onReauth={withReauth} />}
          {isSecurityPage && <SecurityPage isAdmin={isAdmin} onToast={showToast} onReauth={withReauth} />}
          {isAdmin && location.pathname === '/audit' && <AuditPage />}
          {isAdmin && location.pathname === '/trash' && <TrashPage onToast={showToast} onReauth={withReauth} />}
          {isAdmin && location.pathname === '/shares' && <SharesPage onToast={showToast} />}
          {!isManagementPage && (
            <AccountWorkspace
              visibleAccounts={visibleAccounts}
              filter={filter}
              search={search}
              activeTag={activeTag}
              isGuest={isGuest}
              serverError={serverError}
              copiedId={copiedId}
              canManagePublic={!isGuest && user?.role === 'admin'}
              onAdd={() => setEditing(null)}
              onCopy={(account) => void copyToken(account)}
              onEdit={openEditor}
              onDelete={(account) => void removeAccount(account)}
              onFavorite={(account) => void toggleFavorite(account)}
              onPublicAccess={(account) => void togglePublicAccess(account)}
              onPinned={(account) => void togglePinned(account)}
              onShare={(account) => void shareAccount(account)}
              onReorder={(sourceId, targetId) => void handleReorder(sourceId, targetId)}
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
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={refreshTeamAccounts} onToast={showToast} />}
      {sharing && <ShareDialog account={sharing} onClose={() => setSharing(null)} onReauth={withReauth} onToast={showToast} />}
      {reauthOpen && <ReauthDialog onClose={cancelReauth} onVerified={() => void continueAfterReauth()} />}
      {toast && <div className="toast" role="status"><ArchiveRestore size={17} />{toast}</div>}
    </div>
  )
}
