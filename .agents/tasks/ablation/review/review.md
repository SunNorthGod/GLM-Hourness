# ablation 评审（第 2 轮）

评审时刻：2026-11-06 00:07（+08:00）。对象：`git diff origin/main...HEAD`，分支 `ablation`，工作树 `.worktrees/ablation`。

## 证据

- `ablation` 在 `6e52206`（已推 `origin/ablation`），merge-base `b923210`，相对 `origin/main`（`9bf7739`）ahead 1、behind 7。`origin/main...HEAD` 只改 `.agents/tasks/ablation/plan.md`（+57）。工作树除未入库的 `review/` 外无改动。
- 唯一提交的说明：「Plan for project graph node ablation ... Nothing run yet.」没有构建、预检、测试、探针或标定运行的记录。
- `scripts/calibrate/` 仍只有 `limits.mjs`、`run-calibrate.mjs`、`run-dir.mjs`、`simulated-human.mjs`；没有 `fence.mjs`、`ablation.mjs`；`tests/` 下没有 `calibrate-fence.spec.ts`、`calibrate-ablation.spec.ts`；`tests/calibration/` 下没有 `bugfix-shell-redirect`。`scripts/calibrate/run-calibrate.mjs:206` 仍从仓库内 `join(task.dir, 'check.mjs')` 调验收脚本，圈禁不存在。
- `.agents/tasks/ablation/` 下的 `.md` 只有 `plan.md`，没有报告与结果表。
- 节点 `ablation` 的 3 条验收（`show ablation` 的 projection.node）：运行目录在仓库外且被测模型读不到验收脚本与别的试次（事后扫事件流核对）；每一臂经 L3 探针核对、每臂每档模型至少 5 次、结果表写明完成、步数、积分、返工与违规；每段文字的去留有一行结论与依据写进 DESIGN.md。三条都没有对应的实现或产物。
- 上一轮 F1–F4：F4 的「补计划」已做（`plan.md` 入库并推送）；F4 的验证记录部分与 F1–F3 没有新证据，仍成立。
- 计划本身对照任务原文：A4 改为去掉 `glm:dynamic-behavior`、A1 对应改名后的 `glm:reporting-depth`，有依据并写明；不做 M7 P4、留出 `fence.mjs` 的路径判定函数，不堵 P4；规则自查拒绝时不绕过、不改档位；只写报告与建议、不改生产提示词；不动 `docs/graph`、`~/.dsh`、main。计划里没有超出任务的行为。
- 不挡路的核对项：diff 只有计划文档，因此没有改生产提示词、没有堵 M7 P4、没有动 `docs/graph` 与 `~/.dsh`、没有凭证进日志或提交。`dataRows` 的 `projectOverride` 在 main 已有（`scripts/sandbox.mjs:131`），标定运行经 `run-calibrate.mjs:149` 的 `dataRows(dir)` 带上它，本分支没有改动它。

## 挡路项

1. 验收 1 未满足：risk-calib-read 的读取圈禁没实现，没有 L2 或 L3 证据。被测会话仍能按绝对路径读 `tests/calibration/<任务>/check.mjs`、列系统临时目录里同批的其他运行。改法：按计划 §1 实现 `scripts/calibrate/fence.mjs` 并由运行器每次挂上，补 L2 `tests/calibrate-fence.spec.ts` 与 L3 场景 `calib-fence`，真实运行后扫事件流核对无圈外路径。
2. 验收 2 未满足：没有消融开关，A1–A5 每一臂没有 L3 探针核对「请求里恰好少了或多了那一段」。改法：按计划 §2 实现 `scripts/calibrate/ablation.mjs`，L3 场景 `ablation-A0` 到 `ablation-A5` 逐臂与 A0 比对第一个请求，L2 `tests/calibrate-ablation.spec.ts`。
3. 验收 3 未满足：没有 A0 与 A1–A5 在两档模型上的结果表与报告，也没有 DESIGN.md 的逐段结论。改法：规则自查放行、高峰之外跑真实模型，每格至少 5 次，`.agents/tasks/ablation/report.md` 写明每格次数、完成率、积分（及步数、返工、违规），按 question-31 的整理与 Dynamic Behavior 的去留分条给建议，`docs/DESIGN.md` 记每段一行结论与依据。
4. 缺少必需的验证记录：没有针对改动的 `npm run build`、`npm run preflight`、`npm test`、`npm run probe` 与棘轮记录。改法：实现后跑计划 §4 的门禁，在提交说明里记录运行与结果。

## 结论

CHANGES_REQUESTED。分支只有计划提交，计划本身与任务一致；三条验收都还没有实现或产物，需要继续 code 步。
