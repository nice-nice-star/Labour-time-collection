// 本文件是 miniprogram/config/constants.js 中"项目费率"那部分的副本。
// 云函数无法跨目录 require 小程序代码，因此这里保留同一份费率表。
// 四处必须保持一致（本文件、miniprogram/config/constants.js、cloudfunctions/submitForm/constants.js、
// cloudfunctions/calculateMonthly/constants.js 里的部门部分不涉及费率）；
// tests/workflow.test.js 会校验费率表与三处副本完全一致。
//
// 「项目明细」工作表用它把申报数量折算成等效工时：参与数 × 参与费率 + 统筹数 × 统筹费率。

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
 * 把一行申报数量折算成等效工时：参与数 × 参与费率 + 统筹数 × 统筹费率。
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

module.exports = { PROJECT_KEYS, PROJECT_HOURS, rateOf, hoursOfRow }
