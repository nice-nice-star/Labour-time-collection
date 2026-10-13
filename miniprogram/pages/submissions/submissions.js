// miniprogram/pages/submissions/submissions.js
// 老师（导出账户）查看填报进度与每人有效工时。只显示汇总数值，不显示学助填写的具体内容。
const app = getApp()
const { DEPARTMENT_LABELS, resolveDepartment } = require('../../config/constants')
const { filterRowsByName } = require('../../utils/search')

const STATUS_LABELS = { open: '填报中', closed: '已截止', calculated: '已统计' }

Page({
  data: {
    loading: true, rowsLoading: false, loadError: '',
    forms: [], formIndex: -1, formNames: [],
    form: null, rows: [], visibleRows: [], summary: null,
    keyword: ''
  },

  async onLoad() {
    if (app.globalData.role !== 'export') {
      wx.showToast({ title: '无权限', icon: 'none' })
      setTimeout(() => wx.redirectTo({ url: '/pages/home/home' }), 600)
      return
    }
    await this.loadForms()
  },

  async loadForms() {
    const selected = this.data.forms[this.data.formIndex]
    this.setData({ loading: true, loadError: '' })
    try {
      const res = await wx.cloud.callFunction({ name: 'listForms' })
      const r = res.result
      if (!r.ok) { this.setData({ loadError: r.msg || '暂时无法获取表单' }); return }
      const forms = r.forms.map(f => ({ ...f, statusLabel: STATUS_LABELS[f.status] || '未知状态' }))
      const selectedIndex = selected ? forms.findIndex(f => f._id === selected._id) : -1
      const formIndex = forms.length ? Math.max(0, selectedIndex) : -1
      this.setData({
        forms,
        formNames: forms.map(f => `${f.month} 月度表单`),
        formIndex,
        form: formIndex >= 0 ? forms[formIndex] : null
      })
      if (formIndex >= 0) await this.loadRows()
    } catch (e) {
      this.setData({ loadError: '网络连接失败，请稍后重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadRows() {
    const form = this.data.forms[this.data.formIndex]
    if (!form) return
    this.setData({ rowsLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getSubmissions',
        data: { formId: form._id }
      })
      const r = res.result
      if (!r.ok) { wx.showToast({ title: r.msg || '暂时无法获取填报情况', icon: 'none' }); return }
      const rows = r.rows.map(row => {
        // 已提交者拿到的是落库快照（规范值）；未提交者退回名单原值，需在这里归一化
        const department = resolveDepartment(row.department)
        return {
          ...row,
          // 查不到中文名（枚举外的旧快照）原样显示，不静默清空
          departmentText: DEPARTMENT_LABELS[department] || row.department || '未设置',
          statusLabel: !row.bound ? '未绑定' : (row.submitted ? '已填报' : '未提交'),
          // 只有真提交才有有效工时；未提交（含月结补零）显示「—」，不写成 0
          hoursText: row.submitted && row.effectiveHours != null ? `${row.effectiveHours} h` : '—'
        }
      })
      this.setData({
        form: { ...r.form, statusLabel: STATUS_LABELS[r.form.status] || '未知状态' },
        rows,
        visibleRows: filterRowsByName(rows, this.data.keyword),
        summary: r.summary
      })
    } catch (e) {
      wx.showToast({ title: '网络连接失败，请稍后重试', icon: 'none' })
    } finally {
      this.setData({ rowsLoading: false })
    }
  },

  // 搜索框：只过滤已加载的名单，不再请求云端；进度汇总仍按全员统计
  onSearch(e) {
    const keyword = e.detail.value
    this.setData({ keyword, visibleRows: filterRowsByName(this.data.rows, keyword) })
  },

  clearSearch() {
    this.setData({ keyword: '', visibleRows: this.data.rows })
  },

  onForm(e) {
    // 换月份时清掉旧关键词，避免上一月的过滤条件把新月份名单筛空
    this.setData({ formIndex: Number(e.detail.value), keyword: '' })
    this.loadRows()
  }
})
