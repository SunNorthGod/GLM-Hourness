# m2-9 调研：节点上的运行控制（从这里开始做 / 暂停 / 改了验收条件后重做）

只读调研，2026-10-28。证据以桌面版运行时包为准，路径前缀 `rc3/` 指 `reference/dsh-desktop-0.2.1-rc.3/`，行号是该文件的 1 起行号。未运行 probe、calibrate，未碰桌面版与 `~/.dsh`。

## 摘要

1. 客户端给会话发消息有两条官方路径。一是 `sessions.binding(id).session.prompt(content, mode)`，只需 inject `sessions`（Session 对象自带 Remote 引用）；二是直接调 `remote.session.prompt({requestId, sessionId, mode, content})`，需 inject `remote` + `remote.session`。宿主侧一律建 `source: {kind: 'user', rpcId}`，`mode === 'steer'` 走 `agent.steer`，否则 `agent.followup`。忙时不拒绝：`queue` 排到当前回合之后，`steer` 进当前回合的下一步。`busyEnter` 只是输入框的偏好，第三方调用方自己传 `mode`，它不参与。
2. 宿主命令处理函数拿到的 `invocation.agent` 是完整的活 Agent，可以 `followup` / `steer` / `inject` / `cancel`。官方先例：`/plan <消息>` 用 `agent.steer`，`/goal` 用 `agent.followup`，ui-plan 的「退出计划」按钮就是客户端经 `remote.commands.execute(sessionId, '/plan off', [])` 驱动宿主命令。
3. 中断主 Agent：`agent.cancel({kind: 'user'}, {keepInbox: true})`，与停止按钮、Remote `session.cancel` 完全相同；会话日志记 `turn/end {reason: {kind: 'aborted', reason: {kind: 'user'}}}`，对话显示「已停止」。
4. 中断子 agent：宿主 `subagents.interrupt(childId, {kind: 'user', parentSessionId})`，或客户端 `remote.subagents.interruptByParent(childId, parentId, 'continuable')`（子会话侧栏里停止按钮走的就是它）。`remote.session.cancel` 对子会话被所有权栅栏拒绝。两条路径都没有第一方限制，第三方可用。
5. 推荐：三个动作都做成 graph-panel 行的新宿主命令 `/graph-run <start|stop|redo> <节点 id> [rev]`，面板经已有的 `remote.commands.execute` 发出，客户端 inject 不变。一次调用里同时留下命令流水（`command/run` / `command/done`）、节点历史（actor `human`）、送给主 Agent 的消息（带机器可读的 `graphRun` 事实）与中断记录，审计链完整，和 `/graph-apply`、ui-plan 是同一模式。
6. 主要风险：子 agent 被中断后，DSH 会给主 Agent 送一条「Background subagent … was stopped before it finished.」并唤醒它；暂停前必须先给主 Agent `inject` 一条「人暂停了，不要重派」，主 Agent 仍会花一个回合回应，需 L4 看 GLM 是否照做。图工具行 `glm-hourness/graph` 默认禁用，`graph_focus` 不在，焦点要由开始消息自己带上（改 `src/graph/live.ts` 与 `src/graph/reminder.ts`）。

## 一、客户端如何给会话发消息（问题 1）

### 1.1 可用调用

| 调用 | 签名与行为 | 需要的 inject | 证据 |
| --- | --- | --- | --- |
| `sessions.binding(id)` | 借用已被保留的会话：`{sessionId, session, eventSource, ctx}`，未保留时 `undefined`，不延长寿命 | `sessions` | `rc3/dsh-api-session-controller/lib/types/client/sessions/service.js:412` |
| `sessions.retain(target, {source, signal?})` / `sessions.using(target, options, op)` | 保留一个会话代次，`ready` 解出 binding；`target` 可以是会话 id，或子会话地址 `{parentSessionId, childSessionId, mode}`；会触发共享的首次历史打开 | `sessions` | 同文件 `:188`、`:204`、`ClientSessionReference :94–138`；README「Client references」 |
| `session.prompt(content, mode, signal?, requestId?)` | `mode` 为 `'queue' \| 'steer'`。普通会话转 `remote.session.prompt`；子会话地址转 `remote.subagents.prompt`（不收 file 部件）。失败写进快照的 `promptError`，对话错误条会显示 | `sessions` | `…/client/sessions/session.js:173–233` |
| `session.beginSubmission({text, attachments, mode, onRetire})` | 只做本地回显（点击当帧显示气泡），返回 `requestId` 供 `prompt` 用；纯客户端内存 | `sessions` | `session.js:148–171` |
| `session.cancel()` | 普通会话转 `remote.session.cancel`；子会话地址转 `remote.subagents.interruptByParent` | `sessions` | `session.js:257–268` |
| `session.command(line)` | `remote.commands.execute(sessionId, line, [])` | `sessions` | `session.js:292–297` |
| `remote.session.prompt(request)` | `{requestId, sessionId, mode: 'queue' \| 'steer', content: [text \| image \| file], clientTimeZone?}` → `{accepted: true}` | `remote`、`remote.session` | `rc3/dsh-api-session-controller/lib/typert.remote-client.js:1125–1143`、`:1782–1815`；宿主 `lib/index.js:3218–3231`、`:925–964` |
| `remote.session.cancel({sessionId})` | → `{accepted: true}` | `remote`、`remote.session` | `typert.remote-client.js:36–43`、`:1458–1486`；宿主 `index.js:3253–3255`、`:1061–1067` |
| `remote.session.updateQueue({sessionId, itemId, action})` | 改、删一条待处理消息，或把一条排队消息改为 steer | `remote`、`remote.session` | `index.js` `updateQueue`（约 `:1000–1056`） |
| `remote.subagents.prompt(request)` | `{requestId, parentSessionId, childSessionId, mode: 'continuable', delivery: 'queue' \| 'steer', content, clientTimeZone?}` → `{messageId}` | `remote`、`remote.subagents` | `rc3/dsh-subagent/lib/typert.remote-client.js:132–163`；宿主 `lib/index.js:3187` |

- Session 对象由 `ClientSessions` 构造时拿到 Remote 根（`rc3/dsh-api-session-controller/lib/client.js:4248–4256` 的 inject 含 `remote.session`、`remote.subagents`，`:4265` `new ClientSessions(ctx, remotes)`），所以只 inject `sessions` 的插件就能调 `binding.session.prompt` / `cancel`。
- `session`、`subagents` 两个 Remote 命名空间由 `dsh-api-remotes` 装载（`rc3/dsh-api-remotes/lib/types/client/index.js:22–23`、`:43`）；`ui/package.json` 的 `dsh.client.inject` 已列 `@deepseek-ai/dsh-api-remotes`。按 `docs/DEVELOPMENT.md` §5.7，直接用 `ctx.remote.session` 要同时声明 `remote` 与 `remote.session`。官方客户端包也这样声明（`rc3/dsh-client-ui-chat/lib/client.js:13055–13058`，`rc3/dsh-client-ui-plan/lib/client.js:608–611`）。
- 面板所在的槽给的会话已被宿主界面保留：官方会话槽直接用 `ctx.sessions.binding(sessionId)` 并在缺失时抛错（`rc3/dsh-client-ui-plan/lib/client.js:659–662`，`rc3/dsh-client-ui-goal/lib/client.js:610–612`）。

### 1.2 忙时的投递语义

- 宿主：`commands.prompt` 在 `mode === 'steer'` 时 `agent.steer(message)`，否则 `agent.followup(message)`（`rc3/dsh-api-session-controller/lib/index.js:949–950`）；`source` 在 Remote 方法里建，固定是 `{kind: 'user', rpcId: requestId, clientTimeZone?, principal?}`（`:3223–3230`）。调用方改不了 `source.kind`。
- Agent 循环（`rc3/dsh-agent-loop/lib/index.js`）：`followup` = `send(msg, 'next-turn', true)`（`:806`），`steer` = `send(msg, 'next-step', true)`（`:809`），`inject` = `send(msg, 'next-step', false)`（`:812`）；`send` 先写收件箱再按需唤醒（`:800–805`）。收件箱每次变更都追加持久事件 `agent/inbox/spliced`（`:204`）。
- 运行中：`next-step` 在下一个步边界被认领（`claim` 先取全部 `next-step`，`:103–107`），即插进当前回合；`next-turn` 等当前回合结束后开新回合（回合结束时有待处理就继续，`:1038–1042`）。
- 空闲：两种都唤醒并开新回合；第 1 步认领全部 `next-step` 再加一条 `next-turn`（`:103–107`，回合首步目标是 `next-turn`，约 `:951`）。
- 拒绝条件只有：内容为空（`gateway/bad-request`，`index.js:3221`）；会话归子 agent 路由所有（`session/agent-busy`，`:128–143`，解析时 `:213–220`）；图片与模型不符；其余准入异常统一 `session/agent-busy "prompt rejected"`（`:961`）。不因忙而拒绝。同一 `requestId` 重试幂等（`:928`）。
- `busyEnter`：是 `ui-conversation` 设置项（`rc3/dsh-client-ui-conversation/lib/index.js:7–10`），由输入框的 `ComposerSubmissionPolicy` 持有（`lib/client.js:16029–16068`），只在输入框提交时经 `resolveSubmitMode` 选 Queue 或 Steer（`:18553`、`:19134`）。`session.prompt` 与 Remote 都不读它。

### 1.3 人在对话里看到什么

- `source.kind === 'user'` 的 `user/message` 在 Chat 里是人的气泡；若它是从 `next-step` 认领的，显示为 steering 气泡（`rc3/dsh-client-ui-chat/lib/client.js:9857–9876`）。它还会刷新会话列表的活动时间（`rc3/dsh-api-session-controller/lib/index.js:3002–3004`）。
- 走客户端路径时，会话日志里只有一条普通的人类消息，图里没有任何记录，也看不出它来自面板。

## 二、宿主命令能否给主 Agent 投递消息（问题 2）

### 2.1 能，且有官方先例

- 命令调用对象：`Object.freeze({commandId, agent, rawInput, attachments, signal})`（`rc3/dsh-commands/lib/index.js:379–385`）。`agent` 来自 Typert 的 `agent` 查找（`rc3/dsh-commands/lib/typert.remote-client.js:75–78`），由会话控制器解析为活 Agent，必要时恢复冷会话，带子 agent 所有权栅栏（`rc3/dsh-api-session-controller/lib/index.js:189–193`、`:213–220`）。
- Agent 的公开面含 `send`、`followup`、`steer`、`inject`（`rc3/dsh-goal/lib/typert.host.js:683` 的 `Agent` 类型文本）以及 `cancel`、`status`、`inbox`（`rc3/dsh-agent-loop/lib/index.js:788–821`；`rc3/dsh-agent/README.md:47`）。
- 先例：
  - `/plan <消息>`：处理函数里 `agent.steer(createUserMessage({content, source: {kind: 'user'}}))`（`rc3/dsh-plan-mode/lib/index.js:216–223`）。
  - `/goal`：`invocation.agent.followup(createUserMessage({..., source: {kind: 'user'}}))`（`rc3/dsh-command-goal/lib/index.js:99–108`）。
  - schedule：`agent.followup(message)`，`source: {kind: 'schedule'}`，随后 `sessions.flush`（`rc3/dsh-schedule/lib/index.js:1595–1598`）。
  - goal-round-driver：`agent.followup(message)`，`source.kind` 为 `goal`（`rc3/dsh-goal-round-driver/lib/index.js:164`）。
  - ui-plan 的退出按钮：客户端 `ctx.remote.commands.execute(sessionId, '/plan off', [])`（`rc3/dsh-client-ui-plan/lib/client.js:704`）。
- 消息构造：会话只校验 `id` 非空、`role === 'user'`、`source.kind` 非空字符串、`content` 是数组（`rc3/dsh-session/lib/index.js:1194–1207`），`source` 上的其他字段原样保存。本仓库 `createUserNotice(kind, summary, text, facts)`（`src/shared/dsh-min.ts:390–398`）生成的正是这个形状（带 `form: 'notice'` 与 `summary`），可以直接复用。宿主插件不必导入 `createUserMessage`。
- 命令在回合之外执行：`command/run`、`command/done` 是不被回合包裹的独立追加（`rc3/dsh-commands/lib/index.js:327–340`；README「Lifecycle events」），所以 agent 运行中照样能执行。

### 2.2 各渠道的可见性

| 渠道 | 会话日志 | 人看到 | 模型看到 |
| --- | --- | --- | --- |
| `command/run` + `command/done` | 是；`recordInput` 不为 false 时 `command/run.args` 记原始输入（`rc3/dsh-commands/lib/index.js:334–340`） | Chat 的命令流节点：命令名、args、结果文字（`rc3/dsh-client-ui-chat/lib/client.js:9490–9520`、`:9608–9650`） | 否（`rc3/dsh-commands/README.md` Model Experience） |
| `followup` / `steer`，`source.kind === 'user'` | 送达即 `agent/inbox/spliced`，认领时 `user/message` | 人的气泡或 steering 气泡 | 是 |
| `followup` / `steer`，其他 `kind`，带 `form: 'notice'` 与 `summary` | 同上 | 唤醒空闲回合时是独立卡片「收到执行请求」，点开见「这条通知触发了本轮回复。」与正文（`:7024–7064`、`:7110–7160`；中文文案 `:5764`、`:5774`）；插进运行中回合时是折叠的上下文行，标签是 `kind`，摘要是 `summary`（`:7736–7770`、`:4870–4917`） | 是 |
| `inject` | 同上，不唤醒（`rc3/dsh-agent-loop/lib/index.js:812–814`） | 下一步认领后同上 | 是 |
| `agent/pre-step` 追加的 notice（现在投影的做法） | 随该步提交 | 上下文行 | 是 |

- 排队区（QueueDock）列出 `next-turn` 里所有来源的消息（`rc3/dsh-client-ui-conversation/lib/client.js:16957–16961`）；待 steer 区只列 `kind === 'user'` 的（`rc3/dsh-client-ui-chat/lib/client.js:2815`）。
- 留痕最全的组合是：命令流水（人看得到自己点了什么）+ 一条带结构化事实的消息（模型收到什么、为什么）。前者不进模型请求，后者人能展开看全文。

## 三、中断运行中的回合（问题 3）

### 3.1 主 Agent

- 客户端：`remote.session.cancel({sessionId})` 或 `binding.session.cancel()`。宿主实现：会话必须有活 Agent，否则 `session/not-found`；子 agent 会话被拒；然后 `agent.cancel({kind: 'user'}, {keepInbox: true})`（`rc3/dsh-api-session-controller/lib/index.js:1061–1067`）。
- 宿主命令里：直接 `invocation.agent.cancel({kind: 'user'}, {keepInbox: true})`，效果同上。不带 `keepInbox` 会清空收件箱（持久的删除 splice，`rc3/dsh-agent-loop/lib/index.js:815–821`），不要用。
- 发生了什么：中断信号使回合抛出，`turn/end {reason: {kind: 'aborted', reason: {kind: 'user'}}}` 写进日志（`:1010–1030`，原因拷贝 `abortedCancelCause` 约 `:731–745`）；未完成的工具调用补写 `tool/result`（`ToolCallRecovery`，约 `:975–990`）。驱动结束时，只有中断之后来过唤醒型投递才会接着开回合，否则收件箱里的消息原地停着（`:889–899`，`:800–805`、`:854–858`）。
- 对话里：这一回合的过程标题显示「已停止」，不显示用时（`rc3/dsh-client-ui-chat/lib/client.js:6620–6632`，文案 `:5868`）；被打断的助手消息末尾也挂「已停止」（`:6326–6328`）。
- 和 goal 的关系：回合以 aborted 结束时，goal-round-driver 解除 armed 或把本轮记为取消（`rc3/dsh-goal-round-driver/lib/index.js:274–282`）；暂停 goal 本身也会取消运行中的回合（`:246`）。
- 先停再发：`cancel` 之后立刻 `followup`，`send` 发现回合已中止，把消息放进 `next-turn` 并锁存唤醒（`rc3/dsh-agent-loop/lib/index.js:800–805`、`:854–858`），中止的回合结束后马上开新回合（`:889–899`）。这是「重做」要用的顺序；反过来先发后停，消息会停在收件箱里不运行。

### 3.2 子 agent

见第四节。中断后子会话自己的回合同样记 aborted 并显示「已停止」。

## 四、停下已知 id 的子 agent（问题 4）

| 路径 | 调用 | 授权检查 | 证据 |
| --- | --- | --- | --- |
| 客户端 Remote | `remote.subagents.interruptByParent(childSessionId, parentSessionId, 'continuable')`，inject `remote` + `remote.subagents` | 只校验参数（`mode` 是必须为 `'continuable'` 的判别字面量），再按 `{kind: 'user', parentSessionId}` 调核心 `interrupt`；不是该父的子 → `subagent/unauthorized`；目标不在驻留表 → 接受且无操作 | `rc3/dsh-subagent/lib/index.js:3231–3249`、`:37–62`；`typert.remote-client.js:66–130` |
| 客户端 Session | 对子会话地址的 `session.cancel()`，内部就是上一行 | 同上 | `…/client/sessions/session.js:257–268` |
| 宿主服务 | `ctx.subagents.interrupt(childId, {kind: 'user', parentSessionId})` 或 `{kind: 'ancestor', agent}` | `user`：驻留激活的 `parent.id` 必须等于 `parentSessionId`（只限直接子）；`ancestor`：调用方必须是活的祖先，且不是目标自己 | `rc3/dsh-subagent/lib/index.js:3105–3107`、`:1258–1277` |
| 模型工具 | `interrupt_agent`，用 `{kind: 'ancestor', agent: exec.agent}` | 同上 | `rc3/dsh-tool-subagent-control/lib/types/index.js`（`interrupt_agent` 的 `execute`） |
| 不可用 | `remote.session.cancel({sessionId: childId})` | 被子 agent 所有权栅栏拒绝，`session/agent-busy`，提示改用 subagent 投递 | `rc3/dsh-api-session-controller/lib/index.js:1064`、`:128–143` |

- 本地激活被中断时执行 `handle.agent.cancel({kind}, {keepInbox: true})`，`kind` 是 `user` 或 `parent`，写进子会话的 `turn/end`（`rc3/dsh-subagent/lib/index.js:1270–1271`）。外部后端（claude-code、codex）是永久停止并释放（`:1272–1275`）。
- 模式：spawn 与 fork 后端起的本地子 agent 一律是 `continuable`（`startLocal` 的描述符，`:1405`）；目录里的模式有 `one-shot`、`continuable`、`external`、`unknown`（`rc3/dsh-subagent/lib/types/catalog.js:14–26`）。面板现在只列非 external 的直接子（`ui/src/graph/agents.ts`）。
- 服务位置：桌面版上 subagent 注册表与后端留在宿主层，只有委派工具进 preset（`rc3/dsh-web-app/cordis.patch.yml:553–562`；`rc3/dsh-base/cordis.patch.yml:360`）。第三方宿主行 inject `subagents` 在 L3 探针里成立过（`docs/ORCHESTRATION.md` §3.2），桌面版组合上未核对。
- 第三方能不能用：能。Remote 端点的访问控制只看调用方主体，所有者不受限（`rc3/dsh-api-session-controller/README.md` 访问控制一段）；`interrupt` 是服务定义里的公开方法。没有只给第一方的开关。
- 中断之后父那边发生什么：子 agent 回到空闲且收件箱空、没有自己的子时，走自然结算，释放激活，再给父送结算通知（`rc3/dsh-subagent/lib/index.js:1926–1945`、`:1969–1977`、`:2048–2058`）。通知正文第一行是「Background subagent <id> was stopped before it finished.」（`:487–492`），来源 `{kind: 'subagent-settled', form: 'notice', ...}`（`:508–539`）；父空闲时按 queue 投递并唤醒，父运行中按 steer 插入（`:2058`）。父的对话里是「子任务状态更新」卡片（`rc3/dsh-client-ui-chat/lib/client.js:7043–7046`，文案 `:5768`）。子 agent 之后仍可经 `send_message` 或 `subagents.prompt` 冷恢复续聊。

## 五、设计建议（问题 5）

### 5.1 总体决定

三个动作都做成 graph-panel 行的新命令 `/graph-run`，不做客户端直连。理由：

- 审计：一次处理里写下命令流水、节点历史（actor `human`）、送给主 Agent 的消息与中断记录；客户端直连只留下一条普通人类消息或一条与停止按钮无法区分的 `turn/end`，图里没有记录，要补就得再发一次 `/graph-apply`，两次调用不是一个原子动作。
- 一致：与 `/graph-apply`（`src/graph/panel-row.ts`）、ui-plan 退出按钮同一模式；`docs/DEVELOPMENT.md` §5.6 规定跨宿主的写走命令通道。
- 焦点与事实能写进消息的 `source`：客户端 `remote.session.prompt` 的 `source.kind` 固定是 `user`，带不了结构化事实。

命令形状：

```
/graph-run start <节点 id> <rev>
/graph-run stop <节点 id>
/graph-run redo <节点 id> <rev>
```

- 单独一个命令，不并进 `/graph-apply`：后者语义是「一次图变更」。`definitionId` 用独立的 `dsh-glm-hourness/graph-run`（`normalizeDefinition` 不查重，`rc3/dsh-commands/lib/index.js:148–173`，独立 id 方便适配器区分）。
- `recordInput` 保持默认 true：输入只有几十个字符、可读，`command/run.args` 原样记下人点了什么。
- 消息统一用 `createUserNotice('glm-graph-run', summary, text, {graphRun})` 构造，`graphRun` 至少含 `action`、`node`、`commandId`（取 `invocation.commandId`），按动作再加 `rev`、`stopped`、`acceptance`。来源用自有 kind 而不用 `user`：人在对话里看到的是来自面板的执行请求，不会冒充手打的话，也不改会话列表的「最近输入」；正文仍是 user 角色，模型照常当作指令读。
- 投递方式：主 Agent 空闲用 `followup`，运行中用 `steer`，与 DSH 自己给父送结算通知的选择相同（`rc3/dsh-subagent/lib/index.js:2058`），也和用户的 busyEnter=steer 一致。
- 面板侧：把 `ui/src/graph/apply.ts` 推广成 `runCommand(commands, sessionId, line)`，复用 `ROW_OFF` 文案与结果解析；按钮期间禁用（`useWriter` 的 busy），防止双击发两次（命令没有幂等）。
- 规则共享：把「agent 站在哪个节点」的规则（子 agent 有焦点用自己的，没有就用主 Agent 的焦点，`ui/src/graph/agents.ts` 的 `placements`）抽成 `src/graph/live.ts` 里的纯函数，面板与宿主都用它。live.ts 没有 Node 内置依赖，面板已在导入它。

### 5.2 从这里开始做（start）

面板：节点详情的操作区，task、feature、goal 节点在 approved 或 doing 且这个节点上没有在跑的 agent 时显示「从这里开始做」，发 `/graph-run start <id> <rev>`。

宿主处理顺序：

1. 解析输入；节点不存在、类型不对（question 走拍板，decision 走验证）、proposed（先批准）、done（用「重做」）时返回 error，给出正路，不写任何东西。
2. 写图：approved → `apply('human', {op: 'status', id, rev, to: 'doing', reason: '人在面板上点了「从这里开始做」'})`；已经 doing → `apply('human', {op: 'comment', id, text: '又让主 Agent 从这里开始做'})`。每次点击都在节点历史留一条。写失败（如 `stale_revision`）就返回 `refusalText`，不发消息。
3. 发消息：正文由 `projectNode()` 的结果拼成中文指令，不依赖图工具：

   ```
   [项目图] 人在面板上点了「从这里开始做」。
   现在的任务：<类型> <id>「<标题>」（<状态>）。
   为什么做（父节点在前）：<祖先链>
   怎样算完成：
   - <验收条件逐条>
   不做什么：
   - <非目标逐条>
   按验收条件推进；标完成要带证据。
   ```

   `source = {kind: 'glm-graph-run', form: 'notice', summary: '从「<标题>」开始做', graphRun: {action: 'start', node, rev: <写后的节点修订号>, commandId}}`；`agent.status === 'idle' ? agent.followup(m) : agent.steer(m)`。
4. 返回 `{kind: 'success', text: '已让主 Agent 从「<标题>」开始做'}`；运行中插入时追加「（插进了当前回合）」；`agent.inbox.nextTurn.length > 0` 时追加「队列里还有 N 条会先处理」。

焦点（验收 1 的「以该节点为焦点」）：

- `src/graph/live.ts` 的 `foldLive` 增加一支：`user/message` 事件（`data` 就是消息本身，`rc3/dsh-session/lib/index.js:1199`）的 `source.kind === 'glm-graph-run'` 且 `graphRun.action` 为 `start` 或 `redo` 时，`focus = graphRun.node`。`stateVersion` 从 2 升到 3（该文件注释要求改折叠就升版本）。这样主 Agent 一认领这条消息，面板现场与图上的徽标就落到节点上，不需要图工具。
- `src/graph/reminder.ts` 的 `projectionHistory` 把这种消息当作焦点来源，与成功的 `graph_focus` 调用同级，取最后出现的；`projectionNotice` 还要检查本步 `admitted` 里的这种消息（它这时还不在 `deriveMessages()` 里，`isGoalRound` 已是同样做法），投影就在同一步跟上。只在图工具行启用后起作用。
- 之后模型自己调 `graph_focus` 改焦点仍然生效（最后出现的胜出）。

审计链：`command/run`（args `start m2-9 <rev>`）→ 节点历史 `status approved→doing` 或批注（actor `human`）→ `agent/inbox/spliced` → `command/done`（结果文字）→ 认领时 `user/message`（`graphRun` 事实）→ 之后的回合。

### 5.3 暂停（stop）

面板：节点上有在跑的 agent 时显示「暂停」，发 `/graph-run stop <id>`。目标在宿主侧当场重算，不信任客户端看到的旧现场。

宿主处理顺序：

1. 算目标：`sessionProjections.snapshot(agent.session, ['graphLive', 'subagentCatalog']).values` 取主 Agent 的焦点与子目录（`snapshot(session, keys)`，`rc3/dsh-session-projection/lib/index.js:141`）。主 Agent：焦点等于该节点且 `agent.status === 'running'`。子 agent：目录里非 external 的条目，`agents.get(child.id)` 存在且 `status === 'running'`，它的 `graphLive` 焦点（没有就用主 Agent 的焦点）等于该节点。
2. 没有目标：返回 success「「<标题>」上现在没有在跑的 agent，没有停任何东西」，不写图、不发消息。
3. 主 Agent 是目标：先 `agent.cancel({kind: 'user'}, {keepInbox: true})`。先停再 inject，避免步边界在中止前把说明认领进当前回合。
4. `agent.inject(说明)`：`source = {kind: 'glm-graph-run', form: 'notice', summary: '暂停了「<标题>」', graphRun: {action: 'stop', node, stopped: [...], commandId}}`，正文「[项目图] 人在面板上暂停了节点 <id>「<标题>」上的工作：停下了 <主 Agent / 子 agent id 列表>。不要接着做这个节点，也不要重新派发；等人点「从这里开始做」或在对话里说继续。」inject 不唤醒；子 agent 结算通知唤醒主 Agent 时，第 1 步先认领 `next-step` 里的这条说明，再认领 `next-turn` 里的结算通知（`rc3/dsh-agent-loop/lib/index.js:103–107`），模型同时读到两条。
5. 逐个子 agent：`subagents.interrupt(childId, {kind: 'user', parentSessionId: agent.id})`。用 `user` 而不用 `ancestor`，子会话的 `turn/end` 记的就是「人停的」；`maxDepth` 默认 1，只有直接子。每个单独捕获 `UNAUTHORIZED`，写进结果。
6. 写图：`apply('human', {op: 'comment', id, text: '暂停：停下了 <列表>'})`。
7. 返回 success「已暂停「<标题>」：停下了主 Agent 和 N 个子 agent」；有失败的逐个列出。

审计链：`command/run`（args `stop m2-9`）→ 主会话 `turn/end aborted {kind: 'user'}` → 说明消息的 `agent/inbox/spliced` → 各子会话 `turn/end aborted {kind: 'user'}` → 节点历史批注（`human`）→ `command/done` → 主会话收到 `subagent-settled` 通知与说明。

### 5.4 改了验收条件后重做（redo）

面板分两步，都是人的动作：

1. 节点详情的「怎样算完成」加一个编辑器，保存发 `/graph-apply {op: 'edit', id, rev, set: {acceptance: [...]}, reason: '在面板上改了验收条件'}`。人有改验收条件的权限，引擎在历史里记 `changes.acceptance: {from, to}`（`src/graph/engine.ts:462–470`）。
2. 保存成功后，或节点最近一次验收条件修改晚于最近一次 `graph-run` 记录时，显示「按新条件重做」，发 `/graph-run redo <id> <rev>`。

宿主处理顺序：

1. 在 `node.history` 里找最近一条 `op === 'edit'` 且带 `changes.acceptance` 的记录；没有就返回 error「验收条件没改过；要接着做用「从这里开始做」」。
2. 写图：done → `status doing`（`TRANSITIONS.done` 只允许 doing，`src/graph/engine.ts:106–113`），approved → doing，原因都写「验收条件改了，按新条件重做」；已 doing → 批注同样文字。
3. 按 5.3 第 1 步算目标。
4. 主 Agent 是目标：`agent.cancel({kind: 'user'}, {keepInbox: true})` 后立刻 `agent.followup(重做消息)`，靠锁存唤醒在中止的回合结束后马上开新回合（3.1 末条）。不是目标：空闲 `followup`，运行中 `steer`。
5. 子 agent 是目标：逐个 `interrupt`（同 5.3 第 5 步）。
6. 重做消息：`graphRun: {action: 'redo', node, rev, acceptance: {from, to}, stopped, commandId}`；正文「[项目图] 人改了节点 <id>「<标题>」的验收条件，按新条件重做。原来：…。现在：…。先按新条件核对已有改动，不满足的重做。」有子 agent 被停时追加「子 agent <id> 已停下，按新条件重新派发，或用 send_message 续派。」
7. 返回 success「已让主 Agent 按新条件重做「<标题>」」。

### 5.5 inject 与类型改动

- 客户端 `ui/src/client.tsx` 的 `inject` 与 `ui/package.json` 的 `dsh.client.inject`：不变，只用已有的 `remote.commands`。
- 宿主 graph-panel 行：必需仍是 `['commands']`。可选服务照 `installLive` 的做法经 `ctx.inject` 取得，各自独立：`sessionProjections`（已有，同时保留服务引用供算目标）、`agents`、`subagents`。缺 `subagents` 或 `agents` 时 start 照常可用，stop、redo 只能停主 Agent，结果文字写明子 agent 停不了的原因；行健康报 degraded 并写原因（`provideHealth`）。
- `src/shared/dsh-min.ts`：`CommandInvocationLike` 加 `commandId`，`agent` 扩成含 `status`、`inbox.nextTurn`、`followup`、`steer`、`inject`、`cancel(cause, {keepInbox})` 的结构类型；新增 `subagents.interrupt(targetSessionId, authority)` 与 `sessionProjections.snapshot(session, keys)`、`agents.get(id)` 的最小类型。每项在 `docs/DESIGN.md` §2.4a 接口对照表补 rc.3 行号（本报告各节已给出）。

### 5.6 风险

1. 暂停子 agent 会唤醒主 Agent（第四节结算通知）。缓解靠第 4 步的 inject 说明；主 Agent 仍会跑一个回合，GLM 是否照「不要重派」做，要 L4 看。主 Agent 与子 agent 同时被停时也一样：主 Agent 被取消后，结算通知还会再唤醒它一次。
2. 取消保留收件箱：已排队的消息原地停着，下一次唤醒按先进先出处理，所以 start、redo 的消息可能排在人早先排队的消息后面。结果文字报出队列长度（5.2 第 4 步）。
3. 运行中 start 用 steer 会把主 Agent 当前回合转向新节点；结果文字写明「插进了当前回合」。
4. 主 Agent 等审批或等人回答时：cancel 会连同等待一起中止；steer 要等审批落定后的下一步才被认领。
5. graph-panel 行现在默认启用，且文档写的是它「不注册任何模型可见的东西」（`src/graph/panel-row.ts` 文件头，`docs/ORCHESTRATION.md` §2.10）。`/graph-run` 会向模型送消息，是行为改动：按 AGENTS.md 第 3 条，装到主 profile 前要在临时 profile 的 headless 沙盒验证，扩展探针场景 `glm-graph-panel`；文档同批改。
6. `graphLive` 升 `stateVersion` 后，旧缓存状态作废、按日志重算；冷的子会话在重算前没有现场，面板已有「这次启动之前跑的」降级，L3 核对一次即可。
7. 外部后端的子 agent（`mode: 'external'`）不在面板里，也不在暂停目标里；它们被中断就永久停止，不应由这个按钮触发。
8. goal 处于 active 时，暂停主 Agent 会让驱动器解除 armed（3.1），恢复要人发 `/goal resume`。本包还没接 goal，结果文字暂不处理，接 goal 时再定。
9. 节点的修订号检查只防同一节点的并发写；暂停按当场的投影算目标，算完到中断之间子 agent 换节点的窗口是毫秒级，接受。

### 5.7 验证

- L2（`npm run build`、`npm run preflight`、`npm test`）：
  - `tests/graph-panel.spec.ts`：假 Agent 记录 `followup`、`steer`、`inject`、`cancel` 的调用与顺序，状态与收件箱按 rc.3 行为建模（`rc3/dsh-agent-loop/lib/index.js:800–821`）；假 `subagents.interrupt` 对非直接子抛 `UNAUTHORIZED`（`rc3/dsh-subagent/lib/index.js:1258–1277`）。覆盖：start 的空闲 followup、运行中 steer、各种拒绝路径与正路、节点历史；stop 的目标计算、先停后 inject、无目标不写；redo 的验收差异、done→doing、先停后 followup；缺服务时的降级与行健康。
  - `tests/graph-live.spec.ts`：开始与重做消息移动焦点，暂停消息不移动，其他来源不影响；`stateVersion` 3。
  - `tests/graph-reminder.spec.ts`：开始消息设定焦点（历史里与本步 `admitted` 里两种）；之后 `graph_focus` 覆盖它。
- L3（以后跑 `npm run probe`，本次未跑）：真运行时上空闲 start 开出新回合且 `user/message.source.kind === 'glm-graph-run'`；运行中 start 被下一步认领；stop 后主会话 `turn/end` 为 `aborted/user`；派一个子 agent 再 stop，子会话 `turn/end` 为 `aborted/user`，父会话收到 `subagent-settled` 与说明且在同一步；redo 的先停后发在中止回合之后立刻开新回合。
- L4（桌面版，需要真机）：
  - Chat 的呈现：空闲 start 是「收到执行请求」卡片，展开见正文；运行中是上下文行；命令流节点显示 `/graph-run start …` 与结果文字；暂停的回合显示「已停止」，子会话侧栏同样。
  - GLM 是否照开始消息干活、照暂停说明不重派。
  - 桌面版组合上第三方宿主行能否取到 `subagents`、`agents`（服务在宿主层，探针只在平铺组合上验证过）。
  - 面板按钮随现场出现与消失，徽标在认领开始消息后落到节点上。
  - 启用后桌面版无新错误（AGENTS.md 第 5 条）。

### 5.8 同批要改的文档

- `docs/ORCHESTRATION.md` §2.10「DSH 原生面板」写路径加 `/graph-run`，并改掉「行不注册任何模型可见的东西」的说法；§2.5「焦点从哪里来」加开始消息；§2.10「实时现场」加焦点来源。
- `docs/DESIGN.md` §2.4a 接口对照表补本报告用到的 rc.3 成员。
- 节点 `m2-9` 的验收条件只有前两条，缺「改了验收条件后重做」；要人批准后补上（人的字段，LLM 只能带原话转述）。

## 六、未核实

- 本报告全部来自读 rc.3 包代码与 README，没有运行任何东西；第五节的行为都标为推断，待 L2、L3、L4 核对。
- GLM 适配器对带 `form: 'notice'` 的 user 消息是否原样送出：形状与已有的检索公告、高峰提醒相同，但没有逐行核对 `src/glm-llm` 的转换。
- 面板槽给的会话是否总是已被保留：只从官方会话槽的做法推断；本设计走命令通道，不依赖它。
- `reference/deepseek-harness` 主干没有查：按 `docs/DEVELOPMENT.md` 的契约优先级，运行时包优先，主干接口可能不同。
