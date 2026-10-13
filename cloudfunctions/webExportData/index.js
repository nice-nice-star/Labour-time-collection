// cloudfunctions/webExportData/index.js
// Web 管理端：导出某月的工时统计表 xlsx，返回限时下载链接。
// 权限只来自 event.token（见 webauth.js），本函数不读调用方环境身份。
const cloud = require('wx-server-sdk')
const { requireExport } = require('./webauth')
const { buildPivot } = require('./pivot')
const { renderWorkbook } = require('./workbook')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE = 100

// 分页取全量，避免平台单次读取上限截断名单或提交（与 webGetSubmissions 同一套路）
async function getAll(name, where) {
  const out = []
  for (let skip = 0; ; skip += PAGE) {
    const query = where ? db.collection(name).where(where) : db.collection(name)
    const res = await query.skip(skip).limit(PAGE).get()
    out.push(...res.data)
    if (res.data.length < PAGE) return out
  }
}

exports.main = async (event = {}) => {
  const { formId } = event
  if (!formId) return { ok: false, msg: '缺少表单' }

  const account = await requireExport(event, db)
  if (!account) return { ok: false, msg: '登录已过期，请重新登录' }

  const form = (await db.collection('monthly_forms').doc(formId).get()).data
  // 统计表要列全名单（含未绑定的人），所以名单与提交都要取
  const [submissions, students] = await Promise.all([
    getAll('submissions', { formId }),
    getAll('students')
  ])

  // 版式在 pivot.js（纯逻辑，进度口径与「填报情况」页同源），
  // 画表格在 workbook.js（exceljs）；这里只负责取数、生成与上传。
  const model = buildPivot({ form, students, submissions, now: new Date() })
  const buffer = await renderWorkbook(model)

  const upload = await cloud.uploadFile({
    cloudPath: `exports/${model.filename}`,
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
    filename: model.filename
  }
}
