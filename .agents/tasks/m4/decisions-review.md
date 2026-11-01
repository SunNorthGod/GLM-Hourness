# M4 设计 0.6（决定评审第 2 轮之后修订稿）的独立复评：d-code-rules-enforce、d-credentials-readable、d-timeout-measured、d-one-lift-path

评审对象：`.agents/tasks/m4/design.md` 0.6（2026-11-01 01:34 的稿，处理记录在 §19.7），对照 `graph-ops-decisions.json`（15 条批注）。
上一份评审：本目录原有的 `decisions-review.md` 与 `decisions-review.json`（第 2 轮，CHANGES_REQUESTED，MEDIUM 2 条 F11、F12，NIT 6 条 N9–N14）。本文件覆盖它；上一轮编号沿用，新发现从 F13、N15 起。
依据：图上 `d-timeout-measured` 节点 07:04:52Z、08:17:53Z、12:56:13Z 三条批注，`d-code-rules-enforce` 节点 07:04:52Z、12:56:13Z 两条批注（`d-one-lift-path` 的裁定与细化，图上没有名为 `d-one-lift-path` 的节点），`d-credentials-readable` 节点正文；任务书转述的编排方裁定；源码 `src/memory/audit.ts`、`src/shared/health.ts`、`src/guard/index.ts`、`src/guard/graph-files.ts`、`src/data/project-root.ts`、`src/shared/tool-names.ts`、`src/graph/plain-question.ts`、`src/workflow/morning-report.ts`、`reference/dsh-desktop-0.2.1-rc.3/dsh-client-file-upload/lib/index.js`。
行号指 `design.md` 的 1 起行号。

## 结论

CHANGES_REQUESTED。HIGH 0 条，MEDIUM 2 条（F13、F14），NIT 3 条（N15–N17）。

上一轮的 8 条发现里，F12、N9、N10、N11、N12、N14 已关闭；F11 的「没有信号可数」已关闭，但数出来的结果怎样进行健康没有写通（F13）；N13 的提示已改，纠偏文字与它自己的说明还对不上（N15）。四项决定和任务书里的编排方裁定，主干都写对了。

本轮挡路的两条：

- F13：丢掉的违规记录数要靠行健康留下，而行健康每个会话只存一条、被下一次调用的报告整条替换，设计没写合并办法，验收里「行健康仍写 3」做不出来。
- F14：`lift-files-only` 只认主检出里的 `docs/guard/lifts.jsonl`。这个文件进 git，M7 的 worker 工作树里有它自己的一份，文件工具写那一份不会被拦；合入之后撤下生效，等于 agent 自己撤规则。

## 上一轮发现的复核

| 编号 | 上一轮的问题 | 状态 | 依据 |
| --- | --- | --- | --- |
| F11 | 写失败的记录数不到 | 信号已关闭，下游见 F13 | §3.2 `JournalOutcome = 'written' \| 'failed' \| 'no-home'`；`rowJournal(...).violation` 返回它，失败时先 `report('violations')` 再返回 `'failed'`；`RuleGateOptions.journal` 为 `(record, payload) => Promise<JournalOutcome> \| void`；§3.1 第 7 步按会话累加；§14.2 F11 一条含无目录、两个项目、旧行返回空各例。与现有源码核对：`rowJournal` 确实 `.catch(report(...))` 后正常返回（`src/memory/audit.ts` 第 97–109 行），返回类型变宽不影响今天的 `void journal.violation(...)`。未写通的是计数怎样进行健康，见 F13 |
| F12 | `check_limit` 说明不全 | 已关闭 | §6.3.1 有参数表、给模型的描述、`CHECK_LIMIT_EXAMPLE`、编号的检查顺序与返回；`ENV_TOOL_NAMES = ['check_limit']` 在 §2.2（第 172 行）、E3 文件清单（第 1611 行）、§13.2 共用清单（第 1628 行）；`src/env/limit-tool.ts` 有 §2.2 一行（第 166 行）；示范的 `reason` 与 `plainWordsIn` 核对：`PLAIN_WORDS` 只含「验收、标定、门禁、投影、补遗、附录」与对应英文整词，示范「整个项目跑带类型信息的规则，在这台机器上要 40 秒左右」不命中；不加 `ORCHESTRATION_RESIDENT_TOOLS` 与 `src/shared/tool-names.ts` 文件头一致 |
| N9 | `not_held` 没绑定当前生效的上限 | 已关闭 | §6.3.1 检查顺序第 4 步：只数晚于这一项在 `limits.jsonl` 最后一行（`raise`、`reset` 都算）的、当前生效上限处的 `capped` 或 `timeout`；§14.2 N9 一条有「调高后紧接着再调」等例 |
| N10 | 提醒说「不问人」而收窄检查行要人批准 | 已关闭 | §6.3.1 第 6 条提醒原文分成两句；§7.2、§1.2 同改；`graph-ops-decisions.json` 第 14 条请编排方裁定读法 |
| N11 | 「最近一条人的消息」两种读法，词表不看否定 | 已关闭，残余写明 | §3.5 第 4 步取最后一条 `role: 'user'`、`source.kind === 'user'` 且无 `source.form` 的消息，必须带字符串 `rpcId`，不回头找更早的一条；`NEGATIONS` 排除紧挨在词前的否定词；「留下的风险」补了两种残余；L2 加六例。`rpcId` 的形状已对 `dsh-client-file-upload/lib/index.js` 第 296 行核对 |
| N12 | 人批准时看到超时靠主 Agent 抄 | 已关闭 | §18 第 5 条 `m3` 加 `mustShow` 请求，§13.4 第 12 项注明只有一次样本，`graph-ops-decisions.json` 第 12 条 |
| N13 | `lift-files-only` 的提示指向还不存在的命令 | 提示已关闭，纠偏文字见 N15 | §3.5 第 3 步 `hint` 改为规则板对代码规则接线之前撤不了 |
| N14 | 违规流水不遮盖命令原文，图上没有批注 | 已关闭 | `graph-ops-decisions.json` 第 13 条对 `d-credentials-readable` 说明不遮盖及原因，请裁定；§4.2、§15、§1.5 各指向它 |

## 对照裁定的逐项结果

| 裁定与检查项 | 结果 | 依据 |
| --- | --- | --- |
| d-code-rules-enforce：试运行、转正、影子、标注、回放、语料、「只记下，不挡」、M7「影子转生效」已删 | 通过 | 对全文第 1–1919 行逐项检索 `影子`、`试运行`、`转正`、`PROMOTION`、`RuleMode`、`labels.jsonl`、`回放`、`语料`、`credential-read`、`looksSecret`、`/guard `、`unlock-shell`、`hourness-init`：104 处命中全部在「已删掉」的叙述、被取代条款的引文或修订记录里；`GuardRule` 无 `mode` 字段（§3.1） |
| d-code-rules-enforce：新插件行默认禁用、验证过才启用保留 | 通过 | §1.3、§3.1 |
| 块记录：每次拦下写项目违规流水，带规则 id、时刻、被拦的是什么、为什么 | 通过，落盘计数见 F13 | `ViolationRecord` 加 `call`、`ref`，原有 `correction` 写明原因；§3.1 第 7 步每条拒绝一条记录；路径 `<项目>/.llm/audit/violations.jsonl` 由 `projectOf(cwd)` 定（`src/data/project-root.ts` 已有，签名核对一致）；`ruleStats` 供晨报与规则页同读（§3.6、§3.10） |
| d-code-rules-enforce：只能事后发现的规则拦不住，由 M4 定它变成什么 | 通过 | §3.4：`mode: 'late'` 的记录加该 agent 下一步之前的纠正提醒，没有下一步时只有记录；`classifyRecord` 把它算作晚到的拦下 |
| d-credentials-readable：读凭证的规则整条删掉，不留只记录 | 通过 | §4.2、§1.2 `m4-rules` 第 1 条、§14.1；写凭证文件受圈禁照旧 |
| d-timeout-measured：超时 = 3 × 运行时间，先取估计，跑过后取最近最慢一次，封顶 | 通过 | §6.3.1 第 1、2、5 条；`CHECK_TIMEOUT_FACTOR = 3`、`CHECK_RECENT_RUNS = 10`、`CHECK_TIMEOUT_CAP_MS = 60_000`；超时的那一次按当时的上限计入，下一次是它的 3 倍 |
| d-timeout-measured：下限 | 通过 | 图上 12:56:13Z 批注明写「不低于下限、不高于上限，每份设计把下限写在上限旁（M4 改完就跑的检查下限 5 秒保留）」，设计 `CHECK_TIMEOUT_FLOOR_MS = 5_000` 写在上限旁；任务书转述的裁定里没有这一项，依据是图上批注 |
| d-timeout-measured：没有估计时用缺省值 | 通过，是设计者的取值 | 裁定只给了拦路脚本的缺省 10 秒；M4 检查没有单独的缺省，设计取上限 60 秒（§6.1.1、§6.3.1 第 2 条），§16 第 1817 行记为可推翻的取舍 |
| d-timeout-measured：M4 每个检查最长 60 秒、一步 20 秒 | 通过 | `CHECK_STEP_DEADLINE_MS = 20_000`，一步等待取本步最大超时与 20 秒中小的 |
| d-timeout-measured：拦路脚本缺省 10 秒、最大 30 秒，超时放行、后台跑到 10 分钟、晚到的拦下告诉主 Agent；M7 合入前检查 30 分钟 | 通过（M4 不拥有这些数） | §6.3.1 复述并指明各归规则板、M7 写一处；`graph-ops-decisions.json` 第 3、5 条带这些数 |
| d-timeout-measured：人批准时看到超时和它从哪个估计算出来 | 通过 | `timeoutText` 四种情形，每句不超过 40 个码点；`graph_propose`、`graph_edit` 附 `timeouts`；硬核对请求在 `m3` |
| d-timeout-measured：优雅失败 | 通过 | 进程树结束、别的检查照交、env 行不降级、结局「没跑完」、消息含检查名、上限、实际耗时与下一次的值，L2 逐字钉住；队列等待见 N17 |
| d-timeout-measured：可追溯（来源、时间、旧值；每次超时的条目、上限、耗时、结局；页面与晨报可见） | 通过 | `RunLine`/`EstimateLine`/`ValueLine`/`TimeoutLine`；循环板页 `details` 每个检查多一行；晨报「检查的超时」一节 |
| d-timeout-measured：超过最大值保持最大值并告诉主 Agent | 通过 | 第 6 条；环境提醒只给根 agent，只在状态变化时注入；调高上限走 `check_limit`（图上 12:56:13Z 批注允许「把上限当作可撤回的设置调高并写明理由」，600 秒硬顶已请编排方裁定，`graph-ops-decisions.json` 第 9 条） |
| 已放行设计（规则板 0.10、循环板 0.6）的差别写成 graph-ops 批注，不作阻断 | 通过 | 第 3、4、5 条写出「第一个超时 = 估计的 3 倍」与差别，标「等 dogfood 之后处理」；设计未把这些差别当作阻断 |
| d-one-lift-path：人撤任何一条规则只有一条路，无 M4 专属命令 | 通过，例外见 F14、N15 | §3.5、§3.9：只有 `guard_lift`（主 Agent 在人说过之后调）与规则板 `/rules lift`；`src/guard/` 无命令注册（§14.2 静态检查）；全文无 `/guard lift`、`unlock-shell`、`hourness-init` |
| d-one-lift-path：规则板把代码规则的撤下交给拥有它的那一行 | 通过 | `glmHournessLifts.setLifted`，规则 id 先整串匹配再去一个 `<行>:` 前缀；`GUARD_RULES` 含 guard、graph、loops、metrics、bootstrap 五个行值；M3、M7 表等它们改经 `installRuleGate` 后才能撤，§3.1、§18 写明 |
| d-one-lift-path：内置代码规则可撤是对 d-defaults-readonly 的例外 | 通过 | §1.5、§3.8 各记一笔 |
| `graph-ops-decisions.json` | 通过 | 解析为 15 个 `{op: 'comment', id, text}`，15 个目标节点文件都在 `docs/graph/nodes/` |

## 发现

### F13 MEDIUM：丢掉的违规记录数要靠行健康留下，行健康每个会话只存一条且被下一次调用整条替换

位置：§3.1 `RuleGateOptions.health`（第 311 行）与第 7 步（第 330 行）；§1.2 `m4-gate` 验收第 1 条；§11 写流水一行（第 1504 行）；§14.2 F11 一条（第 1762 行「`appendFile` 恢复之后再拒绝一次……行健康仍写 3」）；`src/shared/health.ts` 的 `report`；`src/guard/index.ts` 第 189 行。

问题：设计让 `installRuleGate` 在记录写失败后调 `health(sessionId, 'N 条违规没有落盘')`，并说「写入恢复之后这个数不清零，行健康一直留着它」。`provideRowHealth(...).report(sessionId, state, reason)` 每个会话只存一条：`sessions.delete(sessionId); sessions.set(sessionId, stamp(state, reason))`，同状态同原因才跳过，否则整条替换。guard 行今天在每一次调用里都重算一次并报告：`health.report(sessionIdOf(payload.agent), ...guardHealth(roots, projectHome, shadow, dialectUnusable))`（第 189 行），`guardHealth` 返回的原因里没有丢失数。设计只说 `rules()` 回调「同时按今天的 `guardHealth` 报行健康」，没有写 `health(sessionId, problem)` 这个选项怎样与它合并。按字面实现，丢失数在同一会话的下一次调用就被覆盖，L2 里「行健康仍写 3」在真实的 `provideRowHealth` 上不成立；用假的健康对象写的测试会通过，真实行里却看不到。这是「失败要出声」里唯一一条能看出违规记录丢失的信号，也是 F11 的验收依据。图行、循环板、指标流水、接管行各有自己的 `provideRowHealth`，同一问题在每一行都有。检测器出错（第 328 行「`errors` 交给 `health`」）走同一条路，同样会被覆盖。

修法：

- `installRuleGate` 内部按会话保存持久问题表（丢失数、检测器出错的规则 id），选项 `health` 改成 `report(sessionId, problems: readonly string[]): void`，每次问题表变化时用整张表调用，由各行把整张表并进自己的行健康原因；或者 `installRuleGate` 导出 `gateProblems(sessionId): readonly string[]`，各行每次报行健康时把它并进原因并把状态置为 `degraded`。二选一，写明。
- 写入结果在调用返回之后才落定（第 330 行「写记录不等结果」），所以落定时也要主动报一次，不能只靠下一次调用顺带带上。
- §14.2 F11 一条的断言改在真实的 `provideRowHealth` 上做：三次失败之后，同一会话再来一次被放行的调用和一次被拒的调用，`view.session(id).reason` 里都还有「3 条违规没有落盘」。图行也加一例。

### F14 MEDIUM：`lift-files-only` 只护主检出里的那一份文件，worker 工作树里的副本没护住

位置：§3.5「护住这个文件」（第 656 行）与「状态文件」（第 641 行）；§1.2 `m4-gate` 验收第 4、7 条；§2.4（第 221 行）；§3.8；§11 撤下一行（第 1565 行）。

问题：设计说 `lifts.jsonl` 进 git（第 655、656 行：提交由主 Agent 做），由 `lift-files-only` 护住，「判法同 `graph-files-only`」，「只认这一个确切路径 `docs/guard/lifts.jsonl`（解析到项目根下的那个文件）」。`graphFilesOnly`（`src/guard/graph-files.ts`）的做法是把文件工具的目标按调用方的 `cwd` 解析成绝对路径，再与规则对象里那一个绝对路径比较；shell 文本则匹配那个绝对路径，或「从 `cwd` 到它的相对写法」，后者以 `..` 开头时被丢掉。`projectOf` 把 M7 的工作树归到主检出，所以规则对象里的路径是 `<主检出>/docs/guard/lifts.jsonl`。M7 的 worker 在 `<主检出>/.worktrees/<名>/` 里，仓库里已提交的 `lifts.jsonl` 在那里有自己的一份；worker 用 `write` 写相对路径 `docs/guard/lifts.jsonl`，解析成 `<工作树>/docs/guard/lifts.jsonl`，不等于规则对象里的路径，放行。worker 提交、主 Agent 合入之后，主检出里的 `lifts.jsonl` 多了一行 `via: 'chat'` 的撤下，`liftedRules` 读到，规则停拦，没有人说过话。能挡住的只有 M7 对 worker 的写入范围（范围含 `docs/` 的 worker 挡不住），事后能看到的只有晨报里「lifts.jsonl 里有流水没有的撤下」。这与验收第 4 条「agent 用文件工具或 shell 写 `docs/guard/` 被 `lift-files-only` 拦下」和第 7 条「agent 写不进」不符，也违背 `d-one-lift-path`「agent 不能自己撤」。§3.5 说「worker 读写的是同一份」，对 harness 的读写成立，对 worker 的文件工具写入不成立。

修法：

- `lift-files-only` 按「解析后的路径相对其所在检出的根是 `docs/guard/lifts.jsonl`」判：主检出、`git worktree list` 里的每个根、调用方 `cwd` 所在检出的根，三类都算；shell 文本里 `docs/guard/lifts.jsonl` 的相对写法也算提及。
- §14.2 加两例：worker 工作树里的会话 `write` 相对路径 `docs/guard/lifts.jsonl` 被拦；同一会话 `write` 工作树里的绝对路径同样被拦；`docs/guard/README.md` 仍放行。
- 晨报的「lifts.jsonl 里有流水没有的撤下」检查写明在主检出合入之后也做，不只在写入当时。

### N15 NIT：告知人去用规则板上还没接线的命令；`lift-files-only` 的纠偏文字与说明对不上

位置：§3.5 `guard_lift` 返回的 `message`（「use /rules restore <id> on the rules board」）与第 6 步 `unavailable` 的 `hint`（「use /rules lift on the rules board」）；`lift-files-only` 的纠偏正路（第 656 行）与 §3.5 L2 最后一句。

规则板对代码规则的接线在 dogfood 之后（§18、§16）。接线之前，`guard_lift` 成功后告诉人「或在规则板上用 `/rules restore <id>`」，人照做会得到规则板的「找不到规则」。N13 只改了 `lift-files-only` 的 `hint`，同类的两处没改。另外，设计说 `lift-files-only` 的纠偏「不写『对主 Agent 说就能撤』那一句通用的话」，但钉住的正路原文是「Rules are lifted when the human asks the main agent, which calls guard_lift with the human's words, or when the human uses /rules lift on the rules board.」，这一句就是那句通用的话；L2 只检查不含「telling the main agent」几个字，原文里是「asks the main agent」，测试会通过。

修法：`message` 与 `hint` 里的规则板命令加上「once the rules board offers it for code rules」或在接线前不提；`lift-files-only` 的正路改写成不含通用句，例如「Do not edit this file. Only the human can lift or restore rules. If you think a rule blocks you wrongly, say so in your reply.」，L2 钉整句。

### N16 NIT：上限提醒没有给出 `check_limit` 要的 `check` 键

位置：§6.3.1 第 6 条提醒原文；§7.2；`check_limit` 参数表。

提醒写「Check eslint is held at its ceiling … use check_limit {check, seconds, reason}」，而 `check` 必须是 `<工具节点 id>/<名字>`（例 `tool-3/eslint`）。主 Agent 传 `eslint` 会得到 `unknown_check`，`hint` 列出现有的，能自己纠正，但多一次调用，GLM 上的延迟工具多一次往返。修法：提醒里直接写 `check "tool-3/eslint"`，由 `<节点 id>/<名字>` 拼出，L2 钉住。

### N17 NIT：检查进程排队没有等待上限，调高后的上限会让两个名额被占满十分钟且没有任何消息

位置：§6.3 末尾「全进程至多同时 2 个检查进程，其余排队」（第 1225 行）；§6.3.1 `check_limit`（上限至 600 秒）。

0.5 里每个检查最长 60 秒，排队最坏等 60 秒。0.6 加了 `check_limit` 之后，一项被调到 600 秒又卡住的检查占一个名额十分钟；两项就占满，全进程（所有会话）其余检查都排队，没有开始跑所以没有超时消息，也没有一条给 agent 的话。设计没写排队的检查怎样告诉 agent、等多久放弃。修法：提醒里对本步没有开始跑的检查写「queued behind N running checks」；排队超过一个上限（例如 `CHECK_STEP_DEADLINE_MS` 的 3 倍）记一条结局为「没跑」的记录，晨报「检查的超时」一节列出；上限被调高的检查最多占一个名额。

## 已核实的假设

- 图上三条 `d-timeout-measured` 批注、两条 `d-code-rules-enforce` 批注（含 `d-one-lift-path` 的裁定与细化）与任务书转述一致；12:56:13Z 的细化逐条落在设计里。
- `rowJournal` 对写入失败 `.catch` 后正常返回，一次性告警按写入类别去重（`src/memory/audit.ts` 第 97–109 行）；新返回值 `JournalOutcome` 的设计与它兼容。
- `src/data/project-root.ts` 已导出 `projectOf(cwd, home?)`、`gitDirOf(root)`、`ensureIgnored(root, directory)`，设计引用的签名一致；工作树经 `commondir` 归到主检出。
- `src/shared/tool-names.ts` 文件头：工具名是字符串，由 `tests/contracts.spec.ts` 钉到注册上；不在 `ORCHESTRATION_RESIDENT_TOOLS` 里的编排工具默认延迟。
- `PLAIN_WORDS` 与 `plainWordsIn` 的行为：中文按子串、英文按整词不分大小写；`CHECK_LIMIT_EXAMPLE` 的 `reason` 不命中。
- `src/workflow/morning-report.ts` 第 38–39 行只认没有 `mode` 的拒绝与 `mode: 'shadow'`，与设计对「今天必败」的描述一致。
- 客户端送来的人的消息带字符串 `rpcId`、其他来源没有：`dsh-client-file-upload/lib/index.js` 第 296–297 行按同一判断认。
- `graph-ops-decisions.json` 解析为 15 个 `comment`，目标节点文件都存在；第 3、4、5 条写出「第一个超时 = 估计的 3 倍」及差别，标明等 dogfood 之后处理。
- 超时的算术：估 1 秒得下限 5 秒；估 3 秒得 9 秒；估 25 秒得 60 秒并带 `capped: {wantedMs: 75000}`；超时那一次按上限计入，下一次是它的 3 倍；`<预计>` 的正则 `^[1-9][0-9]{0,2}s$` 把 0、负数、带小数的估计挡在检查行读不懂这一层。

## 错误或未核实的假设

- 设计假设 `health(sessionId, problem)` 报的丢失数能一直留在行健康里。错误（F13）：行健康每会话一条、整条替换，且 guard 行每次调用都重报。
- 设计假设 `lift-files-only` 按「项目根下那一个文件」判就护住了「agent 写不进」。错误（F14）：worker 工作树里有已提交文件的副本。
- 设计假设排队的检查最多等一个 60 秒。0.6 的 `check_limit` 使这个前提不成立（N17）。
- 未核实：桌面版上人的消息带 `rpcId`（设计自己列为 L4 第 1 项，源码层面已核对）。
- 未核实：`session.deriveMessages()` 在压缩之后是否仍含最近一条人的原消息；`guard_lift` 与 `request_exception` 都依赖它，设计没有写压缩后的取法。本轮不当作发现，实现时请在 L2 加一例。
- 未核实：GLM-5.3 是否照说明把超时一句抄进方案（N12，L4 第 12 项才能验）。
- 未评审：`onepage.md` 仍是 0.5 稿，按任务分工在本评审通过之后另一步重写。
- 没有运行任何代码或测试；所有「通过」都来自读设计、源码与图节点。
