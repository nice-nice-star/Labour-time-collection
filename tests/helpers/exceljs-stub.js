// exceljs 只在云函数部署时装（本地 npm test 不装依赖）。
// 这个桩把 exceljs 的项目子集记下来，让测试能断言版式（行、合并、列宽、行高、字体、
// 底色、边框），writeBuffer() 仍序列化成 JSON，便于直接检查最终上传的内容。
exports.createExcelJsStub = function createExcelJsStub() {
  const created = []

  class Cell {
    constructor() {
      this.value = undefined
      this.font = undefined
      this.fill = undefined
      this.border = undefined
      this.alignment = undefined
      this.numFmt = undefined
    }
  }

  class Row {
    constructor(values) { this.values = values; this.height = undefined }
    eachCell(cb) {
      this.values.forEach(value => {
        if (value !== undefined && value !== null) cb({ value })
      })
    }
  }

  class Worksheet {
    constructor(name, options) {
      this.name = name
      this.options = options
      this.rows = []
      this.merges = []
      this.cols = []
      this.cells = new Map()
    }
    get rowCount() { return this.rows.length }
    get columnCount() { return this.rows.reduce((n, r) => Math.max(n, r.values.length), 0) }
    addRow(values) { const row = new Row(Array.isArray(values) ? values.slice() : [values]); this.rows.push(row); return row }
    getRow(i) { return this.rows[i - 1] }
    getColumn(i) {
      if (!this.cols[i - 1]) this.cols[i - 1] = { width: undefined }
      return this.cols[i - 1]
    }
    getCell(r, c) {
      const key = `${r}:${c}`
      if (!this.cells.has(key)) this.cells.set(key, new Cell())
      return this.cells.get(key)
    }
    mergeCells(range) { this.merges.push(range) }
    eachRow(cb) { this.rows.forEach((row, i) => cb(row, i + 1)) }
  }

  class Workbook {
    constructor() { this.sheets = []; created.push(this) }
    addWorksheet(name, options) { const ws = new Worksheet(name, options); this.sheets.push(ws); return ws }
    get xlsx() {
      return {
        writeBuffer: async () => Buffer.from(JSON.stringify(
          this.sheets.map(s => ({ name: s.name, rows: s.rows.map(r => r.values), merges: s.merges }))
        ))
      }
    }
  }

  return { Workbook, created }
}
