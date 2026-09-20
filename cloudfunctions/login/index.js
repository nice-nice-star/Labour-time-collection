// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  console.log('OPENID =', cloud.getWXContext().OPENID)
  const { OPENID } = cloud.getWXContext()

  // 1. 导出账户（老师）
  const exp = await db.collection('export_accounts').where({ openid: OPENID }).get()
  if (exp.data.length) return { role: 'export', user: exp.data[0] }

  // 2. 已绑定学助
  const stu = await db.collection('students').where({ openid: OPENID }).get()
  if (stu.data.length) return { role: 'student', user: stu.data[0] }

  // 3. 未绑定
  return { role: 'unbound', user: null }
}
