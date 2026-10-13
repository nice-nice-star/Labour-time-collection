// cloudfunctions/webGetSubmissions/index.js
// Web 管理端：某月的填报进度与每人有效工时。
// 权限只来自 event.token（见 webauth.js），本函数不读调用方环境身份。
const cloud = require('wx-server-sdk')
const { requireExport } = require('./webauth')
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
  const { formId } = event
  if (!formId) return { ok: false, msg: '缺少表单' }

  const account = await requireExport(event, db)
  if (!account) return { ok: false, msg: '登录已过期，请重新登录' }

  const form = (await db.collection('monthly_forms').doc(formId).get()).data
  const [subs, students] = await Promise.all([
    getAll('submissions', { formId }),
    getAll('students')
  ])

  // 进度口径与小程序端共用同一份纯逻辑（副本由测试校验）
  const rows = buildRows(students, subs)
  return {
    ok: true,
    form: { _id: form._id, month: form.month, status: form.status, deadline: form.deadline || '' },
    rows,
    summary: summarize(rows)
  }
}
