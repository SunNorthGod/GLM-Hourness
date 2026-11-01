# 循环板设计（项目图节点 `schedules`）

版本：0.6（2026-10-30），第六稿。0.5 经第 5 轮独立评审（同目录 `design-review.md` 的「Round 5」、`design-review.json`：CHANGES_REQUESTED，挡路 3 条 MEDIUM：F44–F46；不挡路 10 条 NIT：F47–F56；第 4 轮的 F40、F41、F43 关闭，F42 留到放行稿）。人 2026-10-30 回「可以」，准了这一稿（`schedules` 节点 08:47Z 批注）。本稿逐条处理 F44–F56，F42 仍留给重写放行稿的那一步；处理表在 §19.5，每处改动答的是哪一条发现见 §19.5 的「在哪」一栏与 §20 的 0.6 一行。0.5 原文留作同目录的 `design-0.5.md`（`.agents/` 不进 git）；`onepage.md` 与 `mockup-loops.svg` 由评审之后的一步按本稿重写，本稿不动这两个文件。0.6 改的几处：
- F44（挡路）：仓库里的条目文件与 git 不再打架。新文件 `.llm/loops/repo-written.json` 记循环板最近一次写成的每一项的字节哈希；读取时只在变更记录比文件新、且 `repo-written.json` 也与变更记录不同（确实欠着一次写）时才补写，相同而文件变成别的样子（`git revert`、手改回旧版）当成「在它之外被改」、不写回，文件不在（切到没有它的分支、`git stash -u`、`git` 删了）当成「当前检出里没有」、不写回、页面写明；写仓库文件时 git 正在合并、变基、拣选、回退、二分或 `index.lock` 在就先不写、每拍看一次、都不在了再写（照规则板 0.9 对 `docs/rules/` 的同一套做法，§9.1、§9.2 第 5 步、§9.3）。
- F45（挡路）：`env.files-edited` 的去重键带回合号，`files-edited:<会话>:<turn>-<step>`，两个数都取自 `agent/pre-step` 的载荷，`turn` 由会话投影接续，不同回合的同一步不再撞键（§4.4）。
- F46（挡路）：人加的检查（与 `to: 'event-session'` 的脚本）按「条目 + 会话 + 工作树的根」分组去抖、限次、不重叠与待跑，每组在自己的检出里跑、结果交给自己的会话，两个工作树里并行的改动各跑各的（§6.6、§6.7）。
- F47–F56（不挡路）：七处与 0.5 相抵的旧文字改正（F47）；高峰中途改档时热会话任何一档都调一次恢复（F48）；拦路脚本的位置、后台与排队数写全（F49）；`runCommand` 加 `queue`，分开人加的检查与 M4 自带的检查器，更正给 M4 的接缝（F50）；新克隆上认回要内容对上、不只认一张图决定（F51）；`loop-read` 挪进项目、用户级 `machine/` 只留提醒状态（F52）；`resolveProgram` 把程序解析成 `PATH` 里项目之外的绝对路径再起、跳过工作树里同名的程序（F53）；没人听的 `env.files-edited` 不写收件箱、去重键按事件名字空间分开记上限（F54）；`**` 匹配零个目录写明（F55）；V13 已答，`loops.remind-waiting` 用退路写法（F56）。每处见 §19.5 与 §20 的 0.6 一行。

0.5 的版本说明（留作对照）：0.5（2026-10-30），第五稿。0.4 经第 4 轮独立评审批准（APPROVED，挡路 0 条，不挡路 4 条 NIT：F40–F43）。0.4 写在人最新的三项决定之前，照这三项决定与编排方的接缝裁定改写，并关掉 F40–F43（处理表在 §19.4）。0.4 原文、草图与一页放行稿留在 `design-0.4.md`、`mockup-loops-0.4.svg`、`onepage-0.4.md`。0.5 改的几处：
- 条目与规则板同一个形状（`d-boards-as-hooks`）：什么时候 + 可选的筛选 + 动作。筛选从 `Trigger` 里提出来，与 `when` 并列；动作是系统自带的（告诉主 Agent、插件带的 harness 动作、由带来它的那一行当场做），或主 Agent 派子 agent 写、人看过原文同意的脚本。0.4 的「跑人写的命令」（`run`，`argv`）换成脚本（`script`）：脚本像 hook，从标准输入收到这次事件的 JSON，作为单独的进程在项目目录里跑，拿不到 DSH 的凭证与 GLM 的 Key；人在四行之后看到脚本原文、同意后当场生效，不试运行；同意时按内容哈希钉住，脚本改过就不跑、板上写明、等人再同意。条目形状、事件表、筛选与脚本执行器两块板共用，归本设计（编排方的接缝裁定，`design-context.md`「Main agent and peak; stale entries; hook seam」）；哪些事件拦路、拦路脚本的结果是什么意思、怎样进 `checkCall`，归规则板，本稿只写引用（§2.2、§2.3、§4.6、§6.6）。
- 存放（`d-rules-in-repo`）：人加的条目与它们的脚本进项目仓库的 `docs/loops/`；运行时的东西（收件箱、运行状态、变更记录、运行记录、结论、日志、给页面的一份）进项目的 `.llm/loops/`，不进 git；用户级目录只留账号一级的那两件事（GLM 额度与登录的提醒只说一次）要的几个文件。0.4 §9.1 的「用户级目录按项目分」删去（§9）。
- 主 Agent 不受高峰影响（`d-main-agent-peak-exempt`）：循环板不再因高峰攒着给主 Agent 的消息，也不再改写 DSH 投来的提醒那一步；高峰结束那一项的判断表删去「不做档一律跳过」一行，少做与不做两档走同一张表（§6.9）。
- 周报列出人加的、4 周没跑出过结果的条目，提议删掉（编排方定，可推翻；§6.11）。
- 脚本超时（人定的 `d-script-timeout`）：拦路的脚本过了超时先照条目写的办法（缺省放行），进程在后台接着跑到 10 分钟，晚到的结论交回调用它的那块板；主干前进之前那种难以退回的一步缺省挡住；循环板自己的脚本超时记「没跑完」、交给主 Agent，事件留到下一次；超时次数进周报（§6.6、§6.11）。存放范围按人定的 `d-memory-scope` 写全：用户级只留 GLM 登录信息、ZCode 设备号、人设、关于人本人的记忆、账号的额度与用量、DSH 配置里的插件配置（§9）。
- 示范（人定的 `d-agent-examples`）：`loop_propose` 的说明里带两个做好的例子，一个到点告诉主 Agent，一个碰到事件跑脚本（脚本原文、标准输入的事件 JSON、输出怎样用），例子过真提议同样的校验，不碰练习题的记账领域（§7.3）。
- 第 4 轮的四条 NIT：F40（冷会话被恢复时 M7 先接上了推进）、F41（交条目的一方晚到或暂时撤回时不删到点任务）、F42（放行稿的疑问一句，交给重写放行稿的那一步）、F43（三处旧文字）。
- 与规则板 0.9 的接缝核对（2026-10-30，`.agents/tasks/rules/seam-check-v09-v05.md`）之后的修正：引用规则板的地方改按 0.9 的节号与内容（拦路事件的 id 已由 rules:§2.3 定下）；`gate.` 事件的字段可以叫 `session`（§3.2）；`matches` 写入时试跑一次（§2.2）；文件变化的判定两块板共用一个函数（§4.1）；`AttachDetail` 的上限在 §12 与 §3.1 对齐。同时照编排方的裁定「Check entries seam」（`design-context.md` 同名一节）加人的「跑检查」：命令原文取自项目的环境工具节点，由循环板的执行器跑，走与脚本同一条同意的路；M4 自带的检查器仍是它交来的 `self` 条目（§2.3、§4.4、§5.3、§6.6、§7.1、§17 M4 一条）。每一处见 §19.4 的第二张表与 §20 的 0.5 一行。

0.4 的版本说明（留作对照）：0.4（2026-10-30），第四稿。0.3 经第 3 轮独立评审（同目录 `design-review.md` 的「Round 3」、`design-review.json`：CHANGES_REQUESTED，挡路 2 条，都是 MEDIUM：F34、F35；不挡路 4 条 NIT：F36–F39；第 2 轮的 4 条挡路与 11 条 NIT 全部关闭）。这是 `question-11` 下的第三轮，按规矩停下交人，人准了再改一稿（「行，改吧」），本稿逐条处理，处理表在 §19.3。0.3 原文、草图与一页放行稿留在同目录的 `design-0.3.md`、`mockup-loops-0.3.svg`、`onepage-0.3.md`，更早的留在 `design-0.2.md`、`design-0.1.md` 与对应的草图、放行稿（`.agents/` 不进 git）。0.4 改的两处挡路：
- 高峰结束的那一项照编排方最新的接缝裁定改（`design-context.md`「Seam rulings between designs」末条，规则板 0.8 §3.6、§10.7 循环板一条第 8 点）：高峰里主 Agent 剩下的只有被高峰模式挡着的活时，M7 以自己的原因码停住自动推进、这样的轮不算空转、不问人，并交 harness 动作 `execute.resume-drive`；第 14 项 `loops.peak-end` 在高峰结束时先恰好调它一次、再提醒主 Agent，少做与不做两档都这样，持有者会话在高峰结束时是冷的也一样。0.3 请 M7 加的 `execute.resume-after-peak` 撤回；以 `hourness-idle-rounds` 阻塞的 goal 是真空转，不再由循环板恢复（§6.9 第 4 条、§17 M7 第 6 条）。
- 对账不再因「持有者状态不是 `ok`」就删任务（删任务连发送记录一起删，不可逆）：只在没有主 Agent、会话已归档或找不到时删；持有者状态为「在别处」（`elsewhere`）或「不明」（`unknown`，0.4 把持有者记录读不出也归到这里）时，绑在持有者会话上的任务一律不删、不搬、不重建，页面标出、行健康报出；循环板删任何一条 DSH 任务之前，要证明它是自己建的、而且已经没用，并先把它的全文写进 `removed-tasks.jsonl`（§6.2、§6.4、§9.1、§11.3）。

0.3 的版本说明（留作对照）：0.2 经第 2 轮独立评审（同目录 `design-review.md` 的「Round 2」、`design-review.json`：CHANGES_REQUESTED，挡路 4 条，都是 MEDIUM：F19–F22；不挡路 11 条 NIT：F23–F33；第 1 轮的 8 条挡路全部关闭），本稿逐条处理，处理表在 §19 的第 2 轮一节。0.2 原文、草图与一页放行稿留在同目录的 `design-0.2.md`、`mockup-loops-0.2.svg`、`onepage-0.2.md`，0.1 的留在 `design-0.1.md`、`mockup-loops-0.1.svg`（`.agents/` 不进 git）。0.3 改的四处挡路：高峰结束叫醒主 Agent 的那一项照编排方修订后的接缝裁定归编排层，GLM 包只给高峰变化事件与高峰时刻的计算，事件因此改名 `channel.peak-changed`（§3.4、§4.3、§5.2）；主 Agent 的会话归档了或找不到时，循环板在建提醒之前与每次投递之前都查出来，按「没有主 Agent」处理并告诉人（§6.2、§6.4）；人加的跑命令的条目，四行下面由 harness 附上命令原文与注意事项，`record_human_answer` 核对主 Agent 确实把它们给人看过才算同意（§7.1）；事件的去重键按「一次发生」定，每种事件写明键由谁、怎样生成，重复的那一次记下并报出（§3.1、§4、§6.3）。

0.2 的版本说明（留作对照）：0.1 经第 1 轮独立评审（CHANGES_REQUESTED，挡路 8 条：HIGH 4、MEDIUM 4；不挡路 10 条），0.2 逐条处理。改动最大的四处：插件的默认条目与事件改由各行经服务 `glmHournessLoops` 的 `contribute` 交给循环板，循环板的代码里不写别的行的条目（§3）；页面只看，人的写入只有对话与人敲的 `/loops` 命令（§7、§8）；在对话里加条目走 M3 的 `propose_to_human` 与 `record_human_answer`（§7.1）；GLM 的四条照 M6 0.3 计价服务的 `loopDefaults` 读，M6-L1 到 M6-L5 逐条落实（§3.4）。

0.6 的依据：第 5 轮独立评审 `design-review.md`「Round 5」与 `design-review.json`（F44–F56）；人 2026-10-30 回「可以」（`schedules` 节点 08:47Z 批注，准这一稿改 F44–F56、F42 留到放行稿，「只此一稿」）；`.agents/tasks/design-context.md` 的末四节（「Both boards are hook-style; storage scope」「Main agent and peak; stale entries; hook seam」含 `d-memory-scope`、`d-script-timeout`，「Worked examples for the agent」，「Check entries seam」）；图上比文档新的节点：`d-memory-scope`（06:25 approved）、`d-script-timeout`（06:27 approved）、`d-rules-peak-slice`（06:36 approved）、`d-agent-examples`（approved）等都已 approved，`schedules` 节点 07:12Z 是 M4 0.4 的接缝请求、08:47Z 是人准这一稿，均已读入（`node .agents/tasks/m1-l4/show-nodes.mjs rules schedules m4 d-boards-as-hooks d-script-timeout d-rules-in-repo d-memory-scope d-agent-examples d-main-agent-peak-exempt d-rules-peak-slice`）；规则板 `rules/design.md` 0.9（`design-v0.9.md`）只读，作接缝参考（本稿不动 `.agents/tasks/rules/`，规则板 0.10 与本稿同一批写，接缝由后面的一步核对）；接缝核对报告 `.agents/tasks/rules/seam-check-v09-v05.md`；`docs/CHARTER.md` 0.7（committed `f2faa6f`，本稿不改它，只引用它的 §9 用户级一行与 §6 影子一句，由规则板那一批管）。相邻设计的盘上版本与 0.5 相同（M7 0.4、M6 0.4、M3 附录 0.4、M4 0.4、plain-ui 0.7、metrics 0.1），本稿给它们的新请求见 §17 与 §19.5。

0.5 的依据：项目图节点 `schedules` 的正文与全部批注；人定的 `d-boards-as-hooks`（人：「我指的是，循环板和规则板都借鉴hook和dsh插件的理念，然主Agent编脚本写进去？」「同意了直接运行就行」）、`d-rules-in-repo`（「一样进仓库和项目目录」「差不多都是进.llm，全局的似乎只剩下人设和登录信息之类的吧？」）、`d-main-agent-peak-exempt`（「主Agent应该不受高峰影响，随时回复的」），以及下面 0.4 的依据里列的各项；共用的人定清单 `.agents/tasks/design-context.md`，读到末两节「Both boards are hook-style; storage scope」与「Main agent and peak; stale entries; hook seam」（接缝裁定：条目形状、事件表、筛选与脚本执行器归循环板，哪些事件拦路与拦路结果怎样进 `checkCall` 归规则板，一条同意的路，两边各自引用对方的节），以及人在这之后定的 `d-script-timeout`（人：「没问题」；拦路脚本超时先照条目放行、后台接着跑到 10 分钟、晚到的「不行」马上告诉主 Agent，合入主干之前的超时缺省挡住；§6.6）与 `d-memory-scope`（人：「全都没问题」；全局只留 GLM 登录信息、ZCode 设备号、人设、关于人本人的记忆、整个账号的额度与用量、DSH 配置里的插件配置；§9）、`d-agent-examples`（人：「彳亍」；主 Agent 要写的每种东西各配一道示范，放在写它的工具说明里，过真输入同样的检查，不碰练习题的领域；§7.3）。相邻设计按写本稿时盘上的版本：规则板 `rules/design.md` 0.8（06:04，06:32 批准；另一步正在同时写 0.9，本稿没有读到它，接缝在本稿之后由一次对照核对，本稿引用规则板的地方写 0.8 的节号与 0.9 要落的内容）；M7 `m7/design.md` 0.4（13:40，§2.5、§3.9.1 的 `agent/created` 表、§3.9.5、§3.10 的周报）；M6 `m6/design.md` 0.4（13:31，契约不变）；M3 附录 `m3/design-addendum.md` 0.4（13:35，§2.4 持有者记录、§3.5 第 5a 步、§3.13 `attach` 分派表、§6 `AttachDetail` 的上限）；M4 `m4/design.md` 0.3（07:18；0.4 另一步正在同时写，本稿给它的要求在 §17 与 `graph-ops-v05.json`）；plain-ui `plain-ui/design.md` 0.7（§4.7 的页面约定与 `homeLine` 本稿照旧用）；指标流水 `metrics/design.md` 0.1（§3.3 `<项目根>/.llm/metrics/` 与自带 `.gitignore` 的做法，本稿的 `.llm/loops/` 照它）；`docs/CHARTER.md`（05:48 的盘上稿：§6「新门禁先以影子模式运行」与 §9 的存放表由规则板 0.9 同批改写，本稿不改它）；DSH 运行时另读了 `dsh-workspace` 的 `list()` 与工作区的 `path`（§6.1）。

0.4 的依据（留作对照）：项目图节点 `schedules` 的正文与全部批注；人定的 `d-defaults-readonly`、`d-rules-visible`、`d-one-main-agent`、`d-chat-not-cards`、`d-design-onepage`、`d-peak-mode`、`d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-rules-human-only`、`d-ui-look-not-operate`、`d-plain-questions`、`metrics`；共用的人定清单 `.agents/tasks/design-context.md`（读到末一节「Seam rulings between designs」的末条「Waiting out a peak under 少做 or 不做」：高峰里只剩被高峰模式挡着的活时不计 M7 的空转、M7 以自己的原因码停住并经 `glmHournessExecute.runAction` 交 `resume-drive`、高峰结束时编排层的那一项跑它并提醒主 Agent、规则板只交档位与挡着的是不是高峰；含同一节按本设计第 2 轮评审 F19 修订的那一条：高峰结束叫醒主 Agent 的条目归编排层，GLM 包只给高峰变化事件与高峰时刻的计算）。相邻设计按写本稿时盘上的版本：M7 `.agents/tasks/m7/design.md` 0.3（03:12，留作 `m7/design-0.3.md`；§2.5、§3.8.3、§3.8.4、§3.9.1、§3.9.5、§3.11）与另一步正在写的 0.4（13:11 的盘上稿，还没写完：版本说明、§1.1 末段、§2.5 的动作表与「与循环板的接口」第 1–7 条已有高峰等待与 `execute.resume-drive`，§3.9.5 的正文还是 0.3 的）；本稿写给 M7 的照上面那条裁定与 0.4 盘上已有的部分写，接缝在 §17 M7 一条与 §19.3 末段；M6 `.agents/tasks/m6/design.md` 0.3（02:54，留作 `m6/design-v0.3.md`；§4.4、§4.9、§5、§8、§18）与另一步正在写的 0.4（13:12 的盘上稿：§5 的 `LoginView`、`ChannelTrigger`、`ChannelLoopDefault` 与 0.3 相同，§8.4 的 M6-L1 到 M6-L5 不变）；规则板 `.agents/tasks/rules/design.md` 0.8（06:04 的完稿，06:32 批准：§3.6「高峰里等高峰结束」、§6.3 不做档的单与 `pausedGoal`、§7.2 的 `RulesService.heldForPeak` 与 `PeakModeService` 的 `stateFor`、`stateForProject`、`peakHoldFor`、`PEAK_REDUCE_GLM_WORKERS`，§9.3、§9.4，§10.7 对本设计 0.2 七条请求的答复与给 0.3 的第 8 点）；plain-ui `.agents/tasks/plain-ui/design.md` 0.6（§3.1、§4.7、§6.4、§11）；M3 附录 `.agents/tasks/m3/design-addendum.md` 0.3（§2.4、§3.3–§3.8）；M4 `.agents/tasks/m4/design.md` 0.3（§6）。另有 `docs/DESIGN.md` §2.4a、§6；DSH 运行时 `reference/dsh-desktop-0.2.1-rc.3/`（`dsh-schedule`、`dsh-tool-schedule`、`dsh-tool-goal`、`dsh-agent`、`dsh-agent-loop`、`dsh-api-session-controller`、`dsh-session`、`dsh-tools`、`dsh-commands`、`dsh-session-projection`、`dsh-workspace`、`dsh-api-workspace-controller`）；本仓库 main `fe0bace` 的 `src/`（0.3 的依据是 `d92eae1`；两者之间本稿引用的 `src/shared/pricing.ts`、`dsh-min.ts`、`step-notice.ts`、`tool-names.ts`、`health.ts`、`src/graph/panel-row.ts`、`src/glm-llm/login-row.ts` 都没改，`src/loops/`、`src/shared/peak-mode.ts`、`src/shared/plugin-labels.ts` 仍不在，`pricing.ts` 仍没有 `nextPeakChange`）。

证据写法：沿用 `docs/DESIGN.md` §2.4a。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，其他文件写出文件名；「m7:」「m6:」「rules:」「plain-ui:」「m3:」指上面各设计文件的节号。〔实读〕读过源码或包文档；〔推断〕由源码推出、没有运行；〔未核实〕列进 §10.2 的核实项，随 L3 或 L4 核对。

范围：只有设计。不改代码、已跟踪文件、`docs/graph/`、`~/.dsh`；要写进项目图的事项写在同目录的 `graph-ops-v05.json`（0.4 的在 `graph-ops-v04-written.json`，0.3 的在 `graph-ops-v03-written.json`，0.2 的在 `graph-ops-v02.json`；同目录的 `graph-ops-v03.json`、`graph-ops-r3.json` 是编排方记评审与派单的批注，不是本稿的草稿），由编排方写入。

依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）：hook 的通行约定（Claude Code、Kiro、git hook 的同一套：事件以 JSON 从标准输入进，退出码说结论，标准错误写理由，超时与出错时的缺省写明在条目上）；软件供应链的完整性做法（按内容哈希钉住要执行的文件，改了就要重新同意，执行的是核对过的那一份字节，不是核对之后再去读的路径）；配置即代码（条目与脚本入库、可评审、随 git 走，运行时状态与配置分开放、不入库）；作业调度的常规做法（cron 与 systemd timer 的「错过的只补一次」、去抖与限次、同一项不重叠运行）；插件架构里的扩展点与登记表（宿主只定契约与校验，扩展方交数据，宿主不认识扩展方的内部）；事件驱动系统里的至少一次投递与幂等键（每一次发生一个去重键，键里带这一次的标识而不只是主体，同消息队列里生产方给的消息 id 与幂等键的做法；每次运行一个运行号）；人机交互里的「知情同意」（要人同意的是会在他电脑上跑的命令时，同意之前给他看的是命令原文，不是转述）；可靠性工程（锁、超时、退避、只追加的记录、崩溃后从持久的事实重建）；安全工程（命令只由人写、最少的环境变量、给模型的文字先转义与脱敏）；人机交互与认知负荷（页面只说人话、只看不操作，改法写成一句能照说的话）；`docs/CHARTER.md` §7.1 条款 7（失败要出声）与条款 11（处处留痕）；`d-failure-plans`（按操作写发现、重试、恢复与留痕，不穷举）。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

- 循环板是编排层包 `dsh-hourness` 里的一块板（新行 `glm-hourness/loops`），放「到点了或碰到某件事，就去做一件事」。每一项与规则板的每一条同一个形状（`d-boards-as-hooks`）：什么时候（一次、每隔、每天、每周、cron；或共用事件表里的某个事件）+ 可选的筛选（按事件声明的字段比，例如「改到的文件里有 `package.json`」）+ 动作。动作是系统自带的（告诉主 Agent 一段话；做插件带的一个 harness 动作再告诉主 Agent；由带来它的那一行当场做、循环板只列出），或者是会跑东西的两种：一段脚本（主 Agent 派子 agent 写），或项目里一项检查（命令取自人在项目图上批的环境工具节点）；这两种只由人在对话里看到原文、同意后当场生效，由循环板的执行器跑。每一项还写明谁带来的（哪个插件的哪一行，或人自己）。每跑一次都由 harness 记进指标流水。
- 代码只提供机制。循环板的代码里只有：条目与事件的格式和校验、到点怎样投递、事件怎样收集、命令怎样跑、记录怎样写、谁能写。编排层与 GLM 插件原本要写死的联动，都由各自那一行把条目当数据交给循环板，页面上写明是哪个插件带来的，只能看（`d-defaults-readonly`）：
  - M7 的执行行与运维行交 10 项（设计放行之后开始推进、交回之后派审查、审查过了之后合入、停下之后在对话里问人、活都关了之后派整体审查、合进主干之后跑一遍完整检查、重启之后接上、晨报、周报、夜间巡检），条目的数据留在 M7 的 `entries.ts`。
  - M4 交 2 项：env 行的「改完文件就跑检查」（M4 自带的检查器）与图行的「同一处第三次返工之前停下问你」，都由它们自己执行，循环板列出、记录，并写出检查器自己的规矩。人自己加的检查不在这里：它们是人的条目，由循环板执行（§5.3）。
  - GLM 通道包经计价服务的 `loopDefaults` 交 4 项（高峰开始时提醒模型、看状态时读额度，这两项由 GLM 包自己做；额度快用完时告诉你、登录失效时提醒你重新登录，这两项由循环板执行）。
  - 循环行自己带 4 项：依赖文件变了之后查依赖、有事等你太久时再说一次、GLM 高峰开始时按档位收放（由规则板执行）、GLM 高峰结束时接上挪开的活（高峰里因为只剩挪开的活而停住的自动推进，由它经 M7 的 `execute.resume-drive` 接上，再叫醒主 Agent；少做与不做两档都这样）。后两项看的是规则板的档位与主 Agent，GLM 包两样都没有，所以照编排方修订后的接缝裁定归编排层，页面写「项目编排带来的」；GLM 包只给高峰变化事件与高峰时刻的计算（§3.4）。
- 人自己的条目只由人定：人在主 Agent 的对话里说「每 30 分钟查一下服务器，挂了告诉我」，主 Agent 派子 agent 写好脚本，先用 `loop_propose` 把条目与脚本原文交给循环板核对并记下这条提议，再用 M3 的 `propose_to_human` 把它写成四行给人看；四行下面由 harness 附上脚本原文与注意事项；人同意后主 Agent 用 `record_human_answer` 带人的原话记下，harness 核对原话、核对主 Agent 的回话里原样有那一段，循环板照提议写入，当场生效（与规则板同一条路，§7.1）。同意时脚本按内容哈希钉住：脚本以后被谁改过（手改、合进来的提交、拉来的改动），循环板都不跑它，页面写「脚本改过了，等你再同意」（§6.6）。删除、恢复与确认存档恢复，人也可以在输入框打 `/loops delete|restore|ack`。页面上没有任何写入控件（`d-ui-look-not-operate`）。
- 存放（`d-rules-in-repo`）：人加的条目与脚本在项目仓库的 `docs/loops/` 里，和项目图一样可以评审、随 git 走，换电脑、换人都在；循环板自己写这些文件，规则 `loops:files-only` 挡住别的写入；收件箱、运行状态、变更记录、运行记录、结论与日志在项目的 `.llm/loops/`，不进 git（§9）。
- 不会只加不删：周报列出人加的、4 周没跑出过结果的条目（至多 3 项），由主 Agent 在一个四行提议里请人同意删掉；插件带来的不在此列（§6.11）。
- 时间：「到点告诉主 Agent」的条目用 DSH 自带的定时服务 `dsh-schedule`，任务绑在主 Agent 的会话上，DSH 负责时区、夏令时、cron、重启后补一次与发送记录；主 Agent 换会话时循环板把任务搬过去；在 DSH 任务页里改了循环板的任务，循环板按自己的定义改回。「到点跑脚本或做 harness 动作」的条目由循环板自己的钟跑（不支持 cron），因为 DSH 的投递每次都会叫醒主 Agent、在人唯一的对话窗口里留一回合。
- 事件：一张运行时的事件表，由各行声明（M7 的 `hourness.*` 八个加一个新请求的、M4 的 `env.files-edited` 与只供列出的 `graph.third-reopen`、循环行自己的 `loops.*` 三个），另有循环行照计价服务推出的通道事件三个（`channel.peak-changed`、`channel.quota-low`、`channel.login-rejected`）。各行经 `glmHournessLoops.emit` 交事件，循环板把它追加进项目的收件箱；收件箱跨进程、跨重启，停机期间没处理的起来后照常处理。每个事件带一个去重键，键说的是「这一次」而不只是「这件事」（例 `host-started:<会话>:<进程启动的毫秒>`），每种事件的键在 §4 的表里写明、由交它的一方生成；同一个键 7 天内第二次来时不跑，记一条 `loop-duplicate`，行健康报数（§6.3）。事件表是两块板共用的一张：拦路的事件（工具调用之前、派活之前、主干前进之前）用保留的名字空间 `gate.`，只由规则行声明、只给规则板的条目用，在执行边界当场判、不进收件箱；它们拦不拦、脚本的退出码怎样算，归规则板（§4.6）。
- 去抖与限次：插件带来的事件条目默认 5 秒内的事件合成一次，人的条目默认 30 秒；插件的条目每项每小时至多 30 次、人的 6 次，超出的不丢，合进下一次；循环板自己执行的命令或 harness 动作直接引起的事件，10 分钟内又触发同一项时不跑，记「自己触发自己」。
- 与高峰模式和规则板：循环板跑的脚本先经规则板的判定（`checkCall`，自报花 GLM 积分的脚本在高峰里照档位排队）；档位只经规则板的服务读（`stateFor`、`stateForProject`），不读规则板的文件。主 Agent 不受高峰影响（`d-main-agent-peak-exempt`）：任何一档里给主 Agent 的消息与到点提醒都照常投，循环板不再读 `heldForPeak`；高峰模式只管子 agent（少做：同时跑的个数；不做：排队到高峰之后）与重活，那些由规则板与 M7 管。高峰结束时（第 14 项，§6.9 第 4 条）：高峰里主 Agent 只剩被挡着的活时，M7 以自己的原因码停住自动推进、不问人（编排方的接缝裁定）；高峰一结束，循环板先恰好调一次 M7 的 `execute.resume-drive`，接上了就告诉主 Agent 接着做挪开的活，主 Agent 的会话是冷的、恢复它时 M7 自己先接上了也算接上（F40）。没有停住的自动推进时，主 Agent 若闲着、这段高峰里干过活、又不是在等你，循环板叫醒它一次（M6-R5）；少做与不做两档都这样，因为两档里主 Agent 自己都照常干活，挪到高峰之后的活两档都有。被规则板排着的子 agent 与脚本由规则板在高峰后放出。以 `hourness-idle-rounds` 阻塞的 goal 是真空转，M7 已经让主 Agent 问你，循环板不碰。「这段高峰里干过活」按项目目录里的一份走步记录判，宿主在高峰里重启过也判得对。
- 失败：投递失败按 1、5、15 分钟重试，之后记失败、报行健康；循环板的脚本与检查超时时结束整棵进程树、算没跑完（照样告诉主 Agent，这次的事件下次再跑），崩溃算没过，照条目写的告诉主 Agent（每一项在页面上写明超时多久、超时或崩溃时怎样；0.6 改正 0.4 留下的「超时算没过」，评审 F47）；脚本与同意时的哈希对不上就不跑，页面写明；条目文件在循环板之外被改过时这一项先不跑，等人再同意（§6.6、§9.3）；没有主 Agent 时事件消息先存着，24 小时后作废。主 Agent 的会话被归档、找不到，或正在另一个 DSH 进程里打开时，循环板在建提醒与投递之前查出来：归档与找不到按没有主 Agent 处理，页面与首页写「主 Agent 的会话已归档：在一个会话里打 /wish here」；在另一个进程里打开时把运行锁交给那个进程，那个进程一直不接时每 5 分钟再试一次投递，过了 5 分钟页面写「交不过去」。会话在另一个进程里、或循环板读不出它的状态（归档状态读不到、持有者记录读不出）时，绑在它上面的到点任务原样留着，不删、不搬、不重建；循环板只删能证明是自己建的、已经没用的任务，删之前把全文记下（§6.2）。所有结局都进记录，页面上看得到（§11）。
- 面板：第 2 层的一页，标题「循环板 · 到点了或碰到某件事，就去做一件事」，分组照 plain-ui §4.7：碰到某件事就做的、到点做的、本项目加的；每项一行灰字「<插件名>带来的 · 只能看」或「你在对话里加的」；人能改的地方只写一句「要改：跟主 Agent 说「……」，或在输入框打 /loops ……」。
- 所有规矩都在明面上（`d-rules-visible`）：§2.4 列出今天写在各处的每一条规矩去哪块板；会挡住动作的门在规则板，到点或碰到事就去做的在循环板。写在代码里的规矩原地不动，照旧在两块板上列出。
- 要问人的：没有。替人定的方向列在 §18，由重写一页放行稿 `onepage.md` 的那一步放进去。

## 1. 需求

### 1.1 来源

人的原话（取自项目图节点 `schedules` 与相关决定的转述）：

- 「新增一个循环任务或者定时任务面板如何？我们那些美化工作放成默认的，用户也可以自定义一些任务比如服务器巡查啊之类的，和钩子系统联动起来」
- 「定时任务差不多就那些，还有我忘记说的能联动的吗」
- 「我指的是，合进主干之后：跑一遍完整检查这种类似的我们编排层的东西，而且也没说咱们这个项目具体的东西。你重新讲」
- 「我指的是，你现在编排层自带的是写死进代码里的是吗？我想让你把这些和GLM插件自带的功能做到这个面板的默认功能里去，而不是写死进代码里。能理解吗」
- 「那现在就有一个规则板，一个循环板了是吧？我们几乎没有写死在代码里的逻辑了是吗，都抽象出来了？以及默认的东西先暂时不能修改、开关，只能看」（`d-defaults-readonly`）
- 「档位当然能选。」（高峰模式的档位不算改默认条目）
- 「没问题，项目所有规则确实应该都在明面上」（`d-rules-visible`：合入前的检查清单与必须全审清单是门，放规则板；改完文件就跑的检查器是循环板的条目）
- 「巡检应该由harness提醒主Agent发出。一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」（`d-one-main-agent`）
- 「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」（`d-peak-mode`）
- 「项目图那一套东西大部分是给人看的，而不是给人用的。」（`d-ui-look-not-operate`）；「我是要改产品的，而且聊天不仅是不给问答卡，是连选项都没有的那种，就彻底回归到我们的设计循环那里。你提几点和方案，我补充或者同意这种。」（`d-chat-not-cards`）
- 「怎么保证harness强制实施？我指的借鉴hook，由主Agent写脚本加进规则里还是」「我指的是，循环板和规则板都借鉴hook和dsh插件的理念，然主Agent编脚本写进去？我还是没理解你现在到底是什么方案」「同意了直接运行就行」（`d-boards-as-hooks`）
- 「规则为什么不进项目文件夹？」「一样进仓库和项目目录」「差不多都是进.llm，全局的似乎只剩下人设和登录信息之类的吧？」（`d-rules-in-repo` 与存放范围）
- 「主Agent应该不受高峰影响，随时回复的」（`d-main-agent-peak-exempt`）
- 「其余没啥问题，不过会不会出现主Agent一直往里加但是不删的情况？」（周报提议删掉久不出结果的条目，编排方定）
- 对编排方提的脚本超时做法回「没问题」（`d-script-timeout`）；对记忆放在哪回「全都没问题」（`d-memory-scope`）

编排方记下、人没有反对的事实与提议：DSH 已经带定时服务 `dsh-schedule` 与任务页，时间触发用它，本模块补事件触发与面板；默认分三层（编排层、GLM 插件、本项目自己的）；本项目自己的几项不进产品，是人自己加条目的例子。随 `d-boards-as-hooks` 由编排方定（可推翻）：脚本存在仓库里、和板的文件放在一起；同意时按内容哈希钉住，改过就不跑、板上写明、等人再同意；拦路的脚本默认 10 秒超时，每条写明超时或崩溃时怎样（默认放行，板上显示）；脚本是单独的进程，在项目目录里跑，拿不到 DSH 的凭证；不用 DSH 插件做这件事。随人的「会不会只加不删」由编排方定（可推翻）：周报列出 4 周没跑出过结果的人加条目，一次至多 3 项，用四行提议删，插件带来的不在此列。

### 1.2 功能需求

- F1 条目模型：每一项与规则板同一个形状：什么时候 + 可选的筛选 + 动作（`d-boards-as-hooks`）；另写交给谁、谁带来的、为什么有它；上次与下次；最近一次的结论。
- F2 时间触发：一次、每隔、每天、每周、cron，按人看得懂的时区。
- F3 事件触发：从运行时的事件表里选；每个事件写明是谁报的、带什么字段、能怎样筛。
- F4 动作：告诉主 Agent 一段话；做带来它的那一行提供的 harness 动作，再按结果告诉主 Agent；跑人同意过的脚本，结果交给主 Agent 或事件里的那个 agent；由带来它的那一行自己做，循环板只列出与记录。
- F5 默认条目：编排层各行与 GLM 插件原本要写死的联动，都由那一行把条目当数据交给循环板；循环板的代码里没有别的行的条目；页面写明来自哪个插件的哪一行，只能看。
- F6 人的条目：人在主 Agent 的对话里加、改、删自己的条目，有一次记在图上、带人原话的决定；会跑脚本的条目，人同意之前看到的是脚本原文与注意事项，不是转述，同意之后当场生效、不先试运行；删除、恢复与存档恢复的确认另有人的命令。
- F7 一个主 Agent：报告与巡检是条目，动作是提醒主 Agent，不另开会话。
- F8 记录：每次运行的触发、结局、用时、退出码进指标流水；结论由主 Agent 记成这一项的批注。
- F9 漏跑与重启：宿主停机期间错过的时间点、各行交来而没处理的事件，起来后各处理一次。
- F10 防循环：去抖、限次、自己触发自己时不跑。
- F11 与高峰模式、规则板并存：脚本经规则板判定；主 Agent 不受高峰影响，给它的消息任何一档都照常投；高峰结束时接上挪开的活：少做与不做两档都先接上 M7 因高峰停住的自动推进，没有停住的，再叫醒闲着、高峰里干过活、不在等人的主 Agent 一次。
- F12 面板：第 2 层的一页，只看；首页在有事要人看时多一行。
- F13 明面上：今天写在各处的规矩，逐条有去处（规则板或循环板）。
- F14 GLM 的四条（M6-L1 到 M6-L5）：列出；额度快用完时在 GLM 有新用量后读额度；每分钟看一次登录状态；账号一级的事只交给一个主 Agent 一次；每次执行留痕。
- F15 交给谁要查得到：主 Agent 的会话被归档、找不到、或在另一个 DSH 进程里打开时，循环板在建提醒与投递之前发现，不把消息投进收不到的会话、不记成已投，并告诉人怎样恢复；判不清（会话在别的进程里、状态读不出）时不删到点的任务。
- F16 去重不丢事：同一件事反复发生（每次启动、重开之后又都关了、再修一轮之后又停下）时每一次都处理；真重复（同一次报了两遍）才不跑，并且记下、报出。
- F17 删任务要有据、有底：循环板只删能证明是自己建的、已经没用的 DSH 任务，删之前记下全文与原因；交条目的一方晚到或暂时撤回，不算「没用」（F41）。
- F18 脚本（`d-boards-as-hooks`）：脚本像 hook，从标准输入收到这次事件的 JSON，作为单独的进程在项目目录里跑，拿不到 DSH 的凭证与 GLM 的 Key；有超时，每一项写明超时或崩溃时怎样；拦路的脚本超时后先照条目处理、在后台跑完再交回结论，不拦路的超时记「没跑完」交给主 Agent、事件不丢（`d-script-timeout`）；同意时按内容哈希钉住，改过就不跑、板上写明，等人再同意。
- F19 存放（`d-rules-in-repo`）：人加的条目与脚本在项目仓库里；运行时的东西在项目的 `.llm/` 里、不进 git；用户级目录只留账号一级的事要的几个文件。
- F20 不只加不删：周报列出人加的、4 周没跑出过结果的条目，提议删掉，人同意才删；插件带来的不在此列。
- F21 两块板共用（编排方的接缝裁定）：条目形状、事件表、筛选与脚本执行器是一份，规则板导入同一个模块，不另写一份；拦路的事件只给规则板。
- F22 人加的检查（编排方的裁定「Check entries seam」）：人可以加「碰到某件事或到点就跑项目里的一项检查」的条目，检查的命令原文取自项目的环境工具节点（节点与格式归 M4），由循环板的执行器跑；凡是会跑东西的条目（脚本、检查），不论谁带来，都只经同一条同意的路：人看过原文（脚本整段、检查的命令行）与注意事项、同意之后才写入；M4 自带的检查器仍由 M4 执行、只列出。

### 1.3 非功能需求

- 不打扰人（`question-27` B）：循环板自己不出问答卡、不向人提问；要人定的事都由主 Agent 用 `propose_to_human` 在对话里说（`d-chat-not-cards`）。主 Agent 被叫醒说的话都在它的对话窗口里，次数看得见（页上每项写「每天大约叫醒主 Agent N 次」）。
- 失败要出声：任何一项停了、跑失败、被限次、在等规则放行、脚本改过而没跑，页面与行健康都写出来；插件交来的条目读不懂时，行健康写明是哪个插件的哪一项。
- 激活期不抛错（`AGENTS.md`）：缺服务时降级并上报。
- 对所有模型生效：编排层的条目不依赖 GLM 包；GLM 的条目与高峰的两项只在计价服务在时出现。
- 不依赖反向代理；不改用户 profile。
- 同一个项目同一时刻只有一处在跑循环板（一把锁），宿主崩溃后由下一次启动接上；账号一级的事整台机器只有一处在判（另一把锁）。
- 拦路的脚本不被干活的脚本拖住：共用的脚本执行器给拦路的脚本与干活的脚本各排一队（§6.6），一段 30 分钟的巡检脚本不让工具调用之前的检查等它。

### 1.4 验收条件

下面每条写明在哪一层验证（L2 单测、L3 沙盒探针、L4 桌面版真机）。条目 id 与事件 id 见 §4、§5。

1. 两个包都装、M3、M4、M7 已合入且各自交了条目、项目有主 Agent 时，循环板页按「碰到某件事就做的」「到点做的」「本项目加的」三组列出 M7 的 10 项、M4 的 2 项、GLM 通道包的 4 项与循环行自己的 4 项；每项写名字、什么时候、做什么、谁执行、上次与下次，下面一行灰字「<插件名>带来的 · 只能看」（GLM 包自己执行的两项写「GLM 通道带来的 · 它自己执行，这里只列出 · 只能看」）。页面没有写入控件：`ui/src/loops/` 下的源码不含 `commands.execute`（L2 静态检查，同 plain-ui 验收第 7 条）；L4 走查一遍。
2. 只装编排层包时，页面没有任何 GLM 的条目，没有 `loops.peak-start`、`loops.peak-end`，事件表里没有 `channel.*`（`channel.peak-changed` 在内）；其余照常。两个包都装时，第 13、14 项的来源一行是「项目编排带来的 · 依据 GLM 通道的高峰时刻与规则板的高峰模式 · 只能看」，`channel.peak-changed` 的「谁报」写「GLM 通道」。L2。
3. 插件交来的条目整份校验：一项字段不合（例如 `title` 超过 60 个码点、文字里用了事件没声明的 `{占位}`、事件不在表里）时这一项不显示、不执行，其余照常，循环行的行健康写「<插件> 的 <行> 交来的 <id> 读不懂：<原因>」；另一个来源交来已被占用的名字空间时整份被拒，同一个来源再交一次是整份替换。L2。
4. 主 Agent 第一次出现（`/wish` 成功）之后 60 秒内，`schedule.catalog()` 里恰好有三条循环板的任务绑在主 Agent 的会话上：「循环板 · 晨报」每天 08:30、「循环板 · 周报」每周一 09:00、「循环板 · 夜间巡检」每天 02:30（M7 的 `operate.*` 三项），时区为宿主的系统时区。L3。
5. 主 Agent 移到另一个会话（`/wish here`）之后 60 秒内，这三条只绑在新会话上，旧会话上没有循环板的任务。L3。
6. 改回：有人在 DSH 自带的任务页里改了一条循环板任务的标题、文字或时间，60 秒内循环板按自己的定义改回：`schedule.update` 的 `expected` 取自 `schedule.list({sessionId})` 里那一条，返回 `updated: true`；DSH 判为没变化时不记改回；返回 `schedule_conflict`、`invalid_rule` 或别的码时删掉重建。删掉的 60 秒内重建。各记一笔 `loop-drift`，页面写一行说明。假宿主照 schedule:74–77、1806–1837 的样子做整键核对（多一个键就 `invalid_rule`）。主 Agent 调 `schedule_delete`、`schedule_update` 改循环板的任务，或调 `schedule_create` 建以 `Loop board: ` 开头的提醒，被拒，拒绝文字写明「循环板的事去找循环板」。L2（假宿主）与 L3。
7. M7 在跑循环板的那个宿主进程里交一条 `hourness.handback` 之后 10 秒内，主 Agent 收到一条消息，里面有任务 id 与「Dispatch its review」；指标流水里有这次运行的 `loop-fired` 与结局为 `delivered` 的 `loop-done`。L3；L2 用注入的时钟钉住去抖 5 秒加合并 2 秒。
8. harness 动作：一条 `hourness.design-released` 让循环板恰好调一次 M7 交来的 `run('execute.start-drive', 事件)`；返回 `done` 时主 Agent 收到条目里固定的那段话；返回 `skipped` 时记 `skipped` 与原因、不发消息；返回 `failed` 并带 `tell` 时把 `tell` 交给主 Agent；`run` 抛错或被拒时记 `failed`，循环行的行健康写明。同一个去重键第二次交来时不跑，运行记录里有一条 `loop-duplicate`（事件、键、第一次见到的时刻），行健康的重复计数加一。L2。
9. 同一项在去抖时间里来 10 个事件，只跑一次，消息里列出 10 个；人的条目一小时里第 7 次触发不在这一小时里跑，记 `suppressed`（原因 `rate`），这几个事件合进下一个整点之后的第一次运行；页面写出。L2。
10. 自己触发自己：人的一项「`loops.file-changed` 看 X 时跑一条会改 X 的命令」，命令跑完后 X 的变化不再触发它，记 `suppressed`（原因 `self-loop`）；主 Agent 被这一项告诉之后自己去改 X，照常触发。L2。
11. 人加一项「每 5 分钟跑一段脚本，没过时告诉主 Agent」（脚本 `docs/loops/scripts/u-<id>.mjs`，内容 `process.exit(1)`；`report: 'on-failure'`）：每次运行主 Agent 收到一条带退出码 1 与输出末行的消息（结局 `reported`）；经一次 `edit` 提议、人同意把脚本改成 `process.exit(0)` 之后，第一次运行给主 Agent 一条「又过了」（`reported`），之后不再发，记录照写（结局 `ran`，退出码 0）。L2（假宿主、真实的子进程）与 L3。
12. 脚本输出里有密钥形状的字串时，给主 Agent 的消息里它被遮住（`[redacted]`）；指标流水里没有任何输出正文。L2。
13. 人设了一条规则板规则拦下某个脚本时，循环板不跑它，记 `blocked` 与规则 id；判为排队时记 `deferred`，规则解除后 5 分钟内跑。`checkCall` 收到的 `args.command` 是 `commandText(<条目的 script>)`，即解释器与仓库里的脚本路径（例 `pwsh -NoProfile -NonInteractive -File docs/loops/scripts/u-1a2b3c4d.ps1`，§6.6）；条目没写 `glmSpend` 时不带这个选项；不带 `session`、`role`、`model`。自报 `glmSpend: 'optional'` 的脚本在少做档的高峰里被规则板判为排队（rules:§3.6 的附属条目），高峰后 5 分钟内跑。L2（真实的 `checkCall` 与临时目录）。
14. 主 Agent 不受高峰影响（`d-main-agent-peak-exempt`）：档位为不做、此刻是高峰时，一条 `hourness.handback` 的消息照常在 10 秒内投给主 Agent（结局 `delivered`，不是 `held`）；DSH 投来的晨报，主 Agent 领到它的那一步只多 `Loop run <run> for <entry>.` 一行，不被改写成「推迟」。`src/loops/` 里不出现 `heldForPeak`；`src/loops/` 不导入 `src/rules/` 里 `service.ts`、`check.ts` 以外的文件，也不读规则板的任何文件（L2 静态检查）。L2（假的规则服务与注入的时钟）。
15. 高峰结束（§6.9 第 4 条的表；L2，注入的时钟、假的规则服务、假的 `sessionController` 与一份假的执行行交来的 `Contribution`，它的 `actions` 含 `execute.resume-drive`）：
    - 接上停住的自动推进：少做、不做两档各一例，主 Agent 的 goal 由 M7 以它的高峰等待原因码停住；高峰结束后 1 分钟内，循环板恰好调一次 `run('execute.resume-drive', <这次 channel.peak-changed 的事件>)`，返回 `done` 之后主 Agent 恰好收到一条消息，第一行之后是 `GLM peak hours ended at <end>. The harness resumed the drive that waited out the peak; continue with the work you moved.`（goal 恢复为 active，经 `inject`；主 Agent 在跑时经 `steer`）。档位读不出（`stateForProject` 为 `undefined`）时同样调。持有者会话在高峰结束时是冷的（假 `agents.get` 没有它），`main-step.json` 记着它在这段高峰里走过步（宿主在高峰里重启过）：循环板先恰好调一次 `resolveAgent`；调 `run` 之前不读 goal。两种假 M7 各一例（评审 F40）：(a) 假 M7 在 `agent/created` 时不动，`run` 返回 `done`；(b) 假 M7 在 `agent/created` 时照 m7:§3.9.1 的 `hourness-peak-wait` 一行自己接上推进（goal 已为 active），`run` 返回 `skipped`，循环板随后读到 goal 为 active，这次运行记 `done`（原因「打开会话时 M7 接上了推进」），不往下判。两例都是：goal 在高峰结束后 1 分钟内为 active，主 Agent 恰好收到一条消息，`run` 至多一次。冷会话、`main-step.json` 说这段高峰里一步也没走：`resolveAgent` 与 `run` 一次都不调，记 `skipped`。冷会话、档位读得出且为无影响：`resolveAgent` 与 `run` 一次都不调，记 `skipped`（评审 F40 给的省恢复的一条）。热会话、人在高峰中途把少做改成无影响、有一个 M7 在改档之前以高峰等待码停住的 goal（评审 F48）：`run` 照样恰好调一次，`done`，goal 恢复为 active，主 Agent 恰好收到一条消息（0.5 对无影响档的热会话也跳过，这个 goal 要等 M7 5 分钟后复查才动）。
    - 动作说 `skipped`、或执行行没交这个动作（`actions` 里没有它；此时一次都不调）：往下判。档位（`stateForProject(<项目根>)`）为少做或不做（两档各一例，`d-main-agent-peak-exempt`）、主 Agent 闲着、它在这段高峰里走过至少一步（按 `main-step.json`；它在别的 DSH 进程里走步、或宿主在高峰里重启过，也判为走过）、没有 goal 或 goal 为 active 时，恰好一条 `GLM peak hours ended at <end>. Work you moved to after peak can start now.`（没有 goal 时经 `followup`，goal 为 active 时经 `inject`）；冷会话先经 `resolveAgent` 取到 agent 再读 goal。
    - 不发、记 `skipped` 与原因：档位为无影响；读不出档位；主 Agent 在跑；这段高峰里它一步也没走；goal 为 `paused`；goal 为 `blocked`，原因码为 `hourness-waiting-human`、`hourness-idle-rounds` 或别的（以 `hourness-idle-rounds` 阻塞的 goal 不被恢复：`execute.resume-drive` 说 `skipped`，循环板不再调任何恢复）。0.4 的「档位为不做（规则板恢复它自己停下的活）」一例删去：不做档里主 Agent 照常干活，被排着的只有子 agent 与重活，那些由规则板在高峰后放出（rules:§6.3），闲着的主 Agent 照上一条叫醒。
    - `execute.resume-drive` 返回 `failed`、抛错或 60 秒没有结果：这次运行记 `failed`，主 Agent 恰好收到一条（动作带 `tell` 时是它，否则是 `… could not resume the drive that waited out the peak (<reason>). Tell the human in one line …`），循环行的行健康 degraded 一次。
    - 持有者状态为 `elsewhere`：这次运行记 `held`（原因 `writer-held`），不调 `run`；运行锁交给另一个进程之后，由那个进程从表的第一行判一次，两个进程合起来 `execute.resume-drive` 至多调一次。
    - 同一段高峰只跑一次（同一个 `peak-changed:end:<boundary>` 键）。
16. 停机与重启：宿主起来后 `loops.host-restarted` 恰好触发一次，宿主被强杀时 `crashed` 为真、正常退出时为假；循环板自己的钟管的脚本项在停机期间到了点，起来后补跑一次，记录标 `late`，漏了几个点都只补一次；停机期间各行交进收件箱的事件起来后照常处理。7 天里宿主重启两次（两个进程各让持有者会话第一次走步），M7 交的两条 `hourness.host-started` 键不同，`execute.restart` 恰好跑两次，没有 `loop-duplicate`；同一个进程里同一条 `hourness.host-started` 交两次，第二次记 `loop-duplicate`。同样的两例各给 `hourness.tasks-closed`（任务重开再关）与 `hourness.stopped`（人说再修一轮之后又停下）各一组。L2、L3 与 L4。
17. 在对话里加：主 Agent 调 `loop_propose`（动作为 `script` 时带脚本原文），循环板记一条 `open` 的提议、不写图；主 Agent 调 `propose_to_human`（`attach: 'loops:<提议 id>'`），图上多一张提议式待决，正文最后一行是「循环板提议 `lp-<id>`」；人同意后 `record_human_answer` 返回 `decided`，这一项生效，`source` 记人的原话与待决 id，结果里多一行 `Loop board: proposal lp-<id> took effect (<entry id>).`；补充、否掉时什么都不写；原话核对不过时什么都不写。拍板写在图上而循环行当时不在时，循环行起来后 60 秒内按图补写。循环板从不写带选项的待决。动作为 `script` 的提议：`propose_to_human` 返回的 `text` 与图上待决的正文里，逐字有脚本原文（围栏代码块）与 `cautions` 的每一句；主 Agent 的回话里没有原样带出这一段（例如只写了四行）就去回 `record_human_answer` 时，返回 `not_shown`，待决没拍、条目没写、提议仍是 `open`；回话里带了、人再同意，才生效。生效时 `docs/loops/entries/u-<id>.json` 与 `docs/loops/scripts/u-<id>.<后缀>` 写进项目主检出的工作区，脚本的字节与提议时存下的原文逐字相同，SHA-256 等于条目里的 `script.sha256`；`record_human_answer` 的结果那一行带这两个路径，提醒主 Agent 提交（§7.1 的表）。`via: 'board'` 的 `script` 提议，人第一次打 `/loops accept <id>` 只得到脚本原文与注意事项和「看过了就再打一次」，不写条目（变更记录只多一条 `op: 'show'`）；30 分钟内第二次打才生效。提议之后、同意之前项目里别的文件变了：`attachable` 两次返回的 `detail` 与 `attachDigest` 都与提议时 `.llm/loops/journal.jsonl` 里存的那份相同（评审 F37 的做法照旧）。L2（临时目录里的真实图引擎与 M3 的 `record.ts`）。
18. 人的命令：人在输入框打 `/loops delete 服务器巡查`、`/loops restore <id>`、`/loops ack`，写入的身份是人，结果一行中文；对插件带来的 id 打 `/loops delete` 返回「插件带来的条目只能看」，什么都不写；`/loops-apply` 不存在。L2。
19. §6.10 的每一种结局在 L2 里各有一个用例：每次运行恰好一条 `loop-fired`，最终恰好一条带最终结局的 `loop-done`；`deferred` 与 `held` 是中间状态，各写一条 `loop-done`，之后放行、投出或作废时再写一条最终的。L2。
20. 一个条目文件（`docs/loops/entries/u-<id>.json`）被清零或截断时，这一项不跑，页面写「「<名字>」的条目文件读不出：在输入框打 /loops restore <id>，按变更记录写回」，其余的照常；打了之后文件按 `.llm/loops/journal.jsonl` 里这一项最后一次的全文写回，这一项照常跑。`.llm/loops/` 整个被删掉（或在一台新电脑上刚克隆）时，仓库里的条目照常跑：每一项按它 `source.question` 指向的、图上已由人拍板的待决认回（§9.3），页面写「循环板的运行记录是新建的」。L2。
21. 页面上全部固定字串、插件交来的 `title` 与 `why` 经 `plainWordsIn`（M3 附录的 `src/graph/plain-question.ts`）检查为空；插件交来的不为空时照样显示，行健康写一次。L2。
22. `/hourness-status` 有循环行一行；宿主没有 `schedule` 服务时这一行为部分生效，原因写「没有 DSH 定时服务：到点告诉主 Agent 的条目不跑，事件条目照常」。L2。
23. 账号一级的事只说一次（M6-L4）：两个项目各有主 Agent，GLM 的登录状态从 `ok` 变成 `rejected`，恰好一条消息投给最近一次走过步的那个主 Agent；回到 `ok` 再变成 `rejected` 时再投一条；额度快用完同一个窗口同一期只投一条。`LoginView` 没有 `since` 时（F38），键、载荷的 `since` 与 `told.json` 里记的是第一次看到 `rejected` 的那一拍的时刻（同一个 ISO 串），消息照常投出，`emit` 不报 `invalid`；机器一级的 `state.json` 被清掉之后同一次被拒最多再说一次。L2。
24. 读额度的时机（M6-L2）：用量流水里出现一条 GLM 记录、上一次读数已满 15 分钟时，恰好调一次 `quota({waitMs: 3000})`；15 分钟内的第二条记录不读；用量流水里没有 GLM 记录时一次都不读；登录状态的查看只用 `quota({waitMs: 0, read: false})`，不发请求。L2（假的计价服务）。
25. §2.4 的去向表里每一行，在 L4 走查时都能在它写的那块板上找到。L4。
26. 主 Agent 的会话归档了（F20）：假宿主的 `workspaceRegistry.archivedSessionIds` 含持有者会话时，对账不在它上面建任务、删掉已有的循环板任务；一条 `hourness.handback` 记 `held`（原因 `holder-archived`），不调 `resolveAgent`、不记 `delivered`；`view.json` 的页头与 `homeLine` 是「主 Agent 的会话已归档：在一个会话里打 /wish here」；运行记录有一条 `loop-holder`（`state: 'archived'`）。人 `/wish here` 到另一个会话之后 60 秒内，三条时间任务建在新会话上，存着的那条投到新会话；人取消归档时同样恢复。对账删掉的每一条任务，在 `schedule.delete` 之前 `removed-tasks.jsonl` 里有一行，带它在 `schedule.catalog()` 里的全文（含 `lastDelivery`）与原因 `holder-archived`。`archivedSessionIds` 抛错（服务没启动）时行健康 degraded「读不到归档状态：主 Agent 的会话被归档时循环板不知道」，照旧投递。`resolveAgent` 返回 `session/not-found` 时持有者记为找不到，处理同归档。L2（假的 registry）。
    不删的几种（F35；L2，假的 registry、假的 `schedule` 服务与两个假宿主进程）：三条时间任务已绑在持有者会话上；(a) `archivedSessionIds` 抛错，(b) 持有者记录读不出（`readHolder` 返回 `unreadable`），(c) 另一个进程写着新鲜的 `handover.json`，(d) 上一次 `resolveAgent` 返回 `session/writer-held` 不到 5 分钟：各跑 10 拍对账，三条任务的 id 不变、`schedule.delete` 与 `schedule.create` 一次都没被调，`removed-tasks.jsonl` 没有新行；(b)(c)(d) 期间 DSH 判为没投出的那一次不删不建，(a) 期间由循环板自己补投一次、任务留着；(a)(b) 时行健康 degraded，页面这三项下面写「循环板此刻看不清主 Agent 的会话（<原因>），这几项的提醒先不删」；(b) 期间交来的一条 `hourness.handback` 记 `held`（原因 `holder-unreadable`），记录读得出之后投出。(a) 期间有人在 DSH 任务页里改了一条的时间：`update` 改回成功；`update` 返回 `schedule_conflict` 时按新的 `list` 再试一次，仍不成就留着、页面写一行、下一拍再试，不删掉重建。
    交条目的一方晚到或暂时撤回（评审 F41；L2，真实的登记表与假的 `schedule` 服务）：三条时间任务已绑在持有者会话上；(e) 循环行开始跑项目、在 M7 的运维行交条目之前对账；(f) 运维行 `dispose` 之后 30 秒又交同一份：三条任务的 id 不变，`schedule.delete` 与 `schedule.create` 一次都没被调。(g) 运维行交来的新一份（`op: 'replace'`）里没有 `operate.patrol`：那一条当拍按 `entry-gone` 删掉，`removed-tasks.jsonl` 有一行。(h) 运维行撤回之后一直不再交：开始跑项目满 5 分钟、且连着两次相隔至少 60 秒的对账都看不到这三项，才按 `entry-gone` 删。
    L3：带 `stopActivity` 归档持有者会话，60 秒内 `schedule.catalog()` 里没有绑在它上面的循环板任务，之后交的一条 `hourness.handback` 是 `held`，不是 `delivered`。
27. 去重键（F22）：`emit` 的 `key` 少于三段（以 `:` 分隔、每段非空）时返回 `invalid`（「key must name one occurrence」）；第一段不是事件名去掉名字空间（`hourness.tasks-closed` 的是 `tasks-closed`）时同样 `invalid`。同一个键 24 小时内第 4 次来时行健康 degraded「同一个去重键反复出现：<事件> <键>」。循环行自己推出的三种与通道的三种事件，按 §4 的键写法各有一例：两次不同的发生键不同，同一次重放键相同。没人听时不写（评审 F54）：本进程跑着这个项目、执行表已读全、没有条目听 `env.files-edited` 时，`emit('env.files-edited', …)` 返回 `{ok: true, unheard: true}`，`events.jsonl` 没有新行、`keys` 没有新键，`listens('env.files-edited', cwd)` 为假；加一项听它的条目之后，`emit` 照常写、`listens` 为真。键按名字空间分开记（评审 F54）：灌满 2001 个不同的 `env.files-edited` 键之后，`hourness.handback` 的键仍在、它的重放仍被去重（不因 `env.*` 多而被挤掉）。L2。
28. 运行锁的交接（F33）：两个假宿主进程，A 持锁，持有者会话在 B 里打开：B 写 `handover.json`；A 在下一拍、手上没有正在跑的运行时写下 `state.json`、删锁；B 在它的下一拍拿到锁。交接之前投给主 Agent 的消息在 A 里遇到 `session/writer-held` 时记 `held`（原因 `writer-held`），不记 `failed`，交接之后由 B 投出。另一例（F36）：B 打开着持有者会话却一直不写 `handover.json`（B 的循环行没启用）：A 对这个会话的 `resolveAgent` 每 5 分钟至多一次，存着的消息留在 `held`；`elsewhere` 连着超过 5 分钟时 `view.json` 的页头与 `homeLine` 是「主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去」、行健康 degraded；B 关掉会话之后 A 的下一次重试投出，状态回到 `ok`。L2。
29. 交事件的一方遇到 `busy`、`io`（F26）：`emit` 在 10 秒内于内存里重试三次（间隔 1、3、6 秒），第三次仍失败才报行健康 degraded；第二次成功时不报。L2（注入的锁与时钟）。
30. 脚本钉住（`d-boards-as-hooks`，§6.6）：一项脚本条目生效之后，(a) 有人在编辑器里改了 `docs/loops/scripts/u-<id>.ps1` 的一个字：下一次触发不跑，结局 `refused`（原因 `script-changed`），页面「要你看一眼的」一行「「<名字>」的脚本改过了，和你同意的那一版不一样，这一项先不跑；要接着用，跟主 Agent 说「把<名字>的脚本给我看一下」」，行健康 degraded 一次；(b) 文件改回同样的字节：下一次照常跑，不要新的同意；(c) 主 Agent 提 `repin` 提议、人看过新的原文同意之后：照新的跑，条目的 `script.sha256` 换成新的；(d) 核对之后、起进程之前文件又被改了（注入的写入）：跑的是核对过的那一份字节（私有副本），不是改过的。页面上每个脚本条目写「超时 60 秒：超时算没跑完，告诉主 Agent，这次的事件下次再跑；崩溃算没过」与「脚本：你 <日期> 同意的那一版」。L2。
31. 脚本执行器（`runScript`，§6.6；L2 用真实的子进程，L3 在桌面宿主里）：脚本的标准输入恰好是一个 JSON 对象（`version`、`board`、`entry`、`run`、`event`、`id`、`at`、`project`、`key`、`payload`，事件条目另有 `merged`，时间条目 `event` 为 `time` 并带 `occurrenceAt`），之后关闭；工作目录是项目根；环境只有 §6.6 的名单与五个 `HOURNESS_*`，宿主里设的 `GLM_HOURNESS_CREDENTIAL_SECRET` 与名单外的变量都不在。循环板的一项 `timeoutSeconds: 5` 的脚本睡 120 秒：7 秒内连同它起的子进程一起被结束，结局 `unfinished`，`report: 'on-failure'` 也照样交给主 Agent（「没跑完：超过 5 秒」），这次合进来的事件进这一项的待跑，下一次触发时一起再跑（`d-script-timeout`）；解释器找不到：原因 `spawn`；输出 2 MiB：内存里留 1 MiB，给主 Agent 的至多 40 行、4000 个字符。拦路的一路（`purpose: 'gate'`，不带 `timeoutMs`）：睡 30 秒后以 2 退出的脚本在 10 秒时返回带 `late` 的 `timeout`，进程还在；`late` 在约 30 秒时给出 `exited`（退出码 2）；睡 20 分钟的脚本在 10 分钟时被结束，`late` 给出 `capped`；后台已有 8 个时，第 9 个在 10 秒时就被结束、没有 `late`。一段干活的脚本正在跑时，同一个项目的 4 个拦路脚本同时起来，不排在它后面。迟到的结论怎样记、怎样告诉主 Agent 由规则板的验收钉住（rules:§1.4 第 24 条）。
32. 存放（`d-rules-in-repo`，§9）：在一个临时 git 仓库里同意一项脚本条目并跑一次之后，`docs/loops/entries/` 与 `docs/loops/scripts/` 各多一个文件；`.llm/loops/` 里有一个内容为 `*` 的 `.gitignore` 与运行时的文件；`git status --porcelain` 只列出 `docs/loops/` 下的那两个文件；用户级目录的 `loops/` 下只有 `machine/`，没有 `projects/`。规则 `loops:files-only`：agent 用文件工具写 `docs/loops/entries/x.json`、`.llm/loops/state.json`，或 shell 命令 `Set-Content docs/loops/scripts/x.ps1`，在主检出与它的工作树（`.worktrees/hz-x/docs/loops/…`）里都被拒，拒绝写进违规流水；读不拦。L2。
33. 在循环板之外改过的条目（§9.3；(d)–(f) 为 0.6，评审 F44，都在临时 git 仓库里真走 git 命令）：(a) 生效之后，外面把条目文件的 `when.seconds` 从 1800 改成 60：这一项不跑，结局 `refused`（原因 `entry-changed`），页面写「「<名字>」的条目文件在循环板之外被改过，先不跑」，变更记录多一条 `op: 'external'`；(b) 合进主干的一个提交带来 `docs/loops/entries/u-<新>.json`，它的 `source.question` 在图上不存在：不跑，页面写「这一项在这台电脑上没有你同意的记录」；(c) 同样带来的一项，`source.question` 是图上一张已由人拍板、正文末行是 `loopProposalLine(source.proposal)` 的提议式待决，且条目文件里的脚本块与 `scripts/<id>` 的字节相符：认回、照常跑，变更记录写 `op: 'adopt'`，`repo-written.json` 多这一项；内容与待决里的不符（脚本被一起改过）时不认回，结局 `refused`（`unadopted`，评审 F51）。(d) 生效之后 `git switch` 到一个在加这一项之前就建好的分支（没有这个条目文件）：文件不被写回那个分支的工作区，这一项不跑（`not-in-checkout`），页面写那一行，`git switch` 回来之后照常跑、不要新的同意；`git stash -u` 收起未提交的添加同样。(e) 生效、提交之后，外面 `git revert` 那次提交（条目文件回到较早的一版）：`repo-written.json` 的 `fileSha256` 等于变更记录最后一条，所以当成「在它之外变了」，文件保持 revert 后的样子、不被写回，这一项 `refused`（`entry-changed`）。(f) 一次人同意的写入正赶上 `.git/MERGE_HEAD` 在：变更记录追加、这一项生效，`docs/loops/` 里的文件先不写、页面写「条目文件待写回（git 正在合并或变基）」；`MERGE_HEAD` 不在之后的那一拍写成，`repo-written.json` 更新。L2（临时目录里的真实图引擎与真实 git）。
34. 4 周没结果（§6.11）：一项 30 天前加的人的条目，最近 28 天的运行全是 `skipped`、`suppressed`、`failed` 或 `refused`：`staleEntries` 列出它；一项 10 天前有过一次 `ran`：不列；插件的条目一律不列；20 天前才加的不列；至多 3 项，上一次有结果最早的在前；已在一条 `open` 的删除提议里的不列。`loop_propose {kind: 'delete', entries: [三个 id]}` 是一条提议，人同意之后三项在同一次写入里删掉，各自 7 天内能恢复。L2。
35. 两块板共用（接缝裁定，§2.2、§4.6）：`loop_propose` 的 `when.events` 含 `gate.tool-call` 时返回 `invalid`，提示「拦路的时刻归规则板：用 rules_propose」；`glm-hourness/rules` 以外的来源在 `contribute` 里声明 `gate.` 开头的事件时整份被拒。契约测试：规则板的条目类型可以赋给 `HookShape`；规则板导入 `src/loops/trigger.ts` 的 `validateWhen`、`matchesFilter` 与 `src/loops/script.ts` 的 `runScript`，`src/rules/` 里不出现 `node:child_process`（L2 静态检查）。
36. `loop_propose` 说明里的两个例子（§7.3）：从工具说明的源字串里取出两段 JSON 与脚本原文，原样交给 `loop_propose` 的校验，都合格、不返回 `invalid`；例子 2 交给真实的 `runScript`（临时 git 仓库，`docs/setup.md` 里有一个指向不存在文件的链接，信封照说明里的那一份）退出 1，输出里有那条坏链接；说明全文不含「记账」「账本」「bookkeeping」「ledger」（练习题的领域）。L2。
37. 人加的检查（F22，§2.3、§6.6、§7.1）：临时 git 仓库与图里有一个环境工具节点，M4 的读法给出它的命令 `["node", "node_modules/typescript/bin/tsc", "--noEmit"]`。(a) `loop_propose` 一项 `when` 为 `env.files-edited`、`filter` 为 `{files: {paths: ["*.ts"]}}`、动作为 `{kind: 'check', tool: <节点 id>, report: 'on-failure', to: 'event-session'}` 的 `add`：结果带 `detail`，`mustShow` 里有 `commandText` 写出的那一行命令与每句注意事项；主 Agent 的回话里没有那一行时 `record_human_answer` 返回 `not_shown`，什么都不写；带「已给人看原文 <摘要>」的拍板之后条目生效，条目文件里的 `argv` 等于人看到的那一条。(b) 一个工作树里的子 agent 改了 `src/a.ts`：检查在那个工作树里跑（不经 shell，环境同脚本），退出非 0 时结果交给那个子 agent。(c) 工具节点上的命令改了：下一次触发不跑，结局 `refused`（`check-changed`），页面写「「<名字>」的检查命令在项目图上改过了，先不跑」；`repin` 经人同意之后照新的跑。(d) 插件在 `contribute` 里交一项动作为 `check` 的条目：那一项丢掉。(e) 键不撞回合（评审 F45）：一个会话在第 3 回合第 1 步与第 4 回合第 1 步各改一次 `.ts` 文件，`env.files-edited` 的键是 `files-edited:<会话>:3-1` 与 `files-edited:<会话>:4-1`，两个键、跑两次，没有 `loop-duplicate`。(f) 两个工作树分组（评审 F46）：两个工作树里的子 agent 5 秒内各改一次 `.ts`（`root` 不同），跑两次，各在自己的 `root` 作 `cwd`、`{files}` 是自己那一个文件、结果交给自己的会话；其中一个工作树一小时里第 7 次改动，它那一组还不到 `maxPerHour` 时照跑（限次按组）。L2。

### 1.5 不做

- 默认条目的修改、开关、删除（`d-defaults-readonly`；以后放开时要改的地方见 §7.4）。
- 页面上的任何写入（新建、改、删、恢复、确认）；`/loops-apply` 随面板的写入删去。
- 人用命令新建条目（命令行里写不下一条完整的条目，新建只在对话里）。
- agent 直接写条目（agent 只能提议，§7.3）。
- 循环板代码里写别的行的条目或事件（各行经 `contribute` 交，§3）。
- 脚本类与 harness 动作类的条目用 cron（§6.2）。
- 在没有会话控制器的进程（headless 运行、探针与标定）里跑条目；那里没有循环板的服务，M7 按它自己的退路执行事件条目（m7:§2.5）。
- 每次运行新开一个会话（`d-one-main-agent`）。
- 后台定时读 GLM 额度（只在 GLM 有新用量之后读，M6-L2）。
- 跨项目的人的条目（`question-32` C：条目按项目，`d-rules-in-repo`：放在项目里）；账号一级的只有 GLM 交来的两项。
- DSH 之外的通知（邮件、系统通知）。
- 把规则板的检测器搬到循环板（检测器只写信号，仍归规则板；两块板共用一套时间写法，§2.2）。
- 自己从 git 推出主干前进（0.1 的每 30 秒查一次删去：主干前进由 M7 按核对与执行后比对的记录交事件，§4.2）。
- 钉住脚本自己去读、去调的别的文件（例如脚本里 `& ./scripts/check-server.ps1`）：钉住的是条目的那一个脚本文件（§6.6）；它调的项目文件的改动经 M7 的合入检查与审查进主干，那里管；循环板在注意事项里告诉人「它读写、调用的别的文件不在这次同意里」（§7.1）。0.4 这一条说的是「不钉住命令所跑的脚本」，随 `d-boards-as-hooks` 改为钉住条目自己的脚本。
- 用 DSH 插件承载人的脚本：插件跑在 DSH 进程里，什么都能动，拿得到凭证（`d-boards-as-hooks` 不采用的做法）。
- 人同意的脚本先试运行（影子）再生效：人同意即生效（`d-boards-as-hooks`：「同意了直接运行就行」）；代替影子期的是板上写明的超时与崩溃时怎样、内容哈希、报告里的运行次数与随时能删（§6.6、§6.11；`docs/CHARTER.md` §6 由规则板 0.9 同批改写）。
- 循环板的条目用拦路的事件（`gate.*`）：拦路是规则板的事（§4.6）。
- 高峰里攒着给主 Agent 的消息（`d-main-agent-peak-exempt`：主 Agent 随时回话）。

### 1.6 方向清单自查（`d-design-onepage`）

| 人定的方向 | 本设计怎样遵守 |
| --- | --- |
| 代码只提供机制，插件的每个行为都是写明插件的默认条目（2026-10-30 的讨论，`schedules` 批注） | 循环板的代码只有格式、校验、投递、执行与记录；M7、M4、GLM 包与循环行自己的条目都是数据，经 `contribute` 或计价服务的 `loopDefaults` 交来，页面写「<插件名>带来的」（§3、§5） |
| 默认条目只能看，档位能选（`d-defaults-readonly`） | 插件的条目不进存储；存储只收 `u-` 开头的 id；页面没有控件；档位仍在规则板，循环板只读它（§6.9） |
| 项目所有规则在明面上（`d-rules-visible`） | §2.4 的去向表；M4 检查器自己的规矩写在它那一项下面（§5.3） |
| 一个项目一个主 Agent，报告与巡检由 harness 提醒它做（`d-one-main-agent`） | 晨报、周报、巡检是条目，动作都是提醒主 Agent；不开运维会话（§5.1）；主 Agent 的会话归档了或找不到时不往里投、不另开会话，告诉人用 `/wish here` 指定新的（§6.4）；读不清主 Agent 的会话时到点的三项原样留着，晨报、周报与巡检不会因此停掉（§6.2） |
| 高峰结束叫醒主 Agent 的条目归编排层，GLM 包只给高峰变化事件与时刻计算（编排方 2026-10-30 修订后的接缝裁定） | 第 14 项 `loops.peak-end` 是循环行自己的条目，来源「项目编排带来的」；它听的 `channel.peak-changed` 由循环行照 GLM 计价服务的 `peak` 与 `nextPeakChange` 推出，「谁报」写 GLM 通道（§3.4、§4.3、§5.2） |
| 高峰里等高峰结束：只剩被高峰模式挡着的活时不计空转、不问人，M7 以自己的原因码停住并交 `resume-drive`，高峰结束时编排层的那一项跑它并提醒主 Agent，规则板只交档位与挡着的是不是高峰（编排方 2026-10-30 的接缝裁定，`design-context.md` 末条） | 第 14 项的判断表在持有者状态之后第一件事就是恰好调一次 `execute.resume-drive`（经 M7 那一份的 `run`，即 `glmHournessExecute.runAction`），不看档位，会话是冷的时先恢复它，`done` 就告诉主 Agent 接着做；少做与不做两档都这样；以 `hourness-idle-rounds` 阻塞的 goal 不碰；`execute.resume-after-peak` 撤回；循环板不读 `peakHoldFor`（§6.9 第 4 条、§17 M7 第 6 条） |
| 问人改成聊天（`d-chat-not-cards`） | 加条目走 `loop_propose` 加 M3 的 `propose_to_human`、`record_human_answer`；循环板不写带选项的待决；默认条目的提醒都叫主 Agent 用 `propose_to_human`（§7.1、§5） |
| 面板只看不操作（`d-ui-look-not-operate`） | 页面没有写入控件；人能改的地方写一句「要改：跟主 Agent 说……，或在输入框打 /loops ……」（§8） |
| 高峰模式三档，默认少做（`d-peak-mode`） | 档位与执行归规则板；循环板只经 `glmHournessPeakMode` 的 `stateFor`、`stateForProject` 读，不另判；少做档的上限数照规则板给的显示（§5.2 第 13 项）；不做档「高峰后自己接着做」：规则板排着的子 agent 与脚本由规则板放出，M7 因高峰停住的自动推进由第 14 项经 `execute.resume-drive` 接上；两档都在主 Agent 闲着、高峰里干过活时叫醒它一次（§6.9） |
| 两块板都借鉴 hook：每条是什么时候 + 可选的筛选 + 动作，动作可以是主 Agent 派子 agent 写的脚本，人看过原文同意后直接生效（`d-boards-as-hooks`） | 条目形状、事件表、筛选与脚本执行器是一份，规则板导入同一个模块（§2.2、§2.3、§4.6、§6.6）；人加的条目的动作是自带的「告诉主 Agent」、跑项目里的一项检查（命令取自环境工具节点，编排方的裁定「Check entries seam」）或脚本；脚本原文与检查的命令行由 harness 附在四行之后，同意即生效，不试运行；按内容哈希钉住，改过就不跑、板上写明；每一项写明超时与崩溃时怎样；单独的进程、项目目录、拿不到凭证；不用 DSH 插件（§1.5、§6.6、§7.1） |
| 规则与人加的条目进仓库，运行时的东西进项目的 `.llm/`，全局只留登录、设备号、人设、账号的额度与用量、profile 里的插件配置（`d-rules-in-repo` 与存放范围） | 人加的条目与脚本在 `docs/loops/`，由循环板自己写，`loops:files-only` 挡住别的写入；收件箱、状态、变更记录、运行记录、结论、日志与 `view.json` 在 `.llm/loops/`；用户级目录只留账号一级的额度与登录提醒要的 `loops/machine/`（§9）。关于人本人的记忆留全局、项目经验进项目（`d-memory-scope`），循环板不涉及 |
| 拦路脚本超时先照条目放行、后台接着跑到 10 分钟、晚到的「不行」马上告诉主 Agent；主干前进之前的超时缺省挡住；不拦路的超时记「没跑完」交主 Agent、事件下次再跑；超时计进周报（`d-script-timeout`） | 共用的执行器给拦路的一路带 `late` 的 `timeout` 与 10 分钟硬上限，事件声明的 `gateOnErrorDefault` 给难以退回的一步缺省拦下；晚到的结论怎样记、怎样告诉主 Agent 归规则板（§6.6、§4.6）；循环板的脚本超时为 `unfinished`，事件进待跑；周报列出 7 天超时 3 次以上的条目提议修（§6.11） |
| 主 Agent 不受高峰影响，任何一档都随时回话（`d-main-agent-peak-exempt`） | 循环板不读 `heldForPeak`，不攒给主 Agent 的消息，不改写 DSH 提醒那一步；高峰结束那一项两档同一张表（§6.9）；高峰模式管的子 agent 与重活由规则板与 M7 管 |
| 不会只加不删：周报列出 4 周没触发的规则与 4 周没结果的人加条目，一次四行提议、至多 3 项，插件默认的不算，删走同一条同意的路（编排方定，可推翻） | `staleEntries` 交给 M7 的周报；删除走 `loop_propose {kind: 'delete', entries}` 与 `propose_to_human`（§6.11、§17 M7 第 8 条） |
| 接缝：循环板管条目形状、事件表、筛选与脚本执行器，规则板管哪些事件拦路、拦路结果怎样进 `checkCall`；一条同意的路；各自引用对方的节（编排方的接缝裁定） | 本稿写形状、表、筛选与执行器（§2.2、§2.3、§4、§6.6），拦路的含义只写「见规则板」（§4.6、§17 规则板一条）；同意走 M3 的 `propose_to_human` 带脚本原文与 `record_human_answer`（§7.1） |
| 主 Agent 要写的每种东西各配一道示范，放在写它的工具说明里，示范过同样的检查，领域与练习题无关，只讲定了的事（`d-agent-examples`） | `loop_propose` 的说明带两个例子：到点告诉主 Agent；碰到事件跑脚本，带脚本原文、标准输入的事件 JSON 与输出怎样用；L2 把例子交给真校验与真执行器（§7.3，验收第 36 条）；四行的写法不另抄，仍是 M3 的 `PLAIN_QUESTION_GUIDE` |
| 两层循环用进用户的项目（`d-design-onepage` 2026-10-30） | 不涉及循环板：模块的放行归 M3，三层与成批归 M7，显示归面板；循环板上只有 M7 的 `execute.release`，它的键按每次放行区分（§4.2） |
| 设计放行后主 Agent 自己推进（`d-auto-drive`） | M7 的 10 项全部在板上执行，含 0.1 漏掉的「审查过了之后合入」与「活都关了之后派整体审查」（§5.1）；高峰里停住的自动推进在高峰结束时由系统接上，不等人说话（§6.9 第 4 条） |
| 子 agent 的模型由主 Agent 选（`d-main-agent-models`） | 派审查、派整体审查的条目都只提醒主 Agent 去派，模型由它选（§5.1） |
| git 交给主 Agent，harness 只守主干前进那一刻（`d-main-agent-shell`） | 循环板不做 git 写操作；主干全量检查是 M7 的 harness 动作（§5.1） |
| 规则只由人定（`d-rules-human-only`） | 人的条目只由人写；agent 只提议；会跑脚本的提议，人同意的是 harness 附上的脚本原文，主 Agent 没把它给人看过时同意不算；条目或脚本在循环板之外被改过就不跑，等人再同意（§7.1、§9.3） |
| 界面说人话（`d-plain-questions`） | 页面字串与插件交来的标题过 `plainWordsIn`（验收第 21 条）；页面不说「行」，说插件名（§8.5） |
| 指标由 harness 写（`metrics`） | 每次运行的记录由循环行写，模型写的不算；重复而没跑的事件、主 Agent 的会话收不到的时段也各有记录（`loop-duplicate`、`loop-holder`，§6.10） |

## 2. 概念

### 2.1 一项是什么

| 字段 | 必填 | 含义 | 取值 |
| --- | --- | --- | --- |
| `id` | 是 | 项目内唯一 | 编排层各行交来的写 `<名字空间>.<名>`（M7 的 `execute.*`、`operate.*`，M4 的 `env.*`，循环行自己的 `loops.*`）；通道包经计价服务交来的写 `<通道>:<名>`（`glm:*`，M6 §5 的写法）；人的条目 `u-<8 位十六进制>`，写入时分配 |
| `title` | 是 | 给人看的名字 | 1–60 个码点（与 M6 的 `ChannelLoopDefault.title` 同一上限），不含换行 |
| `why` | 插件的条目必填 | 为什么有它，一句人话 | 1–150 个码点，不含换行；人的条目可以没有 |
| `when` | 是 | 什么时候 | `Trigger`（§2.2） |
| `filter` | 否 | 筛选：事件的哪几次才算 | `EventFilter`（§2.2）；只配事件触发。0.4 放在 `Trigger` 的事件一种里，0.5 提出来与 `when` 并列，两块板的条目都是「`when` + `filter?` + `action`」（`d-boards-as-hooks`） |
| `action` | 是 | 做什么 | `Action`（§2.3）；人的条目只能是 `tell-main`、`script` 或 `check`（0.6 补上 `check`，评审 F47） |
| `limits` | 否 | 去抖与限次 | `{debounceSeconds?: 0–3600, maxPerHour?: 1–60}`；缺省见 §6.7 |
| `quiet` | 否 | 安静时段 | `{from: 'HH:MM', to: 'HH:MM'}`，宿主系统时区；只用于告诉主 Agent 的事件条目：落在这段时间里的消息攒到时段结束再投 |
| `scope` | 否 | 归谁 | `project`（缺省）或 `machine`：账号一级的事，同一件事整台机器只交一次，交给最近走过一步的那个主 Agent（M6-L4）；只给通道包交来的条目 |
| `basis` | 否 | 它还依赖什么，一句人话 | 至多 80 个码点；显示在来源一行，例「依据 GLM 峰谷定价（GLM 通道包）与高峰模式（规则板）」（M6 §8.3 要的那句） |
| `ownRules` | 否 | 这一项自己写死的规矩，人话 | 至多 6 行，每行至多 80 个码点；展开后显示为「<名字>自己的规矩」（例 M4 检查器的三个数，§5.3） |
| `source` | 由循环板写 | 谁带来的 | 插件：`{kind: 'plugin', plugin: <包名>, row: <行 id>}`；人：`{kind: 'person', at, via: 'chat' \| 'board', relay, question?, proposal}` |
| `rev` | 由循环板写 | 版本 | 人的条目每写一次加一；插件的条目取交来那一份规范化 JSON 的 SHA-256 前 12 位十六进制 |
| `status` | 由循环板写 | 人的条目的状态 | `active` 或 `deleted` |

插件交来的部分（`id` 到 `ownRules`）在代码里叫 `LoopEntryDefinition`，加上后三个字段叫 `LoopEntry`。人的条目存在仓库里时（§9.1）每项一个文件，内容是 `LoopEntry` 去掉 `rev` 与 `status`（文件在就是 `active`，删掉就没有文件；`rev` 只在变更记录里）。

一项属于一个项目（`question-32` C），`scope: 'machine'` 的两项除外。项目根与规则板、指标流水同一个函数（rules:§7.3、metrics:§3.3：从会话头的 `cwd` 往上找 `.git`，主检出与它的工作树是同一个项目，取主检出的根）；M5 的 `src/data/project-root.ts` 先合入就用它，否则循环行与规则板谁先实现谁建这个模块。0.5 起项目根直接给出存放的位置（仓库的 `docs/loops/`、`.llm/loops/`，§9.1），0.4 用来在用户级目录里分项目的项目键只剩显示与 `last-step.json` 里的一个字段。

### 2.2 什么时候

```ts
// src/loops/trigger.ts：两块板共用的条目形状（编排方的接缝裁定）。纯类型、校验与下一次时刻的计算，不用 Node 内置模块；
// 客户端、M7 的 entries.ts、M4 的 env 行与规则板都导入它。0.4 的类型在 model.ts，0.5 搬到这里，model.ts 只留循环板自己的动作与条目
export type Trigger =
  | { readonly kind: 'once', readonly at: string }                         // ISO 8601，带时区偏移；严格晚于写入时刻，至多一年后
  | { readonly kind: 'every', readonly seconds: number }
  | { readonly kind: 'daily', readonly time: string, readonly timeZone?: string }                      // 'HH:MM'，IANA 时区
  | { readonly kind: 'weekly', readonly time: string, readonly weekdays: readonly number[], readonly timeZone?: string }  // ISO 星期 1–7
  | { readonly kind: 'cron', readonly expression: string, readonly timeZone?: string }                 // 五字段；只用于告诉主 Agent
  | { readonly kind: 'event', readonly events: readonly string[], readonly params?: EventParams }   // §4；筛选不在这里，在条目的 filter（0.5）
  | { readonly kind: 'command', readonly names: readonly string[] }        // 只用于动作为 self 的条目：人敲这些命令时（GLM 包的看状态读额度）

/** 键是事件声明里的字段名；每个字段只能用它声明的那一种比法（§3.2 的 LoopEventField.filter） */
export type EventFilter = Readonly<Record<string, FilterTest>>
export type FilterTest =
  | { readonly in: readonly string[] }        // string 字段：值在列表里
  | { readonly is: boolean }                  // boolean 字段
  | { readonly atLeast: number }              // number 字段
  | { readonly paths: readonly string[] }     // strings 字段（路径列表）：有一个路径匹配就算
  | { readonly matches: string }              // string 字段（声明为 in 的那些）：JavaScript 正则，不分大小写，只看前 8 KiB；0.5 加，规则板筛命令文本要它
/** 键是事件声明里的参数名（例 loops.file-changed 的 path）；参数决定这个事件怎样被发现，不是对载荷的筛选 */
export type EventParams = Readonly<Record<string, string | number | boolean>>

/** 共用的条目形状：两块板的每一条都是它（d-boards-as-hooks）。A 是各板自己的动作联合：循环板的是 §2.3 的 Action，规则板的见规则板设计 */
export interface HookShape<A> {
  readonly when: Trigger
  readonly filter?: EventFilter              // 只配 kind 为 event 的 when
  readonly action: A
}

/** 脚本动作的共用部分。脚本文件在仓库里、和那块板的文件放在一起（循环板的在 docs/loops/scripts/，§9.1） */
export type ScriptLang = 'pwsh' | 'node' | 'python' | 'bash'
export interface ScriptRef {
  readonly file: string                      // 相对项目根的路径，正斜杠，在那块板的脚本目录里
  readonly sha256: string                    // 人同意的那一份字节的 SHA-256，64 位小写十六进制
  readonly lang: ScriptLang                  // 由后缀定：.ps1 → pwsh；.mjs、.js、.cjs → node；.py → python；.sh → bash
}
export interface ScriptAction {
  readonly kind: 'script'
  readonly script: ScriptRef
  /** 秒。拦路的事件上 1–30，缺省 10；别的事件与时间触发上 5–1800，缺省 60（§6.6） */
  readonly timeoutSeconds?: number
  /**
   * 只在拦路的事件上有：超时或崩溃时放行还是拦下，板上显示。缺省取事件声明的 gateOnErrorDefault（拦在难以退回的一步之前的是 'block'），
   * 没有时 'allow'（d-script-timeout，§6.6）。放行、拦下是什么意思归规则板（§4.6）
   */
  readonly onError?: 'allow' | 'block'
}

// 事件表的声明 LoopEventField、LoopEventParam、LoopEventDeclaration 的全文在 §3.1；0.5 起定义在本文件，
// src/loops/service.ts 原名再导出，M7 的导入不用改

/** 校验 when 与 filter：事件在表里、filter 的键与比法合声明、params 合声明；gate. 开头的事件只在 allowGate 为真时收（规则板传真，循环板传假，§4.6） */
export function validateWhen(when: Trigger, filter: EventFilter | undefined, table: ReadonlyMap<string, LoopEventDeclaration>, options: { readonly allowGate: boolean, readonly origin: 'person' | 'plugin' }): readonly { readonly path: string, readonly message: string }[]
/** 这一次事件的载荷合不合 filter（filter 已经过 validateWhen；没有 filter 时为真）。纯函数，不抛错 */
export function matchesFilter(filter: EventFilter | undefined, payload: Readonly<Record<string, unknown>>, project: string): boolean
/** 下一次的时刻：夏令时缺的钟点跳过，重叠的取较早那次；事件与命令触发返回 undefined */
export function nextOccurrence(when: Trigger, after: Date, systemTimeZone: string): Date | undefined
```

- 时间的五种与 `dsh-schedule` 的选择器一一对应（`after_seconds` 不用：条目都按绝对时刻存）：`once` → `at`（带偏移的字符串），`every` → `every_seconds`，`daily` → `daily {time, time_zone}`，`weekly` → `weekly {time, time_zone, weekdays}`，`cron` → `cron {expression, time_zone}`（`dsh-schedule/README.zh.md`「使用此包」的表；选择器的键多一个少一个都拒，schedule:1052–1059、1118–1123、1366〔实读〕）。存储里写 `timeZone`，发给 `dsh-schedule` 时写 `time_zone`；`time` 存 `HH:MM`，发送时补成 `HH:MM:00`。DSH 存下的是它规范化之后的样子（`time` 为 `HH:mm:ss.SSS`，时区为 `Intl` 的规范名，schedule:1056–1057、212–222〔实读〕），循环板比较时用 DSH 返回的那一份，不自己再算一遍规范化（§6.2）。
- 时区：人的条目写入时总写明时区（取宿主的系统时区 `Intl.DateTimeFormat().resolvedOptions().timeZone`）。插件交来的时间条目可以不写，意思是「宿主此刻的系统时区」：每次对账时现取，人改了系统时区，DSH 里的任务跟着改。页面只在时区与系统时区不同时写出时区（同 DSH 任务页，`dsh-client-ui-schedule/README.zh.md`「规则」一段〔未核实，0.1 评审没有核对，照抄文档〕）。
- 下限：告诉主 Agent 的 `every` 至少 600 秒：每次投递都叫醒主 Agent、在人的对话窗口里留一回合，10 分钟一次就是每天 144 回合。DSH 自己的下限是 60 秒（schedule:21），循环板更严。跑脚本与 harness 动作的 `every` 至少 300 秒，它们不叫醒任何人，下限只防把机器跑满。
- 事件：`events` 列 1–4 个事件 id（例 M7 的「审查过了之后」同时听 `hourness.review-passed` 与 `hourness.review-skipped`）。`filter`（条目上与 `when` 并列）的键必须是每个列出的事件都声明了的字段，比法必须是那个字段声明的那一种（声明为 `in` 的 string 字段另收 `matches`）；`params` 的键必须是事件声明的参数。`paths` 的写法：以 `/` 结尾的是相对项目根的目录前缀；带 `/` 的是相对项目根的文件；不带 `/` 的名字在任何一层目录都算（`package.json` 也匹配 `packages/glm/package.json`）。0.5 另收含 `*` 的写法，按 glob 比（`*` 不跨 `/`；`**` 作为一整段（两边是 `/` 或串的首尾）时匹配零个或多个目录，所以 `docs/**/*.md` 也匹配 `docs/setup.md`，`**/x.json` 也匹配根下的 `x.json`；不是一整段的 `**`（例 `a**b`）同 `*`；`*.ts` 这样不带 `/` 的在任何一层目录都算），规则板筛写文件的目标、M4 按扩展名筛改到的文件都要它（0.6 写明零个目录的情形，评审 F55；`matchesFilter` 的 L2 用例见验收第 36 条）。`matches` 的正则在写入时编译一次，至多 300 个字符，编不成就 `invalid`；编成之后用一组固定的长输入（8 KiB 的重复字符与几种常见的回溯形状）各试跑一次，单个超过 50 毫秒也 `invalid`（「这个正则在长文本上太慢」）：规则板在每次工具调用之前都要比它（接缝核对时补，规则板要的这一条见 rules:§10.7 循环板一节第 2 点）。
- 一套写法两块板用（`d-boards-as-hooks` 与接缝裁定）：两块板的每一条都是 `HookShape`：`when` 取这里的 `Trigger`，`filter` 取这里的 `EventFilter`，动作各板自己定，脚本动作共用 `ScriptAction`。校验（`validateWhen`）、筛选（`matchesFilter`）与下一次时刻（`nextOccurrence`）只在 `src/loops/trigger.ts` 一处，规则板导入它们，不另写一份；`gate.` 开头的拦路事件只给规则板（`allowGate`，§4.6）。规则板用这套形状写哪些条目（拦路的规则、检测器）、条目上另有哪些它自己的条件（`condition`：信号、时钟、阶段，rules:§2.2、§2.3；0.8 的「主体」在规则板 0.9 里就是 `filter` 的 `role`、`model`、`session` 几个字段），由规则板设计定，本稿不重述。0.4 写给检测器的子集（`every`、`daily`、`weekly` 与 `{kind: 'event', events: ['loops.file-changed'], params: {path}}`，rules:§5.2 `DetectorTrigger`）照旧可用：`params` 仍在 `Trigger` 里，提出去的只是 `filter`。

### 2.3 做什么

```ts
// src/loops/model.ts：循环板自己的动作与条目（共用的形状在 trigger.ts）
export type Action =
  | { readonly kind: 'tell-main', readonly text: string, readonly wake: boolean }
  | { readonly kind: 'harness', readonly action: string, readonly tell?: { readonly text: string, readonly wake: boolean } }
  | LoopScriptAction
  | LoopCheckAction
  | { readonly kind: 'self', readonly does: string, readonly by: string }

/** 共用的 ScriptAction 加上循环板自己的几样。循环板的条目碰不到拦路的事件（§4.6），所以没有 onError */
export interface LoopScriptAction extends Omit<ScriptAction, 'onError'> {
  readonly report: 'always' | 'on-failure' | 'on-change'
  readonly to?: 'main' | 'event-session'     // 缺省 main；event-session 只配信封里有 session 的事件（§6.4 末段）
  readonly note?: string
  readonly glmSpend?: 'optional' | 'necessary'
}

/**
 * 人加的「跑检查」（编排方的裁定「Check entries seam」）：命令原文取自项目的环境工具节点，节点与它的格式归 M4，
 * 循环板经 M4 导出的读法取（§17 M4 第 4 条）。argv 是人同意时看到的那一条，原样存在条目里；每次跑之前与节点上此刻的比，
 * 不同就不跑（refused，check-changed），要人再同意（repin，§7.1）。由循环板的执行器跑（runCommand，§6.6）
 */
export interface LoopCheckAction {
  readonly kind: 'check'
  readonly tool: string                      // 环境工具节点的 id
  readonly check?: string                    // 节点里有几条检查时是哪一条（名字按 M4 的格式）
  readonly argv: readonly string[]           // 同意时从节点读出的那一条，含 M4 格式里的占位（例 {files}）；只由循环板写
  readonly timeoutSeconds?: number           // 5–1800，缺省 60
  readonly report: 'always' | 'on-failure' | 'on-change'
  readonly to?: 'main' | 'event-session'
  readonly note?: string
  readonly glmSpend?: 'optional' | 'necessary'
}

/** 循环板的一项：共用形状加上 §2.1 的其余字段 */
export interface LoopEntryDefinition extends HookShape<Action> { /* id、title、why?、limits?、quiet?、scope?、basis?、ownRules?（§2.1） */ }
```

| 动作 | 给人看的说法 | 谁能用 | 谁执行 | 结果给谁 |
| --- | --- | --- | --- | --- |
| `tell-main` | 告诉主 Agent：<一句话> | 插件与人 | 循环行；到点的经 `dsh-schedule` 投递（§6.2） | 主 Agent；`wake` 为假时等它下一步再看，不叫醒它 |
| `harness` | <动作的人话>，再按结果告诉主 Agent | 只有插件，动作 id 必须是交来它的那一份声明过的（§3.1） | 交来它的那一行的 `run(action, event)`；循环板调用、等结果、记录（§6.5） | 主 Agent：结果里带 `tell` 时投 `tell`，否则结果为 `done` 时投条目的 `tell` |
| `script` | 跑「<名字>」的脚本，<每次 / 没过时 / 结果变了时>告诉主 Agent | 只有人（主 Agent 派子 agent 写，人看过原文同意） | 共用的脚本执行器 `runScript`（§6.6），由循环行调用 | 主 Agent；`to: 'event-session'` 时是事件里那个会话的 agent（§6.4 末段） |
| `check` | 跑「<工具>」的检查，<每次 / 没过时 / 结果变了时>告诉主 Agent | 只有人（主 Agent 提，人看过命令原文同意；命令来自人在项目图上批的环境工具节点） | 共用执行器的 `runCommand`（§6.6），由循环行调用 | 同 `script` |
| `self` | <`does`> | 只有插件 | 交来它的那一行自己（`by` 写哪一行或哪个包，例 `glm-hourness/env`、`glm-hourness/rules`、`dsh-glm-zcode`） | 那一行自己定；循环板只列出，那一行经 `recordRun` 报它的每次运行（§3.1），报不了的（GLM 包）页面不写「上次」 |

- 给模型的文字（`tell-main.text`、`harness.tell.text`）里的 `{名字}` 由事件载荷的同名字段填；名字必须是 `when.events` 里每个事件都声明了的字段（通道事件的 `{line}` 也是声明过的字段，由循环板在推出事件时填，§4.3）；时间条目的文字不能有占位。填进去的值经 `escapeForPrompt`：字符串去掉控制字符、换行写成 `\n`、双引号与反斜杠前加反斜杠、至多 200 个码点（多的写 `…`）；字符串列表逐项这样处理后以 `, ` 连起来、至多 20 项（多的写 `and N more`）；数与布尔原样。文字里引号要不要加由写文字的一方定（M6 的 `"{line}"` 自己带引号）。目的是载荷里的标题、路径与原因不能提前结束一句、另起一行冒充指示。
- 每条消息的第一行固定为 `Loop board: <id> (default of <插件>).`，人的条目写 `(added by the human)`，模型与人在对话里都看得出它从哪来；到点类的提醒交给 DSH 时，这一行末尾另加 `Change it on the loop board, not here.`（§6.2）。各行交来的文字从第二行起。
- `script` 的 `report`：`always` 每次都把结果交给主 Agent；`on-failure` 每次没过都交，没过之后第一次过了也交一次（让主 Agent 知道好了），其余不交；`on-change` 只在这次的过与不过和上一次不同时交（第一次运行算不同）。「过」指退出 0、没有超时、跑得起来。崩溃算没过；超时是「没跑完」（结局 `unfinished`），不论 `report` 是哪一种都交给主 Agent，这次合进来的事件留到下一次再跑（`d-script-timeout`，§6.6）；循环板的条目上「超时或崩溃时怎样」就是这两句，页面写出（§8.2）；脚本与同意时的哈希对不上时不跑，结局 `refused`，不算过也不算没过，另由页面与行健康报出（§6.6）。`note` 是交结果时放在前面的一段话（至多 500 个码点），告诉主 Agent 拿结果做什么。
- `check` 的 `report`、`to`、`note`、超时与结局同 `script`（上一条与 §6.6）；另有两种不跑：工具节点上的命令与条目里的 `argv` 不同（`check-changed`），或节点、那一条检查已不在、M4 的读法不在（`check-missing`），都是 `refused`，页面与行健康照脚本改过的写法报出。这一次要检查哪些文件（M4 格式里的占位，例 `{files}`）由 M4 导出的纯函数按事件载荷填（§17 M4 第 4 条），循环板不认得 M4 的格式。
- 会跑东西的只由人同意（编排方的裁定「Check entries seam」：不论插件带来还是人加的，会跑命令、检查或脚本的条目都只走 §7.1 那一条路）：`script` 与 `check` 只能出现在人的条目里（§7），`contribute` 交来的这两种丢掉（§3.2）；插件要做的事是它自己的 harness 动作或 `self`（M4 自带的检查器就是 `self`，§5.3）。执行器按 `lang` 起解释器、把核对过的那一份字节交给它，不经 shell 拼命令（§6.6）。0.4 的 `run`（一条条 `argv` 命令，经 `commandText` 给人看）换成脚本：人看到的是整段脚本，执行的就是这段字节；只有一条命令的事写成一行脚本。0.1 的第二种命令来源（读 `norm-merge-gate` 的 `$` 行，给「合进主干之后跑完整检查」用）仍不要：那件事是 M7 的 harness 动作（§5.1），循环板不碰门禁工作树。
- 时间触发配 `harness` 或 `script` 时由循环板自己的钟跑（§6.2）；出厂的条目里没有时间触发的 harness 动作。

与 `d-boards-as-hooks` 的自带词汇的对应：决定里列的自带动作是「拦下、排队、记录、告诉主 Agent、跑检查」。前三样用在拦路的时刻，是规则板的（§4.6）；循环板上自带的是「告诉主 Agent」（`tell-main`），以及插件带来、在代码里的两种：`harness`（例：主干全量检查 `execute.trunk-check` 就是「跑检查」）与 `self`（例：M4 自带的「改完文件就跑检查」在 agent 的下一步之前由 env 行当场跑）。第四种是脚本。人自己加的「跑检查」是第五种 `check`（编排方的裁定「Check entries seam」）：它跑的是环境工具节点上的一条命令，不是插件的代码，所以与脚本一样由循环板的执行器跑、经人看过原文同意。

为什么是这几种、每种只有一个执行者（`check` 是接缝核对时照裁定加的，执行者同 `script`，下面一段说的是另四种）：人要的三种（告诉主 Agent；跑脚本、结果交给主 Agent；harness 带的联动「做一件事再告诉主 Agent」）覆盖了今天各行要交给循环板的全部；第四种 `self` 是那些必须在别处当场执行的事（检查器在改完文件的那一步之前跑、高峰的收放在规则板的执行边界上、GLM 的高峰提醒在 GLM 的请求里），把它们再在循环板上实现一遍就成了两套机制管同一件事。所以 `self` 的条目，循环板只负责列出、记录与显示，页面写明谁执行。同一件事只有一处在做，两块板各显示它的一面。

### 2.4 所有规矩去哪块板（`d-rules-visible`）

两块板的分界：规则板管「一件事要发生时让不让做」，在执行边界当场拦下、排队或只告知；循环板管「一件事发生了或到点了就去做一件事」。门的内容仍可以存在项目图的规范与工具节点里，两块板负责显示。

| # | 今天写在哪 | 是什么 | 去哪 | 那里怎样显示 |
| --- | --- | --- | --- | --- |
| 1 | 规范节点 `norm-merge-gate` | 合入前的检查清单 | 规则板「会挡住动作的门」（rules:§9.1，plain-ui §4.7）；主干全量检查用它的命令，是 M7 的 `execute.trunk`（循环板，§5.1） | 规则板列出每条原文；循环板那一项写「用合入前的检查清单的全部命令」 |
| 2 | 规范节点 `norm-review-floor` | 必须全审的改动 | 规则板「会挡住动作的门」 | 同上 |
| 3 | M4 的 env 工具节点（检查行） | 改完文件就跑的检查器 | M4 自带的：循环板 `env.checks-after-edit`，M4 交来、env 行执行；人自己加的：循环板上人的 `check` 条目，命令取自同一种节点，循环板执行（编排方的裁定「Check entries seam」，§5.3） | 每个批过的工具节点一行，写检查命令与「来自你批准的工具节点」；人加的那几项在「本项目加的」一组 |
| 4 | M4 §6.3、§6.5、§6.6 写死的数 | 检查器自己的规矩：一步至多等 20 秒、同一检查器在一个会话里连续失败 3 次后不再跑、没有检查器覆盖的语言每个会话提醒一次（m4:§6、验收表 m4-checks 第 2–4 条） | 循环板 `env.checks-after-edit` 展开后「检查器自己的规矩」一段 | 原样写出三个数 |
| 5 | M4 §4（规划规矩，`src/graph/reopen.ts`） | 同一处第三次返工之前停下问人 | 循环板 `graph.third-rework`，M4 经图行交来、图工具执行 | — |
| 6 | M7 0.3 §3.11.1 的三条时间条目 | 晨报、周报、夜间巡检 | 循环板 `operate.morning`、`operate.weekly`、`operate.patrol`，M7 交来 | 时间、上次、下次 |
| 7 | M7 0.3 §3.11.1 的七条事件条目 | 设计放行之后开始推进、交回之后派审查、审查过了之后合入、停下之后问人、活都关了之后派整体审查、合进主干之后跑完整检查、重启之后接上 | 循环板 `execute.*` 七项，M7 交来；harness 动作（开始推进、主干全量检查、重启对账）由 M7 执行 | — |
| 8 | M7 的门（写入范围、派发链只读、主干前进的核对、完成门禁、停下之后不再派等八道） | 会挡住动作的门 | 规则板「写在代码里的规则」（rules:§10.1，M7 合入后登记） | 只读 |
| 9 | 编排方的提议 | 依赖文件变了之后查依赖；有事等你太久时再说一次 | 循环板 `loops.deps-after-merge`、`loops.remind-waiting`，循环行自己带 | — |
| 10 | GLM 包的高峰提醒（`glm-prompt`） | 高峰开始时提醒模型 | 循环板 `glm:peak-reminder`（GLM 包自己执行）；默认规则「GLM 峰谷定价」在规则板 | 循环板写「GLM 通道包自己执行，这里只列出」 |
| 11 | 规则板的高峰模式（rules:§3.6） | 高峰开始与结束时按档位收放 | 档位与执行边界上的收放在规则板（档位只显示，改法是 `/rules peak` 或跟主 Agent 说，rules:§9.1）；开始与结束这两个时刻在循环板 `loops.peak-start`（由规则板执行）与 `loops.peak-end`（高峰里只剩挪开的活时，自动推进先停着、不来问你；高峰结束时系统把它接上并叫醒主 Agent，少做与不做都这样。接上是 M7 的 `execute.resume-drive`，由这一项调；规则板排着的子 agent 与脚本由规则板放出；没有停住的自动推进、主 Agent 闲着又在高峰里干过活时，这一项叫醒它一次，两档都这样；主 Agent 自己任何一档都不受高峰影响，`d-main-agent-peak-exempt`），两项都是编排层的条目，听的是 GLM 通道给的高峰变化 `channel.peak-changed`（修订后的接缝裁定，§3.4） | 循环板写「此刻是否高峰、档位、下一次变化」、少做档的「高峰里同时至多 1 个 GLM 子 agent」与「档位在规则板上看，要改：跟主 Agent 说，或在输入框打 /rules peak」（0.6 与 §8.2 第 3 条同一句，评审 F47） |
| 12 | M6 的额度读取（`/glm-status`、`/hourness`） | 看状态时读一次额度 | 循环板 `glm:quota-on-command`（GLM 包自己执行） | 同第 10 行 |
| 13 | M6 0.3 §8.2 | 额度快用完时告诉你 | 循环板 `glm:quota-low`，循环板执行 | — |
| 14 | M6 0.3 §4.9、§8.2 | 登录失效时提醒重新登录 | 循环板 `glm:login-rejected`，循环板执行 | — |
| 15 | guard 的规则、图文件只经图工具、M3 的写入规则、主 Agent 没有写文件的工具、危险 git 命令前存快照 | 安全底线 | 规则板「写在代码里的规则」（rules:§10.1） | 只读 |
| 16 | 循环板自己的门（新） | agent 不能经 DSH 的定时工具改循环板的任务、不能冒充循环板建提醒（§6.2） | 规则板「写在代码里的规则」的 `loops:schedule-tools`（rules 0.7 §2.6 已列这一行，并照本设计 0.2 加了「也拒绝以 Loop board: 开头的 schedule_create」） | 只读 |
| 16a | 循环板自己的门（0.5 新） | 循环板的条目文件、脚本与运行时文件只由循环板写（`docs/loops/`、`.llm/loops/`，§9.1；`d-rules-in-repo` 的「规则文件由板自己写，门禁挡住其他写入」） | 规则板「写在代码里的规则」的 `loops:files-only`（循环行注册，§13；规则板 0.9 登记这一行） | 只读 |
| 17 | 循环板自己的护栏（新） | 去抖、限次、自己触发自己、脚本的超时与崩溃时怎样、内容哈希、最少环境、给模型的文字转义与脱敏、一个项目一把运行锁 | 循环板页底「循环板自己的规矩」；每个脚本条目下面另写它自己的超时与崩溃时怎样 | 写出数字 |
| 18 | 规则板的等待单唤醒 | 排队的调用在条件解除后叫回 agent | 规则板（「排队」的后半截，rules:§6.3） | 规则板「在等的工作」 |
| 19 | 本仓库的 Kiro 钩子（会话开始时提醒 `reading-digest` 是否到期） | 每周读文章 | 自举（`dogfood`）开始后改为本仓库循环板「本项目加的」一项（§5.5）；之前照旧 | — |

### 2.5 仍在代码里的

- 机制：条目与事件的格式和校验（§2、§3.2）、事件怎样收集（§6.3）、到点怎样投递（§6.2）、脚本怎样跑（§6.6，两块板共用）、记录怎样写（§6.10）、谁能写人的条目（§7）；规则板与项目图本身的机制。人加的条目与脚本不在代码里，在项目仓库的 `docs/loops/`（§9.1）。
- 各行自己的条目表：M7 的 `src/execute/entries.ts`、`src/operate/entries.ts`，M4 的 env 行的一张表，GLM 包的 `src/glm-llm/loop-defaults.ts`，循环行自己的 `src/loops/defaults.ts`。它们是数据，在页面上原样显示，只是暂时放在代码里、不能改（`d-defaults-readonly`）。每张表只在它那一行里，循环板的代码不导入别的行的表。
- 安全底线：§2.4 第 15、16 行，显示在规则板上。
- GLM 通道里必须和 ZCode 一字不差的部分（请求头、签名、系统提示词原文），不是规矩，不上板。
- 循环板自己的护栏（§2.4 第 17 行）：防的是循环板自己出毛病，页面写出数字。

## 3. 各行怎样把条目与事件交给循环板

0.1 把编排层的 11 项写在循环行自己的 `src/loops/defaults.ts` 里，同一件事因此在 M7 的 `entries.ts` 与循环行里各定义一遍（评审 F1）。本稿改为登记表：循环板只定格式、校验与执行，条目与事件由拥有那件事的那一行交来。M7 0.3 已按这个形状写好它那一侧（m7:§2.5「名字以那份设计为准，M7 只改 entries.ts」），下面是定稿的接口。

### 3.1 服务 `glmHournessLoops`

```ts
// src/loops/service.ts：只有类型、常量与读取函数，不导入循环行的其余代码（M7、M4 与 M3 导入它）
// 下面的 LoopEventField、LoopEventParam、LoopEventDeclaration 0.5 起定义在 trigger.ts（两块板共用，§2.2），这里原名再导出
import type { ServiceLookup } from '../shared/dsh-min.ts'
import type { LoopEntryDefinition } from './model.ts'

export const LOOPS_SERVICE = 'glmHournessLoops'

export interface ContributionSource {
  readonly plugin: string                    // 包名：dsh-hourness
  readonly row: string                       // 行 id：glm-hourness/execute
}

export interface LoopEventField {
  readonly name: string                      // /^[a-z][A-Za-z0-9]{0,31}$/
  readonly type: 'string' | 'number' | 'boolean' | 'strings'
  readonly title: string                     // 人话，1–20 个码点，页面写筛选时用
  /** 能怎样筛；不写即不能筛。in 只配 string（声明为 in 的另收 matches，0.5），is 只配 boolean，atLeast 只配 number，paths 只配 strings */
  readonly filter?: 'in' | 'is' | 'atLeast' | 'paths'
}

export interface LoopEventParam {
  readonly name: string
  readonly type: 'string' | 'number' | 'boolean'
  readonly title: string
  readonly required: boolean
  readonly min?: number
  readonly max?: number
}

export interface LoopEventDeclaration {
  readonly id: string                        // <名字空间>.<名>，名字空间与同一份交来的条目相同；gate. 只给规则行，表示拦路的事件（§4.6）
  readonly title: string                     // 人话：「一件活交回了」
  readonly fields: readonly LoopEventField[] // 载荷的字段；信封另有 at、session
  readonly params?: readonly LoopEventParam[]// 只给循环行自己推出的事件（§4.1）
  readonly personSelectable: boolean         // 人能不能在自己的条目里用它
  /** 只给 gate. 事件：条目没写 onError 时取它。拦在难以退回的一步之前（主干前进之前）的写 'block'，由声明它的规则板定（d-script-timeout） */
  readonly gateOnErrorDefault?: 'allow' | 'block'
  /** 只给 self 条目引用：循环板不收这个事件（例 M4 的 graph.third-reopen 只在图工具内部发生） */
  readonly listedOnly?: boolean
}

export interface Contribution {
  readonly events?: readonly LoopEventDeclaration[]
  readonly entries: readonly LoopEntryDefinition[]
  /** 这一行提供的 harness 动作；条目的 harness 动作只能用这里列出的 id */
  readonly actions?: readonly { readonly id: string, readonly title: string }[]
  /** 循环板调用 harness 动作。不抛错，失败写进结果；actions 非空时必有 */
  run?(action: string, event: LoopEventRecord): Promise<HarnessResult>
  /** 只给页面：一项展开后的明细行（例 M4 每个批过的检查器一行）。同步、不抛错；至多 20 行，每行至多 160 个码点 */
  details?(entry: string, project: string): readonly string[]
}

export type ContributeResult =
  | { readonly ok: true, readonly dispose: () => void, readonly accepted: readonly string[], readonly dropped: readonly { readonly id: string, readonly reason: string }[] }
  | { readonly ok: false, readonly reason: string }

export interface LoopEventInput {
  readonly event: string
  readonly cwd: string                       // 发生它的会话的工作目录，按 §2.1 算项目键
  readonly session?: string                  // 相关的会话（M7 交持有者会话）
  /**
   * 去重键，1–200 个字符，说的是「这一次发生」：`<事件名去掉名字空间>:<主体>:<这一次的标识>`，至少三段、每段非空（§4 每种事件的键一栏）。
   * 同一个项目里同一个键 7 天内只处理一次，再来的记 loop-duplicate（§6.3）。键由交事件的一方生成
   */
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type EmitResult =
  | { readonly ok: true, readonly id: string, readonly duplicate: boolean }
  /** 0.6（评审 F54）：本进程跑着这个项目、执行表已读全，且没有生效的条目听这个事件：没写收件箱、没记键 */
  | { readonly ok: true, readonly duplicate: false, readonly unheard: true }
  | { readonly ok: false, readonly code: 'unknown-event' | 'invalid' | 'no-project' | 'busy' | 'io', readonly message: string }

/** 循环板交给 run 的事件：收件箱里的一行，加上去抖合进来的个数 */
export interface LoopEventRecord {
  readonly id: string                        // ev-<16 位十六进制>
  readonly event: string
  readonly at: string
  readonly project: string                   // 项目根的绝对路径
  readonly session?: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly merged: readonly { readonly id: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> }[]   // 合进同一次运行的其余事件，按先后
}

export type HarnessResult =
  | { readonly outcome: 'done', readonly tell?: string }
  | { readonly outcome: 'skipped', readonly reason: string }
  | { readonly outcome: 'failed', readonly reason: string, readonly tell?: string }

/** self 条目的一次运行，由执行它的那一行报 */
export interface ListedRun {
  readonly cwd: string
  readonly entry: string
  readonly outcome: 'ran' | 'reported' | 'skipped' | 'failed'
  readonly durationMs?: number
  readonly exits?: readonly number[]
  readonly reason?: string                   // 一行，至多 120 个码点
}

/**
 * 要人亲眼看到的原文（§7.1 第 1 步）。markdown 是 M3 原样接在四行之后的一段（脚本放在围栏代码块里）；
 * mustShow 是核对用的逐字片段：脚本原文整段一片（检查是 commandText 写出的那一行命令），加上每一句注意事项。M3 核对主 Agent 的回话里每一片都在（§7.1 第 3 步）。
 * 由共用的 scriptDetail 或 commandDetail 生成（src/loops/script.ts，§6.6），规则板的脚本提议用同一个 scriptDetail，两块板给人看的是同一种样子
 */
export interface AttachDetail {
  readonly markdown: string                  // 至多 6000 个码点（0.4 为 800：命令换成脚本，要放得下一段 4000 个码点的脚本，§17 M3 第 9 条）
  readonly mustShow: readonly string[]       // 1–8 片，每片至多 4000 个码点：脚本原文一片、注意事项至多 7 句（0.4 为 1–13 片、每片 400）
}

/** 与规则板的 AcceptRequest、AcceptResult 同形（rules:§7.2）；契约测试核对两边互相可赋值 */
export interface AcceptRequest {
  readonly questionId: string
  readonly graphDir: string
  readonly cwd: string | undefined
  readonly by: { readonly actor: 'human' | 'llm', readonly relay?: string }
}
export type AcceptResult =
  | { readonly ok: true, readonly proposal: string, readonly outcome: 'accepted' | 'rejected', readonly entry?: string }
  | { readonly ok: false, readonly code: 'missing' | 'busy' | 'io' | 'invalid' | 'forbidden', readonly message: string }

export interface LoopsService {
  /** 激活时交出条目、事件与 harness 动作。同一个来源再交一次就整份替换上一次；不抛错 */
  contribute(source: ContributionSource, contribution: Contribution): ContributeResult
  /** 交一个事件：校验后追加进项目收件箱（§6.3）。不抛错，promise 不被拒 */
  emit(event: LoopEventInput): Promise<EmitResult>
  /**
   * 0.6（评审 F54）：这个项目此刻有没有生效的条目听这个事件（self 不算）。只读内存，不抛错。
   * 项目不在本进程跑或执行表还没读全时返回 true（交上来，由持锁的一方判）
   */
  listens(event: string, cwd: string): boolean
  /** self 条目执行它的那一行报一次运行；只认 self 条目的 id，不抛错 */
  recordRun(run: ListedRun): void
  /**
   * M3 的 propose_to_human 带 attach 'loops:<id>' 时先问（§7.1 第 2 步），record_human_answer 拍板之前再问一次（§7.1 第 3 步）；只读内存，不抛错。
   * detail：提议要人亲眼看到的原文（动作为 script 或 check 的加、改与 repin 时是脚本原文或检查的命令行与注意事项，见上面的 AttachDetail；别的没有 detail），M3 原样放进给人看的 text 与待决正文，并在拍板前核对它被给人看过。
   * 返回的是 loop_propose 时算好、存在这条提议里的那一份，两次调用得到的逐字相同，不按此刻的文件系统重算（§7.1 第 1 步，评审 F37）
   */
  attachable(request: { readonly cwd: string | undefined, readonly proposal: string }): { readonly ok: true, readonly detail?: AttachDetail } | { readonly ok: false, readonly message: string }
  /** M3 的 record_human_answer 拍板成功之后调用（§7.1 第 4 步）；不抛错 */
  acceptProposal(request: AcceptRequest): Promise<AcceptResult>
  /**
   * 周报用（§6.11）：这个项目里人加的、4 周没跑出过结果的条目，至多 3 项，上一次有结果最早的在前。只读内存，不抛错；
   * 项目不在本进程跑时返回 undefined（周报写「循环板此刻不在这个 DSH 进程里，这一节下次再看」）
   */
  staleEntries(project: string, now: Date): readonly StaleEntry[] | undefined
  /** 周报用（§6.11，d-script-timeout）：最近 7 天脚本超时（unfinished）至少 3 次的条目，人的与插件的都算，至多 3 项，次数多的在前；同上，不在本进程时 undefined */
  timeoutEntries(project: string, now: Date): readonly { readonly id: string, readonly title: string, readonly timeouts7d: number, readonly lastTimeoutAt: string }[] | undefined
}

export interface StaleEntry {
  readonly id: string                        // u-<8 位十六进制>
  readonly title: string
  readonly addedAt: string
  readonly lastResultAt?: string             // 最近一次结局为 delivered、ran 或 reported 的时刻；从没有过时不写
  readonly runs28d: number                   // 最近 28 天的运行次数（所有结局）
  readonly why: 'never-triggered' | 'no-result'   // 28 天里一次都没触发；触发过，但没有一次跑出结果
}

/** 读服务；不在时为 undefined；成员类型不对时也为 undefined，并回调 problem（同 pricingService） */
export function loopsService(ctx: ServiceLookup, problem?: (message: string) => void): LoopsService | undefined
/** 待决正文末行「循环板提议 `lp-<8 位十六进制>`」；与 loopProposalIdOf 互为逆 */
export function loopProposalLine(proposal: string): string
export function loopProposalIdOf(body: string): string | undefined
/** mustShow 以换行连起来的 SHA-256 前 12 位十六进制；M3 写进拍板的 reason，acceptProposal 核对（§7.1 第 3、4 步）。纯函数，客户端不用它 */
export function attachDigest(detail: AttachDetail): string
```

- 谁提供：循环行在 `ctx.inject(['sessionController'], sub => …)` 里 `sub.provide(LOOPS_SERVICE, …)`（cordis 的 `inject`，`src/shared/dsh-min.ts`:303 的注释与 `src/graph/panel-row.ts`:122 的用法〔实读〕；会话控制器的服务名 `sessionController`，api-session-controller:2952〔实读〕）。所以只有能投递的进程（DSH 的 Web 组合，桌面版）有这个服务；headless 运行、探针与标定里没有它，M7 照它的退路自己执行事件条目（m7:§2.5 末段），不会出现「服务在、却没人执行」的进程。
- 交条目的一方怎样交：在自己的 `apply` 里 `ctx.inject([LOOPS_SERVICE], sub => { const r = sub[LOOPS_SERVICE].contribute(source, contribution); if (r.ok) sub.effect(() => r.dispose) })`，循环行后到或重启时自动重交，卸载时自动撤回〔推断：`inject` 对本包 `ctx.provide` 的服务与对宿主服务同样生效，§10.2 V12〕。不成立时的退路：交的一方在每次 `agent/created` 时调 `loopsService(ctx)?.contribute(...)`，同一个来源再交只是替换，重复交没有副作用；`dispose` 在自己的 `ctx.effect` 里调。
- `contribute` 同步完成：整份按 §3.2 校验，合格的条目立刻出现在页面上（`view.json` 的下一次重写）与执行表里；不合格的进 `dropped`，循环行的行健康报一次。返回 `ok: false` 只有两种：来源的名字不合；名字空间已被另一个来源占用（§3.2）。
- `emit`：校验事件 id 在当前的事件表里、载荷合它的声明、`cwd` 算得出项目键、`key` 合下一条的写法；`listens` 为假时到此为止，返回 `unheard`（评审 F54，§4.4 末段；`loop_show` 的事件表给每个事件写「今天没人听、没记下的 N 次」，这个数只在内存里）；否则在收件箱锁内追加一行（§6.3）；这个进程正跑着这个项目时立刻交给处理函数，不等文件监视。取不到锁或写不进（`busy`、`io`）时，循环行在内存里再试三次，间隔 1、3、6 秒（共 10 秒，评审 F26）；第三次仍失败才返回 `busy` 或 `io`，并报循环行的行健康 degraded「没能把『<事件>』记进收件箱：<原因>」；调用方不必另报，也不再重试（三次都失败、漏掉的那一次怎样被发现，见 §6.3 末条）。0.2 不重试，一次锁竞争就可能让一次交回等到 02:30 的巡检才被发现。M7 在 `agent/pre-step` 等热路径里调用，可以不等这个 promise；重试在 promise 里，不挡调用方。
- 去重键（评审 F22）：键说的是「这一次发生」，不是「这件事」。写法 `<事件名去掉名字空间>:<主体>:<这一次的标识>`，至少三段、每段非空，第一段等于事件名去掉名字空间（`hourness.tasks-closed` 的是 `tasks-closed`）；不合时 `emit` 返回 `invalid`（「key must name one occurrence」）。「这一次的标识」取发生时就定下、重放时不变的东西：进程启动的毫秒、图上那条历史或批注的时刻、`advances.jsonl` 那一行的时刻、派发的 `childId`、文件的大小与修改时间。每种事件用哪几样写在 §4 各表的「键」一栏，由交它的一方生成：`hourness.*` 由 M7，`loops.*` 与 `channel.*` 由循环行。只带主体的键（例 `tasks-closed:<goal>`）会把第二次真实的发生当成重复丢掉，校验挡不住所有这种写法，所以重复的每一次都记下、按键计数，同一个键 24 小时内第 4 次来时行健康 degraded（§6.3），写错键的一方由此被发现。
- `run`：循环板在执行一项 harness 条目时调用（§6.5），调用放在一个异步上下文里，记着这次运行的运行号（§6.7 用它认出「自己触发自己」）；循环板等它的结果，至多 6 小时（M7 门禁锁的最长持有时间，m7:§3.8.3），过了记 `failed`（`reason: 'timeout'`）、不再等，动作本身由那一行自己收场。例外一个：`loops.peak-end` 调 `execute.resume-drive` 只等 60 秒（§6.9 第 4 条第 3 行；它只改一个 goal 的状态，60 秒没有结果就是出了毛病，主 Agent 不该为它等更久）。`run` 抛错或 promise 被拒时记 `failed`，循环行的行健康写「<行> 的 harness 动作 <id> 出错：<消息前 80 字>」。
- `staleEntries`：读 `state.json` 里每项的 `lastResultAt` 与最近 28 天的运行数（§6.11），只看 `u-` 开头的人的条目；M7 的周报经 `loopsService(ctx)?.staleEntries(...)` 读（§17 M7 第 8 条）。
- `recordRun`：只认当前执行表里 `self` 条目的 id，其余丢掉并计数；写一对 `loop-fired`、`loop-done`（§6.10）。M4 的 env 行每跑完一次检查、图工具每提一次第三次返工的待决调它；规则板不调（高峰两项的记录由循环行自己在高峰变化时写，§5.2）；GLM 包不调（它在另一个包里，自己的事件进指标流水，M6 §14.2）。

### 3.2 交来的东西怎样校验

| 项 | 规则 | 不合时 |
| --- | --- | --- |
| 来源 | `plugin` 匹配 `^[a-z0-9@/._-]{1,64}$`，`row` 匹配 `^[a-z0-9/._-]{1,64}$` | 整份拒绝，`ok: false` |
| 名字空间 | 一份里所有条目、事件与动作的 id 都以同一个名字空间开头（`execute.`、`operate.`、`env.`、`graph.`）；例外一条：`glm-hourness/execute` 交的事件以 `hourness.` 开头（M7 0.3 先定的名字，§3.3），别的来源不能用 `hourness.`；`loops` 留给循环行，`channel` 留给通道事件；`gate` 留给规则行 `glm-hourness/rules` 的拦路事件（0.5，§4.6）：别的来源交 `gate.` 开头的事件整份拒绝，规则行交来的只收事件、不收条目（它的条目在规则板上）；一个名字空间只属于第一个交它的来源，同一个来源再交是替换 | 被占用或 `gate` 被别的来源用时整份拒绝；循环行的行健康 degraded「<名字空间> 已由 <行> 交过」或「<行> 不能声明拦路的事件」 |
| 个数 | 一份至多 32 项条目、16 个事件、16 个动作 | 多出的丢掉，各记一条 `dropped` |
| 事件 id、条目 id、动作 id | `^[a-z][a-z0-9-]{0,15}\.[a-z0-9-]{1,48}$`，一份里不重复 | 那一个丢掉 |
| 事件的字段 | 至多 16 个；`name` 合 §3.1 的写法、不重复，不叫 `at`、`session`（这两个在收件箱的信封里）；`gate.` 的事件例外，可以有 `session` 字段：它们不进收件箱，载荷由规则板自己组，规则按会话筛用的就是这个字段（rules:§2.3；接缝核对时补）；`filter` 与 `type` 的搭配合 §3.1 的注释；参数同理 | 那个事件丢掉，引用它的条目随之丢掉 |
| 条目的 `title`、`why`、`basis` | §2.1 的长度；不含换行 | 那一项丢掉 |
| 条目的 `when` 与 `filter` | `validateWhen`（§2.2，`allowGate: false`）与 §12 的规则；`events` 里每个 id 是这一份声明的、循环行自己的（§4.1）、通道的（§4.3）或另一份当前交着的，不是 `gate.` 开头的；`filter` 只配事件触发；`listedOnly` 的事件只能配 `self`；`command` 只能配 `self`；`cron` 只能配 `tell-main` | 那一项丢掉 |
| 条目的 `action` | `script` 与 `check` 不收（会跑东西的条目只经人同意的那一条路进来，§2.3、§7.1；编排方的裁定「Check entries seam」）；`harness.action` 必须在这一份的 `actions` 里；`self.by` 1–64 个字符；`tell-main.text` 与 `harness.tell.text` 1–2000 个字符，每个 `{名字}` 都是 `when.events` 里每个事件都声明了的字段（时间条目不能有占位） | 那一项丢掉 |
| 条目的 `limits`、`quiet`、`scope` | §2.1 的范围；`scope: 'machine'` 不收（只给通道包的两项，§3.4） | 那一项丢掉 |
| 人话 | 条目的 `title`、`why`，事件与字段的 `title` 经 `plainWordsIn`（M3 附录 §2.8） | 照样收下、照样显示；循环行的行健康写一次「<id> 的说法里有 <词>」 |
| 依赖的事件此刻没有谁交 | 条目引用的事件属于一份已撤回或从没交过的（例 M7 的执行行没启用时 `loops.deps-after-merge` 引用的 `hourness.trunk-advanced`） | 照样收下；页面这一项灰显，写「<事件的人话>现在没有谁报（<插件名>的这一部分没启用），这一项现在不跑」（插件名经 `pluginLabel`，例「项目编排的这一部分没启用」；页面不说「行」，评审 F30） |

丢掉的项不显示、不执行，返回在 `dropped` 里，循环行的行健康按（来源、id）各报一次「<插件> 的 <行> 交来的 <id> 读不懂：<原因>」（验收第 3 条）。插件的行为不因此消失而不出声：交的一方照 M7 的写法也在自己的行健康里报（M7 的 E8 测试钉住它自己的表全部被接受）。

### 3.3 编排层各行交来的

| 行 | 名字空间 | 条目 | 事件 | harness 动作 | 条目表在哪 |
| --- | --- | --- | --- | --- | --- |
| `glm-hourness/execute`（M7） | `execute` | 7 项（§5.1） | `hourness.*` 中的八个与本稿新请求的 `hourness.outside-advance`（§4.2） | `execute.start-drive`、`execute.trunk-check`、`execute.reconcile`，以及接缝裁定要的 `execute.resume-drive`（裁定里叫 `resume-drive`，id 按 §3.2 带名字空间；只恢复 M7 以自己的高峰等待原因码停住的 goal，由第 14 项在高峰结束时调，§6.9 第 4 条、§17 M7 第 6 条；0.3 请的 `execute.resume-after-peak` 撤回） | `src/execute/entries.ts` |
| `glm-hourness/operate`（M7） | `operate` | 3 项（§5.1） | 无 | 无 | `src/operate/entries.ts` |
| `glm-hourness/env`（M4） | `env` | 1 项（§5.3） | `env.files-edited`（经 `emit` 进收件箱，人能选，§4.4；0.5 接缝核对之前是 `listedOnly`） | 无 | `src/env/` 里的一张表（M4 定文件名） |
| `glm-hourness/graph`（M4 的 R1 那一部分） | `graph` | 1 项（§5.3） | `graph.third-reopen`，`listedOnly` | 无 | `src/graph/reopen.ts` 旁的一张表（M4 定文件名） |
| `glm-hourness/rules`（规则板） | `gate` | 无（规则板的条目在规则板上） | 拦路的事件 `gate.*`，可交可不交：交了就在 `loop_show` 的事件表里列为「拦路的，规则板用」，不交也不影响规则板（§4.6） | 无 | `src/rules/events.ts`（rules:§2.3） |
| `glm-hourness/loops`（本稿） | `loops` | 4 项（§5.2） | `loops.*` 三个（§4.1）；另照计价服务推出 `channel.*` 三个（§4.3，只在计价服务在时） | `loops.peak-end` | `src/loops/defaults.ts`；通道事件的声明在 `src/loops/channel.ts` |

M7 的事件 id 以 `hourness.` 开头，与它的条目的名字空间（`execute.`）不同：M7 0.3 先定了这些名字（m7:§2.5），本稿不让它改名，名字空间规则对事件放一个例外：`hourness.` 开头的事件只收 `glm-hourness/execute` 交来的（写在 §3.2 的校验里）。

### 3.4 通道包交来的（M6-L1 到 M6-L5）

通道包不导入编排层的代码（split 0.3 §2.7 的边界），所以它不调 `contribute`，而是把条目放在计价服务的 `loopDefaults` 里（m6:§5 的 `ChannelLoopDefault`），循环行读出来、换成自己的条目。M6 说循环板要别的形状时只改 `channel-loop.ts` 与 `loop-defaults.ts` 两个文件（m6:§8.1）；本稿照 M6 0.3 的形状读，不要它改。0.1 另设的服务 `glmHournessChannelLoop` 与推送 `subscribe` 删去（评审 F2）。

换法只在一个函数里：`channelEntries(pricing, problem)`（`src/loops/channel.ts`），读 `loopDefaultsOf(pricing, problem)`（M6 已按它的 §11 逐条校验），每一项：

| `ChannelLoopDefault.when` | 换成的 `when` | `runBy` 换成的 `action` | `scope` |
| --- | --- | --- | --- |
| `peak-start` | `when: {kind: 'event', events: ['channel.peak-changed']}`，条目上另写 `filter: {edge: {in: ['start']}}`（0.5 起 `filter` 与 `when` 并列；0.6 改正这一行，评审 F47） | `channel` → `{kind: 'self', does: title, by: 'dsh-glm-zcode'}` | `project` |
| `command` | `{kind: 'command', names}` | 同上 | `project` |
| `quota-low` | `{kind: 'event', events: ['channel.quota-low'], params: {usedPercent, exhaustsWithinMinutes, afterUsageMinutes}}` | `loop-board` → `{kind: 'tell-main', text: tell, wake: false}` | `machine` |
| `login-rejected` | `{kind: 'event', events: ['channel.login-rejected']}` | 同上 | `machine` |

`source` 写 `{kind: 'plugin', plugin: 'dsh-glm-zcode', row: 'glm-hourness/glm-login'}`（提供计价服务的是 `glm-login` 行，`src/glm-llm/login-row.ts`:40–43）。`why` 原样。`runBy` 与 `when` 的别的搭配（例如 `channel` 配 `quota-low`）当作不合，丢掉并报一次。通道包以后加新的 `when` 种类时，循环板读不懂就丢掉那一项、报一次，不猜。

M6 对循环板的五条要求逐条落在这里：

| # | M6 的要求（m6:§8.4） | 本稿怎样做 | 在哪 |
| --- | --- | --- | --- |
| M6-L1 列出 | 只读列出 `loopDefaultsOf(pricing)` 的条目；`runBy: 'channel'` 的写「GLM 通道包自己执行，这里只列出」 | 四项都列出，`self` 的两项来源一行写「GLM 通道带来的 · 它自己执行，这里只列出 · 只能看」。没有计价服务时什么都不写：plain-ui §2 定了只装编排层包时面板上不出现模型名，M6 要的那一行「GLM 通道包未装，或它的 glm-login 行未启用」因此不写（§17 告诉 M6） | §8.2 |
| M6-L2 额度快用完 | 用量流水里出现新的 GLM 记录、上一次读数满 `afterUsageMinutes` 分钟时调 `quota({waitMs: 3000})`；`quotaLowOf` 命中且这一期没说过时交 `tell`（`{line}` 为 `quotaLowLine`） | 机器一级的运行者（§6.1）每一拍读用量流水新增的行，见到 `isGlmModel(model)` 为真的记录、且 `quota({read: false}).reading.at` 已满门槛（没有读数也算满）时读一次；读完用条目的 `params` 组成 `QuotaLowRule` 调 `quotaLowOf`；命中、且「窗口名 + 重置时刻（相差 120 秒内算同一期）」不在机器一级的已说记录里时，产生 `channel.quota-low`，载荷 `{window, usedPercent, resetAt?, line}`，`line` 为 `quotaLowLine(window, now)` | §4.3、§6.1 |
| M6-L3 登录失效 | 至多每分钟一次 `quota({waitMs: 0, read: false})`；`login.state` 由别的值变成 `rejected` 时交一次；回到 `ok` 后再变成 `rejected` 时再交一次 | 机器一级的运行者每一拍（60 秒）调一次，记下上一次的 `state`；由别的值变成 `rejected` 时产生 `channel.login-rejected`，载荷 `{since, path, line}`，`since` 照 §4.3 那一行取（`LoginView.since` 可以没有，没有时用第一次看到被拒的那一拍，评审 F38），`line` 为 `loginLine(login, now)`；变成 `ok` 时清掉已说记录里这一件 | §4.3、§6.1 |
| M6-L4 交给谁 | 账号一级的事同一件只交一次，交给最近一次有活动的那个项目的主 Agent | `scope: 'machine'`：事件只在机器一级产生一次，写进「最近一次有主 Agent 走过步的项目」的收件箱（§6.1 的 `lastMainStep`），由那个项目的运行者投递；已说记录在机器一级（§9.1 `machine/told.json`）。主 Agent 自己走 GLM 而登录被拒时它回不了话：首页那一行写「GLM 登录失效了：在输入框打 /glm-login」（§8.3），这正是 M6 说的「改在面板上显示」 | §6.4、§8.3 |
| M6-L5 留痕 | 每次执行（交给主 Agent、读额度）记一条指标事件，由循环板写 | 交给主 Agent 的每一次是一次运行（`loop-fired`、`loop-done`）；循环板发起的每一次额度读取写一条 `loop-read`（§6.10）；每分钟一次的登录状态查看只读本机文件、不发请求，不记（一天 1440 条只是噪声），状态的每次变化随运行记下 | §6.10 |

高峰开始与结束时的两项（第 13、14 项，§5.2）不在 GLM 包里，由循环行自己带，页面写「项目编排带来的」。依据是编排方的接缝裁定，2026-10-30 按本设计第 2 轮评审 F19 修订过（`design-context.md`「Seam rulings between designs」第 4 条）：这两项看的是规则板的档位与主 Agent（M3 的持有者记录、M7 的 goal），GLM 包两样都没有，所以归编排层（`dsh-hourness`）；GLM 包只给高峰变化事件与高峰时刻的计算。0.2 的说法「GLM 包不知道档位」（取自 m6:§8.3）不准：规则板经 `glmHournessPeakMode` 把档位交给 GLM 包（rules:§3.4），GLM 包知道档位，缺的是主 Agent。评审 F19 是照修订之前的裁定（「一条 GLM 插件的默认条目」）写的，要 M6 加第五项 `glm:peak-end`；裁定修订之后不再要，M6 的四项不变（§17）。

GLM 包给的那两样在循环板上是这样落的：高峰时刻的计算是计价服务的 `peak(now)` 与 `nextPeakChange(peak, now)`（`src/shared/pricing.ts`，§4.3），GLM 包提供计价服务；循环行照它推出高峰变化事件，事件 id 用通道的名字空间 `channel.peak-changed`（0.2 叫 `loops.peak-changed`），「谁报」写「GLM 通道」，与另两个通道事件一样只在计价服务在时出现。所以页面上看得到这条分工：事件是 GLM 通道报的，按档位收放与高峰后叫醒是项目编排做的。两项的来源一行写「项目编排带来的 · 依据 GLM 通道的高峰时刻与规则板的高峰模式 · 只能看」（`basis` 为「GLM 通道的高峰时刻与规则板的高峰模式」，20 个码点）。规则板 0.7 第 29 行还写着修订之前的说法「GLM 一侧带到循环板上的一条默认条目」，请它照修订改（§17）。

### 3.5 没有循环板时

| 情形 | M7 | M4 | GLM 通道包 |
| --- | --- | --- | --- |
| 循环行没启用，或这个进程没有会话控制器（headless、探针、标定） | 服务不在：事件条目由 M7 的 `entries.ts` 在本进程里照同一张表执行，时间条目不跑（m7:§2.5 末段） | env 行照常执行检查与第三次返工的待决（它们本来就是 env 行自己做的），只是没有地方列出 | 高峰提醒与看状态读额度照常；额度快用完与登录失效没有人执行，也没有主 Agent 可告诉（m6:§8.4 末段） |
| 循环行在，另一个 DSH 进程持有这个项目的运行锁 | 服务在：M7 照常交事件，事件进收件箱，由持锁的进程处理（§6.3） | 照常 | 机器一级的运行者是持机器锁的那个进程（§6.1） |

## 4. 事件表

事件表是两块板共用的一张（`d-boards-as-hooks`：「一张共用的事件表」；编排方的接缝裁定把它归循环板）。它在运行时由五部分合成：循环行自己推出的（§4.1，声明在 `src/loops/events.ts`）、M7 交来的（§4.2）、循环行照计价服务推出的通道事件（§4.3，声明在 `src/loops/channel.ts`）、M4 交来的（§4.4，一个进收件箱、一个只供列出），以及规则板的拦路事件（§4.6，名字空间 `gate.`，只给规则板的条目）。页面的「什么时候」一栏用事件的 `title`；人新建条目时能选的只有 `personSelectable` 为真的那些。每个事件的信封是 `{id, event, at, project, session?, key, payload}`（§3.1 `LoopEventRecord`）。

每张表的「键」一栏是这种事件的去重键怎样写（§3.1 的写法：`<事件名去掉名字空间>:<主体>:<这一次的标识>`），由「谁生成」那一方在交事件时算好。原则是两条：同一次发生重放多少遍，键都一样（所以重启后补报、退路执行者与循环板各报一次，都只跑一次）；同一件事真的又发生了一次，键一定不同（所以每次启动、重开之后又都关了、再修一轮之后又停下，都照常跑）。

### 4.1 循环行自己推出的（`loops.*`）

| id | 人话 | 怎样发现 | 字段（能怎样筛） | 参数 | 停机期间发生的 | 人能选 | 键（循环行生成） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `loops.host-restarted` | DSH 重新启动了 | 循环行开始跑一个项目时对照 `state.json` 的 `host`（§6.8） | `previousStart` string；`downMinutes` number（`atLeast`）；`crashed` boolean（`is`）：上次没有写下正常退出；`rebooted` boolean（`is`）：开机时刻不同；`appChanged` boolean（`is`）：DSH 程序文件的大小或修改时间与上次不同（§10.2 V6） | — | 本身就是 | 是 | `host-restarted:<项目键>:<这一次的 startedAt>`（这个进程开始跑这个项目时写进 `host` 的时刻） |
| `loops.waiting-on-human` | 有事等你超过一段时间 | 每小时一次读项目图，取 plain-ui 的 `needsOf(graph, [], now)`（`src/graph/plain-view.ts`，plain-ui §5.4）里的两种：开着的人定待决、等人批准的提议；plain-ui 那一步没合入时取 `openItems` 里同样的两类。`since` 是它们进入等人状态的时刻 | `items` strings：只列这次新越过门槛的，每件写成 `<id> "<title>" since <MM-DD HH:MM>`，同一件 24 小时内只列一次；`count` number（`atLeast`） | `olderThanHours` number，必填，1–168 | 状态型：起来后照算，不需要补 | 是 | `waiting-on-human:<olderThanHours>:<这一次查的整点，宿主时区 YYYY-MM-DDTHH>`；这一次没有新越过门槛的就不产生事件 |
| `loops.file-changed` | 某个文件变了 | `fs.watch` 加每一拍（60 秒）比一次大小与修改时间作兜底；变了之后 60 秒内不再变才算一次。这一段判定写在 `src/loops/file-watch.ts` 的 `watchPaths(paths, onChange)` 一处，规则板检测器的文件触发也用它（rules:§5.2；检测器的运行者自己调，循环行不在时检测器照样触发；接缝核对时加，0.4 与规则板 0.8 各写了一份、兜底间隔不同） | `path` string；`size` number；`mtime` string | `path` string，必填：存在的目录下的绝对路径；一个项目至多 20 个 | 起来时比一次，变了补一次 | 是 | `file-changed:<path>:<size>-<mtime 的毫秒>`；文件被删时 `<size>` 写 `gone` |

0.2 的 `loops.peak-changed` 改为通道事件 `channel.peak-changed`（§4.3）：高峰变化是 GLM 通道给的（修订后的接缝裁定，§3.4）。

0.1 的 `main-advanced`（每 30 秒查一次 git）删去：主干前进由 M7 按它的核对与执行后比对的记录交事件（§4.2），比轮询准，也不会和 M7 各报一次（评审 F1）。

### 4.2 M7 交来的（`hourness.*`）

名字、何时与载荷照 m7:§2.5 的表；「字段」一栏是本稿定的声明（字段的类型与能怎样筛），M7 照它写进 `entries.ts`。信封里的 `session` 是持有者会话。

| id | 人话 | 何时（M7） | 字段（能怎样筛） | 人能选 | 键（M7 生成） |
| --- | --- | --- | --- | --- | --- |
| `hourness.design-released` | 设计放行了 | 主 Agent 的一步里看到焦点目标放行、这次放行还没开始推进（m7:§3.9.1） | `goal` string（`in`）；`release` string | 是 | `design-released:<goal>:<release>`（`release` 是放行那条历史的 `at`；放行之后回到设计、再放行，是新的一条历史） |
| `hourness.handback` | 一件活交回了 | `done` 的交回处理完、有效深浅不是不审（m7:§3.6.2） | `task` string（`in`）；`attempt` number（`atLeast`）；`status` string（`in`）；`depth` string（`in`）；`reviewTask` string；`commits` number；`floorHit` string：碰到必须全审清单的哪一条，没有时为空串 | 是 | `handback:<task>:<childId>`（这次派发的 `childId`，每次派发都不同；M7 退路执行者的 `handback:<childId>` 前面加上任务 id） |
| `hourness.review-passed` | 审查过了 | 审查通过 | `task` string（`in`）；`round` number | 是 | `review-passed:<task>:<审查者的 childId>`（不用 `round`：人回话之后轮数从头数，`round` 会重复，m7:§3.7.3） |
| `hourness.review-skipped` | 按理由不审 | 有效深浅为不审 | `task` string（`in`） | 是 | `review-skipped:<task>:<这次交回的 childId>` |
| `hourness.stopped` | 一件活停下来了 | 审查、检查或目标整体的审查停下（m7:§3.7.3） | `node` string（`in`）；`kind` string（`in`：`review`、`check`、`acceptance`）；`rounds` number | 是 | `stopped:<node>:<kind>-<带「· 停下」的那条批注的 at>`（不用 `rounds`：人说再修一轮之后又停下，`rounds` 可能还是 3） |
| `hourness.tasks-closed` | 一个目标下的活都关了 | 一个目标下的任务都关了 | `goal` string（`in`） | 是 | `tasks-closed:<goal>:<最后关上的那个任务那条状态历史的 at>`（任务重开再关，是新的一条历史） |
| `hourness.trunk-advanced` | 合进主干了 | 主干前进且核对通过（m7:§3.8.4） | `from` string；`to` string；`tasks` strings；`files` strings（`paths`）：`git diff --name-only from to`，至多 200 项；`truncated` boolean | 是 | `trunk-advanced:<to>:<advances.jsonl 那一行的 at>` |
| `hourness.outside-advance` | 有人不经系统直接改了主干 | M7 在 `advances.jsonl` 记 `{by: 'outside'}` 时（m7:§3.8.4 末两段；本稿新请求，§17） | `from`；`to`；`files`（`paths`）；`truncated` | 是 | `outside-advance:<to>:<advances.jsonl 那一行的 at>` |
| `hourness.host-started` | 主 Agent 的会话在这次启动后第一次走动 | 主 Agent 会话在这个进程里第一次走步或被创建 | — | 否：只给重启对账用 | `host-started:<持有者会话>:<这个进程启动的毫秒>`（`Math.round(performance.timeOrigin)`，同一个进程里不变，下一次启动一定不同） |

`commits`、`floorHit` 与两个前进事件的 `files`、`truncated` 是 M7 0.3 的载荷里没有、它的提醒文字里却要用的（`execute.handback` 的「<commits> commits」「raised to full: <floor hit>」），本稿把它们写进声明，M7 填（§17）。

键一栏用到的标识（`childId`、批注与历史的 `at`、`advances.jsonl` 那一行的 `at`、`performance.timeOrigin`）在 M7 发事件的那一刻都已经写在图上或文件里，重启之后 M7 重放同一次发生（对账补报、退路执行者与循环板各报一次）算出来的还是同一个键。M7 0.3 的退路执行者在一个进程里按键去重（m7:§2.5），循环板跨进程、跨重启按键去重 7 天，两边用同一个键，所以本稿请 M7 把退路执行者的键也改成这一栏的写法（§17）。

### 4.3 通道事件（`channel.*`）

通道事件是通道（今天只有 GLM）经计价服务给的事实，循环行照它推出并声明，不认得任何一个具体的通道；计价服务不在时三个都不在事件表里。`channel.quota-low`、`channel.login-rejected` 是账号一级的，由机器一级的运行者（§6.1）照通道包交来的条目推出（§3.4）：只要计价服务的 `loopDefaults` 里有 `quota-low`、`login-rejected` 这两种 `when`，就按条目的参数推。`channel.peak-changed` 对每个项目都要（第 13、14 项与 GLM 的高峰提醒都听它），由每个项目的运行者各自照计价服务的高峰时刻推出，写进自己项目的收件箱；所有项目算出的边界时刻相同，因为算法与时钟只有计价服务一处。

| id | 人话 | 怎样发现 | 字段 | 参数 | 停机期间 | 人能选 | 键（循环行生成） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `channel.peak-changed` | GLM 高峰开始或结束 | 计价服务的 `peak(now)`（`src/shared/pricing.ts`:27）；定时器设在 `nextPeakChange(peak, now)`（M6 Q1 或规则板 R4 加进同一个文件，m6:§5）；每一拍也比一次。「谁报」写「GLM 通道」 | `edge` string（`in`：`start`、`end`）；`at` 之外另有 `boundary` string：这一次边界的时刻（`start` 是高峰的开始，`end` 是结束）；`until` string：这一段高峰的结束（`start` 时）或下一段的开始（`end` 时） | — | 起来时与记下的值比，不同就补最近的那一次 | 否：高峰怎么办在规则板选档位 | `peak-changed:<edge>:<boundary>` |
| `channel.quota-low` | 额度快用完了 | §3.4 的 M6-L2 一行 | `window` string；`usedPercent` number；`resetAt` string；`line` string：`quotaLowLine` 的中文一行 | `usedPercent` 1–100；`exhaustsWithinMinutes` 1–1440；`afterUsageMinutes` 1–1440 | 不补；下一次读到再判 | 否 | `quota-low:<window>:<这一期>`（这一期是 `told.json` 里这一期第一次记下的 `resetAt`；同 §3.4 M6-L2，相差 120 秒内的读数算同一期，所以同一期只会有一个键；没有 `resetAt` 时取读数时刻所在的整点） |
| `channel.login-rejected` | 通道的登录被拒了 | §3.4 的 M6-L3 一行 | `since` string：这次被拒的时刻，ISO 8601（UTC，带 `Z`）：M6 的 `LoginView.since`（可选的毫秒数，m6:§5）有值时取它，没有时取机器一级的运行者第一次看到这次 `rejected` 的那一拍，记在 `machine/state.json` 的 `loginRejectedSince`，回到别的状态时清掉（评审 F38）；`path` string：`LoginView.path`，没有时为空串；`line` string：`loginLine` 的中文一行 | — | 不补；起来后第一拍照判 | 否 | `login-rejected:<path，空串时写 glm>:<since>`；键、载荷与 `told.json` 里的 `since` 是同一个串，所以每一段都不会空 |

`{line}` 就是这两个事件声明的字段，M6 的 `tell` 文字照它填（m6:§8.2）。

### 4.4 M4 交来的（`env.*`、`graph.*`）

| id | 人话 | 何时（M4） | 字段（能怎样筛） | 人能选 | `listedOnly` | 键（M4 生成） |
| --- | --- | --- | --- | --- | --- | --- |
| `env.files-edited` | 一个 agent 改了文件 | env 行在那个 agent 的下一步之前推出这一步之前改过的文件（m4:§6.2），并经 `emit` 交进收件箱；信封里的 `session` 是改文件的那个会话 | `files` strings（`paths`）：相对 `root` 的路径，至多 200 项；`root` string：那些文件所在的检出的根（主检出或 M7 的一个工作树，绝对路径）；`truncated` boolean（`is`） | 是：人加的检查听它（§5.3） | 否（0.5 接缝核对之前为是） | `files-edited:<会话>:<turn>-<step>`：两个数都取自交它的那一次 `agent/pre-step` 的载荷（agent-loop:956–959〔实读〕）；`step` 每个回合从 1 数起，`turn` 由会话投影 `turnBoundary` 接续（agent-loop:782、943〔实读〕），宿主重启之后也不从头数。载荷里没有 `turn` 时（别的宿主版本）写 `p<这个进程启动的毫秒>-<本进程里这个会话第几次交这个事件>`。0.5 的 `<这一步的序号>` 在不同回合的同一步上撞键，第二次改动的检查不跑（评审 F45） |
| `graph.third-reopen` | 同一件活第三次重开 | 图工具里 LLM 第 3 次把同一节点从完成改回进行中（m4:§4，`src/graph/reopen.ts`） | — | 否 | 是：只在图工具内部 | 不进收件箱，没有键 |

`env.files-edited` 进收件箱之后，M4 自带的 `env.checks-after-edit` 仍由 env 行在那一步之前当场跑（`self`，§5.3），收件箱里的这一行只给人加的条目用；`graph.third-reopen` 不进收件箱。两项 `self` 条目的每一次运行由 env 行与图工具经 `recordRun` 报（§3.1）。`root` 与「相对 `root`」是为了工作树里的改动：按项目根算，`src/a.ts` 在工作树里会成为 `.worktrees/<任务>/src/a.ts`，`src/` 这样的目录前缀就筛不中，检查也该在改动所在的那份检出里跑（§6.6 `runCommand` 的 `cwd`）。并行的子 agent 各在自己的工作树里改文件时，人加的检查按「条目 + 改文件的会话 + `root`」分组去抖与限次，每组在自己的 `root` 里跑、结果交给自己的会话（§6.7 的分组，评审 F46）。

`env.files-edited` 是最常来的事件（每个会话每个改了文件的步都有一条）。为了不让它挤掉别的事件的去重键、也不为没人听的事写盘（评审 F54）：这个进程正跑着这个项目、执行表已读全，且没有一项生效的条目（人的或插件的，`self` 不算，它们不读收件箱）听这个事件时，`emit` 不写收件箱、不记键，返回 `{ok: true, duplicate: false, unheard: true}`（§3.1）；M4 可以先调 `listens('env.files-edited', <cwd>)` 再决定要不要算载荷。项目不在这个进程跑（运行锁在别处）或执行表还没读全（刚开始跑项目）时照常写，由持锁的那一方去判。去重键按事件的名字空间分开记数（§6.3），`env.*` 的键再多也挤不掉 `hourness.*` 的。

### 4.5 以后可加的（本版不做）

一个 agent 的回合出错（`agent/error`，agent-loop:880 发出，监听方式没有核对）；会话打开（`agent/created`）；规则板的信号变了（检测器写的信号，例如服务器负载）。加一种事件：属于某一行的，由那一行在它的 `Contribution.events` 里声明，循环板不改；循环行自己推出的，改 `src/loops/events.ts`，经设计评审。

### 4.6 拦路的事件（`gate.*`，规则板用）

`d-boards-as-hooks` 说脚本「在要拦的时刻（工具调用之前、派活之前、主干前进之前）用退出码说放行、拦下或排队」。这几个时刻在共用的事件表里，用保留的名字空间 `gate.`。分工照编排方的接缝裁定：

- 循环板管的：名字空间与它的保留（§3.2：只有规则行能声明 `gate.` 的事件）；声明的格式（`LoopEventDeclaration`，§3.1，与别的事件一样写字段与能怎样筛）；筛选的比法与 `matchesFilter`（§2.2）；脚本执行器的拦路一路（`runScript` 的 `purpose: 'gate'`、缺省 10 秒、至多 30 秒、单独的一队，§6.6）；`ScriptAction.onError` 这个字段与它的缺省 `allow`（§2.2）。
- 规则板管的（规则板设计 0.9，本稿不重述）：有哪几个拦路的事件、它们的 id 与载荷字段（rules:§2.3：`gate.tool-call`、`gate.dispatch`、`gate.trunk-advance`，声明在 `src/rules/events.ts`；规则板的第四个事件 `rules.step` 不拦路、不登记进共用的表）；哪个执行边界交它们、怎样当场判（rules:§6.1、§6.2；不进循环板的收件箱，§6.3 的收件箱只收不拦路的事件）；拦路脚本的退出码、标准错误与 `onError` 各是什么意思、结果怎样并进工具调用门与 `checkCall`、晚到的结论怎样记与怎样告诉主 Agent（rules:§6.7）；规则板上的条目还能带哪些它自己的条件（`condition`，rules:§2.2、§2.3）。
- 循环板的条目用不了拦路的事件：`validateWhen` 对循环板传 `allowGate: false`，`loop_propose` 返回 `invalid` 与「拦路的时刻归规则板：用 rules_propose」，插件交来的引用它的条目丢掉（验收第 35 条）。理由：拦下一件事是规则板的分工（§2.4 开头那一段，`d-rules-visible`）；一件事在拦路的时刻同步判，循环板的收件箱是异步的，混在一起就有两种语义。
- 规则行可以把它的拦路事件经 `contribute` 交来（只交事件），`loop_show` 在事件表里把它们列为「拦路的，规则板用」；不交也不影响规则板，规则板自己的校验照样用 `validateWhen`（`allowGate: true`）与它自己的声明。

## 5. 默认条目

给模型的文字是英文，`{…}` 由事件载荷的同名字段填（§2.3）。每条消息的第一行固定为 `Loop board: <id> (default of <插件>).`，下面各条只写第一行之后的部分。人看到的「做什么」一栏是页面上的说法。`limits` 一栏是 `debounceSeconds` / `maxPerHour`。

### 5.1 M7 交来的（`dsh-hourness`：`glm-hourness/execute` 与 `glm-hourness/operate`）

条目的数据与给模型的文字归 M7（m7:§3.11.1，`src/execute/entries.ts`、`src/operate/entries.ts`），本表只为验收与 `limits` 列出；文字以 M7 的为准，本稿只要求它们的占位改成 `{名字}`，且只用 §4.2 声明的字段。M7 0.3 的条目形状是 `{id, title, source, trigger, action}`，没有 `why`；插件的条目 `why` 必填（§2.1、§3.2），照原样交来十项都会被丢掉，所以 §17 请 M7 每项补一句 `why`（评审 F28）。

| # | id | 页面上的名字（M7 的 `title`） | 什么时候 | 做什么 | `wake` | `limits` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `execute.release` | 设计放行之后：主 Agent 开始自己推进 | `hourness.design-released` | harness `execute.start-drive`（建 DSH 的 goal、在目标上批注「自动推进已开始」），`done` 之后告诉主 Agent 分解与派活、不用等人 | 是 | 5 / 30 |
| 2 | `execute.handback` | 一件活交回之后：派审查 | `hourness.handback` | 告诉主 Agent 派审查，深浅与模型由它定 | 是 | 5 / 30 |
| 3 | `execute.reviewed` | 审查过了（或按理由不审）之后：做出要进主干的提交，检查后合入 | `hourness.review-passed`、`hourness.review-skipped` | 告诉主 Agent 做出带尾注的提交，`check_commit` 之后快进主干 | 是 | 5 / 30 |
| 4 | `execute.stopped` | 审查或检查一再不过停下之后：在对话里问你 | `hourness.stopped` | 告诉主 Agent 别再派这件活，用 `propose_to_human` 把它交给你（m7:§3.7.4 的正文） | 是 | 5 / 30 |
| 5 | `execute.tasks-closed` | 一个目标下的活都关了之后：派目标整体的审查 | `hourness.tasks-closed` | 告诉主 Agent 派整体审查，模型由它选 | 是 | 5 / 30 |
| 6 | `execute.trunk` | 合进主干之后：在主干上跑一遍完整的检查 | `hourness.trunk-advanced`、`hourness.outside-advance` | harness `execute.trunk-check`：在专门做检查的那份检出里跑一遍合入前的检查；没过时把命令、退出码与日志交给主 Agent | 是 | 30 / 30 |
| 7 | `execute.restart` | 重启之后：接上停了的活 | `hourness.host-started` | harness `execute.reconcile`；有丢失或补写时把清单交给主 Agent | 是 | 5 / 6 |
| 8 | `operate.morning` | 每天 08:30：晨报 | 每天 08:30，系统时区 | 告诉主 Agent 出晨报原样给你看，至多三件等你的事用 `propose_to_human` 交给你 | DSH 投递 | — |
| 9 | `operate.weekly` | 每周一 09:00：周报 | 每周一 09:00 | 告诉主 Agent 出周报，提议至多三件，用 `propose_to_human` | DSH 投递 | — |
| 10 | `operate.patrol` | 每天 02:30：夜间巡检 | 每天 02:30 | 告诉主 Agent 巡检：计划内的活去做或派出，要你定的留到下一批 | DSH 投递 | — |

- `limits` 的取值（评审 F8）：一件活交回、审查过了、停下、活都关了与设计放行，都是自动推进链上的一环，晚一步就是主 Agent 多空等一步，所以去抖 5 秒；同一小时里并行的活多，交回与审查过了每小时可能十几次，所以上限 30（人的条目是 6），被限的事件不丢（§6.7）。主干全量检查去抖 30 秒：几次快进常常前后脚，合成一次跑。重启对账一小时至多 6 次。
- `execute.trunk` 跑什么、什么时候可以跳过，是 M7 的 harness 动作自己的事（m7:§3.11.1 写「所有 `$` 与 `when` 命令都跑」）。0.1 让循环板自己在门禁工作树里跑，并用 `skipIfGated` 判断跳过；评审 F1 指出那条判法几乎从不成立，而一次 30 分钟的全量检查会占住门禁锁、排住下一次 `check_commit`。本稿把这件事整个交回 M7，并建议 M7 的 `execute.trunk-check` 用这一条规则（§17）：对新主干 `N`，在同一个 `normDigest` 下，与 `N` 的树相同或只差 `only` 路径的那些提交已有的通过记录合起来，已经覆盖 `norm-merge-gate` 的每一条 `$` 与 `when` 命令时，记为跳过（「这个主干提交的每条检查都跑过了」）；否则只跑还没覆盖到的那几条，结果与已有记录合成一条 `kind: 'trunk'` 的记录。这样「合进主干之后跑一遍完整检查」照人的话做到了（每个进主干的提交的内容，每条检查都跑过一次），又不在 `check_commit` 刚跑完的几条上重跑、少占门禁锁。M7 不采用时循环板什么都不用改：它只调 `run` 并记录结果。
- 0.1 把巡检里的「停下来报告」「等人太久」等写成「四行的方案（背景、推荐、疑问、不做）」让主 Agent 自己拼；M7 0.3 的文字已改为 `propose_to_human`，由 harness 拼四行（m3:§3.4「为什么四行由 harness 拼」），本稿自己的条目也照这样写（§5.2）。

### 5.2 循环行自己带的（`dsh-hourness`：`glm-hourness/loops`，`src/loops/defaults.ts`）

| # | id | 页面上的名字 | 什么时候 | 做什么 | `wake` | `limits` |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | `loops.deps-after-merge` | 依赖文件变了之后：查依赖 | `hourness.trunk-advanced`、`hourness.outside-advance`，`files` 里有依赖文件 | 告诉主 Agent 跑依赖检查，大版本升级交给你定 | 是 | 30 / 6 |
| 12 | `loops.remind-waiting` | 有事等你太久时：再跟你说一次 | `loops.waiting-on-human`，`olderThanHours: 24`；`quiet` 22:00–08:00 | 告诉主 Agent 再跟你说一次，等得最久的在前，一次至多三件 | 是 | 60 / 1 |
| 13 | `loops.peak-start` | GLM 高峰开始时：按你选的高峰模式收放 | `channel.peak-changed`，`edge` 为 `start` | `self`（`by: 'glm-hourness/rules'`，`does` 为「规则板定档位与上限，项目编排派活时照上限数」：页面上不写模块代号 M7）：主 Agent 每一步都知道此刻是高峰、是哪一档；少做时 GLM 子 agent 同时至多 <上限> 个，练习题、对照实验、大的评审挪到高峰之后；不做时 GLM 子 agent 的活与重活排到高峰之后；主 Agent 自己两档都照常干活、随时回话（`d-main-agent-peak-exempt`） | — | 5 / 6 |
| 14 | `loops.peak-end` | GLM 高峰结束时：接上挪开的活 | `channel.peak-changed`，`edge` 为 `end` | harness `loops.peak-end`（循环行自己执行，§6.9 第 4 条）：高峰里只剩挪开的活时，自动推进先停着、不来问你；高峰结束时先调 M7 的 `execute.resume-drive` 把它接上，再叫醒主 Agent，少做与不做都这样。没有停住的自动推进时，主 Agent 闲着、这段高峰里干过活、不在等你时叫醒它一次，两档都这样；规则板排着的子 agent 与脚本由规则板放出 | 由动作定 | 5 / 6 |

- 第 13、14 项只在计价服务在时出现（GLM 包没装就没有高峰），都是编排层的条目（修订后的接缝裁定，§3.4），来源一行「项目编排带来的 · 依据 GLM 通道的高峰时刻与规则板的高峰模式 · 只能看」。规则行没加载时这两项照样列出，第 13 项灰显并写「规则板没启用：高峰只由 GLM 通道提醒模型，档位不起作用」，第 14 项照样先调 `execute.resume-drive`（没有规则板时 `peakHoldFor` 读不到，M7 不会因高峰停住，动作说 `skipped`），之后按「读不出档位」跳过。
- 第 13 项的上限（评审 F29）：数归规则板，执行在 M7 的 `dispatch_task`（规则板 0.7 §3.6，编排方的接缝裁定）。页面写「少做：高峰里同时至多 <n> 个 GLM 子 agent」，`n` 在少做档的高峰里取 `stateForProject(<项目根>).glmWorkerCap`，其余时候取公共库的常量 `PEAK_REDUCE_GLM_WORKERS`（`src/shared/peak-mode.ts`，规则板 0.7 定为 1，`glmWorkerCap` 就是它）；档位不是少做时不写这一句。0.2 写的「少做时少开并行的 GLM 子 agent」让人以为是规则板在少开。`src/shared/peak-mode.ts` 是公共库，不在 `src/rules/` 里，验收第 14 条的静态检查不受影响。
- 第 13 项的运行由循环行在 `channel.peak-changed` 时自己记（结局 `delegated`，载荷写当时的档位），规则板不调 `recordRun`。
- 给模型的文字：
  - 11：`Dependency files changed on the main branch ({from}..{to}): {files}. Run the project's dependency check (the patrol lines of norm-merge-gate) and report what it found. Put a major-version upgrade to the human with propose_to_human.` 依赖文件的名单写在 `src/loops/defaults.ts`：`package.json`、`package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`yarn.lock`、`requirements.txt`、`pyproject.toml`、`poetry.lock`、`uv.lock`、`Pipfile.lock`、`Cargo.toml`、`Cargo.lock`、`go.mod`、`go.sum`、`Gemfile.lock`、`composer.lock`；名字不带 `/`，按 §2.2 的写法在任何一层目录都算。
  - 12：`These have waited for the human for more than 24 hours: {items}. Remind the human once, the longest-waiting first and at most three in one reply: say each in one plain line with its title and what you need from the human. Do not open a new question for an item that already has one. Then end your turn.` 0.5 让主 Agent 用 `propose_to_human` 的 `question` 一种把同一张待决原样再给人看；V13 已有答案，不成立：图引擎对什么字段都没改的 `set` 返回 `invalid`「set changes nothing」（`src/graph/engine.ts`:613〔实读〕，M4 在 `schedules` 节点 07:12 的批注第 ⑦ 点也记了），四行没变时每次都会失败。所以 0.6 直接用退路的写法：每件一行题目与要人做什么（评审 F56）。M4 已请 M3 加一种不带四行、只把已有的待决再给人看的 `propose_to_human`；M3 加了之后，这句文字在同一次改动里换成用它（`src/loops/defaults.ts` 里一个字串，验收第 21 条照旧过 `plainWordsIn`）。
  - 14：由 `loops.peak-end` 的结果给（§6.9 第 4 条的三句：接上了停住的自动推进时一句，没有停住的、闲着的主 Agent 叫醒时一句，接不上时一句；0.6 改正 0.4 留下的「少做档」，两档都叫醒，评审 F47）。

### 5.3 M4 交来的（`dsh-hourness`：`glm-hourness/env` 与 `glm-hourness/graph`）

| # | id | 页面上的名字 | 什么时候 | 做什么 | `limits` |
| --- | --- | --- | --- | --- | --- |
| 15 | `env.checks-after-edit` | 改完文件就跑检查 | `env.files-edited` | `self`（`by: 'glm-hourness/env'`）：跑你批过的检查，结果在那个 agent 的下一步交给它 | — |
| 16 | `graph.third-rework` | 同一件活第三次返工之前：停下问你 | `graph.third-reopen` | `self`（`by: 'glm-hourness/graph'`）：在这件活下面提一件要你定的事，由主 Agent 在对话里问你（m4:§4） | — |

- 第 15 项展开时列出两样：每个批过的检查器一行（由 M4 的 `Contribution.details` 给，§3.1 末的补充一条：「ESLint：改了 .ts、.js 之后跑 · `npx eslint {files}`」），与「检查器自己的规矩」（评审 F16，由 M4 交在条目的 `ownRules` 里）：一步至多等 20 秒，跑得慢的在之后的步里送到；每个检查 60 秒超时；同一个检查器在一个会话里连续失败 3 次后这个会话不再跑它；改了没有检查器覆盖的语言的文件时，每个会话每种语言提醒一次（m4:§6.3、§6.5、§6.6，验收表 m4-checks 第 2–4 条）。
- 为此 `LoopEntryDefinition` 多一个可选字段 `ownRules?: readonly string[]`（至多 6 行，每行至多 80 个码点，人话，经 `plainWordsIn`），`Contribution` 多一个可选成员 `details?(entry: string, project: string): readonly string[]`（同步、不抛错，至多 20 行、每行至多 160 个码点；循环板在重写 `view.json` 时调它，抛错时那一项写「<插件名>没给出明细」，例「项目编排没给出明细」）。两样都只给页面，不影响执行。
- 两项的每次运行由 env 行与图工具调 `recordRun` 报（§3.1）。
- 照 `d-boards-as-hooks`（「规则板、循环板与 M4 的检查器照此改」），M4 的检查器在板上就是同一个形状：`when` 为 `env.files-edited`，`filter` 为改到的文件（`paths`，按扩展名的 `*.ts` 写法，§2.2），动作是自带的「跑检查」（`self`，`by: 'glm-hourness/env'`：env 行在那个 agent 的下一步之前当场跑，结果交给改文件的那个 agent，也就是决定里说的「条目指定的 agent」）。交法两种循环板都收：一项 `env.checks-after-edit`、每个批过的检查器一行明细（0.4 的写法，M4 第 3 轮评审 F11 的改法）；或每个批过的检查器一项（`env.check-<名>`，各带自己的 `filter`），工具节点批了或撤了时 env 行再交一次整份（同一个来源再交是整份替换，§3.1）。这些是 M4 自带的检查器，是插件交来的数据，由 env 行执行、在板上只能看（编排方的裁定「Check entries seam」：M4 自带的可以留在 M4 执行）。验收第 1 条的「M4 的 2 项」在第二种交法下是「M4 交来的各项」。
- 人自己加的检查（编排方的裁定「Check entries seam」，2026-10-30，可推翻；F22）：是循环板上人的普通条目，动作为 `check`（§2.3），由循环板的执行器跑（§6.6 `runCommand`），M4 不执行它们。例：人说「改了 .ts 就跑一遍类型检查，没过告诉改文件的那个 agent」，主 Agent 用 `loop_propose` 提一项 `{when: {kind: 'event', events: ['env.files-edited']}, filter: {files: {paths: ['*.ts']}}, action: {kind: 'check', tool: <TypeScript 那个工具节点>, report: 'on-failure', to: 'event-session'}}`。命令原文取自项目图上人批过的环境工具节点（节点与它的格式归 M4，循环板经 M4 导出的读法取，§17 M4 第 4 条），人在四行之后看到的就是这一条命令行与注意事项，同意之后写入，同脚本（§7.1）。与 M4 自带的那一项的两处不同：人加的检查跑在收件箱之后，结果在改文件的那个 agent 的下一步或之后几步到（去抖缺省 30 秒，人的条目可以在 `limits` 里改小），不卡住那一步；它在改动所在的那份检出里跑（`env.files-edited` 的 `root`，§4.4）。M4 自带的检查器与人加的检查各自执行、互不知道，同一个工具节点两边都挂时那一条检查跑两次，页面在人加的那一项下面写「M4 自带的检查器也跑这一条」。

### 5.4 GLM 通道包交来的（`dsh-glm-zcode`：`glm-hourness/glm-login`，经计价服务的 `loopDefaults`）

条目的数据与文字归 M6（m6:§8.2，`src/glm-llm/loop-defaults.ts`），本稿照 §3.4 换成自己的条目：

| # | id | 页面上的名字 | 什么时候 | 谁执行 |
| --- | --- | --- | --- | --- |
| 17 | `glm:peak-reminder` | GLM 高峰开始时提醒模型 | 高峰开始时 | GLM 通道包自己（`self`） |
| 18 | `glm:quota-on-command` | 看状态时读一次 GLM 额度 | 你敲 `/glm-status` 或 `/hourness` 时 | GLM 通道包自己（`self`） |
| 19 | `glm:quota-low` | GLM 额度快用完时告诉你 | `channel.quota-low`：5 小时或每周额度用到 80%，或照现在的速度一小时内会用完；只在 GLM 有新用量、上次读数满 15 分钟时读 | 循环板；账号一级，只告诉一个主 Agent 一次 |
| 20 | `glm:login-rejected` | GLM 登录失效时提醒你重新登录 | `channel.login-rejected` | 循环板；账号一级 |

### 5.5 本仓库自己的（人的条目的例子，不进产品）

自举开始、本仓库的开发改在 DSH 里由主 Agent 做之后，由人在主 Agent 的对话里加这几项（§7.1）；在那之前它们只是例子，`reading-digest` 照旧由 Kiro 钩子提醒。

| 名字 | 什么时候 | 做什么 |
| --- | --- | --- |
| ZCode 更新之后比一遍提示词与线路 | `loops.file-changed`，`path: C:\Program Files\ZCode\resources\app.asar` | 告诉主 Agent：`ZCode was updated (app.asar changed). Dispatch a task to extract the new bundle and compare the system prompt, tool texts and wire (headers, signing, quota) with docs/reference/zcode-verbatim.md and the current baseline; put the differences to the human with propose_to_human.` |
| DSH 更新之后核对插件契约并跑探针 | `loops.host-restarted`，`filter: {appChanged: {is: true}}` | 告诉主 Agent：`DSH was updated. Re-export the runtime packages into reference/ (docs/DEVELOPMENT.md §4), re-check the contract table of docs/DESIGN.md §2.4a, run npm run probe, and report what changed.` |
| 每周读 Anthropic 与 OpenAI 的文章 | 每周四 09:00（Asia/Shanghai；下一次 2026-11-05） | 告诉主 Agent：`Weekly reading (graph task reading-digest): read the new agent articles of Anthropic Engineering and the OpenAI Cookbook since the date in the last loop note, have a worker write the digest under .agents/tasks/reading-<date>/digest.md, propose what is worth changing, and record where you stopped with loop_note.` |
| 蓝屏或崩溃重启之后查主检出、工作树与在跑的运行 | `loops.host-restarted`，`filter: {crashed: {is: true}}` | 跑脚本 `docs/loops/scripts/u-<id>.ps1`（三行：`git status --porcelain=v1 -b`、`git worktree list --porcelain`、`npm run -s graph -- open`），`report: 'always'`，前面一段 `After a crash: check the main checkout, the worktrees and the runs that were going; restore or re-dispatch.` |

人自己会加的另一类例子：服务器巡查，每 30 分钟跑脚本 `docs/loops/scripts/u-<id>.ps1`（子 agent 写的十来行 PowerShell：请求服务器的健康地址，不是 200 就把状态码写到标准输出、以 1 退出），`report: 'on-failure'`，前面一段 `The server check failed. Tell the human in one line what failed; do not try to fix the server.`。脚本要用项目里已有的 `scripts/check-server.ps1` 时，条目的脚本就是一行 `& ./scripts/check-server.ps1`，被调的那个文件不在钉住的范围里，注意事项写明（§7.1）。

`loops.file-changed` 看的路径在项目之外时（上表第一项的 `C:\Program Files\ZCode\...`），条目进仓库之后在别的电脑上未必有这个目录：那台电脑上这一项列出、不跑，页面写「这一项看的 <路径> 在这台电脑上不存在」（§12）。

`reading-digest` 节点：它是一件定期的事，在两次之间挂在「进行中」（plain-ui 原 P4 的问题）。循环板上线、上面那一项加上之后，这个节点以带证据的完成关闭（证据写循环板条目的 id），以后每次的结论记在条目的批注里（§6.10），不再挂在图上。

### 5.6 主 Agent 自己设的提醒

主 Agent 仍带 DSH 的四个提醒工具（`schedule_create` 等，standard preset 挂载，web-app `presets/cordis.patch.yml`:38–39），可以给自己设「30 分钟后看一眼 CI」这类提醒。这些不是循环板的条目，页面在「主 Agent 自己设的提醒（DSH 自带）」一组里只读列出（`schedule.catalog()` 里绑在主 Agent 会话上、又不是循环板建的那些），写标题、下次与「在 DSH 的自动化任务页里管理」。它的提示文字不能以 `Loop board: ` 开头（§6.2 的规则）。

## 6. 运行

### 6.1 谁来跑

新行 `glm-hourness/loops`（源码 `src/loops/`，编排层包，默认 `disabled: true`，通过 L3 与第一批 L4 后启用）。每个宿主进程里它都注册工具、命令、投影与步 notice（§7、§8）；只有有会话控制器的进程提供服务 `glmHournessLoops` 并运行条目（§3.1 第一条）。

本节与 §6.2–§6.10 说的「项目目录」是 `<项目根>/.llm/loops/`（`d-rules-in-repo`，§9.1；0.4 是 `<userHome>/loops/projects/<项目键>/`）；「仓库里的条目」是 `<项目根>/docs/loops/`。

- 项目的运行锁：`<项目目录>/runner.lock`（§9.1），以 `wx` 独占创建，内容 `{pid, boot, startedAt, at, token}`（`boot` 为本机开机时刻，`Date.now() - os.uptime() * 1000` 取到分钟，同 M5 §5.3 锁的写法）。持有者每一拍（60 秒）以临时文件加改名的方式刷新 `at`。别的进程看到锁在、`at` 在 3 分钟以内、`boot` 与本机相差不超过 120 秒：不跑，页面写「另一个 DSH 进程在跑这块板」；否则把旧锁改名为 `runner.lock.stale-<毫秒>`（留痕），再重新创建。不用 `process.kill(pid, 0)` 判活（Windows 上 pid 会被复用，M7 0.3 为门禁锁也改掉了这一判法）。行卸载与宿主退出时删锁（只删 `token` 是自己的）。
- 运行锁的交接（评审 F33）：投递要在主 Agent 的会话打开着的那个进程里做，别的进程调 `resolveAgent` 会得到 `session/writer-held`（api-session-controller:243）。所以锁跟着主 Agent 的会话走：一个不持锁的进程看到持有者会话在自己这里打开（`agent/created`，或步 notice 看到它走步）时，以临时文件加改名写 `<项目目录>/handover.json`：`{pid, boot, session, at, token}`，之后每一拍刷新 `at`，会话关掉时删掉（只删 `token` 是自己的）。持锁的进程每一拍读它：`at` 在 3 分钟以内、`boot` 与本机相差不超过 120 秒、它说的会话不在本进程里打开、本进程手上没有正在跑的运行（命令、harness 动作、投递）时，写下 `state.json`、删锁，页面写「这块板交给了主 Agent 所在的 DSH 进程」；手上有运行时等它们结束再交（harness 动作至多 6 小时，期间照常处理事件，投不出的进 `held`，见 §6.4）。写交接文件的进程在它的下一拍照常抢锁；别的进程在 `handover.json` 新鲜、写它的不是自己时不抢（所以交出锁的进程不会在下一拍又抢回来）。两个进程都说主 Agent 的会话在自己这里时（不应发生：DSH 一个会话只有一个写者），后写 `handover.json` 的算数，`at` 过期的不算。那边一直不来要锁时（它的循环行没启用、`handover.json` 写不进，或它在交接之前就关了会话），持锁的进程不会一直卡着（评审 F36）：`session/writer-held` 的标记只管 5 分钟，过了就重试一次存着的消息，所以对这个会话的 `resolveAgent` 每 5 分钟至多一次；那边关了会话，下一次重试就投得出去。`elsewhere` 连着超过 5 分钟时页面与首页写「主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去」，行健康 degraded（§6.4 的表）。交接只看主 Agent 的会话；机器一级的锁不交接（它投递时也只是写收件箱，§6.4）。
- 什么时候开始跑一个项目：这个宿主里出现了这个项目的会话（`agent/created`，agent:581–585；项目按会话头的 `cwd` 算，session:1820–1826）；行激活时（读不到就在之后每一拍再试，直到读到为止），DSH 工作区登记表里的每个工作区（`workspaceRegistry.list()` 的各项的 `path`，dsh-workspace:454–460、90〔实读〕；从本行读得到〔未核实，同 V14〕）按 §2.1 算出项目根，项目里有主 Agent 持有者记录的（M3 的 `readHolder` 返回 `held`）也开始跑，所以桌面版刚启动、人还没打开会话时，事件照样处理。0.4 在这里读用户级目录的 `<userHome>/main-agent/*.json` 列出项目；`d-rules-in-repo` 把持有者记录搬进项目的 `.llm/`（路径由 M3 定，§17 M3 第 10 条）之后，用户级目录里没有项目清单了，DSH 自己的工作区登记表就是那份清单。登记表还没启动（`requireState` 抛错，dsh-workspace:934–937）或读不到时，项目只在它的会话出现时开始跑；到点的提醒不受影响，它们是 DSH 的任务，由 DSH 自己投。之后每 60 秒一拍（`setInterval`，`unref`），直到这个项目 10 分钟没有活会话、也没有持有者记录时停下并删锁。主 Agent 的会话是冷的（没有打开）时照样跑：到点的投递由 DSH 恢复会话（schedule:1576），事件的投递由循环行经 `sessionController.resolveAgent` 恢复（§6.4）。
- 机器一级的运行者：账号一级的两项（§3.4）只能在一处判，否则两个进程各读一次额度、各说一次。锁 `<userHome>/loops/machine/runner.lock`，写法同上。只在计价服务在、且它交来的条目里有 `channel.*` 事件的条目时去抢。它每一拍做两件事：看登录状态（M6-L3）；读用量流水新增的行、按门槛读额度（M6-L2）。产生的事件写进「最近一次有主 Agent 走过步的项目」的收件箱。
- 最近一次走过步：每个进程的步 notice 监听器（`agent/pre-step`）看到持有者会话走步时，至多每 60 秒一次把 `{projectKey, project, at}` 以临时文件加改名写进 `<userHome>/loops/machine/last-step.json`；后写的覆盖先写的，就是最近的那个。
- 主 Agent 的走步记录（评审 F24，§6.9 第 4 条用）：同一个监听器把 `{session, at}` 以临时文件加改名写进 `<项目目录>/main-step.json`，任何进程都写，后写的算数；至多每 60 秒一次，但计价服务的 `peak(上一次写下的 at)` 与 `peak(now)` 不同时（这一步跨进或跨出了高峰），当场写，所以每段高峰里的第一步一定留下。0.2 把「这段高峰里走过步」记在内存里：宿主在高峰里重启过，或主 Agent 在另一个进程里走步，持锁的进程就判成「没走过」。没有计价服务时不看段，只按 60 秒写。

### 6.2 时间：DSH 的定时服务与循环板自己的钟

| 条目 | 谁计时 | 到点时 |
| --- | --- | --- |
| 告诉主 Agent（`tell-main`），五种时间都行 | `dsh-schedule`：循环行为每一项建一个绑在主 Agent 会话上的任务 | DSH 把提醒当成一条 user 消息投进主 Agent 会话并叫醒它（schedule:1576–1598，`followup`），主 Agent 读到的是 DSH 的固定开头加上这一项的英文文字（schedule:1386–1418） |
| 跑脚本（`script`）与 harness 动作，一次、每隔、每天、每周 | 循环行自己的钟（`src/loops/clock.ts`，用 `src/loops/trigger.ts` 算下一次） | 循环行执行；按 `report` 或 harness 的结果决定要不要告诉主 Agent（§6.4–§6.6） |

为什么分开（三种做法，采用的放最后）：

1. 全部走 `dsh-schedule`，跑脚本的条目在主 Agent 收到提醒那一步之前跑脚本、把结果接在提醒后面：时区、cron、补跑都用 DSH 的。代价：每次到点都叫醒主 Agent，脚本过了也在人唯一的对话窗口里留一回合；服务器巡查每 30 分钟一次就是每天 48 回合「一切正常」。想不叫醒，只能在 `agent/pre-step` 里把领走的提醒拿掉，那会丢消息（agent-loop:101–110 领走的消息不放回收件箱，rules:§3.6 的同一个理由）。
2. 全部用循环板自己的钟：一套语义。代价：DSH 的时区、cron、夏令时与重启补跑要自己重写一遍；人在 DSH 的任务页上看不到这些到点的事；发送记录也用不上。这和编排方已经告诉人的「时间触发直接用 DSH 的定时服务」不一致。
3. 告诉主 Agent 的走 `dsh-schedule`，其余的用自己的钟（采用）：要叫醒主 Agent 的事，DSH 的投递正是要的效果；不该叫醒人的命令，不经过它。代价：命令与 harness 动作类的条目不支持 cron（自己的钟只做一次、每隔、每天、每周，夏令时规则照 DSH：缺的钟点跳过，重叠的取较早那次），以及两种钟各有各的补跑记录（都只补一次，§6.8）。

`dsh-schedule` 任务的绑定与对账（`src/loops/bind.ts`）：

- 一项对应一个任务：标题 `循环板 · <title>`（至多 120 个字符，schedule:96），提示文字的第一行固定 `Loop board: <id> (default of <插件> | added by the human). Change it on the loop board, not here.`，之后是这一项的英文文字；选择器按 §2.2 映射。`state.json` 的 `bindings` 记 `{entry, specDigest, scheduleId, sessionId, fingerprint, done?}`：`specDigest` 是这一项的标题、文字与时间（时区已按 §2.2 取定）的摘要；`fingerprint` 取自 DSH 上一次 `create` 或 `update` 返回的那条记录，是 `{kind, title, prompt}` 加上按种类的时间字段：`at` 的 `scheduledAt`，`every` 的 `everySeconds`，`daily` 的 `time`、`timeZone`，`weekly` 的 `time`、`timeZone`、`weekdays`，`cron` 的 `expression`、`timeZone`（记录的键见 schedule:256–312、356–365、411–421、463–472〔实读〕）。重复任务的 `scheduledAt` 每投一次都会变，所以不进指纹（`at` 种类除外，它的 `scheduledAt` 就是那一次的时刻）。
- 对账在这些时候做：开始跑一个项目时；每一拍；收到 `schedule/changed`（schedule:2231–2237，提交之后发出，没有载荷）；主 Agent 的持有者记录变了（M3 附录 §2.4 的 `readHolder` 按文件的 `mtimeMs` 与 `size` 缓存）；执行表变了（有一份 `contribute` 或人的条目写入）。
- 对账先定主 Agent 的会话（第 0 条），再按 `schedule.catalog()`（schedule:2129–2136：每条是记录加 `sessionId`、`status` 与 `lastDelivery?`）做四件事：
  0. 先定主 Agent 的会话：每次对账都重新调 `holderState(project)`（§6.4，`src/loops/holder.ts`：重读持有者记录，再查这个会话是否已归档、是否已知找不到、是否在别的进程里）。按结果分三种做法。0.3 写的是「不是 `ok` 时全删」，与 §6.4 表里 `elsewhere`、`unknown` 两行的「任务留着」相反；照字面实现，读不到归档状态时晨报、周报与巡检永远不建，主 Agent 的会话开在另一个窗口时每一拍硬删三条任务、连发送记录（评审 F35）。0.4：
     - `ok`，或 `unknown` 且原因为 `archive-unreadable`（知道持有者会话是哪个，只是读不到它归没归档）：做下面第 1–4 条。`unknown` 时绑在持有者会话上的任务一条都不删：第 3 条只改不删，第 4 条只认不删（见那两条）。
     - `elsewhere`，或 `unknown` 且原因为 `holder-unreadable`（持有者记录读不出，不知道主 Agent 是哪个会话）：不建、不搬、不改、不删，`bindings` 原样留着，到点照样由 DSH 投。页面这几项下面写「循环板此刻看不清主 Agent 的会话（<原因的人话>），这几项的提醒先不删」（`unknown` 的两种原因都写这一行，§6.4）；`elsewhere` 写「主 Agent 的会话在另一个 DSH 窗口里，交过去之后由那边接着管」，接手的进程在它的第一次对账里核对这些任务。`unknown` 时行健康 degraded（§6.4）。
     - `none`、`archived`、`not-found`（确知没有能收消息的主 Agent 会话）：不建；绑在原持有者会话上的循环板任务按下面「删任务的规矩」删掉（原因 `no-holder`、`holder-archived`、`holder-not-found`），`bindings` 清掉这几条；页面写「还没有主 Agent：在输入框打 /wish」「主 Agent 的会话已归档：在一个会话里打 /wish here」或「主 Agent 的会话找不到了：在一个会话里打 /wish here」。`none` 要连着两次对账、相隔至少 60 秒都读到「没有持有者记录」才删，正在被改名替换的记录文件不会被当成没了。`archived` 时 DSH 在归档那一刻多半已经删过（见下面「归档」一条），这里删的是剩下的。
  1. 该有的没有（新条目、新的主 Agent、任务被删了）：`schedule.create(主 Agent 会话 id, {title, prompt, <选择器>})`（schedule:2083–2112），把返回的记录记成 `fingerprint`。DSH 的 `create` 除子会话之外什么都不查（schedule:2254–2261 的 `reminderTargetRefusal` 只拒子会话），所以第 0 条是唯一挡住「建在已归档的会话上」的地方；`unknown`（`archive-unreadable`）时挡不住，宁可建上（偏向晨报照常来，同 §6.4 表里这一行偏向投出），行健康已在报。
  2. 绑在别的会话上（主 Agent 换了会话，持有者记录指向新会话）：先在新会话上建，再按「删任务的规矩」删旧会话上的（原因 `moved`；`schedule.delete({sessionId: 旧, id})`，schedule:2164–2182）。旧会话已经不是持有者，所以 `unknown`（`archive-unreadable`）时也删：读不到的是新会话归没归档，旧会话没用是确定的。旧任务的发送记录随之删掉（硬删除），全文留在 `removed-tasks.jsonl`；循环板自己的运行记录不受影响。
  3. 内容不对：catalog 里这一条的指纹与 `bindings` 里的不同（有人在 DSH 任务页上改了），或这一项的 `specDigest` 变了（插件更新了这一项、系统时区变了）。按条目改回或改成新的：`expected` 取 `schedule.list({sessionId})`（schedule:2120–2122，只返回这个会话活动任务的记录本身，没有 `sessionId`、`status`、`lastDelivery`）里 id 相同的那一条，调 `schedule.update({sessionId, id, expected, title, prompt, change: {kind, <选择器>}})`（schedule:2197–2224；`change` 只能有 `kind` 与对应的那一个键，schedule:1710–1716）。结果：`updated: true` → 记下返回记录的指纹；`updated: false` 且没有 `code`（DSH 判为规范化之后没变，schedule:1824–1829）→ 记下 list 里那条的指纹，不算改动；其余（`schedule_conflict`、`invalid_rule`、`schedule_not_found`、`schedule_ended`、会话的拒绝）→ `ok` 时按「删任务的规矩」删掉重建（原因 `repair`；`schedule_not_found` 时 DSH 里已经没有它，只重建）；`unknown`（`archive-unreadable`）时不删：`schedule_conflict` 按新取的 `list` 再试一次，仍不成就留着它，页面这一项写「DSH 里的这条提醒和循环板的不一样，此刻不重建，下一拍再试」，下一拍再从头试。0.1 拿 catalog 的一行当 `expected`，多出三个键，DSH 的整键解码一律返回 `invalid_rule`（schedule:74–77、1806–1815〔实读〕），改回从来不会成功（评审 F7）。只有第一种原因（外面改的）记一笔 `loop-drift`（`what: 'edited'`），页面在这一项下面写一行「在 DSH 的自动化任务页里改的不算数，已按循环板改回；要改：跟主 Agent 说」（同一项一天至多写一次）。
  4. 不认识的循环板任务（标题以「循环板 · 」开头、提示文字第一行逐字是循环板为某个条目 id 写的那一行、`bindings` 里没有：上一次的 `state.json` 丢了，或条目已删）：这一项还在、任务绑在主 Agent 的会话上、这一项此刻没有别的活着的绑定时才认下来写进 `bindings`（评审 F13）；否则按「删任务的规矩」删掉（原因 `entry-gone`、`duplicate`，或绑在别的会话上时 `moved`）。`unknown`（`archive-unreadable`）时绑在持有者会话上、又认不下来的不删，页面写一行「DSH 里多了一条循环板的提醒，此刻不删」，回到 `ok` 之后再判。
  - 删任务的规矩（评审 F35；删一条 DSH 任务连它的发送记录一起删，schedule:2164–2182，不可逆）：`bind.ts` 里只有一个函数 `removeTask(project, task, why)` 调 `schedule.delete`，上面第 0、2、3、4 条与下面「到点之后」都经它；它在两件事都成立时才删，不成立时返回 `kept` 并计数（L2 用例逐种钉住）。
    - 能证明是自己建的：`scheduleId` 在 `bindings` 里（循环板建它时记下的），或它是第 4 条认得的那种（标题与提示文字第一行都是循环板的写法；`loops:schedule-tools` 不让 agent 建这样的提醒，所以除了循环板，只有人在 DSH 任务页上照抄才会有）。主 Agent 自己设的提醒永远不碰。
    - 能说出它为什么没用，原因只有这几种：`moved`（绑的会话已不是持有者记录里的那个）、`entry-gone`（条目确知没了；见下一条，评审 F41）、`duplicate`（同一项另有活着的绑定）、`no-holder`、`holder-archived`、`holder-not-found`（第 0 条）、`repair`（第 3 条，只在 `ok` 时）、`not-delivered`（下面「到点之后」一条，只在 `ok` 时）。持有者状态为 `elsewhere`、`unknown` 时，绑在持有者会话上的任务不在其中任何一种里。
    - `entry-gone` 什么时候算确知（评审 F41）：条目不在执行表里有两种来由。确知没了，当拍就删：人删了它（`/loops delete`、人同意的删除提议，变更记录里有 `op: 'delete'`）；或交它的那个来源在这个进程里新交来的一份（`op: 'replace'`，`loop-contribution` 里有）里没有它。只是暂时不在，同 `none` 一样等：交它的来源在这个进程里还没交过（循环行先起来、M7 的运维行后到），或交过又撤回、还没再交（行重启，或 profile 改写之后的原地重组，`docs/DEVELOPMENT.md` §1.1）。这种时候只有同时满足两条才删：这个进程开始跑这个项目已满 5 分钟；连着两次相隔至少 60 秒的对账都看不到它。哪个来源交哪一项，按条目 id 的名字空间对上那个来源上一次交来的一份（`state.json` 的 `sources` 记着每个来源的名字空间与它最近一次交来与撤回的时刻）；对不上来源的按「还没交过」算。0.4 把这两种都当成确知，每次重启都可能删掉晨报、周报与巡检再新建，连发送记录一起丢掉。
    - 删之前先以 `harness` 身份在 `<项目目录>/removed-tasks.jsonl`（§9.1）追加一行并 `fsync`：`{at, project, scheduleId, sessionId, entry?, why, record}`，`record` 是这条任务在 `schedule.catalog()` 里的整条（含 `status`、`lastDelivery`）。写不进就不删，这一拍跳过这一条，行健康 degraded「没能记下要删的 DSH 提醒，先不删」。删完写一条 `loop-task-delete`（§6.10，只有 id、原因与 `deleted`）。人要找回一条，照 `record` 在 DSH 的任务页上建，或跟主 Agent 说；循环板不自动恢复。文件按行的 `at` 保留 30 天，每天第一拍裁掉更早的行。
    - 页面「最近跑过的」把每次删除列成一行「<名字> · 删掉了 DSH 里的旧提醒（<原因的人话>）」（§8.2 第 7 条）。
  - 一次性的条目投过之后，DSH 留着一条 `status: 'inactive'` 的记录。对账认得它：`bindings` 记 `done: true`，不再建，页面这一项写「已跑过（<时刻>）」。不活动的记录不参与上面的比较。
- 归档（评审 F12、F20）：DSH 把一个会话的活动任务当作这个会话还有活动（schedule:2044–2055），不带 `stopActivity` 归档会被拒（dsh-workspace:512–516、530–533），带上它归档时先把这个会话写进归档集合，再经 `workspace/session-stop` 让各方停掉它的活，定时服务因此删掉这个会话的全部活动任务（dsh-workspace:534–540、623；schedule:2056–2058、2273–2292）〔实读〕。所以主 Agent 的会话挂着循环板的任务时，归档它总要带 `stopActivity`，页头因此有一行灰字「主 Agent 的会话里挂着循环板的提醒；归档这个会话时 DSH 会先停掉它们，换到新的主 Agent 会话之后循环板再建」。
  - 0.2 在这里写「持有者记录仍指向已归档的会话时不在它上面重建（DSH 会拒绝给不能投递的会话建提醒）」，这是错的（评审 F20）：`reminderTargetRefusal` 只拒子会话（schedule:2254–2261），`create` 收下已归档的会话；`resolveAgent` 照样恢复它（api-session-controller:221–246，不查归档），消息进了它的收件箱，而 DSH 的归档门对已归档会话的每一步都回 `reject`（`ArchivedSessionGate`，api-session-controller:2508–2518、2528–2541），回合以 `blocked` 结束；`flush` 成功，DSH 记 `lastDelivery`、循环板记 `delivered`，页面写「已交给主 Agent」，其实谁也没看到。M3 的持有者记录在归档时不变（M3 附录没有归档的处理），所以 `mainAgentOf` 还会指着它。
  - 0.3 的做法：归档的事实从宿主的 `workspaceRegistry` 服务读（`super(ctx, "workspaceRegistry")`，dsh-workspace:376；`archivedSessionIds` 是它的 getter，dsh-workspace:506–508，服务没启动时抛「workspace registry is not started yet」，934–937〔实读〕）。读的地方只有一个函数 `holderState`（§6.4）：对账第 0 条、每一次投递之前（§6.4）、每一拍都调它。另在 `workspace/session-stop` 上挂一个监听（DSH 只在带 `stopActivity` 归档时发它，dsh-workspace:540、623；定时服务就是靠它删任务的，schedule:2056–2058），会话是某个项目的持有者会话时当场对那个项目做一次对账，不等下一拍；监听只读、不抛错。人取消归档（`unarchiveSession`，dsh-workspace:553–562）之后，下一拍 `holderState` 回到 `ok`，任务重建、存着的消息投出。
  - 任务因归档被删时，循环行分不出这次删除是归档还是人在任务页上删的；`holderState` 为 `archived` 时不记 `loop-drift`（这次删除是归档带来的），记一条 `loop-holder`（§6.10）；否则照旧记 `loop-drift`（`what: 'deleted'`），按第 1 条重建（`elsewhere`、`unknown`（`holder-unreadable`）时第 1 条不做，回到能做的状态之后再建）。
- agent 不能改循环板的任务，也不能冒充：规则 `loops:schedule-tools`，由循环行在 `tools/pre-execute`（tools:3321–3346）上注册，用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`，拒绝写进违规流水，同 M7 §3.2 写入门禁的做法）。拒绝三种调用：`schedule_update` 与 `schedule_delete` 的 `id`（tool-schedule:581–600、637–647）指向循环板的任务（在 `bindings` 里，或 `schedule.catalog()` 里这条的提示文字以 `Loop board: ` 开头；catalog 读不出时放行，由对账第 3 条事后改回）；`schedule_create` 的提示文字去掉首尾空白后以 `Loop board: ` 开头（评审 F13：否则主 Agent 建的提醒会被对账当成孤儿认下）。纠偏写「That reminder belongs to the loop board; changes go through the loop board (loop_propose), not the schedule tools.」。DSH 任务页走的是 Remote 的 `schedule.update`、`delete`，不经工具，靠对账第 3 条改回。这条规则列在规则板「写在代码里的规则」里（rules:§2.6 的表已有这一行）。
- 到点之后：DSH 投递成功时更新这条任务的 `lastDelivery`（`scheduledAt`、`deliveredAt`、`messageId`）并发 `schedule/changed`。循环行在对账时比较 `lastDelivery.messageId` 与上次记下的，变了就记这次运行（`loop-fired` 与结局 `delivered`，§6.10）。DSH 投递失败时不自动重试，下一次有任务写入或宿主重启才再试（schedule:1627–1640）；循环行看到某项的 `lastDelivery` 没变、而离「`scheduledAt` 与本进程开始跑这个项目的时刻两者中较晚的那个」已过 5 分钟时（评审 F25：停机之后 `scheduledAt` 早就过了，只从 `scheduledAt` 算会在 DSH 自己补投之前就动手，丢掉 DSH 的那次补投、或与它各投一次；DSH 的补投在启动时进行，schedule:590、656、687、821），记一次 `failed`（原因「DSH 没投出去」），错过的这一次由循环行按 §6.4 自己投一次。任务怎样处理看 `holderState`（评审 F35）：`ok` 时按「删任务的规矩」删掉这条、按同一规则建一条新的（原因 `not-delivered`）；`unknown`（`archive-unreadable`）时任务留着，只补投这一次，页面这一项写「DSH 没投出这一次，循环板补投了」；`elsewhere` 与 `unknown`（`holder-unreadable`）时不判这件事，任务原样留着（`elsewhere` 的接手进程从它开始跑这个项目的时刻重新起算 5 分钟，评审 F25 的规则）；`none`、`archived`、`not-found` 时任务已按第 0 条删掉。不用「改一下」去催：DSH 对规范化后等价的更新不写入、不重新计算（`dsh-schedule/README.zh.md`「使用此包」末段），催不动。

### 6.3 事件的收集：项目收件箱

各行交事件不能依赖跑这个项目的进程此刻在不在（另一个 DSH 进程持锁、宿主刚起来、项目还没开始跑），所以 `emit` 就是往项目目录里的收件箱追加一行，与谁在跑无关：

- `emit` 按 `cwd` 算出项目根，在 `write.lock`（§9.1）内往 `<项目根>/.llm/loops/events.jsonl` 追加一行（0.4 在 `<userHome>/loops/projects/<键>/`，`d-rules-in-repo` 改） `{id: 'ev-<16 位十六进制>', at, event, key, payload, session?, from: <交它的行>, cause?}` 并 `fsync`。`cause` 是运行号：这次 `emit` 发生在循环板执行某一项的 harness 动作期间时（异步上下文里有运行号，§6.5），取那个运行号；否则没有。
- 去重（评审 F22）：`state.json` 的 `keys` 记最近 7 天处理过的去重键与第一次见到的时刻，按事件的名字空间分开记数，满了丢同一名字空间里最早的（评审 F54）：`hourness.` 至多 5000 个，`env.` 至多 2000 个，`loops.`、`channel.` 各至多 1000 个，别的来源的名字空间各至多 1000 个（0.5 是全部合起来 5000 个，忙的一天里改文件的键能把 M7 的键挤出去，重放的一次交回就会再派一次审查）；一个名字空间满了、丢掉的键还不到 7 天时，行健康写一次 info「<名字空间> 的去重键 7 天内超过 <上限> 个，最早的已不再记」；同一个键再来时不跑，写一条 `loop-duplicate {at, project, event, key, from, firstSeen}` 进运行记录（§6.10），行健康写「近 24 小时有 N 个重复报来的事件没再跑」（info），页面「最近跑过的」列出它（「同一件事又报了一次，没再跑」）。同一个键 24 小时内第 4 次来时行健康 degraded「同一个去重键反复出现：<事件> <键>」：真正的重放（重启后补报、退路执行者与循环板各报一次）一个键至多来两三次，反复来的多半是交事件的一方把不同的几次发生写成了同一个键。本进程正跑着这个项目时 `emit` 当场查一次，返回 `duplicate: true`（也写这条记录）。键怎样写见 §3.1 与 §4 各表的「键」一栏：键说的是「这一次」，所以重启之后同一次交回再报一次只派一次审查，第二次启动的 `hourness.host-started` 照常触发重启对账。0.2 只计数、不留记录，键又交给 M7 的退路执行者去定（它只在一个进程里去重、只举了 `handback:<childId>` 一例），按主体写的键会让第二次真实的发生 7 天里悄悄不跑。
- 处理：跑这个项目的进程在 `emit` 当场（本进程）、收件箱文件变化时（`fs.watch`，别的进程）与每一拍，从记下的位置往后读；每行校验（事件在当前的事件表里、载荷合声明），读不懂的跳过并计数；处理完把位置（字节偏移与最后一个 id）写进 `state.json`。事件不在当前的表里（交它的那一份此刻在这个进程里没有交）时记 `expired`（原因「这个事件现在没有声明」）。文件超过 8 MiB 时在锁内改名为 `events-<时刻>.jsonl`，旧文件保留 7 天。
- 处理顺序按写入顺序。写入超过 7 天还没处理（宿主一直没跑这个项目）：记 `expired`，不跑。
- 漏报怎样被发现：`emit` 先在内存里重试三次（10 秒内，§3.1），一次锁竞争不会丢事件；三次都失败才是这里说的漏报。M7 的事件都先写进了项目图（交回、审查、停下有 M7 的批注，放行有目标的阶段，前进有 `advances.jsonl` 与证据），收件箱只是通知。漏了的那一次由图上的事实兜住：夜间巡检列出「完成却没有合入证据的写任务」「进行中超过 24 小时、没有活着派发的任务」（m7:§3.11.2），晨报的「例外」一节列出「有停下标记、却没有给人的待决」（m7:§3.10）；主 Agent 读到之后照常处理。循环板不另从图上反推事件，以免两条路各报一次、重复叫醒主 Agent。

循环行自己推出的事件（§4.1）与通道事件（§4.3）也写进收件箱（同一个格式，`from` 为 `glm-hourness/loops`，键照 §4.1、§4.3 的「键」一栏），这样它们与各行交来的走同一条路、同一份去重与重启补处理。所有事件都经同一个处理函数 `handleEvent(project, record)`：找出 `when.events` 含这个事件、`matchesFilter(entry.filter, record.payload, project)` 为真的条目（§2.2），按 §6.7 去抖、限次（动作为 `check`、或 `script` 带 `to: 'event-session'` 的，按 §6.7 的分组），再交给动作的执行者。拦路的事件（`gate.*`）不进收件箱：`emit` 对它们返回 `unknown-event`（「gating events are judged at the boundary by the rules board」），它们由规则板在执行边界当场判（§4.6）。

### 6.4 交给主 Agent

主 Agent 是谁：M3 附录 §2.4 的持有者记录，经 M3 导出的读法（`mainAgentOf` 与 `readHolder`）读；`d-rules-in-repo` 把记录搬进项目的 `.llm/` 之后，循环板只换 M3 给的定位函数，不自己拼路径（§17 M3 第 10 条）。循环板不缓存它：对账（§6.2 第 0 条）、每一次投递之前与每一拍，都经同一个函数 `holderState(project)`（`src/loops/holder.ts`）重新取，主 Agent 换了会话（`/wish here`）下一次投递就投到新会话（M3 的 `readHolder` 按文件的修改时间与大小缓存，重取不费事）。`holderState` 的结果与处理（评审 F20）：

| 结果 | 怎样判 | 事件消息 | 到点任务（§6.2） | 页面与首页 |
| --- | --- | --- | --- | --- |
| `none` | M3 没合入，或持有者记录不在（`readHolder` 返回 `none`：项目还没有主 Agent，或人 `/wish off` 了） | 存进 `held` | 不建；原持有者会话上的循环板任务按 §6.2 第 0 条删（连着两次对账都读到没有记录才删） | 「还没有主 Agent：在输入框打 /wish」 |
| `archived` | 持有者会话在 `workspaceRegistry.archivedSessionIds` 里 | 存进 `held`（原因 `holder-archived`），不调 `resolveAgent`、不投 | 删掉绑在它上面的（§6.2「删任务的规矩」，原因 `holder-archived`），不建 | 页头与 `homeLine`：「主 Agent 的会话已归档：在一个会话里打 /wish here」 |
| `not-found` | 上一次对它的 `resolveAgent` 返回 `session/not-found`（api-session-controller:237），且持有者记录从那以后没变 | 同上（原因 `holder-not-found`） | 同上（原因 `holder-not-found`） | 「主 Agent 的会话找不到了：在一个会话里打 /wish here」 |
| `elsewhere` | (a) 另一个进程写着新鲜的 `handover.json`（§6.1）；或 (b) 对持有者会话的上一次 `resolveAgent` 返回 `session/writer-held`（243），而且不到 5 分钟 | 存进 `held`（原因 `writer-held`），等运行锁交过去之后由那个进程投。(b) 的标记只管 5 分钟：过了 5 分钟、又没有新鲜的 `handover.json` 时作废，下一拍按别的行重判，存着的消息重试一次；又得 `writer-held` 就再记 5 分钟。所以那边一直不交接时，对这个会话的 `resolveAgent` 每 5 分钟至多一次（评审 F36） | 不建、不搬、不改、不删，原样留着，到点由 DSH 投（§6.2 第 0 条） | 前 5 分钟：「这块板正交给主 Agent 所在的 DSH 进程」。连着超过 5 分钟（中间重试又得 `writer-held` 不算断开）：本进程有正在跑的运行、在等它们结束再交时写「主 Agent 的会话在另一个 DSH 窗口里，这块板等手上的「<名字>」跑完就交过去」，其余写「主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去」（也是 `homeLine`），行健康 degraded |
| `unknown` | 原因 `archive-unreadable`：`archivedSessionIds` 抛错、不是数组或服务不在（V14）。原因 `holder-unreadable`：持有者记录读不出（`readHolder` 返回 `unreadable`，m3:§2.4；0.3 把它算作 `none`，`none` 会删任务，评审 F35） | `archive-unreadable`：照常投（偏向投出：读不到归档状态不该让整块板停下）。`holder-unreadable`：存进 `held`（原因 `holder-unreadable`），不知道该投给谁 | 绑在持有者会话上的一条都不删（§6.2 第 0 条）：`archive-unreadable` 时照常建与改回，`holder-unreadable` 时原样留着 | 这几项下面一行「循环板此刻看不清主 Agent 的会话（读不到它归没归档 / 读不出主 Agent 是哪个会话），这几项的提醒先不删」；行健康 degraded「读不到归档状态：主 Agent 的会话被归档时循环板不知道」或「读不出主 Agent 的记录：<原因>」 |
| `ok` | 以上都不是 | 照常投 | 照常 | — |

`held` 里每个项目至多 50 条，满了丢最早的并记 `expired`；回到能投的状态（`ok`，或 `unknown` 且原因为 `archive-unreadable`）之后按先后投；存了 24 小时还没投出的记 `expired`。`holderState` 每变一次写一条 `loop-holder {at, project, session?, state, reason?}`（§6.10），所以「这段时间消息没投，是因为主 Agent 的会话归档了」事后查得到。`archived`、`not-found` 也是「没有主 Agent」：循环板不另开会话、不自己挑一个会话（`d-one-main-agent`：主 Agent 由人用 `/wish` 指定），只告诉人怎样恢复。

消息怎样投（`src/loops/deliver.ts`）：

1. 消息是一条 user 角色的合成 notice：`createUserNotice('glm-hourness-loop', <标题>, <正文>, {hournessLoop: {entry, run}})`（`src/shared/dsh-min.ts`:462；与 M7 退路执行者同一个来源名，m7:§2.5 末段，模型分不出、也不必分出是哪一方投的），正文用 `<system-reminder>` 包起来（`docs/DESIGN.md` §6 第 1、3 条）。来源不是 `user`：DSH 把没写来源的 `followup`、`steer` 当成人的话（tool-goal:44–52），带上来源，循环板的消息就不会被当成人的授权（例如不能让模型因此 `create_goal`）。同一个主 Agent 2 秒内要投的几条合成一条，每段前面写各自的第一行。
2. 拿到活 agent：先调 `holderState`，不是 `ok`、也不是原因为 `archive-unreadable` 的 `unknown` 时按上表存进 `held`，不往下走。然后 `agents.get(会话 id)`（agent:596）；没有（会话是冷的）且这条要叫醒它时，`sessionController.resolveAgent(会话 id)`（api-session-controller:3037–3039，返回 `{agent}` 或 `{error}`；DSH 的定时服务用的同一个调用，schedule:1576）；不叫醒的条目不去恢复会话，留在 `held` 里，等这个会话下一次 `agent/created` 时投。`resolveAgent` 的错误（api-session-controller:237–244）：`session/not-found` → 记下这个会话找不到，`holderState` 从此为 `not-found`，这条进 `held`；`session/writer-held` → 记下这一刻，`holderState` 在之后 5 分钟里为 `elsewhere`（上表 (b)），这条进 `held`；其余按第 4 条重试。整个投递放在 `agents.withoutInitiator` 里（agent:414），与 DSH 定时服务的投递相同（schedule:1531）。
3. 按 agent 的状态与条目的 `wake` 选方式，与规则板的唤醒表一致（rules:§6.3）：
   - `wake` 为真，agent 在跑（`status` 为 `running`，agent-loop:790–793）：`steer`（进下一步并设唤醒标记，agent-loop:809–811）。0.1 这里用 `inject`，消息若在这一回合最后一次查收件箱之后、回合转为空闲之前进来，就要等下一回合，记录却写了已投（agent-loop:1037、892–898，评审 F15）；`steer` 的唤醒标记让它不会滞留。
   - `wake` 为真，agent 空闲、有 active 的 goal（`goals.get(agent)?.phase === 'active'`；`get` 对不是活实例的 agent 抛 `GoalError`，按没有 goal 处理）：`inject`，由驱动器开的下一轮第一步收到；不用 `followup`，进入下一回合收件箱的消息会被 goal-round-driver 当作竞争输入、作废这一轮的预约（goal-round-driver:249）〔推断：`inject` 不触发这条判定，同 rules:§15 V3〕。
   - `wake` 为真，其余空闲的 agent：`followup`（进下一回合并叫醒，agent-loop:806–808）。
   - `wake` 为假：`inject`（下一步才看，不叫醒，agent-loop:812–814）。
4. 确认落盘：`sessions.flush(agent.session)`（session:1950；DSH 的定时服务同样在投递后调它，schedule:1597）返回假，或上面任何一步抛错：按 1、5、15 分钟重试三次，每次重试之前重调 `holderState`（这期间主 Agent 换了会话就投到新的，会话被归档了就转 `held`）；仍失败记 `failed` 并报行健康 degraded（「没能把『<title>』交给主 Agent：<原因>」）。`session/not-found`、`session/writer-held` 不算失败，按第 2 条转 `held`：前者要人指定新的主 Agent，后者等运行锁交接（§6.1），重试解决不了，记成 `failed` 只会让消息丢掉。投递与记录是两次写入，中间崩溃可能重投一次：记录先写 `loop-fired`、投完再写 `loop-done`，重启后有 `loop-fired` 没有 `loop-done` 的运行按「可能已投」重投，消息第一行多写 `(may repeat run <run>)`。至少一次，不保证恰好一次，与 DSH 的定时服务同样（`dsh-schedule/README.zh.md`「已知限制」第 2 条）。

账号一级的条目（`scope: 'machine'`，M6-L4）：机器一级的运行者产生事件时，先把它追加进最近一次走过步的那个项目的收件箱（§6.1），再把这件事（条目 id 加期：额度是窗口名与重置时刻，登录是 `since`）写进 `<userHome>/loops/machine/told.json`；那个项目的运行者照常投递。次序取「先追加、后记已说」：中间崩溃时最多重说一次，而不是漏说。`last-step.json` 读不出或指向的项目没有主 Agent 时，事件留在机器一级的 `held`（至多 10 条，24 小时作废），等有主 Agent 走步时写进它的收件箱。指向的项目的主 Agent 会话归档了或找不到时，事件照样写进那个项目的收件箱，由那个项目的 `holderState` 按上表存着、页面写明；不改投给别的项目（M6-L4 要的是「最近一次有活动的那个」，归档的会话不会再走步，下一次有主 Agent 走步的项目就成了最近的那个，之后的事件投给它）。

到点类的消息由 DSH 投，循环行只在主 Agent 领到它的那一步加一句（`agent/pre-step` 的步 notice，`installStepNotice`，`src/shared/step-notice.ts`:28；agent-loop:902–927）：领走的消息里有来源 `schedule`（schedule:1594）、`schedule_id_json` 或 `reminders_json` 里的 id 在 `bindings` 里的，循环行在 `next()` 之后追加一行 `Loop run <run> for <entry>.`。0.4 在高峰停着时把这一行换成「推迟到高峰之后」；主 Agent 不受高峰影响之后（`d-main-agent-peak-exempt`）不再换，任何一档都照常做到点的事，其中要派 GLM 子 agent 的部分由规则板与 M7 按档位管。

交给事件里的那个 agent（`script` 与 `check` 的 `to: 'event-session'`，§2.3）：这种条目按「条目 + 会话 + `root`」分组运行（§6.7，评审 F46），一次运行里的事件都来自同一个会话，结果交给的就是这个会话。信封里的 `session` 的活 agent 在本进程里、正在跑时用 `inject`（它下一步就读到，不另设唤醒）；不在本进程、已经不跑了，或这个会话就是主 Agent 的会话时，照上面交给主 Agent，消息第一行之后多一句 `For session <session>, which is not running now.`（会话是主 Agent 的就不加）。不为它恢复冷会话、不叫醒它：子 agent 是派出去的一次活，叫醒一个做完了的子 agent 没有用处；不做档里被规则板排着的子 agent 收到 `inject` 也只是放回它的下一步，不让它开始干活。

### 6.5 harness 动作与列出的条目

一项 harness 条目被触发、过了去抖与限次之后（`src/loops/harness.ts`）：

1. 写 `loop-fired`。
2. 在一个异步上下文（`AsyncLocalStorage`）里调交来它的那一份的 `run(action, record)`，上下文里放这次的运行号。等结果，至多 6 小时（§3.1）。
3. 按结果：
   - `done` 且带 `tell`：把 `tell` 当作这一项的文字交给主 Agent（`wake` 取条目 `tell.wake`，条目没有 `tell` 时为真），结局 `delivered`。
   - `done` 不带 `tell`、条目有 `tell`：交条目的 `tell`，结局 `delivered`。
   - `done`，两边都没有：结局 `ran`。
   - `skipped`：结局 `skipped`，`reason` 原样，不发消息。
   - `failed`：带 `tell` 时交给主 Agent；结局 `failed`，`reason` 原样；循环行的行健康 degraded 一次「<id> 的 harness 动作失败：<reason 前 80 字>」。
   - `run` 抛错、promise 被拒、超时：同 `failed`，不发消息。
4. 写 `loop-done`。

同一项正在跑时（例如一次主干全量检查还没跑完），新的触发只留一次待跑，再来的合进这一次（§6.7 的不重叠）。

结局的口径（评审 F27，§17 写给交动作的一方）：动作跑完了就是 `done`，不论它发现了什么；要主 Agent 做事时在 `done` 里带 `tell`（例：主干全量检查跑完、主干是红的，返回 `done` 加「The full check on main … failed: …」）。`failed` 只给「动作没能跑完」：起不来、中途出错、拿不到要的锁或文件。循环板据此在 `failed` 时报行健康 degraded，`done` 时不报；主干红了是检查的正常结果，不是循环板或执行行的故障，不该让行健康变色。`skipped` 是「这次不用跑」（条件不满足、已经做过）。

`self` 条目不执行：循环板只把它列在页面上，执行它的那一行经 `recordRun` 报运行（§3.1），循环板写记录、更新页面的「上次」。

### 6.6 跑脚本：两块板共用的执行器

`src/loops/script.ts`（宿主专用，用 `node:child_process`、`node:crypto`、`node:fs`）是两块板共用的脚本执行器：编排方的接缝裁定把它归循环板，规则板导入它、自己不起进程，规则板的检测器与拦路脚本都经它跑。人加的检查（`check`，§2.3）也经同一个文件的 `runCommand` 跑，排队、环境、超时与输出的规矩与 `work` 一路的脚本相同（接缝核对时照编排方的裁定「Check entries seam」加）。0.4 的 `src/loops/command.ts` 与它的 `argv` 命令随 `d-boards-as-hooks` 换成这里（规则板 0.8 §5.3 引的 `command.ts` 随之改指本节）。

```ts
// src/loops/script.ts
import type { ScriptLang, ScriptRef } from './trigger.ts'
import type { AttachDetail } from './service.ts'

export const LOOPS_SCRIPT_DIR = 'docs/loops/scripts'   // 循环板的脚本目录；规则板的由规则板定
export const GATE_TIMEOUT_MS = 10_000                  // 拦路脚本的缺省超时（d-boards-as-hooks）
export const GATE_TIMEOUT_MAX_MS = 30_000
export const GATE_HARD_CAP_MS = 600_000                // 拦路脚本超时之后在后台接着跑的硬上限（d-script-timeout：10 分钟）
export const GATE_LATE_MAX = 8                         // 一个项目同时在后台接着跑的拦路脚本至多几个
export const GATE_CONCURRENT = 4                       // 一个项目同时在跑（还没超时）的拦路脚本至多几个；超时转到后台的不占（0.6，评审 F49）
export const GATE_QUEUE_MAX = 16                       // 拦路一路排队至多几个，再来的当场返回不带 late 的 timeout（0.6，评审 F49）
export const CHECK_CONCURRENT = 2                      // 一个项目同时跑的人加的检查至多几个，单独一队，不排在 work 脚本后面（0.6，评审 F50）
export const WORK_TIMEOUT_MS = 60_000                  // 不拦路的脚本的缺省超时
export const WORK_TIMEOUT_MAX_MS = 1_800_000
export const ON_ERROR_DEFAULT = 'allow'                // 拦路脚本超时或崩溃时的缺省，板上显示
export const SCRIPT_MAX_CODE_POINTS = 4000             // 人在对话里看得完的长度
export const SCRIPT_MAX_LINES = 100

/** 交给脚本标准输入的一个 JSON 对象（UTF-8，一行，写完即关闭标准输入） */
export interface HookEnvelope {
  readonly version: 1
  readonly board: 'loops' | 'rules'
  readonly entry: string
  readonly run: string
  readonly event: string                       // 事件 id；时间触发为 'time'
  readonly id?: string                         // 收件箱里的事件 id（ev-…）；拦路事件与时间触发没有
  readonly at: string
  readonly project: string                     // 项目根的绝对路径
  readonly session?: string
  readonly key?: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly merged?: readonly { readonly id: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> }[]
  readonly occurrenceAt?: string               // 时间触发：这一次本该在什么时候
}

export interface ScriptRequest {
  readonly project: string                     // 项目根，也是进程的工作目录
  readonly script: ScriptRef                   // 文件解析之后必须在 project 之下（不经符号链接出去）
  readonly envelope: HookEnvelope
  readonly purpose: 'gate' | 'work'            // gate 一个项目同时至多 GATE_CONCURRENT 个、排队至多 GATE_QUEUE_MAX 个；work 一个项目每块板同时一个（下文「几队」）
  readonly timeoutMs?: number                  // 缺省按 purpose；超过上限按上限
  readonly logFile?: string                    // 给了就把命令行、哈希与全部输出写进去
  readonly signal?: AbortSignal
}

export type ScriptResult =
  | { readonly kind: 'exited', readonly exitCode: number, readonly stdout: string, readonly stderr: string, readonly durationMs: number, readonly truncated: boolean }
  /** work：到时已结束整棵进程树，没有 late。gate：进程还在后台跑，late 给出它后来的结局；后台已满 GATE_LATE_MAX 时当场结束，也没有 late */
  | { readonly kind: 'timeout', readonly stdout: string, readonly stderr: string, readonly durationMs: number, readonly late?: Promise<LateScriptResult> }
  | { readonly kind: 'crashed', readonly reason: 'spawn' | 'signal' | 'io', readonly message: string, readonly durationMs: number }
  | { readonly kind: 'refused', readonly reason: 'script-changed' | 'script-missing' | 'outside-project' | 'too-large' | 'aborted', readonly message: string }

/** 拦路脚本超时之后的结局；promise 不被拒 */
export type LateScriptResult =
  | { readonly kind: 'exited', readonly exitCode: number, readonly stdout: string, readonly stderr: string, readonly durationMs: number, readonly truncated: boolean }
  | { readonly kind: 'crashed', readonly reason: 'signal' | 'io', readonly message: string, readonly durationMs: number }
  | { readonly kind: 'capped', readonly durationMs: number }   // 碰到 GATE_HARD_CAP_MS，已结束整棵进程树：「没跑完」

/** 不抛错，promise 不被拒。结果是什么意思由调用的那块板定：循环板的见下文，拦路的见规则板（rules:§6.7） */
export function runScript(request: ScriptRequest): Promise<ScriptResult>

/**
 * 一条 argv，不经 shell。queue 定排哪一队（0.6，评审 F50；0.5 只有 work 一路，人加的检查排在同一块板的 work 脚本后面）：
 * 'check'：循环板上人加的检查（§2.3 的 check），一个项目同时至多 CHECK_CONCURRENT 个，单独一队，不等 work 脚本；envelope 必有。
 * 'direct'：M4 自带的检查器（§5.3 的 self 条目由 env 行执行，m4:§6）：执行器不排队，同时跑几个由调用方自己管；envelope 可以没有（标准输入给空、立即关闭，
 * 环境里只有 HOURNESS_PROJECT_ROOT 一个 HOURNESS_*）。用不用 'direct' 由 M4 下一稿定（§17 M4 第 4 条）
 */
export interface CommandRequest {
  readonly queue: 'check' | 'direct'
  readonly project: string                     // 项目根
  readonly cwd?: string                        // 进程的工作目录：项目的主检出或它的一个工作树的根（git worktree list 里有的），缺省 project
  readonly argv: readonly string[]             // 已由 M4 的纯函数填好占位的那一条（§2.3）；argv[0] 由 resolveProgram 解析成绝对路径（下文，评审 F53）
  readonly envelope?: HookEnvelope             // queue 为 'check' 时必有
  readonly timeoutMs?: number                  // 缺省 WORK_TIMEOUT_MS，至多 WORK_TIMEOUT_MAX_MS
  readonly maxOutputBytes?: number             // 每路输出留多少，缺省 1 MiB，至多 4 MiB（M4 0.4 第 ⑤ 点要至少 1 MiB）
  readonly logFile?: string
  readonly signal?: AbortSignal
}
/** 结果同 ScriptResult：没有 late；cwd 不在项目里时 refused（outside-project）；queue 为 'check' 而没有 envelope 时 refused（aborted，消息写明） */
export function runCommand(request: CommandRequest): Promise<ScriptResult>
/**
 * 0.6（评审 F53）：把解释器名或 argv[0] 解析成绝对路径。只在 PATH 里的绝对路径目录中找，跳过解析之后落在项目根或它的任何一个工作树之内的目录与相对目录（含 '.'），
 * 不找进程的工作目录；Windows 上依次试 PATHEXT 里的后缀（名字已带后缀时只试它）。名字本身含 '/' 或 '\\' 时不在 PATH 里找，按 cwd 解析成绝对路径、要求文件在
 * （明写的路径人在命令行里看得到）。needsShell：解析到 .cmd、.bat（Node 不经 shell 起不了它们）。纯函数加文件系统读，不抛错
 */
export function resolveProgram(name: string, cwd: string, project: string, worktrees: readonly string[]): { readonly ok: true, readonly path: string, readonly needsShell: boolean } | { readonly ok: false, readonly reason: 'not-found' }
/** 文件字节的 SHA-256（64 位小写十六进制）；同意时与每次跑之前都用它 */
export function scriptSha256(bytes: Uint8Array): string
/** 提议时给人看的那一段（§3.1 的 AttachDetail）：一行说明、按 lang 标注的围栏代码块、注意事项；两块板的脚本提议都用它 */
export function scriptDetail(input: { readonly lang: ScriptLang, readonly text: string, readonly cautions: readonly string[] }): AttachDetail
/** 检查的那一段：一行「检查命令（来自项目图上的工具节点 <tool>，在改动所在的那份检出里跑，每次照这样跑）：」、装着 commandText(argv) 的围栏代码块、注意事项；mustShow 为那一行命令加每句注意事项 */
export function commandDetail(input: { readonly tool: string, readonly argv: readonly string[], readonly cautions: readonly string[] }): AttachDetail
/** 解释器的命令行，或一条 argv 按 Windows 的引号规则连成的一行：日志第一行与交给规则板 checkCall 的 args.command；脚本的路径写仓库里的那一个，不写私有副本 */
export function commandText(target: ScriptRef | readonly string[]): string
```

- 跑之前核对：读项目根下 `script.file` 的字节（至多 64 KiB，超了 `refused`、`too-large`）；路径经 `fs.realpathSync` 解析后要在项目根之下（否则 `outside-project`）；文件不在为 `script-missing`；`scriptSha256(字节)` 不等于 `script.sha256` 为 `script-changed`。核对过的字节以 `wx` 写成私有副本 `<项目根>/.llm/loops/run/<run>.<后缀>`，交给解释器的是这个副本，跑完删掉；崩溃留下的副本在下一拍清掉超过 1 小时的。所以核对之后、起进程之前文件再被改，跑的仍是人同意的那一份字节（验收第 30 条 (d)）。代价：脚本里取自己所在目录的写法（`$PSScriptRoot`、`__dirname`）指向副本的目录，脚本要按工作目录（项目根）找项目里的文件，注意事项写明（§7.1）。
- 解释器（按 `lang`，不经 shell）：`pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <副本>`、`node <副本>`、`python <副本>`、`bash <副本>`。解释器名先经 `resolveProgram` 解析成绝对路径再交给 `spawn`，解析出的路径写进日志第一行（0.6，评审 F53）：Windows 上 libuv 找程序时先看子进程的工作目录、只试 `.com` 与 `.exe`〔推断：libuv `src/win/process.c` 的 `search_path`，没有运行；V19〕，工作目录是项目根或一个工作树时，放在那里的 `node.exe`、`git.exe` 会顶替 `PATH` 上的那一个；自己解析、跳过项目之内的目录，就只会起 `PATH` 上项目之外的程序。找不到是 `crashed`（`spawn`，「找不到 <名字>：PATH 里项目之外的目录都没有它」）。`-ExecutionPolicy Bypass` 只管这一个进程：脚本人同意过、按哈希核对过，不再要 PowerShell 的签名策略〔未核实：Windows 上 `pwsh` 7 对 `-File` 的本地脚本缺省就放行，V18〕。`spawn(解释器, 参数, {shell: false, windowsHide: true, cwd: <项目根>, env})`，起来后 `os.setPriority(child.pid, PRIORITY_BELOW_NORMAL)`。
- 标准输入：`JSON.stringify(envelope)` 一行，写完关闭；脚本不读也行。
- 环境（拿不到 DSH 的凭证与 GLM 的 Key）：只给 `PATH`、`PATHEXT`、`SystemRoot`、`TEMP`、`TMP`、`USERPROFILE`、`HOME`、`APPDATA`、`LOCALAPPDATA`（与 0.4 和规则板 0.8 §5.3 的名单相同；规则板 0.9 起不再自己列，引用本节；`npm` 与 `git` 在 Windows 上要这几项），以及 `HOURNESS_BOARD`、`HOURNESS_ENTRY`、`HOURNESS_RUN`、`HOURNESS_EVENT`、`HOURNESS_PROJECT_ROOT`。名单之外一律不传，宿主的 `GLM_HOURNESS_CREDENTIAL_SECRET` 与 DSH 自己的变量都在名单之外。脚本自己要密钥时从文件读，那一行人在原文里看得到。
- 超时：缺省 `gate` 10 秒、`work` 60 秒，封顶 30 秒、1800 秒。结束进程一律是：只要 `ChildProcess` 还没 `exit` 就 `taskkill /PID <pid> /T /F`（其他平台对进程组发 `SIGKILL`）。`work` 到时就结束，返回 `timeout`；`gate` 到时返回带 `late` 的 `timeout`、进程转到后台，到 `GATE_HARD_CAP_MS` 才结束（下面「超时之后怎样」，`d-script-timeout`）。
- 几队，互不等待（§1.3）：
  - `gate`：一个项目同时在跑、还没超时的至多 `GATE_CONCURRENT`（4）个，再来的排队，排队的时间算进它自己的超时。超时转到后台接着跑的进程当场让出它的那一个位置，只算进 `GATE_LATE_MAX`（8），所以四段慢脚本不会把后面每一次拦路检查都挤成超时（0.6，评审 F49；0.5 没写，照字面实现时它们占着位置直到 10 分钟的硬上限，`gate.trunk-advance` 缺省拦下，主干就被挡住 10 分钟）。排队至多 `GATE_QUEUE_MAX`（16）个，再来的当场返回不带 `late` 的 `timeout`，由规则板按条目的 `onError` 处理（0.5 的「排满」没有数）。
  - `work`：一个项目每块板同时一个（按信封的 `board` 分，规则板的检测器不排在循环板一段 30 分钟的巡检后面），其余排队，排队不算超时。
  - `check`：循环板上人加的检查（`runCommand` 的 `queue: 'check'`），一个项目同时至多 `CHECK_CONCURRENT`（2）个，单独一队，不排在 `work` 脚本后面（0.6，评审 F50：0.5 让检查与循环板的脚本排同一队，一段 30 分钟的巡检脚本跑着时，每个检查的结果都在它之后才到）；排队不算超时。
  - `direct`：`runCommand` 的 `queue: 'direct'`，给 M4 自带的检查器（§5.3），执行器不排队，同时几个由调用方管（M4 0.4 自己定一个会话同时两个检查、一步至多等 20 秒，m4:§6）；环境、程序解析、超时与输出的规矩照本节。
- 输出：标准输出与标准错误分开收，`gate` 各留 64 KiB、`work` 与 `check` 各留 1 MiB（`direct` 按请求的 `maxOutputBytes`，缺省 1 MiB），多的丢掉并置 `truncated`；给了 `logFile` 时第一行写 `commandText(script)`、`sha256` 与 `resolveProgram` 解析出的程序路径，之后是全部输出。
- 结果不解释：`exited` 带原样的退出码与输出，什么码算过、算拦由各板定。循环板的：退出 0 为过；别的码与 `crashed` 为没过；`timeout` 为没跑完（结局 `unfinished`）；`refused` 为没跑（§2.3、§6.10）。拦路脚本的退出码、标准错误与 `onError` 的意思在规则板（rules:§6.7）。
- 起子进程的只有 `runScript` 与 `runCommand`（同一个文件）：`src/loops/` 与 `src/rules/` 里别处不出现 `node:child_process`（L2 静态检查，§13）。
- `runCommand` 与 `runScript` 的不同只有四处：排 `check` 或 `direct` 一队（上面「几队」）；没有文件可核对，执行的就是请求里的 argv（钉住的是条目里的 `argv`，每次跑之前由循环板与工具节点比，§2.3）；工作目录可以是项目的一个工作树（`cwd` 经 `fs.realpathSync` 解析后要等于主检出或 `git worktree list --porcelain` 里的一个根，结果按项目缓存 60 秒，否则 `refused`、`outside-project`）；`argv[0]` 先经 `resolveProgram`（`cwd` 取这次的工作目录，工作树取上面那份缓存）解析成绝对路径，再 `spawn(<解析出的路径>, argv.slice(1), {shell: false, ...})`（0.6，评审 F53；0.5 写「按 `PATH` 与 `PATHEXT` 找」，那是 shell 的找法，`spawn` 不照它找）。解析到 `.cmd`、`.bat`（`needsShell`，例 `npx` 解析成 `npx.cmd`）时不起进程，结果是 `crashed`（`spawn`），原因写「这条命令要经 cmd 才能跑，请在工具节点里写成能直接起的程序（例 node 加脚本路径）」：Node 不经 shell 起不了这两种〔推断：Node 18.20.2、20.12.2 之后的安全修正，起了会得到 `EINVAL`，V19〕，在起进程之前判出来，结果每次一样。解析不到是 `crashed`（`spawn`，「找不到 <名字>」）。

循环板自己怎样用它（`src/loops/run.ts`）：

- 一项脚本条目触发、过了去抖与限次之后，先问规则板（§6.9 第 1 条），放行了再 `runScript({project, script, envelope, purpose: 'work', timeoutMs: timeoutSeconds * 1000, logFile: <项目目录>/logs/<entry>/<时刻>.log})`。信封的 `board` 为 `loops`，`event`、`payload`、`merged` 取这次运行的事件（时间触发为 `time` 与 `occurrenceAt`）；`to: 'event-session'` 的脚本，这次运行的事件都来自同一组（同一个会话与 `root`，§6.7，评审 F46）。
- 一项检查条目同样先问规则板，再：经 M4 的读法取工具节点此刻的命令，与条目里的 `argv` 不同或取不到时 `refused`（`check-changed`、`check-missing`，§2.3），不跑；相同时经 M4 的纯函数按这次运行的事件填好占位（例 `{files}` 换成这一组事件的 `files` 里合 `filter` 的那几项的并集；以 `-` 开头的文件名由 M4 的纯函数前面加 `./`，免得被当成选项，§17 M4 第 4 条，评审 F53），`runCommand({queue: 'check', project, cwd: <这一组的 root，没有时项目根>, argv, envelope, timeoutMs, logFile})`。一次运行只含一组的事件（§6.7 的分组，评审 F46），所以 `cwd`、文件与交给谁都是那一组自己的；0.5 按条目合并，两个工作树里前后脚的改动只在先来的那个工作树里跑一次。M4 的读法或纯函数不在（M4 没合入、行没启用）时 `refused`（`check-missing`），页面写「跑检查要项目环境那一部分启用」。
- 交给主 Agent（或事件里的那个 agent，§6.4 末段）的结果：一行 `` `<commandText>` exit <码>（<用时>）``（超时写 `did not finish: timed out after <秒> s`，起不来写 `could not start: <原因>`），下面至多 40 行、4000 个字符的标准输出末尾，没过时另接标准错误的末尾；整段先过 `redactSecrets`（M5 的 `src/data/secret-shape.ts`；M5 没合入时用同目录 `src/loops/redact.ts` 里同一组模式，M5 合入时删掉换成它），密钥形状的串换成 `[redacted]`；再接 `Full output: <日志路径>`。指标流水只记退出码、用时与字节数，不记输出。
- `refused`：不跑、不发消息，结局 `refused`，原因原样；`script-changed`、`script-missing`、`check-changed`、`check-missing` 时页面「要你看一眼的」写一行，行健康 degraded 一次，直到人同意新的原文（§7.1 的 `repin`）或文件、节点改回原样。
- 日志按条目保留最近 50 份或 7 天。

代替影子期的东西：人同意即生效、不试运行（`d-boards-as-hooks`：「同意了直接运行就行」）。影子期原来给的那一层安全，在循环板上由四样接住：每一项在板上写明超时多久、超时或崩溃时怎样（§8.2）；内容哈希，改过就不跑（本节）；页面与周报里看得到它跑了几次、结果怎样（§8.2 第 7 条、§6.11）；随时能删（`/loops delete`，7 天内能恢复，§7.2）。`docs/CHARTER.md` §3.2 第 3 条与 §6 由规则板 0.9 同批改写，本稿只引用。

为什么钉住字节、执行副本（两种做法，采用的放最后）：

1. 跑之前核对文件的哈希，再照路径交给解释器：简单。代价：核对与执行之间文件可以被换掉；拦路的脚本每次工具调用都跑，这个窗口天天都在。
2. 核对读到的那一份字节，写成私有副本再执行（采用）：执行的就是核对过的字节。代价：脚本拿不到自己在仓库里的位置，要按工作目录找文件；每次多写、多删一个小文件。

超时之后怎样（人定的 `d-script-timeout`，2026-10-30，人回「没问题」：「拦路脚本超过超时（默认 10 秒）时照条目写的办法处理（默认放行），活不卡住；脚本不杀，后台接着跑，上限 10 分钟……」；机制归本节，拦路的含义归规则板）：

- 拦路的脚本（`purpose: 'gate'`）过了它的超时（缺省 10 秒）：`runScript` 当场返回 `timeout`，调用方照条目的 `onError` 处理（缺省 `allow`，工作不被卡住）；进程不杀，转到后台接着跑，直到它自己退出或碰到硬上限（`GATE_HARD_CAP_MS`，10 分钟）。`timeout` 结果里带 `late`：一个 promise，给出它后来的结局（`exited` 带退出码与输出，`crashed`，或碰到硬上限被结束的 `capped`）。后台接着跑的拦路脚本一个项目至多 8 个，它们不占 `GATE_CONCURRENT` 的位置（上面「几队」，评审 F49）；满了时新超时的那个在超时那一刻就结束，`timeout` 不带 `late`。调用方给的 `signal` 在超时之后中止时，执行器结束这个后台进程的整棵进程树，`late` 给出 `crashed`（`signal`）。迟到的结局与「后台已满」怎样记、什么时候当场告诉主 Agent、措辞与通道，都归规则板（rules:§6.7「超时之后」、§6.4「Late block」一段），本节不重述。
- 拦在难以退回的一步之前的（主干前进之前），超时或崩溃时缺省拦下，不是放行：事件的声明带 `gateOnErrorDefault: 'block'`（§3.1，由声明它的规则板定哪几个是这种），条目没写 `onError` 时取它；别的拦路事件缺省 `allow`（`ON_ERROR_DEFAULT`）。
- 不拦路的脚本（`purpose: 'work'`，循环板的条目）有它自己的超时（缺省 60 秒，人的条目可设 5–1800 秒）：到时结束整棵进程树，结局 `unfinished`，不论 `report` 是哪一种都交给主 Agent（那一行写 `did not finish: timed out after <秒> s`，页面写「没跑完：超过 <秒> 秒」）；这次运行合进来的事件不丢，留在这一项的待跑里（同 §6.7 限次攒着的那一份，至多 100 个），下一次触发时一起再跑；时间触发的到下一个时间点照常再跑。
- 次数进报告：循环板自己的脚本每超时一次是一条结局为 `unfinished` 的 `loop-done`（§6.10），周报列出最近 7 天超时 3 次以上的条目并提议修它（§6.11）；拦路脚本的超时、迟到的拦下与碰到硬上限由规则板记、交给周报（rules:§6.7「超时之后」末条、§10.5）。

为什么拦路的脚本超时后不杀（两种做法，采用的放最后）：

1. 到时就杀，照 `onError` 放行或拦下：最简单，没有后台进程。代价：慢一点的检查永远给不出结论，放行之后谁也不知道它本来会不会拦。超时一律拦下也不取（`d-script-timeout` 写明不采用）：脚本一卡住活就全停。
2. 到时照 `onError` 先放过去，脚本接着跑到硬上限，迟到的「拦下」当场告诉主 Agent（采用，人定的 `d-script-timeout`）：工作不被卡住，慢的检查也还有用，迟到的结论有人接。代价：后台最多多出 8 个进程；放过去的那一步可能要退回，难退回的那一种所以缺省拦下。

### 6.7 去抖、限次与自己触发自己

- 去抖：一项收到事件后等 `debounceSeconds`，这段时间里再来的同一项事件合进同一次运行，交给 harness 动作的在 `merged` 里，消息里按先后列出（至多 20 个，多的写「还有 N 个」）。缺省：插件的事件条目 5 秒，人的事件条目 30 秒（0.1 一律 30 秒，验收要的 10 秒因此做不到，评审 F8）。到点类的条目不去抖（DSH 自己把同一会话同时到期的几条合成一批，schedule:1571）。
- 限次：一项每小时至多跑 `maxPerHour` 次，缺省插件的 30、人的 6（按组算的两种是每组 30，见下面「按组」）。超了的触发记 `suppressed`（原因 `rate`），事件不丢：攒着，下一个整点之后的第一次运行把它们一起合进去（同一项至多攒 100 个，多的丢最早的并计数）。脚本没跑完（`unfinished`，§6.6）的那一次合进来的事件放进同一份待跑，下一次触发时一起再跑。页面这一项写「一小时里触发了 N 次，后面的合进下一次」。插件的条目被限次，说明哪里在打转，循环行的行健康 degraded。
- 不重叠：同一项正在跑或正在等投递时，新的触发只留一次待跑。
- 按组（0.6，评审 F46）：动作为 `check` 的事件条目，与动作为 `script`、`to: 'event-session'` 的事件条目，上面的去抖、合并、不重叠、待跑与限次都按组算，不按条目。一组是（条目、信封的 `session`、载荷的 `root`）：没有 `session` 时这一段算空串，没有 `root` 时算项目根。每一组的运行用它自己的 `root` 作工作目录（检查）、它自己那几个事件的 `files` 的并集填 `{files}`，结果交给它自己的会话（§6.4 末段）；脚本的信封里 `session` 与 `merged` 都是这一组的。限次按组：这种条目的 `maxPerHour` 说的是每一组一小时至多几次，缺省 30（与插件条目的缺省相同：它们跟着 agent 改文件的节奏走，6 次会让一个忙着的子 agent 一小时里只收到 6 次检查结果）；页面这一项写「每个会话、每份检出各算，一小时至多 <n> 次」。所有组共用这一项的执行队（检查的 `CHECK_CONCURRENT`、脚本的 `work`，§6.6），所以组再多，机器上同时跑的也不多。一项同时有待跑或在跑的组至多 32 个，第 33 个组的触发记 `suppressed`（原因 `groups`），页面这一项写「同时改文件的会话太多，有 N 次没跑」，循环行的行健康 info；一组 1 小时没有事件、也没有待跑时丢掉，它的限次计数随之清零。待跑与限次存在 `state.json` 的 `pending`，键是条目 id 加组（§9.1），所以重启之后每一组的待跑仍在自己的组里。别的条目（`tell-main`、`harness`、`to: 'main'` 的脚本、时间触发的检查）照旧按条目算：它们的结果都交给主 Agent，合成一次正是要的。0.5 一律按条目，并行的两个子 agent 30 秒内各改一次文件，只在先来的那个工作树里跑一次、只告诉它，另一个的改动没被检查，也没有任何记录说出这件事。
- 自己触发自己：一次运行自己的执行直接引起的事件，10 分钟内又触发同一项时不跑，记 `suppressed`（原因 `self-loop`），页面写「这一项触发了自己，已停下这一次」。「直接引起」只认两种，都由 harness 自己看得见：在这一项的 harness 动作执行期间交来的事件（`emit` 从异步上下文取到运行号，§6.3）；这一项的脚本在跑的时候或跑完 60 秒内发生的 `loops.file-changed`。0.1 还把「主 Agent 被这一项叫醒之后那一回合里发生的事」算作这一项引起的；那样会挡住正常的修复：全量检查没过 → 主 Agent 修好合入 → 主干前进，这一次必须再检查，却会被当成自己触发自己。所以经过主 Agent 一回合的链不算，打转由限次兜住（打转时一小时至多 30 次或 6 次，行健康报出）。不对整条因果链设长度上限：设计放行 → 派活 → 交回 → 派审查 → 合入 → 全量检查，本来就是一条连着的正常的链。

### 6.8 漏跑与重启

| 情形 | 怎样发现 | 补法 |
| --- | --- | --- |
| DSH 任务在宿主停机时到了点 | DSH 自己：重启后每个重复任务只补最近错过的一次，一次性的照投（`dsh-schedule/README.zh.md`「概述」；schedule:590、656、687、821） | 不另补；补投的提醒带 `occurrence_at`，循环行记录时标 `late` 与晚了多久 |
| 循环板自己的钟管的条目在停机时到了点 | 起来时 `nextDue < now` | 只补一次，记 `late`；之后从现在起算下一次 |
| 收件箱里停机前没处理完的事件，与停机期间别的进程交进来的 | 位置之后还有行 | 按先后处理；超过 7 天的记 `expired` |
| 停机期间文件变了、高峰变了 | 起来时与 `state.json` 里记下的值比 | 各补一次（§4.1 的「停机期间」一栏） |
| 有 `loop-fired` 没有 `loop-done` 的运行 | 起来时读记录 | 投递类按「可能已投」重投一次；脚本类重跑一次，记 `late`（脚本可能跑过一半：`loop_propose` 的 `cautions` 把这一句交给人看，§7.1；重跑之前照常核对哈希）；harness 动作类不重跑，记 `failed`（原因「宿主在动作执行中退出」）：harness 动作由交它的那一行自己幂等（M7 按图上的批注，m7:§3.9.1、§3.11.2），它的事件若需要重做，那一行会再交 |
| `state.json` 丢了或坏了 | 读不出 | 按 §9.3 重建；收件箱的位置取文件末尾（这一次不补处理），记一笔 `state-reset`，页面写「循环板的运行状态坏了，已重建；停机期间的事件这次没有补」 |

`loops.host-restarted`：循环行开始跑项目时读 `state.json` 的 `host`（上一次的 `{pid, boot, startedAt, cleanExit, appStamp}`），写入这一次的，并在行卸载与宿主退出的清理里（`ctx.effect` 返回的函数）写 `cleanExit: true`。上一次存在而没有 `cleanExit` 就是 `crashed`（蓝屏、断电、被强杀；Windows 关机时 DSH 若没走到清理，也会算成这一种，页面说成「上次没有正常退出」）。`appStamp` 是 DSH 程序文件的大小与修改时间（§10.2 V6）。

### 6.9 与高峰模式、规则板

规则板管「让不让做」，循环板不另写高峰的判断，档位只经规则板的高峰模式服务读（`glmHournessPeakMode` 的 `stateFor` 与 `stateForProject`，rules:§7.2；规则板 0.8 新加的 `peakHoldFor` 是给 M7 的空转判定用的，循环板不读，rules:§10.7 循环板一条第 8 点），从不读规则板的文件（验收第 14 条的静态检查）。0.4 还读 `glmHournessRules` 的 `heldForPeak`，在不做档的高峰里攒着给主 Agent 的消息；人定主 Agent 不受高峰影响之后（`d-main-agent-peak-exempt`：「主Agent应该不受高峰影响，随时回复的」），给主 Agent 的东西任何一档都照常投，循环板不再读 `heldForPeak`（第 2 条）。五处接缝：

1. 循环板跑的脚本与检查先经规则板判定：每次运行 `script` 或 `check` 之前调规则板的库入口 `checkCall({tool: 'pwsh', args: {command: commandText(<条目的 script，或填好占位的 argv>)}}, {project: <项目根>, signals: {'glm-peak': <计价服务的 peak(now)>}, glmSpend?: <条目的 glmSpend>})`（rules:§9.4；两者在同一个包里，直接导入 `src/rules/check.ts`；`commandText` 写解释器与仓库里的脚本路径，例 `pwsh -NoProfile -NonInteractive -File docs/loops/scripts/u-1a2b3c4d.ps1`，人写的规则按路径就认得出它，§6.6）。高峰模式管「重活」的那一半由此管到循环板的脚本：自报 `glmSpend` 的脚本在少做、不做档的高峰里照规则板的附属条目排队（rules:§3.6）。规则板 0.9 的 `checkCall` 入参没有改（rules:§9.4 的 `checkCall(call, options)`）；它推出 `gate.tool-call`、照常跑命中的拦路脚本（rules:§6.7「`checkCall` 里」一段、§9.4），所以循环板的一次运行之前可能多等命中的拦路脚本里最长的那个超时（缺省 10 秒，至多 30 秒）。条目没写 `glmSpend` 时不带这个选项（`CheckOptions.glmSpend` 只收 `optional`、`necessary`，0.1 传的 `'none'` 不是合法值，评审 F10）；计价服务不在时不给 `signals`，`checkCall` 自己读心跳。不带 `session`、`role`、`model`、`stage`：循环板的命令不是哪个会话发的，所以带主体的规则一律不命中（rules:§9.4 的表），管得到它们的只有不带主体的规则与自报 `glmSpend` 的那两条附属条目；页面在「循环板自己的规矩」里写明这一点。结果：放行、只告知、只记录 → 跑；排队 → 记 `deferred`，每 5 分钟再判一次，放行了就跑，24 小时还没放行记 `expired`；拦截 → 记 `blocked` 与规则 id，不跑，页面写「被规则『<标题>』拦下」。规则板的库导入失败或判定抛错时照常跑，记一笔 `rules-unavailable`（规则板自己的故障偏向放行，同 rules:§9.4 与 M6 §7.2）。所以人设的「代码冻结期间不跑发布脚本」之类的规则也管得到循环板。
2. 给主 Agent 的消息任何一档都照常投（`d-main-agent-peak-exempt`）：0.4 在这里问 `heldForPeak(主 Agent 会话)`，不做档的高峰里为真时攒着事件消息、单解除之后合成一条投出（评审 F6、F23 的做法）。人定主 Agent 不受高峰影响之后，主 Agent 的会话不会再被不做档停住，这一问永远为假，留着就是死代码（`AGENTS.md`），所以删去，连同结局 `held` 的「高峰停着」一种与那一行 `Held during GLM peak (level stop) since <time>.`。高峰模式在不做档里排的是子 agent 的活与重活（rules:§3.6 的不做一行：在跑的 GLM 子 agent、派 GLM 子 agent 的调用与自报花 GLM 积分的脚本），循环板投给子 agent 的只有 `to: 'event-session'` 的脚本结果，那一路只用 `inject`、不叫醒（§6.4 末段），也不用问 `heldForPeak`。
   - DSH 到点投来的循环板提醒同样照常：主 Agent 领到它的那一步只加 `Loop run <run> for <entry>.`（§6.4 末段），0.4 换成「推迟到高峰之后」的那一行删去。晨报、周报与巡检在高峰里照常出，其中要派 GLM 子 agent 的部分由 M7 的派活工具照规则板给的上限办（rules:§3.6、m7:§3.1.2）。
3. 档位怎样显示：页面与 `view.json` 写的档位取 `glmHournessPeakMode.stateForProject(<项目根>)`（rules:§7.2 的 `PeakModeState`：`level`、`origin`、`peak`、`until`、`glmWorkerCap?`；按目录算项目键，不要求本宿主上有这个项目的活会话）。0.2 取「本宿主上的任意一个活会话」的 `stateFor`，没有活会话时就显示不了、第 14 项也判不了档位（评审 F23）。`stateForProject` 返回 `undefined`（规则行没有状态目录）或服务不在时，页面写「档位在规则板上看」。
4. 高峰结束（第 14 项；评审 F5、F34，M6-R5，编排方「高峰里等高峰结束」的接缝裁定）：`loops.peak-end` 的 harness 动作由循环行自己执行（`src/loops/peak.ts`），收到 `edge` 为 `end` 的 `channel.peak-changed` 时按顺序取第一条成立的。下表的 `{end}` 由 `peak.ts` 自己填，是事件的 `boundary` 按宿主时区写成的 `HH:MM`。
   | # | 情形 | 结果 |
   | --- | --- | --- |
   | 1 | `holderState` 为 `none`、`archived`、`not-found`，或为 `unknown` 且原因为 `holder-unreadable` | `skipped`，「没有能叫醒的主 Agent」；原因已在页头或这一项下面（§6.4）。因高峰停住的自动推进留在原来的会话里，按 M7 自己的规则等人说话 |
   | 2 | `holderState` 为 `elsewhere` | 这次运行记 `held`（原因 `writer-held`）。存进 `held` 的是「再判一次 `loops.peak-end`」（`{rerun: 'loops.peak-end', event: <事件 id>, run}`），不是一条消息；不调 M7 的动作。运行锁交给主 Agent 所在的进程之后（交出的进程先写下 `state.json`，`held` 跟着过去，§6.1），或 `elsewhere` 解除之后（§6.4 表里 (b) 的 5 分钟），持锁的进程从第 1 行重新判一次，运行号不变；24 小时没判成记 `expired`。所以 `execute.resume-drive` 总在主 Agent 的会话所在的进程里调，两个进程合起来至多一次 |
   | 3 | 执行行交来的那一份的 `actions` 里有 `execute.resume-drive` | 先让主 Agent 的活 agent 在本进程里：`agents.get(会话)` 有就用；没有（会话是冷的，例如宿主在高峰里重启过）而 `main-step.json` 说它这段高峰里走过步（或读不出，同第 8 行的算法）时，经 `sessionController.resolveAgent` 恢复它（§6.4 第 2 条同一个调用；`session/not-found`、`session/writer-held` 照 §6.4 转成第 1、2 行，别的错误按没恢复成往下判）；冷会话、这段高峰里一步也没走时不恢复、不调，直接往下判（它这段高峰里没开过目标轮，M7 就没在这段高峰里停住它；第 8 行会跳过）。会话是冷的、档位读得出且为无影响时同样不恢复、不调，直接往下判（评审 F40 给的可选一条，只为省下恢复一个冷会话；第 6 行会跳过）。会话是热的（`agents.get` 有它）时任何一档都调：人在高峰中途把少做改成无影响时，M7 在改档之前停住的 goal 还停着，只看此刻的档位就会漏掉它，要等 M7 自己在高峰结束 5 分钟后复查（m7:§3.9.5）；热会话上的这一次调用不花恢复的代价，动作又幂等（0.6，评审 F48；0.5 对热会话也跳过）。会话是冷的、又在高峰中途改成了无影响的那一种（主 Agent 的会话在高峰里关着，人又改了档），由 M7 在高峰结束 5 分钟后的复查或下一次打开会话时的 `agent/created` 接上（m7:§3.9.5、§3.9.1 `hourness-peak-wait` 一行），只晚几分钟，不丢。然后恰好调一次那一份的 `run('execute.resume-drive', <这次事件>)`（即 `glmHournessExecute.runAction`；同 §6.5，异步上下文里是这次的运行号），等至多 60 秒。除了上面「冷会话、读得出且为无影响」那一条，不看档位、不先读 goal：动作只恢复 M7 自己以高峰等待原因码停住的 goal，幂等（§17 M7 第 6 条）；M7 0.4 的这个动作要持有者的活 agent 在调用它的进程里（不在时返回 `skipped`「main agent is not open in this DSH process」，m7:§2.5 接口第 2 条），所以由循环板先恢复会话。<br>`done` → 这次运行 `done`，`tell` 取结果里的 `tell`，没有时为 `GLM peak hours ended at {end}. The harness resumed the drive that waited out the peak; continue with the work you moved.`；不再往下判。<br>`skipped` → 这个冷会话是本行刚恢复出来的，就再读一次 `goals.get(agent)`：已是 active（恢复引起的 `agent/created` 上 M7 照它自己的表先接上了推进，m7:§3.9.1），这次运行 `done`，原因记「打开会话时 M7 接上了推进」，`tell` 为 `GLM peak hours ended at {end}. The drive is running again; continue with the work you moved.`，不再往下判（评审 F40）；别的（会话本来就是热的，或读到的不是 active）从第 4 行往下判。<br>`failed`、抛错、被拒或 60 秒没有结果 → 这次运行 `failed`，`tell` 取结果里的 `tell`，没有时为 `GLM peak hours ended at {end}. The harness could not resume the drive that waited out the peak ({reason}). Tell the human in one line that the moved work can start and the drive resumes when they say so.`；循环行的行健康 degraded 一次（§6.5）；不再往下判 |
   | 4 | 读不出档位（`stateForProject(<项目根>)` 为 `undefined`，或高峰模式服务不在） | `skipped`，「读不到高峰模式」 |
   | 5 | 档位为少做或不做 | 往下判。0.4 这一行是「档位为不做 → `skipped`，规则板停下的活由规则板恢复」；主 Agent 不受高峰影响之后两档一样（理由在表后第三段，`d-main-agent-peak-exempt`） |
   | 6 | 档位为无影响 | `skipped`，「无影响档没有挪开的活」 |
   | 7 | 主 Agent 在跑 | `skipped`，「主 Agent 正在干活，它下一步的高峰一行已经变了」（rules:§6.4） |
   | 8 | 这一段高峰里主 Agent 一步也没走：`main-step.json`（§6.1）的 `session` 不是当前的持有者会话，或它的 `at` 早于这一段高峰的起点（从事件的 `boundary` 起按分钟往前调计价服务的 `peak(t)`，第一个为假的那一分钟之后就是起点，至多往前找 24 小时；不另存状态）；文件不在或读不出时按「走过」算（偏向叫醒：多叫一次只花一步，不叫则挪开的活要等人说话） | `skipped`，「高峰里主 Agent 没干活，没有挪开的活」 |
   | 9 | 它的 goal 为 `paused`，或为 `blocked`（任何原因码）。goal 从活 agent 读：`agents.get(会话)` 没有时先经 `sessionController.resolveAgent` 取（这一项要叫醒它，第 10 行的投递本来也要恢复它，§6.4 第 2 条；`session/not-found`、`session/writer-held` 照 §6.4 转成第 1、2 行），再 `goals.get(agent)`；取到 agent 之后 `goals.get` 仍抛错、或 `resolveAgent` 返回别的错误时按没有 goal 算（偏向叫醒，投递照 §6.4 第 4 条重试） | `skipped`：`paused` 写「自动推进暂停着」；`hourness-waiting-human` 写「主 Agent 在等你回话」；`hourness-idle-rounds` 写「主 Agent 没事可做，已经在问你」；别的码写「自动推进被挡住了（<码>）」（0.4 后面还有「要你说一句才接着走」：执行行没交 `execute.resume-drive`、第 3 行没跑时，以 M7 的高峰等待码停住的 goal 也落到这里，而 M7 会在高峰结束 5 分钟后自己接上，那半句就不对；循环板不读 M7 的码，所以删去，评审 F43） |
   | 10 | 其余（闲着，没有 goal 或 goal 为 active） | `done`，`tell` 为 `GLM peak hours ended at {end}. Work you moved to after peak can start now.` |

   第 3 行为什么在档位的其余判断之前、又不看会话是不是活的（评审 F34）：M7 只在 `peakHoldFor` 有值时停住，而它只在少做与不做两档才有值（rules:§7.2），所以有停住的 goal 就说明档位不是无影响；到高峰结束时规则板的快照可能读不出（第 4 行），停住的自动推进不该因此一直停着。动作只碰 M7 自己的原因码、幂等，没有停住的就说 `skipped`，多调一次只花一次函数调用。会话是冷的时（宿主在高峰里重启过，或人关了这个会话），0.3 用 `goals.get` 读 goal，它对不是活实例的 agent 抛错（goal:611–614），被当成「没有 goal」，停住的 goal 就看不见了；现在循环板先把会话恢复到本进程，再请 M7 自己看原因码。只在它这段高峰里走过步时才为此恢复：恢复一个冷会话要读回它的日志，并触发 `agent/created`（M7 在那里 disarm 与重启对账，m7:§3.9.1），没有可能停住的就不花这一下。被恢复的会话不只是被打开（0.4 写的「它就只是被打开，不走一步」不对，评审 F40）：它的 goal 若是 active 却没 arm（宿主在高峰里重启过，DSH 在 `agent/created` 时一律 disarm），M7 照它自己的表接上推进并交 `hourness.host-started`（m7:§3.9.1「goal 为 active 但未 arm」一行）；若是以 `hourness-peak-wait` 停住、高峰已过，M7 同样在 `agent/created` 上先执行 `execute.resume-drive`（同表 `hourness-peak-wait` 一行）。两种之后本行的 `run` 得 `skipped`，循环板读到 goal 为 active，照表里那一句记 `done`、告诉主 Agent 一次，不往下再叫醒第二次。这与 DSH 到点投递打开冷会话时相同（schedule:1576），也合 `d-auto-drive`。评审另给了一种做法：循环板先 `resolveAgent`，读 `goals.get(agent)?.blockedReason?.code`（goal:77–100），对上 M7 导出到 `src/shared/` 的常量才调动作（规则板 0.8 §10.7 第 8 点的写法）。没有采用：它要 M7 多导出一个常量，「停住的是不是这一种」就分在两处判；动作自己判时，停住与恢复的规则都只在 M7。两种做法对规则板一样，循环板都不读 `peakHoldFor`。

   `tell` 的 `wake` 为真，按 §6.4 第 3 条选方式：主 Agent 在跑时 `steer`；goal 刚被恢复为 active 时 `inject`，由驱动器的下一轮收到；闲着、没有 goal 时 `followup`。模型自己恢复不了被阻塞的 goal：`update_goal resume` 要当前回合里有人直接说的话（tool-goal:348–349 的 `requireDirectHuman`〔实读〕），循环板的消息不是人的话，所以恢复由 harness 做；第 3 行接不上时 `tell` 叫主 Agent 跟人说一句，由人一句话接上。

   以 `hourness-idle-rounds` 阻塞的 goal 不再由这一项恢复（第 9 行）。裁定之后被高峰挡着的轮不算空转，以 `hourness-idle-rounds` 阻塞的 goal 是真没进展，M7 已经叫主 Agent 去问人；高峰结束时把它自动恢复，就跳过了一个该问人的地方。0.3 请 M7 加的 `execute.resume-after-peak`（恢复这段高峰之内以空转阻塞的 goal）因此撤回：它要 M7 判「阻塞发生在这段高峰之内」，正是接缝裁定第 3 条不让 M7 加的高峰逻辑（「M7 adds this one read; it adds no other peak logic」）。

   为什么少做与不做两档同一张表（第 5 行，`d-main-agent-peak-exempt`）：0.4 在不做档一律跳过，理由是不做档里主 Agent 自己被规则板停着，它挪开的活都在规则板的单上，单解除时规则板恢复它的 goal、叫回它。人定主 Agent 不受高峰影响之后，不做档里主 Agent 照常干活、照常和人说话，被排着的只有子 agent 的活与重活；主 Agent 跟人说「高峰后再派」这类挪开的活，两档里都一样会有。所以第 10 行的叫醒两档都做。规则板放出排着的子 agent 与脚本时若也叫回了主 Agent，第 7 行（主 Agent 在跑）多半先成立，这一项就不再叫；两边恰好错开时主 Agent 多收一条，每段高峰至多多一步。

   叫醒的代价：第 3 行每段高峰至多一步，只在自动推进因高峰停住时；第 10 行每个工作日至多一步，只在少做或不做档、主 Agent 这段高峰里干过活时。规则板 0.6 不在规则板上做 M6-R5 的理由（「它空闲时多半在等人」「规则板不知道它挪开过什么」，rules:§3.6）由「在等人时不叫」与「高峰里没走过步时不叫」两条接住，规则板 0.7 同意叫醒由循环板做（rules:§10.7「循环板设计 0.2 §17 对本稿的七条」那一组的第 6 点）。0.4 在这里写「不做档下没有 goal、没被 M7 停住、身上也没有规则板的单的主 Agent 不叫」，依据是不做档里主 Agent 自己停着；主 Agent 不受高峰影响之后这条依据没了，改为与少做同样按「这段高峰里干过活、闲着、不在等人」判（第 5 行与上一段）。这一项是编排层的条目（修订后的接缝裁定，§3.4）：它要的档位、持有者、goal、走步记录与 M7 的动作都在编排层；GLM 包给的只有它听的 `channel.peak-changed` 与算起点用的 `peak`。
5. 高峰开始（第 13 项）只记录与显示；计价服务不在或 `peak` 抛错时第 13、14 项不出现、`channel.peak-changed` 不在事件表里（读不出不算高峰，同 rules:§3.6）。这时高峰的结束时刻也读不出，`peakHoldFor` 为 `undefined`，M7 照原来的空转规则走、不会因高峰停住（rules:§3.6）。高峰当中计价服务、循环行或执行行那一份撤掉了，第 14 项就不会在高峰结束时跑；这种情形怎样收场归 M7（规则板 0.8 §10.7 M7 第 4 条把「循环板没装上时停不停」交给了 M7），M7 0.4 的做法是高峰结束 5 分钟后自己复查一次（§17 M7 第 6 条）。

### 6.10 每次运行的记录

每次运行写两条事件，都由循环行写，模型写的不算（`metrics`）：

| 事件 | 何时 | 字段 |
| --- | --- | --- |
| `loop-fired` | 触发并通过去抖、限次之后，执行之前；被限次或自己触发自己时也写，紧跟一条 `loop-done` | `{at, project, entry, run, source: 'plugin' \| 'person', plugin?, row?, trigger: {kind, event?, occurrenceAt?}, events: <合进来的事件个数>, cause?, late?}` |
| `loop-done` | 运行有了结局 | `{at, project, entry, run, outcome, reason?, exits?: number[], durationMs?, outputBytes?, delivery?: 'steer' \| 'inject' \| 'followup' \| 'dsh', messageId?}` |
| `loop-entry` | 人的条目写入，或循环板发现仓库里的条目在它之外变了 | `{at, project, entry, op: 'add' \| 'edit' \| 'delete' \| 'restore' \| 'repin' \| 'external' \| 'adopt', actor, via: 'chat' \| 'command' \| 'board' \| 'repo', question?, sha256?}`；`repin` 是人看过改过的脚本原文、同意照新的跑；`external` 是条目或脚本在循环板之外被改过；`adopt` 是照图上人的拍板认回仓库里带来的条目（§9.3，0.5） |
| `loop-drift` | DSH 里的任务被改、被删或投不出 | `{at, project, entry, what: 'edited' \| 'deleted' \| 'not-delivered' \| 'orphan'}` |
| `loop-note` | 主 Agent 记了一次结论 | `{at, project, entry, run?, chars}` |
| `loop-read` | 机器一级的运行者为通道条目读了一次额度（M6-L5） | `{at, project, entry, ok, ms, hit}`；`project` 是 `last-step.json` 指向的项目，写进它的运行记录（0.6，评审 F52） |
| `loop-contribution` | 一份交来的条目被接受、替换或撤回 | `{at, plugin, row, op: 'add' \| 'replace' \| 'dispose', accepted, dropped}` |
| `loop-duplicate` | 一个事件的去重键 7 天内见过，这次不跑（§6.3，评审 F22） | `{at, project, event, key, from, firstSeen}` |
| `loop-holder` | 主 Agent 的会话能不能投的状态变了（§6.4 的 `holderState`，评审 F20） | `{at, project, session?, state: 'ok' \| 'none' \| 'archived' \| 'not-found' \| 'elsewhere' \| 'unknown', reason?}`；`unknown` 的 `reason` 为 `archive-unreadable` 或 `holder-unreadable`，`elsewhere` 的为 `handover` 或 `writer-held`（0.4） |
| `loop-handover` | 运行锁因主 Agent 的会话在别的进程里打开而交出或接手（§6.1，评审 F33） | `{at, project, op: 'release' \| 'take', pid, session}` |
| `loop-task-delete` | 循环板删了一条 DSH 任务（§6.2「删任务的规矩」，评审 F35）；全文在 `removed-tasks.jsonl`，这里只有 id | `{at, project, entry?, scheduleId, why: 'moved' \| 'entry-gone' \| 'duplicate' \| 'no-holder' \| 'holder-archived' \| 'holder-not-found' \| 'repair' \| 'not-delivered', deleted: boolean}` |

`outcome` 的取值：`delivered`（消息已进主 Agent 的会话）、`ran`（脚本或 harness 动作跑完，没有要交给主 Agent 的）、`reported`（脚本跑完并已交给主 Agent）、`delegated`（`self` 条目由别的行执行，第 13 项与 `recordRun` 报来的）、`skipped`（条件不满足：harness 动作说跳过、主 Agent 在跑、档位不对）、`suppressed`（限次、自己触发自己）、`deferred`（规则板判为排队，之后还会有一条结局）、`blocked`（规则板拦下）、`refused`（脚本与同意时的哈希对不上、文件不在，检查的命令在工具节点上改过或节点不在，或条目在循环板之外被改过，没跑；`reason` 为 `script-changed`、`script-missing`、`check-changed`、`check-missing`、`entry-changed`、`not-in-checkout`、`unadopted` 等，§2.3、§6.6、§9.3，0.5；`not-in-checkout` 为 0.6，评审 F44）、`unfinished`（脚本超时没跑完，已交给主 Agent，合进来的事件留到下一次，`d-script-timeout`，0.5）、`held`（没有主 Agent、主 Agent 的会话归档了或找不到或在别的进程里、持有者记录读不出，`reason` 写是哪一种，之后还会有一条结局；0.4 的「高峰停着」一种随 `d-main-agent-peak-exempt` 删去；`loops.peak-end` 在 `elsewhere` 时存的是「再判一次」，§6.9 第 4 条第 2 行）、`failed`（投不出、harness 动作失败；脚本起不来记 `reported` 或 `ran` 并带原因 `spawn`，同 §11.2）、`expired`（等太久作废、事件没有声明）。

写到哪里：指标流水（`metrics`）的设计还没定稿；它合入之前写 `<项目目录>/runs.jsonl`（按 8 MiB 轮换）；`loop-read`（机器一级的运行者读额度，M6-L5）写进 `last-step.json` 指向的那个项目的 `runs.jsonl`（0.6，评审 F52：`machine/` 不再放一份项目之外的流水），没有指向的项目时丢掉、只在机器一级的行健康里 info 一次；指标流水合入的那一步只改 `src/loops/metrics.ts` 一个文件，换成写指标流水（同 rules:§10.5 给 `metrics` 的约定）。页面上的「上次」从 `state.json` 的 `last` 缓存读（每项最近一次的运行号、时刻与结局），缓存坏了从记录的末尾重建。

结论（节点 `schedules` 正文的「每次的结论记成那一项的批注」）：主 Agent 用 `loop_note({entry, text})` 记一行（至多 500 个码点），挂在这一项最近一次投给它的运行上；存进 `notes.jsonl`（每项保留最近 20 条），页面这一项展开后列出；指标流水只记字数。

### 6.11 周报里的两张单子：4 周没结果的、反复超时的

人问「会不会出现主Agent一直往里加但是不删的情况？」。编排方定（可推翻，`design-context.md`「Main agent and peak; stale entries; hook seam」）：周报列出人加的、4 周没跑出过结果的条目，用一个四行提议请人删，一次至多 3 项，插件带来的不在此列，删走同一条同意的路。人定的 `d-script-timeout` 另要：超时与晚到的拦截计进周报，反复超时的条目提议修。

- 循环板算单子，周报出它：循环板服务的 `staleEntries(project, now)`（§3.1）给第一张；`timeoutEntries(project, now)` 给第二张（同一个服务，形状 `{id, title, timeouts7d, lastTimeoutAt}`，至多 3 项，次数多的在前）。M7 的周报（`hourness_report` 的 `weekly`，m7:§3.10）各加一节，读这两个函数；服务不在或返回 `undefined` 时那一节写「循环板此刻不在这个 DSH 进程里，这一节下次再看」（§17 M7 第 8 条）。规则板的「4 周没触发的规则」与拦路脚本的超时、晚到的拦截由规则板算，同样进周报（rules:§10.5「不再触发的条目」一段，含反复超时的提议修）；规则板的删除提议是规则板的一条（`rules_propose` 的 `remove`），与循环板的这一条分开提，各自至多 3 项，各算周报的一件。
- 「4 周没结果」：人的条目（`u-` 开头）、加上已满 28 天、最近 28 天里没有一次结局是 `delivered`、`ran` 或 `reported`（一直没触发，或触发了全是 `skipped`、`suppressed`、`failed`、`refused`、`unfinished`、`expired`）。一段每 30 分钟跑一次、一直都过的巡检有 `ran`，不算；一项一直没跑成的算（单子上写「一直没跑成」，与「一次都没触发」分开写，`StaleEntry.why`）。已在一条 `open` 的删除提议里的不列。每项的 `lastResultAt` 与最近 28 天的运行数在 `state.json` 里随每次运行更新；`state.json` 重建时从运行记录（指标流水合入后从它）补回，补不回的那几项这一周不列。
- 「反复超时」：最近 7 天结局为 `unfinished` 至少 3 次的条目，人的与插件的都列（插件的那一项提议的是「请插件的作者修」，写进周报，不提删除；插件条目只能看）。
- 删：主 Agent 用 `loop_propose {kind: 'delete', entries: [至多 3 个 id], reason}` 记一条提议（§7.1 第 1 步，`delete` 一种 0.5 起收 `entries` 列表），再用 `propose_to_human` 把它写成一个四行提议；人同意后三项在同一次写入里删掉，各自 7 天内能 `/loops restore`。修：主 Agent 照常派子 agent 改脚本，再 `loop_propose {kind: 'edit'}` 给人看新的原文。
- 周报一次至多三件要人定的事（m7-8），这两张单子的提议算在里面；放不下的下周再提。

## 7. 人怎样加、改、删一项


人的条目只由人定（同 `d-rules-human-only` 的理由：条目会在人的电脑上按时跑脚本、按时叫醒主 Agent）。存储的写入只有一个入口 `openLoopStore(<项目根>).apply(actor, mutation)`（`src/loops/store.ts`；0.4 带 `userHome`，0.5 的条目在仓库、运行时在 `.llm/loops/`，§9），它按身份核对（§13）：`human`（人敲的 `/loops` 命令）能删、恢复、确认恢复、对没有图的提议拍板；`harness` 只能照图上人拍过的待决写（§7.1 第 4、5 步）；`llm` 只能记一条 `open` 的提议，不能写条目。页面不写任何东西（§8）。

### 7.1 在主 Agent 的对话里（加、改、删）

人说「每 30 分钟查一下服务器，挂了告诉我」这类话时，走与规则板的提议同一条路（rules:§9.3）：循环板管提议的内容，M3 管说给人听与记人的话。0.1 让 `loop_propose` 自己在图上提一张带「不加」「加上」两个选项、推荐放最后的待决，人同意后用 `graph_decide` 拍板，并自带一套四行的校验；这违背 `d-chat-not-cards`，也绕过了 M3 附录 0.3 定的提议式待决与原话核对（m3:§3.3–§3.6、§3.8 第 3 条，评审 F4）。本稿改为：

1. `loop_propose`（只有主 Agent，`isMainAgent`）：输入 `{kind: 'add' | 'edit' | 'delete' | 'repin', entry?, entries?, body?, script?, reason, replaces?}`。`add` 带 `body`（一项的 `title`、`why?`、`when`、`filter?`、`action`、`limits?`、`quiet?`）；动作为 `script` 时另带 `script: {lang, text}`：脚本原文由主 Agent 派的子 agent 写好、主 Agent 原样交来，`body.action` 写 `kind: 'script'`、`report`、`timeoutSeconds?`、`note?`、`to?`、`glmSpend?`，不带 `script` 这个引用：文件路径、语言与哈希由循环板按交来的原文定（路径 `docs/loops/scripts/<条目 id>.<后缀>`，后缀由 `lang` 定；哈希是 `text` 按 UTF-8、换行为 `\n` 编出的字节的 SHA-256；§7.3 末的例子 2）。动作为 `check` 时 `body.action` 写 `kind: 'check'`、`tool`、`check?`、`report`、`timeoutSeconds?`、`note?`、`to?`、`glmSpend?`，不带 `argv`：循环板此刻经 M4 的读法从那个工具节点读出命令，作为这条提议的内容（读不到就 `invalid`，`body.action.tool`，「项目图上没有这个工具节点，或它没有可跑的检查」；编排方的裁定「Check entries seam」）。`edit` 带 `entry` 与新的 `body`（改脚本时另带新的 `script`）；`delete` 带 `entry`，或带 `entries`（至多 3 个，周报的删除，§6.11）；`repin` 只带 `entry`：脚本或条目文件在循环板之外被改过，或检查的命令在工具节点上改过（§2.3、§6.6、§9.3）、人要照现在的样子接着用时，循环板此刻读一次仓库里的条目与脚本（检查是工具节点上此刻的命令），作为这条提议的内容，人看过原文同意之后照它钉住。按 §12 整份校验，插件的 id 直接返回 `forbidden`（「插件带来的条目暂时只能看」）。分配提议 id `lp-<8 位十六进制>`，在存储里记一条 `open` 的提议，`via` 取会话有没有图目录（图行服务的 `dirFor(cwd)`），带 `replaces` 时同一次写入把旧提议转 `superseded`。不写图。返回 `{proposal, describe, cautions, attach, message, detail?}`：
   - `describe`：循环板按 `body` 生成的一行人话，写生效之后会怎样，至多 40 个码点（M3 四行里推荐一行的上限），不含脚本原文，例「每 30 分钟跑「服务器巡查」，没过时告诉主 Agent」；带上标题超过 40 个码点时去掉标题，写「每 30 分钟跑一段脚本，没过时告诉主 Agent」。0.2 把命令写进 `describe`（例子约 70 个码点），而人看到的四行每行至多 40 个码点，命令本身就放不下（评审 F21）。
   - `cautions`：要让人知道的后果，循环板从一张固定的句子表里按内容挑，至多 7 句，每句至多 40 个码点。脚本条目总有的五句：「这段脚本会在你的电脑上、项目目录里按时运行」「它拿不到 DSH 的凭证和 GLM 的 Key」「它改过一个字就不再跑，要你再同意」「超过 <秒> 秒算没跑完，会告诉主 Agent」「DSH 崩溃之后它可能被重跑一次」。检查条目总有的五句：「这条命令会在你的电脑上、改动所在的检出里运行」「它拿不到 DSH 的凭证和 GLM 的 Key」「项目图上的命令改过就不再跑，要你再同意」「超过 <秒> 秒算没跑完，会告诉主 Agent」「它调用的程序与配置文件不在这次同意里」。按内容加的：「它读写、调用的别的文件不在这次同意里」（脚本原文里有像项目文件的路径时：带 `/` 或 `\` 的相对路径，或以 `.ps1`、`.sh`、`.js`、`.mjs`、`.cjs`、`.ts`、`.py`、`.cmd`、`.bat` 结尾的名字；只看原文的写法，不看文件此刻在不在，评审 F37 的做法）；「每天大约叫醒主 Agent 48 次」（告诉主 Agent 的条目，按 §8.2 的算法算）。
   - `detail`（动作为 `script` 或 `check` 的 `add`、改了脚本或检查的 `edit` 与 `repin` 有，别的没有；`AttachDetail`，§3.1）：harness 写的、要人亲眼看到的原文，不经模型转述，由共用的 `scriptDetail`（§6.6）生成，规则板的脚本提议也用它；检查由同一个文件的 `commandDetail` 生成，代码块里是 `commandText(argv)` 写出的那一行命令，`mustShow` 是那一行加每句 `cautions`，其余与下面脚本的写法相同。`markdown` 是三段：一行「脚本原文（<语言>，在项目目录里跑，每次照这样跑）：」；一个围栏代码块，信息串按 `lang` 写 `powershell`、`js`、`python`、`bash`，内容是脚本原文，围栏用的反引号比原文里最长的一串反引号多一个、至少三个（CommonMark 的围栏写法，原文里的反引号因此原样显示）；一行「注意：」接 `cautions` 各句，以「；」连起来。`mustShow` 是脚本原文整段一片，加上每句 `cautions`，M3 用它核对（第 3 步；M3 的核对先做 NFKC 与空白合一，所以缩进与换行的差别不算）。脚本原文超过 4000 个码点或 100 行时 `loop_propose` 返回 `invalid`（`script.text`，「脚本太长，人在对话里看不完：拆成几项，或把细节放进项目里的文件、这一项只调它」）。0.4 的命令原文（`commandText(argv)`，至多 400 个码点）随 `run` 换成脚本，不再有。`detail` 与 `attachDigest(detail)` 只在 `loop_propose` 这一次算，存进这条提议的变更记录（`journal.jsonl` 里 `op: 'propose'` 那一条的 `after.detail`、`after.digest`，§9.2），之后谁都不重算（评审 F37）：`attachable` 返回存下的 `detail`，`acceptProposal` 与存下的 `digest` 比，`/loops accept` 两次给人看的也是它。提议的内容（`body` 或脚本原文）一改就是一条新提议（`replaces`），新提议另算另存。`cautions`、`describe` 与脚本原文 `script.text` 同样存在这一条里（`.llm/loops/journal.jsonl`，§9.2），同意之后写进仓库的就是这一份。
   - `attach`：`loops:<提议 id>`。
   - `message`：`via: 'graph'` 为「Put it to the human with propose_to_human (kind question, attach <attach>): one plan in four lines; the recommendation line says what describe says. For a script or a check, propose_to_human puts the exact script text or command line and every caution after your four lines: show its text to the human exactly as given, that part included, or their agreement will not count. It runs as soon as the human agrees; there is no trial run. It takes effect only when the human agrees and you record their words with record_human_answer.」；`via: 'board'` 为「The project graph is not available: tell the human this proposal in four lines, then quote detail.markdown exactly as given, and tell them they can type /loops accept <id> or /loops reject <id>.」，`via: 'board'` 时结果另带 `detail`。
   - 内容不合时返回 `invalid` 与字段路径，什么都不记；取不到锁或写不进时 `busy`、`io`。
2. `propose_to_human`（M3，主 Agent）带 `attach: 'loops:<id>'`：M3 先经 `loopsService(ctx)?.attachable({cwd, proposal})` 核对它是这个项目里 `open`、`via: 'graph'` 的提议（不是就拒绝，`invalid`，`field: 'attach'`，`hint` 带循环板给的原因），再照常提一张提议式待决（四行由主 Agent 写，M3 查行与加粗、拼排版、数一条回复里的件数），正文最后一行写 `loopProposalLine(id)`，即「循环板提议 `lp-<id>`」。`attachable` 带回 `detail` 时（评审 F21），M3 把 `detail.markdown` 原样作为一段接在四行之后：在给人看的 `text` 里放在四行之后（主 Agent 自己的收尾问句之前），在待决正文里放在提议 id 那一行之前，所以面板「需要你」里也看得到；这一段由 harness 写，不受四行的行长与加粗规则管。人补充或否掉之后主 Agent 改了再提：先 `loop_propose` 带 `replaces`，再 `propose_to_human` 带 `question`（改同一张待决）与新的 `attach`，M3 把正文末行换成新的提议 id。M3 0.3 还没有 `attach` 这个参数；规则板 0.7 已请 M3 加 `rules:` 一种（rules:§9.3、§10.7），本稿请 M3 按前缀分派，`loops:` 走循环板（§17）。
3. 人在对话里回话。同意：主 Agent 先复述一句「那我记成：每 30 分钟跑 …，没过时告诉你」，再调 `record_human_answer`（`kind: 'question'`、`answer: 'agree'`、`words` 是人的原话）；M3 核对原话（m3:§3.6 的 `personSaid`）。待决正文末行是循环板的提议时，M3 在拍板之前再问一次 `attachable`；带回 `detail` 时核对「给人看过」（评审 F21）：在会话日志里（同 `personSaid` 读的那一份）取这张待决最近一次 `propose_to_human` 的结果之后、含人那句原话的消息之前，主 Agent 发给人的文字（assistant 消息的文本部分，不含工具调用的参数），按 `personSaid` 的同一种规整（NFKC、空白合一）后，`detail.mustShow` 的每一片都在里面（M3 0.4 §3.5 第 5a 步已这样做，取 `hournessTalk` 的 `after`，至多 16,000 个码点，放得下 4000 个码点的脚本与四行）。不全在：返回 `not_shown`，`message` 为「The human has not seen the exact script text and cautions. Show the proposal text again exactly as propose_to_human returned it, the script block included, and ask again.」，待决不拍、循环板什么都不写，提议仍是 `open`。都在、或没有 `detail`：以 `llm` 加 `relay` 拍这张待决（`decide`，`conclusion` 为主 Agent 记成的那一句；有 `detail` 时 `reason` 末尾加「· 已给人看原文 <摘要>」，摘要是 `mustShow` 以换行连起来的 SHA-256 前 12 位十六进制，循环板导出 `attachDigest(detail)` 给 M3 算），拍板成功之后用 `loopProposalIdOf(待决正文)` 看它是不是循环板的待决，是就调 `acceptProposal({questionId, graphDir, cwd, by: {actor: 'llm', relay}})`，把结果的那一行放进 `record_human_answer` 的结果（下表）。补充、否掉：M3 只写批注，循环板什么都不改，提议仍是 `open`。人说这件事不用加了：主 Agent 带原话把待决改为 `dropped`（m3:§3.5），循环板在下一次对照时把提议转 `rejected`（第 5 步）。
4. `acceptProposal` 的核对与写入：读 `graphDir` 里那张待决；它是提议式、状态 `done`、有 `conclusion`；正文末行的提议 id 等于请求里这条（人同意的是最新那一版，旧版的 id 已被换掉）；最后一条 `decide` 历史的身份是 `human`，或是带 `relay` 的 `llm`；提议带 `detail` 时（动作为 `script` 或 `check` 的加、改与 `repin`；编排方的裁定「Check entries seam」要每一种会跑东西的动作都这样），`llm` 的那条 `decide` 的 `reason` 里还要有「已给人看原文 <摘要>」，摘要等于这条提议提出时存下的 `digest`（第 1 步；不按此刻的文件系统重算，评审 F37。没有就是 `invalid`，`message` 为「the agreement carries no mark that the human saw the exact command text; put it to the human again with propose_to_human」，页面「要你看一眼的」写「「<名字>」的同意没有核对到你看过命令原文，没有生效」：防的是绕开 `record_human_answer` 的拍板，例如 `graph_decide` 带人的原话，在第 5 步补写时生效；`human` 身份的拍板是人自己在图上拍的，待决正文里就有那一段原文）；提议是 `open`（已经 `accepted` 时原样返回 `ok`，不写第二次）。都成立时以 `harness` 身份按提议写入（加、改、删或 `repin`），`source` 记 `{kind: 'person', via: 'chat', at, relay, question, proposal}`，提议转 `accepted`，同一次写入（§9.2：先追加变更记录，再写仓库里的条目文件与脚本文件，脚本的字节就是提议里存的原文，`script.sha256` 照它算；检查的 `argv` 就是提议里存的那一条，写进条目文件）。写进的是项目主检出的工作区，当场生效（`d-boards-as-hooks`：「同意了直接运行就行」），不等提交；提交是主 Agent 的事（`d-main-agent-shell`），结果那一行提醒它。原话的真假由 M3 在拍板之前核对过（`personSaid`，fail-closed），循环板不再核对一遍。
5. 对照与补写（拍板写在图上、循环板没跟上：循环行当时没加载，或两次写入之间进程退出）：循环行在开始跑项目时与之后每 60 秒，对每条 `via: 'graph'`、`open` 的提议在图上找正文末行指向它的待决：找到已同意的，按第 4 步同样核对后补写，`loop-entry` 的 `via` 为 `chat`，变更记录写「按图上 `<id>` 的拍板补写」；找到被带原话放弃的，记 `rejected`；7 天里没有任何待决指向它，记 `expired`（提了没交给人）。图是人拍板的事实源，循环板只执行它，所以别的路径写下、身份合第 4 步的拍板也会在这一步生效。立即生效的钩子只挂在 `record_human_answer` 上（评审 F4 的改法）；`graph_decide` 不挂，`/graph-apply` 已随面板只看删去（plain-ui §3.1）。

`acceptProposal` 的结果与 `record_human_answer` 多写的一行（英文，给模型）：

| 结果 | 多写的一行 |
| --- | --- |
| `ok`，`accepted` | `Loop board: proposal lp-<id> took effect (<entry id>). Commit <changed paths under docs/loops/> with git when you next commit.`（删除时 `paths` 是删掉的文件） |
| `missing` | `Loop board has no open proposal lp-<id> for this question; nothing took effect. Propose again with loop_propose and put the new one to the human.` |
| `busy` | `Loop board was busy; it applies this decision within a minute from the graph.` |
| `io` | `Loop board could not write; the decision is listed on the loop board page. Tell the human.` |
| `invalid` | `Loop board rejected the proposal content now: <message>. Tell the human; propose again if still needed.` |
| `forbidden` | `Loop board: this decision cannot write entries (<message>).` |

循环板服务不在时，M3 什么都不多写，由第 5 步补上；这时 M3 拿不到 `detail`，核对不了「给人看过」，所以正文末行是循环板提议、而 `attachable` 不可用时，M3 照常拍板但 `reason` 里没有那个记号，带脚本的提议在第 5 步补写时因此被拒（`invalid`），人要再同意一次；不带脚本的提议照常补写。宁可让人多说一次，也不让没核对过的脚本生效。`busy` 与 `io` 之后第 5 步照图上的拍板补写；`missing`、`invalid`、`forbidden` 不补，交人：页面「要你看一眼的」一组在拍板之后 7 天内列出这张待决，行健康在拍板之后 24 小时内 degraded「图上待决 `<id>` 没有对应的循环板提议」（两者都在对照时从图算出，不另存状态）。

为什么要图上的待决（两种做法，采用的放最后）：

1. 只在存储里记，原话写在条目上：一次写入、不碰图。代价：人在对话里同意的这件事，图上没有任何痕迹，晨报的「拍板等多久」也量不到它；原话没有 harness 核对；和规则板走两条路。
2. 循环板记内容，M3 把它作为提议式待决交给人，人同意后带原话记下、harness 核对原话，循环板照办（采用）：拍板是图上的事实，`metrics` 的人的负担照常算到它；与规则板同一条路，主 Agent 只学一种做法；四行的排版只在 M3 一处（m3:§3.4）。代价是多一次图写入与一次跨行的调用。

图行不在或会话没有图目录时（`via: 'board'`），提议只在循环板里，主 Agent 照 `message` 把它说给人听，人打 `/loops accept <id>` 或 `/loops reject <id>`（§7.2）。带脚本或检查的（有 `detail` 的），`/loops accept` 要打两次：第一次的结果就是 `detail.markdown` 加一行「看过了就再打一次 /loops accept <id>」，不写条目，只在存储里给这条提议记 `shownAt`（变更记录 `op: 'show'`）；30 分钟内第二次打才生效，过了 30 分钟再从第一次起。这一路人看到原文靠的是命令自己的回话，不靠主 Agent 转述，所以不用核对会话日志。

### 7.2 人的命令 `/loops`

人的命令只有一个 `/loops`（人在输入框里敲；身份为人，斜杠命令模型发不出，`docs/ORCHESTRATION.md` §2.10；`recordInput` 用默认值，命令事件记下人敲的几个词，同 `/rules`，rules:§9.2；`input.hint` 写下表的用法；`definitionId` 为 `dsh-glm-hourness/loops`）。0.1 的 `/loops-apply`（给页面用的 JSON 写入命令）随页面只看删去：没有调用方了，留着是死代码（`AGENTS.md`）。

| 命令 | 作用 | 结果（一行中文） |
| --- | --- | --- |
| `/loops` | 列出这个项目的全部条目，每项一行「名字 · 什么时候 · 上次 · 下次」，再一行「在等的 N 件」；只读 | — |
| `/loops delete <名字或 id>` | 删掉你的一项：仓库里它的条目文件与脚本从工作区删去（提交由主 Agent 做）；变更记录留全文，7 天内能恢复 | 「已删「<名字>」；7 天内打 /loops restore <id> 能恢复」 |
| `/loops restore <id>` | 恢复 7 天内删掉的一项，或把读不出的条目文件按变更记录写回（§9.3）；写回的就是你上次同意的那一版，脚本照它的哈希核对 | 「已恢复「<名字>」，下次 <时刻>」 |
| `/loops ack` | 确认页面上「存档恢复」那一行（§9.3 中间坏一行的情形），之后不再提示 | 「好，这条提示不再显示」 |
| `/loops accept <lp-id>`、`/loops reject <lp-id>` | 只给 `via: 'board'` 的提议（没有项目图时）；带脚本或检查的提议 `accept` 要打两次，第一次只给你看原文（§7.1 末段） | 「已加上「<名字>」，下次 <时刻>」或「这条提议不加了」；带脚本的第一次：脚本原文与注意事项，加「看过了就再打一次 /loops accept <id>」 |

- `<名字或 id>`：先按 id 精确找，再按名字（去掉首尾空白之后完全相同）找你自己的条目；名字对上几项时不删，列出它们的 id。插件带来的 id 一律返回「插件带来的条目只能看，删不掉」，什么都不写（`d-defaults-readonly`）。
- 新建与修改没有命令：一项要写清什么时候、做什么、脚本原文，写成命令参数人打不清楚，也绕开了提议的四行与 `cautions`；在对话里说一句，主 Agent 会提出来（§7.1）。
- 命令跑在打开它的会话里，会话日志里留一行命令事件（`source` 为 `user`，commands:333–346）。

### 7.3 agent 能做什么

| 工具 | 谁能用 | 输入 | 输出 |
| --- | --- | --- | --- |
| `loop_show` | 任何 agent | 无 | 这个项目的全部条目（插件的与人的）、每项的上次与下次、在等的（`held`、`deferred`）与最近 10 次运行；不截断 |
| `loop_propose` | 只有主 Agent（`isMainAgent`，M3） | §7.1 第 1 步 | 同 §7.1 第 1 步；不是主 Agent 时 `forbidden`，`hint`「ask the main agent to propose it」 |
| `loop_note` | 只有主 Agent | `{entry, text}`（`text` 1–500 个码点） | `{entry, run}`；这一项没有投给主 Agent 的运行时 `invalid`（「这一项还没有交给你的运行」） |

- 名字登记在 `src/shared/tool-names.ts` 的新常量 `LOOP_TOOL_NAMES`，契约测试核对循环行注册的与它相等。在 GLM 路由上延迟加载，不进常驻名单（同规则板的两个工具）；`loop_note` 的用法写在需要它的条目文字里，模型读到消息时才需要它。
- `loop_propose` 不写给人看的话：四行由主 Agent 在 `propose_to_human` 里写，M3 的说明已原样带 `PLAIN_QUESTION_GUIDE`（m3:§3.4），`loop_propose` 的说明不另抄一份，只写两句「The human reads describe through your propose_to_human lines; write those lines in plain words as propose_to_human's guide says. For a script, propose_to_human adds the exact script text and the cautions after your lines; show them as given.」。
- `loop_propose` 的说明里有两个做好的例子，主 Agent 要提的两类条目各一个（人定的 `d-agent-examples`，2026-10-30，人回「彳亍」：主 Agent 要写的每种东西各配一道示范，放在写它的工具说明里，两块板的条目与脚本的示范归规则板 0.9 与循环板 0.5；取代 0.4 的「不另带一份例题」）：一个到点触发、告诉主 Agent 的；一个碰到事件触发、动作是脚本的，给出脚本原文、它从标准输入收到的事件 JSON 与它的输出怎样用。规矩三条：例子要过真提议同样的校验（L2：把两个例子原样交给 `loop_propose` 的校验，`validateEntry`、`validateWhen` 与脚本的长度上限，都返回合格，验收第 36 条）；领域与练习题无关（练习题是记账工具，例子不碰记账）；只写已经定了的东西（事件、字段与筛选都是 §4 的表里有的）。说明里的样子（给模型的，英文）：

  ```text
  Example 1, time trigger, tell the main agent:
  {"kind": "add", "reason": "The human asked for a Friday reminder about old unmerged branches.",
   "body": {"title": "每周五看一眼没合入的分支",
            "when": {"kind": "weekly", "time": "17:00", "weekdays": [5], "timeZone": "Asia/Shanghai"},
            "action": {"kind": "tell-main", "wake": true,
                       "text": "Weekly: list the branches not merged into main and older than 7 days, then ask the human in one line which to drop."}}}

  Example 2, event trigger with a filter, the action is a script (a subagent wrote the script; pass its text as is):
  {"kind": "add", "reason": "The human asked to hear about broken links in docs after each merge.",
   "body": {"title": "合进主干之后查文档里的坏链接",
            "when": {"kind": "event", "events": ["hourness.trunk-advanced"]},
            "filter": {"files": {"paths": ["docs/**/*.md"]}},
            "action": {"kind": "script", "report": "on-failure", "timeoutSeconds": 30,
                       "note": "Broken links in docs after a merge. Fix them in a small task; do not ask the human."}},
   "script": {"lang": "node", "text": "<the script below>"}}

  The script (docs/loops/scripts/<id>.mjs after the human agrees; it runs in the project root):
    import { readFileSync, existsSync } from 'node:fs'
    import { dirname, join } from 'node:path'
    const event = JSON.parse(readFileSync(0, 'utf8'))
    const broken = []
    for (const file of event.payload.files.filter(f => f.endsWith('.md'))) {
      if (!existsSync(file)) continue
      for (const [, target] of readFileSync(file, 'utf8').matchAll(/\]\((?!https?:|#)([^)#\s]+)/g)) {
        if (!existsSync(join(dirname(file), target))) broken.push(`${file}: ${target}`)
      }
    }
    if (broken.length > 0) { console.log(broken.join('\n')); process.exit(1) }

  What it gets on stdin (one JSON object):
    {"version": 1, "board": "loops", "entry": "u-3f9a1c2e", "run": "lr-...", "event": "hourness.trunk-advanced",
     "id": "ev-...", "at": "2026-10-30T09:12:04.120Z", "project": "C:\\work\\shop", "session": "...",
     "key": "trunk-advanced:9c1e...:2026-10-30T09:12:03.981Z",
     "payload": {"from": "4b2d...", "to": "9c1e...", "tasks": ["t-12"], "files": ["docs/setup.md", "src/app.ts"], "truncated": false},
     "merged": []}

  What its output does: exit 0 means passed, nothing is sent (report on-failure). Exit 1 means not passed: you get one
  message with the note, the exit code and the last lines it printed (here, the broken links). Past 30 s it is stopped
  and you are told it did not finish. If the file is changed after the human agrees, it does not run until they agree again.
  ```

  例子里的事件、字段（`hourness.trunk-advanced` 的 `files`，能按 `paths` 筛，§4.2）、筛选的 glob 写法（§2.2）、信封（§6.6 `HookEnvelope`）、超时与「改过就不跑」（§6.6）都是本稿定了的；`project` 一类示例值不是真路径，校验只看形状。例子与真提议走同一个校验，所以 §12 的规则改了而例子没跟上时 L2 先报出来。
- agent 没有写条目的工具；`loop_propose` 只在存储里记提议，不生效。

### 7.4 以后放开默认条目时要改的地方

人说的是「先暂时」。放开时：存储加一种覆盖记录 `{entry: 'execute.…', override: {when?, action?, disabled?}}`，只有人能写（经对话的提议，或 `/loops` 的新子命令）；页面在插件的条目上加一句「要改：跟主 Agent 说……」，停用时写明停了会怎样（例如停了 `execute.handback`，交回之后没人提醒主 Agent 派审查）；插件更新时交来的条目变了，覆盖记录照旧生效，页面写「插件更新了这一项的默认值，你的改动仍在」。存储格式今天就留着 `override` 这个字段名不用，不另做迁移。

## 8. 面板

### 8.1 位置与登记

按 plain-ui §4.7：循环板是第 2 层的一页，从首页页脚「循环板 ›」、上手页第 5 块（plain-ui §6.4，字句归 plain-ui）与首页「现在」里循环板的那一行进入。板块登记表 `ui/src/graph/boards.ts` 里登记：

- `id: 'loops'`，`label: '循环板'`（0.1 写的「循环」改掉，与 plain-ui 同名）。
- `subscribe`、`snapshot`：读投影 `hournessLoops`（§8.4）与 `view.json`，变了就通知；`available` 为投影在这个会话上有值且 `projectKey` 不为空。
- `homeLine`：只在有事要人看时给一行（§8.3），没有时为 `null`。
- `guideLine`：`null`（上手页第 5 块的字句是固定的引导，plain-ui 不要它给此刻的状态）。
- `Page`：`ui/src/loops/LoopsPage.tsx`。

右侧栏 DSH 自带的「自动化任务」页照样在，循环板建的任务也出现在那里（标题以「循环板 · 」开头）。

### 8.2 页面（`mockup-loops.svg`）

页面只看（`d-ui-look-not-operate`，plain-ui §3.1、§4.7）：没有开关、新建、改、删除、恢复、「知道了」按钮与表单，页面也不经任何命令写。能点的只有展开收起（讲细点、说重点）与导航（打开主 Agent 的对话、打开项目图里的节点）。自上而下：

1. 页头：「循环板 · 到点了或碰到某件事，就去做一件事」。下面一行「主 Agent 在会话「<标题>」」（点开跳到那个会话，同 plain-ui「点开跳到主 Agent 的对话」）；没有主 Agent 时「还没有主 Agent：在输入框打 /wish，到点的几项才会开始」；主 Agent 的会话归档了时「主 Agent 的会话已归档：在一个会话里打 /wish here，到点的几项与先存着的 N 条消息才会接着来」，找不到了时同样写「找不到了」（§6.4 的 `holderState`，评审 F20）；主 Agent 的会话在另一个 DSH 窗口里，前 5 分钟写「这块板正交给主 Agent 所在的 DSH 进程」，连着超过 5 分钟写「主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去」（评审 F36）；读不清主 Agent 的会话（`unknown`）时写「循环板此刻看不清主 Agent 的会话（读不到它归没归档 / 读不出主 Agent 是哪个会话），到点的几项原样留着，先不删」（评审 F35）。再一行灰字：「到点告诉主 Agent 的几项，DSH 的自动化任务页里也看得到；在那里改的不算数。主 Agent 的会话里挂着这些提醒，归档这个会话时 DSH 会先停掉它们，换到新的主 Agent 会话之后循环板再建。」
2. 要你看一眼的（只在有时出现）：连着失败的、被限次的、被规则拦下的、DSH 里的提醒被改过或没了的、因主 Agent 的会话归档而先存着的、存档恢复过的、插件交来却读不懂的（写「<插件名>交来的「<名字>」读不懂：<原因>」，不写行 id）、图上拍了板却没生效的（含「同意时没核对到你看过脚本原文」）、脚本改过了或条目文件在循环板之外被改过而先不跑的（§6.6、§9.3，带「要接着用，跟主 Agent 说「把<名字>的脚本给我看一下」」）、条目文件读不出的（带「打 /loops restore <id>」）、脚本没跑完的（`unfinished`）、同一件事反复报来被当成重复的（§6.3 的 degraded 那一种）、DSH 里的提醒和循环板的不一样而此刻不重建的、DSH 里多出一条循环板的提醒而此刻不删的（§6.2 第 3、4 条，`unknown` 时）、高峰结束时没接上停住的自动推进的（§6.9 第 4 条第 3 行的 `failed`），每件一行，带「讲细点」。存档中间坏了一行的那一件下面写「知道了就在输入框打 /loops ack」。
3. 碰到某件事就做的：事件触发的插件条目（M7 的七项、M4 的两项、循环行的四项、GLM 的四项，计价服务不在时没有高峰与 GLM 的几项）。每项一行名字；一行「什么时候 · 做什么」；一行「上次 10 月 30 日 01:40 · 已交给主 Agent」（`self` 条目报不了运行的，写「它自己执行，这里只列出」）；一行灰字写它从哪来：「<插件名>带来的 · 只能看」，有 `basis` 时加一句「· 依据 <basis>」。插件名用插件管理器里显示的名字（plain-ui §4.7 的约定，例「项目编排」「GLM 通道」；名字从同一个函数 `pluginLabel(包名)` 来，§17 请规则板共用）。灰显的项写原因，说插件名不说「行」（评审 F30）：「项目编排的这一部分没启用，这一项现在不跑」。第 15 项展开是每个批过的检查器一行与「检查器自己的规矩」（§5.3）。第 13、14 项写「此刻：不是高峰；下一个高峰 明天 14:00 · 高峰模式：少做（出厂默认）」，少做时第 13 项另写「少做：高峰里同时至多 1 个 GLM 子 agent」（数的来源见 §5.2），下面一行「档位在规则板上看；要改：在输入框打 /rules peak 不做，或跟主 Agent 说」；来源一行「项目编排带来的 · 依据 GLM 通道的高峰时刻与规则板的高峰模式 · 只能看」。
4. 到点做的：时间触发的插件条目（晨报、周报、夜间巡检）。同上，另写「下次 10 月 31 日 08:30 · 每天叫醒主 Agent 1 次」。
5. 本项目加的：人的条目，事件的与时间的都在这一组。来源一行写「你在对话里加的：「<原话>」」（`via: 'board'` 的写「你在输入框里同意的」，从别的电脑上带来、照图上的拍板认回的写「在别处同意、随仓库带来的」）；脚本类的写出脚本文件的路径、一行「脚本：你 <日期> 同意的那一版」与一行超时（「超时 60 秒：超时算没跑完，告诉主 Agent，这次的事件下次再跑；崩溃算没过」），展开是脚本原文；检查类的写一行「检查：项目图上「<工具>」的命令，你 <日期> 同意的那一条」与同样的一行超时，展开是那一行命令（接缝核对时加，§2.3）。每项最后一行：「要改：跟主 Agent 说「把<名字>改成……」；要删：在输入框打 /loops delete <名字>」。一项都没有时一行：「还没有你加的。要加：跟主 Agent 说「每 30 分钟查一下服务器，挂了告诉我」」。最近 7 天删掉的折在下面，每项写「要恢复：在输入框打 /loops restore <id>」。
6. 主 Agent 自己设的提醒（DSH 自带）：只读，标题与下次，「在 DSH 的自动化任务页里管理」。
7. 最近跑过的：最近 20 次运行，每次一行「时刻 · 名字 · 结局的人话」，重复报来没再跑的也在里面（「<事件的人话> · 同一件事又报了一次，没再跑」，§6.3）；循环板每删一条 DSH 里的提醒也有一行（「<名字> · 删掉了 DSH 里的旧提醒（<原因的人话>）」，原因的人话：主 Agent 换了会话、这一项没了、多了一条、还没有主 Agent、主 Agent 的会话已归档、主 Agent 的会话找不到了、DSH 里的被改坏了重建、DSH 没投出去重建；§6.2「删任务的规矩」）；点开是那次的触发、合进来的事件个数、用时、退出码、日志路径与主 Agent 记的结论。
8. 循环板自己的规矩（折起）：「插件的事件条目 5 秒内的事件合成一次、每小时至多 30 次；你加的 30 秒内合成一次、每小时至多 6 次，多出来的合进下一次；循环板自己做的事直接引起的事件，10 分钟内又触发同一项时停下那一次；脚本默认 60 秒超时、超时算没跑完并告诉主 Agent、改过一个字就不跑、拿不到 DSH 的凭证与 GLM 的 Key、只受不分会话的规则管；你加的条目与脚本放在项目的 docs/loops/ 里，运行记录在 .llm/loops/ 里；给主 Agent 的文字先转义、遮住像密钥的字串；一个项目只有一个 DSH 进程在跑这块板。」

每项点开（讲细点）：为什么有它（`why`）、触发的原文（cron 表达式、事件与筛选）、给主 Agent 的英文原文或脚本原文、harness 动作的名字、它自己的规矩（`ownRules`）与明细（`details`）、最近 5 次运行与主 Agent 记的最近 3 条结论、id 与交它的行（小字）。

「每天大约叫醒主 Agent N 次」的算法：每天 1、每周 1/7、每隔 86400/秒数、cron 取接下来 7 天的次数除以 7；事件条目按最近 7 天的运行数除以 7，没有记录时不写。

### 8.3 首页的一行

首页「现在」一节的循环板一行（`homeLine`，至多 60 个码点），按顺序取第一个成立的：「主 Agent 的会话已归档：在一个会话里打 /wish here」或「主 Agent 的会话找不到了：在一个会话里打 /wish here」（`holderState` 为 `archived`、`not-found`，评审 F20：这时谁也收不到循环板的消息，所以排在最前）；「主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去」（`elsewhere` 连着超过 5 分钟，评审 F36）；「循环板看不清主 Agent 的会话，提醒先不删」（`unknown`，评审 F35）；「GLM 登录失效了：在输入框打 /glm-login」（`glm:login-rejected` 投给了一个自己走 GLM 的主 Agent：它这时回不了话，M6-L4）；「循环板：「<名字>」的脚本改过了，先不跑」（§6.6）；「循环板：「<名字>」连着 3 次没过」；「循环板：DSH 里的提醒被改过，已改回」（当天）；「循环板：<插件>交来的 N 项读不懂」。都不成立时为 `null`。点了打开循环板。

### 8.4 数据怎样到页面

- 投影 `hournessLoops`（`sessionProjections.register`，session-projection:68）的 `init(header)` 按会话头的 `cwd` 算出项目根、项目键与 `view.json` 的绝对路径 `{projectKey, viewFile}`（`viewFile` 为 `<项目根>/.llm/loops/view.json`，0.4 在用户级目录）；会话没有 `cwd` 时 `{projectKey: null}`，页面写「这个会话没有工作目录，没有循环板」。
- 跑这个项目的宿主把页面要显示的东西写成一份 `view.json`（§9.1，由执行表、存储、`state.json`、记录末尾、`schedule.catalog()` 与 `stateFor` 推出，内容变化时写，至多每 2 秒一次，临时文件加改名）。页面经 `remote.workspaceFiles.readBytes` 按绝对路径读，经 `changes` 监视（与规则页同一种读法，rules:§9.1；`dsh-api-workspace-files/README.md`:40、58），页面可见时另每 15 秒按大小与修改时间重读一次（改名替换之后监视还报不报变化没核对，同规则板的 V4）。
- 页面不调 DSH 的 `schedule` Remote，也不读循环板的其他文件：`view.json` 里已经有页面要的全部内容。没有进程在跑这个项目时（`view.json` 超过 3 分钟没更新），页面照旧显示，页头多一行「现在没有 DSH 进程在跑这块板，下面是 <时刻> 的样子」。

### 8.5 页上的字

设计里的词在页上换成人话（`d-plain-questions`）：条目 →「一项」；触发 →「什么时候」；动作 →「做什么」；来源 →「谁带来的」；运行 →「这一次」；harness 动作 →「系统自己做」；结局按 §6.10 换成「已交给主 Agent」「跑完了，没事」「跑完了，已告诉主 Agent」「交给<插件名>自己做」（例「交给项目编排自己做」「交给 GLM 通道自己做」；0.2 写「交给它自己的那一行」，「行」是内部的词，评审 F30）「这次不用跑」「次数太多，合进下一次」「在等规则放行」「被规则拦下」「先存着」「没成功」「放太久，作废了」；快照 →「存档」；流水 →「变更记录」；门禁 →「合入前的检查」；门禁工作树 →「专门做检查的那份检出」；标定 →「练习题」；行（插件行）→ 插件名（`pluginLabel`，「项目编排」「GLM 通道」）；持有者会话 →「主 Agent 的会话」；去重键 → 不显示，写「同一件事」。事件 id、条目 id 只作小字。L2 对全部固定字串跑 `plainWordsIn`（验收第 21 条）。0.1 第 4 项的页面说法与草图里有「门禁」两个字，验收的检查过不了（评审 F14）；那一项现在是 M7 的 `execute.trunk`，本稿给它的说法是「在专门做检查的那份检出里跑一遍合入前的检查」（§5.1），草图同改。

## 9. 存储与恢复

### 9.1 文件

存放照 `d-rules-in-repo`（「一样进仓库和项目目录」）与 `d-memory-scope`（全局只留 GLM 登录信息、ZCode 设备号、人设、关于人本人的记忆、整个账号的额度与用量、DSH 配置里的插件配置）：属于项目的都在项目里，要评审、要随 git 走的进仓库，运行时的进项目的 `.llm/`。0.4 §9.1 的「用户级目录按项目分」（`<userHome>/loops/projects/<键>/`）删去。

```
<项目根>/docs/loops/                       仓库里，入 git（人加的条目与脚本；只由循环板写，loops:files-only）
  entries/<id>.json                       人加的一项（id 为 u-<8 位十六进制>），§2.1 的 LoopEntry 去掉 rev 与 status；
                                          JSON 两格缩进、键按固定次序、末尾一个换行，所以 git diff 读得懂
  scripts/<id>.<后缀>                      这一项的脚本，字节就是人同意的那一份（UTF-8，换行为 \n）；条目里的 script.sha256 照它
                                          （动作为 check 的条目没有脚本文件：人同意的那一条命令就在条目文件的 action.argv 里）

<项目根>/.llm/loops/                       项目的 .llm/，不进 git（目录里自带一个内容为 * 的 .gitignore，同 metrics:§3.3）
  .gitignore                              第一次建目录时以 wx 写 *（已在就不动），不改项目自己的忽略配置
  journal.jsonl                           人的条目与提议的变更记录（只追加；每条带写后的全文，脚本条目连脚本原文）
  repo-written.json                       循环板最近一次写成的仓库文件：{<条目 id>: {fileSha256, scriptSha256?, at}}，条目删掉写成之后那一项为
                                          {fileSha256: null, at}；写锁内以临时文件加改名写（§9.2 第 5 步）。变更记录里这一项最后一条的 fileSha256
                                          与它不同，就是循环板欠着一次写；相同而文件变了、没了，就是在循环板之外变的（§9.3；0.6，评审 F44）
  tmp/                                    写仓库里的文件之前的临时文件（§9.2 第 5 步），崩溃留下的在下一拍清掉超过 1 小时的
  write.lock                              写锁（存储与收件箱共用）
  events.jsonl                            项目收件箱（§6.3）；events-<时刻>.jsonl 为轮换下来的
  state.json                              运行状态：bindings、收件箱位置、keys（与第一次见到的时刻、近 24 小时的次数）、held（带原因）、
                                          待跑（含限次攒着的与没跑完那次的事件）、host、last、每项的 lastResultAt 与近 28 天的运行数、
                                          近 7 天的超时数、sources（每个来源的名字空间、最近一次交来与撤回的时刻，F41）、
                                          已确认的恢复、holder（上一次的 holderState 与原因、找不到的会话、上一次 writer-held 的时刻、
                                          elsewhere 开始的时刻、上一次读到「没有持有者记录」的时刻）（可重建的缓存）
  runner.lock                             项目的运行锁（§6.1）
  handover.json                           主 Agent 的会话在不持锁的进程里打开时，那个进程要锁（§6.1）
  main-step.json                          主 Agent 最近一次走步 {session, at}，任何进程都写，后写的算数（§6.1、§6.9 第 4 条）
  removed-tasks.jsonl                     循环板删掉的每一条 DSH 任务的全文与原因，删之前写（§6.2「删任务的规矩」）；只追加，保留 30 天
  runs.jsonl                              运行记录（指标流水合入之前，§6.10；合入之后换成 .llm/metrics/）
  notes.jsonl                             主 Agent 记的结论
  view.json                               给页面的一份（§8.4）
  logs/<entry>/<时刻>.log                  脚本输出（§6.6）
  run/<run>.<后缀>                         跑的那一刻核对过的脚本副本，跑完删（§6.6）

<userHome>/loops/machine/                 用户级，只放账号一级的事（GLM 额度与登录的提醒只说一次，M6-L4）；userHome = glmHournessData.userHome
  runner.lock                             机器一级的运行者（§6.1）
  state.json                              上一次的登录状态、loginRejectedSince（§4.3）、用量流水读到的位置、上一次读额度的时刻、机器一级的 held
  told.json                               账号一级已说过的事（§6.4）；只有机器一级的运行者写
  last-step.json                          最近一次走过步的主 Agent 在哪个项目；各进程以改名覆盖，后写的算数
```
（0.5 在这里还有一份 `runs.jsonl` 记 `loop-read`，是每个项目之外的一份流水；0.6 把 `loop-read` 写进 `last-step.json` 指向的那个项目的运行记录，`machine/` 只留提醒要的状态，评审 F52，§6.10。）

- 插件的条目不在任何文件里：它们在交来它的那一行的代码里，循环板每次读时与人的条目合在一起；进程重启后各行重新交（§3.1）。
- 为什么 `docs/loops/`：要可评审、随 git 走、换电脑与换人都在（`d-rules-in-repo` 的原话），所以入库；放在 `docs/` 下与项目图（缺省 `docs/graph/`）挨着，人在仓库里一眼看得到。`.hourness/` 不用：M7 把它当报告目录，建工作树时把 `/.hourness/` 追加进 `<git>/info/exclude`（M7 0.4 建工作树那一步），不进 git。规则板的条目与脚本放在哪由规则板定（rules:§7.1：仓库的 `docs/rules/`，运行时的 `.llm/rules/`）；共用的执行器只要求脚本在项目根之下。
- 为什么 `machine/` 留在用户级：额度与登录是整个账号的，同一件事整台机器只说一次（M6-L4），它属于 `d-memory-scope` 与 `docs/CHARTER.md` 0.7 §9 用户级一行里「整个账号的额度与用量」一类。说清楚里面有什么（评审 F52）：只有额度与登录这两件提醒自己的状态，即机器一级的运行锁、上一次的登录状态与读额度的时刻、已经说过的事（`told.json`）、最近有主 Agent 走步的是哪个项目（`last-step.json`，只记路径）。没有条目、没有运行记录、没有任何一个项目的内容；`loop-read` 这一种记录写进项目里（§6.10）。
- `.llm/` 只从项目根算（§2.1），不从数据目录服务的 `projectHome` 取（同 metrics:§3.3 的理由：那个值在桌面版上所有工作区共用）。会话的工作目录不在任何 git 仓库里时，这个会话没有循环板，页面写「这个会话不在一个 git 项目里，没有循环板」；不在随便一个目录里建 `.llm/`。
- 探针与标定的每个场景是新初始化的 git 仓库（`docs/ORCHESTRATION.md` §10.5.1），场景里的循环板自然落在场景自己的 `docs/loops/` 与 `.llm/loops/`，与真实项目互不影响；用户级的 `machine/` 照旧由数据目录行指向场景自己的目录（`docs/DEVELOPMENT.md` §3）。数据行不在时只是没有账号一级的那两项，项目里的循环板照常。
- 条目文件进了 git，就会随合并、拉取、切分支、`git stash`、`git revert` 一起变。循环板不跟 git 走，也不把 git 带来的变化写回去（0.6，评审 F44）：它在每一拍与 `docs/loops/` 的文件变化（`fs.watch`）时重读，按 §9.3 判断每个文件是自己写的、自己欠着没写完的、人同意过的，还是在它之外变了；分得开「欠着的写」与「git 带来的变化」靠的是 `repo-written.json` 记着它自己最近一次写成了什么。切到一个没有某个条目的分支、或 `git stash -u` 收起了还没提交的条目，那一项在这份检出里就不在了：不跑，页面写明，到点任务按 §6.2 的 `entry-gone`「暂时不在」处理；`git revert` 把条目改回较早的一版，那一版不跑，等人再同意或打 `/loops restore`（§9.3）。git 正在合并、变基、拣选、回退或二分时，循环板不往 `docs/loops/` 里写，也不重判那里的文件（§9.2 第 5 步、§9.3）。

### 9.2 写入

1. 校验请求结构（§12）与身份（§13），不合返回 `invalid` 或 `forbidden`。
2. 取写锁：以 `wx` 创建 `.llm/loops/write.lock`，内容 `{pid, startedAt, token}`；已存在且持有超过 10 秒，改名为 `.stale-<毫秒>` 后重取；否则每 25 毫秒重试，2 秒内取不到返回 `busy`。做法同 rules:§7.4 第 2 步；M5 的 `src/data/lock.ts` 先合入就用它。
3. 读最新状态（仓库里的条目文件，加变更记录里每一项最后一条）；带 `rev` 的写入核对修订号，不等返回 `stale_revision`。
4. 追加一条变更记录并 `fsync`：`{seq, at, actor, op, id, before, after, relay?, question?, proposal?, via}`。`op` 为 `propose`、`supersede`、`show`（`via: 'board'` 的带脚本提议，第一次 `/loops accept` 把原文给人看过，§7.1 末段）、`accept`、`reject`、`expire`（提议）与 `add`、`edit`、`delete`、`restore`、`repin`、`external`、`adopt`、`ack`（条目、恢复与确认；后三种见 §9.3）。每条都带这一项写后的全文 `after`（删除时 `after.status` 为 `deleted`），脚本条目另带脚本原文 `after.scriptText` 与条目文件的 `after.fileSha256`（写进仓库的那份 JSON 的字节的 SHA-256），所以重放不需要上一条也能得到这一项的状态，`/loops restore` 也写得回。提议的 `after` 除了 `body`、`reason`、`via`、`status` 之外，还带提出时算好的 `describe`、`cautions`、`detail?`、`digest?` 与脚本原文（§7.1 第 1 步，评审 F37），之后的 `supersede`、`show`、`accept`、`reject`、`expire` 原样带着这几样。
5. 写仓库里的文件：git 正在合并、变基、拣选、回退或二分时（`<git 目录>/MERGE_HEAD`、`REBASE_HEAD`、`CHERRY_PICK_HEAD`、`rebase-merge/`、`rebase-apply/`、`BISECT_LOG` 或 `index.lock` 在，工作树的 git 目录按 `.git` 文件里的 `gitdir:` 找到，同 rules:§7.1、§7.4 第 7a 步）先不写，变更记录已经追加、这一项已经生效（判定按变更记录，§9.3 第一行），`docs/loops/` 里的文件欠着，拥有运行锁的进程每一拍看一次这些标记，都不在了再写（评审 F44：免得循环板的写入夹进 git 正在做的合并或回退里，把它刚换好的文件又覆盖掉）。没有 git 操作在进行时：先脚本、后条目；每个都先写到 `.llm/loops/tmp/<随机串>`、`fsync`，再改名到 `docs/loops/scripts/` 或 `docs/loops/entries/` 里的目标（同一个项目根下，同一个卷，改名是原子的；临时文件不落在 `docs/` 里，崩溃留下的不会被误提交）；删除时先删条目文件、后删脚本；都写成之后以临时文件加改名更新 `repo-written.json`（这一项记 `{fileSha256, scriptSha256?, at}`，删掉的记 `{fileSha256: null, at}`），所以 §9.3 分得清「循环板欠着写」与「在它之外被改」。Windows 上改名遇到 `EPERM`、`EBUSY` 按 20、40、80、160、320 毫秒重试 5 次，仍失败就留着临时文件，下一次读时按 §9.3 补上（同 rules:§7.4 第 7 步）。0.4 的这一步写的是用户级目录里的快照 `entries.json`；0.5 没有快照，仓库里的文件就是现在的样子，变更记录是它的来历；0.6 加 `repo-written.json` 与 git 操作时先不写（评审 F44）。
6. 释放锁；发一次对账（§6.2）与 `view.json` 重写。

人的条目一个项目至多 50 项（`invalid`：「已经有 50 项了，先删掉不用的」）；`open` 的提议至多 20 条。

### 9.3 读与恢复

| 读到的情况 | 处理 | 页面与行健康 |
| --- | --- | --- |
| 一个条目文件的 SHA-256 等于变更记录里这一项最后一条的 `fileSha256` | 照它跑（脚本每次跑之前另按 `script.sha256` 核对，§6.6） | 无 |
| 变更记录里这一项最后一条比文件新，而且 `repo-written.json` 里这一项的 `fileSha256` 也与最后一条不同（循环板欠着一次写：上次在 git 操作当中，或写到一半宿主退出）：文件等于前一条的 `fileSha256`，或 `add` 之后文件还不在 | 没有 git 操作在进行时按最后一条的全文把文件补写完（脚本连同），写成之后更新 `repo-written.json`；有 git 操作在进行就等（§9.2 第 5 步） | 无（日志 info）；补写之前页面这一项写「条目文件待写回（git 正在合并或变基）」（0.6，评审 F44） |
| 变更记录里这一项最后一条比文件新，而 `repo-written.json` 里这一项的 `fileSha256` 等于最后一条（循环板已经写成，之后文件被别处改成了较早的一版：`git revert`、`git checkout <旧> -- docs/loops/…`、手改回旧内容） | 当成「在它之外变了」（下一行）：这一项不跑，结局 `refused`（`entry-changed`），不把较早的那一版当成欠着的写补回去 | 同下一行 |
| 文件与变更记录里这一项记过的每一个 `fileSha256` 都不同，且不是上面两种「欠着的写」（有人手改、合进来的提交、拉来的改动、`git revert`） | 这一项不跑，结局 `refused`（`entry-changed`）；变更记录追加 `op: 'external'`（带新的文件哈希，同一个哈希只记一次）；人要照现在的样子接着用，主 Agent 提 `repin`（§7.1），人看过原文同意之后照它钉住；人要回到上次同意的那一版，`/loops restore <id>` 照变更记录写回 | 「要你看一眼的」：「「<名字>」的条目文件在循环板之外被改过，先不跑」；行健康 degraded 一次 |
| 一个条目文件不在了，而变更记录里它最后一条不是 `delete`（切到没有它的分支、`git stash -u` 收起了未提交的添加、`git` 删了它） | 这一项在这份检出里不在：不跑，结局 `refused`（`not-in-checkout`，`state.json` 的 `last` 里标着，不反复写变更记录）；到点任务按 §6.2 的 `entry-gone`「暂时不在」处理；切回有它的分支、`git stash pop` 之后文件回来、SHA-256 又对上第一行，照常跑，不要新的同意 | 「要你看一眼的」：「「<名字>」在当前检出里没有（切了分支、回退或被 git 删了）：要接着用，在输入框打 /loops restore <id>」 |
| 文件的 id 在变更记录里从没出现过（新克隆、`.llm/loops/` 丢了、队友加的随拉取带来） | 照图上人的拍板认回：`source.question` 是图上一张提议式待决，状态 `done`，正文末行是 `loopProposalLine(source.proposal)`，最后一条 `decide` 的身份是 `human` 或带 `relay` 的 `llm`；另核对文件里的内容就是人看过的那一份——条目文件按 M3 的规整（NFKC、空白合一）后，`entries/<id>.json` 的脚本块等于 `scripts/<id>.<后缀>` 的字节、`script.sha256` 与它相符（检查条目是 `action.argv` 等于 `commandText` 写出的那一条），对不上就当「对不上」处理（评审 F51：循环板在新克隆上比的是内容，不只认一条图决定，连着改了的条目与脚本不会凭一张旧待决就跑）。对得上就追加 `op: 'adopt'`、照它跑，写一次 `repo-written.json`；对不上（没有这张待决、没拍、`via: 'board'` 的条目在这台电脑上没有记录、内容与待决里的不符）就不跑，结局 `refused`（`unadopted`），要用就由主 Agent 照常提议、人同意 | 认回的：来源一行写「在别处同意、随仓库带来的」；没认回的：「「<名字>」在这台电脑上没有你同意的记录，先不跑」 |
| 条目文件读不出（空、全零、截断、不是 JSON、不合 §12） | 这一项不跑；变更记录里有它时 `/loops restore <id>` 照最后一条写回；没有时页面写「跟主 Agent 说「从 git 里恢复 <路径>」」 | 「要你看一眼的」一行（验收第 20 条）；行健康 degraded |
| 变更记录最后一行没有以换行结尾 | 把这一行的字节存进 `.journal.corrupt-<时刻>`，截掉，再按上面判断 | 「变更记录的最后一条没写完，已丢掉」 |
| 记录中间有读不出的行 | 跳过它，继续往后读；因为每条带全文，后面同一项的记录照样生效，只丢那一次的版本；整份复制到 `.journal.corrupt-<时刻>` | 「要你看一眼的」一组：「变更记录第 N 行读不出，已跳过；涉及的那一项按之后的记录显示。知道了就在输入框打 /loops ack」；行健康 degraded，直到人打 `/loops ack`（进记录，`op: 'ack'`） |
| `state.json` 读不出 | 重建：`bindings` 从 `schedule.catalog()` 按提示文字的第一行认回（指纹取那一行的记录）；收件箱位置取文件末尾（不补处理）；`keys` 从收件箱最近 7 天的行取（第一次见到的时刻取那一行的 `at`）；`holder` 从下一次 `holderState` 重新判；`last` 从运行记录末尾取；`held` 与待投的消息正文只存在 `state.json` 里，丢了就丢了：运行记录里有 `loop-fired`、没有 `loop-done` 的那些运行各补一条结局 `expired`（原因 `state-lost`） | 「循环板的运行状态坏了，已重建；停机期间的事件这次没有补，先存着的 N 条消息丢了」，列出这 N 项的名字 |
| 机器一级的 `state.json` 或 `told.json` 读不出 | 重建为空：登录状态从下一拍重新看（`rejected` 时会再说一次；`LoginView.since` 没有时 `since` 取这一拍，键因此不同，同一次被拒最多再说一次），已说记录清空（额度快用完这一期可能再说一次） | 行健康 info 一次 |
| `removed-tasks.jsonl` 读不出或最后一行没写完 | 不影响运行（循环板只往里追加，不读它做判断）；坏的那一行原样留着，下一行另起 | 无；写不进时见 §6.2「删任务的规矩」：不删 |
| `docs/loops/` 与 `.llm/loops/` 都不在 | 空 | 无 |
| `.llm/loops/` 不在、`docs/loops/` 里有条目 | 建目录与 `.gitignore`，每个条目照上面「从没出现过」一行认回 | 「循环板的运行记录是新建的」一次 |

人的条目此刻的样子以仓库里的文件为准；它是不是人同意的那一版，以变更记录与图上的拍板为准（上表前四行），两样对不上就不跑。这一层防的是改过的条目或脚本照样跑（误改、合进来的改动、拉来的改动），不防有意的伪造：同时改条目文件、在变更记录里补一行能对上的记录的写入者，要先绕过 `loops:files-only`（§13），它的命令文本留在会话日志里，事后查得到（同 rules:§2.5 对规则文件说的那一层）。`state.json` 里的东西都是可以重新推出或可以丢的，丢的时候有记录（`expired`、`state-lost`）。`state.json` 的写法同快照（临时文件、`fsync`、改名），由运行锁的持有者一个进程写，不会有两个写者。

## 10. 宿主契约与 rc.3 证据

### 10.1 用到的钩子、服务成员与载荷字段

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据；「新用」指循环行第一次用，实现时补进接口对照表与薄适配层 `src/shared/dsh-min.ts`。文件都在 `reference/dsh-desktop-0.2.1-rc.3/` 下。

| 接口 | 用在哪 | 证据 | 结论 |
| --- | --- | --- | --- |
| 服务 `schedule`（`ScheduleService`，服务名在构造里给出） | 绑定与对账（§6.2） | schedule:1992 `super(ctx, "schedule")`；`dsh-tool-schedule` 用 `ctx.schedule`，tool-schedule:540；Web 组合挂载，web-app `cordis.patch.yml`:139–140 | 新用〔实读〕；经 `ctx.get('schedule')` 取，不写进 `inject`（headless 没有它） |
| `schedule.create(sessionId, request, signal?)`：`title` 必填、去空白后 1–120 字符；`prompt` 非空；六个选择器恰好一个；返回存下的记录 | 建任务，记指纹 | schedule:2083–2112；标题 schedule:93–97；`every_seconds` 至少 60，schedule:21 | 新用〔实读〕 |
| 选择器形状：`daily {time, time_zone}`、`weekly {time, time_zone, weekdays}`、`cron {expression, time_zone}`、`every_seconds`、`at`（带偏移的字符串，或 `{date, time, time_zone}`）；键多一个少一个都拒 | 映射（§2.2） | schedule:1052–1059、1118–1123、1366、977–996 | 新用〔实读〕 |
| 记录的键：`at` 为 `id, kind, title, prompt, scheduledAt`；`every` 多 `everySeconds`；`daily` 多 `time, timeZone`；`weekly` 多 `time, timeZone, weekdays`；`cron` 多 `expression, timeZone`；解码要求键恰好这些 | 指纹（§6.2） | schedule:74–77、256–312、356–365、411–421、463–472、508 | 新用〔实读〕 |
| 规范化：`time` 写成 `HH:mm:ss.SSS`，时区取 `Intl` 的规范名 | 不自己再算规范化，比 DSH 返回的记录 | schedule:1056–1057、212–222 | 〔实读〕 |
| `schedule.list({sessionId})`：这个会话的活动任务的记录本身 | 改回时取 `expected` | schedule:2120–2122 | 新用〔实读〕 |
| `schedule.catalog()`：全部任务，每条是记录加 `sessionId`、`status`、`lastDelivery?`，按 `scheduledAt` 再按 id 排序 | 对账、页面、主 Agent 自己设的提醒 | schedule:2129–2136 | 新用〔实读〕 |
| `schedule.delete({sessionId, id}, signal?)` → `{id, deleted, code?}`；硬删除，连发送记录 | 搬任务、删条目、清孤儿 | schedule:2164–2182 | 新用〔实读〕 |
| `schedule.update({sessionId, id, expected, title?, prompt?, change?})`：`expected` 按整键解码，不合返回 `invalid_rule`；与当前记录不等返回 `schedule_conflict`；`schedule_not_found`、`schedule_ended`；规范化后等价的不写，返回 `updated: false`；`change` 只能有 `kind` 与对应的选择器 | 改回被人改过的任务 | schedule:2197–2224、1806–1837、1710–1716 | 新用〔实读〕 |
| 会话的拒绝：`reminderTargetRefusal` 只拒子会话（`subagent_session`）；已归档、已删的会话 `create` 照收（0.2 写「不能投递的会话」也拒，是错的，评审 F20） | 只记错误；归档与找不到由循环板自己查（`holderState`，§6.4） | schedule:2199–2200、2254–2261 | 〔实读〕 |
| 服务 `workspaceRegistry`：`archivedSessionIds`（getter，返回归档集合；服务没启动时抛错）；`archiveSession(id, {stopActivity})` 先写归档集合、再发 `workspace/session-stop`；`unarchiveSession` | `holderState` 判「已归档」（§6.4）；对账第 0 条（§6.2） | dsh-workspace:376、506–508、526–541、553–562、621–629、934–937；`dsh-api-workspace-controller` 也只经这个 getter 读归档集合（52、69） | 新用〔实读〕；从本行经 `ctx.get('workspaceRegistry')` 读得到〔未核实，V14〕 |
| `workspaceRegistry.list()`：按登记的次序返回全部工作区，每个有 `path`；不读盘；服务没启动时 `requireState` 抛错 | 行激活时列出要跑的项目（§6.1，0.5：持有者记录搬进各项目之后，用户级目录里没有项目清单） | dsh-workspace:454–460（`list`）、90（`path` getter）、934–937 | 新用〔实读〕；激活时读不读得到〔未核实，V17〕 |
| 事件 `workspace/session-stop`（`ctx.parallel`，载荷 `{sessionId}`；只在带 `stopActivity` 归档时发） | 持有者会话被归档时当场对账（§6.2） | dsh-workspace:540、623；定时服务（schedule:2056–2058）与 agent 注册表（agent:33–36）同样监听它 | 新用〔实读〕；本行的 `ctx.on` 收不收得到〔未核实，V15〕；收不到时每一拍的 `holderState` 照样在 60 秒内发现 |
| 归档门 `ArchivedSessionGate`：已归档会话（及其子会话）的每一步 `agent/pre-step` 回 `reject`，回合以 `blocked` 结束 | 理解「投进已归档的会话 = 谁也收不到」（§6.2） | api-session-controller:2491–2518、2528–2541、2979 | 〔实读〕 |
| 事件 `schedule/changed`：任务写入提交之后发，没有载荷，监听抛错被吞 | 触发对账 | schedule:2231–2237 | 新用；本行的 `ctx.on('schedule/changed')` 收不收得到〔未核实，V2〕；收不到时每 60 秒一拍的对账照样做 |
| 投递：`sessionController.resolveAgent(sessionId)` 恢复冷会话；`createUserMessage({content, source: {kind: 'schedule'}})`；`agent.followup(message)`；`sessions.flush(session)` 返回假即失败；失败只记日志，不自动重试；同一会话同时到期的重复任务合成一批；在 `agents.withoutInitiator` 里 | 理解 DSH 的投递、在主 Agent 那一步认出循环板的提醒 | schedule:1576–1598、1627–1640、1571、1531 | 〔实读〕 |
| 提醒正文：`[SCHEDULE REMINDER]`、`schedule_id_json`、`occurrence_at`、`reminder_prompt_json`；批次 `[SCHEDULE REMINDER BATCH]` 与 `reminders_json` | 认出循环板的提醒（§6.4） | schedule:1386–1418 | 〔实读〕 |
| 重启后每个重复任务只补最近错过的一次 | 漏跑（§6.8） | schedule:590、656、687、821；`dsh-schedule/README.zh.md`「概述」 | 〔实读〕 |
| 活动任务算会话的活动；归档要 `stopActivity`，带上时删掉这个会话的全部活动任务 | 归档的说明（§6.2） | schedule:2044–2058、2273–2292；dsh-workspace:512–516、623 | 〔实读，评审核对〕 |
| 服务 `sessionController` 与 `resolveAgent(sessionId)` → `{agent}` 或 `{error}`；错误码 `session/not-found`、`session/writer-held`（会话在别的进程里有写者）、`gateway/internal`；不查归档 | 提供循环板服务的条件（§3.1）；恢复冷的主 Agent 会话来投递、按错误码转 `held`（§6.4） | api-session-controller:2951–2952（构造与 `super(ctx, "sessionController", …)`，评审 F32 说是 2950–2951，见 §19）、3037–3039（`resolveAgent`）、210–212 与 221–246（委托的 `resolve` 与错误码，237、243、244） | 新用；从本行调用的效果〔未核实，V3〕 |
| `agents.get(id)`、`agents.withoutInitiator(op)` | 投递 | agent:596、414 | `get` 已用；`withoutInitiator` 新用〔实读，DSH 定时服务的同一用法〕 |
| `agent/created`（serial，`{agent, source, signal?}`） | 开始跑项目、投存着的消息、搬任务 | agent:581–585 | 已用 |
| 活 agent 的 `status`、`followup`、`steer`、`inject` 与唤醒标记 | 投递（§6.4 第 3 条） | agent-loop:790–793、800–814 | 已用（graph-panel 的 `/graph-run`、规则板的唤醒） |
| 收件箱的领取：下一回合领走下一步队列的全部与下一回合队列的一条；回合末尾查一次待领 | 理解 `inject` 与 `steer` 何时被读到 | agent-loop:101–111、1000–1008、1037 | 〔实读〕 |
| `agent/pre-step`（waterfall，`{agent, messages, turn, step, signal}`） | 在主 Agent 领到循环板提醒的那一步加一行；记主 Agent 走过步 | agent-loop:902–927；经公共库的 `installStepNotice` | 已用 |
| 没写来源的 `followup`、`steer` 被当成人的话；`update_goal` 的 `resume` 要当前回合有人直接说的话 | 循环板的消息带来源（§6.4）；高峰结束时模型不能自己恢复被阻塞的 goal（§6.9 第 4 条） | tool-goal:44–52、348–352 | 〔实读〕 |
| `goals.get(agent)` 的 `phase` 与阻塞原因码 | 唤醒方式、高峰结束的判断 | goal:611–614、880–888（rules:§6.6 已列） | 新用（规则板同用） |
| 会话头 `cwd`、`requestHeader().config.provider` | 项目键 | session:1820–1826、1612 | 已用（guard、`sessionRoute`） |
| `sessions.flush(session)` | 投递后确认落盘 | session:1950；schedule:1597 同一用法 | 新用〔实读〕 |
| `tools/pre-execute`（waterfall，`(exec, next)`）；`exec.name`、`exec.arguments`、`exec.agent`；拒绝结果 | 规则 `loops:schedule-tools` | tools:3321、3335–3346 | 已用（guard 框架） |
| 工具 `schedule_create {title, prompt, …}`、`schedule_delete {id}`、`schedule_update {id, …}`；后两者只作用于调用方会话 | 规则 `loops:schedule-tools` 的判定 | tool-schedule:540–600、637–647 | 〔实读〕 |
| `commands.register`；`recordInput` 默认记下参数 | `/loops` | commands:266、170、334–339 | 已用 |
| `tools.register` | `loop_show`、`loop_propose`、`loop_note` | tools:2968–2983（文档注释 2968–2973，方法 2974–2983；评审 F32 说的 2964 是上一个方法里的 `throw`，2980–2982 在 `register` 的方法体里，限制工具的 API 从 2984 的注释起，见 §19） | 已用 |
| `sessionProjections.register` 与 `init(header)` | 投影 `hournessLoops` | session-projection:68 | 已用 |
| 客户端 `remote.workspaceFiles.readBytes` 与 `changes` | 页面读 `view.json` | `dsh-api-workspace-files/README.md`:40、58 | 规则板新用，循环板照用 |
| Web 组合的 preset 挂载 `dsh-tool-schedule` 与 `dsh-time-context` | 主 Agent 自己设的提醒 | web-app `presets/cordis.patch.yml`:22–23、38–39 | 〔实读〕 |
| cordis `ctx.inject(names, cb)` 与 `ctx.provide` | 只在有会话控制器时提供服务；各行交条目 | `src/shared/dsh-min.ts`:303–310 的注释（cordis:1600）；`src/graph/panel-row.ts`:122、150 | 已用（对宿主服务）；对本包服务〔推断，V12〕 |

不用的：自定义 Remote 服务与新的 waterfall（第三方做不到，`docs/DEVELOPMENT.md` §5 第 6 条）；`agent/pre-step` 的 `reject` 与改动领走的消息（会丢消息，§6.2 第 1 种做法）；DSH 的 `schedule` Remote（客户端，§8.4）；`agents.currentInitiator`（0.1 用它推因果，本稿改用自己的异步上下文，§6.7）。

### 10.2 未核实与验证方式

| # | 什么 | 怎样验 | 不成立时 |
| --- | --- | --- | --- |
| V1 | 本行经 `ctx.get('schedule')` 拿到的就是 `ScheduleService`，`create`、`list`、`catalog`、`delete`、`update` 可调 | L3：探针覆盖层挂 Web 组合的 `schedule` 与 `session-controller` 行（沙盒模板没有它们，场景照 guard 影子场景的做法加） | 到点告诉主 Agent 的条目不跑，行健康 degraded「拿不到 DSH 定时服务」；事件条目照常 |
| V2 | `ctx.on('schedule/changed')` 在本行收得到 | L3 同上 | 只靠 60 秒一拍的对账，验收第 6 条的 60 秒仍成立 |
| V3 | 本行调 `sessionController.resolveAgent` 能恢复冷的主 Agent 会话，恢复出的 agent 投 `followup` 后照常开一回合 | L3（冷会话的场景：建会话、释放、再投） | 冷会话只等它下一次 `agent/created` 再投（同 `wake: false`），页面写「主 Agent 的会话没打开，打开后才收到」 |
| V4 | 主 Agent 换会话后旧会话的任务删掉、新会话的任务到点照常投 | L3（`/wish here` 的场景，平移时钟） | 对账照样按 catalog 修正，验收第 5 条改为 L4 |
| V5 | 宿主被强杀后 `cleanExit` 缺失、正常退出时写下 | L4（任务管理器结束进程；正常退出） | `crashed` 只按开机时刻判（只认重启电脑） |
| V6 | DSH 程序文件的位置：Electron node 模式下 `process.resourcesPath` 有没有值；没有时用 `path.dirname(process.execPath)` 下的 `resources/app.asar` | L4（桌面版里打一行日志） | `appChanged` 恒为假，页面在用到它的条目旁写「看不出 DSH 有没有更新」 |
| V7 | Windows 上两个进程在同一把 `write.lock` 下追加收件箱不丢行 | L2（两个 Node 子进程各写 200 行，同 rules:§14 的做法） | 改为每个进程写自己的收件箱文件 `events-<pid>.jsonl`，读的一方合并 |
| V8 | 0.5 删去：0.4 要核实的是「主 Agent 在高峰停着时读到 §6.9 的那一行就只回一行」；主 Agent 不受高峰影响之后没有那一行了（`d-main-agent-peak-exempt`） | — | — |
| V9 | 主 Agent 有 active 的 goal 时，`inject` 进去的消息不被 goal-round-driver 当作竞争输入（rules:§15 V3 的同一件事） | 随规则板 V3 的 L3 | 改为等这一轮结束、agent 空闲时再 `inject` |
| V10 | DSH 到点投来的提醒（`followup`）在主 Agent 正由 goal 驱动时进来，驱动器把它当竞争输入作废这一轮的预约（goal-round-driver:249）之后，处理完提醒是否照常开下一轮 | L3（goal 驱动中投一条到点提醒） | 循环行在那一步的那一行末尾加 `When this is done, continue the goal you were driving.`；仍停住时记进 dogfood 的复盘，并报给 M7 |
| V11 | `steer` 进运行中的主 Agent 的消息在这一回合里被读到（唤醒标记在回合末尾的检查之后仍生效） | L2（假宿主照 agent-loop:809–811、1037 的样子）与 L3 | 退回 0.1 的 `inject`，并在回合结束时（`agent/turn-end` 一类的事件，监听方式没有核对）补投滞留的那条 |
| V12 | `ctx.inject(['glmHournessLoops'], …)` 对本包 `ctx.provide` 的服务与对宿主服务同样生效：服务后到时回调被调、撤回时子上下文被销毁 | L2（真实 cordis，两个假行）与 L3 | 交条目的一方改为每次 `agent/created` 调一次 `contribute`（同一个来源再交是替换，§3.1）；`dispose` 放在它自己的 `ctx.effect` 里 |
| V13 | 0.6 已答，答案是否（评审 F56）：图引擎对字段不变的 `set` 返回 `invalid`「set changes nothing」（`src/graph/engine.ts`:613〔实读〕，M4 在 `schedules` 节点 07:12 批注第 ⑦ 点同记），所以 `loops.remind-waiting` 不能用 `propose_to_human` 的 `question` 把四行没变的同一张待决重新给人看。0.5 的文字已改为退路写法「每件一行题目与要人做什么」（§5.2 第 12 项）；M3 加了不带四行、只把已有待决再给人看的 `propose_to_human` 之后，在同一次改动里换成用它 | — | 不适用：已按退路写 |
| V14 | 本行经 `ctx.get('workspaceRegistry')` 拿得到宿主的 `WorkspaceRegistry`，`archivedSessionIds` 在归档之后立刻含那个会话 | L3（探针场景 `loops`：建会话、`/wish`、`archiveSession(id, {stopActivity: true})`，读一次） | `holderState` 为 `unknown`（`archive-unreadable`）：照常投递，到点的三项照常建、绑在持有者会话上的一条都不删（§6.2 第 0 条，评审 F35），行健康 degraded「读不到归档状态：主 Agent 的会话被归档时循环板不知道」，页面写「循环板此刻看不清主 Agent 的会话」；归档之后的消息仍会被记成已投，只能靠这两处提醒人 |
| V15 | 本行的 `ctx.on('workspace/session-stop')` 在归档时被调用 | L3 同上 | 只靠每一拍的 `holderState`，归档之后至多 60 秒才删任务、转 `held`；这 60 秒里交的事件按 V14 的结果处理 |
| V16 | `resolveAgent` 对另一个 DSH 进程里打开着的会话返回 `session/writer-held`，对删掉的会话返回 `session/not-found`（api-session-controller:237、243） | L3（两个宿主进程共用一个 DSH 数据目录的场景；删会话的场景） | 错误码对不上时按「其余」重试三次再 `failed`，`holderState` 不变；交接（§6.1）仍按 `handover.json` 做 |
| V17 | 行激活时 `workspaceRegistry.list()` 已能读，或在之后几拍内能读 | L3（桌面宿主冷启动，循环行启用，人不打开会话，看 60 秒内有没有开始跑持有者所在的项目） | 项目只在它的会话出现时开始跑（§6.1）；到点的提醒仍由 DSH 投，只是事件要等人打开一个会话才处理 |
| V18 | Windows 上 `pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <副本>` 能跑 `.llm/loops/run/` 下的副本，退出码原样；`taskkill /T /F` 结束它起的子进程 | L2（真实的 `pwsh`，CI 与本机各一次） | `-ExecutionPolicy` 被组策略锁住时，`.ps1` 条目一律 `crashed`（`spawn`），页面写「这台电脑不让跑 PowerShell 脚本」，人可以改用 `node` 写 |
| V19 | `runCommand` 先经 `resolveProgram` 把 `argv[0]` 与解释器解析成 `PATH` 里项目之外的绝对路径（§6.6，评审 F53）再 `spawn(…, {shell: false})`：在 Windows 上 `node`、`git`、`.exe` 解析得到、起得了、退出码原样；解析到 `.cmd`、`.bat`（例 `npx`）时 `needsShell` 为真，不起进程，记 `crashed`（`spawn`）；工作树里放一个同名的 `node.exe` 不会被选中（跳过项目之内的目录）；解析不到时 `spawn` 本身若被调到得到 `ENOENT`、`.cmd` 经 shell 外会得到 `EINVAL`（§6.6；0.6 补 libuv 在 Windows 上先看 cwd、只试 `.com`/`.exe` 的事） | L2（真实的子进程，本机；放一个假 `node.exe` 在工作树里核对不被选中） | 照 §6.6 记 `crashed`（`spawn`）并写明原因，请 M4 的工具节点格式写能直接起的程序；不改成经 shell 跑 |

0.1 的 V9（ZCode 桌面版自己会不会定时读额度）删去：读额度的时机已由 M6 0.3 定为「GLM 有新用量之后、至多每 15 分钟」（m6:§4.4），本稿照做，不再取决于这一点。

## 11. 失败与降级

### 11.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| 没有数据目录服务 | 项目里的循环板照常（存放都在项目里，§9.1）；账号一级的两项（额度快用完、登录失效）不判，列出、灰显「没有用户级目录，这一项不判」 | degraded「没有用户级目录：GLM 额度与登录的提醒不判」（0.4 在这里整行 inactive：那时存放都在用户级目录） |
| 会话的工作目录不在任何 git 仓库里 | 这个会话没有循环板：投影的 `projectKey` 为 `null`，工具返回「这个会话不在一个 git 项目里，没有循环板」 | 不降级（同 metrics:§3.3：不在随便一个目录里建 `.llm/`） |
| 没有 `sessionController` | 不提供服务、不跑条目，只注册工具、命令与投影；M7 照它的退路执行事件条目 | info「这个进程不跑循环板（没有会话控制器）」；headless、探针与标定里本来如此，不算降级 |
| 有 `sessionController`，没有 `schedule` | 跑事件条目、命令条目与 harness 条目；到点告诉主 Agent 的几项不建任务 | degraded「没有 DSH 定时服务：到点告诉主 Agent 的条目不跑，事件条目照常」 |
| 工具或命令注册失败 | 撤掉本行全部注册 | inactive，写原因 |
| 一份交来的条目被整份拒绝或丢了几项 | 其余照常 | degraded，按（来源、id）各一次 |
| 计价服务形状不对，或 `loopDefaults` 里有不合的项 | 那几项不显示；`loopDefaultsOf` 自己按 id 报一次（m6:§5） | degraded，一次 |
| 规则服务、高峰模式服务不在 | 不攒消息，档位显示「在规则板上看」，第 14 项判不了档位时 `skipped` | 不降级，行健康写一行 |
| 没有 `workspaceRegistry`，或它的 `archivedSessionIds` 抛错 | `holderState` 不判归档（`unknown`，`archive-unreadable`），照常投递；到点的三项照常建，绑在持有者会话上的一条都不删（§6.2 第 0 条） | degraded「读不到归档状态：主 Agent 的会话被归档时循环板不知道」（V14） |

### 11.2 运行期

| 操作 | 失败的情形 | 可恢复吗 | 调用方得到什么 | 怎样发现与留痕 |
| --- | --- | --- | --- | --- |
| 存储写入（`/loops`、`acceptProposal`、`loop_propose`） | 取不到锁 | 是 | `busy`：「循环板正忙，没记上，再打一次」；`acceptProposal` 一分钟内按图补写 | 不记（没有写成） |
| 同上 | 修订号变了 | 是 | `stale_revision`：「这一项刚被改过，再打一次」 | 不记 |
| 同上 | 内容不合、身份不对 | 是（改了再提） | `invalid`（字段路径与人话）、`forbidden` | 不记 |
| 同上 | 写不进文件 | 视磁盘 | `io`：「写不进文件：<原因>」 | 行健康 degraded；宿主日志 warn |
| 同上 | 变更记录已追加、仓库里的文件没写成（改名失败、中途退出） | 是 | 已经返回的照返回；下一次读时补写（§9.3 第 2 行） | 日志 info |
| 读仓库里的条目 | 条目文件在循环板之外被改过、从没在这台电脑上同意过、读不出 | 是（`repin`、照常提议、`/loops restore`） | 这一项不跑（`refused`） | `loop-entry` 的 `external` 或 `adopt`；页面「要你看一眼的」；行健康 degraded 一次（§9.3） |
| `contribute` | 来源不合、名字空间被占 | 否（交的一方改代码） | `ok: false` 与原因 | 行健康 degraded；`loop-contribution` |
| 同上 | 几项不合 | 否 | `dropped` | 同上 |
| `emit` | 事件没声明、载荷不合、算不出项目 | 否（交的一方改代码） | `ok: false` 与码 | 行健康 degraded（按事件 id 一次） |
| 同上 | 取不到锁、写不进 | 是：内存里 10 秒内再试三次（§3.1，评审 F26） | 三次都失败才 `busy`、`io` | 第三次失败时行健康 degraded；事实在图上，晨报的例外一节照常推出（§6.3） |
| 同上 | 键少于三段或第一段不是事件名 | 否（交的一方改代码） | `ok: false`，`invalid`（「key must name one occurrence」） | 行健康 degraded（按事件 id 一次） |
| 处理收件箱 | 键 7 天内见过 | — | 不跑 | `loop-duplicate`；近 24 小时的数进行健康（info）；同一个键 24 小时内第 4 次时 degraded |
| harness 动作 | `run` 返回 `failed`、抛错、被拒、超过 6 小时 | 视动作 | — | `loop-done` `failed`；行健康 degraded 一次；有 `tell` 时交给主 Agent |
| `recordRun` | id 不是 `self` 条目 | — | 丢掉 | 计数进行健康 |
| 建、改、删 DSH 任务 | `ScheduleInputError`（内容不合） | 否（等条目或主 Agent 变化） | 这一项标「DSH 不收这个时间：<信息>」 | `loop-drift`；行健康 degraded |
| 同上 | 存储失败（DSH 的 promise 被拒） | 是 | — | 下一拍重试，连续失败按 1、2、5、10 分钟退避；宿主日志 warn |
| 同上 | `update` 返回 `updated: true` 以外的码 | 是 | — | `ok` 时删掉重建（§6.2 第 3 条，原因 `repair`）；`unknown`（`archive-unreadable`）时不删，下一拍再试，页面写一行 |
| 删 DSH 任务 | 删之前 `removed-tasks.jsonl` 写不进 | 是 | — | 不删，这一拍跳过这一条；行健康 degraded「没能记下要删的 DSH 提醒，先不删」（§6.2「删任务的规矩」，评审 F35） |
| 同上 | 持有者状态为 `elsewhere`、`unknown` | — | — | 绑在持有者会话上的不删（不在任何一种原因里）；页面写一行 |
| DSH 到点没投出 | 从 `scheduledAt` 与本进程开始跑这个项目的时刻中较晚的那个算起，过了 5 分钟 `lastDelivery` 没变（评审 F25） | 是 | — | `failed` 一次，循环行补投；`ok` 时删掉重建（原因 `not-delivered`），`unknown`（`archive-unreadable`）时任务留着，`elsewhere`、`unknown`（`holder-unreadable`）时不判（§6.2「到点之后」） |
| 读持有者记录 | `readHolder` 返回 `unreadable`（文件坏了、读不出） | 是 | — | `holderState` 为 `unknown`（`holder-unreadable`）：事件消息进 `held`，到点任务原样留着，行健康 degraded「读不出主 Agent 的记录：<原因>」；读得出之后照常（0.3 当作 `none`、会删任务，评审 F35） |
| 投给主 Agent | 没有主 Agent | 是 | — | `held`；24 小时后 `expired`；页面写原因 |
| 同上 | 主 Agent 的会话已归档、找不到（`holderState` 为 `archived`、`not-found`，评审 F20） | 是（人 `/wish here`，或取消归档） | — | `held`（原因写明），不调 `resolveAgent`；绑在它上面的到点任务删掉；`loop-holder`；页头与首页一行「主 Agent 的会话已归档：在一个会话里打 /wish here」；24 小时后 `expired` |
| 同上 | 会话在另一个 DSH 进程里打开（`session/writer-held` 或新鲜的 `handover.json`，评审 F33） | 是 | — | `held`（原因 `writer-held`）；运行锁在下一拍交给那个进程，由它投出；`loop-handover` |
| 同上 | 恢复会话失败、`flush` 为假、抛错 | 是 | — | 1、5、15 分钟重试；仍失败 `failed`，行健康 degraded |
| 跑脚本 | 起不来（找不到解释器、`-ExecutionPolicy` 被锁住） | 是（人改脚本或装解释器） | 按 `report`：没过算一次失败，交给主 Agent 的写「没跑起来：<原因>」 | `loop-done` `reported` 或 `ran`，`reason: 'spawn'` |
| 同上 | 哈希对不上、文件不在（`refused`） | 是（人再同意，或文件改回原样） | 不跑、不发消息 | `loop-done` `refused`；页面「要你看一眼的」；行健康 degraded 一次（§6.6） |
| 同上 | 私有副本写不进 `.llm/loops/run/` | 是 | 这一次不跑，下一次触发再试 | `loop-done` `failed`（`reason: 'io'`）；行健康 degraded |
| 同上 | 超时（循环板的脚本与检查，`work`/`check` 一路） | 是 | 结局 `unfinished`，不论 `report` 哪种都交给主 Agent，写「没跑完：超过 <秒> 秒」；这次合进来的事件留到下一次触发再跑 | 进程树被结束；`loop-done` `unfinished`；周报列出 7 天超时 3 次以上的（§6.11）。（0.6 改正 0.4 留下的「超时，已结束」「`reason: 'timeout'`」，超时是没跑完、不是没过，评审 F47） |
| 同上 | 退出码非 0 | — | 这是结果不是故障，按 `report` 交 | `exits` |
| 同上 | 日志写不进 | 是 | 结果里写「没有日志」 | 宿主日志 warn |
| 问规则板 | 排队 | 是 | — | `deferred`，24 小时后 `expired` |
| 同上 | 拦截 | 否（人改规则） | — | `blocked` 与规则 id；页面「要你看一眼的」 |
| 同上 | 规则板读不了 | — | 照常跑 | `rules-unavailable` |
| 读收件箱 | 一行读不懂、事件没声明 | — | 跳过、`expired` | 计数进页面「最近跑过的」末尾一行与行健康 |
| 运行锁、机器锁 | 别的活进程持有 | — | 本进程只显示 | 页面一行，行健康 info |
| 同上 | 旧锁 3 分钟没刷新或开机时刻不同 | 是 | 接手 | 改名的旧锁留着 |
| 读额度（机器一级） | `quota()` 抛错、被拒、返回 `failure` | 是 | — | `loop-read` `ok: false`；下一次新用量、满 15 分钟再读；GLM 包自己记失败（m6:§4.5） |
| 读用量流水 | 文件不在、读不出、行读不懂 | 是 | 这一拍不判 | 计数；连续 60 拍读不出时行健康 degraded「读不到用量流水，额度快用完这一项暂时不判」 |
| 写 `last-step.json` | 改名失败 | 是 | 下一次再写 | 无（最多让账号一级的事投给前一个项目） |
| 时钟回拨或跳变 | 下一次的时刻算错 | 是 | 每一拍按当前时钟重算 | 无 |
| 限次、自己触发自己 | 触发太多 | 是 | — | `suppressed`；插件的条目被限次时行健康 degraded |
| `loop_note` | 不是主 Agent、条目没有交给它的运行 | 是 | `forbidden`、`invalid` | 不记 |
| 运行锁交接 | 持锁的进程手上有正在跑的运行 | 是 | — | 等运行结束再交；期间投不出的进 `held`（§6.1） |
| 同上 | `handover.json` 写不进或过期，或那边的循环行没启用、一直不来要锁（评审 F36） | 是 | — | 不交接；投递遇到 `session/writer-held` 的进 `held`，标记只管 5 分钟，之后重试一次（对这个会话的 `resolveAgent` 每 5 分钟至多一次）；那边关了会话时下一次重试投出。连着超过 5 分钟时页头与首页写「主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去」，行健康 degraded 同一句；存着的消息 24 小时后 `expired` |
| `loops.peak-end` 调 `execute.resume-drive` | 返回 `failed`、抛错、被拒、60 秒没有结果 | 视原因 | — | 这次运行 `failed`；主 Agent 收到一句「接不上，跟人说一句」（§6.9 第 4 条第 3 行）；行健康 degraded 一次；页面「要你看一眼的」一行 |
| 同上 | 执行行没交这个动作（执行行没启用、它那一份被拒） | — | — | 不调，往下判（§6.9 第 4 条第 3 行）；M7 0.4 停住了也会在高峰结束 5 分钟后自己接上（§17 M7 第 6 条；0.4 这里写的「M7 在这种时候本来就不停住」是撤回了的旧建议，评审 F43） |
| 写 `main-step.json` | 改名失败 | 是 | 下一步再写 | 无；第 14 项读不出时按「走过」算（§6.9 第 4 条） |

### 11.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 删 DSH 任务 | 连发送记录一起删掉（schedule:2164–2182） | 只有一个函数删（`removeTask`，`src/loops/bind.ts`），两件事都成立才删（§6.2「删任务的规矩」，评审 F35）：能证明是循环板自己建的（在 `bindings` 里，或标题与提示文字第一行都是循环板的写法；agent 不能用这个开头建提醒，所以不会删到主 Agent 自己的）；能说出它为什么没用，原因只有八种，持有者状态为 `elsewhere`、`unknown` 时绑在持有者会话上的不在其中。0.3 在这两种状态下也删（对账第 0 条写的是「不是 `ok`」）：读不到归档状态时晨报、周报与巡检再也不建，会话开在另一个窗口时每一拍硬删。删之前全文写进 `removed-tasks.jsonl`，写不进就不删；页面「最近跑过的」列出每次删除；`none` 要连着两次对账都读到没有记录才删。循环板自己的运行记录另存，不依赖 DSH 的发送记录 |
| 人删自己的条目 | 条目不再跑 | 只标为已删，变更记录留全文，7 天内 `/loops restore` |
| 跑人同意的脚本 | 脚本自己可能有副作用，而且按时反复跑；同意即生效，没有试运行（`d-boards-as-hooks`） | 只跑人同意过的脚本，且同意之前人看到的是脚本原文与注意事项，由 harness 保证（评审 F21 的做法沿用）：原文由共用的 `scriptDetail` 写、作为一段附在四行之后（§7.1 第 1、2 步，不经模型转述）；`record_human_answer` 在拍板之前核对主 Agent 的回话里原样有脚本原文与每句注意事项，没有就不拍（第 3 步）；绕开 `record_human_answer` 的拍板没有「已给人看原文」的记号，不生效（第 4、5 步）；没有图时 `/loops accept` 先把原文给人、第二次才生效。同意之后：按内容哈希钉住，跑的是核对过的那份字节，改过就不跑（§6.6）；条目文件在循环板之外变了也不跑（§9.3）；超时结束整棵进程树、照条目写的告诉主 Agent（`d-script-timeout`）；最少的环境变量，拿不到凭证；先问规则板；页面与周报看得到跑了几次、结果怎样，随时能删、7 天内能恢复。剩下的：脚本调用的项目里别的文件不在钉住的范围里，注意事项写明，它们的改动经 M7 的合入检查与审查进主干（§1.5） |
| harness 动作 | 动作自己的效果（建 goal、在门禁工作树里重置、写证据） | 只调交来它的那一行声明过的动作；不可逆的那几步与它们的守卫在那一行里（m7:§3.8.3 第 5 步的门禁工作树守卫）；循环板不做 git 写操作 |

## 12. 外部输入的校验

人的条目经 `loop_propose` 的 `body` 进来，插件的条目经 `contribute` 与 `loopDefaults` 进来（后两者另见 §3.2、§3.4）。一项的字段对两边用同一个校验函数 `validateEntry(definition, origin)`（`src/loops/model.ts`），`origin` 为 `person` 或 `plugin`，只在下表写明的几处不同。

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `title` | 是 | 1–60 个码点，不含换行，去首尾空白 | `invalid`，`title` |
| `why` | 插件的必填 | 1–150 个码点，不含换行 | `invalid`，`why` |
| `when.kind` 为 `once` | — | `at` 是带时区偏移的 ISO 8601，严格晚于现在，至多一年后 | `invalid`，`when.at` |
| `every` | — | 正整数秒；告诉主 Agent 600–31,536,000；跑脚本与 harness 动作 300–31,536,000 | `invalid`，`when.seconds`，写下限与理由 |
| `daily`、`weekly` | — | `time` 为 `HH:MM`（00:00–23:59）；`timeZone` 经 `Intl.DateTimeFormat` 能构造（人的必写，插件的可空）；`weekdays` 为 1–7 的不重复整数，非空 | `invalid`，字段路径 |
| `cron` | — | 只配告诉主 Agent；恰好 5 个以空白分隔的字段，总长至多 100；其余由 DSH 校验，DSH 返回的 `invalid_rule` 信息原样给人 | `invalid`，`when.expression` |
| `event` | — | `events` 1–4 个，都在当前的事件表里；人的条目只能用 `personSelectable` 的；`filter` 的键与比法按事件声明（§3.1）；`params` 的键、类型与范围按声明，必填的不能缺；`loops.file-changed` 的 `path` 是存在的目录下的绝对路径，一个项目至多 20 个；`gate.` 开头的事件不收（§4.6） | `invalid`，`when.events` 或 `when.params.<键>`；拦路的事件提示「拦路的时刻归规则板：用 rules_propose」。仓库里已有的条目在这台电脑上目录不在时不报 `invalid`：这一项列出、不跑，页面写「这一项看的 <路径> 在这台电脑上不存在」（§5.5） |
| `command` | — | 只给插件的 `self` 条目；`names` 1–8 个命令名，每个匹配 `^[a-z0-9-]{1,32}$` | 那一项丢掉 |
| `filter` | 否 | 只配事件触发；键是每个列出的事件都声明了的字段，比法合声明（§2.2）；`in` 至多 50 个值；`paths` 至多 20 个写法；`matches` 至多 300 个字符、编得成正则、在固定的长输入上单个不超过 50 毫秒（§2.2） | `invalid`，`filter.<键>` |
| `action.kind` | 是 | 人的只能是 `tell-main`、`script` 或 `check`；插件的不能是 `script` 或 `check` | `invalid`，`action.kind` |
| `action`（`check`） | — | `tool` 是项目图上一个环境工具节点的 id，M4 的读法对它（与 `check`）读得出一条命令；`argv` 只由循环板写（提议时从节点读出），1–64 项、每项 1–2000 个码点、不含 NUL，`commandText(argv)` 至多 4000 个码点；`timeoutSeconds` 5–1800 的整数，缺省 60；`to`、`report`、`note`、`glmSpend` 同 `script` | `invalid`，`action.tool` 或字段路径；仓库里的条目读到时不合，按 §9.3 读不出的一行处理 |
| `action.text`（`tell-main`、`harness.tell`） | 是 | 1–2000 个码点；`{名字}` 只用声明过的字段，时间条目不能有 | `invalid`，`action.text` |
| `loop_propose` 的 `script`（动作为 `script` 的 `add`、改脚本的 `edit`） | 是 | `lang` 为 `pwsh`、`node`、`python`、`bash` 之一；`text` 1–4000 个码点、至多 100 行，不含 NUL（人在对话里看得完，§7.1 第 1 步）；`node` 的后缀为 `.mjs` | `invalid`，`script.text`，超长时提示拆开 |
| 仓库里条目的 `action.script`（`ScriptRef`） | 是 | `file` 等于 `docs/loops/scripts/<这一项的 id>.<lang 的后缀>`；`sha256` 64 位小写十六进制；`lang` 与后缀相符 | 这一项不跑，按 §9.3 读不出的一行处理 |
| `action.timeoutSeconds`（`script`） | 否 | 5–1800 的整数，缺省 60 | `invalid` |
| `action.to`（`script`） | 否 | `main` 或 `event-session`；`event-session` 只配信封里有 `session` 的事件 | `invalid`，`action.to` |
| `action.report` | 是 | 三者之一 | `invalid` |
| `action.note` | 否 | 至多 500 个码点 | `invalid` |
| `action.glmSpend` | 否 | `optional` 或 `necessary` | `invalid` |
| `limits` | 否 | `debounceSeconds` 0–3600，`maxPerHour` 1–60 | `invalid` |
| `quiet` | 否 | `from`、`to` 为 `HH:MM`，不相等；只配告诉主 Agent 的事件条目 | `invalid` |
| `loop_propose` 的其余字段 | — | `kind` 为 `add`、`edit`、`delete`、`repin` 之一；`edit`、`delete`、`repin` 的 `entry` 是这个项目里仓库中有的人的条目；`entries` 只给 `delete`，1–3 个不重复的这样的 id，与 `entry` 二选一；`repin` 的那一项此刻是 `refused`（`script-changed`、`check-changed`、`entry-changed` 或 `unadopted`），否则 `invalid`（「这一项没有改过，不用再同意」）；`reason` 1–300 个码点；`replaces` 是 `open` 的提议 | `invalid`，字段路径；插件的 id 为 `forbidden` |
| `/loops` 的参数 | — | 子命令为 §7.2 的五个之一；`<名字或 id>` 1–60 个码点；`<id>` 匹配 `u-[0-9a-f]{8}` 或 `lp-[0-9a-f]{8}` | 一行中文用法说明，什么都不写 |
| `loop_note.text` | 是 | 1–500 个码点 | `invalid` |
| `emit` 的输入 | — | `event` 在表里；`cwd` 是绝对路径；`key` 1–200 个字符，以 `:` 分隔至少三段、每段非空，第一段等于事件名去掉名字空间（§3.1）；`payload` 是对象，每个声明的字段类型对，没声明的字段丢掉；字符串字段至多 2000 个码点，`strings` 至多 200 项 | `ok: false`，`invalid` 或 `unknown-event`，`message` 写字段 |
| `HarnessResult` | — | `outcome` 三者之一；`reason` 1–300 个码点；`tell` 1–4000 个码点 | 当作 `failed`，`reason`「harness 动作返回的结果读不懂」 |
| `ListedRun` | — | `entry` 是当前的 `self` 条目；`outcome` 四者之一；数值有限、非负 | 丢掉，计数 |
| `details()` 的返回 | — | 字符串数组，至多 20 行，每行至多 160 个码点 | 多的截掉；不是数组时那一项写「<插件名>没给出明细」 |
| 收件箱的一行 | — | 能解析为对象，`event` 在表里，载荷合声明 | 跳过，计数 |
| `checkCall` 的结果 | — | 按 rules:§9.4 的类型 | 当作放行，记 `rules-unavailable` |
| `stateFor`、`stateForProject` 的返回 | — | `PeakModeState` 或 `undefined`；`glmWorkerCap` 有时是 1–16 的整数 | 当作没有（不显示档位与上限），行健康 info 一次（0.4 的 `heldForPeak` 不再读） |
| `runScript` 的结果（§6.6） | — | 四种之一；`exitCode` 为整数；输出为字符串 | 读不懂当作 `crashed`（`io`），结局 `reported` 或 `ran` 带原因 |
| 仓库里的条目文件 | — | JSON 对象，合 §2.1 与本表；`id` 等于文件名 | 这一项不跑（§9.3 读不出的一行） |
| `workspaceRegistry.archivedSessionIds` | — | 字符串数组；抛错或不是数组 | `holderState` 为 `unknown`，行健康 degraded（§11.1） |
| `quota().login.since`（M6 的 `LoginView.since`，可选） | 否 | 有限、非负的毫秒数，不晚于现在 60 秒以上 | 当作没有：用 `machine/state.json` 的 `loginRejectedSince`（第一次看到这次被拒的那一拍，§4.3，评审 F38） |
| `execute.resume-drive` 的结果（§6.9 第 4 条第 3 行） | — | 同 `HarnessResult`；60 秒内 | 读不懂当作 `failed`（「harness 动作返回的结果读不懂」）；超时当作 `failed`（`timeout`） |
| `handover.json`、`main-step.json` | — | JSON 对象；`at` 是 ISO 时刻、不晚于现在 60 秒以上；`pid` 正整数；`session` 非空字符串 | 读不出或不合：`handover.json` 当作没有（不交接）；`main-step.json` 按「走过」算 |
| M3 核对「给人看过」用的 `AttachDetail` | — | §3.1 的上限：`markdown` 1–6000 个码点；`mustShow` 1–8 片，每片 1–4000 个码点（0.4 的 800 与 1–13 片、每片 400 随脚本原文改掉；接缝核对时把这一行与 §3.1 对齐） | 不合时 `attachable` 返回 `ok: false`（「提议的原文坏了，重新提」），M3 拒绝 `attach` 或返回 `invalid` |
| 用量流水的行 | — | JSON 对象，`model` 为字符串 | 跳过，计数 |
| `quota()` 的返回 | — | `QuotaView`（m6:§5）；`login.state` 三者之一 | 这一拍不判，`loop-read` 记 `ok: false` |

## 13. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 人的条目只由人写（人直接写，或 harness 照人拍过、原话经 M3 核对的待决写） | 存储的 `apply`（`src/loops/store.ts`）；原话的核对在 M3 的 `record_human_answer` | 命令、工具与补写都经 `apply`，只在一处核对身份；原话只在 M3 一处核对 |
| 插件的条目不能被改、停、删 | 插件的条目不进存储；存储只收 `u-` 开头的 id | 没有可改的数据，也就改不了 |
| 插件的行为只在拥有它的那一行定义一次 | `contribute` 是交条目的唯一入口；循环行的代码不导入别的行的条目表（L2 静态检查：`src/loops/` 不导入 `src/execute/`、`src/operate/`、`src/env/`、`src/glm-llm/`） | 0.1 的两张表会走样（评审 F1） |
| 会跑东西的条目（脚本、检查）只能是人同意过的 | 校验：`script` 与 `check` 只收 `origin: 'person'`，`contribute` 交来的丢掉；存储只在 `acceptProposal`、`repin` 与 `/loops accept` 之后写脚本文件与检查的 `argv` | 条目会在人的电脑上按时跑；编排方的裁定「Check entries seam」：不论谁带来，都走同一条同意的路 |
| 跑的脚本就是人同意的那份字节 | 共用执行器 `runScript`（`src/loops/script.ts`）：核对哈希、执行私有副本；起子进程只在这一处（L2 静态检查：`src/loops/`、`src/rules/` 里别处不出现 `node:child_process`） | 两块板都经它，钉住的判法不会分叉；规则板不另起进程（接缝裁定） |
| 条目文件与脚本只由循环板写 | 规则 `loops:files-only`（循环行在 `tools/pre-execute` 上注册，用 guard 的规则框架，同 `rules:files-only` 的做法，rules:§2.5）：文件工具与 file-tools-only 判为写文件的 shell 命令，目标在任何一份检出（主检出与它的工作树）的 `docs/loops/` 之下、或项目的 `.llm/loops/` 之下，一律拒绝，带 `parent` 的子调用照样判，读不拦；绕过它的改动由 §9.3 的核对发现、不跑 | `d-rules-in-repo`：「规则文件由板自己写，门禁挡住其他写入」；门挡得住看得见的写法，核对兜住看不见的与合进来的 |
| 循环板的条目碰不到拦路的事件 | `validateWhen(…, {allowGate: false})`、`contribute` 的名字空间校验、`emit` 对 `gate.*` 返回 `unknown-event` | 拦下归规则板（§4.6），一件事不在两块板上各判一次 |
| 页面不写 | `ui/src/loops/` 不调用 `commands.execute`（L2 静态检查） | `d-ui-look-not-operate` |
| 一个项目同一时刻只有一个进程跑循环板；账号一级的事整台机器只有一处判 | 运行锁、机器锁 | 两处同时投就会重复叫醒主 Agent、重复读额度 |
| 每次运行都有记录 | 执行器的 `recordRun` 内部函数：执行前写 `loop-fired`，结局写 `loop-done` | 一个函数，所有执行者都调它 |
| agent 不能经 DSH 工具改循环板的任务、不能冒充循环板建提醒 | guard 框架上的规则 `loops:schedule-tools` | 在执行边界拦，模型绕不过；对账的改回是兜底 |
| 给模型的文字不带载荷里的换行与控制字符、不带密钥形状的字串 | `escapeForPrompt` 与结果格式化函数 `formatRunResult` | 交给主 Agent 只有这两条路 |
| 循环板的消息不算人的话 | `createUserNotice` 带来源 `glm-hourness-loop`（§6.4） | DSH 把没写来源的消息当成人的授权（tool-goal:44–52） |
| 主 Agent 任何一档都照常收到消息（`d-main-agent-peak-exempt`） | 投递函数（`deliver.ts`）不问高峰；`src/loops/` 不出现 `heldForPeak`（L2 静态检查） | 0.4 的「高峰停着时不叫醒停着的会话」随这条决定删去 |
| 不往已归档或找不到的会话投、不在上面建提醒，也不把这种投递记成已投 | `holderState`（`src/loops/holder.ts`），由 `bind.ts` 的对账第 0 条与 `deliver.ts` 的每次投递调用 | DSH 自己不挡（`create` 不查归档，`resolveAgent` 照样恢复），只能在循环板这一层；一个函数，两处调用，判法不会分叉（评审 F20） |
| 跑脚本或检查的条目，人同意之前看到的是脚本原文或命令行与注意事项 | 原文那一段的写法在 `scriptDetail` 与 `commandDetail`（`src/loops/script.ts`，`scriptDetail` 两块板共用）；附上原文在 M3 的 `propose_to_human`；核对「给人看过」在 M3 的 `record_human_answer`（拍板之前，fail-closed）；循环板的 `acceptProposal` 只认带「已给人看原文 <摘要>」的 `llm` 拍板 | 会话日志只有 M3 在读（同 `personSaid`），所以核对放在 M3；摘要把「看过的」与「要写入的」绑在同一版提议上，绕开 M3 的拍板在循环板这一层被拒（评审 F21） |
| 一个去重键只代表一次发生；重复的每一次都有记录 | 键的写法：交事件的一方（M7 的 `entries.ts`、循环行的 `events.ts` 与 `channel.ts`）；结构校验：`emit`；记录：`handleEvent` 写 `loop-duplicate` | 键里的「这一次」只有交事件的一方知道；循环板能查的只有结构，查不出的写错靠记录与「24 小时第 4 次」的报警发现（评审 F22） |
| 档位只由规则板判 | 循环行只经 `glmHournessPeakMode` 读（`stateFor`、`stateForProject`；L2 静态检查），判定只经 `checkCall`；上限的数只取 `glmWorkerCap` 或公共库的 `PEAK_REDUCE_GLM_WORKERS` | 档位与「本次照常做」的判断只在规则板一处（评审 F6、F23） |
| DSH 任务的内容以循环板为准 | 对账（`bind.ts`） | DSH 任务页能改，只能事后改回 |
| 只删能证明是自己建的、已经没用的 DSH 任务，删之前全文落盘；看不清主 Agent 的会话时一条都不删 | `removeTask`（`src/loops/bind.ts`），`schedule.delete` 只在这里调（L2 静态检查：`src/loops/` 里别处不出现 `schedule.delete`） | 删除不可逆；一个函数、一张原因表，判法不会在对账的几条里各写一遍（评审 F35） |
| 因高峰停住的自动推进只由 M7 恢复，循环板只在高峰结束时调一次 M7 的动作 | M7 的 `execute.resume-drive`（停住与恢复的判断都在 M7）；调用的时机在 `peak.ts`（§6.9 第 4 条第 3 行） | 原因码与恢复的规则只在 M7 一处；循环板不读 goal 的原因码来决定恢复，`execute.resume-after-peak` 那种由循环板挑 goal 的做法撤回（评审 F34） |

## 14. 隐私

- 记什么：指标流水与运行记录只有 id、时刻、结局、退出码、用时与字节数，不记命令输出、消息正文与人的原话（`metrics`：只记数与引用）。
- 原话：人在对话里同意加的那句话存在条目的 `source.relay` 与图上的待决里，同图上别的转述。
- 脚本输出：完整的在项目的 `.llm/loops/logs/` 里（在项目目录里，但 `.llm/loops/.gitignore` 把它排除在 git 之外），保留 7 天或最近 50 份；给模型的至多 40 行，先遮住密钥形状的字串。页面只显示日志路径，点开由人自己打开文件。0.4 放在用户级目录，`d-rules-in-repo` 之后随项目走。
- 环境：脚本拿不到 DSH 宿主的环境变量（§6.6），所以拿不到通道的凭证与 GLM 的 Key。
- 进仓库的只有人同意的条目与脚本原文，里面不该有密钥：脚本要密钥时从文件读（§6.6）；提议时脚本原文里有密钥形状的字串，`loop_propose` 返回 `invalid`（`script.text`，「脚本里像是有密钥：改成从文件读」，用同一组 `redactSecrets` 的模式判）。人的原话（`source.relay`）进仓库，同图上的转述。
- 额度与登录：机器一级的文件只存窗口名、已用比例、重置时刻、登录状态与时刻，不存令牌、Key 与请求头（同 m6:§12）；读用量流水只取 `model` 与 `at`。
- 本仓库的条目里写了本机路径（`C:\Program Files\ZCode\...`）：0.4 时它们只在用户级目录里；0.5 起条目进仓库，这个路径随之入库。它只是程序的安装位置，不是个人数据；别的电脑上不在时那一项不跑（§5.5）。
- 页面与 `view.json` 不包含 `held` 消息的正文以外的对话内容；`held` 正文是循环板与各行写的英文消息。

## 15. 可测性

- L2，纯函数：`trigger.ts` 的下一次时刻（每天、每周在 `Asia/Shanghai` 与一个有夏令时的时区里，缺的钟点跳过、重叠取较早；每隔；一次）；`validateEntry` 两种来源；`validateContribution`（名字空间、`hourness.` 的例外、占位、动作 id、个数）；`channelEntries` 对 M6 的四种 `when` 与两种 `runBy`；事件筛选（`paths` 的三种写法、`in`、`is`、`atLeast`）；去抖与合并；限次与攒着的事件；自己触发自己（异步上下文与命令的时间窗）；`report` 的三种；`escapeForPrompt`、`formatRunResult` 与脱敏；`commandText(script)`；`scriptDetail`（围栏长度随原文里的反引号变、按 `lang` 的信息串、`mustShow` 的片数、4000 个码点与 100 行的上限、原文里有密钥形状的字串时 `invalid`）与 `attachDigest`；`validateWhen` 与 `matchesFilter`（`filter` 在条目上、`matches`、glob 的 `*` 与 `**`、`allowGate`）；`loop_propose` 说明里的两个例子过校验（验收第 36 条）；`removeTask` 的 `entry-gone` 两种来由（评审 F41，验收第 26 条 (e)–(h)）；§9.3 条目文件的四种情形（对得上、补写、在外面改过、从没见过而认回或不认）；`staleEntries` 与 `timeoutEntries`（§6.11）；指纹（§6.2）；`loops.peak-end` 的判断表（§6.9 第 4 条的十行每一行一例；第 3 行的 `done`、`skipped`、`failed`、抛错、60 秒超时与执行行没交这个动作，少做与不做两档，持有者会话冷与热，冷会话恢复时假 M7 先接上、`skipped` 之后读到 active 记 `done`（评审 F40），无影响档不恢复冷会话；第 5 行少做与不做两档走同一条路（`d-main-agent-peak-exempt`）；第 2 行存「再判一次」、交接之后由接手的进程判、两边合起来 `run` 至多一次；第 9 行的四种原因码与冷会话先 `resolveAgent`；含 `main-step.json` 在别的进程写、读不出两例，以及按分钟往前找高峰起点）；`holderState` 的六种结果与 `unknown`、`elsewhere` 各自的两种原因，`writer-held` 的标记 5 分钟后作废、`elsewhere` 超过 5 分钟时的页头；`removeTask` 的八种原因各一例与「持有者状态为 `elsewhere`、`unknown` 时绑在持有者会话上的返回 `kept`」，`removed-tasks.jsonl` 写不进时不删；`none` 连着两次才删；`channel.login-rejected` 在 `LoginView.since` 有与没有时的键；提议的 `detail` 存下之后不随文件系统变；§4 每种事件的键写法（两次发生不同、同一次重放相同）与 `emit` 的键结构校验；`loop-duplicate` 与「24 小时第 4 次」；页面的视图模型（三组、来源一行、每种结局的说法、「每天大约叫醒 N 次」、归档时的页头与首页一行、少做的上限一句）与 `plainWordsIn`，并查页面字串里没有「行」作插件行讲。
- L2，存储：用真实的临时 git 仓库（同 rules:§14 的做法）：清零或截断的条目文件与 `/loops restore`、变更记录截断的末行、中间坏一行与 `/loops ack`、锁残留、改名失败（注入的 `rename` 模拟 `EPERM`）、变更记录写了而仓库文件没写成之后的补写、外面改了条目文件、新克隆没有 `.llm/loops/` 时照图上的拍板认回、`git status` 只列出 `docs/loops/`（验收第 32 条）、两个子进程同时追加收件箱（V7）。
- L2，脚本执行器（真实的子进程，`node` 与 `pwsh` 各一例，V18）：信封、环境名单、工作目录、超时与整棵进程树、两队互不等待、拦路的一路超时之后在后台接着跑与 10 分钟硬上限（注入的时钟把它缩短）、后台满 8 个时当场结束、私有副本（核对之后改文件不影响这一次）、哈希对不上与文件不在（验收第 30、31 条）。
- L2，与别的设计的接缝：临时目录里的真实图引擎与 M3 的 `record.ts`：`loop_propose` → `propose_to_human`（`attach`）→ `record_human_answer` 三种回话；带脚本的提议（4000 个码点的脚本，核对放得下）：`text` 与待决正文含原文段落，主 Agent 的回话里没带原文时 `not_shown`、带了时拍板并带摘要；`graph_decide` 带原话拍的跑命令提议在第 5 步补写时被拒；第 5 步的补写。真实的 `checkCall`（规则板 R3）。M7 的 `entries.ts` 交给真实的 `contribute` 全部被接受（M7 的 E8 测试与本稿的契约测试各钉一次）。`loopDefaultsOf` 用 M6 的 `GLM_LOOP_DEFAULTS`。
- L2，假宿主（`tests/fake-rc3.ts`）补这些 rc.3 的信号：`schedule` 服务（`create`、`list`、`catalog`、`delete`、`update` 的形状、整键解码与 `schedule/changed`，以及「到点」时按 schedule:1576–1598 的样子往会话里投一条来源 `schedule` 的消息）；`sessionController.resolveAgent`（含 `session/not-found`、`session/writer-held` 两种错误）；`workspaceRegistry.archivedSessionIds`（含抛错）与 `workspace/session-stop`；活 agent 的 `followup`、`steer`、`inject` 记下消息、目标与 `status`；`goals.get`；计价服务的 `peak`、`quota`、`loopDefaults`；高峰模式服务的 `stateFor`、`stateForProject`；`workspaceRegistry.list()`（含没启动时抛错）。用注入的时钟测去抖、限次、不做档的高峰里照常投给主 Agent（验收第 14 条）、高峰结束（少做与不做两档、一份假的执行行 `Contribution` 带 `execute.resume-drive`、冷会话、交接前后各一次）、停机补跑、开始跑项目之后 5 分钟才判「DSH 没投出去」。两个假宿主进程共用一个用户级目录，测运行锁的交接（验收第 28 条）。
- L3（`npm run probe` 新场景 `loops`）：真实宿主组合里 M7 的条目交进来；绑任务、到点投递到主 Agent 会话（平移时钟）；`schedule/changed` 的收到与否；冷会话的恢复；`/wish here` 后搬任务；`loops:schedule-tools` 拦三种调用；`hourness.handback` 到消息的 10 秒；脚本项的跑与报；`ctx.inject` 对本包服务（V12）；带 `stopActivity` 归档持有者会话之后任务删掉、交回 `held`（验收第 26 条，V14、V15）；`resolveAgent` 的两种错误码（V16）；冷启动时从工作区登记表开始跑项目（V17）；在桌面宿主里跑一段 `.ps1` 与一段 `.mjs` 脚本条目，环境里没有宿主的凭证变量（验收第 31 条）。
- L4（批次）：页面（三组、本项目加的、要改的那一行、首页一行、没有写入控件）、DSH 自动化任务页里看到「循环板 · 」的任务并在那里改一次看改回、归档主 Agent 会话时的提示、宿主强杀与正常退出、`appChanged`、真实的晨报在 08:30 出现在主 Agent 的窗口。

## 16. 实施分解

开工条件：本稿过独立评审，人读一页放行稿 `onepage.md` 后放行（`d-design-onepage`）。分支 `loops`，工作树 `.worktrees/loops`，从当时的 main 建。每步一个提交，文档与代码同一批。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰运行时的步另跑 `npm run probe`。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `loops`，`rows` 加 `{id: 'glm-hourness/loops', module: 'loops/index'}`；`packages/hourness/cordis.patch.yml` 里本行排在 `rules` 之后、`ui` 之前，`disabled: true`；`src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `loops`。

步的编号用 S，免得和验证的层级 L2、L3、L4 混在一起。

| 步 | 内容 | 依赖 | 验证 |
| --- | --- | --- | --- |
| S1 | `src/loops/trigger.ts`（两块板共用的形状：`Trigger`、`EventFilter`、`HookShape`、`ScriptRef`、`ScriptAction`、事件声明的类型，`validateWhen`、`matchesFilter`、`nextOccurrence`；规则板的 R6 先合入就用它建的，§2.2）、`src/loops/model.ts`（循环板的动作与 `validateEntry`）、`service.ts`（契约、读取函数、`attachDigest`）、`events.ts`（循环行自己的三个事件与它们的键）、`registry.ts`（`contribute` 与 `validateContribution`）、`defaults.ts`（循环行自己的四项）、`channel.ts`（`channelEntries` 与三个通道事件的声明和键） | 无；`channel.ts` 的类型来自 M6 Q1 的 `src/shared/channel-loop.ts`，没合入时这一个文件随 S7 | L2 |
| S2 | 存储 `store.ts`（锁、变更记录、仓库里 `docs/loops/` 的条目与脚本文件、`.llm/loops/` 与它的 `.gitignore`、§9.3 的核对、补写与认回）、`loops:files-only`、`/loops` 命令、投影 `hournessLoops`、`view.json` | S1；认回要图引擎读待决（已在 main） | L2 |
| S3 | 运行锁与拍、运行锁的交接（`handover.json`）、收件箱与 `emit`（键的结构校验、10 秒内三次重试）、`handleEvent`（去重与 `loop-duplicate`）、去抖与限次、`loops.host-restarted`、`loops.file-changed`（判定在 `file-watch.ts`，规则板 R6 先合入就由它建）、`loops.waiting-on-human`、`channel.peak-changed`；共用的脚本执行器 `script.ts`（`runScript`、两队、拦路一路的后台与硬上限、私有副本、`scriptDetail`、`commandText`；规则板 R6 先合入就由它建，§6.6；`runCommand` 与 `commandDetail` 随人加的检查，要 M4 的读法与填占位的纯函数合入，否则检查条目一律 `refused`、`check-missing`）与循环板的 `run.ts`；问规则板；harness 执行器 `harness.ts`；记录与 `runs.jsonl`；服务在 `ctx.inject(['sessionController'])` 里提供 | S2；规则板 R3（`checkCall`）合入，否则「问规则板」按 `rules-unavailable` 走，规则板合入的那一步补上；M6 Q1 或规则板 R4（`nextPeakChange`）合入，否则 `channel.peak-changed` 只靠每一拍比一次（至多晚 60 秒） | L2、L3 |
| S4 | `holder.ts`（`holderState`、`workspace/session-stop` 的监听、`loop-holder`）、`bind.ts`（对账第 0 条、建、搬、改回、孤儿、归档）、`deliver.ts`（唤醒表、`held` 与原因、`resolveAgent` 的错误码、`to: 'event-session'`）、`agent/pre-step` 的那一行与两份走步记录（`last-step.json`、`main-step.json`）、`loops:schedule-tools`、`peak.ts`（`loops.peak-end`）、`removeTask`（含 `entry-gone` 的等待，F41）与 `removed-tasks.jsonl`、工作区登记表列项目（§6.1） | S3；M3 的 `mainAgentOf` 与 `readHolder` 合入（持有者记录搬进项目 `.llm/` 的那一版，§17 M3 第 10 条）；`glmHournessPeakMode` 的 `stateForProject`（规则板 R4）合入，否则第 14 项按「读不出档位」走；M7 的 `execute.resume-drive` 没合入时第 14 项的第 3 行不调（执行行那一份的 `actions` 里没有它），其余照判 | L2、L3 |
| S5 | `loop_show`、`loop_propose`（含 `detail`、`repin`、`entries` 的批量删除、说明里的两个例子）、`loop_note`；`attachable`（带 `detail`）、`acceptProposal`（带脚本的提议核对摘要、写仓库里的文件）；`/loops accept` 的两次；对照与补写；`staleEntries` 与 `timeoutEntries`（§6.11） | S4；M3 第 6 步（`propose_to_human`、`record_human_answer` 的 `question` 一种）与 M3 的 `attach` 分派、`detail` 段落与「给人看过」的核对（§17）合入 | L2（真实图引擎与 `record.ts`）、L3 |
| S6 | 页面 `ui/src/loops/`、板块登记表的一项、首页一行；`pluginLabel` | S2；plain-ui 第 6 步（板块登记表）合入，之前是项目图页签里的一个视图，合入时移到第 2 层（同 rules:§9.1 的最小版） | L2（视图模型、静态检查）、L4 |
| S7 | 机器一级的运行者：锁、`last-step.json`、读用量流水、`channel.quota-low`、`channel.login-rejected`、`told.json`、`loop-read` | S4；M6 Q1（契约）与 Q2（额度读取与登录状态）合入；之前 GLM 包交来的两项列出但灰显「GLM 通道包还没有额度读取」 | L2、L3 |
| S8 | 各行改成交条目：M7 的 `entries.ts` 照 §3.1 的形状交（每项带 `why`）、照 §4.2 声明事件并按「键」一栏生成键、`run` 接 `runAction`（结局照 §6.5 的口径）；M4 的 env 行与图行各交一项；`hourness.outside-advance`；M7 的高峰等待停住与 `execute.resume-drive`（§17 M7 第 6 条；0.3 写的 `execute.resume-after-peak` 撤回）；M7 的周报读 `staleEntries`、`timeoutEntries`（§17 M7 第 8 条）；规则板经 `src/loops/trigger.ts` 与 `script.ts` 写它的条目与拦路脚本（§17 规则板一条） | 各自合入之后，由各自的步带上；循环板这一侧只有契约测试 | 各自的 L2、L3 |

批次 L4（`docs/DEVELOPMENT.md` §1.1）：S4、S6 合入后一批。本行通过 L3 与第一批 L4 之后才改为默认启用（`AGENTS.md` 强制流程第 4 条）。启用之前，M7 照它的退路自己执行事件条目，时间条目（晨报、周报、巡检）不会到点，晨报仍是人发 `/hourness` 或在对话里让主 Agent 出。

## 17. 对其他设计的影响（各自下一稿改，本稿不动它们的文件）

- M7 0.3（m7:§2.5 写明「名字以循环板设计为准，M7 只改 entries.ts」；下面前三条在 `entries.ts` 里（第 1 条的结局口径在 `runAction` 里，第 3 条的键在发事件的各处），后四条在执行行的别处，都是小改）：
  1. `src/execute/entries.ts`、`src/operate/entries.ts` 的每条照 `LoopEntryDefinition`（§2.1）写，两行各自经 `ctx.inject([LOOPS_SERVICE], …)` 调 `contribute({plugin: 'dsh-hourness', row}, {events, entries, actions, run})`（§3.1）；`run` 就是 `glmHournessExecute.runAction`，返回 `HarnessResult`；`limits` 照 §5.1 的表。服务不在时的退路执行者不变。
     - 每项加 `why`（评审 F28）：1–150 个码点、一句人话、不含换行，经 `plainWordsIn` 为空；M7 0.3 的形状 `{id, title, source, trigger, action}` 没有它，照原样交来十项都会因 `why` 缺失被丢掉（§3.2）。例：`execute.handback` 的 `why`「交回的活要有人审过才进主干，这一项提醒主 Agent 去派审查」。M7 的 E8 测试（它自己的表全部被接受）会先报出来。
     - 结局的口径（评审 F27，§6.5）：动作跑完了就返回 `done`，要主 Agent 做事时带 `tell`；`failed` 只给「动作没能跑完」。`execute.trunk-check` 跑完、主干是红的，返回 `done` 加那句「The full check on <trunk> <commit> failed: …」，不返回 `failed`：主干红了是检查的结果，循环板对 `failed` 报行健康 degraded，用错了会让执行行在每次主干变红时显示成坏了。
  2. 事件照 §4.2 的表声明字段；提醒文字的占位改成 `{名字}`，只用声明过的字段；`hourness.handback` 的载荷加 `commits`、`floorHit`，`hourness.trunk-advanced` 加 `files`、`truncated`。`hourness.outside-advance` 的人话用「有人不经系统直接改了主干」。
  3. 事件经 `emit({event, cwd, session, key, payload})` 交，`key` 照 §4.2 的「键」一栏写（评审 F22）：说的是这一次发生，不只是主体；`hourness.host-started` 带进程启动的毫秒，`hourness.tasks-closed` 带最后关上的那条状态历史的 `at`，`hourness.stopped` 带停下批注的 `at`，审查两种带 `childId`。退路执行者的进程内去重改用同一个键（0.2 让循环板沿用退路执行者的键，而那里只举了 `handback:<childId>` 一例，按主体写的键会让重复发生的事件在循环板上 7 天不跑）。M7 的 L2 加一例：同一个目标的任务重开再关，两次 `hourness.tasks-closed` 的键不同。
  4. 新事件 `hourness.outside-advance`：在 `advances.jsonl` 记 `{by: 'outside'}` 时交，载荷 `{from, to, files, truncated}`；`execute.trunk` 同时听它与 `hourness.trunk-advanced`（m7:§3.8.4 末两段）。人在终端里直接推进的主干由此也跑一遍完整检查，0.1 用每 30 秒查 git 想接住的就是这一种。
  5. `execute.trunk-check` 的跳过规则（建议，§5.1）：在同一个 `normDigest` 下，与新主干的树相同或只差 `only` 路径的那些提交已有的通过记录合起来覆盖了每一条 `$` 与 `when` 命令时跳过，否则只跑没覆盖到的那几条。不采用时循环板不用改。
  6. 高峰里等高峰结束（编排方的接缝裁定，`design-context.md` 末条；规则板 0.8 §10.7 M7 第 4 条写了 M7 那一半，评审 F34）。0.3 请的 `execute.resume-after-peak` 撤回：它恢复的是以 `hourness-idle-rounds` 阻塞的 goal，裁定之后那是真空转，自动恢复会跳过一个该问人的地方；它还要 M7 判「阻塞发生在这段高峰之内」，是裁定第 3 条不让 M7 加的高峰逻辑。改请两件：
     - 停住：没进展的目标轮开始时 `peakHoldFor(<主 Agent 的会话>)` 有值，这一轮不计入 3 轮，M7 以自己的原因码停住自动推进（裁定举的例子是 `hourness-peak-wait`，M7 0.4 用的就是它，连着两轮这样时停住；码由 M7 定，循环板不读它），不叫主 Agent 去问人。第几轮停住、停住之后人说话时怎样接上，由 M7 定（规则板 0.8 已这样写）。
     - 动作 `execute.resume-drive`（裁定里叫 `resume-drive`；放进执行行那一份 `Contribution.actions`，id 按 §3.2 带 `execute.` 名字空间，`title` 例「接上高峰里停住的自动推进」），经那一份的 `run`（即 `glmHournessExecute.runAction`）执行，返回 `HarnessResult`（§3.1、§6.5 的结局口径）：持有者会话的 goal 为 `blocked` 且原因码是 M7 的高峰等待码时 `goals.resume`，返回 `done`（可以带 `tell`，不带时循环板用 §6.9 第 4 条第 3 行那一句）；不是这种情形（没有 goal、goal 活着、被别的原因挡住、已经恢复过）时返回 `skipped` 与一句原因；恢复抛错（轮次用完等）时返回 `failed` 与原因，最好带一句 `tell`。冷的持有者会话：M7 0.4 的动作要持有者的活 agent 在调用它的进程里，不在时返回 `skipped`（m7:§2.5 接口第 2 条）；循环板在调它之前，持有者会话冷着、这段高峰里又走过步时，先经 `resolveAgent` 把它恢复到本进程（§6.9 第 4 条第 3 行），所以 M7 不用为循环板另取 agent。恢复引起的 `agent/created`（disarm、`hourness.host-started`）照 M7 §3.9.1 的表处理。幂等：同一段高峰被调两次（例如交接前后，或 M7 自己的高峰后复查先接上了），第二次说 `skipped`。60 秒内给出结果（§6.9 第 4 条第 3 行等它至多 60 秒）。
     - 循环板调它的时机只有一个：`loops.peak-end` 在 `edge` 为 `end` 的 `channel.peak-changed` 上，持有者状态允许投递时，少做与不做两档都调，每段高峰恰好一次（§6.9 第 4 条）。
     - 没有循环板、或循环板没在高峰结束时接上（M7 定）：0.4 原先建议 M7 在这些时候不停住；M7 0.4（写到一半的盘上稿，13:11）另选了高峰结束 5 分钟后自己再看一次、没接上就自己接上（按 `PeakHold.until`，m7 0.4 版本说明与 §3.9.5 的提要），这一条也兜住了停住之后循环行或计价服务才撤掉的情形，本稿不再建议别的。它与第 14 项不冲突：动作幂等，先到的接上，后到的说 `skipped`。两种次序的结果：循环板先到（高峰结束 1 分钟内），M7 复查时什么都不做；M7 先到（例如第 14 项因 `elsewhere` 存着、交接超过 5 分钟），第 14 项之后再判时第 3 行得 `skipped`，往下按档位判，少做档里主 Agent 至多多收一条第 10 行那一句。M7 复查时自己给主 Agent 的话，措辞归 M7。
     - M7 的 L2 加一例，与本稿验收第 15 条对上：少做、不做两档，停住的 goal 在 `resume-drive` 之后为 active、空转从零计；冷会话同样；以 `hourness-idle-rounds` 阻塞的 goal 调 `resume-drive` 得 `skipped`、goal 不变。
  7. 0.1 对 M7 0.2 的请求（`withGateLock` 给循环板用、M7 删掉三条定时提醒、`emitLoopEvent`）作废：M7 0.3 已经把这几件写成交给循环板的条目与事件，主干全量检查留在 M7。
  8. 周报的两节（0.5，§6.11）：`hourness_report` 的 `weekly` 读 `loopsService(ctx)?.staleEntries(<项目根>, now)` 与 `timeoutEntries(...)`，各列一节「4 周没跑出过结果的、你加的循环板条目」「最近 7 天反复超时的循环板条目」；前一节附一句给主 Agent 的 `Propose removing them in one proposal: loop_propose {kind: "delete", entries: [...]}, then propose_to_human.`，后一节附 `Propose fixing the script (dispatch a subagent, then loop_propose kind "edit").`（插件的条目写「请插件的作者修」，不提删除）。这两件算在周报「每周至多 3 件」里（m7-8）。服务不在或返回 `undefined` 时写「循环板此刻不在这个 DSH 进程里，这一节下次再看」。规则板的「4 周没触发的规则」与拦路脚本的超时、晚到的拦截由规则板交给周报（rules:§10.5、§10.7 M7 一节第 4 条），规则板的删除提议与循环板的分开提。
  9. 不用改、只对一下（0.5）：评审 F40 照循环板这边的做法关掉（§6.9 第 4 条第 3 行：本行恢复冷会话之后 `run` 得 `skipped`，就再读 goal，已是 active 记 `done`），`execute.resume-drive` 不用加「刚由 `agent/created` 接上的也返回 `done`」。主 Agent 不受高峰影响之后（`d-main-agent-peak-exempt`），M7 0.4 退路执行者送提醒之前读 `heldForPeak` 的那一步（m7:§2.5 第 6 条）对主 Agent 永远为假，可以删；这一条由规则板 0.9 与 M7 的对齐轮定，循环板不依赖它。
- M6 0.3：契约不用改，循环板照 `loopDefaultsOf` 读、照 §3.4 落实 M6-L1 到 M6-L5；GLM 的条目仍是四项。四处请 M6 知道（0.4 加第 4 处，仍不要 M6 改契约）：
  1. M6-L1 要的那一行「GLM 通道包未装，或它的 glm-login 行未启用」不显示（plain-ui §2：只装编排层包时面板上不出现模型名），M6 下一稿把这半句删去或改为「不显示」。
  2. M6-R5（少做档的高峰结束时叫醒闲着的主 Agent）由循环板的 `loops.peak-end` 做（§6.9 第 4 条），它是编排层的条目，不是 GLM 包的默认条目（编排方修订后的接缝裁定，§3.4）。评审 F19 照修订之前的裁定请 M6 加第五项 `glm:peak-end` 与新的 `ChannelTrigger` 种类 `peak-end`，裁定修订之后不要了，M6 的 `channel-loop.ts` 与 `loop-defaults.ts` 都不用改。M6 §8.3 留在 GLM 包外的理由「GLM 包不知道档位」请改为修订后的说法（要的是规则板的档位与主 Agent，GLM 包没有主 Agent）；M6 §18 的那一行可以写「循环板接了」。
  3. GLM 包给循环板的是高峰时刻的计算：计价服务的 `peak` 与 `nextPeakChange`。循环板照它推出 `channel.peak-changed`（0.2 叫 `loops.peak-changed`），M6 的 `peak-start` 条目在循环板上听的就是它（§3.4 的换法表）；M6 自己的高峰提醒照旧在 GLM 请求里执行，不听这个事件。`nextPeakChange` 由 M6 Q1 或规则板 R4 先合入的一方加进 `src/shared/pricing.ts`（循环板 S3 的依赖，§16）。
  4. `LoginView.since` 是可选的毫秒数（m6:§5）。循环板在它没有时用自己第一次看到被拒的那一拍当「这一次」（§4.3，评审 F38），所以 M6 不必总填它；填了就用 M6 的。M6 若以后在 `rejected` 时总填 `since`，循环板不用改。
- 规则板 0.9（与本稿同时在写；接缝照编排方的裁定，两边各写自己的、引用对方的节，本稿不重述规则板的契约）。循环板这边交出的、规则板照用的：
  1. 条目形状：`src/loops/trigger.ts` 的 `HookShape`、`Trigger`、`EventFilter`、`FilterTest`（0.5 加 `matches`、`paths` 收 glob）、`ScriptRef`、`ScriptAction`（`onError`）与事件声明的类型；`validateWhen`（规则板传 `allowGate: true`）、`matchesFilter`、`nextOccurrence`（§2.2）。规则板不另写一份；规则板自己的 `condition`（信号、时钟、阶段，rules:§2.2、§2.3）在规则板的条目上另写。0.8 §5.2 的 `DetectorTrigger` 子集照旧可用（rules:§5.2）（`params` 仍在 `Trigger` 里，提出去的只是 `filter`）。
  2. 拦路的事件：名字空间 `gate.` 保留给规则行（§3.2、§4.6）。有哪几个、id、载荷字段、哪个是「难以退回的一步」由规则板定，0.9 已定（rules:§2.3、§6.7）：`gate.tool-call`、`gate.dispatch`、`gate.trunk-advance`，后者的声明带 `gateOnErrorDefault: 'block'`；`rules.step` 不登记。规则行可以把它们经 `contribute` 交来（只交事件），`loop_show` 列为「拦路的，规则板用」；它们带 `session` 字段，§3.2 对 `gate.` 事件放开了这个名字（接缝核对时补）。
  3. 脚本执行器：`src/loops/script.ts` 的 `runScript`（拦路的用 `purpose: 'gate'`，检测器用 `'work'`，信封的 `board` 写 `rules`）、`HookEnvelope`、`ScriptResult` 与 `LateScriptResult`、常量 `GATE_TIMEOUT_MS`（10 秒）、`GATE_TIMEOUT_MAX_MS`、`GATE_HARD_CAP_MS`（10 分钟）、`GATE_LATE_MAX`、`ON_ERROR_DEFAULT`（`allow`）、`scriptSha256`、`scriptDetail`、`commandText`（§6.6）。规则板不起进程（`src/rules/` 不出现 `node:child_process`，验收第 35 条）。拦路脚本的退出码与标准错误是什么意思、`onError` 的放行与拦下怎样进 `checkCall`、晚到的结论怎样记、怎样马上告诉主 Agent，都在规则板（`d-script-timeout` 的「拦路的含义归规则板」）。0.8 §5.3 引的 `src/loops/command.ts` 改指 `script.ts`。
  4. 同意的路：规则板的脚本提议照同一条路（M3 的 `propose_to_human` 带 `attach: 'rules:…'` 与 `scriptDetail` 生成的 `detail`，`record_human_answer` 核对给人看过、拍板带摘要，同意即生效）；`rules_propose` 说明里的示范由规则板写（`d-agent-examples`）。
  5. 存放：规则板的条目与脚本在仓库里的哪个目录由规则板定（本稿的是 `docs/loops/`，规则板放在与它并列的 `docs/rules/` 时两块板一眼看得到，供参考）；执行器只要求脚本在项目根之下，私有副本统一写在 `<项目根>/.llm/loops/run/`（执行器自己的，规则板不用管）。
  6. 代码规则目录加一行 `loops:files-only`（§2.4 第 16a 行、§13），与已有的 `loops:schedule-tools` 一样只列出。
  7. `checkCall`：循环板照旧以 `{tool: 'pwsh', args: {command: commandText(...)}}` 加 `glmSpend` 调（§6.9 第 1 条），跑脚本与检查之前各一次；规则板 0.9 没改入参（rules:§9.4）。
  8. 高峰：循环板只读 `stateFor`、`stateForProject`，不再读 `heldForPeak`（`d-main-agent-peak-exempt`，§6.9 第 2 条）；高峰结束那一项两档同一张表（§6.9 第 4 条第 5 行），规则板放出它排着的子 agent 与脚本时叫回等它的 agent 照规则板的做法。
  9. 周报：4 周没触发的规则、拦路脚本的超时与晚到的拦截由规则板算（rules:§10.5），循环板的两张单子见 §6.11；两块板的删除各提各的（各至多 3 项、各算周报的一件），删除与修都走同一条同意的路。
  10. `docs/CHARTER.md` §3.2 第 3 条、§6 与 §9 的改写在规则板 0.9 同批，本稿只引用（§1.5、§6.6、§9.1）。

  规则板 0.8 的部分（留作对照）：不再请规则板改任何东西。0.3 请的那一句（第 29 行「GLM 一侧带到循环板上的一条默认条目」）0.8 已照修订后的裁定改了；0.8 §10.7 循环板一条第 8 点给 0.3 的要求本稿照做（§6.9 第 4 条第 3 行，评审 F34）：第 14 项先恰好调一次 M7 的 `resume-drive`，再提醒主 Agent，少做与不做两档都这样，`execute.resume-after-peak` 两行删去，以 `hourness-idle-rounds` 阻塞的 goal 不再由第 14 项恢复。一处与第 8 点的字面不同：第 8 点写「判断要不要跑 `resume-drive` 看 goal 的原因码」，本稿不先看原因码，直接调、由 M7 的动作自己判（理由在 §6.9 第 4 条表后第一段：原因码与恢复都只在 M7，冷会话也成立）；对规则板没有影响，循环板照旧不读 `peakHoldFor`。下面是 0.3 写给规则板 0.7 的，留作对照：
- 规则板 0.7：0.2 的七条请求规则板已在 rules:§10.7 逐条答复，本稿照答复改，不再请（评审 F23）：
  1. `peakStop`：规则板不加，把「还没开单、但下一次调用会被不做档排队」并进了 `heldForPeak`；本稿撤回这条请求，§6.9 第 2 条照 0.7 的 `heldForPeak` 写，§18 的 0.2 第 7 条删去。
  2. `stateForProject(cwd)`：规则板加了；本稿的页面档位与 `loops.peak-end` 判档位都用它（§6.9 第 3、4 条）。
  3. `DetectorTrigger` 的文件一种、4. `loops:schedule-tools` 的说明、5. `pluginLabel`、6. 叫醒由循环板做、7. 共用 `command.ts` 与 `checkCall` 不带主体：规则板都已照做或同意，本稿不变（0.5：`command.ts` 换成 `script.ts`，见上面规则板 0.9 一条第 3 点）。
  新的一条：规则板 0.7 第 29 行写「少做的高峰结束时叫醒主 Agent：GLM 一侧带到循环板上的一条默认条目」，是修订之前的接缝裁定；裁定已改为「归编排层（`dsh-hourness` 带来），GLM 包只给高峰变化事件与时刻计算」（§3.4），请规则板下一稿照改这一句，第 64 行与 §3.6 引的 `loops.peak-end` 不用改。另：本稿的 `channel.peak-changed`（0.2 叫 `loops.peak-changed`）规则板没有引用，检测器只用 `loops.file-changed`，不受改名影响。
- M3 附录 0.3：
  1. `propose_to_human` 的 `attach` 按前缀分派：`rules:` 走规则服务的 `attachable` 与 `proposalLine`（规则板 0.6 起已请，0.7 §10.7 照旧），`loops:` 走循环板服务的 `attachable` 与 `loopProposalLine`（§3.1）。两种形状相同，M3 写成一张两行的表即可。
  2. `record_human_answer` 在 `decide` 成功之后，正文末行用 `proposalIdOf` 与 `loopProposalIdOf` 各认一次，认出哪一种就调哪一个服务的 `acceptProposal`，把它那一行放进结果（§7.1 的表）。挂在 `src/design/record.ts` 一处，规则板挂的也是这里。
  3. 0.1 请 M3 在放行之后报 `design-released`，作废：M7 0.3 自己在主 Agent 的一步里认出放行并交 `hourness.design-released`。
  4. `mainAgentOf` 给循环板用（已导出，不变）。
  5. 原文段落（评审 F21，§7.1 第 2 步）：`attachable` 的结果多了可选的 `detail: {markdown, mustShow}`。带它时 `propose_to_human` 把 `detail.markdown` 原样作为一段接在四行之后放进 `text`，并放进待决正文（提议 id 那一行之前）；这一段由 harness 写，不受四行的行长与加粗检查；`renderProposal` 加一个可选参数。四行的规则（每行至多 40 个码点）不变，所以命令（0.5 起是脚本原文）不再塞进推荐一行。
  6. 「给人看过」的核对（§7.1 第 3 步）：`record_human_answer` 的 `question` 一种、`answer: 'agree'`，正文末行是循环板提议时，拍板之前再调一次 `attachable`；带回 `detail` 时，在会话日志里取这张待决最近一次 `propose_to_human` 的结果之后、含人原话的那条消息之前，主 Agent 发给人的文字，按 `personSaid` 的规整核对 `mustShow` 的每一片都在；不全在返回新的结果 `not_shown`（同 `confirm` 已有的那个码），待决不拍；都在时拍板，`reason` 末尾加「· 已给人看原文 <attachDigest(detail)>」。循环板服务不在时照常拍板、不加这个记号，带脚本的提议因此在循环板的补写里被拒，人要再同意一次（§7.1 表后一段）。规则板 0.9 的脚本提议也带 `detail`（rules:§9.3 第 2 条），走同一段代码（第 9 条）。
  7. 建议（不挡循环板）：M3 的持有者记录指向一个已归档的会话时，`/wish` 的回话与流程条也提醒人「主 Agent 的会话已归档」；循环板自己按 `holderState` 处理（§6.4），不依赖这一条。
  8. 循环板按 `readHolder` 的三种结果分开处理（m3:§2.4）：`none` 是「没有主 Agent」（会删绑在原持有者会话上的到点任务，连着两次才删），`unreadable` 是「读不出」（一条都不删，评审 F35）。所以请 M3 导出一个能分出这两种、按项目根定位的读法（第 10 条的 `readHolderFor(<项目根>)`）；0.4 这里还留着 `readHolder(holderFile(userHome, projectKey(dir)))` 的备选，随 `d-rules-in-repo` 把持有者记录搬进项目 `.llm/` 删去（持有者记录不再在用户级目录里，§6.4、第 10 条，评审 F47）。M3 的 `/wish here` 用 `replaceHolder`（临时文件加改名），读的一方不会读到半个文件，这一条只防文件真坏了。
  9. `AttachDetail` 的上限（0.5，`d-boards-as-hooks`：人看的是整段脚本）：`markdown` 由 1–800 改为 1–6000 个码点，`mustShow` 由 1–13 片、每片至多 400 改为 1–8 片、每片至多 4000（M3 附录 0.4 §6 那一行，m3:1044）；`hournessTalk` 的 `after` 至多 16,000 个码点，放得下，不用改。第 5a 步写的「规则板的提议没有 `detail`，跳过这一步」改为：两块板的脚本提议都带 `detail`（共用的 `scriptDetail` 生成），循环板的检查提议也带（`commandDetail`，编排方的裁定「Check entries seam」），都核对；分派表里 `rules:` 一行照 `loops:` 一行的做法。
  10. 持有者记录（0.5，`d-rules-in-repo`：「主 Agent 是哪个会话的记录」进项目的 `.llm/`）：M3 把 `<userHome>/main-agent/<键>.json` 搬进项目时，请导出按项目根定位的读法（例 `holderFileOf(<项目根>)`，或直接导出 `readHolderFor(<项目根>)`），`readHolder` 的三种结果（`none`、`held`、`unreadable`）不变。循环板只换定位函数（§6.4），行激活时改从 DSH 的工作区登记表列项目（§6.1），不再读 `<userHome>/main-agent/`。
- M4 0.3（0.4 与本稿同时在写）：
  1. env 行交一项 `env.checks-after-edit`（§5.3），带 `ownRules`（一步至多等 20 秒、每个检查 60 秒超时、连续失败 3 次后这个会话不再跑、没有检查器覆盖的语言每个会话提醒一次）与 `details`（每个批过的检查器一行），声明 `env.files-edited`（0.5 接缝核对起不再 `listedOnly`，见第 4 条）；每跑完一次检查调 `recordRun`（结局 `ran` 或 `reported`，`exits` 为各检查行的退出码）。
  2. 图行里 R1 的那一部分交一项 `graph.third-rework`，声明 `graph.third-reopen`（`listedOnly`）；每提一次第三次返工的待决调 `recordRun`。
  3. 0.1 请 M4 在第三次修复之前改报 `work-stopped`、给人的话由循环板经主 Agent 说，作废：M4 0.3 已由 `graph_status` 的结果让主 Agent 在对话里问人，那是它自己的机制，循环板只列出。
  4. 检查器照 `d-boards-as-hooks` 成为循环板上同一个形状的条目（0.5，§5.3），并照编排方的裁定「Check entries seam」（2026-10-30，M4 第 4 轮评审 F17 之后，可推翻）分成两种：
     - M4 自带的检查器：仍是插件交来的数据、由 env 行执行、在板上只能看。`when` 为 `env.files-edited`，`filter` 为改到的文件（`paths`，按扩展名写 `*.ts`，0.5 的 glob），动作是 `self`（`by: 'glm-hourness/env'`，结果交给改文件的那个 agent）。交一项带明细（第 1 条）或每个检查器一项（`env.check-<名>`，工具节点变了就整份再交），循环板都收。
     - 人自己加的检查：循环板上人的普通条目（动作 `check`，§2.3、§5.3），由循环板的执行器跑（`runCommand`，§6.6），走与脚本同一条同意的路（§7.1）；M4 不执行它们，也不必给循环板 `entriesOn`、`recordRun` 一类为 M4 执行人的条目而设的接口（M4 0.4 §18 第 5 条的第 ①、②、④ 点随裁定不要了：内容校验由循环板经下面的读法做；第 ③ 点由 0.5 的 glob 接住；第 ⑤ 点由 `runCommand` 的 `queue: 'check'` 接住：单独一队、不排在循环板的 `work` 脚本后面、工作目录可以是工作树、超时 5–1800 秒、输出各留 1 MiB 起、argv 不经 shell，§6.6，评审 F50）。M4 要给的是三样，都在 M4 的下一稿，名字由 M4 定：按工具节点 id（与节点里的哪一条）读出一条检查命令 `argv` 的读法（循环板在提议时与每次跑之前各调一次，读不出时返回 `undefined`）；按这次运行的事件把命令里的占位（例 `{files}`）填好的纯函数（这次运行里几个事件的 `files` 的并集，以 `-` 开头的文件名前面加 `./` 免得被当成选项，Windows 命令行的长度由它切分或截断，循环板不认得 M4 的格式，评审 F53）；可选的、按节点的输出格式整理结果的纯函数（没有时循环板照脚本的样子交退出码与末尾几行）。节点上写的命令要能不经 shell 直接起（`node`、`git` 或 `.exe`；`npx` 这类 `.cmd` 起不了，§6.6、V19）。M4 自己的检查器若要用共用执行器，走 `runCommand` 的 `queue: 'direct'`（不排队、并发由 M4 管、信封可空，§6.6），或仍留在 `src/env/runner.ts` 自己起进程；两者都行，由 M4 定（评审 F50：0.5 写的「第 ⑤ 点由 `runCommand` 接住」只说了人加的检查这一半，M4 自己的检查器有它自己的并发与等待，不该排在循环板的脚本后面）。
     - `env.files-edited` 改为经 `emit` 交进收件箱、人能选（§4.4，不再 `listedOnly`），载荷 `files`（`filter: 'paths'`，相对 `root`）、`root`、`truncated`，键 `files-edited:<会话>:<turn>-<step>`（两个数都取自 `agent/pre-step` 的载荷，`step` 每回合从 1 数、`turn` 由会话投影 `turnBoundary` 接续，agent-loop:956–959、782；0.5 的 `<这一步的序号>` 在不同回合的同一步撞键，第二次改动的检查不跑，评审 F45）；信封的 `session` 是改文件的那个会话。M4 可以先调循环板的 `listens('env.files-edited', <cwd>)` 再决定要不要算载荷（没人听时 `emit` 不写收件箱、不记键，评审 F54）。M4 自带的那一项照旧在那一步之前当场跑，收件箱里的这一行只给人加的条目用。这也接住 M4 第 4 轮评审 N40（工作树里的路径按改动所在的检出算）。
     - M4 的违规流水搬进项目 `.llm/`（`d-rules-in-repo`）是 M4 自己的事，循环板不读它。
- plain-ui 0.6：本稿照 §4.7 的约定改了页面（只看、名字「循环板」、页头一句、三组的次序、来源一行、要改的那一句），`/loops-apply` 删去，plain-ui §4.7 那半句「`/loops-apply` 没有面板这个调用方」随之可以删；上手页第 5 块的字句归 plain-ui，循环板不再给（0.1 §7.3 给的那一句作废），`guideLine` 为 `null`；`homeLine` 的几种说法见 §8.3，0.3 在最前面加了「主 Agent 的会话已归档：在一个会话里打 /wish here」；`pluginLabel` 同规则板（规则板 0.7 已建 `src/shared/plugin-labels.ts`）。页面字串不再用「行」指插件的一部分（评审 F30，§8.5 换词表加了这一条），plain-ui 的换词表要不要收这一条由 plain-ui 定。
- plain-ui 0.7（0.5 新的几处，plain-ui 不用改，只是页面多了字）：每个脚本条目下面两行（脚本是哪一版、超时与崩溃时怎样），人加的检查条目同样两行（命令来自哪个工具节点、你哪天同意的那一条，超时与崩溃时怎样；接缝核对时加）；「要你看一眼的」多三种（脚本改过了、条目文件在外面改过、条目文件读不出）；`homeLine` 多一种「循环板：「<名字>」的脚本改过了，先不跑」，去掉「N 件消息在等高峰结束」（`d-main-agent-peak-exempt`）；「循环板自己的规矩」一段多一句存放的位置（§8.2、§8.3）。`mockup-loops.svg` 由重写放行稿的那一步跟着改。
- metrics：§6.10 的十一类事件是循环板这边的输入清单（0.5：`loop-done` 的结局多 `refused` 与 `unfinished`，`loop-entry` 的 `op` 多 `repin`、`external`、`adopt`；指标流水合入之前循环板写 `<项目根>/.llm/loops/runs.jsonl`，合入之后写 metrics:§3.3 的 `<项目根>/.llm/metrics/`）。原文接着：（比 0.1 多 `loop-read`、`loop-contribution`，0.3 又加 `loop-duplicate`、`loop-holder`、`loop-handover`，0.4 加 `loop-task-delete`；被删任务的全文在 `removed-tasks.jsonl`，不进指标流水）；字段的通用部分由那份设计定，定了之后循环板只改 `src/loops/metrics.ts`。
- `docs/CHARTER.md`：§3.2 第 3 条、§6「新门禁先以影子模式运行」与 §9 的存放表由规则板 0.9 同批改写（人同意的条目同意即生效，代替影子期的是写明的超时与崩溃时怎样、内容哈希、报告里的次数与随时能删；存放照 `d-rules-in-repo` 与 `d-memory-scope`）。循环板的实现合入时只引用它，§9.1 的三处存放与它对得上：仓库的 `docs/loops/`、项目的 `.llm/loops/`、用户级的 `loops/machine/`（账号一级）。
- `docs/ORCHESTRATION.md`：编排层的运维一节（晨报、巡检）改写为「循环板的默认条目，由 M7 交」，并加循环板一节（概念、登记表、事件表、两块板的分界、去向表）；`docs/DESIGN.md` §2.2 行表加 `glm-hourness/loops`，§2.4a 接口对照表加 §10.1 的新用接口，§7 降级表加一行。这些随 S2、S4 的提交改。

## 18. 替人定的方向与要问人的

替人定的（agent 定、人可推翻，写进一页放行稿）：

1. 到点跑脚本（以及 harness 动作）的条目用循环板自己的钟，不用 DSH 的定时服务（§6.2）：DSH 的投递每次都叫醒主 Agent，脚本过了也会在人的对话窗口里留一回合。代价：这两类条目不支持 cron。
2. 插件的条目由各行当数据交给循环板；必须在别处当场做的（M4 自带的检查器、高峰的收放、GLM 的提醒与看状态读额度）循环板只列出与记录，执行留在原来那一行（§2.3）。同一件事只有一处在做。
3. 人在对话里加条目，经 `propose_to_human` 交给人、人同意后带原话记下（§7.1），与规则板同一条路；人的命令只有删、恢复、确认与没有图时的同意（§7.2），新建不做成命令。
4. 在 DSH 自带的任务页里改循环板的任务不算数，循环板改回并写一行说明（§6.2）。
5. 账号一级的 GLM 提醒（额度快用完、登录失效）只告诉最近一次干过活的那个主 Agent，一次（§6.4）。
6. 高峰里只剩挪开的活时，自动推进先停着、不来问你；高峰结束时系统把它接上并叫醒主 Agent，少做与不做都这样（停住与接上是 M7 的，循环板在高峰结束时调一次，§6.9 第 4 条；这一半是编排方的接缝裁定，本稿照做）。没有停住的自动推进时，主 Agent 闲着、这段高峰里干过活、又不是在等你，也叫醒它一次，少做与不做两档都这样（0.4 只在少做档叫；主 Agent 不受高峰影响之后，两档里它都照常干活、都可能把活挪到高峰之后，§6.9 第 4 条第 5 行）。主 Agent 真没事可做、已经在问你的（以 `hourness-idle-rounds` 停下的），高峰结束时不替你接上（0.3 写的是接上，0.4 改掉：那会跳过一次该问你的地方）。
7. 你加的会跑脚本的一项，主 Agent 给你看四行之后，下面由系统附一段脚本原文与注意事项；主 Agent 没把这一段原样给你看，你说「可以」也不算数，它得再给你看一遍（§7.1）。脚本太长（超过 4000 个字或 100 行）的不收，要拆开或把细节放进项目里的文件。代价：这种提议在对话里多一段字。
8. 次数超了的事件不丢，合进下一次（§6.7）；「自己触发自己」只算循环板自己做的事直接引起的，经过主 Agent 一回合的不算，靠限次兜住。
9. 插件条目的去抖与上限：5 秒、每小时 30 次；人的：30 秒、每小时 6 次。「等你太久」的门槛 24 小时，22:00–08:00 不说。告诉主 Agent 的条目最短 10 分钟一次，跑脚本的最短 5 分钟一次；你加的脚本缺省 60 秒超时。
10. 晨报 08:30、周报周一 09:00、夜间巡检 02:30 沿用 M7 的默认时刻；默认条目暂时只能看，所以这三个时刻暂时改不了。人想在别的时间多看一次，可以自己加一项「告诉主 Agent 出晨报」。
11. 建议 M7 的主干全量检查只跑这个提交还没跑过的那几条（§5.1）；这是给 M7 的建议，M7 定。
12. 主 Agent 的会话被归档或找不到了，循环板不自己挑一个会话接着投，而是把消息先存着（24 小时），页面与首页写「主 Agent 的会话已归档：在一个会话里打 /wish here」（§6.4）。代价：在你 `/wish here` 之前，晨报、交回之后派审查这些都停着。
13. 同一件事被报了两遍时只跑一次，第二遍记下来、在「最近跑过的」里看得到；同一件事反复报来（一天里同一件第 4 次）时在「要你看一眼的」里出现（§6.3）。
14. 主 Agent 的会话在另一个 DSH 窗口（进程）里打开时，循环板交给那个进程去跑（§6.1）；那边一直不接时，每 5 分钟再试一次投递，过了 5 分钟页面写「交不过去」。
15. 循环板看不清主 Agent 的会话时（会话开在另一个窗口、读不到它归没归档、读不出主 Agent 的记录），晨报、周报、巡检这几条到点的提醒原样留着，不删；只有确知没有主 Agent、会话已归档或找不到时才删，删之前把那条提醒的全文记下 30 天（§6.2）。代价：读不到归档状态时，提醒可能照样投进一个已归档的会话，页面与行健康都写着「看不清」。
16. 高峰结束时循环板不先看主 Agent 的 goal 停在哪，直接请 M7 接上它自己停住的那种，由 M7 判（§6.9 第 4 条表后第一段）。另一种做法是循环板先读 goal 的原因码、对上才请 M7，代价是同一个判断分在两处。打开冷会话时 M7 自己先接上了，也算接上，只告诉主 Agent 一次（评审 F40）。
17. 你加的条目与脚本放在项目仓库的 `docs/loops/` 里，和项目图挨着；运行记录、日志这些放在项目的 `.llm/loops/` 里、不进 git（§9.1）。规则板的由规则板定，放在并列的 `docs/rules/` 与 `.llm/rules/`（rules:§7.1）。代价：条目一改就多一个要提交的文件，提交由主 Agent 做。
18. 跑脚本时跑的是核对过的那一份字节的副本，脚本里找项目文件要按项目根找（§6.6）。代价：脚本拿不到自己在仓库里的位置。
19. 仓库里的条目或脚本在循环板之外被改过（手改、合进来的提交、拉来的改动），这一项先不跑，等你再同意；从别的电脑或队友那里随仓库带来、图上有你同意的拍板的，认回照跑（§9.3）。代价：在一台没有项目图的电脑上同意的条目，换电脑之后要再同意一次。
20. 周报列出你加的、4 周没跑出过结果的条目，提议删；最近 7 天超时 3 次以上的，提议修（§6.11）。插件带来的只提议修，不提议删。
21. 交条目的一方（例如项目编排的运维部分）晚到或重启时，晨报、周报、巡检这几条提醒不删，等这个进程开始跑项目满 5 分钟、两次对账都看不到才删（评审 F41，§6.2）。
22. 只有一条命令的事也写成一段脚本（0.4 的「跑命令」一种并进脚本）：人看到的、钉住的、执行的是同一种东西（§2.3）。例外是人加的检查（第 23 条），它的命令来自项目图上的工具节点。代价：一行命令也要走一次「看原文、同意」。
23. 你自己加的「改完文件就跑检查」由循环板跑（编排方的裁定「Check entries seam」，本稿照做），命令取自你在项目图上批的工具节点，你看过那一条命令行同意才生效，节点上的命令改了就先不跑、等你再同意（§2.3、§5.3、§7.1）。循环板替你定的几处：它在收件箱之后跑，不卡住改文件的那一步，结果在那个 agent 之后的一步到；在改动所在的那份检出里跑；命令不经 shell，所以节点上要写能直接起的程序（§6.6）。代价：比 M4 自带的检查器晚到一点（缺省去抖 30 秒）；同一条检查你又加了一项时会跑两次，页面写明。

人定、本稿照做的（不是替人定的，放在这里便于对照）：会跑东西的条目不论谁带来都走同一条同意的路、人加的检查由循环板执行（编排方的裁定「Check entries seam」，可推翻，不是人定的，放在这里一并对照）；拦路脚本超时之后先照条目处理、后台跑完再交回结论，难以退回的一步缺省挡住（`d-script-timeout`）；说明里带做好的例子（`d-agent-examples`）；主 Agent 不受高峰影响（`d-main-agent-peak-exempt`）；同意即生效（`d-boards-as-hooks`）；存放（`d-rules-in-repo`、`d-memory-scope`）。

0.2 的第 7 条（「每段高峰每个会话至多多花一步，直到规则板加上 `peakStop`」）删去：规则板 0.7 把那一步并进了 `heldForPeak`，只剩冷会话恢复出来还没有请求头的那一次（§6.9 第 2 条）。0.5 连那一次也没有了：循环板不再读 `heldForPeak`（`d-main-agent-peak-exempt`）。

要问人的：没有。上面几条都能随时改回，不涉及目标、验收、不做的事或花钱的方向（`docs/ORCHESTRATION.md` §2.9.1）。第 7 条看起来最像要人定（它管的是人同意什么），但它只是让人同意时看到的东西更全，不改人能做的任何决定，所以替人定、写进一页放行稿。最可能不对的仍是第 6 条里循环板自己定的那一半：人若觉得「高峰结束时叫醒一次闲着的主 Agent」也是打扰，就改成不叫，代价是挪到高峰之后的活要等人下一次说话才开始。接上停住的自动推进那一半是编排方的接缝裁定，人要改它，M7 与规则板跟着改。第 15 条的代价写在一页放行稿里。

给重写一页放行稿的那一步（评审 F42）：疑问一句只问循环板自己定的那一半，写成「疑问：最没把握的是**高峰后叫醒**闲着的主 Agent，嫌打扰就改成不叫。」（去掉标签与加粗记号 31 个码点，一处加粗）。0.4 的放行稿写「少做档」，0.5 两档都叫（第 6 条），所以不再写档位；「闲着的」把它与接上停住的自动推进分开，人回「不叫」时只关第 10 行的叫醒。放行稿里新加的几件（脚本原文、同意即生效、改过就不跑、放在仓库、周报提议删、你自己加的检查）用 §18 第 17–23 条与上一段的人话。

## 19. 评审意见的处理

### 19.1 第 1 轮（0.1，0.2 处理；第 2 轮评审判 F1–F17 关闭、F18 部分关闭）

| # | 级别 | 意见 | 处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F1 | HIGH | M7 的接缝与 M7 0.3 不符：两张代码表、漏了「审查过了之后」「活都关了之后」、没有 harness 动作、事件名与载荷不同、轮询 git、跳过规则几乎不成立、提醒文字不同 | 改。循环板改为登记表：M7 经 `contribute` 交条目、事件与 harness 动作，`emit` 交事件（§3.1）；动作加 `harness` 一种（§2.3），经交来那一份的 `run` 执行（§6.5）；事件表取 M7 的八个原名与载荷，加循环行自己的、通道的与 M4 的（§4），并请 M7 加 `hourness.outside-advance`；条目是 M7 的 10 项加循环行的 4 项、M4 的 2 项、GLM 的 4 项（§5），「审查过了之后」「活都关了之后」在内；删掉 git 轮询（§4.1）；主干全量检查整个交回 M7，跳过规则改为给 M7 的建议（§5.1）；提醒文字以 M7 的为准；§17 的 M7 一行按 0.3 重写。评审 (b) 说的 `then` 写成 `harness.tell`，结果里也可以带 `tell`（M7 的「没过时才提醒」需要） | §2.3、§3、§4、§5.1、§6.5、§17 |
| F2 | HIGH | GLM 的接缝与 M6 0.3 不符：另开服务、三项对四项、读额度的时机、登录的判据、账号一级的投递 | 改。删掉 `glmHournessChannelLoop` 与 `subscribe`，照 `loopDefaultsOf` 读，换法在 `channelEntries` 一个函数里（§3.4）；四项都列出，GLM 包自己执行的两项写明；额度在 GLM 有新用量、满 15 分钟时读（M6-L2）；登录状态每一拍用 `quota({read: false})` 看（M6-L3）；账号一级的事由机器一级的运行者判、只交给最近走过步的主 Agent 一次，已说记录在机器一级（M6-L4，§6.1、§6.4）；`loop-read` 留痕（M6-L5）；高峰的两项挂在 `dsh-hourness` 下，来源一句照 M6；0.1 §1.5 的「只在有人看时读」一条删去；§17 的 M6 一行按 0.3 重写。一处没照 M6-L1 的原话：没有计价服务时不写「GLM 通道包未装」那一行，因为 plain-ui 定了只装编排层包时面板上不出现模型名，已告诉 M6 | §1.5、§3.4、§4.3、§5.4、§6.1、§6.4、§17 |
| F3 | HIGH | 页面有新建、改、删、恢复、「知道了」，违反面板只看；分组、名字、页头、来源一行与 plain-ui 不同 | 改。页面只看，没有任何写入控件，`/loops-apply` 删去（§8.2、§7.2）；人能改的地方写一句「要改：跟主 Agent 说……，或在输入框打 /loops ……」；人的命令 `/loops delete`、`restore`、`ack`，新建只在对话里；分组照 plain-ui（碰到某件事就做的、到点做的、本项目加的），名字「循环板」，页头「循环板 · 到点了或碰到某件事，就去做一件事」，来源一行「<插件名>带来的 · 只能看」；§2.4 第 11 行不再提三个单选；验收第 1、18 条改写（静态检查同 plain-ui 验收第 7 条）；草图重画。没照评审的一处：评审说保留 `recordInput: false`；本稿的 `/loops` 是人敲的短命令，改用默认值记下参数，与 `/rules` 一致，参数里没有要藏的东西 | §2.4、§7.2、§8、`mockup-loops.svg` |
| F4 | HIGH | 对话里加条目用带选项的待决，绕过 `propose_to_human` 与 `record_human_answer`；默认条目让主 Agent 自己拼四行 | 改。`loop_propose` 只校验并记一条 `open` 的提议，不写图（§7.1 第 1 步）；主 Agent 用 `propose_to_human`（`attach: 'loops:<id>'`）提提议式待决，正文末行是提议 id；`record_human_answer` 返回 `decided` 之后 M3 调 `acceptProposal`，钩子在 `src/design/record.ts`（第 3、4 步），不挂 `graph_decide` 与 `/graph-apply`；删掉 `plan` 字段、四行的自带校验与 `loopProposalQuestion`；S5 依赖 M3 第 6 步；默认条目的文字都改为 `propose_to_human`（M7 0.3 已改，§5.2 照写）；验收第 17 条改写。另外照规则板 0.6 补了图上的对照与补写（第 5 步），两块板同一条路 | §5.2、§7.1、§16、§17 |
| F5 | MEDIUM | 少做档的高峰结束时没有叫醒闲着的主 Agent（M6-R5） | 改。`loops.peak-end` 由循环行执行，少做档下主 Agent 闲着、这段高峰里走过步、goal 不是在等人或被人暂停时投一条 `followup`（§6.9 第 4 条），验收第 15 条（L2，注入的时钟）。评审给的文字里「resume the goal if it was blocked for idle rounds」模型做不到（`update_goal resume` 要人直接说的话，tool-goal:348–349），改为请 M7 加 harness 动作 `execute.resume-after-peak`，没有它时文字叫主 Agent 跟人说一句。加了两条评审没写的条件（高峰里没走过步、在等人时不叫），用来接住规则板 0.6 不采用 M6-R5 的两个理由。（0.4 注：`execute.resume-after-peak` 随最新的接缝裁定撤回，换成 `execute.resume-drive`，§19.3 F34） | §5.2、§6.9、§17 |
| F6 | MEDIUM | 不做档的判断读不到档位，也没看「这个会话本次高峰照常做」 | 改。循环板只问规则板：攒不攒看 `heldForPeak`（它已含「本次照常做」），档位的显示看 `glmHournessPeakMode.stateFor`；从不读规则板的文件（验收第 14 条的静态检查）；请规则板加 `peakStop`，补上「还没开单」与冷会话的空当（§17） | §6.9 第 2、3 条，§13，§17 |
| F7 | MEDIUM | `schedule.update` 的 `expected` 用 catalog 的一行，整键解码一律 `invalid_rule`；比较不用 DSH 的规范化形式会每拍都判为改过 | 改。`expected` 取 `schedule.list({sessionId})` 里那一条；比较用 DSH 返回的记录算的指纹，不自己规范化；`updated: true` 以外的码一律删掉重建，`updated: false` 不带码的算没变；假宿主照整键解码做（验收第 6 条） | §6.2 第 3 条，§10.1 |
| F8 | MEDIUM | 交回之后 10 秒的验收与默认 30 秒的去抖矛盾 | 改。§5.1、§5.2 的表给每个事件条目写 `limits`；插件的事件条目缺省 5 秒，人的 30 秒；投递的合并从 5 秒减到 2 秒；验收第 7 条的 10 秒在同一进程里成立，L2 钉住 | §5.1、§5.2、§6.4、§6.7 |
| F9 | NIT | 依据的版本过时；`nextPeakChange` 还不在 main | 改。依据按 M7 0.3、M6 0.3、规则板 0.6、plain-ui 0.6、M3 附录 0.3、M4 0.3 写，main 取 `436fbe7`；S3 的依赖加「M6 Q1 或规则板 R4」 | 文首、§4.1、§16 |
| F10 | NIT | `checkCall` 的 `glmSpend: 'none'` 不合法；命令原文怎样写没定；带主体的规则不会命中 | 改。没写 `glmSpend` 时不带；`run` 的 `glmSpend` 只收两种；命令原文 `argv.map(quoteForPwsh).join(' ')`；写明只有不带主体的规则与自报那两条管得到循环板的命令，页面也写 | §2.3、§6.6、§6.9 第 1 条，§8.2 |
| F11 | NIT | `emitLoopEvent` 没有 `agents` 却要读 `currentInitiator` | 改，换了做法。没有库函数了，各行经服务的 `emit` 交；因果改用循环板自己的异步上下文（harness 动作执行期间交来的事件带运行号），不再读 `currentInitiator`；也因此删掉了 0.1 会挡住正常修复的那半条（经过主 Agent 一回合的链） | §3.1、§6.3、§6.7 |
| F12 | NIT | 主 Agent 的会话挂着循环板的任务时不能直接归档 | 改。§6.2 写明归档的行为与之后怎样重建，页头加一行说明 | §6.2、§8.2 |
| F13 | NIT | 孤儿在已有绑定时也被认下；主 Agent 能建冒充的提醒 | 改。只在这一项没有活的绑定时认，否则删；`loops:schedule-tools` 也拒绝以 `Loop board: ` 开头的 `schedule_create` | §6.2 |
| F14 | NIT | 第 4 项的页面说法与草图有「门禁」 | 改。说法改为「在专门做检查的那份检出里跑一遍合入前的检查」，换词表加「门禁工作树 → 专门做检查的那份检出」，草图重画 | §5.1、§8.5 |
| F15 | NIT | 运行中的主 Agent 用 `inject` 可能滞留 | 改。要叫醒的条目在 agent 运行时用 `steer`，唤醒表与规则板一致；加 V11 | §6.4 第 3 条，§10.2 |
| F16 | NIT | M4 检查器写死的几个数没有显示 | 改。M4 的条目带 `ownRules`，页面展开写「检查器自己的规矩」；`LoopEntryDefinition` 加这个字段，`Contribution` 加 `details` | §2.1、§3.1、§5.3 |
| F17 | NIT | 验收说 `main-advanced` 恰好一次，两项都听它 | 随 F1 消掉：`main-advanced` 删了，主干前进的事件由 M7 交；停机期间的事件改为「各行交进收件箱的起来后照常处理」（验收第 16 条） | §1.4 |
| F18 | NIT | 行号：`sessionController` 名字在 2951；`tools.register` 在 2964–2979 | 部分改。复核原文：2951 是构造函数，服务名在 2952 的 `super(ctx, "sessionController", …)`，本稿写 2951–2952；`register` 的文档注释在 2968–2973、方法从 2974 起，2964 是别处的一条 `throw`。0.3 订正：方法到 2983 结束，0.2 写的 2968–2981 少了两行，改为 2968–2983（第 2 轮 F32 的处理） | §10.1 |

评审「未核实」里的几项：`dsh-client-ui-schedule` 只在时区不同时写时区的说法，本稿在 §2.2 标为〔未核实〕；其余的 V1–V11 照旧列在 §10.2，新加 V11–V13。

### 19.2 第 2 轮（0.2，0.3 处理）

挡路 4 条（F19–F22）全部改；不挡路的 11 条里 10 条照改、1 条（F32）只改了一半并写明理由。

| # | 级别 | 意见 | 处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F19 | MEDIUM，挡路 | 高峰结束叫醒主 Agent 被做成循环行自己的条目、挂在 `dsh-hourness` 下，违反接缝裁定（当时写的是「GLM 插件的默认条目」）；评审要 M6 加第五项 `glm:peak-end` | 改，按修订后的裁定，不按评审的改法。评审之后编排方修订了这条裁定（`design-context.md`「Seam rulings between designs」第 4 条，2026-10-30「Revised … after the loop board round-2 review F19」）：条目归编排层（`dsh-hourness` 带来），因为它看的是规则板的档位与主 Agent，GLM 包两样都没有；GLM 包只给高峰变化事件与高峰时刻的计算。0.2 把条目放在 `dsh-hourness` 下本身合修订后的裁定，错在理由与标注：理由改成修订后的说法（0.2 的「GLM 包不知道档位」不准，GLM 包经 `glmHournessPeakMode` 读得到档位，缺的是主 Agent）；高峰变化事件改名 `channel.peak-changed`、归到通道事件，「谁报」写 GLM 通道，与「事件是 GLM 给的」对上；第 13、14 项的来源一行改为「项目编排带来的 · 依据 GLM 通道的高峰时刻与规则板的高峰模式 · 只能看」。M6 不加第五项，GLM 条目仍是 4 项，循环行仍是 4 项，一页放行稿的件数不变；请规则板把它第 29 行修订之前的说法照改，请 M6 把 §8.3 的理由照改 | 文首、§0、§1.4 第 2 条、§1.6、§2.4 第 11 行、§3.3、§3.4、§4、§5.2、§6.9 第 4、5 条、§17 M6 与规则板 |
| F20 | MEDIUM，挡路 | 主 Agent 的会话归档之后，提醒照建、消息照投、都记成已投，谁也没收到；0.2 说 DSH 会拒，是错的 | 改。新函数 `holderState`（`src/loops/holder.ts`）：每次对账、每次投递之前与每一拍都重读 `mainAgentOf`（主 Agent 换会话就跟着换），再查 `workspaceRegistry.archivedSessionIds` 与上一次 `resolveAgent` 的错误码，得出 `ok`、`none`、`archived`、`not-found`、`elsewhere`、`unknown`。归档与找不到都算没有主 Agent：删掉绑在它上面的到点任务、不建新的，事件消息进 `held`（带原因，24 小时作废），不调 `resolveAgent`、不记已投；页头与首页一行「主 Agent 的会话已归档：在一个会话里打 /wish here」；每次状态变化写 `loop-holder`。另挂 `workspace/session-stop` 当场对账。读不到归档状态时偏向投出并报 degraded（V14）。改正 0.2 的错句（§6.2）与 §10.1 的「会话的拒绝」一行；加 V14–V16、验收第 26 条（L2 与 L3）。循环板不自己挑会话，主 Agent 只由人 `/wish` 指定（`d-one-main-agent`） | §0、§1.2 F15、§1.4 第 26 条、§6.2、§6.4、§6.10、§8.2、§8.3、§10.1、§10.2、§11、§13 |
| F21 | MEDIUM，挡路 | 人同意一条会按时跑的命令时没见过命令原文：四行每行至多 40 个码点，命令放不下，模型转述也不保证 | 改，两样都做：原文由 harness 附上，同意之前核对它被给人看过。`attachable` 带回 `detail: {markdown, mustShow}`（§3.1 `AttachDetail`）：一段「命令原文」围栏代码块（每条命令一行，`commandText(argv)`，与实际跑的、日志写的、交给规则板判的同一串）加注意事项；M3 原样接在四行之后放进 `text` 与待决正文。`record_human_answer` 拍板之前在会话日志里核对主 Agent 的回话里原样有 `mustShow` 的每一片，没有就返回 `not_shown`、不拍；拍了就在 `reason` 里留「已给人看原文 <摘要>」，`acceptProposal` 对跑命令的提议只认带这个摘要的 `llm` 拍板，所以绕开 `record_human_answer` 的拍板（第 5 步补写）不生效。没有图时 `/loops accept` 打两次，第一次只给人看原文。命令原文超过 400 个码点的不收。评审给的「400 个码点的 detail」改为「命令原文至多 400、整段至多 800」：注意事项另占至多 5 句。`describe` 不再含命令，限 40 个码点。剩下的「脚本内容以后改了」写进注意事项与 §1.5 | §0、§1.2 F6、§1.4 第 17 条、§1.5、§3.1、§6.6、§7.1、§7.2、§11.3、§12、§13、§17 M3 第 5–6 条、§18 第 7 条、`onepage.md` |
| F22 | MEDIUM，挡路 | 去重键没有按「一次发生」定，重启、重开再关、再修一轮之后又停下这类反复发生的事件会被当成重复、7 天不跑，也没有记录 | 改。§3.1 定键的写法（`<事件名去掉名字空间>:<主体>:<这一次的标识>`，至少三段，`emit` 校验结构）；§4.1–§4.3 每张表加「键」一栏，写明由谁生成（M7、循环行）与用哪一样当「这一次」。评审举的几种键有两处没照用：`stopped:<node>:<kind>:<rounds>` 与 `review-passed:<task>:<round>` 在人回话之后轮数从头数，会重复，改用停下批注的 `at` 与审查者的 `childId`；`peak:<edge>:<until>` 改为 `peak-changed:<edge>:<boundary>`（边界时刻更直接）。重复的每一次写 `loop-duplicate`、计数进行健康、列在「最近跑过的」，同一个键 24 小时内第 4 次时 degraded；验收第 8、16、27 条（两次重启两次 `execute.restart`） | §0、§1.2 F16、§1.4 第 8、16、27 条、§3.1、§4、§6.3、§6.10、§11.2、§13、§17 M7 第 3 条 |
| F23 | NIT | 规则板 0.7 已扩了 `heldForPeak`、加了 `stateForProject`，0.2 还在要 `peakStop`、从「任意一个活会话」读档位 | 改。依据改为规则板 0.7；撤回 `peakStop`，删去 §18 的 0.2 第 7 条；页面档位与第 14 项判档位用 `stateForProject(<项目根>)`；§6.9 第 2 条只剩冷会话还没请求头的那一步，恢复之后再问一次 `heldForPeak` | 文首、§6.9、§13、§17 规则板、§18 |
| F24 | NIT | 「这段高峰里走过步」只在内存里，重启或别的进程走步时判错 | 改。`main-step.json`（`{session, at}`，任何进程都写，至多每 60 秒，跨进或跨出高峰的那一步当场写）；第 14 项按它判，高峰的起点按分钟往前调 `peak` 找，不另存状态；读不出按「走过」算 | §6.1、§6.9 第 4 条、§9.1、§1.4 第 15 条 |
| F25 | NIT | 「DSH 没投出去」的 5 分钟会在 DSH 自己补投之前就动手 | 改。从 `scheduledAt` 与本进程开始跑这个项目的时刻中较晚的那个算起 | §6.2、§11.2、§15 |
| F26 | NIT | `emit` 的 `busy`、`io` 不重试 | 改。循环行在内存里 10 秒内再试三次（1、3、6 秒），第三次失败才报 degraded；验收第 29 条 | §3.1、§6.3、§11.2 |
| F27 | NIT | 主干是红的也算 `failed`、让行健康变色 | 改。§6.5 写结局的口径：跑完就是 `done`（要主 Agent 做事时带 `tell`），`failed` 只给没能跑完；§17 M7 第 1 条写给 M7 | §6.5、§17 |
| F28 | NIT | M7 0.3 的条目没有 `why`，照原样会被全部丢掉 | 改。§17 M7 第 1 条请每项补 `why`（1–150 个码点、人话、过 `plainWordsIn`），给了例句；§5.1 写明原因 | §5.1、§17 |
| F29 | NIT | 第 13 项说规则板少开 GLM 子 agent，其实数归规则板、执行在 M7 | 改。`does` 写「规则板定档位与上限，项目编排派活时照上限数」（评审写的是「M7 派活时」，页面不写模块代号，改为插件名）；页面显示「少做：高峰里同时至多 1 个 GLM 子 agent」，数在少做档的高峰里取 `glmWorkerCap`，其余时候取公共库的 `PEAK_REDUCE_GLM_WORKERS` | §2.4 第 11 行、§5.2、§8.2、§13 |
| F30 | NIT | 页面用「行」 | 改。三处照评审改成插件名（「交给项目编排自己做」「项目编排的这一部分没启用，这一项现在不跑」「项目编排没给出明细」），另把 §3.2 的灰显原因与「要你看一眼的」里「读不懂」的那一行也改了；换词表加「行 → 插件名」。行健康里仍写行 id（那是给排查的人看的诊断，不是页面） | §3.2、§5.3、§8.2、§8.5 |
| F31 | NIT | 一页放行稿的三处用词 | 改，照评审的句子；件数（编排层 16、GLM 4）在修订后的裁定下不变 | `onepage.md` |
| F32 | NIT | 三处行号：`tools.register` 应是 2964–2979，`super(ctx, "sessionController")` 应是 2951，`resolveAgent` 应是 3036–3038；§19 的 F18 一行两处都错 | 部分改。复核（`Select-String` 与编辑器都按 1 起数；`dsh-api-session-controller/lib/index.js` 只有 LF，共 3,367 行）：构造函数 2951、`super(ctx, "sessionController", …)` 2952、`resolveAgent` 3037–3039；`dsh-tools` 的 2964 是上一个方法里的 `throw`，`register` 的文档注释 2968–2973、方法 2974–2983。评审的三个数比原文都早一到四行，像是按 0 起数的读法，所以 2951–2952 与 3037–3039 不改。确实错的一处：0.2 写的 `register` 到 2981 止，方法实际到 2983，改为 2968–2983；F18 一行同改 | §10.1、§19.1 F18 |
| F33 | NIT | 两个 DSH 进程时，持锁的进程投不进在另一个进程里打开的主 Agent 会话 | 改。`handover.json`：主 Agent 的会话在不持锁的进程里打开时它写这个文件，持锁的进程在下一拍、手上没有正在跑的运行时写下状态、删锁，那个进程接手；期间 `session/writer-held` 的消息进 `held`（不记 `failed`），交接之后投出；`loop-handover` 留痕；验收第 28 条、V16 | §6.1、§6.4、§6.10、§9.1、§11.2 |

评审「未核实」里的几项：V1–V13 照旧；F20 要的 V14（`workspaceRegistry` 读得到）加了，另加 V15（`workspace/session-stop` 收得到）与 V16（`resolveAgent` 的两种错误码）。评审列的「别的设计还没有的请求」（M3 的 `attach`，M7 的 `execute.resume-after-peak`、`hourness.outside-advance` 与载荷字段）照旧是依赖；评审预计的「M6 的第五项」因裁定修订不再要。（0.4 注：`execute.resume-after-peak` 已撤回，改请 M7 的高峰等待停住与 `execute.resume-drive`，§19.3 F34。）

### 19.3 第 3 轮（0.3，0.4 处理）

第 3 轮是 `question-11` 下的第三轮，按规矩停下交人；人准了再改一稿（「行，改吧」）。挡路 2 条（F34、F35）都改；不挡路 4 条（F36–F39）都改。

| # | 级别 | 意见 | 处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F34 | MEDIUM，挡路 | 高峰结束的那一项照的是被取代的设计：不做档一律 `skipped`，M7 因高峰停住的自动推进没人接上；少做档请 M7 加 `execute.resume-after-peak` 去恢复以 `hourness-idle-rounds` 阻塞的 goal，会跳过该问人的地方，也是裁定第 3 条不让 M7 加的高峰逻辑；读 goal 用 `goals.get`，冷会话读不到 | 改，照评审的第一种做法（直接调、由 M7 判），按 M7 0.4 盘上稿补了一处。§6.9 第 4 条的表重写成十行：持有者状态两行之后，第 3 行在档位之前恰好调一次 `execute.resume-drive`（经执行行那一份的 `run`，即 `glmHournessExecute.runAction`），少做与不做两档都调；`done` 就告诉主 Agent `… The harness resumed the drive that waited out the peak; continue with the work you moved.`，`skipped` 往下判，`failed` 告诉主 Agent 跟人说一句、行健康报出。冷会话：M7 0.4 的动作要持有者的活 agent 在调用它的进程里，所以循环板先经 `resolveAgent` 把它恢复到本进程，只在它这段高峰里走过步时才恢复（评审要的是「cold holder sessions included」，原文假定由 M7 自己取 agent）。`elsewhere` 时存一条「再判一次」，交接之后由主 Agent 所在的进程判，两边合起来至多调一次。`hourness-idle-rounds` 进跳过的那一行（「主 Agent 没事可做，已经在问你」）；0.3 的第 787 行（不做档跳过）留着，只管规则板自己停下的活；0.3 的第 792–793 两行删去。§17 M7 第 6 条撤回 `execute.resume-after-peak`，改请停住与 `execute.resume-drive`（结局口径、幂等、60 秒内给结果）。没采用评审的第二种做法（循环板先读原因码，对上 M7 导出的常量才调）：同一个判断会分在两处，理由写在表后第一段；规则板 0.8 第 8 点的字面是这一种，对规则板没有影响，§17 规则板一条写明 | 文首、§0、§1.2 F11、§1.4 第 15 条、§1.6、§2.4 第 11 行、§3.1 `run`、§3.3、§5.2 第 14 项、§6.9 第 4、5 条、§6.10、§11.2、§12、§13、§15、§16 S4、S8、§17 M7 第 6 条与规则板、§18 第 6、16 条、`onepage.md`、`mockup-loops.svg` |
| F35 | MEDIUM，挡路 | 对账第 0 条「不是 `ok` 就全删」与 §6.4 表里 `elsewhere`、`unknown` 两行「任务留着」相反；照字面实现，读不到归档状态时晨报、周报与巡检永远不建，会话开在另一个窗口时每一拍硬删三条任务、连发送记录 | 改，比评审的改法多走了一步（编排方派单的要求：删任务不可逆，只删能证明是自己的、已经没用的，并留记录）。第 0 条分三种：`ok` 与 `unknown`（读不到归档状态）做第 1–4 条，但绑在持有者会话上的一条都不删（第 3 条改回失败时留着下一拍再试，第 4 条认不下来的留着）；`elsewhere` 与 `unknown`（持有者记录读不出；0.3 把它算作 `none`，`none` 会删）不建、不搬、不改、不删；只有 `none`、`archived`、`not-found` 才删，`none` 要连着两次对账都读到没有记录。删任务只经一个函数 `removeTask`，要同时成立「能证明是循环板建的」与「八种原因之一」，删之前全文写进 `removed-tasks.jsonl`（保留 30 天），写不进就不删；每次删除写 `loop-task-delete`，页面「最近跑过的」列出。5 分钟的补投在 `unknown`（读不到归档状态）时只补投、不删不建，`elsewhere` 时不判。验收第 26 条加 L2：四种看不清的情形各跑 10 拍，三条任务的 id 不变，`delete` 与 `create` 一次都没调 | 文首、§0、§1.2 F15、F17、§1.4 第 26 条、§1.6、§6.2 第 0–4 条与「删任务的规矩」「到点之后」、§6.4 的表、§6.10、§8.2、§8.3、§9.1、§9.3、§10.2 V14、§11.1、§11.2、§11.3、§13、§15、§16 S4、§17 M3 第 8 条、§18 第 15 条、`onepage.md` |
| F36 | NIT | `elsewhere` 没有出口：一次 `session/writer-held` 之后就一直停在 `held`，那边不写 `handover.json` 时消息等到 24 小时作废，页面还写着「至多 2 分钟」 | 改，照评审。`writer-held` 的标记只管 5 分钟，过了、又没有新鲜的 `handover.json` 时作废，存着的消息重试一次，所以对这个会话的 `resolveAgent` 每 5 分钟至多一次；连着超过 5 分钟时页头与首页写「主 Agent 的会话在另一个 DSH 窗口里，这块板交不过去」（本进程在等手上的运行跑完再交时另写一句），行健康 degraded。验收第 28 条加一例 | §6.1、§6.4 的表与第 2 条、§8.2、§8.3、§9.1、§11.2、§15、§18 第 14 条 |
| F37 | NIT | 命令原文那一段是存下的还是每次重算没写；「它跑的是项目里的文件」只在文件已存在时出现，先提议后写脚本会让核对对不上、人要再同意一次 | 改，两样都做。`detail`、`attachDigest(detail)`、`cautions`、`describe` 只在 `loop_propose` 时算一次，存在提议的变更记录里，`attachable` 返回存下的、`acceptProposal` 比存下的摘要；内容一改就是新提议。另把那句注意事项的条件改成只看 `argv` 的写法、不看文件在不在，提议时就有这一句。验收第 17 条加一例 | §3.1 `attachable`、§7.1 第 1、4 步、§9.2 第 4 步、§15 |
| F38 | NIT | M6 的 `LoginView.since` 可选，没有时 `login-rejected:<path>:<since>` 末段为空，循环行自己的 `emit` 会拒，登录失效的提醒投不出 | 改，照评审。`since` 是 ISO 时刻：有 `LoginView.since` 时取它，没有时取第一次看到这次被拒的那一拍（记在 `machine/state.json` 的 `loginRejectedSince`）；键、载荷、`told.json` 用同一个串；`path` 没有时为空串，键里写 `glm`。M6 0.4 盘上稿的 `LoginView` 与 0.3 相同（M6 在被拒时从流水那条记录取 `since`，所以多半有值），不请 M6 改。验收第 23 条加一例 | §3.4 M6-L3、§4.3、§9.1、§9.3、§12、§15、§17 M6 第 4 条 |
| F39 | NIT | 一页放行稿两句不准：「页面上没有按钮」「不问。」；草图把「它自己执行，这里只列出」写在改完文件就跑检查的来源一行，而它经 `recordRun` 报运行 | 改，照评审的句子；草图那一行改为「项目编排带来的 · 只能看」，并补一行「上次」 | `onepage.md`、`mockup-loops.svg` |

与相邻设计的接缝（写本稿时的盘上版本，见文首「依据」）：

- M7：照 0.3 与 0.4 盘上稿核对。0.4 盘上稿已有本稿要的几样：执行行与运维行经 `contribute` 交条目、事件与动作（含 `execute.resume-drive`）；`hourness-peak-wait` 连着两轮停住；`why`、按「这一次」写的键、`hourness.outside-advance`、`floorHit` 等载荷字段；结局口径；`execute.trunk-check` 的覆盖规则。M7 0.4 写着「动作要持有者的活 agent 在本进程，不在时 `skipped`」，本稿因此在第 14 项里先恢复冷会话（F34 一行）。M7 0.4 另加了高峰结束 5 分钟后自己复查一次，与第 14 项并存、互不冲突（§17 M7 第 6 条）。还开着的：M7 0.4 的 §3.9.5 正文在本稿写完时还是 0.3 的，「停住时给模型的话」「人在停住期间说话时怎样接上」还没写出来，本稿不依赖它们；M7 0.4 的看门（交出的事件 5 分钟没人认领就自己执行）不管 `channel.peak-changed`（那不是 M7 交的事件），与第 14 项没有交叉。M7 0.4 写完、或另选「循环板先读原因码」那一种时，§6.9 第 4 条第 3 行跟着改，别处不动。
- M6：照 0.3 与 0.4 盘上稿核对。契约（`LoginView`、`ChannelTrigger`、`ChannelLoopDefault`、`loopDefaultsOf`）与四项条目没变，M6-L1 到 M6-L5 照旧落在 §3.4。还开着的两处是 0.3 起就请 M6 改的说法：§8.3 留在 GLM 包外的理由还写着「GLM 包不知道档位」（m6 0.4 盘上稿第 777 行），M6-L1 还要「GLM 通道包未装」那一行（第 785 行）；都不挡循环板（§17 M6 第 1、2 条）。`nextPeakChange` 仍不在 main，是循环板 S3 的依赖。
- 规则板 0.8：`stateFor`、`stateForProject`、`heldForPeak`、`PEAK_REDUCE_GLM_WORKERS` 照旧；`peakHoldFor` 循环板不读；第 8 点照做，字面差一处（§17 规则板一条）。不再请规则板改东西。

### 19.4 第 4 轮（0.4 批准，四条 NIT，0.5 处理）

第 4 轮判 APPROVED（挡路 0，不挡路 4：F40–F43），本稿逐条关掉。四条都不挡路，评审说可以并进实施时最先碰 §6.2 或 §6.9 的那一步；本稿因为要照人新定的三项决定改写，顺手在设计里改了。评审文件 `design-review.md`、`design-review.json` 不由作者改，关没关由下一轮评审判。

| # | 级别 | 意见 | 处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F40 | NIT | 第 3 行恢复冷会话时，M7 0.4 自己的 `agent/created` 两行先接上推进（m7:§3.9.1），循环板的 `run` 得 `skipped`；验收第 15 条冷会话一例只对假的执行行成立，0.4 表后那句「它就只是被打开，不走一步」不对 | 改，照评审的第一种做法（循环板这边，M7 不用改）：本行刚恢复了冷会话、`run` 得 `skipped` 时再读一次 `goals.get(agent)`，已是 active 就记 `done`，原因「打开会话时 M7 接上了推进」，告诉主 Agent 一次。`tell` 用中性的「The drive is running again」：M7 接上的也可能是重启之后 disarm 的那种，不一定是高峰里停住的。验收第 15 条冷会话一例改为两种假 M7（不动、先接上），只钉「goal 在高峰结束后 1 分钟内为 active、主 Agent 恰好一条消息、`run` 至多一次」。表后那句改写成 M7 两行的实际行为，并写明与 DSH 到点投递打开冷会话相同。评审给的可选一条也做了：档位读得出且为无影响时不恢复冷会话、不调（无影响档里 M7 不会停住） | §6.9 第 4 条第 3 行与表后第一段、§1.4 第 15 条、§15、§17 M7 第 9 条、§18 第 16 条 |
| F41 | NIT | `entry-gone` 把「交它的一方还没交」「撤回了还没再交」也当成确知没了，循环行先于 M7 的运维行对账、行重启或原地重组时，晨报、周报与巡检会被删掉再建，连发送记录 | 改，照评审：`entry-gone` 分两种来由。确知没了（人删了它；同一来源新交来的一份里没有它）当拍删；暂时不在（来源在这个进程里还没交、或撤回了还没再交）同 `none` 一样等，开始跑项目满 5 分钟、连着两次相隔至少 60 秒的对账都看不到才删。来源按条目 id 的名字空间对上，`state.json` 的 `sources` 记每个来源最近一次交来与撤回的时刻。验收第 26 条加 L2 (e)–(h)：先对账后交、撤回 30 秒又交、新的一份里没有、撤回之后一直不交 | §6.2「删任务的规矩」、§9.1、§1.2 F17、§1.4 第 26 条、§15、§18 第 21 条 |
| F42 | NIT | 放行稿的疑问一句没说清不确定的是循环板自己的少做档叫醒，人回「不叫」对不上 | 交给重写放行稿的那一步（本稿不动 `onepage.md`），句子写在 §18 末段。0.5 两档都叫醒（`d-main-agent-peak-exempt`），所以句子不再写「少做档」，用「闲着的」把它与接上停住的自动推进分开：「疑问：最没把握的是**高峰后叫醒**闲着的主 Agent，嫌打扰就改成不叫。」 | §18 末段 |
| F43 | NIT | 三处旧文字：§11.2 说「M7 在这种时候本来就不停住」；第 9 行别的原因码写「要你说一句才接着走」；§1.2 的 F17 在 F16 之前 | 改，照评审：§11.2 那一格改为「不调，往下判；M7 0.4 停住了也会在高峰结束 5 分钟后自己接上」；第 9 行别的码只写「自动推进被挡住了（<码>）」，删去后半句并写明为什么；§1.2 的 F16、F17 换了次序 | §11.2、§6.9 第 4 条第 9 行、§1.2 |

0.5 的每处改动答的是哪一条决定或发现：

| 改动 | 答的是 | 在哪 |
| --- | --- | --- |
| 条目是「`when` + `filter?` + 动作」，`filter` 从 `Trigger` 里提出来；共用的形状 `HookShape`、`ScriptAction` 与 `validateWhen`、`matchesFilter`、`nextOccurrence` 放在 `src/loops/trigger.ts` 一处；`FilterTest` 加 `matches`，`paths` 收 glob | `d-boards-as-hooks`；编排方的接缝裁定（形状、事件表与筛选归循环板） | §0、§1.2 F1、F21、§2.1、§2.2、§3.1、§3.2、§12 |
| 0.4 的 `run`（`argv` 命令）换成脚本（`script`）；人在四行之后看到脚本原文，同意即生效、不试运行；`cautions` 换成脚本的五句；`AttachDetail` 放大到能装下一段 4000 个码点的脚本 | `d-boards-as-hooks`（「同意了直接运行就行」） | §1.2 F4、F6、§1.4 第 11、17 条、§1.5、§2.3、§3.1、§5.5、§7.1、§7.2、§11.3、§12、§17 M3 第 9 条、§18 第 7、22 条 |
| 共用的脚本执行器 `runScript`：标准输入的信封、单独的进程、项目目录、最少环境、按内容哈希钉住、执行核对过的私有副本、两队、输出上限；起子进程只在这一处；页面写明每一项的超时与崩溃时怎样 | `d-boards-as-hooks`（编排方定的几条：脚本在仓库、哈希钉住、超时、单独进程、拿不到凭证）；接缝裁定（执行器归循环板） | §1.2 F18、§1.3、§1.4 第 30、31 条、§2.4 第 17 行、§6.6、§8.2、§10.2 V18、§13、§15、§16 S3 |
| 拦路的一路超时之后返回带 `late` 的 `timeout`、进程在后台跑到 10 分钟、后台至多 8 个；事件声明的 `gateOnErrorDefault`（主干前进之前缺省挡住）；循环板的脚本超时为 `unfinished`、交给主 Agent、事件留到下一次；超时计进周报 | `d-script-timeout` | §1.2 F18、§1.4 第 31 条、§1.6、§2.2、§2.3、§3.1、§6.6、§6.7、§6.10、§6.11 |
| 名字空间 `gate.` 留给规则行的拦路事件；循环板的条目用不了；`emit` 不收；拦路的含义只写引用 | 接缝裁定（哪些事件拦路、结果怎样进 `checkCall` 归规则板）；`d-rules-visible`（门在规则板） | §0、§1.4 第 35 条、§3.2、§3.3、§4、§4.6、§6.3、§12、§13、§17 规则板第 2 条 |
| 存放：人加的条目与脚本在 `docs/loops/`，运行时在 `.llm/loops/`（自带 `.gitignore`），用户级只留 `loops/machine/`；删去 `<userHome>/loops/projects/<键>/` 与快照 `entries.json`；`loops:files-only`；§9.3 的核对（在外面改过就不跑、照图上的拍板认回） | `d-rules-in-repo`；`d-memory-scope`（全局只留的那几样） | §0、§1.2 F19、§1.4 第 20、32、33 条、§2.1、§2.4 第 16a 行、§6.1、§6.3、§7、§8.4、§9、§11、§13、§14、§16 S2 |
| 行激活时从 DSH 的工作区登记表列项目；持有者记录的定位交给 M3 | `d-rules-in-repo`（主 Agent 的持有者记录进项目的 `.llm/`） | §6.1、§6.4、§10.1、§10.2 V17、§17 M3 第 10 条 |
| 不读 `heldForPeak`、不攒给主 Agent 的消息、不改写 DSH 提醒那一步；第 14 项两档同一张表（删去「不做档一律跳过」），第 13 项写明主 Agent 照常干活 | `d-main-agent-peak-exempt` | §0、§1.2 F11、§1.4 第 14、15 条、§1.5、§1.6、§2.4 第 11 行、§5.2、§6.4、§6.9、§10.2 V8、§12、§13、§18 第 6 条 |
| 周报的两张单子（4 周没结果的提议删，反复超时的提议修）；`loop_propose` 的批量删除 | 编排方定（可推翻）的「周报提议删掉久不出结果的条目」；`d-script-timeout` 的「反复超时的提议修」 | §1.2 F20、§1.4 第 34 条、§3.1、§6.11、§7.1、§17 M7 第 8 条、§18 第 20 条 |
| `loop_propose` 的说明带两个做好的例子，过真校验与真执行器 | `d-agent-examples` | §7.3、§1.4 第 36 条 |
| M4 的检查器照同一个形状写在循环板上（`env.files-edited` + 按扩展名筛 + 自带的「跑检查」） | `d-boards-as-hooks`（「规则板、循环板与 M4 的检查器照此改」） | §5.3、§17 M4 第 4 条 |
| F40–F43 | 第 4 轮评审 | 上表 |
| 接缝核对的修正：人加的检查（动作 `check`，命令取自环境工具节点，由循环板的 `runCommand` 跑，`commandDetail` 给人看命令行、拍板要「已给人看原文」的记号）；`contribute` 不收 `script` 与 `check`；`env.files-edited` 进收件箱、人能选，载荷加 `root`；M4 自带的检查器仍是 `self`；`refused` 多 `check-changed`、`check-missing`；V19 | 编排方的裁定「Check entries seam」（2026-10-30，M4 第 4 轮评审 F17 之后） | §0、§1.2 F22、§1.4 第 37 条、§1.6、§2.3、§2.4 第 3 行、§3.1、§3.2、§3.3、§4、§4.4、§5.3、§6.6、§6.9 第 1 条、§6.10、§7.1、§7.2、§9.1、§10.2 V19、§12、§13、§16 S3、§17 M3 第 9 条与 M4 第 1、4 条、§18 第 2、22、23 条 |
| 接缝核对的修正：`gate.` 事件可以有 `session` 字段（规则板的三个拦路事件都带它，0.5 的校验会把它们整个丢掉） | 接缝核对（`rules/seam-check-v09-v05.md`）；事件表与声明格式归循环板 | §3.2、§17 规则板第 2 条 |
| 接缝核对的修正：`matches` 写入时在长输入上试跑、单个超过 50 毫秒就 `invalid`（规则板 0.9 写成「照循环板的同一条」，0.5 原先没有） | 接缝核对；筛选归循环板 | §2.2、§12 |
| 接缝核对的修正：§12 的 `AttachDetail` 一行与 §3.1 的上限对齐（6000、1–8 片、每片 4000）；§17 M3 第 6 条「规则板的提议没有 `detail`」改为规则板 0.9 也带 | 接缝核对 | §12、§17 M3 第 6 条 |
| 接缝核对的修正：`loops.file-changed` 的判定写成 `src/loops/file-watch.ts` 的 `watchPaths` 一处，规则板检测器的文件触发也调它（0.4 与规则板 0.8 各写一份、兜底间隔 60 秒与 30 秒不同） | 接缝核对；事件表归循环板 | §4.1 |
| 接缝核对的修正：执行器的拦路一路在超时之后被 `signal` 中止时结束后台进程；晚到结论的含义（怎样记、何时告诉主 Agent、后台满了怎样）不再在 §6.6 复述，改引 rules:§6.7 | 接缝核对；裁定「拦路的含义归规则板」 | §6.6 |
| 接缝核对的修正：引用规则板的地方改按 0.9：拦路事件的 id 由 rules:§2.3 定（不再「暂记」）；`checkCall` 入参没改；`condition` 代替「信号、主体」；CHARTER 是 §3.2 第 3 条；没写节号的「规则板设计」补上节号；§6.6 的环境名单不再说「与 rules:§5.3 相同」；周报里两块板的删除提议各提各的 | 接缝核对 | §1.4 第 31 条、§2.2、§3.3、§4.6、§6.6、§6.9、§6.11、§9.1、§17 规则板第 1、2、7、9、10 条与 M7 第 8 条、CHARTER 一条、§18 第 17 条 |

与相邻设计的接缝（写本稿时的盘上版本，见文首「0.5 的依据」）：

- 规则板 0.9 与本稿同时在写，写本稿时没有读到它。循环板交出的形状、事件表、筛选与执行器写在 §2.2、§4.6、§6.6，规则板要照用、要引用的列在 §17 规则板一条第 1–10 点。之后的接缝核对（`.agents/tasks/rules/seam-check-v09-v05.md`）读了两稿，对不上的已照核对改（上表末几行），拦路事件的 id 以 rules:§2.3 为准。
- M4 0.4 与本稿同时在写；循环板两种交法都收（§5.3），不挡 M4。
- M7 0.4、M3 附录 0.4、M6 0.4：M7 不用为 F40 改；M7 的周报加两节、M3 放大 `AttachDetail` 的上限与搬持有者记录，是本稿新请的（§17）。

### 19.5 第 5 轮（0.5，0.6 处理）

第 5 轮判 CHANGES_REQUESTED（挡路 3 条 MEDIUM：F44–F46；不挡路 10 条 NIT：F47–F56；第 4 轮的 F40、F41、F43 关闭，F42 留到放行稿）。人 2026-10-30 回「可以」，准了这一稿（`schedules` 节点 08:47Z 批注）。本稿逐条处理；F42 仍留给重写放行稿的那一步（§18 末段）。

| # | 级别 | 意见 | 处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F44 | MEDIUM，挡路 | 仓库里的条目文件与 git 打架：切到没有这个条目的分支、`git stash -u`、`git revert`、或在合并与变基中途，§9.3 第 2 行把这些当成「循环板欠着没写完」，把文件写回去，等于撤销主 Agent 的 git 操作（`d-main-agent-shell`），只留一行日志；§9.1 的「切了分支那一项就不在」永远不成立，两节自相矛盾 | 改，照规则板 0.9 对 `docs/rules/` 的同一套做法（评审指的 rules:§7.1、§7.4、§7.5）：新文件 `.llm/loops/repo-written.json` 记循环板最近一次写成的每一项的 `fileSha256`（与 `scriptSha256`）；§9.3 只在变更记录比文件新、且 `repo-written.json` 也与变更记录不同（确实欠着写）时才补写，相同而文件变了、或变成较早的一版，都当成「在它之外变了」（`entry-changed`），不写回；文件不在而最后一条不是 `delete` 的，是「当前检出里没有」（`not-in-checkout`，`entry-gone`「暂时不在」），不写回、页面写明，切回来照常跑；§9.2 第 5 步在 `MERGE_HEAD`、`REBASE_HEAD`、`CHERRY_PICK_HEAD`、`rebase-merge/`、`rebase-apply/`、`BISECT_LOG` 或 `index.lock` 在时先不写、每拍看一次、都不在了再写。验收第 33 条加 (d)(e)(f) 三个真走 git 的 L2 | §0、§9.1、§9.2 第 5 步、§9.3、§6.10（`not-in-checkout`）、§1.4 第 33 条、§8.2 第 2 条 |
| F45 | MEDIUM，挡路 | `env.files-edited` 的去重键用「这一步的序号」，而 DSH 每个回合从 0 数起（agent-loop:865、1040、955），不同回合的同一步撞键，第二次改动的检查被当成重复、不跑，违反 F16 与 §4 的「真的又发生一次，键一定不同」 | 改，照评审：键改成 `files-edited:<会话>:<turn>-<step>`，两个数都取自 `agent/pre-step` 的载荷，`turn` 由会话投影 `turnBoundary` 接续（agent-loop:956–959、782），宿主重启之后也不从头数；载荷里没有 `turn` 的别的宿主版本用进程启动毫秒加本进程里这个会话的第几次。验收第 37 (e)：同一会话第 3、4 回合第 1 步各改一次，两个键两次跑 | §4.4、§17 M4 第 4 条、§1.4 第 37 条、§10.1（agent-loop 的证据） |
| F46 | MEDIUM，挡路 | 人加的检查按条目去抖、不重叠、限次，两个工作树里并行的子 agent 30 秒内各改一次只跑一次，用的是先来的那个的 `cwd` 与文件，另一个的改动没被检查、也没人告诉它，违反 F22，且没有任何信号 | 改，照评审：动作为 `check`、或 `script` 带 `to: 'event-session'` 的事件条目，去抖、合并、不重叠、待跑与限次都按「条目 + 会话 + `root`」分组；每组在自己的 `root` 作 `cwd`、自己那几个事件的 `files` 并集填 `{files}`、结果交给自己的会话；`maxPerHour` 按组缺省 30；同时有组至多 32 个，第 33 个记 `suppressed`（`groups`）。验收第 37 (f)：两个工作树 5 秒内各改一次，两次运行各在自己的检出 | §6.6（`runCommand` 的分组）、§6.7（「按组」）、§6.4（`to: 'event-session'`）、§4.4、§1.4 第 37 条 |
| F47 | NIT | 7 处 0.4 留下、与 0.5 相抵的文字 | 改，逐处：§0 失败一行的「超时或崩溃算没过」改成「超时算没跑完，崩溃算没过」；§11.2 跑脚本超时一行改成 `unfinished`、交主 Agent、事件下次再跑；§2.1 `action` 一行补上 `check`；§3.4 `peak-start` 换法把 `filter` 从 `when` 里提到条目上；§5.2 第 14 项的文字「少做档叫醒」改成「闲着的主 Agent 叫醒」；§17 M3 第 8 条删去 `readHolder(holderFile(userHome, …))` 的备选；§2.4 第 11 行的「要改：/rules peak」补「或跟主 Agent 说」 | §0、§11.2、§2.1、§3.4、§5.2、§17 M3 第 8 条、§2.4 第 11 行 |
| F48 | NIT | F40 的「无影响档不恢复、不调」用到了热会话：人在高峰中途从少做改成无影响时，M7 在改档前停住的 goal 要等 M7 5 分钟后复查才动 | 改：只对冷会话保留「无影响不恢复」的捷径，热会话任何一档都调一次 `run`（一次幂等调用）；验收第 15 条加一例（高峰中途改档、热会话、停住的 goal 一次接上） | §6.9 第 4 条第 3 行、§1.4 第 15 条 |
| F49 | NIT | 拦路脚本超时转后台后占不占 4 个在跑的位置没写，占的话四段慢脚本能把后面每次拦路检查挤成超时；「排满」没有数 | 改：超时转后台的让出位置、只算进 `GATE_LATE_MAX`（8）；同时在跑至多 `GATE_CONCURRENT`（4），排队至多 `GATE_QUEUE_MAX`（16），再来的当场返回不带 `late` 的 `timeout` | §6.6（常量与「几队」） |
| F50 | NIT | `runCommand` 只有一队，人的检查排在循环板的 `work` 脚本后面；对 M4 自带检查器说「第 ⑤ 点由 `runCommand` 接住」不准（M4 的检查器有自己的并发与 20 秒等待） | 改：`CommandRequest` 加 `queue`：`'check'`（人的检查，`CHECK_CONCURRENT`=2，单独一队）与 `'direct'`（M4 自带检查器，不排队、并发由 M4 管、信封可空）；§17 M4 第 4 条改写，`m4` 的 graph-ops 批注一并更正（`graph-ops-v06.json`） | §6.6、§17 M4 第 4 条 |
| F51 | NIT | 新克隆上认回只看图上有没有拍板，不看内容，一起改过的条目与脚本会凭一张旧待决就跑 | 改：§9.3「从没出现过」一行加一步——条目文件按 M3 的规整后，脚本块要与 `scripts/<id>` 的字节相符、`script.sha256` 对上（检查是 `argv` 与 `commandText` 相符），对不上不认回（`unadopted`）；验收第 33 (c) 加「脚本被一起改过时不认回」 | §9.3、§1.4 第 33 条 |
| F52 | NIT | 用户级 `loops/machine/` 还放了 `last-step.json`、`runner.lock`、`runs.jsonl`（`loop-read`），`runs.jsonl` 是每个项目之外的一份流水，CHARTER 0.7 §9 与 `d-memory-scope` 没列 | 改：`loop-read` 写进 `last-step.json` 指向的那个项目的运行记录，`machine/` 只留提醒要的状态（锁、登录状态、读额度时刻、`told.json`、`last-step.json`）；§9.1 写清 `machine/` 里有什么、没有什么。本稿不改 CHARTER（CHARTER 由规则板那一批管），只把 `loop-read` 挪回项目里，所以不要 CHARTER 加一行（接缝核对的开点 1 取这一半） | §9.1、§6.10（`loop-read` 的 `project`）、§6.10「写到哪里」 |
| F53 | NIT | Windows 上 libuv 找程序先看子进程的 cwd、只试 `.com`/`.exe`：cwd 是工作树时放在那里的 `node.exe`、`git.exe` 会顶替 `PATH` 上的；`npx` 给 `ENOENT` 而不是 `EINVAL`；M4 的 `{files}` 把以 `-` 开头的文件名当选项 | 改（加固）：新纯函数 `resolveProgram` 把解释器与 `argv[0]` 解析成 `PATH` 里项目之外的绝对路径再 `spawn`，解析到 `.cmd`/`.bat` 的在起进程前判出（`needsShell`）；请 M4 的填占位函数给以 `-` 开头的文件名前面加 `./`；V19 期望 `ENOENT` 或 `EINVAL` | §6.6（`resolveProgram` 与两处解析）、§10.2 V19、§17 M4 第 4 条 |
| F54 | NIT | `env.files-edited` 每个改文件的步都写收件箱、记键，即使没人听；忙的一天能把 M7 的键挤出 5000 的上限，削弱 7 天重放保护 | 改：`emit` 在本进程跑着这个项目、执行表读全、没有条目听这个事件时返回 `{ok: true, unheard: true}`，不写、不记键；服务加 `listens(event, cwd)` 给 M4 先问；去重键按事件名字空间分开记上限（`hourness.` 5000，`env.` 2000，`loops.`/`channel.` 各 1000，别的来源各 1000）。验收第 27 条加「没人听时不写」与「名字空间分开记」两例 | §3.1（`EmitResult`、`emit`、`listens`）、§4.4、§6.3、§1.4 第 27 条 |
| F55 | NIT | `**` 匹配零个目录没定义，例子 2 的 `docs/**/*.md` 要靠它匹配 `docs/setup.md`，规则板的 `writes` 也用同一套 glob | 改：§2.2 写明「`**` 作为一整段时匹配零个或多个目录（`docs/**/*.md` 也匹配 `docs/setup.md`），不是一整段的 `**` 同 `*`」；`matchesFilter` 的 L2（验收第 36 条） | §2.2、§1.4 第 36 条 |
| F56 | NIT | V13 已答、答案是否：图引擎对什么都没改的 `set` 返回 `invalid`（engine.ts:613），`loops.remind-waiting` 用 `propose_to_human` 把四行没变的同一张待决重新给人看每次都会失败 | 改：§5.2 第 12 项的文字改成退路写法「每件一行题目与要人做什么」；M3 加了不带四行、只把已有待决再给人看的 `propose_to_human` 之后在同一次改动里换用它；V13 标为已答 | §5.2 第 12 项、§10.2 V13 |

F42（留到放行稿）：疑问一句在 §18 末段写好，等重写 `onepage.md` 的那一步放进去；本稿不动 `onepage.md` 与 `mockup-loops.svg`。

与相邻设计（0.6）：F44 照规则板 0.9 对 `docs/rules/` 的做法（`repo-written.json`、git 标记时先不写），两块板的 git 处理从此一致；F50 更正了给 M4 的接缝（`queue: 'check'`/`'direct'`），`graph-ops-v06.json` 的 `m4` 批注一并改；F53 请 M4 的填占位函数加 `./` 前缀。规则板 0.10 与本稿同一批写（run `boards-rules010-loops06`），接缝由后面的一步再核对；本稿不动 `.agents/tasks/rules/`。

## 20. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-30 | 第一稿 |
| 0.2 | 2026-10-30 | 回应第 1 轮评审（HIGH 4、MEDIUM 4、NIT 10，§19）：插件的条目与事件经 `glmHournessLoops.contribute`、`emit` 交，M7 的 10 项、M4 的 2 项、GLM 的 4 项与循环行自己的 4 项；动作加 `harness` 与 `self`，删掉 `checks`、`peak-mode` 与 `norm` 命令来源；GLM 照 M6 0.3 的 `loopDefaults` 读，落实 M6-L1 到 M6-L5，加机器一级的运行者；页面只看，`/loops-apply` 删去，人的命令 `/loops delete\|restore\|ack\|accept\|reject`；对话里加条目走 `propose_to_human` 与 `record_human_answer`；高峰不做只看 `heldForPeak`，少做档的高峰结束时叫醒闲着的主 Agent；`schedule.update` 的 `expected` 取 `schedule.list`，比较用 DSH 的指纹；去抖与限次分插件与人，超了的合进下一次；「自己触发自己」只算循环板自己的执行；删掉 git 轮询与 `main-advanced`。草图重画（旧的留作 `mockup-loops-0.1.svg`）；新增一页放行稿 `onepage.md` 与 `graph-ops-v02.json` |
| 0.3 | 2026-10-30 | 回应第 2 轮评审（MEDIUM 4、NIT 11，§19.2）：高峰结束叫醒照修订后的接缝裁定归编排层，理由与来源一行改写，高峰变化事件改名 `channel.peak-changed`、由 GLM 通道报；新函数 `holderState`，主 Agent 的会话归档、找不到或在别的进程里时不投、不建、不记已投，页面与首页告诉人 `/wish here`，运行锁交给主 Agent 所在的进程；跑命令的提议由 harness 附命令原文与注意事项，`record_human_answer` 核对给人看过、拍板带摘要，`/loops accept` 没有图时打两次；去重键按一次发生定、§4 每张表加「键」一栏、重复写 `loop-duplicate`；`emit` 内存重试三次；`main-step.json`；5 分钟从开始跑项目算起；结局口径；M7 条目补 `why`；少做的上限照规则板显示；页面不说「行」；规则板 0.7 的 `heldForPeak` 与 `stateForProject`，撤回 `peakStop`；`tools.register` 行号订正。0.2 原文、草图与放行稿留作 `design-0.2.md`、`mockup-loops-0.2.svg`、`onepage-0.2.md`；草图与放行稿跟着改；`graph-ops-v03-written.json` |
| 0.4 | 2026-10-30 | 回应第 3 轮评审（MEDIUM 2、NIT 4，§19.3），人准了第 4 稿：高峰结束的那一项照最新的接缝裁定，先恰好调一次 M7 的 `execute.resume-drive`（少做与不做两档，冷会话先恢复），撤回 `execute.resume-after-peak`，以 `hourness-idle-rounds` 阻塞的 goal 不碰；对账只在确知没有主 Agent、会话已归档或找不到时删任务，`elsewhere` 与 `unknown`（含持有者记录读不出）一条不删，删任务只经 `removeTask`、先记全文进 `removed-tasks.jsonl`；`writer-held` 的标记 5 分钟作废、超过 5 分钟页面写「交不过去」；提议的命令原文只算一次、存在变更记录里；`login-rejected` 的 `since` 没有时用第一次看到的那一拍；放行稿与草图的几句字。0.3 原文、草图与放行稿留作 `design-0.3.md`、`mockup-loops-0.3.svg`、`onepage-0.3.md`；`graph-ops-v04-written.json` |
| 0.5 | 2026-10-30 | 0.4 第 4 轮批准（NIT 4）之后，照人新定的 `d-boards-as-hooks`、`d-rules-in-repo`、`d-main-agent-peak-exempt`，之后的 `d-script-timeout`、`d-memory-scope`、`d-agent-examples`，与编排方的接缝裁定改写，并关掉 F40–F43（每处答的是哪一条，见 §19.4 的两张表）：条目是「`when` + `filter?` + 动作」，共用的形状与校验在 `src/loops/trigger.ts`；`run` 换成脚本，人看原文同意即生效，按内容哈希钉住、执行核对过的副本；两块板共用的脚本执行器 `src/loops/script.ts`（信封、最少环境、两队、拦路的一路超时之后后台跑到 10 分钟、`gateOnErrorDefault`）；`gate.` 名字空间留给规则板；人加的条目与脚本进 `docs/loops/`，运行时进 `.llm/loops/`，用户级只留 `loops/machine/`，`loops:files-only`，在外面改过的不跑、照图上的拍板认回；行激活时从 DSH 的工作区登记表列项目；不再读 `heldForPeak`，高峰结束那一项两档同一张表；周报的两张单子与批量删除；`loop_propose` 说明里的两个例子；M4 的检查器照同一形状；F40 冷会话恢复时 M7 先接上也记 `done`；F41 `entry-gone` 等两次对账；F42 交给重写放行稿的一步；F43 三处旧文字。0.4 原文、草图与放行稿留作 `design-0.4.md`、`mockup-loops-0.4.svg`、`onepage-0.4.md`；放行稿与草图由评审之后的一步重写；`graph-ops-v05.json`。同版另有接缝核对的修正（与规则板 0.9 对照，`.agents/tasks/rules/seam-check-v09-v05.md`）：照编排方的裁定「Check entries seam」加人的「跑检查」（`check`、`runCommand`、`commandDetail`，`env.files-edited` 进收件箱，`contribute` 不收会跑东西的动作）；`gate.` 事件可以有 `session` 字段；`matches` 的试跑；文件变化的判定 `watchPaths` 两块板共用；§12 的 `AttachDetail` 上限与 §3.1 对齐；拦路结果的含义改为引用 rules:§6.7；引用规则板的节号改按 0.9（§19.4 第二张表末几行） |
| 0.6 | 2026-10-30 | 回应第 5 轮评审（MEDIUM 3、NIT 10，§19.5），人回「可以」准的一稿：F44 仓库文件与 git 不打架（`repo-written.json` 记自己写成的版本，只在确实欠着写时补写，git 操作当中先不写）；F45 `env.files-edited` 的键带回合号 `<turn>-<step>`；F46 人加的检查按「条目 + 会话 + `root`」分组去抖、限次、跑与报；F47 七处旧文字；F48 热会话任何一档都调一次恢复；F49 拦路一路的位置、后台与排队数（`GATE_CONCURRENT`、`GATE_LATE_MAX`、`GATE_QUEUE_MAX`）；F50 `runCommand` 加 `queue`（`check`/`direct`），更正给 M4 的接缝；F51 新克隆上认回要内容对上；F52 `loop-read` 挪进项目、`machine/` 只留提醒状态；F53 `resolveProgram` 解析程序路径、跳过项目之内的目录；F54 没人听的 `env.files-edited` 不写、键按名字空间分开记；F55 `**` 匹配零个目录写明；F56 V13 已答（引擎拒绝不变的 `set`），`loops.remind-waiting` 用退路写法。F42 仍留给重写放行稿的那一步。0.5 原文留作 `design-0.5.md`；`onepage.md` 与 `mockup-loops.svg` 不动（由后面的一步重写）；`graph-ops-v06.json` |

