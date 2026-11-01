# M7 设计：执行、汇合与运维

版本：0.2（2026-10-29），第二稿：处理第 1 轮设计评审（`.agents/tasks/m7/design-review.md`）的 16 条发现，逐条对应见 §16。评审没有涉及的节不改。
依据：第一稿依据 main `22bebec`；本稿另核对 main `0639bf5`：M3 第 1、2 步已合入（`src/graph/stage.ts`、`src/graph/main-agent.ts`，`7aa8fe5`、`bf4d127`），`recommend-last` 已合入（`44e8601`，引擎只核对推荐项在最后）；选项卡已定为表格版（`d-option-card` 2026-10-29 12:35：每个选项 `label`、`gain`、`cost`，可选 `dimension`，题目带 `crux`「取决于」与 `verdict`「是 → X；否 → Y」，`weight`；不再有 `why`、`counter`），引擎字段由运行 `card-fields-table` 实现，未合入；split 第 0–8 步在 `.worktrees/split`（`54cec72`），评审已通过，未合入；图上新增已批准的任务 `ablation`（`question-30` B）与 `norm-decision-tiers` 的常设授权（为验证花的积分不再逐次问人）。已批准的设计：`.agents/tasks/m3/design.md` 0.4 与它的 §15 人定结果；`.agents/tasks/split/design.md` 0.3 与 `.agents/tasks/split/design-addendum-q17b.md` 0.5（question-17 B：两个插件 `dsh-glm-zcode`、`dsh-hourness`，编排层在 `packages/hourness/`，源码目录不搬家）。设计中的：`.agents/tasks/rules/design.md` 0.1（规则板，租约与资源规则以它为准，本稿只引用）、`.agents/tasks/plain-ui/design.md`（人话界面与新手引导，晨报用词与它一致）。阅读摘要 `.agents/tasks/reading-2026-10-29/digest.md`。
范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/`、`~/.dsh`，不用桌面版。
证据写法：运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准（`docs/DEVELOPMENT.md` §4）。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，包名省略 `dsh-` 前缀；§4 的契约表另写出文件路径与符号。〔实读〕读过源码；〔实测〕已有 L3 探针证据；〔推断〕由源码推出、没有运行；〔未核实〕列进 §15，并写明在哪一层核实。
干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

M7 在编排层包 `dsh-hourness` 里加两行，都默认禁用：`glm-hourness/execute`（源码 `src/execute/`：派发、写入门禁、计划审批、通信、交回、审查、汇合门禁、驱动循环与完成门禁）与 `glm-hourness/operate`（源码 `src/operate/`：运维会话、巡检、晨报与周报的调度）。报告的纯函数放 `src/report/`（split 由 `src/ui/` 改名而来）。另改几处已有代码：M3 的设计期只读规则推广为「主 Agent 的派发链里只有派发出去的任务能写」；`/graph-apply` 在人拍板之后可以恢复等人的 goal；标定运行器加隔离与回归集结构。

各项要点：

- 派发（m7-1）：主 Agent 调 `dispatch_task {id}`，harness 读任务节点的派发属性，先过简报门禁，再在 `.worktrees/hz-<任务>`（分支 `hz/<任务>`）里起一个后台子 agent（`subagents.startActivation`，spawn 后端，`delivery: 'caller'`，预留 `childId` 编码任务与第几次），模型档位换成 `agentOptions`，交回结构换成 `outputSchema`。主 Agent 当场拿到子 agent 的 id 继续做别的。
- 写入门禁（m7-1）：只有映射到任务的 worker 能写，只能写在自己的工作树里、任务的写入范围与已批计划的路径之内；主 Agent 自己的 `subagent` 子 agent、worker 再派出的 agent 都只读；worker 对图只能读和批注；主 Agent 改分支与引用的 git 命令被拒（合入只经汇合门禁）。
- 计划审批（m7-1，`d-plan-approval`）：写任务的 worker 先 `submit_plan`（步骤、各步验收、验证层级、路径、命令）。harness 在边界核对（每步有验收与验证层级、路径不出写入范围、覆盖任务的每条验收），过了才写进任务正文并通知主 Agent；主 Agent 用 `answer_worker` 批或打回。人不出场。
- 通信（m7-1）：worker 有问题用 `ask_main`（调用一直开着，主 Agent 用 `answer_worker` 回答，超时按 worker 先写下的假设继续）；主 Agent 改方向用 DSH 原生 `send_message`（worker 在下一步收到），停下用 `interrupt_agent` 或面板的「暂停」；worker 之间不能直接说话（DSH 只认直接父子）。每条消息都在双方的会话日志里，交回时图上记一行计数。
- 简报（m7-2，阅读摘要 K5）：harness 从图生成四栏简报（目标、上下文、约束、怎样算做成），记下任务、祖先链与来源决策的语义摘要（pins）。这些节点的验收、非目标、决策结果或状态之后变了，交回处理、审查与汇合门禁都判为过期，要重新派发；改标题不算。槽位空出且有可开工的任务时，主 Agent 的下一步收到一条补位提醒，不变不重复。经验板块（M5 `lessons`）的接缝：派发时按任务要碰的文件、工具、命令放至多 5 条相关经验进简报；worker 在交回结构里交回候选经验；所有 agent（worker 在内）都能用经验查询工具按关键词、文件、命令或报错主动查，这个工具在 GLM 路由上常驻。
- 驱动循环（m7-3，`d-driver`）：人用 `/drive` 从项目图的焦点目标创建或恢复 DSH goal（目标原文带验收条件与非目标）；每拍沿用 M2.3 的投影注入。`update_goal` 的 `complete` 在 `tools/pre-execute` 核对完成门禁（子树的任务都关了且有 harness 的合入证据、没有未决、目标的验收审查通过且没过期）。目标的验收审查不建图节点：harness 直接起一个只读的审查激活，每轮结论以批注记在目标上（§3.9.4）。图上的目标只在门禁放行的那次 `complete` 之后才写完成（§3.9.3 的放行凭据）。全都在等人时主 Agent 调 `await_human`，goal 以 `hourness-waiting-human` 阻塞，人在面板上把这些待决都拍完，goal 自动恢复；连续 3 拍图与派发都没有变化，goal 以 `hourness-idle-rounds` 阻塞，交人。
- 审查（m7-4）：worker 交回 `done` 后，harness 自动给它派一个审查任务（种类审查、写入范围为空、模型档位高一档、结构化结论）。挡路的发现只认三类（验收没满足、不可逆损失没有预防、失败没有发现、恢复或追溯的途径，`docs/DEVELOPMENT.md` §1.1）。前两轮自动修、自动再审，第二轮还不过时自动加第三轮（question-11 A）；必须改的条数一轮没有减少，或第三轮仍不过，就停下：停下先写进这一轮的批注（末尾 `· 停下`），再在图上出一张带选项卡字段（`d-option-card`）的给人的待决；这个任务不再派发，直到人拍板。待决写不进图时，批注照样挡住再派发（§3.7.3）。
- 汇合门禁（m7-5）：审查通过后 harness 自动起门禁。门禁作为一个外部后端的子 agent 运行（本包注册的 `hourness-gate` provider），驱动器因此会等它。门禁在专用工作树里把分支压成一个提交放到主干最新提交之上，核对写入范围、审查对应的是同一份改动、简报没过期，再跑项目规范 `norm-merge-gate` 里列的命令；全部退出码为 0 才 `git merge --ff-only` 进主干，并按规范推送（不强推）。证据（提交号、每条命令与退出码、日志路径）由 harness 写进任务节点。
- 晨报（m7-6）：按四答对账，由 harness 从图、审计流水与 git 算出，模型不写数字：目标（效果是：完成门禁走到哪）、规划（任务分解：计划外的增删、返工、过期简报）、理由（为什么：agent 自己定的事与理由）、架构（怎么做：验证债、被推翻的决策）；外加等你拍板的、花费、门禁与审查、例外、模型使用（主 Agent 用的不是它所在 provider 的强档时单列一行提醒）。
- 巡检（m7-7）：人在一个主 Agent 会话里 `/patrol on`，这个会话成为运维会话：本包用 DSH `schedule` 在它上面建每日晨报、每周周报与夜间巡检。巡检查仓库、图与工作树的卫生，夜里在专用工作树上对主干跑一遍门禁命令（主干是不是绿的）。
- 规范阶梯与周报（m7-8）：周报按固定阈值提议规范的升、降级，至多 3 张，推荐项放最后；周报含 question-27 B 的人的负担指标（每周被问几次、要读多少字、拍板等多久、因人的决定返工几次），对照测试一次通过率、审查发现与返工率。
- DORA（m7-9）：交付频率、变更前置时间、变更失败率、恢复时长，口径都取自汇合门禁的证据、图的历史与夜间主干检查。
- 标定（m7-10）：按人 2026-10-29 的话收窄角色：系统有没有用，由自举与真实项目试用（`dogfood`、`field-trial`）来检验；仓库里的标定集只做回归与消融的守门（某次 harness 或提示词改动有没有让结果变差），题目取自自举中真实遇到的失败，每次运行互相隔离（`risk-calib-read`），不当作系统有效的证明。防泄漏：运行目录移到仓库外、事后扫事件流与消融开关由已批准的任务 `ablation` 做；M7 在它之上加读圈禁、回归集与能力集的结构、越界运行判无效。花积分按常设授权，花费进晨报。
- 留痕（自举与试用）：卡住、返工、要人救场的事件由 harness 记成图上的复盘节点，正文带候选经验与候选标定题，`field-trial` 以后沿用这个格式。

最薄端到端骨架（§10，`dogfood` 从这里开始）：`/wish` → 访谈 → 放行（M3）→ `/drive` → 派一个 worker（计划审批、写入门禁）→ 自动审查 → 汇合门禁 → 完成门禁 → 目标完成。实施第 E1–E9 步。

实施顺序（§8）：split 合入之后先做 E0（登记 `src/execute/` 并放进第一个纯函数模块），然后四条可以并行的纯函数与基础件（E1a、E1b、E2、E3），再依次是派发与写入门禁（E4）、计划与通信（E5）、交回与审查（E6）、汇合门禁（E7）、驱动循环与完成门禁（E8）、骨架的 L3 与批次 L4（E9）。骨架之后的并行线：并行派发与补位（P1）、报告与指标（P2，之后是巡检 P3）、复盘留痕（P5）；标定的回归集与读圈禁（P4）排在 `ablation` 合入之后；经验板块接上真服务（P6）等 M5。本仓库专用的一步 H1（探针在工作树里自动用临时 profile）与 E 步并行，在 dogfood 开始之前做完。

要人定的事（§13）：D1 M7 各任务节点的验收条件（改验收属于必须问人的第 1 类）。第一稿的 D2（标定花积分的时机）已被常设授权回答，改为 §12 里由 agent 定的一条。

## 1. 需求与验收

### 1.1 必须遵守的定案

| 定案 | 原话或出处 | 本设计怎样遵守 |
| --- | --- | --- |
| `d-plan-approval` | 「先批计划，再开工要做也是让主Agent做吧，我们设计这套循环目标就是减轻人的负担，可以让LLM自行开发大项目」 | 计划由主 Agent 批（`answer_worker`），harness 在边界核对（`checkPlan`）；人只在 M3 的需求确认、设计放行与必须问人的几类出场（§3.3）。合入、审查、重试都不问人 |
| 主 Agent 用强一档模型 | `m3` 批注（用户：「需要强提醒人类用贵一些的模型当主Agent，便宜的去干活都行」） | 实现、测试、文档任务没写档位时 worker 用 `simple` 档，审查高一档；`/drive` 的结果行与晨报在主 Agent 的模型不是它所在 provider 的 `hard` 或 `standard` 档模型时单列提醒，provider 没有档位映射时 `/drive` 固定带一句通用提醒（§3.1.3、§3.9.1、§3.10）；界面上的提醒归 plain-ui（其 §2.5） |
| question-26 C | 「C 就删个写工具，把主Agent变成聊天模型就行了呗」 | 主 Agent 的工具面没有写文件工具（M3 实现），shell 写入由 M3 的 `main-agent-no-write` 兜底；M7 另拦主 Agent 改分支与引用的 git 命令（§3.2.4），合入只由 harness 做 |
| `d-failure-plans`、`docs/DEVELOPMENT.md` §1.1 | 「一个优秀的软件或者工程怕的不是失败，而是失败后的预案做的够不够」「优雅的失败重试，以及事后可追溯性」 | §6 按操作写检测、重试、恢复、留痕，不穷举边角；审查挡路只认三类（§3.7）；必须改的条数不降就停下交人；question-11 A 的第三轮 |
| question-28 C | 「你在没有副作用的情况下尽可能开更多的并行」 | 并行上限是配置（默认 3 路写任务），harness 在派发时核对写入范围两两不相交，相交的排队；桌面版与沙盒 profile 的独占经规则板的租约（§3.5.4、§3.8.6） |
| `d-rules-human-only` 与规则板 | 「先不允许自己加规则吧，只有人能动」 | 租约、预算、派发槽位都来自规则板（`.agents/tasks/rules/design.md` §6.5、§8）；M7 只调 `glmHournessRules.admit`，规则板不在时只用本行自己的槽位上限；M7 不写规则 |
| question-14 G3 | 「围栏到时候跟着编排层走吧，拦全部的」 | M7 的写入规则不看路由，编排层包启用即对所有模型生效 |
| question-17 B | 「分，彻底改成两个插件」 | M7 的代码全在 `dsh-hourness`；GLM 包只经公共库的工具名契约知道哪些 M7 工具在 GLM 路由上常驻（§2.3.2），不导入编排层 |
| `d-recommend-last` | 「以后每个选项依旧推荐一个但是推荐的放到最后一个选项」 | harness 生成的待决（审查停下、门禁一再失败、规范升降级）推荐项都放最后，并带 `d-option-card` 表格版的字段（加粗短语不超过 20 字、得到、代价、「取决于」一行、「是 → X；否 → Y」一行、`weight`，§3.7.4）；本稿 §13 同样 |
| question-27 B | 「B 但是这属于心理学的内容了，归我们管吗？」 | 周报只量系统里看得到的数（§3.12.3），不做问卷与生理测量 |
| 标定的角色（2026-10-29 用户） | 「我认为真正的标定应该是我们这套系统做出来之后，我去找人在真实的项目开发中进行测试，或者等待社区的反馈。」 | §3.14：标定集只做回归与消融守门，不作有效性的证明；有效性看 `dogfood` 与 `field-trial`；M7 记录自举中的失败供二者使用（§3.15） |
| 经验板块（2026-10-29 用户，`lessons`） | 「要不要设置一个经验板块……要不然每个子代理都得自己摸一次？」「还得允许子代理主动查经验板块的内容」 | 经验板块本身归 M5；M7 定三个接缝：派发时进简报、交回结构里带候选、所有 agent 可以按需查询的工具在 GLM 路由上常驻（§3.5.5、§3.6.1） |
| 通信（2026-10-29 用户问主 Agent 与子 agent 能否即时互发消息） | 编排方转述 | §3.4：问、改方向、中断三条路，worker 之间不直接通信，每条消息都可追溯；父到子的 `send_message` 已对照 rc.3 源码核对，运行时在 L3 核实 |
| K2、K4、K5、K6（阅读摘要 §6） | — | K2：证据由 harness 产生（门禁自己跑命令、自己核提交）；K4：编排状态只在图上或能从 DSH 会话日志推出，内存表只是缓存（§5）；K5：简报 pins 与过期判定（§3.5.3）；K6：审查的收敛规则（§3.7.3） |

### 1.2 各条目的行为与建议验收（D1）

条目编号沿用 `docs/ROADMAP.md` M7 的顺序，建议在 `m7` 下建任务节点 `m7-1` 到 `m7-10`（§14）。验收写进节点要人批准（决策分级第 1 类），在人定之前，实现与 L2/L3 检查按下表做。

| 节点 | 内容 | 建议验收 | 层 |
| --- | --- | --- | --- |
| m7-1 | 后台派发、写入门禁、计划审批、通信 | 1. 主 Agent 对一个已批准、带验收与派发属性的任务调 `dispatch_task`，harness 在 `.worktrees/hz-<id>`（分支 `hz/<id>`）起后台 worker 并当场返回 id，主 Agent 在 worker 第一次请求之前继续走步；worker 的模型是档位映射的模型。2. worker 写自己工作树以外、写入范围以外、已批计划路径以外的文件被拒，拒绝带正路并进违规流水；写任务在计划获批之前的写入被拒。3. 主 Agent 的 `subagent` 子 agent 与 worker 再派出的 agent 在放行之后写文件也被拒。4. 不合格的计划在 `submit_plan` 当场被退回、不打扰主 Agent；合格的计划写进任务正文、主 Agent 收到通知，`answer_worker` 批准后 worker 才能写；图上留一条带计划摘要的批准记录。5. `ask_main` 的问题到达主 Agent，`answer_worker` 的回答回到 worker 的同一次调用；主 Agent 的 `send_message` 在 worker 的下一步到达；worker 向兄弟 worker 发消息被拒 | L2、L3；L4 随批次 |
| m7-2 | 简报门禁、并发补位提醒、经验接缝 | 1. 缺验收、种类与写入范围不一致、依赖未完成、任务下有等人拍板的待决、目标未放行、写入范围与在跑的写任务相交、槽位已满时 `dispatch_task` 拒绝且不起 worker，拒绝写明怎样补。2. 简报四栏齐全并带 pins；派发之后改了任务或祖先的验收与非目标、或来源决策被再拍、推翻、取代，汇合门禁以 `brief_stale` 拒绝，派发状态提醒写明是哪个节点；只改标题不算。3. 有槽位空出且有可开工的任务时，主 Agent 的下一步带一条补位提醒，状态不变不重复。4. 有经验服务时简报的上下文栏至多 5 条相关经验；交回里的候选经验交给经验服务，没有服务时记成任务上的批注 | L2、L3 |
| m7-3 | 驱动循环与完成门禁 | 1. `/drive` 由人发出，从焦点所在的目标建立或恢复 goal，目标原文含标题、验收条件与非目标；模型调不出这一步。2. 完成门禁不过时 `update_goal complete` 被拒、goal 保持 active，拒绝列出差什么；目标的验收审查由 harness 自动起、不建图节点、不要人批准；通过后图上的目标转为完成，带 harness 的证据；不经门禁的 `complete`（例如 `/wish off` 之后）不写完成证据，只留批注与复盘。3. `await_human` 让 goal 以 `hourness-waiting-human` 阻塞；人在面板上拍完列出的待决后 goal 自动恢复。4. 连续 3 拍没有进展时 goal 以 `hourness-idle-rounds` 阻塞并留复盘节点。5. 宿主重启之后，丢失的派发在主 Agent 下一步的提醒里列出，不会重复派发 | L2、L3；L4 |
| m7-4 | 独立审查 | 1. worker 交回 `done` 后自动派出审查：写入范围为空、模型高一档、结构化结论、审查对象是交回的提交。2. 挡路的发现只认三类，其余转为不挡路。3. 第 1、2 轮不过自动再修再审，第 2 轮不过自动加第 3 轮；必须改的条数不降或第 3 轮不过时停下：轮次批注末尾带 `· 停下`，图上出一张推荐项在最后、带选项卡字段的人的待决；人拍板之前这个任务不能再派发，待决写不进图时同样不能 | L2、L3 |
| m7-5 | 汇合门禁 | 1. 只有在审查通过且对应同一份改动、简报没过期、改动不出写入范围、`norm-merge-gate` 的命令在压缩后的提交上全部退出 0 时，主干才前进恰好一个带 `Hourness-Task` 尾注的提交；任务节点转为完成，带 harness 写的提交与测试证据。2. 冲突、命令失败、主干在门禁期间前进时主干不变，结果写明原因；可重试的有次数上限；已合入但图没写上的情况被发现并补写。3. 主 Agent 的 `git merge`、`commit`、`reset` 一类命令被拒 | L2（临时 git 仓库）、L3；L4 |
| m7-6 | 四答晨报 | 晨报按目标、规划、理由、架构四节加等你拍板、花费、门禁与审查、例外、模型使用；每个数字有固定来源（§3.10）；同样的输入得到同样的文字 | L2 |
| m7-7 | 巡检 | 1. `/patrol on` 在调用它的主 Agent 会话里建三条定时提醒并建（或复用）`运维` 特性节点；`/patrol off` 删掉它们。2. 定时提醒到达时运维会话产出巡检结果，可做的整理成任务，必须问人的成待决。3. 夜间对主干跑一遍门禁命令，结果进 DORA。4. 漏跑的一次在下一次运行时报出 | L2、L3；冷会话投递随 L4（核实清单第 17 项） |
| m7-8 | 规范阶梯与周报 | 周报按 §3.12 的阈值提议规范升降级，至多 3 张，推荐项在最后；周报含人的负担四项与三项对照 | L2 |
| m7-9 | DORA 指标 | 四项按 §3.13 的口径从门禁证据、图的历史与夜间检查算出 | L2 |
| m7-10 | 标定集改作回归与消融守门 | 1. 标定运行里读本次 `ws/` 以外的文件被拒并记下；运行后扫事件流，有越界读取的运行判无效、不进汇总。2. `task.json` 带 `set`（回归或能力）与 `origin`，结果记下环境配置，分开报基础设施失败，汇总报 pass@1 与 pass^k。3. 现有两题归回归集；`docs/ORCHESTRATION.md` §10.5 写明标定集的角色是回归与消融守门。4. 复盘节点的候选标定题有一条收题流程（§3.14.5）。运行目录在仓库外与事后扫描是 `ablation` 的验收，本条目只用它们的结果 | L2、L3；标定运行按 §12 的时机 |
| m7（特性） | 合起来 | 最薄骨架（§10）在桌面版上对一个临时项目从 `/wish` 走到目标完成；之后本项目的开发改由它在 DSH 里做（`dogfood`） | L4 |

### 1.3 非功能需求

- 不打扰人：M7 的任何一步都不新增必须问人的类别；harness 生成的给人的待决只有三种（审查不收敛，含目标的验收审查；门禁一再失败；规范升降级），并限量（§3.7.3、§3.8.3、§3.12）。
- 主 Agent 的上下文小：交回只给摘要与证据位置，长报告写文件（阅读摘要第 11 条）；harness 的提醒只在变化时注入。
- 失败要出声（`docs/CHARTER.md` §7.1 条款 7）：两行的降级都进行健康表；激活期不抛错（`AGENTS.md`）。
- 处处留痕（条款 11）：每个改变状态的动作在它所属的地方有一条记录，§5 列出各自的事实源。

## 2. 总体设计

依据的学科与标准（`docs/DEVELOPMENT.md` §1.1「设计依据的学科」、`docs/ORCHESTRATION.md` §4.3 架构栏）：

- 门禁、重试与恢复依据可靠性工程，以及持续集成的主干开发做法：主干只快进，每件事压缩成一个提交，主干保持绿（夜间主干检查兜底），失败先求可发现、可重试、可追溯（`d-failure-plans`）。
- 写入门禁、只读的派发链、worker 对图只读、主 Agent 不改分支依据安全工程的最小权限：每个角色只拿到完成本任务所需的写权限，权限在执行边界判定，不靠提示词。
- DORA 与人的负担指标依据测量与统计：四项 DORA 用标准口径（交付频率、变更前置时间、变更失败率、恢复时长），人的负担只量系统里看得到的数；样本小，只看曲线，不设阈值考核（`docs/CHARTER.md` §8）。
- 晨报与 harness 提给人的待决依据认知负荷的考虑，用词与版式服从 plain-ui 与 `d-option-card`：数字先行、明细限量、推荐项最后。

### 2.1 构件与位置

全部在编排层包 `dsh-hourness`（`packages/hourness/`）。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `execute`（E0）与 `operate`（P3），`rows` 加两行；`packages/hourness/cordis.patch.yml` 里两行排在 `design`（M3）与 `rules`（规则板，若已合入）之后、`ui` 之前，`disabled: true`。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 执行行入口：四个主 Agent 工具（`dispatch_task`、`answer_worker`、`merge_task`、`await_human`）、两个 worker 工具（`submit_plan`、`ask_main`）、`/drive`、门禁 provider 的注册、工具面过滤、服务 `glmHournessExecute`、行健康 `execute` | `src/execute/index.ts` | 新建，行 `glm-hourness/execute` |
| 派发：简报门禁的读取部分、工作树、`startActivation`、档位映射、写登记表 | `src/execute/dispatch.ts` | 新建 |
| 任务映射：`childId` 的编码与解码（只用于读批注与列表，不作写权限的依据）、本进程派发登记表 | `src/execute/attempts.ts` | 新建 |
| harness 提给人的待决：选项卡字段与回写标签（纯函数，§3.7.4） | `src/execute/questions.ts` | 新建 |
| 门禁锁：按仓库的锁文件，门禁与巡检的主干检查共用（§3.8.3） | `src/execute/gate-lock.ts` | 新建 |
| 简报的渲染与门禁判定（纯函数） | `src/execute/brief.ts` | 新建 |
| 计划：`checkPlan`、正文里的计划一节的渲染与摘要（纯函数） | `src/execute/plan.ts` | 新建 |
| 写入范围：路径规整、包含、相交、改动清单是否在范围内（纯函数） | `src/execute/scope.ts` | 新建 |
| 等主 Agent 回应的 worker 请求（计划、问题）：登记、超时、回应 | `src/execute/requests.ts` | 新建 |
| 交回结构与审查结论的 schema、语义校验 | `src/execute/schemas.ts` | 新建 |
| 交回处理：pins 核对、图上的记录、自动审查、候选经验 | `src/execute/handback.ts` | 新建 |
| 审查结论的规整与收敛判定（纯函数） | `src/execute/review.ts` | 新建 |
| git 操作（可注入的执行器，`child_process.execFile`，不经 shell） | `src/execute/git.ts` | 新建 |
| `norm-merge-gate` 的解析（纯函数） | `src/execute/gate-norm.ts` | 新建 |
| 汇合门禁的执行与外部 provider `hourness-gate` | `src/execute/gate.ts`、`src/execute/gate-provider.ts` | 新建 |
| 驱动循环：`/drive`、完成门禁、`await_human`、空转判定、重启后的对账 | `src/execute/drive.ts` | 新建 |
| 派发状态提醒（补位、过期、等回应、丢失的派发） | `src/execute/notice.ts` | 新建，用公共库 `installStepNotice` 与 M3 的 `src/graph/digest-notice.ts` |
| 复盘节点的生成 | `src/execute/retro.ts` | 新建（P5） |
| 语义摘要 pins（纯函数，宿主与客户端都能导入） | `src/graph/pins.ts` | 新建 |
| 推出的执行阶段 `derivedStage`、完成门禁 `goalCompletion`（纯函数，只导入 `src/graph/stage.ts` 的 `effectiveStage`；不改 M3 的文件） | `src/graph/execute-stage.ts` | 新建 |
| worker 写入范围、只读派发链、worker 只读图、主 Agent 的 git 写命令、主 Agent 只给活着的派发发消息 | `src/guard/execute-rules.ts`；M3 的 `src/guard/main-agent.ts` 的 `design-before-release` 放行一行改为询问执行服务 | 新建、改 |
| shell 命令位置上的命令与参数（给 git 规则用） | `src/guard/shell.ts` 导出 `commandsAt(text, dialect)` | 改（行为不变） |
| 等人的 goal 在人拍板后恢复；harness 待决的回写标签（人选「回到设计」「放弃这个任务」时以人的身份写图，§3.7.4） | `src/graph/panel-row.ts`（M3 加的回写通知之后） | 改 |
| 设计阶段提醒：图上没有 `norm-merge-gate` 时提醒主 Agent 在设计阶段提议它（§3.8.1）；推出的三个阶段的正文 | `src/design/stage-notice.ts`（M3） | 改 |
| 运维行入口：`/patrol`、`hourness_report`、定时提醒、夜间主干检查、工作树清理 | `src/operate/index.ts`、`src/operate/patrol.ts` | 新建，行 `glm-hourness/operate` |
| 四答晨报、周报、人的负担指标、DORA、规范阶梯（纯函数） | `src/report/four-answers.ts`、`src/report/weekly.ts`、`src/report/metrics.ts`、`src/report/ladder.ts` | 新建（P2） |
| 晨报的读入 | `src/workflow/morning-report.ts`（M3 已改为读图的决策卡一节） | 改：改为调四答 |
| 派遣记录的工具名 | `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 加 `dispatch_task` | 改 |
| 工具名契约 | `src/shared/tool-names.ts`（split §2.6）加 `EXECUTE_TOOL_NAMES`、`WORKER_TOOL_NAMES`，常驻名单加它们与 `structured_output`；`LESSONS_TOOL_NAMES` 由 M5 加，常驻 | 改 |
| 薄适配层：`SubagentsService`、`SubagentProvider`、`GoalsService`、`ScheduleService`、`SessionQueryService` 的所用成员 | `src/shared/dsh-min.ts` | 改 |
| 行健康表 | `src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `execute`、`operate` | 改 |
| 标定：读圈禁覆盖层、`task.json` 的 `set`、`origin`、`isolation`、`result.json` 的 `env`、`infra`、`valid`、pass^k（运行目录移出仓库、事后扫描、消融开关归 `ablation`） | `scripts/calibrate/read-fence.mjs`、`scripts/calibrate/run-calibrate.mjs`、`tests/calibration/*/task.json`、`tests/calibration/lib.mjs` | 新建、改（P4，排在 `ablation` 之后） |
| 探针在工作树里自动用临时 profile（本仓库专用） | `scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs` | 改（H1） |

不加的东西：图节点的新字段（计划写在任务正文、门禁命令写在规范节点的验收条件里，§3.3.3、§3.8.1）；图引擎的权限改动；新依赖。配置项只有两个：执行行的 `tiers`（档位到模型）与 `slots`（并行写任务上限）；运维行的 `times`（三条定时提醒的时刻）。

### 2.2 一次任务的路径

1. 目标放行（M3：阶段 `release`）。主 Agent 在已批准的特性与任务下把规划细化成可派发的叶子（引擎允许，计划内直接为已批准），给任务写派发属性（`kind`、`writeScope`、`tier`）。
2. 人发 `/drive`。goal 建立，驱动器投递第 1 拍。
3. 主 Agent `dispatch_task {id: task-3}`。简报门禁通过；harness 建工作树、跑规范里的准备命令、生成简报、起 worker（`childId` `hz-task-3-a1-<6 位随机>`），在任务上批注一条派发记录（带 pins），任务转为进行中。
4. worker 读代码，`submit_plan`。`checkPlan` 通过；计划写进任务正文；主 Agent 收到通知，`answer_worker {request, verdict: 'approve'}`；worker 的那次调用返回「已批准」，开始写。
5. worker 提交到 `hz/task-3`，跑一遍门禁命令，`structured_output` 交回（`status: done`、提交号、文件、候选经验）。
6. harness 处理交回：核 pins，批注交回摘要，自动派审查（`task-3` 下的审查任务，高一档模型，只读同一工作树）。
7. 审查交回 `APPROVED`。harness 记证据，起汇合门禁（外部 provider）。
8. 门禁压缩、核对、跑命令、快进主干、推送，给 `task-3` 写证据并标完成；清掉工作树。
9. 主 Agent 收到一行结果；驱动器的下一拍里它派下一个任务，或在完成门禁通过时 `update_goal complete`。

### 2.3 角色与工具面

#### 2.3.1 谁是谁

| 角色 | 判定 | 能写什么 |
| --- | --- | --- |
| 主 Agent | 同 M3 的 `isMainAgent` 的判据：会话头没有 `origin: 'subagent'`，且投影 `hournessMainAgent` 为开启（执行行用 `mainAgentActive` 读，§3.1.2） | 只经图工具写图；不写文件（M3）；不改分支与引用（§3.2.4） |
| worker | 本进程的派发登记表里有它：`exec.agent.id` 是执行行在本进程里经 `startActivation` 起的某次派发的 `childId`（§3.1.4）。名字像 `hz-` 不算，冷恢复出来的同名激活也不算 | 自己工作树里、写入范围与已批计划之内的文件；自己分支上的提交；对图只能批注 |
| 审查者 | 登记表里映射到种类为 `review` 的任务的 worker，或目标的验收审查激活（§3.9.4） | 什么都不能写（写入范围为空）；对图只能批注 |
| 只读子 agent | 派发链的根是主 Agent、但自己不在登记表里（主 Agent 用原生 `subagent` 派出的、worker 再派出的、冷恢复出来的） | 放行之后也不能写文件（§3.2.2） |
| 运维会话的 agent | 开过 `/patrol on` 的主 Agent | 同主 Agent |

#### 2.3.2 工具与常驻

| 工具 | 注册方 | 谁的工具面里有 | GLM 路由上 | 理由 |
| --- | --- | --- | --- | --- |
| `dispatch_task`、`answer_worker`、`merge_task`、`await_human` | 执行行 | 只有主 Agent | 常驻 | 主 Agent 每拍都可能用 |
| `hourness_report` | 运维行 | 只有主 Agent | 常驻 | 运维会话每次定时提醒都用 |
| `submit_plan`、`ask_main` | 执行行 | 只有 worker（审查者没有 `submit_plan`） | 常驻 | worker 的关键路径，延迟要多一次检索 |
| `structured_output` | DSH（子 agent 作用域，subagent:889–960） | 带 `outputSchema` 的子 agent | 常驻 | 交回是 worker 的终点；L3 实测经 DeferredToolCall 也能交回，但多一步 |
| 经验查询（名字由 M5 定，契约里占位 `LESSONS_TOOL_NAMES`） | M5 的经验行 | 所有 agent | 常驻 | 人要求子 agent 能主动查；查询的时机是卡住的时候，延迟会让它更少被想起；代价是每个 GLM 请求多一个工具的 schema，落在可命中缓存的前缀里，由 `prompt-audit` 的消融核对 |
| `send_message`、`interrupt_agent` | DSH（tool-subagent-control:23–86） | 原样 | 照旧延迟 | 主 Agent 改方向、中断 worker 的频率低；worker 不需要它们（问题走 `ask_main`） |
| `subagent`、`subagent_fork` | DSH | 原样 | 照旧 | 主 Agent 可以派只读的探索，写入被拒（§3.2.2） |

工具面过滤：执行行在 `agent/created` 时给每个 agent 装一个 agent 作用域、`prepend` 的 `system-prompt/assemble` 监听器（同 M3 §3.1.3 的做法），`next()` 之后按角色从 `assembled.tools` 去掉不属于它的 M7 工具。工具仍在全局注册，按名直接调用照样执行，所以每个工具体先查调用方角色（`docs/DESIGN.md` §2.4a：执行按名解析，与工具面无关）。M3 的 `/wish` 处理函数会为激活前已开着的会话补装监听器；执行行同样在 `dispatch_task` 第一次被主 Agent 调用时与 `/drive` 里补装。

常驻名单：GLM 包的工具检索只读公共库 `src/shared/tool-names.ts` 的 `ORCHESTRATION_RESIDENT_TOOLS`（split §2.6）。M7 把上表「常驻」的名字加进去。常驻只表示「在工具面里时不延迟」，谁的工具面里有由上面的过滤决定。

### 2.4 执行阶段：推出，不存

M3 让阶段存在目标的 `stage` 字段，`release` 之后的阶段留给 M7。已批准的目标 LLM 与 harness 都改不了（M3 §2.4，D5 只放开仍为提议的目标），所以 M7 不写阶段，按图推出：

`derivedStage(graph, goal)`（`src/graph/execute-stage.ts`，纯函数，导入 `src/graph/stage.ts` 的 `effectiveStage`，main `7aa8fe5` 起已在）：M3 的 `effectiveStage(goal)` 为 `release` 或其后的值（含人手写的 `decompose`、`execute`、`merge`、`operate`）时：

| 条件（按顺序取第一条成立的） | 推出的阶段 |
| --- | --- |
| 目标为 `done` | `operate` |
| 子树里有进行中或可以开工的任务（可以开工的定义同 `openItems`） | `execute` |
| 子树里的任务都关了或都在等审查与门禁 | `merge` |
| 子树里没有任务，或任务都缺派发属性 | `decompose` |

`effectiveStage` 为 `null`（已批准、没有阶段）的目标不走设计循环，推出的阶段同样按上表算（它可以直接执行）。流程条与阶段提醒用推出的阶段；M3 的设计期只读对 `release` 及以后放行这一行，由 §3.2.2 的规则取代。

## 3. 各条目的设计

### 3.1 派发 `dispatch_task`（m7-1）

#### 3.1.1 参数与输出

参数（rc.3 校验的 schema 子集，`docs/ORCHESTRATION.md` §2.10）：`{id: string, context?: string, quick?: boolean}`。`context` 是主 Agent 给 worker 的补充（至多 4000 字符），`quick` 申请简化简报（§3.5.2）。输出：`{task, attempt, childId, worktree, branch, model, brief, plan}`，`brief` 是简报摘要（12 位十六进制），`plan` 为 `required`、`approved`（沿用上一次已批的计划）或 `skipped`。

#### 3.1.2 步骤

1. 调用方必须是主 Agent：会话头不带 `origin: 'subagent'`，且 `mainAgentActive(sessionProjections.snapshot(session, [MAIN_AGENT_KEY]).values)` 为真（M3 的纯函数，`src/graph/main-agent.ts`；M3 的待生效状态只覆盖 `/wish` 之后的几个微任务，派发不会落在那里）。投影没有注册（设计行禁用）时拒绝，`hint` 写「先启用 glm-hourness/design 并 /wish」。
2. 读图（图行服务 `dirFor(cwd)` 加 `openEngine(dir).load()`），过简报门禁（§3.5.1）。不过就拒绝，结构化错误 `{code, message, hint}`，不起 worker。
3. 槽位：本行的 `slots`（默认 3，只数写任务；审查与门禁不占）与规则板的 `glmHournessRules.admit({kind: 'dispatch', agent})`（有这个服务时，规则板设计 §6.5）。被占满或被规则板排队时拒绝（`slots_full`、`deferred`，后者带规则板的等待单 id）。DSH 自己的上限 `maxActiveSubagents`（默认 8，subagent:2980）满了时 `startActivation` 抛 `ACTIVATION_LIMIT_REACHED`（subagent:1046–1048），同样作为 `slots_full` 返回。
4. 工作树（只对写任务；审查用被审任务的工作树，只读）：`git.ensureWorktree(repoRoot, task)`：
   - 仓库根取主 Agent 会话头 `cwd` 往上的 `git rev-parse --show-toplevel`；不是 git 仓库时拒绝写任务（`not_git`），只读任务照常。
   - 基线分支取主检出当前分支（`git symbolic-ref --short HEAD`）；分离头指针时拒绝（`no_base_branch`）。
   - 路径 `<仓库根>/.worktrees/hz-<任务 id>`，分支 `hz/<任务 id>`。已存在就复用（同一任务的后续几次派发在同一分支上接着做）；不存在时 `git worktree add -b hz/<id> <路径> <基线分支>`。`.worktrees/` 没被忽略时把 `/.worktrees/` 追加到 `.git/info/exclude`（本地文件，不入库，可撤）。
   - 任务已经合入过（重开之后再派发，返工）：门禁是压缩合入，`hz/<id>` 的提交不是基线的祖先，复用旧分支会把已合入的改动再合一次。所以先查基线上这个任务最近一次合入提交（尾注 `Hourness-Task: <id>`，§3.8.3）记下的 `Hourness-Branch-Tip`：旧工作树干净就删掉（`git worktree remove`，不带 `--force`；不干净时拒绝 `worktree_dirty` 并列出文件），把旧分支改名为 `hz/<id>@<n>`（`n` 是这个任务已有的合入次数；`git branch -m`），再从当前基线新建 `hz/<id>`。旧分支头不等于记下的值（合入之后旧分支上又有了提交）时照样改名，并在派发批注里写明「旧分支在合入之后还有 <k> 个提交，留在 hz/<id>@<n>」：不丢提交，事后查得到。
   - 新建的工作树跑 `norm-merge-gate` 里的准备命令（§3.8.1，例 `pnpm install --store-dir .pnpm-store`），每条 10 分钟上限，日志写 `<项目目录>/execute/<任务>/setup-<时间>.log`，准备之后把监视文件（准备命令的 `when` 路径，默认 `package.json` 与 `package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`yarn.lock`）的摘要写进 `<项目目录>/execute/<任务>/setup.json`。复用的工作树先算一遍这些文件的摘要，与记下的不同（上一次的 worker 改了依赖）就重跑准备命令。失败时：新建的工作树与分支删掉；复用的工作树保留（里面可能有提交）。两种都拒绝（`worktree_setup_failed`，带日志路径与最后 20 行）。
   - 工作树在主 Agent 会话工作区之内，这是 L3 实测得出的约束：子 agent 的会话头 `cwd` 是父目录，guard 与 DSH 的文件沙盒都以它为根（`docs/ORCHESTRATION.md` §3.2）。
5. 次数：`attempt` = 图上这个任务已有的派发批注数加一（§3.1.4）。`childId` = `hz-<任务 id>-a<次数>-<6 位 base36 随机>`。字符都在 `[A-Za-z0-9._-]` 之内，会话文件名原样保留（session-persistence-jsonl:866）。随机后缀是因为预留 id 已有会话时 DSH 拒绝（`DUPLICATE_CHILD`，subagent:1430–1437）。
6. 生成简报（§3.5.2）与 pins（§3.5.3）。
7. 档位映射（§3.1.3）得到 `agentOptions`。
8. `startActivation({provider: 'spawn', label: 'hourness task <id> attempt <n>', childId, request: {prompt: [{type: 'text', text: 简报}], parent: 主 Agent, cwd: 工作树绝对路径, agentOptions, outputSchema, maxDepth: subagents.resolveMaxDepth()}, signal: exec.signal, delivery: 'caller'})`（subagent:3036–3048；`cwd` 为绝对路径时原样使用，subagent:1523–1527；`resolveMaxDepth` subagent:3023）。返回时 worker 已被接受，结果在 `result` 里。
9. 写登记表（§3.1.4），在 `result` 上挂交回处理（§3.6.2）。
10. 以 `harness` 身份在任务上批注派发记录（次数、`childId`、基线分支与提交、档位与模型、简报摘要，最后一行是 pins，§3.5.3），已批准的任务转为进行中（`status`，`reason` 写 `childId`；已是进行中则不改）。写图失败不撤销派发：worker 已经在跑，批注重试 3 次（每次重读修订号，间隔 200、800、2000 毫秒），仍失败时告警一次、行健康记降级，派发的事实仍在主 Agent 会话日志里（工具调用与结果）与 worker 自己的会话里，重启后的对账从会话推出（§3.9.6）。

为什么用 `delivery: 'caller'`：`parent` 模式下 DSH 会给子 agent 的首条消息附一段「结束前用 `send_message` 把结果发给父 agent」的指引（subagent:472–476、1460），并在结束时把结算通知（含整段结构化结果）送进主 Agent（subagent:508–540、2049–2063）。worker 照指引发一次消息、再交一次结构化结果，主 Agent 的上下文里会有两份同样的内容。`caller` 模式不附指引、不送结算通知（subagent:1460、2049），结果只到 harness，由 harness 送一行摘要给主 Agent（§3.6.2）。驱动器照样等它：`waitForChildren` 按派发链等待所有常驻的后代，与投递方式无关（subagent:1296–1330，ancestry 在 1844 建立）。`caller` 模式没在 L3 跑过〔未核实，§15 U1〕；不成立时退回 `parent`，并在简报里写明不要用 `send_message` 交结果，主 Agent 收到的结算通知由交回处理之后的一行摘要补充。

#### 3.1.3 模型档位

行配置 `tiers`：provider id 到三档的映射，每档 `{model, reasoningEffort?}`。默认只给原生通道：

```yaml
tiers:
  glm-zcode:
    hard: { model: glm-5.3, reasoningEffort: high }
    standard: { model: glm-5.3 }
    simple: { model: glm-5.3-flash }
```

实现、测试、文档任务没写 `tier` 时用 `simple`（用户：「便宜的去干活都行」）；主 Agent 判断某个任务难，就给它写 `tier: standard` 或 `hard`（`docs/ORCHESTRATION.md` §3.5 的难度对应照旧）。审查的档位按被审任务的档位推（§3.7.1），目标的验收审查固定 `hard`。主 Agent 的 provider 在表里时取对应档；不在表里（例如 DeepSeek 会话）时 `agentOptions` 不带模型，worker 继承主 Agent 的路由（subagent:315 把 `agentOptions` 合并在父路由之上），结果里 `model` 写继承的模型，会话健康注明「这个 provider 没有档位映射」。档位只选模型，不切换 provider 与套餐（`docs/CHARTER.md` §6）。

主 Agent 的模型提醒（`modelReminder(mainModel, provider, tiers)`，纯函数，给人看，`/drive` 的结果行与晨报的「模型使用」共用；换模型的是人，所以不注入给模型）：provider 在 `tiers` 里、主 Agent 的模型不是这个 provider 的 `hard` 或 `standard` 档模型时，提醒「主 Agent 现在用的是 <模型>。建议换成 <standard 档的模型>：主 Agent 用强一点的模型，子 agent 用便宜的就行」；provider 不在 `tiers` 里时，固定一句通用提醒「主 Agent 建议用这个 provider 里最强的模型，子 agent 用便宜的就行」。只提醒，不替人换。

#### 3.1.4 任务映射

- 事实源：DSH 的会话日志与图。`childId` 本身编码任务与次数；主 Agent 会话的工具调用记下每次派发；worker 会话的首条消息是简报；任务上的派发批注记下 `childId` 与 pins。
- 登记表：模块级的 `Map<childId, Attempt>`（角色 `worker`、`review`、`acceptance-review` 或 `gate`，任务或目标，次数、工作树、计划状态、pins、请求表），只在执行行本进程里 `startActivation` 成功之后写入，激活结算后保留到交回处理完成再删。`tools/pre-execute` 用它判断调用方是不是 worker：写权限只给登记表里、且 `agents.get(id)` 仍是活 agent 的 id。名字以 `hz-` 开头不算数：主 Agent 用 `send_message` 冷恢复一个已结束的 worker 时，DSH 会以同一个 id 恢复出一个没有 `outputSchema`、投递方式为默认 `parent` 的激活（subagent:2095 `deliverFollowup` 转 `coldResume`，2141–2189），交回处理接不到它，所以它不能写；§3.2.5 在源头拒绝这种发送。
- 登记表丢失：宿主重启时活着的 worker 随进程一起结束（DSH 的激活只在进程内，subagent:1214 注释「Process-local, never durable」），重启之后没有需要映射的活 worker。行在同一进程里禁用再启用时，登记表在模块作用域里，跟着模块留下〔未核实：DSH 重新应用插件时是否重新导入模块，§15 U13〕；模块被重新导入时登记表为空，还活着的 worker 一律按「不在登记表里」处理：只读（§3.2.2），派发状态提醒把它们列为「失联：先 interrupt_agent，再重新派发」，健康表注明原因。计划状态在需要时取任务上最新的计划批准批注（§3.3.4）。不按 `childId` 前缀解码来恢复写权限。

### 3.2 写入门禁（m7-1）

五条规则，都在 `src/guard/execute-rules.ts`，由执行行在 `tools/pre-execute` 上以 `prepend` 注册（tools:3320–3353），用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`），拒绝写进违规流水（与 guard 同形的 `ViolationRecord`）。判写与 M3 的 `main-agent-no-write` 相同（文件工具的目标，以及 file-tools-only 判为写文件的 shell 命令，M3 §3.1.4）；带 `parent` 的传输层子调用放行。不分路由（G3）。

#### 3.2.1 `worker-scope`：worker 只写自己的范围

调用方在登记表里时：

1. 目标路径按调用方的工作目录解析（`workingDirectory.get(session)`，同 guard），`path.resolve` 规整。
2. 必须在本次派发的工作树根之内，且不在工作树根下的 `.git` 里；否则拒绝，越界一句 `You are the worker for task <id>; you write only inside your worktree <path>.`
3. 相对工作树根的路径必须在任务当前的 `writeScope` 之内（`scope.within`，按段比较：`src/` 包含 `src/a.ts`，不包含 `src2/a.ts`；文件项只包含它自己），并且：需要计划的任务，计划获批之前一律拒绝（`Submit your plan with submit_plan and wait for approval before writing.`）；获批之后还要在已批计划各步 `paths` 的并集之内。
4. 审查者（`kind: review`）一律拒绝。

写入范围取当前的图，不取派发时的快照：主 Agent 中途把范围改大，worker 重新提交计划（§3.3.3）即可写新路径；改小立即生效。范围读图按图修订号缓存。

纠偏的正路：`If the task needs this file, ask the main agent with ask_main; it can widen the write scope, then resubmit your plan.`；例外：`If the file belongs to another task, report it in your handback under questions.`

#### 3.2.2 `dispatch-chain-readonly`：派发链里不在登记表的 agent 只读

取代 M3 `design-before-release` 的「有效阶段为 `release` 或之后：放行」一行。M3 的规则按派发链找根（`dispatchRoot`，M3 §3.3.3）；根是主 Agent、写调用方不在登记表里时：执行服务在（执行行启用）→ 拒绝，越界一句 `In a main-agent session only dispatched task workers write; you were started with the plain subagent tool.`，正路「Read, search and report back; the main agent dispatches writing work with dispatch_task.」；执行服务不在 → 保持 M3 的行为（`release` 之后放行）。设计期（放行之前）照旧按 M3 拒绝。这条规则改的是 M3 的文件 `src/guard/main-agent.ts`，判定经服务 `glmHournessExecute.isWorker(agentId)` 取得，guard 目录不导入执行目录。

理由：原生 `subagent` 派出的子 agent 写在主检出上，绕过工作树、写入范围与汇合门禁；worker 再派出的 agent 同理。只读的探索仍然有用，所以只拦写。

#### 3.2.3 `worker-graph-readonly`：worker 对图只读

登记表里的 agent 调图的写工具（`graph_propose`、`graph_status`、`graph_edit`、`graph_link`、`graph_unlink`、`graph_verify`、`graph_decide`、`graph_approve`、`graph_reject`）被拒；`graph_show`、`graph_open`、`graph_focus`、`graph_comment` 放行。正路：`Report it in your handback (questions, assumptions, lessons); the main agent updates the graph.`。理由：规划状态只有主 Agent 与 harness 两个写入方，worker 写图会与主 Agent 争修订号，也会绕过「计划外的变更走待决」。这回答了 `docs/ORCHESTRATION.md` §2.10 留给 M7 的「子 agent 该不该写图」。

#### 3.2.4 `main-agent-no-git-write`：主 Agent 不改分支与引用

M3 的判写不把 git 子命令算作写（M3 §10 记的缺口）。主 Agent 用 `git merge` 就能绕过汇合门禁，所以 M7 对主 Agent 加一条：shell 命令（`Bash`、`bash`、`pwsh` 的 `command`，`terminal_send` 的 `text`）里命令位置上的 `git`（经 `src/guard/shell.ts` 新导出的 `commandsAt`，引号感知，与 file-tools-only 同一个读法），子命令属于 `commit`、`merge`、`rebase`、`reset`、`checkout`、`switch`、`restore`、`apply`、`am`、`cherry-pick`、`revert`、`push`、`pull`、`stash`、`tag`、`worktree`、`update-ref`、`branch`（带 `-d`、`-D`、`-f`、`-m`、`-M` 时）时拒绝。只读子命令（`status`、`log`、`diff`、`show`、`rev-parse`、`branch` 不带上述参数）放行。正路：`Merges go through merge_task; the harness squashes, checks and fast-forwards. To change a branch, dispatch a task.`。

worker 的 git：在自己工作树里 `commit`、`rebase <基线>` 放行（交付就靠它）；`push`、`worktree`、`update-ref`，以及带 `-C`、`--git-dir`、`--work-tree` 指向工作树以外的命令被拒（同一条规则的 worker 分支）。这是启发式，漏网的（例如脚本里调 git）由汇合门禁与巡检的「主干上没有尾注的提交」发现（§3.8.4、§3.11.2）。

#### 3.2.5 `worker-message-live-only`：主 Agent 只给活着的派发发消息

主 Agent 调 DSH 原生 `send_message`（参数 `{agent_id, message}`，tool-subagent-control:23–36）或 `interrupt_agent` 时，`agent_id` 以 `hz-` 开头、却不是执行行在本进程里起的、仍活着的激活（登记表里的 worker 与审查，加上门禁与验收审查的激活，§3.1.4）就拒绝。对活着的门禁，`send_message` 也拒绝（外部激活收不了续发），`interrupt_agent` 放行。理由：对已结束的 worker，`send_message` 走冷恢复（subagent:2095、2141–2189），恢复出来的激活没有 `outputSchema`、投递方式是默认的 `parent`，交回处理接不到它，它的工作也不会进审查与门禁。正路：`That worker has ended; dispatch the task again with dispatch_task (the new attempt carries the earlier findings).`。`interrupt_agent` 对已结束的 id 本来无事可做，同一句纠偏。不是 `hz-` 开头的 id 不管（主 Agent 自己用 `subagent` 派的只读探索照常可以续聊）。

### 3.3 计划审批（m7-1，`d-plan-approval`）

#### 3.3.1 什么任务要计划

写入范围非空的任务都要，除非派发时 `quick: true` 且满足：写入范围至多 2 项、都是文件（不以 `/` 结尾）、档位不是 `hard`。不满足时 `quick` 被拒（`invalid`，`hint` 写条件）。审查任务没有计划。理由：`docs/ORCHESTRATION.md` §3.3「小改动用简化简报：规则照样硬，靠降低派发成本来解决」。

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
| 主 Agent 改 worker 的方向 | 原生 `send_message {agent_id: <childId>, message}`；worker 在下一步收到（正在 `ask_main`、`submit_plan` 里等的话，在那次调用返回后的下一步） | 已是 DSH 的通道，消息与来源都落在双方会话日志里。改方向如果涉及验收、非目标或写入范围，正路是先改图：前两者由人定（转述），写入范围主 Agent 自己能改；改了验收与非目标会让简报过期（§3.5.3），汇合门禁会拦，所以重大改向用「中断 + 重新派发」 |
| 停下 worker | 原生 `interrupt_agent`，或人在面板上点「暂停」（M2.9 的 `/graph-run stop`，按 worker 的焦点找到它；简报要求 worker 先 `graph_focus` 自己的任务，§3.5.2） | 被中断的 worker 以 `aborted` 结算（subagent:487–498），交回处理记一条「第 n 次被中断」，任务保持进行中。之后要继续就重新派发，不用 `send_message` 唤醒：结构化交回是按激活算的，冷恢复的回合没有 `outputSchema`（subagent:555–560 注释、2141–2189）。§3.2.5 在执行边界拒绝对已结束 worker 的 `send_message`，正路就是重新派发 |

worker 之间不直接说话：DSH 已经拒绝；简报里写明「需要别的任务的东西时用 `ask_main`」。

#### 3.4.3 harness 发给主 Agent 的消息

都用 `createUserNotice('glm-hourness-execute', 摘要, 正文, {hournessExecute: {...}})`（来源种类非空、其余字段原样保存，`docs/DESIGN.md` §2.4a；来源不是 `user`，所以不会被 `update_goal` 当成人直接说的话，tool-goal:44–52）。主 Agent 运行中用 `steer`，空闲用 `followup`（agent-loop:806–811）。事实字段：`{event: 'plan' | 'question' | 'handback' | 'review' | 'gate' | 'stale', task, attempt, childId, request?}`。

#### 3.4.4 留痕

- 每条消息的全文在双方的会话日志里：worker 的 `ask_main`、`submit_plan` 调用与结果；主 Agent 的 `answer_worker`、`send_message` 调用与 harness 通知。这是事实源，图上不复制全文。
- 交回处理时在任务上批注一行计数：`第 <n> 次：问了 <k> 次（答 <a>、超时 <t>），计划 <v> 版，主 Agent 发来 <m> 条消息`，`m` 由 worker 会话里来源为 `agent-message` 且 `senderSessionId` 是主 Agent 的用户消息数得出。
- 问答里定下的设计取舍，主 Agent 按身份文本的要求记成决定者为 agent 的待决再拍板（M3 的做法）；harness 不替它判断哪条回答算决定。

### 3.5 简报与简报门禁（m7-2）

#### 3.5.1 门禁

`briefGate(graph, task, ctx)`（`src/execute/brief.ts`，纯函数；`ctx` 带在跑的派发、槽位、执行状态与所属目标推出的阶段 `stage`），按序第一条不成立就拒绝：

| 检查 | 不成立时的码 | `hint` |
| --- | --- | --- |
| 节点是任务，状态为已批准或进行中 | `bad_task` | 完成的任务先重开 |
| 所属目标的推出阶段不早于 `release`，或目标已批准、没有阶段（推出的阶段由调用方算好放进 `ctx.stage`，`brief.ts` 不导入 `execute-stage.ts`） | `not_released` | 先 `design_review` 放行 |
| 有 `kind`；`review` 的写入范围为空，其余种类非空；`worktree` 不是 `false`（写任务一律在工作树里做，汇合门禁要一个分支） | `bad_attributes` | 用 `graph_edit` 补派发属性 |
| `acceptance` 至少一条 | `no_acceptance` | `Propose the task again with acceptance criteria; changing the acceptance of an existing task is the human's.`（引擎允许 LLM 在提议自己的任务时写验收，挂在已批准或进行中的特性、任务下直接批准，`src/graph/engine.ts` `planPropose`、`initialStatus`；不许改的是已有任务的验收，`LLM_EDITABLE` 不含 `acceptance`） |
| 依赖都完成 | `deps_open` | 列出未完成的依赖 |
| 任务子树里没有等人拍板的待决（含审查停下出的那张）；也没有未解除的停下标记：审查任务最新一条轮次批注、或任务上最新一条门禁失败批注以 `· 停下` 结尾，且这条批注之后任务子树（任务、审查任务、挂在任务下的待决）里没有人的历史条目（`actor: human`，或带 `relay` 的转述）；或执行行在内存里记着它已停下（`ctx.stopped`，停下标记写不进图时），§3.7.3 | `waiting_human` | 列出待决；停下标记写明哪条批注，待决没写进图时写「待决没写进图，见晨报例外；人在对话里拍板后由主 Agent 带原话转述」 |
| 这个任务没有活着的派发 | `busy` | 带在跑的 `childId` |
| 写入范围与每个在跑的写任务两两不相交（`scope.overlaps`，前缀按段比较） | `scope_busy` | 写出相交的任务与路径；可以 `graph_link` 依赖，等它合入 |
| `outputSchema` 能解析（内置名或仓库内的 JSON 文件，是对象 schema，且在 rc.3 子集内） | `bad_schema` | — |
| 审查任务：被审的任务（`source` 连线指向的实现任务）有 `done` 的交回 | `nothing_to_review` | — |

四栏都由 harness 从图生成，所以门禁检查的是图上的来源：目标栏要标题，上下文栏总有祖先链，约束栏要写入范围（写任务），完成栏要验收。缺哪个就拒，码如上表。

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
- Earlier attempts: <attempt n-1: outcome; review blocking findings; gate failure (command, last lines, log path)>
- Approved plan (version <v>): <steps>            # only when one carries over
- Lessons that match this task: <lesson id: when ... -> problem -> fix>   # at most 5

## Constraints
- Write only inside: <writeScope>. Writes elsewhere are refused.
- <Before writing, submit a plan with submit_plan and wait for approval. | Quick task: no plan needed.>
- Questions that need the main agent: ask_main (state the assumption you will use if no answer comes). Do not end your turn to wait.
- Commit on your branch; start every commit message with "<id>: ". Do not push, merge, or touch other branches or worktrees.
- Subagents you start may only read. Do not start or restart the DeepSeek Harness desktop app; desktop checks are batched (verify "L4-batch").
- Not in scope: <nonGoals of the task and its ancestors>
- Rules in effect: <rules board lines for this session, when the rules row is enabled>

## Done when
1. <acceptance 1>
2. ...
- Run the project checks in your worktree before handing back: <gate commands from norm-merge-gate>.
- Hand back by calling structured_output once (status, summary of at most 2000 characters, commits, files, checks, questions, assumptions, lessons). Write long reports to "<report dir>/<childId>.md" and give the path in "report".

brief <digest> · graph <revision>
```

审查任务的简报同形，目标栏写「Review task <被审 id> at commit <sha> against its acceptance」，约束栏写「You write nothing」与挡路的三类标准（§3.7.2），完成栏的交回是审查结论。

#### 3.5.3 pins 与过期

`pinsOf(graph, task)`（`src/graph/pins.ts`，纯函数）：对任务、它到目标的每个祖先、它的 `source` 连线指向的每个节点（决策与待决），各算一个 12 位十六进制的语义摘要：SHA-256 输入是规范化的 JSON，只含这些字段：

| 节点 | 进摘要的字段 |
| --- | --- |
| 任务 | `acceptance`、`nonGoals`、`kind`、状态是否为废弃或被取代 |
| 祖先（目标、特性、任务） | `acceptance`、`nonGoals`、状态是否为废弃或被取代 |
| 来源决策 | `verification` 是否为 `overturned` 或 `superseded`、状态 |
| 来源待决 | `decision`（拍板结果）、状态 |

不进摘要的：标题、正文、`slope`、历史、写入范围（写入范围由写入门禁与汇合门禁直接按当前的图核对，§3.2.1、§3.8.3）。

派发批注的最后一行写 `pins: <id>@<摘要> <id>@<摘要> …`。`staleness(graph, pinsLine)` 返回变了的节点与变化（摘要不同、节点不在图里）。核对的时机：交回处理、派审查之前、汇合门禁、`answer_worker` 批计划时、派发状态提醒每次计算时。过期时：交回处理照记，但不派审查，主 Agent 收到 `stale` 通知（写明哪个节点变了）；汇合门禁拒绝 `brief_stale`；正路是重新派发（新的简报）。主 Agent 在跑的 worker 过期时，通知里建议 `interrupt_agent` 后重新派发。

只用语义字段的理由：阅读摘要 §7 第 2 条的推荐 A 提到，修订号连无关的标题改动也会变，会带来误拒；只比验收、非目标与决策结果，误拒只剩真正改了意图的情形。

#### 3.5.4 并行与补位提醒

派发状态提醒（`src/execute/notice.ts`）：执行行经公共库的 `installStepNotice(agent, 'dispatch status', eligible, build, 'execute')` 给主 Agent 装一个 `agent/pre-step` 监听器（`eligible`：本步是主 Agent，且焦点目标的推出阶段为 `execute`、`merge` 或 `decompose`）。正文（英文）只列有内容的项：在跑的 worker（任务、第几次、用时、最近一次请求）、等主 Agent 回应的请求（计划、问题，按等待时长）、过期的派发、丢失的派发（§3.9.6）、空闲槽位数与可以开工的任务（前 5 个，按依赖序），可以开工且槽位空闲时末尾一句 `Free slots: <n>. Dispatch ready tasks with dispatch_task.`。注入规则用 M3 抽出的 `src/graph/digest-notice.ts`：压缩之后、目标轮、正文摘要变化时注入，其余不注入（K7：有条件提醒，不每轮重复）。

#### 3.5.5 经验板块的两个接缝

经验板块是 M5 的特性 `lessons`。M7 只定接缝，经验行不在时这两处什么都不做，行健康注明「经验板块未启用」：

- 进简报：派发时调服务 `glmHournessLessons.relevant({paths, tools, commands, limit: 5})`。`paths` 是任务的写入范围加已批计划的路径；`commands` 是 `norm-merge-gate` 的命令加计划各步的命令；`tools` 取 `['Write', 'Edit', 'Bash']` 与计划命令的首个词。返回 `{id, when, problem, fix}[]`，渲染进上下文栏，每条至多 300 字符，合计至多 1500 字符。服务抛错或超过 2 秒时不带经验，派发照常，告警一次。
- 交回候选：交回结构的 `lessons` 字段（§3.6.1）。harness 对每条调 `glmHournessLessons.propose(candidate, {task, childId, commit?})`；服务不在或失败时，在任务上批注 `[候选经验] <problem> → <fix>（<files/commands>）`，以后 M5 可以从图上导入。
- 主动查询：所有 agent 都能按关键词、文件、命令或报错文字查询（人的要求）。工具由 M5 的经验行注册，名字放进公共库的 `LESSONS_TOOL_NAMES` 并在 GLM 路由上常驻（理由见 §2.3.2）；简报的约束栏加一句 `When a command fails or a tool behaves unexpectedly, search the lessons board before working around it.`。命令失败时按报错匹配推送经验也归 M5。

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
  lessons: Array<{ problem: string, fix: string, files: string[], commands: string[], tools: string[] }>
  report?: string                                     // 长报告的路径
}
```

审查用 `hourness-review-v1`：`{verdict: 'APPROVED' | 'CHANGES_REQUESTED', commit: string, findings: Array<{id, blocking: boolean, criterion: string, where: string, what: string, fix: string}>, checked: string[], lessons: [...]}`。

任务的 `outputSchema` 写了仓库内的文件时，harness 把内置的核心字段合并进去（`properties` 取并集、`required` 取并集；同名字段以内置为准），保证交回处理需要的字段都在。

#### 3.6.2 处理

worker 的 `result` 落定后（`{output, stopReason, structured?}`，subagent:1098–1117；`caller` 模式下由 harness 自己收，subagent:2049）：

1. `stopReason` 不是 `completed`（`aborted`、`error`、`max-tokens`、`refusal`）：批注「第 <n> 次结束：<原因>」，任务保持进行中；通知主 Agent（`handback` 事件），建议重新派发或交人。
2. 有结构化结果：做语义校验（提交号是 7–40 位十六进制且在分支上，`git merge-base --is-ancestor <基线> <提交>` 与 `git branch --contains`；文件是仓库相对路径）。校验不过的项记进批注，不丢整份交回。
3. 批注交回摘要：状态、提交数与最新提交、文件数、问题与假设各几条、通信计数（§3.4.4）、报告路径。
4. 候选经验按 §3.5.5 处理。
5. pins 过期 → `stale` 通知，停在这里。
6. `status: done` → 自动审查（§3.7.1）；`blocked`、`partial`、`plan-pending` → 通知主 Agent，由它决定重新派发、改任务或交人。
7. 给主 Agent 送一条通知，正文一到三行：结论与下一步（例「task-3 第 1 次交回 done，提交 1a2b3c4（2 个），已派审查 hz-task-3r-a1-x9k2」）。整段结构化结果不进主 Agent 的上下文，要看时读会话或报告文件（阅读摘要第 11 条）。

处理是幂等的：每一步先看图上有没有同一 `childId` 的对应批注，有就跳过。这样重启后的对账可以安全地重跑（§3.9.6）。

### 3.7 独立审查（m7-4）

#### 3.7.1 自动派出

实现、测试、文档任务交回 `done` 后，harness 确保它下面有一个审查任务：标题「审查：<任务标题>」、`kind: review`、`writeScope: []`、`source` 连线指向被审任务、`acceptance` 为 `["verdict APPROVED under the docs/DEVELOPMENT.md §1.1 standard"]`。以 `harness` 身份提议，挂在已批准或进行中的任务下，引擎直接批准（计划内）。一个实现任务只有一个审查任务，每一轮是它的一次派发。

档位：被审任务的档位高一档（`simple` → `standard`，`standard` → `hard`，`hard` 仍为 `hard`），映射到不同的模型就换模型（阅读摘要第 13 条：同模型同上下文的错误高度相关）。审查的工作目录是被审任务的工作树（只读），简报写明被审的提交与基线、计划、交回摘要、上一轮的发现。审查不占写任务的槽位。

harness 直接走 §3.1.2 的派发流程（不经主 Agent 的工具调用），派发链的父仍是主 Agent，驱动器同样等它。主 Agent 收到「已派审查」的通知。

#### 3.7.2 结论的规整

`normalizeVerdict(task, verdict)`（`src/execute/review.ts`）：挡路的发现（`blocking: true`）的 `criterion` 必须是下面三类之一，否则改为不挡路，并在批注里注明「改为不挡路：没有挂到三类标准上」：

| `criterion` | 含义（`docs/DEVELOPMENT.md` §1.1） |
| --- | --- |
| `acceptance:<i>` | 任务第 `i` 条验收没满足（`i` 必须是已有的下标） |
| `irreversible-loss` | 会造成不可逆损失（丢数据、毁掉检出或用户 profile、对外的动作）而没有预防 |
| `failure-plan` | 失败了没有途径发现、发现了没有恢复办法，或事后查不到原因 |

`verdict` 与规整后的发现不一致时（`APPROVED` 却有挡路的发现，或 `CHANGES_REQUESTED` 却一条都没有），以发现为准。`commit` 不是被审的提交时，这一轮作废，重新派审查一次；再错就按 `blocked` 交主 Agent。

#### 3.7.3 收敛

审查任务上每轮批注一条 `第 <k> 轮：挡路 <b_k>，不挡路 <n_k> · <childId>`，轮数与计数从这些批注读出（图是事实源）。

| 情形 | 处理 |
| --- | --- |
| `b_k = 0` | 审查任务以 `harness` 身份标完成，证据 `{kind: 'check', ref: 'review <childId>', exit: 0, note: '<commit> · patch <patch-id>'}`；起汇合门禁（§3.8） |
| `b_k > 0`，`k ≥ 2` 且 `b_k ≥ b_{k-1}` | 停下（不收敛） |
| `b_k > 0`，`k = 3` | 停下（三轮用完；question-11 A 的第三轮就是这一轮） |
| `b_k > 0`，其余 | 通知主 Agent：挡路的发现列表，建议 `dispatch_task <被审任务>`；新的一次派发的简报带这些发现。不挡路的发现批注在被审任务上，主 Agent 可以把它们提成提议节点 |

停下分两步，先写不依赖待决的事实：

1. 停下标记：这一轮的轮次批注末尾加 `· 停下`（`第 <k> 轮：挡路 <b_k>，不挡路 <n_k> · <childId> · 停下`）。简报门禁认这个标记（§3.5.1 `waiting_human`）：标记之后，任务子树（被审任务、审查任务、挂在任务下的待决）里没有人的历史条目（`actor: human`，或带 `relay` 的转述），就拒绝派发。人的任何一次拍板、批注或转述都解除它。
2. 给人的待决：harness 在被审任务下提一张待决（决定者为人，挂在进行中的任务下直接为已批准），模板「审查不收敛」（§3.7.4），正文列各轮计数、最后一轮的挡路发现与回写标签。

待决写不进图（引擎拒绝或 I/O 错误）：重试 3 次，每次重读图；仍失败时行健康记降级、通知主 Agent（`review` 事件，正文写「停下的待决没写进图」），停下标记照样挡住再派发；晨报「例外」一节按图推出它（有停下标记、标记之后任务下没有 harness 提的待决），人在对话里拍板，主 Agent 带原话转述即解除。停下标记本身也写不进时，执行行在内存里记下这个任务已停下（`ctx.stopped`），本进程内照样拒绝派发，行健康降级，图恢复可写后补写批注。

人选「按发现再修一轮」时再给一轮修与审（第 `k+1` 轮），之后仍按上表判断收敛（与第 `k` 轮比），不收敛就再停下。人选「回到设计」或「放弃这个任务」时，回写由 `/graph-apply` 以人的身份执行（面板上拍板），或由主 Agent 带人的原话执行（对话里拍板），见 §3.7.4。人在面板上拍板后，M3 的回写把结果通知给主 Agent。

同样的收敛规则用在三处：计划被 `checkPlan` 退回第 4 次（§3.3.2，worker 交回 `blocked`，不出待决）；同一任务的汇合门禁因命令失败第 3 次（§3.8.3 第 8 步，停下标记写在任务上的门禁失败批注里，模板「门禁一再失败」）；目标的验收审查（§3.9.4，停下标记写在目标上的轮次批注里，待决挂在目标下，模板「验收审查不收敛」）。

#### 3.7.4 harness 提给人的待决

`harnessQuestion(kind, facts)`（`src/execute/questions.ts`，纯函数）是 M7 里唯一生成给人的待决的地方，审查、门禁与规范阶梯（§3.12.2）都调它。生成的节点按 `d-option-card` 的表格版（人 2026-10-29 定：「就改成表格，用「取决于」加一行条件，替换掉「为什么」和「反方」两行」）：

- 决定者为人；`weight` 为 `one-way` 或 `two-way`。
- 每个选项：`label` 是加粗短语，不超过 20 个字（怎么做）；`gain`（得到）与 `cost`（代价）各一行，写数字与具体例子，不写评价词；每个选项都有一项别的选项给不了的「得到」，不放凑数的选项。几个选项只有一个维度真正不同时，可选的 `dimension` 写这一列；所有选项都一样的列不写。
- `crux`（取决于）一行：只有人知道答案的那个关键问题。`verdict` 一行：`是 → <键>；否 → <键>`，点名选项的键，推荐的键在其中。
- 推荐项放最后（`recommend` 等于最后一个选项的键，`recommend-last` 已在引擎里核对）；字母键按位置给（A、B、C）。不写 `why`、`counter`（表格版已取消）。

字段集合以合入的引擎为准。截至 main `0639bf5`，引擎只核对推荐项在最后；表格版的字段（`label`、`gain`、`cost`、可选 `dimension`、`crux`、`verdict`、`weight`；agent 自己拍板的题免 `crux`、`verdict`、`weight`）由运行 `card-fields-table` 实现，分支 `m3-base-card` 的 `de0ccf6` 只作参考、会被替换。字段名与长度上限以那次实现的合入为准〔未核实，§15 U16〕。两者谁后合入谁改 `questions.ts`：E6 先合入时，`card-fields-table` 的合入提交同时给 `questions.ts` 补字段（`questions.ts` 的 L2 用例对每种模板逐项核对字段，不补就失败）；卡片字段先合入时，E6 从一开始就写。合入之前的过渡写法：`gain` 与 `cost` 合成选项的 `consequence`（「得到 …；代价 …」），`crux` 与 `verdict` 写进待决正文的「取决于：」与「是 → …；否 → …」两行，`weight` 写进正文一行；节点文件里不写引擎还不认识的字段（`src/graph/format.ts` 88 行会报「不是已知字段」）。内容在这里定好，两种先后都不用再做设计决定：

| 模板 | 标题 | 选项（`label`：`gain` / `cost`；推荐项排最后） | `crux`（取决于） | `verdict` | `weight` |
| --- | --- | --- | --- | --- | --- |
| 审查不收敛 | 审查不收敛：<任务标题> | **放弃这个任务**：完成门禁不再等它，工作树与分支由巡检清理 / 这个任务的改动作废，目标少一块。**回到设计**：主 Agent 按 <b> 条发现重新出方案 / 目标回到设计阶段，放行还要你批一次。**按发现再修一轮**：再派一次实现与审查，<b> 条发现都在 <文件数> 个文件里 / 多一轮的积分与时间。最后一轮挡路发现不超过 2 条时推荐「按发现再修一轮」，否则推荐「回到设计」，推荐的排最后 | 这个任务的验收本身对吗？ | 是 → <再修的键>；否 → <回到设计的键>（不再要这个任务 → <放弃的键>） | `two-way` |
| 门禁一再失败 | 门禁一再失败：<任务标题> | **放弃这个任务**：同上。**按日志再修一轮**：再派一次修复，worker 带上 3 次失败的命令 `<命令>` 与日志 / 多一轮积分；同一命令再失败会再停下 | 这个任务还要吗？ | 是 → <再修的键>；否 → <放弃的键> | `two-way` |
| 验收审查不收敛 | 验收审查不收敛：<目标标题> | **回到设计**：主 Agent 按没过的 <n> 条验收重新出方案 / 目标回到设计阶段，放行还要你批。**按发现再拆任务**：主 Agent 把没过的条目拆成新任务，做完再审 / 多几轮派发与审查。推荐规则同审查不收敛 | 目标的验收本身对吗？ | 是 → <再拆的键>；否 → <回到设计的键> | `two-way` |
| 规范升一级、影子转生效 | 规范「<标题>」<升为 X / 转为生效> | **维持现状**：规矩照旧，记录照记 / 近 <n> 天的 <m> 次违规照样只记不拦（或只提醒）。**<升为 X / 转为生效>**：违规在执行边界被拦下 / 每步提示词多一段，或误拦时要人看一次 | 这 <m> 次里有误拦吗？ | 是 → <维持的键>；否 → <升级的键> | `two-way` |
| 规范降一级 | 规范「<标题>」降为 <级别> | **维持现状**：这道门禁照旧硬拦 / 每次调用多一次判定，近 28 天 0 次命中。**降为 <级别>**：少一道检查，提示词或判定少一段 / 以后再加回来要重新攒 3 次以上的证据 | 近期还会改 <规则管的范围> 吗？ | 是 → <维持的键>；否 → <降级的键> | `one-way`（以后改起来很贵：加回门禁要重新攒证据） |

回写标签：前三种模板的正文有一行 `回写：<键> → drop <任务 id>; <键> → stage <目标 id> design`（只有这两种动作）。`src/graph/panel-row.ts` 在 `/graph-apply` 以人的身份拍板之后（M3 加的回写通知之前）读这一行：只认第一条历史为 `harness` 提议的待决，动作的对象只能是待决的父任务（`drop`）或待决所在的目标（`stage`），按人选的键以人的身份执行（`status dropped`；`edit {stage: 'design'}`，已批准的目标人可以改，`src/graph/engine.ts` `planEdit` 对有人的权限的写入不设限）。执行失败只写进结果行与回写通知，不影响拍板本身。人在对话里拍板时，主 Agent 带人的原话转述拍板，并按同一行带同样的原话执行回写（转述的写入有人的权限，`engine.ts` 150 行 `privileged`）；M7 补的阶段提醒写明这一步。

### 3.8 汇合门禁（m7-5）

#### 3.8.1 门禁命令写在哪：规范节点 `norm-merge-gate`

每张图一个规范节点，id 固定为 `norm-merge-gate`，命令写在它的 `acceptance` 里，每条一项。规范的新建是提议（LLM 提、人批），验收条件只有人能改，所以门禁变松要人同意（`docs/ORCHESTRATION.md` §7.6「把检查配置改松属于计划外决策」）。不加图节点的新字段。

`parseGateNorm(acceptance)`（`src/execute/gate-norm.ts`，纯函数）认五种写法，其余条目是说明文字，原样显示在报告里：

| 写法 | 含义 |
| --- | --- |
| `` `$ <命令>` `` | 门禁命令，总是跑，按列出的顺序 |
| `` `$ <命令>` when <路径>[, <路径>…] `` | 改动碰到这些路径（写法同 `writeScope`，目录以 `/` 结尾）时才跑 |
| `` `setup $ <命令>` ``、`` `setup $ <命令>` when <路径>[, <路径>…] `` | 准备命令：新建工作树之后跑；之后监视的文件（`when` 的路径，不写时默认 `package.json`、`package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`yarn.lock`）的摘要变了就再跑（任务工作树在派发时核对，门禁工作树在门禁命令之前核对，§3.1.2、§3.8.3） |
| `` `patrol $ <命令>` `` | 只在夜间巡检里跑（例如依赖检查） |
| `` `push` `` | 合入之后推送（不强推） |

本仓库的规范节点（由编排者在 E9 之前提议、人批准；§14）建议写成：

```
`setup $ pnpm install --store-dir ../../.pnpm-store`
`$ npm run build`
`$ npm run preflight`
`$ npm test`
`$ npm run probe` when src/, ui/, packages/, scripts/probe/, scripts/sandbox.mjs
`patrol $ npm run deps:check`
`push`
```

命令经 `child_process.spawn(command, {shell: true, cwd})` 运行：命令文本来自人批过的规范，Windows 上 `npm` 是 `.cmd`，要经 shell。每条上限 30 分钟（常量 `GATE_COMMAND_MS`），超时结束整棵进程树（Windows 用 `taskkill /T /F /PID`）。标准输出与错误写进日志文件，不进内存全文。

图上没有 `norm-merge-gate`、或它的命令一条都解析不出时，门禁拒绝（`no_gate_norm`），`hint` 写「Propose a norm node with id norm-merge-gate listing the project's setup, build and test commands; propose it during design so the release approves it, or the human approves it in the panel」。

正路是在设计阶段就把它提出来，让它随 M3 的放行卡一起被批准，第一次合入不再多一次人的批准：M3 的放行集合是目标子树里全部的提议节点（`src/graph/stage.ts` `releaseSet`），挂在目标下的规范提议也在其中。M7 给 M3 的设计阶段提醒（`src/design/stage-notice.ts`）加一句条件提醒：图上没有 `norm-merge-gate` 时，「Before release, propose norm-merge-gate under the goal: read the project's build and test setup and list each command as `$ <command>`.」，有了就不再出现（K7：有条件的提醒）。不改主 Agent 的身份节：身份节是常驻的提示词，这件事只在没有规范时才要说。本仓库的规范节点由编排者提、人批（§14），不走这条路。

#### 3.8.2 运行方式：外部后端的子 agent

执行行激活时注册一个 subagent provider（subagent:3256–3267 `registerProvider`）：`{name: 'hourness-gate', capabilities: {agentOptions: false, agentPreset: false, outputSchema: false, depthLimit: false}, inheritsParentContext: false, start(request)}`，能力全部为否，同 DSH 进程外后端的写法（subagent:2789–2794）。`start` 从 `request.prompt` 的文字里读 `{"hournessGate": {"task": "<id>"}}`，返回 `{id: 'hz-gate-<任务>-<6 位>', result, dispose}`（服务据此登记外部激活，subagent:1768–1790）；`result` 永远不 reject，落定为 `{output: [{type: 'text', text: 报告}], stopReason: 'completed' | 'error' | 'aborted'}`；`dispose` 结束正在跑的命令并释放锁。

起门禁：`subagents.startActivation({provider: 'hourness-gate', label: 'hourness gate <id>', request: {prompt, parent: 主 Agent, cwd: 仓库根}, signal, delivery: 'caller'})`。来源有两处：审查通过时 harness 自动起（§3.7.3），与主 Agent 的 `merge_task {id}`（重试用）。

为什么这样做：门禁要跑几分钟。放在主 Agent 的工具调用里，主 Agent 这一回合就被占住；放在宿主的后台 promise 里，驱动器不知道它还在跑，主 Agent 无事可做时会一拍接一拍地空转。外部激活是驱动器认得的后代：`waitForChildren` 等外部激活的 `result`（subagent:1310–1313），派发链在 1844 行对外部激活同样建立；人按停止或 `interrupt_agent` 也能停它（subagent:1271–1276）。代价是它占 DSH 的一个激活名额（默认 8 个）。

这条路没在 L3 跑过〔未核实，§15 U2〕。不成立时（注册抛错、启动被拒）退回：`merge_task` 在工具调用里同步跑门禁，审查通过时只通知主 Agent「调用 merge_task」；行健康记「门禁以同步方式运行」。

#### 3.8.3 步骤

门禁锁：一个仓库同时只有一个门禁或主干检查在用门禁工作树。锁是仓库的公共 git 目录（`git rev-parse --git-common-dir`，主检出的 `.git`）下的文件 `hourness-gate.lock`，以 `fs.open(path, 'wx')` 独占创建，内容 `{pid, boot, holder: 'gate <任务>' | 'trunk-check', at}`（`boot` 为本机开机时刻，`Date.now() - os.uptime() * 1000` 取到分钟）。锁失效的判定：`process.kill(pid, 0)` 报 `ESRCH`（进程不在；`EPERM` 视为还在），或 `boot` 与本机当前开机时刻不同（重启过、pid 被复用）〔Windows 上的行为未核实，§15 U14〕；失效的锁先改名为 `hourness-gate.lock.stale-<时间>` 再重新创建，改名留痕。同一进程里的先后用内存队列；另一个进程持锁时每 5 秒重试，至多 60 分钟，之后结果为 `gate_busy`（可以用 `merge_task` 重试）。门禁在第 5 步之前取锁，第 12 步之后或任何一步结束时放锁；`dispose` 也放锁。锁的实现在 `src/execute/gate-lock.ts`，运维行经服务 `glmHournessExecute.withGateLock(repoRoot, holder, fn)` 使用（§3.11.2）。headless、探针与另一个桌面版进程对同一个仓库起门禁时都受这把锁约束；第 9 步的 `--ff-only` 仍保证主干只被快进一次。

| 步 | 做什么 | 不成立时 |
| --- | --- | --- |
| 1 | 读图。任务为进行中；最近一次交回为 `done`；审查任务已完成，带 harness 的 `check` 证据，证据的 `note` 里有被审的提交与 patch-id；pins 没过期；任务子树没有等人拍板的待决，也没有未解除的停下标记（与简报门禁同一个判定，§3.5.1）；`norm-merge-gate` 能解析 | `not_ready`（缺什么）、`brief_stale`、`waiting_human`、`no_gate_norm` |
| 2 | 任务工作树干净（`git status --porcelain` 为空）；分支 `hz/<id>` 在 | `worktree_dirty`（列文件）：派一次修复，让 worker 提交或丢弃 |
| 3 | 主检出仍在派发时记下的基线分支上 | `base_changed` |
| 4 | 改动清单：`git diff --name-only <merge-base> hz/<id>`，非空，且每个文件都在任务当前的 `writeScope` 之内 | `empty`、`scope_violation`（列出范围外的文件）：写入门禁没拦住的写法在这里被发现，记一条违规与复盘 |
| 5 | 门禁工作树 `.worktrees/hz-gate`（只建一次，分离头指针）：确认它在 `git worktree list` 里且是分离头指针，然后 `git checkout --detach --force <基线>`、`git reset --hard`、`git clean -fd`（保留被忽略的 `node_modules` 与产物）。这三条破坏性命令只对这个目录执行 | 目录对不上时拒绝，不执行任何重置（`gate_worktree_invalid`） |
| 6 | `git merge --squash hz/<id>` | 冲突：`git reset --hard`（门禁工作树），拒绝 `conflict`（列冲突文件）；通知主 Agent 派一次修复，简报写明「在你的工作树里 `git rebase <基线>` 并解决冲突」 |
| 7 | patch-id：`git diff <基线> --cached` 经 `git patch-id --stable`，与审查证据里记的 patch-id 相同 | 不同（基线变动改变了这份改动）：自动再派一轮审查，这一轮不计入收敛的失败轮数；本次门禁结束，结果为 `review_stale` |
| 8 | 门禁工作树新建过、或监视文件（§3.8.1）的摘要与 `<项目目录>/gate/setup.json` 记下的不同时，先跑准备命令并更新记录；然后按顺序跑适用的门禁命令，第一条失败就停 | `checks_failed`（命令、退出码、日志最后 40 行、日志路径）；任务上批注 `门禁第 <n> 次失败：<命令> exit <码> · <日志路径>`；同一任务第 3 次失败时这条批注末尾加 `· 停下`，再按模板「门禁一再失败」提待决（§3.7.3 的两步与写不进图时的预案）。准备命令失败：`setup_failed`，不计入这三次 |
| 9 | 以仓库配置的身份提交压缩后的改动，提交信息见下；在主检出里 `git merge --ff-only <新提交>` | 主干在门禁期间前进（不能快进）：从第 5 步重来一次；再不行 `main_moved`。主检出有未提交的改动挡住快进：`main_dirty`（列文件），并记一条复盘「主检出有门禁以外的改动」 |
| 10 | 以 `harness` 身份写图：任务的证据 `commit`（新提交号）与每条命令的 `test`（`exit` 0，`note` 写日志路径），状态转为完成；批注合入摘要 | 写失败重试 3 次（每次重读修订号）；仍失败时通知主 Agent、行健康记降级；第 11 步照做，`result.json` 里已有全部证据，巡检与重启对账会补写（§3.9.6、§3.11.2） |
| 11 | 规范有 `push` 且基线分支有上游时 `git push`（不带 `--force`） | 失败只批注「推送失败：<首行>」，不影响合入；巡检每天重试 |
| 12 | 任务工作树干净就 `git worktree remove .worktrees/hz-<id>`（不带 `--force`）；分支 `hz/<id>` 保留，巡检在它「已合入」且超过 14 天后删除（§3.11.2）。压缩合入之后分支的提交不是基线的祖先，`git branch -d` 会拒绝，所以「已合入」按尾注判定：基线上有这个任务的合入提交，且它的 `Hourness-Branch-Tip` 等于分支当前的头 | 删除失败只批注 |

每次运行的目录 `<项目目录>/gate/<任务>/<时间>/`：每条命令一个日志、`result.json`（任务、提交、命令与退出码、耗时、每一步的结论）。`result.json` 在写图之前写好，它是门禁运行的明细，节点证据引用它。

提交信息（`docs/DEVELOPMENT.md` §9：一件事一个提交、写清改了什么与怎么验证的）：

```
<任务 id>: <任务标题>

<交回摘要，至多 20 行>

Worker commits:
<短提交号> <标题>
...
Reviewed: <审查的 childId>
Checks: <命令> exit 0; ...
Hourness-Task: <任务 id>
Hourness-Attempt: <实现的 childId>
Hourness-Branch-Tip: <合入时 hz/<id> 的头提交号>
```

尾注 `Hourness-Task` 让巡检分得出哪些主干提交是经门禁合入的（§3.11.2），也让门禁第 10 步失败之后能从 git 补写图。`Hourness-Branch-Tip` 同时写进 `result.json`；分支的清理（§3.11.2）与重开后的再派发（§3.1.2 第 4 步）都按它判断分支是不是已经整个合入。

#### 3.8.4 门禁核对的证据都由 harness 产生

审查结论来自审查者的结构化交回，harness 规整后写成证据（§3.7.3）；提交号由 harness 自己做出来；测试证据是 harness 自己跑的命令与退出码；写入范围由 harness 用 git 核对。worker 自报的 `checks` 只显示，不作证据（阅读摘要 K2、`docs/ORCHESTRATION.md` §2.9「证据只认格式……由以后的汇合门禁核对」）。

`docs/ORCHESTRATION.md` §4.7 的六条与本门禁的对应：测试证据 → 第 8、10 步；检查器零新增告警 → 规范里的命令（本仓库的 `npm test` 含 `npm run lint`）；知识同步 → 审查者的核对项（简报要求按项目规范核对代码改动是否同批改了文档或节点），harness 不另做机械检查（§11）；独立审查 → 第 1、7 步；主干永远是绿的 → 门禁在压缩后的提交上跑、只快进，夜间主干检查兜底（§3.11.2）；草稿区的临时脚本 → 等 M4 定草稿区，在那之前不检查（§11）。

#### 3.8.5 `merge_task`

参数 `{id: string}`；输出 `{task, job, status: 'started' | 'already-merged'}`。基线上已有带这个任务尾注的提交时返回 `already-merged`，并补写图（若缺）。其余同第 1 步的拒绝。

#### 3.8.6 桌面版与沙盒

worker 与门禁都不碰桌面版：简报禁止，L4 的步标 `L4-batch` 攒到批次（`docs/DEVELOPMENT.md` §1.1），由编排方（Kiro）做；用桌面版按 `risk-shared-desktop` 的常设授权不再问人，运行之间排队，同一时间一个持有者；规则板启用时，它的 `dsh-desktop` 租约在执行边界拦下驱动桌面版的命令（规则板设计 §8.3）。沙盒 profile：本仓库的探针在工作树里跑时要用指向这个工作树的临时 profile（`docs/DEVELOPMENT.md` §3），H1 让 `npm run probe` 在工作树里自动建一个、用完删除，于是几个工作树并行跑探针互不干扰〔推断：各用各的 profile 与运行目录，未实测并行，§15 U9〕；规则板启用时，`scripts/sandbox.mjs` 按 profile 名取 `dsh-profile:<名字>` 租约（规则板设计 §6.6），同一个 profile 被两个运行抢时排队。

### 3.9 驱动循环与完成门禁（m7-3，`d-driver`）

#### 3.9.1 `/drive`

注册：`{definitionId: 'dsh-glm-hourness/drive', name: 'drive', description: '让主 Agent 按项目图自动推进当前目标：派发、审查、合入；/drive stop 停下全部 worker', input: {hint: 'stop | 空'}, handler}`（commands:149–181）。只有人能发斜杠命令（`docs/ORCHESTRATION.md` §2.10），所以「goal 只由人发起」由这个入口守住；服务层不查人类授权（goal:635–650）。

空输入的处理，按序第一条成立就返回：

| 条件 | 结果 |
| --- | --- |
| 不是主 Agent | error「先用 /wish 让这个会话当主 Agent」 |
| 没有焦点目标（M3 `goalOf(focusOf(session))`） | error「主 Agent 还没有聚焦到一个目标」 |
| 目标不是已批准或进行中；或推出的阶段早于 `release` | error「目标还没放行：先在对话里走完设计，用五键卡批准」 |
| 当前 DSH goal 为 `active` 且已 arm | success「已经在自动推进」 |
| 当前 goal 为 `blocked` 且原因是 `round-limit` | `goals.edit(ref, {maxGoalRounds: 原值 + 500})` 后 `goals.resume`（goal:657–699） |
| 当前 goal 为 `active`（未 arm，会话恢复之后）、`paused`、`blocked` | `goals.resume`（goal:686–699；会话恢复与 fork 之后 goal 不会自动 arm，`dsh-goal-round-driver/README.md` 57 行） |
| 没有 goal，或上一个已 `complete` | `goals.create(agent, {objective, maxGoalRounds: 500})`（goal:635–650；已有未完成的 goal 时服务抛 `GOAL_ALREADY_EXISTS`，639 行） |

`objective`（英文，至多 2000 字符，因为每一拍的目标轮提示词都带它，goal-round-driver:11–19）：

```
Project graph goal <id>: <title>
Done when: 1. <acceptance> 2. ...
Not in scope: <nonGoals>
Drive it through the project graph: dispatch ready tasks with dispatch_task, answer worker requests with answer_worker, and let the harness review and merge. When everything left waits for the human, call await_human. Mark this goal complete only when the completion gate passes; it lists what is missing.
```

验收条件太长时截断，末尾写 `(see graph_show <id>)`（阅读摘要第 15 条：goal 的目标文本带验收条件与非目标）。

成功的结果行（给人看）：「已开始自动推进「<目标标题>」：主 Agent 按项目图派发、审查、合入。暂停用 /goal pause，全部停下用 /drive stop。」`modelReminder`（§3.1.3）有内容时另起一行：主 Agent 的模型不是它所在 provider 的 `hard` 或 `standard` 档模型时，「主 Agent 现在用的是 <模型>。建议换成 <standard 档的模型> 再开始：主 Agent 用强一点的模型，子 agent 用便宜的就行。」；provider 没有档位映射时固定一句「主 Agent 建议用这个 provider 里最强的模型，子 agent 用便宜的就行。」只提醒，不替人换（`docs/CHARTER.md` §6）。

`/drive stop`：`goals.pause`（goal:676），再对主 Agent 派出的每个活着的 worker、审查与门禁调 `subagents.interrupt(id, {kind: 'user', parentSessionId})`（subagent:1258–1278）。结果行列出停下了谁。

#### 3.9.2 每一拍

投影注入沿用 M2.3（目标轮必注入，`docs/ORCHESTRATION.md` §2.5），派发状态提醒在变化时注入（§3.5.4），M3 的阶段提醒在推出的阶段为 `decompose`、`execute`、`merge` 时写本阶段做什么（M7 给 `src/design/stage-notice.ts` 补这三个阶段的正文）。这三条都追加在 `next()` 之后，不经收件箱，不破坏驱动器的预约（L3 实测，`docs/ORCHESTRATION.md` §2.1）。

驱动器在每一拍之前等主 Agent 的后代（worker、审查、门禁）都静下来（goal-round-driver:130–133，subagent:1296–1330）：worker 在跑时不开新一拍，worker 交回或门禁结束后才开。主 Agent 在一拍里派出 worker 之后可以接着做别的；harness 的通知在 worker 有事时把主 Agent 叫起来（§3.4.3）。

#### 3.9.3 完成门禁

执行行在 `tools/pre-execute` 上看 `update_goal`，`arguments.action === 'complete'` 且调用方是主 Agent 时（GLM 路由上经 DeferredToolCall 调用，`tools/pre-execute` 看到的仍是 `update_goal` 本身，L3 实测），算 `goalCompletion(graph, goal, git)`（`src/graph/execute-stage.ts` 的纯函数加 git 的几项事实）：

1. 目标子树里每个任务都是完成、废弃或被取代。
2. 每个写入范围非空、已完成的任务都有 harness 写的 `commit` 证据，且这个提交是基线分支的祖先（`git merge-base --is-ancestor`）。
3. 每个已完成的审查任务都有 harness 写的 `check` 证据，`exit` 为 0。
4. 子树里没有已批准或进行中的待决（人的与 agent 的都算）。
5. 子树里没有提议节点。目标的验收审查不建节点（§3.9.4），所以它不会让这一条不成立。
6. 目标上最新一条验收审查批注（`验收审查第 <k> 轮：APPROVED · 挡路 0 · <childId> · @<基线提交> · pins: <目标>@<摘要>`）存在，它的 pins（目标的验收与非目标）没过期，每个任务的 harness 合入提交都是它记下的基线提交的祖先（审查之后没有新的合入），且最新一条不带 `· 停下`。
7. 没有活着的 worker、审查、验收审查或门禁属于这个目标。

不成立：拒绝（`deny`，拒绝以工具错误回到模型，goal 保持 active，tools:3337–3353），正文列出前 10 项缺口与下一步（例 `task-7 is done without a harness merge commit: run merge_task task-7`）。都成立：放行，并在内存里记一张放行凭据 `{agentId, goalId, graphRevision, callId, at}`（`goalId` 取 `goals.get(agent)` 的 goal `id`；`callId` 是这次工具调用的 `exec.callId`，tools:1267；`goals.get` 与 `ref.id` 的对应见 §15 U15）。harness 监听 `goal/changed`（agent 作用域的事件，载荷 `{change: {operation, ref: {id, revision}, goal?}}`，goal:872–877，`ref` 的形状见 goal:763），看到 `operation === 'complete'` 时找同一 agent、同一 `ref.id`、10 分钟之内的凭据：有就用掉它，以 `harness` 身份把图上的目标标为完成，证据 `{kind: 'check', ref: 'hourness completion gate', exit: 0, note: '<任务数> tasks, <合入数> merges, acceptance review <childId>, call <callId>'}`；没有（例如 `/wish off` 之后 `update_goal complete` 不再经过门禁，或别的插件直接调 `goals.complete`）就不写完成，只在目标上批注「goal 在完成门禁之外完成（<agentId>）」并记一条复盘（§3.15）。在 `pre-execute` 里不写图：`update_goal` 之后可能因为别的原因失败，那时图与 DSH 的 goal 会不一致。宿主在放行与 `goal/changed` 之间重启时凭据丢失，结果是图上的目标没写完成、只有那条批注；人或主 Agent 再 `/drive` 时对账（§3.9.6）发现 DSH 的 goal 已完成而图上没有，提示主 Agent 重新调一次 `update_goal`，没有 goal 时由 `/drive` 新建再完成。

不是主 Agent 的会话不受这道门禁约束。主 Agent 没有焦点目标时拒绝（「先 graph_focus 这个 goal 对应的目标」）。`update_goal` 的 `blocked` 放行，harness 在 `goal/changed` 里给图上的目标批注阻塞原因。

#### 3.9.4 目标的验收审查

验收审查不是图上的任务节点：引擎只在父节点是已批准或进行中的特性、任务时直接批准任务提议，挂在目标下的任务提议停在 `proposed`（`src/graph/engine.ts` `initialStatus`），要人批准才能派发，违背 `d-plan-approval`；本稿又不改引擎权限。所以由 harness 直接起一个审查激活，结论记成目标上的批注。

- 触发，两处：某次合入之后目标子树里的任务都关了（都是完成、废弃或被取代）；或主 Agent 调 `update_goal complete` 时完成门禁只差第 6 条（最后一个任务是被废弃而不是合入的，就走这一处）。两处都只在目标上没有对当前基线提交的验收审查、也没有活着的验收审查时才起，拒绝信息写「acceptance review started: <childId>; call update_goal complete again after it reports」。
- 激活：`startActivation({provider: 'spawn', label: 'hourness acceptance <目标> round <k>', childId: 'hz-<目标 id>-acc-a<k>-<6 位>', request: {prompt: [简报], parent: 主 Agent, cwd: 主检出, agentOptions: hard 档, outputSchema: hourness-review-v1, maxDepth}, delivery: 'caller'})`，登记表里的角色为 `acceptance-review`（§3.1.4），写入一律被拒（审查者，§3.2.1 第 4 条）。驱动器照样等它。
- 简报：同 §3.5.2 的审查简报，目标栏写「Review goal <id> at commit <基线提交> against its acceptance」，完成栏逐条列出目标的验收；`criterion` 只能用 `acceptance:<i>`；`checked` 必须含每一条 `acceptance:<i>`。目标的验收条件多是人话，所以交给独立的审查者逐条判断，harness 核对它覆盖了每一条、每条引用了证据（提交、测试日志、文件）。覆盖不全或 `commit` 不是派给它的基线提交时，这一轮作废、重起一次；再错就通知主 Agent 并停在这里（同 §3.7.2）。
- 记录：结论规整（§3.7.2）后，harness 在目标上批注 `验收审查第 <k> 轮：<APPROVED | CHANGES_REQUESTED> · 挡路 <b> · <childId> · @<基线提交> · pins: <目标>@<摘要>`；`k` 与计数从目标上的这些批注读出（图是事实源）。完成门禁第 6 条读最新一条。
- 收敛：同 §3.7.3 的表；停下时这条批注末尾加 `· 停下`，待决挂在目标下（待决挂在开放的父节点下直接批准，`initialStatus` 的 `OPEN_PARENT_TYPES`），模板「验收审查不收敛」（§3.7.4）。
- 不通过的条目由主 Agent 拆成新任务，挂在这条验收所属的已批准特性或任务下（计划内，直接批准）；目标下没有开放的特性或任务可挂时，新提的任务会是提议，要人批准，这时主 Agent 在通知里照实说明。这是目标级的「怎样算做成」唯一的检查，人不再单独验收（人要看时，晨报的目标一节列出每条验收与对应证据）。

#### 3.9.5 都在等人、空转与轮次上限

- `await_human {questions: string[], summary: string}`（主 Agent 的工具）：每个 id 必须是目标子树里已批准或进行中、决定者为人的待决；否则 `invalid`。harness `goals.block(agent, ref, {code: 'hourness-waiting-human', message: 'Waiting for the human: question-3, question-7. <summary>'})`（goal:720–735；`code` 必须是小写连字符，`message` 去首尾空白后非空，goal:76–83）。返回之后模型照常结束回合。
- 恢复：M3 改过的 `/graph-apply` 在人拍板、批准、否决之后通知同一张图上的主 Agent（M3 §3.5.2）；M7 在它之后加一步：候选会话的 goal 为 `blocked`、原因码是 `hourness-waiting-human`、原因里列的待决都已拍板或废弃时，`goals.resume(agent, ref)`，结果行加「已恢复主 Agent 的自动推进」。这是人在面板上的动作引起的恢复，不是自动复活。人在对话里拍板（转述）时，人的这句话就是当前回合里的直接人类输入，模型可以自己用 `update_goal` 恢复（tool-goal:49–52 `hasDirectHumanInput`、62–65 `requireDirectHuman`），阶段提醒写明。
- 空转：执行行按主 Agent 会话在内存里记每个目标轮开始时的（图修订号、执行活动计数：派发、交回、请求、门禁的次数）。连续 3 个目标轮这两个值都没变时，`goals.block(…, {code: 'hourness-idle-rounds', message: 'No graph change and no worker activity for 3 goal rounds.'})`，记一条复盘（§3.15），通知里写明「人用 /drive 恢复」。宿主重启后计数从零开始（宁可多跑几拍，不误停）。
- 轮次上限：驱动器到上限时以 `round-limit` 阻塞（goal-round-driver:135–140）。harness 在 `goal/changed` 里看到它就记复盘，晨报单列；人发 `/drive` 时上限加 500 后恢复。上限是汇报事件，不是预算（`docs/ORCHESTRATION.md` §4.3）。

#### 3.9.6 宿主重启后的对账

worker、审查与门禁都随宿主进程结束；状态在图与会话日志里。主 Agent 会话在这个进程里第一次走步时（执行行给主 Agent 装的 `agent/pre-step` 监听器，每个会话每个进程一次），以及 `/drive` 时，执行 `reconcile(graph, session)`：

1. 找出目标子树里进行中、最新一条派发批注的 `childId` 既不在登记表里、也不是活 agent（`agents.get`，agent:596）的任务。
2. 这次派发已有交回批注：什么都不做。
3. 否则从 worker 的会话推出交回：执行行注册一个会话投影 `hournessHandback`，折叠这个会话里最后一次成功的 `structured_output` 调用的参数；用 `sessionQuery.observeSession(childId)` 读它（同 `listChildren` 的读法，subagent:2339–2352；桌面版组合有 `session-query-sqlite`，`dsh-web-app/cordis.patch.yml`:27）。读到就按 §3.6.2 处理（幂等）。工具调用与结果在会话事件里的确切形状要按 rc.3 核对〔未核实，§15 U6〕。
4. 读不到：批注「第 <n> 次在宿主重启时丢失」，派发状态提醒列为「丢失」，下一次派发的简报写「上一次丢失：分支 hz/<id> 上已有提交 <列表>，先检查再接着做」。
5. 审查已通过、还没合入的任务：基线上有带它尾注的提交而图上没有 harness 的提交证据 → 补写（从 `result.json` 或提交本身）；没有 → 派发状态提醒列为「可以合入」。
6. 等人的 goal 不动。
7. DSH 的 goal 已 `complete`、图上的目标没有完成证据、目标上有「goal 在完成门禁之外完成」的批注：派发状态提醒写「the graph goal is not marked done; run /drive to start a new goal and call update_goal complete once the completion gate passes」，不替它补写（没有放行凭据就没有 harness 的完成证据，§3.9.3）。

不会重复派发：对账只写批注与提醒，派发仍由主 Agent 决定；简报门禁按「这个任务没有活着的派发」判断，丢失的派发不算活着。

### 3.10 四答晨报（m7-6）

`fourAnswers(input)`（`src/report/four-answers.ts`，纯函数）。输入：`load()` 得到的图、本期起止、审计流水（违规、用量、派遣）、合入事实（门禁证据与 `result.json`）、指标（§3.12.3、§3.13）。`/hourness` 与运维会话的 `hourness_report {kind: 'morning'}` 都调它，文字相同。词与 plain-ui 一致（plain-ui 设计 §2.2）：节名先写四答，括号里写它对应的东西：理由回答为什么，架构回答怎么做，目标回答效果是，规划是任务分解（`docs/ORCHESTRATION.md` §4.3）。

| 节 | 内容 | 来源 |
| --- | --- | --- |
| 一、目标（效果是） | 每个未关闭的目标一行：推出的阶段；任务完成 x/y，本期合入 m；完成门禁差几项（前 3 项）；验收审查的逐条结论（有时） | 图；`goalCompletion` |
| 二、规划（任务分解） | 本期 agent 新增与废弃的任务数（前 5 条标题）；重开（返工）次数与节点；过期的派发；卡住的：等主 Agent 回应超过 1 小时的请求、空转与轮次上限阻塞、审查不收敛、门禁一再失败 | 图的历史；派发与交回批注 |
| 三、理由（为什么） | 本期 agent 自己拍的待决（前 5 条，选项与一句理由）；计划批准次数；worker 问了几次、超时几次 | 图（`recentDecisions` 里决定者为 agent 的）；批注 |
| 四、架构（怎么做） | 验证债（已采纳、仍未验证的决策数）；本期被推翻、被取代的决策 | `openItems` 的验证债；历史里的 `verify`、`supersede` |
| 等你拍板 | 人的待决张数与最早一张的天数；在等人的 goal | `openItems.questions`；goal 视图 |
| 门禁与审查 | 门禁运行次数、一次通过率、失败按命令计；审查轮数分布、挡路发现数 | 门禁证据与批注 |
| 花费 | 积分与高峰占比，按模型；主 Agent 与 worker 各占多少（按会话：主 Agent 的会话 id 与 `hz-` 开头的子会话） | 用量流水，经公共库的计价服务（split 第 3 步的 `glmHournessPricing`；GLM 包不在时只计次数与 token） |
| 模型使用 | 主 Agent 的模型；worker 各档的模型与次数；`modelReminder` 有内容时单列一行，同 §3.9.1 的提醒 | 用量流水的 `sessionId` 与模型 |
| 例外 | 违规按规则计（影子记录另列）；本期新增的复盘节点；有停下标记、标记之后却没有 harness 提的待决的任务与目标（待决没写进图，§3.7.3）；在完成门禁之外完成的 goal（§3.9.3） | 违规流水；图 |

默认至多 40 行，每节先给数字、再给至多 5 条明细，其余写「还有 N 条」。同样的输入得到逐字相同的输出（L2 钉住）。「讲细点」「说重点」的按钮与回合末尾卡片属于 M8。

### 3.11 巡检（m7-7）

#### 3.11.1 运维会话

`/patrol on | off | status`（人发的命令，运维行注册）：

- `on`：调用方必须是主 Agent，且有焦点目标。目标下没有正文以 `运维：` 开头的特性时，以 `human` 身份提议一个（「运维：<目标标题>」，正文写运维会话的 id；人发的命令，身份为人，同 `/graph-apply`，`docs/ORCHESTRATION.md` §2.10），直接为已批准；巡检发现的计划内工作挂在它下面，引擎直接批准。然后在本会话建三条定时提醒（`schedule.create(sessionId, {title, prompt, daily | weekly})`，schedule:2083–2095，六种选择器恰好给一种；`title` 去首尾空白后非空、至多 120 字符，schedule:93–97；子 agent 的会话被拒，2097–2098 行；提醒只投到这个会话，`dsh-schedule/README.md` 47 行）：
  - `hourness morning`：每天 `times.morning`（默认 `08:30`）。
  - `hourness patrol`：每天 `times.patrol`（默认 `02:30`，非高峰，人多半不在）。
  - `hourness weekly`：每周一 `times.weekly`（默认 `09:00`）。
  字段形状〔实读〕：`daily` 恰好是 `{time, time_zone}`，`weekly` 恰好是 `{time, time_zone, weekdays}`，多一个或少一个键都拒（`hasExactKeys`，schedule:1052–1059、1118–1130）；`time` 是 `HH:mm:ss`（可带 1–3 位小数，不许 `24:00`，schedule:333–335）；`time_zone` 是 IANA 时区名（`canonicalizeTimeZone`）；`weekdays` 是不重复的 ISO 星期数 1（周一）到 7（周日）的非空数组（schedule:394–405）。存下来的记录里字段名是 `timeZone`，请求里是 `time_zone`，不要混。映射：`times.*` 配置写 `HH:mm`（校验 `^([01]\d|2[0-3]):[0-5]\d$`，不合格时用默认值并在行健康里注明），注册时补成 `HH:mm:00`；`time_zone` 取 `Intl.DateTimeFormat().resolvedOptions().timeZone`；周报 `weekdays: [1]`。已有同名的提醒时先删再建。
- `off`：删掉本会话里这三条（`schedule.list({sessionId})` 取本会话里活着的提醒，schedule:2120–2121；按标题前缀 `hourness ` 挑出，逐条 `schedule.delete({sessionId, id})`，schedule:2164–2173，返回 `deleted: false` 时照实报）。
- `status`：列出三条的下一次时刻与最近一次投递。

提醒的正文（英文，固定）：早报「Scheduled morning report (hourness). Call hourness_report with kind "morning" and reply with its text unchanged, then at most three lines on what needs the human.」；巡检「Scheduled patrol (hourness). Call hourness_report with kind "patrol". For each finding that is planned work, propose a task under <运维特性 id>; for each finding the decision tiers reserve for the human, propose a question with options and the recommendation last. Do not write files.」；周报「Scheduled weekly report (hourness). Call hourness_report with kind "weekly" and reply with its text unchanged.」。提醒消息的来源是 `schedule`（schedule:1594），不算人直接说的话，`create_goal` 等要人授权的操作不会因它执行（`docs/ORCHESTRATION.md` §12）。

宿主不在运行时提醒不投递，也不自动补（`dsh-schedule/README.md` 153 行）：巡检把每次运行批注在运维特性上，下一次运行发现距上次超过 26 小时就报「漏跑」。冷会话收到提醒时恢复出来的 agent 工具面是否齐全，见核实清单第 17 项，随 L4。

#### 3.11.2 巡检做什么

`hourness_report {kind: 'patrol'}` 的工具体执行 `patrolRun`（`src/operate/patrol.ts`），先做 harness 可以安全自动做的，再把其余列成发现：

| 项 | 自动做的 | 列成发现的 |
| --- | --- | --- |
| 工作树 | 删除任务已完成或废弃、且干净的 `.worktrees/hz-*`（`git worktree remove`，不带 `--force`） | 不干净的（列文件，可能有没交回的工作） |
| 分支 | 删除已合入、合入超过 14 天的 `hz/<id>` 与 `hz/<id>@<n>`：「已合入」指基线上有这个任务的合入提交，它的 `Hourness-Branch-Tip` 等于分支当前的头，且没有工作树检出这个分支（`git worktree list --porcelain`）。删除用 `git update-ref -d refs/heads/<分支> <记下的头>`：只在分支头仍等于记下的值时删，否则 git 拒绝，不会删掉之后的新提交（压缩合入的分支不是基线的祖先，`git branch -d` 一律拒绝，所以不用它） | 没合入、对应任务已关闭的分支（分支头不等于任何合入记下的值） |
| 主干 | 规范有 `push` 时重试没推上去的推送 | 近 7 天主干上没有 `Hourness-Task` 尾注的提交数（门禁以外的改动；dogfood 的指标「人亲手改代码的次数」，`docs/ORCHESTRATION.md` §10.1） |
| 主干检查 | 经 `glmHournessExecute.withGateLock(repoRoot, 'trunk-check', fn)` 取门禁锁（§3.8.3），在门禁工作树上对基线最新提交跑全部门禁命令（不按路径筛；监视文件变了先跑准备命令），结果批注在运维特性上：`主干检查 <提交>：通过` 或 `失败：<命令>`。锁被占时不等，这次批注 `主干检查跳过：门禁在用`，下一次再跑；执行行没启用时批注 `主干检查跳过：执行行未启用` | 失败的命令与日志；失败时记复盘「主干变红」（DORA 恢复时长从这里起算）；连续两次跳过 |
| 巡检命令 | 跑规范里的 `patrol $` 命令（本仓库：`npm run deps:check`） | 退出码非 0 时输出的前 40 行（主版本升级属于必须问人的第 4 类） |
| 图 | 已合入而图上缺 harness 证据的任务：从提交尾注与 `result.json` 补写 | 进行中超过 24 小时、没有活着派发的任务；完成却没有 harness 合入证据的写任务；过期的派发；等人超过 3 天的待决；图的校验错误 |
| 自身 | — | 距上次巡检超过 26 小时 |

主干检查是重活。规则板启用时它经规则板的重活排队（人在电脑前就推迟，规则板设计 §7）；没有规则板时它只在定时的夜间那次跑。

### 3.12 规范阶梯与周报（m7-8）

#### 3.12.1 规范节点上的量法

规范的级别、模式与它对应的规则写在规范节点正文的标签里（M3 的 `labeledSections` 解析）：`级别：记忆 | 提示词 | 阶段提醒 | 门禁`、`模式：影子 | 生效`、`规则：<规则 id>, …`（规则 id 即违规流水里的 `rule`）。没有 `规则：` 标签的规范不进阶梯，周报只报它们的个数（「N 条规范还没接上量法」）。

#### 3.12.2 提议的阈值

`ladderProposals(norms, violations, decided)`（`src/report/ladder.ts`，纯函数）：

| 提议 | 条件 |
| --- | --- |
| 升一级 | 级别低于门禁，近 7 天对应规则的拦截记录（不含影子）不少于 3 条 |
| 影子转生效 | 模式为影子，近 14 天影子记录不少于 20 条，且人没有标过误判（与 question-14 设计里 G2 的判据同一组数） |
| 降一级 | 级别为门禁，近 28 天拦截与影子记录都是 0 |

每周至多 3 张，按记录数从多到少取；28 天内人否决过的同一提议不再提。harness 在规范节点下以 `harness` 身份提待决（决定者为人，计划内直接批准），经 `harnessQuestion`（§3.7.4 的两种规范模板）生成：正文列数据，选项两项，推荐项在最后：A「维持现状」（后果：规矩照旧，记录照记），B「<升为 X / 转为生效 / 降为 X>」（后果：写明对模型与人的影响，例「每步提示词少一段」）；每个选项写得到与代价，题目带「取决于」与「是 → X；否 → Y」两行；升级与转生效是双向门（`weight: two-way`），降一级去掉一道门禁，是单向门（`weight: one-way`）。待决写不进图时重试 3 次，仍失败就只在周报里列出这条提议（提议不会丢：下周按同样的数据再算一次）。人选 B 之后，具体改动（改正文的级别、写门禁代码）是主 Agent 的计划内任务。规范的修改走决策队列，不用五键卡：五键只出现在设计阶段（`docs/ORCHESTRATION.md` §4.4），§9.2「人用五键拍板」按决策卡执行（§12 记为 agent 定）。

#### 3.12.3 人的负担与质量对照（question-27 B）

只量系统里看得到的数，每周报，附前 4 周的值看走向（`docs/CHARTER.md` §8：只看曲线）：

| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 每周被问几次 | 本周新建的、决定者为人的待决数，加本周人在 M3 卡片上作答的次数（历史里 `actor: human`、`reason` 带卡片出处的条目） | 图的历史 |
| 每次要读多少字 | 上一项各次问到人面前的文字量：待决的正文与选项（说法加后果）的字数，卡片取对应待决或目标的需求卡；另报本周晨报与周报的总字数。中文按字、英文按词计 | 图；报告自身 |
| 拍板等多久 | 决定者为人的待决从提出到第一次拍板的时长，报中位数与最长 | 图的历史 |
| 因人的决定返工几次 | 本周的重开（`done` → `doing`）里，重开之前 7 天内其祖先或来源有人的再拍、推翻或取代的次数 | 图的历史 |
| 对照：测试一次通过率 | 本周门禁第一次运行即通过的任务比例 | 门禁批注 |
| 对照：审查发现 | 本周每个合入任务的挡路发现数（中位数）与审查轮数 | 审查批注 |
| 对照：返工率 | 本周重开次数除以本周完成的任务数 | 图的历史 |

#### 3.12.4 周报

`weeklyReport(input)`（`src/report/weekly.ts`）：人的负担（四项）、质量对照（三项）、DORA（§3.13）、规范阶梯的提议（与本次新提的待决 id）、审查收敛（各轮次分布、停下交人的次数）、复盘与候选（本周新增的复盘、候选经验与候选标定题的条数）、标定回归（本周有标定运行时：回归集的 pass@1 与上一次的差）。周报的规范提议由 harness 在算周报时提出，模型只转述。

### 3.13 DORA 指标（m7-9）

`dora(input)`（`src/report/metrics.ts`）。部署在本项目里指「经汇合门禁合入基线分支」：

| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 交付频率 | 每周合入次数 | 任务上 harness 写的 `commit` 证据 |
| 变更前置时间 | 任务第一次派发到合入的时长，中位数 | 派发批注与合入证据的时间 |
| 变更失败率 | 合入后 14 天内，任务被重开、或出现 `source` 指向它的修复任务、或夜间主干检查失败且失败提交在它之后的第一个，三者之一的合入所占比例 | 图的历史；主干检查批注 |
| 恢复时长 | 主干检查从失败到下一次通过的时长；批次 L4 失败到它的修复合入的时长 | 运维特性上的主干检查批注；L4 批注 |

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
2. 事后扫描（发现，`ablation` 做）：每次运行结束后扫这次的事件流，工具调用参数里有 `ws/` 以外的路径就判越界、写明证据。M7 把它的结论写成 `result.json` 的 `valid`：越界或圈禁命中过的运行 `valid: false`，不进汇总。圈禁拦下了也照样判无效（模型试图越界本身就让这次运行的结果不可信）。
3. 物理隔离（`ablation` 做）：运行目录移到系统临时目录，被测模型够不到验收脚本与别的试次。

`check.mjs` 与参考解本来就不进 `ws/`（运行器只复制 `fixture/`，验收脚本以独立进程在模型结束后运行，`docs/ORCHESTRATION.md` §10.5.1）；运行目录搬出仓库之后，圈禁仍管从 `ws/` 往外读（系统临时目录里同批的别的试次、按绝对路径读回仓库）。

#### 3.14.4 消融

消融开关由 `ablation` 加在 `scripts/calibrate/`（只在标定时加载），M7 不另加开关。M7 的用法：标定回归与消融的时机由 agent 定（§12），结果按同一提交的基线对比，报每格的差，进周报的「标定回归」一行，花费进晨报。

#### 3.14.5 从自举失败到标定题

复盘节点（§3.15）正文的 `候选标定题：` 一栏非空时，主 Agent 可以在标定特性（`m7-10`）下提一个任务（计划内），种类 `test`，写入范围 `tests/calibration/<新题>/`，验收固定为：夹具在出问题时的提交上缩减而来、不超过 30 个文件；`check.mjs` 对原样的夹具不通过、对参考解通过；`task.json` 的 `origin` 指向复盘节点，`set` 为 `regression`。收题的门槛：同类失败出现两次以上，或这次失败让人出手救场。

### 3.15 自举与试用中的留痕

自举（`dogfood`）的验收是「卡住、返工、要人救场的地方就是要改的地方，记成节点」。M7 让 harness 在这些事件发生时自动记一个复盘节点（`retro`，挂在事件所属的目标下；LLM 与 harness 在未关闭节点下提复盘直接批准，`docs/ORCHESTRATION.md` §2.9 propose 行）：

| 事件 | 在哪发现 |
| --- | --- |
| 审查不收敛、三轮用完 | §3.7.3 |
| 门禁一再失败；`scope_violation`；`main_dirty` | §3.8.3 |
| 计划被退回 4 次 | §3.3.2 |
| goal 因空转或轮次上限阻塞 | §3.9.5 |
| goal 在完成门禁之外完成 | §3.9.3 |
| 停下的待决没写进图 | §3.7.3 |
| 派发在宿主重启时丢失 | §3.9.6 |
| 主干变红；主干上有门禁以外的提交 | §3.11.2 |
| 同一任务同一规则的拦截达到 3 次 | 写入门禁的计数 |

复盘节点的正文用固定标签（`labeledSections` 能解析）：`触发：`（事件与码）、`任务：`、`会话：`（主 Agent 与有关 worker 的会话 id）、`提交：`、`经过：`（harness 记得的事实：各轮计数、失败的命令与日志路径）、`恢复：`（之后怎样，由主 Agent 或人补批注）、`候选经验：`、`候选标定题：`。后两栏由主 Agent 在处理完之后用 `graph_edit` 补正文（LLM 可以改复盘的正文）。harness 写的只有事实，判断留给主 Agent。

`field-trial` 以后在别人的项目里用同一套复盘格式；导出、匿名化与回收属于那个特性（§11）。复盘节点里只有路径、命令、会话 id 与计数，不含代码内容。

## 4. 宿主契约与 rc.3 证据

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据并经 L3 或 L4；「L3 实测」指派发可行性验证的探针（`scripts/probe/probe-dispatch.mjs`，场景 `glm-dispatch`、`glm-goal`、`goal-headless`）跑过；「M3 新用」指 M3 设计第一次用、M7 跟着用；「新用」指 M7 第一次用，实现时补进接口对照表与薄适配层 `src/shared/dsh-min.ts`。文件都在 `reference/dsh-desktop-0.2.1-rc.3/` 下。

| 契约 | M7 的用法 | 文件与符号（行） | 状态 |
| --- | --- | --- | --- |
| `subagents.startActivation({provider, label, childId?, request{prompt, parent, cwd?, agentOptions?, outputSchema?, maxDepth?}, signal, delivery})` 返回 `{childId, messageId?, result, dispose}` | 派发 worker、审查、门禁 | `dsh-subagent/lib/index.js` `SubagentService.startActivation`（3036–3048）、`SubagentManager.startLocal`（1391–1477） | L3 实测（`delivery: 'parent'`） |
| 预留 `childId` 已有会话时 `DUPLICATE_CHILD`；预留 id 只给本地后端 | `childId` 带随机后缀；门禁不预留 | `dsh-subagent/lib/index.js` `startLocal`（1430–1437）、`assertChildIdAvailable`（1597）、`startActivation`（3038） | 实读 |
| `request.cwd` 为绝对路径时原样用作工作目录；子会话头 `cwd` 取父会话 | worker 在工作树里工作；写入门禁按工作目录解析 | `dsh-subagent/lib/index.js` `resolveDirectory`（1523–1527）、`materializeTracked` 里的 `workingDirectory.set`（1800–1806）、`childSessionMeta`（346–356） | L3 实测 |
| `agentOptions` 合并在父路由之上（只传 `model` 时 provider 继承） | 档位映射 | `dsh-subagent/lib/index.js`（315；`startLocal` 1400–1404 读 `provider`、`model`、`reasoningEffort`） | L3 实测（`model`）；`reasoningEffort` 实读 |
| `outputSchema` 先校验为对象 schema；子 agent 得到 `structured_output`；提交前要求收件箱为空、子任务已完；有 schema 却没提交、回合 `completed` 时结算为 `error` | 交回；`ask_main` 必须在工具调用里等 | `dsh-subagent/lib/index.js` `attachStructuredRuntime`（889–960）、`captureLocalResult`（1098–1117）、`startActivation`（3046） | L3 实测（交回）；结算为 `error` 实读 |
| `delivery: 'caller'`：不附 `send_message` 交回指引、不给父 agent 送结算通知 | 交回只到 harness | `dsh-subagent/lib/index.js` `startLocal`（1460）、`notifySettlement`（2048–2063）、`withContinuableReturnGuidance`（472–476） | 实读；运行时〔未核实，U1〕 |
| 结算通知的形状（`parent` 模式的退路） | `caller` 不成立时 | `dsh-subagent/lib/index.js` `settlementSummary`（487–500）、`createSettlementMessage`（508–540） | L3 实测 |
| `ACTIVATION_LIMIT_REACHED`；`maxActiveSubagents` 默认 8 | 槽位已满的判定 | `dsh-subagent/lib/index.js` `reserve`（1046–1048）、Config（2979–2980） | 实读 |
| `subagents.resolveMaxDepth(configured)`；深度只在传了 `maxDepth` 时检查 | 派发时传入，worker 不能经派发再派发 | `dsh-subagent/lib/index.js` `resolveMaxDepth`（3023–3030）、`resolveChildDepth`（279–283） | 实读 |
| `waitForChildren(parent)`：等所有常驻后代（本地与外部）静下来 | 驱动器每拍之前等 worker、审查与门禁 | `dsh-subagent/lib/index.js` `SubagentManager.waitForChildren`（1296–1330）；`dsh-goal-round-driver/lib/index.js` `drive`（130–133） | 实读；本地子 agent 的等待随 `glm-goal` 间接实测 |
| `registerProvider(provider)`：provider 有 `start` 或 `prepareContinuable`；外部后端的能力全为否；`start` 返回 `{id, result, dispose}`；外部激活也有 ancestry | 门禁 provider `hourness-gate` | `dsh-subagent/lib/index.js` `registerProvider`（3256–3267）、`NO_START_CAPABILITIES`（2789–2794）、`startExternal`（1483–1520）、`materializeTracked` 外部分支（1768–1790）、ancestry（1844） | 实读；第三方注册与驱动器等待〔未核实，U2〕 |
| `subagents.sendMessage(sender, targetId, content, {signal})`：子到父 `sendToParent`（steer，唤醒）；父到子 `deliverToChild`（常驻时 steer，否则冷恢复）；只认直接父子；提交结构化结果期间 `INPUT_CLOSED` | 通信（主 Agent 经原生 `send_message`） | `dsh-subagent/lib/index.js` `sendMessage`（1538–1550）、`sendToParent`（2119–2135）、`deliverToChild`（2080–2089）、`deliverFollowup`（2091–2117）、`submitAdmitted`（2216–2231）、`deliver`（1584–1590）、`createAgentMessage`（443–465）、`authorizeLineage`（1658–1662） | 子到父 L3 实测；父到子实读〔运行时未核实，U3〕 |
| 冷恢复：不常驻的直接子 agent 收到消息时，从会话日志折叠出描述（provider、模型、档位、preset、persona、工具过滤）恢复成新的本地激活，不带 `outputSchema`，投递方式缺省 | 拒绝主 Agent 给已结束的 worker 发消息（§3.2.5）；登记表不认冷恢复的激活（§3.1.4） | `dsh-subagent/lib/index.js` `deliverFollowup` 里 `resident.get` 为空转 `coldResume`（2094–2095）、`coldResume`（2141–2189，`materialize` 的参数 2167–2183） | 实读 |
| `send_message {agent_id, message}`、`interrupt_agent {agent_id}` 工具 | 主 Agent 改方向、中断；§3.2.5 读 `agent_id` | `dsh-tool-subagent-control/lib/index.js` `apply`（21–91；参数 26–35、64–68） | 实读 |
| `subagents.interrupt(target, {kind: 'user', parentSessionId} \| {kind: 'ancestor', agent})` | `/drive stop` | `dsh-subagent/lib/index.js` `SubagentManager.interrupt`（1258–1278）、`SubagentService.interrupt`（3105） | 已用（graph-panel `/graph-run`） |
| 原生 `subagent` 工具的 provider 由行配置固定，模型选不了 | 模型不能用 `subagent` 起门禁 provider | `dsh-tool-subagent/lib/index.js`（475–481） | 实读 |
| `listChildren` 与 `sessionQuery.observeSession(id)`；桌面版组合有 `session-query-sqlite` | 重启对账读 worker 会话的投影 | `dsh-subagent/lib/index.js` `listChildren`（2339–2352）；`dsh-web-app/cordis.patch.yml`（27） | 实读；读第三方投影〔未核实，U6〕 |
| 会话 id 在 `[A-Za-z0-9._-]` 内原样落成文件名 | `childId` 的字符集 | `dsh-session-persistence-jsonl/lib/index.js`（866） | 实读 |
| `goals.create(agent, {objective, maxGoalRounds?})`、`get`、`edit`、`pause`、`resume`、`complete`、`block(agent, ref, {code, message})`、`disarm`；阶段 `active`、`paused`、`blocked`、`complete`；已有未完成的 goal 时 `GOAL_ALREADY_EXISTS`；轮次用尽时不能恢复；阻塞原因码是小写连字符 | `/drive`、`await_human`、空转阻塞、人拍板后恢复 | `dsh-goal/lib/index.js` `GoalService.create`（635–650）、`get`（611–614）、`edit`（657–669）、`pause`（676–678）、`resume`（686–699）、`complete`（706–712）、`block`（720–735）、`disarm`（622–627）、`decodeBlockReason`（76–83）、阶段（38–45）、Config `defaultMaxGoalRounds`（588） | `create`、`get` L3 实测；其余实读 |
| `goal/changed`：agent 作用域的事件，载荷 `{change: {operation, ref: {id, revision}, goal?}}`；goal 的 `ref` 是 `{id, revision}`，修订号对不上时 `GOAL_STALE_REVISION` | 完成门禁的放行凭据按 `ref.id` 配对；轮次上限的复盘 | `dsh-goal/lib/index.js` 发事件（872–877）、`ref` 核对（763）、`transition`（818） | 事件本身 L3 实测；载荷字段实读 |
| 驱动器：`<goal_round>` 提示词固定、只含目标原文与轮次；每拍前等后代；到上限以 `round-limit` 阻塞；投递用 `agent.followup`；人取消回合时暂停 goal | `objective` 的写法；轮次上限 | `dsh-goal-round-driver/lib/index.js` `renderGoalRoundPrompt`（11–19）、`drive`（117–170）、`agent/status` 处理（215–237）、`goal/changed` 处理（240–246） | L3 实测（`glm-goal`） |
| `update_goal`：`complete`、`blocked` 要求当前回合有直接的人类输入或是当前目标轮；来源缺省为 `user`，非人产生的消息要写自己的来源 | 完成门禁的位置；harness 的消息来源；人在对话里拍板后模型可以恢复 | `dsh-tool-goal/lib/index.js` `hasDirectHumanInput`（49–52）、`requireDirectHuman`（62–65）、`completionAuthority`（72–80）、`renderWrapupContext`（91–97） | 完成门禁在 `tools/pre-execute` 拦下 L3 实测 |
| `tools/pre-execute`（waterfall，`deny{reason}` 即工具错误、工具体不执行）；`exec.agent`、`exec.parent`、`exec.arguments`、`exec.callId` | 五条写入规则、完成门禁、放行凭据的 `callId` | `dsh-tools/lib/index.js`（3229–3260、3320–3353；`exec.callId` 见 1267） | 已用；`callId` 实读 |
| `tools.register` 与输出 schema 子集；执行按名解析，与工具面无关 | 七个 M7 工具；工具体自查调用方 | `dsh-tools/lib/index.js`（2974–2984、3227–3260、3637–3640） | 已用 |
| `system-prompt/assemble`（agent 作用域 waterfall） | 按角色过滤工具面 | `dsh-system-prompt/lib/index.js`（365–405） | 已用 |
| `agent/pre-step` 与 notice 追加；压缩检查点与目标轮消息的来源 | 派发状态提醒；空转计数；对账的触发 | `dsh-agent-loop/lib/index.js`（901–925）；`dsh-goal-round-driver/lib/index.js`（144–151） | 已用 |
| 活 agent 的 `followup`、`steer`、`inject`、`cancel`、`status`、`whenIdle` | harness 通知主 Agent | `dsh-agent-loop/lib/index.js`（806–821、870） | `followup`、`inject` 已用；`steer` M3 新用 |
| `agents.get(id)`、`agents.roots()`、`agents.list()`、`agent/created` | 映射与对账；面板回写的候选 | `dsh-agent/lib/index.js` `get`（596）、`list`（614）、`roots`（623）、`announce`（574–589，派发 `agent/created` 在 581） | 已用；`roots` M3 新用 |
| `sessionProjections.register` / `snapshot` / `stateOf` | `hournessHandback` 投影；M3 的 `hournessMainAgent` | `dsh-session-projection/lib/index.js`（68、126、141） | 已用（graphLive）；`stateOf` M3 新用 |
| `subagentCatalog` 投影 | 面板现场照旧；对账不依赖它（`caller` 模式下目录照样记，`startLocal` 1460–1465） | `dsh-subagent/lib/index.js`（703–803、810–818） | 已用 |
| `commands.register`、调用参数 `{commandId, agent, rawInput, signal}` | `/drive`、`/patrol` | `dsh-commands/lib/index.js`（149–181、379–385） | 已用 |
| `schedule.create(sessionId, {prompt, title, at \| after_seconds \| every_seconds \| daily \| weekly \| cron})`；子 agent 的会话拒绝；投递来源 `{kind: 'schedule'}`；宿主重启后任务还在、投递失败不自动重试；提醒只投到原会话 | 运维会话的三条定时提醒 | `dsh-schedule/lib/index.js` `ScheduleService.create`（2083–2100）、拒绝子会话（2097–2098、2250–2259）、投递（1594–1597）；`dsh-schedule/README.md`（12、47、153、157） | 实读；冷会话投递随 L4（核实清单第 17 项，U8） |
| `daily` 请求恰为 `{time, time_zone}`，`weekly` 恰为 `{time, time_zone, weekdays}`；`time` 为 `HH:mm:ss`；`weekdays` 为 ISO 1–7 不重复的非空数组；`title` 必填、至多 120 字符；`list({sessionId})` 只列本会话活着的提醒；`delete({sessionId, id})` 返回 `{deleted, code?}` | `/patrol on`、`off`、`status` 的请求与时刻映射（§3.11.1） | `dsh-schedule/lib/index.js` `parseDailyInput`（1052–1059）、`parseWeeklyInput`（1118–1130）、`localClockTime`（333–335）、`normalizeWeekdays`（394–405）、`scheduleTitle`（93–97）、`list`（2120–2121）、`delete`（2164–2173） | 实读 |
| `userQuestions.ask` 拒绝子 agent（`DELEGATED_CALLER`） | worker 的问题只能经主 Agent | `dsh-user-questions/lib/index.js`（534） | 实读 |
| headless 在自己 agent 第一次静止空闲时退出 | 探针与标定里驱动循环跑在第二个根 agent 上 | `dsh-headless/lib/index.js`（349–351） | L3 实测（`goal-headless`） |
| 工作区变更记录只覆盖有工作目录的顶层会话 | M7 不用它判 worker 的改动，改用 git | `dsh-workspace-changes/lib/index.js`（1019–1022） | 已用（影子兜底） |
| `tools/post-execute` 能看到工具结果的 `value`（shell 工具带 `exitCode`） | 不用：门禁自己跑命令，worker 自报的检查只显示 | `dsh-tools/lib/index.js`（3598–3625）；`dsh-tool-pwsh/lib/index.js`（266–280） | 实读，不用 |

不做的：不注册 Remote 服务、不加 waterfall、不追加自定义会话事件（第三方都做不到，`docs/DEVELOPMENT.md` §5 第 6 条、`dsh-session/README.md` 70 行）。harness 给主 Agent 与 worker 的消息都是带本项目来源的 notice，进收件箱；门禁的报告是外部激活的输出。

本仓库图引擎的事实（不是宿主契约，main `0639bf5` 实读，M7 依赖它们而不改它们）：

| 事实 | M7 的用法 | 位置 |
| --- | --- | --- |
| 任务提议只在父节点是已批准或进行中的特性、任务时直接批准；待决、风险、复盘在任何开放的父节点下直接批准；有人的权限（`human` 或带 `relay`）的提议直接批准 | 审查任务挂在实现任务下；验收审查不建任务（§3.9.4）；停下的待决挂在任务或目标下 | `src/graph/engine.ts` `initialStatus`（306–318）、`OPEN_PARENT_TYPES`（100） |
| LLM 与 harness 能改的字段：`title`、`body`、`slope`、`decider` 与派发属性，不含 `acceptance`；已批准的目标只有人的权限能改 | `no_acceptance` 的提示（§3.5.1）；回写由 `/graph-apply` 或转述执行（§3.7.4） | `engine.ts` `LLM_EDITABLE`（97）、`planEdit`（467–480）、`privileged`（150） |
| 任何身份都能批注任何节点 | 轮次批注、验收审查批注、停下标记 | `engine.ts` `planChange` 的 `comment` 分支（361–363） |
| 新提的待决推荐项必须在最后 | harness 的待决（§3.7.4） | `engine.ts` `questionRefusal`（289–301） |
| 节点文件里不认识的字段报错 | 选项卡字段合入之前不能先写（§3.7.4） | `src/graph/format.ts` `record`（81–90，88 行 `is not a known field`） |

## 5. 数据与状态

| 数据 | 事实源 | 谁写 | 读的一方 | 寿命 |
| --- | --- | --- | --- | --- |
| 任务的派发属性、验收、非目标 | 图（任务节点） | 主 Agent 写派发属性；人写验收 | 全部 | 随 git |
| 一次派发（`childId`、次数、基线、档位与模型、简报摘要、pins） | 图：任务上的派发批注；会话日志：主 Agent 的工具调用、worker 的首条消息（简报全文） | harness | 对账、过期判定、晨报、DORA | 图随 git；会话随 DSH |
| 登记表（`childId` → 角色、任务或目标、工作树、计划状态、请求表） | 模块内存，只由本进程的派发写入；丢了不重建写权限（§3.1.4） | 执行行 | 写入门禁、§3.2.5、通知 | 进程内 |
| 完成门禁的放行凭据 | 内存，10 分钟 | 执行行 | `goal/changed` 监听器 | 进程内；丢了只少写一次完成，§3.9.3 |
| 停下标记 | 图：审查任务的轮次批注、任务上的门禁失败批注、目标上的验收审查批注，末尾 `· 停下`；写不进图时内存里的 `ctx.stopped` | harness | 简报门禁、汇合门禁、完成门禁、晨报 | 随 git |
| 目标的验收审查 | 图：目标上的轮次批注（结论、挡路数、`childId`、基线提交、pins）；审查者会话里的结构化交回 | harness；审查者 | 完成门禁、晨报 | 图；会话 |
| 门禁锁 | 公共 git 目录下的 `hourness-gate.lock`（pid、开机时刻、持有者）；失效的改名为 `.stale-<时间>` 留着 | 执行行（门禁）；运维行经服务（主干检查） | 门禁、主干检查 | 用完删除 |
| 准备命令的监视摘要 | `<项目目录>/execute/<任务>/setup.json`、`<项目目录>/gate/setup.json` | 执行行 | 派发、门禁 | 文件不入库；任务工作树删除时一起删 |
| 计划 | worker 会话里 `submit_plan` 的参数（全文）；任务正文的「计划」一节（渲染，带摘要） | worker；harness 写正文 | 主 Agent、人、写入门禁 | 会话；图 |
| 计划的批准 | 图：任务上的批准批注（版本、摘要、`childId`、调用 id）；主 Agent 会话里的 `answer_worker` 调用 | harness | 写入门禁、后续派发 | 图；会话 |
| worker 的请求（问题、计划）与回答 | 双方会话日志；等待中的请求在内存 | worker、主 Agent；harness 登记 | 主 Agent、worker | 会话；内存随进程 |
| 交回 | worker 会话里 `structured_output` 的参数；任务上的交回摘要批注；长报告文件 `<项目目录>/execute/<任务>/<childId>.md` | worker；harness | 主 Agent、审查、对账 | 会话；图；文件不入库 |
| 审查结论与轮数 | 审查任务上每轮的批注与完成时的证据；审查者会话里的结构化交回 | harness；审查者 | 收敛判定、汇合门禁、晨报 | 图；会话 |
| 门禁运行 | `<项目目录>/gate/<任务>/<时间>/`（日志、`result.json`，含 `branchTip`）；任务上的证据与批注；主干提交的尾注（`Hourness-Task`、`Hourness-Attempt`、`Hourness-Branch-Tip`） | harness | 主 Agent、巡检、DORA、分支清理、重开后的再派发 | 文件不入库；图与 git 随仓库 |
| 门禁命令 | 图：`norm-merge-gate` 的验收条件 | 人（LLM 提议） | 门禁、巡检、简报 | 随 git |
| goal | DSH 会话日志（`goal/change` 事件） | `/drive`、`await_human`、驱动器 | 驱动器、完成门禁 | 随会话 |
| 空转计数 | 内存 | 执行行 | 空转阻塞 | 进程内，重启清零 |
| 运维会话与定时提醒 | DSH 的 schedule 存储（宿主级，重启后在）；运维特性节点的正文与每次运行的批注 | `/patrol`；巡检 | 运维行、晨报 | 宿主；图 |
| 复盘 | 图（`retro` 节点） | harness；主 Agent 补正文 | 人、M5、标定收题 | 随 git |
| 候选经验 | 经验服务（M5）；没有时任务上的批注 | harness | M5 | 视 M5；图 |
| 指标与报告 | 不存，按需从上面各项算出 | — | 人 | — |
| 工作树与分支 | git（`.worktrees/hz-*`、`hz/*`、`hz/*@<n>`、`.worktrees/hz-gate`） | harness；worker 提交 | 门禁、巡检 | 任务合入后删工作树；已合入的分支 14 天后按尾注删 |

K4 的核对：编排状态（派发记录、简报的 pins、计划批准、审查结论与轮数、停下标记、验收审查、门禁结论）都在图上或能从 DSH 会话日志推出；内存里只有登记表、等待中的请求、放行凭据、空转计数与 `ctx.stopped`，丢了的后果都写明了：登记表丢了，活着的 worker 变只读；等待中的请求随 worker 一起结束；凭据丢了，图上少写一次完成；空转计数从零开始；`ctx.stopped` 只在图写不进时用，图恢复后补写。租约与预算在规则板自己的存储里（规则板设计 §4），M7 不另存。

处处留痕（`docs/CHARTER.md` §7.1 条款 11）：每个动作只在它所属的地方记一个事实，别处引用。派发的事实在会话日志里，图上的批注引用 `childId`；门禁的明细在 `result.json`，图上的证据引用它的路径；消息全文在会话日志里，图上只有计数。

## 6. 失败预案

按 `d-failure-plans`：不穷举边角，按操作写清怎样发现、怎样重试、怎样恢复、事后从哪里查。「交人」都经图上的待决或晨报，不靠对话里喊。

### 6.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| `subagents` 不在 | 执行行不注册工具与命令 | 行健康 inactive「没有 subagents 服务」 |
| `goals` 不在 | 派发照常；`/drive` 注册但拒绝；完成门禁不装 | degraded「没有 goal 服务，驱动循环不可用」 |
| 门禁 provider 注册失败 | 门禁改为在 `merge_task` 里同步运行（§3.8.2） | degraded「门禁以同步方式运行：<原因>」 |
| 设计行（M3）不在 | 工具注册，调用时拒绝（「先启用 glm-hourness/design 并 /wish」） | degraded |
| 图行不在 | 工具注册，调用时 `not_found` | 会话健康说明 |
| `schedule` 不在（运维行） | `/patrol` 注册但拒绝；`hourness_report` 照常 | degraded「没有 schedule 服务，巡检只能手动」 |
| 某个工具注册失败 | 撤掉本行全部注册 | inactive，写明原因 |

### 6.2 运行期

| 操作 | 失败的情形 | 怎样发现 | 重试 | 恢复 | 留痕 |
| --- | --- | --- | --- | --- | --- |
| `dispatch_task` | 门禁不过；槽位满；工作树或准备命令失败；`startActivation` 抛错（`ACTIVATION_LIMIT_REACHED`、`DUPLICATE_CHILD`、`UNAUTHORIZED`） | 工具错误，码与 `hint` | 不自动重试；`DUPLICATE_CHILD` 换随机后缀重试一次 | 主 Agent 按 `hint` 补；准备命令失败时工作树已删，下次重建 | 工具调用与结果在主 Agent 会话里；准备命令的日志文件 |
| 派发之后写图失败 | 引擎拒绝或 I/O 错误 | 重试仍失败 | 3 次，退避 0.2、0.8、2 秒 | worker 照跑；对账与交回处理会再补派发批注 | 告警一次；行健康 degraded；会话日志有派发事实 |
| worker 跑着 | 卡住、跑偏 | 派发状态提醒的用时；面板现场 | — | 主 Agent `send_message` 改向或 `interrupt_agent`；人在面板「暂停」或 `/drive stop` | 双方会话日志 |
| `submit_plan` | `checkPlan` 不过；主 Agent 30 分钟不回应 | 工具结果 | worker 改了再交，至多 3 次 | 第 4 次不过 → worker 交回 `blocked`；超时 → 交回 `plan-pending`，主 Agent 之后批准并重新派发 | worker 会话；任务正文与批注 |
| `ask_main` | 主 Agent 20 分钟不回应 | 工具结果 `timeout` | — | worker 按自己写下的假设继续，交回里列出 | 双方会话；交回的 `assumptions` |
| 交回 | 结算为 `error`、`aborted`、`max-tokens`；结构化结果语义不对；pins 过期 | 交回处理 | — | 批注与通知；主 Agent 重新派发或交人；过期的不派审查 | 任务上的批注；worker 会话 |
| 审查 | 结论引用了别的提交；结论不收敛 | 规整与收敛判定 | 引错提交重派一次 | 不收敛 → 停下标记加人的待决，任务暂停派发 | 审查任务上每轮的批注；待决 |
| harness 提待决 | 引擎拒绝（字段不合卡片规则、图校验错误）或 I/O 错误 | 引擎的返回 | 3 次，每次重读图 | 停下标记照样挡住再派发；行健康 degraded，通知主 Agent；人在对话里拍板，主 Agent 转述 | 晨报「例外」按图推出；复盘「停下的待决没写进图」；控制台告警一次 |
| 停下标记本身 | 图写不进 | 引擎的返回 | 3 次 | 本进程内 `ctx.stopped` 拒绝派发；图恢复可写后补写 | 行健康 degraded；worker 与审查者的会话 |
| 门禁锁 | 另一个进程持锁；锁文件残留 | 独占创建失败；pid 与开机时刻核对 | 每 5 秒，至多 60 分钟；主干检查不等 | 失效的锁改名后重建；超时为 `gate_busy`，主 Agent `merge_task` 重试 | 锁文件内容；改名留下的 `.stale-<时间>`；门禁报告 |
| 准备命令 | 依赖文件变了而 `node_modules` 是旧的；准备命令失败 | 监视文件的摘要对不上；退出码 | 摘要变了就重跑一次 | 失败为 `worktree_setup_failed` 或 `setup_failed`，不计入门禁失败的三次；修好依赖后重派发或 `merge_task` | 准备命令日志；`setup.json` |
| 重开之后再派发 | 旧分支已整个合入；旧分支合入之后又有提交 | 尾注 `Hourness-Branch-Tip` 与分支头比较 | — | 旧分支改名为 `hz/<id>@<n>`，从基线新建；有多余提交时照样改名并批注 | 派发批注；改名后的分支 |
| 目标完成 | `complete` 不经完成门禁（`/wish off` 之后、别的插件） | `goal/changed` 没有配对的放行凭据 | — | 不写完成证据；对账提示重新走完成门禁 | 目标上的批注；复盘 |
| 主 Agent 给已结束的 worker 发消息 | 冷恢复出没有交回结构的激活 | §3.2.5 在 `tools/pre-execute` 拒绝 | — | 正路是重新派发 | 违规流水 |
| 汇合门禁 | 见 §3.8.3 每一步的「不成立时」 | 门禁报告（外部激活的输出），通知主 Agent | 主干前进时重来一次；patch-id 变了自动再审一轮；命令失败由主 Agent 派修复，第 3 次交人 | 主干在快进之前不变；门禁工作树每次重置；快进之后写图失败由巡检与对账补写 | `result.json`、日志、任务证据与批注、提交尾注 |
| 推送 | 网络、凭证、被拒（非快进） | 门禁第 11 步 | 巡检每天重试 | 非快进（远端有别人的提交）列成发现交人：属于对外动作的冲突 | 任务批注；运维特性批注 |
| 完成门禁 | 有缺口 | 工具错误列出缺口 | — | 主 Agent 按缺口做 | 主 Agent 会话 |
| `await_human` | id 不是等人的待决 | `invalid` | — | 改参数 | — |
| goal 恢复 | `/graph-apply` 里 `resume` 抛错（轮次用尽等） | 结果行注明 | — | 人发 `/drive` | 命令流节点 |
| 空转、轮次上限 | 3 拍没进展；`round-limit` | 内存计数；`goal/changed` | — | goal 阻塞，复盘，人 `/drive` | 复盘节点；goal 事件 |
| 宿主重启 | worker、审查、门禁、等待中的请求都丢 | 主 Agent 第一次走步时对账 | — | §3.9.6：能从会话推出的交回照常处理，推不出的列为丢失，等主 Agent 重新派发 | 批注「丢失」；复盘 |
| 定时提醒 | 宿主不在、投递失败 | 下次巡检发现间隔超过 26 小时 | DSH 不自动补 | 报「漏跑」 | 运维特性批注 |
| 主干检查 | 主干变红 | 夜间巡检 | — | 复盘；主 Agent 派修复任务 | 运维特性批注；复盘 |
| 规则板排队 | 派发或主干检查被推迟 | `deferred` 与等待单 id | 规则板解除时它通知原 agent（规则板设计 §6.3） | 主 Agent 先做别的 | 规则板的流水 |

### 6.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 快进主干 | 主干前进 | 只在门禁全部通过之后；`--ff-only`；一次一个提交；可以 `git revert` |
| 推送 | 对外 | 不强推；只在规范写了 `push` 时；`docs/ORCHESTRATION.md` §2.9.1 把推送排除在必须问人的类别之外 |
| 门禁工作树的 `reset --hard`、`clean -fd` | 丢这个目录里的改动 | 只对 `.worktrees/hz-gate`，执行前核对它在 `git worktree list` 里且是分离头指针；它只由 harness 写 |
| 删工作树与分支 | 丢没提交的工作；丢合入之后的新提交 | 工作树只在干净时删，不带 `--force`；分支只删「已合入」的（尾注 `Hourness-Branch-Tip` 等于分支头，且没有工作树检出它），用 `git update-ref -d refs/heads/<分支> <记下的头>`，分支头一变 git 就拒绝；重开时旧分支改名保留，不删 |
| 门禁锁的失效判定 | 误判失效会让两个门禁同时用门禁工作树 | 只在 pid 不在或开机时刻不同时判失效；失效的锁改名保留，不删；第 9 步的 `--ff-only` 仍保证主干只被快进一次 |
| 主检出有人的未提交改动 | 快进可能覆盖 | `--ff-only` 碰到会被覆盖的文件时 git 自己拒绝，门禁报 `main_dirty`，不做别的 |
| 写 `.git/info/exclude` | 改本地 git 配置 | 只追加一行 `/.worktrees/`，先查是否已忽略 |

### 6.4 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `dispatch_task.id` | 是 | 节点 id 格式，图里的任务 | `invalid`、`not_found`、`bad_task` |
| `dispatch_task.context` | 否 | 至多 4000 字符 | `invalid` |
| `dispatch_task.quick` | 否 | 布尔；条件见 §3.3.1 | `invalid` |
| `answer_worker.request` | 是 | `R-` 加 6 位，是等待中的请求 | `not_found`（已超时或已回应，`hint` 写当时的结果） |
| `answer_worker.verdict` | 计划请求必填 | `approve`、`revise` | `invalid` |
| `answer_worker.text` | `revise` 与问题必填 | 1–4000 字符 | `invalid` |
| `merge_task.id` | 是 | 图里的任务 | 同上 |
| `await_human.questions` | 是 | 1–20 个，每个是目标子树里等人的待决 | `invalid`，列出不合格的 id |
| `await_human.summary` | 是 | 1–500 字符，单行化 | `invalid` |
| `submit_plan.steps` | 是 | 1–12 步，字段见 §3.3.2；路径写法同 `writeScope` | 工具错误，逐条列出 |
| `ask_main.question`、`assumption` | 是 | 各 1–2000 字符 | `invalid` |
| `ask_main.options` | 否 | 至多 4 个，各至多 200 字符 | `invalid` |
| 交回结构 | — | DSH 按 schema 校验（subagent:941–948）；harness 再查提交号与路径 | 不合格的项记进批注，不丢整份 |
| 审查结论 | — | 同上；`criterion` 按 §3.7.2 规整 | 规整，不拒绝 |
| `norm-merge-gate` 的条目 | — | §3.8.1 的五种写法；其余是说明 | 一条命令都没有时 `no_gate_norm` |
| `/drive`、`/patrol` 的输入 | 否 | `stop`；`on`、`off`、`status` | error 行 |
| 运维行配置 `times.morning`、`times.patrol`、`times.weekly` | 否 | `HH:mm`，24 小时制（`^([01]\d\|2[0-3]):[0-5]\d$`） | 用默认值，行健康注明哪一项被忽略 |
| harness 待决的回写标签 | — | 只认第一条历史为 `harness` 的待决；动作只有 `drop <父任务>`、`stage <所在目标> design` | 其他写法与对象不执行，结果行注明 |
| 规范节点的标签 | — | §3.12.1 | 缺 `规则：` 的不进阶梯 |
| 七个工具的其他字段 | 不收 | — | `invalid`（rc.3 不校验原样注册的工具参数，工具体自己查，同图工具） |

### 6.5 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 主 Agent 不写文件、不改分支 | 执行边界：M3 的 `main-agent-no-write`、本稿的 `main-agent-no-git-write`；工具面没有写工具（question-26 C） | 违规硬拒，不靠自觉（`docs/CHARTER.md` §6） |
| 主 Agent 会话里只有派发出去的 worker 能写，只写自己的工作树、范围与已批计划之内 | 执行边界：`worker-scope`、`dispatch-chain-readonly` | 同上；子 agent 的工具面与父相同（`docs/ORCHESTRATION.md` §3.2），只能在执行边界拦 |
| 主干只经汇合门禁前进 | 门禁（`--ff-only`、尾注）；执行边界（主 Agent 的 git 写被拒）；巡检（主干上没有尾注的提交） | 预防加发现 |
| 合入的改动不出写入范围 | 门禁第 4 步（git 核对，不信写入门禁） | 启发式的判写有缺口（M3 §10），在合入处兜住 |
| 审查过的就是合入的 | 门禁第 7 步的 patch-id | 基线变动可能改变改动的内容 |
| 简报过期不合入 | pins（纯函数，宿主各处与门禁共用一份） | K5 |
| 目标完成要 harness 的证据 | 完成门禁（`tools/pre-execute`）；`goalCompletion` 只认 `actor: harness` 的证据 | K2；LLM 自己标完成的写任务不算合入 |
| goal 只由人发起与恢复 | `/drive` 是斜杠命令；`/graph-apply` 的恢复只在人拍板之后 | 服务层不查授权（goal:635–650） |
| worker 不写图 | 执行边界：`worker-graph-readonly` | 规划状态只有主 Agent 与 harness 写 |
| harness 给人的待决推荐项在最后、带选项卡字段、每周至多 3 张规范提议 | 唯一的生成函数 `questions.ts`（`review.ts`、`gate.ts`、`ladder.ts` 都调它）；引擎的推荐位置核对（`recommend-last`）与卡片字段核对（合入之后） | `d-recommend-last`、`d-option-card`；人的负担。生成处只有一个，卡片规则一改只改一处 |
| 停下之后、人拍板之前任务不再派发 | 图上的停下标记（简报门禁与汇合门禁读它）；写不进图时的 `ctx.stopped` | `d-failure-plans`：必须改的条数不降就停下交人，这件事不能只靠一张可能写不进去的待决 |
| 写权限只给本进程派发出去、仍活着的激活 | 登记表（`attempts.ts`）；`worker-message-live-only` | 冷恢复与同名 id 拿不到写权限（§3.1.4） |
| 图上的目标完成只对应门禁放行的那次 `complete` | 放行凭据与 `goal/changed` 的配对（§3.9.3） | K2：harness 写的证据要有 harness 自己的依据 |
| 门禁的破坏性 git 命令只作用于门禁工作树，同一时间只有一个使用者 | `git.ts` 的门禁工作树守卫；`gate-lock.ts` 的锁 | §6.3 |

### 6.6 可测性

纯函数在 L2 直接测：`pins`、`staleness`、`scope.within` 与 `overlaps`、`briefGate`（含停下标记的设与解）、简报渲染（长度上限与裁剪顺序）、`checkPlan`、计划一节的渲染与摘要、`normalizeVerdict` 与收敛判定、`harnessQuestion` 的每种模板（标签长度、后果一行、推荐在最后、卡片字段齐全、回写标签）、回写标签的解析与对象核对、`parseGateNorm`（含 `setup $ … when`）、`derivedStage`、`goalCompletion`（git 事实由参数给，含验收审查批注的读取）、`modelReminder`、`times.*` 到 `daily`、`weekly` 请求的映射、`fourAnswers`、`weeklyReport`、`ladderProposals`、`dora`、人的负担四项、`childId` 的编码与解码。

git 操作在 L2 用临时目录里的真实 git 仓库测（`docs/DEVELOPMENT.md` §1 允许 mock 文件系统，这里用真实的临时仓库更接近事故）：建工作树与分支、复用、`.git/info/exclude`、改动清单与范围、压缩合并与冲突、patch-id 在无关的基线前进后不变、在相关的基线前进后改变、`--ff-only` 在主干前进时失败、主检出有挡路的改动时失败、门禁工作树守卫拒绝别的目录、删工作树只删干净的、压缩合入后 `update-ref -d` 按记下的头删分支（分支头变了被拒）、重开时旧分支改名并从基线新建、监视文件变了重跑准备命令。门禁锁用临时目录测：独占创建、同进程排队、假的失效锁（不存在的 pid、不同的开机时刻）被改名、活着的锁让第二个持有者等待并超时。命令执行器可注入，L2 用假命令（`node -e "process.exit(1)"`）测失败、超时与进程树结束。

宿主侧在假宿主 `tests/fake-rc3.ts` 上测，假宿主为此补 rc.3 的这些信号：`subagents.startActivation` 按 `delivery` 区分（`caller` 时不送结算通知），`result` 带 `stopReason` 与 `structured`；`registerProvider` 与外部激活；`resolveMaxDepth`；`sendMessage` 只认直接父子；`interrupt`；`goals` 的各操作与阶段规则、`goal/changed`（载荷 `{change: {operation, ref, goal?}}`）；`schedule.create`（`daily`、`weekly` 的确切键与时刻格式）、`list`、`delete`；`sendMessage` 对不常驻的子 agent 冷恢复（恢复出的激活不带 `outputSchema`）；`sessionQuery.observeSession` 返回投影值；工具调用期间长时间 `await`（`submit_plan`、`ask_main`）。不 mock 契约本身之外的东西。真实组合里的派发、计划等待、通信、门禁 provider、驱动循环与完成门禁在 L3 探针里测（§9.1）；面板、流程条与冷会话的定时提醒要 L4。

### 6.7 行健康

`HOURNESS_ROWS` 在 `design`（与 `rules`）之后加 `execute`、`operate`，都按会话上报。

| 行 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- |
| execute | 主 Agent 会话：派发、写入门禁、门禁与完成门禁可用；写明在跑的 worker 数、槽位、门禁方式（外部或同步）、档位映射 | 不是主 Agent（「先 /wish」）；没有 subagents（inactive）；没有 goals；门禁同步运行；这个 provider 没有档位映射；规则板不在（只用本行的槽位）；经验板块不在；派发批注写不进图；停下的待决或停下标记写不进图（列出任务）；登记表被重新导入后有失联的 worker；门禁锁被别的进程占着超过 60 分钟 |
| operate | 本会话是运维会话：三条提醒的下一次时刻、上次巡检时间 | 没有 schedule；本会话不是运维会话；上次巡检超过 26 小时 |

`/glm-status` 与 `/hourness-status`（split 第 4 步）都列出这两行。

## 7. 依赖

| 依赖 | 状态（2026-10-29） | M7 的用法 | 若形态有变 |
| --- | --- | --- | --- |
| split（question-17 B 的布局，附录 0.5） | 第 0–8 步已提交（`.worktrees/split` `54cec72`），评审已通过，等合入；它的 `scripts/preflight-bundle.mjs` 要求 `src/` 下每个目录都登记在 `scripts/packages.mjs`、登记的目录都存在（134–138 行），E0 因此排在它之后 | 两行登记在 `packages/hourness/cordis.patch.yml`；`scripts/packages.mjs`；公共库的 `installStepNotice`（`src/shared/step-notice.ts`）、工具名契约（`src/shared/tool-names.ts`）、计价服务（晨报的花费）、`/hourness-status`；`src/report/` | M7 从合入 split 之后的 main 开工；路径按那时的文件改 |
| M3（设计 0.4 与 §15 人定） | 第 1、2 步已在 main（`bf4d127`、`7aa8fe5`：`src/graph/stage.ts` 的 `effectiveStage`、`releaseSet`，`src/graph/main-agent.ts`），其余等 split | `isMainAgent`、`goalOf`、`effectiveStage`、`releaseSet`、`focusOf`、`digest-notice.ts`、`stage-notice.ts`、`main-agent-no-write`、`design-before-release`、`/graph-apply` 的回写、`commands.execute` 的探针 `line` 步与模拟人；question-26 C 的「主 Agent 工具面去掉写工具」由 M3 实现 | E1b 只依赖已在 main 的 `effectiveStage`；E4 起依赖 M3 合入；M7 改 M3 的三处（§2.1）：`design-before-release` 的放行一行改问执行服务；阶段提醒补三个推出的阶段与「没有 `norm-merge-gate` 时在设计阶段提议它」一句；`panel-row.ts` 的回写标签 |
| 选项卡表格版的引擎字段（`d-option-card`、`d-counter-line`） | 已定稿（2026-10-29 12:35），运行 `card-fields-table` 实现中，等 split 合入后合入；`m3-base-card` 的 `de0ccf6` 只作参考 | harness 待决的 `label`、`gain`、`cost`、`dimension`、`crux`、`verdict`、`weight`（§3.7.4） | 两者谁后合入谁改 `src/execute/questions.ts`；字段名或长度与 §3.7.4 不同时只改这一个文件 |
| `ablation`（已批准的任务，`question-30` B） | 排在 split 合入之后 | 标定运行目录移到系统临时目录、事后扫描、消融开关（§3.14.3、§3.14.4） | P4 排在它之后，改它改过的 `scripts/calibrate/run-calibrate.mjs`；开关与扫描结果的形状以它的实现为准 |
| 规则板（设计 0.1，评审中） | 设计中 | `glmHournessRules.admit({kind: 'dispatch', agent})`（规则板设计 §6.5）；租约 `dsh-desktop`、`dsh-profile:<名字>`（§8.3、§6.6）；重活排队（§7） | 规则板不在时 M7 只用本行的 `slots`，桌面版靠简报的约束与批次 L4；`admit` 的签名以规则板定稿为准，只改 `dispatch.ts` 一处 |
| M5 经验板块（`lessons`） | 已批准，未设计 | `glmHournessLessons.relevant`、`propose`；`LESSONS_TOOL_NAMES` | 没有服务时两处接缝空转并上报；名字与签名以 M5 定稿为准 |
| plain-ui | 设计中 | 晨报的用词；流程条显示推出的阶段；「主 Agent 用强一点的模型」的界面提醒 | 只影响文字 |
| M4 | 已批准 | 草稿区的检查（门禁第 6 条）、影子模式机制 | 在那之前不检查草稿区 |
| M6 | 6.1 已完成 | 积分口径（晨报的花费）；谷段排期（巡检时刻默认放在非高峰） | — |

## 8. 实施分解

分支 `m7`，工作树 `.worktrees/m7`。E0 从合入 split 之后的 main 建；E1a、E1b、E2、E3 从 E0 之后开工，不碰 M3 后续步骤的代码，可以在 M3 合入之前各开工作树做；E4 起要 M3 合入（见 §8.3）。每步一个提交，提交信息带节点 id，文档与代码同一提交（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`（L3，`docs/DEVELOPMENT.md` §1.1）。「今天必败」是这一步新增的检查在今天的代码上怎样失败。

### 8.1 骨架（E 步）

| 步 | 节点 | 内容 | 文件（只这些） | 层 | 今天必败 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- |
| E0 | m7-1 | 登记目录并放进第一个模块：`scripts/packages.mjs` 的 `hourness.src` 加 `execute`（不加行）；写入范围的纯函数（路径规整、包含、相交、改动清单是否在范围内）。`operate` 不在这一步登记：split 的 preflight 对登记了却不存在的目录报错（`scripts/preflight-bundle.mjs` 136–138 行），它随 P3 建目录时登记 | 改 `scripts/packages.mjs`；新建 `src/execute/scope.ts`、`tests/execute-scope.spec.ts` | L1、L2 | 导入失败；在 split 的 preflight 上，只建 `src/execute/` 不登记时报「belongs to no package」 | 否 |
| E1a | m7-1、m7-2 | 纯函数：pins、简报门禁与渲染（推出的阶段从 `ctx.stage` 传入，不导入 E1b）、计划核对与渲染、`childId` 编解码与登记表的纯部分 | 新建 `src/graph/pins.ts`、`src/execute/brief.ts`、`plan.ts`、`attempts.ts` 与各自的 `tests/execute-*.spec.ts`、`tests/graph-pins.spec.ts` | L1、L2 | 导入失败 | 否 |
| E1b | m7-4、m7-5、m7-3 | 纯函数：审查规整与收敛、门禁规范解析（含 `setup $ … when`）、推出的阶段与完成门禁（含验收审查批注的读取）、`modelReminder` | 新建 `src/execute/review.ts`、`gate-norm.ts`、`src/graph/execute-stage.ts`（只导入 main 上已有的 `src/graph/stage.ts` 的 `effectiveStage`）与测试 `tests/execute-review.spec.ts`、`execute-gate-norm.spec.ts`、`graph-execute-stage.spec.ts`；不改 M3 的文件 | L1、L2 | 导入失败；`derivedStage` 不存在 | 否 |
| E2 | m7-1 | 交回与审查的 schema；工具名契约；薄适配层的新服务类型 | 新建 `src/execute/schemas.ts`；改 `src/shared/tool-names.ts`、`src/shared/dsh-min.ts`、`tests/contracts.spec.ts` | L1、L2 | 契约测试断言常驻名单含 `dispatch_task` 失败 | 否 |
| E3 | m7-5 | git 执行器：工作树、改动清单、压缩、patch-id、快进、门禁工作树守卫、推送、按记下的头删分支与重开时改名、监视文件摘要；门禁锁 | 新建 `src/execute/git.ts`、`src/execute/gate-lock.ts`、`tests/execute-git.spec.ts`（临时仓库）、`tests/execute-gate-lock.spec.ts` | L2 | 导入失败 | 是（动主干与工作树） |
| E4 | m7-1 | 执行行、`dispatch_task`、档位映射、工作树建立与准备命令（含重开时的分支改名与监视文件）、登记表、工具面过滤、五条写入规则、行登记与行健康 | 新建 `src/execute/index.ts`、`dispatch.ts`、`src/guard/execute-rules.ts`；改 `src/guard/main-agent.ts`、`src/guard/shell.ts`（导出 `commandsAt`）、`src/workflow/index.ts`、`src/shared/health.ts`、`packages/hourness/cordis.patch.yml`、`scripts/packages.mjs`（加行）；测试 `tests/execute-dispatch.spec.ts`、`execute-guard.spec.ts`；探针场景 | L2、L3（`glm-exec-dispatch`、`non-glm-exec-dispatch`） | 没有 `dispatch_task`；假宿主上 worker 写范围外的文件被放行；主 Agent 的 `git merge` 被放行；主 Agent 对已结束 worker 的 `send_message` 被放行 | 是（guard 规则） |
| E5 | m7-1 | 计划与通信：`submit_plan`、`ask_main`、`answer_worker`、请求表、计划写进正文与批准批注 | 新建 `src/execute/requests.ts`；改 `src/execute/index.ts`；测试 `tests/execute-requests.spec.ts` | L2、L3（`glm-exec-plan`） | 假宿主上计划获批之后写入仍被拒（没有批准的路） | 是（决定写入门禁何时放行） |
| E6 | m7-4、m7-2 | 交回处理、自动审查、结论规整与收敛、停下标记与停下交人的待决（`harnessQuestion` 的全部模板）、经验接缝（无服务的路径） | 新建 `src/execute/handback.ts`、`src/execute/questions.ts`；改 `src/execute/index.ts`；测试 `tests/execute-handback.spec.ts`、`execute-review.spec.ts`、`execute-questions.spec.ts` | L2、L3（`glm-exec-review`） | 交回 `done` 之后没有审查任务；待决写入被引擎拒绝时第 4 轮照样派发 | 否 |
| E7 | m7-5 | 汇合门禁：门禁锁、执行、外部 provider、`merge_task`、审查通过后自动起、`result.json`、`Hourness-Branch-Tip` 尾注、门禁失败的停下标记 | 新建 `src/execute/gate.ts`、`gate-provider.ts`；改 `src/execute/index.ts`；测试 `tests/execute-gate.spec.ts` | L2、L3（`glm-exec-merge`） | 审查通过之后主干不前进 | 是（主干与推送） |
| E8 | m7-3 | 驱动循环：`/drive`、完成门禁与放行凭据、目标的验收审查激活、`await_human`、面板拍板后恢复与回写标签、空转阻塞、派发状态提醒、重启对账与 `hournessHandback` 投影；阶段提醒补三个推出的阶段与 `norm-merge-gate` 一句 | 新建 `src/execute/drive.ts`、`notice.ts`；改 `src/execute/index.ts`、`src/graph/panel-row.ts`、`src/design/stage-notice.ts`；测试 `tests/execute-drive.spec.ts`、`execute-reconcile.spec.ts` | L2、L3（`glm-exec-drive`） | `update_goal complete` 在缺证据时被放行；没有凭据的 `complete` 也写了完成证据 | 是（目标完成的门禁；`/graph-apply` 以人的身份写图的新入口） |
| E9 | m7 | 骨架端到端：L3 场景 `glm-exec-skeleton`；真实模型跑一次（§10.3）；合入 main，合入后的第一个提交把 `execute` 改为默认启用；批次 L4（§9.2） | 探针场景与文档 | L3、真实模型、L4 | — | — |
| H1 | dogfood | 本仓库专用：`npm run probe` 在 git 工作树里自动建指向这个工作树的临时 profile（`DSH_SANDBOX_PROFILE`），用完删除 | 改 `scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs`；`docs/DEVELOPMENT.md` §3 | L3（探针自身在工作树里跑一遍） | 在工作树里跑探针加载的是主检出的 `dist`（`docs/DEVELOPMENT.md` §3 的现状） | 否 |

### 8.2 骨架之后（P 步）

| 步 | 节点 | 内容 | 文件 | 层 | 今天必败 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | m7-2 | 并行派发：规则板 `admit`、补位提醒、两路 worker 的 L3 | 改 `src/execute/dispatch.ts`、`notice.ts`；测试 | L2、L3（`glm-exec-parallel`） | 有空槽与可开工的任务时没有补位提醒 | 否 |
| P2 | m7-6、m7-8、m7-9 | 四答晨报、人的负担、DORA、周报、规范阶梯 | 新建 `src/report/four-answers.ts`、`metrics.ts`、`weekly.ts`、`ladder.ts`；改 `src/workflow/morning-report.ts`、`src/report/index.ts`；测试 | L2 | 今天的晨报没有「目标」一节 | 否 |
| P3 | m7-7 | 运维行：`/patrol`、`hourness_report`、定时提醒、巡检、夜间主干检查、清理 | 新建 `src/operate/index.ts`、`patrol.ts`；改 `src/shared/health.ts`、`packages/hourness/cordis.patch.yml`、`scripts/packages.mjs`；测试 | L2、L3（`glm-operate-patrol`）；L4（冷会话投递） | 没有 `/patrol` | 否 |
| P4 | m7-10 | 标定（`ablation` 不做的部分）：读圈禁、`task.json` 的 `set`、`origin`、`isolation`、`result.json` 的 `env`、`infra`、`valid`（取 `ablation` 的扫描结论）、pass^k、按集分开的汇总；`docs/ORCHESTRATION.md` §10.5 改写角色 | 新建 `scripts/calibrate/read-fence.mjs`；改 `scripts/calibrate/run-calibrate.mjs`、`tests/calibration/*/task.json`、`tests/calibration/lib.mjs`；测试 `tests/calibrate-fence.spec.ts` | L2；L3（探针场景 `calib-fence`：脚本化模型读 `ws/` 以外被拒、这次运行 `valid: false`）；标定运行按 §12 的时机 | 读 `ws/` 以外的文件被放行 | 否 |
| P5 | dogfood | 复盘节点的生成 | 新建 `src/execute/retro.ts`；改 `handback.ts`、`gate.ts`、`drive.ts`、`requests.ts` 的调用处 | L2 | 审查不收敛时图上没有复盘节点 | 否 |
| P6 | m7-2 | 经验板块接上 M5 的服务与查询工具 | 改 `src/execute/brief.ts`、`handback.ts` 的服务读取（若 M5 的签名与占位不同） | L2、L3 | — | 否 |

### 8.3 先后与并行线

question-28 C：没有副作用的就并行；改同一批文件或要桌面版的排队。

- E0 先做（split 合入之后，一个小提交）：它是唯一在 E 步开头改 `scripts/packages.mjs` 的。M3 后续步骤登记 `src/design/` 时也改这个文件，两者谁先合入谁先改，后者 rebase。
- 线 A：E1a。线 B：E1b。线 C：E2。线 D：E3。都从 E0 之后开工，只建新文件或各改不同的文件：E1a 与 E1b 各自的新文件不相交（`brief.ts` 从 `ctx.stage` 拿推出的阶段，不导入 E1b 的 `execute-stage.ts`）；E1b 只导入 main 上已有的 `src/graph/stage.ts`，不改它；E2 是唯一改 `src/shared/tool-names.ts`、`dsh-min.ts` 与 `tests/contracts.spec.ts` 的；E3 只建 `git.ts`、`gate-lock.ts` 与它们的测试。四条线谁都不改 `scripts/packages.mjs`。
- 线 H：H1，只改 `scripts/sandbox.mjs` 与 `scripts/probe/run-probe.mjs`。规则板的 R5 也改 `scripts/sandbox.mjs`：两者谁先合入谁先改，后者 rebase。
- 线 P4：只改 `scripts/calibrate/` 与 `tests/calibration/`，不依赖 M7 的任何代码；但 `ablation` 也改 `scripts/calibrate/`（含 `run-calibrate.mjs`），所以 P4 等 `ablation` 合入之后再开工，之后与 E 步、P 步都并行。
- E4 → E5 → E6 → E7 → E8 → E9 依次做：它们都改 `src/execute/index.ts`，后一步用前一步的行为。E4 等 E1a、E2 完成与 M3 合入；E6 等 E1b；E7 等 E1b、E3；E8 等 E1b。E6 与选项卡字段的改动（`card-fields-table`）谁后合入谁改 `questions.ts`（§3.7.4）。
- 骨架之后：P1（`dispatch.ts`、`notice.ts`）、P2（`src/report/`、`src/workflow/morning-report.ts`）、P5（`retro.ts` 与四个调用处）三条文件不相交，可以并行；P3 等 P2；P6 等 M5。P1 与 P3 都动登记文件吗：P1 不动，P3 动 `cordis.patch.yml` 与 `packages.mjs`，与规则板、M5 的登记先合入的先改。
- 要桌面版的只有 E9 与 P3 的 L4：攒成两个批次（§9.2）。按 `risk-shared-desktop` 的常设授权（用户 2026-10-29「dsh我现在不用，你以后直接用就行了」），用桌面版不再问人；编排方在运行之间排队，同一时间一个持有者，人说自己要用时停下。

每步同批改的文档：E4：`docs/ORCHESTRATION.md` §3（派发不再是规划）、§3.2、§3.5、§6.4（五条规矩）、`docs/DESIGN.md` §2.2 行表、§2.4a 接口对照表（§4 的「新用」各行）、§2.5、§7；E5：`docs/ORCHESTRATION.md` §3.3；E6：§3.4；E7：§4.7、§14；E8：§2.1、§4.6、§4.8；E9：`docs/ROADMAP.md` 核实清单第 4、4b、12 项改为桌面版组合已核实；P2：§9.2、§10、§12；P3：§12、§11.4；P4：§10.5、`docs/DEVELOPMENT.md` §3。

## 9. 验证

### 9.1 L3 探针场景

都用 `probe-full`（GLM 探针模型）除非另写，工作区是运行目录下的临时 git 仓库，图是预置的副本（已放行的目标、带派发属性的任务、`norm-merge-gate` 的命令是 `node -e` 写的快速假命令），主 Agent 模式由 M3 的模拟人在 `agent/created` 时发 `/wish` 开启，会话中途的命令经 M3 的 `line` 步发出。子 agent 按派发次序取探针 provider 的 `others` 脚本。

| 场景 | 核对 |
| --- | --- |
| `glm-exec-dispatch` | `dispatch_task` 当场返回 `childId`，主 Agent 在 worker 第一次请求之前又走一步；worker 的请求记录里模型是 `simple` 档的模型（任务 `tier: simple`）、工作目录是 `.worktrees/hz-<id>`；worker 的首条消息是简报，没有 DSH 的 `send_message` 交回指引（U1）；quick 任务里范围内的 `Write` 执行、范围外与工作树外的被拒并进违规流水；worker 的 `graph_status` 被拒、`graph_comment` 执行；主 Agent 用原生 `subagent` 派出的子 agent 的 `Write` 被拒；主 Agent 的 `Bash git merge hz/x` 被拒；worker 交回后主 Agent 收到一条 `glm-hourness-execute` 通知，没有 DSH 的结算通知 |
| `non-glm-exec-dispatch` | 同上，非 GLM 探针模型，工具名是原生名（G3） |
| `glm-exec-plan` | 非 quick 任务：计划获批之前的 `Write` 被拒；不合格的 `submit_plan` 当场得到错误、主 Agent 的请求里没有通知；合格的计划写进任务正文、主 Agent 下一步有通知；`answer_worker approve` 之后 worker 的调用返回 `approved`、`Write` 执行、任务上有批准批注；`ask_main` → 通知 → `answer_worker` → worker 的同一次调用拿到回答；主 Agent `send_message` 给 worker，worker 下一步的消息里有来源 `agent-message` 的这条（U3）；第二个 worker 对第一个 `send_message` 得到 `UNAUTHORIZED` |
| `glm-exec-review` | worker 交回 `done` 后图上出现审查任务（`kind: review`、写入范围为空、状态已批准），审查者的模型高一档；审查者交回一条 `criterion` 不合格的挡路发现与一条合格的：前者被改为不挡路；第 2 轮挡路数不降时轮次批注带 `· 停下`，并出一张人的待决（推荐项在最后，带选项卡字段），之后 `dispatch_task` 这个任务得到 `waiting_human`；`line` 步以人的身份拍板之后，派发放行。待决写入被拒的一支在 L2 测：交回处理的图写入可注入，让待决的提议返回引擎的 `invalid`，停下标记照样让简报门禁得到 `waiting_human`，行健康为 degraded |
| `glm-exec-merge` | 审查通过之后门禁作为外部激活起来（U2），驱动器等它（本场景同时有一个 goal）；门禁跑假命令、在门禁工作树里压缩、在主检出里快进；主干多一个带 `Hourness-Task` 与 `Hourness-Branch-Tip` 尾注的提交；任务完成，带 harness 的 `commit` 与 `test` 证据；`result.json` 在；门禁运行期间公共 git 目录下有 `hourness-gate.lock`，结束后没有；另一次运行让一条命令失败：主干不变，任务上有失败批注；任务重开后再 `dispatch_task`：旧分支改名为 `hz/<id>@1`，新的 `hz/<id>` 从当前基线建出 |
| `glm-exec-drive` | 第二个根 agent 承载主 Agent 与 goal（`docs/ORCHESTRATION.md` §2.1 的探针做法）；`/drive` 经 `line` 步发出，goal 建立，目标原文含验收条件；缺证据时 `update_goal complete` 被拒、goal 仍 active；`await_human` 让 goal 阻塞、原因码 `hourness-waiting-human`；`line` 步发 `/graph-apply decide` 之后 goal 恢复（U12）；脚本连续 3 拍只读，goal 以 `hourness-idle-rounds` 阻塞；`/wish off` 之后的 `update_goal complete` 不写图上的完成证据，目标上出现「goal 在完成门禁之外完成」；主 Agent 对已结束的 worker 调 `send_message` 被拒 |
| `glm-exec-skeleton` | 一个脚本化的完整链条：派发 → 计划 → 批准 → 写与提交 → 交回 → 审查 → 门禁 → 合入 → 验收审查（harness 起的激活，目标下没有新节点，目标上有轮次批注）→ `update_goal complete` 放行 → 图上目标完成。全程模拟人只在 `/wish`、访谈确认与放行时出手（`d-plan-approval`）；`norm-merge-gate` 在设计阶段由主 Agent 提议、随放行一起批准 |
| `glm-exec-parallel`（P1） | 两个写入范围不相交的任务同时在跑；第三个相交的被 `scope_busy` 拒；一个交回后主 Agent 下一步有补位提醒，再下一步没有 |
| `glm-operate-patrol`（P3） | `/patrol on` 之后 `schedule.list({sessionId})` 有三条（时刻 `HH:mm:00`、本机时区、周报 `weekdays: [1]`）；`hourness_report {kind: 'patrol'}` 删掉一个已完成任务的干净工作树、报出一个不干净的；删掉一个已合入超过 14 天的分支（场景里把时钟拨后），留下一个合入之后又有提交的分支；门禁锁被占时主干检查记「跳过」 |
| `calib-fence`（P4） | 标定覆盖层里脚本化的模型读 `ws/` 以外的文件被拒、`fence.jsonl` 有记录；这次运行的 `valid` 为 `false`，不进汇总 |

这些场景不花积分。合入 main 之前全部探针一次通过。

### 9.2 批次 L4

第一批在 E9（骨架合入、`execute` 默认启用、主检出重建之后），第二批在 P1–P3 合入之后。桌面版按 `risk-shared-desktop` 的常设授权直接用，不另约人的时段；编排方在运行之间排队，同一时间一个持有者；合入与重建时桌面版关着（M3 §9.3 的做法）。在主检出 `.llm/` 下建一个临时工作区（一个很小的 Node 项目、一个 git 仓库、空的 `docs/graph/`），不写本仓库的图：

1. GLM-5.3 会话 `/wish` 一句话需求，走访谈、放行（M3）；主 Agent 在设计阶段提议 `norm-merge-gate`（命令 `node --test`），随放行一起被批准。
2. `/drive`：goal 出现在 DSH 的目标条上；主 Agent 派一个 worker（任务没写档位，默认 `simple`，即 GLM-5.3-Flash）；面板「正在做」里 worker 站在任务上。
3. 计划写进任务正文，面板的节点详情看得到；主 Agent 批准之后 worker 写文件。
4. 审查、门禁、合入：临时工作区的 `main` 多一个带尾注的提交；面板上任务转为完成。
5. 完成门禁放行，图上的目标转为完成，DSH 的 goal 收尾。
6. 再起一个任务，面板上点「暂停」或 `/drive stop`：worker 停下，任务上有「第 n 次被中断」。
7. DeepSeek 会话里同样派一次（G3）。
8. 第二批另核：`/patrol on`、关掉运维会话所在的标签页后等一条定时提醒投递（核实清单第 17 项）；晨报的四答。
9. 桌面版日志没有本包的新错误；用过模型菜单就换回 `agent-default-model`（`docs/HANDOFF.md`）。

## 10. 最薄端到端骨架（`dogfood` 的起点）

### 10.1 骨架包含什么

`/wish` → 访谈 → 放行（M3）→ `/drive` → `dispatch_task` 一个写任务（简报门禁、工作树、档位、写入门禁）→ `submit_plan` 与 `answer_worker`（计划审批）→ worker 写、提交、交回 → 自动审查（规整与收敛）→ 汇合门禁（外部 provider、门禁锁、压缩、`norm-merge-gate` 的命令、快进、证据）→ 目标的验收审查（harness 起的只读激活，结论批注在目标上，不建节点）→ 完成门禁（放行凭据）→ 目标完成。重启对账、空转阻塞与 `await_human` 在骨架里（E8），因为没有它们，自举中的一次重启或一次等人就会让驱动循环卡住或空转。人在骨架里只出现三次：`/wish`、访谈确认、设计放行（`norm-merge-gate` 在设计阶段提出，随放行批准）；之后 `/drive` 是人发起的一条命令，其余都由主 Agent 与 harness 做。

实施上是 E0、E1a、E1b、E2、E3、E4、E5、E6、E7、E8、E9，加本仓库专用的 H1。

### 10.2 骨架不包含什么

并行派发的规则板接入与补位提醒（P1；骨架里 `slots` 照常生效、写入范围相交照常拒绝，只是没有补位提醒）；四答晨报、周报、规范阶梯、DORA（P2）；巡检与运维会话（P3；骨架期间已合入分支的清理与主干检查不跑，分支留着无害）；标定的回归集与读圈禁（P4，等 `ablation` 合入，与骨架并行）；复盘节点的自动生成（P5；骨架期间由编排者手记）；经验板块（P6，等 M5）。

### 10.3 骨架的验收与 dogfood 的开始条件

1. 第 §9.1 的骨架场景全部通过（L3）。
2. 真实模型跑一次：在运行目录的临时仓库里，用 headless 加探针的「第二个根 agent」做法（`docs/ORCHESTRATION.md` §2.1），主 Agent 用 GLM-5.3、worker 用 GLM-5.3-Flash，从已放行的目标起跑到目标完成，记下步数、积分、被拦次数、问答次数。这一次花积分，按 `norm-decision-tiers` 的常设授权（为验证花的积分不逐次问人），花费进晨报；作为骨架的一次性验收，不算定期标定。
3. 第一批 L4 通过（§9.2）。
4. 本仓库的 `norm-merge-gate` 由人批准（§14），H1 已合入。
5. 桌面版里主 Agent 用 GLM-5.3（强一档），worker 的任务不写档位，按默认的 `simple` 档用 GLM-5.3-Flash（§3.1.3），审查高一档用 GLM-5.3。

满足之后，编排者把本仓库的下一件实现任务（建议 P2，文件与别的线不相交）交给 DSH 里的主 Agent 做，Kiro 只观察；卡住、返工、要人救场的地方记成节点（`dogfood` 的验收），P5 合入之后由 harness 自动记。

## 11. 不做的事

- 规则板本身（信号、租约、预算、检测器）：规则板设计。M7 只调它的 `admit`。
- 经验板块的存储、去重、面板与命令失败时的匹配推送：M5 的 `lessons`。
- 真实项目试用的安装、匿名化导出与反馈回收：`field-trial`。M7 只定复盘节点的格式。
- 知识同步的机械检查（改了代码是否同批改了文档或节点）：由审查者核对；harness 侧等有了可靠的「代码 → 文档」对应关系再做。
- 草稿区的检查：等 M4 定草稿区。
- 晨报的回合末尾卡片、「讲细点 / 说重点」按钮、流程页：M8。
- 逐 token 的 agent 间对话；worker 之间直接通信。
- 用 `send_message` 唤醒被中断的 worker 继续做（改用重新派发，§3.4.2）。
- 自动切换模型或套餐；预算与按次计费上限（`docs/ORCHESTRATION.md` §4.3 的定案；花费只披露）。
- 标定运行目录移出仓库、事后扫描、消融开关：归已批准的任务 `ablation`，M7 只用它们（§3.14.3）。
- 改图引擎的权限与节点字段（选项卡字段由 M3 的那一步加，M7 只按它生成）。
- 跨仓库、跨机器的派发。

## 12. 由 agent 定、人可推翻的事项

命名：行 `glm-hourness/execute`、`glm-hourness/operate`；目录 `src/execute/`、`src/operate/`；工具 `dispatch_task`、`answer_worker`、`merge_task`、`await_human`、`hourness_report`、`submit_plan`、`ask_main`；命令 `/drive`、`/patrol`；规则 `worker-scope`、`dispatch-chain-readonly`、`worker-graph-readonly`、`main-agent-no-git-write`、`worker-message-live-only`；provider `hourness-gate`；投影 `hournessHandback`；notice 来源 `glm-hourness-execute`；schema `hourness-handback-v1`、`hourness-review-v1`；规范节点 `norm-merge-gate`；工作树 `.worktrees/hz-<id>`、分支 `hz/<id>`、重开后保留的旧分支 `hz/<id>@<n>`、门禁工作树 `.worktrees/hz-gate`；门禁锁 `<公共 git 目录>/hourness-gate.lock`；验收审查的 `childId` `hz-<目标>-acc-a<k>-<6 位>`；停下标记 `· 停下`；goal 阻塞码 `hourness-waiting-human`、`hourness-idle-rounds`；提交尾注 `Hourness-Task`、`Hourness-Attempt`、`Hourness-Branch-Tip`。

做法（每项写了选它的理由与没选的做法）：

- 执行阶段推出、不存：已批准的目标 LLM 与 harness 改不了，存阶段就要改引擎权限；推出的阶段与图同步，不会走样。没选：引擎放开 harness 写 `stage`。
- 派发用 `delivery: 'caller'`：避免同一份交回进主 Agent 上下文两次（§3.1.2）。没选：`parent`（保留为退路）。
- 写任务一律用工作树，`worktree: false` 拒绝：汇合门禁要一个分支来核对与压缩。没选：允许直接写主检出（绕过门禁）。
- 计划写在任务正文、批准记成批注：图停在意图层，计划的步不是可派发的叶子（`docs/CHARTER.md` §2「图要小」）。没选：每步一个子节点（图膨胀，引擎会把子节点直接批准，表达不了「待主 Agent 审」）。
- 计划审批的等待放在 worker 的一次工具调用里：有 `outputSchema` 的 worker 停下回合会被结算为 `error`（§3.4.2）。没选：worker 结束回合等消息。
- worker 的问题用 `ask_main`，主 Agent 改方向用原生 `send_message`：前者要等回答、要能超时，后者只投递。没选：双向都用 `send_message`（等不了回答）；双向都用新工具（重复 DSH 已有的通道）。
- 审查自动派出、审查通过自动起门禁：这两步是机械的，交给主 Agent 只是多一次往返；修复由主 Agent 决定是否派，因为发现可能意味着改设计。没选：全由主 Agent 派（主 Agent 的上下文与回合更多）；修复也自动派（发现指向设计问题时会白修）。
- 审查的档位高一档：降低同模型的共错（阅读摘要第 13 条）。没选：同档。
- 门禁作为外部后端的子 agent 运行：驱动器认得它、人能停它（§3.8.2）。没选：主 Agent 工具调用里同步跑（保留为退路）；宿主后台 promise（驱动器空转）。
- 门禁自己跑命令、压缩成一个提交、只快进：证据由 harness 产生（K2），一件事一个提交（`docs/DEVELOPMENT.md` §9），主干只在门禁之后前进。没选：worker 自报测试结果；普通合并提交（主干历史多一层，审查对应的改动更难核对）。
- 门禁通过后推送（规范写了 `push` 时）：推送不在必须问人的类别里（`docs/ORCHESTRATION.md` §2.9.1 第 3 类明写「推送以外」），本仓库的规矩是推到 `origin/main`（`AGENTS.md` 第 7 条）。没选：推送留给人。
- 门禁命令写在规范节点的验收条件里：改松要人批，图是规则的单一事实源。没选：行配置（按 profile 而不是按项目）；仓库里的工具专用配置文件（`docs/CHARTER.md` §7.1 条款 10）。
- pins 只比语义字段：减少误拒（§3.5.3）。没选：节点修订号。
- worker 对图只读：规划状态只有两个写入方。没选：worker 可以提任务与待决（与主 Agent 争修订号，绕过计划外变更的门禁）。
- 主 Agent 的 git 写命令被拒：合入只经门禁。没选：只靠身份文本。
- 人拍完等人的待决后自动恢复 goal：触发它的是人的动作，省人一次 `/drive`。没选：人每次都发 `/drive`。
- 空转 3 拍阻塞：比轮次上限（500）早得多地发现空转。没选：只靠轮次上限。
- 规范阶梯的提议走决策队列，不用五键卡：五键只在设计阶段（`docs/ORCHESTRATION.md` §4.4），与 §9.2「人用五键拍板」的冲突按此裁决，同批改写 §9.2。
- 经验查询工具在 GLM 路由上常驻：人要求子 agent 能主动查（§2.3.2）；由 `prompt-audit` 的消融复核。没选：延迟（更省前缀，但卡住时更少被想起）。
- `send_message`、`interrupt_agent` 在 GLM 路由上保持延迟：使用频率低。
- 标定回归与消融的时机：每个 L4 批次跑一遍回归集；这一批新加的提示词节与每步注入各做一次消融（用 `ablation` 的开关关掉那一段对比）；guard 规则面变大的批次（例如 G3 合入）加跑一组非 GLM 路由。花费进晨报的「花费」一节，不逐次问人：`norm-decision-tiers` 的常设授权（用户 2026-10-29「积分你随便用，我积分多没事」）已把为验证花的积分移出人的队列。没选：每次改提示词都跑（回退当次就发现，但改动密集时一周上千积分，信号多是噪声）；只在 DSH 升级时跑（几乎不花，但回退要等自举撞上，难定位是哪次改动）。
- 目标的验收审查不建图节点，由 harness 起激活、结论批注在目标上：挂在目标下的任务提议要人批准（`initialStatus`），而不改引擎权限是本稿的前提。没选：M3 的放行卡固定带一个「验收」特性、审查任务挂在它下面（要改 M3 的放行集合，图上每个目标多一个只为挂审查而存在的节点）。
- 停下先写批注标记、再提待决：停下这个事实不能依赖一次可能被引擎拒绝的写入。没选：只靠待决（写不进去时第 4、5 轮照跑）。
- 实现、测试、文档任务默认 `simple` 档：贴合「便宜的去干活都行」，难的任务由主 Agent 写档位。没选：默认 `standard`（默认路径上 worker 与主 Agent 同一个模型，省不下钱，也与 §9.2 预期的 Flash worker 不一致）。
- 主 Agent 的模型提醒按「不是 provider 的强档」判断，没有映射时给通用提醒：用户要求「强提醒」，只对 GLM 的便宜档提醒会漏掉别的 provider。没选：只对 `simple` 档提醒。
- 分支按尾注 `Hourness-Branch-Tip` 判「已合入」，用 `update-ref -d <旧值>` 删：压缩合入之后 git 自己判断不了；按旧值删在分支有新提交时会被 git 拒绝，不会误删。没选：`git branch -D`（无条件删，可能丢合入之后的提交）；永不删（巡检每次都报，噪声）。
- 门禁锁放在公共 git 目录下的文件里：跨进程（headless、探针、第二个桌面版）都看得见，随仓库走；`.git` 下的文件不入库。没选：只在内存里互斥（巡检与别的进程不受约束）。
- 复盘节点由 harness 记事实、主 Agent 补判断：harness 判不了哪条是经验。
- 默认配置：`slots` 3；三条定时提醒 `08:30`、`02:30`、周一 `09:00`（注册为 `HH:mm:00`，本机时区）；门禁锁等待至多 60 分钟；`maxGoalRounds` 500；等待上限计划 30 分钟、问题 20 分钟；门禁每条命令 30 分钟；空转 3 拍。这些是常量或配置默认值，改它们不改设计。

## 13. 待人定的事项

每组选项恰有一个推荐，放在最后（`d-recommend-last`）。

只有一项。第一稿的 D2（标定花积分的时机）已被 `norm-decision-tiers` 的常设授权回答，改为 §12 里由 agent 定的一条。

### D1 M7 各任务节点的验收条件（决策分级第 1 类）

按 `d-option-card` 的表格版写，记图时照这一节的字段写（§14 第 1 条）。

题目：M7 的十个任务节点用什么验收条件？
背景：`m7` 还没有子任务，也没有验收条件；§1.2 写了每个条目的建议验收，每条都挂在 §9 的一个探针场景或 L2 测试上。验收只有人能写或批。
`weight`：`one-way`（改的是验收，`docs/ORCHESTRATION.md` §2.9.1 第 1 类；以后改起来很贵：写进节点之后再改要你出手）。
取决于（`crux`）：你对 §1.2 里 m7-5「合入后按规范自动推送」与 m7-10「标定集只做回归守门」这两条有保留吗？

| 选项 | 怎么做（`label`） | 得到（`gain`） | 代价（`cost`） |
| --- | --- | --- | --- |
| A | **你逐条改写验收** | 十条验收都按你的原话写 | 你要读 §1.2 的十行表并改写，骨架晚一轮开工 |
| B | **按 §1.2 原样写入** | 编排者把「建议验收」一列写进 `m7-1` 到 `m7-10`，`m7` 的验收写「最薄骨架在桌面版上对一个临时项目从 /wish 走到目标完成；之后本项目的开发改由它在 DSH 里做」，马上按 §8 开工 | 以后哪条不合适，要你在面板上改那一行 |

`verdict`：是 → A；否 → B。
`recommend`：B（排最后）。

## 14. 交给编排者记图的事项

本设计不写 `docs/graph/`。以下由编排者在人看过之后记到图上：

1. D1 提一张决定者为人的待决（挂 `m7`），题目、选项（`label`、`gain`、`cost`）、`crux`、`verdict`、`weight`、`recommend` 按 §13。表格版字段要等 `card-fields-table` 合入后引擎才认（之前写进节点文件会报「不是已知字段」，`src/graph/format.ts` 88 行）；在那之前按 §3.7.4 的过渡写法：`gain` 与 `cost` 合进选项的 `consequence`，「取决于」与「是 → A；否 → B」两行和 `weight` 写进正文，合入后再补字段。
2. D1 选 B 时，在 `m7` 下建 `m7-1` 到 `m7-10`，验收按 §1.2；把 `risk-calib-read` 的来源连到 `m7-10`，`m7-10` 加一条 `depends` 连线指向 `ablation`；`dogfood` 的正文补一句开始条件（§10.3）。
3. 提议规范节点 `norm-merge-gate`（本仓库的命令按 §3.8.1），由人批准；挂在 `orch` 下。这是本仓库的做法；别的项目里由主 Agent 在设计阶段提议、随放行批准（§3.8.1）。
4. 在 `m3` 上批注 M7 对 M3 的三处改动（`design-before-release` 放行一行改问执行服务；阶段提醒补三个推出的阶段与 `norm-merge-gate` 一句；`panel-row.ts` 的回写标签）。在 `d-option-card` 上批注 harness 待决的生成处是 `src/execute/questions.ts`，`card-fields-table` 若晚于 E6 合入，要在同一提交里改它。在 `ablation` 上批注 P4 排在它之后、要用它的扫描结论与开关状态。
5. 在 `rules` 上批注 M7 用到的接口（`admit({kind: 'dispatch', agent})`、`dsh-desktop` 与 `dsh-profile:<名字>` 租约），在 `lessons` 上批注两个接缝与查询工具的常驻（§3.5.5），在 `field-trial` 上批注复盘节点的格式（§3.15），在 `plain-ui` 的设计任务上批注推出的阶段与晨报的四答节名。
6. `docs/ORCHESTRATION.md` §9.2「人用五键拍板」与 §4.4 的冲突按 §12 裁决，记成一个决策节点（`docs/CHARTER.md` §7.2）。

## 15. 未核实的假设

| # | 假设 | 依据 | 在哪核实 | 不成立时 |
| --- | --- | --- | --- | --- |
| U1 | `delivery: 'caller'` 的 worker：首条消息不附 `send_message` 交回指引；父 agent 收不到结算通知；驱动器照样等它；`subagentCatalog` 照样有它 | subagent:1460–1465、2048–2063、1296–1330 | L3 `glm-exec-dispatch` | 改用 `parent`，简报写明结果只用 `structured_output` 交回（§3.1.2） |
| U2 | 第三方宿主插件能注册外部 provider；外部激活的 `result` 被驱动器等待；`caller` 模式下输出只到调用方 | subagent:3256–3267、1483–1520、1768–1790、1310–1313 | L3 `glm-exec-merge` | 门禁在 `merge_task` 里同步运行（§3.8.2） |
| U3 | 主 Agent 经 `send_message` 发给常驻 worker 的消息在 worker 的下一步到达；worker 正在一次长工具调用里时，在调用返回后的下一步到达 | subagent:1545–1549、2080–2117、2216–2231、1584–1590 | L3 `glm-exec-plan` | 改向改用中断加重新派发（§3.4.2 已是重大改向的正路） |
| U4 | 子 agent 一次工具调用 `await` 30 分钟不会被 DSH 的任何超时切断；人按停止时 `exec.signal` 中止它 | 读到的源码里没有工具执行的默认超时〔推断〕 | L3（缩短的等待）、L4 | 等待上限改小，超时路径不变 |
| U5 | 执行行在 `agent/created` 时装的组装监听器对子 agent 同样生效，能按角色过滤 worker 的工具面 | M3 §3.1.3 的同一做法；子 agent 经 agent 工厂创建 | L3 `glm-exec-dispatch` | 只靠工具体自查调用方（工具面里多几个工具，调用时被拒） |
| U6 | 工具调用与结果在会话事件里的形状能折叠出 `structured_output` 的参数；`sessionQuery.observeSession` 对冷会话返回第三方注册的投影值 | `assistant/message` 的形状见 subagent:986–990；`observeSession` 见 2339–2352 | L2（按 rc.3 的事件类型）、L3 | 对账只走「丢失」一支（§3.9.6 第 4 步），损失是重做一次 |
| U7 | 桌面版重启后，恢复出来的主 Agent 会话在第一次走步时触发执行行的监听器 | `agent/created` 对每个创建或恢复的 agent 派发（agent:574–589）〔推断〕 | L4 | `/drive` 时对账（人恢复驱动时一定发 `/drive`） |
| U8 | 冷会话（标签页关掉之后）收到定时提醒时，恢复出来的 agent 工具面齐全、执行行与运维行的监听器装上（字段形状已实读，见 §3.11.1 与 §4） | `docs/ROADMAP.md` 核实清单第 17 项 | L4 第二批 | 巡检改为人手动 `hourness_report`，晨报照常可用 |
| U9 | 几个工作树各用自己的临时 profile 时并行跑探针互不干扰 | 探针的数据目录都指向场景目录（`docs/DEVELOPMENT.md` §3）〔推断〕 | H1 的 L3 | 规则板的 `dsh-profile:<名字>` 租约之外再加一把整机的探针锁，探针串行 |
| U10 | `agentOptions.reasoningEffort` 在原生通道上生效 | subagent:1400–1404 读它；通道的思考档位见 `docs/DESIGN.md` §4.6 | L3（请求记录里的档位） | `hard` 档只换模型 |
| U11 | 桌面版运行期间在主检出上快进主干无害：桌面版加载的是 `dist`（不入库），快进只改源码 | `docs/DEVELOPMENT.md` §7 2026-10-28 的客户端半 404 事故是重建 `dist` 引起的〔推断〕 | L4 | 门禁快进之前取规则板的 `dsh-desktop` 租约，桌面版在用时排队 |
| U12 | 宿主命令处理函数（`/graph-apply`）里调 `goals.resume` 之后驱动器照常开下一拍 | goal:686–699；驱动器监听 `goal/changed`（goal-round-driver:240–246） | L3 `glm-exec-drive` | 恢复改为提醒人发 `/drive` |
| U13 | 插件管理器在同一进程里禁用再启用执行行时，模块级的登记表留着（不重新导入模块）；重新导入时登记表为空 | 〔推断〕cordis 的插件重新应用通常复用已加载的模块；没有读到 rc.3 插件管理器的模块缓存行为 | L3（探针里禁用、启用执行行后看活着的 worker 能否写） | 两种情况都安全：登记表为空时活着的 worker 只读、被列为「失联」，主 Agent 中断后重新派发（§3.1.4），损失是重做一次 |
| U14 | 门禁锁的失效判定在 Windows 上可用：`process.kill(pid, 0)` 对不存在的进程报 `ESRCH`、对别的用户的进程报 `EPERM`；`os.uptime()` 推出的开机时刻在一次开机内稳定到分钟 | Node 文档的行为〔推断，未在本机实测〕 | L2（`execute-gate-lock.spec.ts` 用不存在的 pid 与改过的开机时刻） | 失效判定只认「开机时刻不同」与锁的年龄超过 6 小时，其余一律当作有效、按 `gate_busy` 交主 Agent 重试 |
| U15 | `goal/changed` 的 `ref.id` 在一个 goal 的整个生命周期里不变，与 `goals.get(agent)` 返回的 goal `id` 相同 | goal:763（`ref.id` 与 `current.id` 比较）、872–877 | L3 `glm-exec-drive` | 凭据改按 `agentId` 加 10 分钟窗口配对（同一 agent 同时只有一个 goal，goal:639） |
| U16 | 表格版选项卡的引擎字段名与长度上限是 `d-option-card` 正文写的 `label`（不超过 20 字）、`gain`、`cost`、`dimension`、`crux`、`verdict`、`weight`，`verdict` 要点名推荐的键 | `d-option-card` 正文（2026-10-29 12:35）；运行 `card-fields-table` 实现中 | `card-fields-table` 合入时；`questions.ts` 的 L2 用例 | 只改 `questions.ts` 一处（§3.7.4），其余设计不变 |
| U17 | worker 的工具面不受 M3「主 Agent 去掉写工具」影响：M3 的过滤只按主 Agent 判定 | M3 设计 §3.1.3 的过滤条件是 `isMainAgent`；子会话头带 `origin: 'subagent'`〔推断〕 | L3 `glm-exec-dispatch`（worker 的请求记录里有写文件工具），随 U5 一起 | 执行行的组装监听器给 worker 补回写文件工具（工具仍在全局注册，只是从工具面去掉了） |
| U18 | 门禁 provider 在 `caller` 模式下不进面板的子 agent 目录（`startExternal` 只在 `parent` 模式登记目录），人在面板上看不到门禁在跑 | subagent:1483–1520〔实读，影响可接受〕 | L4 第一批 | 不改：门禁的进度靠派发状态提醒、任务上的批注与晨报；人要停它用 `/drive stop` |

## 16. 第 1 轮评审的处理（0.1 → 0.2）

评审：`.agents/tasks/m7/design-review.md`（第 1 轮，挡路 3、不挡路 13）。16 条全部采纳，没有拒绝的。

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F1（HIGH，挡路）验收审查挂在目标下会停在提议 | 采纳评审的第一种改法：验收审查不建图节点，harness 直接起只读的审查激活（`hz-<目标>-acc-a<k>-<6 位>`，`hard` 档，主检出，`hourness-review-v1`），每轮结论以批注记在目标上（带基线提交与 pins）；完成门禁第 6 条读最新一条批注；收敛同 §3.7.3，停下的待决挂在目标下。触发有两处：最后一个任务合入之后，与 `update_goal complete` 只差这一条时（最后一个任务被废弃的情形）。没选「放行卡固定带一个验收特性」，理由见 §12 | §0、§1.2 m7-3、§2.3.1、§3.1.4、§3.9.3、§3.9.4、§4 引擎事实表、§5、§9.1 `glm-exec-skeleton`、§10.1、§12 |
| F2（MEDIUM，挡路）harness 的待决缺卡片字段；停下只靠待决 | 新增唯一的生成处 `questions.ts` 与 §3.7.4：五种模板按表格版字段写全（`label`、`gain`、`cost`、`crux`、`verdict`、`weight`；按 2026-10-29 12:35 定稿的表格版，没有 `why`、`counter`），合入前有过渡写法。停下先写轮次批注末尾的 `· 停下`，简报门禁与汇合门禁都认它，人的任何拍板、批注或转述解除；待决写入重试 3 次，仍失败时行健康降级、通知主 Agent、晨报「例外」列出；批注也写不进时本进程内 `ctx.stopped` 挡住 | §0、§1.1、§1.2 m7-4、§1.3、§3.5.1、§3.7.3、§3.7.4、§3.8.3 第 1 与 8 步、§3.10 例外、§3.12.2、§3.15、§5、§6.2、§6.5、§6.6、§9.1 `glm-exec-review`、§13、§14、§15 U16 |
| F3（MEDIUM，挡路）标定与 `ablation` 冲突；D2 已被常设授权回答 | 物理隔离、事后扫描与消融开关改为归 `ablation`；P4 只留 `ablation` 不做的部分（读圈禁、`task.json` 的 `set`、`origin`、`isolation`，`result.json` 的 `env`、`infra`、`valid`，pass^k，§10.5 改写），排在 `ablation` 合入之后；删掉 D2，跑回归与消融的时机写进 §12，花费进晨报；删掉 §11 与 §12 里「不搬运行目录」两条 | §0、§1.2 m7-10、§2.1、§3.14.2–§3.14.4、§7、§8.2 P4、§8.3、§10.2、§10.3 第 2 条、§11、§12、§13、§14 |
| F4 压缩合入后分支清理与重开走不通 | 尾注加 `Hourness-Branch-Tip`（同写进 `result.json`）；「已合入」按尾注判定；巡检对合入超过 14 天的分支用 `git update-ref -d refs/heads/<分支> <记下的头>`，分支头一变 git 就拒绝；重开后再派发时旧分支改名为 `hz/<id>@<n>`、从当前基线新建 `hz/<id>`，旧分支在合入后还有提交时照样改名并批注。用 `update-ref -d <旧值>` 而不是评审写的「只在头匹配时 `git branch -D`」：两者效果相同，前者把「头匹配」交给 git 原子核对，没有先查后删的窗口 | §3.1.2 第 4 步、§3.8.3 第 12 步与提交信息、§3.11.2、§5、§6.2、§6.3、§6.6、§9.1 `glm-exec-merge`、`glm-operate-patrol`、§12 |
| F5 门禁锁不覆盖巡检与跨进程；准备命令只在新建时跑 | 公共 git 目录下的 `hourness-gate.lock`（pid、开机时刻、持有者；独占创建；失效的改名保留），门禁与主干检查共用，运维行经 `glmHournessExecute.withGateLock`；`setup $ <命令> when <路径>`，默认监视 `package.json` 与各类锁文件，任务工作树与门禁工作树都记摘要，变了就重跑准备命令；准备命令失败不计入门禁失败的三次。锁位置用 `git rev-parse --git-common-dir`，评审写的 `.git/` 在工作树里是文件，不是目录 | §2.1、§3.1.2 第 4 步、§3.8.1、§3.8.3 开头与第 8 步、§3.11.2、§5、§6.2、§6.3、§6.6、§15 U14 |
| F6 并行线的目录登记与 M3 依赖写错 | 加 E0（split 合入之后，`hourness.src` 加 `execute`，放进 `scope.ts`，四条线都在它之后）；`operate` 随 P3 登记，因为 preflight 对登记了却不存在的目录也报错（136–138 行）；`derivedStage`、`goalCompletion` 放新文件 `src/graph/execute-stage.ts`，只导入已在 main 的 `effectiveStage`（M3 第 2 步 `7aa8fe5` 已合入，所以 E1b 不再等 M3）；`briefGate` 从 `ctx.stage` 拿推出的阶段 | §0、§2.1、§2.4、§3.5.1、§3.9.3、§7、§8 开头、§8.1 E0–E4、§8.3、§10.1 |
| F7 四答的节名对应错 | 节名改为「一、目标（效果是）」「二、规划（任务分解）」「三、理由（为什么）」「四、架构（怎么做）」，与 plain-ui §2.2 一致 | §0、§3.10 |
| F8 完成证据没绑定到门禁放行 | 放行时记凭据 `{agentId, goalId, graphRevision, callId, at}`；`goal/changed` 只在配对到凭据时写完成，否则批注「goal 在完成门禁之外完成」并记复盘；重启丢凭据时的对账提示 | §0、§1.2 m7-3、§3.9.3、§3.9.6 第 7 步、§3.10、§3.15、§4、§5、§6.2、§6.5、§9.1 `glm-exec-drive`、§15 U15 |
| F9 `send_message` 冷恢复已结束的 worker | 新规则 `worker-message-live-only`：主 Agent 对不在本进程登记表里、已结束的 `hz-` id 调 `send_message` 被拒，正路是重新派发；写权限只给本进程起的、仍活着的激活，不再按 `childId` 前缀解码恢复写权限 | §2.1、§2.3.1、§3.1.4、§3.2.5、§3.4.2、§4（冷恢复一行）、§5、§6.2、§6.5、§9.1、§12、§15 U13 |
| F10 模型提醒条件太窄；worker 默认档前后不一 | `modelReminder`：主 Agent 的模型不是它所在 provider 的 `hard` 或 `standard` 档模型时提醒，没有档位映射时给通用提醒；实现、测试、文档任务默认 `simple` 档 | §1.1、§3.1.3、§3.9.1、§3.10、§9.2 第 2 步、§10.3 第 5 条、§12 |
| F11 D1 不是选项卡格式 | D1 按表格版重写：`weight: one-way`，A「你逐条改写验收」、B「按 §1.2 原样写入」（推荐，放最后），`crux` 与 `verdict` 各一行。评审建议的 `why`、`counter` 两行已被表格版取消（人 2026-10-29 12:35），由「取决于」与「是 → X；否 → Y」两行代替 | §13、§14 第 1 条 |
| F12 `no_acceptance` 的提示与引擎不符 | 提示改为「Propose the task again with acceptance criteria; changing the acceptance of an existing task is the human's.」，并写明引擎依据 | §3.5.1、§4 引擎事实表 |
| F13 定时提醒的字段形状 | 写明实读的形状：请求里是 `{time, time_zone}` 与 `{time, time_zone, weekdays}`（键名是 `time_zone`，评审写的 `timeZone` 是存储记录里的字段名，schedule:1052–1059、1118–1130），`time` 为 `HH:mm:ss`，`weekdays` ISO 1–7；`times.*` 接受 `HH:mm`，注册时补 `:00`，时区取 `Intl.DateTimeFormat().resolvedOptions().timeZone`，周报 `weekdays: [1]`；U8 只留冷会话投递 | §3.11.1、§4、§6.4、§6.6、§9.1 `glm-operate-patrol`、§12、§15 U8 |
| F14 别的项目里第一次合入多一次人的批准 | 图上没有 `norm-merge-gate` 时，设计阶段提醒要求主 Agent 在放行之前提议它，随放行卡一起批准（`releaseSet` 收目标子树里全部提议）；`no_gate_norm` 的提示写同一条正路。放在阶段提醒而不是评审写的身份节：身份节是常驻提示词，这件事只在没有规范时才要说（K7） | §2.1、§3.8.1、§7、§9.1、§9.2 第 1 步、§10.1、§14 第 3、4 条 |
| F15「回到设计」从面板拍板执行不了 | 待决正文带回写标签，`/graph-apply` 以人的身份执行（`stage <目标> design`、`drop <父任务>`），只认 harness 提的待决、只作用于它的父任务或所在目标；对话里拍板时主 Agent 带原话转述执行 | §2.1、§3.7.3、§3.7.4、§6.4、§8.1 E8 |
| F16 没写依据的学科 | §2 开头加一段：可靠性工程与主干开发、安全工程的最小权限、测量与统计（DORA 标准口径）、认知负荷 | §2 |

本轮另外纳入的变化（评审之后、本稿写作期间）：

- 选项卡定为表格版（`d-option-card` 2026-10-29 12:35，人：「就改成表格，用「取决于」加一行条件，替换掉「为什么」和「反方」两行」），引擎字段由运行 `card-fields-table` 实现。§3.7.4 与 §13 按它写，字段名未合入，列为 U16。
- 桌面版的常设授权（`risk-shared-desktop` 2026-10-29，人：「dsh我现在不用，你以后直接用就行了」）：批次 L4 不再约人的时段，编排方在运行之间排队，同一时间一个持有者（§3.8.6、§8.3、§9.2）。
- 评审「没核实的假设」里提到、0.1 没列的两项补进 §15：U17（worker 的工具面不受 M3 去掉写工具的影响）、U18（`caller` 模式的门禁不进面板目录）。另新增 U13（禁用再启用时登记表是否留下）、U14（门禁锁的失效判定在 Windows 上的行为）、U15（`goal/changed` 的 `ref.id` 与 `goals.get` 一致）。

本轮新读的 rc.3 证据：`dsh-schedule/lib/index.js` `parseDailyInput`（1052–1059）、`parseWeeklyInput`（1118–1130）、`localClockTime`（333–335）、`normalizeWeekdays`（394–405）、`scheduleTitle`（93–97）、`list`（2120–2121）、`delete`（2164–2173）；`dsh-subagent/lib/index.js` `deliverFollowup`（2091–2117）、`coldResume`（2141–2189）；`dsh-goal/lib/index.js` `goal/changed` 的载荷（872–877）、`ref` 核对（763）；`dsh-tool-subagent-control/lib/index.js` 两个工具的参数（26–35、64–68）；`dsh-tools/lib/index.js` `exec.callId`（1267）。本仓库：`src/graph/engine.ts` `initialStatus`（306–318）、`LLM_EDITABLE`（97）、`OPEN_PARENT_TYPES`（100）、`privileged`（150）、`questionRefusal`（289）、`planEdit`（467）；`src/graph/format.ts` `record`（81–90）；`src/graph/stage.ts` 的导出（`effectiveStage` 90、`releaseSet` 172）；`.worktrees/split/scripts/preflight-bundle.mjs`（134–138）与 `scripts/packages.mjs`。

