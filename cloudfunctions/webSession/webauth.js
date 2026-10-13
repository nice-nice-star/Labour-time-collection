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

// 签名密钥取自云函数环境变量。拿不到就返回空串，由调用方拒绝服务——
// 绝不退回硬编码默认值，否则签名形同虚设。
function readSecret(env) {
  const secret = (env || {}).WEB_TOKEN_SECRET
  return (typeof secret === 'string' && secret.length >= 16) ? secret : ''
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
function signToken(subject, secret, now = Date.now()) {
  const body = encode(JSON.stringify({ sub: String(subject), exp: now + TOKEN_TTL_MS }))
  const sig = encode(crypto.createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

// 验签通过返回 { sub, exp }，否则 null。过期、篡改、换密钥、格式不对都走这里。
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
  if (typeof body.exp !== 'number' || !Number.isFinite(body.exp) || now >= body.exp) return null
  return { sub: body.sub, exp: body.exp }
}

module.exports = { readSecret, newSalt, hashPassword, verifyPassword, signToken, verifyToken, TOKEN_TTL_MS }
