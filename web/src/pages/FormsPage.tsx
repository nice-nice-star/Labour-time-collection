import { useCallback, useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import type { MonthlyForm, WebUser } from '../lib/api'
import { exportMonthlyData, isSessionExpired, listForms } from '../lib/api'
import { formatDateTime, formStatusText, translateServerMessage, useLanguage } from '../lib/i18n'

interface Props {
  token: string
  user: WebUser
  onLogout: () => void
  onCreate: () => void
  onOpenProgress: (form: MonthlyForm) => void
}

export default function FormsPage({ token, user, onLogout, onCreate, onOpenProgress }: Props) {
  const { lang, t } = useLanguage()
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
      if (!res.ok || !res.forms) {
        setError(translateServerMessage(res.msg, lang) || t('暂时无法获取表单'))
        return
      }
      setForms(res.forms)
    } catch {
      setError(t('无法连接云环境，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }, [token, onLogout, lang, t])

  useEffect(() => { void load() }, [load])

  async function handleExport(form: MonthlyForm) {
    setExporting(form._id)
    setError('')
    try {
      const res = await exportMonthlyData(token, form._id)
      if (isSessionExpired(res)) { onLogout(); return }
      if (!res.ok || !res.url) {
        setError(translateServerMessage(res.msg, lang) || t('导出失败'))
        return
      }
      // 临时链接 2 小时有效，每次导出都重新申请，不缓存
      window.open(res.url, '_blank', 'noopener')
    } catch {
      setError(t('无法连接云环境，请稍后重试'))
    } finally {
      setExporting('')
    }
  }

  return (
    <AppShell active="forms" user={user} onLogout={onLogout}>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h1>{t('月度表单')}</h1>
            {!loading && <p className="helper">{t('共 {count} 个月度表单', { count: forms.length })}</p>}
          </div>
          <div className="head-actions">
            <button type="button" onClick={onCreate}>{t('新建月度表单')}</button>
            <button type="button" className="ghost" onClick={() => void load()}>{t('刷新')}</button>
          </div>
        </div>

        <div className="panel-body">
          {error && <p className="error" role="alert">{error}</p>}

          {loading ? <p className="helper">{t('正在加载…')}</p> : forms.length === 0 ? (
            <p className="helper">{t('还没有任何月度表单，先「新建月度表单」。')}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('月份')}</th>
                  <th>{t('状态')}</th>
                  <th>{t('提交人数')}</th>
                  <th>{t('截止时间')}</th>
                  <th>{t('操作')}</th>
                </tr>
              </thead>
              <tbody>
                {forms.map(form => (
                  <tr key={form._id}>
                    <td>{form.month}</td>
                    <td>{formStatusText(form.status, lang)}</td>
                    <td>{form.count ?? 0}</td>
                    <td>{formatDateTime(form.deadline, lang) || '—'}</td>
                    <td className="row-actions">
                      <button type="button" className="ghost" onClick={() => onOpenProgress(form)}>
                        {t('查看进度')}
                      </button>
                      <button type="button" disabled={exporting === form._id} onClick={() => handleExport(form)}>
                        {exporting === form._id ? t('导出中…') : t('导出')}
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