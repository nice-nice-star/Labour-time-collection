// 当前仅有一个云环境，各版本共用；以后可将 test 改为独立测试环境 ID。
const environments = {
  production: 'cloud1-d4g33db5k71c0eba5',
  test: 'cloud1-d4g33db5k71c0eba5'
}

function resolveCloudEnv(version, config = environments) {
  if (version === 'release') {
    if (!config.production) throw new Error('请配置正式云环境 ID')
    return config.production
  }
  if (version !== 'develop' && version !== 'trial') {
    throw new Error('无法识别小程序版本，已停止连接云环境')
  }
  if (!config.test) {
    throw new Error('请在 config/environment.js 配置测试云环境 ID')
  }
  return config.test
}

module.exports = { environments, resolveCloudEnv }
