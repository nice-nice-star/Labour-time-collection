import { getCloud } from './cloud'

/** 网页端两种身份：老师用 export，学助用 student；服务端票据里也带这个值 */
export type WebRole = 'export' | 'student'

export interface WebUser {
  name: string
  /** 老师账户才有 */
  exportId?: string
  /** 学助账户才有 */
  studentId?: string
  /** 学助账户才有；只用于展示，工时与倍率仍以服务端名单为准 */
  isSupervisor?: boolean
  /** 所属部门：名单里的原始写法（规范值 / 中文名 / 别名） */
  department?: string
  /** 服务端按部门映射表算好的展示文本 */
  departmentText?: string
}

export interface ApiResult {
  ok: boolean
  msg?: string
}

export interface LoginResult extends ApiResult {
  token?: string
  user?: WebUser
  role?: WebRole
}

export interface SessionResult extends ApiResult {
  user?: WebUser
  role?: WebRole
}

export type FormStatus = 'open' | 'closed' | 'calculated'

export interface MonthlyForm {
  _id: string
  month: string
  status: FormStatus
  deadline?: string
  count?: number
}

export type ProjectRole = 'coordinator' | 'participant'
export type ProjectStatus = '已发布' | '已完成未发布' | '未完成'

export interface ProjectOption {
  key: string
  label: string
  labelEn?: string
}

export interface FormMeta {
  projectRows: ProjectOption[]
  statusOptions: ProjectStatus[]
  locationOptions: string[]
}

export interface SavedProject {
  key: string
  label?: string
  name: string
  role: ProjectRole
  status: ProjectStatus
  completionForm: string
  actualHours: number
}

export interface ProjectCountRow {
  key: string
  label?: string
  counts: { participant: number; coordinator: number }
}

export interface FormCalc {
  dutyHours: number
  projectHours: number
  totalHours: number
  effectiveHours: number
}

export interface FormSubmission {
  _id?: string
  source?: string
  answers: Record<string, string>
  projects?: SavedProject[]
  projectRows?: ProjectCountRow[]
  legacyProjectRows?: ProjectCountRow[]
  legacyProjectName?: string
  calc?: FormCalc | null
  updateTime?: string | null
}

export interface StudentFormResult extends ApiResult {
  form: MonthlyForm | null
  submission: FormSubmission | null
  /** 是否已绑定真实微信；网页临时身份为 false */
  bound: boolean
  /** wechat / web / 空字符串（未绑定） */
  identitySource?: 'wechat' | 'web' | ''
  canSubmit: boolean
  meta: FormMeta
}

export interface StudentProjectInput {
  key: string
  name: string
  role: ProjectRole
  status: ProjectStatus
  completionForm: string
  actualHours: number
}

export interface StudentFormPayload {
  dutyHours: number
  shiftTime: string
  locationIndex: number
  projects: StudentProjectInput[]
  appeal: string
}

export interface SubmitFormResult extends ApiResult {
  calc?: FormCalc
}

export interface FormsResult extends ApiResult {
  forms?: MonthlyForm[]
}

export interface CreateFormResult extends ApiResult {
  id?: string
  action?: 'created' | 'updated'
}

export interface SubmissionRow {
  name: string
  studentId: string
  /** 名单原值或提交时快照（规范值 / 未归一化的旧值） */
  department: string
  /** 服务端按部门映射表算好的展示文本，页面直接显示 */
  departmentText: string
  isSupervisor: boolean
  bound: boolean
  /** wechat / web / 空字符串（未绑定） */
  identitySource?: 'wechat' | 'web' | ''
  submitted: boolean
  zeroFilled: boolean
  effectiveHours: number | null
}

export interface ProgressSummary {
  total: number
  bound: number
  submitted: number
  pending: number
  unbound: number
}

export interface SubmissionsResult extends ApiResult {
  form?: { _id: string; month: string; status: FormStatus; deadline: string }
  rows?: SubmissionRow[]
  summary?: ProgressSummary
}

export interface ExportResult extends ApiResult {
  url?: string
  filename?: string
}

// 云函数永远返回 { ok, msg } 结构，不抛业务异常；网络/初始化失败才会 reject。
async function call<T extends ApiResult>(name: string, data?: Record<string, unknown>): Promise<T> {
  const cloud = await getCloud()
  const res = await cloud.callFunction<T>({ name, data: data || {} })
  return res.result
}

/** 会话过期时云函数返回的提示语，页面据此把用户退回登录页 */
export const SESSION_EXPIRED_MSG = '登录已过期，请重新登录'

export function isSessionExpired(res: ApiResult): boolean {
  return res.ok === false && res.msg === SESSION_EXPIRED_MSG
}

/** 首次激活：姓名 + 工号完全一致才可设置密码 */
export function bindWebAccount(name: string, exportId: string, password: string): Promise<ApiResult> {
  return call<ApiResult>('webBind', { name, exportId, password })
}

/** 登录：成功返回会话票据 */
export function loginWebAccount(name: string, exportId: string, password: string): Promise<LoginResult> {
  return call<LoginResult>('webLogin', { name, exportId, password })
}

/** 学助首次激活：姓名 + 学号完全一致才可设置密码（与老师端同一套流程） */
export function bindWebStudent(name: string, studentId: string, password: string): Promise<ApiResult> {
  return call<ApiResult>('webStudentBind', { name, studentId, password })
}

/** 学助登录：成功返回 role=student 的会话票据 */
export function loginWebStudent(name: string, studentId: string, password: string): Promise<LoginResult> {
  return call<LoginResult>('webStudentLogin', { name, studentId, password })
}

/** 用票据恢复会话（刷新页面后调用）；返回 role 供 App 决定进老师页还是学助页 */
export function fetchWebSession(token: string): Promise<SessionResult> {
  return call<SessionResult>('webSession', { token })
}

/** 学助读取本月表单与自己的一条提交 */
export function fetchStudentForm(token: string): Promise<StudentFormResult> {
  return call<StudentFormResult>('webGetForm', { token })
}

/** 学助提交/更新本月表单（截止前可反复覆盖，服务端按 openid 写同一条记录） */
export function submitStudentForm(token: string, payload: StudentFormPayload): Promise<SubmitFormResult> {
  return call<SubmitFormResult>('webSubmitForm', { token, ...payload })
}

export function listForms(token: string): Promise<FormsResult> {
  return call<FormsResult>('webListForms', { token })
}

/**
 * 创建或重开月度表单。
 * month 形如 2026-11；deadline 是 YYYY-MM-DD，按小程序端口径补成当天 23:59:59 再入库。
 */
export function createMonthlyForm(token: string, month: string, deadline: string): Promise<CreateFormResult> {
  return call<CreateFormResult>('webCreateMonthlyForm', {
    token,
    month,
    deadline: deadline ? `${deadline} 23:59:59` : ''
  })
}

export function fetchSubmissions(token: string, formId: string): Promise<SubmissionsResult> {
  return call<SubmissionsResult>('webGetSubmissions', { token, formId })
}

export function exportMonthlyData(token: string, formId: string): Promise<ExportResult> {
  return call<ExportResult>('webExportData', { token, formId })
}
