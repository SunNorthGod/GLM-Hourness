# 去掉 L1/L2/L3，决策流水记录去掉分级，晨报读图：附录第 10 步的独立评审

评审对象是 `.worktrees/m3`（分支 `m3`）上这一步唯一的提交 `5b6e77d`，18 个文件，+480/−156。我读了整个提交，对照附录 0.6 第 10 步一节、基础设计 §3.5.3、§8 表第 10 行与降级表的晨报一行、`onepage.md`、`design-context.md`、`brief.md`（含编排方的几条裁定）、图上的 `m3-5`、`norm-review-floor`、`d-status-hub`、`d-metrics-ratios-person-only`，以及 `docs/DEVELOPMENT.md` §1.1。`review-step10.md` 之前不存在，这是第一轮。上一步遗留的 S9-9（没留门禁日志）这一步已经改了。

门禁没有重跑。采用的记录是工作树 `.llm/step10/` 里的日志（被 git 忽略，不在 `impl/notes/`）：`results.txt` 记 build、preflight、test 的退出码都是 0；`final-test.log` 里 79 个 spec 的 `# tests`、`# pass`、`# skipped` 加起来是 1321、1320、1，失败 0，与提交说明一致；`probe.out.log` 末行 206/206，没有 FAIL，新检查那行是 PASS；`lint.out.log` 是 eslint 243 条压制、knip 基线 20 条、jscpd 基线 1 处。源码最后一次改动在 19:14，测试 19:20，基线文件 19:16，probe 从 19:20:18 开始，最终的 build、preflight、test 在 19:37 到 19:40，提交在 19:40:56，所以每道门禁都在最后一次改动之后。工作树 `git status` 为空，比 `origin/m3` 多这一个提交。

我另做了两件只读的事：数本仓库图上全部问题节点的 `decide` 历史怎么归类；数 `.llm/audit/decisions.jsonl` 每条记录的 `level` 与 `kind`。没有写任何文件，没有留脚本。

## 摘要

这一步删掉 `gradeDecision`、`DecisionLevel`、`FIVE_KEYS`（整个 `src/workflow/decisions.ts`），`DecisionRecord` 与 `DispatchPanelRow` 去掉 `level`，workflow 行写 `{at, kind, subject}`。晨报去掉「例外」里的 `[L3]` 行和「决策曲线」，新增「等你定的事」一节：`/hourness` 经图行服务 `dirFor` 取调用会话的图，待你定的件数、最早一件的日期、agent 自己要定的件数取 `openItems()`，本期拍板次数扫全部待决节点的 `decide` 历史，不取只有 20 条的 `recentDecisions`，读不到图时写原因。`m3-5` 的第三条验收满足；基础设计 §8 第 10 行点名的用例都在；唯一的偏离是 L3 场景从 `glm-decision-card` 改到 `glm-design-question`，理由成立（`glm-decision-card` 自第 6 步起已不存在）。三个基线都只缩小。没有阻塞项。

Watch for：（1）S10-1，「你在对话里说」只认「标记加 `relay`」。本仓库图上问题节点共 52 条 `decide`，其中 39 条是只带 `relay`、没有标记的转述，这一节会把它们数成 agent；面板对同一份历史把任何带 `relay` 的读作「你在对话里说的」，两处对不上（confirmed，数过）。（2）S10-2，「你定」的记录带标记和原话，被数成「你在对话里说」，决定却是主 Agent 做的（confirmed）。（3）S10-3，图有校验错误时 `loadGraph` 不抛错，坏掉的待决节点从计数里静默消失（confirmed 读代码，未运行）。（4）S10-4，代码注释与 ORCHESTRATION §5 把 `relay` 说成「harness 核对过的原话」，这只对 `record_human_answer` 和主 Agent 的图工具成立（confirmed）。

**Verdict**: APPROVED

## 高层视图

旧流水读得对，审计链没有丢东西。本仓库 `.llm/audit/decisions.jsonl` 有 15 条，全是 `level: L1`、`kind: dispatch:*`，用户级目录下没有这个文件。读的一侧只取 `at`、`kind`、`subject`，盘上没有改写任何一行；新晨报把这 15 条按 `dispatch:` 前缀全数成派遣类调用，与旧报表的「L1 自主 15」一致。`gradeDecision` 只对 `dispatch` 给 L1，写入方只有 workflow 行，所以删掉 `[L3]` 例外行不丢任何实际记录。这只对现在的写入方成立：以后若有别的写入方往同一文件写非派遣类记录，晨报不再显示它们（`isDispatch` 的注释已写明）。

「你在对话里说」只从核对过的人话里数，这一点成立，而且比附录严一步。附录写「按 `ANSWER_MARKS.agree` 开头的 `decide` 历史认」；实现要求 `actor` 为 `llm`、`reason` 以标记开头（`answerKindOf`）、并且带 `relay`。`record_human_answer` 写的决定三样都有，L3 新检查在真实宿主上读回「你 0 · 你在对话里说 1 · agent 0」；模型在自己的 `reason` 里写标记而没有原话的数成 agent，L2 用例钉住。代价是旧式转述全部落到 agent 一栏，且与面板的读法不一致（S10-1）。

读图失败有预案：图行没启用、会话没有工作目录、目录不存在、读图出错四种原因各有用例，其余部分和派遣类调用一行照常，`apply` 没有新增会抛错的路径。图有校验错误的情形没有区分（S10-3）。

没有任何东西挡住主 Agent 或碰高峰。提交里没有 `src/guard/`、`src/rules/`、`src/design/`，没有工具面改动，没有读档位、排队或定时的代码；`/hourness` 是人发的命令，读图是一次异步目录读取。编排方对 S4-1 等的裁定涉及的文件这一步都没碰。

过程规则满足：一个提交，信息点名 `m3-5` 和附录 0.6 第 10 步；ORCHESTRATION、DESIGN、HANDOFF、DEVELOPMENT 四份文档同批；knip 21→20、jscpd 2→1、eslint 抑制两项 10→5 与 11→9，diff 里没有新增压制注释；没有新行，没有碰 `~/.dsh`。提交说明的五条解释里，1 比附录严（对 `record_human_answer` 的路径无影响），2 见 S10-2，3 是基础设计原文要求，4、5 是签名与降级，与设计一致；请编排方记成 agent-decided。门禁日志在 `.llm/step10/`，清理工作树之前请拷一份到 `impl/notes/`。

<details>
<summary>Issues (5)</summary>

1. **S10-1 「你在对话里说」只认标记加 `relay`，旧式转述全数成 agent，与面板对不上**（MEDIUM，不阻塞，confirmed）：本仓库图上问题节点共 52 条 `decide`：1 条 `human`，39 条 `llm` 只带 `relay`，12 条 `llm` 什么都没带，0 条带标记。按全部历史算，这一节写成「你 1 · 你在对话里说 0 · agent 51」，而面板 `ui/src/graph/model.ts:160` 的 `decidedBy` 把带 `relay` 的读作「你在对话里说的」。请编排方裁定：给「转述、未核对」单列一栏，或在 agent 一栏后注明其中转述的数目，或把面板的读法对齐。`d-status-hub` 刚定下面板与晨报是同一份数据的同一种说法。
2. **S10-2 「你定」的记录被数成「你在对话里说」**（LOW，不阻塞，confirmed）：`record_human_answer` 对「你定」写同样的标记和原话，`conclusion` 以 `DELEGATED` 开头，决定是主 Agent 做的（附录 §3.7）。提交说明的解释 2 已披露。按 `conclusion` 的开头把它们数到 agent，或在 ORCHESTRATION §5 写明这一类算在「你在对话里说」里。
3. **S10-3 图有校验错误时晨报静默少数**（LOW，不阻塞，confirmed 读代码，未运行）：`loadGraph` 不为校验错误抛错，`parseGraph` 把坏掉的节点文件丢出 `nodes`、只记 `issues`，`readAsks` 不看 `issues`。坏掉的待决节点不进「等你定的 N 件」，也不进拍板计数。用 `hasErrors(graph)` 在这一节加一行「图有 N 处校验错误，数字可能不全」，其余数字照出。
4. **S10-4 「harness 核对过的原话」的说法比事实宽**（LOW，不阻塞，confirmed）：`morning-report.ts:50` 的注释和 ORCHESTRATION §5 把 `relay` 写成核对过的原话，并把「只带 `relay`、没有标记」说成「原话没经 harness 核对」。`main-agent-graph-relay` 只核对主 Agent 的图工具；普通会话的 `relay` 不查（`main-agent-graph.ts:39`），标记是任何写入方都能写的文字，所以普通会话里「标记加任意 `relay`」会被数成「你在对话里说」；主 Agent 用 `graph_decide` 带核对过的原话、`reason` 自己写的，又被数成 agent。两处措辞收窄到「`record_human_answer` 写的」，去掉括号里「原话没经核对」的断言。
5. **S10-5 拍板者分计是不给模型看的那一类数**（NIT，likely）：在 M5、M7 把晨报投给主 Agent、或并入状态板之前，标明这一节只给人看。依据见细节末节。

</details>

<details>
<summary>Details</summary>

### 「你在对话里说」的核对到哪一层

`deciderOfEntry`（`morning-report.ts:48`）：`actor` 为 `human` 记「你」；`actor` 为 `llm`、`answerKindOf(entry) === 'agree'`、`entry.relay !== undefined` 记「你在对话里说」；其余记 agent。`record_human_answer` 对 `agree` 调 `engine.apply('llm', { op: 'decide', conclusion, reason: ANSWER_MARKS.agree + 调用记号, relay })`（`record.ts:606`），`relay` 是 `personSaid` 对会话投影核对过的原话，核对不成立时在写之前就拒绝。所以这条路径的计数建立在核对过的人话上。L2 钉了三个边界：只有标记没有 `relay` 数成 agent，只有 `relay` 没有标记数成 agent，`actor: human` 带标记数成「你」。

核对不是对所有写入都有，这是 S10-1、S10-2、S10-4 的来源。

在本仓库里跑 `/hourness`，「你在对话里说」会一直是 0：39 条转述是编排方带人的原话经命令行或图工具写的，图的命令行以 `llm` 带任意 `relay` 写，不核对（`main-agent-graph.ts` 文件头对 `main-agent-graph-cli` 的说明；那条规矩只管会话里的写入）。把它们数成 agent 是保守的，符合「不从模型的转述里数」；问题在标签。「agent」一栏里混着「人说了、没核对」的决定，读的人会以为是 agent 自己拍的。面板那边的 `decidedBy` 对同一份历史给出另一个说法，而 `d-status-hub` 要消掉的正是这种面板与晨报对不上。

「你定」：`recordedAs` 以 `DELEGATED` 开头，历史条目里存着 `conclusion`（`engine.ts` 的 `planConclude`），按它的开头拆开只是一行判断。附录原文只说按标记认，所以这是一个要编排方定的口径，不是实现偏离。

普通会话：`main-agent-graph.ts` 文件头写明普通会话的 `relay` 不检查，标记是文字。普通会话用编造的 `relay` 和以标记开头的 `reason` 调 `graph_decide`，在引擎里已经有人的权限，在晨报里也会被数成「你在对话里说」。这与引擎现有的信任等级一致，不是这一步开的口子；主 Agent 的 `relay` 被核对，子 agent 的被拒。所以要改的只是 S10-4 的措辞。

### 图有校验错误

`store.ts:26` 的 `loadGraph` 只在目录读取出错时抛；节点文件不是合法 JSON、字段不合法、`id` 与文件名不符时，`parseGraph` 把它丢出 `nodes` 并记一条 `error` 级 `issues`，返回正常的 `LoadedGraph`。`askSummary` 照常数这样的图。写图的路径（`engine.ts:167`、`design/tool-support.ts:137`）遇到这种图会拒绝，所以这件事能被别处发现，只是晨报给出的是看起来完整的数字。基础设计降级表只列了「图行不在、目录不存在、读图抛错」，不算验收未满足，所以不挡。

### 只给人看的数

`d-metrics-ratios-person-only`（已批准）和宪章「指标不给模型看」把问法分布、原样同意的比例这类数留给人。这一节按拍板者分计，不是比率，但同属「人跟不跟 agent」的数。今天它只出现在 `/hourness` 的命令结果里，基础设计的 L3 场景说明写明命令事件不进模型请求（`design.md` L3 场景里 `/graph-apply` 那一例，约第 1022 行），没有泄漏。`d-one-main-agent` 把晨报交给主 Agent 做，`d-status-hub` 要求每一条标明给谁看；这两件落地时，这一节要标成只给人看，或不随晨报文字发给主 Agent。依据是两条已批准的决定，没有看到 M5、M7 的实现，所以是 likely。

</details>

<details>
<summary>File map</summary>

完整改动：`git -C .worktrees/m3 show 5b6e77d`。

- `src/workflow/decisions.ts`：删除（`gradeDecision`、`DecisionLevel`、`FIVE_KEYS`）
- `src/workflow/morning-report.ts`：「等你定的事」一节、`askSummary`、`deciderOfEntry`、`GraphReader`、`localDay`；去掉 `[L3]` 行与决策曲线；`reportFromFiles` 多一个图读取参数
- `src/workflow/index.ts`：workflow 行写 `{at, kind, subject}`
- `src/memory/audit.ts`：`DecisionRecord` 去掉 `level`，注释说明旧行带 `level` 被忽略
- `src/report/index.ts`：`graphReader` 经图行服务找图，四种读不到的原因
- `src/report/panel.ts`：`DispatchPanelRow` 去掉 `level`
- `scripts/probe/run-probe.mjs`：`glm-design-question` 末步调 `/hourness` 并核对该节
- `tests/workflow.spec.ts`、`hourness.spec.ts`、`s5.spec.ts`、`memory-audit.spec.ts`：随之改写与新增
- `docs/ORCHESTRATION.md`、`DESIGN.md`、`HANDOFF.md`、`DEVELOPMENT.md`：现状、§5 晨报与流水、行说明、独立评审行与探针一节
- `knip-baseline.json`、`.jscpd-baseline.json`、`eslint-suppressions.json`：只缩小

</details>
