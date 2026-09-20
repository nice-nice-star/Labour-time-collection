// cloudfunctions/bindStudent/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { name, studentId } = event
  if (!name || !studentId) return { ok: false, msg: '参数缺失' }

  // 1. 先判断是否为导出账户（姓名 + exportId 完全一致）
  const expRes = await db.collection('export_accounts')
    .where({ name, exportId: studentId })
    .get()

  if (expRes.data.length) {
    const exp = expRes.data[0]
    if (exp.openid && exp.openid !== OPENID) {
      return { ok: false, msg: '该账户已被其他微信绑定' }
    }
    await db.collection('export_accounts').doc(exp._id).update({
      data: { openid: OPENID, bindTime: db.serverDate() }
    })
    return { ok: true, role: 'export', user: { ...exp, openid: OPENID } }
  }

  // 2. 再判断是否为学助（姓名 + studentId 完全一致）
  const stuRes = await db.collection('students')
    .where({ name, studentId })
    .get()

  if (!stuRes.data.length) return { ok: false, msg: '姓名或ID不匹配，请联系老师' }

  const stu = stuRes.data[0]
  if (stu.openid && stu.openid !== OPENID) {
    return { ok: false, msg: '该学助信息已被其他微信绑定' }
  }

  await db.collection('students').doc(stu._id).update({
    data: { openid: OPENID, bindTime: db.serverDate() }
  })

  return { ok: true, role: 'student', user: { ...stu, openid: OPENID } }
}