# lessons-4 评审（2026-11-05，工作流 wf_cc148081d07c2798 的 review 步）

结论：APPROVED，没有阻断项。

评审对象：`origin/lessons-4` = `a4b2f8e`，基于 `origin/main` `2d4600d`（`git rev-parse origin/main` 现在仍是 `2d4600d`）；`git diff origin/main...HEAD` 只有 `docs/HANDOFF.md` 与 `docs/ORCHESTRATION.md` 各一行。数据改动在主检出的 `.llm/lessons.jsonl`（被忽略，不入库）。门禁按提交说明与工作树 `.llm/logs/` 读，没有重跑。

## 验收原文

`scripts/graph/cli.ts show lessons-4` 的 `projection.node.acceptance` 两条，与 check.md 记的相同。check.md 记节点 rev `b4a3d7ef400d`，现在是 `c01cc8724884`；之后的历史只有 `status`（approved 到 doing）与一条 `comment`，验收条文没有改。

## 第 1 条：21 条在本项目的存储里，没有用户级经验，证据齐，重复导入不新增

本步实读：

- 主检出 `.llm/lessons.jsonl`：12953 字节，SHA256 `243E4B54…69A8D`，与 check.md 记的相同；21 行，全是 `op: new`、`actor: llm`、`by.tool: lessons-cli`，id 21 个互不相同。
- 操作文件 `.agents/tasks/m5/lessons-seed.json`：SHA256 `E10A3247…2441910`，21 条。逐条对照流水的 `reason`、`evidence`、`pitfall`、`fix`、`situation`：21 条一致，不一致 0。
- 工作树日志 `l4-apply-1.json`：applied 21 / skipped 0 / failed 0；`l4-apply-2.json`：applied 0 / skipped 21 / failed 0，跳过原因是 `duplicate`（例：`lesson L-81bf14 has the same signature`）；`l4-show.json`：`dir` 是主检出 `.llm`，21 条经验、0 条候选、`unreadableLines` 0。
- 用户级 `~/.dsh/glm-hourness/` 只有 `audit`、`loops`、`main-agent`、`credentials.json`、`device-mid.txt`，没有 `lessons` 目录与 `lessons.jsonl`（只列目录）。
- 来源抽查，内容都能在引用处找到，没有编造：
  - `DEVELOPMENT.md` §7 2026-10-27 六行对应第 2 至 7 条（第 6 条「190 条用量记录与 1 条记忆」与表内数字相同）；2026-10-28 的 `toolCalls` / `terminal_send` / `agentId`、相对路径、`x-session-id`、签名 URL 与四处请求细节、客户端 404 各行对应第 8 至 12 条。
  - `DEVELOPMENT.md` §5 第 7 条（`inject` 写完整服务路径链）对应第 18 条；§3「dsh 不在 PATH」「`--profile desktop` 会被拒绝」对应第 14 条；§10「找不到就失败……不跳过」与 `HANDOFF.md` §6 的 gitleaks 一行对应第 16 条。
  - `HANDOFF.md` §6：PowerShell 5.1 ANSI 代码页一行对应第 1 条，同行的 CDP 中文对应第 17 条，`agent-default-model` 对应第 13 条，「两者不要同时运行」对应第 15 条。
  - `commit:cae6ddf` 存在（2026-10-29，`docs(graph): m3-base L3 probe 94/94`，改 `docs/graph/nodes/recommend-last.json`）；`recommend-last` 节点 `2026-10-29T11:39:29.650Z` 的批注写「worker 越过了简报的约束，自己在本地 main 上提交了一条图批注 cae6ddf」，对应第 19 条。
  - `orch` 节点 `2026-10-29T12:41:08.582Z` 的批注与 digest §6 K5（「人拍板之前写的 worker 简报没有更新……两轮审查都放过」）对应第 20 条；digest §6 K4（「一次崩溃把状态文件清零……项目图（临时文件加改名）保住了真实进度」）对应第 21 条。
- L2：`l4-test2.log` 里 `tests/lessons-seed.spec.ts` 三个用例都是 `ok`；整份日志没有 `not ok`，各段 `# pass` 合计 3156、`# fail` 都是 0。`aef9d43`（S11）是 `origin/main` 的祖先。

判定：满足。

## 第 2 条：固定查询返回指定的经验

- L2：用例 3 `the pinned queries return the pinned lessons: lessons_query by keywords, relevant by write scope and by a path under it` 在 `l4-test2.log` 里是 `ok`。
- 真实存储：`l4-query.log` 记 `lessons_query {text: "PowerShell encoding"}` 第一条 `L-81bf14`（PowerShell 5.1 ANSI，2 分），第二条 `L-bb9109`（1 分）；`relevant` 对 `docs/graph/**` 与 `docs/graph/nodes/x.json` 都返回 `L-6f2cc0` 与 `L-ab4119`；`notes` 为空，流水大小与修改时刻前后相同。
- 结果和数据对得上：流水里 `L-ab4119` 的 `situation.files` 是 `docs/graph/**`，`L-6f2cc0` 是 `.agents/tasks/**`、`docs/graph/nodes/**`，两种 `relevant` 都命中这两条是数据本身决定的。
- 查询不写流水：`src/lessons/service.ts` 的 `relevant` 只调 `readLessons`（第 177 行），写入 `writeLessons` 只在 `propose`（第 211 行）。

「返回」按「结果里有」读，check.md §7 第 5 条事先写明，验收没有要求「只返回这一条」。判定：满足。

## 文档改动

两处都只把「2026-11-04 那次导入进的是批次自己的临时项目」与「2026-11-05 导入本项目的 `.llm/lessons.jsonl`、再导一次全部跳过」写清，与上面的数据一致；没有新增行为。

## 非阻断

1. `l4-apply-1.json`、`l4-apply-2.json` 是 PowerShell 5.1 重定向写出的 UTF-16（带 BOM），直接 `JSON.parse` 失败，要按 UTF-16 解码才读得出。内容完整，只影响事后复读的方便；日志在工作树 `.llm/` 下，不入库。
2. 探针第一次 418/420，失败两项都在 `env-checks-timeout`（edit 别名 `ReplaceFileW` EIO，Win32 1175），与 `DEVELOPMENT.md` §7 2026-11-05 一行记的宿主文件替换错误同类，不在本改动的路径上；重跑 420/420，其中「journals of the project this checkout belongs to as they were」通过。
3. 设计版本：盘上 `design.md` 是 0.6，任务书写 0.7；差别只在 §4.8 第 21 条的措辞与证据，check.md §6 已核过，操作文件按 0.7。
4. 操作文件被 `.gitignore` 忽略、不入库；本项目的流水丢了可以从它重导（重复导入按签名跳过）。这是设计既有的安排，不是本改动引入的。
5. 留给编排方：把 `lessons-4` 合入 `main` 并把同一个 `main` 推到 `github`；在图上记 `lessons-4` 的结果；`m5` 节点 2026-11-03T21:05:11Z 批注里的「导入 21 条幂等」指的是临时项目，需要时加批注说明。
