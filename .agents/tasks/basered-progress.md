# basered 进度（基线红对账，main 检出）

每阶段后追加。目标：18 条基线红（574/592）清零或带 FACTS 行明示豁免。

## 阶段 0：WIP 审计与取证（2026-11-13）

- 会话恢复时工作树带未提交的 run-probe.mjs WIP：designChecks() 里新增 `stdoutOf` / `driveStarted` / `tailOk` 三 helper + 论证注释。审计结论：与任务一致（exit-1 簇判 (a)，形状钉扎），helper 作用域可用（jsonl@1143、stderrOf@656、runDir@264 均顶层 const）。保留并继续。
- `git fetch origin`：origin/main 无新提交（HEAD 1457830b，与本地一致）。
- 取证（保留产物 /tmp/glm-hourness-probe-2026-11-12T22-09-08-294Z-g6IwKf）：
  - exit-1 簇 13 条：12 个场景目录 stdout 恰为一行 `done`，stderr 无任何 `dsh-glm-hourness` 行，`ws/.llm/execute/drive.jsonl` 都有 `{"op":"start"}`。glm-exec-skeleton、glm-exec-drive 同形状但退出 0 —— 两种收尾结果都存在，runner 需同时接受（exit 0 或「exit 1 + 终文本 + stderr 干净」），非一刀切忽略退出码。
  - rules 票 3 条：rules-peak-wake 与 rules-handover 的 q-1 终态 `state:"cancelled"`，`clearedAt` 与新字段 `closedAt` 都在；唤醒文本不变（`Ticket q-1 cleared: ...`）；handover 流水多一条会话结束的 `ticket-update`（共 5 op，旧期望 4 op）。机制：`src/rules/tickets.ts` holderGone（ORCHESTRATION.md §16.12 设计即「人开的会话结束：取消」）；rc.1 headless 对根会话也发 disposed，设计落地。判：rc.1 变更，改期望（钉 clearedAt + cancelled + closedAt，唤醒已发在 clearedAt）。
  - glm-execution 2 条：
    - Write-over-unread（检查 5131）：rc.1 砍掉 `dsh-fs-observation-policy` 包（rc.3 由它挂 `fs/write-intent`，未读即写拒绝）；rc.1 `dsh-tool-fs` destinationIntent 默认 void，写直接落盘（artifact：`clobbered`）。判：上游漂移，FACTS §3 行 + 检查对齐（写成功 + 文件新内容）。
    - Glob 顺序（检查 5139）：是上一条的级联——写落盘后 unread.txt（06:09:09.745）新于 scratch.txt（06:09:09.687），栈输出 `unread.txt\nscratch.txt` 仍是「新在前」，ZCode 承诺成立；旧期望 `scratch.txt\nunread.txt` 隐含依赖 rc.3 的写拒绝。判：改期望顺序 + 注释说明，shim（search-alias.ts 反转）不动。src/ 不归本车道，不动。
- 13 条 exit-1 的落点：3968（design release）、4021（design modules）、4214+4226（dispatch ×2 场景 ×2 检查）、4273（plan）、4333（review）、4380（docs）、4446（merge）、4465（merge-upstream）、4566（modules，一个检查盖两个 run）、5199（guard request worker）。4612（skeleton）与 4514（exec drive）绿的，不动。

## 阶段 1：run-probe.mjs 18 处改完（2026-11-13）

- helper 定稿：tailOk(run, name, stderrNeedle)，'done' 内置（全部 drive 脚本末步都是 done），exit 0 或「exit 1 + stdout 恰为 done + stderr 无 needle」且 drive.jsonl 有 op:start；注释说明两种收尾都出现（skeleton/drive 实测 exit 0），并注明非一刀切忽略退出码。
- 13 条 exit-1 改到 tailOk：3968 design release、4021 design modules、4215/4228 dispatch（×2 场景 ×2 检查）、4275 plan、4335 review、4382 docs、4448 merge、4467 merge-upstream、4568 modules（盖 modules 与 modules-2 两个 run）、5201 guard request worker（needle 'dsh-glm-hourness/'）。标题里的 "exits clean" 相应改写。4612 skeleton、4514 exec drive 绿的不动。
- rules 票 3 条：5288 peak-wake 与 5292 handover 的 state === 'cleared' 改为 cancelled + clearedAt/closedAt 都在且 clearedAt < closedAt；5291 handover 流水期望加末尾第二条 ticket-update（会话结束取消）。标题注明 rc.1 headless 让行看到根会话结束，引用 FACTS §3。
- glm-execution 2 条：Write-over-unread 改为「落盘 + 文件新内容」（注释说明 rc.1 砍了 dsh-fs-observation-policy）；Glob 期望顺序改 unread.txt 在前（写落盘后的真实 mtime 次序，仍是新在前；shim 不动，src/ 不归本车道）。
- node --check 通过。

## 阶段 2：高峰停车（2026-11-13，14:00–18:00 窗口，coordinator PARK）

当前精确状态（恢复时从这里继续）：

- 未提交的 WIP（都在磁盘上，门禁已过，未跑全量探针）：
  - `scripts/probe/run-probe.mjs`（相对 1457830b 的改动 = 18 条红的全部对账）：
    - helper 块（designChecks() 前，~4159 行）：`stdoutOf` / `driveStarted` / `tailOk(run, name, stderrNeedle)`，'done' 内置，带 rc.1 退出形状论证注释；
    - exit-1 簇 11 处落点改 tailOk：design release（3968 附近）、design modules、dispatch wait + /status 两检查（checkDispatch 内，盖 GLM/non-GLM）、plan、review、docs、merge、merge-upstream、modules（盖 modules 与 modules-2）、guard request worker（needle 用 'dsh-glm-hourness/'）；
    - rules 票 3 处：peak-wake 与 handover 终态改 `cancelled` + `clearedAt < closedAt`，handover 流水期望加末尾第二条 `ticket-update`；
    - glm-execution 2 处：Write-over-unread 改「落盘 + clobbered」，Glob 期望顺序改 `unread.txt\nscratch.txt`（级联，非排序变化），各带注释。
  - `docs/FACTS.md` §3 表尾新增 3 行：rc.1 退出形状、rc.1 会话结束取消等待单、rc.1 砍 dsh-fs-observation-policy（写直落盘）。
  - `.agents/tasks/basered-progress.md`（本文件，未跟踪，不提交）。
- 门禁（改动后已跑，全绿）：`npm run build` ✓、`npm run preflight` ✓、`npm test`（env -u GIT_CONFIG_*）✓ 尾部 `pass 10 fail 0`。
- 18 条红的判定（已按证据落盘，待全量探针验证）：exit-1 簇 13 条 = 判 (a) acceptable rc.1 形状，tailOk 钉扎（extra round disposed、脚本工作完成、无行 stderr、无额外请求）；rules 票 3 条 = rc.1 变更改期望（cancelled 生命周期是 §16.12 设计，rc.1 让行看到根会话结束）；glm-execution 2 条 = 上游漂移（write 闸随 dsh-fs-observation-policy 被砍），Glob 红是它的级联。0 条豁免，0 条需 FACTS §5 挂账。
- 尚未做（恢复后的顺序）：
  1. 全量探针 `npm probe`（GIT_CONFIG_* unset；锁被占就等，绝不删锁；不改 dist、不 build）——预期 592/592；若 skeleton 或 exec-drive 翻红（退出 1），它们的检查仍钉 exit 0，届时按同一 tailOk 论证处置；
  2. `docs/HANDOFF.md` §5：第 23 条里「headless 运行器在第一次静止空闲时退出，不跑目标轮」一句已过时（rc.1 形状见 FACTS §3），整句重写；并在 §5 末尾补一条本次对账记录（仿第 28 条的格式）；
  3. 提交：改动是「一件事」（18 条基线红对账）→ 一个提交（run-probe.mjs + FACTS.md），HANDOFF §5 一个提交；推 `origin main`，再 `https_proxy=http://127.0.0.1:7890 git push github main`；
  4. 更新本进度文件收尾，向协调者报判定表 + 探针数字 + 提交号。

## 阶段 3：收口（2026-11-13，finish lane）

- 恢复时 HEAD 已到 71af0301（schedule 车道落了 findings 文档，与本车道 WIP 零交集）。WIP 审计通过：18 处对账判定与证据一致，node --check 过。
- 探针第 1 跑（.llm/probe-basered-1.log，19:45 起）在 ~22 分钟处崩在 append child 场景：schedule 车道 20:05 在主检出跑 `npm run build`，clean-dist 的删除窗口把 `dist/metrics/library.js` 暂时删掉，子进程 ERR_MODULE_NOT_FOUND。基础设施事故，非检查红；证据 `glm-hourness-probe-2026-11-13T11-45-07-988Z-1J3wDA` 可删。教训：探针锁挡不住别人 build，主检出上 build 与探针互斥需要编排层保证。
- 探针第 2 跑（.llm/probe-basered-2.log，等 schedule 车道安静 ~11 分钟后起）：590/592，2 条红 = exec dispatch 两标签的「不等待 worker」检查，`main.length === 7` 钉死了请求总数，实跑 9。
  - 判定（同 exit-1 簇家族，非缺陷、非 schedule WIP——05:42 的 nowait 全量跑早于其改动就有 9 形状）：脚本 7 步完成后，plain 子 agent 的 settled 通知唤醒主会话，goal-round-driver 赢过收尾竞争，真跑了 2 轮 `<goal_round>`；probe provider 对耗尽脚本重复末步（纯 `done`、无工具调用），不产生新工作。7/9 是每个回合末尾「排轮 vs 收尾」竞态的两种结果，四份工件可证（18-57Z=7、21-24Z=9、22-09Z=9、12-32Z=9；停车车道自己的取证工件就是 9 形状，它给 wait 检查改 tailOk 时漏掉了 main.length 钉）。
  - 处置：wait 检查放宽到观测包络 `main.length >= 7 && main.length <= 9`（带注释：第三种形状重开判定）；FACTS §3 退出形状行改写为三种收尾（ disposed / 真跑 / 退出 0），tailOk 注释同步修正。原「被 disposed 的一轮自己没发请求」的说法被工件推翻，已改。
- 探针第 3 跑（.llm/probe-basered-3.log）：**592/592 全绿**，dispatch 两标签 9 形状。
- HANDOFF §5：第 23 条过时句整句重写；新增第 29 条对账记录（引用 `5e047202`）。
- 提交与推送：`5e047202`（test(probe) 对账主体）、`ec39c850`（docs(handoff)），`c228d879..ec39c850` 推上 Gitee origin 与 GitHub 镜像。schedule 车道在探针第 2 跑期间提交了 `3667ee67` + `c228d879`，其后工作树只剩本车道文件，HANDOFF 无需部分暂存。
- 棘轮：只动 run-probe.mjs 检查表达式与 FACTS/HANDOFF 文档，无新 lint 面。锁 `.llm/probe-lock` 释放。
- 棘轮：本次改动只动 run-probe.mjs 的检查表达式与 FACTS/HANDOFF 文档，未新增 lint 面（build/preflight/test 三道已证）。
