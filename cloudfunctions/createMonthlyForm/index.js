// cloudfunctions/createMonthlyForm/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { month, deadline } = event
  if (!month) return { ok: false, msg: '缺少月份' }

  // 权限校验：必须是导出账户
  const exp = await db.collection('export_accounts').where({ openid: OPENID }).get()
  if (!exp.data.length) return { ok: false, msg: '无权限' }

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
