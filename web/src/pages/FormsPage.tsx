import { useCallback, useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import type { MonthlyForm, WebUser } from '../lib/api'
import { exportMonthlyData, isSessionExpired, listForms } from '../lib/api'

const STATUS_LABELS: Record<string, string> = { open: '填报中', closed: '已截止', calculated: '已统计' }

interface Props {
  token: string
  user: WebUser
  onLogout: () => void
  onCreate: () => void
  onOpenProgress: (form: MonthlyForm) => void
}

export default function FormsPage({ token, user, onLogout, onCreate, onOpenProgress }: Props) {
  const [forms, setForms] = useState<MonthlyForm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listForms(token)
      if (isSessionExpired(res)) { onLogout(); return }
      if (!res.ok || !res.forms) { setError(res.msg || '暂时无法获取表单'); return }
      setForms(res.forms)
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接云环境，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [token, onLogout])

  useEffect(() => { void load() }, [load])

  async function handleExport(form: MonthlyForm) {
    setExporting(form._id)
    setError('')
    try {
      const res = await exportMonthlyData(token, form._id)
      if (isSessionExpired(res)) { onLogout(); return }
      if (!res.ok || !res.url) { setError(res.msg || '导出失败'); return }
      // 临时链接 2 小时有效，每次导出都重新申请，不缓存
      window.open(res.url, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接云环境，请稍后重试')
    } finally {
      setExporting('')
    }
  }

  return (
    <AppShell active="forms" user={user} onLogout={onLogout}>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h1>月度表单</h1>
            {!loading && <p className="helper">共 {forms.length} 个月度表单</p>}
          </div>
          <div className="head-actions">
            <button type="button" onClick={onCreate}>新建月度表单</button>
            <button type="button" className="ghost" onClick={() => void load()}>刷新</button>
          </div>
        </div>

        <div className="panel-body">
          {error && <p className="error" role="alert">{error}</p>}

          {loading ? <p className="helper">正在加载…</p> : forms.length === 0 ? (
            <p className="helper">还没有任何月度表单，先「新建月度表单」。</p>
          ) : (
            <table>
              <thead>
                <tr><th>月份</th><th>状态</th><th>提交人数</th><th>截止时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                {forms.map(form => (
                  <tr key={form._id}>
                    <td>{form.month}</td>
                    <td>{STATUS_LABELS[form.status] || form.status}</td>
                    <td>{form.count ?? 0}</td>
                    <td>{form.deadline || '—'}</td>
                    <td className="row-actions">
                      <button type="button" className="ghost" onClick={() => onOpenProgress(form)}>查看进度</button>
                      <button type="button" disabled={exporting === form._id} onClick={() => handleExport(form)}>
                        {exporting === form._id ? '导出中…' : '导出'}
                      </button>
                    </td>
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
