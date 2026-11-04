# M5 剩余项计划（分支 `m5-rest`）

版本 1.0（2026-11-05）。干净区：本文件不写人设与语气词。

工作树 `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\m5-rest`，分支 `m5-rest`，已快进到 `origin/main` `1a6eb15`（含 loops-runner `a9adca8`、user-graph UG3–UG7 `91f1dbd`、metrics `31c9e0f`）。规划时在本工作树实测：`pnpm install --offline --store-dir ../../.pnpm-store` 退出码 0，`npm run build` 退出码 0（`.llm\logs\m5r-plan-build.log`）。preflight、`npm test`、探针没有在规划时跑，今天的基线数字由第 0 步取。

验收来源：项目图节点 `m5`、`lessons`、`m5-1`、`m5-4`、`lessons-3` 的正文、`acceptance` 与最近批注（在 `1a6eb15` 上只读）。

## 0. 规划时查到的事实（实施按此读）

1. **`m5-4` 与 `lessons-3` 的代码已在 main 上。** S9（`d4421b7`）、S10（`defad82`）随整支合入 `e654b0a`（2026-11-03），S12（`eef34f9`）并入 `80d4612`（2026-11-04）。`src/memory/habit.ts`、`answers.ts`、`learning.ts`、`signals.ts`，`ui/src/lessons/` 的确认习惯一节与「你说过不用记的习惯」折叠一节都在。剩下的是：一处与验收不符的行为（§2 D1）、几处验收字句没有测试钉住（§2 G1–G4）、过期的文档、`lessons-3` 的 L4。`m5-1` 的九条在 L2 上都有对应测试（§2 表），节点没关只是因为没人把证据对上。
2. **设计 0.7 的全文已不在任何检出里。** 所有检出的 `.agents/tasks/m5/design.md` 都与 `design-0.6.md` 字节相同（SHA256 `3758F0C1…E627`），全文搜不到 `memory_habit` 与 `§3.8.1`。0.7 的内容现在只留在：项目图三个节点的 `acceptance`、`impl-plan.md`、`.worktrees/m5` 的 `reviews/amend-review-*.md`（本计划第 1 批带进来）与代码。所以本计划以图上 `acceptance` 为准，不引用 design.md 的 §3.8。
3. **`main` 上的面板已接管板块登记。** `ui/src/graph/boards.ts` 归 plain-ui，页脚 `Panel.tsx` 的 `BoardLine` 对每块已登记且 `available` 的板显示「<label> ›」；经验板由 `ui/src/lessons/board.ts` 的 `projectionBoard(...)` 登记（`BOARD_ORDER[2]`，`homeLine`、`guideLine` 为 null）。impl-plan §4「板块登记表 `boards.ts`」一项已了结，不再有活。
4. **汇报细度节已改名。** `src/glm-prompt/reporting-depth.ts` 的 `REPORTING_DEPTH_SECTION = 'glm:reporting-depth'`，配置键 `reportingDepth`（旧键 `persona` 照读，DESIGN.md §5.2 之后的 `reportingDepth` 段）。`docs/ORCHESTRATION.md` §8.5 与 `scripts/probe/run-probe.mjs` 一处注释还写 `glm:persona`，归第 3 批。
5. **主 Agent 判断的模式核对仍等 M3。** M3 没有在 `mainAgentOf`（`src/graph/main-agent-holder.ts`）旁边加同时读记录与模式的读法；`src/graph/main-agent.ts` 的 `mainAgentActive` 只读投影值（2026-10-29 就有，是 `src/data/main-agent.ts` 已在用的同一种核对）。`src/data/main-agent.ts` 不动。

## 1. 从 `.worktrees/m5` 带过来的文件

只拷贝，没有改 `.worktrees/m5` 里的任何东西（拷贝后它的 `git status` 与拷贝前相同）。

| `.worktrees/m5` 里的未跟踪文件 | 与 main（`1a6eb15`）上同名文件比较 | 处理 |
| --- | --- | --- |
| `design-0.6.md` | 与 main 的 `design.md` 字节相同（main 上的 `design.md` 就是 0.6） | 不拷：不带新内容 |
| `impl-plan.md` | 与 main 上的字节相同（`839f636` 已入库） | 不拷 |
| `impl/progress.md` | 内容相同，`.worktrees/m5` 那份多 2 字节行尾（CRLF） | 不拷 |
| `impl/S5–S11-commit-msg.txt`（7 个） | main 上没有；`.gitignore` 第 11 行忽略 `.agents/tasks/**/*`，只放行 `*.md`，进不了提交；内容就是各步提交的提交信息，git 历史里有 | 不拷 |
| `reviews/amend-review.json`、`reviews/impl-review.json` | main 上没有；同上被忽略 | 不拷 |
| `reviews/*.md`（14 个：`amend-review-1/2/3.md`，`impl-S1`–`impl-S11-pass1.md`） | main 上没有；`impl-plan.md` 引用它们；设计 0.7 修订评审只剩这一份 | **已拷到 `.agents/tasks/m5/reviews/`**，SHA256 逐个与源相同；扫过没有令牌形状的字符串（不会触发 `check:secrets`）。随第 1 批提交 |

## 2. 剩余项总表

「状态」一栏：已钉 = L2/L3 有测试；缺口 = 验收字句没有测试钉住；D = 与验收不符的行为。

### `m5-1` 记忆的存取（L2；L3 `glm-memory`、`non-glm-memory`）

| 条 | 验收要点 | 状态 | 依据（规划时读到的测试文件） |
| --- | --- | --- | --- |
| 1 | 偏好 60 天强度 1；事实 14 天 0.5 | 已钉 | `memory-model.spec.ts` |
| 2 | 深路径、长标识符、40 位提交号放行；`ghp_`、混排令牌、PEM 拒为 `secret_like`；`commit:` 非 7–40 位 hex 为 `invalid`；源码无 `defaultKnowableFromGit`、`shouldStore`、`knowableFromGit` | 已钉 | `data-secret-shape.spec.ts`、`data-evidence.spec.ts`、`memory-model.spec.ts`、`memory-tools.spec.ts`；`src/`、`packages/` 里 grep 不到三个旧名 |
| 3 | `Why:`、`bad_source`、范围规则、`ask_first`（hint 点名 `memory_habit`）、`relayChecked: false`、`reporting-depth` 缺 relay 为 `invalid field value`、改 `type` 为 `invalid field type`、无凭据偏好为坏行 | 已钉 | `memory-model.spec.ts`、`memory-tools.spec.ts` |
| 4 | `similar` 与 `confirmNew` | 已钉 | `memory-model.spec.ts`、`memory-tools.spec.ts`、`memory-recall.spec.ts` |
| 5 | 两仓库各写自己的 `.llm`；工作树写主检出；`.git/info/exclude`；`io`；`no_project` | 已钉 | `data-project-root.spec.ts`（含 `commondir`）、`memory-tools.spec.ts`、`memory-row.spec.ts` |
| 6 | 旧 `memory.json` 迁移，读不出的不覆盖 | 已钉 | `memory-tools.spec.ts`、`memory-recall.spec.ts` |
| 7 | 删偏好要 relay（同会话自写除外，按 `origin`）；`/memory forget` | 已钉 | `memory-model.spec.ts`、`memory-row.spec.ts` |
| 8 | 两进程各写 200 条，`seq` 1–400 连续 | 已钉 | `data-journal.spec.ts` |
| 9 | 同名更新的折叠（保留四项、换六项、`reviews` 加一；`forgotten` 之上的 `store` 是新条目；`learnedFrom` 并入至多 5） | 已钉 | `memory-model.spec.ts` |

结论：`m5-1` 没有代码活，第 2 批把每条对到具体测试名写进证据文件。

### `m5-4` 从你的改动里学习（L2；L3 `glm-memory-habit`）

| 条 | 验收要点 | 状态 | 依据 |
| --- | --- | --- | --- |
| 1 | 真实引擎写出的七种历史，`correctionSignals` 找出、分组、确定性 | 已钉 | `memory-signals.spec.ts` 第 110、130、146 行起的三个用例 |
| 2 | `learning_signals` 的组、复发、四周；子 agent 没有、直接调 `role`；七天提醒的三种不来 | 已钉 | `memory-learning.spec.ts` 第 61–231 行；`memory-row.spec.ts` |
| 3 | 五种落点；规则提议经 `propose_to_human`；习惯只出问话，**图上不新增待决** | 缺口 G3 | 第 185 行用例只断言「流水没有新行」，没有断言图没被写；提醒用例同样没有 |
| 4 | `memory_habit ask` 全部拒绝码、①/②、`要记的：`、`too_many`、`known`、`asked_recently`、`week_cap`、按组键认 | 已钉 | `memory-habit.spec.ts` 第 57–136 行 |
| 5 | `confirm` 的存法与各拒绝码 | 已钉 | `memory-habit.spec.ts` 第 156–195 行 |
| 6 | `decline` 28 天（第 27 天拒、第 29 天可）；**人带原话撤掉确认过的习惯同样 28 天内不再问**；同会话不带原话删确认习惯得 `preference_owner`；**确认后带人最近的话更新、再同会话不带原话 `memory_forget` 仍得 `preference_owner`**；没回的问话 28 天；7 天后 `lapsed` | D1 + 缺口 G1、G2 | decline 见第 112、205 行；`preference_owner` 只在模型层钉（`memory-model.spec.ts` 第 382、400 行）；撤掉确认习惯这一支没有任何测试，且代码按「最后一次写入」而不是「撤掉那天」起算（D1） |
| 7 | `relay_not_said`、`relayChecked`、「原话未核对」、更新确认习惯读不到为 `unavailable` | 已钉 | `memory-habit.spec.ts` 第 219、231 行；`memory-row.spec.ts`；`lessons-panel-model.spec.ts` |
| 8 | 摘要把 28 天内没结果的问话与确认习惯算已落点；过期的「不用」不算 | 已钉 | `memory-signals.spec.ts` 第 217 行 |

**D1（与第 6 条不符）**：`src/memory/habit.ts` 的 `earlierOutcome` 判「已知」时，对 `status: 'forgotten'` 的确认习惯用 `fresh(entry.lastReviewed, nowMs, KNOWN_FORGOTTEN_DAYS)`；`src/memory/model.ts` 的 `applyRevoke` 在 `forget` 时只把 `status` 改成 `forgotten`，`lastReviewed` 仍是最后一次 `store`（确认或更新）的时刻。于是第 0 天确认、第 20 天撤掉的习惯，第 28 天起又能问，撤掉之后只挡了 8 天。修法见第 2 批。

### `lessons-3` 经验页（L2 视图模型与静态检查；L4 DevTools 截图）

| 条 | 验收要点 | 状态 | 依据 |
| --- | --- | --- | --- |
| 1 | 经验一半与记忆一半的全部行、两个默认折起的组、确认习惯三行、折起的「你说过不用记的习惯」、每条一行「要改」 | 已钉（L2） | `lessons-panel-model.spec.ts` 第 175–253 行 |
| 2 | 无按钮、开关、表单，不调 `commands.execute` | 已钉（L2） | 同文件第 354、363 行 |
| 3 | 流水追加后 15 秒内更新 | 缺口 G4 | 第 286–325 行用 25 ms 的注入间隔测了更新路径；生产间隔 `POLL_MS = 15_000` 在 `ui/src/graph/watched-files.ts` 第 23 行，没有测试钉住它不超过 15 秒 |
| 4 | 两行装上之前页脚不显示「经验」 | 已钉（L2） | 同文件第 98 行；页脚由 `Panel.tsx` 的 `BoardLine` 在 `available` 为假时不渲染 |
| L4 | DevTools 截图 | 未做 | 2026-11-04 的桌面批次（m5 节点批注）只记了「面板经验页可见」，没有逐条截图记录 → 第 4 批 |

### `lessons` 与 `m5` 节点上还开着的项

| 项 | 依赖 | 是否满足 | 处理 |
| --- | --- | --- | --- |
| `lessons-1` 的 M7 一侧：派发简报调 `relevant`、交回处理调 `propose`（M7 E1b） | M7 的派发简报与交回处理合入 main | 否：在 `origin/m7` 上，未合入 | 等 M7 线；不做 |
| `lessons` 合起来：周报里每条经验命中的会话数、经验存在后同一报错又出现的会话数（M7 E8） | M7 周报 | 否 | 等 M7 E8；不做 |
| S7 评审观察 4：`propose` 的 `by.session` 记派发方会话，三会话规则数的是派发方 | M7 接入时定 `into` 数哪个会话 | 否 | 等 M7 E1b；不做 |
| `lessons-4` 第一批经验导入真实存储 | — | — | 归编排方（任务说明），不做 |
| `lessons` 行出厂启用（`packages/hourness/cordis.patch.yml` 仍 `disabled: true`，注释写「首轮桌面验收之后」） | 经验行的首轮桌面验收：种子导入与页面已看过（2026-11-04），失败提醒（`lessons-2`）在真机上还没记录 | 部分 | 改出厂默认会改所有新装用户拿到的工具面，由编排方在第 4 批的证据之后定；本计划不排 |
| 主 Agent 判断的模式核对换成 M3 的读法 | M3 在 `mainAgentOf` 旁加读法 | 否（见 §0 第 5 条） | 等 M3；不做 |
| 汇报细度节名（`glm:persona` → `glm:reporting-depth`） | M3 `m3-main-persona` | 是 | 代码已改；剩文档与注释 → 第 3 批 |
| 板块登记表 `boards.ts` | plain-ui | 是 | 已了结（§0 第 3 条），无活 |
| M3 附录 0.6 §3.15 的请求：`glmHournessMemory.storeDelegation`/`forgetDelegation`，`memory_store` 拒 `delegate-` 开头的名字，`record_human_answer` 的 `delegation` 改调它们，删 `src/design/stage-notice.ts` 的提醒行及其测试（m5 节点 2026-10-31T20:01:30Z 批注） | M5 合入 main | 是（M5 已合入；图上没有 `norm-delegations` 节点，没有要搬的项） | **不排**：不在任务说明点名的项里（它记在 `m5` 节点，不在 `m5-1`），要改 M3 的设计行与 guard 规则 `main-agent-graph-delegations`（DEVELOPMENT.md §1.1 要独立评审）；由编排方定是否另开一批 |
| 2026-11-04 桌面批次留下的两件人定事项：①直述的习惯是否也必须先问；②`memory_habit` 提示是否升级为显式规则 | 人 | 否 | 等人（经编排方）；不做。`m5-4` 的节点验证层是 L2、L3，不含 L4，这两件不挡 `m5-4` 按 L2/L3 证据关 |

## 3. 批次

全部按序执行；每批一个提交，绿了推 `origin/m5-rest`。每批的通用规程见 §4。

- [x] **第 0 步：基线（不提交）。** 在未改动的树上跑一遍全量门禁，记下今天的数字：`npm test` 的用例数与失败数、eslint/knip/jscpd 三个棘轮数（任务给的是 76 / 19 / 1；main 前进后若不同，以本步实测为准并在报告里写出来）、探针通过数 N/N。任何一道不是 0：先按 §4 第 5 条判是不是负载下的计时失败；不是就停下，用 `send_message` 的 `warning` 报给编排方（红的不是本分支造成的）。
      文件：只写 `.llm\logs\m5r-base-{build,preflight,test,probe}.log`。
      验证：四个退出码为 0。
      结果（2026-11-05，树已快进到 `origin/main` `035f8b5`，比规划时多 4 个只改 `docs/graph` 的提交）：build 0、preflight 0。`npm test` 首跑 1：`tests/lessons-seed.spec.ts` 3 败，原因是本检出没有被 `.gitignore` 挡住的操作文件 `.agents/tasks/m5/lessons-seed.json`（规格的 setup error 要求它在检出里）；从主检出只读拷来（SHA256 与各检出的同名文件相同）后重跑 0，2939 过、0 败、1 跳过。棘轮实测 eslint 73 / knip 18 / jscpd 1（低于任务给的 76 / 19 / 1，以后各批以 73 / 18 / 1 为上限）。探针 1：374/376，两条败都在 `rules-peak-stop`（子 agent 多了第 5 个请求：解除等待单的唤醒在目标完成之后才以 followup 到达，而不是在第 4 个请求里），当时另有两个检出的探针在并行；同一 main 代码在别的检出 03:40、03:45 的探针都是 376/376。按 §4 第 5 条当作负载下的计时失败候选：探针不能单跑一个场景，就把第 1 批的全量探针（第 1 批只加 `.agents/tasks/` 下的 `.md`，探针不读）及之后各批的探针当作重跑，`rules-peak-stop` 连过 3 次才算抖动，结果写进各批的提交信息。

- [x] **第 1 批：带入 0.7 的评审记录与本计划**（docs）
      做什么：提交 `.agents/tasks/m5/reviews/` 下已拷好的 14 个 `.md`（§1）与本文件。不改别的。
      文件：`.agents/tasks/m5/reviews/*.md`（14 个，新）、`.agents/tasks/m5/rest-plan.md`（新）。
      L2：无新增。L3：无新增场景，跑全量探针作门禁。文档：本批就是文档。
      提交：`docs(m5): carry the 0.7 amendment and step reviews over from the s12 worktree; plan the rest of M5`
      验证：§4 全量门禁四道退出码 0；`git show --stat HEAD` 只列这 15 个文件。

- [x] **第 2 批：`m5-4` 撤掉确认习惯的 28 天按撤掉那天算，补齐没钉住的验收字句，写验收证据**（fix + test + docs）
      依赖：第 1 批。
      做什么，失败在先：
      1. 先在 `tests/memory-habit.spec.ts` 加 G1 用例（放在第 112 行「a no blocks the same habit for 28 days…」之后）：`ask`（带 `learnedFrom: ['edit:goal.stage']`）→ 人回话 → `confirm` → 时钟拨到第 20 天 → 带人原话 `memory_forget`（会话里人的消息含这句话，用 `talkOf([...])` 给）→ 第 27 天同组键、换名字换说法再 `ask` 被拒（码 `known`）→ 第 30 天仍被拒 → 第 47 天仍被拒 → 第 49 天能问（`asked: true`）。在改代码前跑这个规格，记下第 30 天那一断言失败（今天第 28 天起就能问）。
      2. 修 D1：`src/memory/model.ts` 的 `MemoryEntry` 加 `readonly forgottenAt?: string`（注释：被 `forget` 记录撤下的时刻；`restore` 去掉它；只在折叠里，不写进流水）；`applyRevoke` 在 `forget` 时写 `forgottenAt: record.at`，在 `restore` 时用解构去掉 `forgottenAt` 再置 `active`（`exactOptionalPropertyTypes` 下不能赋 `undefined`）。`src/memory/habit.ts` 的 `earlierOutcome` 里把 `fresh(entry.lastReviewed, …)` 改成 `fresh(entry.forgottenAt ?? entry.lastReviewed, …)`，并把 `KNOWN_FORGOTTEN_DAYS` 的注释改成「人撤掉一条确认过的习惯之后，多少天内它仍答 known」。拒绝码与信息不变。若 `memory-model.spec.ts` 里有对整条 `forgotten` 条目的 `deepEqual`，按新字段更新期望（这是本批要的行为）；`memory_query`、`/memory show`、索引只列 `active` 条目（`src/memory/index.ts` 第 183 行的过滤），工具输出不出现新字段，相关规格应原样通过。
      3. G2：在 `memory-habit.spec.ts` 第 231 行的用例末尾接着断言：同一会话里不带 `relay` 的 `memory_forget commit-in-english` 得 `preference_owner`，流水行数不变。
      4. G3：`tests/memory-learning.spec.ts` 第 185 行的用例在调工具前后各取一次图目录的快照（`loadGraph(row.graphDir)` 的节点 id 与 `revisions`，或目录下全部文件的内容），断言相同；第 61 行的提醒用例在提醒发出后做同样断言。断言写「图上没有新增节点或修订」。
      5. G4：`tests/lessons-panel-model.spec.ts` 加一个用例：`POLL_MS`（从 `ui/src/graph/watched-files.ts` 导入）不超过 `15_000`，且 `LessonsSource` 不传间隔时用它（看构造参数默认值，或用假时钟数一次轮询；选能不改源码就测的那种）。
      6. 证据文件：新建 `.agents/tasks/m5/impl/rest-acceptance.md`，把 `m5-1` 九条、`m5-4` 八条、`lessons-3` 四条逐条对到「规格文件 + 用例名」与探针检查名（`glm-memory`、`non-glm-memory`、`glm-memory-habit`、`glm-memory-depth`、`glm-memory-compact`、`glm-worker-memory`），每条写「已钉 / 本批补 / L4」。§2 表里写的行号是规划时读到的，以文件现状为准。若对的过程中又找到没钉住的字句，在本批补测试；补测试暴露出新的行为不符而修法会改人看得到的东西，就停下用 `send_message` 的 `warning` 问编排方。
      文件：`src/memory/model.ts`、`src/memory/habit.ts`、`tests/memory-habit.spec.ts`、`tests/memory-learning.spec.ts`、`tests/lessons-panel-model.spec.ts`、（如需）`tests/memory-model.spec.ts`、`.agents/tasks/m5/impl/rest-acceptance.md`（新）、`docs/ORCHESTRATION.md` §8.5「习惯先问再记」一条（在 `decline` 那句之后加：人带原话撤掉（`memory_forget`）一条确认过的习惯，从撤掉那天起 28 天内同一条再问得 `known`）。不新增规格文件，所以 `package.json` 的 `test:1`/`test:2` 不改。
      L2：上面五处。L3：无新场景（28 天的时钟只能在 L2 拨）；全量探针里 `glm-memory-habit`、`glm-memory`、`non-glm-memory` 必须仍过。文档：ORCHESTRATION §8.5 一句、证据文件。
      提交：`fix(m5-4): a confirmed habit the person withdrew is not asked again for 28 days from the withdrawal; pin the untested acceptance clauses`
      验证：单跑 `node --experimental-strip-types tests/memory-habit.spec.ts` 新用例改前失败、改后通过；`tests/memory-learning.spec.ts`、`tests/lessons-panel-model.spec.ts`、`tests/memory-model.spec.ts` 单跑通过；§4 全量门禁四道 0，棘轮不升。

- [ ] **第 3 批：M5 的现状文字对齐 main**（docs）
      依赖：第 2 批（同改 ORCHESTRATION §8.5，避免同段两次冲突）。
      做什么（被取代的句子整句重写，不留旧文）：
      1. `docs/ORCHESTRATION.md` §8.1 标题括注改为：M5 步骤 M1、G1、H1 已实现并合入 main，验到 L2、L3；2026-11-04 的桌面批次走过习惯流与种子导入，留两件待人定（项目图 `m5` 节点）。
      2. §8.5「汇报细度闭环」一条：`glm:persona` 一节改 `glm:reporting-depth` 一节；「没有时用配置的 `persona`」改「没有时用配置的 `reportingDepth`（旧键 `persona` 照读，见 `DESIGN.md` §5.2 之后的 `reportingDepth` 一段）」。
      3. §8.6 标题括注改为：M5 步骤 L1、L2、P1、S1 已实现并合入 main，验到 L2、L3；种子导入、`/lessons` 与面板经验页在 2026-11-04 的桌面批次里看过；行出厂仍禁用。正文「会话投影 `hournessLessons` 把项目流水的路径交给将来的经验页」改为「交给面板的经验页（`ui/src/lessons/`）」；命令行的出处 `DEVELOPMENT.md` §13 改 §14（§13 是规则板命令行，§14 是经验命令行）；「还没做」一条删去「经验页（步骤 P1）、第一批经验（步骤 S1）」，只留 M7 的 E1b 与 E8。
      4. `scripts/probe/run-probe.mjs` 汇报细度那段注释（`// Reporting depth (M5 design §3.7, m5-5): the glm:persona section …`）改 `glm:reporting-depth`。只改注释。
      5. `docs/HANDOFF.md` §3 组件状态表：`memory` 行「工具与用量流水可用，用量写用户级目录；记忆几乎未被使用」整行重写为现状（按会话的项目流水与用户级流水、开局索引、`memory_habit`、`learning_signals`，指向 ORCHESTRATION §8）；在它之后加 `lessons` 行（经验板，出厂禁用，指向 ORCHESTRATION §8.6）。§8 编排层模块表的「M5 记忆与经验」一行重写：已合入 main（`e654b0a`、`80d4612`），本分支补的第 2 批，剩下的等项按本文件 §5 写成一句（M7 E1b/E8、两件待人定、`lessons-3` 的 L4）。
      文件：`docs/ORCHESTRATION.md`、`docs/HANDOFF.md`、`scripts/probe/run-probe.mjs`。
      L2、L3：无新增；全量门禁照跑（`npm test` 里有文档相关检查与 `check:verbatim`）。
      提交：`docs(m5): the M5 status in ORCHESTRATION and HANDOFF follows main; reporting-depth section name`
      验证：§4 全量门禁四道 0；`git diff HEAD~1 --stat` 只列这三个文件。

- [ ] **第 4 批：经验页的桌面验收（`lessons-3` L4）**（docs，记录）
      依赖：第 3 批。只读代码，不改代码。
      前置（任一不满足就停下，用 `send_message` 的 `warning` 问编排方，等回话）：
      - 桌面锁：`New-Item -ItemType Directory C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\desktop-lock`，建得了才用；`owner.txt` 写 `wf_65d23b8072019258 build-loop/code 第 4 批` 与时刻，持有期间每 10 分钟内至少重写一次，用完删掉整个目录。建不了：看 `owner.txt` 的修改时刻，超过 30 分钟没重写才算残留，删掉时在本批记录里写明删了谁的锁；否则每 60 秒重试。
      - 桌面版：DEVELOPMENT.md §1.1 的 L4 行。运行中的实例不杀；它没开 `--remote-debugging-port` 就停下问。要自己起实例时用独立 `--user-data-dir`，等旧进程退出与锁文件释放。只经 CDP 点击、输入与截图，不用系统级输入；截图只拍全窗，本地裁剪（DEVELOPMENT.md §7 2026-11-04 Skia 一行）。杀自己起的进程只按命令行特征（`--user-data-dir` 标记）匹配，不按 exe 路径。
      - 代码一致：记下桌面版加载的包所在检出的 HEAD，`git diff --stat <那个 sha> HEAD -- ui/src/lessons ui/src/graph src/lessons src/memory` 为空才往下（第 2、3 批不改 `ui/`；`src/memory` 的 D1 修复若还没进那个检出，只影响习惯问话，不影响页面，记在记录里即可）。不在主检出上 build。
      - 两行在跑：经 CDP 在插件管理或 `/hourness-status` 里看 `memory` 与 `lessons` 两行的状态。`lessons` 行没在跑（它出厂禁用）：不改 `~/.dsh`，停下问编排方是否在 profile 里启用。
      做什么：
      1. 临时项目：`%TEMP%` 下新建一个 git 仓库（一个提交），经 `npm run -s lessons -- --cwd <临时仓库> apply --file <操作文件>` 写入 3 条经验、1 条候选、1 条收起的、1 条人删的（操作文件放 `.worktrees\m5-rest\.llm\m5r-l4\`，不入库）。项目范围的记忆（一条带 relay 的偏好、一条 `relayChecked: false` 的偏好、一条事实带出处、一条经 ask 与带 `data.ask` 的 store 确认的习惯且确认后正文改过、一条 ask 后 decline 的习惯）用一次性 node 脚本经 `src/data/journal.ts` 的追加函数写进 `<临时仓库>/.llm/memory.jsonl`，记录形状照 `tests/memory-helpers.ts`；脚本放 `.llm\m5r-l4\`，用完不留在仓库里。不写人的用户级记忆流水与真实项目的 `.llm/`。
      2. 经 CDP 在桌面版里以临时仓库为工作区新建会话，先核对当前会话就是这个新会话，再打开面板，从页脚「经验 ›」进经验页。
      3. 逐条看并拍全窗截图（存 `.llm\m5r-l4\`）：第 1 条的经验一半（行、候选数一行、两组默认折起）与记忆一半（原话、「原话未核对」、确认习惯的问话行与「要记的」行与「内容在你确认之后改过」行、事实的出处与强度、汇报细度一行、折起的「你说过不用记的习惯」及「几号之前不再问」、每条的「要改」行）；人的用户级偏好也会出现在页上，记录里只写条数，不抄内容。第 2 条：经 CDP 在页面区域数 `button`、`input`、`textarea`、`select`、`form` 与带 `role="switch"` 的元素，记下个数（应为 0；面板自己的返回与导航不在页面区域内）。第 3 条：再 `apply` 一条经验，记下从命令返回到页面出现新行的秒数（应不超过 15）。第 4 条：不关行就看不了，记为「L2 钉住（`lessons-panel-model.spec.ts`），L4 未看」。
      4. 收尾：经 CDP 抓 5 秒控制台，确认没有出自本项目包的新错误、没有新的 crash log；关掉自己起的实例或会话；删临时仓库；删桌面锁。
      5. 记录：新建 `.agents/tasks/m5/l4-<日期>.md`，照 `.agents/tasks/loops-runner/l4-2026-11-04.md` 的版式（范围、环境、启动检查、逐项结果表、发现分挡路与不挡路、操作留痕）。截图不入库，记录里写文件名。
      文件：`.agents/tasks/m5/l4-<日期>.md`（新）；本文件第 4 批打勾。
      L2、L3：无新增；全量门禁照跑。
      提交：`docs(m5): desktop acceptance (L4) of the lessons page (lessons-3)`
      验证：§4 全量门禁四道 0；记录里四条各有结论与依据；桌面锁目录已删。

## 4. 每批通用规程

1. 开批前 `git fetch origin`；`origin/main` 前进了就 `git merge origin/main`（合并提交单独一个，不并进批次提交），随后先跑全量门禁再动手（DEVELOPMENT.md §5 第 9 条）。冲突按两边意图调和；`.agents/tasks/m5/` 下的冲突以本分支为准。
2. 全量门禁按序，每道都用 `cmd /c "<命令> > .llm\logs\m5r-b<批号>-<道>.log 2>&1"`，紧接着取 PowerShell 的 `$LASTEXITCODE`，不用管道：`npm run build`、`npm run preflight`、`npm test`、`npm run -s probe`。四道都是 0 才提交。
3. 探针前取锁：`New-Item -ItemType Directory C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\probe-lock`，失败就试 `...\.llm\probe-lock-2`；两个都在就每 60 秒重试；建于 45 分钟以前的锁目录视为残留可删（报告里写明）。探针结束后删掉自己取的那个。探针运行中不重建本检出。
4. 棘轮：`npm test` 输出里的 eslint 压制数、knip、jscpd 不许高于第 0 步实测（任务给的上限 76 / 19 / 1）；不往 `eslint-suppressions.json`、`knip-baseline.json`、`.jscpd-baseline.json` 加条目。新测试里不写令牌形状的字面量（`.gitleaks.toml` 只放行 `tests/memory-habit.spec.ts` 里那一个假串）。
5. 机器负载高时的纯计时失败（超时、毫秒阈值、`ENOTEMPTY` 竞态）：先单独重跑该规格 3 次（`node --experimental-strip-types tests/<名>.spec.ts`），3 次都过才算抖动，并在报告里写明；否则当真红处理。
6. 一批一个提交，提交信息不写人设；绿了 `git push origin m5-rest`。不强推，不推 `github`。
7. 不往主检出写任何东西（`.llm/probe-lock*` 与第 4 批的 `.llm/desktop-lock` 除外）；不改 `.worktrees/m5`；不编辑 `docs/graph`（记录归编排方）；不动 `~/.dsh` 的 profile 与人的记忆文件。
8. 测试里不让 `projectOf`、`ensureProjectDir`、`ensureIgnored` 落到本工作树路径上（会经 `commondir` 写主检出）：沿用现有规格的临时夹与 `tests/temp-outside-git.ts`。
9. 每批结束在本文件把该批打勾，并在 `.agents/tasks/m5/impl/progress.md` 末尾加一节：提交号、四道门禁退出码、`npm test` 用例数、探针 N/N、棘轮三数。

## 5. 等着的项（本次不做）

| 项 | 等谁 |
| --- | --- |
| `lessons-1` 的 M7 一侧（简报带经验、交回调 `propose`）与 `propose` 的会话计数口径 | M7 线：E1b 与 E6 在 `origin/m7`，合入 main 之后 |
| `lessons` 的周报一节 | M7 E8 |
| `m5-4` 桌面批次留下的两件（直述习惯是否先问；`memory_habit` 提示是否升级为规则） | 人，经编排方 |
| `lessons` 行出厂启用 | 编排方，在第 4 批证据与 `lessons-2` 真机失败提醒核对之后定 |
| `isMainAgentFor` 的模式核对换成 M3 的读法 | M3（新读法尚未出现） |
| M3 附录 0.6 §3.15 的「这类你定」搬进记忆偏好 | 编排方定是否纳入（依赖已满足，不在本次任务点名的项里） |
| `lessons-4` 第一批经验 | 编排方（数据整理） |

## Digest

规划时已验证：`1a6eb15` 上 `pnpm install --offline` 退出码 0、`npm run build` 退出码 0。preflight、`npm test`、探针未跑（第 0 步跑）。下面的行号是在 `1a6eb15` 上读到的。

| 文件 | 要改的块 | 覆盖的测试 | 批 |
| --- | --- | --- | --- |
| `.agents/tasks/m5/reviews/*.md`（14 个）、`.agents/tasks/m5/rest-plan.md` | 新文件，已就位 | 全量门禁 | 1 |
| `src/memory/model.ts` | `export interface MemoryEntry`（第 45–80 行，`lastReviewed` 第 77 行、`status` 第 80 行）加 `forgottenAt?`；`function applyRevoke(state, record, op)`（第 644–656 行），第 655 行 `withEntries(state, … [{ ...entry, status: op === 'forget' ? 'forgotten' : 'active' }])` 改为 forget 写 `forgottenAt: record.at`、restore 去掉它 | `tests/memory-model.spec.ts`、`tests/memory-habit.spec.ts` | 2 |
| `src/memory/habit.ts` | `const KNOWN_FORGOTTEN_DAYS = 28`（第 37 行）注释；`function earlierOutcome(states, request, nowMs)`（第 90 行起），第 99–100 行 `entry.confirmed !== undefined && (entry.status === 'active' \|\| fresh(entry.lastReviewed, nowMs, KNOWN_FORGOTTEN_DAYS)) && matches(entry)` 的 `entry.lastReviewed` 改 `entry.forgottenAt ?? entry.lastReviewed` | `tests/memory-habit.spec.ts` 新 G1 用例 | 2 |
| `tests/memory-habit.spec.ts` | 第 112 行用例之后加 G1；第 231 行用例（「updating a confirmed habit without the person's messages is unavailable…」）末尾加 G2。夹具：`withMemory`、`talkOf`、`memory.setNow`、`refusalOf`、`records`、`stateOf`、`HABIT`、`REPLY`、`OTHER_REPLY`、`T0`、`DAY`、`MAIN`（都在该文件或 `tests/memory-helpers.ts`） | 本文件 | 2 |
| `tests/memory-learning.spec.ts` | 第 185 行用例（`learning_signals answers with the groups of the window…`，第 201 行已有 `journalLines(row.project)` 为空的断言）与第 61 行提醒用例加「图没被写」的断言；`row.graphDir`、`loadGraph` 已导入 | 本文件 | 2 |
| `tests/lessons-panel-model.spec.ts` | 加 G4 用例：`POLL_MS`（`ui/src/graph/watched-files.ts` 第 23 行 `export const POLL_MS = 15_000`）≤ 15 000，`LessonsSource` 构造参数 `pollMs: number = POLL_MS`（`ui/src/lessons/source.ts` 第 72 行） | 本文件 | 2 |
| `.agents/tasks/m5/impl/rest-acceptance.md` | 新建，逐条证据 | — | 2 |
| `docs/ORCHESTRATION.md` | §8.5「习惯先问再记」一条加一句（第 2 批）；§8.1 标题（第 1085 行）、§8.5「汇报细度闭环」一条（第 1122 行，含 `glm:persona` 与「配置的 `persona`」）、§8.6 标题（第 1125 行）、§8.6 命令行一条里的「将来的经验页」与 `DEVELOPMENT.md` §13（第 1132 行）、「还没做」一条（第 1135 行）（第 3 批） | 随行为提交；`npm test` | 2、3 |
| `scripts/probe/run-probe.mjs` | 第 1419 行注释 `the glm:persona section` | `npm run -s probe` | 3 |
| `docs/HANDOFF.md` | §3 组件状态表 `memory` 行（第 52 行）；§8 表「M5 记忆与经验」行（第 151 行） | — | 3 |
| `.agents/tasks/m5/l4-<日期>.md` | 新建，版式照 `.agents/tasks/loops-runner/l4-2026-11-04.md` | — | 4 |
