// 填报进度的纯逻辑：名单 + 提交记录 → 每人一行 + 汇总。
//
// 抽出来的理由：小程序端（getSubmissions）和 Web 端（webGetSubmissions）必须给出**完全一样**
// 的进度口径。云函数不能跨目录 require，所以本文件在两处各存一份副本，npm test 校验逐字节一致。
const { departmentText } = require('./departments')

// 只回汇总数值，不回 answers / projectRows：老师在这页看不到学助填的具体内容。
function buildRows(students, submissions) {
  const byOpenid = new Map((submissions || []).map(s => [s.openid, s]))
  return (students || []).map(stu => {
    const sub = stu.openid ? byOpenid.get(stu.openid) : null
    // 月结补零同样写 submissions，但它是「未提交」的结果，进度必须与真提交区分。
    // 缺 source 的历史记录按真提交处理（该字段上线前的数据不会因缺字段被误判）。
    const submitted = !!sub && sub.source !== 'auto-zero'
    const calc = (sub && sub.calc) || null
    // 提交过的取提交时快照（与导出 Excel 一致），未提交的退回当前名单值
    const department = (sub && sub.department) || stu.department || ''
    return {
      name: stu.name,
      studentId: stu.studentId,
      department,
      // 展示文本由服务端算好：两端页面都不必再实现一遍部门映射。
      // 名单原值可能是 Multimedia_Center 这类大小写写法，归一化后再转中文。
      departmentText: departmentText(department),
      isSupervisor: !!stu.isSupervisor,
      bound: !!stu.openid,
      submitted,
      zeroFilled: !!sub && sub.source === 'auto-zero',
      // 未提交没有「申报时长」，留 null 由页面显示为「—」，不写成 0
      effectiveHours: submitted && calc ? calc.effectiveHours : null
    }
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))
}

function summarize(rows) {
  const submitted = rows.filter(r => r.submitted).length
  const bound = rows.filter(r => r.bound).length
  return {
    total: rows.length,
    bound,
    submitted,
    // 已绑定但还没提交：月结时会被补零，导出里按 0 计入
    pending: bound - submitted,
    // 未绑定：calculateMonthly 会跳过，导出也缺这些人
    unbound: rows.length - bound
  }
}

module.exports = { buildRows, summarize }
