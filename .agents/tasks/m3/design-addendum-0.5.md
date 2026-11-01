# M3 设计附录：基础设计 0.4 之后的定案与实施步骤的调整

版本：0.5（2026-10-30；第 5 轮评审之后的修订已并入同一版，见下）。回应第 4 轮独立设计评审（`reviews/addendum-r4.json`、`reviews/addendum-r4.md`：HIGH 0、MEDIUM 2、NIT 2；第 3 轮的 M1–M8、N1–N12 全部关闭）。M3 在自举的关键路径上，照人「尽快自举吧」立刻改这一稿，不等对齐轮（图上 `m3` 2026-10-30T10:20Z、10:22Z 的批注）。附录 0.4 的原文另存为 `design-addendum-0.4.md`（`.agents/` 不进 git），0.3 在 `design-addendum-0.3.md`。

读法：正文里「0.4 §x」指基础设计 `.agents/tasks/m3/design.md` 0.4 的章节；本附录自己的版本写作「附录 0.x」。别的设计引用的「M3 附录 0.4 §x」按同样的节号读本稿（节号没有变，只在 §3.14 与 §16 之后加了新节）。

第 4 轮四条发现与本版的改动（逐条对照见 §16）：

- M1（MEDIUM，挡路）§2.8 的例题仍教主 Agent 在高峰里自己少做、不做，与 `d-main-agent-peak-exempt` 相反，而它进每个主 Agent 的系统提示词两次。改：例题换成「高峰时段派出去的活怎么排」，说的是主 Agent 派出去的活，不做一行写明主 Agent 照常回话；格式、长度上限与要过的检查不变；§2.8 写明这个题材为什么安全（不在记账小工具的领域、说的是已经定了的事、不描述主 Agent 自己的行为）。字数同步改在 §2.2，§0 第 4、17、21 条、§1 第 17、21 行与 §11 对应更新，§2.8 的单测与第 12 步（a）的计数各加一处。
- M2（MEDIUM，挡路）放行仍是「一个目标一次」。改：新 §3.14 设计两层循环里的放行：框架、模块清单与方向清单在大循环里一次放行；每个模块再放行一次（`propose_to_human` 与 `record_human_answer` 的 `release` 多可选参数 `module`，另有一页放行稿 `page`），批准模块子树里的提议，模块的 `stage` 由 `design` 改为 `release`；谁能改模块与目标的阶段、退回模块的设计循环（不要人的原话）与退回大循环（要人的原话）；子 agent 的设计期只读按模块判。契约按面板设计 0.7 §11「两层循环」，不同与补充写在 §3.14.9。落在 §0 第 20 条、§2.3、§3.2–§3.6、§3.8、§3.10、§3.12、第 5、6、8、9 步、§5–§12。
- N1（NIT）第 7 步与 `/graph-apply` 与面板设计 0.6 起的删除相反。改：第 7 步删去（编号保留，写明原因），§2.4「其他读法」第一条、§3.3 的 `panel-row.ts` 一项、§3.9「留下」、§9 第 1 条给 `m3-5` 第 2 条的字句同批改。
- N2（NIT）第 6 步缺面板设计 0.7 §11 第 6c 条要的契约测试。改：第 6 步 L2 加一例，`propose_to_human` 组出的提议式待决交给真实引擎，在第二阶段的常量下通过。

第 5 轮独立评审（`reviews/addendum-r5.json`、`reviews/addendum-r5.md`：HIGH 0、MEDIUM 2、NIT 4，CHANGES_REQUESTED；第 4 轮的 M1、M2、N1、N2 都已关闭或回应成立）之后，同一版 0.5 修了一次，版本号不变（按流程这是第二稿，不另建备份，0.4 备份仍是 `design-addendum-0.4.md`）。六条与本稿的改动（逐条对照见 §17）：

- R5-M1（MEDIUM，挡路）快照流水与临时暂存区仍放在 git 目录，与编排方对 M3 运行时文件路径的裁定相反（`design-context.md`「Dogfood implementation order and runtime paths」；图上 `m3` 2026-10-30T10:56Z 的批注要求并进 0.5）。改：流水放 `<项目根>/.llm/snapshots.jsonl`（项目根按 `projectOf`，主检出与各工作树共用一份，`.llm/` 自带 `.gitignore`），临时暂存区放系统临时目录、用完即删；落在 §2.5 的 `tempIndex()`、第 2 步（`W` 与存文件）、第 6 步，第 4 步 L2 与依赖，§0 末段，§9 第 19 条，§10、§11、§12。持有者记录搬进 `.llm/` 是另一件，仍留给对齐轮。
- R5-M2（MEDIUM，挡路）大循环放行先批准、后写模块的 `stage`，所有候选都批准而一个 `stage` 都没写时进程停下，`isSplit` 为假，重放会落进单层放行并一次批准所有模块子树。改：写入次序调成「先给候选写 `design`（候选仍是提议）、再批准、最后写目标的 `release`」，不再有「已批准而没有 `stage` 的模块」这一种中间状态；第 9 步 L2 加四个停下点的重放用例。落在 §3.14.1、§3.14.2、§3.14.7、§3.14.9、§3.5 表、§5 表、第 9 步。
- R5-N1（NIT）设计期只读在焦点是目标一级时仍放行，身份节只写「目标放行」。改：残余写进 §3.14.6 与 §10，身份节与 `design-before-release` 的正路一句改成「目标或它的模块」，两处阶段提醒加一句 `graph_focus`，§3.11 标题同改。
- R5-N2（NIT）三处仍列着已取消的第 7 步。改：§0 第 9 条、§1 第 9 行、§8 的一行。
- R5-N3（NIT）文件头写 M7 设计 0.4。改：读 M7 0.5；`isReleased` 注释写明完成也算、以本附录为准。
- R5-N4（NIT）每个模块的设计对照方向清单的独立评审没有任何设计接手。改：§10、§9 第 7 条、§12 写明 M7 设计 0.5 没有这一项，以及在它加上之前只有什么；图操作草稿的 `m7` 批注请编排方记成待办。

同批吸收的、不属于第 4 轮发现的请求（图上 `m3` 的批注，2026-10-30）：循环板设计 0.6 与规则板设计 0.10 对 `attach` 分派与同意路径的请求（§3.13、第 6 步）：`rules:` 与 `loops:` 一样可以交回原文段落 `detail`，上限放大到 `markdown` 1–6000、`mustShow` 1–8 片每片至多 4000 个码点，「给人看过原文」的核对对两块板的脚本提议与检查提议都做；另有不带题目与四行、只把已有待决再给人看的 `propose_to_human`（循环板 0.6 的第三条，M4 同样请过）。不在本版做的几条（持有者记录搬进项目的 `.llm/`、M4 的其余请求）记在 §10，由对齐轮做。

0.4 改了什么（本版照旧，除非上面或正文另说）。0.4 回应第 3 轮独立设计评审（`reviews/addendum-r3.json`、`reviews/addendum-r3.md`：HIGH 0、MEDIUM 8、NIT 12）。第 3 轮的挡路条数（8）比第 2 轮（3）多，按 `docs/DEVELOPMENT.md` §1.1 停下交人；人同意再改一轮（图上 `m3` 2026-10-29T23:20Z 的批注，原话「行，改吧」），本版就是这一轮。`.agents/` 不进 git：0.3 原文在 `design-addendum-0.3.md`，0.2 原文在 `design-addendum-0.2.md`，0.3 之前那次停在 §3 的草稿在 `design-addendum-0.3-draft.md`。对第 3 轮的逐条回应见 §15，对第 2 轮的见 §14，修订记录见 §13。0.4 改了什么：

- M3 的七条拦截登记进规则板的「写在代码里的规则」（M1，`d-rules-visible`、`d-defaults-readonly`）：§3.11，第 4、6、8 步。
- 第 3、10 步加独立评审（M2，`norm-review-floor`）：§0 末段、第 3 步、第 10 步。
- git 快照补漏（M3、M4、N8）：§2.5。挡在目标树路径上的未跟踪文件进快照；`clean` 要删的文件按 `git ls-files -z` 算，不读给人看的输出，`clean -n` 只在 C 语言环境下做核对；被忽略的文件不进快照（`clean -x`、`-X` 拒绝；`worktree remove` 只把被忽略文件的路径、个数与大小记进流水，例行清理不再被拒）；标签只打在只含旧引用值、且旧值会变得不可达的提交上；`push --mirror`、`push --tags` 与推送快照引用的 refspec 拒绝；什么都不用存时整件跳过。
- 阶段前进对所有会话只经确认与放行（M5）：§3.8。子 agent 的图工具调用不能带 `relay`；向前改阶段、批准访谈中的目标、批准或带原话新提放行集合里的节点，任何会话用图工具都被拒；被拒时设计行的行健康降级，并通知主 Agent 告诉人。
- 人设一节按 3.17.1 重核（M6，`d-zcode-3171`）：§2.7。3.17.1 没有 Output Style 一节，风格正文是主回合的一条上下文；本项目仍放在系统提示词（`m3-main-persona` 验收第 1 条），位置、标题后单换行与不加每回合提醒写进 `docs/reference/zcode-verbatim.md` 的不跟一节，请编排方同意。
- 例题换成已定的 `d-peak-mode`（M7）：§2.8、§3.1。
- 背景上限只读 `PLAIN_LIMITS.background`，面板设计现行（0.6）为去掉 `**` 后 60 个码点（M8）：§2.9、§3.3、§6、§11。
- 接缝裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」）：`propose_to_human` 收可选的 `attach`，`record_human_answer` 拍板之后交回提议的一方；按规则板设计 0.8 §10.7 与循环板设计 0.3 §17 的请求落地：§3.13，第 6 步。
- NIT：人的消息与交给人的提议改从会话投影 `hournessTalk` 读，不再调 rc.3 已弃用的 `snapshotEvents()`（N1，§3.2、§3.6）；每段原话的起止落在边界上（N2）；依据改为开工时的 main（N3）；面板设计给 M3 的落点（N4）；DSH 委派可以按调用选模型（N5）；交给指标流水的事件（N6，§3.12）；对齐排到 agent 空闲之后、`undefined` 当失败（N7）；`/wish here` 后面可以跟一句话（N9）；`TALK_GUIDE` 一句（N10）；`ask_user_question` 按原生名去掉（N11）；`/goal` 附件的固定文字不算人的话（N12）。

0.3 定下、本版照旧的几件（正文各节已是合并后的样子）：一个项目一个主 Agent（§2.4）；git 交给主 Agent、会丢工作的命令先存快照（§2.5）；问人改成聊天，`propose_to_human` 与 `record_human_answer`、提议式待决、原话核对（§3）；`d-main-agent-models`、`d-auto-drive` 的衔接（§2.6、§9 第 7 条）；按 `d-design-onepage` 的方向清单自查（§12）。本附录过审之后写一页人话放行稿 `.agents/tasks/m3/onepage.md`，人放行之后才进实现。

依据：写本版时 main 在 `fe0bace`；实施开工时以当时的 main 为准，文中的行号随之核对（N3）。第 3 轮评审依据的 `1e9ba84` 到 `fe0bace` 之间碰代码的只有 `zcode-3171-follow`（`11b1282..46e1884`，2026-10-29T21:51Z 合入）：GLM 通道的身份节、开头句常量、Harness 节与各节换成 3.17.1 的文字，逐字门禁只读 `reference/zcode-3.17.1/zcode.cjs`（`ee172e3`）。prompt-fixes（`823795a`）也已在 main：`src/guard/rules.ts` 的 `APPLICATION_PROTOCOL` 删去，例外段改用 `ASK_THE_HUMAN`（:56）；`installDialect` 按会话取环境（`src/glm-prompt/index.ts`:133、200–202）。所以 0.3 写的「3.17.1 的代码在另一个运行的分支上、同文件串行」已不成立：M3 各步直接建在带 3.17.1 的 main 上。`6134c83`（m8-row-titles）的行命名照 0.3 用（`dsh-hourness/<行>`、`packages/hourness/locale/<行>/`）。工作树 `.worktrees/m3`、`.worktrees/m3-flow` 仍在 `eb614ab`，两条分支没有自己的提交，`eb614ab` 是 main 的祖先，快进可行（§4 开头）。被修改的设计是 `.agents/tasks/m3/design.md` 0.4 及其 §15（D1–D6）；第 1、2 步在 main（`bf4d127`、`7aa8fe5`），推荐放最后的引擎核对在 main（`44e8601`），表格版卡片字段在 main（`e22282f`）。兄弟设计按现行版本读（0.5 更新）：面板设计 `.agents/tasks/plain-ui/design.md` 0.7（已批准；0.6 的节号不变，正文里写「面板设计 0.6 §x」的地方按 0.7 同一节读，新读的是 §4.11 与 §11「两层循环」）、规则板设计 `.agents/tasks/rules/design.md` 0.10（已放行）、循环板设计 `.agents/tasks/schedules/design.md` 0.6（已放行）、M7 设计 `.agents/tasks/m7/design.md` 0.5（三档与成批，按模块一级放行门禁派发；它引用本附录的 §3.14.1、§3.14.7、§3.14.8，并写明本附录定稿后两边逐条对一遍；已知的一处差别记在 §3.14.1 的 `isReleased` 注释；第 5 轮 R5-N3）；`mockup-wish.svg`（2026-10-29 22:24）没有改动。0.4 写成后到 0.5 之间的人定：`d-main-agent-peak-exempt`（2026-10-30T05:36Z）、`d-design-onepage` 扩到产品（05:19Z）、`d-agent-examples`（06:41Z）、`d-boards-as-hooks`、`d-rules-in-repo`（后两条涉及的持有者记录位置不在本版改，见 §10；快照流水的位置已按 `d-rules-in-repo` 改到项目的 `.llm/`，§2.5 第 6 步）。运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准，证据写法同 0.4（「包:行」，省略 `dsh-` 前缀）；〔实读〕读过源码，〔推断〕由源码推出、未运行，未运行的接缝都列进 L3 或 L4。ZCode 3.17.1 的事实写作 `zcode.cjs @<下标>`：`readFileSync(…, 'utf8')` 之后的 JavaScript 字符串下标，同规则板设计 0.8 §10.6 的写法。

本附录只写 0.4 之后变了的东西；没写到的按 0.4 做；与 0.4 冲突时以本附录为准。范围同 0.4：只有设计，不改产品代码、`docs/graph/`、`~/.dsh`。

## 0. 摘要

0.4 之后定下来、改 M3 实施的事（编号与 §1 的行对应）：

1. `question-26` C：主 Agent 的工具面去掉写文件的工具，编排层包在组装时按角色去掉；guard 照旧拦 shell 写入。第 3、4 步。
2. `m3-1` 验收第 4 条：`/wish` 入口醒目，按 plain-ui §7.5 与 `mockup-wish.svg`。第 11 步。
3. `question-31` C：身份节第一部分只留角色与边界（上限 1,500 字符）；访谈的问法与写图格式随阶段提醒与工具结果下发；harness 执行的规矩一句。第 3、5 步。
4. `d-plain-questions`：问人的话说人话。换词表与例题（格式是人给的那道四行题，内容取已定的高峰模式里「派出去的活怎么排」，`d-peak-mode`、`d-main-agent-peak-exempt`，第 4 轮 M1）只定义一次，进身份节与 `propose_to_human` 的说明。第 3、6 步。
5. `m3-main-persona`：人设设置位只进主 Agent 的系统提示词；GLM 路由上换 3.17.1 的风格开头句，人设一节放在 `glm:context-management` 之前（3.17.1 没有这一节，取舍写进逐字档案的不跟一节，§2.7）；汇报细度旋钮改名 `reportingDepth`。单独一步。
6. `d-option-card`、`d-recommend-last`：给人看的选项卡与「推荐放最后」随 `d-chat-not-cards` 不再出现在主 Agent 与人之间；引擎里已合入的表格字段照旧用于 agent 自己定的题（§3.3）。
7. 主 Agent 用强一档的模型，`/wish` 的回复、入口与流程条提醒人；子 agent 的模型由主 Agent 派活时选（`d-main-agent-models`，M7）。第 3、11 步。
8. `d-interview-cards`：访谈不经 DSH 的 `ask_user_question`，这一条留下；「harness 出卡」一半随 `d-chat-not-cards` 作废，访谈是对话。第 3、4 步。
9. `d-one-main-agent`：一个项目恰有一个主 Agent 会话（§2.4）。第 3、11 步（第 7 步取消：它原本只做面板拍板之后通知持有者会话，面板不再写图，这件事不再存在，第 4 轮 N1）。
10. `d-main-agent-shell`：git 与命令行交给主 Agent，只有写文件被拦；会丢工作的 git 命令先存快照，被忽略的文件不进快照，快照不出本机（§2.5）。第 4 步。
11. `d-main-agent-models`：见第 7 条。
12. `d-auto-drive`：M3 止于放行；M7 的驱动从放行那一次写入接手（§9 第 7 条）。
13. `d-chat-not-cards`：问人改成聊天（§3）。第 3、5、6、8、9、12 步。
14. `d-design-onepage`：对照方向清单自查（§12）；过审后写一页放行稿，人放行之后才实施。扩到产品之后，用户的项目也走两层循环，放行归 M3 的一支在第 20 条。
15. `d-rules-visible`、`d-defaults-readonly`：M3 在执行边界上的七条拦截是代码里的规则，导出成一张表，规则板按 `question-36` B 只读列出（§3.11）。第 4、6、8 步。
16. `norm-review-floor`：改主 Agent 工具面、写用户级数据目录、改决策流水的步骤都做独立评审（§0 末段）。第 3、10 步。
17. `d-peak-mode`、`d-main-agent-peak-exempt`：例题照已定的高峰模式写，不再写被否掉的「不再提醒模型」，也不教主 Agent 在高峰里自己少做或停下（高峰模式只管它派出去的活，主 Agent 任何一档都随时回话；第 4 轮 M1，§2.8）。第 3 步。
18. `d-zcode-3171`：人设一节的位置与写法按 3.17.1 重核（§2.7）。`m3-main-persona` 一步。
19. 接缝裁定：`propose_to_human` 的 `attach` 与 `record_human_answer` 的交回（§3.13）；背景上限归面板设计（§2.9）；`/wish` 归 M3（§2.6）。第 6 步。
20. `d-design-onepage` 扩到产品（2026-10-30T05:19Z，第 4 轮 M2）：两层循环里的放行。大循环一次放行框架、模块清单与方向清单，每个模块再放行一次；`propose_to_human` 与 `record_human_answer` 的 `release` 多可选参数 `module`；模块的阶段怎么动、谁能动；子 agent 的设计期只读按模块判；退回模块的设计循环与退回大循环（§3.14）。第 5、6、8、9 步。
21. `d-agent-examples`（2026-10-30T06:41Z）：问人的例题过与真实输入同样的检查（`proposalLineRefusal`、`plainWordsIn`、引擎在第二阶段常量下的写入），题材不在记账小工具的领域、只讲已经定了的事（§2.8）；确认需求与一页放行稿的示范归对齐轮（§10）。第 3、6 步。
22. 循环板设计 0.6、规则板设计 0.10 对 `attach` 分派与同意路径的请求：两块板的脚本提议与检查提议都可以交回原文段落，上限放大，「给人看过原文」的核对对两块板都做；另有只把已有待决再给人看的 `propose_to_human`（§3.13、§3.4）。第 6 步。
23. 面板设计 0.6 起面板不再写图，`/graph-apply` 删去（第 4 轮 N1）：第 7 步（面板拍板的回写）取消，§2.4、§3.3、§3.9、§9 第 1 条里建在它上面的字句同批改。第 7 步。
24. `d-rules-in-repo` 与编排方对运行时文件路径的裁定（第 5 轮 R5-M1）：M3 的快照流水放项目的 `<项目根>/.llm/snapshots.jsonl`，临时暂存区放系统临时目录，不往 git 目录写文件（§2.5）。第 4 步。

实施顺序按编排方定的布局：先把两个工作树快进到 main；第 3、4、5、6、8、9、10 步（第 7 步在 0.5 取消，编号保留，因为面板设计、规则板设计与循环板设计都按步号引用 M3，见第 7 步一节），然后 `m3-main-persona`，都在 `.worktrees/m3`（分支 `m3`）串行；第 11 步在 `.worktrees/m3-flow`（分支 `m3-flow`）并行，做完合入 `m3`；然后第 12 步（a）标定、（b）合入与批次 L4。0.2 的「访谈选择题」一步取消，它剩下的内容（去掉 `ask_user_question` 与兜底规则、模拟人）并进第 3、4、8 步。独立代码评审给第 3、4、5、6、8、9、10 步。按 `norm-review-floor`（`question-38` C）：第 3 步改主 Agent 的工具面与角色判定，并写用户级数据目录 `<DSH home>/glm-hourness/main-agent/`（第 1、4 条）；第 4 步改 guard 规则，git 快照碰用户的检出（第 1、3 条；快照流水写在项目的 `.llm/`，临时暂存区在系统临时目录里建并删，第 5 轮 R5-M1）；第 5、6、8、9 步改图引擎、阶段门禁或图工具的权限（第 1、2 条；第 9 步另改模块阶段的写权限与模块放行，§3.14）；第 8 步另写系统临时目录并删除临时目录（第 3、4 条）；第 10 步改决策流水的记录格式（`docs/DEVELOPMENT.md` §1.1 独立评审一行的「违规与决策流水」）。`m3-main-persona` 一步与第 11 步不在清单里（第 7 步已取消）：人设一步改提示词组装与配置键名，不改工具面、不写用户目录（L4 第 8 项改桌面版 profile 是到时问人的手工操作，不在代码里）；第 11 步只有客户端。

## 1. 定案与来源

| # | 事项 | 来源 | 改的 0.4 章节 | 落在哪步 |
| --- | --- | --- | --- | --- |
| 1 | 主 Agent 去掉写工具 | `question-26` C；`m3-1` 验收第 3 条 | §0、§1.2、§3.1.3「工具面」、§6.4 第 1 行 | 3、4 |
| 2 | `/wish` 入口醒目 | `question-19` 的附加要求；`m3-1` 验收第 4 条；plain-ui §7.5、§12 M3 第 4、5 条与第 4 轮裁定 P4-02；`mockup-wish.svg` | §3.6.4、§15 末段 | 11 |
| 3 | 身份节收窄 | `question-31` C；`.agents/tasks/prompt-audit/report.md` §4.2 第 4 条、§4.3 第 4 条、§7 第 9 条 | §3.1.3 的 10 项与长度上限、§3.6.2 | 3、5 |
| 4 | 问人的话说人话 | `d-plain-questions`；`.agents/tasks/design-context.md`「Questions for the person carry their background」「Plain words in questions」 | §3.1.3、§3.1.1、§6.2 的字串 | 3、6、9、11 |
| 5 | 人设设置位与改名 | `m3-main-persona`；清点报告 §7 第 3 条、§9 Q2 | §2.1、§11「新的配置项」一句 | m3-main-persona |
| 6 | 选项卡与推荐放最后 | `d-option-card`（`e22282f`）、`d-recommend-last`、`question-29` C；随 `d-chat-not-cards` 第一点改写 | §3.5.1、§3.4.1、§6.3 | §3；事前验尸一行在第 9 步 |
| 7 | 强一档模型的提醒 | `m3` 上 2026-10-29T10:16Z 的批注；`d-main-agent-models` | §3.1.1 成功回复、§3.6.4 | 3、11 |
| 8 | 访谈不经 `ask_user_question` | `d-interview-cards`；plain-ui 评审 P3-02；`d-chat-not-cards` 第一点（「访谈改为聊天，主 Agent 仍不带 ask_user_question」） | §0、§1.2、§2.2 第 3 条、§3.1.3 第 5 条、§3.2.1、§4、§9.1.2、§9.1.3、§9.2、§9.3 第 3 项、§11 | 3、4、8 |
| 9 | 一个项目一个主 Agent | `d-one-main-agent`；编排方对 H1 的裁定 | §2.2 第 1 条、§2.3、§3.1.1、§3.1.2、§3.5.2 | 3、11 |
| 10 | git 交给主 Agent，会丢工作的命令先存快照 | `d-main-agent-shell`（2026-10-29T16:53Z 定稿）与 16:57Z 的落地细则 | §3.1.4、§6.4 第 1 行、§10 的残余缺口 | 4 |
| 11 | 背景字段 | 面板设计 0.6 §5.2；第 4 轮裁定 P4-01；编排方对 M2 的裁定与接缝裁定（上限归面板设计）；第 3 轮 M8 | §3.5.1 参数 | 6（§2.9） |
| 12 | 设计放行后主 Agent 自己推进 | `d-auto-drive` | §2.4 末段 | 不改代码（§9 第 7 条） |
| 13 | 问人改成聊天 | `d-chat-not-cards`（17:01Z 定；17:08Z 人对五点落地方案说「没问题」；17:16Z 定「要什么、做成什么样的事先问一两句开放的问题」；17:27Z 格式定稿） | §2.2、§3.1.3 第 5、7、8、9 项、§3.2、§3.4、§3.5、§9 | 3、5、6、8、9、12 |
| 14 | 两层循环与方向清单：本项目的自查 | `d-design-onepage`（2026-10-29T16:53Z 起） | 无 | §12；实施之前 |
| 15 | M3 的拦截在规则板上看得到、只能看 | `d-rules-visible`（2026-10-29T18:06Z）、`d-defaults-readonly`（17:55Z）；规则板设计 0.8 §10.1；第 3 轮 M1 | §6.4（规则的所在层不变，加登记） | 4、6、8（§3.11） |
| 16 | 必须全审的改动 | `norm-review-floor`（`question-38` C，17:12Z）；第 3 轮 M2 | §8 表的「独立评审」 | 3、10 |
| 17 | 高峰模式；主 Agent 不受高峰模式影响 | `d-peak-mode`（2026-10-29T17:33Z、17:45Z）；`d-main-agent-peak-exempt`（2026-10-30T05:36Z，relay「主Agent应该不受高峰影响，随时回复的」）；第 3 轮 M7、第 4 轮 M1 | 无 | 3（例题，§2.8） |
| 18 | ZCode 基线 3.17.1 的重核 | `d-zcode-3171`（`zcode-3171-follow` 已合入 main）；第 3 轮 M6 | 无 | `m3-main-persona`（§2.7） |
| 19 | 接缝裁定 | `.agents/tasks/design-context.md`「Seam rulings between designs」：`attach` 的交回、背景上限归面板设计、`/wish` 归 M3；规则板设计 0.8 §10.7、循环板设计 0.3 §17 的请求 | 无 | 6（§3.13）、§2.9 |
| 20 | 两层循环：每个模块一次放行 | `d-design-onepage` 扩到产品（2026-10-30T05:19Z，relay「两层循环加，我正想说这个事情呢」）；`.agents/tasks/design-context.md`「Two-level loop in the product」；面板设计 0.7 §4.11 与 §11「两层循环」；`m3` 05:19Z、06:11Z 的批注；第 4 轮 M2 | 基础设计 0.4 §2.4、§3.3.2、§3.3.3、§3.4 | 5、6、8、9（§3.14） |
| 21 | 给 agent 的示范过真实输入的检查，题材不撞练习题 | `d-agent-examples`（2026-10-30T06:41Z，relay「彳亍」）；第 4 轮 M1 | 无 | 3、6（§2.8） |
| 22 | 循环板 0.6 与规则板 0.10 对 `attach` 分派与同意路径的请求 | 图上 `m3` 2026-10-30T08:12Z（两条）、10:13Z 的批注；循环板设计 0.6 §17 M3 各条；规则板设计 0.10 §10.7 M3 一节 | 无 | 6（§3.13、§3.4） |
| 23 | 面板不再写图 | 面板设计 0.6 §9.1、0.7 §11 第 6a 条（`/graph-apply` 删去，P5-11）；第 4 轮 N1 | 基础设计 0.4 §3.5.2（面板异步卡的回写） | 7 取消 |
| 24 | M3 的运行时文件进项目的 `.llm/`，不进 git 目录 | `d-rules-in-repo`；`.agents/tasks/design-context.md`「Dogfood implementation order and runtime paths」（编排方对 M7 第 4 轮 N1 的裁定）；图上 `m3` 2026-10-30T10:56Z 的批注；第 5 轮 R5-M1 | 无（改的是 0.4 起附录 §2.5 第 2、6 步里的位置，即 `<git-common-dir>/hourness/`） | 4 |

## 2. 共用的改动

### 2.1 主 Agent 的工具面（`question-26` C）

0.4 §3.1.3 的「工具面」一段作废，换成下面这段。

- 单独一个不带 `prepend` 的 `system-prompt/assemble` 监听器 `roleFace`，由 `installAgentHooks(agent)` 装、按 agent 去重、卸载函数进本行的卸载列表（同 0.4 的身份节监听器）。它在 `next()` 之后按角色改 `tools`：
  - 是主 Agent（§2.4 的 `isMainAgent`）：去掉每个原生名在 `WRITE_NATIVES = ['write', 'edit']`（`src/design/index.ts` 的常量）里的工具，原生名取 `toNativeTool(dialectService(ctx, problem), tool.name, problem)`（`src/shared/dialect.ts`，guard 用同一个函数）。`Write`、`Edit` 由方言服务或静态表 `ZCODE_ALIAS_NATIVES` 换成 `write`、`edit`（`src/shared/dialect.ts`:30–33、70–83），方言以后多一个写文件的别名时自动覆盖。再去掉原生名在 `HIDDEN_FROM_MAIN_AGENT = ['ask_user_question']`（`src/design/talk.ts`，§3.2）里的工具，同样经 `toNativeTool` 比较（N11）：工具检索的常驻表里已有 ZCode 名 `AskUserQuestion`（`src/toolsearch/exposure.ts`:39），方言以后给它加别名时，别名在这里自动去掉。`str_replace_editor` 在工具面里时，把它的参数 schema 复制一份，`properties.command.enum` 改为 `['view']`；schema 形状不对（没有 `properties.command.enum` 数组）时整个去掉这个工具，会话健康记一条「str_replace_editor 的参数形状不认识，主 Agent 的工具面里去掉了它」。rc.3 的预设与 headless 组合里没有这一行（`reference/dsh-desktop-0.2.1-rc.3/**/*.yml` 里没有 `tool-str-replace-editor`〔实读〕），这条只为装了它的组合。
  - 不是主 Agent：去掉 `DESIGN_TOOL_NAMES` 里的名字（`propose_to_human`、`record_human_answer`，§3.4、§3.5）。这个常量随第 6 步出现；在那之前 `roleFace` 只有主 Agent 的一支。
- 为什么不放在身份节的 `prepend` 监听器里：方言行与 guard 的声明监听器都是 `prepend`，它们在 `next()` 之后读到的工具就是要改写、要交给工具检索的那一份；本行的 `prepend` 监听器与它们谁在外层取决于各行激活的先后（0.4 §3.1.3）。cordis 的 `on` 对 `prepend` 用 `unshift`、否则 `push`（cordis:336〔实读〕），串行 waterfall 从列表头开始调用，所以不带 `prepend` 的监听器在所有 `prepend` 监听器的里层，方言与工具检索看到的已是去掉之后的工具。DSH 自己的 `system-prompt/assemble` 监听器都不改 `tools`（dsh-agent:167、dsh-working-directory:48、dsh-session-reference:459）。不同插件在同一个 agent 作用域上的监听器进同一张表是〔推断〕，L3 核对（第 3 步 `glm-design-main` 请求 3）。
- 只在工具面上去掉不是边界：rc.3 按名执行（`docs/DESIGN.md` §2.4a）。主 Agent 按名直接调用 `Write`、`write`、`Edit`，由第 4 步的 `main-agent-no-write` 在 `tools/pre-execute` 拒绝；按名调用 `ask_user_question` 由第 4 步的 `main-agent-ask` 拒绝。经 `DeferredToolCall` 包一层的 `Write` 到不了执行：`Write` 在 GLM 上是常驻工具（`src/toolsearch/exposure.ts`:39），`roleFace` 去掉之后它也不在延迟目录里，`DeferredToolCall` 先报「不可用」（`src/toolsearch/index.ts`:161–164），就算在目录里也会因为是常驻名报错（:165）。
- 工具面在 `/wish`、`/wish off` 与主 Agent 移走（§2.4）的下一步各变一次。

### 2.2 身份节（`question-31` C、`d-chat-not-cards`、`d-plain-questions`）

`MAIN_AGENT_IDENTITY`（`src/design/identity.ts`）分两部分，按这个次序拼成一节，中间一个空行。参考文本是英文的指令，对人说的话与标签用中文原文；实现者可以改措辞，单测钉住长度与下面列的内容。

第一部分：角色与边界，上限 1,500 字符（参考文本实测 1,137，第 5 轮 R5-N1 把「目标放行」改成「目标或它的模块放行」后比 1,117 多 20；取代 0.4 的 9,000）：

```text
# Main agent
You are the main agent of this project: the human's one conversation with the project, and its project manager. You turn what the human wants into a plan on the project graph that the human approves, dispatch the work to subagents, accept it against its acceptance criteria and report back in plain words. You have no tools that write files.
The harness enforces the boundaries and its denials name the right path: shell commands that write files are denied; until what you work on (the goal, or its module) is released, the subagents you dispatch, and theirs, only read; the graph changes only through the graph tools, and words you relay as the human's must be in a message they sent. The shell and git are yours; before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot and tells you how to restore it.
The design loop runs wish, interview, design, release. A stage reminder tells you where the goal in your focus stands and what is missing; tool results tell you the next step.
If the human has /plan on, exit_plan_mode only leaves plan mode; it releases nothing on the graph.
```

五项：角色（这个项目唯一的主 Agent、项目经理、没有写文件的工具）；一句边界（会执行的规矩只点名，含转述的原话要在人发来的消息里，§3.6）；git 归主 Agent 与快照一句（§2.5）；阶段与提醒；`/plan` 的说明。

第二部分：怎样和人说话，上限 1,400 字符（参考文本实测 1,346，按 JavaScript 字符串长度数；0.4 的例题是 1,271，0.5 换例题并加了「只示范格式」一句，见 §2.8），由两个常量依次拼成、中间换行：

- `TALK_GUIDE`（`src/design/talk.ts`，§3.2，实测 697；第三句按 N10 写成「every matter that needs their answer」，汇报与放行之后的一句话不走工具）：

```text
Talk with the human about at most three matters in one reply, and never give them options or letters to pick from. To learn what they want, ask one or two open questions in plain words, with your guess when you have one. Put every matter that needs their answer to them with propose_to_human: one plan in four short lines (背景, 推荐, 疑问, 不做), shown as given, then one question at the end. They agree, add or reject in their own words. Restate a loose answer in one line ("那我记成：…") and wait; then record it with record_human_answer and their exact words. Decide reversible details yourself and say so in one line. Ask at the project-manager level, never about code, and never ask what you can look up.
```

- `PLAIN_QUESTION_GUIDE`（`src/graph/plain-question.ts`，§2.8，实测 648），带例题与换词表。

整节上限 2,700 字符（参考文本实测 2,485：第一部分 1,137，加一个空行的两个换行，加第二部分 1,346），单测钉住三个上限。单测另钉：整节不含 `ask_user_question`、`decision_card`、`design_review`、`ask_human`、`(Recommended)`、`(推荐)`、`（推荐）`、`depth`；含 `propose_to_human`、`record_human_answer` 与四个标签。第二部分点名的两个工具在第 6 步才注册；第 3 步到第 6 步都在分支 `m3` 上，第 12 步（b）一起合入 main，所以 main 上不会出现身份节点名了不存在的工具的版本。

`question-31` C 的「约 1k–1.5k 字符」指角色与边界，第一部分在这个范围里；第二部分来自之后的两个人定（`d-plain-questions` 点名了主 Agent 身份文本，`d-chat-not-cards` 定了说话方式），人后一个决定优先。三个上限的数是 agent 定的（§11）。

0.4 §3.1.3 第 1–10 项的去向：

| 0.4 第几项 | 去向 |
| --- | --- |
| 1 角色；「用户的人设管怎么说」 | 角色留在第一部分，改为「这个项目的主 Agent」（§2.4）；人设一句删去，人设在设计行加的 `hourness:output-style` 一节（§2.7） |
| 2 三问四答 | 设计循环的五栏随设计阶段的提醒下发（§2.3）；给人看的是四行（§3.1） |
| 3 harness 执行的规矩 | 一句（第一部分第二段）；git 一句 |
| 4 阶段 | 一句（第三段）；各阶段做什么在阶段提醒里 |
| 5 八步访谈与提问规则 | 问句与做法移到 wish、interview 阶段的提醒（§2.3）；说话方式在第二部分 |
| 6 图上的写法 | 移到阶段提醒与门禁的 `hint`（`src/graph/stage.ts` 已有，main `7aa8fe5`） |
| 7 `design_review` | 作废；确认与放行是 `propose_to_human` 与 `record_human_answer` 的两种（§3.4、§3.5） |
| 8 决策卡 | 作废；要人定的事是 `propose_to_human` 的 `question` 一种（§3.4） |
| 9 汇报细度以 `design_review` 的 `depth` 为准 | 删去；系统提示词里汇报细度只有 GLM 包的一个来源（§2.7）。「讲细点」「说重点」是人说的话，主 Agent 照着改讲法（§3.7） |
| 10 `/plan` | 留（第一部分末段） |

### 2.3 阶段提醒承接访谈与写图格式

0.4 §3.6.2 第 3 条的正文按阶段加下面几行（英文，中文原话与标签原样）。提醒照旧只在变化时注入，所以这些文字只在阶段或缺项变了的那一步出现。

- `wish`、`interview`：
  - 一行访谈的做法：`Interview the human in plain chat, one or two questions at a time, in their words: say 怎样算做成 for acceptance, 明确不做的 for non-goals, 最可能出岔子的地方 for risks, 不能改、不能花、不能冒的险 for constraints; offer your guess from experience; write each answer to the graph as soon as you have it.`
  - 一行「下一步」。对照表是 `src/design/stage-notice.ts` 里按 `GateItem.key` 的常量，每项带访谈步号与一句「下一步」：

    | `GateItem.key` | 步号 | 「下一步」一行 |
    | --- | --- | --- |
    | `need` | 1 | `Next: ask 「你想要什么」 as an open question, then <hint>.` |
    | `problem` | 2 | `Next: ask 「做成以后，你的日子会有什么不一样」, then <hint>.` |
    | `audience` | 2 | 同 `problem` |
    | `acceptance` | 3 | `Next: ask 「你会怎么检查它真的做成了」, then <hint>.` |
    | `non-goals` | 4 | `Next: ask 「有没有你明确不想要的」 with your guesses in one line, then <hint>.` |
    | `constraints` | 5 | `Next: ask 「有没有不能改、不能花、不能冒的险」, then <hint>.` |
    | `risks` | 6 | `Next: ask 「假如最后没做成，最可能是因为什么」 with your three guesses in one line, then <hint>.` |
    | `choice` | 7 | `Next: put the one fork only the human can decide with propose_to_human (kind question) and record their answer with record_human_answer; a question you decide on your own does not count.` |

    问句取 `docs/ORCHESTRATION.md` §4.2 表的原文。`choice` 一行不套「ask 「<问句>」」的模板（N5：§4.2 第 7 步的那一格是描述，不是问人的话）。「下一步」取缺项里步号最小的一项，步号相同按上表次序（`problem` 在 `audience` 之前）；`requirementCard` 的数组次序（约束排在成功之前，`src/graph/stage.ts`:121–143）不用来排序。缺项只有 `goal:supersedes` 时不写「下一步」一行，只写它的 `label` 与 `hint`。需求卡 8 项都齐时写 `Next: put the requirement to the human with propose_to_human (kind confirm).`
  - 其余缺项各一行（`label` 与 `hint`，同 0.4）。
- `design`：一行写图格式：`Write each design decision with "理由：", "架构：" and "查过的现成方案：" lines in its body, acceptance and nonGoals; plan tasks under the goal with a source edge to the decision, every task with acceptance; a small project keeps its tasks directly under the goal, and only work with independent parts the human should release one by one is planned as features (modules) under the goal.`（0.4 写的是「features and tasks」；0.5 起目标下直接挂特性就是分了模块，走两层循环，§3.14，所以说明里写清什么时候分。）放行门禁成立时另一行 `Next: put the design to the human with propose_to_human (kind release).`；不成立时列缺项（同 0.4）。事前验尸一行（`如果失败：`）在第 9 步加，与它的解析同一步。
  - 目标下有直接的特性子节点（分了模块，§3.14.1）时，写图格式那一行换成大循环的写法，「下一步」换成大循环的放行：`The work is split into modules. Write the framework as design decisions under the goal (each with "理由：", "架构：" and "查过的现成方案：" lines, acceptance and nonGoals) and plan each module as a feature directly under the goal with a source edge to a framework decision; write the directions the human decided as the acceptance items of one norm node with the id norm-directions under the goal. A module's own decisions and tasks are written later, under the module.` 与 `Next: put the framework, the module list and the directions to the human with propose_to_human (kind release, page listing them).`（放行门禁与缺项见 §3.14.2）。
- `release`：`The design is released. Tell the human in one line; decomposition and dispatch come next.`（M7 落地时按 `d-auto-drive` 改写，§9 第 7 条）
  - 分了模块的目标放行之后（大循环放行，§3.14），这一行换成 `The framework, the module list and the directions are released. Each module starts in design: write its decisions and plan under it, check them against every direction in norm-directions, and put it to the human with propose_to_human (kind release, module <id>, page). Nothing under a module is built before that module is released. Before you dispatch a subagent that writes, graph_focus to the module or the task it belongs to.`（最后一句是第 5 轮 R5-N1 加的，见 §3.14.6），后面按模块逐行列 `<标题>（<id>）：设计中 | 已放行 | 退回设计`，至多 8 行，多的写 `and <n> more`。
- 焦点在某个模块里（§3.14.1 的 `moduleOf` 有值）且模块的有效阶段是 `design`：写图格式一行 `Write this module's design decisions as children of the module (the same columns), its plan as features and tasks under the module, every task with acceptance; check the design against every direction in norm-directions and name in the 疑问 line any it strains. Before you dispatch a subagent that writes, graph_focus to the module or the task it belongs to.`（最后一句见 §3.14.6，第 5 轮 R5-N1）；模块放行门禁成立时 `Next: put this module to the human with propose_to_human (kind release, module <id>, page: one page in plain words).`，不成立时列缺项。模块已放行：`This module is released. Tell the human in one line; decomposition and dispatch of this module come next.`（M7 落地时改写）。
- `stage.ts` 里两条今天点名 `decision_card` 的 `hint` 改写（第 5 步）：`choice` 的 hint 改为 `interview step 7 (the fork only the human can decide): put it with propose_to_human (kind question) and record the answer with record_human_answer; a question the agent decided on its own does not count`；放行门禁里人定待决未拍板的 hint 改为 `wait for the human's answer in the chat and record it with record_human_answer`。两条都与 main 上的判定一致：`lastDecidedByHuman` 认 `human` 身份的拍板与带原话的转述（`src/graph/stage.ts`:112–115；面板不再写图之后，实际来源只剩带原话的转述）。
- 单测钉住：所有阶段的正文都不含 `ask_user_question`、`decision_card`、`design_review`、`ask_human`、`(Recommended)`、`(推荐)`、`（推荐）`。

### 2.4 一个项目一个主 Agent（`d-one-main-agent`，H1）

`d-one-main-agent`（人定，relay「一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」）：每个项目恰有一个主 Agent 会话，人只在这里和项目对话；已有主 Agent 时在别的会话发 `/wish`，告诉人主 Agent 在哪个会话，并可以把它移到当前会话，原会话变回普通会话；细节由编排方定、人可推翻。0.4 §2.3「一个工作区可以有多个主 Agent 会话」与「用户 fork 的会话仍是主 Agent」作废。下面的细节记进 §11。

项目与持有者记录：

- 项目就是图目录。键 `projectKey(dir)`：`fs.realpathSync.native(dir)`，失败时退回 `path.resolve(dir)`；`\` 换成 `/`，去掉末尾的 `/`，`process.platform === 'win32'` 时转小写。与 0.4 §3.5.2 的 `sameDir` 同一套规整，`sameDir(a, b)` 改为 `projectKey(a) === projectKey(b)`。会话的图目录取图行服务的 `dirFor(session.header.cwd)`（同 0.4 §3.5.2 的理由）；`projectKey` 按会话缓存（`WeakMap<SessionLike, string>`，会话目录不变）。同一个仓库的两个工作树各有自己的 `docs/graph/`，算两个项目；图行的 `dir` 配成绝对路径时所有会话共用一张图，算一个项目。
- 持有者记录：`<userHome>/main-agent/<sha256(projectKey) 的前 16 个十六进制字符>.json`，内容 `{version: 1, sessionId, graphDir, since, commandId}`。`userHome` 取数据服务的 `userHome`，数据行不在时取 `userDataHome()`（`src/shared/data-home.ts`，与渠道行的 `credentialHome` 同一个退路）。不放在项目目录（`projectHome`，评审建议的位置）：数据行的 `projectHome` 是一个配置值，桌面版上所有工作区共用它（`src/data/index.ts`:20、31），放在那里会让不同项目共用一个主 Agent；它也可能没配置。会话 id 是这台机器上 DSH 主目录里的东西，记录跟着它放在用户级目录。
- 模块 `src/graph/main-agent-holder.ts`（宿主专用，用 `node:fs`、`node:crypto`；放在图目录，因为面板行 `src/graph/panel-row.ts` 也要读它，依赖方向是设计目录 → 图目录）：`projectKey`、`holderFile(userHome, key)`、`readHolder(file): {kind: 'none'} | {kind: 'held', record} | {kind: 'unreadable', reason}`、`claimHolder(file, record)`（独占新建：先写同目录临时文件，再 `fs.linkSync(临时, 目标)`，目标已存在时 `EEXIST`，最后删临时文件）、`replaceHolder(file, record)`（临时文件加 `renameSync`）、`releaseHolder(file, sessionId)`（读出来仍指向这个会话才删）、`mainAgentOf(userHome, dir)`（给 M5、M7 的晨报、周报与巡检提醒用，也给循环板投递用；M3 只导出）；另导出面板设计 0.6 §4.9 与 §11 M3 第 5 条要的两个（N4）：`holderFileOf(userHome, dir)`（等于 `holderFile(userHome, projectKey(dir))`）与 `holderHome(ctx)`（取 `userHome` 的那一个函数：数据服务的 `userHome`，数据行不在时 `userDataHome()`；设计行自己也只经它取），图面板行的 `hournessProject` 投影调这两个，不另算一遍。`readHolder` 同步，按文件的 `mtimeMs` 与 `size` 缓存，没变就不重读。

谁是主 Agent（取代 0.4 §2.3 第 3 条与 §3.1.2 `isMainAgent` 的读法）：`isMainAgent(agent)` 先按 0.4 判（不是委派子会话，且待生效状态或投影为真）；为真时再读这个会话所在项目的持有者记录：

| 记录 | 结果 |
| --- | --- |
| `held`，`sessionId` 等于本会话 | 是主 Agent |
| `held`，指向别的会话 | 不是（投影为真只是还没对齐，见下面的「对齐」） |
| `none` 或 `unreadable` | 只按投影判；行健康 degraded「主 Agent 的持有者记录读不到（<原因>）：在主 Agent 会话里再发一次 /wish」 |
| 会话没有图目录（`dirFor` 为 `undefined`） | 只按投影判（这种会话发不出 `/wish`，0.4 §3.1.1「图目录不存在」一行） |

`/wish` 的处理（0.4 §3.1.1 的表在「图目录不存在」一行之后改为下面几行；之前的几行与长度检查不变；`input.hint` 改为 `off | here [一句话] | 一句话`；描述改为「让这个会话的 agent 当这个项目的主 Agent（项目经理）：按项目图推进，不写文件；后面跟一句话就从许愿开始；here 把主 Agent 从别的会话移过来，后面也可以跟一句话；/wish off 退出」。`here` 之后的文字按 0.4「一句话」的同一套长度检查（N9））：

| 输入 | 记录 | 结果 | 对 agent |
| --- | --- | --- | --- |
| `off` | 指向本会话 | 删记录（`releaseHolder`），其余同 0.4「`off` 且是主 Agent」 | 同 0.4 |
| `off` | 指向别的会话，本会话投影为真 | success「主 Agent 在另一个会话里，这个会话已经变回普通会话」 | `inject` 一条 notice：这个项目的主 Agent 移到了别的会话，这个会话的 agent 从下一步起是普通 agent，可以直接写文件 |
| `off` | 其余 | 同 0.4 | 同 0.4 |
| 空或一句话 | `held` 指向别的会话，且那个会话活着（`agents.get(id)` 有值）或还存着（`sessionPersistence.list()` 里有它；这个服务不在或抛错时当作还存着） | success「这个项目的主 Agent 在另一个会话里（<since 的本地时间> 开始，会话「<标题>」，id <id><；现在没有打开>）。要把它移到这里，输入 /wish here，那个会话会变回普通会话。」一句话时最后一句改为「要把它移到这里并交给它这句话，输入 /wish here 加这句话，那个会话会变回普通会话。」（N9） | 无；本会话的角色不变，不写待生效状态 |
| 空或一句话 | `held` 指向的会话已经不存在（`sessionPersistence.list()` 读得到且没有它） | `replaceHolder` 改为本会话，然后同 0.4 的「空」或「一句话」，回复开头加「原来的主 Agent 会话已经不在了，」 | 同 0.4 |
| 空或一句话 | `none` | `claimHolder`；`EEXIST`（别的会话刚抢先）时重读，按「指向别的会话」一行回复；成功后同 0.4 | 同 0.4 |
| 空或一句话 | `held` 指向本会话 | 同 0.4（「已是主 Agent」或许愿） | 同 0.4 |
| 空或一句话 | `unreadable` | `replaceHolder` 改为本会话，回复开头加「原来的主 Agent 记录读不到（<原因>），已改为这个会话；」，然后同 0.4，并做一次「对齐」 | 同 0.4 |
| `here`，或 `here <一句话>` | 指向别的会话 | `replaceHolder` 改为本会话，做一次「对齐」，然后不带话时同 0.4 的「空」、带话时同 0.4 的「一句话」（从许愿开始）；success 开头「主 Agent 已从另一个会话移到这里；那个会话变回普通会话。那个会话派出去还在跑的子 agent 从现在起按普通会话的规矩。」 | 同 0.4 的「空」或「一句话」 |
| `here`，或 `here <一句话>` | 其余 | 同「空」或「一句话」 | 同「空」或「一句话」 |

写记录在写待生效状态之前；写失败（磁盘错误、权限）时返回 error「主 Agent 的持有者记录写不了：<原因>」，不开启，不写待生效状态。标题取 `sessionProjections.stateOf(session, 'title')`（session-title 注册的投影键 `title`，dsh-session-title:173〔实读〕），读不到时不写标题；`sessionPersistence` 是 JSONL 后端注册的服务（dsh-session-persistence-jsonl:2398〔实读〕），`list()` 返回存着的每个会话的 `header`（:2603 起〔实读〕），`src/shared/dsh-min.ts` 加薄类型 `SessionPersistenceLike { list(options?): Promise<readonly { header: { id: string } }[]> }`。

对齐（让「投影为真」与记录一致）：

- `demoteOthers(key, except)`：取 `agents.roots()`（0.4 §3.5.2 加的成员），留下 `projectKey` 等于 `key`、投影为真、不是 `except` 的会话，对每个执行 `commands.execute(它的 agent, '/wish off', [], AbortSignal.timeout(10_000))`（dsh-commands:327–339〔实读〕：先追加 `command/run`，`source` 固定为 `{kind: 'user'}`）。它们的 `/wish off` 走上表第二行，投影随之为假，流程条、开场卡片与「主 Agent」按钮都只读投影，所以跟着变。在 `/wish here`、`/wish` 覆盖读不到的记录之后各调一次。
- `agent/created`（不是委派子会话、投影为真、记录 `held` 且指向别的会话）：同样执行一次 `/wish off`，但不在监听器里执行（N7）。`agent/created` 是串行事件，监听器逐个 `await`（agent:581〔实读〕），在里面等另一条命令跑完会不会与创建流程互相等待没有核实；所以监听器只登记 `void agent.whenIdle().then(() => commands.execute(agent, '/wish off', [], AbortSignal.timeout(10_000)))` 就返回（`whenIdle` 等这个 agent 当前的活动结束，agent-loop:870–875〔实读〕），这一串的错误由 `.catch` 收下，按下一条处理。这覆盖两种情形：移走时没有打开的原会话，下次打开时对齐；人 fork 了主 Agent 会话，新会话继承了命令事件、投影为真，它不是持有者，创建之后的第一次空闲就变回普通会话；在那之前它的组装已经按记录判为不是主 Agent（上表第二行），身份节、工具面与规则都按普通会话。
- 执行失败（agent 已释放、超时、`commands.execute` 返回 `undefined`）时告警一次，行健康 degraded「没能让会话 <id> 退出主 Agent：<原因>」。`commands.execute` 在命令行解析不出或命令名找不到时返回 `undefined`、不抛错（commands:326–330〔实读〕），实现把 `undefined` 当失败，原因写「/wish 在那个会话里没有注册」。这时那个会话的投影仍为真，但 `isMainAgent` 读记录判它不是，身份节、写入规则与工具面都按普通会话；只有它的流程条与按钮显示得不对，直到下一次对齐。
- 残余：两个会话几乎同时 `/wish here` 时后写的一方胜，`demoteOthers` 按各自读到的会话执行，可能有一个会话投影仍为真而不是持有者；执行边界照记录判，显示不对的那个会话下次 `agent/created` 时对齐。`demoteOthers` 发出的 `/wish off` 在会话日志里记为 `source: {kind: 'user'}`（rc.3 固定如此），会话日志里看不出它是 harness 发的；回复文字写明「主 Agent 在另一个会话里」，留痕靠这一句与持有者记录的 `since`。

其他读法随之改：

- 面板不再写图（面板设计 0.6 §9.1，`/graph-apply` 删去；0.7 §11 第 6a 条），所以 0.4 §3.5.2 的「面板拍板的回写」（人在面板上拍板后通知主 Agent）没有触发的地方，0.5 取消（第 7 步，第 4 轮 N1）。持有者记录留下的用处：`isMainAgent` 的判法、`mainAgentOf` 给晨报、周报、巡检与循环板投递找人、面板「去主 Agent 的对话回话」的跳转（面板设计 0.7 §4.9、§11 第 5 条）。人在图上的拍板只剩对话一条路：`record_human_answer` 与带原话的 `graph_decide`。
- 子 agent 的设计期只读（`design-before-release`，0.4 §3.3.3）照旧按 `isMainAgent(root)` 判。主 Agent 移走之后，原会话派出、还在跑的子 agent 的根不再是主 Agent，规则不再适用：原会话已是普通会话，它的子 agent 与普通会话的子 agent 一样（`/wish here` 的回复写明这一点）。
- 人的原话的核对只看持有者会话自己的会话投影 `hournessTalk`（§3.2、§3.6）：主 Agent 移过来之后，确认与放行要在新会话里重新提一次；要人定的待决按图上的时间判，人在新会话里回话照样算。
- 客户端不读记录：流程条、`WishCard`、`WishPill` 照旧只读投影（§2.6）。普通会话里点「交给主 Agent」执行 `/wish`，已有主 Agent 时由命令的回复指路。
- 晨报、周报与巡检由 harness 到点提醒这个会话（`d-one-main-agent` 后半）属于 M5、M7（§10）；M3 只保证同一时刻至多一个会话是主 Agent，并导出 `mainAgentOf`。

### 2.5 git 交给主 Agent，会丢工作的命令先存快照（`d-main-agent-shell`，M1）

`d-main-agent-shell`（人定，2026-10-29T16:53Z 定稿，relay「主Agent只是不能动文件，但是可以任意操作git，或者说git交由主Agent是最好的」与「按你上面推荐的来」）：主 Agent 能任意使用命令行与 git，什么时候合、先合哪个、冲突怎么处理、要不要回退都由它定；唯一的限制是没有写文件的工具，shell 里写文件的命令由 guard 兜底，git 命令不在此列；harness 只守主干前进的那一刻（`norm-merge-gate`，M7 的 `m7-5` 改为「主 Agent 合入，harness 核对与记证据」）。编排方的落地细则（16:57Z，agent 定、可推翻）：git 不当写文件拦；会丢掉未提交改动或改写已推送历史的命令（`reset --hard`、按路径 `checkout` 或 `restore`、`clean -f`、`stash drop` 或 `clear`、`branch -D`、`push --force` 等）执行前，harness 先存一份可恢复的快照（`git stash create` 加 `refs/hourness/snapshots/` 下的引用；改写历史时打标签）并记下，再放行。依据 `d-failure-plans`：不拦，但失败要能恢复、能追溯。

M3 做的范围：主 Agent 自己的 shell 调用。子 agent 的 git 属于 M7 的派发与工作树（§10）。主干前进时核对这个提交跑过 `norm-merge-gate`、记证据，在 M7 的 `m7-5`；M3 不拦主干前进，留痕靠 git 自己的 reflog、会话日志里的命令与本节的快照流水（§10、§9 第 7 条）。

识别（新文件 `src/guard/git-snapshot.ts`；`src/guard/shell.ts` 加一个导出）：

- `simpleCommands(command, dialect): readonly (readonly string[])[]`（`shell.ts`）：每个简单命令在命令位置之后的词（去掉引号之后的文字），跳过变量赋值前缀与包装命令，并按 `shellWrites` 的同一条规则进入 `bash -c`、`pwsh -Command`、`find -exec` 与子表达式。引号里的文字不是命令，所以 `echo "git reset --hard"` 不算。
- 一个简单命令的命令名（同 `commandName`：最后一段路径、小写、去 `.exe`）是 `git` 时是一次 git 调用。跳过全局选项：`-C <路径>`（可以多个，依次相对解析）、`-c <k=v>`、`--git-dir[=]`、`--work-tree[=]`、`--namespace[=]`、`--no-pager`、`-p`、`--paginate`、`--bare`、`--no-replace-objects`、`--literal-pathspecs`、`--no-optional-locks`；第一个不是全局选项的词是子命令。
- 仓库目录：`-C` 给的路径，相对于会话的工作目录（`baseFor`，同 guard 的写入目标）。同一行里 git 之前有 `cd`、`Set-Location`、`sl`、`chdir`、`pushd` 时，参数是字面路径就按它解析；不是字面路径（含 `$`、`%`、反引号）时拒绝（下面的「拒绝」），因为 harness 认不出要在哪个仓库存快照。
- `gitRisk(sub, args): 'discard' | 'history' | 'both' | undefined`：
  - `discard`（可能丢掉工作区或暂存区里没提交的东西）：`checkout`、`switch`、`restore`（都不论参数；什么都不用存时整件跳过，见快照第 2 步末条）；`reset` 带 `--hard`、`--merge`、`--keep`；`clean`（不带 `-n`、`--dry-run`）；`stash drop`、`stash clear`；`rm` 带 `-f`、`--force`；`merge`、`rebase`、`cherry-pick`、`revert`、`am` 带 `--abort`；`read-tree` 带 `-u`；`worktree remove`。其中「写出类」是会从另一棵树写工作区、把挡在路上的未跟踪文件直接删掉或盖掉的几种（M3 (a)；git-reset 文档「Any untracked files or directories in the way of writing any tracked files are simply deleted」，git-checkout 文档对 `-f` 的同样说法）：`reset` 带 `--hard`、`--merge`、`--keep`；`checkout` 带 `-f`、`--force`，或带分支、提交（切换）或 `<树> -- <路径>`；`switch` 带 `-f`、`--force`、`--discard-changes`；`restore` 带 `--source`（或 `-s`）；`read-tree -u`。不带 `-f` 的 `checkout <分支>`、`merge`、`rebase`、`pull`、`stash pop` 碰到挡路的未跟踪文件时 git 自己拒绝（「untracked working tree files would be overwritten」），不在写出类里；模型随后加 `-f` 重试，就进了写出类。
  - `history`（移动或删除引用，只靠它可达的提交会丢）：`reset`（任何模式）；`rebase`（不带 `--abort`）；`commit --amend`；`branch` 带 `-D`、`-d`、`--delete`、`-M`、`-m`、`--move`、`-C`、`-f`、`--force`；`tag` 带 `-d`、`--delete`、`-f`、`--force`；`update-ref`；`push` 带 `-f`、`--force`、`--force-with-lease`、`--force-if-includes`、`-d`、`--delete`、`--prune`，或有以 `+` 或 `:` 开头的 refspec；`filter-branch`、`filter-repo`、`replace`；`reflog expire`、`reflog delete`；`gc` 带 `--prune`；`prune`；`stash drop`、`stash clear`（暂存条目也是引用）；`remote remove`、`remote rm`。`push --mirror` 不在这里：它被下面的「对外检查」拒绝。
  - 两类都有时为 `both`；子命令或参数里有 `$`、`%`、反引号时为 `both`。
  - 子命令不在上面、也不在已知的只读或无损命令表里（`status`、`log`、`diff`、`show`、`blame`、`grep`、`fetch`、`add`、`commit`、`init`、`clone`、`ls-files`、`rev-parse`、`describe`、`shortlog`、`config`、`remote`、`notes`、`bisect`、`branch`、`tag`、`merge`、`pull`、`cherry-pick`、`revert`、`am`、`stash push|list|show|apply|create|store|branch`、`worktree list|add`……完整表是 `git-snapshot.ts` 的常量）时，读一次 `git config --get alias.<子命令>`：是 `!` 开头的别名为 `both`，是普通别名时按展开后的文字再判一层，都不是时不存快照。
  - 认不出的情形（脚本里调用 git、git 钩子、`git` 以外的程序改仓库）是残余，记在 §10。
- 对外检查（M4 (b)，先于类别与快照，任何 git 调用都做）：下面几种不存快照、直接拒绝（「拒绝」一段），因为快照可能存着没提交的改动与旧的提交，推出去就收不回来：`push` 带 `--mirror`；`push` 带 `--tags`，且本地有 `refs/tags/hourness-snapshot/*`（`git for-each-ref --count=1 refs/tags/hourness-snapshot/`）；`push` 的某个 refspec 的源（`:` 之前、去掉开头的 `+`）经 `git rev-parse --symbolic-full-name` 规整后是 `refs/hourness/` 或 `refs/tags/hourness-snapshot/` 下的引用（`refs/hourness/snapshots/<id>/remote/*` 除外：那是远端原来的提交，恢复远端时要推它），或是能匹配到它们的通配（`refs/*`、`refs/hourness/*`、`refs/tags/*` 一类，按 git 的 `*` 规则判），或经 `git rev-parse --verify -q` 得到的对象 id 是某个快照引用的值、或是流水里记过的 `S`、`W`、`T`、`K_h`；`push` 没写 refspec 时，按 `git config --get remote.<远端>.mirror`（为真时同 `--mirror`）与 `git config --get-all remote.<远端>.push` 的 refspec 照上面判。不带 `-n`、`--dry-run` 的 `clean` 另有两种：带 `-x` 或 `-X`（会删被忽略的文件，快照不存它们，见第 2 步）；`-f` 与 `--force` 合计出现两次或以上（短选项连写时按字母数，`-ffd` 算两次；`-ff` 连嵌套仓库一起删，快照存不了一个嵌套仓库）。
- 一次 shell 调用里全部 git 调用的读法（仓库目录、子命令、参数、类别）放在一个函数 `gitInvocations(command, dialect, base)`（`git-snapshot.ts`，本步不导出）。M7 设计 0.3 要它与 `takeSnapshot`、`gitRisk` 给 worker 的 git 与主干前进的核对用（图上 `m3` 2026-10-29T19:14Z 的批注），由 M7 加 `export`，行为不变。

快照（`takeSnapshot(repo, invocation, risk)`）。全部 git 调用用 `execFile('git', args, {cwd: repo, timeout, env})`，不经 shell，参数是数组，命令文字里的引号与特殊字符不会被再解释；`env` 是进程环境加 `LC_ALL=C`、`LANGUAGE=C`、`GIT_TERMINAL_PROMPT=0`（输出不随本机语言变，取远端时不会停在问密码上）；需要文件列表时一律用带 `-z` 的输出（NUL 分隔、不转义、不翻译），不读给人看的输出（M3 (b)）；整个快照的期限 30 秒。

快照用到临时暂存区的地方（下面的 `W` 与「存文件」）都经同一个函数 `tempIndex()`，建在系统临时目录里，不往 git 目录写文件（`.agents/tasks/design-context.md`「Dogfood implementation order and runtime paths」：M3 的运行时文件进项目的 `.llm/`，不进 git 目录；第 5 轮 R5-M1）：`fs.mkdtempSync(path.join(os.tmpdir(), 'glm-hourness-snap-index-'))` 建一个目录，`GIT_INDEX_FILE` 指向其中的 `index`；用完（`write-tree` 之后）和任何一步失败时，都在 `finally` 里 `fs.rmSync(目录, {recursive: true, force: true})`。进程被杀会留下这个目录，里面只有一个暂存区文件，没有恢复要用的东西（快照引用在第 5 步才建），不另做清扫。`refs/hourness/snapshots/*` 与 `hourness-snapshot/*` 是 git 引用，不是文件，仍在仓库里。

1. `git rev-parse --git-common-dir --show-toplevel`。不是仓库（退出码 128）时不存快照、放行（git 自己会失败）。找不到 git（`ENOENT`）时放行，行健康 degraded「找不到 git，快照跳过」。
2. `discard`。被忽略的文件（`.gitignore`、`.git/info/exclude` 与 `core.excludesFile` 认的，例如 `.env`、本仓库的 `.llm/`、`node_modules/`）一律不进快照（M4）：它们常是本机的秘密与可再生的依赖，存成 git 对象之后挂在引用上、不清理，能被推到远端。
   - 改动：`git stash create` 得到 `S`（已跟踪文件与暂存区的改动，暂存格式，不动工作区；工作区干净时为空）。合并冲突没解决时 `stash create` 会失败（暂存区有未合并的条目）；这时用临时暂存区（`tempIndex()`）`git read-tree HEAD`、`git add -u`、`git write-tree`，再 `git commit-tree <树> -p HEAD` 得到 `W`，存的是工作区里已跟踪文件的当前内容（冲突标记也在内）；冲突的三方版本不存（`merge --abort` 之后本来就没了，记在 §10）。这样主 Agent 处理冲突时的 `merge --abort`、`checkout --theirs` 不会因为存不了快照被拒。
   - 写出类另存挡在路上的未跟踪文件（M3 (a)）。目标树：`reset` 取第一个能被 `git rev-parse --verify -q <参数>^{tree}` 解析的参数，没有时为 `HEAD`；`checkout`、`switch` 取分支或提交参数，`checkout <树> -- <路径>` 取那棵树；`restore` 取 `--source` 的值；`read-tree -u` 取它的每一个树参数。挡路的文件 `L_way` 是 `git ls-tree -r -z --name-only <目标树> [-- <路径>…]` 与 `git ls-files -z --others --exclude-standard [-- <路径>…]` 的交集（命令带路径时两边都只看这些路径）。同一交集里被忽略的文件（`git ls-files -z --others --ignored --exclude-standard` 与目标树的交集）不存，也不放行：拒绝，原因 `ignored files in the way`，正路请人挪开（「拒绝」一段）。目标树解析不出（参数含 `$`、`%`、反引号，或歧义）时，`L_way` 取全部未跟踪、未被忽略的文件（带路径时只取这些路径下的），被忽略的挡路文件这时查不出，记在 §10。
   - `clean` 另存要删的文件（M3 (b)）。列表不读 `clean -n` 的文字，按 `clean` 的参数用 `git ls-files -z --others --exclude-standard --directory` 算：`clean` 的每个 `-e <样式>` 换成 `--exclude=<样式>`，路径参数原样放在 `--` 之后；结果里以 `/` 结尾的项是未跟踪的目录：不带 `-d` 时去掉（`clean` 不进未跟踪的目录），带 `-d` 时用 `git ls-files -z --others --exclude-standard -- <目录>` 展开成其中的文件；目录里有 `.git` 的是嵌套仓库，单个 `-f` 时 `clean` 不删它，这里也跳过（`-ff` 已被对外检查拒绝）。得到 `L_clean`。核对一次：`git -c core.quotePath=false clean -n <同样的参数去掉 -f、--force、-i、--interactive>`（环境已是 C 语言），每一行都要以 `Would remove ` 开头，其后是路径（以 `"` 开头时按 git 的 C 风格引号还原），以 `/` 结尾的目录项要在 `L_clean` 里有它下面的文件、或目录里没有文件，其余项要在 `L_clean` 里；有一行不合就拒绝，原因 `the harness's file list and git's differ`。这一步只为发现 `L_clean` 算错，不从它取列表。
   - `worktree remove [--force] <工作树>`：在那个工作树里做同样的「改动」（`git -C <工作树> stash create`，冲突时走 `W`），未跟踪、未被忽略的文件（只有 `--force` 时才会有，`git -C <工作树> ls-files -z --others --exclude-standard`）进 `L_wt`。被忽略的文件不存：`git -C <工作树> ls-files -z --others --ignored --exclude-standard --directory` 列出（`node_modules/` 一类按目录收成一项），前 200 项的路径、总项数与总字节数写进流水与 notice；总字节数按文件逐个 `lstat` 累加，最多 5 秒，到时写 `bytesAtLeast`。所以装过依赖的工作树清理不受下面的上限影响，例行收尾不被拒（`norm-review-floor` 的例外「清理已合进主干的分支与工作树」，`d-main-agent-shell` 的细则「删除前 harness 先存快照」：工作树里没提交的东西照存）。
   - 存文件：要存的文件 `L = L_way ∪ L_clean ∪ L_wt`；总大小超过 200 MB 或超过 20,000 个文件时拒绝（上限只对要存的文件；理由与数在 §11）。否则用临时暂存区（`tempIndex()`，在系统临时目录里）`git read-tree --empty`，`git --literal-pathspecs add -f --pathspec-from-file=- --pathspec-file-nul`（`L` 经标准输入、NUL 分隔，路径里的 `*`、`:` 不被当作样式；git 早于 2.25、没有 `--pathspec-from-file` 时每次 100 个路径放在 `--` 之后），`git write-tree` 得到树 `T`，删掉临时目录。`-f` 只为让 `add` 不因 `.gitignore` 的上层目录规则漏掉文件；`L` 里本来就没有被忽略的文件。
   - 整件跳过（N8）：`S` 为空、没有 `W`、`L` 为空时，不建快照提交、引用与标签，不发 notice，不记流水。`worktree remove` 例外：照样记一行流水（`skipped: 'nothing-to-keep'`，带被忽略文件的路径、个数与大小），删掉的工作树事后查得到删了什么。
3. `history`：`git for-each-ref --format=%(refname)%00%(objectname)%00%(*objectname)` 读 `refs/heads`、`refs/tags`、`refs/remotes`、`refs/stash`；`refs/stash` 存在时 `git log -g --format=%H refs/stash` 读出全部暂存条目；`git rev-parse HEAD` 与 `git symbolic-ref -q HEAD`。`push` 另把远端当前的状态取回：目标分支是 refspec 的目标，没写 refspec 时取 `@{push}`，`--all` 时取全部分支；对每个 `git fetch --no-tags <远端> +<分支>:refs/hourness/snapshots/<id>/remote/<分支>`；远端没有这个分支时跳过；取不回来（网络、权限）时拒绝。
   被移动或删除的引用 `A`（标签与 `K_h` 只看它们）：`branch -D`、`-d`、`-M`、`-m`、`-f` 的那几个分支；`reset`、`rebase`、`commit --amend` 的当前分支（分离头指针时为 `HEAD`）；`tag -d`、`-f` 的那几个标签；`update-ref` 的那个引用；`stash drop` 的那一条、`stash clear` 的全部暂存条目；`push` 强推或删除的那几个远端分支（取回到 `refs/hourness/snapshots/<id>/remote/` 的值）；`filter-branch`、`filter-repo`、`replace`、`reflog expire`、`reflog delete`、`gc --prune`、`prune`、`remote remove` 与参数含 `$`、`%`、反引号的调用认不出是哪几个，`A` 取全部分支、标签与暂存条目。
4. 快照提交 `K`：树是 `T`（没有时用 `git mktree` 读空输入得到的空树），父提交是 `HEAD`、`S` 或 `W`、各引用指向的提交（附注标签取它指向的提交）与暂存条目，去重。父提交超过 200 个时先每 200 个做一个中间提交，`K` 以这些中间提交为父（Windows 的命令行长度上限约 32,000 字符）。提交说明是一句人话的摘要加一段 JSON：快照 id、时间、会话 id、原命令、类别、每个引用当时的值、`S`、`W`、`T` 与恢复办法（超过 64 KB 时 JSON 只写在下面的流水里）。`K` 里有没提交的改动与未跟踪文件，只挂在本机的引用上（第 5 步），对外检查拒绝把它推出去。
   历史提交 `K_h`（只在要打标签时建，M4、N8）：树是空树，父提交只是 `A` 里各引用的原值，不含 `S`、`W`、`T`；提交说明同上，但不带改动与文件。要打标签的条件：`A` 里有一个原值在命令之后会变得只靠 reflog 可达，即 `git for-each-ref --contains=<原值> refs/heads refs/tags refs/remotes refs/stash` 列出的引用全在 `A` 里（命令之后没有别的引用还指着它）；或者原值已经推送过，即它被某个 `refs/remotes/*` 包含、而命令要改写它（`reset`、`rebase`、`commit --amend`、强推）。两条都不成立时（例如 `branch -d` 一个已合入的分支、`reset` 到的位置之前的提交还在另一个分支上）不建 `K_h`、不打标签，旧值照样从 `K` 可达。暂存条目的原值本身含没提交的改动：`stash drop`、`stash clear` 的条目只进 `K` 的父提交，不进 `K_h`（它们是 `discard` 一类的东西，找回靠 `K` 与流水）。
5. 引用：`git update-ref refs/hourness/snapshots/<id> <K>`，`<id>` 为 UTC 时间 `yyyymmddThhmmssZ` 加 4 位随机十六进制。建了 `K_h` 时另打轻量标签 `git tag hourness-snapshot/<id> <K_h>`：改写历史之后人在任何 git 界面的标签列表里都找得到旧的提交，而标签指向的东西里没有没提交的改动与文件。用轻量标签，`git push --follow-tags` 不会带上它；`git push --tags` 与按名推它都被对外检查拒绝。
6. 流水：追加一行到 `<项目根>/.llm/snapshots.jsonl`（定位与排除见本条末尾），内容 `{id, at, sessionId, agentId, command, subcommand, risk, repo: <git-common-dir>, rootFrom: 'session' | 'repo', ref, tag?, history?: K_h, head: {sha, branch?}, stash?: S, worktree?: W, files?: {tree: T, count, inTheWay?, cleaned?, worktree?}, ignored?: {paths, count, bytes?, bytesAtLeast?}, refs: [{name, sha}], moved: [name], remote?: [{remote, branch, ref}], restore: string[], skipped?: 'nothing-to-keep'}`（`files` 的三个计数对应 `L_way`、`L_clean`、`L_wt`；`ignored` 只在 `worktree remove` 时有）。流水放在项目的 `.llm/`，不放在 git 目录里：M3 的运行时文件照 `d-rules-in-repo` 进项目的 `.llm/`（`.agents/tasks/design-context.md`「Dogfood implementation order and runtime paths」，编排方对 M7 第 4 轮 N1 的裁定；图上 `m3` 2026-10-30T10:56Z 的批注要求并进 0.5；第 5 轮 R5-M1）。
   - 项目根：`projectOf(<会话的工作目录>)`（`src/data/project-root.ts`，只读文件、不起 git 进程；规则板设计 0.10 §7.3 与 M5 设计 §5.5 的同一个函数，返回 `{root, git}`，没有项目时返回 `undefined`，谁先实现谁建）。工作目录取 `baseFor`，同上面「仓库目录」。不取被快照的仓库的 toplevel：同一个项目的主检出和 `.worktrees/*` 因此共用一份流水，恢复时一处就能列全；`repo` 字段记这一次是哪个仓库的快照，所以主 Agent 用 `-C` 对别的仓库做的快照也进这一份，用 `repo` 区分。
   - 会话的工作目录不在任何仓库里（返回 `undefined`，或返回的 `git` 为假）时，改取 `projectOf(<被快照的仓库的 toplevel>)`，这一行的 `rootFrom` 写 `repo`（平时写 `session`），流水里因此看得出它为什么落在那个项目；两个都找不到 `.git` 时按下面的「写流水失败」处理，不在任意目录里建 `.llm/`。
   - 排除：写之前确认 `.llm/` 在、`.llm/.gitignore` 在，不在就建，用 `wx` 写内容为 `*\n` 的文件，已在就不动（指标流水同一做法，指标流水设计 `.agents/tasks/metrics/design.md` §3.3 第 4 条）。流水在工作树里，不自己排除，就会被 `git clean -fd` 当未跟踪文件删掉，而 `clean` 正是本节要保护的命令之一；本仓库的 `.llm/` 本来就被忽略，多这一个文件无害。别的设计都把整个 `.llm/` 当不进 git 的运行时目录（指标流水 §3.3、规则板 0.10 §7.1、循环板 0.6 §9、M5 §2.2 与 §5.5、M7 0.5 §2.1），所以 `.llm/` 根上的 `.gitignore` 与它们不冲突；M5 §2.2 在 `/.llm/` 没被忽略时另追加 `.git/info/exclude`，两种做法并存时谁先到谁建、后到的见已忽略就不动。
   - 写法：一次 `appendFile`（`O_APPEND`）写一整行，不加锁。同一时刻写它的只有主 Agent 那一个会话（`d-one-main-agent`）；子 agent 的快照属于 M7（§10）。流水是追溯用的索引，找回靠引用：流水不在或读不了时 `git for-each-ref refs/hourness/snapshots` 照样列出这个仓库的全部快照。
   - 写流水失败（读不到项目根、`.llm/` 建不了、磁盘错误）时快照引用已在，仍可恢复：放行，行健康 degraded「快照 <id> 已存，记录没写上：<原因>」。
7. 告诉主 Agent：`inject` 一条 notice（来源 `glm-git-snapshot`，下一步收到）：`[git 快照] 执行「<命令>」之前存了快照 <id>（refs/hourness/snapshots/<id><，标签 hourness-snapshot/<id>>）。要撤回：` 后接适用的几行：没提交的改动 `git stash apply <S>`（冲突时的退路是 `git restore --source=<W> --worktree -- <路径>`）；删掉或被盖掉的未跟踪文件 `git restore --source=<K> --worktree -- <路径>`（或 `.` 全部；被删的工作树先 `git worktree add <路径> <分支>` 再在里面 restore）；被移动或删除的分支与引用 `git update-ref <引用> <原值>`、`git branch <名字> <原值>`；被删的暂存条目 `git stash store -m "<说明>" <sha>`；远端 `git push --force-with-lease <远端> refs/hourness/snapshots/<id>/remote/<分支>:<分支>`（这一条推的是远端原来的提交，源是快照引用下的 `remote/`，对外检查对它放行：它的值就是远端原来就有的提交）。`worktree remove` 另加一行 `被忽略的文件不在快照里，删掉之后不恢复：<个数> 项、<大小>，例如 <前 3 个路径>；装依赖一类的可以重新生成`。恢复全部是 git 命令，主 Agent 自己能做，不用写文件的工具。
8. `next()`，命令照常执行。

拒绝。对 git 只有两类拒绝，都在 `tools/pre-execute`，规则 id `git-snapshot`，进违规流水：一是存不了快照：第 1 步之外任何一步失败或超时，或要存的文件超过上限、`push` 取不回远端、`cd` 的目标认不出、挡路的文件里有被忽略的、`clean` 的列表对不上；二是对外检查命中：快照会被推出本机，或 `clean` 要删快照不存的被忽略文件、嵌套仓库。纠偏四段：事实 `The harness could not save a snapshot before "<command>": <reason>.`（第二类为 `"<command>" would <push the harness's snapshots off this machine | delete ignored files the snapshot does not keep | delete nested repositories>.`）；越界 `Git commands that can lose uncommitted work or rewrite history run after the harness has saved a copy it can restore; the copies stay on this machine.`；正路按原因给：`Narrow the command (fewer paths) so it removes less than 200 MB and 20,000 files`、`Retry when the remote is reachable`、`Run git with -C <literal path>`、`Tell the human which ignored files are in the way: <前 5 个路径>; they can move them`、`Push branches and tags by name; snapshot refs stay on this machine.`、`Run git clean without -x or -X; ignored files stay.`、`Run git clean with a single -f; nested repositories stay.`、其余 `Retry; if it fails again, tell the human the reason`；例外 `The human can run the command in their own terminal.`。放行一条存不了快照的命令，丢掉的东西就没有恢复办法；放行一条把快照推出去的命令，没提交的改动与本机文件就到了远端，收不回来（`docs/DEVELOPMENT.md` §1.1 第二类的「丢数据」与「对外的动作」）。理由与上限记在 §11。

不做：快照不自动清理（`refs/hourness/snapshots/*`、`hourness-snapshot/*` 标签与流水 `.llm/snapshots.jsonl` 留到人删，`git for-each-ref refs/hourness/snapshots` 列出全部）；不另做恢复命令；被忽略的文件不进快照（第 2 步），`worktree remove` 删掉的被忽略文件只记路径、个数与大小。见 §10。

### 2.6 `/wish` 入口与强一档模型的提醒（`m3-1` 验收第 4 条）

按 plain-ui §7.5.2–§7.5.5 与 `mockup-wish.svg` 场景 ①–⑤，M3 只做其中属于 `/wish` 的部分（plain-ui 第 4 轮裁定 P4-02：`/wish` 入口以 M3 为准）；上手页、「第一次用？」一行、没有项目图时的卡片、面板首页里的一句属于 plain-ui。全部在编排层包的客户端（`6134c83` 之后客户端行叫 `dsh-hourness`，产物在 `packages/hourness/ui/`，入口 `ui/src/hourness-client.tsx`），第 11 步。这里的「卡片」是 DSH 开场画面上的停靠组件，不是问人的问答卡，`d-chat-not-cards` 不涉及它。

- 开场卡片 `WishCard`：`ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({name: 'conversation.input.dock', id: 'hourness-wish', order: 40, label: '交给主 Agent', inject: (sessionId) => ({ sessionId })}, WishCard))`，外层 `ctx.effect` 同流程条。这个槽在开场画面里位于工作区行与输入框之间（conversation client.js:17901–17907）。组件每次渲染判断，按下面三种情形之一显示，都不成立时返回 `null`：
  1. 完整卡片：会话是空白的（标准 prop `useSession` 的 `blank` 为真、`promptAttempted` 与 `running` 为假；拿不到时退到 `sessions.list` 的 `byId[sessionId].blank`）；本会话不是主 Agent（`mainAgentActive(values)` 为假）；有项目图（`holdSource`）且 `/wish` 已注册（`remote.commands.list(sessionId)` 里有 `wish`，每个会话读一次，失败时会话快照变化后再读一次）。文字照 `mockup-wish.svg` ①，只改黄字：标题「把这个工作区交给主 Agent」；正文「说一句你想做的。主 Agent 先问清楚、出方案给你批，再分给子 agent 去做；它自己不写代码。」；主按钮「写一句你想做的」；次按钮「接着推进现有项目」（图上有未关闭的目标时）；黄字带图标「主 Agent 用强一点的模型」（N1：后半句「子 agent 用便宜的就行」删去，子 agent 的模型由主 Agent 派活时选，`d-main-agent-models`）；灰字「命令是 /wish，随时 /wish off 退出。」；卡片最底部放面板设计导出的 `FirstVisitLine`（`ui/src/guide/FirstVisitLine.tsx`，面板设计 0.6 §6.5、§11 M3 第 1 条；N4），显示与否由它自己判，M3 只放位置。面板设计第 1 步还没合入时不放，L2 用例按「组件在时放在最底部」写。
  2. 一行：会话仍是空白的、有项目图，而本会话已是主 Agent。这是人点了「接着推进现有项目」之后的样子：`/wish` 不带话时只 `inject`、不开回合，会话可能仍停在开场画面（conversation client.js:17378–17379、17608–17610），而 `conversation.composer.dock` 只在非开场画面渲染（:19343–19344）。这时卡片换成一行「这个会话的 agent 是主 Agent」与按钮「退出主 Agent（/wish off）」。人发出第一句话后会话不再空白，这一行消失，退出方式由输入框下方的「主 Agent」按钮接手。
  3. 其余情形不显示。
  已有主 Agent 在别的会话时，新会话照样显示完整卡片；点了之后由 `/wish` 的回复说主 Agent 在哪、怎样移过来（§2.4）。客户端不读持有者记录。
- 黄字不带模型名：plain-ui 0.4 正文 §7.5.2 写「（如 GLM-5.3）」，草图没有括号。按草图：编排层包对所有模型生效，不点名某个模型（`hourness` 目标的非目标「不含任何模型的方言」）。
- 输入框下方的按钮 `WishPill`：`conversation.composer.dock`，id `hourness-wish`，order 160。普通会话、有项目图、`/wish` 已注册时写「交给主 Agent」，点开小弹层（`mockup-wish.svg` ②：一句说明、命令、黄字「主 Agent 用强一点的模型」、两个按钮）；主 Agent 会话里写「主 Agent」，点开「这个会话的 agent 是这个项目的主 Agent：按项目图推进，不写文件。进度在右边的项目图里。」与「退出主 Agent（/wish off）」。那一排窄于 520 px（`closest('[data-composer-dock]')` 的宽度，`ResizeObserver`）时「交给主 Agent」写「/wish」，「主 Agent」不变。
- 按钮做什么（plain-ui §7.5.3）：「写一句你想做的」在输入框为空时经标准 prop `inputActions.setDraft` 写入 `/wish ` 并聚焦，输入框有字时不改并提示「输入框里还有没发出的字」；拿不到 `inputActions` 或 `useInput` 时不执行命令，换成一行「在输入框打 /wish，后面跟一句你想做的」与「复制 /wish」（`writeClipboard`）。「接着推进现有项目」与「退出主 Agent」经 `remote.commands.execute` 执行 `/wish`、`/wish off`，都是人的点击。
- 流程条：order 由 0.4 的 20 改为 30（DSH 排队条是 20，conversation client.js:17269，plain-ui §12 M3 第 5 条），开场卡片 40。`flowBarText` 多一个输入 `cheapModel: boolean`：主 Agent 最近一步的模型（`graphLive` 的 `model`，`src/graph/live.ts`:41）属于便宜档时，末尾另起一行黄字「现在是 <模型>；主 Agent 建议换强一点的模型」与「这次就用它」（按会话记在内存里，收起到重载为止）。便宜档按 plain-ui §7.5.5：模型 id 转小写，按 `[-_./:\s]` 切词，有一个词是 `flash`、`mini`、`lite`、`haiku`、`small`、`nano` 之一；认不出的不提醒。纯函数 `isCheapModel(id)` 放在 `ui/src/flow/model.ts`。0.4 的「主 Agent · 读不到阶段（现场投影未注册）」改为「主 Agent · 读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用）」（§2.8）。流程条的「等你确认 / 等你批准 / 等你拍板」照 0.4，含义改为「主 Agent 在对话里等你回话」。
- `/wish` 的成功回复（0.4 §3.1.1 表里「已让这个会话的 agent 当主 Agent…」两行与 §2.4 的 `here`、接管几行）末尾加「主 Agent 建议用强一点的模型」。第 3 步。
- `docs/ORCHESTRATION.md` §3.5 补两句（第 3 步）：主 Agent 用强一档的模型，在 `/wish` 的回复、入口与流程条上提醒人，插件不替人换模型（`docs/CHARTER.md` §6）；子 agent 的模型由主 Agent 派活时选并记理由（`d-main-agent-models`，M7）。DSH 的委派在请求不覆盖时让子 agent 沿用父 agent 的 provider 与模型（`resolveChildAgentOptions`：「the parent's provider/model … unless the request overrides them」，subagent:302–305〔实读〕）；subagent 工具的 `modelSelectionSettings` 打开时，模型能在每次调用里选 `provider`、`model`、`reasoning_effort`，限于允许清单（tool-subagent:42–66、311–314、360–374〔实读〕，N5）。M3 不改，M7 设计派发选模型时先评估这项现成能力。
- 没有项目图的工作区里，M3 的入口什么都不显示（`/wish` 在那里报「还没有项目图」）。`m3-1` 验收第 4 条在有项目图的工作区里核对；没有图时的说明卡属于 plain-ui 的引导（§7.8）。

### 2.7 人设设置位与汇报细度改名（`m3-main-persona`）

与 0.2 §2.6 相同，只有「主 Agent」按 §2.4 判，注入的位置与写法按 3.17.1 重核过（第 3 轮 M6）。全文照录如下，免得读两份。

设置位：

- 设计行（`glm-hourness/design`）的配置加一项（0.4 §2.1「设计行只有与图行同形的 `home`、`fs`」改为加上 `persona`）：`persona: {name: string, text: string}`，`name` 默认「主 Agent」，`text` 默认空串。Schema 经 `src/shared/schemastery.ts` 写，插件管理器里能改（验收第 3 条）；`text` 用多行文本框，写法（`role` 一类的注解，`src/shared/schemastery.ts`:466）在实现时按本仓库那份子集核对〔推断〕，L4 截图。
- 插件只给设置位，`text` 是用户自己的配置（`docs/CHARTER.md` 非目标「人设与个人习惯不进插件」）。
- `name` 的规整：去掉首尾空白，内部的换行与连续空白换成一个空格，然后按 40 码点截断；截断时告警一次（行日志），规整后为空时用「主 Agent」。`text`：去掉首尾空白后为空就不加这一节；超过 4,000 码点时不加，行健康 degraded「人设超过 4000 字符，没有加」。

注入：

- 公共库新文件 `src/shared/output-style.ts`，只放契约常量 `OUTPUT_STYLE_SECTION = 'hourness:output-style'` 与说明（两个包都编进去，同 `tool-names.ts`、`dialect.ts`）。
- 设计行的 `roleFace`（§2.1，不带 `prepend`，在里层）在本步是主 Agent、`persona.text` 非空时，在 `sections` 末尾追加一节 `{name: OUTPUT_STYLE_SECTION, text, interpolate: false}`。`text` 照 3.17.1 的 `n8o`（zcode.cjs @12945672：`# Output Style: ${name}`、一个换行、风格文字去掉首尾空白，中间没有空行）拼成 `# Output Style: <name>`、换行、用户的文字，然后空一行，再加插件自己的一句范围说明：`This style applies to your replies to the human only. Text you put into tool calls (graph nodes, briefs for subagents) and anything written to files stays plain.` 范围说明是本项目加的，不是 ZCode 的文字，写进逐字档案的不跟一节（下面「GLM 路由」末段）。
- 人设与四行格式的关系：人设管主 Agent 回话的语气；`propose_to_human` 返回的四行由 harness 生成、原样给人看（§3.4），人设的话不进这四行；范围说明一句已经写了「工具调用里的文字保持朴素」。
- 不是主 Agent 的会话（普通会话、子会话、审查者、主 Agent 移走之后的原会话）没有这一节。只给主 Agent 的理由：主 Agent 没有写工具（§2.1），人设的话落不进代码与注释；普通会话直接写代码，人设会落进文件（`m3-main-persona` 正文）。
- GLM 路由（GLM 包，`src/glm-prompt/assembly.ts` `rewriteDialectSections`）。3.17.1 的事实（`d-zcode-3171` 要按 3.17.1 重核，第 3 轮 M6）：系统提示词的组装（zcode.cjs @12850435 一带）没有 Output Style 一节；有风格时只换身份节的开头句，`fBa`（@12791732）在风格激活时用 `pBa`（@12792218），否则用 `dBa`；风格正文由 `n8o` 生成，作为上下文条目 `output_style_instructions` 只在主回合下发（@13142888，`taskType` 为 `main_turn` 时）；另有每回合一条 `output_style` 条目，正文是 `r8o` 的 `${name} output style is active. Remember to follow the specific guidelines for this style.`（@13451285）。`docs/reference/zcode-capabilities.md`:374 记的「Environment、Output Style、Context management」是 3.16.x 的次序。本项目的取舍：人设一节仍在系统提示词里（`m3-main-persona` 验收第 1 条「主 Agent 会话的系统提示词带人设一节」；人设在会话内不变，属于提示词清点报告定的「静态内容放系统提示词的固定位置」，`question-31` C），开头句照 3.17.1 换成 `IDENTITY_OPENING_WITH_STYLE`（`src/glm-prompt/verbatim.ts`:15–16，已随 `zcode-3171-follow` 是 `pBa` 的原文，逐字门禁 `scripts/check-verbatim.mjs`:244 钉住）。做法：本次组装的 `sections` 里有 `OUTPUT_STYLE_SECTION` 一节时，身份节用 `buildIdentitySection(true, …)`，并把这一节移到 `glm:context-management` 之前，也就是 Environment、会话指引、Memory 与汇报细度各节之后（3.17.1 在这里没有节；选这里是因为 3.16.3 在这里，且这一节在会话内不变，放在动态内容之前不破坏提示词缓存）；方言节里没有 `glm:context-management`（start-plan 档）时，放在最后一个方言节之后。没有这一节时与今天一样。`installDialect` 今天在安装时按会话算一次 `sections`（`src/glm-prompt/index.ts`:200–202，`dialectSections(false, …)`），改为两份身份节（有无风格）都在安装时算好，按组装时有没有这一节选一份。不跟 3.17.1 的三处写进 `docs/reference/zcode-verbatim.md` 新加的一节「不跟 3.17.1 的地方」，每处一句理由，请编排方同意（`zcode-3171-follow` 验收第 1 条的做法）：(1) 风格正文放在系统提示词的节里，不作为主回合的上下文条目（理由：验收第 1 条要系统提示词，DSH 的节在每一步都在，不只主回合）；(2) 不加 `r8o` 的每回合提醒（理由：正文每一步都在系统提示词里，3.17.1 的提醒是为只在主回合下发的条目补的，这里加它只多花每回合的 token）；(3) 正文后面多一句范围说明（理由：只让人设管对人说的话，`m3-main-persona` 验收第 2 条）。编排方不同意时，只改 GLM 包这一段与逐字档案，设计行不变。
- 其他路由：这一节原样留在 `roleFace` 追加的位置，不换开头句。
- 子 agent 不带：`isMainAgent` 对 `origin: 'subagent'` 为假。子 agent 写的文件里不出现人设用语（验收第 2 条）在提示词层面由此保证；模型行为在 L4 用标记词核对（第 12 步（b））。用户自己 `~/.dsh/AGENTS.md` 里的人设所有 agent 都读得到，那是用户配置，插件不动。

改名：

- GLM 包 `glm-prompt` 行的配置 `persona`（汇报细度，`concise`、`balanced`、`detailed`）改名 `reportingDepth`；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts`，`PERSONA_LEVELS`、`PersonaLevel`、`personaSection`、`PERSONA_SECTION_NAME`、`isPersonaLevel` 改为 `REPORTING_DEPTHS`、`ReportingDepth`、`reportingDepthSection`、`REPORTING_DEPTH_SECTION`、`isReportingDepth`；节名 `glm:persona` 改为 `glm:reporting-depth`；`GlmPromptConfig` 与 `dialectSections` 的参数同改。模型看到的文字（`# Reporting Depth` 一节的正文）一个字不改。`packages/glm/locale/glm-prompt/` 的设置页说明随键名改。
- 旧配置照读：用户桌面版 profile 的 `glm-prompt` 行今天写着 `persona: balanced`（`~/.dsh/profiles/desktop/cordis.patch.yml`:57〔实读，只读〕），本仓库不改用户 profile。cordis 在激活前用插件导出的 `Config` 规整配置（cordis lib/index.js:956–961、:1631〔实读〕）；本仓库的 schemastery 在值缺席时填默认值（`src/shared/schemastery.ts`:535–544），对象只留有值或原本就有的键（:814–823）。所以：
  - Schema 里 `reportingDepth` 与已弃用的 `persona` 都不带默认值（`reportingDepth` 的说明写「缺省为 balanced」，`persona` 的说明写「已改名为 reportingDepth，只为读旧配置」）；规整之后哪个键在，就是用户写了哪个键。
  - `apply` 取 `config.reportingDepth ?? config.persona ?? 'balanced'`。
  - 只有 `persona` 时告警一次「glm-prompt 的 persona 已改名为 reportingDepth，这次按旧键生效」，行健康说明写同一句；两者都有且不同时用 `reportingDepth`，告警一次「persona 与 reportingDepth 不同，按 reportingDepth」；两者都有且相同时不告警，行健康说明写「旧键 persona 可以删掉」；两者都没有时不告警。
  - 插件管理器里不带默认值的单选框怎样显示〔推断〕，L4 截图（第 12 步（b）第 8 项）。
- `tests/profile-shape.spec.ts` 里的 `persona:` 是 YAML 解析的夹具，不改。
- 汇报细度并进 Output Style、子 agent 不带汇报细度（清点报告 Q2 C 后半、Q5 B）改所有 GLM 会话的提示词，不在 `m3-main-persona` 的验收里，本次不做（§9 第 9 条）。

ZCode 基线 3.17.1（`d-zcode-3171`）：`zcode-3171-follow` 已合入 main（`46e1884`），两种身份开头句已是 3.17.1 的 `pBa`、`dBa`。本节与 L2 只按常量名写（`IDENTITY_OPENING_WITH_STYLE`、`IDENTITY_OPENING_PLAIN`、`buildIdentitySection`），不写字面；0.3 写的「与 `wf_e48380fb20a69493` 同改 `src/glm-prompt/`、后合入的一方 rebase」不再适用，本步直接建在带 3.17.1 的 main 上。

### 2.8 换词表与例题（`d-plain-questions`）

人读不懂问题里的「验收」「标定」「补遗」「改写验收语句」（2026-10-29），并要求每道题先交代前因后果。`d-plain-questions` 定：给人的问题不用人没学过的词；凡是让模型给人写题的地方放一道完整的好题与换词表；harness 的写法检查在问题字段里查这些词。`d-chat-not-cards` 之后「题」是聊天里的四行提议，人在 2026-10-30 自己给了一道（§3.1）。人给它是给格式：17:23Z 至 17:27Z 的三条批注都在讲排版；它的内容（高峰时不再提醒模型）随后被人否掉，人定的是 `d-peak-mode`（17:33Z、17:45Z）：高峰照旧提醒模型，另加人选的三档，默认少做，主 Agent 每一步从 harness 的提醒里知道是不是高峰与哪一档。例题进每个主 Agent 的系统提示词，读它的正是被高峰提醒的那个 agent，所以例题保留人给的格式，内容取已定的高峰模式（第 3 轮 M7）。

0.4 把它写成「高峰时段主 Agent 怎么干活」，推荐「少开几个，不做重活」，不做「高峰全停」。之后人定了 `d-main-agent-peak-exempt`（2026-10-30T05:36Z，relay「主Agent应该不受高峰影响，随时回复的」）：高峰模式的三档都不管主 Agent 自己，它任何一档都照常回话、照常用工具；模式只管它派出去的子 agent（少做限制并发上限，不做排队到高峰结束）与自报的重活脚本。读 0.4 例题的正是被豁免的这个 agent，照字面会以为少做档要它自己少干、不做档要它自己停下，与人刚定的相反（第 4 轮 M1）。0.5 的例题保留格式，内容换成这条决定在产品里的样子：说的是派出去的活怎么排，不做一行写明主 Agent 照常回话。

为什么选这个题材（`d-agent-examples`：示范过与真实输入同样的检查、用与练习题不相干的领域、只讲已经定了的事、防止照抄内容）：

- 已经定了：题里每一句都是 `d-peak-mode` 与 `d-main-agent-peak-exempt` 已经写在图上的内容。少做（默认档）是减少并发的 worker、不做重活；不做档的 GLM 活排队、高峰结束后接着做；主 Agent 不受模式管。模型照抄它，不会把一个被否掉或还没定的做法推给人。
- 不撞练习题：访谈的练习题是记账小工具（`interview-expense-log`，第 8 步），另两道练习题是修 CSV 引号（`bugfix-csv-quotes`）和解析时长（`feature-parse-duration`）。例题讲的是 GLM 高峰计价下怎样排派出去的活，没有账目、金额、类别、月份、引号、时长一类的词，也不是访谈里「想要什么」「怎样算做成」的题材。标定里的模型如果照抄例题的内容，会在给人的文字里留下「高峰」「派出去的活」这类与记账无关的话，第 12 步（a）在标定里数这样的次数（应为 0）。
- 不描述主 Agent 自己的行为：题目是「派出去的活」，推荐与疑问说的是派几个、派不派重活，不做一行写明主 Agent 照常回话。读它的主 Agent 学到的只有版式，以及高峰模式不挡它自己。
- 只示范版式，不当成要问的事：说明里加一句 `(the example only shows the layout; its matter is already settled)`（下面的 `PLAIN_QUESTION_GUIDE`，意思是「例子只示范版式，里面的事已经定了」），因为高峰档位是人自己选的（规则板上选，或在对话里说），主 Agent 没有要为它提议的理由。
- 过与真实输入同样的检查：L2 把例题的五个字段交给 `proposalLineRefusal`，交给 `plainWordsIn`，再用 `propose_to_human` 的参数组成一张提议式待决交给真实的图引擎、在写法检查第二阶段的常量下提一次（第 3、6 步；面板设计 0.7 §5.3、§11 第 6c 条）。规则或常量一改，例题就跟着失败。
- 例题跟着决定走：人再改高峰模式时，只改 `PLAIN_QUESTION_EXAMPLE` 一处；L2 另钉两句，防止改回去：题目不含「主 Agent」，不做一行含「主 Agent 照常回你话」（`d-main-agent-peak-exempt`）。

M3 管其中的身份文本、`propose_to_human` 的说明与 harness 自己写给人看的字串。

一处定义：新模块 `src/graph/plain-question.ts`（纯文字与纯函数，不用 Node 内置模块；放在图目录，因为图工具的说明、plain-ui 的写法检查与面板都要用它）。谁先合入谁建，另一方导入：面板设计的 `jargon` 规则（面板设计 0.6 §5.3，`src/graph/plain.ts`）从这里读 `PLAIN_WORDS`，不另写一份（N3）。

- `PLAIN_WORDS`：换词表，按面板设计 `jargon` 的词补齐，五项：

  | `avoid` | `say` |
  | --- | --- |
  | `验收`、`acceptance` | 怎样算做完（目标一级说「怎样算做成」，与需求卡的「成功（怎样算做成）」一致） |
  | `标定`、`calibration` | 练习题（固定的几道小项目，系统自己做一遍、由脚本代人回话，用来查改动有没有把系统改坏） |
  | `门禁`、`gate` | 合入前的检查 |
  | `投影`、`projection` | 每一步给 agent 的项目摘要 |
  | `补遗`、`附录`、`addendum` | 说清它是什么 |

- `PLAIN_QUESTION_EXAMPLE`：按提议式待决的字段存（§3.3）：`{title: '高峰时段派出去的活怎么排', background: '高峰时 GLM **更费积分**，系统每步都会提醒', proposal: '默认**少做**：少派几个，不派重活', doubt: '要是**赶工期**，你可以改成无影响', notTaken: '**派活全排队**，高峰后再开；主 Agent 照常回你话'}`。格式是人给的（题目一段，四行各一段，标签不加粗，每行一处加粗、不以标签开头）；内容取已定的高峰模式，说的是主 Agent 派出去的活（`d-peak-mode`、`d-main-agent-peak-exempt`，题材为什么安全见上）：推荐一行是人定的默认档少做，不做一行是不做档（高峰里派活排队、高峰后接着做）加一句主 Agent 任何一档都照常回话。背景一行沿用人给的那一句，仍然成立：高峰时 GLM 更费积分、系统每一步都提醒。实测（去掉 `**` 之后的码点）：题目 12，背景 21、推荐 14、疑问 14、不做 25，加粗各 4、2、3、5 个码点，合 §3.3 的规则与 `PLAIN_LIMITS`（背景不超过 `PLAIN_LIMITS.background`，其余三行不超过 40）。
- `PLAIN_QUESTION_GUIDE`：由上面两个常量与 `renderProposal`（§3.3）生成的英文说明，上限 1,000 字符。参考文本（实测 648 字符；0.4 的 573 加上例题的改动与「只示范版式」一句）：

```text
Whatever you say to the human is in plain words. A proposal from propose_to_human reads like this (the example only shows the layout; its matter is already settled), each line its own paragraph and a few key words of each line in bold:
① 高峰时段派出去的活怎么排
背景：高峰时 GLM **更费积分**，系统每步都会提醒
推荐：默认**少做**：少派几个，不派重活
疑问：要是**赶工期**，你可以改成无影响
不做：**派活全排队**，高峰后再开；主 Agent 照常回你话
Plain words for the human: 怎样算做完 (for a goal: 怎样算做成), not 验收 or acceptance; 练习题, not 标定 or calibration (fixed small projects the system runs by itself to check nothing broke); 合入前的检查, not 门禁 or gate; 每一步给 agent 的项目摘要, not 投影 or projection; never 补遗, 附录 or addendum: say what the document is.
```

- `plainWordsIn(text): string[]`：返回 `text` 里出现的 `avoid` 词（中文按子串，英文按词边界、不分大小写）。用处：各步的单测查 harness 写给人看的字串；第 12 步（a）在标定里数主 Agent 写给人的文字里出现的次数；plain-ui 的写法检查直接调用。

落在哪里：

| 位置 | 内容 | 步 |
| --- | --- | --- |
| `src/graph/plain-question.ts` 与 `tests/plain-question.spec.ts` | `PLAIN_WORDS`、`PLAIN_QUESTION_EXAMPLE`、`PLAIN_QUESTION_GUIDE`、`plainWordsIn`；单测：说明不超过 1,000 字符、含五个 `say` 与每个 `avoid`、含「只示范版式」那一句（英文 `the example only shows the layout`）；例题各字段 `plainWordsIn` 为空；例题的题目不含「主 Agent」、不做一行含「主 Agent 照常回你话」（防止改回 0.4 的写法，`d-main-agent-peak-exempt`）；例题各字段的码点数从常量算出、合 `PLAIN_LIMITS` 与 §3.3 的上限；`plainWordsIn` 的中文子串、英文词边界（`gateway` 不算 `gate`）、大小写 | 3（例题按 §3.3 的规则过 `proposalLineRefusal`、以及组成提议式待决交给真实引擎在第二阶段常量下通过的两例在第 6 步加） |
| 身份节第二部分 | 原样引用（§2.2） | 3 |
| `propose_to_human` 的说明 | 原样引用（§3.4） | 6 |
| `/wish` 的回复、错误与行健康说明 | 0.4 §3.1.1「主 Agent 模式要用会话投影服务，这个组合里没有」改为「主 Agent 模式要用 DSH 的会话状态服务（sessionProjections），这个组合里没有」；0.4 §6.2 的 degraded「主 Agent 模式要会话投影服务」改为「主 Agent 模式要会话状态服务（sessionProjections）」；§2.4 新增的几句 | 3 |
| 五栏门禁的标签（`src/graph/stage.ts`） | `目标（验收条件）` 改为 `目标（怎样算做成）`；`任务「<标题>」的验收条件` 改为 `任务「<标题>」怎样算做完` | 9 |
| 流程条 | 「读不到阶段（现场投影未注册）」改写（§2.6） | 11 |
| 标定指标 | 主 Agent 写给人的文字里 `plainWordsIn` 命中的次数 | 12（a） |

各步的单测对 harness 写给人看的字串（回复、错误、行健康说明、notice、批注的固定部分、按钮与流程条的固定文字、`renderProposal` 的标签）调 `plainWordsIn`，结果为空。模型写给人的文字 M3 不在运行时拦：拦截属于 plain-ui 的写法检查，M3 在标定里数。

### 2.9 待决的背景字段（M2）

编排方的裁定（2026-10-30，按 plain-ui 第 4 轮 P4-01；`.agents/tasks/design-context.md`「Seam rulings between designs」：「Question background field and limit: owned by plain-ui (one line, at most 60 code points after removing bold marks)」）：问题的背景字段与上限由面板设计定，M3 照用。面板设计现行 0.6 §5.2：待决节点的字段 `background`，非空白、不含换行，去掉加粗记号 `**` 之后不超过 `PLAIN_LIMITS.background` 个码点（0.6 为 60；0.4 的 150 已作废，第 3 轮 M8）；可以带 `**…**`，提议式待决的背景恰好一处加粗由 M3 的 `proposalLineRefusal` 查；决定者是人的待决必须带（面板设计的写法检查第一阶段警告、第二阶段拒绝）；写出顺序紧跟 `title`；面板只读这个字段，不从正文拆。

M3 的规则：

- M3 唯一写人定待决的地方是 `propose_to_human` 的 `question` 一种（§3.4）。四行里的「背景」就写进 `background` 字段，不写进 `body`；它的长度与一行的要求只读 `PLAIN_LIMITS.background`，不另设数值。提议式待决对四行另有一条「恰好一处加粗」的要求（§3.3），这是四行格式的规则，不改 `background` 的形状。
- 字段由引擎认：今天引擎拒绝未知字段（`src/graph/format.ts`:90–92）。面板设计第 1 步加这个字段；M3 第 6 步先于它合入时，由第 6 步按面板设计当时的 §5.2 加：`schema.ts` 的 `GraphNode.background?: string` 与 `PLAIN_LIMITS`（放在 `CARD_LIMITS` 旁，数值照面板设计当时的 §5.2 抄；0.6 为 `{ title: 40, why: 80, background: 60 }`，`background` 去掉 `**` 再数），`format.ts` 只在 `type: 'question'` 上接受它（写出顺序紧跟 `title`），提议式待决必须带它（§3.3），不加面板设计的分阶段检查。面板设计后合入时直接用这两处；它以后改数值只改这个常量，M3 的代码与测试只读常量，不写字面数（L2 的「超长」用例用 `PLAIN_LIMITS.background + 1` 个码点构造）。
- 例题与说明里的背景写法同一条规则（§2.8）。

## 3. 问人改成聊天（`d-chat-not-cards`）

### 3.1 人定了什么

`d-chat-not-cards`（人定，2026-10-29T17:01Z，relay「我是要改产品的，而且聊天不仅是不给问答卡，是连选项都没有的那种，就彻底回归到我们的设计循环那里。你提几点和方案，我补充或者同意这种。」）适用于产品里主 Agent 与人的全部交流。之后的批注逐步定下细则，后一条取代前一条：

- 17:08Z：人对编排方的五点落地方案回「没问题」（见下表）。
- 17:16Z：人纠正「我明明说的是选择题我觉得不轻松，看起来好累，不能根据我的直觉想还得考虑你说的方案的可能性」，「我暂时的设想就是聊天的形式，你出方案和不做的，我来补充或者确认」。定为：agent 出一个方案，人补充或确认；要什么、做成什么样的事先问一两句开放的问题；人回完 agent 复述一句再记图。
- 17:23Z–17:27Z（格式定稿）：每件事题目单独一段；背景、推荐、疑问、不做四行各自成段，标签不加粗，每行一句短话，把那一行的重点几个字加粗；问话放在整条消息最后，只问一次。人给的样子如下（加粗是 0.3 按人「每一个背景推荐那些总结几个字加粗」补的）。格式照它；内容是当时 M6 高峰题的一个方案，随后被 `d-peak-mode` 否掉，所以例题不用它的内容（§2.8）：

  > ① 高峰时段要不要告诉模型
  >
  > 背景：高峰时 GLM **更费积分**，现在会提醒模型
  >
  > 推荐：**只显示给你看**，不再提醒模型
  >
  > 疑问：以后要主 Agent **避开高峰**干活，就得加回来
  >
  > 不做：继续提醒，它收到 32 次**一次都没用上**

`.agents/tasks/design-context.md`「Questions become conversation」一节写的「一行加粗的结论、2 到 4 条要点、推荐、疑问、不做三行」是 17:08Z 那一版，已被 17:23Z 起的批注取代；本附录按图上的定稿做。

五点落地方案在 M3 里的落法：

| 方案的一点 | M3 怎么做 | 在哪 |
| --- | --- | --- |
| 一、问答卡与选项相关的决定改写或作废；访谈改为聊天，主 Agent 仍不带 `ask_user_question`；`d-inertia-breaker` 改为要紧的事先问人怎么想再给方案 | 不出任何卡片，不列选项；`ask_user_question` 从主 Agent 的工具面去掉并有兜底规则；要什么的事先问开放的问题（身份节、阶段提醒）。先想后看与跟随率的算法不在 M3 | §2.1、§2.2、§2.3；第 3、4 步 |
| 二、要人定的事仍是待决节点，存方案原文、人的原话与结论，不再要求选项一类的字段 | 图引擎多认一种「提议式待决」：没有 `options`，存四行与结论；决定照旧是 `decide`，带人的原话（`relay`） | §3.3；第 6 步 |
| 三、五键变成人在聊天里会说的五种话，不做按钮；设计放行仍是图上一次人的拍板，由主 Agent 带人的原话记下 | `record_human_answer` 记三种（同意、补充、否掉），另两种只改讲法；确认需求与放行方案都由它带原话写图；harness 核对原话 | §3.5、§3.6、§3.7；第 8、9 步 |
| 四、面板只看不操作，「需要你」列出在等人回话的方案，点开跳到主 Agent 的对话 | 面板改版属于 plain-ui；M3 只让面板能显示提议式待决（四行与「在主 Agent 的对话里回话」，没有按钮），并导出 `mainAgentOf` 供跳转 | §3.3；第 6 步；§9 第 5 条 |
| 五、跟随率改为统计人原样同意、补充、否掉的比例，进指标流水 | `record_human_answer` 写进图的说法固定为三种（§3.5），指标流水从图上数；指标流水本身不在 M3 | §3.5、§10 |

### 3.2 说话的规矩只在一处定：`src/design/talk.ts`

人在一个晚上把格式改了五次。主 Agent 怎样跟人说话、哪些提问工具对它藏起来、harness 怎样认出「给人看过什么」和「人说了什么」，都只在这一个模块里定，格式再改只动它与 `src/graph/proposal.ts`（§3.3）。模块不导入设计行的其他文件，纯函数，宿主与模拟人都能导入（模拟人从 `packages/hourness/dist/design/talk.js` 导入，同 `run-probe.mjs` 从 `dist/` 导入的做法）。

```ts
// src/design/talk.ts
import { PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER } from '../shared/tool-names.ts'   // 面板设计 0.6 §4.9 要的两个常量，第 6 步建
export const TALK_GUIDE: string                                   // §2.2 第二部分的前一半
export const HIDDEN_FROM_MAIN_AGENT: readonly string[]            // ['ask_user_question']，按原生名比较（§2.1）
export type ProposalKind = 'question' | 'confirm' | 'release'

/** 一条会话事件是不是人发来的消息（§3.6 的判据）；投影的折叠与退路的扫描都只调它 */
export function isPersonMessage(event: SessionEventLike): boolean

/** 会话投影 hournessTalk 的状态（§3.6）：人的消息与交给人的提议，按先后 */
export interface PersonMessage { readonly seq: number, readonly time: number, readonly text: string }
export interface Shown {
  readonly seq: number, readonly time: number
  readonly kind: ProposalKind, readonly goal?: string, readonly module?: string, readonly question?: string   // module：这次放行的模块（§3.14），没有时是目标一级的放行
  readonly number: 1 | 2 | 3, readonly releaseSet?: readonly { id: string, rev: string }[]
  readonly page?: string     // release 的一页放行稿（§3.14.5），核对「给人看过」时与 after 比
  /** 这次提议之后、下一条人的消息之前主 Agent 发出的文字（assistant 消息的文本部分），给循环板「给人看过原文」的核对用（§3.13）；至多 16,000 码点 */
  readonly after: string, readonly afterTruncated: boolean
}
export interface TalkState { readonly inert: boolean, readonly skipBelowSeq: number, readonly people: readonly PersonMessage[], readonly shown: readonly Shown[] }
export const TALK_PROJECTION = 'hournessTalk'
export function talkInit(header: { readonly origin?: string }, inheritedEventCount: number): TalkState
export function talkApply(state: TalkState, event: SessionEventLike): TalkState
/** 退路：rc.3 已弃用的 snapshotEvents() 在时，按同一个 talkApply 从头折叠一遍 */
export function talkFold(header: { readonly origin?: string }, events: readonly SessionEventLike[]): TalkState

/** 每一段原话是不是人在 afterMs 之后发来的某一条消息的一段，起止落在边界上（§3.6） */
export function personSaid(state: TalkState, quotes: readonly string[], afterMs: number):
  { readonly ok: true, readonly relay: string } | { readonly ok: false, readonly reason: string }
```

`SessionEventLike` 是 `src/shared/dsh-min.ts` 新加的薄类型 `{seq: number, time: number, type: string, data: unknown}`（dsh-session 的事件带 `seq` 与整数毫秒的 `time`，session:1126–1128〔实读〕）。

为什么用会话投影（第 3 轮 N1）：rc.3 对 `snapshotEvents()`、`eventAt()`、`ownEvents()` 标了 `@deprecated`，「new production calls are prohibited」（session:1444–1452、dsh-session README.md:62〔实读〕）；0.3 还在每次带 `relay` 的图工具调用与每次 `propose_to_human` 上扫整份日志。改为设计行激活时注册一个会话投影（`ctx.sessionProjections.register({key: TALK_PROJECTION, stateVersion: 1, stateSchema, init: talkInit, apply: talkApply})`，同 dsh-time-context 折叠 `user/message` 的做法，time-context:181–213〔实读〕；注册是 `ctx.effect`，卸载时撤回，session-projection:58–100〔实读〕），读时 `sessionProjections.stateOf(session, TALK_PROJECTION)`（session-projection:122–131〔实读〕：先把全部投影推进到会话的当前位置，所以工具执行时人的消息与这次工具调用所在的 assistant 消息都已折叠进去）。设计行的主 Agent 模式本来就要这个服务（0.4 §3.1.1，没有时 `/wish` 报错），所以不多一个依赖。

折叠的规则（`talkApply`，纯函数）：

- `talkInit`：会话头带 `origin: 'subagent'` 时 `inert: true`，之后什么都不记（子会话里父 agent 的任务消息是 `source: {kind: 'user'}`，subagent:1460–1461〔实读〕，不能当人的话；子会话的图工具调用也不能带 `relay`，§3.8）；`skipBelowSeq` 取 `inheritedEventCount`，fork 出的会话不把父会话里人的话当成自己的（同面板设计 0.6 §4.9 对继承事件的处理）。
- `isPersonMessage` 为真的事件：追加 `{seq, time, text}`；`people` 的正文合计超过 200,000 码点时从最早的丢起。
- `assistant/message` 里 `tool-call` 块的 `name` 经 `toNativeTool` 后等于 `PROPOSE_TO_HUMAN` 的，记下它的 `id`（只留最近 16 个）；`tool/result` 的消息 `toolCallId` 是其中之一、用 `shownProposalOf(isError, text)` 认出这次是交给人成功了的，按结果追加一项 `Shown`（`after` 为空）。`shownProposalOf` 在 `src/shared/tool-names.ts`（面板设计 0.7 §11 第 6 条，P6-05），按结果正文里的 `tool: 'propose_to_human'` 认，成功时返回解析出的结果对象（§3.4 的输出，面板只读其中的 `{kind, goal, module?}`），失败或不是这个工具时返回 `undefined`；`talkApply` 与面板的 `foldLive` 都只调它，不各写一份认法；结果正文的形状归 M3，改它时同批改这个函数；`shown` 只留最近 64 项。解析不了的跳过，状态里记一个计数，行健康按会话报一次。
- `assistant/message` 的文本块：接在最后一条人的消息之后的每一项 `Shown` 的 `after` 后面（满 16,000 码点时截断并置 `afterTruncated`）。
- 不认识的事件、形状不对的事件原样返回状态。

读不到投影（`stateOf` 返回 `undefined`：注册失败，或这个组合里投影服务不在）时：会话有 `snapshotEvents` 时调 `talkFold(header, session.snapshotEvents())`，会话健康 degraded「人的消息改从会话日志读（会话投影 hournessTalk 没注册上）」；也没有时为读不到，按各处的 fail-closed 处理（§3.4 第 4 条、§3.5 第 5 条、§3.8）。`SessionLike` 的可选成员 `snapshotEvents?` 只为这条退路留着。

`isPersonMessage` 放在 `talk.ts`：面板设计 0.6 §4.9 把「需要你」的第二种改成按工具调用折叠，不再需要人的消息的判据，`src/shared/person-message.ts` 从它的文件表里删去，并写明「M3 的 personMessages 要不要抽出由 M3 定」；M3 没有第二个使用者，所以不抽出（N4，§15）。

### 3.3 提议式待决（图引擎）

人定的事仍是图上的待决（方案第二点）。今天的待决必须有 2–4 个选项与推荐（`src/graph/format.ts`:397–406），决定是选项键（`decision`）。本节加第二种形状，旧的形状照旧能读能写。

纯函数模块 `src/graph/proposal.ts`（不用 Node 内置模块，引擎、`propose_to_human`、例题与面板共用，规则只实现一次）：

```ts
export const PROPOSAL_FIELDS = ['background', 'proposal', 'doubt', 'notTaken'] as const
export const PROPOSAL_LABELS = { background: '背景', proposal: '推荐', doubt: '疑问', notTaken: '不做' } as const
export const PROPOSAL_LIMITS = { line: 40, boldMin: 2, boldMax: 12, conclusion: 120, perReply: 3 } as const
export const CIRCLED = ['①', '②', '③'] as const
/** 一行的检查；background 的长度上限取 PLAIN_LIMITS.background，其余三行取 PROPOSAL_LIMITS.line */
export function proposalLineRefusal(field: typeof PROPOSAL_FIELDS[number], value: unknown): { message: string, hint: string } | undefined
export function splitBold(line: string): { before: string, bold: string, after: string } | undefined
/** 题目一段、四行各一段，段与段之间一个空行；标签不加粗。detail 是提议的一方要人亲眼看到的原文（循环板的 AttachDetail.markdown，§3.13），原样作为最后一段，不受一行与加粗的规则管 */
export function renderProposal(p: ProposalText, number: 1 | 2 | 3, detail?: string): string
```

一行的规则（`proposalLineRefusal`）：是字符串；去掉首尾空白后非空；不含换行；不以本行的标签加冒号开头（「背景：」之类由 harness 加，`hint`「leave out the label; the harness adds it」）；恰好一处 `**…**`，里面 2–12 个码点、不含 `*`，前后至少有一边还有别的字（整行加粗不算）；去掉两对 `**` 之后的码点数：`background` 不超过 `PLAIN_LIMITS.background`（§2.9），其余三行不超过 40。题目：一行，非空，不超过 `PLAIN_LIMITS.title`（40），不含 `*`。上限的理由：人说「一行不要写太多东西」，人给的四行是 13–23 个码点；40 是它的两倍左右。`background` 的上限不由 M3 定，只读 `PLAIN_LIMITS.background`（面板设计 0.6 为 60，去掉 `**` 再数；§2.9、§11）。

`renderProposal` 的输出（`n` 为 1 时）：

```text
① <title>

背景：<background>

推荐：<proposal>

疑问：<doubt>

不做：<notTaken>
```

带 `detail` 时，`不做：` 那一段之后空一行接 `detail` 原文。

改动（第 6 步，图引擎的格式与权限，独立评审）：

- `src/graph/schema.ts`：`GraphNode` 加 `proposal?`、`doubt?`、`notTaken?`、`conclusion?`（都是字符串，只有待决能带）；`background?` 与 `PLAIN_LIMITS` 按 §2.9；`NODE_FIELDS` 的写出顺序在 `recommend` 之后插 `proposal`、`doubt`、`notTaken`，在 `decision` 之后插 `conclusion`（`background` 紧跟 `title`，plain-ui 的次序）；`EDITABLE_FIELDS` 加 `background`、`proposal`、`doubt`、`notTaken`；`HistoryEntry` 加 `conclusion?`，`HISTORY_FIELDS` 在 `option` 之后插 `conclusion`。
- `src/graph/format.ts`（读图时的形状）：待决有两种形状。有 `options` 的是选项式，规则不变；没有 `options` 的是提议式：`background`、`proposal`、`doubt`、`notTaken` 四个都要有（字符串），`CARD_FIELDS` 与 `decision` 都不能有，`conclusion` 可有；做完（`done`）的提议式待决，决定证据的 `ref` 是字面 `conclusion`（今天要求是选项键，:417–420）。两种都不是时报「a question node has options, or background, proposal, doubt and notTaken」。非待决节点不能带这四个字段与 `conclusion`（扩展 :408–411 的检查）。读图只查形状，不查一行与加粗：写入规则在引擎里，同 `option` 的做法（:217 的注释）。
- `src/graph/engine.ts`（写入规则）：
  - `propose` 与碰到这四个字段的 `edit`：待决是提议式时，四行按 `proposalLineRefusal` 查，题目按上面的规则查；`field` 指到出错的字段。`questionRefusal` 对提议式不查表格字段。不能在 `edit` 里换形状（给提议式设 `options` 或给选项式设四行之一）：`invalid`，`hint`「propose a new question」。
  - 谁能改四行：`LLM_EDITABLE` 加 `background`、`proposal`、`doubt`、`notTaken`，只对提议式、且状态是 `approved` 或 `doing` 的待决成立；做完的提议式待决不能由 `llm`、`harness` 改这四行与题目（`forbidden`，`hint`「the human decided this proposal; propose a new question」），人照旧能改。理由：人补充或否掉之后主 Agent 要改方案再提（§3.5），而人同意之后方案就是人同意的那一版。
  - `decide`：选项式照旧要 `option`、不收 `conclusion`；提议式要 `conclusion`、不收 `option`。`conclusion` 去掉首尾空白后非空、一行、不超过 120 个码点。写入 `status: 'done'`、`conclusion`、证据 `{kind: 'decision', ref: 'conclusion'}`，历史 `{op: 'decide', …, conclusion}`。同一结论再拍为 `bad_transition`；权限同今天（`decideRefusal`：决定者是人时要人或带原话的转述，`decidedByHuman` 之后只有人的权限能再拍）。
- `src/graph/mutation.ts`：`decide` 的 `option` 与 `conclusion` 恰有一个，两者都有或都没有时 `invalid`。命令行（`npm run graph`）读的是同一个变更 JSON，不另改。
- `src/graph/tools.ts`：`graph_decide` 的参数 `option`、`conclusion` 都改为可选（rc.3 的 schema 子集没有 `oneOf`，由引擎查），`required` 为 `id`、`rev`、`reason`；说明加一句「a proposal (a question with proposal, doubt and notTaken) takes conclusion: one line, what was decided」。`graph_propose` 的节点 schema 加四个字段的说明；说明里「A question is a table card: rows of label, gain, cost, recommended option last; the human's also crux, verdict, weight.」改为「A question for the human is a proposal: background, proposal, doubt and notTaken, one short line each with a few key words in bold; the main agent puts one with propose_to_human. A question you decide yourself (decider agent) is a table of options, the recommended option last.」这句话所有会话都读到，编排方用命令行写图时同样适用（`d-chat-not-cards` 也适用于编排方与人）。
- `src/graph/stage.ts`：需求卡「岔路」一项的判据 `node.decision !== undefined` 改为 `(node.decision !== undefined || node.conclusion !== undefined)`，其余（最后一次 `decide` 是人或带原话）不变。
- `src/graph/projection.ts`：`openItems.questions` 的条目对提议式另带四个字段（`options` 照旧是 `[]`，类型不变）；`recentDecisions` 的条目加 `conclusion?`，提议式时 `decision` 不出现、`label` 为 `conclusion`（今天 `label` 已经在找不到选项时退回 `decision`，:276）。每步给主 Agent 的项目摘要因此看得到在等人回话的四行。
- `src/graph/panel-row.ts`：不改。0.4 在这里改的是 `/graph-apply` 的 `decide` 结果说法；面板设计 0.6 §9.1 起 `/graph-apply` 整条删去（0.7 §11 第 6a 条与 P6-03：那段代码在面板设计第 5 步删掉），这一项随之取消（第 4 轮 N1）。
- 面板（客户端，最小改动，plain-ui 改版时整体重写）：`ui/src/graph/common.tsx` 的待决区对提议式显示四行（标签照常、`splitBold` 出的那几个字加粗）与一行「在主 Agent 的对话里回话」，不显示选项按钮；`ui/src/graph/model.ts` 的状态说法对做完的提议式写「定了：<conclusion>」；`ui/src/graph/Decisions.tsx` 的近期决定对提议式写「定了：<conclusion>」。
- 不改的：选项式待决的全部规则（`e22282f`、`44e8601`）照旧，agent 自己定的题照旧用表格字段；已有的待决不迁移。引擎不禁止新写选项式的人定待决：限制只对主 Agent（§3.8 第三条），引擎与编排方的用法由改写 `d-option-card` 的那件事定（§9 第 4 条）。
- 测试：`tests/graph-format.spec.ts`（两种形状、两种都不是、混合、非待决带这些字段、做完的提议式的证据）、`tests/graph-engine.spec.ts`（四行的每条规则各一例；`llm` 改未拍板的提议式成功、改做完的被拒；`decide` 的两种形状互斥；同一结论再拍；没有原话时 `llm` 拍人定的提议式被拒）、`tests/graph-tools.spec.ts`、`tests/graph-stage.spec.ts`（提议式拍板之后「岔路」一项为真）、`tests/graph-projection.spec.ts`、`tests/graph-panel-model.spec.ts`、`tests/proposal.spec.ts`（`renderProposal` 的输出逐字等于上面的样子，带 `detail` 时最后一段是它的原文；`splitBold`；例题过 `proposalLineRefusal`；背景按 `PLAIN_LIMITS.background` 去掉 `**` 之后数：恰好等于上限通过、多一个码点被拒，用例从常量构造，不写字面数）。引擎与格式已有的测试不改且通过，这是选项式行为不变的证据；`tests/graph-tools.spec.ts` 里钉 `graph_decide` 的 `required` 与 `graph_propose` 说明文字的断言随之改。

### 3.4 `propose_to_human`：把一件事交给人

设计行注册（`tools.register`，全局，参数与输出 schema 在 rc.3 校验的子集内）；名字在 `DESIGN_TOOL_NAMES` 里，进 `ORCHESTRATION_RESIDENT_TOOLS`（GLM 上常驻）；非主 Agent 的工具面去掉它（§2.1）。文件 `src/design/propose.ts`。

参数：

```text
{ kind: 'question' | 'confirm' | 'release',
  title?, background?, proposal?, doubt?, notTaken?,     // 四行与题目，规则见 §3.3；五项要么都给、要么都不给（都不给只在 question 带 question 时成立：再给人看一次，见下）
  goal?: string,          // confirm、release：目标 id，必填
  module?: string,        // release：要放行的模块 id（§3.14）；缺省是目标一级的放行
  page?: string,          // release：一页放行稿（§3.14.5）；分了模块的目标的两种放行都必填，其余不收
  parent?: string,        // question 新提：挂在哪个节点下；缺省为焦点所在的目标，没有焦点时必填
  question?: string,      // question 改一张未拍板的提议式待决（人补充或否掉之后），或再给人看一次；与 parent 互斥
  sources?: string[],     // question 新提：来源节点，各成一条 source 连线
  attach?: string }       // question：别的组件记下的提议，人同意之后交回给它（§3.13）；rules:p-<8 位十六进制> 或 loops:lp-<8 位十六进制>；再给人看一次时不收
```

工具说明：一句用途「Put one matter to the human: one plan in four short lines. The harness checks it, keeps it on the graph when the human decides it, and returns the text to show.」，三种 `kind` 各一句（`question`：只有人能定的事；`confirm`：访谈结束，把需求交给人；`release`：设计做完，把方案交给人放行；分了模块的目标，大循环放行框架、模块清单与方向清单，之后每个模块带 `module` 与一页放行稿再放行一次），然后原样引用 `PLAIN_QUESTION_GUIDE`。

检查，第一条不成立就抛错（文本为 `{code, message, field?, hint}` 的 JSON，同图工具的 `refuse`）：

1. 调用方是主 Agent（`exec.agent`，`isMainAgent`），否则 `forbidden`，`hint`「只有主 Agent 能用；人用 /wish 开启」。
2. 参数合法：不收别的字段；题目与四行按 §3.3，五项要么都给、要么都不给，都不给只在 `kind: 'question'` 且带 `question` 时成立（再给人看一次），否则 `invalid`；`kind` 与 `goal`、`module`、`page`、`parent`、`question`、`sources`、`attach` 的搭配（`attach` 只对 `question` 且不是再给人看一次；`module`、`page` 只对 `release`）；否则 `invalid`，`field` 与 `hint`。带 `attach` 时按 §3.13 的表问提议的一方，拿到可选的 `detail`；不成立时 `invalid`，`field: 'attach'`，`hint` 带那一方给的原因。
3. 图行服务在、图目录存在，否则 `not_found`；读图有校验错误时 `graph_invalid`。
4. 本条回复里已经交给人的件数：会话投影 `hournessTalk`（§3.2）的 `shown` 里排在最后一条人的消息（`people` 的末项）之后的个数加一为 `n`；`n` 大于 3 时 `too_many`，`hint`「at most three matters in one reply: end this reply with one question and wait」。投影与退路都读不到时 `n` 取 1，会话健康记一条（只影响编号与件数，不影响权限）。
5. 按 `kind`：
   - `question` 新提：父节点存在且未关闭（`proposed`、`approved`、`doing`），否则 `invalid`。以 `llm` 身份提议 `{type: 'question', parent, title, background, proposal, doubt, notTaken, body?, edges: sources 各一条 source}`，`reason`「主 Agent 在对话里把这件事交给人（propose_to_human <callId>）」；带 `attach` 时 `body` 是 `detail`（有时）一段、空一行、提议的一方给的那一行（§3.13，放在最后），不带时没有 `body`。引擎拒绝时把引擎的错误原样抛出。待决挂在未关闭的节点下直接为 `approved`（`initialStatus` 的 `OPEN_PARENT_TYPES`），出现在人的决策队列里。
   - `question` 改：节点存在、是提议式待决、状态 `approved` 或 `doing`，否则 `invalid`（做完的 `hint`「decided; propose a new question」）。以 `llm` 身份 `edit` 题目与四行，`rev` 取刚读到的，`reason`「主 Agent 改了交给人的方案（propose_to_human <callId>）」；`stale_revision` 时重读再试一次。正文末行是某一方的提议行时（§3.13 的两个 `IdOf` 认得出），这次必须带 `attach`（人补充或否掉之后，提议的一方要先记一条新提议，规则板与循环板设计都这样写），否则 `invalid`，`field: 'attach'`，`hint`「record the revised proposal with the board first and pass its new attach」；带了就把 `body` 按新的 `attach` 换掉（`detail` 一段与末行一起换）。
   - `confirm`：目标存在、未关闭、有效阶段为 `wish` 或 `interview`；`requirementCard` 8 项都齐且目标没有 `supersedes` 连线（0.4 §3.2.3 的门禁）。不齐就 `gate_unmet`，`message` 列出缺的项，`hint` 写出每项该问哪一步、写到哪里。不写图。
   - `question` 再给人看一次（五项都不带，带 `question`）：节点存在、是提议式待决、状态 `approved` 或 `doing`，否则 `invalid`（做完的 `hint`「decided; propose a new question」）。不写图。用处：把已经交过人、人还没回的待决再给人看一次（循环板设计 0.6 的「有事等你超过 24 小时再说一次」，M4 的第三次修复也要）；不能用 `edit` 凑，因为引擎对什么都没改的 `edit` 返回 `invalid`（`src/graph/engine.ts`:613「set changes nothing」）。正文末行是某一方的提议行时（§3.13 的两个 `IdOf` 认得出），按表再问一次那一方的 `attachable` 取最新的 `detail`，不成立时 `invalid`，`field: 'attach'`；`text = renderProposal(节点现有的题目与四行, n, detail?.markdown)`，结果同新提（`question` 是这张待决的 id），会话投影里记一项 `Shown`，占本条回复三件里的一件。
   - `release`，不带 `module`：目标已批准、有效阶段为 `design`；`releaseGate(graph, goal)` 成立：没有分模块的目标是 0.4 §3.3.2 的六条，分了模块的目标是 §3.14.2 的大循环放行门禁。`page`：分了模块的目标必填并核对覆盖（§3.14.5），没分模块的目标带了就 `invalid`（`field: 'page'`，`hint`「this goal is not split into modules」）。不成立就 `gate_unmet`，`message` 按决策列出缺的栏与其余缺项。不写图；记下放行集合与每个节点的修订号（放进结果）。
   - `release`，带 `module`：目标已批准，且有效阶段在 `release` 或之后（大循环已放行，否则 `gate_unmet`，`hint`「release the framework, the module list and the directions first (propose_to_human kind release without module)」）；`module` 是 `modulesOf(graph, goal)` 里的一个（不是时 `invalid`，`field: 'module'`；节点不存在 `not_found`）、状态已批准或进行中、有效阶段为 `design`（已放行的 `invalid`，`hint`「this module is already released」）；`moduleReleaseGate(graph, goal, module)` 成立（§3.14.3）；`page` 必填并过 §3.14.5 的检查。不写图；记下模块的放行集合与每个节点的修订号。
6. `text = renderProposal(题目与四行, n, detail?.markdown ?? page)`：`question` 带 `attach` 时第三个参数是那一方的 `detail`，`release` 带 `page` 时是一页放行稿，两者不会同时出现。`confirm` 与不分模块的 `release` 没有第三个参数，同 0.4。

输出 schema：`{tool: 'propose_to_human', kind, goal?, module?, question?, number, text, releaseSet?: [{id, rev}], attach?, message}`。`module` 是带 `module` 的 `release` 的模块 id（面板设计 0.7 §11「两层循环」M3 第 3 条要结果正文带上它，`shownProposalOf` 读）。带 `detail` 或 `page` 时 `message` 另加一句「The part after 不做 is the exact text the human must see before agreeing: keep it verbatim in your reply.」（循环板设计 0.3 §7.1 第 1 步要的那句意思由这里给出；一页放行稿同用这一句）。`goal` 是目标 id（`question` 时为父节点所在的目标）；`question` 是待决 id；`message`：「Show text to the human exactly as given; it is Markdown with a blank line between paragraphs. End your reply with one question for everything you showed, then end your turn. When they answer, restate a loose answer in one line and wait; then call record_human_answer with kind <kind> and their exact words.」。`render` 同图工具，输出 JSON 文本。工具不结束回合：主 Agent 要接着把 `text` 写进回复。

为什么四行由 harness 拼：人这一晚上纠正的三次都是排版（几行之间没有空行，Markdown 把它们并成一坨；标签加粗；重点没有加粗），模型照规矩写也会走样；字段由工具查、文字由 `renderProposal` 拼，排版只有一份实现。主 Agent 有没有把 `text` 原样放进回复，运行时不拦，第 12 步（a）在标定里数（§10）。

`confirm` 与 `release`（含带 `module` 的）不写图：给人看了什么记在会话日志里（这次工具调用与结果），会话投影 `hournessTalk` 从日志折叠出它，`record_human_answer` 从投影里认它（§3.5）；投影从已提交的事件算出，重启与压缩之后照样重建（压缩只加检查点，不删事件，0.4 §2.3）。

### 3.5 `record_human_answer`：把人的回话记进图

设计行注册，同上；文件 `src/design/record.ts`。

参数：

```text
{ kind: 'question' | 'confirm' | 'release',
  goal?: string,          // confirm、release
  module?: string,        // release：放行的是哪个模块（§3.14），与 propose_to_human 那次一致；缺省是目标一级的放行
  question?: string,      // question：待决 id
  answer: 'agree' | 'add' | 'reject',
  words: string[],        // 人的原话，1–3 段，逐字从人的消息里摘
  recordedAs: string }    // 一行：记成什么（同意时是结论；补充、否掉时是主 Agent 的复述）
```

检查：

1. 调用方是主 Agent，否则 `forbidden`。
2. 参数合法：`words` 1–3 段，每段去掉首尾空白后非空、不超过 500 个码点，拼起来（段间换行）不超过 2,000 字符（与 `relay` 同上限）；`recordedAs` 一行、非空、不超过 120 个码点；否则 `invalid`。
3. 图与目标同 `propose_to_human` 第 3 条；`question` 时节点是提议式待决、状态 `approved`、`doing` 或 `done`（人改主意时可以再拍）；`confirm`、`release` 时目标存在、未关闭；`module` 只对 `release`，是 `modulesOf(graph, goal)` 里的一个（否则 `invalid`，`field: 'module'`）。
4. 起点（人的话必须在这之后）：
   - `question`：这张待决最后一条 `propose`、`edit` 或 `decide` 历史的 `at`（人同意的是它最新的那一版；待决已经拍过板之后，要人在那之后说的话才能再拍，0.4「卡片不改面板上的拍板结果」由此保留；0.5 里面板不再写图，已拍的板来自 `record_human_answer` 或带原话的 `graph_decide`，第 4 轮 N1）。
   - `confirm`、`release`：本会话 `hournessTalk` 的 `shown` 里最后一项 `kind`、`goal` 与 `module` 都相同（`module` 都没有也算相同）的 `time`；没有时 `not_shown`，`hint`「show it with propose_to_human first, in this session」。目标一级的放行与某个模块的放行是两件事：给人看过模块 A 的放行，不能拿来记目标一级或模块 B 的放行。
5. `personSaid(状态, words, 起点)`（§3.6，状态取会话投影 `hournessTalk`）不成立时 `invalid`，`field: 'words'`，`message` 写明哪一段没找到，`hint`「quote the human's own words exactly, from a message they sent after you showed the proposal; if they have not answered yet, end your turn and wait」。投影与退路都读不到、或核对抛错时 `unavailable`，`hint`「the harness cannot read this session's messages, so nothing was recorded; tell the human」，会话健康 degraded。
5a. `question`、`agree`，且待决正文末行是某一块板的提议（规则板的 `rules:` 或循环板的 `loops:`，§3.13 的表）：拍板之前再问一次那块板的 `attachable`。带回 `detail` 时核对「给人看过原文」（循环板设计 0.6 §17 M3 第 6、9 条，规则板设计 0.10 §10.7 M3 第 1 条）：取 `shown` 里这张待决最近一项的 `after`，按 `personSaid` 的同一种规整（NFKC、空白合一）之后，`detail.mustShow` 的每一片都在里面；不全在（或 `afterTruncated` 而没找到）时 `not_shown`，`message`「The human has not seen the exact command text and cautions; show the text from propose_to_human again, verbatim, and ask again」，图不变；都在时这次 `decide` 的 `reason` 末尾加「 · 已给人看原文 <attachDigest(detail)>」。0.5 起两块板的脚本提议都带 `detail`（共用循环板的 `scriptDetail`），循环板人加的检查提议也带（`commandDetail`，编排方的裁定「Check entries seam」），所以会跑东西的提议都过这一步；0.4 写的「规则板的提议没有 `detail`，跳过」作废。`attachable` 答 `ok: false` 时 `invalid`，`field: 'attach'`，`hint` 带它的原因，图不变；那块板的服务不在时照常拍板、不加这个记号（两块板的 `acceptProposal` 都只认带这个记号的拍板，所以会跑东西的提议因此不生效、人要再同意一次，那是两块板设计定的退路）。没有 `detail` 的提议（例如规则板不带脚本的规则提议）跳过这一步。
5b. `release` 且提议时带了 `page`（§3.14.5）：取 `shown` 里匹配那一项（`kind`、`goal`、`module` 都同）的 `after`，按 `personSaid` 的同一种规整，`page` 整段在里面；不在（或 `afterTruncated` 而没找到）时 `not_shown`，`message`「The human has not seen the whole release page; show the text from propose_to_human again, verbatim, and ask again」，图不变。理由与 5a 相同：放行解开子 agent 的写入，人同意的是他看到的那一页（`d-design-onepage`：人看这一页放行后才进开发）。读不到 `hournessTalk` 的 `after`（投影与退路都没有）时已经在第 5 条 `unavailable`。
6. 按下表写图。全部以 `llm` 身份写，同意的那几条带 `relay`（人的原话，段间换行），引擎因此给它们人的权限（`src/graph/engine.ts`:154）；批注不带 `relay`（引擎对 `comment` 丢掉 `relay`，:150），原话写进批注正文。

| `kind` | `answer` | 写图 | `outcome` 与给模型的下一步 |
| --- | --- | --- | --- |
| `question` | `agree` | `decide {conclusion: recordedAs}`，`relay`，`reason`「人在对话里同意（record_human_answer <callId>）」（第 5a 步的记号接在后面）；成功之后正文末行是某一方的提议时交回它（§3.13） | `decided`；照结论继续；`handedBack` 写提议的一方怎样处理了（例「Rules board: proposal p-3f9a1c07 took effect」） |
| `question` | `add` | 在待决上批注「人在对话里补充：「<原话>」；主 Agent 记成：<recordedAs>（record_human_answer <callId>）」 | `added`；改好方案后 `propose_to_human`（`question` 填这张待决）再给人看 |
| `question` | `reject` | 批注「人在对话里否掉：「<原话>」；主 Agent 记成：<recordedAs>（record_human_answer <callId>）」 | `rejected`；换一个方案同样再提；人要的是这件事不用定了时，带人的原话 `graph_status` 改为 `dropped` |
| `confirm` | `agree` | 重查需求卡门禁（同 `propose_to_human`；两者之间图可能变了），不成立时 `gate_unmet`、不写；成立时目标仍是提议则 `approve`，再 `edit` 设 `stage: 'design'`，两条都带 `relay`，`reason` 同上 | `confirmed`，`stage: 'design'`；开始做方案 |
| `confirm` | `add`、`reject` | 在目标上批注，说法同 `question` 两行 | `added` 或 `rejected`；改需求后再 `propose_to_human`（`confirm`） |
| `release`，不带 `module` | `agree` | 重查放行门禁（没分模块的目标是 0.4 的六条，分了模块的是 §3.14.2）。没分模块的目标：按提议时记下的修订号逐个 `approve` 放行集合（父在子前），全部成功且放行范围里不再有提议时 `edit` 目标设 `stage: 'release'`。分了模块的目标按 §3.14.2 的四步次序：先给这次放行集合里每个 `stage` 不是 `design` 的模块候选 `edit` 设 `stage: 'design'`（候选此时仍是提议），再逐个 `approve` 放行集合，全部成功且放行范围里不再有提议时最后 `edit` 目标设 `stage: 'release'`。每条都带 `relay`，阶段写入的 `reason` 以 `ANSWER_MARKS.agree` 开头并含「（record_human_answer <callId>）」 | `released`，`approved`、`stage`，分了模块时另有 `modules`（这次批准的模块 id）；跳过的节点进 `skipped`，`outcome` 为 `partial`，不改目标的阶段，`message` 列出它们，改好后再提（0.4 §3.4.2「部分失败」的规则，修订号与跳过的判法照旧）。写入中途停下可以重放同一次回话：停在任何一步之后 `isSplit` 都为真，已带 `design` 的候选跳过阶段写入、已批准的不再批准（§3.14.2；第 5 轮 R5-M2 的改法，不再有「已批准而没有 `stage` 的模块」这一种中间状态） |
| `release`，带 `module` | `agree` | 重查模块放行门禁（§3.14.3）；按提议时记下的修订号逐个 `approve` 模块的放行集合，带 `relay`；全部成功且模块子树里不再有提议时 `edit` 模块设 `stage: 'release'`，带 `relay`，`reason` 以 `ANSWER_MARKS.agree` 开头并含「（record_human_answer <callId>）」（面板设计 0.7 §11「两层循环」M3 第 3 条） | `released`，`module`、`approved`、`stage`；部分失败同上，模块的阶段不改 |
| `release`（带或不带 `module`） | `add`、`reject` | 在被放行的节点上批注（带 `module` 时是模块节点，否则是目标），说法同上 | `added` 或 `rejected`；按人的话改方案，再提 |

写入的次序与修订号同 0.4（§3.2.3、§3.4.2）：每条写入带重新读到的修订号，后一条带前一条结果里的 `rev`；`stale_revision` 时重读再试一次，仍失败就抛引擎的错误，`hint` 带上人的原话（「nothing more was recorded; the human said: …」）。

输出 schema：`{outcome: 'decided' | 'confirmed' | 'released' | 'partial' | 'added' | 'rejected', message, stage?, module?: string, modules?: string[], approved?: string[], skipped?: [{id, code}], handedBack?: string}`。`handedBack` 是 `question`、`agree` 拍板成功之后交回提议的一方得到的那一行（§3.13）。

三种说法是固定的，字面只在公共库 `src/shared/answer-marks.ts` 的 `ANSWER_MARKS` 里（面板设计 0.6 §5.6 定的模块，谁先合入谁建；N4）：同意写在 `decide`、`approve`、`edit` 的 `reason` 开头（`ANSWER_MARKS.agree`「人在对话里同意」），补充与否掉写在批注开头（`ANSWER_MARKS.add`「人在对话里补充：」、`ANSWER_MARKS.reject`「人在对话里否掉：」）；`record.ts` 用这几个常量拼，不另写字面。面板的变化一节用 `answerKindOf` 认这三种；跟随率不从图的历史数：每次 `record_human_answer` 成功返回时由 harness 记一条指标事件（§3.12），一次调用是人的一次回话（面板设计 0.6 §5.6 的计数单位）。放行由这一次 `edit` 写入认出（`d-auto-drive`，§9 第 7 条）。

0.4 §3.4.3 的「卡片回答以人的身份写图」（D3，`question-21` A）与 `src/design/human-writes.ts` 不再需要：没有卡片，人没有在 harness 发出的界面上点过什么；人说的话在会话日志里，由主 Agent 带原话记，harness 核对原话（§3.6）。写入身份因此是 `llm` 加 `relay`，与引擎已有的「带原话的转述有人的权限」是同一条路；验收里「历史记为人」的字样请人改为「历史带人的原话」（§9 第 1 条）。

### 3.6 人的原话由 harness 核对

`d-chat-not-cards` 之后，确认需求与放行方案这两件只有人能做的事，都由主 Agent 带人的原话写进图。放行之后子 agent 就能写文件（`design-before-release`），M7 起主 Agent 会自己一路推进（`d-auto-drive`）。所以「这段话是人说的」由 harness 核对，不靠模型自觉（`d-failure-plans`：失败要能被发现；这里的失败是模型编出或挪用人的话）。

人发来的消息（`isPersonMessage`，§3.2）：`type === 'user/message'`、`data.source.kind === 'user'`、`data.source.form` 不存在的事件；正文是 `data.content` 里 `type: 'text'` 块的文字按换行连起来；正文去掉首尾空白后恰好是 `GOAL_ATTACHMENT_TEXT`（`talk.ts` 的常量 `'Reference attachments for the goal objective.'`）的不算（N12）：`/goal` 带附件时 dsh-command-goal 以 `source: {kind: 'user'}`、不带 `form` 追加附件与这一句固定文字（command-goal:99–107〔实读〕），它是命令写的，不是人的话。依据：桌面版上人在输入框发的话由 api-session-controller 建成 `source: {kind: 'user', rpcId, …}`（:3222–3228〔实读〕），headless 的任务消息是 `source: {kind: 'user'}`（dsh-headless:340–346〔实读〕）；插件的 notice 带 `form: 'notice'`（`createUserNotice`，`src/shared/dsh-min.ts`:460–468），dsh-time-context 的时间消息 `source.kind` 是插件名、`form: 'snapshot'`（time-context:231–241），`/wish` 等命令事件是 `command/run`，都不算。排队后被人删掉的消息不会成为事件（api-session-controller:1036–1044）。这些消息由会话投影 `hournessTalk` 折叠下来（§3.2），核对时不再扫会话日志。

`personSaid(state, quotes, afterMs)`：两边都先做 NFKC，再把连续空白换成一个空格、去掉首尾空白；每一段都要是某一条 `time > afterMs` 的人的消息里的一段，而且起止都落在边界上（N2）：起点是那条消息的开头，或前一个字符是空白或 Unicode 标点（`\p{P}`）；终点是那条消息的结尾，或后一个字符是空白或 Unicode 标点。所以「不可以」里摘不出「可以」，「可以，放行」里能摘出「可以」与「放行」。各段可以出自不同的消息；全部找到时 `relay` 为各段原文（规整之前的）按换行连起来，否则 `reason` 写明第几段没找到、是没有这段文字还是这段文字不在边界上（后者的 `hint` 加一句「quote whole phrases, from one punctuation mark or line break to the next」）。

防的与不防的：

- 防模型编出人的话、把人很早以前说的话挪来用、把对上一版方案的同意算到这一版上（起点按最新一版算）、从人的话里摘出改了原意的半句（边界规则）。
- 不防别的插件伪造人的消息：本仓库的模拟人就是这样代人回话的（§3.10），威胁是模型，不是同一进程里的插件。
- 不防模型把人的话归错类（把「不行」记成同意）：harness 判断不了语义。补救靠三处：人随口回答时先复述「那我记成……」、人确认了再记（身份节）；历史里同时有原话与「记成」那一句，面板与汇报里人看得到；放行之后发现不对，人说一句，主 Agent 带原话把阶段改回 `design`（§3.8 第二条只拦向前）。标定里数「原话不到 6 个码点、前面没有复述」的记录次数（第 12 步（a））。

主 Agent 移到别的会话之后（§2.4），核对只看持有者会话自己的 `hournessTalk`：`confirm`、`release` 要在新会话里重新提一次；`question` 按图上的时间判，人在新会话里回话照样算。

### 3.7 五键变成人说的五种话

| 0.4 的键 | 人在对话里会说的，例如 | 主 Agent 做什么 | 图上留下什么 |
| --- | --- | --- | --- |
| 批准 | 「可以」「就这样，放行吧」 | `record_human_answer`，`agree` | 同意的写入，带原话 |
| 拒绝（带理由） | 「不行，钱要能按月看」 | `record_human_answer`，`reject`；按理由重新设计再提 | 「人在对话里否掉：」批注 |
| 补充 | 「另外，数据只放在本机」 | `record_human_answer`，`add`；补进方案再提 | 「人在对话里补充：」批注 |
| 讲细点 | 「为什么这样？」「说细点」 | 展开理由、证据与没选的做法，再问一次；不调工具 | 无 |
| 说重点 | 「太长了」 | 只留结论与要人定的那一处，再问一次；不调工具 | 无 |

人随口说的（「嗯」「行吧」「差不多」）先复述「那我记成：……」，等人确认；记的时候 `words` 取人确认的那句，需要时连同前一句。0.4 的汇报细度一档一档调（`depth`）去掉：系统提示词里的汇报细度只有 GLM 包的旋钮（§2.7），「讲细点」「说重点」只改这一次怎么讲，写进画像属于 M5。

### 3.8 用图工具写图时的规矩（`main-agent-graph`）

图工具对所有 agent 注册（`src/graph/index.ts`:109），引擎给任何带 `relay` 的 `llm` 写入人的权限（`src/graph/engine.ts`:150、154），图的命令行也以 `llm` 身份写、请求里可以带 `relay`（`src/graph/cli.ts`:58–96）。0.3 只管主 Agent 一个会话，主 Agent 派出的子 agent（放行之前也能调图工具，`design-before-release` 只管文件写入）与同一项目里的普通会话都能带一段编的 `relay` 把目标推到放行或批准放行集合，不过门禁、不核对原话、没有告警（第 3 轮 M5）。0.4 的规矩按会话的种类分开，都在 `tools/pre-execute` 上执行（`src/guard/main-agent.ts`，由 `installMainAgentRules` 一起装，依赖由设计行传入）。适用的调用：调用名经 `toNativeTool` 后在 `GRAPH_TOOL_NAMES` 里的图工具调用；第四条另看 shell 调用。会话的种类：会话头带 `origin: 'subagent'` 的是子会话；`isMainAgent` 为真的是主 Agent；其余是普通会话。

1. `main-agent-graph-relay`，转述要是人的原话（第 6 步）：
   - 主 Agent：参数带 `relay` 时，按换行切成段，`personSaid(hournessTalk 的状态, 段, 起点)`；起点是目标节点最后一条不是 `comment` 的历史的 `at`，`graph_propose` 新节点时为 0（本会话里任何一条人的消息）。不成立时拒绝。纠偏：事实 `The words you relayed are not in a message the human sent after <node> last changed.`；越界 `Only the human's own words carry their authority.`；正路 `Quote them exactly from their message, or ask them and wait; to record an answer to a proposal, use record_human_answer.`；例外 `none`。
   - 子会话：参数带 `relay` 一律拒绝，不看内容。子 agent 不和人对话（`d-one-main-agent`），它会话里的 `source: {kind: 'user'}` 消息是父 agent 的任务（subagent:1460–1461〔实读〕），没有可核对的人的话。纠偏：事实 `Subagents do not relay the human's words.`；越界 `Only the main agent talks with the human, and only it records their words.`；正路 `Report back; the main agent records the human's words.`；例外 `none`。告警（下面「告警」一段）。
   - 普通会话：`relay` 不核对，照今天（引擎给它人的权限），只受第二条约束。
2. `main-agent-graph-stage`，阶段只经确认与放行向前（第 8 步）。对所有会话（主 Agent、子会话、普通会话）都生效，带不带 `relay` 都一样。下面五种图工具调用一律拒绝；`stage` 的先后照 `STAGES`（`src/graph/schema.ts`:18：wish、interview、design、release、decompose、execute、merge、operate），有效阶段照 `effectiveStage`（`src/graph/stage.ts`:90–94），节点所属的目标照 `goalOf`：
   - a. `graph_edit` 给带阶段的节点（目标或特性）设 `stage`：它的有效阶段是 `wish` 或 `interview`、新值在 `interview` 之后；或有效阶段是 `design`、新值在 `design` 之后。
   - b. `graph_approve` 一个有效阶段是 `wish` 或 `interview` 的目标（确认需求）。
   - c. `graph_approve` 一个节点（目标本身除外），满足其一：它所属目标的有效阶段是 `wish`、`interview` 或 `design`；它所属的模块或模块候选（`moduleOf`，§3.14.1）还没放行（`isReleased` 为假；模块和候选自己除外）；它是已放行的、分了模块的目标的直接特性子节点而自己还没有 `stage`（新加的模块，模块清单只在大循环里定，§3.14.1）。放行之前批准放行集合里的节点，就是绕过放行门禁的放行；模块也一样，模块放行之前批准模块子树里的节点同样是绕过。
   - d. `graph_propose` 带 `relay`、类型不是 `question`、`risk`、`retro` 的节点，挂在有效阶段为 `wish`、`interview`、`design` 的目标下，或挂在还没放行的模块或模块候选（含它们的子孙）下，或是已放行的、分了模块的目标的直接特性子节点（带原话的提议直接是已批准，`initialStatus`，`src/graph/engine.ts`:417–430，等于 c）；或带 `relay` 提议一个 `stage` 在 `interview` 之后的目标，或一个带 `stage` 的特性（直接以那个阶段批准，等于 a）。
   - e. `graph_edit` 把模块的 `stage` 改回 `design`：子会话与普通会话拒绝，主 Agent 放行（引擎对它不要人的原话，§3.14.7）。理由：退回模块的设计循环是第二档（可逆、只影响本模块），判断归主 Agent；子 agent 与别的会话不能叫停一个模块。纠偏：子会话的事实 `Only the main agent sends a module back to design.`、正路 `Report back to the main agent.`；普通会话的同一句事实、正路 `Ask the main agent in its conversation.`；例外都是 `none`。命中时同样告警。
   向后改阶段（目标的 `release` 改回 `design`，要人的原话；模块的 `release` 改回 `design`，见 e）、放行之后的阶段（`release` 往后）、要人定的待决的拍板都不受 a–d 管，照引擎规则（主 Agent 的 `relay` 照第一条核对）。确认与放行只走 `record_human_answer`：它在工具体里直接调 `openEngine(dir).apply`，不经图工具，也就不经这一条；它自己先核对人的原话、再重查需求卡或放行门禁（§3.5）。纠偏：主 Agent 的正路 `Put it to the human with propose_to_human (kind confirm or release) and record their answer with record_human_answer; the harness checks the requirement or the design first.`；子会话的事实 `Only the main agent moves a goal forward, by recording the human's agreement to its proposal.`、正路 `Report back to the main agent.`；普通会话的同一句事实、正路 `The human agrees in the main agent's conversation; /wish in this session shows where it is.`；例外都是 `none`。子会话与普通会话命中时告警。这一条落实 `m3-6` 验收第 2 条（§9 第 1 条的新字句）。
3. `main-agent-graph-options`，不给人列选项（第 6 步，只对主 Agent）：`graph_propose` 一张决定者是人（`decider` 不是 `agent`）且带 `options` 的待决，或 `graph_edit` 给决定者是人的待决设表格字段，拒绝。纠偏正路：`Put a matter for the human with propose_to_human: one plan in four lines, no options. A question you decide yourself takes decider agent.`
4. `main-agent-graph-cli`，会话里不用图的命令行写图（第 8 步，所有会话）：shell 调用里有一个简单命令（`simpleCommands`，§2.5）是图的命令行、子命令不是 `show` 或 `open` 时拒绝。认法：`npm`、`pnpm`、`yarn` 后接（可选的 `run`、`-s`、`--silent`）`graph`；或命令名是 `node`、参数里有以 `scripts/graph/cli.ts` 结尾的路径（`\` 与 `/` 等同）。命令行是编排方在 DSH 之外用的（`docs/ORCHESTRATION.md` §2.6），在 DSH 的会话里它绕过上面三条。纠偏：事实 `Inside DSH the project graph changes through the graph tools.`；越界 `The graph tools check whose words a relay carries; the command line does not.`；正路 `Use the graph tools (graph_propose, graph_edit, graph_decide, …).`；例外 `The orchestrator runs the command line outside DSH.`。命令文字里有 `relay` 且会话不是主 Agent 时告警。认不出的写法（脚本或别的程序里打开图引擎）是残余，记在 §10。

告警（子会话与普通会话命中第一条的子会话一支、第二条或第四条的 `relay` 一支时；主 Agent 自己命中只拒绝、进违规流水，由纠偏带回正路）：

- 违规流水照常一行（规则 id 是上面的 id），另带 `{session: {id, kind: 'subagent' | 'ordinary', parent?}, goal?, node?, tool, stageFrom?, stageTo?}`。
- 设计行的行健康 degraded，说明「最近 24 小时有 <N> 次不经人的同意推进目标的写入被拦下，最近一次：<会话种类> <会话 id> 想把「<目标标题>」<推到 <阶段> | 的「<节点标题>」批准>，<本地时刻>」；在内存里记最近 50 次，最后一次之后 24 小时恢复（重启之后从违规流水看得到）。人在 `/hourness-status` 与插件管理器里看得到。
- 这个项目有持有者、持有者会话活着（`agents.get`）时，给它 `inject` 一条 notice（来源 `glm-design-bypass`）：`[拦下] <子 agent「<标签>」| 另一个会话「<标题>」> 想不经人的同意<把「<目标标题>」推到 <阶段> | 批准「<节点标题>」>，harness 拒绝了（<规则 id>）。下一次回复里用一句话告诉人。`；同一个会话、同一个目标 10 分钟内只发一次。持有者不活时只有前两样。
- 指标事件 `design.bypass-refused`（§3.12）。

失败的处理：第一条读不到 `hournessTalk`（投影与退路都没有）或核对抛错时拒绝（fail-closed），纠偏事实写「the harness cannot read this session's messages」，会话健康 degraded：放行等于把人的权限交给一段核对不了的话。第二条只对上面五种候选调用读图；读图或判定抛错时拒绝（fail-closed），正路 `Retry; if it fails again, tell the human the reason`：这五种调用都很少、可以重试，放过一条就是没有门禁的放行。第一条的子会话一支只看会话头，没有失败的路。第三条读图或判定抛错时放行（fail-open，同 0.4 写入规则），会话健康 degraded：它管的是问人的形状，不管权限。第四条只看命令文字，不读别的东西。四条的拒绝都进违规流水。`human` 身份的写入不经这几条；面板不再有拍板或批准的写入（`/graph-apply` 删去，第 4 轮 N1），今天以 `human` 身份写图的只有面板的 `/graph-run`，它对任务节点开始、停止、重做，不碰阶段与批准。

### 3.9 去掉的与留下的

去掉（0.4 与 0.2 设计了、不再实现）：

- `decision_card`（0.4 §3.5.1，0.2 §2.4）、`design_review` 的确认卡与五键卡（0.4 §3.2.3、§3.4.1–§3.4.4）、访谈的 `ask_human` 与接缝 A/B/C 的对照（0.2 §2.7，0.3 草稿 §3.3）。
- `src/design/cards.ts`（卡片构造、回答解析、`answerPhrase`）、`src/design/human-writes.ts`（D3）、`src/graph/card-rules.ts`、卡片的忙碌集合、卸载检查里与卡片等待有关的部分、`depth`。
- 设计行对 `userQuestions` 的依赖与 `UserQuestionsService` 薄类型；`hourness-confirm`、`hourness-five-keys`、`hourness-decision` 等问题 id。
- `FIVE_KEYS` 不迁移：第 10 步删 `src/workflow/decisions.ts` 时一起删（0.4 原定迁到 `cards.ts`）。
- 0.2 的兜底规则 `main-agent-ask-card` 改名 `main-agent-ask`，正路改为 §3.8 第三条那一句（第 4 步）。

留下（0.4 照做）：需求卡与五栏的门禁（`src/graph/stage.ts`，main `7aa8fe5`）；放行集合的排序、`supersedes` 的拒绝、按修订号批准、部分失败不改阶段（0.4 §3.3.2、§3.4.2）；有效阶段（0.4 §2.4）；`design-before-release`（0.5 起按模块判，§3.14.6）；流程条；去掉 L1/L2/L3。0.4 此处还留着的「面板拍板的回写」随面板设计 0.6 起 `/graph-apply` 的删除去掉（§2.4，第 7 步取消，第 4 轮 N1）。

### 3.10 模拟人（探针与标定）

0.4 §9.1.2 的模拟人插件（`scripts/calibrate/simulated-human.mjs`）答的是卡片；改为在对话里回话。

- 配置：`{wish?: true | string, answers?: {<GateItem.key>: string}, replies?: {question?: string[], confirm?: string[], release?: string[], module?: string[]}, restateReply?: string, fallback?: string, maxReplies?: number}`。`restateReply` 默认「对」，`fallback` 默认「你按经验定吧」，`maxReplies` 默认 24；未知字段与不合法的项告警并忽略。去掉 0.4 的 `confirm`、`fiveKeys`、`decisions`、`choose`、`freeText`。
- 发 `/wish`：同 0.4 §9.1.2 第 1 条。
- 回话的时机：在 `ctx.on('session/event', …)` 上只收根 agent 会话的 `turn/end`；回话经 `agent.followup(消息)` 发出，消息形状同 headless 的任务消息 `{id, role: 'user', content: [{type: 'text', text}], source: {kind: 'user'}}`（dsh-headless:340–346〔实读〕），所以 §3.6 把它当作人的话。headless 在 agent 静止空闲、且序号没变时才退出（dsh-headless:348–351〔实读〕），回话让 agent 继续跑下一回合〔推断：`turn/end` 时同步 `followup`，headless 的空闲判断看到序号变了；L3 `glm-design-question` 核对一次运行跨过了回合〕。
- 回什么（纯函数 `simulatedReply(context)`，同文件导出，单测直接测），按次序第一条成立的：
  1. 已回满 `maxReplies`：不回。
  2. 这一回合最后一条主 Agent 的消息含「我记成」：回 `restateReply`。
  3. 这一回合有 `propose_to_human` 的结果（模拟人用 `talkApply` 折叠自己在 `session/event` 上收到的事件，取 `shown`）：每一件按 `kind` 依次取 `replies[kind]` 的下一句（用完时取最后一句；没有配置时 `question` 为「可以，就按推荐的来」、`confirm` 为「对，就这样」、`release` 为「可以，放行」；带 `module` 的 `release` 取 `replies.module`，没有配置时为「可以，放行这个模块」），多件时按先后用换行连起来，回一次。
  4. 焦点目标的需求卡有缺项：取步号最小的一项（同 §2.3 的次序），回 `answers[key]`；没有配置时回 `fallback`。
  5. 焦点目标的有效阶段不是 `release`，或目标分了模块（§3.14.1）而还有模块的有效阶段是 `design`：回 `fallback`。
  6. 其余：不回（运行随之结束）。
  每次回话或不回都在 `human.jsonl` 写一条 `{kind: 'reply' | 'silent', rule, text?, shown: [{kind, number}]}`。图目录取 `ctx.get('glmHournessGraph')?.dirFor(cwd)`，用 `dist/graph/store.js` 的 `loadGraph` 读，需求卡用 `dist/graph/stage.js`（同 0.4 §9.1.1 的占位做法）。
- 卡片：覆盖层仍插入 `tool-ask-user`（好核对它对主 Agent 藏起来了），模拟人在每个 agent 上监听 `user-questions/request`，收到就以 `ASK_CANCELLED` 拒绝并写 `{kind: 'unexpected-question', id}`：主 Agent 不该出卡，出了就是要量的违规。

### 3.11 M3 的拦截在规则板上看得到（`d-rules-visible`、`d-defaults-readonly`，第 3 轮 M1）

`d-rules-visible`（人定 2026-10-29T18:06Z，relay「没问题，项目所有规则确实应该都在明面上」）：项目里所有生效的规矩都要在规则板或循环板上明面可见，会拦住动作的门放在规则板；`d-defaults-readonly`（17:55Z）：插件带来的默认条目只能看。规则板设计 0.8 §10.1 用只读的代码规则目录列它们（`src/rules/builtin.ts` 的 `CatalogEntry`，id 写成 `<行>:<代码里的规则 id>`，契约测试去掉前缀后与那一行导出的规则 id 逐个比较），并写明「M3 的…（M3 合入后，`src/guard/main-agent.ts`，id 照 M3 代码里的写）」。0.3 把 M3 的几条拦截说成「代码里的边界，不是规则板上的规则」，没有导出，这与 `d-rules-visible` 相反。0.4 把它们都导出成一张表。

```ts
// src/guard/main-agent-rules.ts：只有常量，不导入别的文件；src/guard/main-agent.ts 与规则板的 src/rules/builtin.ts 都导入它
export interface MainAgentRule {
  readonly id: string                                    // 代码里的规则 id，违规流水的 rule 就是它
  readonly title: string                                 // 一行人话，规则页上的标题；plainWordsIn 为空
  readonly enforcement: 'deny' | 'deny-when-no-snapshot'
  readonly subjects: 'main-agent' | 'main-agent-subagents' | 'every-session'
  readonly step: 3 | 4 | 5 | 6 | 8                       // 哪一步加的（只给本附录与测试对照用）
}
export const MAIN_AGENT_RULES: readonly MainAgentRule[]
```

| `id` | `title` | `enforcement` | `subjects` | 步 |
| --- | --- | --- | --- | --- |
| `main-agent-no-write` | 主 Agent 不写文件 | `deny` | `main-agent` | 4 |
| `main-agent-ask` | 主 Agent 不出问答卡 | `deny` | `main-agent` | 4 |
| `git-snapshot` | 会丢工作的 git 命令先存档，存不了才拦；存档不推到远端 | `deny-when-no-snapshot` | `main-agent` | 4 |
| `design-before-release` | 放行之前（目标或模块），主 Agent 派出去的 agent 只读 | `deny` | `main-agent-subagents` | 5 |
| `main-agent-graph-relay` | 转述的人话要在人发来的消息里；子 agent 不转述人的话 | `deny` | `every-session` | 6 |
| `main-agent-graph-options` | 主 Agent 不给人列选项 | `deny` | `main-agent` | 6 |
| `main-agent-graph-stage` | 目标只经确认需求与放行方案向前 | `deny` | `every-session` | 8 |
| `main-agent-graph-cli` | 会话里不用命令行写项目图 | `deny` | `every-session` | 8 |

标题用规则页的词：规则板设计 0.8 §9.1 末段把「快照」在页上写作「存档」，所以 `git-snapshot` 的标题写「存档」。`main-agent-graph-*` 四条各一个 id，违规流水的 `rule` 用同一个 id，规则页能分开计数。

登记进规则板的目录：

- 目录的条目：`id` 为 `design:<MainAgentRule.id>`，`title` 照抄，`row` 为 `design`（这几条由设计行的 `installMainAgentRules` 装），`effect` 为 `block`（两种 `enforcement` 都是拦截；「存不了才拦」写在标题里），`plugin` 为 `dsh-hourness`。规则页按 `d-defaults-readonly` 标「dsh-hourness 带来的 · 只能看」，没有开关与解除。`builtin.ts` 从 `MAIN_AGENT_RULES` 映射出这几条，不另写一份；规则板 0.8 的契约测试（去掉 `design:` 前缀后与 `MAIN_AGENT_RULES` 的 id 比较）不用改写法。
- 谁建：规则板 R1 先合入时，它的目录里 M3 的条目由 M3 第 4 步按上表加（之后第 6、8 步各自加新 id）；M3 先合入时，`MAIN_AGENT_RULES` 先在 M3 里，规则板 R1 建目录时映射它。0.4 的两条 `main-agent-no-write`、`design-before-release` 换成上表八条（§9 第 12 条给规则板设计）。
- 循环板：M3 没有到点或碰到事件就去做的条目，循环板上没有 M3 的东西。

契约测试（`tests/contracts.spec.ts`，第 4 步建、第 6、8 步扩）：id 不重复；每条的 `title` 去掉首尾空白非空、一行、不超过 40 个码点、`plainWordsIn` 为空；假宿主上逐条触发一次拒绝，违规流水的 `rule` 都在 `MAIN_AGENT_RULES` 里，`MAIN_AGENT_RULES` 的每个 id 都被触发过（加了规则忘了登记、登记了没有实现，这条测试都失败）；`step` 不大于当前已合入的步（每步的测试只断言到本步为止的 id）。

### 3.12 交给指标流水的事件（`metrics`，第 3 轮 N6）

`metrics`（人批）：每个项目一份只追加的事件流水，数由 harness 写，模型写的数不算，只记数与引用、不记对话正文。指标流水的设计还没成稿，写入接口与信封（时刻、项目、会话、来源行）由它定。M3 这边只有一个出口 `emitMetric(event)`（`src/design/metrics.ts`，同规则板 0.8 §10.5 的做法），在下表的时刻调用；接口到位之前它什么都不做，事实照旧在违规流水、快照流水、图的历史与会话日志里，不丢。写失败不影响工具与规则，每个宿主进程告警一次，行健康不降级。指标流水的设计定了写入口之后只改这一个文件。

| 事件 | 何时 | 内容 |
| --- | --- | --- |
| `design.proposal-shown` | `propose_to_human` 成功返回 | `kind`、`number`、目标 id、模块 id（带 `module` 的 `release`）、待决 id、`attach` 的前缀、`text` 的码点数、是否再给人看一次 |
| `design.answer-recorded` | `record_human_answer` 成功返回（一次调用一条，面板设计 0.6 §5.6 的计数单位） | `kind`、`answer`、`outcome`、目标 id、模块 id、待决 id、从那次提议到含第一段原话的那条人的消息的毫秒数、原话的码点数、前一条主 Agent 的消息里有没有「我记成」 |
| `design.answer-refused` | `record_human_answer` 返回错误 | `kind`、原因码（`words-not-found`、`words-off-boundary`、`not_shown`、`gate_unmet`、`unavailable`、`stale_revision`、`invalid`） |
| `design.holder-moved` | 持有者记录建、换、删 | 怎么来的（`wish`、`here`、`takeover`、`unreadable`、`off`）、原会话 id、新会话 id |
| `design.rule-denied` | §3.11 表里任何一条拒绝 | 规则 id、原生工具名、会话种类 |
| `design.bypass-refused` | §3.8 的告警 | 规则 id、会话种类、目标 id、阶段的原值与新值 |
| `git.snapshot` | 快照存好（含 `worktree remove` 的整件跳过） | 类别、存了什么（`S`、`W` 有无，`L_way`、`L_clean`、`L_wt` 的个数与字节数）、有没有打标签、被忽略文件的个数与字节数、耗时 |
| `git.snapshot-refused` | `git-snapshot` 拒绝 | 原因码（`step-failed`、`timeout`、`too-large`、`remote-unreachable`、`cd-unresolved`、`ignored-in-the-way`、`list-mismatch`、`push-snapshot`、`clean-ignored`、`clean-nested`） |

问人的次数、人读了多少字（`text` 的码点数）、拍板等了多久、跟没跟推荐（`answer`）都由这几条算出；对话正文不进事件。

### 3.13 拍板时要带数据的提议：`attach`（接缝裁定）

编排方的接缝裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」）：「M3's propose_to_human takes an optional attach payload that record_human_answer hands back to the proposing component; the rules board uses it for rule proposals.」规则板设计 0.8 §9.3、§10.7（M3 附录 0.3 的三条）与循环板设计 0.3 §7.1、§17（M3 附录 0.3 的第 1、2、5、6 条）按这条裁定向 M3 要了具体的形状，本节照做。

`attach` 的格式与分派（`src/design/attach.ts`，第 6 步建；表里的每一行由那块板合入时自己加，导入它自己的服务模块，M3 不导入板的其余代码）：

| 前缀 | 格式 | 服务（读取函数） | 提议前问 | 正文末行 | 认法 | 拍板之后 |
| --- | --- | --- | --- | --- | --- | --- |
| `rules:` | `^rules:p-[0-9a-f]{8}$` | `glmHournessRules`（`rulesService(ctx)`，`src/rules/service.ts`） | `attachable({cwd, proposal})` → `ok`，脚本提议带 `detail: {markdown, mustShow}`（规则板用循环板的 `scriptDetail` 组，规则板设计 0.10 §9.3；0.5 起，0.4 写的是没有 `detail`） | `proposalLine(id)` | `proposalIdOf(body)` | 拍板前再问一次 `attachable` 并核对「给人看过原文」（§3.5 第 5a 步）；拍板之后 `acceptProposal({questionId, graphDir, cwd, by: {actor: 'llm', relay}})` |
| `loops:` | `^loops:lp-[0-9a-f]{8}$` | `glmHournessLoops`（`loopsService(ctx)`，`src/loops/service.ts`） | `attachable({cwd, proposal})` → `ok`，脚本提议带 `scriptDetail` 组的 `detail`，人加的检查提议带 `commandDetail` 组的 `detail`（编排方的裁定「Check entries seam」） | `loopProposalLine(id)` | `loopProposalIdOf(body)` | 同上一行：拍板前再问一次 `attachable` 并核对（§3.5 第 5a 步）；拍板之后 `acceptProposal(同上)` |

- 表是空的时候（两块板都还没合入），带 `attach` 的调用 `invalid`，`field: 'attach'`，`hint`「no component in this composition takes attach <前缀>」。前缀不在表里同样处理。服务不在、读取函数因成员形状不对返回 `undefined`、或 `attachable` 答 `ok: false` 时 `invalid`，`field: 'attach'`，`hint` 带那一方给的 `message`（服务不在时为「the <规则板 | 循环板> is not running here」）。
- `propose_to_human`：带 `attach` 时，新提的待决的 `body` 是 `detail.markdown`（有时）一段、空一行、那一方的提议行（放在最后）；给人看的 `text` 在四行之后接 `detail.markdown`（`renderProposal` 的第三个参数，§3.3）。`detail` 由那一方的 harness 写，不受四行的一行与加粗规则管；M3 只查形状与上限：`AttachDetail = {markdown: string, mustShow: string[]}`，`markdown` 是 1–6000 个码点的字符串，`mustShow` 是 1–8 片、每片 1–4000 个码点的字符串（0.5 起照循环板设计 0.6 §17 M3 第 9 条与规则板设计 0.10 §10.7 M3 第 2 条；0.4 的 1–800 与 1–13 片每片 400 作废，因为人看的是整段脚本，两块板的脚本原文至多 4,000 个码点、100 行），不合时当作 `attachable` 答了 `ok: false`。`hournessTalk` 的 `after` 至多 16,000 个码点，放得下 6000 的原文加四行与主 Agent 自己的几句话，不用改；`propose_to_human` 的 `text` 因此最长约 6,300 个码点，工具结果与身份节的字数上限无关（身份节只放说明）。人补充或否掉之后重提：带 `question` 与新的 `attach`，正文整段换掉（§3.4）；只是把已有的待决再给人看一次时不带 `attach`，用 §3.4 的「再给人看一次」。
- `record_human_answer`（`question`、`agree`）：`decide` 成功之后，按表逐行用「认法」看正文末行；认出是哪一方，就调它的 `acceptProposal`，结果那一行放进 `handedBack`（文字照规则板设计 0.8 §9.3 的表、循环板设计 0.3 §7.1 的表）。`acceptProposal` 不抛错；它的 promise 若被拒，`handedBack` 写「could not hand back to the <板>: <原因>; it reconciles from the graph within a minute」，拍板照旧成功（两块板都按图上的拍板在 60 秒内补写，规则板设计 0.8 §9.3 第 5 条、循环板设计 0.3 §7.1 第 5 步）。服务不在时什么都不多写，由那块板的补写接上。`add`、`reject` 不交回（那一方的提议仍是 `open`）。挂在 `src/design/record.ts` 一处。
- 不做：`graph_decide`（带转述的 `llm`）的拍板要不要交回由那两块板自己定（规则板 0.8 写的是图行也交回，循环板 0.3 写的是只认 `record_human_answer`；面板设计 0.7 §11 第 6a 条后面板的 `/graph-apply` 已删，`graph_decide` 是图行里剩下的那一个调用方），M3 不改图行。

### 3.14 两层循环里的放行：每个模块一次（`d-design-onepage` 扩到产品，第 4 轮 M2）

人在 2026-10-30T05:19Z 定：用户的项目同样按两层循环走（relay「两层循环加，我正想说这个事情呢」）。访谈与设计放行之后，主 Agent 和人先定框架、模块清单和方向清单（记在图上），然后每个模块各有一份设计和一页人话放行稿，人在对话里同意（一个四行方案）之后才派这个模块的开发（`.agents/tasks/design-context.md`「Two-level loop in the product」；`d-design-onepage` 正文：「放行一侧归 M3（每个模块一次放行，四行方案），开发中的三档与成批归 M7，方向清单与模块在面板上的显示归面板」）。0.4 与附录 0.4 是「一个目标一次放行」，下面是 M3 这一侧的设计。契约按面板设计 0.7 §4.11 与 §11「两层循环」，与它不同或补充的地方集中写在 §3.14.9。

#### 3.14.1 形状与读法：`src/graph/modules.ts`

纯函数模块（图目录，不用 Node 内置模块；宿主与客户端都导入；面板设计 0.7 §11「两层循环」M3 第 5 条：谁先合入谁建）。图上没有新的节点类型，也不加字段：

- 模块：目标的直接子节点，类型 `feature`，带 `stage`，状态已批准、进行中或完成。只认直接子节点；模块下面又挂带 `stage` 的特性，照普通特性（面板设计 0.7 §4.11 边界情况）。大循环放行写出的模块都是先带 `stage`、后批准的（§3.14.2），所以这条流程不会留下「已批准而没有 `stage`」的直接特性子节点；图上有这样的节点，是 0.4 流程放行过的特性，或放行之后新加的特性，不是模块（新加的由 §3.8 第二条 c、d 拦下）。
- 模块候选：目标的直接子节点，类型 `feature`，状态 `proposed`，没有被废弃或取代；带不带 `stage` 都是候选。大循环放行时，候选批准为模块；批准之前先给它写 `stage: design`（§3.14.2 第 2 步），所以放行中途停下时，候选可能已带 `design`，仍是候选、`isSplit` 仍为真。候选的 `stage` 值不起作用：`effectiveStage` 对提议状态的节点按提议算（`src/graph/stage.ts`:90–93），`isReleased` 对候选恒为假。候选还没放行，它自己和子孙在 `moduleOf` 里按「模块还没放行」处理（下面）。
- 框架：目标的直接子节点，类型 `decision`，状态已批准或完成。模块自己的设计决策挂在模块下面，不挂在目标下面。
- 方向清单：类型 `norm`、id 固定为 `norm-directions` 的节点，整张图一份（同 `norm-merge-gate` 的写法）；每条方向是它 `acceptance` 的一项。
- 分了模块的目标（`isSplit`）：有模块或模块候选的目标。分了模块的目标走两层循环，没分的目标（例如只有任务、没有特性的小目标）照 0.4 一次放行。

```ts
export const DIRECTIONS_ID = 'norm-directions'
export function directionsOf(graph: LoadedGraph): GraphNode | undefined                       // 存在、类型 norm、状态不是 done、dropped、superseded
export function frameworkOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[]         // 面板设计 0.7 §11「两层循环」M3 第 5 条的三个读法
export function modulesOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[]           // 按第一条历史的时间，再按 id
export function moduleCandidatesOf(graph: LoadedGraph, goal: GraphNode): readonly GraphNode[]  // 0.5 新加：大循环放行集合里的模块
export function moduleOf(graph: LoadedGraph, node: GraphNode): GraphNode | undefined           // 0.5 新加：node 自己或最近的祖先，属于 modulesOf 或 moduleCandidatesOf(它的目标)；候选也返回，调用方用 isReleased 区分
export function isReleased(module: GraphNode): boolean                                          // 0.5 新加：已批准、进行中或完成，且节点自己的 stage 是 release 或之后；候选与 design 中的模块为假。「完成」也算已放行（完成的模块下面重开一个任务做返工时，`design-before-release` 不该挡它）。M7 设计 0.5 §2.4 把它复述成「已批准或进行中」并写「对完成的模块为假」，再另加「完成而阶段在 release 或之后」一支；本附录的 `isReleased` 已含完成，M7 那一支的结果相同、可以删，两边对一遍时以本附录为准（第 5 轮 R5-N3）
export function isSplit(graph: LoadedGraph, goal: GraphNode): boolean                          // 0.5 新加：modulesOf 或 moduleCandidatesOf 不空（候选带不带 stage 都算，放行中途停下时靠这一点重放，§3.14.2）
```

后四个是 M3 的放行与只读规则要的，面板只读前三个。模块清单只在大循环里定：大循环放行之后再加一个模块，要先把目标退回 `design`（§3.14.8），所以放行之后的目标下新出现的、还没有 `stage` 的特性，由 §3.8 第二条 c、d 在带原话批准时拦下；不带原话的提议照常是 `proposed`，等下一次大循环放行。

#### 3.14.2 大循环放行（目标一级，不带 `module`）

分了模块的目标，`propose_to_human {kind: 'release', goal, page}` 放行的是框架、模块清单与方向清单；不分模块的目标不变（0.4 §3.3.2 的六条，`page` 不收）。

放行集合 `bigLoopSet(graph, goal)`：目标子树里除目标以外的全部 `proposed` 节点，去掉模块与模块候选的子孙（它们属于各自模块的放行），模块候选自己在集合里；按深度、再按创建时间、再按 id 排序，父节点在子节点之前。门禁 `releaseGate(graph, goal)` 全部成立才能提议，在 0.4 的六条上改与加：

1. 目标已批准，有效阶段为 `design`（同 0.4）。
2. 放行集合不空。例外：目标已有带 `stage` 的模块（两种情形：退回大循环之后再放行，框架的改动已经由带原话的写入落在图上；或上一次放行写完所有批准、还没写到目标的 `release` 就停了，重放，下面「同意之后」）。没有「已批准而没有 `stage` 的模块」这一种中间状态，所以这一条不用为它另开例外（第 5 轮 R5-M2）。
3. 框架：`frameworkOf` 与放行集合里的决策合起来至少有一个；放行集合里的每个决策五栏都齐（0.4 §3.3.1 的五栏，「规划」一栏是以 `source` 连线指向这个决策的模块或任务）。
4. 放行集合里每个任务至少有 1 条验收条件（目标一级的任务；模块下面的任务在模块放行时查）。
5. 目标子树里模块子树以外没有未拍板的待决（状态 `approved` 或 `doing`），放行集合里的节点 `source` 指向的待决也都拍了板。
6. 放行集合里没有带 `supersedes` 连线的节点（同 0.4）。
7. 方向清单：`directionsOf(graph)` 有值，或放行集合里有 id 为 `norm-directions` 的 `norm` 节点；它的 `acceptance` 至少 1 条。缺时 `gate_unmet`，缺项 `directions`，`hint`「propose a norm node with the id norm-directions under the goal; each acceptance item is a product direction the human decided」。

另有一页稿 `page` 的覆盖检查（§3.14.5：每个模块候选、每个框架决策的标题和方向清单每条原文都在页里）。它查的是参数，不是图的状态，不成立返回 `invalid`（`field: 'page'`），不算门禁项。

同意之后（`record_human_answer`，§3.5 表）按下面四步写，次序是定死的（第 5 轮 R5-M2：0.5 初稿先批准、后写模块的 `stage`，所有候选都批准而一个 `stage` 都还没写时进程停下，目标的 `isSplit` 为假，重放会落进单层放行，一次批准所有模块子树）：

1. 重查大循环放行门禁（上面七条）；不成立时 `gate_unmet`，图不变。
2. 先写模块的 `stage`：对这次放行集合里的每个模块候选，`stage` 不是 `design` 时 `edit` 设 `stage: 'design'`，带 `relay`，`reason` 以 `ANSWER_MARKS.agree` 开头并含「（record_human_answer <callId>）」。候选此时仍是 `proposed`，格式允许特性带 `stage`（`src/graph/format.ts`:378）。`rev` 取提议时记下的修订号，成功后用结果里的新 `rev` 当作这个候选在下一步的批准修订号（这一次 `edit` 是 harness 自己的改动，中间没有别人的写入，所以人看到的那一版没有变）。已经是 `design` 的跳过，不发 `edit`（引擎对什么都没改的 `edit` 返回 `invalid`，`src/graph/engine.ts`:613「set changes nothing」）；是别的值的（例如主 Agent 自己提议时写了 `release`）照写 `design`，所以没有哪个模块出生就是放行的。某个候选的 `edit` 报 `stale_revision`（提议之后被改过）或被拒时，它进 `skipped`，下一步不批准它：人批准的是他看到的那一版（0.4 §3.4.2）。
3. 按修订号逐个批准放行集合（父在子前，修订号取提议时记下的，第 2 步改过的候选取新 `rev`），带 `relay`，模块候选因此变成模块（已批准、带 `stage: design`）。`skipped` 的节点照 0.4 §3.4.2 处理。
4. 全部成功且放行范围里不再有提议时，`edit` 目标设 `stage: 'release'`，带 `relay`，`reason` 同上。目标在这一刻就进 `release`：框架、模块清单和方向清单定了；模块各自还在 `design`，没有哪个模块的开发被放行。目标一级的 `release` 不等于任何模块开工，所以 `d-auto-drive` 的接手点是模块的放行写入（§9 第 7 条）。

这个次序下，停在任何一步之后留下的图都是 `isSplit` 为真的：第 2 步中途停，是一部分候选带了 `design`、全部仍是 `proposed`（`moduleCandidatesOf` 照常返回它们）；第 3 步中途停，是一部分已成为模块、其余是带 `design` 的候选；第 4 步之前停，是全部已是模块、目标仍在 `design`（门禁第 2 条的例外）。三种都由 `releaseGate` 按大循环门禁判，`page` 照样必填，不会落进单层放行。重放同一次回话（再提一次、人再说「可以」）：第 2 步跳过已带 `design` 的候选，第 3 步只批准还是 `proposed` 的，第 4 步写目标；这是 0.4 §3.4.2「部分失败」那条的延伸，不另设恢复命令。哪一步停下、停下时图是什么样，节点历史里按 `reason` 的调用 id 查得到。

#### 3.14.3 模块放行（`kind: 'release'` 带 `module`）

`moduleReleaseGate(graph, goal, module)`（`src/graph/stage.ts`）全部成立才能提议：

1. 目标已批准、进行中，有效阶段在 `release` 或之后：大循环已放行。
2. `module` 在 `modulesOf(graph, goal)` 里，状态已批准或进行中，有效阶段为 `design`。
3. 模块放行集合 `moduleSet(graph, module)`：模块子树里除模块自己以外的全部 `proposed` 节点，排序同上。集合不空；例外：模块被退回过设计（模块的历史里有一条 `stage` 由后面的阶段改回 `design`，§3.14.8），改动已经由带原话的写入落在图上。
4. 模块下面（直接子节点）至少有一个决策，放行集合里的每个决策五栏都齐，「规划」一栏是模块子树里以 `source` 连线指向它的特性或任务。模块自己的设计决策挂在模块下面（面板设计 0.7 §11「两层循环」M3 第 2 条）。
5. 放行集合里每个任务至少有 1 条验收条件。
6. 模块子树里没有未拍板的待决，放行集合里的节点 `source` 指向的待决（包括目标一级的）也都拍了板。
7. 放行集合里没有带 `supersedes` 连线的节点。

另有 `page` 的检查（§3.14.5：页里有这个模块的标题），同样是参数检查，不成立返回 `invalid`（`field: 'page'`）。

同意之后：按修订号逐个批准模块放行集合（只动模块子树，不碰别的模块、不碰目标）；全部成功且模块子树里不再有提议时，`edit` 模块设 `stage: 'release'`，`reason` 以 `ANSWER_MARKS.agree` 开头并含「（record_human_answer <callId>）」（面板设计 0.7 §11「两层循环」M3 第 3 条），后面接一页稿的摘要（§3.14.5）。部分失败同 0.4 §3.4.2：跳过的节点进 `skipped`，模块的阶段不改，改好后再提。

门禁不成立时，`propose_to_human` 返回 `gate_unmet`，`message` 按缺项列出，每项带该怎么补的 `hint`，人看不到提议（同 0.4 §3.3.2 的「卡片不出现」）。

#### 3.14.4 三种放行各批什么

| 放行 | 工具参数 | 批准的节点 | 写的阶段 |
| --- | --- | --- | --- |
| 没分模块的目标 | `release`，`goal` | 目标子树里全部 `proposed`（0.4 §3.3.2） | 目标 `release` |
| 分了模块的目标，大循环 | `release`，`goal`，`page` | `bigLoopSet`：框架决策、模块候选、`norm-directions`、目标一级的任务（§3.14.2） | 这次批准的模块候选 `design`；目标 `release` |
| 一个模块 | `release`，`goal`，`module`，`page` | `moduleSet`：模块子树里的 `proposed`（§3.14.3） | 模块 `release` |

模块放行只动自己的子树：不批准别的模块、不改目标的阶段、不改方向清单。会话投影里 `Shown` 记 `kind`、`goal`、`module`（§3.2），`record_human_answer` 只认与自己参数全同的那一项（§3.5 第 4 条），所以给人看过模块 A，记不了模块 B 或目标一级的放行。

#### 3.14.5 一页放行稿 `page`

`d-design-onepage`：每个模块先写设计，再写一页人话放行稿（做出来人会看到什么、它自己会做什么、什么时候来问人、替人定了哪些方向），人看这一页放行之后才进开发。面板设计 0.7 §11「两层循环」M3 第 3 条把「一页放行稿在对话里给人看」交给 M3。做法：

- `propose_to_human` 的 `release` 带 `page`（分了模块的目标的两种放行都必填，没分模块的目标不收）：1–`PAGE_LIMITS.max`（2,000，§11）个码点的 Markdown 字符串。`renderProposal` 把它原样接在四行之后，同 `detail`（§3.3、§3.13）；工具结果的 `message` 同样加一句「不做之后的部分是人放行之前必须看到的原文，原样放进回复」。
- 内容由工具说明与阶段提醒告诉主 Agent：模块的页分四段，段首标签 `你会看到什么：`、`它自己会做的：`、`什么时候问你：`、`替你定了的方向：`（取自编排方给人看的放行稿的写法）；大循环的页分三段，`框架：`、`模块：`、`你定过的方向：`。标签与行文 harness 不查（查标签只会逼出凑数的段落），harness 查的是会让人看漏的事：
  - 大循环：`page` 里有放行集合里每个模块候选与每个框架决策的标题，以及方向清单每条 `acceptance` 的原文；缺哪一个 `invalid`，`field: 'page'`，`hint` 写出第一个缺的。
  - 模块：`page` 里有这个模块的标题。
  - 比较之前两边都做 NFKC 与空白合一（同 `personSaid` 的规整）。
- 给人看过：`record_human_answer` 的 `release` 带 `page` 提议时，核对这一页整段在 `Shown.after` 里（§3.5 第 5b 步），不在 `not_shown`。
- 留痕：页的内容留在会话日志（工具调用与结果）；图上不存全文。阶段写入的 `reason` 末尾加「 · 一页放行稿 <摘要>」，摘要是规整之后 `sha256` 的前 8 个十六进制字符（`pageDigest`，`src/design/record.ts`），事后能用调用 id 找到会话日志里的那一页并核对摘要。面板的 `answerKindOf` 与 `answerCallOf` 读 `reason` 开头与括号里的调用 id，不受末尾这一段影响。
- M3 不在运行时拦页里的行话，同问题的字段：写法检查归 plain-ui，标定里数（§2.8、第 12 步（a））。

#### 3.14.6 设计期只读按模块判（`design-before-release`）

0.4 §3.3.3 的判定表在「有效阶段为 `release` 或之后 → 放行」一行之前加一行：目标的有效阶段在 `release` 或之后，而根（主 Agent）的焦点在某个模块或模块候选里（`moduleOf(graph, 焦点)` 有值），且 `isReleased` 为假（模块的有效阶段是 `design`，或是还没批准的候选）→ 拒绝。越界一句：`You were dispatched (directly or through other subagents) by the main agent, whose focus is in module <id> (<title>) of goal <goal id>, and the human has not released that module yet: nothing in a module is built before its release.` 纠偏的正路一句加：`The main agent puts the module to the human with propose_to_human (kind release, module <id>); once the module is released, the work can be dispatched again.` 其余各行不变：目标自己在 `wish`、`interview`、`design`（含框架在改、目标退回了大循环）仍整个目标拒绝；焦点不在任何模块里（含焦点在目标一级，见下面第二段），或在已放行的模块里，放行。读模块（`moduleOf`）抛错与读图抛错同一类：放行（fail-open），行健康记原因。

规则只看根的焦点，焦点是一个节点：主 Agent 焦点在已放行的模块 A 时，它派出去、写模块 B（还在设计）的子 agent 这条规则拦不住。结构上的挡法是 M7 的派发只派已批准的任务，而模块 B 下面的任务在 B 放行之前都是 `proposed`（§3.14.7 的 `initialStatus` 收窄保证，今天挂在已批准特性下的任务会直接批准）；M7 合入之前只靠阶段提醒里的「模块放行之前不动它」一句，记在 §10。

同类的另一种情形（第 5 轮 R5-N1）：分了模块的目标在大循环放行之后是 `release`，所有模块都还在 `design`；主 Agent 的焦点停在目标一级（或任何不属于模块的节点）时，判定表放行，一个模块也没放行就能派出写文件的子 agent。这是有意留的：规则只看焦点所在的节点，不去猜主 Agent 要子 agent 做哪个模块的事。挡法同上两层：模块下面的任务在模块放行之前出生为 `proposed`；M7 合入后用 `releaseOf` 取代这一行的判定（M7 设计 0.5 §2.4、§3.2.2）。M3 合入到 M7 合入之间只剩提示：身份节第一部分与上面的正路一句都写成「目标或它的模块」放行之后才能派写文件的活，阶段提醒里加一句 `Before you dispatch a subagent that writes, graph_focus to the module or the task it belongs to.`（§2.3，在大循环放行之后的目标一级提醒和模块设计中的提醒里各有一份）。这是残余，不是缺口，理由同 §10 的那一条：写出来的文件在 git 里可见、可退，模块放行时人看的是一页放行稿，不是文件。

#### 3.14.7 阶段的写权限：谁能动模块与目标的阶段

面板设计 0.7 §11「两层循环」M3 第 4 条把这件交给 M3，`docs/ORCHESTRATION.md` §4.8 的「特性上的阶段只读」随之改写（§8 表）。下表是全部的写路径，没有列出的写法都被拒：

| 节点 | 转换 | 谁、经哪条路 | 要人的原话吗 |
| --- | --- | --- | --- |
| 目标 | 无 → `wish`、`wish` → `interview` | 主 Agent 提议、改自己的提议（0.4 §2.4） | 不要 |
| 目标 | `interview` → `design` | `record_human_answer` 的 `confirm` | 要，harness 核对（§3.6） |
| 目标 | `design` → `release` | `record_human_answer` 的 `release`，不带 `module` | 要，harness 核对 |
| 模块候选 | 无 → `design` | 同一次大循环放行里的 `edit`，在批准它之前写（§3.14.2 第 2 步） | 要，随目标一级的放行 |
| 模块 | `design` → `release` | `record_human_answer` 的 `release`，带 `module` | 要，harness 核对 |
| 目标 | `release` 或之后 → `design`（退回大循环，第三档） | 主 Agent 的 `graph_edit` 带 `relay` | 要，`main-agent-graph-relay` 核对 |
| 模块 | `release` 或之后 → `design`（退回模块的设计循环，第二档） | 主 Agent 的 `graph_edit`，不带 `relay`（下面的引擎例外） | 不要，也不带「同意」记号 |
| 目标、模块 | 图工具向前改阶段 | 谁都不行（§3.8 第二条 a） | — |
| 目标、模块 | `decompose` 及以后 | M7 的 `derivedStage` 从图算出，不存阶段 | — |

引擎的两处改动（`src/graph/engine.ts`，第 9 步）：

- `planEdit` 的一处例外：不带人的权限的写入（`llm`、`harness`）今天改不了特性的 `stage`（`LLM_EDITABLE` 里没有它，除非是自己还开着的提议）。加一条：同时满足以下全部时允许——节点是模块（类型 `feature`、父节点是目标、状态已批准或进行中）；`set` 里只有 `stage`，值是 `design`；节点现在的有效阶段是 `release` 或之后；`reason` 非空且不以 `ANSWER_MARKS.agree` 开头（退回不是同意，面板不能把它读成「你在对话里说」）。不满足时照旧 `forbidden`，`reason` 以同意记号开头的 `invalid`。历史记 `actor`、`from`、`to`，M7 的批次与周报据此数退回。第二条 e 保证只有主 Agent 的会话走得到这条例外。
- `initialStatus` 的一处收窄：今天任务挂在已批准或进行中的特性或任务下就直接是 `approved`（`src/graph/engine.ts`:423–425〔实读〕）。大循环放行之后模块是已批准的特性，挂在它下面的任务会在模块放行之前就直接批准，既进不了模块的放行集合，也让 M7 只派已批准的任务这一道挡不住。所以任务挂在还没放行的模块或模块候选下（`moduleOf` 有值且 `isReleased` 为假）时，不论挂在多深，出生为 `proposed`；模块放行之后挂的任务照旧直接批准。其余类型的初始状态不变：决策、特性在这些父节点下本来就是 `proposed`，待决、风险、复盘挂在开着的节点下直接批准（它们要人答，不进放行集合）。

#### 3.14.8 两条退回

- 退回模块的设计循环（第二档，改到本模块的设计方向）：主 Agent 判定（三档的判定归 M7），`graph_edit` 把模块 `stage` 改回 `design`，`reason` 写为什么退回。模块下已批准的节点保持已批准；新的设计以提议加进模块子树，走 §3.14.3 的门禁（放行集合不空的例外覆盖了「改动已经落在图上」的情形）。模块的阶段回到 `design`，§3.14.6 对它的子孙重新生效，人再看一页新的放行稿、再同意一次才恢复。主 Agent 在下一批问题里告诉人是 M7 的事（M7 三档与成批，面板设计 0.7 §11「两层循环」M7 第 7、8、9 条）。
- 退回大循环（第三档，改到框架）：人说框架要改，主 Agent 带人的原话 `graph_edit` 把目标 `stage` 改回 `design`（今天就是这条路，0.4 §2.4 末句）。模块的阶段不动；目标回到 `design` 之后 §3.14.6 的第一行使整个目标下的子 agent 只读，比「受影响的活」粗，M7 要缩小范围时只改那一行的判定。再放行走 §3.14.2，放行集合可以空，只给这次新批准的模块候选写 `design`，已放行的模块保持原阶段；哪些模块因框架改了要退回设计，由主 Agent 逐个按第二档处理。面板读到「目标的有效阶段回到 `design`、下面已有模块」就显示框架在改（面板设计 0.7 §4.11）。

#### 3.14.9 与面板设计 0.7 §11「两层循环」的对照

面板设计 0.7 §4.11 写的读法和 §11「两层循环」里 M3 的五条是契约（§11 开头 M3 一节另有按序号编的第 1–9 条，下表写「第 6 条」的是其中的工具名常量一条）：面板只读，形状由 M3 定，定稿时与 §4.11 不同，面板改 `src/graph/modules.ts` 一处。逐条：

| 面板设计 0.7 §11 | 本附录 | 一致与补充 |
| --- | --- | --- |
| 「两层循环」M3 第 1 条：大循环放行集合里有框架、模块、方向清单；同意时给每个模块写 `stage: 'design'` | §3.14.2、§3.5 表 | 一致；补充两点：只给这一次新批准的模块写，重放与退回大循环后的再放行不重置已放行的模块；`stage: design` 在批准之前写在候选上（面板设计 0.7 §11 没有规定先后），这样放行中途停下时 `isSplit` 仍为真、重放走大循环门禁（第 5 轮 R5-M2） |
| 「两层循环」M3 第 2 条：模块自己的设计决策挂在模块下 | §3.14.3 第 4 条 | 一致，并作为模块放行门禁的一项 |
| 「两层循环」M3 第 3 条：`kind: 'release'` 多可选参数 `module`；结果正文带上它；同意时批准模块子树里的提议，模块 `stage` 由 `design` 改为 `release`，`reason` 带 `ANSWER_MARKS.agree` 与调用 id | §3.4、§3.5、§3.14.3 | 一致；补充：多一个 `page` 参数与「给人看过」的核对（§3.14.5），一页放行稿面板不显示全文 |
| 「两层循环」M3 第 4 条：写模块与目标 `stage` 的权限由 M3 在引擎里定；改写 ORCHESTRATION.md §4.8 | §3.14.7、§8 | 一致；引擎只加两处：模块退回设计的例外，和还没放行的模块下的任务不再直接批准（今天挂在已批准特性下的任务出生就是已批准，进不了模块的放行集合），其余不放宽 |
| 「两层循环」M3 第 5 条：`src/graph/modules.ts` 的 `DIRECTIONS_ID`、`directionsOf`、`frameworkOf`、`modulesOf` | §3.14.1 | 一致；多四个：`moduleCandidatesOf`、`moduleOf`、`isReleased`、`isSplit`（面板可以不读） |
| §11 开头 M3 一节的第 6 条（工具名常量）：`shownProposalOf(isError, text)` 返回 `{kind, goal, module?}` | §3.2 | 一致；返回整个结果对象，面板只读那三个字段 |
| §4.11「等你放行」：模块有效阶段 `design` 且主 Agent 会话的 `awaiting` 里有 `kind: 'release'`、`module` 为这个模块的一项 | §3.4 输出的 `module` | 一致，`module` 缺省是目标一级的放行 |
| §4.11 框架在改：目标的有效阶段回到 `design` 而下面已有模块 | §3.14.8 | 一致 |

与第 4 轮评审（M2）改法 A 不同的一处：评审写「目标的 `release` 阶段在最后一个模块放行时才到」。0.5 不照做，因为面板设计 0.7 §4.11 把「目标回到 `design`」定义为「框架在改」，这要求目标在大循环放行时就已经是 `release`、框架定了，模块各自在设计；若目标要等最后一个模块放行才到 `release`，目标在整个模块设计期都停在 `design`，面板就分不出「框架在改」和「模块还在设计」，目标一级的写权限也没有可退回的状态。其余照评审改法 A：模块是目标下的 `feature`，方向清单是带固定 id 的节点（评审提议的标记写法这里取固定 id，同面板设计 0.7 §4.11），`propose_to_human` 的 `release` 加 `module`，放行集合按模块算，`design-before-release` 按模块判，L2 与第 12 步（a）各加两个模块的例子（第 9 步、第 12 步）。

## 4. 逐步的改动

每步的门禁、提交、文档同批与 0.4 §8 相同。「今天必败」写的是新增或改了的检查；0.4 原有的检查不变时不重复。「验收（待人改）」列这一步碰到的、要请人改字句的验收条件（§9 第 1 条）：实现照本附录做，L2、L3 按本附录写；人改字句之前，图上的旧字句与本附录冲突的地方以人后来的决定 `d-chat-not-cards`、`d-one-main-agent` 为准，并在第 12 步（b）合入前由编排者确认人已改好。

### 开工之前：两个工作树快进到 main

`.worktrees/m3`、`.worktrees/m3-flow` 都在 `eb614ab`，分支没有自己的提交；在两个工作树里各跑 `git merge --ff-only main`（main 当时的提交），装依赖、`npm run build`。快进失败（分支上有了提交）时停下交编排者。原因见文件头：`6134c83` 改了行命名、`scripts/packages.mjs`、探针脚本与客户端入口，`zcode-3171-follow` 与 prompt-fixes 改了 `src/glm-prompt/`、`src/guard/rules.ts` 与逐字门禁，M3 的改动都碰这些文件。快进之后按当时的 main 核对本附录引的行号（N3），对不上的按内容找，不按行号改。

### 第 3 步（m3-1：主 Agent 模式、持有者与身份）

变化：

- 行登记按 `6134c83` 的命名：`packages/hourness/cordis.patch.yml` 在 `glm-hourness/graph-panel` 之后、`glm-hourness/ui` 之前插 `{id: glm-hourness/design, name: dsh-hourness/design, disabled: true}`；`scripts/packages.mjs` 的 `hourness.src` 加 `design`、`rows` 加 `{id: 'glm-hourness/design', module: 'design/index'}`；`packages/hourness/locale/design/zh.json`、`en.json` 写设置页的标题与说明（「主 Agent 与设计循环」：「/wish 让一个会话当这个项目的主 Agent：在对话里问清楚、出方案给你批，自己不写文件。」）。`tests/contracts.spec.ts` 的字面行 id 清单加一项。
- `/wish` 与持有者记录（§2.4，`src/graph/main-agent-holder.ts`、`src/design/mode.ts`）：含 `/wish here <一句话>`（N9）、`holderFileOf` 与 `holderHome`（N4）、`agent/created` 的对齐排到 `whenIdle()` 之后、`commands.execute` 返回 `undefined` 当失败（N7）。
- 身份节（§2.2）；新建 `src/design/talk.ts`（本步只有 `TALK_GUIDE`、`HIDDEN_FROM_MAIN_AGENT` 与 `ProposalKind`；`TALK_GUIDE` 里的两个工具名是字面，工具名常量在第 6 步进 `src/shared/tool-names.ts`）与 `src/graph/plain-question.ts`（§2.8，例题是高峰模式里「派出去的活怎么排」，主 Agent 照常回话，第 4 轮 M1）。
- `installAgentHooks` 多装 `roleFace`（§2.1），本步只有主 Agent 的一支：去掉原生名为 `write`、`edit` 的工具与原生名为 `ask_user_question` 的工具（都经 `toNativeTool`，N11），收窄 `str_replace_editor`。人设一节不在这一步。
- `/wish` 的成功回复加强一档模型的一句（§2.6）；`docs/ORCHESTRATION.md` §3.5 补两句；`/wish` 的错误与行健康说明按 §2.8 改两处字串；`docs/ORCHESTRATION.md` §3.1 写「一个项目一个主 Agent」与 `/wish here`。
- 模拟人在这一步只有骨架：发 `/wish`；卡片请求以 `ASK_CANCELLED` 拒绝并记 `unexpected-question`；没有配置回话时不回。

验收（待人改）：`m3-1` 第 3 条（§9 第 1 条的新字句）。本步做到去掉写文件的工具与 `ask_user_question`；两个设计工具在第 6 步加上。

L2（`tests/design-mode.spec.ts`、新 `tests/main-agent-holder.spec.ts`、新 `tests/plain-question.spec.ts`）：

- 身份节：第一部分不超过 1,500 字符、含五项；第二部分等于 `TALK_GUIDE` 加换行加 `PLAIN_QUESTION_GUIDE`，不超过 1,400；整节不超过 2,700；§2.2 列的不许出现与必须出现的字样。删去 0.4 里「长度上限 9000」一例。
- 工具面：主 Agent 的组装结果没有 `Write`、`Edit`、`write`、`edit`、`ask_user_question`（有方言服务与没有方言服务各一遍，后者走静态表），`str_replace_editor` 的 `command` 只剩 `view`（假宿主的组装带上这几个工具），形状不对时去掉并报会话健康；`roleFace` 不带 `prepend` 注册，在一个外层 `prepend` 监听器里 `next()` 得到的工具已经去掉（两种安装先后各一遍）；普通会话的工具面不变。
- 持有者（真实的临时目录当 `userHome`）：第一个会话 `/wish` 建记录；第二个会话 `/wish` 得到指路的回复、角色不变、不写待生效状态；`/wish here` 之后记录换人、原会话（活的）收到 `/wish off` 的命令事件、投影为假；原会话不活时在它下一次 `agent/created` 对齐；fork 出的会话在 `agent/created` 变回普通会话；记录指向已不存在的会话时接管并说明；记录损坏时 `isMainAgent` 按投影判并报 degraded，`/wish` 覆盖它；两个会话同时 `claimHolder` 只有一个成功；持有者 `/wish off` 删记录，非持有者的 `/wish off` 不删；`projectKey` 对大小写不同（win32）与 junction 到达的同一目录相等。另加：`/wish here 记一笔账` 在别处有主 Agent 时移过来并从许愿开始，回复与待生效状态同「一句话」；别处有主 Agent 时 `/wish 记一笔账` 的回复含「/wish here 加这句话」（N9）；fork 出的会话在 `agent/created` 监听器返回之前没有执行 `/wish off`，在它第一次空闲之后执行，在那之前它的组装已没有身份节（N7）；假的 `commands.execute` 返回 `undefined` 时告警一次、行健康 degraded（N7）；`holderFileOf(userHome, dir)` 等于 `holderFile(userHome, projectKey(dir))`。
- 工具面另加（N11）：假方言服务把一个别名（例 `AskUserQuestion`）映射到 `ask_user_question` 时，主 Agent 的组装结果里没有这个别名。
- 字串：`/wish` 的成功文字含「强一点的模型」；`/wish` 的全部回复与行健康说明 `plainWordsIn` 为空。
- `tests/plain-question.spec.ts` 按 §2.8 的表。

今天必败：同 0.4（没有 `wish` 命令）；另：照 0.4 写法实现时主 Agent 的组装结果里有 `Write`、`ask_user_question`，身份节第一部分超过 1,500；第二个会话 `/wish` 也成为主 Agent；导入 `src/graph/plain-question.ts`、`src/graph/main-agent-holder.ts` 失败。

L3：

- `glm-design-main`、`non-glm-design-main` 请求 3 的「工具面等于请求 1 的工具面加两个设计工具」改为「等于请求 1 的工具面去掉 `Write`、`Edit`、`ask_user_question`（非 GLM 为 `write`、`edit`、`ask_user_question`）」；第 6 步起加上两个设计工具（场景的期望随步骤扩展，每步都跑探针）。请求 8（`/wish off` 之后）恢复请求 1 的工具面。
- `glm-design-wish-idle`、`non-glm-design-wish-idle`（N8）：0.4 §9.1.3 的请求 1 写「有 `hourness:main-agent` 与两个设计工具」；本步只核对身份节与工具面去掉的三个工具，第 6 步起再核对两个设计工具。
- 新场景 `glm-design-one-main`（`probe-full`，模拟人 `wish: true`）：探针 provider 的脚本步加字段 `other: {line: string}`，第一次用到时经 `ctx.get('agents').create({sessionId: '<场景>-other', meta: {cwd}})` 建第二个根会话（headless 同样这样建会话，dsh-headless:316〔实读〕；探针里这样做是〔推断〕），再 `commands.execute(第二个 agent, line, [], signal)`，结果记进 dump（同 `line` 的记法）。脚本：请求 1 主会话已是主 Agent；`other: {line: '/wish'}` 的结果文本含「这个项目的主 Agent 在另一个会话里」与 `/wish here`；`other: {line: '/wish here'}` 成功；请求 3：主会话没有身份节、工具面恢复，消息里有「主 Agent 在另一个会话里」的 notice；持有者记录指向第二个会话；主会话 `Write .llm/x.txt` 执行。再加一步（N7）：脚本步 `fork: true` 经会话控制器 fork 第二个会话（探针里这样做是〔推断〕，做不到时这一步改在 L4 第 9 项里手工做），新会话的第一个请求里没有身份节、`hournessMainAgent` 投影在它第一次空闲之后为假，持有者记录仍指向第二个会话，探针的 dump 里没有「/wish off 执行失败」的告警。

依赖：开工之前的快进；`src/graph/main-agent.ts` 在 main。独立评审：是（`norm-review-floor` 第 1 条「主 Agent 与子 agent 的工具面」：本步按角色改工具面、定 `isMainAgent` 的新读法，它决定 `main-agent-no-write`、`design-before-release`、`git-snapshot` 与 `main-agent-graph` 适用与否；第 4 条「改用户配置目录（~/.dsh…）」：持有者记录写在 `<DSH home>/glm-hourness/main-agent/`，`src/shared/data-home.ts`:24、65）。

### 第 4 步（m3-1：`main-agent-no-write`、git 快照、`main-agent-ask`）

变化：

- `main-agent-no-write`：规则、判写、纠偏同 0.4（§3.1.4）。主 Agent 的工具面里已经没有写工具，这条规则是兜底；身份节不再逐条声明规则（§2.2 第一部分一句），0.4 §3.1.4「声明写在身份节里（第 3 条）」改为「身份节一句点名」。判写照旧继承 file-tools-only 的 `shellWrites`，git 子命令不算写（`src/guard/rules.ts`:122–128 的注释），这正是 `d-main-agent-shell` 要的。
- git 快照（§2.5）：`src/guard/git-snapshot.ts`、`src/guard/shell.ts` 的 `simpleCommands`；在同一个 `tools/pre-execute` 监听器里，先判写文件（拒绝），再判 git（存快照后放行，存不了时拒绝）。只对主 Agent（`isMainAgent`，自己就是根）。
- `main-agent-ask`：主 Agent 按名调用 `HIDDEN_FROM_MAIN_AGENT` 里的工具（经 `toNativeTool`）时拒绝；纠偏四段：事实 `You called ask_user_question.`；越界 `As the main agent you talk with the human in plain chat, without option cards.`；正路 `Ask in your reply in plain words, or put a plan to them with propose_to_human.`；例外 `none`。进违规流水；读角色或判定抛错时放行（fail-open，同 0.4 写入规则），会话健康 degraded。
- `src/guard/main-agent-rules.ts`（§3.11）：`MAIN_AGENT_RULES` 本步有 `main-agent-no-write`、`main-agent-ask`、`git-snapshot` 三条；规则板 R1 已在 main 时，同一提交在 `src/rules/builtin.ts` 的代码规则目录里按 §3.11 映射这三条（替换 0.4 的 `main-agent-no-write` 一条的写法），没在时只导出。`tests/contracts.spec.ts` 加 §3.11 的契约测试。

L2（`tests/design-guard.spec.ts`、新 `tests/git-snapshot.spec.ts`）：

- `main-agent-no-write`：同 0.4，另加主 Agent 按名直接调用不在工具面上的 `Write`、`write`、`Edit` 被拒并进违规流水；`DeferredToolCall {name: 'Write'}` 返回工具错误、目标文件不存在；`str_replace_editor` 的 `create`、`str_replace`、`insert` 被拒，`view` 放行；`git commit -m x`、`git status` 放行（不当写文件）。
- git 快照（真实 git，系统临时目录里的仓库，本地裸仓库当远端）：`git status`、`git log`、`git diff`、`git commit -m x`、`git fetch`、`git branch x` 不存快照；`git checkout -- a.txt`（`a.txt` 有改动）之后 `refs/hourness/snapshots/<id>` 存在、`git stash apply <S>` 恢复改动、`<项目根>/.llm/snapshots.jsonl` 里多一行（字段齐全，`repo` 是该仓库的 `git-common-dir`；`<git-common-dir>/hourness/` 目录不存在）、notice 正文含这条恢复命令；`git reset --hard HEAD~1` 之后标签 `hourness-snapshot/<id>` 存在、旧提交从它可达；`git branch -D x` 之后 `git branch x <原值>` 恢复；`git clean -fd` 之后被删的未跟踪文件能用 `git restore --source=<K> --worktree -- <路径>` 恢复；`git clean` 超过上限（测试把上限调小）时拒绝、文件还在；`git push --force` 之后远端旧的提交在 `refs/hourness/snapshots/<id>/remote/<分支>`；合并冲突没解决时 `git merge --abort` 照样存下（走 `W` 的退路）；`echo "git reset --hard"` 不触发；`cd $X; git reset --hard` 被拒；`git -C sub reset --hard` 在 `sub` 存快照；`!` 开头的别名当作 `both`；不是仓库的目录放行、不存；找不到 git 时放行并报 degraded；某一步失败（测试注入）时拒绝、进违规流水，纠偏是 `git-snapshot` 的四段；写流水失败时放行并报 degraded。 第 3 轮 M3、M4、N8 另加（都在临时仓库里，`LANG=zh_CN.UTF-8`、`LC_ALL` 不设与 `LC_ALL=C` 各跑一遍）：`other` 分支跟踪 `x.txt`、工作区有未跟踪的 `x.txt`，`git reset --hard other` 之后 `git restore --source=<K> --worktree -- x.txt` 拿回原内容；`git checkout -f other`、`git switch --discard-changes other`、`git restore --source=other -- x.txt` 同样各一例；挡路的是被忽略的文件时拒绝、文件还在、纠偏列出它的路径；中文文件名 `记账.txt` 与带空格、带 `*` 的文件名在 `git clean -fd` 之后都能恢复；`clean -n` 的核对被注入一行对不上时拒绝；`git clean -fdx`、`git clean -fX`、`git clean -ffd` 被拒、文件还在；`.env` 与 `node_modules/` 都在时 `git clean -fd` 的快照树里没有它们（`git ls-tree -r <K>` 查）；一个装了 25,000 个被忽略文件的工作树 `git worktree remove` 照样执行、流水有被忽略文件的个数与字节数、notice 有「被忽略的文件不在快照里」一行；工作树里有一个改过的已跟踪文件时 `git worktree remove --force` 之后它能从 `S` 恢复；`git push --mirror`、`git push --tags`（有快照标签时）、`git push origin refs/hourness/snapshots/<id>:refs/heads/x`、`git push origin hourness-snapshot/<id>`、推一个快照提交的 sha、`remote.origin.mirror=true` 时的 `git push` 都被拒，本地裸仓库里没有这些引用；`git push --force-with-lease origin refs/hourness/snapshots/<id>/remote/main:main` 放行；工作区干净时 `git checkout main` 不建引用、不发 notice、不记流水；`git branch -d` 一个已合入的分支不打标签、`git reset --hard HEAD~1` 丢一个只在本地的提交时打标签，标签指向的 `K_h` 的树是空树、父提交里没有 `S`；`git push --force` 改写一个已推送的提交时打标签。第 5 轮 R5-M1 另加（运行时文件的位置，都在临时仓库里）：主检出与 `.worktrees/x` 里各做一次 `git checkout -- a.txt`，两行进同一份 `<项目根>/.llm/snapshots.jsonl`，`rootFrom` 都是 `session`，`repo` 相同；会话的工作目录在一个不是仓库的临时目录里、命令是 `git -C <仓库> reset --hard HEAD~1` 时，流水落在那个仓库的项目根 `.llm/` 下，`rootFrom` 是 `repo`；会话的工作目录与被快照的仓库都找不到 `.git`（`GIT_DIR` 指到别处）时放行、行健康 degraded，磁盘上没有新建的 `.llm/`；`.llm/` 不存在时第一次写流水建出它和内容为 `*\n` 的 `.gitignore`，`.llm/` 已在、没有 `.gitignore` 时补上，已有的 `.gitignore` 不改内容；`git clean -fd` 之后 `.llm/snapshots.jsonl` 还在，且这一次快照的 `T` 里没有它；`.llm/` 是个普通文件（建不了目录）时放行、行健康 degraded「快照 <id> 已存，记录没写上」；快照期间 `GIT_INDEX_FILE` 指向系统临时目录里的 `glm-hourness-snap-index-*`，快照结束（成功与注入失败各一例）后那个目录已删，`<git-common-dir>` 下没有 `tmp-index-*` 也没有 `hourness/` 目录；流水文件删掉后 `git for-each-ref refs/hourness/snapshots` 仍列出全部快照，恢复命令照样可用。
- `main-agent-ask`：主 Agent 按名调用 `ask_user_question` 被拒并进违规流水，非主 Agent 照常。

今天必败：同 0.4；另：导入 `src/guard/git-snapshot.ts` 失败；主 Agent 的 `git checkout -- a.txt` 之后改动丢失、没有快照；按名调用 `ask_user_question` 被放行。

L3：`glm-design-main` 加三步：`Bash git status` 执行、没有 `glm-git-snapshot` notice；`Bash git checkout -- README.md`（场景先改一行 `README.md`）执行，下一步请求里有 `glm-git-snapshot` notice，探针的场景核对读到 `refs/hourness/snapshots/` 下一个引用；按名调用 `ask_user_question` 被拒，纠偏是 `main-agent-ask` 的。请求 3、4 的 `Write` 与 shell 写入此时是按名调用工具面上没有的工具，照样被拒，正好核对兜底。

依赖：`src/data/project-root.ts` 的 `projectOf`（快照流水的定位，§2.5 第 6 步；规则板设计 0.10 §7.3 与 M5 设计 §5.5 的同一个函数，谁先合入谁建；M3 先到时按 M5 设计 §5.5 的解析规则写：只读文件、不起 git 进程、按 `cwd` 缓存、返回 `{root, git}`，后到的一方直接用）。独立评审：是（`norm-review-floor` 第 1 条 guard 规则；第 3 条推送与改写提交历史：git 快照与对外检查碰用户的检出与远端，`docs/DEVELOPMENT.md` §1.1 第二类；本步另在项目的 `.llm/` 里建目录、写文件，在系统临时目录里建并删临时目录）。本步与别的分支同改 `src/guard/rules.ts`（导出 `fileWriteTarget`、`shellWriteOf`）：prompt-fixes 已在 main（`APPLICATION_PROTOCOL` 已删，例外段是 `ASK_THE_HUMAN`，:56），0.3 的那句协调不再适用；谁之后再改这个文件，按 `question-28` C 同文件串行，由编排方排。

### 第 5 步（m3-3、m3-6：阶段提醒与设计期只读）

变化：阶段提醒按 §2.3：访谈的做法一行、按步号取的「下一步」与 §4.2 的问句、写图格式、`confirm` 与 `release` 的下一步；`stage.ts` 两条 `hint` 改写；不写 `如果失败：`（第 9 步）。`design-before-release` 同 0.4，正路一句改为 `The main agent puts the design to the human with propose_to_human; once what it works on (the goal, or its module) is released, the work can be dispatched again.`，例外一句改为 `If a write is needed to answer a design question (a spike), report back and let the main agent put the question to the human.`。

两层循环的一半（§3.14，第 4 轮 M2）：新建 `src/graph/modules.ts`（§3.14.1，面板设计 0.7 §11「两层循环」M3 第 5 条：谁先合入谁建）；`design-before-release` 按模块判（§3.14.6：判定表加一行，纠偏正路加一句）；阶段提醒加分了模块的目标与模块里的几行（§2.3；其中「下一步」的放行一行要用第 9 步的门禁，随第 9 步写）。门禁与放行工具不在本步。

L2（`tests/graph-modules.spec.ts`，新）：目标的直接特性子节点带 `stage` 的才是模块，下面又挂带 `stage` 的特性不算；状态 `proposed` 的是候选、不是模块；废弃与被取代的不列；`frameworkOf` 只列目标的直接决策子节点；`moduleOf` 从模块下面很深的任务找到它的模块，不在任何模块下的节点返回 `undefined`；`directionsOf` 在 `norm-directions` 关闭之后返回 `undefined`；`isSplit` 在只有任务、没有特性的目标上为假；`moduleOf` 对候选及其子孙也有值，`isReleased` 对候选与 `design` 中的模块为假、对 `release` 及之后的模块为真。`tests/design-guard.spec.ts` 另加 `design-before-release` 的模块判定（目标已放行，模块 A 已放行、模块 B 在设计）：主 Agent 焦点在 A 或 A 下面的任务时子 agent 的写放行；焦点在 B、B 下面的任务、或还是候选的模块里时拒绝，越界一句点名模块；焦点在目标一级、不在任何模块下时放行（有意的残余，§3.14.6 第二段，第 5 轮 R5-N1；该处的提示靠下面的阶段提醒用例钉住）；目标自己在 `design`（框架在改）时整个目标下拒绝，A 也拒绝；读模块抛错时放行并报行健康。

L2（`tests/design-stage-notice.spec.ts`、`tests/graph-stage.spec.ts`）：`interview` 阶段缺「问题」时正文含 `做成以后，你的日子会有什么不一样` 与访谈做法一行；只缺约束与成功时「下一步」问的是成功（`你会怎么检查它真的做成了`），不是约束；只缺 `goal:supersedes` 时没有「下一步」一行，有它的 `label` 与 `hint`；只缺 `choice` 时「下一步」是 `propose_to_human (kind question)` 那一行（N5）；8 项都齐时是 `kind confirm` 那一行；对照表的键与 `requirementCard` 的 8 个键一一对应；`design` 阶段正文含三个标签，门禁成立时含 `kind release`；所有阶段的正文不含 §2.3 末条列的字样；两条 `hint` 不含 `decision_card`。分了模块的目标（§2.3，第 4 轮 M2）：`design` 阶段正文含 `norm-directions` 与「模块是目标下直接的特性」一行、不含单层的写图格式那一行；`release` 阶段正文逐行列模块，至多 8 行、多的写 `and <n> more`；焦点在 `design` 中的模块里时正文是模块的写图格式一行；大循环放行之后的目标一级提醒和模块设计中的提醒都含 `graph_focus to the module or the task it belongs to`（第 5 轮 R5-N1）；这些阶段的正文同样不含禁用字样；「下一步」放行行里的 `kind release, module <id>` 随第 9 步的门禁测。

今天必败：同 0.4；另：`interview` 阶段的提醒里没有 §4.2 的问句；`choice` 的 `hint` 含 `decision_card`（main 上今天的文字）；导入 `src/graph/modules.ts` 失败；目标已放行、焦点在还在设计的模块里时，子 agent 的写被放行（今天的 `design-before-release` 只看目标）。

本步另把 `design-before-release` 加进 `MAIN_AGENT_RULES`（§3.11），规则板 R1 已在 main 时同一提交在它的目录里映射。

L3：`glm-design-stage` 请求 3 的提醒另核对含下一项的问句。依赖：无新增。独立评审：是（`norm-review-floor` 第 1 条：`design-before-release` 是 guard 规则，决定子 agent 的写入范围）。

### 第 6 步（m3-5：提议式待决、`propose_to_human` 与 `record_human_answer` 的 `question` 一种）

变化：

- 图引擎的提议式待决（§3.3）：`src/graph/proposal.ts`（新）、`schema.ts`、`format.ts`、`engine.ts`、`mutation.ts`、`tools.ts`、`stage.ts`、`projection.ts`；`background` 字段与 `PLAIN_LIMITS` 在 plain-ui 第 1 步没有先合入时按 §2.9 建；面板三个文件的最小显示。
- `src/design/talk.ts` 补齐 `isPersonMessage`、`GOAL_ATTACHMENT_TEXT`、`talkInit`、`talkApply`、`talkFold`、`personSaid`（§3.2、§3.6）；设计行激活时注册会话投影 `hournessTalk`（N1），注册失败时告警、行健康 degraded，工具与规则按 §3.2 的退路走；`src/shared/dsh-min.ts` 加 `SessionEventLike` 与 `snapshotEvents?`（只给退路）。
- `src/design/propose.ts`、`src/design/record.ts` 的 `question` 一种（§3.4、§3.5），含只把已有待决再给人看一次的 `propose_to_human`（§3.4，循环板设计 0.6 §17 M3 一节的请求，M4 同请）；`confirm`、`release` 两种在参数校验里先拒绝（`invalid`，`hint`「not yet」），第 8、9 步打开；参数 schema 里已有的 `module`、`page` 同样随 `release` 在第 9 步才收。
- `src/design/attach.ts`（§3.13）的分派表：`rules:`、`loops:` 两行的 `detail` 都按 `AttachDetail` 的新上限查（`markdown` 1–6000、`mustShow` 1–8 片每片 1–4000，循环板设计 0.6 §17 M3 第 9 条、规则板设计 0.10 §10.7 M3 第 2 条）；`record_human_answer` 的第 5a 步对两块板的脚本提议与检查提议都做「给人看过原文」的核对。表里每一行仍由那块板合入时自己加。
- `src/shared/tool-names.ts`：`DESIGN_TOOL_NAMES = [PROPOSE_TO_HUMAN, RECORD_HUMAN_ANSWER]`，两个名字各导出一个常量 `PROPOSE_TO_HUMAN = 'propose_to_human'`、`RECORD_HUMAN_ANSWER = 'record_human_answer'`（面板设计 0.6 §4.9 的现场投影在图目录里，导入不了 `talk.ts`；N4），进 `ORCHESTRATION_RESIDENT_TOOLS`；契约测试同 0.4 的写法；同一个模块另导出 `shownProposalOf(isError, text)`（§3.2，面板设计 0.7 §11 第 6 条），`talkApply` 与面板的 `foldLive` 共用。`roleFace` 加非主 Agent 去掉设计工具的一支。`src/shared/answer-marks.ts`（`ANSWER_MARKS`、`AnswerKind`、`answerKindOf`、`answerCallOf`，面板设计 0.6 §5.6，谁先合入谁建；N4），`record.ts` 用它拼。
- `main-agent-graph` 的第一、三条（§3.8）：第一条含子会话带 `relay` 一律拒绝与告警（M5）；`MAIN_AGENT_RULES` 加 `main-agent-graph-relay`、`main-agent-graph-options`（§3.11）。`src/design/attach.ts`（§3.13，分派表此时是空的，两块板合入时各加一行）；`src/design/metrics.ts`（§3.12，出口不做事）。
- 模拟人的 `replies.question`、`restateReply`、`maxReplies` 与回话时机（§3.10 第 1–3 条）。
- 文档：`docs/ORCHESTRATION.md` §2.9 的待决一行（两种形状）、§5 决策卡一节（改为「要人定的事」：主 Agent 在对话里提，待决留在图上，人当场或之后在同一个对话里回话）、§2.6（给人看的不再是选项卡）；`docs/DESIGN.md` 的图格式一节。

验收（待人改）：`m3-5` 第 1 条（§9 第 1 条）。

L2：

- §3.3 列的引擎、格式与投影测试。
- `tests/propose-to-human.spec.ts`：参数的每条规则各一例（题目与四行、标签开头、没有加粗或两处加粗、加粗过长、超长、多行、`parent` 与 `question` 互斥）；新提写出提议式待决，字段等于参数，状态 `approved`，`reason` 含调用 id；改未拍板的待决成功，改做完的被拒；`text` 逐字等于 `renderProposal`；同一条回复里第 4 件被拒（`too_many`），人发了消息之后计数从 1 起；子 agent 与普通会话调用 `forbidden`；工具说明含 `PLAIN_QUESTION_GUIDE`；`renderProposal` 的标签与固定文字 `plainWordsIn` 为空。再给人看一次（0.5）：带 `question`、五项都不带时 `text` 等于该待决现有字段的 `renderProposal`、不写图（历史条数不变）、占一件、会话投影里多一项 `Shown`；只带五项里的几项被拒；做完的待决被拒；正文末行是假提议方的提议行时再问一次它的 `attachable`，`detail` 照样接在 `text` 后面；同时带 `attach` 被拒。
- **面板设计 0.7 §11 第 6c 条的契约测试（第 4 轮 N2）**：`propose_to_human` 组出的提议式待决（例题的五个字段，以及一张带 `attach` 与 `detail` 的）交给真实的图引擎 `apply` 提一次，在 `PLAIN_LIMITS.background`（60，去掉 `**` 再数）与写法检查第二阶段的常量下通过：引擎不返回 `invalid`、不带 `warnings`，写进图的 `background` 等于参数。第二阶段的常量取面板设计的 `src/graph/plain.ts`（0.7 §5.3 的开关）。M3 第 6 步先合入、`plain.ts` 还不在时，这一例只跑 `PLAIN_LIMITS` 与 `proposalLineRefusal` 的部分，并在测试文件里留一条显式标出「等 plain.ts」的跳过项；面板设计合入 `plain.ts` 的那个提交取消跳过、补上第二阶段的断言，谁后合入谁补。不写 `plain.ts` 的测试替身：它是仓库自己的模块，`AGENTS.md` 只许对网络与文件系统做 mock。这一例通过是面板写法检查从第一阶段切到第二阶段的前提 (b)、(c) 之一。例题（§2.8）走同一个测试：`PLAIN_QUESTION_EXAMPLE` 的五个字段交给 `proposalLineRefusal`、`plainWordsIn` 与这一次引擎提议，三处都通过（`d-agent-examples`）。
- `tests/record-human-answer.spec.ts`（假会话带真实的 `hournessTalk` 折叠：用 `talkApply` 逐条喂 rc.3 形状的事件，另一组只给 `snapshotEvents` 走退路、行健康 degraded）：人在提议之后说的原话同意，待决做完、`conclusion` 等于 `recordedAs`、`relay` 等于原话、`reason` 以 `ANSWER_MARKS.agree` 开头；原话出自提议之前的消息、出自 notice、出自 dsh-time-context 的时间消息、出自主 Agent 自己的消息、出自只有 `GOAL_ATTACHMENT_TEXT` 的消息（N12）、是编的，都 `invalid`、图不变；从「不可以」里摘「可以」被拒、`reason` 说不在边界上，从「可以，放行」里摘「可以」通过（N2）；原话里全角与半角、空白不同仍算（NFKC 与空白规整）；两段原话出自两条消息；`add`、`reject` 写批注、待决仍开着、批注开头是 `ANSWER_MARKS` 的两个前缀；投影与退路都读不到时 `unavailable`、图不变；fork 出的会话里继承来的人的消息不算。`attach`（§3.13）：分派表是空的时带 `attach` 被拒；测试往表里放一行假的提议方：`attachable` 答 `ok: false` 时被拒并带它的原因；答 `ok` 时正文末行是它的提议行，带 `detail` 时 `text` 与正文都在四行之后有那一段；人同意之后 `acceptProposal` 被调一次、参数里 `relay` 是人的原话、`handedBack` 是它返回的那一行；`acceptProposal` 的 promise 被拒时拍板照旧成功、`handedBack` 写补写的那句；带 `detail` 时主 Agent 的回话里没有 `mustShow` 的一片则 `not_shown`、待决不拍，都有时拍板、`reason` 末尾有摘要；`add` 不调 `acceptProposal`；改一张带提议行的待决而不带新的 `attach` 被拒。0.5 另加：假提议方按 `rules:` 与 `loops:` 前缀各放一行，两行都带 `detail` 时第 5a 步都做核对（0.4 的「规则板的提议没有 `detail`，跳过」一例改成「都核对」）；`detail` 的上限从常量构造：`markdown` 6000 个码点、`mustShow` 8 片每片 4000 个码点通过，各多一个码点或多一片被当作 `ok: false`；`after` 里有 6000 个码点的原文加四行加主 Agent 几句话时（合计不超 16,000）`mustShow` 的核对仍通过；`reason` 末尾的摘要两块板同一个 `attachDigest`。
- `tests/design-guard.spec.ts`：`main-agent-graph` 第一条（主 Agent 的 `graph_decide`、`graph_approve`、`graph_status` 带编的原话被拒、带真的原话放行；子会话的 `graph_decide`、`graph_edit` 带任何 `relay` 被拒，违规流水、设计行行健康与持有者会话的 `glm-design-bypass` notice 都有，同一会话同一目标 10 分钟内第二次不再发 notice；普通会话带 `relay` 的 `graph_decide` 照旧放行）、第三条（`graph_propose` 带 `options` 的人定待决被拒，`decider: 'agent'` 的放行）；读不到 `hournessTalk` 时第一条拒绝；§3.11 的契约测试扩到本步的两个 id。
- `tests/simulated-human.spec.ts`：`simulatedReply` 的第 1、2、3 条。

今天必败：`propose_to_human` 不存在；`format.ts` 拒绝没有 `options` 的待决（:398）；`graph_decide` 没有 `conclusion`；主 Agent 带编的原话 `graph_decide` 成功。

L3：`glm-decision-card` 改为 `glm-design-question`（`probe-full`；模拟人 `wish: true`、`replies: {question: ['可以，就按推荐的来']}`；图里预置一个人提议（因而已批准）的 `goal-1`）：

1. 回复 `graph_focus goal-1`。
2. 回复 `propose_to_human`（`kind: question`，四行取例题）：结果的 `text` 逐字等于例题的 `renderProposal`；`question-1` 是提议式待决、`approved`，在 `openItems.questions` 里。
3. 回复一段文字（`text` 原样加一句「按这个来吗？」），回合结束：`human.jsonl` 有一条 `reply`、`rule` 为 3；一次运行跨过了回合（下一个请求到达）。
4. 请求 4：消息里有模拟人的那句话（`source.kind` 为 `user`）。回复 `record_human_answer`（`agree`，`words` 为模拟人的原话）：`decided`；`question-1` 做完，`conclusion` 与 `relay` 都在，最后一次 `decide` 的历史带 `relay`。
5. 回复 `record_human_answer`，`words` 为编的一句：`invalid`、图不变。
6. 回复 `graph_propose` 一张带 `options` 的人定待决：被 `main-agent-graph` 拒绝，违规流水多一条。
7. 脚本派一个子 agent（同 `glm-dispatch`），子 agent 回复 `graph_edit`（`goal-1` 设 `stage: 'release'`），带 `relay`「可以，放行」：被 `main-agent-graph-relay` 拒绝，`goal-1` 不变；下一个主 Agent 请求里有 `glm-design-bypass` notice；`/hourness-status` 的设计行为 degraded（M5）。
8. 回复 `done`；`human.jsonl` 里没有 `unexpected-question`。

`glm-design-main` 请求 3 的工具面加上两个设计工具；两个 wish-idle 场景同样加上。

依赖：card-fields-table 已在 main（`e22282f`）。面板设计第 1 步若已合入，用它的 `background` 与 `PLAIN_LIMITS`（§2.9）。独立评审：是（`norm-review-floor` 第 1、2 条：图引擎的格式与权限、人的权限从哪来、子会话的图工具权限）。

### 第 7 步：取消（原为「面板拍板的回写」，第 4 轮 N1）

面板设计 0.6 §9.1 与 0.7 §11 第 6a 条把 `/graph-apply` 整条删去（面板只看不操作，`d-ui-look-not-operate`），第 7 步要通知主 Agent 的「人在面板上拍板」没有了触发的地方，整步取消：不建 `tests/graph-panel-apply.spec.ts`，不改 `src/graph/panel-row.ts`，0.4 §3.5.2 的「面板异步卡的回写」不实现。0.4 §9.1.3 的 `glm-design-stage` 请求 6 里等 `glm-graph-decision` notice 的一步（面板拍板之后到达的通知）随之删去，那个 notice 由 0.4 §3.5.2 的回写发出（`createUserNotice('glm-graph-decision', …)`，0.4 §3.5.2），回写不实现，notice 也就没有来源；`/graph-apply` 本身由面板设计第 5 步删。

编号保留，不顺延：面板设计、规则板设计、循环板设计与图上的批注都按步号引用 M3（第 3 步持有者、第 6 步 `attach`、第 8 步、第 9 步），顺延会让这些引用同时变错。第 3 步到第 10 步的顺序、依赖与独立评审名单不受影响（§0 末段已去掉第 7 步）。

验收（待人改）：`m3-5` 第 2 条（「人在面板上拍板……主 Agent 会话收到消息」）说的事不再存在，建议删去这一条（§9 第 1 条），验收只能由人改（`docs/ORCHESTRATION.md` §2.9.1）；面板设计 0.7 §11 第 6a 条已请编排者把它并进这一批。人改之前，旧字句与本附录冲突之处以人后来的决定 `d-ui-look-not-operate` 为准。

无 L2、L3、独立评审。

### 第 8 步（m3-2：确认需求一支、标定任务与运行隔离）

变化：

- `propose_to_human` 与 `record_human_answer` 打开 `confirm` 一种（§3.4、§3.5）；`main-agent-graph` 第二条（对所有会话，含告警）与第四条（图的命令行，§3.8）；`MAIN_AGENT_RULES` 加 `main-agent-graph-stage`、`main-agent-graph-cli`（§3.11）。第二条里关于模块的部分（c、d 的模块分支与新加模块一支，以及 e）要用第 9 步的模块放行，随第 9 步加，本步只做目标一级的 a–d。
- 模拟人补齐 `answers`、`replies.confirm` 与 §3.10 第 4–6 条。
- 标定任务 `tests/calibration/interview-expense-log/`：题面与夹具同 0.4 §9.2；`task.json` 改为

  ```json
  {"kind": "interview", "touches": ["docs/graph/"], "limits": {"maxSteps": 120, "minutes": 40},
   "human": {"wish": true,
     "answers": {"need": "我想要一个命令行小工具，每天记一下花了多少钱，月底能看出钱花在哪了",
                 "problem": "月底我能一眼看出钱主要花在吃饭、交通还是别的上面", "audience": "就我自己用",
                 "acceptance": "我输入一笔花销，月底跑一个命令能看到按类别的合计",
                 "non-goals": "不要手机版，也不要联网", "constraints": "数据只存在本机，一个文件就够",
                 "risks": "我可能懒得每天记"},
     "replies": {"question": ["可以，就按推荐的来"], "confirm": ["对，就这样"],
                 "release": ["补充：月底的汇总按金额从大到小排", "可以，放行"]}}}
  ```

  步数上限从 0.4 的 90 加到 120、时间从 30 加到 40 分钟：对话里每问一次多一个回合与一次回话（0.4 §9.2 的估计按工具调用里回来的回答算，约 30–45 步；对话多出访谈约 8 个回合的往返）。`stop` 为 `step-limit` 或 `time-limit` 时照 0.4 记作「边界不够」。运行器对 `interview` 种类加 0.4 §9.1 的三条覆盖行。0.4 §9.2 末条「整段访谈要在一个回合里完成」作废：人的回答从对话里回来，回合要结束，模拟人在回合结束时回话（§3.10）。
- `check.mjs`（独立进程，读运行目录里 `ws/docs/graph` 与违规流水）在 0.4 §9.2 的基础上改三条：第 2 条「至少 1 个已拍板的待决」改为「至少 1 个做完的提议式待决，最后一次 `decide` 带 `relay`」；第 4 条「放行的节点都由卡片批准」改为每个放行的节点有一条 `op: 'approve'`、带 `relay`、`reason` 含 `record_human_answer` 的记录；第 5 条改为目标历史里有带 `relay`、`reason` 含 `record_human_answer` 的批准与两次改阶段，以及一条以「人在对话里补充：」开头的批注。0.5 另加一条：目标下没有直接的特性子节点（这个小工具「一个文件就够」，不分模块，走目标一级的一次放行；分了模块的路径由第 9 步的 `interview-expense-log-modules` 查）。
- 运行器的 `HUMAN_TOOLS`（`scripts/calibrate/run-calibrate.mjs`:38）今天是 `['ask_user_question']`，用来数打扰人的次数；改为数模拟人回话的次数（`human.jsonl` 的 `reply` 条数），`HUMAN_TOOLS` 只留作「主 Agent 不该调用的工具」的计数。
- 标定运行与仓库隔离（`risk-calib-read`，同 0.2 第 8 步，全文照录）：新模块 `scripts/calibrate/run-dir.mjs`，运行器调用它，仓库根由参数传入（测试用临时目录当仓库）：
  - `openBatch(repo, stamp)`：建 `<repo>/.llm/calibration-runs/<stamp>/`（今天的位置，gitignored）；在系统临时目录建一个批目录 `fs.mkdtempSync(join(os.tmpdir(), 'glm-hourness-calib-batch-'))`，`results.json` 写在这里；在仓库那一边写 `pending.json`：`{root: <批目录>, runs: []}`。
  - `openRun(batch, name)`：每次运行在系统临时目录单独建一个 `mkdtempSync(join(tmpdir(), 'glm-hourness-calib-run-'))`，不嵌在批目录里（工作区的 `..` 到不了同批其他运行）；开跑之前把 `{name, dir}` 记进 `pending.json`（先写临时文件再改名）。运行器今天写进运行目录的东西照旧全写在这里：`calibrate.patch.yml`、`events.jsonl`、`stderr.txt`、`check.txt`、`check/`、`limits.jsonl`、`home/`（含 `audit/violations.jsonl`）、`dsh-home/`（含 `glm-hourness/audit/usage.jsonl` 与附件）、`human.jsonl`、`result.json`、`ws/`（含 `ws/.git`）（`scripts/calibrate/run-calibrate.mjs`:97–133、150–157、227–237；`scripts/sandbox.mjs` `dataRows`、`attachmentsIn`）。验收脚本照旧在会话结束后由运行器从仓库里的任务目录执行，不复制进工作区（:155）。运行目录名照今天的 `${task.id}--${model}[--k]`（:227）。
  - `closeBatch(batch)`：整批跑完之后一次拷回。批目录拷到 `<repo>/.llm/calibration-runs/<stamp>/`，每个运行目录拷到 `<stamp>/<name>/`，整棵树原样拷（`fs.cpSync(src, dst, {recursive: true, errorOnExist: true, force: false})`，含 `ws/.git`）。拷完核对：源里的每个文件在目标里都有，相对路径与字节数相同。全部一致才删临时目录：只删 `pending.json` 里记着的路径，且每个都必须是 `os.tmpdir()` 的直接子目录、名字以 `glm-hourness-calib-` 开头，不合这两条的不删并报出来；删完再删 `pending.json`。
  - 失败：拷回或核对出错时不删任何临时目录，`pending.json` 留着，运行器打印「拷回没有完成：临时目录 <路径…> 保留；修好后运行 npm run calibrate -- --collect <stamp>」并以退出码 1 结束。运行器中途崩溃时同样留下 `pending.json`。
  - 恢复：`npm run calibrate -- --collect <stamp>` 不跑新的运行，只按 `pending.json` 做 `closeBatch`。
  - 残余：被测模型仍能按绝对路径读仓库（guard 不拦读），也能列出系统临时目录找到同批其他运行；提示词与会话里不出现仓库路径与临时目录路径。记在 §10。

验收（待人改）：`m3-2` 第 2、3 条（§9 第 1 条）。

L2：`tests/record-human-answer.spec.ts` 加 `confirm`：需求卡不齐时 `propose_to_human` 返回 `gate_unmet` 且不返回 `text`；提议之后同意，目标由提议变为已批准、阶段为 `design`，两条历史带 `relay`；提议与回话之间目标被别的写入改了（例如另一个会话）、需求卡不再齐时 `record_human_answer` 返回 `gate_unmet`、图不变；本会话里没有提过 `confirm` 时 `not_shown`。`tests/design-guard.spec.ts` 加 `main-agent-graph` 第二条（M5）：主 Agent `graph_edit` 设 `stage: 'design'` 与 `graph_approve` 访谈中的目标被拒，带真的原话也被拒；`release` 改回 `design` 带真的原话放行；子会话与普通会话各一遍：`graph_edit` 把设计中的目标设 `stage: 'release'`、`graph_approve` 设计中目标下的一个提议、带 `relay` 的 `graph_propose` 在设计中的目标下提一个特性、带 `relay` 提一个 `stage: 'release'` 的目标，都被拒（普通会话不带 `relay` 也被拒），每次都有违规流水、设计行行健康 degraded 与持有者会话的 notice；放行之后（`stage: release`）把目标改为 `decompose` 放行；读图抛错时这五种候选调用被拒、别的图工具调用照常。第四条：主 Agent、子会话与普通会话的 `npm run -s graph -- edit '{…}'`、`node scripts/graph/cli.ts approve '{…}'`、`pnpm graph decide -` 被拒，`npm run -s graph -- show m3` 与 `npm run -s graph -- open` 放行，命令文字里有 `relay` 的子会话调用告警。§3.11 的契约测试扩到本步的两个 id。`tests/simulated-human.spec.ts` 加第 4–6 条。新测试 `tests/calibrate-run-dir.spec.ts`（同 0.2 第 8 步）：运行目录与批目录都不在仓库下，也不互相嵌套；`closeBatch` 之后目标里有源里的每一个文件（含嵌套目录里的文件与 `ws/.git/HEAD`），字节数相同，临时目录与 `pending.json` 都已删除；目标里预先放一个同名文件让拷贝失败时，临时目录与 `pending.json` 都保留，返回值列出临时目录的路径；模拟崩溃之后 `collect` 拷回并清理；`pending.json` 里伪造一个仓库下的路径或不带前缀的路径时，它不被删除并被报出。

今天必败：`propose_to_human` 的 `confirm` 返回 `invalid`（第 6 步留下的「not yet」）；主 Agent 带原话 `graph_edit` 设 `stage: 'design'` 成功；导入 `scripts/calibrate/run-dir.mjs` 失败；今天的运行器把运行目录建在仓库的 `.llm/calibration-runs/` 下（`scripts/calibrate/run-calibrate.mjs`:89）。 子 agent 带编的原话 `graph_edit` 把目标设为 `release` 成功（第 6 步之前）；普通会话不带原话 `graph_approve` 设计中目标下的提议成功；子 agent 经 `npm run -s graph -- edit` 带 `relay` 改阶段成功。

L3：`glm-design-interview` 改为对话：脚本化的模型按八步写图，每步一个回合，回合末是一句问话，模拟人按 `answers` 回话；需求卡缺项时 `propose_to_human`（`confirm`）报 `gate_unmet`；补齐后提议、模拟人回「对，就这样」、`record_human_answer` 同意，目标为已批准、`stage: design`，两条历史带 `relay`、`reason` 含调用 id；主 Agent 中途试一次 `graph_edit` 设 `stage: 'design'` 被拒。另加一步（M5）：脚本开一个普通会话（同 `glm-design-one-main` 的 `other`），它回复 `graph_edit` 把目标设 `stage: 'release'`、带编的 `relay`：被 `main-agent-graph-stage` 拒绝，主会话下一个请求里有 `glm-design-bypass` notice。

依赖：第 6 步。独立评审：是（`norm-review-floor` 第 1、2 条：阶段门禁与所有会话的图工具权限；第 3、4 条：标定的运行目录写在系统临时目录、拷回之后删除临时目录）。

### 第 9 步（m3-3、m3-4：放行一支、五栏门禁的修正）

变化：

- `propose_to_human` 与 `record_human_answer` 打开 `release` 一种（§3.4、§3.5），含带 `module` 的模块放行与 `page`；模拟人补齐 `replies.release` 与 `replies.module`（§3.10）。
- 两层循环的放行（§3.14，第 4 轮 M2）：`src/graph/stage.ts` 的 `releaseGate(graph, goal)` 按 `isSplit` 分两支（没分模块的目标是 0.4 的六条，分了模块的是大循环放行门禁），加 `bigLoopSet`、`moduleSet` 与 `moduleReleaseGate(graph, goal, module)`；`src/design/record.ts` 加大循环放行（§3.14.2 的四步次序：先给候选写 `design`、再批准、最后写目标的 `release`，第 5 轮 R5-M2）、模块放行写 `release` 的两支与 `pageDigest`；`PAGE_LIMITS`；`src/design/stage-notice.ts` 补齐 §2.3 里要用门禁的「下一步」放行行；`src/graph/engine.ts` 加两处（§3.14.7）：`planEdit` 的模块退回设计例外、`initialStatus` 对还没放行的模块下的任务不再直接批准；`main-agent-graph` 第二条补上模块分支与 e（§3.8）；`docs/ORCHESTRATION.md` §4.5 写两层放行、§4.8 的「特性上的阶段只读」改写（§8 表）。
- 事前验尸一行（`question-29` C）：设计决策正文可选一行 `如果失败：<最可能的原因>`，不进五栏门禁、缺了不拦。`designColumns` 今天只按 `COLUMN_LABELS = ['理由', '架构', '查过的现成方案']` 切节，一节到下一个已知标签为止（`src/graph/stage.ts`:61–80、146–150），未知标签会并进前一节：空的「查过的现成方案：」后面接一行「如果失败：…」时那一栏变成非空，五栏门禁误放行。所以 `src/graph/stage.ts` 加 `PARSED_LABELS = [...COLUMN_LABELS, '如果失败']`，`designColumns` 用它切节，门禁仍只看三栏。设计阶段提醒加一行 `Optionally add a line "如果失败：<the likeliest reason it fails>" to a decision body; when you put the design to the human, the 疑问 line says it in plain words.`。0.2 原定把它显示在五键卡上；没有卡片之后，它是放行提议里「疑问」一行的来源（`d-chat-not-cards`：写明最可能不对的是哪一处）。
- 五栏门禁的两处标签按 §2.8 改成人话（`src/graph/stage.ts`；`tests/graph-stage.spec.ts` 里钉这两个标签的断言同改）。

验收（待人改）：`m3-3` 第 1、3 条，`m3-4` 第 1–3 条，`m3-6` 第 2 条（§9 第 1 条）。

L2：`tests/record-human-answer.spec.ts` 加 `release`：门禁不成立时 `gate_unmet`、不返回 `text`；提议之后同意，放行集合全部为已批准、目标 `stage: release`，每条批准与改阶段都带 `relay`；提议之后有一个节点被改过（修订号变了）时它进 `skipped`、`outcome: 'partial'`、阶段不改；提议之后新提了一个节点时阶段不改、`message` 列出它；`add` 与 `reject` 写批注、阶段不改。两层循环（第 4 轮 M2，目标下有两个模块 A、B，各带一个五栏齐全的设计决策和一个有验收条件的任务）：大循环放行缺 `norm-directions`、方向清单没有一条、放行集合里没有框架决策、框架决策缺栏、模块子树外有未拍板的待决，各一例 `gate_unmet`；`bigLoopSet` 含 A、B 两个候选而不含它们的子孙；`page` 缺 A 的标题、缺一条方向的原文各一例 `invalid`（`field: 'page'`），页超过 `PAGE_LIMITS.max` 一例；同意之后 A、B 的候选批准为模块且 `stage` 为 `design`，目标 `stage` 为 `release`，模块下的节点仍是提议，每条批准与阶段写入都带 `relay`，阶段写入的 `reason` 以 `ANSWER_MARKS.agree` 开头、含调用 id、末尾有 `pageDigest`；大循环放行写到一半停下后重放（第 5 轮 R5-M2；测试用一个包住 `openEngine(dir).apply` 的计数器在第 n 次写入处抛错，模拟进程在那一处停下，同目录下 A、B 两个候选各带框架决策与任务）：分别停在 (a) 写完 A 的 `design`、写 B 的之前，(b) 两个候选的 `design` 都写完、第一次批准之前，(c) 批准 A 之后、批准 B 之前，(d) 全部批准之后、写目标 `release` 之前。每一种停下之后：目标的 `isSplit` 为真；图里没有「已批准而没有 `stage`」的目标直接特性子节点；不带 `page` 重提返回 `invalid`（`field: 'page'`，必填），不是「this goal is not split into modules」；带 `page` 重提成功，(d) 的放行集合为空、靠门禁第 2 条的例外通过；人再说「可以」，`record_human_answer` 得到 `released`：A、B 都是已批准、`stage: design`，目标 `stage: release`，每个候选历史里改 `stage` 的 `edit` 恰好一条（已带 `design` 的没有再发 `edit`），A、B 子树里的提议一个都没有被批准。另三例：主 Agent 提议候选 A 时自己写了 `stage: release`，同意之后 A 是模块、`stage` 为 `design`；提议之后候选 A 被别人改过，A 进 `skipped` 且没被批准、B 照批、目标阶段不改、`outcome: 'partial'`；第 2 步写完 A 的 `design` 之后 A 的 `rev` 变了，第 3 步用新 `rev` 批准 A 成功（不报 `stale_revision`）。模块放行：目标还在 `design` 时提 A 的放行 `gate_unmet`；A 已放行时再提 `invalid`；A 的放行集合为空 `gate_unmet`（A 被退回过的一例除外）；A 下面没有直接挂着的决策 `gate_unmet`；A 子树里有未拍板的待决，或放行集合里的节点 `source` 指向目标一级未拍板的待决，各一例；提 A 之后同意只批准 A 的子树，B 的子树、`norm-directions` 与目标不变，A `stage` 为 `release`，B 仍是 `design`；只给人看了 A 的放行时记 B 的放行 `not_shown`，记目标一级的放行也 `not_shown`；`page` 整段不在主 Agent 的回话里（或在但改了一个字）`not_shown`；提议之后 A 下面一个节点被改过，它进 `skipped`、`outcome: 'partial'`、A 的阶段不变；`add`、`reject` 在模块节点上写批注。退回：主 Agent（`isMainAgent`）`graph_edit` 把 A 的 `stage` 改回 `design`（不带 `relay`）成功，历史有 `from`、`to`，A 子孙的 `design-before-release` 重新生效；`reason` 以 `ANSWER_MARKS.agree` 开头时 `invalid`；子会话与普通会话做同一件事被 `main-agent-graph-stage` 的 e 拒绝且告警；不是模块的特性、目标的 `stage` 不带原话仍是 `forbidden`；`graph_edit` 把 B 的 `stage` 从 `design` 改为 `release` 被拒（a），带真的原话也被拒；放行集合为空的再放行在 A 被退回、改动已由带原话的写入落在图上时通过。任务的初始状态（`initialStatus` 收窄）：大循环放行之后，`llm` 在还在设计的 A 下面提议的任务（直接挂在 A 下、挂在 A 下的特性下各一例）是 `proposed` 并出现在 A 的放行集合里，挂在候选下的同样；A 放行之后再提的任务是 `approved`；不分模块的目标下任务的初始状态不变。退回大循环：主 Agent 带人的原话把目标改回 `design` 成功，编的原话被 `main-agent-graph-relay` 拒绝；之后 A 已放行也拒绝子 agent 的写；再放行时放行集合可以空，只给新批准的候选写 `design`，已放行的 A 不变。`design-before-release` 的模块判定和 `modules.ts` 的例子在第 5 步。`tests/graph-stage.spec.ts`：正文为「理由：…／架构：…／查过的现成方案：（空）／如果失败：…」时 `designColumns` 的架构一项 `ok` 为假、`propose_to_human`（`release`）返回 `gate_unmet` 且缺项含「架构（含查过的现成方案）」；有 `如果失败：` 一行时「架构」一节的值不含它；门禁的全部 `label` `plainWordsIn` 为空。`tests/design-stage-notice.spec.ts`：设计阶段的提醒含 `如果失败：`。

今天必败：`release` 返回 `invalid`；上面那段正文在今天的 `designColumns` 下架构一项为 `ok`；`目标（验收条件）` 标签含「验收」；带 `module` 的 `propose_to_human` 返回 `invalid`（未知参数）；分了模块的目标不带 `norm-directions` 也能放行；`planEdit` 对主 Agent 不带原话把模块 `stage` 改回 `design` 返回 `forbidden`；`llm` 在已批准、`stage: design` 的模块下提议任务，今天直接是 `approved`。

L3：`glm-design-release` 改为对话（模拟人 `replies.release` 为「补充：…」「可以，放行」）：缺一栏时 `gate_unmet`；补齐后提议，模拟人补充，`record_human_answer`（`add`）写「人在对话里补充：」批注、阶段不改；主 Agent 改方案再提，模拟人同意，放行集合全部为已批准、目标 `stage: release`；另加一个带 `如果失败：` 的决策；放行之后子 agent 的 `Write` 执行。这个场景里规划一栏的节点是挂在目标下的任务、不用特性，所以目标没分模块，走 0.4 的一次放行（分了模块的放行在下面的新场景）。

新场景 `glm-design-modules`（`probe-full`，模拟人 `wish: true`、`replies: {release: ['可以，放行'], module: ['补充：先做记录再做汇总', '可以，放行这个模块']}`；图里预置一个已批准、`stage: design` 的目标，下有两个模块候选 A、B、一个框架决策、一个 `norm-directions` 提议和 A、B 各自下面的决策与任务，都是提议）：

1. 请求 1：回复 `graph_focus` 到 A 下面的任务，再派一个子 agent（同 `glm-dispatch`）去 `Write`：目标还在 `design`，被 `design-before-release` 拒绝。
2. 回复 `propose_to_human`（`release`，不带 `module`，带 `page` 且页里缺 B 的标题）：`invalid`（`field: 'page'`）；补上之后再提，`text` 在四行之后接着 `page`，模拟人回「可以，放行」，`record_human_answer` 得到 `released`：A、B 为已批准、`stage: design`，目标 `stage: release`，模块下的节点仍是提议，`norm-directions` 已批准。
3. 子 agent 再去 `Write`（焦点还在 A 下面的任务）：模块还在设计，被拒，越界一句点名模块 A。
4. 回复 `propose_to_human`（`release`，`module` 为 A，带 `page`），模拟人回「补充：先做记录再做汇总」，`record_human_answer`（`add`）在 A 上写「人在对话里补充：」批注，A 的阶段不变；主 Agent 改好再提，模拟人回「可以，放行这个模块」，`record_human_answer`（`agree`）：A 的子树全部已批准、A `stage: release`，B 仍是 `design`，目标不变。
5. 子 agent 去 `Write` A 下面的文件：执行；主 Agent 把焦点换到 B 下面的任务后，子 agent 去 `Write`：被拒，点名模块 B。
6. 回复 `record_human_answer`（`release`，`module` 为 B），`words` 是编的一句：`invalid`；`words` 是模拟人的话但提议的是 A：`not_shown`；图不变。
7. 回复 `graph_edit`（A 的 `stage` 设 `design`，不带 `relay`，`reason` 写原因）：成功，A 回到设计，历史有 `from`、`to`；脚本里派一个子 agent 做同一件事：被 `main-agent-graph-stage` 的 e 拒绝，下一个主 Agent 请求里有 `glm-design-bypass` notice，`/hourness-status` 的设计行为 degraded。
8. 回复 `done`；`human.jsonl` 里没有 `unexpected-question`。

标定任务 `interview-expense-log-modules`（第 4 轮 M2；仍是记账小工具，练习题的领域）：题面与夹具同 `interview-expense-log`，访谈答案多一句「先做记账，再做月底汇总，两块分开做」，让主 Agent 分成两个模块；`task.json` 的 `human.replies` 加 `release: ['可以，放行']` 与 `module: ['可以，放行这个模块']`；`check.mjs` 在第 8 步那几条之外查：目标 `stage: release`，下有两个 `stage: release` 的模块，各自的放行写入带 `relay`、`reason` 含 `record_human_answer` 与一页稿摘要；`norm-directions` 已批准且有至少一条 `acceptance`；目标的放行写入早于任意一个模块的放行写入；没有哪个模块的放行早于它自己的设计决策被批准。它在第 12 步（a）每个模型跑一次，记作基线，不是通过条件（本版只用 `interview-expense-log` 做 `m3` 的验收标定；两层循环的真实验证是自举之后项目自己的开发，calibration 只作回归守门，`.agents/tasks/design-context.md`「Verification facts」）。

依赖：第 8 步、第 5 步的 `src/graph/modules.ts`。独立评审：是（`norm-review-floor` 第 1、2 条：放行门禁与放行解开子 agent 的写入；模块放行门禁、模块阶段的引擎例外和 `main-agent-graph-stage` 的模块分支同属这一类）。

### 第 10 步（m3-5：去掉 L1/L2/L3）

同 0.4 §3.5.3，两处改：`FIVE_KEYS` 不迁移，随 `src/workflow/decisions.ts` 一起删（knip 基线里的 `types src/workflow/decisions.ts FiveKey` 随之消失，`npm run lint:update` 缩小基线，同一提交）；晨报新增的一节叫「等你定的事」（0.4 叫「决策卡」），内容同 0.4：待你定的件数与最早一件的日期、agent 自己要定的件数、本期拍板的次数按拍板者分为你、你在对话里说、agent。「你在对话里说」按 `ANSWER_MARKS.agree` 开头的 `decide` 历史认（`answerKindOf`，§3.5）。

独立评审：是（第 3 轮 M2）。本步照 0.4 §3.5.3 改决策流水的记录（`DecisionRecord` 去掉 `level`），`docs/DEVELOPMENT.md` §1.1 独立评审一行写明「图引擎的权限与审计（…违规与决策流水）」。

### `m3-main-persona` 一步（排在第 10 步之后）

内容：§2.7 全部。文件：`src/shared/output-style.ts`（新）、设计行的配置 Schema（`persona`）与 `roleFace` 加节；`packages/hourness/locale/design/` 的设置项说明；`src/glm-prompt/assembly.ts` 与 `index.ts`（识别契约节、两份身份节、`reportingDepth` 与旧键的读法）；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts` 及其引用（`src/glm-prompt/index.ts`、`assembly.ts` 的注释，`tests/s5.spec.ts`、`tests/dialect-wiring.spec.ts`）；`packages/glm/locale/glm-prompt/` 的设置项说明；文档 `docs/DESIGN.md` §5.2 节表（`glm:reporting-depth`、`hourness:output-style`）、§2.5 的配置说明，`docs/ORCHESTRATION.md` §3.1（人设只给主 Agent）。 另：`docs/reference/zcode-verbatim.md` 加一节「不跟 3.17.1 的地方」，写 §2.7「GLM 路由」末段的三处与各自的理由；编排方同意之前本步不合入 main（`zcode-3171-follow` 验收第 1 条的做法）。

L2：

- 人设：主 Agent、`persona.text` 非空时组装结果有这一节（标题、用户文字、范围说明），`interpolate: false`；`text` 为空或全是空白、普通会话、子会话、主 Agent 移走之后的原会话都没有；`/wish off` 的下一步没有；`text` 超过 4,000 码点时不加、行健康 degraded；`name` 有换行与连续空白时规整成一行、超过 40 码点时截断并告警一次、规整后为空时用「主 Agent」。 节的正文逐字等于 `# Output Style: <name>`、一个换行、用户文字、一个空行、范围说明一句（标题与用户文字之间没有空行，照 3.17.1 的 `n8o`）。
- GLM 路由：有这一节时身份节开头是 `IDENTITY_OPENING_WITH_STYLE`（按常量比，不写字面），这一节在 `glm:context-management` 之前，start-plan 档在最后一个方言节之后；没有这一节时开头是 `IDENTITY_OPENING_PLAIN`，与改动之前的组装结果逐字相同；方言与设计行两种安装先后结果相同。非 GLM 路由：这一节原样，在身份节与 `glm:guard` 之前。
- 3.17.1 的对照（M6）：组装结果里没有任何一条正文是 `${name} output style is active.` 开头的消息或节（不加 `r8o` 的每回合提醒）；`docs/reference/zcode-verbatim.md` 的「不跟 3.17.1 的地方」一节含三处的条目（文档检查用 `rg` 一类的断言写在 L2 里，同已有的文档断言）。
- 改名：先经 `Config(raw)` 规整再调 `apply`（与 cordis 的 `resolveConfig` 同一条路）：只写 `persona: concise` 时细度为 concise、告警一次、行健康说明有改名一句；只写 `reportingDepth: detailed` 时为 detailed、不告警；两者都写且不同时用 `reportingDepth`、告警一次；两者都写且相同时不告警、行健康说明有「旧键 persona 可以删掉」；两者都不写时为 balanced、不告警。`# Reporting Depth` 的正文与改名前逐字相同。
- 契约：`OUTPUT_STYLE_SECTION` 在两个包的产物里是同一个字符串（`tests/contracts.spec.ts`）。

今天必败：配置了 `persona.text` 的主 Agent 组装结果里没有 `hourness:output-style`；方言的开头总是 `IDENTITY_OPENING_PLAIN`；`glm-prompt` 的 `Config` 里没有 `reportingDepth`；规整只写旧键的配置之后，照带默认值的写法细度为 balanced。

L3（新场景）：`glm-design-persona`（`probe-full`，覆盖行给设计行 `persona: {name: 'PM', text: 'End every reply to the human with 「（PM-MARK）」.'}`，模拟人 `wish: true`）：主 Agent 的请求里身份节开头为 `IDENTITY_OPENING_WITH_STYLE`，有 `# Output Style: PM` 且位于 `# Context management` 之前；脚本派一个子 agent（同 `glm-dispatch`），子会话的请求里没有这一节、开头为 `IDENTITY_OPENING_PLAIN`。`non-glm-design-persona`（`probe-hourness`）：有这一节、开头句不变。

依赖：`m3-1` 在同一分支上已完成；`zcode-3171-follow` 已在 main（开头句常量、身份节、逐字门禁都是 3.17.1），0.3 写的与 `wf_e48380fb20a69493` 同文件串行不再需要（N3）。之后别的分支再改 `src/glm-prompt/index.ts`、`tests/dialect-wiring.spec.ts`、`docs/DESIGN.md` 时照 `question-28` C 串行，由编排方排；本步的 L2 按常量写。无独立评审（`norm-review-floor` 四条都不涉及：改的是提示词组装与配置键名，不改工具面与权限，不写用户目录；L4 第 8 项要改桌面版 profile，到时先问人，那是手工操作，不在代码里）。

### 第 11 步（m3-6：流程条与 `/wish` 入口，`.worktrees/m3-flow`）

内容：0.4 第 11 步的流程条，加 §2.6 的全部客户端部分。文件：`ui/src/flow/model.ts`（`flowBarText` 加 `cheapModel`、`isCheapModel`、读不到阶段的新说法）、`ui/src/flow/FlowBar.tsx`、`ui/src/wish/model.ts`（显示规则的三种情形、短标签、按钮动作的选择，纯函数）、`ui/src/wish/WishCard.tsx`、`ui/src/wish/WishPill.tsx`，在 `ui/src/hourness-client.tsx` 注册三个槽项；`scripts/packages.mjs` 编排层客户端的 `sources` 加 `ui/src/flow/`、`ui/src/wish/`（快进之后的 main 上是 `['ui/src/hourness-client.tsx', 'ui/src/dsh.ts', 'ui/src/primitives.d.ts', 'ui/src/graph/']`）。`ui/src/dsh.ts` 按需补 `useSession`、`inputActions`、`useInput` 与 `commands.list` 的薄类型。

L2：`tests/flow-bar.spec.ts` 同 0.4，另加便宜档（`GLM-5.3-Flash`、`gpt-4o-mini`、`claude-3-5-haiku`、`gemini-2.0-flash-lite` 命中；`GLM-5.3`、`gemini-2.5-pro`、`deepseek-chat`、空串、非字符串不命中），读不到阶段的说法；`tests/wish-entry.spec.ts`：开场卡片三种情形的判定（空白与否、主 Agent 与否、有图没图、`/wish` 在不在、`useSession` 拿不到时退到 `sessions.list`），空白且已是主 Agent 时是退出那一行；完整卡片的最后一个子元素是 `FirstVisitLine`（面板设计的组件在时；不在时没有这一行，N4）；「接着推进现有项目」只在有未关闭的目标时；按钮在普通会话与主 Agent 会话里的文字；窄于 520 px 的短标签；拿不到 `inputActions` 时换成复制退路；黄字等于「主 Agent 用强一点的模型」、不含「便宜」与模型名（N1）；`ui/src/wish/model.ts` 与 `ui/src/flow/model.ts` 里所有给人看的字串 `plainWordsIn` 为空（客户端测试从 `src/graph/plain-question.ts` 导入，它不用 Node 内置模块）。

今天必败：模块不存在。L4：随第 12 步（b）。

依赖：快进之后的 main（`src/graph/stage.ts`、`src/graph/main-agent.ts` 已在）；plain-ui 0.4 仍在修订：本步按 `mockup-wish.svg` 与 §7.5 写，所有给人看的字串集中在 `ui/src/wish/model.ts` 与 `ui/src/flow/model.ts`，plain-ui 定稿后若改字句或位置，只改这两个文件与 order 常量；`hournessMainAgent` 投影在 `m3` 分支的第 3 步才注册，本步的 L2 只用纯函数，真实显示在合入后的 L4 看。无独立评审。

与 `m3` 分支的合并：两条分支都改 `scripts/packages.mjs`（第 3 步改编排层的 `src` 与 `rows`，本步改客户端 `sources`）与 `docs/ORCHESTRATION.md` §4.8。`m3-flow` 合入 `m3` 时 `scripts/packages.mjs` 两边都留；§4.8 手工合并，按节内的先后把两边的段落都放进去；合入之后在 `.worktrees/m3` 上重跑三道门禁与探针。合入时机：`m3-main-persona` 一步之后、第 12 步（a）之前。

### 第 12 步（a）：标定

在 `m3-main-persona` 与 `m3-flow` 都合入 `m3` 之后跑。运行目录在系统临时目录、整批之后拷回（第 8 步）；模拟人在对话里回话（§3.10）；临时 profile 里设计行的 `persona.text` 为空（标定量的是设计循环，不带人设）。通过的标准同 0.4（GLM-5.3 三次里至少一次通过验收脚本，两档模型的结果都记作基线）。另记的指标（写进 `result.json`）：

- 打扰人：模拟人回话的次数；到放行的轮数（`propose_to_human` 的 `release` 次数）。
- 四行有没有原样给人看：每次 `propose_to_human` 之后，同一回合主 Agent 最后一条消息里有没有逐字包含它的 `text`；没包含的次数。
- 问人的形状：主 Agent 给人的消息里出现选项写法（行首 `A.`、`B)`、`1.` 后接「选」字一类，正则写在 `check.mjs`）的次数；一条消息里问号的个数大于 1 的次数；`plainWordsIn` 命中的次数与词。
- 照抄例题（`d-agent-examples`，第 4 轮 M1）：主 Agent 给人的文字里出现例题题目或背景那一行（§2.8）的次数，应为 0；出现了说明模型把示范当成了要问的事，记作缺陷。
- 两层循环（`interview-expense-log-modules`，基线，第 9 步）：目标一级放行 1 次与模块放行各 1 次的次数；`page` 被拒（`invalid`）与 `not_shown` 的次数；模块放行之前子 agent 的写被 `design-before-release` 拒绝的次数；主 Agent 退回模块或大循环的次数。
- 记录：`record_human_answer` 被拒的次数与原因（原话找不到、不在边界上、门禁）；原话不到 6 个码点、前一条主 Agent 的消息里没有「我记成」的记录次数；§3.11 表里每条规则的拒绝次数；`gate_unmet` 次数；`git-snapshot` 的拒绝次数与原因码（§3.12），存了快照的次数与整件跳过的次数。这些数在指标流水接口到位之前由 `check.mjs` 从违规流水、快照流水与会话日志算，之后改从指标流水读（§3.12）。

### 第 12 步（b）：合入与批次 L4

0.4 §9.3 的七项改动与新增：

- 第 1 项另看：会话文件里主 Agent 的工具清单没有 `Write`、`Edit`、`ask_user_question`，有 `propose_to_human`、`record_human_answer`。
- 第 3 项改为：访谈是对话：主 Agent 问要什么时是一两句开放的问题；交给人的事是题目一段、背景、推荐、疑问、不做各一段，标签不加粗，每段重点几个字加粗，问话在整条消息最后、只有一句；没有卡片、没有选项与按钮。人在输入框回一句「可以」，4 秒内面板显示这张待决由「你在对话里说」拍板。消息里没有「验收」「标定」「门禁」「投影」「补遗」「附录」。
- 第 4 项改为：人先不回话，这张待决留在面板「需要你」里，显示四行与「在主 Agent 的对话里回话」；之后在同一个对话里回话，它被拍板。两个工作区的那一半照 0.4。
- 第 5 项改为：确认与放行：人回「补充：……」时目标上出现「人在对话里补充：」批注；回「说重点」时主 Agent 换一种更短的讲法再问；回「可以，放行」之后面板里的虚线框变实线，历史写「你在对话里说」与原话。
- 第 6 项另看（`m3-1` 验收第 4 条）：新会话开场画面里卡片在工作区那一行与输入框之间、与输入框同宽；点「接着推进现有项目」之后，会话仍在开场画面时卡片换成「这个会话的 agent 是主 Agent」与退出按钮（截一张）；普通会话输入框下方「交给主 Agent」、主 Agent 会话里「主 Agent」与退出；「写一句你想做的」把 `/wish ` 写进输入框；1280 宽、右侧栏打开时各截一张；GLM-5.3-Flash 上流程条带便宜档提醒，换成 GLM-5.3 后消失。
- 新增第 8 项（`m3-main-persona`）：插件管理器里设计行的「人设」设置位能改、`glm-prompt` 行的 `reportingDepth` 显示正常（各截一张）；设了标记人设之后，主 Agent 的回复带标记，主 Agent 派出的子 agent 写的文件与交回结构里没有标记；清掉设置后恢复。这一项要改桌面版 profile 里设计行的配置，属于改用户 profile（`AGENTS.md` 第 6 条），到时先问人，按四行写：

  > ① 在桌面版上试一次人设
  >
  > 背景：要看主 Agent 的话**带上你设的记号**，它派出去的 agent 写的文件里没有
  >
  > 推荐：**你自己在插件管理器里设**，测完自己清掉，各约 1 分钟
  >
  > 疑问：你要是**不想动手**，就得由我改你的配置文件
  >
  > 不做：**我直接改你的配置**，仓库规矩是改你的配置要先问你
  >
  > 你自己设，行吗？

- 新增第 9 项（`d-one-main-agent`）：在第二个会话里发 `/wish`，回复指向第一个会话；`/wish here` 之后第一个会话的流程条与「主 Agent」按钮消失、第二个会话出现（各截一张）。
- 新增第 10 项（`d-main-agent-shell`）：在临时工作区里改一行 `README.md`，让主 Agent 跑 `git checkout -- README.md`：命令执行，主 Agent 下一步说出快照与恢复命令；照它说的 `git stash apply` 之后那一行回来。另在同一个临时工作区里建一个装过依赖的工作树，让主 Agent 收尾时 `git worktree remove`：命令执行，主 Agent 说出被忽略的文件不在快照里（第 3 轮 M4）。桌面版的语言是中文时，`git clean -fd` 一个中文文件名之后能照恢复命令拿回来（第 3 轮 M3）。
- 新增第 11 项（第 3 轮 M5）：在同一个项目里开一个普通会话，让它的 agent 把一个设计中的目标改成放行：被拒，主 Agent 的对话里出现一句「有别的会话想不经你同意推进目标，已拦下」一类的话，`/hourness-status` 的设计行为 degraded（截一张）。
- 新增第 12 项（`d-rules-visible`）：规则板已合入时，规则页「写在代码里的规则」一组列出 §3.11 的八条，每条标「dsh-hourness 带来的 · 只能看」（截一张）；规则板没合入时这一项随规则板的 L4 做。
- 新增第 13 项（`d-design-onepage` 扩到产品，第 4 轮 M2）：在临时工作区里让主 Agent 把一个小项目分成两个模块 A、B。大循环放行时人在对话里看到框架、模块清单和方向清单的一页，回「可以」之后，两个模块都在设计中；模块 A 放行之前让子 agent 写 A 的文件被拒；人对 A 的一页放行稿说「可以」之后，A 放行了、B 仍在设计中，子 agent 写 A 的文件执行、写 B 的被拒；让主 Agent 把 A 退回设计，再放行一次。面板的「框架与模块」页（面板设计 0.7 §4.11）已合入时，每一步各截一张；没合入时看会话与图文件（`npm run -s graph -- show <模块 id>`，只读）。人说的话和一页放行稿里的方向清单与图上的 `norm-directions` 逐条核对一遍。
- 合入之后第一个提交把设计行改为默认启用（同 0.4）；`persona.text` 默认空，启用之后不带人设。

## 5. 失败与降级（新增的行，接 0.4 §6）

| 操作 | 失败条件 | 可恢复？ | 调用方收到 | 记录 |
| --- | --- | --- | --- | --- |
| `roleFace` | 读角色抛错 | 是 | 本步当作非主 Agent：去掉两个设计工具，写工具与 `ask_user_question` 不去掉（写入与提问照样由规则拦） | 告警一次，会话健康 degraded |
| `roleFace` | 方言服务抛错 | 是 | `toNativeTool` 退到静态表 `ZCODE_ALIAS_NATIVES`，`Write`、`Edit` 照样去掉 | `dialectWarner` 告警一次（同 guard） |
| `roleFace` | `str_replace_editor` 的参数形状不认识 | 是 | 主 Agent 的工具面里整个去掉它 | 会话健康说明 |
| `roleFace` | 人设超过 4,000 码点 | 是，人改短 | 不加这一节 | 行健康 degraded |
| `roleFace` | `persona.name` 超过 40 码点 | 是 | 截断后照用 | 告警一次 |
| 方言识别 Output Style 节 | 节的文字不是字符串 | 是 | 当作没有这一节，开头句不换 | 告警一次 |
| `/wish` 写持有者记录 | 磁盘错误、权限 | 是，修好后重发 | error「主 Agent 的持有者记录写不了：<原因>」，不开启 | 命令结果 |
| 读持有者记录 | 文件损坏、形状不对 | 是，再发一次 `/wish` 覆盖 | `isMainAgent` 只按投影判 | 行健康 degraded |
| `demoteOthers`、`agent/created` 对齐 | 执行 `/wish off` 失败或超时 | 是，下次 `agent/created` 再对齐 | 那个会话按记录判不是主 Agent，只有显示不对 | 告警一次，行健康 degraded |
| `agent/created` 对齐 | `whenIdle()` 之后的 `/wish off` 被拒、`commands.execute` 返回 `undefined` | 是，下次 `agent/created` 再对齐 | 那个会话按记录判不是主 Agent，只有显示不对 | 告警一次，行健康 degraded |
| `emitMetric` | 指标流水的接口不在；写失败 | 是 | 什么都不做；工具与规则照常 | 每个宿主进程告警一次，行健康不降级 |
| git 快照 | 第 1 步以外任何一步失败或超时；要存的文件超上限；`push` 取不回远端；`cd` 目标认不出；挡路的文件里有被忽略的；`clean` 的列表与 `clean -n` 对不上 | 是，按正路改命令或重试；人可在自己的终端里跑 | 拒绝，`git-snapshot` 的纠偏 | 违规流水，`git.snapshot-refused` |
| git 对外检查 | `push --mirror`、`push --tags`（有快照标签时）、推快照的引用或对象；`clean -x`、`-X`、`-ff` | 是，按名推分支与标签；`clean` 去掉这几个参数 | 拒绝，`git-snapshot` 的纠偏 | 违规流水，`git.snapshot-refused` |
| git 快照 | `worktree remove` 里被忽略的文件太多，5 秒内数不完大小 | 是 | 照常存、照常放行；流水与 notice 写 `bytesAtLeast` | 流水 |
| git 快照 | 不是仓库 | — | 放行（git 自己会报错） | 无 |
| git 快照 | 找不到 git | 是 | 放行 | 行健康 degraded |
| git 快照 | 写流水失败 | 是，快照引用已在 | 放行 | 行健康 degraded「快照 <id> 已存，记录没写上」 |
| git 快照 | 进程在快照与命令之间退出 | 是 | 命令没执行；快照引用与流水留着，无害 | 流水 |
| `propose_to_human` | 参数不合法、子 agent 或普通会话调用、图读不到、门禁不成立、一条回复超过三件 | 是 | 工具错误 `invalid`、`forbidden`、`not_found`、`graph_invalid`、`gate_unmet`、`too_many`，带 `hint` | 会话日志的工具结果 |
| `propose_to_human` | 引擎拒绝提议式待决 | 是 | 引擎的错误原样 | 工具结果 |
| `propose_to_human` | 读不到 `hournessTalk` | 是 | 照常，编号取 1、件数不查 | 会话健康说明 |
| `propose_to_human` 带 `attach` | 前缀不在分派表里；提议方的服务不在；`attachable` 答 `ok: false`；`detail` 形状不对 | 是，按 `hint` 重提，或不带 `attach`、照那块板的另一条路说给人 | `invalid`，`field: 'attach'`，图不变 | 工具结果 |
| 会话投影 `hournessTalk` | 注册抛错（键已被别的版本占用、服务不在） | 是，修好后重新加载设计行 | 各处走 §3.2 的退路（`snapshotEvents`），退路也没有时按 fail-closed | 告警一次，行健康 degraded |
| 会话投影 `hournessTalk` | 一个 `tool/result` 的正文解析不了 | 是 | 跳过这一项 | 按会话报一次 |
| `record_human_answer` | 原话不在人的消息里；没在本会话提过 | 是，照 `hint` 摘原话或先提 | `invalid`（`field: 'words'`）、`not_shown`，图不变 | 工具结果 |
| `record_human_answer` | 读不到 `hournessTalk`（投影与退路都没有）、核对抛错 | 否（这个宿主上） | `unavailable`，图不变，`hint` 让主 Agent 告诉人 | 会话健康 degraded |
| `record_human_answer` | 循环板的提议带 `detail`，主 Agent 的回话里没有原文的每一片 | 是，照 `message` 把原文再给人看一次 | `not_shown`，图不变 | 工具结果 |
| `record_human_answer` 的交回 | 提议方的服务不在；`acceptProposal` 的 promise 被拒 | 是，那块板 60 秒内按图补写 | 拍板照旧成功；`handedBack` 写明没交回 | 工具结果；告警一次 |
| `record_human_answer` | 门禁在提议之后不再成立 | 是 | `gate_unmet`，图不变 | 工具结果 |
| `record_human_answer` | 写入 `stale_revision` 两次 | 是 | 引擎的错误，`hint` 带人的原话，已写的几条留着 | 工具结果；已写的条目在节点历史里 |
| `record_human_answer` | 放行时部分节点跳过 | 是，改好后再提 | `partial`，阶段不改 | 工具结果 |
| `propose_to_human` 的 `release`（两层循环，§3.14） | 大循环或模块的门禁不成立；`module` 不是这个目标的模块、已放行或目标一级还没放行；`page` 缺、超长或漏了模块标题与方向原文；没分模块的目标带了 `page` | 是，按 `hint` 补 | `gate_unmet`、`invalid`（`field: 'module'` 或 `'page'`）、`not_found`，图不变 | 会话日志的工具结果 |
| `propose_to_human` 再给人看一次 | 待决不存在、不是提议式、已拍板；提议方的 `attachable` 答 `ok: false` | 是 | `not_found`、`invalid`，图不变 | 工具结果 |
| `record_human_answer` 的 `release` | `page` 整段不在主 Agent 的回话里 | 是，把那一页再给人看一次 | `not_shown`，图不变 | 工具结果 |
| `record_human_answer` 的大循环放行 | 写模块候选 `design`、批准放行集合、写目标 `release` 这三段里任何一处两次 `stale_revision`、被拒，或进程在其间停下（§3.14.2 的四步） | 是，重放同一次回话（再提时 `page` 仍必填，因为候选带不带 `design` 都算候选，`isSplit` 为真） | 引擎的错误，`hint` 带人的原话；已写的 `design` 与已批准的留着，没有「已批准而没有 `stage`」的中间状态；`partial` 时目标的阶段不改 | 工具结果；节点历史 |
| 模块退回设计（引擎例外，§3.14.7） | 节点不是模块、`set` 里有别的字段、`reason` 以同意记号开头、模块还没放行 | 是 | `forbidden` 或 `invalid`，图不变 | 工具结果 |
| `design-before-release` 的模块判定 | `moduleOf` 抛错 | 是 | 放行（fail-open） | 行健康记原因 |
| `main-agent-graph-stage` 的模块分支（c、d、e） | 读图、判定抛错 | 是，重试 | 拒绝（fail-closed，同第二条） | 违规流水，会话健康 degraded |
| `main-agent-graph` 第一条（主 Agent） | 读不到 `hournessTalk`（投影与退路都没有）、核对抛错 | 否（这个宿主上） | 拒绝（fail-closed） | 违规流水，会话健康 degraded |
| `main-agent-graph` 第二条 | 读图、判定抛错（只对五种候选调用读图） | 是，重试 | 拒绝（fail-closed），正路「Retry; if it fails again, tell the human the reason」 | 违规流水，会话健康 degraded |
| `main-agent-graph` 第三条 | 读图、判定抛错 | 是 | 放行（fail-open） | 会话健康 degraded |
| `main-agent-graph` 告警 | 持有者不活；`inject` 抛错 | 是 | 拒绝照旧；只少了那条 notice | 违规流水与行健康照常；告警一次 |
| `main-agent-ask` | 读角色抛错、判定器抛错 | 是 | 放行（fail-open，同 0.4 写入规则） | 会话健康 degraded |
| 改名后的 `glm-prompt` 配置 | 只写了旧键 `persona` | 是 | 照旧生效 | 告警一次，行健康说明 |
| 改名后的 `glm-prompt` 配置 | 新旧两键都写且不同 | 是 | 按 `reportingDepth` | 告警一次 |
| 标定 `openRun` | 建临时目录或写 `pending.json` 失败 | 否（这次调用） | 运行器以用法错误的退出码 2 结束，已跑完的运行照常由 `closeBatch` 拷回 | 控制台 |
| 标定 `closeBatch` | 拷贝或核对出错 | 是，`--collect` | 不删临时目录，`pending.json` 留着，退出码 1 | 控制台写明每个临时目录的路径 |
| 标定 `closeBatch` | `pending.json` 里的路径不在系统临时目录下或不带前缀 | 是，人看过之后手工处理 | 那个路径不删 | 控制台报出 |
| 模拟人 | 读图失败；`followup` 抛错 | 是 | 回 `fallback`；不回，运行随之结束 | `human.jsonl` 记 `{kind: 'reply-failed', reason}` |
| 流程条、`/wish` 入口 | 拿不到 `useSession`、`inputActions`、`commands.list` | 是 | 退到 `sessions.list`；退到复制；不显示入口 | 客户端控制台（同面板） |

## 6. 外部输入的校验（新增，接 0.4 §6.3）

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `propose_to_human.kind` | 是 | `question`、`confirm`、`release` | `invalid` |
| `propose_to_human.title` | 与四行同给或同不给（都不给只在 `question` 带 `question` 时，再给人看一次） | 一行，非空，至多 `PLAIN_LIMITS.title`（40）码点，不含 `*` | `invalid`，`field` |
| `propose_to_human` 的四行 | 与题目同给或同不给 | §3.3：一行、非空、不以标签开头、恰好一处 2–12 码点的加粗；去掉 `**` 之后 `background` 至多 `PLAIN_LIMITS.background`（面板设计 0.6 为 60），其余至多 40 | `invalid`，`field` 与 `hint` |
| `propose_to_human.goal` | `confirm`、`release` 时是 | 已有的目标 id | `invalid` 或 `not_found` |
| `propose_to_human.module`、`record_human_answer.module` | 否，只对 `release` | `modulesOf(graph, goal)` 里的一个模块 id；状态已批准或进行中；有效阶段 `design` | `invalid`（`field: 'module'`）、`not_found` |
| `propose_to_human.page` | 分了模块的目标的 `release` 必填，其余不收 | 字符串，1–`PAGE_LIMITS.max`（2,000）码点；规整（NFKC、空白合一）之后：大循环含每个模块候选与框架决策的标题和方向清单每条原文，模块含这个模块的标题 | `invalid`（`field: 'page'`），`hint` 写出第一个缺的 |
| `propose_to_human.parent`、`question`、`sources` | `question` 时可选，`parent` 与 `question` 互斥 | 已有节点 id；`sources` 至多 8 个 | `invalid` |
| `propose_to_human.attach` | 否，只对 `question` | `^rules:p-[0-9a-f]{8}$` 或 `^loops:lp-[0-9a-f]{8}$`，前缀要在 §3.13 的分派表里；存在与状态由提议的一方答 | `invalid`，`field: 'attach'`，`hint` 带那一方的原因 |
| `record_human_answer.words` | 是 | 1–3 段，每段非空、至多 500 码点，合起来至多 2,000 字符；每段是人在起点之后某条消息的一段（§3.6） | `invalid`，`field: 'words'` |
| `record_human_answer.recordedAs` | 是 | 一行，非空，至多 120 码点 | `invalid` |
| `record_human_answer.answer` | 是 | `agree`、`add`、`reject` | `invalid` |
| 图工具的 `relay` | 否 | 主 Agent：按换行切段，每段是人在起点之后某条消息的一段、起止在边界上（§3.6）；子会话：不允许带；普通会话：不核对 | 主 Agent 不合与子会话带了都由 `main-agent-graph-relay` 拒绝 |
| 提议式待决（引擎，任何写入方） | 四行在提议式上都必填 | §3.3；`conclusion` 一行、非空、至多 120 码点 | 引擎 `invalid`，`field` |
| `graph_decide` 的 `option`、`conclusion` | 恰有一个 | 选项式要 `option`，提议式要 `conclusion` | 引擎 `invalid` |
| 持有者记录文件 | — | `{version: 1, sessionId: string, graphDir: string, since: ISO 时间, commandId: string}` | 当作 `unreadable`（§2.4） |
| 会话事件（`hournessTalk` 的折叠，退路时是 `snapshotEvents`） | — | `{seq, time, type, data}`；`user/message` 的 `data.source` 是对象；`tool/result` 的正文是 JSON 文本 | 形状不对的事件跳过；整个读不到时按 §5 |
| `attachable` 带回的 `detail` | 否 | `markdown` 是 1–6000 码点的字符串，`mustShow` 是 1–8 片、每片 1–4000 码点的字符串数组（0.5 起，循环板设计 0.6 §17 M3 第 9 条、规则板设计 0.10 §10.7 M3 第 2 条；0.4 的 1–800 与 1–13 片每片 400 作废） | 当作 `ok: false`，`propose_to_human` 返回 `invalid`（`field: 'attach'`） |
| git 调用的参数（主 Agent 的 shell） | — | §2.5 的识别：子命令、全局选项、`-C` 与 `cd` 的字面路径；refspec 的源经 `rev-parse` 规整 | 认不出仓库目录时拒绝；参数含 `$`、`%`、反引号时按 `both` 并取最宽的列表 |
| 图的命令行调用（任何会话的 shell） | — | §3.8 第四条的认法 | 子命令不是 `show`、`open` 时拒绝 |
| 设计行 `persona.name` | 否 | 规整成一行，至多 40 码点；空时用「主 Agent」 | 超长截断并告警一次 |
| 设计行 `persona.text` | 否 | 至多 4,000 码点；去掉首尾空白后为空即不加 | 超长不加，行健康 degraded |
| `glm-prompt` 的 `reportingDepth`、旧键 `persona` | 否，都不带默认值 | `concise`、`balanced`、`detailed` | Schema 拒绝（同今天） |
| 模拟人配置 | — | §3.10 | 未知字段与不合法的项告警并忽略 |
| 标定的 `pending.json`（`--collect` 读它） | 是 | `{root: string, runs: [{name, dir}]}`，路径须为系统临时目录的直接子目录、带前缀 | 形状不对时不拷不删，退出码 2；单个路径不合格时跳过那一个并报出 |

## 7. 不变量（新增或改，接 0.4 §6.4）

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 主 Agent 不写文件 | 两层：组装时 `roleFace` 按原生名去掉写工具（看不到就不试，`question-26` C）；执行边界的 `main-agent-no-write`（按名调用与 shell 写入的兜底）。git 不算写文件（`d-main-agent-shell`） | 工具面不是边界，rc.3 按名执行 |
| 主 Agent 的 git 命令丢掉的已跟踪改动、未跟踪文件与提交都找得回；快照不出本机 | `tools/pre-execute`：会丢工作或改写历史的命令先存快照再放行，存不了就拒绝；文件列表只读 `-z` 的输出；被忽略的文件不进快照，会删它们的 `clean -x`、`-X` 与挡在写出路上的被忽略文件都拒绝，只有 `worktree remove` 删它们，删前记下路径、个数与大小；对外检查拒绝把快照推出去（§2.5） | 不可逆损失要有预防（`docs/DEVELOPMENT.md` §1.1 第二类的丢数据与对外的动作）；git 交给主 Agent 之后这是唯一的守卫 |
| 主 Agent 不给人列选项、不出卡 | 身份节与阶段提醒的说法（`talk.ts`）；`ask_user_question` 从工具面去掉并由 `main-agent-ask` 兜底；`main-agent-graph` 第三条拒绝主 Agent 写带选项的人定待决；`propose_to_human` 只收四行 | `d-chat-not-cards`；不靠模型照身份文本做 |
| 四行的排版只有一份实现 | `src/graph/proposal.ts` 的 `renderProposal` 与 `proposalLineRefusal`，工具、引擎、例题与面板共用 | 人纠正的都是排版；两份会走样 |
| 人的权限只来自人自己的话 | 主 Agent：`record_human_answer` 与 `main-agent-graph` 第一条都按 `hournessTalk` 核对原话（`talk.ts` 的 `personSaid`，起止在边界上）；子会话：图工具调用不能带 `relay`；普通会话：`relay` 照今天不核对，但它推不动阶段、批不了放行集合（下一行）；引擎照旧只给 `human` 与带 `relay` 的写入人的权限 | 原话核对不了就不记（fail-closed）；子会话里没有人的话可核对 |
| 目标与模块只经确认需求与放行方案向前；放行集合只在放行时批准 | 所有会话：`main-agent-graph` 第二条拒绝图工具向前改目标或模块的阶段、批准访谈中的目标、批准或带原话新提放行之前（目标一级或所属模块）的节点，第四条拒绝会话里用图的命令行写图；唯一的路是 `record_human_answer`，它在写入前核对人的原话、重查需求卡与放行门禁（模块是模块放行门禁）；子会话与普通会话的尝试告警 | `m3-6` 验收第 2 条；放行解开子 agent 的写入，M7 起主 Agent 自己推进（`d-auto-drive`）。认不出的写法（脚本里打开图引擎）是残余（§10） |
| 模块放行之前，派出去的 agent 不写这个模块 | `design-before-release` 按根的焦点所在的模块判（§3.14.6）；结构上还靠 M7 只派已批准的任务，而模块下的任务在模块放行之前都是提议 | `d-design-onepage`：每个模块先设计、人放行之后才开发；焦点之外的模块这条规则看不到，残余记在 §10 |
| 人放行的就是人看到的那一页 | `propose_to_human` 查 `page` 覆盖模块与方向清单；`record_human_answer` 核对整页在主 Agent 的回话里（第 5b 步）；阶段写入的 `reason` 带页的摘要 | 大循环放行的是框架、模块清单和方向清单，人看漏一条就是替人定了 |
| 模块只能被主 Agent 退回设计，退回不是同意 | 引擎只给模块这一个例外且 `reason` 不得以同意记号开头；`main-agent-graph-stage` 的 e 只放主 Agent（§3.14.7、§3.8） | 第二档可逆、只影响本模块；子 agent 与别的会话不能叫停一个模块，也不能把退回读成人的同意 |
| 人同意的就是人看到的那一版 | 待决：起点取最新一版的时间，做完之后 `llm` 改不了四行；放行：按提议时记下的修订号批准，改过的跳过 | 0.4 §3.4.2 的同一条，换成对话之后照旧 |
| 同一时刻一个项目至多一个主 Agent | 持有者记录（`main-agent-holder.ts`）与 `isMainAgent` 的读法；投影与记录不一致时按记录判，显示靠对齐 | `d-one-main-agent` |
| 说话的规矩只在一处定 | `src/design/talk.ts` | 格式再改只动它与 `proposal.ts` |
| 例题与换词表只定义一次 | `src/graph/plain-question.ts`，身份节与 `propose_to_human` 的说明原样引用，plain-ui 的检查从它读 | `d-plain-questions` 点名了几处，抄几份会走样 |
| 人设只进主 Agent 的系统提示词 | 设计行 `roleFace`（`isMainAgent`） | 子 agent 与普通会话会写文件 |
| 插件不带人设文字 | 设计行的配置默认空串 | `docs/CHARTER.md` 非目标 |
| 身份节的角色与边界部分只有角色与边界 | 单测钉住长度与内容 | `question-31` C |
| 标定运行时仓库里没有同批运行的解 | 运行器：运行目录在系统临时目录，整批之后才拷回 | `risk-calib-read` |
| 标定运行的记录不在拷回之前删掉 | `run-dir.mjs` 的 `closeBatch`：核对一致才删，只删 `pending.json` 里记着、在系统临时目录下、带前缀的路径 | 删除不可撤回 |
| M3 在执行边界上的每条拦截在规则板上看得到、只能看 | `src/guard/main-agent-rules.ts` 的 `MAIN_AGENT_RULES` 一处列出；规则板的代码规则目录从它映射；契约测试钉住违规流水里的每个 `rule` 都在表里（§3.11） | `d-rules-visible`、`d-defaults-readonly`；加了规则忘了登记，测试失败 |

0.4 §6.4 里两行改写：「只有人的动作能把目标推到 `design`、`release`」改为「只有 `record_human_answer` 带核对过的人的原话，能把目标推到 `design`、`release`，把模块推到 `release`」（0.4 写的「或人在面板上」随 `/graph-apply` 删去，面板不再写图，第 4 轮 N1）；「`human` 写入都带出处」（`human-writes.ts`）改为「带原话的写入都带出处：`reason` 含 `record_human_answer <callId>`，原话在 `relay` 或批注正文里」。

## 8. 0.4 原文要改的地方

行号是 0.4 当前文件（`.agents/tasks/m3/design.md`，1,234 行）的。改法照本附录；实现各步时在 0.4 里同批改写，或在 0.4 的这些位置加一句「见附录 §x」。

| 行 | 现在写的 | 改为 |
| --- | --- | --- |
| 14（§0 m3-1） | 身份文本：三问四答、八步访谈、五栏、五键、决策卡；工具面等于普通会话的工具面加两个设计工具 | 身份节两部分（§2.2）；工具面按 §2.1 |
| 15、38（§0、§1.2 的 m3-2） | 八步访谈经 `ask_user_question`；`design_review` 出确认卡 | 访谈是对话（§2.3）；确认经 `propose_to_human` 与 `record_human_answer`（§3.4、§3.5） |
| 16–19（§0 m3-3 至 m3-6） | 五键卡、决策卡、`design_review` | §3 |
| 23（§0 待人定 D1–D3） | 按会话开启；卡片工具；卡片回答以人的身份写图 | 一个项目一个主 Agent（§2.4）；对话工具（§3.4、§3.5）；带核对过的原话写图（§3.5、§3.6） |
| 62、63、71（§2.1 构件表） | `cards.ts`、`human-writes.ts`、`UserQuestionsService` | 删；加 `talk.ts`、`propose.ts`、`record.ts`、`proposal.ts`、`main-agent-holder.ts`、`git-snapshot.ts`、`plain-question.ts`；薄适配层加 `SessionEventLike`、`snapshotEvents?`、`SessionPersistenceLike` |
| 86（§2.2 第 3 条） | 每步一个 `ask_user_question`，推荐项放第一并加 `(Recommended)` | 每步在对话里问一两句开放的问题，拿到回答就写图 |
| 87、88、90（§2.2 第 4、5、7 条） | `decision_card`、确认卡、五键卡 | `propose_to_human`（`question`、`confirm`、`release`）与 `record_human_answer` |
| 101–102（§2.3） | fork 的会话仍是主 Agent；一个工作区可以有多个主 Agent 会话 | §2.4 |
| 160（§3.1.1 表） | 「主 Agent 模式要用会话投影服务，这个组合里没有」 | §2.8 的说法 |
| 241（§3.1.3 第 5 项） | 八步访谈与 `ask_user_question` 的规则 | 整项删去，按 §2.2 的去向表 |
| 242–245（§3.1.3 第 6–9 项） | 图上的写法、`design_review`、决策卡、汇报细度 | §2.2 的去向表 |
| 248（§3.1.3） | 长度上限 9000 | 第一部分 1,500、第二部分 1,400、整节 2,700 |
| 258（§3.1.4 判写） | 判写继承 file-tools-only 的缺口（含改工作树的 git 子命令） | git 不当写文件，会丢工作的命令先存快照（§2.5） |
| 282、283、311（§3.2.1） | `ask_user_question`；问题的形状写进身份文本 | 对话；第 5 步按 §2.3 |
| 332–350（§3.2.3 确认卡） | 整节 | §3.4、§3.5 的 `confirm` |
| 458–551（§3.4 五键与 `design_review`） | 整节 | §3.4、§3.5 的 `release` 与 §3.7；放行集合、修订号与部分失败的规则照旧 |
| 509–516（§3.4.3 D3） | 卡片回答以人的身份写图 | §3.5 末段 |
| 555–586（§3.5.1 `decision_card`） | 整节 | §3.3、§3.4、§3.5 的 `question` |
| 594（§3.5.2） | 一个工作区可以有多个主 Agent 会话写同一张图 | 候选只有持有者（§2.4） |
| 624（§3.5.3） | `FIVE_KEYS` 已迁到 `cards.ts` | 随 `decisions.ts` 一起删 |
| 708（§3.6.4） | `order: 20` | 30 |
| 752（§4 契约表） | `ask_user_question` 的参数与「推荐项放第一」 | `ask_user_question`：从主 Agent 的工具面按角色去掉，`main-agent-ask` 兜底；探针与标定的覆盖层仍插入 `tool-ask-user`；另加 `sessionProjections.register` 与 `stateOf`（会话投影 `hournessTalk`，session-projection:58–131）、退路的 `session.snapshotEvents()`（rc.3 已弃用，dsh-session:1444–1452）、`user/message` 的 `source` 形状（api-session-controller:3222–3228、dsh-headless:340–346）、`agent.whenIdle()`（agent-loop:870–875）、`commands.execute` 返回 `undefined` 的两种情形（commands:326–330） |
| 804（§6.2 表） | degraded「主 Agent 模式要会话投影服务」 | §2.8 的说法 |
| 847（§6.3） | `decision_card.why` | 删去，按 §6 |
| 860、869（§6.4） | 只有人的动作…；`human` 写入都带出处 | §7 末段 |
| 921、924、927（§8 表第 3、6、9 步） | `UserQuestionsService`；`cards.ts`、`human-writes.ts`、`decision-card.ts`；五键卡、汇报细度、`FIVE_KEYS` 迁移 | §4 |
| 968、972、987（§9.1.2、§9.1.3） | 模拟人的卡片配置与选法；`glm-decision-card` | §3.10；`glm-design-question`（第 6 步） |
| 1030、1040、1042（§9.2） | `task.json` 的卡片配置；`ask_user_question` 次数；整段访谈要在一个回合里完成 | 第 8 步与第 12 步（a） |
| 1050（§9.3 第 3 项） | 访谈中 `ask_user_question` 的卡片标出推荐项 | 第 12 步（b）第 3 项 |
| 1086、1095（§11） | 「要改」不带文字时用 `ask_user_question` 追问；访谈的提问形状只写进身份文本 | 对话里追问；四行的形状由 `propose_to_human` 与引擎执行（§3.3、§3.4） |
| 106（§2.4 开头）、110–116（转换表） | 「M3 只处理目标上的阶段；特性上的阶段只读，用于提醒」；`design` → `release` 由人的五键卡批准 | 模块（目标的直接特性子节点）也带 `stage`，转换与谁能写见 §3.14.7；`release` 由 `record_human_answer` 的 `release` 批准（不带或带 `module`） |
| 379–390（§3.3.2） | `releaseGate(graph, goal)` 的六条，放行集合是目标子树里全部提议 | 没分模块的目标不变；分了模块的目标是大循环放行门禁（§3.14.2），模块是 `moduleReleaseGate`（§3.14.3） |
| 392–444（§3.3.3 判定表） | 根的目标在 `release` 或之后一律放行 | 加一行：焦点在还没放行的模块里时拒绝（§3.14.6） |
| 683（`docs/ORCHESTRATION.md` §4.8） | 「阶段存在目标节点的 `stage` 字段（§2.6；特性上的阶段只读）」 | 「阶段存在目标与模块（目标的直接特性子节点）的 `stage` 字段（§2.6）；模块的 `stage` 只经模块放行向前，主 Agent 可以把它退回 `design`」；§4.5 放行一节写两层放行（第 9 步同批改，面板设计 0.7 §11「两层循环」M3 第 4 条） |

## 9. 交给编排者记图的事项

本运行不写 `docs/graph/`。下面的事项写成草稿 `.agents/tasks/m3/graph-ops-addendum-v05.json`（0.4 的草稿 `graph-ops-addendum-v04.json`、0.3 的 `graph-ops-addendum.json` 留作对照），由编排者决定怎么记。

1. 验收要请人改字句（必须问人的第 1 类，`norm-decision-tiers`）。起因是人后来的两个决定 `d-chat-not-cards`（不出卡、不给选项）与 `d-one-main-agent`（一个项目一个主 Agent），图上的旧字句点名了卡片与多个主 Agent。建议的新字句（实现照这些做；人若改成别的，只改第 3、6–9 步的「验收（待人改）」与对应的 L2、L3）：
   - `m3-1` 第 3 条：「主 Agent 的工具面等于同一组合下普通会话的工具面去掉写文件的工具（Write、Edit 及其别名、str_replace_editor 的写操作）与 ask_user_question，加上 propose_to_human、record_human_answer；由编排层插件在组装时去掉，不用 preset；shell 写入由 guard 兜底」
   - `m3-2` 第 2 条：「需求卡缺项时 propose_to_human 拒绝并列出缺项，人看不到提议；人在对话里同意之后，目标由提议变为已批准、阶段为 design，历史带人的原话」
   - `m3-2` 第 3 条：「标定任务 interview-expense-log 在 GLM-5.3 上三次里至少一次完整通过验收脚本；模拟人在对话里回话：开放的问题按任务写好的事实答，提议按任务写好的话答（需求同意一次，方案先补充一次再同意）；两档模型的结果都记作基线」
   - `m3-3` 第 1 条：「五栏缺任一栏时 propose_to_human 拒绝并说明缺什么，人看不到提议」
   - `m3-3` 第 3 条：「放行把提议时列出的提议全部转为已批准，阶段为 release，历史带人的原话；带 supersedes 连线的提议不能这样放行」
   - `m3-4` 第 1 条：「人在对话里对提议说的五种话（同意、否掉并说理由、补充、讲细点、说重点）都有确定的去向：前三种由主 Agent 带人的原话记进图，后两种只改主 Agent 这一次怎么讲」
   - `m3-4` 第 2 条：「否掉的理由与补充的话记成目标或待决上的批注，带人的原话与主 Agent 记成的那一句；harness 核对这段话确实是人在提议之后发来的」
   - `m3-4` 第 3 条：「桌面版上主 Agent 的提议是题目一段，背景、推荐、疑问、不做各一段，每段重点几个字加粗，问话在最后；没有选项与按钮」
   - `m3-5` 第 1 条：「要人定的事在图上留一张待决，主 Agent 在对话里提出；人当场回话就由人定；没回话时这张待决留在「需要你」里，人之后在同一个主 Agent 的对话里回话也算」
   - `m3-5` 第 2 条：0.4 建议的新字句（「人在面板上拍板、批准或否决后，主 Agent 会话收到消息……」）作废，改为建议**删去这一条**：面板不再写图（面板设计 0.6 §9.1，`/graph-apply` 删去；0.7 §11 第 6a 条已请编排者把它并进这一批），说的事不再存在，第 7 步取消。验收只能由人改。
   - `m3-3` 新增一条（待人加；0.5，`d-design-onepage` 扩到产品）：「分了模块的目标：大循环放行一次批准框架、模块清单和方向清单，之后每个模块各放行一次，人看一页放行稿并在对话里同意；模块放行之前，派出去的 agent 不能写这个模块的任何东西；主 Agent 能把一个模块退回设计，人的原话才能把目标退回大循环」
   - `m3-6` 第 2 条：「阶段前进只经主 Agent 带人的原话记下的确认与放行（目标一级与每个模块各一次），门禁同 m3-2、m3-3；任何会话（主 Agent、子 agent、普通会话）用图工具或在会话里用图的命令行向前改目标或模块的阶段、在放行之前批准放行集合里的节点，都被拒绝，子 agent 与普通会话的尝试会告诉人」
   - `m3-4`、`m3-5` 的标题与正文里的「五键」「决策卡（同步 / 异步）」「借用 user-questions」随之改写。
2. 已经人定、前提随 `d-chat-not-cards` 变了的三件，建议在节点上各记一条批注，不必再问人：`question-20` B（D2：两个借用组件改为本项目的卡片工具，现在是两个对话工具）；`question-21` A（D3：卡片回答以人的身份写图，现在没有卡片，改为带核对过的原话）；`question-24` A（D6：同步卡原定的出工作区申报归 M4，见第 6 条）。
3. `question-39` B：`m3-1`、`m3-2` 的第 3 条已在 2026-10-29T15:33Z 按建议文字改好，16:14Z 人重答仍是 B（N7）；第 1 条的新字句再改一次。
4. 给改写 `d-option-card` 的那件事：M3 只让主 Agent 不再写选项式的人定待决（`main-agent-graph` 第三条），引擎照旧接受两种形状。编排方用命令行写人定的题、面板的选项卡、`e22282f` 的必填规则要不要对新写入改为只收提议式，由那件事定；`graph_propose` 的说明已在第 6 步改成「人定的题是提议式」。
5. 给面板设计（0.6 §11 的 M3 各条，N4，确认已接住）：`/wish` 入口与 `FirstVisitLine` 的位置（§2.6）；`PLAIN_LIMITS.background` 只读常量（§2.9）；`ANSWER_MARKS` 在 `src/shared/answer-marks.ts`（§3.5）；`isPersonMessage` 不抽出、留在 `talk.ts`（面板 0.6 §4.9 已不需要它，§3.2）；`holderFileOf` 与 `holderHome`（§2.4）；`PROPOSE_TO_HUMAN`、`RECORD_HUMAN_ANSWER` 在 `src/shared/tool-names.ts`（第 6 步）；M3 第 6 步给面板加的最小显示由面板设计第 5 步整体替换，谁后合入谁 rebase；`PLAIN_WORDS` 与例题只在 `src/graph/plain-question.ts`，例题已换成 `d-peak-mode` 的内容（§2.8）。面板设计 0.6 §11 M3 第 4 条与它自己的 §4.9 不一致（前者要 M3 改调 `src/shared/person-message.ts`，后者把这个文件删去并交 M3 定），M3 按 §4.9 做（0.7 的 §11 第 4 条已撤回那一条）。面板设计 0.7 新加的各条：第 6 条 `shownProposalOf` 在 `src/shared/tool-names.ts`（§3.2、第 6 步）；第 6a 条第 7 步取消、`m3-5` 第 2 条建议删去（本条第 1 点，第 4 轮 N1）；第 6b 条 `mockup-wish.svg` 脚注的新字归 M3 的 §2.6 引这张图时照用；第 6c 条的契约测试在第 6 步 L2（第 4 轮 N2）；「两层循环」里 M3 的五条全部接住，不同与补充见 §3.14.9。
6. 给 M4（`m4-request-card`，D6 `question-24` A）：0.4 说申报通道复用 M3 的 `cards.ts` 与 `human-writes.ts`，这两个文件不再有。按 `d-chat-not-cards`，出工作区的申报也该是主 Agent 在对话里提、人回话、harness 核对原话（`src/design/talk.ts` 的 `personSaid` 可直接用），「批准只放行当次」的执行另设计。
7. 给 M7：
   - `d-auto-drive`：放行那一次写入是 `record_human_answer`（`release`、`agree`）以 `llm` 身份、带 `relay` 把目标（没分模块的目标）或模块（分了模块的目标，带 `module`）的 `stage` 改为 `release`，`reason` 以「人在对话里同意（record_human_answer <callId>）」开头，末尾可有一页稿的摘要。驱动循环从这条历史认出放行，不另找信号；`release` 阶段提醒那一句由 M7 改为「接着分解与派发，不用等人」。分了模块的目标，目标一级的 `release` 只表示框架、模块清单与方向清单定了，不表示任何模块开工（模块都还在 `design`）：M7 从各模块自己的放行写入接手那个模块，不从目标一级的写入接手（§3.14.2）。
   - 两层循环（`d-design-onepage` 扩到产品，面板设计 0.7 §11 第 6–9 条）：M7 的 `derivedStage` 接受模块；第二档（改到本模块的设计方向）主 Agent 用 `graph_edit` 把模块 `stage` 改回 `design`，不带原话、`reason` 不以同意记号开头，引擎对这一处开了例外（§3.14.7），子 agent 与别的会话做不了（§3.8 第二条 e）；第三档（改到框架）主 Agent 带人的原话把目标 `stage` 改回 `design`（今天就是这条路），目标回到 `design` 后目标下的子 agent 一律只读，比「受影响的活」粗，M7 要缩小时改 `design-before-release` 目标一级的那一行判定（§3.14.8）；模块设计对照方向清单的独立评审该由 M7 的派发做，M3 不核对评审做没做；M7 设计 0.5 还没有这一项，加上之前只有主 Agent 的自查和一页稿的「替你定了的方向」（§10，第 5 轮 R5-N4）；一次至多三件由 M3 的「一条回复至多三件」守，攒哪一批归 M7。
   - `d-main-agent-shell`：主干前进时按 `norm-merge-gate` 核对、记证据是 `m7-5` 的事；M3 合入之后到 M7 合入之前，主 Agent 移动主干不受核对，留痕在 git 的 reflog、会话日志与快照流水（只有改写历史的命令进流水）。子 agent 的 git 快照或工作树隔离也归 M7。
   - `d-main-agent-models`：M3 没有派活工具。DSH 的委派在请求不覆盖时沿用父 agent 的 provider 与模型（subagent:302–305），subagent 工具的 `modelSelectionSettings` 打开时可以按调用选 `provider`、`model`、`reasoning_effort`，限于允许清单（tool-subagent:42–66、311–314、360–374）；M7 设计派发选模型时先评估这项现成能力（N5）。派发时让主 Agent 选模型、记理由在 M7。
   - `git-snapshot.ts` 的 `gitInvocations`、`takeSnapshot`、`gitRisk` 由 M7 加 `export` 给 worker 的 git 与主干前进的核对用（图上 `m3` 19:14Z 的批注）；0.4 的对外检查（不把快照推出本机）与被忽略文件不进快照两条同样适用于 worker。
   - `d-one-main-agent`：晨报、周报与巡检由 harness 到点提醒持有者会话，用 `mainAgentOf` 找它；`m7-7` 的运维会话与 `/patrol on` 作废。
8. `d-plain-questions` 里 M3 不做的两件：图工具说明的例题（第 6 步只改了 `graph_propose` 里说待决形状的那句）、问题字段的写法检查（面板设计 0.6 §5.3）。`PLAIN_QUESTION_GUIDE` 与 `plainWordsIn` 在 `src/graph/plain-question.ts`，可以直接用。
9. 发现（不变）：`question-31` C 里汇报细度并进 Output Style（清点报告 Q2 C 后半）与子 agent 只拿它需要的（Q5 B）没有落到任何节点上；建议在 `prompt-audit` 或 `glm-house` 下提一个任务，等 `question-30` 的消融。
10. ZCode 3.17.1（`d-zcode-3171`）：`zcode-3171-follow` 已合入 main，M3 各步建在它上面。`m3-main-persona` 一步在 `docs/reference/zcode-verbatim.md` 加「不跟 3.17.1 的地方」三处（风格正文放在系统提示词的节里而不是主回合的上下文条目；不加 `r8o` 的每回合提醒；正文后多一句范围说明），各一句理由，请编排方同意（§2.7）。
11. 实施开工时两个工作树先快进到 main（§4 开头；图上 `m3` 2026-10-30T10:22Z 的批注写已快进到 `e1a4d25`，开工时再核对一次）；`m3` 上批注：附录 0.4 写成（回应第 3 轮的 MEDIUM 8、NIT 12），附录 0.5 写成（回应第 4 轮的 MEDIUM 2、NIT 2，§16），待评审。
12. 给规则板设计（`d-rules-visible`，§3.11）：代码规则目录里 M3 的条目由 0.8 §10.1 的「M3 的两条」改为 `MAIN_AGENT_RULES` 的八条，`design:<id>`，行 `design`，`effect: 'block'`，`plugin: 'dsh-hourness'`；`builtin.ts` 从 `src/guard/main-agent-rules.ts` 映射，不另写；先合入的一方建，后到的一方追加。规则板 0.8 §2.6 的表里「主 Agent 不写文件（M3）」「设计期只读（M3）」两行随之扩成八行（标题照 §3.11 的表）。
13. 给规则板与循环板设计（接缝裁定，§3.13）：`attach` 的分派表在 `src/design/attach.ts`，每块板合入时自己加一行（导入它自己的服务模块）；`detail` 与「给人看过原文」照循环板 0.3 §17 第 5、6 条做；交回只挂在 `record_human_answer`。规则板 0.8 §10.7 M3 第 1–3 条、循环板 0.3 §17 M3 第 1、2、5、6 条都已接住；循环板第 7 条（持有者会话已归档时 `/wish` 提醒人）M3 本版不做，记在 §10。0.5 另接住循环板设计 0.6 §17 M3 第 9 条与规则板设计 0.10 §10.7 M3 第 1、2 条（`rules:` 与 `loops:` 一样交回 `detail`；两块板的脚本提议和循环板的检查提议都过「给人看过原文」的核对；`AttachDetail` 上限 `markdown` 1–6000、`mustShow` 1–8 片每片至多 4000），以及循环板 0.6 的只把已有待决再给人看一次的 `propose_to_human`（§3.4，M4 同请）。规则板 0.10 §10.7 M3 第 4 条（`MAIN_AGENT_RULES` 八条不变）照旧。
14. 给指标流水设计（`metrics`，§3.12）：M3 的八类事件与出口 `src/design/metrics.ts` 的 `emitMetric`；接口到位之前什么都不做。
15. 给编排方（§3.8 第四条）：DSH 会话里的 agent 不能再用图的命令行写图；编排方在 DSH 之外用命令行不受影响。
16. 给编排方（两层循环，§3.14，第 4 轮 M2）：(a) 本仓库的图今天没有 `norm-directions`；主 Agent 在 DSH 里按两层循环做剩下的模块（`d-dogfood-scope`）之前，要有一份方向清单和每个模块的放行：写方向清单、先清掉 `orch` 带着的旧 `stage: design`（面板设计 0.7 §4.11 边界情况与 §14 第 8 条）。(b) 模块放行的一页稿由主 Agent 写，编排方在 DSH 之外做的放行稿（`.agents/tasks/*/onepage.md`）不经这个工具。(c) `docs/ORCHESTRATION.md` §4.5、§4.8 与 `docs/CHARTER.md` 的流程一节写两层放行（§8 表末行、`d-design-onepage` 的「落地」一条）；第 9 步同批改。
17. 给面板设计（0.7 §11「两层循环」，§3.14.9）：契约全部接住；补充四处——`src/graph/modules.ts` 多 `moduleCandidatesOf`、`moduleOf`、`isReleased`、`isSplit`；`propose_to_human` 的结果与 `Shown` 多 `page`（面板不读）；目标在大循环放行时就进 `release`，模块各自在 `design`；模块退回设计时 `reason` 不带同意记号，面板的 `answerKindOf` 不会把它读成「你在对话里说」。
18. 对齐轮要做、本版没做的（§10 末几条）：持有者记录搬进项目的 `.llm/` 并导出按项目根定位的读法（循环板 0.6 §17 M3 第 10 条、规则板 0.10 §10.7 M3 第 3 条）；M4 设计 0.4 的其余请求（`busy`、`observe`、`noteDenial`、`installRuleGate`）；给人看的确认需求与一页放行稿的示范（`d-agent-examples`）。
19. 给编排方（第 5 轮 R5-M1，`design-context.md`「Dogfood implementation order and runtime paths」）：快照流水已并进 0.5，位置是 `<项目根>/.llm/snapshots.jsonl`，临时暂存区在系统临时目录（§2.5）；`src/data/project-root.ts` 的 `projectOf` 谁先合入谁建，M3 第 4 步依赖它；持有者记录搬家不在这一条里，仍按第 18 条留给对齐轮。
20. 给 M7（第 5 轮 R5-M2、N1、N3、N4）：大循环放行同意时先给模块候选写 `stage: design`（候选仍是提议）、再批准、最后写目标的 `release`（§3.14.2），所以候选可能已带 `design`，`effectiveStage` 对它仍按提议算（`interview`），M7 设计 0.5 §2.4 对「设计中的模块」的定义（含候选）不受影响；`isReleased` 含完成，M7 那一支「完成而阶段在 release 或之后」可以删（§3.14.1）；M3 到 M7 之间焦点在目标一级时 `design-before-release` 放行，M7 的 `dispatch-chain-readonly`（M7 设计 0.5 §3.2.2）合入后取代（§3.14.6）；M7 设计 0.5 没有模块设计评审的派发与记录，请记成待办（§10）。

## 10. 不做的事（新增）

- 主干前进时的 `norm-merge-gate` 核对与证据（M7 `m7-5`）；子 agent 的 git 快照（M7）。M3 不拦主 Agent 移动主干。
- 快照的自动清理与恢复命令。残余：脚本与 git 钩子里调用的 git、`git` 以外的程序改仓库认不出；写出类的目标树解析不出时，挡路的被忽略文件查不出（只存未被忽略的）；`worktree remove` 删掉的被忽略文件不恢复（只记路径、个数与大小）；合并冲突的三方版本不存；经 git 以外的工具推送（例如托管平台的命令行）不经对外检查；把快照里的改动恢复出来、再照常提交推送，是主 Agent 自己的正常提交，不拦。
- 先想后看与跟随率的算法（`d-inertia-breaker`、指标流水）：M3 只把同意、补充、否掉写成三种固定说法（§3.5）。
- 主 Agent 有没有把 `propose_to_human` 的 `text` 原样放进回复，运行时不拦；第 12 步（a）数。
- 普通会话（没有 `/wish`）里图工具的 `relay` 不核对：只有主 Agent 的转述有人的权限这件事是 M3 新开的路，普通会话照今天；但普通会话推不动阶段、批不了放行集合（§3.8 第二条），子会话不能带 `relay`（第一条）。
- 晨报、周报与巡检的到点提醒（M5、M7，`d-one-main-agent` 后半）；面板「需要你」的改版与跳转（plain-ui）。
- 汇报细度并进 Output Style、子 agent 不带汇报细度（§9 第 9 条）。
- ZCode 3.17.1 的每回合风格提醒（`r8o`，`${name} output style is active…`）与「风格正文作为主回合上下文条目」的放法：不跟，理由与编排方的同意写在 `docs/reference/zcode-verbatim.md` 的不跟一节（§2.7）。
- 普通会话的人设。
- 标定会话的读取圈禁（`risk-calib-read` 的第三条处理方向）：本次只把运行目录移出仓库、整批之后才拷回、会话结束后才跑验收脚本。残余：被测模型按绝对路径仍能读仓库（包括本批的 `pending.json`）与系统临时目录里同批的其他运行。
- 上手页、没有项目图时的开场卡片、面板首页的 `/wish` 一句（plain-ui 的引导与面板改版）。
- 持有者会话已归档时 `/wish` 的回复与流程条提醒人（循环板设计 0.3 §17 M3 第 7 条，标为不挡循环板的建议）：本版不做，循环板按自己的 `holderState` 处理；要做时只加 `/wish` 表里的一行。
- 图引擎的其他写入口：脚本或别的程序里直接打开图引擎、`npm run graph` 以外的包装命令，第四条认不出（§3.8）；放行之后子 agent 能写文件，能写出这样的脚本。防的是模型顺手带一段编的 `relay`，不防有意绕过的程序，残余与 guard 认不出的 shell 写法同一类。
- 两层循环里本版不做的（§3.14，第 4 轮 M2）：
  - 模块设计对照方向清单的独立评审（`d-design-onepage`：违背即挡路）：评审的派发和记录归 M7，M3 的模块放行门禁不核对评审做没做，只在阶段提醒里要求主 Agent 先对照方向清单、在一页稿的「替你定了的方向」里写出来，人在放行稿里看得到。M7 给出评审记录的形状之后，`moduleReleaseGate` 加一项（只加一行门禁，不改别处）。**M7 设计 0.5 没有这一项**（它的 `d-design-onepage` 一行只复述了「每个模块的设计对照方向清单」，没有模块设计评审的派发或记录条目；第 5 轮 R5-N4）。在它加上之前，对照方向清单只有主 Agent 自己的对照和一页稿里「替你定了的方向」一段，没有独立评审在管；面板设计 0.7 §4.11 对人写的「每个模块的设计都对照它，违背了要改设计」因此暂时只由主 Agent 保证。请编排方在 `m7` 节点上把它记成一个待办（图操作草稿的 `m7` 批注已提）。
  - 开发中的三档判定与成批：归 M7（M3 只守「一条回复至多三件」和两处退回的写权限）。
  - 删除、合并模块与改模块清单：走大循环（把目标退回 `design`，§3.14.8）；M3 不设单独的命令。
  - 子 agent 的写权限只看根的焦点所在的节点（§3.14.6）：焦点在已放行的模块 A 时，派去写模块 B 的子 agent 被这条规则放过；分了模块的目标在大循环放行之后，焦点停在目标一级（所有模块还在设计）时，派出去写文件的子 agent 同样被放过（第 5 轮 R5-N1）。结构上的挡法是 M7 只派已批准的任务、B（或任何还没放行的模块）下面的任务在放行之前都是提议；M7 合入后 `releaseOf` 取代这一行判定（M7 设计 0.5 §2.4、§3.2.2）。M3 合入到 M7 合入之间只靠身份节与提醒里的话（「目标或它的模块」放行之后才派写文件的活，写之前 `graph_focus` 到模块或它下面的任务）；这是残余，不是缺口：写出来的文件不是不可逆损失（git 里可见、可退），而且 B 放行时人看的是 B 的一页放行稿，不是文件。
  - 目标退回大循环之后，目标下的子 agent 一律只读（比「受影响的活」粗，§3.14.8）。
- 留给对齐轮的，由 `d-alignment-rounds` 排期（人在 2026-10-30 定：对齐轮只改与 `d-boards-as-hooks`、`d-rules-in-repo`、`d-main-agent-peak-exempt`、`d-memory-scope` 冲突的地方；M3 在自举关键路径上，先走了第 4 轮的四条）。图上 `m3` 的批注留着这些请求，本版没有做，也不依赖它们：
  - 持有者记录搬进项目的 `.llm/`（`d-rules-in-repo`；循环板设计 0.6 §17 M3 第 10 条、规则板设计 0.10 §10.7 M3 第 3 条）：今天 §2.4 仍把记录放在 `<DSH home>/glm-hourness/main-agent/`，并写了为什么不放项目目录（桌面版上 `projectHome` 是各工作区共用的一个配置值）；搬家要换这个理由、改 `holderFile` 的定位、导出按项目根定位的读法（例 `readHolderFor(<项目根>)`，`none`、`held`、`unreadable` 三种结果不变）、改第 3 步的 `norm-review-floor` 理由（不再写用户级目录）。循环板与规则板现在经 `holderFileOf(userHome, dir)` 加 `readHolder(file)`，或 `mainAgentOf`，读得到三种结果，两块板只换定位函数，不受这次推迟影响。快照流水不在这次推迟里：它不是持有者记录，编排方 2026-10-30T10:56Z 的裁定要求并进 0.5，已在 §2.5 第 6 步做（第 5 轮 R5-M1）；这一条推迟的只有持有者记录。
  - M4 设计 0.4 的其余请求（图上 `m3` 2026-10-30T07:12Z）：本会话有开着的申报时 `propose_to_human` 返回 `busy`、`installMainAgentRules` 经 `installRuleGate` 安装、git 快照门调 `observe` 与 `noteDenial`。（同一条里不带题目与四行的 `propose_to_human` 本版做了，§3.4。）
  - 确认需求与一页放行稿的示范（`d-agent-examples`：问人、确认、放行各一道，放在写它的工具的说明里）：本版只改了问人一道（§2.8），`confirm` 与 `release` 的示范在对齐轮写，用与练习题不相干的领域、只讲已经定了的事，同样过 L2。

## 11. 由 agent 定、人可推翻的事项（新增）

- 角色相关的工具过滤放在不带 `prepend` 的 `roleFace` 里层监听器，身份节仍是 0.4 的 `prepend` 监听器；写工具按原生名判（§2.1）。
- `str_replace_editor` 在主 Agent 的工具面上收窄为只有 `view`，形状不认识时整个去掉（§2.1）。
- 身份节分两部分：角色与边界 1,500 字符、五项内容；说话方式、例题与换词表 1,400 字符；整节 2,700（§2.2）。带例题的 `PLAIN_QUESTION_GUIDE` 在主 Agent 的系统提示词里出现两次（身份节与 `propose_to_human` 的说明），每次 648 字符、共约 1,300 字符，静态，能进提示词缓存。
- 一条回复至多三件事，题目按交给人的先后编号 ①②③，只有一件时也编号（照人给的样子）（§3.3、§3.4）。
- 四行的上限：`background` 只读面板设计的 `PLAIN_LIMITS.background`（0.6 为 60），其余三行 40 个码点（都不算 `**`），加粗 2–12 个码点、恰好一处；结论 120（§3.3）。
- 四行由 harness 拼、模型原样转给人，不让模型自己排版（§3.4）。
- 提议式待决是引擎里的第二种形状，存四个字段与 `conclusion`；做完之后 `llm` 改不了四行（§3.3）。
- `confirm` 与 `release` 的提议不写图，「给人看过」从会话投影 `hournessTalk` 认（§3.4）。
- 人的原话的认法：`user/message`、`source.kind === 'user'`、不是 notice、不是 `/goal` 附件的固定文字；NFKC 与空白规整之后按子串比，起止落在空白、Unicode 标点或消息边上；起点按最新一版（§3.6）。原话核对不了时不记、不放行（fail-closed）；第二条规矩判不了时同样拒绝，第三条 fail-open（§3.8）。
- 放行与确认由 `llm` 带 `relay` 写，不由 harness 以 `human` 身份写（§3.5 末段）。
- 任何会话用图工具或命令行向前改阶段、批准访谈中的目标、在放行之前批准或带原话新提放行集合里的节点一律拒绝，向后改照引擎规则；判不了时拒绝（§3.8 第二条）。子会话的图工具调用不能带 `relay`（第一条）。
- 主 Agent 不能写带选项的人定待决；引擎本身照旧收两种形状（§3.8 第三条、§9 第 4 条）。
- 模拟人在 `turn/end` 时回话，消息形状同 headless 的任务消息；回话规则六条（§3.10）。
- 一个项目一个主 Agent 的细节：项目就是图目录；持有者记录放在用户级数据目录（搬进项目的 `.llm/` 留给对齐轮，§10），键是规整后图目录的哈希；`/wish here` 移动；原会话由 harness 执行一次 `/wish off`；fork 出的会话创建时变回普通会话；记录读不到时按投影判（§2.4）。
- git：只在存不了快照与快照会出本机（或会删快照不存的被忽略文件、嵌套仓库）时拒绝；快照提交 `K` 以所有旧的引用为父，引用放在 `refs/hourness/snapshots/<id>`；旧值会变得不可达或已推送时另建只含旧引用值的 `K_h` 并打轻量标签；被忽略的文件不进快照，`worktree remove` 只记它们的路径、个数与大小；要存的文件上限 200 MB、20,000 个（只算要存的；装依赖的工作树清理不受它影响）；整个快照 30 秒；文件列表只读 `-z` 输出、git 在 C 语言环境下跑；`cd` 到非字面路径时拒绝；快照流水放在项目的 `.llm/snapshots.jsonl`（项目根按 `projectOf` 取会话的工作目录，主检出与各工作树共用一份；`.llm/` 自己带 `.gitignore`），临时暂存区放系统临时目录、用完即删，不往 git 目录写文件（`d-rules-in-repo`，第 5 轮 R5-M1）；不自动清理；什么都不用存时整件跳过（§2.5）。
- 人设只给主 Agent，不给普通会话；人设节末尾空一行加插件自己的范围说明一句（§2.7）。
- 旧配置键 `persona` 保留为已弃用的同形字段并照读；两个键都不带默认值，告警按规整之后的值判（§2.7）。
- 标定的运行目录每次运行一个系统临时目录，整批之后整棵树拷回 `.llm/calibration-runs/` 再删，失败时 `--collect` 重做；访谈任务的边界 120 步、40 分钟（第 8 步）。
- `/wish` 入口在 M3 第 11 步实现，没有项目图时不显示；空白会话里已是主 Agent 时开场卡片换成退出一行；黄字不点名模型（§2.6）。
- 例题保留人给的格式，内容取已定的高峰模式里「派出去的活怎么排」，不教主 Agent 在高峰里自己少做（`d-peak-mode`、`d-main-agent-peak-exempt`，§2.8，第 4 轮 M1）；说明里加「只示范版式，里面的事已经定了」一句；人想换别的已定事项作例题，只改 `PLAIN_QUESTION_EXAMPLE` 一处，L2 钉住题目不含「主 Agent」、不做一行含「主 Agent 照常回你话」。
- 两层循环（§3.14，第 4 轮 M2）：目标下有直接的特性子节点就是分了模块的目标，不另设开关；方向清单是固定 id `norm-directions` 的 `norm` 节点，大循环放行至少要有一条方向；目标在大循环放行时就进 `release`、模块各自在 `design`（面板设计 0.7 §4.11 的读法，不取评审提议的「最后一个模块放行时才到」）；模块的放行集合只有模块子树里的提议；一页放行稿 `page` 至多 `PAGE_LIMITS.max`（2,000）个码点，harness 只查会让人看漏的事（大循环：每个模块候选与框架决策的标题和方向清单每条原文；模块：模块标题）和有没有给人看过，不查标签与行文；阶段写入的 `reason` 末尾带页的摘要（规整后 `sha256` 前 8 位）；模块退回设计只有主 Agent 能做、不要人的原话、`reason` 不得以同意记号开头；目标退回大循环要人的原话；退回之后目标下的子 agent 一律只读。
- 第 7 步取消，编号不顺延：别的设计和图上的批注都按步号引用 M3（§4 第 7 步一节）。
- M3 的八条拦截以 `design:<id>` 列进规则板的代码规则目录，`git-snapshot` 一条在标题里写「存不了才拦」，不另加字段（§3.11）。
- 交给人的提议与人的消息从会话投影 `hournessTalk` 读，人的消息至多留 20 万码点、交给人的提议至多留 64 项、每项的「之后的文字」至多 16,000 码点；fork 出的会话不继承父会话里人的话（§3.2）。
- `attach` 的分派表由各块板自己往里加一行；交回只挂在 `record_human_answer`（§3.13）。
- 子 agent 带编的原话、普通会话推进阶段被拦时，设计行行健康降级 24 小时，并通知主 Agent 告诉人；同一会话同一目标 10 分钟一次（§3.8）。
- 会话里不让用图的命令行写图（§3.8 第四条）。
- `/wish here` 后面可以跟一句话（§2.4）；`agent/created` 的对齐排到 agent 空闲之后（§2.4）。
- 人设一节放在 `glm:context-management` 之前、标题后单换行、不加每回合提醒，待编排方同意（§2.7）。

## 12. 按方向清单自查（`d-design-onepage`）

`d-design-onepage` 要每个模块的设计对照人定过的产品方向，违背即挡路。逐条：

| 方向（节点） | 本附录 | 结论 |
| --- | --- | --- |
| 设计放行后主 Agent 自己推进，不用 `/drive`（`d-auto-drive`） | M3 止于放行，不加任何 `/drive` 一类的命令；放行写入的样子写明给 M7（§9 第 7 条） | 一致 |
| 模型由主 Agent 选（`d-main-agent-models`） | 不加任何按档位固定的映射；黄字与回复不再叫人挑子 agent 的模型（N1） | 一致；派发时选模型在 M7 |
| git 交给主 Agent（`d-main-agent-shell`） | git 不当写文件；只在存不了快照、快照会出本机、会删快照不存的被忽略文件时拒绝；`worktree remove` 的例行清理照常放行；主干前进的核对留给 M7（§2.5） | 一致 |
| 一个项目一个主 Agent（`d-one-main-agent`） | 持有者记录、`/wish here`、`mainAgentOf`（§2.4）；面板拍板的回写随 `/graph-apply` 删去，第 7 步取消 | 一致；巡检提醒在 M5、M7 |
| 问人改成聊天，不出卡、不给选项（`d-chat-not-cards`） | §3 全部；主 Agent 不带 `ask_user_question` | 一致 |
| 推荐放最后（`d-recommend-last`） | 主 Agent 与人之间不再有选项组，这一条在 M3 里没有对象；agent 自己定的题照旧推荐放最后（引擎 `44e8601`） | `d-chat-not-cards` 第一点把它列为要改写，按后一个决定 |
| 规则只由人定（`d-rules-human-only`） | M3 不写规则节点、不写规则板；M3 的门是代码里的规则，按 `question-36` B 只读列进规则板的代码规则目录（§3.11） | 一致 |
| 问人的话说人话（`d-plain-questions`） | 换词表与人给的例题只定义一次，进身份节与工具说明；harness 的字串过 `plainWordsIn`（§2.8） | 一致；写法检查在 plain-ui |
| 主 Agent 不写文件（`question-26` C） | §2.1、第 4 步 | 一致 |
| 人设只给主 Agent（`m3-main-persona`） | §2.7 | 一致 |
| 不怕失败，怕没有预案（`d-failure-plans`） | git 快照（预防不可逆损失）；原话核对（发现编造）；§5 每行写了能否恢复、调用方收到什么、记在哪 | 一致 |
| 项目图给人看、少给人用（`d-ui-look-not-operate`） | 提议式待决在面板上只显示、不给按钮，回话在对话里；M3 不为面板拍板留任何写路（第 7 步取消，0.4 §3.5.2 的回写不实现，第 4 轮 N1） | 一致；面板改版在 plain-ui |
| 系统看得到的数由 harness 写（`metrics`） | 同意、补充、否掉由 harness 写成固定说法（`ANSWER_MARKS`）；八类指标事件由 harness 在工具与规则里写，出口等指标流水的接口（§3.12） | 一致；指标流水本身不在 M3 |
| ZCode 基线 3.17.1（`d-zcode-3171`） | 人设一节按 3.17.1 重核：开头句用 3.17.1 的 `pBa`，标题后单换行照 `n8o`；节留在系统提示词（验收第 1 条），位置与不加每回合提醒是不跟 3.17.1 的地方，写进逐字档案、请编排方同意（§2.7） | 一致；不跟的三处待编排方同意 |
| 项目所有规则都在明面上（`d-rules-visible`） | M3 的八条拦截导出成 `MAIN_AGENT_RULES`，规则板的代码规则目录列出（§3.11）；M3 没有循环板上的条目 | 一致 |
| 插件带来的默认条目只能看（`d-defaults-readonly`） | 八条在规则页上标「dsh-hourness 带来的 · 只能看」，没有开关；M3 没有可改的默认条目 | 一致 |
| 高峰照旧提醒模型，人选三档，默认少做（`d-peak-mode`） | 例题的内容取这个决定里派出去的活怎么排，推荐一行是默认的少做；M3 不碰高峰提醒与档位（归 M6 与规则板） | 一致 |
| 主 Agent 不受高峰模式影响，任何一档都随时回话（`d-main-agent-peak-exempt`） | 0.4 的例题教主 Agent 高峰里自己少做、不做，与它相反；0.5 例题只说派出去的活，不做一行写明主 Agent 照常回话（§2.8）。M3 的其余部分没有任何一处按高峰档位限制主 Agent 的回话或工具 | 0.4 不一致，0.5 一致（第 4 轮 M1） |
| 两层循环：大循环定框架、模块清单与方向清单，每个模块先设计、人看一页放行稿再开发；用户的项目同样按此走（`d-design-onepage`，2026-10-30T05:19Z 扩到产品） | 本节是本项目对 M3 附录的自查；产品里的放行一侧是 §3.14：大循环一次放行、每个模块一次放行，各有四行加一页放行稿，方向清单必写，退回模块的设计循环与退回大循环 | 一致；模块设计对照方向清单的评审归 M7，M3 不核对做没做，M7 设计 0.5 还没有这一项，在它加上之前只有主 Agent 的自查和一页稿里的「替你定了的方向」（§10，第 5 轮 R5-N4）。0.4 不满足（一个目标一次放行），0.5 满足（第 4 轮 M2） |
| 主 Agent 要写的每种东西各配一道示范，过与真实输入同样的检查，用与练习题不相干的领域，只讲已经定了的事（`d-agent-examples`） | 问人一道（§2.8）：题材是高峰模式里派出去的活怎么排，L2 把它交给 `proposalLineRefusal`、`plainWordsIn` 与第二阶段常量下的真实引擎；确认需求与一页放行稿的示范归对齐轮（§10） | 问人一道一致；另两道推迟，已在 §10 留痕 |
| 每块板的条目同一个形状，脚本经 M3 的同意路径、人看过原文再同意（`d-boards-as-hooks`） | `attach` 分派表两行都交回 `detail`，两块板的脚本提议与检查提议都过「给人看过原文」，`AttachDetail` 上限 1–6000 与 1–8 片每片 4000（§3.13、§3.5 第 5a 步） | 一致 |
| 项目里的东西进项目、用户级只留那几样（`d-rules-in-repo`、`d-memory-scope`）；运行时文件进项目的 `.llm/`，不进 git 目录（编排方对 M7 第 4 轮 N1 的裁定，`design-context.md`「Dogfood implementation order and runtime paths」） | 快照流水是 M3 的运行时文件，0.5 起放在 `<项目根>/.llm/snapshots.jsonl`，临时暂存区放系统临时目录（§2.5 第 6 步，第 5 轮 R5-M1）。主 Agent 持有者记录仍在用户级数据目录（§2.4）：这一件另有人定的请求，图上 `m3` 的批注明说留给 `d-alignment-rounds` 的 M3 对齐轮（循环板 0.6 §17 M3 第 10 条、规则板 0.10 §10.7 M3 第 3 条），推迟到对齐轮（§10），原因是主 Agent 在自举关键路径上、这件事不挡第 4 轮的四条，也不挡本版 | 快照流水一致；持有者记录部分满足，已在 §10 留痕，不依赖它的实现 |
| 必须全审的改动（`norm-review-floor`） | 第 3、4、5、6、8、9、10 步独立评审，各写理由；`worktree remove` 的例行清理不被拒，删前存快照（§0、§2.5） | 一致 |
| 接缝裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」） | `attach` 与交回（§3.13）；背景上限归面板设计（§2.9）；`/wish` 归 M3（§2.6）。其余各条（高峰提醒的措辞、脚本门的判定事件、少做的并行数、高峰结束叫醒、高峰里等待不计空转）不涉及 M3 | 一致 |

四处要人看一眼的方向性选择，写进一页放行稿：一是确认需求与放行方案改由主 Agent 带人的原话记下、harness 核对原话（§3.5、§3.6），并且别的会话与子 agent 推不动阶段、试了会告诉人（§3.8）；二是 M3 合入到 M7 合入之间，主 Agent 移动主干不受核对（§9 第 7 条）；三是 git 快照不存被忽略的文件（`.env`、`node_modules/` 一类），删工作树时它们不恢复，`git clean -x` 要人自己在终端里跑（§2.5）；四是用户的项目里分了模块的目标放行两层：框架、模块清单和方向清单放行一次，每个模块再各放行一次，每次人看一页放行稿并在对话里同意，主 Agent 能自己把一个模块退回设计、把目标退回大循环要人的原话（§3.14）。

## 13. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-29 | 第一稿：吸收 `question-26` C、`m3-1` 验收第 4 条、`question-31` C、`m3-main-persona`、`d-option-card`、强一档模型的提醒、`d-interview-cards` |
| 0.2 | 2026-10-30 | 回应第 1 轮评审（MEDIUM 4、NIT 12）；吸收 `question-39` B、`d-plain-questions`、`d-zcode-3171` 与 `d-option-card` 正在重新商量；依据 main `9c71ed0` |
| 0.3 | 2026-10-30 | 回应第 2 轮评审（HIGH 1、MEDIUM 2、NIT 9，§14），三条挡路按编排方的裁定改；吸收 `d-one-main-agent`（§2.4）、`d-main-agent-shell` 定稿（§2.5）、`d-chat-not-cards`（§3，问人改成聊天，去掉全部卡片）、`d-main-agent-models`、`d-auto-drive`、`d-design-onepage`（§12）；「访谈选择题」一步取消；依据改为 main `4d2edb7`（`6134c83` 的行命名与探针脚本，实施前快进两个工作树）。取代上一次运行停在 §3 的草稿（`design-addendum-0.3-draft.md`） |
| 0.4 | 2026-10-30 | 回应第 3 轮评审（MEDIUM 8、NIT 12，§15），人同意多改一轮（「行，改吧」）。M3 的八条拦截导出成表、列进规则板的代码规则目录（§3.11）；第 3、10 步加独立评审；git 快照存挡路的未跟踪文件、文件列表只读 `-z` 输出、被忽略的文件不进快照、快照不出本机、什么都不用存时跳过（§2.5）；阶段前进对所有会话只经确认与放行，子 agent 不能转述人的话，绕过的尝试告警，会话里不用图的命令行写图（§3.8）；人设一节按 3.17.1 重核（§2.7）；例题换成 `d-peak-mode`（§2.8）；背景上限只读面板设计的常量（§2.9）；接缝裁定的 `attach`（§3.13）；会话投影 `hournessTalk` 取代已弃用的 `snapshotEvents()`（§3.2）；指标事件（§3.12）。依据改为 main `fe0bace`（`zcode-3171-follow` 与 prompt-fixes 已在 main）。0.3 原文在 `design-addendum-0.3.md` |
| 0.5 | 2026-10-30 | 回应第 4 轮评审（MEDIUM 2、NIT 2，§16）；M3 在自举关键路径上，不等对齐轮。例题换成「高峰时段派出去的活怎么排」，不再教主 Agent 在高峰里自己少做，并写明题材为什么安全（§2.8，M1）；新增 §3.14 两层循环里的放行：大循环放行框架、模块清单与方向清单，每个模块再放行一次（`module`、`page` 参数，模块的放行门禁，阶段的写权限与两条退回，子 agent 的只读按模块判），§3.2–§3.6、§3.8、§3.10、§3.12 与第 5、6、8、9 步随之改（M2）；第 7 步与 `/graph-apply` 的回写取消，编号保留（N1）；第 6 步 L2 加面板设计 0.7 §11 第 6c 条要的契约测试（N2）。同批接住循环板设计 0.6 与规则板设计 0.10 对 `attach` 分派与同意路径的请求（`rules:` 也交回 `detail`、上限放大、两块板的脚本与检查提议都核对原文，§3.13）与只把已有待决再给人看一次的 `propose_to_human`（§3.4）；持有者记录搬进 `.llm/`、M4 的其余请求、确认与放行的示范留给对齐轮，已在 §10 留痕。兄弟设计按面板 0.7、规则板 0.10、循环板 0.6、M7 0.5 读（第 5 轮 R5-N3 改，初稿写的是 M7 0.4）。0.4 原文在 `design-addendum-0.4.md`。第 5 轮评审（HIGH 0、MEDIUM 2、NIT 4，`reviews/addendum-r5.md`）之后的修订并入同一版，版本号不变：快照流水移到项目的 `.llm/snapshots.jsonl`、临时暂存区移到系统临时目录（R5-M1，§2.5）；大循环放行的写入次序改为先写候选的 `design`、再批准、最后写目标的 `release`，消除重放走不到的中间状态（R5-M2，§3.14.2）；设计期只读的目标一级焦点残余与身份节措辞（R5-N1）；第 7 步的三处残留引用（R5-N2）；M7 0.5 与 `isReleased` 的差别（R5-N3）；模块设计评审在 M7 0.5 里没有人接（R5-N4）。逐条见 §17 |

## 14. 对第 2 轮评审的回应

| 发现 | 处理 | 改在哪 |
| --- | --- | --- |
| H1 每个会话都能开主 Agent | 照编排方的裁定（`d-one-main-agent`）改：项目就是图目录；持有者记录；`isMainAgent` 另看记录；`/wish` 指路、`/wish here` 移动、原会话由 harness 执行 `/wish off`；fork 出的会话创建时对齐；回写只发给持有者；身份节第一句改为「the main agent of this project」；L2 七例、L3 新场景 `glm-design-one-main`。与评审改法的两处不同：记录放在用户级数据目录而不是项目目录（项目目录是桌面版各工作区共用的一个配置值，理由见 §2.4）；记录读不到时 `/wish` 覆盖它，而不是只报 degraded | §2.4；第 3、7 步；§5、§6、§7、§11 |
| M1 主 Agent 的 git 能丢掉没提交的改动 | 照编排方的裁定改，与评审的改法相反：`d-main-agent-shell` 定稿之后 git 不当写文件拦（人的原话「可以任意操作git」）；会丢工作或改写历史的命令先存快照（`git stash create` 等，引用在 `refs/hourness/snapshots/<id>`，改写历史时另打标签），记进流水，告诉主 Agent 怎么恢复，再放行；只在存不了快照时拒绝。不可逆损失由此有预防。身份节一句改为「The shell and git are yours; before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot」。主干前进的核对在 M7 | §2.5；第 4 步；§5、§7、§10、§11 |
| M2 `background` 的形状与存法不一致 | 照裁定改：字段与上限照 plain-ui（`PLAIN_LIMITS.background`，一行，150），M3 不另设数值；写进 `background` 字段、不写正文；引擎没认这个字段时由第 6 步按 plain-ui §4.2 建。0.2 的 600 码点、多行作废。四行另有「恰好一处加粗」的规则，是四行格式的，不改字段形状 | §2.9、§3.3；第 6 步 |
| N1 「子 agent 用便宜的就行」 | 删去后半句；`docs/ORCHESTRATION.md` §3.5 补子 agent 的模型由主 Agent 派活时选（M7）；`tests/wish-entry.spec.ts` 的黄字断言同改 | §2.6；第 3、11 步 |
| N2 结论行的解析被挪两次 | 不再适用：M3 不再建 `card-rules.ts`，不碰结论行的解析，`verdict.ts` 由 plain-ui 定 | §3.9 |
| N3 两份换词表 | 照改：`PLAIN_WORDS` 补齐「附录」与 `gate`、`projection`、`addendum`；plain-ui 的 `jargon` 从它读，谁先合入谁建 | §2.8、§9 第 5 条 |
| N4 选项检查的必填参数 | 不再适用：没有 `ask_human` 与 `card-rules.ts` | §3.9 |
| N5 `choice` 的「下一步」把描述当问句 | 照改，且随 `d-chat-not-cards` 写成点名 `propose_to_human (kind question)` 的一句；L2 一例 | §2.3；第 5 步 |
| N6 做法 B 会让两条断言失败 | 不再适用：接缝的 A/B/C 对照取消，没有 `askLine`；断言改为直接查身份节与提醒不含卡片工具与推荐后缀 | §2.2、§2.3 |
| N7 §8 第 1、2 条写「编排者正在写图」 | 照改：已改（`question-39` B）；新字句另列 | §9 第 1、3 条 |
| N8 第 3 步 L3 的 wish-idle 场景 | 照改：第 3 步只核对身份节与工具面，第 6 步起加两个设计工具 | 第 3、6 步 |
| N9 `d-auto-drive` 的触发点 | 照改：放行写入的样子写给 M7；`release` 阶段提醒那一句标明由 M7 改写 | §9 第 7 条、§2.3 |

评审之后到达的事：

- `d-chat-not-cards`（人定，17:01Z；17:08Z 五点方案「没问题」；17:16Z、17:23Z、17:27Z 的格式细则）：新 §3。去掉 `decision_card`、确认卡、五键卡、`ask_human`、`cards.ts`、`human-writes.ts`、`card-rules.ts`；加 `propose_to_human`、`record_human_answer`、提议式待决、原话核对与 `main-agent-graph`；访谈改为对话；模拟人改为回话；标定的通过条件与指标随之改。人给的四行例题成为 `d-plain-questions` 要的那道例题。
- `d-main-agent-models`、`d-auto-drive`、`d-design-onepage`：§2.6、§9 第 7 条、§12。
- 依据从 `e5ac3ed` 改为 `4d2edb7`：上一次运行的草稿写「工作树基点到 main 之间只有 `docs/graph/` 的改动」，`6134c83`（m8-row-titles）合入之后不再成立；行登记、探针脚本与客户端入口按它改，实施前快进两个工作树（§4 开头）。

## 15. 对第 3 轮评审的回应

第 3 轮：`reviews/addendum-r3.md`、`reviews/addendum-r3.json`（HIGH 0、MEDIUM 8、NIT 12）。挡路的 8 条全部改；NIT 12 条全部改，没有转入待办。和评审改法不同的地方在各行写明。

| 发现 | 处理 | 改在哪 |
| --- | --- | --- |
| M1 M3 的门不在规则板上（`d-rules-visible`） | 改，照评审：新文件 `src/guard/main-agent-rules.ts` 导出 `MAIN_AGENT_RULES {id, title, enforcement, subjects, step}`；`main-agent-graph` 拆成三个 id；规则板的代码规则目录以 `design:<id>` 映射，先合入的一方建；契约测试钉住违规流水的每个 `rule` 都在表里、表里每个 id 都被触发过；§12「规则只由人定」一行重写，加 `d-rules-visible`、`d-defaults-readonly`、`d-peak-mode`、`norm-review-floor` 四行。和评审不同：表是八条不是七条，多了 M5 的第四条 `main-agent-graph-cli`；`git-snapshot` 的标题用规则页的词「存档」；放在一个只有常量的文件里，规则板导入它不会带上 guard 的代码 | §3.11；第 4、5、6、8 步；§7、§9 第 12 条、§12 |
| M2 第 3、10 步没有独立评审（`norm-review-floor`） | 改，照评审：第 3、10 步「独立评审：是」并各写理由；§0 名单改为第 3、4、5、6、8、9、10 步，并逐步写出按 `norm-review-floor` 哪一条；第 7 步、人设一步、第 11 步为什么不在名单里也写了；§12 加 `norm-review-floor` 一行 | §0 末段；第 3、4、5、6、8、9、10 步；`m3-main-persona` 一步；§12 |
| M3 快照漏存挡路的未跟踪文件；`clean` 列表读给人看的输出 | 改，照评审：(a) 定义「写出类」（`reset --hard/--merge/--keep`、`checkout -f` 或切换、`switch -f/--discard-changes`、`restore --source`、`read-tree -u`），挡路的文件取目标树与未跟踪、未被忽略文件的交集进 `T`，目标解析不出时取全部未跟踪、未被忽略的文件；(b) `clean` 的列表按参数用 `git ls-files -z --others --exclude-standard --directory` 算，所有 git 调用设 `LC_ALL=C`、`LANGUAGE=C`，`clean -n` 只做核对（`core.quotePath=false`，有一行对不上就拒绝），`add` 经 `--pathspec-from-file` 与 `--literal-pathspecs` 传路径。L2 加挡路文件四例、中文文件名与 `zh_CN` 环境、带空格与 `*` 的文件名、核对对不上一例。和评审不同：挡路的文件里有被忽略的时拒绝（快照不存被忽略的文件，见 M4），不是存下它们 | §2.5 识别与第 2 步；第 4 步 L2；§5、§6、§7 |
| M4 被忽略的文件进快照：例行清理被拒，秘密可被推出去 | 改，照评审选定的一种：被忽略的文件不进快照；`clean -x`、`-X`（另加 `-ff`）拒绝；`worktree remove` 只存已跟踪的改动与未跟踪、未被忽略的文件，被忽略的只把路径、个数与字节数写进流水与 notice，上限只对要存的文件，所以装过依赖的工作树照常清理；标签只打在只含旧引用值的 `K_h` 上，`K` 只挂 `refs/hourness/snapshots/<id>`；`push --mirror`、`push --tags`（有快照标签时）、源是快照引用或快照对象的 refspec、`remote.<远端>.mirror` 与配置的 push refspec 都拒绝，规则 id `git-snapshot`，正路照评审。§10 记「被删工作树里被忽略的文件不恢复」，§11、§12 记这条选择，一页放行稿列为要人看一眼的第三处 | §2.5；第 4 步 L2；§5、§7、§10、§11、§12 |
| M5 子 agent 与普通会话能带编的原话推进到放行 | 改，照评审并补了三处：第二条对所有会话生效；子会话的图工具调用带 `relay` 一律拒绝；普通会话的 `relay` 照今天。补的三处：(1) 放行之前 `graph_approve` 放行集合里的节点、带 `relay` 在设计中的目标下新提节点（直接已批准）、带 `relay` 提一个 `stage` 在访谈之后的目标，同样拒绝，否则「批准放行集合」这条路还在；(2) 新第四条 `main-agent-graph-cli`：会话里用图的命令行写图拒绝（命令行以 `llm` 身份写、请求里能带 `relay`，`src/graph/cli.ts`:58–96）；(3) 告警：子会话与普通会话的尝试进违规流水、设计行行健康降级 24 小时、通知主 Agent 告诉人、记指标事件。第二条判不了时改为拒绝（0.3 是放行）。§7 两行写明适用范围；`m3-6` 第 2 条的新字句写进 §9 第 1 条 | §3.8；第 6、8 步；§5、§6、§7、§9 第 1 条、§10 |
| M6 人设一节按 3.16.3 设计 | 改，照评审：§2.7 写明 3.17.1 的事实（组装里没有 Output Style 一节；`n8o` 的正文是主回合的上下文条目 `output_style_instructions`；`r8o` 的每回合提醒；开头句 `pBa`）与取舍：节留在系统提示词（验收第 1 条），位置在 `glm:context-management` 之前，标题与正文之间一个换行，开头句用常量（已是 `pBa`）；不跟的三处（放法、不加每回合提醒、范围说明一句）写进 `docs/reference/zcode-verbatim.md` 新的一节，编排方同意之前人设一步不合入。和评审不同：评审写开头句「随 `zcode-3171-follow` 改常量」，这件已在 main（`46e1884`），不用再改 | §2.7；`m3-main-persona` 一步；§9 第 10 条、§10、§11、§12 |
| M7 例题的推荐与 `d-peak-mode` 相反 | 改，照评审：例题保留人给的格式，内容换成评审给的 `d-peak-mode` 版本（实测题目 16、背景 21、其余 13–14 个码点，加粗 2–4 个码点，合 §3.3 与 `PLAIN_LIMITS`）；§2.8、§3.1 写明「格式是人给的，内容取已定的 `d-peak-mode`」；身份节第二部分与 `PLAIN_QUESTION_GUIDE` 的实测长度随之更新；§11 记一条，§12 加 `d-peak-mode` 一行 | §2.2、§2.8、§3.1；§11、§12 |
| M8 背景上限写死 150 | 改，照评审：§2.9 去掉字面数，改为照面板设计当时的 §5.2 建 `PLAIN_LIMITS`（现行 0.6：title 40、why 80、background 60，去掉 `**` 再数）；§3.3、§6、§11 的「150」改为 `PLAIN_LIMITS.background`；L2 的超长用例从常量构造。面板设计在评审之后又到了 0.6，§5.2 与 0.5 相同 | §2.9、§3.3、§6、§11；第 6 步 L2 |
| N1 `snapshotEvents()` 已弃用；每次调用扫整份日志 | 改，照评审：会话投影 `hournessTalk`（人的消息与交给人的提议），`stateOf` 读；退路是 `snapshotEvents`（存在时）并报 degraded。另加：投影在子会话里不记东西、不继承 fork 前的事件，并为循环板的「给人看过原文」记下每次提议之后主 Agent 发出的文字 | §3.2、§3.4、§3.5、§3.6、§3.8；第 6 步；§5、§6、§8 |
| N2 子串能改原意 | 改，照评审：每段原话的起止落在消息边、空白或 Unicode 标点上；L2 加「不可以」摘「可以」被拒、「可以，放行」摘「可以」通过 | §3.6；第 6 步 L2 |
| N3 依据过期 | 改：依据改为写本版时的 main `fe0bace`，开工时以当时的 main 为准并核对行号；第 4 步删去 `APPLICATION_PROTOCOL` 那句；`installDialect`（:200–202）、逐字门禁（:244）、`rules.ts` 的 git 注释（:122–128）的行号已改；`zcode-3171-follow` 已合入，人设一步不再与那个运行串行 | 文件头；§2.7；开工之前；第 4 步；`m3-main-persona` 一步 |
| N4 面板设计给 M3 的五处落点 | 改：`ANSWER_MARKS` 进 `src/shared/answer-marks.ts`；`PROPOSE_TO_HUMAN`、`RECORD_HUMAN_ANSWER` 进 `src/shared/tool-names.ts`；`main-agent-holder.ts` 另导出 `holderFileOf` 与 `holderHome`；`WishCard` 完整卡片底部放 `FirstVisitLine`；§9 第 5 条改为确认这几处。和评审不同：`isPersonMessage` 不抽到 `src/shared/person-message.ts`：面板设计 0.6 §4.9 已不需要它、把这个文件删去并交 M3 定，所以留在 `talk.ts`（§11 M3 第 4 条与它自己的 §4.9 不一致，按 §4.9） | §2.4、§2.6、§3.2、§3.5；第 6、11 步；§9 第 5 条 |
| N5 DSH 委派的描述不完整 | 改，照评审：§2.6 与 §9 第 7 条各补一句（请求能覆盖父 agent 的模型；`modelSelectionSettings` 打开时按调用选，限于允许清单），M7 设计派发选模型时先评估它 | §2.6、§9 第 7 条 |
| N6 指标流水的事件交接 | 改，照评审：§3.12 列八类事件（评审的六类加 `design.rule-denied`、`design.bypass-refused`），出口 `src/design/metrics.ts` 的 `emitMetric`，接口到位之前不做事；标定在那之前从流水与日志算 | §3.12；第 6 步；第 12 步（a）；§5、§9 第 14 条 |
| N7 对齐里执行命令的两处细节 | 改，照评审：`commands.execute` 返回 `undefined` 当失败；`agent/created` 里不直接执行，登记到 `agent.whenIdle()` 之后；L3 `glm-design-one-main` 加 fork 一步（探针做不到时移到 L4 第 9 项） | §2.4；第 3 步 L2、L3；§5 |
| N8 快照的噪声 | 改，照评审：`S` 为空、没有 `W`、要存的文件为空时整件跳过（`worktree remove` 仍记一行流水）；标签只在旧值会变得只靠 reflog 可达、或改写已推送的提交时打 | §2.5 第 2、4、5 步；第 4 步 L2 |
| N9 已有主 Agent 时人写的那句话要重打 | 改，照评审：`/wish here <一句话>` 移过来并从许愿开始；指路的回复与 `input.hint` 写明这种用法 | §2.4；第 3 步 L2 |
| N10 `TALK_GUIDE` 一句会被读成每件事都走工具 | 改，照评审：「Put every matter that needs their answer to them with propose_to_human」 | §2.2 |
| N11 `ask_user_question` 按字面名去掉 | 改，照评审：`HIDDEN_FROM_MAIN_AGENT` 同样经 `toNativeTool` 比较；L2 加一个别名的例子 | §2.1；第 3 步 L2 |
| N12 `/goal` 附件的固定文字被当成人的话 | 改，取评审的第一种：判据排除正文只有 `GOAL_ATTACHMENT_TEXT` 的消息；L2 一例 | §3.6；第 6 步 L2 |

评审之后读到、本版一并处理的事：

- 接缝裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」）：`propose_to_human` 的可选 `attach` 与 `record_human_answer` 的交回按规则板设计 0.8 §10.7、循环板设计 0.3 §17 的请求落地（§3.13），含循环板的原文段落（`detail`）与「给人看过原文」的核对（§3.4、§3.5 第 5a 步）；循环板第 7 条建议（持有者会话已归档时提醒人）本版不做（§10）。背景字段与上限归面板设计、`/wish` 归 M3，与本版一致。其余各条裁定（高峰提醒的措辞归 M6、脚本门的判定事件由规则板写、少做的并行数由规则板给、高峰结束由循环板叫醒、高峰里等待不计 M7 的空转）都不涉及 M3 的代码。
- 人在 `.agents/tasks/design-context.md` 最新几节的决定（`d-peak-mode` 与时钟事实、`d-chat-not-cards` 的格式、主 Agent 方向四条、两层循环）：`d-peak-mode` 进了例题；时钟与高峰由 harness 算、M3 不算；其余 0.3 已按图上的定稿做，本版不变。
- M7 设计 0.3 要 `git-snapshot.ts` 的 `gitInvocations` 与 `takeSnapshot`、`gitRisk` 给 worker 用（图上 `m3` 19:14Z 的批注）：§2.5 写明这个函数，由 M7 加 `export`（§9 第 7 条）。

## 16. 对第 4 轮评审的回应

第 4 轮：`reviews/addendum-r4.md`、`reviews/addendum-r4.json`（HIGH 0、MEDIUM 2、NIT 2；第 3 轮的 20 条全部关闭，挡路 8 → 2）。四条全部改，没有转入待办。

| 发现 | 处理 | 改在哪 |
| --- | --- | --- |
| M1 MEDIUM（挡路）例题教主 Agent 在高峰里自己少做，与 `d-main-agent-peak-exempt` 相反 | 改，照评审的方向并有三处不同。保留人给的格式（题目一段，背景、推荐、疑问、不做各一段，标签不加粗，每行一处加粗），保留长度上限与要过的检查。例题改成「高峰时段派出去的活怎么排」：推荐「默认少做：少派几个，不派重活」，疑问「要是赶工期，你可以改成无影响」，不做「派活全排队，高峰后再开；主 Agent 照常回你话」。和评审给的写法不同：(a) 不做一行写「派活全排队，高峰后再开」而不是「派活全停」，因为不做档是排队、高峰结束后接着做（`d-peak-mode`），「全停」会读成永久不做；(b) 说明里加「例子只示范版式，里面的事已经定了」一句，防止主 Agent 把它当成要去问人的事，说明由 573 变 648 字符，第二部分 1,346、整节 2,465（第 5 轮 R5-N1 把身份节第一句改长 20 字符之后整节是 2,485，§2.2），仍在 1,000、1,400、2,700 之内；(c) 照 `d-agent-examples` 在 §2.8 写明题材为什么安全（已经定了、不在记账小工具的领域、不描述主 Agent 自己的行为、过与真实输入同样的检查、跟着决定走），L2 钉住「题目不含主 Agent、不做一行含主 Agent 照常回你话」，防止改回去；标定里数照抄例题的次数。评审要求的 §1 第 17 行与 §12 的 `d-peak-mode` 一行加 `d-main-agent-peak-exempt`，已加（§1 第 17 行，§12 新加一行） | §2.2、§2.8；§0 第 4、17、21 条；§1 第 17、21 行；第 3 步；第 12 步（a）；§11、§12 |
| M2 MEDIUM（挡路）放行仍是一个目标一次，没有接「每个模块一次放行」 | 改，取评审的方案 A，并按面板设计 0.7 §11「两层循环」的契约：模块是目标下的 `feature`，方向清单是固定 id `norm-directions` 的节点，大循环放行（`release`，不带 `module`）一次批准框架、模块清单与方向清单，每个模块再放行一次（`release` 带 `module` 与一页放行稿 `page`），放行集合按模块算，`design-before-release` 按模块判，目标退回大循环要人的原话、模块退回设计不要。和评审方案 A 不同的一处：目标在大循环放行时就进 `release`，不是「最后一个模块放行时才到」，理由在 §3.14.9。同批接住循环板设计 0.6 与规则板设计 0.10 对 M3 的请求（§3.13、§3.4）。评审要求的 L2 与标定各加一个两模块的例子：第 9 步 L2、L3 `glm-design-modules`、标定任务 `interview-expense-log-modules` | §3.14（新）；§2.3、§3.2–§3.6、§3.8、§3.10、§3.12、§3.13；第 5、6、8、9、12 步；§5–§12 |
| N1 NIT 第 7 步与 `/graph-apply` 与面板设计起的删除相反 | 改，照评审：第 7 步取消（建 `tests/graph-panel-apply.spec.ts`、改 `panel-row.ts` 都不做）；§3.9「留下」、§2.4「其他读法」第一条、§3.3 的 `panel-row.ts` 一项去掉；§9 第 1 条给 `m3-5` 第 2 条的字句改为建议删去这一条。和评审不同：步号不顺延，第 7 步留一节说明原因，因为面板设计、规则板设计、循环板设计与图上的批注都按步号引用 M3；另外 §3.5 第 4 条、§7 末段与第 8 步 L2 里残留的「人在面板上拍板」字样也一并改了 | 第 7 步；§0、§1 第 23 行；§2.4、§3.3、§3.5、§3.9、§7、§9 第 1、5 条、§12 |
| N2 NIT 第 6 步 L2 缺面板设计 0.7 §11 第 6c 条的契约测试 | 改，照评审：第 6 步 L2 加一例，`propose_to_human` 组出的提议式待决（例题的五个字段，以及带 `attach` 与 `detail` 的一张）交给真实引擎提一次，在 `PLAIN_LIMITS.background` 与写法检查第二阶段的常量下通过，注明它满足面板设计 0.7 §11 第 6c 条；`plain.ts` 还没合入时的做法写明（不写替身，留显式跳过项，面板设计合入时补上） | 第 6 步 L2 |

评审之后读到、本版一并处理的事：

- 图上 `m3` 2026-10-30T08:12Z 的两条与 10:13Z 的一条（循环板设计 0.6 §17 M3 第 9 条与第 10 条、规则板设计 0.10 §10.7 M3 一节、M4 同请的不带题目与四行的 `propose_to_human`）：`attach` 分派与同意路径的部分本版做（§3.13、§3.4、第 6 步）；持有者记录搬进项目 `.llm/` 与 M4 的其余请求按 `d-alignment-rounds` 留给对齐轮，已在 §10 留痕。
- 面板设计 0.7 §11 第 6 条的 `shownProposalOf`（§3.2、第 6 步）。
- `d-agent-examples`：问人一道的要求（过真实输入的检查、题材不撞练习题）在 M1 里满足；确认与放行的示范推迟（§10）。

## 17. 对第 5 轮评审的回应

第 5 轮：`reviews/addendum-r5.md`、`reviews/addendum-r5.json`（评 0.5 的第一稿：HIGH 0、MEDIUM 2、NIT 4，CHANGES_REQUESTED；第 4 轮的 M1、N1、N2 关闭，M2 回应成立）。六条全部改，没有转入待办，没有驳回的 NIT。修订并入同一版 0.5，版本号不变，不另建备份（0.4 备份仍是 `design-addendum-0.4.md`）。

| 发现 | 处理 | 改在哪 |
| --- | --- | --- |
| R5-M1 MEDIUM（挡路）快照流水与临时暂存区放在 git 目录，与编排方对 M3 运行时文件路径的裁定相反 | 改，照评审：流水放 `<项目根>/.llm/snapshots.jsonl`，项目根用 `projectOf`（规则板设计 0.10 §7.3、M5 设计 §5.5 的同一个函数）取会话的工作目录，不取被快照的仓库的 toplevel，主检出与各工作树共用一份；临时暂存区放 `fs.mkdtempSync(os.tmpdir())` 建的目录、`write-tree` 之后删。引用 `refs/hourness/snapshots/*` 与标签是 git 引用，不动。持有者记录搬家是另一件，仍留给对齐轮。和评审不同或补充的三处：(a) 找不到项目根时评审写退到 `<toplevel>/.llm/`；这里退到 `projectOf(<被快照的仓库的 toplevel>)`，主检出上两者相同，在工作树里则是主检出的根，避免把流水写进马上要被 `worktree remove` 删掉的工作树；流水行的 `rootFrom: 'repo'` 说明原因；两个都找不到 `.git` 时按写流水失败处理（放行、行健康降级），不在任意目录里建 `.llm/`（指标流水设计 §3.3 第 3 条同一立场）；(b) 新加 `.llm/.gitignore`（`wx`，内容 `*\n`，指标流水同一做法）：流水在工作树里，不自己排除，`git clean -fd` 会当未跟踪文件删掉它，而 `clean` 正是本节保护的命令；(c) 流水行加 `repo`（`git-common-dir`），因为共用一份之后主 Agent 用 `-C` 对别的仓库做的快照也进来，要能区分 | §2.5（intro 的 `tempIndex()`、第 2 步的 `W` 与存文件、第 6 步、不做一段）；第 4 步 L2 与依赖；§0 末段；§9 第 19 条；§10；§11 git 一条；§12 `d-rules-in-repo` 一行；文件头 |
| R5-M2 MEDIUM（挡路）大循环放行中途停下后重放走不到：所有候选已批准而都没写 `stage` 时 `isSplit` 为假，落进单层放行，一次批准所有模块子树 | 改，取评审的改法 A：写入次序改为 (1) 重查门禁 (2) 给每个 `stage` 不是 `design` 的候选 `edit` 设 `design`（候选仍是提议，`format.ts`:378 允许，带 `relay`） (3) 按修订号批准放行集合 (4) 写目标的 `release`。这样「已批准而没有 `stage` 的模块」不会出现，三种中间状态的 `isSplit` 都为真，重放走大循环门禁。补充的三处：(a) 第 2 步写的是「不是 `design` 就写 `design`」而不是「没有 `stage` 才写」，所以主 Agent 提议候选时自己写的 `release` 等值被覆盖，没有模块出生就是放行的；(b) 第 2 步的 `edit` 改了候选的修订号，第 3 步用这次 `edit` 返回的新 `rev` 批准它（中间只有 harness 自己的这一次写入，人看到的那一版没变）；第 2 步用提议时记下的 `rev`，所以提议之后被别人改过的候选在第 2 步就进 `skipped`、不被批准（0.4 §3.4.2 的「人批准的是他看到的那一版」）；(c) 评审只要一个停下点的用例，这里写了四个（第 2 步中途、批准之前、批准中途、写目标之前）。评审不推荐的改法 B（扩 `isSplit` 与门禁第 2 条去数没有 `stage` 的已批准特性）不采用：0.4 流程放行过的特性正是这个形状，要另加判据才分得开 | §3.14.1（候选、模块、`isSplit`）；§3.14.2（门禁第 2 条、同意之后的四步）；§3.14.7 表；§3.14.9 第一行；§3.5 表；§5 表；第 9 步（变化与 L2） |
| R5-N1 NIT 设计期只读在焦点是目标一级时仍放行，身份节只写目标放行 | 改，照评审：§3.14.6 与 §10 的残余写进目标一级焦点的情形与挡法（任务出生为提议；M7 合入后 `releaseOf` 取代，M7 设计 0.5 §2.4、§3.2.2）；身份节第一部分改为 `until what you work on (the goal, or its module) is released`，实测 1,137（上限 1,500），整节 2,485（上限 2,700）；第 5 步的正路一句同改；两处阶段提醒各加一句 `Before you dispatch a subagent that writes, graph_focus to the module or the task it belongs to.`，第 5 步 L2 钉住；§3.11 标题改为「放行之前（目标或模块），主 Agent 派出去的 agent 只读」（33 个码点，上限 40） | §2.2；§2.3；§3.11；§3.14.6；§10；第 5 步 |
| R5-N2 NIT 取消第 7 步后三处仍列着它 | 改，照评审 | §0 第 9 条；§1 第 9 行；§8 一行 |
| R5-N3 NIT 文件头写 M7 设计 0.4，`isReleased` 与 M7 的复述不同 | 改，照评审：文件头读 M7 0.5；`isReleased` 注释写明完成也算已放行，并指出 M7 设计 0.5 §2.4 一处写「对完成的模块为假」、另加一支补回，结果相同，两边对一遍时以本附录为准；§13 同改 | 文件头；§3.14.1；§13 |
| R5-N4 NIT 模块设计对照方向清单的独立评审没有设计接手 | 改，照评审：§10、§9 第 7 条、§12 写明 M7 设计 0.5 没有这一项（对 M7 0.5 全文搜过「方向清单」「评审」：只有 `d-design-onepage` 一行复述「对照方向清单」，没有派发或记录条目），在它加上之前只有主 Agent 的自查和一页稿的「替你定了的方向」；图操作草稿的 `m7` 批注请编排方记成待办 | §10；§9 第 7 条；§12 |

实现时核对的两点（不是设计缺口）：一，`projectOf` 在 M5 设计 §5.5 与规则板设计 0.10 §7.3 里返回 `{root, git}`，指标流水设计里写作 `{root, kind}`；M3 只读 `root` 与「有没有找到 `.git`」，谁先实现谁建，形状不同时 M3 加一行适配。二，快照流水与 M7 子 agent 的快照（M7 设计 0.5 §3.2.4）将来是否共用 `.llm/snapshots.jsonl`，等 M7 加 `export` 时定（§9 第 7 条），目前只有主 Agent 的会话写它。
