// cloudfunctions/webLogin/index.js
// Web 管理端登录：校验自建口令，签发无状态会话票据。
// 身份只来自姓名 + 工号 + 密码，绝不读 cloud.getWXContext()。
const cloud = require('wx-server-sdk')
const { readSecret, verifyPassword, signToken } = require('./webauth')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const { name, exportId, password } = event
  if (!name || !exportId || typeof password !== 'string' || !password) {
    return { ok: false, msg: '请填写姓名、工号与密码' }
  }

  const secret = readSecret(process.env)
  if (!secret) return { ok: false, msg: '服务未配置签名密钥，请联系管理员' }

  const res = await db.collection('export_accounts').where({ name, exportId }).get()
  const account = res.data[0]

  // 账户不存在、未激活、密码错误一律回同一句话，避免被拿来枚举账号
  const denied = { ok: false, msg: '姓名、工号或密码不正确' }
  if (!account || !account.webPasswordHash) return denied
  if (!verifyPassword(password, account.webPasswordSalt, account.webPasswordHash)) return denied

  return {
    ok: true,
    token: signToken(account._id, secret),
    user: { name: account.name, exportId: account.exportId }
  }
}
