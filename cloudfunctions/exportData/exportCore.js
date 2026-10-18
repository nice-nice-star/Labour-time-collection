// 小程序端导出：两张表。
//   1) 月度汇总（工作表名 = 表单月份）：名单驱动，一人一行，含未提交/未绑定；
//   2) 项目明细：一条逐项申报一行。
// 版式是纯逻辑，测试直接断言行内容；画成 xlsx 由 index.js 负责。
const { DEPARTMENT_LABELS, resolveDepartment } = require('./constants')
const { projectDetails } = require('./projectDetails')

const SUMMARY_HEADERS = ['姓名', '学号', '部门', '值班工时', '项目折算工时', '总工时', '有效工时', '项目条数', '已发布', '已完成未发布', '未完成', '实际耗时合计', '填报状态', '额外工时申诉']

const STATUS = { PUBLISHED: '已发布', UNPUBLISHED: '已完成未发布', UNFINISHED: '未完成' }
const FILL = { SUBMITTED: '已提交', ZERO: '月结补零', PENDING: '未提交', UNBOUND: '未绑定' }

function pad(n) { return String(n).padStart(2, '0') }

// 部门规范值 → 中文名；查不到的写法原样输出，不静默清空。
function departmentText(value) {
  if (!value) return ''
  return Object.prototype.hasOwnProperty.call(DEPARTMENT_LABELS, value) ? DEPARTMENT_LABELS[value] : value
}

// 名单原值可能是 ' administration_and_data ' 这类写法：先归一化再转中文名。
// 枚举外的旧值（含已从枚举移除的部门）原样输出，方便人工发现。
function departmentOf(value) {
  const resolved = resolveDepartment(value)
  return departmentText(resolved || value)
}

function projectStats(projects) {
  const stats = {
    total: 0,
    actualHours: 0,
    statuses: { [STATUS.PUBLISHED]: 0, [STATUS.UNPUBLISHED]: 0, [STATUS.UNFINISHED]: 0 }
  }
  ;(projects || []).forEach(p => {
    stats.total += 1
    stats.actualHours += Number(p.actualHours) || 0
    if (stats.statuses[p.status] != null) stats.statuses[p.status] += 1
  })
  return stats
}

// 名单 + 提交 → 汇总项。未绑定/未提交也出行；已提交与月结补零按数字写。
function rosterOf(students, submissions) {
  const byOpenid = new Map((submissions || []).filter(s => s.openid).map(s => [s.openid, s]))
  const items = (students || []).map(stu => {
    const sub = stu.openid ? byOpenid.get(stu.openid) || null : null
    return {
      name: stu.name,
      studentId: stu.studentId,
      bound: !!stu.openid,
      // 提交过的取提交时快照；未提交的退回当前名单值（与「填报情况」页口径一致）
      department: (sub && sub.department) || stu.department || '',
      sub
    }
  })
  // 名单外仍存在的提交记录也要出现，避免导出丢数据
  const known = new Set((students || []).map(stu => stu.openid).filter(Boolean))
  ;(submissions || []).forEach(sub => {
    if (sub.openid && known.has(sub.openid)) return
    items.push({ name: sub.name, studentId: sub.studentId, bound: true, department: sub.department || '', sub })
  })
  return items.sort((a, b) =>
    departmentOf(a.department).localeCompare(departmentOf(b.department), 'zh') ||
    String(a.name).localeCompare(String(b.name), 'zh'))
}

function summaryRow(item) {
  const department = departmentOf(item.department)
  if (!item.sub) {
    return [
      item.name, item.studentId, department,
      '', '', '', '', '', '', '', '', '',
      item.bound ? FILL.PENDING : FILL.UNBOUND, ''
    ]
  }
  const sub = item.sub
  const calc = sub.calc || {}
  const answers = sub.answers || {}
  const stats = projectStats(sub.projects)
  return [
    item.name,
    item.studentId,
    department,
    Number(calc.dutyHours) || 0,
    Number(calc.projectHours) || 0,
    Number(calc.totalHours) || 0,
    Number(calc.effectiveHours) || 0,
    stats.total,
    stats.statuses[STATUS.PUBLISHED],
    stats.statuses[STATUS.UNPUBLISHED],
    stats.statuses[STATUS.UNFINISHED],
    stats.actualHours,
    sub.source === 'auto-zero' ? FILL.ZERO : FILL.SUBMITTED,
    answers.answer6 || ''
  ]
}

/**
 * @param {object} form 月度表单（用 month 作工作表名）
 * @param {object[]} submissions 该月提交记录（含月结补零）
 * @param {object[]} students 名单（用于补齐未提交/未绑定的人）
 * @param {Date} now 文件名里的日期
 */
function buildSheets(form, submissions, students = [], now = new Date()) {
  const roster = rosterOf(students, submissions)
  return {
    filename: `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}学助工时明细.xlsx`,
    sheets: [
      { name: form.month, data: [SUMMARY_HEADERS, ...roster.map(summaryRow)] },
      { name: '项目明细', data: projectDetails(submissions, departmentOf) }
    ]
  }
}

module.exports = {
  buildSheets,
  departmentText,
  departmentOf,
  pad,
  SUMMARY_HEADERS,
  STATUS,
  FILL
}
