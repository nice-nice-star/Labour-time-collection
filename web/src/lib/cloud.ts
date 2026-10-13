import type { CloudInstance } from '../types/wxcloud'
import { MINIPROGRAM_APPID, WEB_ENV } from '../config/env'

// 云开发实例只建一次：init() 只需一次，重复调用也只有第一次生效。
let instance: CloudInstance | null = null
let initializing: Promise<CloudInstance> | null = null

function create(): CloudInstance {
  const sdk = window.cloud
  if (!sdk) {
    throw new Error('Web SDK 未加载：请确认 index.html 里的 cloud.js 能正常访问')
  }
  // 未登录模式：网页访客没有微信身份，登录态完全由自建凭据（webLogin 签发的票据）决定。
  // 文档明确：未登录模式下不会调用资源方环境的 cloudbase_auth 云函数。
  return new sdk.Cloud({
    identityless: true,
    resourceAppid: MINIPROGRAM_APPID,
    resourceEnv: WEB_ENV
  })
}

export function getCloud(): Promise<CloudInstance> {
  if (instance) return Promise.resolve(instance)
  if (!initializing) {
    initializing = (async () => {
      const cloud = create()
      await cloud.init()
      instance = cloud
      return cloud
    })().catch((err: unknown) => {
      initializing = null // 允许重试，否则一次失败会永久卡住
      throw err
    })
  }
  return initializing
}

/** 仅供测试或切换环境时重置 */
export function resetCloud(): void {
  instance = null
  initializing = null
}
