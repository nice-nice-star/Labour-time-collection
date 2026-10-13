// cloudfunctions/webCreateMonthlyForm/index.js
// Web 管理端：创建或重开某月的表单。
// 权限只来自 event.token（见 webauth.js），本函数不读调用方环境身份。
const cloud = require('wx-server-sdk')
const { requireExport } = require('./webauth')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  const { month, deadline } = event
  if (!month) return { ok: false, msg: '缺少月份' }

  const account = await requireExport(event, db)
  if (!account) return { ok: false, msg: '登录已过期，请重新登录' }

  // 已有该月表单则更新（截止时间可重新设置并重新开放）
  const exist = await db.collection('monthly_forms').where({ month }).get()
  if (exist.data.length) {
    await db.collection('monthly_forms').doc(exist.data[0]._id).update({
      data: {
        deadline: deadline || exist.data[0].deadline,
        status: 'open',
        updateTime: db.serverDate()
      }
    })
    return { ok: true, id: exist.data[0]._id, action: 'updated' }
  }

  const addRes = await db.collection('monthly_forms').add({
    data: {
      month,
      deadline: deadline || '',
      status: 'open',                 // open → closed(截止) → calculated(已计算)
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
  return { ok: true, id: addRes._id, action: 'created' }
}
