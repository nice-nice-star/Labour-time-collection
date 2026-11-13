// 导出时重算工时：不读 submissions.calc 快照。
//
// submissions.calc 是提交那一刻算好的结果。费率表调整后，旧提交的汇总工时
// 不会自己更新，导出里会出现「项目折算工时」与 14 个项目列对不上的情况。
// 导出是结算口径，所以按当前费率表从原始填报重算；数据库里的提交记录保持原样。
//
// 口径：
//   - projects[]：逐条按 费率 × 完成状态系数 × 分工系数 加权；
//   - projectRows / legacyProjectRows：旧版只有数量，没有完成状态；
//     按「已发布」状态折算，并乘分工系数，不能直接 counts × 费率（那是数量，不是工时）；
//   - 值班工时取 answers.answer1；
//   - 主管先 ×1.5，再按 40 小时封顶。
//
// 云函数不能跨目录 require：exportData、webExportData 与 webGetSubmissionDetail
// 各存一份，npm test 校验三份逐字节一致。
const { rateOf } = require('./constants')
const { weightedHoursByKey, roundHours, STATUS_WEIGHTS, ROLE_WEIGHTS } = require('./project-weighting')

const ROLES = ['participant', 'coordinator']
// 旧版计数没有完成状态；历史数据默认都是已发布产出。
const LEGACY_STATUS = '已发布'

function numberOrZero(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// 有 projects[] 时 projectRows 是它的汇总计数，再算一次会重复；
// 只有旧记录（没有 projects[]）才把 projectRows 当计数用。
function legacyRowsOf(sub) {
  return Array.isArray(sub && sub.projects)
    ? ((sub && sub.legacyProjectRows) || [])
    : ((sub && sub.projectRows) || [])
}

// 旧版一行 counts → 折算工时。没有费率的项目返回 null（按实际项目只在 projects[] 里按 actualHours 计入）。
function legacyHoursOfRow(row) {
  const counts = (row && row.counts) || {}
  let total = 0
  let known = false
  ROLES.forEach(role => {
    const rate = rateOf(row.key, role)
    if (rate == null) return
    known = true
    total += rate * STATUS_WEIGHTS[LEGACY_STATUS] * ROLE_WEIGHTS[role] * numberOrZero(counts[role])
  })
  return known ? total : null
}

function legacyHoursOf(rows) {
  let total = 0
  ;(rows || []).forEach(row => {
    if (!row) return
    const hours = legacyHoursOfRow(row)
    if (hours != null) total += hours
  })
  return total
}

/**
 * 每人每类项目的折算工时，供 Web 统计表的 14 个项目列使用。
 * 与 recalcHours 的 projectHours 同一口径：新旧两类输入都算进来。
 * @param {object} sub submissions 记录
 * @returns {Map<string, number>}
 */
function projectHoursByKey(sub) {
  const hasProjects = Array.isArray(sub && sub.projects)
  const map = weightedHoursByKey(hasProjects ? sub.projects : [])
  legacyRowsOf(sub).forEach(row => {
    if (!row) return
    const hours = legacyHoursOfRow(row)
    if (hours == null) return
    map.set(row.key, roundHours((map.get(row.key) || 0) + hours))
  })
  return map
}

function storedCalc(sub) {
  const calc = (sub && sub.calc) || {}
  return {
    dutyHours: numberOrZero(calc.dutyHours),
    projectHours: numberOrZero(calc.projectHours),
    totalHours: numberOrZero(calc.totalHours),
    effectiveHours: numberOrZero(calc.effectiveHours),
    projectHoursByKey: new Map()
  }
}

/**
 * 按当前费率表重算一条提交的汇总工时。
 * 缺少原始填报的老记录退回 calc 快照，避免整行被清成 0。
 * @param {object} sub submissions 记录
 * @param {boolean} [isSupervisor] 缺省读 sub.isSupervisor
 * @returns {{dutyHours:number, projectHours:number, totalHours:number,
 *            effectiveHours:number, projectHoursByKey:Map<string, number>}}
 */
function recalcHours(sub, isSupervisor) {
  const stored = storedCalc(sub)
  if (!sub) return stored

  const hasDutyInput = !!(sub.answers && sub.answers.answer1 != null)
  // 空数组不算「有项目输入」：老记录可能只有 calc 快照，不能因为一个空
  // projectRows 就把已存的折算工时清成 0。显式的 projects: [] 仍算输入
  // （新版表单允许清空项目），所以这里单独判断 projects。
  const hasProjectInput = Array.isArray(sub.projects) ||
    (Array.isArray(sub.projectRows) && sub.projectRows.length > 0) ||
    (Array.isArray(sub.legacyProjectRows) && sub.legacyProjectRows.length > 0)
  if (!hasDutyInput && !hasProjectInput) return stored

  const supervisor = isSupervisor == null ? !!sub.isSupervisor : !!isSupervisor
  const duty = hasDutyInput ? numberOrZero(sub.answers.answer1) : stored.dutyHours

  let project = stored.projectHours
  if (hasProjectInput) {
    project = legacyHoursOf(legacyRowsOf(sub))
    weightedHoursByKey(Array.isArray(sub.projects) ? sub.projects : []).forEach(hours => {
      project += hours
    })
    project = roundHours(project)
  }

  let total = duty + project
  if (supervisor) total *= 1.5
  total = roundHours(total)

  return {
    dutyHours: duty,
    projectHours: project,
    totalHours: total,
    effectiveHours: Math.min(40, total),
    projectHoursByKey: hasProjectInput ? projectHoursByKey(sub) : new Map()
  }
}

module.exports = { recalcHours, projectHoursByKey, legacyRowsOf, legacyHoursOfRow }
