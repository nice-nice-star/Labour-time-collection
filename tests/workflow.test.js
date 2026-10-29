const test = require('node:test')
const assert = require('node:assert/strict')
const { createHarness } = require('./helpers/cloud-harness')
const { calcHours } = require('../miniprogram/utils/calc')
const { PROJECT_HOURS, PROJECT_KEYS, PROJECT_LABELS, PROJECT_LABELS_EN, PROJECT_ROWS, resolveProjectKey, labelOf, rateOf, hasCoordinatorRate, normalizeProjectRows, DEPARTMENTS, DEPARTMENT_ALIASES, DEPARTMENT_LABELS, resolveDepartment } = require('../miniprogram/config/constants')
const { resolveCloudEnv } = require('../miniprogram/config/environment')

// WXS 不是 CommonJS 模块，用 vm 执行并取其导出，用于校验模板侧费率表不漂移
function loadFormWxs() {
  const vm = require('node:vm')
  const fs = require('node:fs')
  const path = require('node:path')
  const filename = path.resolve(__dirname, '../miniprogram/pages/form/rates.wxs')
  const context = { module: { exports: {} } }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename })
  const wxs = context.module.exports
  // HOURS 没有导出，从行为上还原整张表
  return {
    rate: wxs.rate,
    hasCoordinator: wxs.hasCoordinator,
    isPending: wxs.isPending,
    rateText: wxs.rateText,
    hours: () => Object.fromEntries(
      Object.keys(PROJECT_HOURS).map(key => [key, {
        participant: wxs.rate(key, 'participant'),
        coordinator: wxs.rate(key, 'coordinator')
      }])
    )
  }
}

function fixture() {
  return {
    students: [
      // 主管乙的名单值故意写成小写带空格用于验证归一化；待绑定丙故意缺 department 用于验证空字符串
      { _id: 'a', name: '学助甲', studentId: 'S1', openid: 'wx-a', isSupervisor: false, department: 'Administration_and_Data' },
      { _id: 'b', name: '主管乙', studentId: 'S2', openid: 'wx-b', isSupervisor: true, department: ' administration_and_data ' },
      { _id: 'c', name: '待绑定丙', studentId: 'S3', isSupervisor: false }
    ],
    export_accounts: [{ _id: 't', name: '老师', exportId: 'T1', openid: 'wx-teacher' }],
    monthly_forms: [{ _id: 'f', month: '2026-10', status: 'open', deadline: '2026-10-20T00:00:00Z', createTime: '2026-10-01' }]
  }
}
const answer = { dutyHours: 30, shiftTime: '周一上午', locationIndex: 1,
  projectRows: [{ key: 'team_activity', counts: { participant: 2, coordinator: 0 } }], projectName: '测试项目', appeal: '' }

// 新版逐项填报：一条记录只算一个角色；同类型多条会汇总进 projectRows
const teamEntry = (overrides = {}) => ({
  key: 'team_activity', name: '运动会', role: 'participant', status: '已发布',
  completionForm: '现场', actualHours: 2, ...overrides
})

test('开发/体验/正式版本选择环境；缺失、同环境、未知版本拒绝连接', () => {
  const config = { production: 'prod', test: 'test' }
  assert.equal(resolveCloudEnv('release', config), 'prod')
  for (const version of ['develop', 'trial']) {
    assert.equal(resolveCloudEnv(version, config), 'test')
    assert.throws(() => resolveCloudEnv(version, { production: 'prod', test: '' }))
    assert.throws(() => resolveCloudEnv(version, { production: 'prod', test: 'prod' }))
  }
  assert.throws(() => resolveCloudEnv(undefined, config))
})

test('前端与云端的费率表、标签表完全一致（防止键值分离后两处漂移）', () => {
  const cloudConstants = require('../cloudfunctions/submitForm/constants')
  // 费率按稳定键对齐，比较原值以区分 null 与 0
  assert.deepEqual(
    Object.keys(PROJECT_HOURS).sort(),
    Object.keys(cloudConstants.PROJECT_HOURS).sort()
  )
  for (const key of Object.keys(PROJECT_HOURS)) {
    assert.deepEqual(PROJECT_HOURS[key], cloudConstants.PROJECT_HOURS[key], `费率不一致: ${key}`)
  }
  // 标签表与键值转换必须同步
  assert.deepEqual(PROJECT_LABELS, cloudConstants.PROJECT_LABELS)
  assert.equal(Object.keys(PROJECT_LABELS).length, 14)
})

test('exportData 的费率表副本与小程序一致，折算口径与 submitForm 相同', () => {
  const exportConstants = require('../cloudfunctions/exportData/constants')
  assert.deepEqual(
    Object.keys(PROJECT_HOURS).sort(),
    Object.keys(exportConstants.PROJECT_HOURS).sort()
  )
  for (const key of Object.keys(PROJECT_HOURS)) {
    assert.deepEqual(PROJECT_HOURS[key], exportConstants.PROJECT_HOURS[key], `导出费率不一致: ${key}`)
    for (const role of ['participant', 'coordinator']) {
      assert.equal(exportConstants.rateOf(key, role), rateOf(key, role), `导出费率取值不一致: ${key}/${role}`)
    }
  }
  // 折算公式：参与数 × 参与费率 + 统筹数 × 统筹费率；两端都待定时返回 null 而不是 0
  assert.equal(exportConstants.hoursOfRow('team_activity', { participant: 2, coordinator: 1 }), 12)  // 2×2 + 8×1
  assert.equal(exportConstants.hoursOfRow('poster', { participant: 0, coordinator: 0 }), 0)
  assert.equal(exportConstants.hoursOfRow('reception', { participant: 3, coordinator: 0 }), null)     // 按实际
  assert.equal(exportConstants.hoursOfRow('unknown_key', { participant: 1, coordinator: 0 }), null)   // 未知项目
})

test('表单 WXS 的费率表与 constants.js 完全一致（WXML 只能通过 WXS 取费率）', () => {
  const wxs = loadFormWxs()
  assert.equal(typeof wxs.rate, 'function')
  assert.deepEqual(wxs.hours(), PROJECT_HOURS)
  for (const key of Object.keys(PROJECT_HOURS)) {
    for (const role of ['participant', 'coordinator']) {
      assert.deepEqual(wxs.rate(key, role), rateOf(key, role), `WXS 费率不一致: ${key}/${role}`)
    }
    assert.equal(wxs.hasCoordinator(key), hasCoordinatorRate(key), `WXS 统筹开关不一致: ${key}`)
    // 展示文案：待定 / 仅参与 / 两种都有
    const r = PROJECT_HOURS[key]
    const expectedText = (r.participant === null && r.coordinator === null)
      ? '按实际 · 暂不计入'
      : (r.coordinator === null
        ? '仅参与 ' + r.participant + ' 小时 / 个'
        : '统筹 ' + r.coordinator + ' h/个 · 参与 ' + r.participant + ' h/个')
    assert.equal(wxs.rateText(key), expectedText, `WXS 文案不一致: ${key}`)
  }
  assert.equal(wxs.rate('unknown_key', 'participant'), null)
  assert.equal(wxs.rateText('unknown_key'), '按实际 · 暂不计入')
})

test('费率结构：参与/统筹两端、单值项目不开放统筹、按实际项目不计入', () => {
  const keys = Object.keys(PROJECT_HOURS)
  // 键集合与项目行模板完全一致
  assert.deepEqual(Object.keys(PROJECT_LABELS).sort(), keys.slice().sort())
  assert.deepEqual(PROJECT_ROWS.map(r => r.key).slice().sort(), keys.slice().sort())
  for (const key of keys) {
    const hours = PROJECT_HOURS[key]
    assert.deepEqual(Object.keys(hours).sort(), ['coordinator', 'participant'], `费率结构不对: ${key}`)
    for (const role of ['participant', 'coordinator']) {
      const rate = hours[role]
      // null 表示不计入；否则必须是正数
      if (rate !== null) {
        assert.equal(typeof rate, 'number', `费率不是数字: ${key}/${role}`)
        assert.ok(rate > 0, `费率应大于 0: ${key}/${role}`)
        assert.ok(Number.isFinite(rate), `费率应为有限数: ${key}/${role}`)
      }
    }
    // 统筹不应低于参与（区间上限 ≥ 下限）
    if (hours.coordinator !== null) {
      assert.ok(hours.coordinator >= hours.participant, `统筹低于参与: ${key}`)
    }
    // 展示文本：rateOf 与 hasCoordinatorRate 必须与费率表一致
    assert.deepEqual(rateOf(key, 'participant'), hours.participant)
    assert.deepEqual(rateOf(key, 'coordinator'), hours.coordinator)
    assert.equal(hasCoordinatorRate(key), hours.coordinator !== null)
  }
  // 单值项目（README 里只有一个标准工时）只开放参与
  for (const key of ['news_article', 'social_post_copy', 'short_video_1min', 'event_coverage', 'data_report']) {
    assert.equal(hasCoordinatorRate(key), false, `单值项目不应开放统筹: ${key}`)
    assert.ok(rateOf(key, 'participant') > 0, `单值项目应有参与费率: ${key}`)
  }
  // 「按实际」项目两端都是 null，暂不计入
  for (const key of ['reception', 'management_project']) {
    assert.equal(rateOf(key, 'participant'), null, `按实际项目不应有费率: ${key}`)
    assert.equal(rateOf(key, 'coordinator'), null, `按实际项目不应有费率: ${key}`)
  }
  // README 的区间与代码两端必须对上
  assert.equal(rateOf('feature_interview', 'participant'), 3)
  assert.equal(rateOf('feature_interview', 'coordinator'), 6)
  assert.equal(rateOf('in_depth_report', 'participant'), 4)
  assert.equal(rateOf('in_depth_report', 'coordinator'), 8)
  assert.equal(rateOf('team_activity', 'participant'), 2)
  assert.equal(rateOf('team_activity', 'coordinator'), 8)
})

test('每个项目都有英文名，且不为空、不重复、与中文名一一对应', () => {
  const keys = Object.keys(PROJECT_HOURS)
  // 与费率表、中文标签表的键完全一致
  assert.deepEqual(Object.keys(PROJECT_LABELS_EN).sort(), keys.slice().sort())
  const seen = new Set()
  for (const key of keys) {
    const en = PROJECT_LABELS_EN[key]
    assert.equal(typeof en, 'string', `英文名不是字符串: ${key}`)
    assert.ok(en.trim().length > 0, `英文名为空: ${key}`)
    assert.equal(en, en.trim(), `英文名首尾有空白: ${key}`)
    assert.ok(!seen.has(en), `英文名重复: ${en}`)
    seen.add(en)
    // 目前英文名只作数据备用，不应顶替中文显示文本
    assert.notEqual(PROJECT_LABELS[key], en, `英文名覆盖了中文显示文本: ${key}`)
  }
  // 与云函数侧副本保持一致
  const cloudConstants = require('../cloudfunctions/submitForm/constants')
  assert.deepEqual(
    PROJECT_LABELS_EN,
    cloudConstants.PROJECT_ROWS.reduce((acc, row) => { acc[row.key] = row.labelEn; return acc }, {})
  )
})

test('部门枚举与归一化规则在小程序、submitForm、calculateMonthly、exportData 四处完全一致', () => {
  const submitConstants = require('../cloudfunctions/submitForm/constants')
  const calcConstants = require('../cloudfunctions/calculateMonthly/constants')
  const exportConstants = require('../cloudfunctions/exportData/constants')
  assert.deepEqual(DEPARTMENTS, submitConstants.DEPARTMENTS)
  assert.deepEqual(DEPARTMENTS, calcConstants.DEPARTMENTS)
  assert.deepEqual(DEPARTMENTS, exportConstants.DEPARTMENTS)
  assert.deepEqual(DEPARTMENT_ALIASES, submitConstants.DEPARTMENT_ALIASES)
  assert.deepEqual(DEPARTMENT_ALIASES, calcConstants.DEPARTMENT_ALIASES)
  assert.deepEqual(DEPARTMENT_ALIASES, exportConstants.DEPARTMENT_ALIASES)
  // 每个别名在四处都必须归一到同一个规范值
  for (const alias of Object.keys(DEPARTMENT_ALIASES)) {
    const expected = resolveDepartment(alias)
    assert.equal(submitConstants.resolveDepartment(alias), expected, `submitForm 别名不一致: ${alias}`)
    assert.equal(calcConstants.resolveDepartment(alias), expected, `calculateMonthly 别名不一致: ${alias}`)
    assert.equal(exportConstants.resolveDepartment(alias), expected, `exportData 别名不一致: ${alias}`)
  }

  // 归一化：忽略大小写与多余空白
  assert.equal(resolveDepartment('Administration_and_Data'), 'Administration_and_Data')
  assert.equal(resolveDepartment('administration_and_data'), 'Administration_and_Data')
  assert.equal(resolveDepartment('  AdministratION_AND_data  '), 'Administration_and_Data')
  // 枚举外、留空、非字符串一律空字符串（不静默保留错值）
  for (const value of ['图书馆', 'Unknown_Department', '', '   ', null, undefined, 0]) {
    assert.equal(resolveDepartment(value), '', `枚举外的值未归一化为空字符串: ${value}`)
  }
  // 四处结果必须一致（含名单里可能出现的全角等写法）
  for (const value of ['Administration_and_Data', 'administration_and_data', '  AdministratION_AND_data  ', 'ＡＤＭＩＮＩＳＴＲＡＴＩＯＮ', '图书馆', '', null, undefined]) {
    const expected = resolveDepartment(value)
    assert.equal(submitConstants.resolveDepartment(value), expected, `submitForm 归一化不一致: ${value}`)
    assert.equal(calcConstants.resolveDepartment(value), expected, `calculateMonthly 归一化不一致: ${value}`)
    assert.equal(exportConstants.resolveDepartment(value), expected, `exportData 归一化不一致: ${value}`)
  }
})

test('部门别名：中文名与带空格英文都归一到规范值，覆盖全部枚举', async () => {
  // 每个别名（含大写形式）都必须归一到规范值
  for (const [alias, canonical] of Object.entries(DEPARTMENT_ALIASES)) {
    assert.equal(resolveDepartment(alias), canonical, `别名未归一化: ${alias}`)
    assert.equal(resolveDepartment(alias.toUpperCase()), canonical, `别名大写未归一化: ${alias}`)
  }
  // 值班地点里的写法与规范值只差下划线和大小写
  assert.equal(resolveDepartment('University gift shop'), 'University_Gift_shop')
  // 别名表是普通对象：原型链上的键不能命中
  assert.equal(resolveDepartment('constructor'), '')
  assert.equal(resolveDepartment('toString'), '')

  // 名单里写中文名与带空格英文：提交与补零两条路径都要落成规范值
  const seed = fixture()
  seed.students[0].department = '公共关系'
  seed.students[1].department = 'Domestic social Media'
  const h = createHarness(seed)
  await h.call('submitForm', 'wx-a', answer)
  assert.equal(h.tables.submissions[0].department, 'Public_Relations')
  h.tables.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
  await h.call('calculateMonthly', undefined)
  assert.equal(h.tables.submissions.find(r => r.openid === 'wx-b').department, 'Domestic_social_Media')
})

test('稳定键与中文显示文本可双向解析；归一化按参与/统筹取非负整数', () => {
  // 稳定键可解析
  assert.equal(resolveProjectKey(PROJECT_KEYS.TEAM_ACTIVITY), PROJECT_KEYS.TEAM_ACTIVITY)
  assert.equal(labelOf(PROJECT_KEYS.TEAM_ACTIVITY), '集体活动')
  // 中文名也可解析（表单与导出都按中文名落库）
  assert.equal(resolveProjectKey('集体活动'), PROJECT_KEYS.TEAM_ACTIVITY)
  assert.equal(resolveProjectKey('不存在的项目'), null)
  assert.equal(resolveProjectKey(undefined), null)

  const row = (key, participant, coordinator) => ({
    key, label: labelOf(key), counts: { participant, coordinator }
  })

  // 两个角色都开放的项目：分别计数
  assert.deepEqual(normalizeProjectRows([{ key: 'team_activity', counts: { participant: 2, coordinator: 1 } }]), [
    row('team_activity', 2, 1)
  ])
  // 只开放参与的项目：统筹数量被清零，不落库
  assert.deepEqual(normalizeProjectRows([{ key: 'data_report', counts: { participant: 3, coordinator: 5 } }]), [
    row('data_report', 3, 0)
  ])
  // 缺失 counts 按 0 处理
  assert.deepEqual(normalizeProjectRows([{ key: 'poster', counts: {} }]), [row('poster', 0, 0)])
  // 小数与负数：取整并夹到 0
  assert.deepEqual(normalizeProjectRows([{ key: 'poster', counts: { participant: 1.7, coordinator: -5 } }]), [
    row('poster', 1, 0)
  ])
  assert.deepEqual(normalizeProjectRows([{ key: 'unknown_item', counts: { participant: 2 } }]), [])
  assert.deepEqual(normalizeProjectRows(null), [])
  // 幂等：已归一化的结果再归一化不变
  const once = normalizeProjectRows([{ key: 'poster', counts: { participant: 3, coordinator: 2 } }])
  assert.deepEqual(normalizeProjectRows(once), once)
})

test('登录识别四种身份，事件参数不能伪造微信身份', async () => {
  const h = createHarness(fixture())
  for (const [id, role] of [['wx-a', 'student'], ['wx-b', 'student'], ['wx-teacher', 'export'], ['stranger', 'unbound']]) {
    assert.equal((await h.call('login', id, { OPENID: 'wx-teacher', openid: 'wx-teacher', role: 'export' })).role, role)
  }
})

test('首次绑定、再次登录、同账户重复绑定与他人抢绑', async () => {
  const h = createHarness(fixture())
  const account = { name: '待绑定丙', studentId: 'S3' }
  assert.equal((await h.call('bindStudent', 'new-user', account)).ok, true)
  assert.equal((await h.call('login', 'new-user')).user.studentId, 'S3')
  assert.equal((await h.call('bindStudent', 'new-user', account)).ok, true)
  assert.equal((await h.call('bindStudent', 'attacker', account)).ok, false)
  assert.equal(h.tables.students[2].openid, 'new-user')
})

test('姓名和 ID 必须匹配；缺少参数拒绝绑定', async () => {
  const h = createHarness(fixture())
  for (const data of [{}, { name: '错误', studentId: 'S3' }, { name: '待绑定丙', studentId: '错误' }]) {
    assert.equal((await h.call('bindStudent', 'new-user', data)).ok, false)
  }
  assert.equal(h.tables.students[2].openid, undefined)
})

test('老师也能首次绑定并被识别', async () => {
  const seed = fixture()
  delete seed.export_accounts[0].openid
  seed.export_accounts[0].department = 'Administration_and_Data'
  const h = createHarness(seed)
  assert.equal((await h.call('bindStudent', 'new-teacher', { name: '老师', studentId: 'T1' })).role, 'export')
  const login = await h.call('login', 'new-teacher')
  assert.equal(login.role, 'export')
  // 小程序端拿到整条导出账户记录，部门随身份进 app.globalData.user，页面据此默认选中本部门
  assert.equal(login.user.department, 'Administration_and_Data')
})

for (const fn of ['createMonthlyForm', 'listForms', 'exportData']) {
  test(`${fn}：普通学助、主管、陌生人无法冒充老师`, async () => {
    const h = createHarness(fixture())
    for (const id of ['wx-a', 'wx-b', 'stranger']) {
      assert.equal((await h.call(fn, id, { month: '2026-10', formId: 'f', openid: 'wx-teacher', role: 'export' })).ok, false)
    }
    assert.equal(h.uploads.length, 0)
  })
}

// —— 老师权限的安全边界 ——
// 微信云开发的运行时只把身份写进 process.env（cloud.getWXContext() 读的就是它），
// 并不存在「每次调用的 context 身份通道」——曾按腾讯云 CloudBase 文档的 parseContext
// 方案改造过，结果老师端全部报「未登录」，已回退。
// 因此真正的边界不在函数内部，而在平台的「云函数安全规则」：默认 auth != null 时，
// 未登录来源根本调不到这些函数。函数内的 !OPENID 判断是第二道防线。

// 需要老师权限的云函数，必须全部落在 auth != null 之下
const GUARDED_FUNCTIONS = ['createMonthlyForm', 'listForms', 'exportData', 'getSubmissions']

test('匿名调用（未登录来源）拿不到老师权限，不写库也不导出', async () => {
  const h = createHarness(fixture())
  for (const fn of GUARDED_FUNCTIONS) {
    const res = await h.call(fn, undefined, { month: '2026-10', formId: 'f' })
    assert.equal(res.ok, false, `${fn} 放行了没有 openid 的调用`)
    assert.equal(res.msg, '未登录')
  }
  assert.equal(h.uploads.length, 0)
  assert.equal(h.tables.monthly_forms.length, 1)   // 匿名调用没能新建表单
})

// —— Web 管理端：未登录模式 + 自建凭据 ——
// 网页访客没有微信身份，所以 web* 函数只认自己签发的凭据：
//   激活 webBind（姓名 + 工号完全一致）→ 登录 webLogin 换票据 → webSession 恢复会话
// 票据是无状态 HMAC，密钥来自云函数环境变量 WEB_TOKEN_SECRET。

const WEB_SECRET = 'test-secret-at-least-16-chars'
const WEB_FUNCTIONS = [
  'webBind', 'webLogin', 'webSession',
  'webStudentBind', 'webStudentLogin',
  'webGetForm', 'webSubmitForm',
  'webListForms', 'webCreateMonthlyForm', 'webGetSubmissions', 'webExportData'
]
// 小程序端与 Web 端必须共用同一份纯逻辑，否则两边口径会漂移
const SHARED_MODULES = [
  ['rows.js', 'getSubmissions', 'webGetSubmissions'],
  ['departments.js', 'getSubmissions', 'webGetSubmissions'],
  // Web 统计表导出另起了一套版式（pivot.js），但进度口径与部门映射仍与「填报情况」页同源
  ['rows.js', 'webGetSubmissions', 'webExportData'],
  ['departments.js', 'webGetSubmissions', 'webExportData'],
  // 老师自己的部门要在登录载荷里按同一张表转展示文本，两份副本也必须逐字节一致
  ['departments.js', 'getSubmissions', 'webLogin'],
  ['departments.js', 'webLogin', 'webSession'],
  // 学助登录载荷也要把名单里的部门原值转成中文展示名
  ['departments.js', 'webLogin', 'webStudentLogin'],
  // 学助网页填报表单复用 submitForm 的枚举、校验与折算副本
  ['constants.js', 'submitForm', 'webGetForm'],
  ['projects.js', 'submitForm', 'webGetForm'],
  ['constants.js', 'submitForm', 'webSubmitForm'],
  ['projects.js', 'submitForm', 'webSubmitForm'],
  ['project-weighting.js', 'submitForm', 'webSubmitForm'],
  ['constants.js', 'exportData', 'webExportData']
]
process.env.WEB_TOKEN_SECRET = WEB_SECRET

function webFixture() {
  const seed = fixture()
  // 第二个老师账户，用于验证「票据归属」不会与残留的微信身份串号
  seed.export_accounts.push({ _id: 't2', name: '老师乙', exportId: 'T2', openid: 'wx-teacher-2' })
  return seed
}

const PASSWORD = 'goodpassword'

async function loginStudent(h, name, studentId) {
  await h.call('webStudentBind', undefined, { name, studentId, password: PASSWORD })
  return h.call('webStudentLogin', undefined, { name, studentId, password: PASSWORD })
}

// 临时开关只在单个用例内打开，finally 恢复，避免影响其它用例。
async function withUnboundWeb(fn) {
  const previous = process.env.WEB_ALLOW_UNBOUND
  process.env.WEB_ALLOW_UNBOUND = 'true'
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.WEB_ALLOW_UNBOUND
    else process.env.WEB_ALLOW_UNBOUND = previous
  }
}

test('Web 凭据：姓名 + 工号完全一致才可激活，激活后可登录并换取会话', async () => {
  const h = createHarness(webFixture())
  // 姓名或工号对不上：拒绝
  for (const bad of [{ name: '老师', exportId: 'X' }, { name: 'X', exportId: 'T1' }, { name: '', exportId: 'T1' }]) {
    assert.equal((await h.call('webBind', undefined, { ...bad, password: PASSWORD })).ok, false, JSON.stringify(bad))
  }
  // 密码太短：拒绝，且不落库
  assert.equal((await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: 'short' })).ok, false)
  assert.equal(h.tables.export_accounts[0].webPasswordHash, undefined)

  assert.equal((await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })).ok, true)
  const stored = h.tables.export_accounts[0]
  assert.ok(stored.webPasswordHash && stored.webPasswordSalt, '激活后应写入哈希与盐')
  assert.equal(JSON.stringify(h.tables.export_accounts).includes(PASSWORD), false, '不得存明文密码')

  const login = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  assert.equal(login.ok, true)
  assert.equal(login.role, 'export', '老师票据必须带 role=export')
  assert.ok(login.token, '登录成功应返回票据')
  assert.deepEqual(login.user, { name: '老师', exportId: 'T1', department: '', departmentText: '' })

  const session = await h.call('webSession', undefined, { token: login.token })
  assert.equal(session.ok, true)
  assert.equal(session.role, 'export')
  assert.deepEqual(session.user, { name: '老师', exportId: 'T1', department: '', departmentText: '' })
})

test('Web 登录与恢复会话都带出老师自己的部门，并按映射表转成展示文本', async () => {
  const seed = webFixture()
  seed.export_accounts[0].department = ' administration_and_data '
  const h = createHarness(seed)
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })

  const login = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  assert.deepEqual(login.user, {
    name: '老师',
    exportId: 'T1',
    department: 'administration_and_data',
    departmentText: '行政与数据'
  })

  // 刷新页面走 webSession：默认筛选靠这份载荷，不能丢部门
  const session = await h.call('webSession', undefined, { token: login.token })
  assert.deepEqual(session.user, login.user)

  // 枚举外的旧值原样下发：学生行的部门列也是这么显示的，页面按同一段文本匹配
  h.tables.export_accounts[0].department = 'CPRO'
  assert.equal((await h.call('webSession', undefined, { token: login.token })).user.departmentText, 'CPRO')

  // 没填部门：给空字符串而不是「未设置」，否则默认筛选会指到「没有部门的学助」上
  h.tables.export_accounts[0].department = undefined
  const missing = await h.call('webSession', undefined, { token: login.token })
  assert.equal(missing.user.department, '')
  assert.equal(missing.user.departmentText, '')
})

test('Web 凭据：已激活的账户拒绝再次绑定，防止知道姓名工号的人顶掉密码', async () => {
  const h = createHarness(webFixture())
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const before = h.tables.export_accounts[0].webPasswordHash

  const again = await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: 'attackerpass' })
  assert.equal(again.ok, false)
  assert.equal(h.tables.export_accounts[0].webPasswordHash, before, '重复绑定不得覆盖已有哈希')
  // 原密码仍然有效，攻击者设的密码无效
  assert.equal((await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })).ok, true)
  assert.equal((await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: 'attackerpass' })).ok, false)
})

test('Web 登录：未激活、密码错、工号错、账户不存在返回同一句提示，不泄露账户是否存在', async () => {
  const h = createHarness(webFixture())
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const cases = [
    { name: '老师', exportId: 'T1', password: 'wrongpassword' },    // 密码错
    { name: '老师', exportId: 'T9', password: PASSWORD },           // 工号错
    { name: '查无此人', exportId: 'T1', password: PASSWORD },        // 账户不存在
    { name: '老师乙', exportId: 'T2', password: PASSWORD }           // 存在但未激活
  ]
  const msgs = new Set()
  for (const data of cases) {
    const res = await h.call('webLogin', undefined, data)
    assert.equal(res.ok, false)
    msgs.add(res.msg)
  }
  assert.equal(msgs.size, 1, '不同失败原因必须回同一句话，避免枚举账户')
  // 参数缺失属于请求格式错误，允许提示得更具体（不涉及账户是否存在）
  assert.equal((await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: '' })).ok, false)
})

test('Web 会话：篡改、过期、换密钥、缺密钥一律拒绝', async () => {
  const h = createHarness(webFixture())
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const { token } = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const [body, sig] = token.split('.')

  for (const bad of [undefined, '', 'not-a-token', `${token}x`, body, `x.${sig}`, `${body}.${sig}x`]) {
    assert.equal((await h.call('webSession', undefined, { token: bad })).ok, false, `放行了非法票据: ${bad}`)
  }

  const { signToken } = require('../cloudfunctions/webSession/webauth')
  // 过期票据：签名合法但已超出有效期
  const expired = signToken(h.tables.export_accounts[0]._id, WEB_SECRET, 'export', Date.now() - 2 * 24 * 60 * 60 * 1000)
  assert.equal((await h.call('webSession', undefined, { token: expired })).ok, false, '过期票据被放行')
  // 换密钥签的票据不认
  assert.equal((await h.call('webSession', undefined, { token: signToken('t', 'another-secret-16-chars-long') })).ok, false)

  // 缺密钥：拒绝服务，而不是退回无签名校验
  delete process.env.WEB_TOKEN_SECRET
  try {
    assert.equal((await h.call('webSession', undefined, { token })).ok, false)
    assert.equal((await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })).ok, false)
    assert.equal((await h.call('webStudentLogin', undefined, { name: '主管乙', studentId: 'S2', password: PASSWORD })).ok, false)
  } finally {
    process.env.WEB_TOKEN_SECRET = WEB_SECRET
  }
})

test('Web 函数不读调用方环境身份：残留的微信身份不会串号', async () => {
  const h = createHarness(webFixture())
  // 老师甲先用小程序调用，实例里留下残留身份
  assert.equal((await h.call('listForms', 'wx-teacher')).ok, true)

  await h.call('webBind', undefined, { name: '老师乙', exportId: 'T2', password: PASSWORD })
  const { token } = await h.call('webLogin', undefined, { name: '老师乙', exportId: 'T2', password: PASSWORD })

  // 残留身份是老师甲，票据属于老师乙：必须按票据判定，不能串号
  const session = await h.call('webSession', undefined, { token })
  assert.deepEqual(session.user, { name: '老师乙', exportId: 'T2', department: '', departmentText: '' })
  // 没有票据时，残留身份也换不到任何东西
  assert.equal((await h.call('webSession', undefined, {})).ok, false)
})

// —— Web 学助端：与老师同一套自建凭据，账户在 students 集合，票据带 role=student ——

test('Web 学助凭据：姓名 + 学号完全一致才可激活，凭据写入 students 而不是 export_accounts', async () => {
  const h = createHarness(webFixture())
  // 姓名或学号对不上：拒绝
  for (const bad of [{ name: '待绑定丙', studentId: 'X' }, { name: 'X', studentId: 'S3' }, { name: '', studentId: 'S3' }]) {
    assert.equal((await h.call('webStudentBind', undefined, { ...bad, password: PASSWORD })).ok, false, JSON.stringify(bad))
  }
  // 密码太短：拒绝，且不落库
  assert.equal((await h.call('webStudentBind', undefined, { name: '待绑定丙', studentId: 'S3', password: 'short' })).ok, false)
  assert.equal(h.tables.students[2].webPasswordHash, undefined)

  assert.equal((await h.call('webStudentBind', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })).ok, true)
  const stored = h.tables.students[2]
  assert.ok(stored.webPasswordHash && stored.webPasswordSalt, '激活后应写入哈希与盐')
  assert.equal(JSON.stringify(h.tables.students).includes(PASSWORD), false, '不得存明文密码')
  assert.equal(h.tables.export_accounts.some(a => a.webPasswordHash), false, '不应写到老师账户上')
})

test('Web 学助登录：返回 role=student 与脱敏载荷，webSession 可恢复且不泄露 openid/密码字段', async () => {
  const h = createHarness(webFixture())
  await h.call('webStudentBind', undefined, { name: '主管乙', studentId: 'S2', password: PASSWORD })

  const login = await h.call('webStudentLogin', undefined, { name: '主管乙', studentId: 'S2', password: PASSWORD })
  assert.equal(login.ok, true)
  assert.equal(login.role, 'student')
  assert.ok(login.token, '登录成功应返回票据')
  // 名单里的部门是 ' administration_and_data '，与老师端同一口径：trim 原值 + 中文展示名
  assert.deepEqual(login.user, {
    name: '主管乙',
    studentId: 'S2',
    isSupervisor: true,
    department: 'administration_and_data',
    departmentText: '行政与数据'
  })
  const payload = JSON.stringify(login)
  assert.equal(payload.includes('webPassword'), false, '登录载荷不得带出口令哈希')
  assert.equal(payload.includes('openid'), false, '登录载荷不得带出 openid')

  const session = await h.call('webSession', undefined, { token: login.token })
  assert.equal(session.ok, true)
  assert.equal(session.role, 'student')
  assert.deepEqual(session.user, login.user)
})

test('Web 学助：已激活拒绝重绑，登录失败统一提示', async () => {
  const h = createHarness(webFixture())
  await h.call('webStudentBind', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })
  const before = h.tables.students[2].webPasswordHash

  const again = await h.call('webStudentBind', undefined, { name: '待绑定丙', studentId: 'S3', password: 'attackerpass' })
  assert.equal(again.ok, false)
  assert.equal(h.tables.students[2].webPasswordHash, before, '重复绑定不得覆盖已有哈希')
  assert.equal((await h.call('webStudentLogin', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })).ok, true)
  assert.equal((await h.call('webStudentLogin', undefined, { name: '待绑定丙', studentId: 'S3', password: 'attackerpass' })).ok, false)

  // 未激活、密码错、学号错、账户不存在返回同一句提示，不泄露账户是否存在
  const cases = [
    { name: '待绑定丙', studentId: 'S3', password: 'wrongpassword' },
    { name: '待绑定丙', studentId: 'S9', password: PASSWORD },
    { name: '查无此人', studentId: 'S3', password: PASSWORD },
    { name: '学助甲', studentId: 'S1', password: PASSWORD }
  ]
  const msgs = new Set()
  for (const data of cases) {
    const res = await h.call('webStudentLogin', undefined, data)
    assert.equal(res.ok, false)
    msgs.add(res.msg)
  }
  assert.equal(msgs.size, 1, '不同失败原因必须回同一句话，避免枚举账户')
})

test('学助票据不能调用老师数据接口：role 参与签名，不能靠 id 撞库', async () => {
  const h = createHarness(webFixture())
  await h.call('webStudentBind', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })

  const guarded = [
    ['webListForms', {}],
    ['webCreateMonthlyForm', { month: '2026-11' }],
    ['webGetSubmissions', { formId: 'f' }],
    ['webExportData', { formId: 'f' }]
  ]
  for (const [fn, base] of guarded) {
    const res = await h.call(fn, undefined, { ...base, token })
    assert.equal(res.ok, false, `${fn} 放行了学助票据`)
    assert.equal(res.forms, undefined)
    assert.equal(res.rows, undefined)
    assert.equal(res.url, undefined)
  }
  assert.equal(h.uploads.length, 0, '学助票据不得触发导出上传')
  assert.equal(h.tables.monthly_forms.length, 1, '学助票据不得新建表单')

  // 即便学助记录的 _id 与某条老师账户相同，role=student 也必须被 requireExport 拒绝
  const seed = webFixture()
  seed.students.push({ _id: 't', name: '撞号学助', studentId: 'S9', webPasswordSalt: 'salt', webPasswordHash: 'hash' })
  const collided = createHarness(seed)
  const { signToken } = require('../cloudfunctions/webSession/webauth')
  const studentToken = signToken('t', WEB_SECRET, 'student')
  assert.equal((await collided.call('webSession', undefined, { token: studentToken })).role, 'student')
  assert.equal((await collided.call('webListForms', undefined, { token: studentToken })).ok, false, 'role=student 的票据混进了老师接口')
})

test('旧版老师票据（无 role）升级后仍可用于老师接口', async () => {
  const h = createHarness(webFixture())
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  // 手工构造升级前格式的票据：body 里没有 role 字段
  const crypto = require('node:crypto')
  // webauth.js 通过宿主 require 加载，过期判断用的是真实时钟，这里给一个远期时间
  const exp = new Date('2099-01-01T00:00:00Z').getTime()
  const body = Buffer.from(JSON.stringify({ sub: 't', exp })).toString('base64url')
  const sig = Buffer.from(crypto.createHmac('sha256', WEB_SECRET).update(body).digest()).toString('base64url')
  const token = `${body}.${sig}`
  const session = await h.call('webSession', undefined, { token })
  assert.equal(session.ok, true)
  assert.equal(session.role, 'export', '缺 role 的旧票据按老师处理')
  assert.equal((await h.call('webListForms', undefined, { token })).ok, true)
})

test('小程序登录/绑定不回传 Web 口令字段', async () => {
  const h = createHarness(webFixture())
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  await h.call('webStudentBind', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })

  const teacher = await h.call('login', 'wx-teacher')
  assert.equal(teacher.user.exportId, 'T1', '小程序仍能拿到身份本身需要的字段')
  assert.equal(JSON.stringify(teacher.user).includes('webPassword'), false, '老师登录载荷不得带口令哈希')

  const bound = await h.call('bindStudent', 'new-user', { name: '待绑定丙', studentId: 'S3' })
  assert.equal(bound.ok, true)
  assert.equal(JSON.stringify(bound.user).includes('webPassword'), false, '绑定结果不得带口令哈希')

  const student = await h.call('login', 'new-user')
  assert.equal(student.user.studentId, 'S3')
  assert.equal(JSON.stringify(student.user).includes('webPassword'), false, '学助登录载荷不得带口令哈希')
})

// —— Web 学助端：网页填报表单 ——
// 读：webGetForm（只回传自己的提交 + 选项）
// 写：webSubmitForm（与小程序 submitForm 共用同一条 submissions，身份由票据解析）

test('Web 学助表单：只认学助票据，未提交时返回本月表单与选项', async () => {
  const h = createHarness(webFixture())
  // 无票据 / 老师票据都拒绝
  assert.equal((await h.call('webGetForm', undefined, {})).ok, false)
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const teacher = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  assert.equal((await h.call('webGetForm', undefined, { token: teacher.token })).ok, false)

  await h.call('webStudentBind', undefined, { name: '主管乙', studentId: 'S2', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '主管乙', studentId: 'S2', password: PASSWORD })
  const res = await h.call('webGetForm', undefined, { token })
  assert.equal(res.ok, true)
  assert.equal(res.form.month, '2026-10')
  assert.equal(res.form.status, 'open')
  assert.equal(res.bound, true)
  assert.equal(res.canSubmit, true)
  assert.equal(res.submission, null)
  assert.deepEqual(res.meta.locationOptions, ['University gift shop', 'ABE303', 'ABW709'])
  assert.deepEqual(res.meta.statusOptions, ['已发布', '已完成未发布', '未完成'])
  assert.equal(res.meta.projectRows.length, 14)
  assert.equal(JSON.stringify(res).includes('openid'), false, '表单载荷不得带出 openid')
})

test('Web 学助表单：只回传自己的提交，小程序提交的内容可以直接回填', async () => {
  const h = createHarness(webFixture())
  // 两个学助各提交一条：学助甲 30 小时，主管乙 10 小时
  await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 30 })
  await h.call('submitForm', 'wx-b', { ...answer, dutyHours: 10 })

  await h.call('webStudentBind', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const res = await h.call('webGetForm', undefined, { token })
  assert.equal(res.ok, true)
  assert.equal(res.submission.answers.answer1, '30')
  assert.equal(res.submission.answers.answer2, '周一上午')
  assert.equal(res.submission.projectRows.length, 1)
  assert.equal(res.submission.projects.length, 0, '旧版记录没有逐项 projects')
  const payload = JSON.stringify(res)
  assert.equal(payload.includes('wx-b'), false, '不得带出其他学助的 openid')
  assert.equal(payload.includes('主管乙'), false, '不得带出其他学助的数据')
})

test('Web 学助表单：本月没有表单时返回空表单而不是报错', async () => {
  const seed = webFixture()
  seed.monthly_forms = []
  const h = createHarness(seed)
  await h.call('webStudentBind', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const res = await h.call('webGetForm', undefined, { token })
  assert.equal(res.ok, true)
  assert.equal(res.form, null)
  assert.equal(res.canSubmit, false)
  assert.ok(res.meta)
})

test('Web 学助提交：与小程序写同一条记录，重复提交覆盖且计算结果一致', async () => {
  const payload = {
    dutyHours: 30,
    shiftTime: '周一上午',
    locationIndex: 1,
    projects: [teamEntry()],
    appeal: '补充说明'
  }
  const mini = createHarness(webFixture())
  const miniResult = await mini.call('submitForm', 'wx-b', payload)
  assert.equal(miniResult.ok, true)

  const h = createHarness(webFixture())
  // 老师票据不能提交
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const teacher = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  assert.equal((await h.call('webSubmitForm', undefined, { token: teacher.token, ...payload })).ok, false)
  assert.equal((h.tables.submissions || []).length, 0)

  await h.call('webStudentBind', undefined, { name: '主管乙', studentId: 'S2', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '主管乙', studentId: 'S2', password: PASSWORD })
  const webResult = await h.call('webSubmitForm', undefined, { token, ...payload })
  assert.equal(webResult.ok, true)
  assert.deepEqual(webResult.calc, miniResult.calc, '两端计算结果必须一致')
  assert.equal(h.tables.submissions.length, 1)
  assert.equal(h.tables.submissions[0].openid, 'wx-b')
  assert.equal(h.tables.submissions[0].department, 'Administration_and_Data')
  assert.equal(h.tables.submissions[0].source, 'student')

  // 除 _id/时间戳外，落库结构必须与小程序端一致
  const strip = row => {
    const { _id, createTime, updateTime, ...rest } = row
    return rest
  }
  assert.deepEqual(strip(h.tables.submissions[0]), strip(mini.tables.submissions[0]))

  // 小程序端能读到网页写的同一条记录
  const miniView = await h.call('getForm', 'wx-b')
  assert.equal(miniView.submission._id, h.tables.submissions[0]._id)
  assert.equal(miniView.submission.answers.answer1, '30')

  // 再提交一次：覆盖同一条，不新增
  const again = await h.call('webSubmitForm', undefined, { token, ...payload, dutyHours: 12 })
  assert.equal(again.ok, true)
  assert.equal(h.tables.submissions.length, 1)
  assert.equal(h.tables.submissions[0].calc.dutyHours, 12)
})

test('Web 学助提交：只有值班、没有项目也能提交', async () => {
  const h = createHarness(webFixture())
  await h.call('webStudentBind', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const res = await h.call('webSubmitForm', undefined, {
    token,
    dutyHours: 7.5,
    shiftTime: '周三下午',
    locationIndex: 2,
    projects: [],
    appeal: '本月只有值班'
  })
  assert.equal(res.ok, true)
  const row = h.tables.submissions[0]
  assert.deepEqual(row.projects, [])
  assert.deepEqual(row.projectRows, [])
  assert.equal(row.calc.projectHours, 0)
  assert.equal(row.calc.totalHours, 7.5)
  assert.equal(row.calc.effectiveHours, 7.5)
  assert.equal(row.answers.answer2, '周三下午')
  assert.equal(row.answers.answer3, 'ABW709')
  assert.equal(row.answers.answer6, '本月只有值班')
})

test('Web 学助提交：非法地点下标落成空字符串，不会命中原型链', async () => {
  const h = createHarness(webFixture())
  await h.call('webStudentBind', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const base = { token, dutyHours: 1, shiftTime: '', projects: [], appeal: '' }

  assert.equal((await h.call('webSubmitForm', undefined, { ...base, locationIndex: 'constructor' })).ok, true)
  assert.equal(h.tables.submissions[0].answers.answer3, '')

  // null / undefined 不能因为 Number(null) === 0 被当成第一个地点
  await h.call('webSubmitForm', undefined, { ...base, locationIndex: null })
  assert.equal(h.tables.submissions[0].answers.answer3, '')
  await h.call('webSubmitForm', undefined, { ...base, locationIndex: 1 })
  assert.equal(h.tables.submissions[0].answers.answer3, 'ABE303')
})

test('Web 学助提交：旧版按类型计数的记录会保留，不会被新表单清掉', async () => {
  const h = createHarness(webFixture())
  // 旧版提交：只有 projectRows（集体活动参与 2 次），没有 projects
  await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 5 })
  await h.call('webStudentBind', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })

  const view = await h.call('webGetForm', undefined, { token })
  assert.equal(view.submission.projects.length, 0)
  assert.equal(view.submission.projectRows.length, 1)

  const result = await h.call('webSubmitForm', undefined, {
    token,
    dutyHours: 5,
    shiftTime: '',
    locationIndex: -1,
    projects: [teamEntry({ key: 'poster', name: '海报', role: 'participant', status: '已发布', actualHours: 1 })],
    appeal: ''
  })
  assert.equal(result.ok, true)
  const row = h.tables.submissions[0]
  assert.equal(row.legacyProjectRows.length, 1)
  assert.equal(row.legacyProjectRows[0].key, 'team_activity')
  assert.equal(row.projects.length, 1)
  // 旧记录：集体活动参与 2 × 2 = 4；新记录：海报参与 1 × 1 × 0.3 = 0.3
  assert.equal(row.calc.projectHours, 4.3)
  assert.equal(row.answers.answer5, '测试项目、海报')
})

test('Web 学助表单：未绑定微信只读，提交被拒绝', async () => {
  const h = createHarness(webFixture())
  await h.call('webStudentBind', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '待绑定丙', studentId: 'S3', password: PASSWORD })

  const view = await h.call('webGetForm', undefined, { token })
  assert.equal(view.ok, true)
  assert.equal(view.bound, false)
  assert.equal(view.identitySource, '')
  assert.equal(view.canSubmit, false)
  assert.equal(view.submission, null)

  const result = await h.call('webSubmitForm', undefined, {
    token,
    dutyHours: 1,
    shiftTime: '',
    locationIndex: -1,
    projects: [],
    appeal: ''
  })
  assert.equal(result.ok, false)
  assert.equal(result.msg, '请先在小程序完成微信绑定后再填写')
  assert.equal((h.tables.submissions || []).length, 0)
})

test('Web 临时身份：WEB_ALLOW_UNBOUND=true 时未绑定学助可提交，并生成 web 身份', async () => {
  await withUnboundWeb(async () => {
    const h = createHarness(webFixture())
    const { token } = await loginStudent(h, '待绑定丙', 'S3')

    const view = await h.call('webGetForm', undefined, { token })
    assert.equal(view.ok, true)
    assert.equal(view.bound, false)
    assert.equal(view.identitySource, '')
    assert.equal(view.canSubmit, true, '开关打开后未绑定也可以先填')

    const result = await h.call('webSubmitForm', undefined, {
      token,
      dutyHours: 8,
      shiftTime: '周二',
      locationIndex: 0,
      projects: [teamEntry()],
      appeal: ''
    })
    assert.equal(result.ok, true)

    const stu = h.tables.students[2]
    assert.equal(stu.openid, 'web:c')
    assert.equal(stu.openidSource, 'web')
    assert.equal(h.tables.submissions[0].openid, 'web:c')

    const again = await h.call('webGetForm', undefined, { token })
    assert.equal(again.bound, false)
    assert.equal(again.identitySource, 'web')
    assert.equal(again.canSubmit, true)
    assert.equal(again.submission.answers.answer1, '8')

    // 老师端进度：有身份键（web:<_id>）即计入 bound，能正常显示已提交与工时
    const progress = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
    const row = progress.rows.find(r => r.studentId === 'S3')
    assert.equal(row.identitySource, 'web')
    assert.equal(row.bound, true)
    assert.equal(row.submitted, true)
    assert.equal(row.effectiveHours, result.calc.effectiveHours)
  })
})

test('Web 临时身份：小程序绑定真实微信时迁移历史提交并转为 wechat', async () => {
  await withUnboundWeb(async () => {
    const h = createHarness(webFixture())
    const { token } = await loginStudent(h, '待绑定丙', 'S3')
    const submitted = await h.call('webSubmitForm', undefined, {
      token,
      dutyHours: 6,
      shiftTime: '',
      locationIndex: -1,
      projects: [],
      appeal: ''
    })
    assert.equal(submitted.ok, true)
    assert.equal(h.tables.students[2].openid, 'web:c')

    // 学生到小程序绑定真实微信：允许接管网页身份，并把历史提交迁走
    const bound = await h.call('bindStudent', 'wx-new', { name: '待绑定丙', studentId: 'S3' })
    assert.equal(bound.ok, true)
    assert.equal(bound.user.openid, 'wx-new')
    assert.equal(h.tables.students[2].openid, 'wx-new')
    assert.equal(h.tables.students[2].openidSource, 'wechat')
    assert.equal(h.tables.submissions[0].openid, 'wx-new')

    const mini = await h.call('getForm', 'wx-new')
    assert.equal(mini.submission._id, h.tables.submissions[0]._id)
    assert.equal(mini.submission.answers.answer1, '6')

    const view = await h.call('webGetForm', undefined, { token })
    assert.equal(view.bound, true)
    assert.equal(view.identitySource, 'wechat')
    assert.equal(view.submission.answers.answer1, '6')

    // 转正后不能再被其他微信抢绑
    assert.equal((await h.call('bindStudent', 'wx-other', { name: '待绑定丙', studentId: 'S3' })).ok, false)

    const progress = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
    assert.equal(progress.rows.find(r => r.studentId === 'S3').identitySource, 'wechat')
  })
})

test('Web 临时身份：开关关闭后，已生成网页身份的学助仍可继续提交', async () => {
  const h = createHarness(webFixture())
  const { token } = await loginStudent(h, '待绑定丙', 'S3')
  await withUnboundWeb(async () => {
    assert.equal((await h.call('webSubmitForm', undefined, {
      token,
      dutyHours: 2,
      shiftTime: '',
      locationIndex: -1,
      projects: [],
      appeal: ''
    })).ok, true)
  })

  // withUnboundWeb 已恢复默认（未设置）。已有 openid 的网页身份不受开关影响。
  const view = await h.call('webGetForm', undefined, { token })
  assert.equal(view.identitySource, 'web')
  assert.equal(view.canSubmit, true)
  const again = await h.call('webSubmitForm', undefined, {
    token,
    dutyHours: 3,
    shiftTime: '',
    locationIndex: -1,
    projects: [],
    appeal: ''
  })
  assert.equal(again.ok, true)
  assert.equal(h.tables.submissions[0].calc.dutyHours, 3)
})

test('Web 学助提交：截止、已关闭、已计算与字段非法都拒绝', async () => {
  const h = createHarness(webFixture())
  await h.call('webStudentBind', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const { token } = await h.call('webStudentLogin', undefined, { name: '学助甲', studentId: 'S1', password: PASSWORD })
  const good = { dutyHours: 1, shiftTime: '', locationIndex: 0, projects: [teamEntry()], appeal: '' }

  // 字段非法：负工时、项目名空、实际耗时负数、申诉超长
  assert.equal((await h.call('webSubmitForm', undefined, { token, ...good, dutyHours: -1 })).ok, false)
  assert.equal((await h.call('webSubmitForm', undefined, { token, ...good, projects: [{ ...teamEntry(), name: '' }] })).ok, false)
  assert.equal((await h.call('webSubmitForm', undefined, { token, ...good, projects: [{ ...teamEntry(), actualHours: -1 }] })).ok, false)
  assert.equal((await h.call('webSubmitForm', undefined, { token, ...good, appeal: 'x'.repeat(1001) })).ok, false)
  assert.equal(h.tables.submissions.length, 0)

  // 截止时间已过
  h.tables.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
  assert.equal((await h.call('webSubmitForm', undefined, { token, ...good })).ok, false)
  assert.equal((await h.call('webGetForm', undefined, { token })).canSubmit, false)
  assert.equal(h.tables.submissions.length, 0)

  // 已关闭 / 已计算
  h.tables.monthly_forms[0].deadline = '2026-10-20T00:00:00Z'
  h.tables.monthly_forms[0].status = 'closed'
  assert.equal((await h.call('webSubmitForm', undefined, { token, ...good })).ok, false)
  h.tables.monthly_forms[0].status = 'calculated'
  assert.equal((await h.call('webSubmitForm', undefined, { token, ...good })).ok, false)
  assert.equal((await h.call('webGetForm', undefined, { token })).canSubmit, false)
  assert.equal(h.tables.submissions.length, 0)
})

test('Web 与小程序的身份来源互不越界，且 webauth.js 各副本一致', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const read = (...parts) => fs.readFileSync(path.resolve(__dirname, ...parts), 'utf8')
  // 只检查代码：注释里写明「不要读 getWXContext」是应该的，不该被判违规
  const codeOnly = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const reference = read('../cloudfunctions', WEB_FUNCTIONS[0], 'webauth.js')
  for (const fn of WEB_FUNCTIONS) {
    assert.equal(read('../cloudfunctions', fn, 'webauth.js'), reference, `webauth.js 副本不一致: ${fn}`)
    const source = read('../cloudfunctions', fn, 'index.js')
    assert.ok(source.includes("require('./webauth')"), `${fn} 没有使用 webauth.js`)
    // 未登录模式下 getWXContext() 是残留身份，web 函数一旦读它就会把权限交给匿名访客
    assert.equal(codeOnly(source).includes('getWXContext'), false, `${fn} 读取了调用方环境身份`)
  }
  // 反向约束：老师函数必须继续用 getWXContext()，靠平台安全规则挡住未登录来源
  for (const fn of GUARDED_FUNCTIONS) {
    assert.ok(codeOnly(read('../cloudfunctions', fn, 'index.js')).includes('getWXContext'), `${fn} 不应改读别的身份来源`)
  }
  // 小程序端与 Web 端共用的纯逻辑副本必须逐字节一致
  for (const [file, mini, web] of SHARED_MODULES) {
    assert.equal(
      read('../cloudfunctions', web, file),
      read('../cloudfunctions', mini, file),
      `${file} 两端副本不一致: ${mini} vs ${web}`
    )
  }
})

test('Web 数据接口：无票据或票据无效一律拒绝，有效票据才放行', async () => {
  const h = createHarness(webFixture())
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const { token } = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })

  const calls = [
    ['webListForms', {}],
    ['webCreateMonthlyForm', { month: '2026-11' }],
    ['webGetSubmissions', { formId: 'f' }],
    ['webExportData', { formId: 'f' }]
  ]
  for (const [fn, base] of calls) {
    for (const bad of [undefined, '', 'garbage', `${token}x`, token.split('.')[0]]) {
      const res = await h.call(fn, undefined, { ...base, token: bad })
      assert.equal(res.ok, false, `${fn} 放行了无效票据: ${bad}`)
      // 失败时不得泄露任何数据
      assert.equal(res.forms, undefined)
      assert.equal(res.rows, undefined)
      assert.equal(res.url, undefined)
    }
  }
  assert.equal(h.uploads.length, 0, '无效票据不得触发导出上传')
  assert.equal(h.tables.monthly_forms.length, 1, '无效票据不得新建表单')

  // 有效票据放行
  assert.equal((await h.call('webListForms', undefined, { token })).ok, true)
  assert.equal((await h.call('webGetSubmissions', undefined, { formId: 'f', token })).ok, true)
  assert.equal((await h.call('webExportData', undefined, { formId: 'f', token })).ok, true)
  assert.equal((await h.call('webCreateMonthlyForm', undefined, { month: '2026-11', token })).ok, true)
  assert.equal(h.tables.monthly_forms.length, 2)
})

test('Web 数据接口不吃残留的微信身份', async () => {
  const h = createHarness(webFixture())
  // 老师先用小程序调用，实例里留下残留身份
  assert.equal((await h.call('listForms', 'wx-teacher')).ok, true)
  // 不带票据的 Web 调用不得因为残留身份而成功
  for (const fn of ['webListForms', 'webGetSubmissions', 'webExportData']) {
    assert.equal((await h.call(fn, undefined, { formId: 'f' })).ok, false, `${fn} 被残留身份放行了`)
  }
  assert.equal(h.uploads.length, 0)
})

test('Web 导出：一人一行 × 一类项目一列，汇总字段与折算对账', async () => {
  const h = createHarness(webFixture())
  await h.call('submitForm', 'wx-b', answer)
  h.tables.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
  await h.call('calculateMonthly', undefined)
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const { token } = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })

  const res = await h.call('webExportData', undefined, { formId: 'f', token })
  assert.equal(res.ok, true)
  assert.equal(res.filename, '2026_10_15学助工时统计表.xlsx')

  const sheet = h.workbooks[0].sheets[0]
  assert.equal(sheet.name, '2026-10')
  const rows = sheet.rows.map(r => r.values)          // exceljs 桩按 Row 存，测试里取纯值
  const cell = (r, c) => rows[r - 1][c - 1]

  // 单张表：标题 + 月份/填报情况 + 一行表头 + 3 名学助（含未绑定的人）
  assert.equal(rows.length, 6)
  assert.equal(rows[2].length, 26)
  assert.equal(cell(1, 1), 'CPRO学助工时统计表')
  assert.equal(cell(2, 1), '月份')
  assert.equal(cell(2, 2), '2026年10月')
  assert.equal(cell(2, 4), '填报情况')
  // 汇总口径与「填报情况」页同一份 rows.js/summarize
  assert.equal(cell(2, 5), '名单 3 人：已提交 1，待提交 1，未绑定 1')

  // 表头：13 个基础列 + 12 个项目列（一类一列，不再拆统筹/参与）+ 1 个申诉列
  assert.deepEqual(rows[2].slice(0, 13), [
    '学助姓名', '学号', '部门', '值班工时', '项目折算工时', '总工时', '有效工时',
    '项目条数', '已发布', '已完成未发布', '未完成', '实际耗时合计', '填报状态'
  ])
  assert.equal(cell(3, 14), '新闻稿/通讯（800字内）')
  assert.equal(cell(3, 25), '集体活动')
  assert.equal(cell(3, 26), '额外工时申诉')

  // 合并只剩：大标题、月份值、填报情况、同部门的部门列；不再有整行合并
  for (const range of ['A1:Z1', 'B2:C2', 'E2:Z2', 'C4:C5']) {
    assert.ok(sheet.merges.includes(range), `缺少合并 ${range}`)
  }
  assert.equal(sheet.merges.some(m => m.startsWith('D')), false, '未提交不再整行合并')

  // 已提交：数值列 + 填报状态；12 个类型列之和必须等于「项目折算工时」
  const rowOf = name => rows.find(r => r[0] === name)
  const yi = rowOf('主管乙')
  assert.deepEqual(yi.slice(3, 13), [30, 4, 51, 40, 0, 0, 0, 0, 0, '已提交'])
  assert.equal(yi[24], 4)                         // 集体活动：2 条参与 × 费率 2
  const typeSum = yi.slice(13, 25).reduce((n, v) => n + (Number(v) || 0), 0)
  assert.equal(typeSum, yi[4])                    // 行内自洽

  // 月结补零：数字全 0，状态写「月结补零」
  const jia = rowOf('学助甲')
  assert.deepEqual(jia.slice(3, 13), [0, 0, 0, 0, 0, 0, 0, 0, 0, '月结补零'])
  assert.equal(jia.slice(13, 25).every(v => v === 0), true)

  // 未绑定：只在「填报状态」写状态，不再整行合并
  const bing = rowOf('待绑定丙')
  assert.equal(bing[12], '未绑定')
  assert.equal(bing[3], undefined)
  assert.equal(bing[13], undefined)

  // 同一部门的人合并「部门」列；部门显示为「中文 英文」
  assert.equal(cell(4, 3), '行政与数据 Administration and Data')
  assert.equal(cell(5, 3), undefined)

  // 表头：品牌紫底 + 白字加粗居中，长项目名允许换行
  assert.equal(sheet.getCell(3, 1).fill.fgColor.argb, 'FF732160')
  assert.equal(sheet.getCell(3, 1).font.bold, true)
  assert.equal(sheet.getCell(3, 1).font.color.argb, 'FFFFFFFF')
  assert.equal(sheet.getCell(3, 1).alignment.horizontal, 'center')
  assert.equal(sheet.getCell(3, 14).alignment.wrapText, true)
  assert.equal(sheet.getCell(3, 26).fill.fgColor.argb, 'FF732160')

  // 表体（含表头）逐格细边框；标题行与填报情况行不描边
  assert.equal(sheet.getCell(3, 1).border.top.style, 'thin')
  assert.equal(sheet.getCell(4, 1).border.top.style, 'thin')
  assert.equal(sheet.getCell(6, 26).border.bottom.style, 'thin')
  assert.equal(sheet.getCell(2, 1).border, undefined)
  assert.equal(sheet.getCell(1, 1).border, undefined)

  // 大标题放大加粗、用品牌紫
  assert.equal(sheet.getCell(1, 1).font.bold, true)
  assert.equal(sheet.getCell(1, 1).font.size, 14)
  assert.equal(sheet.getCell(1, 1).font.color.argb, 'FF732160')

  // 列宽/行高：26 列，表头行加高给换行让位
  assert.equal(sheet.cols.length, 26)
  assert.ok(sheet.cols[0].width > 0)
  assert.ok(sheet.cols[25].width > 0)
  assert.equal(sheet.rows[0].height, 22)
  assert.equal(sheet.rows[2].height, 30)
  assert.equal(sheet.rows[3].height, 13)
})

test('Web 统计表：名单里所有部门都会导出，未知/已移除的部门各自成块', () => {
  const { buildPivot } = require('../cloudfunctions/webExportData/pivot')
  const students = [
    { name: '甲', studentId: 'S1', department: 'Public_Relations' },
    { name: '乙', studentId: 'S2', department: 'Domestic_social_Media' },
    { name: '丙', studentId: 'S3', department: 'domestic social media' },  // 别名写法 → 同一个部门
    { name: '丁', studentId: 'S4', department: 'Administration_and_Data' },
    { name: '戊', studentId: 'S5', department: '图书馆' },                 // 枚举外
    { name: '己', studentId: 'S6', department: 'CPRO' },                   // 已从枚举移除的旧值
    { name: '庚', studentId: 'S7' }                                        // 名单里没写部门
  ]
  const model = buildPivot({
    form: { month: '2026-10' }, students, submissions: [],
    now: new Date('2026-10-15T00:00:00Z')
  })

  // 7 个人一个不漏：部门按枚举顺序排前面，查不到枚举的各自成块排在后面
  const labels = model.departments.map(d => d.label)
  assert.equal(labels.length, 6)
  assert.deepEqual(labels.slice(0, 3), [
    '公共关系 Public Relations',
    '国内社媒 Domestic Social Media',
    '行政与数据 Administration and Data'
  ])
  assert.deepEqual(labels.slice(3).sort(), ['CPRO', '图书馆', '未设置'].sort())
  assert.equal(model.departments.reduce((n, d) => n + d.count, 0), 7)
  assert.equal(model.rows.length, 3 + 7)     // 标题 + 月份 + 表头 + 7 人

  // 只有「同一部门且多于一人」才纵向合并部门列；别名写法要能并到一起
  assert.deepEqual(model.merges.filter(m => /^C[4-9]\d*:C\d+$/.test(m)), ['C5:C6'])
  // 未提交不再整行合并（状态改写在「填报状态」列），表头也是单行，没有纵向表头合并
  assert.equal(model.merges.some(m => m.startsWith('D')), false)
  assert.ok(model.merges.includes('A1:Z1') && model.merges.includes('E2:Z2'))
})

test('Web 统计表的项目列与小程序端 PROJECT_ROWS 同源：顺序、文案都不许漂移', () => {
  const { PROJECT_ROWS, PROJECT_HOURS } = require('../miniprogram/config/constants')
  const webRows = require('../cloudfunctions/webExportData/projectRows')
  const { projectColumns } = require('../cloudfunctions/webExportData/pivot')

  assert.deepEqual(webRows.PROJECT_ROWS, PROJECT_ROWS, 'projectRows.js 副本与小程序端不一致')

  // 一类项目一列：key 与表头文案都要跟小程序端一致
  const cols = projectColumns()
  const withRate = PROJECT_ROWS.filter(row => PROJECT_HOURS[row.key].participant != null)
  assert.deepEqual(cols, withRate.map(row => ({ key: row.key, label: row.label })))
  // 「按实际/待定」的接待活动、管理项目没有列，但仍然留在 PROJECT_ROWS 里
  assert.equal(cols.length, 12)
  assert.equal(PROJECT_ROWS.length, 14)
})

test('Web 统计表：部门显示为「中文 英文」，枚举外的旧值原样输出', () => {
  const { departmentLabel, monthText } = require('../cloudfunctions/webExportData/pivot')
  assert.equal(departmentLabel('Administration_and_Data'), '行政与数据 Administration and Data')
  assert.equal(departmentLabel('行政与数据'), '行政与数据 Administration and Data')
  assert.equal(departmentLabel('multimedia center'), '多媒体中心 Multimedia Center')
  assert.equal(departmentLabel('Journalist_News_Center'), '大学新闻中心记者 Journalist, News Center')
  assert.equal(departmentLabel(''), '未设置')
  assert.equal(departmentLabel('CPRO'), 'CPRO')     // 已移除的旧部门原样输出，不静默清空
  assert.equal(monthText('2026-10'), '2026年10月')
})

test('口径一致：Web 填报进度与小程序完全一致', async () => {
  const h = createHarness(webFixture())
  await h.call('submitForm', 'wx-a', answer)
  await h.call('webBind', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })
  const { token } = await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })

  const viaMini = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  const viaWeb = await h.call('webGetSubmissions', undefined, { formId: 'f', token })

  assert.equal(viaWeb.ok, true)
  assert.deepEqual(viaWeb.form, viaMini.form)
  assert.deepEqual(viaWeb.rows, viaMini.rows)
  assert.deepEqual(viaWeb.summary, viaMini.summary)
  assert.deepEqual(viaWeb.summary, { total: 3, bound: 2, submitted: 1, pending: 1, unbound: 1 })
})

test('部门映射：云函数副本与小程序端的枚举、别名、归一化结果完全一致', () => {
  const dir = require('../cloudfunctions/getSubmissions/departments')
  assert.deepEqual(dir.DEPARTMENTS, DEPARTMENTS)
  assert.deepEqual(dir.DEPARTMENT_ALIASES, DEPARTMENT_ALIASES)
  assert.deepEqual(dir.DEPARTMENT_LABELS, DEPARTMENT_LABELS)

  // 归一化与展示文本逐项比对：枚举、大小写变体、别名、错值、空值、原型链键
  const samples = [
    ...DEPARTMENTS,
    ...DEPARTMENTS.map(d => d.toUpperCase()),
    ...DEPARTMENTS.map(d => d.toLowerCase()),
    ...Object.keys(DEPARTMENT_ALIASES),
    'Multimedia_Center', 'University gift shop', 'ＡＤＭＩＮＩＳＴＲＡＴＩＯＮ',
    '图书馆', 'CPRO', '', '   ', null, undefined, 0, 'constructor', 'toString'
  ]
  for (const value of samples) {
    const resolved = resolveDepartment(value)
    const raw = String(value == null ? '' : value)
    assert.equal(dir.resolveDepartment(value), resolved, `归一化不一致: ${value}`)
    assert.equal(dir.departmentText(value), DEPARTMENT_LABELS[resolved] || raw || '未设置', `展示文本不一致: ${value}`)
  }

  // 网页上暴露出来的那条：名单写成大写 C 也要归一到规范值并显示中文
  assert.equal(dir.resolveDepartment('Multimedia_Center'), 'Multimedia_center')
  assert.equal(dir.departmentText('Multimedia_Center'), '多媒体中心')
})

test('填报情况：部门展示文本由服务端归一化，未提交者的名单原值也转成中文', async () => {
  const seed = fixture()
  seed.students[1].department = 'Multimedia_Center'   // 未提交者：名单里的大小写写法
  const h = createHarness(seed)
  await h.call('submitForm', 'wx-a', answer)

  const res = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  const yi = res.rows.find(r => r.name === '主管乙')
  assert.equal(yi.submitted, false)
  assert.equal(yi.department, 'Multimedia_Center')     // 原值照旧下发，便于排查名单写法
  assert.equal(yi.departmentText, '多媒体中心')          // 展示文本已归一化
  // 已提交者取提交时快照（规范值）再转中文
  assert.equal(res.rows.find(r => r.name === '学助甲').departmentText, '行政与数据')
  // 枚举外的历史值原样显示，不静默清空
  const legacy = fixture()
  legacy.students[0].department = 'CPRO'
  const h2 = createHarness(legacy)
  const res2 = await h2.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  assert.equal(res2.rows.find(r => r.name === '学助甲').departmentText, 'CPRO')
})

test('老师创建新月表单并更新截止时间，不重复创建', async () => {
  const h = createHarness(fixture())
  const first = await h.call('createMonthlyForm', 'wx-teacher', { month: '2026-11' })
  const second = await h.call('createMonthlyForm', 'wx-teacher', { month: '2026-11', deadline: '2026-11-20' })
  assert.equal(first.action, 'created')
  assert.equal(second.action, 'updated')
  assert.equal(first.id, second.id)
  assert.equal(h.tables.monthly_forms.length, 2)
})

test('提交并修改；用户身份和主管系数取数据库；他人无法读到我的答案', async () => {
  const h = createHarness(fixture())
  const first = await h.call('submitForm', 'wx-a', { ...answer, openid: 'wx-b', isSupervisor: true, name: '伪造' })
  assert.equal(first.calc.totalHours, 34)      // 值班 30 + 集体活动参与 2 次 × 2 h
  assert.equal(first.calc.effectiveHours, 34)
  assert.equal(h.tables.submissions[0].name, '学助甲')
  assert.equal((await h.call('getForm', 'wx-b')).submission, null)
  assert.equal((await h.call('getForm', 'wx-a')).submission.answers.answer1, '30')
  await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 40 })
  assert.equal(h.tables.submissions.length, 1)
  assert.equal(h.tables.submissions[0].calc.totalHours, 44)   // 值班 40 + 4
  assert.equal((await h.call('listForms', 'wx-teacher')).forms[0].count, 1)
})

test('所有项目费率、单值项目不开放统筹、主管倍率和 40 小时上限与前端一致', async () => {
  for (const isSupervisor of [false, true]) {
    const h = createHarness(fixture())
    for (const key of Object.keys(PROJECT_HOURS)) {
      const who = isSupervisor ? 'wx-b' : 'wx-a'
      // 参与：每个项目都要与前端的 calcHours 一致
      const participantRows = [{ key, counts: { participant: 3, coordinator: 0 } }]
      const byParticipant = await h.call('submitForm', who, { ...answer, dutyHours: 32, projectRows: participantRows })
      assert.deepEqual(byParticipant.calc, calcHours(32, participantRows, isSupervisor), `参与费率不一致: ${key}`)

      // 统筹：只有开放统筹的项目才有工时，单值项目即使传了数量也不计入
      const coordinatorRows = [{ key, counts: { participant: 0, coordinator: 3 } }]
      const byCoordinator = await h.call('submitForm', who, { ...answer, dutyHours: 32, projectRows: coordinatorRows })
      assert.deepEqual(byCoordinator.calc, calcHours(32, coordinatorRows, isSupervisor), `统筹费率不一致: ${key}`)
      if (!hasCoordinatorRate(key)) {
        assert.equal(byCoordinator.calc.projectHours, 0, `单值项目不应计入统筹: ${key}`)
      }
    }
    // 集体活动（区间 2–8）：参与按下限、统筹按上限
    const who = isSupervisor ? 'wx-b' : 'wx-a'
    const mixed = [{ key: 'team_activity', counts: { participant: 2, coordinator: 1 } }]
    const mixedResult = await h.call('submitForm', who, { ...answer, dutyHours: 30, projectRows: mixed })
    assert.deepEqual(mixedResult.calc, calcHours(30, mixed, isSupervisor))
    assert.equal(mixedResult.calc.projectHours, 12)                        // 2×2 + 8×1
    assert.equal(mixedResult.calc.totalHours, isSupervisor ? 63 : 42)      // 主管：(30+12)×1.5
    assert.equal(mixedResult.calc.effectiveHours, 40)

    const zero = await h.call('submitForm', who, { ...answer, dutyHours: 0, projectRows: [] })
    assert.equal(zero.calc.effectiveHours, 0)
  }
})

test('有效工时最高 40 小时；前端预估与云端存储先算主管倍率再封顶', async () => {
  const twoTeamActivities = [{ key: 'team_activity', counts: { participant: 2, coordinator: 0 } }] // 2×2 = 4 h
  const cases = [
    { duty: 0, supervisor: false, projectHours: 0, total: 0, effective: 0 },
    { duty: 30, supervisor: false, projectHours: 0, total: 30, effective: 30 },
    { duty: 39, supervisor: false, projectHours: 0, total: 39, effective: 39 },
    { duty: 40, supervisor: false, projectHours: 0, total: 40, effective: 40 },
    { duty: 41, supervisor: false, projectHours: 0, total: 41, effective: 40 },
    { duty: 50, supervisor: false, projectHours: 0, total: 50, effective: 40 },
    { duty: 0, supervisor: true, projectHours: 0, total: 0, effective: 0 },
    { duty: 20, supervisor: true, projectHours: 0, total: 30, effective: 30 },
    { duty: 26, supervisor: true, projectHours: 0, total: 39, effective: 39 },
    { duty: 27, supervisor: true, projectHours: 0, total: 40.5, effective: 40 },
    { duty: 30, supervisor: true, projectHours: 0, total: 45, effective: 40 },
    { duty: 50, supervisor: true, projectHours: 0, total: 75, effective: 40 },
    // 项目工时 4 h：主管先 ×1.5 再封顶
    { duty: 35, rows: twoTeamActivities, supervisor: true, projectHours: 4, total: 58.5, effective: 40 },
    { duty: 24, rows: twoTeamActivities, supervisor: true, projectHours: 4, total: 42, effective: 40 },
    { duty: 22, rows: twoTeamActivities, supervisor: true, projectHours: 4, total: 39, effective: 39 }
  ]
  for (const { duty, rows = [], supervisor, projectHours, total, effective } of cases) {
    const expected = { dutyHours: duty, projectHours, totalHours: total, effectiveHours: effective }
    assert.deepEqual(calcHours(duty, rows, supervisor), expected)
    const h = createHarness(fixture())
    const result = await h.call('submitForm', supervisor ? 'wx-b' : 'wx-a', { ...answer, dutyHours: duty, projectRows: rows })
    assert.equal(result.ok, true)
    assert.deepEqual(result.calc, expected)
    assert.deepEqual(h.tables.submissions[0].calc, expected)
  }
})

test('未绑定及仅老师身份无法提交（记录当前业务行为）', async () => {
  const h = createHarness(fixture())
  for (const id of ['stranger', 'wx-teacher']) assert.equal((await h.call('submitForm', id, answer)).ok, false)
})

test('无表单、已关闭、已计算、超过截止时间均拒绝提交', async () => {
  for (const status of ['missing', 'closed', 'calculated', 'expired']) {
    const seed = fixture()
    if (status === 'missing') seed.monthly_forms = []
    else if (status === 'expired') seed.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
    else seed.monthly_forms[0].status = status
    const h = createHarness(seed)
    assert.equal((await h.call('submitForm', 'wx-a', answer)).ok, false)
    assert.equal((h.tables.submissions || []).length, 0)
  }
})

test('完整工作流：提交、到期关闭、未提交补零、重复计算、两张表导出', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-b', { ...answer, projects: [teamEntry(), teamEntry()] })
  assert.equal(h.tables.submissions[0].calc.projectHours, 1.2)
  assert.equal(h.tables.submissions[0].calc.totalHours, 46.8)   // 主管：(30 + 2 × 2 × 0.3) × 1.5
  assert.equal(h.tables.submissions[0].calc.effectiveHours, 40)
  // 同类型两条申报在落库时汇总成一个计数
  assert.deepEqual(h.tables.submissions[0].projectRows, [
    { key: 'team_activity', label: '集体活动', counts: { participant: 2, coordinator: 0 } }
  ])
  h.tables.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
  const result = await h.call('calculateMonthly', undefined)
  assert.deepEqual(result.calculated, ['2026-10'])
  assert.equal(h.tables.monthly_forms[0].status, 'calculated')
  assert.equal(h.tables.submissions.length, 2)
  assert.equal(h.tables.submissions.find(row => row.openid === 'wx-a').calc.effectiveHours, 0)
  await h.call('calculateMonthly', undefined)
  assert.equal(h.tables.submissions.length, 2)
  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  assert.equal(exported.filename, '2026_10_15学助工时明细.xlsx')
  const sheets = JSON.parse(h.uploads[0].fileContent.toString())
  assert.equal(sheets.length, 2)

  // 汇总：一人一行，含未提交/未绑定；有效工时 = 值班 + 项目 → 主管 ×1.5 → 封顶 40
  assert.equal(sheets[0].name, '2026-10')
  assert.deepEqual(sheets[0].data[0], ['姓名', '学号', '部门', '值班工时', '项目折算工时', '总工时', '有效工时', '项目条数', '已发布', '已完成未发布', '未完成', '实际耗时合计', '填报状态', '额外工时申诉'])
  assert.equal(sheets[0].data.length, 4)   // 表头 + 3 名学助（含未绑定）
  const summary = name => sheets[0].data.find(row => row[0] === name)
  assert.deepEqual(summary('主管乙'), ['主管乙', 'S2', '行政与数据', 30, 1.2, 46.8, 40, 2, 2, 0, 0, 4, '已提交', ''])
  assert.equal(summary('学助甲')[6], 0)
  assert.equal(summary('学助甲')[12], '月结补零')
  assert.equal(summary('待绑定丙')[12], '未绑定')
  assert.equal(summary('待绑定丙')[3], '')

  // 项目明细：一条申报一行（同类型两条 → 两行）
  assert.equal(sheets[1].name, '项目明细')
  assert.deepEqual(sheets[1].data[0], ['姓名', '学号', '部门', '项目类型', '项目名称', '项目分工', '完成情况', '完成形式', '实际完成时间（hrs）', '参与数', '统筹数', '折算工时', '实际−折算'])
  assert.equal(sheets[1].data.length, 3)
  assert.deepEqual(sheets[1].data.slice(1), [
    ['主管乙', 'S2', '行政与数据', '集体活动', '运动会', '参与', '已发布', '现场', 2, 1, 0, 0.6, 1.4],
    ['主管乙', 'S2', '行政与数据', '集体活动', '运动会', '参与', '已发布', '现场', 2, 1, 0, 0.6, 1.4]
  ])
})

test('项目明细工作表：一条申报一行、完成情况与折算工时、按实际留空', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-a', {
    ...answer,
    projects: [
      { key: 'team_activity', name: '团建', role: 'coordinator', status: '已完成未发布', completionForm: '待发', actualHours: 6 },
      { key: 'poster', name: '海报A', role: 'participant', status: '已发布', completionForm: '公众号', actualHours: 1 },
      { key: 'poster', name: '海报B', role: 'participant', status: '未完成', completionForm: '—', actualHours: 0 },
      { key: 'reception', name: '接待', role: 'participant', status: '已发布', completionForm: '现场', actualHours: 3 }
    ]
  })
  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  const sheets = JSON.parse(h.uploads[0].fileContent.toString())
  const detail = sheets[1]
  assert.equal(detail.name, '项目明细')
  assert.deepEqual(detail.data[0], ['姓名', '学号', '部门', '项目类型', '项目名称', '项目分工', '完成情况', '完成形式', '实际完成时间（hrs）', '参与数', '统筹数', '折算工时', '实际−折算'])
  // 同类型两条海报各占一行；接待活动没有费率，折算与差异留空
  assert.deepEqual(detail.data.slice(1), [
    ['学助甲', 'S1', '行政与数据', '集体活动', '团建', '统筹', '已完成未发布', '待发', 6, 0, 1, 4, 2],
    ['学助甲', 'S1', '行政与数据', '海报设计', '海报A', '参与', '已发布', '公众号', 1, 1, 0, 0.3, 0.7],
    ['学助甲', 'S1', '行政与数据', '海报设计', '海报B', '参与', '未完成', '—', 0, 1, 0, 0.06, -0.06],
    ['学助甲', 'S1', '行政与数据', '接待活动', '接待', '参与', '已发布', '现场', 3, 1, 0, '', '']
  ])
  // 汇总：按完成状态与分工系数加权；条数、各完成状态与实际耗时合计都要对得上
  const row = sheets[0].data.find(r => r[0] === '学助甲')
  assert.deepEqual(row.slice(3), [30, 4.36, 34.36, 34.36, 4, 2, 1, 1, 10, '已提交', ''])

  // 只保留汇总与项目明细两张表
  assert.equal(sheets.length, 2)
})

test('部门：按名单落库快照，枚举外与缺失写空字符串，事件参数无法伪造', async () => {
  const h = createHarness(fixture())
  await h.call('bindStudent', 'wx-c', { name: '待绑定丙', studentId: 'S3' })
  // 主管乙名单值是 ' administration_and_data '，落库归一化成规范值；事件里的 department 不参与写入
  await h.call('submitForm', 'wx-b', { ...answer, department: '伪造部门' })
  assert.equal(h.tables.submissions.find(r => r.openid === 'wx-b').department, 'Administration_and_Data')
  // 名单缺 department：提交仍然成功，部门为空字符串
  const missing = await h.call('submitForm', 'wx-c', { ...answer, department: 'Administration_and_Data' })
  assert.equal(missing.ok, true)
  assert.equal(h.tables.submissions.find(r => r.openid === 'wx-c').department, '')
})

test('部门：未提交者补零同样带部门，导出取提交时的快照而非当前名单', async () => {
  const seed = fixture()
  seed.students[1].department = '图书馆'          // 枚举外：补零快照归一化成空，展示时退回名单原值
  seed.students.push({ _id: 'd', name: '主管丁', studentId: 'S4', openid: 'wx-d', isSupervisor: true, department: ' administration_and_data ' })
  const h = createHarness(seed)
  await h.call('submitForm', 'wx-a', answer)
  h.tables.students[0].department = '图书馆'       // 提交后老师改了名单，不影响已落库的快照
  h.tables.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
  await h.call('calculateMonthly', undefined)

  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  const sheet = JSON.parse(h.uploads[0].fileContent.toString())[0]
  const rowOf = name => sheet.data.find(row => row[0] === name)
  assert.equal(rowOf('学助甲')[2], '行政与数据')     // 提交时的快照
  assert.equal(rowOf('主管乙')[2], '图书馆')         // 补零快照为空 → 退回名单原值，枚举外原样输出
  assert.equal(rowOf('主管丁')[2], '行政与数据')     // 补零行：名单小写带空格 → 归一化再转中文
})

test('汇总：名单驱动，未提交与未绑定都出行，枚举外的部门原样输出', async () => {
  const seed = fixture()
  seed.students[0].department = 'CPRO'   // 已从枚举移除的旧值
  const h = createHarness(seed)
  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  const sheets = JSON.parse(h.uploads[0].fileContent.toString())
  assert.equal(sheets[0].data.length, 4)          // 表头 + 3 人
  const rowOf = name => sheets[0].data.find(row => row[0] === name)
  assert.equal(rowOf('学助甲')[2], 'CPRO')         // 枚举外：原样输出，不静默清空
  assert.equal(rowOf('学助甲')[12], '未提交')
  assert.equal(rowOf('主管乙')[2], '行政与数据')   // 名单别名写法 → 归一化再转中文
  assert.equal(rowOf('待绑定丙')[2], '')
  assert.equal(rowOf('待绑定丙')[12], '未绑定')
  // 没有项目时项目明细只有表头
  assert.equal(sheets.length, 2)
  assert.equal(sheets[1].data.length, 1)
})

test('部门中文名映射在小程序与 exportData 两处一致，覆盖全部枚举', () => {
  const exportConstants = require('../cloudfunctions/exportData/constants')
  assert.deepEqual(DEPARTMENT_LABELS, exportConstants.DEPARTMENT_LABELS)
  assert.equal(Object.keys(DEPARTMENT_LABELS).length, DEPARTMENTS.length)
  for (const d of DEPARTMENTS) assert.ok(DEPARTMENT_LABELS[d], `部门缺少中文名: ${d}`)
})

test('填报情况：仅导出账户可读，学助、未绑定与缺少表单号被拒', async () => {
  const h = createHarness(fixture())
  for (const id of ['wx-a', 'wx-b', 'stranger', undefined]) {
    assert.equal((await h.call('getSubmissions', id, { formId: 'f' })).ok, false)
  }
  assert.equal((await h.call('getSubmissions', 'wx-teacher', {})).ok, false)
  const res = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  assert.equal(res.ok, true)
  assert.equal(res.form.month, '2026-10')
  assert.equal(res.form.status, 'open')
})

test('填报情况：进度区分真提交与月结补零，未提交不下发工时', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-a', answer)            // 值班 30 + 集体活动 2×2 = 34，非主管
  assert.equal(h.tables.submissions[0].source, 'student')

  let res = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  assert.deepEqual(res.summary, { total: 3, bound: 2, submitted: 1, pending: 1, unbound: 1 })
  const rowOf = name => res.rows.find(r => r.name === name)
  const jia = rowOf('学助甲')
  assert.equal(jia.submitted, true)
  assert.equal(jia.zeroFilled, false)
  assert.equal(jia.effectiveHours, 34)
  // 已提交者取提交时快照（规范值）
  assert.equal(jia.department, 'Administration_and_Data')
  // 未提交者退回名单原值（页面负责归一化）；没有有效工时，留 null 而不是 0
  const yi = rowOf('主管乙')
  assert.equal(yi.bound, true)
  assert.equal(yi.submitted, false)
  assert.equal(yi.effectiveHours, null)
  assert.equal(yi.department, ' administration_and_data ')
  // 未绑定者既不计入已提交也不计入待提交
  const bing = rowOf('待绑定丙')
  assert.equal(bing.bound, false)
  assert.equal(bing.submitted, false)
  assert.equal(bing.effectiveHours, null)

  // 月结补零后，进度必须仍是「未提交」，不能把补零记录算成已填报
  h.tables.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
  await h.call('calculateMonthly', undefined)
  assert.equal(h.tables.submissions.find(r => r.openid === 'wx-b').source, 'auto-zero')
  res = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  const jia2 = res.rows.find(r => r.name === '学助甲')
  const yi2 = res.rows.find(r => r.name === '主管乙')
  assert.equal(jia2.submitted, true)
  assert.equal(jia2.effectiveHours, 34)
  assert.equal(yi2.submitted, false)
  assert.equal(yi2.zeroFilled, true)
  assert.equal(yi2.effectiveHours, null)
  assert.deepEqual(res.summary, { total: 3, bound: 2, submitted: 1, pending: 1, unbound: 1 })
})

test('填报情况：不下发学助填写的答案与项目明细', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-a', answer)
  const res = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  for (const row of res.rows) {
    assert.equal('answers' in row, false)
    assert.equal('projectRows' in row, false)
  }
  // 汇总里也不应夹带答案文本
  assert.equal(JSON.stringify(res).includes('测试项目'), false)
  assert.equal(JSON.stringify(res).includes('周一上午'), false)
})

test('填报情况：名单超过单次读取上限时仍返回全部记录（分页）', async () => {
  const seed = fixture()
  for (let i = 0; i < 150; i++) {
    seed.students.push({
      _id: `x${i}`, name: `批量${String(i).padStart(3, '0')}`, studentId: `X${i}`,
      openid: `wx-x${i}`, isSupervisor: false, department: 'Public_Relations'
    })
  }
  const h = createHarness(seed)
  const res = await h.call('getSubmissions', 'wx-teacher', { formId: 'f' })
  assert.equal(res.rows.length, 153)
  assert.equal(res.summary.total, 153)
  assert.equal(res.summary.submitted, 0)
  assert.equal(res.summary.bound, 152)      // 待绑定丙没有 openid
})

test('填报情况搜索：按姓名子串过滤，忽略大小写与首尾空白，空关键词返回全部', () => {
  const { filterRowsByName } = require('../miniprogram/utils/search')
  const rows = [{ name: '学助甲' }, { name: '主管乙' }, { name: 'Alice Chen' }, { name: '' }, {}]
  assert.deepEqual(filterRowsByName(rows, '学').map(r => r.name), ['学助甲'])
  assert.deepEqual(filterRowsByName(rows, '  主管 ').map(r => r.name), ['主管乙'])
  assert.deepEqual(filterRowsByName(rows, 'alice').map(r => r.name), ['Alice Chen'])
  assert.deepEqual(filterRowsByName(rows, 'ALICE').map(r => r.name), ['Alice Chen'])
  assert.equal(filterRowsByName(rows, '不存在').length, 0)
  // 空关键词（含空白、null）返回全部，且不复制数组
  for (const empty of ['', '   ', null, undefined]) {
    assert.equal(filterRowsByName(rows, empty), rows)
  }
  // 名单未加载 / 结构异常时不抛错
  assert.deepEqual(filterRowsByName(undefined, 'x'), [])
  assert.deepEqual(filterRowsByName('not-an-array', 'x'), [])
  // 只匹配姓名，不匹配部门等其它字段
  assert.equal(filterRowsByName([{ name: '学助甲', department: 'Administration_and_Data' }], 'admin').length, 0)
})

// 已确认的风险明确标记为待办，避免把本地通过误认为已经可上线。
test.todo('绑定唯一性：一个微信不得绑定多个学助或同时绑定老师与学助；需事务与并发验证')
test.todo('服务端拒绝负数、非有限值、非法地点、非法项目与非整数数量')
test.todo('并发绑定、并发首次提交、并发计算不会抢绑或重复写入')
test.todo('超过数据库单次查询上限时，计算与导出仍覆盖全部记录')
test.todo('calculateMonthly 的调用来源与权限限制，以及 manual 分支的完整行为')
// 老师权限的真正边界在平台侧，本地测试碰不到，必须在控制台核对：
// 1) 云函数安全规则保持默认的 auth != null（"invoke": true 会放行未登录用户）；
// 2) 未登录模式放行的只能是专门给 Web 用的函数，不能覆盖 listForms 等老师函数。
// 一旦放宽，被复用实例里残留的 WX_OPENID 就可能被匿名调用继承——函数内部挡不住。
test.todo('云函数安全规则保持 auth != null，且未登录模式不覆盖老师函数；需在控制台核对')
// 「web* 只认自建凭据、不读 getWXContext()」已由上面的用例在源码与行为两层覆盖，
// 但下面这些只有真实环境能验证：
test.todo('未登录模式在真实网页中可用：控制台已开启、数据库用安全规则、web* 已单独放行 invoke')
// 十一个 web* 目录共用同一份 webauth.js：webLogin / webStudentLogin 签发，其余需要身份的接口验签，
// 值不一致就会全部验不过；而测试环境与正式环境的密钥必须不同，避免拿测试票据去撞正式环境。
test.todo('十一个 web* 中需要签发/验签的九个已配置同一个 WEB_TOKEN_SECRET，且测试/正式环境各用独立密钥')
test.todo('试点结束后清理临时网页身份：关闭 WEB_ALLOW_UNBOUND、迁移/清理 web:<_id> 账户，并统一 submissions 身份键')
test.todo('网页身份转正前需要更强证明（网页密码或管理员确认），当前沿用首次绑定信任模型')
test.todo('Web 登录需要限流/锁定，防止口令被在线暴力破解')

const project = (overrides = {}) => ({ key: 'poster', name: '迎新海报', role: 'coordinator', status: '已发布', completionForm: '公众号', actualHours: 7.5, ...overrides })

test('值班记录选填：云端缺省按零保存，清空可覆盖已有记录，项目工时正常计算', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-a', { dutyHours: 5, shiftTime: '周一', locationIndex: 0, projects: [project()] })
  for (const duty of [{}, { dutyHours: '' }, { dutyHours: '   ' }, { dutyHours: null }, { dutyHours: 0 }]) {
    const result = await h.call('submitForm', 'wx-a', { ...duty, projects: [project()] })
    assert.equal(result.ok, true)
    assert.deepEqual(result.calc, { dutyHours: 0, projectHours: 3, totalHours: 3, effectiveHours: 3 })
    assert.equal(h.tables.submissions.length, 1)
    const saved = h.tables.submissions[0]
    assert.equal(saved.answers.answer1, '0')
    assert.equal(saved.answers.answer2, '')
    assert.equal(saved.answers.answer3, '')
  }
  for (const dutyHours of [-1, 'abc', 'Infinity', false, []]) {
    assert.equal((await h.call('submitForm', 'wx-a', { dutyHours, projects: [] })).ok, false)
    assert.equal(h.tables.submissions[0].calc.projectHours, 3)
  }
})

test('加权模块副本一致，全部项目 × 状态 × 分工在提交、前端计算、双端导出中一致', async () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const source = fs.readFileSync(path.join(__dirname, '../miniprogram/config/project-weighting.js'), 'utf8')
  for (const name of ['submitForm', 'exportData', 'webExportData', 'webSubmitForm']) {
    assert.equal(fs.readFileSync(path.join(__dirname, '../cloudfunctions', name, 'project-weighting.js'), 'utf8'), source)
  }
  const { buildSheets } = require('../cloudfunctions/exportData/exportCore')
  const { buildPivot } = require('../cloudfunctions/webExportData/pivot')
  const round = n => Math.round(n * 1e8) / 1e8
  for (const openid of ['wx-a', 'wx-b']) {
    const h = createHarness(fixture())
    for (const key of Object.keys(PROJECT_HOURS)) {
      for (const role of ['coordinator', 'participant']) {
        for (const [status, weight] of [['未完成', 0.2], ['已完成未发布', 0.5], ['已发布', 1]]) {
          const projects = [project({ key, role, status, actualHours: 999 })]
          const expected = round((rateOf(key, role) || 0) * weight * (role === 'participant' ? 0.3 : 1))
          const result = await h.call('submitForm', openid, { ...answer, dutyHours: 26, projects })
          assert.equal(result.ok, true)
          assert.equal(result.calc.projectHours, expected, `${key}/${role}/${status}`)
          assert.deepEqual(result.calc, calcHours(26, [], openid === 'wx-b', projects))
          assert.equal(result.calc.effectiveHours, Math.min(40, round((26 + expected) * (openid === 'wx-b' ? 1.5 : 1))))
          const saved = h.tables.submissions[0]
          const sheets = buildSheets({ month: '2026-10' }, [saved], fixture().students).sheets
          const pivot = buildPivot({ form: { month: '2026-10' }, students: fixture().students, submissions: [saved] })
          const row = pivot.rows.find(row => row[1] === saved.studentId)
          assert.equal(round(row.slice(13, 25).reduce((sum, n) => sum + n, 0)), expected)
          assert.equal(row[4], expected)
          assert.equal(sheets[0].data.find(row => row[1] === saved.studentId)[4], expected)
          assert.equal(sheets[1].data[1][11], rateOf(key, role) == null ? '' : expected)
          assert.deepEqual(pivot.detailRows.map(row => row.slice(3)), sheets[1].data.map(row => row.slice(3)))
        }
      }
    }
  }
})
test('逐项填报：同类型汇总、完成状态与分工加权、双端导出完整明细', async () => {
  const h = createHarness(fixture())
  const projects = [project(), project({ role: 'participant', status: '未完成', actualHours: 100 })]
  const submitted = await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 2, projects })
  assert.equal(submitted.ok, true)
  assert.equal(submitted.calc.projectHours, 3.06)
  assert.equal(submitted.calc.effectiveHours, 5.06)
  const saved = h.tables.submissions[0]
  assert.equal(saved.projects.length, 2)
  assert.equal(saved.projectRows[0].counts.participant, 1)
  assert.equal(saved.projectRows[0].counts.coordinator, 1)
  const { buildSheets } = require('../cloudfunctions/exportData/exportCore')
  const details = buildSheets({ month: '2026-10' }, [saved], fixture().students).sheets[1].data
  // 明细列：姓名/学号/部门之后是项目字段，末尾多一列「实际−折算」（7.5 − 3 = 4.5）
  assert.deepEqual(details[1].slice(3), ['海报设计', '迎新海报', '统筹', '已发布', '公众号', 7.5, 0, 1, 3, 4.5])
  const { buildPivot } = require('../cloudfunctions/webExportData/pivot')
  const pivot = buildPivot({ form: { month: '2026-10' }, students: fixture().students, submissions: [saved] })
  assert.deepEqual(pivot.detailRows.map(r => r.slice(3)), details.map(r => r.slice(3)))
  const changed = await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 2, projects: [project({ actualHours: 0 })] })
  assert.equal(changed.calc.projectHours, 3)
  assert.equal(h.tables.submissions.length, 1)
})
test('逐项填报：旧记录保留且重复更新不累计，空列表可清除新增项目', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-a', answer)
  for (let i = 0; i < 2; i++) {
    const r = await h.call('submitForm', 'wx-a', { ...answer, projects: [project()] })
    assert.equal(r.calc.projectHours, 7)
  }
  const r = await h.call('submitForm', 'wx-a', { ...answer, projects: [] })
  assert.equal(r.calc.projectHours, 4)
  assert.equal(h.tables.submissions[0].answers.answer5, '测试项目')
  assert.equal((await h.call('submitForm', 'wx-a', answer)).ok, false)
})
test('逐项填报：服务端拒绝缺字段和非法值；标准费率乘以分工系数', async () => {
  const h = createHarness(fixture())
  for (const patch of [{ name: '' }, { key: 'unknown' }, { role: 'both' }, { status: '' }, { completionForm: '' }, { actualHours: '' }, { actualHours: -1 }, { actualHours: 'Infinity' }, { actualHours: null }]) {
    assert.equal((await h.call('submitForm', 'wx-a', { ...answer, projects: [project(patch)] })).ok, false)
  }
  assert.equal(h.tables.submissions.length, 0)
  for (const key of Object.keys(PROJECT_HOURS)) {
    for (const role of ['participant', 'coordinator']) {
      const r = await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 0, projects: [project({ key, role })] })
      assert.equal(r.calc.projectHours, Math.round((rateOf(key, role) || 0) * (role === 'participant' ? 0.3 : 1) * 1e8) / 1e8)
    }
  }
})
