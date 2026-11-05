# m5-habit-rule 独立评审（DEVELOPMENT.md §1.1）

评审对象：分支 `m5-habit-rule`，`git diff origin/main...HEAD`（origin/main c254b918，HEAD b90e47a4）。对照：任务书、`.agents/tasks/m5/habit-rule-plan.md`、项目图节点 `m5-habit-rule` 的三条验收。挡路只按 d-failure-plans 三类；门禁结果读提交说明与计划 §4，未重跑。

结论：CHANGES_REQUESTED，两条阻断。

## 已核对、成立的部分

- 根因（计划 §1）与代码一致：`memory_habit` 原在 `LEARNING_TOOL_NAMES`、不在 `ORCHESTRATION_RESIDENT_TOOLS`；问答卡常驻；记忆行原来不注册 `tools/pre-execute`。根因与取舍写进 M5 设计（`.agents/tasks/m5/design.md` 新增「3.8 习惯先问」一节）。
- 验收 1：`src/memory/habit-rule.ts` 经 `installRuleGate` 安装（`src/memory/index.ts` 在工具注册成功后安装，宿主没有接缝或安装抛错时行降级并写明）。拦下带 `rule: 'habit-ask-first'` 进会话项目的 `audit/violations.jsonl`，纠正提醒的正路是 `memory_habit ask`；直述路径（`relay` 不是光秃秃的同意、不复述 agent 的问话）放行，`memory_store` 自身的 `saidLatest` 未改。L2 `tests/memory-habit-rule.spec.ts` 钉住拦下、放行、撤下与流水；L3 探针 `glm-memory-habit` 加两步拦下并核对违规流水两条。
- 验收 3 的规则总表与规则板：`GUARD_RULES` 加 `memory` 行一条，`CATALOG` 映射为 `memory:habit-ask-first`，`VIEW_ROWS` 由目录推出，含 `memory`；规则板「撤下」列给的是「跟主 Agent 说」。`guard_lift habit-ask-first` 写 `docs/guard/lifts.jsonl`，门读它后不再拦（L2 已钉）。计数 10 → 11（guard 6、graph 1、loops 2、metrics 1、memory 1），主 Agent 九条不变，`tests/contracts.spec.ts` 与 `tests/rules-builtin.spec.ts` 照实改。
- 门禁记录：a1e01ba 记 build 0、`npm test` 0（含 preflight 与 check-lint 棘轮）、`npm run probe` 426/426；eafc98b 记 lint 修正后 `npm test` 0。
- 没有动 `docs/graph`，没有改 `~/.dsh`。

## 阻断

### B1 验收第 2 条没有两档模型的真实运行记录

节点验收第 2 条要「GLM-5.3 与 GLM-5.3-Flash 两档模型都一样」，任务书第 4 条要求真实运行记录写进 `.agents/tasks/m5/` 下的 md。计划 §3 写明记到 `.agents/tasks/m5/habit-rule-runs.md`，该文件不存在；计划 §4「未做」自认没跑。L2 只证明 `decline` 之后 28 天 `declined_recently`、两条绕路被拦，证明不了模型会用常驻的 `memory_habit` 而不是在对话里直接问（计划 §2 做法 D 的已知缺口），这正是这个节点的起因。
修正：GLM-5.3 与 GLM-5.3-Flash 各跑计划 §3 末条的两会话流程（第一会话人回绝，第二会话同样改动核对没再问），记录模型、会话、`memory_habit` 流水与违规流水的实况写进 `habit-rule-runs.md`；`scripts/rules-gate.mjs` 拒绝时不绕过。

### B2 任务书第 5 条要求的文档没有同批改，ORCHESTRATION.md 现在与行为相反

diff 里没有 `docs/` 下任何文件。仍在 main 上的条文：
- `docs/ORCHESTRATION.md` 第 1130 行：「`memory_habit`（§8.5）是主 Agent 的延迟工具」，本分支已改为常驻。
- 同文 §8 的记忆行描述与第 1525 行代码规则目录没有 `memory:habit-ask-first`，也没写记忆行装了 `tools/pre-execute` 门。
- `docs/HANDOFF.md` 第 153 行 M5 一行仍写「等人定 2026-11-04 桌面批次留下的两件（直述的习惯是否也先问、`memory_habit` 提示是否升级为规则）」。
后果：后来的 agent 以 ORCHESTRATION.md 为准会认为 `memory_habit` 延迟、记忆行不拦，违背 AGENTS.md「文档与行为改动同一批提交」，也是任务书明列的要做项。
修正：同批改 ORCHESTRATION.md 记忆与规则相关各节（§8 记忆工具常驻、习惯先问一条写规则与缺口、代码规则目录）与 HANDOFF.md 的 M5 一行。

## 不挡路

- N1 `/rules lift memory:habit-ask-first` 在 main 上走不通：`src/rules/commands.ts` 的 `lift` 只发规则板自己的 `rule-lift`，`src/rules/plan.ts` `ruleOf` 对代码规则回「没有 memory:habit-ask-first 这条规则」；`lift-service.ts` 头注释写明板侧还没接上，ORCHESTRATION.md 第 1710 行写「代码规则不写 /rules lift」。但 `habit-rule.ts` 的 `LIFT_PATH`（进纠正提醒）、文件头注释、计划 §3 与设计新节都把它写成第二条撤下入口。人照做会被拒、看得见、可改说给主 Agent，不属三类；建议照 `src/metrics/rules.ts` 的写法只留 `guard_lift`，与 d-one-lift-path 一致。
- N2 代码与测试注释引 「M5 design §3.8.6」，设计里新节标题是「3.8」，且同节说 0.7 的 §3.8 另有所指；编号对不上，追溯时要靠全文搜。
- N3 guard 行的 `glm:guard` 声明只看记忆行激活状态，规则安装失败（行 degraded）时仍声明规则在拦；行健康已写明没装上，可查。
- N4 提交里有三个 `wip(...)` 提交，落地时可按「一件事一个提交」整理。
- 验收 3 的「改动在 main 上」归落地步骤，本评审不判。
