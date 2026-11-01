# 规则板设计评审（`.agents/tasks/rules/design.md`）

挡路标准（`docs/DEVELOPMENT.md` §1.1，图 `d-failure-plans`）：只有三类发现挡路：验收条件没有满足；不可逆损失而没有预防；失败了没有途径发现、没有恢复办法，或事后查不到原因。HIGH 与 MEDIUM 都属于这三类，其余记为 LOW（不挡路）。

## 轮次记录

| 轮 | 设计版本 | HIGH | MEDIUM | LOW | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.1 | 1 | 5 | 13 | CHANGES_REQUESTED |
| 2 | 0.2 | 0 | 1 | 7 | CHANGES_REQUESTED |
| 3 | 0.3 | 0 | 0 | 5 | APPROVED |

## 第 3 轮

评审对象：设计 0.3（2026-10-29 20:13，241 KB，1552 行）。main 在 `c49478f`。设计写的依据是 `0639bf5`，之后的 `c49478f`（20:36）只改了图：`d-option-card` 定为表格版，用「取决于」一行加「是 → X；否 → Y」一行取代「为什么」与反方；`d-counter-line` 被取代，`counter` 不进引擎；`risk-shared-desktop` 加了一条使用桌面版的常设授权。依据同前两轮，另加 `c49478f` 改的图节点、分支 `m3-base-card` 上 `de0ccf6` 的 `questionRefusal` 与 `CARD_LIMITS`、`dsh-agent-tool-presentation/lib/index.js`，以及 `dsh-tools/README.md` 的 PTC 一节。本轮没有做 Windows 试验：0.3 没有新试验，Windows 一节除 F27 的恢复名单之外与 0.2 相同。

### 结论

APPROVED。第 2 轮的 F20–F27 全部关闭。F20 的改法是：写入与重放共用纯函数 `applyRecord`；记录带完整的 `changes`；清理与分配在规划时决定并写进记录；`base` 与 `recovered` 和别的记录同样核对。这个改法本轮逐种情形推演过。流水里只有引擎自己的记录时，清零快照之后每条都通过，重建的状态与清零前相同。前一次恢复写下的 `recovered` 在再次重放时，前面的状态与那次恢复之前相同，所以同样通过，并去掉它登记过的行。快照落后、pending、末行截断与读写竞争几种情形也都推演过，结论相同。

本轮的新发现都是 LOW（F28–F32），不挡路：

- F28：`c49478f` 之后卡片格式又变了。设计已经把这部分隔离在一个函数里，并有对真实图引擎的契约测试，实现时会被当场纠正。
- F29–F31：流水恢复里的少见情形，都要引擎以外的写入改坏或截掉流水，并且都会出声、可以恢复。
- F32：`ptc` 呈现模式下规则文件门禁的写法没有说清。

### 第 2 轮发现的复核

| # | 级别 | 状态 | 依据（0.3 的位置） |
| --- | --- | --- | --- |
| F20 | MEDIUM | 已关闭 | 纯函数 `applyRecord`，不读时钟、文件系统与进程表（§4.2 末段）；规划函数在写入时算出全部 `changes`，清理写成带 `cause: 'prune'` 的删除（§4.4 第 4–6 步）；`base` 的 `changes` 为空，`recovered` 的 `changes` 是设 `recovered` 与登记 `unresolved`，链没断时与别的记录同样核对（§4.4 的表、§4.5 第 3 步）；`recovered` 生效时从跳过表去掉它登记过的行（§4.5 第 4 步）；验收 §1.4 第 5 条写明重建后摘要相同、再清零一次结果相同；R2 的性质测试（5 个种子各 200 次写入，含清理、轮换、两行外来记录与各自的恢复，清零两次，从空状态重放，§15） |
| F21 | LOW | 已关闭 | `Holder` 加 `{kind: 'host', host, label}`（§4.2）；§5.5 与 §8.2「宿主」一行按心跳判断死活；§2.5 的表里检测器不能取租约 |
| F22 | LOW | 已关闭 | 证据改为 goal:611–614、880–888、348–353（§6.7）；`get` 抛 `GoalError` 时按没有 goal 处理（§6.3）；R4 的用例 |
| F23 | LOW | 已关闭（卡片字段在 `c49478f` 之后又变，见 F28） | 先提待决、成功才记提议；被拒时什么都不记，原样返回引擎的错误与字段路径；记提议失败时写批注，`acceptProposal` 返回 `missing`，停下交人（§9.4、§11.2、§13）；`weight: 'two-way'`，`label` 由规则板按种类给定，`counter` 可选 |
| F24 | LOW | 已关闭（main 又前进了，见 F28） | 依据改为 `0639bf5` 并列出相关提交；文首加「依据的学科与标准」表与查过的现成方案 |
| F25 | LOW | 已关闭（格式在 `c49478f` 之后又变，见 F28） | §19 改为表格版（选项 / 怎么做 / 得到 / 代价），字母键，推荐项在最后；D4 标为单向门并带反方，其余是双向门 |
| F26 | LOW | 已关闭 | 子调用照常开单、去重与唤醒，只是不在调用处等（§6.2 第 1 步）；单上记 `nested`，排队与唤醒文字随之改（§6.4）；§7.5 列出。本轮核实呈现模式只有 `native` 与 `ptc` 两种（`dsh-agent-tool-presentation/lib/index.js`:31），所以「子调用只出现在 `ptc` 下」成立 |
| F27 | LOW | 已关闭 | 恢复名单由宿主进程持有，`sweep` 的应答给出名单、`restore` 把名单交回，随 `host-level` 写进 `outsideLowered` 留痕；`outsideNotRestored` 大于 0 时降级（§4.2、§7.3、§7.4、§11.2、§13）；R9 的 L2 与 `rules:helper-check` 覆盖辅助进程重启后的恢复（§14、§15） |

第 1 轮的 F1–F19 在 0.3 里没有被改坏：相关各节（§2.5、§6.3、§7.1–§7.5、§8）与 0.2 相同，或者只按 F20–F27 做了改动。

### 产出各节是否齐全

| 简报要求的产出 | 位置 | 有无 |
| --- | --- | --- |
| 规则模型与存储 | §2、§4 | 有；流水恢复里几处少见情形见 F29–F31 |
| 来源与检测 | §5 | 有 |
| 每类规则的执行、所用宿主契约与 rc.3 证据 | §6、§6.7 | 有；本轮抽查的行号都对得上 |
| Windows 上的资源控制手段、证据与限制 | §7.1、§7.2、§7.5 | 有；每条标〔本机试验〕〔实读〕〔文档语义〕〔推断〕〔未核实〕，限制列在 §7.5 |
| 排队与推迟的语义、agent 看到什么 | §6.2–§6.4 | 有 |
| 租约与崩溃安全 | §4.5、§4.6、§8、§11.2 | 有 |
| 面板与命令 | §9 | 有 |
| 与 guard、项目图投影、派发（M7）、`d-plan-approval` 的关系 | §10 | 有 |
| 失败与降级（激活不抛错，行健康上报） | §11 | 有 |
| 每步的验证计划（L2、L3、L4）与今天必败 | §14、§15 | 有；R2 的 (c) 比较对象写错了（F29） |
| 有序的实施分解与里程碑 | §16 | 有 |
| 待人定事项（至少四项），每项选项、后果、推荐 | §19 D1–D5 | 有；`c49478f` 之后要换成「取决于」写法（F28） |
| 「重活」怎样认定 | §7.6 | 有 |
| 可选：给其他工具读同一份状态 | §9.5、§9.6 | 有，标为可选 |

### 新发现

#### F28 LOW：卡片格式在 `c49478f` 又变了，依据落后于 main（文首、§4.2 `Proposal`、§8.3、§9.4、§12、§15 R3 与 R4、§19）

问题：设计写完（20:13）之后，`c49478f`（20:36）把 `d-option-card` 定为表格版。具体是：

- 表头为「选项 / 怎么做（加粗）/ 得到 / 代价」。
- 题目下面一行「取决于」，写只有人知道答案的那个关键问题；表格下面一行「是 → X；否 → Y」。这两行取代「为什么」与反方。
- `d-counter-line` 被取代，`counter` 不进引擎。
- 引擎字段改为：选项的 `label`（不超过 20 字）、`gain`、`cost`，可选的 `dimension`，以及题目的 `crux`、`verdict`、`weight`。
- `de0ccf6` 只作参考，由 `card-fields-table` 按表格版重做。

设计里有几处还是按 `de0ccf6` 写的：`rules_propose` 的输入（`ifSet`、`ifSkip`、`why`、`counter`）、`Proposal` 的字段、§9.4 的待决字段表、§12 的四行校验、R3 与 R4 的断言（缺 `why` 即 `invalid`）。§19 每组有「为什么推荐 C」，D4 有反方。

另外，`risk-shared-desktop` 新加了一条常设授权（「dsh我现在不用，你以后直接用就行了」：同一时间只有一个持有者，人说要用时停下）。这正是 `dsh-desktop` 租约执行的政策，设计没有引用。

不挡路的理由：设计已写明卡片定稿时只改 `proposalQuestion` 与 `rules_propose` 的输入，并有 L2 契约测试把组出的待决交给真实的图引擎提一次、必须被接受，所以实现时不会悄悄做错。§19 由编排方交给人时按卡片格式重写。

改法：

1. 依据改为 `c49478f`，写明卡片字段以 `card-fields-table` 合入 main 的版本为准。
2. `rules_propose` 的输入改为 `{kind, body, summary, reason, crux, skip: {gain, cost}, set: {gain, cost}}`。`label` 仍由规则板按种类给定。`verdict` 由 `proposalQuestion` 按两个 `label` 生成：「是 → <set 的 label>；否 → <skip 的 label>」，工具说明要求 `crux` 写成答「是」就该设的问法，例如「你在用电脑时，这类命令会让你觉得卡吗？」。`weight` 仍为 `two-way`。去掉 `why`、`ifSet`、`ifSkip`、`counter`。`Proposal`、§9.4 的字段表、§12（`crux`、`gain`、`cost` 的上限取 `card-fields-table` 的 `CARD_LIMITS`）以及 R3、R4 的断言随之改。
3. §19 每组题目下加一行「取决于」，表格下加一行「是 → X；否 → Y」，去掉「为什么推荐」与 D4 的反方。D4 只加一句「以后改起来很贵」的提示。
4. §8.3 的 `dsh-desktop` 一行引用 `risk-shared-desktop` 的常设授权：没有人的租约时，agent 直接取得、不问人；人说要用时，由人取租约。

#### F29 LOW：流水最后一行与缺字段的行怎样归类，几处写法不一（§4.5 开头与第 1、2 步、§4.5 的表、§1.4 第 5 条、§15 R2）

问题：

1. 快照直接用的条件是「它的 `seq` 就是流水最后一条完整记录的 `seq`」。这里没写清一种行算不算「完整记录」：整行能读出，但缺 `seq`、`changes`、`snapshot` 之一，例如引擎以外追加的 `{"actor":"human","op":"rule-lift",…}`。如果按「不算」实现，快照照常直接用，这一行既不报，也不进 `unresolved`，引擎之后的记录接在它后面写。日后快照被清零时，重放在这一行断链（第 2 步），它之后到下一个锚点之前的引擎记录都不生效，人要整组点「按记录生效」。这正是 F20 要避免的情形。另外，表里「流水最后一行不完整或解析不了」一行按截掉处理（`journal-tail`，说法「流水最后一条没写完」），缺字段的整行会不会也被截掉，同样没写。
2. 第 2 步把缺字段的行归为 `unreadable`（断链，原因 `journal-unreadable`）。R2 的用例写「追加一条手写的 …（摘要缺失或随手写的），…原因 `journal-not-engine`」，§1.4 第 5 条写的说法是「流水第 N 条不是引擎写的」。对摘要缺失的那一种，这两处与第 2 步对不上。
3. 第 1 步取 `base` 的 `state` 作起点时，不核对 `stateDigest(base.state)` 是否等于 `base.snapshot`。这一行被改过时，起点会悄悄带着改过的内容。
4. R2 性质测试的 (c) 在 (b) 之后跑，而 (b) 又追加了一条 `recovered`，所以 (c) 的结果应当等于 (b) 之后的快照，不是 (a) 的。

不挡路的理由：按最自然的读法（最后一行不是快照的那条记录就重放），缺字段的追加行在下一次读取时就会被发现，紧接着写一条 `recovered` 作锚点，日后重放能接上；几处不一致在实现 R2 时会当场暴露。

改法：

1. §4.5 开头改为：「流水的最后一行（以换行结尾的最后一行）就是快照 `seq` 的那条记录、且摘要相符时直接用。最后一行没有以换行结尾时，按 `journal-tail` 截掉。以换行结尾、但不是这条记录时（缺字段、读不出、摘要不符、序号不同），一律从快照重放。」
2. 缺字段的行，从下面两种里选一种，统一写进第 2 步、§4.5 的表、§1.4 第 5 条与 R2：
   - (a) 能解析为 JSON 对象、但缺 `seq`、`changes` 或 `snapshot` 的行，按 `digest-mismatch` 处理（原因 `journal-not-engine`，不断链）；只有不是 JSON 对象的行才是 `unreadable`。
   - (b) 保留第 2 步，把 R2 拆成两例：缺摘要的为 `journal-unreadable`，面板写「流水第 N 行读不出」；摘要随手写的为 `journal-not-engine`。§1.4 第 5 条的例子写明「带随手写的 `snapshot`」。

   推荐 (a)：这样的行明显不是引擎写的，不断链，它之后的引擎记录也就不会变成核对不了。
3. 第 1 步：`base` 的 `stateDigest(state)` 不等于它的 `snapshot` 时，不作起点，改用上一个流水文件的 `base`；都不行时，从空状态与最早的流水文件开始。
4. (c) 改为与 (b) 之后的快照比较；或者在 (a) 之后复制一份流水目录，对副本跑 (c)。

#### F30 LOW：已被锚点覆盖的行仍报为「没有生效」，点「按记录生效」会把后来的改动改回去（§4.5 第 5、7 步）

问题：链在第 L 行断开之后，L 之后到下一个锚点之前的行一律进跳过表（`after-unreadable`），面板写「之后 M 条记录核对不了，没有生效」，并给「按记录生效」。但锚点（引擎为别的原因写的 `recovered`，或从旧文件重放时遇到的 `base`）是引擎在这些行之后写的。写锚点时这些行已经生效，所以锚点的 `state` 里已经有它们的结果；真正没生效的只有锚点自己登记过的行，而这些行第 4 步已经去掉了。

这种情形的触发条件是：流水中间的一行事后被改坏（引擎以外的改动或磁盘损坏），它之后又有锚点，然后快照无效。人照面板点了「按记录生效」，这些行的 `changes`（整条替换）就会盖过锚点之后的改动，例如把已释放的租约重新记为被占用，把人改过的规则改回旧值。少见、可逆、留痕在流水里，所以不挡路。

改法：第 5 步在锚点处，把断链之后进跳过表、锚点没有登记的行改记为 `why: 'covered-by-anchor'`（`SkippedRecord.why` 加这一值）。面板写「流水第 N 行读不出；之后 M 条记录已由第 K 条覆盖，状态不受影响」，这些条目只给「忽略」。断链之后一直到结尾都没有锚点的行，照旧是 `after-unreadable`，可以按记录生效。R2 加一例：在两条引擎记录之后有一条 `recovered`，把这两条之前的一行改坏，清零快照、重放：状态等于清零前，那两条记为 `covered-by-anchor`。

#### F31 LOW：恢复时替换能解析的快照不留副本，流水被截掉或删改时会丢掉唯一完整的状态（§4.5 的表、§11.2「不可逆的东西」）

问题：快照能解析，但流水里没有它的 `seq`，或摘要与那条记录不符时，设计一律判为「快照被引擎以外的写入改过」，按流水重建并覆盖快照。可坏的也可能是流水：引擎以外的写入截掉了流水的后半段，或者改了快照对应的那一行。这时快照是唯一完整的当前状态，一旦被覆盖，上次轮换以来人写的规则与预算就找不回来了，面板还把原因说成快照被改。§11.2 写「规则板不删任何数据」，对这种情形不成立。

不挡路的理由：要先绕过 `builtin:rules-files-only` 与 file-tools-only 对用户级目录写入的拦截，或者由人自己改坏流水；租约、等待单与信号会自己恢复。

改法：

1. 替换任何能解析的快照之前，把它原样复制为 `.<文件>.replaced-<时刻>` 并保留，路径写进 `recovered` 的 `evidence`，在面板的「恢复」一节列出。
2. 流水里没有序号不小于快照 `seq` 的记录时，说法改为「流水比快照短（被截断或删改过），已按流水重建，原快照另存为 <路径>」，行健康 degraded。
3. §11.2 的不可逆清单加上这一条。

#### F32 LOW：`builtin:rules-files-only` 对子调用怎样处理没有写，照 `graph-files.ts` 的做法会放行（§2.5、§6.2 第 1 步、§10.1）

问题：§2.5 与 §10.1 写这条拦截「做法同 `src/guard/graph-files.ts`」，而那个监听器对带 `parent` 的调用直接 `next()`（`src/guard/graph-files.ts`:114）。§6.2 第 1 步又说规则板对子调用照样判定，两处不一致。`ptc` 呈现模式下每次调用都是子调用，照抄 `graph-files.ts`，这条拦截对这样的 agent 就不生效，只剩流水的摘要核对。

改法：写明 `builtin:rules-files-only` 在规则行自己的门里随 `judge` 判定，子调用照样判；如果它是单独的监听器，就不跳过带 `parent` 的调用。R4 的 L2 加一例：带 `parent` 的 `write` 写规则目录被拒。

### 已核实的假设（本轮新增）

- 呈现模式只有两种：`dsh-agent-tool-presentation` 的配置 `mode: z.union(["native", "ptc"])`（lib/index.js:31）。`run_code` 只在 `modeFor(scope) !== "native"` 时可见（tools:3075）。`ptc` 下模型直接调用其他工具在策略之前就变成 `UNKNOWN_TOOL`（tools:3094–3101 `resolveExecution` 的注释，tools:3195–3197 `collapses`，`dsh-tools/README.md`:130）。`run_code` 的 Node 默认期限 120000 毫秒、上限 600000 毫秒，含子调用与审批的等待（README:136）。README 只提到 `presentAs`（第 12、81 行），没有提到 `modeFor`，所以设计「不读呈现模式」的取舍成立。
- `goals.get` 先 `assertLive(agent)` 再返回视图（goal:611–614）。
- `send`、`followup`、`steer`、`inject`（agent-loop:800–814）。补充一个细节：`send` 在需要唤醒、而当前阶段已经中止时，会改投 `next-turn`（agent-loop:801–802）。设计只在 `status` 为 `running` 时用 `steer`，与 V3 属同一类核实。
- 会话头的 `cwd`、`parentSession`、`origin`、`delegationDepth`（session:1818–1827）；`maxActiveSubagents` 默认 8（subagent:2978–2980）；`local` 激活释放 `handle.dispose()`（subagent:1893、2026）；`tool-subagent` 的 `toolName` 默认 `subagent`（tool-subagent:313）；`exec.parent` 进执行对象（tools:3234、3246）；`withFileLock`（atomic-write:189）。
- 本仓库 guard 与图文件门禁对带 `parent` 的调用直接 `next()`（`src/guard/index.ts`:174、`src/guard/graph-files.ts`:114；行号在第 2 轮之后变了）。
- `de0ccf6` 的 `questionRefusal`：人定的题要 `weight` 与 `why`，单向门才要 `counter`，`label` 不超过 20 个码点，`consequence` 为一行、不超过 120 个码点。0.3 组出的待决符合这一版，但 `c49478f` 已经改了格式（F28）。
- 对 F20 改法的推演：只有引擎写的流水，从 `base`、空状态或有效快照起重放，每条记录 `stateDigest(applyRecord(state, record))` 都等于 `record.snapshot`；`recovered` 再次重放时，跳过的行与那次恢复相同，所以前面的状态相同、摘要对得上；外来的行有没有 `seq` 都不影响引擎记录的核对，因为引擎记录的摘要是在没有外来行的状态上算的。

### 未核实或不成立的假设（本轮）

不成立：

- 卡片字段按 `de0ccf6` 写（`why`、`counter`、`consequence`）：`c49478f` 之后不成立（F28）。
- §11.2「规则板不删任何数据」：恢复时替换能解析的快照，不留副本（F31）。
- 「链断开之后到下一个锚点之前的记录没有生效」：锚点是引擎在这些记录之后写的时，它们已经在锚点的状态里（F30）。

未核实，设计已标注并有不成立时的退路（不算发现）：V1–V11；亲和性限制在多于一层嵌套 job 下的行为；混合架构上编号最高的处理器是不是能效核。

未核实，本轮提出：表格版卡片的最终字段名与上限。`card-fields-table` 还在做，分支 `card` 与 main 同在 `c49478f`，F28 的改法以它合入 main 的版本为准。

## 第 2 轮

评审对象：设计 0.2（2026-10-29，207 KB，1398 行）。main 在 `20955fc`（设计写的依据是 `22bebec`，之后多了 `d67980b` 与七个图提交）。依据同第 1 轮，另加图节点 `d-option-card`、`d-counter-line`（改为只对单向门要求反方）、`d-inertia-breaker`，以及设计第 2 轮试验的脚本与结果（`exp/exp-round2*.ps1`、`exp/exp-bootstrap.ps1`、`exp/out/results-round2*.json`）。本轮没有另做 Windows 试验：读了设计的试验脚本与结果文件，核对设计正文里的数字与之相符，`leftRunning` 都为空。

### 结论

CHANGES_REQUESTED。第 1 轮的 19 条全部关闭，Windows 一节改成亲和性限制加逐个降后代之后，证据与限制都站得住，数字与试验结果一致。挡路的只剩一条，是 F4 的修法带进来的：

- F20（MEDIUM）：重放核对每条记录的摘要，但写入时的状态转换在重放时复现不了。一处是清理（§4.4 第 5 步）：它按心跳文件在不在决定删哪些宿主条目，记录里却不写删了什么；另一处是 `recovered` 与 `base` 在链没断时的比对，按字面会因为 `seq` 与 `recovered` 字段不同而对不上。两处都会让引擎自己写的记录被判为「不是引擎写的」，之后的记录跟着全部对不上。蓝屏清零快照之后（验收 §1.4 第 5 条的场景）重建出来的租约与等待单停在很早的位置，人要在面板上逐条点「按记录生效」。

### 第 1 轮发现的复核

| # | 级别 | 状态 | 依据（0.2 的位置） |
| --- | --- | --- | --- |
| F1 | HIGH | 已关闭 | 规则行激活时收进 job，人不在时不设限制（§7.3「收进」）；`sweep` 按 job 的进程列表降后代，Toolhelp 快照找 job 外后代并报 `outside`（§7.3、§7.4）；§7.5 列出激活之前派生的进程；R9 的 L3 第 (2)(3) 步先起空转再切到人在（§15）。试验 `results-round2.json` 的 `descendants` 与 `results-round2d.json` 的 `preListed: false` 支持「收进之前派生的不在 job 里」 |
| F2 | MEDIUM | 已关闭 | `attach` 先 `DuplicateHandle` 进宿主、成功才收进（§7.3、§13）；`orphaned` 时不新建 job、行健康写「重启 DSH 才能改」（§7.4、§11.2）；L3 第 (5) 步。试验 `creatorExited_noDup` 错误 2、`creatorExited_dup` 打开成功 |
| F3 | MEDIUM | 已关闭 | 走开与卸载时先放宽亲和性并强制 Normal、再清标志（§7.3、§11.2）；读回写进 `hosts`；L3 第 (4) 步。试验 `clearOnlyPriority` 停在 BelowNormal、`awayAfterFixPriority` 回到 Normal，`clearOnly` 亲和性停在被限值、`widenThenClear` 放开 |
| F4 | MEDIUM | 已关闭（修法引出 F20） | `canonicalJson` 与 `stateDigest`（§4.2）；逐条核对、对不上不生效、进 `unresolved`（§4.5）；pending 文件（§4.4 第 6 步）；§2.5、§4.5、§11.2 每种情形一个说法 |
| F5 | MEDIUM | 已关闭 | 子 agent 会话结束时单转给派发链的根，`handedFrom`，根下重派复用同一张单（§6.3）；子 agent 的排队文字与转交的唤醒文字（§6.4）；`agents.get` 兜底；`rules-handover` 场景与 V11（§15） |
| F6 | MEDIUM | 已关闭 | `cpuPercent` 5、k = 2、s = 4，限制时不超过 1.1k、放开后不少于 1.5k，今天的代码上第 (3) 步约为 s 判失败（§15 R9）。第 (2) 步按 job 记账量「人不在」一段不少于 1.5k，所以进程逃出 job 时同样判失败 |
| F7 | LOW | 已关闭 | 取锁重读（§4.5） |
| F8 | LOW | 已关闭 | `token` 与摘要（§8.1、§9.5、§12） |
| F9 | LOW | 已关闭 | 限速只在 `builtin:budget-throttle`（§2.2、§2.3、§12） |
| F10 | LOW | 已关闭 | 转述只经 `graph_decide` 拍提议的待决，`kind: 'lift'`（§2.5、§9.4） |
| F11 | LOW | 已关闭 | 子调用照样判定，排队按拦截返回（§6.2 第 1 步）；ptc 模式下的后果见 F26 |
| F12 | LOW | 已关闭 | 改用亲和性限制，宿主保持正常；试验 p95 1.0 毫秒；L3 断言 p95 不超过 20 毫秒 |
| F13 | LOW | 已关闭 | 优先级一级与重活排队进 M4 的 R6（§16） |
| F14 | LOW | 已关闭 | `-EncodedCommand` 引导核对摘要，退出码 9（§7.4）；试验 `bootstrap`、`results-round2e.json` |
| F15 | LOW | 已关闭（引出 F20 的一半） | §4.4 第 5 步 |
| F16 | LOW | 已关闭 | 所有宿主同一个掩码（§7.3、§1.4 第 1 条） |
| F17 | LOW | 已关闭 | `glmHournessDesign.isMainAgent`，没有时退到投影；写明是对 M3 的新要求（§2.3、§10.3） |
| F18 | LOW | 已关闭 | 标为推断，V9 |
| F19 | LOW | 已关闭 | 依据改为 `22bebec`；main 之后又前进，见 F24 |

### 产出各节是否齐全

| 简报要求的产出 | 位置 | 有无 |
| --- | --- | --- |
| 规则模型与存储 | §2、§4 | 有；重放的状态转换有缺口（F20） |
| 来源与检测 | §5 | 有 |
| 每类规则的执行、所用宿主契约与 rc.3 证据 | §6、§6.7 | 有；一处行号不准（F22） |
| Windows 上的资源控制手段、证据与限制 | §7.1、§7.2、§7.5 | 有；每条写明〔本机试验〕〔实读〕〔文档语义〕〔推断〕〔未核实〕，限制列在 §7.5 |
| 排队与推迟的语义、agent 看到什么 | §6.2–§6.4 | 有 |
| 租约与崩溃安全 | §4.5、§4.6、§8、§11.2 | 有 |
| 面板与命令 | §9 | 有 |
| 与 guard、项目图投影、派发（M7）、`d-plan-approval` 的关系 | §10 | 有 |
| 失败与降级（激活不抛错，行健康上报） | §11 | 有 |
| 每步的验证计划（L2、L3、L4）与今天必败 | §14、§15 | 有 |
| 有序的实施分解与里程碑 | §16 | 有 |
| 待人定事项（至少四项），每项选项、后果、推荐 | §19 D1–D5 | 有；格式与新定的选项卡不一致（F25） |
| 「重活」怎样认定 | §7.6 | 有 |
| 可选：给其他工具读同一份状态 | §9.5、§9.6 | 有，标为可选 |

### 新发现

#### F20 MEDIUM：重放复现不了写入时的状态转换，引擎自己的记录会被判为不是引擎写的（§4.4 第 5、6 步，§4.5 第 3–5 步，§1.4 第 5 条）

问题：重放对每条记录算 `candidate = applyRecord(state, record)`，要求 `stateDigest(candidate)` 等于写入时算的 `record.snapshot`。这只在 `applyRecord` 与写入路径产生同一个新状态时成立，设计只规定了序列化与摘要两个函数相同（§4.2），没有规定状态转换相同，而有两处按字面复现不了：

1. 清理。§4.4 第 5 步在写入时去掉关闭超过 24 小时的单，以及「心跳文件已不在超过 1 小时」的宿主条目，并写明「清理是这次写入的一部分，不单独记一条」。记录只带目标的 `from`、`to`，不带删了哪些条目；宿主条目删不删取决于写入那一刻文件系统里有没有心跳文件，重放时无从得知。只要某次写入清理过什么，这条记录在重放时摘要就对不上，被判为 `journal-not-engine`；状态不前进，之后每一条记录的摘要也都对不上。单子开始满 24 小时之后，几乎每次写入都会清理。
2. `recovered` 与 `base` 在链没断时的比对。§4.5 第 3 步要求「它的 `state` 的摘要必须等于当前 `state` 的摘要」。`recovered` 记录的 `state` 是写后的完整状态，`seq` 是这条记录自己的序号，并带着这次恢复的 `recovered` 标记；重放走到它之前的状态，`seq` 是上一条、没有这个标记。按字面两者永远不等。第一次蓝屏恢复时写下的 `recovered`，在第二次快照损坏、从头重放时被判为不生效，它之后的记录全部跟着不生效。

后果：快照被清零之后（2026-10-29 蓝屏的情形，验收 §1.4 第 5 条），重建出来的租约与等待单停在第一次清理或第一次恢复的位置，与损坏前不一致；面板与行健康报大量「流水第 N 条不是引擎写的」，人要逐条点「按记录生效」，这正是 `d-plan-approval` 不要的日常点击。验收条件不满足。

改法：
1. 写入路径与重放路径用同一个状态转换函数 `applyRecord(state, record)`（`src/rules/store.ts`）。写入时先生成完整的记录，含目标的变化以及这次写入带出的全部变化：清理掉的条目 `pruned: {tickets: [<id>…], hosts: [<键>…]}`、新分配的单号、`seq`；再 `next = applyRecord(current, record)`、`record.snapshot = stateDigest(next)`。清理与分配的决定只在写入时做，写进记录；重放只照记录执行，不读时钟、不读文件系统。
2. `base` 与 `recovered` 在链没断时：`candidate = {...current, seq: record.seq, recovered: record.state.recovered, unresolved: <重放到此累积的不生效记录>}`，`stateDigest(candidate)` 等于 `record.snapshot` 才通过，然后 `state = record.state`。§4.5 第 3 步按这个写法重写。
3. R2 的 L2 加一条性质测试：随机生成覆盖每种操作的写入序列（含清理、流水轮换与一次恢复），清零快照后重放：没有不生效的记录，摘要等于清零前的快照；再清零一次重放，结果相同。

#### F21 LOW：检测器运行者的租约在 `Holder` 里没有对应的占用者种类（§4.2、§5.5、§8.2）

§5.5 写「宿主进程取独占资源 `detector-runner:machine` 的租约（占用者是宿主进程）」，§8.2 的表有「宿主（检测器运行者）」一行，按心跳文件判断死活；§4.2 的 `Holder` 只有 `human`、`session`、`process`、`external` 四种。用 `process` 表示时死活按 pid 判断，与 §8.2 的心跳规则不符。改法：`Holder` 加 `{kind: 'host', host: HostId, label}`，死活按 §8.2「宿主」一行；或者写明检测器运行者用 `process` 占用者、死活按心跳。

#### F22 LOW：`goals.get` 的证据行号不准（§6.7）

§6.7 写 `goals.get(agent)` 的 `phase` 证据为 goal:877。goal:877 是 `goal/changed` 事件的 `emit`；`get` 在 goal:611–614（对不是活 agent 的调用抛 `GoalError`），视图在 goal:880–888 展开 `state.goal`，`phase` 的取值在 goal:348–353。改法：证据改为 goal:611、880–888、348–353。

#### F23 LOW：`rules_propose` 提的待决没有按新定的卡片字段写，图引擎拒绝时的顺序与处理没写（§9.4、§12）

`d-option-card` 与 `d-counter-line`（2026-10-29 改）定了人拍板的待决的字段：每个选项一段不超过 20 字的 `label` 与一行 `consequence`，推荐项一行 `why`，`weight` 为 `one-way` 时才要 `counter`；引擎核对这些字段的改动在 m3-base 的第 4 个改动里，按 `question-28` C 会先于规则板合入。设计的提议待决只写了选项键与「推荐 `set`，反方取 `counter`」，`counter` 对所有提议必填（§12）。字段不合时图引擎会拒绝这次 `propose`；设计没写先记规则板的提议还是先提待决，也没写待决被拒时那条提议怎么办（留下一条没有待决的提议，人只能在规则视图里看到）。改法：提议的待决填 `weight: 'two-way'`（规则可以随时解除），两个选项的 `label` 与 `consequence`、推荐的 `why`，`counter` 改为可选；顺序为先提待决、成功后再记提议，待决被拒时不记提议，工具结果原样返回引擎的错误与字段路径。

#### F24 LOW：依据落后于 main，没有写设计依据的学科（文首「依据」）

main 在 `20955fc`。其中 `d67980b` 在 `docs/DEVELOPMENT.md` §1.1 加了一行「设计依据的学科」：设计稿写明依据的学科与标准（`docs/ORCHESTRATION.md` §4.3：harness 与 guard 看安全工程，运行时看可靠性工程，界面看人体工学与认知负荷，度量看测量与统计），评审按列出的去审；挡路标准不变。设计没有这一项。改法：依据改为 `20955fc`；文首加一行学科与标准，例如：存储与恢复（可靠性工程：预写日志、原子替换、崩溃一致性）、权限与文件门禁（安全工程：最小权限、按入口定身份）、Windows 资源控制（操作系统的调度与 Job Object 文档）、面板与在场按钮（认知负荷、`d-option-card`）、L3 的阈值（测量：样本数与误差界）。

#### F25 LOW：§19 的选项没有按 `d-option-card` 的格式写

`d-option-card` 要求给人的每张选项卡：每个选项一段加粗、不超过 20 字的「怎么做」，一行「效果是」（得到与代价），推荐项放最后并多一行「为什么」，只有单向门的题加反方。§19 的 D1–D5 是整段文字，每组都有反方。编排方把 D1–D5 交给人时要重写一遍。改法：每组改成这个格式；D4（推荐档在 DSH 重启之前把宿主留在 job 里）标为单向门并保留反方，其余几组是双向门，反方可以去掉。

#### F26 LOW：ptc 呈现模式下每次调用都是子调用，排队一律变成没有单的拦截（§6.2 第 1 步、§6.4、§7.5）

`dsh-agent-tool-presentation` 的 `mode` 可以设为 `ptc`（`dsh-agent-tool-presentation/lib/index.js`:31）；这时模型只能直接调用 `run_code`，其余调用都带 `parent`（tools:3194–3197 `collapses`）。按 §6.2 第 1 步，这样的 agent 遇到排队规则一律被拒、不开单、没有唤醒；子调用的文字「Make it a direct tool call to get a ticket」在这种模式下做不到。本仓库与默认配置都不用 `ptc`（检索 `src`、`docs`、`packages` 没有），所以不挡路。改法：在 §7.5 列一条「ptc 呈现模式下排队规则退化为拦截，没有等待单与唤醒」；或者 agent 的呈现模式为 `ptc` 时子调用照常开单（`tools.modeFor` 是否对第三方可读要先核实）。

#### F27 LOW：job 外后代的恢复名单只在辅助进程里，辅助进程重启后丢失（§7.3「人走开与行卸载」、§7.4）

人在时 `sweep` 把 job 外的后代降为低于正常，「记下 `(pid, 启动时刻)` 以便恢复」，但没写记在哪；按 §7.4 的协议只能在辅助进程的内存里。人在时辅助进程崩溃、重启，这份名单就没了，人走开时这些进程（例如启动时的 MCP 服务器）停在低于正常，`readback` 只报 `outside` 的个数、不报它们的优先级，所以没人发现。机器空闲时低于正常不影响速度，后果小。改法：名单写进 `hosts` 的 `readback`（宿主档位变化时随 `host-level` 写入），或者重启后的辅助进程在人走开时，把 job 外、低于正常、启动时刻晚于宿主的后代一律恢复为 Normal，并在 `readback` 里报恢复不了的个数。

### 已核实的假设（本轮新增）

- 带 `parent` 的子调用：`collapses(name, scope, nested)` 对嵌套调用不折叠（tools:3194–3197）；`createExecution` 取 `exec.parent`（tools:3234），放进执行对象（tools:3246），参数 `deepFreeze`（tools:3263）。
- 本仓库的 guard 与图文件门禁对带 `parent` 的调用直接 `next()`（`src/guard/index.ts`:158，`src/guard/graph-files.ts`:109）；DeferredToolCall 不带 `parent`（`src/toolsearch/index.ts` 文件头注释）。
- 一次性子 agent 的静止与释放：`watchLocalSettlement`（subagent:1921 起）在 agent 空闲且没有待处理输入、没有自己的子 agent 时经 `runMaintenance` 调 `finishDisposal`，后者对 `local` 激活调 `activation.handle.dispose()`（subagent:2029 前后）。释放之后是否发出 `session/disposed` 仍是推断，设计已列为 V11 并有每 5 秒的兜底。
- 沿 `parentSession` 往上走的做法在 rc.3 里已有先例：subagent:1738–1744 用 `ctx.agents.get(parentSession)` 逐层找父 agent。用户 fork 的会话头只有 `parentSession`、没有 `origin`（session:2014–2018），与设计「链在不带 `origin` 的会话停下」一致。
- DSH 运行器的两条派生路径都不带优先级类：普通进程 `CreateProcessW` 标志 1028（win32-process:704），受限令牌进程 `CreateProcessAsUserW` 标志 4（win32-process:693）。
- `goals.get` 的视图带 `phase`，取值 `active`、`paused`、`blocked`、`complete`（goal:348–353、611–614、880–888）。
- 图引擎的转述：`llm` 带 `relay` 的写入有人的权限（`src/graph/engine.ts`:147–150），对人定的待决拍板后只有人的权限能再拍（engine.ts:237–239）。§2.5、§9.4 的转述路径据此成立。
- 设计第 2 轮试验的结果文件与正文相符：硬上限 5% 下空转 1.5 核、宿主定时器延迟 p95 315.6 与 262.1 毫秒；亲和性 2 个处理器、宿主正常时空转 1.94 核、p95 1.0 毫秒，强制低于正常时 p95 103.0 毫秒；只清标志时优先级与亲和性都停在被限值，先放宽并强制 Normal 再清标志时恢复；创建者退出、没有复制句柄时按名打开错误 2，有复制时成功；job 的进程列表含嵌套 job 里的进程、不含收进之前派生的子进程；引导 379 个字符、编码后 1012 个字符，正文被改时退出码 9，执行策略 Restricted 时 `-EncodedCommand` 照常、`-File` 被拒。`exp-round2b.ps1` 第 74–76 行确认采用的做法是只设亲和性、单独把空转进程降为低于正常。所有结果的 `leftRunning` 为空。

第 1 轮「已核实的假设」一节列出的各项仍然成立，不再重复。

### 未核实或不成立的假设（本轮）

不成立：

- 「写入与重放用同一对函数」就能让重放逐条通过核对（§4.2、§4.5）：同一对序列化与摘要函数不够，状态转换本身要相同；清理与 `recovered` 的比对按现在的写法复现不了（F20）。
- `goals.get` 的证据在 goal:877（F22）。

未核实，设计已标注并有不成立时的退路（不算发现）：V1–V11；亲和性限制在多于一层嵌套 job 下的行为（文档语义）；编号最高的处理器在混合架构上是能效核（§7.3 标〔未核实〕）。

未核实，本轮提出：`tools.modeFor` 或呈现模式对第三方插件是否可读（F26 的第二种改法要先核实）。

## 第 1 轮

评审对象：设计 0.1（2026-10-29，148 KB）。依据：`AGENTS.md`、`docs/CHARTER.md`、`docs/ORCHESTRATION.md`、`docs/DESIGN.md` §2.4、§2.4a、§2.5、`docs/ROADMAP.md`、`docs/DEVELOPMENT.md`（含 §1.1「评审挡路的标准」，`d3e777d`）、split 设计 0.3 与附录 0.5、M3 设计 0.4、`src/guard/`、`src/graph/`、`src/shared/`、`ui/src/`、运行时包 `reference/dsh-desktop-0.2.1-rc.3/`，以及图节点 `rules`、`d-rules-human-only`、`d-plan-approval`、`d-failure-plans`。main 在 `f08981f`。

### 结论

CHANGES_REQUESTED。概念、存储、执行边界、面板与待人定事项都齐全，宿主契约大多有 rc.3 证据。挡路的发现集中在 Windows 资源控制与无人值守的派发两处：

- F1（HIGH）：job 是在「第一次需要上限时」才建的，在那之前派生的进程永远不在 job 里。人回到电脑前时正在跑的构建既不受 CPU 上限也不降优先级，行健康却写「job 上限 25%」。这正是人提出的场景。
- F2、F3（MEDIUM）：两条 Windows 行为与设计写的相反，本轮在一次性进程上实测过。辅助进程死后 job 的名字随之消失，「按名重开接着管」做不到；去掉 job 的优先级类限制之后进程停在 BelowNormal，「人走开时恢复」做不到。
- F4（MEDIUM）：快照与流水对不上时按流水重建，会把不是引擎写的流水记录照样生效，且记为人的写入；同一现象在 §2.5 与 §4.5 里给了两种说法。
- F5（MEDIUM）：一次性子 agent 的等待单在会话结束时取消，没有人收到解除的消息，无人值守时被推迟的重活就丢了。
- F6（MEDIUM）：R8 的 L3 用两个空转核去验 25% 的上限，在 32 线程的机器上上限是 8 核，这条检查在今天的代码上也会通过，钉不住上限。

### 本轮做的核对

读源码：`dsh-tools`（`createExecution`、`prepareExecution`、瀑布与决定、`collapses`）、`dsh-agent-loop`（`status`、`followup`、`steer`、`inject`、`preStep`）、`dsh-agent`（`agent/created`、`get`、`roots`）、`dsh-subagent`（会话头、`subagentCatalog`、`maxActiveSubagents`、`startActivation`）、`dsh-session`（会话头校验、`session/event`、`session/disposed`）、`dsh-session-projection`（`register`、`stateOf`）、`dsh-goal`（`get`、视图）、`dsh-goal-round-driver`（249 行的竞争判定）、`dsh-api-workspace-files/README.md`、`dsh-subprocess/README.md`、`dsh-win32-process`（job 运行器）、`dsh-tool-call-timeout-policy/README.md`、`dsh-desktop-host`（宿主进程模型）、`dsh-plugin-manager/lib/types/tools.js`；本仓库 `src/guard/rules.ts`、`graph-files.ts`、`index.ts`、`src/shared/data-home.ts`、`health.ts`、`src/graph/run-control.ts`、`ui/src/channel.js`；设计自己的试验 `exp/exp-jobobject.ps1` 与 `exp/out/results.json`。

本机试验（Windows PowerShell 5.1 内联 Add-Type，只作用于试验自己启动的一次性 `powershell.exe` 与 `node.exe` 进程，结束后逐个按 pid 结束并核对没有残留，没有写任何文件）：

| 试验 | 结果 | 用于 |
| --- | --- | --- |
| 进程 A 建命名 job、把一次性进程 T 收进去后退出；之后在另一个进程里 `OpenJobObjectW` 按名打开 | T 仍在某个 job 里（`IsProcessInJob(T, NULL)` 为真），按名打开失败，Win32 错误 2 | F2 |
| 同上，但 A 退出前用 `DuplicateHandle` 把 job 句柄复制进 T | A 退出后按名打开成功 | F2 的改法 |
| 进程 P 先派生子进程 C，之后才把 P 收进新 job | P 在 job 里，C 不在 | F1 |
| 一次性进程在 job 里，设 `JOB_OBJECT_LIMIT_PRIORITY_CLASS` 为 BELOW_NORMAL，再把 `LimitFlags` 设为 0 | 设限后 BelowNormal，去掉限制后仍是 BelowNormal | F3 |
| Node v22 父进程收进 job 后派生普通与 `detached` 子进程，两者各再派生一个孙进程 | 两个子进程、两个孙进程都在 job 里 | 已核实：libuv 自己的 job 带静默脱离，但只脱离它自己那一层 |

设计试验的 `reopenedByName` 是在原句柄还开着时、同一个进程里按名打开的；`prioAfterLift` 是把限制改成 NORMAL，不是去掉限制。两项都没有覆盖设计在 §7.3、§7.4 里写的做法。

### 发现

#### F1 HIGH：job 晚建，建之前派生的进程永远在上限之外（§7.3、§7.4、§1.4 第 1 条）

问题：§7.3 写「宿主第一次需要上限时，辅助进程建命名 job 并把宿主进程收进去」，§7.4 写辅助进程「在需要时启动」。Windows 把进程收进 job 时，它已有的子进程不随之进入（本轮实测）。所以人离开时 agent 起的构建，在人点「我在用电脑」那一刻不在 job 里：job 的 CPU 上限和强制优先级都管不到它，`os.setPriority(process.pid, …)` 也只改宿主自己。§7.1 说 job 的强制优先级「补上『已经在跑的不变』」，对这些进程不成立。人回到电脑前时机器还在被正在跑的构建占满，这正是人提出的场景；而行健康与 `hosts` 记录写的是「job 上限 25%」，人看到的说法与实际不符。§1.4 第 1 条「宿主进程树的 CPU 合计不超过上限」不满足，§7.5「做不到的」也没有列出这一条。

改法：规则行激活后，辅助进程 `ping` 通、且 D4 的档位带 CPU 上限，就立刻把宿主收进命名 job，不设任何限制；辅助进程加 `descendants`（Toolhelp 快照加 `IsProcessInJob`），行健康与面板写「N 个进程在上限之外（规则行激活之前派生）」；§7.5 加这一条；R8 的 L3 加「人不在时起空转命令，切到人在之后被压在上限内、读到 BelowNormal」。

#### F2 MEDIUM：辅助进程死后 job 的名字消失，「按名重开接着管」做不到（§7.3、§7.4、§11.2）

问题：job 的最后一个句柄关闭后，job 因为里面还有进程而继续存在，但名字随之删掉，`OpenJobObjectW` 返回错误 2。辅助进程是唯一持有句柄的进程，它一死，宿主就留在一个再也打不开的 job 里；重启后的辅助进程再建一个同名 job，嵌在旧 job 之下，放不开旧 job 的上限，行健康却写新的档位。

改法：`attach` 时用 `DuplicateHandle` 把 job 句柄复制进宿主；重启后按名打开失败且宿主已在 job 里时不建新 job，行健康 degraded「CPU 上限停在 <最后档位>，重启 DSH 才能改」；L3 加结束辅助进程、重启后重开并放开。

#### F3 MEDIUM：去掉 job 的优先级类限制之后进程停在 BelowNormal（§7.3、§1.4 第 1 条）

问题：设计写人走开时「`LimitFlags` 去掉优先级类」。实测去掉限制后进程保持被强制的 BelowNormal；宿主在 job 里，于是宿主与之后派生的进程都停在 BelowNormal，`hosts` 却写 `away`。

改法：先以 `JOB_OBJECT_LIMIT_PRIORITY_CLASS` 加 `NORMAL_PRIORITY_CLASS` 设一次，再清标志，并 `os.setPriority(process.pid, 0)`；读回写进 `hosts`，不符即 degraded；L3 断言切到「不在」之后宿主与在跑的子进程读到 Normal。

#### F4 MEDIUM：流水重建会让不是引擎写的记录生效，并记为人的写入（§2.5、§4.4、§4.5、§11.2）

问题：§2.5 与 §4.5 对同一个「快照与流水不符」给了两种说法；更要紧的是流水是事实源，引擎以外追加一行 `{"actor":"human","op":"rule-lift",…}`（`node -e` 一行，file-tools-only 看不见），引擎按流水重建时照样生效，历史记的是人，绕过 `d-rules-human-only`。

改法：确定的序列化；重放逐条重算摘要并与记录的 `snapshot` 比对，不符的不生效、列给人；改名失败的良性情形用 `.pending` 文件单独识别；§2.5 与 §4.5 统一说法。

#### F5 MEDIUM：一次性子 agent 的等待单随会话结束取消，被推迟的工作无人接手（§6.3、§6.4、§10.4）

问题：会话结束时取消它的单，而 M7 的子 agent 是一次性 worker：重活被推迟后它收尾、会话结束、单被取消，没有任何 agent 收到解除的消息，无人值守时工作停下或被反复重派。

改法：子 agent 的单在会话结束时转给派发链的根，解除时唤醒根；子 agent 的排队文字改为在交回里报单号；L2 用例。

#### F6 MEDIUM：R8 的 L3 上限检查在今天的代码上也会通过（§15 R8）

问题：两个空转核在 32 线程上 25% 的上限（8 个处理器）之内，没有 job、上限失效都通过。

改法：按 `os.cpus().length` 算期望上限，选低于负载的档位，空转线程数不少于上限的两倍，加限时不超过 ×1.1、放开后不少于 ×1.5。

#### F7–F19 LOW

- F7（§4.5）：读写竞争会触发误报的恢复。改法：取锁后重读、重新校验，仍不一致才恢复。
- F8（§8.1、§9.5）：`lease release` 不带占用者身份，任何调用都能释放别的运行的租约。改法：`acquire` 返回随机 `token`，续租与释放要带它。
- F9（§2.3、§2.4）：项目规则的 `throttle` 作用于整个宿主，跨项目语义没写。改法：`throttle` 只用于内置预算规则，或写明取并集。
- F10（§2.5、§9.4、§9.5、§18）：转述写规则没有入口。改法：转述只经 `graph_decide` 拍提议的待决，`rules_propose` 加 `kind: 'lift'`。
- F11（§6.2、§7.5）：带 `parent` 的子调用不进规则板。改法：对子调用判定（拒绝回到程序里，不开单），或列为做不到。
- F12（§7.3、V7）：硬上限按整个 job 计，宿主自己会被拖慢。改法：L3 量宿主的响应；需要时不对宿主强制优先级，由辅助进程逐个降后代。
- F13（§16）：在场按钮在 M7 之前不改变 CPU 占用。改法：优先级一级与重活排队放进 M4。
- F14（§7.4）：辅助进程脚本按文件名执行、不核对内容。改法：启动前核对摘要，或经标准输入传脚本。
- F15（§4.2）：已关闭的单与已退出的宿主一直累积。改法：写入时清理，历史留在流水里。
- F16（§1.4、§7.3）：上限按宿主还是按整机没写清。改法：验收写明，或所有宿主进同一个 job。
- F17（§2.3、§5.7）：主 Agent 角色只读投影，漏掉 `/wish` 的待生效窗口。改法：用设计行的 `isMainAgent`，没有时退到投影。
- F18（§6.2）：调用处等待期间的界面表现没有证据。改法：标推断，列进核实项，随 R4 的 L4。
- F19（文首）：依据写的是 `d27dd29`。改法：改为 `f08981f`。

### 已核实的假设（第 1 轮）

- `tools/pre-execute` 是瀑布，默认 `allow`，决定有 `allow`、`deny{reason, info?}`、`ask`、`cancel`；`cancel` 得到「调用前已中止」（tools:3321、3332）。参数在 `createExecution` 里深冻结（tools:3263），`exec.signal` 来自调用方（tools:3235）。
- `dsh-agent-loop` 里没有 timeout 或 deadline；`dsh-tool-call-timeout-policy` 包的是 `tools/execute`，不包 `tools/pre-execute`。
- 活 agent 的 `status` 把 `maintenance` 算作 `idle`；`followup` 进下一回合并唤醒，`steer` 进下一步并唤醒，`inject` 进下一步不唤醒（agent-loop:790–815）。goal-round-driver 只把进入 `nextTurn` 的消息判为竞争输入（goal-round-driver:249）。
- `agent/created`（agent:581）、`agents.get`（agent:596）、`agents.roots()`（agent:623）。
- 会话头 `cwd` 必须是绝对路径、`origin` 只能是 `"subagent"`（session:1047–1053）；子会话头 `origin: "subagent"`（subagent:354）；`session/event` 同步通知（session:1586–1592），`session/disposed`（session:1929–1936）。
- `subagentCatalog` 只列直接子 agent（subagent:774–803）；`maxActiveSubagents` 默认 8（subagent:2980）；`subagents.startActivation`（subagent:3036）。
- `sessionProjections.register` 的形状与 `stateOf` 同步读（session-projection:67–131）。
- `remote.workspaceFiles` 的文件读不做工作区圈禁，文件的监视按文件读的权限（`dsh-api-workspace-files/README.md`）。
- DSH 不给出受管进程的 pid（`dsh-subprocess/README.md`）。
- DSH 的 Windows 运行器为每条命令建只带 `KILL_ON_JOB_CLOSE` 的 job，不带优先级类，全部运行时包里没有 `BREAKAWAY`（win32-process:537–548、585、659、704）。
- 桌面版的宿主是 Electron 以 IPC 派生的子进程（`dsh-desktop-host/lib/index.js`）。
- Node 进程在 job 里时，普通与 `detached` 子进程以及孙进程都在 job 里（本轮实测）。
- `plugin_manager` 的工具名（`dsh-plugin-manager/lib/types/tools.js`:75）；`conversation.composer.dock` 槽（`ui/src/channel.js`:350）。
- guard 的 `evaluate`、`shellCommandOf`、`renderCorrection`、`fileToolsOnly`、`workspaceContainment`（`src/guard/rules.ts`）；图文件门禁以 `prepend: true` 注册（`src/guard/graph-files.ts`）。
- `userDataHome()` 的解析顺序（`src/shared/data-home.ts`）；`HEALTH_ROWS`、`ACTIVATION_ONLY`（`src/shared/health.ts`）；`rowJournal`（`src/memory/audit.ts`）；`/graph-run` 用 `followup`（`src/graph/run-control.ts`）。
- split 0.3 与 M3 0.4 里设计引用的名字（`ORCHESTRATION_RESIDENT_TOOLS`、`glmHournessPricing.peak`、`toNativeTool`、`src/shared/step-notice.ts`、`hournessMainAgent`、`src/graph/stage.ts`、`focusOf`、`dispatchRoot`）。

### 未核实或不成立的假设（第 1 轮）

不成立（实测）：按名重开（F2）；去掉优先级类即恢复（F3）；job 的强制优先级补上已经在跑的进程（F1）；R8 的 L3 能发现上限失效（F6）。未核实且没有标注：调用处等待的界面表现（F18）；25% 上限对宿主没有影响（F12）。
