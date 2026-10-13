import type { WebUser } from '../lib/api'

interface Props {
  user: WebUser
  onLogout: () => void
}

// 阶段 1 只做到「能用自建凭据登录」。表单列表、创建表单、导出在阶段 2/3 接进来。
export default function HomePage({ user, onLogout }: Props) {
  return (
    <div className="card">
      <h1>学助工时管理后台</h1>
      <p className="helper">已登录：{user.name}（{user.exportId}）</p>
      <p className="notice">登录已打通。表单列表、创建月度表单与导出将在下一步接入。</p>
      <button type="button" onClick={onLogout}>退出登录</button>
    </div>
  )
}
