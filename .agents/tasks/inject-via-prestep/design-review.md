# inject-via-prestep 设计短文评审

评审对象：`.agents/tasks/inject-via-prestep/design.md`。代码以工作树 `.worktrees/inject-via-prestep`（HEAD `31e0ee57`，与短文所写基点一致）为准；契约以 `reference/deepseek-harness`（`22ddee37`）源码与 `reference/dsh-desktop-0.2.1-rc.3` 安装包为准。

阻塞口径（本步规定）：只有三类发现阻塞：未满足的验收项、不可逆丢失（提示可能丢失或重复而短文没写明并接受）、缺失败预案。其余一律记为 NIT，不阻塞。

## 结论

APPROVED。没有阻塞发现。7 处调用点与短文引用的契约字段逐一核对过，见下文。送达判定（`session/event` 的 `user/message` 落盘才删）、取消与拒绝后的重放、goal 驱动器 `restoreOtherClaimed` 放回时按 `notice.id` 去重，这三条合起来能保证"至多一次落盘、未落盘就下一步重放"。会话不再走步、行卸载、宿主正常关停与崩溃四种丢失，第 3、4 节都写明并接受了。每个操作都有失败预案（第 5 节）。

## 发现

1. NIT：`post` 首次安装两个监听器时，部分安装后回退的规则没写。第 2.1 节先装 `agent/pre-step` 再装 `session/event`，第 5 节说 `ctx.on` 抛错就退回 `agent.inject`，但没说已装上的那个监听器怎么处理、条目存不存。两次 `ctx.on` 是同步连调，中间作用域被释放的可能性几乎为零；可一旦条目已存又走了 `inject`，就会送两次。修法：写死顺序「先装两个监听器；任一抛错就撤掉已装的那个、不存条目、走 `inject`；两个都装上才存条目并返回 `{via: 'step'}`」。L2 加一例：第二次 `ctx.on` 抛错时 `pendingCount` 是 0，`sent` 里恰好一条 `inject`。

2. NIT：`dispose()` 要撤掉"自己装的全部"，所以 mailbox 得对每个投过的 agent 强引用一份撤销函数。agent 被释放后这些函数（连同 agent 作用域）一直挂到行卸载，与第 2.1 节"agent 释放时条目随之不可达"相矛盾，长时间运行的宿主里会慢慢积累。修法：撤销函数记在 `Map<string /* agent.id */, () => void>`，在同一 agent 作用域上监听 `session/disposed`（`SessionEventHost` 已有这个重载，`dsh-min.ts` 约 192 行）或在 `session/event` 监听器里发现会话已不是 `agent.session` 时，调用撤销并删掉这一项；`dispose()` 只撤还在表里的。

3. NIT：`pre-step` 监听器自己的代码出错（例如 `decision.messages` 不是数组，别的宿主版本或外层监听器返回了异常形状）不在第 5 节表里。它会抛进 waterfall，让这一步按 error 结束。修法：`next()` 之后的拼装放进 `try`，出错就原样返回 `decision`、条目不动，并 `console.warn` 一次（每个实例一次）`dsh-glm-hourness/<row>: step notices skipped: <reason>`；表里加这一行。

4. NIT：`src/loops/deliver.ts` 送运行中事件来源会话的那一处（约 228 行，`send` 里 `toLive(live, loopNotice(parts), false)`），短文写的是"改为在 `send` 里直接调 `live.inject`"，没说还包不包 `withoutInitiator` 与 `try/catch`。只写一句 `live.inject(notice)` 的话，宿主的发起人判定会变，抛错也绕过 `toLive` 的 `failed` 结果（虽然最后会被 `run` 的 `catch` 接住）。修法：保留现有形状，例如在 `toLive` 里加 `if (!wake && agent !== holderAgent)` 的分支不合适的话，就在 `send` 里写

   ```ts
   try { withoutInitiator(deps.ctx, () => { live.inject(notice) }) }
   catch (error) { return { kind: 'failed', reason: message(error) } }
   return { kind: 'delivered', how: 'inject', messageId: notice.id }
   ```

   并在注释写明为什么这里不走步前待送（短文第 1 节的理由）。

5. NIT：goal 驱动器在 `signal.aborted` 或预约失效时调 `restoreOtherClaimed`（`goal-round-driver/src/index.ts:135–143`，调用点约 399、414、440 行），会把本步决策里的其他消息 `prepend` 回 `next-step`，这里面也包括我们放进去的提示。短文第 2.1 节讲了去重，没提这时提示确实又进了 DSH 收件箱：如果随后 agent 停在空闲（例如人按了停止，`keepInbox: true`），收件箱非空，桌面退出确认框会再出现。去重保证不会送两次，不算丢失，所以不阻塞；但"收件箱保持为空"这个不变式在这条路径上不成立。修法：第 3 节取舍表加一行「goal 驱动器丢弃本轮并放回认领消息时，提示随之进收件箱，由下一步认领；空闲时残留与今天相同」，ORCHESTRATION.md §18.10 同写。

6. NIT：第 8 节的 DESIGN.md 改动清单漏了两处现有描述。`docs/DESIGN.md` 约 240 行（合成 notice 一行）写着运行控制的消息"经 `followup` / `inject` 进收件箱，来源 `glm-graph-run`"，改后暂停说明不再进收件箱；约 235 行（活 agent 一行）的"使用者"也要加上 step-mailbox 对 `ctx` 与 `inject` 退回路径的依赖。修法：把这两行列进第 8 节，与 §6 第 3 条、§2.4a 的 `agent/pre-step`、`session/event` 两行同批改。

7. NIT：第 6 节第 6 条（`tests/loops-deliver.spec.ts`）要求"主 Agent 下一步有一条 `glm-hourness-loop` 提示"，但只在第 5 条（graph-run）写了换用 `tests/step-agent.ts` 的假 agent。`loops-deliver` 现有的假宿主（`it.live`）没有 `ctx.on`，照现状会走 `via: 'inbox'` 的退回路径，测试测到的就不是新路径。修法：第 6 条写明 `it.live.add` 造的 agent 改用（或包一层）`tests/step-agent.ts`，并断言 `pendingCount` 先为 1、`step()` 之后为 0。

8. NIT：第 9 节对 m7 改动的列举我只核对到一部分。`git diff` 相对合并基只看到 m7 改了 `package.json`、`src/design/index.ts`、`src/graph/execute-stage.ts`、`src/loops/service.ts`、`src/shared/dsh-min.ts` 五个文件；短文还写 m7 改了 `src/guard/main-agent.ts`、`tests/design-mode.spec.ts`、`tests/loops-row.spec.ts`、`tests/loops-run.spec.ts`、`scripts/probe/probe-llm.mjs`、`run-probe.mjs`，这些可能在 `.worktrees/m3` 未提交的改动或我没查到的提交里。不影响本节点的设计。修法：实现完成时在 report 里按 `git -C .worktrees/m3 diff --stat $(git merge-base main m7)` 加工作区未提交改动重算一次重叠清单，以实算为准。

## 已核实的假设

- 调用点（工作树）：`src/design/mode.ts:316`（`MOVED_NOTICE`）、`:329`（`OFF_NOTICE`）、`:406`（不带话的 `/wish` 的 `ENTER_NOTICE`）；`src/design/index.ts:254`（`onBypass`，`glm-design-bypass`）、`:563`（`installMainAgentRules` 的 `tell`），调用方 `src/guard/main-agent.ts:252` 的降级文字存在；`src/graph/run-control.ts:206–207`（`cancel({kind:'user'},{keepInbox:true})` 之后 `agent.inject`）；`src/loops/deliver.ts:121–123`（`wayTo` 在 `wake` 为假时返回 `'inject'`）、约 202 行（`agent[how](notice)` 包在 `withoutInitiator` 里）、`send` 里运行中事件来源会话的 `toLive(live, …, false)`。`src/` 下没有别的非服务注入的 `.inject(` 调用，也没有跨行写法。
- `src/rules/wake.ts:47–53`：运行中 `steer`，空闲且 goal `active` 时 `inject`，否则 `followup`；属于叫醒的投递，短文不动它，与验收第 1 条一致。
- `inject` 是 `send(m, 'next-step', false)`（`agent-loop/src/agent.ts` 约 172–182 行）；`claim` 先取 `next-step` 全部再取一条 `next-turn`（`inbox.ts` `claim`），所以"放在决策最前面"与 `inject` 的位置相同。
- `preStep` 的 waterfall 负载是 `{messages: claimed, turn, step, signal, modelSelection}`，之后 `signal.throwIfAborted()`（agent.ts 约 288–300 行）；`step()` 只在 `firstAttempt` 时把决策消息逐条 `session.append('user/message', message)`（约 456–470 行），`runtime-context` 来源另行处理，本包的来源 kind 不受影响。
- 回合末 `if (!this.inbox.hasPending) return false`（agent.ts:420）；`turnEnds` 已定且 `next-step` 为空时退出循环，所以空决策守卫之下，改后不会多花一次模型调用（短文第 3 节第二条取舍成立）。
- 空决策守卫 `decision.messages.length === 0 && (step === 1 || messages.length > 0)` 与 `agent/src/model-selection.ts:161–164` 一致。
- agent 作用域能听 `session/event`：agent loop 自己就这么做（agent.ts:357，`if (session === this.session)`）；rc.3 `dsh-agent-loop/lib/index.js` 里有同一句（行号未逐行核对）。`session/event` 在 `append` 里同步分发（`session/src/index.ts` 约 899–906 行），`event.data` 就是消息本身，goal 驱动器同样用 `event.data.id` 判断落盘。
- `Agent.ctx` 是 agent 作用域上下文，释放时撤销、之后拒绝注册（`agent/src/runtime-types.ts:202–203`）。
- goal 驱动器 `restoreOtherClaimed`（`goal-round-driver/src/index.ts:135–143`）按 id 跳过已在收件箱的，`prepend` 回 `next-step`；短文的去重覆盖它。`agent/inbox/inserted` 监听器把 `next-turn` 里的竞争输入记为 `competingQueued`（约 315–322 行），这是唤醒表在 goal active 时用 `inject` 的理由。
- 宿主关停：`machine.cancel({kind:'disposed'}, {keepInbox: !ready})`（`agent-loop/src/index.ts` 约 518 行）；`clear` 走 `splice`，`discardRemoved` 时 `outcome: 'canceled'`（`inbox.ts` `mutate`）。今天排着的提示在正常关停时同样被丢，第 4 节的比较成立。
- 桌面退出判定 `hasDesktopActiveTasks`：`status === 'running' || inbox.nextTurn.length > 0 || inbox.nextStep.length > 0`（`apps/desktop-host/src/update-tasks.ts:16–19`；rc.3 `dsh-desktop-host/lib/index.js` 里同文）。
- `sessions.flush` 返回"至少一个持久化监听器参与"（`session/src/index.ts:1342` 起），会话里没追加东西也照常返回，第 2.2 节对循环板的说法成立。
- 适配层：`PluginContext`（`dsh-min.ts` 约 350 行）现有 `agent/pre-step` 重载、没有 `session/event` 重载；`LiveAgentLike`（约 466 行）没有 `ctx`；`DesignAgentLike` 有必填 `ctx: PluginContext`（约 544 行），加可选 `ctx` 不冲突；`SessionEventLike` 有 `type`、`seq`、`time`、`data?`。`createUserNotice` 必有随机 `id` 与 `role: 'user'`（约 818 行）。
- `RoleDeps.report(session, state, reason)` 存在，第 2.2 节的降级上报可行；`src/loops/records.ts:118` 的 `delivery` 取值含 `'inject'`；`src/loops/inbox.ts` 约 150 行有 `held`。
- 测试与探针的引用行：`design-mode.spec.ts` 270、341；`design-graph-rules.spec.ts` 126；`design-guard.spec.ts` 213；`graph-run.spec.ts` 158、175、180；`loops-deliver.spec.ts` 280、396；`tests/design-host.ts` 的假 agent 对 `agent/pre-step`、`system-prompt/assemble` 以外的事件抛错（约 305 行）；`probe-llm.mjs` `typeLine` 在 253–271 行；`run-probe.mjs` 的 `left`、`entered` 在 2757–2760 行，设计场景在 1950–1990 行，`other: { line, say }` 已有先例（约 2139 行）且 `typeFor` 支持 `say`。
- 第 7 节 L3 探针的预期：第二个根会话由 `agents.create` 新建、空闲；`/wish` 与 `/wish off` 只投进 mailbox，`say` 的 `followup` 开第一回合，`claim` 出 `say` 消息后监听器把两条提示放在它前面；第二次 `/wish off` 在记录已删、`wasMain` 为假时直接返回"本来就不是主 Agent"，不投提示（`mode.ts:319–327`）。与 brief 的 L3 要求一致。

## 未核实或有出入的假设

- 第 9 节 m7 改动清单只核到五个文件，其余条目没核实（见发现 8）。
- rc.3 `dsh-agent-loop/lib/index.js:976` 与 `dsh-desktop-host/lib/index.js:101` 的确切行号没逐行核对，只确认了文本存在。
- `inbox.ts:97–100`、`214`，`deliver.ts:282–297` 的行号是近似，内容已核对。
- agent 作用域 waterfall 与宿主级 `agent/pre-step` 监听器（goal 驱动器）的内外顺序没核实；短文的去重与"拒绝时条目不动"两种顺序下都成立，不影响结论。
