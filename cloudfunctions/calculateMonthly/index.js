// cloudfunctions/calculateMonthly/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const now = new Date()

  // 1. 到期的 open 表单 → 关闭
  const opens = await db.collection('monthly_forms')
    .where({ status: 'open' }).get()
  for (const f of opens.data) {
    if (f.deadline && now.getTime() > new Date(f.deadline).getTime()) {
      await db.collection('monthly_forms').doc(f._id).update({ data: { status: 'closed' } })
    }
  }

  // 2. closed 表单 → 计算并置为 calculated
  const closed = await db.collection('monthly_forms')
    .where({ status: 'closed' }).get()

  const project = { name: 'labour-time-collection', version: '1.0.0' }
  const result = { ok: true, calculated: [], skipped: [] }

  for (const f of closed.data) {
    try {
      // 该月所有提交
      const subs = await db.collection('submissions')
        .where({ formId: f._id }).get()

      // 若某学助未提交，则生成为 0（确保导出表格含全部学助）
      const students = await db.collection('students').get()
      const submittedOpenids = new Set(subs.data.map(s => s.openid))
      for (const s of students.data) {
        if (!s.openid || submittedOpenids.has(s.openid)) continue
        await db.collection('submissions').add({
          data: {
            formId: f._id, month: f.month, openid: s.openid,
            studentId: s.studentId, name: s.name, isSupervisor: !!s.isSupervisor,
            answers: { answer1: '0', answer2: '', answer3: '', answer4: '', answer5: '', answer6: '' },
            projectRows: [], calc: { dutyHours: 0, projectHours: 0, totalHours: 0, effectiveHours: 0 },
            createTime: db.serverDate(), updateTime: db.serverDate()
          }
        })
      }

      await db.collection('monthly_forms').doc(f._id).update({ data: { status: 'calculated' } })
      result.calculated.push(f.month)
    } catch (e) {
      result.skipped.push({ month: f.month, err: e.message })
    }
  }

  // 手动触发时，也允许对指定月直接计算
  if (event.manual) {
    const f = await db.collection('monthly_forms').where({ month: event.month }).get()
    // （此处省略，逻辑同上：closed → calculated）
  }

  return result
}
