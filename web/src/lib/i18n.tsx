import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Lang = 'zh' | 'en'

const STORAGE_KEY = 'webLanguage'

/**
 * 用中文原文作为 key：中文界面直接回显 key，英文界面查表。
 * 这样新增文案时 TypeScript 会强制补英文，避免只改了一半。
 */
const EN = {
  'CPRO 学助工时申报': 'CPRO Student Assistant Hours',
  '香港中文大学（深圳）': 'The Chinese University of Hong Kong, Shenzhen',
  'Hi，{name}': 'Hi, {name}',
  '退出登录': 'Log out',
  '学助工时管理': 'Student Assistant Hours',
  '表单列表': 'Forms',
  '新建月度表单': 'New Monthly Form',
  '填报进度': 'Progress',
  '正在恢复登录状态…': 'Restoring your session…',

  '填报中': 'Open',
  '已截止': 'Closed',
  '已统计': 'Calculated',
  '已过截止': 'Past deadline',
  '状态': 'Status',
  '刷新': 'Refresh',
  '正在加载…': 'Loading…',
  '无法连接云环境，请稍后重试': 'Unable to connect to the cloud environment. Please try again later.',

  '月度表单': 'Monthly Forms',
  '共 {count} 个月度表单': '{count} monthly forms',
  '暂时无法获取表单': 'Unable to load forms',
  '还没有任何月度表单，先「新建月度表单」。': 'No monthly forms yet. Create one first.',
  '月份': 'Month',
  '提交人数': 'Submissions',
  '截止时间': 'Deadline',
  '操作': 'Actions',
  '查看进度': 'View progress',
  '导出中…': 'Exporting…',
  '导出': 'Export',
  '导出失败': 'Export failed',

  '返回列表': 'Back to list',
  '已存在的月份会更新截止时间并重新开放填报。': 'Existing months will have their deadline updated and be reopened for submissions.',
  '统计月份': 'Month',
  '填报截止日期': 'Deadline',
  '所选日期当天 23:59:59 截止填报（与小程序的规则一致）。': 'Submissions close at 23:59:59 on the selected date (same rule as the mini program).',
  '请选择月份与截止日期': 'Select a month and a deadline.',
  '保存失败': 'Save failed',
  '正在保存…': 'Saving…',
  '创建 / 更新月度表单': 'Create / Update Monthly Form',
  '返回表单列表': 'Back to form list',

  '{month} 填报情况': '{month} Progress',
  '状态：{status}　截止：{deadline}': 'Status: {status} · Deadline: {deadline}',
  '名单 {total} 人：已提交 {submitted}，待提交 {pending}，未绑定 {unbound}': 'Roster {total}: submitted {submitted}, pending {pending}, unbound {unbound}',
  '按姓名筛选': 'Filter by name',
  '输入姓名片段': 'Enter part of a name',
  '匹配 {visible} / {total} 人': '{visible} / {total} matched',
  '名单里还没有学助。': 'No student assistants in the roster.',
  '没有符合当前筛选条件的学助。': 'No students match the current filters.',
  '清除筛选': 'Clear filters',
  '全部': 'All',
  '未设置': 'Not set',
  '姓名': 'Name',
  '学号': 'Student ID',
  '部门': 'Department',
  '身份': 'Identity',
  '有效工时': 'Effective hours',
  '主管': 'Supervisor',
  '网页账户': 'Web account',
  '已绑定': 'Bound',
  '未绑定': 'Unbound',
  '已填报': 'Submitted',
  '月结补零': 'Auto-zero',
  '未提交': 'Not submitted',
  '暂时无法获取填报情况': 'Unable to load progress',

  '学助工时申报': 'Student Assistant Hours Submission',
  '{month} 月度表单': '{month} monthly form',
  '截止 {date}': 'Deadline {date}',
  '上次提交 {date}': 'Last submitted {date}',
  '正在加载本月表单…': "Loading this month's form…",
  '本月暂无可填报的表单。老师创建本月表单后，这里会自动出现。': 'No form is available this month. It will appear after a teacher creates one.',
  '重新检查': 'Check again',
  '值班记录': 'Duty record',
  '选填；不填按 0 小时计': 'Optional; blank counts as 0 hours',
  '本月值班总工时': 'Total duty hours this month',
  '上限不得超过12个小时': 'Must not exceed 12 hours',
  '值班时段': 'Duty schedule',
  '例如：每周一 14:00–17:00': 'e.g. Mondays 14:00–17:00',
  '值班地点': 'Duty location',
  '不填写': 'Not specified',
  '项目产出': 'Project outputs',
  '每条记录只算一个分工；没有项目可以留空': 'Each record counts one role; leave empty if none',
  '历史版本记录（仍会计入本月）': 'Legacy records (still counted this month)',
  '统筹 {count}': 'Coordinator {count}',
  '参与 {count}': 'Participant {count}',
  '原项目名称：{name}': 'Original project name: {name}',
  '项目 {index}': 'Project {index}',
  '删除': 'Delete',
  '项目类型': 'Project type',
  '请选择项目类型': 'Select a project type',
  '项目名称': 'Project name',
  '例如：新生迎新活动': 'e.g. Orientation event',
  '项目分工': 'Role',
  '统筹': 'Coordinator',
  '参与': 'Participant',
  '完成情况': 'Status',
  '完成形式': 'Completion form',
  '发布平台、活动名称/时间、结项标志': 'Platform, event name/time, completion marker',
  '实际完成时间（hrs）': 'Actual hours (hrs)',
  '还没有项目记录；如果本月只有值班，可以直接提交。': 'No project records yet; if you only have duty hours this month, you can submit directly.',
  '+ 添加项目': '+ Add project',
  '补充说明': 'Additional notes',
  '选填，最多 1000 字': 'Optional, up to 1000 characters',
  '额外工时申诉或其他说明': 'Additional hours appeal or other notes',
  '例如：某项工作耗时明显超过标准费率，希望老师复核': 'e.g. A task took much longer than the standard rate; please review.',
  '提交中…': 'Submitting…',
  '更新提交': 'Update submission',
  '提交本月工时': "Submit this month's hours",
  '尚未提交': 'Not submitted',
  '已提交': 'Submitted',
  '当前为月结补零记录': 'This is an auto-zero record',
  '截止前可反复修改': 'Editable until the deadline',
  '提交成功。截止前可以再次修改并覆盖。': 'Submitted. You can edit and resubmit before the deadline.',
  '当前使用网页身份（未绑定微信）。在小程序绑定微信后，历史网页提交会自动合并到真实账号。': 'You are using a web identity (WeChat not bound). After binding WeChat in the mini program, past web submissions will merge into your real account.',
  '你尚未绑定微信。首次提交会自动创建网页身份；之后可在小程序绑定并合并历史提交。': "You haven't bound WeChat. Your first submission creates a web identity; you can bind WeChat later in the mini program to merge past submissions.",
  '本月已统计，内容仅可查看。': 'This month has been calculated; view only.',
  '表单已截止，内容仅可查看。': 'The form is closed; view only.',
  '请先在小程序完成微信绑定后再填写。': 'Bind WeChat in the mini program before submitting.',
  '已过截止时间，内容仅可查看。': 'The deadline has passed; view only.',
  '请填写有效的值班工时': 'Enter valid duty hours.',
  '请完整填写项目 {index}，实际完成时间须为非负数': 'Complete all fields for project {index}; actual hours must be non-negative.',
  '提交失败': 'Submission failed',
  '提交失败，请稍后重试': 'Submission failed. Please try again later.',
  '暂时无法加载表单': 'Unable to load the form',

  '已发布': 'Published',
  '已完成未发布': 'Completed, not published',
  '未完成': 'Incomplete'
} as const

export type MessageKey = keyof typeof EN

/** 云函数返回的常见业务错误；未收录的保留原文，避免误译。 */
const SERVER_EN: Record<string, string> = {
  '登录已过期，请重新登录': 'Your session has expired. Please sign in again.',
  '未登录': 'Not signed in.',
  '无权限': 'Permission denied.',
  '缺少表单': 'Missing form.',
  '缺少月份': 'Missing month.',
  '本月暂无可用表单': 'No form is available for this month.',
  '表单已截止，无法提交': 'The form is closed and cannot be submitted.',
  '已过截止时间': 'The deadline has passed.',
  '未绑定的学助': 'This student account is not bound.',
  '请先在小程序完成微信绑定后再填写': 'Bind WeChat in the mini program before submitting.',
  '请填写有效的值班工时': 'Enter valid duty hours.',
  '请提交逐项填报记录': 'Submit itemized project records.',
  '请更新小程序后修改逐项填报记录': 'Update the mini program before editing itemized project records.',
  '补充说明最多 1000 字': 'Additional notes can be up to 1000 characters.',
  '请填写姓名与工号': 'Enter your name and staff ID.',
  '请填写姓名与学号': 'Enter your name and student ID.',
  '请填写姓名、工号与密码': 'Enter your name, staff ID, and password.',
  '请填写姓名、学号与密码': 'Enter your name, student ID, and password.',
  '姓名或工号不匹配，请联系管理员': 'Name or staff ID does not match. Contact the administrator.',
  '姓名或学号不匹配，请联系老师': 'Name or student ID does not match. Contact your teacher.',
  '该账户已激活，如需重置密码请联系管理员': 'This account is already activated. Contact the administrator to reset the password.',
  '该账户已激活，如需重置密码请联系老师': 'This account is already activated. Contact your teacher to reset the password.',
  '激活成功，请用刚设置的密码登录': 'Activated. Sign in with the password you just set.',
  '姓名、工号或密码不正确': 'Incorrect name, staff ID, or password.',
  '姓名、学号或密码不正确': 'Incorrect name, student ID, or password.',
  '服务未配置签名密钥，请联系管理员': 'The service is not configured with a signing key. Contact the administrator.'
}

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value == null ? match : String(value)
  })
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  return fill(lang === 'en' ? EN[key] : key, vars)
}

/** 常见服务端错误的英文；未收录时返回原文。 */
export function translateServerMessage(msg: string | null | undefined, lang: Lang): string {
  if (!msg) return ''
  if (lang === 'zh') return msg
  if (SERVER_EN[msg]) return SERVER_EN[msg]
  const project = msg.match(/^请完整填写项目(\d+)，实际完成时间须为非负数$/)
  if (project) return `Complete all fields for project ${project[1]}; actual hours must be non-negative.`
  const password = msg.match(/^密码至少 (\d+) 位$/)
  if (password) return `Password must be at least ${password[1]} characters.`
  return msg
}

/** 登录页不提供切换按钮，服务端提示直接以「中文 / English」并列展示。 */
export function bilingualServerMessage(msg: string | null | undefined): string {
  const raw = msg || ''
  const en = translateServerMessage(raw, 'en')
  return en && en !== raw ? `${raw} / ${en}` : raw
}

export function formStatusText(status: string, lang: Lang): string {
  if (status === 'open') return translate(lang, '填报中')
  if (status === 'closed') return translate(lang, '已截止')
  if (status === 'calculated') return translate(lang, '已统计')
  return status
}

/** 完成情况在服务端仍是中文枚举，这里只翻译展示文本，提交值不变。 */
export function projectStatusText(status: string, lang: Lang): string {
  if (status === '已发布') return translate(lang, '已发布')
  if (status === '已完成未发布') return translate(lang, '已完成未发布')
  if (status === '未完成') return translate(lang, '未完成')
  return status
}

/** 服务端下发的 departmentText 是「中文 English」；英文界面只显示英文部分。 */
export function departmentDisplay(text: string | null | undefined, lang: Lang): string {
  const raw = String(text || '').trim()
  if (lang !== 'en') return raw
  if (!raw || raw === '未设置') return translate('en', '未设置')
  const match = raw.match(/^[\u4e00-\u9fa5]+\s+(.+)$/)
  return match ? match[1].trim() : raw
}

export function formatDateTime(value: string | null | undefined, lang: Lang): string {
  if (!value) return ''
  const text = String(value)
  const date = new Date(text.includes('T') ? text : text.replace(/-/g, '/'))
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })
}

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = `${translate('zh', 'CPRO 学助工时申报')} / ${translate('en', 'CPRO 学助工时申报')}`
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // 隐私模式下写不进去只影响下次打开，不影响本次切换
    }
  }, [lang])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const toggleLang = useCallback(() => {
    setLangState(prev => (prev === 'zh' ? 'en' : 'zh'))
  }, [])
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang]
  )

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used within LanguageProvider')
  return context
}

export function LanguageToggle() {
  const { lang, toggleLang } = useLanguage()
  const target = lang === 'zh' ? 'English' : '中文'
  const label = lang === 'zh' ? 'Switch to English' : '切换到中文'
  return (
    <button
      type="button"
      className="app-lang"
      onClick={toggleLang}
      aria-label={label}
      title={label}
    >
      {target}
    </button>
  )
}
