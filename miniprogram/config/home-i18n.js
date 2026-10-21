const messages = {
  zh: {
    title: '首页', greeting: '你好，', teacher: '老师', welcome: '每一份投入，都值得被记录。',
    admin: '管理账户', studentId: '学助 ID · ', management: '月度工时管理',
    teacherRole: '管理老师', supervisor: '学生主管', student: '学生助理',
    reportLabel: '填写月度工时', reportTitle: '记录本月的付出',
    reportDescription: '填写值班与项目工时，汇总你的月度工作。', reportAction: '填写月度表单',
    guide: '填报小提示', tip1: '提前整理值班时段和项目产出数量。',
    tip2: '截止前可以重新提交，更新本月记录。', logout: '退出当前账号',
    footer: 'CPRO · 学助工时收集', logoutTitle: '退出登录',
    logoutContent: '确定要退出当前账号吗？（退出后下次打开会自动登录）',
    confirm: '确定', cancel: '取消', switchLabel: 'Switch to English'
  },
  en: {
    title: 'Home', greeting: 'Hello, ', teacher: 'Teacher', welcome: 'Every contribution deserves to be recorded.',
    admin: 'Administrator', studentId: 'Student ID · ', management: 'Monthly hours management',
    teacherRole: 'Teacher', supervisor: 'Student supervisor', student: 'Student assistant',
    reportLabel: 'Report monthly work hours', reportTitle: 'Record your work this month',
    reportDescription: 'Report your duty and project hours to track your monthly work.', reportAction: 'Complete monthly report',
    guide: 'Reporting tips', tip1: 'Prepare your duty schedule and project output counts in advance.',
    tip2: 'You can resubmit before the deadline to update this month’s record.', logout: 'Log out',
    footer: 'CPRO · Student Assistant Work Hours', logoutTitle: 'Log out',
    logoutContent: 'Log out of this account? You will be signed in automatically next time you open the app.',
    confirm: 'Log out', cancel: 'Cancel', switchLabel: '切换为中文'
  }
}

function monthLabel(language, now) {
  if (language !== 'en') return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[now.getMonth()]} ${now.getFullYear()}`
}

module.exports = { messages, monthLabel }
