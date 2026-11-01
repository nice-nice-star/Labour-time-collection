import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import AppShell from '../components/AppShell'
import { fetchStudentForm, isSessionExpired, submitStudentForm } from '../lib/api'
import type {
  FormMeta, MonthlyForm, ProjectCountRow, ProjectRole, ProjectStatus, WebUser
} from '../lib/api'
import {
  formatDateTime, formStatusText, projectStatusText, translate, translateServerMessage, useLanguage
} from '../lib/i18n'

interface Props {
  token: string
  user: WebUser
  onLogout: () => void
}

interface DraftProject {
  localId: number
  key: string
  name: string
  role: ProjectRole | ''
  status: ProjectStatus | ''
  completionForm: string
  actualHours: string
}

const PROJECT_ROLES: ProjectRole[] = ['coordinator', 'participant']

function emptyProject(localId: number): DraftProject {
  return { localId, key: '', name: '', role: '', status: '', completionForm: '', actualHours: '' }
}

/**
 * 学助网页端月度表单。
 *
 * 读写都与小程序共用同一条 submissions（按 openid 对齐），所以：
 * - 小程序已提交的内容会回填到这里，网页提交后小程序也能继续修改；
 * - 未在小程序绑定微信的学助没有 openid，页面只读并提示先绑定。
 */
export default function StudentFormPage({ token, user, onLogout }: Props) {
  const { lang, t } = useLanguage()
  const nextId = useRef(0)
  // 加载时用 ref 取当前语言：切换语言不能重建 load，否则 useEffect 会重新拉取并冲掉未保存的编辑。
  const langRef = useRef(lang)
  langRef.current = lang

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(false)
  const [form, setForm] = useState<MonthlyForm | null>(null)
  const [meta, setMeta] = useState<FormMeta | null>(null)
  const [identitySource, setIdentitySource] = useState<'wechat' | 'web' | ''>('')
  const [canSubmit, setCanSubmit] = useState(false)
  const [hasSubmission, setHasSubmission] = useState(false)
  const [source, setSource] = useState('')
  const [dutyHours, setDutyHours] = useState('')
  const [shiftTime, setShiftTime] = useState('')
  const [locationIndex, setLocationIndex] = useState(-1)
  const [projects, setProjects] = useState<DraftProject[]>([])
  const [legacyRows, setLegacyRows] = useState<ProjectCountRow[]>([])
  const [legacyName, setLegacyName] = useState('')
  const [appeal, setAppeal] = useState('')
  const [savedAt, setSavedAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async (keepNotice = false) => {
    setLoading(true)
    setError('')
    if (!keepNotice) setNotice(false)
    const l = langRef.current
    try {
      const res = await fetchStudentForm(token)
      if (isSessionExpired(res)) { onLogout(); return false }
      if (!res.ok) {
        setError(translateServerMessage(res.msg, l) || translate(l, '暂时无法加载表单'))
        return false
      }

      setForm(res.form)
      setMeta(res.meta)
      setIdentitySource(res.identitySource ?? (res.bound ? 'wechat' : ''))
      setCanSubmit(res.canSubmit)
      const sub = res.submission
      setHasSubmission(!!sub)
      setSource(sub?.source || '')
      setSavedAt(sub?.updateTime || '')

      if (sub) {
        setDutyHours(sub.answers?.answer1 ?? '')
        setShiftTime(sub.answers?.answer2 ?? '')
        setLocationIndex(res.meta.locationOptions.indexOf(sub.answers?.answer3 ?? ''))
        setProjects((sub.projects || []).map(p => ({
          localId: ++nextId.current,
          key: p.key,
          name: p.name,
          role: p.role,
          status: p.status,
          completionForm: p.completionForm,
          actualHours: String(p.actualHours ?? '')
        })))
        // 旧版记录没有 projects，只有按项目类型计数的 projectRows；把它们作为只读历史展示，
        // 提交时服务端会继续保留这些计数，不会因为网页表单为空而清掉。
        let legacy = sub.projectRows || []
        if (sub.legacyProjectRows && sub.legacyProjectRows.length) legacy = sub.legacyProjectRows
        else if (sub.projects && sub.projects.length) legacy = []
        setLegacyRows(legacy)
        setLegacyName(sub.legacyProjectName || (legacy.length ? (sub.answers?.answer5 ?? '') : ''))
        setAppeal(sub.answers?.answer6 ?? '')
      } else {
        setDutyHours('')
        setShiftTime('')
        setLocationIndex(-1)
        setProjects([])
        setLegacyRows([])
        setLegacyName('')
        setAppeal('')
      }
      return true
    } catch {
      setError(translate(l, '无法连接云环境，请稍后重试'))
      return false
    } finally {
      setLoading(false)
    }
  }, [token, onLogout])

  useEffect(() => { void load() }, [load])

  // 切换语言时清掉上一语言的错误/成功提示，避免中英混排
  useEffect(() => { setError(''); setNotice(false) }, [lang])

  const editable = canSubmit && !submitting

  function addProject() {
    if (!editable) return
    setProjects(prev => [...prev, emptyProject(++nextId.current)])
  }

  function removeProject(localId: number) {
    if (!editable) return
    setProjects(prev => prev.filter(p => p.localId !== localId))
  }

  function updateProject(localId: number, patch: Partial<DraftProject>) {
    setProjects(prev => prev.map(p => p.localId === localId ? { ...p, ...patch } : p))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || submitting) return
    setError('')
    setNotice(false)

    const dutyText = dutyHours.trim()
    const duty = dutyText === '' ? 0 : Number(dutyText)
    if (!Number.isFinite(duty) || duty < 0) {
      setError(t('请填写有效的值班工时'))
      return
    }

    const incomplete = projects.findIndex(p =>
      !p.key || !p.name.trim() || !p.role || !p.status || !p.completionForm.trim() ||
      p.actualHours.trim() === '' || !Number.isFinite(Number(p.actualHours)) || Number(p.actualHours) < 0
    )
    if (incomplete >= 0) {
      setError(t('请完整填写项目 {index}，实际完成时间须为非负数', { index: incomplete + 1 }))
      return
    }

    setSubmitting(true)
    try {
      const res = await submitStudentForm(token, {
        dutyHours: duty,
        shiftTime: shiftTime.trim(),
        locationIndex,
        projects: projects.map(p => ({
          key: p.key,
          name: p.name.trim(),
          role: p.role as ProjectRole,
          status: p.status as ProjectStatus,
          completionForm: p.completionForm.trim(),
          actualHours: Number(p.actualHours)
        })),
        appeal: appeal.trim()
      })
      if (isSessionExpired(res)) { onLogout(); return }
      if (!res.ok) {
        setError(translateServerMessage(res.msg, lang) || t('提交失败'))
        return
      }

      setHasSubmission(true)
      setSource('student')
      const reloaded = await load(true)
      if (reloaded) setNotice(true)
    } catch {
      setError(t('提交失败，请稍后重试'))
    } finally {
      setSubmitting(false)
    }
  }

  function readOnlyReason(): string {
    if (!form) return ''
    if (form.status === 'calculated') return t('本月已统计，内容仅可查看。')
    if (form.status === 'closed') return t('表单已截止，内容仅可查看。')
    if (!canSubmit) {
      if (!identitySource) return t('请先在小程序完成微信绑定后再填写。')
      return t('已过截止时间，内容仅可查看。')
    }
    return ''
  }

  const visibleLegacy = legacyRows.filter(row => row.counts && (row.counts.participant || row.counts.coordinator))
  const projectLabel = (key: string) => {
    const row = meta?.projectRows.find(item => item.key === key)
    if (!row) return key
    return lang === 'en' ? (row.labelEn || row.label) : row.label
  }
  const readOnly = readOnlyReason()

  // 网页临时身份 / 尚未绑定但已允许网页填报时的说明；已绑定真实微信时不显示。
  const identityNotice = identitySource === 'web'
    ? t('当前使用网页身份（未绑定微信）。在小程序绑定微信后，历史网页提交会自动合并到真实账号。')
    : (!identitySource && canSubmit)
      ? t('你尚未绑定微信。首次提交会自动创建网页身份；之后可在小程序绑定并合并历史提交。')
      : ''

  const formStatus = !form
    ? ''
    : form.status === 'open' && identitySource && !canSubmit
      ? t('已过截止')
      : formStatusText(form.status, lang)

  const submissionText = !hasSubmission
    ? t('尚未提交')
    : source === 'auto-zero'
      ? t('当前为月结补零记录')
      : t('已提交')

  return (
    <AppShell sidebar={false} user={user} onLogout={onLogout}>
      <section className="panel student-form">
        <div className="panel-head">
          <div>
            <h1>{t('学助工时申报')}</h1>
            <p className="helper">
              {form ? t('{month} 月度表单', { month: form.month }) : t('月度表单')}
              {form?.deadline ? ` · ${t('截止 {date}', { date: formatDateTime(form.deadline, lang) })}` : ''}
              {savedAt ? ` · ${t('上次提交 {date}', { date: formatDateTime(savedAt, lang) })}` : ''}
            </p>
          </div>
          <div className="head-actions">
            {form && <span className="tag">{formStatus}</span>}
            <button type="button" className="ghost" onClick={() => void load()} disabled={loading || submitting}>
              {t('刷新')}
            </button>
          </div>
        </div>

        <div className="panel-body">
          {loading ? (
            <p className="helper">{t('正在加载本月表单…')}</p>
          ) : (
            <>
              {error && <p className="error" role="alert">{error}</p>}
              {notice && <p className="notice" role="status">{t('提交成功。截止前可以再次修改并覆盖。')}</p>}

              {!form && !error ? (
                <div className="sf-empty">
                  <p className="helper">{t('本月暂无可填报的表单。老师创建本月表单后，这里会自动出现。')}</p>
                  <button type="button" className="ghost" onClick={() => void load()}>{t('重新检查')}</button>
                </div>
              ) : !form ? null : (
                <>
                  {identityNotice && <p className="sf-identity">{identityNotice}</p>}
                  {readOnly && <p className="notice">{readOnly}</p>}

                  <form onSubmit={handleSubmit}>
                    <section className="sf-section">
                      <div className="sf-section-head">
                        <span className="sf-index">01</span>
                        <h2 className="sf-title">{t('值班记录')}</h2>
                        <span className="helper">{t('选填；不填按 0 小时计')}</span>
                      </div>
                      <div className="sf-grid">
                        <div className="sf-field">
                          <label htmlFor="dutyHours">{t('本月值班总工时')}</label>
                          <input
                            id="dutyHours"
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            placeholder={t('上限不得超过12个小时')}
                            value={dutyHours}
                            onChange={e => setDutyHours(e.target.value)}
                            disabled={!editable}
                          />
                        </div>
                        <div className="sf-field">
                          <label htmlFor="shiftTime">{t('值班时段')}</label>
                          <input
                            id="shiftTime"
                            type="text"
                            placeholder={t('例如：每周一 14:00–17:00')}
                            value={shiftTime}
                            onChange={e => setShiftTime(e.target.value)}
                            disabled={!editable}
                          />
                        </div>
                        <div className="sf-field sf-wide">
                          <span className="sf-label">{t('值班地点')}</span>
                          <div className="sf-choices">
                            <label>
                              <input
                                type="radio"
                                name="location"
                                checked={locationIndex === -1}
                                onChange={() => setLocationIndex(-1)}
                                disabled={!editable}
                              />
                              {t('不填写')}
                            </label>
                            {(meta?.locationOptions || []).map((location, index) => (
                              <label key={location}>
                                <input
                                  type="radio"
                                  name="location"
                                  checked={locationIndex === index}
                                  onChange={() => setLocationIndex(index)}
                                  disabled={!editable}
                                />
                                {location}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="sf-section">
                      <div className="sf-section-head">
                        <span className="sf-index">02</span>
                        <h2 className="sf-title">{t('项目产出')}</h2>
                        <span className="helper">{t('每条记录只算一个分工；没有项目可以留空')}</span>
                      </div>

                      {visibleLegacy.length > 0 && (
                        <div className="sf-legacy">
                          <strong>{t('历史版本记录（仍会计入本月）')}</strong>
                          <ul>
                            {visibleLegacy.map(row => {
                              const parts = []
                              if (row.counts.coordinator) {
                                parts.push(t('统筹 {count}', { count: row.counts.coordinator }))
                              }
                              if (row.counts.participant) {
                                parts.push(t('参与 {count}', { count: row.counts.participant }))
                              }
                              return (
                                <li key={row.key}>
                                  {projectLabel(row.key)}：{parts.join(lang === 'en' ? ', ' : '、')}
                                </li>
                              )
                            })}
                          </ul>
                          {legacyName && (
                            <p className="helper">{t('原项目名称：{name}', { name: legacyName })}</p>
                          )}
                        </div>
                      )}

                      {projects.map((project, index) => (
                        <article className="sf-project" key={project.localId}>
                          <div className="sf-project-head">
                            <h3>{t('项目 {index}', { index: index + 1 })}</h3>
                            {editable && (
                              <button type="button" className="ghost" onClick={() => removeProject(project.localId)}>
                                {t('删除')}
                              </button>
                            )}
                          </div>
                          <div className="sf-grid">
                            <div className="sf-field sf-wide">
                              <label htmlFor={`type-${project.localId}`}>{t('项目类型')}</label>
                              <select
                                id={`type-${project.localId}`}
                                value={project.key}
                                onChange={e => updateProject(project.localId, { key: e.target.value })}
                                disabled={!editable}
                              >
                                <option value="">{t('请选择项目类型')}</option>
                                {(meta?.projectRows || []).map(option => (
                                  <option key={option.key} value={option.key}>
                                    {lang === 'en' ? (option.labelEn || option.label) : option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="sf-field sf-wide">
                              <label htmlFor={`name-${project.localId}`}>{t('项目名称')}</label>
                              <input
                                id={`name-${project.localId}`}
                                type="text"
                                placeholder={t('例如：新生迎新活动')}
                                value={project.name}
                                onChange={e => updateProject(project.localId, { name: e.target.value })}
                                disabled={!editable}
                              />
                            </div>
                            <div className="sf-field">
                              <span className="sf-label">{t('项目分工')}</span>
                              <div className="sf-choices">
                                {PROJECT_ROLES.map(role => (
                                  <label key={role}>
                                    <input
                                      type="radio"
                                      name={`role-${project.localId}`}
                                      value={role}
                                      checked={project.role === role}
                                      onChange={() => updateProject(project.localId, { role })}
                                      disabled={!editable}
                                    />
                                    {t(role === 'coordinator' ? '统筹' : '参与')}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="sf-field">
                              <span className="sf-label">{t('完成情况')}</span>
                              <div className="sf-choices">
                                {(meta?.statusOptions || []).map(status => (
                                  <label key={status}>
                                    <input
                                      type="radio"
                                      name={`status-${project.localId}`}
                                      value={status}
                                      checked={project.status === status}
                                      onChange={() => updateProject(project.localId, { status })}
                                      disabled={!editable}
                                    />
                                    {projectStatusText(status, lang)}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="sf-field sf-wide">
                              <label htmlFor={`completion-${project.localId}`}>{t('完成形式')}</label>
                              <input
                                id={`completion-${project.localId}`}
                                type="text"
                                placeholder={t('发布平台、活动名称/时间、结项标志')}
                                value={project.completionForm}
                                onChange={e => updateProject(project.localId, { completionForm: e.target.value })}
                                disabled={!editable}
                              />
                            </div>
                            <div className="sf-field">
                              <label htmlFor={`actual-${project.localId}`}>{t('实际完成时间（hrs）')}</label>
                              <input
                                id={`actual-${project.localId}`}
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                placeholder="0"
                                value={project.actualHours}
                                onChange={e => updateProject(project.localId, { actualHours: e.target.value })}
                                disabled={!editable}
                              />
                            </div>
                          </div>
                        </article>
                      ))}

                      {projects.length === 0 && (
                        <p className="helper">{t('还没有项目记录；如果本月只有值班，可以直接提交。')}</p>
                      )}
                      {editable && (
                        <button type="button" className="ghost sf-add" onClick={addProject}>
                          {t('+ 添加项目')}
                        </button>
                      )}
                    </section>

                    <section className="sf-section">
                      <div className="sf-section-head">
                        <span className="sf-index">03</span>
                        <h2 className="sf-title">{t('补充说明')}</h2>
                        <span className="helper">{t('选填，最多 1000 字')}</span>
                      </div>
                      <div className="sf-field">
                        <label htmlFor="appeal">{t('额外工时申诉或其他说明')}</label>
                        <textarea
                          id="appeal"
                          rows={4}
                          maxLength={1000}
                          placeholder={t('例如：某项工作耗时明显超过标准费率，希望老师复核')}
                          value={appeal}
                          onChange={e => setAppeal(e.target.value)}
                          disabled={!editable}
                        />
                      </div>
                    </section>

                    <div className="sf-submit">
                      <span className="helper">
                        {submissionText}
                        {canSubmit ? ` · ${t('截止前可反复修改')}` : ''}
                      </span>
                      {canSubmit && (
                        <button type="submit" disabled={submitting}>
                          {submitting
                            ? t('提交中…')
                            : hasSubmission ? t('更新提交') : t('提交本月工时')}
                        </button>
                      )}
                    </div>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </AppShell>
  )
}
