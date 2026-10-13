// 微信云开发 Web SDK 以 <script> 方式加载，并在 window 上挂载 cloud 对象。
// 它没有官方 TypeScript 类型，这里只声明本项目实际用到的部分。
export {}

export interface CloudCallResult<T> {
  result: T
}

export interface CloudInstance {
  /** 初始化：新建实例后必须调用一次，多次调用只有第一次生效 */
  init(): Promise<void>
  callFunction<T = unknown>(args: { name: string; data?: Record<string, unknown> }): Promise<CloudCallResult<T>>
}

export interface CloudOptions {
  /** 资源方小程序 AppID */
  resourceAppid: string
  /** 资源方云环境 ID */
  resourceEnv: string
  /** 未登录模式必须为 true */
  identityless?: boolean
  /** 公众号网页、使用公众号登录态时必填；未登录模式不需要 */
  appid?: string
  traceUser?: boolean
}

declare global {
  interface Window {
    cloud?: {
      Cloud: new (options: CloudOptions) => CloudInstance
    }
  }
}
