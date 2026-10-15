// cloudfunctions/exportData/index.js
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')
const { buildSheets } = require('./exportCore')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { formId } = event

  // 权限校验：导出账户。没有 openid 直接拒绝——未登录模式下的匿名调用会走到这里。
  if (!OPENID) return { ok: false, msg: '未登录' }
  const exp = await db.collection('export_accounts').where({ openid: OPENID }).get()
  if (!exp.data.length) return { ok: false, msg: '无权限' }

  const fRes = await db.collection('monthly_forms').doc(formId).get()
  const form = fRes.data

  const subs = await db.collection('submissions')
    .where({ formId }).orderBy('name', 'asc').get()

  // 表格怎么长：纯逻辑在 exportCore.js，项目明细结构与 Web 端一致
  const { filename, sheets } = buildSheets(form, subs.data, new Date())
  const buffer = xlsx.build(sheets)

  const upload = await cloud.uploadFile({
    cloudPath: `exports/${filename}`,
    fileContent: buffer
  })

  // 临时下载链接（2 小时有效）
  const urlRes = await cloud.getTempFileURL({
    fileList: [upload.fileID]
  })

  return {
    ok: true,
    fileID: upload.fileID,
    url: urlRes.fileList[0].tempFileURL,
    filename
  }
}
