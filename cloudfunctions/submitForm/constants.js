// 本文件是 miniprogram/config/constants.js 的副本。
// 云函数无法跨目录 require 小程序代码，因此这里保留同一份数据。
// 费率表/标签表与小程序必须一致；部门枚举还要与 cloudfunctions/calculateMonthly/constants.js 一致。
// 三处（小程序、本文件、calculateMonthly）的漂移由 tests/workflow.test.js 校验。
//
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

// 项目工时统计表的行（顺序与 README 的「项目工时统计表」一致，作为表单第四题的模板）
// key     稳定键（用于计算与提交，唯一身份）
// label   中文显示文本（落库与导出的文本）
// labelEn 英文显示文本，目前只作为数据备用、不参与任何渲染
// 费率不在这里重复：展示与计算都从 PROJECT_HOURS 取，避免两处各写一份
const PROJECT_ROWS = [
  { key: PROJECT_KEYS.NEWS_ARTICLE, label: '新闻稿/通讯（800字内）', labelEn: 'News article / newsletter report (within 800 words)' },
  { key: PROJECT_KEYS.FEATURE_INTERVIEW, label: '人物专访（采访+成稿）', labelEn: 'Feature interview (conducting the interview + writing the article)' },
  { key: PROJECT_KEYS.IN_DEPTH_REPORT, label: '深度报道（文字或视频）', labelEn: 'In-depth report (written or video)' },
  { key: PROJECT_KEYS.SOCIAL_POST_COPY, label: '推文文案', labelEn: 'Social media post copywriting' },
  { key: PROJECT_KEYS.GRAPHIC_LAYOUT, label: '图文排版', labelEn: 'Graphic-and-text layout design' },
  { key: PROJECT_KEYS.POSTER, label: '海报设计', labelEn: 'Poster design' },
  { key: PROJECT_KEYS.LONG_GRAPHIC, label: '推文长图', labelEn: 'Long-form graphic for social media posts' },
  { key: PROJECT_KEYS.SHORT_VIDEO_1MIN, label: '短视频剪辑（≤1分钟）', labelEn: 'Short video editing (≤1 minute)' },
  { key: PROJECT_KEYS.SHORT_VIDEO_3MIN, label: '短视频剪辑（1–3分钟）', labelEn: 'Short video editing (1–3 minutes)' },
  { key: PROJECT_KEYS.EVENT_COVERAGE, label: '活动跟拍（半天）', labelEn: 'Event photo/video coverage (half day)' },
  { key: PROJECT_KEYS.DATA_REPORT, label: '数据报表', labelEn: 'Data report' },
  { key: PROJECT_KEYS.RECEPTION, label: '接待活动', labelEn: 'Reception / hospitality duties' },
  { key: PROJECT_KEYS.MANAGEMENT_PROJECT, label: '管理项目', labelEn: 'Management project' },
  { key: PROJECT_KEYS.TEAM_ACTIVITY, label: '集体活动', labelEn: 'Team / group activity' }
]

// 稳定键 → 中文显示文本
const PROJECT_LABELS = PROJECT_ROWS.reduce((acc, row) => {
  acc[row.key] = row.label
  return acc
}, {})

// 中文显示文本 → 稳定键
const PROJECT_KEYS_BY_LABEL = PROJECT_ROWS.reduce((acc, row) => {
  acc[row.label] = row.key
  return acc
}, {})

/**
 * 把中文名或稳定键统一解析为稳定键
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
 * 该项目是否开放统筹计数（费率为 null 的项目只有参与一种算法）
 * @param {string} key
 * @returns {boolean}
 */
function hasCoordinatorRate(key) {
  return rateOf(key, 'coordinator') != null
}

/**
 * 把任意来源的提交行归一化成统一结构：剔除无法识别的项目，
 * 每行按参与/统筹分别取非负整数。不开放统筹的项目忽略传入的统筹数量。
 * @param {Array} rows
 * @returns {Array<{key:string,label:string,counts:{participant:number,coordinator:number}}>}
 */
function normalizeProjectRows(rows) {
  return (rows || []).reduce((acc, row) => {
    const key = resolveProjectKey(row && (row.key || row.item))
    if (!key) return acc
    const saved = (row && row.counts) || {}
    const count = (value) => Math.max(0, Math.floor(Number(value) || 0))
    acc.push({
      key,
      label: labelOf(key),
      counts: {
        participant: count(saved.participant),
        coordinator: hasCoordinatorRate(key) ? count(saved.coordinator) : 0
      }
    })
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
  rateOf,
  hasCoordinatorRate,
  normalizeProjectRows,
  LOCATION_OPTIONS,
  DEPARTMENTS,
  DEPARTMENT_ALIASES,
  resolveDepartment,
  ROLES
}
