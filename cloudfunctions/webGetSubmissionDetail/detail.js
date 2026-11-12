// 单名学助某月的填报明细：纯数据组装，不做数据库访问。
//
// 老师端「填报情况」页只回进度（rows.js），本模块只服务于详情页：
// 一人一条提交，返回值班、项目、旧版计数与补充说明，并同时给出
//   - current：按当前费率表重算的工时（与导出 Excel 同一口径）
//   - snapshot：提交时写下的 calc 快照（进度页显示的数字）
// 费率调整后两者可能不同，页面要把差异说明清楚，不能只挑一个显示。
//
// 云函数不能跨目录 require：依赖的 constants / project-weighting / recalc
// 在本目录各存一份与其它目录逐字节一致的副本，npm test 会校验。
const { PROJECT_ROWS } = require('./constants')
const { projectHours, roundHours } = require('./project-weighting')
const { recalcHours, legacyRowsOf, legacyHoursOfRow } = require('./recalc')

const PROJECT_BY_KEY = new Map(PROJECT_ROWS.map(row => [row.key, row]))

function numberOrZero(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// 项目类型的中文/英文显示名以服务端枚举为准；提交记录里已有的 label 优先（保留历史文本）。
function labelOf(project) {
  const meta = PROJECT_BY_KEY.get(project && project.key)
  return {
    label: (project && project.label) || (meta && meta.label) || (project && project.key) || '',
    labelEn: (meta && meta.labelEn) || ''
  }
}

// 一条 projects 记录只代表一个分工；折算工时 = 费率 × 完成状态系数 × 分工系数。
function projectView(project) {
  const { label, labelEn } = labelOf(project)
  const hours = projectHours(project)
  const actual = numberOrZero(project && project.actualHours)
  return {
    key: project.key,
    label,
    labelEn,
    name: String((project && project.name) || ''),
    role: project.role,
    status: project.status,
    completionForm: String((project && project.completionForm) || ''),
    actualHours: actual,
    // null 表示「按实际/待定」项目没有折算，页面显示为空而不是 0
    weightedHours: hours,
    actualMinusWeighted: hours == null ? null : roundHours(actual - hours)
  }
}

// 旧版「按类型填数量」的记录没有完成状态，按已发布折算（与 recalc.js / 导出一致）。
function legacyView(row) {
  const meta = PROJECT_BY_KEY.get(row && row.key)
  const counts = (row && row.counts) || {}
  const hours = legacyHoursOfRow(row)
  return {
    key: row && row.key,
    label: (row && row.label) || (meta && meta.label) || (row && row.key) || '',
    labelEn: (meta && meta.labelEn) || '',
    counts: {
      participant: numberOrZero(counts.participant),
      coordinator: numberOrZero(counts.coordinator)
    },
    weightedHours: hours == null ? null : roundHours(hours)
  }
}

function calcView(calc) {
  if (!calc) return null
  return {
    dutyHours: numberOrZero(calc.dutyHours),
    projectHours: numberOrZero(calc.projectHours),
    totalHours: numberOrZero(calc.totalHours),
    effectiveHours: numberOrZero(calc.effectiveHours)
  }
}

/**
 * @param {object} row rows.js 的一行（已完成提交/补零判定与部门展示文本）
 * @param {object|null} sub 该学生该月的 submissions 记录
 * @param {'submitted'|'zero-filled'|'not-submitted'|'unbound'} fillStatus
 */
function buildSubmissionDetail(row, sub, fillStatus) {
  const student = {
    name: row.name,
    studentId: row.studentId,
    department: row.department,
    departmentText: row.departmentText,
    isSupervisor: !!row.isSupervisor,
    bound: !!row.bound,
    identitySource: row.identitySource || ''
  }

  if (!sub) return { student, fillStatus, submission: null }

  const answers = (sub && sub.answers) || {}
  // 汇总工时按当前费率表重算，与 exportData / webExportData 同源。
  const current = recalcHours(sub)
  const projects = Array.isArray(sub.projects) ? sub.projects.map(projectView) : []
  const legacyProjectRows = legacyRowsOf(sub).map(legacyView)
  // 没有逐项 projects 的旧记录，项目名称只在 answer5 / legacyProjectName 里。
  const legacyProjectName = sub.legacyProjectName ||
    (!Array.isArray(sub.projects) ? String(answers.answer5 || '') : '')

  return {
    student,
    fillStatus,
    submission: {
      source: sub.source || 'student',
      updateTime: sub.updateTime || null,
      duty: {
        // 旧记录没有 answer1 时退回重算结果，避免详情把已存的值显示成 0
        hours: answers.answer1 != null ? numberOrZero(answers.answer1) : current.dutyHours,
        shiftTime: String(answers.answer2 || ''),
        location: String(answers.answer3 || '')
      },
      projects,
      legacyProjectRows,
      legacyProjectName,
      appeal: String(answers.answer6 || ''),
      hours: {
        current: {
          dutyHours: current.dutyHours,
          projectHours: current.projectHours,
          totalHours: current.totalHours,
          effectiveHours: current.effectiveHours
        },
        snapshot: calcView(sub.calc),
        // 主管倍率取提交时快照，不跟随名单当前值（与导出/进度页一致）
        isSupervisor: !!sub.isSupervisor
      }
    }
  }
}

module.exports = { buildSubmissionDetail }
