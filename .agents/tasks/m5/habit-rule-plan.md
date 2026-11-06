# m5-habit-rule：根因、取舍与计划

项目图节点 `m5-habit-rule`「记习惯前先问，从提示词升成规则」。上一步（root-cause）被上游 503 截断、没有留下文件，本文件由 code 步骤补写：先写根因，再写做法与实施记录。

## 1. 根因（实读代码，2026-11-05，main 7560058）

起因：2026-11-04 桌面批次（`m5` 节点 2026-11-03T21:05 的批注）里，GLM-5.3-Flash 要把一条从改动里猜出的习惯记下时，没有用 `memory_habit`，而是用 DSH 通用问答卡问了人；人回绝之后，回绝没有进 `memory_habit` 的记录，「28 天不再问」只在那个会话的上下文里成立。

1. `memory_habit` 在 GLM 路由上是延迟工具。`src/shared/tool-names.ts` 把它放在 `LEARNING_TOOL_NAMES`，不在 `ORCHESTRATION_RESIDENT_TOOLS`；`src/toolsearch/exposure.ts` 的 `isConfiguredDeferred` 因此把它从请求的工具面里拿掉，只在工具检索的公告里列一个名字。模型要先调 `LocalToolSearch` 取到定义、再经 `DeferredToolCall` 调它，`HABIT_DESCRIPTION`（问法、每周上限、28 天）在取到定义之前模型看不到。`tests/contracts.spec.ts` 钉着它延迟。
2. 通用问答卡是常驻的。`RESIDENT_TOOLS` 含 `AskUserQuestion` 与 `ask_user_question`；只有主 Agent 模式（`/wish`）下设计行把它从工具面拿掉并由 `main-agent-ask` 拦下（`src/design/talk.ts` `HIDDEN_FROM_MAIN_AGENT`）。普通会话里它就在眼前。
3. 指向 `memory_habit` 的提示只有四处，都不在模型稳定能看到的位置：`memory_store` 的 `relay` 参数说明末句；`ask_first` 拒绝的 `hint`（只在不带 `relay` 存偏好被拒之后出现）；学习摘要提醒（满 7 天且有未落点的组才发）；`memory_habit` 自己的说明（延迟，见第 1 条）。GLM 方言的 `# Memory` 一节（`src/glm-prompt/localize.ts` `MEMORY_L1`）不提它。
4. 没有任何代码规则管「习惯先问」。记忆行不注册 `tools/pre-execute` 监听器（`tests/memory-row.spec.ts` 钉着），`ask_first` 与 `relay_not_said` 是工具自己的报错，不进违规流水、没有规则编号、不在规则总表里。
5. 因此有两条绕开 `memory_habit` 的路，代码都不拦：
   - 问答卡：卡上的回答是工具结果，不是人发来的消息（`src/design/talk.ts` `personTextOf` 只认 `source.kind: 'user'` 的 `user/message`）。回绝没有任何记录；答应时 `memory_store` 的 `relay` 在人最近一条消息里找不到，得 `relay_not_said`（桌面批次里出现两次），模型转而引用人更早的原话入库。
   - 对话里直接问：人回「好」之后，`memory_store` 带 `relay: "好"`（或人回话里复述习惯的半句）能通过 `saidLatest`，记成偏好，没有 `ask` 记录、不计每周上限；人回「不用」时同样什么都不记。

一句话：模型看得见、拿得到的是通用问答卡和 `memory_store`，看不见 `memory_habit`；「先问再记」只是写在参数说明里的提示，没有一条规则在调用边界上拦。

桌面批次那个会话是不是主 Agent 模式没有留下记录；从它用了问答卡、批注没有提到 `main-agent-ask` 拦下推断不是。

## 2. 可选做法与取舍

| 做法 | 管得住什么 | 代价 |
| --- | --- | --- |
| A. `memory_habit` 列为常驻工具，`# Memory` 一节点名它 | 模型从第一步就看得见定义与 28 天的说法（根因第 1、3 条） | 每个 GLM 请求多一份工具定义（约 2.5 KB，进前缀缓存）；仍是提示，模型可以不用 |
| B. 规则拦「把人只是答应的习惯直接记成偏好」 | `memory_store` 一侧的绕路（根因第 5 条第二项）：`relay` 是一句光秃秃的同意（`isPlainYes`），或 `relay` 的词大半出自 agent 在人这条消息之前问人的那句话 | 判定是启发式：人复述 agent 问过的话也算「答应」，要再走一次 `memory_habit`；会话被压缩到看不见 agent 那一问时放过 |
| C. 规则拦「在通用问答卡上问习惯」 | 桌面批次实际走的那条路（根因第 5 条第一项）：卡上的问题带「记住、习惯、偏好、以后都……」这类词就拦，正路是 `memory_habit ask` | 词表是许可清单，问别的事带了这些词也会被拦；错拦时人一句话撤下 |
| D. 拦对话里直接问 | 对话文本不是工具调用，`tools/pre-execute` 看不到；只能事后读回复文字猜 | 不做：猜错就是打断正常对话，且拦不住已经说出口的话 |

选 A + B + C，做成一条规则 `habit-ask-first`（记忆行装，规则总表 `memory:habit-ask-first`）：

- 只靠 A 仍是提示，节点的 why 正是「提示词管不住模型绕开专门的工具去问」。
- 只靠 B、C 而不做 A，GLM 上的正路仍要先检索再经 `DeferredToolCall`，Flash 在桌面批次里正是没走这一步；纠正提醒点名的工具要在眼前。
- D 不做，留作已知缺口：模型在对话里直接问、人说「不用」时，回绝不进记录。B 让这条路记不进任何东西（人答应了也得回到 `memory_habit`），A、C 与规则声明让正路是最顺手的那条。两档模型的真实运行检验这一点。

人直接说出口的习惯照旧直接记：人的消息不是回答 agent 的一问，或回答里自己说出了 agent 没问过的习惯，`relay` 照常通过（`saidLatest` 不变）。汇报细度 `reporting-depth` 不在规则里：`memory_habit` 记不了这一条（它带 `value`），人的话照 §3.7 由主 Agent 直接记。

## 3. 实施（照 §2）

- 规则：`src/memory/habit-rule.ts`（判定、纠正提醒、经 `installRuleGate` 安装）；记忆行 `src/memory/index.ts` 安装它，违规写会话项目的 `.llm/audit/violations.jsonl`（与记忆的项目目录同一处）。
- 规则总表：`src/guard/catalog.ts` 的 `GUARD_RULES` 加一条，行 `memory`，`liftVia: 'any'`（撤下经 `guard_lift` 带人的原话写现有的撤下记录；规则板的 `/rules lift` 还没接到代码规则，不写它）。总数 10 → 11：guard 行六条、图行一条、循环板两条、指标流水一条、记忆行一条；主 Agent 的九条不变。
- 规则声明：guard 行的 `glm:guard` 一节在记忆行生效且规则没撤下时多一行。
- 常驻：`memory_habit` 进 `ORCHESTRATION_RESIDENT_TOOLS`；`learning_signals` 仍延迟。`# Memory` 一节加一句（`MEMORY_L3`）。
- L2：拦下（光秃秃的同意、复述 agent 的问、卡上问习惯）、放行（直述、与问话无关的回答、汇报细度、卡上问别的事）、撤下（撤下记录在时规则不拦）、违规流水带规则编号、纠正提醒写正路。
- L3：探针场景 `glm-memory-habit` 改为直接调用常驻的 `memory_habit`，加卡上问习惯被拦、答应的「好」被拦两步，核对违规流水。
- 真实运行：GLM-5.3 与 GLM-5.3-Flash 各两个会话，共用同一份用户级记忆：第一个会话人回绝一条习惯，第二个会话再让模型看同样的改动，核对没有再问。记录写进 `.agents/tasks/m5/habit-rule-runs.md`。

## 4. 实施记录（code 步骤）

- 177aa29：本文件第 1–3 节（根因、取舍、计划）。
- d2eb6c3：规则 `habit-ask-first`（`src/memory/habit-rule.ts`，记忆行经 `installRuleGate` 安装，违规写会话项目目录的 `audit/violations.jsonl`）；`GUARD_RULES` 加 `memory` 行一条（10 → 11）；guard 行的 `glm:guard` 一节在记忆行生效、规则没撤下时多一行；`memory_habit` 常驻；`# Memory` 一节加 `MEMORY_L3`。build 0。
- ff3604f：L2 `tests/memory-habit-rule.spec.ts`（卡上问习惯、光秃秃的同意、复述 agent 的问被拦；直述、无关回答、汇报细度、卡上问别的事、子 agent 放行；撤下之后不拦；违规流水带规则编号；纠正提醒写正路），并改 contracts、rules-builtin、memory-row、glm-prompt 的计数与文字。
- eafc98b：探针 `glm-memory-habit` 直接调常驻的 `memory_habit`，加卡上问习惯与「好」入库两步被拦，核对违规流水两条；lint 修正。`npm test` 0。
- 82e7b58：M5 设计 §3.8（习惯先问：从提示词升成规则）写进根因、取舍与规则（验收第 2 条的「写进 M5 设计」）。
- a1e01ba：并入 origin/main（c254b91）。build 0、`npm test` 0、`npm run probe` 426/426（并入前 420/424，挂的 4 条都是 `env-checks`，main 上已修）。

- 60619ab：评审 B2 与 N1、N2：ORCHESTRATION.md §8.1、§8.3、§8.5、§16.8 目录、§16.14 流水，DESIGN.md 记忆行与行健康，HANDOFF.md 记忆行与 M5 一行；纠正提醒、文件头与设计只留 `guard_lift` 一条撤下路；`§3.8.6` 改为 `§3.8`。build 0、preflight 0、check-lint 0（eslint 73 / knip 18 / jscpd 1）、`npm test` 0（3191/3191）。
- 两档模型的真实运行（评审 B1）：记录在 `habit-rule-runs.md`。两档模型都用常驻的 `memory_habit` 问、没出问答卡、回绝进了 `decline`；但会话 2 里两档模型都换了名字与说法再问同一条习惯，`memory_habit ask` 没认出（`earlierOutcome` 只认组键或名字加说明的词集 Jaccard ≥ 0.6），验收第 2 条的「28 天内不再问」没有满足。缺口在 `memory_habit` 的匹配与召回（会话索引、`memory_query` 都不列「不用」），不在 `habit-ask-first`。改法会改变人看到的东西或 m5-4 的行为，交编排方与人定。

- 编排方定 C（2026-11-06）：A 把生效的「不用」列进会话索引与 `memory_query`；B 给 `earlierOutcome` 加只比说明的匹配，门槛由两对真实再问定，并用至少三个反例钉住；若没有单一门槛能分开正反例，停下报数，不挑门槛。按 `src/data/words.ts` 的切词量了词集 Jaccard（一次性脚本，不入库）：

  | 对 | 只比说明 | 名字加说明（现行，≥ 0.6 算同一条） | 范围 |
  | --- | --- | --- | --- |
  | 正 P1 GLM-5.3 两次的问 | 0.304 | 0.296 | all / project |
  | 正 P2 Flash 两次的问 | 0.429 | 0.458 | project / project |
  | 反 N1 同一工具、相反偏好（双引号） | 1.000 | 0.889 | project / project |
  | 反 N2 同一规矩、别的语言（JavaScript） | 0.875 | 0.842 | project / project |
  | 反 N3 范围不同、说法相同 | 1.000 | 0.944 | project / all |
  | 反 N4 不相干、共用常见词（四个空格缩进） | 0.154 | 0.133 | project / project |
  | 反 N5 不相干 | 0.000 | 0.000 | project / all |

  结论：没有单一门槛。正例落在 0.30–0.43，反例 N1–N3 在它上面（0.875–1.000），N4、N5 在它下面；任何能收下 P1 的门槛（≤ 0.30）都收下 N1–N3。词集重合认不出「相反」与「换了语言」，范围也分不开（P1 本身跨范围）。另外 N1–N3 在现行的名字加说明 ≥ 0.6 下已经被当作同一条，这是现行匹配本来的误认。按编排方的第 2 条停下，A、B 都没有动代码。

- 编排方定 (2)（2026-11-06）：A 照旧；软检查 `maybe_declined`（只比说明 ≥ 0.25，或名字加说明 ≥ 0.6），点名那条「不用」并写出路，`notSame: true` 放行并在 `ask` 记录与指标 `count`（`what: habit-not-same`，`by: memory`）里记下被放过的「不用」；同名与同组键的「不用」仍是 `declined_recently`，`notSame` 撤不掉；不是新规则，`habit-ask-first` 不动。
- bb726f1：上面一条的代码、L2 `tests/memory-habit-declined.spec.ts`（12 例：两对真实再问得 `maybe_declined`；五个反例低于 0.25 直接问得出或带 `notSame` 放行并记下；过期的不拦；索引与 `memory_query` 列在期内的）与 M5 设计 §3.8、ORCHESTRATION §8.3/§8.5、HANDOFF 同一提交。指标的提交方加 `memory`（`MetricsBy`、`METRICS_BY`）。build 0、check-lint 0（eslint 73 / knip 18 / jscpd 1）、`npm test` 0（3203/3203）。
- 两档模型重跑（bb726f1 的构建）：两档模型会话 2 都没有再问，也没有调 `memory_habit`；回复里都说「之前说过不用，不再问」。验收第 2 条成立。记录在 `habit-rule-runs.md` 第二轮。

- bb726f1 之后的探针：运行目录 `2026-11-06T01-20-50-033Z`，426/426（评审第 2 轮 N1：此前只记在图批注 7c13564）。
- 落地（merge 步骤，`wf_b5171bd117c811ba`，2026-11-06）：评审第 2 轮 APPROVED（65c755b）。四次并入 origin/main：1f212e9（5f1e3f3，冲突 `docs/HANDOFF.md` M5 一行取本分支并补评审与合入、M4/M6 两行取 main；`package.json` `test:2` 取两边并集，`design-metrics`、`memory-habit-rule`、`memory-habit-declined` 各一次）、f4d156e（2886eb7，无冲突）、2b4ca51（ed077e4，只有 `docs/graph`）、adb4d9f（9fb5146，只有 `docs/graph`）。并入后规则总表照实再数：`GUARD_RULES` 11（guard 6、graph 1、loops 2、metrics 1、memory 1），`MAIN_AGENT_RULES` 9，并入的改动没有碰 `src/guard/catalog.ts`、`src/rules/builtin.ts` 与 `src/rules/view-build.ts`，`tests/contracts.spec.ts` 的 11 与 9 在合并后的树上照旧成立，测试与文档不用再改。
  - 1f212e9：build 0、preflight 0、check-lint 0（eslint 73 / knip 18 / jscpd 1）、`npm test` 0（3241/3241）、`npm run probe` 433/433。
  - f4d156e：build 0、preflight 0、check-lint 0（73 / 18 / 1）、`npm test` 0（3243/3243）、`npm run probe` 433/433。
  - 2b4ca51：build 0、preflight 0、check-lint 0；`npm test` 第一次 1 项失败（`tests/glm-metrics.spec.ts`「one event per read started」，同一提交单跑 10 次挂 1 次，main 的 `src/glm-llm/quota.ts` 与该测试本分支都没动，是 main 上已有的时序抖动），重跑 0（3243/3243）。
  - adb4d9f：build 0、preflight 0、check-lint 0（73 / 18 / 1）、`npm test` 0（3243/3243）。2b4ca51 与 adb4d9f 相对 f4d156e 只多 `docs/graph`，探针沿用 f4d156e 的 433/433。

未做：
- 桌面版：本节点没有改行组合，改了记忆行的运行行为（`memory_habit` 常驻、记忆行注册 `tools/pre-execute`），合入后由 merge 步骤按 DEVELOPMENT.md §1.1 的 L4 行重启人的桌面版核对，结果在该步骤报告。没有写 `docs/graph`（编排方要求）。
