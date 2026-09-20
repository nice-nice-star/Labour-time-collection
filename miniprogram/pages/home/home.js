const app = getApp()
Page({
  data: { role: '', user: null },

  onShow() {
    this.setData({ role: app.globalData.role, user: app.globalData.user })
  },

  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  // 轻量退出：仅清空本地登录态，不解除后端绑定
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？（退出后下次打开会自动登录）',
      success: (res) => {
        if (!res.confirm) return
        app.globalData.role = null
        app.globalData.user = null
        app.globalData.openid = null
        wx.reLaunch({ url: '/pages/index/index' })
      }
    })
  }
})