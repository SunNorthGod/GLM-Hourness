# m5-rule-expected-effect 评审（第 3 轮）

评审对象：`.worktrees/m5-rule-expected-effect`，`git diff origin/main...HEAD`，HEAD `801a999`（在第 2 轮的 `118158f` 计划、`c92a93b` 第一批、`ac3438e` 第二批、`6f0028a` 计划进度之上，新增 `801a999` 修第 2 轮 F1）。对照：计划 `.agents/tasks/m5/rule-effect-plan.md`、节点 `m5-rule-expected-effect` 的 `projection.node.acceptance`（3 条）、任务书。门禁结果取自提交说明，未重跑套件。

结论：APPROVED。

## 第 2 轮发现的核对

- 第 2 轮 F1（指标流水大时 `Math.min(...times)` 抛 `RangeError`，`/hourness` 整份晨报丢失）：已解决。`src/memory/effect.ts` `countsOf` 的 `denials` 分支改为一次循环取最小的 `Date.parse(event.at)`；`NaN` 与 `earliest` 比较为假，解析不了的 `at` 照旧被跳过，与原来的 `filter(!isNaN)` 等价；全空或全不可解析时仍返回「指标流水还没有记录」。中间数组已去掉。`effectChecks` 内其余对流水的处理是 `filter`/`map`，没有展开进参数表。
- 钉住：`tests/rule-effect-check.spec.ts` 新增 40 万条事件的流水，期望结果与小流水相同（`met`, 1, 0）。提交说明记该文件 6/6。
- 未加 `readEffects` 的兜底：第 2 轮列为可选，不挡路。

## 门禁证据（取自 `801a999` 提交说明）

- build 0，preflight 0，`check-lint` 0，棘轮 eslint 73 / knip 18 / jscpd 1 不变。
- npm test 1：唯一失败是 `tests/loops-run.spec.ts`「a person's adopted script entry runs through the shared executor...」，读 `state.json` 与保存赛跑。核对：该用例与本分支改动无关（本分支未碰 `src/loops`、`tests/loops-run.spec.ts`）；main 的 `4598fa7` 已改为等 `savedState` 再读；本分支起点 `8560d80` 早于 `4598fa7`。
- L3：`ac3438e` 上 `npm run probe` 420/420；`801a999` 只改纯函数内部，未动 DSH 运行时接缝，不需重跑。
- `docs/graph` 在 diff 中无改动。

## 不挡路

- 合入前要做的整合：本分支与当前 main 在 `docs/HANDOFF.md`、`docs/ORCHESTRATION.md`、`package.json`、`src/design/propose.ts` 上有内容冲突（试合并后已撤销，工作树干净）。合入后须在合并结果上重跑 build → preflight → test（含 `loops-run.spec.ts` 拿到 `4598fa7` 的修复后全绿）与 lint 棘轮；`propose.ts` 冲突落在本节点改过的工具参数上，合并后再跑一次 L3。
- 第 2 轮已记的不挡路项（计划 §2.1 写 `exactOf` 而实现在 `record.ts` 读 `body`；一次报告读两遍指标流水；不带 `rule` 的规则提议今天识别不了，等 R3）不变。
