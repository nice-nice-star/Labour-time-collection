import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import { fetchWebSession } from './lib/api'
import type { WebUser } from './lib/api'
import { clearToken, loadToken } from './lib/session'

export default function App() {
  const [user, setUser] = useState<WebUser | null>(null)
  const [checking, setChecking] = useState(() => loadToken() !== '')

  useEffect(() => {
    const stored = loadToken()
    if (!stored) return
    let cancelled = false
    // 有本地票据也要向服务端确认一次：票据可能已过期，或被管理员清掉了密码
    fetchWebSession(stored)
      .then(res => {
        if (cancelled) return
        if (res.ok && res.user) setUser(res.user)
        else clearToken()
      })
      .catch(() => { if (!cancelled) clearToken() })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  function handleLoggedIn(nextUser: WebUser) {
    setUser(nextUser)
    setChecking(false)
  }

  function handleLogout() {
    clearToken()
    setUser(null)
  }

  if (checking) return <div className="card"><p className="helper">正在恢复登录状态…</p></div>
  if (!user) return <LoginPage onLoggedIn={handleLoggedIn} />
  return <HomePage user={user} onLogout={handleLogout} />
}
