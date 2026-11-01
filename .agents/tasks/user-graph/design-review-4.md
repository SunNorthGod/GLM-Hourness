# 用户图设计 0.4：第 4 轮独立评审

被审：`.agents/tasks/user-graph/design.md` 0.4（第 4 稿），`graph-ops-design.json`（14 条批注草稿，文中引用 0.4）。对照版本：`design-0.3.md`。
评审轮次：4（第 1 次修订后的评审）。评审者：与作者不同的 agent。
结论：CHANGES_REQUESTED。HIGH 0 条，MEDIUM 2 条，LOW 5 条。挡路 2 条。挡路趋势 12 → 4 → 2 → 2。

核对方式：读了 `design.md` 全文（含 §16 的 0.4 修订记录）与 `design-0.3.md` 的差异（`git diff --no-index -U0`，逐个变动位置看过，包括 §2.5、§2.6、§2.9 夹具、§3.4、§4.2、§4.3、§5.6、§8.1 至 §8.3、§10.1、§12 的 D26 至 D29、§16）；读了第 3 轮的 `design-review-3.md`、`design-review.json`、`align-stop-report.md`；读了 `graph-ops-design.json` 全文（UTF-8，首字节 `5B 0A`，无字节序标记，14 项数组，每项仅 `op`、`id`、`text` 三个键）。对照源码读了 `src/graph/schema.ts`（`STATUSES`、`isPassingEvidence`）、`engine.ts`（`TRANSITIONS`、`SUPERSEDABLE`、`supersedeTargets`、`questionRefusal` 三处调用）、`projection.ts`（`OpenItems.proposals`、`listOpenItems`）、`tools.ts`（`graph_open`）、`ui/src/graph/model.ts`（`progressOf`、`WORK_TYPES`、`visibleGraph`）、`src/execute/gate-lock.ts`（`GATE_WAIT_MS`、`GATE_STALE_MS`）。另把 §2.9 夹具的全部预期输出按新的 `live` 定义重算了一遍（22 个步骤、6 条流程、2 个角色、缺口、特性服务步骤数、`live` 判定表），并用仓库当前图（218 个节点文件）核对了「`live` 对祖先取全部类型」在真实图上的后果：特性与任务的父节点只出现 `feature/approved`、`feature/doing`、`feature/done`、`goal/doing`、`task/done`，没有挂在 `decision`、`question` 一类会被取代的节点下面的，新定义不会在真实图上误伤。

0.4 对编排者的两条裁定做了实质性实现，对第 3 轮的 6 条 LOW 也都改了。夹具重算与表一致。本轮发现的两条挡路问题都出在裁定落地的接缝上：一条是 §8.2 的一行输入校验与新的 W 系列和验收第 11 条互相矛盾；一条是 `work:orphan` 的祖先豁免让裁定要求的「任务服务的步骤后来被废弃」这一缺口在常见的模块布局里不出现。两条都是局部的文字修改。

---

## 第 3 轮发现的关闭情况

| 第 3 轮 | 严重度 | 状态 | 依据 |
| --- | --- | --- | --- |
| 1 `live` 把进行中和做完的活排除在外 | MEDIUM | Closed | §2.5 定义改为「`status` 既不是 `dropped` 也不是 `superseded`，祖先同样不是」，`proposed`、`approved`、`doing`、`done` 都 `live`，步骤、流程、特性、任务同一个函数；与引擎 `STATUSES` 六个值、`TRANSITIONS` 一致；§3.1 的 `user-live.ts` 行、§8.3、D26、§0 摘要、§10.1 U1、`graph-ops-design.json` 第 1 条同步。夹具重算：服务者与叶子全部按新定义取，22 个步骤的状态与表一致（见下「夹具重算」）。验收第 19 条按建议加了 `done` 特性、`doing` 特性下 `doing` 任务、`dropped` 特性下 `doing` 任务、`superseded` 任务各一例。 |
| 2 W1 至 W5 的检查范围 | MEDIUM | Closed（遗留一处矛盾见新发现 1） | §3.4 在 W 表前加了「只查本次写入新增或改动的部分」一节：被查的只有新加的 `serves`/`next`、本次设置的 `kind`、本次写的 `walk` 证据，「新增」按（类型，目标）认，`graph_status`（含恢复）、`graph_edit` 其他字段、`graph_unlink`、保留原有连线的 `graph_relink` 一律不因 W 系列被拒；W 表每行改成「新增的」；理由里引了 `questionRefusal` 的先例，我对照源码核对过（`engine.ts` 第 457 行 `() => true, 'node'`，第 614 行 `field => fields.includes(field), 'set'`）。存量坏连线作为缺口 `work:orphan`、`step:next-dropped` 标出，§2.6、§5.6、§6.2、§6.5、§8.1、§8.3、D29 同步，验收第 11 条加四组用例。缺口覆盖面有洞，见新发现 2。 |
| 3 测试任务与 `servesPerTask` | LOW | Closed（表述有一处不精确，见新发现 4） | §2.6 `flow:no-test` 行、§2.7、§4.3、验收第 16 条都写了「连到至少一步即可」。 |
| 4 晨报规则与样例 | LOW | Closed | 样例里搜书、还书加了括号「还没有人写测试」；规则改为按 §2.6 缺口表次序点第一个缺口，括号里的字取 §6.5 新加的一列。我逐条流程核对：登录无缺口、搜书 `flow:no-test`、借书 `step:unserved`（交押金）、还书 `flow:no-test`、录入新书无缺口、处理逾期 `step:failed`（「发提醒或登记赔偿」是 `step-21` 的标题），与样例一致。 |
| 5 `用户流程：无` 时的渲染 | LOW | Closed | §3.6、§5.1、验收第 28 条都写了 `present` 为假且有合格声明时 `confirm` 的 `stable` 是一行「这个目标没有终端用户：<原因>」，`state` 为空，重新渲染比较照常；两者都没有时第 27 条已 `gate_unmet`。 |
| 6 `graph_open` 返回孤儿提议 | LOW | Closed | §3.7、§3.1 的 `tools.ts` 行、§8.3、§10.1 U3、验收第 26 条：`graph_open` 在 `tools.ts` 里对 `items.proposals` 用 `liveOf` 过滤，`listOpenItems` 不改。我核对 `projection.ts` 第 307 行 `proposals: all.filter(node => node.status === 'proposed')` 与 `tools.ts` 第 362 行直接返回 `listOpenItems(graph)`，位置正确；过滤只需按 id 回查图，可行。 |
| 7 `isPassingEvidence` 对 `walk` 返回真 | LOW | Closed | §3.2 改成 `walk` 返回假，验收第 7 条加单元测试，§3.1、§10.1 U1 同步。对照 `schema.ts` 第 200 至 203 行：现状 `commit`、`decision` 返回真，其余按 `exit === 0`，描述准确。 |
| 8 「45 分钟」的措辞 | LOW | Closed（界的陈述有一处遗漏，见新发现 6） | 改成「45 分钟之后不再开始新流程」，第 33 条写成一条时间规则，三个假时钟用例的数我重算过：三条各 20 分钟、准备为零，第 3 条 40 加 20 超过 45 不开始；准备 20、第一条 30，作业用到 50，第二条不开始；准备 35、第一条 30，共 65 分钟，别的检查得到 `gate_busy`。 |

## 夹具重算（§2.9）

按新的 `live`：`feat-lending` 是 `doing`、`task-7` 是 `doing`，都 `live`；`feat-legacy` 是 `dropped`，它下面 `doing` 的 `task-15` 不 `live`；`task-16` 是 `superseded`，不 `live`。逐项：

- `step-8` 的服务者 `task-7`（`doing`），状态 `building`；`step-9` 的服务者只有 `task-8`（`task-15` 不 `live`，`feat-legacy` 不 `live`），`planned`；`step-10` 同；`step-11` 没有服务者，`unserved`；`step-13` 的服务者只有 `task-9`（`task-16` 不 `live`），`planned`。表中借书与还书的行与此一致。
- 误把三个不 `live` 的节点当成 `live`：`step-9` 叶子含 `task-15`（`doing`）变 `building`，`step-10` 经 `feat-legacy` 的叶子变 `building`，`step-13` 叶子含已 `done` 的 `task-16` 变 `building`。设计里「`step-9`、`step-10`、`step-13` 会变成在做」的说法成立，作为反例有效。
- 登录、搜书、录入新书、处理逾期四条流程的状态、`outdated`、`flow:no-test` 与第 3 轮时一致；`task-6` 的重开（10-31）晚于录入新书的走一遍（10-29），所以录入新书 `outdated`；搜书从没走过，不产生 `outdated`，结果不变。
- 缺口四项（`step:unserved` 的 `step-11`，`step:failed` 的 `step-21`，`work:orphan` 的 `feat-export`，`flow:no-test` 的搜书与还书）重算一致；`task-15`、`task-16`、`feat-legacy` 不 `live`，不进缺口。
- 角色与目标汇总：读者 `unserved`，管理员 `failed`，目标 6 条流程 `walked` 1、`failed` 1、`built` 2、`unserved` 1、`planned` 1，一致。
- 每个特性服务的步骤数：账号 5、书目 6、借阅 6、逾期与通知 4、导出年度报表 0，一致；面板草图里「借阅 在做 0/3」对应 `progressOf(feat-lending)`（跳过 `superseded` 的 `task-16`，三个任务都没做完），一致。

这张夹具练到了 `doing`、`done` 的服务者与叶子，也有 `dropped`、`superseded` 的反例，满足裁定 1 对夹具的要求。夹具里没有被废弃的步骤，所以 `step:next-dropped` 与「服务的步骤都不要了」两个缺口只靠验收第 11、19、21 条的文字用例覆盖（见新发现 2、3）。

---

## 发现

### 1. MEDIUM：§8.2 要求 `graph_relink` 的每个 `to` 都是 `live` 的步骤，与 W5 和验收第 11.2 条冲突

位置：§8.2 外部输入的校验，`graph_relink` 的 `next` 一行（「`to` 不重复，至多 8 项，`to` 是 `live` 的步骤且属于同一条流程」，失败时 `invalid`，`field: next[i]`）；对照 §3.4 W5（「新增的 `next` 的目标是 `live` 的步骤；`graph_relink` 的列表本身……`to` 不重复、至多 `relinkEdges` 项，流程至多 1 项」）、「W1 至 W5 只查本次写入新增或改动的部分」一节（「保留原有连线的 `graph_relink`……一律不因 W1 至 W5 被拒」）、验收第 11.2 条（「`graph_relink` 保留这条指向 S 的连线（`to` 与原有的相同）、改别的出边，成功」）、验收第 12 条。

问题：裁定 2 要求存量的坏连线不挡无关的写入。§3.4 和第 11.2 条为此明确写了：步骤 P 的 `next` 指向已废弃的步骤 S 时，`relink` 列表里保留 S、只改别的出边，成功。§8.2 这一行是 0.3 留下来的，没有跟着改：它对列表里每一项都要求 `live`，列表里保留的 S 不 `live`，会得到 `invalid`。实现者读 §8.2 与读 §3.4 得到相反的行为，第 11.2 条的测试和 §8.2 的校验表只能有一个成立。这条恰好落在裁定要求的行为上：加一个分支同时保留一条旧的坏连线，是主 Agent 在「交押金」这类改动里会碰到的写法，被拒就回到整节点检查的效果。

修法：把 §8.2 这一行的校验列改成：「`{to, when?}` 的数组，`to` 不重复，至多 8 项，每个 `to` 是同一条流程的步骤；其中节点原有 `next` 里没有的 `to`（新出现的）必须是 `live` 的步骤，原有的保留项不查 `live`（§3.4 W5）」。验收第 12 条的「目标不是同一条流程的步骤」一例保留，另加一句「保留项指向不 `live` 的步骤不 `invalid`」，与第 11.2 条互相引用。

### 2. MEDIUM：`work:orphan` 的祖先豁免让裁定要求的缺口在常见布局里不出现，且 §2.6 与验收第 21 条各有两句互相拉扯

位置：§2.6「『不服务任何步骤』的判定」段（四条「算有人用」的条件，其中第三条「它的某个祖先……有」；紧接着的「`serves` 只指向不 `live` 步骤的活，同样是孤儿，原因写『它服务的步骤都不要了』」）；§4.3 末段（「删一步或删一条流程，服务它的活变成孤儿……图上标出」）；验收第 11.1 条（「`gapsOf` 把 T 标为 `work:orphan`」）与第 21 条（「祖先特性服务了步骤则算有人用」与「服务的步骤都已不 `live` 的活标出」并列）；§8.1、§8.3、D29。

问题：裁定 2 的另一半是：存量的坏连线（任务服务的步骤后来被废弃）要作为缺口 `work:orphan` 在两个视图和晨报里标出，`hint` 写明正路。§2.6 的判定是四条里一条成立就算有人用，四条都不成立才是孤儿，其中第三条是「祖先有指向 `live` 步骤的 `serves`」。§4.3 要求的常见布局恰好是：模块（特性）在放行时有模块级的 `serves`，分解后每个任务再有任务级的 `serves`。取夹具的形状：`feat-catalog` 有模块级的 `serves`→`step-5` 至 `step-7`，`task-5` 只有 `serves`→`step-18`。若 `step-18` 被废弃，`task-5` 自己没有指向 `live` 步骤的 `serves`，没有后代，没有被有人用的活依赖，但祖先 `feat-catalog` 服务着 `live` 的步骤，按第三条它「有人用」，不是孤儿。结果：这个任务的老连线指向已废弃的步骤，没有任何缺口、没有 `hint`、两个视图和晨报都不显示，任务还在照常被做，而它不服务任何一个 `live` 步骤。只有任务所在的模块自己也没有服务任何 `live` 步骤时，才会标出。

「`serves` 只指向不 `live` 步骤的活，同样是孤儿」这一句按字面是无条件的，按上一句的四条判定又是有条件的。实现者可以选任一种读法，第 11.1 条的测试没有写 T 的布局，两种实现各自能过自己搭的夹具。第 21 条同一条里「祖先特性服务了步骤则算有人用」与「服务的步骤都已不 `live` 的活标出」也是同样的拉扯。

修法（推荐）：祖先那一条只对没有任何 `serves` 连线的活生效。在 §2.6 把判定改成：「自己带有 `serves` 连线、而这些连线的目标都不 `live` 的活（至少一条，没有一条指向 `live` 步骤），标 `work:orphan`，原因写『它服务的步骤都不要了』，不看祖先；后代有人用，或被一个有人用的活依赖时仍算有人用。没有任何 `serves` 连线的活，四条判定照旧」。验收第 21 条加两例：模块有指向 `live` 步骤的 `serves`，其下任务的 `serves` 全部指向已废弃的步骤，任务被标出且 `hint` 写明正路；模块下没有任何 `serves` 的任务不标。第 11.1 条写明 T 放在有 `serves` 的模块下，并断言被标出。

备选：保留现在的四条判定，把 §2.6、§4.3、§8.1、§8.3、D29、第 11.1 条里「任务服务的步骤被废弃就标 `work:orphan`」改成「只在它的祖先、后代也都不服务 `live` 步骤时才标」，并承认常见布局下这条缺口不出现。这样与裁定的文字要求有差距，需要编排者认可。

### 3. LOW：验收第 11.1、11.2 条里的 `gapsOf` 断言属于 U3，放在 U2 的验收里

位置：§1.4 验收第 11.1、11.2 条（「`gapsOf` 把 T 标为 `work:orphan`」「`gapsOf` 给 P 标 `step:next-dropped`」）；§10.1 U2 的验收列「9 至 15」、U3 的验收列「16 至 26」。

问题：`gapsOf` 在 `user-graph.ts`，U3 才新建，而 U2 的独立评审要对照第 9 至 15 条。U2 做完时这两句断言没法跑。

修法：把这两句挪到第 21 条（`work:orphan`）和第 19 条（`step:next-dropped`）里，第 11.1、11.2 条只留引擎一侧的断言；或在这两句后写「（这一句在 U3 验）」，并在 §10.1 U3 的验收列加「11（`gapsOf` 部分）」。

### 4. LOW：「没连它的步骤，叶子里没有它」只在其余步骤都有任务级连线时成立

位置：§2.6 `flow:no-test` 行、§2.7（命令从哪来）、§4.3「分解时把任务连到步骤」、验收第 16 条的边界用例。

问题：`leavesOf` 的规则是：特性作服务者，其下有任务连到该步骤时只取这些任务，没有时取特性的全部叶子。所以：（a）步骤只由模块级连线服务、其下没有任务连到它时，模块下所有叶子任务（含测试任务）都是它的叶子，「没连它的步骤叶子里没有它」不成立；（b）对一个原本只有模块级覆盖的步骤，新连上一个测试任务，这一步的叶子从「模块的全部叶子」变成「只有这个测试任务」，实现类任务不再算它的进度。夹具里的 `flow-1` 属于（a）：`task-13` 没有 `serves`，靠模块级连线进入 `step-1` 至 `step-4` 的叶子，`flow:no-test` 因此不成立，这与表一致，但与设计新加的那一句不一致。

修法：§2.6、§4.3、第 16 条各加限定：「该句假设这条流程的其余步骤都有任务级连线；只有模块级覆盖的步骤，模块下的测试任务本来就是它的叶子」；并提示测试任务应连到已有任务级连线的步骤，避免把一个只有模块级覆盖的步骤的叶子收窄成只剩测试任务。第 16 条的边界用例写明搭建的布局。

### 5. LOW：夹具的「开发图的进度」一行没有对应的函数，且现有的进度代码不按 `live` 数

位置：§2.9 汇总表「开发图的进度」（「14 个 `live` 的任务……做完 10……还剩 4」）；§6.1 首页草图「做完 10 件，还剩 4 件」；§3.7 `model.ts` 一行（`progressOf` 不用改）；验收第 16、23 条。

问题：这一行在 0.3 里是「14 个任务」，0.4 加了不 `live` 的 `task-15`（`doing`，挂在 `dropped` 的 `feat-legacy` 下）和 `task-16`（`superseded`）后改成了「14 个 `live` 的任务」。但没有任何一个被命名的函数算这个数：第 16 条只列了 `stepStateOf`、`flowStateOf`、`gapsOf`；`ui/src/graph/model.ts` 的 `progressOf` 只数直接子节点，且只跳过节点自己的 `dropped`、`superseded`（第 195 至 196 行），不看祖先；面板 1.1 的 `remainingOf` 未放行，§11 对它的请求只写了「不数用户节点」。按节点自己的状态数，`task-15` 是 `doing`，会数成 15 个、还剩 5。实现者照表写测试会发现没有函数可对。

修法：二选一并写明：（a）指定一个函数（例如在 `user-live.ts` 旁边的 `devProgressOf(graph, goal)`，按 `liveOf` 数目标子树下的任务），把它列入第 16 条，并在 §11 对 `m8-plain-language` 的请求里加「`remainingOf` 不数祖先已废弃或被取代的节点」；或（b）把这一行从预期表里移出，标明它是面板 1.1 的事，第 16 条不断言。

### 6. LOW：「占锁最坏时长不超过 max(45 分钟, 准备时间加第一条流程的上限)」没有计入 `walk-review` 与写证据的时间

位置：§2.7 走一遍作业第 3、4 步；§0 摘要、§8.1、D24、§11 的 `m7` 与 `schedules` 行、验收第 33 条；`graph-ops-design.json` 的 `m7` 之二与 `schedules` 两条。

问题：作业在第 3 步里对每条流程还要起 `walk-review` 激活（失败重试至多两次，每次的时限设计里没有给）、给每个步骤写证据（遇到 `stale_revision` 最多重试三次），全部发生在持锁期间，放锁在第 5 步。第 4 步的开始规则只比较「已用时间加这条流程的命令超时上限」，所以最后一条开始的流程跑完命令时是 45 分钟之内，复核再花多久不在界里。截图与终端类流程的实际占锁时长因此可以超过所写的界，进而超过 60 分钟让别的检查得到 `gate_busy`。作者在这一轮把措辞改成了一个带公式的界并让第 33 条断言它，这个界对 `命令` 类成立，对 `截图`、`终端` 类不成立。有 `gate_busy` 后主 Agent 重试这条退路，不丢工作，所以影响小。

修法：给复核一个常量时限 `WALK_REVIEW_MS`（含重试的总和），在开始规则里写成「已用时间加这条流程的命令上限加（需要复核时的）`WALK_REVIEW_MS` 超过 45 分钟的不开始」，把同样的项加进最坏界的公式；第 33 条再加一个 `终端` 类流程的假时钟用例。或者保持现状，把界的陈述限定为「命令类流程」，并写明复核与写证据的时间另计、不在界内。

### 7. LOW：`user-live.ts` 的使用方清单漏了 W1

位置：§3.1 `user-live.ts` 一行（「供 `engine.ts`（W2、W4、W5）、`user-graph.ts`、`tools.ts` 的 `graph_open` 过滤与面板的 `waitingProposals` 共用」）。

问题：W1 的计数取「`live` 的服务者」「指向 `live` 步骤的 `serves`」，也要 `liveOf`；W3 不用。

修法：改成「`engine.ts`（W1、W2、W4、W5）」。

---

## 已核实的假设

1. 第 3 轮 8 条的关闭情况见上表，逐条对照了 `design.md`、`design-0.3.md` 与源码。
2. 引擎状态：`STATUSES` 六个值（`schema.ts` 第 11 行）；`TRANSITIONS` 里 `approved` → `doing`、`done`、`dropped`，`doing` → `done`、`dropped`，`done` → `doing`，`dropped` → `approved`，`superseded` 哪里也去不了（`engine.ts` 第 110 至 117 行），与 §2.5、§2.6 的 `hint`（已 `done` 的活只能改连线）和 §2.9 夹具里 `done` → `superseded`（`SUPERSEDABLE` 含 `done`）一致。
3. `questionRefusal` 的先例：`propose` 时 `() => true, 'node'`（第 457 行），`edit` 时 `field => fields.includes(field), 'set'`（第 614 行），§3.4 的引用准确。
4. `OpenItems.proposals` 取全部 `proposed` 节点（`projection.ts` 第 307 行）；`graph_open` 直接返回 `listOpenItems(graph)`（`tools.ts` 第 362 行）；`progressOf` 只数直接子节点、跳过节点自己的 `dropped`/`superseded`（`model.ts` 第 189 至 205 行）；`isPassingEvidence` 的现状如 §3.2 所述。
5. `GATE_WAIT_MS` 是 60 分钟，`GATE_STALE_MS` 是 6 小时（`gate-lock.ts` 第 40、41 行），§2.7 第 2 步与第 4 步引用准确。
6. 仓库当前图里特性与任务的父节点类型：`feature`（approved、doing、done）、`goal`（doing）、`task`（done），没有挂在可被取代的 `decision`、`question` 下的，「祖先取全部类型」在真实图上不会误伤。
7. `graph-ops-design.json`：UTF-8、无字节序标记、14 项数组，每项只有 `op: 'comment'`、`id`、`text`；版本号全部写 0.4；`m3` 一条里 `live` 的括号说明按新定义写，且补了 `graph_open` 过滤不涉及 M3；`m7` 之二与 `schedules` 里的措辞与设计一致；`user-graph` 一条写 29 条方向，与 §12 的 D1 至 D29 一致。第 3 轮之后请求的内容没有因两条裁定而需要增减；发现 5 若选（a），需要在 `m8-plain-language` 一条加一句。
8. 约束：只写在 `.agents/tasks/user-graph/`；`design-0.3.md` 原样保留；例子只用图书管理系统（记账只出现在「不用它」的说明里）；文件里没有语气词或人设用语；没有改 `docs/graph`。

## 未核实或不成立的假设

不成立：
1. §8.2：`graph_relink` 的每个 `to` 都必须 `live`（发现 1，与 §3.4、第 11.2 条冲突）。
2. §4.3、§2.6、第 11.1 条：任务服务的步骤被废弃就会被标 `work:orphan`（发现 2，祖先豁免使它在常见布局里不成立）。
3. §2.9 汇总表：「开发图的进度」有可对的函数（发现 5）。

未核实（作者已列，仍未核实）：
1. A3：独立复核 agent 看截图判断是否可靠。
2. A6：provider 目录能否标明图片输入；读文件工具能否把图片交给模型。
3. A10：M3、M7 骨架里的 `propose.ts`、`record.ts`、`dispatch.ts`、`drive.ts`、`faces.ts`、`gate-norm.ts` 等在 main 上尚不存在，只能对照设计。
4. A11：人走的构建就是记下的 `HEAD`，靠问句交代，残余风险。

## 对 `graph-ops-design.json` 的意见

草稿合规，不需要因本轮发现修改，除非发现 5 选（a）：此时 `m8-plain-language` 条目补一句「`remainingOf` 不数祖先已废弃或被取代的节点」。发现 1、2 只改 `design.md`。

## 判定

存在 0 条 HIGH、2 条 MEDIUM（发现 1、2），5 条 LOW（发现 3 至 7）。CHANGES_REQUESTED。这是第 4 轮，还有一次修订与第 5 轮评审的机会。挡路趋势 12 → 4 → 2 → 2。
