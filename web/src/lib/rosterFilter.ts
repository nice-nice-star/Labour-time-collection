// 名单的姓名/部门筛选。
//
// 与小程序端的 miniprogram/utils/search.js 是同一套规则：
// 选项由已加载的名单推导、空部门归到「未设置」、「未设置」排最后、
// 姓名与部门取交集。改一处必须同步另一处，两端的按钮顺序和行为要一模一样。
import type { SubmissionRow } from './api'

export interface DepartmentOption {
  /** 「全部」用空字符串；其余就是部门展示文本 */
  key: string
  label: string
  count: number
}

const ALL_KEY = ''
// 内部哨兵：既作为「未设置」桶的 key，也用于判断排序位置；展示文案可随语言变化。
const UNSET_LABEL = '未设置'

/** 按姓名做子串匹配（忽略大小写与首尾空白）；关键词为空时原样返回。 */
export function filterRowsByName(rows: SubmissionRow[], keyword: string): SubmissionRow[] {
  const list = Array.isArray(rows) ? rows : []
  const key = String(keyword == null ? '' : keyword).trim().toLowerCase()
  if (!key) return list
  return list.filter(row => String((row && row.name) || '').toLowerCase().includes(key))
}

/** 一行的部门展示文本；服务端下发的 departmentText 缺失时归到「未设置」。 */
export function departmentLabelOf(row: Pick<SubmissionRow, 'departmentText'>): string {
  const text = String((row && row.departmentText) || '').trim()
  return text || UNSET_LABEL
}

// 「未设置」永远排在最后，其余按中文排序，保证每次加载的按钮顺序稳定
function compareOptions(a: DepartmentOption, b: DepartmentOption): number {
  if (a.key === UNSET_LABEL || b.key === UNSET_LABEL) {
    return a.key === b.key ? 0 : (a.key === UNSET_LABEL ? 1 : -1)
  }
  return a.label.localeCompare(b.label, 'zh')
}

/**
 * 由已加载的名单推导部门筛选项；空值（未设置部门）也单独成一个可筛选的桶。
 * 只列出名单里真实出现的部门：部门枚举来自云端，前端再抄一份会跟名单漂移。
 * `allLabel` / `unsetLabel` 只影响展示，不改变用于过滤的 key。
 */
export function buildDepartmentOptions(
  rows: SubmissionRow[],
  allLabel = '全部',
  unsetLabel = '未设置',
  labelOf: (key: string) => string = key => key
): DepartmentOption[] {
  const list = Array.isArray(rows) ? rows : []
  const counts = new Map<string, number>()
  list.forEach(row => {
    const key = departmentLabelOf(row)
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  const buckets: DepartmentOption[] = []
  counts.forEach((count, key) => buckets.push({
    key,
    label: key === UNSET_LABEL ? unsetLabel : labelOf(key),
    count
  }))
  buckets.sort(compareOptions)
  return [{ key: ALL_KEY, label: allLabel, count: list.length }].concat(buckets)
}

/** 姓名与部门取交集。部门按展示文本精确匹配（选项就来自这份文本）。 */
export function filterSubmissionRows(
  rows: SubmissionRow[],
  keyword: string,
  department: string
): SubmissionRow[] {
  const byName = filterRowsByName(rows, keyword)
  const key = String(department == null ? '' : department).trim()
  if (!key) return byName
  return byName.filter(row => departmentLabelOf(row) === key)
}
