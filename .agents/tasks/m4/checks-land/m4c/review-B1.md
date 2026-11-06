# B1 审查：规则板的流水按项目写（m4-rules 余项）

审查对象：`4da6f93`（B1），连同分支上未推送的 `f43fa1f`（计划与 impl-progress）。基线 `4516ec6`（合入 origin/main）。

## 对照计划与设计

- 设计 §3.2（:376、:538）要求规则板的记录经 `projectJournal` 写进会话所在项目。`src/rules/index.ts:256` 现为 `projectJournal(name, cwd => projectHomeFor(ctx, config.home, cwd))`，与 guard、graph、loops、design 行同一写法；`rowJournal`、`dataHomes` 导入已删，knip 19 未升。
- `src/rules/gate.ts`：`GateDeps.journal.violation(record, cwd)`，签名与 `ProjectJournal.violation` 一致；`note()` 传 `cwdOf(agent)`，跟进记录的 `hookJournal` 闭包传同一次调用的会话 cwd。`cwdOf` 读会话头不抛，读不出给 `undefined`，`projectHomeFor` 退回数据行的 `projectHome`（三级次序见 `src/data/project-home.ts:22-27`）。未加 `flush`，与计划差异 9 一致，改动前也没有。
- `projectJournal('rules', …)` 是本行独立的实例，与 guard 行的 `rowJournal` 实例各自追加同一文件，形同改动前（改动前规则板也有独立的 `rowJournal`）；没有新增并发面。
- 跟进记录：guard 门与规则门都按会话 `hookJournal`。改动前规则门挂上的闭包写数据行目录，guard 门的写会话项目；改动后两者落同一项目，消除了跟进记录随挂钩顺序落到不同目录的差别。
- L2：`tests/rules-gate.spec.ts` 新例用两个临时 git 仓库，各自 `.llm/audit/violations.jsonl` 恰有自己那条，数据行的目录（`<root>/data/.llm`）为空；断言能区分改动前后（改动前记录落数据行目录）。原有 fixture 的 `DATA_SERVICE.projectHome` 与会话项目的 `.llm` 同路径，原用例语义不变。
- L3：`scripts/sandbox.mjs` 的 `dataRows` 给 rules 行配运行目录的 `home`（计划差异 10）。探针的 `glm-rules`、`non-glm-rules` 从 `<runDir>/<场景>/home/audit/violations.jsonl` 读，改动前规则板写数据行 `projectHome`（同一目录），读取路径与检查不变。`run-calibrate.mjs` 也用 `dataRows`，规则记录同样仍落运行目录。
- 文档：`docs/ORCHESTRATION.md` §16.11 违规流水一句与 L2 清单、`docs/DESIGN.md` §2.4 行列表同批改。计划写的是「§18 约 :1514」，实际该句在 §16.11（:1514），改的是对的句子。
- `f43fa1f` 带入的 `impl-progress.md` 与 `.worktrees/m4` 里未提交的版本 blob 相同（`47c308d`）；任务要求的「带进第一个提交」成立。

## 门禁证据（读日志，未重跑）

- 日志时间晚于全部改动文件的修改时间（文件最晚 20:40:18，build 20:40:32）。
- build、preflight 日志无错；`npm test`（`m4c-B1-test.log`）2747 测试、2746 过、0 败、1 跳过；eslint 76 suppressed、knip 19、jscpd 1，未升。首轮 `tests/loops-run.spec.ts` 计时失败，单独重跑 3 次 23/23，全量重跑绿，符合抖动规则。
- 探针（`m4c-B1-probe.log`）347/347；首轮 345/347 为宿主文件替换 EIO（Win32 1175），不在本改动路径，全量重跑绿。
- 推送闸门：origin/main 上 loops-runner 的合并 `fe6342f` 已在 HEAD 祖先里；`8c9d74f` 是 origin/main 的祖先。origin/main 此后又前进了（只要求基于含该合并的 main，不构成阻塞）。

## 结论

没有阻塞项。APPROVED。
