// cloudfunctions/webSession/index.js
// 用会话票据换取老师或学助身份，供网页刷新后恢复登录态。
// 身份只来自 event.token 的签名（含 role），绝不读 cloud.getWXContext()。
const cloud = require('wx-server-sdk')
const { requireAccount, ROLES } = require('./webauth')
const { departmentText } = require('./departments')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 与 webLogin 同一份载荷：刷新页面后默认选中本部门的筛选才不会丢
function exportUser(account) {
  const department = String(account.department || '').trim()
  return {
    name: account.name,
    exportId: account.exportId,
    department,
    departmentText: department ? departmentText(department) : ''
  }
}

// 与 webStudentLogin 同一份载荷
function studentUser(account) {
  const department = String(account.department || '').trim()
  return {
    name: account.name,
    studentId: account.studentId,
    isSupervisor: !!account.isSupervisor,
    department,
    departmentText: department ? departmentText(department) : ''
  }
}

exports.main = async (event = {}) => {
  const found = await requireAccount(event, db)
  if (!found) return { ok: false, msg: '登录已过期，请重新登录' }
  return {
    ok: true,
    role: found.role,
    user: found.role === ROLES.STUDENT ? studentUser(found.account) : exportUser(found.account)
  }
}
