// cloudfunctions/submitForm/index.js
const cloud = require('wx-server-sdk')
const { normalizeProjects, projectCounts } = require('./projects')
const { weightedHoursByKey, roundHours } = require('./project-weighting')
const {
  normalizeProjectRows,
  rateOf,
  LOCATION_OPTIONS,
  resolveDepartment
} = require('./constants')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const LOCATIONS = LOCATION_OPTIONS

function calc(answers, projectRows, isSupervisor, projects = []) {
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
  weightedHoursByKey(projects).forEach(hours => { project += hours })
  project = roundHours(project)
  let total = duty + project
  if (isSupervisor) total = total * 1.5
  total = roundHours(total)
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

  const exist = await db.collection('submissions').where({ formId: form._id, openid: OPENID }).get()
  const previous = exist.data[0]
  const hasProjects = Object.prototype.hasOwnProperty.call(event, 'projects')
  // 新版提交只从服务端旧记录继承历史数量，防止客户端重复汇总。
  const legacyProjectRows = hasProjects && previous
    ? (Array.isArray(previous.projects) ? (previous.legacyProjectRows || []) : (previous.projectRows || [])) : []
  let projects
  if (hasProjects) {
    try { projects = normalizeProjects(event.projects) }
    catch (e) { return { ok: false, msg: e.message } }
  } else if (previous && Array.isArray(previous.projects)) {
    return { ok: false, msg: '请更新小程序后修改逐项填报记录' }
  }
  // 值班记录选填；缺省、空字符串和空白均按 0 小时保存，非法输入仍拒绝。
  const dutyText = dutyHours == null ? '' : String(dutyHours).trim()
  const normalizedDutyHours = Number(dutyText)
  if ((dutyHours != null && !['string', 'number'].includes(typeof dutyHours)) ||
      !Number.isFinite(normalizedDutyHours) || normalizedDutyHours < 0) {
    return { ok: false, msg: '请填写有效的值班工时' }
  }
  // 组装答案
  const answers = {
    answer1: String(normalizedDutyHours),
    answer2: String(shiftTime || '').trim(),
    answer3: LOCATIONS[locationIndex] || '',
    answer4: '见 projectRows',
    answer5: hasProjects ? [legacyProjectRows.length && previous ? previous.legacyProjectName || (!Array.isArray(previous.projects) ? previous.answers.answer5 : '') : '', ...projects.map(p => p.name)].filter(Boolean).join('、') : String(projectName || '').trim(),
    answer6: String(appeal || '').trim()
  }
  // 归一化为 { key, label, counts:{participant,coordinator} }，落库保留 label 作为导出文本
  const rows = hasProjects ? projectCounts(projects, legacyProjectRows) : normalizeProjectRows(projectRows)
  const calcResult = calc(answers, hasProjects ? legacyProjectRows : rows, !!stu.isSupervisor, projects)

  const data = {
    formId: form._id,
    month: form.month,
    openid: OPENID,
    studentId: stu.studentId,
    name: stu.name,
    isSupervisor: !!stu.isSupervisor,
    // 记录来源：月结补零也写 submissions，靠这个字段区分「真提交」与「未提交自动补零」
    source: 'student',
    // 部门取自名单，不接受前端传值；落库是快照，之后调整名单不影响历史月份
    department: resolveDepartment(stu.department),
    answers,
    projectRows: rows,
    ...(hasProjects ? { projects, legacyProjectRows, legacyProjectName: previous ? previous.legacyProjectName || (!Array.isArray(previous.projects) ? previous.answers.answer5 || '' : '') : '' } : {}),
    calc: calcResult,
    updateTime: db.serverDate()
  }

  // upsert
  if (exist.data.length) {
    await db.collection('submissions').doc(exist.data[0]._id).update({ data })
  } else {
    data.createTime = db.serverDate()
    await db.collection('submissions').add({ data })
  }

  return { ok: true, calc: calcResult }
}
