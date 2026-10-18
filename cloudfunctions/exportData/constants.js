// 本文件是 miniprogram/config/constants.js 中"项目费率 + 部门"那部分的副本。
// 云函数无法跨目录 require 小程序代码，因此这里保留同一份费率表与部门规则。
// exportData 与 webExportData 各存一份，两份必须逐字节相同（npm test 校验）；
// 费率与部门枚举还要与小程序端及其余云函数副本一致（npm test 逐项比对）。
//
// 导出用途：
//   - 「项目明细」把一条申报折算成等效工时（参与率或统筹率 × 1）；
//   - 「汇总」在名单驱动出行时，把未提交/未绑定者的名单原值归一化后再转中文名。

// 产出项目的稳定键。费率以 key 为准；中文名只是显示文本。
const PROJECT_KEYS = {
  NEWS_ARTICLE: 'news_article',
  FEATURE_INTERVIEW: 'feature_interview',
  IN_DEPTH_REPORT: 'in_depth_report',
  SOCIAL_POST_COPY: 'social_post_copy',
  GRAPHIC_LAYOUT: 'graphic_layout',
  POSTER: 'poster',
  LONG_GRAPHIC: 'long_graphic',
  SHORT_VIDEO_1MIN: 'short_video_1min',
  SHORT_VIDEO_3MIN: 'short_video_3min',
  EVENT_COVERAGE: 'event_coverage',
  DATA_REPORT: 'data_report',
  RECEPTION: 'reception',
  MANAGEMENT_PROJECT: 'management_project',
  TEAM_ACTIVITY: 'team_activity'
}

// 项目费率（每个产出项目的等效工时），键为稳定键。
// participant 参与（区间下限）；coordinator 统筹（区间上限）。
// coordinator 为 null 表示该项目只有参与一种算法：单值项目（README 的标准工时）
// 与「按实际」的项目都只按参与计，表单不显示统筹输入框。
const PROJECT_HOURS = {
  [PROJECT_KEYS.NEWS_ARTICLE]: { participant: 2, coordinator: null },
  [PROJECT_KEYS.FEATURE_INTERVIEW]: { participant: 3, coordinator: 6 },
  [PROJECT_KEYS.IN_DEPTH_REPORT]: { participant: 4, coordinator: 8 },
  [PROJECT_KEYS.SOCIAL_POST_COPY]: { participant: 1.5, coordinator: null },
  [PROJECT_KEYS.GRAPHIC_LAYOUT]: { participant: 1, coordinator: 2 },
  [PROJECT_KEYS.POSTER]: { participant: 1, coordinator: 3 },
  [PROJECT_KEYS.LONG_GRAPHIC]: { participant: 2, coordinator: 4 },
  [PROJECT_KEYS.SHORT_VIDEO_1MIN]: { participant: 2, coordinator: null },
  [PROJECT_KEYS.SHORT_VIDEO_3MIN]: { participant: 2, coordinator: 4 },
  [PROJECT_KEYS.EVENT_COVERAGE]: { participant: 4, coordinator: null },
  [PROJECT_KEYS.DATA_REPORT]: { participant: 2, coordinator: null },
  [PROJECT_KEYS.RECEPTION]: { participant: null, coordinator: null },            // 按实际，待定
  [PROJECT_KEYS.MANAGEMENT_PROJECT]: { participant: null, coordinator: null },   // 按实际，待定
  [PROJECT_KEYS.TEAM_ACTIVITY]: { participant: 2, coordinator: 8 }
}

/**
 * 按角色取费率。展示与计算都必须走这个函数，避免两处各解释一次区间。
 * @param {string} key 稳定键
 * @param {'participant'|'coordinator'} role
 * @returns {number|null} null 表示该项目此角色不计入工时（待定或未开放统筹）
 */
function rateOf(key, role) {
  const hours = PROJECT_HOURS[key]
  if (!hours || typeof hours !== 'object') return null
  const rate = hours[role]
  return rate == null ? null : rate
}

/**
 * 把申报数量折算成等效工时：参与数 × 参与费率 + 统筹数 × 统筹费率。
 * @param {string} key 稳定键
 * @param {{participant?:number,coordinator?:number}} counts
 * @returns {number|null} 两端费率都待定时返回 null（不写成 0，避免误读成"没有工时"）
 */
function hoursOfRow(key, counts) {
  const c = counts || {}
  let total = 0
  let known = false
  for (const role of ['participant', 'coordinator']) {
    const rate = rateOf(key, role)
    if (rate == null) continue
    known = true
    total += rate * (Number(c[role]) || 0)
  }
  return known ? total : null
}

// 学助所属部门（受控枚举）：名单里 students 集合的 department 字段只能取这里的值。
// 名单驱动出行时（未提交/未绑定的人）没有 submissions 快照，需要在这里归一化后再转中文名。
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

// 部门规范值 → 展示用中文名。取值来自 submissions.department（提交时或月结补零时归一化过的快照）。
// 与 miniprogram/config/constants.js 的同名表必须一致（小程序「填报情况」页也用这张表），
// tests/workflow.test.js 会校验两处相等。
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

module.exports = {
  PROJECT_KEYS,
  PROJECT_HOURS,
  rateOf,
  hoursOfRow,
  DEPARTMENTS,
  DEPARTMENT_ALIASES,
  resolveDepartment,
  DEPARTMENT_LABELS
}
