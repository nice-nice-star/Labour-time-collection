# Labour time Collection

**简体中文** 

Labour time collection 是基于微信小程序实现的收集CPRO学生助理工时的系统

### 项目测评与测试

完整流程见 [测试工作流](docs/testing-workflow.md)。本地使用 Node.js 18+，运行 `npm test` 验证多身份业务逻辑，运行 `npm run test:fixtures` 生成虚构账户数据。

开发版与体验版需要在 `miniprogram/config/environment.js` 配置独立测试云环境 ID；未配置时会停止连接，避免误写正式数据。本地测试无需真实微信或云环境。

现在是测试环境，没有历史遗留数据需要处理。

### 账户类型
> 1.导出账户，由相关老师负责，按照老师需求单独创建，不提供申请。拥有开启月度统计和导出数据的权限。
> 2.学助账户，提前内置数据库存储每个学生助理的信息。初次登陆时，每个学生提出申请，用唯一的微信账号与内置学助信息一一对应。之后用户基于构建月度表单提供信息。不具备导出权限。

### 内置数据库提供的学生助理信息
> 学生助理姓名
> 学生助理ID
> 是否为主管
> 所属部门
在初次登陆时只有姓名和ID完全相同才可以成功对应

### 学助所属部门（受控枚举）
> 存放位置：`students` 集合的 `department` 字段，跟人走，不随表单或月份变化。
> 名单里填规范值、中文名或英文显示名都可以：忽略大小写与多余空白，中文名/英文名按别名表归一，统一落成规范值。
> 其他写法（拼写错误、留空、自造部门名）按空字符串处理，该学助导出的部门列为空，不会静默保留错值。
> `students` 记录本身保持原样，归一化只发生在落库与导出。
> 新增或重命名部门：同时修改 `DEPARTMENTS` 与 `DEPARTMENT_ALIASES` 的**全部副本**——
> `miniprogram/config/constants.js`、`cloudfunctions/submitForm/constants.js`、
> `cloudfunctions/calculateMonthly/constants.js`、
> `cloudfunctions/getSubmissions/departments.js` 与 `cloudfunctions/webGetSubmissions/departments.js`（这两份必须逐字节相同）。
> 中文名表 `DEPARTMENT_LABELS` 另有 `cloudfunctions/exportData/constants.js` 与 `webExportData/constants.js` 两份副本。
> 云函数无法跨目录引用小程序代码，因此保留副本，**`npm test` 会逐项校验各处一致**——漏改一处就会红。
> 提交时把当时的部门写进 `submissions` 快照：已截止或已统计的月份，之后改名单不影响导出；但表单仍开放时学助重新提交会覆盖该月快照，此时改名会让同一个月出现新旧两种写法。
> 存量名单（新增字段之前导入的记录）没有 `department`，需要在云控制台补录；新增该列之前的历史提交也没有部门快照，导出时该列为空。
> **「填报情况」页会显示部门**（小程序端与 Web 端都有这一列）：展示文本由云函数按映射表算好下发（`departmentText`），
> 所以名单里写 `Multimedia_Center` 这种大小写变体，页面显示的是「多媒体中心」而不是原值；
> 枚举外的旧值（如 `CPRO`）原样显示，方便人工发现。

| 规范值（推荐直接填这个） | 中文名 | 英文显示名 |
| --- | --- | --- |
| Public_Relations | 公共关系 | Public Relations |
| Domestic_social_Media | 国内社媒 | Domestic social Media |
| Multimedia_center | 多媒体中心 | Multimedia center |
| Journalist_News_Center | 大学新闻中心记者 | Journalist, News Center |
| Overseas_social_Media | 海外社媒 | Overseas social Media |
| University_Gift_shop | 纪念品商店 | University Gift shop |
| Administration_and_Data | 行政与数据 | Administration and Data |
| Magazine_publisher | 神仙湖畔杂志社 | Magazine publisher（译名暂定） |

中英文两列都会归一到同行的规范值；`University gift shop`（值班地点里的写法）也归一到 `University_Gift_shop`。

### 其他信息
> 功能（权限）
> 需要集成微信登陆功能（所有帐户）
> 填写表单（学助账户，老师首页看不到这个入口）
> 查看填报情况（导出账户，只显示进度与每人有效工时，支持按姓名搜索，不显示学助填写的内容）
> 构建月度表单（导出账户）
> 表单截至后自动计算（后台自动操作）
> 导出（导出账户）

首页按角色显示互斥的两个入口：学助看到「填写月度表单」，老师看到「查看填报情况」。
`getSubmissions` 只接受导出账户，隐藏按钮不构成权限边界。

### 身份与权限的真实边界（平台侧，改代码碰不到）

云函数用 `cloud.getWXContext()` 取调用者身份。它读的是**云函数进程的 `process.env`**（`WX_CONTEXT_KEYS` + `WX_OPENID`），
不是入口函数的第二个参数 `context`——微信云开发的运行时不会把身份下发到 `context.environ` 里。
曾经按腾讯云 CloudBase 文档的 `parseContext(context)` 方案改造过，结果老师端全部报「未登录」，已回退；
**不要再尝试从 `context` 读身份。**

因此真正的权限边界在控制台的**云函数安全规则**，默认值为：

```json
{ "*": { "invoke": "auth != null" } }
```

默认规则下未登录来源根本调不进来，函数里的 `if (!OPENID) return { ok: false, msg: '未登录' }` 只是第二道防线。
两条硬约束：

> 1. **不要把 `"invoke"` 改成 `true`**（等于放行未登录用户），也不要让未登录模式的规则覆盖 `listForms`、
>    `createMonthlyForm`、`exportData`、`getSubmissions` 这些老师函数。
> 2. 云函数实例会被复用，小程序调用写进进程的 `WX_OPENID` 可能残留到下一次调用。一旦匿名调用被放行，
>    它就可能继承上一位老师的身份——**这个风险函数内部挡不住**，只能靠安全规则挡住。

Web 管理端（未登录模式 + 自建凭据）落地时同样遵守这两条：给 Web 用的云函数**必须另起名字**并在安全规则里
单独放行，且**只认事件里带的自建凭据，绝不调用 `cloud.getWXContext()`**。详见 `tests/workflow.test.js`
末尾对应的两条 `test.todo`。

### Web 管理端（老师用，未登录模式 + 自建凭据）

网页访客没有微信身份，所以不共用小程序那套 `openid`，而是自建凭据：

```
首次激活 webBind（姓名 + 工号完全一致，与 bindStudent 同一信任模型；已激活则拒绝重绑）
   → 登录 webLogin（校验口令，签发无状态 HMAC 票据，12 小时）
   → webSession（票据换身份，网页刷新后恢复登录态）
```

管理端功能由**另一套同名的 `web*` 云函数**提供，与小程序端并列（不是给原函数开两个身份通道）：

| 小程序端（`getWXContext`） | Web 端（票据） |
| --- | --- |
| `listForms` | `webListForms` |
| `createMonthlyForm` | `webCreateMonthlyForm` |
| `getSubmissions` | `webGetSubmissions` |
| `exportData` | `webExportData` |

**必须分开命名**：安全规则是按函数名放行的，`web*` 需要 `"invoke": true`，一旦让老师函数也落到这条规则下，
未登录访客就能调到它们，进而继承实例里残留的 `WX_OPENID`。分开命名是这套设计成立的前提。

- 口令用 `scrypt` 加盐哈希存进 `export_accounts` 的 `webPasswordSalt` / `webPasswordHash`，**不存明文**。
- 票据密钥来自云函数环境变量 **`WEB_TOKEN_SECRET`**（至少 16 字符）。**取不到就拒绝服务**，绝不退回默认值。
  **七个 `web*` 函数都要配，且必须是同一个值**（`webLogin` 签发、其余验签，值不一致会全部失败）；
  测试环境与正式环境各用独立密钥。
- 登录失败一律回同一句提示（未激活 / 密码错 / 工号错 / 账户不存在），避免被拿来枚举账户。
- `webauth.js` 在七个 `web*` 目录下各存一份副本，`npm test` 校验逐字节一致，并**禁止 `web*` 函数出现
  `getWXContext()`**（未登录模式下那是残留身份）。
- 两边必须给出**完全一样**的业务结果，所以纯逻辑抽成共享模块、各存一份副本、由测试校验：
  `rows.js`（填报进度口径，`getSubmissions` ↔ `webGetSubmissions` ↔ `webExportData`）、
  `departments.js`（部门枚举/别名/中文名，同上三处）、
  `constants.js`（费率表，`exportData` ↔ `webExportData`）。
  测试不只比对副本字节，还**用同一份数据跑两端、断言产物完全相同**。
  唯一的例外是**导出表格的版式**：Web 端出的是横向统计表，版式逻辑另起一份
  （`webExportData/pivot.js`），只有进度口径仍与小程序端同源，详见「导出要求」。

前端在 `web/`（React + Vite + TypeScript）：`npm run dev` 起本地，`npm run build` 出 `dist/` 传到静态网站托管。
全站外观由 `web/src/components/AppShell.tsx` + `web/src/index.css` 统一提供：顶部紫色 header（`--brand: #732160`）
+ 左侧边栏。侧边栏只是「当前在哪一页」的**指示器**（由 `active` prop 决定高亮项），条目不可点击、不做跳转；
页面切换仍由 `App.tsx` 的 `view` 状态负责，新页面只要把内容包进 `<AppShell active="...">` 就自动继承这套外观。
Web SDK 以 `<script>` 引入（`index.html` 里的 `res.wx.qq.com/open/js/cloudbase/1.1.0/cloud.js`），
加载后在 `window.cloud` 上；用 `new cloud.Cloud({ identityless: true, resourceAppid, resourceEnv })` + `init()`。

**部署前必须在控制台完成的三件事**（缺一项网页就调不通，且都不会在本地测试里暴露）：

> 1. 开启**未登录模式**：云开发控制台 → 设置 → 全局设置/权限设置。云环境默认禁止未登录访问。
> 2. 数据库/存储权限必须用**安全规则**配置，不能用「简易权限配置」——否则未登录用户访问不了云资源。
> 3. **云函数安全规则**保持 `"*": { "invoke": "auth != null" }`，只给七个 `web*` 函数加 `"invoke": true`：
>
> ```json
> {
>   "*":                    { "invoke": "auth != null" },
>   "webBind":              { "invoke": true },
>   "webLogin":             { "invoke": true },
>   "webSession":           { "invoke": true },
>   "webListForms":         { "invoke": true },
>   "webCreateMonthlyForm": { "invoke": true },
>   "webGetSubmissions":    { "invoke": true },
>   "webExportData":        { "invoke": true }
> }
> ```
>
> `listForms` / `createMonthlyForm` / `exportData` / `getSubmissions` **绝对不要**加进来。
> 未登录模式下安全规则里的 `auth` 为空，所以 `web*` 必须显式放行。
>
> 未登录模式**不会**调用 `cloudbase_auth` 云函数（那是公众号登录态才需要的），本项目不需要实现它。



### 月度表单
> 表单由填空题和选择题组成
```
1.你本月的值班总工时是多少？
___________________________
2.你的值班时段是？
___________________________
3.你的值班地点是？（）
A.University gift shop B.ABE303 C.ABW709
4.项目工时统计[表格数值题]（默认值为0）```
| 产出项目                 | 产出个数 |
| ------------------------ | -------- |
| 深度访谈前期准备         | （）     |
| 参与深度访谈             | （）     |
| 访谈成稿                 | （）     |
| 排版制作一条完整的视频   | （）     |
| 制作一条短视频 (1-5)mins | （）     |
| 制作一条长视频 ~10mins   | （）     |
| 视频剪辑                 | （）     |
| 小红书编辑一条           | （）     |
| 撰写一条海外社媒稿件     | （）     |
| 参与一场活动摄影         | （）     |
| 海报设计                 | （）     |
| 新闻监测                 | （）     |
| 组织一次内部活动         | （）     |

5.请提供你参与的项目名称
________________________________________________________
6.额外工时申诉 [可选]
________________________________________________________
```

### 工时计算方法
后台需要自动计算工时
工时计算公式为：
```text
统计工时 = 值班工时 + 项目工时
if 学生主管：
  总工时 = 统计工时 * 1.5
else :
  总工时 = 统计工时
有效工时 = min(40, 总工时)
```

有效工时最高为 40 小时；学生主管先按统计工时乘以 1.5，再按 40 小时封顶。零工时的有效工时为 0。


### 项目工时统计表

区间表示统筹与参与两种算法：**统筹取区间上限，参与取下限**。只有单个数值的项目
（标准工时）没有统筹算法，一律按参与计；标「按实际」的项目暂不计入，待定。

表单第 4 题每一项都提供「统筹」和「参与」两个输入框，同一个学助可以在同一项目上
同时申报两种数量；标为「仅参与」的项目统筹框不可填。

| 交付物                 | 标准工时（参考）| 统筹（取上限）  | 参与（取下限）  | 档级（这一项先不管）   |	项目英文翻译                                                     |
| ---------------------- | --------------- | --------------- | --------------- | ---------------------- | -----------------------------------------------------------------  |
| 新闻稿/通讯（800字内） | 2 h	           | —（仅参与）     | 2 h             | 标准	                | News article / newsletter report (within 800 words)                |
| 人物专访（采访+成稿）	 | 3–6 h	       | 6 h             | 3 h             | 复杂               	| Feature interview (conducting the interview + writing the article) |
| 深度报道（文字或视频） | 4–8 h	       | 8 h             | 4 h             | 复杂               	| In-depth report (written or video)                                 |
| 推文文案	             | 1.5 h	       | —（仅参与）     | 1.5 h           | 标准               	| Social media post copywriting                                      |
| 图文排版	             | 1–2 h	       | 2 h             | 1 h             | 标准               	| Graphic-and-text layout design                                     |
| 海报设计	             | 1–3 h	       | 3 h             | 1 h             | 标准               	| Poster design                                                      |
| 推文长图	             | 2–4 h	       | 4 h             | 2 h             | 复杂               	| Long-form graphic for social media posts                           |
| 短视频剪辑（≤1分钟）	 | 2 h	           | —（仅参与）     | 2 h             | 标准               	| Short video editing (≤1 minute)                                    |
| 短视频剪辑（1–3分钟）	 | 2–4 h	       | 4 h             | 2 h             | 复杂               	| Short video editing (1–3 minutes)                                  |
| 活动跟拍（半天）	     | 4 h	           | —（仅参与）     | 4 h             | 计时               	| Event photo/video coverage (half day)                              |
| 数据报表               | 2 h	           | —（仅参与）     | 2 h             | 标准               	| Data report                                                        |
| 接待活动               | 按实际	       | —               | 待定            | 计时               	| Reception / hospitality duties                                     |
| 管理项目               | 按实际	       | —               | 待定            | 计时               	| Management project                                                 |
| 集体活动               | 2-8h	           | 8 h             | 2 h             | 标准               	| Team / group activity                                              |

代码里的权威来源是 `miniprogram/config/constants.js` 的 `PROJECT_HOURS`（键为稳定键，
每项形如 `{ participant, coordinator }`）；表单模板通过 `pages/form/rates.wxs` 读取同一份
费率，`npm test` 会校验两者以及云函数副本完全一致。



### 导出要求
导出产物是 "Year_Month_Day学助工时明细.xlsx"，包含两个工作表。

**主表**（工作表名 = 表单月份，每人一行）：
| 姓名    | 部门 | 有效工时 | 值班总工时 | 值班时段 | 值班地点 | 项目名称 | 额外工时申诉 |
| ------- | ---- | -------- | ---------- | -------- | -------- | -------- | ------------ |
| Stuend1 | 行政与数据 | -------- | ---------- | -------- | -------- | -------- | ------------ |
| Stuend2 | 公共关系 | -------- | ---------- | -------- | -------- | -------- | ------------ |

`部门` 紧跟 `姓名`，取提交时（未提交者为月结补零时）的名单快照，并转换成中文名（见上表「中文名」列）；
落库快照里枚举之外的旧值（含已从枚举移除的部门）原样输出，便于人工发现。
「值班总工时」到「额外工时申诉」依次对应表单第 1–6 题，不再使用 `Answer1..Answer6` 这种与题号绑定的列名。
主表不放第 4 题的表格数值明细，明细改为单独的工作表。

**项目明细**（工作表名 `项目明细`，每人每个申报项目一行）：
| 姓名 | 部门 | 项目 | 参与数 | 统筹数 | 折算工时 |
| ---- | ---- | ---- | ------ | ------ | -------- |
| Stuend1 | 行政与数据 | 集体活动 | 2 | 1 | 12 |

- 只写申报过的项目：表单按模板整表提交，参与数与统筹数全为 0 的行不写进明细；月结补零的人（`projectRows` 为空）没有明细行。
- `折算工时` = 参与数 × 参与费率 + 统筹数 × 统筹费率，费率见「项目工时统计表」，口径与 `submitForm` 计算 `projectHours` 时一致。
- 标「按实际」的项目（接待活动、管理项目）没有费率，该格留空，不写成 0，避免被误读成「没有工时」。

#### Web 管理端导出（版式与小程序端**不同**）

网页端导出的是给老师横向查看的统计表 `Year_Month_Day学助工时统计表.xlsx`，**单个工作表**
（表名 = 表单月份）。版式由 `cloudfunctions/webExportData/pivot.js` 决定（纯逻辑、可测），
`workbook.js` 只负责用 exceljs 画出来：

| 行 | 内容 |
| -- | ---- |
| 1 | 大标题 `CPRO学助工时统计表`（`A1:E1` 合并） |
| 2 | `月份` + `2026年10月`（`B2:C2` 合并）、`填报情况` + `名单 N 人：已提交 X，待提交 Y，未绑定 Z`（`E2:X2` 合并） |
| 3–4 | 两行表头：`学助姓名/学号/部门/有效工时/值班工时` 纵向合并；每个有费率的项目横向合并后拆 `统筹`/`参与` 两列；最右两列 `项目名称`/`额外工时申诉` 纵向合并 |
| 5 起 | 一人一行；已提交（含月结补零）写数字，未提交的整行合并成一格写 `待提交` / `未绑定` |

- 项目列只列**有数字费率**的项目（「按实际/待定」的接待活动、管理项目没有列），顺序与
  `miniprogram/config/constants.js` 的 `PROJECT_ROWS` 一致；`projectRows.js` 是它的副本，测试逐项比对。
- 最右两列是表单第 5、6 题的自由文本（`项目名称`、`额外工时申诉`），跟在项目明细之后，
  表头纵向合并；没填就留空，不写空字符串单元格。
- **名单里的所有部门都会导出**（含未绑定的人）：按部门分块，同部门且多于一人时「部门」列纵向合并；
  部门显示为「中文 英文」（如 `行政与数据 Administration and Data`），枚举外的旧值（如 `CPRO`、`图书馆`）
  原样输出并各自成块，不会被并进同一个合并单元格。
- 外观：第 3、4 行表头用品牌紫 `#732160` 底色 + 白色加粗居中，第 3 行起整片表格区域逐格细边框
  （合并区域逐格上色/描边，否则合并块会缺色缺边），大标题加粗放大。样式参数集中在 `pivot.js` 的 `STYLE`。
- **数据口径仍与小程序端同源**：绑定/提交/补零判定与汇总走 `rows.js` 副本，
  所以第 2 行的填报情况与网页「填报情况」页永远一致，不同的只有版式。
- 依赖 `exceljs`（见 `cloudfunctions/webExportData/package.json`），部署时必须选「云端安装依赖」。
  测试里用 `tests/helpers/exceljs-stub.js` 顶替，`npm test` 仍然零依赖。
