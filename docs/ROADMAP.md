# 实施路线

版本：0.2（2026-10-28）
状态：生效。设计依据：`DESIGN.md`、`ORCHESTRATION.md`。

本文件只记里程碑、条目与验收条件。进度（状态、证据、批注、待决）只记在项目图 `docs/graph/` 上〔定案 2026-10-28，`ORCHESTRATION.md` §2.13〕：`npm run -s graph -- open` 列出待办与决策队列，`npm run -s graph -- show <id>` 看一个节点。条目在图上的 id 写在各表的「节点」一栏。2026-10-28 之前写在本文件里的进度（M1 进度、夜间运行小结、L4 第一轮、M2 原型进度、需要用户的事项）在 git 历史里，最后一版是提交 `d4cd7e2` 的本文件；其中的技术事实已写进 `DESIGN.md`、`ORCHESTRATION.md` 与 `DEVELOPMENT.md`。

## 1. 原则

- 行走骨架：先打通最细的端到端通路，再加宽。原生通道还没在 DSH 真实会话里跑过，所以底层收口排在最前。
- 一次一个变量：每个条目单独提交、单独验证（`DEVELOPMENT.md` §5）。
- 用这套流程建这套流程：M2 之后，所有条目都作为任务节点挂在项目图上推进；新条目先进图，本文件只在里程碑或验收条件变化时改。
- 验证层级（`DEVELOPMENT.md` §1）：L1 静态、L2 单测、L3 headless 沙盒、L4 真机。Kiro 会话内可执行 L1–L3（L3 经 Electron node 模式）；L4 在桌面版真实会话中验收，用户同意由 Kiro 自己重启桌面版并核对（2026-10-28）。
- 决策分级（`ORCHESTRATION.md` §2.9.1）：只有五类事问人，其余由 agent 定、在图上留痕、人可推翻。

## 2. 里程碑

### M0 文档沉淀（完成）

宪章、总体与底层设计、编排层设计、事实账、路线、流程、交接整理入库；git 之前的记录导入后由新文档取代（提交 `c518317`、`f2e0b36`）。

### M1 底层收口

| # | 条目 | 验收 | 节点 |
| --- | --- | --- | --- |
| 1.1 | 版本基线统一为一个常量：身份头 `appVersion`、OAuth、签名平面 `clientVersion` 共用；按基线复核协议变化。方言文本按 ZCode 原文重建（`DESIGN.md` §5.9：工具描述与参数 schema、deferred 声明段、ToolSearch 描述、todo 提醒正文、compact 三处），并加逐字比对检查。基线 2026-10-27 为 3.16.3，2026-10-30 起为 3.17.1（`zcode-3171-follow`） | L2 单测；逐字检查全部通过（3.16.3 时对照 `reference/ZCode` 与安装包，3.17.1 起只对照 `reference/zcode-3.17.1/zcode.cjs`）；`smoke:authorized` 真网通过 | `m1-1`、`zcode-3171-follow` |
| 1.2 | 路由判定收口（`DESIGN.md` §3）：共享判定函数，方言按模型族、通道按 provider；删除旧构建分支；单测假宿主只提供 rc.3 的信号 | L2：只有组装变量携带路由时，方言、工具检索、todo 提醒均生效 | `m1-2` |
| 1.3 | 删除与反代有关的判断与文案 | 代码与文档中无反代依赖 | `m1-3` |
| 1.4 | 共享数据目录与审计服务（`DESIGN.md` §2.4）；guard 违规落盘；迁移 profile 目录下的 190 条用量记录与 1 条记忆 | L2；L3 中 guard 拦截后违规流水有记录 | `m1-4` |
| 1.5 | 行健康上报与 `/glm-status` 健康表 | L3：每行在会话中报告生效或原因 | `m1-5` |
| 1.6 | 事件钩子与服务对照官方类型；DSH 接口收进薄适配层 | L1 | `m1-6` |
| 1.7 | L3 沙盒自动化：真实启动 + 行为探针（方言前缀、工具面、提醒）作为门禁；标定测试集起步（1–2 个任务） | 一条命令跑完，结果可机检 | `m1-7` |
| 1.8 | guard：`file-tools-only` 改为引号感知；规则声明注入提示词；工作区变更兜底（回合结束时只记录） | L2 覆盖 `=>`、`>>>`、`->` 与 git 子命令；L3 | `m1-8` |
| 1.9 | 本仓库补规范检查、死代码检查、重复检查，记录告警基线 | 门禁中可运行，基线入库 | `m1-9` |
| 1.10 | todo 提醒改为按助手轮次计数 | L2 | `m1-10` |
| 1.11 | L4 真机验收：桌面版重启后选 `glm-zcode` 发消息 | 第一轮（2026-10-28，用户做）：行健康全绿；会话文件中系统提示词含方言；用量记录 provider 为 `glm-zcode`。第二轮（Kiro 自验）：GLM 与 DeepSeek 会话里的 `/compact`、`/hourness`、D1、D4（会话中途换模型）、GLM-5.3 的读图对照；工具面里没有 `spawn_teammate`，会话里没有翻译事件；GLM 从 `~/.dsh/glm-hourness/` 读到凭证；guard 对相对路径放行、对 DeepSeek 会话不介入；用量记录里后续请求命中最新前缀（`DESIGN.md` §4.5b） | `m1-11` |
| — | L4 第一轮跟进修复、提示词缓存、Flash 第二步未命中、签名握手、M1.9 跟进、清理 | 见各节点 | `m1-l4fix`、`m1-cache`、`m1-cache-flash`、`m1-signing`、`m1-followups`、`m1-cleanup` |

### M2 项目图行走骨架

| # | 条目 | 验收 | 节点 |
| --- | --- | --- | --- |
| 2.1 | 存储格式定案（`ORCHESTRATION.md` §2.6） | 用户批准 | `m2-1` |
| 2.2 | 图工具：读投影、提议节点、带证据更新状态 | L2：无证据不能标完成 | `m2-2` |
| 2.3 | 每步投影注入（`DESIGN.md` §6）与压缩后重锚 | L3：模型请求中可见投影 | `m2-3` |
| 2.4 | 只读视图：命令输出 | 命令可用 | `m2-4` |
| 2.5 | 迁移本项目：底层与编排两大分支、设计决策（带验证状态）、已知问题（风险）、本路线条目（任务） | 用户能在图上看到项目全貌 | `m2-5` |
| 2.6 | 决策分级与转述（`ORCHESTRATION.md` §2.9.1） | 人的决策队列只剩非人不可的事；LLM 能带人的原话替人批准、拍板，原话留在历史里；人能推翻 agent 定的事 | `m2-6` |
| 2.7 | DSH 原生右侧栏面板：需要你、agent 自己定的、正在做、图四个视图（`ORCHESTRATION.md` §13） | 在桌面版右侧栏打开，读到本项目的图并随节点文件变更刷新；在面板里拍板、批准，写入经引擎、身份为 human；经 DevTools 协议截图核对四个视图 | `m2-7` |
| 2.8 | 实时现场：agent 与子 agent 在图上 | 主 Agent 与子 agent 的位置与动作在 2 秒内出现在图上；现场文件写入节流，不进 git | `m2-8` |
| 2.9 | 节点上的运行控制：从这里开始做、暂停、按现在的验收条件重做 | 在节点上点「从这里开始做」，主 Agent 收到以该节点为焦点的指令；点「暂停」能停下正在做这个节点的 agent | `m2-9` |
| 2.10 | 删除本机查看器与服务 | 仓库里没有查看器与服务的代码；`npm test` 全绿 | `m2-10` |
| 2.11 | 图行 L3、L4 验收后启用 | 见下 | `m2-11` |

2.11 的验收（2026-10-28 全部通过，图行 `glm-hourness/graph` 改为默认启用；结果见 `ORCHESTRATION.md` §2.10「DSH 图工具」的验证一条）：

- 跟进项先做完：行健康表加 `graph` 行，按会话报告工具已注册、图目录找到与否、图是否有校验错误、焦点是否设了（`DESIGN.md` §2.5）；`graph-files-only` 的拒绝写进违规流水（`ORCHESTRATION.md` §2.7）；guard 影子兜底把图工具写的节点文件算作已知来源；决定 `graph-files-only` 是否列进 `glm:guard` 一节（agent 定：列进，`ORCHESTRATION.md` §2.7）。
- L3 探针场景全过（图目录用运行目录里的副本，覆盖补丁启用该行并指向副本，路径写字面量）：注册无激活错误、rc.3 接受 13 个工具的输出 schema，GLM 与非 GLM 请求的工具面里都有，GLM 上常驻；`graph_show` 返回投影，`graph_status` 不带证据标完成拿到 `evidence_required`，`graph_comment` 在副本里留下 `llm` 的历史，仓库的 `docs/graph` 不变；`graph_focus` 之后的下一次请求以来源 `glm-graph-projection` 的 notice 结尾，没有变化的下一步不注入，改了焦点节点的标题后再注入（`reason` 为 `changed`）；压缩检查点之后的第一次请求带投影（`reason` 为 `compaction`），有 goal 时目标轮也带（`goal-round`）；`Write` 与 `Bash` 写副本的节点文件都被 `graph-files-only` 拦下，写别处照常。
- L4：真机 GLM 会话里图工具可用、投影可见；启用后桌面版无新错误。

### M3 设计循环最小闭环

M3 起编排层的新行与新文件都在编排层包 `dsh-hourness` 里做（源码目录登记在 `scripts/packages.mjs`，`DESIGN.md` §2.3）；它对任何模型生效，不得导入 GLM 包的目录。

| # | 条目 | 节点 |
| --- | --- | --- |
| 3.1 | 主 Agent 身份文本（三问四答、五键、许愿访谈）；guard 拦主 Agent 的写入，不靠 preset（`ORCHESTRATION.md` §3.1） | `m3-1` |
| 3.2 | 许愿访谈八步与需求卡；访谈过程中图实时生长 | `m3-2` |
| 3.3 | 方案五栏与设计门禁：五栏门禁挂在 `exit_plan_mode` 的 `tools/pre-execute`；设计期只读由 guard 实现，计划模式只靠提示词（`ORCHESTRATION.md` §4.5） | `m3-3` |
| 3.4 | 五键（`ORCHESTRATION.md` §4.4），借用 `user-questions` | `m3-4` |
| 3.5 | 决策卡：同步借用 `user-approval` 与 `user-questions`，异步自建在图的待决节点上（`ORCHESTRATION.md` §5）；取代 L1/L2/L3 | `m3-5` |
| 3.6 | 阶段状态机：阶段提醒、门禁、最小流程条 | `m3-6` |

验收：标定测试集中的「需求访谈」任务，从一句话到骨架放行全程走通。

### M4 guard 补齐与环境（`m4`）

`ORCHESTRATION.md` §6.4 的规划规矩；只能事后发现的兜底检查改成什么、按规则撤下的路径（§6.5）；检查器运行与当轮回传；告警棘轮与压制规则；环境分支与草稿区；清理 `.llm/docs/` 下的抓取脚本。

### M5 记忆与学习（`m5`）

设计在 `.agents/tasks/m5/design.md`（0.7）；各条的验收句子在节点上，不在本表。记忆行改线（步骤 M1）已实现，覆盖 5.1 与 5.2 的写入、召回与子 agent 部分；其余条目随后续步骤。

| # | 条目 | 验收 | 节点 |
| --- | --- | --- | --- |
| 5.1 | 事实与偏好分类；取消路径判据；按会话的项目目录；旧 `memory.json` 迁移 | L2；L3 `glm-memory`、`non-glm-memory` | `m5-1` |
| 5.2 | 会话开局召回；记忆工具常驻；子 agent 不带记忆工具与索引 | L2；L3 `glm-memory`、`glm-memory-compact`、`glm-worker-memory` | `m5-2` |
| 5.3 | 方言的 Memory 节贴训练分布 | L1、L2、L3 | `m5-3` |
| 5.4 | 学习流水线；习惯先问再记 | L2、L3 | `m5-4` |
| 5.5 | 汇报细度闭环 | L2、L3 | `m5-5` |
| 5.6 | 经验板块：存储、工具与服务、失败匹配、面板、第一批经验 | L2、L3、L4 | `lessons`（子节点 `lessons-1` 至 `lessons-4`） |

### M6 用量与峰谷（`m6`）

积分口径与峰谷修正（`ORCHESTRATION.md` §11.2）；通道额度取数（`DESIGN.md` §4.7）；高峰提醒；排期功能。

### M7 执行、汇合与运维（`m7`）

后台派发：主 Agent 把任务节点派给后台子 agent（`subagents.startActivation`，spawn 后端），派发属性取自任务节点（种类、写入范围、模型档位、验收条件、交回结构、独立工作树，`ORCHESTRATION.md` §3.2），没有队友角色与角色 preset；子 agent 的写入范围门禁；驱动循环用 goal 加 `goal-round-driver`，由人发起创建与恢复，完成门禁核对图上证据（§2.1）；简报门禁、并发补位提醒；独立审查；汇合门禁；四答晨报；巡检（固定运维会话）；规范阶梯与周报；DORA 指标；标定测试集扩充。

### M8 呈现（`m8`）

按 `ORCHESTRATION.md` §13 实现其余 UI：`ui-primitives` 在壳层模块表里（2026-10-28 读 rc.3 确认），组件以 rc.3 官方包实际用到的为准；替换现有设置页与 pill；按截图迭代，用户终审。项目图的右侧栏面板已提前到 M2（2.7），M8 沿用它的组件与样式。

### 借用组件核实清单（L3 / L4）

2026-10-28 对照 rc.3 运行时包的只读核查（结论见 `ORCHESTRATION.md` §2.1、§3、§4.5、§5、§13、§14 与 `FACTS.md` §3）留下的真机核实项，按依赖顺序排列，是相关条目的验收前提。L3 用探针做（`DEVELOPMENT.md` §3），L4 要在桌面版真实会话里看界面。同日的定案（不用队友角色与角色 preset，不用 Agent Team，人的界面不做网页）让其中几项不再需要，保留编号备查。4、4b、12 三项由派发可行性验证一并做完（2026-10-28，L3，探针场景 `glm-dispatch`、`glm-goal`、`goal-headless`）；会影响 M7 实现的发现写在 `DESIGN.md` §2.4a 与 `ORCHESTRATION.md` §2.1、§3.2。这三项也由 M7 的骨架场景 `glm-exec-skeleton` 覆盖（2026-11-06，L3，`ORCHESTRATION.md` §17.14）。第 18、19 项是用户图设计的假设 A6（2026-11-04 随用户图的文档收尾补进），走一遍作业与它的探针场景都等 M7 E6+ 合入。

| # | 核实项 | 层 | 依赖它的条目 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 启用 `agent-team-profile` 后根会话的工具面：是否同时有 `subagent`、`subagent_fork` 与 Team 九个工具，`send_message` 是否为 Team 版本 | L3 | 无（不用 Agent Team） | 不再需要 |
| 2 | 宿主层插件调用 `ctx.agentPresets.serviceFor(agent, 'planMode')` 能否拿到控制器，`set(agent, true)` 是否生效 | L3 | M3.3、M3.6 | 待核实 |
| 3 | bundle 插入的 preset：子行以包名子路径引用本包模块能否解析和激活，persona 与 `tool-fs` 的 `write: false` 是否生效，能否在设置与新会话中选到 | L3 / L4 | 无（不用角色 preset） | 不再需要 |
| 4 | 本包的宿主插件经 `subagents.startActivation` 启动后台子 agent，带 prompt、cwd、agentOptions、outputSchema；父 agent 的步继续；完成通知带结构化结果回到父 agent | L3 | M7 后台派发 | L3 已核实（2026-10-28，探针 `glm-dispatch`）；桌面版组合随 L4；M7 骨架 L3 已核实（2026-11-06，探针 `glm-exec-skeleton`）：执行行的派发（`dispatch_task`，带模型）、写入范围门禁与完成门禁（`update_goal complete` 在 `tools/pre-execute` 上判）连成一条，从放行到目标完成 |
| 4b | `tools/pre-execute` 看到子 agent 的工具调用，`exec.agent` 能映射回派发它的任务；范围外的写入被拒，拒绝以工具错误回到子 agent | L3 | M7 写入范围门禁 | L3 已核实（2026-10-28，探针 `glm-dispatch`）；M7 骨架 L3 已核实（2026-11-06，探针 `glm-exec-skeleton`）：执行行的派发（`dispatch_task`，带模型）、写入范围门禁与完成门禁（`update_goal complete` 在 `tools/pre-execute` 上判）连成一条，从放行到目标完成 |
| 5 | 第三方右侧栏标签页：`sidebarRightTabs.register`（带 `extension`）、正文槽与 guide 入口是否出现；`dsh.client.inject` 列出 sidebar-right 后加载顺序是否正确 | L4 | M2.7 | L4 已核实（2026-10-28）：页面类型与「开始」页入口出现，正文槽的 inject 拿到会话 |
| 6 | 第三方客户端调用 `ctx.sidebarRight.openTab('browser', …)` 打开本机查看器 | L4 | 无（不做网页形态） | 不再需要 |
| 7 | 自己标签页里的 `<iframe>` 指向回环地址在 Desktop 是否被拦 | L4 | 无（不做网页形态） | 不再需要 |
| 8 | 第三方客户端 inject `remote.workspaceFiles` 后 `read`、`list`、`changes` 是否可用 | L4 | M2.7、M2.8 | L4 已核实（2026-10-28）：`list`、`readBytes` 与目录 `changes` 都可用，写入后 4 秒内面板更新 |
| 9 | 第三方宿主插件注册的会话投影能否到达客户端 | L3（宿主侧注册）/ L4 | M2.8、M8 | 已核实（2026-10-28）：L3 探针从注册表的 `snapshot` 读到 `graphLive`；L4 经客户端 `sessions.list` 的 `projectionsBySession` 到达，主会话与子会话都不用 `retain`，宿主事件到界面 7–35 毫秒；冷会话只带投影缓存里已有的单元（`ORCHESTRATION.md` §2.10 实时现场）。没有改用 `faceOf(key)` |
| 10 | 第三方以 `pwsh`、`write` 为键注册 `tool.call.toolview` 的行为（覆盖、优先级、报错） | L4 | M8 guard 卡片 | 待核实 |
| 11 | 匹配 `tool/result` 的第三方聊天节点定义能否渲染在工具行之后 | L4 | M8 guard 卡片 | 待核实 |
| 12 | 在 `agent/pre-step` 给目标轮追加的 notice 是否破坏 `goal-round-driver` 的预约校验；`update_goal` 的 `complete` 能否在 `tools/pre-execute` 拦下 | L3 | M2.3 目标轮投影、M7 完成门禁 | L3 已核实（2026-10-28，探针 `glm-goal`）：不破坏，能拦下；桌面版组合随 L4；M7 骨架 L3 已核实（2026-11-06，探针 `glm-exec-skeleton`）：执行行的派发（`dispatch_task`，带模型）、写入范围门禁与完成门禁（`update_goal complete` 在 `tools/pre-execute` 上判）连成一条，从放行到目标完成 |
| 13 | guard 在 `tools/pre-execute` 里调用 `userQuestions.ask` 与 `approval.request` 时卡片是否出现、取消时信号是否正确；`conversation.approval.detail` 子槽能否由第三方占用 | L4 | M3.5 | 待核实 |
| 14 | `tool-ask-user` 改为 `mode: timed` 后，pending 与晚到答复的完整路径 | L4 | M3.4、M3.5（若用 timed 卡） | 待核实 |
| 15 | 用命令通道做 UI 写回时会话日志的增长量，以及确认命令运行不进模型请求 | L3（不进模型）/ L4（UI 写回） | M2.7、M3.5 | 待核实 |
| 16 | 主 Agent 身份文本与 `glm-prompt` 方言改写的叠加结果 | L3 | M3.1 | L3 已核实（2026-10-30，M3 第 3 步，场景 `glm-design-wish-idle`、`glm-design-main` 及其非 GLM 版）：GLM 路由上身份节在 ZCode 身份节之后、`glm:guard` 之前，非 GLM 路由上在 `glm:guard` 之前，主 Agent 的工具面在方言之后也没有 `Write`、`Edit`、`ask_user_question` |
| 17 | schedule 投递到冷会话时，恢复出的 agent 的工具面与本包各行是否齐全 | L4 | M7 巡检、M6 排期 | 待核实 |
| 18 | provider 目录里能否看出哪个模型支持图片输入（用户图设计 0.4.1 §15 A6 之一） | L3 | 用户图 U5b：`截图` 走法可不可用、派发拒绝 `walk_model_no_images` | 待核实，随 U5b 的探针场景 `glm-exec-walk`；看不出时 `截图` 一律不可用，流程改用 `终端`、`命令` 或 `你来走` |
| 19 | DSH 的读文件工具能否把图片交给模型：走一遍的复核子 agent 只拿到产物路径，看截图靠它（A6 之二） | L3 | 用户图 U5b：复核角色 `walk-review` | 待核实，随 `glm-exec-walk`：场景放一张真实的小图让复核说出图上的字，说不出就把 `截图` 从 `WALK_KINDS` 去掉 |

## 3. 需要用户的事项

在项目图上：人的决策队列（`npm run -s graph -- open` 的 `questions`）与待批准的提议（`proposals`）。2026-10-28 补图之后两者都是空的；agent 自己定的事在 `recentDecisions`，人不同意就再拍一次。
