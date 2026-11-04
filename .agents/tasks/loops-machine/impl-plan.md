# loops-machine 实施计划

分支 `loops-machine`（worktree `.worktrees/loops-machine`，起点 origin/loops-runner `8c9d74f`；loops-runner 合入 main 之后快进到 origin/main `77826da`，含 user-graph 与 metrics 的合入）。
范围：loops-runner 计划「Sequenced-later」第 4 条——机器一级的运行者与账号一级的两个通道事件 `channel.quota-low`、`channel.login-rejected`；编排方另加循环板首轮 L4（`.agents/tasks/loops-runner/l4-2026-11-04.md`）不挡路的第 2、3 条，各带测试。该条原写「等 M6 的契约 `src/shared/channel-loop.ts`」；M6 的契约（`ChannelTrigger`、`ChannelLoopDefault`、`loopDefaultsOf`）、`quota` 成员（`QuotaView`、`LoginView`、`quotaLowOf`、`quotaLowLine`、`loginLine`）与 GLM 的四项条目（`src/glm-llm/loop-defaults.ts`，经 `glm-login` 行的计价服务交出）都已在 main，理由已过时。
权威：`docs/ORCHESTRATION.md` §18（§18 头、§18.5、§18.9）；`.agents/tasks/schedules/design.md` 0.6 §2.3（占位与 `escapeForPrompt`）、§3.4（`channelEntries` 与 M6-L1 到 M6-L5）、§4.3（三个通道事件的字段、参数与键）、§6.1（机器一级的运行者、`last-step.json`）、§6.4 末段（账号一级的投递、机器一级的 `held`）、§6.10（`loop-read`）、§9.1（`<userHome>/loops/machine/`）、§1.4 第 23、24 条；`.agents/tasks/m6/design.md` §4.4、§8.4；`src/shared/channel-loop.ts`、`src/shared/quota.ts`、`src/shared/pricing.ts`。

## GLM 包一侧

不改。契约与数据都在 main：计价服务的 `loopDefaults` 交四项（两项 `runBy: 'channel'`，`quota-low`、`login-rejected` 两项 `runBy: 'loop-board'` 带 `tell`），`quota({waitMs, read})` 给读数与登录状态。编排层一侧只经 `loopDefaultsOf`、`quotaOf` 与 `src/shared/quota.ts` 的纯函数读它们，`src/loops/` 不导入 `src/glm-llm/`（静态检查照旧），只有 `channel.ts` 导入 `channel-loop`（静态检查改为这一条）。

## 批次图

### Batch 1：探针的每个场景在自己的 git 仓库里跑（L4 不挡路第 2 条；一个提交，随本文件）

- 事实：探针 24 个场景不给工作目录或给检出本身，另有一批场景目录没有 `git init`。项目根是往上找到的第一个仓库、工作树的项目是主检出的（ORCHESTRATION §18.9，循环板设计 §2.1），所以在工作树里跑探针时这些场景的循环板、规则板与指标流水都落在主检出的 `.llm/`。设计 §9.1 末段要的是「探针与标定的每个场景是新初始化的 git 仓库」，偏的是探针。编排方裁定（选项 A）：改探针一侧，循环行不改。
- `scripts/sandbox.mjs`：`scenarioWorkspace(dir, cwd)`：不给目录或给本检出的，用场景目录 `dir` 本身（场景的临时文件本来就在那里，仍在工作区之内）；给的目录不是仓库就 `initRepo`（提交里面的文件）；已是仓库的照原样用。git 建不起仓库就抛错，不让场景写到运行目录之外。
- `scripts/probe/run-probe.mjs`：`runScenario` 经它取工作目录起运行时，结果多带 `cwd`；「dispatch (b) 子会话头保留父目录」一条改为对着这个目录比（原来对着检出本身）。
- 验收：L2 新 `tests/probe-workspace.spec.ts`（三种目录各一例；静态检查 `runScenario` 用它的结果起运行时、运行时只在 `runScenario` 里起），接进 `test:2`；L3 全量探针全绿，且探针前后主检出 `.llm/loops/` 不变。
- 文档：DEVELOPMENT §3 探针一段加一句、事故表加一行。

### Batch 2：`loops.host-restarted` 的 `downMinutes` 是停了多久（L4 不挡路第 3 条；一个提交）

- 事实：`src/loops/run.ts` 的 `restarted()` 用这一次与上一次「开始跑这个项目」的时刻之差，停了约 1 分钟报 30。设计 §4.1 的字段是「停机的分钟数」，没写算法。
- 改法：`state.json` 的 `host` 多记 `aliveAt`：持锁的每一拍刷新，正常退出时写成退出的时刻；`downMinutes` = 这一次的开始减上一次的 `aliveAt`（旧的 `state.json` 没有它时退回上一次的 `startedAt`，即今天的算法）。崩溃时误差至多一拍（60 秒）。
- 验收：L2 `tests/loops-run.spec.ts`：正常退出 1 分钟后再起报 1；崩溃时按最后一拍算；旧的 `host` 没有 `aliveAt` 时照旧。
- 文档：ORCHESTRATION §18.9 的 `loops.host-restarted` 一句。

### Batch 3：两个账号一级事件的声明、通道条目进登记表、给模型的文字填占位（一个提交）

- `src/loops/channel.ts`：
  - `CHANNEL_EVENTS` 加 `channel.quota-low`（字段 `window`、`usedPercent`、`resetAt`、`line`；必填参数 `usedPercent` 1–100、`exhaustsWithinMinutes` 1–1440、`afterUsageMinutes` 1–1440）与 `channel.login-rejected`（字段 `since`、`path`、`line`），人都不能选；三个都只在计价服务在时进事件表（照旧经 `createRegistry({channel})`）。
  - 键：`quotaLowKey(window, period)` = `quota-low:<window>:<这一期>`，`loginRejectedKey(path, since)` = `login-rejected:<path，空串写 glm>:<since>`。
  - `channelEntries(pricing, problem)`（设计 §3.4 的换法表，唯一一处）：读 `loopDefaultsOf`，`peak-start` → 听 `channel.peak-changed`、`filter: {edge: {in: ['start']}}`、`self`；`command` → 命令触发、`self`；`quota-low` → 听 `channel.quota-low` 带三个参数、`tell-main`（`text` 为 `tell`，`wake: false`）、`scope: 'machine'`；`login-rejected` → 听 `channel.login-rejected`、同上。`self` 的 `does` 为标题、`by` 为 `dsh-glm-zcode`。别的搭配丢掉并报一次。来源 `CHANNEL_SOURCE` = `{plugin: 'dsh-glm-zcode', row: 'glm-hourness/glm-login'}`。
- `src/loops/registry.ts`：`createRegistry` 多一个选项 `channelEntries`，`entries()` 把它给的条目（`validateEntry` 以插件的身份查过、`plainWordsIn` 查过，不合的丢掉并报一次）排在各份交来的之后，状态 `active`。`channel` 这个名字空间仍不经 `contribute`；`contribute` 交来的 `scope: 'machine'` 仍丢掉（只给通道包的两项）。
- `src/loops/model.ts`：`escapeForPrompt` 与 `fillPlaceholders`（设计 §2.3）：`{名字}` 由这次运行第一个事件的载荷的同名字段填；字符串去控制字符、换行写成 `\n`、双引号与反斜杠前加反斜杠、至多 200 个码点（先截再转义，多的写 `…`）；字符串列表逐项如此、以 `, ` 连、至多 20 项（多的写 `and N more`）；数与布尔原样；载荷里没有的字段填空串。
- `src/loops/run.ts`：`tell-main.text` 与 `harness.tell.text` 投递之前经 `fillPlaceholders`；行交来的 `result.tell` 是那一行自己的话，不填。
- `src/loops/index.ts`：登记表接 `channelEntries`（计价服务在时）。
- 验收（L2）：`tests/loops-registry.spec.ts`（三个通道事件的声明；`channelEntries` 的四种 `when` 与两种 `runBy`、不合的搭配丢掉；登记表列出通道条目、计价服务不在时不列；静态检查改为只有 `channel.ts` 导入 `channel-loop`）、`tests/loops-model.spec.ts`（`escapeForPrompt`、`fillPlaceholders`）、`tests/loops-run.spec.ts`（一条 `channel.quota-low` 进项目收件箱，`glm:quota-low` 恰好投一次，`{line}` 填好且转义）。
- 文档：ORCHESTRATION §18 头、§18.3（占位的填法）、§18.4（通道条目）、§18.5（通道事件）。
- 同批顺手修的测试竞态：`tests/loops-run.spec.ts`「a run that did not finish hands its events back」在看到内存里的 `loop-done` 之后立刻读 `state.json`，而运行状态是记录之后才异步存的；改前在没有本批改动的树上单独跑 5 次败 2 次，改后等存好再读。

### Batch 4：机器一级的运行者（一个提交）

- 新 `src/loops/machine.ts`：`<userHome>/loops/machine/` 下 `runner.lock`（共用 `lock.ts` 的 `createRunLock`，写法同项目锁；`RunLockDeps.paths` 改为只要 `runner`、`handover` 两项；机器锁不交接，`holderHere` 恒为空）、`state.json`（上一次的登录状态、这次被拒的 `loginRejectedSince` 与 `loginRejectedPath`、用量流水读到的字节位置、上一次读额度的时刻、机器一级的 `held`）、`told.json`（已说过的事：条目 id、事件、键、额度的窗口与重置时刻）。只在计价服务在、有 `quota` 成员、且登记表里有 `scope: 'machine'` 的生效条目时去抢锁；否则放手。
  - 每一拍：先把机器一级 `held` 里的事件再交一次（满 24 小时作废、报 info）；有听 `channel.login-rejected` 的条目时调一次 `quota({waitMs: 0, read: false})`：由别的状态变成 `rejected` 时产生一个事件；第一次看到这次被拒的那一拍定下 `since`（`LoginView.since`，没有时取那一拍）与 `path`，记在 `state.json` 的 `loginRejectedSince`、`loginRejectedPath`，一直是 `rejected` 时键与载荷都用它们（通道在请求一直被拒时每 10 分钟记一条更新的被拒记录，`LoginView.since` 随之后移，评审 F1）；键已在 `told.json` 里的不再交；回到 `ok` 时清掉已说记录里的登录一件，离开 `rejected` 时清掉这两个值；有听 `channel.quota-low` 的条目时读用量流水（`<userHome>/audit/usage.jsonl`）新增的行，见到 `isGlmModel(model)` 的记录、`quota({read: false}).reading.at` 与上一次由这里发起的读取都已满 `afterUsageMinutes` 分钟（没有算满）时恰好调一次 `quota({waitMs: 3000})`，按条目参数调 `quotaLowOf`，命中且「窗口名 + 重置时刻（相差 120 秒内算同一期）」不在 `told.json` 里时产生事件，载荷 `{window, usedPercent?, resetAt?, line}`；每次读取写一条 `loop-read {entry, ok, ms, hit}` 进 `last-step.json` 指向的项目的指标流水（metrics 合入后循环板的记录都经 `src/loops/metrics.ts` 写指标流水，`loop-read` 已在它的词表里），没有指向的项目时丢掉、报一次 info。
  - 投到哪：`last-step.json` 指向的项目、且它有主 Agent 的持有者记录时，经行的 `runtimeOf(项目).emit` 追加进那个项目的收件箱，成功之后才写 `told.json`（先追加、后记已说）；读不出、没有主 Agent 或追加失败时留在机器一级的 `held`（同一个键一条、至多 10 条、24 小时作废），之后每一拍再试。
- `src/loops/records.ts`、`metrics.ts`：`LoopRecord` 加 `loop-read`，映射到指标流水的同名事件。
- `src/loops/index.ts`：有会话控制器的进程在每一拍先跑机器一级的运行者，再跑各项目；行卸载与失去会话控制器时放手。没有用户级目录时行健康写一行 info「没有用户级目录，账号一级的两项（额度快用完、登录失效）这个进程不跑」。
- 验收（L2，`tests/loops-machine.spec.ts`，假的计价服务、注入的时钟、临时目录）：设计 §1.4 第 23 条（两个项目各有主 Agent、登录 `ok` → `rejected` 恰好投给最近走步的那个一条；回到 `ok` 再被拒再投一条；一直被拒、`since` 每 10 分钟后移且 `path` 在 model 与 mint 之间换时恰好一条，中途换一个进程接着跑也不再说；没有 `since` 时键、载荷与 `told.json` 是同一个 ISO 串；`state.json` 清掉之后同一次被拒至多再说一次；额度同一个窗口同一期只投一条）与第 24 条（有 GLM 记录且上次读数满 15 分钟时恰好一次 `quota({waitMs: 3000})`；15 分钟内的第二条记录不读；没有 GLM 记录一次都不读；登录查看只用 `read: false`）；两个进程只有持机器锁的那个读与交；`held` 的去处（`last-step.json` 没有、指向的项目没有主 Agent、之后有了）；`loop-read` 记录；没有计价服务或没有机器一级条目时不建锁。
- 文档：ORCHESTRATION §18 头与「还没有」、§18.5、§18.9 新增「机器一级的运行者」一条。

## 与设计的差异（本侧定的、可逆）

- 用量流水第一次读（`state.json` 里没有位置）时从文件末尾起：设计说「每一拍读用量流水新增的行」，没有位置时文件里已有的都是旧记录，从头读会让第一次起来就为旧用量读一次额度。文件变短（被清空）时从头读。
- 读额度的门槛同时看 `reading.at` 与 `state.json` 里这里上一次发起读取的时刻：只看 `reading.at` 时，读取失败（`reading` 不更新）会让每一拍有新 GLM 记录就再读一次；设计 §9.1 已把「上一次读额度的时刻」放进 `state.json`。
- 登录被拒照设计的转变判：上一拍的状态不是 `rejected`（或 `state.json` 里没有这次被拒的 `since`、`path`）时定下这两个值，状态一直是 `rejected` 时不跟着 `LoginView.since` 与 `path` 变，所以一次被拒只有一个键；`told.json` 的键再挡一道，`state.json` 清掉之后同一次被拒至多再说一次由此而来。设计 §4.3 只给 `loginRejectedSince`，这里另记 `loginRejectedPath`：键里有 `path`，被拒的路径在 model 与 mint 之间换时键不能跟着换。`line` 有时刻时写的是这次被拒的 `since`，与载荷同一个时刻。初版只按键判（评审 F1：`LoginView.since` 是最新的一条被拒记录，请求一直被拒时每 10 分钟后移一次，同一次被拒一小时会说六次），已改。
- 占位填的是这次运行第一个事件的载荷（合进来的事件不并），设计 §2.3 没写合并的情形。
- 机器一级 `held` 里同一个键只留一条：投不出时每一拍都会重新判出同一件事。
- 通道条目的 `scope` 为 `project` 的两项不写 `scope`（没写就是 `project`）。
- 机器一级的事件交给项目时经这个进程自己的项目运行时 `emit`：先建那个项目的 `.llm/loops/`（这个进程可能还没见过它），这个进程从此也跑那个项目，10 分钟没有会话就放手（§18.9 的规矩）；另一个进程持着那个项目的运行锁时，收件箱照样追加（§18.9：`emit` 与谁在跑无关），由持锁的进程读与投。设计只写「写进那个项目的收件箱」，没写经哪一条路。
- `loop-read` 给每一项听 `channel.quota-low` 的条目各写一条（GLM 只有一项），写进事件要去的那个项目的指标流水；没有那个项目时丢掉、写一行 info（设计 §6.10 同）。
- 机器锁沿用项目锁的 `createRunLock`，`RunLockDeps.paths` 收窄成 `runner`、`handover` 两项；机器锁不交接（`holderHere` 恒空、`busy` 恒空），设计 §6.1 原文「机器一级的锁不交接」。

## 顺延项（有理由，不猜）

1. L3 探针场景：headless 宿主里造不出被服务端拒绝的登录与真实的额度读数（需要真实凭证与网络，探针不发 `/api/monitor` 请求），机器一级的运行者在探针里只会看到「未登录」、什么都不产生；L2 用假的计价服务钉住两条验收。全量探针照跑，确认两个包都装时循环行照常激活、没有新错误。
2. 首页那一行「GLM 登录失效了：在输入框打 /glm-login」（设计 §8.3、M6-L4 末句）：首页一行整块还没有（§18.7 页面一条已记）。
3. `held` 与 `told.json` 在页面上的显示：页面的「在等的」只数项目的，机器一级的不在页面上。

## 门禁口径

每批一个提交，按 1、2、3、4 的次序；Batch 1 落地之前不在工作树里跑探针（会写主检出）。每批：`npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`，各自 `cmd /c "... > .llm\logs\lm-<批>-<道>.log 2>&1"` 后取 `$LASTEXITCODE`；棘轮 eslint 76 / knip 19 / jscpd 1 不升。探针前取 `.llm/probe-lock`（或 `-2`）锁。推送前 `git fetch origin` 并 `git merge-base --is-ancestor origin/loops-runner origin/main`：含合并时先 merge origin/main 并重跑全量门禁再推；不含时不推。
