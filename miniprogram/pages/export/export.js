// miniprogram/pages/export/export.js
const app = getApp()
Page({
  data: {
    forms: [], formIndex: -1, formNames: [],
    downloading: false, calculating: false,
    lastResult: null, loading: true, loadError: ''
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
    const selected = this.data.forms[this.data.formIndex]
    this.setData({ loading: true, loadError: '' })
    try {
      const res = await wx.cloud.callFunction({ name: 'listForms' })
      const r = res.result
      if (!r.ok) { this.setData({ loadError: r.msg || '暂时无法获取表单' }); return }
      const labels = { open: '填报中', closed: '已截止', calculated: '已统计' }
      const forms = r.forms.map(f => ({ ...f, statusLabel: labels[f.status] || '未知状态' }))
      const selectedIndex = selected ? forms.findIndex(f => f._id === selected._id) : -1
      this.setData({ forms, formNames: forms.map(f => `${f.month} 月度表单`), formIndex: forms.length ? Math.max(0, selectedIndex) : -1 })
    } catch (e) {
      this.setData({ loadError: '网络连接失败，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goCreate() { wx.navigateTo({ url: '/pages/form-create/form-create' }) },
  onForm(e) { this.setData({ formIndex: Number(e.detail.value) }) },

  async calculate() {
    if (this.data.calculating || this.data.downloading || this.data.loading) return
    const selected = this.data.forms[this.data.formIndex]
    if (!selected) return
    this.setData({ calculating: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'calculateMonthly', data: { manual: true, month: selected.month } })
      wx.showToast({ title: res.result.ok ? '统计已完成' : res.result.msg, icon: 'none' })
      await this.loadForms()
    } catch (e) {
      wx.showToast({ title: '统计失败，请重试', icon: 'none' })
    } finally {
      this.setData({ calculating: false })
    }
  },

  async exportXlsx() {
    if (this.data.downloading || this.data.calculating || this.data.loading) return
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
    } catch (e) {
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    } finally {
      this.setData({ downloading: false })
    }
  },

  preview() {
    const r = this.data.lastResult
    if (r && r.url) wx.setClipboardData({ data: r.url })
  }
})
