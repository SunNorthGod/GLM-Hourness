# 规则板页面：实施计划

状态：定稿（2026-11-05）。第 3 节的 Q1、Q2 已由编排方答复（Q1 选 B、Q2 选 A），第 2 节第 3 条与第 5 节的决定编排方接受。机器可读的拆分在 `task-rules-board-page/`（FEAT-001 = 第 0、1 批，FEAT-002 = 第 2、3 批）。

- 工作树：`C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\rules-board-page`，分支 `rules-board-page`，基点 `97dd7ba`（main 与 origin/main 相同）。所有 git 命令用 `git -C <工作树>`；相对路径会落到上级工作区。`.agents/`、`reference/` 不在工作树里，读主检出下的同名目录。
- 编排方 2026-11-05 的通知：status-hub-remaining 已完成，`origin/status-hub-2`（`b459692` 第 4 批带 `rules/denials`、`rules/lifts`，`3edd58a` 第 7 批，`f285d2b` 第 8 批）门禁全绿、评审 APPROVED、未进 main。本分支开工先把它合进来，规则页建在它上面，最后两者一起落到 main。**status-hub-2 随本分支一起落地**：合并提交与落地报告都写明这一句。

## 1. 依据的设计版本与实现的小节

- 规则板设计：`.agents/tasks/rules/design.md`，**0.10**（2026-10-30，含同日并入的跟进修正 `design-amendments-followup.md`，版本号不变）。目录下没有更新的版本；`design-v0.9.md` 是 0.9 的存档。plain-ui 设计引的「规则设计 0.10 §9.1」就是这一份。
  - §9.1 规则页：登记、只看、各组次序与内容、页上的字、读法。
  - §9.2 命令：只作为页上「要改：……打 /rules ……」一行的来源；本次不加子命令。
  - §11 失败与降级：激活期不抛错（§11.1）；新写的页面数据写不出时的降级与行健康（§11.2、§11.3）。
- plain-ui 设计 1.3（`.agents/tasks/plain-ui/design.md`，人 2026-11-01 放行，`d-panel-released`）：§4.7（登记表、共同约定、规则板分组次序、拦下的记录与撤下、超时的数与来源、只看）、§6.4 第 4 块、§8.2 的「板块登记表的 snapshot 结果」「超时与拦下记录」「撤下」三行、§11 规则板第 1–7 条与「1.0 的对接」第 1 条；做完条件 `onepage-done.md` 第 8、12 条。
- 状态板块设计 0.3（`.agents/tasks/status-hub/design.md`）：§3.1（一件事一处算）、§3.4（板块路的 `items`）、§5（版面）、§7（失败）。
- `docs/ORCHESTRATION.md` §2.10（面板、第 2 层页、登记的板）、§16（规则板）。

## 2. 已定、不再问的几处（带依据）

1. 高峰模式不放单选（plain-ui 设计 §12 第 24 条的例外不启用）：人 2026-11-01 放行面板时接受了编排方标出的这一处，原文记在图上 `d-panel-released` 正文第 ③ 点：「面板只读……换高峰档位都跟主 Agent 说一句或在输入框打命令（例如 /rules peak 不做），尽管人此前说过「档位当然能选」」。页面上档位只显示「← 现在」文字加改法一行。
2. 「写在代码里的规则」一组按 plain-ui 1.3 §4.7 与 §11「1.0 的对接」第 1 条写：组名「写在代码里的规则（启用即拦）」，没有 `credential-read`，这一组里不出现「只记下，不挡」，每条写最近 7 天拦下几次、点开最近 5 条拦下记录（规则 id 作小字）、一行撤下的说法。依据是人的两条决定 `d-code-rules-enforce`（「试运行规则啥的直接拦就行了」）与 `d-credentials-readable`（「密钥文件能读」）；规则设计 0.10 §9.1 的「只能看、没有解除」与 `credential-read` 一行被这两条取代（0.10 按 `d-freeze-until-dogfood` 不改稿，请求已记在图上）。main 上的代码已经是这个样子：`src/guard/catalog.ts` 没有 `mode` 一栏、没有 `credential-read`。
3. 页面数据怎样到客户端（agent 定，可推翻）：规则行在宿主侧把整页要的数据算好，写进项目的 `<项目根>/.llm/rules/view.json`；会话投影 `hournessRules` 只交 `{projectKey, viewFile}`；客户端经 `remote.workspaceFiles.readBytes` 读这一个文件、经 `changes` 与 15 秒重读跟进。规则设计 §9.1「读」一段写的是客户端直接读快照、流水、心跳目录与 `hits.json`。改的理由：(a) 状态板块 §3.1 要页面上的 `items` 与报告路是同一个函数的结果，`rules/denials`、`rules/lifts` 由 guard 行在宿主侧算，客户端调不到宿主函数；(b) 7 天拦下次数要读违规流水，`hits.json` 在 main 上不存在（§16.6）；(c) 循环板（`src/loops/view.ts`、`ui/src/loops/source.ts`）与指标板（`ui/src/metrics/board.ts`）在 main 上已是同一种做法，页面与读法照抄它们的形状。页面上看到的内容不因此改变。推翻的办法：保留 `view.json` 的形状，把计算挪到客户端（只有 `items` 一项做不到）。

## 3. 两份设计在一组上说法不同的两处与编排方的答复

### Q1「会挡住动作的门」一组，在 M7 的门还没装上时显示什么

**答复（编排方 2026-11-05）：B。** 照列 `norm-merge-gate` 与 `norm-review-floor`（标题、灰字来源行、每条 `acceptance` 原文），组尾一句写执行它们的是派活与合入那一块、它还没装上；M7 合入之前不写判定旁注。理由：人定的做完条件第 8 条与 `d-rules-visible` 都要两张清单看得见，页面仍只看。**与规则设计的出入**：这偏离规则设计 0.10 §9.1「目录里还没有带 `lists` 的条目时，整组写一句」的写法；偏离的理由就是上面这条，文档（`docs/ORCHESTRATION.md` §16 的规则页一节）同批写明这一处出入与理由。下面保留两个选项的原文作记录。

现状：代码规则目录里没有带 `lists` 的条目（`CatalogEntry` 没有 `lists` 字段；M7 的执行行不在 main，`src/execute/` 下没有 `index.ts`），M7 的 `parseFloor`（`src/execute/floor.ts`）也不在。两张清单节点 `norm-merge-gate`、`norm-review-floor` 在本仓库的图上。

- A（规则设计 0.10 §9.1 字面）：目录里没有带 `lists` 的条目时，整组只写一句「合入前的检查与必须全审由派活与合入那一块执行，它还没装上；两张清单在项目图上」，不列清单内容。做完条件第 8 条第二点（「规则板有「会挡住动作的门」一组，列出合入前要跑的检查和必须全审的改动」）要等 M7 合入才满足。
- B：照列两张清单：每个节点一组，组名取节点 `title`，下一行灰字「项目图上的规范「<title>」· 你批过的」，下面逐条原文列 `acceptance`（读面板已经读到的图，不另读文件）；组尾用「由派活与合入那一块执行，它还没装上」代替「由 <门> 执行（<行>，此刻<状态>）」；不写「这几条还没有机器认得的写法」（判它的 `parseFloor` 不在 main，等 M7）；节点不在图上时写「这个项目还没有<组名>」；末行照写「要改：跟主 Agent 说「合入前的检查加一条……」；清单在项目图上由你批，改松要你同意」。M7 合入后只换组尾一句并加上判定旁注。
- 建议 B。理由：做完条件第 8 条是人定的验收，`d-rules-visible`（人：「项目所有规则确实应该都在明面上」）要两张清单看得见；数据已在面板读到的图上；组尾那一句照样说清执行它的那一块还没装上，没有把没装上的门写成在拦。

### Q2 首页「现在」里规则板那一行（`homeLine`）的字

**答复（编排方 2026-11-05）：A。** 用规则设计 0.10 §9.1 与 plain-ui 1.3 §4.7、§11 规则板第 5 条的写法（高峰中写时刻与档位，有在等的单写「N 件事在等规则放行」，都没有为 `null`）；状态板块的 `rules/peak` 条目的字照旧是报告里那一行，不改。下面保留两个选项的原文作记录。

- A（规则设计 0.10 §9.1，plain-ui 1.3 §4.7 末段与 §11 规则板第 5 条同此）：GLM 高峰中写「GLM 高峰中，到 <时刻> · 高峰模式：<档名>」；不在高峰而有在等的单写「N 件事在等规则放行」；两样都没有时为 `null`，首页不显示这一行。这一行是板自己写的字，不经 `homeLineFromItem`，状态板块的逐字相等断言不覆盖它（§3.4 只核「命中某条 item」的那种）。
- B（状态板块 0.3 §3.4 与 §12 规则板一行的请求）：`homeLine` 取 `rules/peak` 条目的 `text`（`homeLineFromItem(items, 'rules/peak')`）。今天这条的字是报告里的那一行（`src/report/panel.ts` `peakStatusItems`，形如「- 高峰：不是高峰；下一个高峰 周一 14:00（<套餐>）」），带报告的「- 」前缀，不在高峰时也有，不带档位；装了 GLM 包时首页一直有这一行。
- 建议 A。理由：两份放行了的设计（规则板 0.10、plain-ui 1.3）写的是 A；B 的字是报告的条目格式，会在不在高峰时也占首页一行，与 §9.1「都没有时为 null」相反；状态板块要的板块路一源（`snapshot().items` 与 `collectStatus` 同一份，status-hub-remaining 等的就是这个）不受这一选择影响，照样做。B 作为对规则设计的请求留在图上（`rules` 2026-11-01T09:07Z 的批注），规则设计自举后改稿时一起定。

## 4. `rules/denials`、`rules/lifts` 的读法

- 现状：两条条目由 guard 行算（`src/guard/status.ts` 的 `guardStatusItems`，经 `provideRowStatus(ctx, 'guard', …)` 交 `glmHournessStatus/guard`），只在 `origin/status-hub-2` 上（`b459692`）。
- 本分支怎样做：第 0 批把 `origin/status-hub-2` 合进来（不复制、不挑拣），之后两条条目就在树里。
- 归 status-hub-2 的（随本分支落地，本分支不改它们的字与算法）：`guardStatusItems`、`ruleLines`、`liftLines`、它读整份流水的方式、报告路（`/hourness` 与晨报）对它们的使用、`tests/guard-status.spec.ts`。
- 本分支建的：板块路。规则行写 `view.json` 时取 `collectStatus(ctx, sessionId, 'all', now)`（`src/report/status.ts:80`）里 `owner === 'rules'` 的全部条目（今天是 `rules/peak`、`rules/denials`、`rules/lifts`），原样放进 `view.json` 的 `items`；`collectStatus` 的 `rows` 里 `outcome === 'error'` 的行（只看 `rules`、`guard` 两行）的原因放进 `statusProblems`。客户端的板把 `items` 原样交给 `snapshot().items`，页面在页头下列出它们（`text` 一行，`detail` 收在「讲细点」里）。
- 条目不在时页面怎样写：
  - guard 行没启用、没提供状态视图：`collectStatus` 跳过这一行，页面上没有这两条，不写占位（状态板块 §7「状态服务缺席：跳过这一行」）；「写在代码里的规则」一组照样按目录列每条，guard 的几条行状态写「未加载」。
  - guard 行的状态视图抛错：页面在条目处写「拦下与撤下的汇总暂时读不到：<原因>」（状态板块 §5、§7 的说法），别的照常。
  - `rules/denials` 因为流水里没有拦下而不在（`guardStatusItems` 的约定）：没有这一行；各条代码规则下照写「最近 7 天拦下 0 次」。
  - 会话没有工作目录或不在 git 项目里：没有 `view.json`，页面只写一句（第 6 节第 0 组）。
- 各条代码规则下的 7 天次数与最近 5 条是另一种量（按条、按 7 天），用 M4 的同一个统计函数 `ruleStats(records, {since: '7d', now})`（`src/guard/measure.ts:71`；`guardStatusItems` 的注释写明规则页也用它），不另写一份计数。

## 5. R4d 的决定：本次不做，记为被挡

- 决定：R4d（`checkCall` 与工具调用门跑人同意过的拦路脚本）不在本次实现，也不建它的任何一部分。它归规则行，但它的前提是规则行自己的「同意的路」（规则板实施计划的 R3-提议：`rules_propose`、`attachable`、`acceptProposal`、`repin`、批准时刻 `approvedAt` 的写入），这一步没人做，而且要先改规则设计（见下面第 3 条证据）。
- 理由：没有同意的路，任何一条带脚本的规则在生产上都不会被判为已批准，`checkCall` 里跑脚本的分支只有测试能走到，违反 AGENTS.md「不留死代码」；R4d 另一半（`gate.trunk-advance` 的失败缺省）要 M7 E7 的 `trunkAdvanceFor`，也不在 main。
- 证据：
  1. 规则板实施计划 `.agents/tasks/rules/impl-plan.md` §3 被挡表 R4d 一行：等 R3-提议（批准记录）、共用执行器、M7 E7 的 `trunkAdvanceFor`；Interpretations 第 1 条：脚本只有在人同意并钉住哈希之后才跑，执行器与门里的脚本分支先建会让 main 多一批没有生产调用方的代码。
  2. main 上：`src/rules/check.ts` 文件头第 21–22 行「nothing can approve a script yet」；`docs/ORCHESTRATION.md` §16.9「没有做的操作」列 `propose`、`proposal-accept`、`repin` 等，§16.10「脚本」一段写 `CheckOptions.runScript` 没有建；`src/rules/service.ts` 第 9–11 行 `attachable`、`acceptProposal` 随同意的路加；`src/loops/script.ts` 第 97–102 行 `purpose` 只有 `'work'`，「The `gate` queue comes with the rules board's adoption of this file」；全仓没有 `trunkAdvanceFor`。
  3. 同意的路本身要先改设计：图上 `rules` 2026-11-01T20:01Z 的批注记了 M3 附录 0.6（`d-ask-three-gates`）对规则设计 §9.3 的请求：两个示范 `RULES_PROPOSE_EXAMPLES` 与它们的测试是契约，要改成 `form recommend` 的问法；规则设计按 `d-freeze-until-dogfood` 自举前不改稿。
- 谁拥有、等什么（编排方接受这一决定，并要求落地报告写明，供它转告 m6-followups）：R4d 归图上节点 `rules`（规则行），是规则板实施计划 `.agents/tasks/rules/impl-plan.md` §3 被挡表里的「R4d」一步，排在同一张表的「R3-提议」之后。它等三样：(1) R3-提议（`rules_propose`、`RulesService.attachable`/`acceptProposal`、`repin` 与 `approvedAt` 的写入）；R3-提议自己先等规则设计 §9.3 按 M3 附录 0.6（`d-ask-three-gates`）改两个示范，规则设计按 `d-freeze-until-dogfood` 自举之后才改稿。(2) 共用执行器 `src/loops/script.ts` 加拦路一队（`purpose: 'gate'`、后台与晚到的结局），这一半在采纳它的规则板一侧做，随 R4d。(3) `gate.trunk-advance` 的失败缺省要 M7 E7 的 `trunkAdvanceFor`（节点 `m7`）。
- 对 m6-followups S2：验收第 24 条里「真实 `checkCall` 配一条人同意过的拦路脚本、注入 `runScript`」的几例仍被挡，挡它的是规则行的 R3-提议与 R4d，不是本次的规则页。本次之后 S2 能做的不变。

## 6. 页面各组与数据来源（main 加上第 0 批合进来的 status-hub-2）

页头：「规则板 · 一件事要发生时，让不让做」；下面是条目块（第 4 节）。页面只读：没有按钮、开关、单选、表单，不调 `remote.commands`；唯一可点的是「讲细点」的展开与组内链接（「在等的工作」）。字过 `plainWordsIn`（`src/graph/plain-question.ts:72`），换词照 §9.1 末段。

| 组 | 内容 | 数据从哪来（宿主写进 `view.json` 的，除非注明） |
| --- | --- | --- |
| 0. 没有项目 | 会话没有工作目录：「这个会话没有工作目录，只有代码里的规则对它生效」；工作目录不在 git 项目里：「这个会话不在 git 项目里，只有代码里的规则对它生效」 | 投影 `hournessRules` 的 `projectKey` 为 `null`（客户端判，不读文件） |
| 1. 会挡住动作的门 | Q1 的 B：每个清单节点一组，组名取节点 `title`，灰字「项目图上的规范「<title>」· 你批过的」，逐条原文列 `acceptance`；组尾「由派活与合入那一块执行，它还没装上」；没有判定旁注；节点不在图上写「这个项目还没有<组名>」；末行「要改：跟主 Agent 说「合入前的检查加一条……」；清单在项目图上由你批，改松要你同意」 | 客户端：面板已读的图（`ui/src/graph/source.ts` 的 `holdSource`），节点 `norm-merge-gate`、`norm-review-floor`；目录里没有带 `lists` 的条目 |
| 2. 默认规则与高峰模式 | 灰字「项目编排带来的 · 只能看；高峰时段来自 GLM 通道」；`builtin:glm-peak-pricing` 一行（标题括注 `peakHours.zh`、此刻是不是高峰与下一次变化、「只告知」、告诉模型的那一行与它所在行的状态、规则行的状态）；没有计价服务时换成「装了 GLM 通道包才有高峰时段，高峰模式现在不起作用」；高峰模式「高峰时 GLM 的活怎么办」：`peakModeIntro`、现在是哪一档与谁在何时选的、三档各一行 `PEAK_LEVEL_WORDS` 与「← 现在」文字、少做档的并行上限一行（执行行不在：「派活那一块还没装上，同时至多 1 个这一条现在只在提醒主 Agent」）、少做或不做档的高峰结束一行（循环行在：「…由循环板做」，不在：「循环板没装上：…」）、主 Agent 不受影响一行、读不到时的原因一行、不做档有单时的排队一行；四条附属条目各一行（哪一档启用、此刻启用没有、最近 7 天几次） | `src/rules/builtin.ts`（`GLM_PEAK_PRICING` 等五条、`builtinRulesFor`）；`stateOf`（`src/rules/peak.ts`）；`peakReader`/`clockReadings`（`src/rules/table.ts`）；`pricingService` 与 `peakHoursOf`（`src/shared/pricing.ts:90`）；`peakModeIntro`、`PEAK_LEVEL_WORDS`（`src/shared/peak-mode.ts:113、126`）；行状态 `activationState`（`src/shared/health.ts:216`，`loops`、`glm-prompt` 等）；7 天次数：违规流水里 `rules:builtin:<id>` 的记录过 `ruleStats` |
| 3. 你定的规则 | 每条「什么时候 · 筛选 · 动作」一行、条件此刻成不成立、范围、起始、期限、谁定的、最近 7 天真挡与只记下的次数（只记下的条目同一行写「这是你选的做法，不是试运行阶段」）；带脚本的：路径、「这台电脑上没有你看过原文的记录，先不跑」或「和你同意的那一版不一样」或「脚本文件不见了」、超时多久（来源「设计里定的固定值」，plain-ui §8.2 的过渡写法）、超时或出错时放行还是拦下与是不是默认；改法一行「要改：跟主 Agent 说「把这条改成……」；要解除：打 /rules lift <id>；要删掉：打 /rules delete <id>」；组尾「要加一条：跟主 Agent 说你要的规矩，例如「今晚 21 点以后别推送」，它会把要写的规则作为一个方案给你看」 | 项目状态 `state.rules`（来自仓库的 `docs/rules/rules.json` 或 `/rules`）；`tableOf`、`readingsOf`、`judge` 的条件值；`unapprovedScripts`（`src/rules/model.ts:494`）；超时与失败做法取条目字段，缺省取事件声明；7 天次数：违规流水 `rules:<id>`，`mode` 为 `enforce` 与 `record` 分开数。「4 周没用过，周报会提议删掉」不写：周报的提议（M7）不在 main |
| 4. 写在代码里的规则（启用即拦） | 每条人话标题、小字目录 id、「项目编排带来的 · 只能看」、所在行与它的状态、「最近 7 天拦下 N 次」、讲细点里最近 5 条（时间、拦下了什么、结局，规则 id 小字）、撤下一行（三种写法见下） | `CATALOG`（`src/rules/builtin.ts:136`）去掉第 2 组的五条；行状态 `activationState`；违规流水按条过 `ruleStats`（`denials.dialect + denials.other`）与最近 5 条拦下记录；撤下状态 `glmHournessLifts` 的 `lifted(cwd)`（`src/guard/lift-service.ts`） |
| 5. 信号与检测器 | `glm-peak` 一行（是/否到何时，或读不到的原因，括注宿主 pid）；每个开关一行（值、来源、起始、到期）与改法「要改：打 /rules on <名字> [时长] 或 /rules off <名字>；不要了：/rules delete <名字>」；组尾「要定义一个开关或加一个检测器：跟主 Agent 说你要测什么」。检测器在 main 上产生不了（没有 `detector-set`），没有它的行 | `projectSignals`（`src/rules/listing.ts:50`）、`clockReadings`；宿主 pid 为写 `view.json` 的那个宿主 |
| 6. 在等的工作 | 每张单一行（会话与 agent、调用摘要、哪条规则、何时起、状态）与「放行这一次：打 /rules let <单号>；取消：/rules cancel <单号>」；不做档的单另写 goal 是否已暂停与「这个会话本次高峰照常做：打 /rules let <单号>」；拥有它的宿主心跳过期写「宿主不在，下一次写入时过期」；`notices` 每条「主 Agent 下次走步时会收到」 | `openTickets`（`src/rules/listing.ts:45`）、`state.notices`、`liveHeartbeats`（`src/rules/heartbeat.ts`） |
| 7. 提议与恢复 | 恢复：§7.5 表里的说法、另存的旧存档路径、`unresolved` 每条与「照改：打 /rules recovery <编号> 照改；忽略：/rules recovery <编号> 忽略」；仓库里的规则文件被改过、欠一次写、有没提交的改动、这台机器第一次照仓库文件开始。没有内容时整组不显示。提议在 main 上产生不了（状态里没有 `proposals`），没有它的行 | `stateNotes`（`src/rules/listing.ts:19`）、`ProjectRead` 的 `recovered`、`unresolved`、`repo` |

撤下一行（第 4 组，plain-ui §4.7「拦下的记录与撤下」与 §8.2 撤下一行，板给 `liftHow`、`notLiftableBecause`、`liftedAt`、`restoreHow`）：

- `GUARD_RULES` 里 `liftVia: 'any'` 的条目（guard 的五条与 `graph:graph-files-only`、`loops:files-only`、`loops:schedule-tools`、`metrics:metrics-files-only`）：`liftHow` 为「跟主 Agent 说「撤下<标题>」」。这些行都经 `installRuleGate` 装门（`src/guard/index.ts:351`、`graph-files.ts:86`、`loops/guard.ts:157、185`、`metrics/rules.ts:297`），门在 `src/guard/gate.ts:162` 读 `liftedRules(root)`，所以 `guard_lift` 撤下对它们真生效。不写 `/rules lift`：main 上 `/rules lift` 只写规则板自己的 `rule-lift`（`src/rules/commands.ts:120`）。
- `guard:lift-files-only`（`liftVia: 'board'`）：`liftHow` 为 `null`，原因「它护着撤下记录本身，只能在规则板上撤，规则板还没接上」。
- `design:*`（M3 的主 Agent 规则）与 `rules:files-only`：`liftHow` 为 `null`，原因「这一条不在撤下的办法里，现在撤不了」（`resolveLiftRule` 只认 `GUARD_RULES`，`src/guard/lift-service.ts:63`）。
- 已撤下（`lifted(cwd)` 里有它）：`liftedAt` 取那一条的 `at`，`restoreHow` 为「要恢复：跟主 Agent 说「恢复<标题>」」，页面标「已撤下 · <日期>」。

板块登记（`ui/src/graph/boards.ts`）：`id: BOARD_ORDER[0]`（`'rules'`）、`label: '规则板'`；`available` 看这个会话的投影值 `hournessRules` 在不在；`homeLine`（Q2 的 A）：`view.peak.now` 为真时「GLM 高峰中，到 <时刻> · 高峰模式：<档名>」（没有结束时刻时去掉「，到 <时刻>」），否则在等的单数 N 大于 0 时「N 件事在等规则放行」，否则 `null`；不经 `homeLineFromItem`；`guideLine`「现在是：<档名>（出厂默认）」或「现在是：<档名>（你在 <时刻> 选的）」，读不到是不是高峰时「现在读不到是不是高峰（<原因>），档位是<档名>」，没有计价服务时 `null`；`peakApplies` 为有计价服务；`items` 为 `view.json` 的 `items`。两行都至多 60 个码点，超了截到 59 个加「…」。入口：首页页脚（`ui/src/graph/Panel.tsx:352`）、首页「现在」（`ui/src/graph/Home.tsx:120`）、上手页第 4 块（`ui/src/graph/Guide.tsx:71、92`）都已按登记表遍历，登记之后自动出现，不改这三个文件。

## 7. 批次

每批一个提交（第 0 批是合并提交），按序做，每批过四道门再进下一批。

门禁（每批，串行，退出码重定向到日志，不经管道）：

```powershell
New-Item -ItemType Directory -Force .llm\gate-logs | Out-Null
npm run build     > .llm\gate-logs\build.log 2>&1;     "build=$LASTEXITCODE"
npm run preflight > .llm\gate-logs\preflight.log 2>&1; "preflight=$LASTEXITCODE"
npm test          > .llm\gate-logs\test.log 2>&1;      "test=$LASTEXITCODE"
# 探针：先建 .llm/probe-lock（或 .llm/probe-lock-2）锁目录，建不成就等；锁目录超过 45 分钟算残留
npm run -s probe  > .llm\gate-logs\probe.log 2>&1;     "probe=$LASTEXITCODE"
```

`npm test` 时 `TEMP` 是系统临时目录。棘轮（`npm run lint`，已在 `npm test` 里）的上限是 main 现在的数（2026-11-05 在基点 `97dd7ba` 上实测，`npm run lint` 退出码 0）：**eslint 73 条压制，knip 基线 18 条，jscpd 基线 1 个克隆（7 行重复）**。任何一批都不许超过；不改三个基线文件。

提交：每次提交前 `Remove-Item Env:GIT_CONFIG_GLOBAL, Env:GIT_CONFIG_NOSYSTEM -ErrorAction SilentlyContinue`，核对作者是 `北方帝国@NorthGod`；信息写改了什么、为什么、门禁数字（测试数、探针 n/n、棘轮三数）。每批通过后 `git push origin rules-board-page`（不强推）。不改 `docs/graph`，不碰 `~/.dsh` 与桌面版。文件与提交里不写人设、语气词。

- [ ] 0. 合并 `origin/status-hub-2`。
      `git -C <工作树> fetch origin`，`git -C <工作树> merge --no-ff origin/status-hub-2`。预演（`git merge-tree`）只有两处冲突：`docs/DESIGN.md`（§2.6 状态板块，两边各改了标题括注与段落：按两边的事实合成一份，标题括注写全已实现的批次）与 `package.json`（`test` 脚本两边各加了 spec：两边的都留，次序照各自原位）。其余文件自动合并。合并提交信息写：合并 status-hub-2（第 4、7、8 批：guard 行交 `rules/denials`、`rules/lifts`，env 行交 `env/suppressions`，指标行交 `metrics/load`，真实运行时的 L3），status-hub-2 随本分支一起落到 main；列冲突怎样合的与门禁数字。
      Files：`docs/DESIGN.md`、`package.json`（冲突处）。
      Verify：四道门退出码都是 0；`npm run lint` 三数不超过 73/18/1；`git -C <工作树> merge-base --is-ancestor origin/status-hub-2 HEAD` 退出码 0。推送分支。

- [ ] 1. 宿主侧：规则行写页面数据 `view.json`，交投影 `hournessRules`。
      - 新建 `src/rules/view.ts`（不导入 Node 内置模块，客户端也导入它，同 `src/loops/view.ts`）：`RULES_VIEW_VERSION = 1`；类型 `RulesView`（`version`、`at`、`host`（pid）、`peak`（`applies`、`now?`、`until?`、`problem?`、`hoursZh?`、`level`、`origin`、`setAt?`、`via?`、`waiting`（不做档的单数与停着的子 agent 数））、`rows`（`rules`、`loops`、`glm-prompt` 等页面要说的行状态，含 `execute` 恒为 `absent`：main 上没有执行行）、`builtins`（第 2 组五条：id、标题、哪一档启用、此刻启用、7 天次数）、`rules`（第 3 组）、`code`（第 4 组：id、标题、行、行状态、`denials7d`、`last`（至多 5 条 `{at, what, outcome: 'block' | 'late', rule}`）、`liftHow`、`notLiftableBecause?`、`liftedAt?`、`restoreHow?`）、`signals`、`tickets`、`notices`、`recovery`（`stateNotes` 的行与 `unresolved`）、`items`（`StatusItem[]`）、`statusProblems`）；纯函数 `buildRulesView(input, nowMs)`（输入是已经读出来的东西：`ProjectRead`、peak 读数、是否有计价服务与 `peakHours`、行状态表、违规流水的记录、撤下状态、条目与行出错原因），按第 6 节的表与撤下一行的三种写法填；`parseRulesView(text): RulesView | undefined`（版本与几个数组的形状不对返回 `undefined`）。
      - 新建 `src/rules/projection.ts`：照 `src/loops/projection.ts` 全文的写法，`RULES_KEY = 'hournessRules'`、状态 `{projectKey, viewFile}`（`projectKey(project.root)` 与 `rulesPaths(root).runtimeDir` 下的 `view.json`），`stateVersion: 1`，`init` 不抛错，`apply` 原样返回。
      - `src/rules/store.ts`：`RulesPaths` 加 `view`（`<runtimeDir>/view.json`），`rulesPaths` 填它。
      - `src/rules/index.ts`：照 `src/loops/index.ts:167-169`，`ctx.inject(['sessionProjections'], …)` 里 `register(rulesProjection)`（不进 `inject` 名单、不改补丁，服务不在时行健康部分生效并写原因，同循环行）；写 `view.json` 的函数：对 `sessions` 里每个项目（同一项目取其中一个会话 id 去问 `collectStatus`），读状态（`read(cwd)`）、违规流水（`rowJournal` 用的同一个 `dataHomes(ctx, config.home)` 下的 `auditPaths(...).violations`）、`liftService(ctx)?.lifted(cwd)`、`collectStatus(ctx, sessionId, 'all', now())`，调 `buildRulesView`，内容（不计 `at`）与上次写的不同时以临时文件加改名写入（用 `config.io` 的存储操作，测试能注入改名失败）；触发：`agent/created` 的 `settle` 之后、`/rules` 命令之后、门写完一条违规流水之后（等那次写入落定再算，去抖 1 秒）、`BEAT_MS` 的周期里；行卸载前把待写的那一次写完。写不出时告警一次（每一串失败一次），行健康部分生效「规则页的数据写不出：<原因>」，下一次写成功后换回；不影响门与命令。
      - 读违规流水：status-hub-2 合进来的 `src/guard/index.ts` 状态视图里有一段把流水文本拆行、解析、`classifyRecord` 的代码；规则行要同一件事时把它提成 `src/guard/records.ts` 的一个导出函数，两处都调它，不复制（jscpd）。流水里规则 id 的写法：guard 一类是 `GuardRule.id`（不带行前缀，例 `workspace-containment`、`files-only`），规则板写的是 `rules:<id>`，M3 的主 Agent 规则按 `src/guard/main-agent.ts` 写的 `rule` 字段对；目录 id（`<行>:<id>`）到流水 id 的对应写成 `view.ts` 里一个函数，测试逐条钉住。注意 `loops:files-only` 与 `rules:files-only` 的流水 id 分别是 `files-only` 与 `rules:files-only`，按行区分，不能只看 id。
      - 文档同批：`docs/ORCHESTRATION.md` §16 加一小节「规则页的数据：`view.json` 与投影 `hournessRules`」（形状、何时写、谁的数、读不到时、与设计 §9.1「读」一段的差别与理由，即第 2 节第 3 条），§16 标题括注加这一项；`docs/DESIGN.md` §2.6 写规则板的板块路（`items` 经 `view.json`，同一个 `collectStatus`）与会话投影表（若有）加 `hournessRules`；`docs/DEVELOPMENT.md` 探针场景一节写新加的检查。
      - L2：新建 `tests/rules-view.spec.ts`（`buildRulesView` 每组的数据：两档以上的高峰模式与来源、计价服务不在/`peak` 抛错/在且高峰中、附属条目按档启用、人设规则的条件值与 7 天 `enforce`、`record` 分开数、带脚本规则的三种 `standing` 与失败做法的默认、代码规则 7 天次数只数 7 天内的、最近 5 条按时间倒序且至多 5 条、撤下三种写法与已撤下、`loops:files-only` 与 `rules:files-only` 不串、`items` 原样、`statusProblems`、空项目；`parseRulesView` 对坏版本与坏形状返回 `undefined`）；`tests/rules-row.spec.ts` 加：有 `sessionProjections` 时注册投影、`init` 对有项目/无工作目录/不在 git 项目的会话给的值；`agent/created` 之后与 `/rules peak 不做` 之后 `view.json` 写出且内容对；内容不变不重写；注入改名失败时告警一次、行健康部分生效、门照常判；`view.json` 的 `items` 深等于同一时刻 `collectStatus(ctx, sid, 'all', now).items` 里 `owner === 'rules'` 的那几条。新 spec 加进 `package.json` 的 `test`。
      - L3 探针（`scripts/probe/run-probe.mjs`，不加新的启动，检查加在已有场景上，名字以 `rules-page:` 开头；从 `packages/hourness/dist/rules/view.js` 导入 `parseRulesView`，与客户端同一个解析）：`glm-rules`：工作区 `.llm/rules/view.json` 过 `parseRulesView`；`rules:files-only` 一条 `denials7d ≥ 1` 且 `last[0].rule` 是它；人设规则 `r-probe-block` 的 7 天真挡次数为 1；`items` 里有 `rules/denials` 与 `rules/lifts`，`rules/peak` 的 `text` 等于同一次运行 `/hourness` 面板一节的第一行（status-hub 第 8 批已把这一行钉在收集器的 `rules/peak` 上）；`non-glm-rules`：`peak.applies` 为假，`items` 里没有 `rules/peak`；`rules-peak`：`/rules peak 不做` 之后 `peak.level` 为 `stop`、来源是人，`peak.now` 为真（探针时钟周三 15:00）。
      Files：新建 `src/rules/view.ts`、`src/rules/projection.ts`、`tests/rules-view.spec.ts`；改 `src/rules/store.ts`、`src/rules/index.ts`、`src/guard/records.ts`、`src/guard/index.ts`（只换成调提出来的函数）、`tests/rules-row.spec.ts`、`scripts/probe/run-probe.mjs`、`package.json`、`docs/ORCHESTRATION.md`、`docs/DESIGN.md`、`docs/DEVELOPMENT.md`。
      Verify：`node --experimental-strip-types tests/rules-view.spec.ts`、`node --experimental-strip-types tests/rules-row.spec.ts`、`node --experimental-strip-types tests/guard-status.spec.ts` 全过；四道门退出码 0，探针里 `rules-page:` 开头的检查全过；棘轮不超过 73/18/1。

- [ ] 2. 客户端的页面模型（纯函数，依赖第 1 批的 `src/rules/view.ts`；生产调用方在第 3 批接上）。
      新建 `ui/src/rules/model.ts`（不用 React、DOM、Node 内置模块，同 `ui/src/loops/model.ts`）：`buildRulesPage(view: RulesView | null, graph: { norm-merge-gate 与 norm-review-floor 两个节点的 title 与 acceptance，或不在 } , options)` 给出页头、条目块、第 1–7 组（第 6 节的字；第 1 组按 Q1 的 B，`homeLine` 按 Q2 的 A）；`rulesHomeLine(view)`、`rulesGuideLine(view)`（至多 60 码点，超长截断加「…」）；每个可改的条目一行改法，插件的条目没有改法；只记下的人设规则旁写「这是你选的做法，不是试运行阶段」；第 4 组不出现「只记下，不挡」「影子」「试运行」「转正」。
      L2：新建 `tests/rules-panel-model.spec.ts`（照 `tests/loops-panel-model.spec.ts` 的写法）：用第 1 批的 `buildRulesView` 造视图、经 `JSON.stringify` 与 `parseRulesView` 再进 `buildRulesPage`（读法整条走一遍）；组的次序与标题；高峰模式三档是文字、「← 现在」只在当前档；没有计价服务、读不到、不做档有单三种情形的字；撤下三种写法与已撤下；`homeLine` 三种情形（高峰中、不在高峰有单、都没有为 `null`；高峰中而有单时取高峰那一句）、`guideLine` 三种情形、都不超过 60 码点；第 1 组两张清单逐条原文、组尾那一句、节点不在时的那一句、没有判定旁注；全部固定字串与生成的样例行过 `plainWordsIn` 为空；`credential-read` 不出现。新 spec 加进 `package.json` 的 `test`。
      Files：新建 `ui/src/rules/model.ts`、`tests/rules-panel-model.spec.ts`；改 `package.json`。
      Verify：`node --experimental-strip-types tests/rules-panel-model.spec.ts` 全过；四道门退出码 0（探针不涉及客户端，照跑确认没退）；棘轮不超过 73/18/1。

- [ ] 3. 客户端：登记规则板、页面、读 `view.json`。
      - 新建 `ui/src/rules/source.ts`：读 `view.json` 的源，失败保留上一次内容并在页顶写原因、文件还不在不是失败（同 `ui/src/loops/source.ts`）。若与 `LoopsSource` 形成 jscpd 克隆，把两者共同的部分提进 `ui/src/graph/` 下一个模块（例 `view-file.ts`，泛型的解析与建模函数作参数），`LoopsSource` 同批改用它，不复制。
      - 新建 `ui/src/rules/board.ts`：照 `ui/src/metrics/board.ts` 的 `metricsBoard`（`boardSessions`、按会话持有源、`recompute`），`available` 为投影值 `hournessRules` 在、`homeLine`/`guideLine` 用第 2 批的两个函数、`peakApplies` 为 `view.peak.applies`、`items` 为 `view.items`；没变时返回同一个对象。与 `metricsBoard` 形成克隆时同样提共用部分。
      - 新建 `ui/src/rules/RulesPage.tsx`：照 `ui/src/loops/LoopsPage.tsx` 的版式（`<style>` 字串、灰字、`details` 讲细点），读 `view.json` 的源与面板的图源（`holdSource`），渲染第 2 批的模型；`installRulesBoard(ctx)` 调 `registerBoard`。
      - `ui/src/dsh.ts`：`ProjectionValues` 加 `hournessRules?: { projectKey: string | null, viewFile: string | null }`（同 `hournessLoops`）。
      - `ui/src/hourness-client.tsx`：`ctx.effect(() => installRulesBoard(ctx), 'glm-hourness-ui: rules board')`，排在循环板之前；文件头注释的板名单加规则板。
      - 文档同批：`docs/ORCHESTRATION.md` §2.10 登记的板加规则板（入口、只看、页面各组），§16 第 1 批加的那一小节补上页面：各组、与规则设计 0.10 §9.1 的三处出入与理由（第 1 组照列两张清单而不是一句话，Q1；第 4 组按 plain-ui 1.3 与 `d-code-rules-enforce`、`d-credentials-readable`；读法经 `view.json`），§16 标题括注与 §16.6「这一片没有做的」去掉「规则页与面板」、写明还没做的（`hits.json`、M7 的门与 `parseFloor`、周报的「4 周没用过」、`/rules lift` 接代码规则、R4d）；`docs/DESIGN.md` 客户端模块表；`docs/HANDOFF.md` 当前状态一行。
      - L2：`tests/rules-panel-model.spec.ts` 加：板的登记 id 与次序（`BOARD_ORDER[0]`，页脚排第一）、`available` 跟投影值、冷会话问一次投影、读到 `view.json` 后 `homeLine`/`guideLine`/`peakApplies`/`items` 对、`items` 与 `view.json` 的同一份深等、没变时 `snapshot` 是同一个对象、`checkedBoardState` 通过不告警；源：读失败保留上次并写原因、不是视图的文本、文件不在、`changes` 与 15 秒重读（`fakeRemote`、`fakeSessions`、`until`，`tests/panel-helpers.ts`）；静态检查 `ui/src/rules/` 不调 `remote.commands`、不写文件、没有 `<button`/`<input`/`radio`。
      Files：新建 `ui/src/rules/source.ts`、`ui/src/rules/board.ts`、`ui/src/rules/RulesPage.tsx`；改 `ui/src/dsh.ts`、`ui/src/hourness-client.tsx`、`tests/rules-panel-model.spec.ts`、`docs/ORCHESTRATION.md`、`docs/DESIGN.md`、`docs/HANDOFF.md`；可能新建 `ui/src/graph/view-file.ts` 并改 `ui/src/loops/source.ts`（只在 jscpd 报克隆时）。
      Verify：`node --experimental-strip-types tests/rules-panel-model.spec.ts`、`node --experimental-strip-types tests/loops-panel-model.spec.ts`、`node --experimental-strip-types tests/lessons-panel-model.spec.ts` 全过；四道门退出码 0；`npm run build` 产出的 `packages/hourness/ui/client.js` 含规则板的登记（preflight 通过即是）；棘轮不超过 73/18/1。

## 8. 落地（现有 land 步做，这里只记与本分支有关的两点）

- 分支里有第 0 批的合并提交。落地时 `git fetch origin`：`origin/main` 若已是 HEAD 的祖先，直接在用户的检出里 `merge --ff-only`；若 main 动过，用 `git rebase --rebase-merges origin/main` 让合并提交保持为一个合并（不用普通 rebase：它会把 status-hub-2 的提交拆平、丢掉合并），重跑四道门再快进。推 main 到 origin 再到 github，不强推，用 `git ls-remote` 核对。重写过的分支不强推回 `origin/rules-board-page`。
- 落地不改行的组成：没有新行、没有新包，补丁与 `inject` 名单都不变（投影经 `ctx.inject` 按需取，同循环行），所以不需要关闭重启桌面版；若实现中改了补丁或 `inject`，按任务书的桌面锁与 CDP 流程重启并核对。

## 9. 做完之后谁能接着走、留给桌面版 L4 的

- panel-2：做完条件第 8 条（页脚入口、插件条目只能看与改法、「会挡住动作的门」一组列出两张清单、带脚本条目的路径/版本/超时/失败做法）与上手页第 4 块（规则板登记后 `Guide.tsx` 自动显示，`peakApplies` 与 `guideLine` 由板给）。
- status-hub-remaining：规则板的 `items` 经 `snapshot().items` 上面板板页；板块路的一源（`view.json` 的 `items` 等于收集器 `owner === 'rules'` 的条目，L2 与探针各一例）。
- m6-followups S2：不因本次解开（第 5 节）。
- 留给 L4：桌面版里从页脚、首页「现在」与上手页第 4 块打开规则板；页面各组的样子与「讲细点」；`view.json` 改名替换之后 `changes` 能否接着报（设计 V4，未核实，15 秒重读兜底）；高峰中首页那一行。

## Digest

只列读过的。

- `ui/src/graph/boards.ts`：`BoardState {available, homeLine, guideLine, peakApplies, items?}`；`BOARD_ORDER = ['rules','loops','lessons']`；`registerBoard`（同 id 第二次 `console.error` 不覆盖）；`boards()`；`projectionBoard`；`checkedBoardState(boardId, state)`（行至多 60 码点、`items` 过 `validateStatusItem`）；`homeLineFromItem(items, itemId)`；`boardSessions()`（`subscribe`、`state`、`remember`、`listened`、`listenedWith`）。测试：`tests/lessons-panel-model.spec.ts`。
- `ui/src/graph/board-state.ts`：`useBoard(board, sessionId)`；`ui/src/graph/Home.tsx:66-72,120`（`BoardLineInner` 显示 `homeLine` 并 `onBoard(board.id)`）；`ui/src/graph/Panel.tsx:81,258,352`（页脚 `BoardLine`、`openBoard`）；`ui/src/graph/Guide.tsx:71-96`（`boards().find(id==='rules')`、`PeakBlock`、`peakApplies`）；`ui/src/graph/common.tsx:183` 错误边界。三处入口不改。
- `ui/src/loops/board.ts`（`projectionBoard`，`available` 看 `hournessLoops.projectKey`）、`ui/src/loops/source.ts`（`LoopsSource`：`WatchedFiles`、`holder`、`parseView`、`took`）、`ui/src/loops/LoopsPage.tsx`（`LOOPS_CSS`、`EntryItem`、`useViewFile`、`installLoopsBoard`）、`ui/src/loops/model.ts`（`buildLoopsPage`）。测试 `tests/loops-panel-model.spec.ts`（导入 `src/loops/view.ts` 的 `buildView` 与客户端模型、`fakeRemote`/`fakeSessions`/`until`）。
- `ui/src/metrics/board.ts`：`metricsBoard(page, deps)`，`boardSessions` 加按会话 `holdMetricsSource`，`recompute` 里 `listenedWith`、`remember`；测试 `tests/metrics-board.spec.ts`。
- `ui/src/hourness-client.tsx`：`apply` 里 `ctx.effect(() => installLoopsBoard(ctx), 'glm-hourness-ui: loop board')` 等三行；`inject` 已含 `remote.workspaceFiles`、`sessions`。
- `src/rules/index.ts`：`apply(ctx, config)`：`sessions: Map<sessionId, cwd>`、`reading = peakReader(ctx, now)`、`read = projectReader(rulesDir)`、`createHeartbeat({... catalog: CATALOG.map(... activationState ...)})`、`settle(sessionId, cwd)`、`rulesCommand`（之后 `tickets.reconcile()`）、`installRulesGate({... journal: rowJournal(name, () => dataHomes(ctx, config.home)) ...})`、`provideRowStatus(ctx, 'rules', sid => rulesStatusItems(view, reading(), pricing, now()))`（约 :284）、`agent/created`/`session/disposed` 监听、`every(guarded(...), PASS_MS)` 与 `BEAT_MS`（5 000 与 15 000）、卸载返回 `Unload`。`inject = ['tools', 'commands']` 不改。
- `src/loops/index.ts:167-169`：`ctx.inject(['sessionProjections'], projectionCtx => projectionCtx.sessionProjections.register(loopsProjection))`；`src/loops/projection.ts` 全文是投影的样板。
- `src/rules/status.ts`：`rulesStatusItems(view, reading, pricing, nowMs, zone?)`；`src/report/panel.ts:470` `peakStatusItems`（`rules/peak` 的 `text` 是「- 」开头的报告行）。
- `src/report/status.ts:80`：`collectStatus(ctx, sessionId, audience, nowMs): {items, rows}`；`STATUS_ROWS = HEALTH_ROWS`。
- `origin/status-hub-2:src/guard/status.ts`：`guardStatusItems(input, nowMs, offset?)` 交 `rules/denials`（有拦下时）与 `rules/lifts`（项目已知时恒有）；`origin/status-hub-2:src/guard/index.ts`：`provideRowStatus(ctx, 'guard', …)`，就地按行解析违规流水。
- `src/guard/measure.ts:71`：`ruleStats(records, {since: '7d', now})` → `rules: Map<rule, {denials: {dialect, other}, followups, last?}>`。
- `src/guard/catalog.ts`：`GUARD_RULES`（`{id, row, title, blocks, liftVia}`，十条，`lift-files-only` 为 `board`）；`src/rules/builtin.ts:136` `CATALOG`（`GUARD_RULES` 映射成 `<行>:<id>`、`design:<id>`、`rules:files-only`、五条默认与附属条目）；`src/rules/model.ts:605` `CatalogEntry`（没有 `lists`）。
- `src/guard/lift-service.ts`：`LIFT_SERVICE = 'glmHournessLifts'`、`liftService(ctx)`、`lifted(cwd): LiftState[] {rule, at, via, words}`、`resolveLiftRule`（只认 `GUARD_RULES`）；`src/guard/gate.ts:162` 门读 `liftedRules(root)`；`installRuleGate` 的调用方 `src/guard/index.ts:351`、`src/guard/graph-files.ts:86`、`src/loops/guard.ts:157,185`、`src/metrics/rules.ts:297`。
- `src/rules/commands.ts:120`：`lift` 只写 `rule-lift`。
- `src/rules/listing.ts`：`stateNotes:19`、`rulesInForce:34`、`openTickets:45`、`projectSignals:50`；`src/rules/table.ts`：`tableOf:15`、`readingsOf:23`、`clockReadings:38`；`src/rules/model.ts:494` `unapprovedScripts`；`src/rules/store.ts:30,46` `RulesPaths`、`rulesPaths`。
- `src/shared/peak-mode.ts:113,126` `PEAK_LEVEL_WORDS`、`peakModeIntro`；`src/shared/pricing.ts:90` `peakHoursOf`；`src/shared/health.ts:216` `activationState`；`src/graph/plain-question.ts:72` `plainWordsIn`。
- `scripts/probe/run-probe.mjs`：`:104-111` 从 `packages/hourness/dist/...` 导入；循环板 `view.json` 的读法与检查 `:2091-2100`、`:2972`。
- `package.json`：`test` 脚本是一串 `node --experimental-strip-types tests/<x>.spec.ts &&`，新 spec 追加进去（knip 靠它认测试入口）。
- 已验证：基点 `97dd7ba` 上 `npm run lint` 退出码 0（eslint 73 条压制、knip 18、jscpd 1 个克隆 7 行）；`git merge-tree HEAD origin/status-hub-2` 只报 `docs/DESIGN.md`、`package.json` 两处冲突。build、preflight、`npm test`、探针本步没有跑（setup 步已在工作树里装好依赖）。
