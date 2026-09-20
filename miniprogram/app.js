App({
  globalData: {
    openid: null,
    role: null,          // 'export' | 'student' | 'unbound'
    user: null
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d4g33db5k71c0eba5',   // TODO: 替换为你的云环境 ID
        traceUser: true
      })
    }
  }
})
