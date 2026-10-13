// cloudfunctions/getSubmissions/index.js
// 老师（导出账户）查看某月的填报进度与每人有效工时。
const cloud = require('wx-server-sdk')
const { buildRows, summarize } = require('./rows')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE = 100

// 分页取全量，避免平台单次读取上限导致名单或提交被截断
async function getAll(name, where) {
  const out = []
  for (let skip = 0; ; skip += PAGE) {
    const query = where ? db.collection(name).where(where) : db.collection(name)
    const res = await query.skip(skip).limit(PAGE).get()
    out.push(...res.data)
    if (res.data.length < PAGE) return out
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const { formId } = event
  if (!formId) return { ok: false, msg: '缺少表单' }

  // 权限校验：导出账户（与 listForms / exportData 同一口径，不靠前端隐藏按钮）
  // 没有 openid 直接拒绝——未登录模式下的匿名调用会走到这里。
  if (!OPENID) return { ok: false, msg: '未登录' }
  const exp = await db.collection('export_accounts').where({ openid: OPENID }).get()
  if (!exp.data.length) return { ok: false, msg: '无权限' }

  const form = (await db.collection('monthly_forms').doc(formId).get()).data
  const [subs, students] = await Promise.all([
    getAll('submissions', { formId }),
    getAll('students')
  ])

  const rows = buildRows(students, subs)
  return {
    ok: true,
    form: { _id: form._id, month: form.month, status: form.status, deadline: form.deadline || '' },
    rows,
    summary: summarize(rows)
  }
}
