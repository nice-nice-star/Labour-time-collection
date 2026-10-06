// cloudfunctions/submitForm/index.js
const cloud = require('wx-server-sdk')
const {
  normalizeProjectRows,
  rateOf,
  LOCATION_OPTIONS,
  resolveDepartment
} = require('./constants')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const LOCATIONS = LOCATION_OPTIONS

function calc(answers, projectRows, isSupervisor) {
  const duty = Number(answers.answer1) || 0
  let project = 0
  projectRows.forEach(r => {
    const counts = r.counts || {}
    // 单值项目只开放参与；rateOf 对统筹返回 null，乘出来是 0
    ;['participant', 'coordinator'].forEach(role => {
      const rate = rateOf(r.key, role)
      if (rate == null) return
      project += rate * (Number(counts[role]) || 0)
    })
  })
  let total = duty + project
  if (isSupervisor) total = total * 1.5
  const effective = Math.min(40, total) // 先应用主管倍率，再按 40 小时封顶
  return { dutyHours: duty, projectHours: project, totalHours: total, effectiveHours: effective }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { dutyHours, shiftTime, locationIndex, projectRows, projectName, appeal } = event

  // 身份校验
  const stuRes = await db.collection('students').where({ openid: OPENID }).get()
  if (!stuRes.data.length) return { ok: false, msg: '未绑定的学助' }
  const stu = stuRes.data[0]

  // 当前开放表单
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const fRes = await db.collection('monthly_forms')
    .where({ month: ym, status: db.command.in(['open', 'closed']) })
    .orderBy('createTime', 'desc').limit(1).get()
  if (!fRes.data.length) return { ok: false, msg: '本月暂无可用表单' }
  const form = fRes.data[0]
  if (form.status !== 'open') return { ok: false, msg: '表单已截止，无法提交' }
  if (form.deadline && Date.now() > new Date(form.deadline).getTime()) {
    return { ok: false, msg: '已过截止时间' }
  }

  // 组装答案
  const answers = {
    answer1: String(dutyHours || '').trim(),
    answer2: String(shiftTime || '').trim(),
    answer3: LOCATIONS[locationIndex] || '',
    answer4: '见 projectRows',
    answer5: String(projectName || '').trim(),
    answer6: String(appeal || '').trim()
  }
  // 归一化为 { key, label, counts:{participant,coordinator} }，落库保留 label 作为导出文本
  const rows = normalizeProjectRows(projectRows)
  const calcResult = calc(answers, rows, !!stu.isSupervisor)

  const data = {
    formId: form._id,
    month: form.month,
    openid: OPENID,
    studentId: stu.studentId,
    name: stu.name,
    isSupervisor: !!stu.isSupervisor,
    // 部门取自名单，不接受前端传值；落库是快照，之后调整名单不影响历史月份
    department: resolveDepartment(stu.department),
    answers,
    projectRows: rows,
    calc: calcResult,
    updateTime: db.serverDate()
  }

  // upsert
  const exist = await db.collection('submissions')
    .where({ formId: form._id, openid: OPENID }).get()
  if (exist.data.length) {
    await db.collection('submissions').doc(exist.data[0]._id).update({ data })
  } else {
    data.createTime = db.serverDate()
    await db.collection('submissions').add({ data })
  }

  return { ok: true, calc: calcResult }
}
