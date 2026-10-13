// cloudfunctions/webSession/index.js
// 用会话票据换取老师身份，供网页刷新后恢复登录态。
// 身份只来自 event.token 的签名，绝不读 cloud.getWXContext()。
const cloud = require('wx-server-sdk')
const { readSecret, verifyToken } = require('./webauth')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const secret = readSecret(process.env)
  if (!secret) return { ok: false, msg: '服务未配置签名密钥，请联系管理员' }

  const payload = verifyToken(event.token, secret)
  if (!payload) return { ok: false, msg: '登录已过期，请重新登录' }

  // 用 where 而不是 doc：账户被删除时返回未登录，而不是抛异常
  const res = await db.collection('export_accounts').where({ _id: payload.sub }).limit(1).get()
  const account = res.data[0]
  if (!account || !account.webPasswordHash) return { ok: false, msg: '登录已过期，请重新登录' }

  return { ok: true, user: { name: account.name, exportId: account.exportId } }
}
