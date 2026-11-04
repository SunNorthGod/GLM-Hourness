# M7 设计：执行、汇合与运维

版本：0.6（2026-10-30），第六稿。0.5 经第 5 轮独立评审（同目录 `design-review.md` 末一轮「0.5 第 5 轮」与 `design-review-gate.json`：APPROVED，没有一条发现挡住开工，MEDIUM 4 条 R5-F1–R5-F4、NIT 7 条 R5-N1–R5-N7；四条 MEDIUM 各挡后面的某一步：R5-F1 挡 E1b 与 E8，R5-F2、R5-F3 挡 E4，R5-F4 在 E4 合入之前决定）。人说「尽快自举吧」，所以本稿只照评审给的改法改文字，不开新的设计问题；评审没有要求再出一稿评审。本稿改的：（1）R5-F1：§6.6 拆回两条，补回两模块、三档、成批、示范、指标出口的 L2 用例清单（a）至（h），接回 0.4 的「其余」一条；§9.1 补 `glm-exec-modules` 与 `glm-exec-peak` 两行；（2）R5-F2：§3.1.5 检查第 5 条改成对有效深浅断言，示范里不加审查派发；（3）R5-F3：模块读法读不出时拒绝：`releaseOf` 多第三种结果 `{ok: false, level: 'module', reason: 'unreadable'}`，派发与 `worker-scope` 在目标下有带 `stage` 的特性时返回它，`briefGate` 写 `not_released` 并带固定的 `hint`，没有带 `stage` 的特性的目标照没分模块处理；§2.4、§3.2.1、§3.5.1、§3.9.7 失败表第 1 行、§6.1 同改，L2 加一例；（4）R5-F4：编排方已定改法 A，产品里做每个模块的设计评审：由 M7 作为 `kind: review`、写入范围为空、`source` 指向这个模块的设计决策的任务派发，模块没放行时这个任务照样派得出去，结论的记录形状交给 M3，让 M3 的 `moduleReleaseGate` 加一项（§3.7.5、§3.5.1、§18.2、§7 的 M3 一行）；本仓库自举不受影响，本仓库的模块设计评审由 Kiro 工作流做；（5）NIT 三件：R5-N1 两处（示范的 `why`、§1.2 m7-2 第 5 条）、R5-N2（§1.2 m7 行写「五条」）、R5-N7（依据行与 U26 的版本）。R5-N3 由编排方在设计之外做完（`onepage.md` 按 0.6 重写，`graph-ops-v04-pending.json` 的 m7-2、m7-3、m7 三份验收字句重写，§14）；R5-N4、N5、N6 各留到它点名的那一步或那一次核对，写在 §18.2。每件答哪一条见 §19。0.5 全文留在同目录的 `design-0.5.md`。以下是 0.5 的版本说明，原样保留：版本：0.5（2026-10-30），第五稿。0.4 经第 4 轮独立评审（同目录 `design-review.md` 末一轮「0.4 第 4 轮」与 `design-review.json`：CHANGES_REQUESTED，挡路 10 条 R4-F1–R4-F10，不挡路 10 条 R4-N1–R4-N10）。第 3 轮的 13 条在 0.4 里全部关闭；新的 10 条都来自 0.4 落笔之后的人定案与邻居设计的定稿。人说「尽快自举吧」，所以本稿不等对齐轮，只改评审排期里会挡住开工或 E4 的几条，其余写明何时改（§18.2），一条不丢。本稿改的八件，每件答哪一条见 §18.1：（1）R4-F1：删去对规则板已删去的 `heldForPeak` 的全部读，M7 对规则板只读 `src/shared/peak-mode.ts` 的档位、少做上限 `glmWorkerCap` 与 `peakHoldFor`，没有任何一处指望主 Agent 因高峰被暂停（`d-main-agent-peak-exempt`）；（2）R4-F2：两层循环设计进 M7（§3.5.1、§2.4、§3.5.3、§3.9.1、§3.9.7）：模块带阶段，`derivedStage` 收模块，派发门禁与放行事件按模块判，pins 带放行时刻所以退回设计会让在跑的活过期，三档（主 Agent 自己定且下一批告知；退回该模块的设计循环；退回大循环、受影响的活停下）各有机制，成批至多三件照旧；（3）R4-F8：「怎样算做完」不再要求每个数都写进指标流水（§1.2、§1.3、§3.16）；（4）R4-F9：实现顺序照编排方的裁定按步写（§7、§8.3）；（5）R4-F3：`dispatch_task` 的说明里带一道派活示范，L2 钉住（§3.1.5）；（6）R4-F6：规则板最小一片进了开始条件与验证计划（§9.1、§9.2、§10.1、§10.3）；（7）R4-F7：八道代码里的门各写首日模式与转生效的办法（§12.1）；（8）R4-N1、R4-N2：运行时文件搬进项目的 `.llm/`（§2.1），harness 条目的 `tell` 加 `wake`（§3.11.1）。0.4 全文留在同目录的 `design-0.4.md`。以下是 0.4 的版本说明，原样保留（其中读 `heldForPeak` 与运行时文件在 `<git>/hourness/` 的句子在 0.5 作废）：版本：0.4（2026-10-30），第四稿。0.3 经第 1 轮独立评审（同目录 `design-review.md`、`design-review.json` 第 1 轮：CHANGES_REQUESTED，挡路 3 条 F1–F3，不挡路 10 条 N1–N10），本稿逐条处理，处理表在 §17。挡路的三处：F1 主干前进不再豁免「已在上游的提交」，拉来的提交同样要先由 harness 检查，远端跟踪引用当主干看、被脚本推上去的主干在命令之后被发现（§3.8.4）；F2 必须全审清单判不了时从严，清单里有一条 harness 认不出，每件写任务就都按全审（§3.7.1、§3.8.5）；F3 与循环板设计 0.3 的接口对齐：默认条目与事件经 `glmHournessLoops.contribute` 与 `emit` 交，harness 动作由循环板经 `glmHournessExecute.runAction` 调，M7 另设看门：动作该跑而没跑时自己跑并报出（§2.5）。另按编排方的接缝裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」）加两处高峰逻辑：派活时读规则板给的少做上限；高峰里只剩被挡着的活时，不计空转、以 `hourness-peak-wait` 停住推进，交 harness 动作 `execute.resume-drive`（§3.1.2、§3.9.5）。0.3 全文留在同目录的 `design-0.3.md`。以下是 0.3 的版本说明，原样保留：0.3（2026-10-30），第三稿。0.2 经两轮独立评审批准（第 2 轮 APPROVED，挡路 0、不挡路 11），人读了它的人话版清单之后改了四处方向（`d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-one-main-agent`），随后又定了问人改成聊天（`d-chat-not-cards`）、两层循环与一页放行稿（`d-design-onepage`）、两块板上的默认条目只能看（`d-defaults-readonly`）、项目里的规矩都在两块板上看得到（`d-rules-visible`）、审查深浅由主 Agent 定而底线由人批（`question-38` C 与 `norm-review-floor`）、统一的指标流水（`metrics`）。本稿按这些改写；方向清单的逐条对照在 §1.1，评审按它挡路。0.2 全文留在同目录的 `design-0.2.md`（`.agents/` 不进 git）。0.2 第 2 轮评审的 11 条不挡路意见在本稿的处理见 §16。
依据（0.6）：main `e752cab` 或更晚（0.5 写在 `ee726c3`，之后多出的只有图提交与 M3 附录 0.5，对 M7 没有影响，R5-N7）。第 5 轮评审 `design-review.md`「0.5 第 5 轮」与 `design-review-gate.json` 的四条 MEDIUM 与对应改法；M3 附录 `.agents/tasks/m3/design-addendum.md` 0.5 的 §3.14.1（读法的签名）、§3.14.3（`moduleReleaseGate` 的七项）、§3.14.7（`initialStatus` 的一处收窄：模块没放行时它下面的任务出生为 `proposed`）、§3.14 末句（模块设计评审归 M7 的派发）；`.agents/tasks/design-context.md` 全文；规则板设计 0.10。
依据（0.5，原样保留）：main `ee726c3`。第 4 轮评审的盘上稿与图（`m7` 节点 10:56Z、10:57Z 的批注）；`.agents/tasks/design-context.md` 全文，尤其末五节：「Main agent and peak; stale entries; hook seam」（`d-main-agent-peak-exempt`、`d-script-timeout`）、「Two-level loop in the product」、「Worked examples for the agent」（`d-agent-examples`）、「Check entries seam」、「Dogfood implementation order and runtime paths」（编排方对 R4-F9 与 R4-N1 的裁定，本稿照写不再裁）；图上比文档新的节点 `d-rules-peak-slice`、`d-dogfood-scope`、`d-rules-in-repo`、`d-main-agent-peak-exempt`、`d-design-onepage`、`d-agent-examples`、`d-script-timeout`；邻居设计只读 M7 碰到的节：规则板 `.agents/tasks/rules/design.md` 0.10（§3.6、§7.2 的 `PeakModeService`、§10.1、§10.7 M7 一节、§16.1 最小一片），循环板 `.agents/tasks/schedules/design.md` 0.6（§2.3 条目的 `tell` 是 `{text, wake}`、§3.1、§17 M7 一节），M3 附录 `.agents/tasks/m3/design-addendum.md` 盘上的 0.5（§3.14 两层循环里的放行，M3 0.5 同时在改，本稿写 M7 要读的东西，定稿后必须逐条对一遍，§7 M3 一行），plain-ui `.agents/tasks/plain-ui/design.md` 0.7（§4.11、§11「两层循环」第 6–9 条），M4 `.agents/tasks/m4/design.md` 0.4（`RuleMode`、`installRuleGate`、`PROMOTION`），metrics `.agents/tasks/metrics/design.md` 0.2（半成稿）；`docs/CHARTER.md` 0.7 §3.2 第 3 条与 §6，`docs/ORCHESTRATION.md` §6.5。图引擎实读：`src/graph/schema.ts` 的 `STAGES` 与 `TASK_KINDS`，`src/graph/projection.ts` 的 `deciderOf` 与 `waitsForHuman`，`src/graph/stage.ts` 的 `effectiveStage`；`src/` 里仍没有 `execute/`、`design/`、`rules/`、`loops/`。
依据（0.4，原样保留；其中 M3 附录、规则板、循环板等的版本号以 0.5 的依据为准）：main `d32468c`。split 第 0–8 步已在 main（`0d9c337`..`de14525`），两个插件 `dsh-glm-zcode`、`dsh-hourness` 的布局以它为准，行按包的子路径命名（`6134c83`：`{id: glm-hourness/<行>, name: dsh-hourness/<行>}`）；表格版卡片字段已在引擎（`e22282f`），本稿不再生成卡片。M3 第 1、2 步在 main（`7aa8fe5`、`bf4d127`），其余按 `.agents/tasks/m3/design-addendum.md` 0.3 实施中（`src/design/`、`src/guard/git-snapshot.ts`、`src/graph/plain-question.ts` 今天都还不在 main）。同时在写或已写的设计（0.4 按这些版本对齐）：循环板 `.agents/tasks/schedules/design.md` 0.3（§2.1–§2.3 条目的形状，§3.1 服务 `glmHournessLoops` 的 `contribute`、`emit`、`Contribution.run`，§3.5 没有循环板时，§4.2 M7 的事件与去重键，§5.1 M7 的十项，§6.5 harness 动作的结局口径，§6.9 第 4 条高峰结束，§17 对 M7 的七条请求）；规则板 `.agents/tasks/rules/design.md` 0.8（§3.6 高峰模式，§7.2 `PeakModeService` 的 `stateFor` 与 `peakHoldFor`，§10.1 代码规则目录，§10.7 对 M7 的五条请求）；M5 `.agents/tasks/m5/design.md` 0.3、接管项目 `.agents/tasks/bootstrap/design.md` 0.2、plain-ui `.agents/tasks/plain-ui/design.md` 0.4。指标流水（`metrics`）的设计还没有成稿，本稿只写 M7 交给它的东西与没有它时的退路（§3.16）。`.agents/tasks/design-context.md` 读到最后一节「Seam rulings between designs」（含 2026-10-30 对规则板 0.7 评审 F59 的裁定）。0.4 另读了本仓库 main `fe0bace` 的 `src/shared/route.ts`（`isGlmModel`，第 31 行）。
范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/`、`~/.dsh`，不用桌面版。要记到图上的事写成同目录的 JSON 草稿（§14）。
证据写法：运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准（`docs/DEVELOPMENT.md` §4）。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，包名省略 `dsh-` 前缀；§4 的契约表另写出文件与符号。〔实读〕读过源码；〔实测〕已有 L3 探针证据；〔推断〕由源码推出、没有运行；〔未核实〕列进 §15。ZCode 基线是 3.17.1（`reference/zcode-3.17.1/zcode.cjs`，`d-zcode-3171`）；本稿只引它的一处事实（GLM 模型 id，§10.3）。
干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。给人看的验收与问题按 `d-plain-questions` 的换词表写（验收说成「怎样算做完」，标定说成「练习题」，门禁说成「合入前的检查」）。

## 0. 摘要

M7 在编排层包 `dsh-hourness` 里加两行，都默认禁用：`glm-hourness/execute`（`src/execute/`：派活、写入范围、计划审批、通信、交回、审查、合入前的检查与主干前进的核对、自动推进与「目标做完了」的检查）与 `glm-hourness/operate`（`src/operate/`：晨报、周报与夜间巡检的内容）。报告的纯函数在 `src/report/`。另改 M3 的几处文字与一条规则（§7 的 M3 一行）。

0.6 与 0.5 不同的地方（评审第 5 轮，只改文字，§19）：

- 补回被截去的两处（R5-F1）：§6.6 的两模块、三档、成批、示范、指标出口的 L2 用例清单；§9.1 的 `glm-exec-modules` 与 `glm-exec-peak` 两行。
- 示范的检查第 5 条对有效深浅断言（R5-F2），示范里不加审查派发。
- 模块读法读不出时拒绝派发和写入，不再放行（R5-F3，失效安全默认）；没有带 `stage` 的特性的目标照常。
- 产品里做每个模块的设计评审（R5-F4，改法 A）：`kind: review`、写入范围为空、`source` 指向模块设计决策的任务，模块没放行时也派得出去；结论在模块上留一条固定格式的记录，M3 的模块放行检查数这一项（§3.7.5）。
- 引用与措辞（R5-N1、N2、N7）。

0.5 与 0.4 不同的地方（评审第 4 轮与人在 0.4 落笔之后的定案，§18）：

- 主 Agent 不受高峰影响（R4-F1，`d-main-agent-peak-exempt`）：高峰模式三档都不暂停主 Agent，规则板 0.10 因此删去了 `RulesService.heldForPeak`。M7 对规则板只读 `src/shared/peak-mode.ts` 的三样：档位、少做上限 `glmWorkerCap`、`peakHoldFor`；§2.1、§2.5、§3.9.1、§4、§6.6、§7、E1b、E8 里读已删去成员、认「不做档暂停」的文字全部删掉，自动推进的判断表里 goal 为 `paused` 一律是人暂停或取消了目标轮。
- 两层循环进了 M7（R4-F2，`d-design-onepage` 扩到产品）：分了模块的目标，每个模块带阶段，人放行一个模块之后才派这个模块的活（§3.5.1 的 `not_released` 取最近的模块祖先）；`derivedStage` 收模块，另有 `releaseOf` 判某个任务此刻放没放行（§2.4）；放行事件带 `module`，目标只建一次 goal，之后的模块放行只批注并叫主 Agent 分解这一个模块（§2.5、§3.9.1）；pins 多一个放行时刻，所以模块或目标被退回设计再放行，在跑的活都过期（§3.5.3）；开发中的问题分三档，各有机制（§3.9.7）：第一档主 Agent 自己定、下一批告知；第二档退回该模块的设计循环；第三档退回大循环、受影响的活停下（不再派、在跑的写不了、交回不进审查与合入）；成批至多三件照旧；派发门禁只数决定者为人的待决。
- 「怎样算做完」说得到做得到（R4-F8，§1.2、§1.3、§3.16）：链路上的数都由 harness 自己记，作为事件交给指标流水的出口；指标流水不在自举路径上，写进真正的指标流水等它做好之后再核，用注入的出口验每类事件各出现一次。
- 实现顺序（R4-F9，编排方已裁定，§7、§8.3）：骨架不整个等 M3；依赖按步写；凡写「等整块规则板 R4」的都改为「等规则板最小一片」，整块规则板排在 E9 之后；共享的登记文件后合入的一方机械并入；`src/data/lock.ts` 由 E3 建。
- 派活简报的示范（R4-F3，`d-agent-examples`，§3.1.5）：`dispatch_task` 的说明里带一道完整的例子，领域取静态博客的订阅输出，不在练习题的领域里；L2 让它过真实的 `briefGate`、`checkModelChoice` 与参数校验，规则一改它就失败。
- 规则板最小一片进了开始条件与验证（R4-F6，`d-rules-peak-slice`，§9.1、§9.2、§10.1、§10.3）：E4 与 E8 的两处读对着 `src/shared/peak-mode.ts` 写，不再「没合入就不写」；片子晚于 E4 时由 E4 之后的第一个提交补上；开始条件多一条。
- 八道代码里的门写了首日模式（R4-F7，`docs/CHARTER.md` 0.7，§12.1）：全部首日 `enforce`，是对「写在代码里的新门禁先影子」的例外，agent 定、人可推翻，理由与推翻后的办法（先影子，按 M4 的 `PROMOTION` 转生效）逐道写在表里，放行稿「替你定了的方向」里让人看到。
- 运行时文件进项目的 `.llm/`（R4-N1，`d-rules-in-repo`，§2.1）；harness 条目的 `tell` 是 `{text, wake}`，表里补 `wake`（R4-N2，§3.11.1）。
- 评审里其余的发现不在本稿改，一条不丢，何时改见 §18.2：R4-F4（`trunkAdvanceFor`）在 E7 合入之前；R4-F5（周报晨报加规则板与循环板的几节、每周至多三件的排序）在 P2 开工之前；R4-F10（M4 0.4 的几条）中的 `PROMOTION` 一条在 P2 之前，申报接缝一条已在 2026-11-04 接上（§3.2.1），「草稿区为空」随 E7 的 `trunkCheck`，其余在实现中；R4-N3 到 R4-N10 各有时间。

0.4 与 0.3 不同的地方（评审第 1 轮与接缝裁定，§17）：

- 主干前进没有例外（F1）：0.3 放行「已在上游主干上的提交」，这条删去。从远端拉来的提交（别人推的、人在另一台电脑上推的）与本机做的一样，要先由 harness `check_commit` 过，主干才能前进到它（它们改了必须全审清单里的文件时，这台机器上没人派过审查，不要求在这里全审，晨报的「例外」列出）；主干上的 `git pull` 改为先 `git fetch`、再检查、再快进。远端跟踪引用 `refs/remotes/<上游>/<主干>` 当主干看：改写它的命令（`update-ref`、从本地路径 `fetch` 进它）在执行前拒绝；它被脚本里的推送挪到没检查的提交时，在那条命令之后被发现、记违规（§3.8.4）。巡检列出主干与上游主干上带尾注却没有检查记录覆盖的提交（§3.11.2）。
- 必须全审清单判不了就从严（F2）：清单里只要有一条 harness 认不出判定写法，每件写任务的有效深浅都是全审，派审查时低于全审被拒（`floor_unparsed`）；主干前进时，项目图目录以外改到的每个文件都要有一次通过的全审看过同样的内容。人给每条加上判定写法（§13 ①）之后才按条判。每条怎样从改动的路径与跑过的命令判，写在 §3.8.5（§3.7.1、§3.8.4、§3.8.5）。
- 与循环板设计 0.3 对齐（F3）：执行行与运维行在激活时经 `glmHournessLoops.contribute` 交出默认条目、事件声明与 harness 动作，循环板执行 harness 条目时调 `Contribution.run`，也就是 `glmHournessExecute.runAction`；事件经 `emit` 交，去重键说的是「这一次」。默认条目只有 M7 一处定义，循环行不另带；`hourness.design-released` 只由 M7 交。退路按「这一项有没有被循环板收下」判，不按服务在不在；另加看门：交出的事件该引起的 harness 动作在时限内没被调用，M7 自己执行并在行健康里报出（§2.5）。
- 高峰（接缝裁定）：派模型为 GLM 的子 agent 之前读一次规则板给的少做上限（`stateFor` 的 `glmWorkerCap`）；一个没进展的目标轮开始时读一次 `peakHoldFor`，有值时这一轮不计空转，连着两轮就以 `hourness-peak-wait` 停住推进、不叫主 Agent 问人，交 harness 动作 `execute.resume-drive`，高峰结束时循环板的「高峰结束」一项调它；M7 自己在高峰结束 5 分钟后再看一次，没接上就自己接上（§3.1.2、§3.9.5）。M7 不读档位与时钟。
- 不挡路的十条（§17）：`only` 的第二层含义写进 §13 ②；指标写失败时行健康降级；重启时被暂停的 goal 按心跳认成重启（未核实，L4 第一批核）；审查没过的活进了主干也先不记完成；门禁工作树有改动时先存快照；巡检里的主干检查改为后台跑；`/wish here` 之后在跑的 worker 的请求送给新的主 Agent；被拦下的命令也算进 `commands` 的判定；m7-4 写明目标整体的审查也由主 Agent 选模型；四处行号。

0.3 与 0.2 不同的地方：

- 自动推进（`d-auto-drive`）：没有 `/drive`。人在对话里同意放行设计，M3 把目标的阶段记为放行；主 Agent 的下一步里 harness 看到它，就替这个会话建一个 DSH goal 并开始自动推进，直到完成、或剩下的事都在等人。重启之后接着推进；人自己暂停或清掉的不替人恢复（§3.9.1）。
- 模型（`d-main-agent-models`）：没有档位映射。主 Agent 每次派活（干活的、审查的、目标整体的审查）都在 `dispatch_task` 里写用哪个模型和一句理由；harness 只核对这个模型在 provider 的目录里，记下选了什么（§3.1.3）。
- git（`d-main-agent-shell`）：合并哪件、先合哪个、冲突怎么解、要不要回退由主 Agent 用 git 做。harness 守一处：主干前进的那一刻，新的主干提交必须由 harness 自己在这个提交上跑过 `norm-merge-gate` 并全部通过，改到 `norm-review-floor` 里那几类的内容必须全审过；认得出的命令在执行前拦下，认不出的在执行后立刻发现、记违规、不给证据（§3.8）。证据（提交号、每条命令与退出码、日志）由 harness 写；模型自报的不算。会丢工作或改写历史的 git 命令先存快照：主 Agent 一侧由 M3 做，子 agent 一侧由 M7 用同一个函数做（§3.2.4）。
- 一个主 Agent（`d-one-main-agent`）：没有运维会话，没有 `/patrol`。晨报、周报、夜间巡检是循环板上的三条默认条目，到点由循环板提醒主 Agent，主 Agent 在同一个对话窗口里做和汇报（§3.11）。
- 审查深浅（`question-38` C）：主 Agent 派活时定全审、轻审或不审（不审要写理由），审查的模型也由它选；改动碰到 `norm-review-floor` 的任一类时 harness 一律按全审处理，主 Agent 绕不过去；周报数降档或不审的活后来返工了几次（§3.7.1、§3.12.3）。
- 问人（`d-chat-not-cards`）：harness 不再出给人的待决与选项卡。要人定的事（审查或检查一再不过、目标整体的审查不过、规矩该升该降、底线清单该加）harness 只把事实和一份四行草稿交给主 Agent，由它在对话里按背景、推荐、疑问、不做四行问人（M3 的 `propose_to_human`），一次至多三件（§3.7.4）。
- 明面上（`d-rules-visible`）：M7 里「碰到某件事或到点就去做」的联动是循环板上的十条默认条目（数据，只能看）；会拦住动作的门列在规则板的代码规则目录里（§2.5）。
- 指标（`metrics`）：M7 的每一个数（派活、模型、计划、提问、交回、审查、检查、主干前进、自动推进的启停、完成检查、报告）由 harness 作为事件写进指标流水；报告从它算（§3.16）。

不变的部分：后台派发（spawn 后端、`delivery: 'caller'`、预留 `childId`、`outputSchema` 交回）、写入范围的五条执行边界规则、计划由主 Agent 批而 harness 在边界核对（`d-plan-approval`）、主 Agent 与 worker 的三条通信路、简报与 pins 过期、补位提醒、经验接缝、审查挡路只认三类与收敛规则、目标的验收审查不建节点、完成门禁与放行凭据、练习题只做回归与对照守门、复盘留痕。

最薄端到端骨架（§10）：许愿 → 访谈（聊天）→ 人同意放行 → harness 开始自动推进 → 主 Agent 选模型派一件活 → 计划审批 → worker 写、提交、交回 → 主 Agent 选模型派审查 → 主 Agent 用 git 做出要合入的提交 → `check_commit` → 主 Agent 快进主干、harness 核对并记证据 → 主 Agent 派目标整体的审查 → 完成检查 → 目标完成。人只在许愿、回答访谈、同意需求与放行时出现，中途不发任何命令。

要人定的（§13）：两件，都是改人批过的清单：给 `norm-review-floor` 的四类各加一段机器认得的写法（加之前每件都全审）；给 `norm-merge-gate` 加一条「只改项目图的提交不用跑命令，只差项目图的两个提交共用一次检查」（加之前每次都跑全部命令）。两件都不挡开工。M7 十件活的「怎样算做完」由人按 `question-37` A 逐条看（§1.2；一页放行稿 `onepage.md` 里另有人话版）。0.5 另有一件不单独问：八道代码里的门首日直接生效，是对宪章 0.7「写在代码里的新门禁先影子」的例外（§12.1）；它写进一页放行稿「替你定了的方向」那一栏，人放行时看得到，不同意就按表里的办法改为先影子，所以一次问人仍是放行加这两件（至多三件）。

## 1. 需求与验收

### 1.1 必须遵守的定案（方向清单）

`d-design-onepage`：每个模块的设计对照人定过的方向，违背即挡路。下表是本稿用到的全部方向。

| 定案 | 人的原话或出处 | 本稿怎样遵守 | 在哪 |
| --- | --- | --- | --- |
| `d-auto-drive` | 「自动推进不应该是经过设计循环之后，就全部让主Agent自己推进了吗，怎么需要我/drive」 | 没有 `/drive` 与任何要人发的 M7 命令；放行被 harness 看到就建 goal 开始推进（没分模块的目标看目标的放行，分了模块的目标看第一个模块的放行，之后每个模块的放行只叫主 Agent 分解这个模块；循环板调 `execute.start-drive`，没调时 M7 的看门自己调，§2.5、§3.9.1）；推进中的停下（都在等人、空转、轮次上限）由人在对话里一句话接着走，或由人的回话自动解开；高峰里只剩被高峰模式挡着的活时停住、不问人，高峰结束后由 harness 接上 | §2.5、§3.9.1、§3.9.5 |
| `d-main-agent-models` | 「还有所有的模型选择交给主Agent吧，包括审计什么的」 | `dispatch_task` 的 `model` 与 `why` 必填，worker、审查、目标整体的审查都一样；harness 只核对目录与记录，没有默认模型、档位与「高一档」；主 Agent 自己的模型仍由人选，提醒在 M3 | §3.1.3、§3.7.1、§3.9.4 |
| `d-main-agent-shell` 与它的快照细则 | 「主Agent只是不能动文件，但是可以任意操作git，或者说git交由主Agent是最好的。」「按你上面推荐的来」 | 主 Agent 的 git 不受 M7 限制，只在主干前进时核对（§3.8.4）：新的主干提交必须就是 harness 检查通过的那个提交（或与它只差 `only` 路径），没有「已在上游」的例外；没有 `merge_task`，harness 不替它合并、推送或删分支；子 agent 的危险 git 命令先存快照（§3.2.4），主 Agent 的由 M3 | §3.2.4、§3.8 |
| `d-one-main-agent` | 「巡检应该由harness提醒主Agent发出。一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」 | 没有运维会话与 `/patrol`；所有提醒只发给 M3 持有者记录里的那一个会话；报告由主 Agent 在同一窗口里给人 | §2.3.1、§3.11 |
| `d-chat-not-cards` | 「我是要改产品的，而且聊天不仅是不给问答卡，是连选项都没有的那种……你提几点和方案，我补充或者同意这种。」 | harness 不写给人的待决、不出选项；要人定的事交给主 Agent 用四行在对话里问，人回话由 M3 的 `record_human_answer` 带原话记图 | §3.7.4、§3.12、§13 |
| 四行的写法（`d-chat-not-cards` 2026-10-30 的批注） | 「背景一行，推荐一行，疑问一行，不做一行」；「每一个背景推荐那些总结几个字加粗」 | harness 给主 Agent 的草稿按四行写，排版由 M3 的 `renderProposal` 做；本稿 §13 同样 | §3.7.4、§13 |
| `d-design-onepage` | 两层循环；每个模块的设计对照方向清单，人看一页放行稿再开发；问题攒着成批问，一次至多三题。05:19Z 的批注扩到产品：用户的项目同样按两层循环走，「一个模块没放行之前不派它的开发」；开发中的问题按三档处理（只影响本模块且可逆的主 Agent 定、下一批告知；改到模块设计方向的退回该模块的设计循环；改到框架的退回大循环、受影响的部分暂停），开发中的三档与成批归 M7，放行归 M3 | 本表；人放行之前不开工；harness 交给主 Agent 的问人事项不打断，攒进下一批，一次至多三件。0.5 起分了模块的目标按模块判：模块没放行，它下面的活一件也派不出去（`not_released`）；模块或目标被退回设计，其下在跑的活过期、新活派不出、交回不进主干；三档各有机制，写在 §3.9.7。每个模块的设计在放行前由另一个子 agent 对照方向清单独立审查（人在 `d-design-onepage` 里定的「每个模块的设计对照方向清单，违背即挡路」，0.6 起产品里做，R5-F4）：M7 派这个审查，结论留一条记录，M3 的模块放行检查数这一项，写在 §3.7.5 | §1.1、§3.5.1、§3.7.5、§3.9.7、§3.7.4 |
| `d-defaults-readonly` | 「默认的东西先暂时不能修改、开关，只能看」 | M7 带来的十条循环板默认条目与规则板上的代码规则都只读；没有配置项能关掉它们 | §2.5、§3.11.1 |
| `d-rules-visible` | 「没问题，项目所有规则确实应该都在明面上」 | 会拦住动作的门列在规则板，碰到事或到点就做的列在循环板；两张清单的内容仍在规范节点里 | §2.5 |
| `question-38` C 与 `norm-review-floor` | 「C」；「没问题，我暂时也想不到什么加审不审的」 | 审查深浅由主 Agent 派活时定并写理由；碰到底线清单任一类时 harness 按全审处理，并在主干前进时核对这些内容确实全审过；清单里有一条 harness 判不了时从严，每件写任务都按全审（「主 Agent 绕不过去」不因清单还没写判定写法而暂停）；周报数降档后的返工并提议加类 | §3.7.1、§3.8.4、§3.8.5、§3.12.3 |
| `norm-merge-gate` | 人批准（「B」） | 合入前的检查只认这份清单的命令，由 harness 在要进主干的那个提交上跑；改松清单要人同意 | §3.8.1–§3.8.3 |
| `metrics` | 「指标能全记就全记下，b直接做」 | 每个数由 harness 记，模型自报的不算；每个数发生时作为一条事件交给指标流水的出口，指标流水做好之前出口什么都不做，报告从图上的批注、检查与前进的记录算；指标流水做好后报告从它算；写不进流水时行健康降级并记下丢了几条，报告在那段时间注明数不全（0.5：指标流水不在自举路径上，验收不要求这些数已经写进它，R4-F8） | §3.16 |
| `d-plain-questions` | 不用人没学过的词 | §1.2、§13 与 harness 交给主 Agent的草稿都用人话；草稿过 M3 的 `plainWordsIn` | §1.2、§3.7.4 |
| `d-plan-approval` | 「先批计划，再开工要做也是让主Agent做吧」 | 计划由主 Agent 批，harness 在边界核对；人不出场 | §3.3 |
| `question-26` C | 「C 就删个写工具，把主Agent变成聊天模型就行了呗」 | 主 Agent 没有写文件的工具（M3）；git 不算写文件 | §2.3 |
| `d-rules-human-only` | 「先不允许自己加规则吧，只有人能动」 | M7 不写规则与规范；规矩的升降与底线清单的增删都经主 Agent 问人 | §3.12 |
| `question-28` C | 「你在没有副作用的情况下尽可能开更多的并行」 | 写任务的并行上限是 `slots`（默认 3），写入范围相交的排队；同文件的实施步骤串行（§8.3） | §3.5.1、§8.3 |
| `question-14` G3 | 「围栏到时候跟着编排层走吧，拦全部的」 | M7 的规则不看路由 | §3.2 |
| `question-17` B | 「分，彻底改成两个插件」 | M7 的代码全在 `dsh-hourness`；GLM 包只经公共库的工具名契约知道哪些 M7 工具常驻 | §2.3.2 |
| `d-peak-mode` | 「默认少做……减少并发数量，不做重活之类的」 | 高峰档位的设置与执行归规则板；M7 只加两处读（接缝裁定）：派模型为 GLM 的子 agent 之前读规则板给的少做上限 `glmWorkerCap`，满了按 `slots_full` 拒绝；没进展的目标轮开始时读 `peakHoldFor`，被高峰挡着的轮不计空转、停住推进而不问人。M7 不读档位与时钟。派活工具名进 `DISPATCH_TOOL_NAMES` 让规则板的门管得到；主 Agent 每步知道是不是高峰与档位，靠的是规则板的那一行提醒 | §3.1.2、§3.9.5 |
| `d-main-agent-peak-exempt` | 「主Agent应该不受高峰影响，随时回复的」 | 高峰模式三档都不管主 Agent：M7 没有任何一处因高峰暂停、排队或拦主 Agent，也不指望规则板这样做；M7 对规则板只读三样：档位、少做上限 `glmWorkerCap`、`peakHoldFor`（规则板 0.10 §7.2 的 `PeakModeService`），都是为了管子 agent 与停住等高峰结束的推进，不为主 Agent；自动推进的判断表里 goal 为 `paused` 一律是人暂停或取消了目标轮（R4-F1） | §3.1.2、§3.9.1、§3.9.5、§7 |
| `d-agent-examples` | 「彳亍」：主 Agent 要写的每种东西各配一道示范，放在写它的工具的说明里，过与真实输入同样的检查，领域不撞练习题，只讲已定的事；派活简报的示范归 M7 | `dispatch_task` 的说明带一道完整示范（静态博客的订阅输出）；`src/execute/examples.ts` 的常量过真实的 `briefGate`、`checkModelChoice` 与参数校验（R4-F3） | §3.1.5 |
| `d-rules-in-repo` 与存放范围 | 「一样进仓库和项目目录」；「差不多都是进.llm」 | M7 的运行时文件在项目的 `<proj>/.llm/execute/` 与 `<proj>/.llm/operate/`，不入库；M7 在仓库里没有自己的文件（R4-N1） | §2.1 |
| `d-dogfood-scope`、`d-rules-peak-slice` | 自举前只做 M3 与 M7 的最薄骨架；规则板先做最小的一片（档位与少做的并发上限），M7 骨架 E4 的少做上限读法照原设计生效，M7 不加临时的高峰逻辑 | 骨架就是 E0、E1a、E1b、E2–E9、H1（§10）；E4 与 E8 的两处读对着规则板最小一片的 `src/shared/peak-mode.ts` 写；开始条件多一条，那一片已合入、两处读在真实的服务类型上验过（R4-F6）；整块规则板排在 E9 之后 | §8.3、§9.2、§10.1、§10.3 |
| `d-script-timeout` | 拦路脚本超时先放行、接着跑完，晚到的「不行」马上告诉主 Agent；超时与晚到的拦截计进周报，反复超时的提议修；机制归循环板的执行器，拦路的含义归规则板 | M7 自己不跑脚本，机制不在 M7；M7 的份是周报里「反复超时的脚本」一节，0.5 不改，排在 P2 开工之前（R4-F5，§18.2） | §18.2 |
| `docs/CHARTER.md` 0.7（§3.2 第 3 条、§6） | 规则板与循环板上人看过原文同意的条目即刻生效；写在代码里的新门禁照旧先影子后拦截，新行默认禁用、验证通过后才启用 | `execute`、`operate` 两行默认禁用，E9 验证通过后才启用（满足「新行默认禁用」）；八道代码里的门首日模式与转生效的办法写在 §12.1：首日全部 `enforce` 是对「先影子」的例外，agent 定、人可推翻，放行稿让人看到（R4-F7） | §12.1 |
| 不替人在模型、套餐、渠道上做主（`hourness` 非目标，`docs/CHARTER.md` §6） | — | 子 agent 的模型由主 Agent 选是人的决定（`d-main-agent-models`）；harness 不改人给主 Agent 选的模型，不切换 provider 或套餐 | §3.1.3 |
| `d-failure-plans` | 「怕的不是失败，而是失败后的预案做的够不够」 | §6 按操作写发现、重试、恢复与留痕；绕过检查的主干前进在命令之后立刻发现；必须改的条数不降就停下交人 | §3.7.3、§3.8.4、§6 |
| `question-37` A | 「A」 | §1.2 的「怎样算做完」是草稿，人逐条看过、带原话改写节点之后才开工 | §1.2、§14 |
| 练习题的角色（2026-10-29） | 「我认为真正的标定应该是……在真实的项目开发中进行测试，或者等待社区的反馈。」 | 练习题只做回归与对照守门；有效性看自举与试用 | §3.14 |
| 经验板块（`lessons`） | 「还得允许子代理主动查经验板块的内容」 | 查询工具常驻；派活时带至多 5 条；交回带候选，按 M5 的三路处理 | §3.5.5 |

另有编排方的接缝裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」，agent 定、可推翻，不是人的方向，违背不按方向清单挡路，但本稿照做）：少做的并行上限的数归规则板、M7 在派活处读它（§3.1.2）；高峰里只剩被挡着的活时不计空转、M7 以自己的原因码停住推进并经 `glmHournessExecute.runAction` 交 `resume-drive`，高峰结束时循环板上编排层的「高峰结束」一项跑它并提醒主 Agent（§3.9.5）；高峰结束叫醒主 Agent 的条目归编排层的循环行，M7 不另带（§2.5）；`/wish` 归 M3，M7 只读 `mainAgentOf`（§3.4.3）。

### 1.2 各条目的行为与「怎样算做完」（草稿，人按 `question-37` A 逐条看）

下表第三列写给人看，按换词表用人话；节点上现有的验收是 0.2 的草稿，人看过、改过之后由编排者带人的原话改写（§14）。第四列写给实现者：每条挂在哪个检查上。

| 节点 | 内容 | 怎样算做完（人话） | 对应的检查与层 |
| --- | --- | --- | --- |
| m7-1 | 派活、只写自己那块、先批计划、主 Agent 与干活的子 agent 说话 | 1. 主 Agent 派一件已批准、写清了怎样算做完的活时，自己写用哪个模型和一句理由；harness 给这件活开一个单独的工作目录和分支，在后台起一个子 agent 去做，记下模型与理由，主 Agent 不用等它就能接着做别的。2. 干活的子 agent 只能写自己工作目录里、这件活划定的范围里、批过的计划写到的文件；写别处被拦下，拦下时告诉它该怎么做，并记一笔。要先交计划的活，计划批下来之前一个文件都写不了。3. 主 Agent 用普通办法叫出来的子 agent、干活的子 agent 再叫出来的子 agent，都只能读；干活的子 agent 不能改项目图（只能批注），不能推送，不能动别的分支；它做会丢掉没提交改动的 git 操作之前，harness 先存一份能恢复的快照。4. 不合格的计划（缺每一步怎样算做完、写到范围外、漏了某条要求）当场退回给子 agent，不打扰主 Agent；合格的写进这件活的说明，主 Agent 批了它才能动手，图上留一条批准记录。5. 子 agent 有问题可以问主 Agent，回答回到它手里；主 Agent 可以中途给它发话改方向或叫停；两个子 agent 之间不能直接说话 | 1：L3 `glm-exec-dispatch`；2、3：L2 `execute-guard.spec.ts`、L3 `glm-exec-dispatch`；4、5：L3 `glm-exec-plan`；L4 随批次 |
| m7-2 | 派活前的检查、空位提醒、经验 | 1. 这件活缺了怎样算做完、前面的活没做完、还有要你拍板而你还没回话的事（主 Agent 自己能定的不算）、这件活所在的模块还没放行（没分模块的项目看整个目标；审查这个模块设计的任务除外，它在模块放行之前就能派）、读不出模块的结构而项目分了模块（这时一件也派不出去，直到读得出来）、和正在做的另一件活要写同一批文件、同时在做的活已满、或 GLM 高峰选了少做而同时在跑的 GLM 子 agent 已到规则板给的上限（默认 1 个）时，派不出去，并告诉主 Agent 差什么。2. 交给子 agent 的说明由 harness 从项目图写出：为什么做、做到什么程度算完、不许碰什么。派出去之后，这件活或它上级的「怎样算做完」「不做什么」改了、或它依据的决定被推翻、或它所在的模块（或整个目标）被退回去重新做设计，这次做出来的东西不能进主干，要重新派；只改标题不算。3. 有空位又有能开工的活时，主 Agent 下一步收到一次提醒；情况不变不重复。4. 说明里留一节放相关的经验，至多 5 条；没有经验板块的服务时这一节不出现，照常派；有服务时，子 agent 交回的新经验交给它，像密钥的内容不写进项目图（经验板块本身是 M5 的，不在这一条里，用一个假的服务检查）。5. 派活工具的说明里带一道完整的例子（给静态博客加订阅输出），例子里除了编出来的模型名，拿去真的派一次也能通过全部检查，规则一改，例子跟着变红 | 1、2：L2 `execute-brief.spec.ts`、`execute-modules.spec.ts`、L3 `glm-exec-dispatch`；3：L3 `glm-exec-parallel`；4：L2 `execute-handback.spec.ts`；5：L2 `execute-examples.spec.ts` |
| m7-3 | 自动推进与「目标做完了」的检查 | 1. 人在对话里同意放行设计之后，不用再发任何命令，主 Agent 就自己推进：派活、审查、合入，直到目标做完或剩下的事都要问人。分了模块的项目里，每放行一个模块，主 Agent 就开始分解并派这个模块的活，还没放行的模块一件也不派；第一个模块放行时系统建好自动推进，之后的模块放行只提醒主 Agent 接着做这一个。电脑或 DeepSeek Harness 重启之后接着推进；人自己按了暂停或清掉的，不替人恢复。2. 主 Agent 说目标做完了时，harness 先核对：每件活都进了主干并有 harness 记的证据、没有等人回话的事、目标整体的审查过了；不满足就不让它收尾，并列出差什么；满足才在图上把目标记为完成，证据由 harness 写。3. 剩下的事都在等人时，主 Agent 在对话里把它们问给人（一次至多三件），自动推进停下；人回话、主 Agent 记下之后，自动推进自己接着走。4. 连着 3 轮什么都没变时自动推进停下，主 Agent 在对话里说明；人说继续就接着走（把这种停下记成复盘节点，是系统自动记的另一件事，在这之前由编排者手记，不算这一条）。5. GLM 高峰里选了少做时，主 Agent 手上只剩因此暂时派不出去的活，自动推进先停着，这几轮不算「什么都没变」，也不来问人；高峰结束后系统自己接上，叫主 Agent 接着做（选了不做时，要等完整的规则板把 GLM 的活排队才有可停的活，不在这一条里）。主 Agent 自己不受高峰影响，你随时能跟它说话。6. 重启之后，没交回的活在主 Agent 下一步的提醒里列出来，不会重复派。7. 开发中冒出来的问题按影响分三档：只影响这一个模块、而且能撤回的，主 Agent 自己定，记在图上，下一批问你的时候一并告诉你；改到这个模块的设计方向的，这个模块退回去重新做设计，你看一页新的放行稿、同意之后才继续开发，这个模块里在做的活作废重派，别的模块不受影响；改到整个框架的，整个目标退回去重新定框架，受影响的活先停下，等你同意新的框架。8. 要问你的事攒成一批，一次至多三件，没排进这一批的下一批再问 | 1：L3 `glm-exec-drive`、L4；2–6：L2 `execute-drive.spec.ts`、`execute-peak.spec.ts`、`execute-reconcile.spec.ts`，L3 `glm-exec-drive`；1、7、8：L2 `execute-modules.spec.ts`、`execute-tiers.spec.ts` |
| m7-4 | 审查 | 1. 主 Agent 派活时给这件活定审查深浅：全审、轻审或不审，轻审和不审要写理由；审查用哪个模型也由主 Agent 选并写理由；目标整体的审查也一样。2. 改动碰到「必须全审的改动」清单里任一类时，不管主 Agent 定了什么，都按全审做；清单里还有系统认不出的条目时，每件活都按全审做；全审要逐条对照这件活的「怎样算做完」看过。3. 审查只在三种情况下挡路：没做到要求的某一条；可能造成收不回的损失却没防住；出了错没法发现、没法恢复或事后查不清。其余意见不挡路。4. 第 1、2 轮没过就再修再审，第 2 轮没过加一轮；挡路的条数一轮没少、或第 3 轮还没过，就停下：这件活不再派，主 Agent 在对话里把它问给人，人回话之后才继续 | 1、2：L2 `execute-review.spec.ts`、`execute-floor.spec.ts`；3、4：L2，L3 `glm-exec-review` |
| m7-5 | 主 Agent 合入，harness 核对与记证据 | 1. 合并哪件、先合哪个、冲突怎么解、要不要回退，都由主 Agent 用 git 自己做，harness 不替它做。2. 主干前进的那一刻，harness 核对新的主干提交确实由 harness 跑过「合入前要跑的检查清单」并全部通过，「必须全审的改动」那几类的内容确实全审过；从别处拉来的提交（例如别人或人自己在另一台电脑上推上去的）也要先过这一遍检查，没有例外（它们改到必须全审的那几类时，这台电脑上没人审过，晨报里列给人看）；不满足就拦下。检查由 harness 自己跑、结果由 harness 记；主 Agent 或子 agent 自己报的结果不算。3. 主干前进之后，harness 把提交号和每条检查的结果记到对应的活上；要审查的活，审查也过了才记为完成。4. 用 harness 认不出的办法让主干前进了（例如写在脚本里），或把没检查过的提交推到了远端的主干上，harness 在那条命令之后马上发现：记一笔违规，告诉主 Agent，这次不给证据，直到补跑的检查通过（没过就修或退回）；夜间巡检再把主干上没有检查记录的提交列出来 | 2：L2 `execute-advance.spec.ts`（临时 git 仓库）、L3 `glm-exec-merge`；3、4：L2、L3；L4 |
| m7-6 | 晨报 | 1. 每天早上到点，主 Agent 在对话里给人一份晨报：目标、规划、理由、架构四段，加在等你回话的事、花了多少、检查与审查、出了什么例外、各用了哪些模型。2. 晨报里的每个数都由 harness 从指标流水、项目图与 git 算出，模型不写数；同样的输入得到一字不差的晨报。3. 晨报是循环板上的一条默认条目，人能看见，暂时不能改、不能停 | 1、2：L2 `report-four-answers.spec.ts`；3：L2 `operate-entries.spec.ts`；冷会话投递随 L4 |
| m7-7 | 夜间巡检 | 1. 每天夜里到点，主 Agent 做一次巡检：harness 先查工作目录、分支、主干与项目图的卫生，并对主干跑一遍完整的检查；能做的主 Agent 去做或派出去，要人定的攒进下一批问人。2. 漏跑的一次在下一次巡检时报出来。3. 巡检是循环板上的一条默认条目，只能看 | L2 `operate-patrol.spec.ts`（临时 git 仓库）、L3 `glm-operate-patrol`；冷会话投递随 L4 |
| m7-8 | 规矩的升降与周报 | 1. 每周到点，主 Agent 在对话里给人一份周报：人被问了几次、要读多少字、回话等了多久、因人的决定返工了几次，对照一次通过的比例、审查发现与返工率，以及交付的四个数。2. 周报数出降档审查或不审的活后来返工了几次、集中在哪类改动；哪类返工多，就提议把它加进「必须全审的改动」，人同意才改。3. 规矩该升该降按固定的数提议，连同上一条每周至多 3 件，由主 Agent 在对话里问人。4. 周报是循环板上的一条默认条目，只能看 | L2 `report-weekly.spec.ts`、`report-ladder.spec.ts` |
| m7-9 | 交付的四个数 | 每周合入几次、一件活从派出到进主干要多久、进主干后出问题的比例、主干变坏到修好要多久，按固定口径从 harness 记的证据与项目图算出，写进指标流水 | L2 `report-metrics.spec.ts` |
| m7-10 | 练习题只查有没有改坏 | 1. 练习题运行时，被测的模型读本次练习目录以外的文件被拦下并记一笔；有越界读取的那一次判作无效，不算进汇总。2. 每道题写明是回归题（应该一直做对的）还是能力题（现在还做不好的）、从哪来；结果记下当时的环境，环境本身出的错单列；汇总报一次做对的比例和连做 k 次都对的比例。3. 现有两题归回归题；文档写明练习题的作用是查改动有没有把系统改坏，不证明系统好用。4. 自举中记下的复盘可以收成新的练习题，有一条收题流程 | L2 `calibrate-fence.spec.ts`、L3 `calib-fence`；运行目录在仓库外与事后扫描属于 `ablation` |
| m7（特性） | 合起来 | 1. 最小的一条完整链路在 DeepSeek Harness 桌面版上，对一个临时项目，从人许愿、聊需求、同意放行，到主 Agent 自己派活、审查、合入、目标完成，人中途不用发任何命令。2. 之后本项目的开发改由它在 DSH 里做（自举），卡住、返工、要人救场的地方记成节点。3. 链路上的数（用了哪个模型、花费、用时、被拦几次、派了几件、审了几轮、合入几次、问了你几次）都是系统自己记的，不靠模型自己报：现在就记在图上的批注、检查与主干前进的记录、违规记录、已有的用量记录和对话记录里（晨报从这些记录算，那是 m7-6 的事，不在这一条里）；每个数发生时，系统另交一份给统一的指标记录。统一的指标记录还没做好，做好之前这一份不写；它做好以后，再核对这些数在里面都有，这一步不算这一次的「做完」。4. 分了模块的项目里，没放行的模块一件活也派不出去；模块放行后才开始它的开发；开发中遇到要改设计方向或框架的问题，会按三档退回，不会悄悄往下做。5. 每个模块的设计在放行前，由另一个子 agent 对照你定过的方向清单独立审查一遍；这个审查在模块还没放行时就能派，审查的结论在这个模块上留一条固定格式的记录（M3 的放行前检查数这一项，那一半归 M3） | §10.3 的五条；L4；3：L2 `execute-metrics.spec.ts`（注入一个记下每个事件的出口，每一类事件各出现一次）；4、5：L2 `execute-modules.spec.ts`、L3 `glm-exec-modules` |

### 1.3 非功能需求

- 少打扰人：M7 不新增必须问人的类别。要人定的事只有五种来源（审查或检查一再不过、目标整体的审查不过、规矩的升降、底线清单的增删，以及两层循环里第二档、第三档退回设计之后要人重新放行的那一页，§3.9.7），都经主 Agent 攒成批，一次至多三件（§3.7.4、§3.9.7、§3.12）。
- 主 Agent 的上下文小：交回只给摘要与证据位置，长报告写文件；harness 的提醒只在变化时注入；循环板条目的提醒每个事件一次。
- 失败要出声（`docs/CHARTER.md` §7.1 条款 7）：两行的降级都进行健康表；激活期不抛错（`AGENTS.md`）。交给循环板的事件该引起的 harness 动作没被执行、指标写不进流水，都在行健康里报出，不静默（§2.5、§3.16）。
- 处处留痕（条款 11）：每个改变状态的动作在它所属的地方有一条记录（§5）；每个数由 harness 记下并交给指标流水的出口（§3.16）；指标流水还没做好时，这些数仍在图、检查与前进的记录里，报告从那里算。
- 明面上：M7 的联动与门在两块板之一上看得到（§2.5）。

## 2. 总体设计

依据的学科与标准（`docs/DEVELOPMENT.md` §1.1、`docs/ORCHESTRATION.md` §4.3 架构栏），评审按这里去审：

- 门禁、重试与恢复依据可靠性工程与持续集成的主干开发：主干只前进到检查过的提交，主干保持绿（合入后与夜间的全量检查兜底），失败先求可发现、可重试、可追溯（`d-failure-plans`）。
- 版本控制的做法：检查绑定到提交（同一个提交、同一份清单），而不是绑定到「谁说跑过」；任务与提交的对应写在提交信息的尾注里（git trailer），由 git 自己保存。
- 写入范围、只读的派发链、worker 对图只读、worker 只碰自己的分支依据安全工程的最小权限：每个角色只拿完成本任务所需的写权限，在执行边界判定，不靠提示词。主 Agent 的 git 权限按人的决定放开，补救靠快照与主干前进的核对（预防加发现）。
- 指标依据可观测性的事件流水做法：一份只追加的事件流水，数由测量的一方写，报告是它的纯函数；DORA 四项用标准口径，人的负担只量系统里看得到的数；样本小，只看曲线，不设考核线（`docs/CHARTER.md` §8）。
- 问人依据认知负荷与人因：一次一个方案、四行、至多三件（`d-chat-not-cards` 的批注里人给的理由：比较几条选项「看起来好累」）。
- 与循环板的接缝依据事件驱动系统的做法：至少一次投递加幂等的处理者（每一次发生一个去重键，动作按图上的事实幂等，重放多少遍结果一样）；监督与超时（看门：交出去的事要在时限内被认领，否则由交出的一方自己做，并报出，同作业调度里的心跳与租约过期）。
- 判不了就从严依据安全工程的失效安全默认（fail-safe defaults，Saltzer 与 Schroeder）：保护机制判不出时取更严的一侧（这里是全审），而不是放行。

### 2.1 构件与位置

全部在编排层包 `dsh-hourness`（`packages/hourness/`）。`scripts/packages.mjs` 的 `hourness.src` 加 `execute`（E0）与 `operate`（P3），`rows` 加两行；`packages/hourness/cordis.patch.yml` 加 `{id: glm-hourness/execute, name: dsh-hourness/execute, disabled: true}` 与 `{id: glm-hourness/operate, name: dsh-hourness/operate, disabled: true}`，排在 `design`（M3）与 `rules`（规则板，若已合入）之后、`ui` 之前。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 执行行入口：主 Agent 的四个工具（`dispatch_task`、`answer_worker`、`check_commit`、`await_human`）、worker 的两个工具（`submit_plan`、`ask_main`）、检查的 provider `hourness-gate`、服务 `glmHournessExecute`、行健康 `execute` | `src/execute/index.ts` | 新建，行 `glm-hourness/execute` |
| 派发：读简报门禁、工作树、`startActivation`、登记表的写入 | `src/execute/dispatch.ts` | 新建 |
| 模型的选择：参数校验、读 provider 的模型目录、`agentOptions`、记录（§3.1.3） | `src/execute/models.ts` | 新建 |
| 任务映射：`childId` 的编解码、本进程的派发登记表 | `src/execute/attempts.ts` | 新建 |
| 工具面：按角色去掉不属于它的工具（含非主 Agent 的图写工具，§2.3.2） | `src/execute/faces.ts` | 新建 |
| 简报的渲染与门禁判定（纯函数） | `src/execute/brief.ts` | 新建 |
| 计划：`checkPlan`、正文里计划一节的渲染与摘要（纯函数） | `src/execute/plan.ts` | 新建 |
| 写入范围：路径规整、包含、相交（纯函数） | `src/execute/scope.ts` | 新建 |
| 等主 Agent 回应的 worker 请求：登记、超时、回应 | `src/execute/requests.ts` | 新建 |
| 交回结构与审查结论的 schema、语义校验 | `src/execute/schemas.ts` | 新建 |
| 交回处理：pins 核对、图上的记录、审查任务与有效深浅、候选经验 | `src/execute/handback.ts` | 新建 |
| 审查结论的规整与收敛判定（纯函数） | `src/execute/review.ts` | 新建 |
| 底线清单：解析 `norm-review-floor` 的判定写法、对改动与命令判命中（纯函数） | `src/execute/floor.ts` | 新建 |
| 要人定的事：交给主 Agent 的事实与四行草稿（纯函数，§3.7.4） | `src/execute/asks.ts` | 新建 |
| git 操作（可注入的执行器，`child_process.execFile`，不经 shell） | `src/execute/git.ts` | 新建 |
| 门禁锁：检查与主干全量检查共用（§3.8.3） | `src/execute/gate-lock.ts`（用 `src/data/lock.ts`） | 新建；`src/data/lock.ts` 由 M7 的 E3 建（编排方对 R4-F9 的裁定：规则板最小一片不需要锁，M5 不在自举路径上、不参与；规则板整块之后若要锁就导入它） |
| `norm-merge-gate` 的解析（纯函数，导出 `GATE_LINE_FORMS`） | `src/execute/gate-norm.ts` | 新建 |
| `check_commit` 的执行、检查记录、外部 provider；主干全量检查 `trunkCheck`（后台作业，循环板的 `execute.trunk-check` 与巡检共用，§3.11.2） | `src/execute/check.ts`、`src/execute/gate-provider.ts` | 新建 |
| 主干前进的核对：执行前判定、执行后比对、证据与完成（§3.8.4） | `src/execute/advance.ts` | 新建 |
| 自动推进：开始与恢复、完成门禁、`await_human`、空转、重启对账 | `src/execute/drive.ts` | 新建 |
| 派发状态提醒（补位、过期、等回应、丢失、模型目录） | `src/execute/notice.ts` | 新建，用公共库 `installStepNotice` 与 M3 的 `src/graph/digest-notice.ts` |
| 循环板的默认条目、事件声明与 harness 动作的清单（数据，形状照循环板 `src/loops/model.ts` 的 `LoopEntryDefinition` 与 `src/loops/service.ts` 的 `LoopEventDeclaration`） | `src/execute/entries.ts` | 新建 |
| 与循环板的接缝：`contribute` 与重交、`emit` 与去重键、`runAction` 的分派、退路执行者、看门（§2.5） | `src/execute/loop-link.ts` | 新建（运维行导入同一个模块交它的三项） |
| 自动推进的流水：进程的开始与退出、goal 的暂停、高峰里的停住与恢复（`<exec>/drive.jsonl`，§3.9.1、§3.9.5） | `src/execute/drive-log.ts` | 新建 |
| 指标事件的出口 `emitMetric` | `src/execute/metrics.ts` | 新建（出口可注入，指标流水的接口到位之前什么都不做） |
| 复盘节点的生成 | `src/execute/retro.ts` | 新建（P5） |
| 语义摘要 pins（纯函数，宿主与客户端都能导入）；0.5 起任务的每个模块、目标祖先多带一个放行时刻（§3.5.3） | `src/graph/pins.ts` | 新建 |
| 推出的执行阶段 `derivedStage(graph, node)`（`node` 是目标或模块）、某个任务此刻放没放行的 `releaseOf`、完成门禁 `goalCompletion`（纯函数，导入 `src/graph/stage.ts` 的 `effectiveStage` 与 M3 的 `src/graph/modules.ts`，§2.4） | `src/graph/execute-stage.ts` | 新建 |
| 两层循环的三档：退回的认法、受影响的活、第一档待告知的清单、批次标记（纯函数，§3.9.7） | `src/execute/tiers.ts` | 新建 |
| `dispatch_task` 说明里的示范与它的 L2（§3.1.5） | `src/execute/examples.ts`、`tests/execute-examples.spec.ts` | 新建 |
| worker 的五条执行边界规则、`stopped` 与另外两道门的 id、首日模式与理由的常量表 `EXECUTE_RULES`（§12.1；规则板整块合入时映射它进代码规则目录，同 M3 的 `MAIN_AGENT_RULES`） | `src/guard/execute-rules.ts`；M3 的 `src/guard/main-agent.ts` 的 `design-before-release` 放行一行改为询问执行服务 | 新建、改 |
| git 调用的解析：M3 的 `src/guard/git-snapshot.ts` 导出 `gitInvocations(text, dialect, base)`（M3 内部已有的读法，行为不变）、`gitRisk` 与 `takeSnapshot`（R4-N5 a：M3 附录 §9 第 7 条写的是三个，0.4 的这一行只写了两个，§3.2.4 第 4 条用 `gitRisk`） | `src/guard/git-snapshot.ts`（M3） | 改：只加导出 |
| M3 的文字：身份节边界一句、`main-agent-no-write` 的正路、`release` 与三个推出阶段的提醒、没有 `norm-merge-gate` 时的一句（§7 的 M3 一行） | `src/design/identity.ts`、`src/guard/main-agent.ts`、`src/design/stage-notice.ts`（M3） | 改 |
| 运维行入口：`hourness_report`、三条时间条目（数据） | `src/operate/index.ts`、`src/operate/entries.ts` | 新建，行 `glm-hourness/operate` |
| 巡检 | `src/operate/patrol.ts` | 新建 |
| 四答晨报、周报、人的负担与 DORA、规矩阶梯、底线清单的增类提议（纯函数） | `src/report/four-answers.ts`、`weekly.ts`、`metrics.ts`、`ladder.ts`、`floor-proposals.ts` | 新建（P2） |
| 晨报的读入 | `src/workflow/morning-report.ts` | 改：改为调四答 |
| 派遣记录的工具名 | `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 加 `dispatch_task` | 改 |
| 工具名契约 | `src/shared/tool-names.ts`：加 `EXECUTE_TOOL_NAMES`、`WORKER_TOOL_NAMES`、`OPERATE_TOOL_NAMES`，常驻名单加它们与 `structured_output`；`DISPATCH_TOOL_NAMES`（规则板整块的门才有，最小一片没有）在规则板整块合入时由规则板加 `dispatch_task`；`LESSONS_TOOL_NAMES` 由 M5 加 | 改 |
| 薄适配层：`SubagentsService`、`SubagentProvider`、`GoalsService`、`LlmCatalog`（`listModels`、`resolveModelInfo`）、`SessionQueryService` 的所用成员 | `src/shared/dsh-min.ts` | 改 |
| 读别的行的服务：规则板的 `peakModeService(ctx)`（`stateFor` 的档位与 `glmWorkerCap`、`peakHoldFor`，规则板 0.10 §7.2 的 `PeakModeService`，只此三样）；循环板的 `loopsService(ctx)`；M3 的两层循环读法（`src/graph/modules.ts` 的 `modulesOf`、`moduleOf`、`isReleased`、`isSplit`，M3 附录 0.5 §3.14.1）；只导入它们的类型与读取函数（`src/shared/peak-mode.ts`、`src/loops/service.ts`、`src/loops/model.ts`、`src/graph/modules.ts`）。0.4 读的 `rulesService` 与 `src/rules/service.ts` 删去：规则板 0.10 没有这个成员，最小一片也不交这个文件 | 被导入的文件由规则板、循环板与 M3 建；`isGlmModel` 在 `src/shared/route.ts`:31 | 不改；文件还不在时的先后见 §8.3 |
| 行健康表 | `src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `execute`、`operate` | 改 |
| 规则板的代码规则目录登记 M7 的门（§2.5）：M7 不改规则板的文件，只导出常量表 `EXECUTE_RULES`（`src/guard/execute-rules.ts`），规则板整块合入时它的 R1 映射这张表（同 M3 的 `MAIN_AGENT_RULES`、M4 的 `GUARD_RULES`）。自举路径上的规则板最小一片没有代码规则目录 | `src/rules/builtin.ts`（规则板，整块 R1，E9 之后） | 不改 |
| 练习题：读圈禁、`task.json` 与 `result.json` 的新字段、pass^k（运行目录、事后扫描与对照开关归 `ablation`） | `scripts/calibrate/read-fence.mjs`、`scripts/calibrate/run-calibrate.mjs`、`tests/calibration/*/task.json`、`tests/calibration/lib.mjs` | 新建、改（P4） |
| 探针在工作树里自动用临时 profile（本仓库专用） | `scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs` | 改（H1） |

不加的东西：图节点的新字段；图引擎的权限改动；新依赖；斜杠命令（0.2 的 `/drive`、`/patrol` 删去）；`merge_task`（主 Agent 自己合）；harness 生成的给人的待决（`questions.ts` 删去）。配置项只有执行行的 `slots`（并行写任务上限，默认 3）。

运行时文件放在项目的 `.llm/` 里，不入库（R4-N1，`d-rules-in-repo`：属于项目的东西都在项目里，运行时的进 `.llm/`，不进 git）。`<proj>` 是项目根，也就是主检出的根（`git worktree list` 的第一项；主 Agent 会话头 `cwd` 往上的 `git rev-parse --show-toplevel`，§3.1.2 第 4 步），harness 总是用它定位，从不用 worker 的工作树或审查者的工作目录推出来，所以各工作树共用同一份。`<exec>` 指 `<proj>/.llm/execute/`，执行行的全部运行时文件在这里：检查记录 `checks.jsonl` 与 `checks/`、主干前进记录 `advances.jsonl`、门禁锁 `gate.lock`、`gate-setup.json`、`reports/`、`actions.jsonl`、`drive.jsonl`、`reconcile.jsonl`、`metrics-gaps.jsonl`；每个任务自己的文件（命令记录、准备命令的日志与摘要）在 `<exec>/tasks/<任务>/`。运维行的巡检记录在 `<proj>/.llm/operate/patrol.jsonl`。第一次写入时 harness 在 `<exec>/` 与 `<proj>/.llm/operate/` 里各放一个内容为 `*` 的 `.gitignore`（同指标流水的做法），所以项目根的忽略规则里没有 `.llm/` 时也不会进 git。M3 的快照流水 `snapshots.jsonl` 与快照引用 `refs/hourness/snapshots/` 是 M3 的东西，位置以 M3 附录 0.5 为准（编排方裁定 M3 的运行时文件同样搬进 `.llm/`），M7 只经 M3 导出的 `takeSnapshot` 用它。`git info/exclude` 仍在 git 目录里（`git rev-parse --git-common-dir`，下称 `<git>`），那是 git 自己的配置，不是运行时记录。不放在数据服务的 `projectHome`：桌面版上它是一个对所有工作区共用的配置值（M3 附录 §2.4），放在那里会让不同项目的门禁记录混在一起。

### 2.2 一次任务的路径

1. 放行：人在对话里同意，M3 的 `record_human_answer` 带人的原话把阶段改为 `release`（M3 附录 §3.5）。没分模块的目标改的是目标的 `stage`；分了模块的目标，大循环放行时目标先到 `release`、各模块还在 `design`，这时没有哪个模块的开发被放行，之后人每同意一个模块的放行，改的是这个模块的 `stage`（M3 附录 0.5 §3.14.2、§3.14.3）。
2. 主 Agent 的下一步：执行行的 `agent/pre-step` 监听器看到焦点目标的放行（没分模块的目标看目标自己，分了模块的目标看各个模块）、这次放行还没开始推进，经 `emit` 交出事件 `hourness.design-released`（分了模块时带 `module`）；循环板执行默认条目「设计放行之后」，调 M7 的 `runAction('execute.start-drive', 事件)`：目标上还没有「自动推进已开始」批注时 harness `goals.create` 一个 goal 并在图上的目标批注「自动推进已开始」；已有时只批注「模块 <id> 已放行」。循环板再提醒主 Agent 分解与派活，分了模块时提醒里点名这一个模块（§3.9.1）。循环板没收下这一项、`emit` 失败、或 5 分钟内没调这个动作时，M7 自己执行同一个动作并送提醒（§2.5 的退路与看门）。
3. 主 Agent 在已批准的特性与任务下（分了模块的目标：在已放行的模块下）把规划细化成可派发的叶子，`dispatch_task {id: task-3, model: 'glm-5.3-flash', why: '…', review: {depth: 'light', why: '…'}}`。
4. 简报门禁通过；harness 建工作树、跑准备命令、生成简报、起 worker；派发批注记下模型、理由与审查深浅，任务转为进行中，指标流水记一条派活。
5. worker `submit_plan`；`checkPlan` 通过；主 Agent `answer_worker approve`；worker 开始写。
6. worker 提交到 `hz/task-3`，跑一遍检查命令，`structured_output` 交回 `done`。
7. 交回处理：核 pins；按改动与 worker 跑过的命令判底线清单；算出有效深浅（命中就是全审）；深浅不是「不审」时在 `task-3` 下建审查任务。事件 `hourness.handback` → 条目「一件活交回之后」提醒主 Agent 派审查（写模型与理由），或在不审时直接去合入。
8. 主 Agent `dispatch_task {id: <审查任务>, model, why}`；审查者交回结论；规整与收敛；通过 → 事件 `hourness.review-passed` → 条目提醒主 Agent 合入。
9. 主 Agent 用 git 做出要进主干的提交（例：在 `task-3` 的工作树里 `git rebase main`，压成一个提交，提交信息带 `Hourness-Task: task-3`），然后 `check_commit {commit}`：harness 在门禁工作树里把这个提交检出，跑 `norm-merge-gate` 里适用的命令，写检查记录（§3.8.3）。
10. 主 Agent 在主检出里 `git merge --ff-only <提交>`：harness 在执行前核对（这个提交检查通过、底线清单的内容全审过），放行；执行后看到主干确实前进到它，给 `task-3` 写证据（提交号、每条命令与退出码、日志）、标完成，删掉干净的工作树。事件 `hourness.trunk-advanced` → 条目「合进主干之后」调 `execute.trunk-check`：新主干的内容在清单的每一条命令上都已有通过记录时记为跳过，否则在门禁工作树里补跑没覆盖到的那几条（§3.11.1）。主 Agent 按规范推送。
11. 目标下的活都关了（分了模块的目标还要求没有模块停在设计中，§3.9.3 第 7 条）→ 条目提醒主 Agent 派目标整体的审查：`dispatch_task {id: <目标>, model, why}`，结论批注在目标上。
12. 主 Agent `update_goal complete`：完成门禁核对（§3.9.3），放行；图上的目标以 harness 的证据标完成。

### 2.3 角色与工具面

#### 2.3.1 谁是谁

| 角色 | 判定 | 能写什么 |
| --- | --- | --- |
| 主 Agent | M3 的 `isMainAgent`：不是委派子会话，投影为真，且是这个项目持有者记录里的会话（M3 附录 §2.4）。一个项目只有一个 | 只经图工具写图；没有写文件的工具（M3）；git 任意，主干只能前进到检查过的提交（§3.8.4） |
| worker | 本进程的派发登记表里、映射到写任务、仍活着的激活（§3.1.4） | 自己工作树里、写入范围与已批计划之内的文件；工作树下 `.hourness/` 里的报告；自己分支上的提交；对图只能批注 |
| 审查者 | 登记表里映射到审查任务的激活，或目标整体的审查激活（§3.9.4） | 只能写 `.hourness/` 里的报告；对图只能批注 |
| 只读子 agent | 派发链的根是主 Agent、自己不在登记表里（原生 `subagent` 派出的、worker 再派出的、冷恢复出来的） | 放行之后也不能写文件（§3.2.2） |

0.2 的「运维会话的 agent」一行删去（`d-one-main-agent`）。

#### 2.3.2 工具与常驻

| 工具 | 注册方 | 谁的工具面里有 | GLM 路由上 | 理由 |
| --- | --- | --- | --- | --- |
| `dispatch_task`、`answer_worker`、`check_commit`、`await_human` | 执行行 | 只有主 Agent | 常驻 | 主 Agent 推进时每拍都可能用 |
| `hourness_report` | 运维行 | 只有主 Agent | 常驻 | 每条时间条目的提醒都用它 |
| `submit_plan`、`ask_main` | 执行行 | worker（审查者只有 `ask_main`） | 常驻 | worker 的关键路径 |
| `structured_output` | DSH（subagent:889–960） | 带 `outputSchema` 的子 agent | 常驻 | 交回是 worker 的终点 |
| `lessons_query`（M5 的 `LESSONS_TOOL_NAMES` 里只有它常驻） | M5 的经验行 | 所有 agent | 常驻 | 人要求子 agent 能主动查（M5 §8.1 第 4 条） |
| `send_message`、`interrupt_agent` | DSH（tool-subagent-control:23–86） | 原样 | 照旧延迟 | 用得少 |
| `subagent`、`subagent_fork` | DSH | 原样 | 照旧 | 主 Agent 可以派只读的探索，写入被拒（§3.2.2） |
| 图的写工具 `graph_propose`、`graph_status`、`graph_edit`、`graph_link`、`graph_unlink`、`graph_verify`、`graph_decide`、`graph_approve`、`graph_reject` | 图行 | 主 Agent 与普通会话；主 Agent 派发链里的子 agent 没有（0.2 评审 F19，`question-31` C） | 照旧 | 子 agent 对图只读与批注（§3.2.3）；少九个工具的 schema；`worker-graph-readonly` 仍是兜底 |

工具面过滤（`src/execute/faces.ts`）：执行行在 `agent/created` 时给每个 agent 装一个 agent 作用域、不带 `prepend` 的 `system-prompt/assemble` 监听器（同 M3 附录 §2.1 `roleFace` 的做法：不带 `prepend` 的监听器在方言与工具检索的 `prepend` 监听器里层，它们看到的已是过滤之后的工具），`next()` 之后按角色从 `assembled.tools` 去掉：不是主 Agent 的去掉 `EXECUTE_TOOL_NAMES` 与 `OPERATE_TOOL_NAMES`；不是 worker 或审查者的去掉 `WORKER_TOOL_NAMES`；审查者再去掉 `submit_plan`；派发链的根是主 Agent 的子 agent（worker、审查者、只读子 agent）去掉上表的九个图写工具，留 `graph_show`、`graph_open`、`graph_focus`、`graph_comment`。工具仍在全局注册，按名直接调用照样执行（`docs/DESIGN.md` §2.4a），所以每个工具体先查调用方角色，图写工具由 `worker-graph-readonly` 兜底。会话在执行行激活之前已开着时，监听器在主 Agent 的第一次 `agent/pre-step` 补装。

常驻名单：GLM 包的工具检索只读公共库 `src/shared/tool-names.ts` 的 `ORCHESTRATION_RESIDENT_TOOLS`（split §2.6）。常驻只表示「在工具面里时不延迟」，谁的工具面里有由上面的过滤决定。

### 2.4 执行阶段：推出，不存

M3 让阶段存在目标的 `stage` 字段，`release` 之后的阶段留给 M7。分了模块的目标（目标下有带 `stage` 的特性，M3 附录 0.5 §3.14.1）里，每个模块也带自己的 `stage`：大循环放行时目标到 `release`、各模块在 `design`，人放行一个模块时那个模块的 `stage` 改为 `release`，模块被退回设计循环时改回 `design`（M3 附录 0.5 §3.14.7、§3.14.8）。已批准的目标与模块，LLM 与 harness 都改不了向前的阶段（M3 §2.4，D5 只放开仍为提议的节点），所以 M7 不写阶段，按图推出。以下用到的 `modulesOf`、`moduleOf`、`isReleased`、`isSplit` 都是 M3 的 `src/graph/modules.ts` 的导出，名字与行为以 M3 附录 0.5 §3.14.1 为准（M3 0.5 定稿后逐条对一遍，§7 M3 一行）：

`derivedStage(graph, node)`（`src/graph/execute-stage.ts`，纯函数，`node` 是目标或模块；导入 `src/graph/stage.ts` 的 `effectiveStage`，main `7aa8fe5` 起已在；plain-ui 0.7 §11「两层循环」第 6 条要的就是这个形状，面板用它分「放行了」与「在开发」）：M3 的 `effectiveStage(node)` 在 `release` 之前（`wish`、`interview`、`design`）时原样返回它（设计中的模块返回 `design`）；为 `release` 或其后的值（含人手写的 `decompose`、`execute`、`merge`、`operate`）时按下表算。表里的「任务」是 `scopedTasks(graph, node)`：`node` 是模块时取模块子树里的任务；`node` 是目标时取目标子树里的任务，去掉设计中的模块下面的任务，所以一个模块退回设计之后，它下面还批准着的任务不会让目标显得「在开发」。两种取法都另外去掉模块设计的审查任务（`isDesignReview(graph, task)`，§3.7.5：`kind` 为 `review`、写入范围为空、`source` 指向某个模块下的设计决策）：它不是要合入主干的活，模块放行之后它成为已批准的任务，留着会让模块显得「在开发」，也会让完成门禁第 1 条永远等一个不会完成的任务。本稿说「设计中的模块」，指有效阶段在 `release` 之前（`wish`、`interview`、`design`）、状态不是废弃或被取代的模块，含模块候选；说「放行的模块」，指 M3 的 `isReleased` 为真，或状态为完成而有效阶段在 `release` 或之后（M3 的 `isReleased` 对完成的模块为假，但完成的模块下面重开一个任务做返工，不该被 `not_released` 挡住）。

| 条件（按顺序取第一条成立的） | 推出的阶段 |
| --- | --- |
| 目标或模块为 `done` | `operate` |
| 分了模块的目标（`isSplit`）、没有一个模块已放行或完成 | `release`（大循环放行了，没有哪个模块的开发被放行：此刻该做的是各个模块的设计，不是分解） |
| 任务里有进行中或可以开工的任务（可以开工的定义同 `openItems`） | `execute` |
| 任务都关了或都在等审查与门禁 | `merge` |
| 没有任务，或任务都缺派发属性 | `decompose` |

`effectiveStage` 为 `null`（已批准、没有阶段）的目标不走设计循环，推出的阶段同样按上表算（它可以直接执行）。流程条与阶段提醒用推出的阶段，焦点在某个模块里时用这个模块的推出阶段，否则用目标的。

`releaseOf(graph, task, readers?)`（同一个文件，纯函数；`task` 是目标时，也就是目标整体的审查，只查目标层）回答派发门禁与 pins 要的问题：这个任务此刻所在的模块与目标，放行了没有。取 `module = moduleOf(graph, task)`（M3：任务自己或最近的祖先中属于 `modulesOf` 或模块候选的那个；任务不在任何模块下时没有）与 `goal = goalOf(graph, task.id)`。返回三种结果之一：`{ok: true, goal: {id, at}, module?: {id, at}}`；`{ok: false, level: 'module' | 'goal', node, stage}`（先查模块层，模块没放行就是模块层的失败，再查目标层）；`{ok: false, level: 'module', reason: 'unreadable'}`（0.6，R5-F3：读不出模块的结构，往拒绝一侧）。第三种这样产生：派发处（E4）与 `worker-scope` 这两个调用方都经 `releaseOf` 取结果，`releaseOf` 的第三个参数是读模块的一组函数（`{modulesOf, moduleCandidatesOf, moduleOf, isReleased, isSplit}`，缺省取 M3 的 `src/graph/modules.ts`，L2 注入一个抛错的），它调用这些函数时抛错（文件不在、导出的形状变了而抛 `TypeError`、读图抛错都算），并且目标有直接子节点是带 `stage` 的特性（从原始图上就数得出：`parent` 是这个目标、类型是特性、`stage` 有值，状态不是废弃或被取代；这一步不用 M3 的文件），就返回它；目标下没有这样的特性时，是没分模块的目标，读模块的函数抛错也照没分模块处理，只看目标层。调用方拿到第三种结果就原样返回：派发处交给 `briefGate` 写 `not_released`（§3.5.1），`worker-scope` 拒绝写入（§3.2.1）。放行的判定：模块层是 M3 的 `isReleased(module)`（已批准或进行中、`stage` 为 `release` 或之后），另加状态为完成而阶段在 `release` 或之后的模块；目标层是目标已批准或进行中，且 `effectiveStage(goal)` 为 `null` 或 `release` 及之后（目标被退回 `design` 就是未放行，这是第三档，§3.9.7）。`at` 是 `releaseAtOf(node)`：节点历史里最后一条把 `stage` 由 `release` 之前改到 `release` 或之后的写入的 `at`，节点现在不在放行状态或本来没有阶段（目标没走设计循环）时为 `null`。`at` 进 pins（§3.5.3），所以同一个模块被退回设计再放行，放行时刻不同，退回之前派出去的活都过期。

M3 的设计期只读（`design-before-release`）在分了模块时先按模块判（M3 附录 0.5 §3.14.6：根的焦点在没放行的模块里就拒绝）；M7 取代的仍是它判定表里「有效阶段为 `release` 或之后：放行」那一行，由 §3.2.2 的规则取代。

### 2.5 写在代码里的与放在两块板上的（`d-rules-visible`、`d-defaults-readonly`）

人在 2026-10-30 同意了这个分法：代码只留机制（板子与项目图本身怎样运作、谁能拍板、完成要证据）与安全底线（主 Agent 没有写文件的工具、危险 git 命令前先存快照、主干前进时核对检查、指标由 harness 记）；碰到某件事或到点就去做的，是循环板上的条目；会拦住动作的门，在规则板上列出。M7 的东西按这个分：

| 类 | M7 里有什么 | 人在哪里看到 | 能不能改 |
| --- | --- | --- | --- |
| 门（拦住一个动作） | `execute:worker-scope`、`execute:dispatch-chain-readonly`、`execute:worker-graph-readonly`、`execute:worker-git`、`execute:worker-message-live-only`（§3.2）；`execute:trunk-advance-checked`（主干前进的核对，§3.8.4）；`execute:completion-gate`（§3.9.3）；`execute:stopped`（停下之后不再派，§3.7.3） | 规则板的「代码里的规则」一节（规则板设计 §10.1：只读目录，id 写成 `<行>:<规则 id>`，显示所在行的激活状态）。门读的两张清单 `norm-merge-gate`、`norm-review-floor` 是图上的规范节点，规则板显示它们的条目 | 代码里的门不能改；两张清单只有人能改（验收条件只有人的权限能写） |
| 联动（碰到事或到点就做） | 十条循环板默认条目（§3.11.1）：设计放行之后开始推进、一件活交回之后、审查过了之后、停下之后、目标下的活都关了之后、合进主干之后、重启之后、晨报、周报、夜间巡检 | 循环板，每条写明来自 `dsh-hourness` 的哪一行 | 只能看（`d-defaults-readonly`）；人可以另加自己的条目 |
| 机制 | 派发、简报与 pins、计划核对、请求与回答、交回解析、审查规整与轮数、检查的执行与记录、证据的写入、登记表、指标事件 | 不在板上；行为写在本稿，出错进行健康 | — |

每道门首日的模式、理由与转生效的办法见 §12.1（R4-F7）；规则板整块合入时，它的代码规则目录映射 `src/guard/execute-rules.ts` 的 `EXECUTE_RULES`，模式取那里写的。与 `src/operate/entries.ts`（运维行的三项）各导出一张常量表，形状照循环板 0.3 的 `LoopEntryDefinition`（循环板 §2.1：`id`、`title`、`why`、`when`、`action`、`limits`；插件的条目 `why` 必填，1–150 个码点，一句人话）。执行行的 `entries.ts` 另导出事件声明（`LoopEventDeclaration[]`，循环板 §3.1）与 harness 动作的清单。循环板显示与执行的是这张表，M7 的退路执行者读同一张表（下文）。条目的动作只有两种（循环板 §2.3）：`tell-main`（给主 Agent 的一段英文，`{名字}` 由事件载荷的同名字段填，只用这个事件声明过的字段；第一行 `Loop board: <id> (default of dsh-hourness).` 由循环板加，M7 的文字从第二行起）；`harness`（M7 提供的动作，可带 `tell`：动作返回 `done` 而没带自己的 `tell` 时送它）。默认条目只在这两张表里定义：循环行自己不带 M7 的任何一项（循环板 §3 的登记表做法），所以同一件事不会两处各叫醒一次主 Agent。0.3 的形状 `{id, title, source, trigger, action}` 作废（没有 `why`，循环板会整项丢掉）。

M7 交出的事件（声明在执行行的 `entries.ts`；字段的类型与能怎样筛照循环板 §4.2 的声明表，信封另有 `{id, at, project, session}`，`session` 是持有者会话）。去重键照循环板 §3.1 的写法 `<事件名去掉名字空间>:<主体>:<这一次的标识>`，说的是「这一次发生」：同一次发生重放多少遍键都一样，真的又发生一次键一定不同（循环板 §4）。键里的标识在 M7 交事件的那一刻都已写在图上或文件里，重启后对账补报算出来的还是同一个键；M7 的退路执行者在进程内也按同一个键去重。

| 事件 | 何时 | 载荷 | 去重键（M7 生成） |
| --- | --- | --- | --- |
| `hourness.design-released` | 主 Agent 的一步里看到一次放行、这次放行还没开始推进（§3.9.1）：没分模块的目标是目标的放行，分了模块的目标是某个模块的放行（目标一级的大循环放行不交这个事件，那时没有哪个模块被放行） | `goal`、`module`（模块的 id，没分模块时为空串）、`release`（放行那条历史的 `at`） | `design-released:<module 或 goal>:<release>`（仍是三段；同一个模块退回设计再放行，`release` 不同，键就不同） |
| `hourness.handback` | `done` 的交回处理完、有效深浅不是不审（§3.6.2） | `task`、`attempt`、`status`、`depth`（有效深浅）、`reviewTask`、`commits`（这次交回的提交数）、`floorHit`（碰到必须全审清单的哪一条，「清单判不了」时写 `unparsed`，没有为空串） | `handback:<task>:<childId>` |
| `hourness.review-passed` | 审查通过 | `task`、`round` | `review-passed:<task>:<审查者的 childId>` |
| `hourness.review-skipped` | 有效深浅为不审 | `task` | `review-skipped:<task>:<这次交回的 childId>` |
| `hourness.stopped` | 审查、检查或目标整体的审查停下（§3.7.3） | `node`、`kind`（`review`、`check`、`acceptance`）、`rounds` | `stopped:<node>:<kind>-<带「· 停下」的那条批注的 at>` |
| `hourness.tasks-closed` | 一个目标下的任务都关了；分了模块的目标还要求没有设计中的模块（§2.4 的定义），因为设计中的模块下面的活还没出来，目标整体的审查此时没有意义 | `goal` | `tasks-closed:<goal>:<最后关上的那个任务那条状态历史的 at>` |
| `hourness.trunk-advanced` | 主干前进且核对通过（§3.8.4） | `from`、`to`、`tasks`、`files`（`git diff --name-only from to`，至多 200 项）、`truncated` | `trunk-advanced:<to>:<advances.jsonl 那一行的 at>` |
| `hourness.outside-advance` | 主干被 agent 以外的人或工具挪动，`advances.jsonl` 记 `{by: 'outside'}` 时（§3.8.4） | `from`、`to`、`files`、`truncated` | `outside-advance:<to>:<advances.jsonl 那一行的 at>` |
| `hourness.host-started` | 持有者会话在这个进程里第一次走步或被创建 | — | `host-started:<持有者会话>:<Math.round(performance.timeOrigin)>` |

M7 提供的 harness 动作（执行行的 `Contribution.actions`，名字空间 `execute.`）：

| 动作 | 人话（`title`） | 谁调 | 做什么 | 幂等的依据（已做过就返回 `skipped`） |
| --- | --- | --- | --- | --- |
| `execute.start-drive` | 开始自动推进 | 条目 `execute.release` | §3.9.1：目标上还没有「自动推进已开始」批注时建 goal 并写这条批注；已有时只写「模块 <id> 已放行」批注，返回 `done` 并带自己的 `tell`，叫主 Agent 分解这一个模块（§3.9.1、§3.9.7） | 目标上这次放行（以事件的 `release` 为键）、这个持有者会话的「自动推进已开始」「模块 <id> 已放行」或「自动推进移到会话」批注 |
| `execute.trunk-check` | 在主干上跑完整检查 | 条目 `execute.trunk` | §3.11.1：按覆盖规则跳过或补跑 | `checks.jsonl` 里 `kind: 'trunk'` 且 `commit` 为事件的 `to` 的一行（跑了或跳过都写） |
| `execute.reconcile` | 重启后对账 | 条目 `execute.restart` | §3.9.6 | `<exec>/reconcile.jsonl` 里键为这次事件键的一行 |
| `execute.resume-drive` | 高峰后接上自动推进 | 循环行自己的条目 `loops.peak-end`（循环板 §5.2 第 14 项）；M7 不另带条目 | §3.9.5：只恢复以 `hourness-peak-wait` 停住的 goal | goal 不再以 `hourness-peak-wait` 阻塞 |
| `execute.stop-draft` | 把停下的活写成问你的草稿 | 条目 `execute.stopped` | §3.7.4：按图算事实与四行草稿，放在结果的 `tell` 里 | 只读，重跑无害 |

与循环板的接口（照循环板设计 0.3 §3.1，`src/execute/loop-link.ts`）：

1. 交条目：执行行与运维行各在自己的 `apply` 里 `ctx.inject([LOOPS_SERVICE], sub => …)`，经 `loopsService(sub, problem)` 取服务，调 `contribute({plugin: 'dsh-hourness', row: 'glm-hourness/execute' | 'glm-hourness/operate'}, {events, entries, actions, run})`（运维行只有 `entries`）；`ok` 时把 `dispose` 交给 `sub.effect`，循环行后到或重启时自动重交、卸载时撤回。`inject` 对本包自己提供的服务不生效时（循环板 §10.2 V12），退路是每次 `agent/created` 时再调一次 `contribute`：同一个来源再交是整份替换，没有副作用。
2. 执行：`run(action, record)` 就是 `glmHournessExecute.runAction(action, record)`。`glmHournessExecute` 是执行行经 `ctx.provide` 提供的服务，成员两个：`isWorker(agentId)`（§3.2.2）与 `runAction(action: string, record: LoopEventRecord): Promise<HarnessResult>`（`LoopEventRecord`、`HarnessResult` 取自循环板的 `src/loops/service.ts`）；规则板 0.10 §10.7 M7 第 1 条请求的第三个成员 `trunkAdvanceFor(callId)` 在 E7 合入之前加（R4-F4，§18.2），不在本稿。`runAction` 不抛错、promise 不被拒；不认识的动作返回 `{outcome: 'failed', reason: 'unknown action <id>'}`；`record.project` 不是一个 git 仓库的根、或图读不出时返回 `failed` 并写明原因。结局的口径照循环板 §6.5：动作跑完了就是 `done`，要主 Agent 做事时带 `tell`（主干全量检查跑完、主干是红的，返回 `done` 加那句失败的话，不返回 `failed`）；`skipped` 是这次不用做（已经做过、条件不满足，带原因）；`failed` 只给动作没能跑完（起不来、拿不到锁或文件、写不进图）。每个动作都按上表最后一栏幂等：已做过就返回 `skipped`（`already done`）。`runAction` 一开始就在 `<exec>/actions.jsonl` 追加一行 `{action, key, event, payload, at, proc, phase: 'start'}`（载荷原样，重做时用；`proc` 是本进程的 `Math.round(performance.timeOrigin)`；`fh.sync()`），结束时再追加 `{action, key, at, proc, phase: 'end', outcome}`：这一行是「已被认领」的跨进程记号，看门读它（第 5 条）。动作需要持有者的活 agent（`execute.start-drive`、`execute.resume-drive` 调 `goals`），这个进程里没有它时返回 `skipped`（`main agent is not open in this DSH process`），由持有者所在进程的看门接手（下面第 5 条）。
3. 交事件：`emit({event, cwd: 持有者会话的工作目录, session: 持有者会话, key, payload})`，热路径（`agent/pre-step`、`tools/post-execute`）里不等它的 promise，结果到了再按第 4、5 条处理。同一个进程里同一个键只交一次（内存里记下交过的键，重启清空）。
4. 谁执行哪一项（退路按「这一项有没有被循环板收下」判，不按服务在不在，评审 F3）：每份 `contribute` 返回之后，M7 记下每项的执行者：返回 `ok`、这一项在 `accepted` 里、且 `loopsService` 没有回调 `problem`（成员形状对得上）时为循环板；其余（服务不在、成员不对、返回 `ok: false`、这一项在 `dropped` 里、撤回之后）为 M7 自己。服务在时 M7 总是交事件（人的条目与循环行自己的条目也可能听它，例 `loops.deps-after-merge` 听 `hourness.trunk-advanced`）；执行者为 M7 自己的那几项，M7 在本进程里按同一张表执行（第 6 条）。`emit` 返回 `ok: false`（`unknown-event`、`invalid`、`no-project`、`busy`、`io`，后两种循环板已在内存里重试三次）时，这一次由 M7 自己执行听它的各项。
5. 看门：交出的事件引起的 harness 动作，M7 记一条待认领 `{key, action, deadline: 交出之后 5 分钟}`（内存）；执行行的一个 30 秒的定时器（`unref`，有待认领时才跑）到点时读 `actions.jsonl` 里这个键的行（在 `<exec>/` 里，别的 DSH 进程认领了也看得到）：有 `end` 就删掉这一条；只有 `start` 时留着（主干全量检查要跑很久），每 30 秒再看，直到 `end` 出现，或那一行超过这个动作的最长时间（主干全量检查 6 小时，其余 10 分钟）仍没有 `end`；一行都没有、或 `start` 过了最长时间，就由 M7 自己执行这个动作并按条目送提醒，指标记 `execute.loop-fallback {entry, key, reason: 'unclaimed'}`，行健康 degraded「循环板没有在 5 分钟内执行『<动作的人话>』（<事件>）：M7 自己执行了」。`emit` 返回 `duplicate: true`（循环板早先处理过这个键，例如重启之前）时，按 `actions.jsonl` 判：这个键两行都没有，或只有 `start`、写它的进程（行里的 `proc`，即那个进程的 `Math.round(performance.timeOrigin)`）不是本进程且已超过这个动作的最长时间（主干全量检查 6 小时，其余 10 分钟），就当场由 M7 执行，不等 5 分钟：宿主在动作执行中退出时循环板不重跑 harness 动作，只记 `failed`（循环板 §6.8），这一次要由 M7 补上。其余（做完了，或另一个进程正在做）什么都不做。5 分钟的来由：循环板的去抖 5–30 秒、别的进程持锁时文件监视与每拍 60 秒、运行锁交给主 Agent 所在进程至多 2 分钟（循环板 §6.1、§6.3）。代价：循环板真的慢了的那一次，动作可能两边各跑一次；动作按完成标记幂等，第二次返回 `skipped`，提醒至多重复一次。
6. 退路执行者（执行者为 M7 自己的项）：harness 动作照做；提醒以 `createUserNotice('glm-hourness-loop', 标题, 正文, {hournessLoop: {entry, key}})` 送给持有者的活 agent，选方式与循环板相同（循环板 §6.4 第 3 条）：在跑用 `steer`；空闲且有 active 的 goal 用 `inject`（不作废驱动器这一轮的预约）；其余空闲用 `followup`（agent-loop:806–814）。持有者不活时留在内存里、它下一次走步时送。主 Agent 不因高峰被暂停，所以不为高峰留着提醒（`d-main-agent-peak-exempt`，R4-F1；0.4 在这里读规则板的 `heldForPeak`，规则板 0.10 已删去它）。去重同第 3 条的键。时间条目（晨报、周报、巡检）没有退路：循环板不在时它们不会到点出现，人可以在对话里让主 Agent 出，它调 `hourness_report`。
7. 行健康（§6.7）：循环板不在写「循环板不在：M7 的事件条目由 M7 自己执行，晨报、周报、巡检不会到点出现」（不降级）；成员不对写「循环板接口与 M7 不符：<problem>；M7 自己执行事件条目」（degraded）；有项被丢掉写「循环板没收下 <id>：<原因>；这几项由 M7 自己执行」（degraded）；看门或 `emit` 失败接手过的，写近 24 小时的次数（degraded）。E8 的契约测试把两张表交给循环板的校验函数（`src/loops/` 在时），钉住每一项都被收下。

循环板负责的（循环板 0.3）：显示；按触发执行与去抖限次；把提醒送进持有者会话（M3 的 `mainAgentOf`，来源 `glm-hourness-loop`，不是 `user`）；每次执行写进它自己的运行记录与指标流水（循环板 0.6 起也不因高峰攒着给主 Agent 的消息，`d-main-agent-peak-exempt`）。`hourness.design-released` 只由 M7 交（循环板 0.3 已撤回请 M3 报它的请求）。

## 3. 各条目的设计

### 3.1 派发 `dispatch_task`（m7-1）

#### 3.1.1 参数与输出

参数（rc.3 校验的 schema 子集，`docs/ORCHESTRATION.md` §2.10）：

```ts
{
  id: string                 // 写任务、审查任务、目标（目标整体的审查，§3.9.4）或模块（这个模块设计的独立评审，§3.7.5）
  model: string              // 子 agent 用的模型 id（§3.1.3）
  why: string                // 为什么选这个模型，一行，1–300 字符
  provider?: string          // 缺省为主 Agent 当前的 provider
  reasoningEffort?: string   // 缺省由所选模型决定
  review?: { depth: 'full' | 'light' | 'skip', why?: string }   // 只给写任务；缺省 full；light、skip 必须带 why（1–300 字符）
  depth?: 'full' | 'light'   // 只给审查任务：改这一轮的深浅（§3.7.1）
  depthWhy?: string          // 只给审查任务：depth 比派活时定的浅时必填，1–300 字符
  context?: string           // 主 Agent 给子 agent 的补充，至多 4000 字符
  quick?: boolean            // 简化简报（§3.3.1），只给写任务
}
```

输出：`{task, attempt, childId, role, worktree?, branch?, provider, model, reasoningEffort?, review?, brief, plan}`。`brief` 是简报摘要（12 位十六进制）；`plan` 为 `required`、`approved`（沿用上一次已批的计划）、`skipped` 或 `none`（审查）。工具说明末尾带一道完整的示范（§3.1.5）。

#### 3.1.2 步骤

1. 调用方必须是主 Agent（M3 的 `isMainAgent`，含持有者记录，M3 附录 §2.4）。设计行不在时拒绝，`hint` 写「先启用 glm-hourness/design 并 /wish」。
2. 读图（图行服务 `dirFor(cwd)` 加 `openEngine(dir).load()`），按 `id` 的节点分四路：写任务走本节；审查任务走 §3.7.1；目标走 §3.9.4；模块（分了模块的目标下带 `stage` 的直接特性）走 §3.7.5，那是这个模块设计的独立评审（0.6，R5-F4）。过简报门禁（§3.5.1；`ctx.release` 由这里按 `releaseOf` 算好放进去，§2.4），不过就拒绝，结构化错误 `{code, message, hint}`，不起子 agent。
3. 槽位：写任务受本行的 `slots`（默认 3）约束，审查与检查不占。DSH 自己的上限 `maxActiveSubagents`（默认 8，subagent:2980）满时 `startActivation` 抛 `ACTIVATION_LIMIT_REACHED`（subagent:1046–1048），同样作为 `slots_full` 返回。高峰少做的上限（接缝裁定：数归规则板，M7 在派活处读）：被派的模型 `isGlmModel(model)`（`src/shared/route.ts`:31）为真时，读一次 `peakModeService(ctx)?.stateFor(<主 Agent 的会话>)?.glmWorkerCap`；有值、且登记表里同时在跑的、经 `dispatch_task` 派出且模型为 GLM 的子 agent（写任务、审查、目标整体的审查都算；`check_commit` 的检查不跑模型，不算）已有这么多个时拒绝，码仍是 `slots_full`，`message` 写 `GLM peak, reduce: at most <glmWorkerCap> GLM subagent(s) at a time until <until 的 HH:MM>`，`hint` 列出在跑的 GLM 子 agent，并写「a non-GLM model is not limited」。服务不在、`stateFor` 为 `undefined` 或没有 `glmWorkerCap`（不是高峰、读不出、无影响、不做）时照原来的槽位。M7 不读档位与时钟，也不判是不是高峰（规则板 0.10 §3.6、§10.7 M7 第 1 条）。这是 M7 对规则板的第一处读；不做档里派 GLM 子 agent 的调用由规则板的门排队，M7 不另加判断（规则板 0.10 §10.7 M7 第 3 条）。规则板的门另管派发（整块规则板合入之后才有，自举期间没有这道门，§10.2）：`dispatch_task` 的原生名进 `DISPATCH_TOOL_NAMES`（那时由规则板加），规则板在它自己的工具调用门里判派发一类，排队时这次调用在工具体之前就被拒并带等待单（规则板设计 §6.5）。
4. 工作树（只对写任务）：`git.ensureWorktree(repoRoot, task)`。
   - 仓库根取主 Agent 会话头 `cwd` 往上的 `git rev-parse --show-toplevel`；不是 git 仓库时拒绝（`not_git`）。基线分支取主检出当前分支（`git symbolic-ref --short HEAD`），分离头指针时拒绝（`no_base_branch`）。
   - 路径 `<仓库根>/.worktrees/hz-<任务 id>`，分支 `hz/<任务 id>`。`.worktrees/` 或 `.hourness/` 没被忽略时，把 `/.worktrees/`、`/.hourness/` 追加到 `<git>/info/exclude`（本地文件、各工作树共用、不入库；先查同一行是否已在）。
   - 这个任务进过主干（重开之后再派，返工）时按祖先关系判断旧分支（0.2 评审 F17）：`M` 是基线上最近一个尾注 `Hourness-Task: <id>` 的提交。`git merge-base --is-ancestor M hz/<id>` 成立：分支是进主干之后建的或已接到它之上，复用。不成立：它是进过主干的那条分支（之后可能还有提交）：旧工作树干净就 `git worktree remove`（不带 `--force`；不干净时拒绝 `worktree_dirty` 并列出文件），把旧分支改名为第一个不存在的 `hz/<id>@<n>`（`n` 从 1 起，`git branch -m`），再从当前基线新建 `hz/<id>` 与工作树，派发批注写「旧分支留在 hz/<id>@<n>」。同一次返工里的下一次派发（例如审查没过、再修）按同一个判断复用新分支。
   - 不存在时 `git worktree add -b hz/<id> <路径> <基线分支>`；已存在且不需要改名时复用。
   - 新建的工作树跑 `norm-merge-gate` 里的准备命令（§3.8.1），每条 10 分钟上限，日志写 `<exec>/tasks/<任务>/setup-<时间>.log`，跑完把监视文件的摘要写进 `<exec>/tasks/<任务>/setup.json`；复用的工作树先算摘要，变了就重跑。失败时新建的工作树与分支删掉、复用的保留，都拒绝（`worktree_setup_failed`，带日志路径与最后 20 行）。
   - 工作树在主 Agent 会话的工作区之内（L3 实测的约束，`docs/ORCHESTRATION.md` §3.2）。
5. 次数：`attempt` = 图上这个任务已有的派发批注数加一。`childId` = `hz-<任务 id>-a<次数>-<6 位 base36 随机>`（字符在 `[A-Za-z0-9._-]` 之内，session-persistence-jsonl:866；随机后缀避开 `DUPLICATE_CHILD`，subagent:1430–1437）。
6. 生成简报（§3.5.2）与 pins（§3.5.3）。
7. 模型（§3.1.3）：校验，得到 `agentOptions`。
8. `startActivation({provider: 'spawn', label: 'hourness task <id> attempt <n>', childId, request: {prompt: [{type: 'text', text: 简报}], parent: 主 Agent, cwd: 工作树绝对路径, agentOptions, outputSchema, maxDepth: subagents.resolveMaxDepth()}, signal: exec.signal, delivery: 'caller'})`（subagent:3036–3048；`cwd` 为绝对路径时原样使用，1523–1527；`resolveMaxDepth` 3023）。
9. 写登记表（§3.1.4），在 `result` 上挂交回处理（§3.6.2）。
10. 以 `harness` 身份在任务上批注派发记录：`第 <n> 次派发 · <childId> · 基线 <分支>@<短号> · 模型 <provider>/<model>[ <effort>]，理由：<why> · 审查：<全审|轻审|不审>[，理由：<why>] · 简报 <digest>`，最后一行是 pins（§3.5.3）；已批准的任务转为进行中。指标流水记 `execute.dispatch`（§3.16）。写图失败不撤销派发：重试 3 次（每次重读修订号，间隔 200、800、2000 毫秒），仍失败时告警一次、行健康降级；派发的事实（含模型与理由）仍在主 Agent 会话的工具调用里，对账从会话推出（§3.9.6）。

`delivery: 'caller'` 的理由同 0.2：`parent` 模式会给子 agent 附「用 `send_message` 把结果发给父 agent」的指引（subagent:472–476、1460），并在结束时把整段结构化结果作为结算通知送进主 Agent（508–540、2049–2063），同一份交回会进主 Agent 的上下文两次；`caller` 模式只交给 harness，由 harness 送一行摘要。驱动器照样等它（`waitForChildren` 按派发链等所有常驻后代，1296–1330）。`caller` 没在 L3 跑过（§15 U1），不成立时退回 `parent`，简报写明只用 `structured_output` 交回。

#### 3.1.3 模型由主 Agent 选（`d-main-agent-models`）

0.2 的档位映射（行配置 `tiers`）、「实现任务默认便宜档」「审查高一档」「目标整体的审查固定最强档」与 `modelReminder` 全部删去。

- 每次 `dispatch_task`（写任务、审查任务、目标整体的审查、模块设计的独立评审）都必须带 `model` 与 `why`，缺一个就 `invalid`，`hint` 写这个 provider 目录里的前 10 个模型 id。没有默认模型：harness 不替主 Agent 选。
- provider：缺省取主 Agent 当前的路由，同 DSH 委派时取父路由的读法：会话的 `requestHeader()?.config.provider`，没有时取 agent 的 `options.provider`（subagent:293–303）。给了 `provider` 时它必须是已注册的 provider（`llm` 服务对未注册的 provider 抛错），否则 `unknown_provider`。
- 目录核对 `checkModelChoice(choice, catalog, efforts)`（`src/execute/models.ts`，纯函数）：`catalog` 取 `llm.listModels(provider)`（llm:2086–2101，按 provider 去重的 `{id, name}`）。目录非空且不含 `model` 时 `unknown_model`，`hint` 列出目录；目录读不到（抛错）或为空时放行，派发批注注明「模型目录读不到，没有核对」。`reasoningEffort` 给了时，取 `llm.resolveModelInfo(provider, model)` 的 `reasoning.efforts`，有这一项且不含它时 `invalid`；读不到时放行。目录只作参考：rc.3 写明目录成员不约束路由（llm:2080–2083），所以「读不到就放行」不会让一个能用的模型派不出去。
- `agentOptions = {provider, model, reasoningEffort?}`。DSH 把它合并在父路由之上；换了 provider 或模型而没给档位时，父路由的思考档位被清掉，由所选模型自己的默认值决定（subagent:315–329）。
- 记录：派发批注一行（§3.1.2 第 10 步）与指标事件 `execute.dispatch`（`role`、`provider`、`model`、`reasoningEffort`、`sameAsMain`、审查另带 `sameAsWorker`、`whyRef`：批注所在的节点与历史序号）。理由的原文只在图上，指标流水只记引用（`metrics`：只记数与引用、不记对话正文）。
- 主 Agent 知道能选什么：派发状态提醒（§3.5.4）在每个进程里第一次注入、以及目录变了时，带一行 `Models you can dispatch on <provider>: <id>, <id>, … (choose one per dispatch and say why)`，至多 20 个。
- 不做的：不按任务难度推荐模型；不比较模型强弱（harness 判断不了「更强」，全审要「更强的模型」由主 Agent 自己判断，周报列出每次审查与被审的活是不是同一个模型，供人看）；不替人换主 Agent 的模型（主 Agent 用强一点的模型的提醒在 M3：`/wish` 的回复与流程条，M3 附录 §2.6）；不切换套餐或渠道（`docs/CHARTER.md` §6）。

#### 3.1.4 任务映射

- 事实源：DSH 的会话日志与图。`childId` 本身编码任务与次数；主 Agent 会话的工具调用记下每次派发；worker 会话的首条消息是简报；任务上的派发批注记下 `childId` 与 pins。
- 登记表：模块级的 `Map<childId, Attempt>`（角色 `worker`、`review`、`acceptance-review` 或 `check`，任务或目标，次数、工作树、模型与理由、计划状态、pins、请求表），只在执行行本进程里 `startActivation` 成功之后写入，激活结算后保留到交回处理完成再删。`tools/pre-execute` 用它判断调用方是不是 worker：写权限只给登记表里、且 `agents.get(id)` 仍是活 agent 的 id。名字以 `hz-` 开头不算数：主 Agent 用 `send_message` 冷恢复一个已结束的 worker 时，DSH 会以同一个 id 恢复出一个没有 `outputSchema`、投递方式为默认 `parent` 的激活（subagent:2095 `deliverFollowup` 转 `coldResume`，2141–2189），交回处理接不到它，所以它不能写；§3.2.5 在源头拒绝这种发送。
- 登记表丢失：宿主重启时活着的 worker 随进程一起结束（DSH 的激活只在进程内，subagent:1215 注释「Process-local, never durable」），重启之后没有需要映射的活 worker。行在同一进程里禁用再启用时，登记表在模块作用域里，跟着模块留下〔未核实：DSH 重新应用插件时是否重新导入模块，§15 U13〕；模块被重新导入时登记表为空，还活着的 worker 一律按「不在登记表里」处理：只读（§3.2.2），派发状态提醒把它们列为「失联：先 interrupt_agent，再重新派发」，健康表注明原因。计划状态在需要时取任务上最新的计划批准批注（§3.3.4）。不按 `childId` 前缀解码来恢复写权限。

#### 3.1.5 工具说明里的示范（`d-agent-examples`，R4-F3）

人定（`d-agent-examples`，2026-10-30T06:41Z，「彳亍」）：主 Agent 要写给人、或交给 harness 当输入的每种东西，各配一道完整的示范，放在写它的那个工具的说明里（不塞进身份节，免得每一步都背着）；示范过与真实输入同样的检查，规则一改示范跟着失败；示范用与练习题（记账小工具）不相干的领域，只讲已经定了的事。派活简报的示范归 M7。

M7 里主 Agent 写的有两样：任务节点的派发属性（`kind`、`writeScope`、`acceptance`、`nonGoals`，用图工具写，§3.5.1 的门禁读它们）和 `dispatch_task` 的参数（`model`、`why`、`review`、`context`）。简报的文字由 harness 从图生成（§3.5.2），不是主 Agent 写的，所以不需要示范。`submit_plan`、`ask_main` 是 worker 的工具，`answer_worker` 的 `text` 是对 worker 说的话，都不是主 Agent 交给人或交给 harness 当输入的东西，不要求示范。示范只配一道，覆盖前两样。

位置与形状：`dispatch_task` 的工具说明末尾，英文，至多 1,400 字符。说明文字由 `src/execute/examples.ts` 的常量 `DISPATCH_EXAMPLE` 拼出，常量里有三块：一个任务节点（已批准、`kind`、`writeScope`、`acceptance`、`nonGoals`，所属目标已放行）、一次 `dispatch_task` 调用、harness 返回的摘要。内容如下（领域是给一个静态博客加订阅输出；模型 id 是编的）：

```text
Example (a static blog; the model id is made up, take yours from the model list in the dispatch notice).
Task task-12 is approved: kind "implement", writeScope ["site/feed/"], acceptance ["site/feed/rss.xml lists the 20 newest posts, newest first", "every item has a title, a link and a publication date"], nonGoals ["no Atom feed"]. Its goal is released and nothing it depends on is open.
dispatch_task {"id":"task-12","model":"example-model-large","why":"touches one directory and has a check that can be run","review":{"depth":"light","why":"adds one new file and changes no existing behaviour"},"context":"The post list is built in site/build.mjs; reuse its date helper."}
Returns {"task":"task-12","attempt":1,"childId":"hz-task-12-a1-k3x9ab","role":"worker","worktree":".worktrees/hz-task-12","branch":"hz/task-12","provider":"example","model":"example-model-large","review":"light","brief":"3fa91c0b2d44","plan":"required"}
```

`why` 的这句只示范长短和写法，不示范该选哪个模型：harness 不按难度推荐模型（`d-main-agent-models`，§3.1.3「不做的」）。0.5 的 `why` 写「start with the cheaper model」，而示范的模型是 `example-model-large`，照抄的模型学到的是「选大的、理由写便宜」，也与下面「不描述主 Agent 该怎样判断」相抵；0.6 换成与模型大小无关的写法（R5-N1 第 1 点），长度只多几个字符，仍在 1,400 字符之内。说明里紧挨着示范再写一句 `The reason is yours to write; this one only shows its size.`。

检查（L2 `tests/execute-examples.spec.ts`，每一条失败都说明示范过期了）：

1. 把常量里的任务节点放进一张预置的图（目标已放行，或没有阶段），`briefGate(graph, task, ctx)` 通过（`ctx` 取空闲：没有在跑的派发、`slots` 3、没有 `glmWorkerCap`、`release` 为 `ok`）。
2. `checkModelChoice({provider, model}, catalog, efforts)` 通过，`catalog` 取一份含 `example-model-large` 的假目录（示范里的 id 不是任何真实目录里的模型：编排层的包不点名模型，plain-ui 0.7 方向清单对照表同一条（§4.2、§6.4））。
3. 调用参数逐字段过 §6.4 的校验表（`review.why` 1–300 字符、`context` 至多 4000 字符、`quick` 缺省、`depth`/`depthWhy` 不给）；`why`、`review.why`、`context` 再过 `plainWordsIn`（这些字会被周报原样引用）。
4. 返回的摘要与真实输出的类型逐键相等（`task`、`attempt`、`childId`、`role`、`worktree`、`branch`、`provider`、`model`、`review`、`brief`、`plan`）；`childId` 合 §3.1.2 第 5 步的写法，`brief` 是 12 位十六进制，`plan` 为 `required`（`writeScope` 里有目录，`quick` 不成立，§3.3.1）。
5. 对有效深浅断言（R5-F2；`floor_requires_full` 与 `floor_unparsed` 是派审查时 `depth` 低于全审的拒绝码，写任务的派发只校验 `review.depth` 的取值与 `why`，有效深浅要等交回时按真实改动的文件与命令才算，§3.7.1、§6.4，示范里没有审查派发，派发那一刻也没有改动的路径可判，所以不断言这两个码）。预置的 `norm-review-floor` 夹具无命中（含 `files src/guard/` 一条判定写法）时，示范声明的 `light` 加一份假交回，改动都落在 `site/feed/` 之下：`floorHits` 为空，有效深浅是 `light`。夹具里再多一条判不了的条目时，同一份假交回的有效深浅是 `full`，`floorHit` 为 `unparsed`。测试按这两例断言，防止示范被当成「轻审总是行」，也不必给示范加一次审查派发（加了的话示范长度要重核 1,400 字符上限）。
6. 工具说明的全文等于由常量拼出的文字（改常量不改说明，或反过来，都失败）。

为什么这个题材是安全的：一是静态博客的订阅输出不是任何练习题的领域（`feature-parse-duration`、`bugfix-csv-quotes`、`interview-expense-log`），没有可照抄的答案；二是它只讲已经定了的事：模型与理由由主 Agent 写（`d-main-agent-models`）、审查深浅在派活时声明且轻审要写理由（`question-38` C）、写入范围是目录所以要先交计划（§3.3.1）、派发的返回字段是 §3.1.1 定的，没有新增任何要求，也没有碰本仓库的必须全审的类别；三是它不描述主 Agent 自己该怎样判断（哪个任务用哪个模型），所以不会把一个例子变成一条隐含的规矩。有无示范的效果对照留给练习题，不在 M7 的验收里（R4-F3 评审意见）。

### 3.2 写入门禁（m7-1）

五条规则，都在 `src/guard/execute-rules.ts`，由执行行在 `tools/pre-execute` 上以 `prepend` 注册（tools:3320–3353），用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`），拒绝写进违规流水（与 guard 同形的 `ViolationRecord`）。判写与 M3 的 `main-agent-no-write` 相同（文件工具的目标，以及 file-tools-only 判为写文件的 shell 命令，M3 §3.1.4）；带 `parent` 的传输层子调用放行。不分路由（G3）。

#### 3.2.1 `worker-scope`：worker 只写自己的范围

调用方在登记表里时：

1. 目标路径按调用方的工作目录解析（`workingDirectory.get(session)`，同 guard），`path.resolve` 规整。
2. 必须在本次派发的工作树根之内，且不在工作树根下的 `.git` 里；否则拒绝，越界一句 `You are the worker for task <id>; you write only inside your worktree <path>.`
3. 相对工作树根的路径在 `.hourness/` 下时放行（交回的长报告，§3.6.2；这个目录被 `info/exclude` 忽略，不进改动）。其余必须在任务当前的 `writeScope` 之内（`scope.within`，按段比较：`src/` 包含 `src/a.ts`，不包含 `src2/a.ts`；文件项只包含它自己），并且：任务此刻所在的模块与目标还是放行的（`releaseOf(graph, 任务).ok`，纯函数，§2.4；0.5：模块或目标被退回设计之后，其下在跑的活不能再写，这是第二档、第三档里「受影响的活停下」的一半，另一半是交回过期，§3.9.7；读的图与下一段说的写入范围是同一份，按修订号缓存；图读不出时沿用缓存里上一次读到的那一份（放行状态也一样，往放行一侧错一次，交回时的过期核对兜底），行健康记原因；一次都没读到过时拒绝，码 `graph_unreadable`，正路是 `ask_main`；图读到了而读模块的函数抛错、且目标分了模块时，`releaseOf` 返回 `{ok: false, level: 'module', reason: 'unreadable'}`（§2.4，R5-F3），同样拒绝，纠偏 `The module structure could not be read, so the harness cannot tell whether the design you belong to is released: stop writing, hand back with status blocked and say so in the summary.`，行健康记「读不到模块」；没分模块的目标不受这一支影响），不是时拒绝，纠偏 `The design this task belongs to was sent back (<module 或 goal> <id>): stop writing, hand back with status blocked and say so in the summary; the main agent dispatches the task again after the person releases the design.`；需要计划的任务，计划获批之前一律拒绝（`Submit your plan with submit_plan and wait for approval before writing.`）；获批之后还要在已批计划各步 `paths` 的并集之内。
4. 审查者（`kind: review`）与目标整体的审查只能写 `.hourness/`。

写入范围取当前的图，不取派发时的快照：主 Agent 中途把范围改大，worker 重新提交计划（§3.3.3）即可写新路径；改小立即生效。范围读图按图修订号缓存。

纠偏的正路：`If the task needs this file, ask the main agent with ask_main; it can widen the write scope, then resubmit your plan.`；例外：`If the file belongs to another task, report it in your handback under questions.`

**申报接缝（0.6 修订，2026-11-04；m4 设计 0.6 §5.9 的 worker 一侧，R4-F10「谁后合入谁接」在 E6 合入批接上）。** worker 的写被判到工作树之外（§3.2.1 第 2 条的拒绝支）时，先问 guard 行的服务 `glmHournessRequests`（`requestsService(ctx)`，`src/guard/request-service.ts`；行不在或成员形状不对时读不到，行为照旧，行健康报一次）：`peekGrant({agent, tool, args, base})` 为真就不拒，调 `next()` 放行给 guard 行——圈禁判拒、放行簿按派发链的根匹配、使用时核对与备份、消耗放行、写 `GrantRecord`（m4 §5.6），`worker-scope` 的命令记录记 `allowed`。`peekGrant` 为假则照拒，并问 `outsideDenial({agent, tool, args, base, task})`：返回 `{ref, exception}`（目标出了项目；判法按 F19 用目标最近存在目录的项目根，不用圈禁根，worker 写主检出拿不到编号）时，纠偏的「例外」一句换成返回的 `exception`，违规记录带 `ref`；返回 `undefined`（目标在项目里、只是出了工作树，或 guard 行不在）时纠偏照上面的原样，不发编号。worker 照例外一句调 `ask_main`，问题里带编号与目标，`assumption` 写明没回答就交回并把编号写进 questions；主 Agent 拿编号调 `request_exception`（编号登记的派发链的根就是它）、把申报文字放在回复末尾，人回「可以」之后主 Agent 用 `answer_worker` 回那条 `ask_main`，worker 原样再调一次，`peekGrant` 命中、guard 行消耗放行；30 分钟内第二次同样的调用又被拒时拿新编号（m4 §5.9 第 5 步）。时限照 m4：`ask_main` 等 20 分钟（`ASK_WAIT_MS`），申报等 2 小时，放行 30 分钟。`openRequests` 不在此处：它是自动推进的停等（§3.9.5，E8 接 `goals.block`，原因码 `hourness-waiting-human`）。跟进记录器的结算（带编号的 `ask_main` 记 `right-path`）随四道门改经 `installRuleGate` 一起接（m4 §18 第 5 条的谁后合入谁改；接之前按 m4 写明的「改之前」状态，结算记 `other`）。L2：`tests/execute-row.spec.ts` 的申报接缝一例（放行命中不拒、出项目带编号与申报句、项目内原样不带编号、服务不在照旧——已有的工作树外一例兼作对照）；L3：`guard-request-worker`（m4 §14.1）。

#### 3.2.2 `dispatch-chain-readonly`：派发链里不在登记表的 agent 只读

取代 M3 `design-before-release` 的「有效阶段为 `release` 或之后：放行」一行。M3 的规则按派发链找根（`dispatchRoot`，M3 §3.3.3）；根是主 Agent、写调用方不在登记表里时：执行服务在（执行行启用）→ 拒绝，越界一句 `In a main-agent session only dispatched task workers write; you were started with the plain subagent tool.`，正路「Read, search and report back; the main agent dispatches writing work with dispatch_task.」；执行服务不在 → 保持 M3 的行为（`release` 之后放行）。设计期（放行之前）照旧按 M3 拒绝。M3 的身份节边界一句与 `main-agent-no-write` 的正路在执行服务在时同样改为「writing work goes to workers you dispatch with dispatch_task; subagents started with the subagent tool only read」，否则主 Agent 会先走一次必被拒绝的路（0.2 评审 F18）。这条规则改的是 M3 的文件 `src/guard/main-agent.ts`，判定经服务 `glmHournessExecute.isWorker(agentId)` 取得，guard 目录不导入执行目录。

理由：原生 `subagent` 派出的子 agent 写在主检出上，绕过工作树、写入范围、审查与合入前的检查；worker 再派出的 agent 同理。只读的探索仍然有用，所以只拦写。

#### 3.2.3 `worker-graph-readonly`：worker 对图只读

派发链的根是主 Agent 的子 agent（登记表里的与只读子 agent）调图的写工具（`graph_propose`、`graph_status`、`graph_edit`、`graph_link`、`graph_unlink`、`graph_verify`、`graph_decide`、`graph_approve`、`graph_reject`）被拒；`graph_show`、`graph_open`、`graph_focus`、`graph_comment` 放行。这九个工具本来就不在它们的工具面里（§2.3.2），这条是按名直接调用时的兜底。正路：`Report it in your handback (questions, assumptions, lessons); the main agent updates the graph.`。理由：规划状态只有主 Agent 与 harness 两个写入方，worker 写图会与主 Agent 争修订号，也会绕过「计划外的变更走待决」。这回答了 `docs/ORCHESTRATION.md` §2.10 留给 M7 的「子 agent 该不该写图」。

#### 3.2.4 `worker-git`：worker 只碰自己的分支，危险命令先存快照

0.2 的 `main-agent-no-git-write`（拦主 Agent 的 `git merge`、`commit`、`reset` 一类）删去：git 交给主 Agent（`d-main-agent-shell`），主 Agent 的 git 只受两样东西约束：M3 的快照规则（会丢未提交改动或改写历史的命令先存快照，M3 附录 §2.5）与本稿主干前进的核对（§3.8.4）。

worker 与它派出的 agent（派发链里、根是主 Agent、不是主 Agent 自己）的 shell 命令里的 git 调用，用 M3 的 `gitInvocations(text, dialect, base)` 读出（`src/guard/git-snapshot.ts` 的导出，引号感知，跳过全局选项，解析 `-C`；M3 内部已有这套读法，M7 只请它导出），按下面判：

1. 仓库目录必须是调用方自己的工作树（登记表里的 `worktree`）或它之下；`-C`、`--git-dir`、`--work-tree` 指到别处，或 `cd` 的目标认不出时拒绝。只读子 agent 与审查者只能用只读子命令（`status`、`log`、`diff`、`show`、`blame`、`grep`、`rev-parse`、`ls-files`、`describe`、`shortlog`、不带改写参数的 `branch` 与 `tag` 列表）。
2. worker 可以在自己的分支 `hz/<id>` 上做任何事：`add`、`commit`（含 `--amend`）、`rebase <基线>`、`merge <基线>`、`reset`、`stash`、`restore`、`checkout -- <路径>`、`cherry-pick`、`revert`。
3. 拒绝：`push`；`pull`（取别处的东西进来由主 Agent 定）；`worktree`；`update-ref`、`symbolic-ref` 的写法；`branch` 的创建、删除、改名与 `-f`，`tag` 的创建与删除，`checkout`、`switch` 到 `hz/<id>` 以外的分支或以 `-b`、`-B`、`-c`、`-C` 新建分支；`fetch` 写进 `refs/heads/` 或 `refs/remotes/` 的 refspec；`config` 的写法；`filter-branch`、`filter-repo`、`replace`、`gc --prune`、`prune`、`reflog expire|delete`。
4. 放行之前，M3 的 `gitRisk(sub, args)` 为 `discard`、`history` 或 `both` 的，先调 M3 的 `takeSnapshot(repo, invocation, risk)`（快照引用 `refs/hourness/snapshots/<id>`、流水 `snapshots.jsonl`（M3 的文件，位置以 M3 附录 0.5 为准，编排方裁定它同样搬进项目的 `.llm/`）、给调用方的恢复提示，与主 Agent 一侧同一套）；存不了快照时按 M3 的同一条拒绝（`git-snapshot`）。worker 的工作区只有它自己的改动，快照救的是它自己与之后接手的那一次派发。

纠偏一句：`You are the worker for task <id>: use git only on your branch hz/<id> in your worktree; the main agent integrates, pushes and manages other branches.`；例外：`If the task needs another branch, ask the main agent with ask_main.`。这是启发式：认不出的写法（例如脚本里调 git）改到别的分支或主干时，由主干前进的执行后比对（§3.8.4，对 worker 的 shell 调用同样做）与巡检发现。

#### 3.2.5 `worker-message-live-only`：主 Agent 只给活着的派发发消息

主 Agent 调 DSH 原生 `send_message`（参数 `{agent_id, message}`，tool-subagent-control:23–36）或 `interrupt_agent` 时，`agent_id` 以 `hz-` 开头、却不是执行行在本进程里起的、仍活着的激活（登记表里的 worker 与审查，加上检查与目标整体审查的激活，§3.1.4）就拒绝。对活着的检查，`send_message` 也拒绝（外部激活收不了续发），`interrupt_agent` 放行。理由：对已结束的 worker，`send_message` 走冷恢复（subagent:2095、2141–2189），恢复出来的激活没有 `outputSchema`、投递方式是默认的 `parent`，交回处理接不到它，它的工作也不会进审查与合入前的检查。正路：`That worker has ended; dispatch the task again with dispatch_task (the new attempt carries the earlier findings).`。`interrupt_agent` 对已结束的 id 本来无事可做，同一句纠偏。不是 `hz-` 开头的 id 不管（主 Agent 自己用 `subagent` 派的只读探索照常可以续聊）。

### 3.3 计划审批（m7-1，`d-plan-approval`）

#### 3.3.1 什么任务要计划

写入范围非空的任务都要，除非派发时 `quick: true` 且满足：写入范围至多 2 项、都是文件（不以 `/` 结尾）（0.2 的「档位不是 `hard`」随档位一起删去）。不满足时 `quick` 被拒（`invalid`，`hint` 写条件）。审查任务没有计划。理由：`docs/ORCHESTRATION.md` §3.3「小改动用简化简报：规则照样硬，靠降低派发成本来解决」。

#### 3.3.2 `submit_plan`（worker 的工具）

参数：

```ts
{
  steps: Array<{
    title: string                  // 一行
    paths: string[]                // 仓库相对路径，同 writeScope 的写法
    acceptance: string[]           // 至少 1 条
    covers: number[]               // 覆盖任务验收的第几条（从 0 起）
    verify: 'L1' | 'L2' | 'L3' | 'L4-batch'
    commands: string[]             // 这一步要跑的检查命令；L2、L3 至少 1 条
  }>
  notes?: string                   // 至多 2000 字符
}
```

`checkPlan(task, plan, norm)`（`src/execute/plan.ts`，纯函数）全部成立才通过：步骤 1–12 个；每步标题非空、验收至少一条、`verify` 合法、L2 与 L3 有命令；每步的 `paths` 都在任务的 `writeScope` 之内（§3.2.1 的 `within`）；任务的每条验收至少被一步的 `covers` 覆盖，`covers` 里没有越界的下标；`L4-batch` 的步不带命令（桌面版的验收攒到批次，`docs/DEVELOPMENT.md` §1.1）。

不通过：工具当场返回错误（每条一行，例 `step 2: path "ui/x.ts" is outside the write scope [src/execute/]`），不通知主 Agent，worker 改了再交。同一次派发里第 4 次不通过时，返回「plan rejected 4 times; hand back with status blocked」。

通过：
1. harness 以 `harness` 身份改任务正文：把正文里 `## 计划` 开头的一节（没有就追加）换成渲染后的计划（`第 <版本> 版 · 等主 Agent 审 · 摘要 <plan digest>`，每步一行标题、一行路径与验证层级），版本从 1 起，每次通过加一。写正文失败时照样继续（计划的事实源是 worker 会话里这次工具调用的参数），健康表记降级。
2. 在请求表里登记一个请求 `{id: 'R-<6 位>', kind: 'plan', child, task, version, digest}`，给主 Agent 送一条通知（§3.4.3），正文是渲染后的计划与 `answer_worker` 的用法。
3. 工具调用不返回，等主 Agent 回应，上限 30 分钟（常量 `PLAN_WAIT_MS`）。等待期间 worker 的回合开着，驱动器不会开下一拍（它等子 agent），主 Agent 由通知唤醒（空闲时 `followup`，运行中 `steer`）。
4. 回应或超时之后返回：`{status: 'approved' | 'revise' | 'timeout', version, text?}`。超时时提示 worker：`No review within 30 minutes; hand back with status plan-pending.`（主 Agent 之后可以批这一版并重新派发，新的一次派发直接沿用已批的计划）。

#### 3.3.3 改计划

已批的计划要扩大路径（主 Agent 中途改了写入范围，或 worker 发现要动别的文件）时，worker 再 `submit_plan`（版本加一），批准之前已批路径照样可写，新路径不可写。

#### 3.3.4 主 Agent 的批准

`answer_worker {request, verdict: 'approve' | 'revise', text}`（§3.4.2）。`approve` 时 harness 再跑一次 `checkPlan`（图可能在这之间变了）并核对 pins（§3.5.3），都过才：把正文那一节的「等主 Agent 审」改为「主 Agent 已批」；在任务上批注 `计划第 <版本> 版已批 · 摘要 <digest> · <childId> · <调用 id>`；把请求标为已回应，worker 的调用返回 `approved`。不过就把原因返回给主 Agent（`plan_invalid`、`brief_stale`），worker 的调用不动。`revise` 时 `text` 必填，原样交给 worker。

计划批准的记录在图上，所以后续每一次派发都能沿用：简报门禁在任务的最新计划批准批注存在、它的摘要等于正文里当前计划一节的摘要、批注之后 pins 没过期时，在简报里附上这份计划，`plan` 输出为 `approved`，worker 直接按计划写（写入门禁取这份计划的路径）。正文里的计划被人或 LLM 改过（摘要对不上）时，这份批准失效，worker 要重新提交。

人不出场：批准者是主 Agent，可查的条件由 harness 在边界核对；计划不合格不打扰主 Agent，主 Agent 不批 worker 就不能写。

### 3.4 主 Agent 与 worker 的通信（m7-1）

#### 3.4.1 rc.3 里已有的通道〔实读〕

- 子到父：`subagents.sendMessage(sender, parentId, content)`，发送方是常驻的直接子 agent 时走 `sendToParent`，以 `steer` 投给父 agent，父空闲则唤醒（subagent:1538–1544、2119–2135、1630–1642）。消息来源 `{kind: 'agent-message', form: 'relay', senderSessionId}`（subagent:443–465）。L3 实测过结束时的这一条（探针 `glm-dispatch`）。
- 父到子：同一个 `sendMessage`，目标是直接子 agent 时走 `deliverToChild`，常驻时 `submitAdmitted` 以 `steer` 投给子 agent（下一步收到），不常驻时从持久化冷恢复（subagent:1545–1549、2080–2117、2216–2231、1584–1590）。子 agent 正在提交结构化结果时拒绝（`INPUT_CLOSED`，subagent:1588）。源码核对过，运行时没有跑过〔未核实，§15 U3〕。
- 工具：`send_message {agent_id, message}` 与 `interrupt_agent {agent_id}`（tool-subagent-control:23–86）。目标只能是直接子 agent，或自己是常驻子 agent 时的直接父 agent；兄弟之间发不了：目标不是自己的父，就当作自己的子去投，按派发链核对时以 `UNAUTHORIZED` 拒绝（subagent:1545–1549、`authorizeLineage` 1659–1662）。
- 中断：`subagents.interrupt(target, authority)`，祖先或人的身份，取消子 agent 当前的回合、保留收件箱（subagent:1258–1278、3105）。
- 投递是步与步之间的：运行中 `steer`（下一步收到），空闲时开新回合；没有逐 token 的对话。

#### 3.4.2 三条路

| 用途 | 做法 | 为什么不用别的 |
| --- | --- | --- |
| worker 要主 Agent 拿主意 | worker 调 `ask_main {question, assumption, options?}`：harness 登记请求（`kind: 'question'`），通知主 Agent；worker 的调用开着，上限 20 分钟（常量 `ASK_WAIT_MS`）。主 Agent `answer_worker {request, text}`，回答作为这次调用的结果回到 worker。超时返回 `{status: 'timeout'}`，worker 按它自己写下的 `assumption` 继续，并在交回的 `assumptions` 里列出 | 带 `outputSchema` 的子 agent 若停下回合等回答，DSH 会以 `error` 结算这次激活（没有结构化结果的 `completed` 记为 `error`，subagent:1098–1117），交回就丢了；所以等待必须发生在一次工具调用里，回合不能结束。`send_message` 只投递、不等回答 |
| 主 Agent 改 worker 的方向 | 原生 `send_message {agent_id: <childId>, message}`；worker 在下一步收到（正在 `ask_main`、`submit_plan` 里等的话，在那次调用返回后的下一步） | 已是 DSH 的通道，消息与来源都落在双方会话日志里。改方向如果涉及验收、非目标或写入范围，正路是先改图：前两者由人定（转述），写入范围主 Agent 自己能改；改了验收与非目标会让简报过期（§3.5.3），这次的改动进不了主干，所以重大改向用「中断 + 重新派发」 |
| 停下 worker | 原生 `interrupt_agent`，或人在面板上点「暂停」（M2.9 的 `/graph-run stop`，按 worker 的焦点找到它；简报要求 worker 先 `graph_focus` 自己的任务，§3.5.2） | 被中断的 worker 以 `aborted` 结算（subagent:487–498），交回处理记一条「第 n 次被中断」，任务保持进行中。之后要继续就重新派发，不用 `send_message` 唤醒：结构化交回是按激活算的，冷恢复的回合没有 `outputSchema`（subagent:555–560 注释、2141–2189）。§3.2.5 在执行边界拒绝对已结束 worker 的 `send_message`，正路就是重新派发 |

worker 之间不直接说话：DSH 已经拒绝；简报里写明「需要别的任务的东西时用 `ask_main`」。

#### 3.4.3 harness 发给主 Agent 的消息

都用 `createUserNotice('glm-hourness-execute', 摘要, 正文, {hournessExecute: {...}})`（来源种类非空、其余字段原样保存，`docs/DESIGN.md` §2.4a；来源不是 `user`，所以不会被 `update_goal` 当成人直接说的话，tool-goal:44–52）。主 Agent 运行中用 `steer`，空闲用 `followup`（agent-loop:806–811）。事实字段：`{event: 'plan' | 'question' | 'handback' | 'review' | 'check' | 'advance' | 'stale' | 'drive', task, attempt, childId, request?}`。这些是请求与事实的通知（机制）；「碰到某件事就去做」的提醒是循环板条目的正文（§2.5），来源为 `glm-hourness-loop`。

收件人是当前的主 Agent（评审 N7）：通知、worker 的计划与问题请求，一律送给 M3 `mainAgentOf(userHome, graphDir)` 此刻给出的持有者会话，每次送之前重取，不用派发时记下的 `parent`。`answer_worker` 认的也是当前持有者：调用方 `isMainAgent` 为真，就能回应这个项目登记表里的任何一条请求，包括前任主 Agent 派出的 worker 的。人用 `/wish here` 把主 Agent 移到另一个会话之后：

- 等回应的请求在新持有者的下一步里列出（派发状态提醒，§3.5.4），它照常 `answer_worker`，worker 不会白等 30 或 20 分钟。
- `send_message` 与 `interrupt_agent` 只认 DSH 的直接父子（subagent:1545–1549、1659–1662），新持有者对前任派出的 worker 发不了：提醒里写「started by the previous main agent: you can answer its requests; to change its direction, let it hand back and dispatch again, or ask the person to stop it from the panel」。交回照常由 harness 收（`caller` 模式），结论送给新持有者。
- 自动推进跟着持有者走：见 §3.9.1 表里「批注里的会话不是当前持有者」一行。

#### 3.4.4 留痕

- 每条消息的全文在双方的会话日志里：worker 的 `ask_main`、`submit_plan` 调用与结果；主 Agent 的 `answer_worker`、`send_message` 调用与 harness 通知。这是事实源，图上不复制全文。
- 交回处理时在任务上批注一行计数：`第 <n> 次：问了 <k> 次（答 <a>、超时 <t>），计划 <v> 版，主 Agent 发来 <m> 条消息`，`m` 由 worker 会话里来源为 `agent-message` 且 `senderSessionId` 是主 Agent 的用户消息数得出。
- 问答里定下的设计取舍，主 Agent 按身份文本的要求记成决定者为 agent 的待决再拍板（M3 的做法）；harness 不替它判断哪条回答算决定。

### 3.5 简报与简报门禁（m7-2）

#### 3.5.1 门禁

`briefGate(graph, node, ctx)`（`src/execute/brief.ts`，纯函数；`ctx` 带在跑的派发（含各自的模型）、槽位、执行状态、停下标记、任务所在模块与目标的放行状态 `release`（`releaseOf` 的结果，§2.4；0.5 起代替 0.4 的所属目标推出的阶段 `stage`）与规则板给的少做上限 `glmWorkerCap?`），按序第一条不成立就拒绝。写任务全表适用；审查任务与目标只用标出的几行，其余见 §3.7.1、§3.9.4。

| 检查 | 适用 | 不成立时的码 | `hint` |
| --- | --- | --- | --- |
| 参数合法：`model`、`why` 齐，`review`、`depth`、`depthWhy`、`quick` 与节点种类相符（§6.4） | 全部 | `invalid` | 写出缺的或多的字段 |
| 节点是任务（或目标），状态为已批准或进行中；模块设计的审查任务例外，它也收 `proposed`（M3 附录 0.5 §3.14.7：任务挂在没放行的模块下出生为 `proposed`，主 Agent 批不了，§3.7.5） | 全部 | `bad_task` | 完成的任务先重开 |
| 任务所在的模块（任务不在任何模块下时跳过这一层）与所属目标都已放行：模块的 `stage` 不早于 `release`，目标的 `stage` 不早于 `release`，或目标已批准、没有阶段（`ctx.release.ok`，由调用方按 `releaseOf` 算好放进来；目标整体的审查只看目标层）。分了模块的目标里，一个模块没放行，它下面的活一件也派不出去，别的已放行的模块不受影响。两处特别情形（0.6）：（一）读不出模块的结构（`releaseOf` 返回 `reason: 'unreadable'`，§2.4，R5-F3）时，分了模块的目标下一件也派不出去，失效时拒绝；没有带 `stage` 的特性的目标不受影响；（二）模块设计的审查任务（`isDesignReview`，§3.7.5，R5-F4）跳过模块层这一检查：被审的设计决策所在的模块在设计中，正是这个任务该派的时候；目标层照查，目标没放行（大循环还没过）时这个审查派不出去 | 全部 | `not_released` | 模块层：`This module's design is not released: put its one-page release to the person with propose_to_human (kind release, module <id>).`；目标层：`The design is not released: put it to the person with propose_to_human (kind release).`；模块或目标是被退回设计的（历史里有一条把 `stage` 由 `release` 之后改回 `design`，第二档、第三档，§3.9.7）另加 `It was sent back to design; wait for the person to release it again.`；读不出模块的结构时只写 `The module structure could not be read; the harness refuses dispatch until it can.` |
| 有 `kind`；`review` 的写入范围为空，其余种类非空；`worktree` 不是 `false` | 写任务 | `bad_attributes` | 用 `graph_edit` 补派发属性 |
| `acceptance` 至少一条 | 写任务、目标 | `no_acceptance` | `Propose the task again with acceptance criteria; changing the acceptance of an existing task is the human's.`（`src/graph/engine.ts` `LLM_EDITABLE`:101 不含 `acceptance`） |
| 依赖都完成 | 写任务 | `deps_open` | 列出未完成的依赖 |
| 任务子树里没有决定者为人、还没拍板的待决（`waitsForHuman`：含提议式待决；决定者为 agent 的待决，也就是第一档里主 Agent 自己定的事，拍板之前不挡派发，完成门禁第 3 条仍要求它们都关了，R4-F2）；也没有未解除的停下标记（§3.7.3）；或执行行在内存里记着它已停下（`ctx.stopped`） | 写任务、审查任务 | `waiting_human` | 列出待决与停下标记所在的批注；「the person has not answered yet: put it to them in the chat with propose_to_human」 |
| 这个节点没有活着的派发 | 全部 | `busy` | 带在跑的 `childId` |
| 写入范围与每个在跑的写任务两两不相交（`scope.overlaps`） | 写任务 | `scope_busy` | 写出相交的任务与路径；可以 `graph_link` 依赖 |
| 写任务数小于 `slots` | 写任务 | `slots_full` | 写出在跑的写任务 |
| 被派的模型是 GLM、且规则板给了少做上限（`ctx.glmWorkerCap`，由调用方按 §3.1.2 第 3 步读好放进来）时，在跑的 GLM 子 agent 数小于它 | 全部 | `slots_full` | 写出在跑的 GLM 子 agent、上限与到几点；非 GLM 的模型不受这一条限 |
| `outputSchema` 能解析（内置名或仓库内的 JSON 文件，对象 schema，在 rc.3 子集内） | 写任务 | `bad_schema` | — |
| 审查任务：被审的任务有 `done` 的交回，且这次交回之后没有过期；模块设计的审查任务换成：`source` 指向的设计决策都在、没被废弃或取代，所在的模块在设计中，目标有方向清单（`norm-directions`，M3 附录 0.5 §3.14.1 的 `directionsOf`） | 审查任务 | `nothing_to_review`；方向清单缺时 `no_directions` | —；`no_directions` 的 `hint`：`The goal has no direction list (norm-directions); the big loop writes it before any module design is reviewed.` |

四栏都由 harness 从图生成，所以门禁检查的是图上的来源：目标栏要标题，上下文栏总有祖先链，约束栏要写入范围，完成栏要验收。

#### 3.5.2 简报的文字

英文，上限 9000 字符；超出时依次裁掉经验、上一次的发现细节、主 Agent 的补充（各自注明「truncated」）。结构：

```
# Task <id>: <title>
You are a worker dispatched by the main agent (agent id "<parent>") for exactly one task of the project graph.

## Goal
<title>. Why it exists: <ancestor chain, goal first: "<goal title>" > "<feature title>" > this task>.
Decisions it follows: <source decisions and decided questions: id, title, chosen option>.

## Context
- From the main agent: <context>
- Workspace: your worktree "<path>" on branch "hz/<id>", created from "<base>" at <sha>. Paths below are relative to it.
- Project graph: read with graph_show / graph_open; graph_focus "<id>" first so the panel shows you on this task. You may only graph_comment.
- Earlier attempts: <attempt n-1: outcome; review blocking findings; merge check failure (command, last lines, log path)>
- Approved plan (version <v>): <steps>            # only when one carries over
- Lessons that match this task: <lesson id: when ... -> problem -> fix>   # at most 5

## Constraints
- Write only inside: <writeScope>. Writes elsewhere are refused.
- <Before writing, submit a plan with submit_plan and wait for approval. | Quick task: no plan needed.>
- Questions that need the main agent: ask_main (state the assumption you will use if no answer comes). Do not end your turn to wait.
- Commit on your branch; start every commit message with "<id>: ". Do not push, and do not touch other branches or worktrees; the main agent integrates your branch.
- Subagents you start may only read. Do not start or restart the DeepSeek Harness desktop app; desktop checks are batched (verify "L4-batch").
- Not in scope: <nonGoals of the task and its ancestors>
- Rules in effect: <rules board lines for this session, when the rules row is enabled>

## Done when
1. <acceptance 1>
2. ...
- Run the project checks in your worktree before handing back: <gate commands from norm-merge-gate>.
- Hand back by calling structured_output once (status, summary of at most 2000 characters, commits, files, checks, questions, assumptions, lessons). Write long reports to ".hourness/<childId>.md" in your worktree and give the path in "report".

brief <digest> · graph <revision>
```

审查任务的简报同形，目标栏写「Review task <被审 id> at commit <sha> against its acceptance」，约束栏写「You write nothing except your report under .hourness/」、挡路的三类标准（§3.7.2）与这一轮的深浅（全审或轻审的那一句，§3.7.1），完成栏的交回是审查结论。

#### 3.5.3 pins 与过期

`pinsOf(graph, task)`（`src/graph/pins.ts`，纯函数）：对任务、它到目标的每个祖先、它的 `source` 连线指向的每个节点（决策与待决），各算一个 12 位十六进制的语义摘要：SHA-256 输入是规范化的 JSON，只含这些字段：

| 节点 | 进摘要的字段 |
| --- | --- |
| 任务 | `acceptance`、`nonGoals`、`kind`、状态是否为废弃或被取代 |
| 祖先（目标、特性、任务） | `acceptance`、`nonGoals`、状态是否为废弃或被取代；其中属于模块（`moduleOf` 认出的，没分模块的目标没有）或目标的两个祖先另带 `releaseAt`（§2.4 的 `releaseAtOf`：节点现在不在放行状态、或本来没有阶段时为 `null`，否则是最近一次进入放行的那条历史的 `at`） |
| 来源决策 | `verification` 是否为 `overturned` 或 `superseded`、状态 |
| 来源待决 | `decision`（选项式的拍板结果）或 `conclusion`（提议式的结论，M3 附录 §3.3）、状态 |

不进摘要的：标题、正文、`slope`、历史、写入范围（写入范围由写入门禁按当前的图核对，交回时另按 git 核对，§3.2.1、§3.6.2）。`releaseAt` 是 0.5 为两层循环加的（R4-F2）：用时刻而不用「是否放行」的布尔，因为模块被退回设计、改了设计、再放行之后，布尔会变回原来的值，退回之前派出去的活就又显得有效；时刻每次放行都不同，所以退回之前派出的活一律过期，只能重新派（新的简报带新的设计）。第二档（模块退回设计）让这个模块下在跑的活过期，第三档（目标退回设计）让整个目标下在跑的活过期，同时新派发被 `not_released` 拒绝、在跑的 worker 的写入被 `worker-scope` 拒绝（§3.2.1），三者合起来就是「受影响的活停下」（§3.9.7）。

派发批注的最后一行写 `pins: <id>@<摘要> <id>@<摘要> …`。`staleness(graph, pinsLine)` 返回变了的节点与变化（摘要不同、节点不在图里）。核对的时机：交回处理、派审查时、`check_commit` 读到尾注里的任务时、主干前进时、`answer_worker` 批计划时、派发状态提醒每次计算时。过期时：交回处理照记，但不建审查任务，主 Agent 收到 `stale` 通知（写明哪个节点变了）；派它的审查被拒（`brief_stale`）；`check_commit` 的结果写明过期的任务，主干前进时这些任务不写完成证据（内容进了主干也不算这件活做完）；正路是重新派发（新的简报）。主 Agent 在跑的 worker 过期时，通知里建议 `interrupt_agent` 后重新派发。

只用语义字段的理由：阅读摘要 §7 第 2 条的推荐 A 提到，修订号连无关的标题改动也会变，会带来误拒；只比验收、非目标与决策结果，误拒只剩真正改了意图的情形。

#### 3.5.4 并行与补位提醒

派发状态提醒（`src/execute/notice.ts`）：执行行经公共库的 `installStepNotice(agent, 'dispatch status', eligible, build, 'execute')` 给主 Agent 装一个 `agent/pre-step` 监听器（`eligible`：本步是主 Agent，且焦点所在的模块（焦点不在模块里时是焦点目标）的推出阶段为 `execute`、`merge` 或 `decompose`，或者目标下有模块被退回设计，§3.9.7）。正文（英文）只列有内容的项：在跑的 worker（任务、第几次、用时、最近一次请求）、等主 Agent 回应的请求（计划、问题，按等待时长）、过期的派发、丢失的派发（§3.9.6）、自动推进的状态（人暂停、清掉、阻塞的原因，§3.9.1）、两层循环的状态（被退回设计的模块或目标与受影响的 worker，第一档里主 Agent 自己定、还没告诉人的事，§3.9.7）、模型目录（每个进程第一次与目录变了时，§3.1.3）、空闲槽位数与可以开工的任务（前 5 个，按依赖序），可以开工且槽位空闲时末尾一句 `Free slots: <n>. Dispatch ready tasks with dispatch_task.`。注入规则用 M3 抽出的 `src/graph/digest-notice.ts`：压缩之后、目标轮、正文摘要变化时注入，其余不注入（K7：有条件提醒，不每轮重复）。

#### 3.5.5 经验板块的接缝（按 M5 设计 0.3 §8.1 的五处改）

经验板块是 M5 的 `lessons`。经验行不在时这几处什么都不做，行健康注明「经验板块未启用」。服务契约以 M5 的 `src/lessons/service.ts` 为准（`LESSONS_SERVICE = 'glmHournessLessons'`）：

- 进简报：派发时调 `relevant({session: 主 Agent 的会话, paths, tools, commands, limit: 5})`（`session` 是 M5 要的第 1 处改动，用来定位项目）。`paths` 是写入范围加已批计划的路径；`commands` 是 `norm-merge-gate` 的命令加计划各步的命令；`tools` 取 `['Write', 'Edit', 'Bash']` 与计划命令的首个词。返回的每条带 `line`（至多 300 字符），合计至多 1500 字符，渲染进上下文栏。`relevant` 从不 reject；超过 2 秒不等，派发照常，告警一次。
- 交回候选：交回结构的 `lessons` 每项可以带 `errors`（至多 5 项，每项 8–300 字符）与 `scope`（`project` 或 `all`），都不进 `required`（M5 第 2 处）。harness 对每项调 `propose(candidate, {session, task, childId, commit?})`，按结果分三路（M5 第 5 处）：`candidate`、`merged`、`dropped` 只在交回摘要里计数；`rejected` 不写任何批注，只在交回摘要里记「1 条候选经验被拒：<code>」，不带内容；返回 `{error}` 或服务不在时写退路批注 `[候选经验] <problem> → <fix> · {"files":[…],"commands":[…],"tools":[…],"errors":[…],"scope":"project"}`（M5 第 3 处），写之前每个字符串字段过一遍 `looksSecret`（`src/data/secret-shape.ts`），命中的整项换成「（像密钥，已略去）」。理由：图节点文件会提交并推到远端，写进去的令牌要改写历史才删得掉。
- 主动查询：`LESSONS_TOOL_NAMES = ['lessons_query', 'lessons_merge']`，常驻名单只加 `lessons_query`（M5 第 4 处）；所有 agent 都有 `lessons_query`。简报约束栏加一句 `When a command fails or a tool behaves unexpectedly, search the lessons board before working around it.`。
- 周报与巡检调 M5 的 `stats(session, since, until)` 与 `hygiene(session, now)`（M5 §4.9）；没有经验行时这两节不出现。

### 3.6 交回（m7-1、m7-4）

#### 3.6.1 结构

内置 schema `hourness-handback-v1`（`src/execute/schemas.ts`，只用 rc.3 `assertObjectJsonSchema` 认的子集：`type`、`properties`、`required`、布尔 `additionalProperties`、`items`、`enum`）：

```ts
{
  status: 'done' | 'blocked' | 'partial' | 'plan-pending'
  summary: string                                     // harness 截到 2000 字符
  commits: string[]                                   // 本次在分支上的提交号
  files: string[]                                     // 改过的文件，仓库相对路径
  checks: Array<{ command: string, exit: number }>    // worker 自报，不当证据
  questions: string[]                                 // 留给主 Agent 的问题
  assumptions: string[]                               // ask_main 超时后用的假设，及其他假设
  lessons: Array<{ problem: string, fix: string, files: string[], commands: string[], tools: string[],
                   errors?: string[], scope?: 'project' | 'all' }>   // errors 至多 5 项、每项 8–300 字符（M5 §8.1 第 2 处）
  report?: string                                     // 长报告的路径：工作树里的 .hourness/<childId>.md
}
```

审查用 `hourness-review-v1`：`{verdict: 'APPROVED' | 'CHANGES_REQUESTED', commit: string, findings: Array<{id, blocking: boolean, criterion: string, where: string, what: string, fix: string}>, checked: string[], lessons: [...]}`。

任务的 `outputSchema` 写了仓库内的文件时，harness 把内置的核心字段合并进去（`properties` 取并集、`required` 取并集；同名字段以内置为准），保证交回处理需要的字段都在。

#### 3.6.2 处理

worker 的 `result` 落定后（`{output, stopReason, structured?}`，subagent:1098–1117；`caller` 模式下由 harness 自己收，2049）：

1. `stopReason` 不是 `completed`（`aborted`、`error`、`max-tokens`、`refusal`）：批注「第 <n> 次结束：<原因>」，任务保持进行中；给主 Agent 送一条事实通知（§3.4.3 的 `handback` 事件），建议重新派发或在下一批里问人。
2. 有结构化结果：语义校验（提交号是 7–40 位十六进制且在分支上，`git merge-base --is-ancestor <基线> <提交>` 与 `git branch --contains`；文件是仓库相对路径）。校验不过的项记进批注，不丢整份交回。
3. 长报告：`report` 指向 `<工作树>/.hourness/<childId>.md` 时复制到 `<exec>/reports/<childId>.md`（工作树之后会删），批注里写后者。
4. 批注交回摘要：状态、提交数与最新提交、文件数、问题与假设各几条、通信计数（§3.4.4）、候选经验的计数（§3.5.5）、报告路径。
5. 候选经验按 §3.5.5 处理。
6. pins 过期 → `stale` 通知，停在这里。
7. `status: done`：读这次的改动（`git diff --no-renames --name-status <merge-base> <最新提交>`）与这次派发里 worker 一方跑过的命令记录（`<exec>/tasks/<任务>/<childId>.commands.jsonl`，§3.8.5 的格式），按 `norm-review-floor` 判命中（含判不了时从严），得出有效深浅（§3.7.1）。有效深浅不是不审：确保审查任务在，经 `emit` 交 `hourness.handback`；是不审：交 `hourness.review-skipped`（§2.5）。`blocked`、`partial`、`plan-pending`：事实通知给主 Agent，由它决定重新派发、改任务或问人。
8. 给主 Agent 的一行结论（例「task-3 第 1 次交回 done，提交 1a2b3c4（2 个），按轻审：等你派审查」）；整段结构化结果不进主 Agent 的上下文。指标流水记 `execute.handback`。

处理是幂等的：每一步先看图上有没有同一 `childId` 的对应批注，有就跳过，重启后的对账可以安全地重跑（§3.9.6）。

### 3.7 独立审查（m7-4）

#### 3.7.1 深浅、底线清单与派审查

深浅（`question-38` C，深浅的含义取 `norm-review-floor` 正文）：全审是「更强的模型对照验收逐条看」，轻审是「只扫改动」，不审是「只改文档、错字一类」。

- 主 Agent 在写任务的 `dispatch_task` 里定 `review`（缺省 `full`；`light`、`skip` 必须写 `why`），记在派发批注里。每一次派发都可以重新定。
- 底线清单的判定（`src/execute/floor.ts`，纯函数）：`parseFloor(node)` 从 `norm-review-floor` 的每一条验收里读出反引号里的判定写法（§3.8.5），返回 `{entries: [{index, text, tests}], unparsed: number[]}`：一条里一个判定写法都读不出、或写法写错，就进 `unparsed`。`floorHits(floor, change, commands)` 对一次改动给出命中：改动的文件落在 `files` 的路径里；改动里有删掉的文件而这一条写了 `deletes`；这次派发里 worker 一方跑过、或试过而被拦下的命令以 `commands` 列的词开头（被拦下的同样算，与 `outside` 一致：试过就要全审，评审 N8）；worker 一方的文件工具目标或 shell 命令里的绝对路径落在它的工作树以外而这一条写了 `outside`（被拦下的也算）。每种写法怎样从改动的路径与命令记录判，见 §3.8.5 的表。
- 判不了就从严（评审 F2）：`unparsed` 非空时（清单里有一条 harness 认不出），`floorHits` 对每一次改动都返回一个命中 `{index: <那几条>, reason: 'unparsed'}`，所以每件写任务的有效深浅都是全审，`hourness.handback` 的 `floorHit` 写 `unparsed`；派审查时 `depth: 'light'` 被拒，码 `floor_unparsed`，`hint` 列出判不了的条目原文与「the person has not given these lines a form the harness can judge; every task is fully reviewed until they do」。图里有 `norm-review-floor` 节点而图读不出、或节点在却一条验收都没有时，同样按判不了处理。图里没有这个节点（这个项目的人没批过底线清单）时没有命中，深浅照主 Agent 定的；设计阶段的提醒请主 Agent 在放行之前提议一张带判定写法的清单（§3.8.5 末段）。行健康与规则板上那几条旁边写「这几条还没有机器认得的写法，暂时每件都全审」。
- 命令记录：worker、审查者与它们派出的 agent 的每次 shell 调用与文件工具调用，`worker-scope` 与 `worker-git` 在 `tools/pre-execute` 里已经读了一遍；同一处按 §3.8.5 的格式追加进 `<exec>/tasks/<任务>/<childId>.commands.jsonl`（只记命令词与路径，不记输出）。写失败时这次派发记为「命令记录不全」，有效深浅一律按全审（宁可多审，不让判不了变成不审）。
- 有效深浅：有命中就是全审，批注「审查改为全审：碰到必须全审清单第 <n> 类（<文件或命令>）」，指标流水记 `execute.review-depth`（声明的、有效的、命中哪一类）；没有命中就是主 Agent 定的那一档。
- 审查任务：有效深浅不是不审时，harness 确保被审任务下有一个审查任务：标题「审查：<任务标题>」、`kind: review`、`writeScope: []`、`source` 指向被审任务、验收 `["verdict APPROVED under the docs/DEVELOPMENT.md §1.1 standard, at the depth recorded in the latest dispatch"]`（深浅写在每一轮的派发批注里，不写进验收：验收只有人能改）。以 `harness` 身份提议，挂在进行中的任务下，引擎直接批准（`initialStatus`，`engine.ts`:417–428）。一个实现任务一个审查任务，每一轮是它的一次派发。
- 派审查：主 Agent `dispatch_task {id: <审查任务>, model, why, depth?, depthWhy?}`。`depth` 可以比派活时定的深；比它浅要写 `depthWhy`；有命中时低于全审被拒（按条命中为 `floor_requires_full`，列出命中；清单判不了为 `floor_unparsed`）。审查者的工作目录是被审任务的工作树（只读，报告写 `.hourness/`），简报写被审的提交与基线、计划、交回摘要、上一轮的发现与这一轮的深浅：全审 `Check every acceptance item; "checked" must list every acceptance:<i> with the evidence you looked at.`；轻审 `Read the change; report only findings that meet one of the three blocking criteria, the rest as non-blocking.`。审查不占写任务的槽位。
- 全审的覆盖核对：全审的结论里 `checked` 没有覆盖每一条 `acceptance:<i>` 时，这一轮作废，harness 以同一个模型与理由重派一次（派发批注写「覆盖不全，重派」）；再不全就通知主 Agent，按 `blocked` 处理。
- 被审的提交：最近一次 `done` 交回的最新提交。审查通过时的证据 `{kind: 'check', ref: 'review <childId>', exit: 0, note: '<提交> · <全审|轻审> · patch <patch-id> · <provider>/<model>'}`，patch-id 取 `git diff <merge-base> <提交>` 经 `git patch-id --stable`。主干前进时核对底线清单内容用的就是这个提交（§3.8.4）。
- 不审：没有审查任务；主干前进时仍按底线清单核对（§3.8.4），所以「不审」碰不到底线清单里的内容。

#### 3.7.2 结论的规整

`normalizeVerdict(task, verdict)`（`src/execute/review.ts`）：挡路的发现（`blocking: true`）的 `criterion` 必须是下面三类之一，否则改为不挡路，并在批注里注明「改为不挡路：没有挂到三类标准上」：

| `criterion` | 含义（`docs/DEVELOPMENT.md` §1.1） |
| --- | --- |
| `acceptance:<i>` | 任务第 `i` 条验收没满足（`i` 必须是已有的下标） |
| `irreversible-loss` | 会造成不可逆损失（丢数据、毁掉检出或用户 profile、对外的动作）而没有预防 |
| `failure-plan` | 失败了没有途径发现、发现了没有恢复办法，或事后查不到原因 |

`verdict` 与规整后的发现不一致时（`APPROVED` 却有挡路的发现，或 `CHANGES_REQUESTED` 却一条都没有），以发现为准。`commit` 不是被审的提交时，这一轮作废，harness 以同一个模型与理由重派一次；再错就按 `blocked` 交主 Agent。

#### 3.7.3 收敛

审查任务上每轮批注一条 `第 <k> 轮：挡路 <b_k>，不挡路 <n_k> · <全审|轻审> · <childId>`，轮数与计数从这些批注读出（图是事实源）。计数从任务子树（被审任务、审查任务、挂在它们下面的待决）里最近一条人的历史条目（`actor: human`，或带 `relay` 的写入）之后算起（0.2 评审 F21）；`roundsSinceHuman(history)` 是审查、检查失败与目标整体的审查共用的一个纯函数，L2 钉住。

| 情形（`k` 为人的最近一条历史之后的轮数） | 处理 |
| --- | --- |
| `b_k = 0` | 审查任务以 `harness` 身份标完成，证据见 §3.7.1；被审任务已有进主干的 `commit` 证据（先合后审，§3.8.4）时，同时把它标完成；经 `emit` 交 `hourness.review-passed` |
| 子树里还没有过人的条目，`k ≥ 2` 且 `b_k ≥ b_{k-1}` | 停下（不收敛） |
| 子树里还没有过人的条目，`k = 3` 且 `b_k > 0` | 停下（三轮用完；`question-11` A 的第三轮就是这一轮） |
| 人回过话之后，第一轮仍有 `b_k > 0` | 停下（人给的是一轮，不是又一个三轮） |
| 其余 `b_k > 0` | 事实通知给主 Agent（§3.4.3 的 `review` 事件）：挡路的发现列表，建议 `dispatch_task <被审任务>`；新的一次派发的简报带这些发现。不挡路的发现批注在被审任务上 |

停下分两步：

1. 停下标记：这一轮的轮次批注末尾加 `· 停下`。简报门禁认它（§3.5.1 `waiting_human`）：标记之后任务子树里没有人的历史条目，就拒绝派发这个任务与它的审查任务。人在对话里的回话由主 Agent 用 M3 的 `record_human_answer` 记下（`llm` 加人的原话，引擎给它人的权限），这条写入就解除标记；人在面板上的写入同样解除。标记写不进图（引擎拒绝或 I/O 错误）时重试 3 次，仍失败就在内存里记 `ctx.stopped`，本进程内照样拒绝派发，行健康降级，图恢复可写后补写。
2. 发出 `hourness.stopped`：循环板的默认条目「停下之后」把事实与一份四行草稿交给主 Agent（§3.7.4），由它在对话里问人。harness 自己不写给人的待决，也不出选项（`d-chat-not-cards`）。

人回话之后做什么由主 Agent 按人的话做，harness 不替它回写：再修一轮就重新派；回到设计就带人的原话把目标的阶段改回 `design`（M3 的 `main-agent-graph` 第 2 条只拦向前改阶段）；问题只在一个模块里、要回到那个模块的设计时，把模块的阶段改回 `design`（第二档，不带原话，§3.9.7）；放弃就带人的原话把任务改为 `dropped`，它下面还开着的审查任务不用另关，完成门禁跳过祖先已废弃或被取代的任务（§3.9.3 第 1 条，0.2 评审 F22）。

同样的收敛规则用在三处：计划被 `checkPlan` 退回第 4 次（§3.3.2，worker 交回 `blocked`，不问人）；同一任务的 `check_commit` 因命令失败、在人的最近一条历史之后第 3 次没过（§3.8.3 第 9 步，标记写在任务上的检查失败批注里）；目标整体的审查（§3.9.4，标记写在目标上的轮次批注里）。

#### 3.7.4 要人定的事：交给主 Agent 去问

`askDraft(kind, facts)`（`src/execute/asks.ts`，纯函数）是 M7 里唯一写「要问人的事」的地方。它不写图，只产出两样交给主 Agent 的东西：事实（几轮、几处挡路、哪条命令、日志在哪、涉及哪些文件），与一份四行草稿 `{title, background, proposal, doubt, notTaken}`，主 Agent 可以照用，也可以按它知道的改。草稿在 L2 里必须过 M3 的 `proposalLineRefusal`（每行一处加粗、长度上限，M3 附录 §3.3）与 `plainWordsIn`（换词表，`src/graph/plain-question.ts`）。排版由 M3 的 `renderProposal` 做，格式再改只改 M3 一处（`d-chat-not-cards` 的批注：「把卡片显示规则放在一处」）。

| `kind` | 何时 | 草稿的推荐（只出一个方案） |
| --- | --- | --- |
| `review-stuck` | 审查停下 | 最后一轮挡路不超过 2 处：按这几处再修一轮；否则回到设计。「不做」一行写另一条与「放弃这件活」为什么不先选 |
| `check-stuck` | 检查第 3 次没过 | 带上三次失败的命令与日志再修一轮；「疑问」写「如果检查本身有问题，再修也白修」 |
| `acceptance-stuck` | 目标整体的审查停下 | 没过的条目不超过 2 条：拆成新活再做；否则回到设计 |
| `norm-ladder` | 周报里的规矩升降（§3.12.2） | 升级、转为真拦或降级，按数据给一个方向 |
| `floor-add` | 周报里降档后的返工集中在某类改动（§3.12.3） | 把这类路径加进「必须全审的改动」 |

例（`review-stuck`，最后一轮挡路 2 处）：

```text
title:      「写入范围的纯函数」审了三轮还没过
background: 审查**三轮都没过**，最后一轮还剩 2 处必须改的
proposal:   按这 2 处**再修一轮**，还不过就停下
doubt:      要是这件活的**要求本身不对**，再修也没用
notTaken:   不先**放弃这件活**，放弃了目标会少一块
```

交给主 Agent 的提醒（条目「停下之后」调 harness 动作 `execute.stop-draft`，这段文字是它结果里的 `tell`，英文；草稿要按图算，超出循环板占位的长度，所以不写成条目的固定文字，§3.11.1）：`<task> stopped: <k> review rounds, <b> blocking findings left (<files>). Put it to the person in your next batch with propose_to_human (kind question, parent <task>, sources [<review task>]); a draft that passes the checks: <五个字段>. Other work goes on. When everything left waits for the person, call await_human with the question ids.` 一次回复至多三件由 M3 的 `propose_to_human` 守（M3 附录 §3.4 第 4 条）；攒到哪一批由主 Agent 定（`d-design-onepage`：成批问，一次至多三题）。

主 Agent 用 `propose_to_human` 提的是挂在任务（或目标、规范）下的提议式待决，它在任务子树里，简报门禁同样按 `waiting_human` 拦，直到人回话。

#### 3.7.5 模块设计的独立评审（`d-design-onepage` 的小循环，0.6 起产品里做，R5-F4，改法 A）

来由：`d-design-onepage` 里人的话包括「每个模块的设计对照人定过的方向，违背即挡路」：每个模块先写设计、过一次独立评审，再写一页放行稿，人看过才放行。M3 附录 0.5 §3.14 末句把评审这一半交给 M7 的派发，M3 的门禁不核对评审做没做；M3 的 `moduleReleaseGate`（§3.14.3 七项）要在 M7 给出记录形状之后加一项。0.5 没有这个流程，现写法的门禁还会拒绝它（被审的是设计中的模块下的决策，派发会被 `not_released` 拒绝），评审 R5-F4 要求要么做、要么写明不做。编排方裁定做（改法 A）：不放弃，因为 `d-design-onepage` 里人定的流程包含这一步，放弃等于删掉人定过的东西。本仓库自举不受影响：本仓库的模块设计评审由 Kiro 工作流做，不走产品里的这条路。

**任务的形状。** 一个模块一个审查任务：`kind: review`、`writeScope: []`、`source` 连线指向这个模块下面直接挂着的设计决策（M3 附录 0.5 §3.14.3 第 4 条：模块自己的设计决策挂在模块下面；没有被废弃或取代的都连，至少一个），验收 `["verdict APPROVED against every item of norm-directions and every acceptance item of the module"]`（验收只有人能改，所以不写深浅，深浅固定为全审）。`isDesignReview(graph, task)`（`src/graph/execute-stage.ts`，纯函数）认这个形状：三项都成立，且连线指向的决策挂在某个模块下面。节点由 harness 建：主 Agent 调 `dispatch_task {id: <模块 id>, model, why}`（`id` 是模块；同目标整体的审查用目标 id 的做法），派发处在模块下以 `harness` 身份提议这个任务（已有就复用；提议幂等，按形状查）。M3 附录 0.5 §3.14.7 让挂在没放行的模块下的任务出生为 `proposed`，主 Agent 与 harness 都批不了，所以简报门禁对这一种形状也收 `proposed`（§3.5.1 `bad_task` 一行）。它只读，不会因此多出写权限。

**派得出去。** 简报门禁对它跳过模块层的 `not_released`，目标层照查（§3.5.1）。`waiting_human` 只看这个审查任务自己的子树，不看模块里别的待决；`busy`、`slots_full`（GLM 少做上限，审查也计）照常；`deps_open`、`scope_busy`、`bad_schema` 只管写任务，不适用。`nothing_to_review` 一行换成「设计决策都在、模块在设计中、目标有 `norm-directions`」。模块已放行（人已看过一页稿）时，再派这个审查得 `nothing_to_review`；模块被退回设计（第二档）后它回到设计中，可以再派。

**审查者。** 工作目录是主检出（只读，报告写它的 `.hourness/`，该目录被 `info/exclude` 忽略；`worker-scope` 对审查者只放行 `.hourness/`，§3.2.1 第 4 条），不建工作树、不跑准备命令。简报同形（§3.5.2）：目标栏写 `Review the design of module <id> "<title>" against the direction list`；上下文栏列出被审的设计决策（id、标题、选项与理由原文）、模块自己的验收与「不做什么」、模块下已有的规划（特性与任务的标题和验收），以及 `norm-directions` 的每一条，带编号 `direction:<i>`；约束栏写它什么也不写、只交报告；完成栏的交回是审查结论 `hourness-review-v1`。深浅固定全审：`checked` 必须覆盖每一条 `direction:<i>` 与模块的每一条 `acceptance:<i>`，覆盖不全这一轮作废，以同一个模型与理由重派一次，再不全按 `blocked` 交主 Agent（同 §3.7.1 的全审覆盖核对）。挡路的 `criterion` 在 §3.7.2 的三类之外多一类 `direction:<i>`（违背方向清单的第 `i` 条，`i` 必须是已有的下标）：这一类正是人定的「违背即挡路」；其余三类照旧（`acceptance:<i>` 指模块的验收）。模型由主 Agent 选并写理由（`d-main-agent-models`）。

**轮次与停下。** 同 §3.7.3：审查任务上每轮批注 `第 <k> 轮：挡路 <b_k>，不挡路 <n_k> · 全审 · <childId>`；挡路数不降、第 3 轮仍有挡路、人回过话之后第一轮仍有挡路，都停下（`· 停下` 标记写在审查任务上，由主 Agent 用 `review-stuck` 的草稿在对话里问人，§3.7.4）。`CHANGES_REQUESTED` 时主 Agent 按挡路的发现改设计（在模块下提议、改决策），再派下一轮。`b_k = 0` 时不标审查任务完成（`proposed` 的任务转不了状态，已放行后它也不是要合入的活，§2.4 `scopedTasks`、§3.9.3 第 1 条都不数它），也不交 `hourness.review-passed`（那一项的提醒说的是合入）；给主 Agent 的一行结论写 `Module <id> design review round <k>: APPROVED` 或 `CHANGES_REQUESTED, <n> blocking`。过期（交回时 pins 变了：模块或目标的放行时刻、模块的验收、决策被推翻）不写记录，通知主 Agent 重派。

**记录的形状（交给 M3，让 `moduleReleaseGate` 加第 8 项）。** 每一轮审查在交回处理里（幂等：先看模块上有没有含同一 `childId` 的记录）以 `harness` 身份在模块节点上批注一行，格式固定：

```text
设计审查 · <childId> · <APPROVED|CHANGES_REQUESTED> · 方向清单 <digest> · 挡路 <n> · 派出 <at>
```

正则 `^设计审查 · (\S+) · (APPROVED|CHANGES_REQUESTED) · 方向清单 ([0-9a-f]{12}) · 挡路 (\d+) · 派出 (\S+)$`，分隔符是「空格 U+00B7 空格」（同 M7 其余批注）。字段：`childId` 是这一轮审查的派发号（§3.1.2 第 5 步），能连到审查任务上的派发批注与会话日志；裁决是 `normalizeVerdict` 规整之后的，`APPROVED` 当且仅当 `n = 0`；`digest` 是 `norm-directions` 此刻的每一条验收各自去掉首尾空白、以 `\n` 连接后的 UTF-8 文本的 SHA-256 的前 12 位小写十六进制（审查对照的是哪一份方向清单）；`n` 是规整之后挡路发现的条数；`at` 是这一轮派出的时刻（ISO 8601，与节点历史里的 `at` 同格式，取派发批注的 `at`），不是写记录的时刻，用它而不用批注自己的 `at`，审查期间改了设计的情形才不会被当成「评审之后没改」。M7 保证写这一行；M3 的第 8 项要的条件（措辞归 M3，M7 请求）：模块上按批注的 `at` 取最新一条这样的记录，裁决是 `APPROVED`、`n` 为 0、`digest` 等于此刻 `norm-directions` 按上面的算法得出的值，并且模块、模块放行集合（`moduleSet`）里的节点、`norm-directions` 在记录的 `at`（派出时刻）之后没有 `comment` 以外的历史条目。没有这样的记录时，检查不通过，`hint` 写 `Dispatch the design review of module <id> with dispatch_task (id = the module), fix what it blocks on, and ask again.`。记录形状在 E4 合入之前交给 M3（`graph-ops-v06.json` 给 `m3` 的批注）；M3 的第 9 步实现这一项，E8 里与模块放行有关的部分本来就等它（§8.3）。

**失败与边界。**

| 情形 | 处理 |
| --- | --- |
| 模块下没有设计决策，或目标没有 `norm-directions` | 派发被拒：`nothing_to_review` 或 `no_directions`，`hint` 说明先补哪一样；不起子 agent |
| 在模块下提议审查任务失败（引擎拒绝、I/O 错误） | 重试 3 次（每次重读修订号，间隔 200、800、2000 毫秒）；仍失败时派发被拒，`hint` 写原因；不留半个任务 |
| 记录写不进图 | 同 §3.6.2 第 10 步的批注：重试 3 次，仍失败时行健康降级，内存里记 `ctx.designReviews` 让后面的提醒照实说「评审通过但记录没写进图」；M3 的检查读图，所以放行页提不出去，主 Agent 收到提醒后重派一轮，直到写成 |
| 读不出模块的结构 | 同 §3.5.1：分了模块的目标下一件也派不出去，包括这个审查（失效时拒绝，R5-F3） |
| 审查期间模块被放行或退回 | 交回按过期处理（pins 里的 `releaseAt` 变了），不写记录 |

可测性：`isDesignReview`、形状识别、简报门禁的跳过（设计中的模块下的审查派得出去，同一个模块下的普通任务派不出去，目标没放行时审查也派不出去，`proposed` 只对这一种形状放行）、记录的格式与正则、`digest` 的算法、`nothing_to_review` 与 `no_directions` 在 L2 直接测（`tests/execute-modules.spec.ts`）；`glm-exec-modules` 在 L3 里走一遍：设计中的模块，审查派出、`CHANGES_REQUESTED`、修改、再审 `APPROVED`、模块上有两条记录，最新一条的 `digest` 与方向清单对得上。

### 3.8 合进主干前的检查与主干前进的核对（m7-5）

`d-main-agent-shell` 的分工：合并、先后、冲突、回退都是主 Agent 的 git；harness 只守主干前进的那一刻，并且自己跑检查、自己记证据。M7 由此有两样东西：主 Agent 调用的 `check_commit`（harness 在一个确定的提交上跑 `norm-merge-gate`），与执行边界上的 `trunk-advance-checked`（主干只能前进到检查过的提交）。0.2 的「门禁替主 Agent 压缩、快进、推送」与 `merge_task` 删去。

#### 3.8.1 检查清单写在哪：规范节点 `norm-merge-gate`

每张图一个规范节点，id 固定为 `norm-merge-gate`，命令写在它的 `acceptance` 里，每条一项；验收只有人的权限能改，所以清单变松要人同意（`docs/ORCHESTRATION.md` §7.6）。`parseGateNorm(acceptance)`（`src/execute/gate-norm.ts`，纯函数）认下面的写法，其余条目是说明文字，原样显示；导出 `GATE_LINE_FORMS` 供接管项目只提它认的写法（接管设计 §5.6 的 `changed` 写法由接管的 `bootstrap-ratchet` 加进这里）：

| 写法 | 含义 |
| --- | --- |
| `` `$ <命令>` `` | 检查命令，总是跑，按列出的顺序 |
| `` `$ <命令>` when <路径>[, <路径>…] `` | 改动碰到这些路径（写法同 `writeScope`）时才跑 |
| `` `setup $ <命令>` ``、`` `setup $ <命令>` when <路径>[, …] `` | 准备命令：新建工作树之后跑；监视文件（`when` 的路径，缺省 `package.json`、`package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`yarn.lock`）的摘要变了就再跑 |
| `` `patrol $ <命令>` `` | 只在夜间巡检里跑 |
| `` `push` `` | 主干前进之后推送、不强推。推送是主 Agent 的 git：harness 在核对通过的提醒里写上这一句，巡检报出没推上去的主干 |
| `` `only <路径>[, <路径>…]` ``（0.3 新加） | 两层含义，都写进 §13 ② 给人看（评审 N1）：（一）一次主干前进只改了这些路径时，不用跑命令：harness 核对改动确实只在这些路径里，记为通过；（二）两个提交只差这些路径时，一个的检查结果对另一个同样算数，所以主干可以前进到一个本身没被检查过、只比检查过的那个多改了这些路径的提交（§3.8.4）。第二层留着：任务提交检查之后，主 Agent 常在同一个提交上补记图文件，没有它每记一次图都要重跑全部命令。两层的风险相同：这些路径里的文件写坏了，要等合入后的全量检查（§3.11.1）才发现 |

清单的摘要 `normDigest`：解析出的条目按次序写成规范化的 JSON，SHA-256 的前 12 位十六进制。检查记录带它；清单改了，旧的检查记录对新的主干前进不再算数。

本仓库的 `norm-merge-gate` 已由人批准（2026-10-29「B」）；加 `only docs/graph/` 一条要人同意（§13 ②）。别的项目里，图上没有 `norm-merge-gate` 时，M3 的设计阶段提醒加一句「Before release, propose norm-merge-gate under the goal: read the project's build and test setup and list each command as `$ <command>`.」，让它随放行一起被人同意（同 0.2；M3 的放行集合是目标子树里的全部提议，`src/graph/stage.ts` `releaseSet`）。图上没有它、或一条命令都解析不出时，`check_commit` 拒绝（`no_gate_norm`）；主干前进的核对同样不过，拒绝写明正路。

命令经 `child_process.spawn(command, {shell: true, cwd})` 运行（命令文本来自人批过的规范；Windows 上 `npm` 是 `.cmd`，要经 shell）。每条上限 30 分钟，超时结束整棵进程树（Windows 用 `taskkill /T /F /PID`）。输出写日志文件，不进内存全文。

#### 3.8.2 `check_commit` 与运行方式

参数 `{commit: string}`（提交号或能解析成提交的引用名）；输出 `{commit, status: 'started' | 'already-passed' | 'passed-by-paths', job?, tasks}`。只有主 Agent 能调。

检查作为外部后端的子 agent 运行（本包注册的 provider `hourness-gate`，同 0.2 §3.8.2：`registerProvider`，subagent:3256–3267；能力全为否，2789–2794；`start` 返回 `{id, result, dispose}`，1768–1790）：`subagents.startActivation({provider: 'hourness-gate', label: 'hourness check <短号>', request: {prompt, parent: 主 Agent, cwd: 仓库根}, signal, delivery: 'caller'})`。驱动器等它（`waitForChildren` 等外部激活的 `result`，subagent:1305–1307），人按停止或 `interrupt_agent` 能停它，主 Agent 这一回合不被占住。没在 L3 跑过（§15 U2）；不成立时 `check_commit` 在工具调用里同步跑，行健康记「检查以同步方式运行」。

#### 3.8.3 一次检查的步骤

门禁锁：一个仓库同时只有一次检查或主干全量检查在用门禁工作树。锁文件 `<exec>/gate.lock`，用 `src/data/lock.ts`（`withFileLock`，契约取 M5 §5.3、§8.3，模块由 E3 建：独占创建、内容带 `pid`、`boot`、`token`、`holder`；`boot` 与本机当前开机时刻相差超过 120 秒判为陈旧；释放时只删 `token` 是自己的锁）。M7 用它的参数：等待每 5 秒一次、至多 60 分钟，之后 `gate_busy`；持锁的最长时间 6 小时，超过判为陈旧（高于最长的一次检查，0.2 评审 F24）；陈旧的锁改名为 `.stale-<毫秒>` 留着。`src/data/lock.ts` 由 E3 建（编排方对 R4-F9 的裁定，取代 M5 §8.3 的「先合入的一方建模块」：M5 不在自举路径上），M5 实施时导入它。headless、探针与另一个桌面版进程都受这把锁约束。

| 步 | 做什么 | 不成立时 |
| --- | --- | --- |
| 1 | 解析：`git rev-parse --verify <commit>^{commit}` 得到全号 `C`；读 `norm-merge-gate`，算 `normDigest`；`<exec>/checks.jsonl` 里已有 `C` 在同一个 `normDigest` 下通过的记录时返回 `already-passed` | `not_commit`、`no_gate_norm` |
| 2 | 改动：`mb = git merge-base <主干> C`，`paths = git diff --name-only mb C`。`paths` 全在 `only` 路径里时直接写一条 `kind: 'only'` 的通过记录，返回 `passed-by-paths` | — |
| 3 | 这次检查覆盖哪些任务：`mb..C` 里提交信息尾注 `Hourness-Task:` 的值（`git log --format=%H%x00%(trailers:key=Hourness-Task,valueonly,separator=%x2C) mb..C`），列进结果；一个都没有时照样检查，结果里写「没有任务尾注：进主干之后不会记到任何活上」 | — |
| 4 | 取门禁锁；起外部激活（§3.8.2），返回 `started` | `gate_busy` |
| 5 | 门禁工作树 `.worktrees/hz-gate`（只建一次，分离头指针）：确认它在 `git worktree list` 里且是分离头指针；`git status --porcelain --untracked-files=normal` 显示已跟踪文件有改动、或有没被忽略的新文件时，先调 M3 的 `takeSnapshot(<门禁工作树>, {sub: 'reset', args: ['--hard']}, 'discard')` 存一份快照（评审 N5，与别处的快照同一套：`refs/hourness/snapshots/<id>` 与 `snapshots.jsonl`），存不了就拒绝（`gate_snapshot_failed`，不重置）；然后 `git checkout --detach --force C`、`git reset --hard`、`git clean -fd`（保留被忽略的 `node_modules` 与产物）。这三条破坏性命令只对这个由 harness 建、由 harness 写的目录执行；主 Agent 动过它（git 是它的）时，对不上就拒绝，不重置 | `gate_worktree_invalid`、`gate_snapshot_failed` |
| 6 | 门禁工作树新建过、或监视文件的摘要与 `<exec>/gate-setup.json` 记下的不同时，先跑准备命令并更新记录 | `setup_failed`（不计入失败次数） |
| 7 | 按顺序跑适用的命令：`$` 总跑；`when` 在 `paths` 碰到它的路径时跑；第一条失败就停 | `failed`（命令、退出码、日志最后 40 行、日志路径） |
| 8 | 写记录：先写 `<exec>/checks/<C>/<时间>/result.json`（`{commit, tree, normDigest, base, mergeBase, ran: [条目序号], commands: [{line, exit, ms, log}], passed, tasks, at}`）与各条日志，再在 `<exec>/checks.jsonl` 追加一行 `{commit, tree, normDigest, ran, passed, tasks, at, result, resultDigest}`（`resultDigest` 是 `result.json` 的 SHA-256），`fh.sync()`。放锁 | 写失败：结果当作没有检查，通知主 Agent 重试；行健康降级 |
| 9 | 通知主 Agent（§3.4.3 的 `check` 事件）：通过时「`<C>` passed the merge checks (<n> commands). Fast-forward <主干> with `git merge --ff-only <C>` in the main checkout<；then push without --force>.」；没过时写命令、退出码、日志最后 40 行与路径，并给 `tasks` 里每个任务批注 `检查第 <n> 次没过：<命令> exit <码> · <日志路径>`；同一任务在人的最近一条历史之后第 3 次没过时，这条批注末尾加 `· 停下` 并发出 `hourness.stopped`（§3.7.3）。指标流水记 `execute.check` | — |

检查记录只由 harness 写：路径在 `<exec>/` 下，worker 的写入范围出不了自己的工作树，主 Agent 没有写文件的工具、shell 写入由 M3 的 `main-agent-no-write` 兜底；核对时同时要 `checks.jsonl` 的一行与它指向的 `result.json`，且摘要相符。剩下的风险（用一条认不出的 shell 写法伪造两份文件）记在 §6.5。

#### 3.8.4 `trunk-advance-checked`：主干前进的那一刻

主干是自动推进开始时主检出所在的分支，记在目标上的「自动推进已开始」批注里（§3.9.1），之后不随主 Agent 在主检出里切分支而变；没有这条批注时取上游的默认分支（`refs/remotes/origin/HEAD`），再没有就取主检出当前的分支。

两个引用都当主干看（评审 F1）：本地主干 `L = refs/heads/<主干>`；远端跟踪引用 `T = refs/remotes/<上游>/<主干>`，`<上游>` 取 `git rev-parse --abbrev-ref --symbolic-full-name <主干>@{upstream}` 的远端，没有时取 `origin`，仓库没有远端时只有 `L`。`T` 在本地、主 Agent 改得了，所以它不能当「别人已经推上去」的证明；它的用处是两样：本机推送成功时 git 会把它挪到推上去的值，harness 据此发现被推上去的主干；拉取时它是拉来的那一份。harness 的每一次 git 调用（`src/execute/git.ts`）都带全局选项 `--no-replace-objects`，`git replace` 因此不能让 harness 看到的内容与真实内容不同。

适用：主 Agent 与它派发链里所有 agent 的 shell 调用（`Bash`、`bash`、`pwsh` 的 `command`，`terminal_send` 的 `text`，原生名经 `toNativeTool`）。执行行在 `tools/pre-execute` 与 `tools/post-execute` 上各注册一个监听器（tools:3321、3595–3624；`post-execute` 能拿到同一个 `exec`，按 `exec.callId` 配对，1267）。

允许本地主干从 `O` 前进到 `N`（`advanceOk(O, N)`，`src/execute/advance.ts` 纯函数，git 事实由参数给），没有别的例外（0.3 的「`N` 已在上游的主干上」一条删去：那是本地引用，能伪造，而且让拉来的提交绕过了检查）：

1. `N` 是 `O` 的祖先（回退；会改写历史，M3 的快照先存了）。回退不写证据。
2. 否则必须同时满足：
   - 检查：`checks.jsonl` 里有一条通过的记录 `R`，`R.normDigest` 等于当前清单的摘要，`R.commit` 与 `N` 只差 `only` 路径（通常 `R.commit` 就是 `N`），并且 `O..N` 碰到的 `when` 命令在 `R.ran` 里都跑过；或 `O..N` 的改动全在 `only` 路径里。
   - 底线清单：`O..N` 里落在某一条 `files` 路径里的每个文件 `f`，有一次通过的全审，它审的提交 `Rv` 里 `f` 的内容与 `N` 里一样（`git rev-parse Rv:f` 等于 `git rev-parse N:f`）；有 `deletes` 的那一条，`O..N` 删掉的每个文件在某次通过的全审里也是被删的（`Rv` 里没有、`Rv` 的 merge-base 里有）；尾注里的任务，若它最近一次派发的命令记录命中了 `commands` 或 `outside`，它最近一次审查是通过的全审。按内容核对，而不是按「哪个任务审过」：主 Agent 怎样压缩、变基、解冲突都可以，只要进主干的底线内容就是全审看过的那一份。
   - 清单判不了时从严（评审 F2，§3.8.5）：`parseFloor` 的 `unparsed` 非空时，上一条对 `O..N` 改到的每个文件都适用（当作每个文件都落在 `files` 里、每个删除都落在 `deletes` 里），只除两类：项目图目录里的文件（只能经图工具写，`graph:graph-files-only` 拦其余写法，引擎每次写入都校验）与 `only` 路径里的文件。尾注里的每个任务的最近一次审查都要是通过的全审。
   - 拉来的内容（评审 F1 的后果，agent 定）：`O..N` 里的提交在这次前进之前已经由一次真正的拉取进了 `T`（`advances.jsonl` 有 `{ref: 'remote', by: 'fetch'}` 的一行，它的 `to` 包含这个提交），并且不在本机任何一次没检查过的推送（`{ref: 'remote', ok: false}`）的范围里时，这些提交改到的文件不要求全审，检查一条照样要求。理由：这些是别人或人自己在别处推上去的，这台机器上没有人派过审查，要求全审就永远拉不进来；它们仍要过这台机器上 harness 跑的合入前检查。这样放过的文件写进 `advances.jsonl` 的 `incomingFloor`，晨报的「例外」一节列出「拉来的提交改了必须全审的文件，没在这台机器上全审：<文件>」。

允许把上游的主干从 `T` 推到 `N`（`pushOk(T, N, records)`，同一个文件里的纯函数），三条之一：`N` 是 `T` 的祖先或就是 `T`（回退或没动；强推由 M3 的快照先存）；`advances.jsonl` 里有一条成立的本地主干前进（`ok`，或之后补检查通过的「检查在前进之后」）的 `to` 就是 `N`，也就是推的正是本地主干经核对到过的某个状态；或 `advanceOk(T, N)` 成立。推一个任务分支、或本地主干两次前进之间的某个中间提交，三条都不成立。

执行前（`tools/pre-execute`）：用 M3 的 `gitInvocations` 读出命令里的 git 调用，按目标仓库的状态判：

| 写法 | 判定 |
| --- | --- |
| 本地主干、结果可预知：`merge --ff-only <rev>`、`reset [--hard\|--keep\|--merge\|--soft] <rev>`（主检出在主干上时）、`branch -f <主干> <rev>`、`update-ref refs/heads/<主干> <rev>`、`checkout -B`/`switch -C <主干> <rev>`、`fetch . <rev>:<主干>`（`:refs/heads/<主干>` 同） | 解析出 `N`，`advanceOk(O, N)` 不成立就拒绝 |
| 本地主干、结果可预知的另四种写法（E3-9，表后说明）：`push . <rev>:<主干>`（`:refs/heads/<主干>` 同；`.` 换成本仓库自己的路径或 `file://` URL 同）；`branch -M <x> <主干>`（`-m` 加 `-f`、`--move --force`、`-C` 同；只给一个名字时 `<x>` 是当前分支，`N` 是 `<x>` 的顶）；`worktree add -B <主干> <路径> <rev>`；`pull . <rev>:<主干>` | 与上一行相同：解析出 `N`，`advanceOk(O, N)` 不成立就拒绝 |
| 本地主干、要先拉取才知道结果：主检出在主干上时的任何 `pull`（含 `--ff-only`）；从远端或本地路径 `fetch` 进本地主干的 refspec（`fetch <远端> <src>:<主干>`）；E3-9：refspec 目标是主干、源是远端或别的本地路径的 `pull`，不论主检出在不在主干上（`pull <远端> <src>:<主干>`） | 拒绝。正路是三步：`git fetch <上游>`；`check_commit <上游>/<主干>`；通过后 `git merge --ff-only <上游>/<主干>` |
| 远端跟踪引用 `T`：`update-ref`（含 `-d`）指向它；`fetch` 的 refspec 目标写进 `refs/remotes/` 下（不论来源是远端、`.` 还是本地路径）；`symbolic-ref` 指向它；`branch -r` 加 `-d`、`-D`、`-f`、`-m`、`-M`；E3-9：目的地写进 `refs/remotes/` 的 `push`，推到 `.`、本仓库自己的路径或 `file://` URL（`push . <rev>:refs/remotes/<上游>/<主干>`） | 一律拒绝。正路：`git fetch <上游>` 不带 refspec，由 git 按配置更新它 |
| 写主干本身的符号引用（E3-9）：`symbolic-ref refs/heads/<主干> <ref>`（上一行的 `symbolic-ref` 是指向 `T`，这一条是把 `<主干>` 自己写成指向 `<ref>`） | 一律拒绝，没有正路，harness 自己也用不到：写成符号引用之后 `<ref>` 每前进一次主干就跟着前进，而之后的那些调用里没有一次写到主干的名字，判定从此看不见它 |
| 推送：`push <上游> <rev>:<主干>`、`push <上游> <主干>`、主检出在主干上时不带 refspec 的 `push`、`push --force`/`--force-with-lease` 加上面任一种；远端写成 URL 时，URL 规整后等于 `<上游>` 的 URL（`git remote get-url`）的算同一个 | 解析出 `N`（`<rev>` 或本地主干的值），`pushOk(T, N)` 不成立就拒绝。`push --all`、`--mirror` 推到 `<上游>` 时拒绝（正路：按名推主干）。推到别的远端或别的分支不管；推到本仓库自己不在此列，按上面「本地主干」与「远端跟踪引用」两行判（E3-9） |
| 主检出在主干上、结果预知不了：`commit`、不带 `--ff-only` 的 `merge`、`rebase`、`cherry-pick`、`revert`、`am` | `commit` 且暂存的改动（`-a` 时取已跟踪文件的改动、带路径时取这些路径）全在 `only` 路径里：放行（执行后再核）。其余拒绝 |
| 别的 | 放行，交给执行后的比对 |

标 E3-9 的写法和行答复 E3 的独立评审（`review-e3.md` 发现 E3-9）。评审在临时仓库里逐条跑过：主检出在另一个分支 `feature` 上时，`git push . feature:main`、`git branch -M feature main`、`git worktree add -B main ../wt feature`、`git pull . feature:main`、`git symbolic-ref refs/heads/main refs/heads/feature` 各自把 `L` 挪到了没检查过的 `feature` 提交；`git push . feature:refs/remotes/origin/main` 把 `T` 挪了，真正的远端没动。原表漏它们的原因：`pull` 一行只管主检出在主干上的情形，refspec 一行只写了 `fetch`，推送各行只管上游远端。执行后的比对仍会在事后发现这六条（走「不成立」一支，`T` 一支按推送判），所以缺的是预防，不是发现。上面各行的判定就是这六条的判定。代码和用例落在 E1b（写法分类，输入是解析好的 git 调用）与 E7（执行前监听器，拒绝用例和「今天必败」断言）；E3 的 `src/execute/git.ts` 不分类写法。

拒绝的纠偏（四段）：事实 `<主干> would move from <O> to <N> without a passed merge check (<缺什么>).`（推送写 `<上游>/<主干> would be pushed from <T> to <N> …`；改跟踪引用写 `<上游>/<主干> is the harness's view of the published main branch; only git fetch updates it.`）；越界 `The main branch moves only to a commit the harness checked.`；正路 `Build the commit off the main branch (for example in the task's worktree), run check_commit <commit>, then fast-forward <主干> with git merge --ff-only <commit>.`，拉取时写上面的三步，底线清单不满足时另写 `dispatch a full review of the task that changed <f>`；例外 `none`。进违规流水，规则 id `execute:trunk-advance-checked`。

执行前放行时（R4-F4，2026-11-04 随 E7 补）：本地主干的前进结果可预知、`advanceOk(O, N)` 成立时，调用 `next()` 之前按 `exec.callId` 把 `{branch, from: O, to: N}` 记在内存里，`post-execute` 或 60 秒后删；规则板经 `glmHournessExecute.trunkAdvanceFor(callId)` 读它。执行行的这道门与执行边界规则都装在规则板的门之外（后装的 `prepend` 在外层），被拒的调用到不了规则板。

执行后（`tools/post-execute`，成功与失败的调用都看）：重读 `L` 与 `T`。都没变就什么都不做。`T` 变了见下面「远端跟踪引用变了」一段。`L` 变到 `N'`：

- `advanceOk(O, N')` 成立：在 `<exec>/advances.jsonl` 追加 `{ref: 'local', from: O, to: N', agent, callId, check: R.commit | null, only, tasks, incomingFloor?, at, ok: true}`（回退时 `check` 为 `null`、`tasks` 为空）；对 `O..N'` 里尾注出现的每个任务，以 `harness` 身份写证据 `{kind: 'commit', ref: <带尾注的那个提交>}` 与 `R` 的每条命令一条 `{kind: 'test', ref: <命令>, exit: 0, note: '<日志路径>'}`（只按路径通过时写一条 `{kind: 'check', ref: 'only <路径>', exit: 0}`），批注「进主干 `<N'>`（从 `<O>`）· 检查 `<R.commit>`」。状态是否转为完成另看审查（评审 N4）：任务最近一次派发的有效深浅为不审，或它的审查任务已完成（审查通过，§3.7.3），才从已批准或进行中转为完成；否则状态不动，批注末尾加「· 审查还没过，过了再记完成」，指标 `execute.advance` 的 `reviewPending` 记这些任务。审查之后通过时（§3.7.3 `b_k = 0` 一行），harness 看被审任务已有进主干证据，就在同一处把它标完成。任务没有派发批注（不是经 `dispatch_task` 做的）时同样不转完成，批注写「没有派发记录：主 Agent 确认之后可以 graph_status 它」。任务已经完成的只批注。任务的工作树干净就 `git worktree remove`（不带 `--force`；分支留着，删不删由主 Agent 定）。经 `emit` 交 `hourness.trunk-advanced`；指标流水记 `execute.advance`。写图失败重试 3 次，仍失败行健康降级，`advances.jsonl` 里已有全部事实，对账与巡检会补写（§3.9.6、§3.11.2）。
- 不成立（执行前没认出来的写法，例如脚本里的 git）：不写任何证据；违规流水记一条（`execute:trunk-advance-checked`，`effect: 'detected-after'`），`advances.jsonl` 记 `{ref: 'local', from: O, to: N', ok: false, missing}`，记复盘，指标流水记 `execute.unchecked-advance`；通知主 Agent：`<主干> moved from <O> to <N'> without a passed merge check (<缺什么>). No evidence was recorded. Run check_commit <N'>; if it fails, fix or revert on the main branch.`。之后 `check_commit <N'>` 通过时，harness 按上一条补写证据，批注与 `advances.jsonl` 写明「检查在前进之后」，晨报的「例外」一节列出它。这样做而不要求把主干退回去：主干可能已经推送，退回去要强推，那是收不回的动作；前进之后补的检查让主干的内容有据可查，次序上的违规留在违规流水、复盘与晨报里。

远端跟踪引用变了（`T` 从 `T0` 到 `T'`）：读 `git reflog show --format=%gs -n 1 <T>` 的说明，按这次调用里 `gitInvocations` 读出的命令判：

- 说明以 `fetch` 或 `pull` 开头，且这次调用里有对 `<上游>` 的 `fetch` 或 `pull`（按名或规整后相同的 URL）、没有推送：是一次真正的拉取。`advances.jsonl` 记 `{ref: 'remote', by: 'fetch', from: T0, to: T', at}`，不写证据、不算违规；拉来的提交要进本地主干，照上面的三步走（检查之后快进）。
- 其余（说明是 `update by push`，或认不出是哪种）：按推送判。`pushOk(T0, T')` 成立：记 `{ref: 'remote', by: 'push', from: T0, to: T', ok: true}`。不成立：已发布的主干上有了没检查的提交，同本地一支的「不成立」处理（违规 `effect: 'detected-after'`，`{ref: 'remote', ok: false, missing}`，复盘，`execute.unchecked-advance {ref: 'remote'}`），通知写 `<上游>/<主干> was pushed from <T0> to <T'> without a passed merge check (<缺什么>). The published main branch now carries unchecked commits. Run check_commit <T'>; if it fails, fix forward on the main branch, or tell the person before any force-push.`；经 `emit` 交 `hourness.outside-advance`（`files` 为 `T0..T'` 的改动），让合入后的全量检查在这个提交上跑一遍。之后 `check_commit <T'>` 通过时补写「检查在前进之后」。这样在命令之后马上发现的，是写在脚本里、经远端名或同一 URL 的推送（git 推送成功时会更新 `T`）；推到另一个写法的 URL、或推完又把 `T` 改回去的，由夜间巡检对照真正的远端发现（§3.11.2 的「主干」一行）。说明可以被 `update-ref -m` 伪造：伪造成拉取的推送记成 `by: 'fetch'`，而它的提交之后要进本地主干时仍要先检查，巡检也会把它列为「上游主干上没有检查记录覆盖的提交」。

每一步开始时再比一次：执行行给主 Agent 装的 `agent/pre-step` 监听器读 `L` 与 `T`，与上一次记下的值（上一次执行后比对或上一步记的）不同，而这段时间里没有哪次执行后比对认领这次变化时：变化落在某次 agent 的 shell 调用期间（执行后比对没有触发，§15 U20）按上面的「不成立」一支或远端跟踪引用一段处理；没有落在任何 agent 的调用期间（人自己在终端里提交、拉取或推送、别的工具）记 `advances.jsonl` `{ref, by: 'outside'}` 与指标 `execute.advance {external: true}`，不算违规、不给证据，经 `emit` 交 `hourness.outside-advance`（本地主干变了时），巡检汇总（§3.11.2）。人自己动主干是人的事（`docs/CHARTER.md` §6），harness 只记下来、跑一遍全量检查。

代价：主 Agent 与派发链里的每次 shell 调用前后各一次、主 Agent 每一步一次 `git --no-replace-objects rev-parse refs/heads/<主干> refs/remotes/<上游>/<主干>`（`execFile`，不经 shell）；远端跟踪引用变了时多一次 `reflog`。

规则板的代码规则目录登记 `execute:trunk-advance-checked`（规则板设计 §10.1、§10.7）。

#### 3.8.5 底线清单的判定写法（`norm-review-floor`）

`norm-review-floor` 的每条验收是一类改动的人话描述（接管设计 §5.7 定的形状：类名加冒号，后面是具体的路径或动作）。验收只有人的权限能改，所以判定写法也写在验收里，主 Agent 改不松它。

怎样读出写法（`parseFloor`）：一条验收末尾连着的若干个反引号段（段与段之间只有空白）是这一条的判定写法，前面的文字（含其中的反引号）是人话。每一段必须以下表四个词之一开头、合下表的写法；有一段以别的词开头、或写法不合（路径是绝对路径、含 `..`、含 `*?[` 一类通配、列表为空），整条记为判不了，不跳过那一段。一条可以有几段，任一段命中就算这一条命中。

判定的输入，两样，都由 harness 自己取，不用 agent 报的：

- 改动的路径：交回时取 `git diff --no-renames --name-status <merge-base> <最新提交>`，主干前进时取 `git diff --no-renames --name-status O N`（`--no-renames`：改名算删掉旧路径加新增新路径，往严一侧算）。
- 跑过的命令：这次派发里 worker 一方（worker 与它派出的 agent）每一次 shell 调用与文件工具调用，在 `tools/pre-execute` 里由 `worker-scope` 与 `worker-git` 读过之后追加进 `<exec>/tasks/<任务>/<childId>.commands.jsonl` 的一行：`{at, agent, tool, simple: [[词…]…] | null, git: [{sub, args}], paths: [<解析后的绝对路径>], writes: boolean, verdict: 'allowed' | 'refused'}`。`simple` 是 M3 `simpleCommands` 拆出的每个简单命令的词（命令名取小写、去掉 `.exe`、`.cmd`、`.ps1` 后缀）；拆不开时为 `null`。`git` 是 `gitInvocations` 读出的子命令与参数（去掉 `-C`、`-c`、`--git-dir` 一类全局选项）。`writes` 是 M3 判写（文件工具的写、file-tools-only 判为写文件的 shell 命令）的结果。只记命令词与路径，不记输出。被拦下的调用同样记（`verdict: 'refused'`）。

| 写法 | 命中条件（逐行判） | 判不了时 |
| --- | --- | --- |
| `` `files <路径>[, <路径>…]` `` | 改动的路径（新增、修改、删除、类型改变都算）有一个落在列出的路径里。路径相对仓库根；以 `/` 结尾的是目录前缀，按段比较（`src/guard/` 包含 `src/guard/a.ts`，不包含 `src/guardx/a.ts`）；不以 `/` 结尾的只是那一个文件。Windows 上比较不分大小写（多算不少算） | 改动读不出（git 出错）：命中 |
| `` `deletes` `` | 改动里有一行是 `D` | 同上 |
| `` `commands <命令>[, <命令>…]` `` | 每个 `<命令>` 按空白拆成词，例 `git push`、`git branch -D`、`rm -rf`。记录里有一行的某个简单命令、或某次 git 调用规整成的 `git <子命令> <参数…>`，以这些词开头（逐词相等，git 的子命令与选项按 git 自己的写法，`git -C x push origin` 算 `git push`），就命中；被拦下的同样算（评审 N8） | 记录里有一行 `simple` 为 `null`（shell 文本拆不开）：命中，原因写「有 1 条命令读不出」。命令记录写不进或读不出：命中。脚本文件与 `node -e` 里面做了什么 harness 看不到，不算判不了：脚本里的推送与改主干由主干前进的执行后比对发现（§3.8.4） |
| `` `outside` `` | 记录里有一行 `writes` 为真、且它的 `paths` 里有一个在这个 worker 的工作树以外；或者一行 shell 调用的 `paths` 里有工作树以外的绝对路径（shell 里分不清读写，往严一侧算）。文件读工具（`Read`、`Glob`、`Grep` 一类）的目标不算。命令文字里的 `~`、`$HOME`、`%USERPROFILE%`、`$env:USERPROFILE` 一律当作工作树以外。被拦下的同样算 | 命令记录写不进或读不出：命中 |

整张清单怎样算（从严，评审 F2）：

1. 清单节点不在图上：这个项目没有批过底线清单，不强制，深浅照主 Agent 定的。设计阶段的提醒（M3 的 `stage-notice.ts`，§7）在放行之前请主 Agent 提议一张带判定写法的清单，随放行一起由人同意（同 `norm-merge-gate`）。节点被废弃或取代，而那次状态改动不是人的（`actor` 不是 `human`，也没有 `relay`）时，照旧按它判。
2. 节点在，每一条都读得出：按上表逐条判，命中哪条写哪条。
3. 节点在，有一条或几条判不了（或者图读不出、节点一条验收都没有）：每件写任务的有效深浅都是全审，派审查时低于全审被拒（`floor_unparsed`），主干前进时项目图目录与 `only` 路径以外改到的每个文件都要有通过的全审看过同样的内容（§3.7.1、§3.8.4）。读得出的那几条照样按条判，用来在批注里写明命中了哪一类。

本仓库已批准的四条现在都没有判定写法，所以落在第 3 种：每件都全审。给它们加上写法要人同意（§13 ①）；加上之前不影响开工，代价是多审，往质量一侧错。0.3 在这里写「没有判定写法的条目不强制」，评审 F2 指出它让人定的「主 Agent 绕不过去」在人回答之前失效；本稿改为从严。

行健康与规则板上那几条旁边写「这几条还没有机器认得的写法，暂时每件都全审」（规则板 0.10 验收第 21 条写的「暂不强制」要照这里改，§14）。

#### 3.8.6 桌面版与沙盒

worker 与检查都不碰桌面版：简报禁止，L4 的步标 `L4-batch` 攒到批次（`docs/DEVELOPMENT.md` §1.1），由编排方按 `risk-shared-desktop` 的常设授权排队用，同一时间一个持有者。规则板 0.5 不再有租约（规则板设计 §10.7）：0.2 里引用 `dsh-desktop`、`dsh-profile:<名字>` 租约与重活排队的地方都删去。沙盒 profile：H1 让 `npm run probe` 在工作树里自动建指向这个工作树的临时 profile，用完删除，几个工作树并行跑探针各用各的 profile 与运行目录〔推断，§15 U9〕。

### 3.9 自动推进与完成门禁（m7-3，`d-driver`、`d-auto-drive`）

#### 3.9.1 开始、恢复与人的停止

0.2 的 `/drive`、`/drive stop` 删去。驱动循环仍是 DSH 的 goal 加 goal-round-driver；谁开始、何时恢复改为下面这样。

放行的认法（0.5 起按层，R4-F2）：没分模块的目标（M3 的 `isSplit` 为假），认焦点目标（M3 `goalOf(focusOf(session))`）的历史里最近一条把 `stage` 改为 `release` 的写入；分了模块的目标认它的每个已放行的模块（`modulesOf` 里 `isReleased` 的）：模块自己的历史里最近一条把 `stage` 改为 `release` 的写入。分了模块的目标自己的放行（大循环：框架、模块清单、方向清单）不是开始推进的信号，那时没有哪个模块的开发被放行（M3 附录 0.5 §3.14.2）。写入的形状同 M3 附录 §9 第 7 条：`record_human_answer` 以 `llm` 带人的原话写入，`reason` 以「人在对话里同意（record_human_answer <callId>）」开头；人在面板上改的也算。写入的 `at` 是这一次放行的键。目标已批准、从来没有阶段（没走设计循环）的，不自动开始：主 Agent 在对话里问人，人一句话之后它可以自己 `create_goal`（要当前回合有人的输入，tool-goal:49–52、292），之后的门禁照样适用。

执行行给主 Agent 装的 `agent/pre-step` 监听器（每一步）与 `agent/created`（持有者会话被创建或恢复时）判断，按序第一条成立的：

| 情形 | 做什么 |
| --- | --- |
| 不是持有者、或没有 `goals` 服务、或焦点目标已关闭、或没有等着处理的放行（没分模块的目标没有放行；分了模块的目标里没有哪个已放行的模块是目标上还没有批注含 `放行 <at>` 的） | 什么都不做 |
| 有一次放行还没被处理（目标上没有批注含这次的 `放行 <at>`），并且：没分模块的目标，DSH 里没有 goal 或上一个已 `complete`；分了模块的目标，不看 goal 的状态（每个模块的放行都要处理一次） | 经 `emit` 交 `hourness.design-released`（分了模块带 `module`）；循环板执行条目 `execute.release`，调 `runAction('execute.start-drive', 事件)`（循环板没收下这一项、`emit` 失败、或 5 分钟内没认领时由 M7 自己调，§2.5 第 4、5 条）。动作：重读图，目标上已有批注含这次的 `放行 <at>` 就返回 `skipped`；否则（一）目标上还没有「自动推进已开始」批注、或 DSH 里没有 goal 或上一个已 `complete`：`goals.create(agent, {objective, maxGoalRounds: 500})`（goal:635–650，服务层不查人的授权；授权来自人在对话里的同意，M3 已核对原话），在目标上以 `harness` 身份批注 `自动推进已开始 · 放行 <at> · [模块 <id> · ]goal <goalId> · 会话 <持有者会话> · 主干 <分支>`，指标流水记 `execute.goal {op: 'start'}`（`GOAL_ALREADY_EXISTS`（goal:639）时只补写批注）；（二）分了模块、goal 已在：只批注 `模块 <id> 已放行 · 放行 <at>`，不建 goal、不动 goal 的状态，指标 `execute.goal {op: 'module-released'}`。返回 `done`：没分模块时送条目自己的 `tell`（告诉主 Agent 接着分解与派活、不用等人）；分了模块时带动作自己的 `tell`（条目的固定文字说的是整个目标，装不下模块）：第一个模块 `Module <id> "<title>" of goal <goal> is released and the drive has started. Decompose it into tasks with dispatch attributes under the module and dispatch them with dispatch_task; do not wait for the person. Modules still in design cannot be dispatched (not_released).`，之后的模块去掉 `and the drive has started` |
| 有批注，批注里的会话不是当前持有者（人用 `/wish here` 把主 Agent 移了过来，评审 N7） | 在当前持有者上照上一行再开始一次（`execute.start-drive` 以「放行的 `at` 加持有者会话」为幂等键），批注 `自动推进移到会话 <新会话>`；旧会话的 agent 在本进程里活着、它的 goal 的 `objective` 以 `Project graph goal <目标 id>:` 开头时 `goals.clear(旧 agent)`（不在本进程时，在它下一次 `agent/created` 时清），指标 `execute.goal {op: 'move'}`。理由：移动主 Agent 是人的动作，人要的是推进跟着主 Agent 走；旧会话已不是主 Agent，它的 `dispatch_task` 都会被拒 |
| 有批注，goal 为 `active` 但未 arm（会话恢复或宿主重启之后，DSH 在 `agent/created` 时一律 disarm，goal:594–596） | `goals.resume(agent, ref)`（goal:686–699），经 `emit` 交 `hourness.host-started`（重启对账，§3.9.6）。理由：重启不是人决定停下；人要的是「放行之后自己推进到底」 |
| goal 为 `paused`，且 `<exec>/drive.jsonl` 显示这次暂停紧挨着上一个宿主进程正常退出（下面「重启前的暂停」一段，评审 N3） | 按重启处理：同上一行 `goals.resume`，批注「重启前的暂停（暂停后 <n> 秒宿主退出），已恢复」，派发状态提醒写「The drive was paused by the app shutting down and has resumed. If the person meant to pause it, they can pause it again.」 |
| goal 为 `paused`，上一行不成立（人在目标条上、用 `/goal pause`、或取消了一个目标轮的回合，驱动器据此暂停，goal-round-driver:223–242；高峰模式不再暂停主 Agent 的 goal，规则板 0.10 的不做档只排子 agent 的派活与工具调用，所以 `paused` 一律是这几种，`d-main-agent-peak-exempt`，R4-F1） | 不恢复。派发状态提醒写「The person paused the drive; it resumes when they press resume on the goal bar or run /goal resume.」（模型不能恢复人暂停的 goal，tool-goal:352；`/goal resume` 是 DSH 自带的命令，command-goal:11、149–151） |
| 有批注，DSH 里没有 goal（人清掉了，`goal/changed` 的 `clear`，goal:736–753），目标没完成 | 不重建。提醒写「The person cleared the drive. If they ask you to continue, call create_goal with this objective: …」 |
| goal 为 `blocked`，原因码 `hourness-waiting-human`，列出的待决都已拍板或废弃 | `goals.resume`（§3.9.5） |
| goal 为 `blocked`，原因码 `hourness-peak-wait`（§3.9.5） | 此刻已过 `drive.jsonl` 里这次停住记下的高峰结束时刻、且 `peakHoldFor` 没有值：执行 `execute.resume-drive`（高峰结束时循环板没调、或宿主在高峰里重启过）。否则不动，提醒写高峰几点结束与「If the person asks to continue now, call update_goal resume」 |
| 目标被退回设计（目标的有效阶段在 `release` 之前，第三档，§3.9.7），DSH 的 goal 为 `active` | `goals.block(agent, ref, {code: 'hourness-design-wait', message: 'The framework of goal <id> is being changed with the person (the goal went back to design). Nothing is dispatched until it is released again.'})`；`drive.jsonl` 写 `{op: 'design-wait', goal, at}`；指标 `execute.goal {op: 'block', code: 'hourness-design-wait'}`。不叫主 Agent 问人，也不计空转：主 Agent 此刻在对话里和人重新定框架，那是它该做的事。提醒写同一句与「If the person asks to continue now, call update_goal resume」 |
| goal 为 `blocked`，原因码 `hourness-design-wait`，目标已再次放行（`releaseOf` 的目标层 `ok`） | `goals.resume`，空转与高峰两个计数清零，`drive.jsonl` 写 `{op: 'resume', reason: 'design-released'}`，指标 `execute.goal {op: 'resume', reason: 'design-released'}`；提醒写「The goal was released again. Tasks that were running when it went back are stale: dispatch them again with the new design.」 |
| goal 为 `blocked`，其他原因码 | 不恢复；提醒写明原因与「when the person says to go on, call update_goal resume」（被阻塞的 goal 在有人的输入的回合里模型可以恢复，tool-goal:343–352）；`round-limit` 另写先 `update_goal edit` 把 `max_goal_rounds` 加 500（轮次用尽时 `resume` 抛错，goal:697） |

一次放行只自动开始一次：批注（含 `放行 <at>` 的那条）是幂等的键。宿主在 `create` 与写批注之间重启时，下一次判断看到 DSH 里已有 goal，只补写批注。分了模块的目标里，一个目标只建一次 goal：第一个模块放行时建，之后的模块放行只批注并提醒主 Agent 分解这一个模块；goal 的 `objective` 写目标，不写模块。

重启前的暂停（评审 N3）：驱动器在 agent 空闲时，若这一轮的预约处于排队、认领或已取消，且 goal 是 armed，就暂停 goal（goal-round-driver:229–234）。桌面版关闭时若取消了正在跑的目标轮，goal 就会变成 `paused`，上表会把它当成人暂停、不再恢复〔未核实，§15 U25，L4 第一批第 7 步核〕。M7 为此记一份很小的流水 `<exec>/drive.jsonl`（`src/execute/drive-log.ts`，只追加，`fh.sync()`）：执行行激活时写 `{op: 'start', proc, at}`（`proc` 是本进程的 `Math.round(performance.timeOrigin)`）；`goal/changed` 的 `pause` 落在持有者的 goal 上时写 `{op: 'pause', proc, goal, at}`；执行行卸载与宿主退出的清理里（`ctx.effect` 返回的函数）写 `{op: 'exit', proc, at}`；另有停住与恢复（§3.9.5）。判定：goal 为 `paused`，最近一条 `pause` 由另一个进程写下，那个进程随后写了 `exit`，两者相隔不超过 30 秒，而且这段时间里没有人的输入（持有者会话里来源为 `user` 的消息，经 `sessionQuery` 读那个时段）：算重启前的暂停。被强杀的进程不写 `exit`，那时驱动器也来不及暂停，所以不需要这一支。L4 核实桌面版关闭时并不暂停 goal 时，这一支留着不会触发，不必删。代价：人暂停之后 30 秒内关掉桌面版，重启后会被恢复；提醒里写明原因，人可以再暂停一次。文件超过 1 MiB 时改名留一份旧的。

`objective`（英文，至多 2000 字符，每一拍的目标轮提示词都带它，goal-round-driver:11–19）：

```
Project graph goal <id>: <title>
Done when: 1. <acceptance> 2. ...
Not in scope: <nonGoals>
Drive it through the project graph without waiting for the person: dispatch ready tasks with dispatch_task (choose a model and say why), dispatch their reviews the same way, answer worker requests with answer_worker, integrate with git, run check_commit on the commit you want on <trunk>, then fast-forward <trunk> to it. Put matters only the person can decide to them in the chat (at most three at a time); when everything left waits for them, call await_human. Mark this goal complete only when the completion gate passes; it lists what is missing.
```

分了模块的目标，`objective` 另加一句（英文，总长仍至多 2000 字符，超出时先裁掉 `Not in scope`）：`The work is split into modules and the person releases each module on its own; dispatch_task refuses the tasks of a module that is not released (not_released). When no released module has work left, write the design of the next module, have it reviewed against norm-directions (dispatch_task with the module id, choose a model and say why) and fix what blocks, then put its release to the person with propose_to_human (kind release, module <id>); when everything left waits for the person, call await_human.`（0.6 加的「have it reviewed」一段，R5-F4，约 120 字符，总长限制不变）

#### 3.9.2 每一拍

投影注入沿用 M2.3（目标轮必注入），派发状态提醒在变化时注入（§3.5.4），M3 的阶段提醒在推出的阶段为 `decompose`、`execute`、`merge` 时写本阶段做什么（M7 给 `src/design/stage-notice.ts` 补这三段，`release` 一句改为「The design is released and the harness has started the drive: decompose into tasks with dispatch attributes and dispatch them; do not wait for the person.」，M3 附录 §2.3 写明由 M7 改）。分了模块的目标里，这几段按焦点所在的模块的推出阶段写（§2.4），`release` 一句用 M3 附录 0.5 §2.3 的模块版（大循环放行之后各模块在设计中，不是「开始推进」）；模块被退回设计时写 `Module <id> went back to design: write its decisions and plan again and put its release page to the person; nothing in it is dispatched until then.`（M3 的 `stage-notice.ts` 由 M7 补这一句，同批改）。三条都追加在 `next()` 之后，不经收件箱，不破坏驱动器的预约（L3 实测，`docs/ORCHESTRATION.md` §2.1）。

`merge` 阶段的提醒写合入的做法（主 Agent 可以换别的做法，harness 只看主干前进的那一刻）：`To integrate a reviewed task: in its worktree rebase onto <trunk> (dispatch a worker if it conflicts), squash into one commit whose message starts with "<id>: <title>" and ends with "Hourness-Task: <id>", run check_commit on it, then git merge --ff-only it in the main checkout and push without --force. Several tasks may share one commit with one trailer line each. Commit the graph files you changed through the graph tools the same way (on a branch, check_commit, fast-forward); when norm-merge-gate has an only line that covers docs/graph/, you may commit them on <trunk> directly. To take in commits pushed elsewhere: git fetch <upstream>, run check_commit on <upstream>/<trunk>, then git merge --ff-only it; git pull on <trunk> is refused.`

驱动器在每一拍之前等主 Agent 的后代（worker、审查、检查）都静下来（goal-round-driver:130–133，subagent:1296–1330）。

#### 3.9.3 完成门禁

执行行在 `tools/pre-execute` 上看 `update_goal`，`action === 'complete'` 且调用方是主 Agent 时算 `goalCompletion(graph, goal, git)`（`src/graph/execute-stage.ts` 的纯函数加 git 的几项事实）：

1. 目标子树里每个任务都是完成、废弃或被取代；祖先任务已废弃或被取代的任务跳过（0.2 评审 F22：废弃一件活时，它下面开着的审查任务不必另关）；模块设计的审查任务（`isDesignReview`，§3.7.5）不数：它不是要合入主干的活，模块放行后它是已批准而不会完成的（0.6，R5-F4）。
2. 每个写入范围非空、已完成的任务都有 harness 写的 `commit` 证据，且这个提交的内容在主干上（它是主干的祖先，或它的尾注出现在主干上的某个提交里）。这份证据只在一次成立的本地主干前进时写（§3.8.4），那次前进必有一条覆盖它的通过的检查记录（或只改 `only` 路径）；0.3 的「已在上游」一条删去之后，没有不带检查记录的 `commit` 证据（评审 F1）。
3. 子树里没有已批准或进行中的待决（人的与 agent 的、选项式与提议式都算）。
4. 子树里没有提议节点。
5. 目标上最新一条整体审查的批注（`验收审查第 <k> 轮：APPROVED · 挡路 0 · <childId> · @<主干提交> · pins: <目标>@<摘要>`）存在，pins 没过期，每个任务的进主干证据都是它记下的主干提交的祖先，最新一条不带 `· 停下`。
6. 没有活着的 worker、审查、整体审查或检查属于这个目标。
7. 分了模块的目标（0.5，R4-F2）：没有设计中的模块（§2.4 的定义：有效阶段在 `release` 之前、状态不是废弃或被取代，含模块候选）。第 4 条抓不到一个空的、设计中的模块（它下面没有提议节点），所以单列；拒绝信息写 `module <id> has not been released: put its design to the person with propose_to_human (kind release, module <id>), or drop the module`。已放行的模块下的任务由第 1 条覆盖。

不成立：拒绝（工具错误回到模型，goal 保持 active，tools:3337–3353），列出前 10 项缺口与下一步（例 `the goal's acceptance review has not passed: dispatch_task <goal id> with a model and why`）。成立：放行，并在内存里记放行凭据 `{agentId, goalId, graphRevision, callId, at}`；`goal/changed` 的 `complete` 配对到 10 分钟内的凭据时，以 `harness` 身份把图上的目标标为完成，证据 `{kind: 'check', ref: 'hourness completion gate', exit: 0, note: '<任务数> tasks, <进主干次数> advances, acceptance review <childId>, call <callId>'}`；配不到（例如 `/wish off` 之后、别的插件直接完成）就不写完成，只批注「goal 在完成门禁之外完成」并记复盘（同 0.2）。指标流水记 `execute.completion-gate`（通过与否、缺口数）。

不是主 Agent 的会话不受这道门禁约束。`update_goal` 的 `blocked` 放行，harness 在 `goal/changed` 里给图上的目标批注阻塞原因。

#### 3.9.4 目标整体的审查

不建图节点（同 0.2：挂在目标下的任务提议要人批准，`initialStatus`）。由主 Agent 派：`dispatch_task {id: <目标 id>, model, why}`，模型与理由同样记录（§3.1.3）；深浅固定为全审，`checked` 必须覆盖目标的每一条 `acceptance:<i>`，每条引用证据（提交、检查日志、文件）。

- 什么时候派：目标子树里的任务都关了（发出 `hourness.tasks-closed`，循环板条目「目标下的活都关了之后」提醒主 Agent 派），或完成门禁只差第 5 条时（拒绝信息写明）。目标上已有对当前主干提交的整体审查、或有活着的整体审查时拒绝（`busy`）。
- 激活：`startActivation({provider: 'spawn', label: 'hourness acceptance <目标> round <k>', childId: 'hz-<目标 id>-acc-a<k>-<6 位>', request: {prompt: [简报], parent: 主 Agent, cwd: 主检出, agentOptions, outputSchema: hourness-review-v1, maxDepth}, delivery: 'caller'})`，登记表角色 `acceptance-review`，写入一律被拒（报告写 `<主检出>/.hourness/`）。
- 记录、收敛、停下与之后由主 Agent 拆新活，同 0.2 §3.9.4；停下时发出 `hourness.stopped`（`kind: 'acceptance'`），由主 Agent 问人（§3.7.4 的 `acceptance-stuck`）。

#### 3.9.5 都在等人、空转与轮次上限

- `await_human {questions: string[], summary: string}`（主 Agent 的工具）：每个 id 必须是目标子树里已批准或进行中、决定者为人的待决（含 `propose_to_human` 提的提议式待决）；否则 `invalid`。harness `goals.block(agent, ref, {code: 'hourness-waiting-human', message: 'Waiting for the person: question-3, question-7. <summary>'})`（goal:720–729；原因码小写连字符，goal:76–83）。
- 恢复：人在对话里回话，主 Agent 用 `record_human_answer` 记下；之后的每一步，执行行的监听器看到原因里列的待决都已拍板或废弃，就 `goals.resume`，提醒里写一行「已恢复自动推进」。人在面板上拍板时，M3 的回写把结果作为通知送给持有者（M3 附录 §2.4「面板拍板的回写」），通知叫醒空闲的主 Agent，它的下一步里做同一判断；M7 因此不改 `src/graph/panel-row.ts`。人补充或否掉（待决仍开着）时不恢复，主 Agent 改方案再问。
- 空转：按主 Agent 会话在内存里记每个目标轮开始时的（图修订号、执行活动计数：派发、交回、请求、检查、主干前进）。一个目标轮开始时与上一轮相比没变，就是一个没进展的轮。连续 3 个没进展的轮（被高峰挡着的轮不算，见下一条）时 `goals.block(…, {code: 'hourness-idle-rounds', …})`，记复盘，提醒主 Agent 在对话里说明；人说继续，主 Agent `update_goal resume`。重启后计数从零开始。
- 高峰里等高峰结束（编排方的接缝裁定，规则板 0.10 §3.6、§10.7 M7 第 4 条）：每个没进展的轮开始时读一次 `peakModeService(ctx)?.peakHoldFor(<持有者会话>)`。有值（`{level, until}`：此刻是 GLM 高峰，档位为少做或不做，高峰模式在挡这个会话的 GLM 活）时，这一轮不计进上一条的 3 轮，并另计「被高峰挡着的没进展的轮」；连着 2 个这样的轮时，M7 以 `goals.block(agent, ref, {code: 'hourness-peak-wait', message: 'Waiting for GLM peak hours to end at <until 的 HH:MM>: the work left is held back by the peak mode (<level>). The harness resumes the drive after peak.'})` 停住推进，不叫主 Agent 去问人，派发状态提醒写同一句与「If the person asks to continue now, call update_goal resume」（人的输入在当前回合里时模型能恢复被阻塞的 goal，tool-goal:343–352）。`drive.jsonl` 写 `{op: 'peak-wait', goal, until, level, at}`，指标 `execute.goal {op: 'block', code: 'hourness-peak-wait'}`。M7 不读档位与时钟：档位与 `until` 由规则板算好。没有值（服务不在、不是高峰、无影响、本次高峰照常做、结束时刻读不出）时照上一条计。为什么等 2 轮：1 个没进展的轮可能只是主 Agent 在想；连着 2 轮都没有可做的，再空转只是在高峰价里多花步数。推断错的代价（规则板 0.10 §3.6 已写）：主 Agent 其实是卡住了，发现推迟到这段高峰结束（至多 4 小时）；恢复之后空转从零计，真卡住的仍在 3 个轮里被阻塞、问人。
- 接上：harness 动作 `execute.resume-drive`（`runAction`，§2.5）只恢复以 `hourness-peak-wait` 阻塞的、持有者的 goal：这个进程里没有持有者的活 agent → `skipped`（`main agent is not open in this DSH process`）；goal 不是这个原因码 → `skipped`（原因码写进 `reason`）；`peakHoldFor` 仍有值（高峰还没完）→ `skipped`（`peak hours still on until <until>`）；否则 `goals.resume`，空转与高峰两个计数清零，`drive.jsonl` 写 `{op: 'resume', reason: 'peak-end'}`，指标 `execute.goal {op: 'resume', reason: 'peak-end'}`，返回 `done`、不带 `tell`（叫醒主 Agent 的那一句由循环板的「高峰结束」一项给）。谁调：循环行自己的条目 `loops.peak-end`（循环板 0.3 §5.2 第 14 项）在高峰结束时调它（规则板 0.10 §10.7 循环板一条第 8 点，少做与不做两档都这样）；M7 不另交条目。M7 自己的兜底：停住时在本进程设一个定时器（`unref`），在 `until` 之后 5 分钟到点，goal 仍以 `hourness-peak-wait` 阻塞就自己执行 `execute.resume-drive` 并以退路执行者的方式送一句 `GLM peak hours ended at <until>. Work you moved to after peak can start now.`，指标 `execute.loop-fallback {entry: 'loops.peak-end', reason: 'peak-end-missed'}`；循环板收下了这一项时行健康另报 degraded「高峰结束时循环板没有接上推进：M7 自己接上了」。宿主在高峰里重启过，定时器没了，由 §3.9.1 表里 `hourness-peak-wait` 一行在持有者第一次走步或被创建时补上。所以循环板不在时，高峰里也不问人（规则板 0.10 §3.6 建议的「照原来计」不取：M7 自己能在高峰结束时接上）。
- 轮次上限：驱动器到上限时以 `round-limit` 阻塞（goal-round-driver:135–140）。harness 在 `goal/changed` 里记复盘，晨报单列；人说继续时主 Agent 先加上限再恢复。上限是汇报事件，不是预算（`docs/ORCHESTRATION.md` §4.3）。

#### 3.9.6 宿主重启后的对账

循环板条目「重启之后」调的 harness 动作 `execute.reconcile`（事件 `hourness.host-started`；循环板没收下或没认领时由 M7 自己调，§2.5），也在完成门禁拒绝时顺带做一次（那一次不按事件键去重）。按事件键幂等：`<exec>/reconcile.jsonl` 已有这个键的一行就返回 `skipped`；做完追加 `{key, at, lost, replayed, evidence}`。步骤：

1. 找出目标子树里进行中、最新一条派发批注的 `childId` 既不在登记表里、也不是活 agent（`agents.get`，agent:596）的任务。
2. 这次派发已有交回批注：什么都不做。
3. 否则从 worker 的会话推出交回：执行行注册的会话投影 `hournessHandback` 折叠最后一次成功的 `structured_output` 调用的参数，用 `sessionQuery.observeSession(childId)` 读（subagent:2339–2352）。读到就按 §3.6.2 处理（幂等）〔会话事件的形状未核实，§15 U6〕。
4. 读不到：批注「第 <n> 次在宿主重启时丢失」，派发状态提醒列为「丢失」，下一次派发的简报写「上一次丢失：分支 hz/<id> 上已有提交 <列表>，先检查再接着做」。
5. 主干前进的证据：`advances.jsonl` 里 `ok` 的记录，图上缺证据的任务补写；检查记录里通过、主干已在那个提交而 `advances.jsonl` 没有记录的（宿主在执行后比对之前退出），按 §3.8.4 的执行后一支补判。
6. 等人的 goal 不动；以 `hourness-peak-wait` 停住的按 §3.9.1 那一行判。
7. `actions.jsonl` 里有 `start` 没有 `end`、写它的进程已写了 `exit` 或已不是本进程的 harness 动作（宿主在动作执行中退出；循环板对这种不重跑，循环板 0.3 §6.8）：按它的事件键重做一次（动作都幂等），指标 `execute.loop-fallback {reason: 'interrupted'}`。
8. DSH 的 goal 已 `complete`、图上的目标没有完成证据：重算 `goalCompletion`。成立就以 `harness` 身份标目标完成，证据 `{kind: 'check', ref: 'hourness completion gate (reconcile)', exit: 0}`（重算本身是 harness 自己的依据，K2 成立；0.2 评审 F25）；不成立就在提醒里列缺口，「when the gaps are closed and the person asks to go on, call create_goal again」。
9. 两层循环（0.5）：按 §3.9.7 的 `returnsOf` 补写宿主重启前漏掉的「退回设计」批注，并把目标已被退回设计而 goal 仍是 `active` 的补成 `hourness-design-wait` 停住（§3.9.1 的那一行）；模块放行但目标上没有批注含这次的 `放行 <at>` 的，经 `emit` 补交 `hourness.design-released`。

不会重复派发：对账只写批注与提醒，派发仍由主 Agent 决定。

#### 3.9.7 两层循环：按模块放行、三档与成批（`d-design-onepage` 扩到产品，R4-F2）

人定（`d-design-onepage` 2026-10-30T05:19Z 的改写，原话「两层循环加，我正想说这个事情呢」）：用户的项目同样按两层循环走。大循环里主 Agent 和人定框架、模块清单与方向清单；每个模块有自己的设计和一页放行稿，人同意之后才派这个模块的开发（「一个模块没放行之前不派它的开发」）；开发中的问题分三档，成批问人，一次至多三件。分工：放行归 M3（每个模块一次，四行方案），开发中的三档与成批归 M7，方向清单与模块的显示归面板（plain-ui 0.7 §4.11、§11「两层循环」第 6–9 条）。0.4 全文没有「模块」这一层：简报门禁、阶段推出、放行事件、pins 都只认目标一级，三档没有机制（评审 R4-F2）。0.5 把前四样改成按模块判（§2.4、§3.5.1、§3.5.3、§2.5、§3.9.1），本节写三档和成批。

**M7 要读的东西**（M3 附录 0.5 §3.14.1 的 `src/graph/modules.ts`，M3 同时在改 0.5，定稿后逐条对一遍，名字或行为变了只改 M7 的 `execute-stage.ts` 与 `tiers.ts` 的导入）：`modulesOf(graph, goal)`、`moduleCandidatesOf(graph, goal)`、`moduleOf(graph, node)`、`isReleased(module)`、`isSplit(graph, goal)`。M7 还依赖 M3 的三条写入规则（M3 附录 0.5 §3.14.7、§3.14.8）：（a）模块放行与退回模块只改模块的 `stage`，写入的历史带 `changes.stage: {from, to}`、`actor`、`reason`；（b）主 Agent 把模块的 `stage` 由 `release` 或之后改回 `design`，不带人的原话，`reason` 非空且不以同意的记号开头（引擎的一处窄例外）；（c）主 Agent 把目标的 `stage` 改回 `design` 要带人的原话（`relay`）。这三条 M7 不重做，只在写入发生之后按图作出反应。

**原则：M7 不判档，只把每一档对应的那一次图写入变成确定的后果。** 一个问题属于哪一档，取决于它改到的是什么（只在这个模块里、模块的设计方向、框架），这是语义判断，harness 判不了，归主 Agent（`d-main-agent-shell`、`d-plan-approval` 同一类分工：判断归主 Agent，harness 在边界核对可查的条件）。每一档对应主 Agent 已有的一种图写入，M7 观察这次写入并让后果成立：

| 档 | 主 Agent 做的写入（工具与权限都是现成的） | M7 保证的后果 |
| --- | --- | --- |
| 一：只影响这个模块、能撤回 | 在模块（或任务）下提一个决定者为 agent 的待决，用 `graph_decide` 拍板（`deciderOf` 为 `agent`；引擎本来就让 llm 自己拍这种待决，`decideRefusal`） | 不挡任何派发；记进「下一批要告知人的事」，在下一批里一并告诉人；完成门禁仍要求它们都已拍板 |
| 二：改到这个模块的设计方向 | `graph_edit` 把这个模块的 `stage` 由 `release` 或之后改回 `design`，写明原因（M3 §3.14.7 的窄例外，不带人的原话，也不带同意记号） | 这个模块下的活停下：新派发被 `not_released` 拒绝；在跑的 worker 写不了、交回过期；别的模块不受影响；人要重新放行这一页，之后才恢复 |
| 三：改到框架 | 主 Agent 在对话里问人，人同意后带人的原话 `graph_edit` 把目标的 `stage` 改回 `design`（M3 §3.14.8；今天就是这条路） | 目标下的活全停：任何模块的新派发被 `not_released` 拒绝；在跑的 worker 写不了、交回过期；自动推进以 `hourness-design-wait` 停住（§3.9.1）；人重新放行框架之后才恢复 |

**第一档的机制。** 对主 Agent 的文字在 `answer_worker` 的说明里和派发状态提醒里（英文，同一段）：

```text
When a worker's question, a handback or a failed check shows the plan was wrong, sort it before you act.
1. It stays inside this module and you can undo it: decide it yourself. Raise a question with decider "agent" under the module and graph_decide it, then keep going. Do not ask the person; tell them in your next batch.
2. It changes this module's design direction (its decisions, acceptance or promises): send the module back to design with graph_edit (stage "design", say why). Its running tasks go stale and nothing in it is dispatched until the person releases the new design. Write the new design and put its release page to the person (propose_to_human, kind release, module <id>).
3. It changes the framework (a decision of the goal, the module list or a direction): put it to the person in the chat. With their words, set the goal's stage back to design. Everything under the goal pauses until the person releases it again.
Done tasks stay done unless you reopen them. When you cannot tell 1 from 2, take 2; when you cannot tell 2 from 3, take 3.
```

「判不准时取高一档」是 agent 定的（§12），往质量一侧错：高一档多花人一次放行，低一档错了是在错的设计上继续做。

`tiers.ts` 的 `pendingReport(graph, goal, since)`（纯函数）：目标子树里决定者为 agent、已拍板（`done`）、拍板的那条历史的 `at` 晚于 `since` 的待决，按 `at` 排；`since` 取目标上最近一条批次标记（下面）的 `at`，没有批次标记时取目标上「自动推进已开始」批注的 `at`。派发状态提醒在它非空时多一项 `Decided by you since your last batch to the person: <id> <title>, … (<n>)`（至多 5 条）。

**成批。** 要问人的事（停下的审查与检查、目标整体的审查停下、第二档与第三档之后要人看的放行页、周报的提议，加上主 Agent 自己有的疑问）harness 都不直接打断人（`d-chat-not-cards`、§3.7.4），主 Agent 攒成一批用 `propose_to_human` 交给人，一次至多三件（M3 的一条回复至多三件守这个数，M3 附录 §3.4 第 4 条）。M7 的份是把「现在该交的三件」和「留到下一批的」分清楚：`batchOf(items)`（`tiers.ts`，纯函数）按优先序排：框架（第三档要人定的）、模块放行页（第二档之后重新放行；新模块的放行）、停下的审查与检查、周报的提议（`askDraft` 的各种）；取前三件为现在，其余为下一批。派发状态提醒在有等着的事时写 `Put these to the person now (at most three): …; later: …`。优先序是 agent 定的（§12）。第一档里主 Agent 自己定的事不占名额，它们是告知，不是问话。

批次标记：主 Agent 的 `propose_to_human` 成功返回时（执行行在 `tools/post-execute` 上用 M3 导出的 `shownProposalOf(isError, text)` 认，不改它的结果正文）或调 `await_human` 时，harness 在目标上以 `harness` 身份批注 `批次 <n> · 交给你 <k> 件 · 告知 agent 自己定的 <j> 件 · <调用 id>`，`j` 是此刻的 `pendingReport` 的条数，下一步的派发状态提醒写一句 `Say in one line each, in this same reply, what you decided yourself since the last batch: …`。harness 读不了主 Agent 的回复正文，所以「告知了」只指 harness 已经叫它告知；晨报的「三、理由」一节照旧列出本期 agent 自己定的事（§3.10），没有批次的日子也不会不告诉人。人对第一档的某件事不同意时，主 Agent 按人的话改，改到的范围决定它落在哪一档。

**第二档、第三档的认法与后果。** 认法：执行行在主 Agent 每一步开始时（与读放行同一处）扫目标与模块的历史，找最近一条 `changes.stage` 的 `from` 在 `release` 或之后、`to` 为 `design` 的写入（`tiers.ts` 的 `returnsOf(graph)`，纯函数），且这个节点（模块或目标）上还没有批注含这次的 `退回设计 · <at>`。认出后：

1. 在这个模块（或目标）上以 `harness` 身份批注 `退回设计 · <at> · 受影响的在跑的活：<任务> (<childId>)、…`（没有就写 `没有`）。批注是幂等的键；写图失败重试 3 次，仍失败行健康降级，内存里记 `ctx.returned` 让后面的判断照样成立（后果本来就由图上的 `stage` 推出，批注只是留痕）。
2. 指标 `execute.tier {tier: 2 | 3, node, running, stale}`；复盘（§3.15）：退回是返工，自举要看的就是这种地方。
3. 派发状态提醒列出受影响的 worker：`Sent back to design: module <id> (running: <task> <childId>, …). They are stale: interrupt them with interrupt_agent; dispatch again after the person releases the design.`。不由 harness 去中断它们（`d-main-agent-shell`：中断是主 Agent 的事），但它们写不了（`worker-scope` 的放行状态一项，§3.2.1），交回时按过期处理（不建审查、不写完成证据、`stale` 通知，§3.5.3），所以停下是确定的，不靠主 Agent 记得去中断。
4. 第三档另外：自动推进以 `hourness-design-wait` 停住（§3.9.1 的两行），目标再次放行后恢复。
5. 已经进主干的活不动。要不要重做，是新设计的事：主 Agent 把这些任务重开（`graph_status`），它们走普通的派发，简报带新设计。

人重新放行之后：模块（或目标）的 `stage` 回到 `release`，放行时刻是新的 `at`，`hourness.design-released` 带新键再交一次（§2.5），`execute.start-drive` 只批注 `模块 <id> 已放行` 并叫主 Agent 把这个模块里过期的活重新派（动作的 `tell` 里列出该模块下批准着、派发已过期的任务）。目标一级的再放行（大循环）不交这个事件（M3 §3.14.2：目标放行不等于任何模块开工），主 Agent 在 `hourness-design-wait` 恢复时的提醒里读到要重新派。

失败与边界：

| 情形 | 处理 |
| --- | --- |
| `modulesOf` 等读不出（`src/graph/modules.ts` 不在、抛错、导出的形状变了） | 失效时拒绝（R5-F3，§2 开头的失效安全默认；0.5 选的是按没分模块放行，与人定的「一个模块没放行之前不派它的开发」相反，也与 `worker-scope` 在同类情形下的拒绝不一致）。`releaseOf` 返回 `{ok: false, level: 'module', reason: 'unreadable'}`（§2.4），条件是读模块的函数抛错且目标有直接子节点是带 `stage` 的特性（从原始图上数）：派发写 `not_released`，`hint` 为 `The module structure could not be read; the harness refuses dispatch until it can.`；`worker-scope` 拒绝在跑的 worker 的写入（§3.2.1）；行健康 degraded「读不到模块：分了模块的目标暂时派不出活」。交回处理与主干前进里要重算 pins 而读不出时，按过期处理（不建审查、不写完成证据），不用 `null` 兜底。没有带 `stage` 的特性的目标仍是没分模块的目标，照常派。该项在 §6.1 列了 |
| 历史里找不到把 `stage` 改到放行的那一条，而节点现在的 `stage` 在 `release` 或之后 | `releaseAtOf` 取节点第一条历史的 `at`（从创建起就是放行的）；`stage` 在 `release` 之前就是 `null`，往拒绝一侧 |
| 退回与重新放行发生在同一步之间（主 Agent 没走步） | 重新放行的 `at` 不同，pins 与事件键都不同，后果照样成立；`退回设计` 批注可能没写，下一步按历史补写 |
| 模块被退回时它下面有审查者在跑 | 审查者只写 `.hourness/`（`worker-scope` 的豁免），不受放行状态一项影响；它的结论按过期处理 |
| 同一个任务同时在被退回的模块与目标一级的两个层上都失败 | `not_released` 的 `hint` 只写最先失败的一层（模块层），重新放行后再碰到目标层时是另一条拒绝，不丢信息 |

可测性：纯函数（`derivedStage`、`releaseOf`、`releaseAtOf`、`scopedTasks`、`returnsOf`、`pendingReport`、`batchOf`、`pinsOf` 带 `releaseAt`）在 L2 直接测；两模块的图用例见 §6.6（a）至（h），其中（g）是读不出模块的那一例。

### 3.10 四答晨报（m7-6）

`fourAnswers(input)`（`src/report/four-answers.ts`，纯函数）。输入：指标流水在时取它的本期事件；不在时取图、审计流水（违规、用量、派遣）、`<exec>/` 下的检查与前进记录（同规则板 R7 的做法：流水合入之前从原始记录算同样的数）。`hourness_report {kind: 'morning'}` 与人发的 `/hourness` 都调它，文字相同。给人看的字串过 `plainWordsIn`，不出「门禁」「验收」「标定」。

| 节 | 内容 |
| --- | --- |
| 一、目标（效果是） | 每个未关闭的目标一行：推出的阶段；任务完成 x/y，本期进主干 m 次；完成检查差几项（前 3 项）；整体审查的逐条结论（有时） |
| 二、规划（任务分解） | 本期 agent 新增与废弃的任务数（前 5 条标题）；返工（重开）次数与节点；过期的派发；卡住的：等主 Agent 回应超过 1 小时的请求、空转与轮次上限、停下的审查与检查 |
| 三、理由（为什么） | 本期 agent 自己定的事（前 5 条，一句理由）；计划批准次数；worker 问了几次、超时几次；审查深浅：全审、轻审、不审各几件，因为碰到必须全审的清单被改成全审的几件 |
| 四、架构（怎么做） | 已采纳、还没验证的决定数；本期被推翻、被取代的决定 |
| 在等你回话的 | 主 Agent 问了还没回的几件，最早一件等了几天；自动推进是不是因此停着 |
| 检查与审查 | 合入前的检查跑了几次、第一次就过的比例、没过的按命令计；审查轮数分布、挡路发现数 |
| 花了多少 | 积分与高峰占比，按模型；主 Agent 与各子 agent 各占多少（经公共库的计价服务；GLM 包不在时只计次数与 token） |
| 用了哪些模型 | 主 Agent 的模型；子 agent 按角色（干活、审查、整体审查）列模型与次数；审查与被审的活用同一个模型的次数 |
| 例外 | 违规按规则计；没经检查的主干前进与推送（本地与远端分开）；拉来的提交改了必须全审的文件、没在这台机器上全审的；进了主干、审查还没过的活；循环板没接住、由 M7 自己执行的条目次数；指标没写进流水的条数与时段；新增的复盘；在完成检查之外完成的 goal |

默认至多 40 行，每节先给数字、再给至多 5 条明细，其余写「还有 N 条」。同样的输入得到逐字相同的输出（L2 钉住）。

### 3.11 循环板上的默认条目与巡检（m7-6、m7-7、m7-8）

#### 3.11.1 默认条目

0.2 的运维会话、`/patrol on|off|status` 与本包直接调 DSH `schedule` 的做法删去（`d-one-main-agent`）。下面十条是 M7 交给循环板的默认条目（§2.5），都只读，形状照循环板 0.3 §2.1：`why` 是一句人话（1–150 个码点，过 `plainWordsIn`），`limits` 照循环板 0.3 §5.1 的表（去抖秒数 / 每小时至多几次）。时间条目由循环板用 DSH 的定时服务触发（循环板 0.3 §6.2），投到持有者会话；时区不写，意思是宿主此刻的系统时区。给模型的文字是英文、固定，第一行 `Loop board: <id> (default of dsh-hourness).` 由循环板加，下表只写之后的部分；`{名字}` 由事件载荷的同名字段填，只用 §2.5 声明过的字段。要按图算出的文字（停下之后的四行草稿、主干全量检查的失败、对账的清单）由 harness 动作在结果的 `tell` 里给，不写成占位：循环板填占位时每个值至多 200 个码点（循环板 0.3 §2.3 的 `escapeForPrompt`），草稿放不下。

| id | 标题（人话） | `why` | 触发 | 动作 | `limits` |
| --- | --- | --- | --- | --- | --- |
| `execute.release` | 设计放行之后：主 Agent 开始自己推进 | 你放行设计之后不用再发命令，这一项让系统开始自动推进，并提醒主 Agent 分解与派活 | `hourness.design-released` | harness `execute.start-drive`；`tell`（`{text, wake: true}`）：`The design of {goal} is released and the drive has started. Decompose it into tasks with dispatch attributes and dispatch them with dispatch_task; do not wait for the person.`（这一句用于没分模块的目标；分了模块的目标，动作自带 `tell` 点名模块，§3.9.1） | 5 / 30 |
| `execute.handback` | 一件活交回之后：派审查 | 交回的活要有人审过才进主干，这一项提醒主 Agent 去派审查 | `hourness.handback` | `tell-main`（`wake: true`）：`{task} is handed back (attempt {attempt}, {commits} commits). Review depth: {depth} (raised to full by the must-review list: {floorHit}; empty means not raised). Dispatch its review: dispatch_task {reviewTask} with a model and why.` | 5 / 30 |
| `execute.reviewed` | 审查过了（或按理由不审）之后：做出要进主干的提交，检查后合入 | 审查过了的活要先过合入前的检查才能进主干，这一项提醒主 Agent 去做 | `hourness.review-passed`、`hourness.review-skipped` | `tell-main`（`wake: true`）：`{task} is ready to integrate. Build the commit for the main branch with the trailer "Hourness-Task: {task}", run check_commit on it, then fast-forward the main branch to it.` | 5 / 30 |
| `execute.stopped` | 审查或检查一再不过停下之后：在对话里问你 | 审查或检查一再不过时不再派这件活，这一项让主 Agent 把它拿到对话里问你 | `hourness.stopped` | harness `execute.stop-draft`（只读：按图算 §3.7.4 的事实与四行草稿，返回 `done` 加 `tell`（`{text, wake: true}`），就是 §3.7.4 那段提醒） | 5 / 30 |
| `execute.tasks-closed` | 一个目标下的活都关了之后：派目标整体的审查 | 活都做完之后，要对照目标的要求整体再审一遍，才能说目标做完了 | `hourness.tasks-closed` | `tell-main`（`wake: true`）：`All tasks of {goal} are closed. Dispatch its acceptance review: dispatch_task {goal} with a model and why.` | 5 / 30 |
| `execute.trunk` | 合进主干之后：在主干上跑一遍完整的检查 | 每次合进主干之后，确认主干上的每条检查都跑过、都过了，坏了就提醒主 Agent 修 | `hourness.trunk-advanced`、`hourness.outside-advance` | harness `execute.trunk-check`（下一段）；过了返回 `done` 不带 `tell`（不叫醒主 Agent）；没过返回 `done` 加 `tell`（`{text, wake: true}`）：`The full check on <主干> <提交> failed: <命令> exit <码> (<日志>). Fix it or revert.` | 30 / 30 |
| `execute.restart` | 重启之后：接上停了的活 | 重启时没交回的活会丢，这一项对一遍账，把丢了的列给主 Agent，不重复派 | `hourness.host-started` | harness `execute.reconcile`（§3.9.6）；有丢失或补写时返回 `done` 加 `tell`（`{text, wake: true}`）列出，没有时不带 | 5 / 6 |
| `operate.morning` | 每天 08:30：晨报 | 每天早上把目标、进展、花费和等你回话的事讲给你听 | 每天 08:30 | `tell-main`（`wake: true`）：`Scheduled morning report (hourness). Call hourness_report with kind "morning" and reply with its text unchanged. Then put at most three matters that wait for the person to them with propose_to_human.` | — |
| `operate.weekly` | 每周一 09:00：周报 | 每周数一数你被问了几次、返工多少，并提议规矩该怎么调 | 每周一 09:00 | `tell-main`（`wake: true`）：`Scheduled weekly report (hourness). Call hourness_report with kind "weekly" and reply with its text unchanged. Put its proposals (at most three) to the person with propose_to_human, one plan each.` | — |
| `operate.patrol` | 每天 02:30：夜间巡检 | 夜里查一遍工作目录、分支、主干和项目图乱没乱，并把主干完整检查一遍 | 每天 02:30 | `tell-main`（`wake: true`）：`Scheduled patrol (hourness). Call hourness_report with kind "patrol". For each finding that is planned work, act on it or dispatch it; keep matters for the person for your next batch. Do not write files.` | — |

`wake`（R4-N2）：循环板 0.6 §2.3 把 `harness` 动作的 `tell` 定为 `{text, wake}`，`tell-main` 的 `wake` 也是必填的布尔。上表每一项都是真，与循环板 §5.1 的 `wake` 一栏一致：自动推进链上的每一环都要叫醒空闲的主 Agent，时间条目由 DSH 的定时服务投递、投递本身就叫醒它。`execute.trunk` 过了时不带 `tell`，所以没有 `wake` 的问题。条目表 `entries.ts` 的每个 `tell` 与 `tell-main` 都写出 `wake`，E1b 的 L2 逐项断言。`execute.start-drive`、`execute.trunk-check`、`execute.reconcile`、`execute.resume-drive`（§3.9.5）与 `execute.stop-draft`（只读，没有副作用，重跑只是再算一遍，所以不进 §2.5 表里「幂等的依据」的讨论）。

主干全量检查 `execute.trunk-check`（`trunkCheck`，`src/execute/check.ts`；采纳循环板 0.3 §17 M7 第 5 条的建议）：对事件的 `to`（新主干 `N`），在当前 `normDigest` 下，把与 `N` 的树相同或只差 `only` 路径的那些提交已有的通过记录合起来；它们已覆盖 `norm-merge-gate` 的每一条 `$` 与 `when` 命令（`when` 不按路径筛：完整检查就是每一条都跑过）时，写一条 `kind: 'trunk'`、`skipped: true` 的记录并返回 `done`；否则只在门禁工作树里补跑没覆盖到的那几条（经门禁锁，§3.8.3），结果与已有记录合成一条 `kind: 'trunk'` 的记录。这样人说的「合进主干之后跑一遍完整检查」做到了：主干上这个提交的内容，每条检查都跑过一次；又不在 `check_commit` 刚跑完的几条上重跑、少占门禁锁。去抖 30 秒内的几次前进合成一次，只查最后的 `to`。主干在检查期间又前进了，这次照查完，下一次事件再查新的。

时刻的取舍：02:30 不在 GLM 高峰里，人多半不在；高峰档位（`d-peak-mode`）下推迟哪些由循环板与规则板定。主干全量检查只跑本机的检查命令、不调模型，不花 GLM 积分，高峰里照跑。提醒的来源不是 `user`，不算人直接说的话，`create_goal` 这类要人授权的操作不会因它执行（tool-goal:49–52）。

#### 3.11.2 巡检做什么

`hourness_report {kind: 'patrol'}` 的工具体执行 `patrolRun`（`src/operate/patrol.ts`）：harness 先做只读与只由它写的事，再把其余列成发现交给主 Agent。git 的增删改是主 Agent 的事（`d-main-agent-shell`），所以 0.2 里巡检自动删工作树与分支的部分改为列成发现。工具体只做快的那几项（读 git、图与记录，至多几秒），当场返回发现；主干检查与 `patrol $` 命令可能要几十分钟，改为后台作业（评审 N6）：工具结果写「主干检查与巡检命令已在后台开始（job <id>），结果送到你的下一步」，作业结束时以 `createUserNotice('glm-hourness-execute', …)`（§3.4.3 的 `check` 事件）把失败的部分送给主 Agent，过了的只记录、不叫醒它。这样主 Agent 这一回合与自动推进都不被一次 30 分钟的命令占住。

| 项 | harness 自己做的 | 列成发现的 |
| --- | --- | --- |
| 主干检查（后台） | 当前主干提交按 §3.11.1 的覆盖规则还没有一次完整的通过记录时，以检查的 provider `hourness-gate` 起一个外部激活（同 `check_commit`，§3.8.2），经门禁锁（§3.8.3）在门禁工作树上补跑没覆盖到的命令；结果写进检查记录（`kind: 'trunk'`）；锁被占时这次跳过。外部激活起不来时（U2 不成立）在执行行的进程里异步跑（不在工具调用里等），行健康写「主干检查在本进程后台运行」 | 失败的命令与日志（记复盘「主干变坏」，交付指标的恢复时长从这里起算）；连续两次跳过 |
| 巡检命令 | 跑规范里的 `patrol $` 命令（本仓库：`npm run deps:check`） | 退出码非 0 时输出的前 40 行（大版本升级属于必须问人的第 4 类） |
| 证据 | `advances.jsonl` 里有、图上缺的证据补写 | 完成却没有 harness 进主干证据的写任务 |
| 工作树 | — | 任务已关、干净的 `.worktrees/hz-*`（主 Agent `git worktree remove`）；不干净的（列文件，可能有没交回的工作） |
| 分支 | — | 任务已完成、内容已进主干超过 14 天的 `hz/<id>` 与 `hz/<id>@<n>`（主 Agent 删；删之前 M3 的快照先存，`norm-review-floor` 正文的例外：清理已合入的不算「删东西」）；任务已关、内容没进主干的分支 |
| 主干 | 读一次真正的远端：`git ls-remote <上游> refs/heads/<主干>`（只读，网络不通时用 `T` 代替并在发现里写明「没连上远端」）；远端的值本机没有对象时不拉取，只列出 | 规范有 `push` 而主干领先上游的提交数；远端的主干与 `T` 不一致（有人推了而本机没拉，或 `T` 被改过）；主干（本地 `L` 与远端的值，不论在不在上游）上带 `Hourness-Task` 尾注、却没有任何通过的检查记录覆盖的提交（「覆盖」：`advances.jsonl` 里有一条成立的本地前进，含补检查通过的那种，它的 `from..to` 包含这个提交；成立的前进必有一条通过的检查记录，评审 F1）；近 7 天主干上带必须全审清单里的改动、却没有全审看过同样内容的提交（含 §3.8.4 拉来时放过的 `incomingFloor`）；近 7 天主干上既没有前进记录、也没有拉取记录覆盖的提交数（harness 以外的改动；自举的指标「人亲手改代码的次数」，`docs/ORCHESTRATION.md` §10.1）；违规流水里还没补检查的没检查前进 |
| 图 | — | 进行中超过 24 小时、没有活着派发的任务；过期的派发；等人超过 3 天的待决；图的校验错误 |
| 经验与记忆 | M5 的 `hygiene` 里能安全自动做的由经验行自己做 | 其余 `hygiene` 发现 |
| 自身 | 每次运行追加一行 `<proj>/.llm/operate/patrol.jsonl` | 距上次巡检超过 26 小时（漏跑） |

巡检发现的计划内工作，主 Agent 挂在相关的已批准特性或任务下（直接批准）；找不到可挂的就提议，它等人点头，进下一批。指标流水记 `operate.patrol`（各类发现的条数、harness 做了什么）。

### 3.12 规矩阶梯与周报（m7-8）

#### 3.12.1 规范节点上的量法

同 0.2：规范节点正文的标签 `级别：记忆 | 提示词 | 阶段提醒 | 门禁`、`模式：影子 | 生效`、`规则：<规则 id>, …`（M3 的 `labeledSections` 解析）。没有 `规则：` 标签的规范不进阶梯，周报只报个数。

#### 3.12.2 提议的阈值

`ladderProposals(norms, violations, decided)`（`src/report/ladder.ts`，纯函数），阈值同 0.2：升一级（级别低于门禁，近 7 天拦截不少于 3 条）、影子转生效（近 14 天影子记录不少于 20 条且人没标过误判）、降一级（门禁级、近 28 天拦截与影子都是 0）。

变的是怎样问人：harness 不再提待决。周报列出提议与数据，`askDraft('norm-ladder', …)` 给每条一份四行草稿；主 Agent 把它们与 §3.12.3 的底线清单提议一起，每周至多 3 件，用 `propose_to_human`（`sources` 带规范节点）问人。人否掉过的（规范节点下最近 28 天有一张提议式待决，批注里有「人在对话里否掉」）不再提。人同意之后的改动（改规范正文的级别、写门禁代码）是主 Agent 的计划内任务；改规范的验收要人的原话（规则只由人写）。

#### 3.12.3 人的负担、质量对照与降档后的返工（`question-27` B、`question-38` C）

只量系统里看得到的数，每周报，附前 4 周的值看走向（`docs/CHARTER.md` §8）：

| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 每周被问几次 | 本周主 Agent 交给人的事项数（`propose_to_human` 成功返回的次数，三种 `kind` 合计） | 指标流水；没有时数主 Agent 会话里的工具结果与图上的提议式待决 |
| 每次要读多少字 | 上一项各次的题目与四行的字数，另报本周晨报与周报的总字数（中文按字、英文按词） | 同上；报告自身 |
| 回话等多久 | 交给人到 `record_human_answer` 记下回话的时长，中位数与最长 | 同上 |
| 人怎么回的 | 原样同意、补充、否掉各占几成（`record_human_answer` 的三种说法，`d-chat-not-cards` 第五点） | 图的历史 |
| 因人的决定返工几次 | 本周的重开里，重开之前 7 天内其祖先或来源有人的再拍、推翻或取代的次数 | 图的历史 |
| 对照：检查第一次就过 | 本周 `check_commit` 第一次就通过的任务比例 | 检查记录 |
| 对照：审查发现 | 本周每个进主干的任务的挡路发现数（中位数）与审查轮数，按深浅分开 | 审查批注 |
| 对照：返工率 | 本周重开次数除以本周完成的任务数 | 图的历史 |
| 开发中退回设计（0.5，两层循环） | 本周第二档（模块退回设计）与第三档（框架退回大循环）各几次、集中在哪个模块，第一档里主 Agent 自己定的事有几件、其中告知过几件；退回之后到重新放行隔了多久 | `execute.tier` 事件；图的历史（`changes.stage`）；批次标记 |
| 降档后的返工 | 有效深浅为轻审或不审、进主干后 14 天内被重开或有 `source` 指向它的修复任务的件数，除以同期降档的件数；按改动文件的顶层目录分组 | 派发批注、证据与图的历史 |
| 合入时审查还没过 | 本周进主干时有效深浅不是不审、审查还没通过的任务件数（评审 N4），与其中后来审查没过、要返工的件数 | `execute.advance` 的 `reviewPending`；审查批注 |
| 清单判不了的那几周 | 必须全审清单有判不了的条目、因此一律全审的件数（与本来会是轻审或不审的件数） | `execute.review-depth` |

底线清单的增类提议（`floorProposals`，`src/report/floor-proposals.ts`）：近 28 天某一组降档后的返工不少于 2 件、且这组的路径不在 `norm-review-floor` 的任何 `files` 里时，提议把这组路径作为一条加进清单（`askDraft('floor-add', …)`，例「降档的 12 件里 2 件后来返工，都改了 `src/graph/`」）。放松清单（删一类）只在人提出时做。

#### 3.12.4 周报

`weeklyReport(input)`（`src/report/weekly.ts`）：人的负担与人怎么回的、质量对照、降档后的返工、交付的四个数（§3.13）、规矩阶梯与底线清单的提议（至多 3 件，带草稿）、审查收敛（各轮次分布、停下的次数）、复盘与候选（本周新增的复盘、候选经验与候选练习题的条数）、练习题回归（本周有运行时：回归集一次做对的比例与上一次的差）、M5 的 `stats`（有经验行时）。数字由 harness 算，模型只转述；输入来源同晨报。

### 3.13 交付的四个数（m7-9）

`dora(input)`（`src/report/metrics.ts`）。部署在本项目里指「主干经核对前进一次」：

| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 交付频率 | 每周 `ok` 的主干前进次数 | `advances.jsonl`（指标流水的 `execute.advance`） |
| 变更前置时间 | 任务第一次派发到它进主干的时长，中位数 | 派发批注与进主干证据 |
| 变更失败率 | 进主干后 14 天内，任务被重开、或出现 `source` 指向它的修复任务、或主干全量检查失败且失败的提交是它之后的第一个，三者之一的前进所占比例 | 图的历史；检查记录（`kind: 'trunk'`） |
| 恢复时长 | 主干全量检查从失败到下一次通过的时长；批次 L4 失败到修复进主干的时长 | 检查记录；L4 批注 |

### 3.14 标定集：回归与消融守门（m7-10）

#### 3.14.1 角色

〔用户 2026-10-29〕系统有没有用，由自举与真实项目里的试用来检验（`dogfood`、`field-trial`）。仓库里的标定集只回答一个窄问题：某次 harness 或提示词改动有没有让结果变差。它不证明系统有效，文档与报告里都这样写（`docs/ORCHESTRATION.md` §10.5 随 P4 改写）。

#### 3.14.2 结构

`tests/calibration/<任务>/` 的结构不变（`fixture/`、`prompt.md`、`task.json`、`check.mjs`），`task.json` 加三个字段：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `set` | `regression`、`capability` | 回归集：预期接近全过，掉分即回退的信号；能力集：起步通过率低是预期，饱和后转入回归集（阅读摘要 §2.1 第 11 篇） |
| `origin` | `{kind: 'seed' \| 'retro', node?, commit?}` | 题目从哪来：起步题，或自举中的复盘节点与当时的提交 |
| `isolation` | 固定为 `fenced` | 运行带读圈禁（§3.14.3） |

现有两题 `feature-parse-duration`、`bugfix-csv-quotes` 归回归集（两档模型 12/12，已饱和，`docs/ORCHESTRATION.md` §10.5.2）；M3 的 `interview-expense-log` 归能力集。新题只从自举中真实的失败来（§3.14.5）。

`result.json` 加：`env`（权限模式、步数与时间上限、桌面运行时版本、是否高峰、圈禁命中次数、`ablation` 的开关状态）、`infra`（基础设施失败的类别，例 `spawn EPERM`、沙盒启动失败；这类运行不算模型失败，阅读摘要 §2.1 第 12 篇）、`valid`（取 `ablation` 的事后扫描结论与圈禁记录，§3.14.3）。`results.json` 的汇总按集分开报 pass@1 与 pass^k（同一格 k 次全过的比例），无效的运行不进汇总。

#### 3.14.3 防泄漏（`risk-calib-read`）

三层。物理隔离与事后扫描归已批准的任务 `ablation`（`question-30` B，验收第 1 条「标定运行目录在仓库外，被测模型的读取够不到验收脚本与别的试次（事后扫事件流核对）」）；M7 只加读圈禁，并消费扫描的结论：

1. 读圈禁（预防，M7 的 P4）：标定覆盖层加一行只在标定时加载的插件 `scripts/calibrate/read-fence.mjs`（与 `limits.mjs` 同层，不属于 bundle）。在 `tools/pre-execute` 上：文件读工具（`Read`、`read`、`Glob`、`glob`、`Grep`、`grep`、`read_image`、`str_replace_editor` 的 `view`）的目标解析后不在本次 `ws/` 之内就拒绝；shell 命令文本里出现解析后在 `ws/` 以外的绝对路径、`..` 越出 `ws/` 的相对路径、或 `calibration-runs`、`tests/calibration`、`check.mjs` 字样时拒绝。这是只在标定里生效的严规则，误伤只影响标定。每次拒绝记进运行目录的 `fence.jsonl`。
2. 事后扫描（发现，`ablation` 做）：每次运行结束后扫这次的事件流，工具调用参数里有 `ws/` 以外的路径就判越界、写明证据。M7 把它的结论写成 `result.json` 的 `valid`：越界或圈禁命中过的运行 `valid: false`，不进汇总。圈禁拦下了也照样判无效（模型试图越界本身就让这次运行的结果不可信）。`ablation` 的验收第 1 条若只是在它的对照运行里核对一次、没有把扫描做成每次运行之后的一步，P4 在 `run-calibrate.mjs`（P4 本来就改它）里加这一步并把结论写进 `valid`（0.2 评审 F26）。
3. 物理隔离（`ablation` 做）：运行目录移到系统临时目录，被测模型够不到验收脚本与别的试次。

`check.mjs` 与参考解本来就不进 `ws/`（运行器只复制 `fixture/`，验收脚本以独立进程在模型结束后运行，`docs/ORCHESTRATION.md` §10.5.1）；运行目录搬出仓库之后，圈禁仍管从 `ws/` 往外读（系统临时目录里同批的别的试次、按绝对路径读回仓库）。

#### 3.14.4 消融

消融开关由 `ablation` 加在 `scripts/calibrate/`（只在标定时加载），M7 不另加开关。M7 的用法：标定回归与消融的时机由 agent 定（§12），结果按同一提交的基线对比，报每格的差，进周报的「标定回归」一行，花费进晨报。

#### 3.14.5 从自举失败到标定题

复盘节点（§3.15）正文的 `候选标定题：` 一栏非空时，主 Agent 可以在任务 `m7-10` 下提一个任务（计划内，挂在进行中的任务下直接批准），种类 `test`，写入范围 `tests/calibration/<新题>/`，验收固定为：夹具在出问题时的提交上缩减而来、不超过 30 个文件；`check.mjs` 对原样的夹具不通过、对参考解通过；`task.json` 的 `origin` 指向复盘节点，`set` 为 `regression`。收题的门槛：同类失败出现两次以上，或这次失败让人出手救场。

### 3.15 自举与试用中的留痕

自举（`dogfood`）的验收是「卡住、返工、要人救场的地方就是要改的地方，记成节点」。harness 在下面这些事件发生时自动记一个复盘节点（`retro`，挂在事件所属的目标下，直接批准，`docs/ORCHESTRATION.md` §2.9）：

| 事件 | 在哪发现 |
| --- | --- |
| 审查停下；目标整体的审查停下 | §3.7.3、§3.9.4 |
| 检查第 3 次没过 | §3.8.3 |
| 没经检查的主干前进 | §3.8.4 |
| 交回的改动里有写入范围以外的文件（写入门禁没拦住的写法） | §3.6.2 第 2 步 |
| 计划被退回 4 次 | §3.3.2 |
| goal 因空转或轮次上限阻塞 | §3.9.5 |
| goal 在完成门禁之外完成 | §3.9.3 |
| 停下标记没写进图 | §3.7.3 |
| 派发在宿主重启时丢失 | §3.9.6 |
| 主干变坏；主干上有 harness 以外的提交 | §3.11.2 |
| 同一任务同一规则的拦截达到 3 次 | 写入门禁的计数 |
| 模块或目标被退回设计（第二档、第三档，两层循环里的返工） | §3.9.7 |

正文的固定标签同 0.2：`触发：`、`任务：`、`会话：`、`提交：`、`经过：`（harness 记得的事实）、`恢复：`、`候选经验：`、`候选标定题：`（标签名不改，M5 §3.6 按它读）。后两栏由主 Agent 处理完之后补（LLM 可以改复盘的正文）；harness 只写事实。`field-trial` 沿用这个格式。

### 3.16 指标流水（`metrics`）

人批准的 `metrics`：每个项目一份只追加的事件流水，只记数与引用、不记对话正文；每个数由 harness 写，模型写的数不算；晨报、周报与各种指标都从它算。指标流水的设计还没成稿，写入接口与通用字段（时刻、项目、会话、来源行）由它定。M7 只有一个出口 `emitMetric(event)`（`src/execute/metrics.ts`，运维行导入同一个），在下表的时刻调用；接口到位之前它什么都不做（行健康写「指标流水还没有接口：报告从原始记录算」，不降级），M7 的事实照旧在图、会话日志与 `<exec>/` 的记录里，报告从那里算（§3.10）。

指标流水不在自举路径上（`d-dogfood-scope`：指标流水的实现在自举之后），所以 M7 的「怎样算做完」不要求这些事件已经写进真正的指标流水（R4-F8；0.4 的 §1.2 m7 特性第 3 条要求「每个数都写进指标流水」，骨架验收时做不到，要么被放过、要么逼实现者去建指标流水）。0.5 的说法是：每个数都是 harness 记的、不靠模型自报；每个数发生时作为一条事件交给出口；出口现在什么都不做，数仍在下面这些记录里，晨报与周报从那里算；真正的指标流水做好之后再核对它们都在里面，那一步属于指标流水的验收，不在 M7 骨架里。每个数现在记在哪：

| 数 | 现在记在哪（指标流水到位之前） |
| --- | --- |
| 模型与理由 | 图上的派发批注（§3.1.2 第 10 步）；主 Agent 会话里的工具调用 |
| 花费 | 已有的用量流水（按请求记了会话、模型与积分），按会话 id 与 `childId` 连起来；M7 不另记 |
| 用时 | 派发批注、交回批注与检查记录的时刻；`checks.jsonl` 的毫秒；`advances.jsonl` 的时刻 |
| 被拦次数 | 违规流水（五条 worker 规则与主干前进的核对都写进去） |
| 派活、审查、合入 | 图上的批注与证据；`<exec>/checks.jsonl`；`<exec>/advances.jsonl` |
| 问人的次数 | 主 Agent 会话里 `propose_to_human` 成功返回的次数（M3 的结果正文）与图上的提议式待决 |

验证用注入的出口：L2 `tests/execute-metrics.spec.ts` 注入一个记下每个事件的出口，用下表的每一类事件各触发一次，断言每类至少出现一次、字段齐全、没有一条带对话正文。这是 §1.2 m7 特性第 3 条的检查，它在指标流水不存在时也能通过。

写失败（评审 N2）：不影响任何判定，也不重试到阻塞调用方；但从第一次失败起行健康为 degraded「指标流水写不进：丢了 <n> 条（最早 <时刻>）」，丢的条数与每一段丢失的起止时刻记在内存里，并以只追加的方式写进 `<exec>/metrics-gaps.jsonl`（`{from, to, dropped, reason}`，按分钟合并；这个文件也写不进时只留在内存与行健康里）。连续 10 分钟没有新的失败就把这一段关上，行健康回到正常，但「近 7 天丢过 <n> 条」一行留 7 天。晨报与周报读这个文件：本期有丢失的时段时，在用到流水的那几节末尾注明「<时段> 的数不全：指标流水丢了 <n> 条」。指标流水的设计若自己带缓冲与重放，这一段照它改，只改 `src/execute/metrics.ts`。

| 事件 | 何时 | 内容 |
| --- | --- | --- |
| `execute.dispatch` | 每次派发成功 | 角色、任务或目标、次数、`childId`、provider、模型、思考档位、`sameAsMain`、审查另带 `sameAsWorker`、声明的审查深浅、理由所在的节点与历史序号 |
| `execute.dispatch-refused` | `dispatch_task` 被拒 | 码（`slots_full`、`scope_busy`、`unknown_model`……） |
| `execute.plan` | 计划被退回、交给主 Agent、批准、打回、超时 | 任务、版本、结果、步数、等了多少毫秒 |
| `execute.ask` | `ask_main` 回答或超时 | 任务、等了多少毫秒、结果 |
| `execute.handback` | 交回处理完 | 任务、次数、状态、`stopReason`、提交数、文件数、用时、范围外文件数 |
| `execute.review-depth` | 算出有效深浅；主 Agent 派审查时改深浅 | 任务、声明的、有效的、命中底线清单的哪几类、是否因清单判不了而全审（`unparsed`） |
| `execute.review` | 每一轮审查的结论规整之后 | 任务、轮次、深浅、模型、挡路数、不挡路数、改为不挡路的条数 |
| `execute.stop` | 停下 | 节点、`kind`、轮数 |
| `execute.check` | 每次 `check_commit` 结束 | 提交、任务、通过与否、`kind`（`commands`、`only`、`trunk`）、每条命令的序号、退出码与毫秒、是否跑了准备命令、等锁多少毫秒 |
| `execute.advance` | 主干前进且核对通过；推送核对通过；拉取；人或别的工具动了主干（`external: true`） | 引用（`local`、`remote`）、方式（`advance`、`push`、`fetch`、`outside`）、从、到、任务、按检查还是按路径、是否检查在前进之后、审查还没过的任务（`reviewPending`）、拉来时放过全审的文件数（`incomingFloor`） |
| `execute.advance-refused` | 执行前拒绝 | 缺什么（检查、清单变了、`when` 命令、底线内容） |
| `execute.unchecked-advance` | 执行后发现没经检查的前进或推送 | 引用（`local`、`remote`）、从、到、缺什么 |
| `execute.goal` | 自动推进开始、一个模块放行（分了模块的目标）、移到新的主 Agent、恢复、阻塞（含 `hourness-peak-wait`、`hourness-design-wait`）、完成 | 目标、模块（有时）、操作（`start`、`module-released`、`move`、`resume`、`block`、`complete`）、原因码、恢复的原因（重启、重启前的暂停、人回话、高峰结束、目标再次放行） |
| `execute.tier` | 三档（§3.9.7）：第二档、第三档的退回被认出；一批里告知了第一档里主 Agent 自己定的事 | 档（1、2、3）、模块或目标的 id、受影响的在跑的活数与过期的活数、第一档告知的条数、一批里交给人的件数 |
| `execute.completion-gate` | 每次完成门禁判定 | 目标、通过与否、缺口数 |
| `execute.acceptance-review` | 每一轮目标整体的审查 | 目标、轮次、模型、结论、挡路数 |
| `execute.reconcile` | 每次对账 | 丢失、补处理、补写证据的条数 |
| `execute.loop-entry` | M7 的退路执行者执行一条条目（这一项没被循环板收下） | 条目 id、事件键、是否送达、推迟原因 |
| `execute.loop-fallback` | 看门或兜底接手：循环板没在时限内认领（`unclaimed`）、`emit` 失败（`emit-failed`）、动作被宿主退出打断（`interrupted`）、高峰结束时没接上（`peak-end-missed`） | 条目或动作 id、事件键、原因、等了多少秒 |
| `execute.loop-contribute` | 每次 `contribute` 的结果 | 来源行、收下与丢掉的 id、丢掉的原因 |
| `execute.peak-cap` | 派活因少做上限被拒 | 模型、上限、在跑的 GLM 子 agent 数 |
| `operate.report` | 每次 `hourness_report` | 种类、行数、字数 |
| `operate.patrol` | 每次巡检 | 各类发现的条数、harness 做了什么、主干检查的结果 |

违规（五条 worker 规则与主干前进的核对）照旧进违规流水（与 guard 同形的 `ViolationRecord`），指标流水的设计决定要不要同时进它（规则板设计 §10.5 也把这件事交给那份设计）。token 与积分不由 M7 记：用量流水按请求记了会话、模型与积分，指标流水按会话 id 把它与 `execute.dispatch` 的 `childId` 连起来。

## 4. 宿主契约与 rc.3 证据

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据并经 L3 或 L4；「L3 实测」指派发可行性验证的探针（`scripts/probe/probe-dispatch.mjs`，场景 `glm-dispatch`、`glm-goal`、`goal-headless`）跑过；「新用」指 M7 第一次用，实现时补进接口对照表与 `src/shared/dsh-min.ts`。文件都在 `reference/dsh-desktop-0.2.1-rc.3/` 下。

| 契约 | M7 的用法 | 文件与符号（行） | 状态 |
| --- | --- | --- | --- |
| `subagents.startActivation({provider, label, childId?, request{prompt, parent, cwd?, agentOptions?, outputSchema?, maxDepth?}, signal, delivery})` | 派 worker、审查、整体审查与检查 | `dsh-subagent/lib/index.js` `startActivation`（3036–3048）、`startLocal`（1391–1477） | L3 实测（`delivery: 'parent'`） |
| 预留 `childId` 已有会话时 `DUPLICATE_CHILD` | `childId` 带随机后缀 | 同上 `startLocal`（1430–1437） | 实读 |
| `request.cwd` 为绝对路径时原样用；子会话头 `cwd` 取父会话 | worker 在工作树里；写入门禁按工作目录解析 | 同上 `resolveDirectory`（1523–1527）、`childSessionMeta`（346–356） | L3 实测 |
| `agentOptions` 合并在父路由之上；父路由取会话的 `requestHeader().config`，没有时取 agent 的 `options`；换了 provider 或模型而没给档位时清掉父的档位 | 主 Agent 选的模型（§3.1.3）；缺省 provider 的读法 | 同上 `parentAgentOptionsForDelegation`（293–303）、`resolveChildAgentOptions`（315–329）；`startLocal` 读 `provider`、`model`、`reasoningEffort`（1400–1404） | `model` L3 实测；其余实读 |
| `llm.listModels(provider)`：适配器给的目录，按 id 去重；目录成员不约束路由；`resolveModelInfo(provider, model)` 带 `reasoning.efforts` | 模型目录的核对与派发状态提醒里的模型列表 | `dsh-llm/lib/index.js` 服务名 `llm`（1816）、`listModels`（2080–2101）、`resolveModelInfo`（2111–2116） | 实读，新用 |
| `outputSchema` → 子 agent 得到 `structured_output`；有 schema 却没提交、回合 `completed` 时结算为 `error` | 交回；`ask_main` 必须在工具调用里等 | 同上 `attachStructuredRuntime`（889–960）、`captureLocalResult`（1098–1117） | L3 实测（交回）；结算为 `error` 实读 |
| `delivery: 'caller'`：不附交回指引、不送结算通知 | 交回只到 harness | 同上（1460、2048–2063、472–476） | 实读〔U1〕 |
| `ACTIVATION_LIMIT_REACHED`；`maxActiveSubagents` 默认 8 | `slots_full` | 同上 `reserve`（1046–1048）、Config（2979–2980） | 实读 |
| `resolveMaxDepth` | worker 不能经派发再派发 | 同上（3023–3030、279–283） | 实读 |
| `waitForChildren(parent)`：等所有常驻后代（本地与外部） | 驱动器每拍之前等 | 同上（1296–1330）；`dsh-goal-round-driver/lib/index.js` `drive`（130–133） | 实读；本地子 agent 随 `glm-goal` 间接实测 |
| `registerProvider`；外部后端能力全为否；`start` 返回 `{id, result, dispose}`；外部激活也有派发链 | 检查的 provider `hourness-gate` | 同上（3256–3267、2789–2794、1483–1520、1768–1790、1844） | 实读〔U2〕 |
| `subagents.sendMessage`：子到父 steer；父到子常驻时 steer、否则冷恢复；只认直接父子 | 通信 | 同上（1538–1550、2119–2135、2080–2117、2216–2231、1584–1590、1658–1662） | 子到父 L3 实测；父到子实读〔U3〕 |
| 冷恢复出的激活不带 `outputSchema` | `worker-message-live-only`；登记表不认它 | 同上（2094–2095、2141–2189） | 实读 |
| `send_message`、`interrupt_agent` 工具 | 主 Agent 改方向、中断 | `dsh-tool-subagent-control/lib/index.js`（21–91） | 实读 |
| `listChildren` 与 `sessionQuery.observeSession(id)` | 重启对账 | `dsh-subagent/lib/index.js`（2339–2352）；`dsh-web-app/cordis.patch.yml`（27） | 实读〔U6〕 |
| 会话 id 在 `[A-Za-z0-9._-]` 内原样落成文件名 | `childId` 的字符集 | `dsh-session-persistence-jsonl/lib/index.js`（866） | 实读 |
| `goals.create`（已有未完成的 goal 时 `GOAL_ALREADY_EXISTS`；服务层不查人的授权）、`get`、`edit`、`pause`、`resume`（`active` 且已 arm 时拒绝；轮次用尽时拒绝）、`complete`、`block`、`clear`；`agent/created` 时一律 disarm | 自动推进的开始与恢复（§3.9.1）、`await_human`、空转阻塞 | `dsh-goal/lib/index.js` `create`（635–650，639）、`get`（611–614）、`edit`（657–669）、`pause`（676–678）、`resume`（686–699，696–697）、`complete`（706–712）、`block`（720–729）、`clear`（736–753）、构造函数里的 disarm（594–596）、`decodeBlockReason`（76–83） | `create`、`get` L3 实测；其余实读 |
| `goal/changed`：载荷 `{change: {operation, ref: {id, revision}, goal?}}` | 放行凭据配对；人清掉、暂停的认法；轮次上限的复盘 | 同上（872–877、763） | 事件 L3 实测；载荷实读 |
| 驱动器：目标轮提示词只含目标原文与轮次；每拍前等后代；到上限 `round-limit`；人取消目标轮的回合时暂停 goal；`goal/changed` 时重排 | `objective` 的写法；人暂停的来源 | `dsh-goal-round-driver/lib/index.js` `renderGoalRoundPrompt`（11–19）、`drive`（108–170）、`agent/status`（223–242）、`goal/changed`（243–246） | L3 实测（`glm-goal`） |
| `update_goal`：`complete`、`blocked` 要人的输入或当前目标轮；`edit`、`pause`、`resume` 要人的输入；模型不能恢复人暂停的 goal；`create_goal` 要人的输入；工具说明写明会话恢复或 fork 之后 goal 被 disarm | 完成门禁的位置；人说继续时模型恢复被阻塞的 goal；人清掉之后模型重建 | `dsh-tool-goal/lib/index.js` `hasDirectHumanInput`（49–52）、`requireDirectHuman`（62–65）、`completionAuthority`（72–80）、`guidance`（196）、`create_goal`（292）、`resume` 与 `GOAL_TOOL_RESUME_PAUSED`（343–352） | 完成门禁 L3 实测；其余实读 |
| `/goal pause`、`/goal resume` | 人自己停下与恢复（提醒里告诉主 Agent） | `dsh-command-goal/lib/index.js`（11、146–151） | 实读 |
| `tools/pre-execute`（waterfall，`deny` 即工具错误、工具体不执行）；`exec.callId` | 五条 worker 规则、主干前进的执行前判定、完成门禁 | `dsh-tools/lib/index.js`（3321、3337–3353；`exec.callId` 1267） | 已用 |
| `tools/post-execute`：拿到同一个 `exec` 与结果，可以替换内容或追加上下文 | 主干前进的执行后比对与证据（§3.8.4） | 同上 `postExecute`（3595–3624） | 实读，新用 |
| `tools.register` 与输出 schema 子集；执行按名解析 | 七个 M7 工具；工具体自查调用方 | 同上（2974–2984、3227–3260、3637–3640） | 已用 |
| `system-prompt/assemble`（agent 作用域 waterfall） | 按角色过滤工具面 | `dsh-system-prompt/lib/index.js`（365–405） | 已用 |
| `agent/pre-step` 与 notice 追加 | 派发状态提醒；放行的认法；空转计数 | `dsh-agent-loop/lib/index.js`（901–925） | 已用 |
| 活 agent 的 `followup`、`steer` | harness 通知与条目提醒送进主 Agent | 同上（806–811） | `followup` 已用；`steer` M3 新用 |
| `agents.get`、`roots`、`list`、`agent/created` | 映射、对账、持有者的创建 | `dsh-agent/lib/index.js`（596、614、623、574–589） | 已用 |
| `sessionProjections.register` / `snapshot` / `stateOf` | `hournessHandback`；M3 的 `hournessMainAgent` | `dsh-session-projection/lib/index.js`（68、126、141） | 已用 |
| `userQuestions.ask` 拒绝子 agent（`DELEGATED_CALLER`） | worker 的问题只能经主 Agent | `dsh-user-questions/lib/index.js`（534） | 实读 |
| headless 在自己 agent 第一次静止空闲时退出 | 探针里驱动循环跑在第二个根 agent 上 | `dsh-headless/lib/index.js`（349–351） | L3 实测 |
| 驱动器在 agent 空闲、这一轮的预约处于排队、认领或已取消且 goal armed 时暂停 goal | 重启前的暂停（§3.9.1） | `dsh-goal-round-driver/lib/index.js`（229–234） | 实读〔U25：桌面版关闭时是否走到这里〕 |

本仓库别的行提供、M7 读的服务（都在设计中，接口以那两份设计为准；服务不在或成员不对时 M7 按 §6.1 降级）：

| 服务 | M7 的用法 | 出处 |
| --- | --- | --- |
| `glmHournessLoops`：`contribute(source, contribution)`、`emit(event)`；`Contribution.run`；读取函数 `loopsService(ctx, problem)` | 交默认条目、事件声明与 harness 动作；交事件（§2.5） | 循环板设计 0.6 §3.1（`src/loops/service.ts`）；条目的 `tell` 是 `{text, wake}`（0.6 §2.3） |
| `glmHournessPeakMode`（`PEAK_MODE_SERVICE`，规则板 0.10 §7.2 的 `PeakModeService`）：`stateFor(sessionId)` 的档位 `level`、`glmWorkerCap` 与 `until`；`peakHoldFor(sessionId)` 的 `{level, until}`；读取函数 `peakModeService(ctx, problem?)`。只此三样，都不为主 Agent：主 Agent 不受高峰影响（`d-main-agent-peak-exempt`） | 少做上限（§3.1.2）；高峰里停住（§3.9.5） | 规则板设计 0.10 §3.6、§7.2、§16.1（`src/shared/peak-mode.ts`，最小一片就交它） |
| `glmHournessExecute`（本稿提供）：`isWorker(agentId)`、`runAction(action, record)` | M3 的 `design-before-release`；循环板执行 harness 条目 | §2.5、§3.2.2 |

git 的事实（不是 DSH 的契约，L2 在临时仓库里钉住）：推送成功时 git 更新远端跟踪引用并在它的 reflog 写 `update by push`；拉取写 `fetch` 或 `pull` 开头的说明（非裸仓库默认 `core.logAllRefUpdates=true`，`refs/remotes/` 下的引用有 reflog）；全局选项 `--no-replace-objects` 让读取不受 `git replace` 影响；`git ls-remote <远端> <引用>` 只读远端。

不再用的：`commands.register`（没有 `/drive`、`/patrol`）；`schedule.create`、`list`、`delete`（时间条目由循环板触发）；`subagents.interrupt`（`/drive stop` 删去，停下用 DSH 的目标条与 `interrupt_agent`）。

本仓库图引擎的事实（main `d32468c` 实读，M7 依赖而不改）：

| 事实 | M7 的用法 | 位置 |
| --- | --- | --- |
| 任务提议只在父节点是已批准或进行中的特性、任务时直接批准；待决、风险、复盘在开放的父节点下直接批准；有人的权限的提议直接批准 | 审查任务挂在实现任务下；整体审查不建节点；复盘挂在目标下 | `src/graph/engine.ts` `initialStatus`（417–428）、`OPEN_PARENT_TYPES`（104） |
| LLM 与 harness 能改的字段不含 `acceptance`；有人的权限的写入不受限 | `no_acceptance` 的提示；审查任务的验收不写深浅；人的原话由主 Agent 带着写 | `engine.ts` `LLM_EDITABLE`（101）、`privileged`（154）、`planEdit`（578–617） |
| 任何身份都能批注；批注不带 `relay` | 轮次批注、停下标记、证据旁的说明 | `engine.ts` `planChange` 的 `comment` 分支（472 起）、`relay` 对批注丢弃（150） |
| 节点文件里不认识的字段报错 | M7 不加节点字段 | `src/graph/format.ts`（91） |
| 阶段的读法与放行集合 | `derivedStage`、设计阶段提议 `norm-merge-gate` 随放行批准 | `src/graph/stage.ts` `effectiveStage`（90）、`releaseSet`（172）、`labeledSections`（61） |

M3 设计中、还不在 main 的接口（M7 依赖，按 M3 附录 0.5；M3 0.5 同时在改，定稿后逐条对一遍，名字或行为变了只改 M7 的导入）：两层循环的读法 `modulesOf`、`moduleCandidatesOf`、`moduleOf`、`isReleased`、`isSplit`（`src/graph/modules.ts`，附录 0.5 §3.14.1；M7 的 `derivedStage`、`releaseOf`、pins 与三档都读它）；`shownProposalOf(isError, text)`（`src/shared/tool-names.ts`，plain-ui 0.7 §11 第 6 条，批次标记认 `propose_to_human` 成功用它）；`isMainAgent` 与持有者记录、`mainAgentOf`（§2.4）；`simpleCommands`（`src/guard/shell.ts`）、`gitRisk`、`takeSnapshot` 与请 M3 导出的 `gitInvocations`（`src/guard/git-snapshot.ts`，§2.5）；`propose_to_human`、`record_human_answer`、`renderProposal`、`proposalLineRefusal`（§3.3–§3.5）；`plainWordsIn`（`src/graph/plain-question.ts`，§2.8）。

## 5. 数据与状态

| 数据 | 事实源 | 谁写 | 读的一方 | 寿命 |
| --- | --- | --- | --- | --- |
| 任务的派发属性、验收、非目标 | 图 | 主 Agent 写派发属性；人写验收 | 全部 | 随 git |
| 一次派发（`childId`、次数、基线、模型与理由、审查深浅与理由、简报摘要、pins） | 图：派发批注；会话：主 Agent 的工具调用、worker 的首条消息 | harness | 对账、过期判定、报告 | 图随 git；会话随 DSH |
| 登记表 | 模块内存，只由本进程的派发写入（§3.1.4） | 执行行 | 写入门禁、`worker-message-live-only`、通知 | 进程内 |
| worker 一方的命令记录 | `<exec>/tasks/<任务>/<childId>.commands.jsonl` | 执行行 | 底线清单的判定 | 不入库；巡检报出 30 天以上的 |
| 计划与批准 | worker 会话里 `submit_plan` 的参数；任务正文的计划一节；批准批注 | worker；harness | 主 Agent、写入门禁、后续派发 | 会话；图 |
| 请求与回答 | 双方会话；等待中的在内存 | worker、主 Agent；harness 登记 | 双方 | 会话；内存随进程 |
| 交回 | worker 会话里 `structured_output` 的参数；交回摘要批注；`<exec>/reports/<childId>.md` | worker；harness | 主 Agent、审查、对账 | 会话；图；不入库 |
| 审查结论、深浅与轮数；停下标记 | 审查任务上每轮的批注与完成证据；任务上的检查失败批注；目标上的整体审查批注；写不进图时内存的 `ctx.stopped` | harness | 收敛、简报门禁、主干前进的底线核对、报告 | 图 |
| 检查记录 | `<exec>/checks.jsonl` 与 `checks/<提交>/<时间>/`（`result.json`、日志） | harness | 主干前进的核对、对账、巡检、报告 | 不入库 |
| 主干前进记录（本地主干的前进与回退、推送、拉取、人与别的工具的改动，各一行，`ref` 与 `by` 区分） | `<exec>/advances.jsonl`；任务上的证据；提交尾注 `Hourness-Task` | harness；尾注由主 Agent 写 | 主干前进与推送的核对（`pushOk` 读成立的前进、拉来的内容读拉取记录）、对账、巡检、交付指标 | 不入库；图与 git 随仓库 |
| 门禁锁 | `<exec>/gate.lock`（陈旧的改名为 `.stale-<毫秒>`） | 执行行 | 检查、主干全量检查 | 用完删除 |
| 准备命令的监视摘要 | `<exec>/tasks/<任务>/setup.json`、`<exec>/gate-setup.json` | 执行行 | 派发、检查 | 不入库 |
| 两张清单 | 图：`norm-merge-gate`、`norm-review-floor` 的验收 | 人（LLM 提议） | 检查、主干前进的核对、简报、报告 | 随 git |
| goal | DSH 会话日志（`goal/change`） | harness（开始、恢复、阻塞）、驱动器、主 Agent（`update_goal`）、人（目标条） | 驱动器、完成门禁 | 随会话 |
| 「自动推进已开始」 | 图：目标上的批注（放行的键、goal id、主干分支） | harness | 自动推进的判断、主干的认法 | 随 git |
| 放行凭据、空转计数、没有循环板时排着的条目提醒 | 内存 | 执行行 | 完成门禁、空转阻塞、条目执行 | 进程内；丢了的后果见下 |
| 循环板的默认条目、事件声明与 harness 动作清单 | 代码里的常量表（`entries.ts`）；循环板显示 | 本包 | 循环板、M7 的退路执行者 | 随版本 |
| harness 动作的认领与结束 | `<exec>/actions.jsonl`（`start`、`end` 两行，带事件键与载荷） | 执行行（`runAction`） | 看门、对账 | 不入库；超过 8 MiB 改名留一份 |
| 自动推进的流水（进程开始与退出、暂停、高峰里的停住与恢复） | `<exec>/drive.jsonl` | 执行行 | 重启前的暂停、高峰后的接上（§3.9.1、§3.9.5） | 不入库；超过 1 MiB 改名留一份 |
| 对账记录 | `<exec>/reconcile.jsonl` | 执行行 | `execute.reconcile` 的幂等 | 不入库 |
| 指标丢失的时段 | `<exec>/metrics-gaps.jsonl` | 执行行、运维行 | 行健康、晨报与周报的「数不全」 | 不入库 |
| 交出过的事件键、待认领的动作、谁执行哪一项 | 内存 | 执行行 | `emit` 的进程内去重、看门 | 进程内；重启后由对账与 `actions.jsonl` 接上 |
| 巡检运行记录 | `<proj>/.llm/operate/patrol.jsonl` | 运维行 | 漏跑判断 | 不入库 |
| 退回设计与批次（0.5，§3.9.7） | 图：模块或目标上的批注 `退回设计 · <at> · 受影响的在跑的活：…`；目标上的批注 `批次 <n> · 交给你 <k> 件 · 告知 agent 自己定的 <j> 件 · <调用 id>`；写不进图时内存里的 `ctx.returned` | harness | 派发状态提醒、周报、复盘、`pendingReport` | 图随 git |
| 指标 | 指标流水（`metrics` 设计定）；之前按需从上面各项算 | harness | 报告 | — |
| 工作树与分支 | git（`.worktrees/hz-*`、`hz/*`、`hz/*@<n>`、`.worktrees/hz-gate`） | harness 建；worker 提交；主 Agent 合并与删除 | 检查、巡检 | 任务完成时删干净的工作树；分支由主 Agent 删 |

K4 的核对：编排状态都在图上、会话日志里或 `<exec>/` 的只追加记录里；内存里只有登记表、等待中的请求、放行凭据、空转与高峰两个计数、`ctx.stopped`、`ctx.returned`、排着的条目提醒、交出过的事件键与待认领的动作。待认领的动作丢了（宿主在 5 分钟内退出）：下一次启动的对账按 `actions.jsonl` 补做被打断的，没开始的那一次由图上的事实兜住（放行由 §3.9.1 的判断在下一步再交一次事件，主干全量检查由巡检补，§3.11.2）。`<proj>/.llm/execute/` 整个被删（`git clean -fdx`、换电脑重新克隆，R4-N1 的代价）：检查记录没了，主干前进的核对读不到通过的记录，往严一侧错（要重新 `check_commit`）；`advances.jsonl` 没了，`pushOk` 读不到成立的前进，同样往严一侧错，晨报与巡检靠对照真正的远端与图上的证据补；图上的证据、批注与提交尾注不受影响；执行行在下一次写入时重建目录与 `.gitignore`，行健康写「运行记录是新建的」。丢了的后果：登记表丢了，活着的 worker 变只读；等待中的请求随 worker 一起结束；凭据丢了，对账重算完成门禁补写（§3.9.6 第 7 步）；空转计数从零开始；`ctx.stopped` 只在图写不进时用，图恢复后补写；排着的提醒丢了，主 Agent 下一步的派发状态提醒仍列出同样的事（在跑、等审查、可以合入）。

处处留痕：每个动作只在它所属的地方记一个事实，别处引用。派发的事实在会话日志里，图上的批注引用 `childId`；检查的明细在 `result.json`，图上的证据引用日志路径；主干前进在 `advances.jsonl` 与提交尾注里，图上的证据引用提交号；消息全文在会话日志里，图上只有计数。

## 6. 失败预案

按 `d-failure-plans`：按操作写清怎样发现、怎样重试、怎样恢复、事后从哪里查。「交人」都经主 Agent 在对话里问，或进晨报的「例外」。

### 6.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| `subagents` 不在 | 执行行不注册工具 | 行健康 inactive「没有 subagents 服务」 |
| `goals` 不在 | 派发照常；不自动推进；完成门禁不装 | degraded「没有 goal 服务，不能自动推进」 |
| `llm` 服务不在 | 派发照常，模型不核对目录 | degraded「读不到模型目录」 |
| 检查的 provider 注册失败 | `check_commit` 在工具调用里同步跑（§3.8.2） | degraded「检查以同步方式运行：<原因>」 |
| 设计行（M3）不在 | 工具注册，调用时拒绝 | degraded |
| 图行不在 | 工具注册，调用时 `not_found` | 会话健康说明 |
| 循环板不在 | 事件条目由本行执行，时间条目不跑（§2.5） | 写明，不降级 |
| 循环板在，成员形状不对（`loopsService` 回调 `problem`）、`contribute` 返回 `ok: false`、或有项被丢掉 | 这些项由本行执行（§2.5 第 4 条） | degraded，写明原因与项 |
| 高峰模式服务不在（规则行没装、没启用；0.5：自举路径上规则板只有最小一片，装上之后这一行只在那一片被禁用时发生）或成员不对 | 派活照原来的槽位；空转照原来计，高峰里不停住 | 不降级（规则板的事）；成员不对时告警一次 |
| 指标流水的接口不在 | `emitMetric` 什么都不做 | 写明，不降级 |
| 两层循环的读法（M3 的 `src/graph/modules.ts`）不在、抛错或成员形状不对 | 拒绝，不放行（0.6，R5-F3）：目标有直接子节点是带 `stage` 的特性（分了模块）时，`releaseOf` 返回 `{ok: false, level: 'module', reason: 'unreadable'}`，派发得 `not_released`（`hint` 为 `The module structure could not be read; the harness refuses dispatch until it can.`），`worker-scope` 拒绝在跑的 worker 的写入，要重算 pins 的交回处理与主干前进按过期处理；没有带 `stage` 的特性的目标仍按没分模块处理，只看目标一级，照常派 | degraded「读不到模块：分了模块的目标暂时派不出活」（§3.9.7） |
| `norm-review-floor` 有判不了的条目 | 每件写任务都按全审（§3.8.5 第 3 种） | 写明第几条与「暂时每件都全审」，不降级 |
| 某个工具注册失败 | 撤掉本行全部注册 | inactive，写明原因 |

运维行：`hourness_report` 注册失败时 inactive；循环板不在时只写明「到点的报告不会出现」。

### 6.2 运行期

| 操作 | 失败的情形 | 怎样发现 | 重试 | 恢复 | 留痕 |
| --- | --- | --- | --- | --- | --- |
| `dispatch_task` | 门禁不过；`unknown_model`、`unknown_provider`；槽位满；工作树或准备命令失败；`startActivation` 抛错 | 工具错误，码与 `hint`（模型错时 `hint` 列出目录） | 不自动重试；`DUPLICATE_CHILD` 换后缀重试一次 | 主 Agent 按 `hint` 改；准备命令失败时新建的工作树已删 | 主 Agent 会话；准备命令日志；`execute.dispatch-refused` |
| 模型目录 | `listModels` 抛错或为空 | 返回值 | — | 放行，批注写「没有核对」 | 派发批注 |
| 派发之后写图失败 | 引擎拒绝或 I/O 错误 | 重试仍失败 | 3 次，0.2、0.8、2 秒 | worker 照跑；对账补写 | 告警一次；degraded；会话里有派发事实 |
| worker 跑着 | 卡住、跑偏 | 派发状态提醒的用时；面板 | — | 主 Agent `send_message` 改向或 `interrupt_agent`；人在目标条上暂停 | 双方会话 |
| `submit_plan` | 不合格；主 Agent 30 分钟不回应 | 工具结果 | worker 改了再交，至多 3 次 | 第 4 次 → `blocked`；超时 → `plan-pending` | worker 会话；正文与批注 |
| `ask_main` | 20 分钟不回应 | `timeout` | — | worker 按自己写的假设继续 | 交回的 `assumptions` |
| 交回 | 结算为 `error`、`aborted`、`max-tokens`；结构化结果语义不对；pins 过期；改动出了写入范围 | 交回处理 | — | 批注与通知；过期的不建审查任务；范围外的文件记违规与复盘，交给审查看 | 任务批注；复盘 |
| 命令记录 | 写不进 | 追加失败 | — | 这次派发按全审处理 | 批注「命令记录不全」 |
| 审查 | 引了别的提交；全审覆盖不全；不收敛 | 规整与收敛判定 | 重派一次（同一模型与理由） | 不收敛 → 停下标记，主 Agent 问人 | 审查任务的轮次批注 |
| 停下标记 | 图写不进 | 引擎的返回 | 3 次 | 本进程 `ctx.stopped` 拒绝派发；图恢复后补写 | degraded；复盘；晨报「例外」 |
| 交给主 Agent 的问人提醒 | 主 Agent 不活或高峰停着 | 送达失败 | 留到它下一步 | 派发状态提醒里也列着停下的任务 | `execute.loop-entry` |
| `check_commit` | 不是提交；没有清单；锁被占 60 分钟；门禁工作树对不上；准备命令失败；命令失败；记录写不进 | 工具结果或检查的报告 | 主 Agent 再调；同一任务第 3 次失败 → 停下 | 锁的陈旧判定后重建；门禁工作树被主 Agent 动过时由它恢复或删掉（harness 下一次新建） | `result.json`、日志、任务批注、`execute.check` |
| 主干前进与推送（执行前） | 没检查、清单变了、`when` 命令没跑、底线内容没全审（含清单判不了时的全部文件）；主干上的 `pull`；改远端跟踪引用；推一个不是核对过的状态 | `advanceOk`、`pushOk`、写法表 | — | 拒绝，纠偏给正路（拉取给三步） | 违规流水；`execute.advance-refused` |
| 主干前进与推送（执行后） | 认不出的写法让本地主干前进了，或把没检查的提交推上了远端 | 前后两次读 `L`、`T` 对不上，`advanceOk` 或 `pushOk` 不成立；远端跟踪引用的 reflog 说明 | — | 不写证据；通知主 Agent 补检查；补检查通过后补证据，没过就修或退回（远端的回退要先告诉人）；远端那一支另交 `hourness.outside-advance` 跑全量检查 | 违规流水；`advances.jsonl`；复盘；晨报「例外」 |
| 推到另一个 URL 写法、或推完改回 `T` | 每次调用的比对看不到 | 夜间巡检的 `ls-remote` 与「没有检查记录覆盖的提交」 | — | 主 Agent 补检查 | 巡检发现；晨报 |
| 写证据 | 引擎拒绝或 I/O 错误 | 重试仍失败 | 3 次 | `advances.jsonl` 里有事实，对账与巡检补写 | degraded |
| 推送 | 网络、凭证、非快进 | 主 Agent 自己的命令结果 | 主 Agent 定 | 巡检报出主干领先上游 | 巡检发现 |
| 自动推进开始 | `goals.create` 抛错（`GOAL_ALREADY_EXISTS` 以外） | 抛错 | 下一步再判一次，至多 3 次 | 仍失败：提醒主 Agent 在对话里告诉人，人一句话后它 `create_goal` | degraded；`execute.goal` |
| 自动恢复 | `goals.resume` 抛错（轮次用尽等） | 抛错 | — | 提醒主 Agent 按原因处理（加上限再恢复） | 复盘 |
| 完成门禁 | 有缺口 | 工具错误列出缺口 | — | 主 Agent 按缺口做 | 主 Agent 会话 |
| 目标完成 | `complete` 不经完成门禁 | 配不到凭据 | — | 不写完成证据；对账重算 | 目标批注；复盘 |
| 主 Agent 给已结束的 worker 发消息 | 冷恢复 | `worker-message-live-only` 拒绝 | — | 正路是重新派发 | 违规流水 |
| 空转、轮次上限 | 3 拍没进展；`round-limit` | 内存计数；`goal/changed` | — | goal 阻塞，复盘，人说继续时主 Agent 恢复 | 复盘；goal 事件 |
| 宿主重启 | worker、审查、检查、等待中的请求都丢 | 「重启之后」条目 | — | §3.9.6 | 批注「丢失」；复盘 |
| 主干全量检查 | 主干变坏 | 「合进主干之后」条目、巡检 | — | 主 Agent 派修复或退回 | 检查记录；复盘 |
| 规则板排队（整块规则板合入之后） | 派发被高峰或人的规则推迟 | 规则板的门拒绝，带单号 | 单解除时规则板叫回原 agent（规则板设计 §6.3） | 主 Agent 先做别的 | 规则板的流水 |
| 少做上限 | 高峰里在跑的 GLM 子 agent 已到上限 | `slots_full`，写明到几点 | — | 主 Agent 先派非 GLM 的模型或做别的，等在跑的交回 | `execute.peak-cap` |
| 高峰里停住 | 2 个被高峰挡着的没进展的轮 | `peakHoldFor` | — | 高峰结束时循环板调 `execute.resume-drive`；没调时 M7 的定时器在结束后 5 分钟接上；宿主重启过时持有者第一次走步时接上；人说现在就做时主 Agent `update_goal resume` | `drive.jsonl`；`execute.goal`；`execute.loop-fallback` |
| 交条目 | 循环板不在、成员不对、`contribute` 拒绝或丢掉某项 | 返回值、`problem` 回调 | 循环行后到时 `inject` 自动重交；`agent/created` 时再交 | 被丢的项由 M7 自己执行 | 行健康；`execute.loop-contribute` |
| 交事件 | `emit` 返回 `ok: false`（循环板已重试三次） | 返回值 | — | M7 自己执行听它的各项 | `execute.loop-fallback {reason: 'emit-failed'}`；行健康 |
| 循环板没认领 harness 动作 | 5 分钟内 `actions.jsonl` 没有这个键的 `start` | 看门 | — | M7 自己执行并送提醒；动作幂等，晚到的那次返回 `skipped` | `execute.loop-fallback {reason: 'unclaimed'}`；行健康 degraded |
| harness 动作被宿主退出打断 | `actions.jsonl` 有 `start` 没 `end` | 对账、`emit` 的 `duplicate` | — | 按事件键重做一次 | `execute.loop-fallback {reason: 'interrupted'}` |
| 指标写不进 | 流水的接口抛错或返回失败 | 返回值 | — | 记下丢了几条与时段；报告注明数不全 | 行健康 degraded；`metrics-gaps.jsonl` |

### 6.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 主干前进 | 主干变了，推送之后对外 | 执行前只放行到检查过的提交；执行后发现绕过的；回退由主 Agent 用 git 做，改写历史之前 M3 存快照 |
| 推送 | 对外 | 由主 Agent 做；M3 的快照覆盖 `push --force` 一类；规范写了 `push` 时提醒里写「不强推」 |
| 门禁工作树的 `reset --hard`、`clean -fd` | 丢这个目录里的改动 | 只对 `.worktrees/hz-gate`，执行前核对它在 `git worktree list` 里且是分离头指针；它只由 harness 写；有改动时先存 M3 的快照，存不了就不重置（评审 N5） |
| 已发布的主干上有了没检查的提交 | 别人可能已经拉走 | 执行前拒绝认得出的推送；执行后立刻发现、跑全量检查、叫主 Agent 补检查；回退要强推，由主 Agent 先告诉人 |
| 删任务工作树 | 丢没提交的工作 | 只在任务完成且工作树干净时删，不带 `--force`；分支留着 |
| worker 在自己分支上的 `reset`、`rebase`、`checkout -- <路径>` 等 | 丢它自己没提交的改动 | M3 的 `takeSnapshot` 先存（§3.2.4） |
| 重开时旧分支改名 | — | 只改名不删，`hz/<id>@<n>` 留着 |
| 删合入过的分支 | 丢只在分支上的提交 | 由主 Agent 做；M3 的快照先存 |
| 门禁锁的陈旧判定 | 误判会让两次检查同时用门禁工作树 | 开机时刻差 120 秒以上或持锁超过 6 小时才判陈旧；陈旧的锁改名保留；检查写记录前核对门禁工作树的 HEAD 仍是要检查的提交，不是就作废这次结果 |
| 写 `<git>/info/exclude` | 改本地 git 配置 | 只追加 `/.worktrees/`、`/.hourness/`，先查是否已有 |

### 6.4 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `dispatch_task.id` | 是 | 节点 id 格式；图里的写任务、审查任务、目标或模块（模块即这个模块设计的独立评审，§3.7.5；`depth`、`depthWhy`、`review` 对它不收，深浅固定全审） | `invalid`、`not_found`、`bad_task` |
| `dispatch_task.model` | 是 | 1–200 字符，不含空白；目录非空时必须在目录里 | `invalid`、`unknown_model` |
| `dispatch_task.why` | 是 | 1–300 字符，单行化 | `invalid` |
| `dispatch_task.provider` | 否 | 已注册的 provider id | `unknown_provider` |
| `dispatch_task.reasoningEffort` | 否 | 1–40 字符；模型的档位读得到时必须是其中之一 | `invalid` |
| `dispatch_task.review` | 否（只给写任务） | `depth` 为 `full`、`light`、`skip`；后两者 `why` 1–300 字符 | `invalid` |
| `dispatch_task.depth`、`depthWhy` | 否（只给审查任务） | `full`、`light`；比声明的浅时 `depthWhy` 必填；底线命中时只能 `full` | `invalid`、`floor_requires_full` |
| `dispatch_task.context` | 否 | 至多 4000 字符 | `invalid` |
| `dispatch_task.quick` | 否 | 布尔；条件见 §3.3.1 | `invalid` |
| `answer_worker.*` | 同 0.2 | `request` 为 `R-` 加 6 位；`verdict` 为 `approve`、`revise`；`text` 1–4000 字符 | `not_found`、`invalid` |
| `check_commit.commit` | 是 | 1–200 字符，不以 `-` 开头（不能被当成 git 选项），`git rev-parse --verify <x>^{commit}` 能解析 | `invalid`、`not_commit` |
| `await_human.questions`、`summary` | 是 | 1–20 个等人的待决；1–500 字符 | `invalid` |
| `submit_plan`、`ask_main` | 同 0.2 | §3.3.2；各 1–2000 字符 | 工具错误逐条列出 |
| 交回结构、审查结论 | — | DSH 按 schema 校验（subagent:941–948）；harness 再查提交号、路径、`criterion`、全审的覆盖 | 不合格的项记进批注；审查按 §3.7.2 规整 |
| 提交尾注 `Hourness-Task` | — | 值是图里的任务 id；一个提交可以有多行 | 不认识的 id 忽略并在前进批注里写明 |
| `norm-merge-gate` 的条目 | — | §3.8.1 的写法；其余是说明 | 一条命令都没有时 `no_gate_norm` |
| `norm-review-floor` 的条目 | — | §3.8.5 的判定写法：末尾连着的反引号段，每段以 `files`、`deletes`、`commands`、`outside` 开头；路径相对仓库根、不含 `..` 与通配、列表非空 | 写错或认不出的整条记为判不了，按 §3.8.5 第 3 种从严（每件都全审），行健康写明第几条 |
| 循环板事件的载荷 | — | M7 自己产生，字段与类型在 `entries.ts` 的声明里；`files` 至多 200 项；去重键 1–200 个字符、至少三段 | — |
| `runAction` 的 `record`（循环板交来） | 是 | `LoopEventRecord`；`event` 是 M7 声明过的事件；`payload` 合声明；`project` 是绝对路径 | 不认识的动作或事件、载荷不合：返回 `failed` 与原因，不抛错 |
| `peakModeService` 的返回 | — | `glmWorkerCap` 为 1–16 的整数；`until` 是能解析的 ISO 8601 | 不合当作没有（照原来的槽位、照原来计空转），告警一次 |
| 远端跟踪引用的 reflog 说明 | — | 字符串，可以被伪造 | 只用来分拉取与推送；分错的后果由巡检兜住（§3.8.4） |
| 工具的其他字段 | 不收 | — | `invalid`（rc.3 不校验原样注册的工具参数，工具体自己查） |

### 6.5 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 主 Agent 不写文件 | 工具面没有写工具（M3）；`main-agent-no-write`（M3） | `question-26` C |
| 主干只前进到 harness 检查过的提交，拉来的也一样；已发布的主干只推到核对过的状态 | 执行前：`trunk-advance-checked` 的判定（`advanceOk`、`pushOk`、拒绝 `pull` 与改跟踪引用）；执行后：`L` 与 `T` 的比对；巡检：真正的远端与没有检查记录覆盖的提交 | 人定的那一处（`d-main-agent-shell`）；预防、发现与留痕三层，因为执行前的读法是启发式 |
| 检查的结果只来自 harness 自己跑的命令 | `check.ts` 是唯一写 `checks.jsonl` 的地方；核对时要记录与 `result.json` 摘要相符 | K2；模型自报的不算。残余风险：一条认不出的 shell 写法伪造两份文件，由 M3 的 `main-agent-no-write` 与执行后比对之外的东西都防不住，记在 §15 U19 |
| 底线清单里的内容进主干前全审过；清单判不了时一律全审 | `floor.ts` 是唯一的判定处（`parseFloor` 的 `unparsed`）；有效深浅（交回时）；派审查时拒绝降档（`floor_requires_full`、`floor_unparsed`）；主干前进时按内容核对 | `question-38` C「主 Agent 绕不过去」；失效安全默认 |
| 交给循环板的 harness 动作一定有人执行 | `loop-link.ts`：按「这一项被收下没有」定执行者；看门读 `actions.jsonl`；对账补被打断的 | `d-auto-drive`：放行之后不发命令也要推进 |
| 少做上限由规则板给数、M7 照数执行 | `dispatch.ts` 在派 GLM 子 agent 之前读一次 `glmWorkerCap` | 接缝裁定：数归规则板，执行在知道模型与在跑数的一方 |
| 派发链里只有 worker 写，只写自己的范围 | `worker-scope`、`dispatch-chain-readonly` | 子 agent 的工具面与父相同，只能在执行边界拦 |
| worker 只碰自己的分支 | `worker-git`；执行后比对对 worker 的 shell 同样做 | 主干的整合归主 Agent |
| worker 不写图 | 工具面（§2.3.2）；`worker-graph-readonly` | 规划状态只有主 Agent 与 harness 写 |
| 每次派发都有模型与理由 | `dispatch_task` 的参数校验；派发批注 | `d-main-agent-models` |
| 简报过期的不进主干 | pins；交回处理不建审查任务；`check_commit` 读到尾注里的任务过期时在结果里写明，主干前进时这些任务不写完成证据 | K5 |
| 目标完成要 harness 的证据 | 完成门禁；凭据配对；对账重算 | K2 |
| 停下之后、人回话之前不再派 | 图上的停下标记；`ctx.stopped` | `d-failure-plans` |
| 问人的事都经主 Agent 在对话里问 | harness 不写给人的待决（`asks.ts` 只产草稿）；M3 的 `main-agent-graph` 第 3 条拒绝主 Agent 写带选项的人定待决 | `d-chat-not-cards` |
| 联动在循环板上看得到，同一件事只定义一次 | `entries.ts` 是唯一的定义；循环行不另带 M7 的项；退路执行者读同一张表 | `d-rules-visible`；评审 F3（重复定义会两处各叫醒一次） |
| 写权限只给本进程派发出去、仍活着的激活 | 登记表；`worker-message-live-only` | §3.1.4 |
| 门禁工作树的破坏性命令只作用于它，同一时间一个使用者 | `git.ts` 的守卫；门禁锁 | §6.3。守卫还拒绝 `.git` 文件指向别处（E3-1）和工作树里自己提交、没有任何引用包含的提交（E3-2）；执行器为此把它放到工作树上的提交记在 `refs/hourness/gate-head`，这是执行器用 `update-ref` 写的唯一一个引用（`ensureWorktree` 另外建、改名自己的 `hz/<任务>` 分支；主干、别的分支、标签和远端跟踪引用执行器都不写） |
| harness 自己的 git 调用不运行仓库的钩子（钩子目录里的与配置里定义的）与 fsmonitor 命令 | `git.ts` 的 `run` 是执行器启动 git 的唯一出口，在 `--no-replace-objects` 之后给每个进程加 `-c core.hooksPath=<空设备>`、`-c core.fsmonitor=false`，再加 `-c hook.post-checkout.enabled=false`、`-c hook.reference-transaction.enabled=false`、`-c hook.post-index-change.enabled=false`；L2 用钩子目录里的真钩子、配置里定义的真钩子（`hook.<名>.event`）与真 fsmonitor 命令钉住 | E3 评审 E3-6、E3 后续评审 FU-4，由人定。`worktree add`、`checkout --detach`、`reset`、`update-ref`、`branch`、`status` 本来会触发仓库的钩子与命令（实测只触发这三个事件），钩子若挪动了主干，是发生在任何 agent 的 shell 调用之外，§3.8.4 只能当作外部前进。配置里的钩子与钩子目录里的叠加着跑，`core.hooksPath` 管不到，所以按事件关。版本边界：配置里的钩子从 git 2.54 起有，`hook.<事件>.enabled` 从 2.55 起有；2.54.0 的文档里只有按名字关闭的 `hook.<名>.enabled`（没有在 2.54 上实测），在 2.54.x 上配置里的钩子按文档推断仍会运行，结果是主干被挪动时按外部前进处理，落在 §3.8.4 保守的一侧，不另去读钩子名逐个关；L2 用例在这样的 git 上带理由跳过。主 Agent 与派发链里的 agent 在自己 shell 里跑的 git 不受影响，也不属于这一条。没有关的：检出与重置按 `.gitattributes` 调用的过滤器（`filter.<名>.smudge` 等），以及 `ls-remote` 连远端时用的传输程序（`core.sshCommand`、凭据助手）；这一条只管钩子与 fsmonitor，不说仓库配置对 harness 的调用完全无效 |

### 6.6 可测性

纯函数在 L2 直接测：`pins`、`staleness`、`scope`、`briefGate`（含停下标记的设与解、人回话之后的计数）、简报渲染、`checkPlan`、`checkModelChoice`、`normalizeVerdict`、`roundsSinceHuman` 与收敛判定、`askDraft` 的每一种（草稿过 `proposalLineRefusal` 与 `plainWordsIn`）、`parseFloor` 与 `floorHits`、`parseGateNorm`（含 `only` 与 `GATE_LINE_FORMS`）、`advanceOk`（git 事实由参数给）、执行前的写法分类（给定 `gitInvocations` 的输出与仓库状态）、`derivedStage`（目标与模块）、`releaseOf`、`releaseAtOf`、`scopedTasks`、`goalCompletion`（含祖先已废弃的跳过、设计中的模块）、`returnsOf`、`pendingReport`、`batchOf`、自动推进的判断表（§3.9.1，给定 goal 视图与图）、条目表与事件的对应、`fourAnswers`、`weeklyReport`、`ladderProposals`、`floorProposals`、`dora`、人的负担、`childId` 的编解码。

git 在 L2 用临时目录里的真实 git 仓库测：建工作树与分支、复用、`info/exclude`、重开后按祖先关系改名（含同一次返工里再派一次不改名，0.2 评审 F17）、检查在指定提交上跑、`only` 的判定与两个提交只差 `only` 路径时检查结果通用、尾注读取、执行前拒绝 `merge --no-ff` 与主干上的 `commit`、放行检查过的 `merge --ff-only`、执行后发现脚本里的 `git update-ref`、证据写给尾注里的任务、底线内容按内容核对（压缩与变基之后仍认、解冲突改了底线文件之后不认）、门禁工作树守卫、门禁锁（独占、同进程排队、开机时刻差超过 120 秒与持锁超过 6 小时判陈旧、活着的锁让第二个持有者等待并超时）。命令执行器可注入，L2 用 `node -e "process.exit(1)"` 测失败、超时与进程树结束。

0.4 加的 L2 用例（评审 F1–F3、N1–N8 与接缝裁定，每例写明钉的是什么）：

- 上游（临时目录里一个裸仓库当远端）：`git fetch . X:refs/remotes/origin/main` 与 `git update-ref refs/remotes/origin/main X` 在执行前被拒；主检出在主干上时 `git pull --ff-only` 被拒，纠偏写三步；`git fetch origin` 之后 `T` 前进，`advances.jsonl` 记 `by: 'fetch'`、没有违规、没有任务证据；拉来的带尾注的提交没 `check_commit` 时 `git merge --ff-only origin/main` 被拒，检查通过之后放行，并写尾注任务的证据；拉来的提交改了底线文件，按「拉来的内容」放过全审、`incomingFloor` 有它、晨报的「例外」列出它；先被本机脚本推上去（没检查）再拉回来的提交不按「拉来的内容」放过。
- 推送：脚本 `node -e` 里 `git push origin <没检查的提交>:main` 在执行后被发现（`T` 的 reflog 是 `update by push`、`pushOk` 不成立），违规一条、交 `hourness.outside-advance`；`git push origin hz/x:main` 在执行前被拒；推一个成立的前进的 `to` 放行；`push --all` 推到上游被拒；`git replace` 换掉一个对象之后 harness 的内容核对不受影响。
- 主干与 `T` 的另几种写法（E3-9，§3.8.4 表后的说明）：主检出在另一个分支上，`git push . feature:main`、`git branch -M feature main`（含只给一个名字的 `git branch -M main`）、`git worktree add -B main <路径> feature`、`git pull . feature:main` 在 `feature` 没检查过时被拒，在 `advanceOk` 成立时放行；`git symbolic-ref refs/heads/main refs/heads/feature` 无论如何被拒；`git push . feature:refs/remotes/origin/main` 被拒；`git pull origin src:main` 不论主检出在不在主干上都被拒并给三步；脚本里的同样写法在执行后被发现。
- 底线清单：一条判不了时，`review: {depth: 'skip'}` 的写任务有效深浅为全审、`floorHit` 为 `unparsed`，`depth: 'light'` 的派审查得到 `floor_unparsed`；主干前进时一个没全审过的非图文件被拒，只改 `docs/graph/` 与 `only` 路径的不受影响；四条都读得出时按条判；末尾反引号段写错（`file src/`）的那条记为判不了；中间的反引号（人话里的 `~/.dsh`）不当写法；`--no-renames`：改名算删除；`commands git push` 命中被拦下的 `git -C x push origin`（N8）；`simple` 为 `null` 的命令让有 `commands` 的条命中；`outside` 命中写到工作树以外的 `Write` 与带 `~` 的 shell 命令，不命中 `Read`；节点被 LLM 废弃之后照旧按它判。
- 循环板接缝（假的循环板服务）：两张表交给 `contribute` 全部收下；一项被丢掉时那一项由 M7 执行、行健康报出；交出 `hourness.design-released` 而 5 分钟内没有 `runAction` 时 M7 自己 `execute.start-drive`，之后循环板晚到的调用返回 `skipped`；`emit` 返回 `busy` 时当场由 M7 执行；`emit` 返回 `duplicate` 而 `actions.jsonl` 只有另一个进程留下的 `start` 时重做；`runAction` 对不认识的动作返回 `failed`、不抛错；主干全量检查发现主干红了时返回 `done` 加 `tell`；每种事件的去重键：任务重开再关，两次 `hourness.tasks-closed` 的键不同，同一次交回重放两次键相同（循环板 0.3 §17 M7 第 3 条要的那一例）。
- 高峰（假的高峰模式服务，注入的时钟）：`slots` 为 3、少做、高峰、已有 1 个 GLM 子 agent 在跑时，第二个 GLM 派发得 `slots_full`，同时一个非 GLM 的派发照常；没有 `glmWorkerCap` 时照常（规则板 0.10 §10.7 M7 第 1 条要的那一例）。`peakHoldFor` 有值时连续没进展的轮不以 `hourness-idle-rounds` 阻塞，第 2 轮以 `hourness-peak-wait` 停住；`execute.resume-drive` 之后空转从零计；`peakHoldFor` 为 `undefined` 时照原来 3 轮阻塞（规则板要的那一例）；高峰结束 5 分钟后循环板没调时 M7 自己接上；重启后持有者第一次走步时，过了结束时刻的 `hourness-peak-wait` 被接上，没过的不动；goal 为 `paused` 时一律按人暂停处理、不读任何高峰状态（高峰模式不暂停主 Agent，R4-F1）。高峰服务的假实现类型取规则板最小一片的真实 `PeakModeService`（`src/shared/peak-mode.ts`），返回固定的 `{level: 'reduce', peak: true, until, glmWorkerCap: 1}`，不是 M7 自己编的接口（R4-F6，§9.2）。
- 0.5 加的 L2 用例（R4-F1、F2、F3、F8，0.6 按 R5-F1 补回清单；每例写明钉的是什么；文件 `tests/execute-modules.spec.ts`、`execute-tiers.spec.ts`、`execute-examples.spec.ts`、`execute-metrics.spec.ts`；两模块的图用 M3 合入后的真实引擎写阶段，M3 的文件还不在时用本地类型写预置的图）：（a）两模块的图，A 放行、B 在设计中：B 下的任务得 `not_released`，A 下的派得出；B 放行后 `hourness.design-released` 带 `module: B`，键与 A 的不同，`execute.start-drive` 第二次只批注、不建第二个 goal（钉住「一个目标一个 goal」与「模块没放行不派」）；（b）第二档：A 的 `stage` 不带原话退回 `design`：A 下在跑的 worker 的 `worker-scope` 写被拒、交回得 `stale`、新派发得 `not_released` 且 `hint` 带 sent back；B 不受影响；A 再放行后 `releaseAt` 变了，退回之前派出的仍过期（钉住 pins 用放行时刻而不是布尔）；（c）第三档：目标的 `stage` 带原话退回 `design`：两个模块的任务都过期，goal 以 `hourness-design-wait` 阻塞，再放行后恢复，空转与高峰两个计数清零；（d）`waiting_human` 只数决定者为人的待决：第一档里 agent 自己定的待决不挡派发，完成门禁第 3 条仍要求它们都关；（e）`batchOf` 的优先序、至多三件、第一档不占名额，`pendingReport` 的 `since`（取最近一条批次标记，没有时取「自动推进已开始」批注）；（f）`returnsOf` 在同一步内退回又放行时，后果照样成立；写图失败时 `ctx.returned` 让后面的判断照样成立；（g）读不出模块（R5-F3）：注入一个抛错的读模块函数（`releaseOf` 的第三个参数，§2.4），分了模块的目标得 `{ok: false, level: 'module', reason: 'unreadable'}`，`briefGate` 写 `not_released` 与固定的 `hint`，`worker-scope` 拒绝写入；同一个抛错的读法下，没有带 `stage` 的特性的目标照常派得出去；抛错之后读法恢复，同一个分了模块的目标按模块判；（h）示范与指标出口各一条：`execute-examples.spec.ts` 的六条检查（第 5 条对有效深浅断言，R5-F2）；`execute-metrics.spec.ts` 注入一个记下每个事件的出口，每一类事件各出现一次。
- 0.6 另加（R5-F4，文件 `tests/execute-modules.spec.ts`）：模块设计评审的任务形状（`isDesignReview`）；设计中的模块下的评审派得出去，同一个模块下的普通任务派不出去，目标没放行时评审也派不出去，`proposed` 只对这一种形状放行；`scopedTasks` 与完成门禁不数它；记录的格式过 §3.7.5 的正则，`digest` 对固定的方向清单得出固定的值，`APPROVED` 当且仅当 `n` 为 0；同一 `childId` 重放两次只写一条记录；模块下没有设计决策得 `nothing_to_review`，没有方向清单得 `no_directions`。
- 其余（0.4 的，0.6 完整接回）：审查没过的任务进主干后不转完成，审查通过时转完成（N4）；门禁工作树有改动时先有快照（N5）；巡检的主干检查不在工具调用里等（N6）；`/wish here` 之后前任派出的 worker 的计划请求送到新的持有者，新持有者 `answer_worker` 成功（N7）；`drive.jsonl` 里暂停之后 30 秒内另一个进程 `exit` 时按重启恢复，60 秒时不恢复（N3）；指标写失败时行健康降级、`metrics-gaps.jsonl` 有一段、晨报写「数不全」（N2）。

宿主侧在假宿主 `tests/fake-rc3.ts` 上测，假宿主补 rc.3 的这些信号：`startActivation` 按 `delivery` 区分；`registerProvider` 与外部激活；`resolveMaxDepth`；`sendMessage` 只认直接父子与冷恢复；`goals` 的各操作、阶段规则、`agent/created` 时的 disarm 与 `goal/changed`；`llm.listModels`、`resolveModelInfo`；`tools/post-execute` 与 `exec.callId`；`sessionQuery.observeSession`；工具调用期间长时间 `await`。真实组合里的派发、计划等待、通信、检查 provider、自动推进与完成门禁在 L3 测（§9.1）；面板与冷会话的到点提醒要 L4。

### 6.7 行健康

`HOURNESS_ROWS` 在 `design`（与 `rules`）之后加 `execute`、`operate`，都按会话上报。

| 行 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- |
| execute | 主 Agent 会话：派发、写入门禁、检查与主干前进的核对、自动推进可用；写明在跑的 worker 数、槽位、检查方式（外部或同步）、自动推进的状态（含「等 GLM 高峰结束，到 <时刻>」）、主干分支与上游、循环板收下了几项 | 不是主 Agent；没有 subagents（inactive）；没有 goals；读不到模型目录；检查同步运行；循环板不在（不降级）；循环板接口与 M7 不符或有项被丢掉（degraded）；近 24 小时循环板没接住、由 M7 自己执行过（degraded，写次数）；经验板块不在；底线清单有判不了的条目（写明「暂时每件都全审」）；派发批注或证据写不进图；停下标记写不进图（列出任务）；读不到模块（M3 的 `src/graph/modules.ts` 不在、抛错或成员不对，degraded，写明分了模块的目标暂时派不出活、在跑的 worker 写不了，R5-F3）；有模块或目标被退回设计、其下有在跑的活（写模块 id 与活，提醒主 Agent 中断重派）；登记表被重新导入后有失联的 worker；门禁锁被别的进程占着超过 60 分钟；指标流水写不进（degraded，写丢了几条） |
| operate | 本会话是主 Agent：上次巡检、晨报、周报的时间 | 循环板不在（到点的报告不会出现）；上次巡检超过 26 小时 |

`/glm-status` 与 `/hourness-status` 都列出这两行。

## 7. 依赖

| 依赖 | 状态（2026-10-30） | M7 的用法 | 若形态有变 |
| --- | --- | --- | --- |
| split | 第 0–8 步已在 main（`0d9c337`..`de14525`），不再挡 M7（0.2 评审 F27）。E0 不再等 M3（编排方对 R4-F9 的裁定）：E0 与 M3 第 3 步都往 `scripts/packages.mjs` 加几行登记，后合入的一方把冲突的几行机械并进去、不重审（§8.3） | 两行登记在 `packages/hourness/cordis.patch.yml`；`scripts/packages.mjs`（preflight 要求 `src/` 下每个目录都登记、登记的都存在）；公共库的 `installStepNotice`、工具名契约、计价服务、`/hourness-status` | — |
| M3（附录，盘上已是 0.5，同时仍在改；本稿按盘上的 0.5 写，M3 定稿后 M7 逐条对一遍，尤其 §3.14 的两层循环） | 第 1、2 步在 main；其余在 `.worktrees/m3` 与 `.worktrees/m3-flow` | `isMainAgent` 与持有者记录、`mainAgentOf`（请求与通知每次送之前重取，§3.4.3；参数以 M3 0.5 为准，R4-N4）、`goalOf`、`effectiveStage`、`releaseSet`、`focusOf`、`digest-notice.ts`、`stage-notice.ts`、`main-agent-no-write`、`design-before-release`、`simpleCommands`、`gitRisk`、`takeSnapshot`、`propose_to_human`、`record_human_answer`、`renderProposal`、`proposalLineRefusal`、`plainWordsIn`、探针的模拟人；0.5 起另读两层循环的 `src/graph/modules.ts`（`modulesOf`、`moduleCandidatesOf`、`moduleOf`、`isReleased`、`isSplit`）、`shownProposalOf`，并依赖 M3 附录 0.5 §3.14.7、§3.14.8 的三条写入规则（模块放行改模块的 `stage`；退回模块的设计循环不带原话、不带同意记号；退回大循环带原话） | M7 不整个等 M3，依赖按步写（R4-F9，编排方裁定，§8.3）：E0、E1a、E3 现在就能从 main 开分支做；E1b 的测试等 M3 第 3、6 步（`plainWordsIn`、`proposalLineRefusal`）；E2 等 M3 第 6 步（两者都改 `src/shared/tool-names.ts`）；E4 等 M3 第 3–5 步与规则板最小一片的行登记；E8 里和模块有关的部分等 M3 第 9 步的模块放行。M7 改 M3 的几处：`design-before-release` 的放行一行改问执行服务；身份节的边界一句与 `main-agent-no-write` 的正路在执行行在时改为「writing work goes to workers you dispatch with dispatch_task; subagents started with the subagent tool only read」（0.2 评审 F18）；阶段提醒的 `release` 一句与 `decompose`、`execute`、`merge` 三段、模块被退回设计的一句（§3.9.2）、没有 `norm-merge-gate` 时的一句、没有 `norm-review-floor` 时请主 Agent 提议一张带判定写法的清单的一句（§3.8.5）；`git-snapshot.ts` 加导出 `gitInvocations`、`gitRisk`、`takeSnapshot`。不再改 `panel-row.ts`。0.6 另请 M3 在 `moduleReleaseGate` 加第 8 项：模块设计评审的记录（M7 写在模块节点上的一行批注，格式、字段、算法与 M3 要数的条件都在 §3.7.5「记录的形状」，R5-F4）；M3 第 9 步做；那一项合入之前，模块放行页不核对评审做没做（M3 附录 0.5 §3.14 末句），M7 的派发仍可用。M3 的运行时文件同样搬进项目的 `.llm/`（编排方裁定，M3 在自己的下一稿改），M7 只经 `takeSnapshot` 用快照，不读它的路径 |
| 规则板（设计 0.10，人已放行；最小一片 `d-rules-peak-slice` 在 `.worktrees/rules-slice` 实现中） | 自举路径上只有最小一片（规则板 §16.1）；整块（规则页、人加的规则、门、等待单、代码规则目录）在 E9 之后，M7 不等它 | 只读最小一片交的 `src/shared/peak-mode.ts`：`PEAK_MODE_SERVICE`、`PeakModeService`（`stateFor` 的档位与 `glmWorkerCap`、`peakHoldFor`）、`peakModeService`（§3.1.2、§3.9.5）；不读 `RulesService`（0.10 没有它，最小一片也不交 `src/rules/service.ts`，R4-F1）；导出 `EXECUTE_RULES` 给整块规则板映射进代码规则目录；规则页导入 `parseFloor`（规则板 §10.7 M7 第 2 条，整块 R5） | 最小一片晚于 E4 合入时，E4 的这一处读先对着类型写好、L2 用真实类型的固定实现验（§9.2），片子合入后的第一个提交补上真实服务的核对。规则页上判不了的条目旁的字要从「暂不强制」改为「暂时每件都全审」（§3.8.5，§14）。`DISPATCH_TOOL_NAMES` 在规则板整块的门里才有，M7 的 E2 不建它，整块规则板合入时再加 `dispatch_task`（M7 自己的 `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 加 `dispatch_task` 照旧是 E4 的事）。自举期间不做档的派发排队不生效（整块规则板的门），少做的上限生效 |
| 循环板（设计 0.6，人已放行；实现在自举之后，不在自举路径上） | 定稿 | `glmHournessLoops.contribute`、`emit`、`Contribution.run`；条目与事件声明的形状（条目的 `tell` 是 `{text, wake}`）；时间触发；送达持有者；循环行自己的 `loops.peak-end` 调 `execute.resume-drive` | 本稿照 0.6 的接口写（§2.5）；它再改形状时只改 `src/execute/entries.ts` 与 `loop-link.ts`。0.3 §5.2、§6.9 第 4 条与 §17 M7 第 6 条里的 `execute.resume-after-peak` 已按规则板 0.10 §10.7 的请求与本稿改为 `execute.resume-drive`、原因码 `hourness-peak-wait`（§14）。循环行合入之前，事件条目由 M7 的退路执行者执行 |
| 指标流水（`metrics`，设计 0.2 半成稿，只到 §10） | 已批准；不在自举路径上（`d-dogfood-scope`） | `emitMetric` 的出口；报告从它算 | 定稿后只改 `src/execute/metrics.ts`；之前报告从图、检查与前进的记录算；M7 的验收不要求事件已写进真正的指标流水（R4-F8，§3.16）。metrics 0.2 写给 M7 的几条（不要 `metrics-gaps.jsonl`、派发工具加理由类别、比率不进主 Agent 的对话）等指标流水定稿时由编排方处理（R4-N10，§18.2） |
| M5（设计 0.3） | 已批准，未实施；不在自举路径上，也不参与 `src/data/lock.ts`（由 M7 的 E3 建，R4-F9 裁定） | `glmHournessLessons` 的 `relevant`、`propose`、`stats`、`hygiene`；`LESSONS_TOOL_NAMES`；`src/data/secret-shape.ts` | 没有服务时接缝空转；M5 实施时导入 E3 建的锁模块 |
| M4（设计 0.4） | 定稿；不在自举路径上 | 写给 M7 的四件：G1 的 `installRuleGate` 取代 `evaluate`、`PROMOTION` 是影子转生效的唯一判据、`peekGrant`/`outsideDenial`/`openRequests`、汇合门禁的 `scratchLeftovers` | 0.5 不处置，何时处置见 §18.2（R4-F10）：E4 照 main 上现有的 guard 框架写；M4 的 G1 合入时谁后合入谁改；`PROMOTION` 一条在 P2 之前处置 |
| 接管项目（设计 0.2） | 评审中 | 用 `GATE_LINE_FORMS`；给 `gate-norm.ts` 加 `changed` 写法；按 §3.8.5 的判定写法给别的项目起草底线清单 | 接管的草稿要把路径写进反引号里的判定写法（§14 批注） |
| `ablation`（已批准的任务） | 排在 split 之后 | 练习题运行目录移出仓库、事后扫描、对照开关（§3.14） | P4 排在它之后；它不把扫描做成每次运行的一步时，P4 在 `run-calibrate.mjs` 里加（0.2 评审 F26） |
| plain-ui（设计 0.7） | 定稿 | 晨报用词；流程条显示推出的阶段；规则页与循环板页的显示；面板读 `derivedStage(graph, node)` 与图上模块的形状（§2.4，§11「两层循环」第 6–9 条） | 只影响文字与面板显示 |
| M6 | 设计评审中 | 积分口径（晨报的花费）；高峰的计算 | — |

## 8. 实施分解

分支 `m7`，工作树 `.worktrees/m7`，从 main 建。人看过一页放行稿、按 `question-37` A 改好十件活的「怎样算做完」之前不开工（`d-design-onepage`）。每步一个提交，提交信息带节点 id，文档与代码同一提交（`AGENTS.md`）。检查「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`。「今天必败」是这一步新增的检查在今天的代码上怎样失败。

### 8.1 骨架（E 步）

| 步 | 节点 | 内容 | 文件（只这些） | 层 | 今天必败 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- |
| E0 | m7-1 | `scripts/packages.mjs` 的 `hourness.src` 加 `execute`；写入范围的纯函数 | 改 `scripts/packages.mjs`；新建 `src/execute/scope.ts`、`tests/execute-scope.spec.ts` | L1、L2 | 导入失败 | 否 |
| E1a | m7-1、m7-2 | 纯函数：pins（含模块与目标祖先的 `releaseAt`）、简报门禁与渲染（门禁读 `ctx.release`，不读 `ctx.stage`）、计划、`childId` 与登记表的纯部分、`checkModelChoice`；`releaseOf`、`releaseAtOf`、`scopedTasks` 先用 M3 `modules.ts` 的类型写，文件还不在时按附录 0.5 §3.14.1 的签名写本地类型，M3 合入时改为导入；`releaseOf` 带第三个结果 `{ok: false, level: 'module', reason: 'unreadable'}` 与读模块的函数这个参数（R5-F3，L2 注入抛错的读法），`isDesignReview` 与简报门禁对模块设计评审的跳过（R5-F4，§3.7.5） | 新建 `src/graph/pins.ts`、`src/execute/brief.ts`、`plan.ts`、`attempts.ts`、`models.ts` 的纯部分与各自的测试 | L1、L2 | 导入失败 | 否 |
| E1b | m7-3、m7-4、m7-5 | 纯函数：审查规整、`roundsSinceHuman` 与收敛、`askDraft`、`parseFloor`（含 `unparsed` 与从严）与 `floorHits`、`parseGateNorm`（含 `only`、`GATE_LINE_FORMS`）、`advanceOk`、`pushOk` 与执行前的写法分类（输入是解析好的 git 调用，含 `pull`、远端跟踪引用与推送各行，以及 §3.8.4 表里 E3 评审补的六条写法，E3-9）、`derivedStage(graph, node)`（目标与模块）、`goalCompletion`（含设计中的模块一条）、`tiers.ts` 的 `returnsOf`、`pendingReport`、`batchOf`、自动推进的判断表（含按模块的放行认法、第一个与之后的模块放行、移到新持有者、重启前的暂停、`hourness-peak-wait`、`hourness-design-wait`；goal 为 `paused` 一律按人暂停，不读高峰状态）、空转与高峰两个计数、条目表与事件声明（形状照循环板 `src/loops/model.ts`，每个 `tell` 带 `wake`；循环板的文件还不在时 E1b 先按循环板 0.6 §2.2、§2.3、§3.1 的类型在 `entries.ts` 里写本地类型，循环行合入时改为导入，契约测试钉住两边可互相赋值） | 新建 `src/execute/review.ts`、`asks.ts`、`floor.ts`、`gate-norm.ts`、`tiers.ts`、`advance.ts` 的纯部分、`entries.ts` 的表、`src/graph/execute-stage.ts` 与测试（含 `tests/execute-modules.spec.ts`、`tests/execute-tiers.spec.ts` 的纯函数部分）；测试里要过 M3 的 `proposalLineRefusal` 与 `plainWordsIn` 的那几例等 M3 第 3、6 步 | L1、L2 | 导入失败 | 否 |
| E2 | m7-1 | schema；工具名契约（`EXECUTE_TOOL_NAMES`、`WORKER_TOOL_NAMES`、`OPERATE_TOOL_NAMES`、常驻名单；`DISPATCH_TOOL_NAMES` 不在 E2 里建，它属于整块规则板的门，规则板合入时再加 `dispatch_task`，R4-F9）；薄适配层；`emitMetric` | 新建 `src/execute/schemas.ts`、`src/execute/metrics.ts`；改 `src/shared/tool-names.ts`、`src/shared/dsh-min.ts`、`tests/contracts.spec.ts` | L1、L2 | 契约测试断言常驻名单含 `dispatch_task` 失败 | 否 |
| E3 | m7-5 | git 执行器（每次调用带 `--no-replace-objects`；工作树、`--no-renames` 的改动清单、按内容比对、尾注、门禁工作树守卫与先存快照、按祖先关系改名、监视文件摘要、远端跟踪引用与它的 reflog 说明、`ls-remote`）；门禁锁（`src/data/lock.ts` 由 E3 建，照 M5 §5.3 的契约；编排方对 R4-F9 的裁定：M5 不在自举路径上、不参与，规则板最小一片不需要锁，整块规则板之后要锁就导入它） | 新建 `src/execute/git.ts`、`src/execute/gate-lock.ts`、`src/data/lock.ts`、`tests/execute-git.spec.ts`、`tests/execute-gate-lock.spec.ts` | L2 | 导入失败 | 是（动工作树与锁） |
| E4 | m7-1、m7-2 | 执行行、`dispatch_task`（模型、理由、审查深浅、对规则板最小一片的 `glmWorkerCap` 的一次读、说明里的示范）、简报门禁按模块判（`not_released`，含读不出模块时拒绝，R5-F3；模块设计评审的跳过与 `dispatch_task` 的模块一路，R5-F4，§3.7.5；记录形状在这一步合入之前交给 M3）、工作树与准备命令、登记表、工具面过滤（含非主 Agent 的图写工具）、五条 worker 规则（含放行状态一项、快照与 §3.8.5 格式的命令记录）与 `EXECUTE_RULES`（§12.1）、请求送当前持有者、行登记与行健康 | 新建 `src/execute/index.ts`、`dispatch.ts`、`faces.ts`、`examples.ts`、`src/guard/execute-rules.ts`、`tests/execute-examples.spec.ts`；改 `src/guard/main-agent.ts`、`src/guard/git-snapshot.ts`（只加导出）、`src/design/identity.ts`（F18 的一句）、`src/workflow/index.ts`、`src/shared/health.ts`、`packages/hourness/cordis.patch.yml`、`scripts/packages.mjs`（加行）；测试；探针场景 | L2、L3（`glm-exec-dispatch`、`non-glm-exec-dispatch`） | 没有 `dispatch_task`；假宿主上 worker 写范围外的文件被放行；worker 的 `git push` 被放行；执行行启用时 `main-agent-no-write` 的正路仍指向 `subagent` 工具（F18）；少做高峰里第二个 GLM 派发被放行（用规则板最小一片的真实 `PeakModeService` 类型）；未放行的模块下的任务被派出去；读模块的函数抛错时分了模块的目标仍派得出去、在跑的 worker 仍写得了（R5-F3）；设计中的模块的设计评审被 `not_released` 拒绝（R5-F4）；示范里去掉 `review.why` 仍通过 | 是（guard 规则、工具面） |
| E5 | m7-1 | 计划与通信 | 新建 `src/execute/requests.ts`；改 `index.ts`；测试 | L2、L3（`glm-exec-plan`） | 计划获批之后写入仍被拒 | 是 |
| E6 | m7-4、m7-2 | 交回处理、有效深浅与审查任务、派审查（深浅改动、`floor_requires_full` 与 `floor_unparsed`）、全审覆盖核对、收敛与停下、`execute.stop-draft`、经验接缝（无服务的路径）、模块设计评审的交回处理与模块上的记录（R5-F4，§3.7.5） | 新建 `src/execute/handback.ts`；改 `index.ts`、`dispatch.ts`；测试 | L2、L3（`glm-exec-review`） | 碰到底线清单的改动按轻审派审查被放行；清单有一条判不了时，声明不审的活被按不审处理 | 否 |
| E7 | m7-5 | `check_commit`、检查的 provider、检查记录、`trunk-advance-checked` 的执行前与执行后（本地主干与远端跟踪引用、`pull`、推送）、证据与完成（审查没过的先不完成）、`hourness.trunk-advanced`、`hourness.outside-advance`、主干全量检查 `trunkCheck`（覆盖规则、后台） | 新建 `src/execute/check.ts`、`gate-provider.ts`；补全 `advance.ts`；改 `index.ts`；测试 `tests/execute-advance.spec.ts`、`execute-upstream.spec.ts`、`execute-check.spec.ts` | L2（临时仓库，带一个裸仓库当远端）、L3（`glm-exec-merge`） | 主 Agent 的 `git merge --no-ff` 让主干前进到没检查的提交；`git fetch . X:refs/remotes/origin/main` 之后 `git merge --ff-only origin/main` 被放行（0.3 的豁免）；主检出在另一个分支上时，`git push . feature:main`、`git branch -M feature main`、`git worktree add -B main <路径> feature`、`git pull . feature:main`、`git symbolic-ref refs/heads/main refs/heads/feature` 任一条被放行，或 `git push . feature:refs/remotes/origin/main` 被放行（E3 评审 E3-9） | 是（主干） |
| E8 | m7-3 | 自动推进（开始、按模块的放行与之后每个模块的放行、移到新持有者、重启后恢复、重启前的暂停、人停下的认法、等人后的恢复、高峰里停住与接上、目标被退回设计时停住与再放行后恢复）、三档的后果（退回的认法与批注、受影响的活、第一档的批次标记、`batchOf`）、完成门禁与凭据、目标整体的审查、`await_human`、空转、对账与 `hournessHandback`、派发状态提醒（含模型目录）、与循环板的接缝（`contribute`、`emit`、`runAction`、退路执行者、看门、`actions.jsonl`）、`drive.jsonl`；M3 阶段提醒的四段、`norm-merge-gate` 一句与 `norm-review-floor` 一句 | 新建 `src/execute/drive.ts`、`notice.ts`、`loop-link.ts`、`drive-log.ts`；补全 `entries.ts`、`tiers.ts`；改 `index.ts`、`src/design/stage-notice.ts`；测试 `tests/execute-drive.spec.ts`、`execute-peak.spec.ts`、`execute-reconcile.spec.ts`、`execute-entries.spec.ts`、`execute-loop-link.spec.ts`、`execute-metrics.spec.ts`，模块与三档的 `execute-modules.spec.ts`、`execute-tiers.spec.ts` 补全 | L2、L3（`glm-exec-drive`、`glm-exec-modules`） | 放行之后没有 goal；`update_goal complete` 在缺证据时被放行；假的循环板收下了条目却不调 `runAction` 时，放行之后一直没有 goal；第二个模块放行时又建了一个 goal；模块被退回设计后在跑的 worker 仍能写、仍进审查 | 是（目标完成、harness 建 goal、接缝） |
| E9 | m7 | 骨架端到端：L3 `glm-exec-skeleton`；真实模型跑一次（§10.3）；合入 main，之后一个提交把 `execute` 改为默认启用；批次 L4（§9.2） | 探针场景与文档 | L3、真实模型、L4 | `glm-exec-skeleton` 在第一次 `dispatch_task` 就失败：工具不存在（0.2 评审 F27） | — |
| H1 | dogfood | 本仓库专用：`npm run probe` 在 git 工作树里自动建临时 profile，用完删除 | 改 `scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs`；`docs/DEVELOPMENT.md` §3 | L3 | 在工作树里跑探针加载的是主检出的 `dist` | 否 |

### 8.2 骨架之后（P 步）

| 步 | 节点 | 内容 | 文件 | 层 | 今天必败 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | m7-2 | 并行派发、补位提醒、两路 worker 的 L3 | 改 `dispatch.ts`、`notice.ts`；测试 | L2、L3（`glm-exec-parallel`） | 有空槽与可开工的任务时没有补位提醒 | 否 |
| P2 | m7-6、m7-8、m7-9 | 四答晨报、人的负担、降档后的返工、交付的四个数、周报、规矩阶梯与底线清单的提议（含草稿） | 新建 `src/report/four-answers.ts`、`metrics.ts`、`weekly.ts`、`ladder.ts`、`floor-proposals.ts`；改 `src/workflow/morning-report.ts`、`src/report/index.ts`；测试 | L2 | 今天的晨报没有「目标」一节 | 否 |
| P3 | m7-7、m7-6、m7-8 | 运维行：`hourness_report`、三条时间条目经 `contribute` 交给循环板、巡检（主干检查与巡检命令在后台，远端用 `ls-remote` 对照，没有检查记录覆盖的提交） | 新建 `src/operate/index.ts`、`entries.ts`、`patrol.ts`；改 `src/shared/health.ts`、`packages/hourness/cordis.patch.yml`、`scripts/packages.mjs`；测试 | L2、L3（`glm-operate-patrol`）；L4（冷会话投递） | 没有 `hourness_report` | 否 |
| P4 | m7-10 | 练习题（`ablation` 不做的部分）；`docs/ORCHESTRATION.md` §10.5 | 新建 `scripts/calibrate/read-fence.mjs`；改 `run-calibrate.mjs`、`tests/calibration/*/task.json`、`tests/calibration/lib.mjs`；测试 | L2、L3（`calib-fence`） | 读 `ws/` 以外的文件被放行 | 否 |
| P5 | dogfood | 复盘节点的生成 | 新建 `src/execute/retro.ts`；改各调用处 | L2 | 审查停下时图上没有复盘节点 | 否 |
| P6 | m7-2 | 经验板块接上 M5 的服务 | 改 `brief.ts`、`handback.ts` 的服务读取 | L2、L3 | 假的经验服务返回经验时简报里没有经验一节（0.2 评审 F27） | 否 |

### 8.3 先后与并行线

`question-28` C：没有副作用的就并行；改同一批文件或要桌面版的串行（0.2 评审 F20：不再写「谁先合入、另一方 rebase」）。0.5 起照编排方对 R4-F9 的裁定（`.agents/tasks/design-context.md`「Dogfood implementation order and runtime paths」，依据 `d-dogfood-scope`、`question-28` C、人说的「尽快自举吧」）：M7 的骨架不整个等 M3，也不等整块规则板；依赖按步写；凡是 0.4 写过「等整块规则板 R4」的地方，一律读作「等规则板最小一片（`d-rules-peak-slice`）」；整块规则板（最小一片以外的部分）排在 E9 之后，也就是自举开始之后；共享的登记文件后合入的一方把冲突的几行机械地并进去，不重审；`src/data/lock.ts` 由 E3 建，规则板最小一片不需要锁（若发现需要，它先建），M5 不在自举路径上、什么都不建。0.4 写的「M3 合入之后 E0 先做」「M3 → 规则板 R4 → E2」一类先后作废。

每一步什么时候能开工：

| 步 | 能开工的时刻 | 等什么 |
| --- | --- | --- |
| E0、E1a、E3 | 现在，从 main 开分支 | 不等。E0 与 M3 第 3 步都往 `scripts/packages.mjs` 加几行，后合入的一方机械并入；E1a 里 `releaseOf` 等用 M3 `modules.ts` 的类型，文件还不在时写本地类型，M3 合入时改为导入 |
| E1b | 纯函数现在可以写；测试里过 `proposalLineRefusal`、`plainWordsIn` 的几例等 M3 第 3、6 步 | M3 第 3 步（`plainWordsIn`）、第 6 步（`proposalLineRefusal`） |
| E2 | M3 第 6 步合入之后 | 两者都改 `src/shared/tool-names.ts` 与 `tests/contracts.spec.ts` |
| E4 | M3 第 3–5 步合入、规则板最小一片的行登记合入之后 | 行登记与 `src/shared/peak-mode.ts` 同属最小一片的 R1，登记合入时这个文件已在，所以 E4 的少做上限那一处读直接对着真实的文件写；万一片子的服务实现（`stateFor` 的真实内容）晚于 E4，E4 之后的第一个提交补上对真实服务的核对，L2 由 M7 带（R4-F6） |
| E5 → E6 → E7 → E8 → E9 | 依次（都改 `src/execute/index.ts`）；E6、E7、E8 等 E1b，E7 等 E3，E8 里与模块放行有关的部分等 M3 第 9 步 | 同左；E8 的高峰停住那一处读同 E4 |
| H1 | 随时，dogfood 之前合入 | 不等 |
| P1、P2、P5 | E9 之后，文件不相交，可以并行；P3 等 P2；P4 等 `ablation`；P6 等 M5 | 同左 |

跨设计的同一批文件（编排者按表里的先后开工；「机械并入」指后合入的一方把冲突的几行并进去、不重审）：

| 文件 | 涉及的步 | 先后 |
| --- | --- | --- |
| `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`src/shared/health.ts` | M7 E0、E4、P3；M3 第 3 步；规则板最小一片；整块规则板与 M5 在 E9 之后 | 谁后合入谁机械并入，不排次序、不重审 |
| `src/shared/tool-names.ts`、`tests/contracts.spec.ts` | M7 E2；M3 第 6 步；规则板最小一片；M5 | E2 等 M3 第 6 步；其余后合入的一方机械并入 |
| `src/guard/main-agent.ts`、`src/guard/git-snapshot.ts`、`src/design/identity.ts`、`src/design/stage-notice.ts` | M7 E4、E8；M3 | M3 合入 → E4 → E8 |
| `src/rules/builtin.ts`（代码规则目录） | 规则板整块的 R1（E9 之后） | M7 不改它；M7 导出 `EXECUTE_RULES`（`src/guard/execute-rules.ts`），规则板整块合入时映射。最小一片的 `builtin.ts` 只有默认规则 `GLM_PEAK_PRICING` 与按档位启用的附属条目 |
| `src/workflow/morning-report.ts`、`tests/workflow.spec.ts` | M7 P2；规则板 R7（整块） | P2 → R7（规则板的一节加在四答晨报之后） |
| `src/data/lock.ts` | M7 E3 建；整块规则板、M5 之后导入 | E3 建，不参与「先开工的一方建」；规则板最小一片不需要锁，若发现需要它先建，M7 的 E3 改为导入 |
| `src/execute/gate-norm.ts` | M7 E1b；接管的 `bootstrap-ratchet` | E1b → `bootstrap-ratchet` |
| `src/loops/service.ts`、`src/loops/model.ts`、`src/loops/trigger.ts`（M7 只导入） | 循环板 S1（在自举之后）；M7 E1b、E8 | 循环板不在自举路径上：M7 的 E1b 用本地类型，循环板 S1 合入的那一步（由循环板带上）把 M7 改为导入，契约测试同批 |
| `src/shared/peak-mode.ts`（M7 只导入） | 规则板最小一片（R1）；M7 E4、E8 | 片子先：E4 等它的行登记；M7 不再写「没合入时先不写这两处读」（0.4 那一句作废，R4-F6） |
| `src/graph/modules.ts`（M7 只导入） | M3 第 9 步建（面板 0.7 §11 第 5 条：谁先合入谁建）；M7 E1a、E1b、E8；面板第 5a 步 | 还不在时 M7 写本地类型，M3 合入时改为导入，契约测试钉住两边可互相赋值 |
| `src/graph/execute-stage.ts`（`derivedStage`） | M7 E1b；面板第 5a 步读它 | E1b → 面板 5a |
| `src/execute/floor.ts`（规则页导入 `parseFloor`） | M7 E1b；规则板整块的 R5 | E1b → R5 |
| `scripts/calibrate/` | M7 P4；`ablation` | `ablation` → P4 |

要桌面版的只有 E9 与 P3 的 L4：攒成两个批次（§9.2），按 `risk-shared-desktop` 的常设授权由编排方排队，同一时间一个持有者。

每步同批改的文档：E4：`docs/ORCHESTRATION.md` §3（派发）、§3.2、§3.5（模型由主 Agent 选）、§6.4（五条规矩）、`docs/DESIGN.md` §2.2、§2.4a（§4 的新用各行）、§2.5、§7；E5：§3.3；E6：§3.4（审查深浅与底线清单）；E7：§4.7（合入前的检查与主干前进的核对）、§14；E8：§2.1（自动推进）、§4.6、§4.8；E9：`docs/ROADMAP.md` 核实清单第 4、4b、12 项；P2：§9.2、§10、§12；P3：§11.4、§12（循环板上的默认条目）；P4：§10.5、`docs/DEVELOPMENT.md` §3。

## 9. 验证

### 9.1 L3 探针场景

都用 `probe-full`（GLM 探针模型）除非另写；工作区是运行目录下的临时 git 仓库，图是预置的副本（已放行的目标、带派发属性的任务、`norm-merge-gate` 的命令是 `node -e` 写的快速假命令、`norm-review-floor` 有一条 `files src/guarded/` 的判定写法）；主 Agent 模式与人的回话由 M3 的模拟人做（M3 附录 §3.10：发 `/wish`，在对话里回话），会话中途的命令经 M3 的 `line` 步发出。子 agent 按派发次序取探针 provider 的 `others` 脚本；场景里循环板不在，事件条目由 M7 的退路执行者执行。

| 场景 | 核对 |
| --- | --- |
| `glm-exec-dispatch` | 不带 `model` 的 `dispatch_task` 得到 `invalid`，`hint` 列出探针 provider 的目录；带 `model` 与 `why` 的当场返回 `childId`，主 Agent 在 worker 第一次请求之前又走一步；worker 的请求记录里模型就是选的那个、工作目录是 `.worktrees/hz-<id>`；派发批注有模型与理由；worker 的首条消息是简报，没有 DSH 的交回指引（U1）；worker 的工具面里没有 `graph_status` 等九个图写工具，按名调 `graph_status` 被拒，`graph_comment` 执行；范围内的 `Write` 执行、范围外与工作树外的被拒；`.hourness/` 里的报告可写；主 Agent 用原生 `subagent` 派出的子 agent 的 `Write` 被拒；worker 的 `git push` 被拒；worker 在自己工作树里 `git reset --hard` 之后有 `refs/hourness/snapshots/<id>` 与快照流水一行；交回后主 Agent 收到 `glm-hourness-execute` 通知，没有 DSH 的结算通知 |
| `non-glm-exec-dispatch` | 同上，非 GLM 探针模型，工具名是原生名（G3） |
| `glm-exec-plan` | 同 0.2：计划获批之前的写被拒；不合格的计划当场退回、主 Agent 没有通知；合格的写进正文、`answer_worker approve` 之后可写、有批准批注；`ask_main` 的回答回到同一次调用；主 Agent 的 `send_message` 在 worker 下一步到达（U3）；兄弟之间 `UNAUTHORIZED` |
| `glm-exec-review` | 声明轻审的任务交回、改动没碰底线：建审查任务，条目提醒主 Agent 派审查；主 Agent 选的审查模型出现在审查者的请求记录里。另一件改了 `src/guarded/x.ts`、声明不审的任务：有效深浅为全审，批注写明命中；主 Agent 以 `depth: 'light'` 派审查被拒（`floor_requires_full`）；全审的结论 `checked` 不全时这一轮作废并以同一模型重派一次。挡路发现里 `criterion` 不合格的一条被改为不挡路；第 2 轮挡路数不降时轮次批注带 `· 停下`，主 Agent 收到「停下之后」的提醒与草稿；`dispatch_task` 这个任务得到 `waiting_human`；模拟人回「再修一轮」、主 Agent `record_human_answer` 之后派发放行；之后第一轮仍不过就再停下（F21）。另一份图副本里 `norm-review-floor` 多一条没有判定写法的条目：声明不审、只改 `src/plain/x.ts` 的任务有效深浅为全审，批注写「清单有判不了的条目」，以 `depth: 'light'` 派审查得到 `floor_unparsed` |
| `glm-exec-merge` | 脚本化的主 Agent 在任务工作树里压成一个带 `Hourness-Task` 尾注的提交，`check_commit` 起外部激活（U2），驱动器等它（场景同时有 goal）；`checks.jsonl` 有一条通过的记录；主检出里 `git merge --no-ff hz/<id>` 被拒，纠偏写正路；`git merge --ff-only <提交>` 执行；执行后任务有 harness 的 `commit` 与 `test` 证据、转为完成、工作树已删、`advances.jsonl` 有一行；「合进主干之后」的全量检查跑了一次；另一次让一条命令失败：没有通过记录，`merge --ff-only` 被拒；脚本 `node -e` 里调 `git update-ref refs/heads/main <没检查的提交>`：执行后被发现，违规流水一条、没有证据，`check_commit` 补检查通过后证据补上并写明「检查在前进之后」；任务重开后再派：旧分支改名为 `hz/<id>@1`，再修再派一次复用新分支（F17）；只改 `docs/graph/` 的提交在规范有 `only docs/graph/` 时直接 `git commit` 在主干上被放行并记为按路径通过。上游（运行目录里一个裸仓库当 `origin`，场景预先往里推一个带尾注、没检查过的提交）：主 Agent `git pull --ff-only` 被拒；`git fetch . <提交>:refs/remotes/origin/main` 被拒；`git fetch origin` 执行，`advances.jsonl` 记一次拉取；`git merge --ff-only origin/main` 在 `check_commit origin/main` 之前被拒、之后放行；脚本里 `git push origin <没检查的提交>:main` 在执行后被发现，违规一条，「合进主干之后」的全量检查在那个提交上跑了一次 |
| `glm-exec-drive` | 第二个根 agent 承载主 Agent（`docs/ORCHESTRATION.md` §2.1 的做法）；模拟人同意放行之后，主 Agent 的下一步里出现 goal（没有任何命令），目标原文含验收条件，目标上有「自动推进已开始」批注；缺证据时 `update_goal complete` 被拒、goal 仍 active；`await_human` 让 goal 阻塞（`hourness-waiting-human`）；模拟人回话、主 Agent 记下之后 goal 恢复（U12）；脚本连续 3 拍只读，goal 以 `hourness-idle-rounds` 阻塞；模拟人说「继续」，主 Agent `update_goal resume` 成功；`line` 步发 `/goal pause` 之后监听器不恢复；`/wish off` 之后的 `update_goal complete` 不写图上的完成证据；主 Agent 对已结束的 worker 调 `send_message` 被拒。场景里循环板不在，所以放行之后建 goal 由退路执行者做。高峰里的停住与接上在 L2 测：高峰服务的假实现取规则板最小一片的真实 `PeakModeService` 类型（`src/shared/peak-mode.ts`），配注入的时钟（R4-F6，§6.6）；`AGENTS.md`：L3 的假宿主只给 rc.3 真宿主会给的信号，不另造本仓库别的行的服务。规则板最小一片合入之后它是真的行，带可注入的计价与时钟接缝时另有场景 `glm-exec-peak`（见下面 `glm-exec-peak` 一行） |
| `glm-exec-modules`（R5-F1，U30） | 预置一张两模块的图，用 M3 合入后的真实引擎写阶段（目标已放行，模块 A、B 都在设计中）；模拟人放行 A、不放行 B。核对上面 §6.6（a）（b）（c）的 headless 版本：B 下的任务 `dispatch_task` 得 `not_released`，A 下的派得出、worker 写得了范围内的文件；A 的 `hourness.design-released` 之后 goal 只建一次，B 之后放行时只批注、不建第二个 goal；A 的 `stage` 不带原话退回 `design` 之后，A 下在跑的 worker 的写入被拒、交回得 `stale`，B 不受影响；A 再放行后重派，简报带新的放行时刻；目标的 `stage` 带原话退回 `design` 之后 goal 以 `hourness-design-wait` 阻塞，再放行后 `goals.resume` 成功（`goals.block` 接受 `hourness-design-wait`，U30）；整个过程只有一个 goal。另核 §3.7.5：B 在设计中时 `dispatch_task {id: B}` 派得出审查，审查者的请求记录里模型就是选的那个，第一轮 `CHANGES_REQUESTED`、第二轮 `APPROVED` 之后 B 上有两条设计审查记录，最新一条的 `digest` 与方向清单对得上。再用一份图副本注入抛错的读模块函数：分了模块的目标派不出去，没分模块的目标照常（§6.6（g）的 L3 版本） |
| `glm-exec-peak`（R5-F1，只在规则板最小一片带可注入的计价与时钟接缝时才有） | 注入固定的高峰时钟与计价，真实的最小一片 `PeakModeService`：少做、高峰、已有一个 GLM worker 在跑时第二个 GLM 派发得 `slots_full`，非 GLM 的照常；只剩被挡着的活时连着两个没进展的轮以 `hourness-peak-wait` 停住、没人被问；时钟拨到高峰结束后 goal 接上。最小一片没有这个接缝时，这一行写「不做」：用 §6.6 的高峰 L2（真实 `PeakModeService` 类型的固定实现）加类型契约测试，真实高峰的核对留到第二批 L4 的第 9 步，与 §10.3 第 5 条、§9.2 第 9 步的说法一致 |
| `glm-exec-skeleton` | 完整链条：放行 → 自动开始 → 派发（选模型）→ 计划 → 批准 → 写与提交 → 交回 → 派审查（选模型）→ 主 Agent 做提交 → `check_commit` → 快进 → 证据 → 派目标整体的审查（选模型）→ `update_goal complete` 放行 → 图上目标完成。模拟人只在 `/wish`、访谈的回答、同意需求与放行时出手；`norm-merge-gate` 在设计阶段由主 Agent 提议、随放行一起同意。headless 里没有循环板的服务（它只在有会话控制器的进程里提供，循环板 0.3 §3.1），所以由循环板执行的那一路在 L4 第二批核（§9.2 第 9 步） |
| `glm-exec-parallel`（P1） | 两个写入范围不相交的任务同时在跑；第三个相交的被 `scope_busy` 拒；一个交回后主 Agent 下一步有补位提醒，再下一步没有 |
| `glm-operate-patrol`（P3） | 假的循环板服务收下三条时间条目（只读、时刻、来源）；`hourness_report {kind: 'patrol'}` 报出已关任务的干净工作树、不干净的工作树、内容已进主干超过 14 天的分支（时钟拨后）、主干领先上游的提交；主干 24 小时内没有通过的全量检查时跑一次；门禁锁被占时记「跳过」；距上次超过 26 小时报漏跑 |
| `calib-fence`（P4） | 练习题覆盖层里脚本化的模型读 `ws/` 以外的文件被拒、`fence.jsonl` 有记录；这次运行 `valid: false`，不进汇总 |

这些场景不花积分。合入 main 之前全部探针一次通过。

### 9.2 批次 L4

第一批在 E9（骨架合入、`execute` 默认启用、主检出重建之后），第二批在 P1–P3 合入、循环板可用之后。桌面版按 `risk-shared-desktop` 的常设授权直接用，编排方在运行之间排队，同一时间一个持有者；合入与重建时桌面版关着。在主检出 `.llm/` 下建一个临时工作区（一个很小的 Node 项目、一个 git 仓库、空的 `docs/graph/`），不写本仓库的图：

1. GLM-5.3 会话 `/wish` 一句话需求，在对话里走访谈、同意需求与放行（M3）；主 Agent 在设计阶段提议 `norm-merge-gate`（命令 `node --test`），随放行一起被同意。
2. 不发任何命令：DSH 的目标条上出现 goal；主 Agent 派一个 worker，写了模型与理由（记下它选了什么）；面板「正在做」里 worker 站在任务上。
3. 计划写进任务正文；主 Agent 批准之后 worker 写文件。
4. 主 Agent 派审查（记下模型）；用 git 做出提交、`check_commit`、快进：临时工作区的 `main` 多一个带尾注的提交；面板上任务转为完成。
5. 主 Agent 派目标整体的审查；完成门禁放行；图上的目标转为完成，DSH 的 goal 收尾。
6. 再起一个任务，在目标条上暂停：不被自动恢复；在目标条上恢复后接着做。
7. 推进中关掉桌面版再打开：goal 被自动恢复，丢失的派发在提醒里列出（U7、U24）；另记下关闭时 goal 有没有先变成 `paused`、`drive.jsonl` 里 `pause` 与 `exit` 隔了几秒（U25）。
8. DeepSeek 会话里同样派一次（G3）。
9. 第二批另核：循环板上看得到 M7 的十条默认条目、都只读、每条有 `why`；再放行一个目标，goal 由循环板调 `runAction` 建，`actions.jsonl` 里这个动作有 `start` 与 `end`，没有 `execute.loop-fallback`；晨报由「每天 08:30」条目到点送进主 Agent 的对话（把时钟或条目的下一次时刻调近）；关掉主 Agent 所在的标签页后等一条到点提醒投递（U8）；有高峰时在一个工作日的高峰里核一次：少做档下已有一个 GLM worker 在跑时第二个 GLM 派发得 `slots_full`；只剩挪开的活时 goal 以 `hourness-peak-wait` 停住、没人问你，高峰结束后接上；整个过程里主 Agent 照常回话（U26）。规则板最小一片没有可注入的计价与时钟接缝时（§9.1 `glm-exec-peak` 不做），这是真实高峰的第一次核对。
10. 桌面版日志没有本包的新错误；用过模型菜单就换回 `agent-default-model`（`docs/HANDOFF.md`）。

## 10. 最薄端到端骨架（`dogfood` 的起点）

### 10.1 骨架包含什么

`/wish` → 访谈（聊天）→ 人同意需求与放行（M3 的 `record_human_answer`）→ harness 看到放行、建 goal 开始自动推进 → `dispatch_task` 一个写任务（模型与理由、简报门禁、工作树、写入门禁）→ `submit_plan` 与 `answer_worker` → worker 写、提交、交回 → 交回处理（有效深浅、审查任务）→ 主 Agent 选模型派审查（规整与收敛）→ 主 Agent 用 git 做出带尾注的提交 → `check_commit`（外部 provider、门禁锁、`norm-merge-gate` 的命令、检查记录）→ 主 Agent 快进主干、harness 执行前核对与执行后记证据 → 主 Agent 选模型派目标整体的审查 → 完成门禁（放行凭据）→ 目标完成。重启后的恢复与对账、空转阻塞、`await_human` 与等人后的恢复在骨架里（E8），没有它们，自举中的一次重启或一次等人就会让推进卡住或空转。循环板不在时事件条目由 M7 自己执行，骨架不等循环板；循环板在时由它执行，M7 的看门兜底（§2.5）。高峰里的停住与接上、少做上限的那一次读在 E4、E8 里，对着规则板最小一片的 `src/shared/peak-mode.ts` 写（`d-rules-peak-slice`：「M7 骨架 E4 的少做上限读法照原设计生效，M7 不加临时的高峰逻辑」）；自举路径上规则板只有这一片，整块规则板在 E9 之后，M7 不等它（§8.3，R4-F6、R4-F9）。两层循环（按模块放行、三档、成批，§3.9.7）在 E1a、E1b、E4、E8 里：骨架的端到端场景 `glm-exec-skeleton` 用没分模块的目标，两个模块的用例在 L2 与 `glm-exec-modules` 里，因为自举之后要做的 M4、M5、M6 一类模块马上用到它。

人在骨架里出现四次：许愿、回答访谈、同意需求、同意放行（`norm-merge-gate` 在设计阶段提出，随放行同意）。之后人不发命令。

实施上是 E0–E9，加本仓库专用的 H1。

### 10.2 骨架不包含什么

并行派发的补位提醒（P1；`slots` 与写入范围相交照常生效）；四答晨报、周报、规矩阶梯、底线清单的增类提议、交付的四个数（P2）；三条时间条目与巡检（P3，等循环板；骨架期间分支的清理与夜间检查不跑，「合进主干之后」的全量检查照跑）；练习题（P4，等 `ablation`）；复盘节点的自动生成（P5；骨架期间由编排者手记）；经验板块（P6，等 M5）；整块规则板（规则页、人加的规则、拦路的门、等待单、代码规则目录，E9 之后）：自举期间少做档的并发上限生效（最小一片），不做档对子 agent 派活的排队不生效，主 Agent 本来就不受高峰影响。

### 10.3 骨架的验收与 dogfood 的开始条件

1. §9.1 的骨架场景全部通过（L3）：`glm-exec-dispatch`、`non-glm-exec-dispatch`、`glm-exec-plan`、`glm-exec-review`、`glm-exec-merge`、`glm-exec-drive`、`glm-exec-modules`、`glm-exec-skeleton`（点名了，R4-N8 顺带做了；P1、P3、P4 的场景不属于骨架）。
2. 真实模型跑一次：在运行目录的临时仓库里，用 headless 加探针的「第二个根 agent」做法，主 Agent 用 GLM-5.3，从已放行的目标跑到目标完成；worker 与审查用什么模型由主 Agent 选，记下它的选择与理由、步数、积分、被拦次数、问答次数。可选的 GLM 模型是本仓库通道的目录 `glm-5.3`、`glm-5.3-flash`（`src/glm-llm/models.ts`:25–28，经 `listModels` 给出，`src/glm-llm/zcode.ts`:316–319；ZCode 3.17.1 的包里同样有这两个 id，`reference/zcode-3.17.1/zcode.cjs` 第 386–387 行的模型 id 映射：`glm-5.3` 在 386，`glm-5.3-flash` 在 387）。花积分按 `norm-decision-tiers` 的常设授权，花费进晨报；这是一次性的骨架验收，不算定期的练习题。
3. 第一批 L4 通过（§9.2）。
4. 一页放行稿已由人放行，十件活的「怎样算做完」已按人的原话改好（`question-37` A）；H1 已合入。§13 的两件人回答之前也能开始，两件都往严一侧：① 没加之前每件写任务都全审（§3.8.5 第 3 种，评审 F2），② 没加之前只改项目图的提交每次都跑全部命令。放行稿里「替你定了的方向」一栏另有一行：八道代码里的门首日直接生效，是对宪章「写在代码里的新门禁先影子」的例外，人放行时看到，不同意就按 §12.1 的办法改为先影子（R4-F7）。
5. 规则板最小一片（`d-rules-peak-slice`）已合入，M7 对它的两处读已验过（R4-F6，`dogfood` 节点把这一片列为自举的子条件）：L2 用片子的真实 `PeakModeService` 类型（`src/shared/peak-mode.ts`）和固定实现过 §6.6 的高峰用例（少做、高峰、已有一个 GLM worker 时第二个 GLM 派发得 `slots_full` 而非 GLM 的照常；没有 `glmWorkerCap` 时照常；连着两个没进展的轮以 `hourness-peak-wait` 停住）；片子带可注入的计价与时钟接缝时再过 L3 `glm-exec-peak`；没有这个接缝时，接受 L2 加类型契约测试，真实高峰的核对留到第二批 L4 的第 9 步。没有这一条，骨架场景全过、第一批 L4 通过，自举就会开始，而 M7 读规则板的两处从来没对着真实的服务类型跑过。

满足之后，编排者把本仓库的下一件实现任务（建议 P2，文件与别的线不相交）交给 DSH 里的主 Agent 做，Kiro 只观察；卡住、返工、要人救场的地方记成节点（`dogfood` 的验收），P5 合入之后由 harness 自动记。

## 11. 不做的事

- 循环板本身（显示、时间触发、投递、执行记录）：`schedules`。M7 只交条目与事件，并在循环板没收下、没接住时执行自己的事件条目。
- 指标流水本身（格式、写入、按时段切）：`metrics`。M7 只调 `emitMetric`。
- 规则板本身（信号、规则、等待单、高峰档位的执行）：规则板设计。
- 经验板块的存储、去重、面板与失败匹配：M5 的 `lessons`。
- 真实项目试用的安装、匿名化导出与反馈回收：`field-trial`。
- 档位映射、默认模型、「审查高一档」、按难度推荐模型（`d-main-agent-models`）。
- harness 替主 Agent 合并、压缩、推送或删分支；`merge_task`（`d-main-agent-shell`）。
- git 钩子（例如 `reference-transaction`）：它在主干前进的那一刻最准，但它也管人自己在终端里的提交与别的工具（`docs/CHARTER.md` §6 不替用户做主；接管设计 §5.6 同样不写 git 钩子的理由），`.git/hooks` 不进版本控制，项目已有 husky 一类时会冲突。
- harness 写给人的待决、选项卡与回写标签（`d-chat-not-cards`）。
- `/drive`、`/patrol`、运维会话（`d-auto-drive`、`d-one-main-agent`）。
- 知识同步的机械检查、草稿区的检查（同 0.2）。
- 晨报的界面、「讲细点 / 说重点」的按钮：M8 与 M3（五键已变成人说的五种话）。
- 逐 token 的 agent 间对话；worker 之间直接通信；用 `send_message` 唤醒被中断的 worker。
- 自动切换人给主 Agent 选的模型、套餐或渠道；预算与按次计费上限。
- 练习题运行目录移出仓库、事后扫描、对照开关：`ablation`。
- 改图引擎的权限与节点字段。
- 跨仓库、跨机器的派发。
- 自己算高峰、读档位或时钟：都由规则板给（`glmWorkerCap`、`peakHoldFor`）；高峰结束叫醒主 Agent 的条目归循环行（`loops.peak-end`），M7 只交 `execute.resume-drive` 与一个兜底定时器。
- 因高峰暂停、排队或拦主 Agent，也不指望规则板这样做；读规则板已删去的 `heldForPeak`（`d-main-agent-peak-exempt`，R4-F1）。
- 替主 Agent 判一个问题属于三档的哪一档，或只停「受影响的」活：前者是语义判断，归主 Agent；后者做不到（框架改了哪些模块受影响，harness 不知道），所以第三档整个目标停下，由主 Agent 在重新放行之后重派（§3.9.7）。
- 在面板上放行模块、改模块清单或方向清单：M3 与面板（面板只看）。
- 管推到别的远端或别的分支的推送：只守上游的主干。
- 拦人自己在终端里对主干的提交、拉取与推送：只记下来、跑全量检查（`docs/CHARTER.md` §6）。

## 12. 由 agent 定、人可推翻的事项

命名：行 `glm-hourness/execute`、`glm-hourness/operate`；目录 `src/execute/`、`src/operate/`；工具 `dispatch_task`、`answer_worker`、`check_commit`、`await_human`、`hourness_report`、`submit_plan`、`ask_main`；规则 `execute:worker-scope`、`execute:dispatch-chain-readonly`、`execute:worker-graph-readonly`、`execute:worker-git`、`execute:worker-message-live-only`、`execute:trunk-advance-checked`、`execute:completion-gate`、`execute:stopped`；provider `hourness-gate`；投影 `hournessHandback`；notice 来源 `glm-hourness-execute`、`glm-hourness-loop`；schema `hourness-handback-v1`、`hourness-review-v1`；事件 `hourness.*`（§2.5）；条目 id `execute.*`、`operate.*`（§3.11.1）；指标事件 `execute.*`、`operate.*`（§3.16）；运行时文件 `<proj>/.llm/execute/`、`<proj>/.llm/operate/`（§2.1）；工作树 `.worktrees/hz-<id>`、分支 `hz/<id>`、`hz/<id>@<n>`、门禁工作树 `.worktrees/hz-gate`；报告目录 `.hourness/`；提交尾注只有 `Hourness-Task`（0.2 的 `Hourness-Attempt`、`Hourness-Branch-Tip` 删去：提交信息由主 Agent 写，分支的判断改按祖先关系）；停下标记 `· 停下`；goal 阻塞码 `hourness-waiting-human`、`hourness-idle-rounds`、`hourness-peak-wait`、`hourness-design-wait`（0.5，§3.9.1）；规则常量表 `EXECUTE_RULES`（`src/guard/execute-rules.ts`，§12.1）；harness 动作 `execute.start-drive`、`execute.trunk-check`、`execute.reconcile`、`execute.resume-drive`、`execute.stop-draft`；服务 `glmHournessExecute`（`isWorker`、`runAction`）；拒绝码 `floor_unparsed`、`gate_snapshot_failed`、`graph_unreadable`；运行时文件 `actions.jsonl`、`drive.jsonl`、`reconcile.jsonl`、`metrics-gaps.jsonl`。

做法（选它的理由与没选的做法）：

- 放行在主 Agent 的每一步与持有者会话创建时从图上认出来：面板上改的、对话里记的、重启之后的都认得到。没选：在 `record_human_answer` 的执行后监听（只认得对话里那一条路，重启之后漏掉）。
- 重启后自动恢复，人暂停或清掉的不恢复：重启不是人决定停下，人要的是「推进到底」；暂停与清掉是人的动作。没选：重启后等人说继续（与 `d-auto-drive` 不符）；连人暂停的也恢复（推翻人的动作）。
- 没走设计循环的已批准目标不自动开始：迁移来的老目标被聚焦时突然开始花积分，人不会预期。没选：任何已批准目标一聚焦就开始。
- `model` 与 `why` 必填，没有默认：harness 不替主 Agent 选（`d-main-agent-models`），周报的对照才有意义。没选：缺省继承主 Agent 的模型（悄悄替它选了）。
- 模型目录只作参考，读不到时放行并注明：rc.3 的目录不约束路由（llm:2080–2083）。没选：读不到就拒绝（没有目录的 provider 派不出去）。
- 审查深浅在派活时声明（缺省全审），派审查时可以改：`question-38` C 写的是「派发时写」；「不审」需要一个记录的地方；缺省全审是往质量一侧错。没选：只在派审查时定（不审没有地方记）；缺省轻审。
- 审查由主 Agent 派，harness 只建审查任务与提醒：模型要由主 Agent 在看过交回之后选。没选：harness 用派活时预先写下的模型自动派（模型选在看到改动之前，且有两条派审查的路）。
- 底线清单在主干前进时按内容核对（文件内容等于某次全审看过的那一份）：主 Agent 怎样压缩、变基、合并都能认，解冲突改了底线文件就不认。没选：按任务核对（压缩与多任务合成一个提交时对不上）；按 patch-id（同上）。
- 底线清单的判定写法写在验收里的反引号中：验收只有人的权限能改，主 Agent 改不松它。没选：写在正文（LLM 能改正文，等于能绕过）；按仓库写在代码里（包里带了项目的内容，违背接管设计的「机制不带内容」）。
- 清单里有一条判不了，每件写任务都按全审（评审 F2，失效安全默认）：判不出时取更严的一侧；代价是人回答 §13 ① 之前多审，往质量一侧错；降档要等人给每条写上写法之后才有。没选：只对判不了的那几条不强制（0.3 的做法：等于在人回答之前暂停人定的「主 Agent 绕不过去」）；判不了就让主 Agent 自己判（它能绕过去）。
- 清单节点不在图上时不强制，设计阶段提醒提议一张：没有人批过的清单就没有可执行的规矩；节点被 LLM 废弃不算数。没选：没有节点就一律全审（新项目的每件活都全审，人还没定任何类别）。
- 主干前进：执行前拒绝认得出的写法，执行后比对，主 Agent 每一步开始时再比一次；不用 git 钩子（§11）；不替主 Agent 合（`d-main-agent-shell`）。
- 拉来的提交同样要先检查（评审 F1）：删去 0.3 的「已在上游」豁免，主干上的 `git pull` 改成「fetch、check_commit、快进」三步。理由：人定的是「那个提交确实跑过合入前的检查」，没有说别处来的可以不跑；远端跟踪引用在本地，能伪造。代价：拉别人的提交多一次检查（几分钟）。没选：保留豁免但不写证据（评审给的最小改法：主干照样会前进到没检查的提交）；保留豁免、由 harness 用 `ls-remote` 核对远端（真的推上去的也没检查过，脚本推上去再拉回来就绕过了）。
- 拉来的内容不要求在这台机器上全审，只要求检查，并在晨报里列出：这台机器上没有人派过它们的审查，要求全审就永远拉不进来。没选：一律全审（没有派这种审查的路，要另造「审查别人的提交」的任务种类）。最可能不对的是这一条：人若希望别处来的、改了必须全审文件的提交也在这台机器上全审，就要加一种「审查拉来的提交」的派法。
- 远端跟踪引用当主干看：改它的命令执行前拒绝，推送按 `pushOk` 核对、执行后按 reflog 分拉取与推送，巡检对照 `ls-remote`。没选：不管推送（已发布的主干上会有没检查的提交，而人定的是主干只到检查过的提交）。
- 审查没过的活进了主干先不记完成（评审 N4）：主干照常前进（合入的先后由主 Agent 定），完成等审查。没选：审查没过时拒绝主干前进（会把合入顺序与审查耦合，主 Agent 常先合再审小改动）。
- 与循环板的接缝：照循环板 0.3 交条目、交事件、由循环板调 `runAction`；另加看门（5 分钟没认领就自己做）。理由：循环板的设计定了执行路径；但放行之后建 goal 是自动推进的起点，不能只靠另一行没出错。没选：三个动作一律 M7 自己做、循环板只显示（评审 F3 的第一种改法：与循环板 0.3 的分工不符，任务要求按它对齐）；只靠循环板（一项被丢掉或循环行出错时，放行之后不会有 goal，也没有人发现）。
- 高峰里连着 2 个被挡着的没进展的轮才停住：1 轮可能只是在想；停住省高峰价里的空转步。M7 自己在高峰结束 5 分钟后再看一次：循环板不在时也不问人（规则板 0.10 §3.6 建议的「照原来计」不取）。
- 重启前的暂停按 30 秒与没有人的输入判：人暂停后 30 秒内关掉桌面版会被恢复，提醒写明原因。没选：一律不恢复（桌面版关闭若会暂停 goal，每次重启都要人手动恢复，违背 `d-auto-drive`）。
- `/wish here` 之后推进跟着主 Agent 走，请求送给当前持有者（评审 N7）：移动主 Agent 是人的动作。没选：移交时中断旧主 Agent 派出的 worker（丢掉在做的活）。
- 没经检查的前进之后补检查，证据写明「检查在前进之后」，不要求退回：主干可能已经推送，退回要强推，那是收不回的动作。没选：一律要求退回重合。
- 检查绑定提交与清单摘要；`only` 让只差这些路径的两个提交共用一次检查：项目图的提交很频繁，不能每次重跑。没选：只绑树（清单改了照样算数）；每个提交都重跑。
- 任务与提交的对应用尾注 `Hourness-Task`，由主 Agent 写：它在 git 里、变基与压缩之后还在。没选：`check_commit` 带任务参数（不在 git 里）；按分支祖先判断（压缩之后对不上）。
- 任务完成时 harness 删干净的任务工作树，分支留给主 Agent：工作树是派发的基础设施，删干净的不丢东西；删分支是 git 的事。没选：harness 也删分支；什么都不删。
- worker 只碰自己的分支，危险命令先存快照：主干的整合归主 Agent；快照用 M3 的同一个函数。没选：worker 的 git 也放开（它能移动主干）。
- 问人只经主 Agent，harness 给事实与四行草稿：人唯一的窗口是主 Agent（`d-one-main-agent`），harness 不会聊天。没选：harness 直接写提议式待决（人看到的话不是在对话里提的）。
- 联动做成循环板上的数据，循环板没收下、没接住时 M7 按同一张表执行：明面上看得到（`d-rules-visible`），又不让自动推进依赖另一行一定不出错。没选：写死在代码里；没有循环板就不推进。
- 运行时文件放项目的 `.llm/`（0.5，R4-N1，`d-rules-in-repo`，编排方 2026-10-30 的裁定）：`<proj>/.llm/execute/` 与 `<proj>/.llm/operate/`，不入库，与规则板的 `.llm/rules/`、循环板的 `.llm/loops/`、指标流水的 `.llm/metrics/` 并列。0.4 放 `<exec>/`（理由是各工作树共用、与 M3 的快照流水同处），人说的位置是项目的 `.llm/`，两者在项目里，字面上不同，按人说的改。`<proj>` 是主检出的根，不随 worker 的工作树变，所以各工作树共用这一点保留；worker 的写入范围出不了自己的工作树，碰不到 `.llm/`。代价是 `git clean -fdx` 或换一台电脑重新克隆会把它带走：这些文件是检查与前进的记录，丢了只会让核对往严一侧错（检查要重跑，前进记录要靠巡检对照远端补），图上的证据与提交尾注不受影响，§5 末尾写了丢了的后果。没选：`projectHome`（桌面版上所有工作区共用）；仍放 `<exec>/`（与人说的位置不同）。
- 「合进主干之后」的全量检查按覆盖规则只补跑主干这个内容还没跑过的命令（采纳循环板 0.3 的建议），夜间巡检用同一规则：人提过合入之后跑一遍完整检查；每条都跑过一次就够，不在 `check_commit` 刚跑完的几条上重跑。没选：每次都把全部命令再跑一遍（0.3 的写法：一次 30 分钟，占住门禁锁、排住下一次 `check_commit`）；只在夜间跑。
- 子 agent 的工具面去掉图写工具（0.2 评审 F19）；门禁锁用 M5 的锁规则加 6 小时上限（F24）。
- 默认配置：`slots` 3；条目时刻 08:30、周一 09:00、02:30（本机时区）；门禁锁等待 60 分钟、持锁上限 6 小时；`maxGoalRounds` 500；计划等待 30 分钟、问题 20 分钟；每条命令 30 分钟；空转 3 拍；高峰里停住 2 拍、高峰结束后兜底 5 分钟；循环板认领 harness 动作的时限 5 分钟（主干全量检查做完的时限 6 小时，其余 10 分钟）；重启前的暂停 30 秒；分支清理的发现 14 天。改它们不改设计。
- 练习题的时机：每个 L4 批次跑一遍回归集；这一批新加的提示词节与每步注入各做一次对照（用 `ablation` 的开关）；花费进晨报（`norm-decision-tiers` 的常设授权）。
- 两层循环（0.5，R4-F2）：派发门禁按任务最近的模块祖先判放行，没有模块祖先时看目标；`derivedStage` 收模块；放行事件带 `module`，一个目标只建一次 goal。没选：只看目标一级（0.4 的做法：目标放行后任何模块的活都能派，哪怕那个模块的一页放行稿人还没看）；让目标等最后一个模块放行才到 `release`（M3 第 4 轮评审的方案 A：已放行的模块的开发被 `not_released` 挡住，「先放行的模块先开发」做不到）。
- pins 带放行时刻而不是「是否放行」的布尔：模块退回设计、改了、再放行之后，布尔变回原值，退回之前派出去的活又显得有效；时刻每次不同。没选：布尔。
- 第三档整个目标停下，不只停「受影响的」：框架改了哪些模块受影响，harness 不知道，主 Agent 也要在新框架放行之后才能逐个判；整个目标停下是安全的一侧，代价是没受影响的模块也要等重新放行。没选：只停主 Agent 点名的模块（漏点一个，就在错的框架上继续做）。M3 附录 0.5 §3.14.8 也写了这个粗度，要缩小时只改 M3 那一行的判定和 M7 的 `releaseOf` 的目标层。
- 第三档里 goal 以 `hourness-design-wait` 停住，不让它空转 3 拍再以 `hourness-idle-rounds` 阻塞：此刻主 Agent 在对话里和人重新定框架，那是它该做的事，空转阻塞会在这时叫它去问人，次序反了。没选：不停 goal（目标轮提示词会催它去派发，每一拍被 `not_released` 拒绝）。
- 三档的判据文字里「判不准取高一档」：高一档多花人一次放行，低一档错了是在错的设计上继续做，往质量一侧错。最可能不对的是这一条：主 Agent 若总是取高一档，人会被频繁请去放行；周报的「开发中退回设计的次数」（模块、框架各几次）就是看这个的。没选：判不准问人（每次都问，违背「少打扰人」）。
- 第一档的「告知」由批次标记驱动，harness 不读主 Agent 的回复正文：它读不了，也不该去读；它能确定的是「叫过它告知」。没选：要求 `propose_to_human` 的参数里列出自己定的事（把告知塞进问话，四行装不下，还会占问话的名额）。
- 成批的优先序：框架（第三档要人定的）、模块放行页、停下的审查与检查、周报的提议。理由：前两种挡着整块活，后两种挡着一件或不挡。没选：按时间先后（周报的提议会挤掉挡着活的放行页）。
- `worker-scope` 增加放行状态一项（0.5）：模块或目标被退回设计后，在跑的 worker 写不了。没选：只靠交回时的过期（worker 会继续写到交回才发现，白花步数与积分）；让 harness 中断它们（中断是主 Agent 的事，`d-main-agent-shell`）。
- 示范里的模型 id 是编的：编排层的包不点名模型。没选：拿本仓库通道的真实 id（会让编排层的说明依赖 GLM 包的目录）。
- 运行时文件在项目的 `.llm/`（0.5，R4-N1，见上）。
- 八道代码里的门首日全部 `enforce`（0.5，R4-F7，§12.1）：是对宪章 0.7「写在代码里的新门禁先影子」的例外，agent 定，人可推翻，放行稿让人看到。
- 沿用 0.2 的：执行阶段推出、不存；`delivery: 'caller'`；写任务一律用工作树；计划写在正文、批准记成批注；计划等待放在一次工具调用里；`ask_main` 与 `send_message` 分工；pins 只比语义字段；worker 对图只读；空转 3 拍；目标整体的审查不建节点；停下先写标记；复盘由 harness 记事实。
- 0.2 §12 的「规矩阶梯的提议走决策队列，不用五键卡」与 §14 第 6 条（`docs/ORCHESTRATION.md` §9.2 的五键）随 `d-chat-not-cards` 失效：五键已是人说的五种话，提议经主 Agent 在对话里问。

### 12.1 八道代码里的门：首日模式与转生效的办法（R4-F7，`docs/CHARTER.md` 0.7）

宪章 0.7（§3.2 第 3 条、§6）：规则板与循环板上人看过原文同意的条目即刻生效；写在代码里的新门禁照旧先影子后拦截（`docs/ORCHESTRATION.md` §6.5），新行默认禁用、验证通过后才启用（`AGENTS.md`）。M7 的八道门都在代码里，0.4 一个模式也没写。0.5 写在这里，并在 `src/guard/execute-rules.ts` 的常量表 `EXECUTE_RULES`（`{id, title, mode, lists?}`）里各存一份，规则板整块合入时映射进代码规则目录，模式取这张表（同 M4 0.4 §3.8 的 `GUARD_RULES`）。契约测试断言每个 id 在表里、每个模式是 `enforce` 或 `shadow`。

先说满足了宪章的哪一半：`execute`、`operate` 两行默认禁用，E9 验证通过（L3 骨架场景、真实模型一次、第一批 L4）之后一个提交才改为默认启用。没满足的一半是「先影子」：八道门首日都直接拦（`enforce`）。这是一个有意的例外，agent 定，人可推翻（人放行时在一页放行稿「替你定了的方向」一栏看到这一行）。两类理由：

- 第一类（`worker-scope`、`dispatch-chain-readonly`、`worker-graph-readonly`、`worker-git`、`worker-message-live-only`、`stopped`）：影子期的用处是先量误伤，而这些门管的对象（worker、审查者、派发链里的只读子 agent、停下后的派发）在 M7 之前不存在，没有已有的行为可量；它们拦的是越权写、越权 git、给已结束的 worker 发消息、停下后继续派，错放的代价是写进主检出或动了别的分支，拦错的代价是一次带正路的纠偏。
- 第二类（`trunk-advance-checked`、`completion-gate`）：它们守的是人定的保证，不是 agent 自己加的规矩：主干只前进到跑过合入前检查的提交（`d-main-agent-shell`），目标完成要 harness 的核对和证据（人批准的节点 `m7-3` 的第 2 条，加宪章 §6「门禁只认证据，不认自述」）。首日影子意味着自举期间主干的前进只在事后被发现、目标不经证据就能完成，与这两条保证本身相反；推送之后的主干收不回（§6.3）。

| 门 | 首日模式 | 误伤的代价与出路 | 错放的代价与兜底 | 若人要求首日先影子 |
| --- | --- | --- | --- | --- |
| `execute:worker-scope` | `enforce` | 拦下一次合法的写：给 worker 带正路（`ask_main`，可放宽写入范围后重交计划）；放行状态一项（模块或目标被退回设计）拦下的写也带正路 | 写出工作树或写范围外：进主检出或用户文件，M3 的快照不覆盖直接写；交回时另核改动的路径，只能事后发现 | 判定不变，命中时只记 `mode: 'shadow'` 并放行；交回时的范围外文件检查照旧兜底 |
| `execute:dispatch-chain-readonly` | `enforce` | 拦下登记表外的 agent 的写：带正路（`dispatch_task`）。它取代 M3 `design-before-release` 里已经在拦的一行，行为不变 | 原生 `subagent` 派出的子 agent 写在主检出上，绕过工作树、范围、审查与合入前的检查 | 同上；M3 那一行仍按 M3 的模式拦 |
| `execute:worker-graph-readonly` | `enforce` | 这九个图写工具本来就不在 worker 的工具面里，合法调用不会撞上它；撞上的是按名直接调用 | worker 与主 Agent 争修订号、绕过计划外变更走待决 | 同上 |
| `execute:worker-git` | `enforce` | 它读 shell 文本里的 git 调用，认不出的写法放行，所以误伤只会落在认得出的写法上：带正路（`ask_main`）；会丢未提交改动的命令前先存快照，存不了就拒绝，这一半是防丢数据，不在影子范围里 | worker 推送或动别的分支；动主干的由 `trunk-advance-checked` 的执行后比对兜底 | 认得出的越权写法只记不拦；快照那一半仍拦（它是数据保护，不是规矩） |
| `execute:worker-message-live-only` | `enforce` | 只拦给已结束的 `hz-` agent 发消息，没有合法的用法；带正路（重新派发） | 冷恢复出的激活没有 `outputSchema`，交回处理接不到，它的工作进不了审查与合入前的检查 | 同上 |
| `execute:trunk-advance-checked` | `enforce` | 拦下认得出的、会让主干前进到没检查提交的写法：带正路（先 `check_commit`，拉取的三步）；认不出的写法放行，所以误伤限于认得出的 | 主干前进到没检查的提交；已推送的收不回。兜底：执行后比对立刻发现、不给证据、记违规、全量检查在那个提交上跑一遍、巡检对照远端 | 执行前判定改为只记，保留执行后比对：此时「主干只前进到检查过的提交」降为「前进之后立刻被发现、不给证据」，违背 `d-main-agent-shell` 的字面，只在人明确同意时这样做 |
| `execute:completion-gate` | `enforce` | 主 Agent 的 `update_goal complete` 被拒并列出缺口；人在目标条上自己点完成不受这道门管（§3.9.3 末段），所以误伤不会卡死项目 | 目标不经证据就完成；兜底：凭据配对，配不到就不写完成证据，对账重算 | 缺口只记不拦：目标可以先完成，图上的完成证据仍只在门禁成立时写 |
| `execute:stopped` | `enforce` | 停下标记之后到人回话之前，拒绝派发这个任务与它的审查任务：带正路（在对话里把它问给人）；人回话即解除 | 在审查或检查一再不过之后继续派，白花步数与积分 | 同上，标记照写，派发放行 |

转生效的办法：若人要求首日先影子，把 `EXECUTE_RULES` 里对应门的 `mode` 改为 `shadow`。影子的语义取 M4 0.4 §3.1 的 `RuleMode`：判为违规时调用照常执行，违规流水里记 `mode: 'shadow', via: 'rule'`；M4 的 `installRuleGate`（G1）不在自举路径上，所以 E4 在那种情形下自己写一个十几行的影子包装（命中时记违规、放行），M4 的 G1 合入时换成 `installRuleGate`（谁后合入谁改，M4 §13.3），骨架里没有影子分支，因为首日全是 `enforce`，不留死代码。转生效的判据只有一个出处：M4 0.4 §3.5 的 `PROMOTION`（带标注的会拦样本至少 20 条含回放、实时影子至少 14 天、误伤 0），M7 不另定。转生效的过程照 M4 §3.5：达到判据时周报阶梯提一张决定者为人的待决，主 Agent 按四行在对话里问人，人同意后主 Agent 派一个任务把 `mode` 改回 `enforce`，提交带 L2、按 `norm-review-floor` 全审（这些门在 `src/guard/` 里，是第一类要全审的改动）。§3.12.2 里「影子转生效」的阈值管的是规范节点（图上带 `模式：影子 | 生效` 标签的规范，人批的），不是这八道门，两者的含义不同，M4 的 `PROMOTION` 取代 §3.12.2 的阈值这件事按 R4-F10 第 2 条在 P2 之前处理（§18.2）。

首日 `enforce` 之后发现误伤怎么办：误伤靠三样发现，都已经有：违规流水里这道门的拦截次数（晨报「例外」与周报）、同一任务同一规则的拦截达到 3 次时的复盘（§3.15）、M4 可用后的拦截跟进分类（`classifyRecord`：走对正路、原样重试、别的）。发现某道门误伤多，把它的 `mode` 改回 `shadow` 是一次提交，不用改门本身；降回影子同样要人拍板（M4 §3.5），改回之后要再转生效，走上一段的 `PROMOTION`。

这些门只作用于 `execute` 行启用的会话里的登记表角色、主 Agent 的主干前进与目标完成：普通会话（没有 `/wish`、没有执行行）不受任何一道门影响，所以首日 `enforce` 的范围不超出装了并启用 `execute` 行的项目。

## 13. 待人定的事项

两件，都是改人批过的清单，按 `d-chat-not-cards` 的四行写；下面是主 Agent 放行之后问人的原样。两件都不挡开工：人回答之前都按严的一侧做（① 每件都全审，② 每次都跑全部命令），回答只决定能不能松一点。0.6 起一页放行稿 `onepage.md` 的「放行」一节只放放行这一件（与规则板、循环板两页已放行的写法同形：一个带标题的项目，背景、推荐、疑问、不做四行，一句问话）；这两件不挡开工，放行稿里用「放行之后再问你的两件」两句人话说明它们是什么、回答之前按哪一边做，放行之后由主 Agent 按下面的四行在对话里问人，一次至多三件，所以仍不超过。0.4 改了两处（评审 F2、N1）：① 的背景写明现在每件都全审；② 的推荐写明两层意思。0.5 不加第三件：八道代码里的门首日直接生效，是对宪章 0.7「写在代码里的新门禁先影子」的例外（§12.1），写进一页放行稿「替你定了的方向」那一栏，人放行时看到，不同意就按 §12.1 的办法改，所以一次问人仍是放行加这两件，没有超过三件。

① 必须全审的清单加上机器认得的写法

背景：必须全审的清单现在只有人话，系统判不出哪次改动碰到了它，所以暂时**每件都全审**

推荐：每一类后面加**具体路径或动作**，例如拦截与权限加 src/guard/

疑问：路径要是**列漏了**，漏掉的地方就不会被强制全审

不做：不让主 Agent **自己判断**算不算碰到，那样它能绕过去

② 只改项目图的提交不跑全套检查

背景：主 Agent 每次记图都要提交，现在**每次都跑**构建和全部测试

推荐：加一条：**只改项目图**的提交不跑命令，只差图文件的两个提交共用一次检查

疑问：图文件要是**写坏了**，要等合入后的全量检查才发现

不做：不让这类提交**完全不查**，系统仍核对它只改了图

这两处你看行吗？

记图时的具体内容（给编排者，人同意之后带人的原话写进验收）：

- ① `norm-review-floor` 四条验收的末尾各加：第 1 条 `` `files src/guard/, src/execute/scope.ts, src/execute/faces.ts, src/execute/advance.ts, src/execute/floor.ts, src/execute/gate-norm.ts, src/rules/, src/design/index.ts, src/shared/tool-names.ts, src/shared/dialect.ts` ``（0.4 加了主干前进的核对、底线清单的判定与规则板，它们同样是拦截与权限）；第 2 条 `` `files src/graph/engine.ts, src/graph/format.ts, src/graph/schema.ts, src/graph/parse.ts, src/graph/mutation.ts, src/graph/store.ts` ``；第 3 条 `` `deletes` `` 与 `` `commands git push, git branch -d, git branch -D, git update-ref -d, git filter-branch, git filter-repo` ``；第 4 条 `` `outside` ``。人话部分不改。
- ② `norm-merge-gate` 的验收在 `push` 之前加一条 `` `only docs/graph/` ``。

## 14. 交给编排者记图的事项

本设计不写 `docs/graph/`。0.5 的草稿是同目录的 `graph-ops-v05.json`（只有批注，形状 `{"op":"comment","id":…,"text":…}`，中文）：`m7`（0.5 改了什么、关了评审的哪几条、还剩什么何时改）；`rules`（M7 已不读 `heldForPeak`，只读 `src/shared/peak-mode.ts` 的三样；E4 的读对着最小一片写；`EXECUTE_RULES` 由规则板整块映射；`DISPATCH_TOOL_NAMES` 不在 E2 建；这是评审 R4-F1 要的「同批改给 `rules` 的批注」）；`m3`（M7 要读的 `src/graph/modules.ts` 的五个导出与三条写入规则，请 M3 0.5 定稿后核对；M7 补的阶段提醒两句；`mainAgentOf` 的参数；运行时文件搬进 `.llm/`）；`schedules`（条目的 `tell` 的 `wake`；`execute.start-drive` 的分了模块时自带 `tell`；`hourness.design-released` 多 `module` 字段、键的第二段改为 `<module 或 goal>`；`hourness.tasks-closed` 在有模块停在设计中时不交）；`dogfood`（开始条件多一条：规则板最小一片已合入且两处读验过，§10.3 第 5 条）；`plain-ui`（M7 读的 `derivedStage(graph, node)` 的形状、`releaseOf`；面板不用管三档）；`metrics`（新增 `execute.tier` 与 `execute.goal` 的新操作；验收不要求事件已写进流水，R4-F8）。一页放行稿 `onepage.md` 已按 0.6 重写（R5-N3，评审之后的一步，没有改 `design.md` 的内容来配它，也不再评审）：加了模块一级（每个模块各放行一次、开发中的三档与成批）和「替你定了的方向」里的宪章例外（§12.1），十件活的字句按本稿 §1.2，「放行」一节只放放行这一件（§13）。`graph-ops-v04-pending.json` 里 `m7-2`、`m7-3`、`m7` 三份验收字句已按本稿 §1.2 重写（这几行变了；其余各行 §1.2 没变，仍是 0.4 写下的字句），文件仍是草稿、没有应用，人看过放行稿、回话之后由编排者带人的原话记。0.6 的批注草稿是同目录的 `graph-ops-v06.json`（只有批注，中文）：`m7`（0.6 改了什么、四条 MEDIUM 与三条 NIT 的处理、R5-N4 到 N6 留到何时）；`m3`（M7 写的模块设计评审记录的形状与 M3 要数的条件，请 `moduleReleaseGate` 加第 8 项；M3 第 9 步做；M7 的 `releaseOf` 读不出模块时拒绝，请 M3 的文件导出保持五个名字的形状）。

0.4 的两份 JSON 草稿在同目录，变更的形状同 `src/graph/mutation.ts`（0.5 之后以上面这份为准，下面两份留作对照，其中读 `heldForPeak` 与运行时文件在 `<git>/hourness/` 的说法作废）：

1. `graph-ops-v04.json`（只有批注，设计过审之后可以直接记）：`m7`（0.4 写完：三条挡路怎样改、接缝裁定怎样落、十条不挡路的处理，§17）；`schedules`（M7 0.4 照循环板 0.3 交条目与事件，形状、`why`、键、五个 harness 动作；请循环板下一稿把 `execute.resume-after-peak` 改为 `execute.resume-drive` 与原因码 `hourness-peak-wait`、§6.9 第 4 条的判断表照规则板 0.10 改；`execute.trunk` 采纳覆盖规则；`hourness.handback` 的 `floorHit` 多一个值 `unparsed`；M7 的看门与 `actions.jsonl` 让循环板晚到的调用返回 `skipped`；这是评审 F3 要的「跨设计的不同之处」记录）；`rules`（M7 0.4 照规则板 0.10 §10.7 的五条做了：派活时读 `glmWorkerCap`、空转判定读 `peakHoldFor`、原因码 `hourness-peak-wait`、`execute.resume-drive`、循环板不在时 M7 自己在高峰结束后接上而不是照原来计；请规则板把判不了的条目旁的「暂不强制」改为「暂时每件都全审」）；`norm-review-floor`（判不了就从严：四条加写法之前每件都全审，§13 ① 的背景改了）；`norm-merge-gate`（主干前进没有「已在上游」的例外，拉取改为三步，推送只到核对过的状态；`only` 的两层意思写进 §13 ②）；`metrics`（新加的四个事件、`execute.advance` 的新字段，写失败时行健康降级与 `metrics-gaps.jsonl`）；`m3`（M7 请求与通知每次送之前重取 `mainAgentOf`；阶段提醒多一句没有 `norm-review-floor` 时提议它；门禁工作树用 `takeSnapshot`）；`dogfood`（§10.3 第 4 条改为人回答 §13 之前每件都全审）。
2. `graph-ops-v04-pending.json`（要人的原话，人看过一页放行稿 `onepage.md`、回话之后再记）：`m7-1` 到 `m7-10` 与 `m7` 的验收按 0.4 的 §1.2 改写（m7-2 第 1 条加少做上限；m7-3 加第 5 条高峰；m7-4 第 1、2 条；m7-5 第 2–4 条），各节点正文指向 0.4；`norm-review-floor` 按 §13 ①（第 1 条的路径比 0.3 多四项）；`norm-merge-gate` 按 §13 ②。修订号是 2026-10-30 07:20 读到的（main `fe0bace`），提交前重读。这些写入不带 `relay`，原样提交会被引擎以 `forbidden` 拒绝；编排者按人的回话逐条补上人的原话再提交，人改了哪条就按人的话改。0.3 的 `graph-ops-v03.json` 已由编排方记过（各节点上 2026-10-29T19:14 的批注），其中被 0.4 推翻的几处（`norm-review-floor` 批注里的「强制全审对本仓库还不起作用」，`schedules` 批注里的接口与八个事件）由上面第 1 份的批注更正；`graph-ops-v03-pending.json` 作废，由第 2 份取代。

0.3 的两份草稿（留作对照）：

1. `graph-ops-v03.json`（只有批注）：`m7`（0.3 写完、改了什么、待人定的两件与 `question-37` A）；`m3`（M7 对 M3 的改动：身份节与 `main-agent-no-write` 的一句、阶段提醒的四段与 `norm-merge-gate` 一句、`git-snapshot.ts` 导出 `gitInvocations`，不再改 `panel-row.ts`）；`rules`（代码规则目录要登记的八个 id、`DISPATCH_TOOL_NAMES`、M7 不再用 `admit` 与租约）；`schedules`（M7 的八个事件、十条默认条目与它需要的接口，§2.5、§3.11.1）；`metrics`（M7 的事件表，§3.16）；`lessons`（M5 请改的五处已采纳）；`bootstrap`（底线清单的草稿要把路径写成反引号里的判定写法；`GATE_LINE_FORMS`；`only` 写法）；`question-31`（子 agent 的工具面去掉图写工具，0.2 评审 F19）；`ablation`（扫描若不是每次运行的一步，由 P4 加，F26）；`norm-review-floor`（四条还没有判定写法，harness 判不了，等人定 ①）；`norm-merge-gate`（`push` 现在是主 Agent 做；`only` 等人定 ②）；`dogfood`（开始条件按 §10.3）。
2. `graph-ops-v03-pending.json`（要人的原话，人看过一页放行稿、回话之后再记）：`m7-1` 到 `m7-10` 与 `m7` 的验收按 §1.2 改写，`m7-3`、`m7-5`、`m7-7`、`m7-8`、`m7-9`、`m7-10` 的标题与各节点正文指向 0.3；`norm-review-floor` 的验收按 §13 ①；`norm-merge-gate` 的验收按 §13 ②。这些写入不带 `relay`，原样提交会被引擎以 `forbidden` 拒绝；编排者按人的回话逐条补上人的原话再提交，人改了哪条就按人的话改。修订号是写稿时读到的，提交前重读。

## 15. 未核实的假设

| # | 假设 | 依据 | 在哪核实 | 不成立时 |
| --- | --- | --- | --- | --- |
| U1 | `delivery: 'caller'` 的 worker 不附交回指引、父 agent 收不到结算通知、驱动器照样等它 | subagent:1460–1465、2048–2063、1296–1330 | L3 `glm-exec-dispatch` | 改用 `parent`，简报写明只用 `structured_output` 交回 |
| U2 | 第三方插件能注册外部 provider；外部激活被驱动器等待 | subagent:3256–3267、1483–1520、1768–1790、1305–1307 | L3 `glm-exec-merge` | `check_commit` 同步运行；巡检的主干检查在本进程后台异步跑 |
| U3 | 主 Agent 的 `send_message` 在常驻 worker 的下一步到达 | subagent:1545–1549、2080–2117 | L3 `glm-exec-plan` | 改向用中断加重新派发 |
| U4 | 子 agent 一次工具调用 `await` 30 分钟不被切断 | 没读到工具执行的默认超时〔推断〕 | L3、L4 | 等待上限改小 |
| U5 | `agent/created` 时装的组装监听器对子 agent 生效，能按角色过滤工具面 | M3 的同一做法 | L3 `glm-exec-dispatch` | 只靠工具体自查与 `worker-graph-readonly` |
| U6 | 会话事件能折叠出 `structured_output` 的参数；`observeSession` 对冷会话返回第三方投影 | subagent:986–990、2339–2352 | L2、L3 | 对账只走「丢失」一支 |
| U7 | 桌面版重启后，恢复出来的主 Agent 会话触发 `agent/created` 与第一次走步的监听器 | agent:574–589〔推断〕 | L4 | 人打开会话说一句话时恢复（那一步一定触发） |
| U8 | 冷会话收到到点提醒时恢复出来的 agent 工具面齐全（循环板的投递） | `docs/ROADMAP.md` 核实清单第 17 项 | L4 第二批 | 人在对话里要报告 |
| U9 | 几个工作树各用临时 profile 时并行跑探针互不干扰 | `docs/DEVELOPMENT.md` §3〔推断〕 | H1 的 L3 | 探针串行 |
| U10 | `agentOptions.reasoningEffort` 在原生通道上生效 | subagent:1400–1404 | L3 | 只换模型 |
| U11 | 桌面版运行时在主检出上快进主干无害（加载的是不入库的 `dist`） | `docs/DEVELOPMENT.md` §7〔推断〕 | L4 | 快进之前提醒主 Agent 桌面版在用 |
| U12 | 在主 Agent 自己的 `agent/pre-step` 里调 `goals.resume` 之后，驱动器在这一回合结束后开下一拍 | goal:686–699；driver 在 `goal/changed` 时重排、空闲时开拍（243–246、223–242） | L3 `glm-exec-drive` | 恢复放到 `agent/status` 变为空闲时做 |
| U13 | 同一进程里禁用再启用执行行时登记表留着 | 〔推断〕 | L3 | 两种情况都安全：为空时活着的 worker 只读、列为失联 |
| U15 | `goal/changed` 的 `ref.id` 与 `goals.get` 的 goal `id` 相同且不变 | goal:763、872–877 | L3 `glm-exec-drive` | 凭据按 `agentId` 加 10 分钟窗口配对 |
| U17 | worker 的工具面不受 M3 去掉写工具的影响 | M3 的过滤只看 `isMainAgent`〔推断〕 | L3 `glm-exec-dispatch` | 执行行给 worker 补回写文件工具 |
| U18 | `caller` 模式的检查不进面板的子 agent 目录 | subagent:1483–1520〔实读〕 | L4 | 不改：进度靠提醒与批注 |
| U19 | 主 Agent 与 worker 伪造不了检查记录 | 写文件只能经工具（M3 去掉写工具、shell 写入由 `main-agent-no-write` 与 `worker-scope` 判）〔推断：shell 写入的判定是启发式〕 | L2（已知的写法都被拦） | 残余风险写进一页放行稿；加强判写属于 guard |
| U20 | `tools/post-execute` 对每次 shell 调用都触发，含失败的与代码模式程序里带 `parent` 的子调用 | tools:3595–3624；子调用经同一个 `execute`〔推断〕 | L3 `glm-exec-merge` | 主 Agent 每一步开始时的主干比对（§3.8.4，本地主干与远端跟踪引用都比）兜底，发现晚一步 |
| U21 | 本仓库通道的 `listModels` 给出 `glm-5.3`、`glm-5.3-flash` | `src/glm-llm/zcode.ts`:316–319〔实读代码，没有运行〕 | L3 | 目录为空时放行（§3.1.3） |
| U22 | 循环板照它 0.3 的 §3.1 实现：`contribute` 收下 M7 的两份、按事件调 `Contribution.run`、经 `emit` 收事件 | 循环板设计 0.3（设计，还没有代码）；它的 V12（`inject` 对本包自己提供的服务生效） | 循环板 S1、S8 合入时的契约测试；L4 第二批第 9 步 | 形状变了只改 `entries.ts` 与 `loop-link.ts`；执行路径出错时看门接手、行健康报出 |
| U25 | 桌面版关闭时，驱动器会不会因为取消正在跑的目标轮而暂停 goal（goal-round-driver:229–234） | 源码推断〔未核实〕 | L4 第一批第 7 步 | 不会：§3.9.1 的「重启前的暂停」一支不触发，留着无害；会但隔得比 30 秒久：按 L4 量到的间隔改常量 |
| U26 | 规则板的 `peakHoldFor` 在少做档高峰里、主 Agent 只剩挪开的活时有值；高峰结束后变成 `undefined` | 规则板设计 0.10 §7.2 的注释（设计，还没有代码；0.5 写 0.8，R5-N7） | 规则板 R1 的 L2；L4 第二批第 9 步 | 读不到时照原来计空转，高峰里可能问人一次（规则板 0.10 §3.6 写明的退路） |
| U27 | 推送成功时 git 更新 `refs/remotes/<上游>/<主干>` 并在它的 reflog 写 `update by push`；Windows 上的 Git for Windows 默认同样记 `refs/remotes/` 的 reflog | git 文档（`core.logAllRefUpdates`）〔推断，没有在本机跑〕 | E7 的 L2（临时裸仓库） | 认不出推送时按推送判（`pushOk`），不按拉取放过；拉取会被误判成没检查的推送时，改为同时比对 `FETCH_HEAD` 的时刻 |
| U23 | 指标流水提供一个写入接口，M7 的事件表能放进它的通用格式 | 指标流水设计未成稿 | 那份设计定稿时 | 只改 `src/execute/metrics.ts` |
| U24 | 桌面版启动时是否为上次打开的会话创建 agent（决定重启后恢复发生在启动时还是人打开会话时） | 〔未读到〕 | L4 第一批第 7 步 | 恢复推迟到人打开会话；不影响正确性 |
| U28 | M3 附录 0.5 §3.14 的读法与写入规则按本稿的读法成立：`src/graph/modules.ts` 的五个导出（`modulesOf`、`moduleCandidatesOf`、`moduleOf`、`isReleased`、`isSplit`）；模块放行改模块的 `stage` 为 `release`；主 Agent 不带原话把模块的 `stage` 退回 `design` 被引擎接受；目标退回 `design` 带原话 | M3 附录 0.5 §3.14.1、§3.14.7、§3.14.8（盘上的稿，M3 0.5 同时在改） | M3 0.5 定稿后逐条对一遍；L2 `execute-modules.spec.ts` 用 M3 合入后的真实引擎；L4 第二批第 11 步 | 名字或行为变了只改 M7 的 `execute-stage.ts`、`tiers.ts` 的导入与读法；M3 不给第二档的窄例外时，第二档退回的写入改走人的权限，主 Agent 在对话里请人确认（多一问） |
| U29 | 图引擎对 `stage` 的 `edit` 在历史里记 `changes.stage: {from, to}`（`releaseAtOf`、`returnsOf` 读它） | `src/graph/schema.ts`:104–131 的 `FieldChange` 与 `HistoryEntry.changes`〔实读，没有对着真实的模块写入跑过〕 | L2 用真实引擎写一次模块放行与一次退回，读历史 | 读不出放行时刻时按 `releaseAt: null` 算（往拒绝一侧），L2 会先于实现暴露 |
| U30 | `goals.block` 接受新的原因码 `hourness-design-wait`，被它阻塞的 goal 在目标再放行后能被 `goals.resume`（同 `hourness-peak-wait` 的做法） | goal:76–83（原因码小写连字符）、720–729、686–699〔实读，已有两个同类原因码在用〕 | L3 `glm-exec-modules` | 同 `hourness-peak-wait`：原因码不被接受时改用 `hourness-waiting-human` 的格式并在 message 里写明原因 |
| U31 | 模块设计评审（§3.7.5）的三个前提：（一）M3 附录 0.5 §3.14.7 的收窄成立，harness 在没放行的模块下提议的任务出生为 `proposed`；（二）M3 在 `moduleReleaseGate` 加第 8 项，条件按 §3.7.5「记录的形状」；（三）`norm-directions` 的验收项就是方向清单的条目，顺序稳定 | M3 附录 0.5 §3.14.1、§3.14.3、§3.14.7 与 §3.14 末句（盘上的稿，M3 0.5 同时在改）；第（二）项是 M7 向 M3 提的请求，写在 `graph-ops-v06.json` 给 `m3` 的批注里 | M3 第 9 步合入时逐条对一遍；L2 `execute-modules.spec.ts` 用 M3 合入后的真实引擎；L3 `glm-exec-modules` | （一）不成立（任务直接批准）：门禁里 `proposed` 的那一支留着无害；（二）M3 不加这一项：模块放行页不核对评审，评审照派，记录照写，放行稿上写明；（三）顺序不稳：`digest` 的算法改为先按条目文本排序 |

0.2 的 U14（门禁锁在 Windows 上的失效判定）由改用 M5 的锁规则关掉（不靠 `process.kill(pid, 0)`）；U16（卡片字段）随卡片一起删去。

## 16. 0.2 → 0.3 的改动与第 2 轮评审意见的处理

改动按方向：

| 方向 | 改了什么 | 在哪 |
| --- | --- | --- |
| `d-auto-drive` | 删 `/drive`、`/drive stop`；放行被看到就建 goal；重启后恢复；人暂停、清掉的不恢复；人说继续由主 Agent 恢复 | §0、§1.2 m7-3、§2.2、§3.9.1、§3.9.5、§3.9.6、§9、§10 |
| `d-main-agent-models` | 删档位映射与 `modelReminder`；`model`、`why` 必填；目录核对；记录 | §0、§1.2 m7-1、m7-4、§3.1.1–§3.1.3、§3.7.1、§3.9.4、§3.16 |
| `d-main-agent-shell` | 删 `main-agent-no-git-write`、`merge_task` 与门禁的压缩与快进；加 `check_commit`、`trunk-advance-checked`、检查与前进记录、尾注映射；worker 的 git 与快照 | §0、§1.2 m7-5、§3.2.4、§3.8、§5、§6 |
| `d-one-main-agent` | 删运维会话、`/patrol` 与本包直接调 `schedule`；三条时间条目交给循环板 | §0、§1.2 m7-6–m7-8、§2.3.1、§3.11 |
| `question-38` C、`norm-review-floor` | 审查深浅、有效深浅、底线清单的判定写法与按内容核对、降档后的返工与增类提议 | §1.2 m7-4、§3.7.1、§3.8.4、§3.8.5、§3.12.3、§13 ① |
| `d-chat-not-cards` | 删 `questions.ts`、回写标签与 harness 的待决；加 `asks.ts` 的草稿与主 Agent 问人；§13 改为四行 | §3.7.3、§3.7.4、§3.12.2、§13 |
| `d-rules-visible`、`d-defaults-readonly` | 门列进规则板；联动成为十条只读的循环板条目；没有循环板时的退路 | §2.5、§3.11.1 |
| `metrics` | 事件表与 `emitMetric`；报告的来源 | §3.10、§3.16 |
| `d-design-onepage` | 方向清单的对照；开工条件加一页放行稿 | §1.1、§8、§10.3 |
| 规则板 0.5、M5 0.3、接管 0.2 | 删 `admit`、租约；M5 的五处；`GATE_LINE_FORMS` 与 `changed`；锁用 `src/data/lock.ts`；运行时文件改放 `<git>/hourness/` | §3.5.5、§3.8、§7、§8.3 |

0.2 第 2 轮评审的不挡路意见：

| 发现 | 处理 | 在哪 |
| --- | --- | --- |
| F17 重开后同一次返工里的第二次派发改名失败 | 采纳：按祖先关系判断，复用进主干之后建的分支，改名取第一个不存在的 `hz/<id>@<n>`；L2 与 L3 各一例 | §3.1.2 第 4 步、§6.6、§9.1 `glm-exec-merge` |
| F18 M3 的身份与纠偏文字仍说子 agent 放行后能写 | 采纳：执行行在时两处改为 dispatch_task 的说法；E4 的今天必败加一条 | §7 M3 一行、§8.1 E4 |
| F19 子 agent 带着九个图写工具 | 采纳：工具面去掉，`worker-graph-readonly` 兜底；批注 `question-31` | §2.3.2、§9.1、§14 |
| F20 跨设计同一批文件的先后 | 采纳：§8.3 加表，后一方等前一方合入再开工。`/graph-apply` 的三个回调的次序问题随 M7 不再改 `panel-row.ts` 消失 | §8.3 |
| F21 人给了一轮之后下一次停在哪 | 采纳：轮数与失败次数从人的最近一条历史之后算；人给一轮之后再不过就停 | §3.7.3、§3.8.3 第 9 步 |
| F22 放弃任务后它的审查任务挡住完成门禁 | 采纳第二种：完成门禁跳过祖先已废弃或被取代的任务 | §3.9.3 第 1 条 |
| F23 回写动作读自 LLM 能改的正文 | 随回写标签一起删去：harness 不再替人回写，主 Agent 带人的原话写 | §3.7.3 |
| F24 开机时刻取整到分钟会抖、pid 复用让锁永远有效 | 采纳：改用 M5 的锁规则（开机时刻差 120 秒以上判陈旧）加 6 小时持锁上限 | §3.8.3 |
| F25 对账让主 Agent 发 `/drive` | 采纳：对账重算完成门禁，成立就以 harness 的证据标完成；`/drive` 已删 | §3.9.6 第 8 步（0.3 时是第 7 步） |
| F26 每次运行的事后扫描没有归属 | 采纳：`ablation` 不做成每次运行的一步时，P4 在 `run-calibrate.mjs` 里加 | §3.14.3、§7 |
| F27 split 已合入；E9、P6 没写今天必败 | 采纳：文首与 §7 写明；E9、P6 补上 | 文首、§7、§8.1、§8.2 |

## 17. 0.3 → 0.4：第 1 轮评审意见与接缝裁定的处理

评审：同目录 `design-review.md`（0.3 第 1 轮）与 `design-review.json`（`pass: 1`，CHANGES_REQUESTED，挡路 3、不挡路 10）。

### 17.1 挡路的三条

| 发现 | 处理 | 在哪 |
| --- | --- | --- |
| F1 上游豁免让主干与任务完成绕过合入前的检查，且能伪造、发现不了 | 改，比评审给的最小改法更严：删去「已在上游」的豁免，本地主干前进一律要 harness 检查通过（或只改 `only` 路径），拉来的提交也一样；主干上的 `git pull` 拒绝，正路是 fetch、`check_commit`、快进三步。远端跟踪引用当主干看：`update-ref`、写进 `refs/remotes/` 的 `fetch` refspec、`symbolic-ref`、`branch -r` 的改写在执行前拒绝；推送按 `pushOk`（只能推到核对过的状态）在执行前拦、执行后按 reflog 分拉取与推送并发现没检查的推送，交 `hourness.outside-advance` 跑全量检查。harness 的 git 调用一律带 `--no-replace-objects`。巡检对照 `ls-remote` 的真正远端，列出主干上带尾注却没有检查记录覆盖的提交（不论在不在上游）与没全审的底线改动。拉来的提交改了底线文件时不要求在这台机器上全审，只要求检查，并在晨报的「例外」里列出（本机没检查过的推送拉回来不算）。评审要的三个 L2 用例都在 §6.6，另加 L3 的上游一段。没照评审的一处：评审的第 1 条改法保留豁免、只是不写证据；那样主干仍会前进到没跑过检查的提交，与 `d-main-agent-shell` 的「那个提交确实跑过合入前的检查」不符，所以删掉豁免 | §0、§1.1、§1.2 m7-5、§3.2.4、§3.8.4、§3.9.2、§3.9.3、§3.10、§3.11.2、§6、§9.1、§12 |
| F2 必须全审的清单没有判定写法时不强制，本仓库因此整张清单失效 | 改，照评审：判不了就从严。清单节点在、有一条判不了（或图读不出、一条验收都没有）时，每件写任务的有效深浅都是全审，派审查低于全审被拒（`floor_unparsed`），主干前进时项目图目录与 `only` 路径以外改到的每个文件都要有全审看过同样的内容。§3.8.5 写全了每种写法怎样从改动的路径（`--no-renames`）与命令记录（新格式：简单命令的词、git 调用、路径、是否写、是否被拦）判，以及每种写法判不了时怎样算（都算命中）；末尾反引号段写错的整条算判不了；节点被 LLM 废弃不算数。§10.3 第 4 条、§12、§13 ① 的背景改写；规则板上的字请它改（§14）。接管别的项目同一条规则。评审要的 L2 用例在 §6.6，另加 L3 一例 | §1.1、§1.2 m7-4、§3.7.1、§3.8.4、§3.8.5、§6.1、§6.4、§6.5、§10.3、§12、§13 |
| F3 循环板接口按「未成稿」写，与循环板设计冲突，三个 harness 动作没人执行 | 改，照任务的要求对齐循环板 0.3（评审写的是 0.1，0.3 已改成登记表：默认条目由各行经 `contribute` 交，harness 动作由循环板经 `Contribution.run` 调，就是 `glmHournessExecute.runAction`）。条目形状照 `LoopEntryDefinition`（加 `why`、`limits`、`{名字}` 占位）；事件照循环板 §4.2 声明，去重键说「这一次」；默认条目只在 M7 的两张表里，循环行不另带，`hourness.design-released` 只由 M7 交；主干全量检查采纳循环板的覆盖规则（不再「每次都全跑」）。评审要的「退路按所需的成员判断」：执行者按「这一项被收下没有、成员形状对不对」定，不按服务在不在；另加看门：交出的事件 5 分钟内没有 `runAction` 认领（`actions.jsonl` 里没有 `start`），M7 自己执行并报行健康；被宿主退出打断的动作由对账重做。评审要的「跨设计的不同之处交编排者」：写在 `graph-ops-v04.json` 给 `schedules` 的批注里（`execute.resume-after-peak` 改名、`stop-draft`、`floorHit` 的新值）。文首、§7、U22 改为引用循环板 0.3 | 文首、§0、§2.1、§2.2、§2.5、§3.9.1、§3.9.6、§3.11.1、§5、§6、§7、§8、§14、§15 |

### 17.2 接缝裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」）

| 裁定 | 处理 | 在哪 |
| --- | --- | --- |
| 少做的并行上限：数归规则板，经它的服务交出，M7 的派活在数空槽时读它，只加这一次读 | 派模型为 GLM 的子 agent 之前读一次 `peakModeService(ctx)?.stateFor(主 Agent).glmWorkerCap`，在跑的 GLM 子 agent（写任务、审查、目标整体的审查）到数时 `slots_full`；非 GLM 的模型不受限；服务不在或没有这个字段时照原来的槽位。规则板 0.8 §10.7 M7 第 1 条要的 L2 用例在 §6.6 | §1.1、§1.2 m7-2、§3.1.2、§3.5.1 |
| 高峰里等高峰结束：被高峰模式挡着的轮不计空转，M7 以自己的原因码停住推进，经 `runAction` 交 `resume-drive`，高峰结束时循环板上编排层的条目跑它并提醒主 Agent | 每个没进展的轮开始时读一次 `peakHoldFor`；有值时不计进 3 轮，连着 2 个这样的轮以 `hourness-peak-wait` 停住，不叫主 Agent 问人；动作 `execute.resume-drive`（名字空间照循环板的校验加 `execute.`）只恢复这个原因码的 goal；高峰结束时循环行的 `loops.peak-end` 调它；M7 另有兜底（结束后 5 分钟、重启后第一步）。留给 M7 定的三件（规则板 0.8 §10.7 M7 第 4 条）：第 2 个被挡的轮停住；人在停住时说话，主 Agent 可以 `update_goal resume`；循环板不在时照样停住、由 M7 自己在高峰结束后接上（不取「照原来计」） | §1.2 m7-3、§3.9.1、§3.9.5、§6.2、§12 |
| 高峰结束叫醒主 Agent 的条目归编排层的循环行 | M7 不另交这一项，只交动作 | §2.5、§11 |
| 停住的原因码（例 `hourness-peak-wait`） | 照用 | §3.9.5 |
| 脚本判定的事件由规则板写、`/wish` 归 M3、问题背景归 plain-ui | 与 M7 无关的不动；`/wish here` 之后 M7 只读 `mainAgentOf` | §3.4.3 |

### 17.3 不挡路的十条

| 发现 | 处理 | 在哪 |
| --- | --- | --- |
| N1 `only` 的第二层含义没写进 §13 ② | 采纳第一种：§13 ② 的推荐一行写明两层，§3.8.1 写两层的理由与相同的风险；第二层留着（任务提交检查之后常在同一个提交上补记图） | §3.8.1、§13 ② |
| N2 指标写失败只告警一次，行健康不降级 | 采纳：第一次失败起 degraded，记丢了几条与时段（`metrics-gaps.jsonl`），晨报与周报在那段注明数不全 | §3.16、§6.2、§6.7 |
| N3 重启可能被认成人暂停 | 采纳：U25（L4 第一批第 7 步核）；退路用 `drive.jsonl`：暂停后 30 秒内上一个进程正常退出、期间没有人的输入，就按重启恢复，提醒写明。没用评审说的「心跳」：被强杀的进程来不及暂停 goal，只需认正常退出 | §3.9.1、§9.2、§15 |
| N4 合入时不看审查过没过 | 采纳：主干照常前进，审查没过的尾注任务写证据但不转完成，审查通过时再转；周报数「合入时审查还没过」 | §3.8.4、§3.12.3、§3.16 |
| N5 门禁工作树的破坏性命令没有先存快照 | 采纳：有改动时先调 M3 的 `takeSnapshot`，存不了不重置（`gate_snapshot_failed`） | §3.8.3 第 5 步、§6.3 |
| N6 巡检的主干全量检查在工具调用里同步跑 | 采纳：改为 `hourness-gate` 的外部激活在后台跑，工具返回「已开始」，失败的结果送到主 Agent 的下一步；外部激活不可用时在本进程后台异步跑 | §3.11.2、§15 U2 |
| N7 `/wish here` 之后在跑的 worker 的请求送到旧会话 | 采纳第一种：请求与通知每次送之前重取 `mainAgentOf`，当前持有者能回应前任派出的 worker；DSH 只认直接父子，新持有者对前任的 worker 发不了 `send_message`，提醒写明怎么办；另把自动推进移到新持有者（§3.9.1 的新一行） | §3.4.3、§3.9.1 |
| N8 `commands` 判定是否算被拦下的命令没写 | 采纳：被拦下的同样算 | §3.7.1、§3.8.5 |
| N9 §1.2 没写目标整体的审查也由主 Agent 选模型 | 采纳：m7-4 第 1 条末尾加「目标整体的审查也一样」 | §1.2 m7-4 |
| N10 几处行号 | 采纳：`subagent:1215`；等外部激活是 `subagent:1305–1307`（§3.8.2、U2）；`zcode.cjs` 386–387；`goals.block` 720–729（§3.9.5、§4） | §3.1.4、§3.8.2、§3.9.5、§4、§10.3、§15 |

### 17.4 方向清单的复核

0.4 的改动逐条对过 §1.1：`d-auto-drive`（放行之后建 goal 由循环板执行、看门兜底，高峰里停住也不问人、结束后自己接上）；`d-main-agent-models`（少做上限只数、不改模型，不替主 Agent 换成非 GLM）；`d-main-agent-shell`（git 仍由主 Agent 做，拉取与推送照样是它的，harness 只在主干与已发布主干前进的那一刻核对；拉取多一步检查）；`d-one-main-agent`（请求跟着当前的主 Agent 走）；`d-chat-not-cards`（§13 仍是四行，harness 仍不写给人的待决）；`d-defaults-readonly` 与 `d-rules-visible`（十条只读、只在 M7 的表里定义，门仍列在规则板）；`question-38` C 与 `norm-review-floor`（判不了从严，「主 Agent 绕不过去」不再有空窗）；`metrics`（新事件都由 harness 写，写不进时报出）；`d-peak-mode`（只经规则板读，档位与时钟不在 M7）；`question-37` A（§1.2 的改动进了 `graph-ops-v04-pending.json`，人看过 `onepage.md` 之后才记）。

### 17.5 修订记录

- 0.5（2026-10-30）：§18。0.4 全文在同目录 `design-0.4.md`。
- 0.4（2026-10-30）：本节的全部改动。0.3 全文在同目录 `design-0.3.md`。
- 0.3（2026-10-30）：§16。
- 0.2（2026-10-29）：两轮评审批准，全文在 `design-0.2.md`。

## 18. 0.4 → 0.5：第 4 轮评审意见与新定案的处理

评审：同目录 `design-review.md` 末一轮「0.4 第 4 轮」与 `design-review.json`（总第 4 轮，CHANGES_REQUESTED，挡路 10 条 R4-F1–R4-F10：HIGH 2、MEDIUM 8；不挡路 10 条 R4-N1–R4-N10）。评审给了每条的改法，也给了「对开工（自举）的影响」一表：F1、F2、F8 开工前改；F9 排期前由编排方裁定，文字随后改；F3、F7、F6 的文字在 E4 开始之前改；F4、F5、F10 可以在实现中改。人说「尽快自举吧」，所以本稿不等对齐轮，只改前四类（共八件），后一类和其余的不挡路意见写明何时改（§18.2）。编排方对 F9 与 N1 的裁定已写进 `design-context.md`，本稿照写，没有重新裁。

### 18.1 本稿改的八件

| 发现 | 处理 | 在哪 |
| --- | --- | --- |
| R4-F1（HIGH）读已删去的 `heldForPeak`，并把「不做档里规则板暂停主 Agent 的 goal」当成立 | 改，照评审给的逐处：版本说明、§2.1 读别的行的服务、§2.5 退路执行者第 6 条与「循环板负责的」、§3.9.1 删去 `heldForPeak` 那一行（goal 为 `paused` 一律是人暂停或取消了目标轮）、§4 删去 `glmHournessRules` 一行、§6.6 的 L2 例换成「`paused` 一律按人暂停」、§7 规则板一行只依赖最小一片的 `src/shared/peak-mode.ts`、E1b 与 E8 去掉「不做档的暂停」。M7 对规则板只读规则板 0.10 §7.2 真有的三样：档位、`glmWorkerCap`、`peakHoldFor`，没有任何一处指望主 Agent 因高峰被暂停。评审要的第三点（同批改给 `rules` 的批注）在 `graph-ops-v05.json`。§1.1 加 `d-main-agent-peak-exempt` 一行 | 版本说明、§0、§1.1、§2.1、§2.5、§3.9.1、§4、§6.6、§7、§8.1 E1b/E8、`graph-ops-v05.json` |
| R4-F2（HIGH）两层循环不在 M7 | 改，设计进 M7，照 `d-design-onepage` 与 plain-ui 0.7 §11 第 6–9 条：（1）`briefGate` 的 `not_released` 取任务最近的模块祖先，没有模块时取目标，`ctx.release` 代替 `ctx.stage`，`hint` 点名模块；（2）`derivedStage(graph, node)` 收目标或模块，`scopedTasks` 去掉没放行的模块下的任务，`releaseOf`、`releaseAtOf` 回答某个任务此刻放没放行；（3）`hourness.design-released` 加 `module`，键的第二段是 `<module 或 goal>`，`execute.start-drive` 对一个目标只建一次 goal，之后的模块放行只批注并叫主 Agent 分解这一个模块，大循环放行不交事件；（4）pins 的模块与目标祖先多带放行时刻 `releaseAt`（评审说的布尔会在重新放行后变回原值，所以用时刻，§12），第二档、第三档让其下在跑的活过期，新派发被拒，在跑的 worker 的写入被 `worker-scope` 的放行状态一项拒绝，第三档另让 goal 以 `hourness-design-wait` 停住；（5）派发门禁只数决定者为人的待决（`waitsForHuman`），第一档里主 Agent 自己定的事不挡派发；（6）完成门禁加第 7 条（设计中的模块）；（7）三档与成批写成 §3.9.7：判据文字、每档的图写入与后果、`pendingReport`、`batchOf`、批次标记、`returnsOf`、失败与边界；（8）§1.1 的 `d-design-onepage` 行、§1.2 m7-2、m7-3（加第 7、8 条）、m7 特性（加第 4 条）、L2 两模块用例与 L3 `glm-exec-modules`。成批至多三件照旧。评审的第 5 点（`waiting_human` 与 `goalCompletion` 的待决判断）在 §3.5.1 与 §3.9.3 第 3 条。不同于评审的两处：评审建议 pins 加布尔，改成放行时刻；评审建议第三档只「列出受影响的 worker」，本稿另让 `worker-scope` 拒绝它们的写入，否则「受影响的活停下」要靠主 Agent 记得去中断 | §0、§1.1、§1.2、§2.2、§2.4、§2.5、§3.2.1、§3.5.1、§3.5.3、§3.5.4、§3.9.1–§3.9.3、§3.9.7、§3.15、§3.16、§6.1、§6.6、§8.1、§9.1、§9.2、§12、§15 U28–U30 |
| R4-F8（MEDIUM）验收要求每个数写进指标流水，而指标流水不在自举路径上 | 改：§1.2 m7 特性第 3 条说「系统自己记，不靠模型报；现在记在图、检查与前进的记录、违规记录、用量记录和对话记录里；每个数发生时另交一份给统一的指标记录，它做好之前这一份不写，做好以后再核对」；§1.1 `metrics` 行、§1.3、§3.16 同步；L2 `execute-metrics.spec.ts` 用注入的出口断言每类事件各出现一次；§3.16 加「每个数现在记在哪」一表。这一条人读，所以只用人话，没有「指标流水」以外的内部词 | §1.1、§1.2、§1.3、§3.16 |
| R4-F9（MEDIUM）§8.3 的先后让 M7 排在 M3 全部合入与整块规则板之后 | 改，照编排方的裁定逐字：E0、E1a、E3 现在就开；E1b 的测试等 M3 第 3、6 步；E2 等 M3 第 6 步；E4 等 M3 第 3–5 步与规则板最小一片的行登记；每处「等整块规则板 R4」换成「等规则板最小一片」，整块规则板排在 E9 之后；共享的登记文件后合入的一方机械并入、不重审；`src/data/lock.ts` 由 E3 建。§7 的 M3 与规则板两行、§8.3 的开工表与同批文件表、E2/E3 两行同改；`DISPATCH_TOOL_NAMES` 不在 E2 里建（最小一片没有它）；`src/rules/builtin.ts` 不由 M7 改，M7 导出 `EXECUTE_RULES` 给规则板整块映射 | §0、§2.1、§3.8.3、§7、§8.1、§8.3 |
| R4-F3（MEDIUM）派活简报没有示范 | 改：`dispatch_task` 的说明末尾带一道完整示范（任务节点、调用、返回），领域是给静态博客加订阅输出，模型 id 是编的；`src/execute/examples.ts` 的常量，L2 `execute-examples.spec.ts` 六条检查（过 `briefGate`、`checkModelChoice`、参数校验、`plainWordsIn`、返回键与 `childId` 写法、必须全审夹具；说明全文等于由常量拼出的文字）；写明为什么题材安全（不在练习题的领域、只讲已定的事、不描述主 Agent 自己该怎样判断）。有无示范的对照留给练习题，不进 M7 验收，照评审 | §1.1、§1.2 m7-2 第 5 条、§3.1.1、§3.1.5、§8.1 E4 |
| R4-F6（MEDIUM）规则板最小一片不在开始条件与验证里，§10.1 与 §8.3 还写「没合入就不写这两处读」 | 改：§10.1 与 §8.3 那两句删去，改为「对着最小一片的 `src/shared/peak-mode.ts` 写；片子的服务实现晚于 E4 时由 E4 之后的第一个提交补真实服务的核对，L2 由 M7 带」；§9.1 加 `glm-exec-peak`（片子带可注入的计价与时钟接缝时才做）和 `glm-exec-drive` 的高峰一句改成用真实 `PeakModeService` 类型；§6.6 的高峰用例同；§9.2 第 9 步写明没有接缝时这是真实高峰的第一次核对；§10.3 加第 5 条开始条件。评审 F6 第 2 点的两个分支都写了，因为没读片子的代码（在 `.worktrees/rules-slice`，任务不许碰） | §6.6、§8.3、§9.1、§9.2、§10.1、§10.3 |
| R4-F7（MEDIUM）八道代码里的门没有写模式 | 改：§12.1 写一张表，八道门首日全部 `enforce`，分两类写理由（第一类没有已有行为可量；第二类守的是人定的保证，影子等于违背保证本身），标明是对宪章 0.7「写在代码里的新门禁先影子」的例外、agent 定、人可推翻；放行稿「替你定了的方向」让人看到；人不同意时的办法（`EXECUTE_RULES` 里改 `mode`，E4 自己写十几行影子包装，M4 的 G1 合入时换 `installRuleGate`，转生效只认 M4 的 `PROMOTION`，人拍板）和首日 `enforce` 之后发现误伤的办法。满足的一半写明：两行默认禁用，E9 验证通过才启用。§13 说明为什么这不算第三件要问人的事 | §0、§1.1、§2.5、§12、§12.1、§13、§10.3 第 4 条 |
| R4-N1（NIT，编排方已裁定）运行时文件在 `<git>/hourness/`，人说的是项目的 `.llm/` | 改：全部运行时文件搬到 `<proj>/.llm/execute/`（任务自己的在 `tasks/<任务>/`）与 `<proj>/.llm/operate/`，第一次写入时放 `.gitignore`（同指标流水）；§2.1 定义 `<proj>`、`<exec>`；§12 写明取舍与代价（`git clean -fdx` 或新克隆会带走它，丢了只让核对往严一侧错，§5 末尾的丢了的后果已有）。M3 的快照流水不是 M7 的，位置以 M3 0.5 为准 | §2.1、§3、§5、§12 |
| R4-N2（NIT，编排方已裁定）harness 条目的 `tell` 在循环板 0.6 是 `{text, wake}` | 改：§3.11.1 的表里每个 `tell` 与 `tell-main` 都写 `wake: true`，加一段说明与 E1b 的逐项断言 | §3.11.1 |

### 18.2 留到何时改（本稿不改，一条不丢）

时间照评审「对开工（自举）的影响」一表。

| 发现 | 何时改 | 为什么能晚 | 做什么 |
| --- | --- | --- | --- |
| R4-F4（MEDIUM）缺 `glmHournessExecute.trunkAdvanceFor`，且与规则板的门谁在外层没说 | 已做（2026-11-04，E7）：服务加了 `trunkAdvanceFor`，§3.8.4 执行前一节加了那一句，L2 三例在 `tests/execute-advance.spec.ts` | 规则板的整块门不在自举路径上（最小一片没有门） | `glmHournessExecute` 加第三个成员 `trunkAdvanceFor(callId): {branch, from, to} \| undefined`；§3.8.4 执行前一节加「`advanceOk` 成立、结果可预知时，调用 `next()` 之前按 `exec.callId` 记在内存里，`post-execute` 或 60 秒后删」；L2 三例（放行的 `merge --ff-only` 之后假规则门读得到、被拒绝的读不到、脚本里的前进读不到）。§2.5 的接口一条已指向这里 |
| R4-F5（MEDIUM）周报与晨报没有加规则板、循环板要的几节，每周至多三件没有排序 | 实现中，P2 开工之前 | 周报晨报在骨架之后（P2） | §3.12.4 加一张表（节名、读什么、至多几项、服务不在时的话、对应的 `askDraft` 种类 `stale-rules`、`stale-loops`、`fix-script`）；写定优先序（建议：修脚本 > 加类 > 升降 > 删规则 > 删循环板条目；合计至多 3 件）；`operate.weekly` 提醒文字、m7-8 第 3 条、§3.10 晨报的规则板一节同批改；`d-script-timeout` 的「反复超时」一节随此。0.5 已在 §1.1 的 `d-script-timeout` 行写明 |
| R4-F10（MEDIUM）M4 0.4 写给 M7 的几条没有处置 | 第 2 条（`PROMOTION`）在 P2 开工之前；第 3 条（`peekGrant`/`outsideDenial`）已在 E6 合入批接上（2026-11-04，§3.2.1 的申报接缝）；第 4 条（汇合门禁的「草稿区为空」）已做（2026-11-04，E7：guard 行在时 `check_commit` 拒 `scratch_left`，`trunkCheck` 第一步同查）；第 1 条（`installRuleGate` 取代各装各的监听器）随四道门的迁移，接之前的「改之前」状态按 m4 写明 tolerated | M4 不在自举路径上 | §7 的 M4 一行已加（指向这里）；E4 照 main 上现有的 guard 框架写；§3.12.2 引用 `PROMOTION` 并采用 M4 的含义，`ladderProposals` 经 `classifyRecord` 读；§3.2.1 已写明 `requestsService(ctx)?.peekGrant`、`outsideDenial` 与服务不在时行为不变，`openRequests` 归 §3.9.5（E8）；汇合门禁在服务在时多「草稿区为空」一步。§12.1 已按 M4 的 `RuleMode`、`PROMOTION` 写了代码里的门的转生效 |
| R4-N3（NIT）几处旧引用 | 下一次改这些行时；不挡任何步 | 只是引用 | 0.5 改 E1b 与 §7 时已把循环板、规则板、M3、plain-ui 的版本换成当前的；版本说明里 0.4 与 0.3 的原文保留作历史，不改；「依据：main」已换成 `ee726c3` |
| R4-N4（NIT）`mainAgentOf(userHome, graphDir)` 的参数会变 | E4 开工之前，M3 0.5 定稿后 | M7 只按名字引用 | §7 的 M3 一行已写「参数以 M3 0.5 为准」；§3.4.3 里的旧签名在 M3 0.5 定稿时改 |
| R4-N5（NIT）M3 附录 §9 第 7 条的两件小事 | （a）0.5 顺带做了：§2.1 的 `git-snapshot.ts` 一行补上 `gitRisk`。（b）E4 开工之前 | 一句话 | （b）在 §3.1.3 加一句：M7 走 `startActivation` 加 `agentOptions`（subagent:293–303、315–329），不经 `subagent` 工具的 `modelSelectionSettings`，没有允许清单，所以不评估它 |
| R4-N6（NIT）少做上限的计数口径与规则板字面不同 | 记在给 `rules` 的批注里（`graph-ops-v05.json`），0.5 已写 | 只是说明有意 | M7 不算 `check_commit` 的检查（不跑模型），把目标整体的审查算进去；与规则板 §3.6、§16 的字面不同，是有意的 |
| R4-N7（NIT）被不做档排队的 worker 交回 `blocked` 时怎么算 | 整块规则板的门合入之前（E9 之后） | 不做档的排队是整块规则板的门，自举期间不生效 | §3.6.2 第 7 步写明：交回 `blocked`、`summary` 里带规则板单号的，不算一次失败的派发（不进审查或检查的停下计数），等规则板的唤醒再派 |
| R4-N8（NIT）§10.3 第 1 条「骨架场景」没点名 | 0.5 顺带做了 | 同一句话 | §10.3 第 1 条已点名八个场景（含新加的 `glm-exec-modules`） |
| R4-N9（NIT）建议把 E8 拆成 E8a 与 E8b | E7 合入之后、E8 开工之前，由编排方定拆不拆 | 排期建议，不改任何行为；循环板不在自举路径上，E8b（交条目、交事件、看门、`actions.jsonl`）本来就只能对着假循环板测 | 拆的话 E8a 是自动推进、完成门禁、对账、退路执行者、两层循环的后果，E8b 排在循环板合入之后 |
| R4-N10（NIT）metrics 0.2 写给 M7 的几条 | 指标流水定稿时，由编排方找人定 | metrics 是半成稿；比率进不进主 Agent 的对话是与 `CHARTER.md` §8 的冲突，要按方向性岔路问人，M7 自己改不了 | M7 不改；§7 的指标流水一行已记下这几条 |
| R5-F4（MEDIUM）模块设计的独立评审归 M7 的派发，0.5 没有处置（编排方已裁定：改法 A，0.6 写进设计，不再留空） | 决定：0.6（2026-10-30）。做：E1a 的 `isDesignReview` 与门禁跳过的纯函数；E4 合入之前，记录形状交给 M3（`graph-ops-v06.json` 给 `m3` 的批注，M3 第 9 步在 `moduleReleaseGate` 加第 8 项）；E4 的派发与 `not_released` 跳过；E6 的交回处理与记录；L3 `glm-exec-modules` | 产品的模块评审不在自举骨架里；本仓库自举不受影响（本仓库的模块设计评审由 Kiro 工作流做，不走这条路）。派发的那一半要动 `briefGate` 的 `not_released` 一行，所以在 E4 合入之前决定，现已决定 | 见 §3.7.5：`kind: review`、写入范围为空、`source` 指向模块设计决策的任务，由 harness 在 `dispatch_task {id: <模块 id>}` 时建；模块没放行也派得出去（目标层照查）；记录 `设计审查 · <childId> · <APPROVED\|CHANGES_REQUESTED> · 方向清单 <digest> · 挡路 <n> · 派出 <at>`，M3 数这一项。放弃改法 B（产品里不做并在放行稿写明）的理由：`d-design-onepage` 里人定的流程包含这一步，删掉等于删去人定过的东西 |
| R5-N3（NIT）`onepage.md` 仍是 0.4，验收字句的草稿也是 0.4 的 | 0.6 同批做完（编排方，设计之外） | 挡的是人的放行，不挡设计稿 | `onepage.md` 按 0.6 重写（模块一级、宪章例外、R5-N1 第 2 点的字句、「放行」一节），`graph-ops-v04-pending.json` 的 m7-2、m7-3、m7 重写，见 §14 |
| R5-N4（NIT）§2.4 复述 `isReleased` 与 M3 0.5 不同 | U28 对着 M3 0.5 定稿核对的时候 | 结果相同，只是复述多了一支 | 删去 §2.4 里「完成而阶段在 `release` 或之后」那一支，复述改成「同 M3」；0.6 不动这一句 |
| R5-N5（NIT）自举期间不做档下，`peakHoldFor` 有值而什么都没被挡 | 自举开始之前加一句，或整块规则板的门合入时 | 只在人把档位改成不做时出现，默认是少做；最多停到这段高峰结束（不超过 4 小时），期间不问人，会自己接上 | 在 §10.2 末句加一句已知代价；或请规则板最小一片的作者在没有门时让 `peakHoldFor` 对不做档返回 `undefined`（规则板一侧写明）。M7 不改代码。0.6 不动 §3.9.5 与 §10.2 |
| R5-N6（NIT）E3 建 `src/data/lock.ts` 时锁的参数 | E3 | 参数形状；M5 不在自举路径上 | E3 把重试间隔、最长等待、按修改时间判陈旧的阈值、开机时刻容差做成选项，M7 的值（5 秒一次至多 60 分钟、持锁 6 小时判陈旧）与 M5 §5.3 的值（50 毫秒重试至多 2 秒、修改时间早于 30 秒、开机时刻相差 120 秒）都能传进来；L2 各带一例。注意：`design-context.md` 里规则板最小一片之后的裁定写着最小一片已建 `src/data/lock.ts`、E3 只在没人建过时才建；以 E3 开工时 main 上的实际为准，选项加在那一份上 |

### 18.3 方向清单的复核（0.5）

| 定案 | 本稿怎样遵守 |
| --- | --- |
| `d-main-agent-peak-exempt` | 没有一处读已删去的成员、没有一处指望主 Agent 因高峰被暂停；`paused` 一律是人的动作（§3.9.1）；M7 的高峰逻辑只有两处读加一次停住，都是为子 agent 与等高峰结束的推进（§3.1.2、§3.9.5） |
| `d-design-onepage` 扩到产品 | 模块一级的放行门禁、阶段推出、放行事件、pins；三档各有机制；成批至多三件；第一档不占名额（§3.9.7） |
| `d-agent-examples` | 派活简报的示范在 `dispatch_task` 的说明里，L2 钉住（§3.1.5） |
| `d-rules-in-repo` | 运行时文件在项目的 `.llm/`（§2.1） |
| `d-dogfood-scope`、`d-rules-peak-slice` | 骨架就是 E0–E9 加 H1；对规则板只读最小一片；开始条件有这一片已验过一条（§10.3） |
| `d-script-timeout` | M7 的份（周报里反复超时的一节）排在 P2 之前（§18.2 R4-F5） |
| `docs/CHARTER.md` 0.7 | 两行默认禁用，验证通过才启用；八道门首日模式写明并作为例外让人看到（§12.1） |
| `question-37` A、`d-plain-questions` | §1.2 新加的字句只用人话：没有「验收」「标定」「门禁」「指标流水」之外的内部词，本稿新写的 m7-3 第 7、8 条与 m7 特性第 3、4 条按换词表写 |

### 18.4 修订记录

- 0.6（2026-10-30）：§19。0.5 全文在同目录 `design-0.5.md`。0.5 被评审批准之后因为四条 MEDIUM 与三条 NIT 要改文字，所以另起 0.6，不并回 0.5。
- 0.5（2026-10-30）：本节的全部改动。0.4 全文在同目录 `design-0.4.md`。后面的迭代（评审给出还挡路的发现、重改）仍记为 0.5，把处理记在本节下面，不另起版本号（这一条在 0.5 通过评审之前适用）。

## 19. 0.5 → 0.6：第 5 轮评审意见的处理

评审：同目录 `design-review.md` 末一轮「0.5 第 5 轮」与 `design-review-gate.json`（总第 5 轮，APPROVED：没有一条发现挡住开工；HIGH 0、MEDIUM 4、NIT 7）。评审把每条发现标了挡哪一步：R5-F1 挡 E1b 与 E8，R5-F2 与 R5-F3 挡 E4，R5-F4 在 E4 合入之前决定；NIT 各有时间。评审说都是文字改动，不需要再出一稿评审。人说「尽快自举吧」，所以 0.6 趁没有东西在建，把四条 MEDIUM 与时间已到的三条 NIT 一次改掉，其余写明留给哪一步。

### 19.1 本稿改的

| 发现 | 处理 | 在哪 |
| --- | --- | --- |
| R5-F1（MEDIUM，挡 E1b、E8）§6.6「0.5 加的 L2 用例」被截断；§9.1 缺 `glm-exec-modules`、`glm-exec-peak` | 改，照评审给的改法：§6.6 拆回两条，前一条列（a）至（h）（两模块的图、第二档、第三档、`waiting_human` 与第一档、`batchOf` 与 `pendingReport`、`returnsOf`、读不出模块、示范与指标出口），后一条把 0.4 的「其余」接回完整；（g）按 R5-F3 的改法写；§9.1 补两行：`glm-exec-modules`（真实引擎写阶段，模拟人放行 A 不放行 B，核对（a）（b）（c），一个 goal，`goals.block` 接受 `hourness-design-wait`，U30）和 `glm-exec-peak`（只在规则板最小一片带可注入的计价与时钟接缝时才有，否则写「不做」，与 §10.3 第 5 条、§9.2 第 9 步一致）；`glm-exec-drive` 行末的「下一行」改为指到 `glm-exec-peak` 一行。§18.1 与各处引用自然对上，不另改 | §6.6、§9.1 |
| R5-F2（MEDIUM，挡 E4）§3.1.5 检查第 5 条的断言与 §3.7.1、§6.4 相反 | 改，照评审：检查第 5 条对有效深浅断言：夹具无命中时，声明 `light` 加一份改动都在 `site/feed/` 之下的假交回，`floorHits` 为空、有效深浅 `light`；夹具多一条判不了的条目时，有效深浅 `full`、`floorHit` 为 `unparsed`；示范里不加审查派发 | §3.1.5 |
| R5-F3（MEDIUM，挡 E4）读不出模块时放行，与失效安全默认和人定的「模块没放行不派开发」相反 | 改，失效时拒绝：`releaseOf` 多第三种结果 `{ok: false, level: 'module', reason: 'unreadable'}`；条件是读模块的函数抛错且目标有直接子节点是带 `stage` 的特性（从原始图上数，不用 M3 的文件）；派发处与 `worker-scope` 都经 `releaseOf` 拿到它：`briefGate` 写 `not_released`，`hint` 为 `The module structure could not be read; the harness refuses dispatch until it can.`，`worker-scope` 拒绝写入；没有带 `stage` 的特性的目标照没分模块处理；§6.1 一行、§3.9.7 失败表第 1 行、§6.7 行健康同改；L2 加一例（§6.6（g））。不同于评审字面的一处：评审写「调用方捕获抛错后返回它」，0.6 把捕获放在 `releaseOf` 里（读模块的函数作参数，缺省取 M3 的文件），两个调用方因此不会各写一份捕获而写出不同的结果，L2 也能直接注入抛错的读法 | §2.4、§3.2.1、§3.5.1、§3.9.7、§6.1、§6.6、§6.7、§8.1 E1a/E4 |
| R5-F4（MEDIUM，E4 合入之前决定）模块设计的独立评审没有处置，现写法还会拒绝它 | 编排方已裁定改法 A，不再权衡：产品里做；`kind: review`、写入范围为空、`source` 指向模块设计决策的任务，由 M7 派发；模块没放行也派得出去（目标层照查）；记录形状交给 M3，让 `moduleReleaseGate` 加一项。理由：人在 `d-design-onepage` 里定的流程包含「每个模块的设计对照方向清单独立评审」，放弃（改法 B）等于删去人定过的东西。本仓库自举不受影响（本仓库的模块设计评审由 Kiro 工作流做）。写在 §3.7.5（任务形状、派得出去、审查者、轮次、记录形状、失败与边界）、§3.5.1（`bad_task`、`not_released`、`nothing_to_review` 三行）、§18.2（决定与何时做）、§7 的 M3 一行。评审没有规定、本稿定的几处（agent 定，人可推翻）：任务由 harness 在 `dispatch_task {id: <模块 id>}` 时建，不让主 Agent 手写节点；任务出生为 `proposed`（M3 附录 0.5 §3.14.7 的收窄），所以 `bad_task` 对这一种形状也收 `proposed`；`scopedTasks` 与完成门禁不数它；挡路类多一类 `direction:<i>`；记录比评审给的例子多一个字段 `派出 <at>`，因为只用写记录的时刻，审查期间改了设计的情形会被当成「评审之后没改」 | §1.1、§1.2 m7-2、m7、§2.4、§3.1.2、§3.5.1、§3.7.5、§3.9.1、§3.9.3、§6.4、§6.6、§7、§8.1、§9.1、§15 U31、§18.2 |
| R5-N1（NIT）示范自身的两处小矛盾 | 改，两项都做：（1）示范的 `why` 换成 `touches one directory and has a check that can be run`，不依赖模型大小，长度仍在 1,400 字符内；（2）§1.2 m7-2 第 5 条改为「例子里除了编出来的模型名，拿去真的派一次也能通过全部检查」 | §1.2、§3.1.5 |
| R5-N2（NIT）m7 特性行写「§10.3 的四条」 | 改：写「五条」 | §1.2 |
| R5-N7（NIT）依据行与 U26 的版本 | 改：依据（0.6）写 main `e752cab` 或更晚；U26 的规则板设计版本写 0.10 | 文首、§15 U26 |
| （编排方交代，不是评审发现）验收字句必须照写的就成立，不依赖自举范围之外的东西 | 重写三份验收草稿（R5-N3）时把 §1.2 里四处依赖范围之外的字句收紧，字句与草稿一致：m7-3 第 4 条不再写「记一条复盘」（复盘节点的自动生成是 P5，骨架期间由编排者手记）；m7-3 第 5 条只写少做（不做档要整块规则板的排队才有可停的活，R5-N5 的已知代价留在原处，不在这里改）；m7-2 第 4 条写成「没有经验板块的服务时这一节不出现，有服务时用假的服务检查」（M5 不在自举路径上）；m7 特性第 3 条去掉「晨报从这些记录算」（那是 m7-6，P2）。含义没有变，只是不再替后面的步骤和别的模块作保 | §1.2 |

### 19.2 留到何时

R5-N3（放行稿与验收字句的草稿）由编排方在设计之外同批做完，见 §14 与 §18.2；R5-N4（U28 核对时）、R5-N5（自举开始之前一句话，或整块规则板的门合入时）、R5-N6（E3）各留到它点名的那一步或那一次核对，在 §18.2 与已有的几条并列记下，一条不丢。

### 19.3 方向清单的复核（0.6）

| 定案 | 本稿怎样遵守 |
| --- | --- |
| `d-design-onepage` | 模块设计的独立评审（违背方向清单即挡路）在产品里做，模块没放行也派得出去；模块没放行不派它的开发不变，读不出模块时也不放行（§3.5.1、§3.7.5） |
| 失效安全默认（§2 开头的学科依据） | 读不出模块时拒绝，与 `worker-scope` 一次都没读到图时的拒绝一致（§2.4、§3.2.1） |
| `d-agent-examples` | 示范的检查对有效深浅断言，示范不依赖模型大小（§3.1.5） |
| `d-plain-questions`、`question-37` A | §1.2 新加的字句只用人话（「怎样算做完」「设计的独立审查」，没有门禁、验收、标定之类的词） |
| `docs/CHARTER.md` 0.7 | 不变：两行默认禁用，八道门首日模式写明并让人看到（§12.1） |

### 19.4 修订记录

- 0.6（2026-10-30）：本节的全部改动。0.5 全文在同目录 `design-0.5.md`。
- 0.6 修订（2026-10-31）：答复 E3 的独立评审（`review-e3.md`，发现 E3-9）。§3.8.4 的执行前判定表补五条能把本地主干挪到没检查的提交的写法（`push .`、`branch -M`、`worktree add -B`、`pull .`、`symbolic-ref`）和一条改远端跟踪引用的写法（`push .` 到 `refs/remotes/`），每条的判定写在表里，表后一段说明来由；E1b 与 E7 两行、§6.6 的上游用例各加一句指向它们。写法分类的代码与用例落在 E1b，执行前监听器、拒绝用例和「今天必败」断言落在 E7，现在都还没有代码。版本号不变，没有别的地方改动；评审里 E3-10 的三点（默认分支与 `remote get-url` 两个读法、读不出的 reflog 与 `unknown` 按推送一类处理、`fetch` 字样要这次调用自己的命令佐证）是 E7 的实现细节，设计文字已经覆盖，不改。
- 0.6 修订（2026-10-31，第二次）：答复 E3 后续评审（`review-e3-followup.md`，发现 FU-1）与 E3 评审的 E3-6。§6.5 加一行：harness 自己的 git 调用不运行仓库配置里的钩子与 fsmonitor 命令（`-c core.hooksPath=<空设备>`、`-c core.fsmonitor=false`），写明原因、这是人定的、不受影响的主 Agent 与子 agent 的 shell 调用，以及没有关的过滤器与 `ls-remote` 的传输程序；门禁工作树那一行补上 E3-1、E3-2 的守卫和 `refs/hourness/gate-head`（E3 里写、设计里没提的那个引用）。代码与用例已在 `m7` 分支的 `src/execute/git.ts`、`tests/execute-git.spec.ts`。版本号不变，没有别的地方改动。
- 0.6 修订（2026-10-31，第三次）：答复 E3 后续评审第二轮（`review-e3-followup.md`，发现 FU-4、FU-5）。§6.5 的钩子一行改为钩子目录里的与配置里定义的钩子都不运行：`git.ts` 再加 `-c hook.<事件>.enabled=false`（`post-checkout`、`reference-transaction`、`post-index-change`，评审在 git 2.55.0 上逐事件实测这三个会被这些调用触发），因为配置里的钩子与钩子目录里的叠加着跑，`core.hooksPath` 管不到；一行里写明版本边界（`hook.<事件>.enabled` 从 git 2.55 起有，2.54.x 上按文档推断关不住，落在 §3.8.4 保守的一侧）。门禁工作树一行里 `refs/hourness/gate-head` 改为「执行器用 `update-ref` 写的唯一一个引用」，并写明 `ensureWorktree` 另外建、改名 `hz/<任务>` 分支。代码与用例在 `m7` 分支的 `src/execute/git.ts`、`tests/execute-git.spec.ts`。版本号不变，没有别的地方改动。