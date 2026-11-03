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
│  ├─ graph、graph-panel（项目图与面板写入）
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
| `glm-hourness/memory` | `dsh-hourness` | `dist/memory/index.js` | 编排 | 记忆工具、会话开局的记忆索引、`/memory`、服务 `glmHournessMemory`、会话投影 `hournessMemory`，以及每次模型调用的用量流水（`ORCHESTRATION.md` §8；M5 步骤 M1）。学习流水线（M5 步骤 G1，`ORCHESTRATION.md` §8.5）：只读工具 `learning_signals`（主 Agent 的延迟工具）和每七天至多一次、给主 Agent 的学习摘要提醒（`src/memory/notices.ts`，来源 `glm-hourness-learning`），后者先在项目的记忆流水里记一条 `learn-notified` 再发。项目目录跟会话的工作区，行配置 `home` 不再使用；不注册任何 `tools/pre-execute` 监听器 |
| `glm-hourness/lessons` | `dsh-hourness` | `dist/lessons/index.js` | 编排 | 经验板（`ORCHESTRATION.md` §8.6；M5 步骤 L1）：项目踩过的坑与解法，存在项目的 `.llm/lessons.jsonl`；查询工具 `lessons_query`（所有 agent）、合并工具 `lessons_merge`（主 Agent）、服务 `glmHournessLessons`（派发工作的一侧读写）、给主 Agent 的候选与复发提醒、失败的调用结果里的经验提醒（M5 步骤 L2，`tools/post-execute`）、`/lessons`、会话投影 `hournessLessons`。经验是建议不是规则，不注册任何 `tools/pre-execute` 监听器；唯一的工具调用监听器在 `tools/post-execute`，只往结果里加提醒。默认禁用，L3 场景 `glm-lessons`、`non-glm-lessons`、`glm-lessons-failure` 与 `non-glm-lessons-failure` 通过后、桌面版首轮验收前保持禁用 |
| `glm-hourness/workflow` | `dsh-hourness` | `dist/workflow/index.js` | 编排 | 仅记录派遣类工具调用，记录是 `{at, kind, subject}`，没有分级（`ORCHESTRATION.md` §5） |
| `glm-hourness/hourness` | `dsh-hourness` | `dist/report/index.js` | 编排 | `/hourness` 命令：晨报与用量面板；晨报的「等你定的事」一节读调用会话所在的项目图（经图行服务 `glmHournessGraph` 的 `dirFor`，`ORCHESTRATION.md` §5），读不到时写原因；面板经计价服务按积分列，没有计价服务时按调用与 token 列（`ORCHESTRATION.md` §11.2、§11.3）；`/hourness-status`：两个包各行的健康（§2.5） |
| `glm-hourness/graph` | `dsh-hourness` | `dist/graph/index.js` | 编排 | 项目图工具、每步投影与图文件门禁（`ORCHESTRATION.md` §2.5、§2.7、§2.10）；2026-10-28 经 L3 探针与 L4 桌面版验收后默认启用 |
| `glm-hourness/graph-panel` | `dsh-hourness` | `dist/graph/panel-row.js` | 呈现 | 面板写入命令 `/graph-apply`、运行控制命令 `/graph-run` 与现场投影 `graphLive`（`ORCHESTRATION.md` §2.10） |
| `glm-hourness/rules` | `dsh-hourness` | `dist/rules/index.js` | 编排 | 规则板（`ORCHESTRATION.md` §16）：每个项目的规则（人设的，存在仓库里）与高峰模式档位（无影响、少做、不做，默认少做）。`tools/pre-execute` 上最外层的门（`src/rules/gate.ts`，`ORCHESTRATION.md` §16.11）：内层放行之后，先守规则板自己的文件（`rules:files-only`，规则目录、各工作树的同一相对路径、`.llm/rules/`，直接调用与 `run_code` 子调用都判），再按规则判定，拦截的调用不执行、四段式理由，只记录的写一行 `mode: 'record'`，违规流水里的规则是 `rules:<id>`；人设的规则的排队得一张等待单（`src/rules/tickets.ts`，`ORCHESTRATION.md` §16.12）：同会话同签名的再次调用复用这张单，拥有它的宿主每 5 秒重判，规则不再挡时转 `cleared` 并按 agent 的状态用 `steer`、`inject` 或 `followup` 发一条消息，子 agent 的会话结束时单转给派发它的 agent（`session/disposed`，兜底是登记里找不到），24 小时、30 分钟没回来、宿主心跳过期三种过期；不做档在 GLM 高峰里把 GLM 子 agent 的工具调用排成每会话一张单并暂停它的 active goal，单结束时先恢复 goal 再叫醒，派 GLM 子 agent 的调用是普通的单（`src/rules/goal.ts`、`tickets.ts`，`ORCHESTRATION.md` §16.13），新宿主在会话出现时接手前一个宿主留下的不做档的单，行卸载时恢复自己暂停的 goal。每步提醒（`src/rules/reminder.ts`）只列只告知的规则与 agent 自己的单，主 Agent 的第一行说高峰与档位，变化时才注入；宿主在有活会话的项目里每 15 秒写心跳（`src/rules/heartbeat.ts`）。agent 的工具 `rules_show`（对调用者生效的规则、等待单、信号与档位，不截断）、人的命令 `/rules`（`show`、`peak`、`lift`、`delete`、`on`、`off`、`set`、`clear`、`let`、`cancel`、`recovery`，各写自己的操作）。提供服务 `glmHournessPeakMode`（契约在 `src/shared/peak-mode.ts`）与 `glmHournessRules`（一个成员 `declaration`，guard 的 `glm:guard` 节读它多写一行，`src/rules/service.ts`）；不挡主 Agent，不暂停它的 goal。规则板的纯核心（四个事件、规则模型与校验、判定、默认规则与它按档位启用的四条附属条目，`src/rules/{events,model,judge,signals,builtin}.ts`，`ORCHESTRATION.md` §16.8）由门、`rules_show` 与 `checkCall` 调用。存储是整块规则板的完整形状（规则、信号、检测器、脚本钉、等待单、提醒，仓库里的规则文件，以及人处理「文件被别处改过」的两条写路径 `adoptRepoLocked`、`restoreRepoLocked`，`src/rules/{model,entries,store,repo}.ts`，`ORCHESTRATION.md` §16.3），行的写入口 `/rules` 只写不需要提议的操作。代码规则目录 `CATALOG`（`src/rules/builtin.ts`）把 guard 框架的规则 `GUARD_RULES`（`src/guard/catalog.ts`：`guard:workspace-containment`、`guard:file-tools-only`、`graph:graph-files-only`，`mode` 恒为 `enforce`）映射成 `<行>:<id>`，契约测试 `tests/contracts.spec.ts` 核对每个 id 都是对应行装上的规则对象的 id。默认启用（2026-11-04 的启用提交起）：L3 场景 `rules-peak`、`rules-peak-stop`、`rules-peak-stop-exit`、`rules-peak-hourness`、`glm-rules` 与 `non-glm-rules` 全部在 main 通过后启用，桌面版首轮验收仍欠 |
| `glm-hourness/design` | `dsh-hourness` | `dist/design/index.js` | 编排 | 主 Agent 模式（`ORCHESTRATION.md` §3.1、§3.5；M3 第 3 步）：命令 `/wish`（开启；`here` 把主 Agent 从别的会话移过来；`off` 退出）、会话投影 `hournessMainAgent`、每个项目的持有者记录（用户级目录的 `main-agent/` 下，一个项目一个主 Agent，`src/graph/main-agent-holder.ts`）、身份节 `hourness:main-agent`（§5.2）、主 Agent 的工具面（去掉写文件的工具与 `ask_user_question`）、阶段提醒（第 5 步，`agent/pre-step` 的 notice，来源 `glm-design-stage`，`src/design/stage-notice.ts`）、`tools/pre-execute` 上的执行边界规则 `main-agent-no-write`、`main-agent-ask`、`git-snapshot`（第 4 步）与 `design-before-release`（第 5 步，`src/guard/main-agent.ts`、`design-release.ts`，`ORCHESTRATION.md` §6.7、§6.8）。第 6 步（`m3-5`）加：工具 `propose_to_human`、`record_human_answer`（`src/design/propose.ts`、`record.ts`，只给主 Agent，别的会话的工具面去掉它们，`ORCHESTRATION.md` §3.1）；会话投影 `hournessTalk`（`src/design/talk.ts`：人发来的消息与给人看过的东西，注册不上时退回读会话日志，行健康降级）；别的组件的提议带原文的分派表（`src/design/attach.ts`，现在是空的）；指标事件的出口（`src/design/metrics.ts`，现在不做事）；图写入的三条规矩 `main-agent-graph-relay`、`main-agent-graph-options`、`main-agent-graph-delegations`（`src/guard/main-agent-graph.ts`，`ORCHESTRATION.md` §6.9）；子 agent 带 `relay` 的尝试通知持有者（行健康与 `glm-design-bypass` 的 notice）。第 8 步（`m3-2`）加：两个工具的 `confirm` 一种（`propose_to_human` 把需求交给人、不写图，要求需求卡 8 项齐；`record_human_answer` 记人的回话，同意时重查需求卡、批准目标并把阶段改成 `design`，两条写入都带人的原话，`ORCHESTRATION.md` §3.1）；图写入的两条规矩 `main-agent-graph-stage`、`main-agent-graph-cli`（所有会话，同一个监听器，`ORCHESTRATION.md` §6.9），子 agent 与普通会话想把目标推向前或用命令行带转述的话写图的尝试同样通知持有者。第 9 步（`m3-3`、`m3-4`）加：两个工具的 `release` 一种（把设计交给人、记下人的同意并放行；没分模块的目标放行一次，分了模块的目标放行两层，框架、模块清单与方向清单一次、每个模块一次，各带一页放行稿 `page`，`ORCHESTRATION.md` §3.1、§4.5、§4.9；`src/graph/stage.ts` 的 `releaseGate`、`bigLoopSet`、`moduleSet`、`moduleReleaseGate`，`src/design/record.ts` 的 `releaseWrites`、`pageDigest`）；引擎两处（`src/graph/engine.ts`：主 Agent 把模块退回设计不要人的原话，还没放行的模块下的任务出生为提议）；`main-agent-graph-stage` 的模块几支（模块下的批准与带原话的提议、新模块、清模块的阶段，退回设计只放主 Agent）；决策正文可选的一行「如果失败：」（解析时结束上一节，不是一栏）。人设一步（`m3-main-persona`）加：行配置 `persona: {name, text}`（`src/design/persona.ts`，`Config` 在 `src/design/index.ts`，插件管理器里能改，默认空），`text` 非空时给主 Agent 的组装加一节 `hourness:output-style`（§5.2），普通会话、子会话、审查者和主 Agent 移走之后的原会话都没有这一节；`glm-prompt` 行的汇报细度配置同时从 `persona` 改名 `reportingDepth`（§5.2）。默认启用（第 12 步（b）合入起）：上述 L3 场景全部在 m3 分支通过后启用，桌面版首轮验收仍欠 |
| `glm-hourness/loops` | `dsh-hourness` | `dist/loops/index.js` | 编排 | 循环板（`ORCHESTRATION.md` §18）：各行把自己的条目、事件和 harness 动作交给服务 `glmHournessLoops` 的 `contribute`（契约与读取函数在 `src/loops/service.ts`），登记表（`src/loops/registry.ts`）按名字空间、个数、字段和 `validateEntry`（`src/loops/model.ts`）逐项检查：合格的列出，不合的丢掉并带字段路径，会跑东西的 `script`、`check` 条目不收；条目点名的事件此刻没有谁声明时照样收下、灰显，声明一到就转为生效。行自己带三个事件（`loops.host-restarted`、`loops.waiting-on-human`、`loops.file-changed`，`src/loops/events.ts`）和四项条目（`src/loops/defaults.ts`：合进主干后查依赖、有事等你太久时再提醒、GLM 高峰开始与结束），别的行的条目表不在这个目录里。人的条目的存储（`src/loops/store.ts`、`journal.ts`、`model.ts` 的条目文件，`ORCHESTRATION.md` §18.7）：条目与脚本在仓库的 `docs/loops/`，变更记录、`repo-written.json`、写锁、临时文件与 `view.json` 在项目的 `.llm/loops/`（第一次建目录时经 `ensureIgnored` 把 `.llm/` 追加进 `<git 目录>/info/exclude`，目录里自带内容为 `*` 的 `.gitignore`）；判定按变更记录不按文件，`readBoard` 分出「对得上」「循环板欠着一次写」「在它之外被改」「不在这份检出里」「读不出」「从没见过」，写入是先追加记录并 `fsync`、再经 `.llm/loops/tmp/` 加改名落文件、最后更新 `repo-written.json`，git 正在合并、变基、拣选、回退、二分或占着 `index.lock` 时先不写。会跑东西的条目没有人同意的记录就只标 `unadopted`、不跑。人的命令 `/loops`（`delete`、`restore`、`ack`，`src/loops/commands.ts`）、会话投影 `hournessLoops`（给页面指路到 `view.json`，`src/loops/projection.ts`）、每个项目的对账与 `view.json`（`src/loops/boards.ts`、`view.ts`）。文件门 `loops:files-only`（`src/loops/guard.ts`，`ORCHESTRATION.md` §18.8）在 `tools/pre-execute` 上最外层（做法同 `src/guard/graph-files.ts`，不经 `installRuleGate`）：写任何一份检出的 `docs/loops/` 或项目的 `.llm/loops/` 的文件工具与 shell 命令一律拒绝，带 `parent` 的子调用照样判，读不拦，拒绝写项目违规流水并在 `src/guard/catalog.ts` 的 `GUARD_RULES` 里登记；guard 的 `glm:guard` 节按这一行的行健康多写一句（门在每个进程里都装着）。运行时核心（`src/loops/lock.ts`、`inbox.ts`、`run.ts`、`harness.ts`、`file-watch.ts`、`records.ts`、`channel.ts`，`ORCHESTRATION.md` §18.9）只在有会话控制器的进程里做（服务也只在那里提供，`ctx.inject(['sessionController'])`）：一个项目一把运行锁 `runner.lock`（60 秒一拍刷新，3 分钟没人刷新就接管并留痕），锁跟着主 Agent 的会话经 `handover.json` 交接；`emit` 把事件追加进项目的 `events.jsonl`（校验事件、载荷与去重键，写不进按 1、3、6 秒重试三次），持锁的进程按字节位置读、同一个键 7 天只跑一次（再来的记 `loop-duplicate`）、按去抖与每小时限次合并与攒着、一次运行自己引起的事件 10 分钟内不再触发同一项；循环行自己照 `state.json` 推出 `loops.host-restarted`、`loops.file-changed`（判定在 `file-watch.ts`：`fs.watch` 加每一拍比一次，静 60 秒才算）、`loops.waiting-on-human`（每小时读项目图）与 `channel.peak-changed`（照计价服务的高峰时刻，服务不在时不推，连第 13、14 项也不列）；每次运行写一对 `loop-fired`、`loop-done` 进 `runs.jsonl`（不写输出原文），harness 动作在带运行号的异步上下文里跑、至多 6 小时，`script` 与 `check` 的条目一律 `refused`、不起任何进程。绑定主 Agent 与投递（`src/loops/holder.ts`、`bind.ts`、`deliver.ts`、`remove.ts`、`reminder.ts`，`ORCHESTRATION.md` §18.10）：到点告诉主 Agent 的条目各绑一条 `dsh-schedule` 任务（由 DSH 投递并叫醒会话），一个函数 `holderStateOf` 说主 Agent 此刻能不能收消息（六种结果：记录读不出、模式已关、已归档、找不到、在别的进程里、能投；记录的位置收在 `holderRecordFor` 一处，M3 搬走时只改它），一个函数 `removeTask` 删任务（能证明是自己建的、能说出八种原因之一，先把整条写进 `removed-tasks.jsonl` 再删，写不进就不删），投递是带来源的合成 notice 并按唤醒表选 `steer`/`inject`/`followup`、`sessions.flush` 确认后才算投出、不能投时存着（50 条、24 小时）；第二道门 `loops:schedule-tools` 拒绝经 DSH 的定时工具改循环板的任务、也拒绝以 `Loop board: ` 开头的 `schedule_create`。高峰的开始与结束（`src/loops/peak.ts`，`ORCHESTRATION.md` §18.12）：`loops.peak-start` 是 `self` 条目，循环板只记一条 `delegated`（档位读规则板服务）；`loops.peak-end` 的动作跑设计 §6.9 第 4 条那张十行表（没有人可叫、别的进程写着手、接上 execute 行列出的 resume-drive（60 秒限）、读不到档位、少做与不做落穿、无影响、正在跑、按走步记录与按分钟倒走的高峰起点判「这段高峰里干过活」、goal 的暂停与挡住原因、开始挪开的活），等别的进程的判断存着重判标记、每一拍拿得到锁就再判、一天没判成作废；`view.json` 的 `peak` 一节只读规则板的档位；宿主工作区登记表列出的项目每一拍都开始跑。现在没有的：工具、页面、机器一级的运行者、脚本与检查的执行器。默认启用（2026-11-04 的启用提交起）：L3 场景 `loops`（条目认回、文件门、headless 里不跑条目）、`loops-peak` 与 `loops-peak-restart` 全部在 main 通过后启用，桌面版首轮验收仍欠 |
| `glm-hourness/glm-ui` | `dsh-glm-zcode`（客户端面） | `ui/index.js` | 呈现 | 设置页与输入框下的 GLM 按钮（§2.5），客户端入口 `ui/src/glm-client.js`；默认启用：2026-10-29 split 合入后的桌面版验收第一轮通过后启用，第二轮在桌面版上核对 |
| `glm-hourness/ui` | `dsh-hourness`（客户端面） | `ui/index.js` | 呈现 | 右侧栏「项目图」页签（需要你、agent 定的、正在做、图，`ORCHESTRATION.md` §2.10），客户端入口 `ui/src/hourness-client.tsx`；主 Agent 会话的流程条、新会话的 `/wish` 开场卡片与输入框下方的「交给主 Agent」按钮（`ORCHESTRATION.md` §4.8；读设计行的会话投影 `hournessMainAgent`，投影不在时三者都不显示）；沿用单包布局时已启用的行 id |

### 2.3 同仓两包与一包一源

同仓两包〔定案：2026-10-28 question-10 选 A；2026-10-29 question-17 选 B，profile 直接列两包，不要伞包〕：GLM 通道包 `dsh-glm-zcode`（`packages/glm`）与编排层包 `dsh-hourness`（`packages/hourness`）同仓维护，各自是多行 cordis 插件包，带自己的 `cordis.patch.yml`、`tsconfig.json`、显示信息（插件页与客户端行用的 `locale/{en,zh}.json` 与 `icon.svg`，导出 `./locale/*.json` 与 `./icon`；每个宿主行在设置页的标题 `locale/<行>/{en,zh}.json`，导出 `./<行>/locale/*.json`）、客户端面与构建产物 `dist/`。源码不搬家，仍在 `src/`；哪个目录属于哪个包、每个包插哪些行，只写在 `scripts/packages.mjs`。profile 直接列两个包，GLM 在前，放在原来单个 bundle 的位置，宿主行的组合顺序与拆分之前相同。根 `package.json` 只是开发工作区（脚本、开发依赖、`peerDependencies` 兜底），没有 `dsh`、`main`、`exports`，不是 bundle；根目录没有 `cordis.patch.yml`。两个包各自装上、单独启用都能工作，缺席的一方怎样降级见 §7。

行 id 不随包改名，仍是 `glm-hourness/<行>`：profile 的覆盖项按 id 匹配，改名会让覆盖项静默失配。其余持久化标识也不改：cordis 服务名、notice 来源、提示词节名、命令名与 `definitionId`（`dsh-glm-hourness/*`）、cordis 插件名（`dsh-glm-hourness/<行>`）、用户级目录 `glm-hourness`、面板页面 id 与 kind、插槽 id。这些名字里的 `glm-hourness` 读作项目名，与哪个包无关。根包名 `dsh-glm-hourness` 也保留。

行名与一包一源〔2026-10-29，m8-row-titles〕：设置页「内置插件」只给包说明符形式的行名读显示信息；bundle patch 里以 `./` 写的行名被锚定成 file URL，没有显示信息，标题就是含用户目录的整条 URL（m8-ui-audit V-01）。DSH 的 client-modules 按包名组成 web 启动图，同一个包若被多个 active Loader 行解析且声明了 `dsh.client`，启动失败（`resolves from multiple active Loader sources`）〔实测，2026-10-27 事故〕；它只把路径形式的行和精确包名的行算作来源，子路径说明符的行不算任何包的来源（`FACTS.md` §3）。所以两个包的行都经包命名：12 个宿主行写子路径说明符 `<包名>/<行>`；每个包自己声明 `dsh.client`，它的客户端面（宿主半 `ui/index.js`、产物 `ui/client.js`，导出 `.` 与 `./client`）由唯一一行以精确包名插入，`dsh-glm-zcode` 的是 GLM 按钮与设置页，`dsh-hourness` 的是项目图面板。说明符以 profile 目录为基准解析，profile 列了哪个包，它的 `node_modules` 下就有这个包，所以每个包单独装上，行与界面照样解析；只装一个包时另一半界面不会出现，也不会报错。覆盖项按 id 匹配，与行名无关；设置表单以后新写的覆盖项带的 `name` 是说明符，不含本机路径。客户端源码都在 `ui/src/`，哪个文件属于哪个包写在 `scripts/packages.mjs`；`ui/` 只剩 `tsconfig.json` 与 `src/`，不再是包。两个包的客户端产物各是一份 `client.js`（`scripts/build-ui.mjs`），编排层客户端经 `src/graph/live.ts` 带进的是公共库的 `zcode-notice.ts`，不带 GLM 的文件。

行的组合顺序：profile 里两个宿主包相邻、GLM 在前、放在原来单个 bundle 的位置，11 个宿主行的相对次序与拆分之前相同。客户端行不同：单包布局下 `glm-hourness/ui` 由桌面版 profile 末尾的 `dsh-glm-hourness-ui` 插入，排在 9 个 experimental bundle 之后；拆分后它与新的 `glm-hourness/glm-ui` 由宿主包的 patch 插入，提前到 experimental bundle 之前。设置页与 pill 的插槽带显式 `order`，不受影响；按注册次序排列的界面（右侧栏「开始」页的页面类型列表）可能变，桌面版验收时记录「项目图」入口的位置。

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

用户级目录的定案〔用户 2026-10-28〕：按 DSH 自己的布局。DSH 把全部用户数据放在一个根目录下，解析顺序是显式配置 > `$DSH_HOME` > `~/.dsh`（rc.3 `dsh-home-paths` `resolveDshHome`，lib/index.js:109，空白的 `$DSH_HOME` 视为未设）；插件在根目录下占一个以自己命名的目录（先例：`dsh-llm-deepseek` 写 `$DSH_HOME/llm-deepseek/files-v3.json`，llm-deepseek:824）。偏好类记忆随之放用户级目录，项目事实与项目规范放工作区。运行时包不能从本仓库解析（`glm-compact` 遇到过的同一问题，§5.6），所以三步解析在 `src/shared/data-home.ts` 照抄并注明出处，不导入 `@deepseek-ai/dsh-home-paths`。宿主根上下文另有一个 `dshHomePath` 服务（app-boot:4526），它不接受显式配置，本包不用。

实现：

- 新行 `glm-hourness/data`（`dist/data/index.js`）经 `ctx.provide` 提供 cordis 服务 `glmHournessData`，值为 `{userHome, projectHome?}`。`userHome` 按上面的顺序解析，行配置 `dshHome` 是显式项，测试与探针用它指向临时目录；`projectHome` 取行配置，bundle 默认为本仓库的 `.llm`（与通道两行相同的 `USERPROFILE` 相对写法）。激活期不做 I/O，不抛错；流水在第一次写入时建目录。
- 流水路由（`src/memory/audit.ts`）：用量写 `<userHome>/audit/usage.jsonl`，违规与决策写 `<projectHome>/audit/`。各行的目录在每次写入时解析，所以数据行晚于使用者激活也不影响。写入失败不抛给调用方，每条流水第一次失败时在控制台报一次（缺目录也算失败）。
- 缺口文件（`auditPaths(...).gaps`，读它的是 `src/report/panel.ts` 的 `parseGaps`）：一行一个 JSON 对象，记一次删用量记录。`at` 必填，ISO 8601，能解析，是删除的时刻；`removed` 必填，整数 1–10,000,000；`reason` 必填，1–300 个字符，为什么删、谁要求的；`detail` 可选，至多 300 个字符，按 provider 与模型的条数；`from`、`to` 可选，ISO 8601，被删记录的时间范围，`from` 不晚于 `to`；`ref` 可选，至多 200 个字符，留痕的出处。多出的字段忽略；不是 JSON 或不合上面任何一条的行，面板计为「无法读取的缺口记录 N 条」，其余照常。没有代码写这个文件：谁删用量记录，谁往文件追加一行（`DEVELOPMENT.md` §5 第 8 条），删掉文件即撤销。面板每条一行，晨报的用量一节只带本期遇到的（`ORCHESTRATION.md` §11.3）。
- 取值顺序：项目目录取行配置的 `home`（用户 profile 补丁给 workflow、hourness 配了仓库 `.llm`，照旧生效），没有再取服务的 `projectHome`；用户级目录只取服务，没有数据行就不写用量，保证没有任何一行把用户级数据写到数据行没解析过的地方。memory 行不在此列：它的项目目录按每个会话的工作目录取服务的 `projectDirOf(cwd)`（没有数据行时直接调 `src/data/project-root.ts` 的同名函数），忽略 `home`，用户级的记忆目录是 `<userHome>/memory`，没有数据行就不可用。
- 各行：guard 每次拦截都写违规流水，`onViolation` 回调删除；memory 的用量只经服务写用户级目录，记忆工具按会话取项目目录与用户级目录（上一条），不依赖行的 `home`；workflow 的决策与 hourness 的报告按上面的顺序取目录；`/hourness` 从用户级目录读用量，缺哪个目录就在输出里写明。
- 验证：L2 覆盖三步解析、服务提供与撤回、取值顺序、有无服务两种情况；L3 探针确认数据行在真运行时上提供服务，用量只落在场景的用户级目录、真实的 `~/.dsh/glm-hourness` 不变，guard 拦下的 shell 写入在场景项目目录留下违规记录（带规则、工具、agent 与会话 id）。数据行经探针证明后默认启用。

记忆与经验的存储底座〔M5 步骤 A1，设计 `.agents/tasks/m5/design.md` §5，节点 `m5-1`、`lessons-1`〕：关于人本人的记忆在用户级目录，项目事实与全部经验在项目的 `.llm/`（`d-memory-scope`），都用只追加的流水（JSON Lines）。

- `src/data/journal.ts`：`readJournal`、`readJournalSync`（共用按文件大小与修改时间的缓存；坏行记行号与原因；末行没有换行的忽略）和 `appendJournal`（进程内按路径排队；锁用 `src/data/lock.ts`，选项 50 毫秒重试、2 秒等待、30 秒陈旧、开机时刻差 120 秒、陈旧锁改名留着；在锁里重读、由调用方的计划决定写什么、追加前核对锁还是自己的、给崩溃留下的半行补换行、`seq` 取最大加一、`fsync`）。折叠函数由使用者给（记忆与经验各自的模型）。目录被删之后下一次写入重新准备目录。
- `src/data/project-root.ts` 加 `projectDirOf(cwd, home?)`（只返回 `<项目根>/.llm`，不写东西）与 `ensureProjectDir(dir)`（名字是 `.llm` 的目录先 `ensureIgnored` 再建；忽略条目写不进就抛错、不建目录）。
- 数据目录服务多一个成员 `projectDirOf(cwd)`：行配置 `projectOverride` 非空时对所有会话返回它（探针、标定、测试指向运行目录；`scripts/sandbox.mjs` 的 `dataRows` 设为 `<dir>/home`），否则返回会话所在项目的 `.llm`。服务值可以没有这个成员，调用方这时直接调 `project-root.ts` 的同名函数。
- `src/data/secret-shape.ts`（`looksSecret`、`findSecret`、`redactSecrets`：按令牌形状而不是「32 个以上的 base64 字符」判，路径与长标识符放行）与 `src/data/evidence.ts`（证据与出处的写法 `parseRef`、`checkRefs`，提交号不判密钥，`session:`、`call:`、`command:` 的 id 不判 `token`、`hex`；`isGroupKey`、`groupKeysOf`：`learnedFrom` 的键）：纯函数，不用 Node 内置模块。
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
- `src/lessons/failure.ts`〔M5 步骤 L2，设计 §4.4、§4.6，节点 `lessons-2`〕：host 级 `tools/post-execute` 监听器（类型 `PostExecuteHost` 等在 `src/shared/dsh-min.ts`）。失败的调用——shell 工具（原生名 `pwsh`、`bash`；GLM 路由上的 `Bash` 经 `toNativeTool` 换成 `pwsh`）退出码非 0 或超时，或任何工具的结果是错误（被 `tools/pre-execute` 拒绝的也是）——先 `await next()`，再用 `matchFailure` 找输出里含报错片段的生效经验（stderr 末尾 4,000 加 stdout 末尾 2,000 字符；错误结果取文字与 `error.message` 的前 6,000 字符），有就把一条来源为 `glm-hourness-lessons` 的 notice 放在下游决定的 `additionalContexts` 之前，其余保持下游的决定。同一会话同一条经验只提醒一次（可见历史里这种 notice 的 `lessons` 列过的，加本进程推给这个会话的）；带 `parent` 的传输层子调用与没有 agent 的调用不看。推出去的经验各记一条 `hit`（会话、agent、调用号、原生工具名），不等写完。监听器出错时返回下游的决定原样不动，告警一次，行健康写原因。`src/lessons/match.ts` 的片段比较按去掉颜色码后的长度算（至少 8 字符）。
- `src/lessons/commands.ts`：`/lessons show | delete <L-编号> | restore <L-编号> | drop <C-编号>`，身份为人。`src/lessons/cli.ts` 与 `scripts/lessons/cli.ts`：命令行 `npm run -s lessons -- [--cwd 文件夹] show | apply [--file 文件]`（`docs/DEVELOPMENT.md` §13）。
- `src/shared/row-support.ts`：记忆行与经验行共用的件（按原因只告警一次、按会话记备注、晚到的命令与投影服务）。`src/shared/tool-names.ts` 加 `LESSONS_TOOL_NAMES`，常驻名单加 `lessons_query`。

迁移〔2026-10-28〕：从 `~/.dsh/profiles/desktop/.llm/`（只读）与仓库 `.llm/audit/usage.jsonl` 复制，按整行去重。用户级用量流水共 1080 条：仓库 890 条加旧目录 190 条，两者没有重复，按时间排序，最晚一条 2026-10-27T12:29:08.993Z。旧目录的 1 条记忆（`glm-hourness-handoff`）并入仓库 `.llm/memory.json`；旧目录的 3 条决策在仓库决策流水里都已存在。清理〔2026-10-29，项目图 `m1-cleanup`〕：重新核对旧目录的 190 条用量、3 条决策与记忆文件都已在新位置后，删除旧目录；仓库 `.llm/audit/usage.jsonl` 的最晚一条恰为截止点 2026-10-27T12:29:08.993Z，桌面版重启加载新代码之前没有再追加，补拷 0 条。同日按用户要求「用量之类的我们仓库的东西最好删掉」：用户级流水删去旧的 pi-ai `glm` 路由（8317 反代）留下的 806 条（`glm/glm-5.3` 796、`glm/glm-5.3-flash` 10），1177 条余 371 条，其余记录逐行不变；改前备份 `usage.jsonl.bak-1793243554750` 在 m8-ui-audit 最终走查核对过积分面板之后，按用户要求「顺手清掉没用的文件」于同日删除；仓库 `.llm/audit/usage.jsonl`（890 条，非旧路由的 274 条逐行都在用户级流水里）与没有代码再写的 `.llm/audit/dialect-init.jsonl` 删除。积分面板与 `/hourness` 从此不再计入反代时期的消耗。

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
| `ctx.get(name)`：不需要 inject，提供方 fiber 未激活时为 `undefined` | glm-llm（`attachments`、`fs`）；guard、memory、lessons、workflow、hourness（`glmHournessData`，每次写入或命令调用时读）；lessons（另读 `glmHournessGraph` 与 `sessionProjections`，判主 Agent、导入图上的批注，`glmHournessDialect`，把工具名换成原生名）；memory（另读 `glmHournessGraph`，核对出处里的节点、给学习摘要读图的历史；读 `sessionProjections` 与持有者记录，判学习摘要提醒该发给谁，经 `src/data/main-agent.ts`）；glm-prompt（`glmHournessMemory`，每个会话的 agent 创建时读一次 `depth`）；glm-login（各行的 `glmHournessHealth/<行>`，`/glm-status` 调用时读）；rules（`glmHournessPricing`，每分钟读一次高峰；`agents`，会话登记里没有的会话才读，另在重判等待单、找派发链的根和发唤醒时读；`goals`，发唤醒时读 agent 的 goal 阶段；`sessionProjections`、`workingDirectory`，门每次判定读调用者的角色与工作目录）；guard（`glmHournessRules`，组装 `glm:guard` 节时读） | cordis:763–766 | 一致；L3 探针实测 guard 与 memory 经它拿到数据行的目录，`/glm-status` 经它读到各行的健康视图 |
| `ctx.provide(name, value)`：服务归调用方 fiber，同名第二个提供方抛错，返回的 disposer 撤销服务，fiber 卸载时自动撤销 | data（`glmHournessData`）；memory（`glmHournessMemory`，契约在 `src/shared/memory-service.ts`）；lessons（`glmHournessLessons`，契约在 `src/lessons/service.ts`，派发工作的一侧读写）；全部主机行（`glmHournessHealth/<行>`，§2.5）；rules（`glmHournessPeakMode`，契约在 `src/shared/peak-mode.ts`，派活、GLM 包与循环板读它；`glmHournessRules`，契约在 `src/rules/service.ts`，guard 读它）；loops（`glmHournessLoops`，契约在 `src/loops/service.ts`，要交条目的行读它的 `contribute`） | cordis:800–830（经 `fiber.effect` 注册）；同一用法 cmdline:29–31 | 一致；激活期的抛错被捕获，降级为 warn |
| `ctx.inject(names, callback)`：所列服务都在时在子 fiber 里调 callback，其中一个离开时卸载这个 fiber；callback 返回的函数是它的 disposer；子 fiber 的上下文带着父的 `provide` 与 `get` | graph-panel（`sessionProjections`；`agents` 与 `subagents` 一起，停子 agent 用）；memory、lessons（`commands` 与 `sessionProjections` 各一次，注册 `/memory`、`/lessons` 与投影 `hournessMemory`、`hournessLessons`；不改本行的激活条件，服务晚到或不来时行健康写明；两行共用 `src/shared/row-support.ts` 的 `whenPresent`）；loops（`sessionProjections`，注册 `hournessLoops`；`sessionController`，在它里面提供服务 `glmHournessLoops`、起 60 秒的拍、运行项目的条目——只有能到达会话的进程才做这些，`ORCHESTRATION.md` §18.9；两者都不在时行只降级或写一行「这个进程不跑循环板」，别的部分照常） | cordis:1600、cordis:1071（返回 callback 的结果）、cordis:1142–1143（返回函数即收为 disposer） | 一致；L2 假宿主 `fakeInjector`（`tests/fake-rc3.ts`）按此建模，子 fiber 的上下文是父的加上所列服务 |
| 服务 `sessionController`（`resolveAgent(sessionId)` → `{agent}` 或 `{error}`，错误码 `session/not-found`、`session/writer-held`、`gateway/internal`） | loops（既是「这个进程能不能到达会话」的判据：有它才提供服务、才运行条目；也用来恢复冷的主 Agent 会话来投递，两种错误码分别让 `holderState` 变 `not-found` 与 5 分钟的 `elsewhere`，`ORCHESTRATION.md` §18.10） | api-session-controller:2951–2952（`super(ctx, "sessionController", …)`）、3037–3039、221–246 | 〔实读〕；从本包的行里调用的效果未核实（headless 没有它，探针因此钉住「不跑条目」那一面；设计 §10.2 V3、V16） |
| 服务 `schedule`（`create(sessionId, {title, prompt, <选择器>})`、`list({sessionId})`、`catalog()`、`delete({sessionId, id})`、`update({sessionId, id, expected, title?, prompt?, change?})`；记录按种类整键解码，`delete` 连发送记录一起删，`update` 的 `expected` 要 `list` 给的那条） | loops（到点告诉主 Agent 的条目各绑一条任务，对账、改回、搬、删都经它；经 `ctx.get('schedule')` 取，不写进 `inject`：headless 没有它，到点的条目于是不建也不报错） | schedule:1992（`super(ctx, "schedule")`）、2083–2112、2120–2122、2129–2136、2164–2182、2197–2224、74–77、1806–1837、1710–1716、93–97、21 | 〔实读〕；从本包的行里取到的效果未核实（设计 §10.2 V1）；L2 的假宿主 `fakeSchedule` 按这些拒绝与规范化建模 |
| 服务 `workspaceRegistry`（`archivedSessionIds` getter、`list()`；服务没启动时 `requireState` 抛错） | loops（`holderState` 判主 Agent 的会话是不是已归档；读不出时整块板照常投、但一条到点任务都不删） | dsh-workspace:376、506–508、454–460、934–937、526–541、621–629 | 〔实读〕；从本包的行里取到的效果未核实（设计 §10.2 V14、V17） |
| 事件 `schedule/changed`（提交之后发、没有载荷）与 `workspace/session-stop`（`{sessionId}`，只在带 `stopActivity` 归档时发） | loops（各挂一个只读监听器，当场对一次账；收不到时每 60 秒一拍的对账照样做） | schedule:2231–2237；dsh-workspace:540、623 | 〔实读〕；本行收不收得到未核实（设计 §10.2 V2、V15） |

事件：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `agent/created`（serial，`{agent, source, signal?}`） | glm-prompt、guard、graph、memory（委派的子 agent：装去掉记忆工具的监听器；根 agent：装会话开局的记忆索引）、lessons（委派的子 agent：装去掉 `lessons_merge` 的监听器；根 agent：装候选提醒与复发提醒）、rules（记下会话的工作目录，给 agent 装每步提醒，把会话记入心跳，读项目状态并上报，接手前一个宿主为这个会话留下的不做档的单，`ORCHESTRATION.md` §16.13）、design（给 agent 装身份节与工具面监听器；对仍以为自己是主 Agent、而持有者记录指向别的会话的会话，登记「空闲之后跑 `/wish off`」，不在监听器里等它，因为监听器逐个 `await` 完才算创建完）、loops（会话的工作目录在哪个项目里，就对账那个项目的循环板文件一次并重写它的 `view.json`，`ORCHESTRATION.md` §18.7） | agent:581–585 | 一致 |
| `system-prompt/assemble`（waterfall，`(assembly, context, next)`，按 agent 作用域分发） | glm-prompt、guard（规则声明节）、memory（只装在委派的子 agent 上，不带 `prepend`，去掉三个记忆工具，所以方言不给子 agent 加 `glm:memory` 节）、lessons（同一做法，只去掉 `lessons_merge`，子 agent 留着 `lessons_query`）、design（两个监听器：`prepend` 的加身份节，不带 `prepend` 的去掉主 Agent 工具面里的工具并加人设一节，所以方言与工具检索的 `prepend` 监听器在 `next()` 之后看到的是去掉之后的工具和人设一节；同一个 agent 作用域上不同插件的监听器进同一张表，L3 场景 `glm-design-main` 核对） | system-prompt:398；`assembly` 的 `sections{name, text, interpolate?}`、`contexts`、`tools{name, description, parameters, deferLoading?}`、`variables` 见 system-prompt:365–393；完整节在瀑布之后恢复，system-prompt:399–405；`interpolate: false` 的节原样渲染，system-prompt:109–118 | 一致 |
| 组装变量 `variables.provider` / `variables.model` | glm-prompt、guard（`src/shared/route.ts`） | agent:167–181（`installModelSelection` 在 `next()` 之后写入） | 一致 |
| `session/event`（只观察，`(session, event)`，在 `append` 内同步调用）；事件冻结为 `{type, seq, time, data}` | guard（影子兜底） | session:1517–1536（`append`）、session:1579–1598（`commit` 同步通知观察者）；`turn/start` 的 `data.turn` 见 agent-loop:945；`workspace/changes` 的 `data.turn` 见 workspace-changes:871 | 一致；观察者运行时摘要还没存进去（workspace-changes:871 先追加事件，873 才存摘要），所以晚一个微任务再读 |
| `session/disposed`（只观察，`(session)`） | guard（影子兜底）、rules（忘掉会话登记里的工作目录，撤掉这个会话的提醒，会话离开心跳，这个会话持有的等待单转给派发它的 agent 或取消，`ORCHESTRATION.md` §16.12） | session:1925–1936 | 一致；一次性子 agent 交回之后事件会发出（L3 `rules-handover` 实测，V11） |
| `agent/pre-step`（waterfall，`{agent, messages, turn, step, signal}`；默认决策 `enter` 带本步认领的消息） | glm-prompt（工具检索公告、todo 提醒、高峰提醒）、graph（每步投影）、memory（记忆索引，经 `installStepNotice`）、lessons（候选提醒与复发提醒，经 `installStepNotice`，只给主 Agent）、design（主 Agent 的阶段提醒，`ORCHESTRATION.md` §4.8；本步是不是主 Agent 取自本步组装时记下的判定，组装在 `agent/pre-step` 之前） | agent-loop:901–925；`agent` 由 agent:241–245 并入；空决策守卫照抄 agent:193–197 | 一致；本节上文原写载荷无 `turn`，已更正 |
| `tools/pre-execute`（waterfall，`(exec, next)`，默认 `allow`） | guard、workflow、graph（图文件门禁，`prepend` 注册）、rules（规则板的门，`prepend` 注册在最外层，先 `next()`、内层不放行就原样返回；带 `parent` 的子调用也判；监听器不抛错：抛错会变成这次调用的错误结果，tools:3364–3368，所以读状态或判定出错一律放行并降级行健康）、loops（循环板的文件门 `loops:files-only`，`prepend` 注册，做法同图行；带 `parent` 的子调用也判；判不出来就放行并告警，`ORCHESTRATION.md` §18.8） | tools:3320–3321；决策 `allow` / `deny{reason, info?}` / `ask` / `cancel`，tools:3322–3345；拒绝时结果为 `Error: ` 加理由，工具体不执行，tools:3337–3353 | 一致；guard 的决策类型补上 `ask`、`cancel` 透传 |
| `exec` 字段：`callId`、`rootCallId`、`name`、`arguments`、`signal`、`agent?`、`parent?`、`schema?`、`deferContext`、`concludeTurn` | guard、workflow | tools:3229–3260 | **偏差已修**：guard 从 `exec.agentId` / `exec.sessionId` 取违规记录的 id，rc.3 没有这两个字段，记录里永远为空；改为 `exec.agent.id` 与 `exec.agent.session.id` |
| `llm/stream`（waterfall，`(options, next)`） | memory（用量流水）、glm-compact | llm:2397；`options` 即 `GenerateOptions`（官方 types.d.ts:506–548：`provider`、`model`、`messages`、`sessionId?`、`purpose?`），编译期检查 `LlmStreamOptionsContractCheck` | 一致；memory 对 `provider` / `model` 的 `'unknown'` 兜底删除（两者必填）。L3 探针实测每个 GLM 步一条用量记录，带 `sessionId`；压缩调用带 `purpose: 'compaction'` |
| `tools/post-execute`（waterfall，`(exec, result, next)`，返回官方 `PostToolDecision`：`accept` 可带 `content`，`block` 带 `feedback`，两者都可带 `additionalContexts`；本包读 `exec` 的 `name`、`arguments`、`agent`、`parent`、`callId`，读 `result` 的 `isError`、`content`、`value`、`error`） | lessons（失败匹配，host 级监听器；类型 `PostExecutePayload`、`PostExecuteDecision`、`PostExecuteListener`、`PostExecuteHost` 在 `src/shared/dsh-min.ts`） | tools:3589–3631（`postExecute`：默认决策 `accept`，结果自带的 `additionalContexts` 在前、决策的在后，`block` 丢掉工具体延后的上下文）、3418–3420 与 3448（工具体失败、未知工具与被 `tools/pre-execute` 拒绝的结果同样走到这里，tools:3339–3353）；官方 `PostToolDecision` 见 `reference/deepseek-harness` 的 `api-catalog.ts` | 一致；先例 repeat-tool-reminder:2247–2260。假设 U1（host 级监听器看得到子 agent 的调用）与 U2（notice 在下一次请求里紧跟这次工具结果）由探针 `glm-lessons-failure`、`non-glm-lessons-failure` 核对，两条都成立（2026-11-01，GLM 与非 GLM 路由，子 agent 的失败也带提醒）。`tests/fake-rc3.ts` 的工具管线按真宿主的顺序补了这一步 |
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
| `sessionProjections.register(definition)`、`sessionProjections.snapshot(session, keys)`：前者是调用方 fiber 的 effect，同键同版本的第二次注册共用（引用计数），版本不同抛错；后者读一个会话所选单元的一致切面，每个值过单元的 view schema，未注册的键不在 `values` 里 | graph-panel（注册 `graphLive`；`/graph-run` 读主会话的 `graphLive` 与 `subagentCatalog`、子会话的 `graphLive`）；design（注册 `hournessMainAgent`，从 `/wish` 的 `command/run`、`command/done` 折叠；单元状态改了就把 `stateVersion` 加一）；loops（注册 `hournessLoops`，只从会话头算一次、会话里的事件都不改它，给页面指路到项目的 `view.json`，`ORCHESTRATION.md` §18.7）；memory（注册 `hournessMemory`，状态在会话创建时由会话头的 `cwd` 算出两份记忆流水的路径，不随事件变）；lessons（注册 `hournessLessons`，同样算出项目经验流水的路径） | session-projection:68、session-projection:91–94、session-projection:141 | 一致；探针 `liveOf` 用同一个 `snapshot` 读现场（L3） |
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
| 活 agent（命令调用与 `agents.get` 给出的）：`status`（`idle` / `running`）；`followup` 排到下一回合并唤醒空闲的 agent，`inject` 排到下一步、不唤醒；取消之后到来的唤醒型投递改进下一回合并锁存唤醒；`cancel(cause, {keepInbox: true})` 中止正在跑的回合、保留收件箱，与停止按钮相同 | graph-panel（`/graph-run`） | agent-loop:790–791、agent-loop:800–821；api-session-controller:1065 | 一致；L3 场景 `glm-graph-run` 核对开始与暂停（未跑） |
| session：`id`（取自 `header.id`）、`header{id, createdAt, cwd?, parentSession?, isSeeded}`、`deriveMessages()` | guard（`header.cwd` 作包含根）、工具检索、todo 提醒 | session:1344–1346、session:1820–1826、session:1672–1686 | 一致 |
| session：`requestHeader()`，日志里 `request/header` 事件的折叠，`config` 为该步准备好的调用配置（含 `provider`、`model`）；第一次请求之前为 undefined | guard（工具调用的路由，`src/shared/route.ts` `sessionRoute`） | session:1612、session:637（`foldRequestHeader`）、`canonicalHeader`；agent 循环每步调用模型之前写入，变化时才写，agent-loop:1218–1240 | 一致（2026-10-28 核对；L3 探针的 GLM 拦截与非 GLM 放行经它判路由） |
| `workingDirectory.get(session)`：会话的当前工作目录，无 I/O；没有记录时取部署默认目录 | guard（相对路径的解析基准，`ctx.get` 读） | working-directory:76–78；文件工具按 `ensure(agent)` 的结果解析相对路径，tool-fs:172、fs-local `localDisplayPath`（win32 上为 `resolve(cwd, path)`） | 一致 |
| 派生消息：助手消息 `source{kind: 'model', provider, model}`，工具调用为 `tool-call` 块；工具结果带 `toolCallId`、`isError` | todo 提醒、工具检索 | llm:66–78（`createAssistantMessage`），session:862–868、session:1217–1218 | 一致 |
| 合成 notice 与 `createUserMessage` 同形（`id`、`role: 'user'`、冻结） | 工具检索公告、todo 提醒、每步投影、记忆索引、运行控制的消息（经 `followup` / `inject` 进收件箱，来源 `glm-graph-run`） | llm:37–66 | 一致 |
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

派发与驱动循环〔实测 2026-10-28，L3 派发可行性验证；`ORCHESTRATION.md` §2.1、§3.2〕：M7 后台派发与 goal 驱动要用的接口。现在只有探针覆盖层里的验证插件 `scripts/probe/probe-dispatch.mjs` 在用，它不属于 bundle，也不是产品功能；证据列的「探针」指 `npm run probe` 的场景。

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

### 2.5 行健康〔已实现 2026-10-28，`ROADMAP.md` M1.5〕

原问题：真实会话里「哪几行在起作用」无法回答，降级只在控制台打一行警告。现在每行自报状态：激活时报一次，此后每次在某个会话里起作用时报该会话的状态，第一次与状态变化时记下。`/glm-status` 在凭证状态之后列出调用会话的行健康表；`/hourness-status` 只列这张表。

机制（`src/shared/health.ts`）：

- 每行激活时经 `ctx.provide` 提供自己的只读视图，服务名 `glmHournessHealth/<行>`。视图含激活状态和按会话的最近一次报告，每行保留最近 64 个会话。
- `/glm-status` 与 `/hourness-status` 经 `ctx.get` 逐行读视图，取不到的行显示「未加载」（行未启用，或激活没有完成）。读写双方不依赖加载顺序，也不依赖共享的模块实例；行卸载时视图随 fiber 撤销。行健康不经数据目录行，`data` 行未启用时其他行照样上报。
- 会话以 agent id 为键（rc.3 的 agent 与会话共用 id）：组装与工具调用取调用方 agent，`llm/stream` 一侧取请求的 `sessionId`，命令取调用参数里的 `agent`（commands:379–385）。没有会话 id 的报告丢弃。
- 报告只在主机进程内存里，不写文件，不进模型可见的对话；桌面版重启后清空。

状态分生效、部分生效、未生效三种；表里另有「已加载，本会话未触发」与「未加载」。激活时就未生效的行（例如数据目录服务提供失败）不看会话报告，直接显示激活原因；`glm-login`、`data` 与 `graph-panel` 不按会话起作用，只显示激活状态（`graph-panel` 的激活状态在现场投影注册完成或失败时更新一次，`RowHealth.reactivate`）。`graph` 行在每次图工具调用与每次读图做投影之后报告本会话：图目录、节点数、校验错误、焦点是否设了〔2026-10-28，`src/graph/row-health.ts`〕。

| 行 | 何时上报 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- | --- |
| glm-llm | 激活；每次请求 | 已注册路由，写明套餐与凭证目录；上游已应答（设备 ID 未能写入 ZCode 状态文件时注明本进程用临时 ID，状态不降级） | 未登录（凭证为空）；凭证不可读；未拿到项目令牌（写明 3.16.3 的原因，§4.1）；上游返回非 2xx 状态码 |
| glm-login | 激活 | 三个命令已注册，计价服务已提供 | 计价服务未提供（部分生效，写明原因，例如同名服务已在；面板按 token 列）。凭证目录总能解析（§2.4） |
| glm-prompt | 激活；每步组装 | GLM 路由，ZCode 提示词与工具面，工具检索 local 或关闭 | 非 GLM 路由；工具检索未安装（会话历史不可读，部分生效）；记忆服务给出的汇报细度用不了（形状不对、抛错、不认识的档，部分生效）；方言安装失败 |
| glm-compact | 激活；每次压缩请求 | GLM 压缩请求改用 ZCode 指令与摘要格式 | 非 GLM 路由；未识别 compaction-basic 的指令（原样放行） |
| data | 激活 | 用户级目录与项目目录都已解析 | 项目目录未配置（部分生效）；服务提供失败 |
| guard | 激活；每次根调用 | 门禁生效（所有路由，`ORCHESTRATION.md` §6.2），写明圈禁根、违规目录与影子兜底是否可用 | 会话没有工作目录（圈禁规则跳过）；无项目目录（违规不落盘）；方言服务不可用（工具名按静态别名表换算，纠偏用原生名）。组合里没有 workspace-changes 时说明写「影子兜底未启用」，状态不降级：影子兜底只记录，门禁本身不受影响 |
| memory | 激活；根 agent 的每一步；命令或投影服务到来与离开时（激活状态） | 本会话的项目目录与用户级目录、两边的偏好与事实条数、本会话是否已带索引；用量记入用户级目录 | 数据目录行未启用（用户级记忆不可用，用量不记录）；会话没有工作目录，或不算项目（用户主目录、盘符根、不在 git 仓库里又没有 `.llm`）；流水有读不出的行或超过 8 MiB；旧 `memory.json` 读不出或还没迁移；写入时 `.llm/` 加不进 `.git/info/exclude`、写失败、锁被判陈旧过；索引提醒出错或有一份记忆读不出（索引不全）；学习摘要读不全（项目图读不出，或经验、记忆流水读不出，`learning_signals` 的 `notes` 同说）、提醒没能记下（这一步不发，一小时内不再试）、提醒出错；取不到主 Agent 的判断而改发所有根 agent（没有图行、没有持有者记录，说明只在这个判断真的决定了谁收到提醒时写），或持有者记录指向本会话但模式已关；`commands` 或 `sessionProjections` 服务没到（命令、投影没注册）；`glmHournessMemory` 没提供上。行配置 `home` 只在说明里写「已不再使用」，状态不因它降级。记忆工具注册失败时未生效 |
| lessons | 激活；主 Agent 的每一步；有会话没有项目时；失败匹配读不出经验或出错时；命令或投影服务到来与离开时（激活状态） | 本会话的项目目录、生效经验与候选的条数；候选被拒的条数与代码 | 会话没有工作目录，或不算项目；流水有读不出的行或超过 8 MiB；`.llm/` 加不进 `.git/info/exclude`、写失败、锁被判陈旧过；读不出项目图上的候选经验；候选没能记为过期；复发提醒没能记下（这一步不发）；失败匹配读不出经验或出错（调用的结果原样）；命中没能记下（提醒照给）；取不到 M3 的主 Agent 判断（没有图行、没有持有者记录、记录指向本会话但模式已关；设计行不在时所有根 agent 都按主 Agent 处理）；`commands` 或 `sessionProjections` 服务没到；`glmHournessLessons` 没提供上。工具注册失败时未生效 |
| workflow | 激活；每次根调用 | 派遣决策记入项目目录 | 无项目目录 |
| hourness | 激活；每次 `/hourness` | 两个目录都可读；说明另写「积分口径：已提供」或「积分口径：未提供，按 token 列」，再写「额度：已提供」或「额度：未提供」（服务有没有可用的 `quota` 成员），状态不因计价服务缺席降级 | 缺项目目录或用户级目录 |
| rules | 激活；每个会话创建时；每次 `/rules` | 命令、工具与服务就绪；本会话所在项目的档位与来源、此刻是不是高峰、你设的规则条数；读不出是不是高峰（没有计价服务，或 `peak` 出错）时写原因，状态不降级 | `/rules` 或 `rules_show` 没注册上、`glmHournessPeakMode` 或 `glmHournessRules` 没提供上、会话事件没注册上；会话没有工作目录或不在项目里；门读状态失败或判定出错（这一次调用放行，下一次能读的调用换回正常）；存档与变更记录对不上或有没生效的记录（没生效的记录写出 `/rules recovery <编号> 照改 或 忽略`；存档被改过、流水被截短每个会话都报，消息末尾写出路：删掉项目的 `.llm/rules/`，`ORCHESTRATION.md` §16.5）；仓库里的规则文件读不出或被规则板以外改过；读状态失败；等待单没记下、改不了，宿主没有 `agents` 服务或读它抛错，唤醒发不出，等待单因本宿主心跳超时被过期（只那一次的上报，`ORCHESTRATION.md` §16.12）；不做档的 goal 没暂停成（报在被挡的子 agent 的会话上：「高峰不做：goal 没暂停（原因），每一轮仍会花一步」）、没恢复成（「高峰不做：goal 没能恢复（原因），要在目标条上或用 /goal resume 恢复」），接手单失败（`ORCHESTRATION.md` §16.13）。`config.dir` 不是路径、工具调用的门装不上时未生效 |
| design | 激活；主 Agent 会话的每次组装；会话失去主 Agent 之后的第一次组装；让别的会话退出主 Agent 失败时；每次 `/wish` 里发现问题时 | 命令与会话状态服务就绪（激活）；主 Agent 会话：身份节已加上，写文件的工具与 `ask_user_question` 已从工具面去掉 | 会话状态服务没到（`主 Agent 模式要会话状态服务（sessionProjections）`，`/wish` 拒绝开启，到了之后自动转为生效）、状态注册失败、宿主没有 `inject`；`/wish` 注册失败（未生效，本行什么都不做）；本会话读不到主 Agent 的状态（会话状态读不出，或找持有者记录所靠的服务出错：这一步当作普通会话，告警一次；会话创建时同样读不了，则说没能检查这个会话是不是还是主 Agent，创建照常完成）；持有者记录读不到或没有（按会话状态判，说明写「在主 Agent 会话里再发一次 /wish」）；`/wish` 在生效前被取消；指向没生效的 `/wish` 的持有者记录删不掉（说明写「在这个会话里发一次 /wish off」）；`str_replace_editor` 的参数形状不认识；没能让别的会话退出主 Agent；人设超过 4,000 字符或设置读不懂（没有加人设，主 Agent 会话的说明里也有这一句）。会话不再是主 Agent 之后报未生效（「这个会话现在不是主 Agent：用 /wish 开启」）；从没当过主 Agent 的会话不上报。一步里的几个问题合成一条降级说明，不会被同一步的「生效」盖掉 |
| loops | 只在激活时报（循环板属于项目，不属于某个会话）；每交来一份有问题的东西时更新；每次对账一个项目的文件之后更新；每一拍之后更新 | 循环行自己的条目已登记，服务 `glmHournessLoops` 已就绪（有会话控制器时），`/loops` 已注册，`loops:files-only` 与 `loops:schedule-tools` 已装上，会话投影 `hournessLoops` 已注册 | 宿主没有 `provide`（未生效，写原因）；没有会话控制器时写一行「这个进程不跑循环板（没有会话控制器）」，不降级（headless、探针、标定本来如此）；服务提供不上（第二个实例，写原因）；别的行交来的整份被拒（来源写法不对、名字空间被占或不该用）；交来的条目、事件、动作有几项不合被丢掉，写「<包> 的 <行> 交来的 <id> 读不懂：<字段路径与原因>」；条目的说法里有没学过的词（照样收下，写「<id> 的说法里有 <词>」）；宿主没有 `commands` 或注册失败（没有 `/loops`）；宿主没有 `on` 或装门失败（写「没有什么拦着别人写循环板的文件」）；`sessionProjections` 还没来或注册失败（页面找不到板）；某个项目的文件读不出、条目文件在循环板之外被改过、读不出、变更记录中间坏了行（各写一句，带项目名；人打 `/loops ack` 之后不再写）、`view.json` 写不进。每一条只说一次。运行时（§18.9）：收件箱写不进（三次重试之后）、收件箱读不出、一拍里出错、一个 harness 动作 `failed`、同一个去重键 24 小时内第 4 次、插件的条目被限次、没能把一项交给主 Agent（各写一句）。绑定与投递（§18.10）：读不出主 Agent 的记录、读不到归档状态、主 Agent 的会话在另一个 DSH 窗口里连着超过 5 分钟、没能记下要删的 DSH 提醒（于是不删）、到点提醒建不上或改不回来、读不出 DSH 的任务清单、三次重试都没能把一条消息交给主 Agent（各写一句）。没有主 Agent（没有记录、会话已归档、会话找不到）、消息存着、提醒等着对账、`removed-tasks.jsonl` 里的删除记录都不算降级，页面写明。条目在等一个没人声明的事件、文件欠着一次写、条目不在这份检出里、没有批准记录的 `unadopted`、被限次攒着的事件、去重键满了、脚本与检查的条目 `refused` 都不算降级，页面写明 |

UI 包的行运行在客户端，不在表内。

按包分组〔2026-10-29，split 第 4 步〕：`src/shared/health.ts` 的 `GLM_ROWS`（`glm-llm`、`glm-login`、`glm-prompt`、`glm-compact`）与 `HOURNESS_ROWS`（`data`、`guard`、`memory`、`lessons`、`workflow`、`hourness`、`graph`、`graph-panel`、`rules`、`design`、`loops`）由 `HEALTH_PACKAGES` 配上包名 `dsh-glm-zcode`、`dsh-hourness`；`HEALTH_ROWS` 是两组相接，顺序同 patch。`HEALTH_PACKAGES` 是 `scripts/packages.mjs` 在运行时的一份拷贝（`src/` 不导入脚本）；包名与行在 split 第 5 步写进目录表，从那时起由 preflight 核对两者一致。表的列是「包 | 行 | 状态 | 说明」；一个包的行全部「未加载」时，这个包只占一行：行写「全部」，说明写「包未安装，或它的行全部禁用」。

`/hourness-status`〔2026-10-29，split 第 4 步〕：由 `glm-hourness/hourness` 行注册（`definitionId` 为 `dsh-glm-hourness/hourness-status`，描述「查看两个包各行的健康」），输出与 `/glm-status` 凭证行之后完全相同的表，没有凭证行，所以只装编排层包时也能看行健康。输入去掉首尾空白后必须为空，否则返回「用法：/hourness-status（无需参数）」，写法同 `/hourness`。读表不算该行在会话里起作用，`hourness` 行不为它上报。`hourness` 行的激活说明是「/hourness、/hourness-status 已注册」。

`/glm-status` 的第一行仍是凭证状态（输入框下的 GLM 按钮按它解析登录状态），空一行后是 Markdown 表。按钮在整段文字里先找「已登录（套餐 …）」，找不到再找「未登录」，所以表里不得出现「已登录（套餐」，分组带来的文字（包名、「全部」、合并行的说明、表头）也不含「未登录」；`tests/health.spec.ts` 钉住这两条。GLM 按钮的对话框把表按行列出：行名与状态一行（生效绿、部分生效黄、未生效红），说明在下一行；包的合并行以包名显示。对话里的命令卡片仍原样显示 Markdown，卡片视图属于 M8。L3 探针按四列解析，并核对每行的包与 `HEALTH_PACKAGES` 一致、`/hourness-status` 与 `/glm-status` 的表相同〔2026-10-29，`m8-ui-audit` F-04；split 第 4 步加「包」列〕。按钮读这段文字的函数在 `ui/src/channel-model.ts`（凭证行、上次登录错误、表，以及两者以外剩下的行），与界面代码分开，好让 L2 用真实输出测它〔`m8-ui-audit` R-03〕。

GLM 按钮〔2026-10-29，`m8-ui-audit` F-02、F-03、F-18、F-34〕：每次执行命令都会在接收会话里记一条命令流、显示一张命令卡片，所以按钮只在点击时执行命令；唯一的例外是本次启动后第一次打开对话框、任何一个按钮都还没读过状态时读一次。读到的状态在所有输入框的按钮之间共用，并写明读取时间（「读取于 HH:MM」）。登录后不再每 5 秒轮询（原先最多 12 次，且只轮询 60 秒，而授权链接 5 分钟有效），对话框提示「授权完成后点「刷新状态」」。状态读不出时写「未知」与原因（glm-login 行没有加载、查询失败、返回内容读不懂）；凭证不完整时写出原因；浏览器授权失败或链接过期后，下一次读到的状态多一行「上次登录错误」，红色，写引擎给的错误；回复里既不是字段、也不是健康表的行（例如读不懂的凭证行）显示在健康列表上方，不丢〔`m8-ui-audit` R-01〕；套餐在读到之前写「—」；「登出」要在 4 秒内再点一次「再点一次确认登出」。对话框经 portal 挂到页面根上，用 ui-primitives 的 `useAnchoredPosition` 按实测宽高放在按钮上方并夹在视口内，外部按下用 `useDismissOnOutsidePointer` 关闭（与 DSH 自己的统计对话框相同）；打开时焦点进对话框，Esc 关闭并把焦点还给按钮。按钮文字「GLM」不再被挤成「G」。

设置页〔2026-10-29，`m8-ui-audit` F-33、V-03、F-05〕：导航与标题用插件管理器里的名字 GLM-Hourness；字号随 DSH 的设置页（标题 18px/600，条目名 14/20，说明 12/18），值在条目名下方左对齐，只有路径用等宽字体；登录与状态指向输入框下方的 GLM 按钮，命令列在后面；复制按钮用 ui-primitives 的 `Button` 与 `writeClipboard`，复制失败时写出来；模型选择按选择器里的叫法写「GLM（ZCode 原生通道）」下的 GLM-5.3 或 GLM-5.3-Flash（与 `zcode.ts` 的组名同一个字符串）。设置页没有会话，命令要在会话里执行，所以设置页不显示实时状态。设置导航的图标由设置壳按分区 id 选（`dsh-client-ui-settings-general` 的 `navIcon`），第三方分区带不了自己的图标。

验证：L2 覆盖每行的上报与 `/glm-status` 的输出（`tests/health.spec.ts`；通道请求的三种结果在 `tests/glm-zcode.spec.ts`）；同一文件把真实处理函数的输出（未登录、登录不完整、已登录、后台轮询失败后的上次登录错误）交给 GLM 按钮的解析函数，断言字段、各行与剩下的行。L3 探针在 GLM、非 GLM、压缩三个场景的最后一步调用本包真实的 `/glm-status` 处理函数，检查表列出全部 15 行（`HEALTH_ROWS`；2026-10-29 的探针输出「11 row(s)」，规则板行加入后为 12，设计行加入后为 13，经验行加入后为 14，循环行加入后为 15）、各行状态与原因符合路由，并确认表的内容没有进入任何模型请求。探针里 `glm-llm` 显示未加载：bundle 默认禁用该行，探针用的是脚本化 provider。

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

- 目录：`glm-5.3`（GLM-5.3）、`glm-5.3-flash`（GLM-5.3-Flash）；向 DSH 声明的上下文窗口 512,000、默认 `max_tokens` 32000（DSH 用它们做自己的压缩与预算，属于 DSH 控制的行为，§4.8）。线上 `model` 用官方大小写（§4.5）。
- ZCode 目录规则〔m1-parity，`src/glm-llm/models.ts` `zcodeModelRule`〕：取开源 3.16.2 树的内置目录（`reference/ZCode/config/provider/zcode-builtin.json`，revision 33）里 GLM-5.3 系的两条规则：模型规则 `.*glm-5\.3.*`（`contextWindow` 1,000,000，`maxOutputTokens.max` 128000，`reasoningLevel.values` `["low", "high", "max"]`）与 anthropic-messages 规则（选项映射 `thinking` enabled、`output_config.effort`）。3.16.3 按锚定、忽略大小写匹配（`wYt` @557708，调用 @563982），后命中的规则覆盖前面的 `.*glm-5.*`，`.*glm-5\.3-flash.*` 只改输入格式。3.16.3 实际运行的目录由桌面壳下发，pristine 副本里没有；若活动目录不同，这两条要跟着改（§4.8）。
- 输入模态按模型如实声明（`src/glm-llm/models.ts` `GLM_MODELS`）：GLM-5.3 没有视觉塔，只声明文本；GLM-5.3-Flash 声明文本与图像〔用户提供的事实 2026-10-28〕。目录外的模型 id 只声明文本。此前两个模型都声明图像。只声明文本的路由上，DSH 在适配器之前把请求里的图片换成文字占位（`dsh-llm` `projectImagesForTextModel`：「[image omitted because this model accepts text only; attachment sha256:…]」），`read_image` 拒读（「… does not declare image input; switch to an image-capable model to read images」），会话控制器拒收用户附图。
- 思考：GLM-5.3 系强制思考；effort 三档 `low` / `high` / `max`，默认 `high`〔定案 2026-10-27，五档词汇 API 接受但 GLM 不用〕。
- `max_tokens`〔已实现 2026-10-28，m1-parity 第 5 项，定案 2026-10-28 用户选 B，项目图 `question-7`；`src/glm-llm/token-budget.ts`〕：coding-plan 对目录内的模型不再用 DSH 给的 `maxTokens`，按 3.16.3 取值：
  - agent 步：`resolveModelStepMaxOutputTokens`（`aUo` @13215830）。基线是目录的 `maxOutputTokens.max`（`resolveNormalRequestMaxOutputTokens` `VZ` @13215775，没有时 32000）；上下文窗口与当前用量估算都有效时，取 `min(基线, floor(窗口 − 估算 − 1000))`，这个值不大于 0 时取基线。
  - 压缩：`min(VZ(max), 20000, max)`（`p3a` @13395552，`I0t`），GLM-5.3 系为 20000。
  - 会话标题等辅助请求：`min(5000, max)`（`auxiliaryModelOptions` `PP` @7759001），为 5000。
  - 当前用量估算（`estimateCurrentContextUsage` `uzo` @13313841）：从后往前找第一条带服务端用量的助手消息作基线（`CDn` @13313415、`d5o` @13260048）；用量按 `Xgt` @4979924 换算（输入取 `input`，否则 `total − output`，否则缓存读写之和；输出大于 0 时上下文用量为输入加输出，否则取不小于输入的 `total`）；有上下文用量时只估算基线之后的消息，没有时从基线那条起估算；没有基线时整段估算。估算按 `estimateMessageTokens`（`TP` @5067698）：每条消息的块文本（文本与 reasoning 原样，图片记 `[Attached <类型>]`）以换行连接，加每个工具调用的名称与输入 JSON，三个字符一 token（`ere` @814022），向上取整；系统消息也计入。
  - 用量基线的来源：ZCode 从会话条目读用量。DSH 的请求不带历史响应的用量，本包的解码器在每个响应的回放信封（`finish.replayState.response`）里记下 ZCode 口径的用量 `usage: {input, output, total, cache: {read, write}}`（`input` 含缓存读写，与 AI SDK Anthropic provider 的口径相同，`EZr` @3549441），信封 `version` 仍为 1；DSH 组装助手消息时把信封存进 `source.replayState`，下一次请求从这里读。为此信封改为只要知道模型就发，不再只在有 reasoning 时发（§4.5c）。
  - 与 3.16.3 的差异（§4.8）：只有本适配器产出、运行时仍把回放状态交回本适配器的助手消息有基线，别的路由的历史与 m1-parity 之前的历史只能整段估算；ZCode 按会话条目与消息对齐取下标，DSH 只有一份消息列表，按它取；工具调用参数先解析再序列化，解析失败计 `{}`，工具结果计其文本块与图片占位（ZCode 的消息模型与 DSH 块不完全一一对应）。窗口取目录的 1,000,000，而 DSH 按声明的 512,000 先压缩，所以实际上主步恒为 128000；公式照移植。

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
- 不做：不按额度或积分拦截、推迟、限速、换模型或换套餐，本节没有在 `tools/pre-execute` 与 `agent/pre-step` 上注册任何监听器。四类指标事件（`glm.quota-read` 等）等指标服务的设计定了名字与信封再交（项目图 `m6-metrics-events`）。
- 未核实：V4、V5、V6 命令处理函数等 3 秒在客户端一侧不被打断、V8 登录被拒的三种判据在真实的登录失效时够用。V3 已核（2026-11-01 一次真实读取，`FACTS.md` §2.4）：积分套餐的读数是两行 `CREDIT_LIMIT`（5 小时与每周），不是 `TOKENS_LIMIT`，命名函数已认两种类型；没有 `TIME_LIMIT` 行。V7 已核（`FACTS.md` §1）。

### 4.8 与 ZCode 的一致性与已知差异〔m1-parity 2026-10-28 按 3.16.3；2026-10-30 跟到 3.17.1〕

验收口径〔定案 2026-10-28，用户：「看量或者扣减看不出来的。你就代码级别一样就行」〕：coding-plan 请求中本包能控制的部分与基线代码级一致（2026-10-30 起为 3.17.1），不做额度或扣减测量。

已一致（细节与偏移见各节）：模型请求凭证是项目令牌，拿不到即失败（§4.1）；配置请求只带 `x-api-key-id`，凭证不再含 secret（§4.1、§4.4）；`X-Title` 与 User-Agent（§4.2）；头的组装链与线上顺序（§4.3）；归因头（§4.5b）；`metadata.user_id` 的 deviceMid：读取，缺失时生成并在锁内写回 ZCode 状态文件（§4.5b）；请求体键序、`model` 大小写、`thinking` 与 `output_config`、会话标题非流式（§4.5）；`max_tokens` 规则（§4.6）。3.17.1 跟进补上的：版本号（§4.2）、`x-zcode-session-features`（§4.5b）、项目令牌请求失败的细分错误码（§4.1）。额度读取（§4.7，`m6-quota-read`）已一致：地址与 15 秒超时、头恰好 `authorization`（项目令牌原样）与 `x-request-id`（每次新的 UUID）、不加 ZCode 身份头、失败只是一个原因（不重试，401 不重铸）、读取结果 60 秒内复用；偏移按 3.17.1，见 `FACTS.md` §1。

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
- 向 DSH 声明的上下文窗口 512,000 与默认 `max_tokens` 32000：DSH 用它们做自己的预算与压缩，线上 `max_tokens` 不受影响（§4.6）。
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
- 镜像文件：整份文件都是逐字声明的源文件（`src/toolsearch/zcode-text.ts`、`src/glm-prompt/zcode-tool-text.ts`、`src/glm-prompt/zcode-harness-text.ts`、`src/glm-llm/zcode-wire.ts`、`src/shared/zcode-notice.ts`），门禁抽出其中每个字符串与模板字面量片段逐行比对，模板按插值点切开。这样带插值的模板也能逐片检查。镜像文件里不能出现正则字面量和除法，扫描器不解析它们。
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

## 6. 注入约定〔定案〕

方言层与编排层都要往对话里放 harness 生成的内容（提醒、投影、检查结果、纠偏），约定如下：

1. 格式：用 GLM 熟悉的 `<system-reminder>` 形态，写短，位置固定。ZCode 自身以这种形态递送 deferred 名单与提醒（§5.10）。
2. 位置：动态内容放在对话末尾，不放进系统提示词。系统提示词保持稳定，以免每一步都让提示词缓存失效。按积分公式，GLM-5.3 缓存命中系数 1.7、普通输入 6.9，命中部分约省四分之三（`FACTS.md` §2.4）。
3. 通道：沿用 `tools/post-execute` 的 `additionalContexts`（带来源标签的合成 notice，与 DSH repeat-tool-reminder 同一机制），或 `agent/pre-step` 的消息修正（工具检索公告、todo 提醒、高峰提醒与项目图的每步投影用这一条）。notice 必须带 `id` 与 `role`（`src/shared/dsh-min.ts` `createUserNotice`，§2.4a）。方言与编排层用的是公共库里同一套工具：每步 notice 接缝 `src/shared/step-notice.ts`，包装 `wrapSystemReminder`（`src/shared/zcode-notice.ts`）。
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
| lessons | 行禁用（出厂如此）：没有经验工具、候选提醒与服务，派发的简报不带经验，其余行不受影响；工具注册失败：全部撤掉；会话不在项目里：`lessons_query` 答空并说明，合并与提议得 `no_project`；`.llm/` 加不进忽略文件：这次写入得 `io`、不建 `.llm/`；流水读不出：工具报 `io`，提醒这一步不发，失败的调用不带提醒，`relevant` 给空；失败匹配自己出错（读历史、读流水）：调用的结果原样，告警一次；命中写不下：提醒照给，告警一次；`propose` 对字段不合格或像密钥的候选答 `rejected`（什么都不写），对服务自己的失败答 `{error}`（派发一侧走退路批注，之后由本行导入）；取不到主 Agent 的判断：候选与复发提醒改发所有根 agent；任何一种都不挡 agent，也不拦任何调用（`ORCHESTRATION.md` §8.6） | 告警、工具错误、行健康（§2.5） |
| workflow / hourness | 无记录、无报告 | 行健康 |
| graph | 没有图工具、每步投影与图文件门禁；图目录缺失或图有校验错误时，工具照常注册并把问题报给模型，投影注入一条说明；读图抛错时本步不带投影；会话没有工作目录时门禁只判断绝对路径 | 告警、工具错误、行健康（§2.5） |
| graph-panel | 命令注册失败时面板写不进图；现场投影注册失败时面板没有现场，写入照常 | 告警、行健康 |
| rules | 行禁用或没提供服务：没有档位可读，派活照原来的槽位，GLM 提醒照原文，guard 不写规则板那一行；`/rules` 注册失败：档位改不了，已存的照常交出；`rules_show` 注册失败：agent 读不到规则，门照常；门装不上：这一行不执行任何规则，只显示；没有计价服务或 `peak` 出错：读不出是不是高峰，三档都不起作用；读状态或判定出错：这一次调用放行，行健康降级；存档坏了按变更记录重建，仓库里的规则文件被规则板以外改过时不生效；等待单写不成：这次调用照样拒绝，文字说没记下，要 agent 自己重试；唤醒发不出：子 agent 的单转给派发它的 agent 再发一次，其余的单取消；宿主没有 `agents` 服务或读它抛错：不转交、不唤醒、不取消，单留着；心跳写不成：下一个周期再写、告警一次，别的宿主 45 秒后按 `host-gone` 过期它的单，拥有者给原来的 agent 发一次说明；不做档的 goal 没暂停成：单上记 `pauseFailed`、照样排队，行健康降级，拒绝文字说没暂停成；没恢复成：唤醒文字带原因并叫 agent 告诉人，单照样转 `done`，行健康降级，人用目标条或 `/goal resume`；单写不成时把刚暂停的 goal 恢复回去；卸载时 `goals.resume` 抛错或写不进锁：单留着，下一次激活接手，写入至多等 2 秒；规则板自己出问题一律放行（`ORCHESTRATION.md` §16、§16.11、§16.13） | 告警、行健康 |
| design | 行禁用或没注册上 `/wish`：没有主 Agent，其余会话不受影响；会话状态服务没到、状态没注册上：`/wish` 拒绝开启，服务到了之后自动恢复；持有者记录读不到：按会话状态判是不是主 Agent，行健康说再发一次 `/wish`；指向没生效的 `/wish` 的记录删不掉：记录留着，那个会话的行健康说发 `/wish off`，别的会话的 `/wish` 照样接管；会话状态读不出：这一步当作普通会话；让别的会话退出主 Agent 没成功：那个会话的身份节、工具面仍按记录判为普通会话，只有它的流程条和按钮显示得不对，直到下一次对齐；工具面里的 `str_replace_editor` 形状不认识：去掉它。降级不挡任何普通会话（`ORCHESTRATION.md` §3.1） | 告警、行健康（§2.5） |
| loops | 行禁用或服务提供不上：没有登记表，要交条目的行读不到服务，照自己的退路做（执行行自己执行事件条目），行健康说原因；一份交来的东西被整份拒绝：已有的那一份不动，行健康写原因；几项不合：那几项丢掉，其余照常，行健康写字段路径与原因；条目等一个没人声明的事件：灰显、不跑，事件一到转为生效；事件到了而条目合不上它：条目丢掉，行健康写原因。存储（§18.7）：`.llm/loops/` 建不起来或写锁取不到，这一次不写（`/loops` 回「循环板正忙，没记上，再打一次」），记录已追加的改动下一次读时补上；git 在合并、变基、拣选、回退、二分或占着索引时不写 `docs/loops/`，改动已生效、文件欠着，标记消失后补上；改名失败留着临时文件、下一次读补上；条目文件在循环板之外被改、读不出、不在这份检出里：那一项不跑，页面写明，`/loops restore` 能按记录写回；变更记录末行没写完就截掉并另存，中间坏一行就跳过、另存、等人 `/loops ack`；没有批准记录的条目只读入、标 `unadopted`、不跑。门（§18.8）：装不上则没有什么拦着别人写循环板的文件（行健康写明），判不出来的调用照常放行（告警一行），流水写不进不改变判定。运行时（§18.9）：没有会话控制器就不提供服务、不跑条目、不起拍（写一行，不降级，交条目的行照自己的退路做）；运行锁在别的进程手上就不跑这个项目，锁的文件读不出、改不了名就这一拍不跑；收件箱写不进时按 1、3、6 秒重试三次再回 `busy`/`io`（调用方不必重试，漏掉的那一次由图上的事实与夜间巡检兜住）；收件箱里读不懂的行跳过并计数，躺过 7 天的记 `expired`；`state.json` 读不出就按空的重建（这一次不补处理停机期间的事件）；运行记录写不进只写一行 info，不挡运行；harness 动作抛错、不回答（6 小时）都记 `failed`；投递的接缝还不在时「告诉主 Agent」记 `held`、原因 `holder-unreadable`，消息不丢；脚本与检查的条目一律 `refused`（`unadopted`、`check-missing`），不起进程（`ORCHESTRATION.md` §18） | 告警、行健康（§2.5） |
| 编排层包 `dsh-hourness` 缺席（只装 GLM 包） | GLM 会话照常：通道与登录、方言、工具检索、高峰提醒；没有图工具、记忆工具、guard 与用量流水，`/hourness` 不存在；`glm:memory` 节随记忆工具一起不出现（§5.2） | `/glm-status`：编排层包只占一行，行「全部」、状态「未加载」 |
| GLM 包 `dsh-glm-zcode` 缺席（只装编排层包） | 编排层对所有路由照常：图工具与每步投影、图文件门禁、记忆与用量流水、`/hourness`（没有计价服务，面板按调用与 token 列）；guard 行照样拦截并声明规则（所有路由，`ORCHESTRATION.md` §6.2），纠偏与声明用原生工具名；没有 `/glm-status` | `/hourness-status`：GLM 包只占一行，行「全部」、状态「未加载」 |

激活期（`apply`）不抛错：配置缺失降级为 warn 与 no-op，因为激活失败会拖垮宿主启动（2026-10-27 事故）。降级必须上报，不得只打一行警告（`CHARTER.md` §7.1 条款 7）。

## 8. 契约与适配层

- adapter：`ZcodeAdapter` 底部有编译期检查 `AdapterContractCheck`，对照官方 `LlmAdapter` 类型〔实读〕。
- 事件钩子与服务：结构类型逐项对照 rc.3 运行时包，证据见 §2.4a 接口对照表〔实读 2026-10-28〕。官方 `.d.ts` 只装了 `dsh-llm`、`dsh-attachment`、`cordis` 三个包（新增开发依赖须用户批准），装了的地方加编译期检查：`LlmStreamOptionsContractCheck`（`GenerateOptions` 覆盖 `llm/stream` 监听器读取的字段）、`AttachmentsContractCheck`（`AttachmentStore` 覆盖通道读图用的成员）。其余接口没有官方类型可对照，靠对照表与 L3 探针。
- 适配层：薄适配层是 `src/shared/dsh-min.ts`（宿主钩子、服务、载荷、命令、会话）与 `src/shared/lm-min.ts`（LLM 消息与流的词汇、附件服务成员）。各行只从这两个文件取宿主类型；GLM 模型目录在 `src/glm-llm/models.ts`，不属于适配层〔已实现 2026-10-28〕。
- 公共库：适配层所在的 `src/shared/` 是两包的公共库（目录归属见 `scripts/packages.mjs`）。除适配层外还有路由判定、数据目录、行健康、JSON 值类型 `json.ts`、每步 notice 接缝 `step-notice.ts`、两包都用的 ZCode 原文 `zcode-notice.ts`（镜像文件，§5.9），以及两包之间的契约：工具名 `tool-names.ts`、方言服务 `dialect.ts`（§5.4）、计价服务 `pricing.ts`（`ORCHESTRATION.md` §11.3；GLM 积分公式本身在 `src/glm-llm/credits.ts`，不在公共库）。它不导入任何包目录；GLM 目录（`glm-llm`、`glm-prompt`、`toolsearch`）与编排层目录（`data`、`guard`、`memory`、`workflow`、`report`、`graph`、`rules`、`execute`、`design`、`loops`）互不导入，类型导入也算，由 ESLint 按目录表检查（`DEVELOPMENT.md` §10）〔已实现 2026-10-29，split 第 1 步〕。tsc 顺着导入把用到的公共库文件编进每个包的 `dist/shared/`，两个包各有一份产物、各是一份模块实例；所以公共库只放常量、类型与纯函数，不持有跨行共享的模块级状态，跨包的状态只走 cordis 服务。vendored `schemastery.ts` 有上游原样的模块级状态，今天只被 GLM 包导入，编排层以后用它声明 `Config` 时要核对两份副本的影响并给编排层包加 `@deepseek-ai/cosmokit` peer〔split 第 5 步〕。图行与 guard 行、设计行之间的契约 `glmHournessGraph` 都在编排层，放在 `src/graph/service.ts`：`dirFor`、`isGraphTool`，和第 5 步加的 `focusOf(session)`（会话的焦点，取法与每步投影相同：可见历史里最后一次成功的 `graph_focus` 调用或投影 notice，历史里没有时取 `graph_focus` 记在内存里的；只读）。设计行的阶段提醒与 `design-before-release` 读 `focusOf`，各个读者只检查自己调用的成员（`graphService`、`graphFocus`）。
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
