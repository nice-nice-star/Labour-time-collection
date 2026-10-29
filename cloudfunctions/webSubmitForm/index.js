// cloudfunctions/webSubmitForm/index.js
// 学助网页端提交：与小程序 submitForm 写同一条 submissions 记录（按 openid 对齐），
// 身份只来自 role=student 的票据；姓名、学号、主管标记、部门都由服务端重新读名单。
//
// 默认要求该学助已在小程序绑定微信。临时开关 WEB_ALLOW_UNBOUND=true 打开后，
// 未绑定学助首次提交会生成 web:<students._id> 并标记 openidSource:'web'，
// 这样进度、月结补零、导出仍共用同一个 openid 关联键；之后在小程序绑定真实微信时，
// bindStudent 会把历史提交迁移到真实 openid。
const cloud = require('wx-server-sdk')
const { requireStudent, allowUnboundWeb } = require('./webauth')
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

// 与 submitForm 的 calc 保持同一套口径，测试会用同一份数据断言两端结果相同。
function calc(answers, projectRows, isSupervisor, projects = []) {
  const duty = Number(answers.answer1) || 0
  let project = 0
  projectRows.forEach(r => {
    const counts = r.counts || {}
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
  const effective = Math.min(40, total)
  return { dutyHours: duty, projectHours: project, totalHours: total, effectiveHours: effective }
}

// 与 getForm 一致：兼容 'YYYY-MM-DD HH:mm:ss' 与 ISO 字符串
function deadlineAt(value) {
  if (!value) return NaN
  const text = String(value).trim()
  return new Date(text.includes('T') ? text : text.replace(/-/g, '/')).getTime()
}

exports.main = async (event = {}) => {
  const stu = await requireStudent(event, db)
  if (!stu) return { ok: false, msg: '登录已过期，请重新登录' }

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const fRes = await db.collection('monthly_forms')
    .where({ month: ym, status: db.command.in(['open', 'closed', 'calculated']) })
    .orderBy('createTime', 'desc').limit(1).get()
  if (!fRes.data.length) return { ok: false, msg: '本月暂无可用表单' }
  const form = fRes.data[0]
  if (form.status !== 'open') return { ok: false, msg: '表单已截止，无法提交' }
  const deadline = deadlineAt(form.deadline)
  if (!Number.isNaN(deadline) && Date.now() > deadline) {
    return { ok: false, msg: '已过截止时间' }
  }

  // 只在表单确实可提交时才生成临时网页身份，避免学生点一下就把身份写进名单。
  let openid = stu.openid
  if (!openid) {
    if (!allowUnboundWeb(process.env)) {
      return { ok: false, msg: '请先在小程序完成微信绑定后再填写' }
    }
    openid = `web:${stu._id}`
    await db.collection('students').doc(stu._id).update({
      data: { openid, openidSource: 'web', webIdentityAt: db.serverDate() }
    })
  }

  const exist = await db.collection('submissions')
    .where({ formId: form._id, openid })
    .get()
  const previous = exist.data[0]
  const hasProjects = Object.prototype.hasOwnProperty.call(event, 'projects')
  // 与 submitForm 相同：只从服务端旧记录继承历史数量，防止客户端重复汇总。
  const legacyProjectRows = hasProjects && previous
    ? (Array.isArray(previous.projects) ? (previous.legacyProjectRows || []) : (previous.projectRows || []))
    : []
  let projects
  if (hasProjects) {
    try { projects = normalizeProjects(event.projects) }
    catch (e) { return { ok: false, msg: e.message } }
  } else if (previous && Array.isArray(previous.projects)) {
    return { ok: false, msg: '请提交逐项填报记录' }
  }

  // 值班记录选填；缺省、空字符串和空白均按 0 小时保存，非法输入仍拒绝。
  const dutyText = event.dutyHours == null ? '' : String(event.dutyHours).trim()
  const normalizedDutyHours = Number(dutyText)
  if ((event.dutyHours != null && !['string', 'number'].includes(typeof event.dutyHours)) ||
      !Number.isFinite(normalizedDutyHours) || normalizedDutyHours < 0) {
    return { ok: false, msg: '请填写有效的值班工时' }
  }
  // 与表单的 maxlength 一致，服务端也兜住，避免绕过前端写入超长文本。
  const appeal = String(event.appeal || '').trim()
  if (appeal.length > 1000) return { ok: false, msg: '补充说明最多 1000 字' }

  // 地点只接受合法下标：直接用 event.locationIndex 索引数组会被 'constructor'
  // 这类键命中原型链，把函数写进答案。
  const rawLocationIndex = event.locationIndex
  const locationIndex = (typeof rawLocationIndex === 'number' ||
    (typeof rawLocationIndex === 'string' && rawLocationIndex.trim() !== ''))
    ? Number(rawLocationIndex)
    : NaN
  const location = Number.isInteger(locationIndex) && locationIndex >= 0 && locationIndex < LOCATIONS.length
    ? LOCATIONS[locationIndex]
    : ''

  // 历史版本的「项目名称」只作兼容字段：没有旧记录时留空。
  const previousLegacyName = previous
    ? (previous.legacyProjectName || (!Array.isArray(previous.projects) ? (previous.answers || {}).answer5 || '' : ''))
    : ''
  const legacyName = legacyProjectRows.length && previous ? previousLegacyName : ''
  const answers = {
    answer1: String(normalizedDutyHours),
    answer2: String(event.shiftTime || '').trim(),
    answer3: location,
    answer4: '见 projectRows',
    answer5: hasProjects
      ? [legacyName, ...projects.map(p => p.name)].filter(Boolean).join('、')
      : String(event.projectName || '').trim(),
    answer6: appeal
  }

  const rows = hasProjects ? projectCounts(projects, legacyProjectRows) : normalizeProjectRows(event.projectRows)
  const calcResult = calc(answers, hasProjects ? legacyProjectRows : rows, !!stu.isSupervisor, projects)

  const data = {
    formId: form._id,
    month: form.month,
    openid,
    studentId: stu.studentId,
    name: stu.name,
    isSupervisor: !!stu.isSupervisor,
    // 记录来源：月结补零也写 submissions，靠这个字段区分「真提交」与「未提交自动补零」
    source: 'student',
    // 部门取自名单，不接受前端传值；落库是快照，之后调整名单不影响历史月份
    department: resolveDepartment(stu.department),
    answers,
    projectRows: rows,
    ...(hasProjects ? {
      projects,
      legacyProjectRows,
      legacyProjectName: previousLegacyName
    } : {}),
    calc: calcResult,
    updateTime: db.serverDate()
  }

  if (exist.data.length) {
    await db.collection('submissions').doc(exist.data[0]._id).update({ data })
  } else {
    data.createTime = db.serverDate()
    await db.collection('submissions').add({ data })
  }

  return { ok: true, calc: calcResult }
}
