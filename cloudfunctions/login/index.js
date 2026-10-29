// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 网页端的口令哈希/盐只属于服务端凭据，不能随小程序登录载荷下发。
function publicAccount(record) {
  const { webPasswordSalt, webPasswordHash, webPasswordSetAt, ...safe } = record
  return safe
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()

  // 1. 导出账户（老师）
  const exp = await db.collection('export_accounts').where({ openid: OPENID }).get()
  if (exp.data.length) return { role: 'export', user: publicAccount(exp.data[0]) }

  // 2. 已绑定学助
  const stu = await db.collection('students').where({ openid: OPENID }).get()
  if (stu.data.length) return { role: 'student', user: publicAccount(stu.data[0]) }

  // 3. 未绑定
  return { role: 'unbound', user: null }
}
