import { Activity, Globe2, HardDrive, LayoutGrid, Link2, LockKeyhole, LogOut, ShieldCheck, Star, Trash2, Users, WandSparkles, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import type { User } from '../lib/api'

interface WorkspaceSidebarProps {
  isGuest: boolean
  user: User | null
  accountCount: number
  favoriteCount: number
  tags: string[]
  open: boolean
  onClose: () => void
  onExit: () => void
}

export function WorkspaceSidebar({ isGuest, user, accountCount, favoriteCount, tags, open, onClose, onExit }: WorkspaceSidebarProps) {
  const location = useLocation()
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'active' : ''
  const closeOnNavigate = () => onClose()

  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-head">
        <div className="brand-lockup"><span className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></span><span>KeyFort</span></div>
        <button className="icon-button sidebar-close" type="button" onClick={onClose} title="关闭菜单" aria-label="关闭菜单"><X size={20} /></button>
      </div>

      <nav className="sidebar-nav" aria-label="主导航">
        <span className="nav-label">{isGuest ? '本地保险库' : '共享保险库'}</span>
        <NavLink className={navClass} to="/accounts" onClick={closeOnNavigate}><LayoutGrid size={18} /><span>全部验证项</span><b>{accountCount}</b></NavLink>
        <NavLink className={navClass} to="/favorites" onClick={closeOnNavigate}><Star size={18} /><span>收藏</span><b>{favoriteCount}</b></NavLink>
        <NavLink className={navClass} to="/public" onClick={closeOnNavigate}><Globe2 size={18} /><span>公开验证码</span></NavLink>
        <NavLink className={navClass} to="/generator" onClick={closeOnNavigate}><WandSparkles size={18} /><span>密码生成器</span></NavLink>
      </nav>

      {tags.length > 0 && <nav className="sidebar-nav sidebar-tags" aria-label="标签筛选">
        <span className="nav-label">标签</span>
        {tags.slice(0, 8).map((tag) => <NavLink className={() => location.pathname === '/accounts' && new URLSearchParams(location.search).get('tag') === tag ? 'active' : ''} key={tag} to={`/accounts?tag=${encodeURIComponent(tag)}`} onClick={closeOnNavigate}><span className="tag-dot" /><span>{tag}</span></NavLink>)}
      </nav>}

      {!isGuest && <nav className="sidebar-nav sidebar-management" aria-label="管理导航">
        <span className="nav-label">管理</span>
        <NavLink className={navClass} to="/security" onClick={closeOnNavigate}><LockKeyhole size={18} /><span>安全中心</span></NavLink>
        {user?.role === 'admin' && <>
          <NavLink className={navClass} to="/team" onClick={closeOnNavigate}><Users size={18} /><span>成员管理</span></NavLink>
          <NavLink className={navClass} to="/shares" onClick={closeOnNavigate}><Link2 size={18} /><span>分享管理</span></NavLink>
          <NavLink className={navClass} to="/audit" onClick={closeOnNavigate}><Activity size={18} /><span>操作审计</span></NavLink>
          <NavLink className={navClass} to="/trash" onClick={closeOnNavigate}><Trash2 size={18} /><span>回收站</span></NavLink>
        </>}
      </nav>}

      <div className="sidebar-footer">
        <div className="vault-status">
          <span>{isGuest ? <HardDrive size={16} /> : <Users size={16} />}</span>
          <div><strong>{isGuest ? '本地试用' : user?.name}</strong><small>{isGuest ? '仅此浏览器' : user?.role === 'admin' ? '管理员' : '团队成员'}</small></div>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onExit}
          title={isGuest ? '退出试用' : '退出登录'}
          aria-label={isGuest ? '退出试用' : '退出登录'}
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}
