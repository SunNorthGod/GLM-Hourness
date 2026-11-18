# clock-fire：时间触发的 script/check 条目的点火路径

分支 `clock-fire`（worktree `.worktrees/clock-fire`，起点 main `fcffef5d`）。
权威：`.agents/tasks/schedules/design.md` 0.6 §6.2（表：谁来计时）、§6.5–§6.6（执行）、§6.8（漏跑与重启）、§6.10（记录）、§9.1（存储）；`docs/ORCHESTRATION.md` §18（§18.9 的 script/check 行）；`.agents/tasks/loops-runner/impl-plan.md`「Sequenced-later」第 3 条（§52 的原型：当时 premise 是人的 script/check 条目只能经提议通道加、而提议通道还没建）。

## 阶段 1：读（写码之前）

### 谁点火谁（实测代码，2026-11-18，main fcffef5d）

| 条目形状 | 计时方 | 到点时 | 证据 |
| --- | --- | --- | --- |
| `tell-main` + once/every/daily/weekly/cron | `dsh-schedule`，循环行建 DSH 任务并绑定 | DSH 投 user 消息进主 Agent 会话并叫醒 | `src/loops/bind.ts` 的 `timeEntries()`：`action.kind === 'tell-main' && when.kind !== 'event' && when.kind !== 'command'`；`operate.morning/weekly/patrol`（`src/operate/entries.ts`，三项 daily/weekly tell-main）走的就是这条，所以它们到点真响 |
| script / check / harness + once/every/daily/weekly | **谁也不计——这就是缺口** | 永不到点 | `timeEntries()` 只收 tell-main；`src/loops/run.ts` 的执行路（`execute`/`runWorkEntry`）只由收件箱的事件批（`inbox.startDue` → `deps.start(batch)`）触发；`RuntimeState` 没有任何 per-entry 的 nextDue |
| `self` + 任何触发 | 交来它的那一行自己 | 不归循环板 | run.ts 的 `self` 分支 `delegated`；`loops.peak-start` 的运行由 `recordPeakStart` 记 |
| script/check + event | 循环行的收件箱 | 事件去抖/限次后经规则板 → 共用执行器 | `src/loops/script.ts`（`runScript`/`runCommand`）、`run.ts` 的 `runWorkEntry` |

desktop-l4-new 的 finding 1 与此吻合：S5 提议通道（4b40e9ea）造出了 `once`+script 的人条目，`bind.ts` 不绑它（只有 tell-main 入 DSH），收件箱等不来事件（`once` 不是事件），于是 45 分钟无 loop-fired、无 DSH binding，而 `view.json` 照画（§18.7 的 `next` 只对 once/daily/weekly 且状态 ok 的条目按 `nextOccurrence` 算——钟不跑的条目也画「下次」，就是「把死条目画成活的」）。

### 设计的裁定（design 0.6 §6.2 的表，逐字）

- 「告诉主 Agent（tell-main），五种时间都行 → `dsh-schedule`」；「跑脚本（script）与 harness 动作，一次、每隔、每天、每周 → 循环行自己的钟（`src/loops/clock.ts`，用 `src/loops/trigger.ts` 算下一次）→ 循环行执行；按 `report` 或 harness 的结果决定要不要告诉主 Agent（§6.4–§6.6）」。
- 取舍的三案对比里采用的第 3 案：「告诉主 Agent 的走 `dsh-schedule`，其余的用自己的钟」——**不**给 script/check 建 DSH schedule binding。这就是本 lane 的方向裁定：点火走循环行自己的钟，不走 DSH 绑定。
- check 条目按 §6.6 也经同一执行器（`runCommand`，check 队）；§6.2 表写「script 与 harness」是 0.4 的措辞，0.6 §6.6 已把人加的 check 并进「跑」的一路；到点的 check 无事件可并（`to: 'event-session'` 只配事件触发，到点条目没有会话——§18.3 校验已钉），files 填空集。
- cron 触发 DSH 算（`validateWhen`：cron 只配 tell-main），script/check/harness 的时间触发只有 once/every/daily/weekly，`nextOccurrence` 恰好支持这四种。

### 已就位的接缝（执行器与记录早就等着钟）

- `src/loops/script.ts` 的 `HookEnvelope` 已有 `event: 'time'` 约定与 `occurrenceAt?: string`（「这一次本该在什么时候」）。
- `records.ts` 的 `FiredRecord.trigger` 已有 `occurrenceAt?`；`metrics/kinds/loops.ts` 的 `loop-fired` 表已收 `trigger.occurrenceAt`（id 形状，ISO 时刻过 `METRICS_ID_PATTERN`）。
- `run.ts` 的执行体（`execute`）按动作分发，与触发来源无关：钟只要能造出批并调它，script/check/harness 三路全通。规则板前置（`askRules`）、deferred 重判（`rerunDeferred`）、采纳第二道闩（`adopted`）、`loop-fired`/`loop-done`、结局映射与 `report`/`to` 交付全部复用。

### §6.8 的漏跑口径（补跑只一次）

- 「循环板自己的钟管的条目在停机时到了点 → 起来时 `nextDue < now` → 只补一次，记 `late`；之后从现在起算下一次。」
- 判读：`nextDue` 存 `state.json`（per-entry `{at, digest}`；digest 是 `when` 的摘要，触发被改过时旧 due 作废、从现在重新起算——条目被改的「下一次」不该继承旧钟的锚）。`late` 取「due 早于本进程开始跑这个项目的时刻」：进程内臂上、当拍到的 due 不算 late；停机/项目静默 10 拍被放手后再来的（`index.ts` 每项目运行时重建，`startedAt` 换新）算 late，补一次。
- 判读：钟第一次见到一个条目时从「现在」起算（§6.8 的「之后从现在起算下一次」）。没有 remembered due 就不做补跑——钟没见过它的钟点，就不假装见过。S5 之前手工造进仓库、到点早已经过去的 `once` 条目不会被追溯点火；这类条目照 §9.3 的采纳门槛本来也要先有人同意。

### §6.7 的口径

- 到点类不去抖（设计逐字）；限次/攒事件是收件箱对事件到达的语义，钟不搬。同一项不重叠由两样保证：拍的执行链串行（`beatChain`）、钟的 fire 不等下一次（每次至多一个在飞的钟批，per-entry 在飞集合挡住重复点火）。
- 超时（unfinished）的事件退回只对事件批有意义；到点批没有事件，退回改为「到下一个时间点照常再跑」（§6.6 逐字），钟已在点火前把 due 重臂，`inbox.retry` 对钟批不调。

### 实施批（一个提交）

1. `src/loops/clock.ts`（新）：`clockEntries()`（四种时间触发 × script/check/harness）、`whenDigest()`、`armAndPick()`（对 `state.due` 就地臂钟/重臂/摘除，返回这一拍该点的火）。
2. `inbox.ts`：`RuntimeState.due`（+emptyState/readState 默认）；`RunBatch.time?` 与 `DeferredRun.time?`（occurrenceAt 随批走，规则板排队的重判保形）。
3. `run.ts`：`execute` 接受钟批（信封 `event:'time'`、无 id/key、带 occurrenceAt；fired 记 `trigger:{kind,occurrenceAt}`；超时不退回）；一拍里 `clockBeat()`（在 `waitingOnHuman` 之后、对账之前）；`runWorkEntry` 钟批超时不 retry。
4. `records.ts`：`firedRecord` 入参加 `occurrenceAt?`。
5. view：`ViewRuntime.next`（due 表）；`boards.ts` 带数；`view.ts` 的 `timing()` 对钟管条目优先用 due（every 也从钟表给下次——锚就是循环行的钟，不再借 DSH 的话），tell-main 照旧。
6. 测试：`tests/loops-clock.spec.ts`（真实子进程：once 到点点火+信封钉住+记录成对+last 推进；停机补跑一次 late；daily/every 重臂；无时间触发不受影响；tell-main 不由钟点；撤回同意（unadopted/external）不点；script 改过 → refused；超时 → unfinished 且不进待跑；规则板排队 → deferred 重判保 occurrenceAt）；`tests/loops-panel-model.spec.ts` 补 due 表的「下次」两例。
7. 文档同提交：ORCHESTRATION §18 头部（「还没有」删钟句）、§18.9（钟的段）、§18.7（next 的口径改）、HANDOFF loops 行。

### 门禁口径

每批 `npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`（日志 `MAIN 检出 .llm/logs/clk-*.log`，GIT_CONFIG_* 不设），棘轮 eslint 69 / knip 18 / jscpd 1 不升；探针全量 620/620。合并前再全量。

## 阶段 2：实现（worktree `.worktrees/clock-fire`，分支 `clock-fire`）

按阶段 1 的读落码：

- `src/loops/clock.ts`（新）：`clockEntries`（四种时间触发 × script/check/harness）、`whenDigest`（`when` 规范化 JSON 的 SHA-256 前 12 位）、`armAndPick`（就地臂钟/重臂/摘除，返回到点的火 `ClockFire`）、`rearm`（从现在重臂下一次，once 跑过即摘）。
- `src/loops/inbox.ts`：`RuntimeState.due: Record<id, ArmedDue>`（emptyState/readState 补默认）；`RunBatch.time?` 与 `DeferredRun.time?`（occurrenceAt 随批走，规则板排队的重判保形）。
- `src/loops/records.ts`：`firedRecord` 新参 `occurrenceAt?`（trigger 只在不带 event 时带它——`{kind, occurrenceAt}`，metrics 的 `loop-fired` 表本就收 `trigger.occurrenceAt`）。
- `src/loops/run.ts`：`envelopeOf` 钟批给 `event: 'time'`、无 id/key、带 `occurrenceAt`、无 merged；`execute` 的 fired 对钟批记 occurrenceAt；`deferRun` 带 time、`rerunDeferred` 还原；`runWorkEntry` 超时只对事件批 `inbox.retry`（钟批没有事件，下一次是钟的下一次）；新 `clockBeat()`（`armAndPick` → 逐火：`clockInFlight` 挡同项重复点火 → `rearm` → `void execute`，group `clock:<entryId>`，stand-in record 只喂类型），接在 `waitingOnHuman` 之后、对账之前。
- 视图：`ViewRuntime.next?`（due 表），`boards.ts` 的 `runtimeOf` 带数；`view.ts` 的 `timing()` 对钟管条目（plugin 的 harness、人的 script/check）优先读 due——`every` 也写「下次」（锚就是循环行的钟），没臂上的回落 `nextOccurrence`（once 已过则无）；tell-main 照旧。
- 测试：`tests/loops-clock.spec.ts`（9 例）＋ `tests/loops-panel-model.spec.ts` 补「下次读 due」两例。

### 测试里钉住的判读

- 补跑只一次的口径：`late` = due 早于本进程 `startedAt`；没有 remembered due 不补（钟没见过的钟点不装见过）。
- 同项不重叠：`clockInFlight` 在飞挡住，due 留着下一拍再点（拍链本就串行）。
- 撤回同意走的是存储判定：条目文件在循环板之外被改 → status `outside`（§9.3）→ `entries()` 不放行 → `armAndPick` 摘 due、不点火；采纳的第二道闩照旧在 `execute` 里。
- 超时的钟批 `unfinished`，`state.pending` 无新组。

### 门禁（本树）

- build exit 0；preflight exit 0；`npm test` 全绿（见下）；loops 系 spec 单跑全绿（19 个文件，含新 loops-clock 9/9）。
- 棘轮与本批数：见阶段 3。

## 阶段 3：门禁与落地

- build exit 0；preflight OK（2 包 23 行）；`npm test` exit 0（worktree 需自装依赖 `pnpm install --frozen-lockfile`，且 `.agents/tasks/m5/lessons-seed.json` 是不入库的夹具，从主检出复制一份才跑得动 test:3——已在 worktree 补，不入 git）。
- 棘轮持平：eslint 69（suppressed）/ knip 18（baseline）/ jscpd 1。首跑 jscpd 曾报 6 个新克隆（loops-clock 的 runner 假宿主与 loops-run 重复）——把假宿主 `loopWorldOf`、`seedRule` 抽进 `tests/loops-helpers.ts`（loops-run 以 `baseEvents: [HANDBACK]` 包一层 `worldOf`），两份 spec 共用；`tests/loops-run.spec.ts` 相应删掉本地 World/WorldOptions/worldOf/seedRule。
- probe：**620/620 passed**，exit 0，日志 `MAIN 检出 .llm/logs/clk-probe.log`（跑在 `.llm/probe-lock-2`，1 号槽被并行的 runner 占着——锁机制按 §3 自己等位）。`npm test` 日志 `.llm/logs/clk-test.log`。
- 提交：一个提交（代码 + 测试接线 + 文档 + 本记录）；origin/main 合并前仍在 fcffef5d，无需 rebase。
- 已知边界（留给桌面 L4）：钟管条目的 `once` 在钟第一次见到它之前已过的，不补跑（无 remembered due，§6.8 只认记下的 nextDue）；`view.json` 的「下次」对钟管条目在第一次拍之前按 `nextOccurrence` 兜底，桌面版待核对。
