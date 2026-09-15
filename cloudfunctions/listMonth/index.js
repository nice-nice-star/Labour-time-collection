// cloudfunctions/listForms/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()

  // 权限校验：导出账户
  const exp = await db.collection('export_accounts').where({ openid: OPENID }).get()
  if (!exp.data.length) return { ok: false, msg: '无权限' }

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
