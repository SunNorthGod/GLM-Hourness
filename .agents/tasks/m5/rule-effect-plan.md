# m5-rule-expected-effect 计划

节点：`m5-rule-expected-effect`（父 `m5`，人 2026-11-05 原话「那两件也按你说的来」）。依据：每周阅读 2026-11-05 报告结论 1 第 3 件（A5、D3、D10）。工作树 `.worktrees/m5-rule-expected-effect`，分支 `m5-rule-expected-effect`，起点 `8560d80`（origin/main 之后已到 `d22057f`，只多了图与 L4 记录，不碰本节点的文件）。

干净区：本文件不写人设与语气词。

## 1. 现状（实读）

- 规则提议到人面前只有一条路：主 Agent 用 `propose_to_human`（`kind: question`，`form: recommend`）。规则板的 `rules_propose` 与 `attach: rules:…` 一路还没有（`ATTACH_BOARDS` 为空，`src/design/attach.ts`；规则板 §9.3 的 R3 在 `rules-r4d`，未开工）。
- 学习流水线（`src/memory/learning.ts`）：规则提议的落点是节点上一条 `学自：<键>` 批注（`noteLandings`），任何节点上的这种批注都算落点。提醒文字 `LEARNING_NOTICE` 只说「A rule proposal goes to the person with propose_to_human.」。
- 晨报：今天的晨报是 `/hourness`（`src/workflow/morning-report.ts` 的 `morningReport`、`reportFromFiles`）。M7 P2 的四答晨报与周报（`m7-6`、`m7-8`）在 m7 分支，未合入。
- 指标流水（`src/metrics/read.ts` 的 `readLog`）里有 `rule`（guard 的拦下与晚到的拦下，`body.rule` 是不带行前缀的规则 id，循环板的带 `loops:`）与 `rules.judged`（规则板，`how: block` 是拦下）。人的纠正不在指标流水里，在项目图的历史里（`src/memory/signals.ts` 的 `correctionSignals`，纯函数）。
- 代码规则的目录：`src/rules/builtin.ts` 的 `CATALOG`（`<行>:<id>`，加规则板的默认规则）。人设的规则要等 R3 才有。

## 2. 设计（agent 定，可推翻）

### 2.1 预期效果一栏的形状

`propose_to_human` 加一个可选参数 `rule`（只给 `kind: question`、`form: recommend`）。带 `rule` 的问题就是规则提议：

| 字段 | 必填 | 内容 |
| --- | --- | --- |
| `change` | 是 | `add`（加一条规则或加严）或 `lift`（撤下一条规则） |
| `effect` | 是 | 给人看的一句：哪个数、往哪边变；一行，至多 60 个码点，过换词表，不含 `·` |
| `metric` | 是 | harness 核对的数：`corrections:<组键>`（人纠正这一类的次数，组键同 `learning_signals`，不收 `depth:*`）或 `denials:<规则 id>`（这条规则拦下的次数，规则 id 取 `CATALOG`） |
| `direction` | 是 | `down` 或 `up` |
| `days` | 是 | 同意之后多少天核对，整数 7–56 |
| `lift` | `lift` 时必填 | 撤下的规则 id（`CATALOG`） |
| `cover` | `lift` 时与 `ablation` 二选一 | 覆盖同一类调用的替补规则 id（`CATALOG`，不等于 `lift`） |
| `ablation` | `lift` 时与 `cover` 二选一 | 单层消融的结果原文，1–6000 码点；像 `sample` 一样原样接在问话后面，`record_human_answer` 同意前核对主 Agent 原样给人看过（`sampleSeen`，`src/design/talk.ts` 的 `exactOf` 多读这一处）；与 `sample`、`attach` 互斥 |

缺字段或不合格时 `invalid`，`field` 是 `rule.<字段>`，`hint` 写怎么补。

给人看的：harness 在问话（与 `choose` 的列表）之后接一段，「预期效果：<effect>；同意后 <days> 天核对，没做到会写进晨报。」，撤下时再一行「撤下 <lift>，替补是 <cover>，它也管同一类调用。」或「撤下 <lift>，没有替补，单层消融的结果在下面。」；`ablation` 在最后。

图上存的：问题节点的 `body` 开头一段（有 `attach` 时在 attach 正文之前，attach 正文仍以提议行结尾），逐行：`规则提议：新增` 或 `规则提议：撤下 <lift>`、`预期效果：<effect>`、`核对：<metric> 变少|变多，同意后 <days> 天`，撤下时 `替补：<cover>` 或 `替补：没有，附了单层消融的结果`。读回只认这几行的精确写法（`src/memory/effect.ts`）。带这一段的问题改稿时要再带 `rule`（同 attach 的改稿规矩），只给 `question` 与 `text` 的再展示不改它。

学习流水线：问题节点上的 `学自：<键>` 只有在这个问题带预期效果一段时才算落点（别的类型的节点照旧）。提醒文字与 `learning_signals` 的说明改成「规则提议用 `propose_to_human` 带 `rule`」。

### 2.2 到期核对

纯函数在 `src/memory/effect.ts`，晨报调用：

- 同意时刻：问题状态 `done` 的最后一条 `decide` 的 `at`。没拍板、被否、放弃的不核对。
- 到期 = 同意 + `days` 天；之前的窗口 = [同意 − `days` 天, 同意)，之后的窗口 = [同意, 到期)。
- 数：`corrections:<键>` 用 `correctionSignals` 在项目图上数；`denials:<id>` 在指标流水里数 `rule`（拦下与晚到的拦下）与 `rules.judged`（`how: block`），事件里的规则名等于 id，或 id 是 `<行>:<事件里的名>`。
- 达到：`down` 之后严格少于之前，`up` 严格多于之前；相等算没达到。
- 核对不了：`denials` 没有指标流水，或流水最早一条晚于之前的窗口起点。
- 旧规则的数（D10）：同意得更早、仍在 `done` 的规则提议，用这一条的两个窗口数它们各自的数，往它们自己预期的反方向走了就记为「往回走了」。
- 晨报一节 `## 规则提议的核对`：到期落在报告时刻之前 7 天内的，没达到、核对不了、或有旧规则往回走了的才列；都达到了不出这一节。

## 3. 现在能做的（本分支）

1. 第一批：`rule` 参数、校验、给人看的一段、图上的一段、改稿规矩、`ablation` 的核对、学习流水线的落点与提醒文字；M5 设计、`ORCHESTRATION.md` §8.5 与 §3.1 相关一条同批改。L2：缺预期效果各字段被拒并有 hint；撤规则缺替补也没附消融被拒；带替补与带消融两种给人看的样子；附消融未原样给人看时同意被拒、给了之后通过；改稿缺 `rule` 被拒；问题上的 `学自` 无预期效果不算落点。
2. 第二批：到期核对与晨报一节；`ORCHESTRATION.md` §12、M5 设计、`HANDOFF.md` 的 M5 一行同批改。L2：到期达到不列、没达到列出（带两边的数）、核对不了列出原因、旧规则往回走了列出、没到期不列、过了 7 天不列。
3. 门禁：每批 build → preflight → test → lint 棘轮（eslint 73 / knip 18 / jscpd 1）；改了工具参数与 `/hourness` 输出，跑一次 L3 探针（拿 `.llm/probe-lock` 或 `-2`）。

## 4. 等别的线的（本分支不写占位代码）

- R3（`rules-r4d`，规则板 §9.3 的 `rules_propose` 与 `attach`）：`rules_propose` 的 `rule`、`lift`、`remove` 提议带上同一个 `rule` 字段；`propose_to_human` 带 `attach: rules:…` 而规则板说这是规则或撤规则时缺 `rule` 被拒（要 `attachable` 交回提议的种类）；人设规则的 id 进 `metric`、`lift`、`cover` 认得的名单（今天只认 `CATALOG`）。
- M7 P2（`m7-6` 晨报、`m7-8` 周报）：四答晨报与周报接上 `## 规则提议的核对` 同一份结果；周报「4 周没用过，提议删掉」的删除提议走同一套撤规则的规矩。
- 状态板块（`status-hub`）：晨报各节改读状态条目时，这一节改成记忆行交的一条条目。
- 单层消融的跑法（`ablation`）：harness 自己跑单层消融还没有；今天 `ablation` 是主 Agent 交来的结果原文，harness 只核对人看过。

## 5. 进度

- [ ] 第一批
- [ ] 第二批
- [ ] L3
- [ ] 推送 origin
