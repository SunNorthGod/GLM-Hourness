# 规则板设计的本机试验（草稿区，不入库）

第 1 轮（设计 0.1）：

- `exp-jobobject.ps1`：Windows PowerShell 5.1 经 Add-Type P/Invoke 建 Job Object，作用在本脚本自己启动的一次性 node 进程上：命名 job、CPU 硬上限与按名重开后解除、嵌套 job、job 强制优先级、单进程内存上限、`GetLastInputInfo` 与前台窗口进程。每个试验 job 都带 KILL_ON_JOB_CLOSE，结束时关句柄即结束进程，finally 里再按 pid 兜底。
- `exp-host.cjs`：一次性「宿主」，延迟后派生一个普通子进程与一个 detached 子进程，各自空转。
- `exp-mem.cjs`：一次性分配器，每次 128 MiB，直到失败。
- `exp-priority.cjs`：Node `os.setPriority` 降低自身优先级后派生的子进程的优先级。
- `out/results.json`：2026-10-29 一次运行的结果（精简后的字段；原始输出含 PowerShell 文件元数据，已去掉）。

第 2 轮（设计 0.2，回应评审第 1 轮的 F1、F2、F3、F6、F12、F14）：

- `exp-glmhjob2.cs`：P/Invoke 类（job、`DuplicateHandle`、Toolhelp 快照、亲和性、job 进程列表）。
- `exp-host2.cjs`：一次性「宿主」：启动时先派生一个休眠子进程（代表规则行激活之前派生的进程），看到 `<日志>.go` 文件后派生空转进程；每 20 毫秒记一次自己的定时器延迟。
- `exp-spin.cjs`：N 个工作线程空转 M 毫秒。
- `exp-round2.ps1`：先收进 job（无限制）再起空转；5% 硬上限加强制优先级、5% 硬上限加宿主正常；强制 Normal 再清标志；只清标志（对照）；创建者退出后有无复制句柄的按名打开；`-EncodedCommand` 引导核对脚本摘要。结果 `out/results-round2.json`。
- `exp-dup-child.ps1`：第 2 轮里代替辅助进程的创建者：建命名 job、收进目标、可选把句柄复制进目标，然后退出。
- `exp-round2b.ps1`：用 job 的亲和性限制（2 个逻辑处理器）代替 CPU 硬上限：强制低于正常与宿主保持正常两种，以及只清标志与先放宽再清。结果 `out/results-round2b.json`。
- `exp-round2c.ps1`：亲和性限制对嵌套在类似 DSH 运行器的 job 里的进程是否生效。结果 `out/results-round2c.json`。
- `exp-round2d.ps1`：job 的进程列表是否含嵌套 job 里的进程。结果 `out/results-round2d.json`。
- `exp-bootstrap.ps1`：子进程执行策略为 Restricted 时，`-EncodedCommand` 引导能否运行、`-File` 是否被拒。结果 `out/results-round2e.json`。

第 3 轮（设计 0.3，回应评审第 2 轮）：没有新的进程试验。

- `linecheck-round3.cjs`：只读 `reference/dsh-desktop-0.2.1-rc.3/` 的几份文件，按换行符打印设计新引用的行号（`collapses`、`exec.parent`、`run_code` 的可见性、`goals.get` 与视图、`phase`、`run_code` 的期限）。运行：`node .agents/tasks/rules/exp/linecheck-round3.cjs`。

全部试验只作用于脚本自己启动的进程，`finally` 里按 pid 结束，结果里的 `leftRunning` 为空；没有改系统或用户的执行策略。结果的解读写在 `../design.md` §7.2。
