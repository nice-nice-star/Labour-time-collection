// 统计表的项目列定义（顺序与表头文案）。
//
// 本文件是 miniprogram/config/constants.js 里 PROJECT_ROWS 的副本：云函数不能跨目录
// require 小程序代码，而 Web 统计表的列顺序必须与表单第四题的项目顺序完全一致。
// tests/workflow.test.js 会逐项比对两处的 key、顺序、label、labelEn，防止列漂移。
//
// 费率不在这里重复：哪一列该出现、要不要拆「统筹/参与」两列，由 pivot.js 读
// constants.js 的 PROJECT_HOURS 决定。
const { PROJECT_KEYS } = require('./constants')

// 项目工时统计表的行（顺序与 README 的「项目工时统计表」一致，作为表单第四题的模板）
// key     稳定键（用于计算与提交，唯一身份）
// label   中文显示文本（当前界面即使用此字段，也是落库与导出的文本）
// labelEn 英文显示文本，目前只作为数据备用、不参与任何渲染
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

module.exports = { PROJECT_ROWS }
