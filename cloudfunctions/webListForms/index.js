// cloudfunctions/webListForms/index.js
// Web 管理端：表单列表 + 每个表单的提交人数。
// 权限只来自 event.token（见 webauth.js），本函数不读调用方环境身份。
const cloud = require('wx-server-sdk')
const { requireExport } = require('./webauth')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const account = await requireExport(event, db)
  if (!account) return { ok: false, msg: '登录已过期，请重新登录' }

  const formsRes = await db.collection('monthly_forms')
    .orderBy('month', 'desc')
    .limit(100)
    .get()

  // 统计每个表单的提交人数
  const forms = []
  for (const f of formsRes.data) {
    const countRes = await db.collection('submissions')
      .where({ formId: f._id }).count()
    forms.push({ ...f, count: countRes.total })
  }

  return { ok: true, forms }
}
