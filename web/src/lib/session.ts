// 会话票据的本地存储。票据是无状态 HMAC，服务端不存；这里只负责记住它。
const TOKEN_KEY = 'ltc.web.token'

function storage(): Storage | null {
  try {
    // 隐私模式或被禁用时访问 localStorage 会抛异常
    return window.localStorage
  } catch (e) {
    return null
  }
}

export function loadToken(): string {
  const store = storage()
  if (!store) return ''
  try {
    return store.getItem(TOKEN_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function saveToken(token: string): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(TOKEN_KEY, token)
  } catch (e) {
    // 存不进去只影响「刷新后免登录」，不影响本次会话
  }
}

export function clearToken(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(TOKEN_KEY)
  } catch (e) {
    // 忽略
  }
}
