const { hoursOfRow } = require('./constants')
const HEADERS = ['姓名', '部门', '项目类型', '项目名称', '项目分工', '完成情况', '完成形式', '实际完成时间（hrs）', '参与数', '统筹数', '折算工时']
function projectDetails(submissions, departmentText) {
  const rows = [HEADERS]
  ;(submissions || []).forEach(s => {
    const base = [s.name, departmentText(s.department)]
    ;(s.projects || []).forEach(p => {
      const counts = { participant: p.role === 'participant' ? 1 : 0, coordinator: p.role === 'coordinator' ? 1 : 0 }
      const hours = hoursOfRow(p.key, counts)
      rows.push([...base, p.label || p.key, p.name, p.role === 'coordinator' ? '统筹' : '参与', p.status, p.completionForm, p.actualHours, counts.participant, counts.coordinator, hours == null ? '' : hours])
    })
    const legacy = Array.isArray(s.projects) ? s.legacyProjectRows || [] : s.projectRows || []
    legacy.forEach(r => {
      const counts = r.counts || {}
      if (!counts.participant && !counts.coordinator) return
      const hours = hoursOfRow(r.key, counts)
      rows.push([...base, r.label || r.key, '', '', '', '', '', Number(counts.participant) || 0, Number(counts.coordinator) || 0, hours == null ? '' : hours])
    })
  })
  return rows
}
module.exports = { projectDetails, HEADERS }
