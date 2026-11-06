# lessons-4 核对记录（2026-11-05）

范围：项目图节点 `lessons-4`「第一批经验」的两条验收。原文取自 `node --experimental-strip-types --no-warnings scripts/graph/cli.ts show lessons-4` 的 `projection.node.acceptance`（节点 rev `b4a3d7ef400d`，图修订 `30fa1e4916af`），对照 `origin/main` 上已有的东西。这是工作流 `wf_cc148081d07c2798` 的 check 步：只读，没有写任何经验存储，没有改 `docs/graph`，没有碰 `~/.dsh`。

结论：两条都没有满足。L2 那一半（固定数据的导入测试）已经在 main 上并且通过；缺的是「本项目的存储」本身：主检出的 `.llm/lessons.jsonl` 不存在。`m5` 节点批注里 2026-11-04 那次「导入 21 条，幂等」进的是桌面批次的临时项目，不是本项目的存储。剩下的是数据（把 21 条导入本项目的存储，重复导入一次）和一次真实存储上的查询，预计不改代码。

更新（同日 code 步）：导入与查询已做，两条都有证据，见第 8 节；提交 `a4b2f8e` 在 `origin/lessons-4`，待合入 main。

## 1. 基线

- `git fetch origin` 退出码 0。核对开始时 `origin/main` = `2eeb52e`；结束前再 fetch 一次是 `8882d8e`。`2eeb52e..8882d8e` 只有一个提交（`graph: stop the last heartbeat, check runs on each wake`），只改 `docs/graph`，`src/`、`tests/`、`scripts/`、`package.json` 没有差别。
- S11 的提交 `aef9d43`（2026-11-02，`S11 (lessons-4): the 21 seed lessons as an operations file, with the import test`，改 `tests/lessons-seed.spec.ts` 与 `package.json` 的测试清单）是 `origin/main` 的祖先（`git merge-base --is-ancestor` 退出码 0），随 m5 合入。`package.json` 的测试链里有 `tests/lessons-seed.spec.ts`。
- 操作文件 `.agents/tasks/m5/lessons-seed.json`：主检出里有，21 条，每条 `action: "new"`，原因都以 `seed from ` 开头；SHA256 `E10A3247BBA0DD22570188F689D49C67E396B64E3500BB53506B2D83B2441910`，另外 10 个带这份文件的工作树里 SHA256 相同。它被 `.gitignore:11`（`.agents/tasks/**/*`）忽略，不入库。
- `tests/lessons-seed.spec.ts` 在主检出（`2eeb52e`，代码与 `8882d8e` 相同）单独跑一次：3 过、0 败，退出码 0。三个用例：
  1. `the operations file holds 21 entries and every entry passes the checks the apply path applies`
  2. `the two sample entries go through the command line into a project of their own, and a second apply adds nothing`
  3. `the pinned queries return the pinned lessons: lessons_query by keywords, relevant by write scope and by a path under it`

## 2. 「本项目的存储」与「真实存储」指什么

- 本项目的存储是项目根下的 `.llm/lessons.jsonl`：设计 §4.8「21 条全部进本项目的 `.llm/lessons.jsonl`」；代码里是 `src/lessons/storage.ts` 的 `journalFile` 加 `src/data/project-root.ts` 的 `projectDirOf`。本仓库的项目根是主检出，工作树回到主检出（`docs/DEVELOPMENT.md` §14），所以真实存储是 `C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\lessons.jsonl`。它不在 `~/.dsh` 下，按任务书可以写。`.llm/` 被 `.gitignore:3` 和 `.git/info/exclude` 第 8 行忽略，命令行写入时不会再改 `info/exclude`。
- 这个文件现在不存在。20 个工作树下的 `.llm/lessons.jsonl` 也都不存在。
- 用户级目录 `C:\Users\29596\.dsh\glm-hourness\` 下只有 `audit`、`loops`、`main-agent`、`credentials.json`、`device-mid.txt`，没有 `lessons` 目录，也没有 `lessons.jsonl`（只列目录，没有读写）。所以「没有用户级经验」今天成立。

## 3. 2026-11-04 桌面批次那次导入进了哪里

- `m5` 节点 2026-11-03T21:05:11Z 的批注写「lessons-seed 导入 21 条幂等，/lessons 与面板「经验」页可见」。盘上唯一一份 21 条的经验流水是 `C:\Users\29596\AppData\Local\Temp\l4-desktop-batch\project\.llm\lessons.jsonl`。那是桌面批次的临时项目：`git rev-parse --show-toplevel` 返回的就是这个 `project` 夹。
- 这份流水有 21 行，都是 `llm` 在 `2026-11-03T20:48:29.506Z` 写的 `new`，id 从 `L-51e877` 到 `L-13ac0c`。逐条对照操作文件，21 条的坑、解法和证据都相同。
- 结论：那次导入进的是临时项目，不是本项目的存储。`impl-plan.md` 第 7 节里「第一批里把 `lessons-seed.json` 导入真实项目的 `.llm/lessons.jsonl` 并查一次」没有做。`docs/ORCHESTRATION.md` §8.6 标题与 `docs/HANDOFF.md` §3 的 `lessons` 行写「种子导入……在 2026-11-04 的桌面批次里看过」，说的也是这次。
- 那次的「幂等」：临时流水只有 21 行、没有重复，和第二次导入全部跳过的结果相符；但盘上没有第二次导入的输出，单看文件证明不了第二次导入跑过。重复导入不新增，另有两处证据：S11 在带自己 `.git` 的临时夹上跑过 21 条（`.agents/tasks/m5/impl/progress.md` 的 S11 一节：第一次 `applied 21 / skipped 0 / failed 0`，第二次 `applied 0 / skipped 21 / failed 0`，流水一直是 21 行），和上面的用例 2（两条样例，第二次 `[0, 2, 0]`，流水 2 行）。

## 4. 逐条

| 条 | 验收原文要点 | 结论 | 证据 | 剩下的 |
| --- | --- | --- | --- | --- |
| 1 | §4.8 的 21 条都在本项目的存储里（没有用户级经验），证据指向 `DEVELOPMENT.md` §5、§7 的行、`HANDOFF.md` §6、提交与节点；重复导入不新增任何一条 | 未满足 | 已有：操作文件 21 条，证据按 §5.7 的写法（见第 5 节）；`aef9d43` 的用例 1、2 在 main 上通过；S11 临时夹记录 21/0/0、0/21/0；用户级目录没有经验。缺：本项目的 `.llm/lessons.jsonl` 不存在，2026-11-04 的导入进的是临时项目 `%TEMP%\l4-desktop-batch\project` | 用操作文件把 21 条导入本项目的存储，再导入一次，记下两次的输出（应为 21/0/0 与 0/21/0）和 `show` 的结果（21 条经验、0 条候选、0 行读不了），并核对用户级目录仍没有经验 |
| 2 | `lessons_query {text: "PowerShell encoding"}` 返回 PowerShell 5.1 那一条；`relevant` 对写入范围 `docs/graph/**` 与路径 `docs/graph/nodes/x.json` 都返回「worker 写图」那一条 | L2 满足；真实存储上未查 | 用例 3 在 main 上通过（两条样例：查询排第一的是 PowerShell 那条，两种 `relevant` 都只返回 worker 写图那条）；S11 临时夹上 21 条全集的结果：查询第一条是 PowerShell 那条（2 分），另一条是 CDP 那条（1 分）；两种 `relevant` 都返回 worker 写图那条和第 20 条（各 3 分）。节点要求的「导入之后在真实存储上查一次」没有做，本项目的存储还不存在 | 导入之后，在本项目的存储上跑一次这三个查询，记下结果 |

## 5. 第一批的内容与来源

内容取自设计 §4.8 的表，没有新增条目。每条的原因与证据（操作文件原样）：

| # | 讲的坑 | 原因 `reason` | 证据 `evidence` |
| --- | --- | --- | --- |
| 1 | PowerShell 5.1 不写 `-Encoding` 时按 ANSI 读写 | `seed from docs/HANDOFF.md §6` | `docs/HANDOFF.md §6` |
| 2 | 行的 `apply()` 抛错拖垮宿主启动 | `seed from docs/DEVELOPMENT.md §7 (2026-10-27, row 1)` | `docs/DEVELOPMENT.md §7`、`AGENTS.md` |
| 3 | 多行包里声明客户端半 | `seed from docs/DEVELOPMENT.md §7 (2026-10-27, row 2)` | `docs/DEVELOPMENT.md §7` |
| 4 | `listModels` 缺 provider | `seed from docs/DEVELOPMENT.md §7 (2026-10-27, row 3)` | `docs/DEVELOPMENT.md §7` |
| 5 | 静态包的客户端半没有 `styles` | `seed from docs/DEVELOPMENT.md §7 (2026-10-27, row 4)` | `docs/DEVELOPMENT.md §7` |
| 6 | 行自配 `home`，数据写进 profile 目录 | `seed from docs/DEVELOPMENT.md §7 (2026-10-27, row 5)` | `docs/DEVELOPMENT.md §7`、`docs/DESIGN.md §2.4` |
| 7 | 不认引号的 shell 判断误拦 | `seed from docs/DEVELOPMENT.md §7 (2026-10-27, row 6)` | `docs/DEVELOPMENT.md §7`、`docs/ROADMAP.md M1.8` |
| 8 | 把 `reference/deepseek-harness` 当运行时读字段 | `seed from docs/DEVELOPMENT.md §7 (2026-10-28, three rows)` | `docs/DEVELOPMENT.md §7`、`docs/DESIGN.md §2.4a` |
| 9 | guard 对相对路径的判断 | `seed from docs/DEVELOPMENT.md §7 (2026-10-28, the relative-path row)` | `docs/DEVELOPMENT.md §7` |
| 10 | 每次请求随机 `x-session-id` 破坏缓存 | `seed from docs/DEVELOPMENT.md §7 (2026-10-28, the cache row)` | `docs/DEVELOPMENT.md §7`、`docs/DESIGN.md §4.5b` |
| 11 | 移植丢了签名 URL 与请求字段 | `seed from docs/DEVELOPMENT.md §7 (2026-10-28, the signing and request rows)` | `docs/DEVELOPMENT.md §7`、`docs/DESIGN.md §4.3` |
| 12 | 重建客户端半之后只刷新页面 | `seed from docs/DEVELOPMENT.md §7 (2026-10-28, the client 404 row)` | `docs/DEVELOPMENT.md §7` |
| 13 | 输入框的模型菜单写进 `agent-default-model` | `seed from docs/HANDOFF.md §6` | `docs/HANDOFF.md §6` |
| 14 | `dsh` 不在 PATH，`--profile desktop` 被拒 | `seed from docs/DEVELOPMENT.md §3` | `docs/DEVELOPMENT.md §3` |
| 15 | 探针与标定同时跑 | `seed from docs/HANDOFF.md §6` | `docs/HANDOFF.md §6` |
| 16 | 没装 gitleaks 时 `npm test` 失败 | `seed from docs/HANDOFF.md §6` | `docs/HANDOFF.md §6`、`docs/DEVELOPMENT.md §10` |
| 17 | 从 PowerShell 5.1 经 CDP 发中文乱码 | `seed from docs/HANDOFF.md §6` | `docs/HANDOFF.md §6` |
| 18 | `inject` 只声明嵌套服务名 | `seed from docs/DEVELOPMENT.md §5 (rule 7)` | `docs/DEVELOPMENT.md §5 第 7 条` |
| 19 | worker 在本地 main 上提交了图批注 | `seed from commit:cae6ddf` | `commit:cae6ddf`、`node:recommend-last@2026-10-29T11:39` |
| 20 | 简报写在人拍板之前，没有更新 | `seed from node:orch@2026-10-29T12:41` | `.agents/tasks/reading-2026-10-29/digest.md §6 K5`、`node:orch@2026-10-29T12:41`、`.agents/tasks/design-context.md` |
| 21 | 中断清零了工作流的状态文件 | `seed from .agents/tasks/reading-2026-10-29/digest.md §6 K4` | `.agents/tasks/reading-2026-10-29/digest.md §6 K4` |

本步实读过的证据：`cae6ddf` 是提交（2026-10-29，`docs(graph): m3-base L3 probe 94/94`）；`recommend-last` 节点有 `2026-10-29T11:39:29.650Z` 的批注，`orch` 节点有 `2026-10-29T12:41:08.582Z` 的批注；`.agents/tasks/reading-2026-10-29/digest.md` 第 318 行是 K4、第 319 行是 K5；`.agents/tasks/design-context.md` 存在。`DEVELOPMENT.md` §3、§5、§7、§10 与 `HANDOFF.md` §6 各节本步没有再读，S11 评审（`.agents/tasks/m5/reviews/impl-S11-pass1.md`）当时逐项核过。

## 6. 设计版本

- 任务书写的是设计 0.7。盘上主检出与 `.worktrees/m5` 的 `.agents/tasks/m5/design.md` 首行都是「版本：0.6」，大小 263,434 字节，与 `.worktrees/m5/.agents/tasks/m5/design-0.6.md` 一样大；盘上没找到 0.7 全文。`impl-plan.md` 与 `reviews/amend-review-1.md` 至 `-3.md` 引的是 0.7。
- 和本节点有关的差别只在 §4.8 第 21 条。0.6 的坑写「A blue screen zeroed …」，证据栏有「节点 `m1-parity` 的批注（蓝屏）」；操作文件写「A crash zeroed …」，证据只有 digest §6 K4。`reviews/amend-review-2.md` 的 N13 与 `amend-review-3.md` 记着 0.7 把第 21 条改成不点名原因的写法、证据去掉已经不在图上的批注；`m1-parity` 节点今天没有「蓝屏」字样，它的批注写「状态文件在中断中被清零」。S11 评审当时按 0.7 的 §4.8 逐格对照过，21 条一致。
- 本步拿操作文件对照盘上的 0.6 表：21 条的情况栏都相同；坑与解法 20 条逐字相同，第 21 条的坑就是上面那一处。所以操作文件按 0.7 写，导入时照用，不必改。

## 7. 给实现步的注意

1. 导入命令：`npm run -s lessons -- --cwd C:\Users\29596\Desktop\Project\GLM-Hourness apply --file <操作文件>`，跑两次；再跑一次 `show`。每次输出重定向到日志文件，退出码从 `$LASTEXITCODE` 读。不写 `--cwd` 时项目取 npm 启动的文件夹，从工作树启动也会回到主检出，写明 `--cwd` 只是让记录看得清楚。
2. 导入期间别让探针在跑：`scripts/probe/run-probe.mjs` 第 235 至 238 行在开始时记下主检出 `.llm/lessons.jsonl` 的大小与修改时刻，第 2829 行在结束时比对，变了就判失败。别的线的探针跑到一半时导入，会让那次探针失败。导入前先拿到 `.llm/probe-lock` 与 `.llm/probe-lock-2` 两把锁，导入完再放。导入之后文件不再变，以后的探针不受影响。
3. 新工作树里没有被忽略的操作文件，`npm test` 会停在 `tests/lessons-seed.spec.ts`（`.agents/tasks/panel/impl-plan-2.md` §1 与 `.agents/tasks/m5/rest-plan.md` 基线一条都记过）。要跑门禁就从主检出拷进来，拷后核对 SHA256 同上。
4. 真实存储上的查询：人的桌面 profile 没有打开 `lessons` 行（`.agents/tasks/m5/l4-2026-11-05.md`），所以要在进程里调这一行自己的函数去查，写法同用例 3（`lessonsTools(env)` 的 `lessons_query`、`lessonsRowService(env).relevant`），`dirOf` 指主检出的 `.llm`。脚本放仓库外，用完删掉。设计 §4.5 写明 `lessons_query` 不写流水；`relevant` 会不会写流水，本步没有核对，在真实存储上跑之前先查清。
5. 验收第 2 条的「返回」按「结果里有」读：21 条全集上 `relevant` 会同时返回第 19 条与第 20 条，用例 3 只在两条样例上钉了「只有这一条」。
6. 文档：导入之后，`docs/ORCHESTRATION.md` §8.6 标题与 `docs/HANDOFF.md` §3 的 `lessons` 行说的仍是 2026-11-04 桌面批次的那次。要不要改成「21 条已在本项目的存储里」，由实现步定；改的话文档单独一个提交，因为这次导入不改仓库里的行为。
7. 记图（编排方）：`m5` 节点 2026-11-03T21:05:11Z 批注里的「lessons-seed 导入 21 条幂等」，导入的是桌面批次的临时项目，不是本项目的存储。

## 8. 实现步的结果（2026-11-05，code 步）

工作树 `.worktrees/lessons-4`，分支 `lessons-4`，先快进到 `origin/main` `2d4600d`（`8882d8e..2d4600d` 没有动 `src/lessons/`、`tests/lessons-seed.spec.ts`、`scripts/lessons/`）。提交 `a4b2f8e`（`docs(lessons): the first 21 lessons are in this project's journal (lessons-4)`），已推 `origin/lessons-4`，没有合入 main，没有推 `github`（工作分支只推 origin）。没有改代码；改的是数据（主检出 `.llm/lessons.jsonl`）和两处文档。

### 8.1 导入（第 1 条）

导入前在主检出建了 `.llm/probe-lock` 与 `.llm/probe-lock-2`（`owner.txt` 第一行 `wf_cc148081d07c2798 code`），导入与查询完再删；期间没有别的探针在跑。

| 步 | 命令 | 退出码 | 结果 |
| --- | --- | --- | --- |
| 第一次导入 | `npm run -s lessons -- --cwd C:\Users\29596\Desktop\Project\GLM-Hourness apply --file .agents/tasks/m5/lessons-seed.json` | 0 | applied 21 / skipped 0 / failed 0；流水 21 行 |
| 第二次导入 | 同上 | 0 | applied 0 / skipped 21（全部 `duplicate`）/ failed 0；流水仍 21 行、12953 字节，修改时刻不变 |
| `show` | `npm run -s lessons -- --cwd … show` | 0 | `dir` 是 `C:\Users\29596\Desktop\Project\GLM-Hourness\.llm`；21 条经验（`L-81bf14` 至 `L-545343`）、0 条候选、0 行读不了 |

- 21 条的证据栏与第 5 节的表一致：`docs/HANDOFF.md §6`、`docs/DEVELOPMENT.md §7`（另有 §3、§5 第 7 条、§10）、`commit:cae6ddf`、`node:recommend-last@2026-10-29T11:39`、`node:orch@2026-10-29T12:41`、digest §6 K4/K5。
- 流水 SHA256 `243E4B54236057BD1CD4DA97D925D85B4003E91850B6D6FFBD13336418269A8D`。
- 用户级 `C:\Users\29596\.dsh\glm-hourness\` 下仍是 `audit`、`loops`、`main-agent`、`credentials.json`、`device-mid.txt`，没有 `lessons` 目录，也没有 `lessons.jsonl`（只列目录）。
- `.llm/` 已在 `.git/info/exclude`，命令行没有再追加。

### 8.2 真实存储上的查询（第 2 条）

人的 profile 没有打开 `lessons` 行，所以用仓库外的一次性脚本（`%TEMP%\lessons4-query.ts`，用完已删）在进程里调这一行自己的 `lessonsTools(env)` 的 `lessons_query` 与 `lessonsRowService(env).relevant`，`dirOf` 固定为主检出的 `.llm`。查询之前核对过 `relevant` 不写流水：`src/lessons/service.ts` 的 `relevant` 只调 `readLessons`，不调 `writeLessons`；`lessons_query` 同样只读。查询前后流水的大小与修改时刻相同（`12953/1793861264554.1584`），`note` 没有收到任何提示。

| 查询 | 结果 |
| --- | --- |
| `lessons_query {text: "PowerShell encoding"}` | 第一条 `L-81bf14`（PowerShell 5.1 不写 `-Encoding` 时按 ANSI 读写，2 分）；第二条 `L-bb9109`（经 CDP 发中文乱码，1 分）；`more` 0 |
| `relevant` 路径 `docs/graph/**` | `L-6f2cc0`（简报写在人拍板之前，第 20 条）、`L-ab4119`（worker 在本地 main 上提交了图批注，第 19 条） |
| `relevant` 路径 `docs/graph/nodes/x.json` | 同上两条 |

和第 4 节预计的一致：「worker 写图」那一条在两种 `relevant` 的结果里都有，第 20 条同时出现。

### 8.3 文档

- `docs/ORCHESTRATION.md` §8.6 标题：2026-11-04 那次写明导入的是批次自己的临时项目，并加「第一批 21 条经验 2026-11-05 导入本项目的 `.llm/lessons.jsonl`」。
- `docs/HANDOFF.md` §3 的 `lessons` 行：同样两句，并写再导一次 21 条全部跳过。
- 第 7 节第 6 条说文档可以单独一个提交；这次只有一个提交，文档就是它的全部改动，导入与查询的记录写在同一个提交说明里。

### 8.4 门禁（`2d4600d` 加本改动，日志在工作树的 `.llm/logs/`）

| 门禁 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run build` | 0 | |
| `npm run preflight` | 0 | 20 行组合 |
| `npm test` | 0 | 3156 过、0 败、0 跳过；`tests/lessons-seed.spec.ts` 3/3（操作文件从主检出拷入，SHA256 同上）；逐字门禁 502 条 |
| `node scripts/check-lint.mjs` | 0 | eslint 73、knip 18、jscpd 1，没有上升 |
| `npm run probe`（拿 `.llm/probe-lock`） | 第一次 1，重跑 0 | 第一次 418/420：两项都是 `env-checks-timeout`，场景里 edit 别名得 `ReplaceFileW EIO (Win32 1175)`，第二次检查没有跑；这是 `DEVELOPMENT.md` §7 已记的宿主文件替换错误，不在本改动的路径上。重跑 420/420，其中「the probe leaves … the journals of the project this checkout belongs to as they were」通过（`lessons.jsonl` 前后都是 12953 字节） |
| `git diff --check` | 0 | |

探针锁：`.llm/probe-lock` 持有期间每 4 分钟核对第一行后续写，用完先停续写再删目录；`.llm/probe-lock-2` 只在导入与查询时持有。两把锁现在都不在。续写脚本放在 `%TEMP%`，已删。

### 8.5 留给合入与编排方

- 合入 main 由调用方做：`lessons-4` 比 `origin/main` 多一个提交，只改两份文档；之后把同一个 `main` 推到 `github`。
- 记图：`lessons-4` 两条验收的证据见上；`m5` 节点 2026-11-03T21:05:11Z 批注里的导入是临时项目的，本项目的导入是 2026-11-05 这次。
