# inject-via-prestep 报告

分支 `inject-via-prestep`（工作树 `.worktrees/inject-via-prestep`），设计 `design.md`（评审 `design-review.md`），代码评审 `review.md` / `review.json`。

## 1. 改走步前提示的通知

不叫醒的通知不再调 `agent.inject`（落进 `inbox.nextStep`），改为放进 `src/shared/step-mailbox.ts` 的按 agent 待送表，在该 agent 自己的下一个 `agent/pre-step` 里排在认领消息之前送出；该步把它作为 `user/message` 落盘（agent 作用域的 `session/event`）后删条目。取消的步下次再送；本步已带同 `id` 的不重复。装不上监听器时退回 `agent.inject` 并告警一次，`inject` 也失败返回 `via: 'none'`，由调用方降级。

| # | 调用点 | 通知（来源 kind） | 原来 | 现在 |
| --- | --- | --- | --- | --- |
| A1 | `src/design/mode.ts` `leave`，主 Agent 已移走时的 `/wish off` | `MOVED_NOTICE`（`glm-design-wish`） | `agent.inject` | `deps.tell` → 步前待送 |
| A2 | `src/design/mode.ts` `leave`，`/wish off` | `OFF_NOTICE`（`glm-design-wish`） | `agent.inject` | `deps.tell` → 步前待送 |
| A3 | `src/design/mode.ts` `enter`，不带话的 `/wish` | `ENTER_NOTICE`（`glm-design-wish`） | `agent.inject` | `deps.tell` → 步前待送 |
| A4 | `src/design/index.ts` `onBypass` | `[拦下] …`（`glm-design-bypass`） | `live.inject` | `mailbox.post` |
| A5 | `src/design/index.ts` `installMainAgentRules.tell`（git 快照恢复办法） | `[git 快照] …`（`glm-git-snapshot`） | `live.inject` | `mailbox.post` |
| A6 | `src/graph/run-control.ts` `/graph-run stop` | 暂停说明（`glm-graph-run`） | `cancel(keepInbox)` 后 `agent.inject` | `cancel(keepInbox)` 后 `services.mailbox.post` |
| A7 | `src/loops/deliver.ts` `toLive`，`wake` 为假 | 循环板提醒（`glm-hourness-loop`） | `agent.inject` | 步前待送；`via: 'none'` 进重试 |

不动：送正在跑的事件来源会话的循环板回答改为 `toRunning`，仍用 `agent.inject`（该会话在跑，驱动会认领）；`src/rules/wake.ts` 与循环板唤醒表里叫醒用的 `inject` 不变；`DeliverResult.how` 与运行记录 `delivery` 仍取 `'inject'`，含义改为「不叫醒、放在下一步之前」。

文档：`docs/ORCHESTRATION.md` §2.10、§3.1、§6.7、§6.9、§18.10；`docs/DESIGN.md` §2.4a、§6；`docs/FACTS.md` §3（桌面宿主把非空 `inbox.nextTurn` / `inbox.nextStep` 算作活跃任务）。与行为同在 `e5dda02`。

## 2. 新增与改动的测试

L2（每个移走的通知：命令之后收件箱为空 / 结果为 `sent`，下一步出现一次，再下一步不再出现）：

- `tests/step-mailbox.spec.ts`（新，挂在 `test:1` 末尾）：待送表本身，含取消重送、同 `id` 去重、落盘后删除、监听器装不上时退回 `inject` 并告警一次、`via: 'none'`。
- `tests/design-mode.spec.ts`：A1、A2、A3。
- `tests/design-graph-rules.spec.ts`：A4。
- `tests/design-guard.spec.ts`：A5。
- `tests/graph-run.spec.ts`：A6（主 Agent 与子 agent 两种）。
- `tests/loops-deliver.spec.ts`：A7（空闲、运行中、`via: 'none'` 进重试）。
- `tests/design-stage-notice.spec.ts`：`/wish` 通知排在认领消息之前。
- 测试辅助：`tests/step-agent.ts`（新）、`tests/design-host.ts`。

L3：新场景 `glm-design-wish-off-idle`（`scripts/probe/run-probe.mjs`，检查 `wishOffIdleChecks`），`scripts/probe/probe-llm.mjs` 的 `typeLine` 记录命令之后的 `inbox: { nextStep, nextTurn }`。三条检查：

1. 空闲第二会话里的 `/wish`、`/wish off` 成功，没有 `agent/inbox/spliced` 事件，`inbox` 为 `{nextStep: 0, nextTurn: 0}`。
2. 被叫醒后第一次请求里恰好两条 `glm-design-wish` 通知，进入通知在前、离开通知在后，都在人的消息之前；第二次 `/wish off` 不加通知。
3. 之后的请求不再带这两条，持有者记录为 `none`，设计行 stderr 无告警，退出 0。

## 3. 门禁结果

日志目录 `.agents/tasks/inject-via-prestep/logs/`。

### 3.1 分支头 `a6ab5c8`（基于 origin/main `5f1e3f3` 的合并 `8dcbc11` 加探针场景修正）

| 门禁 | 命令 | 退出码 | 结果 | 日志 |
| --- | --- | --- | --- | --- |
| build | `npm run build` | 0 | build-info `a6ab5c8` | `a6ab-build.log` |
| preflight | `npm run preflight` | 0 | 2 packages，20 rows composed | `a6ab-preflight.log` |
| test | `npm test` | 0 | 3235 pass，0 fail | `a6ab-test.log` |
| probe | `npm run -s probe` | 0 | 432/432；`glm-design-wish-off-idle` 三条全过（通知 2 条，enter 1、leave 2、message 3；第二会话 1 次请求；record none） | `head-probe-2.log` |
| lint 棘轮 | `node scripts/check-lint.mjs` | 0 | eslint 73 / knip 18 / jscpd 1，未上升 | `a6ab-lint.log` |

探针在后台进程里跑，退出码按 `run-probe.mjs` 末行 `process.exit(failed === 0 ? 0 : 1)` 与日志里 432/432、无 `void` 行确定。两次探针里 `glm-metrics` 都没有失败项（图批注里提到的偶发失败本次未出现）。

### 3.2 之前的提交

| 提交 | 门禁 | 结果 | 日志 |
| --- | --- | --- | --- |
| `e5dda02`（基于 `125f889`） | build / preflight / lint / test | 均 0；lint 73 / 18 / 1；test 全过 | `build.log`、`preflight.log`、`lint.log`、`.llm-ivp-test.log`（已删，结果记在 `e5dda02` 提交信息） |
| `83c3385`（合并 origin/main `b001609`） | test | 全过 | `test-pre-merge.log` |
| `8dcbc11`（合并 origin/main `5f1e3f3`） | build / preflight / test / lint | 均 0；test 3235 pass 0 fail；lint 73 / 18 / 1 | `head-build.log`、`head-preflight.log`、`head-test.log`、`head-lint.log` |
| `8dcbc11` | probe | 退出 1，430/432：`glm-design-wish-off-idle` 收件箱为空一条过，两条通知检查失败（第二会话 0 次请求） | `head-probe.log` |

`8dcbc11` 探针失败的原因：场景在叫醒第二会话（`other.say`）的那一步之后直接结束，第二会话那一轮还没发出第一次请求探针就跑完了。`a6ab5c8` 在叫醒之后加一步 `Start-Sleep 3`（与访谈场景的 `stageWait` 相同），重跑全过。行为代码没有改。

### 3.3 其它

- `39d5d2a` 在分支上写过 `docs/graph`，由 `3860fad` 撤回；分支相对 main 不再改 `docs/graph`。
- 探针锁：`8dcbc11` 与 `a6ab5c8` 的探针都用 `.llm/probe-lock-2`。11:03 取锁时该目录建于 10:33:10、没有 `owner.txt`，按 30 分钟未续写判为残留并删除重建（持有者未知）；两次探针结束后已删除自己的锁。
- origin/main 此后前进到 `2886eb7`；`git merge-tree` 显示 `a6ab5c8` 与它合并无冲突，合入步需要再合一次并重跑门禁。

## 4. 与分支 m7 的重叠

m7：工作树 `.worktrees/m3`，分支 `m7`，头 `fb37d60`（另有未提交改动，不计）。用 `git merge-tree` 分别把 m7 与 origin/main、与本分支头合并比较冲突块数。

m7 与 origin/main 本身已在 9 个文件冲突（`docs/DESIGN.md`、`docs/HANDOFF.md`、`docs/ORCHESTRATION.md`、`package.json`、`scripts/probe/probe-llm.mjs`、`src/guard/main-agent.ts`、`tests/contracts.spec.ts`、`tests/design-mode.spec.ts`、`tests/loops-run.spec.ts`）。本分支加进来之后：

| 文件 | m7 + origin/main 冲突块 | m7 + 本分支头冲突块 | 说明 |
| --- | --- | --- | --- |
| `docs/DESIGN.md` | 1 | 2 | 多出的一块是 §2.4a 接口对照表 `agent/pre-step` 一行：本分支在使用者里加步前待送，m7 在同一表的 `tools/pre-execute` 行加 execute；手工把两边都留下 |
| `docs/ORCHESTRATION.md` | 1 | 1 | 不增加 |
| `scripts/probe/probe-llm.mjs` | 2 | 2 | 不增加；本分支只改 `typeLine` |
| `tests/design-mode.spec.ts` | 1 | 1 | 不增加；冲突是身份节长度断言，来自 main |
| `package.json`、`docs/HANDOFF.md`、`src/guard/main-agent.ts`、`tests/contracts.spec.ts`、`tests/loops-run.spec.ts` | 同 | 同 | 本分支不改或不增加 |
| `scripts/probe/run-probe.mjs` | 0 | 0 | 自动合并 |
| `src/design/index.ts` | 0 | 0 | 自动合并；导入区与 `installMainAgentRules` 参数两处挨着 m7 的改动，合并后需读一遍 |
| `src/shared/dsh-min.ts` | 0 | 0 | 自动合并 |
| `tests/design-stage-notice.spec.ts` | 0 | 0 | 自动合并 |

`src/loops`：m7 只改 `src/loops/service.ts`（与测试 `tests/loops-row.spec.ts`、`tests/loops-run.spec.ts`），本分支只改 `src/loops/deliver.ts` 与 `tests/loops-deliver.spec.ts`，没有共同文件。

结论：本分支给 M7 合入只多出 `docs/DESIGN.md` 一处手工合并；`run-probe.mjs`、`src/design/index.ts` 能自动合并，合并后跑一遍 build 与探针确认两边的场景与导入都在。

## 5. Landing

合入头：`e45498ffadcde805a91e5ea35d027e8b1c8958ea`（main 快进到它）。

### 5.1 合并与门禁

门禁期间 origin/main 前进了四次，每次都把最新的 origin/main 合进分支，在新合并树上按 build → preflight → npm test → lint 棘轮 → probe 的顺序重跑。日志在 `logs/`。

| 合并树 | 合进的 origin/main | build | preflight | test | lint（eslint / knip / jscpd） | probe | 日志前缀 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `4aa4555` | `2886eb7` | 0 | 0 | 0（3237 pass，0 fail） | 0（73 / 18 / 1） | 0，432/432 | `land-*.log`（无序号） |
| `699c75a` | `9fb5146`（只改 `docs/graph`） | 0 | 0 | 0（3237 pass，0 fail） | 0（73 / 18 / 1） | 0，432/432 | `land-*-2.log` |
| `5d62caf` | `b2aa47d`（m5-habit-rule 落地） | 0 | 0 | 0（3255 pass，0 fail） | 0（73 / 18 / 1） | 0，436/436 | `land-3-*.log`、`land-probe-3.log` |
| `ba56d27` | `8bd0550`（m5-rule-expected-effect 落地） | 0 | 0 | 1（`tests/data-journal.spec.ts` 1 fail） | 未跑 | 未跑 | `land-4-*.log` |
| `829236b`（修复提交） | — | 0 | 0 | 0（3271 pass，0 fail） | 0（73 / 18 / 1） | 0，436/436 | `land-5-*.log` |
| `e45498f` | `137359f`（只改 `docs/graph`） | 0 | 0 | 0（3271 pass，0 fail） | 0（73 / 18 / 1） | 0，436/436 | `land-6-*.log` |

lint 棘轮四次都是 eslint 73 / knip 18 / jscpd 1，没有上升。

`package.json` 冲突两次（`5d62caf`、`ba56d27`）：分支在 `test:1` 加了 `tests/step-mailbox.spec.ts`，main 在 `test:2` 加了 `tests/memory-habit-rule.spec.ts`、`tests/memory-habit-declined.spec.ts`（第一次）与 `tests/rule-effect.spec.ts`、`tests/rule-effect-check.spec.ts`（第二次）。两边各改一个脚本，其余键与合并基相同；解决为两边都留，合并后核对五个 spec 都在各自的脚本里。

`ba56d27` 的失败与修复（提交 `829236b`）：两进程各追加 200 条的测试断言「no lock is left behind」失败，留下 `j.jsonl.lock.stale-<毫秒>`，内容是一把完整的锁（pid 活着，`at` 比改名早 2 毫秒）。原因：`appendJournal` 传给共用锁的选项没有 `unreadableGraceMs`，读不出内容的锁文件按缺省立即接手；一个刚 `open(wx)`、还没写内容的活着的写者被另一进程读成空文件，锁被改名成 `.stale-`。这次合并没有改流水与锁的代码，是负载下才出现的竞态。修复：M5 的锁选项加 `unreadableGraceMs: 500`（小于 2 秒的等待，崩溃留下的空文件仍在一次追加内被接手）；新测试钉住空锁 500 毫秒后接手并留下 `.stale-`、创建者在宽限内写完就不接手；`docs/DESIGN.md` 与 `docs/ORCHESTRATION.md` §17.6 记下这个值。

探针锁：五次探针都用 `.llm/probe-lock-2`（`.llm/probe-lock` 一直被 `wf_5f5345b05e5c4e89 code` 持有、心跳新鲜）；每次等 `probe-lock-2` 释放后再取，`owner.txt` 首行 `wf_d93b6a094e3f5503 land`，探针结束后删除锁目录。

分支每次合并后推到 origin：`d69aa5b → 4aa4555 → 699c75a → 5d62caf → 829236b → e45498f`，均成功。

### 5.2 合入 main 与推送

- 主检出在 `main`，`git status --untracked-files=no` 干净；`git merge --ff-only origin/main`：Already up to date（`137359f`）。
- `git merge --ff-only inject-via-prestep`：成功，`137359f..e45498f`。
- `git push origin main`：成功，第一次即过（`137359f6..e45498ff`）。
- `git push github main`：成功，第一次即过，无重试（`137359f6..e45498ff`）。

`git ls-remote`：

| 远端 | refs/heads/main | 与本地 main HEAD |
| --- | --- | --- |
| origin | `e45498ffadcde805a91e5ea35d027e8b1c8958ea` | 一致 |
| github | `e45498ffadcde805a91e5ea35d027e8b1c8958ea` | 一致 |

### 5.3 主检出 dist 重建

- build 前 `git status --untracked-files=no`：干净。
- `npm run build`：0（`logs/land-main-build.log`）。
- build 后 `git status --untracked-files=no`：干净。
- `packages/glm/dist/build-info.json` 与 `packages/hourness/dist/build-info.json`：`commit` 为 `e45498f`，等于 main HEAD。
- 两份 build-info 的 `dirty` 为 `true`：`scripts/build-info.mjs` 用 `git status --porcelain`，算进了未跟踪文件。主检出里的未跟踪文件是各任务的 `.agents/tasks/<任务>/` 目录与 `.llm-crr-build.log`，不是已跟踪文件的改动。

## 6. Desktop

2026-11-06 13:59–14:17。`.llm/desktop-lock` 由本步持有（`owner.txt` 首行 `wf_d93b6a094e3f5503 desktop-check`，13:59:22 取锁时目录不存在），每 5 分钟续写一次（14:06:31、14:10:08、14:15:08），检查完删除。只经 CDP 9333 操作（Runtime.evaluate、页面内元素点击、守卫后的 `Input.insertText` / Enter），没有系统级鼠标键盘输入，没有杀进程，没有往人的会话里打字。辅助脚本都在 `%TEMP%\ivp-desk`（仓库外）。

### 6.1 起点

- 13:59 在跑的实例 24196（13:00:59 起，不是本步启动的），页面停在 `session-7d761363-…`（glm-context-window 留下的临时会话），只读取了页面状态。
- 14:02:06 到 14:04:15 之间 24196 自己退出了：本步没有发过 `Browser.close`，`logs/` 没有新的崩溃报告（最新仍是 `crash-2026-11-05T18-03-27-746Z-host.log`），userData 没有 `lockfile`。原因未查明，不是本步造成的。
- 14:05:07 按 `desktop-start-failure.md` 的命令起新实例（`DSH_HOME` 未设，`--remote-debugging-port=9333`），主进程 8692。标准错误只有 DevTools 一行；标准输出有 `dsh web: http://127.0.0.1:54589/...` 与 `[llm-deepseek-account] ... loaded 2 model(s)`，没有 `desktop welcome: Web authentication failed`。加载的 dist：两份 build-info `commit` 为 `e45498f`，等于 main HEAD。

### 6.2 临时会话与 `/wish off`

- 工作区：`C:\Users\29596\AppData\Local\Temp\glmh-l4-ws`（各次 L4 用的临时工作区，有 `docs/graph`）。
- 会话：14:07:59 在侧栏点「在“glmh-l4-ws”中新建会话」，新会话 `session-aa52960e-991b-4ddf-a615-c98877ccbeae`；每次打字前守卫核对会话 id 前缀与工作区标签 `glmh-l4-ws`。
- 会话日志里的经过（只读解压 `session.v4.jsonl.zstd`）：

| seq | 时刻 | 事件 | 说明 |
| --- | --- | --- | --- |
| 3–4 | 14:09:08 | `command/run wish`，`command/done success` | 不带话的 `/wish`；之后没有 `next-step` 的 `agent/inbox/spliced` |
| 5–7 | 14:09:30 | `next-turn` 插入 1 条、`turn/start`、移除 1 条 | 循环板「有事等你太久时」的提醒，叫醒用的 `next-turn`（本改动不动的路径），由回合认领 |
| 10–11 | 14:09:30 | `user/message` ENTER_NOTICE，随后循环板提醒 | 进入通知由第一步的 `agent/pre-step` 落盘，排在认领消息之前 |
| 28–29 | 14:09:45 | `command/run wish off`，`command/done success` | 回合 1 在跑时发的 `/wish off` |
| 36 | 14:09:47 | `user/message` OFF_NOTICE（第 3 步） | 离开通知在下一步之前落盘，没有经过收件箱 |
| 42 | 14:10:01 | `turn/end completed` | |
| 43–69 | 14:11:12–14:12:01 | `/wish` 带话「/wish off」、回合 2 | 本步的操作失误：第一次 Enter 只选中了斜杠命令建议，第二行进成了 `/wish /wish off`。主 Agent 在临时工作区的图里建了 `goal-1`（`C:\Users\29596\AppData\Local\Temp\glmh-l4-ws\docs\graph`，留在原地没有改），回合 2 于 seq 69 结束 |
| 70–71 | 14:12:45 | `command/run wish off`，`command/done success`「已退出主 Agent 模式…」 | 会话空闲时的 `/wish off` |

- 收件箱：页面上读不到收件箱长度；按会话日志，seq 71 之后再没有事件，`/wish off` 之后没有任何 `agent/inbox/spliced`，即 `next-step` / `next-turn` 都是空的。上一次失败时同一操作在 seq 89 留下过一条 `next-step` 插入（`desktop-close-2026-11-05/report.md` Q3）。
- 页面状态：`/wish off` 之后对话区末尾是命令结果「已退出主 Agent 模式…」，没有「深度求索中」，状态栏不再显示「主 Agent」。

### 6.3 Browser.close

`close-watch.ps1`（`%TEMP%\ivp-desk`）：发送前列出主进程 8692 与子进程 71380、72916、85552、76008 的顶层窗口，发一次 `Browser.close`（不等回应），之后每 5 秒查主进程、userData `lockfile`、顶层窗口（只读 `EnumWindows`）。

| 时刻 | 主进程 8692 | `lockfile` | 顶层窗口 |
| --- | --- | --- | --- |
| 14:14:1x 发送前 | 在 | 在 | `Chrome_WidgetWin_1`「DeepSeek Harness」（可见、最小化），另有 IME / `MSCTFIME UI` 隐藏窗口，没有 `#32770` |
| 14:14:11.616 | — | — | `Browser.close` 发出 |
| 14:14:17 第 1 次检查 | 不在 | 不在 | 无（进程已退出） |

确认框没有出现，桌面版在 6 秒内退出。14:14:35 复查：没有 `DeepSeek Harness.exe` 主进程，9333 不应答，没有新的崩溃报告。

### 6.4 重启

- 14:14:43 同样命令再启动，主进程 29360。标准错误只有 DevTools 一行；标准输出与 14:05 那次同形（更新检查、`dsh inspector`、`dsh web: http://127.0.0.1:59599/...`、模型列表 2 个），没有 Web 认证失败。`logs/` 没有新的崩溃报告。页面目标 `dsh-app://app/`，标题「DeepSeek Harness」。
- 插件页（页面内点击「插件」与两张卡片，读文本）：
  - GLM ZCode 通道 v0.3.1（dsh-glm-zcode）：共 5 个 · 5 运行中（glm-llm、glm-login、glm-prompt、glm-compact、glm-ui）。代码来源 `link:C:\Users\29596\Desktop\Project\GLM-Hourness\packages\glm`。
  - Hourness 编排层 v0.3.1（dsh-hourness）：共 15 个 · 13 运行中 · 2 已停用；停用的是 `lessons` 与 `transcript`（已关闭，与之前各次 L4 相同），其余各行运行中。代码来源 `link:...\packages\hourness`。
- 渲染进程控制台（重启后到读完插件页，24 条）：23 条是已知的宿主噪音（`ws://127.0.0.1:9230/ingest`、`dsh-app://app/plugins/events`），1 条是 `dsh-app://app/api/changes.summary?sessionId=session-aa52960e-…&seq=68` 的 404，0 条点名本项目的包。`changes.summary` 不是本项目的接口（仓库里检索不到），14:05 的实例对 `session-7d761363-…` 也报过同样的 404，属于宿主客户端。
- 结论：重启后没有本项目包的新错误。

### 6.5 Cookie 与锁

- Cookie：两次启动都正常，没有动 `Network\Cookies`。
- `.llm/desktop-lock`：14:17 前删除；续写脚本见锁目录不在后自行退出。

### 6.6 清理

- `git worktree remove .worktrees\inject-via-prestep`：退出 255，`failed to delete ...: Filename too long`。Git 已注销该工作树（`git worktree list` 里不再有它），但目录有一部分留在磁盘上；随后用长路径形式 `rd /s /q "\\?\C:\...\.worktrees\inject-via-prestep"` 删掉剩余部分，退出 0，路径不再存在（`rd` 删除 junction 本身，不进入目标）。
- `git branch -d inject-via-prestep`：成功（`was e45498ff`，已并入 main）。
- `git push origin --delete inject-via-prestep`：成功（`- [deleted] inject-via-prestep`）；`git ls-remote origin inject-via-prestep` 为空。
