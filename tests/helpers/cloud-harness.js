const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// 只模拟本项目使用的 SDK 子集；不模拟权限规则、事务、网络、真实 Excel 与分页上限。
// skip/limit 会真实切片，用于验证云函数自己的分页循环（平台单次读取上限仍需云端验证）。
function createHarness(seed = {}, now = '2026-10-15T04:00:00Z') {
  const tables = structuredClone(seed)
  const uploads = []
  let sequence = 0
  const instant = new Date(now).getTime()
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])) }
    static now() { return instant }
  }
  const db = {
    command: { in: values => ({ $in: values }) },
    serverDate: () => new Date(instant).toISOString(),
    collection(name) {
      const table = tables[name] || (tables[name] = [])
      function query(filter = {}, order, limit = Infinity, offset = 0) {
        const matches = () => {
          let rows = table.filter(row => Object.entries(filter).every(([key, value]) =>
            value && value.$in ? value.$in.includes(row[key]) : row[key] === value))
          if (order) rows = [...rows].sort((a, b) => {
            const sign = a[order[0]] < b[order[0]] ? -1 : a[order[0]] > b[order[0]] ? 1 : 0
            return order[1] === 'desc' ? -sign : sign
          })
          return rows
        }
        return {
          where: next => query(next, order, limit, offset),
          orderBy: (key, direction) => query(filter, [key, direction], limit, offset),
          skip: count => query(filter, order, limit, count),
          limit: count => query(filter, order, count, offset),
          get: async () => ({ data: structuredClone(matches().slice(offset, offset + limit)) }),
          count: async () => ({ total: matches().length }),
          add: async ({ data }) => {
            const _id = `mock_${++sequence}`
            table.push({ ...structuredClone(data), _id })
            return { _id }
          },
          doc: id => ({
            get: async () => {
              const row = table.find(row => row._id === id)
              if (!row) throw new Error(`Document not found: ${name}/${id}`)
              return { data: structuredClone(row) }
            },
            update: async ({ data }) => {
              const row = table.find(row => row._id === id)
              if (!row) throw new Error(`Document not found: ${name}/${id}`)
              Object.assign(row, structuredClone(data))
              return { stats: { updated: 1 } }
            }
          })
        }
      }
      return query()
    }
  }
  // 模拟云函数实例复用：进程环境里保留「上一位微信调用者」的 openid，不会因为下一次
  // 调用不是微信来源就被清掉。这正是未登录模式下的隐患来源——平台侧的防线是
  // 云函数安全规则（默认 auth != null，未登录来源根本调不进来），不是函数内部的判断。
  let residentOpenid = ''

  async function call(name, openid, event = {}) {
    if (openid) residentOpenid = openid
    const cloud = {
      DYNAMIC_CURRENT_ENV: 'mock-only', init() {}, database: () => db,
      getWXContext: () => (residentOpenid ? { OPENID: residentOpenid } : {}),
      uploadFile: async value => { uploads.push(value); return { fileID: 'mock-file' } },
      getTempFileURL: async () => ({ fileList: [{ tempFileURL: 'https://example.invalid/mock.xlsx' }] })
    }
    const filename = path.resolve(__dirname, '../../cloudfunctions', name, 'index.js')
    const sandbox = {
      // process 用于读取云函数环境变量（如 WEB_TOKEN_SECRET），与真实运行时一致
      exports: {}, Date: Clock, console, Buffer, process,
      require(moduleName) {
        if (moduleName === 'wx-server-sdk') return cloud
        if (moduleName === 'node-xlsx') return { build: sheets => Buffer.from(JSON.stringify(sheets)) }
        // 云函数目录内的相对依赖（如 submitForm/constants.js）按真实路径解析
        if (moduleName.startsWith('.')) {
          return require(path.resolve(path.dirname(filename), moduleName))
        }
        throw new Error(`Unexpected dependency: ${moduleName}`)
      }
    }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename })
    return structuredClone(await sandbox.exports.main(structuredClone(event)))
  }
  return { call, tables, uploads }
}
module.exports = { createHarness }
