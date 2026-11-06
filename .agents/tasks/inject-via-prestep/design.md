# inject-via-prestep 设计短文

节点 `inject-via-prestep`。依据 `.agents/tasks/desktop-close-2026-11-05/report.md` Q2、Q3 与「后续建议」第 1 条。代码以工作树 `.worktrees/inject-via-prestep`（分支 `inject-via-prestep`，基于 `origin/main` 31e0ee5）为准；DSH 契约以 `reference/deepseek-harness`（`22ddee37`）源码与 `reference/dsh-desktop-0.2.1-rc.3` 安装包为准。

## 0. 概述

本包的几行用 `agent.inject` 送不叫醒的提示。`inject` 是 `send(m, 'next-step', false)`，空闲的 agent 收到后消息一直排在 `inbox.nextStep`，直到下一个回合的第一步认领。桌面宿主把非空收件箱算作正在运行的任务，`Browser.close` 因此弹原生确认框；宿主关停时这些消息又被清掉（`outcome: canceled`），模型最终没读到。

改法：新增公共模块 `src/shared/step-mailbox.ts`，每行一个实例，按 agent 存待送的提示，在该 agent 的 `agent/pre-step` 里放进本步的消息，放在本步认领的消息之前（与 `inject` 的位置相同）；本步的 `user/message` 落进会话日志时（`session/event`）才从待送里删掉。提示不再进 DSH 的收件箱，模型仍在下一步之前看到同样的文字，只看到一次。叫醒的投递（`followup`、`steer`、唤醒表选出的 `inject`）不动。

技术栈不变：TypeScript strict + `exactOptionalPropertyTypes`，Node 22 strip-types，不加依赖。

## 1. 哪些提示改走步前提示（逐处核对过的调用点）

在工作树里检索 `.inject(`（不含 `ctx.inject([...])` 的服务注入）与 `agent[how](`，结果如下。

| # | 调用点 | 提示 | 来源 kind | 现在 | 改后 |
| --- | --- | --- | --- | --- | --- |
| A1 | `src/design/mode.ts:316`（`leave`，主 Agent 已移到别的会话时的 `/wish off`） | `MOVED_NOTICE` | `glm-design-wish` | `agent.inject` | 步前提示 |
| A2 | `src/design/mode.ts:329`（`leave`，`/wish off`） | `OFF_NOTICE` | `glm-design-wish` | `agent.inject` | 步前提示 |
| A3 | `src/design/mode.ts:406`（`enter`，不带话的 `/wish`） | `ENTER_NOTICE` | `glm-design-wish` | `agent.inject` | 步前提示 |
| A4 | `src/design/index.ts:254`（`onBypass`，子 agent 或别的会话想不经人同意推进目标） | `[拦下] …` | `glm-design-bypass` | `live.inject` | 步前提示 |
| A5 | `src/design/index.ts:563`（`installMainAgentRules` 的 `tell`，调用方 `src/guard/main-agent.ts:252` 的 git 快照恢复办法） | `[git 快照] …` | `glm-git-snapshot` | `live.inject` | 步前提示 |
| A6 | `src/graph/run-control.ts:207`（`/graph-run stop`） | 暂停说明 | `glm-graph-run` | `cancel(keepInbox)` 之后 `agent.inject` | 步前提示 |
| A7 | `src/loops/deliver.ts:199–203`（`toLive`，`wake` 为假时 `wayTo` 返回 `'inject'`，`deliver.ts:121–123`），经 `toHolder` 送主 Agent | 循环板提醒 | `glm-hourness-loop` | `agent.inject` | 步前提示 |

不动的：

- `src/loops/deliver.ts:228`：事件来源会话是另一个正在跑的会话（子 agent）时 `toLive(live, …, false)`。这个会话在跑，它的驱动会在下一步认领，或在回合末因 `inbox.hasPending` 再开一回合（`agent.ts:420`），收件箱不会在空闲时残留；改走步前提示反而会在它最后一步之后把结果丢掉（子 agent 随后结束）。改为在 `send` 里直接调 `live.inject`，不再经 `toLive` 的 `wake` 分支，注释写明理由。
- 唤醒表选出的 `inject`：`src/rules/wake.ts:52` 与 `src/loops/deliver.ts:122` 的 `wakeWay`，空闲且 goal 为 active 时用 `inject`，是为了不让 `followup` 作废 goal 驱动器的预约（`goal-round-driver/src/index.ts:318–323`）。驱动器紧接着会开一轮，收件箱随之清空。属于叫醒的投递，节点验收第 1 条要求不变。
- 已经走 `agent/pre-step` 的提示（规则板提醒、阶段提醒、guard 纠正、todo、工具检索公告等，`src/shared/step-notice.ts` 的使用者）不动。

`DeliverResult.how` 与运行记录的 `delivery` 字段（`src/loops/records.ts:118`）保留 `'inject'` 这个值，含义改为「不叫醒、放在下一步之前」。不新增取值，免得改运行记录的类型与指标（`src/loops/run.ts`、`metrics.ts` 不改）。

## 2. 待送提示怎么存、怎么在送达后清掉

### 2.1 模块 `src/shared/step-mailbox.ts`

```ts
export interface StepMailbox {
  /** Put a notice before the agent's next step without waking it. Never throws. */
  post(agent: LiveAgentLike, notice: UserNotice): MailboxPost
  /** Notices of the agent not yet admitted into its session (tests, health). */
  pendingCount(agent: LiveAgentLike): number
  /** Unregister every listener this mailbox installed and drop what waits. */
  dispose(): void
}
export type MailboxPost =
  | { readonly via: 'step' }
  | { readonly via: 'inbox', readonly reason: string }
  | { readonly via: 'none', readonly reason: string }
export function createStepMailbox(row: string): StepMailbox
```

- 存法：`WeakMap<LiveAgentLike, Entry[]>`，`Entry = { notice: UserNotice, offered: boolean }`，按投递先后。键是 agent 对象，不是会话 id：agent 被释放（会话关闭、宿主卸载它）时条目随之不可达，不需要额外清理。每个 agent 至多 32 条，满了丢最旧的一条，`console.warn` 一次（每个实例一次）`dsh-glm-hourness/<row>: …`。同一个 `notice.id` 再投一次不重复存。
- 懒安装：某个 agent 第一次 `post` 时，经 `agent.ctx.on` 在它的作用域上装两个监听器，`WeakSet` 记已装过的 agent。不依赖 `agent/created`（graph-panel 行没有这个监听）。agent 作用域的注册在 agent 释放时随作用域撤掉（`runtime-types.ts:202–203`），`dispose()` 另外撤掉自己装的全部。
- `agent/pre-step` 监听器（不带 `prepend`，与 `installStepNotice` 一样）：`await next()`；`decision.kind === 'reject'`、`signal.aborted`、或空决策守卫成立（`decision.messages.length === 0 && (step === 1 || messages.length > 0)`，照抄 `agent/src/model-selection.ts:162–166`）时原样返回、条目不动。否则取全部条目里 `notice.id` 不在 `decision.messages` 里的，按先后放在 `decision.messages` 最前面，标 `offered = true`，返回新决策。放在最前面，与 `inject` 的消息被 `claim` 排在本回合消息之前一致（`inbox.ts:108–113`）。
- `session/event` 监听器（同一个 agent 作用域；agent loop 自己也在 agent 作用域上听它，`agent-loop/src/agent.ts:357`，rc.3 `dsh-agent-loop/lib/index.js:976`）：`session.id === agent.session.id`、`event.type === 'user/message'`、`event.data.id` 等于某条的 `notice.id` 时删掉这一条。这就是「送达」：本步把决策里的消息逐条 `session.append('user/message', message)`（`agent.ts:456–470`），`session/event` 在 `append` 里同步发出（`session/src/index.ts:76`、899–906）。
- 恰好一次：标了 `offered` 而没落盘的条目（本步在 `pre-step` 之后、追加消息之前被取消，`agent.ts:290–300` 的 `throwIfAborted`）下一步再放一次；已落盘的在下一步之前已删掉。goal 驱动器在它自己的 `pre-step` 里拒绝本步时，会把本步里别的消息放回收件箱 `next-step`（`goal-round-driver/src/index.ts:136–145`、`restoreOtherClaimed`）；这时条目还在 `offered`，下一步它作为认领的消息出现在 `messages` 里，按 `notice.id` 去重不再放第二份，落盘后照常删掉。

### 2.2 投递的接线

- 设计行（`src/design/index.ts`）：`apply` 里建一个 `createStepMailbox('design')`，`dispose` 推进 `disposers`。`WishDeps` 加一项 `tell(agent: DesignAgentLike, notice: UserNotice): void`，`mode.ts` 三处 `agent.inject(...)` 改成 `deps.tell(agent, ...)`；`tell` 的结果是 `via: 'none'` 时 `deps.role.report(session, 'degraded', '提示没能送到这个会话：<reason>')`。`onBypass` 与 `installMainAgentRules` 的 `tell` 改用 `mailbox.post(live, …)`，后者 `via === 'none'` 时返回 `false`，沿用 `main-agent.ts:252` 已有的降级「快照已存，但没能告诉主 Agent 恢复办法」。
- graph-panel 行（`src/graph/panel-row.ts`）：`apply` 里建 `createStepMailbox('graph-panel')`，经 `runFromCommand` 的新参数（`RunServices` 加一项 `mailbox`）交给 `run-control.ts`；行卸载时 `dispose`。`stop` 先 `cancel`（主 Agent 在节点上时），再 `mailbox.post(agent, …)`，再中断子 agent，顺序不变。不论主 Agent 在不在跑都走步前提示：`cancel({kind: 'user'}, {keepInbox: true})` 之后被取消的驱动不再认领，旧做法下消息正好留在空闲 agent 的收件箱里。`via === 'none'` 时命令结果写成 `error`，文字加「暂停说明没能送到主 Agent：<reason>」。
- 循环板（`src/loops/deliver.ts`）：`createDelivery` 里建 `createStepMailbox('loops')`，它的 `dispose()` 里一起撤。`toLive` 在 `wake` 为假时调 `mailbox.post`：`via: 'step'` 与 `via: 'inbox'` 都返回 `{kind: 'delivered', how: 'inject', messageId}`；`via: 'none'` 返回 `{kind: 'failed', reason}`，走现有的 1、5、15 分钟重试（`deliver.ts:282–297`）。`withoutInitiator` 与 `sessions.flush` 的检查照旧包在外面（会话里什么也没追加时 `flush` 照常返回）。
- `src/loops/run.ts`、`records.ts`、`service.ts` 不改。

### 2.3 适配层

`src/shared/dsh-min.ts` 两处：

- `LiveAgentLike` 加可选的 `readonly ctx?: PluginContext`（rc.3 的 agent 都有作用域上下文，`runtime-types.ts:202–203`）；`DesignAgentLike` 已有必填的 `ctx`，不冲突。
- `PluginContext.on` 加一个重载 `on(event: 'session/event', listener: (session: SessionLike, event: SessionEventLike) => void): () => void`，注释写证据 `agent-loop/src/agent.ts:357`、rc.3 `dsh-agent-loop/lib/index.js:976`。

## 3. 会话之后再也不走一步时

提示留在本进程内存的待送里，不进 DSH 收件箱，桌面版的退出判定（`apps/desktop-host/src/update-tasks.ts:16–19`，rc.3 `dsh-desktop-host/lib/index.js:101`）看不到它，`Browser.close` 不再因它弹框。条目在三种情况下消失：agent 被释放（会话关闭）、行卸载（`dispose`）、进程退出。三种都不告诉模型；今天排在收件箱里的消息在会话关闭与宿主关停时同样被清掉（`agent-loop/src/index.ts:518`，`inbox.ts:97–100`、214）。

与今天不同的两点，记为接受的取舍：

- 客户端今天能看到并删掉排队的消息（report Q4 B）；待送的提示在客户端看不到。
- 运行中的 agent 在回合最后一步之后收到提示时，今天 `inject` 会让回合末的 `hasPending` 再开一回合（`agent.ts:420`），等于叫醒；改后提示等到下一个回合，不多花一次模型调用。这与「不叫醒」的本意一致。

各提示没被读到时，状态由别处带着：

| 提示 | 状态由谁带着 |
| --- | --- |
| A1–A3 | 会话投影 `hournessMainAgent` 与持有者记录；下一步的身份节与工具面按它们组装（`src/design/index.ts` 的组装监听器） |
| A4 | 设计行行健康在最后一次拒绝后 24 小时内持续写明（`bypassNote`），违规流水有记录 |
| A5 | 快照引用在 `refs/hourness/snapshots/` 下，`git for-each-ref` 可列出（ORCHESTRATION.md §6.7） |
| A6 | 节点历史里人的批注「暂停了」（`run-control.ts` 的 `record`） |
| A7 | 运行记录 `loop-done`（`delivery: 'inject'`）与循环板页面 |

## 4. 宿主重启

待送不落盘，重启后没有。今天的结果相同：宿主正常关停时每个就绪的 agent 被 `cancel({kind: 'disposed'}, {keepInbox: !ready})`，收件箱被清掉并记 `agent/inbox/spliced`、`outcome: canceled`（`agent-loop/src/index.ts:518`；`inbox.ts:214`；report Q3 的 seq 42、97）。不补持久化，理由是第 3 节表里每条提示的状态在重启后都能从别处读回；循环板的不叫醒消息若要跨重启保留，应进它自己的 `state.json` 的 `held`（`src/loops/inbox.ts:151`），那一块 M7 正在改，另开节点。

与今天不同的一点：宿主崩溃（不是正常关停）时，收件箱在会话日志里，重新载入后还在；待送随进程没了。记为接受的取舍，写进 ORCHESTRATION.md 的对应段。

## 5. 失败处理

| 操作 | 失败条件 | 可恢复 | 调用方拿到 | 记录 |
| --- | --- | --- | --- | --- |
| `post` | agent 没有 `ctx` 或 `ctx.on` 不是函数（假宿主或别的宿主版本） | 是，退回 `agent.inject`（今天的做法） | `{via: 'inbox', reason}` | 每个实例 `console.warn` 一次 `dsh-glm-hourness/<row>: notices go through the inbox: <reason>` |
| `post` | `ctx.on` 抛错（agent 已释放，作用域拒绝新注册，`runtime-types.ts:202`） | 退回 `agent.inject`；它也抛错时放弃 | `{via: 'inbox'}` 或 `{via: 'none', reason}` | 同上；`none` 由调用方报行健康 degraded（第 2.2 节） |
| `post` | 待送满 32 条 | 是，丢最旧一条 | `{via: 'step'}` | `console.warn` 一次 |
| `pre-step` 监听器 | `next()` 抛错 | 原样抛出，条目不动 | 宿主照它的规则处理 | 不另记 |
| `pre-step` 监听器 | 拒绝、取消、空决策 | 条目不动，下一步再试 | 原决策 | 不记 |
| `session/event` 监听器 | 事件形状不对（`data` 不是对象或没有 `id`） | 忽略这一个事件 | 无 | 不记 |
| 激活期 | 无（模块只在首次 `post` 时注册） | | | |

输入校验：`notice` 由 `createUserNotice` 造，必有字符串 `id` 与 `role: 'user'`；`post` 只检查 `typeof notice.id === 'string'`，不是就返回 `{via: 'none', reason: 'notice without id'}`。

不变式「不叫醒的提示不进空闲会话的收件箱」由 `step-mailbox.ts` 一处负责：包里只有它（退回路径）与 `deliver.ts` 送运行中会话的一处直接调 `agent.inject`。L2 用一条源码检查钉住这个名单（第 6 节第 1 条），新的直接调用会让测试失败。

## 6. L2 测试

新增测试辅助 `tests/step-agent.ts`：一个假 agent，`ctx.on` 支持 `agent/pre-step` 与 `session/event`；`step({messages, step, abort?})` 按 rc.3 的顺序走监听器链，`enter` 时对每条消息发 `session/event`（`{type: 'user/message', seq, time, data: message}`），`abort` 为真时在链之后、追加之前停下；`inject`、`followup`、`steer` 记进 `sent`，另有 `inbox` 数组模拟 `next-step`。只提供 rc.3 真宿主会提供的信号（`agent.ts:290–300`、456–470）。`tests/design-host.ts` 的假 agent 同样补上 `session/event`（现在对未建模的事件抛错）。

1. `tests/step-mailbox.spec.ts`（新，挂在 `package.json` 的 `test:1` 末尾，见第 9 节）：
   - 空闲 agent `post` 之后 `sent` 里没有 `inject`，`inbox` 为空；下一步的决策以这条提示开头，排在认领的消息之前；再下一步没有它。
   - 两条按先后；同一 `id` 投两次只出现一次；满 32 条丢最旧。
   - 取消的一步：提示被放进决策但没落盘，下一步再出现一次，之后不再出现。
   - 拒绝、空的第一步：不放、不删。
   - 认领的消息里已有同一 `id`（goal 驱动器放回的情形）：不放第二份，落盘后删掉。
   - 没有 `ctx` 的 agent：退回 `inject`，告警一次；`ctx.on` 抛错且 `inject` 抛错：`via: 'none'`。
   - `dispose` 之后不再放，监听器撤掉。
   - 源码检查：`src/` 下匹配 `\.inject\(\s*(?!\[)` 的只有 `src/shared/step-mailbox.ts` 与 `src/loops/deliver.ts` 各一处。
2. `tests/design-mode.spec.ts`（A1–A3）：空闲会话里 `/wish off`、主 Agent 移走后的 `/wish off`、不带话的 `/wish` 各一条：命令之后 `agent.sent` 没有 `via: 'inject'`，`agent.woken` 为空；`agent.step()` 的决策第一条是对应文字的 `glm-design-wish` 提示；第二次 `agent.step()` 没有。现有断言 `agent.sent[0]?.via === 'inject'`（约 270、341 行）改为上述断言。
3. `tests/design-graph-rules.spec.ts`（A4）：子 agent 带 `relay` 被拒之后，持有者的 `sent` 里没有 `glm-design-bypass`，持有者下一步有一条，再下一步没有；10 分钟内第二次拒绝不再投。现有 `notices[0].via === 'inject'`（约 126 行）改写。
4. `tests/design-guard.spec.ts`（A5）：`git checkout -- a.txt` 存快照之后，主 Agent 下一步有一条 `[git 快照]` 提示，再下一步没有；`sent` 里没有 `inject`（约 213 行改写）。
5. `tests/graph-run.spec.ts`（A6）：主 Agent 在节点上时 `stop` 的调用顺序是 `cancel` 后中断子 agent，没有 `inject`；主 Agent 下一步的决策第一条是 `glm-graph-run` 提示（`graphRun` 事实不变），之后不再有；只有子 agent 在节点上时同样。`liveAgent` 换成 `tests/step-agent.ts` 的假 agent。现有 `[MAIN.cancel, MAIN.inject]` 等三处断言（约 158、175、180 行）改写。
6. `tests/loops-deliver.spec.ts`（A7）：`wake: false` 送空闲的主 Agent 与运行中的主 Agent：结果 `delivered`、`how: 'inject'`，假宿主的 `woken` 里没有这次调用，主 Agent 下一步有一条 `glm-hourness-loop` 提示，再下一步没有；送运行中的另一个会话（约 396 行的情形）仍是 `inject` 调用；`via: 'none'` 时结果是 `failed` 并进入重试。约 280 行的断言改写。

## 7. L3 探针

新场景 `glm-design-wish-off-idle`（`scripts/probe/run-probe.mjs`，GLM 路由 `glm-5.3`，工作区有空的 `docs/graph`，设计行默认启用）。主会话的脚本：

1. `Read`，`other: { line: '/wish' }`：第二个根会话（空闲，不叫醒）变成主 Agent。
2. `Read`，`other: { line: '/wish off' }`：空闲会话里 `/wish off`。
3. `Read`，`other: { line: '/wish off', say: 'Reply done.' }`：第二次 `/wish off` 只回「本来就不是主 Agent」，不产生提示；`say` 叫醒第二个会话，它照 `others` 的脚本回 `done`。
4. `text: 'done'`。

`scripts/probe/probe-llm.mjs` 的 `typeLine` 在命令结束后多记一项 `inbox: { nextStep, nextTurn }`（读 `agent.inbox.nextStep.length`、`nextTurn.length`；agent 没有 `inbox` 时不记）。

检查：

- 第 1、2 步的 `other` 结果是 `success`；它们记下的会话事件类型里没有 `agent/inbox/spliced`；`inbox` 是 `{nextStep: 0, nextTurn: 0}`。这一条就是「空闲会话 `/wish off` 之后收件箱是空的」。
- 第二个会话的第一次请求里，`glm-design-wish` 提示恰好两条：先是以 `The human made this session's agent the main agent` 开头的，再是含 `left main-agent mode with /wish off` 的，都在 `Reply done.` 之前；它之后的请求（若有）里没有。
- 持有者记录为 `none`；stderr 没有 `dsh-glm-hourness/design` 的告警。

现有场景 `glm-design-main`、`non-glm-design-main` 的 `left`、`entered` 检查（`run-probe.mjs` 约 2757–2760 行）不改，应照旧通过：运行中输入的 `/wish off`，提示在下一步的请求里。

## 8. 文档（与行为同一提交）

- `docs/DESIGN.md` §6 第 3 条：加一句「不叫醒的提示一律经 `src/shared/step-mailbox.ts` 放进下一步，不调 `agent.inject`；原因是桌面宿主把非空收件箱算作运行中的任务（`FACTS.md` §3）」。§2.4a 接口对照表：`agent/pre-step` 一行的使用者加 design、graph-panel、loops（步前待送）；`session/event` 一行加「agent 作用域上也能听，步前待送用它判断提示已落盘」与证据 agent-loop:976；适配层 `LiveAgentLike.ctx` 写进对应行。
- `docs/ORCHESTRATION.md`：§2.10「主 Agent 收到什么」与「验证」两段（暂停改为 cancel 之后放进下一步）；§3.1 写 `/wish`、`/wish off` 的提示经步前送达；§6.7 git 快照一段的「`inject` 一条 notice」；§6.9 `main-agent-graph-relay` 一段的 `glm-design-bypass` 送法；§18.10 投递一段的「不叫醒的一律 `inject`」改为「不叫醒的放进主 Agent 的下一步（步前待送），送运行中的事件来源会话仍用 `inject`」，并写第 3、4 节的取舍（会话不再走步、重启、崩溃时提示丢失）。被取代的句子整句重写。
- `docs/FACTS.md` §3 加一行：rc.3 桌面宿主把任一已加载 agent 的 `inbox.nextTurn` 或 `inbox.nextStep` 非空算作活跃任务，退出要确认（`apps/desktop-host/src/update-tasks.ts:16–19`；rc.3 `dsh-desktop-host/lib/index.js:101`〔实读〕）。
- `docs/HANDOFF.md` 由合入步更新，不在本节。DEVELOPMENT.md 的 L4 关闭规程改写（report Q6）不在本节点范围。

## 9. 与分支 m7 的重叠

m7（`.worktrees/m3`，分支 `m7`，相对 main 的合并基 `7fc5da5`）在本节点涉及的文件里改了这些：

- `src/loops`：只改 `src/loops/service.ts`（把 `LoopEventRecord`、`HarnessResult` 移到 `src/shared/loop-records.ts`）。本节点在 `src/loops` 只改 `deliver.ts`，不碰 `service.ts`、`run.ts`、`records.ts`，预计没有冲突。m7 改的测试 `tests/loops-row.spec.ts`、`loops-run.spec.ts` 本节点不碰；本节点改的 `tests/loops-deliver.spec.ts` m7 不碰。
- `src/design/index.ts`：m7 改导入（约 44–47 行）、`disposers` 改用 `disposerList`（约 120 行）、身份节（约 336 行）、阶段提醒参数（约 363 行），并在 `installMainAgentRules` 的参数里 `journal` 之后加 `isWorker`、`executeOn` 两行（约 557 行）。本节点改约 254 行与 563 行（与 m7 的 557 行之间隔四行不变的行），新建 mailbox 并 `disposers.push(mailbox.dispose)`（两种 `disposers` 写法都兼容）。新导入放在 `./attach.ts` 一组之后，不挨着 m7 加的两行导入。合入 m7 时预计导入区可能要手工排一次。
- `src/shared/dsh-min.ts`：m7 改约 426、525–578、610、689、749 行；本节点改 `PluginContext`（约 350–366 行）与 `LiveAgentLike`（约 466–474 行），不重叠。
- `src/guard/main-agent.ts`、`tests/design-mode.spec.ts`：m7 改了；本节点不改 `main-agent.ts`；`design-mode.spec.ts` 两边都改，m7 改的是身份节函数化的断言（约 89–130、1022 行），本节点改 `/wish` 投递的断言（约 270、341 行），不在同一处。
- `package.json`：m7 改 `test:2` 这一行；新测试文件挂到 `test:1` 末尾，避开这一行。
- `scripts/probe/probe-llm.mjs`、`run-probe.mjs`：m7 都改了，改动量大。本节点在 `probe-llm.mjs` 只动 `typeLine`（约 253–271 行，m7 的块在 54–204 与 439–499 行一带），在 `run-probe.mjs` 加一个场景和设计检查里的几条，位置挨着现有的设计场景（约 1950–1990 行）与 `designChecks`。合入 m7 时 `run-probe.mjs` 可能要手工合并，报告里会写明。

## 10. 不做

- 不改 `rules/wake.ts` 与循环板唤醒表的 `inject`（叫醒的投递）。
- 不给待送加持久化；循环板不叫醒消息跨重启保留另开节点（第 4 节）。
- 不改 DSH、不向上游提交；report「后续建议」第 2 条（rc.3 把排队输入当作运行中任务）另行反馈。
- L4（桌面版 `Browser.close` 直接退出）由后续步骤做。
