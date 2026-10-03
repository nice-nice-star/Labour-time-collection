// miniprogram/pages/form/form.js
const { PROJECT_ROWS, LOCATION_OPTIONS, resolveProjectKey, normalizeProjectRows } = require('../../config/constants')
const { calcHours } = require('../../utils/calc')

Page({
  data: {
    month: '', deadline: '', status: '',
    closed: false, loading: true, loadError: '', hasSubmission: false,
    dutyHours: '', shiftTime: '', locationIndex: -1,
    locationOptions: LOCATION_OPTIONS,
    projectRows: PROJECT_ROWS.map(r => ({ ...r, count: 0 })),
    projectName: '', appeal: '',
    preview: { totalHours: 0, effectiveHours: 0 },
    submitting: false
  },

  async onLoad() {
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
      else this.recalc()
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
      projectRows: PROJECT_ROWS.map(pr => {
        // 历史提交里存的是中文名，新提交存的是稳定键，两者都要能回填
        const saved = (s.projectRows || []).find(x => resolveProjectKey(x && (x.key || x.item)) === pr.key)
        const count = saved ? Math.max(0, Math.floor(Number(saved.count) || 0)) : 0
        return { ...pr, count }
      }),
      projectName: s.answers.answer5 || '',
      appeal: s.answers.answer6 || ''
    })
    this.recalc()
  },

  onDuty(e) { this.setData({ dutyHours: e.detail.value }); this.recalc() },
  onShift(e) { this.setData({ shiftTime: e.detail.value }) },
  onLocation(e) { this.setData({ locationIndex: Number(e.detail.value) }) },

  onCount(e) {
    const idx = e.currentTarget.dataset.idx
    this.setData({ [`projectRows[${idx}].count`]: Math.max(0, Math.floor(Number(e.detail.value) || 0)) })
    this.recalc()
  },

  onProjectName(e) { this.setData({ projectName: e.detail.value }) },
  onAppeal(e) { this.setData({ appeal: e.detail.value }) },

  recalc() {
    const app = getApp()
    const isSup = !!(app.globalData.user && app.globalData.user.isSupervisor)
    const preview = calcHours(this.data.dutyHours, this.data.projectRows, isSup)
    this.setData({ preview })
  },

  async submit() {
    if (this.data.submitting || this.data.loading || this.data.loadError) return
    if (this.data.closed) return wx.showToast({ title: '表单已截止', icon: 'none' })
    const { dutyHours, shiftTime, locationIndex, projectRows, projectName, appeal } = this.data
    if (dutyHours === '' || !Number.isFinite(Number(dutyHours)) || Number(dutyHours) < 0) return wx.showToast({ title: '请填写有效的值班工时', icon: 'none' })
    if (locationIndex < 0) return wx.showToast({ title: '请选择值班地点', icon: 'none' })

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitForm',
        data: { dutyHours, shiftTime, locationIndex, projectRows: normalizeProjectRows(projectRows), projectName, appeal }
      })
      const r = res.result
      if (!r.ok) return wx.showToast({ title: r.msg, icon: 'none' })
      this.setData({ preview: r.calc, hasSubmission: true })
      wx.showToast({ title: '提交成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
