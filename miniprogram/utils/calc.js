const { weightedHoursByKey, legacyHoursOfRow, roundHours } = require('../config/project-weighting')

/**
 * 工时计算（与云端保持一致）
 * @param {number} dutyHours 值班总工时
 * @param {Array<{key:string,counts:{participant:number,coordinator:number}}>} projectRows 旧版计数；逐项填报时只传 legacyProjectRows，避免重复计算
 * @param {boolean} isSupervisor 是否学生主管
 * @param {Array} projects 逐项填报明细，按完成状态与分工加权
 * @returns {{dutyHours:number, projectHours:number, totalHours:number, effectiveHours:number}}
 */
function calcHours(dutyHours, projectRows, isSupervisor, projects = []) {
  const duty = Number(dutyHours) || 0
  let project = (projectRows || []).reduce((sum, row) => sum + (legacyHoursOfRow(row) || 0), 0)
  weightedHoursByKey(projects).forEach(hours => { project += hours })
  project = roundHours(project)
  let total = duty + project
  if (isSupervisor) total = total * 1.5 // 学生主管 ×1.5
  total = roundHours(total)
  const effective = Math.min(40, total) // 有效工时最多为 40 小时；主管倍率先于封顶计算
  return { dutyHours: duty, projectHours: project, totalHours: total, effectiveHours: effective }
}

module.exports = { calcHours }
