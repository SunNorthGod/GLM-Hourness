# docs-at-hand 设计评审

## 第 1 轮（对 design.md 0.1）

- 评审者：独立设计评审 agent（Cursor 子 agent），只读主检出、`m3` 工作树与 rc.3 导出包，没有运行 DSH、探针、构建或测试。
- 时间：2026-11-07（UTC+8）。
- 对象：`.agents/tasks/docs-at-hand/design.md` 0.1 与同目录 `onepage.md` 0.1。
- 标准：`docs/DEVELOPMENT.md` §1.1 的挡路三类（`d-failure-plans`）；节点 `docs-at-hand` 的第 1 条验收（第 2 条归人，不在本轮）。
- 结论：APPROVED。

第 1 条验收逐项核对：四件各自的做法（§4、§5、§6、§7）、模块与位置（§0 表、§5.6、§6.3、§7.1–§7.2）、验证层级（§4.5、§5.8、§6.4、§7.5）、与项目图、经验板、M7 交回的分工（§3 表、§4.3、§4.4、§5.2、§5.5、§6.1–§6.3、§7.3）都写了；DSH 是否加载子目录 `AGENTS.md` 有实测结论（§1.2 三个场景，§1.3），结论的主干与 rc.3 源码一致。实施顺序与工作量（§11）、定稿后的归档位置（§12）、宿主接口的 rc.3 证据或未核实清单（§8、§9）都在。一页稿三问，每问有选项、推荐与理由，用词是人话；两份文件里没有人设与语气词。

### 挡路

无

### 不挡路

N1
- 位置：§1.3 第 3 条，§1.4 拟进 `FACTS.md` 的文字。
- 问题：「没有文件监视，外部改动要等下一次触碰」与源码不符。每次 `agent/pre-step` 都调 `compose`（agent-instructions:1406–1410），`compose` 无条件调 `reconcileInstructionContext`（1317），后者把可见历史里出现过的全部作用域重新加入待查集合（`effective.keys()`，1046–1051），逐个按提供方的 `version` 重查（1129–1136），版本变了就重读并出「Updated instructions from」或「Instructions removed」。所以已经加载过的子目录文件被外部改动或删除，下一次请求就会出替换或移除，不需要再触碰；只有从未加载过的目录要等触碰。这半句标了〔实读〕〔实测〕，但 §1.2 的表里没有「不触碰、外部改文件」的场景，标签对它不成立。§1.4 的「之后再触碰时，改过的文件以……整份替换」会把同样的误读写进事实账。§5.3 的并存规则不受影响。
- 建议的改法：第 3 条改为「已加载的文件每一步按版本重查，改了或删了在下一次请求出替换或移除；没加载过的目录要等原生文件工具触碰」，标〔实读〕；§1.4 的文字同步。要实测的话，在 U1 那次 L3 里顺带加一步：加载后由脚本在工作区外改文件、不触碰再走一步。

N2
- 位置：§7.1 默认条目 `loops.unsynced-daily` 给主 Agent 的文字；一页稿第 4 件。
- 问题：条目文字写「Commit or push only what the project's norms already allow (the push line of norm-merge-gate); leave the rest to the human」，一页稿第 4 件只说「叫主 Agent 跟你说一声」，人按一页稿拍板时看不到主 Agent 会在 18:05 无人在场时提交或推送。扫描范围含 worker 的 `hz-*` 工作树（可能是在跑的派发）和主检出里别的任务留下的未跟踪文稿；M7 的主干前进核对（`trunk-advance-checked`、`pushOk`）没合入之前，推送只受这句提示词约束。主 Agent 的 git 与推送权限本来由 `d-main-agent-shell` 与 `norm-merge-gate` 的 `push` 行放开，本稿没有新增能力，所以不按「对外的动作无预防」挡路。
- 建议的改法：默认条目只汇报（例：`Do not commit or push because of this reminder; tell the human what is left.`），提交与推送留给主 Agent 平常的规范路径；或者保留现文字，在一页稿第 4 件写明。`items` 里给有活着派发的工作树加标记，免得被当成漏提交。

N3
- 位置：§7.2「扫描什么（只读）」第一行。
- 问题：`git status` 默认做 opportunistic index refresh，会取工作树的 `index.lock` 并可能改写 index。扫描与 worker 或主 Agent 同时跑 git 时，对方会报 `index.lock` 已存在；循环板存储的 `gitOperationIn`（ORCHESTRATION §18.7）也会把这段时间当成 git 在忙。
- 建议的改法：命令写成 `git --no-optional-locks status --porcelain=v1 -z --untracked-files=normal`（或执行器给扫描设 `GIT_OPTIONAL_LOCKS=0`），L2 断言参数在。

N4
- 位置：§7.1 推出一条、§7.4 失败预案第一行。
- 问题：没写扫描在什么上下文里跑。项目的拍经 `beatChain` 串行（src/loops/run.ts:1144–1149），整次至多 2 分钟的扫描若在拍里 `await`，运行锁刷新（`LOCK_FRESH_MS` 3 分钟，src/loops/lock.ts:29）、投递与对账都会被推迟，重试叠上去可能让锁被判过期、被别的进程接走。§7.4 说失败进 `loop-done` 的原因码，但 `loop-done` 是条目运行的记录（带 `entry`、`run`，原因只收 `RUN_REASONS` 闭表）；推出事件这一侧的失败，现有的 `waitingOnHuman` 只报行健康（run.ts:564–566）。
- 建议的改法：扫描在拍外异步跑，拍里只看「在跑／今天查过」标记；写明失败记在哪：行健康加一条指标流水事件，或者给 `RUN_REASONS` 加码并说明挂在哪个条目上。

N5
- 位置：§6.2（乙）一列、§6.4。
- 问题：门禁自己算不出缺口时（`tools/pre-execute` 里的 `git diff` 失败或超时、按提交读不出组件）放行还是拒绝，第三件里没写，只能从 §10「读失败不挡原来的事」推出；按拒绝实现会让 worker 反复被拒、耗尽回合。「按这次的提交算缺口」没说按哪一份：`structured_output` 自报的 `commits`，还是工作树里分支的 git 状态（宪章 §6「门禁只认证据，不认自述」）。§6.4 的 L2、L3 只覆盖（乙），人选（甲）时没有对应的验证。
- 建议的改法：（乙）一列写明「算不出就放行，交回摘要批注写『文档缺口没算成：<原因>』，行健康 degraded」；缺口按工作树里分支头与派发基线的 `git diff` 算；§6.4 补（甲）的一行（交回摘要批注里的缺口数、审查简报里那一句）。

N6
- 位置：§5.6 第一行。
- 问题：`src/docs/find.ts` 写「不导入 Node 内置模块，面板能导入」，同时导入 `src/execute/scope.ts` 的 `within`；`scope.ts` 第 24 行是 `import path from 'node:path'`，两句不能同时成立。
- 建议的改法：看不出面板要用 `find.ts`，删掉「面板能导入」；真要给面板用，就把 `within` 一类纯函数挪进不依赖 `node:path` 的模块。

N7
- 位置：§5.3 并存规则，§5.1 第 1 条。
- 问题：「DSH 会送」只按工具名与路径判，没看 DSH 这一侧是否真在工作：用户在 profile 里关掉 `agent-instructions` 行、宿主没有 `fs` 服务（agent-instructions:1237–1238）、一批超过 64 KiB 时先丢浅层（§1.1 已列），原生路由上组件正文两边都不送。本行跳过带 `parent` 的调用，而 DSH 把 `run_code` 子调用的触碰冒泡给父调用照送（1435–1441），这类读文件只拿到 DSH 的正文，拿不到决策、活与经验行。读的就是组件 `AGENTS.md` 本身时，提醒里再带一份正文是重复。
- 建议的改法：「DSH 会送」再加一个条件：本会话可见历史里有来源 `agent-instructions` 的基线消息；带 `parent` 的子调用写明不管还是按父调用算；被读文件就是组件 `AGENTS.md` 时不带正文。

N8
- 位置：§5.1 第 3 条与 §5.2 经验一行。
- 问题：§5.1 说「图与经验仍按项目（`projectOf`）找」，但 `glmHournessLessons.relevant` 只收 `session`，按会话的项目定位经验（src/lessons/service.ts:175 `env.dirOf(session)`）。文件在会话以外的另一个项目里时，经验来自会话的项目，路径却按文件所在检出取相对路径，和那句说法不一致。
- 建议的改法：写明接受（文件不在会话的项目里时不列经验），或改成只在文件的项目等于会话的项目时调 `relevant`。

N9
- 位置：一页稿第 1 问选项 B。
- 问题：B 写「只做第 2、4 件（不碰 M7）」，第二件离不开第一件的组件认法与模板（设计 §11 第 2 步是「第二件加第一件的格式部分」），§5.5 派活简报那一段也在 M7 里。人按 B 拍板后，子任务的范围会和字面不同。
- 建议的改法：B 写成「第 2、4 件，连同第 1 件的文档格式；派活简报那一句不做」。

N10
- 位置：§12「定稿后归档到哪」，§2.2 最后一条。
- 问题：组件文档若日后在本仓库采用，会在 `docs/` 之外长出文档文件。宪章 §10 第 4 条要求孤儿文档为零，§11 是文档地图，`AGENTS.md` 的「文档」一节列各类内容的去处，组件 `AGENTS.md` 里的「约束与不变量」与 `DESIGN.md`、`ORCHESTRATION.md` 的单一事实源分工也要说清。本节点不给本仓库写组件文档，眼下不影响什么。
- 建议的改法：§12 记一句：给本仓库写组件文档的那一批同批改宪章 §11 与 `AGENTS.md` 的文档一节，写明组件文档的位置和它与两份设计文档的分工。

### 核对过的引用

rc.3 运行时包（`reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js`）：

- agent-instructions:16–18（候选名与 `.git` 标记）、545–564 与 574–582（`existsAsMarker` 只看 `stat`，`findProjectRoot` 往上找）、589–602（`ancestorChain`）、609–615（`descendantDirsBetween` 以工作目录为界，界外为空）、646–676（基线：用户级两处加根到工作目录的链）、256–291（Additional／Updated／removed 三种文字）、879–909（来源 `agent-instructions` 的消息）、1052（触碰路径以 `cwd` 为界）、1126–1158（版本缓存与跳过）、1210–1221（只认 `read`、`write`、`edit` 与 `file_path`）、1237–1238（没有 `fs` 不做事）、1346–1370、1384–1405、1406–1424、1425–1445（`tools/result` 收触碰，步开着等 `step/end`，下一次 pre-step 插入；1435–1441 子调用冒泡）：都相符。另读 1021–1052、1317，得出 N1。
- dsh-base `cordis.patch.yml`:303–306（`maxBytes: 65536`）：相符。
- tools:3229–3260（`createExecution`，`name` 取调用名，3232）、3320–3353（`deny` 结果为 `Error: <理由>`，工具体不执行）、3599–3627（`additionalContexts` 结果自带的在前、决策的在后）、1362–1376（`run_code` 子调用带 `parent`）：相符。
- subagent:889–961（929 暂存、930 `concludeTurn`、940–961 `tools/result` 成功才收下）、3046（`assertObjectJsonSchema`）：相符。
- working-directory:76–78、session:1672–1686、repeat-tool-reminder:2247–2260：相符。
- 没核对：session:1051–1053、1820–1826，agent-instructions:361–440、730–746，agent-loop:790–821，api-session-controller 各行（后者已在 `DESIGN.md` §2.4a）。

本仓库（`docs-at-hand` 工作树）：

- `src/lessons/failure.ts`:73（`toldTo`）、138–142（host 级 `tools/post-execute`，跳过无 agent 与带 `parent` 的调用）：相符。
- `src/lessons/service.ts`:91（`relevant`）；`src/lessons/match.ts`:107（`pathsMeet`）、247–249（文件 3 分、工具 1 分、至少 2 分）：相符；service.ts:175 按 session 定位项目，见 N8。
- `src/shared/dialect.ts`:30（`ZCODE_ALIAS_NATIVES`）、69–80（`toNativeTool`）：相符。
- `src/graph/service.ts`:21（`dirFor`）：相符。
- `src/data/project-root.ts`:130（`checkoutRootOf` 不跟 `commondir`）、95–100（`projectOf` 跟 `commondir`）、146–166（`worktreesOf` 首项是主检出）：相符。
- `src/execute/scope.ts`:62（`within`）、98（`repoRelative`）：相符；第 24 行导入 `node:path`，见 N6。
- `src/loops/defaults.ts`:62–73（`loops.remind-waiting`）、默认条目 4 项；`src/loops/events.ts` 的 `loops.waiting-on-human` 形状与键；`src/loops/run.ts` 的 `waitingOnHuman` 与 `beatChain`；`tests/loops-run.spec.ts`:899–903 的「只有 `script.ts` 起子进程」静态检查：相符。
- `src/glm-prompt/index.ts`:239（别名注册）、`src/glm-prompt/aliases.ts`:282（`name: spec.zcodeName`）、294（`native.execute` 直接调用）；`read-alias.ts` 用 `file_path`；`src/toolsearch/exposure.ts` 的 `RESIDENT_TOOLS` 含 `Read`、`Write`、`Edit`（不经 `DeferredToolCall`）：相符。
- 图数据（§5.2）：109 件任务、带写入范围的 0 件、有指向决策的 `source` 连线的节点 4 个：相符。经验板「21 条里 16 条带文件模式」没核对。

M7（`m3` 工作树）：

- 设计 §2.1（不加图节点字段）、§3.5.2（9000 字符，裁剪次序经验→上一次细节→补充）、§3.5.5（`relevant` 入口）、§3.6.1（schema 子集）、§3.7.1–§3.7.3、§3.11.1–§3.11.2（`operate.patrol` 02:30 列主干领先上游与不干净的 `hz-*`）：与草稿的引用相符。
- 代码 `src/execute/handback.ts`:364、472（`changeOf`，经 `git.ts`:419 的 `diff --no-renames --name-status`）、`src/execute/brief.ts`:360（`BRIEF_LIMIT`）与 496–501（裁剪次序）、`src/execute/schemas.ts` 的 `HANDBACK_SCHEMA`：相符。

文档与图节点：

- `docs/ORCHESTRATION.md` §8.6、§18.5、§18.9、§18.10，`docs/DESIGN.md` §2.4a，`docs/FACTS.md` §3 的 `agent-instructions` 压缩一行：草稿的转述相符。
- 接管设计 §0、§2.1、§2.2：草稿把扫描多出组件候选、接管结束的提醒一句写成对已放行设计的请求、记成批注，与 `d-freeze-until-dogfood`、`d-finish-then-bootstrap` 一致。
- `d-code-rules-enforce`、`d-defaults-readonly`、`d-rules-visible`、`m7-habits`、`norm-merge-gate`、`d-main-agent-shell`：草稿的用法相符（N2 记了推送一句与一页稿的差异）。
