# GLM-Hourness 总体架构与底层设计

版本：0.3（2026-10-27）
状态：生效。取代设计稿 v0.1（原 `docs/DESIGN.md`）、运行时设计 v0.1 的底层部分（`.llm/docs/03-runtime-design.md` §1/§2/§5/§6/§10）与差异底账 v0.1（`dsh-glm-dialect/docs/02-dsh-zcode-divergence.md`）。旧文本见 git 历史（提交 `c518317`、`9266fb6`）。
前置：`CHARTER.md`。编排层见 `ORCHESTRATION.md`。

标注：〔实读〕代码或源码已读；〔实测〕真网或真机验证过；〔推断〕由代码与数据推出，未在真机逐项验证；〔定案〕用户决议；〔规划〕尚未实现。

## 1. 范围与基线

| 项 | 基线 | 依据 |
| --- | --- | --- |
| ZCode | 3.17.1 | 用户定案 2026-10-30（项目图 `d-zcode-3171`：「你就彻底都换成新版zcode，工程环境声明那个照旧」；此前为 3.16.3，定案 2026-10-27）；本机安装版 2026-10-29 自动更新到 3.17.1（卸载注册表）〔实读〕 |
| DSH | Desktop 0.2.1-rc.3，profile `desktop` | 官方类型 `@deepseek-ai/dsh-llm@0.2.1-rc.3` 等作为 devDependency |
| 模型 | GLM-5.3、GLM-5.3-Flash | 通道目录 |

逐字文本只认 3.17.1 pristine 副本 `reference/zcode-3.17.1/zcode.cjs`（MD5 `331AB13D0CB2E9504EA25420FF9AE663`），逐字门禁只读它（§5.9）。本机 ZCode 安装版随自动更新变化，用户也打过补丁（用户确认 2026-10-27），只能作为机制参考；ZCode 官方源码 `reference/ZCode`（`package.json` 版本 3.16.2，2026-10-20 同步）只作可读参考，它仍含 3.17.1 已删掉的 3.16.3 文本；3.16.3 pristine 副本 `reference/zcode-3.16.3/zcode.cjs` 只作对照。基线从 3.16.3 换到 3.17.1 时逐段比对过（不入库的 `.agents/tasks/zcode-3171/diff.md`，项目图 `zcode-3171-follow`）：身份头、签名、端点路由、设备号、AI SDK 段、请求体与 `max_tokens` 的代码两版逐字节一致；变了的是版本号、系统提示词各节、Read 与 Bash 的几段文本、工具检索增删公告、todo 提醒的计轮、compact 提示词一句，以及归因头新增的会话特征与项目令牌的失败码，逐项见 §4、§5。

反向代理（`zcode-proxy.exe`，8317 端口）不在本项目范围内〔定案 2026-10-27〕。任何插件行都不识别、不依赖反代路由。代码、脚本输出、界面文字与文档中把反代说成在链路上或等待退役的描述已删除（2026-10-28，`ROADMAP.md` M1.3）。仍会出现的相关字样有两类，均不表示链路上有反代：移植模块的出处注释（`reference/zcode-api` 的 `src/proxy/...`；zcode-api 本身是一个反代工程，本项目只移植它的通道模块）；ZCode 服务端配置的 `proxyEndpoint` 字段，那是 ZCode 自己的端点路由（§4.4）。用户 profile 中原有一条指向 8317 端口的 pi-ai `glm` 路由（用户配置）；用户 2026-10-28 把清理交给 agent，2026-10-29 批次 L4 通过后已从 profile 删除（项目图 `m1-cleanup`）；改前备份 `cordis.patch.yml.bak-1793241992974` 只比现行 patch 多这一条，按用户要求「彻底把glm反代那些清掉」于同日删除，profile 里不再有任何指向 8317 的配置。这条路由留下的用量记录也已删除（§2.4）。反代程序本身是用户的工具，按用户决定保留。`ORCHESTRATION.md` §4.2 的需求卡示例保留用户最初的一句话原话。

## 2. 架构总览

### 2.1 分层

```
GLM-Hourness（同仓两包，§2.3）
├─ GLM 通道包 dsh-glm-zcode（packages/glm）
│  ├─ 通道：glm-llm（adapter）、glm-login（命令、计价服务）
│  ├─ 方言：glm-prompt（提示词、工具面与工具检索）、glm-compact（压缩镜像）
│  └─ 呈现：包自己的客户端面（packages/glm/ui，行 glm-ui）
├─ 编排层包 dsh-hourness（packages/hourness），对任何模型生效
│  ├─ data（数据目录服务，§2.4）
│  ├─ guard、memory、workflow、hourness（用量与报告）
│  ├─ graph、graph-panel（项目图与运行控制；面板只读）
│  ├─ rules（规则板：工具调用门、等待单与唤醒、每步提醒、心跳、`rules_show`、`/rules`、高峰模式的档位与服务，默认启用）
│  ├─ loops（循环板：服务 `glmHournessLoops` 与条目登记表、循环行自己的事件和条目、人的条目的存储与 `/loops`、两道门 `loops:files-only` 与 `loops:schedule-tools`、运行锁与拍、收件箱与运行记录、到点的 DSH 任务与交给主 Agent、高峰结束的判断表（peak.ts），默认启用）
│  └─ 呈现：包自己的客户端面（packages/hourness/ui，行 ui）
└─ 公共库 src/shared/：编进导入它的每个包（§8）；客户端源码都在 ui/src/
```

### 2.2 插件行（现状）

入口相对所在包的目录（`packages/glm/` 或 `packages/hourness/`）。patch 里的行名是包的说明符（§2.3）：宿主行写 `<包名>/<行>`，经包的导出 `./<行>` 指向下表的入口；客户端行写精确包名，经导出 `.` 指向 `ui/index.js`。设置页「内置插件」里每行的标题与一句说明取自 `locale/<行>/{en,zh}.json`，客户端行取包的 `locale/{en,zh}.json`。

| 行 id | 包 | 入口 | 层 | 现状 |
| --- | --- | --- | --- | --- |
| `glm-hourness/glm-llm` | `dsh-glm-zcode` | `dist/glm-llm/index.js` | 通道 | 真网冒烟通过〔实测〕；2026-10-28 桌面版 L4 真实会话通过（GLM-5.3 多轮工具调用、GLM-5.3-Flash 收图）〔实读会话记录〕；凭证目录见 §2.4 |
| `glm-hourness/glm-login` | `dsh-glm-zcode` | `dist/glm-llm/login-row.js` | 通道 | `/glm-login`、`/glm-status`（凭证状态与行健康表，§2.5）、`/glm-logout`；提供计价服务 `glmHournessPricing`：GLM 积分套餐的公式与高峰时段（`src/glm-llm/credits.ts`），契约在 `src/shared/pricing.ts`，面板经它计积分（`ORCHESTRATION.md` §11.2、§11.3）；同一个服务还带额度读取 `quota`（`src/glm-llm/quota.ts`）与循环板的四条默认条目 `loopDefaults`（`src/glm-llm/loop-defaults.ts`），`/glm-status` 在凭证行之后写高峰行与额度一段（§4.7）。行配置 `plan`（默认 `coding-plan`）须与 `glm-llm` 行的 `plan` 相同：这一行用它写凭证行的套餐，并决定读不读额度（体验套餐不读，`cordis.patch.yml` 在这一行上有注释，凭证行写出这一行用的套餐）。选这一行提供：它是账号与套餐的入口，默认启用，不依赖路由；通道行默认禁用，方言行禁用时面板不该丢掉积分 |
| `glm-hourness/glm-prompt` | `dsh-glm-zcode` | `dist/glm-prompt/index.js` | 方言 | 见 §5；另带高峰提醒（本项目的 notice，`ORCHESTRATION.md` §11.4）。汇报细度的配置键是 `reportingDepth`（原名 `persona`，旧键照读并告警，§5.2）；常设档在会话开局读一次记忆行的服务 `glmHournessMemory`，没有再用配置（M5 步骤 R1，`standing-depth.ts`） |
| `glm-hourness/glm-compact` | `dsh-glm-zcode` | `dist/glm-prompt/compact-row.js` | 方言 | 见 §5.6 |
| `glm-hourness/data` | `dsh-hourness` | `dist/data/index.js` | 编排 | 数据目录服务 `glmHournessData`，见 §2.4 |
| `glm-hourness/guard` | `dsh-hourness` | `dist/guard/index.js` | 编排 | 见 `ORCHESTRATION.md` §6 |
| `glm-hourness/memory` | `dsh-hourness` | `dist/memory/index.js` | 编排 | 记忆工具、会话开局的记忆索引、`/memory`、服务 `glmHournessMemory`、会话投影 `hournessMemory`，以及每次模型调用的用量流水（`ORCHESTRATION.md` §8；M5 步骤 M1）。学习流水线（M5 步骤 G1，`ORCHESTRATION.md` §8.5）：只读工具 `learning_signals`（主 Agent 的延迟工具）和每七天至多一次、给主 Agent 的学习摘要提醒（`src/memory/notices.ts`，来源 `glm-hourness-learning`），后者先在项目的记忆流水里记一条 `learn-notified` 再发。习惯先问再记（M5 步骤 H1，`ORCHESTRATION.md` §8.5）：工具 `memory_habit`（`ask`、`confirm`、`decline`，`src/memory/habit.ts`；`m5-habit-rule` 起常驻），人的原话由 `src/memory/answers.ts` 对会话投影 `hournessTalk`（没有时折叠会话日志）核对；`learning_signals` 的组带 `asked`，习惯问话与确认过的习惯算已落点。项目目录跟会话的工作区，行配置 `home` 不再使用；`tools/pre-execute` 上只有一条代码规则 `habit-ask-first`（`src/memory/habit-rule.ts`，经 `installRuleGate` 装门，拦问答卡上问习惯与把人只是答应的话直接记成偏好，`ORCHESTRATION.md` §8.5）。离线整固拍（dreaming 窄版 B，2026-11-11，`ORCHESTRATION.md` §8.5、§18.13）：循环板条目 `memory.dream-nightly`（每天 18:35，harness 动作 `memory.dream`，不唤醒）把 `.llm/transcripts/` 近 48 小时导出里、人在至少两个会话说过的同类要求，确定性提取成记忆候选，经记忆流水的 `propose` 记录（只有 harness 能写）落流水；候选在折叠里是独立的 `proposals` 表，召回与索引看不见，人确认（`memory_store`）或丢弃（`memory_forget`、`/memory forget`）之后才成为或离开记忆 |
| `glm-hourness/lessons` | `dsh-hourness` | `dist/lessons/index.js` | 编排 | 经验板（`ORCHESTRATION.md` §8.6；M5 步骤 L1）：项目踩过的坑与解法，存在项目的 `.llm/lessons.jsonl`；查询工具 `lessons_query`（所有 agent）、合并工具 `lessons_merge`（主 Agent）、服务 `glmHournessLessons`（派发工作的一侧读写）、给主 Agent 的候选与复发提醒、失败的调用结果里的经验提醒（M5 步骤 L2，`tools/post-execute`）、`/lessons`、会话投影 `hournessLessons`。经验是建议不是规则，不注册任何 `tools/pre-execute` 监听器；唯一的工具调用监听器在 `tools/post-execute`，只往结果里加提醒。默认启用（2026-11-06 起）：L3 场景 `glm-lessons`、`non-glm-lessons`、`glm-lessons-failure` 与 `non-glm-lessons-failure` 已通过，桌面版首轮验收还欠 |
| `glm-hourness/workflow` | `dsh-hourness` | `dist/workflow/index.js` | 编排 | 仅记录派遣类工具调用，记录是 `{at, kind, subject}`，没有分级（`ORCHESTRATION.md` §5） |
| `glm-hourness/hourness` | `dsh-hourness` | `dist/report/index.js` | 编排 | `/hourness` 命令：晨报与用量面板；晨报的「等你定的事」一节读调用会话所在的项目图（经图行服务 `glmHournessGraph` 的 `dirFor`，`ORCHESTRATION.md` §5），读不到时写原因；「指标（流水，今天）」一节读调用会话项目的指标流水的事实组与覆盖行（第 5 步，`ORCHESTRATION.md` §10.6，没有可归项目或读不到时写原因），生成成功后对调用会话的项目发一条 `report` 事件；面板经计价服务按积分列，没有计价服务时按调用与 token 列（`ORCHESTRATION.md` §11.2、§11.3）；`/hourness-status`：两个包各行的健康（§2.5）；状态视图 `glmHournessStatus/hourness` 交用量清单一条 `glm/usage`，面板一节经收集器读它（§2.6） |
| `glm-hourness/graph` | `dsh-hourness` | `dist/graph/index.js` | 编排 | 项目图工具、每步投影与图文件门禁（`ORCHESTRATION.md` §2.5、§2.7、§2.10）；2026-10-28 经 L3 探针与 L4 桌面版验收后默认启用 |
| `glm-hourness/graph-panel` | `dsh-hourness` | `dist/graph/panel-row.js` | 呈现 | 人用的运行控制命令 `/graph-run`、现场投影 `graphLive` 与主 Agent 位置投影 `hournessProject`（面板经它找主 Agent 的对话，plain-ui 1.3 §4.9）；面板只读（`ORCHESTRATION.md` §2.10） |
| `glm-hourness/rules` | `dsh-hourness` | `dist/rules/index.js` | 编排 | 规则板（`ORCHESTRATION.md` §16）：每个项目的规则（人设的，存在仓库里）与高峰模式档位（无影响、少做、不做，默认少做）。`tools/pre-execute` 上最外层的门（`src/rules/gate.ts`，`ORCHESTRATION.md` §16.11）：内层放行之后，先守规则板自己的文件（`rules:files-only`，规则目录、各工作树的同一相对路径、`.llm/rules/`，直接调用与 `run_code` 子调用都判），再按规则判定，拦截的调用不执行、四段式理由，只记录的写一行 `mode: 'record'`，违规流水里的规则是 `rules:<id>`；人设的规则的排队得一张等待单（`src/rules/tickets.ts`，`ORCHESTRATION.md` §16.12）：同会话同签名的再次调用复用这张单，拥有它的宿主每 5 秒重判，规则不再挡时转 `cleared` 并按 agent 的状态用 `steer`、`inject` 或 `followup` 发一条消息，子 agent 的会话结束时单转给派发它的 agent（`session/disposed`，兜底是登记里找不到），24 小时、30 分钟没回来、宿主心跳过期三种过期；不做档在 GLM 高峰里把 GLM 子 agent 的工具调用排成每会话一张单并暂停它的 active goal，单结束时先恢复 goal 再叫醒，派 GLM 子 agent 的调用是普通的单（`src/rules/goal.ts`、`tickets.ts`，`ORCHESTRATION.md` §16.13），新宿主在会话出现时接手前一个宿主留下的不做档的单，行卸载时恢复自己暂停的 goal。每步提醒（`src/rules/reminder.ts`）只列只告知的规则与 agent 自己的单，主 Agent 的第一行说高峰与档位，变化时才注入；宿主在有活会话的项目里每 15 秒写心跳（`src/rules/heartbeat.ts`）。agent 的工具 `rules_show`（对调用者生效的规则、等待单、信号与档位，不截断）、人的命令 `/rules`（`show`、`peak`、`lift`、`delete`、`on`、`off`、`set`、`clear`、`let`、`cancel`、`recovery`，各写自己的操作）。提供服务 `glmHournessPeakMode`（契约在 `src/shared/peak-mode.ts`）与 `glmHournessRules`（一个成员 `declaration`，guard 的 `glm:guard` 节读它多写一行，`src/rules/service.ts`）；不挡主 Agent，不暂停它的 goal。规则页的数据：给每个有已知会话的项目写 `.llm/rules/view.json`，交会话投影 `hournessRules`（`src/rules/view.ts`、`view-build.ts`、`view-writer.ts`、`view-journal.ts`、`projection.ts`，`ORCHESTRATION.md` §16.14）。规则板的纯核心（四个事件、规则模型与校验、判定、默认规则与它按档位启用的四条附属条目，`src/rules/{events,model,judge,signals,builtin}.ts`，`ORCHESTRATION.md` §16.8）由门、`rules_show` 与 `checkCall` 调用。存储是整块规则板的完整形状（规则、信号、检测器、脚本钉、等待单、提醒，仓库里的规则文件，以及人处理「文件被别处改过」的两条写路径 `adoptRepoLocked`、`restoreRepoLocked`，`src/rules/{model,entries,store,repo}.ts`，`ORCHESTRATION.md` §16.3），行的写入口 `/rules` 只写不需要提议的操作。代码规则目录 `CATALOG`（`src/rules/builtin.ts`）把 guard 框架的规则 `GUARD_RULES`（`src/guard/catalog.ts`：`guard:workspace-containment`、`guard:file-tools-only`、`graph:graph-files-only`、`loops:files-only`、`loops:schedule-tools`、`metrics:metrics-files-only`，没有 `mode` 列）映射成 `<行>:<id>`，契约测试 `tests/contracts.spec.ts` 核对每个 id 都是对应行装上的规则对象的 id。默认启用（2026-11-04 的启用提交起）：L3 场景 `rules-peak`、`rules-peak-stop`、`rules-peak-stop-exit`、`rules-peak-hourness`、`glm-rules` 与 `non-glm-rules` 全部在 main 通过后启用，桌面版首轮验收已过（2026-11-04 桌面批次 L4 的 C 项） |
| `glm-hourness/design` | `dsh-hourness` | `dist/design/index.js` | 编排 | 主 Agent 模式（`ORCHESTRATION.md` §3.1、§3.5；M3 第 3 步）：命令 `/wish`（开启；`here` 把主 Agent 从别的会话移过来；`off` 退出）、会话投影 `hournessMainAgent`、每个项目的持有者记录（用户级目录的 `main-agent/` 下，一个项目一个主 Agent，`src/graph/main-agent-holder.ts`）、身份节 `hourness:main-agent`（§5.2）、主 Agent 的工具面（去掉写文件的工具与 `ask_user_question`）、阶段提醒（第 5 步，`agent/pre-step` 的 notice，来源 `glm-design-stage`，`src/design/stage-notice.ts`）、`tools/pre-execute` 上的执行边界规则 `main-agent-no-write`、`main-agent-ask`、`git-snapshot`（第 4 步）与 `design-before-release`（第 5 步，`src/guard/main-agent.ts`、`design-release.ts`，`ORCHESTRATION.md` §6.7、§6.8）。第 6 步（`m3-5`）加：工具 `propose_to_human`、`record_human_answer`（`src/design/propose.ts`、`record.ts`，只给主 Agent，别的会话的工具面去掉它们，`ORCHESTRATION.md` §3.1）；会话投影 `hournessTalk`（`src/design/talk.ts`：人发来的消息与给人看过的东西，注册不上时退回读会话日志，行健康降级）；别的组件的提议带原文的分派表（`src/design/attach.ts`，现在是空的）；指标事件的出口（`src/design/metrics.ts`，2026-11-06 起交给指标流水，`ORCHESTRATION.md` §10.6）；图写入的三条规矩 `main-agent-graph-relay`、`main-agent-graph-options`、`main-agent-graph-delegations`（`src/guard/main-agent-graph.ts`，`ORCHESTRATION.md` §6.9）；子 agent 带 `relay` 的尝试通知持有者（行健康与 `glm-design-bypass` 的 notice）。第 8 步（`m3-2`）加：两个工具的 `confirm` 一种（`propose_to_human` 把需求交给人、不写图，要求需求卡 8 项齐；`record_human_answer` 记人的回话，同意时重查需求卡、批准目标并把阶段改成 `design`，两条写入都带人的原话，`ORCHESTRATION.md` §3.1）；图写入的两条规矩 `main-agent-graph-stage`、`main-agent-graph-cli`（所有会话，同一个监听器，`ORCHESTRATION.md` §6.9），子 agent 与普通会话想把目标推向前或用命令行带转述的话写图的尝试同样通知持有者。第 9 步（`m3-3`、`m3-4`）加：两个工具的 `release` 一种（把设计交给人、记下人的同意并放行；没分模块的目标放行一次，分了模块的目标放行两层，框架、模块清单与方向清单一次、每个模块一次，各带一页放行稿 `page`，`ORCHESTRATION.md` §3.1、§4.5、§4.9；`src/graph/stage.ts` 的 `releaseGate`、`bigLoopSet`、`moduleSet`、`moduleReleaseGate`，`src/design/record.ts` 的 `releaseWrites`、`pageDigest`）；引擎两处（`src/graph/engine.ts`：主 Agent 把模块退回设计不要人的原话，还没放行的模块下的任务出生为提议）；`main-agent-graph-stage` 的模块几支（模块下的批准与带原话的提议、新模块、清模块的阶段，退回设计只放主 Agent）；决策正文可选的一行「如果失败：」（解析时结束上一节，不是一栏）。人设一步（`m3-main-persona`）加：行配置 `persona: {name, text}`（`src/design/persona.ts`，`Config` 在 `src/design/index.ts`，插件管理器里能改，默认空），`text` 非空时给主 Agent 的组装加一节 `hourness:output-style`（§5.2），普通会话、子会话、审查者和主 Agent 移走之后的原会话都没有这一节；`glm-prompt` 行的汇报细度配置同时从 `persona` 改名 `reportingDepth`（§5.2）。默认启用（第 12 步（b）合入起）：上述 L3 场景全部在 m3 分支通过后启用，桌面版首轮验收仍欠 |
| `glm-hourness/execute` | `dsh-hourness` | `dist/execute/index.js` | 编排 | 执行行（`ORCHESTRATION.md` §17.9，M7 步骤 E4）：主 Agent 的工具 `dispatch_task`（模型与理由必填、说明末尾带一道过与真实输入同样检查的示范、`slots` 配置、对规则板 `glmWorkerCap` 的一次读）、派发链的执行边界规则 `worker-scope`、`worker-graph-readonly`、`worker-git`、`worker-message-live-only`（`tools/pre-execute` 上 `prepend`，`src/guard/execute-rules.ts`；第五道 `dispatch-chain-readonly` 是 M3 `design-before-release` 的放行一行改为询问 `glmHournessExecute.isWorker`，放行状态不再是无条件放行）与常量表 `EXECUTE_RULES`（八道代码门的首日模式，规则板整块合入时映射）、派发链的工具面过滤（`agent/created` 与首步补装，非主 Agent 去掉执行与运维工具、链上去掉九个图写工具与 worker 工具，审查者再去掉 `submit_plan`）、模块级的派发登记表与按修订号缓存的图（worker 的写入范围与放行状态读它）、命令记录 `<proj>/.llm/execute/tasks/<任务>/<childId>.commands.jsonl`（§3.8.5 格式，底线清单的输入）、模块设计评审的提议与派发（§3.7.5 的 `dispatch_task {id: 模块}` 一路）。提供服务 `glmHournessExecute`（契约 `src/shared/execute-service.ts`）。计划审批与通信的三件工具（worker 的 `submit_plan`、`ask_main` 与主 Agent 的 `answer_worker`，E5，`src/execute/requests.ts`，等待在工具调用里、通知走持有者的唤醒表）也在本行；交回处理与审查循环（E6，`src/execute/handback.ts`，`ORCHESTRATION.md` §17.11：结算回调驱动的 worker 交回处理——语义校验、报告出树、候选经验的服务接缝与退路批注、摘要批注、stale 停步、有效深浅与审查任务的确保；审查者的作废与同模型重派、轮次批注与收敛（过审的证据带 patch-id）、停下的标记与停下的提醒、模块设计审查记录——也由本行的 `onHandback` 钩子驱动）；合入门禁（E7，`src/execute/check.ts`、`gate-provider.ts`、`advance.ts`，`ORCHESTRATION.md` §17.12：主 Agent 的 `check_commit` 与检查后端 `hourness-gate`、检查记录、`trunk-advance-checked` 的执行前与执行后、证据与完成、主干的全量检查，服务多一个成员 `trunkAdvanceFor`）也在本行；自动推进、完成门禁、`await_human` 与循环板接缝（E8，`src/execute/drive.ts`、`drive-log.ts`、`loop-link.ts`、`notice.ts`，`ORCHESTRATION.md` §17.13：放行之后在持有者的下一步建 goal、判断表的恢复与停住、`update_goal complete` 的完成门禁与凭据、主 Agent 的 `await_human`、空转与高峰的停住、重启后的对账与会话投影 `hournessHandback`、派发状态提醒；条目、事件与 harness 动作经 `glmHournessLoops.contribute` 与 `emit` 交给循环板，循环板不在或没执行时由 M7 的退路执行者与看门自己跑，服务多第三个成员 `runAction`）也在本行。默认启用（2026-11-07 起，M7 合入 main 时单独一个提交）：L3 骨架场景 `glm-exec-skeleton` 通过，第三次真实模型运行把放行的目标推到完成、没有问人（设计 0.6 §10.3 第 2 条）；第一批桌面 L4（设计 §9.2）在启用之后做 |
| `glm-hourness/loops` | `dsh-hourness` | `dist/loops/index.js` | 编排 | 循环板（`ORCHESTRATION.md` §18）：各行把自己的条目、事件和 harness 动作交给服务 `glmHournessLoops` 的 `contribute`（契约与读取函数在 `src/loops/service.ts`），登记表（`src/loops/registry.ts`）按名字空间、个数、字段和 `validateEntry`（`src/loops/model.ts`）逐项检查：合格的列出，不合的丢掉并带字段路径，会跑东西的 `script`、`check` 条目不收；条目点名的事件此刻没有谁声明时照样收下、灰显，声明一到就转为生效。行自己带三个事件（`loops.host-restarted`、`loops.waiting-on-human`、`loops.file-changed`，`src/loops/events.ts`）和四项条目（`src/loops/defaults.ts`：合进主干后查依赖、有事等你太久时再提醒、GLM 高峰开始与结束），别的行的条目表不在这个目录里。人的条目的存储（`src/loops/store.ts`、`journal.ts`、`model.ts` 的条目文件，`ORCHESTRATION.md` §18.7）：条目与脚本在仓库的 `docs/loops/`，变更记录、`repo-written.json`、写锁、临时文件与 `view.json` 在项目的 `.llm/loops/`（第一次建目录时经 `ensureIgnored` 把 `.llm/` 追加进 `<git 目录>/info/exclude`，目录里自带内容为 `*` 的 `.gitignore`）；判定按变更记录不按文件，`readBoard` 分出「对得上」「循环板欠着一次写」「在它之外被改」「不在这份检出里」「读不出」「从没见过」，写入是先追加记录并 `fsync`、再经 `.llm/loops/tmp/` 加改名落文件、最后更新 `repo-written.json`，git 正在合并、变基、拣选、回退、二分或占着 `index.lock` 时先不写。会跑东西的条目没有人同意的记录就只标 `unadopted`、不跑。人的命令 `/loops`（`delete`、`restore`、`ack`，`src/loops/commands.ts`）、会话投影 `hournessLoops`（给页面指路到 `view.json`，`src/loops/projection.ts`）、每个项目的对账与 `view.json`（`src/loops/boards.ts`、`view.ts`）。文件门 `loops:files-only`（`src/loops/guard.ts`，`ORCHESTRATION.md` §18.8）在 `tools/pre-execute` 上最外层（做法同 `src/guard/graph-files.ts`，经 guard 框架的 `installRuleGate` 装上）：写任何一份检出的 `docs/loops/` 或项目的 `.llm/loops/` 的文件工具与 shell 命令一律拒绝，带 `parent` 的子调用照样判，读不拦，拒绝写项目违规流水并在 `src/guard/catalog.ts` 的 `GUARD_RULES` 里登记；guard 的 `glm:guard` 节按这一行的行健康多写一句（门在每个进程里都装着）。运行时核心（`src/loops/lock.ts`、`inbox.ts`、`run.ts`、`harness.ts`、`file-watch.ts`、`records.ts`、`channel.ts`，`ORCHESTRATION.md` §18.9）只在有会话控制器的进程里做（服务也只在那里提供，`ctx.inject(['sessionController'])`）：一个项目一把运行锁 `runner.lock`（60 秒一拍刷新，3 分钟没人刷新就接管并留痕），锁跟着主 Agent 的会话经 `handover.json` 交接；`emit` 把事件追加进项目的 `events.jsonl`（校验事件、载荷与去重键，写不进按 1、3、6 秒重试三次），持锁的进程按字节位置读、同一个键 7 天只跑一次（再来的记 `loop-duplicate`）、按去抖与每小时限次合并与攒着、一次运行自己引起的事件 10 分钟内不再触发同一项；循环行自己照 `state.json` 推出 `loops.host-restarted`、`loops.file-changed`（判定在 `file-watch.ts`：`fs.watch` 加每一拍比一次，静 60 秒才算）、`loops.waiting-on-human`（每小时读项目图）与 `channel.peak-changed`（照计价服务的高峰时刻，服务不在时不推，连第 13、14 项也不列）；每次运行交一对 `loop-fired`、`loop-done` 进项目的指标流水（`src/loops/metrics.ts` 映射，不写输出原文；`ORCHESTRATION.md` §10.6 第 6 步起，runs.jsonl 不再存在），harness 动作在带运行号的异步上下文里跑、至多 6 小时，`script` 与 `check` 的条目一律 `refused`、不起任何进程。绑定主 Agent 与投递（`src/loops/holder.ts`、`bind.ts`、`deliver.ts`、`remove.ts`、`reminder.ts`，`ORCHESTRATION.md` §18.10）：到点告诉主 Agent 的条目各绑一条 `dsh-schedule` 任务（由 DSH 投递并叫醒会话），一个函数 `holderStateOf` 说主 Agent 此刻能不能收消息（六种结果：记录读不出、模式已关、已归档、找不到、在别的进程里、能投；记录的位置收在 `holderRecordFor` 一处，M3 搬走时只改它），一个函数 `removeTask` 删任务（能证明是自己建的、能说出八种原因之一，先把整条写进 `removed-tasks.jsonl` 再删，写不进就不删），投递是带来源的合成 notice 并按唤醒表选 `steer`/`inject`/`followup`、`sessions.flush` 确认后才算投出、不能投时存着（50 条、24 小时）；第二道门 `loops:schedule-tools` 拒绝经 DSH 的定时工具改循环板的任务、也拒绝以 `Loop board: ` 开头的 `schedule_create`。高峰的开始与结束（`src/loops/peak.ts`，`ORCHESTRATION.md` §18.12）：`loops.peak-start` 是 `self` 条目，循环板只记一条 `delegated`（档位读规则板服务）；`loops.peak-end` 的动作跑设计 §6.9 第 4 条那张十行表（没有人可叫、别的进程写着手、接上 execute 行列出的 resume-drive（60 秒限）、读不到档位、少做与不做落穿、无影响、正在跑、按走步记录与按分钟倒走的高峰起点判「这段高峰里干过活」、goal 的暂停与挡住原因、开始挪开的活），等别的进程的判断存着重判标记、每一拍拿得到锁就再判、一天没判成作废；`view.json` 的 `peak` 一节只读规则板的档位；宿主工作区登记表列出的项目每一拍都开始跑。现在没有的：工具、页面、机器一级的运行者、脚本与检查的执行器。默认启用（2026-11-04 的启用提交起）：L3 场景 `loops`（条目认回、文件门、headless 里不跑条目）、`loops-peak` 与 `loops-peak-restart` 全部在 main 通过后启用，桌面版首轮验收已过（2026-11-04 桌面批次 L4 的 C 项；列表面随 runner 里程碑） |
| `glm-hourness/env` | `dsh-hourness` | `dist/env/index.js` | 编排 | 环境分支与草稿区（`ORCHESTRATION.md` §7.1、§7.4；M4 设计 §7）：agent 创建时装环境提醒步 notice（`src/env/notice.ts`，来源 `hourness-env`），在会话第一步与环境分支变化（提醒正文摘要变化、压缩之后）的下一步注入：图上 `env` 特性的已批准工具子节点一行一个（`src/env/branch.ts` 的 `envBranch` 读工具与 `config` 行）、「改完哪些文件会跑检查」一行与草稿区一行；第一次为某个仓库装提醒前经 `src/data/llm-ignore.ts` 的 `ensureLlmIgnored` 把 `.llm/` 追加进 `<git 目录>/info/exclude` 并用 `git check-ignore` 复核，仍可见时行健康降级。草稿区是工作区根下的 `.llm/scratch/`，清单 `scratchLeftovers` 在 `src/guard/scratch.ts`。工具节点验收条件里的检查行（`src/env/check-entry.ts`）随 `envBranch` 一起读，读不懂的行与同一节点上重复的名字收进它的 `issues`（第几条与原因），进行健康。给循环板的（`m4-checks`）：服务 `glmHournessEnv`（`src/env/env-service.ts`：`checkCommandOf` 读一条已批准工具节点的检查命令，另有纯函数 `fillCheckArgv`、`formatCheckOutput`；循环板的 `check` 条目经 `src/loops/index.ts` 的 `checksSeam` 用它们，没有这一行时一律 `check-missing`），交给循环板的事件 `env.files-edited`（`src/env/loop-entry.ts`，经 `src/loops/service.ts` 的 `installContribution`，与图行同一条交法），每一步按这个 agent 改过的文件（`src/env/edited.ts`，按所在检出分组）在有人加的条目听时交。每个仓库每天一次的压制注释计数（`src/env/suppressions.ts`）。M4 自带的检查器（`src/env/runner.ts`）：循环板在时，同一条步 notice 在改了文件的 agent 的下一步之前跑已批准工具节点上带 `when` 的检查行，进程经循环板的共用执行器（`src/loops/script.ts` 的 `runCommand`，`direct` 一路，并发由本行管），结果是来源 `hourness-checks` 的提醒（`src/env/check-notice.ts`，改动行由 `src/env/changed-lines.ts` 经 git 定），超时取自项目 `.llm/env-checks/timing.jsonl` 的实测（`src/env/timeout.ts`），日志在 `.llm/env-checks/<会话>/`；交给循环板的条目 `env.checks-after-edit`（`self`，五条自己的规矩、展开明细每项检查一行，交接的 `checks` 按面板的形状交每项检查的超时，`src/env/status.ts` 的 `pageChecks`），每次送出结果报一次运行；晨报「检查的超时」一节读同一份账。被上限截住的检查在根 agent 的环境提醒里各一行；工具 `check_limit`（`src/env/limit-tool.ts`，行声明 `inject: [tools]`，名字在 `src/shared/tool-names.ts` 的 `ENV_TOOL_NAMES`，不常驻）让主 Agent 调高或撤回一项检查的上限，设置在项目 `.llm/env-checks/limits.jsonl`，最后一行为准，循环板页超时那一格的调高一行与晨报的「上限已调高」都读它。默认启用（2026-11-05 m4-checks 的启用提交起；此前禁用）：L3 场景 `env-notice`、`env-check-command`、`env-checks`、`env-checks-timeout`、`env-checks-timeout-run`、`env-checks-ceiling` 通过后启用，全量探针在出厂启用的状态下通过；桌面版首轮验收（M4 设计 §13.4）仍欠 |
| `glm-hourness/transcript` | `dsh-hourness` | `dist/data/transcript-row.js` | 编排 | 会话原文导出（§2.4「会话原文」，§5.6）：提供服务 `glmHournessTranscript`（契约在 `src/shared/transcript.ts`）。GLM 压缩的摘要写完时 `glm-compact` 行经它把本会话的整份日志以纯文本写到项目的 `.llm/transcripts/<会话 id>.txt`（像凭证的字符串换成 `[redacted]`，换了几处写进文件说明与行健康；遮掉失败就不写，摘要不带路径），返回路径，摘要末尾加 ZCode 3.17.1 的原文句子指向这个文件，模型用 Read 分页读。不注册任何工具；行配置 `home` 覆盖项目数据目录（探针与测试用）。默认启用（2026-11-06 起，人的原话「那就开」）：L3 场景 `glm-compact-transcript` 已通过，桌面版 L4 2026-11-06 在隔离实例上通过（`.agents/tasks/compact-recall/l4.md`）；已知边界见 §2.4「会话原文」的「启用与已知边界」一条；人在插件管理器里关掉时 `glm-compact` 的输出与没有这一行时逐字相同 |
| `glm-hourness/glm-ui` | `dsh-glm-zcode`（客户端面） | `ui/index.js` | 呈现 | 设置页与输入框下的 GLM 按钮（§2.5），GLM 上手（plain-ui 1.3 §6.3：按钮无记录时写「GLM · 上手」、对话框顶上三步说明、开场画面 `conversation.hero.options` 的「GLM · 上手」小按钮，读到已登录、跳过或第 3 个会话后收起；设置页「重新看上手说明」清记录），客户端入口 `ui/src/glm-client.js`；默认启用：2026-10-29 split 合入后的桌面版验收第一轮通过后启用，第二轮在桌面版上核对 |
| `glm-hourness/ui` | `dsh-hourness`（客户端面） | `ui/index.js` | 呈现 | 右侧栏「项目图」页签（需要你、agent 定的、正在做、图，`ORCHESTRATION.md` §2.10），客户端入口 `ui/src/hourness-client.tsx`；主 Agent 会话的流程条、新会话的 `/wish` 开场卡片与输入框下方的「交给主 Agent」按钮（`ORCHESTRATION.md` §4.8；读设计行的会话投影 `hournessMainAgent`，投影不在时三者都不显示）；面板登记的板（`ui/src/graph/boards.ts`）：规则板 `ui/src/rules/`（读规则行的投影 `hournessRules` 与它写的 `view.json`，`ORCHESTRATION.md` §16.14）、循环板 `ui/src/loops/`（`hournessLoops`）、经验板 `ui/src/lessons/`、指标板 `ui/src/metrics/`（`hournessMetrics`），读宿主写的单个 `view.json` 的两块板共用 `ui/src/graph/view-file.ts`；沿用单包布局时已启用的行 id |

### 2.3 同仓两包与一包一源

同仓两包〔定案：2026-10-28 question-10 选 A；2026-10-29 question-17 选 B，profile 直接列两包，不要伞包〕：GLM 通道包 `dsh-glm-zcode`（`packages/glm`）与编排层包 `dsh-hourness`（`packages/hourness`）同仓维护，各自是多行 cordis 插件包，带自己的 `cordis.patch.yml`、`tsconfig.json`、显示信息（插件页与客户端行用的 `locale/{en,zh}.json` 与 `icon.svg`，导出 `./locale/*.json` 与 `./icon`；每个宿主行在设置页的标题 `locale/<行>/{en,zh}.json`，导出 `./<行>/locale/*.json`）、客户端面与构建产物 `dist/`。源码不搬家，仍在 `src/`；哪个目录属于哪个包、每个包插哪些行，只写在 `scripts/packages.mjs`。profile 直接列两个包，GLM 在前，放在原来单个 bundle 的位置，宿主行的组合顺序与拆分之前相同。根 `package.json` 只是开发工作区（脚本、开发依赖、`peerDependencies` 兜底），没有 `dsh`、`main`、`exports`，不是 bundle；根目录没有 `cordis.patch.yml`。两个包各自装上、单独启用都能工作，缺席的一方怎样降级见 §7。

行 id 不随包改名，仍是 `glm-hourness/<行>`：profile 的覆盖项按 id 匹配，改名会让覆盖项静默失配。其余持久化标识也不改：cordis 服务名、notice 来源、提示词节名、命令名与 `definitionId`（`dsh-glm-hourness/*`）、cordis 插件名（`dsh-glm-hourness/<行>`）、用户级目录 `glm-hourness`、面板页面 id 与 kind、插槽 id。这些名字里的 `glm-hourness` 读作项目名，与哪个包无关。根包名 `dsh-glm-hourness` 也保留。

行的组合顺序里新增的行插在编排层宿主行的最后、客户端行之前（`env`，2026-11-02）。行名与一包一源〔2026-10-29，m8-row-titles〕：设置页「内置插件」只给包说明符形式的行名读显示信息；bundle patch 里以 `./` 写的行名被锚定成 file URL，没有显示信息，标题就是含用户目录的整条 URL（m8-ui-audit V-01）。DSH 的 client-modules 按包名组成 web 启动图，同一个包若被多个 active Loader 行解析且声明了 `dsh.client`，启动失败（`resolves from multiple active Loader sources`）〔实测，2026-10-27 事故〕；它只把路径形式的行和精确包名的行算作来源，子路径说明符的行不算任何包的来源（`FACTS.md` §3）。所以两个包的行都经包命名：每个宿主行写子路径说明符 `<包名>/<行>`；每个包自己声明 `dsh.client`，它的客户端面（宿主半 `ui/index.js`、产物 `ui/client.js`，导出 `.` 与 `./client`）由唯一一行以精确包名插入，`dsh-glm-zcode` 的是 GLM 按钮与设置页，`dsh-hourness` 的是项目图面板。说明符以 profile 目录为基准解析，profile 列了哪个包，它的 `node_modules` 下就有这个包，所以每个包单独装上，行与界面照样解析；只装一个包时另一半界面不会出现，也不会报错。覆盖项按 id 匹配，与行名无关；设置表单以后新写的覆盖项带的 `name` 是说明符，不含本机路径。客户端源码都在 `ui/src/`，哪个文件属于哪个包写在 `scripts/packages.mjs`；`ui/` 只剩 `tsconfig.json` 与 `src/`，不再是包。两个包的客户端产物各是一份 `client.js`（`scripts/build-ui.mjs`），编排层客户端经 `src/graph/live.ts` 带进的是公共库的 `zcode-notice.ts`，不带 GLM 的文件。

行的组合顺序：profile 里两个宿主包相邻、GLM 在前、放在原来单个 bundle 的位置，宿主行的相对次序与拆分之前相同（后来新增的行加在编排层宿主行的最后，`env` 之前是 `loops`）。客户端行不同：单包布局下 `glm-hourness/ui` 由桌面版 profile 末尾的 `dsh-glm-hourness-ui` 插入，排在 9 个 experimental bundle 之后；拆分后它与新的 `glm-hourness/glm-ui` 由宿主包的 patch 插入，提前到 experimental bundle 之前。设置页与 pill 的插槽带显式 `order`，不受影响；按注册次序排列的界面（右侧栏「开始」页的页面类型列表）可能变，桌面版验收时记录「项目图」入口的位置。

`npm run preflight` 固化这些约束（`scripts/preflight-bundle.mjs`，检查项写在文件头）：目录表自检；根不是 bundle；每个包的 patch 路径以 `./` 开头、不含 `..`、落在包内（profile 里的包目录是 junction，`..` 会退回 profile 的 `node_modules`）；行名都是本包的说明符、不是路径，宿主行按表的顺序写 `<包名>/<行>`、客户端行写精确包名，经包的导出解析到存在的文件；按 profile 顺序组合后每个行 id 恰好一次；产物顶层目录、包的 `tsconfig.json` 与表一致；产物 `dist/shared/health.js` 的 `HEALTH_PACKAGES` 与表一致；显示信息齐全（包的与每个宿主行的 `locale/{en,zh}.json` 带 `meta.title`、`meta.description`，导出写对，这些目录里的 `.json` 文件名都是语言 id，否则设置页整条显示信息变成错误）；产物里运行时的裸导入都在该包的 `peerDependencies` 里（今天只有 GLM 包的 `@deepseek-ai/cosmokit`，来自 vendored `schemastery.ts`）；`ui/` 下没有 `package.json` 与 `cordis.patch.yml`；每个包声明 `dsh.client`、导出 `.` 为 `./ui/index.js`、没有嵌套的 `ui/package.json`，全部 patch 里恰好一行以它的精确包名命名，客户端产物已构建、外包的 id 是包名、通过 `node --check`、只 `require` 模块表里的包；`ui/src/` 下每个文件恰好属于一个包。行 id 的字面清单另写在 `tests/contracts.spec.ts`，表与 patch 一起改名时测试失败。

### 2.4 数据目录服务〔已实现 2026-10-28，`ROADMAP.md` M1.4〕

原问题〔实读 2026-10-27〕：各行通过 YAML 各自配置 `home`，guard 的违规回调无法从配置传入，违规审计为空；2026-10-27 15:36–17:22（本地时间）期间 190 条用量记录与 1 条记忆写进了 `~/.dsh/profiles/desktop/.llm/`，`/hourness` 读不到。

数据分两级：

| 数据 | 位置 | 理由 |
| --- | --- | --- |
| 用量流水、加密凭证、关于人本人的记忆（`memory/memory.jsonl`，范围 `all`） | 用户级目录 `$DSH_HOME/glm-hourness/`，默认 `C:\Users\29596\.dsh\glm-hourness\` | 额度跟账号走，一台机器一份，按项目拆开反而看不全；人的习惯与拍板偏好跨项目通用（`d-memory-scope`） |
| 额度流水：读数、读取失败、上游限额、登录被拒四种记录（§4.7） | 用户级目录 `$DSH_HOME/glm-hourness/audit/quota.jsonl`，只追加，不轮换（到 8 MiB 时行健康提示，轮换到那时再设计） | 额度与登录是整个账号的事，同一台机器上的项目共用，不属于哪个项目 |
| 用量记录的缺口：每次删用量记录写一行（删除时刻 `at`、条数 `removed`、理由 `reason`，可选 `detail`、`from`、`to`、`ref`；字段与上限见下面「缺口文件」一条） | 用户级目录 `$DSH_HOME/glm-hourness/audit/usage-gaps.jsonl`，只追加；删记录的人手写这一行（`DEVELOPMENT.md` §5 第 8 条），`/hourness` 的面板与晨报的用量一节读它；2026-10-29 删去 806 条的那一行由项目图 `m6-gap` 写入 | 用量流水有多个读者（面板、标定运行器），都按用量记录解析，混进别的形状会被计为无法读取，所以缺口另放一个文件 |
| 项目的记忆（事实与规范，`memory.jsonl`，范围 `project`）、违规、决策 | 项目目录，即工作区 `.llm/`；记忆的项目目录按会话的工作目录定，不用 profile 里的 `home` | 记录的是在这个项目里学到的东西与犯过的错，混在一起会互相污染 |
| 项目图 | 仓库内 | 项目知识，随 git 版本化（`ORCHESTRATION.md` §2.6） |
| 指标流水〔`ORCHESTRATION.md` §10.6；第 1–7 步已实现 2026-11-04，行默认启用〕 | 项目 `.llm/metrics/`：日文件 `events-<UTC 日期>.jsonl`；清单 `metrics-manifest.jsonl` 与散列密钥 `metrics-key` 在该目录之外；`.llm/` 本身先写进 `.git/info/exclude`。每步模型调用、工具调用、问人、审批、人发的消息等事件的数与引用；一个项目一份，只追加，发送方答不出项目的事件只计数。事实与打分由 `src/metrics/calc.ts` 的纯函数算，命令行 `npm run metrics` 读它；面板的「指标」板读宿主算好的 `view.json`（第 4a 步，`src/metrics/board-view.ts` 算、`src/shared/metrics-board.ts` 定形状，`ORCHESTRATION.md` §10.6）；`/hourness` 的报告读事实组与覆盖行（第 5 步） | 运行记录归项目（`d-rules-in-repo`、`d-memory-scope`）；只有 harness 写，用户级目录不放指标文件；`git clean -fdx` 之后流水从头攒，图历史能由 `backfill-graph` 补回（指标设计 §5.5） |
| 会话原文：GLM 压缩时导出的会话日志纯文本（`transcripts/<会话 id>.txt`，下面「会话原文」一条） | 项目目录，即会话工作目录所属项目的 `.llm/`，写前确认 git 忽略 | 给这个会话的模型压缩后读原文用；内容含工具输出，只能落在不进版本库的地方 |

用户级目录的定案〔用户 2026-10-28〕：按 DSH 自己的布局。DSH 把全部用户数据放在一个根目录下，解析顺序是显式配置 > `$DSH_HOME` > `~/.dsh`（rc.3 `dsh-home-paths` `resolveDshHome`，lib/index.js:109，空白的 `$DSH_HOME` 视为未设）；插件在根目录下占一个以自己命名的目录（先例：`dsh-llm-deepseek` 写 `$DSH_HOME/llm-deepseek/files-v3.json`，llm-deepseek:824）。偏好类记忆随之放用户级目录，项目事实与项目规范放工作区。运行时包不能从本仓库解析（`glm-compact` 遇到过的同一问题，§5.6），所以三步解析在 `src/shared/data-home.ts` 照抄并注明出处，不导入 `@deepseek-ai/dsh-home-paths`。宿主根上下文另有一个 `dshHomePath` 服务（app-boot:4526），它不接受显式配置，本包不用。

实现：

- 新行 `glm-hourness/data`（`dist/data/index.js`）经 `ctx.provide` 提供 cordis 服务 `glmHournessData`，值为 `{userHome, projectHome?}`。`userHome` 按上面的顺序解析，行配置 `dshHome` 是显式项，测试与探针用它指向临时目录；`projectHome` 取行配置，bundle 默认为本仓库的 `.llm`（与通道两行相同的 `USERPROFILE` 相对写法）。激活期不做 I/O，不抛错；流水在第一次写入时建目录。
- 流水路由（`src/memory/audit.ts`）：用量写 `<userHome>/audit/usage.jsonl`，违规与决策写 `<projectHome>/audit/`。各行的目录在每次写入时解析，所以数据行晚于使用者激活也不影响。写入失败不抛给调用方，每条流水第一次失败时在控制台报一次（缺目录也算失败）。
- 缺口文件（`auditPaths(...).gaps`，读它的是 `src/report/panel.ts` 的 `parseGaps`）：一行一个 JSON 对象，记一次删用量记录。`at` 必填，ISO 8601，能解析，是删除的时刻；`removed` 必填，整数 1–10,000,000；`reason` 必填，1–300 个字符，为什么删、谁要求的；`detail` 可选，至多 300 个字符，按 provider 与模型的条数；`from`、`to` 可选，ISO 8601，被删记录的时间范围，`from` 不晚于 `to`；`ref` 可选，至多 200 个字符，留痕的出处。多出的字段忽略；不是 JSON 或不合上面任何一条的行，面板计为「无法读取的缺口记录 N 条」，其余照常。没有代码写这个文件：谁删用量记录，谁往文件追加一行（`DEVELOPMENT.md` §5 第 8 条），删掉文件即撤销。面板每条一行，晨报的用量一节只带本期遇到的（`ORCHESTRATION.md` §11.3）。
- 取值顺序：项目目录取行配置的 `home`（用户 profile 补丁给 workflow、hourness 配了仓库 `.llm`，照旧生效），没有再取服务的 `projectHome`；用户级目录只取服务，没有数据行就不写用量，保证没有任何一行把用户级数据写到数据行没解析过的地方。memory 行不在此列：它的项目目录按每个会话的工作目录取服务的 `projectDirOf(cwd)`（没有数据行时直接调 `src/data/project-root.ts` 的同名函数），忽略 `home`，用户级的记忆目录是 `<userHome>/memory`，没有数据行就不可用。
- 各行：guard 每次拦截都写违规流水，`onViolation` 回调删除；memory 的用量只经服务写用户级目录，记忆工具按会话取项目目录与用户级目录（上一条），不依赖行的 `home`；workflow 的决策仍按上面的顺序取目录；guard 的违规流水与 `/hourness` 读的违规流水从 m4-gate G1 起、规则板的违规流水从 m4-rules（2026-11-04）起经 `projectHomeFor` 取项目目录（行的 `home`、会话工作目录所在项目的 `<检出根>/.llm`、服务的 `projectHome`，次序见 `ORCHESTRATION.md` §6.1）；`/hourness` 从用户级目录读用量，缺哪个目录就在输出里写明。行以外，仓库脚本的启动自查（`scripts/rules-gate.mjs`）在拦下与排队时往项目根（`projectOf`）的 `.llm/audit/` 下同一份违规流水追加 `rules:<规则 id>` 的行（`ORCHESTRATION.md` §11.4）。
- 验证：L2 覆盖三步解析、服务提供与撤回、取值顺序、有无服务两种情况；L3 探针确认数据行在真运行时上提供服务，用量只落在场景的用户级目录、真实的 `~/.dsh/glm-hourness` 不变，guard 拦下的 shell 写入在场景项目目录留下违规记录（带规则、工具、agent 与会话 id）。数据行经探针证明后默认启用。

记忆与经验的存储底座〔M5 步骤 A1，设计 `.agents/tasks/m5/design.md` §5，节点 `m5-1`、`lessons-1`〕：关于人本人的记忆在用户级目录，项目事实与全部经验在项目的 `.llm/`（`d-memory-scope`），都用只追加的流水（JSON Lines）。

- `src/data/journal.ts`：`readJournal`、`readJournalSync`（共用按文件大小与修改时间的缓存；坏行记行号与原因；末行没有换行的忽略）和 `appendJournal`（进程内按路径排队；锁用 `src/data/lock.ts`，选项 50 毫秒重试、2 秒等待、30 秒陈旧、开机时刻差 120 秒、陈旧锁改名留着、读不出内容的锁连续看到 500 毫秒才接手（2026-11-06 加：缺省的立即接手会抢走一个刚 `wx` 建好、还没写内容的活着的写者，两个进程各追加 200 条的测试在负载下因此留下 `.stale-`）；在锁里重读、由调用方的计划决定写什么、追加前核对锁还是自己的、给崩溃留下的半行补换行、`seq` 取最大加一、`fsync`）。折叠函数由使用者给（记忆与经验各自的模型）。目录被删之后下一次写入重新准备目录。
- `src/data/project-root.ts` 加 `projectDirOf(cwd, home?)`（只返回 `<项目根>/.llm`，不写东西）与 `ensureProjectDir(dir)`（名字是 `.llm` 的目录先 `ensureIgnored` 再建；忽略条目写不进就抛错、不建目录）。
- 数据目录服务多一个成员 `projectDirOf(cwd)`：行配置 `projectOverride` 非空时对所有会话返回它（探针、标定、测试指向运行目录；`scripts/sandbox.mjs` 的 `dataRows` 设为 `<dir>/home`），否则返回会话所在项目的 `.llm`。服务值可以没有这个成员，调用方这时直接调 `project-root.ts` 的同名函数。env 行每天的压制注释计数（M4 设计 §6.7）也按它取目录（2026-11-05，m4-checks B6：env 行出厂启用后，探针里工作目录在本仓库工作树里的会话按项目取会写进主检出的 `.llm/audit/`），没有数据服务时取 `<项目根>/.llm`。
- `src/data/secret-shape.ts`（`looksSecret`、`findSecret`、`redactSecrets`、`redactSecretsCounted`：按令牌形状而不是「32 个以上的 base64 字符」判，路径与长标识符放行；后两个把每一段换成 `[redacted]`，`redactSecretsCounted` 另给换了几处，会话原文导出用它，§2.4「会话原文」）与 `src/data/evidence.ts`（证据与出处的写法 `parseRef`、`checkRefs`，提交号不判密钥，`session:`、`call:`、`command:` 的 id 不判 `token`、`hex`；`isGroupKey`、`groupKeysOf`：`learnedFrom` 的键）：纯函数，不用 Node 内置模块。
- `src/data/refusal.ts`（被拒绝的写入的形状 `Refusal`、`refuse`、`invalid`，以及各字段表共用的 `isObject`、`listOf`）与 `src/data/words.ts`（`wordsOf`、`jaccard`：记忆条目与经验判相似用同一把尺）：纯函数。
- `src/data/main-agent.ts`：`isMainAgentFor(ctx, agent)`，记忆行与经验行共用的唯一一处主 Agent 判断。子 agent 为否；读项目的持有者记录（`mainAgentOf`），记录指向别的会话为否，指向本会话时再核对本会话的 `hournessMainAgent` 投影；没有图服务、没有工作目录、记录读不到时按「设计行不在」处理，任何根 agent 都算，原因随返回值交给行健康。M3 在持有者记录旁边加的带模式核对的读法进 main 后，只改这个文件。

经验的纯函数层〔M5 步骤 C1，设计 `.agents/tasks/m5/design.md` §4，节点 `lessons-1`、`lessons-2`〕：`src/lessons/` 是 `dsh-hourness` 的源目录（`scripts/packages.mjs` 的 `hourness.src`），行与工具随步骤 L1 加。三个文件都是纯函数，不用 Node 内置模块，经验页以后直接导入。

- `src/lessons/model.ts`：经验 `Lesson` 与候选 `Candidate` 的形状，写入的字段检查（`checkLessonFields`、`checkCandidateFields`、`checkSituation`：情况四项至少一项、报错片段 8 至 300 字符、证据 1 至 8 项按 `parseRef`、像密钥的文本拒为 `secret_like`），签名 `signature` 与相似 `similar`，权限 `userOnly`（删除与恢复只有人，或带人原话的 `llm`），十四种流水操作的折叠 `applyRecord`。折叠与写入方共用 `judgeRecord`：它给出新状态，或带 `invalid`、`duplicate`、`stale`、`not_found`、`user_only` 之一的拒绝；折叠把拒绝记成坏行。另有 `proposeRecords`（候选与生效经验签名相同则并入，与人删掉的相同则丢弃，否则成为候选）、`candidateEvidence`（证据由交回的上下文拼出）与 `newId`（`L-`、`C-` 加 6 位十六进制，撞号重取，至多 5 次）。
- `src/lessons/match.ts`：`pathsMeet`（通配对通配按字面前缀判，`globMatch` 用记忆化的逐段匹配，不用正则）、`commandMatches`（命令位置上、按词）、派发打分 `relevant`（文件 3 分、命令 2 分、工具 1 分，总分至少 2 才进简报）、失败匹配 `matchFailure`（规整后的报错片段是失败文字的子串，最长的在前，至多 2 条）、查询打分 `queryLessons`、复发判断 `dueRecurrences`（28 天内 3 个不同会话，同一条 28 天内提醒一次，每个自然周〔周一起，UTC〕至多 2 条）。工具名两边都是原生名，路径是仓库相对路径。
- `src/lessons/render.ts`：简报里的一行 `briefLine`（至多 300 字符，先截解法，再截情况，最后截坑）、失败后的提醒 `failureNotice`（每条至多 400 字符）、候选提醒 `candidateNotice`（至多列 5 条）、复发提醒 `recurNotice`；都写明经验是建议不是规则。

经验行〔M5 步骤 L1，设计 `.agents/tasks/m5/design.md` §4、§5、§7、§8.1，节点 `lessons-1`〕：`src/lessons/` 在步骤 C1 的三个纯函数文件之外多了行与它的零件。项目是会话的工作目录所属的项目，经验都在它的 `.llm/lessons.jsonl`，没有用户级经验流水（`d-memory-scope`）；项目目录与记忆行同一个取法（数据服务的 `projectDirOf`，没有数据行时直接调 `src/data/project-root.ts`），写入走 `src/data/journal.ts`。

- `src/lessons/storage.ts`：`LessonsEnv`（项目目录、时钟、取号的随机源、路径是否不分大小写、原生工具名、给行健康的备注）、`readLessons`、`writeLessons`（`appendJournal` 加折叠函数）与 `foldNew`（用折叠的同一套规则先试一遍要写的记录）。
- `src/lessons/merge.ts`：`lessons_merge` 的请求检查 `checkMerge` 与计划 `planMerge`（九种动作：`new`、`into`、`revise`、`confirm`、`retire`、`drop`、`reopen`、`delete`、`restore`）；工具、`/lessons` 与命令行共用，拒绝都来自模型的规则（`invalid`、`secret_like`、`duplicate`、`stale`、`not_found`、`user_only`）。
- `src/lessons/tools.ts`：`lessons_query`（所有 agent）与 `lessons_merge`（根 agent；委派的子 agent 得 `role`）；说明里的示范是一次真实的调用。
- `src/lessons/service.ts`：服务 `glmHournessLessons`：`relevant`（简报用，总分不到 2 的不给）、`propose`（收下 / 并入 / 丢弃，字段不合格或像密钥答 `rejected` 什么都不写，服务自己的失败答 `{error}`；从不抛错）、`stats`、`hygiene`。
- `src/lessons/notices.ts` 与 `import.ts`：给主 Agent（`src/data/main-agent.ts` 的 `isMainAgentFor`）的候选提醒（候选集变了才再来；开了 30 天的候选在这一步记为过期）与复发提醒（先记 `recur-notified` 再提醒，一步一条）；候选提醒的步里按需导入 M7 留在图上的 `[候选经验]` 批注（第一次、之后至多一分钟一次且图的修订变了、`propose` 失败之后马上看）。
- `src/lessons/path.ts`、`src/lessons/docs.ts`〔`docs-at-hand` 设计 0.3 §5，`ORCHESTRATION.md` §8.6、§8.7〕：同一行里 `tools/post-execute` 上的第二个 host 级监听器：成功的原生 `read`、`write`、`edit`（别名经 `toNativeTool`）、不带 `parent` 的调用，先 `await next()`，再把一条来源为 `glm-hourness-lessons-path` 的 notice 放在下游 `additionalContexts` 之前：路径所属组件的 `AGENTS.md`（DSH 没送达时，判法见 §8.6 的路径提醒一条）、其「决策」一节的 id 与图里写入范围覆盖这条路径的任务的 `source` 连线所指的决策在图上的现状、开着的活、按这条路径匹配的经验（`relevant`）。纯函数在 `docs.ts`（`componentDirOf`、`decisionIdsOf`、`graphFacts`、`pathNotice`），读文件、读图（缓存 10 秒）、读经验账本与去重在 `path.ts`；失败时丢那一部分、行健康备注键 `path`，监听器出错时结果原样返回。
- `src/lessons/failure.ts`〔M5 步骤 L2，设计 §4.4、§4.6，节点 `lessons-2`〕：host 级 `tools/post-execute` 监听器（类型 `PostExecuteHost` 等在 `src/shared/dsh-min.ts`）。失败的调用——shell 工具（原生名 `pwsh`、`bash`；GLM 路由上的 `Bash` 经 `toNativeTool` 换成 `pwsh`）退出码非 0 或超时，或任何工具的结果是错误（被 `tools/pre-execute` 拒绝的也是）——先 `await next()`，再用 `matchFailure` 找输出里含报错片段的生效经验（stderr 末尾 4,000 加 stdout 末尾 2,000 字符；错误结果取文字与 `error.message` 的前 6,000 字符），有就把一条来源为 `glm-hourness-lessons` 的 notice 放在下游决定的 `additionalContexts` 之前，其余保持下游的决定。同一会话同一条经验只提醒一次（可见历史里这种 notice 的 `lessons` 列过的，加本进程推给这个会话的）；带 `parent` 的传输层子调用与没有 agent 的调用不看。推出去的经验各记一条 `hit`（会话、agent、调用号、原生工具名），不等写完。「已说过」的读法认两种来源的 notice（失败匹配的 `lessons` 与路径提醒的 `keys`），本进程推出的记录与路径提醒共用一份。监听器出错时返回下游的决定原样不动，告警一次，行健康写原因。`src/lessons/match.ts` 的片段比较按去掉颜色码后的长度算（至少 8 字符）。
- `src/lessons/commands.ts`：`/lessons show | delete <L-编号> | restore <L-编号> | drop <C-编号>`，身份为人。`src/lessons/cli.ts` 与 `scripts/lessons/cli.ts`：命令行 `npm run -s lessons -- [--cwd 文件夹] show | apply [--file 文件]`（`docs/DEVELOPMENT.md` §13）。
- `src/shared/row-support.ts`：记忆行与经验行共用的件（按原因只告警一次、按会话记备注、晚到的命令与投影服务）。`src/shared/tool-names.ts` 加 `LESSONS_TOOL_NAMES`，常驻名单加 `lessons_query`。

迁移〔2026-10-28〕：从 `~/.dsh/profiles/desktop/.llm/`（只读）与仓库 `.llm/audit/usage.jsonl` 复制，按整行去重。用户级用量流水共 1080 条：仓库 890 条加旧目录 190 条，两者没有重复，按时间排序，最晚一条 2026-10-27T12:29:08.993Z。旧目录的 1 条记忆（`glm-hourness-handoff`）并入仓库 `.llm/memory.json`；旧目录的 3 条决策在仓库决策流水里都已存在。清理〔2026-10-29，项目图 `m1-cleanup`〕：重新核对旧目录的 190 条用量、3 条决策与记忆文件都已在新位置后，删除旧目录；仓库 `.llm/audit/usage.jsonl` 的最晚一条恰为截止点 2026-10-27T12:29:08.993Z，桌面版重启加载新代码之前没有再追加，补拷 0 条。同日按用户要求「用量之类的我们仓库的东西最好删掉」：用户级流水删去旧的 pi-ai `glm` 路由（8317 反代）留下的 806 条（`glm/glm-5.3` 796、`glm/glm-5.3-flash` 10），1177 条余 371 条，其余记录逐行不变；改前备份 `usage.jsonl.bak-1793243554750` 在 m8-ui-audit 最终走查核对过积分面板之后，按用户要求「顺手清掉没用的文件」于同日删除；仓库 `.llm/audit/usage.jsonl`（890 条，非旧路由的 274 条逐行都在用户级流水里）与没有代码再写的 `.llm/audit/dialect-init.jsonl` 删除。积分面板与 `/hourness` 从此不再计入反代时期的消耗。

会话原文〔已实现 2026-11-05，任务 `compact-recall`，调查报告方案 C；行 2026-11-06 起默认启用〕：GLM 压缩后模型读原文的落点（§5.6）。`src/data/transcript.ts` 写，`src/data/transcript-row.ts` 经服务 `glmHournessTranscript` 交给 `glm-compact` 行调用。

- 读什么：只读正在压缩的那个会话，`sessionQuery.filterEvents(会话 id, [])` 一次读整份日志（会话活着时读内存里的那份），得到每个有文字的事件一条文档，按 seq 升序（§2.4a 对照表）。不读别的会话，不用官方的 experimental 会话检索包，不加工具。
- 放哪里：`<项目数据目录>/transcripts/<会话 id>.txt`，绝对路径。项目数据目录按 `projectHomeFor` 取（行配置 `home`，会话工作目录所属项目的 `<检出根>/.llm`，数据服务的 `projectHome`）。目录名是 `.llm` 时先 `ensureLlmIgnored`，结果不是 `ignored` 或 `no-git` 就不写，行健康写原因；本仓库的 `.gitignore` 本来就有 `.llm/`。会话 id 须匹配 `^[A-Za-z0-9_-]{1,128}$`，否则不写。
- 格式：UTF-8 纯文本，换行一律 LF。前五行是说明（会话 id 与导出时刻；内容是什么、不含推理与图片；条目标题的写法与续行规则；像凭证的字符串换成 `[redacted]` 与这份导出换了几处；空行），之后每条文档一段：标题行 `=== #<seq> <种类> <ISO 时刻>`，正文，空行。种类：`user/message` 写 `user`，`assistant/message` 写 `assistant`，`tool/call` 写 `tool call`，`tool/result` 写 `tool result`，`todo/write` 写 `todo`，`turn/end` 写 `turn end`，别的类型写类型名。超过 1000 个码点的行切成多行（不拆代理对），所以 Read 的单行 2000 字符截断碰不到，按 `offset`/`limit` 分页读不丢字；50 KB 的窗口上限由 Read 的部分视图提醒给出续读位置（§5.4）。文档全部保留、不去重：助手消息里的工具调用块与 `tool/call` 事件会重复一次参数。
- 遮掉凭证〔已实现 2026-11-05，任务 `compact-recall-redact`；人 2026-11-05「那两件也按你说的来」〕：改动前的导出把会话里出现过的凭证原样带出（核实记录：L3 场景 `glm-compact-transcript` 的任务文字带两个假凭证，一个 Bearer 值、一个具名前缀的 key，改动前的导出里两个都在，出在人的那条消息里；之后的两处是模型 Read 这份导出得到的工具结果）。现在每条文档的正文在切行之前过一遍记忆行 `secret_like` 用的同一张表（`src/data/secret-shape.ts` 的 `redactSecretsCounted`，`redactSecrets` 是它只取文字的一面，不另造规则）：具名前缀（`sk-`、`ghp_`、`github_pat_`、`xoxb-`、`AKIA` 等）、`Bearer` 值、PEM 私钥（从 BEGIN 行到 END 行整块；没有 END 行时只遮 BEGIN 行）、32 位以上大小写字母与数字混排的令牌、32 位以上的十六进制（完整提交号也在其中），每一段换成固定的 `[redacted]`，其余字符不变，换了几处写进说明第四行与行健康（「遮掉 N 处像凭证的字符串」）。条目标题与说明行不过这张表；摘要末尾的续接原句不在导出里，也不经这一步，仍是 3.17.1 逐字（`reference/zcode-verbatim.md` §7）。遮掉时抛错（Node 22 上单个几百万字符长的令牌段会让正则引擎的回溯栈溢出，`RangeError`）就整份不写：导出记为跳过，原因「遮掉像凭证的字符串失败，不写明文：<错误>」，摘要不带路径，该会话的行健康降级并写明原因。已有的旧导出不在这次改动里重写，下一次压缩整份重写时才遮，没有压缩的旧文件按 14 天清理。这张表按形状判，没有前缀的短密码、被 `/` 或 `.` 切开的令牌认不出；`gitleaks` 的规则不在运行时用（它是独立二进制，只管仓库，§10）。L2：`tests/data-transcript.spec.ts`（六类样例导出后不含原串、遮掉 6 处、其余逐字不变，无凭证时原样且计 0，遮掉抛错时不写文件、行健康降级）、`tests/data-secret-shape.spec.ts`（计数与 `redactSecrets` 一致，PEM 整块）；L3 场景 `glm-compact-transcript` 的一条核对见 §5.6。
- 覆盖与清理：一个会话一个文件，每次压缩整份重写。每次写完，同一目录里文件名匹配 `^[A-Za-z0-9_-]{1,128}\.txt$`、不是刚写的这份、最后写入早于 14 天前的文件删掉，别的名字不碰；删不掉的计数进行健康。闲置 14 天的会话回来后读到「文件不存在」，下一次压缩会重新写。
- 启用与已知边界〔2026-11-06，人的原话「那就开」〕：行出厂启用。人拍板前被告知的取舍：磁盘上多一份会话的明文副本，只在项目被 git 忽略的 `.llm/transcripts/` 下，14 天清理；遮掉按形状判，模型用自己的话拆开或改写过的凭证认不出，会留在副本里。桌面版 L4（2026-11-06，隔离实例，`.agents/tasks/compact-recall/l4.md`）八项检查通过，观察 1 实测了这条边界：会话里模型调 `memory_store` 被 `secret_like` 拒绝后，把 key 写成「The letters "sk-" joined directly to <其余部分>」，这一句不是令牌形状，导出里原样保留，读的人能拼回原串；形状明确的两个假凭证照常换成 `[redacted]`。这是形状判法的固有边界（`src/data/secret-shape.ts`），不是实现错误，本行不另加语义判断；同一会话的 DSH 原日志与模型写的检查点摘要里原串本来就在（摘要按设计不遮）。

凭证与 deviceMid〔定案 2026-10-28，用户选 A；已实现 2026-10-28，L4 验收之后〕：保留加密凭证文件，搬到 `$DSH_HOME/glm-hourness/`，本包当时的 deviceMid（`device-mid.txt`）随行。凭证文件自 m1-parity 起只存登录令牌与项目 key 的定位，不再有 API Key 与 secret（§4.1）。自 m1-parity 起本包不再读写 `device-mid.txt`：请求发送的 deviceMid 是 ZCode 状态文件里的那个，状态文件没有时按 3.16.3 生成并写回（§4.5b）；已有的 `device-mid.txt` 是用户数据，不删除，也不再使用。加密密钥由 `GLM_HOURNESS_CREDENTIAL_SECRET` 或 `HOME`/`USERPROFILE`、平台、架构推导（§4.1，`src/glm-llm/auth/store.ts`），与文件路径无关，搬家后同一台机器照样能解密。

- 解析：`glm-llm` 与 `glm-login` 的 `home` 改为可选，`credentialHome(home)`（`src/shared/data-home.ts`）取非空的行 `home`，否则取用户级目录。两行不读数据目录服务：通道行激活时数据行可能还没激活，而凭证目录在激活时就要定下来。bundle patch 删去两行的 `home`；探针与测试仍显式传 `home` 指向临时目录。
- 文件：两份文件于 2026-10-28 复制到 `C:\Users\29596\.dsh\glm-hourness\`。2026-10-29 批次 L4 确认新代码从用户级目录读到凭证并迁移为版本 2（§4.1）之后，仓库 `.llm/credentials.json` 与 `.llm/device-mid.txt` 已删除（项目图 `m1-cleanup`）；删除前核对用户级目录两份文件都在，`device-mid.txt` 与仓库原件摘要相同。

### 2.4a 运行时契约来源〔实读 2026-10-27〕

`reference/deepseek-harness` 的源码版本号同样标 0.2.1-rc.3，但它是 2026-10-23 的主干，接口与桌面版运行时不同。桌面版运行时的包已从 `app.asar` 导出到 `reference/dsh-desktop-0.2.1-rc.3/`（只有编译后的 `lib`，没有 `.d.ts`），以它为准。已确认的差异与事实：

- 工具服务没有 `executable()`；按名查定义用 `get(name, scope)`（受限制隐藏的全局工具读作不存在）。
- `register(definition)` 没有第二个参数，不存在 `when` 激活谓词；作用域内注册遮蔽全局同名工具。
- `restrict()` 只能在作用域上下文调用，只过滤继承来的工具，不影响本作用域自己的注册；名字必须是已知的全局工具。
- 每一步先执行 `system-prompt/assemble`，再执行 `agent/pre-step`。发给模型的工具列表就是组装结果里的 `assembly.tools`（名称、描述、参数、`deferLoading`），组装瀑布可以逐请求改写它。
- 路由只出现在组装变量 `variables.provider` / `variables.model` 中（由 `installModelSelection` 注入）；`agent/pre-step` 载荷只有 `{agent, messages, turn, step, signal}`。
- 工具执行按名在调用方作用域的可见定义中解析，与本次请求的工具面无关：不在工具面里的已注册工具被直接调用时照常执行。
- `tools.execute(input)` 让一次调用走完 pre-execute、guard、执行、post-execute 与结果渲染；带 `parent` 令牌的调用是传输层子调用（`run_code` 的先例）：会话检查点等监听器跳过它，跳不跳由各监听器自己定（主 Agent 的边界规则照判，`ORCHESTRATION.md` §6.7）。
- `agent/pre-step` 的决策 `messages` 会作为该步输入追加进会话；inbox 按消息 `id` 去重，重复或缺失 `id` 会抛错，因此合成 notice 必须带 `id` 与 `role`（与 `createUserMessage` 同形）。
- `session.deriveMessages()` 给出请求可见的历史（已应用压缩投影）。消息 `source` 只校验 `kind` 非空，其余字段原样保存。

影响：`glm-prompt` 与 `toolsearch` 依赖 `executable()` 捕获原生执行器，在桌面版运行时会抛错；`glm-prompt` 的异常被捕获后，提示词改写与别名都不会安装。L3 探针确认（2026-10-27）：GLM 路由下系统提示词仍是 DSH 原文，工具面是 28 个原生工具，模型调用 `Read` 得到 `unknown tool "Read"`；工具检索也没有延迟任何工具。

#### 接口对照表〔实读 2026-10-28，`ROADMAP.md` M1.6〕

本包用到的每个 DSH 钩子、服务成员与载荷字段，逐项对照 `reference/dsh-desktop-0.2.1-rc.3/<包>/lib/index.js`。证据写作「包:行」，包名省略 `dsh-` 前缀；`官方` 指已安装的官方 `.d.ts`（`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-attachment`）。结构类型集中在薄适配层：`src/shared/dsh-min.ts`（宿主钩子、服务、载荷）与 `src/shared/lm-min.ts`（LLM 消息与流的词汇、附件服务成员）；各行不再自带宿主类型。用 `agent/pre-step` 追加 notice 的各行共用公共库里的接缝 `src/shared/step-notice.ts`（§5.5）。宿主升级时，先重新导出运行时包，再按本表逐项复核这两个文件。

插件与 Loader：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| 模块导出 `name`、`inject`、`Config`、`apply(ctx, config)` | 全部行 | cordis:1625–1635（读 `plugin.name`、`plugin.Config`、`plugin.inject`），cordis:1536（`plugin.apply`），cordis:956–961（`Config` 经 `~standard` 校验） | 一致 |
| Loader 行的 `inject` 与模块的 `inject` 合并 | glm-llm、glm-login、memory、hourness | cordis-plugin-loader:631 | 一致 |
| `ctx.on(name, listener, options)`；`prepend` 排到最外层，`global` 跳过分发过滤 | 全部行 | cordis:372–381、cordis:263；服务的过滤只认同一 isolate，cordis:1785–1787 | 一致 |
| `ctx.get(name)`：不需要 inject，提供方 fiber 未激活时为 `undefined` | glm-llm（`attachments`、`fs`）；guard、memory、lessons、workflow、hourness（`glmHournessData`，每次写入或命令调用时读）；lessons（另读 `glmHournessGraph` 与 `sessionProjections`，判主 Agent、导入图上的批注，`glmHournessDialect`，把工具名换成原生名）；memory（另读 `glmHournessGraph`，核对出处里的节点、给学习摘要读图的历史；读 `sessionProjections` 与持有者记录，判学习摘要提醒该发给谁，经 `src/data/main-agent.ts`）；glm-prompt（`glmHournessMemory`，每个会话的 agent 创建时读一次 `depth`）；glm-login（各行的 `glmHournessHealth/<行>`，`/glm-status` 调用时读）；rules（`glmHournessPricing`，每分钟读一次高峰；`agents`，会话登记里没有的会话才读，另在重判等待单、找派发链的根和发唤醒时读；`goals`，发唤醒时读 agent 的 goal 阶段；`sessionProjections`、`workingDirectory`，门每次判定读调用者的角色与工作目录；`glmHournessLifts`、各行的 `glmHournessStatus/<行>` 与 `glmHournessHealth/<行>`，写规则页的数据时读，`ORCHESTRATION.md` §16.14）；guard（`glmHournessRules`，组装 `glm:guard` 节时读）；transcript（`sessionQuery`、`agents`、`glmHournessData`，每次导出时读） | cordis:763–766 | 一致；L3 探针实测 guard 与 memory 经它拿到数据行的目录，`/glm-status` 经它读到各行的健康视图 |
| `ctx.provide(name, value)`：服务归调用方 fiber，同名第二个提供方抛错，返回的 disposer 撤销服务，fiber 卸载时自动撤销 | data（`glmHournessData`）；memory（`glmHournessMemory`，契约在 `src/shared/memory-service.ts`）；lessons（`glmHournessLessons`，契约在 `src/lessons/service.ts`，派发工作的一侧读写）；全部主机行（`glmHournessHealth/<行>`，§2.5；`hourness`、`rules`、`guard`、`env` 行各另有状态视图 `glmHournessStatus/<行>`，§2.6）；rules（`glmHournessPeakMode`，契约在 `src/shared/peak-mode.ts`，派活、GLM 包与循环板读它；`glmHournessRules`，契约在 `src/rules/service.ts`，guard 读它）；loops（`glmHournessLoops`，契约在 `src/loops/service.ts`，要交条目的行读它的 `contribute`）；transcript（`glmHournessTranscript`，契约在 `src/shared/transcript.ts`，GLM 包的 `glm-compact` 读它） | cordis:800–830（经 `fiber.effect` 注册）；同一用法 cmdline:29–31 | 一致；激活期的抛错被捕获，降级为 warn |
| `ctx.inject(names, callback)`：所列服务都在时在子 fiber 里调 callback，其中一个离开时卸载这个 fiber；callback 返回的函数是它的 disposer；子 fiber 的上下文带着父的 `provide` 与 `get` | graph-panel（`sessionProjections`；`agents` 与 `subagents` 一起，停子 agent 用）；memory、lessons（`commands` 与 `sessionProjections` 各一次，注册 `/memory`、`/lessons` 与投影 `hournessMemory`、`hournessLessons`；不改本行的激活条件，服务晚到或不来时行健康写明；两行共用 `src/shared/row-support.ts` 的 `whenPresent`）；rules（`sessionProjections`，经 `whenPresent` 注册 `hournessRules`，不进行的 `inject` 名单；不在时行健康部分生效，`ORCHESTRATION.md` §16.14）；loops（`sessionProjections`，注册 `hournessLoops`；`sessionController`，在它里面提供服务 `glmHournessLoops`、起 60 秒的拍、运行项目的条目——只有能到达会话的进程才做这些，`ORCHESTRATION.md` §18.9；两者都不在时行只降级或写一行「这个进程不跑循环板」，别的部分照常） | cordis:1600、cordis:1071（返回 callback 的结果）、cordis:1142–1143（返回函数即收为 disposer） | 一致；L2 假宿主 `fakeInjector`（`tests/fake-rc3.ts`）按此建模，子 fiber 的上下文是父的加上所列服务 |
| 服务 `sessionController`（`resolveAgent(sessionId)` → `{agent}` 或 `{error}`，错误码 `session/not-found`、`session/writer-held`、`gateway/internal`） | loops（既是「这个进程能不能到达会话」的判据：有它才提供服务、才运行条目；也用来恢复冷的主 Agent 会话来投递，两种错误码分别让 `holderState` 变 `not-found` 与 5 分钟的 `elsewhere`，`ORCHESTRATION.md` §18.10） | api-session-controller:2951–2952（`super(ctx, "sessionController", …)`）、3037–3039、221–246 | 〔实读〕；从本包的行里调用的效果未核实（headless 没有它，探针因此钉住「不跑条目」那一面；设计 §10.2 V3、V16） |
| 服务 `schedule`（`create(sessionId, {title, prompt, <选择器>})`、`list({sessionId})`、`catalog()`、`delete({sessionId, id})`、`update({sessionId, id, expected, title?, prompt?, change?})`；记录按种类整键解码，`delete` 连发送记录一起删，`update` 的 `expected` 要 `list` 给的那条） | loops（到点告诉主 Agent 的条目各绑一条任务，对账、改回、搬、删都经它；经 `ctx.get('schedule')` 取，不写进 `inject`：headless 没有它，到点的条目于是不建也不报错） | schedule:1992（`super(ctx, "schedule")`）、2083–2112、2120–2122、2129–2136、2164–2182、2197–2224、74–77、1806–1837、1710–1716、93–97、21 | 〔实读〕；从本包的行里取到的效果未核实（设计 §10.2 V1）；L2 的假宿主 `fakeSchedule` 按这些拒绝与规范化建模 |
| 服务 `sessionQuery` 的 `filterEvents(sessionId, filters)`：一个会话日志的全部语义文档 `{sessionId, seq, type, time, surface, text}`，按 seq 升序；空的过滤列表保留全部 | transcript（经 `ctx.get('sessionQuery')` 取，不写进 `inject`；过滤列表传 `[]`；结构类型 `SessionQueryLike`、`SessionEventDocumentLike`） | 官方 `@deepseek-ai/dsh-session-query@0.2.1-rc.3` 的 `lib/types/index.d.ts:23–25`（`Context.sessionQuery`）、`:118`（`filterEvents`），`lib/types/types.d.ts:45–55`、`:210–212`（未装进仓库，`npm pack` 解出来读）；session-query:1048（`super(ctx, "sessionQuery")`）、1152–1163、614–631、545–565、669；dsh-base 的组合挂的是 SQLite 子类（`dsh-base/cordis.patch.yml:157–158`，session-query-sqlite:476），它不覆盖 `filterEvents`，`openAt: never` 只挡检索（session-query-sqlite:590–597） | 〔实读〕；没有编译期对照（官方类型不是开发依赖，§8）；L3 场景 `glm-compact-transcript` 在真运行时上经它导出 |
| 服务 `workspaceRegistry`（`archivedSessionIds` getter、`list()`；服务没启动时 `requireState` 抛错） | loops（`holderState` 判主 Agent 的会话是不是已归档；读不出时整块板照常投、但一条到点任务都不删） | dsh-workspace:376、506–508、454–460、934–937、526–541、621–629 | 〔实读〕；从本包的行里取到的效果未核实（设计 §10.2 V14、V17） |
| 事件 `schedule/changed`（提交之后发、没有载荷）与 `workspace/session-stop`（`{sessionId}`，只在带 `stopActivity` 归档时发） | loops（各挂一个只读监听器，当场对一次账；收不到时每 60 秒一拍的对账照样做） | schedule:2231–2237；dsh-workspace:540、623 | 〔实读〕；本行收不收得到未核实（设计 §10.2 V2、V15） |

事件：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `agent/created`（serial，`{agent, source, signal?}`） | glm-prompt、guard、graph、memory（委派的子 agent：装去掉记忆工具的监听器；根 agent：装会话开局的记忆索引）、lessons（委派的子 agent：装去掉 `lessons_merge` 的监听器；根 agent：装候选提醒与复发提醒）、rules（记下会话的工作目录，给 agent 装每步提醒，把会话记入心跳，读项目状态并上报，接手前一个宿主为这个会话留下的不做档的单，`ORCHESTRATION.md` §16.13）、design（给 agent 装身份节与工具面监听器；对仍以为自己是主 Agent、而持有者记录指向别的会话的会话，登记「空闲之后跑 `/wish off`」，不在监听器里等它，因为监听器逐个 `await` 完才算创建完）、loops（会话的工作目录在哪个项目里，就对账那个项目的循环板文件一次并重写它的 `view.json`，`ORCHESTRATION.md` §18.7） | agent:581–585 | 一致 |
| `system-prompt/assemble`（waterfall，`(assembly, context, next)`，按 agent 作用域分发） | glm-prompt、guard（规则声明节）、memory（只装在委派的子 agent 上，不带 `prepend`，去掉记忆与学习的五个工具，所以方言不给子 agent 加 `glm:memory` 节）、lessons（同一做法，只去掉 `lessons_merge`，子 agent 留着 `lessons_query`）、design（两个监听器：`prepend` 的加身份节，不带 `prepend` 的去掉主 Agent 工具面里的工具并加人设一节，所以方言与工具检索的 `prepend` 监听器在 `next()` 之后看到的是去掉之后的工具和人设一节；同一个 agent 作用域上不同插件的监听器进同一张表，L3 场景 `glm-design-main` 核对） | system-prompt:398；`assembly` 的 `sections{name, text, interpolate?}`、`contexts`、`tools{name, description, parameters, deferLoading?}`、`variables` 见 system-prompt:365–393；完整节在瀑布之后恢复，system-prompt:399–405；`interpolate: false` 的节原样渲染，system-prompt:109–118 | 一致 |
| 组装变量 `variables.provider` / `variables.model` | glm-prompt、guard（`src/shared/route.ts`） | agent:167–181（`installModelSelection` 在 `next()` 之后写入） | 一致 |
| `session/event`（只观察，`(session, event)`，在 `append` 内同步调用）；事件冻结为 `{type, seq, time, data}`；agent 作用域上也能听 | guard（影子兜底）；design、graph-panel、loops 的步前待送（`src/shared/step-mailbox.ts`，在 agent 作用域上听本会话的 `user/message`，以 `data.id` 判断提示已落盘） | session:1517–1536（`append`）、session:1579–1598（`commit` 同步通知观察者）；`turn/start` 的 `data.turn` 见 agent-loop:945；`workspace/changes` 的 `data.turn` 见 workspace-changes:871；agent 作用域上的监听见 agent-loop `agent.ts`:357、rc.3 `dsh-agent-loop/lib/index.js`:976 | 一致；观察者运行时摘要还没存进去（workspace-changes:871 先追加事件，873 才存摘要），所以晚一个微任务再读 |
| `session/disposed`（只观察，`(session)`） | guard（影子兜底）、rules（忘掉会话登记里的工作目录，撤掉这个会话的提醒，会话离开心跳，这个会话持有的等待单转给派发它的 agent 或取消，`ORCHESTRATION.md` §16.12） | session:1925–1936 | 一致；一次性子 agent 交回之后事件会发出（L3 `rules-handover` 实测，V11） |
| `agent/pre-step`（waterfall，`{agent, messages, turn, step, signal}`；默认决策 `enter` 带本步认领的消息） | glm-prompt（工具检索公告、todo 提醒、高峰提醒）、graph（每步投影）、memory（记忆索引，经 `installStepNotice`）、lessons（候选提醒与复发提醒，经 `installStepNotice`，只给主 Agent）、design（主 Agent 的阶段提醒，`ORCHESTRATION.md` §4.8；本步是不是主 Agent 取自本步组装时记下的判定，组装在 `agent/pre-step` 之前）、execute（工具面过滤的首步兜底；主 Agent 每步比一次主干，认出没有调用认领的前进，E7，`src/execute/advance.ts`；持有者每步在 `next()` 之前跑自动推进的判断、送出留着的循环板通知、装派发状态提醒，E8，`src/execute/drive.ts`、`notice.ts`；两个监听器都原样返回 `next()` 的判定，`ORCHESTRATION.md` §17.12、§17.13）；design、graph-panel、loops 的步前待送（`src/shared/step-mailbox.ts`：不叫醒的提示放在本步消息最前面，拒绝、取消与空决策不动） | agent-loop:901–925；`agent` 由 agent:241–245 并入；空决策守卫照抄 agent:193–197 | 一致；本节上文原写载荷无 `turn`，已更正 |
| `tools/pre-execute`（waterfall，`(exec, next)`，默认 `allow`） | guard、workflow、graph（图文件门禁，`prepend` 注册）、execute（派发链的执行边界规则、`trunk-advance-checked` 执行前的一半与主 Agent `update_goal complete` 的完成门禁 `completion-gate`（E8，`src/execute/drive.ts`，装在主干门之后、执行边界规则之前），`prepend` 注册；执行行在规则行之后装，所以在规则板的门外层：它拒的调用到不了规则板，它放行的本地主干前进经 `glmHournessExecute.trunkAdvanceFor` 留给规则板，`ORCHESTRATION.md` §17.12）、rules（规则板的门，`prepend` 注册，在它之前装的各行外层，先 `next()`、内层不放行就原样返回；带 `parent` 的子调用也判；监听器不抛错：抛错会变成这次调用的错误结果，tools:3364–3368，所以读状态或判定出错一律放行并降级行健康）、loops（循环板的文件门 `loops:files-only`，`prepend` 注册，做法同图行；带 `parent` 的子调用也判；判不出来就放行并告警，`ORCHESTRATION.md` §18.8） | tools:3320–3321；决策 `allow` / `deny{reason, info?}` / `ask` / `cancel`，tools:3322–3345；拒绝时结果为 `Error: ` 加理由，工具体不执行，tools:3337–3353 | 一致；guard 的决策类型补上 `ask`、`cancel` 透传 |
| `exec` 字段：`callId`、`rootCallId`、`name`、`arguments`、`signal`、`agent?`、`parent?`、`schema?`、`deferContext`、`concludeTurn` | guard、workflow | tools:3229–3260 | **偏差已修**：guard 从 `exec.agentId` / `exec.sessionId` 取违规记录的 id，rc.3 没有这两个字段，记录里永远为空；改为 `exec.agent.id` 与 `exec.agent.session.id` |
| `llm/stream`（waterfall，`(options, next)`） | memory（用量流水）、glm-compact | llm:2397；`options` 即 `GenerateOptions`（官方 types.d.ts:506–548：`provider`、`model`、`messages`、`sessionId?`、`purpose?`），编译期检查 `LlmStreamOptionsContractCheck` | 一致；memory 对 `provider` / `model` 的 `'unknown'` 兜底删除（两者必填）。L3 探针实测每个 GLM 步一条用量记录，带 `sessionId`；压缩调用带 `purpose: 'compaction'` |
| `tools/post-execute`（waterfall，`(exec, result, next)`，返回官方 `PostToolDecision`：`accept` 可带 `content`，`block` 带 `feedback`，两者都可带 `additionalContexts`；本包读 `exec` 的 `name`、`arguments`、`agent`、`parent`、`callId`，读 `result` 的 `isError`、`content`、`value`、`error`） | lessons（失败匹配，host 级监听器；类型 `PostExecutePayload`、`PostExecuteDecision`、`PostExecuteListener`、`PostExecuteHost` 在 `src/shared/dsh-min.ts`）；执行行的主干比对（E7，`src/execute/advance.ts`，`trunk-advance-checked` 执行后的一半：主 Agent 与派发链的 shell 调用先 `await next()`，再重读本地主干与远端跟踪引用，表认不出的前进记违规，`prepend`）与批次批注（E8，`src/execute/drive.ts`：主 Agent 成功的 `propose_to_human` 与 `await_human` 之后在目标上记一批，`prepend`） | tools:3589–3631（`postExecute`：默认决策 `accept`，结果自带的 `additionalContexts` 在前、决策的在后，`block` 丢掉工具体延后的上下文）、3418–3420 与 3448（工具体失败、未知工具与被 `tools/pre-execute` 拒绝的结果同样走到这里，tools:3339–3353）；官方 `PostToolDecision` 见 `reference/deepseek-harness` 的 `api-catalog.ts` | 一致；先例 repeat-tool-reminder:2247–2260。假设 U1（host 级监听器看得到子 agent 的调用）与 U2（notice 在下一次请求里紧跟这次工具结果）由探针 `glm-lessons-failure`、`non-glm-lessons-failure` 核对，两条都成立（2026-11-01，GLM 与非 GLM 路由，子 agent 的失败也带提醒）。`tests/fake-rc3.ts` 的工具管线按真宿主的顺序补了这一步 |
| `tools/post-execute`（waterfall，`(exec, result, next)`，返回官方 `PostToolDecision`：`accept` 可带 `content`，`block` 带 `feedback`，两者都可带 `additionalContexts`；本包读 `exec` 的 `name`、`arguments`、`agent`、`parent`、`callId`，读 `result` 的 `isError`、`content`、`value`、`error`） | lessons（失败匹配与路径提醒，两个 host 级监听器；类型 `PostExecutePayload`、`PostExecuteDecision`、`PostExecuteListener`、`PostExecuteHost` 在 `src/shared/dsh-min.ts`） | tools:3589–3631（`postExecute`：默认决策 `accept`，结果自带的 `additionalContexts` 在前、决策的在后，`block` 丢掉工具体延后的上下文）、3418–3420 与 3448（工具体失败、未知工具与被 `tools/pre-execute` 拒绝的结果同样走到这里，tools:3339–3353）；官方 `PostToolDecision` 见 `reference/deepseek-harness` 的 `api-catalog.ts` | 一致；先例 repeat-tool-reminder:2247–2260。路径提醒（成功的 `read`、`write`、`edit`）加在经验行里，成功结果上的 `additionalContexts` 位置〔推断〕，由探针 `glm-lessons-path`、`non-glm-lessons-path` 核对（`docs-at-hand` 设计 §9 U3）。假设 U1（host 级监听器看得到子 agent 的调用）与 U2（notice 在下一次请求里紧跟这次工具结果）由探针 `glm-lessons-failure`、`non-glm-lessons-failure` 核对，两条都成立（2026-11-01，GLM 与非 GLM 路由，子 agent 的失败也带提醒）。`tests/fake-rc3.ts` 的工具管线按真宿主的顺序补了这一步 |
| `agent/request`（waterfall，`({turn, step, signal}, next)`，默认 `next()` 给种子路由；监听器原样返回 `next()` 的配置） | metrics（按 agent 记每步的 `(turn, step)`；载荷不带 agent，监听器装在各 agent 的 `agent.ctx` 上，`ORCHESTRATION.md` §10.6） | agent-loop:1191–1194（每次模型请求之前；`proposedConfig.provider` 空时抛错） | 一致〔实读 2026-11-04〕；本包只观察不改配置 |
| `agent/request-error`（waterfall，`({turn, step, provider, failure, retryPolicy?, signal}, next)`，默认决策 `undefined`；`{kind: 'retry'}` 换下一次尝试） | metrics（计数进下一条 `llm` 的 `retries`） | agent-loop:1136–1146（流以 `error` 或 `aborted` 收场之后） | 一致〔实读 2026-11-04〕 |
| `user-questions/request`（waterfall，`({questions, agent?, signal?, wait?}, next)`，`prepend` 注册；默认 `next()` 是无应答者的拒绝（`UserQuestionError` 码 `NO_PROVIDER`）；答案是 `{answers: [{id, selected, custom?}]}`，前台等待到时是 `{pending: true, callId}`） | metrics（`ask` 与 `answer` 各一条，`q` 取第一个问题的 `id`，不合形状写 `x-` 加 SHA-256 前 12 位） | user-questions:629–691（`ask`：零问题在瀑布之前就抛 `EMPTY_QUESTIONS`，无应答者默认 `NO_PROVIDER`）；问题形状 `{id, question, header?, options?: [{label, description?}], multiSelect?}` 与答案 `{id, selected, custom?}` 见 user-questions:22–71 | 一致〔实读 2026-11-04〕；`src/shared/dsh-min.ts` 有载荷与答案的结构类型 |
| `ctx.systemPrompt` | 无 | — | 已无行使用，结构类型删除 |

服务：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `tools.register(definition)`：校验 `output{schema, render, presentationMeta?}`，`run_code` 保留；经 `agent.ctx` 注册即作用域注册 | glm-prompt（别名、检索工具）、memory（记忆工具）、lessons（`lessons_query`、`lessons_merge`）、graph（图工具）、rules（`rules_show`，输出 `{ok, text}`） | tools:2974–2984 | 类型偏差已修：memory 声明了不存在的第二参数 |
| `tools.get(name, scope)` | glm-prompt | tools:3091–3094 | 一致 |
| `tools.execute(input)`，最终结果 `{isError, content, error?, value?, additionalContexts?, concludesTurn?}` | DeferredToolCall | tools:3210–3212、tools:3229–3260；tools:3687–3706 | 一致 |
| 工具体 `execute(args, exec)`，`exec` 就是 `createExecution` 的对象，带调用方 `agent`；返回值按输出 schema 校验；`render(exec.arguments, value)`、`presentationMeta` | 全部别名与自有工具；图工具从 `exec.agent.session.header.cwd` 解析图目录；记忆工具读 `exec.agent.session.header` 的 `cwd`（定项目目录）与 `origin`（拒绝子 agent） | tools:3227–3260、tools:3406、tools:3637–3640、tools:3644、tools:3650–3653 | 一致 |
| `llm.registerAdapter(providers, adapter)`，返回带 `replace` 的 disposer | glm-llm | llm:1842；adapter 本身由 `AdapterContractCheck` 对照官方 `LlmAdapter`（§8） | 一致 |
| `llm.stream(options)` | glm-compact（重新派发） | llm:2393–2396 | 一致 |
| `commands.register(definition)`：`name` 须匹配 `/^[a-z][a-z0-9_-]*$/u`，`description` 非空；调用参数 `{commandId, agent, rawInput, attachments, signal}`，本包读 `rawInput` 与 `agent`（行健康按 `agent` 取会话），`/graph-run` 另读 `commandId`（记进消息的 `graphRun`），`/wish` 另读 `commandId`（记进持有者记录与许愿消息）；`recordInput` 不为 false 时 `command/run` 记 `args`；可选的 `input.hint` 是非空字符串，客户端拿它当输入占位（`/graph-run` 用）；结果 `success`（`text` 可选）/ `error`（`text` 非空） | glm-login、hourness、graph-panel、memory（`/memory`，读 `rawInput` 与 `agent`，身份为人，`commandId` 记进流水）、lessons（`/lessons`，同样）、rules（`/rules`，读 `rawInput` 与 `agent.session.header.cwd`）、design（`/wish`，`recordInput` 保持默认：投影靠 `command/run` 里的 `args` 区分开启与退出）、loops（`/loops`，读 `rawInput` 与 `agent.session.header.cwd`，`input.hint` 写用法） | commands:266–269、commands:78、commands:148–180（`input.hint` 157–161）、commands:333–346、commands:379–385、commands:186–206 | 一致；hourness 上下文类型里多余的 `effect?: never` 删除 |
| `sessionProjections.register(definition)`、`sessionProjections.snapshot(session, keys)`：前者是调用方 fiber 的 effect，同键同版本的第二次注册共用（引用计数），版本不同抛错；后者读一个会话所选单元的一致切面，每个值过单元的 view schema，未注册的键不在 `values` 里 | graph-panel（注册 `graphLive` 与 `hournessProject`——后者从会话头的 `cwd` 算出主 Agent 持有者记录的路径，plain-ui 1.3 §4.9；`/graph-run` 读主会话的 `graphLive` 与 `subagentCatalog`、子会话的 `graphLive`）；design（注册 `hournessMainAgent`，从 `/wish` 的 `command/run`、`command/done` 折叠；单元状态改了就把 `stateVersion` 加一）；loops（注册 `hournessLoops`，只从会话头算一次、会话里的事件都不改它，给页面指路到项目的 `view.json`，`ORCHESTRATION.md` §18.7）；memory（注册 `hournessMemory`，状态在会话创建时由会话头的 `cwd` 算出两份记忆流水的路径，不随事件变）；lessons（注册 `hournessLessons`，同样算出项目经验流水的路径） | session-projection:68、session-projection:91–94、session-projection:141 | 一致；探针 `liveOf` 用同一个 `snapshot` 读现场（L3） |
| `sessionProjections.stateOf(session, key)`：一个单元在所有已注册单元折叠到会话游标之后的宿主状态，同步、活的（不能改），键未注册时 `undefined`；先物化整个会话的各单元，之后走水位缓存 | design（每次组装、每次 `/wish` 都读 `hournessMainAgent`；会话标题读 `title`）；rules（门每次判定读 `hournessMainAgent`，交给 `mainAgentActive`，判调用者是不是主 Agent；读不出、缺值或形状不对读作不是） | session-projection:126–131；标题单元 session-title:173 | 一致；L2 假宿主（`tests/design-host.ts`）按此建模 |
| `commands.execute(agent, line, attachments, signal)`：以人的身份跑一行命令。先追加 `command/run`（`source` 固定 `{kind: 'user'}`），再调处理函数，其结果经 `await` 之后追加 `command/done`（`{commandId, kind, text?}`）；返回 `{commandId, result}`，命令行解析不出或命令名找不到时返回 `undefined`、不抛错；`signal` 无条件读 | design（对已失去主 Agent 的会话跑 `/wish off`，返回 `undefined` 当失败）；探针（`line`、`other` 步） | commands:318–346、commands:388–394 | 一致；同一次命令里处理函数返回到 `command/done` 落盘之间，设计行用内存里的待生效状态补上（`src/design/mode.ts`） |
| `agents.roots()`：活的顶层 agent，按登记顺序，不分工作区 | design（找同一项目里别的主 Agent 会话） | agent:623 | 一致 |
| `sessionPersistence.list()`：存着的每个会话的 `header`，不论打开与否（JSONL 后端注册的服务） | design（持有者记录指向的会话是否还存在；服务不在或抛错时当作还存着） | session-persistence-jsonl:2398、2603 | 一致 |
| 活 agent：`steer(message)` 排到本回合的下一步并唤醒；`whenIdle()` 在当前活动结束时解析；`ctx` 是 agent 作用域的上下文 | design（`/wish <一句话>` 在 agent 运行中走 `steer`；空闲之后才跑 `/wish off`） | agent-loop:806–814、agent-loop:870–875、agent-loop:748–781 | 一致 |
| `subagentCatalog` 投影的值：每个直接子 agent 一条 `{id, createdAt, mode, label?}`，`mode` 为 `one-shot`、`continuable`、`external`、`unknown` | 面板现场、`/graph-run`（只停非 external 的） | subagent:703–803（条目 schema 703–730，view schema 731，`subagentCatalogEntries` 774，单元 787） | 一致 |
| `agents.get(id)`：会话 id 对应的活 agent，没有时为 undefined | graph-panel（`/graph-run` 取子 agent 的状态与会话）；rules（会话登记里没有的会话，取它的工作目录）；design（持有者会话是否打开着，取它的标题）；rules（等待单的会话还活着吗，派发链上谁是根，唤醒发给谁） | agent:596 | 一致 |
| `agents.list()`：所有活 agent，按登记次序 | rules（行启用时对宿主上已有的每个会话做一次与 `agent/created` 相同的接手，§16.13） | agent:614–616 | 一致 |
| 活 agent 的 `status`（`idle` 或 `running`）与 `steer(message)`、`inject(message)`、`followup(message)` | rules（等待单解除时的唤醒：`running` 用 `steer`，空闲且 goal 在 active 阶段用 `inject`，其余用 `followup`；三个方法都包在 try 里，抛错是唤醒发不出） | agent-loop:790–821 | 一致；L3 `rules-queue` 与 `rules-handover`：唤醒发出时 agent 正在跑一步，消息在它的下一步请求里（`steer`）；`followup` 与 `inject` 只有假宿主的测试，没有场景走到 |
| `goals.get(agent)` 的 `id`、`revision`、`phase`；对不是活实例的 agent 抛 `GoalError` | rules（唤醒时判空闲的 agent 有没有 active 的 goal；不做档开单与结束时对照暂停的那个 goal；服务不在或抛错按没有 goal） | goal:611–614、880–888 | 一致 |
| `goals.pause(agent, {id, revision})`、`goals.resume(agent, {id, revision})`：返回新的视图，修订号加一；修订号或 `id` 对不上抛 `GOAL_STALE_REVISION`，阶段不对抛 `GOAL_INVALID_TRANSITION`，轮次用完不能 `resume` | rules（不做档：GLM 子 agent 的单开时在它自己的工具调用里暂停 active 的 goal，单结束、人放行、重启接手、行卸载时恢复；只动会话头 `origin: 'subagent'` 的 agent 的 goal，且恢复前核对 `id`、修订号与 `paused`；`src/rules/goal.ts`） | goal:671–699、760–765、174；goal-round-driver:44–47、246 | 一致；L3 `rules-peak-stop` 回答 V12、V3，`rules-peak-stop-exit` 回答 V13（`ORCHESTRATION.md` §16.13） |
| `subagents.interrupt(targetSessionId, {kind: 'user', parentSessionId})`：取消一个活的直接子 agent 当前的回合，保留它的收件箱；不在驻留表里时是无操作；别的父会话的子 agent 抛 `UNAUTHORIZED` | graph-panel（暂停、重做） | subagent:3105、subagent:1258–1277 | 一致；L3 场景只停主 Agent，停子 agent 待 L4 |
| `attachments.readImageRequest(ref, target, signal?)`、`attachments.imageHostPath(ref)` | glm-llm（读图） | attachment:290、attachment:338（抽象），attachment-local:1038、attachment-local:1053；编译期检查 `AttachmentsContractCheck` 对照官方 `AttachmentStore` | 一致 |
| `agents.get(id).session.header` 的 `parentSession`、`origin` | glm-llm（请求归因：委派子会话标 `subagent`，沿父会话的 trace id，§4.5b）；memory、lessons（根 agent 与委派子 agent 的区分） | agent:596；session:1051–1053（`parentSession` 为字符串、`origin` 只能是 `"subagent"`）；subagent:346–355（`childSessionMeta` 写 `parentSession: parentHeader.id`、`origin: "subagent"`） | 一致：用户分叉的会话只有 `parentSession`，按主会话处理 |
| `fs.processPathFromHostPath(hostPath)` | glm-llm（卸载图片的占位路径） | fs:95、fs-local:792–795；pi-ai 同一用法 llm-pi-ai:2908–2909 | 一致 |
| `workspaceChanges.summary(sessionId, seq)`：`{turn, cwd, files[{path, display, …}], total, …}`，`path` 在会话目录内为相对路径、目录外为绝对路径；只记录有工作目录的顶层会话 | guard（影子兜底，`ctx.get` 读，不需要 inject） | workspace-changes:1019–1022、workspace-changes:871–885、workspace-changes:958–961；包说明 README（非 git 目录只列文件工具的改动） | 一致；该包只在 `dsh-web-app` 的 patch 里（web-app `cordis.patch.yml`:357），桌面版组合有，沙盒模板没有，探针在影子场景经覆盖层挂载 |

对象与消息：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| agent：`id`（与会话共用）、`ctx`（作用域上下文）、`session` | glm-prompt、guard、工具检索 | agent-loop:748–781 | 类型偏差已修：结构类型里的 `model` 成员在 rc.3 不存在，删除 |
| 活 agent（命令调用与 `agents.get` 给出的）：`status`（`idle` / `running`）；`followup` 排到下一回合并唤醒空闲的 agent，`inject` 排到下一步、不唤醒；取消之后到来的唤醒型投递改进下一回合并锁存唤醒；`cancel(cause, {keepInbox: true})` 中止正在跑的回合、保留收件箱，与停止按钮相同；`ctx` 是 agent 作用域上下文（适配层 `LiveAgentLike.ctx`，可选，只为测试 agent 可以不带） | graph-panel（`/graph-run`）；步前待送（`src/shared/step-mailbox.ts`：在 `ctx` 上装监听器，`ctx` 不可用时退回 `inject`） | agent-loop:790–791、agent-loop:800–821；api-session-controller:1065 | 一致；L3 场景 `glm-graph-run` 核对开始与暂停（未跑） |
| session：`id`（取自 `header.id`）、`header{id, createdAt, cwd?, parentSession?, isSeeded}`、`deriveMessages()` | guard（`header.cwd` 作包含根）、工具检索、todo 提醒 | session:1344–1346、session:1820–1826、session:1672–1686 | 一致 |
| session：`requestHeader()`，日志里 `request/header` 事件的折叠，`config` 为该步准备好的调用配置（含 `provider`、`model`）；第一次请求之前为 undefined | guard（工具调用的路由，`src/shared/route.ts` `sessionRoute`） | session:1612、session:637（`foldRequestHeader`）、`canonicalHeader`；agent 循环每步调用模型之前写入，变化时才写，agent-loop:1218–1240 | 一致（2026-10-28 核对；L3 探针的 GLM 拦截与非 GLM 放行经它判路由） |
| `workingDirectory.get(session)`：会话的当前工作目录，无 I/O；没有记录时取部署默认目录 | guard（相对路径的解析基准，`ctx.get` 读） | working-directory:76–78；文件工具按 `ensure(agent)` 的结果解析相对路径，tool-fs:172、fs-local `localDisplayPath`（win32 上为 `resolve(cwd, path)`） | 一致 |
| 派生消息：助手消息 `source{kind: 'model', provider, model}`，工具调用为 `tool-call` 块；工具结果带 `toolCallId`、`isError` | todo 提醒、工具检索 | llm:66–78（`createAssistantMessage`），session:862–868、session:1217–1218 | 一致 |
| 合成 notice 与 `createUserMessage` 同形（`id`、`role: 'user'`、冻结） | 工具检索公告、todo 提醒、每步投影、记忆索引、运行控制的消息（开始与重做经 `followup` 进收件箱，暂停说明经步前待送放进主 Agent 的下一步，来源 `glm-graph-run`） | llm:37–66 | 一致 |
| 压缩检查点：替换被摘要区间的用户消息，`source{kind: 'compact-checkpoint', compactionId, sourceCommandId?}` | 每步投影（重锚） | compaction:109、compaction:116–122；compaction-basic:595–598 | 一致 |
| 目标轮消息：`agent.followup` 投递的用户消息，`source{kind: 'goal', goalId, revision, round}`，下一步作为认领的消息进入 `agent/pre-step` | 每步投影（每拍） | goal-round-driver:144–151、164 | 一致 |

工具名：

| 名字 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| 别名覆盖的原生工具 `read`、`write`、`edit`、`read_image`、`glob`、`grep`、`pwsh`、`todo_write` | glm-prompt | tool-fs:251、549、690、986；tool-fs-search:782、1090；tool-pwsh:466；tool-todo:96 | 一致 |
| shell 工具与命令文本字段：`pwsh` 与 `bash` 读 `command`，`terminal_send` 读 `text`（终端后端可以是 bash 或 pwsh，`terminal-bash` 的 `shellDialect`） | guard（file-tools-only）、graph（图文件门禁经 `shellCommandOf` 取同一字段） | tool-pwsh:466、474；tool-bash:493、501；tool-terminal:320、328；terminal-bash:28、39 | **偏差已修（2026-10-28，M1.8）**：guard 对 `terminal_send` 读 `command`，rc.3 没有这个参数，终端输入从未被检查；改读 `text`，两种方言都判 |
| 主 Agent 的工具面：去掉原生名为 `write`、`edit` 的工具（`Write`、`Edit` 经方言服务或静态别名表换算）与原生名为 `ask_user_question` 的工具（工具检索常驻表里的 ZCode 名 `AskUserQuestion` 同样，方言以后给它加别名时自动覆盖）；`str_replace_editor` 的参数 `command` 的取值收窄成只剩 `view`，形状不认识（没有 `properties.command.enum` 数组）时整个去掉并报行健康。rc.3 的预设与 headless 组合里没有 `str_replace_editor`，这一支只为装了它的组合；`ask_user_question` 在标准预设里由 `dsh-tool-ask-user` 注册，headless 模板没有，L3 探针经覆盖层挂上它才看得到被去掉 | design（`src/design/role-face.ts`） | tool-fs:549、690；str-replace-editor:267；web-app 预设 `tool-ask-user`；`src/toolsearch/exposure.ts`:39 | 一致；去掉工具面上的工具不是边界（rc.3 按名执行，§2.4a），拦截是 guard 的 `main-agent-no-write` 与 `main-agent-ask`（M3 第 4 步，`ORCHESTRATION.md` §6.7） |
| 文件工具与目标字段：`write`、`edit` 读 `file_path`，`str_replace_editor` 读 `path` | guard（影子兜底记本回合的目标）、graph（图文件门禁判断目标是否在图目录里） | tool-fs:549–555、690；str-replace-editor:267、281 | 一致 |
| 派遣工具 `spawn_teammate`、`send_message`、`team_task_create`、`team_task_update`、`subagent`、`subagent_fork` | workflow | experimental-tool-agent-team:251、293、365、457；tool-subagent-control:23；tool-subagent:313（`toolName` 默认 `subagent`），base 的 `cordis.patch.yml`:384、395（`subagent`、`subagent_fork` 两行） | **偏差已修**：`subagent_fork` 不在名单里，fork 派遣从未记录。L3 探针实测运行时工具面同时有 `subagent` 与 `subagent_fork` |
| compaction-basic 的指令开头、`purpose: 'compaction'`、经 `ctx.llm.stream()` 摘要 | glm-compact | compaction-basic:244、320、323 | 一致 |

派发与驱动循环〔实测 2026-10-28，L3 派发可行性验证；`ORCHESTRATION.md` §2.1、§3.2；E2 起类型进 `src/shared/dsh-min.ts`〕：M7 后台派发与 goal 驱动要用的接口。探针覆盖层里的验证插件 `scripts/probe/probe-dispatch.mjs` 用过前几行，它不属于 bundle，也不是产品功能；证据列的「探针」指 `npm run probe` 的场景。

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `subagents.startActivation({provider, label, childId?, request{prompt, parent, cwd?, agentOptions?, outputSchema?, maxDepth?}, signal, delivery})` 返回 `{childId, messageId?, result, dispose}`；子 agent 被接受时即返回 | 验证插件（M7 派发工具的计划用法） | subagent:3036–3048、1391–1477；`agentOptions` 合并在父 agent 的路由之上，subagent:315；深度只在传了 `maxDepth` 时检查，subagent:279–283 | 成立（探针 `glm-dispatch`）：宿主层插件 inject `subagents` 即可调用；派发工具当场返回，主 Agent 继续走步 |
| 结构化交回：`outputSchema` 启动前按对象 schema 校验，子 agent 得到 `structured_output` 工具，提交后回合结束；完成通知带 `Structured result: <JSON>`，`result` 带 `structured` 与 `stopReason` | 同上 | subagent:3046、873、889–960、526 | 成立；GLM 路由上 `structured_output` 是延迟工具，经 DeferredToolCall 提交同样被捕获 |
| 子 agent 的会话头：`cwd` 取父会话头，另带 `parentSession`、`origin: 'subagent'`、`delegationDepth`；请求里的 `cwd` 只成为工作目录 | guard（包含根读会话头 `cwd`）；M7 写入范围 | subagent:346–355、1415 | 实测如此：子 agent 的 `header.cwd` 是父目录，guard 对子 agent 的包含根因而是父工作区；写入范围不能拿会话头判定 |
| `tools/pre-execute` 里子 agent 的调用：`exec.agent` 是子 agent，`exec.agent.id` 等于预留的 `childId` | 验证插件（写入范围门禁） | tools:3229–3260；agent id 必须等于会话 id，agent:514 | 成立：每次调用都能映射回任务，拒绝以工具错误回到子 agent |
| `goals.create(agent, {objective, maxGoalRounds?})`、`goals.get(agent)`（视图带 `id`、`revision`、`phase`、`roundsStarted`、`maxGoalRounds`、`activation`）；`goal/changed` 事件 `{agent, change{operation}}` | 验证插件（驱动循环） | goal:611、635、877；goal-round-driver:243 | 成立（探针 `glm-goal`）：插件建的 goal 由驱动器照常推进 |
| `agents.create({sessionId, meta{cwd}, agentOptions})` 返回带 `agent` 的句柄；`agents.withoutInitiator(op)`；`agents.roots()` | 验证插件 | agent:453、414、623；agent-loop:1893 | 成立：不传 `parentAgent` 时新 agent 是根 agent |
| goal-round-driver 的 `agent/pre-step` 预约校验（下游监听器前后各一次）与收件箱竞争判定 | glm-prompt 的步 notice（目标轮上同样追加）；M2.3 的投影注入 | goal-round-driver:249、286–350 | 成立：`next()` 之后追加到决策 `messages` 的 notice 不破坏预约，下一轮照常开始；经收件箱投递会被判为竞争输入 |
| `update_goal` 的完成授权（直接人类输入或当前目标轮）与收尾消息 `<goal_complete>` | 验证插件（完成门禁） | tool-goal:27、54、72、365 | 成立：经 DeferredToolCall 调用时 `tools/pre-execute` 看到的是 `update_goal`，可以拒绝 `complete` |
| headless 运行器的退出条件：agent 空闲、`waitForChildren` 为假、会话序号不变 | 探针、标定运行器 | headless:349–351 | 实测：第一次静止空闲就退出，任务回合里建的 goal 一轮都跑不到（探针 `goal-headless`） |

E2 批次（2026-11-04）把执行行要用的其余成员按 rc.3 的发布类型补进 `src/shared/dsh-min.ts`；行从 E4 起才调用，效果未核实：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `goals.edit(agent, ref, {objective?, maxGoalRounds?})`、`goals.complete(agent, ref)`、`goals.block(agent, ref, {code, message})`、`goals.clear(agent)`：引用是 `{goalId, revision}`，经 `expectCurrent` 对不上抛 `GOAL_STALE_REVISION`（goal:760–765）；`edit` 改目标或轮次上限（goal:657–669），`complete` 收尾（goal:706–712），`block` 以小写连字符原因码与消息停住（goal:720–729），`clear` 删除（goal:736–753）；`create` 在有未完成的 goal 时抛 `GOAL_ALREADY_EXISTS`（goal:635–650） | M7 自动推进（E8，`src/execute/drive.ts`：`create` 开始推进，`block` 以 `hourness-waiting-human`、`hourness-idle-rounds`、`hourness-peak-wait`、`hourness-design-wait` 停住，`resume` 恢复，`clear` 在移会话时清旧 goal；`complete` 由模型经 `update_goal` 调，完成门禁在它之前；`edit` 没有调用方） | goal:635–753、767–769 | 〔实读〕；L2 `tests/execute-drive.spec.ts`、`execute-peak.spec.ts` 对着按 rc.3 行为写的假 goal 服务；L3 `glm-exec-drive`（2026-11-05）：`create`、`block`（含 `hourness-waiting-human`、`hourness-idle-rounds`）与 `resume` 在 rc.3 上成立，`glm-exec-modules`：`goals.block` 收下 `hourness-design-wait`、再放行后 `resume` 成功（U30） |
| `subagents.resolveMaxDepth(configured?)`：传了预算就按子 agent 的剩余深度裁，没传按宿主缺省（3023–3030），worker 由此不再派活 | M7 派发门禁（E4） | subagent:3023–3030 | 〔实读〕 |
| `subagents.registerProvider(provider)`：装外部后端（`SubagentProvider`：`name`、`capabilities`、`inheritsParentContext`、`start(request)`），返回的 disposer 注销——新的启动被拒、在跑的活着；capabilities 全假与 `inheritsParentContext: false` 时外部激活被 `NO_START_CAPABILITIES` 挡住 | M7 的检查后端 `hourness-gate`（E7，`src/execute/gate-provider.ts`：capabilities 全假、`inheritsParentContext: false`，`check_commit` 起的请求不带 `agentOptions` 与 `outputSchema`，`delivery: 'caller'`）；以后 M7 的本地执行器（E8） | subagent:3256–3267、2789–2794 | 〔实读〕；L3 `glm-exec-merge`（2026-11-04）：rc.3 收下注册，`check_commit` 经 `startActivation` 起的外部激活跑完检查，行健康里没有「检查以同步方式运行」，通过的通知送到主 Agent（U2 成立） |
| `subagents.waitForChildren(parent)`：等这个父会话全部还在推进的后代交回，真表示等到了活、宿主要重查父的空闲状态 | M7 的驱动循环与收尾：行自己不调用，驱动器在每个目标轮之前等它（goal-round-driver:132），所以派出的 worker 还在跑时下一轮不开始，空转计数也就不在 worker 跑着时走（E8） | subagent:1296–1330 | 〔实读〕；L3 `glm-exec-drive`：worker 交回之前没有新的目标轮 |
| `subagents.sendMessage(sender, targetId, content, {signal})`：给发送者的直接父或直接可续子 agent 投一句话；空闲的子 agent 起一个回合，不在的从持久层冷恢复（2141–2189），但没有它的 `outputSchema`——所以 M7 在工具层拒绝已交回的 worker 号（§3.2.5） | M7 的主 Agent ↔ worker 对话（`answer_worker` 的执行体，E4） | subagent:1538–1550、2119–2135、2141–2189 | 〔实读〕 |
| `subagents.listChildren(parentSessionId, signal?)`：不加载任何人地读持久的直接子 agent 目录（`SubagentCatalogEntry`） | M7 重启对账（E7 的存活图） | subagent:2339–2352 | 〔实读〕 |
| `llm.listModels(provider)`：某 provider 去重后的目录 `{id, name?}`，运行时不把它绑定到路由——是核对不是门禁（§3.1.3），provider 没注册时抛错；`llm.resolveModelInfo(provider, model)`：补该模型的 `reasoning.efforts`（有才有），每项是 `{id, name, description?}`，`reasoningEffort` 取的是 `id`（dsh-llm types.d.ts `LlmModelReasoningInfo`；编译期检查 `LlmCatalogContractCheck`）；读得到而没有 `reasoning` 的模型不收任何档位（rc.3 在第一次调用时拒，`UNSUPPORTED_REASONING_EFFORT`） | M7 的模型选择（E4 的 `checkModelChoice`，派发按 `id` 比对、提示列出 `id`） | llm:1816、2080–2101、2111–2116 | 〔实读〕；2026-11-07 更正：原把 `efforts` 记成字符串列表，派发拿记录去比字符串，任何档位都被拒、提示印成 `[object Object]`（M7 第三次真实运行） |
| `sessionQuery.observeSession(sessionId, {signal?})`：存着的会话的一致切面（`projections.values`），丢失派发的交回投影从它折叠（§3.9.6） | M7 重启对账（E8，`src/execute/drive.ts` 的 `execute.reconcile`：读丢失派发的会话的 `hournessHandback`；rc.3 的 `observeSession` 是 async，找不到会话时 reject `SESSION_QUERY_SESSION_NOT_FOUND`，按读不到处理） | dsh-session-query `observeSession`，经 subagent:2339–2352 的读法 | 〔实读〕；L2 `tests/execute-reconcile.spec.ts`（假的 `sessionQuery`）；从行里调用的效果未核实（L4） |
| `sessionProjections.register(definition)`：会话投影 `hournessHandback`（键 `hournessHandback`，折叠最后一次结果不是错误的 `structured_output` 调用的参数，同 `hournessTalk` 的做法） | M7 重启对账（E8，`src/execute/handback.ts` 的 `handbackProjection`，`index.ts` 经 `ctx.inject(['sessionProjections'])` 注册） | 同上面 `sessionProjections` 一行 | L2 `tests/execute-reconcile.spec.ts`；L3 只验到注册（场景里没有重启） |
| `goal/changed`（`{agent, change{operation, ref, goal?}}`，经 `agentEvents` 发，宿主层 `ctx.on` 收得到） | M7 自动推进（E8：`pause` 记进 `drive.jsonl`，`complete` 与完成门禁的凭据按 `ref.id` 配对，模型的 `block` 与 `round-limit` 批注到图上） | goal:872–877；goal-round-driver:243 | L3 `glm-exec-drive`：`create`、`block`、`resume`、`pause`、`complete` 都收到，`ref.id` 与 `goals.get` 的 `id` 相同（U15） |
| `glmHournessLoops.contribute(source, contribution)`、`emit({event, cwd, session?, key, payload})`；`glmHournessExecute.runAction(action, record)` 作循环板的 `run` | M7 循环板接缝（E8，`src/execute/loop-link.ts`） | 本包 `src/loops/service.ts`、`registry.ts`（不是 DSH 的接口） | L2 `tests/execute-loop-link.spec.ts` 对着真实的 `validateContribution` 与 `createRegistry`：两张表全部收下；L3 `glm-exec-drive` 与 `glm-exec-modules` 关掉循环板行，放行的条目由 M7 的退路执行 |

### 2.5 行健康〔已实现 2026-10-28，`ROADMAP.md` M1.5〕

原问题：真实会话里「哪几行在起作用」无法回答，降级只在控制台打一行警告。现在每行自报状态：激活时报一次，此后每次在某个会话里起作用时报该会话的状态，第一次与状态变化时记下。`/glm-status` 在凭证状态之后列出调用会话的行健康表；`/hourness-status` 只列这张表。

机制（`src/shared/health.ts`）：

- 每行激活时经 `ctx.provide` 提供自己的只读视图，服务名 `glmHournessHealth/<行>`。视图含激活状态和按会话的最近一次报告，每行保留最近 64 个会话。
- `/glm-status` 与 `/hourness-status` 经 `ctx.get` 逐行读视图，取不到的行显示「未加载」（行未启用，或激活没有完成）。读写双方不依赖加载顺序，也不依赖共享的模块实例；行卸载时视图随 fiber 撤销。行健康不经数据目录行，`data` 行未启用时其他行照样上报。
- 会话以 agent id 为键（rc.3 的 agent 与会话共用 id）：组装与工具调用取调用方 agent，`llm/stream` 一侧取请求的 `sessionId`，命令取调用参数里的 `agent`（commands:379–385）。没有会话 id 的报告丢弃。
- 报告只在主机进程内存里，不写文件，不进模型可见的对话；桌面版重启后清空。
- 持续的问题（`RowHealth.note`，m4-gate 起）按会话与键附在这个会话的报告之后，之后的报告不冲掉，撤回才去掉；附着的说明把状态升到至少部分生效，标为不降级的只加文字（env 行检查的超时，M4 设计 §6.3.1）。每个会话至多 4 条，每条至多 80 个码点。

状态分生效、部分生效、未生效三种；表里另有「已加载，本会话未触发」与「未加载」。激活时就未生效的行（例如数据目录服务提供失败）不看会话报告，直接显示激活原因；`glm-login`、`data` 与 `graph-panel` 不按会话起作用，只显示激活状态（`graph-panel` 的激活状态在现场投影注册完成或失败时更新一次，`RowHealth.reactivate`）。`graph` 行在每次图工具调用与每次读图做投影之后报告本会话：图目录、节点数、校验错误、焦点是否设了〔2026-10-28，`src/graph/row-health.ts`〕。

| 行 | 何时上报 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- | --- |
| glm-llm | 激活；每次请求 | 已注册路由，写明套餐、凭证目录与上下文窗口；上游已应答（设备 ID 未能写入 ZCode 状态文件时注明本进程用临时 ID，状态不降级） | 未登录（凭证为空）；凭证不可读；未拿到项目令牌（写明 3.16.3 的原因，§4.1）；上游返回非 2xx 状态码；上下文窗口配置不是 128000 到 1000000 之间的整数（部分生效，按缺省 512000，激活与每次会话上报都带这句，§4.6） |
| glm-login | 激活 | 三个命令已注册，计价服务已提供 | 计价服务未提供（部分生效，写明原因，例如同名服务已在；面板按 token 列）。凭证目录总能解析（§2.4） |
| glm-prompt | 激活；每步组装 | GLM 路由，ZCode 提示词与工具面，工具检索 local 或关闭 | 非 GLM 路由；工具检索未安装（会话历史不可读，部分生效）；记忆服务给出的汇报细度用不了（形状不对、抛错、不认识的档，部分生效）；方言安装失败 |
| glm-compact | 激活；每次压缩请求 | GLM 压缩请求改用 ZCode 指令与摘要格式 | 非 GLM 路由；未识别 compaction-basic 的指令（原样放行） |
| data | 激活 | 用户级目录与项目目录都已解析 | 项目目录未配置（部分生效）；服务提供失败 |
| guard | 激活；每次根调用 | 门禁生效（所有路由，`ORCHESTRATION.md` §6.2），写明圈禁根、违规目录与影子兜底是否可用 | 会话没有工作目录（圈禁规则跳过）；无项目目录（违规不落盘）；方言服务不可用（工具名按静态别名表换算，纠偏用原生名）。组合里没有 workspace-changes 时说明写「影子兜底未启用」，状态不降级：影子兜底只记录，门禁本身不受影响 |
| memory | 激活；根 agent 的每一步；命令或投影服务到来与离开时（激活状态） | 本会话的项目目录与用户级目录、两边的偏好与事实条数、本会话是否已带索引；用量记入用户级目录 | 数据目录行未启用（用户级记忆不可用，用量不记录）；会话没有工作目录，或不算项目（用户主目录、盘符根、不在 git 仓库里又没有 `.llm`）；流水有读不出的行或超过 8 MiB；旧 `memory.json` 读不出或还没迁移；写入时 `.llm/` 加不进 `.git/info/exclude`、写失败、锁被判陈旧过；索引提醒出错或有一份记忆读不出（索引不全）；学习摘要读不全（项目图读不出，或经验、记忆流水读不出，`learning_signals` 的 `notes` 同说）、提醒没能记下（这一步不发，一小时内不再试）、提醒出错；取不到主 Agent 的判断而改发所有根 agent（没有图行、没有持有者记录，说明只在这个判断真的决定了谁收到提醒时写），或持有者记录指向本会话但模式已关；会话里人的消息读不出（习惯问话与偏好的原话核对不可用，`memory_habit` 得 `unavailable`、偏好照存但标「原话未核对」）；规则 `habit-ask-first` 没装上（宿主没有 `tools/pre-execute`，或安装抛错）；`commands` 或 `sessionProjections` 服务没到（命令、投影没注册）；`glmHournessMemory` 没提供上。行配置 `home` 只在说明里写「已不再使用」，状态不因它降级。记忆工具注册失败时未生效 |
| lessons | 激活；主 Agent 的每一步；有会话没有项目时；失败匹配读不出经验或出错时；命令或投影服务到来与离开时（激活状态） | 本会话的项目目录、生效经验与候选的条数；候选被拒的条数与代码 | 会话没有工作目录，或不算项目；流水有读不出的行或超过 8 MiB；`.llm/` 加不进 `.git/info/exclude`、写失败、锁被判陈旧过；读不出项目图上的候选经验；候选没能记为过期；复发提醒没能记下（这一步不发）；失败匹配读不出经验或出错（调用的结果原样）；命中没能记下（提醒照给）；取不到 M3 的主 Agent 判断（没有图行、没有持有者记录、记录指向本会话但模式已关；设计行不在时所有根 agent 都按主 Agent 处理）；`commands` 或 `sessionProjections` 服务没到；`glmHournessLessons` 没提供上。工具注册失败时未生效 |
| workflow | 激活；每次根调用 | 派遣决策记入项目目录 | 无项目目录 |
| hourness | 激活；每次 `/hourness` | 两个目录都可读；说明另写「积分口径：已提供」或「积分口径：未提供，按 token 列」，再写「额度：已提供」或「额度：未提供」（服务有没有可用的 `quota` 成员），状态不因计价服务缺席降级 | 缺项目目录或用户级目录 |
| rules | 激活；每个会话创建时；每次 `/rules` | 命令、工具与服务就绪；本会话所在项目的档位与来源、此刻是不是高峰、你设的规则条数；读不出是不是高峰（没有计价服务，或 `peak` 出错）时写原因，状态不降级 | `/rules` 或 `rules_show` 没注册上、`glmHournessPeakMode` 或 `glmHournessRules` 没提供上、会话事件没注册上；会话没有工作目录或不在项目里；门读状态失败或判定出错（这一次调用放行，下一次能读的调用换回正常）；存档与变更记录对不上或有没生效的记录（没生效的记录写出 `/rules recovery <编号> 照改 或 忽略`；存档被改过、流水被截短每个会话都报，消息末尾写出路：删掉项目的 `.llm/rules/`，`ORCHESTRATION.md` §16.5）；仓库里的规则文件读不出或被规则板以外改过；读状态失败；等待单没记下、改不了，宿主没有 `agents` 服务或读它抛错，唤醒发不出，等待单因本宿主心跳超时被过期（只那一次的上报，`ORCHESTRATION.md` §16.12）；不做档的 goal 没暂停成（报在被挡的子 agent 的会话上：「高峰不做：goal 没暂停（原因），每一轮仍会花一步」）、没恢复成（「高峰不做：goal 没能恢复（原因），要在目标条上或用 /goal resume 恢复」），接手单失败（`ORCHESTRATION.md` §16.13）。`config.dir` 不是路径、工具调用的门装不上时未生效 |
| design | 激活；主 Agent 会话的每次组装；会话失去主 Agent 之后的第一次组装；让别的会话退出主 Agent 失败时；每次 `/wish` 里发现问题时 | 命令与会话状态服务就绪（激活）；主 Agent 会话：身份节已加上，写文件的工具与 `ask_user_question` 已从工具面去掉 | 会话状态服务没到（`主 Agent 模式要会话状态服务（sessionProjections）`，`/wish` 拒绝开启，到了之后自动转为生效）、状态注册失败、宿主没有 `inject`；`/wish` 注册失败（未生效，本行什么都不做）；本会话读不到主 Agent 的状态（会话状态读不出，或找持有者记录所靠的服务出错：这一步当作普通会话，告警一次；会话创建时同样读不了，则说没能检查这个会话是不是还是主 Agent，创建照常完成）；持有者记录读不到或没有（按会话状态判，说明写「在主 Agent 会话里再发一次 /wish」）；`/wish` 在生效前被取消；指向没生效的 `/wish` 的持有者记录删不掉（说明写「在这个会话里发一次 /wish off」）；`str_replace_editor` 的参数形状不认识；没能让别的会话退出主 Agent；人设超过 4,000 字符或设置读不懂（没有加人设，主 Agent 会话的说明里也有这一句）。会话不再是主 Agent 之后报未生效（「这个会话现在不是主 Agent：用 /wish 开启」）；从没当过主 Agent 的会话不上报。一步里的几个问题合成一条降级说明，不会被同一步的「生效」盖掉 |
| loops | 只在激活时报（循环板属于项目，不属于某个会话）；每交来一份有问题的东西时更新；每次对账一个项目的文件之后更新；每一拍之后更新 | 循环行自己的条目已登记，服务 `glmHournessLoops` 已就绪（有会话控制器时），`/loops` 已注册，`loops:files-only` 与 `loops:schedule-tools` 已装上，会话投影 `hournessLoops` 已注册 | 宿主没有 `provide`（未生效，写原因）；没有会话控制器时写一行「这个进程不跑循环板（没有会话控制器）」，不降级（headless、探针、标定本来如此）；服务提供不上（第二个实例，写原因）；别的行交来的整份被拒（来源写法不对、名字空间被占或不该用）；交来的条目、事件、动作有几项不合被丢掉，写「<包> 的 <行> 交来的 <id> 读不懂：<字段路径与原因>」；条目的说法里有没学过的词（照样收下，写「<id> 的说法里有 <词>」）；宿主没有 `commands` 或注册失败（没有 `/loops`）；宿主没有 `on` 或装门失败（写「没有什么拦着别人写循环板的文件」）；`sessionProjections` 还没来或注册失败（页面找不到板）；某个项目的文件读不出、条目文件在循环板之外被改过、读不出、变更记录中间坏了行（各写一句，带项目名；人打 `/loops ack` 之后不再写）、`view.json` 写不进。每一条只说一次。运行时（§18.9）：收件箱写不进（三次重试之后）、收件箱读不出、一拍里出错、一个 harness 动作 `failed`、同一个去重键 24 小时内第 4 次、插件的条目被限次、没能把一项交给主 Agent（各写一句）。绑定与投递（§18.10）：读不出主 Agent 的记录、读不到归档状态、主 Agent 的会话在另一个 DSH 窗口里连着超过 5 分钟、没能记下要删的 DSH 提醒（于是不删）、到点提醒建不上或改不回来、读不出 DSH 的任务清单、三次重试都没能把一条消息交给主 Agent（各写一句）。没有主 Agent（没有记录、会话已归档、会话找不到）、消息存着、提醒等着对账、`removed-tasks.jsonl` 里的删除记录都不算降级，页面写明。条目在等一个没人声明的事件、文件欠着一次写、条目不在这份检出里、没有批准记录的 `unadopted`、被限次攒着的事件、去重键满了、脚本与检查的条目 `refused` 都不算降级，页面写明 |
| metrics | 激活；每次模型调用与每个会话事件所在的会话；后台自查完成时（`ORCHESTRATION.md` §10.6） | 「指标记入 <root>/.llm/metrics，今天 N 条；上次自查干净（或还没跑）」，说明另写「积分口径：未提供」与「自查条目已交给循环板」（循环板不在时写「循环板不在，每天一次的自查条目没有交，后台自查照跑」，不降级）；宿主没有 `sessionProjections` 服务时说明里写「指标板没有登记：等 sessionProjections 服务」，部分生效（指标设计 §9.1，`view.json` 照算照写） | 写入失败（错误码、排队、丢几条）；拒收 N 条；内部错误 N 次；无项目的事件 N 条（按种类，至多 8 种）；服务未提供；某个接缝没装上（逐接缝跳过，写名字）；没有 agents 服务（模型调用与问人的事件只计数）；自查有发现（没有正常退出、缺行、链断、文件丢失、读不出的行） |

UI 包的行运行在客户端，不在表内。

按包分组〔2026-10-29，split 第 4 步〕：`src/shared/health.ts` 的 `GLM_ROWS`（`glm-llm`、`glm-login`、`glm-prompt`、`glm-compact`）与 `HOURNESS_ROWS`（`data`、`guard`、`memory`、`lessons`、`workflow`、`hourness`、`graph`、`graph-panel`、`rules`、`design`、`loops`、`metrics`、`env`）由 `HEALTH_PACKAGES` 配上包名 `dsh-glm-zcode`、`dsh-hourness`；`HEALTH_ROWS` 是两组相接，顺序同 patch。`HEALTH_PACKAGES` 是 `scripts/packages.mjs` 在运行时的一份拷贝（`src/` 不导入脚本）；包名与行在 split 第 5 步写进目录表，从那时起由 preflight 核对两者一致。表的列是「包 | 行 | 状态 | 说明」；一个包的行全部「未加载」时，这个包只占一行：行写「全部」，说明写「包未安装，或它的行全部禁用」。

`/hourness-status`〔2026-10-29，split 第 4 步〕：由 `glm-hourness/hourness` 行注册（`definitionId` 为 `dsh-glm-hourness/hourness-status`，描述「查看两个包各行的健康」），输出与 `/glm-status` 凭证行之后完全相同的表，没有凭证行，所以只装编排层包时也能看行健康。输入去掉首尾空白后必须为空，否则返回「用法：/hourness-status（无需参数）」，写法同 `/hourness`。读表不算该行在会话里起作用，`hourness` 行不为它上报。`hourness` 行的激活说明是「/hourness、/hourness-status 已注册」。

`/glm-status` 的第一行仍是凭证状态（输入框下的 GLM 按钮按它解析登录状态），空一行后是 Markdown 表。按钮在整段文字里先找「已登录（套餐 …）」，找不到再找「未登录」，所以表里不得出现「已登录（套餐」，分组带来的文字（包名、「全部」、合并行的说明、表头）也不含「未登录」；`tests/health.spec.ts` 钉住这两条。GLM 按钮的对话框把表按行列出：行名与状态一行（生效绿、部分生效黄、未生效红），说明在下一行；包的合并行以包名显示。对话里的命令卡片仍原样显示 Markdown，卡片视图属于 M8。L3 探针按四列解析，并核对每行的包与 `HEALTH_PACKAGES` 一致、`/hourness-status` 与 `/glm-status` 的表相同〔2026-10-29，`m8-ui-audit` F-04；split 第 4 步加「包」列〕。按钮读这段文字的函数在 `ui/src/channel-model.ts`（凭证行、上次登录错误、表，以及两者以外剩下的行），与界面代码分开，好让 L2 用真实输出测它〔`m8-ui-audit` R-03〕。

GLM 按钮〔2026-10-29，`m8-ui-audit` F-02、F-03、F-18、F-34〕：每次执行命令都会在接收会话里记一条命令流、显示一张命令卡片，所以按钮只在点击时执行命令；唯一的例外是本次启动后第一次打开对话框、任何一个按钮都还没读过状态时读一次。读到的状态在所有输入框的按钮之间共用，并写明读取时间（「读取于 HH:MM」）。登录后不再每 5 秒轮询（原先最多 12 次，且只轮询 60 秒，而授权链接 5 分钟有效），对话框提示「授权完成后点「刷新状态」」。状态读不出时写「未知」与原因（glm-login 行没有加载、查询失败、返回内容读不懂）；凭证不完整时写出原因；浏览器授权失败或链接过期后，下一次读到的状态多一行「上次登录错误」，红色，写引擎给的错误；回复里既不是字段、也不是健康表的行（例如读不懂的凭证行）显示在健康列表上方，不丢〔`m8-ui-audit` R-01〕；套餐在读到之前写「—」；「登出」要在 4 秒内再点一次「再点一次确认登出」。对话框经 portal 挂到页面根上，用 ui-primitives 的 `useAnchoredPosition` 按实测宽高放在按钮上方并夹在视口内，外部按下用 `useDismissOnOutsidePointer` 关闭（与 DSH 自己的统计对话框相同）；打开时焦点进对话框，Esc 关闭并把焦点还给按钮。按钮文字「GLM」不再被挤成「G」。

设置页〔2026-10-29，`m8-ui-audit` F-33、V-03、F-05〕：导航与标题用插件管理器里的名字 GLM-Hourness；字号随 DSH 的设置页（标题 18px/600，条目名 14/20，说明 12/18），值在条目名下方左对齐，只有路径用等宽字体；登录与状态指向输入框下方的 GLM 按钮，命令列在后面；复制按钮用 ui-primitives 的 `Button` 与 `writeClipboard`，复制失败时写出来；模型选择按选择器里的叫法写「GLM（ZCode 原生通道）」下的 GLM-5.3 或 GLM-5.3-Flash（与 `zcode.ts` 的组名同一个字符串）。设置页没有会话，命令要在会话里执行，所以设置页不显示实时状态。设置导航的图标由设置壳按分区 id 选（`dsh-client-ui-settings-general` 的 `navIcon`），第三方分区带不了自己的图标。

验证：L2 覆盖每行的上报与 `/glm-status` 的输出（`tests/health.spec.ts`；通道请求的三种结果在 `tests/glm-zcode.spec.ts`）；同一文件把真实处理函数的输出（未登录、登录不完整、已登录、后台轮询失败后的上次登录错误）交给 GLM 按钮的解析函数，断言字段、各行与剩下的行。L3 探针在 GLM、非 GLM、压缩三个场景的最后一步调用本包真实的 `/glm-status` 处理函数，检查表列出全部 15 行（`HEALTH_ROWS`；2026-10-29 的探针输出「11 row(s)」，规则板行加入后为 12，设计行加入后为 13，经验行加入后为 14，循环行加入后为 15）、各行状态与原因符合路由，并确认表的内容没有进入任何模型请求。探针里 `glm-llm` 显示未加载：bundle 默认禁用该行，探针用的是脚本化 provider。

### 2.6 状态板块〔第 1、3、4、5、7、8、9 批已实现 2026-11-03/04/05，L2 与报告路的 L3；规则板的板块路已实现 2026-11-05（宿主一侧 L2、L3，面板一侧 L2）；设计 0.3 在 `.agents/tasks/status-hub/design.md`，依据 `d-status-hub`〕

各模块把自己的状态算成一组状态条目，面板、晨报、周报与主 Agent 都显示这一份，不各算一遍——面板 P13-01（面板与循环板各取一份超时上限）与 M4 F16（晨报对账只读当天流水）都是同一件事从两处取数，由此收口。每条注明给谁看（`audience: 'person' | 'agent'`）、何时（`asOf`，ISO 时刻）、来源（`source`，流水路径或投影名，只给追溯，不进人面）、给人看的一行字（`text`，过人话检查，至多 200 个码点）、可选的结构化字段（`fields`）、可选明细行（`detail`）与陈旧判据（`staleAfterMs`）。形状与校验在 `src/shared/status.ts`（客户端安全，不引 Node 内置）：`validateStatusItem` 对必填字段逐条校验，不合的整条丢弃；`audience` 不合法不默认任何一种——该给人看的丢了，别的来源还在，该给人看的被错当 `agent` 进了模型，是不可逆的披露；可选字段清洗而不丢（不合法的 `fields` 键丢弃、超长 `detail` 行截断、不合法的 `staleAfterMs` 当作不陈旧），各告警一次。

host 侧登记与行健康（§2.5）平行（`src/shared/status-host.ts`）：每行激活时经 `provideRowStatus` 提供只读视图 `glmHournessStatus/<行>`，条目由该模块自己的纯函数算出——同一个函数同时喂模块的投影与收集器，一件事只在一处算。收集器 `collectStatus`（`src/report/status.ts`）对已知行清单 `STATUS_ROWS` 逐行经 `ctx.get` 取视图：行缺席（未启用）跳过，不算错；取数抛错的行计一条占位（「<行> 行的状态暂时读不到：<原因>」，前 80 字符）并按行按原因告警一次，别的行照常；逐条过校验；按受众过滤（`agent` 只收 `audience==='agent'`，凡进模型上下文的路只走这一档；`all` 档留给将来列 `person` 条目的报告面，今天没有调用方）；陈旧条目的 `text` 后加「（截至 <asOf>）」照显示，不丢；按 owner 与 id 稳定排序。`STATUS_ROWS` 今天与 `HEALTH_ROWS` 相等（metrics 与 loops 行已在其中），是它的超集接缝：execute 这类今天还没有 loader 行的 owner 随各自的包合入时加进来，preflight 核对每一项都是目录表里真有的 loader 行。

第 1 批接的第一条条目与第一个消费方：`hourness` 行把用量清单交成一条 `glm/usage`（`audience: 'agent'`；`src/report/panel.ts` 的 `usageStatusItems`，`usagePanelOf`/`usagePanelLines` 从此只被它一处调用）：`text` 是合计一行，`detail` 是各模型行与剔除说明，`fields` 带合计数与覆盖（可读条数、最早一条）。条目是用量流水的整本账——「面板」一节一直的窗口（M6 0.7 §6.2 面板读全部记录）；晨报的「用量（今天）」一节是本期切片，两扇窗的口径由 M7 的报告节次接 hub 时定（设计 §6、§12 的 M7 行）。`renderHourness` 的「面板」一节经 `collectStatus(..., 'agent')` 读回这一条：口径说明行、高峰行与范围、缺口行仍是这一节的版面（模块拥有条目的字，hub 拥有版面），输出与改前逐字相同；流水还没有时不显示这一节，状态读不到时这一节写占位并告警。

额度与高峰（设计 §10 第 2 步的余下部分，2026-11-04）：`hourness` 行再交两条。`rules/peak`（`peakStatusItems`）：`peakLineOf` 写的那一行是 `text`——`/glm-status` 的高峰行同出 `peakLine` 一词——`peakLineOf` 从此不再导出，只被它调；没有计价服务、或 `peak` 出错时没有条目，「面板」的高峰行照旧缺席。`glm/quota`（`quotaStatusItems`）：`quotaSection` 写的几行，第一行是 `text`、其余是 `detail`；`quotaSection` 只被 `hourness` 行的刷新调。额度读数是异步的（至多三秒）而状态视图是同步的，所以行在人敲 `/hourness` 时读一次（M6 定的读的时机），把读出的几行与读数时刻缓存进视图，收集时照缓存出条目；缓存属于计价服务，服务不在（GLM 包卸载）就不出条目。这两条是「面板」的高峰行与「额度」一节唯一的脸，输出逐字不变。`rules/peak` 的档位一半（§4.2）随规则行接 hub 时并入。`collectStatus` 的受众参数收窄回设计 §3.3 本来的 `'agent' | 'all'`（批次 1 曾放宽为 `StatusAudience | 'all'`，其中 `person` 没有定义过的语义）。

面板一侧（设计 §3.4，2026-11-04）：plain-ui 的 `BoardState` 加可选 `items`（`ui/src/graph/boards.ts`，条目类型即 `src/shared/status.ts` 的 `StatusItem`，客户端构建把该文件内联进 bundle），板页从板块自己的 snapshot 拿条目，不进收集器。板块登记表读到的 snapshot 结果在此校验（plain-ui 1.3 §8.2 那一行，按设计 §12 加 items）：`available` 不是布尔整份不可用（面板当作这块板不在）；`peakApplies` 缺了当作 `false`；两行话不合「一行、至多 60 码点」的隐藏；`items` 每条过 `validateStatusItem`，整条丢的与清洗的各告警一次（`checkedBoardState`，面板的 `useBoard` 调它；校验结果按输入对象记忆，useSyncExternalStore 的对象稳定性不变）。首页同源：板从自己条目里挑一条做 homeLine 时经 `homeLineFromItem`，按条目 id 点名——命中怎么认定由此定案（设计 §11 留空的 SH3-01）：该条 text 至多 60 码点时逐字取它，否则为 null，板退回自己的话或隐藏该行；诊断型 homeLine（板自己的话）不经它，不在断言覆盖内。

`rules/peak` 并成整条（设计 §12 规则行，2026-11-04）：规则行接 hub，`src/rules/status.ts` 的 `rulesStatusItems` 经 `provideRowStatus(ctx, 'rules', …)` 交 `glmHournessStatus/rules`；`text` 仍是 `peakStatusItems` 的那一行（与报告面同一份计算），`fields` 带档位（`peakMode` 与 `peakModeOrigin`，来自项目状态 `stateOf`）；会话的项目状态读不出时只有 hours 半条，没有计价服务时没有条目。`hourness` 行的高峰半条让位：`statusViewOf(ctx, 'rules')` 取到形状对的视图时它不再交 `rules/peak`（形状不对的值不算视图，半条保留）；规则行自 rules-loops 启用（2026-11-04，`cordis.patch.yml`）起开着，整条已生效。loops 行与 lessons 行本轮不交条目：loops 的两条周清单（§4.2）要的 `staleEntries`/`timeoutEntries` 服务成员还没有（schedules 设计 §6.11，随循环板实现）；lessons 按设计 §12 的 M5 行本轮不改。后续批次：晨报的用量切片接收集器（见上）、M4 的超时条目（随 m4-checks 的 `limits.jsonl` 合入）、`hourness_report` 与 M7 的晨报周报读收集器、规则板与循环板页面从各自 snapshot 填 items，以及这两处的 L3（板块路的一源、`hourness_report` 两个 kind 无 person 无比率）。

批次 4（M4 的事实，设计 §12 的 M4 行，2026-11-04）：`guard` 行交 `rules/denials` 与 `rules/lifts`（`src/guard/status.ts` 的 `guardStatusItems`，经 `provideRowStatus(ctx, 'guard', …)` 交 `glmHournessStatus/guard`），`env` 行交 `env/suppressions`（`src/env/status.ts` 的 `envStatusItems`，`glmHournessStatus/env`；env 行今天仍关闭，启用即生效）。三条都读整本流水——拦下计数是流水整本的账（用量条目的先例），撤下是项目的决定、哪一天撤的不相干（M4 设计 §3.10，评审 finish2 第 2 遍 F16）；晨报的例外一节仍是本期切片，两扇窗的口径随 M7 的报告节次接收集器时定。条目的字是报告那一节的字：每条规则的拦下行与走对汇总（`ruleLines`）、「撤下的规则」行与对账行（`liftLines`）与压制注释行（`suppressionLineOf`）从晨报移进各自的模块（`src/guard/status.ts`、`src/env/status.ts`），晨报改为导入——这些行本来就出在报告上，移家之后报告与条目是同一份计算；流水的最早时刻（缺口记录算 `since`，对账拿它分「换了电脑」的行）抽成 `src/guard/records.ts` 的 `journalEarliest`，晨报与条目同用。`rules/denials` 的 `text` 是第一条拦下行、其余行是 `detail`，流水里没有拦下时没有这条；`rules/lifts` 的 `text` 是「撤下的规则」一行——没有撤下时写「撤下的规则：无」，`asOf` 是最后一条撤下记录的时刻——对账行是 `detail`；撤下的原话与经哪条路（设计的 liftHow）照原文在行里，`fields` 留空。`env/suppressions` 的 `text` 是最新计数一行、`fields` 带总数，`asOf` 是那次计数的时刻，48 小时后算陈旧（计数一天一次，两天没有新计数说明行的计数没跑）。偏差两处：报告的「lifts.jsonl 有未提交的撤下」一行不在条目里——它要跑一次 git status，而状态视图是同步的，报告照旧自己算；条目镜像报告对没有 lifts.jsonl 的项目写「读不出（ENOENT）」一行的现有口径（评审 finish2 的 ⑬ 用空文件钉住对账，生产的缺失文件走读不出行），没有另设一套。`rules/*` 上规则板页面的板块路（设计 §3.4 的覆盖）与晨报对这些条目的消费在后续批次；`STATUS_ROWS` 已含 `guard` 与 `env`，收集器无需扩表。验证：`tests/guard-status.spec.ts`（条目与 `ruleLines`/`liftLines` 逐字一致、整本口径、无撤下时的「无」与 ENOENT 行、对账两向、行的接线与撤回、未知会话无条目、收集器读回同一份）、`tests/env-status.spec.ts`（计数条目与陈旧判据、行接线、ENOENT 无条目不算错、读不出进占位、坏行跳过）。

批次 7（指标的减负数字，设计 §4.2 的表与 §12 指标行，2026-11-05）：指标行经 `provideRowStatus(ctx, 'metrics', …)` 交 `glmHournessStatus/metrics`，只有一条 `metrics/load`（`src/metrics/status.ts` 的 `metricsStatusItems`，`audience: 'agent'`）。条目读的是指标板写进 `view.json` 的同一个视图对象（`refreshBoard` 把截过长度的视图按项目留一份，文件与条目都用它），取其中 `relayed` 的 `load` 组——宪章 §3.2 第 5 条的三个减负数字（问你几次、每次要读的字、你回话等了多久），由 `factsFor` 算——的「最近 7 天」一栏：`text` 写作「最近 7 天：问你几次 N 次；每次要读的字（中位数）…；你回话等了多久（中位数）…」，即窗口名加各行的名与本窗的值，字与板上逐字相同；`asOf` 是视图的 `at`（最近一次算成的时刻，算失败时视图带上次好的组，条目照出、时刻不变）；不带 `fields`、`detail` 与陈旧判据。板还没算成过（`at` 为空）、会话没有项目、视图里没有 `relayed` 的 `load` 组时没有条目。其余各组都是比率或按模型的比较，不交（设计 §4.3、`d-metrics-ratios-person-only`），只在板上给人看。`/hourness` 不列这条（设计 §5，指标 0.7 §7.3），读它的是 M7 的周报（第四个减负数字由 M7 从图算），随 M7 的报告节次接收集器时接入。验证：`tests/metrics-board.spec.ts` 的最后两个测试（纯函数：恰一条、字与时刻来自视图、过条目校验无告警、不含百分号、`at` 为空/无 `load` 组/组不 `relayed` 时无条目、算失败时条目留着；行接线：算成之前无条目，算成之后视图给出的条目等于由 `view.json` 读回的视图算出的那条，收集器 `agent` 档读回同一条，未知会话无条目，随行撤回）。
批次 9（M4 的超时条目，设计 §12 的 M4 行，面板 P13-01 同源那一面，2026-11-05）：检查的超时只在 `src/env/status.ts` 算一次。`checkTimeouts(timing, limits, nowMs)` 把 `timing.jsonl` 与 `limits.jsonl` 读成每项检查一份事实（最近一条取值行、7 天内的超时与排队丢弃、这一项现在生效的上限设置——`limits.jsonl` 里这一项的最后一行是 `raise` 才算，从不取取值行的 `cap`，所以调高与撤回不等下一次运行就看得到），`timeoutLines` 把它写成晨报「检查的超时」一节的几行，字与改前逐字相同（晨报的 `timingSection` 改为调这两个函数）；`envTimeoutItems` 把同一组行交成一条 `env/timeouts`（`audience: 'agent'`，`text` 是第一行、其余是 `detail`，每行一行、至多 200 个码点，理由里的换行换成空格、超长的截断加省略号，`fields` 带检查数与 7 天超时总数，`asOf` 是读的时刻），env 行的状态视图在 `env/suppressions` 之外交它。两份账在 runner 写账的同一个项目目录（`projectHomeFor(ctx, undefined, cwd)`）；账不在时没有这一条，读不出时状态视图抛错、收集器写占位。报告版面今天不列这一条：`/hourness` 的晨报本来就有「检查的超时」一节（同一份计算），周报与 `hourness_report` 随 M7 的报告节次读它。验证：`tests/env-status.spec.ts`（晨报一节逐行等于 `timeoutLines(checkTimeouts(…))`、条目与晨报同一组行且过条目校验无告警、没有取值行时无条目、换行与超长理由截成一行、行接线：收集器读到同一条、改 `limits.jsonl` 撤回之后下一次读就没有调高那一行）；L3：探针 `env-checks-ceiling` 在 `check_limit` 之后一步打 `hub`，检查收集器 `agent` 档里的 `env/timeouts` 写着被上限截住的 `tool-1/full` 与它下面调高到 120 秒的那一行。

验证：L2 在 `tests/status.spec.ts`（条目契约与校验的每条规则、登记与撤回、收集器的受众过滤、错误隔离与占位、陈旧标注、`glm/usage` 条目逐字等于旧 `usagePanelLines` 的输出）、`tests/hourness.spec.ts`（行提供状态视图、`/hourness` 的「面板」一节、无流水无这一节、读不到时的占位与告警、规则行视图在场时高峰半条让位且收集器只见一条 `rules/peak`）、`tests/rules-row.spec.ts`（规则行的状态视图：`fields` 带档位、档位改动即随、与报告面同一行字、撤回随行、无计价服务无条目、未知会话只有 hours 半条）与 `tests/lessons-panel-model.spec.ts`（snapshot 结果校验与告警一次、homeLine 从条目逐字取或为 null）；`scripts/preflight-bundle.mjs` 核对 `STATUS_ROWS`（`tests/preflight.spec.ts`）。

L3（批次 8，设计 §11 的 L3 中报告路够得着的部分，2026-11-05）：探针的脚本化 provider 加步骤标记 `hub`（`scripts/probe/probe-llm.mjs`），该步的命令跑完后对请求的会话调真实的 `collectStatus`（`agent` 与 `all` 两档，读的是运行时里各行提供的状态视图），结果记进请求记录；glm 场景跑 `/hourness` 的最后一步打上它，`scripts/probe/run-probe.mjs` 加四条检查。一，收集器读到行、没有一行读出错，`agent` 档的条目全是 `audience: 'agent'`，且与 `all` 档滤掉 person 之后逐个相同（做完条件 2 的过滤在真实运行时）。二，`/hourness` 的「面板」一节第一行等于 `rules/peak` 的 `text`、末尾几行等于 `glm/usage` 的 `text` 加 `detail`，「额度」一节等于 `glm/quota` 的 `text` 加 `detail`（做完条件 1 的报告路、条件 6 的面板一半）。三，`rules/peak` 恰一条（规则行开着，`hourness` 行的半条让位）。四，指标行交的条目只有 `metrics/load`，`/hourness` 的「指标（流水，今天）」一节在、其中的 `###` 标题都在六个事实组之内（做完条件 3）。`hourness_report`、周报与板块路的 L3 随各自的消费方。

规则板的板块路（设计 §3.4 的覆盖，宿主一侧，2026-11-05，`ORCHESTRATION.md` §16.14）：规则行写规则页的数据 `<项目根>/.llm/rules/view.json` 时调同一个收集器 `collectStatus(ctx, sessionId, 'all', now)`，把 `owner === 'rules'` 的全部条目（`rules/peak`、`rules/denials`、`rules/lifts`）原样放进它的 `items`，`rules`、`guard` 两行读不出的原因放进 `statusProblems`；面板的规则板（`ui/src/rules/board.ts`，2026-11-05）读这个文件，把 `items` 原样交给 `snapshot().items`，板页在页头下列出它们，板页与报告路于是同一份计算（L2 在 `tests/rules-row.spec.ts` 断言文件里的 `items` 深等于同一时刻收集器的 `rules` 条目，`tests/rules-panel-model.spec.ts` 断言板交出的 `items` 深等于文件里的；板的 `homeLine` 是规则板自己的话，不经 `homeLineFromItem`；L3 的 `rules-page:` 检查核对 `glm-rules` 场景的 `rules/peak` 与同一次运行 `/hourness` 面板一节的第一行逐字相同）。客户端经会话投影 `hournessRules`（`{projectKey, viewFile}`，与循环板的 `hournessLoops` 同一个定义）找到这个文件。

## 3. 路由判定〔已实现 2026-10-27〕

现状〔实读〕：各行判断「是否 GLM 会话」的写法不一致。`glm-prompt` 认 provider `glm` 或模型名前缀 `glm`；`toolsearch` 在 `agent/created` 时只认 `agent.model.current().provider === 'glm'`；todo 提醒依赖 `agent.model.current()`。rc.3 桌面版在 `agent/created` 与 `agent/pre-step` 上给出的路由为空（`legacy/desktop-dialect-triage.md`，git 历史），唯一可靠的信号是 `system-prompt/assemble` 瀑布中 `variables.provider` / `variables.model`。原生通道的 provider id 是 `glm-zcode`。由此推断 todo 提醒与工具检索在真机上未生效〔推断〕。

定案：

1. 方言跟着模型族走：训练分布是模型的属性。判据为模型 id 属于 GLM 族。
2. 通道跟着路由走：ZCode 身份是传输层的属性。判据为 provider id 是本通道注册的 id（默认 `glm-zcode`）。
3. 判定函数只有一处（`src/shared/`），所有行共用。
4. 只对准 rc.3 的可靠信号；兼容旧构建的分支删除。
5. 单测里的假宿主必须给出与 rc.3 相同的信号，不得提供真宿主不提供的路由字段。

第二个信号〔2026-10-28，L4 之后〕：没有组装结果的钩子（工具执行）读会话的请求头折叠 `session.requestHeader().config`（`sessionRoute`，§2.4a 接口对照表）。agent 循环在每步调用模型之前写请求头，所以工具执行时它就是发出这次调用的那一步的路由。guard 用它决定纠偏里的工具名，并给违规与影子记录标上来源；拦不拦与路由无关（2026-10-29 起，`ORCHESTRATION.md` §6.2）。不另建按 agent 记录路由的跟踪器：两个信号都来自运行时自己的记录，跟踪器是第二份状态。

实现：`src/shared/route.ts`（`isGlmModel`、`assemblyRoute`）；`glm-prompt` 在 `agent/created` 时于 agent 作用域注册别名，并注册一个 prepend 组装监听器，在 `next()` 之后按本次请求的路由改写提示词节与工具面，不再调用 `restrict()`，也不再挂载 / 卸载。同一步里的其他钩子读的是该监听器本步的判定（todo 提醒读「GLM 路由且工具面有 TodoWrite」，§5.5）；原先按 agent 记录路由的 `createRouteTracker` 随 todo 提醒改到 `agent/pre-step` 后不再有使用者，已删除（2026-10-28）。单测替身 `tests/fake-rc3.ts` 只提供 rc.3 的接口。L3 探针 9/9：GLM 路由得到 ZCode 身份与别名面、`Read` 别名真实执行；非 GLM 路由保持 DSH 原文与原生工具。工具检索在同一个组装监听器里、别名改写之后执行（§5.7），探针扩到 15 项，全部通过。

## 4. 通道

请求流程（`ZcodeAdapter.stream`）〔实读〕：加载凭证 → 项目令牌（coding-plan，拿不到即失败，§4.1）→ deviceMid → 端点路由 → 组装身份头与鉴权头 → 签名 V4（失败放行）→ Anthropic Messages 传输。

### 4.1 凭证与登录

- 登录：ZCode 账号体系的 bigmodel 轮询登录（`/glm-login` 打开浏览器授权，5 分钟超时）〔实读〕。
- 模型请求的凭证〔已实现 2026-10-28，m1-parity 第 1、2 项，`src/glm-llm/auth/project-token.ts`〕：coding-plan 的每个模型请求用项目令牌（PAT）同时填 `Authorization: Bearer <PAT>` 与 `x-api-key: <PAT>`，签名也用它，与 3.16.3 账号模式相同（CLI `x5s` @3843063 把请求凭证设为 provider 的 `apiKey`、删掉配置里的 `authorization`/`x-api-key`，`T5s` @3843231 补 `Authorization: Bearer`；桌面 `AccountProviderRequestAuthService.resolveCurrent` 对个人套餐返回 PAT 与它的 `apiKeyId`）。此前两个头放的是 `{apiKeyId}.{secret}`，PAT 只喂签名。
- 项目令牌按 3.16.3 `ProjectAccessTokenClient`（CLI `sge` @1082916，缓存 `Urt` @1080367；桌面 `out/host/chunk-5YNPFY3L.js` 同一份代码）移植：用 OAuth 访问令牌原样调 `getCustomerInfo`，滤掉 `projectType` 为 `"2"` 的项目与因此没有项目的机构，取名含「默认机构」/「默认项目」者，否则取第一个；列出该项目的 API Key，取名为 `zcode-api-key` 的，没有就以 `usageScene: 1` 新建；`POST …/api_keys/{apiKeyId}/access_tokens`（`Authorization: Bearer <OAuth>`，体 `{clientType: "zcode", clientVersion}`）铸造。响应码 `200`、`0`、`"200"`、`"0"` 视为成功；缺 `enable` 视为启用，`enable: false` 报 `project_token_disabled`；有效期取 `min(expiresAt, 开始时间 + expiresIn)`，到期前 120 秒再减随机 0–60 秒刷新；429、5xx、网络错误、15 秒超时是暂态失败，旧令牌未到期时继续用并 5 秒后再试；铸造回 404 时删掉定位，下次重新定位；同一登录、同一账号的并发获取共用一次；铸造期间登录变了报 `project_token_scope_invalidated`。错误一律归为 ZCode 的错误码（`project_token_login_required`、`project_token_disabled`、`project_token_project_unavailable`、`project_token_invalid_response`、`project_token_scope_invalidated`；请求失败按 3.17.1 `KAr` 的类别为 `project_token_network_error`、`project_token_timeout` 或 `project_token_http_<状态码>`，其余 `project_token_request_failed`；响应体不是 JSON 为 `project_token_invalid_response`），不带服务端文本与令牌〔请求失败的细分 2026-10-30 起，项目图 `zcode-3171-follow`；此前一律为 `project_token_request_failed`〕。
- 令牌被拒：最终响应是 401 且不是请求安全类失败（信封里的消息、原因或错误码为 `VERIFY_APIKEY_EXPIRED`、`VERIFY_SIGNATURE_INVALID`、`3007`）时，以被拒令牌的 SHA-256 强制重铸一次，作为新的尝试重发一次（新 `x-request-id`），只重试一次（3.16.3 `AccountRequestRetry` `$ye` @4144946、`isProjectTokenRejection` `$Hs` @4144643、`isRequestSecurityFailure` `Vrt` @1090655）。`Vrt` 读的「provider 错误码」由 3.16.3 的错误解析器给出，本包按信封的 `code`、`error.code`、`error.message` 近似。判断读的是响应的副本；重发前取消被拒响应本身的 body，不留缓冲（3.16.3 丢弃的响应体经 `DQr` @3843990 读空）。
- 拿不到 PAT〔定案 2026-10-28，用户选 B，项目图 `question-6`〕：按 3.16.3 账号模式失败即停（`ModelRequestAuthMissing`），不退回 API Key：模型请求、端点路由配置请求与签名握手一个都不发，流以 `glm-zcode: project access token unavailable (<原因>) — run /glm-login to sign in again` 失败，行健康为未生效「未拿到项目令牌（<原因>），按 3.17.1 不发送；运行 /glm-login」。原因是 ZCode 的原文（3.16.3 与 3.17.1 相同）：凭证没有 OAuth 令牌时为 `Account request credential is unavailable: bigmodel`，没有账号 id 时为 `Account request credential is unavailable: account:bigmodel-individual-coding-plan`（桌面 `AccountRequestCredentialUnavailableError`，`out/host/index.js` +1200545），其余为上面的错误码。3.16.3 渲染层不翻译这些消息，原文直出。凭证里缺 OAuth 令牌或账号 id 的登录（start-plan 为缺套餐 JWT）`/glm-status` 显示为未登录并带同一原因：`glm-zcode：未登录（套餐 <档位>，登录不完整：<原因>）。运行 /glm-login 开始登录`，设置页按「未登录」解析〔已实现 2026-10-29，m1-parity 评审第 1 轮〕。
- 存储：`<home>/credentials.json`，AES-256-GCM，原子写入〔实读〕。`home` 默认是用户级目录 `$DSH_HOME/glm-hourness/`（§2.4）。每次写入经同目录下自己的临时文件（命名同 3.16.3 `PWs` @4062889：`.<文件名>.<pid>.<毫秒>.<随机十六进制>.tmp`）再 `rename`，失败时删掉临时文件；同一凭证文件的写入（登录、登出、迁移、项目 key 定位的写入与删除）在进程内排成一个队列依次执行，读改写在队列里读文件，所以不会覆盖期间落地的写入〔已实现 2026-10-29，m1-parity 评审第 1 轮〕。
- 记录内容〔已实现 2026-10-28，m1-parity 第 3 项，`src/glm-llm/auth/store.ts` `loadStoredCredential`〕：版本 2 的记录是 `{version: 2, provider: 'bigmodel', oauthAccessToken?, userId?, jwt?, location?}`。与 3.16.3 桌面版一样只存登录令牌：`/glm-login` 完成后不再调 `getCustomerInfo`、`api_keys` 与 `api_keys/copy`，不存 API Key 与它的 secret（3.16.3 账号模式两处都不用，FACTS §1）；项目 key 在第一次需要项目令牌时定位，定位按 3.16.3 的键 `project-key-location:v1:…` 存进 `location`（`{key, value}`，`value` 是 `{organizationId, projectId, apiKeyId}` 的 JSON），铸造回 404 时删除。定位只在凭证里的 OAuth 令牌仍是解析它时用的那个时写入：解析期间换了登录，就不把旧登录的定位挂到新登录上。项目令牌本身不落盘，只在进程内缓存。`/glm-status` 的 Key 预览取已定位的 `apiKeyId` 前 6 位，没定位时显示 `unresolved`。
- 迁移：读到旧的版本 1 记录（`{apiKey, provider, userId?, jwt?, oauthAccessToken?}`，`apiKey` 是 `{apiKeyId}.{secret}`）且它有 OAuth 令牌或 JWT 时，按版本 2 原子重写一次，丢掉 `apiKey`，OAuth 令牌、JWT 与 `userId` 原样带过；重写在写入队列里重读文件，仍是版本 1 才写，所以并发的首次读取（会话标题与第一步几乎同时发出）只迁移一次；重写失败时原文件不动，本次用内存里的版本 2，下次读取再试。没有任何登录令牌的版本 1 记录不改写，读作没有令牌的记录，请求时提示 /glm-login。迁移从不清空、从不删除凭证文件。
- 降级：迁移之后装回旧版 bundle，旧代码要求 `apiKey` 字段，会显示未登录，需要重新 /glm-login。
- 旧副本：主检出 `.llm/credentials.json` 不在迁移范围内，仍含 secret，已于 2026-10-29 删除（§2.4，项目图 `m1-cleanup`）。
- 真实凭证的迁移〔实测 2026-10-29，批次 L4，项目图 `m1-11`〕：桌面版以 m1-parity 的代码（`a9f12e1`）重启后，第一个 GLM 回合开始 0.52 秒时 `~/.dsh/glm-hourness/credentials.json` 被重写（998 → 1374 字节），此后到运行结束没有再变。`/glm-status` 在第一个请求前显示已登录、Key `unresolved`，之后显示已定位 key 的前缀，与重启前旧代码显示的前缀相同：定位到的是已有的 `zcode-api-key`，没有新建。只看得到修改时间，写入次数本身看不到。重启前「不要用新代码读真实凭证目录」的约束随之解除。没有测过的情况：桌面版运行时另起一个进程（如 `scripts/smoke-zcode-authorized.mjs`）写同一个凭证文件，写入队列只在进程内串行。
- 风险：加密密钥由 `HOME`/`USERPROFILE`、平台与架构推导，看过源码即可算出；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖。凭证文件不入库，当前可接受。后续迁到系统钥匙串或 DSH 凭证服务〔规划〕。

### 4.2 身份头

LLM 平面（bundle `g6n` 形态）：`HTTP-Referer`、`User-Agent: ZCode/<ver>`、`X-ZCode-App-Version`、`X-Title: Z Code@electron`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-ZCode-Agent: glm`、`X-Platform`、`X-Os-Category`、`X-Os-Version`；不带 `X-Device-Mid`。上下文平面（bundle `TV`，用于端点路由与签名）带 `X-Device-Mid`，不带 `X-ZCode-Agent`。值经可打印 ASCII 规范化〔实读〕。

版本：统一为常量 `ZCODE_APP_VERSION = '3.17.1'`（`src/glm-llm/identity.ts`），供 `User-Agent`、`X-ZCode-App-Version`、OAuth 跳转参数 `app_version`、签名头 `X-Client-Version` 与项目令牌请求的 `clientVersion` 共用〔2026-10-27 统一为 3.16.3，此前分别为 3.14.0 与 3.15.1；2026-10-30 改为 3.17.1，项目图 `zcode-3171-follow`〕。3.17.1 的包里同样没有版本字面量，版本来自构建期常量与环境变量。

对照 3.16.3 安装包〔实读〕（这几处代码在 3.17.1 中逐字节一致）：

- LLM 平面身份头的组装函数（`buildCliZCodeSourceHeaders`）字段与顺序和本实现一致。
- `X-Title` 的来源标题：进程参数含 `app-server` 或 `agent-server` 时为 `electron`，否则为 `cli`（`kuc` @14423244）。桌面版以 `app-server` 方式启动 agent 进程，端点路由的配置请求也传 `sourceTitle: "electron"`（@15096557），所以桌面版的模型请求与配置请求都是 `Z Code@electron`。〔定案 2026-10-28，用户选 B，项目图 `question-8`〕本实现两处都发 `Z Code@electron`（`DEFAULT_IDENTITY.sourceTitle`），取代 2026-10-27 保持 `cli` 的定案；事实见 `FACTS.md` §1。
- 签名与项目令牌共用一个版本常量（构建期 `__ZCODE_VERSION__`），`X-ZCode-App-Version` 取自环境变量 `ZCODE_APP_VERSION`。安装包文本中前者未被构建替换，实际取值未验证；本实现两处都用应用版本。

User-Agent 与头的组装〔已实现 2026-10-28，m1-parity 第 7、8 项，`src/glm-llm/headers.ts` `buildModelRequestHeaders`〕：coding-plan 模型请求的头按 3.16.3 内 AI SDK 的两级合并生成：

- provider 级：`withUserAgentSuffix({"anthropic-version", "x-api-key": PAT, Authorization: "Bearer " + PAT}, "ai-sdk/anthropic/3.0.81")`（`createAnthropic` `sgn` @3569529 的 `getHeaders`，使用处 @3570073，请求凭证经 `x5s`、`T5s`）。`withUserAgentSuffix`（`Y2` @3510311）把键改成小写、后写覆盖先写，经 `Headers` 后以 `Object.fromEntries(headers.entries())` 返回，所以结果是小写、按字母排序的普通对象。
- 调用级：身份头（含 `User-Agent: ZCode/3.16.3`）与归因头（§4.5b）；会话标题走 `generateText`，调用级先追加 `ai/6.0.193`（@3949945），主步与压缩走 `streamText`，不追加。
- `postToApi`（`SZr`）：`withUserAgentSuffix({"Content-Type": "application/json", ...合并(provider 级, 调用级)}, "ai-sdk/provider-utils/4.0.27", 运行时段)`，合并（`Rh` @3505152）是浅合并，调用级的 `User-Agent` 覆盖 provider 级的。运行时段按 `getRuntimeEnvironmentUserAgent`（`$ut` @3509781）先取 `navigator.userAgent`，转小写后得 `runtime/<userAgent>`；没有时取 `runtime/node.js/<process.version>`（`runtimeUserAgent`）。构造规则与 3.16.3 相同，取值随宿主。
- 结果〔实测 2026-10-29〕：DSH 桌面运行时（0.2.1-rc.3，`DeepSeek Harness.exe` 的 Electron node 模式，`process.version` `v24.21.0`，`navigator.userAgent` `Node.js/24`）上，主步 `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`，会话标题 `ZCode/3.16.3 ai/6.0.193 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`，端点路由配置请求 `ZCode/3.16.3`。依据：m1-parity 的沙盒真实网络运行截包（§4.3 实测）；批次 L4（项目图 `m1-11`）以同一个 exe 的 node 模式加载 `dist/glm-llm/headers.js`，`runtimeUserAgent()` 为 `runtime/node.js/24`，桌面版的宿主进程就以这个模式运行，桌面版流量没有截。以本机 `node`（v22.20.0）运行时（单测等）是 `runtime/node.js/22`。ZCode 桌面版自己的 agent 进程取什么值取决于它所带 Electron 的 Node 版本，ZCode 自身的流量没有截，未确定。此前本包发 `ZCode/3.16.3 ai-sdk/anthropic/3.0.81`。start-plan 不变。2026-10-30 起版本段为 `ZCode/3.17.1`，构造不变。

### 4.3 签名 V4

移植自 zcode-api 的 `client-signing`，按 ZCode 3.16.3 安装包的 `ClientRequestSigningV4Signer` 核对（2026-10-28，符号与安装包偏移见 `FACTS.md`）〔实读〕：

- 握手：`POST new URL('/api/paas/c1f3a7e2/v2/client', <provider baseURL 的 origin>)`，baseURL 的路径部分丢弃。coding-plan 的 baseURL 是 `https://open.bigmodel.cn/api/anthropic`，握手发往 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`。`c1f3a7e2` 是字面常量，3.15.1 到 3.16.3 的六个包相同。凭证是请求的项目令牌（§4.1；3.16.3 `protectTransport` @3833810 用请求凭证建签名 fetch），按 `parseSigningCredential`（`D1r` @1087575）的 JWT 形式解析：头 `{alg: HS256, typ: JWT, sign_type: SIGN}`，载荷 `token_use: project_access` 且 `api_key` 非空，整段令牌是 HKDF 的 secret。`D1r` 的 `{apiKeyId}.{secret}` 分支本包不再移植：本通道不再持有这种凭证。请求头 `Authorization` 是原样令牌（不加 `Bearer `），请求体 `{accessToken, nonce, sig, ts}`，超时 10 秒。响应里的 `privateCipher` 用 HKDF 派生的 AES-GCM 密钥解出 Ed25519 私钥；此后每个请求带 Ed25519 业务签名与 PoW，共七个签名头。
- 组装：签名 fetch 包在端点路由 fetch 外面。签名器看到路由前的 provider URL，握手 origin 由它决定；签好的请求交给路由改写到 `zcode.z.ai/api/v1/ultra/...`。握手本身也经同一个路由 fetch；路由表按完整 URL 匹配，没有握手 URL 的映射时原样发出（§4.4）。
- 头的线上顺序〔已实现 2026-10-28，m1-parity 第 8 项〕：照搬 3.16.3 的 `Headers` 链，不手排：AI SDK 产出的小写、按字母排序的对象 → 签名器 `new Headers(...)` 后删掉七个签名头（`zrt` @1089207），再依次 `set` `X-Client-Ts`、`X-Client-Version`、`X-Client-Sig`、`X-Session-Id`、`X-Client-Nonce`、`X-App-Id`、`X-Client-Pow`（`sendSigned` @3827896，七个 `set` 在 @3828487）→ 路由 `new Headers(prev)`、删 `host`、`set` `X-ZCode-Authorization`（`f5s` @3840311，`Ngn` @3839971）→ fetch。undici 复制 `Headers` 时保留插入顺序与 `set` 时的大小写（本机 Node 22.20 回环服务器实测 `rawHeaders`），所以线上是：前段小写字母序（`x-session-id` 在原位被改名为 `X-Session-Id`），随后 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow`，最后 `X-ZCode-Authorization`；握手失败时无签发送的是 `zrt` 的结果，`x-session-id` 保持小写。undici 自己补的 `host`、`connection`、`accept`、`accept-language`、`sec-fetch-mode`、`accept-encoding`、`content-length` 不属于这条链。3.16.3 在有代理或自定义 CA 时网络层改走 `node:https`，头会变成小写字母序（`rdt` @3837494）；本通道始终走 DSH 运行时的 fetch（§4.8）。
- 档位门：start-plan 不挂签名器（3.16.3 `requiresClientRequestSigning` 对 start-plan、off-peak、highspeed 返回 false）。签名器只按这一档位门判断，不按请求路径豁免：它收到的 URL 总是 provider URL。
- 失败梯：握手的网络错误、超时、非 200、业务拒绝、缺 `privateCipher` 都放行，本次无签发送。3.16.3 在四种情况下抛错、请求失败，本包四种都放行：凭证无法解析与请求缺 `x-session-id` 时跳过签名（沿用 zcode-api）；PoW 或 Ed25519 签名失败、握手进行中签名状态被作废（VERIFY 拒绝）时本次无签发送。401 VERIFY 拒绝后作废私钥、立即重新握手再签一次；第二次仍被拒就进入旁路，无签重发。
- 通知：经 `onEvent` 发出，每个（origin, 凭证）每种原因一条。通知只写本包自定的失败类别（如 `handshake_http_404`）与错误名（如 `TypeError`），不写错误消息：fetch 校验请求头时的错误消息会引用头的值，握手请求头的值就是凭证。业务拒绝的 `msg` 只在匹配 `^HANDSHAKE_[A-Z_]+$` 时作为原因保留，与 3.16.3 的日志规则相同。生产构造目前没有接 `onEvent`。

缓存〔实读〕：3.16.3 按（apiKey, 握手 origin）在进程内缓存私钥，没有 TTL，只有 VERIFY 拒绝才作废；并发请求共享进行中的握手；握手失败什么都不缓存，下一个可签名请求立即再握手。本包同样按（origin, 凭证）缓存私钥并合并并发握手，另有两处偏离〔定案 2026-10-28〕：

1. 握手失败后，该（origin, 凭证）60 秒内不再握手，期间的请求直接无签发送（`HANDSHAKE_FAILURE_COOLDOWN_MS`）。按 3.16.3 原样，持续失败时每个请求前都要握手一次；404 这类确定性失败重试没有意义，每次约 90 毫秒，串行排在模型请求之前。VERIFY 作废结束冷却，立即重新握手；凭证是项目令牌，令牌刷新后是新的（origin, 凭证），也立即握手。项目令牌的获取与刷新不再由签名层负责，此前签名层里的铸造与它的 60 秒失败冷却已删除（§4.1）。
2. 两次 VERIFY 拒绝后，该（origin, 凭证）永久旁路，直到进程重启。3.16.3 的旁路只对当前签名器代有效，它的运行时每个请求重建签名器，按源码推断只管一次请求。永久旁路避免每个请求都走三次发送的梯子。

曾有缺陷（2026-10-28 修复，`b6367d3`）：适配器把路由改写后的 URL（`zcode.z.ai/api/v1/ultra/...`）交给签名层，握手 origin 成了 `zcode.z.ai`，每次 404；失败又不留状态，每个请求前都重试一次（§4.5b 截包）。这个错误从基线导入（`9266fb6`）起就在，原先「握手对当前凭证失败」的归因不成立。同批改动：start-plan 不再签名；JWT 形式握手的 `Authorization` 由 zcode-api 的 `Bearer <jwt>` 改为原样 JWT，按 3.16.3 逐字。

实测〔2026-10-29，m1-parity 的 headless 沙盒真实网络运行，代码 `a9f12e1`，临时 profile `glmsandbox-wire`，coding-plan，`glm-5.3-flash`，DSH 桌面运行时的 node 模式（Node v24.21.0）；记录在不入库的 `.agents/tasks/zcode-parity/wire-evidence.md`，只记头名、形式与形状，不记值〕：

- 请求 10 个，全部 HTTP 200，每个只发一次：项目令牌三步（`getCustomerInfo`、列 API Key、`access_tokens` 铸造。凭证副本是版本 1 记录，迁移后还没有项目 key 定位，所以多一次列 key；找到 `zcode-api-key`，没有新建），端点路由配置 1 个，签名握手 1 个，模型请求 5 个（会话标题 1、主步 4）。运行 47.6 秒。
- 握手：`POST open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`，`Authorization` 是原样项目令牌（JWT，`token_use: project_access`），被接受。调用方头只有 `Authorization`、`Content-Type`，没有路由头：服务端映射表没有改写握手 URL，与 m1-signing 那次运行（下面）相同。
- 模型请求：都发往 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages`；`Authorization` 是 `Bearer` 加项目令牌，`x-api-key` 是同一个令牌原样（§4.1）；都带完整的签名块，没有 401，没有 VERIFY 梯子。ultra 网关接受 3.16.3 账号模式的这一组合：两个鉴权头与签名都用项目令牌。
- 头名顺序与大小写：5/5 与 3.16.3 逐个相同（上面「头的线上顺序」）。undici 的 `host, connection` 之后是小写字母序 `anthropic-version` … `x-zcode-trace-id`（`X-Session-Id` 在原位），再 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow`，最后 `X-ZCode-Authorization`；端点路由配置请求的头名序列同样与 3.16.3 相同（§4.4）。
- 延迟：主步到响应头 4.2–7.7 秒，会话标题 1.8 秒。单样本，未归因。
- 用量：coding-plan 的 1.5 倍套餐扣减不在用量流水里（流水只记服务端返回的 token 数），签名对它有无影响未知。

更早的签名运行〔实测 2026-10-28，`net-1793188413414`，代码 `6af6c51`，m1-parity 之前，模型请求的两个鉴权头还是 API Key；记录在不入库的 `.agents/tasks/m1-signing/network-verify.md`〕：握手 200 并带 `privateCipher`，6 个模型请求都签名、都 200，会话约 80 秒，长于 60 秒冷却窗口，全程只握手一次（私钥按进程缓存）；缓存命中形态与同日 5 次无签运行相同（整体 80%，无签 80–87%）；主请求到响应头 6.3–8.0 秒（首个 31.0 秒），无签运行 1.5–5.8 秒，时段与提示词都不同。

start-plan 只做了离线验证：3.16.3 对 start-plan 不签名（`FACTS.md`），本包对 start-plan 不建签名器，组装测试钉住这一点。start-plan 没有额度，没有发过真实请求。

桌面版：2026-10-28 以 m1-signing 的代码重启（M2 批次 L4，`.agents/tasks/m2-9-research/integration.md`），2026-10-29 以 m1-parity 的代码（`a9f12e1`）重启（批次 L4，`.agents/tasks/m1-l4/l4.md`；两份记录都不入库）。两次 `/glm-status` 中 glm-llm 都生效，GLM-5.3-Flash 会话正常应答，日志里没有本包的错误；2026-10-29 的主会话 6 个回合、委派子会话、会话标题与一次手动压缩都正常完成。桌面运行时下签名是否成功看不到：生产构造没有接 `onEvent`，两次都没有截包。

未决：签名对 1.5 倍套餐扣减的影响（需要套餐额度数据）；签名运行的响应头延迟偏高（需要同时段的签名与无签对照）；签名结果对系统可见，即状态里显示签名情况，每条用量记录标注是否签名（条款 7）〔规划〕。

### 4.4 端点路由

`GET https://zcode.z.ai/api/v1/agent/configs`，按 `data.proxyEndpoint.mapping` 改写请求 URL；成功缓存 300 秒，失败冷却 30 秒，超时 3 秒；任何失败保持原 URL。同一快照携带 3.16.3 的请求验证（captcha）开关〔实读〕。

配置请求的头〔已实现 2026-10-28，m1-parity 第 3 项〕：按 3.16.3 `buildProviderEndpointRoutingHeaders`（`FGs` @4196232）依次是 `User-Agent`、`X-ZCode-App-Version`、来源头（`Frn` @968479，经 `NGs` @4199110 规范名：`HTTP-Referer`、`X-Title`、`X-Platform`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-Os-Category`、`X-Os-Version`、`X-Device-Mid`）、`x-api-key-id`（请求项目令牌的 `apiKeyId`，3.16.3 路由端口从请求凭证取，`Ngn` @3839971）、`Accept`。不再发 `x-api-key`：此前这里发的是完整的 `{apiKeyId}.{secret}`。start-plan 的请求凭证没有 `apiKeyId`，配置请求不带 key 头。签名握手经同一个路由 fetch，带同一个 `apiKeyId`。

### 4.5 传输与档位

- 上游：`https://open.bigmodel.cn/api/anthropic/v1/messages`（路由改写前），`anthropic-version: 2023-06-01`〔实读〕。
- 档位：coding-plan（默认，签名，享 ZCode 渠道用量加成）与 start-plan（网关要求的三块系统提示、JWT 鉴权、currentDate 前缀）。start-plan 的三块系统提示属于底层：网关缺了就拒收（3012/405）。
- 状态：coding-plan 端到端真网成功，模型返回 `pong`〔实测，`scripts/smoke-zcode-authorized.mjs`〕；start-plan 只有单测。
- coding-plan 请求体〔已实现 2026-10-28，m1-parity 第 6 项，`src/glm-llm/anthropic.ts` `WireShape`〕：按 3.16.3 内 AI SDK 的 `getArgs`（@3599845，体字面量在 @3603239）与选项映射 fetch（`TQr` @3836714）组体：
  - 键序：`model, max_tokens, [temperature], metadata, system, messages, tools, tool_choice, stream`，未定义的字段不出现（`JSON.stringify` 丢掉 `undefined`），再由选项映射按 `mergeObject`（`Zpr` @547735：在副本上逐键赋值，对象递归合并，`null` 删除，新键排在最后）追加 `thinking`、`output_config`。
  - `model`：官方大小写（`normalizeOfficialGlmModelId` `GZt` @526265，官方 id 表 `Cpr` @526343），`glm-5.3` 发 `GLM-5.3`、`glm-5.3-flash` 发 `GLM-5.3-Flash`。DSH 侧的模型 id 与回放信封里的 `model` 仍是小写。
  - `thinking` 与 `output_config`：GLM-5.3 系的目录规则（§4.6）给出 `{"thinking": {"type": "enabled"}, "output_config": {"effort": <档位>}}`。档位取 DSH 请求的 `reasoningEffort`（`low` / `high` / `max`），缺省或不在目录档位里时取 `high`；会话标题取目录的第一档 `low`（`auxiliaryModelOptions` `PP` @7759001）。压缩取会话最近一个主步的档位：3.16.3 用会话的模型选择建压缩模型（`c3a` @13387356 的 `jT(this, {selection: this.getSessionModelSelection()})`，`jT` @12830530），会话在 `max` 就按 `max` 压缩；DSH 的压缩请求不带自己的档位（rc.3 compaction-basic `summarizeWithLlm`），适配器只能看到空值或 DSH 路由的缺省 `high`。会话的档位按 DSH 会话记在进程内（与 trace id 同一份会话状态，§4.5b）；会话还没有主步时（例如重启后的手动压缩）用压缩请求自己的档位，缺省 `high`。AI SDK 不知道这个 thinking（不是 providerOptions 给的），所以不剥采样参数、不加思考预算。
  - `tool_choice`：有工具时 AI SDK 的 `prepareToolsAndToolChoice`（`nro` @3929119）给 `{type: "auto"}`，Anthropic provider 发 `tool_choice: {type: "auto"}`（`Jjs` @3543299）；没有工具时两者都不发。工具定义是 `{name, description, input_schema}`：3.16.3 对 anthropic 工具传 `eagerInputStreaming: false`（`EVs` @4101395），不发 `eager_input_streaming`。
  - 目录外的模型 id 不加选项映射，`max_tokens` 用 DSH 的值。start-plan 与探针 provider 不传 `WireShape`，保持原形态。
  - 会话标题〔已实现 2026-10-28，m1-parity 第 6 项〕：3.16.3 用 `generateText` 发标题请求（`v4a` @13066475，`tools: []`），不是流：正文没有 `stream` 与 `tools`，键序 `model, max_tokens, metadata, system, messages, thinking, output_config`，档位 `low`、`max_tokens` 5000（§4.6），User-Agent 多一段 `ai/6.0.193`（§4.2）。本包对 `purpose: 'session-title'` 同样不带 `stream`，按 JSON 读整条响应，`decodeMessage` 合成与流式相同的块序列（块开始、增量、块结束、合并后的用量、带信封的 `finish`），DSH 侧看不出区别。DSH 给标题请求的工具集由 DSH 决定（目前没有工具）。压缩与主步走 `streamText`，照旧流式。
- 系统提示词：DSH 把组装好的系统提示词作为历史开头的 `system` 消息下发，`GenerateOptions.system` 为空〔L3 探针实测〕。编码器把请求级文本与开头的全部 `system` 消息依次合并进 Anthropic 的 `system` 字段（与 DSH 自带 pi-ai 适配器同一规则）；之后出现的 `system` / `developer` 消息作为 `<system-reminder>` 包裹的用户轮发送。适配器不声明 `systemPromptUpdate: 'in-history'`，提示词变化时由 DSH 改写开头那条消息〔已实现 2026-10-27〕。此前编码器丢弃全部 `system` 消息而适配器又声明 in-history，原生通道在 DSH 会话里会发出没有系统提示词的请求；冒烟脚本直接传 `system` 参数，所以没有暴露。
- 消息编码〔已实现 2026-10-28，`src/glm-llm/anthropic.ts`〕：按 rc.3 的消息形状（`dsh-llm` `ContentBlockMap`）逐块编码，块序不变，空文本块丢弃，与 ZCode 的 AI SDK 转换一致：
  - 助手消息：`text` 块发文本，`tool-call` 块发 `tool_use`（参数解析失败时为 `{}`）；`reasoning` 块按 §4.5c 作为 thinking 块回传（2026-10-28 之前不回传）。
  - 工具结果：`tool_result`，纯文本结果为一个字符串，空结果为 `(no output)`；失败结果带 `is_error: true`（ZCode 的 error-text 输出）；带图片的结果见 §4.5a。
  - 用户消息：文本块各自成块；没有内容时发 ZCode 的占位 `(no content)`（3.16.3 安装包 `toAiSdkUserContent`），不再发空文本块。
  - 相邻同角色的消息合并为一轮，与 ZCode 经 AI SDK Anthropic provider 发出的形态一致：并行调用的多个工具结果与其后的提醒落在同一个用户轮里。
  - 曾有缺陷：编码器按 `reference/deepseek-harness` 主干的 `toolCalls` 字段读工具调用，rc.3 没有这个字段（全部运行时包中无一处使用），工具调用在 `content` 里以 `tool-call` 块出现。结果是助手的工具调用全被丢弃，下一条 `tool_result` 引用的 `tool_use` 从未发出。原生通道尚未在 DSH 会话中跑过，所以没有暴露；L3 探针的请求摘要现在读 `tool-call` 块，实测每条助手消息都带工具调用块。

### 4.5a 图片〔已实现 2026-10-28〕

- 形态：DSH 的图片是持久附件引用（`image` 块）。适配器经附件服务读出每个附件的请求版本（`AttachmentStore.readImageRequest`，rc.3 pi-ai 适配器的同一调用），编码为 Anthropic base64 图片块 `{type: 'image', source: {type: 'base64', media_type, data}}`。用户消息里的图片在用户轮内容中；工具结果里的图片放进 `tool_result` 的内容数组，与文本块按原顺序排列。这是 ZCode 对 Anthropic 路由的放法（3.16.3 安装包：AI SDK Anthropic provider 把工具结果的 `image-data` 转为同样的图片块；源码 `adapters/src/model/transform.ts`）。DSH 的 `read_image` 结果本身带一段文字信封（路径、尺寸、字节数），随图片一起发送。
- 不加 DSH 的附件把手文本：pi-ai 在每张图片前插一句附件标识与只读路径（`requestImageHandleText`），ZCode 不加（工具结果只保留媒体块），本通道随 ZCode。
- 请求版本的上限按 ZCode 的模型图片上限：长边 2000 像素（`READ_IMAGE_MAX_DIMENSION`、`MAX_IMAGE_ATTACHMENT_DIMENSION`），原始字节不超过 5 MiB 的四分之三，即 base64 不超过 5 MiB（`READ_IMAGE_TARGET_BYTES`）。`imageRequestTarget` 返回同一目标，满足 `LlmAdapter` 合同「与请求序列化所用目标一致」的要求。ZCode 对 Read 读出的图片另有 25,000 估算 token 的上限（base64 长度乘 0.125）；DSH 的目标按路由、模型与图片给出，分不出图片来自 Read 还是附件，所以不用这一条。
- 卸载：带 `offloaded` 标记的图片不读字节，发送 DSH 的占位文本（`offloadedImageText`，能解析只读路径时附路径）。卸载集合是会话的持久事实，每个路由都按同一集合发送。运行时包不能从本仓库解析，占位文本按 `dsh-llm` 0.2.1-rc.3 原文复制在 `src/glm-llm/images.ts`，注明出处。
- 附件服务与 `fs` 服务按请求经 `ctx.get` 读取，不注入（与 pi-ai 相同）；请求带图片而附件服务不存在时，请求失败并说明原因。
- 请求级图片预算：本通道不发 `IMAGE_OFFLOAD_REQUIRED`。ZCode 没有请求级的图片总量上限，GLM 端点的上限未知（§9）。
- 验证：编码器与适配器单测；L3 探针在 GLM-5.3-Flash 上读 PNG，探针 provider 用本通道的真实编码器与运行时附件服务编码同一请求，图片以 base64 PNG 出现在 `tool_result` 中；真网一次（coding-plan，`glm-5.3-flash`，32×32 纯红 PNG，问颜色），模型答「Red」，用量输入 41、输出 32 token〔实测 2026-10-28〕。只有一次请求，猜中的可能不能完全排除。

### 4.5b 提示词缓存〔实测 2026-10-28〕

缓存的形态〔实测，coding-plan，`glm-5.3` 与 `glm-5.3-flash`〕：

- 隐式前缀缓存，按 64 token 一块对齐。命中只覆盖此前请求的提示词，不含输出：工具循环里第 N 步的命中最多是第 N−1 步提示词长度向下取整到 64 的倍数（下称「最新前缀」）。回放 thinking 不能把命中延伸到上一步的输出。
- 网关按 `x-session-id` 做缓存亲和路由。同一会话的请求落到同一处，就命中最新前缀；落到别处，只能命中那里已有的前缀：同一会话更早的一步、其他会话共用的系统提示词与工具段（标定里是 8192、8256、8320、6784 这几个值），或者什么都没有。
- 会话的请求是只追加的〔实测 2026-10-28，headless 沙盒 5 次截包运行〕：会话内 tools、system 与首条消息逐字节不变，后一步只在末尾追加消息。其中 2 次存了原始请求体，15 对相邻请求逐字节对比，原始 JSON 唯一的差异是缓存断点 `cache_control` 从上一步的末块移到新的末块（`anthropic.ts` `markLastMessage()`）；每一步都有这样的移动，而第 3 步起全部命中最新前缀，所以它不是未命中的原因。前缀里没有时间戳，也没有逐步变化的提醒。没命中最新前缀的原因在服务端，不在请求内容。
- 端点在缓存字段上的口径：`cache_read_input_tokens` 是命中数，`input_tokens` 只算未命中部分，`cache_creation_input_tokens` 不出现（§4.6a）。

原因与处置：

1. 已修：原生通道每个请求随机生成 `x-session-id`（zcode-api 原本按会话固定，移植时丢了；ZCode 3.16.3 每个请求都带会话 id）。现在取 DSH 会话 id，去掉 `session-` 前缀（`upstreamSessionId`），同一会话的全部请求同值，压缩与会话标题请求也一样。辅助请求（压缩、会话标题）的 `x-zcode-session-type` 是 `other`，这是 ZCode 给非对话步的类型；实测会话类型不参与亲和（压缩形态的请求标 `other` 与 `main` 各 8 次，都命中最新前缀）。
2. 未解决，没有找到客户端可做的改动（分析见不入库的 `.agents/tasks/m1-cache-flash/report.md`）。现象只在 GLM-5.3-Flash 上：修复会话 id 之后（两轮标定加 5 次截包运行），GLM-5.3 第 2 步 12/12 命中最新前缀；Flash 17 个会话只有 7 个，第 3 步起 101/101 命中，命中的都是第 2 步的提示词，没有一次回到第 1 步。第 2 步的未命中分两个子类：
   - 只命中跨会话前缀（8/17）：读到的值（8192、8256、8320、6784）恰好是与更早会话共用的前缀长度，每次损失 3.8k–5.4k token。
   - 整段未命中（2/17）：读 0，每次损失约 12.1k token。它与会话标题请求共用会话 id 有关联，证据弱：共用 id 时 4/25 次，标题另起 id 或不发标题时 0/20 次（Fisher 单侧 p≈0.085）；下面的重放不发标题请求，也出现了 1 次。`8a08c1f` 撤回标题另起会话 id（`0814234`）时没有区分这两个子类。

   更大的损失在第 1 步：修复后 Flash 第 1 步 19/19 缓存读 0（标定与截包 17 个会话，桌面 2 个），而 GLM-5.3 第 1 步 12 个会话有 10 个读到约 8.2k 的共用前缀（每批第一个会话为 0）。按全价，第 2 步的未命中平均每个 Flash 会话损失约 0.6 积分，约占一个标定 Flash 会话的 4%；第 1 步若能读到共用前缀，每会话约省 1.4 积分。

   重放〔实测 2026-10-28，`.agents/tasks/m1-cache-flash/runs/replay-1793184760972.jsonl`〕：GLM-5.3-Flash 重发一份截包会话的前三步，每个会话换新的会话 id，第 2 步在第 1 步结束后立即发出（A0 臂）或 10 秒后发出（A10 臂），每臂 8 个会话，另有 1 个热身会话。第 2 步只命中跨会话前缀 A0 3/8、A10 2/8，A10 另有 1 次整段未命中，与间隔无关，「第 1 步写入的缓存在第 2 步到达时还没有就绪」这一假设不成立。两臂第 1 步都是 6/8 读 0；第 1 步读到共用前缀的 4 个会话，第 2 步 4/4 命中最新前缀；第 3 步 15/16 命中最新前缀。这些数据与「服务端把新会话的前两步放到不同节点」相容，请求体、步间延迟与标题请求上都没有可改的地方。剩下没试的是先发一个短请求绑定会话（W 臂），验证约需 50 积分，agent 按决策分级定为不试（项目图 `question-5`）。

   「缓存异步生效」的出处是 BigModel 缓存文档里示例 curl 请求体中的示范知识库文本（`.llm/docs/_bigmodel_md/cn__guide__capabilities__cache.md`，「八、最佳实践」第 2 条），不在文档的说明正文里，作为依据偏弱。

实测记录（统计后续请求是否命中最新前缀）：

| 场景 | 变体 | 命中最新前缀 | 整段未命中 | 部分命中 |
| --- | --- | --- | --- | --- |
| 8 步工具循环，glm-5.3-flash，约 14k token，3 个会话 | 每请求随机 `x-session-id`（修复前） | 11/24 | 7 | 6 |
| 同上 | 随机 `x-session-id`，请求体按 ZCode（`metadata.user_id`、thinking 回放、末条缓存断点） | 12/24 | 4 | 8 |
| 同上 | 固定 `x-session-id`，请求体不变 | 24/24 | 0 | 0 |
| 同上 | 固定 `x-session-id`，请求体按 ZCode | 24/24 | 0 | 0 |
| 标题请求与第一步并发，glm-5.3-flash，只看第二步 | 标题用会话的 `x-session-id` | 9/11 | 2 | 0 |
| 同上 | 没有标题请求 | 11/11 | 0 | 0 |
| 标定（DSH 真实运行，每格 3 次），修复前（`4cb8799`） | glm-5.3 / glm-5.3-flash | 46/46、29/45 | 0、4 | 0、12 |
| 标定，只固定会话 id（`8a212cd` 的代码） | glm-5.3 / glm-5.3-flash | 42/42、41/46 | 0、2 | 0、3 |
| 标定，全部修改，标题另起会话 id（`0814234`） | glm-5.3 / glm-5.3-flash | 46/47、36/40 | 0、0 | 1、4 |

Flash 没命中的位置：修复前第二步 4 次、之后各步 12 次；固定会话 id 后第二步 5 次、之后 0 次；`0814234` 第二步 4 次、之后 0 次。GLM-5.3 在 `0814234` 那 1 次比最新前缀少 64 token。修复前的桌面版 L4 会话（GLM-5.3，2026-10-28）17 次后续请求里有 2 次整段未命中、3 次只命中更早的一步。

缓存断点 `cache_control`：BigModel 文档写的是隐式缓存，实测有无断点命中相同（上表第 1、2 行；另有 3 个两步对照）。为了与 ZCode 的请求形态一致，最后一条消息的最后一块带断点（zcode-api `applyAnthropicCacheControl`）。系统提示词没有按 ZCode 拆成 cli_prefix、stable、dynamic 三块（ZCode 后两块带断点）：coding-plan 下本通道只发一块，拆分要在方言里标出分界，命中不受影响，暂不做（§5.8 #14）。

请求归因（与缓存无关，按 ZCode）：请求体带 `metadata.user_id`，即 `{device_id, account_uuid: "", session_id}`，会话 id 与请求头相同（`createAnthropicRequestMetadataUserId` `ZWs` @4073127）。coding-plan 的归因头〔已实现 2026-10-28，m1-parity 第 7 项，`src/glm-llm/headers.ts` `RequestAttributionTracker`〕按 ZCode `createModelRequestAttributionHeaders`（3.16.3 `Vdt` @4065502，3.17.1 `Uft`）是 `x-request-id`、`x-zcode-session-type`、`x-zcode-trace-id`、`x-query-id`、`x-zcode-query-source`、`x-zcode-session-features`（3.17.1）、`x-session-id`：

- `x-request-id`：每次尝试新生成（`Gdt` @4067222），项目令牌被拒后的重发也换新；签名 VERIFY 梯子的重发在同一次尝试里，不换。
- `x-zcode-trace-id`：会话级。3.16.3 每个会话运行时建一个根追踪上下文（`vT` @1421911），回合与辅助请求的上下文都从它派生（`nS` @12816000、`Lw` @1422054），`traceId` 不变；委派子会话的运行时继承父会话的追踪上下文。本包按 DSH 会话保存 trace id（进程内，最多 256 个会话，最久未用的先出；出去后再来的会话拿新的 trace id），委派子会话沿 `parentSession` 取父会话的 trace id。
- `x-query-id`：回合级。3.16.3 用桌面输入的 id 当 query id（`O9` @14502646、`zzo` @13357726，`query_` 前缀在头里去掉）。本包以主步请求里最后一条用户输入消息（`role: 'user'`、`source.kind: 'user'`）的 id 为回合键，键变了就换新的 UUID。辅助请求（会话标题与压缩）不取回合键，沿用会话当前的 query id：3.16.3 的压缩上下文由回合上下文派生（`c3a` @13387356 用 `nS` 加 `querySource: "compact"`，`nS` 保留回合的 `queryId`）。DSH 的压缩请求只含系统头、被压缩的区段与它的指令，最近的尾段（默认预算的 16%）不在请求里（rc.3 compaction-basic `selectCompactableRange`、`buildSummarizationInput`），区段里最后一条用户输入通常属于更早的回合，所以不能拿它当回合键。会话还没有 query id 时辅助请求先建一个；只有会话标题建的 id 留给随后的第一步认领（DSH 让标题请求与第一步并发），压缩建的不认领（例如重启后的手动压缩），下一个用户输入另起新的 query id。
  - 空闲会话的手动压缩〔实读，m1-parity 评审第 3 轮〕：DSH 对空闲会话的手动压缩（`/compact`，rc.3 compaction-basic `compactNow`，compaction-basic:985）与压力压缩发出同样形状的请求，本包分不出两者，同样沿用上一回合的 query id。3.16.3 的 `/compact` 是一次独立输入：`zzo` @13357726 为它派生自己的 query id 交给 `executeManualCompact`（@13361998），`czo` @13308966 开一个回合再压缩。只有这一个压缩请求不同，下一个用户输入两边都开新的 query id；`48fed7e` 之前的实现结果相同。本包能否看出 DSH 当前没有回合在跑没有追查，能看出就可以给这种压缩开新的 query id。2026-10-29 桌面版对空闲会话手动 `/compact` 一次，正常完成（批次 L4），没有截包，头值没有看到。
- `x-zcode-session-type` 与 `x-zcode-query-source`：会话标题 `other` + `session_title`（`v2n` @13069774），压缩 `other` + `compact`（@13389086），委派子会话 `subagent` + `subagent`（`mDn` @13259914 把 `subagent_child` 映射为 `subagent`，`Y0n` @4065835），其余 `main` + `main_turn`。委派子会话由 `agents` 服务给出的会话头判定（`origin: 'subagent'`，§2.4a）；取不到会话头时按主会话处理。
- `x-zcode-session-features`〔已实现 2026-10-30，项目图 `zcode-3171-follow`，3.17.1 新增〕：会话特征，排在 `x-zcode-query-source` 与 `x-session-id` 之间（coding-plan 的头经 AI SDK 排序，线上落在 `x-zcode-query-source` 与 `x-zcode-session-type` 之间），只在有特征时发；值为去重排序后逗号连接的特征名，每项须匹配 `^[a-z0-9_]{1,64}$`，总长不超过 256（3.17.1 `GXs`）。3.17.1 的特征是会话级集合，每次模型调用读当时的集合（`LSa`），压缩与会话标题也带。本通道能出现两项：`tool_search_local`（某个 agent 步的工具里有 LocalToolSearch 与 DeferredToolCall，即这一步开启了 local 工具检索，3.17.1 `U1n`）与 `tool_search_called`（历史里有一次成功返回的 LocalToolSearch 调用，3.17.1 `vTo`、`bTo`）。`tool_search_native`、`workflow_auto`、`workflow_cmd`、`browser_use`、`computer_use` 在本通道没有触发条件，不会出现。集合按 DSH 会话存在 `RequestAttributionTracker` 里，与 trace id 同一份会话状态；与 3.17.1 的差异见 §4.8。
- start-plan 不变：每请求一个 trace id，不带 query id、query source 与会话特征。

设备 ID〔已实现 2026-10-29，m1-parity 第 9 项；定案 2026-10-28，用户选 A「照 ZCode 做：生成并写回 ~/.zcode」，项目图 `question-9`；`src/glm-llm/device-mid.ts`〕：`device_id` 是 ZCode 自己的 deviceMid，按 3.16.3 `ensureCliDeviceMid`（`Qro` @4062043）取得与保存：

- 状态文件是 `<base>/.zcode/v2/telemetry-state.json`，`<base>` 是去空白后非空的 `ZCODE_DATA_BASE_DIR`，否则是用户主目录（`CWs` @4062252；`~`、`~/` 展开，`NWs` @4064238）。
- 先不加锁读（`EWs` @4062442）：文件读不出、不是 JSON 对象（数组也不算）或 `deviceMid` 不是非空字符串，都算没有。
- 没有时在同目录的锁文件 `telemetry-state.lock` 里重读一次，仍没有就用 `crypto.randomUUID()` 生成，保留其他键写回（`RWs` @4063231、`PWs` @4062889）。锁用 `open(…, "wx")` 建，内容是 `{createdAt, pid}`；写回先 `mkdir -p`，把两空格缩进的 JSON 写进同目录的临时文件再 `rename`，失败时删掉临时文件。锁已存在时，不足 300 秒且属主记录读不出或属主进程还在（`process.kill(pid, 0)` 成功或报 `EPERM`），等 10 毫秒再试；否则删锁立即重试（`DWs` @4063741）。200 次后放弃。
- 任何一步失败都照用本进程生成的 id，3.16.3 不报错；结果按状态文件路径在进程内缓存，一个进程只生成一次。本包这时照样发送，在行健康的成功原因后注明「设备 ID 未能写入 ZCode 状态文件，本进程用临时 ID」（§2.5），状态不降级。
- 端点路由配置请求的 `X-Device-Mid` 按 3.16.3 `Kuc` @14468898 另读一次，只读不生成：去空白、只收可打印 ASCII、只缓存成功的读取，每次刷新配置都读（`Aui`）。模型请求先取 deviceMid 再走端点路由，刚写回的 id 在同一请求的配置请求里就能读到；写回失败时配置请求不带 `X-Device-Mid`，与 3.16.3 相同。
- 本机状态文件已有 deviceMid，正常运行不会写它。测试经 `ZCODE_DATA_BASE_DIR` 指向临时目录，不碰真实的 `~/.zcode`。

签名：修复签名之前的截包里，握手发往 `zcode.z.ai/api/paas/c1f3a7e2/v2/client`，每次 404，适配器在每个请求前都重试一次握手（约 90 毫秒），随后无签发送；端点路由把请求改写到 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages`（§4.4）。握手地址错是因为适配器把路由后的 URL 交给了签名层，已修，修复后握手返回 200（§4.3）。本节的标定、截包与重放都在修复之前，请求都是无签的〔推断〕。修复后的签名沙盒运行（`net-1793188413414`，GLM-5.3-Flash）第 1 步读 0、第 2 步命中最新前缀，只有一个会话，看不出签名对缓存位置有无影响。

### 4.5c 保留式思考〔已实现 2026-10-28〕

BigModel 的思考文档写明：保留式思考在 Coding Plan 端点默认开启，要把完整、未修改的 reasoning 原样传回，否则效果与缓存命中都会下降；交错思考加工具时，必须在返回工具结果时一并返回 reasoning（`.llm/docs/_bigmodel_md/cn__guide__capabilities__thinking-mode.md`）。ZCode 照此回放（3.16.3 `adapters/src/model/reasoning-history-normalization.ts`、`anthropic-reasoning-metadata.ts`）。本通道此前丢弃全部 reasoning。

- 实测〔2026-10-28，coding-plan〕：GLM 只在需要时思考（简单的工具调用请求没有 thinking 块）；thinking 块在 `content_block_start` 带空的 `signature` 字段，签名经 `signature_delta` 送达，24 个字符。端点不校验签名：正确签名、空签名、无签名字段、乱码签名、改过正文的原签名、外来正文加空签名，六种回放全部 200。
- 解码：每个 thinking 块的签名记进 DSH 的回放信封（`finish.replayState`，`{response: {kind: 'glm-zcode', version: 1, model}, blocks}`，每个发出的块一项，按首次出现的顺序；DSH 自带的 deepseek-messages 适配器用同一形状）。自 m1-parity 起每个响应（知道模型时）都带信封，信封里另记 ZCode 口径的用量，供下一次请求的 `max_tokens` 估算（§4.6）。开始事件上已有签名时也认，随后的 `signature_delta` 替换它（ZCode `anthropic-stream-compat` 的兼容处理）。助手消息由运行时组装时，信封随消息存进 `source.replayState`；不归本适配器的历史路由，运行时会先剥掉信封（rc.3 `LlmRuntime.forAdapter`）。
- 编码，按 ZCode 的历史归一化：
  - 信封可用（kind、version、模型与消息来源一致，块数与类型逐项对齐）且消息来自同一路由（provider 与模型都相同）时，reasoning 带原签名回放。
  - 带签名的 reasoning 只回给签发它的路由；换了模型就删掉（ZCode `removeCrossModelReasoning`：签名绑定模型）。
  - 没有签名的 reasoning（本次改动之前的历史、信封对不上、其他适配器的历史）以空签名回放（ZCode 用空签名表示保留的未签名 thinking）。
  - 空正文且无签名的 reasoning 是流里的空壳，丢弃；只剩 reasoning、没有文本与工具调用的助手消息整条丢弃；请求以助手轮结尾时，去掉结尾的 thinking 块（ZCode `removeReasoningOnlyAssistants`、`removeTrailingReasoning`）。
- 与 ZCode 的差异：ZCode 在端点以签名错误拒收时会删掉带签名的 reasoning 重试一次（`repairReasoningHistoryAfterSignatureRejection`）。端点实测不校验签名，本通道没有移植这一步；若出现点名 thinking 签名的 400，再移植。
- 对缓存与成本的影响：命中率不变，输入变多。缓存只存提示词，不存输出（§4.5b），所以上一步的 reasoning 在下一步是未命中的输入，再往后才进缓存。标定（每格 3 次）每次调用的平均值，只固定会话 id 时与加上回放后相比：GLM-5.3-Flash 未命中输入 2294 → 2582、命中输入 10218 → 12203、输出 567 → 702；GLM-5.3 未命中输入 987 → 937（它的 reasoning 很短）。Flash 的输出也变多了，积分的差别不能全算在回放上。BigModel 文档说保留式思考提高效果与命中率；命中率的说法与实测不符，效果在两个起步任务上看不出（两次都是 12/12 完成）。升级后已有会话的第一次请求，历史里多出 reasoning，前缀与上一次不同，会有一次未命中。
- 验证：解码与编码单测，其中一条用 rc.3 真实的 `BlockAssembler` 组装解码结果，再编码下一次请求，确认签名回到同一路由、换模型时删除（`tests/glm-transport.spec.ts`）；真网一次完整往返（真实适配器加 `BlockAssembler`，glm-5.3）：第二步发出 `thinking`（64 字符，24 字符签名）、`text`、`tool_use`，端点接受。

### 4.6 模型目录与思考档位

- 目录：`glm-5.3`（GLM-5.3）、`glm-5.3-flash`（GLM-5.3-Flash）；向 DSH 声明上下文窗口（下一条）与默认 `max_tokens` 32000（DSH 用它们做自己的压缩与预算，属于 DSH 控制的行为，§4.8）。线上 `model` 用官方大小写（§4.5）。
- 上下文窗口〔已实现 2026-11-05，项目图 `glm-context-window`；人：「就用512k，能改最好，写死也行」〕：`glm-llm` 行配置 `contextWindow`，缺省 512000，只收 128000 到 1000000 之间的整数（`src/glm-llm/models.ts` `GLM_CONTEXT_WINDOW`）。上限是目录的 `contextWindow`；下限是目录的单步输出上限 `maxOutputTokens.max`，也让 DSH compaction-basic 扣去默认 `max_tokens` 32000 与缺省余量 65536 之后仍有压缩预算（`resolveCompactSpec`，窗口小于两者之和时它对这条路由抛错）。向 DSH 声明的 `context.contextWindow` 取这个值，每个模型 id 都一样；coding-plan 主步的 `max_tokens` 按 `min(这个值, 目录的 contextWindow)` 算窗口（下面 `max_tokens` 一条）。不配置时声明与此前相同（512000）。不是范围内整数的值，Loader 不拒收整行（schema 是整数与任意值的并，`src/glm-llm/index.ts`），行激活时改用缺省 512000，激活状态与此后每次会话上报都降为部分生效、写出原值与原因（§2.5），控制台告警一次。
- ZCode 目录规则〔m1-parity，`src/glm-llm/models.ts` `zcodeModelRule`〕：取开源 3.16.2 树的内置目录（`reference/ZCode/config/provider/zcode-builtin.json`，revision 33）里 GLM-5.3 系的两条规则：模型规则 `.*glm-5\.3.*`（`contextWindow` 1,000,000，`maxOutputTokens.max` 128000，`reasoningLevel.values` `["low", "high", "max"]`）与 anthropic-messages 规则（选项映射 `thinking` enabled、`output_config.effort`）。3.16.3 按锚定、忽略大小写匹配（`wYt` @557708，调用 @563982），后命中的规则覆盖前面的 `.*glm-5.*`，`.*glm-5\.3-flash.*` 只改输入格式。3.16.3 实际运行的目录由桌面壳下发，pristine 副本里没有；若活动目录不同，这两条要跟着改（§4.8）。本机 3.17.2 安装目录（revision 43）里这两条与 revision 33 相同；3.17.1 的目录没有导出过，未核（`FACTS.md` §1）。
- 输入模态按模型如实声明（`src/glm-llm/models.ts` `GLM_MODELS`）：GLM-5.3 没有视觉塔，只声明文本；GLM-5.3-Flash 声明文本与图像〔用户提供的事实 2026-10-28〕。目录外的模型 id 只声明文本。此前两个模型都声明图像。只声明文本的路由上，DSH 在适配器之前把请求里的图片换成文字占位（`dsh-llm` `projectImagesForTextModel`：「[image omitted because this model accepts text only; attachment sha256:…]」），`read_image` 拒读（「… does not declare image input; switch to an image-capable model to read images」），会话控制器拒收用户附图。
- 思考：GLM-5.3 系强制思考；effort 三档 `low` / `high` / `max`，默认 `high`〔定案 2026-10-27，五档词汇 API 接受但 GLM 不用〕。
- `max_tokens`〔已实现 2026-10-28，m1-parity 第 5 项，定案 2026-10-28 用户选 B，项目图 `question-7`；`src/glm-llm/token-budget.ts`〕：coding-plan 对目录内的模型不再用 DSH 给的 `maxTokens`，按 3.16.3 取值：
  - agent 步：`resolveModelStepMaxOutputTokens`（`aUo` @13215830）。基线是目录的 `maxOutputTokens.max`（`resolveNormalRequestMaxOutputTokens` `VZ` @13215775，没有时 32000）；上下文窗口与当前用量估算都有效时，取 `min(基线, floor(窗口 − 估算 − 1000))`，这个值不大于 0 时取基线。
  - 压缩：`min(VZ(max), 20000, max)`（`p3a` @13395552，`I0t`），GLM-5.3 系为 20000。
  - 会话标题等辅助请求：`min(5000, max)`（`auxiliaryModelOptions` `PP` @7759001），为 5000。
  - 当前用量估算（`estimateCurrentContextUsage` `uzo` @13313841）：从后往前找第一条带服务端用量的助手消息作基线（`CDn` @13313415、`d5o` @13260048）；用量按 `Xgt` @4979924 换算（输入取 `input`，否则 `total − output`，否则缓存读写之和；输出大于 0 时上下文用量为输入加输出，否则取不小于输入的 `total`）；有上下文用量时只估算基线之后的消息，没有时从基线那条起估算；没有基线时整段估算。估算按 `estimateMessageTokens`（`TP` @5067698）：每条消息的块文本（文本与 reasoning 原样，图片记 `[Attached <类型>]`）以换行连接，加每个工具调用的名称与输入 JSON，三个字符一 token（`ere` @814022），向上取整；系统消息也计入。
  - 用量基线的来源：ZCode 从会话条目读用量。DSH 的请求不带历史响应的用量，本包的解码器在每个响应的回放信封（`finish.replayState.response`）里记下 ZCode 口径的用量 `usage: {input, output, total, cache: {read, write}}`（`input` 含缓存读写，与 AI SDK Anthropic provider 的口径相同，`EZr` @3549441），信封 `version` 仍为 1；DSH 组装助手消息时把信封存进 `source.replayState`，下一次请求从这里读。为此信封改为只要知道模型就发，不再只在有 reasoning 时发（§4.5c）。
  - 与 3.16.3 的差异（§4.8）：只有本适配器产出、运行时仍把回放状态交回本适配器的助手消息有基线，别的路由的历史与 m1-parity 之前的历史只能整段估算；ZCode 按会话条目与消息对齐取下标，DSH 只有一份消息列表，按它取；工具调用参数先解析再序列化，解析失败计 `{}`，工具结果计其文本块与图片占位（ZCode 的消息模型与 DSH 块不完全一一对应）。
  - 主步的窗口（有意的偏离，2026-11-05，项目图 `glm-context-window`）：本包取 `min(行配置的上下文窗口, 目录的 1,000,000)`，缺省为 512,000。对照的版本是基线 3.17.1：pristine 3.17.1 包的主步（`runModelBackedTurnStepImpl` `W9a`）把模型的 `properties.contextWindow` 交给 `resolveModelStepMaxOutputTokens`（`P9o`），基线 `resolveNormalRequestMaxOutputTokens`（`LY`，缺省 `Rqa` 32000），公式与 3.16.3 `aUo` 相同，窗口是目录值；3.17.1 运行时 GLM-5.3 的目录值未核到（pristine 包里没有这条规则，3.17.1 的目录没有导出；revision 33 与本机 3.17.2 的 revision 43 都是 1,000,000，`FACTS.md` §1）。原因：人定窗口 512k，DSH 按声明的窗口压缩，单步输出预算与压缩于是按同一个窗口算；此前请求侧按 1,000,000 算、DSH 按 512,000 先压缩，主步实际恒为 128000。差别：缺省下用量估算超过 383,000（512,000 − 128,000 − 1000）时主步的 `max_tokens` 小于 128000，同样用量下 3.17.1 仍是 128000；用量估算达到 511,000（窗口减 1000）及以上时取基线 128000（`aUo` 的规则）。配成 1,000,000 时与 3.16.3、3.17.1 的取值相同。压缩与辅助请求的上限不受窗口影响。

### 4.6a 用量块

DSH 的 `TokenUsage` 各计数互不重叠：`inputTokens` 只算未命中缓存的输入，缓存读写分别记在 `cacheReadTokens` / `cacheWriteTokens`（官方类型注释）。Anthropic 流的 `message_start` 带 `input_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`，`message_delta` 只带 `output_tokens`。

曾有缺陷：解码器在 `message_delta` 上发出 `{inputTokens: 0, outputTokens}`，下游取最后一个用量块，于是输入计为 0；缓存读写从未解析。积分口径依赖这三项（`FACTS.md` §2.4）。现在整个流只在 `finish` 前发一个合并后的用量块，含 `cacheReadTokens` / `cacheWriteTokens`〔已实现 2026-10-27；真网冒烟实测 `inputTokens: 24, outputTokens: 3, cacheReadTokens: 0`〕。此前写入的用量流水中输入计数均为 0，不能用于积分统计。那版解码器的用量块没有 `totalTokens`，修正后的总带它；用量面板据此（provider `glm-zcode`、输入 0、无 `totalTokens`）识别修正前的记录，不计入积分，只报条数（2026-10-28，`ORCHESTRATION.md` §11.2）。

### 4.7 额度数据〔已实现 2026-10-31，项目图 `m6-quota-read`；真机读取的核对在 `m6-l4`〕

通道负责取数，编排层负责展示：5 小时窗口与每周窗口的已用比例、MCP 工具调用窗口、预计何时用完、登录是否被服务端拒绝。数据经计价服务（`glmHournessPricing`，`glm-login` 行提供）的 `quota` 成员交给编排层；契约与措辞函数在 `src/shared/quota.ts`，取数与预估只在 GLM 包（`src/glm-llm/`）。计算口径见 `ORCHESTRATION.md` §11 与 `FACTS.md` §2.4。ZCode 3.17.1 怎么取、本包照做到哪里、哪几处不同，见 §4.8 与 `FACTS.md` §1。

- 请求（`src/glm-llm/quota.ts` `createQuotaReader`）：`GET https://bigmodel.cn/api/monitor/usage/quota/limit`（origin 常量 `BIGMODEL_API_ORIGIN` 在 `zcode-wire.ts`，项目令牌铸造用同一个）。头恰好两个：`authorization`，值是项目令牌原样（不加 `Bearer `）；`x-request-id`，每次读取新生成的 UUID。不加 ZCode 的身份头，不读环境变量覆盖地址，15 秒超时，不重试；401 只是一个失败原因，不重铸令牌、不在同一次读取里重发，所以额度读取不会发出 3.17.1 不会发的 `POST …/access_tokens`。
- 凭证：`ZcodeAdapter.usageAuthorization()`。`plan` 为 `start-plan` 时抛 `start-plan`，不读凭证、不发任何请求；没有凭证抛 `not-logged-in`；`coding-plan` 时返回项目令牌，与模型请求用同一个适配器的缓存，不接受被拒指纹（3.17.1 的额度路径不核对账号作用域）。令牌铸不出来时抛 `zcode-wire.ts` 的 `PROJECT_TOKEN_CODES` 码或 ZCode 的凭证缺失原文。
- 套餐：`glm-login` 行的适配器按这一行自己的 `plan` 构造（`LoginConfig.plan`，行导出 `Config`，插件管理器里是真开关）。两行的 `plan` 必须相同，行之间没有读配置的契约；设得不同时，`/glm-status` 凭证行写出的是这一行用的套餐。
- 读取时机：GLM 包没有定时器。读取在有调用方时才开始：`/glm-status`、经 `quota` 成员调用的编排层（`/hourness`、循环板）。距上一次读取开始不满 60 秒不再发（成功或失败都算），进行中的读取由并发的调用方共用；流水里有晚于上一次读取开始的上游限额记录时越过这 60 秒。`quota({read: false})` 不发请求，只给流水末尾的最近读数与登录状态。命令至多等 3 秒（`waitMs`），超时用上一次读数并写「正在读取，稍后再看」，读取在后台继续至多 15 秒。
- 结果与原因码（每类一个，写进流水与行健康；读不到从不让命令失败，也不改变任何请求）：`not-logged-in`、`start-plan`（不进流水）、`credential:<码>`、`network`、`timeout`、`http-401`、`http-<码>`、`too-large`（响应超过 256 KiB）、`envelope:<code>`（不是 JSON 或信封不成功）、`no-windows`（成功但没有可用的行，含数据形状认不出）。控制台每种原因告警一次，未登录除外：它是新装的常态，由额度一节和行健康说，控制台只说失败。
- 解析（`src/glm-llm/quota-parse.ts`，与 3.17.1 `jD`、`QD` 相同的取舍加上限）：`data.limits` 至多取前 32 行，`type` 须是 1–64 个字符的非空字符串，只留数字字段（`percentage` 大于 100 按 100 保留、负数丢掉这个字段，`nextResetTime` 小于 10^12 按秒、之后须落在读取时刻前 1 天到后 45 天内），`unit` 与 `usageDetails` 不留；没有 `percentage` 与 `remaining` 的行丢弃并计数。窗口按「离重置还有多久」命名：`TIME_LIMIT` 是 MCP；有重置时刻的 `TOKENS_LIMIT` 与 `CREDIT_LIMIT`（积分套餐的真实读取返回的是 `CREDIT_LIMIT`，两行都是，`FACTS.md` §2.4）里，5 小时 2 分钟以内的是 5 小时候选，其余是每周候选，各至多一个时命名为 5 小时与每周，其余情形不猜，各自是「额度窗口（HH:MM 重置）」；没有重置时刻的行（还没开始计时的 5 小时窗口没有）是「额度窗口」。
- 额度流水（`src/glm-llm/quota-journal.ts`，`<用户级目录>/audit/quota.jsonl`，`credentialHome(config.home)` 解析，两行写同一个文件）：每行一个 JSON，只追加。四种记录：`reading`（解析后的行、丢弃数与丢弃行的键名，不存原始响应与窗口名）、`failure`（原因码，同一原因 10 分钟一条）、`upstream-limit`、`login-rejected`。都不含令牌、Key 与请求头。写失败不抛，每种失败控制台告警一次，记录仍留在本进程的内存里。显示时读文件末尾至多 256 KiB，跳过不合法的行并计数（写进行健康），文件的大小与修改时刻没变就不重读。
- 上游限额（`ZcodeAdapter.stream`，`src/glm-llm/account-signals.ts`）：模型请求回 429、正文是 `{"error": {"code": …, "message": …}}` 且 `code` 为 1308、1310、1316–1321 时追加 `upstream-limit`；消息里第一个 `YYYY-MM-DD HH:MM[:SS]` 按 UTC+8 读，落在现在到 8 天之内才写 `until`。抛出的错误、重试行为不变。额度一节在有晚于最近读数的这类记录时第一行写「额度已用完（服务端 1308）」，有恢复时刻时加「预计 HH:MM 恢复」。这一项不是 ZCode 的行为，正文形状经 ultra 网关时是否相同未核实（V4）。
- 预估（`src/glm-llm/quota-projection.ts`，纯函数，积分规则仍只在 `credits.ts`，经 `rateShareAt`）：速度按每全价小时涨多少个百分点算，非高峰的一小时只计半个。取第一个可用的：同一期里离本次 10–90 分钟的最早一次读数（比例下降说明窗口已刷新，不用）；5 小时与每周窗口自开始起的平均（周额度的平均含夜间，偏低，行里注明）。之后按分钟累加，在重置前到 100 报「预计 HH:MM 用完」（向下取整到分钟），否则报「到重置时约 N%」；没有重置时刻只在 7 天内找；已用完、最近没有消耗、读数不足、即将重置各有原因。MCP 窗口和不认识的类型不预估。非高峰半价计入额度是推断（V5），不成立时速度最多差一倍，预估行写明依据。
- 登录状态（`QuotaView.login`）：`absent`（凭证文件不存在、为空——`/glm-logout` 写空串、解不开或没有登录令牌；解不开时行健康另写一句）、`rejected`、`ok`。适配器在三种情形写 `login-rejected`，同一路径与同一登录 10 分钟一条：模型请求带被拒指纹重铸令牌、重试之后仍被拒（`path: model`）；定位 Key 或铸造令牌时 PAT 平面回 401 或 403（`project_token_http_401`、`project_token_http_403`，在 `projectToken` 里认码，原错误原样抛出）；登录令牌为空（`project_token_login_required`）；后两种的 `path` 是 `mint`。网络错误、超时、429、5xx、账号或项目状态、额度路径的 401 都不算。记录带登录令牌的指纹（去掉 `Bearer ` 前缀与空白后 SHA-256 的前 16 位十六进制）。状态为 `rejected`：最新一条 `login-rejected` 的指纹等于当前凭证里登录令牌的指纹，且晚于最新一条成功读数。项目 Key 的位置记录会写回同一个凭证文件，所以不按文件的修改时刻判重新登录，按指纹判；凭证文件的大小与修改时刻没变就不解密。
- `/glm-status`（`login-row.ts`）：凭证行（设置页解析它，格式不变）、空行、高峰行、额度一段、空行、行健康表。高峰行的「到几点」用 `nextPeakChange`，时刻按本机时区写（`formatMoment`，高峰的判定仍按 UTC+8）。`glm-login` 行健康的说明在原文后加「额度：读于 HH:MM」或「额度：读不到（原因码）」，登录被拒时再加「登录被拒」；额度从不使行降级。`LoginConfig` 的 `now` 与 `offsetMinutes` 只给测试，不在 `Config` 里。
- 循环板条目：`src/glm-llm/loop-defaults.ts` 导出冻结的四条（`glm:peak-reminder`、`glm:quota-on-command`、`glm:quota-low`、`glm:login-rejected`），经计价服务的 `loopDefaults` 交出，只是数据；GLM 包自己做的两条（高峰提醒、看状态时读额度）只被列出。`creditPricing` 常量仍不带 `quota` 与 `loopDefaults`，标定与探针用它。
- 不做：不按额度或积分拦截、推迟、限速、换模型或换套餐，本节没有在 `tools/pre-execute` 与 `agent/pre-step` 上注册任何监听器。
- 指标事件〔已实现 2026-11-05，项目图 `m6-metrics-events`〕（M6 设计 §14.2，指标设计 §3.5、§4.5）：编排层包的指标行在时（服务 `glmHournessMetrics`），`glm-llm`、`glm-login`、`glm-prompt` 三行经 `src/glm-llm/metrics.ts` 的 `glmMetricSink`（每个事件经 `emitMetric` 按名字找服务，`by: glm`）交四种事件；服务不在时什么都不交、不告警，服务抛错也不改变读取、请求、抛出的错误与提醒。`glm.quota-read`：读取器每发起一次读取在它结束时交一条，`ok`、失败的原因码 `why`（不是 id 形状的，例如 ZCode 的凭证缺失原文，取冒号前的前缀加 `:other`，即 `credential:other`）、耗时 `ms`、发起方 `by`（`command` 或 `service`）、`windows`（窗口名到已用百分比的整数，名字重复的第二个起加 `-2`、`-3`，失败时为空）、`dropped`；60 秒内的复用、`read: false` 与加入进行中的读取都不交，体验套餐不发请求，也不交。发起方与归属由 `QuotaRequest.asker`（`src/shared/quota.ts`）给：`/glm-status` 与 `/hourness` 写 `{kind: 'command', sessionId}`，循环板写 `{kind: 'service', dir}`，`dir` 是它这次的事件要去的项目；加入的读取沿用发起它的那一方；没有 `asker` 的读取算服务的、没有项目，指标行只计数不写。`glm.upstream-limit`（`code`、`hasReset`）与 `glm.login-rejected`（`path`，`status` 或 `code`，不带指纹）由适配器写完对应的额度流水记录之后交，去重与流水相同（登录被拒同一路径同一登录 10 分钟一条）；模型请求遇到的归请求的会话，额度读取铸令牌时被拒的归读取的发起方。`glm.peak-reminder`：每发出一条高峰提醒交一条，`window`、`mode`（档位，读不到时 `none` 并带 `note`）、`cap`（正文写了的子 agent 并发上限），归 agent 的会话与工作目录。事件里只有码、数与窗口名，没有令牌、指纹、请求头与响应正文（L2：`tests/glm-metrics.spec.ts`）。
- 未核实：V4、V5、V6 命令处理函数等 3 秒在客户端一侧不被打断、V8 登录被拒的三种判据在真实的登录失效时够用。V3 已核（2026-11-01 一次真实读取，`FACTS.md` §2.4）：积分套餐的读数是两行 `CREDIT_LIMIT`（5 小时与每周），不是 `TOKENS_LIMIT`，命名函数已认两种类型；没有 `TIME_LIMIT` 行。V7 已核（`FACTS.md` §1）。

### 4.8 与 ZCode 的一致性与已知差异〔m1-parity 2026-10-28 按 3.16.3；2026-10-30 跟到 3.17.1〕

验收口径〔定案 2026-10-28，用户：「看量或者扣减看不出来的。你就代码级别一样就行」〕：coding-plan 请求中本包能控制的部分与基线代码级一致（2026-10-30 起为 3.17.1），不做额度或扣减测量。

已一致（细节与偏移见各节）：模型请求凭证是项目令牌，拿不到即失败（§4.1）；配置请求只带 `x-api-key-id`，凭证不再含 secret（§4.1、§4.4）；`X-Title` 与 User-Agent（§4.2）；头的组装链与线上顺序（§4.3）；归因头（§4.5b）；`metadata.user_id` 的 deviceMid：读取，缺失时生成并在锁内写回 ZCode 状态文件（§4.5b）；请求体键序、`model` 大小写、`thinking` 与 `output_config`、会话标题非流式（§4.5）；`max_tokens` 规则（§4.6），只有主步的窗口是有意的偏离：取 `min(行配置的上下文窗口, 目录窗口)`，3.17.1 取目录窗口（§4.6，人定 512k，2026-11-05）。3.17.1 跟进补上的：版本号（§4.2）、`x-zcode-session-features`（§4.5b）、项目令牌请求失败的细分错误码（§4.1）。额度读取（§4.7，`m6-quota-read`）已一致：地址与 15 秒超时、头恰好 `authorization`（项目令牌原样）与 `x-request-id`（每次新的 UUID）、不加 ZCode 身份头、失败只是一个原因（不重试，401 不重铸）、读取结果 60 秒内复用；偏移按 3.17.1，见 `FACTS.md` §1。

额度读取的已知差异〔2026-10-31，项目图 `m6-quota-read`〕：

- 项目令牌缓存一行一份：`glm-login` 与 `glm-llm` 两行的适配器各有一份缓存，一个令牌有效期内至多多铸造一次；ZCode 一个进程一份缓存。理由：两行没有共享对象的契约，为此加一个服务多一套提供与撤销。
- 不做读额度前的订阅核验：ZCode 的一条路径在读额度之前先核验订阅，结果不改变本包显示的内容，多一个 OAuth 请求。
- start-plan 不读额度：体验套餐没有 5 小时与周额度，ZCode 用套餐 JWT 照读；本包不发请求，额度一节说明原因。
- 模型请求 429 的 1308 等上游限额记录与展示：ZCode 没有，是本项目加的展示；正文形状经 ultra 网关未核实（§4.7 的 V4）。
- 读取时机：ZCode 在设置页挂载与刷新时读，聊天输入框旁的用量条在打开时触发刷新，3.17.1 的渲染层没有定时读额度（V7，`FACTS.md` §1）；本包在命令时读，没有定时器；循环板的 `glm:quota-low` 条目写明只在 GLM 有新用量、距上次读数满 15 分钟时才经 `quota` 成员读（§4.7）。
- 登录被拒的判定：ZCode 没有，是本项目加的（§4.7 的 V8）。

3.17.1 跟进的已知差异〔2026-10-30，项目图 `zcode-3171-follow`〕：

- 会话特征只存在本进程：3.17.1 还把集合随会话持久化。桌面版重启或会话被挤出 256 个会话的缓存之后，这个会话下一个 agent 步之前的辅助请求（标题、压缩）不带 `tool_search_local`；`tool_search_called` 只在那次调用还在可见历史里时才能重新推出（§4.5b）。DSH 的标题请求与第一步并发，可能早于第一步记下特征；3.17.1 账号模式在回合完成后才发标题。
- start-plan 不发 `x-zcode-session-features`，归因保持原样。
- start-plan 的系统提示：文本已跟到 3.17.1（`cliPrefix`、身份节、Dynamic Behavior、Context management，`src/glm-llm/zcode-system.ts` 与 `reference/zcode-api` 的 sidecar 同步改）；结构没跟。3.17.1 把环境、模型行与当前日期移到 meta_user 附件，环境节的措辞也改了（§5.3 ③），当前日期前缀换了写法；本包的 start-plan 重构仍是三块 system，环境与模型行留在第 3 块，桌面上下文、环境与当前日期前缀保持 3.16.3 的文本。start-plan 没有额度，不能实测。

只由 DSH 控制、本包改不了的差异：

- 会话标题的时机与提示词：3.16.3 在回合开始时尝试，账号模式推迟到回合完成后发（@13367458、@13370395），提示词是 `y4a`（首条输入截 1200 字符）；DSH 与第一步并发发标题，提示词是 DSH 的。
- 压缩的触发时机与提示词：由 DSH 与方言（§5.6）决定。
- 向 DSH 声明的上下文窗口（行配置，缺省 512,000）与默认 `max_tokens` 32000：DSH 用它们做自己的预算与压缩。声明的 `max_tokens` 不进线上请求；声明的窗口经 `min` 进主步的 `max_tokens`（§4.6）。
- `temperature`：DSH 给就按 AI SDK 的位置发，3.16.3 的这类请求不设温度。
- 工具集与系统提示内容：由 DSH 与方言决定（§5）。
- 回合边界：DSH 不给回合 id，goal 轮次或不以用户输入消息开头的跟进沿用上一回合的 query id（3.16.3 每个输入换新）；DSH 对空闲会话的手动压缩也沿用上一回合的 query id，3.16.3 的 `/compact` 是独立输入，有自己的 query id；3.16.3 的 query id 是桌面命令 id，本包是 UUID，结构相同、值域不同；3.16.3 的 `workflow_child` 来源在 DSH 里没有对应的会话标记，不映射；`agents` 服务取不到会话头时按主会话处理（§4.5b）。

本包的近似（输入不全时取最接近的做法）：

- `max_tokens` 的用量基线来自本适配器写在回放信封里的用量；别的路由、m1-parity 之前的历史只能整段估算；ZCode 消息模型与 DSH 块的对应是近似（§4.6）。
- 项目令牌被拒的判断里，3.16.3 错误解析器给出的「provider 错误码」按信封的 `code`、`error.code`、`error.message` 近似（§4.1）。
- 压缩的档位：3.16.3 取会话的模型选择，DSH 的压缩请求不带档位，本包取会话最近一个主步的档位；会话在本进程里还没有主步时取压缩请求自己的档位，缺省 `high`（§4.5）。

十项之外、仍与 3.16.3 不同的地方（不在 m1-parity 范围，留给用户决定）：

- 签名的三处既有偏离（§4.3）：握手失败 60 秒冷却、两次 VERIFY 后永久旁路、凭证不可解析或缺会话 id 或 PoW 失败时放行（3.16.3 抛错）。
- 系统提示按 cli_prefix / stable / dynamic 拆三块并带断点（§5.8 第 14 项）。
- 工具定义的 `defer_loading`：3.16.3 开启工具检索时给延迟工具加 `defer_loading: true`（`EVs` @4101395），本包不发。
- 桌面 API 客户端（`Wt`）在项目令牌请求上可能附加的默认头，没有核到底；本包按 3.16.3 传入的字面头发送。
- 3.16.3 有代理或自定义 CA 时网络层改走 `node:https`，头变成小写字母序；本包始终走 DSH 运行时的 fetch。
- OAuth 访问令牌刷新：桌面 `index.js` 里没有找到刷新调用，两边都在 OAuth 令牌失效后需要重新登录；本包拿不到项目令牌时整条通道停用。
- 3.16.3 实际运行的目录由桌面壳下发，pristine 副本里没有；本包按开源 revision 33 的 GLM-5.3 规则实现（§4.6）。
- start-plan：没有额度，无法验证，只改了身份级的部分（`X-Title`、设备 ID 来源、凭证不再含 secret、没有 JWT 时失败）；请求头形态、请求体、归因保持原样。

## 5. 方言

### 5.1 原则〔定案〕

- 行为习惯类内容逐字镜像 ZCode 3.17.1（训练分布；2026-10-30 起，此前为 3.16.3）。
- 宿主事实类断言（界面呈现、权限语义、shell、路径、记忆位置）必须与 DSH 实际行为一致；对不上就按 DSH 实况改写，措辞贴原句形态。
- start-plan 档：除 agentsMd 节外，系统提示词与 ZCode 逐字节一致。
- coding-plan 档：安全声明段替换为用户的工程环境声明，其余按 §5.3 本地化。
- 只作用于 GLM 会话（§3），非 GLM 会话零影响。

### 5.2 提示词节

`system-prompt/assemble` 瀑布上以 `prepend` 注册的监听器在 `next()` 之后读取路由变量并改写节列表（rc.3 唯一可行的接缝）〔实读〕。

表按 GLM 请求里的实际渲染次序列出〔实读 `src/glm-prompt/assembly.ts` `rewriteDialectSections`；L3 探针 2026-10-29 `glm` 场景的标题次序 `# Harness` → `# Reporting Depth` → `# Session-specific guidance` → `# Memory` → `# Context management` → DSH 的节 → `# Workspace rules`，该场景没有配 `env`；这是 3.16.3 文本时的实测，2026-10-30 起 `# Harness` 之后先是没有标题的 Dynamic Behavior，3.17.1 文本的探针由 `zcode-3171-follow` 跑〕。改写把 CLI 前缀放在最前，在 DSH 身份节原来的位置换上 ZCode 身份节（rc.3 的 `HARNESS_IDENTITY` 是 -1000，DSH 各节里最小，所以它本来就是第一节），其余方言节按 `dialectSections()` 数组的先后插在身份节之后，DSH 的其余节保持原有次序排在后面。`dialectSections()` 给每节写的 `order`（-1001、-1000、-950、-900、2360、2300、2350、2400）改写时不读，不决定次序；按 ZCode 次序重排、用上或删掉 `order` 归清点报告 §7 第 2 条（项目图 `question-31`）。

| 次序 | 节 | 档位与条件 |
| --- | --- | --- |
| 1 | `glm:cli-prefix` | 两档 |
| 2 | `harness:identity`（同名替换 DSH 身份节） | 两档；安全声明按档位二选一 |
| 3 | `glm:dynamic-behavior` | coding-plan；3.17.1 原文，没有标题（§5.3） |
| 4 | `glm:environment` | coding-plan，需配置 `env`；工作目录取会话头（§5.3 ③） |
| 5 | `glm:reporting-depth`（汇报细度，标题 `# Reporting Depth`；原名 `glm:persona`） | 两档；常设档是人最近一次说定的（记忆行服务的 `depth`，agent 创建时读一次，同一会话不变），没有时用配置的 `reportingDepth` |
| 6 | `glm:session-guidance` | coding-plan |
| 7 | `glm:memory` | coding-plan；只在本次组装 `next()` 返回的工具里有全部三个记忆工具时出现，工具里还有 `lessons_query` 时末尾多一句经验板块（§5.3 ⑧） |
| 8 | `glm:context-management` | coding-plan |
| 9 | DSH 的其余节（`tool:pwsh`、`tool:read` 等） | 次序不变 |
| 最后 | `glm:guard`（guard 行添加） | 所有路由；列出生效的规则，`interpolate: false`（`ORCHESTRATION.md` §6.1） |

start-plan 档只有第 1、2、5 节，后接 DSH 的节与 `glm:guard`。

`glm:guard` 不属于方言：由 guard 行在自己的组装监听器里追加，2026-10-29 起在所有路由上出现（`ORCHESTRATION.md` §6.2），文本是本项目的（不在镜像文件里，不属于逐字声明）。两个 prepend 监听器谁在外层都一样，这一节总在最后：guard 在外层时追加在方言改写之后；guard 在内层时方言改写保留其余节的顺序，只把方言节插到身份节之后。规则只随会话目录变化，会话目录不可变，所以每步的系统提示词不变，不影响提示词缓存。声明里的工具名按模型看到的写：方言接管这个 agent 时是 `Write`/`Edit`，与之前逐字相同；方言没有接管（`glm-prompt` 禁用或没装上，或者不是 GLM 路由）时是原生的 `write`/`edit`（`ORCHESTRATION.md` §6.1）。

`hourness:main-agent`〔2026-10-30，M3 第 3 步〕：设计行只给主 Agent 会话加的一节（角色与边界，加怎样与人说话的指南和换词表，`interpolate: false`，`src/design/identity.ts`；四种问法的写法在 `propose_to_human` 的工具说明里），不在上表里，因为普通会话没有它。位置由 `src/guard/sections.ts` 的 `insertHournessSection` 定：有 `glm:guard` 时插在它之前，没有时放最后，同名的节已在时原地替换。`DECLARATION_SECTION`（`glm:guard`）也在这个文件里，guard 与设计行导入同一个常量。两个监听器的内外次序和方言改写（只换身份节、其余节保持原有先后）都不改变结果：GLM 路由上这一节在方言节之后、`glm:guard` 之前，非 GLM 路由上在 `glm:guard` 之前（L3 场景 `glm-design-wish-idle`、`non-glm-design-wish-idle`、`glm-design-main`、`non-glm-design-main` 实测，`ROADMAP.md` 核实清单第 16 项）。节名前缀 `hourness:` 是编排层的，节名不进模型。

`hourness:output-style`〔2026-11-01，`m3-main-persona`〕：设计行只给主 Agent 会话加的另一节，内容是人的人设（设计行配置 `persona: {name, text}`，`src/design/persona.ts`，`ORCHESTRATION.md` §3.1）：`# Output Style: <name>`、一个换行、人写的文字（去掉首尾空白，标题与文字之间没有空行，照 3.17.1 的 `n8o`）、一个空行、插件自己的一句范围说明（人设只管对人说的话，不管工具调用里的文字和写进文件的东西），`interpolate: false`。`text` 为空、超过 4,000 码点或读不懂时不加，行健康说明原因；`name` 规整成一行，至多 40 码点。普通会话、子会话、审查者和主 Agent 移走之后的原会话没有这一节。节名是两个包之间的契约常量 `OUTPUT_STYLE_SECTION`（`src/shared/output-style.ts`，两个包都编进去，`tests/contracts.spec.ts` 钉住两个产物里是同一个字符串）。位置：设计行不带 `prepend` 的监听器加这一节，在最里层，所以方言的 `prepend` 监听器不论装在设计行之前还是之后，`next()` 之后都看得到它。非 GLM 路由上它原样留在 DSH 的节之后、`hourness:main-agent` 与 `glm:guard` 之前。GLM 路由上方言识别这一节：身份节的开头句换成 3.17.1 的 `pBa`（`IDENTITY_OPENING_WITH_STYLE`，没有这一节时仍是 `dBa`，即 `IDENTITY_OPENING_PLAIN`），这一节从原位置取出，放进方言节里 `glm:context-management` 之前，也就是 Environment、会话指引、Memory 与汇报细度各节之后；start-plan 档没有 `glm:context-management`，放在最后一个方言节之后。`installDialect` 在安装时把两份身份节（有无风格）都算好，每一步按组装里有没有这一节选一份；没有这一节时与没有人设的组装逐字相同。3.17.1 没有这样的一节（风格正文是主回合的上下文条目，另有每回合的提醒），本项目三处不跟，见 `docs/reference/zcode-verbatim.md` 的「不跟 3.17.1 的地方」；编排方同意之前本步不合入 main。L2 `tests/design-persona.spec.ts`，L3 场景 `glm-design-persona`、`non-glm-design-persona`。

`reportingDepth`〔2026-11-01，`m3-main-persona`〕：`glm-prompt` 行的汇报细度配置原名 `persona`，与人设不是一回事，改名 `reportingDepth`（`concise`、`balanced`、`detailed`）；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts`，节名 `glm:persona` 改 `glm:reporting-depth`，模型看到的 `# Reporting Depth` 正文一个字没改。旧键 `persona` 照读：cordis 在激活前用导出的 `Config` 规整配置，本仓库的 schemastery 在值缺席时填默认值，所以两个键都不带默认值，规整之后哪个键在就是人写了哪个键；`apply` 取 `reportingDepth`，没有再取 `persona`，再没有取 `balanced`。只有 `persona` 时告警一次并在行健康里写「glm-prompt 的 persona 已改名为 reportingDepth，这次按旧键生效」；两个键都有且不同时用 `reportingDepth`，告警一次；都有且相同时不告警，行健康写「旧键 persona 可以删掉」。说明写在 GLM 路由的会话报告里（会话报告会盖掉激活说明），非 GLM 路由的步骤照旧。用户桌面版 profile 的 `glm-prompt` 行写着 `persona: balanced`，本仓库不改用户 profile，由上面的读法接住。L2 `tests/glm-reporting-depth.spec.ts`。
原先的 `glm:deferred-tools` 节（order 2500）已删除：ZCode 的系统提示词里没有 deferred 声明段，deferred 名单以 `<system-reminder>` 公告递送（§5.7）。

### 5.2a 注入文字的消融结论〔实测 2026-11-06–07，项目图 `ablation`〕

六臂 × 两档模型（`glm-5.3`、`glm-5.3-flash`）× 三个标定任务（`bugfix-csv-quotes`、`bugfix-shell-redirect`、`feature-parse-duration`），有效 176 次，另有 6 次上游断开不计入。臂的定义见 `.agents/tasks/ablation/plan.md` §2；每格次数与每臂每档表在 `results.md`，有效次数、Wilson 区间与检验在 `report-tables.md`；口径同 `ORCHESTRATION.md` §10.5.1。p 值是分层置换检验（同任务同模型内换臂标签，10,000 次）与 Fisher 双侧，未做多重比较校正；每臂约 28–30 次有效，只有中到大的效应测得出，p 值是提示不是定论。事后扫事件流：182 次、2,119 次调用，圈禁零拦下、无圈外执行，消融开关无异常记录（逐臂是否恰好改到该臂那几段由 L3 场景 `ablation-A0` 到 `ablation-A5` 核对）。`bugfix-shell-redirect` 的失败（含被取代的试次，28 次）里 26 次只卡同一项（`x=>y` 的比较箭头被误判为重定向），各臂含 A0 一致，是这道题的难度不是臂的差异。以下是建议；注入文字本身一律不动，去留等人看过再定（节点验收 3）。

| 段 | 臂（有效次数） | 数据（对 A0） | 结论 |
| --- | --- | --- | --- |
| `# Reporting Depth`（`glm:reporting-depth`） | A1，两档 28 | 完成 24/28 对 29/31（p=0.409）；最终回复字数 +24%（p<0.001）；工具失败与拦截各 +0.29 次/运行（均 p=0.009） | **保留**。去掉后回复显著变长，工具失败与拦截上升，这一节在管汇报粒度；完成下降未达显著。这是较薄的结论之一：flash 档的 shell-redirect 只有 3 次有效（断开 2）。 |
| `# Workspace rules`（`glm:guard`）缩成一句、拦截不变 | A2，两档 30 | 完成 25/30 对 29/31（p=0.255）；步数 +12%（p=0.085）；积分 +10%（p=0.177）；拦截不变（+0.18，p=0.141） | **保留但可缩**（question-31 C 的方向）。行为由拦截兜住时，文本缩到一句没有测得的显著代价；整节去掉没有测过，shell-redirect 5/10 对 9/11（p=0.183）是弱信号，不要全删。 |
| 15 个图工具与 3 个记忆工具常驻在 GLM 工具面 | A3，两档 29 | 完成 27/29 对 29/31（p=1）；积分 −20%（p<0.001）、分钟 −18%（p=0.003）；无显著负向项 | **采纳延迟，常驻可去**。完成不掉、每次运行省两成积分；重用图与记忆工具的会话不在这三个任务里，采纳前先核一次延迟加载与公告在真实会话上的表现。 |
| Dynamic Behavior（`glm:dynamic-behavior`，3.17.1 原文） | A4，两档 30 | 完成 28/30 对 29/31（p=1）；全部行为指标不显著，仅回复字数 +9%（p=0.022） | **保留**。这个样本既量不出它的好处，也量不出坏处；去留按 §5.1 的 3.17.1 逐字镜像原则，删它要动逐字门禁链（`DYNAMIC_BEHAVIOR`），省约 1k 字符不值得破例。要删由人在数据之外另定。 |
| DSH 五节 `tool:read`、`tool:write`、`tool:edit`、`tool:glob`、`tool:grep` | A5，两档 28 | 完成 27/28 对 29/31（p=1）；步数 +24%（p=0.003）、shell 调用 +38%（p=0.006）、积分 +19%（p=0.006）、工具失败 +0.22 次（p=0.024） | **保留**。去掉后模型退回 shell（`cat`、`rg` 一类），步数、shell 调用与积分显著变差，这五节的工具纪律在起作用；全表里信号最强的一条。 |

数据薄的格子：A1 与 A5 在 flash 档的 shell-redirect 各只有 3 次有效（断开各 2），A3 在 5.3 档的 shell-redirect 4 次（断开 1）；六个断开全在 shell-redirect、分布跨臂，像上游掐流，不是臂的效应。`review/review.md`（2026-11-06）评审的是只有计划的那一版，不是这批数据。

### 5.3 本地化清单（coding-plan）

| # | 节 | 处理 |
| --- | --- | --- |
| ① | Harness 块 | 3.17.1 原文（每条 bullet 行首一个空格），「终端显示」改为「DSH Web GUI 显示」；系统轮那条取 3.17.1 的 `<system-reminder>` 分支：本通道把 harness 提醒都作为 `<system-reminder>` 用户轮递送，不发对话中段的 system 轮（§5.5）。start-plan 档用终端原文，系统轮取桌面缺省的 mid-conversation system turns 分支 |
| ② | Session guidance | 技能规则改写为 DSH 技能接缝；bullet 行首一个空格，同 3.17.1 |
| ③ | Environment | 3.17.1 骨架（`hSo`，2026-10-30）：bullet 行首一个空格，调用行末尾带空格，git 标志打印为 `true`/`false`，`Additional working directories` 在 git 行之后，最后一条是下载文件与解压内容按不可信数据处理；配置了 `modelLine` 时接在节末，3.17.1 把模型行移到紧随环境的独立节。填 DSH 真实目录、git、平台、shell。只在 `glm-prompt` 配了 `env` 时加。工作目录取会话头 `session.header.cwd`（guard 的圈禁根取的也是这个字段），会话没有记录工作目录时才用配置里的 `env.cwd`〔2026-10-29，项目图 `prompt-fixes`〕。此前一律用配置值：桌面版配的是本仓库目录，在别的项目里开会话也写本仓库。会话头不可变，rc.3 在 `agent/created` 之前就给 agent 设好会话，所以这一节在会话内不变。代价：不同项目的会话这一节的文字不同，跨会话共用的缓存前缀在这一节断开，每个新项目会话的第 1 步少命中约 1k–2k token，GLM-5.3 全价约 1 积分（估计，清点报告 `.agents/tasks/prompt-audit/report.md` §7 第 7 条）；同一项目的会话之间不变。git 仓库、平台、shell、系统版本仍取配置 |
| ④ | Desktop context | DSH 无对应特性的部分裁掉 |
| ⑤ | Skills 引导 | DSH 技能清单 |
| ⑥ | 工具描述与 schema 中的行为断言 | 垫片必须兑现描述与 schema 的承诺，兑现不了就改写或删去该句；七个别名的处理见 §5.4。Grep 删去原生做不到的参数，Bash 改写 shell 与工作目录两行 |
| ⑦ | Context management | 3.17.1 原文（`IBo`）：标题加两段，单换行连接；3.16.3 后面的四段 3.17.1 已删除（2026-10-30）。承诺与 DSH 压缩一致 |
| ⑧ | Memory | 3.17.1 `buildMemorySection`（`default-index` 一支）的原句，只改说到 ZCode 的记忆目录、`MEMORY.md` 与 Write 工具的两句，再加本项目的两句〔2026-11-01，项目图 `m5-3`〕。保留的十行放在镜像文件 `src/glm-prompt/zcode-memory-text.ts`（`ZCODE_MEMORY_LINES`，逐字门禁读它）。`localize.ts` 的 `buildMemorySectionDsh` 用镜像行与五个本地常量拼出这一节：`MEMORY_Z2_LOCAL`（Z2，记忆由 harness 保管，用 `memory_store`、`memory_query`、`memory_forget`）、`MEMORY_Z6_LOCAL`（Z6，索引每个会话载入，一条记忆一行，全文用 `memory_query` 读）、`MEMORY_L1`（人的原话放进 `relay`；项目记忆写明事实在源码里的出处）、`MEMORY_L2`（坑与解法归经验板块，用 `lessons_query` 查）、`MEMORY_BODY_PREFIX`（`body: `）。ZCode 的 frontmatter 块变成工具的字段：去掉两行 `---` 与 `metadata:`，`type:` 行去掉缩进，正文行前加 `body: `。Z7 到 Z9 在 ZCode 里是一行，只把 `existing file` 与 `Update that file` 换成 `existing memory` 与 `Update that memory`，由「恰好替换一次，否则抛错」的 `replaceOnce` 完成。全文 2,213 字符，不带 L2 时 2,114 字符；不再写衰减，衰减由 harness 处理，harness 会执行的规矩只在拒绝信息里教。`tests/glm-prompt.spec.ts` 钉三件事：全文逐字；ZCode 的每一句在节里整句出现；白名单，即节里不是 ZCode 原文的文字只有 Z2、Z6、L1、L2、`body: ` 前缀、`type:` 行去掉的缩进和 Z7 的两处替换，其余行与镜像一一相同、次序相同。出现条件：这一节只在本次组装 `next()` 返回的工具里有 `memory_store`、`memory_query`、`memory_forget` 三个时才加〔2026-10-29，split 第 2 步〕：编排层包没装、memory 行禁用或没配 `home`（这时它不注册记忆工具）时，GLM 不会被教去用不存在的工具。判定用 `next()` 的返回值本身（`memorySectionApplies`，在别名改写与工具检索之前），以后记忆工具被工具检索延迟加载也不会误删这一节；L2 同理，只在这份工具里还有 `lessons_query` 时出现（`LESSONS_QUERY_TOOL`）。ZCode 原版的 Memory 段讲的是 ZCode 自己的记忆文件，DSH 里不存在，所以不回退到原版，直接不加。工具的名字取自公共库的 `src/shared/tool-names.ts`，契约测试钉住记忆工具名与 memory 行的注册一致 |
| ⑨ | Deferred 声明 | 不设；名单公告与工具检索按 ZCode 原文（§5.7） |
| — | Dynamic Behavior | 3.17.1 原文（`TBo`），三段、没有标题：写代码与周边一致；对方的代词没说过时用 they/them；难撤销或对外的操作先确认，如实报告结果。按 3.17.1 的位置放在身份节之后〔2026-10-30，编排方定案 D-2，项目图 `zcode-3171-follow`〕。3.16.3 的这一节（`# Communicating with the user`，3,065 字符）coding-plan 一直没有发，3.17.1 把它整节重写了。逐字门禁检查它（`DYNAMIC_BEHAVIOR`）；start-plan 通道发同一段（`ZCODE_SYSTEM.dynamicSections.beforeEnvironment`）。以后的消融臂 A4 按 ZCode 自己的布局衡量这一节（项目图 `question-30`、`question-31`） |

### 5.4 工具面

- 别名：`Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`TodoWrite`，执行时委托捕获的原生定义〔实读〕。七个别名的描述与 schema 都按 ZCode 安装包重建（2026-10-28 按 3.16.3；2026-10-30 跟到 3.17.1：Read 描述一行与部分视图提醒、Bash 三处，其余别名两版相同），原文放在镜像文件 `src/glm-prompt/zcode-tool-text.ts`：第一批 `Read`、`Write`、`Edit`（含结果文本），第二批 `Glob`、`Grep`、`TodoWrite`、`Bash`（2026-10-28，含 Glob 与 Grep 的结果文本）。`Grep` 与 `Bash` 是本地化组合：镜像文件里是原文，删改在 `search-alias.ts` 与 `aliases.ts` 中完成，不属于逐字声明（别名规格标 `localized`）。
- 别名表的静态副本与方言服务〔2026-10-29，split 第 2 步〕：编排层的 guard 规则只认 DSH 原生名，要知道 `Write`、`Bash` 这些别名执行的是哪个原生工具。公共库 `src/shared/dialect.ts` 有一份静态表 `ZCODE_ALIAS_NATIVES`（七个别名 → 原生名），与 `DEFERRED_TOOL_CALL_NAME` 同类，是两包都带的 ZCode 事实；`glm-prompt` 行另外提供方言服务 `glmHournessDialect`：`nativeOf` 由本方言自己的别名定义组成（`aliasSpecs` 加 `Read`、`TodoWrite`，不抄静态表），`faceName` 是它的反查（`read_image` 也对应 `Read`），`claims(agent, route)` 在方言已经装好在这个 agent 上、且路由属于 GLM 模型族时为真（装失败的 agent 不算）。`tests/contracts.spec.ts` 断言静态表、`aliasSpecs`、`nativeOf`、`faceName` 四者一致，加了别名忘了登记就失败。服务提供失败时方言照常改写，`glm-prompt` 的行健康为 `degraded`，guard 按静态表换算、纠偏用原生名（`ORCHESTRATION.md` §6.1）。
- 工具面：别名只遮住它实际包住的原生工具。`Read` 包住 `read`，组合里有 `read_image` 时也包住它；其余别名各包一个（`write`、`edit`、`glob`、`grep`、`pwsh`、`todo_write`）。被包住的原生工具从 GLM 请求的工具面中滤掉，非 GLM 请求则滤掉别名；两组都保持注册，逐请求在组装监听器里决定（§3）。L3 探针（2026-10-28）：GLM 首个请求 16 个工具（14 个常驻加两个检索控制工具），13 个延迟；非 GLM 请求 28 个原生工具。
- schema：七个工具都是 ZCode 发给模型的形态，即合同中的 zod 对象经 `toToolJsonSchema`（zod-to-json-schema 3.25.2，jsonSchema7，`effectStrategy: input`）转换后再加 `$schema`（2020-12）。所以有 `integer`、`minimum`、`exclusiveMinimum`、`minLength`、`additionalProperties: false`、`default`；Bash 的语义数字与语义布尔按输入类型转换为 `number`、`boolean`。rc.3 不校验原样注册的工具参数，这些关键字原样到达模型（L3 探针实测）。`Read` 用不带 PDF 的形态：ZCode 只对声明 PDF 输入的模型加 `pages` 参数与 PDF 说明行，GLM 不声明。
- 映射与兑现（Read，`src/glm-prompt/read-alias.ts`）：
  - 描述删去视频一行：DSH 没有视频输入。组合里没有 `read_image` 时再删去图片一行。其余各行逐字。
  - 结果按 ZCode 的 cat -n 形态渲染（`行号\t内容`），不用原生的 `行号: 内容` 外框。Edit 描述要求模型「去掉 Read 的行号前缀（行号加 tab）」，依赖这个形态。空文件回 ZCode 的空文件提醒。
  - 原生窗口受 2000 行与 50 KB 两个上限。窗口没读到文件末尾、且不是模型自己给的 `limit` 截住的，结果前加 3.17.1 的部分视图提醒（`createTokenCapPartialView`）：「[Truncated: PARTIAL view — <路径>: showing lines a-b of n total. Call Read with offset=<b+1> limit=<本页行数> for the next page, or Grep to find a specific section. Do NOT answer from this page alone if the answer may be further in the file.]」，与正文之间一个换行。ZCode 在 `total` 之后还有 ` (<N> tokens, cap 25000)`，讲的是它的 token 预算；原生窗口按行与字节计，没有 token 数，这一子句不写〔2026-10-30；此前用 3.16.3 部分视图三句里的后两句〕。
  - `offset` 为 0 时按 ZCode 从第 1 行读（原生从 1 计）；`limit` 超过原生窗口 2000 行时截到 2000，结果用上面的提醒说明续读位置。垫片按原生默认配置写死 2000。
  - 图片扩展名（ZCode 的集合，与 `read_image` 相同）转给 `read_image`，`offset`、`limit` 对图片不适用，与 ZCode 一致；图片结果用 `read_image` 自己的渲染。
  - 图片一行不按模型取舍：ZCode 3.16.3 的 Read 描述只对声明 PDF 输入的模型加 PDF 一行（`resolveReadProviderDescription`），图片一行对纯文本模型也保留。所以 GLM-5.3 与 GLM-5.3-Flash 看到同一份描述（L3 探针实测）。两者在纯文本模型上的实际所得不同：ZCode 读图成功，请求里图片换成它的文字占位，后接一行「[Media omitted from provider request because the selected model does not support image input.]」（`createUnsupportedModelInputMediaText`）；DSH 的 `read_image` 在只声明文本的路由上直接报错，GLM-5.3 收到的是拒读错误（L3 探针实测）。两种结果都告诉模型看不到图片，本项目不改写这条错误。
  - ZCode 的二进制扩展名（`.exe`、`.zip` 等 19 个）与视频扩展名直接拒绝，组合里没有 `read_image` 时图片扩展名也拒绝；错误文本用 ZCode 的二进制拒读原文。
  - 输出合同：有 `read_image` 时是两个原生输出 schema 的 `oneOf`，渲染与 `presentationMeta` 交给产出该值的原生工具，参数先映射。
- 映射与兑现（Write、Edit，`src/glm-prompt/aliases.ts`）：
  - Write 映射 `file_path`、`content`。「覆盖没读过的已有文件会失败」由默认的 `fs-observation-policy` 保证：没观察过的目标按 create-if-absent 写，已有文件被拒（L3 探针实测，文件内容不变）。
  - Edit 映射 `file_path`、`old_string`、`new_string`；`replace_all` 按 ZCode 的语义布尔转换（`true`/`1`/`yes`/`y`/`on` 与对应的假值字符串，数字 1/0），其余值原样交给原生工具报错。「必须先 Read」「old_string 必须唯一」由原生 `edit` 与观察策略保证。
  - 原生 `write`、`edit` 在受限文件系统下多出 `sandbox_permissions`、`justification` 两个字段，沙盒拒绝时提示模型带上它们重试。原生声明了这两个字段时，别名把原生的字段定义原样追加到 ZCode schema 的 `properties` 末尾并转发；原生没有时 schema 与 ZCode 逐字一致。这是本地化，不属于逐字声明。
  - 结果文本用 ZCode 的原文（「File created successfully at: …」「The file … has been updated successfully.」「… All occurrences were successfully replaced.」，后接「(file state is current in your context — no need to Read it back)」）。值的形状不对时退回原生渲染。
- 映射与兑现（Glob，`src/glm-prompt/search-alias.ts`）：映射 `pattern`（按 ZCode 去掉首尾空白）与 `path`。原生按修改时间从旧到新列出全部匹配（`rg --sort=modified`），垫片倒序成 ZCode 的从新到旧，取前 100 条，超出时加 ZCode 的截断提示（「(Results are truncated. …)」），没有匹配时回「No files found」。路径按 ZCode `toDisplayPath` 显示：工作目录内的相对路径用 `/` 分隔，其余原样。原生与 ZCode 一样不认 `.gitignore`、排除 VCS 目录。
- 映射与兑现（Grep）：原生 `grep` 只接受 `pattern`、`path`、`include`，返回全部匹配行（`path`、`lineNumber`、`line`）。垫片兑现的参数：
  - `pattern` 按 ZCode 去首尾空白；`-i` 转成 ripgrep 的内联标志 `(?i)` 加在模式前。
  - `glob` 按 ZCode 的拆分规则（空白分隔；不含花括号的片段再按逗号分隔），`type` 按 ZCode 的类型表（如 `js` 为 `.js`、`.jsx`、`.mjs`、`.cjs`；表外类型当作扩展名；含非法字符的类型忽略），都变成原生的 `include`。ZCode 把它们作为多个 `--glob` 交给一次 ripgrep，命中任一即算；垫片对每个过滤条件各调一次原生，按「路径加行号」去重合并。类型的扩展名合成一个花括号模式（`*{.js,.jsx,.mjs,.cjs}`），不带斜杠的 ripgrep glob 在任意深度匹配文件名，与 ZCode 每个扩展名两条 glob 的效果相同。
  - `output_mode`（`content`、`files_with_matches` 默认、`count`）、`-n`（默认带行号）、`head_limit`（默认 250，0 为不限）、`offset` 在垫片里按 ZCode 的分页（`applyHeadLimit`，只在截断时报告 limit）与结果文本（`formatGrepModelContent`）实现；`count` 统计每个文件的匹配行数，与 ZCode 的 `rg -c` 一致。
  - 原生不向 ripgrep 传上下文、仅匹配与多行参数，所以 `-A`、`-B`、`-C`、`context`、`-o`、`multiline` 从 schema 删去，描述删去 multiline 一行，`output_mode` 的说明删去「-A/-B/-C context」。
- 映射与兑现（TodoWrite，`src/glm-prompt/todowrite.ts`，别名在 `index.ts`）：描述与 schema 逐字。原生 `todo_write` 每次整表替换，DSH 界面以 todo 面板显示（`dsh-client-ui-conversation`），与描述一致。`priority`（`high`/`medium`/`low`）校验后在执行边界剥离，原生只存 `content`、`status`。
- 映射与兑现（Bash，`src/glm-prompt/aliases.ts`）：本地化组合。
  - 描述按 ZCode 原文（3.17.1，默认超时策略 120000/600000、未启用 embedded search 的版本），改两行、去掉一行：首行的 bash 改为 PowerShell；工作目录一行改为「每次调用在会话工作目录新起进程，`cd` 不保留，不加载用户 profile」；3.17.1 在 IMPORTANT 行之后新增的「- Command output is displayed to you, not reliably to the user.」不发，DSH Web GUI 把每个工具结果都显示给用户，这句在 DSH 上不成立（已知差异，编排方定案 D-3，2026-10-30；原文仍在镜像文件里受检）。依据：原生每次以 `pwsh -NoLogo -NoProfile -NonInteractive -Command` 新起进程（`dsh-pwsh-local`），默认目录是会话工作目录（`dsh-tool-pwsh`）。其余行在 DSH 上成立：默认超时 120000、上限 600000 与原生执行器默认配置相同（3.17.1 的「for a foreground command」与 schema 的同一说明照发，description 字段提示首句后的「Say what the command does in plain words …」一段也照发）；后台命令结束时 `dsh-tool-jobs` 默认以 `wakeup` 方式唤醒空闲 agent。
  - schema 按 ZCode 原文，去掉 `dangerouslyDisableSandbox`：DSH 只能经原生带审批的 `sandbox_permissions`、`justification` 放宽沙盒，原生声明这两个字段时追加并转发（同 Write、Edit）。原生没有后台运行（组合里没有 job 注册表）时，同时去掉 `run_in_background` 字段与描述中的后台一行。
  - 映射：`timeout` 是毫秒，按 ZCode 的语义数字（数字字符串转数字）转 `timeoutMs`；ZCode 把 0 当作默认值，原生拒绝 0，所以 0 不转发；超过上限由原生截到上限，与 ZCode 一致。`run_in_background` 按 ZCode 语义布尔转换。`description` 在 ZCode 可选而原生要求非空，缺省时取命令首行（最长 80 字符）。原生的 `workdir` 不对模型暴露，ZCode 没有这个参数。默认值与上限按原生默认配置写死。
  - 结果文本用原生渲染（`[stderr]`、`[exit code: N]` 等标记，与 DSH 的 pwsh 提示节一致）。
  - 此前的 Bash 别名把 `timeout` 当秒换算并暴露 `working_dir`，取自无法追溯的旧文本，与 ZCode 不符，已替换。
- 与 ZCode 的已知差异（未移植）：
  - Read 的「文件未变」短路（`file_unchanged`）、超 token 预算报错与 Read 状态元数据；Edit 的模糊匹配与引号归一（ZCode 会兜底匹配，DSH 原生只做精确匹配，与描述一致）；Edit 用空 `old_string` 新建文件（原生拒绝空 `old_string`）。
  - Glob：修改时间相同的文件，先后顺序可能与 ZCode 不同。
  - Grep：`files_with_matches` 模式 ZCode 按修改时间排序，垫片保持 ripgrep 的输出顺序；ZCode 搜索隐藏文件（`--hidden`），原生不搜；ZCode 让 ripgrep 略去超过 500 列的行（`--max-columns 500`），原生返回整行；以 `!` 开头的排除模式原生拒绝，模型收到原生的报错。
  - TodoWrite：ZCode 的结果是 `{oldTodos, todos, summary}` 的 JSON，垫片用原生的「Updated todo list: …」。
  - Bash：结果形态与 ZCode 不同（见上）。
- 读图经原生通道：2026-10-28 之前 `glm-zcode` 的编码器丢弃图片块，经该通道读图只得到 `read_image` 的文字信封。现在 GLM-5.3-Flash 收到真实图片块（§4.5a），描述中的「presents them visually」成立；GLM-5.3 只声明文本，读图被拒（见上）。

### 5.5 todo 提醒

ZCode 双阈值 10/10：距上次 TodoWrite 与距上次提醒都达到 10 轮时，注入逐字提醒并回显当前 todo。

ZCode 的做法〔实读，3.16.3 安装包 `XNa`、`U4o`、`z4o` 与回合循环的附件收集；源码 `runtime/helpers/runtime-reminders.ts`、`runtime/methods/turn-loop.ts`〕：每次模型请求之前，若本回合的工具里有 TodoWrite（工具检索延迟之前的全量工具），从历史末尾往前数助手消息，一条助手消息算一轮，不论它带几个工具调用（3.17.1 `nUa` 起，只有 reasoning 块、没有工具调用的助手消息不算）；距最后一条调用 TodoWrite 的助手消息与距最后一条 `todo_reminder` 都不少于 10 轮时，生成提醒正文（逐字提醒加会话 todo 存储的回显），作为 `todo_reminder` 附件以 `<system-reminder>` 包裹递送，并持久化为合成用户消息，之后的请求从它起算。找不到标记时按整段历史的轮数计。经 `DeferredToolCall` 调用的 TodoWrite 在 ZCode 历史里记为目标名（包装只留标记），同样算 TodoWrite。3.16.3 安装包比源码多一个条件：模型 id 含 `claude` 时不提醒，与 GLM 无关。

实现〔已实现 2026-10-28，L3 实测〕：`src/glm-prompt/todo-reminder.ts`，由 `installDialect` 安装在每个 agent 上。`agent/pre-step` 监听器（判定、空首步保护、追加 notice）在公共库的 `src/shared/step-notice.ts`，与高峰提醒（`ORCHESTRATION.md` §11.4）、项目图的每步投影（`ORCHESTRATION.md` §2.5）共用；读历史的两个函数（工具调用的参数、有结果与失败的调用）也在这个文件里，todo 提醒与每步投影共用。`installStepNotice` 的最后一个参数是告警里写的行名，必填：公共库不替哪个包的行起默认名。

- 时机：`agent/pre-step`，即本步组装之后、请求之前，对应 ZCode 的附件收集。只在组装监听器判定本步为 GLM 路由、且别名改写后的工具面（工具检索延迟之前）有 TodoWrite 时检查；非 GLM 路由永远不提醒。
- 计数：每步从 `session.deriveMessages()`（请求可见历史，跟随压缩与续跑）重新推出，不在内存里累加。只有 GLM 模型产生的助手消息算轮次（rc.3 助手消息的 `source.model`），只有 reasoning 块的不算（3.17.1，2026-10-30）。todo 写入包括 TodoWrite、点名 TodoWrite 的 `DeferredToolCall`，以及非 GLM 步里的原生 `todo_write`（写的是同一份清单）。提醒标记是来源 `glm-todo-reminder` 的用户消息。
- 递送：`createUserNotice` 生成的 notice（来源 `glm-todo-reminder`），正文按 ZCode 的 `<system-reminder>` 包装（与工具检索公告共用 `wrapSystemReminder`，在公共库的镜像文件 `src/shared/zcode-notice.ts`），追加在本步已接纳的消息之后；同一步还有 deferred 名单公告时，提醒排在公告之前，与 ZCode 收集附件的先后一致。notice 写入会话，下一步的计数据此起算。
- 回显：取请求可见历史中最近一次成功的 todo 写入的清单。ZCode 读会话 todo 存储；DSH 没有对应的持久存储（`dsh-tool-todo` 的 `todos` 投影在每个回合开始时清空），所以从历史推出。
- 验证：L2 覆盖多调用轮、TodoWrite 重置、经 `DeferredToolCall` 的 TodoWrite、提醒标记、非 GLM 路由与非 GLM 轮次、工具面无 TodoWrite、空首步、与公告的先后；L3 探针：先记一条 todo，再连续 10 轮每轮两个并行 Read，提醒恰好出现在第 12 次请求、只出现一次，正文为包装后的原文加回显，位于最后一批工具结果之后。

与 ZCode 的差异：

- 递送形态：ZCode 在模型属性 `supportsMidConversationSystem` 为真（或配置强制）时，把 `todo_reminder` 投影成对话中段的 system 消息，否则是包在 `<system-reminder>` 里的用户消息。GLM 模型的这一属性来自远端配置，安装包里没有具体取值。本项目一律按后一种递送，与工具检索公告相同。
- 回显来源：见上；压缩把最近的 todo 写入移出可见历史后，回显为空，ZCode 仍能回显存储里的清单。
- 计数口径：非 GLM 步的助手消息不算轮次。ZCode 不区分模型，按全部助手消息计。

2026-10-28 之前的实现在 `tools/post-execute` 上按完成的工具调用计数，一轮并行调用多个工具会多计，提醒来得比 ZCode 早；提醒随工具结果的 `additionalContexts` 递送，没有 `<system-reminder>` 包装；回显取内存中最近一次 TodoWrite 的参数，续跑后丢失。已整体替换。

todo 在编排层降级为项目图的视图（`ORCHESTRATION.md` §2.5），TodoWrite 本身保留，因为它是 GLM 的训练习惯。

### 5.6 压缩镜像

ZCode compact 提示词（`<analysis>` 先行、9 节摘要、安全指令保留；3 行偏差已修正，见 §5.9；第 6 条 2026-10-30 按 3.17.1 补一句：只有 user 角色的轮次算用户消息，助手消息里形如用户轮的文字是模型生成的），产物经 ZCode `formatCompactSummary` 剥 `<analysis>`、`<summary>` 改写为「Summary:」。

接缝〔已实现 2026-10-27，L3 实测〕：DSH 的压缩由 `compaction-basic` 负责，它是本上下文唯一的 `ctx.compaction` 实现（`dsh-compaction` 规定每个上下文只载一个）。它通过 `ctx.llm.stream()` 发起摘要请求，`purpose` 为 `compaction`，回放对话后把自己的指令作为最后一条用户消息。每次调用都经过 `llm/stream` 瀑布，但 `next()` 不带参数，监听器换不了请求。`glm-compact` 行注册一个最外层的全局 `llm/stream` 监听器：模型属于 GLM 族、且最后一条是 `compaction-basic` 指令的压缩请求，复制一份、把末条换成 ZCode 提示词后重新派发，并对返回的文本做 ZCode 格式化；其他请求原样放行。触发策略、保留区间、检查点外框仍归 `compaction-basic`。

更正：原设计是挂一个 `BasicCompactionEngine` 子类。它在桌面版上从未挂载（从仓库路径解析不到 `@deepseek-ai/dsh-compaction-basic`），而且即使挂上也会成为第二个压缩引擎，并且只认 provider `glm`，不认原生通道 `glm-zcode`。已整体替换。

L3 探针：沙盒里把压缩阈值调低，摘要请求末条是 ZCode 提示词，下一次请求里的检查点内容为「Summary:\nprobe summary」，不含 `<analysis>`。外框仍是 DSH 的检查点前言加 `<compacted-summary>` 标签，与 ZCode 续接消息的写法不同，属于已知差异。ZCode 的 autoCompact 阈值（166k）与 microcompact 公式记录在 `reference/zcode-capabilities.md` §11.2，未接入。

压缩后的重新锚定属于编排层（`ORCHESTRATION.md` §2.5，图行 `src/graph/reminder.ts` 按检查点重注投影）。
压缩后读原文〔已实现 2026-11-05，任务 `compact-recall`，调查报告方案 C；依赖 `glm-hourness/transcript` 行，该行 2026-11-06 起默认启用〕：`glm-compact` 行经 `ctx.get` 读服务 `glmHournessTranscript`（契约 `src/shared/transcript.ts`，不写进 `inject`）。GLM 压缩副本的摘要流结束、格式化后的摘要不为空时，行请服务导出这个会话（请求的 `sessionId`，`compaction-basic` 设为压缩中的 agent 自己的会话），服务写成文件就在摘要末尾接 ZCode 3.17.1 `Bxt` 的原文路径一句（镜像文件 `src/glm-prompt/zcode-compact-text.ts`，`reference/zcode-verbatim.md` §7），句末是导出文件的绝对路径；模型用 Read 按 `offset`/`limit` 读，不加工具（导出的格式、位置与清理见 §2.4「会话原文」）。服务不在（行禁用，或只装了 GLM 包）、导出被跳过，或服务违约拒绝（行健康降级）时摘要与没有这一行时逐字相同；格式化后为空的摘要不请服务，照旧不发文本，让 `compaction-basic` 报错。这一句在 `<compacted-summary>` 外框里面，ZCode 把它放在自己的续接消息里，属于已知差异（§5.8 第 21 项）。L3 探针场景 `glm-compact-transcript`（2026-11-05 通过）在覆盖层里把这一行钉为启用、`home` 指向场景目录：检查点以这一句结尾、文件在场景目录、模型用 Read 读到它；场景 `glm-compact` 在覆盖层里禁用这一行，检查点没有这一句。行出厂启用之后（2026-11-06），探针另核对不带覆盖层的启动场景在两条路由上都列出这一行「已加载，本会话未触发」（行只在 GLM 压缩时动作，§2.5）；桌面版 L4 2026-11-06 在隔离实例上通过（`.agents/tasks/compact-recall/l4.md`）。导出遮掉凭证（任务 `compact-recall-redact`，§2.4「会话原文」）之后，这个场景的任务文字带两个拼出来的假凭证（一个 Bearer 值、一个具名前缀的 key），多一条核对：两个都进了会话的第一个请求，导出里一个都没有，任务那一行读作两处 `[redacted]`，说明行写的处数不少于 2，`/glm-status` 的行健康写同一个数。遮掉不改这一句，也不改摘要。

### 5.7 工具检索〔已实现 2026-10-27〕

按 ZCode 的 local 模式移植（3.16.3；2026-10-30 公告文案跟到 3.17.1；机制见 §5.10），属于方言，由 `glm-prompt` 驱动；原来独立的 `glm-hourness/toolsearch` 行已删除。原因：工具检索必须作用在别名改写之后的工具面上，才能按 ZCode 名字分常驻与延迟；两行各自注册组装监听器时先后顺序取决于 Loader，放进同一个监听器就没有顺序问题。

- 开关：`glm-prompt` 配置 `toolSearchMode`，`local`（默认）或 `off`。
- 安装：`agent/created` 时在 agent 作用域注册 `LocalToolSearch` 与 `DeferredToolCall`，并注册一个 `agent/pre-step` 监听器。
- 工具面：GLM 请求先做别名改写，再交给 `buildToolExposure`：延迟工具离开工具面，两个控制工具留下；没有延迟工具时控制工具也离开。非 GLM 请求只去掉控制工具。
- 分类：ZCode 常驻名单保持常驻；有 ZCode 对应物的 DSH 工具跟随对应物（`read_image`、`subagent`、`subagent_fork`、`skill`、`workflow`、`get_goal`、`ask_user_question`、`bash`、`str_replace_editor`）；记忆工具与项目图工具常驻（`ORCHESTRATION.md` §8、§2.10；名单是公共库 `src/shared/tool-names.ts` 的 `ORCHESTRATION_RESIDENT_TOOLS`，逐个列名，编排层以后加的工具默认按 DSH 独有工具延迟，要常驻须在那里加名字）；其余 DSH 工具按 MCP 规则延迟。L3 探针中的 GLM 工具面（2026-10-27 为 28 个；2026-10-28 起 `read_image` 由 Read 别名包住，为 27 个），13 个延迟：TodoWrite、create_goal、exit_plan_mode、interrupt_agent、job_kill、job_list、job_output、list_agents、send_message、update_goal、web_fetch、web_search、working_directory。
- 公告：每步在 `agent/pre-step` 计算新增、恢复、移除的 deferred 名单，追加一条 `<system-reminder>` notice（来源 `glm-tool-search`）；增量事实存在 notice 的 `source.toolSearchAnnouncement`，与 ZCode 公告元数据一致。文案按 3.17.1：恢复的名字分 MCP（服务重连）与本会话两段；移除的名字分 MCP 服务断开、本会话不再有、仍在注册表里但本次请求隐藏三段，隐藏的名字另记在 `source.toolSearchHiddenNames`（3.17.1 `toolSearchHiddenNames`，判定用 agent 的 `tools.get`）；段落以单换行连接，此前按 3.16.2 源码用空行〔2026-10-30〕。已公告状态每步从 `session.deriveMessages()` 重新推出，所以续跑、重启和压缩后都按模型实际看得到的历史计算。
- 检索结果：执行 `LocalToolSearch` 时按 ZCode 投影生成内容，即 `<functions>` 定义块、「Loaded: …」提醒、「Tool definitions already available …」提醒。「已加载」只认最近一条助手消息之前的成功检索结果（ZCode 同批不互相去重的语义）。
- `DeferredToolCall`：校验与拒绝文案按 ZCode `resolveDeferredToolCall`；通过后经 `tools.execute` 执行目标，不带 `parent` 令牌。ZCode 在派发前就把包装还原成目标调用，所以 guard、审计流水、会话检查点看到的都应该是目标本身。todo 提醒从会话历史计数，历史里记的是模型发出的 `DeferredToolCall`，所以按其参数里的目标名识别 TodoWrite（§5.5）。
- 文本：逐字镜像在 `src/toolsearch/zcode-text.ts`；`DeferredToolCall` 这个名字与 `<system-reminder>` 包装编排层也用（现场视图认包装调用、每步投影的格式），放在公共库的镜像文件 `src/shared/zcode-notice.ts`，`zcode-text.ts` 从那里导入。逐字门禁按字面量片段检查这两份文件（§5.9）。

与 ZCode 的差异：

- 只有 local 模式，没有 native 与 auto。
- ZCode 每次请求都从历史重新投影检索结果；DSH 的工具结果执行时生成一次后固定，之后工具定义变化不会回写旧结果。
- 没有移植压缩后把已加载工具提升为常驻（`preCompactDiscoveredTools`）：DSH 压缩之后，已加载的工具会重新公告，需要再检索一次。
- `LocalToolSearch` 入参校验失败的报错文案是本项目的（ZCode 由执行器的 schema 校验给出，格式未核实）；直接调用未加载的延迟工具时，ZCode 在校验失败的结果后附「Load the tool first …」提示，本项目未实现。

### 5.8 与 ZCode 的差异总表

| # | 能力 | 类 | 处置 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 工具命名与 schema | 方言 | 别名投影；七个别名按 ZCode 原文重建并兑现（2026-10-30 起为 3.17.1），Grep、Bash 为本地化组合（§5.4） | 已实现，L3 探针通过，真机未验收 |
| 2 | TodoWrite 三字段 | 方言 | 垫片剥离 priority | 已实现 |
| 3 | 身份节 | 方言 | 同名替换 | 已实现 |
| 4 | todo 提醒 10/10 | 方言 | 逐字文案与阈值；按助手轮次从会话历史计数，`agent/pre-step` 递送（§5.5） | 已实现，L3 探针通过，真机未验收 |
| 5 | 合成消息通道 | 同构 | 不动 | — |
| 6 | compact 提示词 | 方言 | `llm/stream` 上替换压缩指令并格式化产物（§5.6） | 已实现，L3 探针通过，真机未验收 |
| 7 | beta 能力头 | 通道 | 按能力集动态添加 | 未实现 |
| 8 | 工具懒加载 | 缺口 | glm-prompt 内的 local 工具检索（§5.7） | 已实现，L3 探针通过，真机未验收 |
| 9 | 服务端 web 工具 | 缺口 | 待实测 `web_search_prime` / webReader 直连闸门 | 挂账 |
| 10 | 持久记忆 | 缺口 | memory 行（编排层） | 已实现，未被真正使用 |
| 11 | 身份头、签名、路由 | 通道 | glm-llm | 已实现，版本待统一 |
| 12 | 模型目录、登录 | 通道 | glm-llm、glm-login | 已实现 |
| 13 | 日期与输出风格提醒族 | 方言 | 低成本可选 | 未实现 |
| 14 | 缓存断点参数 | 通道 | 末条消息带断点；系统块按 ZCode 拆三块未做，实测不影响命中（§4.5b） | 部分实现 2026-10-28 |
| 16 | thinking 与采样参数 | 通道 | 按 3.16.3 目录的选项映射发 `thinking: {type: "enabled"}` 与 `output_config.effort`（DSH 档位，缺省 high；标题 low；压缩取会话最近主步的档位）；不剥采样参数（AI SDK 不知道这个 thinking），是否带 `temperature` 由 DSH 决定 | 已实现 2026-10-28（m1-parity） |
| 17 | 保留式思考：历史中的 reasoning 带签名回传 | 通道 | 签名只回同一路由；ZCode 的签名拒收重试未移植（端点不校验，§4.5c） | 已实现 2026-10-28 |
| 18 | 请求归因：会话 id、会话类型、请求与追踪 id、query id 与来源、`metadata.user_id` | 通道 | 按 3.16.3：会话级 trace id、回合级 query id、`main_turn` / `compact` / `session_title` / `subagent` 来源；委派子会话经 `agents` 服务的会话头判定；3.17.1 的 `x-zcode-session-features`（§4.5b） | 已实现 2026-10-28（m1-parity）；会话特征 2026-10-30 |
| 19 | Dynamic Behavior 节 | 方言 | 3.17.1 原文，coding-plan 与 start-plan 都发（§5.3） | 已实现 2026-10-30 |
| 20 | Memory 节 | 方言 | 3.17.1 `buildMemorySection` 的十行放进镜像文件，两句改写、两句新增，白名单测试钉住只改了这几处（§5.3 ⑧） | 已实现 2026-11-01（m5-3） |
| 21 | 压缩后读原文 | 方言 | 3.17.1 `Bxt` 的原文路径一句逐字接在 GLM 压缩摘要末尾，路径指向编排层导出的纯文本（§5.6、§2.4「会话原文」）；位置在 DSH 的 `<compacted-summary>` 外框里，不在 ZCode 的续接消息里；3.17.1 的正式调用不传 `transcriptPath`，ZCode 正式流量里没有这一句 | 已实现 2026-11-05，L3 探针通过，桌面版 L4 2026-11-06 在隔离实例上通过，行 2026-11-06 起默认启用 |
| 22 | 子目录指令：别名 Read、Write、Edit 触到工作目录之下的文件后，送该文件所在各层的 AGENTS.md 等 | 缺口 | glm-prompt 内的步前通知（§5.11）；ZCode 3.17.1 不送子目录指令，这一项是请求上的偏离 | 已实现 2026-11-10，人定报告 §7 的 C：合入但缺省关（`subdirInstructions`），开启才偏离（§5.11） |

第 1、2、4、6、8 项的文本对齐状态以 §5.9 为准。

### 5.9 逐字复核（2026-10-27；2026-10-30 换到 3.17.1）

方法：把方言里每段号称逐字的文本按行比对 ZCode 源码（`reference/ZCode/apps` 与 `packages`）、本机 3.16.3 安装包、pristine 3.15.1，以及 `reference/zcode-api`〔实读〕。源码路径相对 `apps/zcode-cli/packages/core/src/`。2026-10-30 基线换到 3.17.1：表中每一项都按 3.17.1 pristine 副本复核，变了的已改写，门禁从此只对照这份副本（项目图 `zcode-3171-follow`）。

| 文本 | 代码位置 | 结果 | 原文位置 |
| --- | --- | --- | --- |
| CLI 前缀 | `verbatim.ts` `CLI_PREFIX` | 与 3.17.1 一致（2026-10-30 跟进，删去 coding） | `context/sections/cli-prefix.ts` |
| 身份开头两句 | `verbatim.ts` `IDENTITY_OPENING_*` | 与 3.17.1 一致（2026-10-30 跟进，两句都换了） | `context/sections/identity.ts` |
| 官方安全声明 | `verbatim.ts` `SECURITY_NOTICE_OFFICIAL` | 与源码、pristine 一致；本机安装包此处为用户补丁 | `context/sections/identity.ts` |
| Harness 块 | 镜像文件 `zcode-harness-text.ts` | 与 3.17.1 一致（2026-10-30 跟进：bullet 行首空格、系统轮分支） | 3.17.1 包 `SDn` |
| todo 提醒回显标题 | `verbatim.ts` `TODO_REMINDER_ECHO_HEADER` | 一致 | `runtime/helpers/runtime-reminders.ts` |
| todo 提醒正文 | `verbatim.ts` `TODO_REMINDER_BODY` | 曾有两处不一致（`to track progress`、`if has become stale`，原文语法如此），已按原文修正 | `runtime/helpers/runtime-reminders.ts` |
| Context management | `localize.ts` `CONTEXT_MANAGEMENT_DSH` | 与 3.17.1 一致（2026-10-30：两段，删去 3.16.3 的后四段） | 3.17.1 包 `IBo` |
| Dynamic Behavior | `verbatim.ts` `DYNAMIC_BEHAVIOR` | 3.17.1 原文（2026-10-30 新增） | 3.17.1 包 `TBo` |
| Memory 节 | 镜像文件 `zcode-memory-text.ts` `ZCODE_MEMORY_LINES`（十行） | 与 3.17.1 一致（2026-11-01 新增）；`description:` 行 summary 后是逗号，四类定义写作 `` `user`: who … ``，Z7 与 Z9 在句号处断开，三处与 3.16.2 源码不同，取 3.17.1。另有 Z2、Z6、L1、L2 四句本地文字不在镜像里 | 3.17.1 包 `buildMemoryContent`（`default-index` 一支） |
| 压缩后的原文路径一句 | 镜像文件 `zcode-compact-text.ts` `transcriptNote` | 与 3.17.1 一致（2026-11-05 新增）；`tests/compact-row.spec.ts` 另从副本抽出模板正文逐字节比对 | 3.17.1 包 `Bxt` 的 `transcriptPath` 一支 |
| compact 提示词 | `compact.ts` | 曾有 3 行不一致（第 4、8、9 节漏词），已按原文修正。结尾的 `REMINDER` 行与 3.16.3 安装包、pristine 一致，与源码不同，按安装包保留；第 6 条 2026-10-30 按 3.17.1 补一句 | `compact/prompt.ts` |
| ToolSearch 描述 | 旧 `toolsearch/index.ts` | 首句一致，之后不一致。已按 3.16.3 安装包重建为 `LocalToolSearch` 描述（2026-10-27） | 安装包；源码 `tool/search/description.ts` 是 3.16.2 版本 |
| Deferred 声明段 | 旧 `verbatim.ts` `DEFERRED_DECLARATION` | 任何来源中都找不到；ZCode 系统提示词没有这一段，已删除（2026-10-27） | — |
| 工具检索全部文本 | `toolsearch/zcode-text.ts` | 与 3.17.1 一致（门禁按字面量片段检查；2026-10-30 增删公告跟进） | 安装包 |
| Read、Write、Edit 描述、schema 与结果文本 | `zcode-tool-text.ts`（镜像文件） | 旧文本任何来源中都找不到，已按 3.16.3 安装包重建（2026-10-28），2026-10-30 跟到 3.17.1（Read 描述一行、部分视图提醒）；Read 描述按 §5.4 删去不能兑现的行。schema 用 ZCode 锁定的 zod-to-json-schema 3.25.2 复算，与安装包中的 zod 定义一致 | 安装包；源码 `tool/handlers/read.ts`、`write.ts`、`edit.ts`、`contracts/src/tools/` |
| Glob、Grep、TodoWrite 描述、schema 与 Glob、Grep 结果文本 | `zcode-tool-text.ts`（镜像文件） | 旧文本任何来源中都找不到，已按 3.16.3 安装包重建（2026-10-28）；Grep 按 §5.4 删去原生做不到的参数与 multiline 一行，删改在镜像文件之外。schema 用 zod-to-json-schema 3.25.2 复算 | 安装包；源码 `tool/handlers/glob.ts`、`grep.ts`、`todo.ts`，`adapters/src/fs/index.ts`（分页、类型表、glob 拆分） |
| Bash 描述与 schema | `zcode-tool-text.ts`（原文）、`aliases.ts`（本地化） | 旧文本是无法追溯的改写，已按 3.16.3 安装包原文重建（2026-10-28），2026-10-30 跟到 3.17.1；只按 §5.4 改写 shell 与工作目录两行、去掉「Command output …」一行与 `dangerouslyDisableSandbox`；不属于逐字声明 | 安装包；源码 `tool/handlers/bash-prompt.ts`、`contracts/src/tools/bash.ts` |

结论：身份类文本与 context management 是原文；todo 提醒正文、compact 提示词的小处偏差已修正；start-plan 三块系统提示中的静态文本与原文一致。工具描述、deferred 声明段与 ToolSearch 描述原先大部分不是 ZCode 3.16.x 的原文，只存在于 `reference/zcode-tool-schemas.md`，其「协议采样」的出处无法追溯；现已全部按安装包重建或删除，七个别名的参数 schema 都与安装包中的 zod 定义一致。

处置：

- 来源：3.17.1 pristine 副本为准（2026-10-30 起；此前以 3.16.3 安装包为准，用户补丁的安全声明以源码与 pristine 为准）。源码（3.16.2）只作可读参考；它与发布包的已知差异都按包：compact 结尾 `REMINDER` 行；工具检索的 local 模式（§5.10）；Read 部分视图提醒与正文之间、Grep 结果的分页行与计数汇总行之前，包用一个换行，源码用两个；工具检索增删公告的段落之间，包用一个换行，源码用空行（本项目此前按源码，2026-10-30 改正）。
- 逐字门禁 `scripts/check-verbatim.mjs`（`npm test` 的一道）：每段号称逐字的文本逐行必须出现在 3.17.1 pristine 副本 `reference/zcode-3.17.1/zcode.cjs` 中〔2026-10-30 起，项目图 `zcode-3171-follow`〕；尚未重建的条目列为已知偏差，只许减少，某条一旦对上而未从名单删除也会失败，名单里的条目不再被检查时同样失败；机器上没有这份副本时跳过文本检查〔已实现〕。门禁不读本机桌面版的安装包（随自动更新变化，用户打过补丁），也不读 `reference/ZCode` 源码：此前两者命中其一即算通过，3.16.2 源码仍含 3.16.3 的身份、Harness、Context management、工具检索与 Read 文本，会让 3.17.1 已删的行继续通过。start-plan 的系统提示文本全部受检：`ZCODE_SYSTEM` 的 `cliPrefix`、`stableSections` 与 `dynamicSections`（Dynamic Behavior 与 Context management 两节，2026-10-29 补上，项目图 `prompt-fixes`；此前只查前两项，补上时条目 442 → 444、受检行 269 → 285）；`tests/check-verbatim.spec.ts` 断言这三项的每段文本都在受检条目里。3.17.1 的 Harness 系统轮 bullet 由三元分支与尾句在模板插值点拼成，渲染后的整行不是包里的连续子串；门禁把 start-plan 身份节里渲染出的这一行拆成分支句与尾句分别比对（`systemTurnPieces`，两个分支取自镜像文件 `zcode-harness-text.ts`），只对这两种渲染行生效。2026-10-30 门禁对照 3.17.1 副本：489 段、292 行受检，已知偏差 0。`reference/` 不入库，git worktree 里没有：门禁经 `scripts/reference-dir.mjs` 先找检出自己的 `reference/`，没有就读主检出的（仓库公共 git 目录的上一级），所以 worktree 与主检出比对同一份副本，不需要复制、链接或环境变量。
- 镜像文件：整份文件都是逐字声明的源文件（`src/toolsearch/zcode-text.ts`、`src/glm-prompt/zcode-tool-text.ts`、`src/glm-prompt/zcode-harness-text.ts`、`src/glm-prompt/zcode-compact-text.ts`、`src/glm-llm/zcode-wire.ts`、`src/shared/zcode-notice.ts`），门禁抽出其中每个字符串与模板字面量片段逐行比对，模板按插值点切开。这样带插值的模板也能逐片检查。镜像文件里不能出现正则字面量和除法，扫描器不解析它们。
- 镜像文件的导入〔已实现 2026-10-29，split 第 1 步〕：文件开头（头注释之后）可以有一段单行导入语句（`import …`、`export … from …`），即导入块。切字面量之前只去掉导入块里的语句行，模块路径不算逐字声明，导入块之后的内容一个字符都不去，所以模板里以 `import ` 开头的原文行、`zcode-tool-text.ts` 里 `"… from the user's profile."` 这种句子照常受检。值导入只许来自其他镜像文件，`import type` 只许来自 `src/shared/`，导入带不进没有检查过的文本。导入块之后再出现导入或再导出语句就失败（写成多行的导入让导入块在它的第一行结束，同样失败）；这一条在去掉注释、字面量内容换成空白的代码文本上判定，字面量里的文字不会被当成语句。门禁通过时报告受检行数（不短于 13 个字符的行）。上线时（2026-10-29）条目从 443 变为 442：少的是 `zcode-tool-text.ts` 里从未受检的模块路径 `'./json.ts'`；受检行数前后都是 269，没有放宽任何文本的检查。用例在 `tests/check-verbatim.spec.ts`。本地化的组合（删去哪几行、改写哪几行、删去或追加哪些字段）写在镜像文件之外；标 `localized` 的别名规格（Grep、Bash）不再整段比对描述，由镜像文件的逐片检查覆盖其原文部分。
- 已知偏差：无（2026-10-28 起名单为空）。名单机制保留，以后出现新的待重建文本时仍按只减不增处理。

### 5.10 ZCode 的工具检索机制（3.16.3；3.17.1 只改了增删公告）

〔实读，3.16.3 安装包 `zcode.cjs` 与源码 `tool/search/`（3.16.2）〕

- 模式：`off` / `local` / `native` / `auto`。桌面版设置 `toolSearchMode` 默认 `off`，CLI 参数 `--toolsearch-mode` 默认也是 `off`。默认配置下所有工具直接加载，没有 ToolSearch，也没有 deferred。
- `native`：模型侧支持服务端工具检索时使用；工具名 `ToolSearch`，检索返回的 schema 加载后可直接调用。
- `local`：客户端检索。3.16.3 把检索工具改名为 `LocalToolSearch`（`toolSearchNameForMode`，注册名仍是 `ToolSearch`，`LocalToolSearch` 是别名），描述换成 local 版本；deferred 工具经 `DeferredToolCall({name, input})` 包装调用。3.16.2 源码里 local 模式仍叫 `ToolSearch`。
- 名单公告：deferred 工具名不写进系统提示词，而是作为附件以 `<system-reminder>` 包裹的用户消息递送。local 模式的开头是「The following deferred tools are available via LocalToolSearch. Use query … then call them through DeferredToolCall with {name, input}. Call resident tools directly:」，native 模式是「…are now available via ToolSearch…」。名单变化时补发新增、恢复、移除的公告；增量事实随公告落盘。3.17.1 把恢复与移除的文案按来源拆开，并记下仍注册但被隐藏的名字（§5.7）。系统提示词里没有 deferred 声明段。
- 哪些工具延迟：只有声明了 `shouldDefer` 的工具与 MCP 工具。常驻：Read、Write、Edit、Glob、Grep、Bash、ApplyPatch、Agent、Skill、Workflow、GoalRead、AskUserQuestion、ToolSearch、DeferredToolCall。延迟：TodoWrite、TodoRead、WebFetch、WebSearch、Cron 族、计划模式进出、SendMessage、TaskOutput、TaskStop、工作流管理族、`js` 等。
- 检索：`select:a,b` 精确选择（含别名，常驻工具也可选），否则按名称分词、描述与 searchHint 打分，`+词` 表示必须命中，默认返回 5 个；3.16.3 的描述与 `query` 参数说明都写明不支持正则。
- local 模式的结果：匹配到的定义以 `<functions>` 块内一行一个 `<function>{description,name,parameters}</function>` 回到工具结果里，后跟 `<system-reminder>` 包裹的「Loaded: … Call it now with DeferredToolCall … No additional LocalToolSearch is needed …」提示；最近一条助手消息之前已经交付过的定义再搜，回「Tool definitions already available …」提示；没有匹配时回「No matching deferred tools found. Loaded tools are not searchable here …」。
- `DeferredToolCall({name, input})`：只接受当前目录里的延迟工具；对常驻工具或控制工具本身回「Call X directly using its normal tool call; DeferredToolCall only accepts deferred tools.」。包装在派发前还原为目标调用，历史里记录目标身份。
- 更正（2026-10-27）：本节初版按 3.16.2 源码记载 local 模式的工具名与文案，与 3.16.3 安装包不符；移植时对照安装包发现并更正。
- 定案〔用户 2026-10-27〕：本项目默认开启工具检索，实现与 ZCode 一致。没有服务端检索能力时，ZCode `auto` 模式回落到 `local`，本项目按 `local` 语义实现。DSH 独有、ZCode 无对应的工具按 MCP 工具的规则处理（延迟）；有对应的随对应工具的常驻 / 延迟属性。

### 5.11 子目录指令（别名 Read、Write、Edit）

〔实读 + 实测，2026-11-07；依据与证据等级见 `.agents/tasks/glm-subdir-instructions/report.md`〕

缺口：rc.3 的 `dsh-agent-instructions` 在原生 `read`、`write`、`edit` 成功触碰会话工作目录之下的文件后，于下一次请求追加一条 `agent-instructions` 消息，列出工作目录到该文件所在目录之间每一层的 `AGENTS.md`、`CLAUDE.md`、`AGENTS.local.md`、`CLAUDE.local.md`（agent-instructions:1210–1221、1425–1445）。触发表按执行的工具名匹配；GLM 路由上模型调 ZCode 别名，别名执行时 `exec.name` 仍是 `Read`、`Write`、`Edit`（tools:3232），所以这条路径上没有任何子目录文件进入上下文。

ZCode 3.17.1 不送子目录指令：它只在会话开始解析一次用户指令，来源是 `~/.zcode/AGENTS.md` 与从工作目录向上到项目根的最近一份 `AGENTS.md`（`cPs`、`fPs`，zcode.cjs 行 1994、1996），没有向下的发现，也没有由工具触发的加载。所以别名路由的现状与 ZCode 一致，补上是对 ZCode 请求的偏离（§5.8 第 22 项）。

实现（`src/glm-prompt/subdir-instructions.ts`，配置键 `subdirInstructions`，缺省关——2026-11-10 人定报告 §7 的 C：合入不改变默认请求，要子目录规则的 profile 自己设 `true`，缺省值去留等 L4 在 GLM 真会话里看过一次再定）：

- 不动工具面：别名的名字、描述、schema 与执行体都不变，不经注册表再派一次调用（再派会让 `tools/pre-execute`、`tools/post-execute` 上的 guard、规则板、指标、经验、权限各看到一次原生调用）。
- 复用 `installStepNotice`（`agent/pre-step`，GLM 步才发）：从请求可见历史找成功的 `Read`、`Write`、`Edit` 调用（有结果且不是错误）的 `file_path`，相对路径按会话工作目录解析；路径在工作目录之下时，取工作目录（不含）到文件所在目录的每一层，读宿主同一组候选文件（顺序同宿主：`AGENTS.md`、`CLAUDE.md`、`AGENTS.local.md`、`CLAUDE.local.md`；同目录里修剪后内容相同的只留一份，空文件与超过 1 MiB 的不送）。
- 一步一条 user 通知，来源 `glm-subdir-instructions`，外包 `<system-reminder>`，每份文件的段落文字取宿主 `additionalSectionText` 的原文（「Additional instructions from: <相对项目根的路径>」、适用范围一句、指导一句、内容）；整批 64 KiB，超出先丢浅层再截最深一份，与宿主的预算规则一致。通知排在被认领消息之后、其余提醒之前，与宿主自己的指令消息位置一致。
- 状态来自历史：通知的来源事实 `dirs` 记下已送的目录，宿主的 `agent-instructions` 消息的 `changes[].path` 也算已送（会话中途换过路由时不重复）；压缩把通知压掉之后，再触碰才会重送，与宿主一致。没有文件的目录每步重查一次（几次 `stat`），之后写进去的文件也能送到，与宿主每次触碰重查一致。
- 与宿主不同处：不做「文件改了整份替换」和「文件删了声明移除」（宿主每步按版本重查已加载的文件，这里只送一次）；只认直接调用的 `Read`、`Write`、`Edit`（三者都是常驻工具，不经 `DeferredToolCall`）；预算 64 KiB、单文件 1 MiB、候选名与 `.git` 标记是固定常量，不跟宿主行的配置走；空文件与只含空白的文件不送（宿主送一段空内容）；段落外框用 `wrapSystemReminder`（改写任何 `<system-reminder` 标签），宿主只转义结束标签；相对 `file_path` 按现在的工作目录解析，不是调用当时的；直接读文件系统，不经宿主的 fs 服务；去重只有一个方向（宿主已送的算已送，本通知送过的宿主不知道，会话中途从 GLM 路由换回原生路由再触碰同一目录会重送一次）。
- 读失败（除「不存在」以外的探测与读取错误）、会话没有工作目录、构建通知时的意外错误：每个 agent 告警一次，该步不带这部分通知，下一步再试（失败要出声，不拦步）。

请求偏离：缺省关，缺省请求与现状逐项相同；开启后，GLM 请求在触碰子目录文件之后多一条 user 消息，文字用宿主的措辞，不是 ZCode 的任何文本。基线里 DSH 的 `agent-instructions` 消息已经是 ZCode 没有的形态（ZCode 把指令放进 `Request User Context` 元消息），峰时提醒、编排层的图投影也是 ZCode 没有的 user 通知，所以偏离的形态不新；对 1.5 倍用量（`risk-signing`）的影响没有验证，与那几条同一等级。与经验行路径提醒的交叠：路径提醒按调用名判「DSH 会送」（`src/lessons/path.ts` 的 `hostDelivers`），别名 `Read`、`Write`、`Edit` 不在触发表里，GLM 路由上它照送组件 `AGENTS.md` 正文，也不看本通知——开启时同一组件首触的正文会在路径提醒与本通知里各出现一次（`ORCHESTRATION.md` §8.6 的路径提醒一行）；这是开启的已知代价，两条机制合流时再清。

## 6. 注入约定〔定案〕

方言层与编排层都要往对话里放 harness 生成的内容（提醒、投影、检查结果、纠偏），约定如下：

1. 格式：用 GLM 熟悉的 `<system-reminder>` 形态，写短，位置固定。ZCode 自身以这种形态递送 deferred 名单与提醒（§5.10）。
2. 位置：动态内容放在对话末尾，不放进系统提示词。系统提示词保持稳定，以免每一步都让提示词缓存失效。按积分公式，GLM-5.3 缓存命中系数 1.7、普通输入 6.9，命中部分约省四分之三（`FACTS.md` §2.4）。
3. 通道：沿用 `tools/post-execute` 的 `additionalContexts`（带来源标签的合成 notice，与 DSH repeat-tool-reminder 同一机制），或 `agent/pre-step` 的消息修正（工具检索公告、todo 提醒、高峰提醒与项目图的每步投影用这一条）。notice 必须带 `id` 与 `role`（`src/shared/dsh-min.ts` `createUserNotice`，§2.4a）。不叫醒的提示一律经 `src/shared/step-mailbox.ts` 放进下一步，不调 `agent.inject`：桌面宿主把非空收件箱算作运行中的任务，退出要确认，宿主关停时还把它清掉（`FACTS.md` §3）；`src/` 里直接调 `agent.inject` 的只剩步前待送的退回路径与循环板送运行中会话的一处，L2 `tests/step-mailbox.spec.ts` 钉住这份名单。方言与编排层用的是公共库里同一套工具：每步 notice 接缝 `src/shared/step-notice.ts`，包装 `wrapSystemReminder`（`src/shared/zcode-notice.ts`）。
4. 来源标签唯一，便于审计与用量归因。

## 7. 降级与上报

行健康已实现（§2.5，2026-10-28）；签名与端点路由的状态、用量记录的签名标注仍属规划（§4.3）。

| 行 | 故障或禁用时 | 上报位置 |
| --- | --- | --- |
| glm-llm | GLM 通道不可用，其他 provider 不受影响；coding-plan 拿不到项目令牌时同样不可用，不退回 API Key（§4.1） | 行健康（`/glm-status`） |
| glm-llm 签名 | 无签发送 | 状态、用量记录的签名标注〔规划〕 |
| glm-llm 路由 | 保持原 URL | 状态〔规划〕 |
| glm-prompt | 退回 DSH 原生工具面与文案 | 行健康 |
| 汇报细度的常设档（glm-prompt 读记忆行的服务） | 没有服务或人没定过：用配置的 `persona`，不报；服务形状不对、`depth` 抛错、给出不认识的档：同样用配置的 `persona`，控制台每种原因告警一次，该会话的 glm-prompt 行健康降级；记忆行读不出流水：`depth` 给 `undefined`，该会话的 memory 行健康降级 | 告警、行健康 |
| glm-compact | 压缩请求原样放行，profile 原有压缩照常 | 行健康 |
| 工具检索（glm-prompt 内） | `toolSearchMode: off` 或会话历史不可读时全量直载 | 行健康（glm-prompt 一行的说明） |
| data | 不写用量流水；违规与决策只由配了 `home` 的行写；`/hourness` 写明缺哪个目录 | 行健康、`/hourness` |
| guard | 无门禁 | 行健康（显式禁用除外） |
| guard 影子兜底 | 组合里没有 workspace-changes：只少影子记录，门禁照常 | 行健康（guard 一行的说明） |
| memory | 行禁用：没有记忆工具、索引与用量流水，其余行不受影响；工具注册失败：全部撤掉；没有数据目录行：用户级记忆不可用、不记用量，项目范围照常；会话不在项目里：项目范围不可用（`no_project`）；`.llm/` 加不进忽略文件：这次写入得 `io`、不建 `.llm/`；旧 `memory.json` 读不出：读与写都报 `io`、不覆盖；流水读不出：工具报 `io`，索引这一步不全；命令、投影服务晚到：先没有，到了再注册；任何一种都不挡 agent | 告警、工具错误、行健康（§2.5） |
| lessons | 行禁用（出厂启用，人在插件管理器里关掉时）：没有经验工具、候选提醒与服务，派发的简报不带经验，其余行不受影响；工具注册失败：全部撤掉；会话不在项目里：`lessons_query` 答空并说明，合并与提议得 `no_project`；`.llm/` 加不进忽略文件：这次写入得 `io`、不建 `.llm/`；流水读不出：工具报 `io`，提醒这一步不发，失败的调用不带提醒，`relevant` 给空；失败匹配自己出错（读历史、读流水）：调用的结果原样，告警一次；命中写不下：提醒照给，告警一次；`propose` 对字段不合格或像密钥的候选答 `rejected`（什么都不写），对服务自己的失败答 `{error}`（派发一侧走退路批注，之后由本行导入）；取不到主 Agent 的判断：候选与复发提醒改发所有根 agent；任何一种都不挡 agent，也不拦任何调用（`ORCHESTRATION.md` §8.6） | 告警、工具错误、行健康（§2.5） |
| workflow / hourness | 无记录、无报告 | 行健康 |
| graph | 没有图工具、每步投影与图文件门禁；图目录缺失或图有校验错误时，工具照常注册并把问题报给模型，投影注入一条说明；读图抛错时本步不带投影；会话没有工作目录时门禁只判断绝对路径 | 告警、工具错误、行健康（§2.5） |
| graph-panel | 命令注册失败时面板写不进图；现场投影注册失败时面板没有现场，写入照常 | 告警、行健康 |
| rules | 行禁用或没提供服务：没有档位可读，派活照原来的槽位，GLM 提醒照原文，guard 不写规则板那一行；`/rules` 注册失败：档位改不了，已存的照常交出；`rules_show` 注册失败：agent 读不到规则，门照常；门装不上：这一行不执行任何规则，只显示；没有计价服务或 `peak` 出错：读不出是不是高峰，三档都不起作用；读状态或判定出错：这一次调用放行，行健康降级；存档坏了按变更记录重建，仓库里的规则文件被规则板以外改过时不生效；等待单写不成：这次调用照样拒绝，文字说没记下，要 agent 自己重试；唤醒发不出：子 agent 的单转给派发它的 agent 再发一次，其余的单取消；宿主没有 `agents` 服务或读它抛错：不转交、不唤醒、不取消，单留着；心跳写不成：下一个周期再写、告警一次，别的宿主 45 秒后按 `host-gone` 过期它的单，拥有者给原来的 agent 发一次说明；不做档的 goal 没暂停成：单上记 `pauseFailed`、照样排队，行健康降级，拒绝文字说没暂停成；没恢复成：唤醒文字带原因并叫 agent 告诉人，单照样转 `done`，行健康降级，人用目标条或 `/goal resume`；单写不成时把刚暂停的 goal 恢复回去；卸载时 `goals.resume` 抛错或写不进锁：单留着，下一次激活接手，写入至多等 2 秒；规则板自己出问题一律放行（`ORCHESTRATION.md` §16、§16.11、§16.13） | 告警、行健康 |
| design | 行禁用或没注册上 `/wish`：没有主 Agent，其余会话不受影响；会话状态服务没到、状态没注册上：`/wish` 拒绝开启，服务到了之后自动恢复；持有者记录读不到：按会话状态判是不是主 Agent，行健康说再发一次 `/wish`；指向没生效的 `/wish` 的记录删不掉：记录留着，那个会话的行健康说发 `/wish off`，别的会话的 `/wish` 照样接管；会话状态读不出：这一步当作普通会话；让别的会话退出主 Agent 没成功：那个会话的身份节、工具面仍按记录判为普通会话，只有它的流程条和按钮显示得不对，直到下一次对齐；工具面里的 `str_replace_editor` 形状不认识：去掉它。降级不挡任何普通会话（`ORCHESTRATION.md` §3.1） | 告警、行健康（§2.5） |
| loops | 行禁用或服务提供不上：没有登记表，要交条目的行读不到服务，照自己的退路做（执行行自己执行事件条目），行健康说原因；一份交来的东西被整份拒绝：已有的那一份不动，行健康写原因；几项不合：那几项丢掉，其余照常，行健康写字段路径与原因；条目等一个没人声明的事件：灰显、不跑，事件一到转为生效；事件到了而条目合不上它：条目丢掉，行健康写原因。存储（§18.7）：`.llm/loops/` 建不起来或写锁取不到，这一次不写（`/loops` 回「循环板正忙，没记上，再打一次」），记录已追加的改动下一次读时补上；git 在合并、变基、拣选、回退、二分或占着索引时不写 `docs/loops/`，改动已生效、文件欠着，标记消失后补上；改名失败留着临时文件、下一次读补上；条目文件在循环板之外被改、读不出、不在这份检出里：那一项不跑，页面写明，`/loops restore` 能按记录写回；变更记录末行没写完就截掉并另存，中间坏一行就跳过、另存、等人 `/loops ack`；没有批准记录的条目只读入、标 `unadopted`、不跑。门（§18.8）：装不上则没有什么拦着别人写循环板的文件（行健康写明），判不出来的调用照常放行（告警一行），流水写不进不改变判定。运行时（§18.9）：没有会话控制器就不提供服务、不跑条目、不起拍（写一行，不降级，交条目的行照自己的退路做）；运行锁在别的进程手上就不跑这个项目，锁的文件读不出、改不了名就这一拍不跑；收件箱写不进时按 1、3、6 秒重试三次再回 `busy`/`io`（调用方不必重试，漏掉的那一次由图上的事实与夜间巡检兜住）；收件箱里读不懂的行跳过并计数，躺过 7 天的记 `expired`；`state.json` 读不出就按空的重建（这一次不补处理停机期间的事件）；运行记录写不进只写一行 info，不挡运行；harness 动作抛错、不回答（6 小时）都记 `failed`；投递的接缝还不在时「告诉主 Agent」记 `held`、原因 `holder-unreadable`，消息不丢；脚本与检查的条目一律 `refused`（`unadopted`、`check-missing`），不起进程（`ORCHESTRATION.md` §18） | 告警、行健康（§2.5） |
| env | 行禁用或提醒装不上：没有环境提醒，会话照常；图行不在或图读不出：提醒只带草稿区一行（行健康写明）；`.llm/` 的忽略行写不进或复核仍可见（`.gitignore` 的反向模式）：照常写运行时记录（记录不能丢），行健康降级并写原因（`ORCHESTRATION.md` §7.1、§7.4）；循环板不在：M4 自带的检查不跑，环境提醒与检查提醒各说一次，行健康写「循环板不在：改完文件不跑检查」；检查跑不起来、被执行器拒绝（检出不在项目里）或输出读不懂：提醒写明原因与日志，每一次都进行健康（哪一项与原因的第一行）并降级，这一项下一次读得出的运行撤回，连续 3 次后本会话不再跑那一项，行健康写明；超时：提醒写明上限与下一次的上限，行健康写明哪一项、上限与实际耗时，不降级，这一项下一次跑完撤回；超时的账读不出或写不进：按没有实测算，检查照跑，行健康写明；上限设置（`limits.jsonl`）读不出：按没有调高算，检查照跑，行健康写明，明细与晨报不写「上限已调高」；`check_limit` 写不进设置：返回 `unavailable`，上限不变；宿主没有工具服务：不注册 `check_limit`，被截住的那一行照样提醒；检查行读不懂：那一行不跑，行健康写明，不提醒模型 | 行健康 |
| 编排层包 `dsh-hourness` 缺席（只装 GLM 包） | GLM 会话照常：通道与登录、方言、工具检索、高峰提醒；没有图工具、记忆工具、guard 与用量流水，`/hourness` 不存在；`glm:memory` 节随记忆工具一起不出现（§5.2） | `/glm-status`：编排层包只占一行，行「全部」、状态「未加载」 |
| GLM 包 `dsh-glm-zcode` 缺席（只装编排层包） | 编排层对所有路由照常：图工具与每步投影、图文件门禁、记忆与用量流水、`/hourness`（没有计价服务，面板按调用与 token 列）；guard 行照样拦截并声明规则（所有路由，`ORCHESTRATION.md` §6.2），纠偏与声明用原生工具名；没有 `/glm-status` | `/hourness-status`：GLM 包只占一行，行「全部」、状态「未加载」 |

激活期（`apply`）不抛错：配置缺失降级为 warn 与 no-op，因为激活失败会拖垮宿主启动（2026-10-27 事故）。降级必须上报，不得只打一行警告（`CHARTER.md` §7.1 条款 7）。

## 8. 契约与适配层

- adapter：`ZcodeAdapter` 底部有编译期检查 `AdapterContractCheck`，对照官方 `LlmAdapter` 类型〔实读〕。
- 事件钩子与服务：结构类型逐项对照 rc.3 运行时包，证据见 §2.4a 接口对照表〔实读 2026-10-28〕。官方 `.d.ts` 只装了 `dsh-llm`、`dsh-attachment`、`cordis` 三个包（新增开发依赖须用户批准），装了的地方加编译期检查：`LlmStreamOptionsContractCheck`（`GenerateOptions` 覆盖 `llm/stream` 监听器读取的字段）、`LlmCatalogContractCheck`（`LlmRuntime` 的 `listModels`、`resolveModelInfo` 满足执行行读的形状）、`AttachmentsContractCheck`（`AttachmentStore` 覆盖通道读图用的成员）。其余接口没有官方类型可对照，靠对照表与 L3 探针。
- 适配层：薄适配层是 `src/shared/dsh-min.ts`（宿主钩子、服务、载荷、命令、会话）与 `src/shared/lm-min.ts`（LLM 消息与流的词汇、附件服务成员）。各行只从这两个文件取宿主类型；GLM 模型目录在 `src/glm-llm/models.ts`，不属于适配层〔已实现 2026-10-28〕。cordis 的两个形状 `ServiceLookup`、`ProvideHost` 声明在 `src/shared/cordis-min.ts`（不导入 Node 内置模块），`dsh-min.ts` 原样重新导出：客户端包要做类型检查的公共库文件（`peak-mode.ts`、`health.ts`，规则板页面经 `src/rules/view.ts`、`src/rules/model.ts` 用到它们）从它取，因为 `dsh-min.ts` 导入 `node:crypto`，`ui/tsconfig.json` 没有 Node 的类型〔已实现 2026-11-05〕。
- 公共库：适配层所在的 `src/shared/` 是两包的公共库（目录归属见 `scripts/packages.mjs`）。除适配层外还有路由判定、数据目录、行健康、JSON 值类型 `json.ts`、每步 notice 接缝 `step-notice.ts`、两包都用的 ZCode 原文 `zcode-notice.ts`（镜像文件，§5.9），以及两包之间的契约：工具名 `tool-names.ts`、方言服务 `dialect.ts`（§5.4）、计价服务 `pricing.ts`（`ORCHESTRATION.md` §11.3；GLM 积分公式本身在 `src/glm-llm/credits.ts`，不在公共库）、会话原文服务 `transcript.ts`（§2.4「会话原文」；导出本身在 `src/data/transcript.ts`，不在公共库）。它不导入任何包目录；GLM 目录（`glm-llm`、`glm-prompt`、`toolsearch`）与编排层目录（`data`、`guard`、`memory`、`workflow`、`report`、`graph`、`rules`、`execute`、`design`、`loops`）互不导入，类型导入也算，由 ESLint 按目录表检查（`DEVELOPMENT.md` §10）〔已实现 2026-10-29，split 第 1 步〕。tsc 顺着导入把用到的公共库文件编进每个包的 `dist/shared/`，两个包各有一份产物、各是一份模块实例；所以公共库只放常量、类型与纯函数，不持有跨行共享的模块级状态，跨包的状态只走 cordis 服务。vendored `schemastery.ts` 有上游原样的模块级状态，今天只被 GLM 包导入，编排层以后用它声明 `Config` 时要核对两份副本的影响并给编排层包加 `@deepseek-ai/cosmokit` peer〔split 第 5 步〕。图行与 guard 行、设计行之间的契约 `glmHournessGraph` 都在编排层，放在 `src/graph/service.ts`：`dirFor`、`isGraphTool`，和第 5 步加的 `focusOf(session)`（会话的焦点，取法与每步投影相同：可见历史里最后一次成功的 `graph_focus` 调用或投影 notice，历史里没有时取 `graph_focus` 记在内存里的；只读）。设计行的阶段提醒与 `design-before-release` 读 `focusOf`，各个读者只检查自己调用的成员（`graphService`、`graphFocus`）。
- 回归：L3 沙盒真实启动加行为探针做成门禁；每次 DSH 升级先跑一遍（`DEVELOPMENT.md` §3、`ROADMAP.md` M1.7）。

## 9. 开放问题

| 项 | 验证路径 |
| --- | --- |
| 原生通道在 DSH 真实会话中端到端可用 | L4 真机（需用户） |
| 签名握手失败的根因与 3.16.3 协议变化 | 对照 zcode-api 与本机 ZCode 3.16.3 机制 |
| start-plan 真机授权 | L4 |
| GLM 端点的请求级图片上限（张数、总字节）；超限时本通道不发 `IMAGE_OFFLOAD_REQUIRED`，会话会卡在上游报错（§4.5a） | 查 bigmodel 文档或实测；必要时按实测上限发卸载信号 |
| 原生通道读图在 DSH 真实会话中可用（GLM-5.3-Flash） | L4 真机读图 |
| native ToolSearch 透传（K2）、服务端 web 工具闸门（K4） | 需活 token 实测 |
| beta 头、OutputStyle 列表、实跑采样参数 | 抓包 |
