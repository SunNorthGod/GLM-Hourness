# metrics 设计独立评审

| 轮 | 评审对象 | 日期 | 结论 | 挡路（HIGH / MEDIUM） | 非挡路（NIT） |
| --- | --- | --- | --- | --- | --- |
| 1 | `.agents/tasks/metrics/design.md` 0.1 | 2026-10-30 | CHANGES_REQUESTED | 11（2 / 9） | 11 |
| 2 | `.agents/tasks/metrics/design.md` 0.3（对齐轮，补完断稿） | 2026-10-31 | CHANGES_REQUESTED | 6（0 / 6） | 11 |
| 3 | `.agents/tasks/metrics/design.md` 0.4（修改稿，接着断稿补完，折进人 2026-10-31 的五条决定） | 2026-10-31 | CHANGES_REQUESTED | 2（0 / 2） | 7 |
| 4 | `.agents/tasks/metrics/design.md` 0.5（第二遍修改稿，处理第 3 轮的 F40–F48） | 2026-11-01 | CHANGES_REQUESTED | 1（0 / 1） | 7 |

挡路条数的走向：第 1 轮 11，第 2 轮 6，第 3 轮 2，第 4 轮 1。

## 第 1 轮

评审对象：`design.md` 0.1（§0–§18，§11 列 12 条未核实假设，§16 一件待人定 D1），连同同目录 `graph-ops.json`。

挡路的判据只按 `docs/DEVELOPMENT.md` §1.1（第 29 行）：验收条件或需求没有满足；会造成不可逆损失而没有预防；失败了没有途径发现、发现了没有恢复办法，或事后查不到原因。人定的方向（`d-chat-not-cards`、`d-one-main-agent`、`d-rules-visible`、`metrics` 节点的原话）与编排方的接缝裁定按「需求」计。其余为 NIT。

证据写法：`包:行` 指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js`（`cordis:行` 指 `reference/dsh-desktop-0.2.1-rc.3/cordis/lib/index.js`）；`types.d.ts:行` 指 `node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts`；`design.md:行` 指本设计。

### 读过的版本

| 设计 | 文件（读时的修改时刻） | 版本 | 与指标流水有关的小节 |
| --- | --- | --- | --- |
| 规则板 | `.agents/tasks/rules/design.md`（06:04） | 0.8 | §3.5 第 337 行、§7.3（第 1073 行）、§9.4（第 1384 行）、§10.5（第 1428–1456 行，事件表第 1443–1453 行） |
| 循环板 | `.agents/tasks/schedules/design.md`（13:19）；`design-0.3.md` | 0.4；0.3 | 0.4 §6.10（第 828–850 行，事件表第 834–844 行）、§3.1 `recordRun`；0.3 §6.10（第 799 行） |
| M3 附录 | `.agents/tasks/m3/design-addendum.md`（13:26）；`design-addendum-0.3.md` | 0.4；0.3 | 0.4 §3.1 表第五点（第 384 行）、§3.4（第 525 行）、§3.5（第 568 行）、§3.9（第 626–632 行）、§3.10（第 653 行）、§3.12（第 692–707 行）、第 10 步（第 904 行） |
| M4 | `.agents/tasks/m4/design.md`（07:18） | 0.3 | §3.2（第 276–346 行，`recordKey`）、§6.7（第 906 行）、§15（第 1197 行） |
| M6 | `.agents/tasks/m6/design.md`（13:26）；`design-v0.3.md` | 0.4；0.3 | 0.4 §14.2（第 982–993 行）、§8 M6-L5（第 803 行）；0.3 §14.2（第 904 行） |
| M7 | `.agents/tasks/m7/design.md`（13:26）；`design-0.3.md` | 0.4；0.3 | 0.4 §3.16（第 1059–1090 行）、§3.1.2 第 10 步与派发记录（第 314–328 行）；0.3 §3.16（第 972 行） |
| 面板人话 | `.agents/tasks/plain-ui/design.md`（07:30） | 0.6 | §1.5（第 116、119 行）、§5.6（第 491–512 行）、§11「指标流水」（第 805–808 行） |

M3 附录、M6、M7 三份文件在本轮评审进行中（13:26）被别的运行改写过，版本号没变；上表的行号按 13:26 的文件。M3 附录 §3.12 是那一次新加的。

指标设计 0.1 写于 2026-10-30 07:36。M7 0.3 §3.16、循环板 0.3 §6.10、M6 0.3 §14.2、plain-ui 0.6（07:30）当时都已写成，0.1 的依据一节没有引它们，也没有写所引设计的版本。

### 完整性

- §0 到 §18 都在，文件以 §18 修订记录收尾，没有截断。§11 恰好 12 条，§16 恰好一件 D1，§17 的 `graph-ops.json` 存在且与 §16、§14 对应。
- 结构完整，内容上有两处整块缺失：兄弟设计交来的事件（F1）与对话式问人的计量（F2）。

### 发现

#### F1 HIGH（挡路）：闭合字段表收不下兄弟设计已经写定的 56 种事件，规则板的判定事件与循环板、M7、M6、M3 的数会被整条拒收

位置：`design.md:179–204`（§4.2 事件种类）、`design.md:216–231`（§4.4）、`design.md:347–357`（§6.2 发送方表）、`design.md:586–596`（§14）。

问题：

- §4.4 只认整数、数、布尔、枚举、id 与一个映射，§4.2 只有 17 个种类；不合字段表的事件整条拒收（`design.md:229`）。
- 规则板 0.8 §10.5（第 1443–1453 行）定了 11 种：`rules.judged`、`rules.session-summary`、`rules.ticket`、`rules.wake`、`rules.write`、`rules.proposal`、`rules.peak-mode`、`rules.recovery`、`rules.detector-run`、`rules.check`、`rules.health`。其中 `rules.check` 是编排方接缝裁定「the rules board's checkCall writes the judgment event to the metrics log」（`design-context.md`「Seam rulings」第 2 条）要的那一条，每一次 `checkCall` 都写，放行也写，字段含数组 `rules`、`unknownSignals` 与嵌套对象 `peakMode: {level, origin}`。本设计只给规则板留了「非放行时一条 `rule`（`by: 'rules'`）」（`design.md:355`），放行的判定、等待单、唤醒、写入、提议、档位都没有种类。
- 循环板 0.4 §6.10 定了 11 种（`loop-fired`、`loop-done`、`loop-entry`、`loop-drift`、`loop-note`、`loop-read`、`loop-contribution`、`loop-duplicate`、`loop-holder`、`loop-handover`、`loop-task-delete`），字段含 `exits: number[]` 与嵌套的 `trigger`。本设计的 §4.2、§6.2、§14 一处也没有提循环板。
- M7 0.4 §3.16（第 1067–1088 行）定了 22 种（`execute.dispatch` 带 `sameAsMain`、`sameAsWorker`、`whyRef`，`execute.check` 带每条命令的序号、退出码与毫秒，`execute.advance`、`execute.completion-gate`、`execute.reconcile`、`execute.loop-fallback`、`execute.peak-cap`、`operate.patrol` 等）。本设计另造了一个 `task` 种类与 12 个阶段（`design.md:199`），对不上 M7 的大半事件，还要 M7 给派发工具加一个必填的「理由类别」参数（`design.md:204`、`design.md:588`），而 M7 0.4 第 328 行的做法是记理由所在的节点与历史序号 `whyRef`。
- M6 0.4 §14.2（第 988–991 行）定了 4 种（`glm.quota-read`、`glm.upstream-limit`、`glm.login-rejected`、`glm.peak-reminder`），并写明 GLM 包不重复交 token 与耗时（第 993 行）。本设计没有这 4 种，反而在第 3 步自己改 `src/glm-llm/zcode.ts` 交一个 `upstream`（`design.md:353`），与 M6 的分工重叠。
- M3 附录 0.4 §3.12（第 698–705 行）定了 8 种（`design.proposal-shown`、`design.answer-recorded`、`design.answer-refused`、`design.holder-moved`、`design.rule-denied`、`design.bypass-refused`、`git.snapshot`、`git.snapshot-refused`）。本设计一种也没有，只给 M3 留了 `tagQuestion` 与 `session`（`design.md:356`）。
- 这几份设计都把「服务名、信封与通用字段」交给本设计定，内容按各自的表（规则板 §10.5 第 1439 行、M7 §3.16 第 1061 行、M6 §14.2 第 984 行、循环板 §6.10 第 848 行、M3 §3.12 第 694 行）。本设计反过来要它们「下一次修订时」改成本设计的词汇（§14），可这些设计已经过审或在等人放行。

后果：实现时兄弟各行交来的事件全被拒收，`metrics` 节点「每个数由 harness 写」与接缝裁定都没满足（验收没满足，挡路）。

改法：

1. 字段表分两层。信封由本设计定：`s`、`k`、`at`、`w`、`n`、`h`、`v`、`sid?`，再加 `by`（交来的行，例 `rules`、`loops`、`execute`、`operate`、`glm-login`）。正文按名字空间各一张闭合表，放在 `src/metrics/kinds/<名字空间>.ts`，每张表的内容逐字取自对应设计的那一节，表头注明来源设计与版本。校验规则不变：未知键、类型不对整条拒收。
2. §4.4 加三种类型：`id[]`（至多 32 项）、`int[]`（至多 32 项）、带声明键的小记录（只一层，键与值的类型在表里列出）。这样 `rules.check.rules`、`peakMode`、`loop-done.exits`、`loop-fired.trigger` 都放得下，仍装不下文字。
3. §4.2 改成一张总表：本设计自己写的种类（`start`、`stop`、`gap`、`reject`、`session`、`turn`、`llm`、`tool`、`approval`、`command`、`graph`、`report`、`count`）在前；然后按名字空间列出 `rules.*`（规则板 0.8 §10.5 的 11 种）、`loop-*`（循环板 0.4 §6.10 的 11 种）、`execute.*` 与 `operate.*`（M7 0.4 §3.16 的 22 种）、`glm.*`（M6 0.4 §14.2 的 4 种）、`design.*` 与 `git.*`（M3 附录 0.4 §3.12 的 8 种，问人的两种见 F2），每种写字段与类型。
4. 删去 `task` 种类与 `chose` 理由类别，改用 M7 的 `execute.dispatch.whyRef`；§14 对 M7 的那条（派发工具加必填参数）删去。
5. `upstream` 删去，GLM 包只交 M6 §14.2 的 4 种；本设计第 3 步不再改 `src/glm-llm/zcode.ts`。
6. 验收加一条：L2 对每个名字空间各取那份设计里的一条示例事件，经 `emitMetric` 写入后能读回、字段逐字相同；带一个未知键的同一事件被拒收。
7. 写明 `emitMetric` 的失败口径：写入器自带有上限的队列与 `gap`（§5.1），调用方不必另记丢失；M7 0.4 §3.16 第 1063 行的 `metrics-gaps.jsonl` 由 M7 照「指标流水自带缓冲与重放」的那句删去或保留，在 §14 的 M7 一条里写明。

#### F2 HIGH（挡路）：问人的计量建在已删的卡片路径上，真正问人的 `propose_to_human` 与 `record_human_answer` 没有事件

位置：`design.md:36`（F4）、`design.md:58`（验收第 4 条）、`design.md:196–198`（`ask`、`answer`、`graph`）、`design.md:336`（`tagQuestion`）、`design.md:356`（M3 的卡片构造）、`design.md:365–367`（§6.3 的 `followed`、`counted`、`units`）、`design.md:403`（§7.2「问人」一行）、`design.md:590`（§14 M3）、`design.md:591`（plain-ui）。

问题：

- `d-chat-not-cards`（`design-context.md` 第 61–65 行）：不再用问答卡与选项，问人是对话里的一个方案。M3 附录 0.4 §3.9（第 631–632 行）删去 `src/design/cards.ts` 与设计行对 `userQuestions` 的依赖；所以 `tagQuestion`「卡片构造在 ask 之前调」的调用方不存在。
- plain-ui 0.6 §1.5（第 116 行）与 §11（第 808 行）：跟随率、先想后看与 `asked`、`shown`、`shownOrder`、`peeked` 不做；人原样同意、补充、否掉的次数「由 harness 在 `record_human_answer` 成功返回时记进指标流水：一次调用记一条，种类取这次调用的 `answer` 参数（`agree`、`add`、`reject`），带 `kind`（`question`、`confirm`、`release`）与目标 id」。本设计引的 plain-ui §3.8、§3.9、§3.9.1 与 `src/graph/inertia.ts` 在 0.6 里都不存在。
- M3 附录 0.4 §3.4（第 525 行）：`confirm` 与 `release` 不写图。本设计的问人次数取「不同的 `ask.q` 加开始等人的 `graph` 问题」（`design.md:403`），确认需求与放行方案这两种最常见的问人一次也数不到，等待时长也算不出。
- M3 附录 0.4 §3.12（第 698–699、707 行）已经定了这条路上的两种事件：`design.proposal-shown`（`propose_to_human` 成功返回：`kind`、`number`、目标 id、待决 id、`attach` 的前缀、`text` 的码点数）与 `design.answer-recorded`（`record_human_answer` 成功返回，一次调用一条：`kind`、`answer`、`outcome`、目标 id、待决 id、从那次提议到含第一段原话的人的消息的毫秒数、原话的码点数、前一条主 Agent 消息里有没有「我记成」），并写明问人的次数、字数、等待与跟没跟都由它们算。本设计的字段表与 §7.2 都没有它们。
- `metrics` 节点正文要的「问人的次数、人读了多少字、拍板等了多久、是否跟了推荐」因此在真正的问人路径上全部缺失（需求没满足，挡路）。

改法：

1. 字段表收下 M3 附录 0.4 §3.12 的 `design.proposal-shown` 与 `design.answer-recorded`（连同 F1 里 `design.*` 的其余几种），字段与类型照那一节；码点数与字数两种口径并存时，在字段表注明 `text` 的码点数是 M3 交的原始数，报告里的「字数」由 `calc.ts` 另算或照用，二选一写定。
2. §7.2「问人」一行改为：次数 = `design.proposal-shown` 条数（另列 DSH 原生问题与审批）；人要读的字数 = `design.proposal-shown` 的 `text` 码点数之和，加主 Agent 会话的 `llm.text` 之和；等待 = `design.answer-recorded` 的毫秒数；原样同意率 = `agree / (agree + add + reject)`，按 `kind` 分组。
3. 删去 `tagQuestion`、`QuestionTag`、`ask.form`、`ask.pres`、`ask.rpos`、`answer.followed`、`answer.peeked`，以及 `graph` 事件的 `followed`、`counted`、`asked`、`shown`、`peeked`、`weight`、`units` 与 §6.3 里对 plain-ui `inertia.ts` 的共用约定。`user-questions/request` 的 `ask`、`answer` 只留次数、问题数、选项数、字数、用时与结局，用来数「DSH 原生问题」（子会话之外的普通会话与探针；主 Agent 出了原生问题本身就是要数的违规，M3 §3.10 第 653 行）。
4. 验收第 4 条改写：L2（假的设计行）一次 `propose_to_human` 与一次 `record_human_answer` 各留恰好一条事件，`answer` 取自调用参数，等待毫秒数等于两段会话事件 `time` 之差；一次放行写下 N+1 条图历史时，`design.answer-recorded` 仍只有一条（plain-ui 0.6 §5.6 末段的计数单位）。
5. §14 的 M3 一条改为：照 M3 附录 0.4 §3.12 交事件，`src/design/metrics.ts` 的出口接本设计的 `emitMetric`；主 Agent 是哪个会话取 `design.holder-moved`，`session.main` 删去。

#### F3 MEDIUM（挡路）：D1 是选项式的问题，不合 `d-chat-not-cards`

位置：`design.md:618–627`（§16）、`graph-ops.json` 第 2 项（`options` A/B、`recommend`、`crux`、`verdict`、`weight`）。

问题：

- D1 确实必须问人：写下每一步「怎样算做完」是 `docs/ORCHESTRATION.md` §2.9.1 必须问人的第 1 类（改目标、验收条件或非目标），`design-context.md`「Division of labour」也写明验收归人。这一点设计判断对了。
- 问法不对：`d-chat-not-cards`（人 2026-10-30）定了问人只给一个方案，背景、推荐、疑问、不做四行，不出选项。§16 列 A、B 两个选项并把推荐放在 B；`graph-ops.json` 提的是带选项、推荐、取决于、结论行的选项式待决。按本轮的规矩选项式问题挡路。
- 措辞带内部编号：「§12」「§1.4」「`ORCHESTRATION.md` §2.9.1 第 1 类」「一页纸（`onepage.md`）」，不合 `d-plain-questions` 与「问题带前因后果」两节。
- 时机：F1、F2 会改动验收草稿（第 4 条要重写，要加各名字空间的示例事件一条），草稿定下来之前问人，人确认的是一份会变的清单。按 `d-design-onepage`，这一问应当并进一页放行稿的末尾，作为放行时的那一句。

改法：§16 整节改为下面的四行，`graph-ops.json` 的第 2 项改为提议式待决（只有四行与结论，没有 `options`、`recommend`、`crux`、`verdict`、`weight`），等本设计过审、一页放行稿写成之后由主 Agent 用 `propose_to_human` 交给人：

```text
**指标记录这 10 步的「怎样算做完」，我想照草稿写进去**
背景：指标记录分 10 步做，每步「怎样算做完」按分工归你定，草稿 15 条。
推荐：照放行稿末尾的 15 条原样写进这 10 步；以后要改哪条，你说一句，我带你的原话改。
疑问：我最没把握的是「两个程序同时写一份记录不会写乱」那条；在你电脑上试出来会乱，就改成每个程序各写一份。
不做：不请你逐条审这 15 条（约 1,700 字），它们只写机器能核对的结果，没有替你定方向的内容。
照这样写进去可以吗？
```

背景一行去掉加粗后不超过 60 个码点（plain-ui 0.6 的 `PLAIN_LIMITS.background`）。

#### F4 MEDIUM（挡路）：与规则板的接缝对不上：项目根的退路不同、流水的位置不同，DSH 之外的一次性进程没有能等待的写入口

位置：`design.md:142–152`（§3.3）、`design.md:127`（`src/shared/project-root.ts` 两处共用）、`design.md:235–271`（§5.1 写入器）、`design.md:592`（§14 规则板）。

问题：

- 规则板 0.8 §7.3（第 1073 行）：找不到 `.git` 就用 `cwd` 本身。本设计 §3.3 第 3 条：找不到 `.git` 就不写。两边说共用同一个 `projectRootOf`，同一个函数只能有一种退路，后实现的一方会改掉另一方的行为。
- 规则板 0.8 §9.4（第 1384 行）与 §10.5（第 1439 行）：DSH 之外（命令行 `check`、M6 的 `gateOnRules`、循环板之外的脚本）经「指标流水的库写入口」写，「按 `userDataHome()` 与 §7.3 的项目键找到这个项目的指标流水」。本设计的流水在 `<git 根>/.llm/metrics/`，不在用户数据目录，也没有定义「库写入口」。
- `openWriter().record()` 不等 I/O（`design.md:240`），`close()` 要等（`design.md:244`）。`gateOnRules` 这类脚本判完就退出，规则板的 `emitMetric` 只调一次、不等，事件在微任务里还没写下进程就没了；`verify` 只能看到一个没有 `stop` 的写入者，看不到少了哪条判定。这是接缝裁定「checkCall 写判定事件」在命令行一路上的失败，且发现不了是哪一条。

改法：

1. `projectRootOf(cwd)` 返回 `{root, kind: 'git' | 'cwd'}`：找到 `.git` 时 `kind: 'git'`，否则 `{root: cwd, kind: 'cwd'}`。规则板照它的 §7.3 用 `root`；指标流水只在 `kind: 'git'` 时写。
2. 新建库写入口 `src/metrics/library.ts`：`appendEvents(dir: string, events: readonly EmittedEvent[], host: 'cli'): Promise<{written: number, rejected: number, error?: string}>`，按 `projectRootOf(dir)` 定位、开写入者、逐条 `record`、`await close()`（2 秒预算），从不抛错。规则板、M6 与循环板在 DSH 之外只调它，并 `await` 它的结果再退出。
3. §14 规则板一条改为：DSH 之外写指标经 `appendEvents`，位置由指标流水按 `projectRootOf` 定，不按 `userDataHome()` 与项目键；规则板 §10.5 的那句随规则板下一次修订改。
4. 验收加一条：L2 用一个子进程调 `checkCall` 后立即退出，项目流水里恰好多一条 `rules.check`。

#### F5 MEDIUM（挡路）：没有会话、不属于任何项目的事件没有去处

位置：`design.md:148`（§3.3 第 3 条）、`design.md:334`（`emit` 的 `where`）、`design.md:466`（§9.2「会话找不到项目根」一行）。

问题：M6 0.4 §14.2（第 984 行）明确要本设计定「不带会话的（额度读取由循环板发起时）」归哪里；循环板 0.4 §6.10 的 `loop-read`（第 839 行）与 `loop-contribution`（第 840 行）没有项目字段，是机器一级的事。本设计对没有项目的事件一律不写，只在行健康里计数。这些是系统看得到的数（额度读取的成败与用时、交来的条目被收下几条），丢掉不满足节点的「能全记就全记下」，也没满足 M6 的接缝请求。

改法：加一份机器级流水 `<userDataHome>/metrics/machine/events-<UTC 日期>.jsonl`，格式、写入者、序号与链与项目流水相同；`emit` 的 `where` 加 `{machine: true}`；字段表注明哪些种类可以写进机器级（`glm.quota-read` 不带会话时、`loop-read`、`loop-contribution`）。`summary` 与 `/hourness` 在项目之外另列「本机」一组，`verify` 同样核对它。§9.2 那一行改为：有会话而找不到项目根的事件仍不写并计数，机器级的事件写机器级流水。

#### F6 MEDIUM（挡路）：没有谁会跑 `verify`，崩溃、缺行与链断只在有人手动跑命令时才被发现

位置：`design.md:287–300`（§5.4）、`design.md:408`（§7.3 覆盖行）、`design.md:428`（§7.5 `verify`）、`design.md:470`（§9.2「崩溃、蓝屏、被杀」一行）。

问题：§5.4 的核对只在 `npm run metrics -- verify` 里做；`/hourness` 的覆盖行只有「最早一条、今天几条、本进程丢了几条」。上一个进程没有正常退出、别的写入者缺行、有行被改，这些只有编排方想起来跑命令行才看得到，人与主 Agent 都看不到。节点要求写入失败能被发现，这里没有发现的途径。

改法：

1. 指标行激活之后、第一次写成功时，在后台对每个已写过的项目根跑一次 `checkLog`，范围是前一天与当天的文件；结果进行健康（「上次有 N 个进程没有正常退出，缺 M 行，链断 K 处」）与 `/hourness` 的覆盖行。只读，不阻塞任何一步。
2. 循环板出厂加一条编排层的默认条目「指标记录自查」：每天一次跑 `verify` 的同一个函数，有发现时告诉主 Agent 一行，页面显示为编排层带来的、只能看（`d-rules-visible`、`d-defaults-readonly`）。或者把它并进 M7 的夜间巡检，二选一写定，§14 对应的一条随之写出。
3. 验收第 7 条加一句：造一份没有 `stop` 的旧写入者之后启动指标行，行健康写出「1 个进程没有正常退出」。

#### F7 MEDIUM（挡路）：整天的文件被删既没有预防也发现不了，设计还允许主 Agent 删

位置：`design.md:284`（§5.3「人或主 Agent 可以删掉整天的旧文件」）、`design.md:160`（`metrics-files-only` 只在影子期、依赖 M4）、`design.md:287–300`（§5.4）。

问题：

- 「只有 harness 写」是节点的要求；主 Agent 按 `d-main-agent-shell` 可以随意用 shell，删整天的文件就是模型改了流水。§5.3 把它写成允许的操作。
- `verify` 按写入者核序号。一个写入者的全部行都在被删的那天时，它整个消失，序号上看不出缺口；报告只会把覆盖范围的开头往后挪，看起来像「从那天才开始记」。删除不可逆，也没有途径发现（挡路）。
- `metrics-files-only` 的 shell 判法是「命令文本里出现 `.llm/metrics` 并带写入动作」，没有写删除命令是否算；它在影子期也只是记下。

改法：

1. §5.3 改为：只有人能删旧文件，经 `npm run metrics -- prune --before <日期>`：先往流水与 F5 的机器级流水各写一条 `prune {before, files, lines}`，再删；不提供给主 Agent 的工具或提示。
2. 写入者每打开一个新的日文件，在用户数据目录的账本 `<userDataHome>/metrics/ledger/<项目键>.jsonl` 追加一行 `{file, w, firstN, at}`（项目键同规则板 §7.3）。`verify` 与 F6 的自查对照账本：账本里有、磁盘上没有、又没有覆盖它的 `prune` 的文件，报「文件丢失」。
3. `metrics-files-only` 的 shell 判法写明删除与移动也算（`Remove-Item`、`rm`、`del`、`mv`、`Move-Item`、`git clean` 带 `-x`）；影子期记下的每一次进 F6 的自查结果。
4. 验收加一条：L2 删掉一天的文件（其中有一个写入者的全部行）后跑 `verify`，报出那个文件丢失、退出码 1；经 `prune` 删的不报。

#### F8 MEDIUM（挡路）：「同样的输入得到同样的数」在命令行上复现不了

位置：`design.md:380`（§7.1 第 5 步）、`design.md:390–392`（§7.2 依据行与确定性）、`design.md:419`（§7.4 第 2 种用法）、`design.md:423`（§7.5 参数）、`design.md:508`（§9.5「时钟与环境只在边上读一次，写进依据行」）。

问题：§7.4 说要复现一份旧报告，就「用它依据行里的文件前缀重跑命令行」，但 §7.5 的命令行只有 `--from`、`--to`、`--tz`，`readLog` 总是读到文件末尾。重试队列补写的事件、别的写入者晚到的事件、`backfill-graph` 补的历史，`at` 都可能落在旧窗口里，重跑时数就变了。依据行的例子（`design.md:390`）也没有写窗口与时区，与 §9.5 不一致。节点的「同样的输入算出同样的数」因此只在夹具上成立（验收第 8 条），在真实流水上做不到。

改法：

1. `readLog(root, {from, to, basis?: ReadonlyMap<string, number>})`：给了 `basis` 时每个文件只读前 L 行，不在 `basis` 里的文件不读。
2. 命令行加 `--basis '<文件>:<行数>[,<文件>:<行数>…]'`（校验：文件名匹配 `^events-\d{4}-\d{2}-\d{2}(-[0-9a-f]{8})?\.jsonl$`，行数为正整数；不合格退出码 2）。
3. 依据行写全：`依据：<文件> 1–<L> 行，…；窗口 <from>–<to>（<tz>）；无法读取 <N>；计算版本 <V>`，命令行可以直接把这一行的前半段交给 `--basis`。
4. 验收第 8 条加一例：出一份报告之后往同一文件追加一条 `at` 落在窗口里的事件，按原依据行带 `--basis` 重跑，输出逐字相同；不带 `--basis` 时不同。

#### F9 MEDIUM（挡路）：报告经主 Agent 交给人，指标进了模型的上下文，§1.3 的不变量守不住

位置：`design.md:51`（§1.3「指标不注入模型上下文」）、`design.md:406–410`（§7.3）、`design.md:511`（§9.5 不变量与它的契约测试）。

问题：`docs/CHARTER.md` §8（第 128 行）：「指标不注入模型上下文，防止模型把分数当目标」。`d-one-main-agent`（`design-context.md` 第 55 行）：晨报、周报与巡检由 harness 提醒主 Agent，在它的对话里写给人；M7 0.4 的 `hourness_report` 是工具，返回值进模型上下文。本设计 §7.3 让这些报告的数从 `calc.ts` 算，§9.5 用「导入 `src/metrics/` 的文件清单不含投影、提醒与提示词组装」来守不变量，可报告工具正是合法的导入方，原样同意率、被拦率、返工次数、按模型的比较就这样进了主 Agent 的上下文。设计自己列的非功能需求没有满足。

改法：

1. `calc.ts` 的输出分两类，每个指标在目录表（§7.2）里标明：`facts`（事情本身：几件做完、几件在等人、哪次检查没过、记录缺了几行）与 `scores`（对 agent 行为的打分：原样同意率、被拦率、返工次数、门禁一次通过率、按模型或按版本的比较）。
2. 经主 Agent 的报告（`/hourness` 若其结果进会话、M7 的 `hourness_report`、晨报周报的提醒）只用 `facts`；`scores` 只给命令行与 M8 以后的指标页。导出两个入口 `factsFor(...)`、`scoresFor(...)`，报告工具只能导入前者。
3. §9.5 的契约测试改为：报告工具与提醒的模块只导入 `factsFor`；L2 断言它的输出不含 `scores` 里的任何字段名与比率。
4. §14 的 M7 一条写明这条分界；人的负担与质量对照（M7 §3.12.3）中属于 `scores` 的部分不进主 Agent 的对话。若 M7 认为周报必须带比率给人，那是与宪章 §8 的冲突，按必须问人的方向性岔路以四行问人，不由本设计替人定。

#### F10 MEDIUM（挡路）：人自己发的消息一个数都不记，不合「能全记就全记下」

位置：`design.md:79`（§1.6）、`design.md:611`（§15 第 12 条）、`design.md:552`（§11 第 6 条）。

问题：人的原话是「指标能全记就全记下」。人发了几条消息、每条多少字、带了几个附件，是系统看得到的数，也是「人的负担」最直接的一项。§1.6 以「需求里没有」与「事件形状没有核实」排除它。形状是可以核实的：`user/message` 由 agent-loop:1069–1072 追加，数据是消息本身，M3 附录 0.4 第 1087 行已核过它的 `source`（api-session-controller:3224–3229）。

改法：加种类 `said`：`{sid, units, attachments, source}`，`units` 是这条消息文本块的 `textUnits`，`attachments` 是附件块数，`source` 取消息 `source.kind`。算作人说的只有：`source.kind` 为 `user`，且会话头没有 `origin: 'subagent'`（父 agent 交给子 agent 的首条提示也带 `source: {kind: 'user'}`，subagent:1459–1460）；harness 注入的提醒、循环板的投递、M7 的通知按各自的 `source` 计到别的数里。文字本身不记。§1.6 那一条、§15 第 12 条与 §11 第 6 条删去；验收第 1 条的探针场景核对 `said` 的条数等于人发的消息数。

#### F11 MEDIUM（挡路）：第 9 步动派遣决策流水却不做独立评审，且与 M3、M7、M4 的同文件改动冲突

位置：`design.md:574`（§12 第 9 步，「独立评审：否」）、`design.md:588`（§14 M7「M7 不再接手它」）。

问题：

- `docs/DEVELOPMENT.md` §1.1（第 27 行）：独立评审给「图引擎的权限与审计（`src/graph/engine.ts`、违规与决策流水）」做。第 9 步删 `src/workflow/index.ts` 与 `decisions.ts`、停写 `decisions.jsonl`，是对决策流水的改动，按人定的分级要独立评审。
- M3 附录 0.4 第 10 步（第 904 行起）也删 `src/workflow/decisions.ts`，并「改决策流水的记录格式」（标了独立评审）；M7 0.4 E4 改 `src/workflow/index.ts` 的 `DISPATCH_TOOLS`（第 153、1372 行）、P2 改 `src/workflow/morning-report.ts`（第 152、1385 行）；M4 0.3 的 G1、G2、G4、E4 改 `src/workflow/morning-report.ts` 四处（第 1124 行）。本设计第 9 步把这些文件删掉或搬到 `src/report/`，§12 的先后与 §14 都没有写这些冲突。

改法：第 9 步「独立评审」改为「是：决策流水（`DEVELOPMENT.md` §1.1）」。§12 先后一行加：第 9 步排在 M3 第 10 步、M7 E4 与 P2、M4 G1–E4 都合入之后；谁先删 `decisions.ts` 由先合入的一方做，后到的一方只删引用。§14 的 M3、M7、M4 各加一句：`morning-report.ts` 在第 9 步移到 `src/report/`，此后的改动改那里。

#### F12 NIT：结束原因与问题结局的枚举是闭合的，rc.3 的是可扩展的

位置：`design.md:191`（`llm.fin`）、`design.md:197`（`answer.end`）。

问题：`FinishReasonMap` 注明「Merge-extensible so adapters can surface provider-specific reasons」（types.d.ts:127–149）。一个适配器的新原因会让整条 `llm` 被拒收，验收第 1 条「恰好一条」就不成立。问题请求另有计时的一路：超时返回 `{pending: true, callId}`（user-questions:603–643，`ASK_TIMED_OUT`），`end` 里没有它。

改法：`fin` 加 `other`，不认识的 `reason.kind` 写 `other`；`end` 加 `timed-out`，超时那一次写它，之后接上的回答另记一条 `answer`。

#### F13 NIT：一步的归属有直接的接缝，不必靠「pre-step 之后第一次调用」推断

位置：`design.md:209`（§4.3「一步」）、`design.md:548`（§11 第 2 条）。

问题与改法：`agent/request` 瀑布（agent-loop:1191–1194）在每次模型请求之前给出 `{turn, step, signal}`，经 `agentEvents` 合入 `agent`（agent:242–271），返回值就是这次请求的 provider 与模型。按 agent id 记下最近一次 `agent/request` 的 `(turn, step)`，下一次带同一 `sessionId`、不带 `purpose` 的 `llm/stream` 就属于这一步；§11 第 2 条可以删去。`agent/request-error`（agent-loop:1136）可以另给请求重试的次数，正好是节点要的「失败与重试」。

#### F14 NIT：§11 有两条现在就能核实，拒绝的分类可以不靠进程内配对

位置：`design.md:550`（§11 第 4 条）、`design.md:558`（§11 第 12 条）、`design.md:321`（工具结果的分类）。

- 第 4 条：审批结论只有 `allowed-once`、`rejected`、`cancelled` 三个值（user-approval:31–33、174–181）。`approval.outcome` 写成这三个值的枚举；`declined` 取 `rejected` 与 `cancelled`。
- 第 12 条：`exec.callId` 就是模型输出里工具调用块的 `block.id`（agent-loop:509–516），与 `tool/call` 的 `callId`（agent-loop:685）相同。根调用的配对成立；子调用（`run_code` 内部）带 `rootCallId`（tools:3227），本来就不记。
- 分类：`tools/pre-execute` 的拒绝可以带 `info`，它原样进 `tool/result` 的 `error`（tools:3333–3348，agent-loop:701）。guard 与图文件门禁在拒绝时放 `{rule, key}`（不含文字），`tool` 事件就能从结果本身判 `denied`，宿主重启后补回的结果也一样；进程内找同一 `call` 的 `rule` 事件作为退路。

#### F15 NIT：行名与包里的写法不一致

位置：`design.md:12`、`design.md:554`（§11 第 8 条）、`design.md:574`。

问题与改法：`packages/hourness/cordis.patch.yml` 第 19–56 行的行名都是 `dsh-hourness/<行>`；本设计写 `glm-hourness/metrics` 与 `glm-hourness/workflow`。新行写 `dsh-hourness/metrics`。第 9 步的 L3 预检要用用户 profile 里实际出现的覆盖键（只读、不改 `~/.dsh`），两种写法都出现时两种都放进覆盖层。

#### F16 NIT：路径散列「看不出是哪个文件」不成立

位置：`design.md:213`（§4.3 `target`）。

问题与改法：不加盐的 SHA-256 前 12 位，对项目里的文件列表逐个算一遍就能还原。路径不是秘密，问题在说法与以后 `field-trial` 的导出。二选一写定：删去「看不出是哪个文件」一句；或者改用 HMAC-SHA-256，密钥是每个项目一份的随机 32 字节，放在 `<userDataHome>/metrics/keys/<项目键>`，不进流水与导出。

#### F17 NIT：队列满时「丢最早的一条」与「队首不丢」相抵

位置：`design.md:262`（第 4 步）、`design.md:267`（第 5 步失败一条）。

改法：写明满了时丢队首之后最早的一条（队首正在重试，不丢）；`gap.from`、`gap.to` 照丢掉的序号写。

#### F18 NIT：依据与引用的版本、小节过时

位置：`design.md:5`（依据）、`design.md:57`（验收第 3 条的 `/graph-apply`）、`design.md:365–367`（plain-ui §3.8、§3.9.1）。

改法：依据一节写明各设计的版本（见本评审「读过的版本」表），改引 M7 0.4 §3.16、循环板 0.4 §6.10、M6 0.4 §14.2、规则板 0.8 §10.5、M3 附录 0.4 §3.12、plain-ui 0.6 §11。plain-ui 0.6 删了 `/graph-apply`（§0、§9.1），验收第 3 条的写入来源改为「图工具与命令行」。

#### F19 NIT：读取的去重依赖目录列出的顺序

位置：`design.md:378`（§7.1 第 3 步「保留先读到的一条」）。

改法：第 1 步写明按文件名的字典序读；同一 `(w, n)` 重复时保留文件名在前、行号在前的一条。

#### F20 NIT：`metrics-files-only` 在规则板上怎样显示没有写明

位置：`design.md:160`、`design.md:572`（第 7 步）、`design.md:589`（§14 M4）。

问题与改法：`d-rules-visible` 要每条规则都在规则板上看得到。规则板 0.8 §10 的只读目录按 `<行>:<规则 id>` 列 guard 的规则（第 1396 行），M4 的 `src/guard/catalog.ts` 由规则板导入。§14 的 M4 一条写明「`guard:metrics-files-only` 加进 `src/guard/catalog.ts` 的 `GUARD_RULES`，规则板的目录随之列出，影子期标明只记录」；规则板一条加同一句。

#### F21 NIT：伪造的事件有一项便宜的核对没做

位置：`design.md:300`（§5.4 末句）、`design.md:505`（§9.5 第一行）。

问题与改法：主 Agent 可以用 shell 跑 Node 调写入器，写出字段合规的事件。完全防不住，但能便宜地报出：`verify` 对 `start.host` 为 `cli` 的写入者，若写了只有宿主才会写的种类（`llm`、`tool`、`turn`、`approval`、`command`、`said`），报「命令行写入者写了宿主事件」。

#### F22 NIT：M7 的 worker 走 spawn 后端时，事件由另一个进程写

位置：`design.md:146`（§3.3 第 1 条）、`design.md:553`、`design.md:556`（§11 第 7、10 条）。

问题与改法：M7 0.4 派 worker 用 `startActivation({provider: 'spawn', …})`（第 314、866 行），子 agent 的创建按 provider 分本地与外部两路（subagent:1437–1455 本地，1488–1501 外部的 `startExternal`）。外部那一路的模型调用与工具调用发生在子进程里，主进程的指标行看不到；子进程里的指标行要启用，写入者也是另一个 `w`。§11 加一条：spawn 后端的子进程加载同一套 bundle 且指标行启用，L3 派发场景核对 worker 的 `llm` 事件由另一个写入者写下、项目根相同；不成立时报告写明 worker 的数缺失。

### 已核实的假设

| 设计里的说法 | 证据 | 结论 |
| --- | --- | --- |
| `llm/stream` 是瀑布，参数是请求本身 | llm:2393–2395（`streamWithRegistration` 调 `ctx.waterfall(this, "llm/stream", options, …)`）；memory 行在同一接缝上：`src/memory/index.ts:54` | 成立 |
| 适配器抛错会变成 `finish` 块 | llm:2398–2410（`adapterFailureChunk`）；types.d.ts:430–432 | 成立；`next()` 抛错只是退路 |
| `GenerateOptions` 的 `provider`、`model`、`sessionId?`、`purpose?` | types.d.ts:506–548（541、547） | 成立 |
| 流块 `text-delta`、`reasoning-delta`、`tool-call-delta`、`block-end`、`usage`、`finish` | types.d.ts:434–464 | 成立 |
| `TokenUsage` 的六个计数 | types.d.ts:160–174 | 成立；`totalTokens`、缓存与推理三项可选 |
| 结束原因 `stop`、`tool-calls`、`max-tokens`、`aborted`、`error` | types.d.ts:131–149 | 成立，但可扩展（F12） |
| `agent/pre-step` 的载荷带 `agent`、`messages`、`turn`、`step`、`signal` | agent-loop:909–913（`messages`、`turn`、`step`、`signal`）；`agent` 由 `agentEvents` 合入，agent:242–271，agent-loop:777 | 成立 |
| `turn/start {turn}`、`turn/end {turn, reason}` | agent-loop:945、1029–1032；`reason` 取 `blocked`、`completed`、`aborted`、`error` 等，agent-loop:961、966、1013–1023 | 成立 |
| `tool/call {turn, step, callId, name, arguments}` | agent-loop:681–689 | 成立 |
| `tool/result {turn, step, message, error?, meta?}`，`message.toolCallId` 与 `isError` | agent-loop:691–706；llm:100–110；会话侧合成的取消结果 session:860–868 | 成立 |
| 重启后补回的结果也是 `tool/result` | agent-loop:984–987 | 成立 |
| 会话事件 `{type, seq, time, data}` 冻结，`time` 为 `Date.now()` | session:1517–1537 | 成立 |
| `session/event` 在 `append` 内同步通知，观察者出错被接住 | session:1579–1599（`invokeContainedSessionObservers`） | 成立；回调参数是 `(session, event)`，可直接读 `session.header` |
| `approval/asked {id, toolName, callId?, reason?}`、`approval/decided {id, outcome}` | user-approval:128–144 | 成立；`outcome` 取值见 F14 |
| `command/run {commandId, name, args?, source}`、`command/done {commandId, kind, text?}` | commands:333–346 | 成立；`kind` 为 `success` 或 `error`（commands:191、199） |
| 命令处理器拿到 `agent` | commands:379–385 | 成立 |
| `session/disposed` | session:1924–1936 | 成立 |
| `user-questions/request` 瀑布，请求带 `questions[]`、`agent?`、`signal?`，错误码 `ASK_ABORTED`、`NO_PROVIDER` 等 | user-questions:668–691 | 成立；另有 `ASK_TIMED_OUT` 一路（F12） |
| `prepend` 用 `unshift` 排在最外层 | cordis:335–339、371–379 | 成立 |
| `ctx.provide` 同名已在时抛错；`ctx.get` 在提供方的 fiber 不活动时返回 `undefined` | cordis:800–823、763–770 | 成立；`emitMetric` 每次 `ctx.get` 的做法与 `src/shared/pricing.ts:32` 相同 |
| `agents.get(id)` 返回活 agent；agent id 等于会话 id | agent:596–598、512–514 | 成立；`src/glm-llm/index.ts:78–82` 已用同一读法 |
| 会话头 `cwd`、`parentSession`、`origin`、`delegationDepth` | session:1816–1828、1048–1056 | 成立；`cwd` 可选 |
| 委派子会话的会话头沿用父会话的 `cwd` | subagent:345–356 | 成立 |
| `tools/pre-execute` 在执行之前，拒绝成为带 `isError` 的结果 | tools:3315–3349 | 成立 |
| 准备阶段的最终结果不经 `tools/post-execute` | tools:3211–3222（`final-result` 直接 `finishScheduledExecution`）、3460、3596 | 成立 |
| 计价服务 `charged(model, usage, atMs)`、`peak(atMs)`、`basis`、`plan` | `src/shared/pricing.ts:20–35` | 成立 |
| 图引擎在 `commit` 里 `writeNodes` | `src/graph/engine.ts:191`、`205` | 成立 |
| 派遣类工具是 `DISPATCH_TOOLS` 六个名字 | `src/workflow/index.ts:23` | 成立 |
| D1 属于必须问人的第 1 类 | `docs/ORCHESTRATION.md` §2.9.1（第 263–269 行） | 成立（问法见 F3） |

### 未核实或不成立的假设

| 设计里的说法 | 实际 | 处理 |
| --- | --- | --- |
| 兄弟设计会在下一次修订时改用本设计的事件词汇（§14） | 规则板 0.8、循环板 0.4、M7 0.4、M6 0.4、M3 附录 0.4 都已定了自己的事件表，并把信封交给本设计；它们不会改 | 不成立，F1 |
| M3 的卡片构造在 `userQuestions.ask` 之前调 `tagQuestion` | M3 附录 0.4 §3.9 删了 `cards.ts` 与对 `userQuestions` 的依赖 | 不成立，F2 |
| plain-ui §3.9.1 的计数拍板、`src/graph/inertia.ts`、§3.8 的卡片字段 | plain-ui 0.6 没有这几节，跟随率与先想后看取消 | 不成立，F2 |
| 问人能从 `ask.q` 与图上「开始等人」数全 | `confirm`、`release` 不写图（M3 附录 0.4 §3.4 第 525 行）；那条路上的事件在 M3 附录 0.4 §3.12 | 不成立，F2 |
| 规则板与本设计共用同一个 `projectRootOf` | 两边对「没有 `.git`」的处理不同（规则板 0.8 §7.3 第 1073 行） | 不成立，F4 |
| `record()` 不等 I/O 对一次性脚本也够用 | 进程在微任务之前退出时事件丢失 | 不成立，F4 |
| `user/message` 的形状没有核实（§11 第 6 条） | agent-loop:1069–1072；M3 附录 0.4 第 1087 行已核 `source` | 可以核实，F10 |
| §11 第 4 条（审批结论的取值） | `allowed-once`、`rejected`、`cancelled`（user-approval:31–33） | 已核实，F14 |
| §11 第 12 条（`exec.callId` 等于 `tool/call.callId`） | agent-loop:509–516 与 685 | 已核实，F14 |
| §11 第 2 条（一步的归属） | `agent/request` 给出 `(turn, step)`（agent-loop:1191–1194） | 有直接接缝，F13 |
| 以根上下文注册的 `user-questions/request` 监听收得到按 agent 作用域派发的请求（user-questions:681–684 用 `scopeTarget(agent, agent)`） | cordis:257–263 按 `Context.filter` 过滤监听，不是 `global` 的监听由作用域决定；guard 在 `tools/pre-execute`（同样按作用域派发，tools:3316–3317）上收得到，推断这里也成立 | 未核实，L3 探针核对（F2 之后这条只用于数 DSH 原生问题） |
| 子 agent 的 `llm/stream` 带 `sessionId`、`session/event` 对子会话触发（§11 第 5、7、10 条） | 本轮没有核到；spawn 后端在另一个进程（F22） | 未核实，照 §11 的办法核 |
| NTFS 上并发追加不交错（§11 第 1 条） | 本轮没有核到 | 未核实，按验收第 12 条 |

### D1 是否必须问人、问法是否合规

- 必须问人：是。写下每一步怎样算做完属于 `docs/ORCHESTRATION.md` §2.9.1 第 1 类，`design-context.md`「Division of labour」写明验收归人；`metrics` 节点的批准（「b直接做」）批的是做这件事，节点上 2026-10-29T16:43 的状态批注写明「人确认之后另派实现」，没有把验收的写法交给 agent。
- 问法：不合规。D1 与 `graph-ops.json` 是选项式（A、B，推荐放 B，带取决于与结论行），违背 `d-chat-not-cards`；措辞带「§12」「§1.4」等内部编号。改法与四行原文见 F3。
- 时机：等 F1、F2 改完验收草稿、一页放行稿写成之后，作为放行稿末尾的那一问。

### 小结

结论 CHANGES_REQUESTED：挡路 11 条（HIGH 2、MEDIUM 9），非挡路 11 条。

rc.3 的接缝本身核得扎实：§6.1 与 §10 引的 20 多处行号逐一对过，只有 F12 的可扩展枚举与 F13、F14 的更好接缝。挡路的问题集中在与别的设计和人定方向的对接：

- F1：闭合字段表收不下规则板 0.8、循环板 0.4、M7 0.4、M6 0.4、M3 附录 0.4 已定的 56 种事件，含接缝裁定要的 `rules.check`。
- F2：问人的计量建在已删的卡片与跟随率上，M3 附录 0.4 §3.12 为 `propose_to_human`、`record_human_answer` 定的两种事件没有收。
- F3：D1 必须问人，但写成了选项式。
- F4、F5：与规则板的项目根与写入口对不上；机器级事件没有去处。
- F6、F7：没有谁自动跑核对；整天文件被删发现不了，设计还允许主 Agent 删。
- F8：命令行复现不了旧报告。
- F9：经主 Agent 的报告让指标进了模型上下文。
- F10：人自己发的消息一个数都不记。
- F11：第 9 步动决策流水不做独立评审，并与 M3、M7、M4 的同文件改动冲突。

## 第 2 轮

评审对象：`design.md` 0.3（2026-10-31，对齐轮完成版，§0–§19，964 行）连同 `design-0.2.md`（0.2 原文）、`design-0.1.md`。评审人不是作者。0.2 在 §10 处断稿，对齐轮的第一次动手又在账号额度用完时断掉，本稿是第二次动手补完的，所以本轮除对照输入外，另核对断稿的处理。

依据：对齐轮简报 `.agents/tasks/align-rounds-2026-10-30/brief.md`（共同规则 1–9 与分支 D）、`design-context.md`、已放行的四份设计、`docs/CHARTER.md` 0.7、项目图节点与决定节点。挡路的判据同第 1 轮（`docs/DEVELOPMENT.md` §1.1；人定的方向与编排方的接缝裁定按需求计）。没有重跑作者的任何东西，没有运行测试或探针，没有改设计；核对用的是只读操作（文件散列、行数、`git diff --no-index`、读源码与兄弟设计）。

### 读过的版本

| 对象 | 文件（读时的修改时刻，本地时间） | 版本 | 与指标流水有关的小节 |
| --- | --- | --- | --- |
| 规则板 | `.agents/tasks/rules/design.md`（10-30 21:09） | 0.10（含六条跟进修订） | §10.5 事件表（15 种）、§10.7 指标流水一条、§7.3 项目根、§2.6/§1.4 第 12 条代码规则目录、§9.4 命令行 |
| 循环板 | `.agents/tasks/schedules/design.md`（10-30 17:09） | 0.6 | §2.1–§2.3 条目形状与动作、§3.1 服务、§3.2–§3.3、§6.4–§6.5 送达与 harness 动作、§6.10 事件表、§6.11、§9.1 |
| M3 | `.agents/tasks/m3/design-addendum.md`（10-30 21:10）与 `design.md` | 附录 0.5 | §2.4 持有者记录、§3.3–§3.5、§3.12 事件表、§3.13 `attach`、§3.14 |
| M7 | `.agents/tasks/m7/design.md`（10-31 04:46） | 0.6 | §3.12.3–§3.12.4、§3.16 事件表与对指标流水的说明、R4-N10 |
| 邻居（同一轮对齐中） | M4 `design.md` 0.5（02:53）、M6 0.5（03:43）、plain-ui 0.8（03:45）、接管 0.5（04:31） | — | M4 §3.2/§3.8/§3.11；M6 §14.2；plain-ui §5.6、§11、§14；接管 §2.4 依赖表、§7.4、§6.3 |
| 宪章 | `docs/CHARTER.md` | 0.7 | §3.2 第 3、5 条、§6、§8、§9 存放表 |
| 项目图 | `docs/graph/nodes/metrics.json`：26 条历史，末条 2026-10-30T21:02:33Z；决定节点 `d-rules-in-repo`、`d-memory-scope`、`d-main-agent-peak-exempt`、`d-boards-as-hooks`、`d-script-timeout`、`d-agent-examples`、`d-freeze-until-dogfood` | — | — |
| 源码 | main `e57e744`；`src/data/project-root.ts`、`src/graph/{engine,tools,run-control,cli,panel-row,store}.ts`、`src/shared/{peak-mode,pricing}.ts`、`src/memory/index.ts` | — | 作者读的是 `4dc369e`；其后 `src/` 只动了 `src/data/lock.ts` 与 `src/execute/`，与本设计无关 |
| rc.3 | `reference/dsh-desktop-0.2.1-rc.3/` | — | 抽查 `llm:2393`、`agent-loop:1136/1191`、`user-questions:668/681`、`session:1517`、`agent:596`，行号与说法都对得上 |

### 第 1 轮发现的处理

F1–F22 全部关闭。F1（兄弟事件进封闭表）、F2（问人走对话路径）、F4（共用 `projectOf` 与 `appendEvents`）、F5（0.3 取消机器级流水，只计数）、F6（后台自查与循环板默认条目）、F7（清单对账与 `prune`）、F8（`--basis`）、F9（`factsFor`/`scoresFor`）、F10（`said`）、F11（第 10 步独立评审）、F12–F22 的改法都在正文里，读过对应小节。F1、F3、F6、F9 的改法留下了新的缺口，见下面的 F25–F28，不算原发现未关。

### 断稿的处理核对（简报要求的一项）

- 0.2 原文保留：`design-0.2.md` 的 MD5 `9F4EC6D6…0190F80` 与文首所记一致，`design-0.1.md` 的 `7C74656E…0AE25EFDC` 也一致；`design-0.2.md` 共 613 行（按换行切），末行是 `%%NEXT%%`，即 0.2 在 §10 之后断稿的样子。
- `design.md` 对 0.2 的差别是新增 460 行、删去 108 行（`git diff --no-index`）。0.2 的标题除七个有意改名的（§3.5、§5.5 和五个兄弟种类表的版本号标题）外逐字保留；§4.5 与 §11–§19 是新增的。
- §10 之后补得完整：§11 有 13 项、§12 有 10 步和先后顺序、§13、§14 有八份设计、文档、M8 与 `field-trial` 的条目、§15 有 24 项、§16 有两件、§17 有 7 条、§18、§19 有三小节，文件以 §19.3 的最后一条结束。`%%NEXT%%` 只出现在第 3、958、963 行的叙述里，不是标记。没有半写的小节：没有「…」「待补」或断在表中间的行。
- 断稿的事实：作者说盘上草稿是 615 行、与 0.2 差 20 行新增 18 行删去、没有另存副本。草稿本身已被覆盖，查不了；能查的是数字是否自洽：613 + 20 − 18 = 615，成立。作者逐项列出的「判为完整保留」与「判为不完整、重做」两张清单（§19.3）与现稿对得上：文首版本说明已改成与实际一致，§0 的「待人定只有一件」已改成两件，`projectRootOf`、`kind: 'cwd'`、机器级流水、用户级账本在 §2–§10 里都没有残留（全文检索 `userDataHome`、`machine`、`账本`、`projectRootOf`、旧版本号，只剩 §5.2、§19 里说明改动的叙述）。
- 变更记录写明了发现了什么、怎样处理（§18 一行、§19.1 每处改动答哪一条、§19.3 草稿的状态）。读过没有改的小节（§1.3、§1.5、§4.3 除密钥外、§5.3、§6.1、§9.1、§10 前 19 行）里有一处旧引用没跟上，见 F32；这是 0.2 的行号，不是断稿的问题。

### 发现

#### F23 MEDIUM（挡路）：`graph` 事件的 `node`、`type`、`hi`、`rev` 是必填，写入失败和补录时没有这几个值

位置：`design.md:234`（§4.2 `graph` 行）、`design.md:64`（验收第 3 条）、`design.md:547`（§6.3）、`design.md:628`（§7.5 `backfill-graph`）。

问题：

- §4.2 的 `graph` 行里，只有 `relay?`、`from?`、`to?`、`err?`、`src?` 可选。缺必填字段的事件整条拒收（§4.4）。
- 同一行的触发条件包括「一次写入失败」，验收第 3 条要求「写入失败留一条带错误码的 `graph` 事件」，§6.3 要失败的返回路径各给一条。写入没成，就没有历史序号 `hi` 和新修订号 `rev`；因 `invalid`、`not_found` 失败时，引擎连目标节点的 `type` 甚至 `node` 都可能没有（`src/graph/engine.ts` 的失败结果只有 code、message、hint、field）。
- `backfill-graph` 从图历史补的条目同样没有 `rev`：历史条目只有 `at`、`actor`、`op`、`reason`、`from`、`to`。

后果：失败事件与补录事件按本设计自己的校验被整条拒收并计 `reject`，验收第 3 条的失败一支和 `backfill-graph` 都做不成。

改法：字段表不支持「有条件必填」，所以拆成两个种类。`graph`（成功与补录）：`node`、`type`、`op`、`hi`、`actor` 必填，`rev?` 可选（补录没有），其余同今天。`graph-fail`（失败）：`op?`、`actor`、`err`、`node?`、`field?`。验收第 3 条、第 5 条的种类清单、§4.5 与 §6.3 照拆法改。

#### F24 MEDIUM（挡路）：`observe` 是逐个调用点传的选项，M3、接管、M7 的写图调用点没有人负责，`verify` 会把它们的写入全报成缺失

位置：`design.md:549`（§6.3「引擎的写入方有三个」）、`design.md:64`（验收第 3 条）、`design.md:815`、`818`、`822`（§14 的 M7、M3、接管）、`design.md:625`（§7.5 `verify`）。

问题：

- 引擎的调用方不止那三个。M3 附录 0.5 §3.5 第 6 步：`record_human_answer` 在 `src/design/record.ts` 以 `llm` 身份写图。接管 0.5 §7.4：`bootstrap_apply` 的写入「直接调图引擎（`openEngine(dir).apply`），不经图工具，`record_human_answer` 走的是同一条路」。M7 0.6 的派发批注、计划正文、审查任务都以 `harness` 身份写图（§3.1.2 第 10 步、§3.7.1）。plain-ui 0.7 的那句话只是把 `/graph-apply` 从名单里换掉，没有说写入方就这三个。
- 这几处在 §6.3 的三行里都没有，M3、M7、接管的设计里也没有「传 `observe`」这一条；本设计 §14 对 M3 写「没有必须改的」，对接管只答了事件种类。
- 接管 0.5 §2.4 的依赖表写「图的写入由引擎的 `observe` 记（metrics §6.3）」，是按引擎一处自动记来理解的；本设计的做法是调用点各传一个选项，两边对不上。
- 验收第 3 条的写死清单只会在这些调用点合入时让测试失败，没有说失败后谁改、怎样改。不改就合入时，`verify` 的「图历史里有而流水里没有的条目」对每一次放行、每一次接管写入都报缺失，这正是最想量的一类数据（人的拍板）。

后果：`graph` 事件对人的拍板与派发批注系统性地缺，`verify` 持续报错；要靠兄弟设计各自改，而它们已放行或在对齐中，没有一条请求记在图上。

改法（二选一，推荐 a）：

a. 引擎模块导出 `setEngineObserver(fn): () => void`（进程内一个集合）。指标行激活时登记、卸载时撤销，命令行进程自己登记；`openEngine` 的 `apply` 对所有登记的观察者通知，目录取引擎自己的 `dir`。M3、M7、接管都不用改。验收第 3 条的静态检查改为「`writeNodes` 只被 `engine.ts` 导入」加「`apply` 的每个返回路径都经 `notify`」，不再维护调用点清单。
b. 保留 `EngineOptions.observe`，在 §14 的 M3、M7、接管三条和 §17 对应批注里加上「每个 `openEngine(...).apply` 调用点传 `observe`」（等 dogfood 之后），验收第 3 条的清单加 `src/design/record.ts`、接管的 apply、M7 的 harness 写入。

#### F25 MEDIUM（挡路）：每天自查条目的「不叫醒」与循环板 0.6 的送达规则相反，结局名也不对

位置：`design.md:565–566`（§6.4）、`design.md:82`（验收第 20 条）、`design.md:848`（§15 第 20 条）、`design.md:19`（§0）、`design.md:816`（§14 对循环板的请求 ③）。

问题：

- 循环板 0.6 §6.5：harness 动作返回 `done` 且带 `tell` 时，`tell` 交给主 Agent，`wake` 取条目 `tell.wake`，「条目没有 `tell` 时为真」；§6.4 第 3 步里，`wake` 为真、主 Agent 空闲且没有生效的 goal 时走 `followup`，即开一个回合。本设计的条目没有 `tell` 字段，所以有发现时会叫醒主 Agent，而 §6.4 与 §15 第 20 条写的是「有发现才告诉主 Agent，不叫醒」。
- 反过来，给条目加了 `tell`，`done` 且不带 `tell` 时循环板会交条目的 `tell`（每天一条），所以「没发现」不能返回 `done`。
- 结局名：`done` 加 `tell` 的结局是 `delivered`（§6.5 第 3 步），§6.4 写的 `reported` 是脚本跑完并已交给主 Agent 的结局。
- 循环板 0.6 §2.3 末条写「出厂的条目里没有时间触发的 harness 动作」，其验收第 1 条按 M7 10、M4 2、GLM 4、循环行 4 项数；这个条目是第一个这样的出厂条目，也多一项。请求 ③ 只提了「文档补一行」。

后果：实现者对「有发现时叫不叫醒」只能猜；验收第 20 条只检查 `done` 带不带 `tell`，测不出差别。

改法：先选一种行为写死。要不叫醒（本稿原意）：条目 `action: {kind: 'harness', action: 'metrics.selfcheck', tell: {text: '指标记录自查有发现，详见 /hourness 的覆盖行', wake: false}}`；没有发现返回 `{outcome: 'skipped', reason: 'clean'}`（循环板记 `skipped`，不发消息）；有发现返回 `{outcome: 'done'}`（循环板交条目的 `tell`，用 `inject`，结局 `delivered`）。要叫醒就删掉「不叫醒」，写「有发现时叫醒主 Agent 一次」。验收第 20 条、§0、§6.4、§15 第 20 条同改；请求 ③ 加一句：这是第一个时间触发的出厂 harness 条目，页面的条目数多一项。

#### F26 MEDIUM（挡路）：M7 的报告改读本流水既没有记成请求，改读的那一步也没有定义，验收第 11 条挂着一个不存在的步

位置：`design.md:73`（验收第 11 条第二段）、`design.md:113`（§2 表）、`design.md:611`（§7.3 第二条）、`design.md:795`（§12 第 5 步）、`design.md:815`（§14 M7）、`design.md:887`（§17 `m7`）。

问题：

- M7 0.6 §3.12.4 与 §3.16：M7 的晨报与周报从图、检查与前进的记录、违规流水和用量流水算，「输入来源同晨报」；§3.16 只要求指标流水做好后核对表里每类事件在不在，没有写「报告改读流水」。
- 本设计三处把「M7 的报告改读流水」当成已定：验收第 11 条第二段（「M7 的报告层改读本流水之前……改读的那一步不合入」）、§2 表（「M7 §3.12 的计数在本流水到位后改从这些事件算」）、§7.3（「M7 的四答晨报……事实由 `factsFor` 算」）。
- §12 的十步里没有「M7 的报告改读」：第 5 步改的是 `/hourness` 与 `src/workflow/morning-report.ts`，不是 M7 的 `src/report/weekly.ts`。§14 与 §17 给 M7 的四条（①–④）里也没有它。

后果：「M7 的验收不再依赖流水」只做到一半：M7 不依赖了，但本设计又在没有人负责的地方让 M7 的报告将来依赖它；夹具比对（事实相同才合入）没有对应的合入步，等于没有门。

改法：二选一。a. 写成对 M7 的请求：§14 M7 一条与 §17 的 `m7` 批注加「指标流水默认启用之后，M7 的晨报与 `weeklyReport` 的『事实』部分改读 `factsFor`（窗口与 `--basis` 同本设计），改读前过本设计验收第 11 条的夹具比对；等 dogfood 之后按 `d-freeze-until-dogfood` 办」，§12 在第 6 步之后加一步「M7 的报告改读」，写明归 M7 的实施、本设计只提供 `factsFor` 与夹具。b. 删去三处的「改读」，写成「M7 的报告继续从原始记录算，`factsFor` 只给 `/hourness`」，验收第 11 条第二段改为「夹具比对只核对种类表够不够算出同样的数，不绑合入」。

#### F27 MEDIUM（挡路）：节点上最新一条批注与兄弟设计现行稿里的字段没有收进封闭表

位置：`design.md:7`、`design.md:9`（依据一节：「25 条历史」「接管 0.4」）、`design.md:16`（§0）、`design.md:389`（`bootstrap.trial`）、`design.md:370`（`glm.peak-reminder`）、`design.md:822`（§14 接管）。

问题：

- 节点 `metrics` 现有 26 条历史，最后一条是 2026-10-30T21:02:33Z（接管 0.5 对本设计的依赖）：接管要交的是「命令 id、结果、耗时、envKey」，「种类与字段请指标设计定，定之前接管不交」。本设计读到 11:58Z 的 25 条，接管写成 0.4。接管现行稿是 0.5：其 `trial` 流水记录是 `round`、`commandId`、`outcome`、`ms?`、`log?`、`envKey`，`outcome` 取 `passed`、`failed`、`denied`、`confinement-limited`、`timed-out`、`sandbox-broken`、`not-run`、`running`。
- 本设计的 `bootstrap.trial` 是 `cmd`（命令第一个词）、`exit?`、`ms`、`end`（`done`、`timeout`、`refused`、`error`）：没有 `commandId`、没有 `envKey`，结局取值与接管的 `outcome` 对不上。「第一个词」是为任意 shell 命令文字设的隐私规则；接管给的 `commandId` 本来就是清单里的 id，不是命令文字。
- M6 0.5 §14.2 的 `glm.peak-reminder` 还带「写了上限时的数」（`peakWorkerCap`），本设计的 `window`、`mode`、`note?` 没有它。封闭表遇到表外的键整条拒收（§4.4），少做档高峰里的这条事件会被拒。M6 0.5 的文件修改于 03:43，晚于文首所记的读取时刻（02:00 前后）。

后果：与第 1 轮 F1 同一类缺口（兄弟已定的字段进不了封闭表），范围小；接管因此开不了工，M6 的事件会被拒。

改法：`bootstrap.trial` 改为 `cmdId:id`、`round?:int`、`outcome:id`（取值留在接管设计里）、`exit?:int`、`ms?:int`、`envKey:id`，删去 `cmd`；`glm.peak-reminder` 加 `cap?:int`；依据一节、§0、§14 的接管写 0.5，历史条数写 26 并答 21:02Z 那一条；§12 第 1 步「核一遍」的记录要点加上「兄弟字段多于表」这一类。

#### F28 MEDIUM（挡路）：§16 两件事的四行超过 M3 的一行上限，加粗超过 12 个码点，照写会被 `propose_to_human` 拒绝

位置：`design.md:858–880`（§16 ①、②）。

问题：M3 附录 0.5 §3.3 的 `proposalLineRefusal`：推荐、疑问、不做三行去掉加粗记号后至多 40 个码点，背景至多 60（`PLAIN_LIMITS.background`），加粗恰好一处且 2–12 个码点。简报共同规则 6 要求「一句短话」。数下来超限的有：

| 位置 | 码点 | 上限 |
| --- | --- | --- |
| ① 推荐 | 47 | 40 |
| ① 疑问的加粗「事件种类要和别的设计一一对上」 | 14 | 12 |
| ② 推荐 | 70 | 40 |
| ② 疑问 | 47 | 40 |
| ② 疑问的加粗「主 Agent 看到这四个数后会不会拿它当目标追」 | 24 | 12 |

后果：§16 写明「主 Agent 在对话里照这个样子问」，照写的 `propose_to_human` 返回 `invalid`；放行稿末尾那一问照抄也一样。

改法（已数过码点，括号内是去掉加粗记号后的码点数、加粗的码点数）：

- ① 背景：指标记录是**系统自己写的数据**，共分十步做，每步怎样算做完只有你能定。（33，8）
- ① 推荐：先照设计里的**20 条检查**写，以后要改再问你。（22，6）
- ① 疑问：最没把握的是**种类名要对齐**，对方改名这里就得跟着改。（25，6）
- ① 不做：不让你**逐条审读**这 20 条，省得你读一大段。（22，4）
- ② 背景：宪章写着**指标不进模型上下文**，可派活设计让主 Agent 在周报里转述比率。（37，9）
- ② 推荐：只让周报里的**四个减负数字**经主 Agent 转述，其余比率走命令行。（33，6）
- ② 疑问：最没把握的是**会不会被当目标追**，设计阶段验证不了。（24，8）
- ② 不做：不把**按模型、按版本的比较**交给主 Agent，它们最像分数。（29，10）

四个数具体是哪四个，放进一页放行稿的正文，不放进四行。§16 开头一段加一句「每行长度按 M3 的 `proposalLineRefusal`」。

#### F29 NIT：持有者记录的位置写错了

位置：`design.md:256`（§4.2 M3 一节「持有者记录自己在项目的 `.llm/`（M3 附录 0.5）」）。

问题：M3 附录 0.5 §2.4 把记录放在 `<userHome>/main-agent/<sha256 前 16 位>.json`，§10 与首页版本说明都写「搬进项目的 `.llm/` 留给对齐轮」；接管 0.5 §2.4 的依赖表和 `src/graph/main-agent-holder.ts` 也是用户级。本设计不读这个文件（角色由 `design.holder-moved` 事件得到），所以没有后果，但这句话说的是已放行设计的现状，不对。

改法：改成「持有者记录的位置照 M3 对齐轮的结果，今天在用户级目录；本设计只读 `design.holder-moved` 事件，不读这个文件」。

#### F30 NIT：`panel-row.ts` 和它的行不会被删

位置：`design.md:557`（§6.3）、`design.md:821`（§14 plain-ui）。

问题：`src/graph/panel-row.ts` 同时注册 `/graph-apply`（:175）与 `/graph-run`（:182）。plain-ui 0.8 只删 `/graph-apply` 与行健康里的那一半，`/graph-run` 与现场投影留着；文件与行 `glm-hourness/graph-panel` 都在，消失的只是 `openEngine(dir)` 那个调用点（:87）。§6.3「连同那一行删掉」与 §14「它实现时删掉 `panel-row.ts`」都说过头了。

改法：两处改成「删去 `/graph-apply` 分支和它的调用点，调用点清单少一处」。

#### F31 NIT：信封 `w` 的类型与补录写入者的 id 不合

位置：`design.md:200`（§4.1）、`design.md:628`（§7.5）、`design.md:480`（§5.6 退路文件名）、`design.md:630`（§7.5 `--basis` 的正则）。

问题：`w` 的类型写「8 位十六进制」，补录用 `bf-<提交前 7 位>`，按自己的校验补录事件会被拒；退路的文件名正则 `-[0-9a-f]{8}` 与 `--basis` 的正则也不收 `bf-`。

改法：`w` 类型改为 id，取值 `^[0-9a-f]{8}$` 或 `^bf-[0-9a-f]{7}$`，两处正则同改。

#### F32 NIT：计价服务的行号过时

位置：`design.md:501`（§6.1 末行）、`design.md:525`（§6.2）。

问题：写的是 `src/shared/pricing.ts:20–35` 与 `:32`。规则板最小一片加进 `nextPeakChange` 之后，`ctx.get(PRICING_SERVICE)` 在第 51 行，`pricingService` 在 50–56 行，`UsagePricing` 在 18–26 行。

改法：改引符号名 `pricingService`、`UsagePricing`，不写行号。

#### F33 NIT：循环板合入后读流水的办法没写

位置：`design.md:535`（§6.2 循环板一行）、`design.md:796`（§12 第 6 步）。

问题：循环板 0.6 §6.10 末段与 §6.11：页面「上次」的缓存与 `state.json` 坏了要「从运行记录（指标流水合入后从它）补回」。合入之后循环板要读 `.llm/metrics/` 里自己的 `loop-fired`、`loop-done`（28 天窗口），本设计只写了它怎样写。

改法：§6.2 与 §12 第 6 步写明：循环板导入 `readLog(root, {from, to})` 取自己的种类，不另写解析；28 天按 §5.3 的估计读 15–40 MB，可接受。

#### F34 NIT：库写入口与宿主写入者在同一个进程里并存没有写

位置：`design.md:443`（§5.2）、`design.md:478`（§5.6「每个进程是一个写入者」）。

问题：规则板 0.10 §10.7 要库写入口「能与宿主里的服务在同一个进程里并存」（规则行禁用而循环行在宿主里直接导入 `check.ts` 时，`metrics.ts` 没有宿主写者，只能走库写入口）。§5.2 只讲 DSH 之外，§5.6 说每个进程一个写入者。

改法：§5.2 加一句「宿主进程里也可以同时有一个 `appendEvents` 的短命写入者，两个写入者各有 `w` 与链，互不影响」，§5.6 的「每个进程」改「每个写入者」。

#### F35 NIT：实施步骤里的验收编号放错

位置：`design.md:791–794`（§12 第 1、2、3、4 步）。

问题：第 1 步与第 4 步都列验收第 8 条，确定性的计算在第 4 步；第 2 步列验收第 2 条，但 `rule` 与 `ref` 要第 3 步才交。

改法：第 1 步去掉 8；第 2 步的 2 只留 `tool` 一半，`rule` 一半移到第 3 步。

#### F36 NIT：`metrics-files-only` 的文件工具路径漏了清单和密钥

位置：`design.md:178`（§3.4）。

问题：文件工具的判法只写 `<root>/.llm/metrics/` 之下；清单 `.llm/metrics-manifest.jsonl` 和密钥 `.llm/metrics-key` 在 `metrics/` 之外，清单被删恰是 §5.5 要发现的事。shell 判法的 `.llm/metrics` 子串碰巧覆盖，文件工具这一支没有。

改法：路径集合写成 `<root>/.llm/metrics/**`、`<root>/.llm/metrics-manifest.jsonl`、`<root>/.llm/metrics-key`。

#### F37 NIT：② 的背景没提宪章已经要求报这四个数

位置：`design.md:870–880`（§16 ②）。

问题：宪章 0.7 §3.2 第 5 条已写明每周被问几次、每次读多少字、拍板等多久、返工几次这四个数「晨报每周报」，与 §8「指标不注入模型上下文」互相牵着。② 的背景只引了 §8，人会以为推荐的四个数是新开的口子。

改法：放行稿正文补一句「宪章 3.2 已要求每周报这四个数」，四行不动（四行已受 F28 的长度限制）。

#### F38 NIT：「反复超时」的单子算了两次

位置：`design.md:596`（§7.2「规则板与循环板的执行」一行）。

问题：同一行既说「4 周没触发」的单子由两块板的服务算、不重算，又自己列「7 天里超时 3 次以上」的单子；循环板 0.6 §6.11 的 `timeoutEntries` 已给这张单子，M7 周报读它。两处各算一次会出两个数。

改法：事实行只列超时次数；单子以 `timeoutEntries` 与规则板的服务为准，流水里的数只用来对账。

#### F39 NIT：`graph-ops-align.json` 由谁建没有落实

位置：`design.md:884`（§17）。

问题：§17 写「本稿的作者不写这份文件，由评审通过之后的步骤按清单建」；简报共同规则 9 要求每个分支写 `graph-ops-align.json`。文件现在不存在，评审通过时那一步必须真的建它，否则分支以缺文件收场。

改法：§17 写明由哪一步建，建好后交编排者应用。

### 已核实的假设

| 设计里的说法 | 依据 | 结论 |
| --- | --- | --- |
| 兄弟事件的个数：规则板 15、循环板 11、M7 23（21 加 2）、M6 4、M3 8 | 规则板 §10.5 表、循环板 §6.10 表、M7 §3.16 表、M6 §14.2 表、M3 §3.12 表，逐个数过 | 成立 |
| 循环板 11 种与 `rules.check` 的字段名逐字取自兄弟设计 | 循环板 §6.10、规则板 §10.5 | 成立 |
| `projectOf`、`gitDirOf`、`ensureIgnored` 的返回与行为；仓库唯一的项目根模块；`projectOf` 对用户主目录与盘符根返回 `undefined`、非 git 目录要有 `.llm` | `src/data/project-root.ts` | 成立 |
| `writeNodes` 只在 `engine.ts` 的 `commit` 里调（:205）；`openEngine(` 的今天调用点是 `tools.ts`、`run-control.ts`、`cli.ts`、`panel-row.ts` | `src/graph/*` | 成立（写入方不止这些，见 F24） |
| `/graph-run` 以 `human` 写图；命令行以 `llm` 写图；图工具以 `llm` 写图 | `run-control.ts:134–135`、`cli.ts:96`、`tools.ts:323` | 成立 |
| 高峰档位 `inform`、`reduce`、`stop`；服务名 `glmHournessPeakMode`；注释写明主 Agent 不被档位拦住 | `src/shared/peak-mode.ts` | 成立 |
| 用户级只留凭证、关于人的记忆、整个账号的额度与用量、插件配置；指标流水在项目的 `.llm/`；代码里的新门禁照旧先影子 | `docs/CHARTER.md` 0.7 §9、§6 | 成立 |
| 循环板条目形状（`when` 加 `action`，`title` 至多 60、`why` 至多 150、`basis` 至多 80）、`daily` 触发、`contribute` 收 `harness` 动作、名字空间 `metrics` 未被占、`HarnessResult` 的三种形状、`LoopEventRecord.project` | 循环板 §2.1–§2.3、§3.1–§3.3 | 成立；`run` 对时间触发条目是否给出项目由循环板代码决定，§11 第 11 项已列未核实 |
| M7 0.6 的验收不再要求事件已写进流水；`metrics-gaps.jsonl` 一段写明「流水自带缓冲与重放时只改 `src/execute/metrics.ts`」 | M7 §3.16 | 成立 |
| M7 周报「数字由 harness 算，模型只转述」，与宪章 §8 冲突已被 R4-N10 指为方向性岔路 | M7 §3.12.4、R4-N10 | 成立 |
| 规则板的库写入口按 §7.3 项目根定位；`rules.check` 由 `checkCall` 写、`gateOnRules` 不另写 | 规则板 §10.5、§9.4 | 成立 |
| M4 的 `GUARD_RULES` 含 `metrics-files-only`（行 `metrics`）；`recordKey`、`FollowupRecord`、`RequestRecord`、`GrantRecord`、`GrantVoidRecord`；`emitGuardMetric` 在 `src/guard/metrics.ts` | M4 §3.2、§3.8、§3.11 | 成立 |
| 0.2 原文与 0.1 原文未被改动；0.2 在 §10 后断稿 | 两个 MD5、末行 `%%NEXT%%` | 成立 |
| §19.3 的草稿数字自洽 | 613 + 20 − 18 = 615 | 成立（草稿本身已被覆盖，无法直接核） |
| rc.3 接缝与行号（抽查） | 见上表「rc.3」一行 | 成立 |
| `bootstrap.trial` 的隐私口径（命令第一个词）适用 | 接管 0.5 §6.3：`commandId` 是清单里的 id | 不成立，F27 |

### 未核实或不成立的假设

| 设计里的说法 | 实际 | 处理 |
| --- | --- | --- |
| 引擎的写入方是三个，`observe` 逐个调用点传 | M3 的 `record_human_answer`、接管的 `bootstrap_apply`、M7 的 `harness` 写入都直接调引擎 | 不成立，F24 |
| `graph` 事件的 `hi`、`rev`、`node`、`type` 总有值 | 写入失败与补录时没有 | 不成立，F23 |
| 有发现时自查条目「不叫醒」；结局 `reported` | 循环板 0.6 §6.5：无 `tell` 的条目 `wake` 为真；结局 `delivered` | 不成立，F25 |
| M7 的报告将来改读本流水 | M7 0.6 没有这一步，本设计也没有定义 | 无依据，F26 |
| 节点历史 25 条、接管 0.4、M6 的 `glm.peak-reminder` 三个字段 | 26 条、接管 0.5、M6 0.5 多 `peakWorkerCap` | 不成立，F27 |
| 持有者记录自己在项目的 `.llm/`（M3 附录 0.5） | M3 附录 0.5 仍在 `<userHome>/main-agent/` | 不成立，F29 |
| plain-ui 实现时删掉 `panel-row.ts` 与它的行 | 只删 `/graph-apply` 分支 | 不成立，F30 |
| `pricing.ts:20–35`、`:32` | 现在是 18–26、50–56 | 不成立，F32 |
| 循环板在 `run` 里能拿到时间触发条目的项目（§11 第 11 项） | 循环板代码没建 | 未核实，设计已列，实现时核 |
| 多进程各一次 `appendFile` 不交错（§11 第 1 项） | 没有运行验证 | 未核实，设计已列，验收第 12 条核 |

### 简报分支 D 的要点

| 要点 | 结论 |
| --- | --- |
| 循环板 0.6 记在节点上的输入变化（`loop-done` 的 `refused`/`not-in-checkout`/`unfinished`、`loop-entry` 的 `repin`/`external`/`adopt`、`loop-read` 进项目、合入后写 `.llm/metrics/`） | 已收进 §4.2、§4.5、§6.2、§3.5；字段名逐字取自循环板。每天自查条目的送达规则没对上，F25；循环板读流水的办法没写，F33 |
| 规则板 0.10 记在节点上的输入变化（4 种新事件、库写入口按项目根找 `.llm/`） | 已收进 §4.5、§5.2；并存没写，F34 |
| `d-rules-in-repo`：指标流水在项目的 `.llm/` | 成立：流水、清单、密钥都在项目 `.llm/`，用户级目录没有指标文件，验收第 18 条核；机器级流水取消。持有者记录的现状写错，F29 |
| 引擎的写入方是图工具、命令行与人的 `/graph-run` | 按 plain-ui 0.7 写了三个入口；但引擎的调用方不止这三个，观察者的挂法有缺口，F24；失败事件写不成，F23 |
| M7 0.6 的验收不再依赖流水 | §0、§1.4 第 5 条、§14 都写了；报告改读的归属没落实，F26 |
| `d-main-agent-peak-exempt` | 指标行的写入与自查不受任何一档管，验收第 19 条核；`llm.peak?` 只是测量值。成立 |
| `d-boards-as-hooks`、`d-script-timeout` | 脚本的运行、超时、晚到的拦下进了 `rules.script`、`rules.late-verdict`、`loop-done` 的 `unfinished`，周报事实行有对应。成立（F38 是重复计算的小问题） |
| `d-agent-examples` | 本流水没有给主 Agent 的工具，没有要写的示范；§16 的两件是问人，不是示范。成立 |
| 对已放行设计的请求只写成批注 | §14 与 §17 照做；漏了 M3、M7、接管的 `observe` 与 M7 的报告改读（F24、F26） |
| 待人定事项的格式（简报规则 6） | 两件、四行、问题放最后、无选项；行长与加粗超限，F28 |
| 断稿的处理 | 见「断稿的处理核对」：0.2 原文保留，§10 之后补完整，无半写小节，变更记录写明了发现与处理 |

### 小结

结论 CHANGES_REQUESTED：挡路 6 条（HIGH 0、MEDIUM 6：F23–F28），非挡路 11 条（F29–F39）。挡路的趋势：第 1 轮 11 条（HIGH 2、MEDIUM 9），第 2 轮 6 条（HIGH 0、MEDIUM 6）。

断稿的补完是扎实的：0.2 原文完整保留，§10 之后的 §11–§19 全部写成，没有半写的小节，变更记录交代了草稿的状态；第 1 轮 22 条发现全部关闭。余下的挡路问题都出在与邻居的对接上，没有一条是结构性的：

- F23：`graph` 事件的必填字段在写入失败与补录时没有值，验收第 3 条的失败一支做不成。
- F24：引擎的观察者逐个调用点传，M3、接管、M7 的写图没有人负责，`verify` 会持续报缺失。
- F25：每天自查条目的送达方式与循环板 0.6 相反。
- F26：M7 的报告改读流水既无请求也无步骤，验收第 11 条挂着一个不存在的步。
- F27：节点最新一条批注与 M6、接管现行稿里的字段没有收进封闭表。
- F28：§16 两件事的四行超过 M3 的行长与加粗上限。

每条都有具体改法，F28 附了数过码点的重写。按简报共同规则 4，下一步是一次修改加一轮评审。

## 第 3 轮

评审对象：`design.md` 0.4（2026-10-31 16:11 修改，1079 行，MD5 `8D95556421F5838EE7AA6EDF345E01EE`），连同同目录的 `design-0.4-draft.md`（上一位作者留下的草稿，12:44 修改，985 行，MD5 `E07882318FCC9404B8C65D6AD3780711`）和 `design-0.3.md`（964 行，MD5 `B2F9F30C811AE1917FE0B03D88FACB23`）。评审人不是作者。这一稿做三件事：处理第 2 轮的 F23–F39；按作者已离开的草稿处理（保留做对的、补上缺的、在修订记录里写明草稿的内容）；折进人 2026-10-31 的五条决定。

依据：简报 `.agents/tasks/align-rounds-2026-10-30/brief.md` 共同规则 1–9、本轮任务给出的五条决定原话、项目图上的四个决定节点与 `metrics`、`user-journey` 两个节点的批注、已放行的四份设计、同一轮对齐里的邻居设计、`docs/CHARTER.md` 0.8、`docs/DEVELOPMENT.md`。挡路的判据同前两轮（`docs/DEVELOPMENT.md` §1.1；人定的方向与编排方的接缝裁定按需求计）。没有改设计，没有重跑作者的任何东西；核对用的是只读操作（文件散列、行数与 `git diff --no-index --numstat`、字符串比对、读源码与兄弟设计、数码点）。

### 读过的版本

| 对象 | 文件（读时的修改时刻，本地时间） | 版本 | 与指标流水有关的小节 |
| --- | --- | --- | --- |
| 本设计 | `design.md`（10-31 16:11）；`design-0.4-draft.md`（12:44）；`design-0.3.md` | 0.4 | 全文读过；§4.2、§4.5、§6.3、§6.4、§7.2、§11、§12、§14、§16、§17、§18、§19.4、§19.5 逐行对 |
| 规则板 | `.agents/tasks/rules/design.md`（10-30 21:09） | 0.10 | §10.5 事件表（`rules.judged`、`rules.script`、`rules.late-verdict`、`rules.check`）、§1.4 第 12 条、代码规则表（`metrics-files-only` 一行）；与第 2 轮读的相同，未变 |
| 循环板 | `.agents/tasks/schedules/design.md`（10-30 17:09） | 0.6 | §2.3 的 `Action`（第 319 行）与 `daily` 触发（第 253 行）、§6.4 第 3 步（第 906–910 行）、§6.5 第 3 步（第 925–932 行）、第 39 行；未变 |
| M3 附录 | `.agents/tasks/m3/design-addendum.md`（10-30 21:10） | 0.5 | §3.3 的 `proposalLineRefusal`、`PLAIN_LIMITS.background`；未变 |
| M7 | `.agents/tasks/m7/design.md`（10-31 04:46） | 0.6 | §3.16 事件表（第 1248–1254 行）与它对指标流水的说明（第 1221–1223 行）、第 790 行的合入前检查 30 分钟；未变 |
| M4 | `.agents/tasks/m4/design.md`（10-31 15:11） | 0.6 | §3.2 的 `LiftRecord`（第 425–436 行）、§3.5（第 553–611 行）、§3.11（第 681–688 行）、§6.3.1（第 1199–1241 行） |
| M6 | `.agents/tasks/m6/design.md`（10-31 14:48） | 0.6 | §14.2 四行（第 1046–1049 行） |
| 用户图 | `.agents/tasks/user-journey/journey.md`（10-31 15:53） | 0.6 | 文首的 7 条改动说明、§6.1 的 G15、G18、G26、G28 |
| 面板、接管 | `.agents/tasks/plain-ui/design.md`、`.agents/tasks/bootstrap/design.md`（都是 10-31 20:48，在作者收尾的 16:11 之后） | 1.1；0.6（复核第 1 轮修订） | 面板 §1.0 第 5 条与第 46 条；接管的 `trial` 流水记录（第 1094 行）、`trial.json`（第 787 行）、复核 F2（第 1360、1675 行） |
| 宪章与流程 | `docs/CHARTER.md`（13:38）、`docs/DEVELOPMENT.md`（13:35） | 0.8 | CHARTER §3.2 第 3、5 条、§6；DEVELOPMENT 第 32 行 |
| 项目图 | `docs/graph/nodes/metrics.json`：29 条历史，末条 2026-10-31T05:51:16Z；`d-code-rules-enforce`（末条批注 07:04:52Z）、`d-credentials-readable`、`d-timeout-measured`（批注 07:04:52Z、08:17:53Z）、`d-desktop-direct-use`；`user-journey`（22 条历史，末条 08:17:53Z） | — | — |
| 源码 | main `534b4f0`；`src/graph/engine.ts`、`src/graph/mutation.ts`、`src/graph/plain-question.ts`；`src/` 里没有 `proposalLineRefusal` 与 `PLAIN_LIMITS`（M3 的设计，代码未建） | — | — |

### 第 2 轮发现的处理

F23–F39 全部关闭。逐条的依据：

| # | 状态 | 核对 |
| --- | --- | --- |
| F23 | 已关闭 | `graph` 与 `graph-fail` 两个种类（design.md:254–255、验收 3）；引擎的八个失败码在 `src/graph/mutation.ts:27` 的 `ErrorCode`，与验收 3 列的逐个相同 |
| F24 | 已关闭 | `setEngineObserver`（§3.2、§6.3）。读了 `src/graph/engine.ts`：`openEngine` 返回的 `apply` 是唯一写入口，`writeNodes` 只在 `commit` 里调（:205），失败从 `apply` 内部多处提前返回，包装层能统一接住；今天的 `openEngine(` 调用点是 `cli.ts:69`、`panel-row.ts:87`、`run-control.ts:182`、`tools.ts:321/347/360/374`。同包同模块实例是假设，已列为 §11 第 14 项并给了退路 |
| F25 | 已关闭 | 对循环板 0.6 逐条核：`wake` 为假走 `inject`（§6.4 第 3 步末项（第 910 行））；`done` 不带 `tell` 而条目有 `tell` 时交条目的 `tell`、结局 `delivered`，`skipped` 不发消息（§6.5 第 3 步）；`tell` 在 `harness` 动作里（第 319 行）；`tell.text` 用英文合第 39 行。§6.4、验收 20、§15 第 20 条、§14 请求 ③ 一致 |
| F26 | 已关闭 | 选 (b)：§0、验收 11 第二段、§2、§7.3、§12 第 5 步、§14 M7 ⑤、§15 第 27 条一致，没有留下「切换」的说法 |
| F27 | 已关闭 | `glm.peak-reminder` 有 `cap?`；`bootstrap.trial` 逐字取 `commandId`、加 `limitMs`、`limitSource`；历史条数 29、末条 05:51Z 与节点相符。其中 `exit?` 的说法见 F43，不挡 |
| F28 | 已关闭 | §16 四行的码点我重数过：背景 33 / 37，推荐 22 / 33，疑问 25 / 24，不做 22 / 29，加粗各一处、4–10 个码点，与文中所记逐个相同，在 M3 的 40 / 60 / 2–12 之内；「24 条」等于 §1.4 现在的条数；`plainWordsIn` 的五组词都没有出现。`proposalLineRefusal` 在代码里还不存在，只能对着 M3 附录 0.5 §3.3 的设计核 |
| F29–F36 | 已关闭 | 各处正文都在：持有者记录位置（§4.2 M3 一节）、`panel-row.ts`（§6.3）、`w` 的两种形状与两处正则（§4.1、§5.6、§7.5）、符号名代替行号（§6.1、§6.2）、`readLog` 供循环板（§6.2、§12 第 6 步）、库写入口与宿主写入者并存（§5.2、§5.6）、步骤里的验收编号（§12）、三处文件路径（§3.4） |
| F37 | 已关闭 | §16 开头一段写明放行稿正文补「宪章 3.2 已要求每周报这四个数」，四个数与宪章 §3.2 第 5 条逐字相同 |
| F38 | 已关闭 | §7.2 事实行只列超时次数，两张单子归 `timeoutEntries` 与 `staleEntries` |
| F39 | 已关闭 | §17 写明由评审 APPROVED 之后的那一步建 `graph-ops-align.json`，每条一个元素，未通过时不建，由编排者应用。简报规则 9 本来要分支自己写这份草稿；本任务不许作者写，所以现在不存在，不当作问题 |

### 断稿与变更记录的核对（简报要求的一项）

- 草稿存档属实：`design-0.4-draft.md` 的修改时刻 12:44:04、985 行、MD5 与文首、§18、§19.5 所记相同；`design-0.3.md` 964 行、MD5 相同。
- 草稿与 0.3 的差别是新增 83 行、删去 62 行（`git diff --no-index --numstat`），与 §19.5 所记相同；最后一处改动是在 0.3 第 852 行后插入 §15 第 25–27 条，与「最后一处改动在 §15 第 27 条」相同；草稿没有截断，没有标记行，没有半写的小节。
- 草稿的内容属实：`graph-fail`（12 处）、`setEngineObserver`（7 处）、每天自查条目的 `tell`、`glm.peak-reminder` 的 `cap?`、F29–F36 与 F38 的改动都在；§16、§17、§18 三节与 0.3 逐字相同（我用字符串比对，三节都相等），所以 F28、F37、F39 与 §18 的 0.4 一条确实没做；草稿里没有 §19.4（文首引用了它）；草稿的 `bootstrap.trial` 用 `cmdId`（第 392 行），草稿的 §14 也写 `cmdId`，而同一份草稿第 263 行说它与接管试跑记录的 `commandId` 一一对上，自相矛盾；草稿依据一节写 27 条历史、`4dc369e`，与 §19.4 的说法相同。
- 现稿保留了草稿做对的部分（`graph-fail` 12 → 14 处，`setEngineObserver` 7 → 9 处，没有被改弱），补上了 F28、F37、F39，写了 §18 的 0.4 一条与 §19.4、§19.5。草稿到现稿新增 173 行、删去 79 行；记录里没写这一对数，不算错。
- 一处不一致：文首（design.md:5）和 §18（:974）写草稿「做完」F27，§19.4（:1056）与 §19.5 写「部分」。见 F45。

### 五条决定的折入核对

| 决定 | 折入结果 |
| --- | --- |
| 1 `d-code-rules-enforce` | `rule` 删 `mode` 与 `shadow`、加 `late`，新增 `lift`；字段表与枚举里没有 shadow、promotion、precision、recall、试运行、转正（验收 22 扫描）；§7.2 按规则 id 列拦下与撤下，用户自己选的只记录单列、不算拦截（宪章 0.8 §6 许可）；`rules.judged.how` 的「只记录」保留，与宪章一致；`followup` 留着，M4 0.6 §3.3 为量门禁有没有教会模型而留。撤下的路写得过时，见 F40；规则在行启用之后才装的时间差，见 F42；`prune` 的判法没有测试，见 F47 |
| 2 `d-credentials-readable` | 没有读密钥的规则、事件或字段；读它是一条普通的 `tool`（验收 23）。文字有两处说法不一，见 F44 |
| 3 `d-timeout-measured` | 新增 `timeout.set`、`timeout.hit`，字段按人要的来源、时间、旧值、条目、限、用时、结局；上限被截记在 `ceiling` 与 `told`；事实里加「超时」行，`verify` 加超时对账（有 5 秒窗口，规则明确）；指标行自己的等待是固定值、到时放弃不崩（§9.2）。`source` 的取值装不下 M4 与接管已经写定的来历，也没有估计本身的数，见 F41 |
| 4 用户图两件 | 额度的停住与接上从 M7 的 `execute.goal` 与 M6 的 `glm.upstream-limit` 算；汇报记 `progress.due`、`progress.handover`（含整个目标做完一句、人不在时攒着、回来一起交）；M7 没给额度码也没有汇报发送方，事实里写「—」不写 0（§11 第 15、16 项），属实：M7 0.6 的 `execute.goal` 行只有 `hourness-peak-wait`、`hourness-design-wait` 两类阻塞原因，没有额度。`progress.due` 的字段名收不下里程碑，见 F46 |
| 5 `d-desktop-direct-use` | §12 第 6、9 步与 §13 改成直接用桌面版、含重启、不必先告诉人，顺序仍按 `AGENTS.md`；原稿确实没有「重启前告诉人」的句子（全文检索只剩这几处新句）；DEVELOPMENT.md 第 32 行的「先关桌面版再合入」是操作顺序，不是通知人 |

### 发现

#### F40 MEDIUM（挡路）：撤下规则的路按 M4 的旧稿写了，`lift.via` 的封闭取值收不下 M4 现在写的 `board`

位置：`design.md:197`（§3.4 末段）、`:248`（§4.2 `lift` 行）、`:859`（§12 第 7 步）、`:884`（§14 接管）、`:965`（§17 `bootstrap`）、`:15`（M4 的读取时刻 14:42）；验收第 22 条没有 `board` 一例。

问题：

- §3.4 和 §12 第 7 步写人可以「在输入框敲 `/guard lift metrics-files-only`（M4 0.6 §3.5）」。M4 0.6 现稿（10-31 15:11）的 §3.5 已把 `/guard` 删掉：人撤下一条规则只有两条路，对主 Agent 说（它调 `guard_lift`），或在规则板上打 `/rules lift <规则 id>`（`d-one-lift-path`，第 553–557 行）。这条裁定 2026-10-31T07:04:52Z（本地 15:04）就记在 `d-code-rules-enforce` 与 `user-journey` 节点上，早于作者收尾的 16:11。规则板那一侧的接线是对已放行规则板的请求，接上之前只有第一条路（M4 第 556 行）。
- §4.2 把 `lift.via` 写成枚举 `chat`、`command`。M4 的 `LiftLine`（第 616–623 行）、服务 `lifted()`（第 604 行）、`setLifted` 的 `LiftRecord`（第 611 行）写的是 `chat`、`board`。M4 的 `LiftRecord` 类型声明（第 432 行）还留着 `'command'`，M4 自己前后不一，但没有一处是只有 `chat` 与 `command`。按 §4.4，枚举值不在表里不合类型，整条拒收：经规则板撤下的每一笔 `lift` 都进不了流水，事实里「撤下」一行少数，而人定的「一句话或一条命令撤下」少掉的正是命令这一路。
- 接管 0.6 复核第 1 轮 F2（第 1360、1675 行）已删 `/hourness-init unlock-shell`，读项目门禁的撤下并入 M4 的同一条路。§4.2、§14、§17 给接管的三处「若不经 `guard_lift` 请交 `lift`，`via` 取 `command`」没有对象了。这一处改在作者收尾之后（20:48 的文件），列在这里是因为改法相同。

改法：

1. `lift.via` 改成 `id`：取值留在 M4 设计里（今天是 `chat`、`board`），计算遇到不认识的归「其他」。这与 §4.4 对兄弟设计拥有的取值的规矩一致，也不必追着 M4 还在改的稿子。验收第 22 条加一例：假的 `glmHournessLifts.setLifted` 写一笔，读回逐字相同、`via` 为 `board`。
2. §3.4、§12 第 7 步的 `/guard lift …` 改成「对主 Agent 说一句话（它调 `guard_lift`），或在规则板上打 `/rules lift metrics-files-only`（规则板的接线是 dogfood 之后的请求，接上之前只有前一条）」。
3. 删去 §4.2、§14、§17 里 `unlock-shell` 的三句；§14 的 M4 一条补一句：两条路都由 M4 写 `LiftRecord`，本设计只在它写完之后收一条 `lift`。
4. 文首依据里 M4 的读取时刻改成重读的时刻。

#### F41 MEDIUM（挡路）：`timeout.set` 的 `source` 只有三个值，装不下 M4 与接管已经写定的来历，也没有「估计」本身的数

位置：`design.md:265–266`（§4.2 `timeout.set`、`timeout.hit` 两行）、`:94`（验收第 21 条）、`:15`、`:843`（§11 第 17 项）、`:881`（§14 M4 ⑤）、`:963`（§17 `m4` 二）、§14 与 §17 里对规则板、循环板、M7 的三处超时请求（`:877–879`）。

问题：

- `source` 是闭合枚举 `estimate`、`measured`、`ceiling`（`ceiling`＝3 倍超过上限、保持上限）。现在盘上各块写定的来历不止这三种：
  - 没有估计时：M4 0.6 §6.3.1 第 2 条「检查行也没写预计时，超时就是上限」；`d-timeout-measured` 07:04:52Z 的批注「没给就是缺省 10 秒」；接管 0.6 的 `limitSource: 'ceiling'` 就是这一种；面板 1.1 第 46 条把来源列成四种（agent 估的、系统按 N 次运行定、没写估计按上限、设计里定的固定值）。「没写估计按上限」既不是 `ceiling` 的定义（那是 3 倍越过上限），也不是 `estimate`。发送方只能贴错标签。
  - 下限：M4 的 5 秒下限（`CHECK_TIMEOUT_FLOOR_MS`）使 `limitMs` 不等于 3 倍最慢一次，字段表里没有地方说明。
  - 估计本身：M4 的 `ValueLine` 记 `estimateS`（第 1229 行），`timeout.set` 只有 `estSession`，没有估计的数。
- 08:17:53Z 的裁定（作者收尾之后 6 分钟）把「第一个数」定为预计用时、超时一律是它的 3 倍，第一次也是，人同意时看到的是超时和它依据的预计。设计里 `estimate` 写成「写它的 agent 估的数」，读成 `limitMs` 就是估计值或 3 倍估计值都说得通；§14、§17 对规则板、循环板、M7 的三处请求写的是「agent 先估……跑过之后 harness 按最近最慢一次的 3 倍定」，与裁定的「从第一次起就是 3 倍」不同。同一件事在图上有了两种读法，正是用户图第 2 轮评审 R1 指出过的。
- M4 0.6 的 §6.3.1 现在在盘上（第 1199 行起，有 `ValueLine`、`TimeoutLine`），文首、§11 第 17 项、§14 M4 ⑤、§17 `m4` 二仍写「引用的 §6.3.1 在盘上还没有」。
- 违反的是人对这条决定提的「每个超时值的来源、时间与旧值」：没有估计、被下限抬起的值，在流水里没有诚实的写法。

改法：

1. `timeout.set.source` 与 `timeout.hit.source` 同改为：`estimate`（还没跑过，限＝3 × 估计）、`measured`（3 × 近几次最慢一次）、`default`（没有估计，用条目写明的缺省）、`ceiling`（3 倍超过上限，保持上限；不论 3 倍从估计还是从实测来）、`fixed`（设计里定死的值，只给尚未改用本规则的发送方）。
2. `timeout.set` 加可选 `estMs:int`（agent 估的预计用时，`estimate` 与由估计算出的 `ceiling` 带）、`floored:bool`（M4 的下限抬起了这个值）；`wantedMs` 对 `ceiling` 一律带。`estimate` 的 `limitMs` 写明是 3 × `estMs`（受下限与上限约束）。
3. 验收第 21 条补 `default`、`floored` 各一例；`factsFor` 的「来源」按这五个值列。
4. §14、§17 里对规则板、循环板、M7 的超时请求改成裁定的写法：agent 估预计用时，超时＝3 倍，先用估计，跑过之后用近几次最慢一次，没有估计用缺省，人同意时看到超时和它依据的预计。
5. 文首、§11 第 17 项、§14 M4 ⑤、§17 `m4` 二把「§6.3.1 在盘上还没有」改成「已在盘上，对着 `ValueLine`、`TimeoutLine` 核过」，并把 M4 `ValueLine.source` 的映射写一行（`agent` → `estimate`，`harness` → `measured` 或 `ceiling`，没有估计 → `default`）。

#### F42 NIT：指标行默认启用（第 6 步）先于 `metrics-files-only` 安装（第 7 步），中间那段没有写成取舍

位置：`design.md:858–859`（§12 第 6、7 步）、`:197`（§3.4）、先后行（:864）。

问题：`d-code-rules-enforce` 要求规则从它所在的插件行启用那天起就拦。设计的先后是 5 → 6（指标行默认启用）→ 7（规则，等 M4 的 G1）。第 6 步之后到第 7 步之前，行已启用、规则没装，只有链式摘要与文件清单事后发现。§3.4 写了「G1 合入之前不装」，但没有说这是对该决定的一处时间差，也没有说人可以不接受。这不是影子期（规则不存在，不是只记录），所以不挡路。

改法：二选一并写进 §12：第 6 步的「默认启用」改为等第 7 步之后；或在 §15 加一条 agent 定、人可推翻的事项，写明第 6 步到第 7 步之间行已启用而规则未装，靠清单事后发现，理由是 M4 的 G1 不在本设计手里。

#### F43 NIT：§14 说 `bootstrap.trial` 与接管的试跑流水「一一对上」，列了 `exit?`，接管的流水记录没有这个字段

位置：`design.md:884`（§14 接管）、`:423`（§4.5 `bootstrap.trial` 行）、`:965`。

问题：接管 0.6 第 1094 行的 `trial` 流水记录是 `round`、`commandId`、`outcome`、`limitMs`、`limitSource`、`ms?`、`log?`、`envKey`；`exit` 在 `trial.json`（第 787 行）里。§14 把 `exit?` 列进「一一对上」的括号。字段本身可选、无害，但说法不准；`round` 在接管记录里是必填，§4.5 写成 `round?`。

改法：去掉 `exit?`，或写明它取自 `trial.json`；`round` 与接管一致。

#### F44 NIT：读密钥文件「什么都不记」与「是一条普通的 `tool`」两种说法并存

位置：`design.md:42`（§1.1）、`:96`（验收第 23 条标题），对 `:30`（§0 五条决定一段）与 §1.6 的写法。

问题：决定的意思是不为读密钥另设规则或标记。设计的做法是它在流水里就是一条普通 `tool`（带路径散列 `target`）。§1.1 和验收第 23 条的标题写「读的时候什么都不记」「什么都不记」，同一节正文又要求有一条 `tool`。读者会以为这次读取不在流水里。

改法：两处改成「不为它另记」，与 §0、§1.6 的写法一致。

#### F45 NIT：变更记录对草稿是否做完 F27 说了两种话

位置：`design.md:5`（文首）、`:974`（§18），对 `:1056`（§19.4 F27 一行）与 §19.5。

问题：文首写草稿「已经做完 F23、F24、F25、F26、F27 与 F29–F36、F38 的正文改动」，§18 写「做完了 F23–F27……」，§19.4 与 §19.5 写 F27「部分」（`cmdId` 与历史条数、提交、邻居版本都要改）。「部分」才符合我对草稿的核对（第 392、840 行写 `cmdId`，依据写 27 条历史与 `4dc369e`）。

改法：文首和 §18 把 F27 从「做完」里拿出来，单写「F27 做了一半」。

#### F46 NIT：`progress.due.module?` 这个名字收不下里程碑

位置：`design.md:267`（§4.2 `progress.due` 行）。

问题：用户图与面板 1.1 说「一块」是目标的直接子节点里状态变为完成的特性，有 `stage` 的是模块，没有的是里程碑；用户图 G18 还留着「没分模块的新目标，一部分按什么算」没定。字段 `module?:id` 写「一块时的那一块」，里程碑要么塞进 `module`，要么没处放。

改法：改名 `part?:id`（那一块的节点 id，模块或里程碑都放），`scope` 的 `part` 不变；§7.2 的「一块的」汇报行随之不变。

#### F47 NIT：把 `npm run metrics -- prune` 算进 `metrics-files-only` 的拦截，没有写怎么认，验收也没有这一例

位置：`design.md:197`（§3.4）、`:95`（验收第 22 条）、§5.3、§15 第 32 条。

问题：0.4 新加这一句，理由成立（规则启用即拦，不加则主 Agent 经 shell 能跑 `prune`）。但判法只写了文件工具的路径集合和「shell 文本里出现 `.llm/metrics` 并带写、删、移动词」。`npm run metrics -- prune` 的文本里没有 `.llm/metrics`；`node scripts/metrics/cli.ts prune` 也不是 `npm run`。验收第 22 条只测 `Remove-Item`。

改法：写明判法：shell 命令文本里同时有子命令词 `prune` 与指标命令行入口（`npm run metrics` 或 `scripts/metrics/cli`）；验收第 22 条加这两种写法各一例。

#### F48 NIT：§16 ① 的疑问一行里「对方」没有指代

位置：`design.md` §16 ① 疑问（「最没把握的是**种类名要对齐**，对方改名这里就得跟着改。」）。

问题：人读不到前文，不知道「对方」是谁，「种类名」也是设计里的词。这件事（`d-plain-questions`）正是人抱怨过读起来累的地方。

改法：「最没把握的是**别的设计改名**，这里就得跟着改。」（21 个码点，加粗 6 个，合 M3 的上限。）② 的疑问「会不会被当目标追」同理可写成「最没把握的是**模型追着比率跑**，设计阶段验证不了。」（23 个码点，加粗 7 个。）

### 已核实的假设

| 设计里的说法 | 依据 | 结论 |
| --- | --- | --- |
| 变更记录对草稿的描述：985 行、MD5、12:44、对 0.3 新增 83 删去 62、最后一处改动在 §15 第 27 条、§16–§18 与 0.3 相同、没有 §19.4、`cmdId`、27 条历史与 `4dc369e` | 文件散列、行数、`git diff --no-index --numstat` 与 `-U0` 的 50 个块、三节字符串比对、全文检索 | 成立（F27 的「做完」与「部分」不一，F45） |
| 引擎的失败码八个 | `src/graph/mutation.ts:27` | 成立 |
| `apply` 是唯一写入口，`writeNodes` 只在 `commit` 里调；调用点 | `src/graph/engine.ts:62–69、146–206`；全仓检索 `openEngine(` | 成立，观察者的挂法可行 |
| 循环板 `harness` 动作的 `tell`、`wake` 为假走 `inject`、`done` 带条目 `tell` 结局 `delivered`、`skipped` 不发消息、`daily` 触发、`tell.text` 用英文 | 循环板 0.6 第 319、253、905–912、924–934、39 行 | 成立（F25 关闭） |
| 事件个数与字段名：规则板 15、循环板 11、M7 23、M6 4、M3 8；`rules.script.result` 含 `timeout`；M7 `execute.goal` 的 `op`、`code`、`resumeWhy`；`execute.check` 三个数组；`glm.peak-reminder.cap` | 规则板第 1791–1803 行、M7 第 1248–1254 行、M6 第 1046–1049 行 | 成立 |
| M7 没有额度的阻塞原因码，没有汇报发送方 | M7 第 1252 行（原因码只提 `hourness-peak-wait`、`hourness-design-wait`）、用户图 G15、G18 | 成立，设计写「—」是对的 |
| 宪章 0.8 §3.2 第 3 条、第 5 条（四个数）、§6（用户选的只记录） | `docs/CHARTER.md` 第 44–46、77 行 | 成立 |
| 已放行的四份设计没有被改 | 修改时刻都早于 0.3 评审（规则板 10-30 21:09、循环板 10-30 17:09、M3 附录 10-30 21:10、M7 10-31 04:46） | 成立 |
| 文中没有人设与语气词 | 全文检索 | 成立（「主人」出现一次，是「停住与恢复的主人」，指负责方，不是称呼） |
| 实施步对验收的覆盖 | §12 十步的验证列与 §1.4 的 24 条对照 | 24 条都有归属 |

### 未核实或不成立的假设

| 设计里的说法 | 实际 | 处理 |
| --- | --- | --- |
| 人可以敲 `/guard lift …`；`lift.via` 取 `chat`、`command` | M4 0.6 现稿已删 `/guard`；`LiftLine` 与服务写 `chat`、`board` | 不成立，F40 |
| `timeout.set.source` 三个值够用；`estimate` 是「agent 估的数」 | M4 §6.3.1 有没估计、下限、`estimateS`；面板 1.1 列四种；08:17Z 裁定改了读法 | 不成立，F41 |
| M4 0.6 的 §6.3.1 在盘上还没有 | 已在盘上（第 1199 行起） | 不成立，F41 |
| `bootstrap.trial` 与接管流水一一对上，含 `exit?` | 流水记录没有 `exit`，在 `trial.json` | 不成立，F43 |
| 草稿做完了 F27 | 做了一半 | 文首与 §18 不实，F45 |
| `/hourness-init unlock-shell` 若不经 `guard_lift` 要交 `lift` | 接管 0.6 复核后已删（作者收尾之后） | 不成立，并入 F40 |
| 观察者集合在同一个包里是一份模块实例（§11 第 14 项） | 没有运行验证；设计已列未核实并给了 `globalThis` 退路 | 未核实，设计已列 |
| 面板 1.1、接管 0.6 复核修订在作者收尾（16:11）之后又改过（20:48） | 本轮读了现稿；除 F40 提到的 `unlock-shell` 外，没有看到与本设计字段冲突的新处 | 未核实到冲突；邻居还会再出稿，设计 §12 第 1 步已要求实现前重核 |
| `proposalLineRefusal` 的上限（40 / 60 / 加粗 2–12） | 只在 M3 附录 0.5 §3.3 的设计里，代码未建 | 按设计核过，成立 |

### 小结

结论 CHANGES_REQUESTED：挡路 2 条（HIGH 0、MEDIUM 2：F40、F41），非挡路 7 条（F42–F48）。挡路的趋势：第 1 轮 11 条（HIGH 2、MEDIUM 9），第 2 轮 6 条（HIGH 0、MEDIUM 6），第 3 轮 2 条（HIGH 0、MEDIUM 2）。

第 2 轮的 F23–F39 全部关闭，变更记录对草稿内容的描述属实（散列、行数、差别行数、没做的几项都对得上），只有 F27「做完」与「部分」一处说法不一（F45）。保留的草稿部分没有被改弱，补上的 F28、F37、F39 与 §18、§19.4、§19.5 都在。五条决定里，第 2、第 5 条折得对；第 1、第 3、第 4 条的主体折进了，各留一处缺口：

- F40：撤下规则的路写成了 M4 已经删掉的 `/guard lift`，`lift.via` 的封闭取值会把经规则板撤下的每一笔整条拒收。
- F41：`timeout.set.source` 只有三个值，没有估计时的缺省、下限、估计本身的数，也没有跟上 08:17Z 把第一个数定为预计用时的裁定。

两条都是局部改字加一个字段类型或枚举，不动结构，每条都有具体改法。按简报共同规则 4，这一轮是修改后的又一轮评审；挡路条数仍在，是否再给一次修改由编排者定。

## 第 4 轮

评审对象：`design.md` 0.5（2026-10-31 22:53 修改，1106 行，MD5 `E838AF2DD7C59FAE3DCF60A8723C4E61`），连同同目录的 `design-0.4.md`（第 3 轮评审过的原文，16:11，1079 行，MD5 `8D95556421F5838EE7AA6EDF345E01EE`）、`design-0.4-draft.md`（上一位作者留下的草稿，12:44，985 行，MD5 `E07882318FCC9404B8C65D6AD3780711`）和 `design-0.3.md`（964 行，MD5 `B2F9F30C811AE1917FE0B03D88FACB23`）。评审人不是作者。这是修改后的复评：先把第 3 轮的 F40–F48 逐条对着 0.5 标 Closed 或 Unchanged，再审 0.5 改动的部分，再核变更记录对草稿的描述和五条决定的折入。

编号：本轮任务的说明写「从 F40 起编号」，但 F40–F48 已被第 3 轮用掉，重用会让 F40、F41 指向两件事，所以本轮从 F49 起。

依据：简报 `.agents/tasks/align-rounds-2026-10-30/brief.md` 共同规则、本轮任务给出的五条决定原话、项目图上的决定节点与 `metrics`、`user-journey`、`user-graph` 等节点的批注、已放行的四份设计、同一轮对齐里的邻居设计、`docs/CHARTER.md` 0.8、`docs/DEVELOPMENT.md`。挡路的判据同前三轮。没有改设计，没有重跑作者的任何东西；核对用的是只读操作（文件散列与行数、`git diff --no-index`、字符串比对、读源码、兄弟设计与图节点、数码点）。

### 读过的版本

| 对象 | 文件（读时的修改时刻，本地时间） | 版本 | 与指标流水有关的小节 |
| --- | --- | --- | --- |
| 本设计 | `design.md`（10-31 22:53）；`design-0.4.md`（16:11）；`design-0.4-draft.md`（12:44）；`design-0.3.md`（05:16） | 0.5 | 0.5 对 0.4 的差异我用 `git diff --no-index -U0` 取出（新增 71 行、删去 44 行，148 行差异输出），逐块读；§16、§12、§14、§17、§18、§19.6 与受 F40–F48 影响的 §3.4、§4.2、§4.5、§7.2 全读 |
| 规则板 | `.agents/tasks/rules/design.md`（10-30 21:09） | 0.10 | 未变；超时请求里写的「拦路脚本默认 10 秒、最长 30 秒」与 08:17Z 裁定一致 |
| 循环板 | `.agents/tasks/schedules/design.md`（10-30 17:09） | 0.6 | 未变 |
| M7 | `.agents/tasks/m7/design.md`（10-31 04:46） | 0.6 | 未变；合入前检查每条 30 分钟 |
| M3 附录 | `.agents/tasks/m3/design-addendum-0.5.md`（10-30 21:10，放行版）；`.agents/tasks/m3/design-addendum.md`（11-01 01:13） | 0.5；0.6 | 盘上的 `design-addendum.md` 现在是 0.6（`d-ask-three-gates`，试行，第 1 轮评审 CHANGES_REQUESTED，第 2 轮待做，未放行）；读了 0.6 的 §3.12（第 922–935 行）与文首，对照 0.5 的 §3.12（第 756–770 行） |
| M4 | `.agents/tasks/m4/design.md`（读时 11-01 08:59；作者读的是 10-31 22:37） | 0.6 | `LiftRecord` 与服务 `glmHournessLifts`（第 507–508、665–705 行）、§3.5、§3.11（第 775–781 行）、§6.3.1（第 1296–1385 行：取值、优雅失败、`RunLine`、`ValueLine`、`TimeoutLine`、常量） |
| M6 | `.agents/tasks/m6/design.md`（10-31 21:15） | 0.6 | §14.2 四行，未变 |
| 面板 | `.agents/tasks/plain-ui/design.md`（11-01 03:56） | 1.2（作者读的是 1.1） | 第 46 条（第 1067 行）的四种来源 |
| 接管 | `.agents/tasks/bootstrap/design.md`（11-01 08:59） | 0.6（含复核第 1、2 轮修订） | `trial` 流水记录（第 1110 行）、`trial.json`（第 792 行）、读项目门禁的撤下（第 1074、1468 行） |
| 插件使用流程 | `.agents/tasks/user-journey/journey.md`（10-31 20:56） | 0.6 | 第 384 行（汇报的三句与「里程碑」的含义，G18） |
| 项目用户图 | `.agents/tasks/user-graph/design.md`（11-01 01:08） | 0.3（评审中，`align-stop-report.md` 09:00） | 第 1085 行向指标流水 0.5 要四个种类；它没放行，我当作下一稿的输入，不当作本设计的缺陷 |
| 宪章与流程 | `docs/CHARTER.md` 0.8、`docs/DEVELOPMENT.md` | 0.8 | `aaab499` 到 HEAD `15f20a3` 之间，`docs/`（不含 `docs/graph`）只多了 `DEVELOPMENT.md` 一行事故记录 |
| 项目图 | `docs/graph/nodes/metrics.json`：33 条历史，末条 2026-10-31T20:01:30Z；`d-timeout-measured`（批注到 19:34Z）、`d-code-rules-enforce`、`d-ask-three-gates`（2026-10-31T15:44Z，approved）、`d-plain-questions`、`user-journey`（15:08Z 改名「插件使用流程」）、`user-graph`、`d-user-graph-one-graph` | — | 作者读到第 30 条；第 31–33 条是作者收尾之后（或同时）写的 |
| 源码 | main HEAD `15f20a3`；`git diff --stat aaab499 HEAD -- src scripts packages` 为空 | — | 作者写的「代码一侧的核对不变」成立 |

### 第 3 轮发现的处理

| # | 状态 | 核对 |
| --- | --- | --- |
| F40 | Closed | `lift.via` 改成 `id`，说明写「取值留在 M4，今天 `chat`、`board`，不认识的归其他」（design.md:252）；M4 现稿 `LiftRecord.via` 与 `lifted()` 都是 `'chat' \| 'board'`，`/rules restore` 也由 `setLifted` 收（M4 第 507–508、689、705 行）；§3.4 末段与 §12 第 7 步改成「对主 Agent 说」加「规则板上打 `/rules lift`，接线是 dogfood 之后的请求，接上之前只有前一条」，与 M4 第 632 行相同；`unlock-shell` 在 §4.2、§14、§17 的三句已删，全文只剩两处「接管 0.6 已没有它」的说明和变更记录；接管现稿（第 1074、1468 行）确实把 `bootstrap-read-no-shell` 放在 M4 的 `GUARD_RULES` 与 `guard_lift`；验收 22 加了 `board`、`chat`、表外值三例。「其他」这一半见 F52 |
| F41 | Closed | `source` 五个值，`estMs`、`floored`、`wantedMs` 对 `ceiling` 一律带，与 M4 §6.3.1 逐项对：`source.by` 的 `estimate`／`harness`／`ceiling` 三值，`capped.wantedMs`，下限 `CHECK_TIMEOUT_FLOOR_MS` 5 秒，上限 60 秒，`CHECK_RECENT_RUNS` 10；M4 的 `ceiling` 是「没有估计也没跑过，取最长的」，对应本设计的 `default`，M4 的 `capped` 对应本设计的 `ceiling`，两边的 `ceiling` 一词所指不同，规矩六写明了映射。请求的写法与 07:04:52Z、08:17:53Z、12:56:13Z 三条裁定逐句相同（预计用时、3 倍、先估计后实测、没有估计用缺省、下限写在最长值旁）；「§6.3.1 在盘上还没有」四处都改了，全文只剩变更记录里的引述。残留的小处见 F50、F51、F56 |
| F42 | Closed | §15 第 35 条（design.md:929）写明时间差、不是影子期、人可推翻、推翻的做法与代价；§3.4 与 §12 第 6、7 步各有指向 |
| F43 | Closed | `bootstrap.trial` 去掉 `exit?`，`round:int` 必填（design.md:427）；接管现稿 `trial` 流水记录是 `round, commandId, outcome, limitMs, limitSource, ms?, log?, envKey`（第 1110 行），`exit` 只在 `trial.json`（第 792 行），逐字相同 |
| F44 | Closed | 全文检索「什么都不记」只剩 §15 第 34 条的「改成不另记」和变更记录里的引述；§1.1、验收 23 标题改成「不另记」，与 §0、§1.6 一致 |
| F45 | Closed | 文首（design.md:9）、§18 的 0.4 一条（:980）、§19.4（:1065）、§19.5 都写 F27「做了一半」，文首注明这是对保留原文的更正 |
| F46 | Closed | `module?` 改名 `part?`（design.md:271）。括号里按 `stage` 区分模块与里程碑的说法是推断，见 F54 |
| F47 | Closed | §3.4 写明 `isPruneCall` 的判法，验收 22 加三例（`npm run metrics -- prune`、`node scripts/metrics/cli.ts prune`、`summary` 放行）。匹配范围的毛病见 F53 |
| F48 | Closed | §16 两句疑问重写，我用 Node 数过：背景 33 / 37，推荐 22 / 33，疑问 21 / 23，不做 22 / 29，加粗各一处，8 / 10 / 6 / 4 与 9 / 6 / 7 / 10，在 M3 附录 0.5 的 40 / 60 / 2–12 之内，与文中所记逐个相同。这一节整体被后来的决定取代，见 F49 |

### 断稿与变更记录的核对（简报要求的一项）

- 存档属实：`design-0.4.md` 1079 行、MD5 与文首、§18 所记相同；`design-0.4-draft.md` 985 行、MD5、12:44:04 相同；`design-0.3.md` 964 行、MD5 相同。
- 0.5 的改动只在 §19.6 说的那几类里：差异输出里没有 F40–F48 以外的正文改动，除了变更记录自己说的两处顺手同步（依据一节补 main `3cd6773` 与节点第 30 条，§14 对面板一条按 plain-ui 1.1 重写）。种类总数不变（`lift`、`timeout.set`、`timeout.hit`、`progress.due`、`progress.handover`、`bootstrap.trial`），验收 5 的清单比对不受影响。
- 变更记录对草稿的描述，我又核了六点，都成立：草稿的 §17 开头一段与 0.3 逐字相同（F39 没做）；草稿的 §18 没有「0.4」一条；草稿的标题里没有 §19.4（最后是 §19.3）；`cmdId` 与 `4dc369e` 仍在草稿里；草稿没有「宪章 3.2 已要求」那句（F37 没做）；草稿的 §16 开头一段没有码点说明（F28 没做）。第 3 轮对 §16–§18 与 0.3 的字符串比对结论我沿用。F45 之后，文首、§18、§19.4、§19.5 对 F27 的说法一致。
- 「编排方的两条裁定不是人的新决定」这一句（§19.1 新增一行）属实：三条批注都署编排方、标「可逆」，人的原话没有变。

### 五条决定的折入核对

| 决定 | 折入结果 |
| --- | --- |
| 1 `d-code-rules-enforce` | 0.5 没动主体：`rule` 无 `mode`，`lift` 一种，字段与枚举里没有 shadow、promotion、precision、recall、试运行、转正（验收 22 扫描）。撤下的路已与 M4 现稿对上（F40 Closed）。`d-one-lift-path` 的两条裁定（07:04:52Z、12:56:13Z）与设计所述一致，设计的说法「没有独立节点」属实（只是 `d-code-rules-enforce` 与 `user-journey` 上的批注） |
| 2 `d-credentials-readable` | 没有读密钥的规则、事件或字段；读它是一条普通的 `tool`（验收 23） |
| 3 `d-timeout-measured` | 来源、时间、旧值、条目、限、用时、结局、`told` 都有；高于上限时保持上限并告诉主 Agent 记在 `ceiling` 与 `told`；优雅失败的话在 `timeout.hit` 之前交，交不出去时 `told` 为假、不崩（design.md:270）。对 M4 §6.3.1 的 `ValueLine` 映射成立，`TimeoutLine` 的映射缺三个字段的来源，见 F56 |
| 4 用户图两件 | 额度停住与接上从 M7 的 `execute.goal` 算，M7 没给码时写「—」（M7 0.6 的 `execute.goal` 行只有 `hourness-peak-wait`、`hourness-design-wait` 两类阻塞原因，未变）；汇报记 `progress.due`、`progress.handover`。「用户图」这个词现在指另一样东西，见 F55 |
| 5 `d-desktop-direct-use` | §0、§12 第 6、9 步、§13 都写直接用桌面版、含重启、不必先告诉人；全文检索没有残留的「重启前告诉人」 |
| 2026-10-31 晚的 `d-ask-three-gates`（任务说明列的五条之外，晚于作者收尾） | 没有折进，见 F49 |

### 发现

#### F49 MEDIUM（挡路）：人 2026-10-31 晚定的 `d-ask-three-gates` 点名要指标设计跟着改，§16 仍是被它取代的四行写法；M3 附录 0.6 与节点第 33 条批注要的事件和字段没有收进封闭表

位置：`design.md:932–958`（§16 全节）、`:3`、`:17`（节点读到第 30 条）、`:19` 与 `:292–:299`、`:410–:419`（M3 附录 0.5 的 8 种与路径）、`:81`（验收 5 的「`design.*` 与 `git.*` 8 种」）、`:661–:665`（§7.2 问人行的同意率口径）、`:964`（§17 `metrics`「按四行问」）、`:967`（§17 `m3`「没有必须改的」）。

问题：

1. 决定节点 `d-ask-three-gates`（approved，2026-10-31T15:44Z，即当天 23:44，作者 22:53 收尾之后）。人的原话是「都没问题。先这样改和试行吧，我看看效果」。节点正文写它取代 `d-chat-not-cards` 的固定版式（加粗结论、推荐、疑问、不做）、`d-plain-questions` 的四行版式和「不列选项」，并写「面板、M4、接管、指标、M5、用户图的设计跟着改」。§16 的开头一段还写「都按 `d-chat-not-cards` 与 `d-plain-questions` 写：一个方案、四行、问题放最后，不列选项」，并用 M3 `proposalLineRefusal` 的 40 / 60 / 2–12 码点逐行数过；第 2 轮的 F28、F37 和第 3 轮的 F48 都建立在这种写法上。按现稿让主 Agent 去问人，用的就是人刚刚说「看起来很累」并换掉的那种问法。
2. 节点 `metrics` 第 33 条批注（2026-10-31T20:01:30Z）是 M3 附录 0.6 对指标设计的请求：`design.proposal-shown` 多 `form`、`points`（和是否带 `sample`）；`design.answer-recorded` 多 `form`、`delegated`、`pickedRecommended`；两个新事件 `design.delegation`、`design.proposal-refused`；要能算的数里，跟随率只数 `form` 为 `recommend` 或 `choose` 的 `agree`、排除 `delegated`；第五条直接写「你的 §16 里两件待人定的事原按四行写，随新决定改成一个问句」。第 31、32 条是编排方记 0.5 写出和 M4 0.6 的接缝说明（后者与 0.5 已收的相同），不需要处理。设计文首仍写「节点上到第 30 条」，§17 `m3` 写「没有必须改的」。
3. 路径与个数：设计在 §0、§4.2、§14 把 M3 附录写成 0.5，路径 `.agents/tasks/m3/design-addendum.md`。盘上这个文件现在是 0.6（11-01 01:13），0.5 原文在 `design-addendum-0.5.md`。0.6 的 §3.12 共 10 种（比 0.5 多 `design.delegation`、`design.proposal-refused`），`design.answer-recorded` 只在 `question`、`confirm`、`release` 时发，`delegation` 另有事件。验收 5 把 `design.*` 与 `git.*` 写成 8 种；§4.4 规定表外的键整条拒收，所以 0.6 的实现一落地，带 `form`、`points`、`delegated` 的事件会被全部拒收并计 `reject`，而人要看的正是这次试行的数。§12 第 1 步有「实现前重核兄弟设计和节点新增批注」一条，能在实现时发现字段差异，但它覆盖不了 §16，也不是对一条人已定的决定的跟进。

改法：

1. §16 改成每件事一个问句：一句是非问，推荐与理由嵌在里面，有真代价才加一句（`d-ask-three-gates` 的确认推荐形状）。去掉四行标签、加粗和码点清单，写明形状以提问时 M3 附录的放行版为准，本设计不钉长度数。例：① 「指标记录那十步，我先照设计里的 24 条检查来判每步做没做完，以后要改再问你，可以吗？」② 「周报里只把四个减负数字经主 Agent 转述给你，其余比率走命令行，代价是比率不进对话，可以吗？」§0 与 §17 `metrics` 里的「按四行问」同改；§19.4、§19.6 里 F28、F37、F48 的行保留历史，加一句「后被 `d-ask-three-gates` 取代」。
2. §4.2 与 §4.5 的 M3 一节：写明放行版是 0.5（路径 `design-addendum-0.5.md`），另列 0.6 要的：`design.proposal-shown` 加 `form?:id`、`points?:int`、`sample?:bool`；`design.answer-recorded` 加 `form?:id`、`delegated?:bool`、`pickedRecommended?:bool`；新增 `design.delegation`（动作 `id`、写后条数 `int`、`scope` 的码点数 `int`、存放位置 `id`）与 `design.proposal-refused`（`kind:id`、`form?:id`、原因码 `id`、`field?:id`、`attach?:id`）。字段名与类型待 0.6 放行后逐字核（§12 第 1 步）。验收 5 的个数改成「照 M3 放行版那一节抄」，或写 10；§7.2 问人行的同意率口径注明「0.6 起只数 `form` 为 `recommend` 或 `choose` 的 `agree`，排除 `delegated`」。0.6 在评审中，我建议现在就收进表：不收的话，试行期间每条带新字段的事件都被拒收。
3. 文首把节点读取改成 33 条，写明第 31–33 条各自怎样处理；§17 `m3` 的「没有必须改的」改成「0.6 对指标设计的请求已收下，字段见 §4.5」。

#### F50 NIT：`timeout.set` 的 `estMs` 一句与 `floored` 一句对「被下限抬起的实测值」说了相反的话

位置：`design.md:269`（`estMs?`、`floored?` 两项说明）、`:98`（验收 21）。

问题：`estMs?` 写「`estimate` 带，3 倍从估计来的 `ceiling` 与 `floored` 为真的值也带；`measured`、`default`、`fixed` 不带」，`floored?` 写「`estimate` 与 `measured` 可带」。M4 的 `harness` 来源带 `floorMs`，所以被 5 秒下限抬起的实测值会出现，它既落在「`floored` 为真的值也带 `estMs`」里，又落在「`measured` 不带 `estMs`」里；M4 的 `harness` 行没有 `estimateS`，发送方没有数可带。

改法：把 `estMs` 一句改成按「限是不是由估计算出来的」定：带在 `estimate` 与由估计算出的 `ceiling`；不带在 `measured`、由实测算出的 `ceiling`、`default`、`fixed`；`floored` 与 `estMs` 无关。验收 21 加一例：`measured`、`floored` 为真、不带 `estMs`。

#### F51 NIT：验收 21 末句说 `verify` 的对账会核 3 倍的算式，§7.5 和规矩五都说不核

位置：`design.md:98`（验收 21 末句）、`:274`（规矩五）、`:86`（验收 10）、`:683`（§7.5 `verify` 一行）。

问题：验收 21 写「算式对不对是发送方自己的测试和 `verify` 的对账要管的（§7.5）」。§7.5 与验收 10 里 `verify` 的超时对账只有三项：运行事件找不到同条目的 `timeout.hit`、`timeout.hit` 找不到运行、`timeout.set` 的 `prevMs` 对不上上一条的 `limitMs`，没有 3 × 的核对；规矩五写「核对归发送方自己的测试」。三处里有一处多了 `verify`。下限与上限使 `limitMs` 不等于 3 × `estMs` 成为正常情形，`verify` 要核也要带 `floored`、`ceiling` 的分支，设计没有给。

改法：删去验收 21 末句里的「和 `verify` 的对账」与括号，让它与规矩五、§7.5 一致。

#### F52 NIT：验收 22 测「`via` 的表外值在事实里归其他」，§7.2 的撤下一行没有按 `via` 分的输出

位置：`design.md:99`（验收 22 的 `factsFor` 一句）、`:252`（`lift` 行「计算遇到不认识的归其他」）、`:654`（§7.2 撤下一行）。

问题：§7.2 撤下一行只有「近 7 天每条规则被撤下与恢复各几次，现在哪几条处于撤下」，没有按方式分的一项；验收 22 却要测「`via` 取表外值时 `factsFor` 把它归『其他』」，没有可测的输出。

改法：撤下一行加「按方式分：对话、规则板、其他」（`chat`、`board`、其余归其他），或把验收 22 的这句改成「`lift` 事件照收，读回逐字相同」。

#### F53 NIT：`isPruneCall` 的匹配不分命令边界，「词里有 `npm`」没说等于还是包含

位置：`design.md:201`（§3.4 `isPruneCall` 一段）、`:99`（验收 22）。

问题：一、「词里有 `npm`」：`pnpm` 含有 `npm` 三个字符，`npm.cmd` 去掉后缀后才等于；设计没说是等于还是包含。二、两条判法都在整条命令文本里按词序找，不分命令边界：`git commit -m "doc: npm run metrics -- prune 只给人用"` 切词之后依次出现 `npm`、`run`、`metrics`、`prune`，满足第一条，会被拦；`npm run metrics -- summary; echo prune` 同样满足。规则启用即拦、没有试运行期（`d-code-rules-enforce`），最先被误拦的是提交说明和文档命令；人撤下的路是有的，但这是规则自己的写法造成的误拦，不是有意绕过。

改法：先按 `;`、`&&`、`||`、`|`、换行把命令文本切成简单命令，每段取头一个词（去 `.cmd`、`.exe` 后与 `npm`、`npx`、`node`、`tsx` 之一相等），同一段里按顺序出现 `metrics`（或含 `scripts/metrics/cli` 的词）与 `prune` 才拦。验收 22 加两例：`git commit -m "…npm run metrics -- prune…"` 放行，`npm run build && npm run metrics -- prune --before 2026-01-01` 被拒。

#### F54 NIT：`progress.due.part?` 的说明把「没有 `stage` 的直接子特性」定为里程碑，没有一份设计这样定

位置：`design.md:271`（`part?` 的括号）、`:1102`（§19.6 F46 行）。

问题：括号写「目标的直接子节点里状态变为完成的特性，有 `stage` 的是模块，没有的是里程碑」。M3 附录 0.5 §3.14（第 797 行）写直接子特性里没有 `stage` 的是 0.4 流程放行过的特性或放行之后新加的特性，「不是模块」，没说它们是里程碑；插件使用流程 0.6 第 384 行把里程碑限定为「接管来的项目里挂在目标下的一个里程碑」，并把「没分模块的新目标，一部分按什么算」列为 G18 未定。所以「没有 `stage` 的是里程碑」是本设计的推断。设计自己在规矩三里说什么算一块、怎么判做完归 M7，括号与它相抵。

改法：`part?` 的说明改成「做完的那一块的节点 id（模块或里程碑，什么算一块归 M7，G18）」，删去按 `stage` 分类的括号；§11 加一项未核实：判定一块做完的节点范围由 M7 下一次修订定，定之前 `progress.due` 只靠 `scope` 区分。

#### F55 NIT：「用户图」一词现在指另一样东西

位置：`design.md` 全文 23 处（如 `:9`、`:17`、`:19`、`:46`、`:65`、`:101`、`:271`、`:272`）与 §17 `user-journey` 一条（`:973`）。

问题：2026-10-31 15:08Z（23:08），人说明「用户图」指被开发项目的真实用户怎样使用它，编排方把节点 `user-journey` 改名「插件使用流程」，`journey.md` 留作内部文档，另立节点 `user-graph`（设计 0.3 在评审中，图提交 `7a72dde`）。本设计仍用「用户图」称 `journey.md` 和节点 `user-journey`，读的人会以为指 `user-graph`。人 2026-10-31 的两件答复本身没有变，节点 id 和 G15、G18、G26、G28 的编号也没变。

改法：全文把「用户图」换成「插件使用流程」，节点 id `user-journey` 与 G 编号照旧；§17 `user-journey` 一条的开头同改。

#### F56 NIT：规矩六对 `TimeoutLine` 只映射了两个字段，`timeout.hit` 必填的 `kind`、`source`、`told` 没有来源

位置：`design.md:274`（规矩六末句）、`:270`（`timeout.hit` 行）。

问题：规矩六对 `ValueLine` 逐项写了映射，对 `TimeoutLine` 只写 `check` 是 `entry`、`outcome` 原样放进去。M4 §6.3.1 的 `TimeoutLine` 字段是 `at, check, argv, limitMs, elapsedMs, session?, outcome`，没有 `kind`、`source`、`told`；`timeout.hit` 这三项必填。§14 M4 ⑤ 写 `timeout.hit` 由 M4 在写 `TimeoutLine` 之后交，M4 要自己凑这三项，设计没说怎么凑。

改法：规矩六加一句：`kind` 取 `check`；`source` 取这次超时时生效的那条 `ValueLine` 映射出的值；`told` 取 M4 的超时提醒里是否写了「这一项已在上限，主 Agent 已被告知」；`run` 不带。

### 已核实的假设

| 设计里的说法 | 依据 | 结论 |
| --- | --- | --- |
| `design-0.4.md` 是评审过的 0.4 原文，MD5 `8D95556421F5838EE7AA6EDF345E01EE`、1079 行 | 文件散列、行数 | 成立 |
| 草稿存档：985 行、MD5、12:44；变更记录对草稿内容的描述 | 散列、行数、六点字符串与全文检索 | 成立 |
| M4 `LiftRecord.via` 与 `lifted()` 是 `chat`、`board`；`/rules restore` 由 `setLifted` 收；撤下只有两条路 | M4 第 507–508、632、665–705 行 | 成立 |
| M4 `ValueLine` 的三种来源、`capped.wantedMs`、下限 5 秒、上限 60 秒、`CHECK_RECENT_RUNS` 10、`TimeoutLine` 字段 | M4 §6.3.1（第 1296–1385 行） | 成立 |
| 07:04:52Z、08:17:53Z、12:56:13Z 三条裁定的内容与请求写法一致 | `d-timeout-measured`、`d-code-rules-enforce` 的批注 | 成立 |
| 面板第 46 条列四种来源，与五个值的对应 | plain-ui 1.2 第 1067 行 | 成立（1.2 又补了「来源是上限或固定值的条目不要求来历」，不冲突） |
| 接管 `trial` 记录的八个字段，`round` 必填，`exit` 只在 `trial.json` | 接管第 1110、792 行 | 成立 |
| §16 的码点与加粗长度 | Node 数 | 成立 |
| 代码一侧自 `aaab499` 起未变 | `git diff --stat aaab499 HEAD -- src scripts packages` 为空 | 成立 |
| 已放行的四份设计的文件没有被改 | 规则板 10-30 21:09、循环板 10-30 17:09、M7 10-31 04:46、M3 附录 0.5 另存为 `design-addendum-0.5.md`（10-30 21:10，原样） | 成立 |
| 决定 5 的句子都改了 | 全文检索「重启」「先告诉」 | 成立 |
| 文中没有人设与语气词 | 全文检索 | 成立 |

### 未核实或不成立的假设

| 设计里的说法 | 实际 | 处理 |
| --- | --- | --- |
| 问人的写法按 `d-chat-not-cards` 与 `d-plain-questions` 的四行（§16、§0、§17） | 已被 `d-ask-three-gates` 取代（试行） | 不成立，F49 |
| M3 附录 0.5 是现行版，`design.*` 与 `git.*` 共 8 种，路径 `design-addendum.md` | 盘上是 0.6（10 种，未放行）；0.5 在 `design-addendum-0.5.md` | 不成立，F49 |
| 节点 `metrics` 读到第 30 条就是全部 | 现在 33 条，第 33 条是对本设计的请求 | 不成立，F49 |
| `floored` 为真的值都带 `estMs`；`measured` 不带 | 被下限抬起的实测值两句相抵 | 不成立，F50 |
| `verify` 的对账会管 3 × 的算式 | §7.5、验收 10 没有这一项 | 不成立，F51 |
| `factsFor` 把表外的 `via` 归其他 | §7.2 没有按 `via` 分的输出 | 不成立，F52 |
| `isPruneCall` 认得出该拦的、放行不该拦的 | 不分命令边界，会拦提交说明里的引述 | 不成立，F53 |
| 没有 `stage` 的直接子特性是里程碑 | 没有设计这样定 | 未核实，F54 |
| 「用户图」指 `journey.md` | 已改指另一样东西 | 不成立，F55 |
| M4 能由 `TimeoutLine` 凑出 `timeout.hit` 的全部必填字段 | `kind`、`source`、`told` 没有来源 | 不成立，F56 |
| 观察者集合在同一个包里是一份模块实例（§11 第 14 项） | 没有运行验证；设计已列未核实并给了退路 | 未核实，设计已列 |
| 邻居设计停在作者读到的版本 | 面板已到 1.2，接管、M4 又改过，M3 附录到 0.6；其中与本设计字段冲突的只有 F49 的 M3 一处，其余未见冲突；设计 §12 第 1 步已要求实现前重核 | 已核，仅 F49 |

### 小结

结论 CHANGES_REQUESTED：挡路 1 条（HIGH 0、MEDIUM 1：F49），非挡路 7 条（F50–F56）。挡路的走向：第 1 轮 11 条（HIGH 2、MEDIUM 9），第 2 轮 6 条（HIGH 0、MEDIUM 6），第 3 轮 2 条（HIGH 0、MEDIUM 2），第 4 轮 1 条（HIGH 0、MEDIUM 1）。

第 3 轮的 F40–F48 全部关闭：F40、F41 两条挡路的改法与 M4 现稿、编排方的三条裁定逐项对上；F42–F48 的改字都在。变更记录对草稿内容的描述、对 F27 的更正、对 0.5 改动范围的描述都属实。五条决定里，第 1、2、5 条折得对；第 3 条的 `ValueLine` 一半对得上，`TimeoutLine` 一半缺三个字段的来源（F56）；第 4 条的发送方仍是 M7，设计写「—」是对的，只是用了现在已指另一样东西的词（F55）。

唯一挡路的 F49 不是作者在 22:53 之前能知道的错：`d-ask-three-gates` 在 23:44 定下，M3 附录 0.6 对本设计的请求在第 33 条批注（04:01）里。它仍然挡路，原因是那条决定点名要指标设计跟着改，而 §16 是本设计里第一个会面对人的文字。改法是局部的：重写 §16 两个问句，M3 一节加两种事件和几个字段，文首与 §17 的两处说法跟着改，不动结构。F50–F56 都是几个字的改动。

设计 §18 的 0.4 一条写的上限是至多两轮修改加评审，现在已用满；是否再给一次修改由编排者定。
