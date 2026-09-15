Page({
  data: { name: '', studentId: '', binding: false },
  onName(e) { this.setData({ name: e.detail.value }) },
  onId(e) { this.setData({ studentId: e.detail.value }) },
  async bind() {
    const { name, studentId } = this.data
    if (!name.trim() || !studentId.trim()) {
      return wx.showToast({ title: '请填写姓名与ID', icon: 'none' })
    }
    this.setData({ binding: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'bindStudent',
        data: { name: name.trim(), studentId: studentId.trim() }
      })
      if (!res.result.ok) {
        return wx.showToast({ title: res.result.msg, icon: 'none' })
      }
      const app = getApp()
      app.globalData.role = 'student'
      app.globalData.user = res.result.user
      wx.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => wx.redirectTo({ url: '/pages/home/home' }), 800)
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      this.setData({ binding: false })
    }
  }
})
