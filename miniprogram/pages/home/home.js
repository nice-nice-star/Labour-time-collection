const app = getApp()
Page({
  data: { role: '', user: null, currentMonth: '', avatarText: '' },

  onShow() {
    const now = new Date()
    const user = app.globalData.user
    this.setData({ role: app.globalData.role, user,
      avatarText: user && user.name ? user.name.slice(0, 1) : '管',
      currentMonth: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月` })
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
