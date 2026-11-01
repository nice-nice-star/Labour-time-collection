import type { ReactNode } from 'react'
import logo from '../img/white-logo-4.png'
import type { WebUser } from '../lib/api'
import { LanguageToggle, translate, useLanguage } from '../lib/i18n'
import type { MessageKey } from '../lib/i18n'

/** 管理端目前有哪几页；侧边栏用它来决定高亮哪一项 */
export type PageKey = 'forms' | 'new' | 'progress'

const NAV_ITEMS: { key: PageKey; labelKey: MessageKey }[] = [
  { key: 'forms', labelKey: '表单列表' },
  { key: 'new', labelKey: '新建月度表单' },
  { key: 'progress', labelKey: '填报进度' }
]

interface Props {
  /** 当前页面；侧边栏把对应条目显示为选中状态 */
  active?: PageKey | null
  /** 已登录用户，显示在 header 右侧 */
  user?: WebUser
  onLogout?: () => void
  /** 登录页等场景不需要侧边栏 */
  sidebar?: boolean
  /** 登录页不提供语言切换；登录后的所有页面默认显示 */
  showLanguageToggle?: boolean
  /** 登录页 header 标题中英并列 */
  bilingualHeader?: boolean
  children: ReactNode
}

/**
 * 全站统一外壳：顶部紫色 header + 左侧边栏 + 内容区。
 *
 * 侧边栏只是「当前在哪一页」的指示器，条目不可点击、不承担跳转——
 * 页面切换仍然由 App.tsx 的 view 状态负责。
 */
export default function AppShell({
  active = null,
  user,
  onLogout,
  sidebar = true,
  showLanguageToggle = true,
  bilingualHeader = false,
  children
}: Props) {
  const { t, lang } = useLanguage()
  const title = bilingualHeader
    ? `${translate('zh', 'CPRO 学助工时申报')} / ${translate('en', 'CPRO 学助工时申报')}`
    : t('CPRO 学助工时申报')

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <img className="app-logo" src={logo} alt={t('香港中文大学（深圳）')} />
          <span className="app-title" lang={bilingualHeader ? undefined : lang}>{title}</span>
        </div>
        <div className="app-header-right">
          {showLanguageToggle && <LanguageToggle />}
          {user && <span className="app-user">{t('Hi，{name}', { name: user.name })}</span>}
          {onLogout && (
            <button type="button" className="app-logout" onClick={onLogout}>{t('退出登录')}</button>
          )}
        </div>
      </header>

      <div className="app-body">
        {sidebar && (
          <aside className="app-sidebar">
            <p className="sidebar-group">{t('学助工时管理')}</p>
            <ul className="sidebar-list">
              {NAV_ITEMS.map(item => (
                <li
                  key={item.key}
                  className={item.key === active ? 'sidebar-item active' : 'sidebar-item'}
                  aria-current={item.key === active ? 'page' : undefined}
                >
                  {t(item.labelKey)}
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
