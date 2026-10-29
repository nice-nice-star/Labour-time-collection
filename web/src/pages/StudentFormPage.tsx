import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import AppShell from '../components/AppShell'
import { fetchStudentForm, isSessionExpired, submitStudentForm } from '../lib/api'
import type {
  FormCalc, FormMeta, MonthlyForm, ProjectCountRow, ProjectRole, ProjectStatus, WebUser
} from '../lib/api'

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

const ROLE_OPTIONS: { value: ProjectRole; label: string }[] = [
  { value: 'coordinator', label: '统筹' },
  { value: 'participant', label: '参与' }
]

const STATUS_LABELS: Record<string, string> = {
  open: '填报中',
  closed: '已截止',
  calculated: '已统计'
}

function displayTime(value?: string | null): string {
  if (!value) return ''
  const text = String(value)
  const date = new Date(text.includes('T') ? text : text.replace(/-/g, '/'))
  return Number.isNaN(date.getTime()) ? text : date.toLocaleString('zh-CN', { hour12: false })
}

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
  const nextId = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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
  const [calc, setCalc] = useState<FormCalc | null>(null)
  const [savedAt, setSavedAt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async (keepNotice = false) => {
    setLoading(true)
    setError('')
    if (!keepNotice) setNotice('')
    try {
      const res = await fetchStudentForm(token)
      if (isSessionExpired(res)) { onLogout(); return false }
      if (!res.ok) { setError(res.msg || '暂时无法加载表单'); return false }

      setForm(res.form)
      setMeta(res.meta)
      setIdentitySource(res.identitySource ?? (res.bound ? 'wechat' : ''))
      setCanSubmit(res.canSubmit)
      const sub = res.submission
      setHasSubmission(!!sub)
      setSource(sub?.source || '')
      setCalc(sub?.calc || null)
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接云环境，请稍后重试')
      return false
    } finally {
      setLoading(false)
    }
  }, [token, onLogout])

  useEffect(() => { void load() }, [load])

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
    setNotice('')

    const dutyText = dutyHours.trim()
    const duty = dutyText === '' ? 0 : Number(dutyText)
    if (!Number.isFinite(duty) || duty < 0) {
      setError('请填写有效的值班工时')
      return
    }

    const incomplete = projects.findIndex(p =>
      !p.key || !p.name.trim() || !p.role || !p.status || !p.completionForm.trim() ||
      p.actualHours.trim() === '' || !Number.isFinite(Number(p.actualHours)) || Number(p.actualHours) < 0
    )
    if (incomplete >= 0) {
      setError(`请完整填写项目 ${incomplete + 1}，实际完成时间须为非负数`)
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
      if (!res.ok) { setError(res.msg || '提交失败'); return }

      setHasSubmission(true)
      setSource('student')
      setCalc(res.calc || null)
      const reloaded = await load(true)
      if (reloaded) setNotice('提交成功。截止前可以再次修改并覆盖。')
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  function readOnlyReason(): string {
    if (!form) return ''
    if (form.status === 'calculated') return '本月已统计，内容仅可查看。'
    if (form.status === 'closed') return '表单已截止，内容仅可查看。'
    if (!canSubmit) {
      if (!identitySource) return '请先在小程序完成微信绑定后再填写。'
      return '已过截止时间，内容仅可查看。'
    }
    return ''
  }

  const visibleLegacy = legacyRows.filter(row => row.counts && (row.counts.participant || row.counts.coordinator))
  const projectLabel = (key: string) => meta?.projectRows.find(row => row.key === key)?.label || key
  const readOnly = readOnlyReason()

  // 网页临时身份 / 尚未绑定但已允许网页填报时的说明；已绑定真实微信时不显示。
  const identityNotice = identitySource === 'web'
    ? '当前使用网页身份（未绑定微信）。在小程序绑定微信后，历史网页提交会自动合并到真实账号。'
    : (!identitySource && canSubmit)
      ? '你尚未绑定微信。首次提交会自动创建网页身份；之后可在小程序绑定并合并历史提交。'
      : ''

  const formStatusText = !form
    ? ''
    : form.status === 'open' && identitySource && !canSubmit
      ? '已过截止'
      : STATUS_LABELS[form.status] || form.status

  const submissionText = !hasSubmission
    ? '尚未提交'
    : source === 'auto-zero'
      ? '当前为月结补零记录'
      : '已提交'

  return (
    <AppShell sidebar={false} user={user} onLogout={onLogout}>
      <section className="panel student-form">
        <div className="panel-head">
          <div>
            <h1>学助工时申报</h1>
            <p className="helper">
              {form ? `${form.month} 月度表单` : '月度表单'}
              {form?.deadline ? ` · 截止 ${displayTime(form.deadline)}` : ''}
              {savedAt ? ` · 上次提交 ${displayTime(savedAt)}` : ''}
            </p>
          </div>
          <div className="head-actions">
            {form && <span className="tag">{formStatusText}</span>}
            <button type="button" className="ghost" onClick={() => void load()} disabled={loading || submitting}>
              刷新
            </button>
          </div>
        </div>

        <div className="panel-body">
          {loading ? (
            <p className="helper">正在加载本月表单…</p>
          ) : (
            <>
              {error && <p className="error" role="alert">{error}</p>}
              {notice && <p className="notice" role="status">{notice}</p>}

              {!form && !error ? (
                <div className="sf-empty">
                  <p className="helper">本月暂无可填报的表单。老师创建本月表单后，这里会自动出现。</p>
                  <button type="button" className="ghost" onClick={() => void load()}>重新检查</button>
                </div>
              ) : !form ? null : (
                <>
                  {identityNotice && <p className="sf-identity">{identityNotice}</p>}
                  {readOnly && <p className="notice">{readOnly}</p>}

                  <form onSubmit={handleSubmit}>
                    <section className="sf-section">
                      <div className="sf-section-head">
                        <span className="sf-index">01</span>
                        <h2 className="sf-title">值班记录</h2>
                        <span className="helper">选填；不填按 0 小时计</span>
                      </div>
                      <div className="sf-grid">
                        <div className="sf-field">
                          <label htmlFor="dutyHours">本月值班总工时</label>
                          <input
                            id="dutyHours"
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            placeholder="0"
                            value={dutyHours}
                            onChange={e => setDutyHours(e.target.value)}
                            disabled={!editable}
                          />
                        </div>
                        <div className="sf-field">
                          <label htmlFor="shiftTime">值班时段</label>
                          <input
                            id="shiftTime"
                            type="text"
                            placeholder="例如：每周一 14:00–17:00"
                            value={shiftTime}
                            onChange={e => setShiftTime(e.target.value)}
                            disabled={!editable}
                          />
                        </div>
                        <div className="sf-field sf-wide">
                          <span className="sf-label">值班地点</span>
                          <div className="sf-choices">
                            <label>
                              <input
                                type="radio"
                                name="location"
                                checked={locationIndex === -1}
                                onChange={() => setLocationIndex(-1)}
                                disabled={!editable}
                              />
                              不填写
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
                        <h2 className="sf-title">项目产出</h2>
                        <span className="helper">每条记录只算一个分工；没有项目可以留空</span>
                      </div>

                      {visibleLegacy.length > 0 && (
                        <div className="sf-legacy">
                          <strong>历史版本记录（仍会计入本月）</strong>
                          <ul>
                            {visibleLegacy.map(row => {
                              const parts = []
                              if (row.counts.coordinator) parts.push(`统筹 ${row.counts.coordinator}`)
                              if (row.counts.participant) parts.push(`参与 ${row.counts.participant}`)
                              return <li key={row.key}>{projectLabel(row.key)}：{parts.join('、')}</li>
                            })}
                          </ul>
                          {legacyName && <p className="helper">原项目名称：{legacyName}</p>}
                        </div>
                      )}

                      {projects.map((project, index) => (
                        <article className="sf-project" key={project.localId}>
                          <div className="sf-project-head">
                            <h3>项目 {index + 1}</h3>
                            {editable && (
                              <button type="button" className="ghost" onClick={() => removeProject(project.localId)}>
                                删除
                              </button>
                            )}
                          </div>
                          <div className="sf-grid">
                            <div className="sf-field sf-wide">
                              <label htmlFor={`type-${project.localId}`}>项目类型</label>
                              <select
                                id={`type-${project.localId}`}
                                value={project.key}
                                onChange={e => updateProject(project.localId, { key: e.target.value })}
                                disabled={!editable}
                              >
                                <option value="">请选择项目类型</option>
                                {(meta?.projectRows || []).map(option => (
                                  <option key={option.key} value={option.key}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="sf-field sf-wide">
                              <label htmlFor={`name-${project.localId}`}>项目名称</label>
                              <input
                                id={`name-${project.localId}`}
                                type="text"
                                placeholder="例如：新生迎新活动"
                                value={project.name}
                                onChange={e => updateProject(project.localId, { name: e.target.value })}
                                disabled={!editable}
                              />
                            </div>
                            <div className="sf-field">
                              <span className="sf-label">项目分工</span>
                              <div className="sf-choices">
                                {ROLE_OPTIONS.map(option => (
                                  <label key={option.value}>
                                    <input
                                      type="radio"
                                      name={`role-${project.localId}`}
                                      value={option.value}
                                      checked={project.role === option.value}
                                      onChange={() => updateProject(project.localId, { role: option.value })}
                                      disabled={!editable}
                                    />
                                    {option.label}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="sf-field">
                              <span className="sf-label">完成情况</span>
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
                                    {status}
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="sf-field sf-wide">
                              <label htmlFor={`completion-${project.localId}`}>完成形式</label>
                              <input
                                id={`completion-${project.localId}`}
                                type="text"
                                placeholder="发布平台、活动名称/时间、结项标志"
                                value={project.completionForm}
                                onChange={e => updateProject(project.localId, { completionForm: e.target.value })}
                                disabled={!editable}
                              />
                            </div>
                            <div className="sf-field">
                              <label htmlFor={`actual-${project.localId}`}>实际完成时间（hrs）</label>
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
                        <p className="helper">还没有项目记录；如果本月只有值班，可以直接提交。</p>
                      )}
                      {editable && (
                        <button type="button" className="ghost sf-add" onClick={addProject}>+ 添加项目</button>
                      )}
                    </section>

                    <section className="sf-section">
                      <div className="sf-section-head">
                        <span className="sf-index">03</span>
                        <h2 className="sf-title">补充说明</h2>
                        <span className="helper">选填，最多 1000 字</span>
                      </div>
                      <div className="sf-field">
                        <label htmlFor="appeal">额外工时申诉或其他说明</label>
                        <textarea
                          id="appeal"
                          rows={4}
                          maxLength={1000}
                          placeholder="例如：某项工作耗时明显超过标准费率，希望老师复核"
                          value={appeal}
                          onChange={e => setAppeal(e.target.value)}
                          disabled={!editable}
                        />
                      </div>
                    </section>

                    <div className="sf-submit">
                      <span className="helper">
                        {submissionText}
                        {calc ? ` · 记录中的有效工时 ${calc.effectiveHours} h` : ''}
                        {canSubmit ? ' · 截止前可反复修改' : ''}
                      </span>
                      {canSubmit && (
                        <button type="submit" disabled={submitting}>
                          {submitting ? '提交中…' : hasSubmission ? '更新提交' : '提交本月工时'}
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
