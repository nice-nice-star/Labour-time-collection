// 部门枚举、别名与中文名。填报进度页要按同一套规则把名单原值显示成中文。
//
// 云函数不能跨目录 require 小程序代码，所以本文件在两处各存一份副本
// （getSubmissions / webGetSubmissions），npm test 校验逐字节一致，
// 并逐项比对它与 miniprogram/config/constants.js 的枚举、别名与归一化结果。
//
// 名单里填规范值、中文名或英文显示名都可以：忽略大小写与多余空白；都匹配不上按空字符串处理。
const DEPARTMENTS = ['Public_Relations','Domestic_social_Media','Multimedia_center','Journalist_News_Center','Overseas_social_Media','University_Gift_shop','Administration_and_Data','Magazine_publisher']

const DEPARTMENT_ALIASES = {
  '公共关系': 'Public_Relations',
  '国内社媒': 'Domestic_social_Media',
  '多媒体中心': 'Multimedia_center',
  '大学新闻中心记者': 'Journalist_News_Center',
  '海外社媒': 'Overseas_social_Media',
  '纪念品商店': 'University_Gift_shop',
  '行政与数据': 'Administration_and_Data',
  '神仙湖畔杂志社': 'Magazine_publisher',
  'public relations': 'Public_Relations',
  'domestic social media': 'Domestic_social_Media',
  'multimedia center': 'Multimedia_center',
  'journalist, news center': 'Journalist_News_Center',
  'overseas social media': 'Overseas_social_Media',
  'university gift shop': 'University_Gift_shop',
  'administration and data': 'Administration_and_Data',
  'magazine publisher': 'Magazine_publisher'
}

const DEPARTMENT_LABELS = {
  Public_Relations: '公共关系',
  Domestic_social_Media: '国内社媒',
  Multimedia_center: '多媒体中心',
  Journalist_News_Center: '大学新闻中心记者',
  Overseas_social_Media: '海外社媒',
  University_Gift_shop: '纪念品商店',
  Administration_and_Data: '行政与数据',
  Magazine_publisher: '神仙湖畔杂志社'
}

// 先精确匹配枚举（忽略大小写），再查别名表；原型链上的键不能命中
function resolveDepartment(value) {
  const raw = String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const key = raw.toLowerCase()
  const hit = DEPARTMENTS.find(d => d.toLowerCase() === key)
  if (hit) return hit
  return Object.prototype.hasOwnProperty.call(DEPARTMENT_ALIASES, key) ? DEPARTMENT_ALIASES[key] : ''
}

// 名单原值 → 展示文本。枚举之外的旧值（含已移除的部门）原样显示，不静默清空，方便人工发现。
// 与小程序「填报情况」页的显示口径一致：DEPARTMENT_LABELS[resolved] || 原值 || '未设置'。
function departmentText(value) {
  const raw = String(value == null ? '' : value)
  return DEPARTMENT_LABELS[resolveDepartment(raw)] || raw || '未设置'
}

module.exports = { DEPARTMENTS, DEPARTMENT_ALIASES, DEPARTMENT_LABELS, resolveDepartment, departmentText }
