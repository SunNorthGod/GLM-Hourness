# M7 设计评审（`.agents/tasks/m7/design.md`）

| 总轮次 | 评审对象版本 | 挡路 | 不挡路 | 结论 |
| --- | --- | --- | --- | --- |
| 1（0.2 第 1 轮） | 0.2 | 3 | 13 | CHANGES_REQUESTED |
| 2（0.2 第 2 轮） | 0.2 | 0 | 11 | APPROVED |
| 3（0.3 第 1 轮） | 0.3 | 3 | 10 | CHANGES_REQUESTED |
| 上一次对 0.4 的评审（被中断，不计入趋势） | 0.4 | 表里曾写 0 | 表里曾写 5 | 表里曾写 APPROVED；该次运行（wf_526025270d4dab69）在写完这一行之后被停掉，正文从未写出，`design-review.json` 里也没有它，无证据可查，不采信 |
| 4（0.4） | 0.4 | 10 | 10 | CHANGES_REQUESTED |
| 5（0.5，最新） | 0.5 | 0（另有 3 条挡后续点名的步：E1b、E4、E8；按第 4 轮口径数 HIGH 与 MEDIUM 是 4） | 11 | APPROVED |

最新一轮（总第 5 轮）的详情在本文件末尾「# 0.5 第 5 轮」，它前面是第 4 轮「# 0.4 第 4 轮」。以下先保留 0.3 第 1 轮（总第 3 轮）的原文。

---

# 0.3 第 1 轮

评审对象：`.agents/tasks/m7/design.md` 0.3（2026-10-30）。之前的 `design-review.json` 没有 `pass` 字段，是 0.2 的评审留下的，本轮按 0.3 的第 1 轮处理。

挡路标准：`docs/DEVELOPMENT.md` §1.1，只有三类：要求或验收没满足；会造成收不回的损失却没有预防；失败了没有途径发现、恢复或事后追查。另外，违背任务里列出的任一定案（图上的决策节点与人的纠正）也挡路。其余意见不挡路，不影响结论。

核对方式：读了 0.3 全文；图节点 `d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`（含两条落地批注）、`d-one-main-agent`、`d-chat-not-cards`（含全部格式批注）、`d-design-onepage`、`d-defaults-readonly`、`d-rules-visible`、`d-peak-mode`、`norm-review-floor`、`norm-merge-gate`、`question-38`、`question-37`、`metrics`、`schedules`（含全部批注）；`.agents/tasks/design-context.md` 全文；循环板设计 `.agents/tasks/schedules/design.md` 0.1 里与 M7 相关的各节；M3 附录 `.agents/tasks/m3/design-addendum.md` 里快照、四行与持有者的各节。rc.3 的引用逐条对照 `reference/dsh-desktop-0.2.1-rc.3/`，ZCode 的引用对照 `reference/zcode-3.17.1/zcode.cjs`，本仓库代码读当前 main（`6a4ca29`）。本评审没有改任何已跟踪文件，也没有写 `docs/graph/`。

## 结论

CHANGES_REQUESTED。0.3 对四处方向纠正（没有 `/drive`、模型全由主 Agent 选、git 交给主 Agent、一个主 Agent）、问人改成四行聊天、两块板与指标流水的落法整体是对的，§1.2 的人话验收与 §13 的四行都过了换词表与 M3 的行规则。挡路的有三处：

1. F1：「已在上游的主干上」这一条豁免让主干与任务的完成证据绕过合入前的检查，而且可以用认得出的命令伪造，执行后也发现不了。
2. F2：必须全审的清单在条目没有判定写法时一律不强制，本仓库四条都没有，自举又允许在人回答 §13 ① 之前开始，等于暂停了人定的「主 Agent 绕不过去」。
3. F3：本稿说循环板设计还没成稿，实际 0.1 已在，它的接口与本稿不同，按两份设计各自实现之后，放行后建 goal、重启后对账、合入后全量检查这三个 harness 动作没有人执行，自动推进开不起来。

## 方向清单逐条对照

| 定案 | 结论 | 说明 |
| --- | --- | --- |
| `d-auto-drive` | 违背的风险，见 F3 | 设计本身没有 `/drive`，放行即建 goal、重启恢复、人暂停不恢复，都与 rc.3 对得上；但建 goal 的动作挂在循环板条目上，循环板 0.1 不执行它 |
| `d-main-agent-models` | 遵守 | `model`、`why` 必填，没有档位、没有默认、没有「高一档」；harness 只核目录、只记录。harness 自动重派一轮审查时沿用主 Agent 选的模型与理由，没有替它选 |
| `d-main-agent-shell` 与快照细则 | 违背，见 F1 | 合并、先后、冲突、回退都归主 Agent；子 agent 的危险 git 命令先存快照（M3 的 `takeSnapshot`），主 Agent 一侧由 M3 做。违背的是「那个提交确实跑过合入前的检查」：上游豁免不要求检查 |
| `d-one-main-agent` | 遵守 | 没有运维会话与 `/patrol`；提醒只送持有者 |
| `d-chat-not-cards` 与四行格式 | 遵守 | harness 不写给人的待决；草稿四行，§13 两题逐行核过：每行恰好一处加粗（3–7 个字），长度 17–33 个字，标签不加粗，问话在最后 |
| `d-design-onepage` | 遵守 | 方向清单在 §1.1；开工条件含一页放行稿；成批问、一次至多三件 |
| `d-defaults-readonly` | 遵守 | 十条默认条目与代码规则只读，没有配置项能关；高峰档位照旧能选 |
| `d-rules-visible` | 遵守 | 门在规则板、联动在循环板 |
| `question-38` C 与 `norm-review-floor` | 违背，见 F2 | 深浅由主 Agent 定、降档写理由、周报数降档后的返工都在；违背的是没有判定写法时不强制 |
| `norm-merge-gate` | 遵守（`only` 的第二层含义见 N1） | 检查由 harness 在提交上跑、由 harness 记；改松清单要人同意 |
| `metrics` | 遵守（写失败不降级见 N2） | 每个数都有 harness 写的事件；接口到位之前从原始记录算 |
| `question-37` A | 遵守 | §1.2 是草稿，待人逐条看；改写验收的 JSON 草稿不带原话，提交会被引擎拒 |
| `d-plain-questions` | 遵守 | §1.2 第三列与 §13 没有「验收」「标定」「门禁」等词 |
| `d-peak-mode`、`question-28` C、`d-rules-human-only`、`d-plan-approval`、`question-26` C | 遵守 | — |

## 挡路的发现

### F1（HIGH）上游豁免让主干与任务完成绕过合入前的检查，且发现不了

类别：违背 `d-main-agent-shell`（「主干前进的那一刻核对这个提交确实跑过合入前的检查」）；§1.1 失败没有途径发现。

位置：§3.8.4 `advanceOk` 第 1 条、执行前的写法表、执行后一支；§3.9.3 第 2 条；§3.11.2 「主干」一行。

问题：

1. `advanceOk` 第 1 条：`N` 是 `refs/remotes/<上游>/<主干>` 的祖先就放行，不要求任何检查记录。执行后一支对「成立」不分来源：给 `O..N'` 里尾注出现的每个任务写 harness 的 `commit` 证据并标完成，`check` 为 `null`。完成门禁第 2 条只要 harness 写的 `commit` 证据，所以一个目标可以在任务内容从没跑过 `norm-merge-gate` 的情况下完成。人在另一台机器上推的、带尾注的提交，拉下来也会这样把本机的任务标完成。
2. 远端跟踪引用是本地的，主 Agent 能用执行前放行的命令改它：`git update-ref refs/remotes/origin/main <X>`、`git fetch . <X>:refs/remotes/origin/main`（写法表只认 `<rev>:<主干>`，不认写进 `refs/remotes/`），然后 `git merge --ff-only origin/main` 按第 1 条放行。整条路上没有拒绝、没有违规记录。
3. 写在脚本里的 `git push origin <X>:main` 让已发布的主干前进到没检查的提交：执行后比对与每一步的比对只读 `refs/heads/<主干>`；巡检只数「既没有前进记录、也不在上游」的提交，在上游的恰好被排除。

要改成：

1. 第 1 条的豁免只放行这次前进，不写任务证据、不标完成：`advances.jsonl` 记 `{by: 'upstream'}`，指标记 `execute.advance {upstream: true}`。这些尾注里的任务，要等有一次通过的检查记录覆盖到含它内容的提交（主 Agent `check_commit` 它，或对账、巡检补写），才按「检查在前进之后」那一支补写证据。
2. 把远端跟踪引用当主干看：执行前写法表加 `update-ref refs/remotes/<上游>/<主干> …`、`fetch <本地路径或 .> …:refs/remotes/…`、对远端跟踪引用的 `branch -f`，一律拒绝（正路：`git fetch <远端>`）；执行后比对与每一步的比对同时读 `refs/remotes/<上游>/<主干>`（`git push` 成功时会更新它），它前进而 `advanceOk(上游的旧值, 新值)` 不成立时，按「不成立」一支记违规、不写证据。
3. 巡检加一项：主干上带尾注、却没有任何通过的检查记录覆盖的提交（不论在不在上游）。
4. L2 加三例：`fetch . X:refs/remotes/origin/main` 被拒；脚本里推送没检查的提交在执行后被发现；正常 `pull --ff-only` 拉下带尾注的提交，不写任务证据。

### F2（HIGH）必须全审的清单在没有判定写法时不强制，本仓库因此整张清单失效

类别：违背 `question-38` C 与 `norm-review-floor`（「由 harness 强制全审……主 Agent 绕不过去」）；本稿自己的 m7-4 第 2 条（「不管主 Agent 定了什么，都按全审做」）没满足。

位置：§3.7.1「底线清单的判定」；§3.8.5 末段；§6.1「没有判定写法的条目」一行；§12「没有判定写法的条目不强制」；§10.3 第 4 条。

问题：没有判定写法的条目「不强制全审」，本仓库已批准的四条都没有判定写法，所以在人回答 §13 ① 之前，清单对本仓库不起作用；§10.3 第 4 条又允许在 ① 回答之前开始自举。自举期间 DSH 里的主 Agent 可以给改 `src/guard/`、`src/graph/engine.ts` 的活定轻审或不审，这正是人说一律全审的几类。把这件事写进一页放行稿只是告知，不是人同意暂停这条规矩。§12 的理由（一律全审等于取消降档）只在人还没给写法的那段时间成立，代价是多审，往质量一侧错。

要改成：

1. 判不了就从严：`norm-review-floor` 里只要有一条 harness 判不了，每件写任务的有效深浅一律为全审，派审查时低于全审被拒（码 `floor_unparsed`，`hint` 列出判不了的条目）；行健康与规则板写明「这几条还没有机器认得的写法，暂时每件都全审」。每条都有判定写法之后按 §3.7.1 正常判。
2. §10.3 第 4 条删去「① 没加之前……底线清单对本仓库不起作用」，改写为「① 没加之前每件都全审」；§12 那一条按上面改写；§13 ① 的背景一行可以改为「清单现在只有人话，harness 判不出，所以**每件都全审**」。
3. 接管别的项目时同一条规则适用。L2 加一例：清单有一条没有判定写法时，`review: {depth: 'skip'}` 的有效深浅为全审，`depth: 'light'` 的派审查被拒。

### F3（MEDIUM）循环板接口按「未成稿」写，与已有的循环板 0.1 冲突，三个 harness 动作会没人执行

类别：违背 `d-auto-drive`（m7-3 第 1 条：放行之后不发命令就自己推进）；§1.1 失败没有途径发现。

位置：文首「循环板（`schedules`）……的设计已派出、还没有成稿」；§2.5；§3.9.1；§3.9.6；§3.11.1；§7 循环板一行；§15 U22。

问题：循环板设计 0.1 已经写成（`.agents/tasks/schedules/design.md`，图上 `df8d4f6` 记下，早于本稿的 `88a1e3c`），任务也写明它在并行设计、要对照。0.1 与本稿的差别不只是名字，按两份设计各自实现之后会坏：

1. 本稿把 `execute.start-drive`（建 goal）、`execute.reconcile`（重启对账）、`execute.trunk-check`（合入后全量检查）做成循环板条目的 harness 动作，由循环板调 `glmHournessExecute.runAction`。0.1 的 §2.4 第 7、8 行把建 goal 与对账定为留在 M7 的机制，它的第 5、8 项条目只提醒主 Agent，从不调 `runAction`。
2. 0.1 的服务 `glmHournessLoops` 只有 `recordRun` 与 `acceptProposal`，没有 `contribute`、`emit`；事件经库函数 `emitLoopEvent` 写进 `events.jsonl`，名字是 `design-released`（由 M3 发）、`task-handed-back`、`work-stopped`、`main-advanced`、`host-restarted`。本稿的退路执行者只在服务不在时启用，循环行一启用服务就在，M7 不再自己执行，而它的 `emit` 没有接收方：放行后没有 goal，重启后不对账，合入后不跑全量检查。本稿没有任何一处核对 harness 动作是否真的执行了：放行的判断只会在下一步再发一次事件。
3. 两份设计各自定义同一批默认条目（本稿 `entries.ts` 的十条，0.1 由循环行拥有的编排层十一条），都实现时晨报等会重复叫醒主 Agent；合入后的全量检查一边每次都跑，一边 `skipIfGated` 跳过已检查的。

要改成：

1. 建 goal、对账、合入后全量检查这三个动作由 M7 在事件发生时自己执行，不管循环板在不在；循环板上的条目只负责显示与提醒（与 0.1 §2.4 一致，也符合 `d-rules-visible` 的「机制留在代码」）。
2. 按 0.1 对齐，或把不同之处写成跨设计的待定事项交编排者裁定：默认条目只有一个拥有者（建议循环行拥有显示，M7 不另交重复的条目）；事件的名字与报法（`emitLoopEvent`）；`design-released` 只由一方发；合入后全量检查选「每次都跑」或 `skipIfGated` 之一。
3. 退路按所需的成员判断（例如是否能投递 M7 的提醒），不按服务在不在；对不上时行健康写明「循环板接口与 M7 不符：M7 自己执行事件条目」。
4. 文首、§7、U22 改为引用循环板 0.1；`graph-ops-v03.json` 给 `schedules` 的批注写明这几处差别。

## 不挡路的发现

### N1（MEDIUM）`only` 的第二层含义没有写进 §13 ②

位置：§3.8.1 `only` 一行、§3.8.4 检查一条、§13 ②。`only` 有两层：只改这些路径的前进不跑命令；两个提交只差这些路径时共用一次检查。§13 ② 的四行只说了第一层。第二层让主干前进到一个本身没被检查过的提交（检查的是另一个提交），与 `d-main-agent-shell` 的「那个提交」有出入。风险与第一层相同（图文件写坏要等合入后的全量检查），所以不挡路。建议：在 ② 或一页放行稿里写明第二层，或者删去第二层（`merge` 阶段提醒里「图文件可以直接提交在主干上」走的是第一层，够用）。

### N2（MEDIUM）指标写失败只告警一次，行健康不降级

位置：§3.16、§6.1。`AGENTS.md` 要求失败要出声并上报。指标是人要「全记」的东西，报告以后从它算，静默丢事件会让周报的数悄悄变少。建议：第一次写失败起行健康为 degraded，写明丢了几条；报告在丢过事件的时段注明「这段的数不全」。

### N3（MEDIUM）重启可能被认成人暂停

位置：§3.9.1、§15。驱动器在 agent 空闲时，若这一轮的预约处于排队、认领或已取消，且 goal 是 armed，就 `goals.pause`（goal-round-driver:229–234）。桌面版关闭时若取消了正在跑的目标轮，goal 会变成 `paused`，§3.9.1 把它当成人暂停，不再恢复，m7-3 第 1 条（重启之后接着推进）就落空。建议：加进 §15（L4 第一批第 7 步核实），并写退路：M7 在 `goal/changed` 的 `pause` 时记下它是不是紧挨着宿主退出（例如 `<git>/hourness/` 里的进程心跳），是就按重启处理。

### N4（LOW）合入时不看审查过没过

位置：§3.8.4、§3.9.3。主 Agent 可以对定了轻审或全审、审查还没过的活直接 `check_commit` 并快进；完成门禁最终会因为审查任务没关而拦住，但审查是在代码进了主干之后才做。建议：主干前进照常放行，尾注里有效深浅不是不审、审查任务还没通过的任务暂不写完成证据；周报数「合入时审查还没过」的件数。

### N5（LOW）门禁工作树的破坏性命令没有先存快照

位置：§3.8.3 第 5 步、§6.3。门禁工作树只由 harness 写，丢的多半是检查命令生成的东西，所以不挡路。为了快照规则处处一致，建议 `git status --porcelain` 显示已跟踪文件有改动时先调 `takeSnapshot`。

### N6（LOW）巡检的主干全量检查在主 Agent 的工具调用里同步跑

位置：§3.11.2。`hourness_report {kind: 'patrol'}` 的工具体里跑全部命令，每条上限 30 分钟，主 Agent 这一回合与自动推进都被占住。建议与 `check_commit` 一样用 `hourness-gate` 的外部激活，工具返回「已开始」。

### N7（LOW）`/wish here` 之后，在跑的 worker 的请求送到旧会话

位置：§3.3.2、§3.4.2、§3.4.3。worker 的 `parent` 是旧会话；它已不是主 Agent，调不了 `answer_worker`，worker 白等 30 或 20 分钟。建议：请求与通知送 M3 `mainAgentOf` 给的当前持有者，并允许当前持有者回应前任派出的 worker；或在移交时提醒中断这些 worker。

### N8（NIT）`commands` 判定是否算被拦下的命令没写

位置：§3.7.1、§3.8.5。`outside` 写明被拦下的也算，`commands` 只写「跑过」。建议写明被拦下的同样算（与 `outside` 一致：试过就要全审）。

### N9（NIT）§1.2 没写目标整体的审查也由主 Agent 选模型

位置：§1.2 m7-3、m7-4。§3.9.4 写了，人话验收没写。建议 m7-4 第 1 条末尾加「目标整体的审查也一样」。

### N10（NIT）几处行号

- `subagent:1214` 的注释「Process-local, never durable」在 1215；1214 是 `maxActiveSubagents`。
- §3.8.2「`waitForChildren` 等外部激活的 `result`，subagent:1310–1313」：等外部激活的是 1305–1307，1310–1313 是本地子 agent 与 `ownedChildren`。§4 表里 1296–1330 的范围是对的。
- `zcode.cjs` 「第 386 行」：`glm-5.3` 在 386，`glm-5.3-flash` 在 387。
- `goals.block`（720–735）：`block` 是 720–729，730–735 是 `clear` 的注释。

## 已核实的假设

- 派发：`startActivation` 3036–3048（父 agent 必须是活的那一个，3045；预留 `childId` 只给本地后端，3038）；`DUPLICATE_CHILD` 1430–1437；`cwd` 绝对路径原样用 1523–1527；`agentOptions` 合并在父路由之上、换模型不给档位时清掉档位 293–303、315–329；`maxActiveSubagents` 默认 8（2980）、`ACTIVATION_LIMIT_REACHED` 1046–1048；`resolveMaxDepth` 3023–3030。
- 交回：有 schema 却没交、回合 `completed` 时结算为 `error`（1110–1113）；`caller` 模式不附交回指引（1460）、不送结算通知（2049）；冷恢复（2094–2095、2141–2189）；结构化结果正在提交时拒绝消息（1588）。
- 外部 provider：`registerProvider` 3256–3267；能力全为否 2789–2794；`assertCapabilities` 只查 `agentOptions`、`outputSchema` 等，检查的请求不带它们，可以起；`waitForChildren` 等外部激活（1305–1307）。
- goal：`create` 不查人的授权、已有未完成的抛 `GOAL_ALREADY_EXISTS`（635–650、639）；`agent/created` 时 disarm（594–596）；`resume` 只拒绝 `active` 且 armed、轮次用尽（686–699）；`block` 原因码小写连字符（76–83），`hourness-waiting-human`、`hourness-idle-rounds` 合法；`goal/changed` 载荷（872–877）；`objective` 只要求非空（460–463）。
- 驱动器：目标轮提示词（goal-round-driver:11–19）；每拍前等后代（130–133）；`round-limit`（135–140）；取消回合时暂停（223–242）。
- `update_goal`：人的输入只认根 agent 回合里来源为 `user` 的消息（tool-goal:49–52）；`complete`、`blocked` 要人或当前目标轮（72–80）；`create_goal` 要人（292）；`edit`、`pause`、`resume` 要人，模型不能恢复人暂停的（343–352）；`/goal pause`、`/goal resume`（command-goal:11、146–151）。
- 工具钩子：`tools/pre-execute` 3321、拒绝即工具错误 3337–3353；`tools/post-execute` 3599–3600；`exec.callId` 1267。
- 其他：`followup`、`steer`（agent-loop:806–811）；`listModels` 目录不约束路由（llm:2080–2101）、`resolveModelInfo` 带 `reasoning.efforts`（2111–2116、2144–2159）；会话 id 字符集（session-persistence-jsonl:866）；子 agent 不能问人（user-questions:534）；headless 退出条件（349–351）。
- 本仓库：`LLM_EDITABLE` 不含 `acceptance`（engine.ts:101）；`initialStatus`：进行中的任务下的任务直接批准、复盘在开放的父节点下直接批准（417–428、104）；批注丢弃 `relay`（150）；不认识的字段报错（format.ts:91）；`effectiveStage`、`releaseSet`、`labeledSections`（stage.ts:90、172、61）；GLM 目录 `glm-5.3`、`glm-5.3-flash`（models.ts:25–28，zcode.ts:316–318）；ZCode 3.17.1 里两个 id 都在（zcode.cjs:386–387）。
- M3 附录：主 Agent 一侧的快照只管主 Agent 自己的 shell，子 agent 的 git 归 M7（§2.5）；`proposalLineRefusal` 的行规则（每行恰好一处 2–12 字加粗、三行至多 40）；`mainAgentOf` 导出。
- 本稿 §1.2 第三列与 §13 的四行没有换词表里的词；§13 两题与 §3.7.4 的例子都过 M3 的行规则。

## 没核实或不对的假设

- 「循环板的设计已派出、还没有成稿」不对：0.1 已在，接口不同（F3）。
- 「`refs/remotes/<上游>/<主干>` 里有的就是别人推上去的」不成立：这个引用在本地，主 Agent 能改（F1）。
- 「本仓库四条没有判定写法时不强制，只是告知人」与人定的「绕不过去」不符（F2）。
- 桌面版关闭时驱动器会不会把 goal 暂停，没有核实（N3）。
- `glmHournessExecute.runAction` 由循环板调用，循环板 0.1 没有这个调用（F3）。
- §15 已列的 U1–U24 本轮没有新的证据，照旧待 L3、L4 核实。

---

# 0.4 第 4 轮（总第 4 轮）

评审对象：`.agents/tasks/m7/design.md` 0.4（2026-10-30，文件时间 13:40，图上 `m7` 的 0.4 批注在 05:41Z）。评审者没有写过 0.4。本轮的依据是 2026-10-30 18:37 本机的盘上稿与图（main `9390219`）。

挡路标准同前几轮：`docs/DEVELOPMENT.md` §1.1 的三类（要求或验收没满足；会造成收不回的损失却没有预防；失败了没有途径发现、恢复或事后追查），加任务规定的三类：违背人的定案（HIGH）、与已定稿设计的接缝契约不符（HIGH 或 MEDIUM）、照文字无法实现或实现者只能靠猜（MEDIUM 起）。HIGH 与 MEDIUM 都挡路。

核对方式：

- 读了 0.4 的版本说明、§0–§3.1、§3.2.4、§3.4、§3.5.1–§3.5.4、§3.6、§3.7、§3.8（全节）、§3.9（全节）、§3.11、§7、§8、§9.1–§9.2、§10–§14、§17；§3.12–§3.16、§4–§6、§15、§16 只按需查了与本轮发现有关的行。
- 读了 `.agents/tasks/design-context.md` 全文；图节点 `m7`（35 条历史全读，含 06:11Z 到 10:20Z 的五条新批注）、`dogfood`、`d-dogfood-scope`、`d-rules-peak-slice`、`d-main-agent-peak-exempt`、`d-script-timeout`、`d-agent-examples`、`d-subagent-sonnet`、`d-design-onepage`、`d-rules-in-repo`、`d-boards-as-hooks`、`d-memory-scope`、`d-alignment-rounds`、`norm-merge-gate`、`norm-review-floor`、`question-37`、`question-38`。
- 邻居设计只读 M7 碰到的节：规则板 0.10（§3.6、§6.5、§10.4、§10.7、§16、§16.1、附录 H 前的条目 F82–F90）；循环板 0.6（§2.1–§2.3、§3.1–§3.2、§4.2、§5.1–§5.2、§6.9、§17 M7 一节）；M3 附录 0.4（§9 第 7 条、第 4 轮评审 `reviews/addendum-r4.json`）；plain-ui 0.7 §11 的 M3、M7 各条；M4 0.4 里写给 M7 的各行；metrics 0.2（只有到 §10 的半成稿）。`docs/CHARTER.md` 0.7 §3.2、§6，`docs/ORCHESTRATION.md` §6.5。
- rc.3 与本仓库的抽查（0.3 评审已逐条核过，本轮只抽查 0.4 新引的与上轮改过的）：`subagent:1215`、`subagent:1305–1307`、`goal:720–729`、`goal-round-driver:229–234`、`tools:3321`（`ctx.waterfall` 的 `tools/pre-execute`）、`zcode.cjs:386–387`、`src/shared/route.ts:31`，都对。
- 没读 `.worktrees/` 下任何东西（规则板最小一片正在那里写）；没写 `docs/graph/`，没改任何设计文本。

## 结论

CHANGES_REQUESTED。挡路 10 条（HIGH 2、MEDIUM 8），不挡路 10 条。

趋势（总轮次，挡路条数）：1 → 3，2 → 0，3 → 3，4 → 10。条数回升，原因不在 0.4 的文字退步：第 3 轮的 13 条发现（F1–F3、N1–N10）在 0.4 里全部关闭（下表有证据）。新增的 10 条全部来自 0.4 落笔（05:40Z）之后的人定案与邻居设计的定稿：`d-main-agent-peak-exempt`（人在 05:36Z 说出，0.4 在 05:40Z 落盘，写稿读到的是更早的规则板 0.8，没有吸收）、`d-design-onepage` 扩到产品（05:19Z 的批注明说 0.4 若没赶上、实现开工前补上）、`d-agent-examples`（06:41Z）、`d-script-timeout`（06:27Z）、`d-rules-peak-slice` 与 `d-dogfood-scope`（06:34Z–06:36Z）、规则板 0.9/0.10、循环板 0.5/0.6、plain-ui 0.7、M4 0.4、M3 附录 0.4 的 §9 第 7 条。

两条 HIGH 在实现开工前必须改（它们改的是 E1a、E1b、E8 的函数签名与判断表）。八条 MEDIUM 里，F3、F6、F7、F8、F9 也要在开工前或 E4 之前改完；F4、F5、F10 可以在实现中改（见「对开工的影响」）。

## 第 3 轮（0.3）发现的关闭情况

| 发现 | 状态 | 读到的证据 |
| --- | --- | --- |
| F1（HIGH）上游豁免绕过合入前的检查 | 已关闭 | §3.8.4 开头「没有别的例外（0.3 的『`N` 已在上游的主干上』一条删去）」；执行前判定表有三行：本地主干要先拉取才知结果的写法一律拒绝（`pull`、`fetch` 进本地主干），远端跟踪引用 `T` 的 `update-ref`、`symbolic-ref`、写进 `refs/remotes/` 的 `fetch` refspec、`branch -r` 的改写一律拒绝，推送按 `pushOk` 判；执行后读 `L` 与 `T`，`T` 变了按 reflog 分拉取与推送，推送不成立记违规并交 `hourness.outside-advance`；每步开始再比一次；§3.11.2 巡检用 `ls-remote` 对照真实远端，列主干上带尾注却没有检查记录覆盖的提交；§9.1 `glm-exec-merge` 有伪造跟踪引用、脚本里推送、`pull --ff-only` 三种用例。残余：`incomingFloor` 的豁免靠 reflog 说明判「真拉取」，同一次调用里夹一个真实 `fetch` 再用脚本 `update-ref -m "fetch: x"` 能把它伪造成拉取，§3.8.4 末尾已承认并交给巡检；这是 §12 标为「最可能不对」的那条，不作为新发现 |
| F2（HIGH）必须全审清单没有判定写法时不强制 | 已关闭 | §3.7.1「判不了就从严」：`unparsed` 非空时每件写任务的有效深浅都是全审，`depth: 'light'` 被拒（`floor_unparsed`）；§3.8.5 整张清单第 3 种与「本仓库已批准的四条现在都没有判定写法，所以落在第 3 种」；§10.3 第 4 条、§12、§13 ① 的背景一行都改了；§9.1 `glm-exec-review` 有「多一条没有判定写法」的用例；E6 的「今天必败」写了。本轮在图上核到 `norm-review-floor` 的四条验收确实没有反引号写法 |
| F3（MEDIUM）循环板接口按「未成稿」写 | 已关闭 | 对着循环板 0.6（不只是 0.3）核了：`contribute(source, {events, entries, actions, run})` 的形状、`ContributeResult` 的 `accepted`/`dropped`、`emit` 的 `EmitResult`（含 `duplicate`）、`HarnessResult` 三种结局、名字空间规则（`hourness.` 的例外只给 `glm-hourness/execute`）、每份至多 32/16/16 的个数（M7 是 7/9/5 与 3/0/0）、`why`、`limits`（5/30、30/30、5/6）、九个事件的字段与去重键（`hourness.handback` 的 `commits`、`floorHit`，两个前进事件的 `files`、`truncated`，`outside-advance`）、M7 的五个动作都在同一份 `actions` 里；循环板 §17 M7 第 1–7 条与 §5.1 的表都与 M7 §2.5、§3.11.1 对得上；§17 M7 第 6 条明写接受 M7 的 5 分钟自查。M7 与循环板各自的默认条目只在一处定义（循环板 §5.2 只有它自己的 4 项）。残余见 N2（`harness.tell` 的 `wake`） |
| N1 `only` 的第二层含义 | 已关闭 | §3.8.1 `only` 一行与 §13 ② 的推荐一行都写了两层 |
| N2 指标写失败不降级 | 已关闭（但见 N10） | §3.16、§6.7 写了降级与 `metrics-gaps.jsonl`；metrics 0.2 要求这个文件改为用指标流水自带的缓冲，属后续对齐 |
| N3 重启可能被认成人暂停 | 已关闭 | §3.9.1 的「重启前的暂停」一段与 `drive.jsonl`；`goal-round-driver:229–234` 抽查对得上（排队、认领或已取消且 goal 为 armed 时暂停）；U25 列在 §15，L4 第一批第 7 步核 |
| N4 合入时不看审查过没过 | 已关闭 | §3.8.4 执行后一支「状态是否转为完成另看审查」，`reviewPending`；§3.7.3 `b_k = 0` 一行在审查通过时补标完成 |
| N5 门禁工作树的破坏性命令 | 已关闭 | §3.8.3 第 5 步先 `takeSnapshot`，存不了不重置（`gate_snapshot_failed`） |
| N6 巡检的主干检查同步跑 | 已关闭 | §3.11.2 后台作业，工具返回「已开始」 |
| N7 `/wish here` 之后请求送旧会话 | 已关闭 | §3.4.3 每次送之前重取持有者，`answer_worker` 认当前持有者；§3.9.1 新增「批注里的会话不是当前持有者」一行。残余见 N4（`mainAgentOf` 的参数） |
| N8 `commands` 算不算被拦下的命令 | 已关闭 | §3.7.1、§3.8.5 都写了被拦下的同样算 |
| N9 目标整体的审查也由主 Agent 选模型 | 已关闭 | §1.2 m7-4 第 1 条末尾「目标整体的审查也一样」 |
| N10 四处行号 | 已关闭 | 抽查：`subagent:1215`、`1305–1307`、`goal:720–729`、`zcode.cjs:386–387` 都对 |

## 定案与方向清单逐条对照

| 定案 | 结论 | 说明 |
| --- | --- | --- |
| `d-main-agent-peak-exempt`（主 Agent 不受高峰影响） | 违背，见 F1 | 0.4 还把「不做档里规则板暂停主 Agent 的 goal」当成立的前提，并读已被删去的 `RulesService.heldForPeak` |
| `d-design-onepage` 扩到产品（两层循环、三档、成批至多三件） | 违背，见 F2 | 简报门禁、`derivedStage`、放行事件、pins 都只认目标一级；三档没有机制。「成批至多三件」已有（§3.7.4） |
| `d-agent-examples`（派活简报配一道示范） | 缺，见 F3 | 0.4 全文没有示范 |
| `d-script-timeout` | 缺一半，见 F5 | M7 自己不跑脚本，机制归循环板；M7 的份是周报里的「反复超时」一节，0.4 没有 |
| `d-rules-peak-slice`、`d-dogfood-scope` | 部分遵守，见 F6、F9 | E4 的少做上限读法与 E8 的高峰停住在 E 步里；但开始条件、验证与 §8.3 的先后没有跟上这一片 |
| `d-boards-as-hooks` | 遵守 | M7 交的是同一形状的数据条目（`when` + 动作），自己没有脚本条目；脚本执行器、同意的路都不重写；`trunkAdvanceFor` 缺见 F4 |
| `d-rules-in-repo`、`d-memory-scope` | 基本遵守，见 N1 | M7 的运行时文件在 `<git>/hourness/`，不在人说的 `.llm/`；与 M3 的快照流水同处，M3 第 4 轮评审没有挑 |
| 接缝裁定：少做上限只在派活处读一次 | 遵守 | §3.1.2 第 3 步：GLM 模型才读 `stateFor(主 Agent).glmWorkerCap`，到数返回 `slots_full`，非 GLM 不受限，服务不在时照原槽位；与规则板 §3.6、§6.5、§16.1 的说法一致 |
| 接缝裁定：高峰里等高峰结束 | 遵守 | §3.9.5：没进展的轮读 `peakHoldFor`，有值不计空转，连着 2 轮以自己的原因码 `hourness-peak-wait` 停住、不问人；`execute.resume-drive` 只恢复这个码；被高峰挡着的轮不算空转；循环板不在时 M7 在 `until` 后 5 分钟自己接上。规则板 0.10 §10.7 M7 第 3 条与循环板 §17 M7 第 6 条都确认这样做 |
| `d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-one-main-agent` | 遵守 | 同第 3 轮，本轮没有新的违背 |
| `d-chat-not-cards`、`d-plain-questions` | 遵守 | §13 两题各行一处加粗、四行加一句问话；§1.2 第三列与 §13 没有「验收」「标定」「门禁」等换词表里的词（核过） |
| `question-37` A、`question-38` C、`norm-merge-gate`、`norm-review-floor` | 遵守 | `norm-merge-gate` 在图上的七行（`setup $`、`$`、`$ … when`、`patrol $`、`push`）都落在 §3.8.1 的写法表里 |
| `docs/CHARTER.md` 0.7（写在代码里的门禁照旧先影子） | 缺，见 F7 | M7 有八道代码里的门，没有一处写模式 |
| `d-subagent-sonnet` | 无关 | 说的是 Kiro 侧派出的工作流步骤用的模型，不是产品里主 Agent 选的模型 |

## 与规则板 0.10、循环板 0.6 的接缝

| 对 M7 的请求 | 出处 | 0.4 的状态 |
| --- | --- | --- |
| `glmHournessExecute.trunkAdvanceFor(callId)` | 规则板 §10.7 M7 第 1 条；图上 `m7` 08:12Z | 缺，F4 |
| 删去 `heldForPeak` 的两处读 | 规则板 §10.7 M7 第 2 条；循环板 §17 M7 第 9 条；图上 `m7` 08:12Z | 没删，F1 |
| 不做档里派 GLM 子 agent 由规则板的门排队，M7 不另加判断；`peakHoldFor` 的空转判定不变 | 规则板 §10.7 M7 第 3 条 | 一致（M7 没有对不做档的派发另加判断） |
| 周报加「4 周没用过的规则」「反复超时的脚本规则」；晨报的规则板一节加晚到的拦下与规则文件被改过的次数 | 规则板 §10.7 M7 第 4 条 | 缺，F5 |
| 周报加循环板的 `staleEntries`、`timeoutEntries` 两节 | 循环板 §17 M7 第 8 条；图上 `m7` 08:12Z | 缺，F5 |
| 条目形状、事件、键、动作、结局口径、`execute.resume-drive` | 循环板 §17 M7 第 1–7 条 | 一致（见第 3 轮 F3 一行） |
| `only docs/rules/` 不请 M7 特殊对待 | 规则板 §10.7 M7 第 5 条 | 一致 |
| 少做上限的 L2 用例（`slots` 3、少做、高峰、已有 1 个 GLM 子 agent 时第二个 GLM 派发得 `slots_full`，非 GLM 照常；没有 `glmWorkerCap` 时照常） | 规则板 §10.7 | §6.6 有（本轮没逐字核，抽查在 §1.2 m7-2 第 1 条与 §3.1.2 第 3 步对上） |

## 挡路的发现

### R4-F1（HIGH）还在读已删去的 `heldForPeak`，并把「不做档里主 Agent 的 goal 被规则板暂停」当成立

类别：违背 `d-main-agent-peak-exempt`（「主 Agent 应该不受高峰影响，随时回复的」）；与规则板 0.10 §7.2 的服务契约不符；照文字无法实现。

位置：`design.md` 第 4 行（版本说明引 `RulesService.heldForPeak`）、第 156 行（§2.1 读别的行的服务）、第 269 行（§2.5 接口第 6 条「`rulesService(ctx)?.heldForPeak(session)` 为真时同样留着」）、第 272 行（「高峰停着时攒着（规则板的 `heldForPeak`）」）、第 818 行（§3.9.1 表中「goal 为 `paused`，`heldForPeak` 为真……不恢复：规则板在单解除时恢复它」，提醒写「Paused for GLM peak hours (level stop)」）、第 1137 行（§4 契约表 `glmHournessRules`）、第 1328 行（§6.6 可测性的 L2 列表「不做档里规则板暂停的 goal 的提醒不说成人暂停」）、第 1350 行（§7 规则板行）、第 1369 行（E1b「自动推进的判断表（含……不做档的暂停……）」）、第 1376 行（E8「不做档暂停的认法」）。

问题：

1. 人的原话落在图上（`d-main-agent-peak-exempt`）：高峰模式三档都不管主 Agent，「不做档的高峰里主 Agent 也排队」一类的文字作废。规则板 0.10 因此删了 `RulesService.heldForPeak`（§7.2、§16 R3、F85），规则板不再暂停主 Agent 的 goal，不做档只排子 agent 的派活与工具调用。0.4 第 818 行那一行描述的正是被作废的情形，第 269 行让提醒在一个永远为假的条件下攒着。
2. 契约层：`rulesService` 来自规则板 R3 的 `src/rules/service.ts`；0.10 的 `RulesService` 没有 `heldForPeak`，规则板最小一片（`d-rules-peak-slice`，规则板 §16.1）连这个文件都不交，只交 `src/shared/peak-mode.ts`。照 0.4 实现，E1b 的类型检查就过不了，E8 的退路执行者读不到东西。
3. 循环板 §17 M7 第 9 条与图上 `m7` 08:12Z 的批注已经明说「可以删」，规则板 §10.7 M7 第 2 条列了逐处。0.4 在这些批注之前写成，没吸收。

要改成：

1. 删去上面列的全部位置里与 `heldForPeak` 和「不做档暂停」有关的文字：§2.1 的 `rulesService` 一半；§2.5 第 6 条里「`heldForPeak` 为真时同样留着，……」整句；第 272 行括号里的 `heldForPeak`；§3.9.1 第 818 行整行（goal 为 `paused` 一律走下一行「其余」：人的暂停或被取消的目标轮）；§4 的 `glmHournessRules` 一行；§6.6 L2 里「不做档里规则板暂停的 goal 的提醒」一例；§7 规则板行里「`rulesService` 的 `heldForPeak`……不做档暂停的认法」；E1b 的判断表和 E8 去掉「不做档的暂停」「不做档暂停的认法」。
2. §7 规则板行改为只依赖 `src/shared/peak-mode.ts`（`PeakModeService`、`peakModeService`）与 `parseFloor` 的导出，不再提 `src/rules/service.ts`。
3. 同批改 `graph-ops-v04.json` 里给 `rules` 的批注（「请规则板改一处」之外，再写明 M7 已不读 `heldForPeak`），以免图上留着相反的说法。

开工前必须改：E1b 的判断表形状、E8 的退路执行者和 §4 的契约表都受影响。

### R4-F2（HIGH）两层循环没有进 M7：简报门禁、阶段推出、放行事件、pins 都只认目标一级，三档没有机制

类别：违背 `d-design-onepage`（产品里用户的项目也走两层循环：「两层循环加，我正想说这个事情呢」；「一个模块没放行之前不派它的开发」）；照文字实现会造成相反的行为。

位置：`design.md` 第 474 行（§3.5.1 门禁表「所属目标的推出阶段不早于 `release`」，码 `not_released`）、第 215 行（§2.4 `derivedStage(graph, goal)`）、第 242 行与第 807 行（§2.5 事件 `hourness.design-released`、§3.9.1「放行的认法」按焦点目标的 `stage` 历史）、第 534–538 行（§3.5.3 pins 表里祖先只有 `acceptance`、`nonGoals`、状态）、第 52 行（§1.1 对 `d-design-onepage` 的遵守说明只写了成批至多三件）、§1.2 m7-2/m7-3、`onepage.md`。

问题：

1. 图上 `m7` 的 05:19Z 批注：「d-design-onepage 扩到产品：……开发中的问题按三档处理（只影响本模块且可逆的主 Agent 定、下一批告知；改到模块设计方向的退回该模块的设计循环；改到框架的退回大循环，受影响的部分暂停），成批问人一次至多三件；一个模块没放行之前不派它的开发。M7 下一稿照此写；当前在写的 0.4 若没赶上，在实现开工前补上。」design-context「Two-level loop in the product」说三档与成批归 M7，放行归 M3。plain-ui 0.7 §11 第 6–9 条把形状作为契约交给 M7（`derivedStage(graph, node)` 接受模块；第二档把模块的 `stage` 改回 `design`；第三档把目标的 `stage` 改回 `design`，受影响的活停下由 M7 管）。0.4 全文没有「模块」这一层（全文搜「模块」只有把 M7 自己当一个模块的说法，如第 42、52 行，和代码里的「模块级」「模块作用域」）。
2. 实际后果有两种，都不对：（a）门禁只看目标：目标放行后，主 Agent 可以派任何一个模块的活，哪怕那个模块的一页放行稿人还没看；（b）若 M3 按其第 4 轮评审的方案 A 做（目标要等最后一个模块放行才到 `release`），已放行模块的开发被 `not_released` 挡住，两层循环里「先放行的模块先开发」做不到。
3. 开始推进也按目标一级：`hourness.design-released` 的键是 `design-released:<goal>:<release>`，第一个模块放行时没有事件，后面的模块放行也没有「已放行，接着分解」的提醒。
4. 第二、三档的「受影响的活停下」没有机制：pins 不含阶段，模块或目标退回设计之后，在跑的 worker 不过期，交回照样进审查与合入。
5. 第一档：`waiting_human` 门禁（第 478 行）写的是「任务子树里没有等人回话的待决」，没说只数决定者为人的；第一档的「决定者为 agent 的待决」若在拍板之前被数进去，会错挡派发。

要改成（M3 0.5 的细节由 M3 定，M7 写自己要的读法并在 §7 列依赖）：

1. `briefGate` 的 `not_released`：取任务最近的模块祖先（目标下带 `stage` 的特性）的有效阶段，要求不早于 `release`；没有模块祖先时取目标（现状）。`hint`：`This module's design is not released: put its one-page release to the person with propose_to_human (kind release, module <id>).`
2. `derivedStage(graph, node)`：`node` 是目标或模块，规则同目标（plain-ui 0.7 §11 第 6 条）。E1b 的签名与 L2 同改。
3. `hourness.design-released` 加可空字段 `module`；键 `design-released:<module 或 goal>:<该次放行历史的 at>`（仍是三段）。`execute.start-drive` 对一个目标只建一次 goal：目标上还没有「自动推进已开始」批注时建；已有时只批注「模块 <id> 已放行」，返回 `done` 并 tell 主 Agent 分解这个模块。goal 的 objective 写目标，不写模块。
4. pins：任务的每个祖先摘要多一个布尔「有效阶段是否不早于 `release`」（模块、目标各一个）。第二、三档因此让其下在跑的 worker 过期（现有的 `stale` 处理：不建审查、不写完成证据、建议 `interrupt_agent` 后重派），新派发被 `not_released` 拒绝。第三档另外：派发状态提醒（§3.5.4）列出「受影响的 worker」，不逐个由 harness 中断（`d-main-agent-shell`：中断是主 Agent 的事）。
5. `waiting_human` 与 `goalCompletion` 的待决判断写明：派发门禁只数决定者为人的待决；决定者为 agent 的待决（第一档）拍板之前不挡派发，完成门禁第 3 条仍要求它们都关了。
6. §1.1 的 `d-design-onepage` 行、§1.2 m7-2 第 1 条（加「这个模块还没放行」）、m7-3、`onepage.md` 各加一句人话；L2 加一个两模块用例（一个放行一个没放行；放行后第二档退回，在跑的 worker 过期；第三档退回，两个模块都过期）。

开工前必须改：E1a（`briefGate`、`pinsOf`）、E1b（`derivedStage`、判断表）、E4（`not_released` 的 `ctx.stage`）、E8（放行事件与 `start-drive`）的签名都会变。若人和编排方决定自举阶段先只按目标一级放行，这一条要在 §10.2 与 `dogfood` 节点上作为带理由的延后写明，而不是留空；但自举之后第一批要做的 M4、M5、M6 等模块恰好需要它。

### R4-F3（MEDIUM）`d-agent-examples`：M7 要配的派活简报示范没有

类别：未满足人的定案（`d-agent-examples`，06:41Z「彳亍」：「派活简报的示范归 M7」）；实现者要猜示范放哪、写什么、怎样保证不过期。

位置：§3.1.1（参数）、§3.5.2（简报文字）、§8.1 E4、§9.1。`design.md` 里没有「示范」「example」字样。

问题：`d-agent-examples` 要求主 Agent 写给人或交给 harness 的每种东西各配一道完整示范，放在写它的那个工具的说明里（不塞进身份节），示范过与真实输入同样的检查（L2 钉住，规则一改示范跟着失败），用与练习题（记账小工具）不相干的领域、只讲已定的事。M7 里主 Agent 写的是任务节点的派发属性（`kind`、`writeScope`、`acceptance`）和 `dispatch_task` 的参数（`model`、`why`、`review.depth` 与 `review.why`、`context`）；简报文字由 harness 从图生成，不是主 Agent 写的，所以示范要覆盖前两样。

要改成：

1. §3.1.1 加一节「工具说明里的示范」：`dispatch_task` 的说明（`src/execute/index.ts` 注册工具处）带一个完整例子：一个任务节点的派发属性、一次 `dispatch_task` 调用（`model` 取目录里的一个、`why` 一行、`review: {depth: 'light', why}`、`context` 两句）、harness 返回的 `{task, attempt, childId, …}` 摘要。领域取与记账小工具无关的（例：给一个静态博客加 RSS 输出），只写已定的事，不编新要求。
2. 示例放在 `src/execute/examples.ts`（常量），L2 `tests/execute-examples.spec.ts` 让它过真实的 `briefGate`、`checkModelChoice`、`review`/`quick` 的参数校验与 `plainWordsIn`；任何一条规则改了，这个测试失败。E4 的文件表补这两个文件。
3. 对照有无示范的效果留给练习题，不在 M7 的验收里。

`submit_plan`、`ask_main` 是 worker 的工具，不在 `d-agent-examples` 要求的「主 Agent 要写的东西」之内，不要求示范。

E4 之前改；E0–E3 不受影响。

### R4-F4（MEDIUM）缺 `glmHournessExecute.trunkAdvanceFor`，且与规则板的门谁在外层没说

类别：接缝契约不符（规则板 0.10 §10.7 M7 第 1 条，图上 `m7` 08:12Z）。

位置：§2.5 接口第 2 条（「`glmHournessExecute` 是……成员两个：`isWorker` 与 `runAction`」）、§3.8.4、§4 契约表第 1139 行、E7。`design.md` 里 `trunkAdvanceFor` 零命中。

问题：规则板的 `gate.trunk-advance`（要拦的事件，`gateOnErrorDefault: 'block'`）靠 M7 的 `trunkAdvanceFor(callId): {branch, from, to} | undefined` 推出；M7 没有它，规则板的 R4 按 0.10 写的是「M7 没合入时不推出」，合入后就一直推不出，人设的「合入主干前先跑某脚本」一类规则永远不触发。另有次序问题：规则板的门以 `prepend: true` 注册、在 `next()` 返回放行之后读 `trunkAdvanceFor`（规则板 §6.2 第 591 行起）；M7 §3.2 也以 `prepend` 注册，M7 行在 `cordis.patch.yml` 里排在规则行之后，后注册的 `prepend` 监听器在更外层，所以 M7 的监听器多半在外层〔推断，没有在 L2 里核过〕。外层先跑，只要 M7 在调用 `next()` 之前把记录写好，规则板在内层读得到；M7 若在 `next()` 之后才记，规则板读不到。0.4 没写 M7 在哪一刻记。

要改成：

1. §2.5 接口第 2 条的成员改为三个，加 `trunkAdvanceFor(callId: string): {branch: string, from: string, to: string} | undefined`；§4 第 1139 行同步。
2. §3.8.4 执行前一节加：`advanceOk` 成立、本地主干的前进结果可预知时，在调用 `next()` 之前按 `exec.callId` 把 `{branch, from, to}` 记在内存里；`tools/post-execute` 或 60 秒后删。拒绝的前进、认不出的写法（执行后才发现的）不记，返回 `undefined`。
3. L2 加三例：放行的 `merge --ff-only` 之后一个假规则门读得到；被拒绝的前进读不到；脚本里的前进读不到。

可以在实现中改，E7 合入之前。不在自举路径上（规则板的整块门在最小一片之外）。

### R4-F5（MEDIUM）周报与晨报没有加规则板、循环板要的几节，每周至多三件的算法也没定

类别：接缝契约不符（规则板 0.10 §10.7 M7 第 4 条；循环板 0.6 §17 M7 第 8 条）；`d-script-timeout`（超时与晚到的拦下进周报，反复超时的提议修）；design-context「Stale entries」（周报列 4 周没触发的规则与人加的条目，一个四行方案提议删，每批至多 3 件）。

位置：§3.10（晨报）、§3.11.1 的 `operate.weekly` 一行、§3.12.3–§3.12.4、§1.2 m7-8。

问题：

1. 周报要加：`rulesService(ctx)?.staleEntries(cwd)` 取至多 3 件交主 Agent 用一个四行方案提议删；`loopsService(ctx)?.staleEntries(project, now)`（人加的、4 周没跑出结果）与 `timeoutEntries(...)`（最近 7 天脚本超时 3 次以上，插件的也算，只写请作者修）；规则板自己的超时脚本规则一节；服务不在时写「循环板此刻不在这个 DSH 进程里，这一节下次再看」；晨报的规则板一节加晚到的拦下与规则文件被改过的次数。0.4 的 `operate.weekly` 提醒文字、`hourness_report` 的 weekly 内容与 m7-8 的「怎样算做完」都没有。
2. 每周至多三件的上限没有排序规则：升降提议（`norm-ladder`）、加类提议（`floor-add`）、删规则、删循环板条目、修脚本一共五种来源，规则板与循环板都写「各算周报的一件」，m7-8 第 3 条写「连同上一条每周至多 3 件」。五种争三个位置时取哪三种，实现者只能猜。

要改成：

1. §3.12.4 加一张表：节名 / 读什么（服务调用）/ 至多几项 / 服务不在时的话 / 对应的 `askDraft` 种类（新增 `stale-rules`、`stale-loops`、`fix-script`，各自过 `proposalLineRefusal` 与 `plainWordsIn`）。
2. 写定优先序（建议：修脚本 > 加类 > 升降 > 删规则 > 删循环板条目），每周合计至多 3 件，没排上的下周再出；L2 钉住。
3. `operate.weekly` 提醒文字、m7-8 第 3 条、§3.10 晨报的规则板一节同批改。

可以在实现中改，P2 开工之前。

### R4-F6（MEDIUM）规则板最小一片没有进 M7 的开始条件和验证，§10.1 与 §8.3 还写着「规则板没合入就不写这两处读」

类别：`d-rules-peak-slice` 与 `dogfood` 节点（子节点之一）的要求没落到 M7 的开始条件；验证计划的缺口。

位置：§10.1 末段（第 1458 行）、§8.3 第 1410 行、§10.3（第 1469–1473 行）、§9.1 `glm-exec-drive` 的末句、§9.2 第 9 步。

问题：`d-rules-peak-slice`：「M7 骨架 E4 的少做上限读法照原设计生效，M7 不加临时的高峰逻辑」；规则板 §16.1：这一片交 `glmHournessPeakMode`，`stateFor` 在少做档的高峰里带 `glmWorkerCap`，`peakHoldFor` 交「挡着的是不是高峰」，M7 在 E4 与 E8 各读一次。0.4 的状态：（a）E4、E8 的表里有这两处读，但 §10.1 与 §8.3 写「规则板还没合入时这两处先不写」，没说片子合入的是哪一步、没合入时自举能不能开始；（b）验证只有 L2 的假服务和 §9.2 第 9 步（第二批，等循环板和工作日高峰）；（c）§10.3 的开始条件四条里没有「这一片已合入、两处读在真实服务上跑过」，而 `dogfood` 节点把这一片列为自举的子条件。结果是：骨架场景全过、第一批 L4 通过，自举就可以开始，而 M7 读规则板的两处从来没对着真实的服务模块跑过。

要改成：

1. §10.1 末段与 §8.3 第 1410 行：写明自举路径上规则板只有最小一片；E4、E8 的两处读对着它的 `src/shared/peak-mode.ts` 写（`PeakModeService`、`peakModeService`、`PEAK_MODE_SERVICE`），不再「先不写」；片子晚于 E4 合入时由 E4 之后的第一个提交补上，并由哪一方带 L2 写明。
2. §9.1/§9.2 加一项第一批能做的验证：L2 用规则板片子的真实 `PeakModeService` 类型与一个返回固定 `{level: 'reduce', peak: true, until, glmWorkerCap: 1}` 的实现（不是 M7 自己编的假接口）；若片子带了可注入的计价/时钟接缝，L3 或第一批 L4 用它跑一次「少做、高峰、已有一个 GLM worker 时第二个 GLM 派发得 `slots_full`」和「连着两个没进展的轮以 `hourness-peak-wait` 停住」；片子没有这个接缝时，开始条件接受 L2 加类型契约测试，并在 §9.2 第 9 步写明真实高峰的核对留到第二批。
3. §10.3 的开始条件加一条：规则板最小一片已合入，第 2 点的验证已过。

E4 之前改；自举开始前必须验完。

### R4-F7（MEDIUM）八道写在代码里的门没有写模式，`docs/CHARTER.md` 0.7 要求新门禁先影子

类别：未满足已生效的宪章；实现者要猜。

位置：§2.5 门一行（八个 id）、§3.2、§3.8.4、§3.9.3、§8.1 E4/E7/E8、§12。`design.md` 里「影子」只出现在规范阶梯（第 958、962 行）。

问题：`docs/CHARTER.md` 0.7（§3.2 第 3 条、§6）：规则板与循环板上人看过原文同意的条目即刻生效；写在代码里的新门禁照旧先影子后拦截（`docs/ORCHESTRATION.md` §6.5），新行默认禁用。规则板 0.10 的 F82 重申了这一点，点名的是「M4 的四条影子规则与 M7 的升级阶梯」，M4 0.4 要求每条经 `installRuleGate` 安装的规则带 `enforce` 或 `shadow` 的模式。M7 的八道门（`worker-scope`、`dispatch-chain-readonly`、`worker-graph-readonly`、`worker-git`、`worker-message-live-only`、`trunk-advance-checked`、`completion-gate`、`stopped`）一个模式都没写。E9 的「合入后一个提交把 `execute` 改为默认启用」满足「新行默认禁用」，满足不了「先影子」。全部先影子会让自举期间主干前进的核对只记录不拦，违背 `d-main-agent-shell`（「主干只前进到跑过合入前检查的提交」）；全部直接拦又与宪章字面不符。

要改成：在 §2.5 的门一行或 §12 写一张表，每道门写模式与理由。建议：五条 worker 规则与 `stopped` 只管 M7 自己登记表里的角色，没有已有行为可量误伤，首日 `enforce`，理由写进表；`trunk-advance-checked` 与 `completion-gate` 守的是人定的保证，首日 `enforce`，同样写理由；这两类各标「宪章 0.7 的例外，agent 定，可推翻」，并在一页放行稿里让人看到（这是人批过的宪章，不是 agent 能默默破例的）。人不同意时，改为首日 `shadow`、按 M4 的 `PROMOTION` 转生效，自举期间主干前进的核对靠主干前进的执行后比对和巡检兜底（现有的「检查在前进之后」一支）。

E4 之前改（模式是安装规则时的参数）。

### R4-F8（MEDIUM）m7 的验收要求每个数写进指标流水，而指标流水不在自举路径上

类别：验收条目与自举范围冲突；人要逐条看这些条目（`question-37` A），写错了他看到的就是做不到的承诺。

位置：§1.2 `m7（特性）` 一行第 3 条（第 90 行）、§1.3「每个数在指标流水里」、§3.16、E2（`emitMetric`「接口到位之前什么都不做」）、§10.3 第 2 条。

问题：第 90 行写「链路上的每个数（模型、花费、用时、被拦次数、派活、审查、合入、问人）都由 harness 写进指标流水」。`d-dogfood-scope` 把指标流水的实现放在自举之后，metrics 0.2 也只到半成稿；E2 的出口在流水到位前什么都不做，§10.3 第 2 条的数从原始记录读。所以 E9 验收时这一条做不到，要么被默默放过，要么逼着实现者去建指标流水。

要改成：第 3 条改写为「……都由 harness 作为事件交给指标流水的出口；练习用的出口记下每个事件，每一类各出现一次；写进真正的指标流水，等指标流水做好之后再核」，并配 L2 `tests/execute-metrics.spec.ts` 用注入的出口断言（§3.16 的事件表每类一次）。§1.3 与 §10.3 第 2 条同步。放行稿里这一条的人话同步改。

开工前改（人放行的就是这几条）。

### R4-F9（MEDIUM）§8.3 的先后让 M7 排在 M3 全部合入与规则板整个 R4 之后，自举路径上等不到

类别：前后矛盾（M7 §8.3 与 `dogfood`/`d-dogfood-scope`/`d-rules-peak-slice`），会让骨架迟迟开不了工；`question-28` C（没有副作用的尽量并行）。

位置：§7 M3 一行（「M7 在 M3 合入之后开工」）、§8.3 第一段（「M3 合入之后 E0 先做」）与第 1400–1412 行的表。

问题：

1. 图上 `dogfood` 10:20Z 的批注：编排方把 M3、M7 最薄骨架、规则板最小一片「并行推到底」。§8.3 把 M7 整个排在 M3 之后。E1a、E1b（除了要 M3 的 `proposalLineRefusal`、`plainWordsIn` 来测草稿）、E3 只建新文件；E0 与 E2 只往 `scripts/packages.mjs`、`src/shared/tool-names.ts`、`tests/contracts.spec.ts` 各加几行。
2. 表里把共享文件的次序写成「M3 → 规则板 R4 → E2」「M3 → 规则板 R4 → E4 → P3」「M3 → E0 → 规则板 R4 → E4」。整块 R4（规则行、等待单、工具、门）在自举之后；自举路径上只有最小一片。字面照做，E2、E4 要等一个自举之后才会做的步骤，路径成环。
3. `src/data/lock.ts`：表里写「先开工的一方建，同时开工 M5 先」，而 M5 不在自举路径上；规则板最小一片的存储子集若也要锁，与 E3 并行时没有指定谁建。

要改成：

1. §7 与 §8.3 按步写依赖：E0、E1a、E3 可以现在就从 main 开分支做；E1b 的测试等 M3 第 3、6 步（`plainWordsIn`、`proposalLineRefusal`）；E2 等 M3 第 6 步（同改 `tool-names.ts`）；E4 等 M3 第 3–5 步与规则板最小一片的行登记。
2. 表里的「规则板 R4」全部换成「规则板最小一片（`d-rules-peak-slice`）」；整块 R4 排在 E9 之后。
3. 共享的登记文件（`scripts/packages.mjs`、`cordis.patch.yml`、`health.ts`）后合入的一方把冲突的几行机械地并进去，不重审；`src/data/lock.ts` 指定先建的一方（建议 M7 的 E3，规则板最小一片不需要锁；若需要则它先建）。

编排方可以先裁定，设计文字随后改；不改会让 E0 在 M3 十二步全部合入之前一直开不了工。

### R4-F10（MEDIUM）M4 0.4 写给 M7 的几条没有处置，其中两处与 M7 现文冲突

类别：接缝契约不符；两份设计对同一件事有两种定义。

位置：§3.2（第 340 行「用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`）」）、§3.12.2（第 962 行「影子转生效（近 14 天影子记录不少于 20 条且人没标过误判）」）、§3.9.5、§3.8.3 之后的汇合门禁、§7 依赖表。图上 `m7` 07:12Z 的批注。

问题（M4 0.4 的请求，只列 M7 一侧）：

1. M4 G1 删掉 `evaluate`，所有规则改经 `installRuleGate`；M7 §3.2 还写 `evaluate`。M4 §3.1 的 `rightPath`，M7 的规则要自己写。
2. M4 §3.5 的 `PROMOTION` 是影子转生效判据的唯一出处（带标注的会拦样本至少 20 条含回放、实时影子至少 14 天、误伤 0），含义与 M7 §3.12.2 不同；`ladderProposals` 读违规流水要用 `classifyRecord`。
3. `worker-scope` 在目标出了工作树时先 `peekGrant`、拒绝时 `outsideDenial`，`ask_main` 要被认作 `rightPath`；推进监听器读 `openRequests(持有者会话)`，非空时以 `hourness-waiting-human` 停住 goal，申报关了再恢复（§3.9.5 的恢复规则加一句）。M4 写的是「谁后合入谁加」。
4. 汇合门禁加「草稿区为空」一步（`scratchLeftovers`，拒绝码 `scratch_left`）。

要改成：§7 加一行 M4（0.4），逐条写处置。第 1 条：E4 照 main 上现有的 guard 框架写，M4 的 G1 合入时改经 `installRuleGate`（谁后合入谁改，同 M4 §13.3）；第 2 条：§3.12.2 引用 `PROMOTION` 并采用 M4 的含义，`ladderProposals` 经 `classifyRecord` 读；第 3 条：写明 M7 一侧的接口名（`requestsService(ctx)?.peekGrant`、`outsideDenial`、`openRequests`），服务不在时行为不变，谁后合入谁加；第 4 条：服务在时汇合门禁多一步。

第 2 条的冲突在 P2 开工之前改掉；其余可以在实现中改。M4 不在自举路径上。

## 不挡路的发现

### N1（NIT）运行时文件在 `<git>/hourness/`，人说的是项目的 `.llm/`

`d-rules-in-repo`（人：「差不多都是进.llm」）把检查记录、流水一类运行时的东西放进项目的 `.llm/`。M7 §2.1（第 165 行）选 `<git>/hourness/`，理由是各工作树共用、与 M3 的快照流水同处（M3 附录 §2.5 把 `snapshots.jsonl` 放在 `<git-common-dir>/hourness/`），M3 第 4 轮评审没有挑。它在项目里，精神上不违背；字面上与人说的位置不同。建议在 §12 加一句：这是 agent 定的、可推翻的取舍，理由是证据文件要各工作树共用并且 worker 的写入范围碰不到；规则板与循环板的 `.llm/` 是它们自己的目录。

### N2（NIT）harness 条目的 `tell` 在循环板 0.6 里是 `{text, wake}`，M7 的表没写 `wake`

循环板 0.6 §2.3：`harness` 动作的 `tell` 是 `{text, wake}`。§3.11.1 里 `execute.release`、`execute.stopped`、`execute.trunk`、`execute.restart` 四项只写了文字。循环板 §5.1 的 `wake` 一栏全部是「是」。E1b 的 `entries.ts` 照它写，表里补一列。

### N3（NIT）几处旧引用

E1b 写「循环板的文件还不在时按循环板 0.3 §2.1、§3.1 的类型写本地类型」，循环板 0.6 起共用形状在 `src/loops/trigger.ts`（`HookShape`、`Trigger`、`EventFilter`），改为引 0.6 §2.2、§3.1。其他：§7 的规则板（0.8）、M3（0.3）、plain-ui（0.4）、循环板（0.3）行；版本说明里的「依据 main `d32468c`」与「`fe0bace`」，当前 main 是 `9390219`；第 5 行「M3 附录 0.3」。

### N4（NIT）`mainAgentOf(userHome, graphDir)` 的参数会变

第 452 行写 `mainAgentOf(userHome, graphDir)`。按 `d-rules-in-repo` 持有者记录搬进项目 `.llm/`，循环板 §17 M3 第 10 条已请 M3 导出按项目根定位的读法。M7 只按名字引用 `mainAgentOf`，参数以 M3 0.5 为准。

### N5（NIT）M3 附录 §9 第 7 条的两件小事

（a）0.4 的 `git-snapshot.ts` 导出只写了 `gitInvocations` 与 `takeSnapshot`（§2.1 第 147 行那一行），而 §3.2.4 第 4 条还用 `gitRisk`，M3 的批注写的是三个。补上 `gitRisk`。（b）M3 要求「派发选模型时先评估 `subagent` 工具的 `modelSelectionSettings`」。M7 走的是 `startActivation` 加 `agentOptions`（subagent:293–303、315–329），不经 `subagent` 工具，没有允许清单。在 §3.1.3 加一句结论与理由。

### N6（NIT）少做上限的计数口径与规则板字面不同

规则板 §3.6 与 §16 写「写任务、审查、检查都算」，M7 §3.1.2 第 3 步写「`check_commit` 的检查不跑模型，不算」，并把目标整体的审查算进去。M7 的做法合理，但是与规则板字面不一致，在给 `rules` 的批注里写明是有意的。

### N7（NIT）被不做档排队的 worker 交回 `blocked` 时怎么算

规则板 §10.4 与 §3.6：不做档里在跑的 GLM 子 agent 的工具调用被排队，它「收尾交回，单转给派它的主 Agent」，解除时主 Agent 收到「可以再派」。M7 §3.6.2 第 7 步对 `blocked` 只写「由主 Agent 决定」。建议写明：交回 `blocked`、`summary` 里带规则板单号的，不算一次失败的派发（不进审查或检查的停下计数），等规则板的唤醒再派。

### N8（NIT）§10.3 第 1 条「骨架场景」没点名

§9.1 有十个场景，P1、P3、P4 的不属于骨架。第 1 条改为点名：`glm-exec-dispatch`、`non-glm-exec-dispatch`、`glm-exec-plan`、`glm-exec-review`、`glm-exec-merge`、`glm-exec-drive`、`glm-exec-skeleton`。

### N9（NIT）建议把 E8 拆成两步

E8 同时有自动推进（骨架必须）和与循环板的接缝（`contribute`、`emit` 键、5 分钟看门、`actions.jsonl`、被打断动作的重做）。后者在循环板不在（自举路径上就是不在）时只能对着假的循环板测，真实的核对在第二批 L4。拆成 E8a（自动推进、完成门禁、对账、退路执行者）和 E8b（交条目、交事件、看门、`actions.jsonl`），E8b 排在循环板合入之后，自举路径少一块最大的步。这是排期建议，不改任何行为。

### N10（NIT）metrics 0.2 写给 M7 的几条

metrics 0.2 是只到 §10 的半成稿（运行在 10:29Z 被停）。它请 M7：不要 `metrics-gaps.jsonl`（用指标流水自带的缓冲与重放）；派发工具加必填的理由类别（`difficulty`、`cost`、`independence`、`escalation`、`person`、`other`，图上 `m7` 23:40Z 的批注）；比率、比较类的打分不进主 Agent 的对话，只给命令行与面板，M7 若认为周报必须带比率，就是与 `CHARTER.md` §8 的冲突、要按方向性岔路问人。M7 §3.12.4 的周报现在带比率。metrics 没定稿之前 M7 不改，但这是个要在指标流水定稿时由编排方找人定的事，不是 M7 自己能改的。

## 对开工（自举）的影响

M7 骨架在自举关键路径上（`d-dogfood-scope`：E0、E1a、E1b、E2–E9、H1）。0.4 的文字里，下面这些不改就不该开始实现：

| 发现 | 什么时候改 | 为什么 |
| --- | --- | --- |
| R4-F1 | 实现开始前 | E1b 的判断表、E8 的退路执行者、§4 的契约表都要照它改，且 `src/rules/service.ts` 在自举路径上不存在 |
| R4-F2 | 实现开始前 | `briefGate`、`pinsOf`、`derivedStage`、放行事件的签名要变；自举之后第一批要做的模块马上用到它 |
| R4-F8 | 实现开始前（人放行 §1.2 之前） | 人看的是这几条验收 |
| R4-F9 | 排期之前（编排方裁定即可，文字随后改） | 不改，E0 要等 M3 十二步，E2、E4 要等整块规则板 R4 |
| R4-F3、R4-F7 | E4 开始之前 | 工具说明与规则的模式都在 E4 里定 |
| R4-F6 | E4 开始之前改文字；自举开始之前验完 | 开始条件缺这一项 |
| R4-F4 | 实现中，E7 合入之前 | 规则板的门不在自举路径上 |
| R4-F5 | 实现中，P2 开始之前 | 周报、晨报在骨架之后 |
| R4-F10 | 实现中；第 2 条（`PROMOTION`）在 P2 之前 | M4 不在自举路径上 |

除此之外没有发现会让自举开不了的东西：骨架的链路（§10.1）与 E 步、验收、验证和开始条件在其它地方彼此对得上（§10.1 列的内容都在 E1–E8 里；§10.2 排除的 P1、P3–P6 确实没有被骨架场景用到；`glm-exec-skeleton` 不要循环板；§10.3 第 4 条往严一侧）。

## 已核实的假设

- 循环板 0.6 的 `Contribution`、`ContributeResult`、`LoopEventInput`、`LoopEventRecord`、`HarnessResult`、条目字段、事件表、M7 十项的 `limits`、`loops.peak-end` 第 3 行对 `execute.resume-drive` 的调用与 60 秒等待、`staleEntries`/`timeoutEntries` 的签名，与 M7 §2.5、§3.11.1 的接口一致（除 N2）。
- 规则板 0.10 的 `stateFor` 只在 `peak === true` 且少做时带 `glmWorkerCap`；`peakHoldFor` 只在少做/不做的高峰里有值；与 M7 §3.1.2、§3.9.5 的读法一致。规则板 §16.1 的最小一片包含的东西与 M7 要读的两处一致。
- `norm-merge-gate` 的七行、`norm-review-floor` 的四行在图上的原文；前者能被 §3.8.1 的写法表解析，后者没有反引号写法（所以本仓库每件都全审）。
- `src/` 里还没有 `execute/`、`design/`、`rules/`、`loops/`；`isGlmModel` 在 `src/shared/route.ts:31`；`goal-round-driver:229–234` 暂停条件、`tools:3321` 用 `ctx.waterfall`，规则板的门 `prepend: true` 在最外层（规则板 §6.2）。
- §1.2 第三列与 §13 的文字没有 `d-plain-questions` 换词表里的词；§13 两题是背景、推荐、疑问、不做四行加一句问话，每行一处加粗。

## 没核实或不对的假设

- 「规则板仍会暂停不做档里主 Agent 的 goal」「`RulesService` 有 `heldForPeak`」：不对（F1）。
- 「目标一级的放行足够」：不对（F2）。M3 附录 0.5 还没写，模块一级放行的读法（`record_human_answer` 的 `module` 参数、`stage` 的写权限、目标何时到 `release`）没法逐字核，M7 一侧写的是自己要的读法，需与 M3 0.5 对一遍。
- 「E4 之前规则板整块 R4 会合入」：与自举范围冲突（F9）。
- 「M7 不加别的高峰逻辑」：M7 在 §3.9.5 加的停住、5 分钟自查与 §3.9.1 的重启补接，是编排方 F59 裁定明确交给 M7 的，规则板与循环板都确认，不算越界；但它们读 `Date.now()` 与停住时记下的 `until` 比较，「M7 不读档位与时钟」的字面不严（不影响行为）。
- §15 的 U1–U26（`delivery: 'caller'`、`hourness-gate` 外部激活、桌面版关闭时 goal 是否暂停等）本轮没有新证据，照旧待 L3、L4。
- 没有核实规则板最小一片的实际代码（在 `.worktrees/rules-slice` 里，按任务要求没碰），F6 的验证办法要等片子合入后对一遍它有没有可注入的时钟。


---

# 0.5 第 5 轮（总第 5 轮）

评审对象：`.agents/tasks/m7/design.md` 0.5（2026-10-30，文件时间 19:41，`design-0.4.md` 是 0.4 原文）。评审者没有写过 0.5。依据 2026-10-30 19:5x 本机的盘上稿与图（main `e752cab`；`graph-ops-v05.json` 的批注还没有记图，图上 `m7` 最后一条是 11:30Z 的 M3 附录 0.5 批注）。

## 这一轮怎样分挡路与不挡路

人要的是安全前提下尽快开工，所以本轮把每条发现分成三类，结论只看第一类：

1. 挡开工：E0、E1a、E3 动手之前、或人放行一页稿与「怎样算做完」之前必须改，否则实现者会做出错的东西、人放行的条目做不到、或会丢收不回的东西。
2. 挡某个点名的后续步：文字要在那一步之前改，不挡前面的步。
3. 实现中改：不挡任何一步，写明何时改。

严重程度仍按 HIGH、MEDIUM、NIT 标，依据同前几轮：`docs/DEVELOPMENT.md` §1.1 的三类（要求或验收没满足；会造成收不回的损失却没有预防；失败了没有途径发现、恢复或事后追查），加违背人的定案、与已定稿设计的接缝不符、照文字无法实现。严重程度与分类是两件事：MEDIUM 可以只挡后续的某一步。

## 核对方式

- 0.5 新写与改写的部分读了全文：版本说明、§0、§1.1–§1.3、§2.1–§2.5、§3.1–§3.5、§3.9（含 §3.9.7）、§3.11.1、§3.16、§4 契约表、§6.1、§6.4、§6.6、§7、§8、§9、§10、§12、§12.1、§13、§14、§15 的 U25–U30、§17–§18；其余各节只按需查。`design-0.4.md` 用来对照被改动的位置。
- 读了 `design-review.md` 与 `design-review.json` 的第 4 轮及其「对开工（自举）的影响」表、`.agents/tasks/design-context.md` 全文、`graph-ops-v05.json`、`onepage.md`。
- 图：用 `show-nodes.mjs` 与 `npm run -s graph -- show` 读了 `m7`、`dogfood`、`d-dogfood-scope`、`d-rules-peak-slice`、`d-main-agent-peak-exempt`、`d-design-onepage`、`d-agent-examples`、`d-rules-in-repo`、`question-37`、`question-38` 的正文与历史（`d-script-timeout`、`d-main-agent-shell` 只核对了状态，内容以 `design-context.md` 为准），重点是 0.5 派发（10:57Z）之后的批注：`m7` 与 `d-design-onepage` 的 11:30Z（M3 附录 0.5）、`dogfood` 的 11:30Z（`d-freeze-until-dogfood`）。
- 邻居设计只读 M7 碰到的节：规则板 0.10 §7.2（`PeakModeService`、`PeakHold`）、§10.7 M7 一节、§16.1；循环板 0.6 §2.3（`Action`）、§4.2、§5.1、§17 M7 一节；M3 附录 0.5 §3.14.1–§3.14.9、§9 第 7 条、模块相关的步骤号；plain-ui 0.7 §4.11、§11「两层循环」第 6–9 条；M4 0.4 只核对名字（`RuleMode`、`PROMOTION`、`installRuleGate`、`GUARD_RULES`）；M5 §5.3 的锁。`docs/CHARTER.md` 0.7 §3.2 第 3 条与 §6，`docs/ORCHESTRATION.md` §6.5（另看了 §2.7、§6.2 里「直接拦截、不先走影子」的先例）。
- 仓库与 rc.3 抽查：`dsh-goal` 的阻塞原因码规则（76–84）、`resume`（686–699）、`block`（720–729）；`src/graph/projection.ts` 的 `deciderOf`、`waitsForHuman`；`engine.ts` 的 `decideRefusal`；`schema.ts` 的 `EDITABLE_FIELDS`、`TASK_KINDS`、`HistoryEntry.changes`；`stage.ts` 的 `effectiveStage`、`releaseSet`；`src/guard/rules.ts` 的 `GuardRule`、`evaluate`、`renderCorrection`；`src/workflow/index.ts` 的 `DISPATCH_TOOLS`；`src/shared/tool-names.ts`、`route.ts:31`、`src/glm-llm/models.ts:25–28`、`zcode.cjs:386–387`。
- 没读 `.worktrees/` 下任何东西（规则板最小一片与 M3 正在那里写）；没写 `docs/graph/`，没改 `design.md`、`graph-ops-v05.json` 与任何已跟踪文件。

## 结论

APPROVED（按本轮口径：没有一条发现挡住开工）。HIGH 0、MEDIUM 4、NIT 7。四条 MEDIUM 里三条挡后续的某一步（E1b 与 E8、E4、E4），一条在实现中改；都是文字改动，不需要再出一稿评审，也不改变 E0、E1a、E3 的内容。

按第 4 轮的口径（HIGH 与 MEDIUM 都算挡路）本轮是 4 条，第 4 轮是 10 条。趋势（总轮次，按第 4 轮的口径数挡路条数）：1 → 3，2 → 0，3 → 3，4 → 10，5 → 4。第 4 轮的 10 条里本稿关了 7 条（R4-F1、F2、F3、F6、F7、F8、F9）并顺带关了 N1、N2、N5（a）、N8；新增的 4 条里 3 条是 0.5 的改动本身留下的缺陷（R5-F1 文字被截断且场景缺行，R5-F2 一条测试断言与正文相反，R5-F3 一处失败路径选了放行），1 条是 0.5 动笔之后才出现的批注没有处置（R5-F4）。

两件事不是设计缺陷，但开工前要做，这里写明免得漏掉：

1. 人放行之前不开工（§8 开头、§10.3 第 4 条）。`onepage.md` 还是 0.4，没有模块一级、三档，也没有「替你定了的方向」里的宪章例外；`graph-ops-v04-pending.json` 里 m7-2、m7-3、m7 的验收字句也要按 0.5 的 §1.2 重写。这是编排方评审之后的下一步（`graph-ops-v05.json` 的「接下来」三、四；§14），见 R5-N3。
2. 下面列出的发现之外，没有发现会让 E0（`scripts/packages.mjs`、`scope.ts`）、E1a（pins、门禁、计划、`childId`、`checkModelChoice`、`releaseOf` 等纯函数）、E3（git 执行器、门禁锁、`src/data/lock.ts`）写错的地方；这三步读的 §2.4、§3.5.1、§3.5.3、§3.8.3、§8.1、§8.3 彼此对得上。

## 第 4 轮发现的关闭情况

| 发现 | 状态 | 读到的证据 |
| --- | --- | --- |
| R4-F1（HIGH）读已删去的 `heldForPeak` | 已关闭 | 第 3、16、177、295、1479、1639、1756、1758、1892 行里 `heldForPeak`、`rulesService`、`src/rules/service` 的每一处都是删除说明或历史，没有一处在读。§3.9.1 的 goal 为 `paused` 一行（第 872 行）写明「高峰模式不再暂停主 Agent 的 goal……`paused` 一律是人的动作」；§4 契约表里规则板一行只有 `glmHournessPeakMode` 的 `stateFor`（档位、`glmWorkerCap`、`until`）与 `peakHoldFor`；§6.6 的高峰用例改为「`paused` 一律按人暂停、不读任何高峰状态」；E1b、E8 两行去掉「不做档的暂停」；§1.1 加了 `d-main-agent-peak-exempt` 一行。对规则板 0.10：`PeakModeService.stateFor` 只在 `peak === true` 且少做档带 `glmWorkerCap`，`peakHoldFor(sessionId): PeakHold \| undefined`，`PeakHold = {level: 'reduce' \| 'stop', until}`，`RulesService` 没有 `heldForPeak`，最小一片不交 `src/rules/service.ts`（§16.1），与 M7 的读法一致 |
| R4-F2（HIGH）两层循环没进 M7 | 已关闭，有残留 | 评审要的六点都在：（1）`briefGate` 的 `not_released` 取最近的模块祖先（第 528 行），`ctx.release` 代替 `ctx.stage`；（2）`derivedStage(graph, node)` 收模块，另有 `releaseOf`、`releaseAtOf`、`scopedTasks`（§2.4）；（3）`hourness.design-released` 带 `module`，键第二段是 `<module 或 goal>`，`execute.start-drive` 对一个目标只建一次 goal，大循环放行不交事件（§2.5、§3.9.1）；（4）pins 的模块与目标祖先带 `releaseAt`（评审说布尔，0.5 改成放行时刻，理由成立：布尔在退回再放行后变回原值），`worker-scope` 加放行状态一项，第三档以 `hourness-design-wait` 停住 goal（`dsh-goal` 的原因码规则 76–84 接受这个码，`resume` 可从 `blocked` 恢复 686–699）；（5）派发门禁只数决定者为人的待决（`waitsForHuman` 本来就只数这种，`projection.ts:28–31`），完成门禁第 3 条仍要求都关，第 7 条加设计中的模块；（6）§1.1、§1.2 m7-2/m7-3/m7、§3.9.7 三档与成批。三档的图写入与 M3 附录 0.5 §3.14.7 的表和引擎例外、§3.14.8 的两条退回一致，与 plain-ui 0.7 §11 第 6–9 条一致。残留：验证清单页面上缺（R5-F1）；模块读法读不出时放行（R5-F3）；模块设计评审没有处置（R5-F4）；放行稿没重写（R5-N3） |
| R4-F8（MEDIUM）验收要求每个数写进指标流水 | 已关闭 | §1.2 m7 特性第 3 条（第 109 行）改成「系统自己记；现在记在图、检查与前进的记录、违规记录、用量记录、对话记录里；每个数另交一份给统一的指标记录，它没做好之前这一份不写，做好之后再核，这一步不算这一次的做完」；§1.1 `metrics` 行、§1.3、§3.16 同步，§3.16 加「每个数现在记在哪」一表与 L2 `execute-metrics.spec.ts`（注入出口，每类事件各一次）。第三列没有换词表里的词 |
| R4-F9（MEDIUM）§8.3 先后与自举路径冲突 | 已关闭 | §7 的 split、M3、规则板三行与 §8.3 的开工表、同批文件表逐字照 `design-context.md`「Dogfood implementation order and runtime paths」：E0、E1a、E3 现在就开；E1b 的测试等 M3 第 3、6 步；E2 等 M3 第 6 步；E4 等 M3 第 3–5 步与规则板最小一片的行登记；「规则板 R4」全部换成最小一片，整块排在 E9 之后；共享登记文件后合入的一方机械并入；`src/data/lock.ts` 由 E3 建（§2.1 表、§3.8.3、§7 M5 一行、E3 行、§8.3 表五处一致）。0.5 另加了「E8 里与模块放行有关的部分等 M3 第 9 步」，M3 第 9 步是放行一支，骨架本来就要它，不构成环 |
| R4-F3（MEDIUM）派活简报没有示范 | 已关闭，有残留 | §3.1.5：示范放在 `dispatch_task` 说明末尾，938 字符（加紧接的一句 998），在 1,400 之内；领域是静态博客的订阅输出，不在练习题（记账小工具）的领域；写了题材为什么安全（不在练习题领域、只讲已定的事、不描述主 Agent 自己该怎样判断）；`src/execute/examples.ts` 加 `tests/execute-examples.spec.ts` 六条检查，E4 的文件表有这两个文件。`kind: implement`、`writeScope`、`nonGoals`、`acceptance` 都是图上的真字段，目录型 `writeScope` 使 `plan` 为 `required`，与 §3.3.1 一致。残留：第 5 条检查的断言与 §3.7.1 不符（R5-F2）；示范自身的两处小矛盾（R5-N1） |
| R4-F6（MEDIUM）规则板最小一片不在开始条件与验证里 | 已关闭，有残留 | §10.3 第 5 条（第 1615 行）加了这一片已合入、两处读在真实 `PeakModeService` 类型上验过；§6.6 的高峰用例改用片子的真实类型与固定实现；§9.2 第 9 步写明没有计价与时钟接缝时这是真实高峰的第一次核对；§8.3 的同批文件表写明「M7 不再写『没合入时先不写这两处读』」。残留：§9.1 的 `glm-exec-peak` 行页面上没有（R5-F1） |
| R4-F7（MEDIUM）八道代码里的门没写模式 | 已关闭 | §12.1：八道门各一行（模式、误伤的代价与出路、错放的代价与兜底、若人要求首日先影子），首日全部 `enforce`，两类理由，写明是对宪章 0.7 的例外、agent 定、人可推翻；`EXECUTE_RULES` 常量表存一份，契约测试断言每个 id 在表里；转生效只认 M4 的 `PROMOTION`，不留死代码；§10.3 第 4 条与 §13 都说了放行稿里看得到。对照宪章原文（§3.2 第 3 条「写在代码里的门禁不在此列，照旧先影子后拦截」、§6）：满足的一半（新行默认禁用、验证通过才启用）写得对；没满足的一半作为例外交给人看，做法与 `docs/ORCHESTRATION.md` §2.7、§6.2 的先例（直接拦截并写理由）同类，但这一次更大，所以必须让人看到，见 R5-N3 |
| R4-N1 运行时文件进项目 `.llm/` | 已关闭 | §2.1、§12：`<proj>/.llm/execute/`、`<proj>/.llm/operate/`，各放内容为 `*` 的 `.gitignore`；`<git>/hourness/` 在 0.5 里只剩历史说明与 `<git>/info/exclude`（git 自己的配置） |
| R4-N2 `tell` 加 `wake` | 已关闭 | §3.11.1 十项的 `tell` 与 `tell-main` 都写了 `wake: true`，E1b 逐项断言；循环板 0.6 §2.3 的 `Action` 类型里 `tell-main.wake` 是必填布尔、`harness.tell` 是 `{text, wake}` |
| R4-N5（a）、R4-N8 | 已关闭 | §2.1 的 `git-snapshot.ts` 一行列了 `gitInvocations`、`gitRisk`、`takeSnapshot`；§10.3 第 1 条点名八个场景（但其中 `glm-exec-modules` 没有定义，R5-F1） |
| R4-F4、F5、F10，R4-N3、N4、N5（b）、N6、N7、N9、N10 | 已按第 4 轮的排期记下，不当作没答 | §18.2：F4 E7 合入之前；F5 P2 开工之前；F10 的 `PROMOTION` 一条 P2 之前、其余实现中；N3 下次改到时；N4 与 N5（b）E4 开工之前；N6 记在给 `rules` 的批注里（`graph-ops-v05.json` 有）；N7 整块规则板的门合入之前；N9 E7 之后、E8 之前由编排方定；N10 指标流水定稿时。与第 4 轮「对开工（自举）的影响」表一一对得上 |

## 定案与方向清单逐条对照

| 定案 | 结论 | 说明 |
| --- | --- | --- |
| `d-main-agent-peak-exempt` | 遵守 | 没有一处因高峰暂停、排队或拦主 Agent，也没有一处指望规则板这样做；M7 对规则板只读三样（档位与 `glmWorkerCap`、`until`、`peakHoldFor`），都为子 agent 与等高峰结束的推进 |
| `d-design-onepage` 扩到产品（两层循环、三档、成批至多三件、模块没放行不派开发） | 遵守，有残留 | 门禁、阶段推出、放行事件、pins、`worker-scope`、完成门禁、三档与成批都按模块判；残留是验证清单缺（R5-F1）、读不出模块时放行（R5-F3）、模块设计的独立评审没有处置（R5-F4） |
| `d-agent-examples` | 遵守，有残留 | 示范在 `dispatch_task` 的说明里，领域不撞练习题，只讲已定的事，L2 钉住；第 5 条检查的断言有误（R5-F2），示范有两处小矛盾（R5-N1） |
| `d-rules-in-repo`、`d-memory-scope` | 遵守 | M7 的运行时文件在 `<proj>/.llm/execute/`、`<proj>/.llm/operate/`，M7 在仓库里没有自己的文件；M3 的快照流水位置以 M3 0.5 为准 |
| `d-dogfood-scope`、`d-rules-peak-slice` | 遵守 | 骨架就是 E0–E9 加 H1；对规则板只读最小一片；开始条件有这一片已合入并验过一条（§10.3 第 5 条） |
| `d-freeze-until-dogfood`（11:30Z，「自举开始前新定的事先记上图、不塞进在跑的稿子」） | 遵守 | 0.5 没有吸收 10:57Z 之后的批注；其中会影响 M7 的一条（模块设计的独立评审归 M7 的派发）没有记下何时处理，见 R5-F4 |
| `d-script-timeout` | 遵守 | M7 的份（周报里反复超时的一节）排在 P2 之前，§1.1 与 §18.2 都写了 |
| `docs/CHARTER.md` 0.7（§3.2 第 3 条、§6） | 遵守，一处例外交给人 | 两行默认禁用、验证通过才启用；八道门首日 `enforce` 作为例外，理由与推翻后的办法在 §12.1。宪章原文是「写在代码里的门禁不在此列，照旧先影子后拦截」，例外要靠人在放行稿上看到才算数，而放行稿还没重写（R5-N3） |
| `d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-one-main-agent` | 遵守 | 本轮没有新的违背；放行认法按层，分了模块的目标每个模块的放行只批注并叫主 Agent 分解这一个模块 |
| `d-chat-not-cards`、`d-plain-questions` | 遵守 | §13 两题各行一处加粗、四行加一句问话；§1.2 第三列与 §13 没有「验收」「标定」「门禁」等换词表里的词（逐格查过） |
| `question-37` A | 草稿，待人逐条看 | §1.2 是草稿；改写节点验收的 JSON 草稿（`graph-ops-v04-pending.json`）还是 0.4 的字句，按 0.5 重写后再请人看（`graph-ops-v05.json`「接下来」四） |
| `question-38` C、`norm-review-floor`、`norm-merge-gate`、`metrics` | 遵守 | 与第 4 轮相同，0.5 没有动 |

## 与邻居设计的接缝

| 邻居与出处 | M7 0.5 的状态 |
| --- | --- |
| 规则板 0.10 §7.2、§10.7 M7 一节、§16.1 | 一致。M7 读的三样都是 0.10 真有的；最小一片的 `src/shared/peak-mode.ts` 导出清单（`PeakLevel`、`PEAK_REDUCE_GLM_WORKERS`、`PeakModeState`、`PeakHold`、`PeakModeService`、`peakModeIntro`、`PEAK_LEVEL_WORDS`）没有逐字列 `PEAK_MODE_SERVICE` 与 `peakModeService`，M7 依赖这两个名字；§7.2 的 `src/shared/peak-mode.ts` 代码块里有它们（`PEAK_MODE_SERVICE = 'glmHournessPeakMode'`、`peakModeService(ctx, problem?)`），R1 的 L2 也测 `peakModeService`，片子合入时核对（见「没核实」）。R4-F4（`trunkAdvanceFor`）与 R4-F5（周报几节）已排期 |
| 循环板 0.6 §2.3、§4.2、§5.1、§17 M7 | 一致，一处差异已走请求：`Action` 的 `tell-main.wake`、`harness.tell: {text, wake}` 照写；M7 交 7 项条目、9 个事件、5 个动作，在每份 32/16/16 之内；0.6 的 `hourness.design-released` 声明没有 `module`、键的第二段是 `<goal>`，M7 0.5 改了，请求在 `graph-ops-v05.json` 给 `schedules` 的批注里。事件声明由 M7 经 `contribute` 交，所以循环板实现前后都不改变 M7 的行为，E8 的契约测试会钉住 |
| M3 附录 0.5 §3.14.1、§3.14.6–§3.14.8、§9 第 7 条 | 一致，有两处小差：`src/graph/modules.ts` 的五个导出、模块放行与两条退回的写权限（含引擎的窄例外）、第三档的粗度、`shownProposalOf` 保留，都与 M7 的 U28 假设对上；差异一是 `isReleased` 对完成的模块（R5-N4），差异二是 M3 把「模块设计对照方向清单的评审」交给了 M7（R5-F4） |
| plain-ui 0.7 §4.11、§11「两层循环」第 6–9 条 | 一致：`derivedStage(graph, node)` 收模块；第二档改模块 `stage`、第三档改目标 `stage` 带原话；一次至多三件。M7 另有一处差别（分了模块而一个模块都没放行时，目标推出 `release`，不是 `decompose`），已写进给 `m8-plain-language` 的批注 |
| M4 0.4 §3.1、§3.5、§3.8 | 名字都在（`RuleMode`、`PROMOTION`、`installRuleGate`、`GUARD_RULES`）。M7 的八道门由 `EXECUTE_RULES` 交给规则板整块的 R1 映射，M4 §3.8 写的是 M7 的规则「随它们的步加入 `GUARD_RULES`」，两种登记方式不同；规则板 0.10 §10.1 的表按前一种写（「M7 合入后登记」）。都不在自举路径上，随 R4-F10 在实现中对齐 |
| M5 §5.3 的锁 | 参数不同（见 R5-N6）：M5 是 50 毫秒重试至多 2 秒、30 秒判陈旧，M7 是 5 秒一次至多 60 分钟、持锁 6 小时判陈旧 |
| metrics 0.2（半成稿） | 与第 4 轮相同，R4-N10 排在指标流水定稿时 |

## 发现

每条写：严重程度、挡什么、位置、问题、改法。

### R5-F1（MEDIUM，挡 E1b 与 E8；不挡 E0、E1a、E3）§6.6 的「0.5 加的 L2 用例」被截断，§9.1 缺 `glm-exec-modules` 与 `glm-exec-peak` 两行

位置：`design.md` 第 1458 行（§6.6）；第 1572 行（§9.1 `glm-exec-drive` 行末句「带可注入的计价与时钟接缝时另有场景 `glm-exec-peak`（下一行）」，下一行是第 1573 行的 `glm-exec-skeleton`）；第 1004 行（§3.9.7 末「两模块的图用例见 §6.6」）。引用方：§1.2 m7-2、m7-3 的检查列（第 100、101 行，引 `execute-modules.spec.ts`、`execute-tiers.spec.ts`）与 m7 特性的检查列（第 109 行，引 `glm-exec-modules`）、§10.3 第 1 条（第 1611 行）、E8 行（第 1506 行）、U30、§18.1 的 R4-F2 与 R4-F6 两行。

问题：`design-0.4.md` 在 §6.6 的同位置是一条「其余：审查没过的任务进主干后不转完成，审查通过时转完成（N4）；门禁工作树有改动时先有快照（N5）……」。0.5 把这一条的开头换成了新标题，新列表没有写出，旧列表被截去开头，现在是「0.5 加的 L2 用例（R4-F1、F2、F3、F8，……文件 `tests/execute-modules.spec.ts`、`execute-tiers.spec.ts`、`execute-examples.spec.ts`、`execute-metrics.spec.ts`）：，审查通过时转完成（N4）；……」。后果有三：

1. 第 4 轮 R4-F2 要的两模块 L2 用例（一个放行一个没放行；放行后第二档退回，在跑的 worker 过期；第三档退回，两个模块都过期）、三档与成批、示范、指标出口的用例清单都不在页面上；§3.9.7 末尾「见 §6.6」悬空。
2. `glm-exec-modules` 是 §10.3 第 1 条要求开工前必须通过的场景，E8 的 L3 也点名它，U30 在它上面核实；§9.1 里没有这个场景的任何内容，实现者不知道要核对什么。`glm-exec-peak` 同样没有行，`glm-exec-drive` 行里的「下一行」指向的是别的场景。
3. §18.1 说这两件已经做了，页面上没有，更改记录与正文不符。

语义本身在 §2.4、§3.5.1、§3.5.3、§3.9.1、§3.9.7 里是齐的，实现者能推出大部分，但推不出要钉哪几个边界。所以不挡 E0、E1a、E3，要挡的是第一次写这些测试的 E1b（`tests/execute-modules.spec.ts`、`execute-tiers.spec.ts` 的纯函数部分）与写 L3 场景的 E8。

改法（只改文字）：

1. 第 1458 行拆回两条。前一条「0.5 加的 L2 用例」列：（a）两模块的图，A 放行、B 在设计中：B 下的任务得 `not_released`、A 下的派得出；B 放行后 `hourness.design-released` 带 `module: B`，键与 A 的不同，`execute.start-drive` 第二次只批注、不建第二个 goal；（b）第二档：A 的 `stage` 不带原话退回 `design`，A 下在跑的 worker 的 `worker-scope` 写被拒、交回得 `stale`、新派发得 `not_released` 且 `hint` 带 sent back；B 不受影响；A 再放行后 `releaseAt` 变了，退回之前派出的仍过期；（c）第三档：目标的 `stage` 带原话退回 `design`，两个模块的任务都过期，goal 以 `hourness-design-wait` 阻塞，再放行后恢复，空转与高峰计数清零；（d）`waiting_human` 只数决定者为人的待决，第一档里 agent 自己定的待决不挡派发，完成门禁第 3 条仍要求都关；（e）`batchOf` 的优先序、至多三件、第一档不占名额，`pendingReport` 的 `since`；（f）`returnsOf` 在同一步内退回又放行、写图失败时的 `ctx.returned`；（g）`modulesOf` 读不出时的行为（取决于 R5-F3 的改法）；（h）示范与指标出口各一条，指到 `execute-examples.spec.ts`、`execute-metrics.spec.ts`。后一条把 0.4 的「其余：审查没过的任务进主干后不转完成……」完整接回。
2. §9.1 补两行。`glm-exec-modules`：预置一张两模块的图（用 M3 合入后的真实引擎写阶段），模拟人放行 A 不放行 B，核对上面（a）（b）（c）的 headless 版本，goal 只建一次，`goals.block` 接受 `hourness-design-wait`（U30）。`glm-exec-peak`：只在规则板最小一片带可注入的计价与时钟接缝时才有，没有时这一行写「不做」，与 §10.3 第 5 条、§9.2 第 9 步的说法一致。
3. 补完后 §18.1 与上面几处引用自然对上，不用另改。

### R5-F2（MEDIUM，挡 E4 里 `tests/execute-examples.spec.ts` 的写法）§3.1.5 第 5 条检查的断言与 §3.7.1、§6.4 相反

位置：`design.md` 第 387 行（§3.1.5 检查第 5 条）；对照第 660、664 行（§3.7.1）与 §6.4 的 `dispatch_task.review`、`dispatch_task.depth` 两行。

问题：第 5 条说示范（一次写任务的派发，带 `review: {depth: 'light', why}`）在夹具无命中时「不被 `floor_requires_full` 拒绝」，夹具里加一条判不了的条目时「同一个示范变成被 `floor_unparsed` 拒绝」。但这两个码都是派审查任务时 `depth` 低于全审的拒绝（§3.7.1「派审查」一条、§6.4 `dispatch_task.depth`、`depthWhy` 一行）。写任务的派发只校验 `review.depth` 的取值与 `why`（§6.4 `dispatch_task.review` 一行），有效深浅要等交回时按真实改动的文件与命令才算（§3.7.1「有效深浅」一条）。示范里没有审查派发，派发那一刻也没有改动的路径可判。所以这条检查在正文的规则下不成立，实现者只能猜它断言什么。

改法：第 5 条改成对有效深浅断言。夹具无命中时，示范声明的 `light` 加一份改动落在 `site/feed/` 之下的假交回，`floorHits` 为空、有效深浅是 `light`；夹具多一条判不了的条目时，同一份假交回的有效深浅是 `full`、`floorHit` 为 `unparsed`。这样仍然防住「示范被当成轻审总是行」，也不需要给示范加一次审查派发（加了的话示范长度要重核 1,400 字符上限）。

### R5-F3（MEDIUM，挡 E4）模块读法读不出时放行，与「判不了就从严」及人定的「模块没放行不派开发」相反

位置：`design.md` 第 998 行（§3.9.7 失败与边界表第 1 行）、第 1337 行（§6.1「两层循环的读法不在或成员形状不对」）；对照 §2 开头学科依据的最后一条（判不了就从严，失效安全默认）、§3.2.1 的 `worker-scope` 放行状态一项（那里一次都没读到图时是拒绝）。

问题：M3 的 `src/graph/modules.ts` 读不出（文件不在、抛错、成员形状变了）时，0.5 选「按没分模块处理，只看目标一级」：分了模块的目标一放行，所有模块的任务都派得出，只有一行 degraded「分了模块的目标按整个目标放行来派」。理由是「往放行一侧错一次，过期核对兜底」。这是失败时放行，守的是人定的「一个模块没放行之前不派它的开发」，与本稿 §2 采用的失效安全默认相反，也与 `worker-scope` 在同类情形下的做法不一致。兜底也不稳：pins 里模块的 `releaseAt` 读不到时记 `null`，只有读法恢复之后摘要才变；读法一直读不出（U28 自己列了「M3 的名字或行为变了」这种情形，M3 0.5 也还在改，这条路径不罕见），既没有拒绝也没有过期，剩下一行 degraded。派出去的活在 worktree 里，不会直接进主干，所以损失可收回，因此是 MEDIUM 而不是 HIGH。

改法：读不出时拒绝。`releaseOf` 的纯函数多一个返回形状 `{ok: false, level: 'module', reason: 'unreadable'}`；调用方（E4 的派发处与 `worker-scope`）捕获到 `modulesOf` 等抛错、且目标下有带 `stage` 的直接特性子节点（从原始图上就数得出，不用 M3 的文件）时返回它；`briefGate` 写码 `not_released`，`hint` 为 `The module structure could not be read; the harness refuses dispatch until it can.`。目标下没有带 `stage` 的特性时才按没分模块处理。§6.1 那一行的处理与 degraded 文字、§3.9.7 失败表第 1 行同改；L2 加一例：注入一个抛错的 `modulesOf`，分了模块的目标派不出，没分模块的目标照常。`releaseOf` 的新返回形状随 E1a 带上，其余在 E4。

### R5-F4（MEDIUM，实现中改；E4 合入之前决定）模块设计的独立评审归 M7 的派发，0.5 没有处置，按现写法也派不出去

位置：0.5 里没有（§7 的 M3 一行、§11、§18.2 都没提）。出处：图上 `m7` 与 `d-design-onepage` 2026-10-30T11:30Z 的批注，M3 附录 0.5 §3.14 的结论句：「模块设计对照方向清单的独立评审归 M7 的派发，M3 的门禁不核对评审做没做，附录 §10 留痕」；M3 的 `moduleReleaseGate`（§3.14.3）七项里没有这一项，`m7` 批注写「给出记录形状后 M3 的 `moduleReleaseGate` 加一项」。

问题：`d-design-onepage` 的小循环是：每个模块先写设计、过独立评审（对照方向清单，违背即挡路），再写一页放行稿，人看过放行。M3 把评审这一半交给 M7，自己不核对。这条批注在 0.5 派发（10:57Z）之后 30 分钟才出现，`d-freeze-until-dogfood` 也不要求 0.5 吸收，所以没处置不是疏漏；但没有记下何时处理，后果有二：（1）产品里的模块放行现在没有任何一方保证「对照方向清单的评审做过」；（2）照 0.5 的写法这个评审派不出去：§3.5.1 的 `not_released` 一行适用于「全部」，被评审的是设计中的模块下的决策，派发会被 `not_released` 拒绝。

改法：§18.2 加一行并写明何时，二选一，要紧的是不留空：（A）在 E4 合入之前决定：模块设计评审作为 `kind: review`、写入范围为空、`source` 指向模块下的设计决策的任务，`not_released` 对「审查者、被审节点在设计中的模块下」放行；结论的记录形状（例：模块上批注 `设计审查 · <childId> · APPROVED|CHANGES_REQUESTED · 方向清单 <摘要> · 挡路 <n>`）在 E4 之前交给 M3，M3 的 `moduleReleaseGate` 再加一项；（B）明说产品里模块设计评审本版不做，放行稿上写明，记为带日期的延后。本仓库自举不受影响（本仓库的模块设计评审由 Kiro 工作流做）。

### R5-N1（NIT）示范自身的两处小矛盾

位置：`design.md` 第 375 行（§3.1.5 示范）；第 100 行（§1.2 m7-2 第 5 条）。

1. 示范的 `model` 是 `example-model-large`，`why` 写「start with the cheaper model」。紧接着一句说这个 `why` 只示范长短和写法，不示范该选哪个模型，但模型照抄时学到的是「选大的、理由写便宜」，也与 §3.1.5 自己「不描述主 Agent 该怎样判断」那句相抵。改法：`why` 换成与模型大小无关的写法（例：`touches one directory and has a check that can be run`），或把模型改成 `example-model-small`。
2. §1.2 m7-2 第 5 条（人要看的）写「例子拿去真的派一次也能通过全部检查」，而示范里的模型 id 是编的：目录非空时真派会得到 `unknown_model`（§6.4）。L2 靠的是含这个 id 的假目录。改法：「例子里除了编出来的模型名，拿去真的派一次也能通过全部检查」。这句人要看，随一页放行稿重写时一起改。

### R5-N2（NIT）m7 特性行写「§10.3 的四条」，§10.3 现在是五条

位置：第 109 行检查列；§10.3 第 1611–1615 行。改成「五条」。

### R5-N3（NIT）`onepage.md` 仍是 0.4；这一条挡的是人的放行，不挡设计稿通过评审

位置：`onepage.md` 第 3 行（「完整设计在同目录的 `design.md`（0.4）」），全文没有模块一级、三档，「替你定了的方向」里没有宪章例外；`design.md` 第 1756 行（§14）、第 1614 行（§10.3 第 4 条）、第 1697 行起（§12.1）。

问题：设计自己已写明由评审之后的一步按 0.5 重写（§14；`graph-ops-v05.json`「接下来」三、四），所以不是设计缺陷，也不需要再出一稿评审。记在这里是因为 §8 开头与 §10.3 第 4 条规定人放行之前不开工，§12.1 又把八道门首日 `enforce` 这个对宪章的例外交给这一页让人看到；页没重写，人放行时并没有看到它，例外就没有人同意。这是既有的闸，不是新增的闸。

改法（编排方做，不改 `design.md`）：按 0.5 重写 `onepage.md`，加两处（模块一级：每个模块各放行一次、开发中的三档与成批；「替你定了的方向」里一行八道门首日直接生效、不同意就按 §12.1 改成先影子），10 件活的人话字句按 §1.2 并含 R5-N1 第 2 点的改法；`graph-ops-v04-pending.json` 里 m7-2、m7-3、m7 的验收字句按 0.5 的 §1.2 重写；然后请人放行，`question-37` A 逐条看一并做。

### R5-N4（NIT）§2.4 复述 `isReleased` 与 M3 0.5 不同

位置：第 236 行。M7 写「对完成的模块为假」并另加「完成而阶段在 `release` 或之后」一支；M3 附录 0.5 §3.14.1 的 `isReleased` 一行已含完成，并注明 M7 那一支「结果相同、可以删，两边对一遍时以本附录为准」。U28 的核对做的时候删掉 M7 那一支，复述改成「同 M3」。

### R5-N5（NIT）自举期间不做档下，`peakHoldFor` 有值而什么都没被挡

位置：第 932 行（§3.9.5 高峰一条）；第 1605–1607 行（§10.2 末句）；规则板 0.10 §16.1。

问题：§10.2 写明自举期间不做档对子 agent 派活的排队不生效（整块规则板的门在 E9 之后），但最小一片仍交 `peakHoldFor`，不做档的高峰里它有值。M7 据此在没进展的轮里连着 2 轮就以 `hourness-peak-wait` 停住并写「work left is held back by the peak mode」，那时并没有什么被挡着：人若选了不做档，自举里主 Agent 真卡住时会被当成在等高峰，至多停到这段高峰结束（不超过 4 小时），期间不问人。默认是少做，所以只在人改成不做时出现，也会自己接上。改法：§10.2 加一句说明这个已知代价；或请片子的作者在没有门时让 `peakHoldFor` 对不做档返回 `undefined`（规则板一侧写明）。M7 不用改代码。

### R5-N6（NIT）E3 建 `src/data/lock.ts` 时锁的参数

位置：第 759 行（§3.8.3）、第 1501 行（E3）；M5 §5.3（第 686 行）。M7 用 5 秒一次至多 60 分钟、持锁 6 小时判陈旧；M5 是 50 毫秒重试至多 2 秒、锁文件修改时间早于 30 秒判陈旧、开机时刻相差 120 秒判陈旧。E3 是 `withFileLock` 的第一个实现，M5 之后要原样导入。E3 把重试间隔、最长等待、按修改时间判陈旧的阈值、开机时刻容差做成选项，两边的数都能传进来；E3 的 L2 各带一例。

### R5-N7（NIT）几处引用版本

位置：版本说明「依据（0.5）：main `ee726c3`」（当前 main 是 `e752cab`，多出的只有图提交与 M3 附录 0.5，对 M7 没有影响）；U26 的依据写「规则板设计 0.8 §7.2」，应为 0.10。下次改到这些行时改。

## 对开工（自举）的影响

M7 骨架在自举关键路径上（E0、E1a、E1b、E2–E9、H1）。0.5 的文字里没有一条挡 E0、E1a、E3；下面各条按「什么时候改」排：

| 发现 | 挡什么 | 什么时候改 | 为什么 |
| --- | --- | --- | --- |
| R5-N3 | 人的放行（既有的闸，不是设计文字） | 人放行之前，编排方做，不用再评审 | `onepage.md` 还是 0.4，人放行时看不到模块一级与宪章例外；验收字句的改写 JSON 也还是 0.4 的 |
| R5-N1 第 2 点 | 随放行稿一起 | 重写放行稿时改一句 | §1.2 m7-2 第 5 条人要看 |
| R5-F1 | 点名的后续步：E1b（L2 清单）、E8（L3 场景） | E1b 开始之前补文字；不挡 E0、E1a、E3 | 两模块、三档、成批的 L2 用例清单与 `glm-exec-modules`、`glm-exec-peak` 两行页面上没有，但语义在 §2.4、§3.9.7 里是齐的 |
| R5-F2 | 点名的后续步：E4 | E4 开始之前改一条检查的断言 | 示范的检查第 5 条与 §3.7.1 相反 |
| R5-F3 | 点名的后续步：E4（E1a 随带一个返回形状） | E4 开始之前改 §3.9.7、§6.1 两处 | 读不出模块时的放行与失效安全默认相反；派出去的活在 worktree 里，损失可收回 |
| R5-F4 | 实现中 | E4 合入之前决定做法（`not_released` 是否对设计评审放行），记入 §18.2 | 产品的模块评审不在自举骨架里；本仓库的模块评审由 Kiro 工作流做 |
| R5-N2、N4、N7 | 无 | 下次改到时；N4 在 U28 核对时 | 引用与复述 |
| R5-N5 | 无 | 自举开始之前加一句，或在整块规则板的门合入之前处理 | 只在人把档位改成不做时出现，会自己接上 |
| R5-N6 | 无 | E3 | 参数形状，M5 不在自举路径上 |

可以开工的次序（人放行之后）：E0、E1a、E3 立刻；E1b 的纯函数立刻，测试里过 `proposalLineRefusal`、`plainWordsIn` 的几例等 M3 第 3、6 步；E2 等 M3 第 6 步；E4 等 M3 第 3–5 步与规则板最小一片的行登记；E5 → E6 → E7 → E8 → E9 依次，E8 里与模块放行有关的部分等 M3 第 9 步。R5-F1 到 R5-F3 都是文字改动，可以和 E0、E1a、E3 并行做。

## 已核实的假设

- 规则板 0.10：`stateFor` 只在 `peak === true` 且少做档带 `glmWorkerCap`；`peakHoldFor(sessionId): PeakHold \| undefined`，`PeakHold = {level: 'reduce' \| 'stop', until}`（ISO 8601）；`RulesService` 没有 `heldForPeak`（版本说明、§3.6、§7.2、§10.7、§17）；§16.1 的最小一片含 `src/shared/peak-mode.ts` 的若干导出与规则行提供的 `glmHournessPeakMode`，不含 `src/rules/service.ts`。
- 0.5 里 `heldForPeak`、`rulesService`、`src/rules/service` 的每一处出现（第 3、16、177、295、1479、1639、1756、1758、1892 行）都是删除说明或历史；没有一处「不做档暂停主 Agent」的前提（搜「不做档」「level stop」「Paused for GLM」）。
- 循环板 0.6 §2.3：`tell-main` 的 `wake` 必填，`harness` 的 `tell` 是 `{text, wake}`；M7 的 7 项条目、9 个事件、5 个动作在每份 32/16/16 之内。
- M3 附录 0.5：`modules.ts` 的五个导出（§3.14.1）；§3.14.7 的写权限表与引擎例外（模块 `release` → `design` 不带原话、`reason` 非空且不以同意记号开头；目标退回带原话）与 U28 的三条假设一致；§3.14.8 第三档粗度一致；§3.14.6 写明 M7 合入后以 `releaseOf` 取代那一行的判定；`shownProposalOf` 保留；步骤 3、6、9 的含义与 §8.3 对得上。
- plain-ui 0.7 §11「两层循环」第 6–9 条与 §4.11：与 M7 的 `derivedStage(graph, node)`、第二档与第三档的写入、一次至多三件对得上。
- 图引擎：`waitsForHuman` 只数决定者为人的待决（`projection.ts:28–31`）；`decideRefusal` 让 `llm` 拍决定者为 agent 的待决（`engine.ts:250–253`）；`stage` 在 `EDITABLE_FIELDS`（`schema.ts:96`）；`HistoryEntry.changes` 记 `{from, to}`（`schema.ts:104–131`），U29 成立；`TASK_KINDS` 含 `implement`，`writeScope`、`nonGoals`、`acceptance` 是真字段；`effectiveStage` 在 `stage.ts:90`，`releaseSet` 在 172。
- rc.3 `dsh-goal`：阻塞原因码要匹配 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`，`hourness-design-wait` 合法（76–84）；`resume` 可从 `active`、`paused`、`blocked` 恢复（686–699）；`block` 只从 `active`（720–729），§3.9.1 的行序对这一点是自洽的（先 resume 再被设计退回那一行 block）。
- main：`GuardRule`、`evaluate`、`renderCorrection`（`src/guard/rules.ts`）、`DISPATCH_TOOLS`（`src/workflow/index.ts:23`）、`ORCHESTRATION_RESIDENT_TOOLS`（`src/shared/tool-names.ts:25`）、`isGlmModel`（`src/shared/route.ts:31`）、`GLM_MODELS`（`src/glm-llm/models.ts:25–28`）、`zcode.cjs:386–387` 的两个 id 都在；`src/execute/`、`src/design/`、`src/rules/`、`src/loops/` 仍不在；`src/data/` 只有 `index.ts`，没有 `lock.ts`。
- `docs/CHARTER.md` 0.7 §3.2 第 3 条与 §6 的原文、`docs/ORCHESTRATION.md` §6.5 的影子模式、§2.7 与 §6.2 里直接拦截并写理由的先例，与 §12.1 的引用和做法一致。
- 示范：938 字符（加紧接的一句 998），不超 1,400；`example-model-large` 不是 GLM 的 id，示范不会触发少做上限。
- §1.2 第三列与 §13 没有「验收」「标定」「门禁」「补遗」「投影」等换词表里的词（逐格查过）。
- 第 4 轮排期的几条（F4、F5、F10、N3–N10）在 §18.2 的时间与第 4 轮「对开工的影响」表一致。

## 没核实或不对的假设

- 「§6.6 与 §9.1 已写了两模块的用例、`glm-exec-modules`、`glm-exec-peak`」：页面上没有（R5-F1）。
- 「示范在夹具有判不了条目时被 `floor_unparsed` 拒绝」：写任务的派发不会得到这个码（R5-F2）。
- 「模块读法读不出时往放行一侧错一次，由过期核对兜底」：读法一直读不出时没有兜底（R5-F3）。
- 「模块设计的独立评审归 M7 的派发」：0.5 里没有这个流程，现写法的门禁还会拒绝它（R5-F4）。
- 「一页放行稿让人看到宪章例外」：页还是 0.4（R5-N3）。
- 没核实：规则板最小一片的真实代码（在 `.worktrees/rules-slice`，按任务要求没读），特别是 `PEAK_MODE_SERVICE` 与 `peakModeService` 是否随片子交（§7.2 的代码块与 R1 的测试里有，§16.1 的清单没逐字列）、有没有可注入的计价与时钟接缝；M3 附录 0.5 仍在被修，U28 的逐条核对要等它定稿；U1–U30 的其余项照旧待 L2、L3、L4。
