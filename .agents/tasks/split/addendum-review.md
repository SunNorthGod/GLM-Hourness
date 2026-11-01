# split 设计附录评审（question-17 B，附录 0.5，第 5 轮）

评审对象：`.agents/tasks/split/design-addendum-q17b.md` 附录 0.5（2026-10-29，第五稿）。
上一轮：第 4 轮评审了附录 0.4，CHANGES_REQUESTED（MEDIUM 1、NIT 4，D01–D05）；第 1–3 轮的 A01–A17、B01–B07、C01–C08 已全部关闭。本轮先逐条复核 D01–D05，再审 0.5 新增与改写的部分：G13、G20 的改写，U17，§2.6.1 的四种动作，§2.6.2 的 `norm` 适用范围与 `raw` 规则、记录内容、条目核对 O 组第 1、3 条与新出现的链接、第 3 小步的「写入中」、第 4 小步的输出文件与时限、「从 S0/S1/S2 开始」、`rollback` 的「续跑回滚」一支与运行前检查第 6 条、退出码 2 的新定义，§2.6.5 R2–R4、R6 与运行方式，§4.2 第 8 项，§4.4，§5.1–§5.4，§6，§8，§9.4。
对照：`design.md` 0.3（第 3 轮 APPROVED）；brief 与父任务关于 question-17 B 的更新；rc.3 运行时包 `reference/dsh-desktop-0.2.1-rc.3/`（`dsh-plugin-manager/lib/types/operations.js`、`dsh-app-boot/lib/index.js`、`dsh-atomic-write/lib/index.js`）；安装自带 pnpm 11.28.5 的 `dist/pnpm.mjs`；主检出 main `e238252`；worktree `.worktrees/split` 的 `0fe76a5`；`.agents/tasks/m1-l4/restart.ps1`。
方法：只读。没有改附录、产品代码、`docs/graph/` 与任何 profile；没有运行构建、测试、探针、演练，没有使用桌面版。`desktop`、`glmsandbox` 两个 profile 只读了：`package.json` 的键名、bundle 名、依赖名与依赖值的形状（只输出布尔值）；`cordis.patch.yml` 顶层条目的 id；`node_modules` 的条目名与类型，链接只输出它解析到 `<M>`、`<M>/ui`、`<M>` 之下、之外还是目标不存在，以及 `readlinkSync` 的结果是否为绝对路径、是否带 `\\?\` 前缀、是否以分隔符结尾（只输出布尔值，不打印目标）；`pnpm-lock.yaml` 的 `lockfileVersion` 与 `importers['.'].dependencies` 的键名；`pnpm-workspace.yaml` 的顶层键名；`.bak-*`、`package.json.lock`、`.plugin-manager/run.json`、`compatibility.json`、`node_modules/.modules.yaml` 是否存在。没有读其他值，没有读凭证文件。另在 `.agents/tasks/split/` 下的临时目录里用本机 Node 22.20.0 试了目标不存在的 junction 的建立、读取与重建（E01）。两个临时脚本与临时目录用完已删。
级别：HIGH、MEDIUM、NIT。NIT 即 LOW，不阻塞。
结论：APPROVED。D01–D05 全部关闭。本轮新发现 NIT 3 条（E01–E03），没有 HIGH 与 MEDIUM。

## 1. 上一轮发现的复核

| # | 级别 | 状态 | 依据（0.5 的位置） |
| --- | --- | --- | --- |
| D01 | MEDIUM | 关闭 | G13 按事实变化改写：写明三个链接曾经悬空、DSH 与 pnpm 11 怎样对待悬空链接，以及它们已于 2026-10-29 删去。本轮只读核对：桌面版 `node_modules/@local/` 是空目录，顶层只有 `.ignored/`、`.modules.yaml`、`.pnpm/`、`.pnpm-workspace-state-v1.json`、`@local/` 与两个本项目 junction，与 G13、G18 相同。§2.6.2 写明 `norm` 的适用范围（`<M>`、`<D>`、`<repo>`、`<old>`、路径参数、本项目四个名字、新出现的链接的目标），路径存在而 `realpathSync.native` 抛错算「解析不出」、不走退路；第 1 小步已在的、不属于本项目的链接只记 `raw` 与目标是否存在；O 组第 3 条按原始目标逐字符比较，「之前悬空、现在仍悬空、原始目标相同」不点名；O 组第 1 条按 `symlinkSync(raw, <路径>, 'junction')` 重建并重读核对。R2 加 `rehearsal-dangling` → `<run>/missing`，R3、续跑、R4 由 `rehearse` 自己核对它仍是链接、`raw` 不变、`<run>/missing` 仍不存在；R6 拆掉它。U17 与 §5.4 写明覆盖范围，pnpm 8 一半没有演练，由 §4.2 第 8 项在 glmsandbox 出现这类链接时停下交人。比建议多出的两处（「目标消失」判失败、`raw` 不是绝对路径或 scope 目录不在时不重建）都在安全的一侧，理由成立。`raw` 的写法见 E01 |
| D02 | NIT | 关闭 | 第 4 小步每次新建 `<名>-pnpm-<毫秒时间戳>.txt`（`rollback` 为 `<名>-pnpm-rollback-<毫秒时间戳>.txt`），`wx` 打开，文件描述符直接交给子进程；起子进程之前在运行列表里追加一项；「第 4 小步没有通过」按最后一项判断；判定、报告与时限只看这次的文件；§4.4、§5.1 改为读最后一次运行的输出文件；R3 的续跑另查运行列表多一项、文件名不同 |
| D03 | NIT | 关闭 | 第 3 小步依次：算 `hash3` 并连同临时文件名与「写入中」写进记录、写临时文件并改名、释放写锁、标为「完成」。「从 S1 开始」接受「写入中」且摘要等于 `hash3` 的记录并补标「完成」；S0 加「写入中」归入「第 3 小步没有完成」，改名为 `.stale-*` 后重来，残留临时文件点名不删；持锁期间中断留下的写锁由运行前检查第 3 条拦住 |
| D04 | NIT | 关闭 | 运行前检查第 6 条改为：记录里的 `<old>` 之下两份清单能解析、名字分别为 `dsh-glm-hourness`、`dsh-glm-hourness-ui`、都声明 `dsh.bundle.patch`、patch 文件存在；G16 改为「声明了 `dsh.bundle.patch`」。与 `bundleManifest`（ops:83–86 看 `manifest.dsh?.bundle?.patch`）和 `reconcile`（ops:101–105）的条件一致。本轮只读核对：主检出今天的两份清单都满足 |
| D05 | NIT | 关闭 | 时限由脚本执行：本次输出文件 600 秒没有增长或这次运行超过 1500 秒，`taskkill /PID <DSH 子进程号> /T /F`，最多等 30 秒，再按 `tasklist` 确认 DSH 子进程号与 `run.json`、`package.json.lock` 里的进程号已不在，写「已中断」，退出码 1。`apply`、`rollback` 前台运行、工具超时 1800 秒；`rehearse` 后台运行、轮询只含判定的 `rehearsal.json`。总时限比建议多一层，理由（一直有少量输出的 pnpm 能超过工具超时）成立。`run.json` 的 `pid` 键与锁文件的「进程号加换行」本轮核对属实（ops:212 `recordRun` 写 `JSON.stringify(tree)`，`activeRecordedRun`（ops:225）按 `{ pid, grouped }` 读；atomic-write:197 `withFileLock` 写 `${process.pid}\n`）。两处遗漏见 E03 |

§9.4 末段 0.5 自查补上的三处本轮核对成立：
- 退出码 2 的新定义（「`package.json`、锁文件与 `node_modules` 都没有动」）与第 3 小步取锁超时、逐键比对不过时已经写出记录与备份的事实一致，下一次归入「第 3 小步没有完成」。
- O 组第 3 条改为第 4 条后，I 组的说明、「新出现的链接」与 Q 组第 3 条的引用都指向正确的条目。
- `rollback` 的「续跑回滚」一支：条件（第 1 小步完成标记、没有 `rolledBack`、两个文件与备份逐字节相同、新名字不存在或是链接、旧名字不存在或是指向 `<old>`、`<old>/ui` 的链接）与 S0、S1 样子、`rolledBack` 三支互不重叠，排在 S0 之前的理由（pnpm 中途停下时旧链接可能已建，看上去像 S0）成立。第 1 小步本身的中断窗口见 E02。

## 2. 覆盖面核对

| 父任务更新的要求 | 附录位置 | 判定 |
| --- | --- | --- |
| 两个 profile 直接列 `dsh-glm-zcode`、`dsh-hourness`，没有伞包与占位包 | §2.4、§2.5、§2.6 | 覆盖 |
| 每个 profile 改 `package.json` 之前先备份 | `apply` 第 2 小步（另备份锁文件，`COPYFILE_EXCL`） | 覆盖 |
| 只改 bundles 与 dependencies | `apply` 第 3 小步逐键比对，第 5 小步深度相等与 `compareShapes`；A5 请父任务接受方式 b（锁文件与 `node_modules` 由 pnpm 改） | 覆盖 |
| `cordis.patch.yml` 覆盖项照常按行 id 匹配 | §2.4 表；`apply` 第 5 小步；§4.6 第一轮第 8 项 | 覆盖 |
| 根 `package.json` 不再是 bundle，只作开发工作区根 | §2.2、§3.1、§3.3 preflight 第 2 项 | 覆盖 |
| `ui/` 不再是包，占位清单与 patch 删去，客户端源码留在 `ui/src` | §2.1、§3.2 | 覆盖 |
| 行 id 不变 | §2.3、§3.3 | 覆盖 |
| 0.3 §3.1–§3.7 | §2 | 覆盖 |
| 第 5、6 步 | §3 | 覆盖 |
| 合入顺序 | §4.1–§4.5 | 覆盖 |
| L4 中依赖伞包或占位包的条目 | §4.6、§4.3；§7.2 的映射表 | 覆盖：0.3 §7.6 第一轮第 1、4、6、8 项，第二轮与收尾的比对对象都已替换；第 4 项中 guard 的期望交给第 7 步（question-14 G3） |
| profile 切换放在合入时段内（关桌面版、切换、build、启动、L4） | §4.2 第 2–9 项 | 覆盖。门禁移到切换之前，A5 要求父任务接受 |
| 第 0–2 步不受影响 | §7.1 | 覆盖 |

依据的变化：附录写的依据是 main `0e79cdd`，现在 main 是 `e238252`。`git diff --name-only 0e79cdd e238252` 只有 `docs/DESIGN.md`、`docs/HANDOFF.md`（`7041806`：用量流水备份已删的说明，各一行）与 `docs/graph/` 下的文件；各个 `package.json`、两份 patch、`locale/`、图标、`scripts/` 与根锁文件的 diff 为空，附录用到的仓库事实照常成立。worktree 仍停在 `0fe76a5`，工作区干净。§4.2 第 4 项已规定时段内 main 动过时怎样处理。

## 3. 合入时段内 profile 切换的安全性

desktop（本轮只读核对）：
- 顶层键 `name`、`private`、`dsh`、`dependencies`；`dsh` 下 `profile`、`desktopNextPlugins`、`desktopNextScheduleBundle`、`desktopNextOnboarding`，`dsh.profile` 下只有 `bundles`；13 项 bundle 与 §2.4 左列逐项相同（第 3 项 `dsh-glm-hourness`，第 4–12 项 9 个 experimental bundle，第 13 项 `dsh-glm-hourness-ui`）；两项依赖都是 `link:` 加盘符开头的绝对路径、没有反斜杠；`cordis.patch.yml` 12 条顶层条目，本项目 5 条（`glm-prompt`、`memory`、`workflow`、`hourness`、`glm-llm`）；锁文件 9.0，`importers['.'].dependencies` 只有本项目两项；`pnpm-workspace.yaml` 顶层键 `packages`、`nodeLinker`、`autoInstallPeers`；没有 `.bak-*`、`package.json.lock`、`.plugin-manager/run.json`、`compatibility.json`；有 `node_modules/.modules.yaml`。
- `node_modules`：`.ignored/`（`@deepseek-ai/` 下 6 项、`@openai/codex`、`@standard-schema/spec`、`zod`）、`.modules.yaml`、`.pnpm/`、`.pnpm-workspace-state-v1.json`、空的 `@local/`、两个本项目 junction（分别解析到 `<M>` 与 `<M>/ui`，`readlinkSync` 为绝对路径、不带前缀、不以分隔符结尾）。现在没有不属于本项目的链接，O 组只有空的 scope，按 §2.6.2 它本身不算条目。
- 正常路径：第 1 小步不再遇到悬空链接，D01 的失败模式在今天的 profile 上不存在；时段之前若又出现这类链接，0.5 的 `raw` 规则能处理（目标存在与不存在两种由 R2 在 pnpm 11 上演练）。第 3b 小步拆掉两个旧 junction 之后，pnpm 11 运行时 profile 里没有指回检出的链接。pnpm 11 的 `findUnplannedDirs`（pnpm11:213423）经 `readModulesDir`（:9968、`_readModulesDir` :9977，`readDirEntry` 跳过文件与以 `.` 开头的名字）列名，只把 `isRealDir`（:213441，`lstat`）为目录且有 `package.json` 的条目挪进 `.ignored/`；空的 `@local/` 列不出名字，`.ignored/`、`.pnpm/` 被跳过。`removeDirsOutsidePlan`（:213222）对上一版图里有、这一版没有的目录调用 `tryRemoveDir`，若其中有两个旧依赖的路径，第 3b 小步之后它们已不存在。
- DSH 一侧与第 4 轮相同：第一次 `install` 时两个新依赖算改动过，兼容性检查照常起作用；`reconcile` 看到依赖前后相同、名单不写（ops:96–123）；拒绝之后写回的清单摘要仍是 `hash3`，续跑一支能认出。
- 清空路径与第 4 轮相同：`CI=false`、stdin 为 `'ignore'`；本 shell 没有 `CI` 变量，`DSH_DESKTOP_DIR` 没有设置，`restart.ps1` 的 SHA-256 仍是 `D3BA32AC45139B475D573D2BA717C0BB4F87DAF266CF6B0B51C7A618A4CA8331`。
- 不安全的路径：本轮没有发现会删到主检出、worktree 或不属于本项目的链接目标的路径。

glmsandbox（本轮只读核对）：
- 顶层键 `name`、`private`、`dependencies`、`dsh`；4 项 bundle 与 §2.5 相同；依赖形状同 desktop；`cordis.patch.yml` 存在、没有条目；`node_modules` 只有 `.pnpm/` 与两个本项目 junction，没有 `.modules.yaml`；锁文件 6.0，`importers['.'].dependencies` 只有本项目两项；没有 `.bak-*`、`package.json.lock`、`run.json`、`compatibility.json`。
- 没有不属于本项目的链接，所以 §4.2 第 8 项「glmsandbox 有这类链接时停下交人」今天不会触发，pnpm 8 没有演练悬空链接这一缺口不影响时段。pnpm 8 的清空路径同第 4 轮：第一次 `apply` 时没有 `.modules.yaml`，不校验、不清空。

## 4. 本轮发现

### E01 NIT：G20 说 `readlinkSync` 原样返回建立时给的路径，实际返回的是 `path.resolve` 之后的形式；`raw` 是绝对路径也不等于它是 junction

位置：G20；§2.6.2「不属于本项目的、`apply` 第 1 小步时已经在的链接」一段；条目核对 O 组第 1 条；§2.6.5 R2、R3 第三条（「`readlinkSync` 与 R2 建立时相同」）。

问题：
- 本轮在临时目录里试了（Node 22.20.0）：`symlinkSync('<盘符>:/…/missing', <路径>, 'junction')`（目标用正斜杠给出）之后，`readlinkSync` 返回反斜杠形式，等于 `path.resolve(给定目标)`，不等于给定的字符串。原因是 Node 在 win32 上对 junction 先做 `path.resolve` 再加命名空间前缀，读回时去掉前缀。目标不存在与存在两种情况下，「按 `raw` 重建再读」都得到同一个字符串，所以 O 组的前后比较与重建核对不受影响。受影响的是 R3 的「`readlinkSync` 与 R2 建立时相同」：实现者若拿传给 `symlinkSync` 的字符串作比较基准，而这个字符串是用正斜杠拼出来的（附录与 `--run` 的写法都是正斜杠），演练会在没有问题时判失败。结果在安全的一侧，只是多一轮修脚本与重跑演练。
- O 组第 1 条把「`raw` 不是绝对路径」解释为「那不是 junction」。反过来不成立：目标为绝对路径的目录符号链接（`mklink /D`、`symlinkSync(abs, p, 'dir')`）`readlinkSync` 同样返回绝对路径，Node 的 `lstat` 又分不出两者。按 junction 重建会把这类链接的类型从符号链接改成 junction。这条路径只在 pnpm 删了外部链接时才走到，正常不会发生，今天两个 profile 也没有外部链接。

修正：
1. G20 改为：「`readlinkSync` 返回 `path.resolve(建立时给的目标)`，不带 `\\?\` 前缀与末尾分隔符；按它重建后再读得到同一个字符串，目标不存在时也一样」。
2. §2.6.5 R2：每建一个 `@local` 链接，立即 `readlinkSync` 一次，把结果记进 `rehearsal.json` 作为基准；R3、续跑、R4 拿 `readlinkSync` 的结果与这个基准比较，不与传给 `symlinkSync` 的字符串比较。
3. O 组第 1 条的括号改为「（相对目标的是符号链接，按 junction 重建会改变它）」，并加一句：绝对目标的目录符号链接与 junction 在 Node 里分不出，按 junction 重建，点名「重建」时注明「按 junction」。

### E02 NIT：`rollback` 第 1 小步在两个文件都恢复之后才写完成标记，两步之间中断会留下没有分支接受的状态

位置：§2.6.2 `rollback` 起始状态「续跑回滚」一支、步骤第 1 小步；§5.1 `rollback` 一行。

问题：第 1 小步依次恢复 `package.json` 与 `pnpm-lock.yaml`、释放写锁，再写完成标记。两个文件都恢复之后、标记写出之前被中断时，profile 的名单与依赖是旧名字，`node_modules` 里还有两个新 junction。重跑 `rollback`：不是 S0（新名字在 `node_modules` 里）；不是 S1 的样子（名单与依赖是旧名字）；「续跑回滚」要求有第 1 小步的完成标记。三支都不符，退出码 2，交人手工恢复。附录只写了「两个文件只恢复了一个就中断」这一种。结果在安全的一侧，与第 4 轮 D03 是同一类窗口，发生在整体回滚里、桌面版关着的时候。另外，「续跑回滚」写的是「锁文件和备份逐字节相同」，没有覆盖锁文件备份记为「无」（第 1 小步删去当前锁文件）的情形；两个 profile 今天都有锁文件，不影响时段。

修正：第 1 小步在第一次写入之前先在记录里写「恢复中」，两个文件都恢复、写锁释放之后改为「完成」。「续跑回滚」接受「恢复中」或「完成」，条件仍是两个文件都与备份逐字节相同（备份为「无」的锁文件要求当前不存在）；只恢复了一个的仍然判为其余情形，退出码 2，交人。§5.1 的 `rollback` 一行同步改写。

### E03 NIT：「`apply`、`rollback` 在 1800 秒的工具超时之内返回」只算了 pnpm 那一步，前台工具调用超时之后怎样做也没有写

位置：§2.6.2 第 4 小步「等待与时限」末句、第 6 小步、`rollback` 第 4 小步；§4.2 第 8 项；§4.4 整体回滚第 6 项；§5.3「一次卡住的 pnpm 运行最多 25 分钟就被结束」一行。

问题：
- 时限只加在第 4 小步（`rollback` 第 3 小步）的 pnpm 运行上。非 desktop 的 profile 在第 6 小步（`rollback` 第 4 小步）还要运行一次 `--dump-default-config`，附录没有给它时限。它不运行 pnpm，正常几秒钟，但 §5.3 把「在 1800 秒的工具超时之内返回」写成不变量，而这一步不在保证之内。
- §4.2 第 8 项写明「编排者不需要另外中断」，没有写工具调用真的超时返回时编排者怎样做。前台命令超时之后，脚本进程与它起的 DSH 子进程可能还在运行；这时立即再运行 `apply` 会被运行前检查第 2 条（有 `DeepSeek Harness.exe` 进程）或第 3 条挡住，仍在安全的一侧，但附录没有给出下一步。

修正：
1. 第 6 小步与 `rollback` 第 4 小步的 `--dump-default-config` 用同样的做法设时限，例如 120 秒；超时时 `taskkill /PID <子进程号> /T /F`，确认进程已不在，退出码 1。重跑 `apply` 时从 S2「只重做核对」，所以不需要新的续跑分支。
2. §4.2 第 8 项与整体回滚第 6 项加一句：工具调用超时返回时，不运行任何新命令，先用 `tasklist` 等到 `node`（运行这个脚本的那个）与 `DeepSeek Harness.exe` 进程都已不在，再读 stdout 已有的部分与最后一次运行的输出文件，然后按 §4.4 的对应行处理；进程不退出就交人。
3. §5.3 那一行的「`apply`、`rollback` 在 1800 秒的工具超时之内返回」改为同时引用第 4 小步与第 6 小步的时限。

## 5. 已核实的假设

- D01 用到的源码：`symlinksUnder` 列顶层与 `@*/` 下的链接（app-boot:648 起）；`linkedProfileRoots` 对 `realModuleDirectory` 报 `ENOENT` 的链接 `continue`（app-boot:664–691）。pnpm 11 的 `readModulesDir`（pnpm11:9968）、`_readModulesDir`（:9977）、`readDirEntry`（文件与以 `.` 开头的名字返回空，scope 是链接时返回空）；`removeDirsOutsidePlan`（:213222）、`quarantineDir`（:213235）、`findUnplannedDirs`（:213423）、`isPackageDir`（:213436）、`isRealDir`（:213441，`lstat`）。scope 下的 junction 被列出，但 `lstat` 不是目录，不被挪进 `.ignored/`。
- G20 的本机试验（Node 22.20.0）：目标不存在的 junction 能建；`lstatSync` 报链接、`isDirectory()` 为假；`realpathSync.native` 报 `ENOENT`；`existsSync(path.resolve(dirname(p), raw))` 为假；按 `raw` 重建后再读得到同一个字符串，目标存在的 junction 同样往返不变。`readlinkSync` 的返回值是 `path.resolve` 之后的形式（E01）。两个 profile 里 pnpm 建的四个 junction，`readlinkSync` 都是绝对路径、不带前缀、不以分隔符结尾。
- D04：`bundleManifest`（ops:83–86）只看 `manifest.dsh?.bundle?.patch`；`reconcile`（ops:96–123）按它决定名单里的依赖是否留下；主检出今天的 `package.json` 与 `ui/package.json` 名字正确、声明了 `dsh.bundle.patch`、指向的 patch 文件存在。
- D05：`recordRun` 写 `JSON.stringify(tree)`，`activeRecordedRun`（ops:225 起）要求 `pid` 为正安全整数、`grouped` 为布尔；`withFileLock`（atomic-write:189）以 `wx` 写 `${process.pid}\n`（:197），持有者已退出时由 `takeOverExitedLock` 接管（:206，函数在 :122）。与附录对两个文件的读法一致。
- 两个 profile 的当前形状与 §2.4、§2.5、G5、G13、G14、G17、G18 一致（§3）。
- 依据：main 为 `e238252`；`0e79cdd..e238252` 只改了 `docs/DESIGN.md`、`docs/HANDOFF.md` 的各一行与 `docs/graph/`；附录用到的仓库文件没有变；worktree 停在 `0fe76a5`，工作区干净；主检出 `status --porcelain` 只有 `?? .kiro/`。
- `restart.ps1` 的 SHA-256 不变；`DSH_DESKTOP_DIR`、`CI` 本机都没有设置。
- 第 4 轮评审 §5 里的其余核实（G1–G19、G21–G27、U11、组合输出格式、探针夹具行号、`ui/tsconfig.json`）本轮依据的文件没有变，沿用。

## 6. 未核实或有误的假设

- 有误（小）：G20「`readlinkSync` 原样返回建立时给的绝对路径」只在给定路径已经是规范的反斜杠形式时成立（E01）。
- 未核实：绝对目标的目录符号链接与 junction 在重建时的区别（E01 第 2 点）；附录对它的说法是推断，影响只在不会正常走到的重建路径上。
- 未核实（附录自己列出）：pnpm 8 遇到悬空 scope 链接的行为（U17 的 pnpm 8 一半，由 §4.2 第 8 项的停下规则兜住）；pnpm 8 在 stdin 为空设备时怎样回答清空询问；修复安装在建链接、删链接之前就失败；运行时 `fs.rm` 与 `rimraf` 遇到 junction 是否进入目标；U10、U12、U14–U17 靠演练；U11 只有源码依据。
- 未核实（沿用上一轮）：真实桌面 profile 的 `.modules.yaml` 与 pnpm 11.28.5 是否兼容（不兼容时无 TTY 即中止，停在 S1，是安全的一侧）；pnpm 11 的 `ci` 能由配置显式给出（两个 profile 的 `pnpm-workspace.yaml` 没有 `ci` 键）；`desktopNextPlugins` 的值是否提到旧包名（rc.3 不读这个键，G15）；宿主的 `skipping profile bundle` 是否进入 `dsh-err.txt`。

## 7. 结论

APPROVED。D01–D05 全部关闭：不属于本项目的链接改为按原始目标记录、比较与重建，演练带一个悬空链接；输出文件按次新建；`hash3` 在改名之前写进记录；`rollback` 的运行前检查与 `reconcile` 的条件一致；pnpm 卡住时的时限由脚本执行。desktop 与 glmsandbox 的键、名单、依赖、覆盖项、锁文件与 `node_modules` 和附录一致，今天两个 profile 都没有不属于本项目的链接，切换的正常路径与失败路径都没有发现会删到主检出、worktree 或外部链接目标的地方。E01–E03 是 NIT，可以在实现切换脚本或 A3 评审时一并处理，不需要再出一稿附录。
