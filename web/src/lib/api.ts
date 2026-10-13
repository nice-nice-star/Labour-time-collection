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

// 云函数永远返回 { ok, msg } 结构，不抛业务异常；网络/初始化失败才会 reject。
async function call<T extends ApiResult>(name: string, data?: Record<string, unknown>): Promise<T> {
  const cloud = await getCloud()
  const res = await cloud.callFunction<T>({ name, data: data || {} })
  return res.result
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
