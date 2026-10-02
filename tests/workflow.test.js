const test = require('node:test')
const assert = require('node:assert/strict')
const { createHarness } = require('./helpers/cloud-harness')
const { calcHours } = require('../miniprogram/utils/calc')
const { PROJECT_HOURS } = require('../miniprogram/config/constants')
const { resolveCloudEnv } = require('../miniprogram/config/environment')

function fixture() {
  return {
    students: [
      { _id: 'a', name: '学助甲', studentId: 'S1', openid: 'wx-a', isSupervisor: false },
      { _id: 'b', name: '主管乙', studentId: 'S2', openid: 'wx-b', isSupervisor: true },
      { _id: 'c', name: '待绑定丙', studentId: 'S3', isSupervisor: false }
    ],
    export_accounts: [{ _id: 't', name: '老师', exportId: 'T1', openid: 'wx-teacher' }],
    monthly_forms: [{ _id: 'f', month: '2026-10', status: 'open', deadline: '2026-10-20T00:00:00Z', createTime: '2026-10-01' }]
  }
}
const answer = { dutyHours: 30, shiftTime: '周一上午', locationIndex: 1,
  projectRows: [{ item: '组织一次内部活动', count: 2 }], projectName: '测试项目', appeal: '' }

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
  assert.equal(first.calc.effectiveHours, 46)
  assert.equal(h.tables.submissions[0].name, '学助甲')
  assert.equal((await h.call('getForm', 'wx-b')).submission, null)
  assert.equal((await h.call('getForm', 'wx-a')).submission.answers.answer1, '30')
  await h.call('submitForm', 'wx-a', { ...answer, dutyHours: 40 })
  assert.equal(h.tables.submissions.length, 1)
  assert.equal(h.tables.submissions[0].calc.totalHours, 56)
  assert.equal((await h.call('listForms', 'wx-teacher')).forms[0].count, 1)
})

test('所有项目费率、待定项目、主管倍率和 40 小时下限与前端一致', async () => {
  for (const isSupervisor of [false, true]) {
    const h = createHarness(fixture())
    for (const item of Object.keys(PROJECT_HOURS)) {
      const rows = [{ item, count: 3 }]
      const result = await h.call('submitForm', isSupervisor ? 'wx-b' : 'wx-a', { ...answer, dutyHours: 32, projectRows: rows })
      assert.deepEqual(result.calc, calcHours(32, rows, isSupervisor))
    }
    const zero = await h.call('submitForm', isSupervisor ? 'wx-b' : 'wx-a', { ...answer, dutyHours: 0, projectRows: [] })
    assert.equal(zero.calc.effectiveHours, 40)
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
  assert.equal(h.tables.submissions[0].calc.effectiveHours, 69)
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
  assert.deepEqual(sheets[0].data[0], ['Name', '有效工时', 'Answer1', 'Answer2', 'Answer3', 'Answer4', 'Answer5', 'Answer6'])
})

// 已确认的风险明确标记为待办，避免把本地通过误认为已经可上线。
test.todo('绑定唯一性：一个微信不得绑定多个学助或同时绑定老师与学助；需事务与并发验证')
test.todo('服务端拒绝负数、非有限值、非法地点、非法项目与非整数数量')
test.todo('并发绑定、并发首次提交、并发计算不会抢绑或重复写入')
test.todo('超过数据库单次查询上限时，计算与导出仍覆盖全部记录')
test.todo('calculateMonthly 的调用来源与权限限制，以及 manual 分支的完整行为')
