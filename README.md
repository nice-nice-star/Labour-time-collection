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
> 其他写法（拼写错误、留空、自造部门名）按空字符串处理，不会静默保留错值；
> 导出时若 `submissions` 快照为空则退回名单原值，枚举外的写法原样显示，便于人工发现。
> `students` 记录本身保持原样，归一化只发生在落库与导出。
> 新增或重命名部门：同时修改 `DEPARTMENTS` 与 `DEPARTMENT_ALIASES` 的**全部副本**——
> `miniprogram/config/constants.js`、`cloudfunctions/submitForm/constants.js`、
> `cloudfunctions/calculateMonthly/constants.js`、
> `cloudfunctions/getSubmissions/departments.js` 与 `cloudfunctions/webGetSubmissions/departments.js`（这两份必须逐字节相同），
> 以及 `cloudfunctions/exportData/constants.js` 与 `cloudfunctions/webExportData/constants.js`（这两份必须逐字节相同）。
> 中文名表 `DEPARTMENT_LABELS` 也有上述 exportData / webExportData 两份副本。
> 云函数无法跨目录引用小程序代码，因此保留多份副本，**`npm test` 会逐项校验各处一致**——漏改一处就会红。
> 提交时把当时的部门写进 `submissions` 快照：已提交者在之后改名单不影响导出；
> 未提交/未绑定的人导出时取当前名单值。表单仍开放时学助重新提交会覆盖该月快照。
> 存量名单（新增字段之前导入的记录）没有 `department`，需要在云控制台补录。
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
单独放行，且**只认事件里带的自建凭据，绝不调用 `cloud.getWXContext()`**。这些前提都在平台侧，本地测不到，
在 `tests/workflow.test.js` 末尾对应 4 条 `test.todo`（安全规则、未登录模式、`WEB_TOKEN_SECRET`、登录限流）。

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
> 每月一张表单（`createMonthlyForm` 按月份 upsert，重复创建是更新同一张，不是新增），
> 截止前可反复提交覆盖，截止后整页只读。页面在 `pages/form/form`，分三段：

| 段 | 内容 | 控件 | 落库位置 |
| --- | --- | --- | --- |
| 01 值班记录 | 本月值班总工时 | 数字输入，单位小时 | `answers.answer1` |
|  | 值班时段 | 文本，例如「每周一 14:00–17:00」 | `answers.answer2` |
|  | 值班地点 | 单选：`University gift shop` / `ABE303` / `ABW709` | `answers.answer3`（存选项文本，不存字母） |
| 02 项目产出 | 每个项目一条记录：项目类型、项目名称、项目分工（统筹/参与）、完成情况（已发布/已完成未发布/未完成）、完成形式、实际完成时间 | 逐条添加，可删除 | `projects[]`；同类型同角色的条目在 `projectRows` 汇总成计数 |
| 03 补充说明 | 额外工时申诉 | 多行文本，选填，最多 1000 字 | `answers.answer6` |

- 一条项目记录只算一个角色：统筹按区间上限费率、参与按下限费率，**每条计 1 个产出**。
- `实际完成时间` 与 `完成情况` 只做记录，**不参与工时折算**；标「未完成」的项目仍按全额计入。
- `answers.answer5` 由所有项目名称自动拼接，作为兼容字段保留，不再是独立题目。
- 项目类型来自 `PROJECT_ROWS`，费率由 `pages/form/rates.wxs` 读取 `PROJECT_HOURS` 的同名副本
  （`npm test` 校验一致），完整项目与费率见上面的「项目工时统计表」。

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
| 新闻稿/通讯（800字内） | 2 h	           | 5 h             | 1.5 h           | 标准	                | News article / newsletter report (within 800 words)                |
| 人物专访（采访+成稿）	 | 3–6 h	       | 10 h            | 3 h             | 复杂               	| Feature interview (conducting the interview + writing the article) |
| 深度报道（文字或视频） | 4–8 h	       | 10 h            | 3 h             | 复杂               	| In-depth report (written or video)                                 |
| 推文文案	             | 1.5 h	       | 5 h             | 1.5 h           | 标准               	| Social media post copywriting                                      |
| 图文排版	             | 1–2 h	       | 3 h             | 1 h             | 标准               	| Graphic-and-text layout design                                     |
| 图片与海报设计         | 1–3 h	       | 5 h             | 1.5 h           | 标准               	| Illustration and Poster design                                     |
| 推文长图	             | 2–4 h	       | 5 h             | 1.5 h           | 复杂               	| Long-form graphic for social media posts                           |
| 短视频制作（≤1分钟）	 | 2 h	           | 5 h             | 1.5 h           | 标准               	| Short video editing (≤1 minute)                                    |
| 长视频                 | 2–4 h	       | 10 h            | 3 h             | 复杂               	| Long video editing                                                 |
| 活动跟拍（半天）	     | 4 h	           | —（仅参与）     | 5 h             | 计时               	| Event photo/video coverage (half day)                              |
| 数据报表               | 2 h	           | —（仅参与）     | 3 h             | 标准               	| Data report                                                        |
| 接待活动               | 按实际	       | —               | 待定            | 计时               	| Reception / hospitality duties                                     |
| 管理项目               | 按实际	       | —               | 待定            | 计时               	| Management project                                                 |
| 集体活动               | 2-8h	           | 10 h            | 3 h             | 标准               	| Team / group activity                                              |

代码里的权威来源是 `miniprogram/config/constants.js` 的 `PROJECT_HOURS`（键为稳定键，
每项形如 `{ participant, coordinator }`）；表单模板通过 `pages/form/rates.wxs` 读取同一份
费率，`npm test` 会校验两者以及云函数副本完全一致。



### 导出要求
导出产物是 "Year_Month_Day学助工时明细.xlsx"，包含两个工作表：汇总、项目明细。

**汇总**（工作表名 = 表单月份，一人一行，含未提交与未绑定）：
| 姓名 | 学号 | 部门 | 值班工时 | 项目折算工时 | 总工时 | 有效工时 | 项目条数 | 已发布 | 已完成未发布 | 未完成 | 实际耗时合计 | 填报状态 | 额外工时申诉 |
| ---- | ---- | ---- | -------- | ------------ | ------ | -------- | -------- | ------ | ------------ | ------ | ------------ | -------- | ------------ |
| Stuend1 | S1 | 行政与数据 | 30 | 4 | 51 | 40 | 2 | 1 | 1 | 0 | 4 | 已提交 | — |

- 名单驱动：未绑定、已绑定但未提交的人也会出行，数值列留空；`填报状态` 为已提交 / 月结补零 / 未提交 / 未绑定。
- `总工时 = 值班工时 + 项目折算工时`（主管 ×1.5），`有效工时 = min(40, 总工时)`，与「工时计算方法」一致。
- `项目条数` 与三个完成情况列来自 `projects[]`，`实际耗时合计` 是各条实际完成时间之和。
- `部门` 取提交时快照；未提交/未绑定的人退回名单值，归一化后转中文名（见上表「中文名」列）。
  落库值里枚举之外的旧值（含已从枚举移除的部门）原样输出，便于人工发现。

**项目明细**（工作表名 `项目明细`，一条申报一行）：
| 姓名 | 学号 | 部门 | 项目类型 | 项目名称 | 项目分工 | 完成情况 | 完成形式 | 实际完成时间（hrs） | 参与数 | 统筹数 | 折算工时 | 实际−折算 |
| ---- | ---- | ---- | -------- | -------- | -------- | -------- | -------- | ------------------- | ------ | ------ | -------- | --------- |
| Stuend1 | S1 | 行政与数据 | 集体活动 | 运动会 | 统筹 | 已完成未发布 | 待发 | 6 | 0 | 1 | 8 | -2 |

- 只从 `projects[]` 逐条生成；业务上已确认不存在旧版「按类型填数量」的历史记录，不再做兼容。
- `折算工时` = 参与数 × 参与费率 + 统筹数 × 统筹费率（一条记录只算一个角色，计数恒为 1/0）。
- `实际−折算` = 实际完成时间 − 折算工时，正数表示实际耗时超过折算；按实际项目没有折算，两格都留空。
- 不存在「全 0 行」：没有申报就没有记录，月结补零的人也不会产生明细行。

#### Web 管理端导出（版式与小程序端**不同**）

网页端导出的是给老师横向查看的统计表 `Year_Month_Day学助工时统计表.xlsx`，
**主统计表**（表名 = 表单月份）另附一个 `项目明细` 工作表（列与小程序端一致）。
版式由 `cloudfunctions/webExportData/pivot.js` 决定（纯逻辑、可测），
`workbook.js` 只负责用 exceljs 画出来：

| 行 | 内容 |
| -- | ---- |
| 1 | 大标题 `CPRO学助工时统计表`（横跨整表 `A1:Z1`，居中） |
| 2 | `月份` + `2026年10月`（`B2:C2` 合并）、`填报情况` + `名单 N 人：已提交 X，待提交 Y，未绑定 Z`（`E2:Z2` 合并） |
| 3 | 单行表头：13 个基础列 + 12 个项目列（一类一列）+ `额外工时申诉` |
| 4 起 | 一人一行 |

**基础列（A–M，字段与顺序对齐小程序「汇总」）**

| 学助姓名 | 学号 | 部门 | 值班工时 | 项目折算工时 | 总工时 | 有效工时 | 项目条数 | 已发布 | 已完成未发布 | 未完成 | 实际耗时合计 | 填报状态 |
| -------- | ---- | ---- | -------- | ------------ | ------ | -------- | -------- | ------ | ------------ | ------ | ------------ | -------- |

**项目列（N–Y，一类项目一列，填的是该类「折算工时」）**：12 个有数字费率的项目；
「按实际/待定」的接待活动、管理项目没有列。

**末尾一列（Z）**：`额外工时申诉`（表单第 6 题），没填就留空。

- **行内可对账**：12 个项目列的数值之和 = 该行 `项目折算工时`（都按 `projectRows` 折算，
  与 `calc.projectHours` 同一口径），老师不用心算也能看出有没有算错。
- `项目条数`、三个完成情况列、`实际耗时合计` 只来自逐项填报的 `projects[]`；
  月结补零的人是 0，未提交/未绑定的人整片数值留空，只在 `填报状态` 写
  `已提交` / `月结补零` / `未提交` / `未绑定`（与小程序「汇总」同一套词）。
- **名单里的所有部门都会导出**（含未绑定的人）：按部门分块，同部门且多于一人时「部门」列纵向合并；
  部门显示为「中文 英文」（如 `行政与数据 Administration and Data`），枚举外的旧值（如 `CPRO`、`图书馆`）
  原样输出并各自成块，不会被并进同一个合并单元格。
- 外观：表头用品牌紫 `#732160` 底色 + 白色加粗居中（长项目名允许换行），表格区域逐格细边框
  （合并区域逐格上色/描边，否则合并块会缺色缺边），大标题加粗放大。样式参数集中在 `pivot.js` 的 `STYLE`。
- **数据口径仍与小程序端同源**：绑定/提交/补零判定与汇总走 `rows.js` 副本，
  所以第 2 行的填报情况与网页「填报情况」页永远一致，不同的只有版式。
- 依赖 `exceljs`（见 `cloudfunctions/webExportData/package.json`），部署时必须选「云端安装依赖」。
  测试里用 `tests/helpers/exceljs-stub.js` 顶替，`npm test` 仍然零依赖。



> [!NOTE]
>
> TODO List

- [ ] 老师也需要分部门，每个部门优先查看自己部门的学助
- [ ] 学助的指导老师，临时学助给徐涵老师
- [x] 值班工时占位符：playerName每个月不超过12个小时
- [ ] **学助中英文版本，老师只需要中文。**
- [x] 不体现预估公式
- [x] 保留额外工时申诉
- [ ] 按照完成时间加权。未完成$\times 0.2$，完成$\times 0.5$，已发布$\times 1$。
- [ ] 统筹$\times 1$，参与$\times 0.3$。

项目工时部分：
- 项目类型：<selectbox></selectbox>
- 项目名称：<input>
- 项目分工：<input type="checkbox"> 统筹 <input type="checkbox"> 参与
- 完成情况：<input type="checkbox"> 已发布 <input type="checkbox"> 已发布未完成 <input type="checkbox"> 未完成
- 完成形式：<input placeholder="请填入发布平台，活动名称 / 时间，以及结项标志">
- 实际完成时长：<input>

`+`增加项目

- 能否使用CPRO标志？
