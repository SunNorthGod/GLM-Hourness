# M3 设计评审（第 4 轮）

评审对象：`.agents/tasks/m3/design.md` 0.4（2026-10-29，按第 3 轮评审修订，§14 第一张表）。
依据：main `7148448`（`c8492af..7148448` 只改 `docs/graph/graph.svg`、`docs/graph/nodes/m3.json`、`docs/graph/nodes/split.json`，两条批注记的是用户「行，那就再加，继续吧」；`git diff --stat 28ce4f4 c8492af -- src scripts` 为空，`8f1a4c6..c8492af` 在 `src ui tests scripts` 下只有 `ui/src/graph/Panel.tsx`，与设计文件头一致）；split worktree `.worktrees/split` 头 `0fe76a5`；split 附录 `.agents/tasks/split/design-addendum-q17b.md`（文件头现为 0.4，第四稿）与 `addendum-review.md`（第 4 轮，CHANGES_REQUESTED，D01–D05，都在 profile 切换脚本）；rc.3 的 cordis、cordis-plugin-loader、commands、agent、agent-loop、user-questions、session、headless；本仓库 `src/shared/dsh-min.ts`、`src/graph/engine.ts`、`src/graph/store.ts`、`src/graph/mutation.ts`、`src/graph/index.ts`、`src/guard/index.ts`、`src/guard/graph-files.ts`、`scripts/probe/probe-llm.mjs`、`scripts/probe/run-probe.mjs`；worktree 的 `src/graph/index.ts`、`src/graph/tools.ts`、`src/graph/panel-row.ts`、`src/graph/service.ts`、`src/shared/step-notice.ts`；split 设计 `.agents/tasks/split/design.md` 的 X9 与 `/hourness-status`。

## 0. 先前意见的状态

第 3 轮的 5 条意见逐条对照 0.4 的正文与源码核对。

| id | 级别 | 状态 | 核对 |
| --- | --- | --- | --- |
| R3-M1 | MEDIUM | Closed | §3.5.2 的筛选现为 A（无 `origin: 'subagent'`）、B（`mainAgentActive`）、C（同一张图）、D（焦点所属目标）四条，按同步两条、图目录、焦点的顺序判。C 取图行服务的 `dirFor(session.header.cwd)` 与被写的 `dir` 经 `sameDir` 比较（两边 `realpath`，失败退回 `path.resolve`，斜杠统一、去尾斜杠，win32 转小写）。与第 3 轮修法不同的那一处（候选目录取图行的 `dirFor`，不取面板行的 `configured`）成立：worktree `src/graph/index.ts`:104 `graphTools(dir, focuses)` 与 :119 `provideService(ctx, dir, …)` 用同一个 `dir`，:77 `dirFor` 就是 `resolveGraphDir(dir, cwd)`，`src/graph/tools.ts`:62–79 的 `locateGraph`、`graphDir` 用同一个 `configured`，所以候选的焦点 id 属于 `dirFor` 指向的那张图；面板行的 `applyFromCommand` 用自己的 `configured`（worktree `panel-row.ts`:76–86、178），两行配置不同时连调用会话也不过 C，设计写明了。`nextId` 为 `${type}-${index}` 取第一个空号（`engine.ts`:295–300）、`roots()` 是进程级（agent:617–625），属实。L2 加了两个工作区同 id、大小写不同的同一目录、两行配置不同三例；m3-5 验收第 2 条、§6.4 新不变量、§10、§11 与 L4 第 4 项都写了「同一张图」。无回归 |
| R3-M2 | MEDIUM | Closed | 新增 §9.1.1：探针 provider 的 `line` 步经 `commands.execute(agent, line, [], new AbortController().signal)` 发命令，命令事件照常进日志；与 `command` 互斥；写明第 N 步的 `line` 只影响第 N+1 步的请求、第 N 步回复里的工具调用按命令之后的角色判；占位 `{lastCard}`、`{rev:<id>}`、`{lastCardRev}` 的取法与字符集；经 `session/event` 记事件数、类型与字节数。重核：`execute` 没有按 agent 状态拒绝的分支，`command/run`、`command/done` 经 `appendLifecycle` 直接 `session.append`（commands:327–395、419–421），远程的 `commands.execute` 就是同一个方法（commands:218–219、231–241），所以运行中发命令与桌面版上人在 agent 运行时发命令是同一条路径；`session.eventAt` 标为 deprecated、禁止新调用（session:1433–1439），headless 用 `session/event`（headless index.js:335）。`glm-design-main` 拆成 `glm-design-wish-idle` 与逐请求写出的 `glm-design-main`（`/wish` 之前两请求、`line: '/wish'`、`line: '/wish <一句话>'` 走 `steer`、`line: '/wish off'`、两次 `status`），`non-glm-design-main` 同样拆；`glm-decision-card` 的 `decide` 经 `line` 发并核对第 15 项。与评审修法不同的那一处成立：加载器并发创建同一组里的各行（cordis-plugin-loader:87 `Promise.all`，由 `Group[Service.init]` 的 `update` 进入，:112–115），串行事件按注册顺序（cordis:289–294）、`on` 按 `push` 或 `unshift`（:336），激活次序不能从配置顺序推出；改为 `/wish` 处理函数自己同步调 `installAgentHooks`，按 agent 去重，第一次组装不依赖本行的 `agent/created` 监听器先跑。模拟人的 `wish` 部分与覆盖行挪到第 3 步，应答部分分到第 6、8、9 步，与各步 L3 的需要一致。剩下的三处小问题见 R4-L1、R4-L2、R4-L3（LOW） |
| R3-L1 | LOW | Closed | `dispatchRoot` 改为第一跳在循环体里判、在循环里返回 `root`；参数收窄为 `Dispatched {id, session: SessionLike}`，`agents` 为 `Pick<AgentsService, 'get'>`；监听器在 `payload.agent?.session` 为 `undefined` 时直接 `next()`（§3.1.4）。`LiveAgentLike.session` 是必填（`src/shared/dsh-min.ts`），`root.session.header` 可以访问；`for (;;)` 无出口，函数末尾不可达，strict 下不需要非空断言 |
| R3-L2 | LOW | Closed | `src/graph/main-agent.ts` 挪到第 2 步与 `stage.ts` 一起建，加 `tests/graph-main-agent.spec.ts`；第 3 步只导入；「先后」写第 11 步在第 2 步与附录合入之后、可与 3–10 并行，L4 随第 12 步（b） |
| R3-L3 | LOW | Closed | 文件头、§0、§7 不再写附录的版本号与轮次，改为「以评审 APPROVED 的附录为准，开工前核对引用的十个标题」，当前状态指向 `addendum-review.json`。附录已到 0.4、第 4 轮评审 CHANGES_REQUESTED（D01–D05），十个标题都在（§2.1 目录、§2.2 清单、§2.3 行 id 与其他持久化标识、§2.4 桌面版 profile：切换前后、§2.5 glmsandbox、§3.1 第 5 步、§3.2 第 6 步、§3.3 第 5、6 步的检查与测试、§4 合入顺序、§7.4 对人定事项的影响），本设计不用跟着改。m8-ui-audit 合入（`20ed994`，`c8492af` 记为 done）的更新属实 |

## 1. 结论

结论：APPROVED。第 3 轮意见全部关闭；本轮新意见 LOW 4 条，没有 HIGH 与 MEDIUM。四条都是实现前顺手改正文即可的一致性问题，不改变设计的结构、宿主契约用法与人定事项。

## 2. 新意见

### R4-L1（LOW）`/wish` 处理函数把调用参数里的 agent 交给 `installAgentHooks`，薄适配层的类型不允许

位置：§3.1.1「每 agent 的监听器」一段；§3.1.3 `installAgentHooks(agent)`、`WeakSet<AgentLike>`；§3.6.2 `installStepNotice(agent, …)`；§2.1 与 §8 第 3 步的薄适配层清单。

问题：命令处理函数收到的 `invocation.agent` 在薄适配层里是 `LiveAgentLike`（`AgentCommandInvocationLike.agent: LiveAgentLike`，`src/shared/dsh-min.ts`），它只有 `id`、`session`、`status`、`followup`、`inject`、`cancel`，没有 `ctx`。`installAgentHooks` 要调 `agent.ctx.on('system-prompt/assemble', …)`，并把 agent 交给 `installStepNotice(agent: AgentLike, …)`（worktree `src/shared/step-notice.ts`:28，函数体里 `agent.ctx.on('agent/pre-step', …)`），去重用 `WeakSet<AgentLike>`。按设计列出的薄适配层改动（`LiveAgentLike.steer`、`AgentsService.roots`、`SessionProjectionsService.stateOf`、`UserQuestionsService`）实现，`installAgentHooks(invocation.agent)` 在 strict 下编译不过。运行时没有问题：rc.3 的 `ReactLoopAgent` 有 `ctx`（agent-loop:757、779，`this.ctx = this.scope.ctx`），命令调用与 `agent/created` 载荷是同一个对象（commands:379–385 的 `agent` 是 `execute` 收到的那个；agent:581–585 发的是 `entry.agent`，`get` 返回的也是它，:596–598），`WeakSet` 去重成立。

修法：薄适配层的 `LiveAgentLike` 加 `readonly ctx: PluginContext`（注释写 agent-loop:757、779），使它可以赋给 `AgentLike`；§2.1 的薄适配层一行与 §8 第 3 步的清单加上这一项，§4 契约表「活 agent 的 followup、steer、inject、status」一行补 `ctx`。

### R4-L2（LOW）`glm-design-stage` 有一项核对要第 7 步的功能，却列为第 5 步的 L3

位置：§8 第 5 步的 L3 列「场景 `glm-design-stage`、`glm-design-stage-compact`」；§9.1.3 `glm-design-stage` 脚本第 6 条「请求 6：消息里有 `glm-graph-decision` notice（批准也回写，§3.5.2）」；§8 第 7 步的 L3 列。

问题：`/graph-apply` 在批准之后通知主 Agent 是第 7 步实现的（§3.5.2，第 7 步「`/graph-apply` 的回写」）。第 5 步做完时这条 notice 不会出现，按字面跑第 5 步的 L3，`glm-design-stage` 在请求 6 判失败。场景的其余部分（`line` 步发 `approve` 与改阶段、三次派发的拦与放）不依赖第 7 步。

修法：第 9.1.3 的脚本第 6 条写明「这一项在第 7 步加入场景核对」；§8 第 7 步的 L3 列在 `glm-decision-card` 的回写部分之外加「`glm-design-stage` 请求 6 的 `glm-graph-decision` notice（批准的回写）」。

### R4-L3（LOW）`non-glm-design-main` 跑在 `probe-hourness` 上，脚本里的 `status` 步读的 `/glm-status` 不在这个组合里

位置：§9.1.3 场景表 `non-glm-design-main`「同 `glm-design-main`」；`glm-design-main` 脚本第 3、8 条的 `status: true` 与「`/glm-status` 的 `design` 行」。

问题：探针的 `status: true` 固定调 `/glm-status`（`scripts/probe/probe-llm.mjs`:110–112，worktree 同），`/glm-status` 由 GLM 包的 `glm-login` 行注册；`probe-hourness` 只列编排层包（split 设计 §7.3，附录「第 6 步：UI 拆分」：`probe-glm`、`probe-hourness` 同 0.3）。在这个组合里 `runCommand` 返回「probe: /glm-status is not registered」，`non-glm-design-main` 的请求 3、8 的 `design` 行核对无从谈起。编排层包自己的健康命令是 split 第 4 步加的 `/hourness-status`（split 设计 X9、§2.5），设计 §6.6 也写了它列出 `design` 行。

修法：§9.1.3 写明 `non-glm-design-main` 的请求 3、8 不用 `status: true`，改用 `command: {name: 'hourness-status', input: ''}`（这两步没有 `line`，与 `command` 不冲突），核对其输出里的 `design` 行；`glm-design-main` 可以照旧用 `status: true`，或同样改用 `/hourness-status`，让两个场景同形。

### R4-L4（LOW）设计行激活之前已开着的普通会话会看到两个设计工具，降级表只写了主 Agent 会话

位置：§6.2「组装监听器与阶段提醒｜agent 在本行激活之前就已创建」一行；§10 倒数第二条。

问题：两个设计工具全局注册（§3.4.4），从工具面里去掉它们的是每 agent 的组装监听器（§3.1.3）。本行激活之前已创建的 agent 没有这个监听器，所以插件管理器启用本行或本行重新加载之后，这些会话里的普通会话（不是主 Agent）每步的工具面都多了 `design_review` 与 `decision_card`；GLM 路由上它们在 `ORCHESTRATION_RESIDENT_TOOLS` 里，是常驻的。调用时工具体按调用方拒绝（`forbidden`），不会写图，但 m3-1 验收第 3 条「主 Agent 的工具面等于普通会话的工具面加两个设计工具」在这些会话上不成立，且健康表不报（§6.2 的检测只在主 Agent 写调用或调用设计工具时触发）。表里「两个设计工具也不被滤掉」写在主 Agent 会话上，对主 Agent 本来就不该滤掉，描述错了对象。第 12 步（b）是重启桌面版之后看 L4，不受影响。

修法：§6.2 这一行的「调用方收到」改为两句：「已是主 Agent 的会话在重发 `/wish` 之前没有身份节与阶段提醒，写入规则照常拦；普通会话的工具面里多了两个设计工具，调用时得到 `forbidden`，会话重新打开或桌面版重启之后恢复」；§10 那一条同样补普通会话的情形。不要求改实现。

## 3. 已核实的假设

本轮新核实或重新核实的（前几轮已核实且本轮未变的条目不重复）：

- 依据：main `7148448`，`c8492af..7148448` 只有图提交；`28ce4f4..c8492af` 的 `src`、`scripts` 无改动；`8f1a4c6..c8492af` 的代码目录只有 `ui/src/graph/Panel.tsx`。`docs/ORCHESTRATION.md` 当前没有未提交的改动（`git status` 只有 `.kiro/`）。
- 加载器与事件：`EntryGroup.update` 以 `Promise.all(ids.map(... create ...))` 并发创建同一组的各行（cordis-plugin-loader:78–93），`Group` 的初始化走它（:112–115）；`serial` 按 `dispatch` 的顺序逐个 `await`（cordis:289–294）；`register` 按 `prepend` 选 `unshift` 或 `push`（:335–345）；`fiber.effect` 在返回之前同步调 `_execute(runner)`（:1169、1249–1250），所以 `/wish` 处理函数里调的 `agent.ctx.on` 在 `followup` 之前已生效。
- 命令：`execute` 只在语法或名字解析不到时返回 `undefined`，之后读 `signal.aborted`，追加 `command/run`、调处理函数、`await withAbort`、`settle` 追加 `command/done`（commands:327–395）；`appendLifecycle` 直接 `session.append`，不开回合（:413–421）；没有按 agent 状态拒绝的分支；`list`、`execute` 是 Remote 方法（:218–241）。
- agent 注册表：`announce` 以 `entry.agent` 发 `agent/created`（agent:574–590）；`get` 返回同一个对象（:596–598）；`roots()` 为所有 `owner === undefined` 的活 agent（:623–625）；`assertLiveRoot` 用 `roots().includes(agent)` 判根（user-questions:531–535）。
- `ReactLoopAgent`：有 `ctx`（agent-loop:757、779）、`session`、`status`（:790–792）；`followup` 为 `next-turn` 唤醒，`steer` 为 `next-step` 唤醒，`inject` 为 `next-step` 不唤醒（:800–814）。
- headless：`agents.create` 之后 `await agent.whenIdle()` 再 `followup` 任务（headless index.js:317–346），`session/event` 监听写法在 :335；`session.eventAt` 为 deprecated（session:1433–1439）。
- 图：`nextId`（`engine.ts`:295–300）；`planEdit` 的目标拒绝在 `ownProposal` 之前（:438–441），D5 片段与它同形；`initialStatus` 对带 `supersedes` 连线的提议一律 `proposed`（:284）；修订号是 sha256 的前 12 位十六进制（`store.ts`:16–17），落在 `^[A-Za-z0-9._-]+$` 里；`approve`、`reject`、`edit`、`decide` 都收 `rev`，`comment` 只收 `{id, text}`（`mutation.ts`:147–162），`line` 步里写出的 `/graph-apply` JSON 字段齐全。
- 图目录：worktree `src/graph/index.ts`:75–85、104、119 与 `src/graph/tools.ts`:62–79（见第 0 节 R3-M1 一行）；`GRAPH_SERVICE = 'glmHournessGraph'`（worktree `src/graph/service.ts`:12），`line` 占位里用的服务名正确；`pathKey` 在所有平台转小写（`src/guard/graph-files.ts`:44–46），与 `sameDir` 只在 win32 转小写的说明一致。
- 面板行：`applyFromCommand(invocation, configured)` 用 `locateGraph(configured, invocation.agent.session?.header?.cwd)`（worktree `panel-row.ts`:76–94）；`/graph-apply` 的 `recordInput: false`（:178），`command/run` 不带输入，第 15 项核对的是结果文本与 notice 之外的内容，设计写法与此一致。
- 探针：`runCommand` 经 `commands.find` 直接调处理函数，注释写明不带生命周期事件（`probe-llm.mjs`:97–108）；一步之中的次序是 `status`、`live`、`command`（:194–206），`line` 放在 `command` 的位置可行；探针 provider 已从 `../../dist/...` 导入模块（:28–30），`run-probe.mjs` 用 `dist/graph/store.js` 的 `loadGraph` 与 `revisions`（:38、432），`{rev:<id>}` 的读法与它相同，split 第 5 步搬家时随探针的其他导入一起改。
- 原生 shell 工具名是 `pwsh`（`run-probe.mjs`:122、268；`src/guard/rules.ts` 的 `SHELL_TOOLS`），`non-glm-design-main` 的工具名写法正确。
- 每步 notice 接缝：`installStepNotice(agent: AgentLike, what, eligible: () => boolean, build, row)`，函数体里 `agent.ctx.on('agent/pre-step', …)`（worktree `src/shared/step-notice.ts`:28–43）；guard 行与图行都以 `WeakSet<AgentLike>` 去重（`src/guard/index.ts`:154、192–194；`src/graph/index.ts`:120–123）。
- 附录 0.4 的十个被引用标题都在；第 4 轮意见 D01–D05 都在 profile 切换脚本（D01 涉及「桌面版 profile：切换前后」里 `node_modules` 的一段，M3 只用这一节的「桌面版 profile 对新行没有覆盖项」与 junction 指向主检出，不受影响）。

## 4. 未核实或错误的假设

错误：

- §3.1.1、§3.1.3：`installAgentHooks(agent)` 可以直接收 `/wish` 调用参数里的 agent。运行时成立，薄适配层的类型不成立，`LiveAgentLike` 缺 `ctx`（R4-L1）。
- §8 第 5 步：`glm-design-stage` 整个场景在第 5 步可以跑通。请求 6 的回写 notice 要第 7 步（R4-L2）。
- §9.1.3：`non-glm-design-main` 与 `glm-design-main` 同形，包括 `status` 步读 `/glm-status`。`probe-hourness` 没有 `/glm-status`（R4-L3）。
- §6.2：激活之前已开着的会话里，「两个设计工具不被滤掉」只影响主 Agent 会话。实际影响的是普通会话（R4-L4）。

未核实（设计已列入 L3 或 L4 的除外）：

- 探针 provider 在一步之中经 `commands.execute` 往会话日志追加命令事件，不会与 agent-loop 本步的提交冲突：rc.3 的 `execute` 与 `session.append` 没有这类检查，桌面版上人在 agent 运行时发命令走同一个方法，读源码没有发现障碍〔推断〕；现有探针刻意绕开生命周期（`probe-llm.mjs`:97–99 的注释），所以第一次真跑以 §9.1.3 的 `line` 场景为准。
- 各行的激活次序由模块 import 完成的先后决定（设计已标〔推断〕；设计不再依赖它）。
- agent-team 队友的会话头与 `childSessionMeta` 同形（设计已标〔推断〕）。
- 模拟人在 `agent/created` 里以 `followup` 开始的回合，在 `publish` 返回之前跑起来时与桌面版空闲会话里的回合走同一条路径（读源码一致，`glm-design-wish-idle` 在真运行时上核对）。
