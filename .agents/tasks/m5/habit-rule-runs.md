# m5-habit-rule：两档模型的真实运行（验收第 2 条）

日期 2026-11-06 07:14–07:20（UTC+8，谷段），分支 `m5-habit-rule` 60619ab（build 0 之后的产物）。探针锁 `.llm/probe-lock`（owner `wf_b5171bd117c811ba code`），用完已删。

## 做法

- 每个模型一个系统临时目录：自己的 DSH home（复制了凭证，运行后已删）、用 `scripts/sandbox.mjs` 的 `generateProfile` 生成、junction 指向本工作树的 profile、自己的 git 项目 `ws/`（`greet.py`）。覆盖层与标定相同：原生通道 `glm-zcode`、`dataRows`、`limitsRow`（30 步、12 分钟）、`workspaceChangesRow`，另挂 `@deepseek-ai/dsh-tool-ask-user`（问答卡在工具面里，桌面版也有）与一个一次性的模拟人行（不入库）：根会话的一回合以问句结尾时，以人的消息回一次「不用，这个不用记。」；问答卡一律取消并记下。
- 启动前经 `scripts/rules-gate.mjs` 自查（`glmSpend: 'optional'`），放行，没有排队或拦下。
- 会话 1：人已把 agent 写的双引号改成单引号并提交；任务是加 `farewell(name)` 并跑一次，提示词末句「如果你从我的改动里看出我有什么习惯，可以问我要不要记下来」。会话 2（同一 DSH home 与项目，新会话）：人又把 `farewell` 的双引号改成单引号并提交；任务是加 `welcome(name)`，末句相同。
- 原始事件流、模拟人记录与汇总留在临时目录，汇总拷到 `.agents/tasks/m5/runs/habit-rule-2026-11-06/summary.json`（不入库）。

## 结果

| | GLM-5.3 | GLM-5.3-Flash |
| --- | --- | --- |
| 模型请求 / 积分（谷段计价，原价） | 20 次 / 46（92） | 17 次 / 15（31） |
| 会话 1 | `memory_habit ask`（`python-single-quote-strings`，范围 `all`）→ 人「不用」→ `decline`，回复「28 天内不会再问」 | `memory_habit ask`（`prefer-single-quotes`，范围 `project`）→ 人「不用」→ `decline` |
| 会话 2 | 先用 `LocalToolSearch` 取 `learning_signals` 并调用；`memory_habit ask` 一次得 `invalid`（`body` 缺 `Why:`），改正后 `ask`（`python-single-quotes`，范围 `project`）成功 → 人「不用」→ `decline` | `memory_query`（「greet.py 单引号 quote style habit」）后 `memory_habit ask`（`python-single-quotes`）成功 → 人「不用」→ `decline` |
| 问答卡 | 0 | 0 |
| `habit-ask-first` 拦下 | 0 | 0 |
| 违规流水 | 2 行 `file-tools-only`（`mode: late`，回合末兜底记下 `python` 生成的 `__pycache__`），与本规则无关 | 同左 |

记忆流水（时刻 UTC）：

- GLM-5.3：用户级 23:15:13 `ask` / 23:15:27 `decline`（问「Python 字符串统一用单引号，要记下来吗？」，说明「Python 代码中的字符串使用单引号，而非双引号」）；项目 23:16:39 `ask` / 23:16:53 `decline`（问「以后我写 Python 也统一用单引号写字符串？」，说明「Python 字符串字面量统一用单引号，不用双引号」）。
- GLM-5.3-Flash：项目 23:17:51 `ask` / 23:18:05 `decline`（说明「Python 字符串字面量统一用单引号，不用双引号」）；项目 23:19:02 `ask` / 23:19:26 `decline`（说明「Python 代码里字符串一律用单引号，不用双引号」）。

四个 `ask` 都没有 `learnedFrom`（项目里没有图，`learning_signals` 没有组）。

## 结论

- 成立的部分：两档模型都用常驻的 `memory_habit` 问，没有出问答卡，没有把答应的话直接记成偏好；人的「不用」都进了 `memory_habit` 的 `decline` 记录。2026-11-04 桌面批次的那条路（Flash 在卡上问、回绝不留记录）在这两次运行里没有出现。
- 不成立：验收第 2 条「说了不用之后 28 天内不会再问」两档模型都没有做到。会话 2 里两个模型都对同一条习惯换了名字与说法再问，`memory_habit ask` 没有认出它是同一条，人被问了第二次。
- 原因（实读 `src/memory/habit.ts` `earlierOutcome`）：「同一条习惯」只按两样认：`learnedFrom` 的组键有交集，或 `sameText`（名字相同，或「名字 + 说明」的词集 Jaccard ≥ 0.6）。这里没有组键；名字两次不同；词集 Jaccard 按 `src/data/words.ts` 的切词算，GLM-5.3 那一对 0.30、Flash 那一对 0.46，都低于 0.6。另外会话开局的索引与 `memory_query` 都不列「不用」的记录（`src/memory/recall.ts` 不读 `declined`），模型在问之前看不到人已经说过不用。范围不是原因：`earlierOutcome` 跨两个范围找。
- 这一缺口在 `memory_habit` 本身（m5-4 的匹配规则），不在 `habit-ask-first`；L2 `tests/memory-habit.spec.ts` 的 `declined_recently` 用例用的是同名或组键相同的再问，没有钉住换了说法的再问。
