// cloudfunctions/webBind/index.js
// 老师首次为 Web 管理端设置密码（激活）。信任模型与 bindStudent 一致：
// 姓名 + exportId 完全一致才放行。
//
// 已激活的账户拒绝再次绑定——否则任何知道姓名与工号的人都能顶掉别人的密码。
// 需要重置时由管理员在数据库里清掉 webPasswordHash / webPasswordSalt。
const cloud = require('wx-server-sdk')
const { newSalt, hashPassword } = require('./webauth')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MIN_PASSWORD = 8

exports.main = async (event = {}) => {
  const { name, exportId, password } = event
  if (!name || !exportId) return { ok: false, msg: '请填写姓名与工号' }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return { ok: false, msg: `密码至少 ${MIN_PASSWORD} 位` }
  }

  const res = await db.collection('export_accounts').where({ name, exportId }).get()
  if (!res.data.length) return { ok: false, msg: '姓名或工号不匹配，请联系管理员' }
  const account = res.data[0]

  if (account.webPasswordHash) {
    return { ok: false, msg: '该账户已激活，如需重置密码请联系管理员' }
  }

  const salt = newSalt()
  await db.collection('export_accounts').doc(account._id).update({
    data: {
      webPasswordSalt: salt,
      webPasswordHash: hashPassword(password, salt),
      webPasswordSetAt: db.serverDate()
    }
  })

  return { ok: true, msg: '激活成功，请用刚设置的密码登录' }
}
