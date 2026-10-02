const app = getApp()
Page({
  data: { loginError: false, checking: false },
  onLoad() {
    this.checkLogin()
  },
  async checkLogin() {
    if (this.data.checking) return
    this.setData({ checking: true, loginError: false })
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      const { role, openid, user } = res.result
      app.globalData = { ...app.globalData, role, openid, user }
      if (role === 'unbound') {
        wx.redirectTo({ url: '/pages/login/login' })
      } else {
        wx.redirectTo({ url: '/pages/home/home' })
      }
    } catch (e) {
      this.setData({ loginError: true })
      wx.showToast({ title: '登录失败', icon: 'none' })
    } finally {
      this.setData({ checking: false })
    }
  }
})
