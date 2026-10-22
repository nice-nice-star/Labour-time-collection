// miniprogram/utils/search.js
// 名单的姓名/部门筛选。纯函数，便于单测；页面只负责把结果放进 data。
//
// Web 端有同一套规则的副本（web/src/lib/rosterFilter.ts）：两端的选项顺序、
// 空值归到「未设置」、姓名与部门取交集的行为必须一致，改一处就要改另一处。

const ALL_KEY = ''
const UNSET_LABEL = '未设置'

/**
 * 按姓名做子串匹配（忽略大小写与首尾空白）。
 * @param {Array<{name?:string}>} rows 名单行
 * @param {string} keyword 空、仅空白或 null 时原样返回全部（不复制数组）
 * @returns {Array} 过滤后的数组
 */
function filterRowsByName(rows, keyword) {
  const list = Array.isArray(rows) ? rows : []
  const key = String(keyword == null ? '' : keyword).trim().toLowerCase()
  if (!key) return list
  return list.filter(row => String((row && row.name) || '').toLowerCase().includes(key))
}

/** 一行的部门展示文本；服务端/页面算好的 departmentText 缺失时归到「未设置」 */
function departmentLabelOf(row) {
  const text = String((row && row.departmentText) || '').trim()
  return text || UNSET_LABEL
}

// 「未设置」永远排在最后，其余按中文排序，保证每次加载的按钮顺序稳定
function compareOptions(a, b) {
  if (a.label === UNSET_LABEL || b.label === UNSET_LABEL) {
    return a.label === b.label ? 0 : (a.label === UNSET_LABEL ? 1 : -1)
  }
  return a.label.localeCompare(b.label, 'zh')
}

/**
 * 由已加载的名单推导部门筛选项；空值（未设置部门）也单独成一个可筛选的桶。
 * 只列出名单里真实出现的部门：部门枚举来自云端，这里再抄一份会跟名单漂移。
 * @param {Array<{departmentText?:string}>} rows 名单行
 * @returns {{key:string,label:string,count:number}[]} 第一项是「全部」（key 为空字符串）
 */
function buildDepartmentOptions(rows) {
  const list = Array.isArray(rows) ? rows : []
  const counts = new Map()
  list.forEach(row => {
    const label = departmentLabelOf(row)
    counts.set(label, (counts.get(label) || 0) + 1)
  })
  const buckets = Array.from(counts, ([label, count]) => ({ key: label, label, count }))
  buckets.sort(compareOptions)
  return [{ key: ALL_KEY, label: '全部', count: list.length }].concat(buckets)
}

/**
 * 姓名与部门取交集。部门按展示文本精确匹配（选项就来自这份文本）。
 * @param {Array} rows 名单行
 * @param {string} keyword 姓名关键词，空时不过滤姓名
 * @param {string} department 选中的部门展示文本；空字符串表示「全部」
 * @returns {Array} 过滤后的数组
 */
function filterSubmissionRows(rows, keyword, department) {
  const byName = filterRowsByName(rows, keyword)
  const key = String(department == null ? '' : department).trim()
  if (!key) return byName
  return byName.filter(row => departmentLabelOf(row) === key)
}

module.exports = {
  ALL_KEY,
  UNSET_LABEL,
  filterRowsByName,
  departmentLabelOf,
  buildDepartmentOptions,
  filterSubmissionRows
}
