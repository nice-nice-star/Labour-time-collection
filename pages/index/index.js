const app = getApp()
Page({
  onLoad() {
    this.checkLogin()
  },
  async checkLogin() {
    wx.showLoading({ title: '加载中' })
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const { role, openid, user } = res.result
      app.globalData = { ...app.globalData, role, openid, user }
      wx.hideLoading()
      if (role === 'unbound') {
        wx.redirectTo({ url: '/pages/login/login' })
      } else {
        wx.redirectTo({ url: '/pages/home/home' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '登录失败', icon: 'none' })
    }
  }
})
