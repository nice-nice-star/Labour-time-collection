// 「项目明细」工作表：一条逐项申报一行（新版表单）。
// 旧版「按类型填数量」的记录不再处理——业务上已确认不存在历史数据。
const { projectHours, roundHours } = require('./project-weighting')

const HEADERS = ['姓名', '学号', '部门', '项目类型', '项目名称', '项目分工', '完成情况', '完成形式', '实际完成时间（hrs）', '参与数', '统筹数', '折算工时', '实际−折算']

const ROLE_TEXT = { coordinator: '统筹', participant: '参与' }

// 一条申报只代表一个角色，所以计数恒为 (1,0) 或 (0,1)；保留这两列便于在 Excel 里直接求和。
function countsOf(role) {
  return { participant: role === 'participant' ? 1 : 0, coordinator: role === 'coordinator' ? 1 : 0 }
}

function projectDetails(submissions, departmentText) {
  const rows = [HEADERS]
  ;(submissions || []).forEach(s => {
    ;(s.projects || []).forEach(p => {
      const counts = countsOf(p.role)
      const hours = projectHours(p)
      const actual = Number(p.actualHours) || 0
      rows.push([
        s.name,
        s.studentId,
        departmentText(s.department),
        p.label || p.key,
        p.name,
        ROLE_TEXT[p.role] || p.role,
        p.status,
        p.completionForm,
        actual,
        counts.participant,
        counts.coordinator,
        hours == null ? '' : hours,
        // 实际 − 折算：正数表示实际花得比折算多；按实际项目没有折算，留空
        hours == null ? '' : roundHours(actual - hours)
      ])
    })
  })
  return rows
}

module.exports = { projectDetails, HEADERS, countsOf }
