import { useCallback, useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import type { MonthlyForm, ProgressSummary, SubmissionRow, WebUser } from '../lib/api'
import { fetchSubmissions, isSessionExpired } from '../lib/api'

interface Props {
  token: string
  user: WebUser
  form: MonthlyForm
  onBack: () => void
  onLogout: () => void
}

const STATUS_LABELS: Record<string, string> = { open: '填报中', closed: '已截止', calculated: '已统计' }

// 与小程序端「填报情况」页同一口径：只显示进度与有效工时，不显示学助填写的内容。
export default function SubmissionsPage({ token, user, form, onBack, onLogout }: Props) {
  const [rows, setRows] = useState<SubmissionRow[]>([])
  const [summary, setSummary] = useState<ProgressSummary | null>(null)
  const [status, setStatus] = useState<string>(form.status)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchSubmissions(token, form._id)
      if (isSessionExpired(res)) { onLogout(); return }
      if (!res.ok || !res.rows) { setError(res.msg || '暂时无法获取填报情况'); return }
      setRows(res.rows)
      setSummary(res.summary || null)
      if (res.form) setStatus(res.form.status)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接云环境，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [token, form._id, onLogout])

  useEffect(() => { void load() }, [load])

  const key = keyword.trim().toLowerCase()
  const visible = key ? rows.filter(r => String(r.name).toLowerCase().includes(key)) : rows

  return (
    <AppShell active="progress" user={user} onLogout={onLogout}>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h1>{form.month} 填报情况</h1>
            <p className="helper">状态：{STATUS_LABELS[status] || status}　截止：{form.deadline || '—'}</p>
          </div>
          <div className="head-actions">
            <button type="button" className="ghost" onClick={onBack}>返回列表</button>
            <button type="button" className="ghost" onClick={() => void load()}>刷新</button>
          </div>
        </div>

        <div className="panel-body">
          {summary && (
            <p className="notice">
              名单 {summary.total} 人：已提交 {summary.submitted}，待提交 {summary.pending}，未绑定 {summary.unbound}
            </p>
          )}

          {error && <p className="error" role="alert">{error}</p>}

          <div className="filter">
            <label htmlFor="keyword">按姓名筛选</label>
            <input id="keyword" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="输入姓名片段" />
          </div>

          {loading ? <p className="helper">正在加载…</p> : (
            <table>
              <thead>
                <tr><th>姓名</th><th>工号</th><th>部门</th><th>绑定</th><th>状态</th><th>有效工时</th></tr>
              </thead>
              <tbody>
                {visible.map(row => (
                  <tr key={row.studentId || row.name}>
                    <td>{row.name}{row.isSupervisor && <span className="tag">主管</span>}</td>
                    <td>{row.studentId}</td>
                    {/* 展示文本由服务端按部门映射表算好，页面不再自己实现一套 */}
                    <td>{row.departmentText || '—'}</td>
                    <td>{row.bound ? '已绑定' : '未绑定'}</td>
                    <td>{row.submitted ? '已填报' : row.zeroFilled ? '月结补零' : '未提交'}</td>
                    {/* 未提交没有申报时长，显示 — 而不是 0 */}
                    <td>{row.effectiveHours === null ? '—' : row.effectiveHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </AppShell>
  )
}
