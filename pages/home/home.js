const app = getApp()
Page({
  data: { role: '', user: null },
  onShow() {
    this.setData({ role: app.globalData.role, user: app.globalData.user })
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
