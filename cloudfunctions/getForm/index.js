// cloudfunctions/getForm/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()

  // 找"进行中"或"已截止"的表单：优先当前月份最新的进行中表单
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const res = await db.collection('monthly_forms')
    .where({ month: ym, status: db.command.in(['open', 'closed', 'calculated']) })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()

  if (!res.data.length) return { ok: false, msg: '本月暂无可用表单' }
  const form = res.data[0]

  let submission = null
  const sub = await db.collection('submissions')
    .where({ formId: form._id, openid: OPENID })
    .get()
  if (sub.data.length) submission = sub.data[0]

  return { ok: true, form, submission }
}
