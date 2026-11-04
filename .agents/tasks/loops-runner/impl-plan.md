# loops-runner 实施计划

分支 `loops-runner`（worktree `.worktrees/loopsr`，起点 origin/main `adef28e`）。
范围：循环板最后一块未建的部分——脚本与检查的共用执行器、检查条目的执行、`/loops` 列表、循环板页面。
权威：`docs/ORCHESTRATION.md` §18.9（现状与翻转点）、`.agents/tasks/schedules/design.md` 0.6 §6.6（执行器全文）、§6.9 第 1 条（规则板 checkCall）、§6.4 末段（event-session 投递）、§7.2（/loops list）、§8（页面）、`.agents/tasks/m4/design.md` §6.1–§6.5（检查接缝、E3 侧）、`.agents/tasks/m4/impl-progress.md`（E3 等的就是 `src/loops/script.ts` 的 `runCommand`+`resolveProgram`）。

## 批次图

### Batch 1 — 共用执行器 + 采纳过的脚本条目照跑（一个提交）

- 新 `src/loops/script.ts`（design §6.6）：
  - 常量：`WORK_TIMEOUT_MS`（60s）、`WORK_TIMEOUT_MAX_MS`（1_800_000）、`CHECK_CONCURRENT`（2）、输出缺省 1 MiB / 至多 4 MiB。
  - 类型：`HookEnvelope`、`ScriptRequest`（purpose 本版只有 `'work'`，gate 随规则板采纳时再加）、`ScriptResult`（exited / timeout（无 late，work 语义）/ crashed / refused）、`CommandRequest`（queue `'check' | 'direct'`）。
  - `runScript`：核对 `script.file` 字节（≤64 KiB，`too-large`）→ realpath 在项目根下（`outside-project`）→ `scriptSha256` 比对（`script-changed`/`script-missing`）→ 核对过的字节以 `wx` 写私有副本 `.llm/loops/run/<run>.<后缀>` → 按 lang 起 `resolveProgram` 解析出的解释器（pwsh `-NoProfile -NonInteractive -ExecutionPolicy Bypass -File`、node、python、bash），不经 shell → 信封一行进 stdin → `PRIORITY_BELOW_NORMAL` → 超时结束整棵进程树（win32 `taskkill /PID <pid> /T /F`，其余对进程组 SIGKILL）→ 跑完删副本；work 同时一个/每项目每板，排队不算超时。
  - `runCommand`：`direct` 不排队（M4 自带检查器用，envelope 可无，stdin 立即关闭，HOURNESS_* 只给 `HOURNESS_PROJECT_ROOT`）；`check` 每项目至多 `CHECK_CONCURRENT` 个、单独一队、envelope 必有；cwd 经 `fs.realpathSync` 后必须是主检出或 `cachedWorktrees`（60 秒缓存）里的一个根，否则 `refused` `outside-project`；`argv[0]` 先过 `resolveProgram`，解析到 `.cmd`/`.bat` 不起进程、`crashed`（spawn）。
  - `resolveProgram(name, cwd, project, worktrees)`：只在 PATH 的绝对路径目录里找，跳过项目根与各工作树之内的目录与相对目录，不找进程工作目录；Windows 按 PATHEXT 试后缀（名字自带后缀只试它）；名字含 `/` 或 `\` 按 cwd 解析、要求文件在；`needsShell` 标 `.cmd`/`.bat`。不抛错。
  - `scriptSha256`、`commandText`（解释器命令行或 argv 的 Windows 引号规则一行；脚本路径写仓库里那份）。
  - 环境名单（§6.6）：PATH、PATHEXT、SystemRoot、TEMP、TMP、USERPROFILE、HOME、APPDATA、LOCALAPPDATA + `HOURNESS_BOARD/ENTRY/RUN/EVENT/PROJECT_ROOT`（direct 只有最后一个）。输出：stdout/stderr 分开、1 MiB（direct 按请求），多则截断置 `truncated`；`logFile` 第一行 commandText + sha256 + 解析出的程序路径。
- `src/loops/run.ts` 接线（翻转 §18.9 的 refusal）：
  - 采纳防线：`entries()` 本来只放 store 状态 `ok` 的人加条目；缓存读附带状态表，script/check 路径再核对一次，不是 `ok` 就地 `refused`（`unadopted`），不起进程。
  - 跑之前先过规则板 `checkCall({tool:'pwsh', args:{command: commandText(script)}}, {project, signals:{'glm-peak':…}（计价服务在时）, glmSpend})`（design §6.9 第 1 条）：放行/告知/记录→跑；排队→`deferred`，每 5 分钟重判，24 小时 `expired`（state.json 存着，重启后重臂）；拦截→`blocked` 带规则 id；库抛错→照常跑并记 `rules-unavailable`。
  - 结果→结局：exited 0 = 过；非 0 与 crashed = 没过；timeout = `unfinished`（合进来的事件经收件箱退回待跑，下一次触发一起再跑）；`refused` 原样记。
  - 结果交给主 Agent / 事件会话（`report`: always/on-failure（没过之后第一次过也交）/on-change（第一次算变）；`to`: main/event-session，后者已在 `tell()` 有 session 分支）；文字按 §6.6：`` `<commandText>` exit <码>（<用时>）``、超时 `did not finish: timed out after <秒> s`、起不来 `could not start: <原因>`，stdout 末尾至多 40 行/4000 字符，没过接 stderr 末尾，`redactSecrets`（M5 已在：`src/data/secret-shape.ts`），接 `Full output: <日志路径>`。
  - 自触发窗口：脚本在跑或跑完 60 秒内发生的 `loops.file-changed`，对该条目记 `suppressed`/`self-loop`（§6.7 第二种；harness 的一种已由收件箱的 cause 覆盖）。
  - 记录：`loop-done` 增 `exits?: number[]` 与 `outputBytes`（记录不写输出原文）；日志写 `.llm/loops/logs/<entry id>/<时刻>.log`；下一拍清 `.llm/loops/run/` 里超 1 小时的副本。
- 静态检查翻转（tests/loops-run.spec.ts）：`src/loops/` 里只有 `script.ts` 可以碰子进程，其余文件照旧禁（design §13）。
- 测试：新 `tests/loops-script.spec.ts`（执行器 L2，真实子进程：pinning 各 refused、解释器解析、超时杀树、输出上限与截断、日志第一行、环境名单、stdin 信封、work/check/direct 三队、resolveProgram 各分支、commandText 引号）；`tests/loops-run.spec.ts` 的两条 refusal 用例改为执行用例（照跑、script-changed、check-missing 保留），加规则板排队/拦截、self-loop 窗口、unfinished 退回。
- 文档：`docs/ORCHESTRATION.md` §18.9 的 script/check 行改写 + §18 头部状态句。

### Batch 2 — 检查条目走同一执行器（一个提交）

- `run.ts` check 分支：采纳防线同上 → checkCall → 环境接缝（env 行未合入前生产上仍是 `check-missing`，即 E3 落地前行为不变）：
  - 接缝类型 `LoopCheckSeam` 定义在本侧（`src/loops/script.ts` 或 run.ts）：`commandOf(cwd, tool, check?)`（= m4 §6.1.2 `checkCommandOf` 的形状，format 对本侧不透明）、`fill(argv, files)`（= `fillCheckArgv`）、`present(format, run)`（= `formatCheckOutput`）。E3 落 `src/env/env-service.ts` 后由 index.ts 接上，loops 不改。
  - 取不到命令或 argv 与条目不一致 → `refused`（`check-missing`/`check-changed`），页面「要你看一眼的」+ 行健康 degraded 一次。
  - 命令一致：本次运行各事件的 `files` 里合 filter 的并集经 `fill` 填占位 → `runCommand({queue:'check', cwd: 组的 root（无则项目根）, argv, envelope, timeoutMs, logFile})`。
  - 结果结局同脚本；输出经 `present` 读得懂时给发现数与至多 20 行，读不懂按脚本样子给退出码与末尾。
- 测试：假接缝（E3 未落）钉全路径：present 成功/undefined 两路、check-changed、files 并集与 `{files}` 填充、to event-session、report 三种、unfinished 退回、排队的 check 占队。
- 文档：§18.9 check 行、§18 头部。

### Batch 3 — `/loops` 列表 + 循环板页面（一个提交）

- `view.ts` 扩展（纯函数、页面可导入）：每条目带「什么时候 · 做什么 · 谁带来的 · 上次（时刻+结局人话）· 下次」；页头的主 Agent 一行（holderState）；「最近跑过的」至多 20 条（runs.jsonl 末尾 + loop-duplicate/loop-task-delete 的人话行）；结局→人话的映射（§8.5 的词）。`boards.ts` 把 runtime 的 state/记录读进 `buildView`。
- `commands.ts`：`/loops` 不带参数列全部条目（§7.2 欠的那条）：插件与你自己加的分组、每行人话、要改/要删提示；标题不带 id（id 只在删除提示与底账行出现）。`LOOPS_HINT` 与命令描述同步；contracts 钉处核对。
- 页面：`ui/src/loops/`（LoopsPage.tsx + 读 `view.json` 的 source，照 `ui/src/lessons/` 的做法：投影 `hournessLoops` 拿路径、workspaceFiles.readBytes + changes + 15 秒轮询）；`hourness-client.tsx` 注册 `id: 'loops'` 的板（BOARD_ORDER 已有位）。只读；讲细点用 `<details>`。不交 `BoardState.items`（§12 的 loops 条目要 staleEntries/timeoutEntries 服务成员，还没有——DESIGN §2.6 已记）。
- 测试：view 构建用例、/loops list 用例、页面模型（Node 下跑纯函数，lessons-panel-model 的做法）。
- 文档：§18.7（list 已有）、§18 头部（页面已建）。

### Sequenced-later（有理由，不猜）

1. **gate 一路与 late**（design §6.6 的 GATE_* 常量、`ScriptResult.timeout` 的 `late`、`GATE_HARD_CAP_MS` 后台跑）：调用方是规则板的拦路脚本，规则板今天起不了任何进程（`src/rules/check.ts` 头注「the library starts no process」）；随规则板采纳共用执行器时再加。
2. **`scriptDetail` / `commandDetail`**（design §6.6 末两个导出）：提议通道（`loop_propose`、`AttachDetail`、`attachable`/`acceptProposal` 服务成员）的一部分，随那条路一起落，否则是没人导入的死导出（knip）。
3. **`src/loops/clock.ts`**（design §6.2：时间触发的 script/harness 条目由循环行自己的钟跑）：生产上够不到——人的 script/check 条目只能经提议通道加（还没建），`bind.ts` 只绑 tell-main 的时间条目；随提议通道一起或在其之前落。时间触发的 script/check 条目在它落地前不会被创建，现状无缺口。
4. **机器一级的运行者与账号级两个通道事件**（`channel.quota-low`/`login-rejected`）：等 M6 的契约 `src/shared/channel-loop.ts`（§18 尾原文）。
5. **`staleEntries`/`timeoutEntries` 服务成员与周报两张单子、循环板的 hub 条目**（§6.11；DESIGN §2.6 已记 loops 本轮不交 items）：随报告面那批。

## 判读（本侧定的、可逆）

- 日志目录取 `.llm/loops/logs/<entry id>/`：设计写 `<项目目录>/logs/`，按 §9.1「运行时的进 `.llm/`」落，不脏仓库根；保留最近 50 份或 7 天。
- `redactSecrets` 直接用 `src/data/secret-shape.ts`（M5 已合入），设计里的回退 `src/loops/redact.ts` 不建。
- 采纳防线用 `entries()` 的缓存读附带的状态表，不再读一遍盘。
- 未跑完（unfinished）事件的退回：`state.pending` 里该组的 `dueAt` 置为已过，新触发到达时按普通合并走、重臂去抖——「下一次触发时一起再跑」逐字。
- 规则板排队（deferred）的 5 分钟重判定时器随 `state.json` 持久（记录批次与时刻），拍上重臂；24 小时 `expired`。
- `runScript` 的 purpose 本版只收 `'work'`；类型注释写明 gate 随规则板扩。

## 门禁口径

每批：`npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`，退出码原样、重定向 `.llm/logs/loopsr-*.log`；棘轮在本树量（预期 eslint 76 / knip 19 / jscpd 1）不升；合并 main 后立即全量门禁。

## 现状 2026-11-04（暂停后恢复）

### 状态

- 分支 `loops-runner`，worktree `.worktrees/loopsr`。已合并 origin/main 到 `acd2f14`（合并提交 `cc2ab36`，含 `bc25baa` fix(audit)：同一流水文件的追加按发出顺序落盘，`tests/rules-host.ts` 删临时项目带重试）。
- **Batch 1 已推送**：`13ffb58`（src/loops/script.ts 执行器 + run.ts 采纳脚本条目执行 + inbox retry/selfTriggered + 静态检查翻转 + tests/loops-script.spec.ts + loops-run.spec.ts 改写 + ORCHESTRATION §18/§18.2/§18.9）。
- **Batch 2 随本文件同一提交**：src/loops/run.ts（LoopChecks 接缝类型 + check 支路：commandOf → argv 比对 check-changed → filesOf 并集 → fill → runCommand queue:'check' → present 发现块；refused 一律不碰 passing；rerunDeferred 同时接 script 与 check；execute() 的 script/check 分支统一先过 askRules）；tests/loops-run.spec.ts（新增 5 条检查用例：present/files/会话投递、check-changed+check-missing、outside-project、规则排队后放行、默认 check-missing 保留）；docs/ORCHESTRATION.md（§18 头部、§18.9 check 行、§18 尾）。
- **Batch 3 未动**：/loops list 命令 + view.json 扩展（每条目 whenText/actionText/last/next、holder 行、最近 20 次运行、结局人话）+ ui/src/loops/ 页面（照 ui/src/lessons/ 的做法读 view.json）+ hourness-client.tsx 注册 `id: 'loops'` 板。批次图见上文。

### Batch 2 门禁（合并 acd2f14 之后，Batch 2 工作树）

- build exit 0；preflight exit 0；npm test exit 0（148 个 spec，2726 例：2725 过、0 败、1 跳过——contracts 的「writing check 第二阶段」等 src/graph/plain.ts；棘轮 eslint 76 / knip 19 / jscpd 1 持平）；probe exit 0，347/347。
- 暂停前 `npm test` 的唯一红（`tests/rules-tickets.spec.ts`「the whole unload step is bounded by two seconds…」）的判定：不是时限超界。该用例断言卸载 < 3500 ms，每次实测 2067–2096 ms（卸载对外人持有的锁等满 2 秒界再放手，这是设计行为）；失败的是夹具 `withRow` 的 finally 删临时项目时 `rmdir` 报 ENOTEMPTY——卸载放手后流水的追加还在落盘。`bc25baa` 给该删除加了重试（`maxRetries: 10, retryDelay: 20`），已覆盖。单独重跑：合并前 3/3 绿（68/68），合并后 3/3 绿（68/68，无 ENOTEMPTY），合并后整跑 npm test 也绿。rules 行无需改动。
- 注：`npm test` 是 `&&` 串起来的，暂停前那次在 rules-tickets 红了之后 test:2 余下的 spec 没有跑；本次整链跑完。

### 下一步（按顺序）

1. 开工 Batch 3（上文批次图），完成后同样门禁 + 提交推送。
2. 最后把本文件的「Sequenced-later」核对一遍（gate 一路、scriptDetail/commandDetail、clock.ts、机器一级运行者、staleEntries/timeoutEntries）并写最终报告。
