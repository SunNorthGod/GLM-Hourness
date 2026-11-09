# inject-via-prestep 代码评审（第二轮）

范围：`git diff origin/main...HEAD`，分支 `inject-via-prestep`，HEAD `d69aa5b`（与 `origin/inject-via-prestep` 相同，工作树干净）。对照 `design.md`、任务简报与上一轮 `review.json` 的两条挡路项。没有重跑套件，只读提交信息、`report.md` 与 `logs/`。

## 上一轮挡路项

1. `missing-report`：已解决。`report.md` 存在，列出 A1–A7 调用点、L2/L3 测试、各提交的门禁（命令、退出码、日志路径），第 4 节用 `git merge-tree` 给出与 m7（`.worktrees/m3`，头 `fb37d60`）的实际冲突块，指出只多出 `docs/DESIGN.md` §2.4a 一处手工合并，`run-probe.mjs`、`src/design/index.ts` 自动合并但合并后要读一遍；`src/loops` 没有共同文件。
2. `probe-and-head-gates-not-run`：已解决。`a6ab5c8`（合并 origin/main `5f1e3f3` 之后加探针等待步）上：`a6ab-build.log` build-info `a6ab5c8`；`a6ab-preflight.log` OK，20 rows；`a6ab-test.log` 0 fail；`a6ab-lint.log` eslint 73 / knip 18 / jscpd 1；`head-probe-2.log` `432/432 passed`，第 410–412 行 `glm-design-wish-off-idle` 三条 PASS，其中第 410 行记录空闲第二会话 `/wish`、`/wish off` 之后 `inbox {nextStep 0, nextTurn 0}`、没有 `agent/inbox/spliced`。`d69aa5b` 是只带门禁记录的空提交，`a6ab5c8` 只改 `run-probe.mjs` 一个场景（加 3 秒等待），行为代码与 `8dcbc11` 相同。`8dcbc11` 探针 430/432 的原因与修正写在 `a6ab5c8` 提交信息与报告 §3.2。

## 验收项核对

- 每个移走的提示有 L2：A1–A7 的测试文件与断言在上一轮已核对，此后行为代码与测试未变（`a6ab5c8` 只动探针），合并后 `npm test` 全过。
- L3 `/wish off` 空闲会话收件箱为空：见上，PASS。
- 文档与行为同一提交：`e5dda02` 同时改 `docs/DESIGN.md`、`docs/ORCHESTRATION.md`、`docs/FACTS.md` 与 `src/`、`tests/`。
- 门禁与 lint 棘轮绿且有记录：见上。
- 已推 origin：`HEAD == origin/inject-via-prestep`。
- m7 重叠写进报告：见上。
- 不可逆损失：无。只改进程内投递路径；`docs/graph` 的写入（`39d5d2a`）已由 `3860fad` 撤回，分支相对 main 不改 `docs/graph`。
- 失败处理：`step-mailbox.ts` 装不上监听器时退回 `agent.inject` 并告警一次，`inject` 也失败返回 `via: 'none'`；调用方分别降级为行健康 degraded、命令结果 error、循环板重试。提示在会话不再走步、行卸载、重启、崩溃时丢失的取舍写在设计 §3、§4 与 ORCHESTRATION.md §18.10。

## 不挡路的备注

- 实现没有用设计 §2.1 的 `offered` 标记，改为每步按 `id` 过滤本步已带的条目，落盘后删；取消重送与去重的语义相同，`step-mailbox.spec.ts` 覆盖。
- origin/main 已前进到 `2886eb7`，报告写明 `merge-tree` 无冲突，合入步需再合一次并重跑门禁。
- 探针锁 `.llm/probe-lock-2` 按 30 分钟残留规则删除重建，持有者未知，报告已写明。
