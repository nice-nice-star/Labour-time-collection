const { PROJECT_HOURS } = require('../config/constants')

/**
 * 工时计算（与云端保持一致）
 * @param {number} dutyHours 值班总工时
 * @param {Array<{item:string,count:number}>} projectRows 项目工时统计
 * @param {boolean} isSupervisor 是否主管
 * @returns {{dutyHours:number, projectHours:number, totalHours:number, effectiveHours:number}}
 */
function calcHours(dutyHours, projectRows, isSupervisor) {
  const duty = Number(dutyHours) || 0
  let project = 0
  ;(projectRows || []).forEach(r => {
    const rate = PROJECT_HOURS[r.item]
    if (rate == null) return            // 待定项目不计入
    project += rate * (Number(r.count) || 0)
  })
  let total = duty + project
  if (isSupervisor) total = total * 1.5 // 学生主管 ×1.5
  const effective = Math.max(40, total) // 有效工时 = max(40, 总工时)
  return { dutyHours: duty, projectHours: project, totalHours: total, effectiveHours: effective }
}

module.exports = { calcHours }
