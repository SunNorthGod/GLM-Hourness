# 确认需求、图阶段规矩、图命令行规矩、访谈标定任务与运行隔离：附录第 8 步的独立评审

评审对象是 `.worktrees/m3`（分支 `m3`）上这一步唯一的提交 `a9b8ad5`，叠在第 6 步（`05d524a`）之后。我读了整个提交：`src/guard/` 的 `main-agent-graph.ts`、`main-agent.ts`、`main-agent-rules.ts`、`index.ts`；`src/design/` 的 `propose.ts`、`record.ts`、`tool-support.ts`；`scripts/calibrate/` 的 `run-dir.mjs`、`run-calibrate.mjs`、`simulated-human.mjs`；探针的两个脚本；标定任务 `interview-expense-log` 的 `task.json`、`check.mjs`、`prompt.md`、夹具；五份文档的改动；新增和改写的 spec 的用例清单，以及 `design-graph-rules.spec.ts`、`calibrate-run-dir.spec.ts` 的全文。对照附录 0.6 的第 8 步一节、§3.4、§3.5、§3.6、§3.8、§3.10、§3.11、§3.14.7，`onepage.md`，`design-context.md`，`reviews/addendum-r5b.md`，图上的 `m3-2`、`m3-6`、`orch`，`brief.md` 的流程规则，`docs/DEVELOPMENT.md` §1.1。这一步没有更早一轮的评审文件，没有旧发现要逐条核对。

没有重跑套件。采用提交说明里记的结果：build 退出码 0，preflight OK（2 个包、15 行），`npm test` 退出码 0（1247 通过、0 失败、1 跳过），eslint 压制 250 条无新增，knip 21 条、jscpd 2 处克隆都等于基线（基线文件不在改动清单里），gitleaks 无发现，probe 184/184。`.llm/probe-out.txt`（15:31）与此一致，没有一行 FAIL。build、preflight、test 的日志本步没有另存（S8-9）。我另写了三段一次性脚本，对着真实的图引擎和真实的 `judgeGraphStage`、`releaseVerdict` 各跑一遍，用来确认 S8-1 与 S8-2，脚本和临时目录已删，没有改仓库。

## 摘要

这一步把"目标只经人在对话里的同意向前"落成代码：`propose_to_human` 与 `record_human_answer` 的 `confirm` 一种，对所有会话生效的 `main-agent-graph-stage`、`main-agent-graph-cli` 两条规矩，访谈标定任务，以及把标定运行搬进系统临时目录、拷回、核对、删除的 `run-dir.mjs`。`confirm` 一支里人的原话由 harness 核对，写进图的 `relay` 是 harness 按人的消息拼出来的。标定目录的删除只发生在记录里、系统临时目录的直接子目录、名字带前缀的路径上。

阶段规矩有一个口子，而且正是这一步要堵的那件事：两次图工具调用就能把一个目标放到 `release`，两次都被 `main-agent-graph-stage` 判为放行。我对着真实引擎跑过。

Watch for：（1）S8-1，已批准而没写阶段的目标被所有门禁读成"不走设计循环"，规矩只拦"向前"，不拦清空阶段、带 `relay` 凭空造一个无阶段的目标、给无阶段的目标写 `release`；普通会话的 `relay` 不核对，主 Agent 只要人说过话就行（confirmed，已运行）。（2）S8-2，`confirm` 同意时先批准、后改阶段，第二次写失败时目标停在"已批准、无阶段"，错误里"用同样的话再记一次"走不通，而 S8-1 的修法会把剩下的那条路也堵上（confirmed，已运行）。（3）S8-3，嵌套调用（PTC）到不了这两条新规矩，S4-1 仍欠，测试把它钉成了现状（confirmed 读代码，触发条件 likely）。

**Verdict**: NEEDS_CHANGES

## 高层视图

人的原话：同意要求本会话里给人看过这个目标的需求，人的话在最近一次给人看之后，逐段落在人发来的消息里、起止在标点或空白上。我没有找到让模型自己的转述当作人话写进图的路。有一处不对称：同意不钉在"人看到的那一版"上（S8-7）。

阶段只经确认与放行向前：五种调用被拒，三种会话各有纠偏，子 agent 与普通会话的尝试进违规流水、降级行健康、通知持有者，读图失败时拒绝。"有效阶段为空"的那一侧没守住：`effectiveStage` 对已批准而没写阶段的目标返回 `null`，`design-before-release` 对 `null` 一律放行，进入这个状态没有被拦（S8-1）。

图命令行规矩：写子命令对三种会话一律被拒，读子命令放行。认法比附录写的略窄，也不看项目有没有图（S8-6）。

主 Agent 有没有写文件的路：这一步没有动工具面。两个工具只经引擎写项目图；新规矩关掉 shell 里写图的一条路。仍在的缺口是嵌套调用（S8-3）和 §6.7 原有的 shell 残余。

高峰：diff 里没有读档位、排队、等待或定时的代码。新增的拒绝都是立刻返回的错误，读图失败时拒绝也立刻返回，不挂起。

标定运行目录：整批在系统临时目录里跑，整批跑完拷回、按路径与字节数核对，全部一致才删，失败时什么都不删。我没有找到它能删到自己的运行目录之外的路径。两处恢复路径薄（S8-5）。

R5b-N1：本步没有处理，推给第 9 步，提交说明写了查证和建议。可以接受，第 9 步要兑现（S8-4）。

流程规则：一个提交，信息写了 `m3-2`，文档与代码同批，设计行仍是 `disabled: true`，没有新增压制，没有复制共用模块，附录点名的 L2 与 L3 基本都写了，没写的在提交说明里有理由（S8-2、S8-8 说哪几条理由偏弱）。

<details>
<summary>Issues (9)</summary>

1. **S8-1 无阶段这一侧没有守住**（HIGH，阻塞，confirmed，已运行）：`main-agent-graph-stage` 只拦阶段值往后的"向前"，不拦 `set: {stage: null}`，不拦带 `relay` 提议一个没写阶段的目标（引擎直接批准），也不拦给无阶段的已批准目标写 `release`（`from === null` 时放行）。两次调用就能让目标放行、子 agent 可写。改：规则 a 与 d 补三个形状，补测试，改 §6.9 的残余一段；同时按 S8-2 保证确认的中间态仍有路回来。
2. **S8-2 `confirm` 同意的两次写入留下无阶段的中间态**（MEDIUM，不阻塞，与 S8-1 一起改，confirmed，已运行）：先批准、后写 `stage: design`。目标是按唤醒通知提议的（没写阶段）时，第二次写失败后目标是"已批准、无阶段"，门禁全开，错误里"用同样的话再记一次"被 `confirmGate` 拒绝（`outside the design loop`）。改：先写阶段（提议状态下有效阶段不变），再批准；加一个注入失败的用例。
3. **S8-3 嵌套调用到不了两条新规矩**（MEDIUM，不阻塞，confirmed 读代码，触发条件 likely）：`main-agent.ts:152` 对带 `parent` 的调用直接放行，PTC 预设下 `run_code` 里的 `graph_edit`、`graph_approve`、shell 命令都绕过阶段规矩与命令行规矩。S4-1、S5-1、S6-2 同一个洞，测试"a nested call … (the open hole S4-1)"把它钉成现状。改：合入前按编排方的裁定修一次并翻转这条测试，设计行在那之前保持禁用。
4. **S8-4 R5b-N1 再次顺延**（LOW，不阻塞）：图上 `orch` 的批注与一页稿写的是第 5 步，第 5 步没做，本步又推给第 9 步。第 9 步的提交必须兑现，并先在 `m3` 上记成待办。
5. **S8-5 临时目录清理的恢复路径**（LOW，不阻塞，confirmed 读代码）：拷贝成功后 `rmSync` 一旦抛错，`collectBatch` 抛出，记录留着，再 `--collect` 因"目标已存在"停下，说明里的办法走不通，而源目录可能已删了一半；`--collect` 也分不清一批是崩了还是还在跑。改：删除包 `try/catch` 记入 `kept`；目标与源一致时跳过拷贝；记录里写进程号，进程活着时拒绝收集。
6. **S8-6 命令行规矩的范围与认法**（LOW，不阻塞，likely）：不看会话有没有项目图，开着设计行的机器上，别的项目自己的 `npm run graph` 脚本也被拒并给出不贴切的说明，而阶段规矩对没有图目录的会话是放行的；认不出 `npm run-script graph`、`cmd /c …`、`npx tsx …`、`npm exec`。改：没有图目录时放行；按"任何词以 `scripts/graph/cli.ts` 结尾"认路径；`run-script` 当 `run`。
7. **S8-7 同意没有钉在给人看的那一版**（LOW，不阻塞，likely）：`confirm` 同意时只重查需求卡齐不齐，不查目标在给人看之后有没有改过；`question` 一支把起点放在待决最后一次改动之后。人点头后主 Agent 改了正文、卡仍然齐，批准的就不是人看到的那版。改：给人看之后目标出现过非批注的历史时，`agree` 拒绝并要求重新给人看。
8. **S8-8 两处测试**（NIT）：`design-graph-rules.spec.ts` 里 `assert.ok(warnings.length >= 0)` 永真；"读不到图"的用例五种候选只测了三种（提交说明已写明）。换成真断言；另两种各补一例。
9. **S8-9 本步的门禁日志没有另存**（NIT）：只有提交说明与 `.llm/probe-out.txt`，前几步把 build、preflight、test 的输出存进 `impl/notes/`。下次存，评审才能对数。

</details>

<details>
<summary>Details</summary>

### 无阶段的目标：阶段规矩的口子

附录 §3.14.7 写明阶段的全部写路径都在表里，"没有列出的写法都被拒"。表里目标的"无 → `wish`"只列了主 Agent 提议一条，没有"无 → `release`"，也没有清空。`m3-6` 验收第 2 条的新字句是"任何会话用图工具或在会话里用图的命令行向前改目标或模块的阶段……都被拒绝"。实现把"向前"读成阶段值的先后，而 `STAGES` 之外还有第四种状态：已批准而没写阶段。`effectiveStage` 对它返回 `null`（`src/graph/stage.ts` 的注释写着"it does not run the design loop"），`releaseVerdict` 对 `null` 直接 `allow`（`design-release.ts:90`），`confirmGate` 对它说 `outside the design loop`，M7 的 `isPostRelease` 只认 `release` 及以后。

规矩 a 与 d 对这一侧的写法：`editAttempt`（`main-agent-graph.ts:216`）在 `!isStage(to)` 时返回 `undefined`，所以 `set: {stage: null}` 不是候选，`stageCandidate` 也只把 `typeof set.stage === 'string'` 的编辑当候选。:223 的 `from === null || !forward ? undefined` 把有效阶段为空的节点整个放过，所以给无阶段的已批准目标写 `release` 不被拦。`proposeAttempt`（:245）对目标只在 `isStage(stage) && laterThan(stage, 'interview')` 时拦（:250），没写阶段的目标不满足 `isStage`，落到 `goalOf(graph, parent)` 的分支，没有父节点所以 `undefined`。引擎对带 `relay` 的提议一律直接批准（`engine.ts:427`），带 `relay` 的 `edit` 里 `null` 是删字段（:648）。

三种形状我都用真实引擎和真实规则跑了，规则全说 `allow`，引擎全接受：

```text
清空：目标 stage design，普通会话 graph_edit set {stage: null} + 编的 relay
      -> 规则 allow；引擎接受；design-before-release 对焦点在该目标的判定 deny -> allow
造一个：graph_propose {type: goal, title} + relay（不写 stage）
      -> 规则 allow；引擎建出 status approved、无 stage 的目标；design-before-release allow
两步放行：先造一个，再 graph_edit set {stage: 'release'} + relay
      -> 两次都 allow；结果 status approved、stage release；isPostRelease 为真；design-before-release allow
```

谁走得通：普通会话的 `relay` 不核对（附录 §3.8 第 1 条），编一段就行。主 Agent 的 `relay` 要过 `personSaid`，核对的是"这段话在人发来的消息里"，不是"人同意了这件事"：第一步要会话里任何一条人的消息，第二步要第一步之后人又发过一条，寒暄就够。子 agent 带 `relay` 一律被拒，不带 `relay` 写不了阶段。所以走得通的是普通会话与主 Agent。

后果是整个设计循环被跳过：需求没确认，设计没放行，子 agent 的写入解开，M7 的放行门禁也认这个目标已放行。它让"目标由访谈进设计只有这一条路"（`record.ts` 文件头、ORCHESTRATION §4.8）不成立。提交说明与 §6.9 把"清空"一种写成残余、留给对齐轮，另两种没有提到。

按 DEVELOPMENT.md §1.1 这是验收（`m3-6` 第 2 条）没满足，而且是这一步的核心条件，所以阻塞。修法不大：

- 规则 a：`set.stage` 为 `null` 时，对有效阶段是 `wish`、`interview`、`design` 的目标或特性拒绝；对有效阶段为空的目标，值在 `interview` 之后的 `set.stage` 拒绝（会话里没有合法的"无 → 往后"写法，编排方在 DSH 之外用命令行改旧图）。特性随第 9 步的模块规则定，本步至少覆盖目标。
- 规则 d：带 `relay` 提议目标时，没写阶段与阶段在 `interview` 之后都拒绝，只放 `wish`、`interview`（出生即批准、有效阶段仍在循环里，确认那一支接得住）。
- 测试：三种形状 × 主 Agent、子 agent、普通会话，再加一个"两步放行"的端到端用例，最后断言 `releaseVerdict` 仍是 `deny`；§6.9 的残余一段改写。
- 与 S8-2 一起改，别让这个修法把确认中途停下之后的出路堵死。

### 确认同意的两次写入

`confirmWrites`（`record.ts:301`）先对提议状态的目标 `approve`，再 `edit` 设 `stage: design`，与附录 §3.5 表里的次序一致。唤醒通知教主 Agent 提议目标时不写阶段（`mode.ts` 的 `wishNotice` 只说"propose the goal … with a body that starts with 需求："），所以通常的目标是"提议、无阶段"，有效阶段 `wish`。批准之后它是"已批准、无阶段"，有效阶段 `null`，在设计循环之外。第二次写失败，目标就停在这个状态。

失败路径有 `stale_revision` 两次和磁盘写错误。错误的 `hint` 写"用同样的话再记一次就接上"（:326），而重放时 `confirmGate` 看到的有效阶段是 `null`，抛 `invalid: outside the design loop`，我运行过，重放被拒。剩下的路是人再说一句话，主 Agent 用 `graph_edit` 带新的 `relay` 把阶段改成 `design`（现在靠规则 a 的 `from === null` 放行），S8-1 的修法恰好要堵这一步。中间态本身门禁全开：`design-before-release` 对它放行，直到有人补上阶段。

提交说明承认没有 `stale_revision` 重试与"批准成功而阶段没写成"的测试，这一支正是最需要的。改法：目标仍是提议时，先 `edit` 写 `stage: design`（提议状态下有效阶段始终是 `wish` 或 `interview`，门禁仍关着），再 `approve`；任何一步停下，重放都能通过 `confirmGate` 接着做。次序与附录表不同，请在提交说明里写出来。再加一个注入第二次写失败的用例，断言重放成功、停下时目标仍在循环里。

### 同意没有钉在给人看的那一版

`question` 一支把起点放在待决最后一次 `propose`、`edit`、`decide` 之后，人同意的是最新一版。`confirm` 的需求本身在主 Agent 的汇报里，harness 看不到，但"目标自上次给人看之后没变"可以机器查：目标最后一条非批注历史的 `at` 晚于那次 `shown.time` 就 `not_shown`，要求重新给人看。不查时，人点头之后主 Agent 改了正文、卡仍然齐，批准写进去的是人没看过的版本；原话对得上，`personSaid` 抓不到。

### 命令行规矩

没覆盖的写法：`npm run-script graph`、`npm exec -- node …/cli.ts`、`npx tsx …/cli.ts`、`cmd /c "npm run graph …"`（`shell.ts` 的内层 shell 只认 POSIX 与 PowerShell 两族）。附录 §3.8 第 4 条承认认不出脚本里直接开引擎，没提这几种。这台机器是 Windows，`cmd /c` 离模型不远。顺手的改法是"任何一个简单命令里有以 `scripts/graph/cli.ts` 结尾的词，不看命令名"，包管理器那一支把 `run-script` 当 `run`。

另一头是误报：`cliRefusal` 只读命令文字，不看会话所在工作区有没有项目图。设计行一旦启用，任何项目里的 `npm run graph`（GraphQL 之类的项目常有这个脚本名）都会被拒，说明写的是"Inside DSH the project graph changes through the graph tools"。阶段规矩对没有图目录的会话放行（提交说明里写作解释），命令行规矩应取同一个口径：`deps.graph()?.dirFor(cwd)` 没有值时放行。

### 嵌套调用

监听器第一行 `payload.parent !== undefined` 就 `return next()`（`main-agent.ts:152`）。PTC 预设下 `run_code` 里再发起的图工具调用与 shell 调用都带 `parent`，所以阶段、命令行、关系、选项、委托五条图规矩都到不了。这条从第 4 步评审起一直是 S4-1，第 5、6 步评审各重申一次。本步多两条规矩依赖它，`m3-6` 的验收是"任何会话"，而失效条件只是选了 PTC 预设。ORCHESTRATION §6.9 的残余一段如实写了，§6.4 的表和身份节没有加条件。合入前修一次，设计行在那之前保持禁用，不要因为 §6.4 写着"已实现"就放进任何真实会话。

### 标定运行目录与删除

清理会不会删到自己的运行目录之外，我逐条读了 `run-dir.mjs`：拷贝与回滚的目标路径只来自 `join(target, name)`，批目录条目名来自 `readdirSync`，运行名过 `RUN_NAME`（`/^[\w.-]+$/`，且不是 `.` 与 `..`）；回滚只删本次调用 `made` 里的路径，拷贝前的 `existsSync` 检查保证它们原本不存在。临时目录的删除只对 `pending.json` 记着的路径，且 `deletable` 要求 `dirname(resolve(path))` 等于 `tmp`、`basename` 以 `glm-hourness-calib-` 开头；`calibrate-run-dir.spec.ts` 往记录里伪造了仓库下的路径、无前缀的路径、前缀目录下更深一层的路径、别处的带前缀目录，都没被删、被报出。能触到的只有同前缀的别的直接子目录，前提是有人改得了 `<repo>/.llm/calibration-runs/<stamp>/pending.json`，那已是用户自己的权限。

S8-5 说的两处恢复路径：删除一步没有 `try/catch`，Windows 上 `rmSync` 遇到被占用的文件抛错时，`collectBatch` 把异常抛出，记录留着。此时目标里已有完整拷贝，再 `--collect` 会在 `taken` 检查（`run-dir.mjs:132`）停下说目标已存在，说明里"修好后运行 `--collect`"走不通；若 `rmSync` 在某个运行目录里删了一半，用户清掉目标再收集，拷到的是残缺的源。另外记录里没有进程号，`--collect` 区分不了崩了的一批与还在跑的一批，指到活批次的时间戳会拷走并删掉被测模型正在用的目录。两处后果都是丢一批标定结果（要积分），不丢仓库数据，所以不阻塞。

### R5b-N1

来源之间不一致：图上 `orch` 的批注与一页稿写"放行前只读那一步"（第 5 步），`brief.md` 写"定模块或目标阶段写权限的那一步"，附录把模块的阶段写权限放在 §3.14.7（第 9 步）。提交说明选了第 9 步：本步只做目标一级的 a 到 d，没有任何一处读"这个特性是不是模块"。我同意这个读法，附录支持它。提交说明对当前图的查证我对了一遍：只有 `orch`（特性、已批准、`stage: design`、挂在 `execute` 阶段的 `hourness` 下）会被读成没放行的模块，`m3` 挂在它下面，焦点落在 `m3` 时 `design-before-release` 会拒子 agent 的写；`bottom`（`execute`）读成已放行；`m2` 在 `orch` 下面，不是目标的直接子节点，不算模块。建议的处置（用命令行清掉 `orch` 的 `stage`，其子树的投影改显示 `hourness` 的 `execute`）合理。

问题是节奏：第 5 步该做的没做，本步又转手。第 9 步的提交要兑现（清阶段的命令、前后投影与门禁判定的对比写进提交说明），并先在 `m3` 上记成待办，主 Agent 在 DSH 里第一次跑这个仓库之前必须完成。

### 测试

提交说明列出没写的用例，我认为合理的有：`supersedes` 连线的确认用例（引擎不能给已有目标加这条连线）、模拟人同步读图没有 L2（L3 抓到过它）、真跑一次标定（要桌面版和积分，放行一支第 9 步才开）。理由偏弱的是：`stale_revision` 重试与中途失败（S8-2）、读图失败时五种候选只测了三种、指标事件没人看（S6-4 已记）。

</details>

<details>
<summary>File map</summary>

完整改动用 `git -C c:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\m3 show a9b8ad5` 看。

- `src/guard/main-agent-graph.ts`：`judgeGraphStage`、五种候选的判定（`editAttempt`、`approveAttempt`、`proposeAttempt`）、`graphCliWrite` 与认命令行的辅助函数
- `src/guard/main-agent.ts`：一个监听器里装进阶段规矩与命令行规矩，三种会话的分支、告警、`who` 标签
- `src/guard/main-agent-rules.ts`、`src/guard/index.ts`：两个新规则 id 与 `stageFrom`、`stageTo` 字段
- `src/design/propose.ts`、`record.ts`、`tool-support.ts`：`confirm` 一种、`confirmGate`、`openGoal`、`confirmWrites`
- `scripts/calibrate/run-dir.mjs`（新）、`run-calibrate.mjs`、`simulated-human.mjs`：隔离、拷回、删除、`--collect`、按任务的上限、同步读图
- `scripts/probe/`：`{rev:<id>}` 与 `other:{line, say}`，场景 `glm-design-interview`
- `tests/calibration/interview-expense-log/`：任务、夹具、验收脚本
- `tests/`：`design-graph-rules`、`propose-to-human`、`record-human-answer`、`calibrate-run-dir`、`calibrate-interview-check`、`contracts`、助手文件
- `docs/`：ORCHESTRATION §3.1、§4.8、§6.4、§6.9、§10.5.1，DESIGN、HANDOFF、DEVELOPMENT 各一处
- `package.json`：两个新 spec 进 `npm test`

</details>
