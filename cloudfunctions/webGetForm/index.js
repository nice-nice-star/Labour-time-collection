// cloudfunctions/webGetForm/index.js
// 学助网页端：读取本月表单与自己的一条提交。
// 权限只来自 event.token（role=student），不读 cloud.getWXContext()。
const cloud = require('wx-server-sdk')
const { requireStudent, allowUnboundWeb } = require('./webauth')
const { PROJECT_ROWS, LOCATION_OPTIONS } = require('./constants')
const { STATUS_OPTIONS } = require('./projects')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function pad(n) { return String(n).padStart(2, '0') }

function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

// 与 submitForm 一致：兼容 'YYYY-MM-DD HH:mm:ss' 与 ISO 字符串
function deadlineAt(value) {
  if (!value) return NaN
  const text = String(value).trim()
  return new Date(text.includes('T') ? text : text.replace(/-/g, '/')).getTime()
}

// 名单里的身份来源：没有 openid = 未绑定；web: 前缀或 openidSource='web' = 网页身份；
// 其余视为真实微信 openid（兼容加字段之前的老记录）。
function identityOf(stu) {
  if (!stu.openid) return ''
  if (stu.openidSource === 'web') return 'web'
  return typeof stu.openid === 'string' && stu.openid.startsWith('web:') ? 'web' : 'wechat'
}

function isOpen(form, canIdentify, now = Date.now()) {
  if (!canIdentify || !form || form.status !== 'open') return false
  const deadline = deadlineAt(form.deadline)
  return Number.isNaN(deadline) || now <= deadline
}

// 只回传学助自己的填报内容；openid 与名单字段留在服务端。
function publicSubmission(record) {
  if (!record) return null
  return {
    _id: record._id,
    source: record.source || 'student',
    answers: record.answers || {},
    projects: Array.isArray(record.projects) ? record.projects : [],
    projectRows: Array.isArray(record.projectRows) ? record.projectRows : [],
    legacyProjectRows: Array.isArray(record.legacyProjectRows) ? record.legacyProjectRows : [],
    legacyProjectName: record.legacyProjectName || '',
    calc: record.calc || null,
    updateTime: record.updateTime || null
  }
}

exports.main = async (event = {}) => {
  const stu = await requireStudent(event, db)
  if (!stu) return { ok: false, msg: '登录已过期，请重新登录' }

  // 选项由服务端下发：网页不另抄一份项目/地点枚举，避免和小程序漂移。
  const meta = {
    projectRows: PROJECT_ROWS.map(row => ({ key: row.key, label: row.label, labelEn: row.labelEn })),
    statusOptions: STATUS_OPTIONS,
    locationOptions: LOCATION_OPTIONS
  }
  const identitySource = identityOf(stu)
  // bound 只表示「已绑定真实微信」；网页身份也算有身份，所以能提交但不是 bound。
  const bound = identitySource === 'wechat'
  // WEB_ALLOW_UNBOUND=true 时，没有 openid 的学助也可以先在网页填报，
  // 首次提交会由 webSubmitForm 生成 web:<students._id>。
  const canIdentify = !!stu.openid || allowUnboundWeb(process.env)

  const res = await db.collection('monthly_forms')
    .where({ month: currentMonth(), status: db.command.in(['open', 'closed', 'calculated']) })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()

  if (!res.data.length) {
    return { ok: true, form: null, submission: null, bound, identitySource, canSubmit: false, meta }
  }
  const form = res.data[0]

  // 有身份键（真实 openid 或 web:<_id>）才可能有本人提交；未绑定时为空。
  let submission = null
  if (stu.openid) {
    const sub = await db.collection('submissions')
      .where({ formId: form._id, openid: stu.openid })
      .get()
    submission = publicSubmission(sub.data[0])
  }

  return {
    ok: true,
    form: {
      _id: form._id,
      month: form.month,
      status: form.status,
      deadline: form.deadline || ''
    },
    submission,
    bound,
    identitySource,
    canSubmit: isOpen(form, canIdentify),
    meta
  }
}
