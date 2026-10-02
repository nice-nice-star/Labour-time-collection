const { resolveCloudEnv } = require('./config/environment')

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
        env: resolveCloudEnv(wx.getAccountInfoSync().miniProgram.envVersion),
        traceUser: true
      })
    }
  }
})
