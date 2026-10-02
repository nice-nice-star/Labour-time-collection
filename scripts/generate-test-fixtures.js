// 只生成本地文件，不访问云端、不读取真实用户、不修改任何数据库。
const fs = require('node:fs')
const path = require('node:path')
const output = path.resolve(__dirname, '../test-artifacts/fixtures')
fs.mkdirSync(output, { recursive: true })
const collections = {
  students: [
    { _id: 'test_student_a', name: '测试学助甲', studentId: 'TEST-S001', isSupervisor: false },
    { _id: 'test_supervisor', name: '测试主管乙', studentId: 'TEST-S002', isSupervisor: true },
    { _id: 'test_absent', name: '测试未提交丙', studentId: 'TEST-S003', isSupervisor: false }
  ],
  export_accounts: [
    { _id: 'test_teacher', name: '测试老师', exportId: 'TEST-T001' }
  ]
}
for (const [name, rows] of Object.entries(collections)) {
  fs.writeFileSync(path.join(output, `${name}.jsonl`), rows.map(row => JSON.stringify(row)).join('\n') + '\n')
}
console.log(`已生成未绑定的虚构测试账户：${output}`)
