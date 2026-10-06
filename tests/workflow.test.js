const test = require('node:test')
const assert = require('node:assert/strict')
const { createHarness } = require('./helpers/cloud-harness')
const { calcHours } = require('../miniprogram/utils/calc')
const { PROJECT_HOURS, PROJECT_KEYS, PROJECT_LABELS, PROJECT_LABELS_EN, PROJECT_ROWS, resolveProjectKey, labelOf, rateOf, hasCoordinatorRate, normalizeProjectRows, DEPARTMENTS, DEPARTMENT_ALIASES, resolveDepartment } = require('../miniprogram/config/constants')
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
      // 主管乙的名单值故意写成 'cpro ' 用于验证归一化；待绑定丙故意缺 department 用于验证空字符串
      { _id: 'a', name: '学助甲', studentId: 'S1', openid: 'wx-a', isSupervisor: false, department: 'CPRO' },
      { _id: 'b', name: '主管乙', studentId: 'S2', openid: 'wx-b', isSupervisor: true, department: 'cpro ' },
      { _id: 'c', name: '待绑定丙', studentId: 'S3', isSupervisor: false }
    ],
    export_accounts: [{ _id: 't', name: '老师', exportId: 'T1', openid: 'wx-teacher' }],
    monthly_forms: [{ _id: 'f', month: '2026-10', status: 'open', deadline: '2026-10-20T00:00:00Z', createTime: '2026-10-01' }]
  }
}
const answer = { dutyHours: 30, shiftTime: '周一上午', locationIndex: 1,
  projectRows: [{ key: 'team_activity', counts: { participant: 2, coordinator: 0 } }], projectName: '测试项目', appeal: '' }

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

test('部门枚举与归一化规则在小程序、submitForm、calculateMonthly 三处完全一致', () => {
  const submitConstants = require('../cloudfunctions/submitForm/constants')
  const calcConstants = require('../cloudfunctions/calculateMonthly/constants')
  assert.deepEqual(DEPARTMENTS, submitConstants.DEPARTMENTS)
  assert.deepEqual(DEPARTMENTS, calcConstants.DEPARTMENTS)
  assert.deepEqual(DEPARTMENT_ALIASES, submitConstants.DEPARTMENT_ALIASES)
  assert.deepEqual(DEPARTMENT_ALIASES, calcConstants.DEPARTMENT_ALIASES)
  // 每个别名在三处都必须归一到同一个规范值
  for (const alias of Object.keys(DEPARTMENT_ALIASES)) {
    const expected = resolveDepartment(alias)
    assert.equal(submitConstants.resolveDepartment(alias), expected, `submitForm 别名不一致: ${alias}`)
    assert.equal(calcConstants.resolveDepartment(alias), expected, `calculateMonthly 别名不一致: ${alias}`)
  }

  // 归一化：忽略大小写与多余空白
  assert.equal(resolveDepartment('CPRO'), 'CPRO')
  assert.equal(resolveDepartment('cpro'), 'CPRO')
  assert.equal(resolveDepartment('  CprO  '), 'CPRO')
  // 枚举外、留空、非字符串一律空字符串（不静默保留错值）
  for (const value of ['图书馆', 'CPRO 组', '', '   ', null, undefined, 0]) {
    assert.equal(resolveDepartment(value), '', `枚举外的值未归一化为空字符串: ${value}`)
  }
  // 三处结果必须一致（含名单里可能出现的全角等写法）
  for (const value of ['CPRO', 'cpro', '  CprO  ', 'ＣＰＲＯ', '图书馆', '', null, undefined]) {
    const expected = resolveDepartment(value)
    assert.equal(submitConstants.resolveDepartment(value), expected, `submitForm 归一化不一致: ${value}`)
    assert.equal(calcConstants.resolveDepartment(value), expected, `calculateMonthly 归一化不一致: ${value}`)
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
  const h = createHarness(seed)
  assert.equal((await h.call('bindStudent', 'new-teacher', { name: '老师', studentId: 'T1' })).role, 'export')
  assert.equal((await h.call('login', 'new-teacher')).role, 'export')
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

test('完整工作流：提交、到期关闭、未提交补零、重复计算、导出数据', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-b', answer)
  assert.equal(h.tables.submissions[0].calc.projectHours, 4)
  assert.equal(h.tables.submissions[0].calc.totalHours, 51)   // 主管：(30 + 4) × 1.5
  assert.equal(h.tables.submissions[0].calc.effectiveHours, 40)
  // 落库行结构：保留稳定键与中文名，两个角色分别计数
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
  assert.equal(exported.filename, '2026_10_15.xlsx')
  const sheets = JSON.parse(h.uploads[0].fileContent.toString())
  assert.equal(sheets[0].name, '2026-10')
  assert.equal(sheets[0].data.length, 3)
  assert.deepEqual(sheets[0].data[0], ['Name', '有效工时', 'Answer1', 'Answer2', 'Answer3', 'Answer4', 'Answer5', 'Answer6', '部门'])
  // 部门列：已提交者取提交时快照，未提交者取补零时的名单值
  assert.equal(sheets[0].data.find(row => row[0] === '学助甲').at(-1), 'CPRO')
  assert.equal(sheets[0].data.find(row => row[0] === '主管乙').at(-1), 'CPRO')
  assert.equal(sheets[0].data.find(row => row[0] === '主管乙')[1], 40)
  assert.equal(sheets[0].data.find(row => row[0] === '学助甲')[1], 0)
})

test('部门：按名单落库快照，枚举外与缺失写空字符串，事件参数无法伪造', async () => {
  const h = createHarness(fixture())
  await h.call('bindStudent', 'wx-c', { name: '待绑定丙', studentId: 'S3' })
  // 主管乙名单值是 'cpro '，落库归一化成 CPRO；事件里的 department 不参与写入
  await h.call('submitForm', 'wx-b', { ...answer, department: '伪造部门' })
  assert.equal(h.tables.submissions.find(r => r.openid === 'wx-b').department, 'CPRO')
  // 名单缺 department：提交仍然成功，部门为空字符串
  const missing = await h.call('submitForm', 'wx-c', { ...answer, department: 'CPRO' })
  assert.equal(missing.ok, true)
  assert.equal(h.tables.submissions.find(r => r.openid === 'wx-c').department, '')
})

test('部门：未提交者补零同样带部门，导出取提交时的快照而非当前名单', async () => {
  const seed = fixture()
  seed.students[1].department = '图书馆'          // 枚举外：补零行应写空字符串
  seed.students.push({ _id: 'd', name: '主管丁', studentId: 'S4', openid: 'wx-d', isSupervisor: true, department: ' cpro ' })
  const h = createHarness(seed)
  await h.call('submitForm', 'wx-a', answer)
  h.tables.students[0].department = '图书馆'       // 提交后老师改了名单，不影响已落库的快照
  h.tables.monthly_forms[0].deadline = '2026-10-14T00:00:00Z'
  await h.call('calculateMonthly', undefined)

  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  const sheet = JSON.parse(h.uploads[0].fileContent.toString())[0]
  const rowOf = name => sheet.data.find(row => row[0] === name)
  assert.equal(rowOf('学助甲').at(-1), 'CPRO')     // 提交时的快照
  assert.equal(rowOf('主管乙').at(-1), '')          // 补零行：名单枚举外 → 空字符串
  assert.equal(rowOf('主管丁').at(-1), 'CPRO')      // 补零行：名单 ' cpro ' → 归一化
})

test('部门：新增该列之前的历史提交没有 department 字段，导出为空字符串且不报错', async () => {
  const seed = fixture()
  seed.submissions = [{
    _id: 'legacy', formId: 'f', month: '2026-10', openid: 'wx-a',
    studentId: 'S1', name: '学助甲', isSupervisor: false,   // 旧数据：没有 department 字段
    answers: { answer1: '30', answer2: '', answer3: 'ABE303', answer4: '见 projectRows', answer5: '', answer6: '' },
    projectRows: [], calc: { dutyHours: 30, projectHours: 0, totalHours: 30, effectiveHours: 40 },
    createTime: '2026-10-01', updateTime: '2026-10-01'
  }]
  const h = createHarness(seed)
  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  const sheet = JSON.parse(h.uploads[0].fileContent.toString())[0]
  assert.equal(sheet.data.length, 2)
  assert.equal(sheet.data[1][0], '学助甲')
  assert.equal(sheet.data[1].length, 9)        // 旧行也要补齐到 9 列
  assert.equal(sheet.data[1].at(-1), '')       // 缺字段 → 空字符串，不是 undefined 或报错
})

// 已确认的风险明确标记为待办，避免把本地通过误认为已经可上线。
test.todo('绑定唯一性：一个微信不得绑定多个学助或同时绑定老师与学助；需事务与并发验证')
test.todo('服务端拒绝负数、非有限值、非法地点、非法项目与非整数数量')
test.todo('并发绑定、并发首次提交、并发计算不会抢绑或重复写入')
test.todo('超过数据库单次查询上限时，计算与导出仍覆盖全部记录')
test.todo('calculateMonthly 的调用来源与权限限制，以及 manual 分支的完整行为')
