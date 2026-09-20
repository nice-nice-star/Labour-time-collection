// miniprogram/pages/form-create/form-create.js
const app = getApp()
Page({
  data: { month: '', deadline: '', minDate: '', submitting: false },

  onLoad() {
    if (app.globalData.role !== 'export') {
      wx.showToast({ title: '无权限', icon: 'none' })
      setTimeout(() => wx.redirectTo({ url: '/pages/home/home' }), 600)
      return
    }
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    this.setData({ month: `${y}-${m}`, minDate: `${y}-${m}-01` })
  },

  onMonth(e) { this.setData({ month: e.detail.value }) },
  onDeadline(e) { this.setData({ deadline: e.detail.value }) },

  async submit() {
    const { month, deadline } = this.data
    if (!month || !deadline) return wx.showToast({ title: '请选择月份与截止日期', icon: 'none' })
    this.setData({ submitting: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'createMonthlyForm',
        data: { month, deadline: `${deadline} 23:59:59` }
      })
      wx.showToast({ title: res.result.ok ? '创建成功' : res.result.msg, icon: 'none' })
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
