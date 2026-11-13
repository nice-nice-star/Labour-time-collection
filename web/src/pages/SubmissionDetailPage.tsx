import { useCallback, useEffect, useState } from 'react'
import AppShell from '../components/AppShell'
import type { MonthlyForm, SubmissionDetailResult, SubmissionRow, WebUser } from '../lib/api'
import { fetchSubmissionDetail, fetchWebSession, isSessionExpired } from '../lib/api'
import {
  departmentDisplay,
  formatDateTime,
  formStatusText,
  projectStatusText,
  translateServerMessage,
  useLanguage
} from '../lib/i18n'

interface Props {
  token: string
  user: WebUser
  form: MonthlyForm
  student: SubmissionRow
  onBack: () => void
  onLogout: () => void
}

/**
 * 老师端单名学助的当月填报明细（独立页）。
 *
 * 数据来自 webGetSubmissionDetail，一次只取一人：
 * 「填报情况」页的 webGetSubmissions 仍然只回进度，不下发答案与项目明细。
 * 汇总按当前费率重算（与导出 Excel 一致），同时显示提交时快照的差异。
 */
export default function SubmissionDetailPage({ token, user, form, student, onBack, onLogout }: Props) {
  const { lang, t } = useLanguage()
  const [detail, setDetail] = useState<SubmissionDetailResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchSubmissionDetail(token, form._id, student.studentId)
      if (isSessionExpired(res)) {
        // 新函数漏配 WEB_TOKEN_SECRET 时也会走到这里。先用已配置好的 webSession
        // 复核票据是否真的失效，避免把部署问题误判成会话过期而清掉登录态。
        try {
          const session = await fetchWebSession(token)
          if (session.ok) {
            setError(t('详情服务鉴权异常，请联系管理员检查云函数配置'))
            return
          }
        } catch {
          // webSession 也连不上：按会话过期处理
        }
        onLogout()
        return
      }
      if (!res.ok || !res.student || !res.fillStatus) {
        setError(translateServerMessage(res.msg, lang) || t('暂时无法获取填报明细'))
        return
      }
      setDetail(res)
    } catch {
      setError(t('无法连接云环境，请稍后重试'))
    } finally {
      setLoading(false)
    }
  }, [token, form._id, student.studentId, onLogout, lang, t])

  useEffect(() => { void load() }, [load])

  const info = detail?.student
  const sub = detail?.submission
  const fillStatus = detail?.fillStatus
  const statusLabel = fillStatus === 'submitted'
    ? t('已提交')
    : fillStatus === 'zero-filled'
      ? t('月结补零')
      : fillStatus === 'unbound'
        ? t('未绑定')
        : t('未提交')
  const identityLabel = info?.identitySource === 'web'
    ? t('网页账户')
    : info?.bound ? t('已绑定') : t('未绑定')
  const projectLabel = (item: { label: string; labelEn?: string }) =>
    lang === 'en' && item.labelEn ? item.labelEn : item.label

  const current = sub?.hours.current
  const snapshot = sub?.hours.snapshot
  const snapshotChanged = !!(current && snapshot && (
    Math.abs(snapshot.dutyHours - current.dutyHours) > 1e-8 ||
    Math.abs(snapshot.projectHours - current.projectHours) > 1e-8 ||
    Math.abs(snapshot.totalHours - current.totalHours) > 1e-8 ||
    Math.abs(snapshot.effectiveHours - current.effectiveHours) > 1e-8
  ))
  const actualTotal = (sub?.projects || []).reduce((sum, item) => sum + item.actualHours, 0)

  return (
    <AppShell active="progress" user={user} onLogout={onLogout}>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h1>
              {t('{name} 的填报明细', { name: student.name })}
              {info?.isSupervisor && <span className="tag">{t('主管')}</span>}
            </h1>
            <p className="helper">
              {t('{month} 月度表单', { month: form.month })} · {formStatusText(detail?.form?.status || form.status, lang)}
            </p>
          </div>
          <div className="head-actions">
            <button type="button" className="ghost" onClick={onBack}>{t('返回填报情况')}</button>
            <button type="button" className="ghost" onClick={() => void load()}>{t('刷新')}</button>
          </div>
        </div>

        <div className="panel-body">
          {error && <p className="error" role="alert">{error}</p>}

          {loading ? <p className="helper">{t('正在加载填报明细…')}</p> : info && fillStatus && (
            <>
              <div className="detail-meta">
                <span>{t('学号')}：{info.studentId}</span>
                <span>{t('部门')}：{departmentDisplay(info.departmentText, lang)}</span>
                <span>{t('身份')}：{identityLabel}</span>
                <span>{t('状态')}：{statusLabel}</span>
                {sub?.updateTime && (
                  <span>{t('最后提交 {date}', { date: formatDateTime(sub.updateTime, lang) })}</span>
                )}
              </div>

              {fillStatus === 'unbound' && (
                <p className="notice">{t('该学助尚未绑定微信，无法填报。')}</p>
              )}

              {fillStatus === 'not-submitted' && (
                <p className="notice">{t('该学助本月尚未提交，没有可查看的填报内容。')}</p>
              )}

              {fillStatus === 'zero-filled' && (
                <>
                  <p className="notice">{t('本月为月结补零记录，系统未收到该学助的填报内容。')}</p>
                  {current && (
                    <section className="detail-section">
                      <h2>{t('工时汇总')}</h2>
                      <div className="detail-summary">
                        <div><span>{t('值班工时')}</span><strong>{current.dutyHours}</strong></div>
                        <div><span>{t('项目折算工时')}</span><strong>{current.projectHours}</strong></div>
                        <div><span>{t('总工时')}</span><strong>{current.totalHours}</strong></div>
                        <div><span>{t('有效工时')}</span><strong>{current.effectiveHours}</strong></div>
                      </div>
                    </section>
                  )}
                </>
              )}

              {fillStatus === 'submitted' && sub && current && (
                <>
                  <section className="detail-section">
                    <h2>{t('工时汇总')}</h2>
                    <div className="detail-summary">
                      <div><span>{t('值班工时')}</span><strong>{current.dutyHours}</strong></div>
                      <div><span>{t('项目折算工时')}</span><strong>{current.projectHours}</strong></div>
                      <div><span>{t('总工时')}</span><strong>{current.totalHours}</strong></div>
                      <div><span>{t('有效工时')}</span><strong>{current.effectiveHours}</strong></div>
                    </div>
                    {sub.hours.isSupervisor && (
                      <p className="helper">{t('主管按统计工时 ×1.5，有效工时最高 40 小时')}</p>
                    )}
                    {snapshotChanged && snapshot && (
                      <p className="notice">
                        {t('按当前费率重算；提交时快照：总工时 {total}，有效工时 {effective}', {
                          total: snapshot.totalHours,
                          effective: snapshot.effectiveHours
                        })}
                      </p>
                    )}
                    <p className="helper detail-note">
                      {t('本页按当前费率表重算，与导出 Excel 一致；进度页的有效工时仍是提交时快照。')}
                    </p>
                  </section>

                  <section className="detail-section">
                    <h2>{t('值班记录')}</h2>
                    <div className="detail-facts">
                      <div><span>{t('本月值班总工时')}</span><strong>{sub.duty.hours}</strong></div>
                      <div><span>{t('值班时段')}</span><strong>{sub.duty.shiftTime || '—'}</strong></div>
                      <div><span>{t('值班地点')}</span><strong>{sub.duty.location || '—'}</strong></div>
                    </div>
                  </section>

                  <section className="detail-section">
                    <h2>{t('项目产出')}</h2>
                    {sub.projects.length === 0 ? (
                      <p className="helper">{t('没有项目产出记录。')}</p>
                    ) : (
                      <div className="detail-table-wrap">
                        <table className="detail-table">
                          <thead>
                            <tr>
                              <th>{t('项目类型')}</th>
                              <th>{t('项目名称')}</th>
                              <th>{t('项目分工')}</th>
                              <th>{t('完成情况')}</th>
                              <th>{t('完成形式')}</th>
                              <th>{t('实际完成时间（hrs）')}</th>
                              <th>{t('折算工时')}</th>
                              <th>{t('实际−折算')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sub.projects.map((item, index) => (
                              <tr key={`${item.key}-${index}`}>
                                <td>{projectLabel(item)}</td>
                                <td className="detail-name">{item.name || '—'}</td>
                                <td>{item.role === 'coordinator' ? t('统筹') : t('参与')}</td>
                                <td>{projectStatusText(item.status, lang)}</td>
                                <td className="detail-name">{item.completionForm || '—'}</td>
                                <td>{item.actualHours}</td>
                                <td>{item.weightedHours == null ? t('按实际') : item.weightedHours}</td>
                                <td>{item.actualMinusWeighted == null ? '—' : item.actualMinusWeighted}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={5}>{t('项目合计')}</td>
                              <td>{actualTotal}</td>
                              <td>{current.projectHours}</td>
                              <td>—</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </section>

                  {sub.legacyProjectRows.length > 0 && (
                    <section className="detail-section">
                      <h2>{t('旧版按类型计数')}</h2>
                      {sub.legacyProjectName && (
                        <p className="helper">{t('原项目名称：{name}', { name: sub.legacyProjectName })}</p>
                      )}
                      <div className="detail-table-wrap">
                        <table className="detail-table detail-table--legacy">
                          <thead>
                            <tr>
                              <th>{t('项目类型')}</th>
                              <th>{t('参与数')}</th>
                              <th>{t('统筹数')}</th>
                              <th>{t('折算工时')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sub.legacyProjectRows.map(row => (
                              <tr key={row.key}>
                                <td>{projectLabel(row)}</td>
                                <td>{row.counts.participant}</td>
                                <td>{row.counts.coordinator}</td>
                                <td>{row.weightedHours == null ? t('按实际') : row.weightedHours}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  <section className="detail-section">
                    <h2>{t('补充说明')}</h2>
                    <p className="detail-text">{sub.appeal || '—'}</p>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </AppShell>
  )
}
