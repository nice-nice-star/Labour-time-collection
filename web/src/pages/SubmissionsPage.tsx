import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '../components/AppShell'
import type { MonthlyForm, ProgressSummary, SubmissionRow, WebUser } from '../lib/api'
import { fetchSubmissions, isSessionExpired } from '../lib/api'
import { buildDepartmentOptions, filterSubmissionRows } from '../lib/rosterFilter'

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
  // 老师有自己的部门时，进来就默认筛本部门的学助；没有部门或本部门本月没人则落回「全部」
  const [department, setDepartment] = useState(user.departmentText || '')
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

  const departments = useMemo(() => buildDepartmentOptions(rows), [rows])
  // 名单还没到时不校正：否则刚进页面就把「默认本部门」冲掉。
  // 数据到了再检查：选中的部门不在名单里（或名单只有一个部门、筛选没有意义）就按「全部」渲染，
  // 再把状态改回来，避免闪一屏空表。
  const activeDepartment = departments.length > 2 && departments.some(item => item.key === department)
    ? department : ''
  useEffect(() => {
    if (!loading && activeDepartment !== department) setDepartment(activeDepartment)
  }, [loading, activeDepartment, department])

  const visible = filterSubmissionRows(rows, keyword, activeDepartment)
  const filtered = keyword.trim() !== '' || activeDepartment !== ''

  function clearFilters() {
    setKeyword('')
    setDepartment('')
  }

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

          {/* 部门筛选：选项来自名单里真实出现的部门；只有一个部门时不占地方 */}
          {departments.length > 2 && (
            <div className="dept-filter">
              {departments.map(item => (
                <button
                  key={item.key}
                  type="button"
                  className={`dept-chip${item.key === activeDepartment ? ' active' : ''}`}
                  aria-pressed={item.key === activeDepartment}
                  onClick={() => setDepartment(item.key === activeDepartment ? '' : item.key)}
                >
                  {item.label}<span className="dept-count">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="filter">
            <label htmlFor="keyword">按姓名筛选</label>
            <input id="keyword" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="输入姓名片段" />
          </div>

          {filtered && !loading && (
            <p className="helper">匹配 {visible.length} / {rows.length} 人</p>
          )}

          {loading ? <p className="helper">正在加载…</p> : rows.length === 0 ? (
            <p className="helper">名单里还没有学助。</p>
          ) : visible.length === 0 ? (
            <div className="filter-empty">
              <p className="helper">没有符合当前筛选条件的学助。</p>
              <button type="button" className="ghost" onClick={clearFilters}>清除筛选</button>
            </div>
          ) : (
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
