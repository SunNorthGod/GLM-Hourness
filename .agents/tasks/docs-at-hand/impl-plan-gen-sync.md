# docs-at-hand 实施计划：生成（docs-at-hand-gen）与同步核对（docs-at-hand-sync）

依据：两个节点的验收（`docs/graph/nodes/docs-at-hand-gen.json`、`docs-at-hand-sync.json`）、设计 0.3 §4.4（第三行）、§6、§11 第 3/4 步、§6.4 验证。基线：origin/main `31d32a44`（M7 与 rules-r4d 已在）。

## 批次

| 批 | 节点 | 内容 | 文件 |
| --- | --- | --- | --- |
| 1 | gen | worker 简报约束栏的组件文档一句；裁剪次序排在经验之前（Truncation 加 `docs`，裁时整行不出现）；派发侧算写入范围碰到的组件 | `src/lessons/docs.ts`（`scopeComponents`，`componentDirOf` 抽出共用的向上走法）、`src/execute/brief.ts`（`BriefInput.docs`、约束行、`Truncation`）、`src/execute/dispatch.ts`（worker 派发时以工作树里的 `AGENTS.md` 存在性算组件） |
| 2 | sync | 交回 `docs` 可选字段与语义检查；交回处理算缺口、批注 `Docs:` 行、算不出时「文档缺口没算成」+ degraded；审查简报带交回的 docs 行与审查清单一条（逐字） | `src/execute/schemas.ts`（`HANDBACK_SCHEMA.docs`、`handbackProblems`）、`src/execute/attempts.ts`（`HandbackComment.docs`、渲染与回读）、`src/execute/handback.ts`（worker 交回直接读 `git diff --no-renames --name-status` 一次给底板与缺口共用；按 head 提交 `entryAt` 预判组件；缺口行；通知带同一批行）、`src/execute/brief.ts`（`ReviewBriefInput.handback.docs`、审查清单一条）、`src/execute/dispatch.ts`（审查简报传入 docs 行）、`src/lessons/docs.ts`（`docsGaps`、`docsLines`）、`docs/ORCHESTRATION.md` §17 |
| 3 | 两节点 | L3 探针场景 `glm-exec-docs`：一个组件、两件任务——worker-1 不写 docs（缺口句）、worker-2 带 `still true:` 一行（原样记入）；审查简报有清单一条与缺口行；worker 简报有 gen 的一句 | `scripts/probe/run-probe.mjs`、`docs/ORCHESTRATION.md` 场景表 |

每批绿门禁（build → preflight → npm test → probe，重定向 `.llm/logs/dah2-*.log`）后提交并推 `origin/docs-at-hand-2`。

## 判定细节（设计未定死、按最贴近字面的做法）

- `scopeComponents`：目录条目（尾 `/`）先查目录自己的 `AGENTS.md`，文件条目从父目录起，向上到检出根（不含根）；按首次触碰去重。组件存在性看派发时的工作树（worker 实际看到的样子）。
- 缺口的组件存在性按交回 head 提交的树判（`entryAt`），不是工作盘；`--no-renames` 下改名即删+加（设计 §6.4 已写）。
- worker 的 `docs` 行原样记入批注；「没提到这个组件」按组件路径在文本中以非 `[A-Za-z0-9-]` 为界出现判。
- 批注里的行统一带 `Docs: ` 前缀渲染进交回摘要批注（worker 行内容原样跟在后面；「文档缺口没算成：<原因>」原文保留）。审查简报的 Context 里带同一批行；主 Agent 的交回通知也带。
- 审查清单一条是无条件常在（句内的 "if" 自带条件）；有缺口时的三处 = 交回摘要批注、主 Agent 通知、审查简报 Context，都没有缺口时都不出现。

## 留给人/编排方（本线不改图节点，批注由编排方记）

1. gen 验收的后两句是对已放行设计的请求，记成批注：接管结束的提醒多一句、扫描多组件候选（bootstrap 节点）；`execute.release` 的提示文字加一句（m7 节点）。
2. 设计 §5.5（简报上下文栏的 `docsFor` 组件文档路径与决策行）不在本批实现：gen 节点验收只有一句，且 §5.5 自述「对已放行的 M7 的请求」——与第 1 条同桶，请编排方定是记批注还是下一批实现。
3. L4 随下一桌面批次（设计 §11 第 3 步之后）。
