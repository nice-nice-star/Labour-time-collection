// 导出报表的全部纯逻辑：给定表单与提交记录，产出工作表数据与文件名。
//
// 抽出来的理由：小程序端（exportData）和 Web 端（webExportData）必须导出**完全一样**的
// 表格。云函数不能跨目录 require，所以本文件在两处各存一份副本，npm test 会校验逐字节一致，
// 并用同一份数据比对两边的产物是否相同。
const { hoursOfRow, DEPARTMENT_LABELS } = require('./constants')

function pad(n) { return String(n).padStart(2, '0') }

// 查不到的写法（该列上线前的历史记录、已从枚举里移除的旧部门）原样输出，不静默清空，方便人工发现。
function departmentText(value) {
  if (!value) return ''
  return Object.prototype.hasOwnProperty.call(DEPARTMENT_LABELS, value)
    ? DEPARTMENT_LABELS[value]
    : value
}

// 主表：每人一行，不放第四题明细，明细见「项目明细」工作表
// 表头：姓名 | 部门 | 有效工时 | 值班总工时 | 值班时段 | 值班地点 | 项目名称 | 额外工时申诉
// 部门紧跟姓名；「值班总工时」到「额外工时申诉」依次对应表单第 1–6 题
function buildSheets(form, submissions, now = new Date()) {
  const rows = [['姓名', '部门', '有效工时', '值班总工时', '值班时段', '值班地点', '项目名称', '额外工时申诉']]

  // 明细表：每人每个申报项目一行（计数全 0 的行不写），可直接排序/求和或做透视
  const detailRows = [['姓名', '部门', '项目', '参与数', '统筹数', '折算工时']]

  ;(submissions || []).forEach(s => {
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

  return {
    filename: `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}学助工时明细.xlsx`,
    sheets: [
      { name: form.month, data: rows },
      { name: '项目明细', data: detailRows }
    ]
  }
}

module.exports = { buildSheets, departmentText, pad }
