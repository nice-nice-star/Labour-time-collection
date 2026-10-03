// 本文件是 miniprogram/config/constants.js 的副本。
// 云函数无法跨目录 require 小程序代码，因此这里保留同一份数据。
// 费率表/标签表与小程序必须一致；部门枚举还要与 cloudfunctions/calculateMonthly/constants.js 一致。
// 三处（小程序、本文件、calculateMonthly）的漂移由 tests/workflow.test.js 校验。
//
// 产出项目的稳定键。费率以 key 为准；中文名只是显示文本，
// 同时作为历史数据（早期提交里存的是中文名）的兼容入口。
const PROJECT_KEYS = {
  INTERVIEW_PREP: 'interview_prep',
  INTERVIEW_JOIN: 'interview_join',
  INTERVIEW_DRAFT: 'interview_draft',
  VIDEO_FULL: 'video_full',
  VIDEO_SHORT: 'video_short',
  VIDEO_LONG: 'video_long',
  VIDEO_EDIT: 'video_edit',
  XIAOHONGSHU: 'xiaohongshu',
  SOCIAL_ARTICLE: 'social_article',
  EVENT_PHOTO: 'event_photo',
  POSTER: 'poster',
  NEWS_MONITOR: 'news_monitor',
  INTERNAL_EVENT: 'internal_event'
}

// 项目工时统计表（每个产出项目的等效工时），键为稳定键
// 注意：视频剪辑为"待定"，用 null 表示，计算时跳过
const PROJECT_HOURS = {
  [PROJECT_KEYS.INTERVIEW_PREP]: 2,
  [PROJECT_KEYS.INTERVIEW_JOIN]: 1,
  [PROJECT_KEYS.INTERVIEW_DRAFT]: 3,
  [PROJECT_KEYS.VIDEO_FULL]: 3,
  [PROJECT_KEYS.VIDEO_SHORT]: 4,
  [PROJECT_KEYS.VIDEO_LONG]: 8,
  [PROJECT_KEYS.VIDEO_EDIT]: null,          // 待定
  [PROJECT_KEYS.XIAOHONGSHU]: 3,
  [PROJECT_KEYS.SOCIAL_ARTICLE]: 1,
  [PROJECT_KEYS.EVENT_PHOTO]: 2,
  [PROJECT_KEYS.POSTER]: 2,
  [PROJECT_KEYS.NEWS_MONITOR]: 2,
  [PROJECT_KEYS.INTERNAL_EVENT]: 8
}

// 项目工时统计表的行（与 README 表格顺序一致，作为表单第四题的模板）
// key 为稳定键（用于计算与提交），label 为中文显示文本
const PROJECT_ROWS = [
  { key: PROJECT_KEYS.INTERVIEW_PREP, label: '深度访谈前期准备', hours: 2 },
  { key: PROJECT_KEYS.INTERVIEW_JOIN, label: '参与深度访谈', hours: 1 },
  { key: PROJECT_KEYS.INTERVIEW_DRAFT, label: '访谈成稿', hours: 3 },
  { key: PROJECT_KEYS.VIDEO_FULL, label: '排版制作一条完整的视频', hours: 3 },
  { key: PROJECT_KEYS.VIDEO_SHORT, label: '制作一条短视频 (1-5)mins', hours: 4 },
  { key: PROJECT_KEYS.VIDEO_LONG, label: '制作一条长视频 ~10mins', hours: 8 },
  { key: PROJECT_KEYS.VIDEO_EDIT, label: '视频剪辑', hours: '待定' },
  { key: PROJECT_KEYS.XIAOHONGSHU, label: '小红书编辑一条', hours: 3 },
  { key: PROJECT_KEYS.SOCIAL_ARTICLE, label: '撰写一条海外社媒稿件', hours: 1 },
  { key: PROJECT_KEYS.EVENT_PHOTO, label: '参与一场活动摄影', hours: 2 },
  { key: PROJECT_KEYS.POSTER, label: '海报设计', hours: 2 },
  { key: PROJECT_KEYS.NEWS_MONITOR, label: '新闻监测', hours: 2 },
  { key: PROJECT_KEYS.INTERNAL_EVENT, label: '组织一次内部活动', hours: 8 }
]

// 稳定键 → 中文显示文本
const PROJECT_LABELS = PROJECT_ROWS.reduce((acc, row) => {
  acc[row.key] = row.label
  return acc
}, {})

// 中文显示文本 → 稳定键（历史记录里存的是中文名）
const PROJECT_KEYS_BY_LABEL = PROJECT_ROWS.reduce((acc, row) => {
  acc[row.label] = row.key
  return acc
}, {})

/**
 * 把历史记录里的中文名或新的稳定键统一解析为稳定键
 * @param {string} value
 * @returns {string|null} 无法识别时返回 null
 */
function resolveProjectKey(value) {
  if (!value) return null
  if (Object.prototype.hasOwnProperty.call(PROJECT_HOURS, value)) return value
  if (Object.prototype.hasOwnProperty.call(PROJECT_KEYS_BY_LABEL, value)) return PROJECT_KEYS_BY_LABEL[value]
  return null
}

/**
 * 稳定键 → 中文显示文本（计算与落库时使用）
 * @param {string} key
 * @returns {string} 无法识别时原样返回
 */
function labelOf(key) {
  return Object.prototype.hasOwnProperty.call(PROJECT_LABELS, key) ? PROJECT_LABELS[key] : key
}

/**
 * 把任意来源的提交行（新的 key 形式或历史的中文名形式）归一化成统一结构，
 * 无法识别的项目直接剔除，数量取非负整数。
 * @param {Array} rows
 * @returns {Array<{key:string,label:string,count:number}>}
 */
function normalizeProjectRows(rows) {
  return (rows || []).reduce((acc, row) => {
    const key = resolveProjectKey(row && (row.key || row.item))
    if (!key) return acc
    acc.push({ key, label: labelOf(key), count: Math.max(0, Math.floor(Number(row.count) || 0)) })
    return acc
  }, [])
}

// 第三题（值班地点）选项
const LOCATION_OPTIONS = ['University gift shop', 'ABE303', 'ABW709']

// 学助所属部门（受控枚举）：名单里 students 集合的 department 字段只能取这里的值。
// 归一化规则：忽略大小写与多余空白；中文名/英文显示名按 DEPARTMENT_ALIASES 归一；
// 枚举与别名都匹配不上（含留空、写错部门名）按空字符串处理。
const DEPARTMENTS = ['CPRO', 'Public_Relations','Domestic_social_Media','Multimedia_center','Journalist_News_Center','Overseas_social_Media','University_Gift_shop','Administration_and_Data','Magazine_publisher']

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

// 角色
const ROLES = { EXPORT: 'export', STUDENT: 'student', UNBOUND: 'unbound' }

module.exports = {
  PROJECT_KEYS,
  PROJECT_HOURS,
  PROJECT_ROWS,
  PROJECT_LABELS,
  PROJECT_KEYS_BY_LABEL,
  resolveProjectKey,
  labelOf,
  normalizeProjectRows,
  LOCATION_OPTIONS,
  DEPARTMENTS,
  DEPARTMENT_ALIASES,
  resolveDepartment,
  ROLES
}
