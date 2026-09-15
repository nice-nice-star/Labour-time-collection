// cloudfunctions/exportData/index.js
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function pad(n) { return String(n).padStart(2, '0') }

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { formId } = event

  // 权限校验：导出账户
  const exp = await db.collection('export_accounts').where({ openid: OPENID }).get()
  if (!exp.data.length) return { ok: false, msg: '无权限' }

  const fRes = await db.collection('monthly_forms').doc(formId).get()
  const form = fRes.data

  const subs = await db.collection('submissions')
    .where({ formId }).orderBy('name', 'asc').get()

  // 表头：Name | 有效工时 | Answer1..Answer6（与 README 一致）
  const header = ['Name', '有效工时', 'Answer1', 'Answer2', 'Answer3', 'Answer4', 'Answer5', 'Answer6']
  const rows = [header]

  subs.data.forEach(s => {
    rows.push([
      s.name,
      s.calc.effectiveHours,
      s.answers.answer1,
      s.answers.answer2,
      s.answers.answer3,
      JSON.stringify(s.projectRows || []),   // 第四题表格数值题，用 JSON 序列化
      s.answers.answer5,
      s.answers.answer6
    ])
  })

  const now = new Date()
  const filename = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}.xlsx`
  const buffer = xlsx.build([{ name: form.month, data: rows }])

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
