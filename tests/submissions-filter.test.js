// 「填报情况」页的部门筛选：纯函数规则 + 页面行为。
// Web 端同一套规则在 web/src/lib/rosterFilter.ts，这里锁定小程序端的口径。
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const {
  buildDepartmentOptions,
  filterSubmissionRows
} = require('../miniprogram/utils/search')

const labels = options => options.map(item => `${item.label}:${item.count}`)

test('部门选项：全部在最前、未设置排最后，其余按中文排序', () => {
  const rows = [
    { name: '学助甲', departmentText: '行政与数据' },
    { name: '主管乙', departmentText: '行政与数据' },
    { name: '学助丙', departmentText: '海外社媒' },
    { name: '待绑定丁', departmentText: '' }
  ]
  assert.deepEqual(labels(buildDepartmentOptions(rows)),
    ['全部:4', '海外社媒:1', '行政与数据:2', '未设置:1'])
  assert.deepEqual(buildDepartmentOptions(rows)[0].key, '')
  // 选项的 key 就是行的展示文本，页面据此精确匹配
  assert.deepEqual(buildDepartmentOptions(rows).map(item => item.key),
    ['', '海外社媒', '行政与数据', '未设置'])
})

test('部门选项：部门缺失（老数据没有 department）归到未设置，空名单只剩全部', () => {
  const options = buildDepartmentOptions([{ name: '甲' }, { name: '乙', departmentText: '   ' }])
  assert.deepEqual(labels(options), ['全部:2', '未设置:2'])
  assert.deepEqual(labels(buildDepartmentOptions([])), ['全部:0'])
  assert.deepEqual(labels(buildDepartmentOptions(undefined)), ['全部:0'])
})

test('姓名与部门取交集，空条件原样返回', () => {
  const rows = [
    { name: 'Alice Chen', departmentText: '行政与数据' },
    { name: 'Alice Wong', departmentText: '海外社媒' },
    { name: '张大文', departmentText: '海外社媒' }
  ]
  assert.equal(filterSubmissionRows(rows, '', ''), rows)
  assert.deepEqual(filterSubmissionRows(rows, '', '海外社媒').map(r => r.name), ['Alice Wong', '张大文'])
  assert.deepEqual(filterSubmissionRows(rows, 'alice', '').map(r => r.name), ['Alice Chen', 'Alice Wong'])
  assert.deepEqual(filterSubmissionRows(rows, 'ALICE', '行政与数据').map(r => r.name), ['Alice Chen'])
  // 姓名命中但部门不符：交集为空
  assert.deepEqual(filterSubmissionRows(rows, 'alice', '未设置'), [])
  assert.deepEqual(filterSubmissionRows(undefined, '', ''), [])
})

// —— 页面行为：加载名单后生成按钮，点击只过滤已加载的名单 ——

function row(name, department, extra = {}) {
  return { name, studentId: name, department, bound: true, submitted: true, effectiveHours: 8, ...extra }
}

function harness(forms, submissionsByFormId, user = {}) {
  let page
  const filename = path.resolve(__dirname, '../miniprogram/pages/submissions/submissions.js')
  const wx = {
    showToast() {},
    redirectTo() {},
    cloud: {
      async callFunction(request) {
        if (request.name === 'listForms') return { result: { ok: true, forms } }
        if (request.name === 'getSubmissions') {
          return {
            result: {
              ok: true,
              form: forms.find(f => f._id === request.data.formId),
              rows: submissionsByFormId[request.data.formId] || []
            }
          }
        }
        throw new Error(`未预期的云函数: ${request.name}`)
      }
    }
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename),
    getApp: () => ({ globalData: { role: 'export', user } }),
    wx,
    Page(value) { page = value },
    setTimeout: fn => fn()
  }, { filename })
  page.setData = value => Object.assign(page.data, value)
  return page
}

const FORMS = [
  { _id: 'f10', month: '2026-10', status: 'open' },
  { _id: 'f09', month: '2026-09', status: 'calculated' },
  { _id: 'f08', month: '2026-08', status: 'calculated' }
]

const ROWS = {
  f10: [
    row('学助甲', 'Administration_and_Data'),
    row('主管乙', ' administration_and_data ', { isSupervisor: true }),
    row('学助丙', 'Overseas_social_Media'),
    row('待绑定丁', undefined, { bound: false, submitted: false, effectiveHours: null })
  ],
  // 9 月仍有两个部门：切月份时保留老师选中的部门
  f09: [row('学助甲', 'Administration_and_Data'), row('学助丙', 'Overseas_social_Media')],
  // 8 月没有「行政与数据」：默认筛选要能退回全部，而不是空列表
  f08: [row('学助丙', 'Overseas_social_Media'), row('待绑定丁', undefined)]
}

test('页面：部门按钮来自名单并可与姓名搜索叠加，清除后回到全部', async () => {
  const page = harness(FORMS, ROWS)
  await page.onLoad()

  assert.deepEqual(page.data.forms.length, 3)
  assert.deepEqual(labels(page.data.departments), ['全部:4', '海外社媒:1', '行政与数据:2', '未设置:1'])
  assert.equal(page.data.department, '')
  assert.equal(page.data.visibleRows.length, 4)

  // 点「行政与数据」：两条归一化到同一中文名，都应命中
  page.selectDepartment({ currentTarget: { dataset: { key: '行政与数据' } } })
  assert.equal(page.data.department, '行政与数据')
  assert.deepEqual(page.data.visibleRows.map(r => r.name), ['学助甲', '主管乙'])

  // 再叠加姓名，取交集
  page.onSearch({ detail: { value: '主管' } })
  assert.equal(page.data.keyword, '主管')
  assert.deepEqual(page.data.visibleRows.map(r => r.name), ['主管乙'])

  // 清掉姓名只保留部门，而不是回到全员
  page.clearSearch()
  assert.equal(page.data.keyword, '')
  assert.deepEqual(page.data.visibleRows.map(r => r.name), ['学助甲', '主管乙'])

  // 再点一次已选中的部门等于取消筛选
  page.selectDepartment({ currentTarget: { dataset: { key: '行政与数据' } } })
  assert.equal(page.data.department, '')
  assert.equal(page.data.visibleRows.length, 4)

  // 选中无部门的人：未设置是一个可筛选的桶
  page.selectDepartment({ currentTarget: { dataset: { key: '未设置' } } })
  assert.deepEqual(page.data.visibleRows.map(r => r.name), ['待绑定丁'])
  page.clearFilters()
  assert.equal(page.data.department, '')
  assert.equal(page.data.keyword, '')
  assert.equal(page.data.visibleRows.length, 4)
})

test('页面：老师带部门进入时默认选中本部门，切月份保留，部门不在名单里退回全部', async () => {
  const page = harness(FORMS, ROWS, { department: 'Administration_and_Data' })
  await page.onLoad()

  assert.equal(page.data.ownDepartment, '行政与数据')
  assert.equal(page.data.department, '行政与数据')
  assert.deepEqual(page.data.visibleRows.map(r => r.name), ['学助甲', '主管乙'])

  // 换月份只清姓名，部门仍在本月名单里就保留
  page.onSearch({ detail: { value: '学助' } })
  page.onForm({ detail: { value: 1 } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(page.data.keyword, '')
  assert.equal(page.data.department, '行政与数据')
  assert.deepEqual(page.data.visibleRows.map(r => r.name), ['学助甲'])

  // 8 月没有「行政与数据」：退回全部，不是空列表
  page.onForm({ detail: { value: 2 } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(page.data.department, '')
  assert.deepEqual(page.data.visibleRows.map(r => r.name), ['学助丙', '待绑定丁'])
})

test('页面：老师部门的写法千奇百怪也能归一到本部门按钮', async () => {
  const cases = [
    ['Administration_and_Data', '行政与数据'],
    ['administration_and_data', '行政与数据'],
    ['Administration and Data', '行政与数据'],
    ['行政与数据', '行政与数据'],
    ['  Administration_and_Data  ', '行政与数据'],
    // 枚举外的旧值原样保留：学生行的部门列也是这么显示的，两边能对上
    ['CPRO', 'CPRO'],
    // 空值、纯空白当作没有部门：不能拼出「未设置」去筛「没有部门的学助」
    ['', ''],
    ['   ', ''],
    [undefined, '']
  ]
  for (const [raw, expected] of cases) {
    const page = harness(FORMS, ROWS, { department: raw })
    await page.onLoad()
    assert.equal(page.data.ownDepartment, expected, `ownDepartment: ${raw}`)
  }
})

test('页面：老师没有部门、或名单只有一个部门时不做默认筛选', async () => {
  const noDept = harness(FORMS, ROWS, {})
  await noDept.onLoad()
  assert.equal(noDept.data.ownDepartment, '')
  assert.equal(noDept.data.department, '')
  assert.equal(noDept.data.visibleRows.length, 4)

  // 只有一个部门：筛选没有意义，按钮条隐藏，也不默认选中
  const single = harness([FORMS[0]], {
    f10: [row('学助甲', 'Administration_and_Data'), row('主管乙', 'Administration_and_Data')]
  }, { department: 'Administration_and_Data' })
  await single.onLoad()
  assert.deepEqual(labels(single.data.departments), ['全部:2', '行政与数据:2'])
  assert.equal(single.data.department, '')
  assert.equal(single.data.visibleRows.length, 2)
})
