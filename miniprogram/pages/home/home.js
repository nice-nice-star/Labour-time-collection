const app = getApp()
const { messages, monthLabel } = require('../../config/home-i18n')
Page({
  data: { role: '', user: null, currentMonth: '', avatarText: '', language: 'zh', t: messages.zh },

  onShow() {
    const user = app.globalData.user
    this.setData({ role: app.globalData.role, user,
      avatarText: user && user.name ? user.name.slice(0, 1) : '管' })
    let language = 'zh'
    try { language = wx.getStorageSync('homeLanguage') === 'en' ? 'en' : 'zh' } catch (e) {}
    this.applyLanguage(app.globalData.role === 'student' ? language : 'zh')
  },

  applyLanguage(language) {
    this.setData({ language, t: messages[language], currentMonth: monthLabel(language, new Date()) })
    wx.setNavigationBarTitle({ title: messages[language].title })
  },

  toggleLanguage() {
    if (this.data.role !== 'student') return
    const language = this.data.language === 'zh' ? 'en' : 'zh'
    this.applyLanguage(language)
    try { wx.setStorageSync('homeLanguage', language) } catch (e) {}
  },

  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  // 轻量退出：仅清空本地登录态，不解除后端绑定
  logout() {
    wx.showModal({
      title: this.data.t.logoutTitle,
      content: this.data.t.logoutContent,
      confirmText: this.data.t.confirm,
      cancelText: this.data.t.cancel,
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
