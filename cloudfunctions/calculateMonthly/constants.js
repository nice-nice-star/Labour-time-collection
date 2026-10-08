// 本文件是 miniprogram/config/constants.js 中"部门"那部分的副本。
// 云函数无法跨目录 require 小程序代码，因此这里保留同一份枚举与归一化规则。
// 三处必须保持一致（本文件、cloudfunctions/submitForm/constants.js、miniprogram/config/constants.js）；
// tests/workflow.test.js 会校验三处的枚举与归一化结果完全一致。

// 学助所属部门（受控枚举）：名单里 students 集合的 department 字段只能取这里的值。
// 未提交者在月结时补零，补零记录同样要带部门，所以这里需要和 submitForm 一样的归一化规则。
// 归一化规则：忽略大小写与多余空白；中文名/英文显示名按 DEPARTMENT_ALIASES 归一；
// 枚举与别名都匹配不上（含留空、写错部门名）按空字符串处理。
const DEPARTMENTS = ['Public_Relations','Domestic_social_Media','Multimedia_center','Journalist_News_Center','Overseas_social_Media','University_Gift_shop','Administration_and_Data','Magazine_publisher']

// 别名表：README 里列出的中文名与带空格英文显示名 → 规范值。键统一小写。
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

/**
 * 把名单里的部门归一化成规范枚举值（先精确匹配枚举，再查别名表）
 * @param {string} value
 * @returns {string} 枚举与别名都匹配不上时返回 ''
 */
function resolveDepartment(value) {
  const raw = String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  const key = raw.toLowerCase()
  const hit = DEPARTMENTS.find(d => d.toLowerCase() === key)
  if (hit) return hit
  // 用 hasOwnProperty 取值：名单里写 'constructor' 之类的键不能命中原型链
  return Object.prototype.hasOwnProperty.call(DEPARTMENT_ALIASES, key) ? DEPARTMENT_ALIASES[key] : ''
}

module.exports = { DEPARTMENTS, DEPARTMENT_ALIASES, resolveDepartment }
