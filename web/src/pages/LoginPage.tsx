import { useState } from 'react'
import type { FormEvent } from 'react'
import AppShell from '../components/AppShell'
import {
  bindWebAccount, bindWebStudent,
  loginWebAccount, loginWebStudent
} from '../lib/api'
import type { WebRole, WebUser } from '../lib/api'
import { saveToken } from '../lib/session'

type Mode = 'login' | 'activate'

interface Props {
  onLoggedIn: (user: WebUser, token: string, role: WebRole) => void
}

const ROLE_COPY: Record<WebRole, { tab: string; title: string; idLabel: string; helper: string; activateHint: string }> = {
  export: {
    tab: '老师',
    title: '学助工时管理后台',
    idLabel: '工号',
    helper: '请用老师账户登录',
    activateHint: '首次使用请先激活：姓名与工号需和名单完全一致'
  },
  student: {
    tab: '学助',
    title: '学助工时申报',
    idLabel: '学号',
    helper: '请用学助账户登录',
    activateHint: '首次使用请先激活：姓名与学号需和名单完全一致'
  }
}

export default function LoginPage({ onLoggedIn }: Props) {
  const [role, setRole] = useState<WebRole>('export')
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const copy = ROLE_COPY[role]

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
  }

  // 换身份时清掉另一个身份的学号/工号，避免把老师的工号带进学助登录
  function switchRole(next: WebRole) {
    if (next === role) return
    setRole(next)
    setMode('login')
    setAccountId('')
    setPassword('')
    setError('')
    setNotice('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const id = accountId.trim()
      const trimmedName = name.trim()
      if (role === 'student') {
        if (mode === 'activate') {
          const res = await bindWebStudent(trimmedName, id, password)
          if (!res.ok) { setError(res.msg || '激活失败'); return }
          setNotice(res.msg || '激活成功，请登录')
          setMode('login')
          setPassword('')
          return
        }
        const res = await loginWebStudent(trimmedName, id, password)
        if (!res.ok || !res.token || !res.user) { setError(res.msg || '登录失败'); return }
        saveToken(res.token)
        onLoggedIn(res.user, res.token, res.role || role)
        return
      }

      if (mode === 'activate') {
        const res = await bindWebAccount(trimmedName, id, password)
        if (!res.ok) { setError(res.msg || '激活失败'); return }
        setNotice(res.msg || '激活成功，请登录')
        setMode('login')
        setPassword('')
        return
      }
      const res = await loginWebAccount(trimmedName, id, password)
      if (!res.ok || !res.token || !res.user) { setError(res.msg || '登录失败'); return }
      saveToken(res.token)
      onLoggedIn(res.user, res.token, res.role || role)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接云环境，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell sidebar={false}>
      <div className="card">
        <h1>{copy.title}</h1>
        <p className="helper">
          {mode === 'login' ? copy.helper : copy.activateHint}
        </p>

        <div className="role-switch" role="tablist" aria-label="登录身份">
          {(['export', 'student'] as WebRole[]).map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={role === value}
              className={role === value ? 'role-tab active' : 'role-tab'}
              onClick={() => switchRole(value)}
              disabled={busy}
            >
              {ROLE_COPY[value].tab}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <label htmlFor="name">姓名</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} autoComplete="username" />

          <label htmlFor="accountId">{copy.idLabel}</label>
          <input
            id="accountId"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            autoComplete="username"
          />

          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}

          <button type="submit" disabled={busy}>
            {busy ? '处理中…' : mode === 'login' ? '登录' : '激活账户'}
          </button>
        </form>

        <button type="button" className="link" onClick={() => switchMode(mode === 'login' ? 'activate' : 'login')}>
          {mode === 'login' ? '首次使用？激活账户' : '已有密码？返回登录'}
        </button>
      </div>
    </AppShell>
  )
}
