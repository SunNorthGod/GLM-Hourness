# M7 实施进度（E7 批）

## 接缝批收口 2026-11-04

接缝批（下面「进行中未提交」一节的六个文件）连同编排方审查时的探针修正一个提交收掉。编排方的修正：`run-probe.mjs` 加 `OFF_PEAK_AT`（2026-10-28T10:00+08:00），`glm-exec-plan` 与 `guard-request-worker` 的 extra 行加 `clockRow(OFF_PEAK_AT)`（真实时钟落在 GLM 高峰时规则板 reduce 档把 GLM 子 agent 限为 1，第二次派发 `slots_full`）；`guard-request-worker` 场景改三处（任务 writeScope 改为 `['site/feed.xml']`，`quick` 派发只收至多 2 个文件、不收目录；extra 加 `probeRow(lift.jsonl)` 供 `probe_say`；检查改为 worker-scope 拒绝带编号与 `give ref "`、人「可以」批准记录、grant 记录、worker 第二次写停在 rc.3 的 workspace-write 沙箱、`requests/<ref>.before` 为 `old content\n`）；`probe-llm.mjs` 的 `withRef` 在 user 消息里只认 `give ref "r-…"`（主 Agent 读到的编号在 worker 问题通知里，role user）。`docs/ORCHESTRATION.md` §17.9 补 L3 场景与 `{ref}` 新拼写一句，§17.10 补 `glm-exec-plan` 钉非高峰时钟一句。

合并：`6b14a4d`（origin/main d2ba2a1，docs/graph）、`8b8ab92`（origin/main bc25baa，audit 追加按文件串行、rules-host 临时目录删除重试）。合并后全量门禁（`.llm/logs/m7-seamA2-*.log`）：build exit 0、preflight exit 0、test exit 0（2787 tests / 2786 pass / 0 fail / 1 skipped；eslint 76 / knip 19 / jscpd 1）、probe 395/395 exit 0（`guard-request-worker` 绿，`glm-exec-plan` 全绿；此前两轮的 guard 跟进记录先后序红由 bc25baa 消除）。

下一步：E7 本体（见下面「下一步」第 3 条）。

## 暂停交接 2026-11-04

分支 `m7`，worktree `.worktrees/m3`。origin/m7 = `cffcad4`（E6 批，已推送）。本地领先两个提交未推：`1cb814e`（合并 origin/main fa686fb，docs-only：graph 节点 m7.json + graph.svg）与其上的未提交工作区改动。

**已完成并验证（fa686fb 合并批）**：合并后全量门禁全绿——build exit 0、preflight exit 0、test 2785/2783/0（eslint 76 / knip 19 / jscpd 1，棘轮未动）、probe 394/394 exit 0（`.llm/logs/m7-e7-merge-*.log`）。

**进行中未提交：M4 申报接缝（R4-F10 的 worker-scope 一半，E7 批 rider 1）**，代码完成、测试全绿、未跑探针、未提交。改动六个文件：

- `src/guard/execute-rules.ts`：worker-scope 的工作树外拒绝支先问 `requestsService(ctx)?.peekGrant`（命中放行簿就 `next()` 放给 guard 行消耗，命令记录记 allowed）；`peekGrant` 假则照拒并问 `outsideDenial`——出项目返回 `{ref, exception}` 时纠偏例外句换成返回句、违规记录带 `ref`（`refuse()` 加了可选 ref 参数）；项目内/guard 行不在返回 `undefined` 照 §3.2.1 原样。`openRequests` 未接（rider 2：留给 E8 的 drive，`goals.block` 原因码 `hourness-waiting-human`）。跟进记录器（observe/noteDenial/right-path 结算）未接，随四道门改经 installRuleGate 一起接（m4 设计写明的「改之前」状态，结算记 other）。
- `tests/execute-row.spec.ts`：新增申报接缝一例（假 desk：放行命中的工作树外写入不拒且 peekGrant 被问一次、出项目拒绝带 ref 与 worker 申报句、项目内拒绝原样不带 ref、服务不在照旧由既有工作树外一例兼作对照）；为 jscpd 抽了 `dispatchedWorker` 共享 fixture（原 worker-scope 测试同改用它）。
- `scripts/probe/probe-llm.mjs`：`{ref}` 占位符扫描加第三种拼写 `give ref "r-…"`（m4 §5.2 worker 句；只此一处出现，锚定安全）。
- `scripts/probe/run-probe.mjs`：新 L3 场景 `guard-request-worker`（m4 §14.1 指定的接缝验证：worker 工作树外写入被拒带编号 → ask_main 带编号给主 Agent → 主 Agent request_exception → 模拟人 可以 → answer_worker → worker 原样重调 → peekGrant 放行、guard 行使用时核对消耗）+ checks 数组一条（文件内容、worker-scope 记录带 ref、request approved by human 可以、grant 记录）。
- `docs/ORCHESTRATION.md` §17.9：申报接缝一节（接缝语义、openRequests 归 E8、跟进记录器随 installRuleGate 迁移）+ 测试数 8→9 例。
- `.agents/tasks/m7/design.md`（不入库）：§3.2.1 加「申报接缝」段（0.6 修订 2026-11-04）、§18.2 R4-F10 处置行与版本说明行更新（第 3 条已完成、第 4 条随 E7 的 trunkCheck）。

接缝批的门禁状态：build exit 0；`tests/execute-row.spec.ts` 9/9；全量 `npm test` 在最终树上 exit 0（2786 tests / 2784 pass / 2 skipped；期间一次 `rules-row.spec.ts` 卸载用例 ENOTEMPTY 偶发失败，隔离重跑 57/57、全量重跑通过，与本批改动无关）。**探针未跑**（改动含 execute-rules 运行时行为与探针脚本，L3 必须）。

**下一步（按计划顺序）**：
1. `npm run probe > .llm/logs/m7-e7-seam-probe.log`（探针会跑新场景 guard-request-worker；注意 §5.10：探针运行中不重建该检出）。若 guard-request-worker 红，读 `.llm/probe-runs/<最新>/guard-request-worker/` 的 violations.jsonl 与 human.jsonl 归因（怀疑点：answer_worker 的 `{ask-request:task-1}` 占位符时序、probe_say 的 rpcId 消息在主会话的到达时机）。
2. 探针绿后一个提交收整个接缝批（上述六个文件，提交说明含设计引用 §3.2.1/m4 §5.9/R4-F10 与验证：L2 9 例 + L3 guard-request-worker + 四门全绿），推 origin/m7。
3. E7 本体（见设计 E-series 表）：`check_commit`、`hourness-gate` provider、检查记录 checks.jsonl/result.json、`trunk-advance-checked` 执行前/后（补全 `src/execute/advance.ts`，E1b 的 advanceOk/pushOk/写法分类已在）、advances.jsonl、证据与完成（审查没过先不完成）、`hourness.trunk-advanced`/`hourness.outside-advance`、`trunkCheck`（覆盖规则、后台、服务在时多「草稿区为空」一步——R4-F10 第 4 条）；新建 `src/execute/check.ts`、`gate-provider.ts`；tests/execute-advance.spec.ts、execute-upstream.spec.ts、execute-check.spec.ts；L3 `glm-exec-merge`；文档 ORCHESTRATION §4.7、§14、§17.12（每步同批改的文档清单见设计 §8.1 下的说明行）。全量门禁（build → preflight → test → probe）后推送。
4. 别忘：本地 `1cb814e`（fa686fb 合并）未推，随接缝批一起推上去。

编排方 stop 指令到达时点：全量测试刚跑完（绿），探针未启动，无在途命令。
