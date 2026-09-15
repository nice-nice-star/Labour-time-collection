// 项目工时统计表（每个产出项目的等效工时）
// 注意：视频剪辑为"待定"，用 null 表示，计算时跳过
const PROJECT_HOURS = {
  '深度访谈前期准备': 2,
  '参与深度访谈': 1,
  '访谈成稿': 3,
  '排版制作一条完整的视频': 3,
  '制作一条短视频 (1-5)mins': 4,
  '制作一条长视频 ~10mins': 8,
  '视频剪辑': null,          // 待定
  '小红书编辑一条': 3,
  '撰写一条海外社媒稿件': 1,
  '参与一场活动摄影': 2,
  '海报设计': 2,
  '新闻监测': 2,
  '组织一次内部活动': 8
}

// 项目工时统计表的行（与 README 表格顺序一致，作为表单第四题的模板）
const PROJECT_ROWS = [
  { item: '深度访谈前期准备', hours: 2 },
  { item: '参与深度访谈', hours: 1 },
  { item: '访谈成稿', hours: 3 },
  { item: '排版制作一条完整的视频', hours: 3 },
  { item: '制作一条短视频 (1-5)mins', hours: 4 },
  { item: '制作一条长视频 ~10mins', hours: 8 },
  { item: '视频剪辑', hours: '待定' },
  { item: '小红书编辑一条', hours: 3 },
  { item: '撰写一条海外社媒稿件', hours: 1 },
  { item: '参与一场活动摄影', hours: 2 },
  { item: '海报设计', hours: 2 },
  { item: '新闻监测', hours: 2 },
  { item: '组织一次内部活动', hours: 8 }
]

// 第三题（值班地点）选项
const LOCATION_OPTIONS = ['University gift shop', 'ABE303', 'ABW709']

// 角色
const ROLES = { EXPORT: 'export', STUDENT: 'student', UNBOUND: 'unbound' }

module.exports = { PROJECT_HOURS, PROJECT_ROWS, LOCATION_OPTIONS, ROLES }
