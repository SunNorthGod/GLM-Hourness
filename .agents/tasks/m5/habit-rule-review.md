# m5-habit-rule 独立评审（DEVELOPMENT.md §1.1），第 2 轮

评审对象：分支 `m5-habit-rule`，`git diff origin/main...HEAD`（合并基 c254b918，HEAD b6ea6535）。对照：任务书、`.agents/tasks/m5/habit-rule-plan.md`、项目图节点 `m5-habit-rule` 的三条验收（`scripts/graph/cli.ts show`，revision 4fa9f4948f9b）。挡路只按 d-failure-plans 三类。门禁结果读提交说明、计划 §4 与工作树里的运行产物，未重跑套件。

结论：APPROVED，无阻断。

## 上一轮阻断的核对

- B1（两档模型真实运行）已解：`habit-rule-runs.md` 有两轮记录。第一轮（60619ab）两档模型都用常驻的 `memory_habit` 问、问答卡 0、回绝进了 `decline`，但会话 2 换说法再问，验收第 2 条不成立，记录如实写了原因（`earlierOutcome` 的匹配、索引与 `memory_query` 不列「不用」）。编排方定 (2) 之后在 bb726f1 的构建上重跑（`build-info.json` commit bb726f1、`dirty: false`），两档模型会话 2 都没再问，回复里点明之前说过不用；记忆流水只有会话 1 的一对 `ask` / `decline`。启动前经 `scripts/rules-gate.mjs` 放行，没有绕过。原始汇总在 `.agents/tasks/m5/runs/habit-rule-2026-11-06/summary.json`，该目录被 `.gitignore`（`.agents/tasks/**/runs/`）排除，凭证复制品已删。
- B2（文档同批）已解：60619ab 改 ORCHESTRATION.md §8.1、§8.3、§8.5、§16.8 目录（11 条逐条列出）、§16.14 流水；DESIGN.md 行表与行健康表；HANDOFF.md 记忆行与 M5 一行。bb726f1 同提交改 §8.3/§8.5、HANDOFF 的 M5 一行与 M5 设计 §3.8.6。工作树里已搜不到「`memory_habit` 是延迟工具」「记忆行不注册 `tools/pre-execute`」的旧条文（经验行那句「本行没有规则」说的是经验行，正确）。
- N1（`/rules lift` 写成第二条撤下路）已改：`LIFT_PATH`、文件头、设计 §3.8 只留 `guard_lift habit-ask-first` 带人的原话一条。

## 验收逐条

1. 拦下与放行：`habit-ask-first`（`src/memory/habit-rule.ts`）经 `installRuleGate` 装在记忆行，只判根会话的 `ask_user_question` 与 `memory_store`。拦下带 `rule: habit-ask-first` 进会话项目的 `.llm/audit/violations.jsonl`（`projectJournal` + `placesFor(cwd).project`），纠正提醒正路是 `memory_habit ask`。直述照旧：`memory_store` 的 `saidLatest` 未改，规则只拦光秃秃的同意或至少一半词出自 agent 上一问的 `relay`。L2 `tests/memory-habit-rule.spec.ts` 钉拦下、放行、撤下与流水（`.llm/hr-memory-habit-rule.log` pass 6 / fail 0）。探针产物 `.llm/probe-runs/2026-11-06T01-20-50-033Z/glm-memory-habit` 的违规流水有卡上问习惯与「好」入库两条拒绝，外加一条走了正路的 `followup`。
2. 28 天不再问，两档模型：见上 B1。根因与取舍在 M5 设计 §3.8 与 §3.8.6、计划 §1–§2。软检查 `maybe_declined` 的阈值 0.25 是编排方定的 (2)，计划记了正反例全部数字并写明没有单一阈值能分开，`notSame` 越过时 `ask` 记录带 `data.notSame`、指标流水交 `count`（`by: memory` 已进 `METRICS_BY` 与 `MetricsBy`，`byKey` 的 `<范围>:<名字>` 符合 `METRICS_ID_PATTERN`），越过可事后数。同名或同组键的「不用」仍硬拒，`notSame` 撤不掉（L2 已钉）。
3. 规则总表与规则板：`GUARD_RULES` 加 `memory` 行一条，10 → 11（guard 6、graph 1、loops 2、metrics 1、memory 1），主 Agent 九条不变，`tests/contracts.spec.ts` 与 `tests/rules-builtin.spec.ts` 照实改；`glm:guard` 一节在记忆行生效且未撤下时声明它。L3 探针跑过（见下）。「改动在 main 上」归落地步骤，本评审不判；origin/main 已前进到 5f1e3f31，落地时要再并一次并重跑门禁。

## 门禁记录

- bb726f1：build 0、check-lint 0（eslint 73 / knip 18 / jscpd 1，未升）、`npm test` 0（3203/3203，`test:1` 首项即 preflight）。
- 60619ab：build 0、preflight 0、check-lint 0、`npm test` 0（3191/3191）。
- 探针：a1e01ba 426/426（`.llm/hr-probe.log`）。bb726f1 之后的探针运行目录 `2026-11-06T01-20-50-033Z` 场景齐全（82 个，与上一次完整运行一致），`memory_query` 输出已带 `declined`，说明跑的是新构建；通过数 426/426 只记在主检出图上的批注（7c135649），没进计划 §4 与提交说明。
- 没有动本分支的 `docs/graph`，没有改 `~/.dsh`。

## 不挡路

- N1 bb726f1 的探针结果没写进计划 §4 或提交说明，只在图批注里；追因时要去图上找。落地步骤补一句即可。
- N2 分支里仍有三个 `wip(...)` 提交与两次并入，落地时可按「一件事一个提交」整理。
- N3 guard 行的 `glm:guard` 声明只看记忆行激活状态，规则安装失败（行 degraded）时仍声明在拦；行健康写明了没装上，可查（上一轮已记）。
- N4 软检查在真实运行里没被碰到（起作用的是索引），只有 L2 证据；这是编排方取舍内的已知情况，记录里已写明。
