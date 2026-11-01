# split 分支独立代码评审（第 1 轮）

评审对象：分支 `split`，`54cec72`（第 0–8 步共 9 个提交），合并基点 main `b5eb2c9`；`git diff main...HEAD` 110 个文件，+3969 / −930。
依据：任务说明与父任务更新（question-17 B）；`design.md` 0.3；`design-addendum-q17b.md` 0.5（与 0.3 不同处以附录为准）；`low-decisions.md`；`guard-g3-design.md` 0.1，对照 `reference/dsh-desktop-0.2.1-rc.3/` 与 `docs/DESIGN.md` §2.4a；`graph-step8.json`；`AGENTS.md`、`docs/DEVELOPMENT.md`。
上一轮评审：`branch-review.md` 此前不存在，本轮是第一轮，没有待核对的旧意见。
结论：APPROVED。没有 HIGH、MEDIUM 意见；下面三条 LOW 说明不阻塞合入。

## 1. 门禁证据（读提交信息与 `.agents/tasks/split/step*-*.log`，没有重跑）

| 步 | 提交 | build | preflight | npm test | 探针 |
| --- | --- | --- | --- | --- | --- |
| 0 | `02de37d` | ok | ok | 569 通过 | 95/95，生成的 `probe-full` |
| 1 | `51eba65` | ok | ok | 580 通过 | 95/95 |
| 2 | `77583d7` | ok | ok | 595 通过 | 98/98 |
| 3 | `ff4fe8c` | ok | ok | 601 通过（rebase 到 `b5eb2c9` 后先跑 596） | 99/99 |
| 4 | `877b1aa` | ok | ok | 603 通过 | 100/100 |
| 5 | `f28ca70` | ok | ok | 616 通过 | 111/111，三种 profile |
| 6 | `40190cf` | ok | ok | 620 通过 | 112/112 |
| 7 | `662b9fd` | ok | ok | 624 通过 | 115/115 |
| 8 | `54cec72` | ok | ok | 625 通过 | 未跑；`design.md` §7.1 第 8 步只要求「全」，改动只在客户端面板与文档 |

检查器基线每步都没有增长：逐字门禁 442 条、269 行（第 1 步由 443 减 1，原因写在提交信息里，受检行数不变），ESLint 压制 250，knip 21，jscpd 2 处 16 行，gitleaks 无发现。第 1、6 步的边界规则演示写在提交信息里（未提交的越界导入报 `no-restricted-imports`，还原后全绿）。第 5 步开工前核对过 main 上的行名仍是路径形式（question-18 A、R30）。

## 2. 对照要求逐项核对

- 第 0 步：探针在运行目录下生成 DSH home 与 profile，按 `DSH_HOME` 启动；运行前已有同名 profile、生成失败、或桌面版与 glmsandbox 的本项目结构在运行中变化时退出码 2；退出时拆掉全部 junction（`scripts/sandbox.mjs` `unlinkProfile`，`scripts/probe/run-probe.mjs` 的 `exit` 钩子）。`scripts/profile-shape.mjs` 只输出 id、键名、包名、摘要与差异类别，`tests/profile-shape.spec.ts` 断言假值不进输出与快照。
- 第 1 步：X1–X4 迁入公共库；`installStepNotice` 的行名必填；`zcode-notice.ts` 进 `MIRROR_FILES`；逐字门禁的导入块规则有 `tests/check-verbatim.spec.ts`；ESLint 边界由 `scripts/packages.mjs` 生成；表自检在 preflight。
- 第 2 步：规则只认原生名，`toNativeTool` 先问方言服务再查 `ZCODE_ALIAS_NATIVES`；`claims` 只认装好方言的 agent（`active` 在 `installDialect` 成功返回后加入）；`glm:memory` 按 `next()` 返回的工具判定；契约测试钉住静态表与 `aliasSpecs` 加 `Read`、`TodoWrite` 一致。
- 第 3 步：`credits.ts` 迁到 `src/glm-llm/`；`glm-login` 提供 `glmHournessPricing`，提供失败时命令照常注册、行健康 degraded；报告行不再导入任何 GLM 代码，无服务时按调用与 token 列，`charged` 抛错的记录单独计数。
- 第 4 步：行健康按包分组，单包缺席只占一行；`/hourness-status` 由报告行注册，文字与 `/glm-status` 凭证行之后相同；pill 的解析改读四列，`tests/health.spec.ts` 钉住全表不含「已登录（套餐」、新增文字不含「未登录」。
- 第 5 步（附录 §3.1）：两个宿主包的清单、patch（每条 insert 以 `id` 开头，G22）、tsconfig、locale 与图标；根 `package.json` 没有 `dsh`、`main`、`exports`、`files`，`private`，名字仍在第 2 行，`peerDependencies` 保留；根 `cordis.patch.yml` 与 `locale/` 删除，`icon.svg` 移到 `packages/hourness/`；`src/ui` → `src/report`；`clean-dist.mjs`、`knip.js`、`tsconfig.knip.json`；preflight 按附录 §3.3 改写，`tests/preflight.spec.ts` 有对应夹具。
- 第 6 步（附录 §3.2）：两个嵌套客户端包，`glm-hourness/glm-ui` 默认禁用（AGENTS.md 第 4 条），`glm-hourness/ui` 沿用 id 并启用；`ui/` 的清单、patch、宿主半、locale、图标与 `client.tsx` 删除；`LEGACY_CLIENT_BUNDLE` 及其读取方全部删除；`ROW_IDS` 字面清单 13 项（R32）；`probe-full` 只列两个包；client-modules 场景核对两个客户端包各组合一次（U3）。
- 第 7 步（question-14 G3）：`src/guard/index.ts` 两处模型族判定都已删除，每次根调用按规则判定，带 `parent` 的子调用放行；每个 agent 的每次组装都追加 `glm:guard`，方言接管时用方言名，否则用原生名；`outOfScopeHealth` 删除；违规与影子记录带 `scope`、`route`（`src/guard/origin.ts`），影子一轮的 `scope` 按 G2 归组；晨报把 `scope: other` 另行计数，旧记录照原写法。宿主契约抽查：`dsh-tools` lib/index.js:3320–3321 在 `scopeTarget(this, exec.agent)` 上跑 `tools/pre-execute`，`deny` 时结果是 `Error: ` 加理由、工具体不执行；`dsh-scope` lib/index.js:327–335 对没有作用域标记的上下文放行。所以删掉本项目的两处判定后 C、N、O 三类调用都进同一套判定。GLM 包目录（`glm-llm`、`glm-prompt`、`toolsearch`）里没有 `tools/pre-execute` 监听器，唯一的组装监听器是方言改写，只装 GLM 包时没有拦截与声明，探针 `glm-only` 核对过。`ORCHESTRATION.md` §6.2 整节按人的原话重写，旧定案注明被取代；`DEVELOPMENT.md` §7 事故表作为历史保留，符合设计 §7。
- 第 8 步：`headlineGoals` 列出全部未关闭的目标，全部关闭时取第一个，没有目标时为空；CHARTER 0.6 §3 分两组，文字按设计 §6.2、§6.3，§3.2 带 question-27 B 的减负一条；README 首段；没有改 `docs/graph/`。
- LOW 决定（R28–R32）与附录第 5 轮 NIT（E01–E03）记在 `low-decisions.md`；R31 的客户端行位置写进 `DESIGN.md` §2.3；E01–E03 只涉及不入库的切换脚本，分支里没有对应代码，不在本轮范围。
- 并行约束：分支没有改 `docs/graph/`；主检出 `git status --porcelain` 只有 `?? .kiro/`，worktree 干净。

## 3. graph-step8.json 的试运行

在 `.agents/tasks/split/` 下复制 main `78703f3` 的 `docs/graph/nodes` 到临时目录，用 worktree 的 `npm run graph -- --dir <副本>` 依次执行 8 条请求，写死的修订号与当前不符时报告并换成当前值，跑完后删除临时目录与脚本。结果：8 条全部 ok；`open` ok；`glm-house` 为根目标、`doing`，验收 5 条、非目标 4 条；`hourness` 验收 6 条、非目标 5 条；`bottom`、`q-old-folder` 的父节点为 `glm-house`；`m6` 仍在 `orch` 下；`split` 验收 3 条。`hourness`、`bottom`、`q-old-folder`、`m6` 写死的修订号与当前相同，`split` 的不同（见 L1）。

## 4. LOW 说明（不阻塞）

### L1 `graph-step8.json` 里 `split` 的修订号已过期

- 位置：`graph-step8.json` 第 8 条，`"rev": "ed819125db8a"`；main `78703f3` 上 `split` 的当前修订号是 `230b2af26b67`（main 在分支之后又给 `split` 加过批注）。
- 后果：原样执行时引擎返回 `stale_revision`，图不写入，能看见、能重试，没有数据损失。合入之后 main 还会再变，其他四个修订号也可能过期。
- 建议：编排者落图时每条请求先 `graph show` 取当前修订号，再执行；内容本身在试运行里通过。

### L2 `docs/HANDOFF.md` 行状态表里的 UI 行仍是单包布局的说法

- 位置：`docs/HANDOFF.md` §3 行状态表 `glm-hourness/ui` 一行写「设置页、输入框「GLM 通道」按钮、右侧栏「项目图」页签」，表里没有 `glm-hourness/glm-ui`。第 6 步之后设置页与按钮在 `glm-hourness/glm-ui`（默认禁用），`glm-hourness/ui` 只剩项目图面板。§1 的安装形态已经按两包写对。
- 后果：这张表记的是桌面版上的现状，合入并切换 profile 之前桌面版仍是旧布局，所以今天读起来不算错；合入之后若不改，交接文档会把 GLM 按钮记在错误的行上。
- 建议：在附录 §3.4 的清理提交里（L4 第一轮之后）一并改写这一行并补 `glm-ui` 一行。

### L3 分支落后 main 30 个提交，rebase 时有已知的文本冲突

- 事实：合并基点 `b5eb2c9`，main 已到 `78703f3`。main 上除图提交外改了 `src/graph/engine.ts`、`projection.ts`、`tools.ts`，新增 `src/graph/main-agent.ts`、`stage.ts` 及其测试，并改了 `package.json` 的测试列表、`scripts/probe/run-probe.mjs`、`docs/DEVELOPMENT.md`、`docs/ORCHESTRATION.md`。与分支重叠的文件有 6 个：`package.json`、`scripts/probe/run-probe.mjs`、`tests/graph-panel-model.spec.ts`、`tests/graph-tools.spec.ts`、`docs/DEVELOPMENT.md`、`docs/ORCHESTRATION.md`。main 的新模块只在 `src/graph/` 内互相导入，落在编排层包的目录里，不触发边界规则，也不需要改目录表。
- 后果：附录 §4.1 已要求申请时段之前 rebase、跑全量门禁与探针，这一条只是提前列出冲突面。测试列表冲突要保留 main 新增的两个 spec；`run-probe.mjs` 里 main 改过的种子待决（推荐项放最后）要与分支的 `hourness-only` 种子图一起核对。
- 建议：rebase 后照附录 §4.1 跑门禁与探针，提交信息写明冲突的解决方式。
