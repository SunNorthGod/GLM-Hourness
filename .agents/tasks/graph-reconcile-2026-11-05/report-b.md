# 项目图对账 B 半（2026-11-05）

基线：origin/main（运行开始时为 98fbed9）；M7 代码看 `.worktrees/m3` 的 `m7` 分支。只读。

## 摘要

查了 22 个节点，查到 2026-11-05 17:25；查时 origin/main 是 `89a5785`（运行开始时 `98fbed9`，其间只多了图提交）。

| 类 | 个数 | 节点 |
| --- | --- | --- |
| (a) 可以关 | 0 | — |
| (b) 只差批次 L4 | 0（另有 2 个节点的一部分只差 L4：onboarding、m8-plain-language） | — |
| (c) 在等别的线 | 22 | 全部，各自等哪条线见 (c) |
| (d) 在等人 | 0（另有 field-trial 的宣传视频一支等人） | — |
| (e) 现在就能开线 | 0 | 没开工的 m7-6、m7-7、m7-8、m7-9、m7-10 都等 M7 合入或 ablation |
| (f) 过时或重复 | 0（另有 9 处正文、批注或状态与现状不符） | — |

结论：今天没有一个能关。本半的走向几乎都卡在一件事上，就是 M7 运行 wf_36d1d690c7e1de90 合入 main（查时还在 E8 的 FEAT-005，后面还有 E8 收敛、E9、真实模型、合入、L4 共 9 步）。E1b 起的 M7 代码（E1b–E7 已推 origin/m7，E8 是本地 wip）都不在 main。

建议关的节点：现在没有。M7 合入 main、main 上探针绿之后，m7-4 可以直接关；m7-1 再等第一批 L4；其余见附表。

要人定的事：

1. field-trial 的宣传视频：新风格的两支成片行不行、定不定稿、发不发、横版 90 秒长版还做不做（见 (d)）。
2. M7 的 P2（晨报、周报、交付的四个数，m7-6、m7-8、m7-9 的主体）在 Kiro 这边做，还是留给自举做第一件活。两条人定的决定在这里方向相反：d-build-all-released「能开工的都开开」要 Kiro 开；dogfood 正文与 M7 设计 §10.3 要把它交给 DSH 里的主 Agent，Kiro 只观察。P2 最早也要等 M7 合入，那时自举的条件也差不多齐了。建议留给自举，理由：它的文件和别的线不相交、只要 L2，拿来当第一件活风险最小，而且正好检验自举。

编排方自己能处理、但现在没人认领的（详见「结论与建议」）：

1. ablation 运行实际卡住：plan 步被上游错误截断，`plan.md` 不存在，code 步却在跑，分支 0 个新提交。
2. bootstrap 运行没有合入 main 的步骤，B0–B6 做完也进不了 main；onboarding 第 14 条的过渡字因此也没地方落。
3. M7 合入并不解开以下几项，图上批注写的是「等 M7」：面板第 8 条 (d)（G15 延到自举之后）、状态板块第 1、2、3、6 条（要 P2、P3）、面板第 17 条（要有人把 `plain-view.ts` 接上 `derivedStage`）。

## (a) 活已在 main，验收逐条有证据，可以关

本半没有。22 个节点里没有一个的验收全部在 main 上有证据：M7 的十个子任务的代码从 E1b 起只在 m7 分支；其余在做的节点各有一部分等 M7、接管或批次 L4（见 (c)）。

## (b) 已在 main，只差批次 L4

本半没有整节点只差 L4 的。下面两个节点有一部分只差 L4，这几条都在今天的桌面批次 wf_be2ff3a8b7d83155 的覆盖里，但节点另有不等 L4 的余项，所以归 (c)：

- onboarding：第 11 条（单装组合）、第 12 条（第 4 块要规则板页面，`3b24f1e` 已在 main）、第 13 条（已登录一支，要人的 GLM 凭证）、第 15、16 条的桌面复核。第 14 条等接管，不在 L4 里。
- m8-plain-language：桌面上的行健康表、F2（浅色主题对比度）、F5（空图首页只留「效果是」）复核、F3（要先在临时会话里 `/wish`），依据 `.agents/tasks/panel/l4-merge-2026-11-05.md`「批次 L4 还剩的」一节。第 8 条余下几样与第 17 条不在 L4 里。

## (c) 在等别的线

- m7（doing）：等 M7 运行 wf_36d1d690c7e1de90（查时在 feat-005，后面还有 e8-converge、e8-commit、plan-e9、e9-loop、e9-commit、real-model-run、land、l4、report）。验收 1（桌面上一条完整链路）要 E9 的 `glm-exec-skeleton` 与第一批 L4；验收 2（自举）要 dogfood 开始；验收 3 的「假出口每类事件各一次」是 E8 FEAT-005 的 `tests/execute-metrics.spec.ts`，在工作树里未提交；验收 4（按模块放行与三档）是 E4 `c0bd42f` 加 E8 FEAT-002/003，L3 `glm-exec-modules` 未提交；验收 5（模块设计的独立审查）是 E6 `12c564b` 的 §3.7.5 部分。子节点 11 个没关（见附表）。E1b 起的提交都只在 m7 分支上。
- m7-1（approved）：代码在 m7（E2 `f0210b2`、E4 `c0bd42f`、E5 `f1c137c`），L3 `glm-exec-dispatch`、`non-glm-exec-dispatch`、`glm-exec-plan` 已提交。等 M7 合入 main，再等第一批 L4（节点正文「L4 随批次」）。合入后不能直接关。
- m7-2（approved）：等 M7 合入，之后还差两步不在当前运行里：P1（补位提醒，验收 3；E8 计划 D4 明说留给 P1）、P6（简报读经验服务，验收 4 的简报一侧；`src/execute/dispatch.ts` 不读 `LESSONS_SERVICE`，只有 `handback.ts` 交经验）。P1、P6 在设计 §8.3 排在 E9 之后；P6 的前置「等 M5」已满足（`src/lessons/service.ts` 在 main）。
- m7-3（doing）：E8 正在做（FEAT-001–004 本地 wip `6bca977`、`bbc400c`、`64aea4f`、`3180672`，FEAT-005 未提交）。之后要 E9 骨架场景、真实模型、合入、第一批 L4；验收 5 的真实高峰核对与循环板 `runAction` 那一路设计放在第二批 L4（§9.2 第 9 步），要 P1–P3 之后。
- m7-4（approved）：代码与 L3 `glm-exec-review` 在 m7（E1b `18b0083`、E6 `12c564b`），节点验证层只有 L2、L3。等 M7 合入 main；合入后 main 上探针绿就能直接关。
- m7-6（approved）：没开工，是 P2 `src/report/four-answers.ts` 加 P3 的循环板条目，设计 §8.3 写「P1、P2、P5 E9 之后」。等 M7 合入。设计 §10.3 末段把 P2 建议成自举的第一件活，开不开在 Kiro 这边做见「要人定的事」。
- m7-7（approved）：没开工，是 P3 `src/operate/patrol.ts`，P3 等 P2。到点投递随第二批 L4。
- m7-8（approved）：没开工，P2 的 `weekly.ts`、`ladder.ts`、`floor-proposals.ts` 加 P3 条目。同 m7-6。
- m7-9（approved）：没开工，P2 的 `src/report/metrics.ts`，只要 L2。同 m7-6。
- m7-10（approved）：没开工（两分支都没有 `scripts/calibrate/read-fence.mjs`）。dependsOn ablation（doing，wf_5f5345b05e5c4e89），设计 §8.3「P4 等 ablation」，另排在 E9 之后。
- m8（approved）：父特性，没有验收字段，正文最后一步是「用户终审」。等两个子节点 m8-plain-language、onboarding（都在 doing），另两个子节点 d-panel-released、d-ui-look-not-operate 是已采纳的决定。子节点在做而它是 approved，状态应为 doing（引擎只许 approved→doing，可以改）。
- m8-plain-language（doing）：panel-2 已在 main（`ce9de4d`，记录 `9f7b5f3` 即 `.agents/tasks/panel/l4-merge-2026-11-05.md`），桌面上 F1、F4、F6 通过；规则板一侧随 `3b24f1e` 在 main。剩下三样各等一条线：① 批次 L4（wf_be2ff3a8b7d83155）：桌面行健康表、F2、F5 复核、F3 要先在临时会话 `/wish`；② 第 8 条余下几样由 status-hub-3-and-panel-8（wf_992ec82f32e990c0）逐样核对；③ 第 8 条 (d)「额度用完、推进停住」与第 17 条等 M7。核对出的偏差：第 8 条 (d) 的数据 `execute/stopped-quota` 在 origin/main 与 m7 分支上都没有（文件数 0），E8 计划 `.worktrees/m3/.llm/wf/m7-e8/plan.md` 的「deferred」一节把 G15「额度用完的停住原因」列为自举之后再做，所以 M7 合入并不解开 (d)，图上 06:30 批注「(d) 与第 17 条仍等 M7」要改。第 17 条的「在开发」读 `derivedStage`：main 上 `src/graph/plain-view.ts:341` 注释写明等 E1b，`derivedStage` 只在 m7 分支的 `src/graph/execute-stage.ts`；合入后还要有人把 `plain-view.ts` 接上它，现在没有哪条线认领；本仓库的图上也没有方向清单节点（`norm-directions.json` 不存在），真图上第 17 条按验收不出现，只能在临时图上核。
- onboarding（doing）：六条验收里第 11、12、13、15、16 条的代码在 main（`ui/src/guide/NoGraphCard.tsx`、`FirstVisitLine`、GLM 上手对话框、`firstVisit` 状态），余下只差批次 L4：第 11 条单装组合、第 13 条已登录一支（要人的 GLM 凭证）、第 12 条第 4 块（规则板页面 `3b24f1e` 合入后才可核）。第 14 条等接管：main 上 `NoGraphCard.tsx` 文件头写「(/hourness-init) is not registered on main」，只有没装接管的一支；人 11-05 定的过渡三步（Q2 选 A）要等接管行进 main 才有地方显示，而接管运行 wf_f008ac0c87ec6943 没有合入步骤（见 bootstrap 一行），过渡字由谁写也没人认领（接管计划 Q2 处理写「面板的两个 UI 文件归面板线」，面板线已收）。B8 之后按原文指向 `/wish`。
- status-hub（doing）：第 4、5 条已在 main（批次 1、3、5 `cbc90a5`，批次 4、7、8 随 `3b24f1e`）。status-hub-3（wf_992ec82f32e990c0）在做已解开的几批（超时条目、规则板条目、循环板清单），查时还在 code 步，`impl-plan-3.md` 还没写出。第 1、2、3、6 条剩「M7 那一半」：第 6 批等 M7 运维行 P3，第 2、3 条点名的 `hourness_report` 也是 P3（设计 §8.2 P3 的今天必败就是「没有 `hourness_report`」，m7 分支 `src/shared/tool-names.ts:145` 只有工具名），晨报与周报的读者是 P2。当前 M7 运行只到 E9 与第一批 L4，P2、P3 不在里面，所以 M7 合入后状态板块仍等 P2、P3 开线。子节点 d-status-hub-released 是已采纳的决定。
- user-graph（doing）：UG0–UG7 已在 main（`91f1dbd`），合入后桌面 L4 记录 `9372a85`：第 41 条面板部分真机通过。节点上没有验收字段，做完条件在设计 0.4.1 §1.4。余下的访谈与全链路核对、U5b 走一遍、`glm-user-graph` 探针链、简报的走一遍约定段，按 18:48 批注「等 M7 E6 之后合入 main 再做」。等 M7 合入，之后要另开一条线，目前没排。
- bootstrap（doing）：B0–B4 与 B4 修复在 origin/bootstrap（`4bd7328`、`7c851db`、`14e9f64`、`d63416b`、`62096dd`、`fb876ce`、`403f080`、`562e17d`），都不在 main。B5 在做（运行 bs-build-loop#7 的 bs-code 步，工作树里有未提交的 `src/bootstrap/service.ts → runtime.ts` 改名，17:16 还在改），B6 随后。B7 等 M7 的 `gate-norm.ts`、`floor.ts` 进 main（它们只在 m7 分支）；B8 等 M3 接受凭据，按 d-freeze-until-dogfood 在自举之后；B9 等 M7 门禁运行一步进 main；B10 等 B7 与 M7 派发进 main。核对出的缺口：运行 wf_f008ac0c87ec6943 的步骤是 bs-setup、bs-plan、bs-build-loop、bs-report，没有合入 main 的一步，B0–B6 做完也不会进 main。节点上没有验收字段，做完条件在设计 0.6 §1.4（41 条，人 11-02 答「按你推荐的来吧」照草稿算数）。
- dogfood（approved）：dependsOn m3（doing，A 半）与 m7（doing）。正文的开始条件逐条核对（设计 §10.3）：规则板最小一片已合入（`c7e7fa4`、`ed80a99`）；norm-merge-gate 已由人批准，§13 的两件也已写进图（norm-merge-gate 验收有 `only docs/graph/`，norm-review-floor 四条带 `files`/`deletes`/`commands`/`outside` 写法，10-30 的 edit 带人原话「没问题的」）；H1 的效果已在 main（`6fea6d0` split 第 5 步起探针在运行目录生成 DSH home，`docs/DEVELOPMENT.md` 第 89 行写「主检出与 git worktree 都直接 npm run probe」），没有节点记它；还差 L3 骨架场景全过（`glm-exec-drive`、`glm-exec-modules` 未提交，`glm-exec-skeleton` 属 E9）、真实模型跑一次、第一批 L4，都在 M7 运行的 real-model-run、land、l4 步里。等 M7 运行做完与 M3 收尾。
- field-trial（doing）：dependsOn dogfood（approved），试用本身等自举。正文要设计的三件（试用者怎样装与上手、出问题留下什么、反馈怎样回图）都没开工。宣传视频一支见 (d)。子节点 d-video-paper-style 的改风格已落地（`e49ecc3`、`c48e421`）。
- orch（approved）：总特性，验收「决定 LLM 怎么干活，人怎么看见并管住它」不可逐条核，随子节点关。60 多个子节点没关；子节点里有多个 doing，它自己仍是 approved。
- ablation（doing）：运行 ablation-calibration（wf_5f5345b05e5c4e89）实际卡住了。plan 步的输出是「⚠️ 上游错误（api_error）：No available accounts」，计划文件 `.worktrees/ablation/.agents/tasks/ablation/plan.md` 不存在，运行却照样进了 build-loop 的 code 步；工作树分支 `ablation` 停在 `2d4600d`，比 main 少几个图提交、多 0 个提交，15:26 合入 main 之后再没有文件变动（查到 17:21）。系统临时目录里 15:44–16:34 有几个 `calibrate-run-dir-*`，但 `run-dir.mjs` 的测试也建这种目录，任何一条线跑 `npm test` 都会留下，不能据此认定标定在跑；code 步的会话本身我没看。三条验收都没有交付物。验收 1 的一半已在 main：`scripts/calibrate/run-dir.mjs`（`3fbc1e9`）把每次运行放在系统临时目录、跑完才拷回；「被测模型读不到验收脚本」与事后扫事件流还没做。m7-10 等它。
- reading-digest（doing）：本周的阅读在 investigate-reading-digest-1105（wf_f8a7db34778f087b）里跑，报告 `.agents/tasks/reading-digest/2026-11-05.md` 查时还没写出。按 10-29 批注，自举开始、循环板上线之后改成循环板上的一项、本节点带证据关闭；循环板已在 main（`src/loops/`），差的是自举开始。
- glm-context-window（doing）：今天开的线 glm-context-window-config（wf_d964b9e854bc29a0）在 code 步，工作树分支与 main 同点（`89a5785`），还没有代码提交。现状核对与正文一致：`src/glm-llm/zcode.ts:429` 声明 `contextWindow: 512_000`，`src/glm-llm/models.ts:56` 的 `GLM_53_RULE.contextWindow` 是 `1_000_000`，请求侧 `zcode.ts:612` 用后者。正文写的来源是 ZCode 3.16.2/3.16.3；仓库基线是 3.17.1（AGENTS.md）。我只在 pristine 副本 `reference/zcode-3.17.1/zcode.cjs` 里做了字面搜索：`contextWindow:` 后面跟字面值的只有会话默认 `2e5`，另 6 处跟的是变量，没有确认 3.17.1 给 glm-5.3 的窗口是多少。实现时应按 3.17.1 核一次，再写 DESIGN.md §4 的偏离说明。

## (d) 在等人

本半没有整个节点只等人。下面一项是 (c) 里节点的一部分，在等人回话：

- field-trial 的宣传视频一支：11-04T18:45 批注原话「宣传视频的改风格到此结束；整片定稿与发布等人看过再说」，11-04T11:49 批注「第三版之后图上没有人看过成片的记录，等人看完给意见；按第三版之后编排层新做的部分（循环板页面、指标板、用户图等）要不要再改一版，随人的意见」。等人答三件：新风格成片（`video/out/Short-2k.mp4`、`Sample-2k.mp4`）行不行；定不定稿、发不发；10-31 定下要做的横版 90 秒长版还做不做（11-04 批注写「横版样片 Sample 仍是 24 秒的风格基准」，长版没做）。之后的历史只有 11-05 的标题改写，人没有答过。

核对过、已经答了的（不再算等人）：M7 设计 §13 的两件（norm-review-floor 的判定写法、norm-merge-gate 的 `only docs/graph/`）由人 10-30「没问题的」同意并写进了两个规范节点；onboarding 第 14 条与 bootstrap Q2 由人 11-05「就按你上面说的来，心跳一个就行了」选 A；glm-context-window 由人 11-05「就用512k，能改最好，写死也行」；GLM 通道对外发布的许可顾虑由 d-publish-as-is（人 11-01「你就发就完事了」）定了。bootstrap 计划里的 Q3（扫描读不读 issue）没有问过人，也没记上图；选项 A 不改验收原文，B2 已按 A 做，编排方可以自己定下并记图。

## (e) 没开工，依赖都满足，现在就能开线（按建议开工先后）

本半没有这一类。没开工的五个节点 m7-6、m7-7、m7-8、m7-9、m7-10 都依赖只在 m7 分支上的代码：P2 读 E7 的检查与主干前进记录（`checks.jsonl`、`advances.jsonl`，E7 `77a0c87` 不在 main），P3 等 P2，P4 等 ablation。field-trial 余下的设计依赖 dogfood。从 main 开这些线，要么等 M7 合入，要么从 m7 分支开、再跟着它变，后者与当前 M7 运行抢同一批文件（`src/execute/`、`run-probe.mjs`），不建议。

M7 合入 main 之后，建议按下面的先后开线（依据是设计 §8.3 的等待表与各节点的余项）：

1. P2（m7-6、m7-8、m7-9 的主体，状态板块的晨报与周报读者）：文件与别的线不相交（§8.3），规模中等，新建五个 `src/report/*.ts` 加改 `src/workflow/morning-report.ts`，只要 L2。开在 Kiro 这边还是交给自举的第一件活，见「要人定的事」。
2. P1（m7-2 验收 3 的补位提醒）与 P6（m7-2 验收 4 的简报一侧，M5 的经验服务已在 main）：都小，只改 `dispatch.ts`、`notice.ts`、`brief.ts`，可以合成一条线；与 P2 文件不相交，可以并行。
3. user-graph 的延后项（访谈与全链路核对、U5b、`glm-user-graph` 探针链）：规模中等，要 M7 的派发与审查在 main。
4. 面板第 17 条接 `derivedStage`：小，改 `src/graph/plain-view.ts` 一处并加测试，要 M7 的 `src/graph/execute-stage.ts` 在 main。
5. P3（m7-7、m7-6/m7-8 的循环板条目、状态板块第 6 批、`hourness_report`）：等 P2。
6. bootstrap 的 B7、B9、B10：等 M7 的 `gate-norm.ts`、`floor.ts`、门禁运行一步在 main，接管线自己接着做。

## (f) 过时，或与别的节点重复

没有整个节点过时或重复。下面几处是节点正文或批注写的与现状不符，要改字或改状态：

- dogfood 正文的开始条件抄的是 M7 设计 0.2 §10.3：「主 Agent GLM-5.3、worker GLM-5.3-Flash」「worker 用默认的 simple 档，审查高一档」。0.6 §10.3 改成了 worker 与审查的模型由主 Agent 选（d-main-agent-models），并多了第 5 条（规则板最小一片已合入、两处读对着真实的 `PeakModeService` 类型验过）。正文该按 0.6 重写；H1 一条的效果已在 main（见 (c) dogfood 一行），可以带证据记一笔。
- dogfood 的子节点 d-dogfood-scope：10-31 批注写它的限制「由 d-build-all-released 取代」，状态仍是 approved，没有 supersedes 连线，挂在 dogfood 的关闭门上。名单外，附带记下。
- m8-plain-language 06:30 的批注「第 8 条 (d) 与第 17 条仍等 M7」：(d) 不等当前这次 M7 合入。E8 计划的延后清单写 G15「a block reason for an exhausted quota」自举之后再做，`execute/stopped-quota` 在 main 与 m7 上都没有。
- m8 与 orch：子节点在做，它们仍是 approved。m8 可以改成 doing；orch 是总特性，改不改都不影响判断。
- glm-context-window 正文说目录规则来自 ZCode 3.16.2/3.16.3；仓库基线是 3.17.1，在 3.17.1 的 pristine 副本里没搜到 glm-5.3 的窗口规则。偏离说明要按 3.17.1 写。
- m7-5（已 done，名单外）：11-01 以「本节点就是 E3」关闭，但验收 2–4（主干前进的核对、证据、事后发现）由 E7 `77a0c87` 实现（提交说明写 m7-5），E7 不在 main；验收 4 末句「夜间巡检再把主干上没有检查记录的提交列出来」属 P3，没做。关早了。M7 合入后补一条带证据的批注，巡检那半句挂到 m7-7。
- m7 验收 3 写「统一的指标记录本身还没做好」：指标行与 `METRICS_SERVICE`（`src/shared/metrics.ts`）已在 main，E8 计划 D6 把「`emitMetric` 接上它」列为编排方要排的后续，现在没有线认领。
- user-graph 正文提到「节点 user-journey 是本项目自己的用户图的第一份素材」：user-journey 已于 11-01 dropped，11-01 批注留了指针，问题不大。
- field-trial 正文「仓库里的标定集改为回归与消融的守门」与 m7-10 验收 3 说的是同一件事；m7-10 负责实现，field-trial 只是说明原则，不算重复，不用动。

## 附：M7 十个子任务在 m7 分支上的进度

依据：设计 `.worktrees/m3/.agents/tasks/m7/design.md` 0.6 §8.1–§8.3（E/P 步与节点的对应）、`git merge-base --is-ancestor` 逐个核对的提交归属、`.worktrees/m3/.llm/wf/m7-e8/` 的计划与 FEAT 状态、运行 wf_36d1d690c7e1de90 的节点树（查时 feat-005 在跑，其后 e8-converge、e8-commit、plan-e9、e9-loop、e9-commit、real-model-run、land、l4、report 都是 pending）。

提交归属（查时）：E0 `a8dfc70`、E1a `c3d66e0`、E3 `af75fe8` 及 E3 跟进 `94592d7`…`dfd337c` 在 origin/main；E1b `18b0083`、E2 `f0210b2`、E4 `c0bd42f`、E5 `f1c137c`、E6 `12c564b`、worker-scope 申报接缝 `223f8d3`、E7 `77a0c87` 只在 m7（origin/m7 = 77a0c87）；E8 FEAT-001 `6bca977`、FEAT-002 `bbc400c`、FEAT-003 `64aea4f`、FEAT-004 `3180672` 是本地 wip 提交，未推送；FEAT-005 在工作树里未提交（`tests/execute-metrics.spec.ts` 新建，`run-probe.mjs` 已有 `glm-exec-drive`、`glm-exec-modules`、`glm-exec-modules-2` 三个场景，未提交）。m7 与 origin/main 的合并基是 7fc5da5，main 此后又前进到 98fbed9（rules-board-page、status-hub-2、panel-2、m4-checks、m5-rest、lessons-4 都在其中），合入前还要再合一次 main。m7 上的 L3 场景已提交的有 `glm-exec-dispatch`、`non-glm-exec-dispatch`、`glm-exec-plan`、`glm-exec-review`、`glm-exec-merge`、`glm-exec-merge-upstream`；`glm-exec-skeleton` 属 E9，`.llm/wf/m7-e9/` 目录是空的。

| 节点 | 对应的步 | m7 分支上做到哪 | 合入 main 后 |
| --- | --- | --- | --- |
| m7-1 | E0、E1a（main）；E2、E4、E5（m7） | 五条验收的代码都在：`dispatch_task`（模型与理由、工作树 `hz/<id>`）、五条 worker 规则（`src/guard/execute-rules.ts`，含 `worker-message-live-only`、快照 `refs/hourness/snapshots`）、`submit_plan` 与 `answer_worker`、`ask_main`；L3 `glm-exec-dispatch`、`non-glm-exec-dispatch`、`glm-exec-plan` 已提交 | 验证层是 L2、L3，「L4 随批次」：要等第一批 L4（§9.2 第 2、3、8 步）才能关 |
| m7-2 | E1a（main）；E1b、E4、E6、E8 FEAT-004（m7）；P1、P6 未做 | 验收 1（派不出去的各条，含 `not_released`、`unreadable`、`slots_full` 与高峰上限）、验收 2（`brief_stale`）、验收 5（`src/execute/examples.ts` 订阅输出示范）的代码在；验收 4 的交回一侧在（`handback.ts` 经 `LESSONS_SERVICE` 交经验），简报一侧没人填：`dispatch.ts` 不读经验服务，属 P6；验收 3 的补位提醒是 P1，E8 计划 D4 明确不做 | 不能直接关：还要 P1（补位提醒）与 P6（简报读经验服务）。P1、P6 都排在 E9 之后；P6 设计写「等 M5」，M5 的经验服务 `src/lessons/service.ts` 已在 main，依赖已满足 |
| m7-3 | E1b `tiers.ts`；E8 FEAT-001–004（本地 wip）、FEAT-005（进行中） | 自动推进、完成门禁、`await_human`、空转、高峰停等、设计退回、对账与目标整体审查的代码与 L2 都在本地提交里；L3 `glm-exec-drive`、`glm-exec-modules` 写了未提交；全量门禁未跑 | 要 E8 收敛与压缩提交、E9 骨架场景、真实模型运行、第一批 L4（§9.2 第 2、5、6、7 步）；验收 5 的真实高峰与循环板 `runAction` 那一路在第二批 L4（§9.2 第 9 步，等 P1–P3 与循环板） |
| m7-4 | E1b 审查规整与收敛；E6；E8 把停下通知改走 `hourness.stopped` | 四条验收的代码在（深浅与理由、底线清单 `floor_requires_full`/`floor_unparsed`、三类挡路、三轮收敛与停下）；L3 `glm-exec-review` 已提交 | 验证层只有 L2、L3：合入 main 且 main 上探针 `glm-exec-review` 绿就可以关 |
| m7-5（已 done，不在本半名单） | E3（main）；E7（只在 m7） | — | 见 (f) 段的说明：节点 11-01 以「本节点就是 E3」关闭，但它的验收 2–4（主干前进的核对、证据、事后发现违规）由 E7 `77a0c87`（提交说明写 m7-5）实现，E7 不在 main；验收 4 末句「夜间巡检列出没有检查记录的提交」属 P3 |
| m7-6 | P2（`src/report/four-answers.ts`）、P3（循环板条目） | 没开工：两分支上都没有 `four-answers.ts` | E9 之后开 P2；验收 3（循环板条目）与到点投递随 P3 与第二批 L4 |
| m7-7 | P3（`src/operate/patrol.ts`） | 没开工 | P3 等 P2；到点投递随第二批 L4 |
| m7-8 | P2（`weekly.ts`、`ladder.ts`、`floor-proposals.ts`）、P3 | 没开工 | 同 m7-6 |
| m7-9 | P2（`src/report/metrics.ts`） | 没开工 | E9 之后开 P2，只要 L2 |
| m7-10 | P4（`scripts/calibrate/read-fence.mjs`） | 没开工；两分支上都没有 `read-fence.mjs` | 等 ablation 合入（P4 在 §8.3 写「P4 等 ablation」，节点 dependsOn ablation）且 E9 之后 |

## 结论与建议

结论：本半 22 个节点今天都关不了，也没有能马上开的新线。几乎每个节点的下一步都卡在 M7 运行 wf_36d1d690c7e1de90 合入 main。

下面的建议都只改图或运行，本报告一样都没做。

### 现在就能做（编排方自己定）

1. ablation：运行 wf_5f5345b05e5c4e89 的 plan 步被「No available accounts」截断，`.worktrees/ablation/.agents/tasks/ablation/plan.md` 不存在，code 步却在跑，分支 `ablation` 没有新提交，15:26 之后工作树没有变动。建议停掉 code 步，从 plan 步重开；m7-10 等它。
2. bootstrap：运行 wf_f008ac0c87ec6943 只有 bs-setup、bs-plan、bs-build-loop、bs-report 四步，没有合入 main。建议在 B6 评审通过后加一步合入（先合最新 main、四道门禁、快进、推两个远端），否则 B0–B6 一直停在 origin/bootstrap。onboarding 第 14 条的过渡三步要等接管行进 main 才有地方显示，写过渡字的 UI 活也要指定一条线（接管计划 Q2 写「归面板线」，面板线已收）。
3. bootstrap 计划的 Q3（扫描读不读 issue）没上图：B2 按选项 A 做了，没改验收原文，编排方可以自己定下并记一条批注。
4. 改写几条与现状不符的图上文字（见 (f)）：
   - m8-plain-language 06:30 批注「(d) 与第 17 条仍等 M7」：(d) 要的停住原因 G15 在 E8 计划里延到自举之后，第 17 条要有人接 `plain-view.ts`。
   - status-hub「剩 M7 那一半」：实际要的是 P2、P3，当前 M7 运行不做。
   - dogfood 正文的开始条件：照 M7 设计 0.6 §10.3 重写（模型由主 Agent 选，加第 5 条）；H1 的效果带证据记一笔（`6fea6d0`、`docs/DEVELOPMENT.md` 第 89 行）。
   - m8 状态从 approved 改成 doing。
   - glm-context-window 的偏离说明按 ZCode 3.17.1 核一遍再写（3.17.1 副本里没搜到 glm-5.3 的窗口规则），可以作为一句提醒转给 wf_d964b9e854bc29a0 的 code 步。
5. m7-5（名单外，已 done）：关早了，验收 2–4 由只在 m7 分支上的 E7 实现。M7 合入后补一条带证据的批注；验收 4 里夜间巡检那半句挂到 m7-7。

### M7 合入 main 之后

- 能直接关：m7-4（main 上探针 `glm-exec-review` 绿即可）。
- 等第一批 L4（M7 运行的 l4 步）：m7-1；m7-3 的验收 1–4、6–8。
- 还要另开线：m7-2（P1、P6）、m7-6、m7-8、m7-9（P2）、m7-7（P3）、m7-10（P4，还等 ablation）；m7-3 验收 5 的真实高峰与循环板那一路要第二批 L4。
- 开线先后见 (e)：P2 → P1 加 P6 → user-graph 延后项 → 面板第 17 条接 `derivedStage` → P3 → bootstrap B7、B9、B10。
- 没人认领、要排的后续：E8 计划 D6 的 `emitMetric` 接 `METRICS_SERVICE`，影响 m7 验收 3「做好以后再核对这些数」。

### 要人定的

见摘要，两件：宣传视频的去向，P2 在 Kiro 这边做还是留给自举。

### 本次核对的边界

- M7 分支的进度看的是提交、工作树状态与 `.worktrees/m3/.llm/wf/m7-e8/` 的计划与 FEAT 文件，没有在 m7 分支上跑测试或探针。FEAT-001–004 的门禁数取自它们自己的记录。
- 各在跑运行的进度来自 inspect_workflow 与工作树文件的修改时刻，没有读各步会话的内容。
- 桌面版没有碰，`docs/graph` 与各工作树都没改。
