// cloudfunctions/bindStudent/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { name, studentId } = event
  if (!name || !studentId) return { ok: false, msg: '参数缺失' }

  // 姓名 + ID 必须与内置信息完全一致
  const res = await db.collection('students')
    .where({ name, studentId })
    .get()

  if (!res.data.length) return { ok: false, msg: '姓名或ID不匹配，请联系老师' }

  const stu = res.data[0]
  if (stu.openid && stu.openid !== OPENID) {
    return { ok: false, msg: '该学助信息已被其他微信绑定' }
  }

  // 绑定当前 openid（不存在则写回）
  await db.collection('students').doc(stu._id).update({
    data: { openid: OPENID, bindTime: db.serverDate() }
  })

  return { ok: true, user: { ...stu, openid: OPENID } }
}
