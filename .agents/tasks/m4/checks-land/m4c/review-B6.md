# 审查：B6（m4-checks）env 行出厂启用

提交 `63388d5`（本地，未推送；`origin/m4-checks` = `f1b518f`）。分支上没有其他未推送提交。

## 范围对照（checks-plan.md §2 第 6 批）

- `packages/hourness/cordis.patch.yml`：`glm-hourness/env` 去掉 `disabled: true`，保留 `inject: [tools]`、`config: {}`；注释列出六个已过的 L3 场景（计划写四个，后两批加的 `env-checks-timeout-run`、`env-checks-ceiling` 也列上，更准确），并写明桌面版首轮验收（设计 §13.4）仍欠，与 design 行的先例一致。
- 文档同批：DESIGN §2.2 env 行改为「默认启用（2026-11-05 起）……桌面版首轮验收仍欠」；ORCHESTRATION §7.1、§7.5 末句、§18 标题与导语三处把「出厂禁用、生产上仍是 check-missing」改成「默认启用，禁用时才 check-missing」。`env 行没启用时……check-missing`（§7.5）在启用后仍是真话，保留正确。HANDOFF、README 里没有 env 行出厂禁用的说法。
- 测试：`tests/contracts.spec.ts` 钉住 env 行没有 `disabled` 键；计划预计的其他测试（行登记、health 禁用行清单）没有因启用而失败，不需要改。
- 探针：`run-probe.mjs` 只改了 `env-notice` 一段注释；差异 40 记录了「没有场景期望因此改变」，与 366/366 的日志一致。

## 计划外的改动：压制注释计数的目录（差异 39）

`src/env/index.ts` `installWork`：流水目录从 `join(root, '.llm')` 改为 `dataService(ctx)?.projectDirOf?.(cwd) ?? join(root, '.llm')`。

- 生产行为不变：`dataServiceFor`（`src/data/index.ts:43`）在没有 `projectOverride` 时返回 `projectDirOf(cwd)` = `join(projectOf(cwd).root, '.llm')`，与原来的 `join(root, '.llm')` 是同一路径；`root` 有值时 `cwd` 必为字符串，`projectDirOf` 不会返回 `undefined`。
- 改的理由成立：启用后探针里 cwd 在本仓库工作树的会话会装 env 行，`projectOf` 把工作树归到主检出，计数会写进主检出 `.llm/audit/`，违反任务约束「除探针锁外不往主检出写」。探针经 `scripts/sandbox.mjs` `dataRows` 设 `projectOverride`，改后落在运行目录。
- 实读核对：主检出 `.llm/audit/suppressions.jsonl` 最后修改 2026-11-05 02:10:57，早于 B6 探针（09:21–09:30）；主检出没有 `.llm/env-checks/`；`.git/info/exclude` 最后修改 2026-11-03，已含 `.llm/`，没被追加。
- 检查器的 `timing.jsonl`、`limits.jsonl`、日志仍取 `projectHomeFor`（差异 2）。本仓库图上没有 `env` 节点，工作树会话没有检查行，`prepare`/`sweepCheckLogs` 只在有检查要跑时才调用，不写主检出。成立。
- L2：`tests/env-suppressions.spec.ts` 新例在假宿主上提供带 `projectDirOf` 的数据服务，钉住计数落在 override、仓库 `.llm/audit` 不存在。

这一改动是启用的必要配套，没有加设计没要求的行为。

## 门禁证据（提交信息与 `.llm/logs/m4c-B6-*.log`，未重跑）

- build 09:08:41 exit 0；preflight exit 0（18 rows composed）；`dist/env/index.js`（09:08:39）晚于最后一次源码改动（09:03:51），含 `projectDirOf` 那一行。
- npm test 09:17:52：日志里 `# fail` 全为 0，新例 `ok 6` 在日志里；棘轮 `eslint: ok (76 suppressed)`、`knip: ok (19 in the baseline)`、`jscpd: ok (1 clone(s) ...)`，均未上升。
- probe 09:30:01：`probe: 366/366 passed`，无 FAIL 行；`env-notice`、`env-check-command`、`env-checks`、`env-checks-timeout` 各项 PASS。
- 提交信息说明了一次与重建重叠导致的红，并以顺序重跑为准；日志时间戳与之相符。

## 推送闸门

`status.json`：`mainMerged: true`，`mainMergeCommit` = `4516ec6`（含 loops-runner 合并）。B6 基于它，满足「推送前已基于含该合并的 main」。

## 结论

没有阻塞问题。批准。

`docs/graph` 的节点记录按任务约束归编排方，本步不写。
