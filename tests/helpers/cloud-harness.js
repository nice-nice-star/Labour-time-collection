const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// 只模拟本项目使用的 SDK 子集；不模拟权限规则、事务、网络、分页和真实 Excel。
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
      function query(filter = {}, order, limit = Infinity) {
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
          where: next => query(next, order, limit),
          orderBy: (key, direction) => query(filter, [key, direction], limit),
          limit: count => query(filter, order, count),
          get: async () => ({ data: structuredClone(matches().slice(0, limit)) }),
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
  async function call(name, openid, event = {}) {
    const cloud = {
      DYNAMIC_CURRENT_ENV: 'mock-only', init() {}, database: () => db,
      getWXContext: () => ({ OPENID: openid }),
      uploadFile: async value => { uploads.push(value); return { fileID: 'mock-file' } },
      getTempFileURL: async () => ({ fileList: [{ tempFileURL: 'https://example.invalid/mock.xlsx' }] })
    }
    const filename = path.resolve(__dirname, '../../cloudfunctions', name, 'index.js')
    const context = {
      exports: {}, Date: Clock, console, Buffer,
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
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename })
    return structuredClone(await context.exports.main(structuredClone(event)))
  }
  return { call, tables, uploads }
}
module.exports = { createHarness }
