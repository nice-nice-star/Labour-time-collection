// Web 导出专用：把 pivot.js 产出的版式模型画成 xlsx。
//
// 这里只做 exceljs 调用，不做任何版式决策——行怎么排、哪里合并、列多宽、行多高、
// 表头什么颜色、边框多粗全部在 pivot.js（纯逻辑，能在 npm test 里断言），
// 所以本文件不需要参数校验，也不碰数据库。
const ExcelJS = require('exceljs')

function applyLayout(sheet, model) {
  // 顺序要求：先写数据（列宽/行高/字体都依赖已有单元格），再合并，最后上格式
  model.rows.forEach(row => sheet.addRow(row))
  ;(model.merges || []).forEach(range => sheet.mergeCells(range))
  ;(model.widths || []).forEach((width, i) => {
    if (width) sheet.getColumn(i + 1).width = width
  })
  ;(model.rowHeights || []).forEach((height, i) => {
    if (height) sheet.getRow(i + 1).height = height
  })
}

function applyStyle(sheet, model) {
  const style = model.style
  const columnCount = (model.widths || []).length
  const lastRow = model.rows.length
  if (!style || !columnCount) return

  // 全表统一字号（与样例一致的小号紧凑表），大标题单独放大加粗
  sheet.eachRow(row => row.eachCell(cell => { cell.font = { size: model.fontSize } }))
  const title = sheet.getCell(style.titleRow, 1)
  title.font = { bold: true, size: model.titleSize, color: { argb: style.titleText } }
  title.alignment = { vertical: 'middle' }

  // 表头：品牌紫底 + 白字加粗居中。
  // 合并区域里每个单元格都要单独上色，否则合并块只会染到左上角那一格。
  for (let r = style.headerFrom; r <= style.headerTo; r++) {
    for (let c = 1; c <= columnCount; c++) {
      const cell = sheet.getCell(r, c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.headerFill } }
      cell.font = { bold: true, size: model.fontSize, color: { argb: style.headerText } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    }
  }

  // 表体（含表头两行）：逐格描细边框，合并区域同样要逐格描，否则合并块缺边
  const thin = { style: 'thin', color: { argb: style.border } }
  for (let r = style.tableFrom; r <= lastRow; r++) {
    for (let c = 1; c <= columnCount; c++) {
      sheet.getCell(r, c).border = { top: thin, left: thin, bottom: thin, right: thin }
    }
  }
}

/**
 * @param {{sheetName:string, rows:any[][], merges?:string[], widths?:number[], rowHeights?:number[],
 *          fontSize?:number, titleSize?:number, style?:object}} model
 * @returns {Promise<Buffer>} 可直接交给 cloud.uploadFile
 */
async function renderWorkbook(model) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'CPRO 学助工时申报'

  // 24 列的宽表：默认纵向打印会被切成好几页，这里横向 + 缩放到一页宽
  const sheet = workbook.addWorksheet(model.sheetName, {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  })
  applyLayout(sheet, model)
  applyStyle(sheet, model)

  return workbook.xlsx.writeBuffer()
}

module.exports = { renderWorkbook }
