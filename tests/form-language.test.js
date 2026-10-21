const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const path = require('node:path')
const { PROJECT_ROWS } = require('../miniprogram/config/constants')
const { messages, translateError } = require('../miniprogram/config/form-i18n')

function harness(language) {
  let page, sent, toast
  const filename = path.resolve(__dirname, '../miniprogram/pages/form/form.js')
  const wx = {
    getStorageSync: () => language,
    setNavigationBarTitle() {},
    showToast(value) { toast = value.title },
    cloud: { async callFunction(request) { sent = request; return { result: { ok: true } } } }
  }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: createRequire(filename), getApp: () => ({ globalData: { role: 'student' } }), wx,
    Page(value) { page = value }
  }, { filename })
  page.setData = value => Object.assign(page.data, value)
  return { page, wx, sent: () => sent, toast: () => toast }
}

test('英文填报回填及提交保留原始项目键、中文状态和用户内容', async () => {
  const h = harness('en')
  h.page.onShow()
  assert.equal(h.page.data.projectOptions[0].label, PROJECT_ROWS[0].labelEn)
  assert.equal(h.page.data.statusOptions[0].label, 'Published')
  assert.equal(h.page.data.statusOptions[0].value, '已发布')
  const project = { key: PROJECT_ROWS[0].key, name: '我的项目', role: 'participant', status: '已发布', completionForm: 'Website', actualHours: 2 }
  h.page.fillExisting({ answers: { answer1: 3, answer2: 'Monday', answer3: 'ABE303', answer6: '备注' }, projects: [project] })
  h.page.setData({ loading: false })
  await h.page.submit()
  const submitted = h.sent().data.projects[0]
  assert.equal(submitted.key, project.key)
  assert.equal(submitted.status, project.status)
  assert.equal(submitted.name, project.name)
  assert.equal(submitted.label, PROJECT_ROWS[0].label)
  assert.equal(h.sent().data.appeal, '备注')
  assert.equal(h.toast(), 'Submitted')
})

test('默认中文、英文校验与网络提示、语言恢复不清空输入', async () => {
  const h = harness(undefined)
  h.page.onShow()
  assert.equal(h.page.data.language, 'zh')
  h.page.setData({ appeal: 'Keep this draft', loading: false })
  h.wx.getStorageSync = () => 'en'
  h.page.onShow()
  assert.equal(h.page.data.appeal, 'Keep this draft')
  await h.page.submit()
  assert.equal(h.toast(), messages.en.invalidDuty)
  h.wx.cloud.callFunction = async () => { throw new Error('offline') }
  await h.page.loadForm()
  assert.equal(h.page.data.loadError, messages.en.network)
  assert.equal(translateError('请完整填写项目2，实际完成时间须为非负数', 'en', ''), 'Complete all fields for project 2 and enter non-negative hours.')
  assert.equal(translateError('已过截止时间', 'en', ''), 'The deadline has passed')
})
