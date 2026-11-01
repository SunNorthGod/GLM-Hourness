# DSH rc.3 借用组件核查报告（M2 / M3 / M7 / M8 前置）

日期：2026-10-28
范围：只读核查。对照桌面版运行时导出的包，核对 `docs/ORCHESTRATION.md` §14 借用表与 §15 待定项，回答六个问题。
来源优先级：`reference/dsh-desktop-0.2.1-rc.3/<包>/lib/*.js`、`README.md`、`cordis.patch.yml`（下文路径省略该前缀）；其次 `reference/deepseek-harness`（2026-10-23 主干，提交 `22ddee3`，只作设计意图，凡与 rc.3 不同处单独标出，路径写作 `main:packages/...`）。
标注：〔实读〕读过 rc.3 代码或 README；〔推断〕由 rc.3 代码推出、未在真机运行；〔README 级〕只读了说明文档。

---

## 0. 摘要

1. 第三方插件在 rc.3 能拿到的宿主面比文档设想的大。宿主层服务 `goals`、`schedule`、`subagents`、`agentPresets`、`userQuestions`、`approval`、`workspaceChanges`、`tokenMeter`、`sessionProjections` 都可以 inject。客户端插件导出 `inject` 与 `apply(ctx)`，能用 `slots`、`sidebarRightTabs`、`sidebarRight`、`uiConversation`、`resources`、`sessions`、`remote.commands`、`remote.workspaceFiles`、`remote.goals`、`remote.schedule`；壳层模块表里有 `@deepseek-ai/dsh-client-ui-primitives`。〔实读〕
2. 与项目文档相反的事实有五处：计划模式只靠提示词，不是只读；「行动卡片」在 rc.3 不存在；Desktop 里启用 Team 不会关闭普通 subagent 委派，而是用同名工具遮蔽了它的后续控制；`planMode` 与 `workflowEngine` 在 preset 组里隔离，宿主层插件不能直接 inject；rc.3 没有 LSP 包。详见 §8。
3. 驱动循环：推荐 `goal` + `goal-round-driver` 作节拍，我们的插件负责每拍注入投影、完成门禁和「由人发起」的创建与恢复；`schedule` 只管墙钟时间（晨报、巡检、谷段）；`tool-ralph` 不适合作主 Agent 驱动。
4. 角色卡：用 agent preset 表达（persona 行 + 工具行配置，例如 `tool-fs` 的 `write: false`、`edit: false`），子 agent 用 spawn 后端的 `agentPreset` 选择。Team 的队友在 rc.3 只能继承 Lead 的 preset，拿不到独立工具面。因此有工具白名单的角色队友应走 subagent，不走 Team。
5. 决策卡：同步卡有两条官方通道（`userQuestions.ask`、`approval.request`）。插件发起的、跨回合不阻断的异步卡在 rc.3 没有官方通道，需要自建（图上的待决节点 + 我们的 UI + 命令回写 + steer 消息）。
6. 项目图 UI：第三方静态包能注册右侧栏标签页、全局页面、输入框上方条、回合末尾卡片、聊天节点、按工具名的工具行视图。读文件用 `remote.workspaceFiles`（只读，含变更订阅），写回走命令通道或图工具；自定义 Remote 服务对第三方不现实。今晚的原型可以直接用 Desktop 的 Browser 标签页打开本机 loopback 服务（`ctx.sidebarRight.openTab('browser', { params: { url } })`），交互完整。

---

## 1. 借用表逐行核查（ORCHESTRATION.md §14）

| §14 行 | rc.3 组件 | 判定 |
| --- | --- | --- |
| 设计期只读、放行审阅 | `dsh-plan-mode`、`dsh-client-ui-plan` | 可用但有缺口：没有只读约束 |
| 五键、访谈提问 | `dsh-user-questions`、`dsh-tool-ask-user`、`dsh-client-ui-user-questions` | 可用但有缺口 |
| 同上（行动卡片） | 无 | 不可用：rc.3 不含该包 |
| 决策卡（同步） | `dsh-user-approval`、`dsh-client-ui-approval` | 可用但有缺口 |
| 分解与并行 | subagent 系列 | 可用 |
| 同上 | Agent Team 系列 | 可用但有缺口（实验、可选包默认关闭、队友无独立工具面） |
| 同上 | workflow 系列 | 可用但有缺口 |
| 驱动循环 | `dsh-goal`、`dsh-goal-round-driver`、`dsh-tool-goal`、`dsh-client-ui-goal` | 可用但有缺口 |
| 同上 | `dsh-tool-ralph`、`dsh-experimental-ralph-bundle` | 不适合作主 Agent 驱动 |
| 汇合门禁 | `dsh-workspace-changes` | 可用但有缺口 |
| 运维与晨报 | `dsh-schedule`、`dsh-tool-schedule`、`dsh-client-ui-schedule` | 可用 |
| 用量底座 | `dsh-token-meter`、`dsh-session-stats` | 可用（只核到服务名与投影键） |
| 外部工具 | `dsh-mcp-client` | 可用〔README 级〕 |
| 检查器 | 无 | 与文档一致；补充：rc.3 没有 LSP 包 |
| 状态机、阶段提醒、流程条、项目图 | 无 | 自建，接缝见 §5 |

### 1.1 设计期只读、放行审阅：plan-mode

判定：可用但有缺口。〔实读〕

证据：

- 服务名 `planMode`（`dsh-plan-mode/lib/index.js:148`），`static inject = ['tools', 'systemPrompt', 'sessionProjections']`。
- `get(agent)`（:343）返回 `{ active }` 或 `{ active, pending }`。`set(agent, active)`（:367）返回 `'committed' | 'queued' | 'cancelled' | 'noop'`；回合进行中时排队，到下一个被接受的 `agent/pre-step` 才写入。
- 唯一配置项 `section`，渲染为提示词节 `plan:policy`（:171），其他字段在加载时报错（`resolveConfig`）。
- 工具 `exit_plan_mode`（:230 起）：参数 `{ plan }`，必须是以 `# ` 标题开头的 Markdown。审阅调用 `ctx.get('userQuestions').ask(...)`（:257），问题带 `intent: { kind: 'plan-review', approve: 'Approve', callId }`（:275）。批准返回 `{ approved: true }`，下一步退出计划模式；选 Keep planning 抛出带反馈的错误；关闭审阅卡返回 `{ approved: false }` 并结束回合。没有 `userQuestions` 时工具失败。
- 状态写成日志事件 `plan/mode { active }`；投影键 `plan`，客户端视图 `{ active, pending }`。命令 `/plan`、`/plan off`、`/plan <message>`。
- README 已知限制「Guidance, not enforcement」：只用文字约束，全部工具照常可调（`dsh-plan-mode/README.md:184`）；子 agent 不能打开审阅（:187）。
- 组合位置：Desktop 的 `preset-standard` 把它放进 `planning` 组并隔离 `planMode`（`dsh-web-app/presets/standard.patch.yml:45-49`），宿主层同名行被禁用（`dsh-web-app/cordis.patch.yml:534`）。注册表 README：服务提供者与消费者必须在同一个 `cordis:group` 隔离域，宿主层的普通查找（包括 `agent.ctx`）取到的是宿主域（`dsh-agent-preset-registry/README.md:58`）。显式读取用 `ctx.agentPresets.serviceFor(agent, 'planMode')`（`dsh-agent-preset-registry/lib/index.js:725`）。
- 客户端 `dsh-client-ui-plan`：输入框计划芯片（槽 `conversation.input.plan`）、回合末尾计划卡片（`conversation.chat.turnTail`）、右侧栏计划预览标签页（`sidebarRightTabs.register` + `sidebar.right.pane.tab`）、资源提供者 `plan`（`lib/client.js:629-705`）。退出走 `ctx.remote.commands.execute(sessionId, '/plan off', [])`。

对设计的影响：

- 「设计期只读」必须由我们的 guard 实现：设计阶段在 `tools/pre-execute` 拦 `write`、`edit` 和写文件的 shell。计划模式提供的是提示词节、审阅卡和 `plan/mode` 状态。
- 五栏门禁挂在 `exit_plan_mode` 的 `tools/pre-execute`：五栏缺项直接拒绝并给正路，审阅卡不会出现。`{ approved: true }` 作为放行信号，由我们把对应分支从提议改为已批准。
- 宿主层插件读写计划状态要用 `agentPresets.serviceFor`，或者把我们的行放进同一个 preset 组。`section` 每个 preset 行只有一份文本，阶段相关的动态内容仍按 `DESIGN.md` §6 放在对话末尾。

### 1.2 五键、访谈提问：user-questions

判定：可用但有缺口。〔实读〕

证据：

- 服务名 `userQuestions`（Typert Remote 服务，Remote 方法 `answer`、`attachWait`）。
- `ask(request)`（`dsh-user-questions/lib/index.js:668`）。请求：`{ questions: [{ id, question, detail?, header?, options?: [{ label, description? }], multiSelect?, intent? }], agent?, signal? }`；返回：`{ answers: [{ id, selected: string[], custom? }] }`。单选时 `custom` 覆盖选项，多选时补充选项；跳过记为 `{ id, selected: [] }`。
- 传入 agent 时只接受 live root，子 agent 抛 `DELEGATED_CALLER`（:531-534）。其他错误码：`ASK_ABORTED`、`EMPTY_QUESTIONS`、`CALLER_NOT_LIVE`、`NO_PROVIDER`、`BAD_INTENT`；用户关闭没有 callId 的卡片得到 `ASK_CANCELLED`。
- `askTimed(request, callId, timeoutMs)`（:613）到时返回 `{ pending: true, callId }`。晚到答复的 `answer(agent, callId, answer)`（:552）只接受投影里状态为 `continued` 的问题；而投影只跟踪 timed 模式下名为 `ask_user_question` 的 `tool/call`（:199-201）。
- `intent` 在 rc.3 只有 `plan-review`（main 分支多了 `approval`，见 §7）。
- `dsh-tool-ask-user` 配置 `mode: legacy | timed`，默认 `legacy`（`lib/index.js:212`）；Desktop 标准 preset 的该行没有配置（`standard.patch.yml:110`），即阻塞式。
- 客户端：卡片占据输入框位置；`detail` 用 `MarkdownText` 渲染（GFM、TeX，丢弃原始 HTML）；首个带「(Recommended)」的选项预选；有跳过、自由文本、分页。同一时间只显示一张卡（`dsh-client-ui-user-questions/README.md:118`），没有侧栏收件箱（:119）。

对设计的影响：访谈的一问一答和五键都能用通用卡片表达：单选、两到五个选项、每项一句后果、推荐项放第一并加后缀、自由文本承载「拒绝理由」「补充」。卡面没有「来源节点」「后果」等结构化字段，只能写进 `detail` 的 Markdown。插件自己调用 `askTimed` 拿不到晚到答复，所以跨回合的异步卡要自建（§4）。

### 1.3 行动卡片（实验）

判定：不可用。〔实读〕rc.3 导出目录没有 `dsh-experimental-action-cards` 和 `dsh-experimental-client-ui-action-cards`，只有 main 分支有（`main:packages/experimental/action-cards`）。它的做法是：模型调用 `propose_action`，回合结束后显示卡片，用户稍后操作，选择记入日志并在下一请求以状态通知告诉模型。这正是我们要的异步决策卡形态，可以作为自建时的参照。

### 1.4 决策卡（同步）：user-approval

判定：可用但有缺口。〔实读〕

证据：

- 服务名 `approval`。`request({ agent, toolName, callId?, reason?, displayReason?, signal? })`（`dsh-user-approval/lib/index.js:128`）返回 `'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`（:30）。必须在打开的回合内调用，否则抛错（:130）。策略 `ask | never`，`setPolicy(agent, policy)` 切换并通知模型。日志事件 `approval/asked`、`approval/decided` 只入日志。
- 只有一次性授权（README:154）；请求不带工具参数（:155）；没有应答者时失败即拒。
- 客户端：输入框位置的审批卡，标题取 `reason` 或 `displayReason`，详情来自子槽 `conversation.approval.detail`（按 `callId` 渲染，`dsh-client-ui-approval/lib/client.js:40, 345-355`），两个按钮「拒绝」「允许一次」，Enter/Esc 快捷键。经转发的 waterfall `approval/request` 到达浏览器。
- 委派出去的子 agent 审批策略被固定为 `never`（`dsh-subagent/lib/index.js`，`captureDelegatedPolicyOverrides` 注释）。

对设计的影响：出工作区操作、往工作区外装工具这类同步卡直接用 `approval.request`，它的一次性、失败即拒与 §5「批准只放行当次」一致。需要多个选项、推荐与后果的同步卡改用 `userQuestions.ask`，同样阻塞当次工具调用。子 agent 的出界请求在宿主层已被自动拒绝，与 §6.2 一致。

### 1.5 分解与并行：subagent 系列

判定：可用。〔实读〕

证据：

- 服务名 `subagents`，留在宿主层（`dsh-web-app/cordis.patch.yml` 中 tool-subagent 段注释）。`startActivation({ provider, label, request: { prompt, parent, cwd?, agentPreset?, agentOptions?, outputSchema?, maxDepth? }, signal, delivery: 'parent' | 'caller', childId? })`（`dsh-subagent/lib/index.js:3036`）返回 `{ childId, messageId?, result, dispose }`。另有 `sendMessage`、`interrupt`、`listChildren`、`waitForChildren`、`drainChildren`。
- spawn 后端（`dsh-subagent-spawn-in-process/lib/index.js:21-27`）支持 `agentOptions`、`agentPreset`、`outputSchema`、`depthLimit`；fork 后端继承父会话已完成的回合并拒绝 `agentPreset`（`dsh-subagent/README.md:65`；`lib/index.js:3312`）。
- 未选 preset 的子 agent 加入父 agent 当前的 preset（`childSessionMeta` :346、`applyChildComposition` :373）。
- 默认 `maxDepth` 1（子 agent 不能再委派）、`maxActiveSubagents` 8。
- `dsh-tool-subagent`：工具名由 `toolName` 决定（标准 preset 有 `subagent` 与 `subagent_fork`），配置 `agentPreset`、`allowedAgentPresets`（`lib/index.js:322`）、`agentOptions`、`modelSelectionSettings`；旧字段 `persona`、`toolFilter` 加载即报错（:355）。
- `dsh-tool-subagent-control`：`send_message`、`interrupt_agent`、`list_agents`（`lib/index.js:23, 62`；`lib/types/list-agents.js:45`）。

对设计的影响：角色队友用「spawn + agentPreset」实现；简报四栏作为 prompt；交回契约用 `outputSchema`（结构化结果）；模型档位用 `agentOptions` 或 `modelSelectionSettings`；需要隔离写入时给 `cwd`（可配合可选包 Git Worktrees，`dsh-experimental-tool-worktree`）。

### 1.6 分解与并行：Agent Team 系列

判定：可用但有缺口。详见 §3。要点：实验包，作为可选包默认关闭（`dsh-app-boot/lib/index.js:579` `OPTIONAL_BUNDLES`）；队友继承 Lead 的 preset；启用后影响整个 profile 的每个根 agent。

### 1.7 分解与并行：workflow 系列

判定：可用但有缺口。〔实读〕

- `ctx.workflowEngine.start({ script, meta, args?, parent, signal? })` 返回 run `{ id, meta, result, cancel, dispose }`，`result` 不会 reject（`dsh-workflow/README.md`）。脚本钩子 `agent()`、`parallel()`、`pipeline()`、`phase()`、`log()`。
- `workflowEngine` 在 preset 的 `delegation` 组内隔离（`standard.patch.yml:83-87`），宿主层插件取不到；要用就自带一个隔离 `workflowEngine` 的组（Ralph 包的做法，`dsh-experimental-ralph-bundle/cordis.patch.yml`）。
- `agent()` 没有 preset 选项（`dsh-workflow-ptc/lib/index.js` 中不出现 `agentPreset`），子 agent 继承父 preset。
- `dsh-tool-workflow` 的 `workflow` 工具前台阻塞，或以 `run_in_background` 作为后台 job；没有断点续跑。`dsh-client-ui-workflow-run` 把 `tool-workflow/*` 事件折成独立聊天节点。

影响：适合一次性的大批量审计或迁移；承载有角色的队友不合适。

### 1.8 驱动循环

见 §2。

### 1.9 汇合门禁：workspace-changes

判定：可用但有缺口。〔实读〕`ctx.workspaceChanges.summary(sessionId, seq)` 与 `.diff(sessionId, seq, index, signal)`（`dsh-workspace-changes/lib/index.js:1019`）；每个顶层回合一条日志事件 `workspace/changes { turn }`。数据只在宿主进程内存里，会话释放或宿主重启后就没有了；非 git 目录只记录文件工具的改动。影响：「知识同步」检查可以查本回合改了哪些文件；需要跨重启保留的证据写进图。

### 1.10 运维与晨报：schedule

判定：可用。〔实读〕

- 服务名 `schedule`（宿主层，`dsh-web-app/cordis.patch.yml:139`）。`create(sessionId, { prompt, title, at | after_seconds | every_seconds | daily | weekly | cron }, signal)`（`dsh-schedule/lib/index.js:2083`），另有 `list`、`catalog`、`history`、`update`、`delete`。
- 到期时以 `agent.followup` 投递用户角色消息，来源 `{ kind: 'schedule' }`（:1594），正文带 `[SCHEDULE REMINDER]` 框架；冷会话会被恢复。
- 限制：宿主必须在运行，失败不自动重试（README:153）；只能投递到创建它的会话，不能每次新开会话（:157）；`every_seconds` 至少 60 秒；子 agent 会话拒绝。
- 模型工具 `schedule_create`、`schedule_list`、`schedule_delete`、`schedule_update` 在 preset 里；客户端经 Remote 命名空间 `schedule` 与转发事件 `schedule/changed`。

影响：晨报、巡检、谷段排期都能用。收到提醒的是那个会话里的 agent，所以要固定一个「运维会话」。提醒消息来源不是 `user`，`tool-goal` 的 create/edit/pause/resume 不会接受它触发的调用。

### 1.11 用量底座：token-meter、session-stats

判定：可用。〔实读，只核到服务名与键〕`ctx.tokenMeter`；投影 `tokenUsage`、`contextPressure`、`contextBreakdown`（`dsh-token-meter/lib/index.js:200, 394, 449`）、`sessionStats`（`dsh-session-stats/lib/index.js:67`）。字段语义未逐项核对。

### 1.12 外部工具：mcp-client

判定：可用〔README 级〕。每个服务器一行配置，工具名形如 `mcp__<server>__<tool>`，默认没有服务器。

### 1.13 检查器

判定：与文档「无」一致，但依据需要更正：rc.3 导出中没有任何 LSP 包（`dsh/package.json`、`dsh-web-app/package.json` 均无 lsp 依赖）。`ORCHESTRATION.md` §7.5 与 `FACTS.md:109` 引用的是 main 分支的 `packages/lsp`。

### 1.14 状态机、阶段提醒、流程条、项目图

判定：自建。可用接缝：告知用 `agent/pre-step` 追加带 `id` 与 `role` 的 notice（`DESIGN.md` §6）；门禁用 `tools/pre-execute`；呈现见 §5（输入框上方 `conversation.input.dock`、右侧栏标签页、回合末尾 `conversation.chat.turnTail`）。

---

## 2. 项目图的驱动循环（§2.1、§15）

判定：`goal` + `goal-round-driver` 可用但有缺口，推荐作节拍；`schedule` 用于墙钟时间；`tool-ralph` 不作主驱动。〔实读；与我们注入的配合为推断〕

### 2.1 各接缝的机制

| 接缝 | 机制 | 适配 |
| --- | --- | --- |
| goal + goal-round-driver | 同一会话；agent 空闲且 goal 处于 active、armed 时，`agent.followup` 一条 `<goal_round>` 用户消息 | 推荐作节拍 |
| schedule | 按墙钟时间投递提醒消息到原会话 | 晨报、巡检、谷段 |
| tool-ralph | 模型调用的前台工具；每轮一个新的子 agent；固定脚本；只跨轮传有界报告 | 不作主驱动 |
| 自写空闲驱动 | 监听 `agent/status` 为 idle 后 `followup` | 能做，代价是重写竞争保护 |

证据：

- goal 服务与驱动器留在宿主层（`dsh-web-app/cordis.patch.yml:525` 注释；`dsh-base/cordis.patch.yml:323-327` 插入 `goal`、`goal-round-driver`）。第三方 inject `goals` 即可。
- `ctx.goals.create(agent, { objective, maxGoalRounds? })` 创建并 arm（`dsh-goal/lib/index.js:635`）。服务层只检查 agent 是否 live（`prepareMutation` :755、`assertLive`），「必须由人直接发起」的检查只在 `dsh-tool-goal` 里。`resume(agent, ref)`（:686）同理。每个会话最多一个当前 goal；`maxGoalRounds` 必须是正整数，默认 256。
- 驱动器：每轮提示词由 `renderGoalRoundPrompt` 固定生成（`dsh-goal-round-driver/lib/index.js:11`），只含目标原文和轮次；有 subagent 服务时，每轮之前等待该 agent 正在推进的子 agent 结束（:132；README:53）；以 `agent.followup` 入队（:164）；该步标记 `startsRequestSeries`（:350）。会话恢复或 fork 后不会自动 arm（README:57）；遇到 max-tokens、取消、刷盘失败时 disarm；达到轮次上限时记 `round-limit` 阻塞。
- `dsh-tool-goal`：`get_goal`、`create_goal`、`update_goal`。目标轮内模型可以 `complete`；`blocked` 要求同一状况连续 3 轮；`create/edit/pause/resume` 要求当前回合有直接的人类消息。
- `tool-ralph`：前台工具，阻塞调用方回合直到全部轮次结束（`dsh-tool-ralph/README.md:12, 162`）；提示词规定只有人明确要求时才用；依赖 `workflowEngine`（`lib/index.js:13`）和固定脚本 `RALPH_SCRIPT`（:36）；所在可选包默认关闭。

### 2.2 取舍

- goal：节拍、轮次计数、恢复语义、竞争保护都现成。代价一是会话不断变长，要靠压缩和重锚；二是 goal 绑在会话上，换会话要重新创建并由人恢复，与 §2.1「会话随时可丢弃」有张力，但状态在图里，丢会话不丢进度。三是每轮提示词固定，投影要由我们在 `agent/pre-step` 识别 `source.kind === 'goal'` 且 `round > 0` 的消息后追加。四是轮次上限必填，与 §4.3「不设轮次预算」不完全一致，可设大值并把 `round-limit` 当作要汇报的事件。
- schedule：投递一条消息，不是节拍。
- ralph：每轮新上下文最贴合「状态全在图里」，但主 Agent 的回合被整段阻塞，不能并行派发，不能发异步卡后转做别的；workflow 的 `agent()` 也选不了 preset。
- 自写驱动：驱动器源码大半是竞争保护（预约、`agent/pre-step` 前后两次校验、`sessions.flush` 检查点、卸载时取消），重写成本高，收益只是换一套提示词。

### 2.3 建议

1. 节拍用 goal + goal-round-driver。我们的插件负责：
   - 由人发起：经命令（例如 `/hourness go`）或 UI 按钮创建或恢复 goal，目标文本取项目图当前目标。服务层不查人类授权，所以「不自动复活」这条要由我们的插件自己守住。
   - 每拍注入：在 `agent/pre-step` 检测目标轮消息后追加投影 notice（当前节点、祖先链、未过门禁）。
   - 完成门禁：在 `update_goal`（`action: complete`）的 `tools/pre-execute` 核对图上证据，缺证据时拒绝并给正路。
2. 墙钟任务用 schedule，并固定一个运维会话。
3. 叶子执行的「新上下文反复尝试」需要时，不用 workflow，直接由我们的派发工具调用 `subagents.startActivation`，这样子 agent 能带角色 preset。

---

## 3. Agent Team 与普通 subagent 委派（§3、§3.6、§15）

判定：两者在 rc.3 不会在加载时互斥，但启用 Team 后普通子 agent 的后续控制被遮蔽；Team 队友拿不到独立的 preset。对有工具白名单的角色队友，Team 不可用，应走 subagent。〔实读；工具面结果为推断〕

证据：

- Team 可选包的 profile 层只禁用四个行 id：`tool-subagent-control`、`tool-subagent-list-agents`、`tool-subagent`、`tool-subagent-fork`（`dsh-experimental-agent-team-profile/cordis.patch.yml:4-14`），并插入 `agent-team`、`tool-agent-team`、`ui-agent-team`。
- 在 Desktop，这四个 id 对应的宿主层行已被 web-app 层禁用（`dsh-web-app/cordis.patch.yml:560-572`），真正提供这些工具的是 `preset-standard` 内 `delegation` 组里的同名子行（`standard.patch.yml:83-107`）。
- 补丁按 id 定位时，只索引顶层行和 `group: true` 的数组子行（`dsh-app-boot/lib/index.js:61-68` `applyEntryPatches`）。preset 行的 `config.plugins` 不在索引里，所以 Team 层的禁用碰不到 preset 内的委派工具。
- `tool-agent-team` 在每个有 Team 身份的 agent 上安装工具（`lib/index.js:538` `maybeInstall`）；每个普通根 agent 都是隐式 Lead（`dsh-experimental-agent-team/lib/index.js:870-905` `tryMembership`；README:126）。安装内容：提示词节 `team:policy`、必需的运行时上下文 `team:identity`（:240）、九个工具 `spawn_teammate`、`send_message`、`list_agents`、`wait_agent`、`interrupt_agent`、`team_task_create/list/get/update`，注册在 agent 自己的作用域里。README 写明它们以同名方式遮蔽旧的子 agent 控制工具（`dsh-experimental-tool-agent-team/README.md:12`）。
- 推断结果：Desktop 启用 Team 后，根 agent 仍有 `subagent`、`subagent_fork`（能派、完成通知照常到达），但 `send_message`、`list_agents`、`interrupt_agent` 变成 Team 版本，只接受 Team 成员为目标，普通子 agent 无法再续聊、列出或中断。普通子 agent 自身不是 Team 成员，保留 preset 版本的 `send_message` 向父 agent 汇报。
- Team 队友的创建：`spawnAdmitted` 调用 `subagents.startActivation({ delivery: 'parent', childId, provider, label: description, request: { prompt, parent: root }, signal })`（`dsh-experimental-agent-team/lib/index.js:1032`），没有 `agentPreset`，所以队友加入 Lead 的 preset，工具面与 Lead 相同。身份只有运行时上下文里的 `You are teammate "<name>"` 加 description 与 prompt。
- 其他限制：实验包，契约可随时变；名册扁平且名字永久；`maxMembers` 在 profile 层为 8；所有成员共享一个 checkout，写入范围只是建议（README:203）；不会自动释放任务归属；需要持久会话存储。服务 `agentTeams` 的方法：`membership`、`listMembers`、`spawnTeammate`、`sendMessage`、`createTask`、`getTask`、`listTasks`、`updateTask`（CAS，带 `expectedRevision`）、`waitForChange`、`interrupt`（:1431-1585）。宿主插件持有 Lead 的 Agent 对象即可调用 `createTask`。
- 客户端 `dsh-experimental-client-ui-agent-team` 只在会话头部加一个动作（槽 `conversation.session.header.actions`），面板读投影 `agentTeam`，不做 Team RPC。

对设计的影响：

- §3.2 的队友角色卡（职责、最小权限工具白名单、独立记忆目录）在 rc.3 的 Team 里无法用工具面实现。可选的两条路：
  - A：Team 负责协调，角色只写在 prompt 里；工具白名单由我们的 guard 按 `agentTeams.tryMembership(agent).name` 在 `tools/pre-execute` 执行。白名单变成门禁而不是工具面，模型仍会看到全部工具。
  - B：角色队友用 subagent + 角色 preset（§6），任务板由项目图承担，派发、续聊、中断用 preset 版本的控制工具。
- 推荐 B 作为主路径。Team 启用后会作用于 profile 里每个根 agent（包括非 GLM 会话），与 §6.2「先只作用于 GLM 会话」冲突；Team 的任务板与项目图也会形成两份状态。
- 如果以后仍要用 Team，第一步是真机确认工具面（§9 第 1 项）。

---

## 4. 决策卡（§5）

判定：同步卡可用但有缺口；插件发起的异步跨回合卡在 rc.3 不可用，需要自建。〔实读〕

### 4.1 同步卡

- `userQuestions.ask(...)`：可以在我们自己的工具 `execute` 里调用，也可以在 guard 的 `tools/pre-execute` 里调用（agent 是当次调用的 live root，传入 `signal`）。阻塞到用户作答。卡面能放：`header`（短标题）、`question`、`detail`（Markdown）、选项的 `label` 与一句 `description`、多选、自由文本、跳过。答案以 `{ answers: [{ id, selected, custom? }] }` 回到调用代码。
- `approval.request(...)`：在打开的回合内调用，只有「允许一次 / 拒绝」，标题是 reason，详情由子槽 `conversation.approval.detail` 按 callId 渲染（该子槽是 `single`，第三方能否占用未核实）。结果是四值之一。
- 子 agent 调用两者都会被拒（`DELEGATED_CALLER`；审批策略固定 `never`），与「子 agent 出界默认拒绝、由主 Agent 汇总申报」一致。

### 4.2 异步卡

- 官方唯一的异步路径是 `ask_user_question` 的 timed 模式：要把 preset 里 `tool-ask-user` 改为 `mode: timed`；由模型调用而不是 harness；到时返回 pending，问题留在输入框位置可答，晚到答复以用户消息 `{"kind":"answer_to_pending_question","tool":"ask_user_question","callId",...}` 进入会话（来源 `user-question-reply`）。缺口：同时只显示一张卡，后来的排队；没有侧栏队列；卡面同 4.1。
- 插件自己调 `askTimed`：卡片会出现，但超时后投影不跟踪我们的调用，`answer` 返回 false，晚到答复丢失（`dsh-user-questions/lib/index.js:199-201, 552`）。
- 行动卡片在 rc.3 不存在（§1.3）。
- 第三方不能新增转发的 waterfall（`dsh-api-remotes/README.md:77-78`），所以也不能用自己的待办交互接管输入框位置。

### 4.3 自建方案（建议）

- 存储：决策卡就是图上的「待决」节点文件，跨回合、跨重启都在。
- 呈现：回合末尾卡片（`conversation.chat.turnTail`）、右侧栏决策队列标签页、输入框上方条显示待批数（§5）。
- 回写：客户端调用 `ctx.remote.commands.execute(sessionId, '/<命令> <id> <选项>', [])`；宿主命令处理器写回节点文件，再把一条用户角色消息 steer（agent 运行中）或 followup（agent 空闲，会开启新回合）进 agent，来源用我们自己的 `kind`。命令运行会记入会话日志（`command/run`、`command/done`），不进模型（`dsh-commands/README.md:12, 88`），可同时充当审计流水。
- 五键：设计阶段的方案汇报可在 `exit_plan_mode` 门禁通过后，用同步的 `userQuestions.ask` 发五个选项；若要不阻断，用上面的自建异步卡。

---

## 5. 项目图 UI（M8；§13 守卫卡片）

判定：右侧栏标签页、页面、面板都可用；读文件可用，写回需绕道命令或工具；自定义 Remote 服务对第三方不可用；HTML/SVG 交互视图可用。〔实读；Desktop 下 iframe 与第三方注册的实际表现待核〕

### 5.1 客户端插件拿到什么

- 静态包 `client.js` 的 factory 只收到 `require`，但它导出的 `inject` 与 `apply(ctx)` 会被加载器调用，`ctx` 上是声明过的客户端服务。本仓库 `ui/client.js` 已经这样用 `slots` 与 `remote.commands`。
- 模块表（壳层冻结表，`dsh-web-frontend/dist/assets/index-BXV-oxvX.js` 中的 `OZ()`；与 `main:packages/client/web/src/platform.ts:8-20` 一致）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`（React 18，`dsh-web-frontend/package.json`）、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。其他库（图布局等）要打进自己的 `client.js`。
- `ui-primitives` 在 rc.3 官方包中实际使用到的导出包括 `Button`、`Modal`、`Menu`、`Tooltip`、`Switch`、`SegmentedControl`、`Pill`、`Tag`、`StateDot`、`MarkdownText`、`CodeBlock`、`DiffBlock`、`JsonTree`、`DisclosureRow`、`SettingsForm`、`Toast` 与一组 `Icon*`。main 分支 README 写明插件之间不能互相引用组件，这个包是共享控件的唯一来源。名字以 rc.3 实际用到的为准。
- 样式：官方包在 factory 物化时往 `document.head` 插 `<style data-plugin-css>`（例如 `dsh-client-ui-plan/lib/client.js` 开头），第三方静态包可以照做；颜色用 `--dsw-*` token。
- `package.json` 的 `dsh.client.inject` 列的是必须先到达的包名（`dsh-client-modules/lib/client.js:789` 一带的 `arriveDependency`）。用到 `sidebarRightTabs` 时，官方包都列了 `@deepseek-ai/dsh-client-ui-sidebar-right`；用到 `remote.workspaceFiles` 时列了 `@deepseek-ai/dsh-api-workspace-files`。本仓库 `ui/package.json` 目前是 `inject: []`。

### 5.2 可用的落点

| 落点 | 接口 | 证据 |
| --- | --- | --- |
| 右侧栏标签页 | `ctx.sidebarRightTabs.register({ id, kind, patterns?, priority?, canOpen?, title, guide?, keepMounted?, multiple? })` + `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Body)`，Body 用 `useTabInfo()`；打开用 `ctx.sidebarRight.openTab(kind, { params })` 或 `openResource('dsh-resource://...')`；第三方默认优先级带 `extension` | `dsh-client-ui-sidebar-right/README.md:81-84`（README 说内置类型与外部包走同一条公开路径）；`dsh-client-ui-plan/lib/client.js:630, 691` |
| 全局页面 | 根作用域 `main` 键控槽 + `ctx.layout.selectPanel(id)` | `dsh-client-ui-layout/README.md:32` |
| 输入框上方流程条 | 槽 `conversation.input.dock`（目标条用 `order: 10`） | `dsh-client-ui-goal/lib/client.js:604` |
| 回合末尾卡片 | 槽 `conversation.chat.turnTail` | `dsh-client-ui-plan/lib/client.js:654` |
| 独立聊天节点 | `ctx.uiConversation.events.register({ kind, target: 'chat', match, start, update, buildViewNode })` + 槽 `conversation.chat.node`（按 kind 键控） | `dsh-client-ui-workflow-run/lib/client.js:591-660` |
| 工具行自定义渲染 | 槽 `tool.call.toolview`，键是工具的线上名称 | `dsh-client-ui-tool/README.md:36-41` |

### 5.3 读写图文件

- 读：`remote.workspaceFiles` 的 `read`、`readBytes`、`stat`、`list`、`changes`（文件或目录直接子项的变更订阅）；inject `'remote'`、`'remote.workspaceFiles'`；不提供任何写操作（`dsh-api-workspace-files/README.md:12`）。`dsh-client-ui-sidebar-files` 就是这样读的。
- 宿主推送给客户端：会话投影。宿主插件 `ctx.sessionProjections.register({ key, stateSchema, init, apply, wire: { viewSchema, view } })`，客户端用 `sessions.binding(sessionId).session.projections.faceOf(key)`（`dsh-client-ui-goal/lib/client.js:590`）或槽注入的 `useProjection(key)`。投影只能折叠已有的会话事件：第三方不能追加自定义事件，`appendPluginRecord` 文档明确禁止仓库外插件调用（`dsh-session/README.md:70`）。可折叠的有我们自己工具的 `tool/call` 与 `tool/result`、我们命令的 `command/run` 与 `command/done`、我们来源的 `user/message`。图本体在文件里，视图以读文件为准。
- 写：命令通道 `remote.commands.execute`（已在用），每次运行在会话日志留两条记录，不进模型；适合点击批准、拖拽改父节点这类低频写。高频或大块数据不要走命令。
- 自定义 Remote：客户端可调用的能力集合在 `dsh-api-remotes` 构建时固定（`README.md:77-78`）；`ctx.remote.$mount(contribution)` 要求 Typert 生成器产出的带严格编解码的 contribution，宿主侧还要 `TypertRemoteService` 与 typert 注册。没有面向第三方的文档路径。判定不可用（实际上）。

### 5.4 嵌入可交互的 HTML/SVG

- 在自己的标签页里用 React 直接渲染 SVG 并处理点击、拖拽：可用。这是普通 React 18 DOM。
- 今晚原型（本机 node:http 服务的查看器）：Desktop 上 `ui-sidebar-browser` 默认启用（`dsh-web-app/cordis.patch.yml:296-298`），客户端插件可调用 `ctx.sidebarRight.openTab('browser', { params: { url } })` 打开 loopback 页面（`dsh-client-ui-sidebar-browser/README.md:43`）。Desktop 用 Electron `<webview>`，页面里没有 DSH API，读写由页面自己的本机服务完成。这是官方支持的路径，可用。
- 在自己的标签页里放 `<iframe src="http://127.0.0.1:...">`：Desktop 浏览器标签用 webview 而且由主进程批准租约，普通 iframe 是否被拦未核实，列入真机检查。
- 文档预览渲染工作区 HTML 文件时是 Blob iframe、`sandbox="allow-scripts"`、无同源权限，不适合需要写回的交互视图。

### 5.5 守卫卡片（§13「工具调用行的自定义渲染」）

- 我们自己的工具（图工具、派发工具）可以注册 `tool.call.toolview` 视图，可用。
- 守卫拒绝发生在原生工具上（`pwsh`、`write`、`edit`），它们的行视图由 `dsh-client-ui-tool` 内置。第三方以同名键注册时是覆盖、并列还是报错未核实；即使能覆盖，也要自己重做原生卡片。判定可用但有缺口。
- 替代：注册一个聊天节点定义，匹配守卫拒绝产生的 `tool/result`（结果文本里带我们的标记），在该工具行之后渲染四段式卡片（与 `ui-workflow-run` 的做法相同）。

---

## 6. 角色卡（§3.1、§3.2）

判定：可用但有缺口。preset + persona + 工具行配置能给主 Agent 和 subagent 队友各自的身份、工具面与职责；Team 队友不行；`agent-instructions` 不承担角色。〔实读〕

证据：

- Preset 行：`@deepseek-ai/dsh-agent-preset`，配置 `{ id, name?, description?, order?, plugins: [...] }`，注册到 `agentPresets`（`dsh-agent-preset/lib/index.js`）。每个 preset 有独立的 Loader 树。新增 preset 的方式是 bundle 补丁 `insert` 一行（`dsh-agent-preset-registry/README.md:48`）。会话选择 preset：设置里的默认 preset，或空白会话调用 `agentPresets.select(agent, id)`（`lib/index.js:750`）。
- `dsh-persona`（只能挂在 preset 里）：`prefix`（必填）、`suffix`、`complete`、`includeRuntimeContext`，遮蔽部署级 persona 节（`dsh-persona/lib/index.js`）。
- 工具面：`dsh-tool-fs` 的配置可分别关闭 `read`、`write`、`edit`、`readImage`（`lib/index.js:1194`；README 配置表）。主 Agent 的 preset 可写 `write: false`、`edit: false` 并不放 shell 工具行，「主 Agent 不写代码」由此成为工具面上的硬约束。
- 子 agent 选角色：`dsh-tool-subagent` 的 `allowedAgentPresets` 让模型在 `agent_preset` 枚举中选，描述取各 preset 的 `description`；或我们的派发工具直接调 `subagents.startActivation({ ..., request: { agentPreset } })`。只有 spawn 后端支持，fork 拒绝。冷恢复按记录的 preset id 重新挂载。
- 模型档位不在 preset 里，由 `tool-subagent` 的 `agentOptions` 或 `modelSelectionSettings` 决定。
- `dsh-agent-instructions`：对每个 agent 加载同一条工作区 `AGENTS.md`/`CLAUDE.md` 链，配置项 `instructionFileCandidates` 等可按 preset 行不同，但候选是每个目录里的文件名，能否写成角色专用路径未核实。它适合承载项目规则，不适合承载角色卡。
- 记忆目录：DSH 没有按角色分记忆的机制，我们的 memory 行需要按 `agentPresets.composedPreset(agent.ctx)` 分目录。

缺口：

- preset 子行里的 `./` 相对模块名不会被锚定成文件 URL：锚定只处理 `insert` 行和 `group: true` 的子行（`dsh-app-boot/lib/index.js:3971-3976`）。我们自己的插件模块放进 preset 时要用包名子路径或 `!!js` 求出的绝对 URL，能否从 preset 树解析到第三方 bundle 的模块需要沙盒验证。
- 用户在编辑器里覆盖 preset 会整份替换子行列表；preset 不是安全沙盒。
- 宿主层注册的全局工具（例如以后的图工具）会出现在所有 preset 里；只给某个角色的工具要注册在 preset 内，或在该作用域用 `restrict()` 过滤。
- 本仓库 `glm-prompt` 会在 GLM 路由下改写系统提示词节，角色 persona 与身份改写的叠加顺序需要设计并验证。
- Team 队友无法使用 preset（§3）。

对设计的影响：主 Agent 用一个项目经理 preset（PM persona、只读文件工具、goal/plan/ask-user（timed）/schedule/todo、派发工具、`allowedAgentPresets` 列出五个角色 preset）。实现、测试、审查、文档、运维各一个 preset，持有各自的工具白名单。用户人设与角色卡分层：用户人设在用户层规则里，角色卡在 preset 的 persona 里。

---

## 7. 与 main 分支的差异（只作设计意图）

| 项 | rc.3 桌面版 | main（2026-10-23） |
| --- | --- | --- |
| 行动卡片 | 无 | `experimental/action-cards`、`client-ui-action-cards`，`propose_action` 工具带 `when` 条件注册 |
| user-questions 的 intent | 只有 `plan-review` | 多了 `approval`（`approve`、`reject`、可选 `always`），`main:packages/interaction/user-questions/src/types.ts:26-46` |
| LSP | 无包 | `packages/lsp`（lsp、lsp-stdio、tool-lsp） |
| 工具注册条件 | `register(definition)` 无第二参数（`DESIGN.md` §2.4a） | 有 `when` 条件 |
| Team 可选包补丁 | 禁用四个 id | 禁用三个 id（没有 list-agents 行） |
| 钩子与 webhook 实验包 | 无 | `hook-protocol`、`hooks-claude-code`、`hooks-codex`、`webhook` |
| ui-primitives 导出 | 以 rc.3 官方包实际用到的为准 | README 列出更多组件（如 `DetailDocument`），rc.3 是否有未核实 |

升级提醒：main 的 `approval` intent 带 `always`（以后都允许），若 DSH 升级后在我们的卡片里出现，要按 §5「界面不提供以后都允许」处理掉。

---

## 8. 项目文档需要修正的条目

1. `ORCHESTRATION.md` §4.5「借用 DSH 计划模式：设计期只读」与 §14 第一行：计划模式只靠提示词，所有工具照常可调（`dsh-plan-mode/README.md:184`）。改为「借用计划模式的提示词节、审阅卡与 plan 状态；只读由 guard 实现」。
2. §5「借用：……行动卡片（实验）」与 §14「五键、访谈提问」行：rc.3 没有行动卡片，只在 main。删除或标注「main 分支，rc.3 不可用」。
3. §3.6「注意：启用 Team 的整包会关闭普通 subagent 委派」：在 Desktop，profile 层的禁用碰不到 preset 内的委派工具；`subagent`、`subagent_fork` 仍在，但 `send_message`、`list_agents`、`interrupt_agent` 被 Team 同名工具遮蔽，普通子 agent 失去续聊、列出、中断。并补充：Team 作用于 profile 里每个根 agent。
4. §3.2 / §3.6「队友角色卡……工具白名单（最小权限）」「项目图的叶子投影到 Team 的任务板」：rc.3 的 Team 队友只能继承 Lead 的 preset，没有独立工具面。角色队友改为 subagent + 角色 preset；Team 降为可选协调层。
5. §7.5 与 §14「DSH 的 LSP 包只提供……〔实读〕」及 `FACTS.md:109`：依据是 main 分支；rc.3 桌面版没有 LSP 包。结论「检查器由本层实现」不变。
6. §13「优先使用 DSH 的基础组件库 ui-primitives（第三方 client 包能否引用待核实）」与 §15 对应行：已核实，壳层模块表含 `@deepseek-ai/dsh-client-ui-primitives`，可以 `require`。关闭待定项。
7. §13 约束「静态包 client 半只拿到 require 模块表」与 `DEVELOPMENT.md` §5.6：factory 只收到 `require` 属实，但导出的 `apply(ctx)` 会拿到声明过的客户端服务（slots、sidebarRightTabs、sidebarRight、uiConversation、resources、sessions、remote.*）。§5.6 的「或自定义 Remote 服务」对第三方不现实，改为「读用 remote.workspaceFiles 与会话投影，写用命令通道或工具」。并补充 `dsh.client.inject` 要列出依赖的包名。
8. §14「驱动循环：tool-ralph」：Ralph 是要人明确要求才用的前台工具，所在可选包默认关闭，不能作主 Agent 的驱动接缝。§15「驱动循环借用哪个接缝」可按 §2.3 定案。
9. §15「Agent Team 实验状态与普通 subagent 委派互斥的影响」：按 §3 结论关闭。
10. §4.3「不设积分与轮次预算〔定案〕」与 §4.6「长任务借用 DSH 会话目标」：goal 的 `maxGoalRounds` 必填（默认 256），到上限记 `round-limit` 阻塞。需要写明：设大值，上限作为汇报事件，而不是预算。另：goal 在会话恢复或 fork 后不会自动 arm，驱动器每轮前等待子 agent 结束。
11. §11.4 与 §12「由 DSH 定时提醒触发」：提醒只投递到创建它的会话，不能每次新开会话；宿主必须在运行，失败不重试；投递的是一条提醒消息，工作由该会话的 agent 执行。需要写明固定运维会话。
12. §13「guard 拒绝 → 工具调用行的自定义渲染」：按工具名的视图只适合我们自己的工具；原生工具行由 ui-tool 内置，覆盖行为未核实。补充替代方案：聊天节点定义匹配 `tool/result`。
13. §2.1「先例：……DSH 的 tool-ralph 每轮只传有界报告」本身正确，无需改；但「本设计把清单换成树」若意指沿用 Ralph 的执行模型，应改为沿用 goal 的同会话节拍，见 §2。

---

## 9. 仍需真机核实

按依赖顺序排列，都应先在 `glmsandbox` 这类临时 profile 的 headless 沙盒或真机会话里做（`DEVELOPMENT.md` §3）。

1. Team 工具面：启用 `agent-team-profile` 后，根会话的 `assembly.tools` 里是否同时有 `subagent`、`subagent_fork` 与 Team 九个工具，`send_message` 是否为 Team 版本。
2. 宿主层插件调用 `ctx.agentPresets.serviceFor(agent, 'planMode')` 能否拿到控制器，`set(agent, true)` 是否生效。
3. bundle 插入的 preset：子行以包名子路径引用 `dsh-glm-hourness` 的模块能否解析和激活；persona 与 `tool-fs` 的 `write: false` 是否生效；该 preset 能否在设置和新会话中选到。
4. 我们 preset 内的 `tool-subagent`（带 `allowedAgentPresets`）派出的子 agent 是否拿到角色 preset 的工具面，preset 版 `send_message` 续聊是否正常。
5. 第三方右侧栏标签页：`sidebarRightTabs.register`（`extension` 带）+ 正文槽 + guide 入口是否出现；`dsh.client.inject` 列出 sidebar-right 后加载顺序是否正确。
6. 第三方客户端调用 `ctx.sidebarRight.openTab('browser', { params: { url: 'http://127.0.0.1:<port>/' } })`，webview 能否打开本机查看器并正常交互。
7. 自己标签页里的 `<iframe>` 指向 loopback 在 Desktop 是否被拦。
8. 第三方客户端 inject `remote.workspaceFiles` 后 `read`、`list`、`changes` 是否可用。
9. 第三方宿主插件注册的会话投影能否经 `faceOf(key)` 到达客户端。
10. 第三方以 `pwsh`、`write` 为键注册 `tool.call.toolview` 的行为（覆盖、优先级、报错）。
11. 匹配 `tool/result` 的第三方聊天节点定义能否渲染在工具行之后。
12. 我们在 `agent/pre-step` 给目标轮追加的 notice 是否破坏 goal-round-driver 的预约校验。
13. guard 在 `tools/pre-execute` 里调用 `userQuestions.ask` 与 `approval.request` 时卡片是否出现、取消时信号是否正确；`conversation.approval.detail` 子槽能否由第三方占用。
14. 我们 preset 内 `tool-ask-user` 改为 `mode: timed` 后，pending 与晚到答复的完整路径。
15. 命令通道作为 UI 写回时的会话日志增长量，以及确认不进入模型请求。
16. `glm-prompt` 的提示词改写与 preset persona 的叠加结果。
17. schedule 投递到冷会话时恢复出的 agent 是否用的是我们的 preset。

---

## 10. 建议（不实施）

1. M2/M8 第一步：今晚的查看器经 Browser 标签页打开（一个输入框上方按钮或 guide 入口调用 `openTab('browser', ...)`），先拿到完整交互。之后再做原生标签页：React 渲染 SVG，经 `remote.workspaceFiles` 读图文件并订阅变更，写回经命令进入与图工具同一个宿主图服务，让人和 LLM 的改动走同一套校验与 guard。
2. M3：阶段状态机放在我们的宿主插件里，状态存图；设计阶段由 guard 拦写入；`exit_plan_mode` 前置五栏门禁；放行后用同步 `userQuestions.ask` 出五键，或用自建异步卡。
3. M7：主 Agent 用 PM preset；五个角色各一个 preset；派发走我们自己的工具调用 `subagents.startActivation`（spawn、`agentPreset`、`outputSchema`、`agentOptions`、`cwd`）。Team 暂不启用，等 §9 第 1 项核实后再评估。
4. 驱动：goal + goal-round-driver，加我们的每拍注入、完成门禁与由人发起的创建和恢复；墙钟任务用 schedule，固定运维会话。
5. 把 §8 的修正与本报告的结论同批写进 `ORCHESTRATION.md`、`DEVELOPMENT.md`、`FACTS.md`；§15 的三个待定项（驱动接缝、Team 互斥、ui-primitives）可以关闭或改写为已定。
