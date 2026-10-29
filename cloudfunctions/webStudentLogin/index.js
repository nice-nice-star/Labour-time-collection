// cloudfunctions/webStudentLogin/index.js
// 学助网页端登录：校验自建口令，签发 role=student 的会话票据。
// 身份只来自姓名 + 学号 + 密码，绝不读 cloud.getWXContext()。
const cloud = require('wx-server-sdk')
const { readSecret, verifyPassword, signToken, ROLES } = require('./webauth')
const { departmentText } = require('./departments')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const { name, studentId, password } = event
  if (!name || !studentId || typeof password !== 'string' || !password) {
    return { ok: false, msg: '请填写姓名、学号与密码' }
  }

  const secret = readSecret(process.env)
  if (!secret) return { ok: false, msg: '服务未配置签名密钥，请联系管理员' }

  const res = await db.collection('students').where({ name, studentId }).get()
  const account = res.data[0]

  // 账户不存在、未激活、密码错误一律回同一句话，避免被拿来枚举账户
  const denied = { ok: false, msg: '姓名、学号或密码不正确' }
  if (!account || !account.webPasswordHash) return denied
  if (!verifyPassword(password, account.webPasswordSalt, account.webPasswordHash)) return denied

  // 部门只作展示/后续默认筛选用；学助身份与主管倍率仍以服务端名单为准。
  const department = String(account.department || '').trim()
  return {
    ok: true,
    role: ROLES.STUDENT,
    token: signToken(account._id, secret, ROLES.STUDENT),
    user: {
      name: account.name,
      studentId: account.studentId,
      isSupervisor: !!account.isSupervisor,
      department,
      departmentText: department ? departmentText(department) : ''
    }
  }
}
