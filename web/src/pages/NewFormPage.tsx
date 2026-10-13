import { useState } from 'react'
import type { FormEvent } from 'react'
import AppShell from '../components/AppShell'
import { createMonthlyForm, isSessionExpired } from '../lib/api'
import type { WebUser } from '../lib/api'

interface Props {
  token: string
  user: WebUser
  onBack: () => void
  onLogout: () => void
  onCreated: () => void
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function NewFormPage({ token, user, onBack, onLogout, onCreated }: Props) {
  const [month, setMonth] = useState(currentMonth)
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (!month || !deadline) { setError('请选择月份与截止日期'); return }
    setBusy(true)
    try {
      const res = await createMonthlyForm(token, month, deadline)
      if (isSessionExpired(res)) { onLogout(); return }
      if (!res.ok) { setError(res.msg || '保存失败'); return }
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接云环境，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell active="new" user={user} onLogout={onLogout}>
      <section className="panel panel--narrow">
        <div className="panel-head">
          <h1>新建月度表单</h1>
          <div className="head-actions">
            <button type="button" className="ghost" onClick={onBack}>返回列表</button>
          </div>
        </div>

        <div className="panel-body">
          <p className="helper">已存在的月份会更新截止时间并重新开放填报。</p>

          <form onSubmit={submit}>
            <label htmlFor="month">统计月份</label>
            <input id="month" type="month" value={month} onChange={e => setMonth(e.target.value)} />

            <label htmlFor="deadline">填报截止日期</label>
            <input id="deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            <p className="helper">所选日期当天 23:59:59 截止填报（与小程序的规则一致）。</p>

            {error && <p className="error" role="alert">{error}</p>}

            <button type="submit" disabled={busy}>{busy ? '正在保存…' : '创建 / 更新月度表单'}</button>
          </form>

          <button type="button" className="link" onClick={onBack}>返回表单列表</button>
        </div>
      </section>
    </AppShell>
  )
}
