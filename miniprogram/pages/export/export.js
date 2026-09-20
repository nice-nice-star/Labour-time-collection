// miniprogram/pages/export/export.js
const app = getApp()
Page({
  data: {
    forms: [], formIndex: -1, formNames: [],
    downloading: false, calculating: false,
    lastResult: null
  },

  async onLoad() {
    if (app.globalData.role !== 'export') {
      wx.showToast({ title: '无权限', icon: 'none' })
      setTimeout(() => wx.redirectTo({ url: '/pages/home/home' }), 600)
      return
    }
    await this.loadForms()
  },

  async loadForms() {
    const res = await wx.cloud.callFunction({ name: 'listForms' })
    const r = res.result
    if (!r.ok) return wx.showToast({ title: r.msg, icon: 'none' })
    const formNames = r.forms.map(f => `${f.month}（${f.status}，${f.count}人）`)
    this.setData({ forms: r.forms, formNames, formIndex: r.forms.length ? 0 : -1 })
  },

  onForm(e) { this.setData({ formIndex: Number(e.detail.value) }) },

  async calculate() {
    this.setData({ calculating: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'calculateMonthly', data: { manual: true } })
      wx.showToast({ title: res.result.ok ? '统计已完成' : res.result.msg, icon: 'none' })
      await this.loadForms()
    } finally {
      this.setData({ calculating: false })
    }
  },

  async exportXlsx() {
    const { forms, formIndex } = this.data
    if (formIndex < 0) return wx.showToast({ title: '暂无可导出的表单', icon: 'none' })
    this.setData({ downloading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'exportData',
        data: { formId: forms[formIndex]._id }
      })
      const r = res.result
      if (!r.ok) return wx.showToast({ title: r.msg, icon: 'none' })
      this.setData({ lastResult: r })
      // 复制下载链接到剪贴板
      wx.setClipboardData({ data: r.url })
      wx.showModal({
        title: '导出成功',
        content: `${r.filename}\n下载链接已复制到剪贴板`,
        showCancel: false
      })
    } finally {
      this.setData({ downloading: false })
    }
  },

  preview() {
    const r = this.data.lastResult
    if (r && r.url) wx.setClipboardData({ data: r.url })
  }
})
