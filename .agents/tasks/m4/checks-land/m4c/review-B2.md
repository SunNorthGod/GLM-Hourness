# B2 审查第 2 轮：检查行、`glmHournessEnv` 与循环板接缝，`env.files-edited`（m4-checks）

审查对象：`9af4567`（B2，未推送；`origin/m4-checks..HEAD` 只有这一个提交，父提交 `4da6f93` 为已推的 B1）。它是第 1 轮所审 `1e71d10` 的改写，`git diff 1e71d10 9af4567` 只动了 `docs/DESIGN.md` 与 `docs/ORCHESTRATION.md` 各一行。工作树干净。

## 第 1 轮阻塞项 B2-1 的复核

- 原问题：`docs/ORCHESTRATION.md` §7.5 与 `docs/DESIGN.md` §2.2 env 一行写「读不懂的行进行健康」，代码只把读不懂的检查行与重名收进 `EnvBranch.issues`（`src/env/branch.ts`），`src/` 里没有读取方。
- 现状：两处都改成「读不懂的行与同一节点上重复的名字收进 `envBranch` 的 `issues`（第几条与原因），进行健康随 M4 自带的检查器一批接上」，即第 1 轮给出的改法一。`docs/`、`packages/hourness/cordis.patch.yml`、`src/env/` 里再搜不到声称检查行进行健康的句子。提交信息写明本批不把 `issues` 写进行健康，计划 B4 范围里有这条接线。已解决。

## 改动所及路径的复核

改动只是文档措辞，不进 build 与 preflight。代码、测试与探针场景与第 1 轮相同；第 1 轮的结论（checks #6、#7 与 #2 的 shell 一半成立，`run.ts` 未改，`checksSeam` 经 `createProjectRuntime({ checks })` 接上，`installContribution` 保持图行的行为与文字，`loops-registry` 的导入边界只放行 `index.ts -> ../env/env-service.ts`，行仍为 `disabled: true`）本轮重读源码后仍成立，没有新的阻塞项。补核的两点：

- `editedSince` 遇到没有结果的调用即停。DSH 会给中断的调用补一条结果（`reference/deepseek-harness/packages/core/session/src/repair.ts` 的 `interruptedTurnClosers`），所以读取不会永远卡在一条调用上。
- 重启后没有 notice 也没有内存水位时，可见历史里的改动会重读一次、重发一次事件。这是计划差异 3 已写明并接受的取舍，env 行出厂禁用，不作阻塞。

## 推送闸门

`8c9d74f` 是 origin/main（`d0b96fa`）的祖先；分支含合并提交 `4516ec6`，其第二父 `a9adca8` 在 origin/main 上，且包含 `fe6342f Merge origin/loops-runner into main`。分支落后 origin/main 的提交都是 docs/graph 与视频，与本批无关。

## 门禁证据（读日志，未重跑）

第 1 轮修改之后的整链（`.llm/logs/m4c-B2r1-*.log`）：

- build：tsc 四个工程与 build-ui 无错。
- preflight：`OK (… dsh-hourness 13 rows; 18 rows composed …)`。
- npm test：各段 `# tests` 合计 2773，`# fail` 合计 0，跳过 1，没有 `not ok` 行；eslint 76 suppressed、knip 19、jscpd 1，都没升。
- probe：`351/351 passed`，没有 FAIL 行；`env-check-command` 四条与 `env-notice` 三条全过。

第 1 轮之前那次整链（`m4c-B2-*.log`）里 `tests/loops-run.spec.ts` 有一次计时失败，单独重跑 3 次都是 23/23，符合抖动规则；本轮整链不用重跑。

## 结论

APPROVED：B2-1 已按第 1 轮改法一解决，没有剩余阻塞项。

## 非阻塞记录（沿用第 1 轮，供 B4 参考）

- `src/env/parsers.ts` 的 `Finding` 没有计划写的 `source` 字段，B4 的提醒行需要时再加。
- `checkCommandOf` 不带 `check` 时按读得懂的行数判「只有一条」；`run.ts` 的 argv 比对仍能拦住命令变化。
