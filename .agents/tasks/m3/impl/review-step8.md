# 确认需求、阶段与命令行规矩、标定运行隔离：附录第 8 步的第二轮独立评审

评审对象是 `.worktrees/m3`（分支 `m3`）上这一步唯一的提交 `3fbc1e9`。它是第一轮评审过的 `a9b8ad5` 经 amend 改出来的，两者差 7 个文件：`src/guard/main-agent-graph.ts`、`src/design/record.ts`、`docs/ORCHESTRATION.md`、`scripts/probe/run-probe.mjs`，以及三个 spec。我读了整个提交（29 个文件，+2316/−163）和这 7 个文件的差异，对照附录 0.6 第 8 步一节及它指到的 §3.4、§3.5、§3.6、§3.8、§3.10、§3.11、§3.14.7，`onepage.md`，`design-context.md`，`reviews/addendum-r5b.md`，图上的 `m3`、`m3-2`、`m3-6`、`orch`，`brief.md`（含编排方的几条裁定）和 `docs/DEVELOPMENT.md` §1.1、§9。第一轮的九条逐条核对，结果在后面；第一轮原稿存为 `review-step8-round1.md/.json`。

门禁没有重跑，采用提交人存下的记录（`impl/notes/step8-fix-*.txt`）：build 退出码 0；preflight OK（2 个包、15 行）；`npm test` 退出码 0，各文件合计 1252 通过、0 失败、1 跳过（第 6 步留下的面板契约一条）；eslint 250 条压制、knip 21 条、jscpd 2 处克隆都等于基线，基线文件不在改动里；verbatim、gitleaks 通过；probe 184/184。源码与测试的最后一次改动在 16:21，日志写于 16:23 至 16:26，提交在 16:27，所以日志对的是最终这棵树（提交说明里"final tree"那句容易让人读成不是）。我另做了两件一次性的事，脚本在系统临时目录、已删：把 19 种命令写法喂给真实的 `graphCliWrite`；在临时目录里试 `rmSync` 与 `cpSync` 遇到目录联接（junction）时的行为。

## 摘要

这一步把"目标只经人在对话里的同意向前"做完整了：`confirm` 一支、对所有会话生效的 `main-agent-graph-stage` 与 `main-agent-graph-cli`、访谈标定任务，以及搬进系统临时目录的标定运行。第一轮的阻塞项 S8-1（阶段线"没有阶段"一侧的三种绕过）已修，我对着代码和测试核过，目标一级没有找到能不经 `record_human_answer` 往前走的图工具形状。S8-2（确认的两次写入）改成先写阶段、后批准，中途停下时目标仍是提议，同样的话能接上。没有新的阻塞项。

Watch for：（1）S8-3，嵌套调用（PTC）到不了这两条新规矩，编排方已裁定合入前修，测试仍把它钉成现状（confirmed 读代码，触发条件 likely）。（2）S8-6，命令行规矩认不出七种写法，其中 `cd` 加相对路径、`cmd /c`、`run-script`、`--file` 的值没写进 §6.9 的残余（confirmed，已运行）。（3）S8-7，同意没有钉在给人看的那一版，附录 §3.6 把"不把对上一版的同意算到这一版上"列为防住的事，`confirm` 只防了"话在给人看之前"（confirmed 读代码）。（4）S8-10，amend 改写了已推到 `origin/m3` 的提交，违反 `DEVELOPMENT.md` §9（confirmed）。

**Verdict**: APPROVED

## 高层视图

人的原话：写进图的 `relay` 是人在给人看之后发来的消息里的整句引文，经 harness 核对；模型自己的转述 `recordedAs` 在同意时不存。我没有找到让转述当人话写进图的路。没做的是把同意钉在给人看的那一版（S8-7）。

阶段线：循环里的目标不能向前，也不能靠清掉阶段或造一个没有阶段的已批准目标走出循环。目标只经 `record_human_answer` 的 `confirm` 向前。特性与模块的几支按附录归第 9 步，§6.9 的残余一段写了。

确认的写入顺序：先写阶段 `design`，再批准。中途停下时目标是提议，有效阶段仍是 `interview`，门禁照旧关着，同一段话重记一次就接上。这个次序与附录 §3.5、§3.14.7 的表相反，提交说明和 ORCHESTRATION §4.8 写了，附录本身没改（S8-11）。

命令行规矩：对常见写法有效，对三种会话一律生效。认不出的写法比 §6.9 承认的多（S8-6）。

主 Agent 写文件与高峰：这一步没动工具面。命令行规矩封掉了主 Agent 用图命令行写节点文件的常见路，PTC 嵌套调用和认不出的写法仍在（S8-3、S8-6）。diff 里没有读档位、排队、等待或定时的代码，新增的拒绝立即返回。

标定目录：删除只发生在 `pending.json` 记着的、系统临时目录的直接子目录、名字带 `glm-hourness-calib-` 的路径上。我试了目录联接，`rmSync` 不跟进去，外面的文件还在。两处恢复路径仍薄（S8-5）。

R5b-N1：本步不拥有它，提交说明做了只读核查并留给第 9 步。接受，条件见 S8-4。

流程规则除 amend 已推送的提交（S8-10）外都满足；附录点名的 L2、L3 都在，没写的有理由。

<details>
<summary>Issues (7)</summary>

1. **S8-3 嵌套调用到不了两条新规矩**（MEDIUM，不阻塞，confirmed 读代码）：`main-agent.ts:152` 对带 `parent` 的调用直接放行，PTC 预设下 `run_code` 里的 `graph_edit`、`graph_approve` 和 shell 命令（含图命令行）都绕过。S4-1、S5-1、S6-2 同一个洞，编排方裁定合入前一次修好；修好时翻转 `design-graph-rules.spec.ts:478` 的钉现状用例，设计行在那之前保持禁用。
2. **S8-4 R5b-N1 留给第 9 步**（LOW，不阻塞）：第 9 步的提交要清掉 `orch` 的 `stage` 并写出前后对比，并在 `m3` 的"合入前仍须关闭的项"里记一条，现在只有 `m3-2` 的批注提到。
3. **S8-5 标定目录清理的恢复路径**（LOW，不阻塞，confirmed 读代码）：拷贝完整之后 `rmSync` 抛错，`--collect` 停在"目标已存在"（`run-dir.mjs:132`），说明里的办法走不通；`pending.json` 没有进程号，指到还在跑的批次会拷走并删掉它的目录；拷回会跟着目录联接把外面的文件当普通文件拷进来（已运行）。
4. **S8-6 命令行规矩认不出的写法**（LOW，不阻塞，confirmed 已运行）：`npm run-script graph`、`npm --prefix . run graph`、`cd scripts/graph && node cli.ts`、`node ./scripts/graph/../graph/cli.ts`、`npx tsx scripts/graph/cli.ts`、`cmd /c "npm run graph …"`，以及 `-- --file show edit`（`subcommandOf` 把 `--file` 的值当子命令）。另外它不看会话有没有项目图。
5. **S8-7 同意没有钉在给人看的那一版**（LOW，不阻塞，confirmed 读代码）：`confirm` 同意时只重查需求卡齐不齐。给人看之后目标被改过、卡仍然齐，批准的就不是人看到的那版。加一条：目标在给人看之后出现过非批注的历史就 `not_shown`，一个 L2。
6. **S8-10 amend 改写了已推送的历史**（LOW，不阻塞，confirmed）：`a9b8ad5` 在 07:57Z 已被编排方推到 `origin/m3`，现在 `m3` 在 `3fbc1e9`，`origin/m3` 不是它的祖先，再推要强推，`DEVELOPMENT.md` §9 不许。第 9 步还没叠上来，现在改成追加的修复提交最便宜。
7. **S8-11 确认写入的次序与附录不同，附录没改**（NIT）：附录 §3.5 表和 §3.14.7 表仍写先批准后改阶段，代码和 ORCHESTRATION §4.8 是先改阶段。请编排方把它记成 agent 定的偏离，并改附录两处。

</details>

<details>
<summary>Details</summary>

### 第一轮九条的处理

S8-1 已修。`editAttempt`（`main-agent-graph.ts:223`）现在把 `set.stage` 为 `null` 当候选：目标或特性带着阶段、有效阶段是 `wish`、`interview` 或 `design` 时拒绝；有效阶段为空的目标被写上 `interview` 之后的阶段时拒绝，写 `wish` 或 `interview` 放行（那是把它放进循环）。`proposeAttempt`（:265）对带 `relay`、没有阶段的目标，以及阶段在 `interview` 之后的目标拒绝。`stageCandidate`（:290）把 `null` 算进去。`design-graph-rules.spec.ts` 的四个新用例（:506、:538、:561、:589）对主 Agent、子 agent、普通会话各跑一遍，最后一个是两次带 `relay` 的调用从无到 `release`、从设计到 `release`，末尾断言 `releaseVerdict` 仍是拒绝。读不到图的用例（:444）现在是七种候选，永真断言删了。

在测试之外，我找了别的出入循环的口子，没有找到：`set.stage` 过 `format.ts:274` 的 `oneOf(STAGES)`，带空格或大小写不同的值引擎不收，所以守卫的 `isStage` 与引擎读到的是同一个集合；不带 `relay` 提议的、写了 `release` 的目标有效阶段是 `interview`，工具批准不了它（b 条），`confirm` 还会把它的阶段改回 `design`。留下的是模块那一半，见下面的"阶段线"一节。

S8-2 已修，见"确认的写入顺序"。S8-8 已修（`length >= 0` 已不在，另两种候选补上）。S8-9 已修（`impl/notes/step8-fix-build.txt`、`-preflight`、`-probe`、`-test` 在）。S8-3 到 S8-7 提交说明明说没修，由编排方排；我在后面逐条重述，S8-6 和 S8-5 有新的实测。

### 人的原话

`confirm` 的核对链：`record.ts:258` 起，先要本会话 `hournessTalk` 里有这个目标的 `kind: confirm` 的一次给人看（`propose_to_human` 在需求卡不齐时返回 `gate_unmet`、不返回 `text`，所以被拒的调用不留这一项），没有就 `not_shown`；再 `personSaid(state, args.words, shown.time)`（:262），每段引文必须是 `shown.time` 之后人发来的某条消息里起止在标点或空白上的整段；`sample` 带了就要整段在主 Agent 随后的话里；同意时需求卡再查一次（`confirmGate`，每次写入尝试前都查），才写图。`relay` 是 `personSaid` 返回的引文拼接（`talk.ts:296`），也就是模型给的字符串，它只在与人的某段话在 NFKC 与空白折叠之后相等时才被收。`recordedAs`（模型的转述）同意时不存，补充与否掉时写进批注并标"主 Agent 记成"。

harness 不判人的话是不是"同意"，从"可以，但是不要联网"里摘"可以"能通过，这是附录 §3.6 明说不防的。需求本身在主 Agent 随后的报告里，harness 看不到，只有传了 `sample` 才能核对整段是否出现。

S8-7 是这条链上唯一的不对称。`question` 一支把起点放在待决最后一次 `propose`、`edit`、`decide` 之后（`record.ts:157`），`confirm` 的起点是给人看的时间。人说"可以"之后，主 Agent 改了目标正文，需求卡仍然齐，`confirm` 照样通过，批准的是人没看过的版本。附录 §3.6 把"把对上一版方案的同意算到这一版上"列在防住的事里。修法一条：目标在 `shown.time` 之后出现过非 `comment` 的历史，`agree` 返回 `not_shown`，要求把需求再给人看一次；这只覆盖目标自己的字段（正文、验收、非目标、阶段），挂在目标下的风险和待决不进目标的历史，覆盖不到，可以接受。

### 阶段线

规则读的是有效阶段，不是字段原值（`effectiveStage`：提议状态一律读成 `wish` 或 `interview`）。目标一级的出路只剩 `record_human_answer`，它直接调引擎，不经图工具。

还开着的有两块。其一是模块那一半：没有阶段的特性被写上阶段（普通特性写成模块或写成已放行）、已放行的模块被清掉阶段、还没放行的模块下的批准与提议。附录 §4 第 8 步一节明说这些随第 9 步，ORCHESTRATION §6.9 的残余一段也写了。设计行默认禁用，第 9 步在同一分支上先于合入，我接受。其二是 S8-3：监听器第一行 `payload.parent !== undefined` 就放行（`main-agent.ts:152`），PTC 预设下 `run_code` 里再发起的图工具调用与 shell 命令都带 `parent`，所以阶段规矩、命令行规矩、关系规矩、选项规矩、委托规矩一起绕过。`m3-6` 的验收是"任何会话"，失效条件是选了 PTC 预设。编排方的裁定是 S4-1、S5-1、S6-2、S8-3 一次修好，最晚在合入前，设计行在那之前不启用；我照这个裁定把它列为不阻塞。

### 确认的写入顺序

`writeAgreement`（`record.ts:310`）先写 `stage: design`（已是 `design` 就跳过），再批准（已批准就跳过）；引擎抛的错误（磁盘写不进）与引擎返回的错误同样变成拒绝，带"目标是什么状态、用同样的话再记一次"的提示。`confirmWrites`（:337）每次尝试前重查需求卡，`stale_revision` 时重读一次再试。

选这个次序的理由成立：提议的有效阶段不随它写的阶段变，所以第一次写之后每个门禁仍读成访谈，`confirmGate` 对重放照样通过；反过来，先批准会留下"已批准、没有阶段"的目标，正是 S8-1 说的出了循环的状态。`record-human-answer.spec.ts:670` 对第一次与第二次写入各注入一次磁盘写失败，断言目标仍是提议、`releaseVerdict` 拒绝、同样的话重记之后一次阶段写入加一次批准。没有测的是 `stale_revision` 的重试分支本身，它与已测的失败路径走同一个 `writeAgreement`，风险小。

### 命令行规矩

对 19 种写法，真实的 `graphCliWrite` 认出：`npm run -s graph`、`pnpm graph`、`node … scripts/graph/cli.ts`（含 `--experimental-strip-types` 之类前置参数）、`bash -c`、`sh -c`、`pwsh -Command` 里的这些、`time` 前缀、管道。POSIX 方言下的 `env X=1`、`X=1` 前缀也认。

认不出的（两种方言都是）：`npm run-script graph -- edit`、`npm --prefix . run graph -- edit`、`cd scripts/graph && node cli.ts edit`、`node ./scripts/graph/../graph/cli.ts edit`、`npx tsx scripts/graph/cli.ts edit`、`cmd /c "npm run graph -- edit {}"`、`npm run graph -- --file show edit`。最后一条：`subcommandOf` 只跳过 `--dir` 的值，`--file show` 的 `show` 被读成子命令而放行；真实 CLI 把它当文件名，请求要从一个叫 `show` 的文件里读，所以只有存在这样一个文件时才成立，主 Agent 写不出文件，其他会话可以。§6.9 的残余只点了脚本里开引擎、`npm --prefix` 类前置选项、别的运行器；`cd` 加相对路径和 `cmd /c` 没点到。这台机器是 Windows。

主 Agent 要用这些写法，得在被拒之后刻意换路，被拒文字已把它指回图工具，所以不阻塞。改法：`run-script` 当 `run`，`--prefix`、`-C` 一类前置选项跳过，`npx`、`npm exec`、`pnpm exec` 当包运行器，`subcommandOf` 也跳过 `--file` 的值，`shell.ts` 的内层 shell 认 `cmd /c`；`cd` 加相对路径的写法靠"任何词以 `cli.ts` 结尾且同一命令里出现过 `scripts/graph`"这类宽松认法兜住，代价是误报。另一条路是让图命令行自己在 DSH 会话里拒绝写入，那要引擎侧的信号，超出这一步。命令行规矩也不看会话有没有项目图，开着设计行的机器上，别的项目的 `npm run graph` 脚本会被拒并给出不贴切的说明，阶段规矩对没有图目录的会话是放行的，口径不一致。

### 标定运行目录与删除

删除的范围：`collectBatch` 只对 `pending.json` 记着的路径动手，且 `deletable`（`run-dir.mjs:88`）要求它是临时根的直接子目录、名字以 `glm-hourness-calib-` 开头；其余路径保留并报出，记录文件仍然删掉、退出码 0。拷回前先查目标是否已有同名（:132），拷回只写 `join(target, name)`，运行名过 `/^[\w.-]+$/`；失败时回滚只删本次调用 `made` 里的路径，它们在拷贝前不存在。`calibrate-run-dir.spec.ts` 往记录里伪造了仓库下的路径、无前缀的、更深一层的、别处带前缀的，都没删。

目录联接：我在临时目录里建了 `run/ws/link`（junction，指到 `outside/`，里面有 `keep.txt`），在 Node 22.20、Windows 上试。`rmSync(run, {recursive, force, maxRetries: 3})` 删掉了 `run`，`outside/keep.txt` 还在，即删除不跟着联接走。反过来，`readdirSync(recursive)` 会列出联接里的文件，`cpSync` 把联接拷成了普通目录并带进了 `keep.txt`，所以被测模型在工作区里建一个联接，拷回会把联接指向的内容当普通文件拷进仓库的 `.llm/calibration-runs/`，大小核对照样通过。标定用 `danger-full-access`，模型能建联接，但这不是模型会做的事，只在 S8-5 里记一句。

S8-5 的两处恢复路径没变：删除一步没有 `try/catch`（:153 起），拷贝完整之后 `rmSync` 抛错（Windows 上文件被占用），`collectBatch` 把异常抛出、记录留着，再 `--collect` 在 :132 停下说目标已存在，说明里"修好后运行 `--collect`"走不通；`pending.json` 没有进程号，`--collect` 区分不了崩掉的批次和还在跑的批次。后果是丢一批标定结果与积分，不丢仓库数据。改法同第一轮：每次删除包 `try/catch` 记进 `kept`，目标与源一致的条目跳过拷贝，记录里写运行器的进程号、进程活着时拒绝收集。

### R5b-N1

按 `orch` 节点 10-30 的批注和 `m3` 10-30 的放行批注，处置排在"定模块与目标阶段写权限"的那一步，要核对阶段继承和门禁。0.6 的步骤表把这件事分成两半：目标一级的 a 到 d 与 `confirm` 在本步，引擎对模块 `stage` 的例外、`initialStatus` 的收窄、c、d 的模块分支与 e 在第 9 步。`orch` 是特性，它的阶段由模块那一半管，所以留给第 9 步合理。提交说明做了只读核查，我对了图上的数据：`hourness` 是目标、`stage: execute`；`orch` 是特性、已批准、`stage: design`；`m2` 已完成、`stage: release`；`m3` 没有自己的阶段；`bottom` 在 `glm-house` 下、`stage: execute`。所以 `orch` 被读成没放行的模块，清掉它的 `stage` 后其子树改读 `hourness` 的 `execute`，`bottom` 不受影响，与说明一致。

本步的规则 a 还会拒绝在 DSH 会话里清 `orch` 的阶段，所以只能由编排方在 DSH 之外用图命令行做，提交说明给了命令。条件不变：第 9 步的提交要执行它并写出前后两组数（阶段投影、`design-before-release` 对焦点 `m3` 的判定）；主 Agent 在这个仓库的 DSH 里第一次跑之前必须做完。`m3` 节点 07:13Z 那条"合入前仍须关闭的项"没有列它（只有 `m3-2` 的批注提到），请补上（S8-4）。

### 流程

提交只有一个、信息带 `m3-2`、文档与代码同批；设计行在 `cordis.patch.yml` 里仍是 `disabled: true`，`src/design/index.ts` 没动，`apply` 的降级路径没变；没有新增 eslint 压制，新增一处 `@ts-expect-error` 带理由，与 `simulated-human.spec.ts` 已有的写法相同；`scripts/calibrate/run-dir.mjs` 是脚本，没有重复 `src/data/lock.ts` 或 `src/data/project-root.ts` 的功能。

提交说明列出的没写的用例，我认为成立的：`supersedes` 连线的确认用例（引擎不能给已有目标加这条连线）、模拟人同步读图没有 L2（L3 抓到过它）、真跑一次标定（要桌面版和积分，且要等第 9 步开 `release`）。`stale_revision` 重试没有用例，见上。

amend：`DEVELOPMENT.md` §9 写"不强推，不改写已推送的历史"。`a9b8ad5` 在 11-01 07:57Z 被推到 `origin/m3`（`orch` 节点的批注有记录），`3fbc1e9` 改写了它；`git merge-base --is-ancestor origin/m3 HEAD` 退出码 1。没有数据丢失，`a9b8ad5` 还在远端。第 3 步的 S3-1 修复是追加的提交（`5d47374`），本步可以照那样做：`git reset --soft a9b8ad5` 后重新提交同一棵树，历史就是追加的，`origin/m3` 可以快进。第 9 步叠上来之后再改就贵了。

</details>

<details>
<summary>File map</summary>

完整改动用 `git -C c:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\m3 show 3fbc1e9` 看。

- `src/guard/main-agent-graph.ts`：`judgeGraphStage` 与三种候选的判定、`graphCliWrite` 及认命令行的辅助函数
- `src/guard/main-agent.ts`、`main-agent-rules.ts`、`index.ts`：一个监听器里装进两条规矩，三种会话的分支、告警、`who` 标签；两个规则 id；违规记录的 `stageFrom`、`stageTo`
- `src/design/propose.ts`、`record.ts`、`tool-support.ts`：`confirm` 一种、`confirmGate`、`openGoal`、`writeAgreement`、`confirmWrites`
- `scripts/calibrate/run-dir.mjs`（新）、`run-calibrate.mjs`、`simulated-human.mjs`：隔离、拷回、删除、`--collect`、按任务的上限、同步读图
- `scripts/probe/`：`{rev:<id>}` 与 `other:{line, say}`，场景 `glm-design-interview`
- `tests/calibration/interview-expense-log/`：任务、夹具、验收脚本
- `tests/`：`design-graph-rules`、`propose-to-human`、`record-human-answer`、`calibrate-run-dir`、`calibrate-interview-check`、`contracts`、助手文件
- `docs/`：ORCHESTRATION §3.1、§4.8、§6.4、§6.9、§10.5.1，DESIGN、HANDOFF、DEVELOPMENT 各一处
- `package.json`：两个新 spec 进 `npm test`

</details>
