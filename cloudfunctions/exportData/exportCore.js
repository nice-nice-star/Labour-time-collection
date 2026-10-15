// 小程序导出汇总与明细；Web 统计表通过 projectDetails.js 复用明细结构。
const { DEPARTMENT_LABELS } = require('./constants')

const { projectDetails } = require('./projectDetails')

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
  const detailRows = projectDetails(submissions, departmentText)

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
