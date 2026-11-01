# 放行一支、模块阶段规矩与五栏门禁修正：附录第 9 步的独立评审

评审对象是 `.worktrees/m3`（分支 `m3`）上这一步唯一的提交 `e58d1ae`，34 个文件，+2456/−250。我读了整个提交，对照附录 0.6 第 9 步一节及它指到的 §3.4、§3.5、§3.6、§3.8、§3.14（全文）、§9 第 16 条，`onepage.md`，`design-context.md`，`reviews/addendum-r5b.md`，`brief.md`（含编排方的几条裁定），图上的 `m3`、`m3-3`、`m3-4`、`m3-6`、`orch`，以及 `docs/DEVELOPMENT.md` §1.1。`review-step9.md` 之前不存在，这是第一轮。

门禁没有重跑。可采用的记录只有提交说明里的"What was run"：build 退出码 0；preflight 退出码 0（15 行）；`npm test` 79 个 spec、1311 个用例、1310 通过、0 失败、1 跳过（面板契约那一条老跳过）；eslint 250 条压制、knip 21 条、jscpd 2 处克隆等于基线；probe 205/205（新场景之前 184/184，加 9 与 12 项正好 205）。`impl/notes/` 里没有这一步的日志文件，核不了日志时间与最后一次源码改动的先后（S9-9）。基线文件不在改动里，改动里没有新增的压制注释，这两点我查了。

我另做了两件一次性的事，脚本与副本都已删，工作树 `git status` 为空：（1）把 `docs/graph` 拷到临时目录，用第 9 步的代码读它、以 `human` 清掉 `orch` 的阶段、再读一遍，核提交说明里 R5b-N1 的前后数字；（2）把 `record-human-answer.spec.ts` 拷成临时 spec，加一个用例，在大循环放行的四个停下点之后不重新给人看、直接用同样的话再记一次，看结果。

## 摘要

这一步在 `propose_to_human` 与 `record_human_answer` 里打开了 `release` 一种：没分模块的目标放行一次，分了模块的目标先放行框架、模块清单与方向清单，再每个模块放行一次，两层都带一页放行稿。门禁、引擎的两处改动（模块退回设计的例外、未放行模块下的任务出生为提议）、`main-agent-graph-stage` 的模块几支、五栏门禁的标签与"如果失败"一行都在，附录点名的 L2、L3 基本齐。第 5 轮评审的 R5-M2 已按评审的改法 A 落实，四个停下点我逐个看过，没有哪个会让重放落进单层放行、一次批准模块子树。人的原话与整页放行稿的核对没有发现能靠模型转述绕过的路。没有阻塞项。

Watch for：（1）S9-1，R5b-N1 的处置（清掉 `orch` 的阶段）选对了，我在副本上复现了提交说明的全部数字，但图上没有改，而且提交与 HANDOFF 写的期限"主 Agent 第一次在这个仓库的 DSH 里跑之前"比实际生效的时间晚：引擎的 `initialStatus` 收窄与 M7 替身的换出在合入 main 时就生效（引擎一支 confirmed，M7 一支 likely）。（2）S9-2，嵌套调用（PTC）到不了任何一条规矩，现在这包括模块几支，也包括放行本身：嵌套的 `graph_edit` 带编造的 `relay` 可以把目标推到 `release`；编排方已裁定合入前修（confirmed 读代码，触发条件 likely，未运行）。（3）S9-3，大循环放行中途停下时错误里的"用同样的话再记一次"在四个停下点里有三个走不通（confirmed，已运行）。（4）S9-4，十一条解释里有四条补充或收紧了附录写明的条件，要记成 agent-decided 并改附录。

**Verdict**: APPROVED

## 高层视图

人的原话与整页稿：写进图的 `relay` 是人在给人看之后发来的消息里的引文，由 `personSaid` 对着会话投影核对；`agree` 不存模型的转述 `recordedAs`。整页稿要在给人看之后主 Agent 的文字块里逐字出现，工具结果、思考块、与工具调用同一条消息里的文字都不算，一个字不同就 `not_shown`。给人看过 A 的放行，记不了 B 与目标一级的放行。这一块我没有找到靠模型转述通过的路。

写入次序与重放：先给候选写 `design`、再按提议时的修订号批准、最后写目标的 `release`。`isSplit` 把候选算进去，与有没有 `stage` 无关，所以每个停下点留下的图都读成分了模块的，重放要求 `page`，不会走单层放行。

R5b-N1：选了清掉 `orch` 的阶段，理由和被否掉的两个做法都对，数字复现。没有执行，这在简报允许的范围内，但期限写晚了，而且这一条还不在 `m3` 的"合入前仍须关闭的项"里（S9-1）。

模块阶段的规矩：主 Agent 在 DSH 里除了 `record_human_answer` 没有别的办法让模块或目标进 `release`；嵌套调用仍绕过全部规矩（S9-2）。

主 Agent 写文件与高峰：这一步没有动工具面，新代码里没有读档位、排队、等待、定时的东西，两个工具的新支都是同步返回。主 Agent 写文件的说法在 PTC 预设下仍不成立，原因是 S9-2。

<details>
<summary>Issues (9)</summary>

1. **S9-1 R5b-N1 没有执行，期限写晚了**（MEDIUM，不阻塞；引擎一支 confirmed，M7 一支 likely）：合入 main 时引擎收窄对所有写图的人生效（编排方用命令行在 `m3` 等节点下提的任务出生为提议，提交说明测得），M7 的替身换成 `modules.ts` 之后 `releaseOf` 对 `orch` 下的任务返回"模块没放行"（提交说明测得，我没有在 main 上运行）。清阶段要带人的原话（`llm` 改不了已批准特性的阶段）。把它写进 `m3` 的合入前清单和 `graph-ops-impl.json`，合入 main 之前清掉，清完再做一次只读核对。
2. **S9-2 嵌套调用绕过全部图规矩，含模块几支与放行**（MEDIUM，不阻塞，confirmed 读代码，触发 likely）：`main-agent.ts:152` 对带 `parent` 的调用直接 `next()`。PTC 预设下 `run_code` 里嵌套的 `graph_edit` 带编造的 `relay` 可以把目标的 `stage` 改成 `release`，不经 `record_human_answer`。同 S4-1、S5-1、S6-2、S8-3，编排方裁定合入前一次修好；修好后翻转 `design-graph-rules.spec.ts` 里钉现状的用例，并给这一步的模块几支各补一个嵌套调用的用例。
3. **S9-3 停下后的错误提示在四个停下点里有三个走不通**（LOW，不阻塞，confirmed 已运行）：`record.ts:360` 说"record the same words again to finish it"。停在 (a)(b)(c) 时，候选的修订号已被 harness 自己的 `design` 写入改过，不重新给人看就再记，结果是 `partial`、候选报 `stale_revision`；只有 (d) 能直接接上。有恢复办法（`partial` 的说明让主 Agent 重新给人看），但白走一次调用，也与测试标题"the same words finish it after the design is shown again"不一致。改提示的措辞为先重新给人看、人再说一次，或让同样的话也能接上。
4. **S9-4 十一条解释里四条补充或收紧了附录的条件，没有记**（LOW，不阻塞，confirmed）：解释 1（没分模块的门禁认已批准的决策）、2（模块门禁"要放行的内容"认下面已有的批准节点）、3（新模块规矩要求目标已有模块，且不看节点自己有没有 `stage`）、4（清模块的阶段、给没有阶段的特性写阶段在所有会话都拒）。编排方记到 `m3-3`、`m3-4` 上作 agent-decided，并改附录 §3.4、§3.14.2、§3.14.3、§3.8 的对应句子，与 S8-11 的处理一致。
5. **S9-5 重放时的成功提示里模块清单是空的**（NIT，confirmed 已运行）：停在 (d) 之后重放，`releaseMessage` 输出"of goal-1.  are modules now, each in design"。该列图上现有的模块，或在清单为空时换一句。
6. **S9-6 读不到 `exact` 时整页检查静默跳过**（NIT，possible）：`sampleSeen` 在 `exact` 缺失时直接返回，阶段写入也不带摘要。分了模块的放行必有 `page`，缺失说明投影读不出调用块，这时该 `not_shown` 或 `unavailable`。L3 的 `glm-design-modules` 断言了摘要，真实的调用块读得出，所以这是纵深防御，不是现状里的洞。
7. **S9-7 子 agent 退回模块的告警句不对**（NIT，confirmed）：`design/index.ts:227` 的模板是"想不经人的同意" + `what`，这一步的 `what` 是"把模块「x」退回设计"。主 Agent 退回模块本来就不要人的同意，错的是做的人是子 agent。让模板按这类尝试换一句，例如"想把模块退回设计，只有主 Agent 能退回"。
8. **S9-8 `page` 参数说明里的 2000 是字面值**（NIT，confirmed）：`propose.ts:75`；同一文件的总说明用 `PAGE_LIMITS.max`。改常量时两处会不一致。
9. **S9-9 这一步没有留门禁日志**（NIT，confirmed）：`impl/notes/` 里没有 build、preflight、test、probe 的输出文件（第 3、4、6、8 步都留了），数字只在提交说明里。下一步留下，评审才能核日志时间。

</details>

<details>
<summary>Details</summary>

### 人的原话怎样核对，整页放行稿怎样查

`record_human_answer` 的 `release` 从 `record.ts:443` 起。先取本会话 `hournessTalk` 里 `kind`、`goal`、`module` 都相同的最后一项 `Shown`，没有就 `not_shown`。`entry.module === module?.id` 对目标一级的放行是 `undefined === undefined`，所以给人看了模块 A，记不了目标一级与模块 B，测试 `record-human-answer.spec.ts:908` 钉了。模块放行还要求目标已在 `release`（`moduleReleaseGate` 第一项，提议时就查），所以框架与第一个模块的放行不可能共用人的同一条消息：框架记下之后才提得出模块的放行，人的话要在那之后。

`personSaid(state, words, shown.time)` 的起点是这次给人看的工具结果的时间。写进图的 `relay` 是 `said.relay`，也就是引文本身；`recordedAs` 只在 `add`、`reject` 的批注里出现，与原话分开写、带"主 Agent 记成"。同意写的是 `approve` 与 `edit`，里面没有模型自己的话。

整页稿：`Shown.exact` 取自调用块里的 `page`（`talk.ts:185`，`sample ?? page`），`after` 是给人看之后到人下一条消息之前，主 Agent 各条消息里 `type: 'text'` 的块（`talk.ts:171`，上限 16,000 个码点）。工具结果、思考块、与调用同一条消息里的文字都不进 `after`，因为 `Shown` 到工具结果事件才建。`sampleSeen`（`record.ts:592`）要求规整后的页是规整后的 `after` 的子串。页超出上限时尾巴被切掉，找不到，同样 `not_shown`，偏向拒绝。测试 `:1030`：没说和改一个字都 `not_shown`，页前后还有别的话则通过。按 `withAfter` 的写法，人在页出现之前插进一条消息，`after` 在那条消息处冻结，页进不去，也 `not_shown`（读代码，没有单独的用例）。

只有 `agree` 查整页；`add`、`reject` 只写批注，不放行任何东西。没分模块的目标不收 `page`，设计在汇报里、`text` 只是一句是非问，这是附录写明的。人说的"可以"是不是对这件事的同意，harness 判断不了，附录 §3.6 写明不防。

阶段写入的 `reason` 末尾加"一页放行稿 <摘要>"，摘要来自 `shown.exact`，也就是核对过的那一页。`pageDigest` 在 `record.ts`（用 `node:crypto`），不在 `src/graph/` 里，没有把 Node 内置模块带进客户端共用的纯函数目录。

### 大循环放行的写入次序与四个停下点

`releaseWrites`（`record.ts:343`）：先 `releaseReady` 重查门禁；对集合里每个 `stage` 不是 `design` 的候选写 `edit stage: design`（带 `relay`，`reason` 以同意记号开头），成功后用返回的新修订号；再按提议时记下的修订号批准集合（改过的节点 `stale_revision`、进 `skipped`，已经不是提议的节点放过）；全部成功且集合里不再有提议时写目标的 `release`。候选的写入失败或被跳过就不批准它，所以不会出现已批准而没有 `stage` 的直接特性子节点。

测试 `record-human-answer.spec.ts:1084` 用 `whileWriteFails(n)` 在第 2、3、6、7 次写入处抛错，对应附录的 (a)(b)(c)(d)。每次检查：目标 `isSplit` 为真；没有已批准而无 `stage` 的候选；不带 `page` 重提得 `invalid`（`field: 'page'`，而不是"not split"）；带 `page` 重提成功，(d) 的集合为空；人再说话后得 `released`；每个候选改 `stage` 的 `edit` 恰好一条，批准一次；模块子树里的节点仍是提议。附录点名的另三例（自己写了 `stage: release` 的候选被改回 `design`、提议之后候选被改过的 `skipped` 与 `partial`、第 2 步之后用新修订号批准）在 `:1056`、`:1069` 和主用例的历史断言里。

S9-3 的实测：我把同一个用例改成停下之后不重新给人看，直接再记一次同样的话。停在 2（A 的 `design` 写完、B 的没写）：`partial`，A 报 `stale_revision`；停在 3（两个候选都已写 `design`、没有批准）：两个都 `stale_revision`；停在 6（A 已批准、B 的批准失败）：B `stale_revision`；停在 7（只差目标的 `release`）：`released`。原因是 `write()` 拿 `first` 里的修订号对提议时记下的修订号，harness 自己的 `design` 写入让候选的修订号变了。结果是安全的（没有批准没给人看过的东西）、可恢复的，所以只是 LOW。(d) 的重放还露出 S9-5：成功说明里 `modules` 为空，句子成了"of goal-1.  are modules now"。

模块放行停在批准与阶段之间时，`moduleReleaseGate` 的"要放行的内容"认下面已有的批准节点，同样的话能直接接上（测试 `:1171`）。

### R5b-N1

提交选的是清掉 `orch` 的 `stage`，没有在仓库的图上做，给了命令、前后数字与否掉的两个做法。我在 `docs/graph` 的副本上用第 9 步的代码复现：

| 读法 | 清之前 | 清之后 |
| --- | --- | --- |
| `hourness` | 分了模块，模块 `orch`（设计，未放行） | 没分模块，没有模块 |
| `glm-house` | 分了模块，模块 `bottom`（`execute`，已放行） | 不变 |
| `m3`、`m7`、`dogfood`、`m3-1` 的 `moduleOf` | `orch`，未放行 | 无；阶段读 `hourness` 的 `execute` |
| `releaseVerdict` 焦点 `m3`、`orch`、`m3-1` | 拒绝，点名模块 `orch` | 放行 |
| `releaseVerdict` 焦点 `bottom` | 放行 | 放行 |
| `llm` 在 `m3` 下提的任务 | 提交说明测得 `proposed` | `approved` |

与提交说明逐项一致，`m2` 的阶段不变。

选择是对的。`orch` 的 `stage: design` 是 2026-10-27 迁移时随提议带进来的，历史里没有任何后来的阶段写入，不是人定的状态，清掉不推翻决定。设成 `execute` 的话 `orch` 仍是已批准带阶段的直接特性，`hourness` 仍读成分了模块，只是 `isReleased` 变真，等于声称放行过一个人没有放行的模块。"方向清单存在才认模块"的代码开关有先后问题：先提模块候选、后提 `norm-directions` 的次序里，分了模块的目标会走单层放行，一次批准所有模块子树。清掉与附录 §9 第 16 条 (a)、第 5 轮评审 R5b-N1 的第一个改法一致。`bottom` 保持原样，仍是 `glm-house` 下已放行的模块，所以在 DSH 里用带原话的写入给 `glm-house` 直接加特性会被 c、d 拒绝，要先把目标退回设计；这是附录 §3.14.1 的结果，提交说明已写明。

没有执行的部分是 S9-1。简报禁止应用图改动，所以只能给命令。提交纠正了第 8 步的说法：命令行以 `llm` 写，`llm` 改不了已批准特性的阶段，会得 `forbidden`，要带 `relay`，也就是要人的原话，或由编排方在人同意后以 `human` 调引擎。期限的问题：提交与 HANDOFF 写"主 Agent 第一次在这个仓库的 DSH 里跑之前必须做完"。`initialStatus` 的收窄在引擎里，不依赖设计行，合入 main 之后编排方自己用命令行在 `m3`、`m7` 下提任务就出生为提议。M7 的 `src/graph/execute-stage.ts` 里有同签名的替身，m3 合入时换成 `modules.ts`，从那一刻起 `releaseOf` 读到 `orch` 是未放行的模块，派发停。所以合入 main 是更早的期限。第 8 步评审 S8-4 的第三个条件（写进 `m3` 的合入前清单）在图上也还没做：`m3` 最新的清单批注（2026-11-01T07:13Z）没有这一条。

### 模块阶段：引擎的两处与守卫的模块分支

引擎两处与 §3.14.7 一致：`moduleSendBack`（`engine.ts:648`）只放非特权写入、模块、`set` 只有 `stage: design`、现在的阶段在 `release` 或之后、`reason` 非空且不以同意记号开头（以它开头得 `invalid`）；`underUnreleasedModule`（`engine.ts:435`）让未放行的模块或候选下的任务出生为提议，带原话的写入仍是已批准，由守卫 d 拦。`graph-engine.spec.ts` 末尾的四个用例覆盖两处和它们的边界（`harness` 与 `llm`、其他字段同改、向前改、完成的模块、非模块的特性、各类节点的出生状态）。

守卫的 `hasSettledModules` 要求目标已出设计循环且 `modulesOf` 不空，这样单独一个候选不会把已放行目标下的每个提议特性读成新模块（解释 3）。

我顺着找主 Agent 在 DSH 里让模块或目标进 `release` 的路：向前改阶段被 a 拒，带原话也拒；带原话提议带 `stage` 的特性被 d 拒；不带原话提议的候选停在提议，框架放行时被 harness 改回 `design`（测试 `:1069`）；批准被 c 拒；`record_human_answer` 是唯一的路，它要先过 `personSaid` 与整页检查。没有找到别的。嵌套调用不在这个判断里（S9-2）。

### 主 Agent 写文件与高峰

这一步没有改主 Agent 的工具面。两个工具的新参数 `module`、`page`、`sample` 只用于显示与核对；`pageDigest` 只留摘要；新代码里除引擎写图之外没有文件写入。所以没有新增写文件的路。"主 Agent 没有办法写文件"仍受 S4-1 的洞限制：PTC 预设下嵌套的写工具和 shell 调用不过规矩，这一条要在合入前修好之后才能无条件成立。

高峰：`rules` 行的 `peakHoldFor` 在 `src/rules/`，这一步改动的文件里没有引用档位服务；两个工具的 `release` 支同步返回，没有等待（唯一的重试是目标阶段写入遇到 `stale_revision` 时立刻重读一次）。

### 流程规则与点名的用例

一个提交，名字里有 `m3-3`、`m3-4`；文档（ORCHESTRATION §3.1、§4.5、§4.8、§4.9、§6.4、§6.9、§10.5.1，DESIGN，HANDOFF，DEVELOPMENT）与代码同一批；§9 第 16 条 (c) 提到的 `docs/CHARTER.md` 没动，我搜了放行、方案、两层、模块等词，没有找到与这一步矛盾的句子。设计行仍默认禁用，没有新行，没有改 `apply`。共用模块 `ANSWER_MARKS`、`openEngine`、`normalizeText` 都是复用的，没有新的锁或项目根函数。

附录点名的 L2 都在，没写的有理由：真跑的标定要桌面版与积分；模块放行的 `reject` 与 `add` 走同一条批注路径，只测了 `add`；模块门禁的"集合为空 `gate_unmet`"与"集合里节点的 `source` 指向目标一级未拍板的待决"只在 `graph-stage.spec.ts` 的 `moduleReleaseGate` 用例里有，没有走到 `propose_to_human` 这一层，提交说明列了。L3 的第 6 步改成先给人看 B 的放行再用编造与挪用的话，原因是附录自己的次序（先查给人看过、再查原话）让原来的写法不可能（解释 9）。第一个标定任务的 `check.mjs` 抽出共用库后，检查名与语义不变，我对着差异看过。

十一条解释里 1 到 4 补充或收紧了附录的条件，5 到 11 是附录没写死的细节。1 与 2 只在重放的图状态下起作用：集合为空而又能通过"要放行的内容"，要求模块下有一个未被丢弃的决策且下面有已批准的节点，DSH 里的主 Agent 造不出这个状态（它造的决策是提议）。

### 前几轮留下、这一步碰到的

- S8-4 的三个条件：第 9 步写出前后对比（做了）；主 Agent 第一次在这里跑之前清掉（未做，S9-1）；写进 `m3` 的合入前清单（未做）。
- S8-3 与 S4-1、S5-1、S6-2：未变，S9-2 说这一步多出的面。
- S8-7（`confirm` 同意没有钉在给人看的那一版）：未变。`release` 不受这个问题影响，因为批准按提议时记下的修订号，改过的节点进 `skipped`，目标的字段 `llm` 本来改不了。

</details>

<details>
<summary>文件表</summary>

- `src/graph/stage.ts`：`releaseGate` 按 `isSplit` 分两支，加 `bigLoopSet`、`moduleSet`、`moduleReleaseGate`、`PARSED_LABELS`，两处标签改人话，`designColumns(graph, within, decision)`
- `src/graph/engine.ts`：`underUnreleasedModule` 收窄 `initialStatus`；`moduleSendBack` 在 `planEdit` 里
- `src/graph/proposal.ts`：`PAGE_LIMITS`、`pageRefusal`
- `src/guard/main-agent-graph.ts`：编辑、批准、提议三处加模块几支，`mainAgentOnly`
- `src/design/propose.ts`、`record.ts`、`tool-support.ts`、`talk.ts`：`release` 一种、`releaseWrites`、`pageDigest`、`releaseReady`、`releasePage`、`moduleOfGoal`、`exactOf` 读 `page`
- `src/design/stage-notice.ts`：框架与模块的"下一步"、"如果失败"一行、`designLines(..., split)`
- `scripts/probe/run-probe.mjs`、`scripts/calibrate/simulated-human.mjs`：场景 `glm-design-release`、`glm-design-modules`，模拟人日志带模块
- `tests/calibration/interview-expense-log-modules/`、`tests/calibration/interview-lib.mjs`、`tests/calibration/interview-expense-log/check.mjs`：新标定任务与共用库
- `tests/*.spec.ts` 与 `tests/design-tools-helpers.ts`、`tests/graph-memory.ts`：L2 用例与夹具（`design()` 夹具改成目标下直接挂任务，因为目标下直接挂特性就算分了模块）
- `docs/ORCHESTRATION.md`、`DESIGN.md`、`HANDOFF.md`、`DEVELOPMENT.md`

完整差异：`git -C .worktrees/m3 show e58d1ae`

</details>
