# 主 Agent 的执行边界与 git 快照：附录第 4 步的独立评审

评审日期 2026-10-31。对象是 `.worktrees/m3`（分支 `m3`）上这一步唯一的提交 `bd91f2c`，基于 main 的 `72fa3d6`。我读了全部源码（`src/guard/main-agent.ts`、`main-agent-rules.ts`、`git-snapshot.ts` 全文 1439 行、`rules.ts`、`shell.ts`、`graph-files.ts` 的改动、`src/design/index.ts` 的接线）、测试与探针脚本的改动、五份文档的改动和提交说明，对照附录 0.5 的 §2.1、§2.5、§3.11、§4 第 4 步，`design.md`、`onepage.md`、`design-context.md`、图上 `m3-1` 的验收条件和 `docs/DEVELOPMENT.md` §1.1，并读了 rc.3 的 `dsh-tools` 与各 `dsh-tool-*` 包来核对「没有写文件的办法」。没有重跑套件，采用提交说明记录的结果：build、preflight 退出码 0；test 1031 通过 0 失败 67 个 spec 文件，eslint、knip、jscpd 与基线相等；probe 155/155；我只核对了提交没有碰三份基线文件，也没有新增压制注释。这一步没有更早一轮的评审文件（`review-step4.md` 不存在），所以没有需要逐条核对的旧发现。

## 摘要

这一步新增三条主 Agent 的规矩（`main-agent-no-write`、`main-agent-ask`、`git-snapshot`），由设计行装一个 `prepend` 的 `tools/pre-execute` 监听器：按名调用的写文件工具、写文件的 shell 命令和 `ask_user_question` 被拒；git 不当写文件，会丢工作的命令先存快照，存不了才拒，会把快照推出本机的命令直接拒。快照用 `execFile` 加 `LC_ALL=C` 加 `-z` 列表，流水走 `projectOf`/`ensureIgnored` 落在项目 `.llm/snapshots.jsonl`，临时暂存区在系统临时目录。实现与附录逐条对得上，未提交草稿的处理在提交说明里写得具体（哪些原样保留、哪些重写、哪些补写、备份和 stash 条目在哪），工作树干净，没有半成品。设计行仍是 `disabled: true`，`src/data/project-root.ts` 复用、`src/data/lock.ts` 没有另写一份（流水按附录不加锁）。没有阻塞项。

Watch for：（1）把工具模式切到 PTC 预设时，`run_code` 里的嵌套调用带 `parent`，主 Agent 的监听器与原有 guard 一样直接放行，嵌套的 `write` 与 `pwsh` 写入没人判；文档却写「已实现」且残余清单里没有它（confirmed，代码路径；未在 PTC 预设下运行过）。（2）对外检查只读 git 配置，不读命令行上的 `-c`：`git -c remote.origin.mirror=true push` 不会被拒，快照可以被推出本机（confirmed，读代码）。（3）别名的展开只用来判风险，对外检查与 `clean -x/-ff` 的拒绝只看别名本身（confirmed，读代码）。

**Verdict**: APPROVED

## 高层视图

「主 Agent 有没有写文件的办法」：默认的原生工具模式下没有。工具面在第 3 步去掉了 `write`、`edit`、`ask_user_question` 并把 `str_replace_editor` 收窄成 `view`；本步补上按名调用这一支：`write`、`edit`、`str_replace_editor` 除 `view` 外按原生名判（`Write`、`Edit` 经方言换算），`pwsh`、`bash`、`terminal_send` 的命令文本交给 `file-tools-only` 同一个引号感知的 `shellWriteOf`。监听器带 `prepend`，在 guard 的监听器外层，所以主 Agent 的 shell 写入拿到的是 `main-agent-no-write` 的纠偏（指向派发任务），不是 `file-tools-only` 的「改用 Write 或 Edit」；探针在 GLM 与非 GLM 两条路由上核对了纠偏正文、违规流水和文件确实没有写出。缺口是 PTC 预设（S4-1）和 shell 兜底本来就有的盲区（`python -c`、`cmd /c`、`git` 的 `--output` 一类，附录继承 `shellWrites` 与 `d-main-agent-shell`，不在本步范围）。

「会丢工作的 git 命令」：附录 §2.5 的 `discard` 与 `history` 两张清单在 `exactRisk` 里一项不少，参数里有变量或命令替换时按子命令最坏情形判，未知子命令读一次别名。写出类命令另存挡路的未跟踪文件，`clean` 的列表自己算再用 `clean -n` 核对一次，被忽略的文件不存且挡路时拒绝，`worktree remove` 只记被忽略文件的路径、个数和大小。快照任何一步失败、超时、超限都拒绝（fail closed），只有找不到 git 放行并降级行健康。真实 git 的 L2 共 53 例覆盖这些路径。对外检查缺两处输入（S4-2、S4-3），其余的 `--mirror`、`--tags`、快照引用做源、通配、对象 id、`remote.<名>.mirror` 与 `remote.<名>.push`、变量遮住的远端与 refspec 都拒绝，且 `refs/hourness/snapshots/<id>/remote/*` 放行。

「高峰期有没有东西拦着主 Agent」：没有。新代码里没有任何高峰相关的读取，唯一的等待是快照自己的 30 秒期限，只发生在会丢工作的 git 命令上；不相干的调用在问角色之前就放行，shell 调用每次读一次角色投影（不起进程）。

「人的原话是不是真核对过」：这一步不碰。没有改 `src/graph/`、没有 `relay` 或 `record_human_answer`；快照的 notice 来源是 `glm-git-snapshot`，是 `createUserNotice`，满足不了第 6 步的 `isPersonMessage`，里面带的是主 Agent 自己的命令文字，不会被当成人说的话。

<details>
<summary>Issues (7)</summary>

1. **S4-1 PTC 预设下主 Agent 的写入没人判**（MEDIUM，非阻塞，confirmed 代码路径）：`main-agent.ts` 对带 `parent` 的调用一律 `next()`，PTC 模式下 `run_code` 的子调度带 `parent: exec.token`（`dsh-tools` ptc 一节）；rc.3 的 `dsh-web-app` 带 `ptc` 预设。ORCHESTRATION §6.7 的「没做、仍是残余」没有这一项，§6.4 表写「已实现」。启用设计行（第 12 步（b））之前，二选一：残余清单与 §6.4 如实写出，或工具模式为 `ptc` 时行健康降级并让主 Agent 的嵌套写工具调用也过这条规矩。原有 guard 有同样的盲区，不是本步引入。
2. **S4-2 对外检查不读 `-c`**（MEDIUM，非阻塞，confirmed 读代码）：`outboundRefusal` 用不带用户 `-c` 的调用器读 `remote.<名>.mirror` 与 `remote.<名>.push`，而快照自己的 git 调用带 `-c`（`prefixOf`）。`git -c remote.origin.mirror=true push` 与 `git -c remote.origin.push=+refs/*:refs/* push` 通过检查，本地有快照引用时它们会把快照推出去。改：对外检查的配置读取带上 `invocation.configs`（或命令行上有 `-c remote.*`、`-c push.*` 时直接拒绝），补一例 L2。
3. **S4-3 别名展开只判风险，不做对外检查与 clean 拒绝**（LOW，非阻塞，confirmed 读代码）：`guardOne` 先对别名本身做 `outboundRefusal`、`cleanRefusal`，展开后只算风险再存快照。别名 `p = push` 时 `git p --mirror` 不被拒；别名 `clean -fdx` 时被忽略的文件在没有快照的情况下被删。需要有人先定义或已有这样的别名。改：对 `effective`（展开后的调用）再做一次这两项检查。
4. **S4-4 guard 的声明还在叫主 Agent 用 Write/Edit**（LOW，非阻塞，confirmed）：第 3 步评审的第 6 条把「处理 `glm:guard` 里那一行声明」留给第 4 步。本步让纠偏正确了（监听器先于 guard），但组装的「Workspace rules」节仍对主 Agent 写着「Modify files and code only with the dedicated Write/Edit tools」，主 Agent 没有这两个工具；提交说明没提这一半。改：guard 的声明监听器对主 Agent 省掉 `file-tools-only` 那一行，或把它改成不点名工具；第 6 步前处理即可。
5. **S4-5 两类会丢工作的写入不在表里**（NIT，非阻塞，confirmed）：`git checkout-index -f` 会盖掉已跟踪文件里没提交的改动，`git pull --rebase` 改写本地分支，二者不在 `exactRisk` 也不在 SAFE 里（前者落到别名查询、查不到别名就不存快照）。附录的清单也没列。加进表，或写进 §10 残余。
6. **S4-6 第二个 git 运行器**（NIT，非阻塞，confirmed）：`git-snapshot.ts` 的 `execGit` 与 `src/execute/git.ts` 的 `execRunner` 并存，注释给了理由（没有环境参数、要 `GIT_INDEX_FILE`、要标准输入）。M7 绑定 `SnapshotSaver`（E7）时，把环境与输入两个可选参数加进现有运行器，合成一个。
7. **S4-7 要编排方落笔的几件事**（过程，非阻塞）：提交说明的 12 条解释里，第 3 条（有远端副本时快照提交的引用是 `refs/hourness/snapshots/<id>/commit`）需要把附录 §2.5 第 5 步改一行；其余解释（第 1、2、4、5、8、12 条）按「由 agent 定、人可推翻」记进图。`m3` 合并前要在 main 上重新跑一遍门禁：main 已到 `78d3681`（M7 E3 follow-up 改了 `src/execute/git.ts` 与 `gate-lock.ts`，本提交只 `import type` 其中的 `GitResult`，`git merge-tree` 试合并无冲突）。第 3 步评审的两个条件仍然有效：设计行保持 `disabled`，直到第 6 步也在 `m3` 上；持有者记录比投影活得久（S3-1）要在 M5、M7、循环板读 `mainAgentOf` 之前改，本步没有碰。

</details>

<details>
<summary>Details</summary>

### 没有写文件的办法：默认模式成立，PTC 预设不成立

监听器的次序先看调用本身：不是文件写、不是隐藏工具、也不是 shell 调用的，在问角色之前放行；剩下的才调 `isMainAgent`。`isMainAgent` 抛错时放行并降级行健康，这是附录「读角色或判定抛错时放行」要的，快照是唯一 fail-closed 的一条。工具名先经 `toNativeTool`，有无方言服务各有 L2。`DeferredToolCall {name: 'Write'}` 这一例附录点名，提交说明解释了为什么拆成另一种写法：设计宿主没有工具检索，工具检索的运行时没有设计行；改在 `tests/toolsearch.spec.ts` 钉住 `Write` 在 GLM 上是常驻工具、`DeferredToolCall` 拒绝它、记录里没有任何调用。这个替代成立，因为被拒的原因（常驻、不在延迟目录）正是 §2.1 说的那一条；非 GLM 路由没有 `DeferredToolCall`。

`parent` 的放行是缺口所在。DESIGN.md 自己写明带 `parent` 令牌的调用被各监听器视为传输层子调用，先例就是 `run_code`。在默认的原生模式里这没有后果，`run_code` 不在工具面里。dsh-web-app 带一个 `ptc` 预设，选了它，`run_code` 成为唯一直接可调的工具，里面的 `tools.write(...)`、`tools.pwsh(...)` 作为带 `parent` 的子调度经过 `tools/pre-execute`，主 Agent 的监听器与 guard 都放行。本项目没有任何代码或文档提到 PTC，探针也没有在这个预设下跑过，所以我把它定为「代码路径 confirmed、触发条件 likely」。它不挡路：非默认预设，原有 guard 的 `workspace-containment` 与 `file-tools-only` 同样被绕过，写文件在带 git 的检出里可恢复。但 §6.4 写「已实现」而残余清单没有这一项，会让后来的人以为边界是完整的。

其余写入手段我核对到的：rc.3 里写文件或跑命令的工具是 `write`、`edit`、`str_replace_editor`、`pwsh`、`bash`（含 persistent 版，同名）、`terminal_send`；`working_directory` 只改目录，`load_workspace_dependencies` 只读，`ralph`、`workflow`、`subagent` 派出去的是别的 agent。MCP 工具是否能写文件取决于用户配了什么，附录没提；我没有穷尽。

### git 快照：对照 §2.5

识别层：`gitInvocations` 跳过全局选项、跟随字面的 `cd`、`-C`，路径含变量时 `dir` 为 undefined，会丢工作的调用在这时拒绝（`cd-unknown`）。`simpleCommands` 是第 3 步草稿里留下的那一部分，我对照 `shell.ts` 的 `inspect`/`collect` 读过，引号里的文字不是命令、`bash -c`、`pwsh -Command`、`find -exec`、子表达式都进去，L2 有断言，而且断言「读命令不改变什么算写」。

快照层：`stash create` 失败（合并未解决）走临时暂存区的 `W`；写出类的目标树按 §2.5 的规则解析，解析不出时取全部未跟踪、未被忽略的文件；挡路的被忽略文件拒绝并列路径。`clean` 的列表不取自 `clean -n` 的文字，只用它核对，核对失败拒绝。存文件超过 200 MB 或 20,000 个文件拒绝。远端的旧提交用 `fetch --no-tags` 取到 `refs/hourness/snapshots/<id>/remote/<分支>`，取不回拒绝。标签只在旧值会变得只靠 reflog 可达，或已推送而命令要改写它时打，指向树为空的 `K_h`，父提交不含 `S`、`W`、`T`。流水落点符合 R5-M1：`projectOf(会话目录)` 优先，没有项目时取被快照仓库的并写 `rootFrom: 'repo'`，两处都没有就不建 `.llm/`；`.llm/.gitignore` 的 `*` 与 `ensureIgnored` 两样都做，`git clean -fd` 后流水还在有 L2。

对外检查是这一步最要紧的部分，读完后只有两处输入没覆盖：用户的 `-c`（S4-2）和别名展开（S4-3）。两处都需要一个不寻常的调用形式，但 `-c` 恰好是 `gitInvocations` 自己解析、快照自己带上的，对外检查漏掉它是个不一致，修起来是一行。

提交说明第 2 条解释（push 的远端或 refspec 藏在变量后面时拒绝，代码 `unreadable`）是合理的 fail-closed：对外检查读不到要推什么就不能保证它没推快照；代价是模型写 `git push origin $b` 会被拒并被告知把名字写出来。第 8 条（不做快进测试，只要 `refs/remotes/*` 里有就打标签）偏保守，多打标签不丢东西。

### 附录点名的 L2、L3 用例

L2 的新用例按提交说明是 65 个（`design-guard` 12、`git-snapshot` 11、`git-snapshot-history` 15、`git-snapshot-files` 27，另有 contracts +2、guard-shell +1、toolsearch +1），覆盖附录 §4 第 4 步的清单，真实 git 在系统临时目录里。提交说明列了五处偏离，我逐条看了：文件名里的 `*` 在 Windows 上建不出来（改用带 `[x]`、空格、括号的名字，非 Windows 才跑 `*`）；`DeferredToolCall` 一例换了写法（上面）；`LANG`/`LC_ALL` 变体只在五个写出类用例上跑（每次快照调用本来就强制 `LC_ALL=C`）；L3 的序号顺延到请求 7–13 以保住第 3 步检查的请求下标；git 2.25 以前只测「第一次 add 回 129」（本机 git 2.55）。都有道理，都不损失覆盖的要点。没有写的：`-c` 与别名展开的对外检查（S4-2、S4-3）、PTC 预设（S4-1）。

L3 在 `glm-design-main` 与 `non-glm-design-main` 加了 `/wish off` 之后再 `/wish`、按名 `Write`、shell 写入、`git status`（无快照无 notice）、`git checkout -- README.md`（引用、流水行、下一步的 notice、快照里有被丢的那一行）、`ask_user_question`（`main-agent-ask` 的纠偏、`Exception: none`）、`/wish off`，6 项新检查，违规流水的 `rule` 序列被精确断言为 `main-agent-no-write,main-agent-no-write,main-agent-ask`。

### 合同表与规则登记

`MAIN_AGENT_RULES` 三行的 id、标题（不超过 40 码点、`plainWordsIn` 为空）、`enforcement`、`subjects`、`step` 与 §3.11 的表一致，文件只有常量。规则板 R1 的 `src/rules/builtin.ts` 在 `72fa3d6` 与现在的 main 上都不存在（`src/rules/` 下只有 engine、index、model、peak、permissions、repo、row-health、store），所以映射没有加是对的；R1 先合入时再加。`tests/contracts.spec.ts` 的两个用例满足附录要求（id 唯一、每个 id 都被触发、`step` 不超过已合入步），`git-snapshot` 的触发用 `git clean -fdx`，走的是拒绝一支。

### 文档

ORCHESTRATION 新增 §6.7、改 §3.1 与 §6.4，DESIGN 的工具名表一行，HANDOFF 的 design 行，DEVELOPMENT 的探针段，与代码同一批提交。§6.7 的正文与代码一致，也如实写了「带 `parent` 的传输层子调用一律不判」，缺的只是 S4-1 的后果和 S4-5 的两个命令。HANDOFF 的 design 行写「独立评审在本提交之后」，这次评审通过后由编排方记在图上，不必再改文件。

</details>

<details>
<summary>File map</summary>

完整 diff：`git -C .worktrees/m3 show bd91f2c`。

- `src/guard/main-agent.ts`（新）：`tools/pre-execute` 监听器，三条规矩，违规流水，角色读失败放行
- `src/guard/main-agent-rules.ts`（新）：`MAIN_AGENT_RULES` 三行常量
- `src/guard/git-snapshot.ts`（新，1439 行）：识别、风险表、对外检查、`takeSnapshot`、流水、`guardGit`
- `src/guard/rules.ts`、`graph-files.ts`：`fileWriteTarget`、`shellWriteOf`、`isFileWrite` 导出，图文件门禁改用同一个函数
- `src/guard/shell.ts`：`simpleCommands`、`commandName` 导出
- `src/design/index.ts`：`on` 加 `tools/pre-execute`，装规则、接角色、流水、行健康与 notice
- `tests/design-guard.spec.ts`、`git-snapshot.spec.ts`、`git-snapshot-history.spec.ts`、`git-snapshot-files.spec.ts`、`git-fixture.ts`：新 L2 与共用夹具
- `tests/contracts.spec.ts`、`guard-shell.spec.ts`、`toolsearch.spec.ts`、`design-host.ts`：规则表契约、`simpleCommands`、`DeferredToolCall` 到不了 `Write`、假宿主的 `tools/pre-execute`
- `scripts/probe/run-probe.mjs`：`glm-design-main`、`non-glm-design-main` 的后半段与 6 项检查
- `package.json`：四个新 spec 进 `npm test`
- `docs/ORCHESTRATION.md`、`DESIGN.md`、`HANDOFF.md`、`DEVELOPMENT.md`：§6.7 与相关各行

</details>
