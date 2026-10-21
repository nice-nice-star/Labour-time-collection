// miniprogram/pages/form/form.js
const app = getApp()
let nextProjectId = 0
const { PROJECT_ROWS, PROJECT_LABELS, PROJECT_LABELS_EN, LOCATION_OPTIONS } = require('../../config/constants')
const { STATUS_OPTIONS, normalizeProjects } = require('../../config/projects')
const { messages, translateError } = require('../../config/form-i18n')

Page({
  data: {
    language: 'zh', t: messages.zh, projectLabels: PROJECT_LABELS,
    month: '', deadline: '', status: '',
    closed: false, loading: true, loadError: '', hasSubmission: false,
    dutyHours: '', shiftTime: '', locationIndex: -1,
    locationOptions: LOCATION_OPTIONS,
    projectOptions: PROJECT_ROWS, statusOptions: STATUS_OPTIONS.map(value => ({ value, label: value })), projects: [], legacyProjectRows: [],
    projectName: '', appeal: '',
    submitting: false
  },

  async onLoad() {
    this.applyLanguage()
    // 老师没有填报入口，直接进入本页会看到填不了的表单：挡回去，由首页的「查看填报情况」承担
    if (app.globalData.role === 'export') {
      wx.showToast({ title: '请使用「查看填报情况」', icon: 'none' })
      setTimeout(() => wx.redirectTo({ url: '/pages/home/home' }), 600)
      return
    }
    await this.loadForm()
  },

  onShow() {
    this.applyLanguage()
  },

  applyLanguage() {
    let language = 'zh'
    try { language = wx.getStorageSync('homeLanguage') === 'en' ? 'en' : 'zh' } catch (e) {}
    if (app.globalData.role === 'export') language = 'zh'
    const statusLabels = ['Published', 'Completed, not published', 'Incomplete']
    this.setData({
      language, t: messages[language],
      projectLabels: language === 'en' ? PROJECT_LABELS_EN : PROJECT_LABELS,
      projectOptions: PROJECT_ROWS.map(row => ({ ...row, label: language === 'en' ? row.labelEn : row.label })),
      statusOptions: STATUS_OPTIONS.map((value, index) => ({ value, label: language === 'en' ? statusLabels[index] : value }))
    })
    wx.setNavigationBarTitle({ title: messages[language].title })
  },

  async loadForm() {
    this.setData({ loading: true, loadError: '' })
    try {
      const res = await wx.cloud.callFunction({ name: 'getForm' })
      const r = res.result
      if (!r.ok) { this.setData({ loadError: translateError(r.msg, this.data.language, this.data.t.loadFailed) }); return }
      const deadlineTime = r.form.deadline ? new Date(r.form.deadline.replace(/-/g, '/')).getTime() : NaN
      const closed = r.form.status !== 'open' || Date.now() > deadlineTime
      this.setData({ month: r.form.month, deadline: r.form.deadline, status: r.form.status, closed, hasSubmission: !!r.submission })
      if (r.submission) this.fillExisting(r.submission)

    } catch (e) {
      this.setData({ loadError: this.data.t.network })
    } finally {
      this.setData({ loading: false })
    }
  },

  fillExisting(s) {
    this.setData({
      dutyHours: s.answers.answer1 == null ? '' : s.answers.answer1,
      shiftTime: s.answers.answer2 || '',
      locationIndex: LOCATION_OPTIONS.indexOf(s.answers.answer3),
      projects: (s.projects || []).map(p => ({ ...p, localId: ++nextProjectId, typeIndex: PROJECT_ROWS.findIndex(r => r.key === p.key) })),
      legacyProjectRows: Array.isArray(s.projects) ? (s.legacyProjectRows || []) : (s.projectRows || []).filter(r => r.counts && (r.counts.participant || r.counts.coordinator)),
      projectName: s.legacyProjectName || s.answers.answer5 || '',
      appeal: s.answers.answer6 || ''
    })
  },

  onDuty(e) { this.setData({ dutyHours: e.detail.value }) },
  onShift(e) { this.setData({ shiftTime: e.detail.value }) },
  onLocation(e) { this.setData({ locationIndex: Number(e.detail.value) }) },

  addProject() {
    if (this.data.closed || this.data.submitting) return
    this.setData({ projects: this.data.projects.concat({ localId: ++nextProjectId, key: '', typeIndex: -1, name: '', role: '', status: '', completionForm: '', actualHours: '' }) })
  },
  removeProject(e) {
    if (this.data.closed || this.data.submitting) return
    this.setData({ projects: this.data.projects.filter((_, i) => i !== Number(e.currentTarget.dataset.idx)) })
  },
  onProjectType(e) {
    if (this.data.closed || this.data.submitting) return
    const idx = e.currentTarget.dataset.idx
    const typeIndex = Number(e.detail.value)
    this.setData({ [`projects[${idx}].typeIndex`]: typeIndex, [`projects[${idx}].key`]: PROJECT_ROWS[typeIndex].key })
  },
  onProjectField(e) {
    if (this.data.closed || this.data.submitting) return
    const { idx, field } = e.currentTarget.dataset
    this.setData({ [`projects[${idx}].${field}`]: e.detail.value })
  },
  onAppeal(e) { this.setData({ appeal: e.detail.value }) },

  async submit() {
    if (this.data.submitting || this.data.loading || this.data.loadError) return
    if (this.data.closed) return wx.showToast({ title: this.data.t.closedError, icon: 'none' })
    const { dutyHours, shiftTime, locationIndex, projects, appeal } = this.data
    if (dutyHours === '' || !Number.isFinite(Number(dutyHours)) || Number(dutyHours) < 0) return wx.showToast({ title: this.data.t.invalidDuty, icon: 'none' })
    if (locationIndex < 0) return wx.showToast({ title: this.data.t.selectLocation, icon: 'none' })

    let normalizedProjects
    try { normalizedProjects = normalizeProjects(projects) }
    catch (e) { return wx.showToast({ title: translateError(e.message, this.data.language, this.data.t.failed), icon: 'none' }) }
    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitForm',
        data: { dutyHours, shiftTime, locationIndex, projects: normalizedProjects, appeal }
      })
      const r = res.result
      if (!r.ok) return wx.showToast({ title: translateError(r.msg, this.data.language, this.data.t.failed), icon: 'none' })
      this.setData({ hasSubmission: true })
      wx.showToast({ title: this.data.t.success, icon: 'success' })
    } catch (e) {
      wx.showToast({ title: this.data.t.failed, icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
