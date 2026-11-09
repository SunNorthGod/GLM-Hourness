# rules-r4d 收尾评审（合 main 后、接线 trunkAdvanceFor、门禁）

评审对象：分支 `rules-r4d` 对 `origin/main`（`d7a9f953`）的全部差异，对照 rules 设计 0.11（`.agents/tasks/rules/design.md`）与节点实施计划（`plan.md`）。评审时间 2026-11-09。

## 结论

**可以请编排方合入**。设计 0.11 的每一条要么已实现、要么按 `plan.md` §2 的范围说明留待各自的块；本 run 把等 M7 的 `trunkAdvanceFor` 接缝接上了（plan.md §4 的那一段）。评审发现两处问题，均已处置（见「发现」）。

## 对照设计 0.11 逐条

| 设计条目 | 状态 | 证据 |
| --- | --- | --- |
| 0.11 第 1 条：提议改 `form: 'recommend'` 一问，`RULES_PROPOSE_EXAMPLES` 与 L2 重写，`rules_propose` 英文换文 | 已实现 | `src/rules/propose-tool.ts`：`MESSAGES` 三种（graph/board/subagent，答（a）（b）（c）），`RULES_PROPOSE_EXAMPLES` 两个示范按一问重写；`tests/rules-accept.spec.ts` 覆盖工具与两个例子 |
| 0.11 第 2 条：受影响小节的「四行」等说法同改 | 已实现 | `design.md` 本分支 diff 55+/53-，§0/§1.4/§9.3/§10.5/F14/F15 等处改为 `recommend` 一问 |
| 0.11 第 3 条（（e））：`MAIN_AGENT_RULES` 九条，`design:main-agent-graph-delegations` 入目录、`graph-options` 改标题，条数不进契约测试 | 已实现（main 侧 m3 已落码，本稿改文档对齐） | `src/guard/main-agent-rules.ts` 九条（含 `GRAPH_DELEGATIONS_RULE` 与改题后的 `GRAPH_OPTIONS_RULE`）；`src/rules/builtin.ts:139` 从表映射 |
| R3（§9.3、§7.2、§7.4）：六种提议、`rules_propose`、服务成员、`/rules accept\|reject`、对照补写、脚本钉住与文件写入、`repin` | 已实现 | `proposal.ts`（六种、20 张 open 上限、脚本换 `{file, sha256, lang}`、describe/cautions，含 F88 remove 按存量、F89 无筛选注明多常跑）、`accept.ts`（`attachable`/`proposalLine`/`acceptProposal` 只信图、`reconcile` 三种结局）、`plan.ts`（六个操作、`SHOWN_VALID_MS` 30 分钟两次 accept、`PROPOSAL_KEPT_MS` 30 天清理、replaces 同次转 `superseded`）、`engine.ts`（脚本文件先于记录写，git 忙回 `io`，`repo.ts` 的 `GIT_MARKERS`）、`src/design/attach.ts` 的 `ATTACH_BOARDS` 首行、`src/rules/index.ts` 的 `RECONCILE_MS` 60 秒。L2 `tests/rules-proposal.spec.ts`、`tests/rules-accept.spec.ts` |
| R4d 的 checkCall 一半（§6.7、第 24 条）：`gate` 队、批准脚本执行、退出码映射、`onError`、递归保护、违规流水带规则 id | 已实现 | `src/loops/script.ts`（`GATE_*` 常量、`enterWithin` 队、等待算进超时、封顶 30 秒、到时结束进程树、aborted 答 `refused`）、`src/rules/script-run.ts`（0/2/3/其余的映射、writes 筛选拦下不排队、500 码点去控制字符、先拦下先收并中止其余）、`src/rules/check.ts`（`HOURNESS_BOARD=rules` 递归保护、`combine`、`scripts` 带 `file` 与 notes）、`judge.ts` 的 `approved` 由钉住算。L2 `tests/rules-script.spec.ts`（真进程）、`tests/loops-script.spec.ts`、`tests/script-gate.spec.ts`（第 24 条） |
| F84：仓库带来的脚本要有图上拍板才跑 | 已实现（0.9/0.10 范围，随本分支的读入路径） | `tests/rules-script.spec.ts` 与 `tests/rules-store.spec.ts` 覆盖恢复一路；ORCHESTRATION §16.16 记载 |
| §4（plan.md）等 M7 的那段：`trunkAdvanceFor` | **本 run 接上** | `src/rules/gate.ts`：`next()` 返回之后读 `executeService(ctx, warn)?.trunkAdvanceFor(exec.callId)`，读到才推 `gate.trunk-advance`；行不在/无 callId/没记下前进都不推。对手件（main `fb88f941` 起）：`src/execute/advance.ts` 的 `installTrunkGate`（:826，成员 `trunkAdvanceFor` :828），前进在执行门自己的 pre-execute 里按 callId 记（:1429 `remember`）、:1619 读出，`src/shared/execute-service.ts:46` 的契约注明「Recorded before the inner pre-execute listeners run」。头注释带 file:line 引用。事件声明的 `gateOnErrorDefault: 'block'` 决定门里不跑脚本时的判法（`judge.ts` 的 `refusal` 按事件取默认）。L2 `tests/rules-gate.spec.ts` 加五例 |
| 不做（随各自的块）：detector 提议（R6）、门里跑脚本、`late` 后台与晚到拦下、`notices`、`staleEntries`、超时的实测维护 | 留待，理由在 `plan.md` §2 与 ORCHESTRATION §16.16「没有做」；`prepareProposal` 对 `kind: 'detector'` 明确拒绝 | 同左 |

## 发现

1. **（已修）`src/rules/check.ts` 的 `runScript` 注释被断行损伤**：`default the shared executor's \nunScript` 把标识符劈成两半、前一行尾带空格，是 R4d 批次写坏的一处文档注释（不影响行为，eslint/knip/jscpd 都不拦）。本 run 原样修复；用「行尾小写字母+空格」的同一模式扫了分支改过的全部 src/tests 文件，无同类残留。
2. **（环境，非代码）探针首趟瞬态崩溃**：14:35 的一趟在第一个场景 `glm-no-dialect` 的 `git init` 失败即退（`scripts/sandbox.mjs` 的 `initRepo` spawnSync 非 0）。当时无 `GIT_CONFIG_*` 污染（env 三查为空），同一目录事后手工复现同一 spawnSync 成功，判为 Windows 瞬态（本机有过同类 EIO 记录，HANDOFF §179 的 2026-11-05 事故行）；14:47 重跑正常起步。
3. **（观察）14:51:48 出现第二个探针 run**（临时目录 `...14-51-48-932Z-2xuJcO`，两个 `node scripts/probe/run-probe.mjs` 进程），主检出的 `.llm/probe-lock`、`probe-lock-2` 都没有它的锁（本车道持 `probe-lock`，owner.txt 在）。两趟并发在「两把探针锁」的硬限制之内，本车道不动别人的进程；合入与否不受影响，但编排方值得知道有车道没按 §1.1 持锁。

## 门禁（46cc2e1b 之上，工作树含本批修复）

- `npm run build`：exit 0（`.llm/logs/r4d-build2.log`）。
- `npm run preflight`：exit 0，目录表 2 包 16 源目录 21 行（`r4d-preflight2.log`）。
- `npm test`：exit 0，217 个 spec、3582 用例、0 失败；逐字门禁 502 段 0 已知偏差；eslint 压制 73 = 基线、knip 18 = 基线、jscpd 1 = 基线（棘轮 73/18/1 不涨）；gitleaks 无发现（`r4d-test2.log`）。
- `npm run -s probe`：**exit 0，553/553 通过**（14:47 起跑、约 40 分钟；持 `.llm/probe-lock`，日志 `.llm/logs/r4d-probe-2.log`，退出码 `r4d-probe-2-exit.txt`；含 main 带来的 execute 共存、ablation 围栏与 docs-at-hand 场景）。探针跑完后在本提交上重跑 `npm run build` exit 0，`git status --porcelain --untracked-files=no` 为空。

## 提交

- `9219edb6` merge: main into rules-r4d（M7 执行行、测试链并集 107+115、探针文档并集、ORCHESTRATION 保 §16.15/§16.16 加 main §17 头、graph.svg 重渲染两次）。
- `46cc2e1b` merge: main（docs 批次合入状态、execute 行 locale 出厂启用的文案）。
- 本批（接线 + 文档 + 评审 + 注释修复）：见 `git log` 顶上一条。
