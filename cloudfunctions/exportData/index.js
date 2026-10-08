// cloudfunctions/exportData/index.js
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')
const { hoursOfRow } = require('./constants')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function pad(n) { return String(n).padStart(2, '0') }

// 部门规范值 → 导出用的中文名。取值来自 submissions.department（提交时或月结补零时归一化过的快照）。
// 查不到的写法（该列上线前的历史记录、已从枚举里移除的旧部门）原样输出，不静默清空，方便人工发现。
const DEPARTMENT_LABELS = {
  Public_Relations: '公共关系',
  Domestic_social_Media: '国内社媒',
  Multimedia_center: '多媒体中心',
  Journalist_News_Center: '大学新闻中心记者',
  Overseas_social_Media: '海外社媒',
  University_Gift_shop: '纪念品商店',
  Administration_and_Data: '行政与数据',
  Magazine_publisher: '神仙湖畔杂志社'
}

function departmentText(value) {
  if (!value) return ''
  return Object.prototype.hasOwnProperty.call(DEPARTMENT_LABELS, value)
    ? DEPARTMENT_LABELS[value]
    : value
}

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

  // 主表：每人一行，不放第四题明细，明细见「项目明细」工作表
  // 表头：姓名 | 部门 | 有效工时 | 值班总工时 | 值班时段 | 值班地点 | 项目名称 | 额外工时申诉
  // 部门紧跟姓名；「值班总工时」到「额外工时申诉」依次对应表单第 1–6 题
  const header = ['姓名', '部门', '有效工时', '值班总工时', '值班时段', '值班地点', '项目名称', '额外工时申诉']
  const rows = [header]

  // 明细表：每人每个申报项目一行（计数全 0 的行不写），可直接排序/求和或做透视
  const detailHeader = ['姓名', '部门', '项目', '参与数', '统筹数', '折算工时']
  const detailRows = [detailHeader]

  subs.data.forEach(s => {
    const department = departmentText(s.department)

    rows.push([
      s.name,
      // 部门：提交时（未提交者为月结补零时）写下的名单快照
      department,
      s.calc.effectiveHours,
      s.answers.answer1,
      s.answers.answer2,
      s.answers.answer3,
      s.answers.answer5,
      s.answers.answer6
    ])

    ;(s.projectRows || []).forEach(r => {
      const counts = r.counts || {}
      const participant = Number(counts.participant) || 0
      const coordinator = Number(counts.coordinator) || 0
      if (!participant && !coordinator) return   // 表单按模板整表提交，未申报的项目不写进明细
      const hours = hoursOfRow(r.key, counts)
      detailRows.push([
        s.name,
        department,
        r.label || r.key,
        participant,
        coordinator,
        // 按实际/待定的项目没有费率：留空，不写成 0，避免被误读成"没有工时"
        hours == null ? '' : hours
      ])
    })
  })

  const now = new Date()
  const filename = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}学助工时明细.xlsx`
  const buffer = xlsx.build([
    { name: form.month, data: rows },
    { name: '项目明细', data: detailRows }
  ])

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
