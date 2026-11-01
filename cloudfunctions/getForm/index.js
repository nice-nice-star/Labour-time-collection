// cloudfunctions/getForm/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 与 submitForm / webGetForm 一致：兼容 ISO 与 'YYYY-MM-DD HH:mm:ss'
function deadlineAt(value) {
  if (!value) return NaN
  const text = String(value).trim()
  return new Date(text.includes('T') ? text : text.replace(/-/g, '/')).getTime()
}

// 临时补填方案：当前月一张表单都没有时，回退到最近一个「已经开始、仍开放、
// 未过截止时间」的月份，让学助可以补填（例如 11 月补 10 月）。
// 不回退 closed / calculated 的表单，也不把未来月份提前放出来。
function latestFillableFallback(forms, currentYm) {
  return forms.find(form => {
    if (!form || form.status !== 'open') return false
    if (String(form.month || '') > currentYm) return false
    const deadline = deadlineAt(form.deadline)
    return Number.isNaN(deadline) || Date.now() <= deadline
  }) || null
}

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

  // 当前月有表单（哪怕是已截止/已统计）就按原逻辑展示，只有完全没有时才回退。
  let form = res.data[0]
  if (!form) {
    const fallback = await db.collection('monthly_forms')
      .where({ status: 'open' })
      .orderBy('month', 'desc')
      .limit(100)
      .get()
    form = latestFillableFallback(fallback.data, ym)
  }

  if (!form) return { ok: false, msg: '本月暂无可用表单' }

  let submission = null
  const sub = await db.collection('submissions')
    .where({ formId: form._id, openid: OPENID })
    .get()
  if (sub.data.length) submission = sub.data[0]

  return { ok: true, form, submission }
}
