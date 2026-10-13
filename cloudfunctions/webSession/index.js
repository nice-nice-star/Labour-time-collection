// cloudfunctions/webSession/index.js
// 用会话票据换取老师身份，供网页刷新后恢复登录态。
// 身份只来自 event.token 的签名，绝不读 cloud.getWXContext()。
const cloud = require('wx-server-sdk')
const { requireExport } = require('./webauth')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const account = await requireExport(event, db)
  if (!account) return { ok: false, msg: '登录已过期，请重新登录' }
  return { ok: true, user: { name: account.name, exportId: account.exportId } }
}
