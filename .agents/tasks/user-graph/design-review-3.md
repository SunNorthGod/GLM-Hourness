# 用户图设计 0.3：第 3 轮独立评审

被审：`.agents/tasks/user-graph/design.md` 0.3（第 3 稿，1207 行），`graph-ops-design.json`（14 条批注草稿，文中引用 0.3）。
评审轮次：3（最后一轮）。评审者：与作者不同的 agent。
结论：CHANGES_REQUESTED。HIGH 0 条，MEDIUM 2 条，LOW 6 条。挡路 2 条。挡路趋势 12 → 4 → 2。第 3 轮仍有 MEDIUM，按流程该模块在本回路里不能通过，另写 `align-stop-report.md`。

核对方式：读了 design.md 全文与 `graph-ops-design.json` 全文（UTF-8，无字节序标记，解析为 14 项数组，每项 `{"op":"comment","id","text"}`）；读了第 2 轮的 `design-review-2.md` 与 `design-review.json`，逐条核对 11 条发现；对照源码读了 `src/graph/schema.ts`（`STATUSES`、`TASK_KINDS`、`isPassingEvidence`、`HistoryEntry`）、`engine.ts`（`apply`、`commit`、`initialStatus`、`planStatus`、`planEdit`、`reject` 一支、`TRANSITIONS`、`HUMAN_ONLY`、`LLM_EDITABLE`）、`projection.ts`（`OPEN_STATUSES`、`gatesOf`、`listOpenItems`）、`src/execute/brief.ts`（`subjectOf`、`briefGate`）、`src/design/talk.ts`（导出）、`src/shared/tool-names.ts`、`ui/src/graph/model.ts`、`Panel.tsx`、`NeedsYou.tsx`；M3 附录 0.5 §3.5 第 4 至 6 步、§3.6、§3.8 全部五条、§3.14.5；M7 0.6 §2.3.2、§3.2.3 的九个图写工具名单。另外把 §2.9 夹具的全部预期输出重新手算了一遍（含新加的 `flow:no-test`、`task-13`、`task-14`）。

0.3 对第 2 轮的 11 条都有实质性回应。夹具重算与表一致。本轮发现的两条挡路问题都不在第 2 轮改动的范围里，是核心定义与写入规则的写法问题：`live` 的定义把进行中和做完的特性、任务排除在外；W1 至 W5 没有说明查整个节点还是只查这次写入新增或改动的部分。两条都是一两句话的修改，不需要重画结构。

---

## 第 2 轮发现的关闭情况

| 第 2 轮 | 严重度 | 状态 | 依据 |
| --- | --- | --- | --- |
| 1 `live.ts` 重名 | MEDIUM | Closed | 全文检索：除说明「为什么不叫 `live.ts`」的三处和修订记录外，没有裸的 `live.ts`；§1.4 U1 标题、§3.1、§3.6、§8.3、§10.1 U1、§11 m7 ⑩、`graph-ops-design.json` 第 3 条第七点都用 `user-live.ts`。main 上 `src/graph/live.ts` 存在，`user-live.ts` 不存在，核对过。 |
| 2 M7 的图写工具名单 | MEDIUM | Closed | §4 开头、§3.1、§8.3 改成「九个扩成十一个」；U2 同批改 M7 两处名单与 `tests/contracts.spec.ts` 对照；验收第 15 条含 L3 `glm-exec-dispatch` 的九个改十一个（M7 §9 第 1616 行确有这句断言）；`graph-ops-design.json` 第 4 条。M7 §3.2.3 与 §2.3.2 按名字列九个，核对过。 |
| 3 撤掉没批准的节点 | MEDIUM | Closed | §4.2 加「撤掉还没批准的节点」一行，逐个 `graph_reject`；`engine.ts` 第 486 至 487 行 `reject` 只收 `proposed` 且不级联，`planStatus` 第 559 行对 `proposed` 一律 `bad_transition`，与设计一致；§3.4 表、§3.7 `waitingProposals`、验收第 26 条、第 44、45 条同步。M3 §3.8 第二条只拦 `graph_approve` 与带转述的 `graph_propose`，不拦 `graph_reject`，路走得通。残留的小问题见新发现 6。 |
| 4 放行页易变内容 | MEDIUM | Closed | `renderUserGraph` 返回 `{stable, state}`；§5.2、§5.3 稳定部分与现状部分分开；`record_human_answer` 两步核对；验收第 28 至 30 条加了别的模块推进时同意仍有效、标题或归属变了时同意失效的用例。M3 §3.5 第 5b 步的「整段在 `Shown.after` 里」与新增的重新渲染比较不冲突（新增一步 5c 即可）。 |
| 5 含 `proposed` 步骤的流程 | LOW | Closed | §5.5 第 1 步 b；§2.7 统一为「`live` 且已批准」；验收第 15、33、35、37 条。 |
| 6 作业持锁时长 | LOW | Closed | `WALK_JOB_MS` 45 分钟小于 `GATE_WAIT_MS` 60 分钟（`gate-lock.ts` 数值第 2 轮已核对）；验收第 33 条加假时钟用例；§8.1 加一行。措辞上的小缺口见新发现 8。 |
| 7 `walk-review` 边界 | LOW | Closed | 改为沿用审查者边界；A6 补了读文件工具交图片的假设；U5b 的 L3 场景用真实小图验。 |
| 8 夹具缺 `acceptance` 与 id | LOW | Closed | §2.9 写明每步都有非空 `acceptance`，夹具直接造文件、id 不按创建顺序；§3.5 示范的第二次调用取第一次返回的 id；`nextId` 取 `step-N` 形式，与夹具命名一致。 |
| 9 与 main 不符的说法 | LOW | Closed | `talk.ts` 在 main 上且只导出 `TALK_GUIDE`、`ProposalKind`、`HIDDEN_FROM_MAIN_AGENT`；`remainingOf` 移到面板请求；`subjectOf` 对用户节点返回 `undefined`（`brief.ts` 第 159 至 170 行：非目标、任务、特性的类型落到 `return undefined`）、`briefGate` 得 `bad_task`，设计改成「不改，加测试」。 |
| 10 `flow:no-test` | LOW | Closed | §2.6 缺口表、§4.3、§5.4、§5.5 第 1 步 a、§6.5、夹具（搜书、还书）、验收第 16 条边界用例。我重算夹具：搜书三步叶子是 `task-4` 至 `task-6`，无测试任务，有该缺口；还书叶子 `task-8`、`task-9`，有；登录、录入新书因 `task-13`、处理逾期因 `task-14` 没有；借书因 `step-11` 无任务叶子，判据未成立。 |
| 11 `note` 截断与 `HEAD` | LOW | Closed | 取前 199 个码点加 `…`，整条至多 242 个码点；`dispatch_task` 与 `graph_walk` 的结果带提交；A11 列为残余风险。 |

---

## 发现

### 1. MEDIUM：`live` 的定义把进行中和做完的特性、任务排除在外，与引擎的状态集合和 §2.9 夹具矛盾

位置：§2.5 第一段「**`live`。**」（「当且仅当它的 `status` 是 `proposed` 或 `approved`，并且沿 `parent` 到目标之前的每个祖先也满足同样的条件」「特性与任务也用同一个函数」）；同一节的 `serversOf`、`leavesOf`（「递归取 `live`、`kind` 不是 `review` 的特性与任务子节点」）；§3.1 `user-live.ts` 一行；§2.6 `work:orphan`；验收第 19、20 条。

问题：引擎的 `STATUSES` 是 `proposed`、`approved`、`doing`、`done`、`dropped`、`superseded`（`schema.ts` 第 11 行），`TRANSITIONS` 里 `approved` 可到 `doing`、`done`。特性与任务绝大部分时间处在 `doing` 或 `done`。按 §2.5 的字面定义，`liveOf` 对一个 `doing` 的任务、一个 `done` 的任务、一个 `done` 的特性都返回假，它们下面的子孙也因祖先不满足而返回假。于是：
- `serversOf` 对任何已开始或做完的服务者返回空。§2.9 夹具里没有一个服务者满足字面定义：`feat-account`、`feat-catalog`、`feat-overdue` 是 `done`，`task-7` 是 `doing`，`task-8`、`task-9` 自己是 `approved` 但父特性 `feat-lending` 是 `doing`，不满足「祖先也是」。夹具里全部 22 个步骤因此都变成 `unserved`，与预期表（`walked`、`built`、`failed`、`building`、`planned`）相反；
- `work:orphan` 只会检查 `proposed`、`approved` 且祖先同样的活，夹具里的大部分任务和特性被排除在检查之外；
- 同一节随后的句子「叶子的状态：`done` 是做完，`doing` 是在做」本身就要求 `doing`、`done` 的叶子被 `leavesOf` 取到，与 `live` 的定义自相矛盾。

用户节点只存四种状态，所以这个定义对 `role`、`flow`、`step` 是对的。错在第 2 轮之后（0.2 为回应 `live` 的发现）加了「特性与任务也用同一个函数」，没有改定义。夹具测试（验收第 16 条）会在实现时暴露，但这是后面所有判定（状态、计数、缺口、放行项、完成项）依赖的定义，规格上必须先对。

修法：把 `live` 改写成：「节点 `live`，当且仅当它的 `status` 不是 `dropped` 或 `superseded`，并且沿 `parent` 到目标之前的每个祖先也不是。用户节点只存 `proposed`、`approved`、`dropped`、`superseded` 四种，所以对它们等于『`proposed` 或 `approved`』；特性与任务还包括 `doing` 和 `done`。」其余用到 `live` 的地方不用动（`proposed` 与 `approved` 的区分另有写法，如「已批准的步骤」）。验收第 19 条加一例：一个 `done` 的特性及其下 `doing`、`done` 的任务都 `live` 并被 `serversOf` 取到；一个 `dropped` 的特性使它下面的 `doing` 任务不再 `live`。`graph-ops-design.json` 第 1 条里 live 的括号说明只针对用户节点，可保留。

### 2. MEDIUM：W1 至 W5 没有写明查整个节点还是只查这次写入新增或改动的部分，按字面读会让已有的连线卡住不相干的写入

位置：§3.4「写入规则……在 `commit()` 里对要写的节点用写后的整图检查」与 W1 至 W5 表；§1.4 第 11、14 条；§4.2「删一步」「不要这条流程」两行；§4.3 末段（删一步之后服务它的活变成孤儿，由主 Agent 决定废弃或改去服务别的步骤）；§2.6 `work:orphan`（「`serves` 只指向不 `live` 步骤的活」是被设计接受的状态）。

问题：设计自己允许一种存量状态：任务 T 的 `serves` 指向一个后来被废弃的步骤 S（§4.2 删步骤、§4.3 孤儿）。W2 写「`serves` 的目标是 `live` 的步骤」，W5 写「`next` 的目标是 `live` 的步骤」。`engine.ts` 的 `commit()` 对每个草稿节点做 `checkNode` 整节点检查，所以实现者按「对要写的节点用写后的整图检查」自然会遍历这个节点的全部边。这样一来：
- 主 Agent 对 T 做 `graph_status done`（带提交证据，开发的正常收尾），或 `graph_edit` 改它的 `body`，会因 W2 得到 `invalid`，`hint`「先恢复那一步，或连到取代它的步骤」，而正路其实是先 `graph_unlink`；
- 对某个 `next` 指向已废弃步骤的步骤 P 改 `body`，会被 W5 拒绝，直到 `graph_relink`；
- 恢复一个已废弃的任务，会因它的服务步骤数超过上限而失败（W1），虽然这次写入没有新增任何连线。

引擎里已有按「这次写入改了哪些字段」判断的先例：`planEdit` 里 `questionRefusal(checked, field => fields.includes(field), 'set')` 只对本次设置的字段查待决卡面规则。设计没有说 W 系列走哪一种，验收第 11、14 条只测「新增连线被拒」，没有一条测「存量连线不挡别的写入」，所以实现按整节点做了也会全绿。

修法：在 §3.4 的 W 表前加一句：「W1 至 W5 只查本次写入新增或改动的部分：新加的 `serves` 与 `next`（`link`、`propose` 带的边、`relink` 列表里新出现的项）、本次改的 `kind`（W3）、本次写的 `walk` 证据（W4）。节点上原有的连线、以及本次没动的字段不再查；`graph_status`、`graph_edit` 其他字段、`graph_unlink`、恢复节点对存量边一律不因 W1 至 W5 被拒。」验收第 11 条加一组用例：任务 T 的 `serves` 指向已废弃的步骤时，`graph_status done`、`graph_edit body`、`graph_unlink`、`graph_status dropped` 都成功，新增一条指向该步骤的 `serves` 被拒；步骤 P 的 `next` 指向已废弃步骤时，`graph_edit body` 成功。

### 3. LOW：每个任务最多服务 3 步，与「测试任务连到它覆盖的步骤」的说法不匹配

位置：§2.4 条数表（任务 3）、§4.3「同一时刻，每条自动走法的流程要有一个 `kind` 为 `test` 的任务，连到它覆盖的步骤」、§2.6 `flow:no-test` 判据。

问题：一个端到端测试任务通常覆盖整条流程（几步到十几步），上限 3 条挡住了「连到它覆盖的步骤」的字面做法。`flow:no-test` 的判据只要求这条流程的步骤叶子里有一个测试任务，所以连一步就能消掉缺口，但文字没有说，也没有说没连上的步骤不会等这个测试任务做完（它们的叶子不含它）。

修法：§4.3 与 §2.6 加一句：「测试任务只需连到它覆盖的步骤里的至少一步（上限 3）就消掉 `flow:no-test`；没连的步骤的进度不看这个测试任务」。

### 4. LOW：晨报的规则与样例对不上

位置：§5.6 规则「有缺口的流程在括号里点出第一个缺口」与样例；§2.9 预期缺口。

问题：夹具里搜书有 `flow:no-test`，样例里「搜书 做完了，等走一遍」没有括号；而「处理逾期 走不通（「发提醒或登记赔偿」）」括号里写的是失败步骤。样例同时少了第一条规则要求的缺口。

修法：二选一并写明：样例里搜书、还书加括号（例：「搜书 做完了，等走一遍（还没有人写测试）」），或规则改成「括号里点出第一个会挡走一遍或做完的缺口，只标出的缺口（`flow:no-test` 之外的 `flow:too-long` 等）不点」。

### 5. LOW：`用户流程：无` 时 `renderUserGraph` 渲染什么没有定义

位置：§3.6 `renderUserGraph`、§5.1「`confirm`……目标 `present`……或有 `用户流程：无` 时」、§7.2「声明写在人看到的确认页上，所以『没画』永远是人看见并同意过的」、§6.4。

问题：`present` 为假而目标正文有 `用户流程：无` 时，`renderUserGraph(ug, 'confirm')` 的 `stable` 应该是什么，没有写。§7.2 的保证依赖它：这一段不出现在确认页，人就没有机会看到「没画」。

修法：§3.6 加一句：`present` 为假且目标正文有合格的 `用户流程：无` 时，`confirm` 的 `stable` 是一行「这个目标没有终端用户：<原因>」，验收第 28 条加这一例。

### 6. LOW：`graph_open` 给主 Agent 看的等批准列表仍含孤儿提议

位置：§3.7 `listOpenItems` 一行（「`proposals` 取全部 `proposed` 节点……不改，过滤在面板一侧」）。

问题：`reject` 不级联，被拒流程下面的 `proposed` 步骤会继续出现在 `graph_open` 工具的结果里（`tools.ts` 第 361 行直接返回 `listOpenItems`），说明写的是「proposals waiting for the human」。主 Agent 可能去问人要不要批准它们。§4.2 要求逐个 `reject`，正常路径不会留孤儿，但中途停下时会留。

修法：`graph_open` 的结果里对 `proposals` 同样过滤掉本身或祖先不 `live` 的用户节点（用 `liveOf`），或在工具说明里写明这类节点要忽略；二选一，验收第 26 条加一例。

### 7. LOW：`isPassingEvidence` 对 `walk` 证据返回真，设计没有说明

位置：§3.2、§3.3 V7；`schema.ts` 第 200 至 203 行。

问题：`isPassingEvidence` 对 `kind` 不是 `commit`、`decision` 的证据按 `exit === 0` 判。`walk` 证据 `exit` 为 0 时它返回真。现在只有 `status` 到 `done` 与读入时的 `done` 检查用它，用户节点不允许 `done`（W4 之外的第 6 条验收），所以没有实际影响；但以后谁在别处用它判「证据通过」，会把走一遍的结果当成关闭节点的证据。

修法：U1 里让 `isPassingEvidence` 对 `walk` 返回假，并加一个单元测试；或在 §3.2 写明这一点是有意的。

### 8. LOW：「作业总时长不超过 45 分钟」的措辞与「第一条流程总是开始」「准备命令不计入上限」并存

位置：§2.7 走一遍作业第 4 步、验收第 33 条、§8.1、D24。

问题：正文写「总时长不超过 45 分钟」，同一段又说第一条流程总是开始（上限最长 30 分钟）、准备命令每条至多 10 分钟且上限归 M7，极端情况合计超过 60 分钟。实际是「45 分钟内不再开始新流程」，不是总时长上限；测试只断言常量 `WALK_JOB_MS < GATE_WAIT_MS`，断言不到上述极端情况。

修法：把措辞改成「45 分钟之后不再开始新流程；已开始的流程最长跑到它的超时上限」，并在第 33 条写出最坏情况的界：准备时间加 30 分钟加已用时间不超过 45 分钟的那一段。

---

## 已核实的假设

1. 第 2 轮 11 条的关闭情况见上表，每条都对照了文件。
2. `engine.ts`：`reject` 只收 `proposed`、不级联（第 486 至 491 行）；`planStatus` 对 `proposed` 一律 `bad_transition`（第 559 行）；`initialStatus` 对 `role`、`flow`、`step` 不在例外里，非特权写入得 `proposed`，特权写入得 `approved`（第 410 至 429 行）；`apply` 对 `harness` 带 `relay` 返回 `invalid`；`ACTORS` 含 `harness`；`OPS` 现有十一个，与「现有十一个」一致。
3. `commit()` 对每个草稿做 `checkNode`，再对整图跑 `validateGraph`，有 `error` 即整体失败。V1 至 V8 属于这一层，且只看结构、不看 `live`，被废弃的步骤不触发它们。
4. M3 §3.8 第一条的起点规则、第二条 c、d 两款只拦 `graph_approve` 与带转述的 `graph_propose`（放行之前），放行之后加步骤、批准草稿、`graph_reject` 都不被第二条拦；§4.2 的写法与之相容。
5. M3 §3.5 第 5b 步的「整段在 `Shown.after` 里」与 §3.14.5 的 `PAGE_LIMITS.max` 2,000：harness 追加段不计入主 Agent 写的 `page`，不冲突；`page` 加追加段合计 10,000 个码点以内，低于第 2 轮记下的 `after` 上限 16,000。
6. `ui/src/graph/model.ts` 里有 `visibleGraph`、`hiddenClosed`、`statusText`、`progressOf`、`WORK_TYPES`（只含 `task`、`feature`），没有 `remainingOf`；`Panel.tsx` 第 93 行与 `NeedsYou.tsx` 第 54 行是两处等待数使用点；`projection.ts` 第 205 至 206 行 `gatesOf` 的「子节点未全部关闭」确会数到永远 `approved` 的用户节点，设计要排除的位置正确。
7. `src/shared/tool-names.ts`：`GRAPH_TOOL_NAMES` 与 `ORCHESTRATION_RESIDENT_TOOLS` 各含 13 个图工具名，加两个名字的位置正确；M7 0.6 的九个图写工具名单按名字列出，与设计引用一致。
8. `ID_PATTERN`、`nextId`（`step-N`）、`COMMIT_PATTERN` 与设计里用到的 id、提交号格式相容。
9. §2.9 夹具逐行重算：十二项预期（六条流程的步骤状态与 `outdated`、两个角色、目标的流程计数、缺口、特性服务步骤数、开发图进度 14 件做完 10）全部与表一致，前提是按发现 1 的修法理解 `live`。
10. 约束：只写在 `.agents/tasks/user-graph/`；例子只用图书管理系统（记账只出现在「不用它」的说明里）；文件里没有语气词或人设用语；请求全部写成 `graph-ops-design.json` 的批注草稿；该文件 UTF-8 无字节序标记、是 14 项的 JSON 数组。

## 未核实或不成立的假设

不成立：
1. §2.5：特性与任务适用同一个 `live` 定义（发现 1）。
2. §3.4：W1 至 W5 在「写后的整图检查」里不会误伤存量连线（发现 2，按字面读不成立）。

未核实（作者已列，仍未核实）：
1. A3：独立复核 agent 看截图判断是否可靠。
2. A6：provider 目录能否标明图片输入；读文件工具能否把图片交给模型。
3. A10：M3、M7 骨架里的 `propose.ts`、`record.ts`、`dispatch.ts`、`drive.ts`、`faces.ts`、`gate-norm.ts` 等在 main 上尚不存在，只能对照设计。
4. A11：人走的构建就是记下的 `HEAD`，靠问句交代，残余风险。
5. 本轮另有一处我没法核实：`record_human_answer` 的重新渲染比较在两层循环里是否在现实中足够稳定，取决于稳定部分里「归属」的取法；设计的取法（服务者的最近特性祖先）是确定的，我只能确认它的逻辑自洽。

## 对 `graph-ops-design.json` 的意见

草稿合规。发现 1 只改 design.md；发现 2 不影响批注（批注没有复述 W 系列的范围）；发现 6 若采用「`graph_open` 过滤」，需要在 `m8-plain-language` 条目或 `m3` 条目补一句。其余不动。

## 判定

存在 0 条 HIGH、2 条 MEDIUM。CHANGES_REQUESTED。这是第 3 轮，按流程该模块停下，`align-stop-report.md` 写明开着的挡路发现与要编排者或人定的事。
