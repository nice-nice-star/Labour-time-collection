// miniprogram/pages/form/form.js
const { PROJECT_ROWS, LOCATION_OPTIONS } = require('../../config/constants')
const { calcHours } = require('../../utils/calc')

Page({
  data: {
    month: '', deadline: '', status: '',
    closed: false,
    dutyHours: '', shiftTime: '', locationIndex: -1,
    locationOptions: LOCATION_OPTIONS,
    projectRows: PROJECT_ROWS.map(r => ({ ...r, count: 0 })),
    projectName: '', appeal: '',
    preview: { totalHours: 0, effectiveHours: 0 },
    submitting: false
  },

  async onLoad() {
    const res = await wx.cloud.callFunction({ name: 'getForm' })
    const r = res.result
    if (!r.ok) {
      wx.showToast({ title: r.msg, icon: 'none' })
      return
    }
    const closed = r.form.status === 'closed' || r.form.status === 'calculated'
    this.setData({ month: r.form.month, deadline: r.form.deadline, status: r.form.status, closed })
    if (r.submission) this.fillExisting(r.submission)
  },

  fillExisting(s) {
    this.setData({
      dutyHours: s.answers.answer1 || '',
      shiftTime: s.answers.answer2 || '',
      locationIndex: LOCATION_OPTIONS.indexOf(s.answers.answer3),
      projectRows: PROJECT_ROWS.map(pr => {
        const row = (s.projectRows || []).find(x => x.item === pr.item)
        return { ...pr, count: row ? row.count : 0 }
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
    this.setData({ [`projectRows[${idx}].count`]: Number(e.detail.value) || 0 })
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
    if (this.data.closed) return wx.showToast({ title: '表单已截止', icon: 'none' })
    const { dutyHours, shiftTime, locationIndex, projectRows, projectName, appeal } = this.data
    if (locationIndex < 0) return wx.showToast({ title: '请选择值班地点', icon: 'none' })

    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'submitForm',
        data: { dutyHours, shiftTime, locationIndex, projectRows, projectName, appeal }
      })
      const r = res.result
      if (!r.ok) return wx.showToast({ title: r.msg, icon: 'none' })
      this.setData({ preview: r.calc })
      wx.showToast({ title: '提交成功', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
