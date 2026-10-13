// Web 管理端专用：工时统计表的版式（纯逻辑，不 require exceljs，便于测试）。
//
// 与小程序端导出（exportCore.js 的「长表 + 项目明细」两张表）**刻意不同**：
// Web 端要的是「一人一行 × 一项目一列」的横向统计表，带大标题行、填报情况行、
// 两行表头与大量合并单元格。因此这里另起一份版式逻辑，不再与小程序端共用。
//
// 数据口径没有分叉：绑定/提交/补零的判定与汇总仍然走 rows.js，部门映射走
// departments.js，两者都是与 webGetSubmissions 逐字节一致的副本（测试校验），
// 所以统计表与「填报情况」页不会各说各话。
const { PROJECT_HOURS } = require('./constants')
const { PROJECT_ROWS } = require('./projectRows')
const { buildRows, summarize } = require('./rows')
const {
  DEPARTMENTS, DEPARTMENT_LABELS, DEPARTMENT_ALIASES, resolveDepartment
} = require('./departments')

const TITLE = 'CPRO学助工时统计表'
const BASE_HEADERS = ['学助姓名', '学号', '部门', '有效工时', '值班工时']
// 最右侧两列：表单第 5、6 题的自由文本，跟在项目明细之后，纵向合并两行表头
const TRAILING_HEADERS = ['项目名称', '额外工时申诉']
const STATUS_UNBOUND = '未绑定'
const STATUS_PENDING = '待提交'

// 外观：表头用与网页同一支品牌紫，表体加细边框（合并区域也要逐格上色/描边，
// 否则合并块会出现半截白底或缺边）。ARGB 前两位是透明度，FF 表示不透明。
const STYLE = {
  headerFill: 'FF732160',
  headerText: 'FFFFFFFF',
  titleText: 'FF732160',
  border: 'FFD9D9D9',
  titleRow: 1,
  headerFrom: 3,
  headerTo: 4,
  tableFrom: 3
}

// 列宽与行高按样例表：基础列窄、项目列够放下「统筹/参与」两行表头
const BASE_WIDTHS = [12, 13, 30, 11, 11]
const SINGLE_WIDTH = 22
const PAIR_WIDTH = 12.5
const TRAILING_WIDTHS = [20, 26]
const TITLE_HEIGHT = 22
const META_HEIGHT = 16
const HEAD_HEIGHT = 18
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
 * 项目列：只保留有数字费率的项目——「按实际/待定」的接待活动、管理项目没有列。
 * 有统筹费率的项目占「统筹 + 参与」两列（顺序与统计表模板一致），单值项目只占「参与」一列。
 * @returns {{cols: {key:string, role:string, label:string}[], groups: {label:string, from:number, to:number}[]}}
 */
function projectColumns() {
  const cols = []
  const groups = []
  for (const row of PROJECT_ROWS) {
    const rate = PROJECT_HOURS[row.key]
    if (!rate || rate.participant == null) continue
    const from = cols.length
    if (rate.coordinator != null) {
      cols.push({ key: row.key, role: 'coordinator', label: '统筹' })
      cols.push({ key: row.key, role: 'participant', label: '参与' })
    } else {
      cols.push({ key: row.key, role: 'participant', label: '参与' })
    }
    groups.push({ label: row.label, from, to: cols.length - 1 })
  }
  return { cols, groups }
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

// 空文本不写成空字符串单元格，留空更干净（未申诉、没填项目名都是常态）
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
  const { cols, groups } = projectColumns()
  // 列布局：基础列 | 项目列（统筹/参与） | 末尾两列自由文本
  const trailingFrom = BASE_HEADERS.length + cols.length
  const totalColumns = trailingFrom + TRAILING_HEADERS.length
  const lastCol = colLetter(totalColumns)
  const byOpenid = new Map((submissions || []).map(s => [s.openid, s]))
  const ordered = orderStudents(students, byOpenid)

  const rows = []
  const merges = []
  const blank = () => new Array(totalColumns).fill(undefined)

  // 第 1 行：大标题
  const title = blank()
  title[0] = TITLE
  rows.push(title)
  merges.push(`A1:${colLetter(BASE_HEADERS.length)}1`)

  // 第 2 行：月份 + 填报情况（汇总口径与「填报情况」页同源）
  const summary = summarize(buildRows(students, submissions))
  const meta = blank()
  meta[0] = '月份'
  meta[1] = monthText(form.month)
  meta[3] = '填报情况'
  meta[4] = summaryText(summary)
  rows.push(meta)
  merges.push('B2:C2', `E2:${lastCol}2`)

  // 第 3、4 行：两行表头（基础列与末尾两列纵向合并；项目列横向合并后拆「统筹/参与」）
  const head1 = blank()
  BASE_HEADERS.forEach((text, i) => { head1[i] = text })
  groups.forEach(g => { head1[BASE_HEADERS.length + g.from] = g.label })
  TRAILING_HEADERS.forEach((text, i) => { head1[trailingFrom + i] = text })
  const head2 = blank()
  cols.forEach((c, i) => { head2[BASE_HEADERS.length + i] = c.label })
  rows.push(head1, head2)
  for (let i = 1; i <= BASE_HEADERS.length; i++) {
    merges.push(`${colLetter(i)}3:${colLetter(i)}4`)
  }
  TRAILING_HEADERS.forEach((_, i) => {
    merges.push(`${colLetter(trailingFrom + i + 1)}3:${colLetter(trailingFrom + i + 1)}4`)
  })
  groups.forEach(g => {
    if (g.to > g.from) {
      merges.push(`${colLetter(BASE_HEADERS.length + g.from + 1)}3:${colLetter(BASE_HEADERS.length + g.to + 1)}3`)
    }
  })

  // 数一行：已提交（或月结补零）写数字，否则整行合并成状态文字
  const makeRow = (item, first, excelRow) => {
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
      const answers = (sub.answers || {})
      row[3] = Number((sub.calc || {}).effectiveHours) || 0
      row[4] = Number(answers.answer1) || 0
      const counts = new Map((sub.projectRows || []).map(r => [r.key, r.counts || {}]))
      cols.forEach((c, i) => {
        const bag = counts.get(c.key)
        row[BASE_HEADERS.length + i] = bag ? (Number(bag[c.role]) || 0) : 0
      })
      // 第 5、6 题原样落到末尾两列；空文本留空而不是写空字符串
      row[trailingFrom] = textOf(answers.answer5)
      row[trailingFrom + 1] = textOf(answers.answer6)
    } else {
      row[3] = bound ? STATUS_PENDING : STATUS_UNBOUND
      merges.push(`D${excelRow}:${lastCol}${excelRow}`)
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
    block.items.forEach((item, i) => rows.push(makeRow(item, i === 0, rows.length + 1)))
    const to = rows.length
    if (to > from) merges.push(`C${from}:C${to}`)
  }

  const widths = BASE_WIDTHS.slice()
  for (const g of groups) {
    const width = g.to > g.from ? PAIR_WIDTH : SINGLE_WIDTH
    for (let i = g.from; i <= g.to; i++) widths.push(width)
  }
  TRAILING_WIDTHS.forEach(width => widths.push(width))
  const rowHeights = rows.map((_, i) =>
    i === 0 ? TITLE_HEIGHT : i === 1 ? META_HEIGHT : i < 4 ? HEAD_HEIGHT : ROW_HEIGHT
  )

  const stamp = `${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}`
  return {
    filename: `${stamp}学助工时统计表.xlsx`,
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
  STYLE, TITLE, BASE_HEADERS, TRAILING_HEADERS, STATUS_UNBOUND, STATUS_PENDING
}
