# 用户图设计 0.2：第 2 轮独立评审

被审：`.agents/tasks/user-graph/design.md` 0.2（第 2 稿，1166 行），`graph-ops-design.json`（13 条批注草稿，文中引用 0.2）。
评审轮次：2。评审者：与作者不同的 agent（只看文件，不带写稿时的上下文）。
结论：CHANGES_REQUESTED。HIGH 0 条，MEDIUM 4 条，LOW 7 条。挡路 4 条。挡路趋势 12 → 4。

核对方式：读了 design.md 全文与 `graph-ops-design.json` 全文（BOM 检查：无；解析为 13 项数组）；读了第 1 轮的 `design-review-1.md` 与 `design-review.json`，逐条核对 17 条发现是否关闭；对照源码读了 `src/graph/schema.ts`、`format.ts`、`validate.ts`、`engine.ts`（`apply`、`planPropose`、`planChange`、`planStatus`、`planEdit`、`initialStatus`、`LLM_EDITABLE`、`HUMAN_ONLY`、`TRANSITIONS`）、`stage.ts`（`designColumns`、`releaseSet`、`requirementCard`）、`projection.ts`、`src/execute/gate-lock.ts`、`src/execute/brief.ts`（`subjectOf`）、`src/shared/tool-names.ts`、`ui/src/graph/Panel.tsx`、`NeedsYou.tsx`、`model.ts`；`.worktrees/m3` 里的 `src/design/talk.ts`、`record.ts`；M3 附录 0.5 §3.6 至 §3.8，M7 0.6 §2.4、§3.2.3、§3.4.3、§3.8.1 至 §3.8.3、§3.9.4 至 §3.9.5；图上 `d-timeout-measured` 的正文与四条历史。另外手算了 §2.9 夹具的全部预期输出。

0.2 对第 1 轮的 17 条都有实质性的回应，多数改法与评审建议一致或更好（入口显式连线、`relink`、走法命令移到 `norm-merge-gate`、后台作业、`live`、显式夹具）。夹具的预期输出我逐行重算过，与规则一致。本轮剩下的问题集中在三处：新文件名与 main 上已有文件重名；两个新写工具没有进入 M7 对子 agent 的工具面清单；对话式修改与问人流程在「撤掉草稿」和「放行页重新比对」两处还有空缺。

---

## 第 1 轮发现的关闭情况

| 第 1 轮 | 严重度 | 状态 | 依据 |
| --- | --- | --- | --- |
| 1 入口与回环 | HIGH | Closed | §2.3 流程节点上显式的 `next` 为入口；`flow:entry` 判据改为「恰好一条且目标 `live`」；§2.9「搜书」夹具含「没搜到→入口」；验收第 22 条。我重算：回到入口的环不影响入口，显示顺序从入口深度优先，成立。 |
| 2 转述核对与多次写入 | HIGH | Closed | `relink` 与 `graph_relink`；§3.5 示范改成两次调用、每个节点一次；§4.2 全表重排；验收第 12、13 条（第 13 条要求走真实的 `main-agent-graph-relay`）；m3 批注加 `graph_relink` 与 `graph_walk`。对照 M3 §3.8 第 1 条（起点是目标节点最后一条非批注历史，`graph_propose` 新节点为 0），示范成立。遗留的相关空缺见新发现 3。 |
| 3 走法命令的信任边界 | HIGH | Closed | 命令只来自 `norm-merge-gate` 的 `walk <种类> $ <命令>` 行；流程正文只写种类与预计秒数；放行之后改 `title` 与走法种类要人的原话（§3.4）；放行页由 harness 追加每条流程的命令原文与超时并计入「给人看过」；命令的起法沿用 M7 §3.8.1。我核对：`engine.ts` 的 `LLM_EDITABLE` 不含 `acceptance`，所以已批准的 `norm-merge-gate` 的验收确实只有人的权限能改。 |
| 4 退出码规则 | MEDIUM | Closed | §2.7「一条规则」五款与验收第 34 条五个用例一致；§2.9「处理逾期」（3 步通过、1 步没过、命令退出 1）能由规则推出。 |
| 5 「你来走」 | MEDIUM | Closed | `graph_walk` 由工具生成 `@提交`；`dispatch_task` 返回 `walk_unready`；用 `propose_to_human` 的 `question` 建待决；新鲜度改为「祖先加只差图文件」。遗留的小问题见新发现 5、11。 |
| 6 走一遍的执行方式 | MEDIUM | Closed | 后台作业、钉住 `T`、门禁锁、`hourness.walk-done`、空转计数、对账、报告契约进 `kind: test` 任务的简报。遗留的小问题见新发现 6。 |
| 7 复核角色 | MEDIUM | Closed | `walk-review` 的启动者、模型、输出 schema、映射、重试与计数都有了。遗留的小问题见新发现 7。 |
| 8 服务者粒度 | MEDIUM | Closed | 任务级与模块级连线的两级含义、`leavesOf`、特性上限 20 及被拒时的正路、§4.3「分解时把任务连到步骤」、§2.9 显式夹具。遗留的小问题见新发现 8。 |
| 9 `live` | MEDIUM | Closed（引出新发现 1） | `live` 的定义与全部判定改用它；§4.2 加废弃流程与角色两行；验收第 19 条。 |
| 10 `source` 污染规划栏 | MEDIUM | Closed | V6：用户节点的 `source` 只能指 `question`；验收第 5、25 条。对照 `stage.ts` 的 `designColumns`（只数指向该决策的 `source`），成立。 |
| 11 超时与 `d-timeout-measured` | MEDIUM | Closed | 我读了该节点的历史：2026-10-31 08:17 的裁定已把「超时一律等于 3 倍运行时间，先用这个估计」定为第一次的值，0.1 的写法本来相符；0.2 补了 `walk-limits.jsonl`（来源、旧值、依据）、晨报一行、放行页的数字、超上限只告诉主 Agent。 |
| 12 面板「不服务任何步骤」标记 | MEDIUM | Closed | §6.2 改为只取 `gapsOf` 的 `work:orphan`；验收第 42 条。 |
| 13 证据增长、`unlink` 历史 | LOW | Closed | 节点上留最近 10 条；`unlink` 的历史取真实的连线。 |
| 14 格式与取值 | LOW | Closed | `WALK_REF_PATTERN`、`WALK_NOTE_PATTERN`、`USER_LIMITS` 一处写死；放行项补了 `label` 与 `hint`；`RoleView.state` 有取值规则。 |
| 15 编号与引用 | LOW | Closed | §15 指向、A1 至 A10、U2 文件清单含 `tool-names.ts`、`glm-exec-walk`、m3 批注「九处」与一至九对得上。 |
| 16 旧版本读新图 | LOW | Closed | §7.4 如实写出整个节点读不进来。 |
| 17 U4 与面板先后 | LOW | Closed | U3 带面板临时过滤；`Panel.tsx` 第 93 行与 `NeedsYou.tsx` 第 52 至 54 行我核对过，确是两处使用点。 |

---

## 发现

### 1. MEDIUM：`src/graph/live.ts` 已经存在，设计把它当新文件

位置：§3.1 改动一览（`src/graph/live.ts（新）`）、§1.4 的 U1 标题、§3.6、§8.3 「废弃的角色、流程、步骤…`liveOf` 一处实现（`live.ts`）」、§10.1 U1 的文件列、`graph-ops-design.json` 的 m7 第二条（周报「底线清单该加」一项）。

问题：main 上的 `src/graph/live.ts`（8,655 字节）是面板的实时现场投影：导出 `FOCUS_TOOL`、`LIVE_KEY`、`liveProjection`、`placeOf`、`LiveView`，被 `panel-row.ts`、`reminder.ts`、`run-control.ts`、`tools.ts` 和 `ui/src/graph/agents.ts` 导入，`m3`、`m3-flow`、`m5`、`m6`、`rules-loops` 各工作树也带着它。设计里「新建 `live.ts`，导出 `liveOf`」照做就是覆盖这个文件，面板的实时页和主 Agent 的步骤提醒会一起断；合并时则冲突。第 1 轮评审者读的是同一个目录，这条是 0.2 为了回应发现 9 才新增的文件名。

修法：改名，例如 `src/graph/user-live.ts`（导出 `liveOf`）。把 design.md 里全部出现处（§1.4 U1 标题、§3.1、§3.6、§8.3、§10.1 U1、§11 的 m7 行第 ⑩ 项）和 `graph-ops-design.json` 的 m7 第二条（第七点里的 `live.ts`）同步改。验收第 19 条不用动。

### 2. MEDIUM：两个新写工具没有进入 M7 对子 agent 的工具清单，§8.3 说「已有，不动」不成立

位置：§4 开头一句、§8.3 的「子 agent 不写图 | M7 `worker-graph-readonly` | 已有，不动」、§11 的 m7 行与 `graph-ops-design.json` 的两条 m7 批注、§3.5 新工具 `graph_relink`、`graph_walk`。

问题：M7 0.6 §3.2.3 的 `worker-graph-readonly` 按名字列了九个写工具（`graph_propose`、`graph_status`、`graph_edit`、`graph_link`、`graph_unlink`、`graph_verify`、`graph_decide`、`graph_approve`、`graph_reject`），§2.3.2 的工具面表与 `faces.ts` 的过滤按同一份九个名字从 worker 与审查者的工具面里去掉它们（「少九个工具的 schema」）。本设计把 `graph_relink`、`graph_walk` 加进 `GRAPH_TOOL_NAMES` 与 `ORCHESTRATION_RESIDENT_TOOLS`，却没有请 M7 把这两个名字加进上面那两处。后果：子 agent 的工具面里会多出两个写工具的 schema；按名调用时，M7 的兜底规则不拦。现在能挡住的是别的东西（M3 的 `main-agent-graph-relay` 对子会话的 `relay` 一律拒绝，`graph_walk` 因此调不成；`graph_relink` 对非自己草稿的节点没有转述就 `forbidden`），但这是巧合，不是 M7 声称的「只有主 Agent 与 harness 两个写入方」。

修法：m7 批注加一条：`worker-graph-readonly` 的拒绝名单与 faces 的去除名单从九个名字扩到十一个，加 `graph_relink`、`graph_walk`，并加测试；`walk-review` 角色（M7 登记表的新成员）按审查者处理，进同一份 faces 过滤。§8.3 那一行改为「M7 的清单要加两个名字（§11）」，§4 开头一句同步。

### 3. MEDIUM：撤掉草稿或未批准的用户节点没有写法，§4.2 的 `graph_status` 对它们会失败

位置：§4.2 的「删一步」「不要这条流程、这个角色了」两行与表前一段「放行之前…所有改动都是改自己的草稿」，§3.7 的 `waitingProposals` 与临时过滤，§3.4 权限表的 `approve`、`reject`、`status` 三行。

问题：
- 引擎的 `planStatus` 对 `proposed` 节点一律返回 `bad_transition`（「a node is a proposal… a human approves or rejects proposals」）；`reject` 属于 `HUMAN_ONLY`，`llm` 只有带转述才能做。所以访谈与设计阶段人说「预约这条流程不要了」，或主 Agent 自己想合并两个草稿步骤，唯一的路是 `graph_reject` 带人的原话；表里写的 `graph_status dropped` 只对已批准的节点成立。草稿阶段（§4.2 说所有改动都是改自己的草稿）没有任何一行写怎样撤掉一个节点，主 Agent 只能把它改成别的东西留着，放行时被批准。
- `reject` 不级联。拒绝一条 `proposed` 流程之后，它下面的 `proposed` 步骤仍是 `proposed`。`live` 把它们排除在推导之外（对），但 `listOpenItems().proposals` 是「全部 `proposed` 节点」，`Panel.tsx` 的等待数和 `NeedsYou.tsx` 的列表会一直把这些步骤当作「等批准」。§3.7 的临时过滤只按阶段过滤，放行之后这些孤儿提议会永远留在「需要你」里。

修法：§4.2 加两行：「撤掉草稿或未批准的节点」写成 `graph_reject` 带人的原话，逐个节点各一次（它下面的 `proposed` 节点要各自拒绝，因为 `reject` 不级联），已批准的节点才用 `graph_status dropped`；同一句原话对每个节点只用一次，次序同其他行。`waitingProposals` 与 `NeedsYou` 的过滤加一条：祖先不 `live` 的用户节点不算等批准；验收第 26 条加这一例。

### 4. MEDIUM：模块放行页追加段含易变内容，「重新渲染逐字比较」会让人的同意反复失效

位置：§5.3（「写出每步现在的状态」「这些步骤还有别的模块也在做」）、§5.2 末段（`record_human_answer` 用当时的图重新渲染并逐字比较）、§1.4 第 29、30 条、m3 批注第二、三、四点。

问题：模块放行发生在别的模块已经在开发的时候（两层循环），这时追加段里的每步状态（排上了、在做）和「别的模块也在做」随别的模块的任务推进不停变化；人隔了几十分钟或一夜才回话，重新渲染的文字几乎必然与给他看的不同，`record_human_answer` 返回 `not_shown`，主 Agent 重提，人再回，下一次又可能变。大循环页也有一处同类来源：主 Agent 在等人回话时按 `serves` 登记的开发账（不要转述，随时会写），会改变「这一步还没有人负责」那类括号文字。M3 已有的机制是按 `{id, rev}` 核对放行集合（`Shown.releaseSet`），不是比对文字；本设计在这之上加的文字比对没有区分「人要同意的内容」与「渲染时的现状」。

修法：把追加段分成两块：人要同意的稳定内容（角色、流程、步骤标题与顺序、条件、怎样算做成、走法与命令原文、模块级的归属）参与重新渲染比较；现状类的字（每步状态、别的模块、孤儿任务数）渲染在比较范围之外，并写明「截至给你看的时刻」。验收第 29、30 条各加一例：别的模块的任务状态变了，同意仍然有效；步骤标题变了，同意失效。

### 5. LOW：含 `proposed` 步骤的流程，`graph_walk`、报告核对与 W4 对「哪些步骤」说法不一致

位置：§2.7「谁能写」（`steps`「每个 `live` 步骤一项」）、报告核对（「每个 `id` 是这条流程的 `live` 步骤」）、`walk-review`（「覆盖每个 `live` 步骤」）、W4（「节点是 `live` 的已批准步骤」）、§5.5 第 1 步前提。

问题：放行之后主 Agent 不带转述加的步骤是 `proposed` 且 `live`。人走完这条流程，`graph_walk` 的 `steps` 要包含它，写到它时 W4 返回 `bad_transition`；自动走法的报告若覆盖它，作业写证据也撞同一条。§5.5 第 1 步的前提没有挡住这种流程。

修法：§5.5 第 1 步前提加「present 的流程里没有 `proposed` 的 `live` 步骤」，不满足时 `walk_unready` 并列出；§2.7 里「每个 `live` 步骤」统一改成「每个 `live` 且已批准的步骤」。

### 6. LOW：走一遍作业持门禁锁最长 5 小时，别的检查最多等 60 分钟

位置：§2.7「走一遍作业」第 2、4 步，验收第 33 条，对照 `src/execute/gate-lock.ts`（`GATE_WAIT_MS` 60 分钟、`GATE_STALE_MS` 6 小时）。

问题：作业为了钉住门禁工作树的 `T` 整个期间持锁，总时长上限 5 小时，在锁的陈旧判定之内，这一点我核对过。但期间别的目标的 `check_commit` 等 60 分钟就返回 `gate_busy`，worker 的合入停住。设计没有写这个后果和处理。典型的走一遍几分钟，问题只在多条流程都慢时出现。

修法：给作业总时长一个更低的上限（例如 45 分钟，低于 60 分钟的等待），超过的流程标 `not_run`，下一次 `dispatch_task` 接着走；或写明 `gate_busy` 时主 Agent 重试，并在验收第 33 条加一例。

### 7. LOW：`walk-review` 的「只读边界」没有对应机制

位置：§2.7 `walk-review` 的「只读边界：只给产物目录副本的读权限，不给写工具、不给图的写工具、不给 shell」。

问题：M7 的角色边界是工具面过滤加 `tools/pre-execute` 规则（审查者：只能写 `.hourness/` 里的报告，对图只能批注），没有按目录限定读权限的机制；DSH 的读文件工具能不能把图片交给模型也是 A3、A6 之外没有写明的一环。

修法：改成「沿用审查者的边界：无写工具、无 shell、对图只读；产物的路径写进它的 prompt」，去掉「只给副本目录的读权限」；A6 补一句「读文件工具能把图片交给模型，未核实；不成立时 `截图` 不可用」。

### 8. LOW：§2.9 夹具缺步骤的 `acceptance`；示范里的 id 与夹具的 id 对不上

位置：§2.9 节点表、§3.5 示范的 `step-11`。

问题：节点表没有 `acceptance` 一栏，预期缺口里没有 `step:no-expect`；照表造夹具的实现者得自己决定，选了「没写」就会多出 22 条缺口，与预期表不符。另外夹具里 `step-11` 是最后创建的（10-31 16:00），编号却在 `step-12` 至 `step-22` 之前；§3.5 示范里的 `graph_propose` 不带 `id`，引擎会取下一个空号（夹具里是 `step-23`），第二次调用写死的 `to: 'step-11'` 在测试里要用第一次返回的 id。

修法：节点表加一句「每个步骤都有一条非空 `acceptance`」；示范的第二次调用里 `to` 写成「第一次返回的 id」，验收第 13 条的测试照此取值。

### 9. LOW：几处与 main 现状不符的小处

位置：§15 A10、§3.7 的 `ui/src/graph/model.ts` 一行、m7 批注第一条末与 §3.7「`execute/brief.ts` `subjectOf`」一行。

问题：A10 把 `talk.ts` 列为「不在 main 上」，`src/design/talk.ts` 在 main 上（只是 M3 的 `Shown` 等改动在 `m3` 分支）；`remainingOf` 不在 main 的 `ui/src/graph/model.ts` 里（它属于未放行的面板 1.1），该行的「`remainingOf` 同」要移到 1.1 的请求里；`subjectOf` 现在对用户节点返回 `undefined`，由 `briefGate` 拒绝，设计里的「返回 `not_dispatchable`」是新增拒绝码，不是 `subjectOf` 的返回值。

修法：逐处改成与现状一致的说法。

### 10. LOW：没有任何缺口提前发现「这条自动走法的流程没有测试任务」

位置：§2.7「命令从哪来」末段（测试由 `kind` 为 `test` 的任务写并 `serves` 连步骤）、§2.6 缺口表、§5.5 第 1 步前提。

问题：自动走法的流程若没有任何 `kind: test` 且 `serves` 了它的步骤的任务，第一次发现是整个目标做完之后走一遍报「报告缺失」。

修法：加一个只标出、不挡写入的缺口 `flow:no-test`（自动走法的流程，其步骤没有 `kind: test` 的服务者），在分解提醒与派发状态提醒里出现；是否挡 `walk_unready` 由作者定，建议挡。

### 11. LOW：`graph_walk` 证据的 `note` 内容没写怎么截，`HEAD` 的含义没写

位置：§2.7「证据怎么写」的 `note` 一行、「谁能写」。

问题：人走的 `note` 内容限 200 个码点，但 `relay` 的第一行可能更长，工具怎么截没写；`@提交` 取项目根的 `HEAD`，人实际走的构建不一定是它（例如他在跑一个旧的开发服务器），这一点没写，完成检查会把这当作「人走的就是这个提交」。

修法：写明工具超过 200 个码点就截断并加 `…`；在 `graph_walk` 的说明与 §2.7 里加一句：请人走一遍时，主 Agent 要告诉他走的是哪一个提交（`HEAD`），他走的不是它就先重新部署。

---

## 已核实的假设

1. `src/graph/engine.ts`：`LLM_EDITABLE = {title, body, slope, decider, …DISPATCH_FIELDS}` 不含 `acceptance`，所以 `norm-merge-gate` 的验收对不带转述的 `llm` 与 `harness` 不可改（自己的 `proposed` 草稿除外）。设计关于「命令只来自人批过的清单」的论证成立。
2. `engine.ts` 的 `initialStatus` 对 `role`、`flow`、`step` 这类不在任何例外里的类型，非特权写入得 `proposed`，特权写入得 `approved`，与 §3.4 一致。
3. `planChange` 的 `link`、`unlink` 按（类型，目标）查找，历史里的 `edge` 取请求的值，所以「`unlink` 历史取真实的连线」是对现有代码的改动，且需要 `format.ts` 的 `edge` 检查器同时认 `when`（该检查器同时用于节点的 `edges` 与历史的 `edge`，核对过）。
4. `apply` 对非 `llm` 身份带 `relay` 返回 `invalid`，`harness` 写 `walk` 不带转述，与 W4 一致。
5. `stage.ts` 的 `designColumns` 数「指向该决策的 `source`」；V6 把用户节点的 `source` 限制在 `question`，规划栏不被污染。`releaseSet` 取目标子树里全部 `proposed` 节点，需要过滤不 `live` 的用户节点（设计已写）。
6. `ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/`，`{flow}` 换成节点 id 进 shell 命令不需要转义。
7. `validateGraph` 对任何节点的未知父节点与未知连线目标报 `error`，并且 `engine.apply` 遇到任何 `error` 就整体 `graph_invalid`；`next` 的环不在检查之列。设计「`next` 环合法、`depends` 环仍报错」成立。
8. `src/execute/gate-lock.ts`：重试 5 秒、等待 60 分钟、陈旧 6 小时，与设计引用的数一致；5 小时的作业上限低于 6 小时。
9. M7 0.6 §3.8.1：`parseGateNorm` 只认列出的写法，其余条目是说明文字。`walk <种类> $ <命令>` 行本来就不会被当成检查命令；设计请求显式跳过是多一层保险。§3.8.1 第 341 行：`.hourness/` 被加进 `<git>/info/exclude`，报告目录留在门禁工作树里不会触发 M7 §3.8.3 第 5 步的「没被忽略的新文件」快照。
10. M3 附录 0.5 §3.8：第 1 条的起点规则、第 2 条 c/d 两款（只拦 `graph_approve` 与带转述的 `graph_propose`，不拦 `graph_reject`）与设计的使用方式相容；放行之后的目标上带转述提议用户节点不被拦。
11. `Panel.tsx` 第 93 行、`NeedsYou.tsx` 第 52 至 54 行就是设计说的两处等待数使用点。
12. `d-timeout-measured` 的节点历史：08:17 与 12:56 两条裁定确认「第一次超时 = 3 倍估计」，下限写在上限旁边，放行页写来源，实测的 3 倍超过上限只告诉主 Agent；设计的 §2.7 与这些一致。
13. §2.9 夹具逐行重算（步骤状态、流程折叠、角色折叠、计数、缺口、特性服务数、任务进度）全部与预期表一致。
14. `graph-ops-design.json`：UTF-8、无字节序标记、解析为 13 项数组、每项是 `{"op":"comment","id","text"}`；m3 条目「九处」与一至九对得上；12 个目标节点在第 1 轮核对过全部存在。
15. 设计满足简报的约束：只写在 `.agents/tasks/user-graph/`，例子取图书管理系统，文件里没有语气词或人设用语，请求全部写成批注草稿。

## 未核实或不成立的假设

不成立：
1. §3.1 等处：`src/graph/live.ts` 是新文件（发现 1）。
2. §8.3：子 agent 不写图「已有，不动」（发现 2）。
3. §4.2：`graph_status` 为 `dropped` 可用于撤掉用户节点（发现 3，对 `proposed` 节点不成立）。
4. §15 A10：`talk.ts` 不在 main 上（发现 9）；§3.7：`remainingOf` 在 main 的 `model.ts` 里（发现 9）。

未核实（作者已列或应补）：
1. `walk-review` 能通过读文件工具看到图片（A3 只提可靠性；发现 7）。
2. provider 目录是否标明图片输入（A6，作者已列）。
3. M3 的 `Shown`、`record_human_answer` 对 `confirm` 的扩展、M7 的 `dispatch.ts`、`drive.ts` 在 main 上还没有，只能对照设计与 `m3` 分支（A10，作者已列）；我读了 `m3` 分支的 `talk.ts` 的 `Shown`（有 `releaseSet: {id, rev}`、`after` 上限 16,000 个码点），与设计要扩展的位置相符。
4. 状态推导在 300 个节点内的耗时（A4，作者已列）。

## 对 `graph-ops-design.json` 的意见

草稿合规。发现 1、2 要改动：m7 第二条第七点里的 `live.ts` 改名；m7 条目加「`worker-graph-readonly` 与 faces 的名单加 `graph_relink`、`graph_walk`，`walk-review` 进 faces」。发现 3 要在 m8-plain-language 条目的第三点补「祖先不 `live` 的用户节点不算等批准」。发现 4 要在 m3 条目第三、四点补「追加段分稳定部分与现状部分，只比较稳定部分」。

## 判定

存在 0 条 HIGH、4 条 MEDIUM。CHANGES_REQUESTED。第 3 轮是最后一轮；4 条 MEDIUM 都是局部修改，不需要重画结构。
