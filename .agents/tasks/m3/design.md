# M3 设计：设计循环最小闭环

版本：0.4（2026-10-29），按第 3 轮评审修订（§14）。
依据：main `c8492af`。`src/`、`scripts/` 与 `28ce4f4`、`98f43eb` 相同（`git diff --stat 28ce4f4 c8492af -- src scripts` 为空）；`28ce4f4..8f1a4c6` 只有 m8-ui-audit 的两个界面提交（`ui/src/channel.js`、`ui/src/channel-model.ts`、`ui/src/graph/Panel.tsx`、`ui/src/graph/styles.ts`、`tests/health.spec.ts`、`tests/graph-panel-model.spec.ts`，`docs/DESIGN.md` §2.5 与 `docs/ORCHESTRATION.md` §2.10 各一句）与图提交，`8f1a4c6..c8492af` 只有 m8-ui-audit 的 `20ed994`（`ui/src/graph/Panel.tsx` 改 3 行：节点详情关闭后焦点回到图节点）与图提交（`c8492af` 把 m8-ui-audit 记为 done），本设计引用的 `ui/src/channel.js` 行号已按新文件改写，其余引用不受影响。split 设计 `.agents/tasks/split/design.md` 0.3（评审 APPROVED，只余 LOW）与人在 2026-10-29 的拍板：`question-13` A（两个根目标，编排层沿用 `hourness`）、`question-14` G3（guard 属于编排层包，包启用时对所有路由与模型生效，原文「围栏到时候跟着编排层走吧，拦全部的。开编排层就全生效，不开就全不生效」）、`question-15` A、`question-16` A（包名 `dsh-glm-zcode`、`dsh-hourness`，客户端包加 `-ui`）、`question-17` B（提交 `69dd424`，转述「分，彻底改成两个插件」：不要伞包与占位包，根 `package.json` 只作开发工作区根，`ui/` 不再是包）、`question-18` A（V-01 在 split 之后）。question-17 B 的布局由 split 的设计附录 `.agents/tasks/split/design-addendum-q17b.md` 写出，它取代 0.3 的 §3.1–§3.7、第 5、6 步与合入顺序。附录还在评审中，本设计不跟着它的版本号走：以评审 APPROVED 的附录为准，M3 开工前核对下面十个被引用的标题仍在、内容与 §7 的用法一致（各轮评审的意见至今都在 profile 切换脚本、回滚与演练，不涉及这些标题）。附录的节号在修订中变过，本设计按标题引用它（「目录」「清单」「行 id 与其他持久化标识」「桌面版 profile：切换前后」「glmsandbox」「第 5 步：宿主包布局，根退出 bundle」「第 6 步：UI 拆分」「第 5、6 步的检查与测试」「合入顺序」「对人定事项的影响」）；用到它的地方列在 §7。split 的实现在 `.worktrees/split`：第 0 步 `ab031b7`、第 1 步 `00d1bd5`、第 2 步 `0fe76a5` 已提交，未合入；第 1 步把图行服务移到 `src/graph/service.ts`、每步 notice 接缝移到 `src/shared/step-notice.ts`（`installStepNotice` 的 `row` 必填），第 2 步加了 `src/shared/dialect.ts` 与 `src/shared/tool-names.ts`，并让 guard 的规则经工具名换算判定、纠偏里的工具名随路由（`evaluate(rules, call, face)`），只读核对过。
运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准（`docs/DEVELOPMENT.md` §4）。证据写作「包:行」，包名省略 `dsh-` 前缀，指该包的 `lib/index.js`；客户端包写 `client.js`。〔实读〕读过源码；〔推断〕由源码推出，未运行；凡未运行的接缝都列进 §9 的 L3 或 L4 项。
范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/`、`~/.dsh`，不用桌面版。

## 0. 摘要

M3 在编排层包 `dsh-hourness` 里加一行 `glm-hourness/design`（源码 `src/design/`，默认禁用），再改几处已有代码：图引擎放开「LLM 改自己提议、仍为提议的目标」（D5）；guard 目录加一个规则文件与一个提示词节的纯函数模块；图目录加阶段模型与主 Agent 投影值的两个纯函数模块；图面板行的 `/graph-apply` 在人拍板后通知主 Agent；workflow 与报告去掉 L1/L2/L3。客户端在编排层客户端包 `dsh-hourness-ui` 里加一条流程条。

各任务：

- m3-1：人在会话里输入 `/wish`，这个会话的根 agent 成为主 Agent（项目经理）。状态从会话日志里 `/wish` 的命令事件折叠出来（会话投影 `hournessMainAgent`），续跑、压缩、重启都不丢；命令结束之前的那一小段由设计行内存里的待生效状态补上（同计划模式的 `pendingIntents`），所以 `/wish <一句话>` 唤醒的第一步就是主 Agent。主 Agent 的系统提示词多一节 `hourness:main-agent`（本项目自己的身份文本：三问四答、八步访谈、五栏、五键、决策卡），所有路由都加。主 Agent 的写文件调用由规则 `main-agent-no-write` 在 `tools/pre-execute` 拒绝，正路是图工具与派发；工具面等于普通会话的工具面加两个设计工具，不用 preset。
- m3-2：八步访谈的问题经 DSH 原生 `ask_user_question` 问人；每答一题，主 Agent 用图工具把答案写进它自己提议的目标节点（正文的固定标签、`acceptance`、`nonGoals`）与子节点（风险、岔路待决），面板随节点文件变更实时长出骨架。今天的引擎拒绝 LLM 改任何目标（`planEdit`），所以先改引擎：自己提议且仍为 `proposed` 的目标可以改，已批准的目标照旧不能改（D5，图引擎权限，独立评审）。需求卡是这些字段的渲染，不另存。第 8 步由新工具 `design_review` 出确认卡：需求卡 8 项不齐时拒绝、卡片不出现；人点「确认，进入设计」时，harness 以人的身份批准目标并把阶段改为 `design`。
- m3-3：方案五栏落在设计决策节点上（正文标签「理由」「架构」「查过的现成方案」、`acceptance`、`nonGoals`，规划是以 `source` 连线指向它的节点）。五栏门禁在 `design_review` 里，缺一栏就拒绝、卡片不出现。设计期只读由规则 `design-before-release` 实现：派发链的根是主 Agent 的各层子 agent（子 agent、孙 agent……，不依赖设置页「最大递归深度」的取值），在主 Agent 焦点所在的目标放行之前写文件被拒；主 Agent 没有焦点或焦点链上没有目标时同样被拒。不借用 DSH 计划模式（理由见 §3.3，待人定 D2）。
- m3-4：设计阶段的 `design_review` 出五键卡，经 `userQuestions.ask`，一次带两个问题：第一问是五个键（批准、拒绝（带理由）、补充、讲细点、说重点），单选；第二问是不带选项的「理由或补充」，可以跳过。DSH 客户端的单选问题只交选项或文字之一，所以拒绝的理由与补充的文字放在第二问里。批准即放行：harness 以人的身份批准卡上列出的全部提议节点，阶段改为 `release`；带 `supersedes` 连线的提议不进卡片，门禁拒绝（它们会连带取代卡上没有的节点）。拒绝与补充的文字记成人在目标上的批注，批注写的是人实际点的键；人没有选键、只写了文字时如实记成「没有选键」。讲细点、说重点在本会话内调汇报细度一档（写入画像属于 M5）。
- m3-5：同步决策卡是新工具 `decision_card`：先在图上提一张待决，再在卡上问人，人选了由人拍板；人关掉卡片，这张待决留在「需要你」队列里，同步卡自动变成异步卡；卡片打开期间人在面板上拍过板时，卡片不推翻它。异步卡就是图上的待决（已实现），本任务补上回写：人在面板上拍板、批准或否决后，同一张图上（图目录相同，不同工作区的图不算）、焦点在同一目标下的主 Agent 会话收到一条消息（运行中 `steer`，空闲 `followup`）。不用 `user-approval`：用户桌面版的审批策略是 `never`，`approval.request` 直接返回 `rejected`，卡片不出现（user-approval:175，`docs/FACTS.md` §3）。`docs/ORCHESTRATION.md` §5 同步卡原定的场景（出工作区操作、往工作区外装工具）不在 M3 做，归属待人定（D6）。L1/L2/L3 分级从代码与晨报里删去，晨报的决策一节改为读图上的待决。
- m3-6：阶段存在目标节点的 `stage` 字段。阶段只经 `design_review` 前进（`wish`/`interview` → `design` → `release`），门禁是纯函数模块 `src/graph/stage.ts`，宿主与客户端共用。主 Agent 每步在阶段或缺项变化时收到阶段提醒（`agent/pre-step` notice，来源 `glm-design-stage`）。输入框上方的流程条只在主 Agent 会话里出现，写阶段、缺项与「等你确认 / 等你批准 / 等你拍板」。

实施顺序（§8）：引擎放开自己提议的目标 → 纯函数阶段模型 → 主 Agent 模式与身份 → 写入门禁 → 阶段提醒与设计期只读 → 决策卡与回写 → 访谈与确认卡 → 五栏门禁与五键 → 去掉 L1/L2/L3 → 流程条 → 标定任务与批次 L4。依赖 split 的地方集中在 §7：split 的人定事项都已拍板；question-17 B 的设计附录还在评审（以评审 APPROVED 的附录为准，意见至今都在 profile 切换），M3 的行登记、客户端包与入口、`ui/src/flow/**` 的归属、探针组合与标定 profile 按附录写，M3 的第 3 步（行登记）与第 11 步（流程条）要等附录评审通过、split 合入后再开工。

要人定的事（§12）：D1 主 Agent 由谁开启、作用在哪些会话（建议按会话用 `/wish` 开启）；D2 ROADMAP 3.3、3.5 写的两个借用组件（`exit_plan_mode`、`user-approval`）改为本项目的卡片工具；D3 卡片上的回答以人的身份写进图；D4 六个任务节点的验收条件与标定任务的模拟人做法（改验收属于必须问人的第 1 类）；D5 引擎允许 LLM 改自己提议、仍为提议的目标（改动 2026-10-28 用户批准的原型规则）；D6 同步卡原定场景的归属（建议归 M4 并建节点）。

## 1. 需求与验收

### 1.1 图上的现状

`m3`（feature，doing）的验收只有一条：「标定测试集中的「需求访谈」任务，从一句话到骨架放行全程走通」。六个任务节点 `m3-1` 到 `m3-6` 都是 approved，都没有 `acceptance`，`m3-2`、`m3-3`、`m3-4`、`m3-6` 的正文只指向 `docs/ORCHESTRATION.md` 的章节。所以本节先把需求从文档里收拢，再为每个任务写出建议的验收条件。验收条件写进节点要人批准（决策分级第 1 类，`norm-decision-tiers`），列为 D4；在人定之前，实现按下表做，L2/L3 的检查按下表写。

需求来源：`docs/ROADMAP.md` M3 表与借用组件核实清单第 2、13、14、16 项；`docs/ORCHESTRATION.md` §2.5、§2.7、§2.9、§3.1、§4.1–§4.5、§4.8、§5、§6.3、§6.4、§10.1、§13、§14；`docs/CHARTER.md` §2、§4、§6、§7.1；决策节点 `d-dispatch`（主 Agent 不写代码由 guard 拦，身份是本项目自己的提示词）、`d-async-cards`（异步卡是图上的待决，未验证）、`d-graph-programming`（在图上编程，未验证）。

### 1.2 各任务的行为与建议验收

| 任务 | 行为（本设计） | 建议验收（D4） | 层 |
| --- | --- | --- | --- |
| m3-1 | `/wish` 开启主 Agent 模式；系统提示词带 `hourness:main-agent`；主 Agent 的文件工具写入与写文件的 shell 被 `main-agent-no-write` 拒绝，正路是图工具与派发；`/wish off` 退出 | 1. 开启后每步的系统提示词带这一节（`/wish <一句话>` 唤醒的第一步也带），GLM 路由上与方言改写叠加后仍在，未开启的会话没有（核实清单第 16 项）。2. 主 Agent 的文件工具写入（`write`、`edit`、`str_replace_editor` 除 `view` 外）与 file-tools-only 判为写文件的 shell 命令，在 GLM 与非 GLM 路由上都被拒，拒绝带正路并进违规流水；`/wish off` 之后同一会话照常写。（shell 判写的残余缺口与 file-tools-only 相同，见 §10）3. 主 Agent 的工具面等于同一组合下普通会话的工具面加 `design_review`、`decision_card`；写文件的工具都还在，写入在执行边界被拒；不用 preset | L2、L3；L4 看桌面版会话文件 |
| m3-2 | 八步问题经 `ask_user_question`；答案写进主 Agent 自己提议的目标与子节点（引擎按 D5 放开自己提议的目标）；需求卡 8 项；`design_review` 在访谈阶段出确认卡 | 1. 访谈中每答一题，图上对应的字段或节点出现。2. 需求卡缺项时 `design_review` 拒绝并列出缺项，卡片不出现；人点确认后目标由提议变已批准、阶段为 `design`，历史记为人。3. 标定任务 `interview-expense-log` 在 GLM-5.3 上至少 1 次完整通过验收脚本 | L2、L3、标定 |
| m3-3 | 五栏在设计决策节点上；门禁在 `design_review`；主 Agent 焦点所在的目标放行之前，派发链的根是它的各层子 agent 写文件被 `design-before-release` 拒绝 | 1. 五栏缺任一栏时 `design_review` 拒绝并说明缺什么，卡片不出现。2. 主 Agent 焦点所在的目标在 `release` 之前（含主 Agent 没有焦点、焦点链上没有目标），主 Agent 派出的子 agent 以及子 agent 再派出的各层 agent 写文件被拒，与「最大递归深度」的设置无关；放行之后照常。3. 放行把卡上列出的提议全部转为已批准，阶段为 `release`，历史记为人；带 `supersedes` 连线的提议不能经卡片放行 | L2、L3 |
| m3-4 | 设计阶段的 `design_review` 出五键卡（第一问五个键，第二问理由或补充）；五个键各有确定的结果 | 1. 五个键的结果都按 §3.4 回到主 Agent。2. 拒绝的理由与补充的文字（卡上第二问）记成人在目标上的批注，批注写明人点的键；人没有选键、只写了文字时，批注写「没有选键」，不记成任何键。3. 桌面版上五键卡的正文（Markdown）与五个按钮正常显示，第二问以文本框出现、可以跳过 | L2、L3；L4 |
| m3-5 | `decision_card` 同步卡（关掉即转异步）；人在面板拍板后通知焦点在同一目标下的主 Agent；删去 L1/L2/L3；同步卡原定场景按 D6 | 1. `decision_card` 在图上留一张待决并在卡上问人，人选了由人拍板，关掉卡片则待决留在人的决策队列；卡片打开期间人已在面板上拍板时，卡片不改拍板结果。2. 人在面板上拍板、批准或否决后，同一张图上、焦点在这个节点所属目标下的主 Agent 会话收到消息（不论面板开在哪个会话里），下一次投影带结果；焦点在别的目标下的、工作在别的图上（别的工作区，节点 id 相同也算别的图）的主 Agent 会话与普通会话不收到（`d-async-cards` 由此验证）。3. 代码与晨报里没有 L1/L2/L3，晨报的决策一节取自图。（D6 选 B 时加 4：工作区圈禁拒绝之后，主 Agent 经 `decision_card` 申报，人批准后同一调用放行一次，再次调用仍被拒） | L2、L3；L4 |
| m3-6 | `stage` 字段只经 `design_review` 前进；阶段提醒；流程条 | 1. 主 Agent 在阶段或缺项变化时收到阶段提醒，写明阶段、本阶段能做什么、离开还差哪几项；不变不注入，压缩后重注。2. 阶段前进只经确认卡与五键卡，门禁同 m3-2、m3-3。3. 主 Agent 会话的输入框上方有流程条，普通会话没有 | L2、L3；L4 |
| m3（特性） | 上面六项合起来就是标定任务走通的路径 | 不变 | 标定 |

## 2. 总体设计

### 2.1 构件与位置

全部在编排层包 `dsh-hourness`（目录 `packages/hourness/`，源码不搬家，split §2.2）。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `design`。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 引擎：自己提议、仍为 `proposed` 的目标可以 `edit`（D5）；`graph_edit` 的说明随之改一句 | `src/graph/engine.ts` `planEdit`、`src/graph/tools.ts` | 改（§3.2.1） |
| 行入口：命令 `/wish`、会话投影 `hournessMainAgent`、每 agent 的安装函数 `installAgentHooks`（组装监听器：身份节、按角色过滤两个设计工具；阶段提醒；`agent/created` 与 `/wish` 共用，§3.1.3）、两个工具、两条写入规则的安装、行健康 `design`、卸载标志 | `src/design/index.ts` | 新建，行 `glm-hourness/design`，默认禁用 |
| 主 Agent 模式：投影单元与折叠、待生效状态、`isMainAgent`、`/wish` 处理函数 | `src/design/mode.ts` | 新建 |
| 投影键 `MAIN_AGENT_KEY`、视图类型 `MainAgentView`、只读判定 `mainAgentActive(values)` | `src/graph/main-agent.ts` | 新建，纯函数，不用 Node 内置模块；设计行、`panel-row.ts` 与流程条都从这里导入，图目录与客户端不反向导入设计目录 |
| 身份文本 | `src/design/identity.ts` | 新建 |
| 提示词节的插入规则：`DECLARATION_SECTION`（从 `src/guard/index.ts` 移来）与 `insertHournessSection(sections, section)` | `src/guard/sections.ts` | 新建，纯函数；guard 的声明监听器、设计行与以后的 bootstrap 共用（split B5） |
| 阶段提醒 | `src/design/stage-notice.ts` | 新建 |
| `design_review` | `src/design/review.ts` | 新建 |
| `decision_card` | `src/design/decision-card.ts` | 新建 |
| 卡片请求的构造与回答的解析、写进历史的回答说法 `answerPhrase`、`FIVE_KEYS`（从 `src/workflow/decisions.ts` 迁来，键名不变，说明改为 M3 的实际行为，§3.4.1） | `src/design/cards.ts` | 新建 |
| 卡片回答之后以人的身份写图：批准一组节点、改阶段、批注、拍板 | `src/design/human-writes.ts` | 新建 |
| 写入规则 `main-agent-no-write`、`design-before-release` 与安装函数 | `src/guard/main-agent.ts` | 新建，用 `src/guard/rules.ts` 的框架，做法同 `src/guard/graph-files.ts` |
| 阶段模型：需求卡、五栏、放行集合、有效阶段、门禁 | `src/graph/stage.ts` | 新建，纯函数，不用 Node 内置模块，客户端也导入（先例 `src/graph/parse.ts`） |
| 只在变化时注入的历史扫描（从 `reminder.ts` 抽出） | `src/graph/digest-notice.ts` | 新建；`reminder.ts` 改为调用它，行为不变 |
| 图行服务加 `focusOf(session)` | `src/graph/service.ts`（split 前叫 `src/shared/graph-service.ts`）、`src/graph/index.ts` | 改 |
| 派发链的根 `dispatchRoot(agents, agent)`（§3.3.3） | `src/guard/main-agent.ts` | 新建（同下面的规则文件） |
| `/graph-apply` 在人拍板、批准、否决之后通知同一张图上、焦点在同一目标下的主 Agent；图目录的比较 `sameDir` | `src/graph/panel-row.ts` | 改 |
| 去掉 L1/L2/L3；晨报的决策一节读图 | `src/workflow/index.ts`、`src/workflow/morning-report.ts`、`src/memory/audit.ts`、`src/report/index.ts`、`src/report/panel.ts`；删 `src/workflow/decisions.ts` | 改、删 |
| 薄适配层：`LiveAgentLike.steer`、`AgentsService.roots`、`SessionProjectionsService.stateOf`、`UserQuestionsService` | `src/shared/dsh-min.ts` | 改 |
| 工具名契约：新常量 `DESIGN_TOOL_NAMES = ['design_review', 'decision_card']`；两个名字加进 `ORCHESTRATION_RESIDENT_TOOLS`（GLM 上常驻）；契约测试改为「设计行注册的名字集合等于 `DESIGN_TOOL_NAMES`；`ORCHESTRATION_RESIDENT_TOOLS` 是 `GRAPH_TOOL_NAMES`、`MEMORY_TOOL_NAMES`、`DESIGN_TOOL_NAMES` 之并的子集」 | `src/shared/tool-names.ts`（split §2.6）、`tests/contracts.spec.ts` | 改 |
| 行健康表加 `design` | `src/shared/health.ts` 的 `HOURNESS_ROWS` | 改 |
| 流程条 | `ui/src/flow/FlowBar.tsx`、`ui/src/flow/model.ts`，在编排层客户端入口 `ui/src/hourness-client.tsx` 注册 | 新建、改 |
| 目录表：`hourness.src` 加 `design`，`rows` 加 `{id: 'glm-hourness/design', module: 'design/index'}`，编排层客户端的 `sources` 加 `ui/src/flow/` | `scripts/packages.mjs`（split 0.3 §2.7；附录「第 5 步：宿主包布局，根退出 bundle」「第 6 步：UI 拆分」两节） | 改 |
| 行登记：`packages/hourness/cordis.patch.yml` 里本行排在 `graph-panel` 之后、`ui` 之前（宿主行在客户端行之前；附录「目录」写这个文件依次为 `data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel`，第 6 步加 `ui`）；`packages/hourness/tsconfig.json` 的 `include` 随表；`tests/contracts.spec.ts` 的字面行 id 清单加一项（附录「第 5、6 步的检查与测试」：第 6 步之后 13 项，M3 之后 14 项） | 附录「目录」的布局 | 改 |

阶段的中文名复用 `src/graph/labels.ts`:38–48 已有的 `STAGE_LABELS`（面板 `ui/src/graph/NodeDetail.tsx`:135 在用），不改这个文件。

不加的东西：引擎的其他操作与权限（只改 `planEdit` 对目标的那一条，`link`/`unlink` 对目标的拒绝不变）；新的配置项（设计行只有与图行同形的 `home`、`fs`）；新依赖。

### 2.2 端到端流程（标定任务就是这条路）

1. 人：`/wish 我想要一个命令行小工具，每天记一下花了多少钱，月底能看出钱花在哪了`。命令把会话标为主 Agent 模式，并发一条许愿消息（来源 `glm-design-wish`，正文引用原话）：agent 空闲时 `followup`（唤醒，开新回合），正在跑时 `steer`（本回合的下一步收到），与角色生效的那一步对齐（§3.1.1）。
2. 主 Agent（下一步起系统提示词带身份节）：`graph_propose` 一个目标（`stage: wish`，正文 `需求：<原话>`），`graph_focus` 到它。阶段提醒开始出现。
3. 第 2–6 步：每步一个 `ask_user_question`，带 2–4 个选项、推荐项放第一并加 `(Recommended)`；拿到回答就 `graph_edit` 自己的提议（第一次提问时把 `stage` 改为 `interview`），写 `问题：`、`给谁：`、`acceptance`、`nonGoals`、`约束：`；第 6 步的风险用 `graph_propose` 在目标下提风险节点。
4. 第 7 步：`decision_card` 问架构岔路（2–4 条路，各有后果，带推荐与理由）。待决挂在目标下，人选了即由人拍板。
5. 第 8 步：`design_review {id: 目标}`。需求卡齐了才出确认卡；人点「确认，进入设计」，harness 以人的身份批准目标、阶段改为 `design`。
6. 设计：主 Agent 提一个设计决策节点（`source` 连到第 7 步的待决），写五栏；提规划节点（特性、任务，`source` 连到决策，任务带验收条件）。
7. `design_review {id: 目标}`：五栏齐了才出五键卡。补充 → 主 Agent 改方案后再提；批准 → harness 以人的身份批准卡上列出的全部提议，阶段改为 `release`。
8. 结束：目标 `release`，子树里没有提议。分解与派发属于 M7。

整个过程中主 Agent 不写任何文件；它若派子 agent 去写（或子 agent 再往下派），在它焦点所在的目标放行之前被拒，上面第 2 条聚焦之前（没有焦点）同样被拒。

### 2.3 主 Agent 模式（D1）

`docs/ORCHESTRATION.md` §3.1 写「主 Agent 是会话的根 agent」。编排层包对所有模型、所有工作区生效（G3），如果每个根 agent 都是主 Agent，用户在任何工作区里用 DSH 直接写代码都会被拦。所以主 Agent 是会话级的状态，由人开启（D1 选项 A）：

- 开启与退出：命令 `/wish`（开启，给 agent 留一条说明、不唤醒它）、`/wish <一句话>`（开启并许愿，唤醒 agent）、`/wish off`（退出）。只有人能发斜杠命令，模型发不出（`docs/ORCHESTRATION.md` §2.10），所以模型不能自己进出这个角色。
- 存放：DSH 不让第三方追加自定义会话事件（`dsh-session/README.md` 70 行），所以状态从命令自己的生命周期事件里折叠：`command/run`（`{commandId, name, args, source}`，commands:334–339）与 `command/done`（`{commandId, kind, text?}`，commands:341–346）。做法照抄计划模式（plan-mode:84 折叠 `/plan` 的 `command/run`，plan-mode:95 按 `commandId` 认 `command/done`），两半都抄：投影单元之外，设计行在内存里按会话记一份待生效状态，覆盖「处理函数已经返回、`command/done` 还没落盘」这一段（计划模式的 `pendingIntents`，plan-mode:146、173–175、215–216，§3.1.2）。单元注册进 `sessionProjections`（session-projection:68），宿主侧用 `stateOf` 同步读状态（session-projection:126；计划模式的 `planState` 同样用它，plan-mode:332）。单元在已有日志上懒折叠（session-projection 文件头注释：后注册的单元在第一次读取时折叠内存里的日志），所以续跑与重启后的会话读得到；压缩只加检查点，不删命令事件，所以压缩不影响。
- 谁是主 Agent：`isMainAgent(agent)` = 会话头没有 `origin: 'subagent'`（session:1053；委派子会话由 subagent:346–355 写入），且待生效状态（有时）或投影的 `active` 为真。用户 fork 的会话继承前缀事件，仍是主 Agent；`subagent_fork` 的子会话也继承事件，但带 `origin: 'subagent'`，不是。
- 一个工作区可以有多个主 Agent 会话：它们写同一张图，引擎的修订号检查处理并发（`docs/ORCHESTRATION.md` §2.11）。

### 2.4 阶段：存在哪，谁能改

阶段存在目标节点的 `stage` 字段（schema 已有，只有目标与特性能带，`src/graph/format.ts`:350）。M3 只处理目标上的阶段；特性上的阶段只读，用于提醒（§10）。

主 Agent 的「当前目标」只有一种定义：`goalOf(graph, focus)`，焦点节点自身或它最近的目标祖先（目标都是根节点，F15，所以就是焦点所在的那棵树的根）。焦点由图行服务的 `focusOf(session)` 给出（§3.6）。当前目标可能没有阶段，提醒、流程条与设计期只读对这种目标的处理见 §3.6.2、§3.6.4、§3.3.3。

| 转换 | 谁写 | 在哪 | 门禁 | 引擎依据 |
| --- | --- | --- | --- | --- |
| （无）→ `wish` | 主 Agent（`llm`）提议目标时带上 | `graph_propose` | 无 | 提议可以带 `edit` 能改的字段，`stage` 在内（§2.9 propose 行） |
| `wish` → `interview` | 主 Agent 改自己的提议 | `graph_edit` | 无 | 今天被拒：`planEdit` 在计算 `ownProposal` 之前就拒绝一切非特权的目标编辑（`engine.ts`:438）。§8 第 1 步（D5 选 A）把它收窄为「不是自己的开放提议」，之后自己提议、仍为 `proposed` 的目标可以改全部字段 |
| `wish`/`interview` → `design` | 人（确认卡的回答） | `design_review` | 需求卡 8/8 与确认门禁（§3.2.3） | 以 `human` 身份 `approve` 目标再 `edit` 阶段 |
| `design` → `release` | 人（五键卡的「批准」） | `design_review` | 五栏与放行门禁（§3.3） | 以 `human` 身份 `approve` 放行集合再 `edit` 阶段 |
| 任意 | 人在面板以外改，或 LLM 带原话转述 | `graph_edit` + `relay` | 引擎规则 | 转述的写入有人的权限 |

§8 第 1 步之后，已批准的目标仍不能被 `llm` 或 `harness` 编辑（`cannot edit the goal`），所以 `design` 与 `release` 只能由人的动作写入，对应「放行要人批准」。

有效阶段 `effectiveStage(goal)`：

| 目标状态 | `stage` | 有效阶段 |
| --- | --- | --- |
| `proposed` | 没有，或 `wish` | `wish` |
| `proposed` | 其他任何值 | `interview` |
| `approved`、`doing` | 有 | 原值 |
| `approved`、`doing` | 没有 | 无（这个目标不走设计循环） |
| `done`、`dropped`、`superseded` | 任意 | 无，另报「目标已关闭」 |

前两行堵住一个漏洞：LLM 可以在自己的提议上把 `stage` 写成 `design`，或干脆不写阶段，但目标没被人批准，门禁、提醒与设计期只读都把它当访谈。第四行只有人能造出来（LLM 不能批准目标）：人在面板上直接批准了一个没有阶段的目标，或已有项目里的目标，表示人不要这个目标走设计循环。

`release` 是 M3 的终点，含义是「已放行，待分解」。`decompose` 及以后由 M7 定义。`release` 之后发现方案要改，正路是人在对话里说、LLM 带原话把阶段改回 `design`。

## 3. 各任务的设计

### 3.1 m3-1 主 Agent 身份与不写代码

#### 3.1.1 命令 `/wish`

注册（commands:149–181 的 `normalizeDefinition`：名字匹配 `/^[a-z][a-z0-9_-]*$/u`，描述非空，`input.hint` 非空）：

```ts
{
  definitionId: 'dsh-glm-hourness/wish',
  name: 'wish',
  description: '让这个会话的 agent 当主 Agent（项目经理）：按项目图推进，不写文件；后面跟一句话就从许愿开始；/wish off 退出',
  input: { hint: 'off | 一句话' },
  // recordInput 保持默认：command/run 要记下 args，投影靠它区分开启与退出（§3.1.2）
  handler,
}
```

处理函数读 `AgentCommandInvocationLike`（`commandId`、活 agent、`rawInput`，commands:379–385），按下面的顺序判断，第一条成立就返回：

| 输入（去掉首尾空白） | 条件 | 结果 | 对 agent |
| --- | --- | --- | --- |
| `off` | 本会话不是主 Agent | success「这个会话本来就不是主 Agent」 | 无 |
| `off` | 是 | success「已退出主 Agent 模式：这个会话的 agent 又可以直接写文件了」 | `inject` 一条 notice（来源 `glm-design-wish`）：人用 `/wish off` 退出了主 Agent 模式，身份文本与写入规则从下一步起不再适用 |
| 其他 | 会话头 `origin === 'subagent'` | error「子 agent 的会话不能当主 Agent」 | 无 |
| 其他 | 投影没有注册（`sessionProjections` 不在） | error「主 Agent 模式要用会话投影服务，这个组合里没有」 | 无 |
| 其他 | 图行服务不在 | error「项目图行 glm-hourness/graph 没有启用，主 Agent 没有图可用」 | 无 |
| 其他 | 图目录不存在（`service.dirFor(cwd)` 再 `stat`，同 `locateGraph`） | error「这个工作区还没有项目图：先建空目录 <目录>」 | 无 |
| 其他 | 文字超过 2000 字符（与 `relay` 同上限） | error「愿望太长，请先用一两句话说」 | 无 |
| 空 | 已是主 Agent | success「这个会话已经是主 Agent」 | 无 |
| 空 | 不是 | success「已让这个会话的 agent 当主 Agent（项目经理）：它按项目图推进，不写文件；/wish off 退出」 | `inject` 一条 notice：人让本会话的 agent 当主 Agent，先 `graph_open`，按阶段提醒推进 |
| 一句话 | 任意 | success 同上一行，另说「已把你的愿望交给它」 | 许愿 notice：agent `status === 'running'` 时 `steer`，空闲时 `followup`；正文引用原话，要求按访谈第 1 步提议目标（正文以 `需求：` 开头，后接原话逐字）并 `graph_focus` |

投递方式与角色生效的时刻对齐。待生效状态让角色从下一步起就变（下一段），所以消息也要在下一步到：`inject` 投到下一步、不唤醒空闲的 agent；`steer` 投到下一步并唤醒；`followup` 投到下一回合并唤醒（agent-loop:806–814）。三行改变角色的输入里，`off` 与空输入用 `inject`：运行中的 agent 下一步读到说明，与角色变化同一步；空闲的 agent 不需要被唤醒（人没有交代事情），在人下一次说话的那一步读到说明，角色也从那一步起对它可见；一句话要唤醒 agent，空闲时用 `followup`（新回合的第一步就带它），运行中用 `steer`（本回合的下一步带它）。若运行中也用 `followup`，本回合余下的各步里模型已带着身份节、两个设计工具与写入拦截，却要到回合结束才读到人说了什么。做法同 §3.5.2 的回写。许愿 notice 的 `source` 带 `designWish: {commandId, text}`；原话本身已由 `command/run` 的 `args` 记在会话日志里，notice 只引用它。

待生效状态：表里改变角色的三行（`off` 且是主 Agent、空、一句话），处理函数在所有检查通过之后、调 `inject`、`steer` 或 `followup` 之前，同步写 `pending.set(agent.session, {commandId, active})`（§3.1.2）。理由是 rc.3 的次序：`commands.execute` 先追加 `command/run`、再调处理函数，处理函数的返回值经 `await withAbort(...)` 之后才由 `settle` 追加 `command/done`（commands:334–339、340–346、388–389、394）；而空闲 agent 收到 `followup` 时，`send` → `wakeDriver` → `withInitiator(this, () => this.kick())` → `turn` 同步追加 `turn/start`，接着 `preStep` 同步开始 `systemPrompt.assemble`（agent-loop:800–807、854–868、887–889、938–945、956、902–907；`withInitiator` 经 `AsyncLocalStorage.run` 同步调用，agent:400–401、645–653），这些都在处理函数返回之前。组装监听器在 `next()` 之后读 `isMainAgent` 的时刻与 `command/done` 落盘的先后取决于微任务的层数，读源码定不下来；只读投影时第一步可能没有身份节、两个设计工具也被滤掉。返回 error 的各行不写待生效状态。`/wish off` 之后的那一步同理：待生效状态先说「不是」，身份节与写入规则在同一步一起消失。

每 agent 的监听器：除 `off` 以外返回 success 的三行（空且已是主 Agent、空、一句话），处理函数在检查通过之后先同步调 `installAgentHooks(agent)`（§3.1.3），再写待生效状态、发消息。这个 agent 还没有本行的组装监听器与阶段提醒时现在装上，已装过时什么都不做。理由同上一段：空闲 agent 的第一次组装在处理函数返回之前就开始，组装监听器必须在 `followup` 之前已在这个 agent 上；而本行的 `agent/created` 监听器不一定已为它运行过（§3.1.3 的两种情形）。「已是主 Agent」一行也调，是为了设计行激活之前就开着的主 Agent 会话：人重发一次 `/wish` 就装上（§6.2）。装的过程抛错时告警、行健康记 degraded，命令照常继续（写入规则是全局监听器，不受影响）。

不建图目录：建空图属于 bootstrap（节点 `bootstrap`：新项目「建空图……然后走许愿访谈」），图工具也从不替模型建目录（`docs/ORCHESTRATION.md` §2.10）。

#### 3.1.2 会话投影 `hournessMainAgent`

```ts
// src/graph/main-agent.ts（纯函数，宿主与客户端都导入）
export const MAIN_AGENT_KEY = 'hournessMainAgent'
export interface MainAgentView { readonly active: boolean }
/** 一份投影值表（宿主 snapshot 的 values，或客户端 projectionsBySession[id].values）里本会话是否已开启主 Agent 模式；值缺席或形状不对时为 false */
export function mainAgentActive(values: Readonly<Record<string, unknown>> | undefined): boolean

// src/design/mode.ts
interface MainAgentState {
  readonly active: boolean
  /** 一次还没结束的 /wish：它的 commandId 与想要的结果 */
  readonly running: { readonly commandId: string, readonly wanted: boolean } | null
  /** 最近一次已结束（success 或 error）的 /wish 的 commandId */
  readonly settled: string | null
}
export const mainAgentProjection = {
  key: MAIN_AGENT_KEY,
  stateVersion: 1,
  stateSchema: { parse: parseState },        // 形状检查，同 live.ts
  init: (): MainAgentState => ({ active: false, running: null, settled: null }),
  apply: foldMainAgent,
  wire: { viewSchema: { parse: parseView }, view: (state: MainAgentState): MainAgentView => ({ active: state.active }) },
} as const
```

`foldMainAgent`：`command/run` 且 `data.name === 'wish'`、`data.args` 是字符串 → `running = {commandId, wanted: args.trim() !== 'off'}`；`command/done` 且 `data.commandId === running?.commandId` → `kind === 'success'` 时 `active = running.wanted`，然后 `settled = commandId`、`running = null`；其余事件原样返回。继承的前缀事件照常折叠（用户 fork 的会话仍是主 Agent，§2.3）。改了状态字段或折叠规则就把 `stateVersion` 加一（session-projection:68 起拒绝同 key 不同版本的第二次注册）。

注册经 `ctx.inject(['sessionProjections'], …)`（cordis:1600；graph-panel 行的同一做法），回调里记下服务，fiber 卸载时清掉。

待生效状态（设计行内存，同计划模式的 `pendingIntents`）：

```ts
// src/design/mode.ts
const pending = new WeakMap<SessionLike, { readonly commandId: string, readonly active: boolean }>()
/** 本 agent 是不是主 Agent：不是委派子会话，且待生效状态或投影说已开启；读不到投影时只看待生效状态 */
export function isMainAgent(projections: SessionProjectionsService | undefined, agent: AgentLike | LiveAgentLike): boolean
```

`isMainAgent` 的读法：会话头 `origin === 'subagent'` 时为 false；否则 `state = projections?.stateOf(session, MAIN_AGENT_KEY)`（同步，session-projection:126）；`p = pending.get(session)`；`p` 存在且 `state?.settled === p.commandId` 时（这次 `/wish` 的 `command/done` 已折叠，不论成败）删掉 `p`，返回 `state.active`；`p` 存在且还没折叠到时返回 `p.active`；没有 `p` 时返回 `state?.active === true`。`stateOf` 先物化整个会话的各单元（session-projection:126–131），之后走水位缓存，所以每次工具调用与每次组装各读一次可以接受。

待生效状态只在处理函数返回到 `command/done` 落盘之间起作用，一般是几个微任务。两种例外：一是这段时间里请求被取消，`withAbort` 抛出，`settleThrown` 追加 `kind: 'error'` 的 `command/done`（commands:389–392、397–403），投影的 `active` 不变，待生效状态在下一次读取时被删掉，于是角色在下一步恢复原样，而许愿消息（`followup` 或 `steer`）已经发出：agent 读到这条消息，但下一步没有身份节、没有两个设计工具、写入也不被拦，行为同普通会话。`isMainAgent` 删除待生效状态时若发现 `p.active !== state.active`，行健康记一条「/wish 在生效前被取消，这个会话不是主 Agent」。二是进程在这段时间里退出：内存与命令一起丢失，日志里只有 `command/run`，投影的 `running` 停在那里、`active` 不变，等同于命令没有生效。

只读投影值的地方：`/graph-apply` 判断是否通知（§3.5.2）与流程条（§3.6.4）用 `mainAgentActive(values)`，不看待生效状态。两处都不在命令与第一步之间的那几个微任务里起作用：前者是人点面板时才运行，后者晚到一帧只是显示。

#### 3.1.3 身份节 `hourness:main-agent`

行给每个 agent 装一个 agent 作用域、`prepend` 的 `system-prompt/assemble` 监听器（system-prompt:398），做法同 guard 的声明监听器（`src/guard/index.ts` `apply` 里的 `agent.ctx.on('system-prompt/assemble', …, { prepend: true })`）。安装函数 `installAgentHooks(agent)`（`src/design/index.ts`）装这个监听器与阶段提醒（§3.6.2），用 `WeakSet<AgentLike>` 去重、把每个 agent 的卸载函数收进本行的卸载列表，同 guard 行与图行的 `installed`（`src/guard/index.ts`:154、192–194，`src/graph/index.ts`:120–123）。两处调用它：`agent/created`（agent:581–585）的监听器，与 `/wish` 处理函数开启主 Agent 之前（§3.1.1）。第二处覆盖两种情形：一是 agent 在本行激活之前就已创建（插件管理器启用本行或本行重新加载时已开着的会话），`agent/created` 不会再为它派发；二是别的插件在 `agent/created` 里替人发 `/wish`（探针与标定的模拟人，§9.1），这时本行的 `agent/created` 监听器可能还没轮到这个 agent：串行事件按注册顺序逐个 `await`（cordis:289–294，`on` 按 `push` 注册，:336），而加载器并发创建同一组里的各行（cordis-plugin-loader:87 `Promise.all(ids.map(... create ...))`），各行的激活次序不跟配置顺序走〔推断：由各行模块 import 完成的先后决定〕。不在激活时给已开着的 agent 补装：与 guard 行、图行一致，那些会话发一次 `/wish` 就装上（§6.2）。`next()` 之后：

- 不是主 Agent：从 `assembled.tools` 里去掉 `design_review` 与 `decision_card`，其余不动。工具仍然注册着，按名直接调用照样执行（`docs/DESIGN.md` §2.4a：执行按名在调用方作用域解析，与工具面无关），所以两个工具体都先查调用方（§3.4.4、§3.5.1）。
- 是主 Agent：`sections = insertHournessSection(assembled.sections, {name: 'hourness:main-agent', text: MAIN_AGENT_IDENTITY, interpolate: false})`；工具面不动。

`insertHournessSection` 在 `src/guard/sections.ts`：已有 `DECLARATION_SECTION`（`glm:guard`）一节时插在它之前，否则放在最后；同名的节已在时替换它（同一个监听器不会加两次，替换只防重复安装）。`DECLARATION_SECTION` 从 `src/guard/index.ts` 移到这个文件，guard 的声明监听器与 `tests/guard-audit.spec.ts` 改为从这里导入，guard 的行为不变。放在 guard 目录而不放 `src/shared/`：规则是「编排层的节排在 guard 声明之前」，名字属于 guard；split 的边界规定公共库不导入包目录（`scripts/packages.mjs` 文件头），放进公共库就要把 `glm:guard` 再写一份。bootstrap 的项目规则节（split B5）以后调用同一个函数。

位置的理由：GLM 方言的 `rewriteDialectSections` 只替换身份节、把方言节插到身份节之后，其余节保持原来的先后（`src/glm-prompt/assembly.ts`:27–58），所以本节在方言监听器内外两种次序下都留在原处；guard 的声明监听器在 `next()` 之后把 `glm:guard` 追加在最后（`src/guard/index.ts`:196–206），本节在外层时插在它前面，在内层时先追加、guard 再追加在它后面，两种次序结果相同。G3 之后 `glm:guard` 出现在所有路由上（split 0.3 §4.2，split 第 7 步），没有它的组合里本节在最后。叠加结果在 L3 核对（核实清单第 16 项）。节名前缀 `hourness:` 是 split 为编排层保留的（split 设计 §9 B5），节名不进模型（split F14）。

工具面：主 Agent 的工具面等于普通会话的工具面加 `design_review`、`decision_card`。`/wish` 与 `/wish off` 的下一步，系统提示词与工具面各变一次（同一步），之后可以命中提示词缓存。计划模式为缓存稳定把 `exit_plan_mode` 常驻在工具面里（计划之外调用时抛错，plan-mode:255），这里不采用：普通会话不应看到两个只有主 Agent 能用的工具，而角色切换由人发起、次数少，多一次缓存未命中可以接受。

`MAIN_AGENT_IDENTITY` 是 `src/design/identity.ts` 里的常量，不随会话变化。随阶段变化的内容走阶段提醒（§3.6.2）。正文用英文写指令，对人说的话用中文原文。必须有的内容：

1. 角色：本会话的主 Agent（项目经理），负责访谈、规划、派发、验收、汇报；用户的人设管「怎么说」，本节管「做什么」。
2. 三问四答：人问为什么、怎么做、效果是；主 Agent 以理由、架构、目标、规划回答，加上非目标即方案五栏（`docs/CHARTER.md` §4）。
3. harness 执行的规矩：主 Agent 写文件一律被拒（`main-agent-no-write`）；焦点所在的目标放行之前、以及没有焦点时，它派出的子 agent 与子 agent 再派出的各层 agent 只能读（`design-before-release`），所以派写的活之前先 `graph_focus` 到这项工作所属的目标或任务；图只经图工具改。被拒时照正路走。
4. 设计循环的阶段（许愿、访谈、设计、放行），阶段提醒会告诉它在哪一步、还缺什么。
5. 八步访谈：`docs/ORCHESTRATION.md` §4.2 表的八个问题逐字列出，每步的产出写到图上的哪里（§3.2 的表）。规则：一次只问一个问题，用 `ask_user_question`，带 2–4 个选项，推荐项放第一个并在说法后加 `(Recommended)`（tool-ask-user:250 的约定，客户端据此标出推荐，client-ui-user-questions client.js:1090）；不出现内部字段名，用词表（验收条件说「怎样算做成」，非目标说「明确不做的」，风险说「最可能出岔子的地方」，约束说「不能改、不能花、不能冒的险」）；资深经验以默认值带入；每拿到一个回答就立刻写进图。
6. 图上的写法：目标正文的四个标签（§3.2.2），设计决策正文的三个标签与 `acceptance`、`nonGoals`，规划用 `source` 连线指向设计决策，任务都带验收条件（§3.3.1）。
7. `design_review`：第 8 步与每一轮方案汇报都调用它，不要在对话里问「可以开始了吗」；五个键各自的下一步（§3.4.2）。
8. 决策卡：当前工作离不开人的决定时用 `decision_card`，否则 `graph_propose` 一张待决就去做别的；问题问在项目经理这一层，带选项与后果，不问代码层面的事，能查到的事不问人。
9. 汇报：讲人话，结论先行；细度以最近一次 `design_review` 结果里的 `depth` 为准。
10. 人若开着 `/plan`：`exit_plan_mode` 只离开计划模式，图上什么都不放行。

长度上限 9000 字符，单测钉住。

#### 3.1.4 写入规则 `main-agent-no-write`

`src/guard/main-agent.ts`，用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`，`src/guard/rules.ts`）。

判写：

- 调用名先经 `toNativeTool(dialectService(ctx, warn), payload.name, warn)` 换成原生名（split §4.2.2、§4.7；worktree 第 2 步的 guard 与图文件门禁就是这样调用的，`src/guard/graph-files.ts`:119），所以 GLM 的 `Write`、`Edit`、`Bash` 与原生名一样认。纠偏里的工具名同 guard 一样经 `face`（`dialectNames(...) ?? NATIVE_FACE`）随路由写。
- 文件工具：`write`、`edit` 的 `file_path`，`str_replace_editor` 除 `view` 以外的 `path`。今天这段逻辑是 `src/guard/graph-files.ts` 私有的 `writeTarget`，挪进 `rules.ts` 导出为 `fileWriteTarget`，`graph-files.ts` 改用它，行为不变。
- shell：`shellCommandOf` 加 `shellWrites`，与 `fileToolsOnly` 同一个引号感知的判断；把 `fileToolsOnly.detect` 里的两行抽成导出的 `shellWriteOf(call)`，两边共用。判写因此继承 file-tools-only 的启发式与它的缺口（解释器、改工作树的 git 子命令、包脚本，§10）。
- 读、图工具、记忆工具、`todo_write`、`subagent` 都不是写文件，放行。

安装：`installMainAgentRules(ctx, deps)` 在 `ctx.on('tools/pre-execute', listener, { prepend: true })`（tools:3320–3353）上装一个监听器。`deps` 由设计行传入：`isMainAgent(agent)`、`agents()`（调用时 `ctx.get('agents')`）、`goalStageOf(root)`（§3.3.3）、`journal`（违规流水）、`health`（会话健康上报）。`src/guard/main-agent.ts` 因此不导入 `src/design/`，依赖方向是设计目录 → guard 目录；派发链的走法 `dispatchRoot` 在这个文件里（§3.3.3）。带 `parent` 的传输层子调用放行（`docs/DESIGN.md` §2.4a，与 guard 行和图文件门禁一致）。监听器先判这次调用是不是写文件，不是就直接 `next()`；调用方没有会话（`payload.agent?.session` 为 `undefined`，薄适配层 `AgentLike.session` 可选）时也直接 `next()`；是写文件时：调用方会话头不带 `origin: 'subagent'` 且是主 Agent，判本规则；带 `origin: 'subagent'` 时按派发链找到根，根是主 Agent 就判 `design-before-release`（§3.3.3）；其余 `next()`。

先后：`prepend` 使本监听器排在 guard 行（普通注册）之外，主 Agent 用 shell 写文件时拿到的是「派发」这条正路，而不是 file-tools-only 的「改用 Write 或 Edit」，否则模型照做后还要再被拦一次（同 `docs/ORCHESTRATION.md` §2.7 图文件门禁的理由）。图文件门禁也是 `prepend`，两者谁在外层取决于行的加载次序；两条纠偏都把图工具列为图的正路，所以哪个先判都对。

纠偏（四段式，`docs/ORCHESTRATION.md` §6.1；英文，同其他规则）：

- 事实：`You tried to write "<目标>".`，或 `You tried to change files through the shell: "<命令>" (<describeWrite>).`
- 越界：`You are the main agent of this session (/wish): the main agent plans, dispatches and accepts work; it never writes files itself.`
- 正路：`Record designs and decisions on the project graph with the graph tools. For a change to files, describe it as a task node (graph_propose, type task, with acceptance), graph_focus it, and hand it to a subagent with the subagent tool; subagents write only once the goal of your focus is released, so present the design with design_review first.`
- 例外：`If the human wants this session to edit files directly, they leave main-agent mode with /wish off.`

记录：每次拒绝写一条 `ViolationRecord`（`{at, rule, tool, agentId, sessionId, correction}`，与 guard 同形，`tool` 是模型调用时的名字）到项目目录的 `audit/violations.jsonl`，经 `rowJournal` 与 `dataHomes(ctx, config.home)`（`src/memory/audit.ts`，`src/shared/data-home.ts`）。

路由：不分路由（G3）。规则与正路同在设计行，行禁用时没有 `/wish`，也就没有主 Agent 与这条规则。声明写在身份节里（第 3 条），只有主 Agent 读到；不进 `glm:guard`。

### 3.2 m3-2 许愿访谈八步与需求卡

#### 3.2.1 八步落到图上

| 步 | 对人的问题（`docs/ORCHESTRATION.md` §4.2 原文） | 主 Agent 用的工具 | 图上的产出 |
| --- | --- | --- | --- |
| 1 | 你想要什么 | 来自 `/wish` 的原话；没有原话时用 `ask_user_question` 问 | `graph_propose` 目标：`stage: wish`，正文 `需求：<原话>`；随后 `graph_focus` |
| 2 | 做成以后，你的日子会有什么不一样 | `ask_user_question` | `graph_edit` 自己的提议：正文 `问题：`、`给谁：`；`stage` 改为 `interview` |
| 3 | 你会怎么检查它真的做成了 | 同上 | `acceptance` |
| 4 | 有没有你明确不想要的（先猜几个供挑选） | 同上，可多选 | `nonGoals` |
| 5 | 有没有不能改、不能花、不能冒的险 | 同上 | 正文 `约束：`（没有就写 `无`） |
| 6 | 假如最后没做成，最可能是因为什么（先猜三个） | 同上，可多选 | `graph_propose` 风险节点挂在目标下，一条风险一个节点 |
| 7 | 两三条路，各一句利弊，加上推荐 | `decision_card`（§3.5.1） | 目标下的待决，人选了即由人拍板 |
| 8 | 看长出来的骨架，哪里不对就点哪里 | `design_review`（§3.4） | 确认后目标转为已批准，`stage` 为 `design` |

引擎依据与要改的一处：LLM 提议的目标为 `proposed`（没有父节点的提议，`initialStatus`）；风险与待决挂在任何未关闭的节点下直接为 `approved`，提议状态的目标也算未关闭（`OPEN_PARENT_TYPES` 与 `OPEN_STATUSES`）。第 2–5 步要改的是目标本身，今天的 `planEdit` 在非特权写入时先判 `if (node.type === 'goal') return failure('forbidden', …cannot edit the goal…)`（`src/graph/engine.ts`:438），这一判断在计算 `ownProposal`（:440–441）之前，与目标的状态无关；`docs/ORCHESTRATION.md` §2.9 `edit` 行写的也是「不能改目标节点」，split F15 引的是同一条。所以 §8 第 1 步（D5 选 A）改引擎：

```ts
// src/graph/engine.ts planEdit，非特权分支
const first = node.history[0]
const ownProposal = node.status === 'proposed' && first?.op === 'propose' && first.actor === actor
if (node.type === 'goal' && !ownProposal) return failure('forbidden', `${actor} cannot edit the goal`, …)   // 提示文字不变
const denied = ownProposal ? undefined : fields.find(field => !LLM_EDITABLE.has(field))
```

- 只放开 `edit`。`link`/`unlink` 对目标的拒绝（`engine.ts`:354）不变：访谈与设计都不给目标加连线（规划的 `source` 连线从规划节点指向设计决策，待决的来源连线从待决指出）。
- 放开之后，自己提议、仍为 `proposed` 的目标可以改全部字段，含 `acceptance`、`nonGoals`、`stage`、`body`、`title`；`decider` 对目标不适用。人批准之后（`approved` 起）照旧 `forbidden`，`harness` 也一样（`first.actor` 必须是同一身份）。
- 理由：「目标、验收条件与非目标是人的」保护的是人采纳了的东西；一个还没被人批准的目标就是 LLM 的草稿，同类的节点（决策、特性、任务）今天已经按 `ownProposal` 放开。人在确认卡上看到整张需求卡，再一次批准。
- 同批改 `src/graph/tools.ts` `graph_edit` 的说明（`the goal` 改为 `an adopted goal`，并写明「your own goal proposal while it waits」）、`docs/ORCHESTRATION.md` §2.9 `edit` 行（「不能改目标节点，自己提议且仍为 `proposed` 的目标除外」）与 §15「LLM 不能改任何节点的验收条件与非目标」一行（例外里加「包括自己提议的目标」）。
- 测试（`tests/graph-engine.spec.ts`）：`llm` 提议一个目标后 `edit` 它的 `acceptance`、`nonGoals`、`stage` 成功，历史记 `llm`；同一目标经 `human` 批准后 `edit acceptance` 为 `forbidden`；`harness` 对 `llm` 提议的目标 `edit` 为 `forbidden`；`llm` 对自己提议的目标 `link` 仍为 `forbidden`。已有的「目标、验收条件与非目标被拒」三个用例（`graph-engine.spec.ts`:236–243、`graph-tools.spec.ts`:194–196、`graph-cli.spec.ts`:137）用的是已批准的 `goal-1`，不改且仍通过。

所以访谈全程不需要转述，人的确认在第 8 步一次给出。D5 若选 B（引擎不改），访谈产出的落点按 §3.2.4 改写。

面板经 `remote.workspaceFiles` 的变更流跟进节点文件（`docs/ORCHESTRATION.md` §2.10），每写一次，「图」视图里就多一个虚线框或一段正文，这就是「每答一题，项目图上亮起对应的一格」。

问题的形状（2–4 个选项、带推荐）在 M3 只写进身份文本，不设门禁；`ask_user_question` 调用里带选项的比例作为标定指标记下（`docs/ORCHESTRATION.md` §4.2 的度量）。理由见 §11。

#### 3.2.2 需求卡

需求卡不另存，是 `src/graph/stage.ts` 从图上渲染出来的 8 项：

| 项 | 落点 | 齐的判据 |
| --- | --- | --- |
| 需求 | 目标正文 `需求：` | 非空 |
| 问题 | 目标正文 `问题：` | 非空 |
| 给谁 | 目标正文 `给谁：` | 非空 |
| 约束 | 目标正文 `约束：` | 非空（`无` 也算） |
| 成功 | 目标 `acceptance` | 至少 1 条 |
| 非目标 | 目标 `nonGoals` | 至少 1 条 |
| 风险 | 目标子树里的风险节点 | 至少 1 个，未废弃、未被取代 |
| 岔路 | 目标子树里的待决 | 至少 1 个已拍板（`status: done` 且有 `decision`），且它最后一次 `decide` 的历史 `actor` 为 `human` 或带 `relay`（同 `engine.ts` `decidedByHuman` 的判法，但只看最后一次）。决定者为 agent、由 LLM 自己拍的待决不算，`hint`「用 decision_card 问人」 |

正文标签的解析 `labeledSections(body, labels)`：行首是标签加全角 `：` 或半角 `:` 的一行开始一节，一节到下一个已知标签行或正文结束为止，值去掉首尾空白；同一标签出现多次时只认第一次；第一个标签之前的文字不属于任何一节。规则是确定的，L2 钉住。

渲染出的 Markdown 与 `docs/ORCHESTRATION.md` §4.2 的示例同形（需求、问题、给谁、约束、成功、非目标、风险、岔路各一行或一个列表），用在确认卡的正文里；面板的节点详情直接显示正文，标签行就是需求卡的前四项。

#### 3.2.3 确认卡

`design_review` 在有效阶段为 `wish` 或 `interview` 时走这一支（工具的共通部分见 §3.4.4）：

- 门禁：需求卡 8 项都齐，且目标没有 `supersedes` 连线（`GateItem` 键 `goal:supersedes`；理由见 §3.3.2 第 6 条：批准带这种连线的节点会连带取代卡上没有列出的节点）。不齐就拒绝，错误码 `gate_unmet`，`message` 列出缺的项，`hint` 写出每项该问哪一步、写到哪里；`supersedes` 一项的 `hint`「取代旧节点要人在面板上批准，或请人在对话里说、带原话转述」。卡片不出现。
- 卡片（`userQuestions.ask` 的一个问题）：`id: 'hourness-confirm'`，`header: '需求卡'`，`question: '骨架这样对吗？对就点确认；不对就在下面的输入框里写哪里不对。'`，`detail` 依次是主 Agent 的 `summary`、渲染出的需求卡、一行「确认后这个目标由虚线变实线」；选项 `确认，进入设计`（说明「目标由提议变为已批准，开始做方案」）与 `要改`（说明「只点这一项时主 Agent 会再问你哪里不对；想直接说，就在输入框里写」）。两个选项都不带 `(Recommended)`，客户端不预选（client-ui-user-questions client.js:783–795 只预选推荐项）。
- 回答的形状：DSH 客户端对单选问题只交「选了一项」或「写了文字」之一。`choose` 选中时把 `custom` 清空（client-ui-user-questions client.js:907–922），单选时一打字就把 `selected` 清空（`draftCustom`，:980–987），提交时 `custom` 非空就丢掉 `selected`（:943–948）。所以确认卡没有「选项加附言」这种回答，表里只有下面几种。
- 回答：

| 回答 | 以人的身份写图 | 返回 `outcome` |
| --- | --- | --- |
| 选了「确认，进入设计」 | 目标仍是提议时 `approve`；然后 `edit` 设 `stage: 'design'`；两条的 `reason` 都是「人在需求卡确认卡上点了「确认，进入设计」（design_review <callId>）」 | `confirmed`，`stage: 'design'` |
| 选了「要改」 | 在目标上批注「人在需求卡确认卡上点了「要改」（没有写哪里不对）（design_review <callId>）」 | `changes`，`message`：用 `ask_user_question` 问人哪里不对，改完再 `design_review` |
| 只写了文字 | 在目标上批注「人在需求卡确认卡上没有选项，写道：<文字>（design_review <callId>）」 | `changes`，`text` |
| 关掉卡片或跳过 | 不写 | `dismissed`，并 `exec.concludeTurn()`，回合结束等人说话（同 plan-mode:284–286） |

批注的说法由 `src/design/cards.ts` 的 `answerPhrase` 统一生成（§3.4.2），写的是人实际做的动作：点了哪个选项，或没有选项、写了什么。

目标已在面板上被人批准、阶段仍是 `interview` 时，这一支照样出卡；确认时跳过 `approve`，只改阶段。写入的次序与修订号：拿到回答后按 §3.4.4「回答之后」重新读图；`approve` 带重新读到的目标修订号，`edit` 带 `approve` 结果里的 `rev`（`ApplyResult.rev`）。`edit` 得到 `stale_revision`（两次写入之间别人改了目标，毫秒级的窗口）时重新读图再试一次，目标仍已批准、阶段仍不是 `design` 才写；再失败就返回 `confirmed`、`stage` 为当时的阶段，`message`「目标已批准，阶段没能改为 design（<错误码>）：再调用一次 design_review，人会看到同一张确认卡」。

#### 3.2.4 D5 选 B（引擎不改）时的落点

人若不同意改引擎，访谈产出放在主 Agent 自己提议的一个子节点上，确认时再以人的身份搬进目标。改动只限下面几处，其余设计不变：

- 访谈第 1 步：`graph_propose` 目标，正文 `需求：<原话>`，`stage: wish`；随后 `graph_propose` 一个决策节点 `{type: 'decision', parent: <目标>, title: '需求卡'}`（挂在目标下的决策为 `proposed`，是自己的开放提议，能改全部字段）。
- 访谈第 2–5 步：`graph_edit` 这个「需求卡」节点：正文的 `问题：`、`给谁：`、`约束：`，`acceptance`，`nonGoals`。目标的 `stage` 在确认之前不再改动，`wish` 与 `interview` 由需求卡节点是否存在推出（`effectiveStage` 改为 `effectiveStage(graph, goal)`，对提议目标：没有需求卡节点为 `wish`，有则为 `interview`；已批准与已关闭的目标同 §2.4 的表）。
- `requirementCard(graph, goal)`：目标为 `proposed` 时，「需求」读目标正文，其余四个标签、成功与非目标读需求卡节点；目标已批准时全部读目标。需求卡节点的认法：目标的直属子节点里 `type: decision`、`title` 恰为 `需求卡`、状态为 `proposed` 的节点；多于一个时门禁项 `card:duplicate` 不齐（`hint`「只留一个需求卡节点」）。
- 确认卡的「确认，进入设计」：以人的身份依次 `approve` 目标；`edit` 目标 `{body: 需求 + 三个标签, acceptance, nonGoals, stage: 'design'}`；`reject` 需求卡节点，`reason`「内容已写进目标（design_review <callId>）」。三条写入的修订号规则同上；第二、三条失败时按同样的重试，仍失败则 `message` 写明哪一条没写成。
- 放行集合不含已被 `reject` 的需求卡节点（它已是 `dropped`）。§9.2 的验收脚本只看最终的目标，不变。
- §8 第 1 步不做；第 8 步的测试改为按这两处落点写。

### 3.3 m3-3 方案五栏与设计门禁

#### 3.3.1 五栏落在哪

设计决策是目标子树里的决策节点（`type: decision`，主 Agent 提议，状态 `proposed`，验证状态 `unverified`）。它通常以 `source` 连线指向第 7 步拍板的待决。五栏：

| 栏 | 落点 | 齐的判据 |
| --- | --- | --- |
| 理由 | 决策正文 `理由：` | 非空 |
| 架构 | 决策正文 `架构：` 与 `查过的现成方案：` | 两节都非空（「先搜再造」的设计门禁，`docs/ORCHESTRATION.md` §10.2） |
| 目标 | 决策 `acceptance` | 至少 1 条 |
| 规划 | 目标子树里以 `source` 连线指向这个决策的节点 | 至少 1 个，未废弃、未被取代 |
| 非目标 | 决策 `nonGoals` | 至少 1 条 |

决策是主 Agent 自己的提议，五栏它都能写（`ownProposal`）。规划节点（特性、任务）挂在目标或特性下，LLM 提议的为 `proposed`（任务只有挂在已批准或进行中的特性、任务下才直接批准，`initialStatus`），所以放行之前整个方案都是虚线。

#### 3.3.2 放行门禁

`releaseGate(graph, goal)`，全部成立才出五键卡：

1. 目标已批准，有效阶段为 `design`。
2. 放行集合不空：目标子树里除目标以外的全部 `proposed` 节点，按深度、再按创建时间（首条历史）、再按 id 排序，父节点在子节点之前。
3. 放行集合里至少有一个决策，每个决策五栏都齐。
4. 放行集合里每个任务至少有 1 条验收条件。
5. 目标子树里没有未拍板的待决（状态 `approved` 或 `doing`，不论决定者）。
6. 放行集合里没有带 `supersedes` 连线的节点（`GateItem` 键 `<id>:supersedes`）。理由：带这种连线的提议被批准时，引擎的 `approve` 分支调用 `supersedeTargets`，把连线指向的已批准、进行中或已完成节点改为 `superseded`（`engine.ts`:345、270–279），这些节点可以在目标子树之外（例如本仓库的根目标或别的决策），而 `superseded` 在 `TRANSITIONS` 里没有出路（:106–113，`superseded: []` 在 :112），引擎内不能撤回；卡上只列放行集合本身，人看不到会被连带取代的节点。`hint`「取代旧节点要人在面板上批准，或请人在对话里说、带原话转述；或去掉这条连线、把它改成一张待决」。不选的做法是在卡上另列「批准后会被取代的节点」并核对它们的修订号：多一类要人看懂的后果，而取代本来就是引擎规定只由人决定的事（§2.9 引擎规则细则），放在面板上做更清楚。

不齐时 `gate_unmet`，`message` 按决策列出缺的栏与其余缺项，卡片不出现。这就是 `docs/ORCHESTRATION.md` §4.3「五栏缺任何一栏，不能离开设计阶段」与 §4.5「五栏缺项直接拒绝并给正路，审阅卡不出现」。

#### 3.3.3 设计期只读：`design-before-release`

计划模式不拦工具（`dsh-plan-mode/README.md`「Guidance, not enforcement」）；主 Agent 自己由 `main-agent-no-write` 管着，所以设计期还要管的是它派出去的各层 agent：放行之前什么都不建。

为什么不能只看一层父子：派发深度不是固定的。`subagent`、`subagent_fork` 把设置里的 `maxDepth` 传给服务（`docs/ORCHESTRATION.md`:499），默认 1（subagent:2979），桌面版设置页有「最大递归深度」一项可以调大（client-ui-settings-subagent client.js:63、134）；服务只检查调用方传进来的 `maxDepth`（subagent:279–283、1396–1399），别的插件不传就没有上限。深度大于 1 时，子 agent 写文件被拒后可以再派一个孙 agent 去写：孙 agent 的 `parentSession` 指向子 agent，只看一层父子就认不出它属于主 Agent。所以规则按派发链找到根。

- 派发链的根 `dispatchRoot(agents, caller)`（`src/guard/main-agent.ts`）：

```ts
type RootLookup =
  | { readonly kind: 'self' }                              // 调用方会话头不带 origin: 'subagent'，自己就是根
  | { readonly kind: 'root', readonly root: LiveAgentLike } // 往上找到了根，调用方是它的后代
  | { readonly kind: 'unknown', readonly why: string }      // 判不出
/** 有会话的调用方。AgentLike.session 可选，监听器在它为 undefined 时直接 next()，不调用本函数（§3.1.4） */
interface Dispatched { readonly id: string, readonly session: SessionLike }
function dispatchRoot(agents: Pick<AgentsService, 'get'>, caller: Dispatched): RootLookup {
  if (caller.session.header.origin !== 'subagent') return { kind: 'self' }
  const seen = new Set<string>([caller.id])
  let header = caller.session.header
  for (;;) {
    const up = header.parentSession
    if (up === undefined) return { kind: 'unknown', why: '子会话头没有 parentSession' }
    if (seen.has(up)) return { kind: 'unknown', why: `派发链成环（${up}）` }
    const root = agents.get(up)                            // agent:596；agent id 与会话 id 相同
    if (root === undefined) return { kind: 'unknown', why: `派发链上的 ${up} 不活` }
    seen.add(up)
    if (root.session.header.origin !== 'subagent') return { kind: 'root', root }
    header = root.session.header
  }
}
```

  `root` 在每条返回路径上都已收窄为 `LiveAgentLike`，`for (;;)` 没有出口，函数末尾不可达，strict 加 `exactOptionalPropertyTypes` 下不需要非空断言。监听器的调用写作 `dispatchRoot(agents, { id: agent.id, session })`，`session` 是已判过不为 `undefined` 的 `payload.agent.session`。

  每一跳都要是一个不同的活 agent，所以循环次数不超过活 agent 的个数，不需要另设跳数上限。不设固定上限的理由：`maxDepth` 可以设到 `Number.MAX_SAFE_INTEGER`（subagent:2979），固定上限会让合法的深链按「判不出」放行。委派子会话的头由 subagent:346–356 的 `childSessionMeta` 写：`parentSession: parentHeader.id`、`origin: 'subagent'`、`delegationDepth`，每一层都一样，所以孙 agent、`subagent_fork` 的子会话与 agent-team 的队友（经 `subagents.startActivation` 创建，`parentSession` 指向根，experimental-agent-team index.js:1032、873、985）都按同一条链走〔队友的会话头同形是推断，L2 按 `childSessionMeta` 的形状构造〕。用户 fork 的会话只带 `parentSession`、不带 `origin`（`src/shared/dsh-min.ts` `SessionLike.header` 的注释），链在它那里停下，它自己就是根。
- 适用：`dispatchRoot` 为 `root` 且 `isMainAgent(root)` 为真。根不是主 Agent 时不适用，直接 `next()`；为 `self` 时由 `main-agent-no-write` 判（§3.1.4）。
- 根的当前目标：图行服务的 `focusOf(root.session)`（§3.6.1）给焦点，读图（`openEngine(dir).load()`），`goal = goalOf(graph, focus)`，`stage = effectiveStage(goal)`（§2.4）。只有写调用才走派发链与读图。
- 判定（区分「判不出」与「没有目标」）：

| 根（主 Agent）的情况 | 结果 | 越界一句 |
| --- | --- | --- |
| 有效阶段为 `wish`、`interview`、`design`（含提议状态的目标，不论 `stage` 写的是什么） | 拒绝 | `You were dispatched (directly or through other subagents) by the main agent of a design loop at stage <stage> (goal <id>): nothing is built before the human releases the design.` |
| 没有焦点；焦点节点不在图里；焦点链上没有目标；目标已关闭（`done`、`dropped`、`superseded`） | 拒绝 | `You were dispatched (directly or through other subagents) by the main agent, and it has no open goal in focus, so nothing it plans is released yet.` |
| 有效阶段为 `release` 或之后（`decompose`、`execute`、`merge`、`operate`） | 放行 | — |
| 目标已批准、没有 `stage`（人不要它走设计循环，§2.4） | 放行 | — |
| 取不到 `agents` 服务；`dispatchRoot` 为 `unknown`（链上有不活的 agent、子会话头没有 `parentSession`、成环）；图行服务不在；读图抛错；判定器抛错 | 放行（fail-open），行健康记一条部分生效与原因（含 `why`） | — |

- 判写与 `main-agent-no-write` 相同（§3.1.4）。
- 纠偏：事实同上；越界按上表；正路 `Read, search and report back; do not hand the write to another subagent, the same rule covers every agent the main agent's dispatch chain reaches. The main agent presents the design with design_review; once the goal of its focus is released, the work can be dispatched again. If the main agent has no goal in focus, it focuses the goal or task this work belongs to first.`；例外 `If a write is needed to answer a design question (a spike), report back and let the main agent ask the human with a decision card.`
- 失败一类保留 fail-open，与 guard 的判定器抛错按放行一致（`evaluate` 的 fail-open）：这一类是 harness 自己判不出，拒绝会把与设计循环无关的工作也挡住；「没有目标」则是判得出的状态，按 m3-3 验收第 2 条与 §2.2 拒绝。链上一层不活的情形什么时候出现，读源码没有定下来〔推断：子 agent 比它的父 agent 活得久时才会有〕；出现时按「判不出」放行，原因进健康表，L2 有这一例。

规则按派发链找到根 agent 判定，不依赖 `maxDepth` 的取值。

#### 3.3.4 为什么不用计划模式（D2）

ROADMAP 3.3 写「五栏门禁挂在 `exit_plan_mode` 的 `tools/pre-execute`」。读 rc.3 后不这样做：

1. `exit_plan_mode` 只在计划模式里能调用，否则抛错（plan-mode:255）。进入计划模式要人输入 `/plan`，或由宿主插件调用 `planMode.set(agent, true)`；桌面版把 `planMode` 隔离在 `preset-standard` 的 `planning` 组里（`dsh-web-app/presets/standard.patch.yml`:45–49），宿主插件要经 `agentPresets.serviceFor(agent, 'planMode')`（agent-preset-registry:725–728，核实清单第 2 项，未核实）；headless 组合里计划模式在顶层（`dsh-base/cordis.patch.yml`:332）。两种组合两条路径。
2. 审阅卡只有 Approve 与 Keep planning 两个选项（plan-mode:261–281）；客户端的 plan-review 呈现只接管不超过两个选项的问题（client-ui-user-questions client.js:42–61）。五键要另出一张卡，人每轮要批两次。
3. 放行要批准的是图上的节点；`exit_plan_mode` 审的是一段 Markdown，批准之后还要再把它对回节点。
4. 计划模式的提示词要求模型用 `exit_plan_mode` 提交方案、「对话里的同意不算批准」（`dsh-base/cordis.patch.yml`:336–346），与「每轮方案汇报附五键卡」并存时，模型面对两套说法。

所以门禁与审阅都放在本项目的 `design_review` 里，经 `userQuestions.ask` 出卡（借用 user-questions；`docs/ORCHESTRATION.md` §14 表里放行一行随之改写）。人自己开了 `/plan` 时，计划模式照 DSH 的样子工作，身份文本写明它不放行任何节点（§3.1.3 第 10 条）。人若选 D2 的 A，改动是：设计阶段开始时进入计划模式（先过核实清单第 2 项），门禁移到 `exit_plan_mode` 的 `tools/pre-execute`，从会话事件里认出它批准的结果再执行 §3.4.2 的放行写入；五键卡保留，但不再带「批准」。

### 3.4 m3-4 五键与 `design_review`

#### 3.4.1 五键卡

有效阶段为 `design` 且放行门禁成立时，一次 `ask` 带两个问题。理由：DSH 客户端的单选问题只交「选了一项」或「写了文字」之一（§3.2.3 的「回答的形状」），一个问题装不下 `docs/ORCHESTRATION.md` §4.4〔定案〕的「拒绝（带理由）：理由随拒绝返回」。服务的问题 schema 允许一次多个问题、问题可以不带选项（user-questions:33–51：`options` 可省，`questions` 至少 1 个）；客户端选中第一问的选项后自动翻到下一问（client-ui-user-questions client.js:907–922，单选且不是最后一问时 `index + 1`；下同），不带选项的问题显示为整块文本框（`hasOptions` 为假，:835、1157–1160），每一问都有「跳过」（`skipQuestion`，:994–1005、1216–1220），跳过的问题回答为 `{id, selected: []}`（:939–942）。

第一问：

- `id: 'hourness-five-keys'`，`header: '方案'`，`question: '这个方案怎么处理？'`，单选。
- `detail`（Markdown，客户端用 `MarkdownText` 渲染，client-ui-user-questions client.js:1078–1083）：主 Agent 的 `summary`；每个设计决策的五栏；「批准后由虚线变实线的节点」列出放行集合（类型、标题、id）；目标下的风险。超过 16000 字符时截断，末尾一行「完整内容在项目图面板里」。
- 选项：`FIVE_KEYS` 的五个键（从 `src/workflow/decisions.ts` 迁到 `src/design/cards.ts`）。键名不变（批准、拒绝（带理由）、补充、讲细点、说重点，§4.4 定案的是键名）。说明在卡上显示给人，改为 M3 实际会做的事：

  | 键 | 卡上的说明（M3） | 今天 `decisions.ts`:29–33 的说明 |
  | --- | --- | --- |
  | 批准 | 卡上列出的节点由虚线变实线，阶段改为放行；分解与派发是下一步 | 按方案放行，进入完全自主执行。 |
  | 拒绝（带理由） | 理由写在下一问里，随拒绝返回，供重新设计 | 理由会随拒绝一起返回，供重新设计。 |
  | 补充 | 补充的上下文或约束写在下一问里，主 Agent 补进方案后重提 | 补充上下文或约束后重提方案。 |
  | 讲细点 | 下一轮汇报展开理由、证据与岔路对比 | 汇报细度上调一档：展开理由、证据与岔路对比，并记入画像。 |
  | 说重点 | 下一轮汇报只留结论、影响与要拍板的岔路 | 汇报细度下调一档：只留结论、影响与要拍板的岔路，并记入画像。 |

  「进入完全自主执行」属于 M7（分解与派发），「记入画像」属于 M5；那两步接上时再改回对应的说法（§11）。`docs/ORCHESTRATION.md` §4.4 的定案表写的是整条路走通之后的含义，不改。
- 五个选项都不带 `(Recommended)`，客户端不预选；五个选项在 plan-review 呈现之外，走通用问题流（client.js:42–61 的条件不成立）。

第二问：`id: 'hourness-five-keys-note'`，`header: '理由或补充'`，`question: '拒绝的理由，或要补充的上下文与约束（不用写就点「跳过」）'`，不带选项。

代价：不写字的回答（批准、讲细点、说重点）要点两下：点键，翻到第二问后点「跳过」。第二问为空时「提交」不可点（client.js:1221–1223 的 `!answered(draft)`），最后一问的「跳过」直接提交（`skipQuestion` 在最后一问调 `submitDrafts`，:994–1005）。第二问的问句写明这一点；L4 看人能不能一眼找到「跳过」（§9.3 第 5 项）。

打开卡片时记下放行集合与每个节点的修订号。

#### 3.4.2 回答

解析（`src/design/cards.ts` 的 `parseFiveKeys(answers)`）：键取第一问的 `selected[0]`，必须恰为五个键名之一，否则视为没有选键；文字取第二问的 `custom`。人也可能在第一问的输入行里直接打字（单选时这会清空选项，client.js:980–987），这时第一问只有 `custom`：键为空，文字取它；两问都有 `custom` 时按先后用空行连起来。每段文字去掉首尾空白，超过 2000 字符截断。答案里缺第二问（形状不对）时当作没有文字，告警一次。

| 键 | 文字 | 以人的身份写图 | `outcome` | 结果里告诉模型 |
| --- | --- | --- | --- | --- |
| 批准 | 无 | 按记下的修订号逐个 `approve` 放行集合（`reason`「人在五键卡上点了「批准」（design_review <callId>）」）；全部成功后 `edit` 目标 `stage: 'release'` | `approve`，`approved`、`skipped`、`stage` | 已放行；向人汇报，分解与派发是下一步 |
| 批准 | 有 | 同上一行，然后在目标上批注「人在五键卡上点了「批准」并写道：<文字>（design_review <callId>）」 | 同上，另带 `text` | 同上，并照文字处理 |
| 拒绝（带理由） | 有 | 在目标上批注「人在五键卡上点了「拒绝」：<文字>（design_review <callId>）」 | `reject`，`text` | 按理由重新设计，再 `design_review` |
| 拒绝（带理由） | 无 | 批注「人在五键卡上点了「拒绝」（没有写理由）（design_review <callId>）」 | `reject` | 用 `ask_user_question` 问人拒绝的理由，再重新设计 |
| 补充 | 有 | 批注「人在五键卡上点了「补充」：<文字>（design_review <callId>）」 | `augment`，`text` | 把补充写进方案，再 `design_review` |
| 补充 | 无 | 批注「人在五键卡上点了「补充」（没有写补充什么）（design_review <callId>）」 | `augment` | 用 `ask_user_question` 问人要补充什么 |
| 讲细点、说重点 | 无 | 不写 | `more-detail` 或 `to-the-point`，`depth` | 按新的细度重写 `summary` 再提 |
| 讲细点、说重点 | 有 | 调细度同上一行，并在目标上批注「人在五键卡上点了「<键>」并写道：<文字>（design_review <callId>）」 | 同上，另带 `text` | 同上，并照文字处理 |
| 没有选键 | 有 | 批注「人在五键卡上没有选键，写道：<文字>（design_review <callId>）」 | `augment`，`text` | 把文字当作补充写进方案，再 `design_review` |
| 没有选键 | 无（两问都跳过） | 不写 | `dismissed`，`concludeTurn` | 等人说话 |
| 关掉卡片 | — | 不写 | `dismissed`，`concludeTurn` | 等人说话 |

「没有选键、写了文字」按补充处理（`outcome: 'augment'`），这是对模型的指引；写进图的批注照实记成「没有选键」，不冒充人点了「补充」（`docs/CHARTER.md` §7.1 条款 11 的留痕要准确）。批注里描述回答的那一段由 `answerPhrase(card, parsed)` 统一生成，三张卡共用：点了「<键或选项>」；点了「<键>」并写道 <文字>（或「：<文字>」，拒绝与补充）；点了「<键>」（没有写 <理由/补充什么>）；没有选键（选项），写道 <文字>。键在批注里用简称，「拒绝（带理由）」写作「拒绝」，其余键与选项照原样写。§3.4.4「回答之后」那张表里阶段变了时的批注也用它。

汇报细度：`concise`、`balanced`、`detailed` 三档（与 `src/glm-prompt/persona.ts` 的档位同名，不导入 GLM 包）。当前档取会话可见历史里最近一次带 `depth` 的成功 `design_review` 结果，没有时为 `balanced`（压缩把它移出可见历史后回到 `balanced`，与其他从历史推出的状态一致）；讲细点上调一档，说重点下调一档，到头不再变。M3 不写画像，「写入画像」随 M5 的汇报细度闭环（`docs/ORCHESTRATION.md` §8.5），信号就在会话日志的工具结果里。

部分失败：某个节点 `approve` 失败（打开卡片之后被改过，引擎报 `stale_revision`；已不是提议，`bad_transition`；或别的拒绝），它进 `skipped`（id 与错误码），其余照批。批完之后重新读图：目标子树里仍有 `proposed` 节点（跳过的，或卡片打开期间新提的、卡上没有的）时不改阶段，`stage` 仍为 `design`，`message` 列出这些节点，告诉模型重读后再 `design_review`。人批准的是他看到的那一版：改过的节点与卡上没有的节点都不替他批，`release` 之下也不留提议（§9.2 第 4 条）。阶段改为 `release` 的 `edit` 带重新读到的目标修订号，`stale_revision` 时同 §3.2.3 重试一次。

#### 3.4.3 卡片回答以人的身份写图（D3）

确认卡、五键卡与决策卡的回答由 harness 写进图，`actor` 为 `human`：

- 依据：这三张卡由宿主侧的工具体经 `userQuestions.ask` 发出，回答来自 user-questions 的应答链（user-questions:679–683），模型写不出回答；这与 `/graph-apply` 记为 `human` 的理由（只有人能发斜杠命令）同类。卡上展示的内容（需求卡、五栏、放行集合）由 harness 从图上渲染，模型只能加一段 `summary`。
- 留痕：每条写入的 `reason` 写明哪张卡、人点了什么、工具调用 id；会话日志里有工具调用与结果（结果带 `outcome` 与人的文字）。
- 不经引擎以外的路：写入一律 `openEngine(dir).apply('human', mutation)`，引擎的状态规则与证据要求照常；这个入口不需要改引擎（D5 的改动只涉及 LLM 对自己提议的目标的编辑，与 `human` 的写入无关）。
- 独立评审：这是新的人的身份入口，按 `docs/DEVELOPMENT.md` §1.1 归入「图引擎的权限与审计」，`src/design/human-writes.ts` 与三个工具体的写入部分要独立评审。

#### 3.4.4 `design_review` 工具

在全局注册（`tools.register`，tools:2974–2984），参数与输出 schema 在 rc.3 校验的子集内（`type`、`properties`、`required`、`additionalProperties`、`items`、`enum`、`const` 与注解，`docs/ORCHESTRATION.md` §2.10）。GLM 上常驻：名字在 `DESIGN_TOOL_NAMES` 里并加进 `ORCHESTRATION_RESIDENT_TOOLS`（split §2.6 的契约，§2.1）。

参数：`{id: string, summary: string}`，两者必填，不收别的字段。`summary` 是给人看的一段话，非空，最多 4000 字符。

检查顺序，第一条不成立就抛错（文本为 `{code, message, hint}` 的 JSON，同图工具的 `refuse`，rc.3 的结果带 `isError`）：

1. 调用方是主 Agent（`exec.agent`，tools:3227–3260），否则 `forbidden`，`hint`「只有主 Agent 能用；人用 /wish 开启」。
2. 参数合法，否则 `invalid`。
3. 本会话没有正在打开的卡片（行内存里按会话 id 记一个集合，`design_review` 与 `decision_card` 共用），否则 `busy`。
4. 图行服务在、图目录存在，否则 `not_found`。
5. 读图；有校验错误时 `graph_invalid`。
6. 节点存在、是目标且未关闭（`proposed`、`approved` 或 `doing`），否则 `not_found`、`invalid` 或 `bad_transition`。
7. 有效阶段为 `wish`、`interview` 或 `design`，否则 `bad_transition`（`message` 写当前阶段）。
8. 本阶段的门禁成立，否则 `gate_unmet`。
9. `ctx.get('userQuestions')` 在，否则 `unavailable`，`hint`「这个宿主没有卡片通道：请人在项目图面板里批准，或在对话里说，由你带原话转述」。
10. `ask({questions, agent: exec.agent, signal: exec.signal})`（user-questions:668；plan-mode:261 同样在工具体里调用）。确认卡与决策卡的 `questions` 是一个问题，五键卡是两个（§3.4.1）。

`ask` 的错误：`ASK_CANCELLED`（人关掉卡片，客户端以这个码拒绝，client-ui-user-questions client.js:420）按「关掉」处理；`ASK_ABORTED`（停止按钮等）原样抛出；`NO_PROVIDER` 转为 `unavailable`；`DELEGATED_CALLER`、`CALLER_NOT_LIVE`（user-questions:531–535）转为 `forbidden`；其余原样抛出。回答的解析：按问题 `id` 取 `answers` 里的项。单问的卡（确认卡、决策卡）得到三种回答之一：选了一项（`selected[0]` 恰为本卡选项的说法，含 `(Recommended)` 后缀，client.js:918、1090）、只写了文字（`selected` 为空、`custom` 非空）、跳过（两者皆空，client.js:939–942）。`selected` 里的说法不是本卡选项时当作没有选项，文字照取 `custom`。五键卡按 §3.4.2 的 `parseFiveKeys` 解析。

回答之后（`design_review` 与 `decision_card` 共用的前两步，第三步起各自按卡）：

1. 卸载检查：设计行持有 `disposed` 标志，在 `apply` 返回的卸载函数里置位（cordis 的 `_execute` 把插件回调返回的函数收进本行 fiber 的可清理项，cordis:1067–1074、1135–1143；各行今天都这样返回卸载函数）。行卸载只撤掉工具注册，不中止已在执行的工具体，计划模式为此在 `ask` 返回之后先查 `disposed`（plan-mode:150、167–169、290）。三个工具体同样先查：已卸载就不写图，抛错「设计行在卡片打开期间重新加载了：人的回答是 <选项与文字>，重新调用」。
2. 重新读图。读图抛错或图有校验错误时不写图，抛 `graph_invalid`，`hint`「图有校验错误，告诉人；人的回答是 <选项与文字>」。
3. `design_review` 按目标的当前状态：

| 当前状态 | 写图 | `outcome` |
| --- | --- | --- |
| 目标不在，或已关闭（`done`、`dropped`、`superseded`） | 不写 | `closed`，`message` 写明状态与人的回答 |
| 有效阶段与开卡时不同（例如人在面板上改了阶段） | 不按键执行写入；把人的回答批注在目标上（「人在<卡名>上<answerPhrase>；卡片打开期间阶段已从 <旧> 变为 <新>，没有按这次回答写图」） | 抛 `stale_revision`，`hint`「阶段在卡片打开期间变了：读图后重新 design_review」 |
| 有效阶段不变 | 按 §3.2.3、§3.4.2 的表写，修订号取重新读到的（五键卡的放行集合用开卡时记下的修订号，见 §3.4.2） | 按表 |

输出 schema：`{outcome: enum, message: string, text?: string, depth?: enum, stage?: string, approved?: string[], skipped?: [{id, code}]}`，`outcome` 取 `confirmed`、`changes`、`approve`、`reject`、`augment`、`more-detail`、`to-the-point`、`dismissed`、`closed`。`message` 是给模型的下一步（上面几张表的最后一列）。`render` 同图工具，输出 JSON 文本。

### 3.5 m3-5 决策卡（同步 / 异步）

#### 3.5.1 同步卡 `decision_card`

参数：`{parent, title, question, options: [{key, label, consequence}], recommend, why, sources?: string[]}`。`why` 是推荐的理由，非空，最多 2000 字符；其余字段的规则就是待决节点的规则（2–4 个选项、`key` 格式、`recommend` 是已有选项，`src/graph/format.ts`:368–376），由引擎校验，不在工具里另写一份。

步骤：

1. 检查调用方与忙碌，同 `design_review` 第 1–4 条。
2. 读图：父节点不存在或已关闭（不在 `proposed`、`approved`、`doing`）时，不写图、不出卡，抛 `invalid`，`hint`「挂在一个未关闭的节点下」。提议状态的待决不能拍板，而待决挂在未关闭的节点下才直接为 `approved`（`initialStatus` 的 `OPEN_PARENT_TYPES`），所以先查。
3. 以 `llm` 身份提议待决：`{op: 'propose', node: {type: 'question', parent, title, body: question + '\n\n推荐 <key>：' + why, options, recommend, edges: sources 各成一条 source 连线}, reason: '决策卡：在卡上问人'}`。引擎拒绝时把引擎的错误原样抛出（模型照 `hint` 改）。父节点恰好在这期间被关闭、待决成了提议时，不出卡，返回 `queued` 并在 `message` 里说明它在等人批准。
4. 出卡：`id: 'hourness-decision'`，`header: title`，`question`，`detail` 写推荐与理由、每个选项的后果、来源节点的标题，最后一行「关掉卡片也可以：这件事会留在项目图「需要你」里」；选项说法为 `<key> <label>`，推荐项排第一并加 ` (Recommended)`，说明为后果。客户端在初稿里预选推荐项（client-ui-user-questions client.js:783–795），人直接提交就是选了推荐项；人在输入行里打字会清掉选项（:980–987），所以「选项加附言」不是一种回答（§3.2.3 的「回答的形状」）。
5. 回答之后：先做 §3.4.4「回答之后」的第 1、2 步（卸载检查、重新读图），再按待决的当前状态处理。卡片可能开很久，期间待决可能被批注（`comment` 改变修订号，之后带旧 `rev` 的 `decide` 得到 `stale_revision`，`engine.ts` `planChange` 在 `decide` 前核对 `rev`，:334–337），也可能被人在面板上拍板（引擎允许对已完成的待决再拍，`done` → `done`，:366–379；同一选项再拍为 `bad_transition`，:374）。卡片的写入不能以人的身份悄悄推翻人刚在面板上的决定：

| 待决的当前状态 | 人在卡上 | 写图 | `outcome` |
| --- | --- | --- | --- |
| `approved` 或 `doing` | 选了一项 | 以人的身份 `decide`，`rev` 取重新读到的修订号，`reason`「人在决策卡上选了「<key> <label>」（decision_card <callId>）」 | `decided`，`id`、`option` |
| `approved` 或 `doing` | 只写了文字 | 在待决上批注「人在决策卡上没有选项，写道：<文字>（decision_card <callId>）」；待决留在队列 | `text`，`id`、`text` |
| `approved` 或 `doing` | 关掉、跳过，或没有卡片通道（`NO_PROVIDER`、`userQuestions` 不在） | 不写；待决留在人的决策队列 | `queued`，`id` |
| `done`（卡片打开期间已在面板上或经转述拍板） | 选了一项，或只写了文字 | 不 `decide`；在待决上批注「人在决策卡上<answerPhrase>（decision_card <callId>），此前已拍板 <图上的选项>」，`answerPhrase` 为「选了「<key>」」或「没有选项，写道：<文字>」 | `decided`，`option` 为图上的结果，`message` 写明两者是否一致，不一致时说「按图上的拍板继续；人若要改，会在面板上再拍」 |
| `done` | 关掉或跳过 | 不写 | `decided`，`option` 为图上的结果 |
| `dropped`、`superseded`，或节点不在 | 任意 | 不写 | `closed`，`id`，`message` 写明状态与人的回答 |

`decide` 或批注得到 `stale_revision`（重新读图与写入之间又有写入，毫秒级的窗口）时，重新读图、按上表再判一次；仍失败就抛引擎的错误，`hint` 带上人的回答。

已知的限制：人在面板上拍了这张待决之后，对话里的卡片仍开着，直到人回答或关掉它（工具体在 `ask` 上等待，宿主没有「这张待决已被拍板」的信号能中止它）；同时 `/graph-apply` 的回写（§3.5.2）会在下一步给主 Agent 一条 `glm-graph-decision` 消息。卡片的回答到来时按上表 `done` 一行处理，不会改拍板结果。自动收起卡片要在等待期间监视图（轮询节点文件，或让图面板行与设计行共享一个「已拍板」事件），M3 不做。

`queued` 不结束回合：这正是异步卡，主 Agent 转去做不依赖它的计划内工作（`docs/ORCHESTRATION.md` §4.6）；结果的 `message` 写明这一点，并说没有别的事可做时结束回合。同步与异步因此只差「当场有没有人答」，合为一种卡（§5「区别只在急不急」）。

输出 schema：`{outcome: 'decided' | 'text' | 'queued' | 'closed', id: string, option?: string, text?: string, message: string}`，`id` 是待决的节点 id（上面第 3 条提议后才有；第 2 条拒绝时工具抛错，没有输出）。`render` 同图工具，输出 JSON 文本。

不用 `user-approval`：`approval.request` 在审批策略为 `never` 时直接返回 `rejected`，不问任何人（user-approval:175），而用户桌面版的默认预设就是 `danger-full-access`、审批 `never`（`docs/FACTS.md` §3）；它还只有「允许一次 / 拒绝」两种结果、要求在打开的回合里调用（user-approval:128–144）。卡片的多选项、推荐与后果都要 user-questions。

`docs/ORCHESTRATION.md` §5 的决策卡表把同步卡的场景定为「出工作区操作、往工作区外装工具：阻断当次操作，等人批」，并要求「批准只放行当次」。本设计的 `decision_card` 是访谈与设计中问岔路的同步卡，不接 guard 的拒绝；guard 纠偏里「file a request」的正路（`src/guard/rules.ts`:37 `APPLICATION_PROTOCOL`）继续没有通道（§6.1 已记为缺口）。这项工作在 `docs/ROADMAP.md` M4 的条目与 §6.4 的规矩清单里都没有，所以列为 D6 由人定归属；`decision_card` 的出卡与人拍板的写法可以被申报通道复用（D6 选 A 时 M4 直接调用 `src/design/cards.ts` 与 `human-writes.ts`）。

#### 3.5.2 异步卡的回写

异步卡就是图上已批准的待决（已实现，`openItems.questions`）。补上 `docs/ORCHESTRATION.md` §5 的「回写」：人在面板里拍板之后通知主 Agent。

改 `src/graph/panel-row.ts`：`applyFromCommand` 改收 `AgentCommandInvocationLike`、`RunServices`（它已经从 `ctx.inject` 拿到 `sessionProjections`）与一个调用时取服务的 `lookup`（行的 `ctx.get`，同 guard 行取 `agents` 与图行服务的做法）。写入成功且操作是 `decide`、`approve` 或 `reject` 时，先算通知谁，再逐个发。

通知谁。一个工作区可以有多个主 Agent 会话写同一张图（§2.3），提出这张待决的会话不一定是面板所在的会话：人可能在会话 B 的面板里拍了会话 A 的决策卡留下的待决，A 也许正空闲着等这个决定。所以按「同一张图上、焦点在这个节点所属的目标下」挑会话，与面板开在哪里无关。「同一张图」必须单独判：agent 注册表是整个宿主进程的（`roots()` 取 `store` 里所有 `owner === undefined` 的活 agent，agent:617–625），桌面版上别的工作区的会话也在里面；而节点 id 在不同的图里会重复，引擎给提议的节点按 `${type}-${index}` 取第一个空号（`src/graph/engine.ts` `nextId`:295–300），两个项目各有 `goal-1`、`task-1` 是常态。只比焦点 id，别的工作区里焦点 id 恰好相同的主 Agent 就会被唤醒，收到不属于它的拍板。

1. 本次写入的图目录 `dir` 就是 `applyFromCommand` 已算出的 `locateGraph(configured, 调用会话的 cwd)`。重新读图（`openEngine(dir).load()`，写入已落盘），`goal = goalOf(graph, node.id)`（§3.6.1；写的就是目标时为它自己）。
2. 候选：`agents.roots()`（agent:623–625；user-questions:534 用同一成员判根），薄适配层的 `AgentsService` 加这个成员。
3. 留下同时满足下面四个条件的，按 A、B、C、D 的顺序判（A、B 同步，C 读文件系统）：
   - 条件 A：会话头不带 `origin: 'subagent'`（与 `isMainAgent` 同一判据）。
   - 条件 B：`mainAgentActive(services.projections.snapshot(session, [MAIN_AGENT_KEY]).values)` 为真（`src/graph/main-agent.ts`，§3.1.2；`panel-row.ts` 与它同目录，不导入设计目录）。
   - 条件 C（同一张图）：`graphService.dirFor(session.header.cwd)` 有值，且 `sameDir(它, dir)` 为真。
   - 条件 D：`focus = graphService.focusOf(session)` 有值，且 `goalOf(graph, focus)?.id === goal.id`。焦点用图行服务的 `focusOf`（§3.6.1），与阶段提醒、设计期只读、每步投影是同一个函数。
4. 调用面板的会话不单独加入：它若满足四个条件，第 3 步已经选中它；否则不唤醒它，免得一个与这次拍板无关的空闲会话开新回合。

`sameDir(a, b)`（`src/graph/panel-row.ts` 的内部函数）：两边各取 `fs.promises.realpath`，失败时退回 `path.resolve`；再把 `\` 换成 `/`、去掉末尾的 `/`，`process.platform === 'win32'` 时转小写（Windows 的文件系统不分大小写；`src/guard/graph-files.ts` 的 `pathKey` 也转小写，那里不分平台）；两者相等即同一目录。`dir` 的 realpath 每次 `/graph-apply` 只算一次。用 realpath 的理由：同一个目录可以经 junction 或大小写不同的路径到达（本仓库的 profile 与 worktree 都用 junction，`docs/DEVELOPMENT.md` §3），只比字符串会漏掉同一张图上的主 Agent。

候选的图目录取图行服务的 `dirFor`，不取本行的 `configured`：候选会话的焦点 id 是它的图工具读写的那张图里的 id，图工具与 `dirFor` 用的是图行的 `dir` 配置（`src/graph/index.ts` `provideService` 的 `resolveGraphDir(dir, cwd)` 与 `src/graph/tools.ts` `graphDir` 的 `locateGraph(configured, cwd)` 是同一个 `configured`）。图行与面板行的 `dir` 配置可以不同，那时按面板行的配置算候选的目录，会把焦点 id 放到另一张图里解释，正是本条要防的错。两行配置不同时，调用会话自己的图工具也不在被写的这张图上，条件 C 同样不选它。图行的 `dir` 是绝对路径时，所有会话的 `dirFor` 都是这一个目录，它们本来就共用一张图，都过条件 C、再按条件 D 判；是相对路径且会话没有 `cwd` 时 `dirFor` 为 `undefined`，不选。

降级：`sessionProjections` 不在（设计行禁用时 `hournessMainAgent` 也不存在，`mainAgentActive` 为 false）时不发消息。取不到 `agents` 或图行服务、`focusOf` 抛错、重新读图失败、或 `goalOf` 为 `undefined` 时，退回只看调用会话：它是主 Agent 就通知它，结果行注明「（只检查了本会话：<原因>）」。退回时不判条件 C、D：调用会话的 `cwd` 就是算出 `dir` 的那个，两行的 `dir` 配置相同（默认都是 `docs/graph`）时它一定在这张图上；配置不同时这个退回可能多通知一个会话，结果行已注明是降级。realpath 失败不算降级，按上面退回 `path.resolve` 比较。

发什么：每个选中的会话发一条 `createUserNotice('glm-graph-decision', 摘要, 正文, {graphDecision: {op, node, option?, commandId}})`。agent `running` 时用 `steer`（下一步收到，agent-loop:809–811），空闲时用 `followup`（开新回合）。

- 正文：拍板写「[项目图] 人在面板上拍板了待决 <id>「<标题>」：选 <key>「<说法>」，后果：<后果>。理由：<理由>」；批准、否决写「人在面板上批准（否决）了提议 <id>「<标题>」」，否决带理由；最后一句「投影与 graph_show 里已经是新的状态，按它继续」。
- 结果行：通知了谁写在命令结果后面（「已通知主 Agent：本会话」「已通知主 Agent：另外 1 个会话」）；没有选中任何会话时不写。某个会话发送抛错（agent 已释放等）时，命令仍是成功（图已写入），结果行后接「（没能通知 <会话 id>：<原因>）」，其余照发。

LLM 带转述拍板不发消息：那次写入就是它自己做的。`/graph-apply` 的其他操作也不发。主 Agent 还没有焦点、或焦点不在这个目标下时收不到消息；它下一次聚焦到这个目标时，每步投影里已是新的状态（§10）。

`d-async-cards` 由 L3 场景验证（§9.1.3 `glm-decision-card`），编排者据此 `verify` 为沙盒验证，批次 L4 后为真机验证。

#### 3.5.3 取代 L1/L2/L3

`docs/ORCHESTRATION.md` §5 末句「取代现有的 L1/L2/L3 分级」：

- 删除 `gradeDecision` 与 `DecisionLevel`；`FIVE_KEYS` 已迁到 `src/design/cards.ts`，`src/workflow/decisions.ts` 整个删除。knip 基线里的 `types src/workflow/decisions.ts FiveKey` 随之消失，`npm run lint:update` 缩小基线，同一提交。
- `DecisionRecord`（`src/memory/audit.ts`）去掉 `level`，workflow 行写 `{at, kind, subject}`；旧记录里的 `level` 读入时忽略。`dispatchPanel`（`src/report/panel.ts`）去掉 `level`。
- 晨报（`src/workflow/morning-report.ts`）：删去「例外」里的 `[L3]` 行与「决策曲线」一节；新增「决策卡」一节：待你拍板的张数与最早一张的提出日期，agent 自己要定的件数（这两项取 `openItems()` 的 `questions` 与 `agentQueue`），本期拍板的次数按拍板者分为你、你在对话里说、agent。拍板次数不取 `recentDecisions`：它最多 20 条（`src/graph/projection.ts`:20 `RECENT_DECISIONS`），而且每张待决只留最后一次；改为对 `load()` 得到的全部待决节点扫描历史里 `op === 'decide'` 且 `at` 在本期内的条目，`actor` 为 `human` 记「你」，`actor` 为 `llm` 且带 `relay` 记「你在对话里说」，其余（不带 `relay` 的 `llm` 与 `harness`）记「agent」。另一行「派遣类调用 N 次」取决策流水。图由 `/hourness` 的调用会话经图行服务 `dirFor(cwd)` 找到，用 `openEngine(dir)` 的 `load()` 与 `openItems()` 读；图行不在或图目录不存在时，这一节写「项目图读不到：<原因>」。

### 3.6 m3-6 阶段状态机

#### 3.6.1 阶段模型 `src/graph/stage.ts`

纯函数，输入是 `LoadedGraph`（`src/graph/parse.ts`），不碰文件系统，客户端也导入。

```ts
export interface GateItem {
  readonly key: string          // 例 'acceptance'、'decision-3:architecture'
  readonly label: string        // 中文，例「成功（怎样算做成）」
  readonly ok: boolean
  readonly hint: string         // 英文，给模型：该问哪一步、写到哪里
}
export function labeledSections(body: string | undefined, labels: readonly string[]): ReadonlyMap<string, string>
/** §2.4 的表：提议状态的目标只认 wish 与 interview；已批准、没有阶段的目标与已关闭的目标为 null */
export function effectiveStage(node: GraphNode): Stage | null
/** 节点自身或最近的目标祖先，即「当前目标」的唯一定义（§2.4）；节点不在或祖先链上没有目标时为 undefined */
export function goalOf(graph: LoadedGraph, id: string): GraphNode | undefined
export function requirementCard(graph: LoadedGraph, goal: GraphNode): readonly GateItem[]       // 8 项，§3.2.2
export function designColumns(graph: LoadedGraph, goal: GraphNode, decision: GraphNode): readonly GateItem[]  // 5 项，§3.3.1
export function releaseSet(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[]          // §3.3.2 第 2 条
export interface StageStatus {
  readonly goal: string
  readonly stage: Stage | null
  /** 目标已关闭（done、dropped、superseded） */
  readonly closed: boolean
  /** wish/interview：需求卡与确认门禁（goal:supersedes）；design：各设计决策的五栏与其余放行门禁（§3.3.2）；其余阶段与 stage 为 null 时为空 */
  readonly items: readonly GateItem[]
  readonly exitReady: boolean
  /** 目标子树里等人拍板的待决数 */
  readonly waitingHuman: number
}
export function stageStatus(graph: LoadedGraph, goal: GraphNode): StageStatus
```

图有校验错误时照常计算（与投影一致，读不拦），写入由引擎拒绝。设计阶段有多个设计决策时，流程条与提醒用「五栏」最少的那个决策的计数。

图行服务（split 之后的 `src/graph/service.ts`）加一个成员：

```ts
/**
 * 会话的焦点，取法与每步投影相同（reminder.ts:191–194）：先取会话可见历史里最后一次成功的
 * graph_focus 或投影 notice，历史里没有时才取 graph_focus 记在内存里的（tools.ts:355）
 */
focusOf(session: SessionLike): string | undefined
// = focusFromHistory(session.deriveMessages()) ?? focuses.get(session.id)
```

`focusFromHistory` 就是从 `reminder.ts` 的 `projectionHistory`（:90–119）里抽出的焦点推导，导出后服务与每步投影共用同一个函数，`projectionNotice` 改为调用它，行为与测试不变。先后与每步投影一致的理由：人回退或改写对话之后，历史里的焦点比内存里的新，阶段提醒、设计期只读、`/graph-apply` 的通知若先看内存，会按已不在对话里的焦点判，与模型在每步投影里看到的焦点不同。`focusOf` 只读，不写回内存表；写回仍只在 `projectionNotice` 里（:194），保持今天的行为。服务的读取函数只检查调用方用到的成员是函数（同 split 对方言服务的做法），guard 行照旧只用 `dirFor` 与 `isGraphTool`。

#### 3.6.2 阶段提醒（告知）

设计行的 `installAgentHooks`（§3.1.3，`agent/created` 与 `/wish` 共用）经公共库的 `installStepNotice(agent, 'stage reminder', eligible, build, 'design')`（split 之后在 `src/shared/step-notice.ts`，`row` 必填）给每个 agent 装一个监听器，`eligible` 为「本步是主 Agent」。`build`：

1. 焦点：图行服务 `focusOf(session)`；读图。
2. 当前目标：`goalOf(graph, focus)`；`stageStatus`。
3. 正文（英文，中文标签原样），按阶段：
   - 没有焦点或焦点链上没有目标：说明主 Agent 还没有目标在焦点上，这时派出的子 agent 写文件会被拒；刚许过愿就按访谈第 1 步提议目标并 `graph_focus`，否则 `graph_open` 找到目标或任务再聚焦。
   - `wish`、`interview`：阶段名；本阶段做什么（一次一个问题、问完就写进图）；需求卡几项齐了，缺的项各一行（`label` 与 `hint`）；下一步是缺项里步序最小的那一步；全齐时写「调用 design_review 请人确认」。
   - `design`：阶段名；本阶段做什么（写五栏、提规划节点、汇报用 `design_review`，放行之前子 agent 只读）；各决策的五栏计数与缺项，其余放行门禁；全齐时写「调用 design_review」。
   - `release`：已放行；下一步是分解与派发，向人汇报。
   - 其他阶段：只写阶段名与「本阶段不属于设计循环」。
   - 目标已批准、没有阶段：写目标标题与「这个目标不走设计循环」，不列缺项；子 agent 写文件不受设计期只读限制（§3.3.3）。
   - 目标已关闭：写目标标题与状态，说明子 agent 写文件被拒，要聚焦一项未关闭的工作。
   - 末尾：等人拍板的待决数大于 0 时加一行。
4. 只在变化时注入：从 `reminder.ts` 抽出的 `src/graph/digest-notice.ts` 按同样的顺序判断，规则名记在 `designStage.reason`：`compaction`（压缩检查点在最近一条提醒之后，或锚点不是它）、`goal-round`（本步认领了目标轮消息）、`goal`（当前目标与最近一条提醒的不同）、`changed`（正文摘要不同）；都不成立不注入。抽取之后 `reminder.ts` 的行为与测试不变。
5. notice：`createUserNotice('glm-design-stage', 摘要, wrapSystemReminder(正文), {designStage: {goal, stage, digest, anchor?, reason}})`；`wrapSystemReminder` 来自公共库镜像文件 `src/shared/zcode-notice.ts`（split §2.3）。

位置与缓存：notice 在本步已接纳的消息之后，不进系统提示词（`docs/DESIGN.md` §6）。阶段或缺项不变时不注入，请求前缀不变。读图抛错时本步不带提醒，告警一次，行健康记部分生效。

#### 3.6.3 门禁

阶段切换的门禁只在 `design_review` 里（§3.2.3、§3.3.2），工具调用处的门禁是两条写入规则（§3.1.4、§3.3.3）。投影里已有的「未通过的门禁」照旧只报告（`src/graph/projection.ts` `gatesOf`）。

#### 3.6.4 流程条（呈现）

编排层客户端包 `dsh-hourness-ui`（split 第 6 步之后在 `packages/hourness/ui/`，入口 `ui/src/hourness-client.tsx`，附录「目录」「第 6 步：UI 拆分」）注册一个输入框上方的停靠项，做法同 DSH 目标条，注册包在 `slots.inject` 里（client-ui-goal client.js:604–609 用的就是 `conversation.input.dock`；本仓库 `ui/src/channel.js`:347–352 对 `settings.section` 与 `conversation.composer.dock`、`ui/src/graph/tab.tsx`:77 对 `sidebar.right.pane.tab` 是同一写法，外层的 `ctx.effect` 照 `tab.tsx`，同一个客户端包）：

```ts
ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
  name: 'conversation.input.dock', id: 'hourness-flow', order: 20,   // 目标条是 10
  inject: (sessionId: string) => ({ sessionId }),
}, FlowBar)), 'hourness-ui: flow bar')
```

`ui/src/flow/**` 进 `scripts/packages.mjs` 编排层客户端的 `sources`（§2.1），preflight 与 ESLint 的边界规则从表里读到它。

- 数据：会话的 `hournessMainAgent` 与 `graphLive` 两个投影值，取法同面板的 `useAgents`（`sessions.list` 的 `projectionsBySession`，`ui/src/graph/agents.ts`:30–37）；不是主 Agent 时组件返回 `null`，普通会话里什么都没有。是主 Agent 时才 `holdSource(remote, sessionId)` 读图（与面板共用一份数据源，`ui/src/graph/source.ts`）。
- 文字：纯函数 `flowBarText(input)`（`ui/src/flow/model.ts`），例：`主 Agent · 访谈 · 需求卡 5/8`、`主 Agent · 设计 · 五栏 3/5`、主 Agent 正在跑 `design_review` 时末尾加 `· 等你确认`（访谈）或 `· 等你批准`（设计），在跑 `decision_card` 时加 `· 等你拍板`；子树里有等人拍板的待决时加 `· 待你拍板 2`；`release` 写 `主 Agent · 已放行`；没有焦点或焦点链上没有目标写 `主 Agent · 还没有目标`；目标已批准、没有阶段写 `主 Agent · <目标标题>`；目标已关闭写 `主 Agent · <目标标题>（已关闭）`。当前目标与阶段的取法同宿主（`goalOf`、`effectiveStage`，`src/graph/stage.ts`），焦点取 `graphLive` 的 `focus`。阶段的中文名复用 `src/graph/labels.ts`:38–48 已有的 `STAGE_LABELS`（面板的节点详情同样用它，`ui/src/graph/NodeDetail.tsx`:135）；主 Agent 模式取 `mainAgentActive(values)`（`src/graph/main-agent.ts`）。
- `graphLive` 不在（graph-panel 行禁用）时写 `主 Agent · 读不到阶段（现场投影未注册）`。
- M3 的流程条只显示，不响应点击；「点开是右侧边栏的流程页」随 M8（打开第三方标签页的接口没有核实，核实清单第 6 项已标不再需要）。

## 4. 宿主契约与 rc.3 证据

「已用」指本包已经在用、`docs/DESIGN.md` §2.4a 接口对照表里有证据并经 L3 或 L4；「新用」指 M3 第一次用，实现时把它补进接口对照表与薄适配层（`src/shared/dsh-min.ts`），并在 §9 列出核实的层。

| 接口 | M3 的用法 | rc.3 证据 | 状态 |
| --- | --- | --- | --- |
| 模块导出 `name`、`inject`、`apply(ctx, config)`；`ctx.on`（`prepend`） | 设计行入口 | cordis:1625–1635、1536、372–381 | 已用 |
| `ctx.inject(names, callback)` | 可选取 `sessionProjections` | cordis:1600、1071、1142–1143 | 已用（graph-panel） |
| `ctx.get(name)` | 调用时取 `userQuestions`、`agents`、`glmHournessGraph`、`glmHournessDialect`、`glmHournessData`、`workingDirectory` | cordis:763–766 | 已用 |
| `ctx.provide` | 行健康 `glmHournessHealth/design` | cordis:800–830 | 已用 |
| `commands.register`：名字规则、描述、`input.hint`、`recordInput` | `/wish` | commands:149–181 | 已用 |
| 调用参数 `{commandId, agent, rawInput, attachments, signal}` | `/wish`、`/graph-apply` | commands:379–385 | 已用 |
| `command/run` `{commandId, name, args?, source}`、`command/done` `{commandId, kind, text?}` 写进会话日志 | 主 Agent 模式的折叠 | commands:334–339、341–346；同样的折叠 plan-mode:84、95 | 新用（折叠命令事件） |
| `sessionProjections.register`；`init(header, inheritedEventCount)`；注册晚于事件时懒折叠 | `hournessMainAgent` | session-projection:68–100、文件头注释、`session/created` 处理 | 已用（graphLive） |
| `sessionProjections.stateOf(session, key)`（同步，返回宿主状态，key 未注册时 `undefined`） | `isMainAgent` 读 `active` 与 `settled` | session-projection:126–131；计划模式的同一读法 plan-mode:332 | 新用；薄适配层 `SessionProjectionsService` 加这个成员 |
| `sessionProjections.snapshot(session, keys)`（同步，过 view schema） | `/graph-apply` 判断是否通知 | session-projection:141–158 | 已用（`/graph-run`） |
| 命令执行的次序：`command/run` → 处理函数 → `await withAbort` → `command/done`；空闲 agent 的 `followup` 同步开始回合与组装 | `/wish` 的待生效状态 | commands:334–346、388–394；agent-loop:800–807、854–868、938–956、902–907；agent:400–401、645–653 | 新用（§3.1.1） |
| 待生效状态的先例：`pendingIntents` 与 `plan:policy` 节先读它 | 照抄 | plan-mode:146、173–175、215–216 | 参照 |
| 行卸载不中止在跑的工具体；插件回调返回的函数是卸载函数 | 三个工具体在 `ask` 返回后查 `disposed` | plan-mode:150、167–169、290；cordis:1135–1143 | 新用 |
| `agent/created`（serial） | 经 `installAgentHooks` 装组装监听器、阶段提醒（`/wish` 处理函数也调它，§3.1.3） | agent:581–585 | 已用 |
| `system-prompt/assemble`（agent 作用域 waterfall，`next()` 之后改 `sections`、`tools`） | 身份节；非主 Agent 去掉两个设计工具 | system-prompt:365–405；`interpolate: false` 原样渲染 system-prompt:109–118 | 已用 |
| `agent/pre-step` 与 notice 追加（经 `installStepNotice`） | 阶段提醒 | agent-loop:901–925；notice 形状 llm:37–66 | 已用 |
| 压缩检查点与目标轮消息的来源 | 阶段提醒的重注规则 | compaction:109、116–122；goal-round-driver:144–151、164 | 已用（每步投影） |
| `tools/pre-execute`（`deny{reason}`，拒绝即工具错误）；`exec.agent`、`exec.parent` | 两条写入规则 | tools:3229–3260、3320–3353 | 已用 |
| `tools.register` 与输出 schema 子集；工具体收到 `exec`（`callId`、`agent`、`signal`、`concludeTurn`） | `design_review`、`decision_card` | tools:2974–2984、3227–3260、3406、3637–3640；`concludeTurn` 的用法 plan-mode:285 | 已用（图工具）；`concludeTurn` 新用 |
| 执行按名解析，与本次工具面无关 | 非主 Agent 的工具面里没有这两个工具，直接调用仍执行，所以工具体查调用方 | `docs/DESIGN.md` §2.4a | 已用 |
| `userQuestions.ask({questions, agent, signal})`：问题 `{id, header?, question, detail?, options?[{label, description?}], multiSelect?}`；回答 `{answers[{id, selected[], custom?}]}`；只给活的根 agent（`CALLER_NOT_LIVE`、`DELEGATED_CALLER`）；没有应答方 `NO_PROVIDER` | 三张卡 | user-questions:531–535、668–690；工具体里调用的先例 plan-mode:257–301 | 新用 |
| 人关掉卡片：客户端以 `ASK_CANCELLED` 拒绝 | 关掉的处理 | client-ui-user-questions client.js:420；plan-mode:284 | 新用 |
| 通用问题流：`detail` 用 `MarkdownText` 渲染；说法里的 `(Recommended)` 被解析为推荐并在初稿里预选；plan-review 呈现只接管不超过两个选项、带 `plan-review` 意图的问题 | 卡面 | client-ui-user-questions client.js:1078–1090、783–795、42–61 | 新用，L4 看 |
| 客户端的回答形状：单选问题只交选项或文字之一（选中清空文字，打字清空选项，提交时有文字就丢掉选项）；多选问题两者都交；跳过的问题为 `{id, selected: []}` | 三张卡的回答解析；五键卡拆成两问；模拟人照这个形状作答 | client-ui-user-questions client.js:907–922、980–987、937–948 | 新用（实读），L4 看 |
| 一次多个问题：选中单选问题的选项后自动翻到下一问；不带选项的问题显示为整块文本框；每问都有「跳过」，全部完成才能提交 | 五键卡的第二问 | user-questions:33–51（`options` 可省、`questions` 至少 1 个）；client-ui-user-questions client.js:835、922、926–932、994–1005、1157–1160、1216–1226 | 新用，L4 看 |
| `user-questions/request` 应答链（按 agent 作用域派发） | 探针与标定里的模拟人 | user-questions:679–683 | 新用（只在覆盖层插件里） |
| `ask_user_question`（legacy 模式）的参数与「推荐项放第一并加 (Recommended)」 | 访谈提问 | tool-ask-user:223–321、250；桌面版在 `preset-standard`（`dsh-web-app/presets/standard.patch.yml`:110–111），headless 基础组合没有这一行（`dsh-base/cordis.patch.yml` 只有 user-questions:79） | 已有工具，探针与标定的覆盖层要插入这一行 |
| 活 agent 的 `followup`（下一回合，唤醒）、`steer`（下一步，唤醒）、`inject`（下一步，不唤醒）、`status` | `/wish` 的消息；异步卡回写 | agent-loop:790–791、800–814 | `followup`、`inject` 已用；`steer` 新用 |
| `agents.get(id)` | 派发链逐跳找上一层 agent | agent:596 | 已用 |
| `agents.roots()`（所有不属于别的活 agent 的活 agent，按注册顺序；进程级，不分工作区，与会话谱系无关） | `/graph-apply` 通知的候选会话，再按图目录与焦点过滤（§3.5.2） | agent:617–625；user-questions:534 用它判根 | 新用；薄适配层 `AgentsService` 加这个成员 |
| 会话头 `origin`（只能是 `subagent`）、`parentSession`、`delegationDepth`；每一层委派都由同一个 `childSessionMeta` 写 | 主 Agent 判定；派发链找根 | session:1051–1053；subagent:346–356 | 已用（通道归因） |
| 子 agent 的派发深度：工具传设置里的 `maxDepth`（默认 1，可在设置页调大），服务只查调用方传入的值 | 设计期只读不按深度判，按派发链判 | subagent:279–283、1396–1399、2979；client-ui-settings-subagent client.js:63、134；`docs/ORCHESTRATION.md`:499 | 参照 |
| `commands.execute(agent, line, attachments, signal)`：`signal` 必填（:332 无条件读 `signal.aborted`）；命令名没注册时返回 `undefined`；返回 `{commandId, result}` | 模拟人在 `agent/created` 里替人发 `/wish`（空闲路径）；探针 provider 的 `line` 步在会话中途发 `/wish`、`/wish off`、`/graph-apply`（运行路径），命令事件都进日志（§9.1） | commands:327–395 | 新用（只在覆盖层插件里） |
| `session/event`（同步，`(session, event)`，追加即派发） | `line` 步记下这次命令让本会话日志增加的事件 | headless index.js:335 用同一监听 | 新用（只在探针里） |
| 加载器并发创建同一组里的各行；串行事件按注册顺序逐个 `await` | `/wish` 处理函数自己调 `installAgentHooks`，不依赖本行的 `agent/created` 监听器排在别的插件前面 | cordis-plugin-loader:87；cordis:289–294、336 | 参照（§3.1.3） |
| `agent/created` 的载荷 `{agent, source, signal?}`（`signal` 在载荷类型里可选）；agent 工厂的 `publish` 在返回之前 `await` 这个串行事件，并传入自己的 `abort.signal`；headless 在 `agents.create`、`whenIdle` 之后才 `followup` 任务 | 模拟人在串行监听器里 `await` 命令，命令先于任务进日志；载荷没有 `signal` 时自己建一个 | agent:581–585；agent-loop:1786–1794；headless index.js:317–346 | 新用（只在覆盖层插件里） |
| 客户端停靠槽 `conversation.input.dock`：`ctx.slots.inject(name, () => ctx.slots.register({name, id, order, inject(sessionId)}, Component))` | 流程条 | client-ui-goal client.js:604–609；本仓库 `ui/src/channel.js`:347–352、`ui/src/graph/tab.tsx`:77（同一写法，别的槽） | 新用（槽名新，写法已用），L4 看 |
| 客户端 `sessions.list` 的 `projectionsBySession` | 流程条读两个投影值 | 面板已用（`ui/src/graph/agents.ts`）；api-session-controller | 已用 |
| `remote.workspaceFiles` | 流程条读图（与面板共用数据源） | `dsh-api-workspace-files/README.md` | 已用 |
| 不用：`approval.request` | 审批策略 `never` 时直接 `rejected`；要求打开的回合 | user-approval:128–144、175；`docs/FACTS.md` §3 | 不用（D2） |
| 不用：`exit_plan_mode`、`planMode`、`agentPresets.serviceFor` | 见 §3.3.4 | plan-mode:255、261–281；`standard.patch.yml`:45–49；agent-preset-registry:725–728 | 不用（D2） |

M3 不新增宿主接口以外的东西：不注册 Remote 服务、不加 waterfall、不追加自定义会话事件（第三方都做不到，`docs/DEVELOPMENT.md` §5 第 6 条、`dsh-session/README.md` 70 行）。

## 5. 数据与状态

| 数据 | 存在哪 | 谁写 | 读的一方 | 寿命 |
| --- | --- | --- | --- | --- |
| 主 Agent 模式 | 会话日志里 `/wish` 的 `command/run` 与 `command/done`；投影 `hournessMainAgent` 是它的折叠，检查点进 DSH 自己的投影缓存 | DSH 命令运行时 | 设计行、guard 规则、`/graph-apply`、流程条 | 随会话；fork 继承 |
| 主 Agent 模式的待生效状态 | 设计行内存，按会话的 `WeakMap`，`{commandId, active}` | `/wish` 处理函数 | `isMainAgent`（设计行与两条写入规则） | 从处理函数到同一 `commandId` 的 `command/done` 被折叠，一般几个微任务；进程退出即失 |
| 许愿原话 | `command/run` 的 `args`；许愿 notice 引用它；目标正文的 `需求：` 逐字抄一份 | 人；主 Agent 抄进图 | 主 Agent、人 | 会话日志；图随 git |
| 目标与阶段、需求卡的八项、设计决策与五栏、规划节点 | 项目图 `docs/graph/nodes/*.json` | 主 Agent（`llm`）提议与改自己的提议；人（卡片回答、面板、转述）批准与改阶段 | 全部 | 随 git |
| 岔路与决策卡 | 图上的待决（`options`、`recommend`、`decision`、拍板历史） | 主 Agent 提议；人拍板 | 全部 | 随 git |
| 人在卡上的文字（确认卡上写的哪里不对、五键卡第二问里的理由与补充、决策卡上只写的文字） | 图上目标或待决的批注（`human`，说法由 `answerPhrase` 生成，写明人点了哪个键或没有选键）；会话日志里的工具结果 | harness 代人写 | 主 Agent、人；M5 的学习信号 | 随 git |
| 卡片的问题与回答 | 会话日志：工具调用的参数与结果 | DSH | 审计、M5 | 随会话 |
| 汇报细度（本会话） | 最近一次 `design_review` 结果的 `depth`，从会话可见历史推出 | `design_review` | 主 Agent、`design_review` | 随会话；画像归 M5 |
| 阶段提醒的状态 | notice 的 `designStage` 事实（目标、阶段、摘要、锚点、规则名） | 设计行 | 设计行（下一步推导） | 随会话 |
| 写入规则的拒绝 | `<项目目录>/audit/violations.jsonl`，`ViolationRecord` | 设计行 | 晨报、人 | 文件，不入库 |
| 派遣类调用 | `<项目目录>/audit/decisions.jsonl`，`{at, kind, subject}`，不再有 `level` | workflow 行 | 晨报 | 文件，不入库 |
| 决策卡的统计 | 不另存，晨报读图时算 | 无 | 晨报 | 无 |
| 打开中的卡片 | 设计行内存里按会话 id 的集合 | 设计行 | 两个设计工具 | 进程内；卡片随进程退出一起失效 |
| 焦点 | 图行的内存表加会话历史（已有） | 图行 | 设计行经 `focusOf` | 已有规则 |
| 流程条 | 不存，客户端从两个投影值与图算 | 无 | 人 | 无 |

图上的就是项目状态（`docs/ORCHESTRATION.md` §2.1「状态全在图里，主 Agent 的会话随时可以丢弃」）：换一个会话 `/wish` 之后，主 Agent 从图上的阶段与缺项接着做。会话里的只有「谁在当主 Agent」与对话本身。

处处留痕（`docs/CHARTER.md` §7.1 条款 11）：改变状态的动作都在它所属的地方有一条记录。图的改动在节点历史里，`actor` 与 `reason` 写明是哪张卡、人点了什么；角色的开关在会话日志的命令事件里；拦截在违规流水里。一处动作只在一处记事实，别处只引用（工具结果里的 `outcome` 引用卡片，节点历史的 `reason` 引用工具调用 id）。

## 6. 失败与降级

### 6.1 激活期（`apply` 不抛错，`AGENTS.md`）

`inject = ['tools', 'commands']`：两个服务都在时 cordis 才激活本行，否则行健康表显示「未加载」。`apply` 内部：

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| `/wish` 注册失败 | 告警；撤掉已注册的一切；本行不做任何事 | 行健康 inactive「/wish 注册失败：…」 |
| 两个工具之一注册失败（重名、输出 schema 被拒） | 告警；撤掉两个工具与 `/wish`；本行不做任何事 | inactive，写明原因 |
| `sessionProjections` 不在，或注册投影抛错 | 告警一次；`/wish` 注册着但拒绝开启；没有主 Agent，规则与提醒都不起作用 | degraded「主 Agent 模式要会话投影服务」；服务以后到达时 `reactivate` |
| 图行服务不在 | 不影响激活；`/wish` 拒绝开启，工具报 `not_found` | 会话健康说明 |
| 某个 agent 的组装监听器或提醒装不上 | 告警，那个 agent 照常创建 | 会话健康 degraded |

### 6.2 运行期

| 操作 | 失败条件 | 可恢复？ | 调用方收到 | 记录 |
| --- | --- | --- | --- | --- |
| `/wish` | 子会话、无投影、无图行、无图目录、文字过长 | 是，按提示补上再发 | 命令 error 行（中文，§3.1.1） | 命令流节点（`command/done`） |
| `/wish` 的 `followup` / `steer` / `inject` 抛错 | agent 已释放 | 是 | 命令仍 success（模式已记），结果行注明「没能把消息交给 agent」 | 命令流节点 |
| 组装监听器 | 读投影抛错 | 是 | 本步当作非主 Agent（不加身份节） | 告警一次，会话健康 degraded |
| 写入规则 | 读投影抛错；`agents` 不在；派发链判不出（链上有不活的 agent、子会话头没有 `parentSession`、成环）；图行服务不在；读图失败；判定器抛错 | 是 | 放行（fail-open，同 `evaluate`） | 会话健康 degraded，写明原因；判定器抛错不记 |
| 写入规则 | 派发链的根是主 Agent，但它没有焦点、焦点不在图里、焦点链上没有目标或目标已关闭（判得出的状态，不是失败） | 是，主 Agent 聚焦之后 | 拒绝，纠偏按 §3.3.3 | 违规流水 |
| 写入规则 | 违规流水写失败 | 是 | 拒绝照常 | 第一次失败告警一次（`rowJournal`） |
| 阶段提醒 | 无焦点、读图失败、焦点不在图里 | 是 | 无焦点或节点不在：注入一条说明（同样只在变化时）；读图抛错：本步不带提醒 | 告警；会话健康 degraded |
| `design_review` / `decision_card` 开卡之前 | §3.4.4 的第 1–9 条 | 是 | 工具错误 `{code, message, hint}`，码为 `forbidden`、`invalid`、`busy`、`not_found`、`graph_invalid`、`bad_transition`、`gate_unmet`、`unavailable` 或引擎的码 | 会话日志的工具结果 |
| 卡片等待 | 人关掉 | 是 | `dismissed`（`design_review` 结束回合）或 `queued`（`decision_card` 不结束） | 工具结果 |
| 卡片等待 | 停止按钮、会话取消（`ASK_ABORTED`） | 是 | 工具错误 | 工具结果 |
| 卡片等待 | 宿主进程重启 | 是 | 回合随进程结束；重启后主 Agent 从图上的状态重新提交 | 无（卡片没有落盘，图未改） |
| 卡片等待 | 设计行卸载或经 HMR、插件管理器重新加载（工具注册撤掉，在跑的工具体不中止） | 是 | 工具体在 `ask` 返回后查到 `disposed`，不写图，抛错「设计行在卡片打开期间重新加载了：人的回答是 <选项与文字>，重新调用」 | 会话日志的工具结果 |
| 回答之后写图 | 阶段在等待期间被改 | 是 | `stale_revision`；人的回答记成批注 | 节点历史 |
| 回答之后写图 | 目标或待决在等待期间被关闭、被删 | 是 | `closed`，不写图 | 会话日志的工具结果 |
| 回答之后写图 | 待决在等待期间已被拍板 | 是 | `decided`，`option` 为图上的结果；人在卡上的选择记成批注 | 节点历史 |
| 回答之后写图 | 两次写入之间被改（毫秒窗口） | 是 | 重新读图再判一次；仍失败抛引擎的错误，`hint` 带人的回答 | 会话日志的工具结果 |
| 回答之后写图 | 某个节点被改过（`stale_revision`）或被引擎拒绝 | 是 | `skipped` 列出，阶段不变 | 已写的节点有历史；未写的在结果里 |
| 回答之后写图 | 图有校验错误（`graph_invalid`） | 要人先修图 | 工具错误，`hint`「图有校验错误，告诉人；人的回答是 <文字>」 | 会话日志 |
| `/graph-apply` 的通知 | 某个会话的 `steer` / `followup` 抛错 | 是 | 命令 success，结果行注明哪个会话没通知到，其余照发 | 命令流节点 |
| `/graph-apply` 的通知 | 取不到 `agents` 或图行服务、`focusOf` 抛错、重新读图失败、节点没有所属目标 | 是 | 退回只检查调用会话（是主 Agent 就通知），结果行注明原因 | 命令流节点 |
| `/graph-apply` 的通知 | 被写的图目录或某个候选会话的图目录 `realpath` 失败 | 是 | 那一边退回 `path.resolve` 再比较，不算降级 | 不记 |
| 组装监听器与阶段提醒 | agent 在本行激活之前就已创建（插件管理器启用本行、本行重新加载），`agent/created` 不再为它派发 | 是，人在这个会话里发一次 `/wish` | 已是主 Agent 的会话（投影仍为开启）在重发 `/wish` 之前没有身份节、阶段提醒，两个设计工具也不被滤掉；写入规则照常拦 | 主 Agent 的写调用被拦或调用设计工具时，`installAgentHooks` 还没装过这个 agent，会话健康记 degraded「这个会话在设计行加载之前就开着，身份节与阶段提醒没有装上：发一次 /wish」 |
| 晨报读图 | 图行不在、目录不存在、读图抛错 | 是 | 「决策卡」一节写读不到的原因，其余照常 | `/hourness` 输出 |
| 流程条 | 投影值没到、图读不出 | 是 | 显示「读不到阶段」或不显示（非主 Agent） | 客户端控制台（同面板） |

降级对人可以安静，但都上报（`docs/CHARTER.md` §7.1 条款 7）：行健康表加 `design` 一行（§6.6），说明写明当前会话是不是主 Agent、阶段与目标、哪项降级了。

### 6.3 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `/wish` 的 `rawInput` | 否 | 去掉首尾空白后为空、`off`，或 1–2000 字符的文字 | error 行 |
| `design_review.id` | 是 | 非空字符串，是图里的目标 | `invalid` / `not_found` |
| `design_review.summary` | 是 | 非空，至多 4000 字符 | `invalid` |
| `decision_card.parent`、`title`、`question`、`options`、`recommend` | 是 | 交给引擎按待决节点的规则校验（id 格式、2–4 个选项、`key` 格式、选项不重复、`recommend` 是选项、单行标题） | 引擎的 `invalid`，`field` 指到请求字段 |
| `decision_card.why` | 是 | 非空，至多 2000 字符 | `invalid` |
| `decision_card.sources` | 否 | 字符串数组，每项是图里的节点（引擎校验连线目标） | 引擎的 `not_found` / `invalid` |
| 两个工具的其他字段 | 不收 | — | `invalid`（rc.3 不校验原样注册的工具参数，工具体自己查，同图工具） |
| 卡片回答 | — | `answers` 里按问题 `id` 取项：确认卡与决策卡各一问，五键卡两问（`hourness-five-keys`、`hourness-five-keys-note`）；`selected` 只认本问选项的说法，不认的说法当作没有选项；`custom` 是字符串，去掉首尾空白，超过 2000 字符截断 | 缺主问（确认卡、决策卡的唯一一问，五键卡的第一问）：按「关掉」处理并告警一次；只缺五键卡第二问：当作没有文字，告警一次 |
| 会话事件（投影折叠） | — | 只读本单元用到的字段，类型不对的事件原样跳过 | 不报错 |
| 节点正文的标签 | — | §3.2.2 的解析规则 | 缺项只是门禁未过 |

### 6.4 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 主 Agent 不写文件；它焦点所在的目标放行之前（含没有焦点时），它派出的各层子 agent 不写文件（按派发链找根，不依赖 `maxDepth`） | 执行边界：`tools/pre-execute` 的两条规则 | 违规硬拒，不靠模型自觉（`docs/CHARTER.md` §6）；写文件的工具都还在工具面里（子 agent 加入父 agent 的 preset，工具面与父相同，`docs/ORCHESTRATION.md` §3.2），所以只能在执行边界拦；shell 判写的残余缺口见 §10 |
| 图历史里记的是人实际做的动作（点了哪个键或选项，或没有选、写了什么） | 设计行：`src/design/cards.ts` 的 `answerPhrase` 是批注与 `reason` 里描述回答的唯一来源 | 客户端单选问题的回答只有选项或文字之一，按形状如实记录；`docs/CHARTER.md` §7.1 条款 11 |
| 只有人的动作能把目标推到 `design`、`release` | 引擎（已批准的目标 LLM 与 harness 改不了，D5 只放开仍为提议的目标）；`stage.ts` 的 `effectiveStage`（提议状态的目标写了什么阶段都按访谈算）；设计行（唯一以人的身份写阶段的代码在 `human-writes.ts`） | 引擎管已批准的目标，有效阶段管提议中的目标；设计行只在卡片回答之后调用 |
| 人批准的就是卡上展示的 | 设计行：开卡时记下放行集合与修订号，写入时带修订号；引擎的修订号检查 | 门禁只认证据 |
| 阶段门禁只有一份实现 | `src/graph/stage.ts`，宿主与客户端都导入 | 规则只在一处实现（`docs/ORCHESTRATION.md` §2.9） |
| 主 Agent 模式以会话日志为准 | 投影单元；设计行的待生效状态只覆盖命令结束之前的那几个微任务，`command/done` 一折叠就删 | 续跑、压缩、重启一致；第三方不能写自定义事件；命令自己的次序让日志晚于第一步（§3.1.1） |
| 卡片回答之后的写入不推翻卡片打开期间人在别处做的决定 | 设计行：回答之后重新读图，按当前状态分支（§3.4.4、§3.5.1） | 人在面板上的操作与卡片上的回答都是人的，后到的卡片回答不能悄悄覆盖先到的面板拍板 |
| 经卡片批准的节点不连带改动卡上没有的节点 | `stage.ts` 的门禁：确认卡与放行集合不收带 `supersedes` 连线的节点 | 引擎批准这种节点时会取代连线目标，且不可撤回（§3.3.2 第 6 条） |
| `release` 之下没有提议 | 设计行：批完之后重新读图，仍有提议就不改阶段 | 卡片打开期间新提的节点人没看过 |
| 一个会话同时只有一张设计卡片 | 设计行的内存集合 | 并行的两张卡会让人看到两份互相矛盾的放行集合 |
| 面板写回只通知工作在被写的那张图上的主 Agent | 图面板行：候选按图行服务 `dirFor` 的目录与被写目录 realpath 相等过滤，再比焦点所属目标（§3.5.2） | agent 注册表是进程级的，节点 id 在不同的图里会重复；焦点 id 只在它自己的图里有意义 |
| `human` 写入都带出处 | `human-writes.ts` 统一生成 `reason` | 历史里能追到哪张卡、哪次调用 |

### 6.5 可测性

纯函数（`stage.ts`、`main-agent.ts`、`insertHournessSection`、需求卡与五栏、卡片请求的构造与回答的解析、投影折叠、流程条文字）在 L2 直接测。宿主侧的行在假宿主 `tests/fake-rc3.ts` 上测，假宿主为此补下面这些 rc.3 的信号：命令执行时按 rc.3 的次序往会话日志追加 `command/run`、调处理函数、`await` 其结果、再追加 `command/done`（commands:334–346、388–394），并驱动已注册的投影单元（含 `stateOf`）；活 agent 的 `followup` 在空闲时同步开始一次组装（agent-loop:800–807、854–868、902–907 的次序），`steer`、`inject` 记下消息；`userQuestions.ask` 按脚本给回答或按码抛错（`ASK_CANCELLED`、`ASK_ABORTED`、`NO_PROVIDER`、`DELEGATED_CALLER`），回答只用客户端会交的形状（单选问题 `selected` 与 `custom` 二选一，跳过为 `{id, selected: []}`，client.js:937–948；假宿主拒绝两者都带的单选回答，免得测试写出桌面版上不会出现的回答），并能在回答之前执行一段脚本（批注、拍板、卸载行），用来测「卡片打开期间」的各种变化；`agents` 提供 `get` 与 `roots`，`roots` 像 rc.3 一样不分工作区，返回所有根 agent，各会话头可带不同的 `cwd`（两个工作区的用例），子会话的头按 `childSessionMeta` 的形状（`parentSession`、`origin: 'subagent'`、`delegationDepth`，subagent:346–356）逐层构造；能在本行激活之前先建好 agent（不派发 `agent/created`），用来测 `/wish` 自己安装每 agent 的监听器。不 mock 契约本身之外的东西（`docs/DEVELOPMENT.md` §1）。真实组合里的叠加（身份节与方言、卡片在真运行时的应答链、命令事件进投影）在 L3 探针里测；卡面与流程条要 L4。

### 6.6 行健康

`src/shared/health.ts` 的 `HOURNESS_ROWS` 在 `graph-panel` 之后加 `design`（split §2.5 的分组；preflight 核对它与 `scripts/packages.mjs` 一致）。`design` 按会话上报，不在 `ACTIVATION_ONLY` 里。

| 何时上报 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- |
| 激活；主 Agent 会话的每次组装；两条规则的每次判定；两个工具的每次调用 | 主 Agent：身份文本、写入规则与阶段提醒生效，写明目标与阶段、违规记入的目录 | 本会话不是主 Agent（inactive，「用 /wish 开启」）；`/wish` 在生效前被取消（§3.1.2）；会话在设计行加载之前就开着，身份节与阶段提醒没有装上（设计行传给写入规则的 `isMainAgent` 在判为主 Agent 而 `installAgentHooks` 没装过这个 agent 时上报，§6.2）；没有会话投影服务；图行未启用；无项目目录（违规不落盘）；没有 `agents` 服务或派发链判不出（设计期只读认不出派发链的根，写明原因）；没有 `userQuestions`（卡片不可用）；读图失败 |

`/glm-status` 与 `/hourness-status`（split 第 4 步加的命令）都列出这一行。

## 7. 与 split 的依赖

开工条件：split 已合入 main（split 0.3 的第 0–4、7、8 步与附录的第 5、6 步；split 第 7 步按 G3、第 8 步按 `question-13` A 都已能做），合入时段里的 profile 切换已完成（附录「合入顺序」的「时段内」）。M3 的第 1、2 步（引擎、纯函数阶段模型）只碰 `src/graph/` 与测试，本身不用 split 的产物，但为了只有一个基点，同样从合入 split 之后的 main 开工。M3 的第 3 步（行登记）与第 11 步（流程条）的开始条件另外写明「question-17 B 的附录评审通过，且附录的第 5、6 步已随 split 合入」：这两步用到的路径都来自附录。流程条一步原定另等 m8-ui-audit 的界面提交合入（它改 `ui/src`）；这一条已满足：m8-ui-audit 的界面提交都在 main 上（最后一个是 `20ed994`），`c8492af` 把它记为 done。

split 的人定事项都已拍板（question-13 至 question-18）。仍未定稿的只有附录本身（以评审 APPROVED 的附录为准；当前状态见 `.agents/tasks/split/addendum-review.json`，各轮意见至今都在 profile 切换脚本、回滚与演练），以及附录「对人定事项的影响」里 question-15 A 在 B 布局下的验收文字（编排者评审后提给人）；两者都不改本设计用到的目录、清单、行登记与探针组合。开工前按 APPROVED 的附录核对文件头列出的十个标题。

guard 的行号：本设计引用的 `src/guard/*.ts` 行号是 main 上的。worktree 第 2 步之后行号有移动（例如 `DECLARATION_SECTION` 由 `src/guard/index.ts`:113 移到 :123，声明监听器由 :196–206 移到 :218–231），`evaluate` 与 `GuardRule.detect`、`declare` 多了 `face` 参数（`src/guard/rules.ts`:126–157）。M3 从合入 split 之后的 main 开工，实现时按那时的文件读；符号与行为不受影响。

| 依赖 | split 的出处 | 状态 | 本设计的用法 | 若形态有变 |
| --- | --- | --- | --- | --- |
| question-17 B 的布局：无伞包、`ui/` 不再是包；编排层包在 `packages/hourness/`，客户端包 `dsh-hourness-ui` 在 `packages/hourness/ui/`，入口仍是 `ui/src/hourness-client.tsx` | 附录「目录」「清单」「第 5 步：宿主包布局，根退出 bundle」「第 6 步：UI 拆分」；`low-decisions.md`；`question-17` B（`69dd424`） | 人已拍板；附录未定稿，以评审 APPROVED 的版本为准（意见至今不涉及这些路径） | 设计行的 patch 文件 `packages/hourness/cordis.patch.yml`，本行排在 `graph-panel` 之后、`ui` 之前（宿主行在客户端行之前）；`scripts/packages.mjs` 的 `hourness.src`、`rows` 与编排层客户端的 `sources`（加 `ui/src/flow/`）；流程条的注册入口；`tests/contracts.spec.ts` 的字面行 id 清单（附录「第 5、6 步的检查与测试」：split 第 6 步之后 13 项，本设计加到 14 项） | M3 第 3 步与第 11 步开工前，按评审定稿的附录目录表重写这几处路径；行 id `glm-hourness/design`、命令名、投影键、节名、工具名、规则名不受影响 |
| 探针组合 | 0.3 §7.3；附录「第 5 步：宿主包布局，根退出 bundle」「第 6 步：UI 拆分」 | split 第 0 步已在 worktree 实现（`ab031b7`，未合入）；`probe-full` 的名单按附录 | M3 的 L3 场景用 `probe-full`（split 第 6 步之后只列 `dsh-glm-zcode`、`dsh-hourness`）与 `probe-hourness`；探针在运行目录下生成 DSH home 与 profile，所以 M3 的场景在 M3 的工作树上直接跑 | 组合名或名单变了只改场景表里的组合名 |
| 标定 profile `glmsandbox` | 附录「glmsandbox」「桌面版 profile：切换前后」 | 待附录评审；切换在合入时段里做 | M3 第 12 步的标定在合入之前、在 M3 的 worktree 上经临时 profile 跑（§9.2），不碰主检出与桌面版；切换后 glmsandbox 列 `dsh-glm-zcode`、`dsh-hourness`，指向主检出，临时 profile 照它的形状复制；标定的覆盖行按行 id 写，不受包名影响 | 不成立时按 `docs/DEVELOPMENT.md` §3 另建临时 profile，用 `DSH_SANDBOX_PROFILE` 指向它 |
| 编排层包名 `dsh-hourness`、客户端包名加 `-ui` | 0.3 §2.1；`question-16` A | 已定 | 行健康与 `/hourness-status` 的分组；插件管理器里看到的包 | 改名只改登记 |
| 公共库的每步 notice 接缝 `src/shared/step-notice.ts`（`installStepNotice(agent, what, eligible, build, row)`，`row` 必填）与镜像文件 `src/shared/zcode-notice.ts`（`wrapSystemReminder`） | 0.3 §2.3、split 第 1 步 | worktree 已实现（`00d1bd5`，未合入；只读核对过签名） | 阶段提醒 | split 未合入时这两个符号在 GLM 目录里，编排层不得导入，所以 M3 第 5 步不能先于 split 开工 |
| 图行服务在 `src/graph/service.ts` | 0.3 §2.3、split 第 1 步 | worktree 已实现（`00d1bd5`） | 加 `focusOf` | 文件名不同只改导入 |
| 工具名换算 `toNativeTool`、`dialectService`、`dialectNames`、`ZCODE_ALIAS_NATIVES` | 0.3 §4.2.2、§4.7、split 第 2 步 | worktree 第 2 步已提交（`0fe76a5`），未合入；签名只读核对过（`src/shared/dialect.ts`:30、60、70、88） | 两条写入规则认 `Write`、`Edit`、`Bash`；纠偏里的工具名随路由 | 同上 |
| 工具名契约 `src/shared/tool-names.ts`（`GRAPH_TOOL_NAMES`、`MEMORY_TOOL_NAMES`、`ORCHESTRATION_RESIDENT_TOOLS`） | 0.3 §2.6、split 第 2 步 | worktree 第 2 步已提交（`0fe76a5`），未合入（`src/shared/tool-names.ts`:11、17、25） | 加 `DESIGN_TOOL_NAMES`；常驻名单加两个名字；契约测试的子集断言改为三者之并（§2.1） | 同上 |
| 行健康分组、`/hourness-status` | 0.3 §2.5、split 第 4 步 | 已设计 | `design` 行进编排层组 | 只改登记 |
| `src/ui/` 改名 `src/report/` | 0.3 §2.2、split 第 5 步 | 已设计 | 晨报读图、`dispatchPanel` | 同上 |
| guard 的范围 | 0.3 §4.2；`question-14` G3（split 第 7 步） | 已定：包启用即对所有路由生效 | 两条写入规则不看路由；`glm:guard` 在 split 第 7 步之后出现在所有路由上，身份节总插在它之前（§3.1.3） | 无 |
| 两个根目标 | 0.3 §6；`question-13` A | 已定 | M3 的节点在 `orch` 下，`orch` 留在 `hourness`；访谈在用户的项目里新建根目标，引擎与布局本来就支持多个根 | 无 |
| split 验收的改写 | 0.3 §14.3、附录「对人定事项的影响」；`question-15` A | 已定，B 下的文字待提给人 | 「只装编排层包时……生效」：设计行在只装编排层包的组合里也要工作，L3 用 `probe-hourness` 跑非 GLM 场景 | 无 |
| V-01 在 split 之后 | 0.3 §14.7；`question-18` A | 已定 | 新行用路径形式的行名，与其余行一致；V-01 改行名时一并改 | 无 |
| 节名前缀 `hourness:` 归编排层、所有路由都加 | 0.3 §9 B5 | 已设计 | 身份节是第一个这样的节；插入规则是 `src/guard/sections.ts` 的 `insertHournessSection`，bootstrap 的项目规则节复用它 | 无 |
| bootstrap 的 harness 写入放在 `src/graph/` | 0.3 §9 B2 | 已设计 | M3 的门禁与放行集合是 `src/graph/stage.ts` 的纯函数，bootstrap 可直接用；卡片回答之后的写入是设计循环专有的，放 `src/design/human-writes.ts` | 无 |
| 目标节点不能有父节点，LLM 不能改目标 | 0.3 F15 | 事实；本设计按 D5 改后一半 | D5 选 A 时，F15 的后一半读作「不能改已批准的目标」；split 只用到前一半（两个根目标），不受影响 | D5 选 B 时不变 |

## 8. 实施分解

每步一个提交，提交信息带节点 id；文档与代码同一提交（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰到 DSH 运行时的步另跑 `npm run probe`（L3，`docs/DEVELOPMENT.md` §1.1）。「今天必败」是这一步新增的 L2 检查在今天的代码上会怎样失败，用来证明测试确实钉住了新行为。分支 `m3`，工作树 `.worktrees/m3`，从合入 split 之后的 main 建。

| 步 | 任务 | 内容 | 层 | 今天必败 | 独立评审 |
| --- | --- | --- | --- | --- | --- |
| 1 | m3-2 | 引擎：`planEdit` 对目标的拒绝收窄为「不是自己的开放提议」（§3.2.1，D5 选 A 之后才做；选 B 时跳过本步）；`graph_edit` 的说明改一句；`tests/graph-engine.spec.ts` 加四例：`llm` 改自己提议的目标的 `acceptance`、`nonGoals`、`stage` 成功；人批准之后同样的 `edit` 为 `forbidden`；`harness` 改 `llm` 提议的目标为 `forbidden`；`llm` 对自己提议的目标 `link` 仍为 `forbidden`。已有的三个「目标被拒」用例不改且通过 | L2 | `llm` 对自己提议的目标 `edit acceptance` 返回 `forbidden` | 是（图引擎的权限与审计，`docs/DEVELOPMENT.md` §1.1） |
| 2 | m3-6 | `src/graph/stage.ts`（阶段的中文名复用已有的 `STAGE_LABELS`，`labels.ts` 不改）与 `src/graph/main-agent.ts`（`MAIN_AGENT_KEY`、`MainAgentView`、`mainAgentActive`，§3.1.2；纯函数，放在这一步，第 3、7、11 步都用它）；`tests/graph-main-agent.spec.ts`：`mainAgentActive` 对值缺席、形状不对、`active` 为真与为假；`tests/graph-stage.spec.ts`：标签解析（全角半角冒号、多行一节、重复标签取第一次、标签前的文字）、需求卡逐项缺一、「岔路」只认人拍的（agent 自拍的待决不算，转述算）、`effectiveStage` 的五行（提议目标没写阶段为 `wish`、写了 `design` 按 `interview` 算、已批准没阶段为无、已关闭为无）、`goalOf`（焦点是目标、是深处的任务、不在图里）、五栏逐栏缺一、放行集合的顺序、放行门禁（未拍板的待决、缺验收的任务、没有设计决策、带 `supersedes` 连线的提议）、确认门禁（目标带 `supersedes` 连线） | L1、L2（不碰运行时，`docs/DEVELOPMENT.md` §12 第 5 条） | 导入 `src/graph/stage.ts`、`src/graph/main-agent.ts` 失败 | 否 |
| 3 | m3-1 | 薄适配层加 `LiveAgentLike.steer`、`AgentsService.roots`、`SessionProjectionsService.stateOf` 与 `UserQuestionsService`；假宿主补 §6.5 的信号；`src/guard/sections.ts`（`DECLARATION_SECTION` 移入，guard 改为从这里导入，`tests/guard-audit.spec.ts` 只改导入）；`src/design/mode.ts`（投影、待生效状态、`isMainAgent`；投影键与 `mainAgentActive` 从第 2 步的 `src/graph/main-agent.ts` 导入）、`identity.ts`、`index.ts`（`/wish`、`installAgentHooks` 与组装监听器、行健康、卸载标志）；行登记与默认禁用（`packages/hourness/cordis.patch.yml`、`scripts/packages.mjs`、`tests/contracts.spec.ts` 的字面清单）；探针的两个手段（§9.1）：`scripts/probe/probe-llm.mjs` 的 `line` 步与占位、`scripts/calibrate/simulated-human.mjs` 的 `wish` 部分，`scripts/sandbox.mjs` 的覆盖行（插 `tool-ask-user` 与模拟人、启用设计行）；`tests/design-mode.spec.ts`：开启、退出、子会话拒绝、无投影拒绝、无图目录拒绝、投影折叠（成功、失败、fork 继承、`settled`）、按 rc.3 次序驱动时空闲 agent 收到 `/wish <一句话>` 后的第一次组装含 `hourness:main-agent`（待生效状态）、空闲时许愿消息走 `followup`、运行中发 `/wish <一句话>` 时走 `steer` 且下一步的消息里有许愿 notice、命令以 error 结束后待生效状态被删、`/wish off` 后的第一次组装没有这一节、在本行激活之前建好的 agent（没有派发过本行的 `agent/created`）发 `/wish <一句话>` 后第一次组装就有这一节与两个设计工具、之后到达的 `agent/created` 不重复安装、没装过的主 Agent 写调用时健康表报 degraded、身份节的位置（有无 `glm:guard`、两个监听器的两种内外次序、经方言改写后）、长度上限；`tests/guard-sections.spec.ts`：`insertHournessSection` 的三种情形 | L2；L3 场景 `glm-design-wish-idle`、`non-glm-design-wish-idle` 与 `glm-design-main`、`non-glm-design-main` 的身份部分（§9.1） | `commands.register` 里没有 `wish`；主 Agent 会话的组装结果里没有 `hourness:main-agent` | 否 |
| 4 | m3-1 | `src/guard/main-agent.ts` 的 `main-agent-no-write` 与 `installMainAgentRules`（依赖由设计行传入）；`rules.ts` 导出 `fileWriteTarget`、`shellWriteOf`，`graph-files.ts` 改用（行为不变）；`tests/design-guard.spec.ts`：主 Agent 的 `Write`、`Edit`、`str_replace_editor`、`Bash` 的 `Set-Content` 与重定向被拒（有无方言服务各一遍），读、图工具、`subagent`、`git commit` 放行，非主 Agent 会话放行，`/wish off` 之后放行，`/wish` 处理函数返回后、`command/done` 之前的调用已被拒（待生效状态），带 `parent` 的子调用放行，拒绝进违规流水；`graph-guard`、`guard-shell` 的用例不变且通过 | L2；L3 `glm-design-main`、`non-glm-design-main` 的写入部分（`/wish` 前后与 `/wish off` 之后的 `Write`、shell 写入，§9.1） | 假宿主上 `/wish` 之后主 Agent 的 `Write` 被放行 | 是（guard 规则） |
| 5 | m3-3、m3-6 | `src/graph/digest-notice.ts`（从 `reminder.ts` 抽出，`tests/graph-reminder.spec.ts` 不改且通过）；图行服务 `focusOf`；`src/design/stage-notice.ts`；`design-before-release`；`tests/design-stage-notice.spec.ts`：每个阶段的正文、没有阶段的目标、已关闭的目标、不变不注入、改了目标正文再注入、压缩重锚、目标轮、无焦点的说明、读图失败本步不带；`tests/design-guard.spec.ts` 加子 agent 在 `interview`、`design` 与提议目标（没写阶段）下被拒，主 Agent 没有焦点、焦点链上没有目标、目标已关闭时被拒，在 `release` 与已批准无阶段的目标下放行，根不是主 Agent 时放行；两层委派（孙 → 子 → 主 Agent，头按 `childSessionMeta` 的形状）在设计阶段孙 agent 的 `Write` 被拒、放行后执行；链上一层不活、子会话头没有 `parentSession`、成环时放行并报健康（原因写明）；图行服务不在、读图抛错时放行并报健康；`focusOf` 在历史与内存不一致时取历史里的焦点（人回退对话之后）；`tests/graph-reminder.spec.ts` 不改且通过 | L2；L3 场景 `glm-design-stage`、`glm-design-stage-compact`（阶段改动经 `line` 步发 `/graph-apply`，§9.1） | 主 Agent 的请求里没有来源 `glm-design-stage` 的 notice；主 Agent 没有焦点时子 agent 的 `Write` 被放行；孙 agent 的 `Write` 被放行 | 是（guard 规则） |
| 6 | m3-5 | `src/design/cards.ts`（卡片构造与回答解析）、`human-writes.ts`、`decision-card.ts`；`tool-names.ts` 加 `DESIGN_TOOL_NAMES`、常驻名单加两个名字；组装监听器对非主 Agent 去掉设计工具；`tests/decision-card.spec.ts`：选中即人拍板（`reason` 含调用 id、`rev` 为重新读到的）、只写文字即批注且批注写「没有选项」、关掉与无通道即 `queued`、`answerPhrase` 对每种回答形状的说法、假宿主拒绝两者都带的单选回答、子 agent 调用 `forbidden`、忙碌、引擎拒绝原样返回、父节点已关闭不出卡；卡片打开期间被批注后选中仍拍板成功、被面板拍成同一选项时不再 `decide` 且 `outcome` 为 `decided`、被拍成另一选项时不推翻且批注写明两者、被丢弃时 `closed`、行在打开期间卸载时不写图并抛错；输出过 schema；`tests/contracts.spec.ts`：设计行注册的名字集合等于 `DESIGN_TOOL_NAMES`，常驻名单是三者之并的子集；非主 Agent 的组装结果没有两个设计工具、主 Agent 的有；模拟人的应答部分（`decisions`、`choose`、`freeText`，§9.1）在这一步加 | L2；L3 场景 `glm-decision-card` 的同步部分（第 1–3 个请求） | 工具不存在；常驻名单里没有 `decision_card` | 是（以人的身份写图） |
| 7 | m3-5 | `/graph-apply` 的回写：`applyFromCommand` 改收活 agent、`RunServices` 与 `lookup`，按 §3.5.2 算通知集合（`agents.roots()`、`mainAgentActive`、图目录的 `sameDir`、`focusOf`、`goalOf`）；`tests/graph-panel.spec.ts`：主 Agent 会话里人拍板、批准、否决之后运行中 `steer`、空闲 `followup`，事实字段齐全；两个主 Agent 会话 A、B 焦点在不同目标下，人在 B 的面板里拍 A 的目标下的待决，A 收到、B 不收到；普通会话的面板里拍板，焦点在同一目标下的主 Agent 收到；两个主 Agent 焦点在同一目标下都收到；两个工作区：两个主 Agent 会话的 `cwd` 指向两个临时目录，各有一张图，节点 id 相同（都有 `goal-1`、`task-1`、`question-1`），焦点都在 `task-1`，在第一个工作区的会话里拍 `question-1`，只有第一个会话收到，结果行只写「本会话」；同一个工作区经大小写不同的路径到达（win32）时两个会话都收到；图行的 `dir` 配置与面板行不同时，候选按图行服务的 `dirFor` 判；非主 Agent 会话、子会话、批注、转述都不发；取不到 `agents` 或图行服务时退回只检查调用会话并在结果行注明；某个会话发送抛错时命令仍成功、其余照发并注明 | L2；L3 `glm-decision-card` 的回写部分（`line` 步发 `/graph-apply decide`，§9.1）；之后编排者把 `d-async-cards` 验证为沙盒验证 | 假宿主上人拍板之后 agent 没有收到任何消息 | 否 |
| 8 | m3-2 | `src/design/review.ts` 的访谈一支；身份文本的访谈部分定稿；模拟人的 `confirm`（覆盖行已在第 3 步）；标定任务 `tests/calibration/interview-expense-log/` 与运行器的 `interview` 种类、`task.json` 的 `limits`（§9.2）；`tests/design-review.spec.ts` 的访谈部分：缺项拒绝且没有发出卡片、目标带 `supersedes` 连线时拒绝、确认即批准并改阶段（`actor` 为 `human`，`edit` 用 `approve` 结果的 `rev`）、面板已批准时只改阶段、`edit` 遇 `stale_revision` 重试一次、点了「要改」即批注「没有写哪里不对」并让模型去问、只写文字即批注「没有选项，写道」、关掉即结束回合、等待期间阶段被改、等待期间目标被否决时 `closed`、行在打开期间卸载时不写图；验收脚本核对：原样的夹具不通过，参考图通过 | L2；L3 场景 `glm-design-interview` | `design_review` 不存在 | 是（以人的身份写图） |
| 9 | m3-3、m3-4 | `review.ts` 的设计一支：放行门禁、五键卡、放行写入、汇报细度；`FIVE_KEYS` 迁到 `cards.ts`（`npm run lint:update` 去掉 knip 基线的 `FiveKey`）；`tests/design-review.spec.ts` 的设计部分：逐栏缺一拒绝、未拍板的待决阻止、带 `supersedes` 连线的提议阻止、批准按序批准放行集合并改为 `release`、改过的节点跳过且阶段不变、卡片打开期间新提的节点不被批准且阶段不变、五键卡请求带两问且第二问没有选项、`FIVE_KEYS` 的说明不含「自主执行」「画像」；§3.4.2 回答表的每一行：「拒绝」加第二问的理由即批注「点了「拒绝」：<理由>」、「拒绝」不带理由、「补充」带与不带文字、「批准」带文字时先批准再批注、讲细点与说重点带文字、只在第一问的输入行写文字（没有选键）即批注「没有选键，写道」且 `outcome` 为 `augment`、只在第二问写文字（第一问跳过）同上、两问都跳过即 `dismissed`、缺第二问的回答当作没有文字；细度上下调与到头不变；模拟人的 `fiveKeys` | L2；L3 场景 `glm-design-release` | 设计阶段的 `design_review` 不存在；五栏无人检查 | 是（以人的身份写图） |
| 10 | m3-5 | 去掉 L1/L2/L3：删 `src/workflow/decisions.ts`；`DecisionRecord` 去掉 `level`；晨报的「决策卡」一节读图（拍板次数扫全部待决的历史）；`dispatchPanel` 去掉 `level`；`tests/workflow.spec.ts`、`hourness.spec.ts`、`s5.spec.ts`、`memory-audit.spec.ts` 随之改：派遣记录没有 `level`，晨报不含 `L1`、`L3`，有「决策卡」一节与三种拍板者的计数（夹具里本期拍板 25 次，计数为 25，不被 20 截断），读不到图时写原因，旧记录带 `level` 照常读 | L2；L3：`glm-decision-card` 末尾经已有的 `command` 步调 `/hourness` 的处理函数核对输出（不需要命令事件） | 今天的晨报含「L1 自主」一行；派遣记录带 `level` | 否 |
| 11 | m3-6 | 流程条：`ui/src/flow/model.ts`、`FlowBar.tsx`，在 `ui/src/hourness-client.tsx` 经 `slots.inject` 注册；`scripts/packages.mjs` 编排层客户端的 `sources` 加 `ui/src/flow/`；`tests/flow-bar.spec.ts`：各阶段的文字、没有阶段与已关闭的目标、等待后缀、待拍板计数、非主 Agent 为空、没有 `graphLive` 时的说明 | L1（`build-ui`、preflight 的客户端检查）、L2；L4 | 模块不存在 | 否 |
| 12 | m3 | 两段，主检出与桌面版只在第二段碰。（a）标定，不占桌面：在 M3 的 worktree 上 `npm run build`，按 §9.2「在哪跑」另建临时 profile（junction 指向 worktree 的 `packages/glm`、`packages/hourness`），`DSH_SANDBOX_PROFILE=<临时 profile> npm run calibrate -- --tasks interview-expense-log --repeat 3`，两档模型（真实请求，消耗积分），用完删除临时 profile；标定结果是这一步的记录。（b）合入与 L4，在约好的桌面时段里（`risk-shared-desktop`；同 split 的合入时段做法）：先关桌面版，再把分支合入 main，合入之后的第一个提交把 `glm-hourness/design` 改为默认启用并同批更新文档（依据：合入前完整探针全部通过与（a）的标定，同 `graph-panel` 行经 L3 探针后默认启用的先例，`docs/ORCHESTRATION.md` §2.10；桌面版 profile 不改，L4 要看的就是默认组合），在主检出上 `npm run build` 与三道门禁，然后启动桌面版做批次 L4（§9.3）；L4 不通过时下一个提交改回禁用，再关桌面版重建。启用之后没有 `/wish` 的会话不受影响：两个设计工具从它们的工具面里去掉，阶段提醒与两条规则只对主 Agent 起作用。时段结束时在对话里说。编排者按证据关闭各节点、把 `d-async-cards` 验证为真机验证 | 标定、L4 | — | — |

先后：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 12（a）→ 12（b）；D5 要在第 1 步开工前拍板：第 1 步只在 D5 选 A 时做，第 2 步的 `requirementCard` 与 `effectiveStage`、第 8 步的确认写入都随 D5 不同（选 B 时按 §3.2.4 写，第 1 步跳过）；第 3 步另等 question-17 B 附录的评审与合入（§7）；第 11 步在第 2 步（`stage.ts` 与 `main-agent.ts` 都在第 2 步建好）与附录合入之后，可与 3–10 并行（m8-ui-audit 已合入，§7）；第 11 步的 L4 要等设计行注册了 `hournessMainAgent`，随第 12 步（b）一起做；第 12 步在全部之后，（a）在 worktree 上、不占桌面，（b）在桌面时段里。第 10 步在第 9 步之后，因为 `FIVE_KEYS` 先要搬走。第 1、4、5、6、8、9 步各自过一次独立评审再合入分支；第 12 步（b）合入 main 之前跑一次完整探针。

每步同批改的文档：

- 第 1 步：`docs/ORCHESTRATION.md` §2.9 `edit` 行、§15「LLM 不能改任何节点的验收条件与非目标」一行。
- 第 2 步：`docs/ORCHESTRATION.md` §4.2（需求卡存在哪）、§4.3（五栏落在哪）、§4.8（阶段的存储与转换）。
- 第 3、4 步：`docs/DESIGN.md` §2.2 行表、§2.4a 接口对照表（命令事件的折叠、命令与第一步的次序、`stateOf`、`steer`、`agents.roots`、`userQuestions` 与客户端单选回答的形状、派发链的会话头）、§2.5 健康表、§5.2 节表（`hourness:main-agent` 与插入规则）、§7 降级表；`docs/ORCHESTRATION.md` §3.1、§6.4（「主 Agent 不写文件」改为已实现）；`docs/DEVELOPMENT.md` §3 的探针场景与两个发命令的手段（已有的 `command` 步不追加命令事件，新的 `line` 步经 `commands.execute`）、模拟人的覆盖行；`docs/ROADMAP.md` 核实清单第 16 项。
- 第 5 步：`docs/ORCHESTRATION.md` §4.5（设计期只读，含无焦点时拒绝；按派发链找根，覆盖各层子 agent）、§3.2 子 agent 一节（:499 那条后面补一句：设计期只读不依赖 `maxDepth`）、§4.8、§6.4（「设计阶段不写代码」改为已实现）、§2.5（`focusOf` 与每步投影同一取法）。
- 第 6、7 步：`docs/ORCHESTRATION.md` §5（同步卡与回写；同步卡原场景按 D6 的结果写归属）、§14 决策卡两行；`docs/ROADMAP.md` 3.5 的借用组件（按 D2）、核实清单第 13、14、15 项（第 15 项按 §9.1 `glm-decision-card` 的核对结果写，L3 一半关闭，L4 一半随 §9.3）。
- 第 8 步：`docs/ORCHESTRATION.md` §4.2、§10.5（新标定任务与它的边界）；`docs/DEVELOPMENT.md` §3（模拟人的应答配置）。
- 第 9 步：`docs/ORCHESTRATION.md` §4.3–§4.5（§4.4 加一段落地：五键卡一次两问，理由与补充在第二问，因为客户端的单选问题只交选项或文字之一；定案表不改）、§14 放行一行；`docs/ROADMAP.md` 3.3 与核实清单第 2 项（按 D2）。
- 第 10 步：`docs/ORCHESTRATION.md` §1 现状、§5 末句、§12 晨报；`docs/DESIGN.md` §2.2 workflow 行。
- 第 11 步：`docs/ORCHESTRATION.md` §4.8 呈现、§13 表的流程条一行。

## 9. 验证

### 9.1 L3 探针场景

覆盖层新增（`scripts/sandbox.mjs`）：插入 `@deepseek-ai/dsh-tool-ask-user`（headless 基础组合没有它）；插入只在探针与标定里加载的模拟人插件 `scripts/calibrate/simulated-human.mjs`（不属于 bundle）；把 `glm-hourness/design` 设为启用。

#### 9.1.1 会话中途经命令生命周期发命令

`/wish` 的状态从命令事件折叠，核实清单第 15 项要看 `/graph-apply` 的命令事件进不进模型请求，所以这两个命令在 L3 上都要经 `commands.execute` 发出，`command/run`、`command/done` 照常进会话日志。分两条路径：

- 空闲路径：模拟人在 `agent/created` 里发（9.1.2 第 1 条）。agent 刚创建、空闲，`/wish <一句话>` 的 `followup` 在处理函数返回之前同步开始回合与第一次组装（§3.1.1），与桌面版上人在空闲会话里输入 `/wish <一句话>` 是同一条路径。一个会话只能这样发一次，而且在它的第一个请求之前。
- 运行路径：探针 provider（`scripts/probe/probe-llm.mjs`）的脚本步加字段 `line: string`。这一步的请求到达之后、回复之前（在 `status`、`live` 的记录之后，与已有的 `command` 同一时刻），探针 provider 取 `agent = ctx.get('agents').get(request.sessionId)`，`await ctx.get('commands').execute(agent, line, [], new AbortController().signal)` 发这一行（commands:327–395），等同于人在 agent 运行时从输入框发命令。已有的 `command` 步不变：它经 `commands.find` 取处理函数直接调用，不追加命令事件（`probe-llm.mjs` `runCommand`；`run-probe.mjs`:417–420 的注释；`docs/DEVELOPMENT.md` §3），只用于不需要命令事件的读取（`status: true` 的 `/glm-status`、`/hourness`），`/wish` 与 `/graph-apply` 不用它。

`line` 的细则：

- 一步里 `line` 与 `command` 互斥，都写时 `parseScript` 抛错，场景开跑之前就失败。
- 时序：第 N 步的 `line` 不影响第 N 步的请求（它已组装完）；处理函数经 `inject`、`steer` 发的消息与角色变化从第 N+1 步的请求起可见；第 N 步脚本里的工具调用在命令之后执行，按命令之后的角色判。所以场景把要按「命令之前」判的调用放在更早的一步。
- 占位，在发命令之前替换：`{lastCard}` 是本次请求的 `messages` 里最后一个名为 `decision_card` 的工具调用（assistant 消息里的 `tool-call` 块）的结果里的 `id`：结果消息的 `toolCallId` 与这个调用的 `id` 相同、不是错误，文本按 JSON 解析。`{rev:<id>}` 是这一刻场景图里节点 `<id>` 的修订号：图目录取 `ctx.get('glmHournessGraph')?.dirFor(agent.session.header.cwd)`，用 `dist/graph/store.js` 的 `loadGraph` 读（`run-probe.mjs` 读场景图也用它）；`<id>` 可以写成 `{lastCard}`。`{lastCardRev}` 是 `{rev:{lastCard}}` 的简写。替换得到的值要匹配 `^[A-Za-z0-9._-]+$`（节点 id 与修订号都在这个字符集里，修订号是 12 位十六进制，`src/graph/store.ts` `revisionOf`），免得替换破坏命令里的 JSON；取不到或不匹配时不发命令。
- 记录：发命令之前在 `ctx.on('session/event', …)` 上挂一个监听器，只收 `session === agent.session` 的事件（headless index.js:335 用同一个事件），`execute` 返回或抛错之后撤掉（不用 `session.eventAt`：rc.3 标为 deprecated、禁止新调用，session:1433–1439）。dump 里这一步加 `line: {text, kind, commandId?, resultText?, events, types, bytes}`：`kind` 是命令结果的 `kind`（`success`、`error`）；`execute` 返回 `undefined`（命令名没注册）记 `unresolved`，抛错记 `threw`，占位取不到记 `placeholder`；`events`、`types` 是收到的事件数与类型，`bytes` 是它们 `JSON.stringify` 之后的 UTF-8 字节数之和。场景核对把 `kind` 不是期望值（默认 `success`）的一步判失败。

#### 9.1.2 模拟人插件

配置 `{wish?: true | string, confirm: Array<{label: string} | {text: string}>, fiveKeys: Array<{label?: string, text?: string}>, decisions?: Array<'recommended' | 'close'>, choose: 'recommended', freeText?: string}`（`fiveKeys` 每项至少有一个字段；`freeText` 默认「按你的推荐来，细节你定」），不合法的项与未知字段告警并忽略。

1. 发 `/wish`（空闲路径）：只在配置了 `wish` 时发（`true` 发 `/wish`，字符串发 `/wish <它>`）。在 `agent/created`（serial，agent:581–585）里，只对会话头不带 `origin` 的 agent（根 agent）发；`signal` 取载荷里的，载荷没有时用 `new AbortController().signal`（`commands.execute` 无条件读 `signal.aborted`，commands:332）；在这个串行监听器里 `await commands.execute(agent, '/wish …', [], signal)`（commands:327）。agent 工厂的 `publish` 等这个事件结束才返回（agent-loop:1786–1794），headless 在那之后才 `await agent.whenIdle()` 并 `followup` 任务（headless index.js:317–346），所以命令事件一定在任务消息之前；`/wish <一句话>` 唤醒的回合在任务回合之前跑完。`execute` 返回 `undefined`（命令名没注册，即设计行没有启用）或抛错时告警，并在 `human.jsonl` 写一条 `{kind: 'wish-failed', reason}`。
   监听器的次序：加载器并发创建同一组里的各行（cordis-plugin-loader:87），激活次序不保证跟配置顺序（§3.1.3），模拟人的 `agent/created` 监听器可能排在设计行与别的行前面。设计行不依赖这一点：`/wish` 的处理函数在开启之前自己调 `installAgentHooks`（§3.1.3），第一次组装一定有身份节与两个设计工具。别的行（方言、guard 的声明、图投影）的每 agent 监听器在这一刻可能还没装上，这是在 `agent/created` 里发命令才有的情形（桌面版上人发 `/wish` 时会话早已建好），所以空闲路径的场景在第一个请求里只核对设计行自己的部分，节的位置在任务回合的请求与运行路径的场景里核对。
2. 应答：在每个 agent 的 `agent.ctx` 上监听 `user-questions/request`（应答链按 agent 作用域派发，user-questions:681），回答只用客户端会交的形状（client-ui-user-questions client.js:937–948）：单选问题要么 `{id, selected: [说法]}`，要么 `{id, selected: [], custom}`，跳过为 `{id, selected: []}`。`hourness-confirm` 依次取 `confirm`：`{label}` 答成选项，`{text}` 答成只写文字。`hourness-five-keys` 依次取 `fiveKeys`：`label` 答第一问（没有 `label` 时第一问跳过），`text` 答第二问 `hourness-five-keys-note` 的 `custom`（没有 `text` 时第二问跳过）。`hourness-decision` 配置了 `decisions` 时依次取：`'recommended'` 选推荐项，`'close'` 以 `ASK_CANCELLED` 拒绝；没有配置时按下一条答（标定任务就是这样）。其余问题：有选项时选说法带 `(Recommended)` 的一项、没有就选第一项（多选同样只选这一项）；没有选项时答 `custom: freeText`。`confirm`、`fiveKeys`、`decisions` 用完时以 `ASK_CANCELLED` 拒绝（当作人关掉卡片）。
3. 每次请求与回答写进运行目录的 `human.jsonl`。

#### 9.1.3 场景

每个场景的工作区有空的 `docs/graph/` 与 `README.md`（另写明的除外）。「请求 k」是根会话的第 k 个模型请求，后面跟它的脚本回复。

| 场景 | 组合与模型 | 核对 |
| --- | --- | --- |
| `glm-design-wish-idle` | `probe-full`，`glm-probe`；模拟人 `wish: '记一下每天花了多少钱'` | 请求 1（`/wish` 唤醒的回合，回复 `ok`）就有 `hourness:main-agent` 与两个设计工具，消息里有许愿 notice（来源 `glm-design-wish`，原话逐字）：待生效状态与 `installAgentHooks` 在真运行时上的核对；请求 2（headless 的任务回合，回复 `done`）里节位于方言节之后、`glm:guard` 之前（核实清单第 16 项）；`human.jsonl` 里 `/wish` 的结果为 success |
| `non-glm-design-wish-idle` | `probe-hourness`，非 GLM 探针模型（同 `non-glm-graph`）；模拟人同上 | 同上；这条路由没有方言节，G3 之后有 `glm:guard`，身份节在它之前 |
| `glm-design-main` | `probe-full`，`glm-probe`；模拟人不发 `/wish` | 脚本见下 |
| `non-glm-design-main` | `probe-hourness`，非 GLM 探针模型；模拟人不发 `/wish` | 同 `glm-design-main`，工具名是原生名（`write`、`pwsh`），位置只核对在 `glm:guard` 之前 |
| `glm-design-stage` | `probe-full`；模拟人 `wish: true`；图里预置一个 `llm` 提议的 `goal-1`（`stage: interview`，正文只有 `需求：`） | 脚本见下 |
| `glm-design-stage-compact` | 同上，另加 `glm-graph-compact` 的低压缩阈值覆盖行 | `graph_focus goal-1`，再读两次 `README.md`；压缩检查点之后的请求里有 `glm-design-stage` notice，`designStage.reason` 为 `compaction` |
| `glm-decision-card` | `probe-full`；模拟人 `wish: true`、`decisions: ['recommended', 'close']`；图里预置一个人提议（因而已批准）的 `goal-1` | 脚本见下 |
| `glm-design-interview` | `probe-full`；模拟人 `wish: true` | 脚本化的模型按八步写图；需求卡缺项时 `design_review` 报 `gate_unmet` 且 `human.jsonl` 里没有对应的请求；补齐后确认，目标为已批准、`stage: design`，两条历史 `actor` 为 `human`、`reason` 含调用 id |
| `glm-design-release` | `probe-full`；模拟人 `wish: true`（`fiveKeys`：`{label: '拒绝（带理由）', text}`、`{text}`、`{label: '批准'}`） | 缺一栏时 `gate_unmet`；补齐后卡片请求带两问、第二问没有选项（`human.jsonl`）；第一张卡得到 `reject` 与目标上「点了「拒绝」：<理由>」的批注；第二张卡（只写文字）得到 `augment` 与「没有选键，写道」的批注；第三张卡批准，放行集合全部为已批准、目标 `stage: release`；放行之后子 agent 的 `Write` 执行 |

`glm-design-main` 的脚本（`non-glm-design-main` 同形）：

1. 请求 1：没有 `hourness:main-agent`、没有两个设计工具。回复 `Write .llm/before.txt`：执行。
2. 请求 2：同上。回复 `Read README.md`，`line: '/wish'`（运行中，处理函数用 `inject`）。
3. 请求 3（`status: true`）：有这一节与两个设计工具，节位于方言节之后、`glm:guard` 之前；工具面等于请求 1 的工具面加两个设计工具；消息里有「已当主 Agent」的 notice；`/glm-status` 的 `design` 行生效。回复 `Write .llm/main.txt`：被拒，错误文本是 `main-agent-no-write` 的纠偏，违规流水多一条。
4. 回复 `Bash` 的 `Set-Content`：被拒，纠偏同上（不是 file-tools-only 的「改用 Write 或 Edit」）。
5. 回复 `graph_open`：执行。
6. 回复 `Read README.md`，`line: '/wish 记一下每天花了多少钱'`（运行中，`steer`）。
7. 请求 7：消息里有许愿 notice，原话逐字（运行中走 `steer`、下一步收到）。回复 `Read README.md`，`line: '/wish off'`（`inject`）。
8. 请求 8（`status: true`）：没有这一节与两个设计工具，消息里有「已退出主 Agent 模式」的 notice；`design` 行未生效。回复 `Write .llm/after.txt`：执行。
9. 回复 `done`。三个 `line` 的 `kind` 都是 `success`，`types` 都是 `command/run`、`command/done`。

`glm-design-stage` 的脚本（子 agent 按派发次序取 `others` 里的脚本，每个都是「`Write sub-<k>.txt`，然后 `done`」）：

1. 请求 1：主 Agent 还没有焦点。回复 `subagent`（让子 agent 写 `sub-1.txt`）：子 agent 的 `Write` 被拒，越界一句是 `design-before-release` 的「no open goal in focus」。
2. 回复 `graph_focus goal-1`。
3. 请求 3：在本步已接纳的消息之后带 `glm-design-stage` notice（与图行的每步投影谁在前不定，取决于两行每 agent 监听器的安装先后，不核对），列出需求卡的缺项，`designStage.reason` 为 `goal`。回复 `Read README.md`。
4. 请求 4：没有这条 notice（不变）。回复 `graph_edit goal-1`，在正文加一行 `问题：…`（`rev` 取预置之后读到的修订号；D5 选 A 时可行，选 B 时改为编辑需求卡节点）。
5. 请求 5：有 notice，`reason` 为 `changed`，缺项少一项。回复 `Read README.md`，`line: '/graph-apply {"op":"approve","id":"goal-1","rev":"{rev:goal-1}","reason":"probe approve"}'`。
6. 请求 6：消息里有 `glm-graph-decision` notice（批准也回写，§3.5.2）。回复 `Read README.md`，`line: '/graph-apply {"op":"edit","id":"goal-1","rev":"{rev:goal-1}","set":{"stage":"design"},"reason":"probe stage design"}'`。
7. 回复 `subagent`（`sub-2.txt`）：被拒，越界一句写 `stage design (goal goal-1)`。
8. 回复 `Read README.md`，`line: '/graph-apply {"op":"edit","id":"goal-1","rev":"{rev:goal-1}","set":{"stage":"release"},"reason":"probe stage release"}'`。
9. 回复 `subagent`（`sub-3.txt`）：执行，文件存在。
10. 回复 `done`。违规流水里有两条 `design-before-release`。

`glm-decision-card` 的脚本：

1. 回复 `graph_focus goal-1`。
2. 回复 `decision_card`（挂 `goal-1`，两个选项，推荐 `A`）：`human.jsonl` 有一次卡片请求，模拟人选推荐项；结果 `decided`；`question-1` 最后一条历史是 `human` 的 `decide`，`reason` 含调用 id。
3. 回复第二个 `decision_card`：模拟人关掉；结果 `queued`；`question-2` 已批准、未拍板，在 `openItems.questions` 里。
4. 回复 `Read README.md`，`line: '/graph-apply {"op":"decide","id":"{lastCard}","rev":"{lastCardRev}","option":"A","reason":"probe decide"}'`：`kind` 为 `success`，结果文本含「已通知主 Agent：本会话」；`types` 为 `command/run`、`command/done`；`events`、`bytes` 写进场景结果（核实清单第 15 项的 L3 一半，交给 `docs/ROADMAP.md`）。
5. 请求 5：消息里有 `glm-graph-decision` notice，写明 `question-2` 选 `A`；除这条 notice 之外，没有消息含这次 `/graph-apply` 的输入（`"op":"decide"`）或它的结果文本（命令事件不进模型请求）；每步投影带 `question-2` 的 `decided`。回复 `done`，`command: {name: 'hourness', input: ''}`：输出有「决策卡」一节、没有 `L1`。

这些场景不消耗积分（探针 provider 不联网）。合入 main 之前全部探针一次通过。

### 9.2 标定任务 `interview-expense-log`

- 提示词（`prompt.md`）：「我想要一个命令行小工具，每天记一下花了多少钱，月底能看出钱花在哪了。」运行器把它作为人的第一条消息；模拟人在根 agent 创建时先发 `/wish`（不带文字），所以第一步同时收到「已当主 Agent」的 notice 与这句话。
- 夹具：一个只有 `README.md` 与空的 `docs/graph/nodes/.gitkeep` 的仓库（存储只读 `.json`，`.gitkeep` 不算节点）。
- `task.json`：`{"kind": "interview", "touches": ["docs/graph/"], "limits": {"maxSteps": 90, "minutes": 30}, "human": {"wish": true, "confirm": [{"label": "确认，进入设计"}], "fiveKeys": [{"label": "补充", "text": "数据只存在本机，一个文件就够"}, {"label": "批准"}], "choose": "recommended"}}`。五键卡的第一张答「补充」与第二问的文字，第二张只答「批准」、第二问跳过，都是桌面版上会出现的回答形状。运行器对 `interview` 种类加 §9.1 的三条覆盖行，并把 `design_review`、`decision_card` 计入「打扰人」。
- 边界：运行器今天的默认是 `--max-steps 40`、`--minutes 15`（`scripts/calibrate/run-calibrate.mjs`:46–47），对所有任务一样。这个任务的步数估计：访谈 8 问各一次提问加一次写图约 16 步，提目标、聚焦、风险 2–3 个、决策卡 1 次、确认 1 次约 6 步，设计决策与五栏 2 步、规划节点 3–5 步、两轮五键卡 2 步，合计约 30–45 步，`gate_unmet` 之后的补写与重试另加。所以运行器改为按任务读 `task.json` 的 `limits`：命令行显式给了 `--max-steps`、`--minutes` 时用命令行的，否则用任务的，任务没写时用 40 与 15（`parseArgs` 去掉这两项的默认值，在任务循环里取 `flag ?? task.limits?.maxSteps ?? 40`，`limitsRow` 按任务生成；`limits` 的两个值同命令行一样要是正整数，不是时运行器在开跑之前报错退出，退出码同命令行的用法错误；`results.json` 的 `options` 改为按任务记下实际用的边界）。90 步、30 分钟是估计的两倍，标定结果里的 `stop` 为 `step-limit` 或 `time-limit` 时，记作「边界不够」而不是模型失败，单独列出。
- 在哪跑：`glmsandbox` 的两个包是指向主检出的 junction（`docs/DEVELOPMENT.md` §3；附录「glmsandbox」写切换之后仍指向主检出的 `packages/glm`、`packages/hourness`），而桌面版 profile 的两个包同样指向主检出（附录「桌面版 profile：切换前后」）。在主检出上 `npm run build` 会同时换掉正在运行的桌面版要加载的产物：宿主行要重启才生效，客户端产物重建后刷新页面会 404（`docs/DEVELOPMENT.md` §7 的 2026-10-28 一行）；桌面版由人与并行的工作线共用（`risk-shared-desktop`，m8-ui-audit 就驱动过它）。所以标定不用 `glmsandbox`、不在主检出上构建：第 12 步（a）在 M3 的 worktree 上 `npm run build`，另建一个临时 profile（复制 `glmsandbox` 的配置文件，两个 junction 改指 worktree 的 `packages/glm`、`packages/hourness`），以 `DSH_SANDBOX_PROFILE` 给出它的名字，用完删除；这属于「另建临时 profile」（`docs/DEVELOPMENT.md` §3），不改 `glmsandbox` 与桌面版的 profile。主检出上的构建只在第 12 步（b）的桌面时段里做，那时桌面版是关着的。
- `check.mjs`（独立进程，读运行目录里 `ws/docs/graph` 与违规流水）：
  1. 图没有校验错误；恰好一个目标，已批准，`stage: release`；正文的四个标签都非空，`acceptance`、`nonGoals` 各至少 1 条。
  2. 目标下至少 1 个风险；至少 1 个已拍板的待决，最后一次 `decide` 的 `actor` 为 `human` 或带 `relay`（与需求卡「岔路」一项同一判据，§3.2.2；标定里由决策卡写入，实际是 `human`）。
  3. 至少 1 个已批准的决策，五栏都齐；至少 1 个节点以 `source` 连线指向它。
  4. 目标子树里没有提议；放行的节点都由卡片批准。「放行的节点」的判定：目标子树里除目标外，首条历史 `op` 为 `propose`、`to` 为 `proposed` 的每个节点。对每个这样的节点：现状不是 `proposed`；历史里有一条 `op: 'approve'`、`actor: 'human'`、`reason` 含 `design_review` 的记录（D5 选 B 时，标题为「需求卡」的决策节点改为要有一条同样出处的 `op: 'reject'`）。提议时就直接批准的风险与待决（首条历史 `to` 为 `approved`，`engine.ts`:281–292 `initialStatus`）不在此列；提议之后没有别的路离开 `proposed`（`approve`、`reject` 只有人能做，`TRANSITIONS.proposed` 为空，`engine.ts`:88、106–107），所以一个被人在别处批准或否决的节点会因为缺这条记录而不通过，标定里也不该有这种节点。
  5. 目标历史里有人的确认（批准与改阶段，`reason` 含 `design_review`）与一条「人在五键卡上点了「补充」：」开头的批注。
  6. 工作区除 `docs/graph/` 外没有改动（git 状态）。
- 另记的指标（写进 `result.json`）：`ask_user_question` 次数与带选项的比例、到放行的轮数（`design_review` 次数）、`gate_unmet` 次数、主 Agent 被拦次数。
- 核对验收脚本：原样的夹具不通过，手写的参考图通过（同已有任务的做法，`docs/ORCHESTRATION.md` §10.5.1）。
- 限制：headless 运行器在主 Agent 第一次静止空闲时退出（`docs/ORCHESTRATION.md` §2.1），所以整段访谈要在一个回合里完成。人的回答都在工具调用里回来，回合本来就不需要结束；模型中途用纯文本发问而结束回合时，这次运行不通过，这正是要量的。

### 9.3 批次 L4

在第 12 步（b）的桌面时段里做一次（M3 合入、设计行改为默认启用、主检出重建之后），按 `risk-shared-desktop` 提前约桌面时段，合入与重建时桌面版是关着的（split F17；`docs/DEVELOPMENT.md` §7 2026-10-28：桌面版运行时重建客户端产物再刷新页面，客户端半返回 404）。用 GLM-5.3 与 DeepSeek 各开一个会话，各开在一个临时工作区里（主检出 `.llm/` 下的两个目录，各只有 `README.md` 与空的 `docs/graph/`），免得 L4 的访谈写进本仓库的项目图：

1. `/wish <一句话>`：会话文件的系统提示词里有 `hourness:main-agent`，位置同 L3；`/glm-status` 的 `design` 行生效。
2. 让主 Agent 写一个 `.llm/` 下的草稿文件：被拒，违规流水有记录；`/wish off` 之后同样的写入执行。
3. 访谈中 `ask_user_question` 的卡片标出推荐项；`decision_card` 的卡片显示 Markdown 详情、带后果的选项与推荐；选中之后 4 秒内面板显示这张待决由「你」拍板。
4. 关掉一张决策卡：它出现在面板「需要你」里；在面板里拍板，主 Agent 收到消息并接着做（核实清单第 13 项按卡片在工具体里发出的形态改写后关闭）；会话文件里这次面板写回增加的事件数与字节数与 L3 的记录同量级，模型请求里没有 `/graph-apply` 的命令事件（核实清单第 15 项的 L4 一半，之后关闭这一项）。两个工作区的图各自从 `goal-1` 起编号，两个主 Agent 的焦点 id 相同：一边面板上的拍板只通知同一工作区的主 Agent，另一边的会话不收到消息（§3.5.2 条件 C 的真机核对）。
5. 确认卡与五键卡：五键卡走通用问题流，五个按钮与详情都在；选键后翻到第二问，第二问以文本框出现，「跳过」即提交，能翻回第一问看详情；点「拒绝」并在第二问写理由，目标上的批注是「点了「拒绝」：<理由>」；在第一问的输入行直接打字时选项被清掉，批注写「没有选键」；确认卡上点「要改」与只写文字各一次，批注如实区分；批准之后面板里的虚线框变实线，历史写「你」与卡片出处。
6. 流程条：主 Agent 会话里显示阶段、缺项与「等你批准」，普通会话里没有。
7. 桌面版日志没有本包的新错误；用过模型菜单就换回 `agent-default-model`（`docs/HANDOFF.md` 的记录）。

## 10. 不做的事

- 分解与派发（派发工具、写入范围门禁、goal 驱动）、`release` 之后的阶段：M7。
- 汇报细度写入画像、学习流水线：M5。
- guard 的申报通道（出工作区操作接决策卡、批准只放行当次）：D6 选 A 时归 M4，选 B 时 M3 做最小申报（§12 D6）。
- 新门禁的影子模式机制、提问形状的门禁：M4。
- 经卡片放行带 `supersedes` 连线的提议（门禁拒绝，人在面板上批准或带转述）。
- 特性上的设计循环（`design_review` 只收目标）；一次审多个目标。
- 流程页（点开流程条）、回合末尾卡片、决策日志页：M8。
- 改图引擎的其他规则（只改 D5 这一条）；加配置项；自动建 `docs/graph`（bootstrap）。
- 接入 DSH 计划模式与 `user-approval`（D2 选 B 时）。
- PTC `run_code` 里的嵌套写入：带 `parent` 的子调用对所有规则都放行，是 guard 现有的缺口，记给 M4。
- 主 Agent 写入判定（`main-agent-no-write` 与 `design-before-release` 共用）的其余缺口，与 file-tools-only 相同：shell 判写是启发式（`src/guard/rules.ts` `fileToolsOnly` 与 `src/guard/shell.ts` 的 `shellWrites`），只认重定向与列出的命令。解释器写文件（`node -e`、`python -c`、`pwsh -c` 里调 .NET 的写文件 API）、改动工作树的 git 子命令（`git checkout -- <文件>`、`git apply`、`git stash pop`、`git restore`；规则里 git 子命令一律不算写）、包脚本（`npm run <脚本>` 里的写入）都放行。主 Agent「一律不写」的约束比 file-tools-only 更强，这些缺口对它影响更大；补齐属于 guard 的判写本身，记给 M4，与上一条一起做。m3-1 的验收第 2 条按此写成「文件工具写入与 file-tools-only 判为写文件的 shell 命令被拒」。
- `/graph-apply` 的通知只发给同一张图上、焦点在被写节点所属目标下的主 Agent 会话（§3.5.2）。主 Agent 还没有焦点、或焦点在别的目标下时收不到；它下一次聚焦到这个目标，每步投影里已是新的状态。别的工作区（别的图）里的主 Agent 一律不收。
- 设计行激活之前就已开着的会话不补装每 agent 的监听器（与 guard 行、图行一致）：这些会话发一次 `/wish` 才带上身份节与阶段提醒，在那之前健康表报 degraded（§6.2）。
- 改 ZCode 原文与方言。

## 11. 由 agent 定、人可推翻的事项

命名：行 `glm-hourness/design`、目录 `src/design/`、命令 `/wish`、投影 `hournessMainAgent`、节 `hourness:main-agent`、工具 `design_review` 与 `decision_card`、规则 `main-agent-no-write` 与 `design-before-release`、notice 来源 `glm-design-wish`、`glm-design-stage`、`glm-graph-decision`（沿用 `glm-graph-*`、`glm-*` 的已有写法）、卡片 id `hourness-confirm`、`hourness-five-keys`、`hourness-decision`。

做法：

- 两条写入规则由设计行注册，不放进 guard 行：规则跟着提供正路与角色的那一行走，同图文件门禁（`docs/ORCHESTRATION.md` §15 的取舍）。
- 两条规则直接拦截，不先走影子模式。依据：`docs/ROADMAP.md` 3.1「guard 拦主 Agent 的写入」与 3.3「设计期只读由 guard 实现」，以及 `d-dispatch`（用户定的「主 Agent 不写代码也由 guard 拦，不用预设」）；作用范围是人亲手用 `/wish` 开启的角色，误伤面小；通用的影子机制属于 M4，现在没有；每次拒绝进违规流水，误伤可以从流水里量。这与 `docs/CHARTER.md` §6「新门禁先以影子模式运行」有张力。§6 是调校原则，不在 §7.1 的条款里，§7.2 的裁决顺序不直接适用；这里按 §7.2 的做法记成一个决策节点：交给编排者在 `m3` 下提一张决定者为 `agent` 的待决「两条设计规则直接拦截、不走影子期」（选项 A 直接拦截，依据如上；B 先影子一段时间，等 M4 的机制），由 agent 拍 A，人可推翻（§13）。
- 设计期只读按派发链找根（`dispatchRoot`），不按 `maxDepth` 只看一层；链用「每跳一个不同的活 agent」来保证走得完，不设固定跳数上限（§3.3.3）。
- 设计期只读在判不出时（取不到 `agents`、派发链断了或成环、图行服务或图读不到）放行并上报（fail-open）；主 Agent 没有焦点或焦点链上没有目标时拒绝（§3.3.3）。
- `focusOf` 先取会话历史里的焦点、再取内存，与每步投影同一个函数（§3.6.1）。
- 五键卡一次两问：第一问五个键，第二问理由或补充（§3.4.1）；代价是不写字的回答要多点一下「跳过」。不选的做法：保留一问、只写文字记成 `outcome: 'text'`，「拒绝」没写理由时由主 Agent 追问。那样 §4.4〔定案〕的「理由随拒绝返回」变成两步，要人同意改定案的含义。
- 五键卡上五个键的说明写 M3 实际做的事（§3.4.1 的表）：「批准」不写「进入完全自主执行」（分解与派发在 M7），「讲细点」「说重点」不写「记入画像」（M5）；那两步接上时再把说明改回。键名不变。
- 确认卡与决策卡保持一问，不加附言问题：确认卡上「要改」不带文字时由主 Agent 用 `ask_user_question` 追问，决策卡上的文字只作批注；多一问会让每张卡多点一次。
- 批注与 `reason` 里描述回答的说法只由 `answerPhrase` 生成，写人实际的动作；「没有选键、只写了文字」对模型按补充处理，历史里照实写「没有选键」。
- 当前目标只有一种定义（`goalOf`）；已批准、没有阶段的目标不走设计循环，子 agent 写文件不受限。
- 主 Agent 的工具面切换不追求缓存稳定（§3.1.3）。
- 卡片回答之后一律重新读图，按当前状态分支；人在面板上已拍的板不被卡片推翻。
- 确认卡与放行不收带 `supersedes` 连线的节点（门禁拒绝），不在卡上另列被连带取代的节点。
- 晨报的拍板次数扫全部待决的历史。
- 标定任务的边界写在 `task.json` 的 `limits`，运行器按任务读取。
- `insertHournessSection` 放在 `src/guard/sections.ts`，主 Agent 投影值的纯函数放在 `src/graph/main-agent.ts`。
- 访谈的提问形状不设门禁，只写进身份文本并在标定里计数：规则越少越稳（`docs/CHARTER.md` §7.3 的 IFScale 依据），形状检查也判断不了问题是不是问在项目经理这一层。标定若显示主 Agent 常问不带选项的问题，再在 M4 加。
- 阶段 `release` 存进目标，表示已放行；`decompose` 留给 M7。
- 五栏落在设计决策节点上，正文用固定标签；规划用 `source` 连线；放行批准目标子树里卡上列出的全部提议。
- 关掉同步卡即转为异步卡。
- 面板拍板、批准、否决之后，通知同一张图上、焦点在被写节点所属目标下的主 Agent 会话（候选取进程级的 `agents.roots()`，再按图目录 realpath 相等、焦点所属目标相同过滤），与面板开在哪个会话里无关；候选的图目录用图行服务的 `dirFor`（它的焦点 id 属于那张图）；调用面板的会话不单独加入，不在同一张图上或焦点在别的目标下时不唤醒它；取不到判定所需的服务时退回只检查调用会话（§3.5.2）。
- `/wish` 的处理函数开启之前自己调 `installAgentHooks`，不依赖本行的 `agent/created` 监听器先于别的插件运行；不在激活时给已开着的 agent 补装（§3.1.3）。
- L3 在会话中途发命令用探针 provider 新增的 `line` 步（经 `commands.execute`，命令事件进日志）；空闲路径由模拟人在 `agent/created` 时发 `/wish`（§9.1.1）。
- 第 12 步的标定在合入之前、在 worktree 上经临时 profile 跑，主检出上的构建只在桌面时段里做；设计行在合入后的第一个提交里改为默认启用，L4 看默认组合，不通过就改回禁用（§8 第 12 步）。
- 晨报的决策一节读图；派遣调用另起一行计数。
- 一个会话同时只开一张设计卡片。
- 流程条 M3 只显示。

## 12. 待人定的事项

### D1 主 Agent 由谁开启、作用在哪些会话

- A（建议）：按会话，人用 `/wish` 开启、`/wish off` 退出；状态在会话日志里，续跑、压缩、重启不丢。后果：没开启的会话完全不受影响；换一个新会话接着做同一个项目，要再输一次 `/wish`（不带文字即可，主 Agent 从图上的阶段接着做）。
- B：工作区里有项目图目录时，设计行启用就让每个根 agent 都是主 Agent。后果：不用命令；但这个工作区里的每个 DSH 会话都不能写文件，包括本仓库，人要直接改代码只能禁用设计行。
- C：设计行启用时，所有工作区的根 agent 都是主 Agent。后果：启用期间 DSH 不能用来直接写代码。

### D2 两个借用组件改为本项目的卡片工具

ROADMAP 3.3 写「五栏门禁挂在 `exit_plan_mode`」，3.5 写「同步借用 `user-approval` 与 `user-questions`」。

- B（建议）：放行用 `design_review` 的五键卡，同步卡用 `decision_card`，两者都经 `userQuestions.ask`；计划模式与 `user-approval` 在 M3 不用。理由：`exit_plan_mode` 要先进入计划模式，桌面版上宿主插件要经未核实的 `serviceFor`，审阅卡只有两个选项、五键要另出一张卡；用户的审批策略是 `never`，`approval.request` 直接拒绝、卡片不出现（§3.3.4、§3.5.1）。后果：ROADMAP 3.3、3.5 与 `docs/ORCHESTRATION.md` §4.5、§5、§14 随代码改写；核实清单第 2、14 项不再需要；`d-async-cards` 与 `m3-5` 正文里借用 user-approval 的那一句由编排者带人的原话改写（§13）。同步卡原定场景的去留另见 D6。
- A：照 ROADMAP 原文。后果：先核实清单第 2 项；每轮方案人要在五键卡与计划审阅卡上各点一次；同步卡在用户当前的设置下永远被拒，除非人把审批策略改为 `ask`（这会让 DSH 对其他操作也弹审批）。
- C：B 加上兼容：人自己开了 `/plan` 时，`exit_plan_mode` 的批准也算放行。后果：两条放行路径，门禁与写入要维护两份。

### D3 卡片上的回答以人的身份写进图

- A（建议）：确认卡、五键卡、决策卡的回答由 harness 以 `human` 写图，`reason` 与批注写明哪张卡、点了什么（没有选时写明没有选、写了什么）、调用 id（§3.4.3、§3.4.2 的 `answerPhrase`）。后果：面板里这些改动显示为「你」，与面板操作同一身份；多了一个人的身份入口，按图引擎的权限与审计独立评审。
- B：卡片只把回答交给模型，由模型带转述写图。后果：历史显示「你在对话里说」，与实际（点了卡片）不符；写不写、怎么引用取决于模型。
- C：卡片只提示，人到面板里再批准一次。后果：每次放行人要操作两处；headless 标定还要模拟面板。

### D4 六个任务节点的验收条件与标定任务的模拟人

- A（建议）：把 §1.2 表里「建议验收」一列写进 `m3-1` 到 `m3-6` 的 `acceptance`（由编排者带人的原话写入）；标定任务的模拟人总选推荐项、确认卡点确认、五键卡先补充一次再批准，「走通」指 GLM-5.3 三次里至少一次通过验收脚本，两档模型的结果都记作基线。
- B：人改写其中的条目或通过标准。

### D5 引擎是否允许 LLM 改自己提议、仍为提议的目标

访谈第 2–5 步要把答案写进主 Agent 自己提议的目标，今天的引擎一律拒绝（§3.2.1）。「LLM 不能改目标」是 2026-10-28 用户批准的原型规则（`docs/ORCHESTRATION.md` §2.9 `edit` 行；§15 写为「agent 定（按原型）」），改它属于以后改起来很贵的方向性岔路（`norm-decision-tiers` 第 5 类），所以问人。

- A（建议）：改引擎，自己提议且仍为 `proposed` 的目标可以 `edit`，已批准的目标照旧不能改，目标的连线照旧不能改（§3.2.1 的代码与四个测试）。后果：访谈每答一题，目标的虚线框里就多一段正文或一条验收，「图实时生长」原样成立；需求卡只有一个落点；引擎改动按「图引擎的权限与审计」独立评审；§2.9、§15 与 split F15 的后一半读法同批改写。风险：LLM 可以在人确认之前随意改自己提的目标，但它仍是虚线，人在确认卡上看到的是改完的整张需求卡。
- B：引擎不改，访谈产出写在目标下一个叫「需求卡」的决策节点上，确认时 harness 以人的身份把它搬进目标并否决这个节点（§3.2.4）。后果：引擎规则一条不动；需求卡在确认前后换了落点，`stage.ts`、确认写入与测试都按两处写；访谈期间目标本身只显示「需求」一行，其余在子节点里；多一种约定（标题恰为「需求卡」的决策节点），以后 bootstrap 也要知道它。
- C：引擎不改，主 Agent 带转述写目标（把人在 `ask_user_question` 里的回答当作 `relay`）。后果：每一条访谈写入都有人的权限，历史显示「你（经对话）」，但写进去的验收与非目标多半是模型组织的文字而不是人的原话，转述的含义被冲淡；确认卡失去意义。不建议。

### D6 同步决策卡原定的场景归谁

`docs/ORCHESTRATION.md` §5 的决策卡表把同步卡的场景定为「出工作区操作、往工作区外装工具：阻断当次操作，等人批」，要求批准只放行当次；`docs/ROADMAP.md` M3 3.5 写「同步借用 `user-approval` 与 `user-questions`」。本设计的 `decision_card` 用于访谈与设计中的岔路，不接 guard 的拒绝（§3.5.1）。`docs/ROADMAP.md` M4 的条目与 §6.4 的规矩清单里没有这项工作，guard 纠偏里「file a request」的正路今天没有通道（`docs/ORCHESTRATION.md` §6.1）。

- A（建议）：归 M4。编排者在 `m4` 下提一个任务节点「guard 申报通道接决策卡」（正文：工作区圈禁拒绝之后经决策卡申报，批准只放行当次，复用 M3 的 `src/design/cards.ts` 与 `human-writes.ts`），`docs/ROADMAP.md` M4 的条目同批加这一条，`docs/ORCHESTRATION.md` §5 的表在 M3 第 6 步写明「同步卡的申报场景随 M4」。后果：M3 不碰 guard 的圈禁规则，范围不变；在 M4 之前，主 Agent 与子 agent 被圈禁拒绝时仍只能停下来在对话里问人；M4 做的时候 G3 已生效，可以一次按所有路由设计。
- B：M3 内做最小申报。`workspace-containment` 拒绝时纠偏的正路改为「调用 `decision_card` 申报，写明目标路径或命令、目的、可逆性与影响面、考虑过的替代；人批准后重试同一调用」；人批准时 harness 发一枚一次性令牌，按会话、工具名与目标路径（或命令文本）匹配下一次调用，用过即删，回合结束或进程退出即失。后果：M3 多一处 guard 规则改动与一套令牌（匹配规则、失效时机、子 agent 的申报要经主 Agent 汇总，因为子 agent 调 `userQuestions.ask` 被拒，§3.2），独立评审两次；与 split 第 7 步（G3）改的是同一个文件，要排在它之后；用户的桌面版是 `danger-full-access`，圈禁只由本项目的 guard 拦，这条通道会是人第一次被问「能不能写工作区外」。
- C：从 `docs/ORCHESTRATION.md` §5 删去这个场景，申报只在对话里做。后果：「申报走决策卡」（§6.1 规矩即数据的第四样）不再成立，要同批改写 §6.1；guard 纠偏的正路改成「停下来在对话里问人」。

## 13. 交给编排者记图的事项

本设计不写 `docs/graph/`。以下事项由编排者在人看过之后记到图上：

1. D1–D6 各提一张决定者为人的待决（挂 `m3`），选项与后果按 §12；人拍板之后按结果改本设计。
2. 两条设计规则不走影子期（§11）：在 `m3` 下提一张决定者为 `agent` 的待决「两条设计规则直接拦截、不走影子期」，选项 A 直接拦截、B 先影子一段时间，由 agent 拍 A，理由写 ROADMAP 3.1、3.3 与 `d-dispatch`，人可推翻。
3. D4 选 A 时，把 §1.2「建议验收」一列带人的原话写进 `m3-1` 到 `m3-6` 的 `acceptance`。
4. D2 选 B 时，`d-async-cards` 正文里「同步决策卡借用 DSH user-approval」一句与 `m3-5` 正文里「同步借用 user-approval」一句，都带人的原话改写（改为同步卡是本项目的 `decision_card`，经 `userQuestions.ask` 出卡）。
5. D6 选 A 时，在 `m4` 下提任务节点「guard 申报通道接决策卡」。

## 14. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-29 | 第一稿 |
| 0.2 | 2026-10-29 | 按第 1 轮评审（`design-review.md`、`design-review.json`：HIGH 1、MEDIUM 7、LOW 12）逐条修订，见下面第三张表；依据改为 main `28ce4f4` |
| 0.3 | 2026-10-29 | 按第 2 轮评审（MEDIUM 2、LOW 11）逐条修订，见下面第二张表；依据改为 main `8f1a4c6` |
| 0.4 | 2026-10-29 | 按第 3 轮评审（MEDIUM 2、LOW 3）逐条修订，见下面第一张表；依据改为 main `c8492af` |

第 3 轮评审意见的处理（全部采纳；R3-M1 的候选目录来源与 R3-M2 的空闲路径各有一处与评审的写法不同，理由写在行内；逐条重新核对了源码与 rc.3）：

| id | 级别 | 处理 | 位置 |
| --- | --- | --- | --- |
| R3-M1 | MEDIUM | 重核 agent:617–625（`roots()` 取 `store` 里所有 `owner === undefined` 的活 agent，进程级）与 `src/graph/engine.ts` `nextId`:295–300（`${type}-${index}` 取第一个空号），属实。§3.5.2 的筛选加第三条「同一张图」：候选的图目录与被写的 `dir` 经 `sameDir` 比较（两边 `fs.promises.realpath`，失败退回 `path.resolve`；斜杠统一、去尾斜杠，win32 转小写），按「同步两条 → 图目录 → 焦点」的顺序判；退回只看调用会话的降级不变（它的 `cwd` 就是算出 `dir` 的那个）。与评审修法的不同：候选的目录取图行服务的 `dirFor(session.header.cwd)`，不取面板行的 `configured`。核对 `src/graph/index.ts`:104、119（`graphTools(dir, focuses)` 与 `provideService(ctx, dir, …)` 是同一个 `dir`）与 `src/graph/tools.ts`:76–77（`graphDir` 用 `locateGraph(configured, …)`），图工具与 `dirFor` 用同一个图行 `dir`，候选的焦点 id 属于那张图；两行配置不同时，按面板行的配置算会把焦点 id 放到另一张图里解释，还是本条的错。L2 加两个工作区、节点 id 相同、焦点都在 `task-1` 的一例（只有第一个会话收到），加大小写不同的同一目录、两行 `dir` 配置不同两例；L4 的两个会话改开在两个临时工作区里（也免得访谈写进本仓库的图），第 4 项加跨工作区不收到的真机核对；m3-5 验收第 2 条、§0、§2.1、§4、§6.2（realpath 失败）、§6.4（新不变量）、§10、§11 写明「同一张图」 | §0、§1.2 m3-5、§2.1、§3.5.2、§4、§6.2、§6.4、§8 第 7 步、§9.3、§10、§11 |
| R3-M2 | MEDIUM | 重核 `scripts/probe/probe-llm.mjs` `runCommand`（经 `commands.find` 直接调处理函数，不追加生命周期事件）、`run-probe.mjs`:414–420、commands:327–395、headless index.js:317–350，属实。新增 §9.1.1：探针 provider 的 `line` 步经 `commands.execute(agent, line, [], new AbortController().signal)` 发命令，与 `command` 互斥；写明它与本步请求、本步工具调用的先后；占位 `{lastCard}`、`{rev:<id>}`、`{lastCardRev}`（值限 `^[A-Za-z0-9._-]+$`）；经 `session/event` 记下命令追加的事件数、类型与字节数（不用 rc.3 标为 deprecated 的 `session.eventAt`，session:1433–1439）。`glm-design-main` 拆成 `glm-design-wish-idle`（模拟人 `wish: '<一句话>'`）与 `glm-design-main`（`line: '/wish'`、`'/wish <一句话>'`、`'/wish off'`，逐请求写出脚本），`non-glm-design-main` 同样拆；`glm-decision-card` 的 `decide` 经 `line` 发并核对第 15 项；`glm-design-stage` 的批准与改阶段也改经 `line` 发，压缩一项拆为 `glm-design-stage-compact`；模拟人加 `decisions` 以便关掉第二张决策卡。与评审修法的不同：评审写「覆盖层的行以 `- insert:` 追加在两个包的行之后，`agent/created` 按注册顺序串行派发，所以设计行的监听器先于模拟人」。后一半属实（cordis:289–294、336），前一半读源码得不出：加载器并发创建同一组里的各行（cordis-plugin-loader:87 `Promise.all(ids.map(... create ...))`），激活次序取决于各行模块 import 完成的先后〔推断〕，不保证跟配置顺序。所以改由产品侧消除这个依赖：`/wish` 的处理函数在开启之前同步调 `installAgentHooks(agent)`（与 `agent/created` 共用、按 agent 去重，§3.1.3），这也覆盖了设计行激活之前已开着的会话；空闲路径场景的第一个请求只核对设计行自己的部分，节的位置在任务回合与运行路径场景里核对。另修正 0.3 的一处先后：模拟人的 `wish` 部分与覆盖行原排在第 8 步，而第 3 步的 L3 已要用它，改到第 3 步；应答部分分到第 6、8、9 步 | §2.1、§3.1.1、§3.1.3、§3.6.2、§4、§6.2、§6.5、§6.6、§8 第 3–10 步与文档、§9.1、§10、§11 |
| R3-L1 | LOW | 采用评审的写法（第一跳的判断放进循环体、在循环里返回 `root`），另改一处评审片段也过不了的地方：薄适配层 `AgentLike.session` 是可选的（`src/shared/dsh-min.ts`:50–55），`caller.session.header` 在 strict 下同样报错。参数改为 `Dispatched {id, session: SessionLike}`，监听器在 `payload.agent?.session` 为 `undefined` 时直接 `next()`（§3.1.4 写明）；`agents` 收窄为 `Pick<AgentsService, 'get'>` | §3.1.4、§3.3.3 |
| R3-L2 | LOW | 选评审的第二个选项：`src/graph/main-agent.ts`（纯函数）挪到第 2 步与 `stage.ts` 一起建，加 `tests/graph-main-agent.spec.ts`；第 3 步只导入它。「先后」改为第 11 步在第 2 步与附录合入之后、可与 3–10 并行，L4 随第 12 步（b） | §8 第 2、3 步与先后 |
| R3-L3 | LOW | 核对附录文件头（0.3，按第 2 轮 B01–B07 修订）与 `addendum-review.json`（第 3 轮 CHANGES_REQUESTED，C01–C08 都在 profile 切换脚本、回滚与演练），十个被引用的标题都在。按评审「更稳的写法」改：四处不再写附录的版本号与轮次，改为「以评审 APPROVED 的附录为准，开工前核对引用的十个标题」，当前状态指向 `addendum-review.json`。另：m8-ui-audit 已合入（`20ed994`，`c8492af` 记为 done），§7 与第 11 步的开工条件随之更新 | 文件头、§0、§7、§8 先后 |

第 2 轮评审意见的处理（全部采纳，按意见给的修法或其中一个选项写定；逐条重新核对了源码与 rc.3，没有只改措辞的条目）：

| id | 级别 | 处理 | 位置 |
| --- | --- | --- | --- |
| R2-M1 | MEDIUM | 重核 client-ui-user-questions client.js:907–922（选中清空文字）、:980–987（单选打字清空选项）、:937–948（有文字就丢掉选项）、:783–795（只预选推荐项）、:835、1157–1160（无选项的问题是整块文本框）、:994–1005、1216–1226（每问可跳过）与 user-questions:33–51（问题可无选项、可多个），属实。按选项 A 写定：五键卡一次两问，第一问五个键、第二问 `hourness-five-keys-note`「理由或补充」不带选项；`parseFiveKeys` 键取第一问、文字取第二问（第一问只有文字时键为空）；回答表改为按「键 × 有无文字」逐行写，「没有选键、写了文字」对模型按补充处理、批注照实写「没有选键」。确认卡与决策卡删去「（可带文字）」，只留「选了一项」「只写了文字」「跳过/关掉」；确认卡「要改」不带文字时让模型追问，只写文字时批注写「没有选项，写道」。批注说法统一由新函数 `answerPhrase` 生成，§6.4 加对应不变量。模拟人按客户端形状作答（`confirm` 为 `{label}`/`{text}`，`fiveKeys` 的 `label`、`text` 分别答两问，无选项问题答 `freeText`），假宿主拒绝两者都带的单选回答。L2 加「拒绝 + 理由」「只写文字」等各行；L3 `glm-design-release` 改为拒绝带理由、只写文字、批准三张卡；L4 第 5 项加第二问的呈现与跳过 | §0、§1.2 m3-4、§2.1、§3.2.3、§3.4.1、§3.4.2、§3.4.4、§3.5.1、§4、§5、§6.3、§6.4、§6.5、§8 第 6、8、9 步、§9.1、§9.2、§9.3、§11、§12 D3 |
| R2-M2 | MEDIUM | 重核 subagent:2979（`maxDepth` 默认 1，上限 `MAX_SAFE_INTEGER`）、:279–283、1396–1399（服务只查调用方传入的值）、:346–356（每层子会话头同形）、client-ui-settings-subagent client.js:63、134（设置页「最大递归深度」），属实。按修法写定：新函数 `dispatchRoot` 从调用方会话头沿 `parentSession` 往上走到第一个不带 `origin: 'subagent'` 的会话，根是主 Agent 时按根的焦点判；链上不活、缺 `parentSession`、成环时按「判不出」放行并上报原因。没有用评审建议的 8 跳上限，改用「每跳一个不同的活 agent」保证终止：`maxDepth` 可设得很大，固定上限会让合法的深链按判不出放行。纠偏的正路加一句「不要把写转交给别的子 agent」。L2 加两层委派（孙 → 子 → 主 Agent）在设计阶段被拒、放行后执行，链断与成环时放行并报健康 | §0、§1.2 m3-3、§2.1、§2.2、§3.1.3、§3.1.4、§3.3.3、§4、§6.2、§6.4、§6.6、§8 第 5 步、§11 |
| R2-L1 | LOW | `FIVE_KEYS` 键名不变，说明改为 M3 的行为（§3.4.1 的对照表），「自主执行」「记入画像」等 M7、M5 接上再改回；记入 §11；L2 断言说明里不含这两处 | §2.1、§3.4.1、§8 第 9 步、§11 |
| R2-L2 | LOW | 核对 `src/graph/labels.ts`:38–48 与 `ui/src/graph/NodeDetail.tsx`:135，改为复用；构件表、§3.6.4、第 2 步里删去「新增」 | §2.1、§3.6.4、§8 第 2 步 |
| R2-L3 | LOW | 核对 `src/graph/reminder.ts`:190–194。`focusOf = focusFromHistory(session.deriveMessages()) ?? focuses.get(session.id)`，`focusFromHistory` 从 `projectionHistory` 抽出、与每步投影共用；`focusOf` 不写回内存表；L2 加历史与内存不一致时取历史 | §3.6.1、§8 第 5 步、§11 |
| R2-L4 | LOW | 附录按标题引用；状态改为「0.2，第 2 轮 CHANGES_REQUESTED（B01–B07，都在 profile 切换），修订中」；worktree 三步写为已提交 `ab031b7`、`00d1bd5`、`0fe76a5`，未合入；行登记写「`graph-panel` 之后、`ui` 之前」；另写明 worktree 第 2 步之后 guard 的行号移动与 `face` 参数 | 文件头、§0、§2.1、§3.1.4、§3.6.4、§7 |
| R2-L5 | LOW | `/wish <一句话>`：运行中 `steer`、空闲 `followup`，写明投递方式与角色生效时刻对齐的理由；L2 加运行中发命令的一例 | §2.2、§3.1.1、§3.1.2、§6.2、§8 第 3 步 |
| R2-L6 | LOW | 核对 agent:581–585（`signal` 可选）、commands:332、agent-loop:1786–1794（`publish` 等 `agent/created` 结束）、headless index.js:317–346。模拟人只对根 agent 发，`signal` 缺省时自建，在串行监听器里 `await`，返回 `undefined` 或抛错时告警并写 `human.jsonl` | §4、§9.1 |
| R2-L7 | LOW | 按选项 A 写定，有一处与评审的写法不同：通知集合是 `agents.roots()` 里是主 Agent、且 `goalOf(graph, focusOf(session))` 等于被写节点所属目标的会话；调用面板的会话不单独加入（它若符合条件已被选中；不符合时不唤醒一个无关的空闲会话）。取不到 `agents`、图行服务或读图失败时退回只检查调用会话。薄适配层加 `AgentsService.roots`；m3-5 验收第 2 条改写；§10 记下没有焦点的主 Agent 收不到 | §0、§1.2 m3-5、§2.1、§3.5.2、§4、§6.2、§8 第 3、7 步、§10、§11 |
| R2-L8 | LOW | `check.mjs` 第 4 条写成可判定的规则：除目标外、首条历史 `propose` 且 `to: proposed` 的节点，现状不是提议，且有 `human` 的、`reason` 含 `design_review` 的 `approve`（D5 选 B 时需求卡节点为 `reject`）；直接批准的风险与待决不在此列；第 5 条的批注写成可匹配的前缀 | §9.2 |
| R2-L9 | LOW | §10 列出判写缺口（解释器、改工作树的 git 子命令、包脚本、PTC），记给 M4；m3-1 验收第 2 条改为「文件工具写入与 file-tools-only 判为写文件的 shell 命令被拒」 | §1.2 m3-1、§3.1.4、§6.4、§10 |
| R2-L10 | LOW | 第 12 步拆成两段：（a）标定在合入之前、在 worktree 上经临时 profile 跑，不碰主检出与桌面版；（b）合入、主检出构建与 L4 在桌面时段里做，桌面版先关。另：重读时发现 0.2 的「L4 通过后再默认启用」与「L4 要在启用之前做」互相矛盾（桌面版 profile 不改，默认禁用的行在 L4 上看不到），改为合入后的第一个提交默认启用（依据合入前完整探针与标定，同 `graph-panel` 的先例），L4 看默认组合，不通过就改回禁用 | §7、§8 第 12 步与先后、§9.2、§9.3、§11 |
| R2-L11 | LOW | 核对 `docs/graph/nodes/m3-5.json` 正文「同步借用 user-approval」与 `d-async-cards.json` 正文「同步决策卡借用 DSH user-approval」；§13 第 4 条与 D2 B 的后果都改为两处一起带原话改写 | §12 D2、§13 |

第 1 轮评审意见的处理（全部采纳或按意见给的选项之一写定，没有忽略的条目）：

| id | 级别 | 处理 | 位置 |
| --- | --- | --- | --- |
| H1 | HIGH | 已核对 `src/graph/engine.ts`:438 在 :440 计算 `ownProposal` 之前拒绝一切非特权的目标编辑，`link`/`unlink` 在 :354 同样拒绝。按评审的选项 A 写定：第 1 步改 `planEdit`，只放开自己提议、仍为 `proposed` 的目标的 `edit`，目标的连线照旧不能改；列为人定事项 D5（原型规则，`norm-decision-tiers` 第 5 类），独立评审；同批改 §2.9 `edit` 行、§15 一行与 `graph_edit` 说明；四个新 L2 用例，「今天必败」为自己提议的目标 `edit acceptance` 得到 `forbidden`。D5 选 B 时的落点写成 §3.2.4（「需求卡」子节点、确认时搬进目标并否决子节点）。§0、§2.1「不加的东西」里「引擎不改」的说法删去；§2.4 转换表的引擎依据改写 | §0、§2.1、§2.4、§3.2.1、§3.2.4、§8 第 1 步、§12 D5 |
| M1 | MEDIUM | 依据改为 main `28ce4f4`，写明 `src/`、`tests/`、`scripts/` 与 `98f43eb` 相同，并列出 `05f0139..98f43eb` 改过的文件；question-17 写为已定 B（`69dd424`）。§7 加附录这一依赖（未定稿），行登记、客户端包与入口、`ui/src/flow/**` 的归属、`probe-full`、`glmsandbox` 都按附录写，并写明附录评审改了形态时第 3、11 步开工前重写哪几处；第 3 步与第 11 步的开始条件写明附录评审通过并随 split 合入。另核对了 split worktree 第 1 步已实现的 `src/graph/service.ts` 与 `installStepNotice` 签名 | 文件头、§0、§2.1、§7、§8 先后 |
| M2 | MEDIUM | 已核对 commands:334–346、388–394 与 agent-loop:800–807、854–868、902–907、938–956、agent:645–653：`followup` 在处理函数返回之前同步开始回合与组装。按评审的选项 A（同计划模式 `pendingIntents`）写定：处理函数在检查通过后、`inject`/`followup` 之前同步写待生效状态；`isMainAgent` 先看它，投影折叠到同一 `commandId` 的 `command/done`（新状态字段 `settled`）时删除；读状态改用 `stateOf`；写明命令在生效前被取消与进程退出两种例外。L2 加「按 rc.3 次序驱动时第一次组装含身份节与两个设计工具」与「`command/done` 之前的写入已被拒」，L3 `glm-design-main` 加真运行时上的同一核对 | §2.3、§3.1.1、§3.1.2、§4、§5、§6.4、§6.5、§8 第 3、4 步、§9.1 |
| M3 | MEDIUM | m3-1 建议验收第 3 条改为「主 Agent 的工具面等于普通会话的工具面加 `design_review`、`decision_card`；写文件的工具都还在，写入在执行边界被拒；不用 preset」；§3.1.3 写明工具面与提示词在 `/wish`、`/wish off` 的下一步各变一次，不采用计划模式常驻工具的做法及理由 | §0、§1.2、§3.1.3、§9.1 |
| M4 | MEDIUM | 已核对 `engine.ts`:334–337（`decide` 前核对 `rev`）、:366–379（`done` 可再拍）、:374（同一选项为 `bad_transition`）。`decision_card` 回答之后先查卸载、重新读图，按待决当前状态分支：`approved`/`doing` 用新 `rev` 拍板或批注；`done` 不再拍板，把人在卡上的选择批注在待决上，`outcome` 为 `decided`、`option` 取图上的；`dropped`/`superseded`/不在为新结果 `closed`；毫秒窗口的 `stale_revision` 重读再判一次。`design_review` 的回答之后同样写成表（目标关闭为 `closed`）。L2 补被批注、被拍成同一选项、被拍成另一选项、被丢弃四例 | §3.4.4、§3.5.1、§6.2、§6.4、§8 第 6、8 步 |
| M5 | MEDIUM | 按评审的修法写定：区分判不出（fail-open）与没有目标（拒绝）；父 agent 是主 Agent 时，有效阶段为 `wish`/`interview`/`design`、没有焦点、焦点不在图里、焦点链上没有目标、目标已关闭都拒绝；`release` 及以后、已批准无阶段的目标放行。`effectiveStage` 对提议状态的目标在没写阶段时也算访谈，堵住「提一个不带阶段的目标就能写」。L2/L3 加无焦点时子 agent 的 `Write` 被拒 | §0、§1.2、§2.2、§2.4、§3.1.3、§3.1.4、§3.3.3、§6.2、§8 第 5 步、§9.1 |
| M6 | MEDIUM | 已核对 `engine.ts`:345 的 `approve` 调 `supersedeTargets`（:270–279），`superseded` 没有出路（:112）。按评审的选项 A 写定：确认门禁拒绝带 `supersedes` 连线的目标，放行门禁第 6 条拒绝放行集合里带这种连线的节点，`hint` 给出正路；§6.4 加对应不变量 | §0、§1.2、§3.2.3、§3.3.2、§3.6.1、§6.4、§8 第 2、8、9 步 |
| M7 | MEDIUM | 列为人定事项 D6（A 归 M4 并建节点、B 在 M3 做最小申报带一次性令牌、C 删去场景），写明后果，建议 A；§3.5.1、§10 与 m3-5 建议验收随选项写 | §0、§1.2、§3.5.1、§10、§12 D6、§13 |
| L1 | LOW | `src/shared/tool-names.ts` 加 `DESIGN_TOOL_NAMES`；契约测试改为设计行注册名等于它、常驻名单是三者之并的子集 | §2.1、§3.4.4、§7、§8 第 6 步 |
| L2 | LOW | 写出 `decision_card` 的输出 schema `{outcome, id, option?, text?, message}`，`outcome` 含 `closed`；`render` 同图工具 | §3.5.1 |
| L3 | LOW | 需求卡「岔路」改为最后一次 `decide` 为 `human` 或带 `relay`；`check.mjs` 用同一判据 | §3.2.2、§9.2 |
| L4 | LOW | 流程条改为 `ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({...}, FlowBar))`（client-ui-goal client.js:604–609）；`scripts/packages.mjs` 编排层客户端 `sources` 加 `ui/src/flow/` | §2.1、§3.6.4、§4、§8 第 11 步 |
| L5 | LOW | 晨报的本期拍板次数改为扫描全部待决节点的 `decide` 历史，不取有 20 条上限的 `recentDecisions`；L2 夹具用 25 次 | §3.5.3、§8 第 10 步 |
| L6 | LOW | `task.json` 加 `limits {maxSteps: 90, minutes: 30}`，运行器按任务读、命令行优先，并写出步数估计；第 12 步在合入 main 后的主检出上跑，合入前试跑用 `DSH_SANDBOX_PROFILE` 指向的临时 profile | §8 第 8、12 步、§9.2 |
| L7 | LOW | `MAIN_AGENT_KEY`、`MainAgentView`、`mainAgentActive` 放进 `src/graph/main-agent.ts`；guard 规则的依赖由设计行注入，`src/guard/` 不导入 `src/design/` | §2.1、§3.1.2、§3.1.4、§3.5.2、§3.6.4 |
| L8 | LOW | §11 写明依据（ROADMAP 3.1、3.3、`d-dispatch`）与 §6、§7.2 的关系，列入交给编排者记图的事项（agent 定的待决） | §11、§13 |
| L9 | LOW | 「当前目标」统一为 `goalOf`；`effectiveStage` 写成表；提醒、流程条与设计期只读对没有阶段、已关闭的目标各写一支 | §2.4、§3.3.3、§3.6.1、§3.6.2、§3.6.4 |
| L10 | LOW | 插入规则写成 `src/guard/sections.ts` 的 `insertHournessSection`（`DECLARATION_SECTION` 移入），设计行与 bootstrap 共用；不放公共库的理由写明（公共库不导入包目录） | §2.1、§3.1.3、§7 |
| L11 | LOW | `glm-decision-card` 场景加核实清单第 15 项的 L3 一半（命令事件不进模型请求、记下日志增量），批次 L4 加 L4 一半；第 6、7 步的文档加第 15 项 | §8 文档、§9.1、§9.3 |
| L12 | LOW | 设计行持有 `disposed` 标志（卸载函数里置位，cordis:1135–1143），三个工具体在 `ask` 返回后先查，已卸载就不写图并抛错；§6.2 的「卡片等待」一行按此拆成进程重启与行重新加载两行 | §3.4.4、§4、§6.2、§8 第 6、8 步 |

## 15. 人定结果（2026-10-29，编排者记录）

| 事项 | 结果 | 图上 |
| --- | --- | --- |
| D1 | A：按会话 `/wish` 开启、`/wish off` 退出。附加要求（用户原话「这个命令需要放在醒目的地方提醒人，要不然我这种的很容易忘记」）：没有开启主 Agent 的会话里，界面上要有显眼的提示说明可以用 `/wish` 开启；开启后看得到当前是主 Agent 与退出方式 | `question-19`；`m3-1` 验收第 4 条 |
| D2 | B：`design_review` 五键卡与 `decision_card`，都经 `userQuestions.ask`；计划模式与 `user-approval` 不用 | `question-20`；`d-async-cards`、`m3-5` 正文已改写 |
| D3 | A：卡片回答由 harness 以 `human` 写图 | `question-21` |
| D4 | A：§1.2 的建议验收已写进 `m3-1` 到 `m3-6`；标定按 §9.2 | `question-22` |
| D5 | A：引擎放开自己提议且仍为 `proposed` 的目标 | `question-23` |
| D6 | A：申报场景归 M4，任务 `m4-request-card` | `question-24` |
| §13 第 2 项 | agent 拍 A：两条设计规则直接拦截 | `question-25` |

D1 的附加要求本稿没有设计，实现开工时先补一节（提示的位置、文字、何时出现与消失、普通会话与主 Agent 会话的区别、客户端包归属）并过设计评审；候选位置有输入框上方与流程条同一处、开始页、项目图面板的「需要你」。
