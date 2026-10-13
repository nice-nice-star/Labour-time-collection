// miniprogram/utils/search.js
// 名单按姓名过滤。纯函数，便于单测；页面只负责把结果放进 data。

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

module.exports = { filterRowsByName }
