// cloudfunctions/bindStudent/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 网页端的口令哈希/盐只属于服务端凭据，不能随绑定结果下发。
function publicAccount(record) {
  const { webPasswordSalt, webPasswordHash, webPasswordSetAt, ...safe } = record
  return safe
}

// 临时网页身份：openidSource='web'，或手工填的 web: 前缀。
// 这类账户允许被真实微信接管，并迁移其历史提交。
function isWebIdentity(record) {
  if (!record || !record.openid) return false
  if (record.openidSource === 'web') return true
  return typeof record.openid === 'string' && record.openid.startsWith('web:')
}

// 把某个网页身份名下的提交迁移到真实 openid。
// 先取全量 id 再逐条更新：更新后记录会离开查询条件，边查边改会漏行。
async function migrateSubmissions(db, fromOpenid, toOpenid) {
  const ids = []
  const limit = 100
  for (let offset = 0; ; offset += limit) {
    const page = await db.collection('submissions')
      .where({ openid: fromOpenid }).orderBy('_id', 'asc').skip(offset).limit(limit).get()
    page.data.forEach(row => ids.push(row._id))
    if (page.data.length < limit) break
  }
  for (const id of ids) {
    await db.collection('submissions').doc(id).update({ data: { openid: toOpenid } })
  }
  return ids.length
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { name, studentId } = event
  if (!name || !studentId) return { ok: false, msg: '参数缺失' }

  // 1. 先判断是否为导出账户（姓名 + exportId 完全一致）
  const expRes = await db.collection('export_accounts')
    .where({ name, exportId: studentId })
    .get()

  if (expRes.data.length) {
    const exp = expRes.data[0]
    if (exp.openid && exp.openid !== OPENID) {
      return { ok: false, msg: '该账户已被其他微信绑定' }
    }
    await db.collection('export_accounts').doc(exp._id).update({
      data: { openid: OPENID, bindTime: db.serverDate() }
    })
    return { ok: true, role: 'export', user: { ...publicAccount(exp), openid: OPENID } }
  }

  // 2. 再判断是否为学助（姓名 + studentId 完全一致）
  const stuRes = await db.collection('students')
    .where({ name, studentId })
    .get()

  if (!stuRes.data.length) return { ok: false, msg: '姓名或ID不匹配，请联系老师' }

  const stu = stuRes.data[0]
  const webIdentity = isWebIdentity(stu)
  if (stu.openid && stu.openid !== OPENID && !webIdentity) {
    return { ok: false, msg: '该学助信息已被其他微信绑定' }
  }

  // 网页身份转正：先把历史提交迁到真实 openid，再改写名单。
  // 迁移失败时名单仍是 web 身份，学生可以重试；已迁走的记录不会再被查出来。
  const previousWebOpenid = webIdentity ? stu.openid : ''
  if (previousWebOpenid && previousWebOpenid !== OPENID) {
    await migrateSubmissions(db, previousWebOpenid, OPENID)
  }

  await db.collection('students').doc(stu._id).update({
    data: { openid: OPENID, openidSource: 'wechat', bindTime: db.serverDate() }
  })

  return {
    ok: true,
    role: 'student',
    user: { ...publicAccount({ ...stu, openid: OPENID, openidSource: 'wechat' }), openid: OPENID }
  }
}
