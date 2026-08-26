import { useEffect, useState } from 'react'
import { ArchiveRestore, ShieldCheck, Trash2 } from 'lucide-react'
import { destroyAccount, listTrash, restoreAccount, type AccountView } from '../lib/api'
import { PageHeading } from './PageHeading'

interface TrashPageProps { onToast: (message: string) => void; onReauth: <T>(action: () => Promise<T>) => Promise<T | undefined> }

export function TrashPage({ onToast, onReauth }: TrashPageProps) {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [error, setError] = useState('')

  async function refresh() {
    try { setAccounts((await listTrash()).accounts); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载回收站') }
  }
  useEffect(() => { void refresh() }, [])

  async function restore(account: AccountView) {
    try {
      await restoreAccount(account.id)
      onToast('验证项已恢复')
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '恢复失败') }
  }

  async function destroy(account: AccountView) {
    if (!window.confirm(`永久删除“${account.name}”？此操作无法撤销。`)) return
    try {
      await onReauth(() => destroyAccount(account.id))
      onToast('验证项已永久删除')
      await refresh()
    } catch (reason) {
      if (reason instanceof Error && reason.message === '操作已取消') return
      setError(reason instanceof Error ? reason.message : '永久删除失败')
    }
  }

  return <div className="management-page">
    <PageHeading kicker="RECYCLE BIN" title="回收站" description={`${accounts.length} 个验证项 · 删除 30 天后自动清理`} statusIcon={<ShieldCheck size={16} />} statusLabel="可恢复" />
    {error && <div className="form-error management-error" role="alert">{error}</div>}
    <section className="management-panel management-panel-wide">
      <div className="management-list">
        {accounts.length === 0 ? <p className="muted-text">回收站是空的。</p> : accounts.map((account) => <div className="management-row" key={account.id}>
          <span className="member-avatar" style={{ backgroundColor: account.color, color: '#fff' }}>{account.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{account.name}</strong><small>{account.account || account.issuer} · {account.deletedAt ? new Date(account.deletedAt).toLocaleString() : ''}</small></div>
          <button className="icon-button" type="button" onClick={() => void restore(account)} title="恢复" aria-label={`恢复 ${account.name}`}><ArchiveRestore size={16} /></button>
          <button className="icon-button member-remove" type="button" onClick={() => void destroy(account)} title="永久删除" aria-label={`永久删除 ${account.name}`}><Trash2 size={16} /></button>
        </div>)}
      </div>
    </section>
  </div>
}
