const { rateOf } = require('../config/constants')

/**
 * 工时计算（与云端保持一致）
 * @param {number} dutyHours 值班总工时
 * @param {Array<{key:string,counts:{participant:number,coordinator:number}}>} projectRows 项目工时统计（按稳定键，参与/统筹分别计数）
 * @param {boolean} isSupervisor 是否学生主管
 * @returns {{dutyHours:number, projectHours:number, totalHours:number, effectiveHours:number}}
 */
function calcHours(dutyHours, projectRows, isSupervisor) {
  const duty = Number(dutyHours) || 0
  let project = 0
  ;(projectRows || []).forEach(r => {
    const counts = (r && r.counts) || {}
    // 单值项目只开放参与，rateOf 对统筹返回 null，乘出来仍是 0
    ;['participant', 'coordinator'].forEach(role => {
      const rate = rateOf(r.key, role)
      if (rate == null) return             // 待定或该项目不开放此角色
      project += rate * (Number(counts[role]) || 0)
    })
  })
  let total = duty + project
  if (isSupervisor) total = total * 1.5 // 学生主管 ×1.5
  const effective = Math.min(40, total) // 有效工时最多为 40 小时；主管倍率先于封顶计算
  return { dutyHours: duty, projectHours: project, totalHours: total, effectiveHours: effective }
}

module.exports = { calcHours }
