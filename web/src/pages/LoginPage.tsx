import { useState } from 'react'
import type { FormEvent } from 'react'
import AppShell from '../components/AppShell'
import {
  bindWebAccount, bindWebStudent,
  loginWebAccount, loginWebStudent
} from '../lib/api'
import type { WebRole, WebUser } from '../lib/api'
import { bilingualServerMessage } from '../lib/i18n'
import { saveToken } from '../lib/session'

type Mode = 'login' | 'activate'

interface Props {
  onLoggedIn: (user: WebUser, token: string, role: WebRole) => void
}

const ROLE_COPY: Record<WebRole, {
  tab: string
  titleZh: string
  titleEn: string
  idLabel: string
  helper: string
  activateHint: string
}> = {
  export: {
    tab: '老师 / Teacher',
    titleZh: '学助工时管理后台',
    titleEn: 'Student Assistant Hours Admin',
    idLabel: '工号 / Staff ID',
    helper: '请用老师账户登录 / Sign in with a teacher account',
    activateHint: '首次使用请先激活：姓名与工号需和名单完全一致 / First time? Activate first: your name and staff ID must exactly match the roster'
  },
  student: {
    tab: '学助 / Student',
    titleZh: '学助工时申报',
    titleEn: 'Student Assistant Hours Submission',
    idLabel: '学号 / Student ID',
    helper: '请用学助账户登录 / Sign in with a student account',
    activateHint: '首次使用请先激活：姓名与学号需和名单完全一致 / First time? Activate first: your name and student ID must exactly match the roster'
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

  /** 登录页没有语言开关，服务端提示按「中文 / English」并列显示。 */
  function serverMessage(msg: string | undefined, fallback: string) {
    return bilingualServerMessage(msg) || fallback
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
          if (!res.ok) { setError(serverMessage(res.msg, '激活失败 / Activation failed')); return }
          setNotice(serverMessage(res.msg, '激活成功，请登录 / Activated. Please sign in.'))
          setMode('login')
          setPassword('')
          return
        }
        const res = await loginWebStudent(trimmedName, id, password)
        if (!res.ok || !res.token || !res.user) {
          setError(serverMessage(res.msg, '登录失败 / Sign in failed'))
          return
        }
        saveToken(res.token)
        onLoggedIn(res.user, res.token, res.role || role)
        return
      }

      if (mode === 'activate') {
        const res = await bindWebAccount(trimmedName, id, password)
        if (!res.ok) { setError(serverMessage(res.msg, '激活失败 / Activation failed')); return }
        setNotice(serverMessage(res.msg, '激活成功，请登录 / Activated. Please sign in.'))
        setMode('login')
        setPassword('')
        return
      }
      const res = await loginWebAccount(trimmedName, id, password)
      if (!res.ok || !res.token || !res.user) {
        setError(serverMessage(res.msg, '登录失败 / Sign in failed'))
        return
      }
      saveToken(res.token)
      onLoggedIn(res.user, res.token, res.role || role)
    } catch (e) {
      setError(e instanceof Error
        ? `${e.message} / Unable to sign in. Please try again.`
        : '无法连接云环境，请稍后重试 / Unable to connect to the cloud environment. Please try again later.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell sidebar={false} showLanguageToggle={false} bilingualHeader>
      <div className="card">
        <h1>
          {copy.titleZh}
          <span className="bi-sub">{copy.titleEn}</span>
        </h1>
        <p className="helper">
          {mode === 'login' ? copy.helper : copy.activateHint}
        </p>

        <div className="role-switch" role="tablist" aria-label="登录身份 / Account type">
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
          <label htmlFor="name">姓名 / Name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)} autoComplete="username" />

          <label htmlFor="accountId">{copy.idLabel}</label>
          <input
            id="accountId"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            autoComplete="username"
          />

          <label htmlFor="password">密码 / Password</label>
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
            {busy
              ? '处理中… / Processing…'
              : mode === 'login' ? '登录 / Sign in' : '激活账户 / Activate account'}
          </button>
        </form>

        <button type="button" className="link" onClick={() => switchMode(mode === 'login' ? 'activate' : 'login')}>
          {mode === 'login'
            ? '首次使用？激活账户 / First time? Activate account'
            : '已有密码？返回登录 / Already have a password? Back to sign in'}
        </button>
      </div>
    </AppShell>
  )
}
