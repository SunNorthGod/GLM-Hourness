# 调查报告：桌面版收到 Browser.close 后不退出

调查时段 2026-11-05 21:15–22:30，只读。没有杀进程，没有发会改变桌面版状态的 CDP 命令（只发过 `GET /json/version`、`GET /json/list`），没有取 `.llm/desktop-lock`，没有改 `~/.dsh`、`docs/graph` 与仓库文件。

## 结论（先看）

1. `Browser.close` 在 Electron 里等于 `app.quit()`，Electron 从不回应这条命令。壳的 `before-quit` 处理器先拦下退出，问宿主「现在退出会中断什么」；宿主说有活，壳就弹一个没有父窗口的原生确认框「退出 DeepSeek Harness？ / 当前正在运行的任务将会中断」，按钮「退出」「取消」，然后一直等人点。CDP 看不到这个框，也点不到它。
2. 宿主把「空闲会话的收件箱里排着没取走的消息」也算成正在运行的任务。两次慢关闭的会话里都排着这样的消息，都是不叫醒的注入，来自本项目的包：`/wish off` 的提示，以及循环板的一条提醒。
3. 两次的区别只在人什么时候点了「退出」，不是两种故障。临时会话 `session-1e8476c6-…` 的会话日志里，宿主退出时清掉收件箱的记录（`agent/inbox/spliced`，`outcome: canceled`）分别落在 15:20:52（批次 L4，`Browser.close` 后约 12 分钟）和 21:22:24（本次，`Browser.close` 后 59 分钟，在编排方 21:12 请人手动重启之后）。每次清掉的都正是排着的那几条。
4. 可靠程度：退出路径、确认条件、收件箱算作任务，这三点是源码实读，并且和安装包里的 `lib/main.js` 对过。「确认框出现过、靠人点击才退出」是推断：确认框本身没有看到（72104 退出之前我没来得及列它的窗口），依据是会话日志的时刻、壳的标准错误里没有「inspection unavailable」告警、主进程整段时间每 10 分钟照常查更新（没有卡死）。
5. 等 15 分钟没有用：退出时刻取决于人什么时候点，不取决于时长。应改成发完 `Browser.close` 就只读地看主进程有没有确认框（顶层窗口类名 `#32770`），有就马上停下请人点；同时 L4 步骤不在临时会话里留没取走的注入消息。改写建议在最后一节。

## Q1 壳、版本与安装位置〔实读〕

结论：Electron 44.7.0（Chrome 152.0.7977.130），应用 `@deepseek-ai/dsh-desktop` 0.2.1-rc.3（exe 的 FileVersion `0.2.1-rc.3`），按用户安装在 `C:\Users\29596\AppData\Local\Programs\DeepSeek Harness\`，代码在 `resources\app.asar`（182,434,783 字节，2026-10-23）。userData 是 `C:\Users\29596\AppData\Roaming\@deepseek-ai\dsh-desktop`，DSH profile 是 `C:\Users\29596\.dsh\profiles\desktop`。

依据：

- `Get-CimInstance Win32_Process`（21:1x）：
  - 72104 `DeepSeek Harness.exe`，父进程 20164（Kiro 的 powershell），创建 15:41:24，命令行 `"...\DeepSeek Harness.exe" --remote-debugging-port=9333`，没有 `--user-data-dir`。
  - 子进程 23932 `--type=gpu-process`、71436 `--type=utility --utility-sub-type=network.mojom.NetworkService`、64064 `--type=renderer ... --app-path="...\resources\app.asar"`，都带 `--user-data-dir="C:\Users\29596\AppData\Roaming\@deepseek-ai/dsh-desktop"`。
  - 81364 是 DSH 宿主，Electron 以 node 模式跑 `resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\index.js`，参数依次是运行时目录、`C:\Users\29596\.dsh\profiles\desktop`、`primary-runtime`、`pnpm.mjs`、`runtime\bin`，与 `reference/deepseek-harness/apps/desktop/src/host-process.ts` 的 `DesktopHostProcess.start()` 的 spawn 参数一一对应。
- `GET http://127.0.0.1:9333/json/version`（21:1x，200）：`"Browser": "Chrome/152.0.7977.130"`，`"User-Agent": "... @deepseek-ai/dsh-desktop/0.2.1-rc.3 Chrome/152.0.7977.130 Electron/44.7.0 Safari/537.36"`。`GET /json/list`：一个 page，`"title": "DeepSeek Harness"`，`"url": "dsh-app://app/"`。
- 源码出处：`reference/deepseek-harness` 是 2026-10-23 的源码检出（`22ddee37`）。下面引用的退出路径已与安装包里解出的 `.llm/tmp-asar/pkg/lib/main.js` 核对（该文件 `before-quit` 一段在 13094–13130 行，`inspect: () => backend.host?.inspectQuit()` 在 12828 行，逐句与源码相同）。

## Q2 Browser.close 实际走的路径〔实读〕

结论：`Browser.close` → Electron `Browser::Quit()` → 发 `before-quit` → 壳的处理器 `preventDefault()` 后问宿主 → 宿主报告有活 → 原生确认框等人点。没有走到窗口的 `close` 处理器（那是关窗时收进托盘的那一支），也没有走到 `window-all-closed`。

逐步依据：

1. Electron 收到 `Browser.close` 只投递 `Browser::Get()->Quit()`，不回应：`shell/browser/ui/devtools_manager_delegate.cc`（v44.7.0 标签，`HandleCommand`）的注释原文 "In theory, we should respond over the protocol saying that the Browser.close was handled ... we don't need to add this complexity"。所以「没有回应」是正常的，不是症状；`close.mjs` 等回应的 10 秒没有意义。
2. `Browser::Quit()`：`is_quitting_ = HandleBeforeQuit(); if (!is_quitting_) return;`，即 `before-quit` 被 `preventDefault` 就整个作罢（`shell/browser/browser.cc`，取自 main 分支；v44.7.0 标签的这个文件没取到，网络中断，按 Electron 文档 `before-quit` 可取消的语义一致）。
3. 壳的 `before-quit`（`apps/desktop/src/main.ts` 1297–1320）：不是安装更新、也没在退出中时 `event.preventDefault()`（1311）；只有 `skipQuitConfirmation`（崩溃恢复与开发版重启菜单才设，93–96、107）或 `sessionEnding`（Windows 注销关机，1122）才直接 `finishQuit()`（1312）；否则 `quitConfirmation.confirm()`（1313），批准才 `finishQuit()`，取消就什么也不做。
4. 确认的判定（`apps/desktop/src/quit-confirmation.ts`）：`decide()` 先 `inspect()`（68–70），宿主没就绪才直接放行；`resolveDesktopQuitPrompt`（15–21）里有活跃任务或定时任务就要问，查询失败或超时（2 秒，`host-process.ts:54` `QUIT_INSPECTION_DEADLINE_MS`）按「有活跃任务」处理并在标准错误打 `desktop quit: task inspection unavailable`（73）；要问时 `show()` 弹框（81–91），等 `result.response === 0`。框的选项（`main.ts` 1033–1044）：`show: options => dialog.showMessageBox(options)`，没有父窗口（注释「hidden windows stay hidden and the box comes to the front」）；`focus` 只在 macOS 有动作（1040），Windows 上再发一次退出请求只是加入同一个等待（`confirm()` 50–58）。中文文案在 `locale.ts`：标题 `aboutProduct`「DeepSeek Harness」，正文「退出 DeepSeek Harness？」，说明「当前正在运行的任务将会中断」，按钮「退出」「取消」（214–221）。
5. 宿主怎么答（`apps/desktop-host/src/index.ts` 95–108、`quit-inspection.ts` 23–39、`update-tasks.ts` 16–21）：`activeTasks = hasDesktopActiveTasks(...)`，条件是任一已加载的 agent `status === 'running'`，**或 `agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0`**，或有运行中、停止中的后台 job；`scheduledTasks` 看已加载会话的 `workspace/session-activity` 里有没有 `schedule` 一族（`packages/schedule/schedule/src/index.ts` 217–224，读存储里还在的提醒）。
6. 收件箱的来历（`packages/core/agent-loop/src/agent.ts` 163–182）：`inject(m)` 是 `send(m, 'next-step', false)`，不叫醒；空闲的 agent 收到 `inject` 后消息就一直排在 `next-step`，直到下一个回合的第一步把它取走。
7. 批准之后（`main.ts` 1278–1296 `finishQuit`）：藏窗、`backend.close()` → `host.stop()`（`host-process.ts` 324–340：发 `shutdown`，至多等 10 秒，再 SIGTERM 等 5 秒，再 SIGKILL 等 5 秒）→ `app.quit()`。宿主关停时每个 agent 被 `cancel({kind:'disposed'}, {keepInbox: !ready})`（`packages/core/agent-loop/src/index.ts:518`），就绪的 agent 的收件箱被清掉，`inbox.clear()` 走带丢弃标记的 `splice`，会话日志记一条 `outcome: 'canceled'`（`inbox.ts` 97–99、166–172、214）。这一条就是下面用来定退出时刻的记号。

排除掉的：

- 窗口 `close` 处理器（`main.ts` 1109–1118）收进托盘：只在关窗时走；`Browser.close` 先经 `before-quit`，被拦下时根本不关窗。userData 里已有 `background-close-confirmed`（2026-10-26），收托盘的一次性提示也不会出现。
- 定时任务：`C:\Users\29596\.dsh\storages\schedule.json` 的 `tasks` 是空的。
- 宿主没应答：72104 的标准错误（`.llm/l4-batch-2026-11-05/desktop-err.txt`，99 字节，只有 `DevTools listening on ws://127.0.0.1:9333/devtools/browser/69eeb935-…`）里没有 `desktop quit: task inspection unavailable`，所以宿主是按时答了「有活」。
- 主进程卡死：标准输出（`desktop-out.txt`，111 行）到 21:16 每约 10 分钟一组「Checking for update / Found version 0.2.2-rc.1」，与 `update-schedule.ts` 的 600 秒间隔一致；更新只在人点了才下载，退出路径不等它。
- 页面的 `beforeunload`：批次 L4 已经读过，页面没有这类监听（`.llm/l4-batch-2026-11-05/status.txt`）；而且 Electron 的退出先过 `before-quit`。

## Q3 为什么一次 12 分钟、一次 49 分钟以上

结论：两次是同一个原因，退出的时刻就是有人点了确认框「退出」的时刻〔推断，证据链如下，每一环实读〕。

证据：会话 `C:\Users\29596\.dsh\sessions\--C-Users-29596-AppData-Local-Temp-glmh-l4-ws--\session-1e8476c6-1075-4894-9587-e425d6ae6937\session.v4.jsonl.zstd`（循环板 L4 建的临时会话，后来两次 L4 都用它）。只读解压，98 个事件，与退出有关的：

| seq | 时刻（本机） | 事件 | 含义 |
| --- | --- | --- | --- |
| 22 | 11-04 23:06:35 | `agent/inbox/spliced` `next-step` 插入 1 条 | 循环板「桌面版重启之后告诉主 Agent」的提醒，不叫醒 |
| 36 | 11-04 23:20:54 | `command/run wish off` 之后 `next-step` 插入 1 条（`start: 1`） | `/wish off` 的提示「The human left main-agent mode ...」，不叫醒 |
| 41 | 11-05 12:41:51 | `session/end-seed` | 75716（11:55:46 起的实例）载入这个会话 |
| 42 | 11-05 15:20:52 | `agent/inbox/spliced` `removedCount: 2`，`outcome: canceled` | 75716 的宿主关停，清掉排着的那 2 条 |
| 43 | 11-05 15:41:29 | `session/end-seed` | 72104 载入这个会话 |
| 49–54 | 17:34:18–17:34:27 | `/wish`，回合开始时两条都被取走 | 收件箱清空 |
| 89 | 18:23:58 | `/wish off` 之后 `next-step` 插入 1 条 | 又排上 1 条不叫醒的提示，此后没有回合 |
| 97 | 21:22:24 | `agent/inbox/spliced` `removedCount: 1`，`outcome: canceled` | 72104 的宿主关停 |
| 98 | 21:52:30 | `session/end-seed` | 新实例（80892，21:52:26 起）载入 |

- 批次 L4：15:08:27、15:10:47 两次 `Browser.close`（`.llm/l4-batch-2026-11-05/actions.jsonl`），会话里排着 2 条，宿主答「有活」，确认框出现；15:20:52 宿主关停（同一秒 userData 的 `DIPS` 最后写入，`l4.md` 已记），即确认在那时被批准。
- 本次：20:23 `Browser.close`，会话里排着 18:23:58 那 1 条，确认框出现；21:12 编排方批注请人手动重启（`docs/graph/nodes/glm-context-window.json`）；21:22:24 宿主关停。我 21:29:01 再查时 72104 与它的子进程都已不在，9333 不再应答；21:52:26 起了新实例 80892。
- 快的那次（panel-2 合入，11:55:06 发 `Browser.close`，不到 1 秒查时已退出）：这个会话在 11:55 前后没有 `canceled` 记录，下一次载入在 12:41:51，说明当时宿主没有排着消息的已加载会话，确认不弹〔推断；44068 里当时加载了哪些会话没有核〕。
- 同样的记号也解释了 11-04 23:05:10 从托盘退出那次：23:05:20 清掉 2 条（seq 20）。那份记录（`.agents/tasks/loops-runner/l4-2026-11-04.md`「操作留痕」）只写了托盘菜单上点「退出 DeepSeek Harness」，没写确认框；这一处我对不上，按源码应当弹过框，记为未解释。
- 桌面版自己的日志：`%APPDATA%\@deepseek-ai\dsh-desktop\logs` 只有崩溃报告，最新的仍是 `crash-2026-11-03T16-46-59-757Z-host.log`；`~/.dsh/logs` 最后写入在 10-26。壳在 `before-quit` 与确认框上不写日志，所以 20:23 前后没有可读的记录，能用的只有上面的会话日志与捕获的标准输出、标准错误。

排着的消息从哪来：都是本项目的包写进去的不叫醒注入。`/wish off` 在 `src/design/mode.ts:329`（同类还有 316 的「主 Agent 在别处」、406 的不带话的 `/wish`），循环板不叫醒的消息在 `src/loops/deliver.ts` 121–124（`wake` 为假时一律 `inject`）与 200–203，另有 `src/design/index.ts` 254、563 与 `src/graph/run-control.ts:207`。只要会话之后没有新回合，这些消息就一直排着，桌面版就一直认为「有任务在跑」。

## Q4 不杀进程、能重启并让新行生效的办法

| 办法 | 依据 | 能不能用 / 风险 |
| --- | --- | --- |
| A. 请人点确认框「退出」，或请人从托盘退出再点「退出」 | `main.ts` 1313–1316；托盘菜单 `tray.ts` 36–38 走同一个 `app.quit()`（`main.ts` 1025–1027） | 唯一能在有活时让人的实例退出的正路。代价是要人在场；`d-desktop-cdp-only` 不许系统级输入，agent 不能代点 |
| B. 关之前让宿主没活可报：临时会话里不留没取走的注入消息、没有在跑的回合与后台 job | `update-tasks.ts` 16–21；`quit-confirmation.ts` 70、76 | 能让 `Browser.close` 直接走 `finishQuit`。只能管本任务建的临时会话；人自己的会话里有在跑的回合或排着的消息时仍会弹框。清掉临时会话里已经排着的消息要经 CDP 操作会话（取走它需要一个模型回合，或经客户端删除排队消息），会动会话状态，只在本任务建的会话里做 |
| C. 发完 `Browser.close` 只读检查确认框 | 确认框是主进程的顶层窗口（无父窗口，`main.ts` 1037）；`.llm/l4-batch-2026-11-05/list-windows.ps1` 已有只读的 `EnumWindows` 列法 | 不能让它退出，但能在几秒内判定「在等人点」并停下，替代 15 分钟空等。不发输入、不抢焦点 |
| D. HMR 就地重组（插件管理器开关、设置表单、写 profile 补丁） | `dsh-base/cordis.patch.yml` 28–32 默认开 `dsh-hmr`；`reference/dsh-desktop-0.2.1-rc.3/dsh-hmr/lib/index.js` 849–873（监视 profile 的 `cordis.patch.yml`、DSH home 的 `cordis.patch.yml` 与 `package.json` 的 bundles）、1320–1367（`reconcileProfile` 比对已加载模块与磁盘，换掉变了的模块并重启它们的 Loader 条目）；插件管理器的 `reload` 走同一处（`dsh-plugin-manager/lib/index.js` 2351–2370） | 不重启也能换上新 dist，但：要写人的 `~/.dsh/profiles/desktop`（AGENTS.md 第 6 条不许，除非人明确要求）；补丁与 bundles 文本不变时 `refresh` 直接返回（`if (inputs === lastInputs) return`），单纯重建 dist 不会触发；被宿主静态图引用或不受行表管理的模块只会 `pending`，提示「changed modules keep running their previous code until a restart」；`application: applied` 不等于启动成功（DEVELOPMENT.md 强制流程第 5 条）。不建议当作 L4 的重启办法 |
| E. 刷新页面（`Page.reload`） | — | 只重载客户端半，宿主行不换代码（`FACTS.md` §3「桌面版完全重启才加载新的 dist，重开窗口不够」；2026-10-28 客户端修订号事故，DEVELOPMENT.md §7） |
| F. 壳自带的「重启应用与 Host」 | `main.ts` 995–1003，`app.relaunch()` 加 `quitWithoutConfirmation()` | 只在开发版（`!app.isPackaged`）的菜单里出现，安装版没有；安装包 `main.js` 12765–12777 同样包在 `development ? [...] : []` 里 |
| G. 命令行再启动一次 | `single-instance.ts`：同一 userData 只认第一个实例，后来的 `quit()`，前一个收到 `second-instance` 只把窗口调出来（`main.ts:1374`） | 不会重启。壳的 IPC 里也没有退出或重启的入口（`ipc.ts` 检索 quit、restart、relaunch 无结果） |
| H. 关窗（`WM_CLOSE`、标题栏关闭） | `main.ts` 1109–1118 | 只收进托盘，不退出；而且是系统级输入，规程不许 |
| I. 杀进程 | — | 规程不许；2026-11-04 的启动竞态事故（`FACTS.md` §3，`INACTIVE_EFFECT`）就是这么来的 |

推荐：B 加 C，C 判到确认框时转 A。

## Q5 不重启人的桌面版，能做多少真机核对

结论：能做大部分，用独立 userData 与独立 DSH home 的隔离实例，panel-2 Q4 已经这样做过〔实读 `.agents/tasks/panel/l4-2026-11-05.md` 第 8 行；`FACTS.md` §3 有两行出自它〕。

做法（照 panel-2 Q4）：

- 启动 `DeepSeek Harness.exe --remote-debugging-port=<不是 9333 的端口> --user-data-dir=<临时目录> --<本任务的命令行标记>`，环境变量 `DSH_HOME=<临时 DSH home>`。单例锁按 userData 分（`single-instance.ts`），所以它和人的实例同时在跑互不影响。
- 临时 DSH home 下手工建 `profiles/desktop`：`package.json` 的 bundles 与依赖、`cordis.yml`、`cordis.patch.yml`，`node_modules` 下的 junction 指向要测的检出（`FACTS.md` §3「手工生成的 profile 与 `link:` 安装的加载方式相同」；panel-2 用 `install-bundles.mjs` 并核对 `target verified`）。
- 只经 CDP 操作，往输入框打字前核对会话属于本任务的临时工作区；用完只结束带本任务命令行标记的进程树（隔离实例是一次性的；若想不杀，也要先满足上面的 B，否则同样会弹确认框）。

覆盖不到的：

- 人的 profile 组合：人的 `cordis.patch.yml` 里的覆盖项、别的 bundle、旧配置（例如 B6 的 `projectHome` 缺失、`workflow` 行的 `home`），以及「人的实例在主检出的 dist 上起得来、没有新错误」这件事本身。glm-context-window 节点要核的正是人的 profile 下缺省 512000 加载无新错误，这一半隔离实例替代不了。
- 凭证与真实请求：隔离实例没有人的 GLM 登录，已登录一支、真实额度、模型菜单要么不测，要么照标定的做法把 `glm-hourness/credentials.json` 复制进临时 DSH home（DEVELOPMENT.md §3 标定一段），这会花真实积分，要先问。
- 人的会话、工作区与 userData 里的本机记录（上手、已读等 localStorage 键），以及人的机器级循环板运行者（它在人的 DSH home 下）。
- 只做宿主行的核对时，DEVELOPMENT.md §3 的 headless 沙盒（L3）更便宜，但它没有客户端界面。

## Q6 DEVELOPMENT.md 的改写建议（只给文本，没有改文件）

现状：main 上 §1.1 的 L4 行写了「运行中的实例不杀（发现就停下报告）」与桌面锁规则，没有写怎么关人的实例；编排方在 `norm-verify-tiers` 上定的「每 30 秒看一次、至多等 15 分钟」原定由 m4-checks-loop-details 同批写进去。建议把关闭与重启写成下面这段，替换「每 30 秒看一次、至多等 15 分钟」：

> 重启人的桌面版：发 `Browser.close` 之前，本任务建的临时会话里不留没取走的消息，最后一次操作若是 `/wish off`、不带话的 `/wish` 这类只注入不叫醒的命令，要么让它跑完一个回合，要么不在这一步之后关桌面版〔2026-11-05 事故，§7〕。经浏览器 websocket 发一次 `Browser.close`；Electron 不回应这条命令，不等回应、不重发。之后每 5 秒查一次主进程与 userData 的 `lockfile`，同时只读列出主进程的顶层窗口（`EnumWindows`，不发输入、不改焦点）。出现标题为「DeepSeek Harness」、类名 `#32770` 的窗口，就是壳的退出确认框（宿主报告有任务会被中断；空闲会话里排着的消息也算）：立即停下，告诉人「桌面版在等退出确认，请点『退出』或『取消』」，不杀进程、不代点。没有确认框而 2 分钟仍未退出，同样停下报告。人点了「退出」之后约 20 秒内退出（宿主至多 10 秒正常关停，再加两次 5 秒）。等进程与 `lockfile` 都不在了再 build、再用人的 userData 带 `--remote-debugging-port=9333` 启动。

§7 事故表建议加一行：

> | 2026-11-05 | 两次经 CDP 发 `Browser.close` 后人的桌面版不退出：批次 L4 约 12 分钟后退出，glm-context-window 的合入步 59 分钟后才退出，中间人被请去手动重启 | L4 | 壳的 `before-quit` 先问宿主，宿主把空闲会话收件箱里没取走的消息也算作运行中的任务，壳弹无父窗口的原生确认框等人点，CDP 看不到；两次排着的都是本项目的包注入的不叫醒消息（`/wish off`、循环板提醒）；规程按时长等待，没有查确认框 | 关闭前不留未取走的注入消息；发完 `Browser.close` 只读查 `#32770` 确认框，见到就停下请人点（§1.1 的 L4 行）；等待时长不再是判据 |

L4 行里「多个任务要用桌面版时按 `.llm/desktop-lock` 轮流用」之后也可以补半句：「持锁的步骤在等人点确认框时照常续写 `owner.txt`，人点完、桌面版重启并核对完再删锁」，免得等人期间锁被当成残留。

## 后续建议（不在本次范围，供编排方定）

1. 包里的根因：不叫醒的注入在空闲会话里一直排着，桌面版因此认为有任务在跑，退出要人确认；宿主关停时这些消息还会被丢掉（`canceled`），模型最终也没读到。可以考虑把这类提示改走包里已有的步前提示（`agent/pre-step`，规则板提醒就是这么做的，`src/rules/reminder.ts`），让收件箱保持空。改动涉及 `src/design/mode.ts`、`src/design/index.ts`、`src/loops/deliver.ts`、`src/graph/run-control.ts` 的注入点，模型看到消息的时机不变（下一步之前），但要单独开节点、按设计评审。
2. 上游：rc.3 把排队的输入当作「当前正在运行的任务」，文案与实际不符；可以作为反馈给 DSH，不阻塞本项目。
3. 当前状态：72104 已于 21:22 退出（宿主关停记号 21:22:24，21:29 进程已不在）；之后人的实例在 21:52 与 22:11 又各重启过一次（`glmh-l4-ws/.llm/metrics/events-2026-11-05.jsonl` 的 `start` 行），不是本调查做的。`session-1e8476c6-…` 在 21:22 之后没有新的排队消息。
