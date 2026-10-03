// 只生成本地文件，不访问云端、不读取真实用户、不修改任何数据库。
const fs = require('node:fs')
const path = require('node:path')
// 部门必须取自受控枚举，否则导入后会被归一化成空字符串
const { DEPARTMENTS } = require('../miniprogram/config/constants')
const output = path.resolve(__dirname, '../test-artifacts/fixtures')
fs.mkdirSync(output, { recursive: true })
const DEPARTMENT = DEPARTMENTS[0]
if (!DEPARTMENT) throw new Error('DEPARTMENTS 为空，请先在 miniprogram/config/constants.js 中定义部门')
const collections = {
  students: [
    { _id: 'test_student_a', name: '测试学助甲', studentId: 'TEST-S001', isSupervisor: false, department: "Administration_and_Data" },
    { _id: 'test_supervisor', name: '测试主管乙', studentId: 'TEST-S002', isSupervisor: true, department: "Overseas_social_Media" },
    { _id: 'test_absent', name: '测试未提交丙', studentId: 'TEST-S003', isSupervisor: false, department: "Journalist_News_Center" }
  ],
  export_accounts: [
    { _id: 'test_teacher', name: '测试老师', exportId: 'TEST-T001' }
  ]
}
for (const row of collections.students) {
  if (!DEPARTMENTS.includes(row.department)) throw new Error(`部门不在枚举内: ${row.department}`)
}
for (const [name, rows] of Object.entries(collections)) {
  fs.writeFileSync(path.join(output, `${name}.jsonl`), rows.map(row => JSON.stringify(row)).join('\n') + '\n')
}
console.log(`已生成未绑定的虚构测试账户：${output}`)
