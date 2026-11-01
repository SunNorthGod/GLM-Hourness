# 接管项目设计（`bootstrap`）独立设计评审 第 3 轮（末轮）

评审对象：`.agents/tasks/bootstrap/design.md` 0.3（2026-10-30 13:42 写入）、`mockup-takeover.svg`（0.3）、`graph-ops.json`。
评审依据：`docs/DEVELOPMENT.md` §1.1 的挡路标准（只有三类发现挡路：验收或需求没有满足；不可逆损失而没有预防；失败了没有途径发现、没有恢复办法或事后查不到原因）；编排者的 brief；`.agents/tasks/design-context.md`；节点 `bootstrap`；第 1、2 轮评审 `design-review-pass-1.json`、`design-review-pass-2.json` 与本稿 §22 的逐条回应。
轮次：第 3 轮（任务目录里有 2 个 `design-review-pass-*.json`）。上一轮挡路 2 条（F23、F24），第 1 轮挡路 4 条（F1–F4）。这是 question-11 循环的最后一轮。

结论：APPROVED。挡路 0 条（上一轮 2 条）。非阻断 4 条（F31–F34）。上一轮两条挡路 F23、F24 已核实关闭；第 1 轮的 F1–F4 在本稿里仍成立。挡路条数 2 → 0，循环以通过收尾（不触发 REVIEW_LOOP_STALLED）。

本轮自己读的依据，不取本稿的转述：`reference/dsh-desktop-0.2.1-rc.3/dsh-agent-loop/lib/index.js`；`.agents/tasks/m3/design-addendum.md`（0.4）§3.3、§3.4、§3.5、§3.6、§3.8、§3.13；`.agents/tasks/rules/design.md`（已到 0.10）§7、§9.3 与服务契约段；`.agents/tasks/m7/design.md` 的篇幅；`graph-ops.json`；`mockup-takeover.svg`。

## 上一轮挡路发现的复核

### F23 给人看的文字用被取代的格式、另起一套与 M3 并行的问人与核对 —— 关闭

- 格式：本稿全稿给人的文字改成「题目一段、背景/推荐/疑问/不做四行各自成段、标签不加粗、每行一处加粗、问话放在整条消息最后」。核对 M3 附录 0.4 §3.3：`renderProposal` 的输出就是题目一段加四行各一段、段间空一行、标签不加粗（`src/graph/proposal.ts`，`PROPOSAL_LABELS`、`PROPOSAL_LIMITS = {line:40, boldMin:2, boldMax:12, conclusion:120, perReply:3}`、`proposalLineRefusal`、`splitBold`）。本稿 §7.3 的清单样子与 §5.4 的两件事样子、`mockup-takeover.svg` 的每个气泡都是这个格式（标签用 `tspan font-weight="bold"` 只加粗一处，问话在末行）。
- 机制：本稿改走 M3 的 `propose_to_human` / `record_human_answer`，删去 `bootstrap_apply`、`relay-check.ts` 与自排版、自核对。核对 M3 附录 0.4 §3.13：`attach` 的分派表「每一行由那块板合入时自己加，导入它自己的服务模块」，已有 `rules:`、`loops:` 两行；本稿加 `bootstrap:` 一行（`takeoverAttachOf`、`takeoverAttachLine`、出题前 `attachable`、拍板后 `acceptProposal`）与此扩展模型一致，不是与 M3 冲突。续做读图上的拍板、不读会话日志（§7.4、§9.2），压缩与换会话之后仍在。
- 请 M3 加的可选参数 `lines`：M3 §3.13 的 `attachable({cwd, proposal})` 今天没有 `lines`。本稿有退路——`acceptProposal` 第 5 步在写入前比对图上那张待决的四行摘要 `linesDigest` 与结论，不同就什么都不写、报 `changed`（§7.4）。所以主 Agent 改了四行时，无论 M3 有没有加 `lines`，都在出题或写入两处之一被挡下并报出，不是失败没有途径发现。
- 验收：§1.4 bootstrap-paths 第 5 条（两件事四行过 `proposalLineRefusal`、题目合 `PLAIN_LIMITS.title`）、bootstrap-review 第 2、3 条（交回四行过检查；四行不符、`attach` 不是最新版、结论不符时什么都不写并报原因）、特性 L4「对话里每件事都是题目加四行」。`graph-ops.json` 两张待决的 `body` 是四行、`d-chat-not-cards` 的批注记了改法。

### F24 「不许碰」的规则在规则板下不随接管生效、也不报 —— 关闭

- 流程：本稿 §5.4 改为 harness 写 `rule-draft.json`、主 Agent 调 `rules_propose` 再 `propose_to_human`（`attach: rules:<id>`）挂锚点、人同意由 `record_human_answer` 记下、规则板按 `attach` 写入。核对规则板设计（现为 0.10）§7 第 7 条与 §9.3：`rules_propose` 只记一条 `open` 的提议，主 Agent 用 `propose_to_human`（`attach: rules:<提议 id>`）交给人，拍板成功后经 `proposalIdOf` 认出、调 `acceptProposal` 写入——与本稿一致。
- 结局上报：§7.7 的 `questionStatus` 对每张规则待决给一句人话（已生效、你同意了但还没写上、在等你、提议不在了、你不要了、规则板没装），写进 `status`、清单全文与 `applied` 的结果；§7.2 第 8 条门槛：有仓库内的不许碰路径时要有一张没被放弃的规则待决，否则 `gate_unmet`。所以「规则没生效」此刻有三处能发现：清单门槛、`status`/结果的逐条结局、规则板行健康 24 小时内报「图上待决没有对应的规则板提议」。失败有途径发现，恢复路（60 秒按图补写 + 规则页恢复一节）也在。
- 验收：§1.4 bootstrap-review 第 7 条「人同意之后规则服务里有这条规则，或结果与 status 写明它为什么不在」。

### 第 1 轮 F1–F4 在 0.3 里仍成立

- F1（空闲主 Agent 不开工、没人叫人说话）：§5.1 的接管开始 notice 由 `prepare` 之后发，运行中 `steer`、空闲 `followup`。核对 agent-loop `followup→send(…, "next-turn", true)`、`steer→send(…, "next-step", true)` 都唤醒、`inject→send(…, "next-step", false)` 不唤醒（`dsh-agent-loop/lib/index.js` 的 `send`/`followup`/`steer`/`inject`）。§1.4 bootstrap-row 第 2 条钉住。
- F2（三种判法）：全稿只有 `hasProjectGraph`（§3.1、§3.4、§14），放弃后能重开（§3.2），空 `nodes/` 算没有图。§1.4 bootstrap-row 第 4 条。
- F3（图不进 git）：§7.6 主 Agent 带图目录提交、harness 每回合核对 `git ls-files`、`status` 与行健康写明；进 git 之前被清理命令删掉由 M3 附录 0.4 §2.5 的快照兜底（该附录 L2 已有「`git clean -fd` 之后未跟踪文件能 `git restore --source=<K>` 恢复」一例）。§1.4 bootstrap-review 第 6 条。
- F4（Windows 试跑误报）：§6.2 第 5 条 `confinement-limited`，§1.4 bootstrap-trial 第 5–7 条。

## 本轮的非阻断发现

| # | 严重度 | 问题与位置 | 改法 |
| --- | --- | --- | --- |
| F31 | MEDIUM | 规则板依赖的版本与行号已漂移：本稿 §2.4、§5.4、§7.4、§7.7 引「规则板 0.8」并给行号（`AcceptRequest` :947–952、`attachable` :964、`proposalIdOf` :976、§2.2 :162–178）。规则板现为 0.10（1619 行），这些契约仍在但位置变了：`RULES_SERVICE` 在 :1204、`AcceptRequest` :1205、`acceptProposal` :1220、`attachable({cwd, proposal})` :1230、`proposalIdOf` :1248、`proposalLine` :1250。机制不变，不挡路 | 引用改到 0.10 的版本号与行号；§7.7「已生效」读 `attachable` 的语义核对 0.10 的注释（「有没有这条 open、via 为 graph 的提议」，:1223–1228），U11 的推断照旧列为依赖 |
| F32 | MEDIUM | `rule-draft.json` 的规则体用的是 0.8 时期的字段：§5.4 第 1 步写 `{action: {class: 'file-write', paths}, effect: 'block'}`。规则板 0.10 的 `Rule` 形状是 `when: RuleTrigger`、`filter?: EventFilter`、`action: {kind: 'block'|…}`（设计 :940–963），没有 `action.class`、`action.paths`、`effect`。`Proposal.body` 是 `unknown`，由规则板校验，所以草稿形状不对会让 `rules_propose` 拒绝、`bootstrap_review` 第 8 条据此挡住清单，不是静默失效，不挡路 | 把草稿体改成 0.10 的 `Rule` 输入形状（文件写拦截：相应的 `when`/`filter` 加 `action: {kind: 'block'}`，`lifetime: {kind: 'until-lifted'}`）；§2.4 规则板一行标明「0.10，实施时核对」 |
| F33 | NIT | M7 的行号越界：§5.5、§22 引 `no_gate_norm` 为 M7「§6.4 :1250」，而当前 `m7/design.md` 只有 1057 行；:1250 指向还在写的 M7 0.4。本稿已标 M7 0.4「在写」并同时写节号，事后能对上，不挡路 | M7 0.4 落地前只保留节号（§3.8.1、§6.4），行号等 0.4 定稿再写 |
| F34 | NIT | `graph-ops.json` 的 D1、D2 仍带选项式字段（`options`、`recommend`、`crux`、`verdict`、`weight`）；`body` 已是定稿四行，并写明「下面的选项只是引擎今天要求的格式」。这是对今天引擎（`src/graph/format.ts` 待决必须有选项）的迁就，编排者据 `body` 的四行问人即可，不挡路 | 待 M3 第 6 步的提议式待决落地后，编排者改用无选项的提议式；在那之前按 `body` 的四行与末行问话问人，不把 A/B 当选项按钮展示 |

## 核实过的假设

- M3 附录 0.4 §3.3：`renderProposal` 输出题目一段加四行、标签不加粗、每行一处 `**…**`（2–12 码点）、`PROPOSAL_LIMITS.perReply = 3`、`background` 读 `PLAIN_LIMITS.background`。本稿给人的格式与之逐字一致。
- M3 附录 0.4 §3.4、§3.5：`propose_to_human`（`kind: 'question'`，可带 `attach`、`parent`、`question`）与 `record_human_answer`（`answer: 'agree'|'add'|'reject'`，带 `words`）存在，属设计行、全局注册、非主 Agent 的工具面去掉；`confirm`/`release` 不写图，`question` 写提议式待决。
- M3 附录 0.4 §3.13：`attach` 分派表由各板自加一行、M3 不导入板的其余代码；已有 `rules:`、`loops:`；本稿加 `bootstrap:` 一行与此一致。`attachable` 今天的签名没有 `lines`，本稿的 `linesDigest` 退路覆盖了这一缺口。
- M3 附录 0.4 §3.6：原话核对用 `personSaid`，只认人在这张待决最后一次提出/修改之后发来的消息，fail-closed；本稿 §8.4 照引「防的与不防的」。
- 规则板设计 0.10 §7 第 7 条、§9.3 与服务契约：`rules_propose`→`propose_to_human(attach rules:<id>)`→`record_human_answer`→`acceptProposal` 的流程存在；`AcceptRequest`（:1205）、`acceptProposal`（:1220）、`attachable`（:1230）、`proposalIdOf`（:1248）、`proposalLine`（:1250）、`rulesService`（:1253）、`RULES_SERVICE='glmHournessRules'`（:1204）都在。拍板失败时两块板按图上的拍板 60 秒内补写。
- agent-loop（`dsh-agent-loop/lib/index.js`）：`send(message, target, wakeup)`；`followup→("next-turn", true)`、`steer→("next-step", true)` 都唤醒；`inject→("next-step", false)` 不唤醒；`executeToolCalls` 的 `exec.callId = block.id`。本稿 §5.1 的 notice 唤醒与 §7.2 的 `callId` 据此成立。
- `mockup-takeover.svg`、`graph-ops.json`：草图与两张待决的 `body` 都是定稿四行格式；七个任务带固定 id 与 `depends` 边；给 m3/m4/m7/onboarding/rules/metrics/lessons/d-chat-not-cards 的批注覆盖本稿的接缝。
- `m7/design.md` 篇幅为 1057 行（F33 的依据）。

## 没核实或不成立的假设

- 不成立（非阻断，F31）：§2.4、§5.4、§7.4、§7.7 以为规则板停在 0.8；它已到 0.10，契约不变但行号全移。
- 不成立（非阻断，F32）：§5.4 的 `rule-draft.json` 规则体用 0.8 期字段（`action.class`/`action.paths`/`effect`），与 0.10 的 `Rule`（`when`/`filter`/`action.kind`）不符。
- 未核实（本稿已列为依赖）：U1–U10 的试跑与沙盒假设；U11（规则板提议被接受后 `attachable` 答不 ok）由规则板 0.10 的注释支持、仍标为推断。`lines` 可选参数、`bootstrap:` 分派行、M7 的 `only`/`GATE_LINE_FORMS`/`changed`、M4 的 `env` 格式都是尚未合入的接缝，本稿已列为依赖并给了退路或门槛。
- 依赖还在变：M3 附录 0.4（写稿中）、规则板 0.10、M7 0.4（在写）、M4 0.3（评审中）、plain-ui 0.6/0.7、指标 0.1；brief 已允许按读到的版本引用并标明。

## 记图

brief 规定本步不写 `docs/graph/`，图由编排者记录。评审结果在 `design-review.json` 与 `design-review-pass-3.json`。本轮为通过（APPROVED），无挡路发现，循环在第 3 轮正常收尾。

---

# 接管项目设计（`bootstrap`）独立设计评审 第 4 轮（对齐轮，设计 0.4）

评审对象：`.agents/tasks/bootstrap/design.md` 0.4（2026-10-31 03:46 写入，1,530 行）、`mockup-takeover.svg`（0.4）。接手证据一并读了：`design-0.3.md`（0.3 原文）、`design-0.4-cutoff-draft.md`（被账号用量上限截断的上一位作者的稿，1,364 行）、`graph-ops.json`（仍是 0.3 的 21 条）。`graph-ops-align.json` 与 `onepage.md` 还没写，brief 规定由后面的步骤写，不在本轮范围。

评审依据：`.agents/tasks/align-rounds-2026-10-30/brief.md`（规则 1 至 8，本轮按规则 4）；`.agents/tasks/design-context.md` 全文；M3 附录 0.5（`design-addendum.md`）与 `m3/design.md`；规则板 0.10；循环板 0.6；M7 0.6；M4 `design.md` 0.5（对齐轮的稿，盘上已有）；`docs/CHARTER.md` 0.7；图节点 `bootstrap`、`d-boards-as-hooks`、`d-rules-in-repo`、`d-main-agent-peak-exempt`、`d-memory-scope`、`d-agent-examples`、`d-script-timeout`、`d-alignment-rounds`、`d-freeze-until-dogfood`（直接读 `docs/graph/nodes/*.json` 的批注，比设计文档新的以节点为准）；源码 `src/data/project-root.ts`、`src/shared/peak-mode.ts`、`src/shared/step-notice.ts`、`src/design/mode.ts`、`src/graph/{engine,stage,schema,service,run-control}.ts`。本轮没有重跑任何东西，也没有改设计。

轮次：第 4 轮。0.3 在第 3 轮 APPROVED 之后，因为人定了新的事、四份设计放行而重写成 0.4；不是 question-11 循环的延续。上一轮的发现 F31 至 F34 逐条复核在下面。

判决规则：HIGH 与 MEDIUM 的条数大于 0 即 CHANGES_REQUESTED（本步说明）。第 1 至 3 轮按 `docs/DEVELOPMENT.md` §1.1 的挡路标准计数；下表的「挡路」列是各轮当时的口径，最后一列是同一轮按今天口径的重算。

| 轮 | 设计版本 | 判决 | 挡路（当时口径） | 今天口径下的 HIGH + MEDIUM |
| --- | --- | --- | --- | --- |
| 1 | 0.1 | CHANGES_REQUESTED | 4（F1–F4），非阻断 18 | 4 + 其中标 MEDIUM 的非阻断（未逐条重算） |
| 2 | 0.2 | CHANGES_REQUESTED | 2（F23、F24），非阻断 6 | 2 + 其中标 MEDIUM 的非阻断（未逐条重算） |
| 3 | 0.3 | APPROVED | 0，非阻断 4（F31、F32 标 MEDIUM，F33、F34 标 NIT） | 2（F31、F32，本轮已关闭） |
| 4 | 0.4 | CHANGES_REQUESTED | HIGH 0 + MEDIUM 1 = 1 | 1（F35） |

结论：CHANGES_REQUESTED。HIGH 0，MEDIUM 1（F35），NIT 8（F36–F43）；上一轮的 F31–F33 已关闭，F34 仍在（NIT，等 M3 第 6 步）。挡路条数 2（第 2 轮）→ 0（第 3 轮）→ 1（本轮，口径已换成 HIGH + MEDIUM）。0.4 是对 0.3 的对齐重写，不是修一条挡路；这一条 MEDIUM 是对齐里漏记的一项对 M3 的请求，改法在文字上，不动设计方向。

## 接手的核对：截断后的处理

brief 要求的三件：0.3 原文保留、没有写了一半的节留在稿里、变更记录写明作者在截断稿里找到了什么、怎样处理。逐项核对：

- 0.3 原文保留：`design-0.3.md` 在，233,435 字节，最后写入 2026-10-30 13:42:46，与 0.3 的写入时刻相同；第 3 行是「版本：0.3（2026-10-30），第三稿」。0.3 的草图另存为 `mockup-takeover-0.3.svg`。截断稿原样另存为 `design-0.4-cutoff-draft.md`（242,000 字节，2026-10-31 02:09:25）。三份各自完整，没有一份被改写成别的内容。
- 变更记录的内容与截断稿实际状态一致：§23.1 说头里引的 §2.5、§5.9、§23 在稿里不存在。核对截断稿的标题表，第 0 至 22 节里确实没有 §2.5、§5.9、§23；头与 §0、§0.1 里出现 D3（共 3 处），§18 里没有。§23.1 说 0.3 的头原样叠在新头后面：截断稿第 17 行是「以下是 0.3 的说明，原样保留：版本：0.3……」，属实。§23.1 说 §1.2 至 §17 没有一处改动：把截断稿的 §3 和 0.3 的 §3 逐行比，116 行对 116 行，差异 0；截断稿里 `规则板 0.8` 13 处、`lines` 参数 7 处、`npx` 2 处仍在，与 §23.1 列的「规则板 0.8 的行号、`lines` 参数、`npx` 检查行」相符。M4 一行读成「检查器记录」、依据 M4 0.4：截断稿第 13 行和依赖表原文如此，§23.1 说得准。
- 新稿里没有写了一半的节：84 个标题（§0 至 §23.5）都有内容；围栏代码块 20 个，成对；没有 TODO、待补一类的占位；新稿开头只有一个 0.4 头，没有叠放 0.3 的头；§23.5 是最后一节，句子写完。§22 末行与 `## 23.` 之间、§2.5 末段与 `## 3.` 之间、§5.9 末段与 `## 6.` 之间少一个空行，只是排版，不影响读法。
- 变更记录写明了作者找到什么、怎样处理：§23.1 一张表，列出头、§0 与 §0.1、§1.1、§1.2 至 §17、§18 与 §19、§20 至 §22、同目录其他文件七类，每类有「接手时看到的」和「处理」。头和依赖表的处理（重写、去掉叠放的 0.3 头）、§1.1 的处理（补五行改三行）都能在新稿里找到。§23.2 一张表逐条把人定与四份设计对到改动所在的节。这一部分合格。
- 事实核对（§23.3）：`git log 9c346fb..HEAD -- src` 现在仍为空（HEAD 是 34b1004，其间 12 个提交都不碰 `src/`）；`ensureIgnored` 追加的是一行 `.llm/`、写不进会抛错、调用方不建目录，`projectOf` 对主目录、磁盘根和没有 `.git` 也没有 `.llm/` 的目录返回 `undefined`，都和 `src/data/project-root.ts` 一致；`holderFileOf(userHome, dir)` 在 `src/design/mode.ts`:261，持有者记录今天在用户级目录，属实。

## 上一轮发现的复核

- F31（规则板版本与行号漂移）：关闭。非历史章节里没有「规则板 0.8」（只剩 §20 的 0.3 行和 §21、§22 里原样保留的旧回应）；§2.4 规则板一行写 0.10，引节号不引行号，`RULES_SERVICE` 一类名字与规则板 0.10 §7.2 的服务契约一段（`AcceptRequest`、`acceptProposal`、`attachable`、`proposalIdOf`、`proposalLine`）逐个对得上。
- F32（`rule-draft.json` 用 0.8 的字段）：关闭。§5.4 的草稿体是 `{id: 'r-no-touch-<接管 id>', title, scope: 'project', when: {kind: 'event', events: ['gate.tool-call']}, filter: {writes: {paths}}, action: {kind: 'block'}, lifetime: {kind: 'until-lifted'}, source}`，外层 `reason`。对规则板 0.10 §2.2：`id` 以 `r-` 开头、至多 48 字符（`r-no-touch-tk-3k9x0a1b` 是 22 个），`scope`、`when`、`filter.writes: {paths}`、`action.kind`、`lifetime`、`source`（只校验节点 id 格式）都在字段表里，`reason` 是 `rules_propose` 的外层参数（§9.3 工具表），「筛选里有 `writes` 的规则不配 `queue`」也照做了。
- F33（M7 行号越界）：关闭。非历史章节里没有 M7 的行号（剩下的 `:1051`、`:1820` 是 rc.3 会话的行）。`GATE_LINE_FORMS`、`only`、`no_gate_norm`、§12.1 都在 M7 0.6 里，按节号引用；M7 §3.8.1 自己写了「接管设计 §5.6 的 `changed` 写法由接管的 `bootstrap-ratchet` 加进这里」。
- F34（记图草稿里 D1、D2 仍带选项式字段）：未变，NIT。`graph-ops.json` 还是 0.3 的 21 条，两张待决仍带 `options`、`recommend` 等引擎今天要求的格式；§19 第 1 条写明等 M3 第 6 步合入后改成无选项的提议式，并要求编排者补 D3。这是迁就引擎今天的格式，不挡路。

## 本轮的发现

| # | 严重度 | 问题与位置 | 改法 |
| --- | --- | --- | --- |
| F35 | MEDIUM | 对 M3 的两处改动没有记成请求，§23.4 还说它们「都在 M3 已写明的扩展点之内」。设计仍然要 M3 做两件事：（1）`/wish` 在「图行服务不在」与「图目录不存在」两行之间读 `glmHournessBootstrap`，`wants(cwd)` 为真时先按持有者记录判、再 `prepare`，`holdWish` 时不发许愿 notice、改发接管开始的 notice（§3.1，§1.4 bootstrap-row 第 2 条，§16 B3）；（2）阶段提醒问 `holds(cwd, goalId)`（§3.1，bootstrap-row 第 7 条）。读 M3 附录 0.5 与 `m3/design.md`：没有 `glmHournessBootstrap`、`wants`、`prepare`、`holdWish`、`holds`，只有 `design.md` 一句「建空图属于 bootstrap」；`src/design/mode.ts`:291 今天对没有图目录的工作区返回「这个工作区还没有项目图：先建空目录」，没有调用接管的地方；`src/design/attach.ts` 也还不在 main。0.3 的 `graph-ops.json` 第 12 条的第 1、2 点正是这两处请求；§19 第 4 条说「下面几条取代第 12、13、14、17 条」，新的 `m3` 批注只写了 `bootstrap:` 分派行、撤回 `lines` 与 `releaseNote`、持有者搬家、D3，这两点在换稿时丢了。§2.4 的 M3 行又说它们记在 `graph-ops-align.json` 给 `m3` 的批注里，和 §19、§23.4 互相矛盾。brief 规则 2 与 `d-freeze-until-dogfood`：要已放行的 M3 改的地方必须写成挂在 `m3` 节点上、自举之后再办的批注；§16 B3 的开工条件也没有「M3 接受这两处」。后果：编排者按 §19 合成批注时这两处不会出现，B3 开工时才发现 M3 没有留位置；而 B3 之前接管根本进不去（`/wish` 在没有图的工作区直接报错）。`bootstrap:` 分派行不在此列：附录 §3.13 的表由各提议方自己加行，M3 第 6 步的测试往表里放假的提议方，表是开放的 | （1）§19 第 4 条的 `m3` 批注补回第 12 条的第 1、2 点，大意：「要 M3 在自举之后留两处接缝，由接管的 B3 改：一、`src/design/mode.ts` 的 `/wish` 在『图行服务不在』之后、『图目录不存在』之前，按 M3 的规则拒绝过长的话；服务 `glmHournessBootstrap` 在且 `wants(cwd)` 为真时，先按持有者记录判这个会话会不会成为主 Agent（图目录还不在时按 none），会才 `await prepare`；`holdWish` 为真时不发许愿 notice，改发 `prepare` 交回的 notice，运行中 `steer`、空闲 `followup`；服务不在时行为不变。二、阶段提醒在焦点目标 `holds(cwd, goalId)` 为真时不注入访谈提醒」。（2）§23.4 第一条改为「M3：接管要两处接缝（`/wish` 调接管服务、阶段提醒问 `holds`），记在 `m3` 的批注里，自举之后再办；D3 答『要』时另有……」，删去「都在已写明的扩展点之内」。（3）§16 B3 的开工条件加「M3 已接受这两处接缝」。（4）§13 或 §3.1 写 M3 还没接受时的路：`/wish` 在没有图目录的工作区仍报 M3 的「先建空目录」，人建好空的图目录后发 `/wish`（M3 照常，主 Agent 起来），再发 `/hourness-init`（§3.2 第三行，空的 `nodes/` 算没有图），接管照开；阶段提醒不问 `holds` 时走 §13 已有的那一行。（5）§2.4 的 M3 行与 §19 对齐，不再互相矛盾 |
| F36 | NIT | `acceptProposal` 里「`human` 身份拍板」一支已经没有调用方：§7.4 表第 2 行、写入第 1 步（「人在面板上拍的板，面板改成只看之前还有这条路」）、第 4 步（「面板拍板时写……」）、§15.1 的用例「人在面板上拍的板以 `human` 写入」。M3 附录 0.5 §3.8 末段与 §3.13 末条、面板 0.7 §11 第 6a 条：面板不再有拍板或批准的写入，`/graph-apply` 已删，今天以 `human` 写图的只有 `/graph-run`，只碰任务；M3 第 4 轮 N1 把同样的残留字样清掉了。规则板、循环板的 `acceptProposal` 也保留这一支，所以不是错，但违 `AGENTS.md`「不留死代码」 | 删去 `human` 一支与对应用例，`by.actor` 带 `relay` 的 `llm` 才放行，其余 `forbidden`；或保留并在表里写明「与规则板、循环板的同名函数同形，目前没有调用方」，去掉「面板」字样 |
| F37 | NIT | §7.4 写入第 1 步的 `reason` 写死「人在对话里同意」。M3 附录 0.5 §3.5 末段：这三种说法的字面只在 `src/shared/answer-marks.ts` 的 `ANSWER_MARKS`，`record.ts` 用常量拼、不另写字面。面板的 `answerKindOf` 认 `reason` 开头的这几个前缀；接管的 `reason` 以「接管清单第」开头，不会被误认，但字面有了第二处 | 用 `ANSWER_MARKS.agree` 拼，或在 §7.4 写明「字面取自 `ANSWER_MARKS`」，L2 钉住 |
| F38 | NIT | §7.3 给人看的「注意」固定几句没有超时：合入前的每条命令有 30 分钟上限，超时算没过、主干不前进（M7 §3.8.1、§3.8.3）；改完文件就跑的检查一步至多等 20 秒、每项有超时（M4 §6.1、§6.3）。循环板的检查条目要给人看「超过 N 秒算没跑完」（循环板 §7.1 的 `cautions`）。宪章 0.7 §3.2 第 3 条的四样保障管的是板上的条目，节点上的命令不在其内，所以不挡路；人同意的是同样会在他电脑上跑的命令，少这一句 | 注意事项加一句「每条合入前的检查最多跑 30 分钟，超时算没过」（数取 M7 的常量），改完文件就跑的检查加其超时；L2 的「注意事项至多 6 句」随之核对 |
| F39 | NIT | 读项目门禁（D2 定为暂停时）首日直接拦截是对宪章 0.7「写在代码里的新门禁先影子」的例外，§8.2、§17 写明了理由与出路，写法照 M7 §12.1；但 M7 还把同一件事放进给人看的放行稿的「替你定了的方向」一栏，让人在放行时看得到。接管的 §0.1「替你定了的方向」没有这一行，D2 只问「停不停」，不提「停下就立即生效、没有试用期」 | §0.1 的方向清单加一行：「读项目时停命令行的规矩，你答『停』之后马上生效，不先试运行；觉得误伤多，说一声改成先试运行」，后面的一页人话稿照写 |
| F40 | NIT | `mockup-takeover.svg` 清单气泡的「注意」只有三句，漏了「改完文件就跑的检查在改了文件的那个 agent 的下一步之前跑」。§7.3 写明固定四句（有 `changed` 行或没跑通的命令时再加），草图里的命令列表又恰有一行「改完文件就跑」；§15.3 把草图当 L4 的对照 | 草图补上这一句，与 §7.3 的四句一致 |
| F41 | NIT | §2.5 只写了接管来的特性「批准之后不是模块」。按 M3 附录 0.5 §3.14.1，目标的直接子节点、类型 `feature`、状态 `proposed` 的都是模块候选，所以接管提议里到批准之前，目标对 M3 和 M7 是「分了模块」的（`isSplit` 为真）；批准时被跳过的特性（修订号变了）仍是提议，留在候选里，M7 不会派它下面的活（`not_released`）。设计没写这段过渡期会看到什么 | §2.5 已有项目一条加两句：提议期间 M3 把这些特性当模块候选，不影响接管（`holds` 管着提醒，读项目只读）；被跳过的下一版清单重新列出，批准之前它们下面的活不会被派发 |
| F42 | NIT | §5.9 表第 4 行说节点由「M3 的图工具说明与随阶段提醒下发的写图格式」覆盖、接管不另给示范。M3 的工具说明里没有接管特有的写法：`完成证据：`、`出处：`、`norm-merge-gate` 的 `$`、`setup $`、`when`、`only` 行、工具节点的检查行与 `config` 行、底线清单的判定写法。这些靠提醒、`defaults.md`、`floor.md` 教，`defaults.md` 在 §1.4 bootstrap-paths 第 3 条交给 `envBranch` 验过，`floor.md` 与 `norm-merge-gate` 草稿没有对应的 L2（设计里没有 `parseFloor`、`parseGateNorm` 的字样）。`d-agent-examples` 的做法是「示范交给真实检查，规则一改示范就挂」 | §5.9 第 4 行改成「由提醒与 `defaults.md`、`floor.md` 教」；§15.1 加两例：`floor.md` 每行交给 M7 的 `parseFloor`、门禁草稿交给 `parseGateNorm`，读出的条数等于写入的条数 |
| F43 | NIT | §18 D2 的疑问一行「接管的若都是你自己写的项目，停掉只是多道麻烦」读不顺，这是要原样问给人的话 | 改成「若接管的都是你自己写的项目，停掉只是多道麻烦」 |

没有 HIGH。F35 是 MEDIUM 而不是 HIGH：它不让任何东西静默失效，接管在 M3 没留位置之前根本进不去（`/wish` 报错），失败看得见；改法是文字和一条批注，不改设计。

## 对本步要点的结论

- `d-boards-as-hooks`、`d-script-timeout`：通过。接管不提脚本，不写两块板的条目文件；唯一碰规则板的是「不许碰」的 `block` 规则，走 `rules_propose`、`propose_to_human`、`record_human_answer`、`acceptProposal`，这条规则没有脚本，所以没有 `detail` 与「已给人看原文」那一步，和规则板 §9.3 第 4 条「提议带 `detail` 时才要记号」一致。会跑东西的是清单里的合入前命令和工具节点上的检查行，两者是节点不是板上的条目；设计仍把命令原文放进 `detail`、由 M3 的 5a 核对，比 Check entries seam 要求的多一道，方向是严的。读项目门禁的首日直接拦截按 M7 §12.1 的写法列了例外、理由与出路（F39 只要求让人看到）。
- `d-rules-in-repo`：通过。运行时文件在项目的 `.llm/bootstrap/`，用 `projectOf` 和 `ensureIgnored`（与 `src/data/project-root.ts` 的行为一致），规则文件由规则板写进 `docs/rules/rules.json`、由主 Agent 提交，试跑副本在系统临时目录用完即删，不写任何用户级目录。持有者记录今天在用户级目录，M3 附录 0.5 的版本说明与 §10 明说搬进 `.llm/` 留给 M3 的对齐轮，接管只经 `mainAgentOf` 用，写法对。
- `d-main-agent-peak-exempt`：通过。接管开始的 notice、新项目与补缺的提醒、改判与续做完成的 notice 里没有让主 Agent 等高峰或停下的话，L2 断言文字里没有 `peak`、`pause`、`hold`；子 agent 受管的说法（少做至多 1 个 GLM 子 agent，不做排队）和规则板 0.10 §3.6、`PEAK_REDUCE_GLM_WORKERS = 1`（`src/shared/peak-mode.ts`）一致；试跑是本机进程，不自报 `glmSpend`，不被高峰条目管到。D2 的暂停是命令行的收窄，与高峰无关，交给人定，对。
- `d-memory-scope`：通过。接管不读不写关于人的记忆，不导入别的项目的经验，试跑失败与平台坑只在清单、试跑日志、节点批注里。
- `d-agent-examples`：通过，另有 F42。`bootstrap_review` 说明里有一道示范，领域是气象站数据工具；`design.md`、`mockup-takeover.svg`、`graph-ops.json`、两份评审文件里「记账」「账本」「ledger」「bookkeep」零命中（`design-0.3.md` 与 `mockup-takeover-0.3.svg` 是保留的旧稿，里面仍有，属历史原文）；气象站领域在别的设计里零命中（规则板用小网站、M7 用静态博客），与「不同于别的工具说明里的示范领域」相符。示范的四行逐字等于 §7.3 的模板在同一份 `view`（2 个目标、14 件活、9 件做完、一条门禁命令没跑通、86 条旧告警）下算出的，加粗各一处且在 2 至 12 个码点内，`attach` 合 `ATTACH_PATTERN`。D1 至 D3 三件按 brief 规则 6 的格式写：标题、四行各成段、标签不加粗、每行一处加粗、各行一句短话、问话在最后、没有选项，没有「验收」「门禁」「标定」「影子」。
- M3 0.5：通过，除 F35。`propose_to_human` 的参数（`kind`、四行、`parent`、`question`、`attach`）、一条回复至多三件、`record_human_answer` 的参数与第 5a 步（`detail.mustShow` 每片在给人看的话里才拍板，`reason` 末尾带「 · 已给人看原文 <摘要>」）、`detail` 上限（`markdown` 1 至 6000，`mustShow` 1 至 8 片每片至多 4000）、`attach` 表的开放性都对得上。两件事一条回复，规则与清单一条回复，各两件，不超限。新项目的两次放行对 §3.14.2、§3.14.3：`cost`、`touch`、规则待决挂在锚点下，必须在大循环放行前拍板（门禁第 5 条），`env` 当模块、下面有一个决策（§3.14.3 第 4 条），工具节点、决策、任务随模块放行批准，对得上。已有项目的特性不带阶段、批准后不是模块，M7 派发门对「已批准、没有阶段」的目标放行（M7 0.6 §3.5.1 简报门禁一行），也对得上；开工靠人说一声而不是放行事件，由 D3 问人。
- 规则板 0.10：通过。`rules_propose` 的输入、`propose_to_human(attach: rules:<id>)`、`record_human_answer`、`acceptProposal` 的流程，`attachable` 的含义（`open` 且 `via: 'graph'`），60 秒补写，24 小时行健康，整块没装时的降级（最小一片在 main，`src/rules/` 里没有 `service.ts`）都与 §9.3 一致。§7.7 靠「`accepted` 之后 `attachable` 不 ok」读「已生效」，设计自己列为 U11 并给了退路；`attachable` 对 `rejected`、`superseded`、`expired` 也答不 ok，所以这一读法在极少数情形会把没写上的说成已生效，规则板自己的恢复一节与 24 小时行健康会报出，不挡路，U11 的退路（请规则板加只读成员）到时一并办。

## 核实过的假设

- `design-0.3.md` 的版本行、大小与写入时刻；截断稿的标题表、§3 与 0.3 的 §3 逐行相同、D3 与 `规则板 0.8` 等计数；`design.md` 的围栏数（20，成对）、标题数（84）、末节完整（读了 `design.md` 的 §0 至 §23.5 全文）。
- `src/data/project-root.ts`：`projectOf(cwd, home)` 对主目录、磁盘根、没有 `.git` 也没有 `.llm/` 的目录返回 `undefined`，只缓存 git 里的结果；`ensureIgnored(root, directory)` 追加 `<directory>/`，已有四种等价写法之一时不重复，写不进会抛错。
- `src/design/mode.ts`：`holderFileOf(deps.userHome(), dir)`（:261）、`/wish` 在图目录不存在时的错误（:291）、`MAX_WISH_LENGTH = 2000`、空愿望时 `agent.inject`。`src/shared/step-notice.ts` 的 `installStepNotice(agent, what, eligible, build, row)`；`src/graph/service.ts` 的 `dirFor`；`src/graph/engine.ts` 的 `LLM_EDITABLE`（含 `body`）、`initialStatus`（:417）、`HUMAN_ONLY`；`schema.ts` 的 `COMMIT_PATTERN`；`stage.ts` 的 `labeledSections`、`effectiveStage`。
- 规则板 0.10 §2.2 字段表、§2.3 事件表与 `glmSpend`、§3.6、§9.3、§10.7（M7 第 5 条「由人在清单里定，规则板不请 M7 特殊对待它」）、`RulesService` 契约、`docs/rules/rules.json`。
- M3 附录 0.5 §3.4、§3.5（含 5a）、§3.8、§3.13、§3.14.1 至 §3.14.4。M7 0.6 §3.8.1（`GATE_LINE_FORMS`、`only`、`no_gate_norm`）、§3.8.4（主干上的 `commit` 只放行改动全在 `only` 路径里的）、§3.8.5、§12.1。循环板 0.6 的 `attachDigest`、`scriptDetail`、`commandDetail`。M4 `design.md` 0.5 §6.1.1 的 `check` 行与 `config` 行写法和 §5.5 默认表的 Node 行一致。`CHARTER` 0.7 §3.2 第 3 条、§6、§9。
- 当前 `git log 9c346fb..HEAD -- src` 为空。

## 没核实或不成立的假设

- 不成立（MEDIUM，F35）：§23.4 说其余的 M3 接缝都在 M3 已写明的扩展点之内；M3 附录 0.5 与 `m3/design.md` 里没有 `/wish` 调接管服务与阶段提醒问 `holds` 这两处。
- 未核实（设计已列依赖与退路）：M4 0.5 是对齐轮的稿，本步没有看它的评审结果，检查行与 `config` 行的写法可能再变，设计把变动收在 `defaults.ts` 的 `toolNodeDraft` 一处；M5 的 `journal.ts`、`secret-shape.ts` 与指标流水的 `emitMetric` 种类还没定稿，设计写了「先做的一方建」与「没定之前不调」；U1 至 U12 的试跑与沙盒假设、U11 都没有运行过。
- 一处读法，不算错：设计把 `bootstrap:` 当作往 M3 `attach` 表里加一行。附录 §3.13 写的是「表里的每一行由那块板合入时自己加」，接管不是板，但表的开放性（假的提议方、`invalid` 的处理）支持这样读；第 3 轮已接受，本轮不改判。

## 记图

brief 规定本步不写 `docs/graph/`，图由编排者记录。本轮结果在 `design-review.md`（本节）、`design-review.json`（顶层字段写第 4 轮，`rounds` 数组给出各轮趋势）与 `align-resume-gate.json`。`design-review-pass-3.json` 从来没有写出（第 3 轮的 JSON 缺失，`design-review.json` 停在第 2 轮的内容，与第 3 轮的 md 不一致），`rounds` 里第 3 轮一项由本文第 3 轮一节重建；`design-review-pass-1.json`、`design-review-pass-2.json` 不动。

本轮为 CHANGES_REQUESTED，挡路 1 条（MEDIUM F35）。改法只涉及文字与一条批注；改完之后再做一轮复核（只核 F35 与 NIT 的落实）即可。

---

# 接管项目设计（`bootstrap`）独立设计评审 第 5 轮（对齐轮复核，设计 0.5）

评审对象：`.agents/tasks/bootstrap/design.md` 0.5（2026-10-31 04:31 写入，1,579 行）、`mockup-takeover.svg`（0.5）。对照读了 `design-0.4.md`（第 4 轮审的 0.4，1,530 行）：差异为 88 行新增、39 行删除，都是第 4 轮 F35–F43 的落实、它们的连带更新（D1 的字数、依据段的重核）和新加的 §24；本轮按这份差异核对，另把 0.5 全文读了一遍。`graph-ops-align.json` 与 `onepage.md` 还没写，按 brief 由后面的步骤写，不在本轮范围。

评审依据：`.agents/tasks/align-rounds-2026-10-30/brief.md`（规则 1 至 8，本轮按规则 4、7、8）；`.agents/tasks/design-context.md`；M3 附录 0.5（`design-addendum.md`）与 `m3/design.md`；规则板 0.10；循环板 0.6；M7 0.6；M4 `design.md`（对齐轮的稿）；`docs/CHARTER.md` 0.7；图节点 `bootstrap`（最后一条批注是 2026-10-30T20:21Z 记的第 4 轮结果；`show-nodes.mjs` 只打印状态，批注读的是 `docs/graph/nodes/bootstrap.json`）、`d-boards-as-hooks`、`d-rules-in-repo`、`d-main-agent-peak-exempt`、`d-memory-scope`、`d-agent-examples`、`d-freeze-until-dogfood`；源码 `src/design/mode.ts`、`src/graph/cli.ts` 与 `git log 9c346fb..HEAD -- src`。本轮没有重新生成或改写任何文件；字数、句长、围栏与标题数是对盘上文件的只读统计。

轮次：第 5 轮。brief 规则 4：第 4 轮有阻断，作者改了一遍（0.5），本轮是改后的复核。判决规则：HIGH 与 MEDIUM 的条数大于 0 即 CHANGES_REQUESTED。

| 轮 | 设计版本 | 判决 | 挡路（当时口径） | 今天口径下的 HIGH + MEDIUM |
| --- | --- | --- | --- | --- |
| 1 | 0.1 | CHANGES_REQUESTED | 4（F1–F4），非阻断 18 | 4 + 其中标 MEDIUM 的非阻断（未逐条重算） |
| 2 | 0.2 | CHANGES_REQUESTED | 2（F23、F24），非阻断 6 | 2 + 其中标 MEDIUM 的非阻断（未逐条重算） |
| 3 | 0.3 | APPROVED | 0，非阻断 4 | 2（F31、F32，第 4 轮已关闭） |
| 4 | 0.4 | CHANGES_REQUESTED | HIGH 0 + MEDIUM 1 = 1 | 1（F35） |
| 5 | 0.5 | CHANGES_REQUESTED | HIGH 0 + MEDIUM 1 = 1 | 1（F44） |

结论：CHANGES_REQUESTED。HIGH 0，MEDIUM 1（F44），NIT 5（F45–F49）。第 4 轮的 F35–F43 全部关闭（F36 在 §12 与 §9.4 各留一句旧话，记为 F45）；F34 仍在（NIT，等 M3 第 6 步）。挡路条数 2（第 2 轮）→ 0（第 3 轮）→ 1（第 4 轮）→ 1（本轮）。本轮这一条 MEDIUM 不是 F35 没改好：F35 要求写出 M3 接受接缝之前的路，作者照写了；问题出在这条路依赖的一句提醒，在提醒模板里不存在（F44）。改法是模板里加一句话、验收里加两条断言，不动设计方向。

## 接手的核对：截断后的处理

brief 要求的三件：0.3 原文保留、没有写了一半的节留在稿里、变更记录写明作者在截断稿里找到了什么、怎样处理。本轮重新核对：

- 0.3 原文保留：`design-0.3.md` 233,435 字节，写入 2026-10-30 13:42:46，第 3 行是「版本：0.3（2026-10-30），第三稿」。截断稿 `design-0.4-cutoff-draft.md`（242,000 字节，2026-10-31 02:09:25）原样另存，与 0.3 逐行比，0.3 的 1,344 行里只有 18 行不在截断稿里（头与摘要被改的那几处），这和 §23.1 说的「§1.2–§17 没有一处改动」相符。
- 0.4 原文保留：`design-0.4.md` 288,107 字节、1,530 行、写入 03:46:14，就是第 4 轮审的那一版；草图 `mockup-takeover-0.4.svg`、`mockup-takeover-0.3.svg` 都在，三份草图都能解析为合法 XML。
- 变更记录与截断稿的实际状态一致：§23.1 在 0.5 里一字未改。逐项对了截断稿：头里引的 §2.5、§5.9、§23 在截断稿里不存在（`### 2.5`、`### 5.9`、`## 23.` 均无）；§18 没有 D3（`D3` 在整稿只出现 3 次，都在头、§0 与 §0.1 里）；`规则板 0.8` 仍在；最后一个标题之后的内容是 §22 的对照表，没有 §23。
- 0.5 里没有写了一半的节：88 个标题，围栏 20 个且成对，没有占位字样（`TODO`、`TBD` 的两处命中是扫描要读的文件名和文档里的「待定」说明，不是占位）；最后一节 §24.3 两条都写完；§1.4 的 41 条没有变动。
- 本轮新增的部分（§24 的逐条答复、§23.4 与 §23.5 的改写、§20 的 0.5 一行）都写完了；§24.1 对 F36 说的「§14 的不变量与 §15.1 的用例随之改」属实，但漏改了 §12 与 §9.4（见 F45）。

## 上一轮发现的复核

| # | 严重度 | 状态 | 依据 |
| --- | --- | --- | --- |
| F35 | MEDIUM | 关闭 | 五处都改了。§19 第 4 条的 `m3` 批注补回两处接缝，文字与 0.3 `graph-ops.json` 第 12 条的第 1、2 点逐处对过，是同一回事（`/wish` 在「图行服务不在」与「图目录不存在」之间读 `glmHournessBootstrap`、先按持有者判再 `prepare`、`holdWish` 时改发接管的 notice；阶段提醒问 `holds`）；§23.4 第一条改成「两处接缝，必须办」，删掉了「都在已写明的扩展点之内」；§16 B3 开工条件加了「M3 已接受」；§2.4 的 M3 行、§0、§0.1、§13、§15.1 与 §1.4 bootstrap-row 第 7 条都对齐。M3 附录 0.5 与 `m3/design.md` 里确实没有这两处（`wants`、`prepare`、`holdWish`、`holds`、`glmHournessBootstrap` 零命中），`src/design/mode.ts`:291 在图目录不存在时仍返回「先建空目录」，`/wish` 只查 `deps.dirExists(dir)`，所以过渡路第 1、2 步在今天的代码上走得通。过渡路自己的毛病另记 F44、F46、F47 |
| F36 | NIT | 关闭 | `AcceptRequest.by` 是 `{actor: 'llm', relay: string}`；§7.4 核对表第 2 条只认带 `relay` 的 `llm`，`human` 得 `forbidden`；5a 不再分身份；写入第 1、4 步去掉「面板」；§9.1 `apply-start` 去掉 `actor`；§14 与 §15.1 同改。依据属实：M3 附录 §3.13 的表只以 `by: {actor: 'llm', relay}` 调 `acceptProposal`，`src/graph/cli.ts` 头注释写明身份恒为 `llm`。残留两句旧话记为 F45 |
| F37 | NIT | 关闭 | 批准的 `reason` 用「接管清单第 <n> 版：」接 `ANSWER_MARKS.agree` 接「（待决 <questionId>）」，L2 钉住含 `ANSWER_MARKS.agree` 而不写字面。M3 附录 §3.5 末段确实规定三种说法的字面只在 `src/shared/answer-marks.ts`；`answerKindOf` 认 `reason` 开头、`answerCallOf` 认「（record_human_answer <callId>）」，接管的 `reason` 两者都不碰 |
| F38 | NIT | 关闭 | 注意事项成为八句（六句固定，两句有条件）。逐句数了码点：22、8、23、31、26、21 加有条件的 13、20，都不超过 40；八句用「；」连起来共 171 个码点，在写明的 330 之内。M7 §3.8.1 写「每条上限 30 分钟，超时结束整棵进程树」，M4 §6.3 与常量段写 `CHECK_COMMAND_MS = 60_000`，数字属实。`mustShow` 合成一片后共至多 3 片，不超过 M3 的 8 片；`markdown` 5,000 加围栏与注意行仍小于 6,000。新增 U13 如实标明两个常量今天都不在 main。`<g>` 的来源另记 F49 |
| F39 | NIT | 关闭 | §0.1 方向清单加了一行：D2 答「停」之后马上生效、不先试运行，是对「新规矩先试运行」的例外，觉得误伤多可改回；与 §8.2、§17、§18 D2 推荐行（加了「马上生效」）一致；§23.5 要求一页稿带上这句。§0.1 全节没有「验收」「门禁」「标定」「影子」 |
| F40 | NIT | 关闭 | 草图清单气泡的「注意」现在是八句，逐字等于 §7.3 的八句（顺序也一致），命令列表有一行 `合入前` 的 eslint 命令对应 `changed` 行；画布加高到 1040，XML 合法 |
| F41 | NIT | 关闭 | §2.5 加了批准之前的情形：提议中的特性是模块候选、`isSplit` 为真，被跳过的特性留在候选里、M7 不派它下面的活（`not_released`）。对 M3 附录 §3.14.1（候选的定义、`isSplit` 含候选、已批准而无 `stage` 的直接特性子节点不是模块）和 M7 0.6「没有模块祖先时看目标」逐条核过，说法属实 |
| F42 | NIT | 关闭 | §5.9 第 4 行改成「由提醒与 `defaults.md`、`floor.md` 教」；§15.1 加两例交给 `parseFloor`（`{entries, unparsed}`）与 `parseGateNorm`，条数断言。这两个函数在 M7 0.6 §3.7.1 与 §3.8.1 里有名有形状，`GATE_LINE_FORMS` 同。说明了两个文件今天不在 main，M7 E1b 合入前对着写法表写 |
| F43 | NIT | 关闭 | §18 D2 疑问行是「若接管的都是**你自己写的**项目，停掉只是多道麻烦」 |
| F34 | NIT | 未变 | `graph-ops.json` 仍是 0.3 的 21 条，D1、D2 仍带引擎今天要求的选项式字段；§19 第 1 条写明等 M3 第 6 步合入后改成无选项的提议式，并要编排者补 D3 |

## 本轮的发现

| # | 严重度 | 问题与位置 | 改法 |
| --- | --- | --- | --- |
| F44 | MEDIUM | 过渡路靠一句提醒来化解访谈提醒与接管提醒的冲突，这句提醒在模板里不存在。§3.1 末尾过渡路第 4 条和 §13「M3 的阶段提醒」一行都写：M3 不问 `holds` 时，「接管的提醒在它之后注入，写明『这个项目在接管，目标不走访谈』」。§5.1 已有项目与补缺的提醒模板里没有这句，也没有别的话叫主 Agent 别访谈（全文 `interview` 只出现在 §5.2 表、§7.4 `applied` 的结果和 §17）；最接近的是「Goals carry no stage.」。§1.4 的验收也没有断言它：bootstrap-paths 第 1 条只查提醒列出扫描文件、几类节点和 `questions.md`，bootstrap-row 第 7 条的过渡路一例只查接管照开、notice 由 `/hourness-init` 发、`takeover-open` 不带愿望。0.4 里这一行只描述 M3 没留接缝的偶发情形；0.5 的过渡路让它成为接缝办完之前每次接管的常态：接管提的目标是提议，`effectiveStage` 给 `wish`，M3 附录 0.5 §2.3 对 `wish` 阶段的提醒是「Interview the human in plain chat, one or two questions at a time…」，与接管的「Propose, in this order」落在同一步里；过渡路第 2 步里 M3 发给主 Agent 的 `ENTER_NOTICE` 还明说「follow the stage reminders」（`src/design/mode.ts`:188）。M3 的阶段提醒在 `src/design/stage-notice.ts`，今天还不在 main，M3 第 5 步做。§17 把「让两段提醒都出：主 Agent 同时被要求访谈与读项目」列为没选的做法，过渡路等于临时选了它，却没有写出让主 Agent 选对的那句话。同一行的另外两处也没有落实：「行健康记一次『阶段提醒没让给接管』」没说接管行怎样发现 M3 的提醒出了没有（它看不到别的行注入了什么；在过渡路里这条每次都成立，记成 degraded 会让行健康长期是黄的）；「在它之后注入」取决于两个监听器的安装先后（M3 在 `/wish` 时装，接管在 `prepare` 时装），验收里没有钉 | 一、§5.1 已有项目与补缺的提醒模板在「Propose, in this order」之前加一句，例如：`Another reminder may tell you to interview the human about a goal you propose. Not here: the human started a takeover of an existing project, so the goals you propose are agreed through the list round, not through the interview.`（避开 `peak`、`pause`、`hold`，保持 L2 的断言成立）。二、§13 该行改成「提醒模板里有上面那句」，删掉写不出检测办法的「行健康记一次……」，或改成定义得出的检测：服务成员 `holds` 在接管开着、第一个目标出现后的 3 步内一次都没被问到，记 info（不是 degraded），文字写明「M3 还没让阶段提醒让给接管，过渡路里是正常的」。三、§1.4 bootstrap-paths 第 1 条加断言：已有项目与补缺的提醒含这一句；bootstrap-row 第 7 条的过渡路一例加断言：假宿主不问 `holds` 时，同一步的注入里 M3 的阶段提醒在前、接管的在后。四、§17「阶段提醒与接管」一行的没选项后加半句：过渡路临时接受两段提醒并存，靠模板里那一句消解，M3 办完接缝后这一句仍留着无害 |
| F45 | NIT | F36 的两处残句。一、§12 外部输入的校验表 `acceptProposal` 的请求一行仍写「`by.actor` 为 `human` 或 `llm`」，与 §7.4 的类型 `{actor: 'llm', relay: string}` 和核对表第 2 条（`human` 得 `forbidden`）矛盾；两种读法的结果都是什么都不写，所以不挡路，但校验表是实现者先读的地方。二、§9.4 第三条仍写「人在面板上与主 Agent 同时写图」，面板 0.7 §11 第 6a 条与 M3 附录 §3.8 末段已让面板不再写图，能改节点的是主 Agent 带人的原话 | §12 该行改成：`by.actor` 必须是 `llm`、`relay` 非空且至多 2,000 字符（`RELAY_LIMIT`），其余得 `forbidden`；§9.4 第三条改成「人对主 Agent 说要改的节点与主 Agent 同时写图：……」，后半句不变 |
| F46 | NIT | 过渡路里 `/hourness-init` 的回话只指向 `/wish`。§3.2 表第四行（没有图、不是主 Agent）和 §13 新加的一行都让人「发 /wish」。过渡期里人照做会先撞上 M3 的「先建空目录」，建了再发 `/wish`，得到一个主 Agent 会话：M3 对不带话的 `/wish` 只让会话当主 Agent、给 agent 一条 `ENTER_NOTICE`，命令结果是「已让这个会话的 agent 当主 Agent……它按项目图推进」（`src/design/mode.ts`:336、340），接管没有开，也没有哪句话告诉他再发一次 `/hourness-init`；这三步只写在 §0.1 与将来的一页稿里。作者写了「面板今天写的也是 `/hourness-init`，与过渡路一致」，但面板的话到了这一步仍缺后半步 | 第四行的回话改成：「发 /wish 开始接管；如果它只让这个会话当了主 Agent、没有开始读项目，再发一次 /hourness-init」。这句在两个阶段都成立，M3 办完接缝后可以不改。bootstrap-row 第 7 条加一例钉住这句话 |
| F47 | NIT | §3.4 第 2 条的「可以忽略」清单与过渡路第 1 步对不上。过渡路让人在空文件夹里先建 `docs/graph/`，再发 `/wish`、`/hourness-init`。判路第 2 条（空目录，当新项目并 `git init`）的忽略清单是 `.llm/`、`.vscode/`、`.idea/`、`.DS_Store`、`README*`、`LICENSE*`、`.gitignore`、`.gitattributes`「以及只含空 `nodes/` 的图目录」。顶层多出来的 `docs/` 算不算，字面上没有说；算不上时落到第 3 条「有文件但不是 git 仓库：先 git init 并提交一次」，而只有空目录可提交，人会卡住（`git init` 本身就能让判路落到第 4 条，那句「并提交一次」对这一路是多余的）。§1.4 bootstrap-scan 第 1 条的夹具里也没有这一种 | 第 2 条写明：图目录本身，以及只为放它而存在的上级目录（里面除它没有别的），在没有 `.json` 文件时不算「别的文件」。bootstrap-scan 第 1 条的夹具加「非 git 目录，只有空的 `docs/graph/`」，预期判为新项目 |
| F48 | NIT | §16 B3 开工条件里的「M3 已接受这两处接缝」没有证据规则。作者按 F35 的改法字面照加，但谁来记「已接受」、记在哪里没写：M3 的设计文件、`m3` 节点上的批注、还是人的一句话。开工条件是实施顺序里唯一判断 B3 能不能动手的东西 | 写明证据：M3 设计的某个后续版本在 `/wish` 表和阶段提醒里写了 `glmHournessBootstrap` 的 `wants`、`prepare`、`holdWish`、`holds`；或编排者在 `m3` 节点上记一条批注，写明人同意在自举之后办这两处。二者取其一，B3 开工前读它 |
| F49 | NIT | 注意事项里「每条合入前的检查最多跑 `<g>` 分钟」的数取自 M7，但 M7 没给常量起名（作者 §24.2 已说明），而且 M7 把「每条命令 30 分钟」列在可改的默认配置里（`m7/design.md` 默认配置一条，「改它们不改设计」）。§7.3 写「对方还没导出常量时先带一个注明出处的同值常量」：配置改过之后，人在清单里读到的是写死的 30，而门禁按配置的值超时，这句话就说错了。人同意的恰是他看到的这句 | `<g>` 读执行行的有效配置值（服务不在时用 M7 写明的默认值 30，并在清单里标「默认」），而不是写死的同值常量；U13 与 §15.1 的 `commandsDetail` 一例改成「配置改成 10 分钟时清单写 10」 |

没有 HIGH。F44 是 MEDIUM 而不是 NIT：它让 0.5 新加的唯一入口（接缝办完之前）依赖一句不存在的话，实现者照 §5.1 的模板做出来的提醒不满足 §13 与 §3.1 写下的行为；后果是主 Agent 可能开始访谈人而不是读项目，人说一句「先读项目」即可纠正，看得见、可恢复，所以不是 HIGH。

## 对本步要点的结论

- `d-boards-as-hooks`、`d-script-timeout`：通过。接管不提脚本，不向循环板或规则板的条目文件写东西；唯一碰规则板的是「不许碰」的 `block` 规则，走 `rules_propose`、`propose_to_human`（`attach: rules:<id>`）、`record_human_answer`、`acceptProposal`；会跑的命令（合入前检查、工具节点上 M4 自带检查器的命令）原样放进清单的 `detail`，M3 第 5a 步核对看过才拍板，同意即生效。设计上下文「Check entries seam」说人加的检查是循环板的普通条目、M4 只执行自带的默认检查器，§2.5、§5.2、§17 都按这个读，没有沿用截断稿读到的 M4 0.4 的写法。读项目门禁的首日直接拦截是对宪章 0.7「新门禁先影子」的例外，§8.2 按 M7 §12.1 写了满足哪一半、理由、误伤后的出路，F39 又让它进了给人看的那一页。
- `d-rules-in-repo`：通过。运行时文件在项目的 `.llm/bootstrap/`，用 `projectOf` 与 `ensureIgnored`，规则文件在 `docs/rules/` 由规则板写、主 Agent 提交，试跑副本在系统临时目录；接管不写任何用户级目录。持有者记录今天在用户级目录（`holderFileOf(userHome, dir)`），搬进 `.llm/` 归 M3 的对齐轮，接管只经 `/wish` 处理函数和 `mainAgentOf` 用它。
- `d-main-agent-peak-exempt`：通过。接管开始的 notice、提醒与续做完成的 notice 里没有让主 Agent 等或停的话，L2 断言文字里没有 `peak`、`pause`、`hold`；只有读项目时派出的只读子 agent 受高峰模式管，接管不等它们；试跑是本机进程，不调模型。D2 的暂停是命令行的收窄，与高峰无关。F44 建议加的那句提醒同样避开这三个词。
- `d-memory-scope`：通过。接管不读不写关于人的记忆，不导入别的项目的经验；试跑失败与平台坑只出现在清单、试跑日志与节点批注里。
- `d-agent-examples`：通过。`bootstrap_review` 的示范领域是读气象站传感器 CSV、画每日图表的 Python 小工具，其他设计里「气象」「weather」零命中；`design.md`、`mockup-takeover.svg`、`graph-ops.json`、`design-0.4.md`、两份评审文件里记账、账本、ledger、bookkeep 一类题材的词零命中（保留的旧稿 `design-0.3.md` 里有 2 处，属历史原文）；L2 有 `CALIBRATION_DOMAIN_WORDS` 词表检查。D1–D3 按 brief 规则 6 的格式写：标题、四行各成段、标签不加粗、每行一处加粗、一句话、问话在最后、没有选项；逐行数了码点，背景行最长 35（上限 60），其余三行最长 27（上限 40）；没有「验收」「门禁」「标定」「影子」。
- M3 0.5：通过。`propose_to_human` 的参数与一条回复至多三件、`record_human_answer` 与第 5a 步、`detail` 的上限（`markdown` 1–6000，`mustShow` 1–8 片每片至多 4000）、`attach` 分派表由各方自加一行、`ANSWER_MARKS`、新项目的大循环加 `env` 模块两次放行（`bigLoopSet`、`moduleSet`，模块下至少一个决策）、已有项目的特性不带阶段不是模块，都对得上。`/wish` 与阶段提醒这两处接缝确实不在 M3 里，已按规则 2 记成自举之后再办的请求（F35 关闭）。
- 规则板 0.10：通过。`rules_propose` 只记提议，`propose_to_human` 带 `attach`，`record_human_answer`，`acceptProposal`，`attachable` 的含义，60 秒补写，整块没装时降级，`docs/rules/` 不放进 `only`；`rule-draft.json` 的 `Rule` 输入形状第 4 轮已核过，本轮这部分没有改动。

## 核实过的假设

- `design-0.3.md`、`design-0.4.md`、截断稿的大小、写入时刻与行数；0.3 的 1,344 行中 18 行不在截断稿里；截断稿没有 `### 2.5`、`### 5.9`、`## 23.`，§18 没有 D3，`规则板 0.8` 仍在。
- `design.md` 的 88 个标题、20 个围栏、末节完整；三份草图的 XML 能解析；`docs/graph/`、`.worktrees/`、`.agents/tasks/m4/`、`.agents/tasks/m5/` 在 `git status` 里没有改动。
- `git log 9c346fb..HEAD -- src` 为空（HEAD 是 `b719074`）；`src/shared/answer-marks.ts`、`src/design/attach.ts`、`src/design/stage-notice.ts`、`src/execute/floor.ts`、`src/execute/gate-norm.ts` 今天都不在 main。
- `src/design/mode.ts`:291 的「先建空目录」与 `deps.dirExists(dir)`；`src/graph/cli.ts` 头注释「The actor is always llm」。
- M3 附录 0.5：§3.13 的 `acceptProposal({questionId, graphDir, cwd, by: {actor: 'llm', relay}})`、§3.5 末段 `ANSWER_MARKS` 只在 `src/shared/answer-marks.ts`、§3.14.1 的模块与候选与 `isSplit`、§2.3 `wish` 阶段的访谈提醒。M7 0.6：§3.8.1 每条 30 分钟与 `parseGateNorm`、`GATE_LINE_FORMS`，§3.7.1 的 `parseFloor` 返回 `{entries, unparsed}`，「没有模块祖先时看目标」。M4 `design.md`：`CHECK_COMMAND_MS = 60_000`、`CHECK_STEP_DEADLINE_MS = 20_000`。
- `graph-ops.json` 第 12 条的第 1、2 点与 §19 第 4 条的 `m3` 批注内容一致；§18 的「约 4,200 字」是 §1.4 七行验收列去掉反引号后的 4,196 个字符（0.4 是 3,898，对应「约 3,900」），41 条没变。
- 注意事项八句的码点数与 171 的合计；D1–D3 十二行的码点数。

## 没核实或不成立的假设

- 不成立（MEDIUM，F44）：§3.1 与 §13 说接管的提醒写明「目标不走访谈」，§5.1 的模板里没有这句话。
- 不成立（NIT）：§24.1 说 F36 的改动覆盖了所有写到 `human` 一支与面板拍板的地方，§12 与 §9.4 还有旧句（F45）；`<g>` 取常量的写法假设 M7 的 30 分钟不可配（F49）。
- 未核实（设计已列依赖与退路）：M4 0.5 是对齐轮的稿，本轮没有看它的评审结果，检查行与 `config` 行的写法可能再变，设计把变动收在 `defaults.ts` 的 `toolNodeDraft` 一处；M3 第 5 步的阶段提醒、第 6 步的 `propose_to_human`、`record_human_answer`、`attach` 分派、`ANSWER_MARKS`，M7 的 E1b，M5 的 `journal.ts`、`secret-shape.ts` 今天都不在 main，设计里相应处都写成「合入后核对」；U1 至 U13 的试跑、沙盒与常量假设都没有运行过。

## 记图

brief 规定本步不写 `docs/graph/`，图由编排者记录。本轮结果在 `design-review.md`（本节）、`design-review.json`（顶层字段写第 5 轮，`rounds` 数组带五轮趋势）与 `align-resume-gate.json`。

本轮为 CHANGES_REQUESTED，挡路 1 条（MEDIUM F44）。按 brief 规则 4，第 4 轮有阻断之后已经做过一遍修改与复核，本轮阻断仍在，这一支应停下并上报。F44 的改法只是提醒模板里加一句话、两处验收加断言和 §13 一行改写，F45–F49 都是文字改动，是否再做一轮由编排者决定。
