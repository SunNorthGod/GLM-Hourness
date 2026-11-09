# lessons-enable 第 3 步：独立评审（2026-11-06）

评审对象：`origin/main...lessons-enable`，一个提交 `bad85a49`（"feat: ship the lessons row enabled"），基点 `80f62ab`（merge-base 与 `origin/main` 相同）。8 个文件，+24 −11。没有重跑任何套件；门禁结果读自提交说明。

## 核对

| 项 | 结论 | 依据 |
| --- | --- | --- |
| 翻开行 | 满足 | `packages/hourness/cordis.patch.yml`：`glm-hourness/lessons` 块删掉 `disabled: true`，`inject: [tools]` 保留；注释改写为出厂启用、四个 L3 场景已过、桌面版首轮还欠 |
| L2 钉住出厂启用 | 满足 | `tests/lessons-row.spec.ts:312` 新测试：只截 lessons 行块（到下一个 `    - id:`），断言 `name: dsh-hourness/lessons`、没有 `disabled:`、有 `inject: [tools]`；与 `tests/rules-row.spec.ts:382`、`tests/loops-registry.spec.ts:749` 同形 |
| L3 出厂启用断言 | 满足 | `scripts/probe/run-probe.mjs:3536`：不带覆盖的启动场景 `glm`（:385）、`non-glm`（:573）的 `glmHealth`、`plainHealth`（:2468–2469）里 lessons 不是「未加载」。`LESSONS_ROW` 覆盖（:1941，`disabled: false`）保留，四个经验场景照旧显式打开，结果与出厂一致 |
| lessons-3 (a)–(c) | 已满足，本批不改页面代码 | 审计 `audit.md` 所列 L2 与 2026-11-05 隔离实例 L4；本 diff 不碰 `ui/src/lessons/` |
| lessons-3 (d) | 按设计读法满足 | `ui/src/lessons/board.ts:25` `available` 为两投影有一个即真，与 M5 设计 §4.7「两者有一个就算」一致；行翻开后出厂组合里两种读法结果相同。审计已记为不改，属已批准的读法，不算发现 |
| 启用门的桌面版首轮 | 按已批准计划处理 | 简报要求本批翻开，桌面版首轮由人随后在真实 profile 上做，不过就新提交改回禁用；DESIGN、ORCHESTRATION、HANDOFF、注释都写明「还欠」 |
| 文档同批 | 满足 | DESIGN 行表与故障表、ORCHESTRATION §8.6 标题、HANDOFF 行表与 M5 行、DEVELOPMENT §14 第 5 条（补两个失败场景）、`packages/hourness/README.md` 行表；旧条款整条重写。在工作树 `docs/*.md`、README、preflight 与 contracts 规格里检索 lessons 与「禁用/disabled」，没有残留的出厂禁用说法（`docs/graph/` 的历史批注是记录，不属本批） |
| 门禁 | 齐全 | 提交说明：build、preflight、test、`check-lint` 退出码 0；eslint 73 / knip 18 / jscpd 1，与基线相同，没有上升；`npm run -s probe` 退出码 0，437/437；经验相关 27/27（glm-lessons 7、non-glm-lessons 7、glm-lessons-failure 6、non-glm-lessons-failure 6、新断言 1） |
| 编码 | 满足 | 8 个改动文件都是 UTF-8 无 BOM |
| 额外行为 | 无 | 没有超出简报的改动 |

## 发现

没有挡路发现。
