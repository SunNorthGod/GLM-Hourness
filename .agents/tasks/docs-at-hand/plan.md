# docs-at-hand 实施计划（第 4 件与第 2 件加第 1 件的格式）

版本 0.2（2026-11-07）。依据同目录 `design.md` 0.3（独立评审 APPROVED）。0.1 版计划按设计 0.2（新行 `glm-hourness/docs`、事件加扫描）写，人 02:24 要求融合进现有流程后作废，已废弃的代码没有写出一行。

## 范围

| 批 | 件 | 内容 | 状态 |
| --- | --- | --- | --- |
| 1 | 第 4 件 | 循环板默认条目 `loops.unsynced-daily`（每天 18:05 的 `daily` 时间条目，`tell-main`，只读查 git，干净不出声） | 本轮 |
| 2 | 第 2 件加第 1 件的格式 | 经验行（`src/lessons/`）第二个 `tools/post-execute` 监听器：成功的 `read`、`write`、`edit` 之后合成一条提醒（路径经验、组件 `AGENTS.md` 列的决策与开着的活、DSH 没送时的正文）；格式写进 `ORCHESTRATION.md` §8.7 | 本轮 |
| 3 | 第 1 件的生成部分加第 3 件 | M7 简报、交回 `docs` 一行、批注缺口句、审查清单一条 | 不在本轮：等 M7 合入 main |
| — | U8 补测 | 已加载的子目录文件被外部改动或删除，不触碰也在下一次请求出替换或移除 | 本轮，拿到探针锁时跑，结果写回设计 §1.3、§1.4、§9 |

一件一个提交，合入 main 串行：先第 4 件，后第 2 件。

## 批 1：每日提醒

- `src/loops/defaults.ts`：加默认条目；文件头「four entries」改五项；`src/loops/index.ts` 与 `packages/hourness/cordis.patch.yml` 注释里的条数同改。
- 测试：`tests/loops-registry.spec.ts` 状态表加这一项（它不听事件，始终 `active`）；`tests/loops-bind.spec.ts` 加一例：默认条目经对账得到 `daily` 选择器、文字不含占位符；`tests/loops-model.spec.ts` 已有校验用例，补一例这条默认条目通过 `validateEntry`（插件来源、无 `limits`、无 `quiet`）。
- 文档：`docs/ORCHESTRATION.md` §18.5 默认条目表加一项。
- 不改行为的验证：L3 不覆盖（设计 §7.4）；L4 随批次。

## 批 2：路径提醒并进经验行

文件：

- `src/lessons/docs.ts`（新，纯函数）：`componentOf`、「决策」一节的读法、由图推出的决策与开着的活、提醒渲染与上限、去重键。
- `src/lessons/path.ts`（新）：监听器、读组件文件、读图、读经验账本、DSH 会不会送正文的判定、会话去重、备注 `path`。
- `src/lessons/failure.ts`：`pushedBy` 提到两个监听器共用（由 `index.ts` 创建传入，缺省自建，旧调用不变）；「已说过」读法认 `glm-hourness-lessons-path` 来源的 `lessons` 事实。
- `src/lessons/storage.ts`：`NoteKey` 加 `path`。
- `src/lessons/index.ts`：装上与卸下，装不上写行健康（备注 `path`）。
- 没有新行、补丁条目、locale、`HOURNESS_ROWS`、`packages.mjs` 改动。

L2：

- `tests/lessons-docs.spec.ts`：组件的各种目录形状（根不算、嵌套取最近、Windows 反斜杠与大小写、工作树里的路径）；「决策」一节（`Decisions` 与 `决策` 两种标题、只收 id、重复 id 算一次、没有这一节）；决策的状态呈现（已验证、被取代、被推翻、不在图里、废弃的不列）；写入范围推出的决策与活；渲染逐字比、上限与 `(+N more)`、正文截断；去重键。
- `tests/lessons-path.spec.ts`（经验行的假宿主，复用 `tests/lessons-row-host.ts`）：原生名与别名；组件在工作目录之下、之外、上级；可见历史里没有 DSH 基线时本件送正文；读的是 `AGENTS.md` 本身不带正文；经验与组件文档合在一条提醒里；失败的调用只有失败匹配的提醒、成功的只有路径提醒；去重（可见历史与本进程，含失败匹配说过的经验）；并行调用只带一次正文；「保持文档为真」按会话加组件一次；各条失败预案；带 `parent` 的子调用不看；不在 `read`/`write`/`edit` 的工具不看。`tests/lessons-failure.spec.ts` 不改断言。
- 登记类测试（`tests/lessons-row.spec.ts` 的监听事件集合等）按实际结果核对，不放宽。

L3（`scripts/probe/run-probe.mjs`）：新场景 `glm-lessons-path`、`non-glm-lessons-path`（设计 §5.8，工作区放根 `AGENTS.md`、组件 `AGENTS.md`、种好的图与带文件模式的经验）；四个旧场景（`glm-lessons`、`non-glm-lessons`、`*-failure`）重跑。

文档：`docs/ORCHESTRATION.md` §8.6 加「按路径送到手边」一段，新增 §8.7「组件 AGENTS.md 的格式」；`docs/DESIGN.md` §2.4a 的 `tools/post-execute` 一行；`docs/FACTS.md` §3 加设计 §1.4 的事实行（U8 之后改标注）；`docs/DEVELOPMENT.md` §14 经验命令行一节的 L3 场景名补两个。

## U8 补测

脚本在 `%TEMP%\docs-at-hand-probe\probe-external.mjs`（不进仓库）。拿到探针锁时跑一次，结果改写进设计 §1.3 第 3 条、§1.4 与 §9 U8。

## 门禁与顺序

每批：`npm run build`、`npm run preflight`、`npm test`、`npm run probe`（探针按 DEVELOPMENT.md §1.1 轮流用 `.llm/probe-lock` 与 `.llm/probe-lock-2`；跑探针前在同一条命令里先 `Remove-Item env:GIT_CONFIG_COUNT, env:GIT_CONFIG_KEY_0, env:GIT_CONFIG_VALUE_0`）；棘轮（`npm run lint`）不涨。批 1 合入 main 之后批 2 追 main 再合入。批 2 改的是出厂启用的经验行，会改变桌面版运行时：合入按 DEVELOPMENT.md §5 第 4 条（CDP 关桌面版、持 `.llm/desktop-lock`、见 `#32770` 停下），并按 `norm-review-floor` 评审。批 1 的默认条目同样是已启用行里的新条目，与批 2 同一次桌面步骤处理。
