# ablation 实施计划

节点 `ablation`（注入文字的消融对比），做法照 `.agents/tasks/prompt-audit/report.md` §8。起点 main `b923210`。工作树 `.worktrees/ablation`，分支 `ablation`。

## 0. 与清点报告不同的地方

- 3.17.1 的 Dynamic Behavior 已在 main 上（`63135b9`，coding-plan 的 `glm:dynamic-behavior`，三段约 1k 字符，不是报告里 3.16.3 的 3,065 字符）。A0 因此已经带它；A4 改为「去掉 `glm:dynamic-behavior`」，结论仍回答 Dynamic Behavior 的去留。
- `glm:persona` 已改名 `glm:reporting-depth`（`# Reporting Depth`），A1 去掉的是它。

## 1. risk-calib-read 的后一半：读取圈禁

运行目录已在 `%TEMP%`（`scripts/calibrate/run-dir.mjs`，`3fbc1e9`）。剩下：被测模型按绝对路径读得到仓库里的 `tests/calibration/<任务>/check.mjs`，列得出系统临时目录里同批的其他运行。

- 新增只在标定时加载的行 `scripts/calibrate/fence.mjs`（不进 bundle，同 `limits.mjs`）：`tools/pre-execute` 上 `prepend`，每次调用（含子调用）从参数里取路径（路径类参数整段、任何参数里的绝对路径、shell 命令里带 `..` 或 `~` 的词，先展开 `$env:X`、`%X%`、`$X`），落在本次运行的 `ws/` 之外且在仓库内、等于系统临时目录、或在临时目录里以 `glm-hourness-calib-` 开头的目录下的，拒绝，并写一行 `fence.jsonl`。拒绝文字不提标定。
- 运行器每次运行都挂这一行（`scripts/sandbox.mjs` 的 `fenceRow`），`result.json` 记 `fence`（拦下次数）。
- 验收脚本留在仓库：圈禁之后它们不在被测会话够得着的路径上；L2 与知识图入口不用改。
- 证据：L2 `tests/calibrate-fence.spec.ts`（路径判定）；L3 探针场景 `calib-fence`（按绝对路径 `Read` 与 `Get-Content` 读 `check.mjs`、列 `$env:TEMP`、`..` 走出工作区都被拒，读自己工作区的文件放行，`fence.jsonl` 记三行）；真实运行后扫事件流，核对没有一次调用碰到圈外路径。
- 不做 M7 P4（每次运行之后的事件流扫描写进 `result.json` 的 `valid`）；`fence.mjs` 导出的路径判定函数留给它用。

## 2. 消融开关

新增只在标定时加载的行 `scripts/calibrate/ablation.mjs`，配置 `{arm, record}`：

| 臂 | 改动 | 接缝 |
| --- | --- | --- |
| A0 | 不挂这一行 | — |
| A1 | 去掉 `# Reporting Depth` 一节 | `llm/stream`（global、prepend），改请求的系统消息，标记副本后重新派发（同 `compact-row.ts`） |
| A2 | `# Workspace rules` 一节缩成一句总声明（拦截不变） | 同上 |
| A3 | 15 个图工具与 3 个记忆工具在 GLM 上改为延迟 | 激活时从 `packages/glm/dist/toolsearch/exposure.js` 的 `RESIDENT_TOOLS` 去掉这些名字，卸载时加回 |
| A4 | 去掉 `glm:dynamic-behavior` | `llm/stream` |
| A5 | 去掉 DSH 的 `tool:read`、`tool:write`、`tool:edit`、`tool:glob`、`tool:grep` 五节 | `llm/stream` |

为什么用 `llm/stream` 而不是 `system-prompt/assemble`：组装监听器要最外层才能看到方言与 guard 加的节，而各行的激活次序不跟配置走（M3 设计 §3.1.3）；`llm/stream` 上所有 prepend 监听器都以「标记副本、重新派发」的方式改请求，次序无关。系统提示词的节以空行相接，这几节内部没有空行，按段落认。

每次请求写一行 `ablation.jsonl`（改了几段），`result.json` 记 `ablation`（请求数、没改到的请求数）。

L3：探针场景 `ablation-A0` 到 `ablation-A5`（同一段脚本），逐臂与 A0 比第一个请求：系统提示词按段落的增删恰好是该臂的那一段（A2 恰好换成那一句），工具面不变；A3 的系统提示词不变、工具面恰好少 18 个、延迟公告里有它们。L2 `tests/calibrate-ablation.spec.ts`。

## 3. 较难的任务

`bugfix-shell-redirect`，取自 `docs/DEVELOPMENT.md` §7 2026-10-27 那条（guard 把 `=>`、`>>>`、`->` 当成重定向拦截，引号不感知）：fixture 是一个找出 shell 命令里重定向目标的小模块，README 写清约定（引号、`2>&1`、`nul`、`$null`、流编号、带引号的目标），提示词只报 `=>` 的误判。验收脚本另查 README 约定里的其余写法、测试通过且新增、换回原来的 `src/` 测试会失败。核对：原样不通过，参考解通过（参考解不入库）。

## 4. 运行

- 门禁：`npm run build` → `npm run preflight` → `npm test` → `npm run probe`，加 `node scripts/check-lint.mjs` 的棘轮（eslint 73、knip 18、jscpd 1，不许上升）。日志重定向到 `.agents/tasks/ablation/`，退出码从 `$LASTEXITCODE` 读。
- 工作树标定：按 `DEVELOPMENT.md` §3 在系统临时目录生成 DSH home 与 profile（junction 指向本工作树的包），复制凭证，`DSH_HOME`、`DSH_SANDBOX_PROFILE` 传给 `npm run calibrate`，用完删掉。运行期间不重建本检出。
- 探针锁 `.llm/probe-lock` 或 `-2`，`owner.txt` 第一行 `wf_5f5345b05e5c4e89 code`，每 10 分钟内续写，续写前核对第一行。
- 规模：6 臂 × 2 模型（`glm-5.3`、`glm-5.3-flash`）× 3 任务 × 5 次 = 180 次，全部在非高峰（工作日 14:00–18:00 UTC+8 之外）。`scripts/rules-gate.mjs` 拒绝时不绕过、不改档位，排到高峰之后。变化不明确的臂（两档模型方向不一致、或差别在样本波动之内）再补 5 次。
- 事后扫事件流：每次运行的工具调用路径都在自己的 `ws/` 里（同 `fence.mjs` 的判定）。

## 5. 报告

`.agents/tasks/ablation/report.md`：每格次数、完成率、积分（计费与全价）、步数、返工、违规、圈禁拦下数；结论按 question-31 的整理与 Dynamic Behavior 的去留分条写建议，不改生产提示词。`docs/DESIGN.md` 记每段的一行结论与依据（节点验收 3），`docs/ORCHESTRATION.md` §10.5 记运行器的两行与新任务。

## 6. 提交

一件事一个提交，推 `origin ablation`：计划；圈禁与消融开关（含 L2、探针场景、文档）；新任务；报告与结果表。不动 `docs/graph`、`~/.dsh`、main。
