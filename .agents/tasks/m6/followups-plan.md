# M6 跟进三项实现计划：m6-rules-text（S1）、m6-rules-probe（S3）、m6-script-gate（S2）

依据：`.agents/tasks/m6/design.md`（0.7，行为同 0.6 放行稿）§1.4 第 13、15、16、17、22、24、26 条，§7.2，§15.1，§16 的 S1–S3，§17；一页稿 `onepage-0.6-released.md` 第 4 条；项目图节点 `m6-rules-text`、`m6-script-gate`、`m6-rules-probe` 的正文与验收；`docs/HANDOFF.md` §8 M6 一行。`m6-metrics-events` 不在本次范围。

## 0. 基线

- 工作树 `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\m6-followups`，分支 `m6-followups`。计划开始时基点是 `7f6d743`；按编排方 2026-11-04 的通知已快进合并 `origin/main` 到 `1a6eb15`（含 loops-runner 合并 `a9adca8`、user-graph、metrics `31c9e0f`）。
- 在 `1a6eb15` 上已核对：`npm run build` 退出码 0；`npm run -s preflight` 退出码 0；`tests/rules-check.spec.ts` 41/41、`tests/rules-gate.spec.ts` 47/47、`tests/rules-row.spec.ts` 57/57、`tests/rules-tickets.spec.ts` 68/68。全量 `npm test` 与 `npm run probe` 在计划阶段没有跑，第一项开工前跑一次记下计数。
- 门禁写法（退出码不经管道）：`npm run build *> .llm/m6f/<步>-build.log; $LASTEXITCODE`，同样写 `npm run -s preflight`、`npm test`、`npm run -s probe`。探针运行中不重新构建这个检出。不编辑 `docs/graph`，不动 `~/.dsh` 与桌面版；三项都不需要桌面版（S 线的界面核对随规则板自己的 L4 批次）。
- 已知抖动：`tests/rules-tickets.spec.ts` 的卸载时限一例（2 秒上限与 Windows 上 `rmdir` 的 `ENOTEMPTY`）偶发失败；只红这一例时单独重跑该文件判定。

## 1. 顺序与理由

S1 `m6-rules-text` → S3 `m6-rules-probe` → S2 `m6-script-gate`。

- S3 依赖 S1：探针要看到排队文字里的「until 18:00」和唤醒文字里的「glm-peak ended at 18:00」，这两处由 S1 写出。
- S2 的验收 16 要求 `CheckResult.text` 里人设规则那一句带时刻（「glm-peak is true until 18:00」），也由 S1 写出；S2 放最后，它的测试直接钉住 S1 之后的文字。
- S2 有一部分仍被挡（见 §4.2），放最后不挡前两项。
- S1 与 S2 文件不交叠；S1 与 S3 都改 `scripts/probe/run-probe.mjs`，按顺序串行。

## 2. S1 `m6-rules-text`：规则板的排队、提醒与唤醒文字写出高峰结束的时刻

### 2.1 验收（节点原文）

1. 排队文字的 Boundary 段写「glm-peak is true until 18:00」，每步提醒的等待单一项写「, until 18:00」，唤醒文字写「glm-peak ended at 18:00」
2. 没有计价服务或 glm-peak 读不出时文字里没有时刻

设计 §7.2 第 1 条另写：拦截文字同理写「blocks it now: glm-peak is true until 18:00」；唤醒的时刻是 `nextPeakChange(peak, 单的开单时刻)`，唤醒时现算，不往单上加字段；只在重判时 `glm-peak` 已为假时这样写。

### 2.2 依赖

- 整块规则板 R1–R4：已在 main（rules-loops 合并 `c6e9bed`，`git merge-base --is-ancestor` 核过；FEAT-008 的 `47a9852`、`c632387` 也在 main）。排队文字在 `src/rules/denial.ts`，等待单与唤醒在 `src/rules/tickets.ts`、`src/rules/wake.ts`，每步提醒在 `src/rules/reminder.ts`。
- `m6-quota-contract`（Q1）：`nextPeakChange` 在 `src/shared/pricing.ts`，已在 main。
- 不需要循环板共用执行器。

### 2.3 做法（定下的取舍）

- 时刻的写法用规则板文字已在用的 `localClock`（`src/rules/denial.ts`，本机时区 `HH:MM`），不用 `src/shared/quota.ts` 的 `formatMoment`：后者跨日写中文「明天」，而这几处是给模型的英文；高峰的结束总在同一天，两者在 UTC+8 机器上都写「18:00」。测试按本机时区算期望值（同 `tests/rules-gate.spec.ts` 的 `clockHm`、`tests/rules-check.spec.ts` 的 `localHm`）。
- 只管人设的规则（`rule.scope !== 'builtin'`）：设计 §18 M6-R2 写的是人设规则的三处文字；不做档的附属条目已有自己的「until 18:00」，不改。
- 条件短语：只有 `{signal: 'glm-peak', is: true}` 且有 `until` 时写「glm-peak is true until HH:MM」；`all`、`any` 里的这一项同样写，`not` 里的不写（「it is not so that … until」意思不对）；没有 `until` 时照旧写「glm-peak is on」。`until` 在门里只在高峰为真时才有（`clockReadings`），在 `checkCall` 里只在调用方给了 `glm-peak: true` 与 `peakUntil`、或活的宿主心跳读到高峰时才有，所以「读不出就没有时刻」不用另判。
- 唤醒：`whyEnded` 列信号时，`glm-peak` 此刻值为 `false` 且算得出开单那段高峰的结束时，写「glm-peak ended at HH:MM」代替「glm-peak is off now」；其余信号与其余情形原样。开单时刻那一刻不是高峰（`peak(since)` 不为真）、没有计价服务、`peak` 抛错或 `nextPeakChange` 返回 `undefined` 时不写时刻。
- 结束时刻的读取：`src/rules/peak.ts` 新导出 `peakEndAfter(ctx, fromMs)`，每次调用读一次 `pricingService(ctx)`（形状告警已由 `peakReader` 负责，这里传空回调），`peak(fromMs)` 为真时返回 `new Date(nextPeakChange(...)).toISOString()`，否则或出错返回 `undefined`。`createTicketDesk` 的依赖里已有 `ctx`，不加新依赖。

### 2.4 文件

- `src/rules/denial.ts`：`conditionPhrase`、`signalPhrase`、`clauseOf`。
- `src/rules/reminder.ts`：`ticketItem` 与 `textFor` 里的调用。
- `src/rules/wake.ts`：`clearedBecause`、`whyEnded`、`signalNow`。
- `src/rules/peak.ts`：新 `peakEndAfter`。
- `src/rules/tickets.ts`：`rejudge` 里的 `clearedBecause` 调用。
- 测试：`tests/rules-check.spec.ts`、`tests/rules-gate.spec.ts`（改一处既有断言）、`tests/rules-row.spec.ts`、`tests/rules-tickets.spec.ts`。
- 探针：`scripts/probe/run-probe.mjs` 的 `QUEUE_REFUSAL`（`rules-queue` 场景在高峰时钟、GLM 路由上，排队文字会带时刻）。
- 文档：`docs/ORCHESTRATION.md` §16.12 加一段。

## 3. S3 `m6-rules-probe`：探针里人设排队规则夹具与少做档两条 notice 并存

### 3.1 验收（节点原文）

1. 探针新检查通过，npm run probe 退出码 0
2. 来源 glm-peak-reminder 的 notice 不含 information only、keep working、postpone；来源 hourness-rules 的 notice 不含 keep working、postpone

节点正文另写：时钟平移到周三 17:59:30，npm run calibrate 被排队、文字带「until 18:00」，18:00 之后重判唤醒；少做档周三 15:00 两条 notice 都在且不相抵。设计 §1.4 第 13 条的 S3 部分另要求来源 `hourness-rules` 的 notice 不含 `PEAK_REMINDER_TEXT` 的任何一句。

### 3.2 依赖

- `m6-reminder-text`（R1）：已在 main（M6 合入 `11dce6b`..`3bc5d98`），`REDUCE_NOTICE`、`peakReminderText` 已在探针里用。
- `m6-rules-text`（S1）：本计划第 1 项。
- 规则板 R4 的探针场景 `rules-peak`、等待单场景 `rules-queue`：已在 main。
- 不需要循环板共用执行器。

### 3.3 做法

- 新场景 `rules-peak-wake`，不改 `rules-peak`：`rules-peak` 跑在 15:00 并在中途改档位，它的 10 条既有检查依赖这两点；人设排队与跨 18:00 唤醒放进去会改动它们的前提。新场景沿用 `rules-peak` 的组成（`RULES_ROW`、GLM 路由 `glm-5.3`、草稿 git 工作区、出厂档位），规则文件里只有设计 §7.3 第一条 `r-offpeak-credit-runs`（标题、筛选、条件、动作、理由逐字取 §7.3，`origin`/`status` 按 `gateRule` 补）。
- 时钟用 `clockRow(PEAK_AT, SHIFT_TOOL)` 起在 15:00，第一步用 `probe_shift_clock` 平移到 `2026-10-28T09:59:30.000Z`（周三 17:59:30 UTC+8）。不直接把起点设成 17:59:30：宿主启动耗时不定，起点只留 30 秒余量，慢机器上第一次调用可能已过 18:00。
- 工作区放一个 `package.json`，`scripts.calibrate` 为 `node -e "console.log('probe-calibrate-ran')"`，让 `npm run calibrate` 找到的是工作区自己的无害脚本（`npm` 从工作目录往上找最近的 `package.json`，探针运行目录在仓库的 `.llm/probe-runs/` 下，没有它会找到仓库根的真标定脚本）。
- 脚本四步：`DeferredToolCall` → `probe_shift_clock {at: 17:59:30}`；`Bash` `npm run calibrate`（被排队，单 `q-1`）；`Bash` `Start-Sleep -Seconds 45`（`timeout: 120000`，这期间时钟过 18:00，规则行每 5 秒的重判清单并 `steer` 正在跑的 agent）；`text: 'done', status: true`。
- 少做档两条 notice：在既有 `rules-peak` 的第二个请求（`rulesPeak.steps[1]`，出厂少做、15:00、`/wish` 之后）上加一条新检查，两条在同一个请求里一起看。

### 3.4 文件

- `scripts/probe/run-probe.mjs`：新场景、新检查。
- 文档：`docs/ORCHESTRATION.md` §16.12「验证」一句加 L3 场景名。

## 4. S2 `m6-script-gate`：仓库脚本启动前按项目规则与高峰模式自查，拦下要留带规则 id 的记录

### 4.1 验收（节点原文）

1. 设计验收 15、16、17、22（真 checkCall 一遍）、24 通过
2. 每次拒绝（退出码 4、5）写一条带规则 id 的拦下记录，规则页与晨报读得到
3. gateOnRules 不含 child_process，不设超时，不写判定事件

节点批注（2026-10-31，编排方）定下的拦下记录要点：退出码 4 或 5 时为每个命中的规则向 `<项目根>/.llm/audit/violations.jsonl` 追加一行 `{at, rule: 'rules:<规则 id>', mode: 'enforce', effect: 'block' 或 'queue', tool: 'pwsh', command, peakMode, signals, correction}`；项目根取 `projectOf(仓库根).root`，路径与追加取 `packages/hourness/dist/memory/audit.js` 的 `auditPaths`、`auditJournal`、`fsAppender`，`projectOf` 与 `ensureIgnored` 取 `packages/hourness/dist/data/project-root.js`，只在要追加时动态导入；`appendLine` 只给测试注入；不改 `src/`；同一（规则 id，effect）一次运行一行；先写标准错误，再 `await` 追加，最后 `process.exit`；追加失败不改退出码，标准错误多一行 `rules gate: violation journal not written (<原因前 80 字符>)`，同一进程只写一次。

### 4.2 依赖与被挡的部分

- 整块规则板 R1（附属条目 `builtin:glm-peak-reduce`、`builtin:glm-peak-stop-scripts` 与缺省档位）与 R3（`src/rules/check.ts` 的 `checkCall`、`RulesCheckError`）：已在 main。规则板 FEAT-008（不做档的执行）也已在 main，所以 S2 接上之后，不做档在高峰里会把 `npm run smoke:authorized`（自报 `necessary`）排成退出码 5，HANDOFF M6 一行的「不做档停下真账号核对」随 S2 落地。
- 循环板共用执行器 `src/loops/script.ts`：loops-runner 已合入 main（`a9adca8`，`origin/loops-runner` 是 HEAD 的祖先）。`gateOnRules` 本身不用它（验收要求它不含 `child_process`、不跑脚本）。
- 被挡的部分：设计验收 24 里「真实 `checkCall` 配一条人同意过的拦路脚本、注入假执行器 `runScript`」的几例（退出 2 判拦下、退出 3 判排队且重判再跑脚本、超时按条目判）要 `checkCall` 经共用执行器跑人同意过的脚本。今天的 `checkCall` 把带脚本的规则一律当作未获同意、不起进程（`src/rules/check.ts` 文件头与 `CheckResult.scripts` 的 `refused`），也没有注入执行器的选项。这一步在规则板计划里是 R4d「门里跑脚本」（`.agents/tasks/rules/impl-plan.md`），它要 R3-提议的批准记录、已到 main 的共用执行器与 M7 E7 的 `trunkAdvanceFor`，都不在 main。所以 loops-runner 合入之后，验收 24 仍缺的是规则板 R4d，不是执行器。本次交付验收 24 里 `gateOnRules` 自己的那一半（静态检查不含 `child_process`；退出码 4 只写 `CheckResult.text` 不另加行；排队且条件不引用 `glm-peak` 时每 60 秒重判），真实 `checkCall` 跑脚本的几例等 R4d，`m6-script-gate` 在本次之后不能关，由编排方记在节点上。
- `m6-quota-contract`（`nextPeakChange`）：已在 main。

### 4.3 做法（定下的取舍）

- 测试文件名：设计写的 `tests/rules-gate.spec.ts` 已被规则板的工具调用门测试占用（FEAT-006 建，47 例），新建 `tests/script-gate.spec.ts`，加进 `package.json` 的 `test:2`，放在 `tests/rules-tickets.spec.ts` 之后。
- 测试用编译产物：设计 §15.1 要 `checkModule` 指向规则板的真实编译产物，拦下记录的模块按批注固定取 `packages/hourness/dist/`。所以这个 spec 依赖 `npm run build` 的产物（`AGENTS.md` 的顺序是先 build 再 test）；文件开头核对 `packages/hourness/dist/rules/check.js` 在，不在就以「先运行 npm run build」失败。期望的拒绝文字在测试进程里用 `src/rules/check.ts` 的 `checkCall` 以同样的选项算出，与子进程的标准错误比较。
- 子进程：`gateOnRules` 会 `process.exit`，按设计 §15.1 以子进程跑。测试在临时 git 仓库里写一个只调用 `gateOnRules` 的脚本，放在 `scripts/calibrate/run-calibrate.mjs`（这样不带 `npm_lifecycle_event` 时命令文本就是 `node scripts/calibrate/run-calibrate.mjs …`，§7.3 的规则能匹配到）；注入的 `now`、`sleep`、`appendLine`、`peakAt` 在子脚本里定义，配置经环境变量传 JSON，调用记录写进临时目录的 JSONL；`gateOnRules` 返回后子脚本在标准输出打一行 `STARTED <JSON 的 process.argv.slice(2)>`。子进程的环境去掉全部 `npm_` 开头的变量（`npm test` 自己会设 `npm_lifecycle_event`），要 `npm run` 形式的用例再显式设 `npm_lifecycle_event`。
- 标准错误的写法：每次写都等 `process.stderr.write` 的回调再继续，然后才 `process.exit`，避免管道上的输出在退出时丢掉。
- `peakAt` 读不出（抛错或不是布尔值）：不给 `signals` 与 `peakUntil`；`checkCall` 返回后写一行 `rules gate: glm-peak not computed here (<原因前 80 字符>)`，若 `CheckResult.signals` 里 `glm-peak` 没有值，后接 `; <它的 unknown 原文>`。这一行写在 `CheckResult.text` 与排队行之后，所以「标准错误先是 `CheckResult.text`」在每种情形都成立；`--wait` 期间同一进程只写一次。
- `checkCall` 抛错：`RulesCheckError` 写 `rules gate: rules check failed (<code>: <消息前 80 字符>); starting without the check`，照常开始；别的异常同样放行，`code` 处写 `error`（设计 §13「规则板自己出问题时放行，并在标准错误写一行」）。
- `--wait`：从 `process.argv` 去掉每一个 `--wait`；第一次判出排队时写 `CheckResult.text`、一行 `rules gate: waiting until HH:MM`（知道结束时刻时）或 `rules gate: re-checking every 60 s for up to 8 h`，写拦下记录，再睡；之后的重判排队时不再写标准错误，判出拦下时写 `CheckResult.text`、记录并 `process.exit(4)`，放行时返回；累计 8 小时仍排队时写 `CheckResult.text` 与排队行、记录并 `process.exit(5)`。睡的时长：本次 `CheckResult.signals` 里 `glm-peak` 为真且有结束时刻时睡到结束 + 1 秒，否则 60 秒，都不超过剩下的 8 小时。
- 时刻的写法同 S1：本机时区 `HH:MM`（与 `CheckResult.text` 里的 `localClock` 一致）。
- 判定事件：`gateOnRules` 不传 `metrics`，也不导入任何指标出口（设计 §7.2「留痕」）。现状是 `checkCall` 的缺省出口为空（`src/rules/metrics.ts` 的 `NO_EXIT`），只有命令行显式传 `libraryExit`，循环板的 `askRules` 也不传；所以接上之后生产里这一路没有 `rules.check` 事件。这是规则板与指标流水之间的接缝（`checkCall` 的库调用方缺省出口），不由 M6 补，本次在 HANDOFF 与 ORCHESTRATION §11.4 写明。验收 22 的「真 checkCall 一遍」用一个包装模块做：`checkModule` 指向临时目录里的 `.mjs`，它从 `packages/hourness/dist/rules/check.js` 取真 `checkCall`，再加上 `metrics` 选项把事件写进记录文件，`RulesCheckError` 原样转出。
- `run-calibrate.mjs` 的 `--collect`：设计要求自查在解析参数之前，所以 `npm run calibrate -- --collect <时间戳>` 在高峰的少做档同样被排队。照设计做，不另开例外；撤法是 `--wait` 或 `/rules peak 无影响`。
- 拦下记录的文件：项目根下 `.llm` 不存在时先 `ensureIgnored(<项目根>, '.llm')`，存在时不调；目录由 `fsAppender` 建。

### 4.4 文件

- 新建 `scripts/rules-gate.mjs`。
- `scripts/calibrate/run-calibrate.mjs`、`scripts/smoke-zcode-authorized.mjs`：调用点。
- 新建 `tests/script-gate.spec.ts`；`package.json` 的 `test:2`。
- 文档：`docs/DEVELOPMENT.md` §3（标定一段之后加自查一句，另起一段写真网冒烟的自查，仓库今天没有真网冒烟的小节）；`docs/ORCHESTRATION.md` §11.4 排期一条之后加一句、§16.10 标题里「调用方只有命令行与测试」改成实际的调用方；`docs/HANDOFF.md` §8 M6 一行的「还缺什么」。

# Implementation Plan

- [ ] 1. S1 代码：规则板三处文字写出高峰结束的时刻。
      `src/rules/denial.ts`：`conditionPhrase(condition, peakUntil?: string)` 与 `signalPhrase(condition, peakUntil?)`，`condition.signal === GLM_PEAK`（从 `./signals.ts` 导入）、`'is' in condition && condition.is === true`、`peakUntil !== undefined` 时返回 `glm-peak is true until ${localClock(peakUntil)}`；`all`/`any` 把 `peakUntil` 传下去，`not` 不传；`lifetimePhrase` 的调用不传。`clauseOf(entry, effect, peakUntil)` 对人设规则的拦截与排队两句都传 `peakUntil`，`boundaryOf` 传 `input.peak.until`。
      `src/rules/reminder.ts`：`ticketItem(ticket, subagent, until)`，`until` 只在这张单的 `rules` 里有一条 `state.rules` 中的人设规则、且 `signalsRead(rule)` 含 `glm-peak` 时传；`deferred` 的一项写 `(deferred since HH:MM, until HH:MM)`，`cleared` 与转交来的两种写法不变。`textFor` 里取 `reading.peak === true ? reading.until : undefined`。
      `src/rules/peak.ts`：新导出 `peakEndAfter(ctx: ServiceLookup, fromMs: number): string | undefined`（见 §2.3）。
      `src/rules/wake.ts`：`clearedBecause(ticket, state, readings, now, blocking, peakEnd?: string)` → `whyEnded(id, state, readings, now, peakEnd)` → `signalNow(name, reading, state, peakEnd)`：`name === GLM_PEAK && reading.value === false && peakEnd !== undefined` 时返回 `glm-peak ended at ${localClock(peakEnd)}`。
      `src/rules/tickets.ts` 的 `rejudge`：`clearedBecause(..., blocking, peakEndAfter(deps.ctx, Date.parse(ticket.since)))`。
      Files: src/rules/denial.ts, src/rules/reminder.ts, src/rules/peak.ts, src/rules/wake.ts, src/rules/tickets.ts
      Verify: `npm run build` 退出码 0。此时 `tests/rules-gate.spec.ts` 的「the gate and checkCall give the same refusal…」一例预期会红（门里有时刻，库调用没给 `peakUntil`），第 2 项改它。

- [ ] 2. S1 测试与探针：钉住三处文字和没有时刻的情形，改既有断言。
      `tests/rules-tickets.spec.ts`：新规则 `PEAK_HOLD`（`r-offpeak-credit-runs` 的形状：`filter.command.matches` 取设计 §7.3 的正则，`condition: {signal: 'glm-peak', is: true}`，`action: {kind: 'queue'}`），`ticketTest(..., { rules: { version: 2, rules: { [PEAK_HOLD.id]: PEAK_HOLD } } })`，时钟用缺省的 `2026-10-28T07:00:00.000Z`。一例：`exec('pwsh', {command: 'npm run calibrate'})` 的拒绝含 `defers it while glm-peak is true until ${本机 HH:MM of 2026-10-28T10:00:00.000Z}.`；`pass(fixture, clock, 3 * HOUR + 1000)` 之后 `live.woken[0].text` 等于 `[rules board] Ticket q-1 cleared: glm-peak ended at <同一 HH:MM>. You may run the deferred call again: pwsh "npm run calibrate".`。一例：开单之后 `fixture.runtime.services.delete(PRICING_SERVICE)` 再 `pass`，唤醒文字不含 `ended at`。
      `tests/rules-row.spec.ts`：`withRow` 在 `PEAK_NOW`、规则文件里放同样的 `PEAK_HOLD`，`exec` 一次后 `stepOf` 的提醒含 `Your open tickets: q-1 pwsh "npm run calibrate" (deferred since HH:MM, until <本机 HH:MM of PEAK_END>).`；既有 `HOLD_DEPLOY`（无条件）一例照旧没有 `until`。
      `tests/rules-check.spec.ts`：`PEAK_QUEUE` 带 `signals: {'glm-peak': true}, peakUntil: '2026-11-04T10:00:00.000Z'` 时 `result.text` 含 `defers it while glm-peak is true until ${localHm(...)}.`；拦截规则同理 `blocks it now: glm-peak is true until …`；`condition: {all: [{signal: 'glm-peak', is: true}, {signal: 'code-freeze', is: true}]}` 的一例写 `(glm-peak is true until HH:MM) and (code-freeze is on)`；既有不带 `peakUntil` 的一例照旧 `glm-peak is on`。
      `tests/rules-gate.spec.ts`：「the gate and checkCall give the same refusal for the same rules and signals」里 `checkCall` 加 `peakUntil: PEAK_END`，断言改成 `blocks it now: glm-peak is true until ${clockHm(PEAK_END)}\.`。
      `scripts/probe/run-probe.mjs`：把 `localHm` 与 `PEAK_END_HM` 两个常量移到 `PEAK_END`（第 2026 行一带）之后、`QUEUE_REFUSAL` 之前，`QUEUE_REFUSAL` 改成 `new RegExp`，Boundary 里的 `defers it while glm-peak is on\.` 换成 `defers it while glm-peak is true until ${PEAK_END_HM}\.`，其余逐字不变。
      `docs/ORCHESTRATION.md` §16.12：在「每步提醒」一段之后加一段「高峰结束的时刻（M6 S1，M6 设计 §7.2 第 1 条）」：人设规则的条件含 `glm-peak is true` 且读得出高峰时，拒绝文字写 `glm-peak is true until HH:MM`，等待单一项写 `(deferred since HH:MM, until HH:MM)`，唤醒写 `glm-peak ended at HH:MM`（开单那段高峰的结束，唤醒时现算，单上不加字段）；没有计价服务、读不出高峰、`not` 里的这一项与附属条目不写；时刻是本机时区。
      Files: tests/rules-tickets.spec.ts, tests/rules-row.spec.ts, tests/rules-check.spec.ts, tests/rules-gate.spec.ts, scripts/probe/run-probe.mjs, docs/ORCHESTRATION.md
      Verify: `npm run build` 后逐个跑 `node --experimental-strip-types --no-warnings tests/rules-check.spec.ts`（以及 rules-gate、rules-row、rules-tickets），全部 0 失败；`npm run -s preflight`、`npm test` 退出码 0；`npm run -s probe *> .llm/m6f/s1-probe.log` 退出码 0，`rules-queue` 的各条检查通过。然后一个提交（信息带 `m6-rules-text`，同时提交本计划文件 `.agents/tasks/m6/followups-plan.md`），只在本地分支。

- [ ] 3. S3 探针：新场景 `rules-peak-wake` 与少做档两条 notice 的检查。
      在 `rules-queue` 之后加：`PEAK_WAKE_RULES_FILE = repoJson({version: 2, rules: {'r-offpeak-credit-runs': gateRule('r-offpeak-credit-runs', '高峰时积分重活排到高峰结束以后', {filter: {command: {matches: <§7.3 正则>}}, condition: {signal: 'glm-peak', is: true}, action: {kind: 'queue'}, reason: '（人写）高峰时 GLM 按全价计积分，练习题、对照实验与真网冒烟等到高峰结束'})}})`；`wakeProject = rulesGateProject('rules-peak-wake', PEAK_WAKE_RULES_FILE)`，再往 `wakeProject.ws` 写 `package.json`（`{"name": "probe-ws", "private": true, "scripts": {"calibrate": "node -e \"console.log('probe-calibrate-ran')\""}}`）；`runScenario('rules-peak-wake', 'glm-5.3', [shift 到 2026-10-28T09:59:30.000Z, Bash npm run calibrate, Bash Start-Sleep -Seconds 45 (timeout 120000), {text: 'done', status: true}], <任务提示>, [...RULES_ROW, ...clockRow(PEAK_AT, SHIFT_TOOL)], wakeProject.ws)`。
      检查（加进 `checks`）：(a) 项目就绪、退出码 0、4 个请求、标准错误里没有 `dsh-glm-hourness/rules`；(b) `lastToolResult(steps[2])` 是错误，文字以 `Error: You tried to run "npm run calibrate".` 开头，含 `Deferred as ticket q-1.` 与 `defers it while glm-peak is true until ${PEAK_END_HM}.`，不含 `probe-calibrate-ran`，且 `steps[1].clock < LOOPS_PEAK_END_MS`；(c) `boardTexts(steps[2])` 里有一条含 `q-1 pwsh "npm run calibrate" (deferred since ` 与 `, until ${PEAK_END_HM})`；(d) `wakeMessages(steps[3])` 恰好 1 条，文字等于 `[rules board] Ticket q-1 cleared: glm-peak ended at ${PEAK_END_HM}. You may run the deferred call again: pwsh "npm run calibrate".`，`steps[3].clock >= LOOPS_PEAK_END_MS`，`readStateOf(wakeProject).tickets['q-1'].state === 'cleared'`；(e) 场景的用户级目录里没有 `glm-hourness/rules`。
      少做档两条 notice（`rules-peak` 的 `steps[1]`）：来源 `glm-peak-reminder` 的恰好 1 条，正文等于 `REDUCE_NOTICE`，不含 `information only`、`keep working`、`postpone`；来源 `hourness-rules` 的至少 1 条，每条不含 `keep working`、`postpone`，也不含 `peakSentences` 里的任何一句。
      `docs/ORCHESTRATION.md` §16.12「验证」一句加 `rules-peak-wake`（人设排队规则跨 18:00 的排队、提醒与唤醒文字）与 `rules-peak` 的两段 notice 同请求核对。
      Files: scripts/probe/run-probe.mjs, docs/ORCHESTRATION.md
      Verify: `npm run build`、`npm run -s preflight` 退出码 0；`npm run -s probe *> .llm/m6f/s3-probe.log` 退出码 0，日志末行的通过数比第 2 项多出本项新加的检查数，新检查全过；`npm test` 退出码 0（探针脚本在 lint 范围内）。一个提交（`m6-rules-probe`）。

- [ ] 4. S2 主体：`scripts/rules-gate.mjs` 与它的 L2。
      导出 `gateOnRules({glmSpend, peakAt, now, sleep, checkModule, pricingModule, projectRoot, appendLine})`；`glmSpend` 只认 `'optional' | 'necessary'`，`peakAt` 必填；缺省 `now = Date.now`、`sleep = ms => new Promise(r => setTimeout(r, ms))`、`checkModule = <仓库根>/packages/hourness/dist/rules/check.js`、`pricingModule = <仓库根>/packages/hourness/dist/shared/pricing.js`、`projectRoot = fileURLToPath(new URL('..', import.meta.url))`。流程按 §4.3 与设计 §7.2 第 2 条：取出 `--wait` → 命令文本（`npm_lifecycle_event` 合 `^[a-z0-9:_-]{1,64}$` 时 `npm run <它>` 加参数，否则 `node <process.argv[1] 相对仓库根、斜杠写法>` 加参数）→ 动态导入两个模块（失败或缺 `checkCall`/`nextPeakChange`：一行 `rules gate: rules board not available (<消息前 80 字符>); starting without the check` 后返回）→ 每次判定前现算 `signals`/`peakUntil` → `checkCall({tool: 'pwsh', args: {command}}, {project: projectRoot, glmSpend, signals?, peakUntil?, waitedMs?})`（没有值的键不写，`waitedMs` 只在第二次起给，取整，至多 8 小时）→ 退出码 0 返回不输出；4 写 `text`、记录、`process.exit(4)`；5 写 `text` 与 `rules gate: <ids 逗号分隔> queues this run[; GLM peak ends at HH:MM]. Rerun with --wait to wait.`、记录、`process.exit(5)`，`--wait` 时按 §4.3 等。命中集合：`CheckResult.rules` 里 `effect === CheckResult.effect` 且 `when !== 'false'` 的项。拦下记录按 §4.1 的批注：每个命中项一行，`at = new Date(now()).toISOString()`，`signals` 为 `CheckResult.signals` 里有 `value` 的项，`correction = text ?? ''`，同一（id，effect）一次运行一行；`appendLine` 缺省为 `fsAppender({mkdir, appendFile})`（`node:fs/promises`）；`projectOf(projectRoot)` 为 `undefined`、`ensureIgnored`/追加抛错、模块导入失败都算追加失败，按批注只警告一次。源码不 import `node:child_process`、任何指标模块，不调 `setTimeout` 之外的计时（`setTimeout` 只在缺省的 `sleep` 里）。
      `tests/script-gate.spec.ts`（`node:test`，见 §4.3 的子进程与编译产物两条）。用例：
      - 验收 22（假规则库，记下每次调用的选项；前两次答排队、第三次答放行；`CheckResult.signals` 照收到的 `signals` 回；时钟从 `2026-10-28T09:58:30.000Z` 起，`sleep` 把时钟往前拨）：带 `--wait` 恰好 3 次调用，时刻 17:58:30、18:00:01、18:01:01（UTC+8）；第一次 `signals: {'glm-peak': true}`、`peakUntil: '2026-10-28T10:00:00.000Z'`、没有 `waitedMs`；后两次 `signals: {'glm-peak': false}`、没有 `peakUntil`、`waitedMs` 91000 与 151000；`sleep` 收到 91000、60000；标准输出 `STARTED` 的参数里没有 `--wait`。`peakAt` 抛错一例：唯一一次调用的选项里没有 `signals` 与 `peakUntil` 键，标准错误恰好一行 `rules gate: glm-peak not computed here (`。另：`--glm-spend necessary` 在命令行里时假规则库收到的仍是 `optional`，`STARTED` 的参数里仍有它。
      - 验收 22 真 `checkCall` 一遍：包装模块（§4.3）加真实临时 git 仓库，规则文件里一条 `code-freeze` 为开时排队的人设规则（开关由 `src/rules/engine.ts` 以 `human` 写），子脚本的 `sleep` 在第 2 次睡之后把开关关掉：恰好 3 条 `rules.check` 进记录文件，`exitCode` 依次 5、5、0，`waitedMs` 依次缺、60000、120000。
      - 验收 15（真 `checkCall`，`peakAt` 用 `packages/glm/dist/glm-llm/credits.js` 的 `creditPricing.peak`）：`glmSpend` 两种 × 档位（人设无影响、从没设过、人设少做、人设不做）× 周三 2026-10-28 15:00、19:00 与周六 2026-10-31 15:00（UTC+8）。无影响：全部退出码 0、标准错误为空。出厂少做：15:00 `optional` 退出码 5，标准错误以测试进程算出的 `CheckResult.text` 开头，含 `builtin:glm-peak-reduce`、`Peak mode: reduce (the default; the human can change it).` 与 `until <HH:MM>`；19:00 退出码 0；`necessary` 两个时刻 0。人设少做：那一句是 `Peak mode set by the human at <本机 YYYY-MM-DD HH:MM>: reduce.`。不做：15:00 两种都是 5，含 `builtin:glm-peak-stop-scripts` 与 `Peak mode set by the human at …: stop.`；19:00 都是 0。周六 15:00 三档都是 0。`peakAt` 抛错且没有心跳时三档都是 0，标准错误恰好一行 `rules gate: glm-peak not computed here (…)`。
      - 验收 16（真 `checkCall`）：§7.3 第一条 `r-offpeak-credit-runs` 写进规则文件、档位人设无影响，周三 15:00 `node scripts/calibrate/run-calibrate.mjs` 退出码 5，标准错误先是 `CheckResult.text`（含 `defers it while glm-peak is true until <HH:MM>`），再一行 `rules gate: r-offpeak-credit-runs queues this run; GLM peak ends at <HH:MM>. Rerun with --wait to wait.`；`--wait` 时 `sleep` 收到 10_801_000（到 18:00:01），之后放行、`STARTED` 的参数没有 `--wait`。`code-freeze` 为开的人设规则：标准错误不写时刻，`--wait` 每 60 秒一次，假规则库（总答排队）的 8 小时一例恰好 481 次调用后退出码 5。拦截规则：退出码 4，标准错误等于 `CheckResult.text` 加换行，没有别的行。`npm run` 形式：设 `npm_lifecycle_event=calibrate` 时命令文本是 `npm run calibrate`（假规则库记下的 `call.args.command`）。
      - 验收 17：`checkModule` 指向不存在的文件、指向一个没有 `checkCall` 导出的模块：各自标准错误恰好一行 `rules gate: rules board not available (`，`STARTED`、退出码 0。假规则库抛 `RulesCheckError('io', …)`：一行 `rules gate: rules check failed (io: `，照常开始。静态：`scripts/calibrate/run-calibrate.mjs` 的 `parseArgs` 选项里没有 `glm-spend`，也没有 `strict: false`。
      - 验收 24 中 `gateOnRules` 的一半：静态检查 `scripts/rules-gate.mjs` 的源码不含 `child_process`、不导入任何路径含 `metrics` 的模块、不含 `rules.check`；假规则库答拦下且 `scripts: [{rule, outcome: 'block'}]`、`text` 含 `ran its script` 时退出码 4，标准错误恰好是 `text`。
      - 验收 26（假规则库加注入的 `appendLine`，记下路径与行）：按设计 §1.4 第 26 条逐项（退出码 4 一行及全部字段；两条规则两行；`when: 'false'` 与 effect 不同的不追加；退出码 5 写 `queue`；`--wait` 排队、排队、放行只一行；第二次换规则追加新的一行；排队变拦下追加 `block` 一行；退出码 0 不调用；追加抛错时退出码不变、`text` 照写、恰好一行 `rules gate: violation journal not written (`，同一进程第二次失败不再写；仓库根没有 `.git` 也没有 `.llm` 时不追加、警告一行；仓库根是工作树（`.git` 文件指向带 `commondir` 的 git 目录，夹具写法同 `tests/rules-engine.spec.ts` 第 136–140 行）时路径在主检出的 `.llm/audit/violations.jsonl`）。真实文件系统一例（真 `checkCall`、一条无条件的拦截规则、不注入 `appendLine`）：临时仓库没有 `.llm`，退出码 4 之后文件恰好一行能 `JSON.parse`，`.git/info/exclude` 有 `.llm/`；再跑一次文件两行，第一行不变。
      `package.json`：`test:2` 在 `node --experimental-strip-types tests/rules-tickets.spec.ts` 之后加 `node --experimental-strip-types tests/script-gate.spec.ts`。
      Files: scripts/rules-gate.mjs, tests/script-gate.spec.ts, package.json
      Verify: `npm run build` 退出码 0；`node --experimental-strip-types --no-warnings tests/script-gate.spec.ts` 0 失败；`npm run lint` 退出码 0（eslint、knip、jscpd 棘轮不涨）。

- [ ] 5. S2 调用点、文档与收尾门禁。
      `scripts/calibrate/run-calibrate.mjs`：`credits.js` 的导入加 `creditPricing`；加 `import { gateOnRules } from '../rules-gate.mjs'`；在 `parseArgs` 之前一行 `await gateOnRules({ glmSpend: 'optional', peakAt: at => creditPricing.peak(at) })`，文件头注释的用法一段加 `--wait` 与自查一句。`scripts/smoke-zcode-authorized.mjs`：加 `import { creditPricing } from '../src/glm-llm/credits.ts'` 与 `import { gateOnRules } from './rules-gate.mjs'`，在 `credentialHome(undefined)` 之前 `await gateOnRules({ glmSpend: 'necessary', peakAt: at => creditPricing.peak(at) })`，文件头注释加一句。`tests/script-gate.spec.ts` 加一例静态检查：两个调用点里 `await gateOnRules(` 出现在 `parseArgs(` 与 `new ZcodeAdapter(` 之前，自报值分别是 `'optional'`、`'necessary'`。两个脚本本身不跑（花积分、标定要桌面版）。
      文档：`docs/DEVELOPMENT.md` §3 标定一段后加一句（启动前经 `scripts/rules-gate.mjs` 按项目规则与高峰模式自查，自报 `optional`，少做与不做档的高峰里退出码 5 排队，`--wait` 等到可以跑，拦下与排队各在 `.llm/audit/violations.jsonl` 留一行带规则 id 的记录；撤下用 `/rules peak 无影响` 或 `/rules lift <id>`），另起一段写真网冒烟（`npm run smoke:authorized`）自报 `necessary`：少做档照跑，不做档排队（人定 `d-m6-low-mode`）。`docs/ORCHESTRATION.md` §11.4 排期一条之后加设计 §17 的那句，末尾按现状写：每次拦下或排队留一行违规流水；判定事件由 `checkCall` 写，但它对库调用方的缺省出口为空，`gateOnRules` 与循环板今天不交出口，这一路还没有 `rules.check`。§16.10 标题括注的「调用方只有命令行与测试」改成「调用方：命令行、循环板跑脚本之前（`src/loops/run.ts`）、仓库脚本启动前（`scripts/rules-gate.mjs`）与测试」。`docs/HANDOFF.md` §8 M6 一行「还缺什么」：删去「不做档停下真账号核对在 main 上还没有拦」，写 S1–S3 已做；`m6-script-gate` 留两件：验收 24 的真实 `checkCall` 跑拦路脚本几例等规则板 R4d，仓库脚本自查的 `rules.check` 事件等 `checkCall` 库调用方的缺省出口接上指标流水；`m6-metrics-events` 照旧等指标。
      Files: scripts/calibrate/run-calibrate.mjs, scripts/smoke-zcode-authorized.mjs, tests/script-gate.spec.ts, docs/DEVELOPMENT.md, docs/ORCHESTRATION.md, docs/HANDOFF.md
      Verify: `npm run build`、`npm run -s preflight`、`npm test` 三道退出码 0；`npm run -s probe *> .llm/m6f/s2-probe.log` 退出码 0（S2 不碰运行时，这一跑是三项合起来的收尾）。一个提交（`m6-script-gate`，第 4、5 项合在这一个提交里）。只在本地分支提交，推送归合并步骤。

## Digest

`src/rules/denial.ts`（S1）
- `export function conditionPhrase(condition: Condition): string`（约第 77 行），内部 `signalPhrase(condition)`（约第 67 行，布尔写 `is on`/`is off`）、`clockPhrase`；`not` 分支调 `conditionPhrase(condition.not)`；`all`/`any` 分支 `items.map(item => \`(${conditionPhrase(item)})\`)`。
- `lifetimePhrase(rule)` 的 `until` 分支调 `conditionPhrase(life.condition)`（不传时刻）。
- `function clauseOf(entry: Entry, effect: 'block' | 'queue'): string`：builtin 返回 `Rule <id> defers …`；人设：`${head} blocks it now${condition ? \`: ${conditionPhrase(rule.condition)}\` : ''}.${reason}` 与 `${head} defers it${condition ? \` while ${conditionPhrase(rule.condition)}\` : ''}.${reason}`。
- `boundaryOf(input, codeEntries)` 里 `parts.push(...input.rules.map(entry => clauseOf(entry, input.effect)))`；`input.peak.until` 是 ISO 串，`localClock` 在同文件导出。
- `show.ts` 第 66 行也用 `conditionPhrase`（`rules_show` 的 Applies while），不传时刻，输出不变。
- 覆盖：`tests/rules-check.spec.ts` 第 319–335 行（`/defers it while glm-peak is on\./`，不带 `peakUntil`，保持）、`tests/rules-gate.spec.ts` 第 86–93 行（要改）、`tests/rules-tickets.spec.ts` 第 79、116、119、143 行（`code-freeze`，不变）。

`src/rules/reminder.ts`（S1）
- `function ticketItem(ticket: Ticket, subagent: boolean): string`（约第 113 行）：转交、`cleared`、`(deferred since ${localClock(ticket.since)})` 三种写法。
- `textFor` 里 `const reading = deps.peak()`、`const { state } = view.read`；第 180 行 `tickets.map(ticket => ticketItem(ticket, subagent))`。
- 覆盖：`tests/rules-row.spec.ts` 第 762–795 行（`HOLD_DEPLOY` 无条件）、第 893 行（不做档单，不变）；探针 `rules-queue` 的 `.includes('(deferred since')`。

`src/rules/wake.ts`（S1）
- `signalNow(name, reading, state)`（约第 140 行）：`reading.value === undefined` 返回 `reading.unknown`，布尔写 `on`/`off`，`manual` 带 `(set by the human at HH:MM)`。
- `whyEnded(id, state, readings, now)`：`builtin:` 开头返回 `PEAK_OVER`；人设规则条件不再成立时 `names.map(name => signalNow(...)).join(', ')`。
- `export function clearedBecause(ticket, state, readings, now, blocking): string`（约第 158 行），只有 `tickets.ts` 第 251 行调用。
- 覆盖：`tests/rules-tickets.spec.ts` 第 163、174、180、245、455 行。

`src/rules/peak.ts`（S1）
- 已有 `peakReader(ctx, now, warn)`，内部用 `pricingService(ctx, cb)` 与 `nextPeakChange(atMs => pricing.peak(atMs), at)`；`pricingService(ctx, problem?)` 的第二参可省。新函数放在 `peakReader` 之后。

`src/rules/tickets.ts`（S1）
- `rejudge(state, ticket, hold)`（约第 243 行）：`clockReadings(state, deps.peak(), now)`，`return { queued, because: clearedBecause(ticket, state, readings, now, blocking) }`；`deps.ctx` 是 `ServiceLookup`；`ticket.since` 是开单时刻的 ISO 串（`src/rules/model.ts` 第 112 行）。

`scripts/probe/run-probe.mjs`（S1、S3）
- 第 298 行 `lastToolResult`；第 454 行 `PEAK_AT = '2026-10-28T15:00:00+08:00'`；第 455 行 `clockRow(at, shiftWith)`；第 465–468 行 `PEAK_NOTICE`、`REDUCE_NOTICE`、`STOP_NOTICE`、`FORBIDDEN_REMINDER_WORDS`；第 508 行 `RULES_ROW`；第 519–528 行 `rules-peak`；第 545–548 行 `gateRule`、`GATE_RULE_AT`；第 555 行 `rulesGateProject(name, text)`（写 `docs/rules/rules.json`、`initRepo`）；第 872–885 行 `queueRule`、`QUEUE_RULES_FILE`、`rules-queue`（Bash 调用、`timeout: 30000`）；第 959–962 行 `LOOPS_PEAK_END`、`LOOPS_PEAK_END_MS`、`SHIFT_TOOL = 'probe_shift_clock'`（`loops-peak` 用 `DeferredToolCall` 调它）；第 2026 行 `PEAK_END = '2026-10-28T10:00:00.000Z'`；第 2042、2044–2046 行 `boardTexts`、`readStateOf`、`journalOfProject`、`wakeMessages`；第 2057 行 `QUEUE_REFUSAL`（正则字面量）；第 2079–2086 行 `localHm`、`PEAK_END_HM`、`peakTexts`、`REDUCE_LINE`、`STOP_LINE_START`、`peakSentences`；第 2727 行 `const checks = [`，第 2959–2963 行汇总。`steps[i]` 是第 i 个请求，`lastToolResult(steps[i])` 是第 i-1 步调用的结果，`step.clock` 是请求时的运行时时钟。
- 覆盖：探针自身；`npm test` 里的 `npm run lint` 覆盖这个文件。

`scripts/rules-gate.mjs`（S2，新）
- 要导入的编译产物（build 后在）：`packages/hourness/dist/rules/check.js`（`checkCall`、`RulesCheckError`，`code: 'usage' | 'io'`）、`packages/hourness/dist/shared/pricing.js`（`nextPeakChange(peak, fromMs, horizonMs?)`，返回分钟边界的毫秒或 `undefined`）、`packages/hourness/dist/memory/audit.js`（`auditPaths({projectHome})` → `.violations` 为 `<home>/audit/violations.jsonl`；`auditJournal(append, paths).violation(record)`；`fsAppender({mkdir, appendFile})`，同一文件的追加串行）、`packages/hourness/dist/data/project-root.js`（`projectOf(cwd)` → `{root}` 或 `undefined`；`ensureIgnored(root, '.llm')` 同一文件串行、抛错即不建目录）。
- `CheckOptions`（`src/rules/check.ts` 第 45 行）：`project`、`signals?: {'glm-peak'?: boolean}`、`glmSpend?`、`peakUntil?`（要和 `signals['glm-peak']` 一起给，否则 `usage`）、`waitedMs?`（非负整数）、`metrics?`、`now?`。`CheckResult`（第 72 行）：`effect`、`exitCode: 0 | 4 | 5`、`rules: {id, title, effect, when}[]`、`text?`、`signals: SignalReading[]`（`{name, source, value?}` 或带 `unknown`）、`scripts`、`peakMode`、`notes`。
- 覆盖：`tests/script-gate.spec.ts`（新）。

`scripts/calibrate/run-calibrate.mjs`（S2）
- 第 37–40 行：`node:child_process`、`node:fs`、`node:path`、`node:util` 的导入；`import { chargedCredits, CREDIT_RATES, fullCredits, peakWindowAt } from '../../packages/glm/dist/glm-llm/credits.js'`；`../sandbox.mjs`、`./run-dir.mjs`。第 55 行起 `const { values: options } = parseArgs({ options: { tasks, models, repeat, 'max-steps', minutes, permission, collect } })`（严格模式，未知参数报错）；之后 `--collect` 分支。

`scripts/smoke-zcode-authorized.mjs`（S2）
- 40 行；第 10–13 行：`import { ZcodeAdapter } from '../src/glm-llm/zcode.ts'`、`import { credentialHome } from '../src/shared/data-home.ts'`、`const home = credentialHome(undefined)`、`const adapter = new ZcodeAdapter(...)`。经 `node --experimental-strip-types` 跑。

`package.json`（S2）
- `test:2` 以 `node --experimental-strip-types tests/rules-ops.spec.ts && …` 开头，含 `… tests/rules-gate.spec.ts && node --experimental-strip-types tests/rules-tickets.spec.ts && …`。

`tests/rules-gate.spec.ts`（S1 改一处）
- 第 37 行 `PEAK_DEPLOY`（`glm-peak is true` 的拦截）；第 55–56 行 `clockHm(iso)`、`PEAK_END = '2026-10-28T10:00:00.000Z'`；第 86–93 行要改的一例：`checkCall(call, { project: root, now: PEAK_NOW, signals: { 'glm-peak': true } })`，`assert.equal(gate, library.text)`，`assert.match(gate, /blocks it now: glm-peak is on\./)`。

`tests/rules-tickets.spec.ts`、`tests/rules-host.ts`、`tests/rules-helpers.ts`（S1 用）
- `ticketTest(title, body, over)`：缺省时钟 `fakeClock('2026-10-28T07:00:00.000Z')`、`live: true`、`natives: ['pwsh', 'subagent']`，`over.rules` 覆盖规则文件；`pass(fixture, clock, ms)`（第 168 行一带）先 `clock.advance(ms)` 再 `beat`、`pass`；`fixture.live.woken[i].text`；`fixture.runtime.services` 是 `Map`，计价服务键是 `PRICING_SERVICE`（`src/shared/pricing.ts`），缺省值 `creditPricing`。`withRow(body, options)` 的 `PEAK_NOW = Date.parse('2026-10-28T15:00:00+08:00')`。`ruleOf(over)` 在 `tests/rules-fixtures.ts`。

`tests/rules-check.spec.ts`（S1）
- `START = '2026-11-04T07:00:00.000Z'`；`PEAK_QUEUE`（第 41 行，`glm-peak is true` 的排队，命令含 `deploy`）；`startFrom(project, file)`；`run(project, call, over)` 注入 `metrics` 记录事件；`localHm(iso)` 用 `sv-SE`；`clockedTest(..., { start: START })`。

`docs/ORCHESTRATION.md`、`docs/DEVELOPMENT.md`、`docs/HANDOFF.md`
- ORCHESTRATION：§11.4 在第 1311 行，排期一条在第 1326 行；§16.10 标题在第 1541 行（括注「调用方只有命令行与测试」）；§16.12 在第 1599 行，「每步提醒」一段第 1615 行，「验证」一句第 1627 行。
- DEVELOPMENT：§3 在第 46 行，标定一段在第 81 行；没有真网冒烟的小节。
- HANDOFF：§8 表 M6 一行在第 152 行一带，「还缺什么」一格原文为「「不做档停下真账号核对」在 main 上还没有拦，随 `m6-script-gate` 与规则板 FEAT-008 落地；`m6-metrics-events` 等指标」。
