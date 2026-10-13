import { useState } from 'react'
import type { FormEvent } from 'react'
import { bindWebAccount, loginWebAccount } from '../lib/api'
import type { WebUser } from '../lib/api'
import { saveToken } from '../lib/session'

type Mode = 'login' | 'activate'

interface Props {
  onLoggedIn: (user: WebUser, token: string) => void
}

export default function LoginPage({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [exportId, setExportId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'activate') {
        const res = await bindWebAccount(name.trim(), exportId.trim(), password)
        if (!res.ok) { setError(res.msg || '激活失败'); return }
        setNotice(res.msg || '激活成功，请登录')
        setMode('login')
        setPassword('')
        return
      }
      const res = await loginWebAccount(name.trim(), exportId.trim(), password)
      if (!res.ok || !res.token || !res.user) { setError(res.msg || '登录失败'); return }
      saveToken(res.token)
      onLoggedIn(res.user, res.token)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接云环境，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h1>学助工时管理后台</h1>
      <p className="helper">
        {mode === 'login' ? '请用老师账户登录' : '首次使用请先激活：姓名与工号需和名单完全一致'}
      </p>

      <form onSubmit={submit}>
        <label htmlFor="name">姓名</label>
        <input id="name" value={name} onChange={e => setName(e.target.value)} autoComplete="username" />

        <label htmlFor="exportId">工号</label>
        <input id="exportId" value={exportId} onChange={e => setExportId(e.target.value)} autoComplete="username" />

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
  )
}
