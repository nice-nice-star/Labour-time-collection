// 项目明细与折算计数分开保存；实际耗时只作记录，完成状态与分工系数在 project-weighting.js 中参与折算。
const { PROJECT_ROWS, normalizeProjectRows } = require('./constants')
const STATUS_OPTIONS = ['已发布', '已完成未发布', '未完成']
function normalizeProjects(projects) {
  if (!Array.isArray(projects)) throw new Error('项目列表格式错误')
  return projects.map((p, i) => {
    const type = p && PROJECT_ROWS.find(r => r.key === p.key)
    const text = value => typeof value === 'string' ? value.trim() : ''
    if (!type || !text(p.name) || !['coordinator', 'participant'].includes(p.role) ||
        !STATUS_OPTIONS.includes(p.status) || !text(p.completionForm) ||
        !['string', 'number'].includes(typeof p.actualHours) || String(p.actualHours).trim() === '' ||
        !Number.isFinite(Number(p.actualHours)) || Number(p.actualHours) < 0) {
      throw new Error('请完整填写项目' + (i + 1) + '，实际完成时间须为非负数')
    }
    return { key: type.key, label: type.label, name: text(p.name), role: p.role,
      status: p.status, completionForm: text(p.completionForm), actualHours: Number(p.actualHours) }
  })
}
function projectCounts(projects, legacyRows = []) {
  const rows = normalizeProjectRows(legacyRows.concat(projects.map(p => ({ key: p.key, counts: { [p.role]: 1 } }))))
  const byKey = new Map()
  rows.forEach(r => {
    if (!byKey.has(r.key)) byKey.set(r.key, { key: r.key, label: r.label, counts: { participant: 0, coordinator: 0 } })
    const counts = byKey.get(r.key).counts
    counts.participant += r.counts.participant
    counts.coordinator += r.counts.coordinator
  })
  return Array.from(byKey.values())
}
module.exports = { STATUS_OPTIONS, normalizeProjects, projectCounts }
