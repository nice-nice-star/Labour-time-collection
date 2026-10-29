// 云函数各自部署，submitForm / exportData / webExportData 保留本模块的相同副本。
const { rateOf } = require('./constants')

const STATUS_WEIGHTS = { '未完成': 0.2, '已完成未发布': 0.5, '已发布': 1 }
const ROLE_WEIGHTS = { coordinator: 1, participant: 0.3 }
const roundHours = value => Math.round(value * 1e8) / 1e8

function projectHours(project) {
  const rate = rateOf(project.key, project.role)
  if (rate == null) return null
  if (!Object.prototype.hasOwnProperty.call(STATUS_WEIGHTS, project.status) ||
      !Object.prototype.hasOwnProperty.call(ROLE_WEIGHTS, project.role)) return null
  return roundHours(rate * STATUS_WEIGHTS[project.status] * ROLE_WEIGHTS[project.role])
}

// 原始条数仍保留在 projectRows；状态权重必须从每条 projects 明细计算。
function weightedHoursByKey(projects) {
  const result = new Map()
  ;(projects || []).forEach(project => {
    const hours = projectHours(project)
    if (hours != null) result.set(project.key, roundHours((result.get(project.key) || 0) + hours))
  })
  return result
}

module.exports = { STATUS_WEIGHTS, ROLE_WEIGHTS, roundHours, projectHours, weightedHoursByKey }
