import { useEffect, useState } from 'react'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import FormsPage from './pages/FormsPage'
import NewFormPage from './pages/NewFormPage'
import SubmissionsPage from './pages/SubmissionsPage'
import { fetchWebSession } from './lib/api'
import type { MonthlyForm, WebUser } from './lib/api'
import { clearToken, loadToken } from './lib/session'

type View = { name: 'forms' } | { name: 'new' } | { name: 'progress'; form: MonthlyForm }

interface Session {
  user: WebUser
  token: string
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [view, setView] = useState<View>({ name: 'forms' })
  // 有本地票据时要先向服务端确认一次，不能凭本地有没有票据就当作已登录
  const [checking, setChecking] = useState(() => loadToken() !== '')

  useEffect(() => {
    const stored = loadToken()
    if (!stored) return
    let cancelled = false
    // 票据可能已过期，或被管理员清掉了密码，所以必须问一次服务端
    fetchWebSession(stored)
      .then(res => {
        if (cancelled) return
        if (res.ok && res.user) setSession({ user: res.user, token: stored })
        else clearToken()
      })
      .catch(() => { if (!cancelled) clearToken() })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [])

  function handleLoggedIn(user: WebUser, token: string) {
    setSession({ user, token })
    setView({ name: 'forms' })
    setChecking(false)
  }

  function handleLogout() {
    clearToken()
    setSession(null)
    setView({ name: 'forms' })
  }

  if (checking) {
    return (
      <AppShell sidebar={false}>
        <p className="helper">正在恢复登录状态…</p>
      </AppShell>
    )
  }
  if (!session) return <LoginPage onLoggedIn={handleLoggedIn} />

  if (view.name === 'new') {
    return (
      <NewFormPage
        token={session.token}
        user={session.user}
        onBack={() => setView({ name: 'forms' })}
        onLogout={handleLogout}
        onCreated={() => setView({ name: 'forms' })}
      />
    )
  }

  if (view.name === 'progress') {
    return (
      <SubmissionsPage
        token={session.token}
        user={session.user}
        form={view.form}
        onBack={() => setView({ name: 'forms' })}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <FormsPage
      token={session.token}
      user={session.user}
      onLogout={handleLogout}
      onCreate={() => setView({ name: 'new' })}
      onOpenProgress={form => setView({ name: 'progress', form })}
    />
  )
}
