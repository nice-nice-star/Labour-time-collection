// cloudfunctions/getSubmissions/index.js
// 老师（导出账户）查看某月的填报进度与每人有效工时。
// 只回汇总数值，不回 answers / projectRows：老师在这页看不到学助填的具体内容。
const cloud = require('wx-server-sdk')
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

  const byOpenid = new Map(subs.map(s => [s.openid, s]))
  const rows = students.map(stu => {
    const sub = stu.openid ? byOpenid.get(stu.openid) : null
    // 月结补零同样写 submissions，但它是「未提交」的结果，进度必须与真提交区分。
    // 缺 source 的历史记录按真提交处理（该字段上线前的数据不会因缺字段被误判）。
    const submitted = !!sub && sub.source !== 'auto-zero'
    const calc = (sub && sub.calc) || null
    return {
      name: stu.name,
      studentId: stu.studentId,
      // 提交过的取提交时快照（与导出 Excel 一致），未提交的退回当前名单值
      department: (sub && sub.department) || stu.department || '',
      isSupervisor: !!stu.isSupervisor,
      bound: !!stu.openid,
      submitted,
      zeroFilled: !!sub && sub.source === 'auto-zero',
      // 未提交没有「申报时长」，留 null 由页面显示为「—」，不写成 0
      effectiveHours: submitted && calc ? calc.effectiveHours : null
    }
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))

  const submitted = rows.filter(r => r.submitted).length
  const bound = rows.filter(r => r.bound).length
  return {
    ok: true,
    form: { _id: form._id, month: form.month, status: form.status, deadline: form.deadline || '' },
    rows,
    summary: {
      total: rows.length,
      bound,
      submitted,
      // 已绑定但还没提交：月结时会被补零，导出里按 0 计入
      pending: bound - submitted,
      // 未绑定：calculateMonthly 会跳过，导出也缺这些人
      unbound: rows.length - bound
    }
  }
}
