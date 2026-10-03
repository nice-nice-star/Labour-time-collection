const test = require('node:test')
const assert = require('node:assert/strict')
const { createHarness } = require('./helpers/cloud-harness')
const { calcHours } = require('../miniprogram/utils/calc')
const { PROJECT_HOURS, PROJECT_KEYS, PROJECT_LABELS, resolveProjectKey, labelOf, normalizeProjectRows, DEPARTMENTS, DEPARTMENT_ALIASES, resolveDepartment } = require('../miniprogram/config/constants')
const { resolveCloudEnv } = require('../miniprogram/config/environment')

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
  projectRows: [{ key: 'internal_event', count: 2 }], projectName: '测试项目', appeal: '' }

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
  assert.equal(Object.keys(PROJECT_LABELS).length, 13)
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

test('稳定键与中文显示文本可双向解析；归一化剔除未知项目、数量取非负整数', () => {
  // 新键可解析
  assert.equal(resolveProjectKey(PROJECT_KEYS.INTERNAL_EVENT), PROJECT_KEYS.INTERNAL_EVENT)
  assert.equal(labelOf(PROJECT_KEYS.INTERNAL_EVENT), '组织一次内部活动')
  // 历史中文名仍可解析（兼容老数据）
  assert.equal(resolveProjectKey('组织一次内部活动'), PROJECT_KEYS.INTERNAL_EVENT)
  assert.equal(resolveProjectKey('不存在的项目'), null)
  assert.equal(resolveProjectKey(undefined), null)

  assert.deepEqual(normalizeProjectRows([{ key: 'internal_event', count: 2 }]), [
    { key: 'internal_event', label: '组织一次内部活动', count: 2 }
  ])
  // 历史格式与小数/负数数量
  assert.deepEqual(normalizeProjectRows([{ item: '组织一次内部活动', count: 1.7 }]), [
    { key: 'internal_event', label: '组织一次内部活动', count: 1 }
  ])
  assert.deepEqual(normalizeProjectRows([{ key: 'poster', count: -5 }]), [
    { key: 'poster', label: '海报设计', count: 0 }
  ])
  assert.deepEqual(normalizeProjectRows([{ key: 'unknown_item', count: 2 }]), [])
  assert.deepEqual(normalizeProjectRows(null), [])
  // 幂等：已归一化的结果再归一化不变
  const once = normalizeProjectRows([{ key: 'poster', count: 3 }])
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
  assert.equal(first.calc.totalHours, 46)
  assert.equal(first.calc.effectiveHours, 40)
  assert.equal(h.tables.submissions[0].name, '学助甲')
  assert.equal((await h.call('getForm', 'wx-b')).submission, null)
  assert.equal((await h.call('getForm', 'wx-a')).submission.answers.answer1, '30')
  await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 40 })
  assert.equal(h.tables.submissions.length, 1)
  assert.equal(h.tables.submissions[0].calc.totalHours, 56)
  assert.equal((await h.call('listForms', 'wx-teacher')).forms[0].count, 1)
})

test('所有项目费率、待定项目、主管倍率和 40 小时上限与前端一致', async () => {
  for (const isSupervisor of [false, true]) {
    const h = createHarness(fixture())
    for (const key of Object.keys(PROJECT_HOURS)) {
      const rows = [{ key, count: 3 }]
      const result = await h.call('submitForm', isSupervisor ? 'wx-b' : 'wx-a', { ...answer, dutyHours: 32, projectRows: rows })
      assert.deepEqual(result.calc, calcHours(32, rows, isSupervisor))
    }
    // 历史数据的兼容点：数据库里存的中文名提交必须算出同样的结果
    const legacyRows = [{ item: '组织一次内部活动', count: 3 }]
    const legacy = await h.call('submitForm', isSupervisor ? 'wx-b' : 'wx-a', { ...answer, dutyHours: 32, projectRows: legacyRows })
    const keyed = await h.call('submitForm', isSupervisor ? 'wx-b' : 'wx-a', { ...answer, dutyHours: 32, projectRows: [{ key: 'internal_event', count: 3 }] })
    assert.deepEqual(legacy.calc, keyed.calc)
    assert.deepEqual(legacy.calc, calcHours(32, [{ key: 'internal_event', count: 3 }], isSupervisor))
    assert.equal(legacy.calc.totalHours, isSupervisor ? 84 : 56)

    const zero = await h.call('submitForm', isSupervisor ? 'wx-b' : 'wx-a', { ...answer, dutyHours: 0, projectRows: [] })
    assert.equal(zero.calc.effectiveHours, 0)
  }
})

test('有效工时最高 40 小时；前端预估与云端存储先算主管倍率再封顶', async () => {
  const cases = [
    { duty: 0, supervisor: false, total: 0, effective: 0 },
    { duty: 30, supervisor: false, total: 30, effective: 30 },
    { duty: 39, supervisor: false, total: 39, effective: 39 },
    { duty: 40, supervisor: false, total: 40, effective: 40 },
    { duty: 41, supervisor: false, total: 41, effective: 40 },
    { duty: 50, supervisor: false, total: 50, effective: 40 },
    { duty: 0, supervisor: true, total: 0, effective: 0 },
    { duty: 20, supervisor: true, total: 30, effective: 30 },
    { duty: 26, supervisor: true, total: 39, effective: 39 },
    { duty: 27, supervisor: true, total: 40.5, effective: 40 },
    { duty: 30, supervisor: true, total: 45, effective: 40 },
    { duty: 50, supervisor: true, total: 75, effective: 40 },
    { duty: 10, rows: [{ key: 'internal_event', count: 2 }], supervisor: true, total: 39, effective: 39 },
    { duty: 11, rows: [{ key: 'internal_event', count: 2 }], supervisor: true, total: 40.5, effective: 40 }
  ]
  for (const { duty, rows = [], supervisor, total, effective } of cases) {
    const expected = { dutyHours: duty, projectHours: rows.length ? 16 : 0, totalHours: total, effectiveHours: effective }
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
  assert.equal(h.tables.submissions[0].calc.totalHours, 69)
  assert.equal(h.tables.submissions[0].calc.effectiveHours, 40)
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
