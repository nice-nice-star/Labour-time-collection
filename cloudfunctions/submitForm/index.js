// cloudfunctions/submitForm/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 项目工时表（与前端 constants.js 保持一致；视频剪辑为"待定"，用 null）
const PROJECT_HOURS = {
  '深度访谈前期准备': 2, '参与深度访谈': 1, '访谈成稿': 3,
  '排版制作一条完整的视频': 3, '制作一条短视频 (1-5)mins': 4,
  '制作一条长视频 ~10mins': 8, '视频剪辑': null, '小红书编辑一条': 3,
  '撰写一条海外社媒稿件': 1, '参与一场活动摄影': 2, '海报设计': 2,
  '新闻监测': 2, '组织一次内部活动': 8
}
const LOCATIONS = ['University gift shop', 'ABE303', 'ABW709']

function calc(answers, projectRows, isSupervisor) {
  const duty = Number(answers.answer1) || 0
  let project = 0
  projectRows.forEach(r => {
    const rate = PROJECT_HOURS[r.item]
    if (rate == null) return
    project += rate * (Number(r.count) || 0)
  })
  let total = duty + project
  if (isSupervisor) total = total * 1.5
  const effective = Math.max(40, total)
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
  const calcResult = calc(answers, projectRows || [], !!stu.isSupervisor)

  const data = {
    formId: form._id,
    month: form.month,
    openid: OPENID,
    studentId: stu.studentId,
    name: stu.name,
    isSupervisor: !!stu.isSupervisor,
    answers,
    projectRows: projectRows || [],
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
