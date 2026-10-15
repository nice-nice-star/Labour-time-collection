// miniprogram/pages/form/form.js
const app = getApp()
let nextProjectId = 0
const { PROJECT_ROWS, LOCATION_OPTIONS } = require('../../config/constants')
const { STATUS_OPTIONS, normalizeProjects } = require('../../config/projects')

Page({
  data: {
    month: '', deadline: '', status: '',
    closed: false, loading: true, loadError: '', hasSubmission: false,
    dutyHours: '', shiftTime: '', locationIndex: -1,
    locationOptions: LOCATION_OPTIONS,
    projectOptions: PROJECT_ROWS, statusOptions: STATUS_OPTIONS, projects: [], legacyProjectRows: [],
    projectName: '', appeal: '',
    submitting: false
  },

  async onLoad() {
    // 老师没有填报入口，直接进入本页会看到填不了的表单：挡回去，由首页的「查看填报情况」承担
    if (app.globalData.role === 'export') {
      wx.showToast({ title: '请使用「查看填报情况」', icon: 'none' })
      setTimeout(() => wx.redirectTo({ url: '/pages/home/home' }), 600)
      return
    }
    await this.loadForm()
  },

  async loadForm() {
    this.setData({ loading: true, loadError: '' })
    try {
      const res = await wx.cloud.callFunction({ name: 'getForm' })
      const r = res.result
      if (!r.ok) { this.setData({ loadError: r.msg || '本月暂无可用表单' }); return }
      const deadlineTime = r.form.deadline ? new Date(r.form.deadline.replace(/-/g, '/')).getTime() : NaN
      const closed = r.form.status !== 'open' || Date.now() > deadlineTime
      this.setData({ month: r.form.month, deadline: r.form.deadline, status: r.form.status, closed, hasSubmission: !!r.submission })
      if (r.submission) this.fillExisting(r.submission)

    } catch (e) {
      this.setData({ loadError: '网络连接失败，请稍后重试' })
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
    if (this.data.closed) return wx.showToast({ title: '表单已截止', icon: 'none' })
    const { dutyHours, shiftTime, locationIndex, projects, appeal } = this.data
    if (dutyHours === '' || !Number.isFinite(Number(dutyHours)) || Number(dutyHours) < 0) return wx.showToast({ title: '请填写有效的值班工时', icon: 'none' })
    if (locationIndex < 0) return wx.showToast({ title: '请选择值班地点', icon: 'none' })

    let normalizedProjects
    try { normalizedProjects = normalizeProjects(projects) }
    catch (e) { return wx.showToast({ title: e.message, icon: 'none' }) }
    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitForm',
        data: { dutyHours, shiftTime, locationIndex, projects: normalizedProjects, appeal }
      })
      const r = res.result
      if (!r.ok) return wx.showToast({ title: r.msg, icon: 'none' })
      this.setData({ hasSubmission: true })
      wx.showToast({ title: '提交成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
