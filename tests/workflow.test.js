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
  assert.equal(resolveDepartment('Administration_and_Data'), 'Administration_and_Data')
  assert.equal(resolveDepartment('administration_and_data'), 'Administration_and_Data')
  assert.equal(resolveDepartment('  AdministratION_AND_data  '), 'Administration_and_Data')
  // 枚举外、留空、非字符串一律空字符串（不静默保留错值）
  for (const value of ['图书馆', 'Unknown_Department', '', '   ', null, undefined, 0]) {
    assert.equal(resolveDepartment(value), '', `枚举外的值未归一化为空字符串: ${value}`)
  }
  // 三处结果必须一致（含名单里可能出现的全角等写法）
  for (const value of ['Administration_and_Data', 'administration_and_data', '  AdministratION_AND_data  ', 'ＡＤＭＩＮＩＳＴＲＡＴＩＯＮ', '图书馆', '', null, undefined]) {
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
const WEB_FUNCTIONS = ['webBind', 'webLogin', 'webSession']
process.env.WEB_TOKEN_SECRET = WEB_SECRET

function webFixture() {
  const seed = fixture()
  // 第二个老师账户，用于验证「票据归属」不会与残留的微信身份串号
  seed.export_accounts.push({ _id: 't2', name: '老师乙', exportId: 'T2', openid: 'wx-teacher-2' })
  return seed
}

const PASSWORD = 'goodpassword'

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
  assert.ok(login.token, '登录成功应返回票据')
  assert.deepEqual(login.user, { name: '老师', exportId: 'T1' })

  const session = await h.call('webSession', undefined, { token: login.token })
  assert.equal(session.ok, true)
  assert.deepEqual(session.user, { name: '老师', exportId: 'T1' })
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
  const expired = signToken(h.tables.export_accounts[0]._id, WEB_SECRET, Date.now() - 2 * 24 * 60 * 60 * 1000)
  assert.equal((await h.call('webSession', undefined, { token: expired })).ok, false, '过期票据被放行')
  // 换密钥签的票据不认
  assert.equal((await h.call('webSession', undefined, { token: signToken('t', 'another-secret-16-chars-long') })).ok, false)

  // 缺密钥：拒绝服务，而不是退回无签名校验
  delete process.env.WEB_TOKEN_SECRET
  try {
    assert.equal((await h.call('webSession', undefined, { token })).ok, false)
    assert.equal((await h.call('webLogin', undefined, { name: '老师', exportId: 'T1', password: PASSWORD })).ok, false)
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
  assert.deepEqual(session.user, { name: '老师乙', exportId: 'T2' })
  // 没有票据时，残留身份也换不到任何东西
  assert.equal((await h.call('webSession', undefined, {})).ok, false)
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
  assert.equal(exported.filename, '2026_10_15学助工时明细.xlsx')
  const sheets = JSON.parse(h.uploads[0].fileContent.toString())
  assert.equal(sheets.length, 2)
  assert.equal(sheets[0].name, '2026-10')
  assert.equal(sheets[0].data.length, 3)
  // 主表不再放第四题明细，改为末尾的「项目明细」工作表
  assert.deepEqual(sheets[0].data[0], ['姓名', '部门', '有效工时', '值班总工时', '值班时段', '值班地点', '项目名称', '额外工时申诉'])
  // 部门列：已提交者取提交时快照，未提交者取补零时的名单值；导出时换成中文名
  assert.equal(sheets[0].data.find(row => row[0] === '学助甲')[1], '行政与数据')
  assert.equal(sheets[0].data.find(row => row[0] === '主管乙')[1], '行政与数据')
  assert.equal(sheets[0].data.find(row => row[0] === '主管乙')[2], 40)
  assert.equal(sheets[0].data.find(row => row[0] === '学助甲')[2], 0)

  // 项目明细：每人每个申报项目一行；学助甲由月结补零、projectRows 为空，不产生明细行
  assert.equal(sheets[1].name, '项目明细')
  assert.deepEqual(sheets[1].data[0], ['姓名', '部门', '项目', '参与数', '统筹数', '折算工时'])
  assert.equal(sheets[1].data.length, 2)
  assert.deepEqual(sheets[1].data[1], ['主管乙', '行政与数据', '集体活动', 2, 0, 4])
})

test('项目明细工作表：一人多项目、统筹列、按实际留空、全 0 行不写', async () => {
  const h = createHarness(fixture())
  await h.call('submitForm', 'wx-a', {
    ...answer,
    projectRows: [
      { key: 'team_activity', counts: { participant: 2, coordinator: 1 } },   // 2×2 + 8×1 = 12
      { key: 'poster', counts: { participant: 3, coordinator: 0 } },          // 3×1 = 3
      { key: 'reception', counts: { participant: 2, coordinator: 0 } },       // 按实际 → 折算工时留空
      { key: 'news_article', counts: { participant: 0, coordinator: 0 } }     // 全 0 → 不写
    ]
  })
  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  const sheets = JSON.parse(h.uploads[0].fileContent.toString())
  const detail = sheets[1]
  assert.equal(detail.name, '项目明细')
  assert.deepEqual(detail.data[0], ['姓名', '部门', '项目', '参与数', '统筹数', '折算工时'])
  assert.deepEqual(detail.data.slice(1), [
    ['学助甲', '行政与数据', '集体活动', 2, 1, 12],
    ['学助甲', '行政与数据', '海报设计', 3, 0, 3],
    ['学助甲', '行政与数据', '接待活动', 2, 0, '']
  ])
  // 主表仍是一人一行，且不含明细列
  assert.equal(sheets[0].data.length, 2)
  assert.equal(sheets[0].data[1].length, 8)
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
  seed.students[1].department = '图书馆'          // 枚举外：补零行应写空字符串
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
  assert.equal(rowOf('学助甲')[1], '行政与数据')     // 提交时的快照
  assert.equal(rowOf('主管乙')[1], '')               // 补零行：名单枚举外 → 空字符串
  assert.equal(rowOf('主管丁')[1], '行政与数据')     // 补零行：名单小写带空格 → 归一化再转中文
})

test('部门：历史提交缺字段导出为空字符串，已移除的旧部门原样输出且不报错', async () => {
  const seed = fixture()
  seed.submissions = [{
    _id: 'legacy', formId: 'f', month: '2026-10', openid: 'wx-a',
    studentId: 'S1', name: '学助甲', isSupervisor: false,   // 旧数据：没有 department 字段
    answers: { answer1: '30', answer2: '', answer3: 'ABE303', answer4: '见 projectRows', answer5: '', answer6: '' },
    projectRows: [], calc: { dutyHours: 30, projectHours: 0, totalHours: 30, effectiveHours: 40 },
    createTime: '2026-10-01', updateTime: '2026-10-01'
  }, {
    _id: 'legacy-removed', formId: 'f', month: '2026-10', openid: 'wx-b',
    studentId: 'S2', name: '主管乙', isSupervisor: true,
    department: 'CPRO',   // 已从部门枚举移除的旧快照：不在中文映射表里
    answers: { answer1: '20', answer2: '周一上午', answer3: 'ABE303', answer4: '见 projectRows', answer5: '', answer6: '' },
    projectRows: [], calc: { dutyHours: 20, projectHours: 0, totalHours: 30, effectiveHours: 30 },
    createTime: '2026-10-01', updateTime: '2026-10-01'
  }]
  const h = createHarness(seed)
  const exported = await h.call('exportData', 'wx-teacher', { formId: 'f' })
  assert.equal(exported.ok, true)
  const sheet = JSON.parse(h.uploads[0].fileContent.toString())[0]
  assert.equal(sheet.data.length, 3)
  const rowOf = name => sheet.data.find(row => row[0] === name)
  assert.equal(rowOf('学助甲').length, 8)      // 主表已移除第四题明细，旧行也要补齐到 8 列
  assert.equal(rowOf('学助甲')[1], '')         // 缺部门字段 → 空字符串，不是 undefined 或报错
  assert.equal(rowOf('主管乙')[1], 'CPRO')     // 查不到中文名 → 原样输出，不静默清空
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
// 三个 web* 必须共用同一个密钥：webLogin 签发、webSession 验签，值不一致就会全部验不过。
// 而测试环境与正式环境的密钥必须不同，避免拿测试票据去撞正式环境。
test.todo('三个 web* 云函数已配置同一个 WEB_TOKEN_SECRET，且测试/正式环境各用独立密钥')
test.todo('Web 登录需要限流/锁定，防止口令被在线暴力破解')
