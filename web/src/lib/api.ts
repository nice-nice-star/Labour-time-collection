import { getCloud } from './cloud'

export interface WebUser {
  name: string
  exportId: string
}

export interface ApiResult {
  ok: boolean
  msg?: string
}

export interface LoginResult extends ApiResult {
  token?: string
  user?: WebUser
}

export interface SessionResult extends ApiResult {
  user?: WebUser
}

export type FormStatus = 'open' | 'closed' | 'calculated'

export interface MonthlyForm {
  _id: string
  month: string
  status: FormStatus
  deadline?: string
  count?: number
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

/** 用票据恢复会话（刷新页面后调用） */
export function fetchWebSession(token: string): Promise<SessionResult> {
  return call<SessionResult>('webSession', { token })
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
