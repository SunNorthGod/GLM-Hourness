# rules-r4d 实施计划

节点 `rules-r4d`（项目图），2026-11-07 开工，基点 origin/main `54a40775`，分支 `rules-r4d`，工作树 `.worktrees/rules-r4d`。

## 1. 现状（实读，main 54a40775）

| 项 | 现状 |
| --- | --- |
| `checkCall`（`src/rules/check.ts`） | 已有；脚本规则一律当「未批准」（`judge` 的 `approved` 没有调用方），按 `onError` 判，`scripts` 列 `refused` |
| `judge`（`src/rules/judge.ts`） | 已有 `JudgeOptions.approved`、`pending`（批准的脚本待跑）、`refused`；脚本跑不跑归调用方 |
| 工具调用门（`src/rules/gate.ts`） | 调 `judge` 不带 `approved`，不跑脚本 |
| 共用执行器（`src/loops/script.ts`） | `runScript` 只有 `purpose: 'work'`：哈希核对、私有副本、结束进程树、`signal`；没有 `gate` 队、没有 `late` |
| 提议一路 | 没有：无 `proposals` 集合，无 `rules_propose`，`RulesService` 只有 `declaration`，`/rules accept\|reject` 无，`scriptDetail` 不存在 |
| M3 一侧 | 已有：`src/design/attach.ts`（`AttachService`、`ATTACH_BOARDS` 为空表）、`propose_to_human` 的 `attach`、`record_human_answer` 的原文核对与 `handBack` |
| 模型 | `scripts` 钉住（`ScriptPin`）、规则的 `ScriptAction`、`unapprovedScripts`、仓库规则文件 `docs/rules/rules.json`（`repo.ts`）已有；仓库里的脚本文件的写入与 `proposals` 没有 |
| M3 附录 0.6 的请求 | 图 `rules` 节点 2026-10-31T20:01Z 的批注（a）–（e） |

## 2. 做不做

- 做：§9.3 改稿；R3（`rules`、`lift`、`switch`、`peak-mode`、`remove`、`repin` 六种提议，`rules_propose`、服务成员、`/rules accept|reject`、对照补写、脚本钉住与脚本文件写入）；R4d 中 `checkCall` 一路（执行器 `gate` 队、批准脚本的执行、退出码映射、`onError`、违规流水带规则 id）；m6-script-gate 第 24 条。
- 不做（不在节点指令里，随各自的块）：`detector` 提议（R6 的检测器运行者）；工具调用门里跑脚本、`late` 后台与晚到的拦下、`notices` 的投递（门接线，要 L3 与 L4）；`staleEntries`（周报，M7）；`trunkAdvanceFor`（等 M7）。
- 门里仍不跑脚本时的状态：门判脚本规则为「未批准」，按 `onError` 放行或拦下，文字写明原因。这一点在 ORCHESTRATION §16.6 写明。

## 3. 批次

每批一个提交（文档与行为同批），先写会失败的测试。

| 批 | 内容 | 文件 | L2 / L3 |
| --- | --- | --- | --- |
| B0 | 规则板设计 §9.3 改稿（M3 附录 0.6 的（a）–（e）），设计评审最多两轮 | `.agents/tasks/rules/design.md` | 无代码 |
| B1 | 模型：`proposals`、六种提议的形状与校验，操作 `propose`、`proposal-accept`、`proposal-reject`、`proposal-show`、`proposal-close`，权限表，规划函数，`applyRecord` | `src/rules/model.ts`、`entries.ts`、`request.ts`、`permissions.ts`、`plan.ts`、`store.ts`、新 `proposal.ts` | `tests/rules-proposal.spec.ts`：校验、规划、重放、权限 |
| B2 | `scriptDetail`、`rules_propose`、服务成员（`attachable`、`proposalLine`、`acceptProposal`）、`ATTACH_BOARDS` 行、对照补写、`/rules accept\|reject`、脚本文件写入（§7.4 第 7a 步）与 `repin` | `src/loops/script-detail.ts`、`src/rules/tool.ts`、`service.ts`、`proposal.ts`、`accept.ts`、`commands.ts`、`index.ts`、`repo.ts`、`src/design/attach.ts`、`src/shared/tool-names.ts` | `tests/rules-propose-tool.spec.ts`、`tests/rules-accept.spec.ts`（真图引擎与真 M3 工具）；L3 改规则行：`npm run probe` |
| B3 | 执行器 `gate` 队；`checkCall` 跑批准的脚本；退出码映射；`onError`；`HOURNESS_BOARD` 递归保护；违规流水带规则 id | `src/loops/script.ts`、`src/rules/check.ts`、新 `script-run.ts`、`judge.ts`（`approved` 由钉住算） | `tests/rules-script.spec.ts`（真进程：退出 0、2、3、1、超时、被改、不在）；`tests/loops-script.spec.ts` 加 `gate` 队 |
| B4 | m6-script-gate 第 24 条的用例（真 `checkCall` 加假 `runScript`，`gateOnRules`） | `tests/rules-gate.spec.ts` | L2 |
| B5 | 文档同步：ORCHESTRATION §16.6、§16.9–§16.11、§18、DEVELOPMENT §13、HANDOFF；评审（`norm-review-floor`：脚本执行属于会拦住动作的代码门） | `docs/` | |
| B6 | 合入 main；M7 一段（`trunkAdvanceFor`）看 main 里是否有，没有就批注待 M7 | | |

## 4. 等 M7 的一段

接法（M7 的 `trunkAdvanceFor(callId)` 在 `src/execute/` 合入 main 之后）：规则板的 `gate.trunk-advance` 事件由执行行在主干前进的那一步经 `trunkAdvanceFor` 取调用号，交 `checkCall` 的同一条脚本路径；失败默认由事件声明的 `gateOnErrorDefault: 'block'` 取（`judge` 已按事件取默认）。本批只留事件表里的声明与 `judge` 的默认，不建调用方。

## 5. 门禁与锁

`npm run build` → `npm run preflight` → `npm test`；B2 起碰运行时路径加 `npm run probe`（按 §1.1 取 `.llm/probe-lock` 或 `.llm/probe-lock-2`，建得了才跑）。棘轮（eslint、knip、jscpd）不涨。

## 6. 进度

（随批次更新）

- 2026-11-07 01:50 开工：工作树、节点状态 doing（`c3866429`，已推 origin rules-r4d）。
- 2026-11-09 追 main（M7 已合入，`fb88f941`，合并提交 `9219edb6`：package.json 测试链取并集、ORCHESTRATION 保留 §16.15/§16.16 加 main 的 §17 头、graph.svg 重渲染），随后接上 §4 等的那段：`src/rules/gate.ts` 在 `next()` 返回之后读 `glmHournessExecute.trunkAdvanceFor(exec.callId)`，读到才推 `gate.trunk-advance`（rules 设计 0.11 §6.2 第 4 步、§6.6；M7 对手件 `src/execute/advance.ts` 的 `installTrunkGate`，:1429 记、:1619 读、`src/shared/execute-service.ts` 的 `executeService` 契约读法）；带脚本规则在门里仍不跑，事件声明的失败默认（拦下）决定不跑的判法。L2 `tests/rules-gate.spec.ts` 加五例：交了前进才推并记流水、没交不推、服务形状不对按不在、trunk-advance 上脚本默认拦下、tool-call 上默认放行对照。ORCHESTRATION §16.11 第 3 步、遗留清单、§16.16 标题与「没有做」、§17.12 括注、`execute-service.ts` 头注释同批改。
