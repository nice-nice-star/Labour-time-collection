// 开发版、体验版必须连接独立测试环境；填入实际环境 ID 后才能联调。
const environments = {
  production: 'cloud1-d4g33db5k71c0eba5',
  test: ''
}

function resolveCloudEnv(version, config = environments) {
  if (version === 'release') {
    if (!config.production) throw new Error('请配置正式云环境 ID')
    return config.production
  }
  if (version !== 'develop' && version !== 'trial') {
    throw new Error('无法识别小程序版本，已停止连接云环境')
  }
  if (!config.test || config.test === config.production) {
    throw new Error('请在 config/environment.js 配置独立的测试云环境 ID')
  }
  return config.test
}

module.exports = { environments, resolveCloudEnv }
