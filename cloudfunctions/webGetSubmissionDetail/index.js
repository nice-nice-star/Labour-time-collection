// Web 管理端：单名学助某月的填报明细。
//
// 权限只来自 event.token（role=export，见 webauth.js），本函数不读调用方环境身份。
// 「填报情况」页的进度接口（webGetSubmissions）刻意不下发 answers / projects，
// 详情另起本函数：一次只查一名学生，避免把整份名单的填报内容一次性发给浏览器。
const cloud = require('wx-server-sdk')
const { requireExport, readSecret, verifyToken } = require('./webauth')
const { buildRows } = require('./rows')
const { buildSubmissionDetail } = require('./detail')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 只接受字符串/数字，其他类型（对象、数组）一律当缺少参数
function keyOf(value) {
  return (typeof value === 'string' || typeof value === 'number') ? String(value).trim() : ''
}

// 与 rows.js 的口径一致：先看有没有身份，再区分月结补零与真提交。
function fillStatusOf(row) {
  if (!row.bound) return 'unbound'
  if (row.zeroFilled) return 'zero-filled'
  if (row.submitted) return 'submitted'
  return 'not-submitted'
}

// 只用于排障：不记录 token 原文、账户 _id 或任何个人信息，只记录校验结果。
// 典型结论：
//   signatureValid=false + tokenExp 在未来 → 本函数的 WEB_TOKEN_SECRET 与签发方不一致
//   signatureValid=true + accountFound=false  → 票据不是本环境/本集合的老师账户
//   hasPassword=false                          → 账户密码被清掉，需要重新激活
async function logAuthFailure(event, secret) {
  const payload = verifyToken(event.token, secret)
  let raw = null
  try {
    const part = String(event.token || '').split('.')[0]
    raw = part ? JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) : null
  } catch (e) {
    raw = null
  }

  let accountFound = false
  let hasPassword = false
  if (payload) {
    const found = await db.collection('export_accounts').where({ _id: payload.sub }).limit(1).get()
    accountFound = !!found.data[0]
    hasPassword = !!(found.data[0] && found.data[0].webPasswordHash)
  }

  const tokenExp = raw && typeof raw.exp === 'number' ? raw.exp : null
  const now = Date.now()
  const suspicious =
    (tokenExp != null && tokenExp > now && !payload) ||   // 未过期却验签失败：多半是密钥不一致
    (payload != null && (!accountFound || !hasPassword)) // 验签成功但账户缺失/无密码

  if (suspicious) {
    console.warn('[webGetSubmissionDetail] auth-failed', JSON.stringify({
      hasToken: typeof event.token === 'string' && event.token.length > 0,
      signatureValid: !!payload,
      tokenExp,
      now,
      role: raw && raw.role ? raw.role : null,
      accountFound,
      hasPassword
    }))
  }
}

exports.main = async (event = {}) => {
  // 缺密钥时 requireExport 也会返回 null，和「票据过期」无法区分；
  // 这里先单独报配置错误，避免前端把部署遗漏误判成会话过期而退回登录页。
  const secret = readSecret(process.env)
  if (!secret) {
    return { ok: false, msg: '服务未配置签名密钥，请联系管理员' }
  }

  // 先验票据：未登录来源拿不到任何学生信息，也不会因为参数缺失得到不同提示。
  const account = await requireExport(event, db)
  if (!account) {
    await logAuthFailure(event, secret)
    return { ok: false, msg: '登录已过期，请重新登录' }
  }

  const formId = keyOf(event.formId)
  const studentId = keyOf(event.studentId)
  if (!formId || !studentId) return { ok: false, msg: '缺少表单或学助' }

  // 用 where 而不是 doc：表单被删除时返回业务错误，不让 SDK 异常冒到前端。
  const formRes = await db.collection('monthly_forms').where({ _id: formId }).limit(1).get()
  const form = formRes.data[0]
  if (!form) return { ok: false, msg: '表单不存在' }

  // 学号是名单的业务主键；重复属于数据异常，宁可拒绝也不能展示错人的明细。
  const stuRes = await db.collection('students').where({ studentId }).limit(2).get()
  if (!stuRes.data.length) return { ok: false, msg: '名单中未找到该学助' }
  if (stuRes.data.length > 1) return { ok: false, msg: '名单学号重复，无法定位该学助' }
  const student = stuRes.data[0]

  let sub = null
  if (student.openid) {
    // 正常情况下一名学生一个月只有一条；历史脏数据取最近更新的一条。
    const subRes = await db.collection('submissions')
      .where({ formId: form._id, openid: student.openid })
      .orderBy('updateTime', 'desc')
      .limit(1)
      .get()
    sub = subRes.data[0] || null
  }

  // 复用进度页同一份判定，避免详情与列表对「已提交/月结补零」各说一套。
  const [row] = buildRows([student], sub ? [sub] : [])
  return {
    ok: true,
    form: {
      _id: form._id,
      month: form.month,
      status: form.status,
      deadline: form.deadline || ''
    },
    ...buildSubmissionDetail(row, sub, fillStatusOf(row))
  }
}
