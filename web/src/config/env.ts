// Web 管理端连接哪个云环境。
//
// 与 miniprogram/config/environment.js 同一思路，但触发方式不同：小程序的版本由微信决定，
// 网页则由构建时的 VITE_CLOUD_ENV 决定。没显式指定时连测试环境——正式环境 ID 目前是空的，
// 等它配好之后再在构建命令里显式指定，避免误把测试数据当成正式数据。
const environments = {
  production: '',
  test: 'cloud1-d4g33db5k71c0eba5'
}

// 资源方小程序 AppID：Web SDK 靠它确定要访问哪个小程序的云开发资源
export const MINIPROGRAM_APPID = 'wx7872c7f8c1b7efd2'

export function resolveWebEnv(explicit: string | undefined, config = environments): string {
  const value = (explicit || '').trim()
  if (value) return value
  if (!config.test) throw new Error('请配置测试云环境 ID')
  return config.test
}

export const WEB_ENV = resolveWebEnv(import.meta.env.VITE_CLOUD_ENV)
