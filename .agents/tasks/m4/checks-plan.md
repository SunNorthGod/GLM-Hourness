# M4 剩余部分的实施计划：m4-checks（E3 起）与 m4-rules 的余项

工作树 `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\m4-checks`，分支 `m4-checks`，起点 `origin/loops-runner` = `8c9d74f`。设计：`.agents/tasks/m4/design.md`（0.6）。进度：`.agents/tasks/m4/impl-progress.md`（较新版本已作为未提交改动带入，随 B1 提交）。

条目号说明：任务说明写「设计 §1.4 的条目号」，§1.4 是「不做」；验收条目在 §1.2 的表里（与图节点 `m4-checks`、`m4-rules` 的 acceptance 同一编号）。下文「checks #n」指 §1.2 `m4-checks` 第 n 条，「rules #n」指 `m4-rules` 第 n 条。

## 0. 现状核对（2026-11-04，实读）

已在树上、不重做：

- m4-gate G1–G4、m4-env E1+E2、m4-suppressions（E4）、m4-cleanup（C1）、R1（第三次返工问人，`src/graph/reopen.ts`、`src/graph/loop-entry.ts`）。
- 循环板执行器（loops-runner Batch 1–3）：`src/loops/script.ts` 的 `runCommand`（`queue: 'direct' | 'check'`）、`resolveProgram`、`commandText`；`src/loops/run.ts` 的接缝 `LoopChecks {commandOf, fill, present}` 与 `ProjectRuntimeDeps.checks?: () => LoopChecks | undefined`（`run.ts:140`、`:156`），`runWorkEntry` 的检查分支在 seam 为 `undefined` 时判 `refused`/`check-missing`（`run.ts:752-756`）；`src/loops/index.ts` 的 `runtimeOf` 调 `createProjectRuntime` 时还没有传 `checks`（`index.ts:298`）。
- `src/loops/trigger.ts` 的 `matchesFilter(filter, payload, project)`（`:614`）、`EventFilter`/`FilterTest`（`paths`）；`src/loops/registry.ts` 的 `validateContribution`（`:222`，`entries` 可为空表）；`src/loops/service.ts` 的 `contribute`/`emit`/`listens`/`recordRun`。
- `src/shared/deferred-call.ts` 的 `unwrapDeferredCall`（G2 建）；`src/shared/step-notice.ts` 的 `installStepNotice`、`toolCallArguments`、`toolCallOutcomes`；`src/shared/dialect.ts` 的 `toNativeTool`；`src/data/project-root.ts` 的 `checkoutRootOf`（G3 建）；`src/data/git-process.ts` 的 git 包装（晨报的 `runGit`）。

m4-rules：rules #1（三条规则，G3）、#2（R1）、#3（§6.4 表的「在哪实现 / 状态」两列，G3 与 R1 已逐行写）都在树上。余项只有一件，来自节点 `m4-rules` 2026-11-02T20:39Z 的批注（m4-gate 评审 pass1 的 MINOR）：`src/rules/index.ts:256` 仍经 `rowJournal(name, () => dataHomes(ctx, config.home))` 写流水，规则板的记录落不进会话所在项目的流水，晨报读不到；设计 §3.2（`0.6-finish2` :376、:538）原文要求它走 `projectJournal`。origin/main 上同样如此。

m4-checks（E3）：`src/env/` 里只有 `branch.ts`（只读 `config` 行）、`notice.ts`（检查一行固定为 `NO_CHECKS_LINE`）、`suppressions.ts`、`index.ts`；env 行不注册工具、不提供服务、不交循环板。§2.2 E3 一行的构件全部未建。

origin/main（`45ae4e8`）还不含 `8c9d74f`（`merge-base --is-ancestor` 退出码 1）；main 自分叉以来的改动只有 docs/graph 与 `docs/DEVELOPMENT.md` 两行，代码无冲突面。

## 1. 共同做法（每批都照做）

- **合并与推送闸门**：任何一次 `git push origin m4-checks` 之前，`git merge-base --is-ancestor 8c9d74f origin/main` 必须为 0；成立后立刻 `git merge origin/main`、跑一遍全量门禁、把结果记进 `.llm/m4c/status.json`（`mainMerged`、`mainMergeCommit`），之后才推。合并前可以本地逐批提交、不推。main 那边合并 loops-runner 时若改过 `src/loops/`（L4 修补），合并后 B2、B4 的接线由全量门禁复核。
- **门禁四道**（日志 `.llm\logs\m4c-B<n>-<道>.log`，退出码在 `cmd /c "... > log 2>&1"` 之后取 `$LASTEXITCODE`）：`npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`。四道退出码 0；`npm test` 日志里的棘轮 eslint suppressed ≤ 76、knip ≤ 19、jscpd ≤ 1。
- **探针锁**：跑探针前 `New-Item -ItemType Directory C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\probe-lock`，失败试 `...\.llm\probe-lock-2`，都在就每 60 秒重试；建于 45 分钟以前的锁目录视为残留可删；跑完删自己取的那个；探针运行中不重建本检出。
- **计时抖动**：机器负载高时的纯计时失败，先单独重跑那个 spec 3 次再归因。
- **新 spec** 一律登记进根 `package.json` 的 `test:1` 或 `test:2`（knip 以这两条脚本为入口）。
- **行**：env 行在 B1–B5 保持 `disabled: true`；探针场景经覆盖层启用它。B6 才改出厂状态。
- 一批一个提交，提交信息带节点 id（`m4-rules` / `m4-checks`），文档与代码同一提交；不碰 `docs/graph`、`~/.dsh`、主检出（除探针锁）、`.worktrees/m4`。

## 2. 批次

- [x] 1. **B1（m4-rules 余项）规则板的流水按项目写**
      范围：规则板门（`installRulesGate`）的流水改用 `projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd))`，记录写进调用会话所在项目的 `.llm/audit/violations.jsonl`（行配置 `home` 仍优先，没有项目时退回数据行的 `projectHome`）。`GateDeps.journal` 的签名改为 `violation(record, cwd)`，`note()` 与跟进的 `hookJournal` 闭包传会话的 `header.cwd`。不加 `flush` 调用（与改动前行为一致）。
      文件：`src/rules/gate.ts`（`GateDeps.journal`、`note()`、`tools/pre-execute` 监听器里的 `hookJournal`）；`src/rules/index.ts`（`:256`，删掉不再用的 `rowJournal`、`dataHomes` 导入）；`tests/rules-gate.spec.ts`（新增一例：两个临时 git 仓库里的会话各被一条规则拦一次，各自的 `<仓库>/.llm/audit/violations.jsonl` 恰有自己那条，数据行的 `projectHome` 下没有）；`docs/ORCHESTRATION.md` §18 的「违规流水」一句（约 :1514，「行配置 `home`，否则数据目录服务的 `projectHome`」改成 `projectHomeFor` 的三级次序）；随本提交带上 `.agents/tasks/m4/impl-progress.md` 的较新改动与本文件。
      验收：rules #1–#3 已在树上；本批关掉节点批注点名的余项（设计 §3.2 规则板记录按项目落盘）。
      L2：上面一例；`tests/rules-row.spec.ts`、`tests/rules-gate.spec.ts`、`tests/rules-tickets.spec.ts` 原有用例照过（fixture 的 `DATA_SERVICE.projectHome` 与会话 cwd 的项目 `.llm` 同一路径）。
      L3：现有规则板场景（`rules-*`、`non-glm-rules`、`loops`）照过；若某条检查从数据行目录读规则板的记录，而会话 cwd 在一个 git 工作区里，把读取路径改成那个工作区的 `.llm/audit/`（这是本批要的行为），检查语义不变。
      依赖：无。开工前先在未改动的树上跑一遍 build、preflight、`npm test` 记下基线测试数（日志 `m4c-B0-*.log`）。
      Verify：四道门禁退出码 0；新例在改动前的父提交上失败（记录落在数据行目录）、改动后通过。

- [ ] 2. **B2（m4-checks）检查行、`glmHournessEnv` 与循环板接缝，`env.files-edited` 事件**
      范围：
      - `src/env/check-entry.ts`（新）：`CheckFormat`（`'eslint-json' | 'tsc' | 'lines'`）、`CheckEntry {name, format, argv, estimateSeconds?, paths?}`（`paths` 为 `undefined` 即不带 `when`）、`splitArgs`、`parseCheckLine`、`checkLineRefusal`（§6.1.1 全部规则：名字正则、格式、`<预计>` `^[1-9][0-9]{0,2}s$`、1–64 项、每项 1–2000 字符、无 NUL 与换行、`{files}` 单独一项且至多一处、`.cmd`/`.bat` 拒、shell 名单 `pwsh powershell cmd sh bash zsh fish dash` 不收 `{files}`、`when` 非空且每个条件过循环板的 `paths` 写法校验）、`SHELL_PROGRAMS`、`COMMAND_LINE_LIMIT = 28_000`、`fillCheckArgv`（§6.1.2 注释的语义）。`when` 条件的写法校验复用 `src/loops/trigger.ts` 里校验筛选 `paths` 的那段：它没导出就加一个导出，不改它的行为，不另写一份。
      - `src/env/parsers.ts`（新）：三种解析器产出 `{file, line, column?, source, rule?, message}`；`formatCheckOutput(format, run)`（至多 20 行、每行至多 200 字符；读不出任何一行且退出码非 0 时 `undefined`）。
      - `src/env/branch.ts`：`EnvTool` 加 `checks: readonly CheckEntry[]`（带不带 `when` 都收）；同一节点名字重复与读不懂的检查行进 `issues`，写法「<节点 id> 第 n 条检查行读不懂：<原因>」（n 与 `config` 行同为验收条件里的序号）。
      - `src/env/env-service.ts`（新）：`ENV_SERVICE = 'glmHournessEnv'`、`CheckCommand`、`EnvService {checkCommandOf}`、`envService(ctx, problem?)`（成员类型不对时报一次、返回 `undefined`，同 `loopsService`）、`EnvServiceContractCheck`、`createEnvService(ctx)`；再导出 `CheckFormat`、`fillCheckArgv`、`formatCheckOutput`（循环板只导入这个文件）。`checkCommandOf` 走 `notice.ts` 同一条读图路径（`graphService(ctx)?.dirFor(cwd)` + `readGraph`），只认 `envBranch` 列出的已批准工具，`title` 为「<工具标题>：<名字>」，`own` = 带 `when`；从不抛错。
      - `src/env/edited.ts`（新）：§6.2 的改动文件推导。会话历史里最近一条 `hourness-checks` notice 记下的工具调用 id 与本行内存里每会话的「已处理到的调用 id」取较晚者，之后这个 agent 助手消息里的文件工具调用块：先 `unwrapDeferredCall`，再 `toNativeTool(dialectService(ctx), name)`，`write`/`edit` 取 `file_path`，`str_replace_editor` 除 `view` 外取 `path`，结果不是错误（`toolCallOutcomes`），按会话 `workingDirectory`/`header.cwd` 解析，只取现在仍存在的文件。按 `checkoutRootOf` 分组，`files` 相对该检出根、正斜杠，至多 200 个，多的丢掉并置 `truncated`。
      - `src/env/loop-entry.ts`（新）：`ENV_ROW_SOURCE = {plugin: 'dsh-hourness', row: 'glm-hourness/env'}`、事件声明 `env.files-edited`（字段 `files` strings 筛选 `paths`、`root` string、`truncated` boolean 筛选 `is`；`personSelectable: true`；字段形状照 `LoopEventDeclaration`/`LoopEventField` 的类型写）、`envContribution()`（本批 `entries: []`）。
      - 交接的通用部分：把 `src/graph/loop-entry.ts` 里的 `handOverLoops`、`reportProblems` 与 `installLoopEntry` 的 inject/agent-created 退路抽成 `src/loops/service.ts` 的 `installContribution(ctx, source, contribution, label, report)`（只加导出，不改已有成员）；图行与 env 行都调它，图行的提示文字与行为不变（`tests/graph-loop-entry.spec.ts` 照过）。这样不新增 jscpd 克隆。
      - `src/env/index.ts`：`ctx.provide(ENV_SERVICE, createEnvService(ctx))`（照 `src/guard/index.ts:414-421` 的做法，dispose 时撤回；宿主没有 `provide` 时行健康写明）；`installContribution`；每个 agent 再装一条步 notice（来源 `hourness-checks`），本批只做：推导改动文件 → `loopsService(ctx)?.listens('env.files-edited', cwd)` 为真才 `emit`（不 await）→ 记内存水位 → 返回 `undefined`。键 `files-edited:<会话>:<turn>-<step>`，同一步多组从第二组起 `-<序号>`；步 notice 拿不到 `turn` 时用 `p<进程启动毫秒>-<本进程本会话第几次>`。
      - `src/loops/index.ts`：导出 `checksSeam(ctx): LoopChecks | undefined`（`envService(ctx)` 为 `undefined` 时 `undefined`；否则 `commandOf` → `checkCommandOf`，`fill` → `fillCheckArgv`，`present` → 格式不在 `CheckFormat` 里时 `undefined`，否则 `formatCheckOutput`）；`runtimeOf` 里给 `createProjectRuntime` 加 `checks: () => checksSeam(ctx)`。`run.ts` 一行不改。
      文件：上列；`tests/env-check-entry.spec.ts`（新）、`tests/env-service.spec.ts`（新）、`tests/env-loop-entry.spec.ts`（新）、`tests/env-edited.spec.ts`（新）；`scripts/probe/probe-env.mjs`（新）、`scripts/probe/run-probe.mjs`（场景 `env-check-command`）；`docs/ORCHESTRATION.md` §7.5（人加的检查经 `glmHournessEnv` 读命令、M4 不执行）；`docs/DESIGN.md` §2.2 行表 env 一行（提供 `glmHournessEnv`、交 `env.files-edited`）。
      验收：checks #6、#7；checks #2 的「命令不经 shell、文件名原样、shell 程序不收文件参数」那一半（`checkLineRefusal`、`fillCheckArgv`）。
      L2：§14.2 检查行一条（`checkLineRefusal` 每条规则各一例、`splitArgs` 引号与「什么都不解释」、`fillCheckArgv` 的 `./-x`、换行跳过、28,000 截断与计数）；§6.6 的示范行 `check ruff lines 3s $ ruff check --output-format concise {files} when *.py` 过 `checkLineRefusal` 与 `splitArgs`；F17：`checkCommandOf` 对多条未指名、未批准、读不懂、节点不在各 `undefined`，带 `when` 的 `own` 为真、不带的为假，`estimateSeconds` 照读，人在引擎里改了命令之后读出的 `argv` 随之变；三种解析器与 `formatCheckOutput`；`checksSeam` 在 env 服务不在时为 `undefined`（循环板据此 `check-missing`）、在时读出节点上的命令；静态检查：`src/env/` 下没有 `node:child_process`，也没有读 `docs/loops/` 的代码；N40：工作树里改 `src/a.ts` 时 `files` 为 `src/a.ts`、`root` 为工作树根，筛选 `src/` 的 `matchesFilter` 为真；两检出各一事件、键不撞；`listens` 为假或服务不在时不 `emit`；`unwrapDeferredCall` 包着的 `Write` 也算；`envContribution()` 交给 `validateContribution` 全收、无 `dropped`；`EnvServiceContractCheck` 编译期钉住。
      L3：新场景 `env-check-command`（`deepseek-probe`，env 行与图行经覆盖层启用，循环行钉 `disabled: true`，覆盖层挂 `probe-env.mjs`）：`probe-env.mjs` 提供最小的 `glmHournessLoops`（`listens` 恒真，把 `contribute`/`emit`/`recordRun` 记进场景目录的 JSON）并注册探针工具 `probe_check_command {tool, check?}`（返回 `envService(ctx).checkCommandOf(cwd, …)` 的 JSON）。图副本：`env` 下一个已批准工具节点，验收条件含不带 `when` 的 `` `check lint lines $ node lint.mjs {files}` ``。脚本：`probe_check_command` → `write` 一个 `a.txt` → `write` 一个 `-c.txt` → done。检查：读出的 `argv` 与节点一致、`own` 为假；`contribute` 收到 `env.files-edited` 的声明；每个有改动的步一条 `emit`，`files` 相对检出根、键形如 `files-edited:<会话>:<turn>-<step>`；没有 `hourness-checks` 提醒注入。现有场景（含 `env-notice`）照过。
      依赖：B1 之后（只为提交顺序）；代码依赖 loops-runner 的 `run.ts`/`registry.ts`（本分支已有）。**推送依赖 origin/main 含 loops-runner 合并。**
      Verify：四道门禁退出码 0；新 spec 全过；探针含 `env-check-command` 全绿。

- [ ] 3. **B3（m4-checks）人批准工具节点时看到的超时**
      范围：
      - `src/env/timeout.ts`（新）：§6.3.1 常量（`CHECK_TIMEOUT_FACTOR = 3`、`CHECK_RECENT_RUNS = 10`、`CHECK_TIMEOUT_FLOOR_MS = 5_000`、`CHECK_TIMEOUT_CAP_MS = 60_000`、`CHECK_STEP_DEADLINE_MS = 20_000`、`CHECK_TIMEOUT_RAISED_MAX_MS = 600_000`、`CHECK_QUEUE_WAIT_MS = 3 * CHECK_STEP_DEADLINE_MS`）、`checkTimeout({estimateS?, recentMs, factor?, floorMs?, capMs?}) → {limitMs, basis, capped?}`、`timeoutText(estimateS?)`（四种句子，§6.3.1 第 3 条逐字）、`checkKey(tool, name)`（`<节点 id>/<名字>`）、`argvDigest(argv)`（SHA-256 前 8 位）、`EstimateLine` 类型与 `appendTiming(home, line)`（`<home>/env-checks/timing.jsonl` 追加一行）。其余四种行在 B4 加。
      - `src/graph/tools.ts`：`graph_propose`、`graph_edit` 写的节点是 `env` 下的工具节点时，结果加 `timeouts: [{check, text}]`（每条读得懂的检查行一项，`text` = `timeoutText(estimateSeconds)`）；`WRITE_OUTPUT` 加可选 `timeouts`；两个工具的描述各加一句「环境工具节点的结果带 `timeouts`：把每条 `text` 原样放在给人看的方案里、那条检查行旁边」。同时为每条带预计、且是新写或改过的检查行（propose：全部；edit：新验收条件里有、旧验收条件里没有同一整行的）交一条 `EstimateLine`（`actor`、`historyAt` 抄引擎刚写的那条历史，`session` 取调用方会话 id，`node` 为节点 id）。`graphTools` 加第 4 个可选参数 `estimates?: (line: EstimateLine, cwd: string | undefined) => void`，`src/graph/index.ts:135` 传一个写到 `projectHomeFor(ctx, undefined, cwd)` 下的实现（与 env 行读 `timing.jsonl` 的目录同一取法，见差异 2）；写失败只进图行的行健康，不影响工具结果。
      文件：上列；`tests/env-timeout.spec.ts`（新）；`scripts/probe/run-probe.mjs`（场景 `env-checks-timeout` 第一段）；`docs/ORCHESTRATION.md` §7.5（批准时看到超时一句）。
      验收：checks #8 的「批准时每条检查行旁边一句超时、写明从哪个估计算出、没有估计写明用上限」与「第一次的超时按估计」。
      L2：§14.2 决定三的 ①（预计 1 秒得 5 秒、3 秒得 9 秒、25 秒得 60 秒并 `capped: {wantedMs: 75000}`、无预计无实测得 60 秒、实测最慢 24 秒得 60 秒）、②（四句逐字、每句 ≤ 40 码点、过 `proposalLineRefusal` 的行长、`plainWordsIn` 为空、数与 `checkTimeout` 一致）、③（env 工具节点的 propose/edit 带 `timeouts`、别的节点不带，各写一条带会话、`actor`、`historyAt` 的 `EstimateLine`）、N12（`text` ≤ 40 码点）。
      L3：场景 `env-checks-timeout` 第一段（`deepseek-probe`，图行启用）：脚本 `graph_propose` 一个 `env` 下的工具节点，验收条件含 `` `check slow lines 1s $ node slow.mjs {files}` when *.txt ``；检查结果的 `timeouts` 是「超时 5 秒（估 1 秒，乘 3 不足 5 秒）」，工作区 `.llm/env-checks/timing.jsonl` 有一条带这个会话的 `estimate`。
      依赖：B2（检查行的解析）。
      Verify：四道门禁退出码 0；探针含新段全绿。

- [ ] 4. **B4（m4-checks）M4 自带的检查器：运行、回传、记录、交给循环板**
      范围：
      - `src/env/timeout.ts`：加 `RunLine`、`ValueLine`、`TimeoutLine`、`QueueLine`；读整份账得每个键（`check` + `argv` 摘要）的近况；取值变化时写 `ValueLine`（来源三种：估计——按 §6.3.1「来源」①②③选历史并按 `node`+`historyAt` 找 `EstimateLine` 带上 `session`，找不到不写 `session`；harness 调整——依据的运行、倍数、下限；上限）；超时那次按当时上限记 `censored` 的 `RunLine`；命令改过从预计重来；env 行激活时整理（每键留 10 条 run、20 条 value/timeout/queue、5 条 estimate；临时文件加改名，失败不整理）。账读不出按没有实测、行健康写明。
      - `src/env/runner.ts`（新）：`CHECK_SLOTS = 2`、`CHECK_FAILURE_LIMIT = 3`、`MISSING_CHECK_NOTICES = 1`；全进程名额队列；每次运行 `runCommand({queue: 'direct', project, cwd: 检出根, argv: fillCheckArgv(...).argv, timeoutMs, maxOutputBytes: 1_048_576, logFile})`（`runCommand` 作为依赖注入，测试可换假执行器）；日志 `<home>/env-checks/<会话 id 前 8 位>/<时间>-<工具 id>-<名字>.log`（执行器写参数表与程序路径为首行）；一步等待 = min(这一步最大超时, 20 秒)，没跑完的在后台续跑、结果按会话留内存下一步送；同一项还在跑时不起第二个；大小、修改时间与节点 `rev` 都没变不重跑；跑不起来或输出读不懂连续 3 次后本会话不再跑（超时不计）；排队 `CHECK_QUEUE_WAIT_MS` 仍没开始的不起进程、写 `QueueLine`；激活时删 7 天前、名为 8 位十六进制的会话目录。
      - `src/env/changed-lines.ts`（新）：经 `src/data/git-process.ts` 跑 `git -C <根> diff -U0 --no-color HEAD -- <文件>`（5 秒）取新侧行号，未跟踪文件整个算改动，不在 git 里时按 §6.4 的退路。
      - `src/env/check-notice.ts`（新）：§6.5 全部写法（发现至多 5 条、改动行在前、每条 ≤ 200、整条 ≤ 1200；全 0 且上一条也全 0 不注入；did not run / did not finish（§6.3.1 逐字，已在上限时末句为 `It is at its ceiling of 60 s; the main agent has been told.`）/ has not started / dropped / skipped；`source.checks` 记最后一个调用 id 与各检查键的计数）；§6.6 的没有检查覆盖一行（主 Agent 与子 agent 两种，每会话每扩展名一次；循环板不在时 `No checks run in this project: the loop board is not enabled.` 每会话一次）。
      - `src/env/index.ts`：B2 的 `hourness-checks` 步 notice 接上：对每组改动文件按 `matchesFilter({files: {paths}}, {files}, project)` 选检查行，循环板服务不在时不跑、行健康写「循环板不在：改完文件不跑检查」；检查行读不懂进行健康（不提醒模型）。
      - `src/env/notice.ts`：检查一行按 §7.2（`Checks run after each edit (listed on the loop board): <名字> on <条件>; …`，≤ 300 字符；没有带 `when` 的行写 `NO_CHECKS_LINE`；循环板不在写 `No checks run after edits: the loop board is not enabled.`）；检查行或节点 `rev` 变了算环境变化。
      - `src/env/loop-entry.ts`：`envContribution()` 加条目 `env.checks-after-edit`（§6.8 表逐字的 `title`/`why`/`when`/`action`，`ownRules` 五行由常量拼出，`details(entry, project)` 同步读本行内存快照：每条带 `when` 的检查两行，至多 10 个检查、20 行、每行 160 码点）；每次把结果交给 agent（含后台送到的）按 §6.8 调一次 `recordRun`（`outcome` 四种，超时 `reason` 为 `<名字>: timeout <上限>s/<实际>s`，排队丢弃 `<名字>: queue 60s`）。
      - 晨报：`src/memory/audit.ts` 的 `AuditPaths` 加 `timing`（`<projectHome>/env-checks/timing.jsonl`，同 E4 加 `suppressions` 的做法）；`src/workflow/morning-report.ts` 加「检查的超时」一节（每个检查一行：当前值与来源、近 7 天超时次数与最近一次、排队没跑次数、被上限截住写明；估计的写谁估、会话未记写明）。
      文件：上列；`tests/env-checks.spec.ts`（新，真实子进程经执行器跑临时目录里的夹具程序）、`tests/env-timeout.spec.ts`、`tests/env-loop-entry.spec.ts`、`tests/env-notice.spec.ts`、`tests/workflow.spec.ts`；`scripts/probe/probe-env.mjs`、`scripts/probe/run-probe.mjs`（场景 `env-checks`、`env-checks-timeout` 第二段）；`docs/ORCHESTRATION.md` §7.5（实现：谁跑、何时、回传、超时、循环板页）、§7.7（本仓库的两个工具节点由编排方按设计 §18 第 4 条提议，批准后生效）；`docs/DESIGN.md` §2.2 行表、§7 降级表（循环板不在、检查跑不起来）。
      验收：checks #1、#2（运行一半）、#3（名额 2、排队提醒、排队丢弃；调高上限占 1 个名额的那条在 B5）、#4、#5、#8 的实测取值、超时计入、记录与晨报（调高与上限提醒在 B5）。
      L2：§14.2 宿主侧 env 一句（改动文件推导、GLM 别名与 `DeferredToolCall`、等待上限、后台结果、连续失败）；真实子进程：文件名含 `$(echo pwned > x)`、反引号、`%PATH%` 原样到夹具的 `process.argv`、不产生 `x`，`-x.ts` 到手里是 `./-x.ts`；超时用睡 120 秒的夹具；N17 的 ①②④⑤（假执行器占满名额）；N37；决定三的 timing 五种行中四种、`value` 来源三种、坏行与读不出、命令改过；④（propose 来源 `actor: llm`、人改 `<预计>` 后来源为那条 `edit`、`actor: human`、没有 `EstimateLine` 时 `session` 缺省）；⑤ 的子 agent 超时提醒不含「问人」；F11（`ownRules` 恰五行、每行等于常量拼出的句子、≤ 80 码点；`validateContribution` 全收；`contribute` 返回 `ok: false` 时行健康写明、检查照常；`recordRun` 每次送出一次）；晨报「检查的超时」一节。
      L3：场景 `env-checks`（§14.1 该行，去掉 B2 已做的不带 `when` 一段）：`probe-env.mjs` 的假循环板；图副本里已批准节点的检查行 `` `check lint lines $ node lint.mjs {files}` when *.txt ``；依次 `write` 含 `TODO` 的 `a.txt`、`edit` 去掉、走一步不写、再 `write` `b$(echo x).txt` 与 `-c.txt`；检查第二个请求末尾的检查结果 notice（1 finding、`a.txt:1`、`[changed]`、日志路径存在）、第三个请求一行全 0、第四个没有、`lint.mjs` 收到原样的 `b$(echo x).txt` 与 `./-c.txt`、没有产生 `x`、`contribute` 带 `env.checks-after-edit` 且 `ownRules` 五行、每次送出一条 `recordRun`。场景 `env-checks-timeout` 第二段：图副本里预置一个已批准的工具节点（做法同 `env-notice` 的播种与批准），检查行与 B3 段相同，改一个 `.txt` 两次，`slow.mjs` 睡 7 秒；第一次提醒 `did not finish: stopped after 5.x s (limit 5 s …)` 与下一次的 15 秒，第二次跑完；`timing.jsonl` 依次有 `estimate`、来源为估计的 `value`（`session`、`actor` 对得上）、`timeout`、`censored` 的 `run`、harness 调整的 15 秒 `value`、7000 左右的 `run`。
      依赖：B2、B3。代码依赖 loops-runner 的 `runCommand`。**推送依赖 origin/main 含 loops-runner 合并。**
      Verify：四道门禁退出码 0；探针含 `env-checks`、`env-checks-timeout` 全绿。

- [ ] 5. **B5（m4-checks）上限被截住时只告诉主 Agent，`check_limit` 调高与撤回**
      范围：
      - `src/env/limit-tool.ts`（新）：工具 `check_limit`（§6.3.1 参数表、五步检查顺序与错误码、`noop`、成功返回 `{outcome, check, capS, previousCapS, message}`、描述逐字、`CHECK_LIMIT_EXAMPLE` 常量生成描述里的例子）；`limits.jsonl` 读（每项最后一行为准，坏行跳过并计数，读不出按没有设置）与追加。
      - `src/env/timeout.ts`：`checkTimeout` 的 `capMs` 取设置；`ValueLine.cap` 记 `{by: 'setting', …}`；`not_held` 的判定按 §6.3.1 第 4 条（只数晚于这一项 `limits.jsonl` 最后一行的记录）。
      - `src/env/runner.ts`：`CHECK_RAISED_SLOTS = 1`（生效上限高于 `CHECK_TIMEOUT_CAP_MS` 的检查合起来至多占 1 个名额，被跳过的留在原位）。
      - `src/env/notice.ts`：根 agent（会话头不带 `origin: 'subagent'`）的环境提醒加「held at its ceiling」行（§6.3.1 第 6 条逐字，来自估计与来自实测两种，键为完整 `<节点 id>/<名字>`），只在状态变化时重注入；子 agent 不收。
      - `src/env/loop-entry.ts` 的 `details` 与晨报「检查的超时」：上限被调高的一句取 `limits.jsonl` 这一项最后一行（`raise` 才写），不读 `ValueLine.cap`；晨报那句逐字「上限已由主 Agent 调高到 <capS> 秒 · <日期>：<理由>；要改回，跟主 Agent 说」。`AuditPaths` 加 `limits`。
      - 注册：`src/env/index.ts` 注册 `check_limit`，`export const inject = ['tools']`；`packages/hourness/cordis.patch.yml` env 行加 `inject: [tools]`（G3 的教训：行不声明就整行激活失败）；`src/shared/tool-names.ts` 加 `ENV_TOOL_NAMES = ['check_limit']`（不进 `ORCHESTRATION_RESIDENT_TOOLS`）；`tests/contracts.spec.ts` 把名字钉到注册上。
      文件：上列；`tests/env-limit.spec.ts`（新）、`tests/env-timeout.spec.ts`、`tests/env-notice.spec.ts`、`tests/env-loop-entry.spec.ts`、`tests/workflow.spec.ts`、`tests/contracts.spec.ts`；`scripts/probe/run-probe.mjs`（`env-checks-timeout` 第三段）；`docs/ORCHESTRATION.md` §7.5（调高上限一段）。
      验收：checks #3 的调高上限占 1 个名额；checks #8 的「3 倍超过上限保持上限、只告诉主 Agent、调高不问人与收窄要人批准分开写、调高与撤回立刻看得到」。
      L2：决定三的 ⑥；F12（描述与示范、`ENV_TOOL_NAMES` 与注册一致、不常驻、`reason` 含换词时 `invalid`、`seconds` 不高于现行上限时 `invalid` 且 `hint` 写现行上限、多余字段 `invalid`、无设置 `reset` 为 `noop`）；N9；N10（上限提醒逐字，不含让主 Agent 以为改检查行也不用问人的话）；N16（提醒里引号中的键原样交给 `check_limit` 不得 `unknown_check`，两个节点各有 `lint` 时键不同）；N17 ③（两项上限 600 秒的检查卡住，第二项留在队里、普通检查 60 秒内开始）；P13-01；F20 一条里 `CHECK_LIMIT_EXAMPLE` 过参数检查且 `reason` 的 `plainWordsIn` 为空、不含练习题领域词。
      L3：`env-checks-timeout` 第三段：检查行预计 `25s`（实际很快）：`value` 截在 60 秒并带 `capped: {wantedMs: 75000}`，根 agent 下一步的环境提醒有 held at its ceiling 一行（含 `check "<节点 id>/<名字>"`），经 `probe-dispatch.mjs` 派出的子 agent 的环境提醒没有这一行。
      依赖：B4。**推送依赖 origin/main 含 loops-runner 合并（随 B4）。**
      Verify：四道门禁退出码 0；探针全绿。

- [ ] 6. **B6（m4-checks）env 行出厂启用**
      范围：`packages/hourness/cordis.patch.yml` 的 `glm-hourness/env` 去掉 `disabled: true`，注释改写为：L3 场景 `env-notice`、`env-check-command`、`env-checks`、`env-checks-timeout` 已过，第一次桌面版走查（`docs/DEVELOPMENT.md` §3、设计 §13.4）仍欠（照 loops 行注释的先例）。同步 `docs/DESIGN.md` §2.2 行表与 ORCHESTRATION §7.1 实现注里的出厂状态。
      文件：`packages/hourness/cordis.patch.yml`；受出厂状态影响的测试（行登记、契约、health 的禁用行清单，按 `npm test` 的失败处逐处改期望）；`scripts/probe/run-probe.mjs`（没钉 env 行的场景现在第一个请求多一条环境提醒：只改因这条提醒而变的计数或末尾位置的期望，不改被测语义）；`docs/DESIGN.md`、`docs/ORCHESTRATION.md`。
      验收：AGENTS.md 第 4 条与任务约束「探针过后才启用」。
      L3：全量探针在出厂启用的状态下全绿。
      依赖：B1–B5 都已推送且探针全绿。
      Verify：四道门禁退出码 0；探针全绿。

## 3. 顺延（不在本运行里做）

- **批次 L4 的桌面走查**（设计 §13.4 第 5、6、8、12、13 项与第 7 项里本包的部分）：要人看方案、回「可以」、批准工具节点，归编排方与人排期；B6 的行注释写明欠着。
- **本仓库的 ESLint、TypeScript 两个工具节点**（§6.1.1、§18 第 4 条）：由编排方在图上提议、人批准；不是代码。
- **人加的检查条目经循环板同意路径的整条 L3**：同意路径（`attachable`、`acceptProposal`、`commandDetail`）在循环板尚未建（`src/loops/service.ts` 头注），归循环板的 L3/L4；M4 一侧由 B2 的 `checksSeam` L2 与 `env-check-command` 场景覆盖。
- **检查的指标事件**（§3.11、§6.3.1「E3 另交一条指标事件」）：指标服务名仍是 G2 的占位、服务不在；等 metrics 线合入 main 后由后合入的一方加。
- **M3 侧的 `mustShow` 覆盖环境工具节点的超时句**（§18 第 5 条 `m3`）：M3 的事；B3 只交 `timeouts` 字段与描述里的要求。
- **K1 标定**：等 `ablation` 移出标定运行目录（§13.1），不在本任务。
- **`m4-rules`、`m4-checks` 节点的状态与批注**：记录归编排方（任务约束「不编辑 docs/graph」）。

## 4. 与设计的差异（agent 定，可逆）

1. **E3 拆成五个提交**（B2–B6），设计 §13.1 E3 是一步：每批能独立过全量门禁，单个提交不至于大到评审看不过来。`env-checks` 与 `env-checks-timeout` 两个场景按批分段建（B2 的不带 `when` 一段独立成 `env-check-command`）。
2. **env 行不加 `home`、`fs` 配置项**（§2.2 写「与图行同形」）：现在没有任何调用方需要；env 行与图行写 `timing.jsonl` 都用 `projectHomeFor(ctx, undefined, cwd)`，保证 `EstimateLine` 与 `ValueLine` 在同一份账里。要加时两处一起改。
3. **改动文件的起点加内存水位**：§6.2 只以最近一条 `hourness-checks` notice 为起点，而全 0 时不注入 notice，起点会停在原处，之后每步重复推出同一批文件（`env.files-edited` 换键重发）。本计划取「notice 记下的调用 id」与「本行内存里已处理到的调用 id」中较晚者；进程重启后没有 notice 的那段会重处理一次（重发一次事件、重跑一次检查）。
4. **交接循环板的通用部分抽到 `src/loops/service.ts` 的 `installContribution`**：图行与 env 行共用，避免新增 jscpd 克隆；图行行为与文字不变。
5. **`when` 条件的写法校验复用 `src/loops/trigger.ts`**：可能要给已有校验函数加一个导出，行为不变（设计要求比法用 `matchesFilter`、不另写一份，校验同理）。
6. **`graphTools` 加第 4 个参数交 `EstimateLine`**：设计只说 `src/graph/tools.ts` 写它；实际的写入目录由图行入口给，工具本身不读 env 行的内存。
7. **L3 里命令改一个字之后 `checkCommandOf` 随之变**（§14.1 `env-checks` 末尾）放在 L2：探针里改已批准节点的验收条件要人的原话，探针扮演人走不到；L2 用真实引擎以人的身份改。
8. **晨报「检查的超时」一节的 L3 核对放在 L2**（§14.1 `env-checks-timeout` 末句）：探针读的是 `timing.jsonl` 的行序列，报告的拼法由 `tests/workflow.spec.ts` 钉。
9. **B1 不给规则板门加 `flush`**：与改动前一致，缺口行在下一次写成功时落盘。
10. **B1 的 L3 给规则行一个行 `home`，不改探针的读取路径**：探针的覆盖层（`scripts/sandbox.mjs` 的 `dataRows`）本来就给 guard、graph、loops、design 行配 `home` 指向运行目录，理由是没有场景工作区的会话（cwd 是本检出）按项目取会落进主检出的 `.llm`。规则行默认启用，改成按项目取之后同样会这样，所以把 `rules` 加进同一张表；现有规则板场景照旧从运行目录读记录，检查不改。按会话项目落盘由 L2 的新例覆盖。

## Digest

已核实：工作树 HEAD `8c9d74f`，`npm run build` 退出码 0（上一步，`.llm\logs\m4c-setup-build.log`）。本步没有跑 `npm test` 与探针；B1 开工前先跑基线（`m4c-B0-*.log`）。impl-progress 记录的最近全绿：main 侧 `npm test` 2673 测试 0 败、探针 349/349（m4-rest，`4ee9d11` 起点）；loops-runner Batch 2 的 `tests/loops-run.spec.ts` 23/23。

| 文件 | 要改的块（实读） | 覆盖的测试 |
| --- | --- | --- |
| `src/rules/gate.ts` | `GateDeps.journal: { readonly violation: (record: GuardRecord) => Promise<unknown> }`（:80）；`note(agent, exec, claimed, line)` 里 `void deps.journal.violation(record)`（:129-145）；监听器里 `followup.hookJournal(sessionId, record => { void deps.journal.violation(record).catch(() => {}) })`（:267） | `tests/rules-gate.spec.ts`、`tests/rules-row.spec.ts` |
| `src/rules/index.ts` | `installRulesGate({ …, journal: rowJournal(name, () => dataHomes(ctx, config.home)), … })`（:256），导入 :54-55 | 同上 |
| `src/memory/audit.ts` | `projectJournal(row, homeFor, fs)`（:244）已有，B1 只导入；`AuditPaths`/`auditPaths`（:39-56）B4 加 `timing`、B5 加 `limits` | `tests/workflow.spec.ts` |
| `src/data/project-home.ts` | `projectHomeFor(ctx, configHome, cwd)`：行 `home` → `projectOf(cwd).root/.llm` → 数据行 `projectHome` | 导入，不改 |
| `src/loops/run.ts` | `ProjectRuntimeDeps.checks?: () => LoopChecks \| undefined`（:140）；`export interface LoopChecks { commandOf(cwd, tool, check?) ; fill(argv, files) ; present(format: unknown, run) }`（:155-163）；`LoopCheckCommand {argv, format: unknown, own}`（:144-152）；`runWorkEntry` 检查分支（:750-773） | 不改；`tests/loops-run.spec.ts` |
| `src/loops/index.ts` | `runtimeOf(root)` 里 `createProjectRuntime({ root, store, registry, io, now, delay, pid, boot, ctx, report: say, peak, onPeakEdge, appStamp })`（:298-317）加 `checks` | `tests/env-service.spec.ts`（`checksSeam`）、`tests/loops-row.spec.ts` |
| `src/loops/script.ts` | `CommandRequest {queue: 'check' \| 'direct', project, cwd?, argv, envelope?, timeoutMs?, maxOutputBytes?, logFile?, signal?}`（:116-140）；`runCommand(request): Promise<ScriptResult>`（:578）；`ScriptResult` 四种 `kind`（:109-114）；`OUTPUT_DEFAULT_BYTES = 1_048_576` | 导入；`tests/loops-script.spec.ts` |
| `src/loops/service.ts` | `LoopsService {declaration, contribute, emit, listens(event, cwd), recordRun}`（:113-140）；`loopsService(ctx, problem?)`（:143）；`ListedRun`（:88-96）；`Contribution {events?, entries, actions?, run?, details?}`（:98-107）。B2 新增 `installContribution` | `tests/graph-loop-entry.spec.ts`、`tests/env-loop-entry.spec.ts` |
| `src/loops/trigger.ts` | `matchesFilter(filter: EventFilter \| undefined, payload, project)`（:614）；`EventFilter = Record<string, FilterTest>`，`FilterTest` 含 `{paths}`；`paths` 写法校验所在函数 B2 定位后导出 | `tests/loops-trigger.spec.ts`、`tests/env-check-entry.spec.ts` |
| `src/loops/registry.ts` | `validateContribution(source, contribution, context)`（:222），`entries` 经 `listOf` 允许空表 | `tests/env-loop-entry.spec.ts` |
| `src/graph/loop-entry.ts` | `handOverLoops`、`reportProblems`、`installLoopEntry(ctx: LoopEntryHost, report)`（全文件 ~100 行，inject 优先、否则每次 `agent/created` 重交） | `tests/graph-loop-entry.spec.ts`（10 例） |
| `src/graph/tools.ts` | `WRITE_OUTPUT`（:251-263）；`WRITES` 里 `propose`、`edit` 两条的 `description`（:266-283）；`writeTool(dir, op, description, parameters, report)` 的 `execute`（:407-426，`engine.apply('llm', …)` 之后取 `result.node`）；`graphTools(dir, focuses, report = { loops: undefined })`（:437） | `tests/env-timeout.spec.ts`、既有 graph 工具测试 |
| `src/graph/index.ts` | `const tools = graphTools(dir, focuses, { loops, problem: boardProblem })`（:135）；`installLoopEntry(ctx, boardProblem)`（:165） | 同上 |
| `src/env/index.ts` | `EnvContext extends ServiceLookup, Partial<ProvideHost>`；`installEnvNotice(ctx, agent, health)`；`installWork`；`apply(ctx)` 每个 `agent/created` 装一次（`WeakSet` 去重）；没有 `inject` 导出 | `tests/env-notice.spec.ts`（6）、新 env spec |
| `src/env/branch.ts` | `EnvTool {id, title, usage, configs}`；`parseConfigLine`；`envBranch(graph)` 只列 `approved/doing/done` 的 `env` 下 `tool` 子节点，`proposals` 计数，`issues` | `tests/env-branch.spec.ts`（6） |
| `src/env/notice.ts` | `NO_CHECKS_LINE`、`envNoticeBody(branch)`（检查一行固定 `NO_CHECKS_LINE`）、`bodyForSession`、`envNotice`（digest 变即重注入） | `tests/env-notice.spec.ts` |
| `src/shared/tool-names.ts` | `GUARD_TOOL_NAMES` 的写法与头注（B5 照它加 `ENV_TOOL_NAMES`）；`ORCHESTRATION_RESIDENT_TOOLS` 不动 | `tests/contracts.spec.ts` |
| `src/workflow/morning-report.ts` | `morningReport(input)`（:340，压制一行之后可加检查超时一节）；`reportFromFiles(fs, homes, period, graph, since?, options)`（:444，`auditPaths(homes)` 取路径、`readJsonl`、`inPeriod`） | `tests/workflow.spec.ts` |
| `packages/hourness/cordis.patch.yml` | `glm-hourness/env` 行（:138-152）：`name: dsh-hourness/env`、`disabled: true`、`config: {}`，无 `inject` | `npm run preflight`、`tests/contracts.spec.ts` |
| `docs/ORCHESTRATION.md` | §6.4 表（:868-885，已全）；§7.1（:976）、§7.5（:995-1010）、§7.7（:1019）；§18 规则板「违规流水」一句（约 :1514） | 文档 |
| `scripts/probe/run-probe.mjs` | `env-notice` 场景（:650-680，`initRepo`、图副本播种、`runScenario(name, profile, steps, prompt, overlayRows, ws)`）；`probe-lift.mjs` 的探针工具挂法（:1105-1190）；`SESSIONS_ROW`（:953）；`LOOPS_ROW`（:576） | 探针 |
