# 项目图对账 A 半（2026-11-05）

只读调查。代码与提交以 origin/main 为准（运行开始时 98fbed9，写报告时 89a5785，两者之间只差 docs/graph）。节点读自 `docs/graph/nodes/*.json` 与 `scripts/graph/cli.ts show`。文中说「在 main」的提交，都用 `git merge-base --is-ancestor <提交> origin/main` 核过（退出码 0）。没有改代码，没有改 docs/graph。

## 摘要

本半 22 个节点，名单外没有漏网的 task 或 feature（图上 approved/doing 的 task、feature 共 44 个，A 半 22 + B 半 22 正好覆盖）。

| 类 | 个数 | 节点 |
| --- | --- | --- |
| (a) 可以关 | 9 | m3-1、m3-2、m3-3、m3-4、m3-5、m4-rules、m5-1、m4-gate（AC6 字句要人改一句，见注 1）、m3（等五个子任务与 d-interview-cards 先关） |
| (b) 只差批次 L4 | 4 | m4-checks、metrics、compact-recall、lessons-3（真 profile 上看不到经验页，见该行） |
| (c) 在等别的线 | 7 | m4-request-card（M7）、m4（子节点）、lessons（M7）、m6-script-gate（R4d）、m6-metrics-events（今天刚开线）、rules（R4d 与批次 L4）、schedules（M7 运维条目与批次 L4） |
| (d) 在等人 | 2 | m5、m5-4（2026-11-04 的两问，至今没答） |
| (e) 现在就能开线 | 0 | 本半没有「未开工、依赖已满足」的节点；图上没有节点、但现在就能开的活有 3 件，见 (e) 节 |
| (f) 过时或重复 | 0（名单内） | 名单外的 d-interview-cards 已被取代，挡着 m3 关闭；另有 4 处过时的正文或验收字句 |

建议关的节点（按先后）：m3-5 → m3-1、m3-2、m3-3、m3-4 → m4-rules、m5-1 → d-interview-cards 处理掉 → m3 → m4-gate（AC6 改完之后）。m3-5 一关，m4-request-card 与 m5-4 的依赖门解开；m5-1 一关，lessons-3 与 m5-4 的依赖门解开。

要人定的事：

1. m5 的两问（2026-11-04 桌面批次批注原话）：「①直述的习惯要不要也必须先问（要则改设计/提示词）；②memory_habit 提示要不要升级为显式规则（flash 走了通用卡没碰工具，对话式 decline 也因此只有会话内约束）」。之后没有批注、没有 decide 记录回答它；`docs/HANDOFF.md` 的 M5 一行仍写「等人定」。
2. m4-gate 验收第 6 条的字句：写着「接管行一条」，而接管那条规则已由人 2026-11-01 用 `d-bootstrap-released` 去掉。改验收要人的原话。
3. `d-freeze-until-dogfood`（2026-10-30，自举之前不改已放行的设计，请求「自举之后再办」）与 `d-finish-then-bootstrap`（2026-11-03，「干脆直接在我们这边彻底做完再进自举吧」）在一处打架：R4d 等的规则板 R3 提议路，依赖 M3 0.6 请求的 §9.3 改稿，这份改稿按前一条排在自举之后；按后一条又要在自举之前做完。m6-script-gate、rules 都卡在这里。
4. compact-recall 在 L4 之后：transcript 行是否默认启用，节点写明由人定；节点自己没有验收（投影门 `acceptance`），补验收也要人的原话。

## (a) 活已在 main，验收逐条有证据，可以关

| 节点 | 现状态 | 证据（验收条 → 提交 / 测试 / 探针） | 关之前要做的 |
| --- | --- | --- | --- |
| m3-5 要人定的事 | doing | 第 10 步 5b6e77d（语义评审 APPROVED，review-step10.md），随 m3 合并 2bf2b16 进 main。AC1：待决与「需要你」读图（`src/graph/plain-view.ts` 的 `waitsForHuman`），2026-11-03 21:43 桌面版交互 L4 里人没当场回的事经 `record_human_answer` 落成带 relay 的 decide（m3 节点 2026-11-03T13:56 批注）。AC2：`src/workflow/decisions.ts` 已删，晨报「等你定的事」读图（`docs/HANDOFF.md` 的 `hourness` 行）；main 上剩的 `L1`…`L4-batch` 只在 `src/execute/plan.ts`，是验证层级，不是决策分级 | 带证据（5b6e77d、2bf2b16）转 done。先关它：m4-request-card、m5-4 的依赖门由它挡着 |
| m3-1 主 Agent 的身份与不写代码 | doing | 第 3 步 9c346fb、第 4 步 bd91f2c 随 2bf2b16 进 main，设计行启用 d6a2c26。AC1 身份节：`src/design/identity.ts` 的 `MAIN_AGENT_SECTION`，`tests/design-mode.spec.ts`，L3 `glm-design-main`、`non-glm-design-main`、`glm-design-wish-idle`。AC2 拒写：`tests/design-guard.spec.ts`「the main agent's file tools are denied by name, with and without the dialect service」「the main agent's shell may not write files…」「after /wish off the session writes again…」「a denial is written to the violation journal…」。AC3 工具面：`src/design/role-face.ts`，`design-guard.spec.ts`「asking through a card is denied by name…」。AC4 入口：`ui/src/wish/`，`tests/wish-entry.spec.ts`、`flow-bar.spec.ts`；桌面版 2026-11-03 交互 L4 看过入口，尺寸按人的意见改成跟 DSH 原生一致（2890e19，在 main），m8 节点 2026-11-04 批注记下实测尺寸「B 项过」 | 带证据（2bf2b16、d6a2c26）转 done |
| m3-2 许愿访谈八步与需求卡 | doing | 第 8 步 3fbc1e9（两轮评审），随 2bf2b16 进 main。AC1、AC2：`tests/propose-to-human.spec.ts`、`record-human-answer.spec.ts`、`design-talk.spec.ts`。AC3 标定：修复 88c1d69 之后 GLM-5.3 三次 2/3 全过（`.llm/calibration-runs/2026-11-03T05-48-55-107Z/`，m3 节点 2026-11-03T06:26 批注）；两档基线（含 Flash 三次）在 2026-11-02T23:04 批注 | 带证据（88c1d69、2bf2b16）转 done |
| m3-3 方案五栏与放行前的检查 | doing | 第 5 步 e48fc70、第 9 步 e58d1ae（语义评审 APPROVED），随 2bf2b16 进 main。AC1、AC3：`propose-to-human.spec.ts`、`record-human-answer.spec.ts`。AC2、AC4：`design-guard.spec.ts` 的 design-before-release 各例与「by module」五例；L3 `glm-design-stage`、`glm-design-release`、`glm-design-modules` | 带证据（e58d1ae、2bf2b16）转 done |
| m3-4 人在对话里对提议怎么说 | doing | 第 6 步 05d524a、第 9 步 e58d1ae，随 2bf2b16 进 main。AC1、AC2：`record-human-answer.spec.ts`「the human agrees in their own words…」「adding or rejecting notes the human's words on the question and leaves it open…」「words the human did not say after the matter was put to them are refused…」。AC3 桌面版问法：2026-11-03 交互 L4（五轮问答，待决经 `propose_to_human` 交人，人的「小网页吧」落成带 relay 的 decide） | 带证据转 done |
| m3 设计循环 | doing | 唯一一条验收（标定访谈从一句话走到放行）= m3-2 AC3，证据同上 | 先关 m3-1 到 m3-5，再处理 d-interview-cards（见 (f)），然后转 done。注：M3 设计 §9.3 的批次 L4 要 GLM-5.3 与 DeepSeek 各一会话，DeepSeek 那一半没跑过（`.llm/l4-deepseek/` 里只有 `README.md` 与 `docs/graph/nodes/.gitkeep`，没写过图）。节点验收不要求它，非 GLM 路由由 L3 `non-glm-design-*` 覆盖；要补就放进下一批桌面 L4 |
| m4-rules 三条规划规矩 | doing | AC1：G3 8010dd8（`suppression-reason`、`checker-config`、`scratch-only`），`tests/guard-new-rules.spec.ts`。AC2：R1 e4ef64d（第三次返工提待决，循环板条目 `graph.third-rework`），`tests/graph-reopen.spec.ts`。AC3：`docs/ORCHESTRATION.md` §6.4 表头是「规矩｜在哪实现｜状态」，逐行有值。评审遗留的 MINOR（规则板流水按项目写）由 4da6f93 修掉，随 m4-checks 进 main，`tests/rules-gate.spec.ts`。M4 设计 §1.2 这一行的验证层只到 L2、L3 | 带证据（8010dd8、e4ef64d、4da6f93）转 done。不需要 L4 |
| m5-1 记忆的存取 | doing | 随 m5 合并 e654b0a 进 main（分支头 aef9d43 在 main；早期提交号 662ed88 已被改写，不在 main）。AC1：`tests/memory-model.spec.ts`「a preference keeps strength 1 after 60 days; a fact never reviewed has 0.5 after 14 days…」。AC2：`secret_like` 各例在 `memory-model.spec.ts`；`defaultKnowableFromGit`、`shouldStore`、`knowableFromGit` 在 main 的 src 下已搜不到。AC3：`memory-model.spec.ts`「…is ask_first; the hint names memory_habit (H1)」。AC4：同文件「…refused as similar unless confirmNew…」。AC5：`tests/memory-tools.spec.ts`「…refused as no_project…」，`memory-row.spec.ts`。AC6：`memory-tools.spec.ts`「the old memory.json is migrated by the first write…」「…cannot be read is never overwritten…」。AC7：`memory-model.spec.ts` 的 `preference_owner` 各例，`memory-row.spec.ts`「/memory forget works as the person…」。AC8：`tests/data-journal.spec.ts`「two processes appending 200 records each to one journal leave seq 1 to 400…」。AC9：`memory-model.spec.ts` 的折叠各例。节点正文写的验证层是 L2、L3（`glm-memory`、`non-glm-memory`） | 带证据（e654b0a）转 done。今天的批次 L4 名单里有它，节点自己不要求 L4，可以不等。关掉后 lessons-3、m5-4 的依赖门解开 |
| m4-gate 拦截与撤下 | approved | G1 362e66a、G2 52a36f6、G3 8010dd8、G4 11306b6，合并 0553cd4 进 main（合并树 probe 349/349）。AC1：`src/guard/gate.ts`，`tests/guard-gate.spec.ts`、`guard-records.spec.ts`。AC2：`tests/guard-followup.spec.ts`。AC3：`tests/guard-measure.spec.ts`、`guard-status.spec.ts`，命令 `src/guard/cli.ts`。AC4：`src/guard/lift.ts`，`tests/guard-lift.spec.ts`，探针 `probe-lift`。AC5：`src/guard/fallback.ts`，`tests/guard-fallback.spec.ts`。AC6：见注 1。AC7：`tests/guard-audit.spec.ts`。设计 §1.2 这一行验证层是 L2、L3 | 先改 AC6 的字句（要人的原话），再带证据（0553cd4）转 done。它现在是 approved，转 done 之前不必先经 doing（`TRANSITIONS.approved` 含 done） |

注 1（m4-gate AC6）：验收写「规则总表列出 guard 这套框架的全部规则（guard 行六条、图行一条、循环板两条、指标流水一条、接管行一条）…主 Agent 的八条规则和 M7 的那道检查各在自己的表里」。main 上：`src/guard/catalog.ts` 的 `GUARD_RULES` 是 guard 6、graph 1、loops 2、metrics 1，没有接管行，`tests/contracts.spec.ts` 钉成「only rows that exist on main」；接管那条规则是人 2026-11-01 用 `d-bootstrap-released` 去掉的（m4 节点 2026-11-01T09:15、10:55 批注），比这条验收写进图（09:14）晚，字句没跟着改。主 Agent 的表 `src/guard/main-agent-rules.ts` 的 `MAIN_AGENT_RULES` 是九条，不是八条（第 4 步三条、第 5 步一条、第 6 步三条、第 8 步两条）。M7 那道检查的表只在 m7 分支上。建议请人一句话把 AC6 改成：去掉「接管行一条」，主 Agent 的规则改「九条」，M7 那半句挪到 M7 自己的节点。不改的话就只能等 M7 合入，而且接管那一项永远对不上。

## (b) 已在 main，只差批次 L4

批次 wf_be2ff3a8b7d83155 的名单：m4-checks、m8-plain-language、onboarding、m5、lessons-3、m5-1、m5-4、compact-recall、metrics、schedules、rules、status-hub。

| 节点 | 现状态 | 已在 main 的证据 | 差的 L4 条目 | 批次覆盖吗 |
| --- | --- | --- | --- | --- |
| m4-checks 改完就跑的检查 | doing | B1–B6（头 63388d5），合并 8718902、2700c92 进 main（land-m4-checks 2026-11-05T03:32 批注：合并树 npm test 3077 / 0 失败，探针 407/407）；env 行默认启用（63388d5） | 只在真机上看得到的部分：AC5 循环板页上「改完文件就跑检查」一项与展开的检查行，AC1 给 agent 的提醒；M4 设计 §1.2 这一行要 L4 | 覆盖 |
| metrics 统一格式记数 | doing | 合并 31c9e0f 进 main（2026-11-04），指标行默认启用；桌面重启核对过两个包在跑（2026-11-04T18:21 批注） | 设计第 9 步：指标板的桌面核对。节点本身没有验收，按 `d-metrics-steps-by-checks` 用设计 §1.4 的 25 条判 | 覆盖。关之前还要处理两个决定子节点（见「结论」第 3 条）；别的模块的发送方（M3、M7、M6、接管）还没接，不归本节点 |
| compact-recall 压缩后能查原文 | doing | c0676b6 进 main（2026-11-04），transcript 行出厂禁用，L3 `glm-compact-transcript` 通过，代码评审 APPROVED | 桌面上打开 transcript 行跑一次压缩，核对摘要末句与 Read 读导出文件 | 覆盖。L4 之后两件要人：是否默认启用；节点没有验收（投影门 `the task has no acceptance criteria`），评审核的「验收 1–4」在调查报告里，没写进节点 |
| lessons-3 经验页 | doing | 11715b9（经验页 L4 记录）随 m5-rest 合并 67c3c5d 进 main；`tests/lessons-panel-model.spec.ts` | AC1–AC3 已在隔离实例上过（`.agents/tasks/m5/l4-2026-11-05.md`）；AC4 只有 L2。剩人真实 profile 上的经验页 | 名单里有，但做不成：人的 profile 里 `glm-hourness/lessons` 行是 `disabled: true`（`packages/hourness/cordis.patch.yml` 出厂禁用），改人的 profile 要先问人（AGENTS.md 第 6 条）。真正的前置是「经验行出厂启用」，HANDOFF 写明由编排方定。依赖门 m5-1 随 m5-1 关闭解开 |

## (c) 在等别的线

| 节点 | 现状态 | 等哪条线 | 依据 |
| --- | --- | --- | --- |
| m4-request-card guard 申报通道 | approved | M7（wf_36d1d690c7e1de90，.worktrees/m3 的 m7 分支，头 3180672）：AC8（worker 写出项目时纠偏带编号、`ask_main`）与 AC9（申请开着时自动推进停下）是 M7 一侧的行为。main 上 G4 只提供接缝 `outsideDenial`、`peekGrant`、`openRequests`（`src/guard/request-service.ts`）；m7 分支上 `src/execute/drive.ts`、`src/guard/execute-rules.ts` 已经引用这些接缝，还没合入。另等面板：AC10 后半「面板『需要你』从会话日志读出还开着的申请」，main 的 `ui/src` 下没有任何读申请的代码，`.agents/tasks/plain-ui/design.md` 第 1012 行把它记成「M4 推迟到 dogfood 之后」，到时要人把 m8-plain-language 验收第 6 条的「三种事」改成「四种事」 | AC1–AC7 与 AC10 前半在 G4 11306b6（main）：`tests/guard-request.spec.ts`、`plan-text.spec.ts`，探针 `guard-request`。依赖门 m3-5 是名义上的，m3-5 一关就解开。设计 §1.2 这一行另要 L4，今天的批次名单里没有它 |
| m4 拦截补齐与环境 | doing | 等子节点 m4-request-card（M7、面板）与 m4-checks（批次 L4）。AC1 还要「整批再过一次更强模型的逐条审查」，`.agents/tasks/m4/` 下只有分批评审（review-first-batch.md、gate-review-pass1.md 等），没有整批审查记录 | 七件里 m4-cleanup、m4-env、m4-suppressions 已 done，m4-gate、m4-rules 可关（见 (a)）。决定子节点 d-m4-released 也挡着 |
| lessons 经验板块 | doing | M7：正文的三条使用路之一「派发时按任务要碰的文件放进简报」与来源「子 agent 在交回结构里报回候选经验」都在 M7（HANDOFF M5 行：「等 M7 的派发简报与交回（E1b）和周报（E8：经验一节）」）；经验行出厂仍禁用 | 子节点 lessons-1、lessons-2、lessons-4 已 done，lessons-3 见 (b)，d-memory-scope 是决定 |
| m6-script-gate 脚本启动前自查 | doing | 规则板 R4d（`checkCall` 跑人同意过的拦路脚本）。R4d 依赖三样：R3 的提议批准路（要 M3 0.6 请求的规则板 §9.3 改稿，按 `d-freeze-until-dogfood` 排在自举之后）、共用执行器的拦路一队、M7 E7 的 `trunkAdvanceFor`（只在 m7 分支：`src/execute/advance.ts`、`src/rules/gate.ts` 等，main 上搜不到） | S2 已在 main（e72a25e，合并 e95df6e），评审 APPROVED；只剩设计第 24 条里真实 `checkCall` 执行已批准脚本的用例。排期冲突见摘要「要人定的事」第 3 条 |
| m6-metrics-events GLM 包四类事件 | doing | 今天刚开的线 wf_2bf0ad146e8238b2；工作树 .worktrees/m6-metrics-events 目前与 main 同一提交，还没有自己的提交 | 原先的被挡条件（指标服务不在 main）已满足，31c9e0f 起在 main |
| rules 规则板块 | doing | R4d（同 m6-script-gate 一行，排在自举之后）；规则板页面（3b24f1e 进 main）的真机核对在批次 L4 | `docs/ORCHESTRATION.md` §16.6 那一段列的余项都没做：人加的规则与检测器、脚本执行、`rules_propose`、`hits.json`、`attachable` 与 `acceptProposal`、`/rules lift` 接代码规则、少做档上限由派活执行（M7 还没读 `glmWorkerCap`）。正文写的第一批资源类规则（桌面版租约、CPU 内存预算）main 上也没有。决定子节点四个（d-main-agent-peak-exempt、d-peak-mode、d-rules-in-repo 是 sandbox，d-rules-human-only 是 unverified）都还是 approved |
| schedules 循环板 | doing | M7：循环板设计 §1.4 第 4 条要「循环板 · 晨报 / 周报 / 夜间巡检」三条任务绑在主 Agent 会话上，条目数据在 M7 的 `entries.ts`（M7 的 m7-6 晨报、m7-7 夜间巡检、m7-8 周报都还是 approved 没开工）；周报的「4 周没结果的条目提议删掉」也归 M7 | 循环板、运行器（loops-runner 合入 a9adca8）、机器一级运行者（loops-machine，c48f91d）都在 main；运行器的首轮 L4 已过（`.agents/tasks/loops-runner/l4-2026-11-04.md`），机器运行者的新行为随批次 L4 |

## (d) 在等人

| 节点 | 现状态 | 等人答什么（节点原话） | 人后来答过没有 |
| --- | --- | --- | --- |
| m5 记忆与学习 | doing | 2026-11-04 桌面批次批注：「待人定两件：①直述的习惯要不要也必须先问（要则改设计/提示词）；②memory_habit 提示要不要升级为显式规则（flash 走了通用卡没碰工具，对话式 decline 也因此只有会话内约束）」 | 没有。m5 之后的批注（2026-11-04T19:17 起）都是 m5-rest 的进度，没有一条回答它；全图历史里这两问只出现在这一条批注；`docs/HANDOFF.md` M5 一行仍写「等人定 2026-11-04 桌面批次留下的两件」。另外 m5 还在批次 L4 名单里，子节点 lessons（M7）、m5-1、m5-4 与决定 d-reporting-depth-keep 都没关 |
| m5-4 从你的改动里学习 | doing | 同上两问。它们问的就是本节点的行为：答「要」的话，`memory_store` 对人直述的习惯也要走 `memory_habit` 先问，或者给 `memory_habit` 加一条代码规则，AC3、AC7 的说法跟着改 | 没有。代码本身齐了：S9（随 m5 合并 e654b0a）、S12 eef34f9（合并 80d4612）、m5-rest 的 02a2bec（合并 67c3c5d）都在 main；AC1 `tests/memory-signals.spec.ts`，AC2 `memory-learning.spec.ts`，AC4–AC7 `memory-habit.spec.ts`，L3 `glm-memory-habit`。人答「不用」就可以带证据关；依赖门 m3-5、m5-1 随它们关闭解开 |

## (e) 没开工，依赖都满足，现在就能开线

本半名单里没有这样的节点。下面三件图上没有节点，依赖都已在 main，可以现在开，按建议先后排：

1. M3 的指标事件接线（小到中）。`src/design/metrics.ts` 的 `emitMetric` 在 main 上仍是空函数，注释写「The metrics stream has no write interface yet」，而指标流水 31c9e0f 起就在 main。`docs/ORCHESTRATION.md` 指标流水「接线与启用〔第 6 步已实现 2026-11-04〕」那一段（约第 1286 行）写明「M3 的 12 个调用点字段名先于 §4.5 的闭表，5 处整条会被拒收，`design.holder-moved` 与 `git.snapshot` 还没有发射点，接线归 M3 自己的步」，可图上 m3 已写「M3 全部完成」，这一步没有挂在任何节点上。规模依据：一个出口函数、12 个调用点、5 处字段改名、两个新发射点，加 L2 与一个探针检查。先做它的理由：人 2026-10-31 定 `d-ask-three-gates` 时说「先这样改和试行吧，我看看效果」，试行要看的数（`design.proposal-shown` 的 `form`、`points` 等）今天一条都没记下。
2. 面板「需要你」列出开着的申请（中偏小）。guard 一侧的读口 `openRequests` 与 `hourness-request` 提醒都在 main（G4），面板一侧没做；做了才关得掉 m4-request-card AC10。要人一句话把 m8-plain-language 验收第 6 条的「三种事」改成「四种事」（plain-ui 设计原文如此要求）。归 B 半的面板线，这里只记缘由。
3. 过时的说明文字（很小，可以随任何一条线顺手做）：`packages/hourness/locale/{design,env,rules,metrics}/zh.json` 的设置页说明结尾都还写「默认关闭」，而这四行在 `cordis.patch.yml` 里已经默认启用（metrics 节点 2026-11-04T18:21 批注也记过）；`docs/HANDOFF.md` 的 `loops` 行还写「还没有工具、页面、机器一级的运行者、脚本与检查的执行器」，M3、M4、M6 几行停在合入之前的状态。

## (f) 过时，或与别的节点重复

| 对象 | 依据 | 建议 |
| --- | --- | --- |
| d-interview-cards（m3 的子决定，名单外，挡着 m3 关闭） | 它定的是「harness 出卡：经 `src/design/cards.ts` 与 `userQuestions.ask`」。后来人定 `d-chat-not-cards`（2026-10-29，正文点名「d-interview-cards（访谈改为聊天，主 Agent 仍不带 ask_user_question）」要改写或作废）与 `d-ask-three-gates`（2026-10-31）；m4-request-card 2026-10-29 批注也写「原定复用的 src/design/cards.ts 与 human-writes.ts 不再有」。还在用的只有一半：主 Agent 不带 `ask_user_question`（`design-guard.spec.ts`「asking through a card is denied by name」，规则 `main-agent-ask`） | 提一个带 `supersedes` 连线的新决定，写现在的做法，由人批；替代被批准时引擎把它转 superseded（`src/graph/engine.ts` 的 supersede 分支，连 `verification` 一起），m3 的子节点门随之解开 |
| m4-request-card 的标题与正文 | 标题「接决策卡」，正文「经决策卡申报…复用 M3 的 decision_card 与以人的身份写图（M3 设计 src/design/cards.ts、human-writes.ts）」。决策卡已随 `d-chat-not-cards` 取消，G4 实际做的是 harness 写方案文字、人回「可以」、一次性放行。M4 设计 0.3 的图改动清单第 2 条（`.agents/tasks/m4/design-0.3.md` 第 1271 行）还要求把对 m3-5 的依赖改指提供 `dispatchRoot` 的 M3 第 4 步，也没改 | 改标题与正文（验收不动）；依赖边可以不改，m3-5 一关它就不挡了 |
| m4-gate AC6 | 见注 1 | 请人改字句 |
| schedules 正文 | 「待人确认『美化工作』指什么」。之后循环板设计 0.6 已由人放行（与规则板 0.10 同在 2026-10-30，HANDOFF 的「规则板与循环板」一行）；设计 §1.1 引了人的原话，第 83 行写「编排方记下、人没有反对」的默认三层（编排层、GLM 插件、本项目自己的），没有专门回答「美化工作」 | 不必再问人；把正文这半句改成放行时定下的默认条目即可 |

## 名单外节点核对

- 图上 approved/doing 的 task 共 28 个（doing 18、approved 10），feature 共 16 个（doing 13、approved 3），合计 44 个，与 A、B 两份名单的并集一一对上，没有归本半的漏网节点。
- 名单外、但影响本半关闭的：各特性下面状态为 approved 的决定子节点。`src/graph/projection.ts` 第 294–296 行把状态在 `OPEN_STATUSES`（proposed、approved、doing）里的子节点都算「children are not all closed」，不看它是不是决定；决定的 `verification` 另起一道门。所以本半的特性要关，下面这些决定也得先有个去处：m3 的 d-interview-cards，m4 的 d-m4-released，m5 的 d-reporting-depth-keep，lessons 的 d-memory-scope，metrics 的 d-metrics-ratios-person-only、d-metrics-steps-by-checks，rules 的四个。全图 67 个 approved 决定里只有 `d-option-card` 一个转过 done，决定该怎样「关」今天没有成例。

## 结论与建议

1. 先关一批，解开连锁：m3-5 → m3-1、m3-2、m3-3、m3-4 → m4-rules、m5-1。都是带证据的状态改动，证据提交见 (a) 表。m3 等 d-interview-cards 被取代之后再关；m4-gate 等人改 AC6 一句之后再关。
2. 把要人定的四件一次交给人（摘要列表）。m5 的两问拖得最久（2026-11-04 起），m5-4 只差这一答。
3. 决定子节点挡着特性关闭，这是全图的结构问题，不只本半。建议编排方先定一个口径（决定在实现落地、带测试证据时 verify 成 sandbox 或 device，再转 done；或者把常设的决定挂到不会关的节点下面），再成批处理。我没有去 `docs/ORCHESTRATION.md` 的图规则里查有没有现成的说法，这一条只是建议。
4. `d-freeze-until-dogfood` 与 `d-finish-then-bootstrap` 的先后要人定。按后一条的字面，「自举之后再办」的那批请求（规则板 §9.3 改稿 → R3 提议路 → R4d → m6-script-gate 第 24 条；面板的开着的申请；挂在 rules 节点上的多条接缝请求）都要提前到自举之前。建议照后一条办，因为它更晚、人说得也更明白。
5. 可以现在开的活：M3 指标事件接线（图上要先建节点）；面板开着的申请归 B 半；说明文字的过时之处随线顺手改。
6. lessons-3 在今天的批次里大概率看不到经验页：人的 profile 里经验行是禁用的。要么编排方先定经验行出厂启用，要么按 lessons-3 自己写的验证层（L4 截图，已在隔离实例上过 AC1–AC3）直接关、只把 AC4 的真机核对留作下一批。
7. 本次调查只读，图上的状态没有改。上面每一条要落到图上的改动，都需要编排方带证据或带人的原话去做。
