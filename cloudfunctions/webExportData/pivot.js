// Web 管理端专用：工时统计表的版式（纯逻辑，不 require exceljs，便于测试）。
//
// 版式 = 「一人一行 × 一类项目一列」的横向统计表：
//   基础列（新版表单带来的全部汇总字段） | 每类项目一列折算工时 | 额外工时申诉
// 与小程序导出的长表**刻意不同**，但汇总字段与判定口径都与小程序「汇总」一致：
// 绑定/提交/补零的判定与名单汇总走 rows.js，部门映射走 departments.js，
// 两者都是与 webGetSubmissions 逐字节一致的副本（测试校验）。
const { projectDetails } = require('./projectDetails')
const { PROJECT_HOURS, hoursOfRow } = require('./constants')
const { PROJECT_ROWS } = require('./projectRows')
const { buildRows, summarize } = require('./rows')
const {
  DEPARTMENTS, DEPARTMENT_LABELS, DEPARTMENT_ALIASES, resolveDepartment
} = require('./departments')

const TITLE = 'CPRO学助工时统计表'

// 基础列：字段与顺序对齐小程序「汇总」（部门多带一份英文）
const BASE_HEADERS = [
  '学助姓名', '学号', '部门',
  '值班工时', '项目折算工时', '总工时', '有效工时',
  '项目条数', '已发布', '已完成未发布', '未完成', '实际耗时合计',
  '填报状态'
]

// 末尾一列：表单第 6 题的自由文本
const TRAILING_HEADERS = ['额外工时申诉']

// 填报状态：与小程序「汇总」用同一套词
const FILL = {
  SUBMITTED: '已提交',
  ZERO: '月结补零',
  PENDING: '未提交',
  UNBOUND: '未绑定'
}
const WORK_STATUS = ['已发布', '已完成未发布', '未完成']

// 外观：表头用与网页同一支品牌紫，表体加细边框（合并区域也要逐格上色/描边，
// 否则合并块会出现半截白底或缺边）。ARGB 前两位是透明度，FF 表示不透明。
const STYLE = {
  headerFill: 'FF732160',
  headerText: 'FFFFFFFF',
  titleText: 'FF732160',
  border: 'FFD9D9D9',
  titleRow: 1,
  headerFrom: 3,
  headerTo: 3,
  tableFrom: 3
}

// 13 个基础列 + 12 个项目列 + 1 个申诉列 = 26 列，与上一版总宽度持平
const BASE_WIDTHS = [12, 13, 30, 10, 12, 10, 10, 9, 9, 12, 8, 12, 10]
const TYPE_WIDTH = 20
const TRAILING_WIDTHS = [20]
const TITLE_HEIGHT = 22
const META_HEIGHT = 16
const HEAD_HEIGHT = 30
const ROW_HEIGHT = 13
const TITLE_SIZE = 14
const FONT_SIZE = 10

// 1 → A、27 → AA：合并单元格要按 A1 记法写
function colLetter(index) {
  let n = Number(index)
  let out = ''
  while (n > 0) {
    const rest = (n - 1) % 26
    out = String.fromCharCode(65 + rest) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function pad(n) { return String(n).padStart(2, '0') }

/**
 * 项目列：一类项目一列，只保留有数字费率的项目——「按实际/待定」的接待活动、
 * 管理项目没有列（它们本来就算不出折算工时）。顺序与 PROJECT_ROWS 一致。
 * @returns {{key:string, label:string}[]}
 */
function projectColumns() {
  return PROJECT_ROWS
    .filter(row => {
      const rate = PROJECT_HOURS[row.key]
      return rate && rate.participant != null
    })
    .map(row => ({ key: row.key, label: row.label }))
}

/**
 * 每人每类项目的折算工时：按 projectRows（含旧版结转的计数）汇总，
 * 这样 12 个类型列之和恰好等于 calc.projectHours，老师可以行内对账。
 * @returns {Map<string, number>}
 */
function hoursByKey(projectRows) {
  const map = new Map()
  ;(projectRows || []).forEach(row => {
    const hours = hoursOfRow(row.key, row.counts)
    if (hours == null) return          // 按实际项目没有费率，不参与折算
    map.set(row.key, (map.get(row.key) || 0) + hours)
  })
  return map
}

// 项目条数与完成情况只来自逐项填报的 projects[]（月结补零的人为空）
function projectStats(projects) {
  const stats = { total: 0, actualHours: 0, statuses: {} }
  WORK_STATUS.forEach(s => { stats.statuses[s] = 0 })
  ;(projects || []).forEach(p => {
    stats.total += 1
    stats.actualHours += Number(p.actualHours) || 0
    if (stats.statuses[p.status] != null) stats.statuses[p.status] += 1
  })
  return stats
}

// 部门规范值 → 英文别名（别名表里那批纯英文键），用于「中文 英文」双行显示
const ENGLISH_ALIAS = Object.entries(DEPARTMENT_ALIASES).reduce((acc, [alias, key]) => {
  if (/^[a-z][a-z, ]*$/.test(alias)) acc[key] = alias
  return acc
}, {})

const MINOR_WORDS = new Set(['and', 'or', 'the', 'of'])

function titleCase(text) {
  return String(text).split(/(\s+|,\s*)/).map(part => {
    if (!part || /^[\s,]+$/.test(part)) return part
    if (MINOR_WORDS.has(part)) return part
    return part[0].toUpperCase() + part.slice(1)
  }).join('')
}

/**
 * 部门展示文本：中文名 + 英文名（如「行政与数据 Administration and Data」）。
 * 枚举外的旧值原样输出，不静默清空，方便人工发现。
 */
function departmentLabel(value) {
  const raw = String(value == null ? '' : value)
  const resolved = resolveDepartment(raw)
  if (!resolved) return raw || '未设置'
  const en = ENGLISH_ALIAS[resolved]
  return en ? `${DEPARTMENT_LABELS[resolved]} ${titleCase(en)}` : DEPARTMENT_LABELS[resolved]
}

function monthText(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''))
  return m ? `${m[1]}年${Number(m[2])}月` : String(month || '')
}

function summaryText(summary) {
  return `名单 ${summary.total} 人：已提交 ${summary.submitted}，待提交 ${summary.pending}，未绑定 ${summary.unbound}`
}

// 空文本不写成空字符串单元格，留空更干净（没申诉是常态）
function textOf(value) {
  const text = String(value == null ? '' : value).trim()
  return text || undefined
}

// 部门分组顺序：先按枚举顺序，枚举外/未设置排最后；组内按部门名、再按姓名中文排序。
// 分组键用**展示文本**而不是规范值：两个都查不到枚举的旧部门（如「图书馆」和「CPRO」）
// 各自成块，不会被并进同一个合并单元格里丢掉一个。
function orderStudents(students, byOpenid) {
  const rank = key => {
    const i = DEPARTMENTS.indexOf(key)
    return i === -1 ? DEPARTMENTS.length : i
  }
  return (students || []).map((stu, index) => {
    const sub = stu.openid ? byOpenid.get(stu.openid) : null
    // 与 rows.js 一致：提交过的用提交时快照，未提交的退回当前名单值
    const raw = (sub && sub.department) || stu.department || ''
    return { stu, sub, raw, label: departmentLabel(raw), dept: resolveDepartment(raw), index }
  }).sort((a, b) =>
    rank(a.dept) - rank(b.dept) ||
    String(a.label).localeCompare(String(b.label), 'zh') ||
    String(a.stu.name).localeCompare(String(b.stu.name), 'zh') ||
    a.index - b.index
  )
}

/**
 * 生成统计表版式模型（行、合并范围、列宽、行高），由 workbook.js 画成 xlsx。
 * @param {{form: object, students: object[], submissions: object[], now?: Date}} input
 */
function buildPivot({ form, students, submissions, now = new Date() }) {
  const cols = projectColumns()
  // 列布局：基础列 | 项目列（一类一列折算工时） | 末尾申诉
  const typeFrom = BASE_HEADERS.length
  const trailingFrom = typeFrom + cols.length
  const totalColumns = trailingFrom + TRAILING_HEADERS.length
  const lastCol = colLetter(totalColumns)
  const byOpenid = new Map((submissions || []).map(s => [s.openid, s]))
  const ordered = orderStudents(students, byOpenid)

  const rows = []
  const merges = []
  const blank = () => new Array(totalColumns).fill(undefined)

  // 第 1 行：大标题（横跨整张表并居中）
  const title = blank()
  title[0] = TITLE
  rows.push(title)
  merges.push(`A1:${lastCol}1`)

  // 第 2 行：月份 + 填报情况（汇总口径与「填报情况」页同源）
  const summary = summarize(buildRows(students, submissions))
  const meta = blank()
  meta[0] = '月份'
  meta[1] = monthText(form.month)
  meta[3] = '填报情况'
  meta[4] = summaryText(summary)
  rows.push(meta)
  merges.push('B2:C2', `E2:${lastCol}2`)

  // 第 3 行：单行表头（一类项目一列，不再有「统筹/参与」两行）
  const head = blank()
  BASE_HEADERS.forEach((text, i) => { head[i] = text })
  cols.forEach((c, i) => { head[typeFrom + i] = c.label })
  TRAILING_HEADERS.forEach((text, i) => { head[trailingFrom + i] = text })
  rows.push(head)

  // 数一行：交过（含月结补零）写数字，没交的只在「填报状态」写状态
  const makeRow = (item, first) => {
    const { stu, sub, label } = item
    const bound = !!stu.openid
    const submitted = !!sub && sub.source !== 'auto-zero'
    const zeroFilled = !!sub && sub.source === 'auto-zero'
    const row = blank()
    row[0] = stu.name
    row[1] = stu.studentId
    // 同一部门的「部门」格只写第一行，其余交给合并单元格
    if (first) row[2] = label

    if (submitted || zeroFilled) {
      const calc = sub.calc || {}
      const stats = projectStats(sub.projects)
      row[3] = Number(calc.dutyHours) || 0
      row[4] = Number(calc.projectHours) || 0
      row[5] = Number(calc.totalHours) || 0
      row[6] = Number(calc.effectiveHours) || 0
      row[7] = stats.total
      WORK_STATUS.forEach((status, i) => { row[8 + i] = stats.statuses[status] })
      row[11] = stats.actualHours
      row[12] = zeroFilled ? FILL.ZERO : FILL.SUBMITTED
      // 12 个类型列：该类的折算工时（行内之和 = 项目折算工时）
      const hours = hoursByKey(sub.projectRows)
      cols.forEach((c, i) => { row[typeFrom + i] = hours.get(c.key) || 0 })
      row[trailingFrom] = textOf((sub.answers || {}).answer6)
    } else {
      row[12] = bound ? FILL.PENDING : FILL.UNBOUND
    }
    return row
  }

  // 数据行：同一部门连续成块，「部门」列按块纵向合并
  const blocks = []
  for (const item of ordered) {
    const last = blocks[blocks.length - 1]
    if (last && last.label === item.label) last.items.push(item)
    else blocks.push({ label: item.label, items: [item] })
  }
  for (const block of blocks) {
    const from = rows.length + 1
    block.items.forEach((item, i) => rows.push(makeRow(item, i === 0)))
    const to = rows.length
    if (to > from) merges.push(`C${from}:C${to}`)
  }

  const widths = BASE_WIDTHS.slice()
  cols.forEach(() => widths.push(TYPE_WIDTH))
  TRAILING_WIDTHS.forEach(width => widths.push(width))
  const rowHeights = rows.map((_, i) =>
    i === 0 ? TITLE_HEIGHT : i === 1 ? META_HEIGHT : i === 2 ? HEAD_HEIGHT : ROW_HEIGHT
  )

  const stamp = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}`
  return {
    filename: `${stamp}学助工时统计表.xlsx`,
    detailRows: projectDetails(submissions, departmentLabel),
    sheetName: String(form.month || 'Sheet1'),
    fontSize: FONT_SIZE,
    titleSize: TITLE_SIZE,
    widths,
    rowHeights,
    rows,
    merges,
    style: STYLE,
    // 部门分组结果，测试与调用方可以据此核对「有没有漏部门」
    departments: blocks.map(b => ({ label: b.label, count: b.items.length }))
  }
}

module.exports = {
  buildPivot, projectColumns, departmentLabel, monthText, summaryText, colLetter,
  STYLE, TITLE, BASE_HEADERS, TRAILING_HEADERS, FILL, WORK_STATUS
}
