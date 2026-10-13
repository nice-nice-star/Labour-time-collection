import type { ReactNode } from 'react'
import logo from '../img/white-logo-4.png'
import type { WebUser } from '../lib/api'

/** 管理端目前有哪几页；侧边栏用它来决定高亮哪一项 */
export type PageKey = 'forms' | 'new' | 'progress'

const NAV_ITEMS: { key: PageKey; label: string }[] = [
  { key: 'forms', label: '表单列表' },
  { key: 'new', label: '新建月度表单' },
  { key: 'progress', label: '填报进度' }
]

interface Props {
  /** 当前页面；侧边栏把对应条目显示为选中状态 */
  active?: PageKey | null
  /** 已登录用户，显示在 header 右侧 */
  user?: WebUser
  onLogout?: () => void
  /** 登录页等场景不需要侧边栏 */
  sidebar?: boolean
  children: ReactNode
}

/**
 * 全站统一外壳：顶部紫色 header + 左侧边栏 + 内容区。
 *
 * 侧边栏只是「当前在哪一页」的指示器，条目不可点击、不承担跳转——
 * 页面切换仍然由 App.tsx 的 view 状态负责。
 */
export default function AppShell({ active = null, user, onLogout, sidebar = true, children }: Props) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <img className="app-logo" src={logo} alt="香港中文大学（深圳）" />
          <span className="app-title">CPRO 学助工时申报</span>
        </div>
        <div className="app-header-right">
          {user && <span className="app-user">Hi，{user.name}</span>}
          {onLogout && (
            <button type="button" className="app-logout" onClick={onLogout}>退出登录</button>
          )}
        </div>
      </header>

      <div className="app-body">
        {sidebar && (
          <aside className="app-sidebar">
            <p className="sidebar-group">学助工时管理</p>
            <ul className="sidebar-list">
              {NAV_ITEMS.map(item => (
                <li
                  key={item.key}
                  className={item.key === active ? 'sidebar-item active' : 'sidebar-item'}
                  aria-current={item.key === active ? 'page' : undefined}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          </aside>
        )}

        <main className={sidebar ? 'app-main' : 'app-main center'}>{children}</main>
      </div>
    </div>
  )
}
