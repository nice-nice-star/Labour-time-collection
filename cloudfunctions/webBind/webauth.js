// Web 端（未登录模式）自建凭据：口令哈希 + 会话签名。
//
// 云函数不能跨目录 require，所以本文件在每个 web* 云函数目录下各存一份副本，
// npm test 会校验各副本逐字节一致（与 constants.js 同一套路）。
//
// ⚠️ 本模块只处理「自建凭据」，不读取任何调用方身份。
// web* 云函数绝不能调用 cloud.getWXContext()：未登录模式下它是云函数进程里
// 残留的上一位微信调用者身份，读了就等于把老师权限交给匿名访客。

const crypto = require('crypto')

const KEY_LEN = 64
const SALT_LEN = 16
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000   // 会话 12 小时

// 票据里的角色。老师与学助共用同一把签名密钥，靠 role 区分；
// 数据接口再按角色去各自集合取账户——学助票据绝不能进老师函数。
const ROLES = { EXPORT: 'export', STUDENT: 'student' }
const COLLECTIONS = { export: 'export_accounts', student: 'students' }

// 签名密钥取自云函数环境变量。拿不到就返回空串，由调用方拒绝服务——
// 绝不退回硬编码默认值，否则签名形同虚设。
function readSecret(env) {
  const secret = (env || {}).WEB_TOKEN_SECRET
  return (typeof secret === 'string' && secret.length >= 16) ? secret : ''
}

// 临时开关：未绑定微信的学助能否用网页身份提交。
// 打开后 webSubmitForm 会在首次提交时写入 web:<students._id> + openidSource:'web'，
// 之后在小程序绑定真实微信时由 bindStudent 迁移历史提交。
// 默认关闭；取不到、空值或不是 true 都按关闭处理。
function allowUnboundWeb(env) {
  return String((env || {}).WEB_ALLOW_UNBOUND || '').trim().toLowerCase() === 'true'
}

function newSalt() {
  return crypto.randomBytes(SALT_LEN).toString('hex')
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), KEY_LEN).toString('hex')
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  if (x.length !== y.length) return false
  return crypto.timingSafeEqual(x, y)
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false
  return safeEqual(hashPassword(password, salt), expectedHash)
}

function encode(value) {
  return Buffer.from(value).toString('base64url')
}

// 无状态会话票据：base64url(JSON) . base64url(HMAC-SHA256)
// role 参与签名：改票据里的 role 会直接验签失败，不能靠改客户端状态提权。
function signToken(subject, secret, role = ROLES.EXPORT, now = Date.now()) {
  const body = encode(JSON.stringify({ sub: String(subject), role, exp: now + TOKEN_TTL_MS }))
  const sig = encode(crypto.createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

// 验签通过返回 { sub, role, exp }，否则 null。过期、篡改、换密钥、格式不对都走这里。
// 旧票据没有 role 字段，按老师处理（升级前只签发过老师票据），避免所有人被强制下线。
function verifyToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const expected = encode(crypto.createHmac('sha256', secret).update(parts[0]).digest())
  if (!safeEqual(parts[1], expected)) return null
  let body
  try {
    body = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch (e) {
    return null
  }
  if (!body || typeof body.sub !== 'string' || !body.sub) return null
  if (body.role != null && body.role !== ROLES.EXPORT && body.role !== ROLES.STUDENT) return null
  if (typeof body.exp !== 'number' || !Number.isFinite(body.exp) || now >= body.exp) return null
  const role = body.role === ROLES.STUDENT ? ROLES.STUDENT : ROLES.EXPORT
  return { sub: body.sub, role, exp: body.exp }
}

// 拿 event.token 换账户：验签 → 按 role 选集合 → 账户还在且仍持密码。
// 密钥缺失、票据非法、账户不存在或被清了密码，一律当作未登录——外部只看到一种结果。
async function requireAccount(event, db) {
  const secret = readSecret(process.env)
  if (!secret) return null
  const payload = verifyToken((event || {}).token, secret)
  if (!payload) return null
  // 用 where 而不是 doc：账户被删除时返回未登录，而不是抛异常
  const res = await db.collection(COLLECTIONS[payload.role]).where({ _id: payload.sub }).limit(1).get()
  const account = res.data[0]
  if (!account || !account.webPasswordHash) return null
  return { role: payload.role, account }
}

// 老师数据接口的统一入口。必须显式校验 role：学助票据的 sub 万一与某条
// export_accounts 的 _id 相同，只靠「查不到账户」是挡不住的。
async function requireExport(event, db) {
  const found = await requireAccount(event, db)
  return found && found.role === ROLES.EXPORT ? found.account : null
}

// 学助数据接口的统一入口（webGetForm / webSubmitForm），同样只认 role=student。
async function requireStudent(event, db) {
  const found = await requireAccount(event, db)
  return found && found.role === ROLES.STUDENT ? found.account : null
}

module.exports = {
  ROLES, readSecret, allowUnboundWeb, newSalt, hashPassword, verifyPassword,
  signToken, verifyToken, requireAccount, requireExport, requireStudent, TOKEN_TTL_MS
}
