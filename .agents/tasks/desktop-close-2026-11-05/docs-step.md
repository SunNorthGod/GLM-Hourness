# 文档步：桌面版关闭与重启规程、主检出 dist 重建、dsh-auth cookie、事故行、FACTS 行

来源：本目录 `report.md`（Q1–Q6）与 `.agents/tasks/habits-prompts/desktop-start-failure.md`（编排方 2026-11-06 追加的 cookie 一条）。只改 `docs/DEVELOPMENT.md` 与 `docs/FACTS.md`；没有改代码，没有写 `docs/graph`（项目图只用 `graph show` 读），没有碰 `~/.dsh` 与桌面 userData，没有重启桌面版。

## 结果

- main 在 `5b577d9`，origin 与 github 一致（`git ls-remote` 两边都是 `5b577d94304717916138f5317afe8616f416435f`）。
- 本步的提交：
  - `3068772` docs(dev): desktop quit confirmation and main-checkout rebuild in the L4 rules
  - `cb1d2f3` docs(dev): dsh-auth cookie cleanup before desktop start, userData and ~/.dsh edits allowed
  - 合并提交（把 origin/main 的新提交合进分支）：`a291480`、`5276520`、`a51ce5f`、`1c045dd`、`5b577d9`；main 从 `31e0ee5` 快进到 `5b577d9`。
  - cookie 一条是编排方在第一个提交之后追加的；第一个提交上面已有合并，没有改写分支去并进它，单独成第二个提交。
- 工作树 `.worktrees/desktop-close-docs` 与分支 `desktop-close-docs` 已删除（`git worktree remove` 因路径过长没删净目录，剩下的部分用 Node 删除，junction 只删链接）。

## 文档改动

`docs/DEVELOPMENT.md`

- §1.1 L4 行：从「批次 L4 启动桌面版」到桌面锁的条款整段重写为一段：
  - 人许可随时使用桌面版，关闭、重启、启动与开临时会话都不先问（2026-11-05 原话「你以后随便用就行了，只要不抢我鼠标无所谓的」）；桌面 userData 与 `~/.dsh` 按需修改，改前备份、改后记录、凭证值不打印不外传（2026-11-06 原话「你随便清就行了。我已经说了dsh你随便搞，凭据啥的也无所谓，只要别碰我鼠标键盘就行」）；项目图 `d-desktop-cdp-only`；§5 第 3 条与 `AGENTS.md` 第 6 条的「用户明确要求」由此满足。
  - 只经 CDP，不注入系统级鼠标键盘；不往人的会话里输入；人的桌面版的进程一律不杀。
  - 重启规程：临时会话里不留未取走的注入消息；一次 `Browser.close`，不等回应、不重发；每 5 秒查主进程、userData 的 `lockfile` 与主进程顶层窗口（`EnumWindows`，只读）；标题「DeepSeek Harness」、类名 `#32770` 的窗口就停下请人点，不代点、不杀；没有确认框而 2 分钟未退出也停下报告；进程与 `lockfile` 都不在、主检出 dist 是 main HEAD 之后，先数 `Network\Cookies` 里 `host_key = '127.0.0.1' AND name LIKE 'dsh-auth-%'` 的行（读副本），超过 50 个就在没有桌面壳运行时备份 `Cookies` 与 `Cookies-journal` 后删掉这些行，再用人的 userData、不设 `DSH_HOME`、带 `--remote-debugging-port=9333` 启动。
  - 桌面锁：等人点确认框期间照常续写 `owner.txt`，人点完、重启并核对完才算用完。
- §1.1 表下一段整段重写：合入步在主检出 `git merge --ff-only` 之后、重启桌面版之前跑 `npm run build`；前后 `git status --porcelain --untracked-files=no` 为空；`packages/*/dist/build-info.json` 的 `commit` 等于 `git rev-parse --short=7 HEAD`；除锁目录与快进合入外，这是主检出上唯一的写入。
- §5 第 4 条：「先关桌面版，再合入、build、启动」改指 §1.1 的规程与 build 核对。
- §7：三行。2026-11-05 `Browser.close` 两次没有退出（原因：`before-quit` 问宿主，宿主把空闲会话收件箱里没取走的消息算作运行中的任务，无父窗口的原生确认框等人点，CDP 看不到；两次排着的都是本项目的不叫醒注入）；2026-11-05 主检出 dist 停在 `3a835b7`，`c452b17`、`cf0ed57` 没有到人的桌面版；2026-11-06 桌面版两次启动失败「desktop welcome: Web authentication failed」（71 个 `dsh-auth-*` cookie 约 16 KB，超过 `node:http` 默认 16384 字节，回 431）。

`docs/FACTS.md` §3：七行。

- Electron 44.7.0 把 `Browser.close` 当 `Browser::Quit()`，协议上不回应〔实读〕。
- 0.2.1-rc.3 壳的 `before-quit`、`skipQuitConfirmation` 与 `sessionEnding` 两种直接退出、确认框的文案与按钮（标题「DeepSeek Harness」，正文「退出 DeepSeek Harness？」，说明「当前正在运行的任务将会中断」，按钮「退出」「取消」）、批准后的关停时限〔实读，与安装包 `lib/main.js` 对过〕；类名 `#32770`〔推断〕。
- 宿主 `activeTasks` 的条件：running 的 agent、`inbox.nextTurn` 或 `inbox.nextStep` 不空、后台 job；`scheduledTasks` 看定时任务〔实读，源码检出〕。
- `inject` 排进 `next-step` 不叫醒；宿主关停清收件箱，会话日志记 `agent/inbox/spliced` `outcome: 'canceled'`〔实读，加会话日志实读〕。
- 两次慢退出是确认框弹出、有人点了「退出」〔推断，依据照报告 Q3〕。
- 同一 userData 的第二次启动不重启（单例）；「重启应用与 Host」菜单只在开发版〔实读〕。
- `dsh-auth-*` cookie 按端口发、30 天、不分端口，`connectDesktopWelcome` 经 `net.fetch` 带上全部，超过 16384 字节回 431〔实读加实测〕。

旧的等待条款：main 上的 `DEVELOPMENT.md` 本来就没有「每 30 秒看一次、至多等 15 分钟」的字样（原定由 m4-checks-loop-details 写，没有写进去），所以没有要删的文字；新行明确写了等待时长不再是判据。

## 门禁

每道都重定向到日志，退出码取自 `$LASTEXITCODE`（`npm test` 经 `cmd /c` 重定向，免得 PowerShell 把测试里预期的标准错误当成错误）。

最终的树（`5b577d9`，即 main）：

| 门禁 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run build` | 0 | |
| `npm run preflight` | 0 | |
| `npm test` | 0 | 3180 项、3180 过、0 败、0 跳过；check-secrets 无发现；graph:smoke 通过 |
| `node scripts/check-lint.mjs` | 0 | eslint 73、knip 18、jscpd 1，与棘轮相同 |

不需要探针（只改文档）。不需要重启桌面版，也没有在主检出 build：本步不改任何行的行为，dist 不变。

途中的失败（都不是本步的改动引起，每次单独跑出问题的 spec 都通过，整套重跑都通过）：

- `tests/lessons-seed.spec.ts` 3 项：被忽略的 `.agents/tasks/m5/lessons-seed.json` 不在工作树里，是这个 spec 的前置条件；从主检出拷进工作树后通过（工作树删除时一起删掉）。
- `tests/loops-run.spec.ts` 第 12 项：已知竞态，修复随 habits-prompts 在 `38d3a9d` 进了 main，之后不再出现。
- `tests/data-journal.spec.ts` 第 24 项（两个进程并发追加，留下 `.stale-*` 锁）、`tests/metrics-rules.spec.ts` 第 8 项（收尾删临时目录 `EBUSY`）、`tests/loops-peak.spec.ts` 第 40 项（行健康期望 degraded、实得 active）：计时与并发敏感，当时同机有别的线在跑探针与整套门禁。

## 其他

- 主检出在合入时有别的任务留下的未提交改动（`knip.js`、`package.json`、`src/design/propose.ts`、`ui/src/loops/LoopsPage.tsx`），本步没有动它们；快进只碰 `docs/DEVELOPMENT.md` 与 `docs/FACTS.md`，没有冲突。
- 本步不写 `docs/graph`（任务书规定）；项目图上的状态由编排方记。
