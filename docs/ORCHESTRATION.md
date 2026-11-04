# GLM-Hourness 编排层设计

版本：0.3（2026-10-28）
状态：生效（设计定案；除标注〔已实现〕者外均为〔规划〕）。§2.6、§2.9–§2.13 的项目图引擎原型已于 2026-10-28 经用户批准（M2.1 选 A）并合入 main；原型的各条细则由 agent 按原型自定（§15），人可推翻。取代运行时设计 v0.1 的编排部分（`.llm/docs/03-runtime-design.md` §3/§4/§10/§11，原文见 git 历史提交 `c518317`）。
来源：2026-10-27 用户与 Kiro 的设计讨论（逐条定案标〔定案〕）。
前置：`CHARTER.md`、`DESIGN.md`。

## 1. 定位

编排层指 LLM 之上的部分：项目图与主 Agent、设计循环、角色、决策卡、guard、环境与检查器、记忆与学习、规范、度量、用量与峰谷、运维与报告、呈现。

设计目标〔定案〕：

1. 这套工作流是整个插件的设计目标。它要融进与 LLM 的对话里，把一套完整、可复用的开发体系量化成标准与规范，由 harness 保证实施，不依赖 LLM 或人的自觉。
2. 流程对人和 LLM 同时可见：每个阶段都有告知（给 LLM）、门禁（在执行边界检查证据）、呈现（给人看的 UI）。
3. DSH 已有的能力尽量借用官方组件，不自创；但不因此放弃功能，没有的就自己做。

现状〔已实现〕：workflow 行只记录派遣类工具调用（`spawn_teammate`、`team_task_create`、`team_task_update`、`send_message`、`subagent`、`subagent_fork`），记录是 `{at, kind, subject}`，没有分级（L1/L2/L3 与五键文案已在 M3 第 10 步删去）；晨报从三条审计流水和项目图聚合，派遣记录与违规取自项目目录、用量取自用户级目录（`DESIGN.md` §2.4），要人定的事取自调用会话所在的项目图（§5）；`/hourness` 命令输出晨报与积分口径的用量面板（§11.3）；GLM 会话进入高峰时段时收到一条提醒（§11.4）。

## 2. 项目图即主 Agent

todo 撑不起上百轮的大项目：它是平的，没有层级与因果；它活在会话里，压缩或换会话就散；它只记做什么，不记为什么，也不记做完的证据。项目图取代它成为项目的骨架〔定案〕。

### 2.1 构成

主 Agent 由三部分组成：

| 部分 | 内容 |
| --- | --- |
| 图 | 状态与身体：节点、连线、证据、历史 |
| 驱动循环 | 节拍：每一拍读投影、选动作、执行或派发、写回结果与证据 |
| LLM | 每一拍里的大脑 |

状态全在图里，主 Agent 的会话随时可以丢弃：压缩、崩溃、换会话都不丢东西，上下文保持很小。先例：Ralph 循环每轮新开 agent、进度只写文件；DSH 的 `tool-ralph` 每轮只传有界报告，工作区即长期记忆。本设计沿用的是「状态在文件里」这个思路，并把清单换成树；执行模型不沿用 Ralph，见下面的驱动循环。

驱动循环〔定案 2026-10-28〕：节拍用 DSH 的会话目标 `goal` 加 `goal-round-driver`，在主 Agent 的同一个会话里推进。rc.3 的机制〔实读〕：

- goal 服务与驱动器在宿主层（`dsh-web-app/cordis.patch.yml` 525 行注释），本包的宿主插件 inject `goals` 即可。agent 空闲、goal 处于 active 且 armed 时，驱动器以 `agent.followup` 投递一条 `<goal_round>` 用户消息（`dsh-goal-round-driver` 164 行），提示词固定，只含目标原文与轮次（11 行 `renderGoalRoundPrompt`）。
- 有 subagent 服务时，驱动器在每轮之前等待这个 agent 正在推进的子 agent 结束（132 行 `waitForChildren`）。所以一轮之内主 Agent 派出后台子 agent 后可以继续做别的（§3.6），下一轮要等子 agent 都结束才开始。
- 每个 goal 都有轮次上限：`maxGoalRounds` 只接受正整数，`create` 不传时取服务配置 `defaultMaxGoalRounds`，默认 256（`dsh-goal` 455、588 行）。本项目设一个大值，到上限时 goal 记 `round-limit` 阻塞，当作要向人汇报的事件，不当预算（§4.3）。
- 会话恢复或 fork 之后 goal 不会自动 arm（`dsh-goal-round-driver/README.md` 57 行）；遇到 max-tokens、取消、刷盘失败时驱动器 disarm。

本包的宿主插件负责三件事〔规划〕：

1. 由人发起：经命令或 UI 按钮创建、恢复 goal，目标文本取项目图的当前目标。`goals.create` 与 `resume` 在服务层只检查 agent 是否 live（`dsh-goal` 635、686、755 行），「必须由人直接发起」只在模型工具 `dsh-tool-goal` 里检查，所以「不自动复活」由本包自己守住。
2. 每拍注入：在 `agent/pre-step` 识别目标轮消息后追加投影 notice（§2.5）。
3. 完成门禁：`update_goal` 的 `complete` 在 `tools/pre-execute` 核对图上的证据，缺证据就拒绝并给出正路。

L3 核实〔实测 2026-10-28，派发可行性验证 (c)，`ROADMAP.md` 借用组件核实清单第 12 项〕：探针覆盖层里的验证插件（`scripts/probe/probe-dispatch.mjs`，不属于 bundle）在一次工具调用里新建一个根 agent，经 `goals.create` 给它建 goal（插件建，不经模型工具），驱动器照常投递第 1 轮。三件事的接缝都成立，证据是探针场景 `glm-goal`：

- 每拍注入：在 agent 作用域的 `agent/pre-step` 里于 `next()` 之后把 notice 追加到决策的 `messages`，notice 随目标轮进入该步。驱动器在下游监听器前后各做一次预约校验（`dsh-goal-round-driver` 286–350 行），没有受影响：第 1 轮结束后第 2 轮照常开始，每轮各一条 notice。注入不能改用 `agent.followup` 或 `steer`：进入下一回合收件箱的消息会被驱动器当作竞争输入，预约作废（249 行）。
- 完成门禁：GLM 路由上 `update_goal` 是延迟工具（`get_goal` 常驻），模型经 DeferredToolCall 调用，`tools/pre-execute` 看到的是 `update_goal` 本身。缺证据时拒绝 `complete`，拒绝以工具错误回到模型，goal 保持 active；证据就位后放行，goal 进入 complete 并 disarm，`dsh-tool-goal` 追加收尾消息 `<goal_complete>`（365 行），驱动器不再开新一轮。
- 由人发起：服务层不查人类授权，插件建的 goal 照常被驱动，所以「只由人发起」完全由本包的命令入口守住。
- 限制：headless 一次性运行器在自己 agent 第一次静止空闲时退出（`dsh-headless` 349–351 行），任务回合里建的 goal 一轮都跑不到（探针场景 `goal-headless`）。探针因此让 goal 跑在第二个根 agent 上，由还停在工具调用里的 headless 根 agent 撑住进程；以后标定任务若要用 goal 驱动，运行器也要这样做。桌面版上 goal 服务与驱动器在宿主层、`tool-goal` 在 `preset-standard` 里（`dsh-web-app/cordis.patch.yml` 525–533 行，`presets/standard.patch.yml` 43 行），沙盒模板是平铺组合。宿主层的 `tools/pre-execute` 在桌面版上看得到 preset 内工具的调用（guard 在桌面版拦过 preset 内 `pwsh` 的调用，`DEVELOPMENT.md` §7），完整流程在桌面版组合上的表现随 L4 核实。

不用的接缝：`tool-ralph` 是模型调用的前台工具，阻塞调用方的回合直到全部轮次结束，提示词规定只在人明确要求时使用，依赖 `workflowEngine` 与固定脚本，所在的可选包默认关闭（`dsh-tool-ralph/README.md` 12、162 行，lib 13、36 行）；用它做主驱动，主 Agent 不能并行派发，也不能发出异步卡后转做别的。`schedule` 按墙钟时间投递一条提醒消息，不是节拍，用于晨报、巡检与谷段排期（§11.4、§12）。自己写空闲驱动也能做，但驱动器的代码大半是竞争保护（预约、`agent/pre-step` 前后两次校验、`sessions.flush` 检查点、卸载时取消），重写的收益只是换一套提示词。

### 2.2 节点

| 类型 | 用途 |
| --- | --- |
| 目标 | 一句话需求展开后的顶层目标，带需求卡（§4.2） |
| 特性 | 目标下的功能分支 |
| 决策 | 设计决策，带方案五栏（§4.3）与验证状态 |
| 任务 | 可派发的叶子，带验收条件 |
| 风险 | 事前验尸与运行中暴露的风险 |
| 待决 | 需要人拍板的问题，对应决策卡（§5） |
| 规范 | 量化的规矩（§9） |
| 工具 | 环境分支中的工具（§7） |
| 复盘 | 事故的无责复盘 |

公共字段：id、类型、标题、状态、父节点、验收条件（怎样算做成）、证据、坡位（爬坡：还在摸索；下坡：已在执行）、历史。

任务节点另带派发属性，主 Agent 把任务派给后台子 agent 时由 harness 读取：种类（实现、测试、审查、文档）、写入范围（子 agent 可写的文件与目录，审查为空）、模型档位、交回结构，以及是否给它独立的 git 工作树（多个写任务并行时）；验收条件用公共字段。没有角色字段，也没有负责角色字段〔定案 2026-10-28：取代角色卡与队友角色〕。字段格式见 §2.6。

状态：提议（界面虚线）→ 已批准（实线）→ 进行中 → 完成；另有废弃、被取代。

决策节点另带验证状态：未验证、沙盒验证、真机验证、被推翻、被取代。已采纳但未验证的决策数（验证债）设上限，超过上限先验证再设计。

### 2.3 连线

分解（父子）、依赖、来源（这个节点为什么存在）、证据（哪个提交、哪次测试关掉了它）、取代（新决策取代旧决策）。

### 2.4 状态规则

状态由证据推动，不由自述推动：

- 标「完成」必须附证据：提交、带退出码的测试运行记录、检查器结果。
- 「进行中」节点连续若干轮没有相关变更，发提醒。
- 已关闭节点的关联文件被再次改动，自动重开并记一次返工。
- 同一节点第三次修复，问人要不要「停下查根因」（`CHARTER.md` §7.1 条款 4 的方向；`d-chat-not-cards` 之后不在卡上问）。数法全文统一：节点第一次完成之后，每一次重开开始一次修复，第 n 次重开即第 n 次修复开始；LLM 的第 3 次重开（人自己的重开不算）触发 harness 在该节点下提一张提议式的人定待决——一个方案的四行，不给选项，题目、四行与「附」见 m4 设计 §4.6；认法是 `propose` 历史的 `reason`「第三次修复：<节点 id>」，正文改过照样认得。主 Agent 把它放进下一批问一句「先停下查原因，可以吗？」，人答过（同意或说不用查都算）之后，再数 3 次才再问。实现在 `src/graph/reopen.ts`，由 `graph_status` 在重开成功后交一条 notice（m4 任务 `m4-rules`，2026-11-04）。

### 2.5 投影、todo 视图与重锚

- 投影：模型不读整张图，每一步只收到当前节点、它到目标的祖先链、相邻与依赖节点、当前阶段与未通过的门禁。按 `DESIGN.md` §6 的约定注入在对话末尾。祖先链让模型每一步都知道「为什么在做这个」，用于治目标漂移。
- todo 视图：TodoWrite 保留（GLM 的训练习惯），由 harness 同步为当前叶子的子任务；勾掉一项等于关闭一个节点，同样需要证据。
- 重锚：压缩完成后立即重新注入投影、规范摘要与本会话违规计数。图存在文件里，压缩不会丢失它。

每步投影〔已实现，`src/graph/reminder.ts`；L2、L3 探针（设焦点后注入、不变不注入、改标题后再注入、压缩后重锚、目标轮）与 L4 桌面版验证，2026-10-28 随图行默认启用；`ROADMAP.md` 2.3〕：

- 当前节点：agent 用图工具 `graph_focus {id}` 设定自己的焦点节点（一般是正在做的任务），每个会话一个，再调一次就移走。`graph_focus` 不写图，只确认节点存在，返回它的类型、标题与状态；投影从下一步起送到。
- 注入：行在 `agent/created` 时给每个 agent 装一个 `agent/pre-step` 监听器，把投影追加在本步已接纳的消息之后；监听器用 todo 提醒与高峰提醒的同一个接缝（公共库的 `src/shared/step-notice.ts`，`DESIGN.md` §5.5）。投影是 `createUserNotice` 生成的 notice（来源 `glm-graph-projection`），正文用 `<system-reminder>` 包装（与工具检索公告共用 `wrapSystemReminder`，在公共库的镜像文件 `src/shared/zcode-notice.ts`），不进系统提示词（`DESIGN.md` §6）。不会变成请求的空决策不加。
- 内容：焦点节点与它的验收条件；到目标的祖先链（父节点在前）；阶段；子节点；来源（它因哪些节点而存在）；它依赖的节点与依赖它的节点；未通过的门禁；图有校验错误时另加一行「写入一律被拒，告诉人」。每个节点一行：类型、id、状态（决策另带验证状态，拍过板的待决带 `decided <选项>`）、标题。不带修订号、历史、正文，也不带目标的验收条件与非目标：修订号与历史每次写入都变，带上就要每次重注；正文与目标的条件太长。这些用 `graph_show` 读。
- 何时注入：每步从 `session.deriveMessages()`（请求可见的历史）重新推出，按下面的顺序取第一条成立的规则，规则名记在 notice 来源的 `graphProjection.reason`：
  1. `compaction`：历史里最近的压缩检查点（来源 `compact-checkpoint`，带 `compactionId`）在最近一条投影之后，或最近一条投影记下的 `anchor`（注入时可见的最近检查点的 `compactionId`）不是这个检查点。旧投影留在压缩的保留区间里也算没锚过，所以每次压缩之后都重注一次。
  2. `goal-round`：本步接纳的消息里有目标轮消息（来源 `goal`，goal-round-driver 每拍一条），每拍都带投影（§2.1）。
  3. `focus`：历史里还没有这个焦点的投影。
  4. `changed`：投影正文的摘要（SHA-256 前 12 位十六进制，记在 `graphProjection.digest`）与最近一条投影的不同。
  都不成立时不注入，请求前缀保持不变，便于命中提示词缓存。图里别处的改动、对焦点的批注不改变正文，也就不重注。
- 焦点从哪里来：历史里最近一次成功的 `graph_focus` 调用或最近一条投影，取后出现的；续跑后从历史里找回。压缩会把调用与旧投影都移出可见历史，所以行在内存里按会话 id 另记一份，压缩之后的那一步靠它重锚，重锚的投影又把焦点写回历史。进程在压缩之后、下一步之前退出时焦点丢失，要再调一次 `graph_focus`。
- 出错：焦点节点不在图里、图目录不存在时，注入一条说明（同样只在变化时注入）；读图时抛出异常则告警，本步原样放行。
- 路由：与图工具一样不分路由，GLM 与非 GLM 都注入，只有调过 `graph_focus` 的 agent 收到投影。`agent/pre-step` 的载荷里没有路由（`DESIGN.md` §2.4a），要按路由区分就得另挂组装监听器；图是项目状态，不是方言，不需要区分。
- 没做：重锚时的规范摘要与本会话违规计数（等 guard 的违规记录与规范体系，M4）；todo 视图。
- 验证：`tests/graph-reminder.spec.ts` 在假宿主 `tests/fake-rc3.ts` 上（L2）覆盖设定焦点后的首次注入、不变不重注、投影内外的改动、焦点移动与被拒的调用、压缩重锚（检查点替换整段历史，以及旧投影留在保留区间）、目标轮、续跑与崩溃后从历史找回焦点、坏图与焦点节点消失、空决策、每个 agent 只装一次、没有会话的 agent 与读图失败。真实请求里的投影与压缩后的重锚（L3）按 `ROADMAP.md` M2 2.11 的检查清单做。

### 2.6 存储与文件格式〔已实现，2026-10-28 用户批准原型〕

约束：放在仓库内的通用位置，人可读，diff 友好，随 git 版本化；不建工具专用目录（`CHARTER.md` §7.1 条款 10）。提交信息带节点 id，从代码能查到它为什么存在，从节点能查到哪些提交实现了它。

位置：`docs/graph/`。`docs/graph/nodes/` 下每个节点一个文件 `<id>.json`，文件是唯一事实源；`docs/graph/graph.svg` 是渲染器按节点文件生成的图片，与节点文件同批提交，由测试检查它与渲染器输出一致。

格式选 JSON，不选 Markdown frontmatter（原倾向，见 git 历史）。理由：

- 读入用 Node 内置的 `JSON.parse`，写出用本项目的规范化写出，不新增解析依赖，也不必自写一套 frontmatter 子集的解析器。
- 节点里有嵌套结构（证据、连线、历史、待决选项），JSON 能直接表达；frontmatter 要表达它们，就得另定一套嵌套语法。
- LLM 与脚本读 JSON 不需要额外约定。

代价：长段正文在 JSON 里是一行带 `\n` 的字符串，不如 Markdown 好读，Gitee 上看到的是代码而不是排版。人主要看面板与图片（§2.10），长篇论证仍写在 `docs/`，节点正文只写短段。

规范化写出（确定性序列化）：

- 两空格缩进，LF 换行，文件以换行结尾，中文不转义。
- 字段按下表顺序写出，可选字段为空时不写；`edges` 按（类型，目标）排序，`evidence` 与 `history` 按追加顺序。
- 一次变更只改动它自己的几行。规范文件读入后再写出，字节完全相同。手改出来的非规范文件在校验时报告，引擎下次写这个节点时把它规范化。

节点 id：小写字母开头，由小写字母、数字与连字符组成，至多 48 个字符，创建后不改，文件名就是 id。提议时不给 id，引擎按「类型-序号」生成（例 `task-12`，取最小的未用序号）。

字段（表中顺序就是写出顺序）：

| 字段 | 类型 | 适用 | 含义 |
| --- | --- | --- | --- |
| `id` | 字符串 | 全部 | 见上 |
| `type` | 枚举 | 全部 | `goal` 目标、`feature` 特性、`decision` 决策、`task` 任务、`risk` 风险、`question` 待决、`norm` 规范、`tool` 工具、`retro` 复盘（§2.2） |
| `title` | 字符串 | 全部 | 一行标题 |
| `status` | 枚举 | 全部 | `proposed` 提议、`approved` 已批准、`doing` 进行中、`done` 完成、`dropped` 废弃、`superseded` 被取代 |
| `parent` | id | 目标以外全部必填 | 分解连线。目标节点没有父节点 |
| `slope` | 枚举 | 可选 | `uphill` 爬坡、`downhill` 下坡 |
| `stage` | 枚举 | 目标、特性，可选 | 设计循环阶段（§4.1）：`wish`、`interview`、`design`、`release`、`decompose`、`execute`、`merge`、`operate` |
| `verification` | 枚举 | 决策必填 | `unverified` 未验证、`sandbox` 沙盒验证、`device` 真机验证、`overturned` 被推翻、`superseded` 被取代 |
| `kind` | 枚举 | 任务，可选 | 派发种类：`implement` 实现、`test` 测试、`review` 审查、`docs` 文档 |
| `tier` | 枚举 | 任务，可选 | 模型档位（§3.5）：`hard` 难题、`standard` 常规、`simple` 简单。harness 派发时把档位换成 `agentOptions` |
| `worktree` | 布尔 | 任务，可选 | `true` 表示给子 agent 独立的 git 工作树（`cwd`），用于并行的写任务 |
| `outputSchema` | 字符串 | 任务，可选 | 交回结构的名字或仓库内路径，harness 派发时解析为 `outputSchema` |
| `body` | 字符串 | 可选 | 正文 |
| `acceptance` | 字符串数组 | 可选 | 验收条件（怎样算做成） |
| `nonGoals` | 字符串数组 | 可选 | 非目标 |
| `writeScope` | 字符串数组 | 任务，可选 | 写入范围：子 agent 可写的文件与目录，仓库相对路径，`/` 分隔，目录可以 `/` 结尾；不含 `.`、`..` 与空段，不含反斜杠、冒号、通配符与 Windows 文件名不允许的字符。审查任务为空。harness 在子 agent 的 `tools/pre-execute` 里按它拦写入（guard） |
| `options` | 数组 | 待决必填，2–4 项 | 表格卡的行（§5）：`{key, label, gain, cost}`，即选项、怎么做（加粗短语）、得到、代价，按显示顺序存放，推荐项在最后。`key` 以字母或数字开头，由字母、数字与连字符组成，至多 32 个字符（例 `A`），同一节点内不重复。表格卡之前写下的待决是 `{key, label, consequence}`（后果），照常读入 |
| `dimension` | 对象 | 待决，可选 | 表格卡的对比列，至多一列：`{name, values}`，`name` 是列名，`values` 是选项 key 到格子文字的对象，每个选项一格 |
| `recommend` | 选项 key | 待决必填 | 推荐项，是最后一个选项的 `key`（写入规则，见下）；论证写在 `body` |
| `crux` | 字符串 | 待决，人定的必填 | 「取决于」：只有人知道答案的那个关键问题 |
| `verdict` | 字符串 | 待决，人定的必填 | 结论行「是 → X；否 → Y」，点名选项 key |
| `weight` | 枚举 | 待决，人定的必填 | `one-way` 单向门（改目标、验收条件或非目标，或以后改起来很贵的方向，§2.9.1 第 1、5 类）、`two-way` 双向门 |
| `decision` | 选项 key | 带 `options` 的待决，拍板后 | 人选中的选项 |
| `ask` | 字符串 | 提议式待决，必填 | 问句：主 Agent 对人说的那句话从开头到第一个问号（含），一行，恰好一个问号并以它结尾，不超过该问法的字数上限（`recommend` 160，其余 120） |
| `form` | 枚举 | 提议式待决，必填，建后不能改 | 问法：`recommend` 让人同意一条推荐，`choose` 在两三条路里选，`want` 让人改正一个猜测，`look` 让人看一样东西指毛病 |
| `proposal` | 字符串 | 提议式待决，必填 | 推荐的做法、猜测或给人看的东西的名字，一行，不超过 60 个字；`choose` 取 `ways` 的最后一项 |
| `reason` | 字符串 | `recommend`、`choose` 必填 | 为什么，一行，不超过 60 个字 |
| `cost` | 字符串 | `recommend`，可选 | 真有代价才写，一行，不超过 60 个字 |
| `ways` | 字符串数组 | `choose` 必填 | 两三条路，每条一行写人会看到什么，不超过 50 个字，没有问号，互不相同，推荐的放最后 |
| `notTaken` | 字符串 | `recommend`、`choose`，可选 | 没选的做法，留给记录，一行，不超过 60 个字 |
| `conclusion` | 字符串 | 提议式待决，拍板后 | 人定了什么，一行，不超过 120 个字 |
| `edges` | 数组 | 可选 | `{type, to}`：`depends` 依赖（本节点依赖 `to`）、`source` 来源（本节点因 `to` 而存在）、`supersedes` 取代（本节点取代 `to`） |
| `evidence` | 数组 | 可选 | `{kind, ref, exit?, note?}`：`commit`（`ref` 为 7–40 位十六进制提交号）；`test` 与 `check`（`ref` 为命令或检查器名，`exit` 为退出码，必填）；`decision`（拍板时由引擎写入，`ref` 为选项 key） |
| `history` | 数组 | 必填，至少一条 | 每次变更一条，格式见 §2.9 |

§2.3 的五种连线落在三处：分解是 `parent`；依赖、来源、取代写在起点节点的 `edges` 里；证据指向图外的提交与运行记录，写在 `evidence` 里。

字符串字段不能是空串或只有空白；`title`、`outputSchema`、选项的 `label`、证据的 `ref` 只能是一行。

派发属性取代了原来的 `owner`（负责角色）字段（2026-10-28 用户决定，§2.2）。此前的原型带过 `owner`，但还没有任何节点文件用过它，所以不做迁移；文件里出现 `owner` 时按未知字段报错。

校验在读入时执行，每条错误写明文件与字段路径（例 `nodes/task-3.json` 的 `history[2].actor`）：

- 字段类型、枚举值、必填字段，未知字段报错；id 与文件名一致。
- `parent` 与连线目标都存在，连线不指向自己，同一节点上没有重复连线；分解与依赖都无环；目标节点没有父节点，其他节点必须有父节点，于是沿 `parent` 最终走到一个目标节点。
- `recommend` 与 `decision` 是已有选项；`verification` 只出现在决策节点，`options`、`dimension`、`recommend`、`crux`、`verdict`、`weight`、`decider`、`decision` 只出现在待决节点，`stage` 只出现在目标与特性节点；`decision` 类证据只出现在待决节点，`ref` 是已有选项（提议式待决的 `ref` 固定为 `conclusion`）。`ask`、`form`、`proposal`、`reason`、`cost`、`ways`、`notTaken`、`conclusion` 只出现在没有 `options` 的待决节点，带 `options` 的待决不带它们；没有 `options` 的待决必须有 `ask`、`form`、`proposal`，并按问法有该有的、没有不收的（见下，提议式待决）。表格卡的字段在文件里只查形状：`gain`、`cost`、`consequence`、`crux`、`verdict` 是非空字符串，`weight` 是两个取值之一，`dimension` 有非空的 `name` 与 `values`，`values` 至少一格，键是选项 key 的格式，格子是非空字符串。行文、长度与必填是写入规则（见下）。
- 派发属性（`kind`、`tier`、`worktree`、`outputSchema`、`writeScope`）只出现在任务节点；`kind` 为 `review` 的任务 `writeScope` 为空；`writeScope` 里没有重复路径。派发属性都是可选的：缺属性的任务照样是合法节点，派发时缺什么由以后的简报门禁拦（§3.3）。
- 状态为 `done` 的节点有至少一条通过的证据：`commit`，或 `exit` 为 0 的 `test` / `check`，或 `decision`。
- 历史条目的字段与取值见 §2.9。
- 文件不是规范写出的样子时报告（只提示，不算错误）。

待决的写入规则〔推荐放最后：已实现 2026-10-29，决策 `d-recommend-last`；表格卡：已实现 2026-10-29，决策 `d-option-card`、`d-counter-line`〕：每张待决是一张表格卡（§5），恰好一个推荐，推荐项排在最后一个选项，人读完其余选项才读到它。推荐放最后的依据（`d-recommend-last` 正文）：Anthropic 2026-10-27 的研究里，人在两个都说得通的选项之间 86% 跟随 agent 的倾向；本图 28 张人定的待决里 25 张选了推荐项，37 条推荐里 34 条是 A。表格卡由人在 2026-10-29 定下（「就改成表格，用「取决于」加一行条件，替换掉「为什么」和「反方」两行」）：没有 `why` 与 `counter` 字段，提议或修改里带它们按不认识的字段拒绝。

卡面字段是 `options`、`dimension`、`recommend`、`crux`、`verdict`、`weight`。引擎在 `propose` 一张待决、以及 `edit` 改了待决的卡面字段时按下表核对，不符就拒绝（`invalid`），`field` 是要改的那个字段（`propose` 以 `node.` 开头，`edit` 以 `set.` 开头，例 `node.options[0].gain`、`set.crux`），`hint` 写明该怎么写。规则对所有身份生效。字数按码点计，BMP 以外的字符算一个。

| 规则 | 适用的待决 | 什么写入核对 | `field` |
| --- | --- | --- | --- |
| `recommend` 是最后一个选项的 `key`；`hint` 写明把推荐项挪到 `options` 末尾、`recommend` 仍写它的 `key` | 全部 | 改了 `options` 或 `recommend` | `options`，或 `recommend`（只改了它时） |
| 每行不写 `consequence`；`label` 不超过 20 个字；`gain`、`cost` 必填，各一行，各不超过 60 个字 | 全部 | 改了 `options` | `options[i].consequence`、`.label`、`.gain`、`.cost` |
| `dimension` 的 `name` 一行，不超过 12 个字；`values` 每个选项正好一格，每格一行，不超过 20 个字；各格（去掉首尾空白后）不能全部相同 | 带 `dimension` 的 | 改了 `options` 或 `dimension` | `dimension.name`、`dimension.values`（缺格或全部相同）、`dimension.values.<key>`（多出的键或超长的格） |
| `crux` 一行，不超过 60 个字 | 人定的必填；agent 定的有就核对 | 改了任一卡面字段 | `crux` |
| `verdict` 一行，不超过 120 个字；每个 `→` 后面的选项 key 都存在，推荐项的 key 在其中 | 同上 | 同上 | `verdict` |
| `weight` 必填 | 人定的 | 同上 | `weight` |

人定的是 `decider` 为 `human` 或没有 `decider` 的待决；agent 自己拍板的待决（`decider` 为 `agent`）免 `crux`、`verdict`、`weight`，行与对比列的规则照常。结论行里点名的 key 是每个 `→` 后面（可隔空白）由字母、数字与连字符组成的一串；`→` 后面不是这样一串的（例「否 → 再想想」）不算点名。一题至多一个对比列，由字段的形状保证（`dimension` 是一个对象）。

这些不是文件校验：规则之前写下的待决照常读入、照常显示、照常拍板（已决的不迁移），改标题、正文、`decider` 也照常。改了卡面字段的那次写入要让整张卡合规：例如第一次改旧待决的 `options`，要把 `consequence` 换成 `gain` 与 `cost`，人定的还要在同一次写入里补上 `crux`、`verdict`、`weight`。只改 `decider` 的写入不核对卡面：LLM 随时可以把待决交给人（§2.9.1），而它改不了已批准待决的卡面字段，核对会让这种交还做不成；代价是这样交给人的 agent 待决可能没有「取决于」与结论行。

面板（`ui/src/graph/common.tsx` 的 `Options`）按存储顺序列出选项，「推荐」只是推荐项上的一个标记；每个选项下的一行说明显示 `consequence`，没有时显示「得到 …；代价 …」。表格版式、对比列、「取决于」与结论行在面板上的显示交给 `m8-plain-language`。

提议式待决〔M3 第 6 步，设计行默认启用；决策 `d-ask-three-gates`，试行，人看效果再调数〕：待决有两种形状。带 `options` 的是表格卡（上）；没有 `options` 的是提议式，由主 Agent 在对话里交给人（`propose_to_human`，§3.1），人在同一个对话里回话，主 Agent 用 `record_human_answer` 带人的原话记下，面板只看不点（`d-ui-look-not-operate`）。记录与问话分开：记录是上表的字段；问话是主 Agent 自己写的一句话，不进图，只由工具查几条硬限制（§3.1）。引擎在 `propose` 与 `edit` 时按问法核对记录（`src/graph/proposal.ts` 的 `proposalRecordRefusal`），第一条不符就拒绝（`invalid`），`field` 是要改的字段：标题（一行，不超过 40 个字）；`form` 是四种之一；问句一行、恰好一个问号并以它结尾、不超过该问法的字数上限；`choose` 的 `ways`（两条或三条，每条一行、不超过 50 个字、没有问号、互不相同）；`proposal`（一行，不超过 60 个字；`choose` 的等于 `ways` 的最后一条）；按问法该有与不收的字段：`recommend` 要 `reason`，可有 `cost`、`notTaken`，不收 `ways`；`choose` 要 `reason` 与 `ways`，可有 `notTaken`，不收 `cost`；`want`、`look` 只有 `proposal`；可选的几行不能是填充（「无」「没有」「暂无」「不适用」、n/a、none 或只有标点）。`form` 建后不能改：`edit` 带 `form` 是 `invalid`，`hint` 说明丢掉旧的（`graph_status` 改为 `dropped`，带人的原话）、再新提一张。已拍板的提议式待决，LLM 与 harness 不能再改它的记录字段（人可以）。人定的提议式待决用 `decide` 带 `conclusion` 拍板（一行，不超过 120 个字，去掉首尾空白），不带 `option`；带 `options` 的待决照旧带 `option`，两者互斥；写下 `conclusion` 的同时追加一条 `decision` 证据，`ref` 为 `conclusion`。文件校验只查形状；行文与长度是写入规则，所以规则之前写下的待决照常读入。`ask` 取那句话从开头到第一个问号，所以 `recommend` 的 `proposal` 与 `reason`、`want` 的 `proposal` 必须逐字在这个问句里（由 `propose_to_human` 查，§3.1）。`PLAIN_LIMITS` 只剩标题（`schema.ts`），其余的数在 `src/graph/proposal.ts`，改数只动这一处与 `src/design/talk.ts`。需求卡的「岔路」一项（`stage.ts`）把提议式待决的 `conclusion` 与表格卡的 `decision` 一样算人拍过板的选择，`pins.ts` 按 `conclusion ?? decision` 读结论。

有错误的图照常可读：解析失败、或已知字段的类型与必填不对的文件不进节点表；其余问题（未知字段、跨字段规则、引用与环）只报告，节点照常显示。这样一个手误不会让它的整棵子树从面板里消失。只读 `nodes/` 下的 `.json` 文件；引擎写入时的临时文件名为 `.<id>.<随机串>.tmp`，读入时忽略；`nodes/` 不存在时是一张空图。

修订号：节点修订号是节点文件字节的 SHA-256 前 12 位十六进制；图修订号是 SHA-256 的前 12 位，输入是每个节点文件一行 `<id> <节点修订号>\n`，按 id 排序，解析失败的文件也算在内。引擎写入、手改文件、git 检出都会改变修订号，查看器与并发检查都以它为准（§2.11）。

### 2.7 读写权限与变更分类

| 角色 | 能做什么 |
| --- | --- |
| 人 | 在 UI 上看图、给节点写批注、在决策卡上拍板；可直接改目标与验收条件。人的改动优先级最高，也是最强的学习信号 |
| LLM | 只通过一组图工具读写，不直接改图文件（guard 拦截） |
| harness | harness 代码自动发起的变更（例：已关闭节点的关联文件被改动后重开），权限与 LLM 相同 |

这三种身份在引擎里是 `actor` 的三个取值：`human`、`llm`、`harness`。actor 由客户端入口决定，不从请求数据里读：人自己打的命令（`/graph-run`）记为 `human`，命令行与 DSH 图工具一律记为 `llm`，以后的 DSH 钩子记为 `harness`；面板不写图（plain-ui，`d-ui-look-not-operate`），不再有经面板的 `human` 写入。每种操作对各身份的限制见 §2.9。

guard 拦截〔已实现，规则 `graph-files-only`，`src/guard/graph-files.ts`；由行 `glm-hourness/graph` 注册，2026-10-28 经 L3 探针与 L4 后默认启用〕：

- 拦什么：目标在图目录里的文件工具调用，即 `Write`、`Edit`（GLM 别名）、`write`、`edit` 的 `file_path`，以及 `str_replace_editor` 除 `view` 以外各命令的 `path`；shell 命令（`Bash`、`bash`、`pwsh` 的 `command`，`terminal_send` 的 `text`）在规则 file-tools-only 判为写文件、且命令文本提到图目录时也拦。命令文本的取法与写文件的判断都照搬 file-tools-only（2026-10-28 起引号感知，§6.5.1），所以引号里提到图目录的箭头不算写入。图目录指整个目录，`graph.svg` 也在内（它由渲染器重新生成）。读不拦。
- 路径：相对路径按调用方会话的工作目录解析，`..` 先规整再判断；大小写与 `/`、`\` 不区分。shell 命令里认绝对路径与相对工作目录的写法（可带 `./`），前后紧挨着路径字符的不算（`docs/graphs`、`docs/graph.svg`、`x/docs/graph`）。会话没有工作目录时，相对路径的图目录不判断，绝对路径的图目录只判断绝对路径的目标。
- 纠偏：四段式（§6.1）。事实写出被拦的路径或命令；越界说明图文件只经图工具改，图工具留历史、查修订号、证据与权限；正路是先 `graph_show` 或 `graph_open` 读，再用对应的写工具；例外是要人权限的操作由人在面板里做，或人在对话里说、LLM 带原话转述（§2.9.1），节点文件坏了或没有对应工具时告诉人，由人手改或用 git 还原。
- 注册：图行在 `tools/pre-execute` 上以 `prepend` 注册（排在最外层），先于 guard 行判断：shell 写图目录拿到的是图工具这条正路，而不是 file-tools-only 的「改用 Write 或 Edit」，否则模型照做后还要再被拦一次。guard 行的规则不变，图目录以外的调用照旧由它判断。与 guard 行一样，带 `parent` 令牌的传输层子调用直接放行（`DESIGN.md` §2.4a）。规则跟图行走：图行禁用时没有图工具，也就没有这道门禁，被拦的一方手边总有正路。
- 图目录不存在时同样拦：手写节点文件也是绕过引擎。开始一张新图的正路是建一个空目录（图工具报 `not_found` 时的提示里写着）；`mkdir docs/graph` 不在 file-tools-only 的写文件模式里，本规则也就不拦。
- 直接拦截，与所有规则一样从所在插件行启用起就拦（§6.5）。M1.8 的影子兜底只记 file-tools-only 看不见的 shell 写入，回合结束才发现，拦不住（§6.5.2），与本规则无关。本规则只看图目录里的目标，误伤面小；2026-10-28 经 L3、L4 后随图行默认启用。
- 拒绝进违规审计〔已实现 2026-10-28〕：图行像 guard 行一样按 `projectHomeFor` 取项目目录（行配置 `home` 优先，次序见 §6.1），每次拒绝写一条与 guard 同形的记录（`rule: "graph-files-only"`、工具名、调用方 agent 与会话、来源 `scope` 与 `route`（§6.2）、纠偏全文）到同一份 `audit/violations.jsonl`（`CHARTER.md` §7.1 条款 11）。写入失败不影响拦截，第一次失败在控制台报一次。
- 声明〔已实现 2026-10-28，agent 定：列进 `glm:guard`〕：图行启用时它提供服务 `glmHournessGraph`（`src/graph/service.ts`），guard 行在系统提示词的 `glm:guard` 一节末尾加一行 `graph-files-only` 的声明，模型在一处读到全部规矩；图行卸载时这一行随之消失。2026-10-29 起这一节在所有路由上都有（§6.2），此前只在 GLM 路由上。理由：门禁生效的地方，提示词里应当有对应的告知（§6.1），图工具的描述只在模型想到用图工具时才读到。
- 与 guard 影子兜底的交互〔已实现 2026-10-28〕：图工具经引擎写节点文件，不经文件工具，`workspace-changes` 的回合摘要会列出这些文件。影子兜底经同一个服务认出图工具调用：一个回合里只要调用过图工具，这个会话的图目录下的改动就算已知来源，不记影子。代价是同一回合里 shell 绕过门禁写进图目录的改动也不记（门禁看得见的写法照样拦下）。L3 探针（场景 `glm-graph`）在临时 git 仓库里核对过：同一回合有 shell 调用与图工具写入，影子记录为空。

| 变更 | 分类 | 处理 |
| --- | --- | --- |
| 在已批准分支下加任务、带证据更新状态 | 计划内 | LLM 自主执行，留痕 |
| 新开分支、废弃分支、修改目标 / 验收条件 / 非目标 | 计划外 | 决策卡；提议节点以虚线显示，批准后变实线 |

结构性错误会沿图往下传，所以结构变更必须让人看得见。

### 2.8 每拍动作

展开节点、派发叶子、审查交回的证据、关闭或重开节点、发决策卡、更新风险。动作少，门禁与度量才好设。

### 2.9 引擎 API〔已实现，2026-10-28 用户批准原型〕

引擎是一个库（`src/graph/`），所有客户端只经它读写图，不直接碰节点文件。规则只在引擎里实现一次，客户端不重复实现。

入口是 `openEngine(dir)`（`src/graph/engine.ts`），返回 `load`、`projection`、`openItems`、`apply` 四个方法。请求结构的校验在 `mutation.ts`，投影在 `projection.ts`，节点文件的读写在 `store.ts`。每次读都重新读文件，别的进程写入的改动下一次读就能看到。

读：

- `load`：读入并校验全部节点，返回节点表、图修订号与校验问题。图有校验错误时读照常可用（面板显示错误数），写一律拒绝（`graph_invalid`），修复办法是把文件改回或用 git 还原。
- `projection(id)`：§2.5 的投影。含节点本身（不含历史）与修订号、历史条数与最近 5 条历史；到目标的祖先链（父节点在前，目标在末），链尾的目标节点带验收条件与非目标；子节点；它依赖的与依赖它的；来源与取代，两个方向都给；所在阶段（自身或最近祖先的 `stage`，都没有时为 `null`）；未通过的门禁。投影里引用到的每个节点都给出 id、类型、标题、状态与修订号（决策另给验证状态，待决另给拍板结果），拿到投影就能直接对这些节点发 mutation。
- `openItems`：等人批准的提议；人的决策队列（`questions`，见下）；agent 自己的决策队列（`agentQueue`，决定者为 agent 的未拍板待决，排法同人的队列）；最近的拍板（`recentDecisions`，见下）；进行中的节点；可以开工的叶子（状态为已批准的任务，除废弃与被取代的以外没有子节点，依赖全部完成）；验证债（状态为已批准、进行中或完成，验证状态仍为 `unverified` 的决策）。

决策队列就是异步决策卡（§5）〔定案 2026-10-28：自建，卡即图上的待决节点；提议式待决（§2.6）也在这里，带问句、问法、推荐与做法，没有选项，面板上不点，在对话里回话〕：已批准或进行中（拍过后重开）、决定者为人的待决，按提出时间从早到晚排（首条历史的时间，同一时刻按 id）。每张卡带节点引用、正文、选项（说法、得到与代价，表格卡之前的待决是说法与后果）、推荐项、决定者、提出它的节点（父节点）、来源连线指向的节点、提出时间与提出者。人在面板里选一个选项、写一句理由拍板（`decide`，actor 为 `human`），或在对话里告诉 LLM，由 LLM 带转述拍板（见下）；都不阻塞 agent。拍板后卡离开队列，待决转为完成并带 `decision`，LLM 下次读投影就能看到：父节点与来源节点的投影里这张卡的引用带 `decision`，待决自己的投影带 `decision` 与拍板那条历史（含理由）。

最近的拍板：全图已完成的待决按最后一次拍板时间从新到旧，最多 20 条。每条带节点引用、选中的选项与它的说法、决定者、拍板时间、拍板者（`human`、`llm`）、转述原话与理由（有则带）、拍板次数（大于 1 表示改过）与提出它的节点。人在这里看 agent 自己定了什么，不同意就直接再拍一次（推翻）。

投影里的门禁只报告、不拦截：依赖未完成；本节点等人批准；子树里有等人拍板的待决（`questions`）；子树里有 agent 自己要定的待决（`decisions`）；任务缺验收条件；子节点未全部关闭；决策未验证。

#### 2.9.1 决策分级与转述〔已实现 2026-10-28〕

背景：原型迁移后，人面前有 28 件待办，其中 18 个是从路线搬来的提议、9 张是已经在对话里定过的旧卡、19 条是 §15 的实现细则，真正要人拍板的只有 1 件。人的注意力是最贵的资源，所以只把非人不可的事放到人面前，其余由 agent 定、留痕、人可推翻〔定案 2026-10-28，用户：「其余全部按你的来」〕。

必须问人的只有五类，其余 agent 自己定：

1. 改目标、验收条件或非目标；
2. 仓库以外的动作（用户 profile、安装程序、删工作区外的文件）；
3. 不可逆或对外的动作（推送以外的发布、发消息、花钱）；
4. 新增运行时依赖或升大版本；
5. 以后改起来很贵的方向性岔路。

人说过的常设授权（例：「清理你自己定」）记在图上，覆盖的事不再问。从路线导入、人已经认可的里程碑视为已批准。这份清单在图上是规范节点 `norm-decision-tiers`。

引擎里的三样东西：

- 决定者：待决节点的可选字段 `decider`，取值 `human` 或 `agent`，没有即 `human`。决定者为 `agent` 的待决不进人的队列、不让任何节点变红（§2.12），LLM 可以自己 `decide`；人随时可以再拍（推翻），人拍过之后这张卡只认人的权限。LLM 可以随时把决定者改为 `human`（把事交给人）或删掉这个字段；改为 `agent`（从人手里拿走）要带转述。LLM 记录自己定的事，就是提一张决定者为 `agent` 的待决再拍板。
- 转述：LLM 的写入可以带 `relay`，内容是人在对话里说的原话（逐字引用，不超过 2000 字符）。带转述的写入拥有人的权限：可以批准、否决、拍板、取代，改目标、验收条件与非目标，废弃或恢复目标与特性，提议直接为已批准；状态规则与证据要求不变。原话写进这次写入追加的每一条历史（含连带被取代的节点），面板把它显示为「你在对话里说」，人能核对 LLM 有没有转错。只有 `llm` 能转述：`human` 直接操作，`harness` 按自己的规则走，两者带 `relay` 都按 `invalid` 拒绝；`comment` 没有这个字段。
- 再拍：已完成的待决可以直接再 `decide`，不用先重开（`from` 与 `to` 都是 `done`，追加一条新的 `decision` 证据）；选项与当前结果相同时拒绝（`bad_transition`）。谁能拍就谁能再拍。

取舍：转述靠 LLM 如实引用，引擎核不了原话的真假。替代做法是让人每次都到面板里点，代价正是这次要解决的负担。转述留在历史里、显示在面板上，人可推翻，出错的代价是一次再拍。

写只有一个入口 `apply(actor, mutation)`。mutation 是带 `op` 字段的 JSON 对象，除 `propose` 与 `comment` 外都带目标节点的修订号 `rev`；`rev` 与当前文件不符时拒绝（`stale_revision`），调用方重新读投影后再决定。除 `comment` 外都要写 `reason`。请求里出现该操作没有的字段时拒绝。成功返回 `{ok: true, id, rev, revision, node, changed}`：目标节点的 id（`propose` 为新 id）、它的新修订号、写后的图修订号、写后的节点、本次写入的全部节点 id（目标在前）。

除 `comment` 外每个操作都可以带 `relay?`（§2.9.1）。下表「llm、harness」一栏是不带转述时的限制；带转述的 `llm` 写入按「human」一栏。

| op | 字段 | 作用 | human | llm、harness |
| --- | --- | --- | --- | --- |
| `propose` | `node`（`id` 可省，`type`、`title` 必填，目标以外的类型 `parent` 必填，其余为 `edit` 能改的字段与 `edges`；状态、验证状态、证据与历史由引擎写） | 新建节点；决策节点的验证状态为 `unverified` | 直接为 `approved`；带 `supersedes` 连线时，被取代节点同时转为 `superseded` | 计划内直接为 `approved`：任务挂在已批准或进行中的特性、任务下；风险、待决、复盘挂在任何未关闭节点下（决定者为 `agent` 的待决也一样）。其余一律为 `proposed`（新开分支、新决策、新规范、新工具、新目标，以及带 `supersedes` 连线的提议） |
| `approve` | `id`、`rev` | 提议 → 已批准；带 `supersedes` 连线的节点被批准时，被取代节点同时转为 `superseded` | 可以 | 拒绝，正路是等人在决策队列里处理，或带人的原话转述 |
| `reject` | `id`、`rev` | 提议 → 废弃 | 可以 | 拒绝，同上 |
| `status` | `id`、`rev`、`to`、`evidence?` | 已批准 → 进行中 / 完成 / 废弃；进行中 → 完成 / 废弃；完成 → 进行中（重开，记一次返工）；废弃 → 已批准（恢复）。提议节点不经 `status` | 可以 | 不能废弃或恢复目标与特性（计划外，正路是提议一个待决）；不能废弃待决 |
| `edit` | `id`、`rev`、`set`（字段 → 新值，`null` 表示删除） | 改字段 | 可以 | 只能改 `title`、`body`、`slope`、待决的 `decider` 与任务的派发属性（`kind`、`tier`、`worktree`、`outputSchema`、`writeScope`）；`decider` 只能改为 `human` 或删掉，改为 `agent` 拒绝；不能改目标节点，自己提议且仍为 `proposed` 的目标除外。自己提议（首条历史是同一身份的 `propose`）且仍为 `proposed` 的节点可以改全部字段，`decider` 改为 `agent` 除外；对这样的目标，`acceptance`、`nonGoals`、`stage` 都在内（2026-10-29 用户选定，`question-23` A：没被人批准的目标是 LLM 的草稿，人批准时看到全部内容）。人批准之后的目标照旧不能改；`harness` 不能改 `llm` 提议的目标（首条历史的身份要相同） |
| `link` / `unlink` | `id`、`rev`、`type`、`to` | 加 / 删 `depends` 或 `source` 连线 | 可以 | 可以，目标节点除外（自己提议的目标也一样） |
| `comment` | `id`、`text` | 批注 | 可以 | 可以 |
| `decide` | `id`、`rev`、`option`；提议式待决改带 `conclusion`，二选一 | 已批准、进行中或完成的待决拍板：写入 `decision`（提议式待决写 `conclusion`），追加 `decision` 证据，状态转为（或保持）完成；完成的待决再拍即推翻 | 可以 | 决定者为 `agent`、且人没有拍过的待决可以；其余拒绝，正路同 `approve`。这条拒绝排在修订号检查之前 |
| `verify` | `id`、`rev`、`to`、`evidence?` | 改决策的验证状态 | 可以 | 可以 |
| `supersede` | `id`（旧）、`rev`、`by`（新） | 新节点取代旧节点：新节点加 `supersedes` 连线，旧节点转为 `superseded`。新旧节点都须为已批准、进行中或完成 | 可以 | 拒绝，正路是提议新节点并带 `supersedes` 连线，人批准时生效；带转述的提议立即生效 |

所有身份共同遵守的规则：

- 标完成（`status` 的 `to` 为 `done`）的那次写入必须带至少一条通过的证据（§2.6）；重开后再标完成要带新证据。证据只认格式，提交号是否存在、命令是否真跑过，由以后的汇合门禁核对（§4.7）。请求里不能带 `decision` 类证据，它只由 `decide` 写入。
- 待决只能经 `decide` 关闭：`status` 不能把待决转为完成。废弃待决只有人可以；LLM 认为某个问题已不成立时，正路是批注理由，由人拍板或废弃。提议状态的待决先批准再拍板；拍过的待决可以直接再拍，也可以经 `status` 重开为进行中再拍。
- 被取代只能经 `supersede` 或批准带 `supersedes` 的节点产生。取代生效时，处于已批准、进行中或完成的目标转为 `superseded`；已关闭或仍是提议的目标不动（提议用 `reject` 处理），这样旧节点先被关掉也不会让新节点无法批准。被取代的决策，验证状态同时转为 `superseded`，此后不能再 `verify`。
- `verify` 转为 `sandbox` 或 `device` 要带 `exit` 为 0 的 `test` 或 `check` 证据；`verify` 不能直接设为 `superseded`。
- `edit` 的新值与原值全部相同时拒绝（`invalid`），历史里不留空改动。

`edit` 能改的字段：`title`、`parent`、`slope`、`stage`、`kind`、`tier`、`worktree`、`outputSchema`、`body`、`acceptance`、`nonGoals`、`writeScope`、`options`、`dimension`、`recommend`、`crux`、`verdict`、`weight`、`decider`。状态、连线、证据、拍板与验证状态各有专门的操作，不经 `edit`。`parent` 在其中，人可以把节点挪到别的父节点下，挪完的图同样要通过校验（不成环）。

每次成功的写入在目标节点 `history` 末尾追加一条，字段按下列顺序写出，不适用的不写：

| 字段 | 内容 |
| --- | --- |
| `at` | 时间，ISO 8601 UTC，例 `2026-10-28T08:00:00.000Z` |
| `actor` | `human`、`llm` 或 `harness` |
| `op` | 操作名 |
| `reason` | 理由，`comment` 以外必填 |
| `relay` | 带转述的 `llm` 写入记下的人的原话（§2.9.1）；其他身份的历史里出现即校验错误 |
| `from`、`to` | 状态的起止；`verify` 记验证状态的起止；`propose` 只有 `to`（初始状态） |
| `option` | `decide` 选中的选项 key |
| `by` | 被取代节点上记取代者的 id |
| `edge` | `link`、`unlink`、`supersede` 加上或删掉的连线 `{type, to}` |
| `changes` | `edit` 改动的字段，按 §2.6 字段顺序，每个字段 `{from, to}`，`null` 表示原来没有或被删除。人亲手改的内容是最强的学习信号（§8.5） |
| `evidence` | 本次附上的证据 |
| `text` | 批注正文，`comment` 必填 |

`approve` 连带改动的被取代节点也各追加一条。重开次数（返工）从历史中数出来，不另存字段。

拒绝返回 `{ok: false, error}`，`error` 是结构化错误 `{code, message, field?, hint}`，`hint` 写正路（`CHARTER.md` §6）。错误码：`invalid`（请求或字段不合法，含写后的节点或整图通不过 §2.6 的校验）、`not_found`、`conflict`（id 或连线已存在）、`stale_revision`、`forbidden`（身份无权）、`evidence_required`、`bad_transition`（状态转换不允许）、`graph_invalid`。`field` 是请求里的字段路径，例 `node.parent`、`set.acceptance`、`evidence[0].ref`。

检查顺序：请求结构（含只有 `llm` 能转述）→ 要人权限的操作（`approve`、`reject`、`supersede`，不带转述时）→ 图有无校验错误 → 节点是否存在 → `decide` 的决定者 → 修订号 → 按节点判断的权限 → 状态转换 → 证据 → 写后的节点校验 → 待决的写入规则（§2.6）→ 整图校验 → 写入。只看身份的拒绝排在修订号之前，LLM 不会先被要求重读、重读后才被告知无权。被拒绝的请求不写任何文件。

### 2.10 三个客户端与交互〔已实现，2026-10-28 用户批准原型；人的客户端改为 DSH 原生面板，见下〕

| 客户端 | 现在 | 以后 |
| --- | --- | --- |
| 图片 | `npm run graph:render` 写出 `docs/graph/graph.svg`。SVG 不依赖任何渲染库，能显示 SVG 的地方都能看（2026-10-28 实测：Kiro 对话能显示 SVG，不渲染 Mermaid） | 晨报与汇报里附图 |
| 人：DSH 面板 | 右侧栏「项目图」页（见下「DSH 原生面板」），读经 `remote.workspaceFiles`，只看不写（plain-ui）；人要动手时在输入框打命令（如 `/graph-run`，见下「运行控制」）或在主 Agent 的对话里说〔2026-10-28 取代本机查看器，用户：不想放到网页，应与 IDE 深度耦合〕 | M8 的其余界面沿用它的组件与样式 |
| LLM：命令行与 DSH 图工具 | 命令行 `npm run -s graph -- <命令>`，JSON 进、JSON 出，actor 固定为 `llm`；DSH 图工具按命令行契约实现，行 `glm-hourness/graph` 2026-10-28 经 L3、L4 后默认启用（见下） | 命令行留给在 Kiro 里开发本仓库时用 |

本机查看器〔2026-10-28 删除，`m2-10`〕：原型阶段人用的是本机服务加单文件网页（`src/graph/server.ts`、`viewer.html`，入口 `npm run graph:serve`）：平移缩放、折叠、筛选、节点详情与各种人的操作，经带令牌的回环 HTTP 写入，经 SSE 实时刷新。用户不要网页形态，DSH 原生面板（见下）上线后整套删除，人的读写只经面板；代码、路由表与安全措施留在 git 历史里（提交 `25d1bae` 是最后一个含它们的版本）。原型的冒烟改为只跑入口脚本（`npm run graph:smoke`：命令行以独立进程批注、`open`、`show`，再出图）。

在 DSH 里用〔2026-10-28 读 rc.3 包文档与源码所得，实读，未真机验证；第 1 条已放弃，第 2 条提前到 M2〕：

1. 放弃：Desktop rc.3 默认启用内置 Browser 标签页（`dsh-web-app/cordis.patch.yml` 中的 `ui-sidebar-browser` 行）。一个客户端插件调用 `ctx.sidebarRight.openTab('browser', { params: { url } })`（`dsh-client-ui-sidebar-browser/README.md`）即可在右侧栏打开本查看器的回环地址；那是 Electron `<webview>`，页面里没有 DSH API。用户不要网页形态，这条不做。
2. 现在（M2）：原生右侧栏标签页（`sidebarRightTabs.register` + 槽 `sidebar.right.pane.tab`，`dsh-client-ui-sidebar-right/README.md`）。读图经 `remote.workspaceFiles`（只读，带变更订阅，`dsh-api-workspace-files/README.md`），写回经命令通道 `remote.commands.execute` 进入宿主侧的引擎，人和 LLM 走同一个引擎、同一套规则。客户端可调用的 Remote 能力在 `dsh-api-remotes` 构建时固定（其 README），第三方插件实际上不能注册自定义 Remote 服务，所以不走那条路。

DSH 原生面板〔已实现 2026-10-28，`m2-7`；L3 探针与 L4 桌面版核对，见下〕：

- 落点：编排层包 `dsh-hourness` 的客户端面（`packages/hourness/ui`，行 `glm-hourness/ui`，`DESIGN.md` §2.3）注册页面类型 `dsh-glm-hourness-ui/graph`（kind `glm-hourness-graph`，`keepMounted`），右侧栏的「开始」页多一个「项目图」入口。页面 id 与 kind 没有随包改名：页面 id 只要求全局唯一（`FACTS.md` §3），已打开的面板标签按它恢复。正文槽的 `inject(sessionId)` 把会话交给正文，面板显示这个会话工作区里的图（`docs/graph`）。
- 读：`ui/src/graph/source.ts` 列出 `docs/graph/nodes`，逐个 `readBytes`，用 Web Crypto 算修订号（与 `store.ts` 的 node:crypto 结果相同，有测试），用引擎自己的规则解析（`src/graph/parse.ts`，从 `store.ts` 拆出，不含文件系统与 Node 内置模块），再经同一个目录的 `changes` 变更流跟进：一帧变更只重读它点名的文件，120 ms 内的连续变更合并一次。每个会话一份数据源，多个面板共用，最后一个卸载时释放。变更流起不来时图照常可读，头部的「实时」变为「重新读取」。错误状态〔2026-10-29，`m8-ui-audit` F-29〕：图有校验错误时页签下方的提示写出第一处（文件、字段与说明），其余收在「还有 N 处」后；某个节点文件读失败（不是已删除）时节点不再悄悄消失，提示「面板读不出 N 个节点文件，这些节点没有显示」并列出文件与原因，提示里有自己的「重新读取」，点了重读全部节点文件（变更流在跑时头部没有这个按钮，失败的文件只在它的下一次变更时重读）〔`m8-ui-audit` R-02〕，下一次读成功就消失；面板渲染出错时显示错误与「重新加载」按钮，点了重新渲染，不用关掉页签；工作区没有图时的一节按 plain-ui 1.3 §6.6 写〔2026-11-04〕：标题「这个工作区还没有项目图」，正文说项目图记下什么、主 Agent 靠它接手，做法一行「在对话里让 agent 建空目录 docs/graph/nodes，面板会自己跟上」（接管行 `/hourness-init` 不在 main，带按钮的分支随接管项目补），下面「重新读取」与「上手说明 ›」——上手说明手动打开时不需要图。建图入口属于特性 `bootstrap`。
- 命令：新行 `glm-hourness/graph-panel`（`src/graph/panel-row.ts`）注册 `/graph-run <start|stop|redo> <节点 id>`，以 `human` 身份动作（只有人能发斜杠命令，模型发不出）。面板本身只看不写（plain-ui，`d-ui-look-not-operate`）：面板早期的写命令 `/graph-apply` 随面板的写入一起删去，`human` 身份从此只来自人自己打的命令。`refusalForHuman`（`labels.ts`）只服务 `/graph-run` 的拒绝：一句人能照着做的中文，带引擎的错误码〔2026-10-29，`m8-ui-audit` F-06〕。`/graph-run` 在 `/` 菜单里的说明是中文（「开始、暂停或重做一个任务（人用）」），带输入提示 `start|stop|redo <节点 id>`〔F-20〕。这一行是 DSH 命令的流节点，人能在对话里看到自己打过什么；它不进模型请求（`dsh-commands/README.md` Model Experience）。行不注册任何工具，经 L3 探针（场景 `glm-graph-panel`、`glm-graph-run`）后默认启用。`/graph-run` 会给主 Agent 发消息（见下「运行控制」）。
- 主 Agent 的位置〔2026-11-04，plain-ui 1.3 §4.9〕：这一行还注册会话投影 `hournessProject`。`init(会话头)` 经图行服务的 `dirFor(会话工作目录)` 取图目录，再由一处薄包装 `holderPathOf` 算出主 Agent 持有者记录的绝对路径（转调 `main-agent-holder.ts` 的 `holderFileOf`；持有者记录搬进项目 `.llm/` 时只改这一个函数），值是 `{holderFile}`，没有图目录或投影没到位时是 `{holderFile: null, reason}`。客户端拿它经 `remote.workspaceFiles.readBytes` 读记录，读不出时退到会话清单里找主 Agent 模式且同工作目录（规整同 M3 的 `projectKey`）的会话：恰好一个算数，行旁小字「按会话状态认的」。三种结果（在这个对话里回话 / 去主 Agent 的对话回话 › / 还没有主 Agent：在输入框打 /wish）加退路都由 `ui/src/graph/MainChat.tsx` 的 `useMainAgent` 给出，面板算一次、各视图读上下文；「现在」一句的主语（`mainHere`）与「需要你」读哪份 `graphLive.awaiting`（主 Agent 会话的，还没有值时 `refreshProjections` 一次）同出这一个结果。跳转按钮调客户端服务 `uiWorkspace.openSession`（第三方客户端包注入它属〔推断〕，L4 核对）；记录挂载时、面板可见时、可见期间每 30 秒读一次，读失败的原因进控制台一次。
- 上手（plain-ui 1.3 §6，2026-11-04）：面板第一次打开时显示上手页而不是首页（`Guide.tsx` 六块固定文字；第 4、5 块只在规则板、循环板登记时出现，此刻登记表里只有经验板；高峰几句与「额度用完时推进会停住」只在规则板的 `peakApplies` 为真时出现），「去首页」（跳过也是点它）写下本机记录 `glm-hourness.onboarding.hourness.v1` 后不再自动出现；图上已有 `actor: 'human'` 历史的（老用户）也不自动出现，带原话的 `llm` 历史不算（`ui/src/guide/state.ts` 的 `firstVisit`，与开场卡片「第一次用？」一行同一条规则）。重开：首页页脚「上手说明 ›」；没有图的一节也有它。开场卡片：M3 的愿望卡底部多一行「第一次用？看看项目图怎么用 ›」（`FirstVisitLine`，点它 `sidebarRight.openTab` 开面板页签；开场画面多半没有挂着的会话界面，抛错就换成一句不可点的灰字，控制台 info 一次原因）；没有图的工作区另有 `hourness-nograph` 卡（`NoGraphCard.tsx`，order 41，紧跟 M3 的 40，两张不同时出现）：空白会话、工作区没有图、本机没有这个工作区的记录三者都成立才显示，连续出现 5 秒记下记录（键按会话工作目录规整），只出现一次。
- 版面〔2026-11-04 按 plain-ui 1.3 重写（`d-panel-released`），原先的四个视图页签整条取代，旧文本在 git 历史里；面板只看不写（`d-ui-look-not-operate`）〕：一页首页，没有页签，从上到下五段（`ui/src/graph/Home.tsx`）。效果是：各未关闭目标一行，进度写成「工作完成 18/21」——只数直属子节点里的任务与特性，丢弃与被取代的不算，已拍板的待决另写「待决已定 7/7」；两层循环的模块概况在场时是目标下的一行，点开「框架与模块」页。需要你 · N：图上等人的待决与提议，先提的在前，加上对话里等回话的事（`graphLive` 的 `awaiting`，读主 Agent 会话的那份，见下「实时现场」与「主 Agent 的位置」），头三件、第一件整卡展开；每张卡带一行去哪回话（`MainChatLine`，三种结果见下「主 Agent 的位置」）——面板里没有拍板、批准、否决或改选的控件（面板的写入与 `/graph-apply` 一起删去），人的动作要么在对话里说，要么自己打 `/graph-run`。现在：现场的一句话（`liveLine`，主语按主 Agent 是不是这个对话取词，`mainHere`），登记的板块各交一行 homeLine（板块页见下）。怎么做 · 接下来：进行、可开工、在等的前三件，点开「怎么做」页。上次看之后：这个时刻以来图上的变化前五条，模板由 `plain-view.ts` 从历史写（改状态、批准与否决及连同的 N 件、节点与目标完成、五分钟内的连续动作并成一条；给人回话的条目不算）；没有记录时标题写「最近一天」，窗口取 24 小时。每段至多三到五条，其余收在「讲细点」后。头部以「 · 」连接全部未关闭的目标（本项目的图有 `glm-house` 与 `hourness` 两个根目标〔2026-10-29，`split` 第 8 步〕），悬停时每行一个。「上次看之后」的窗口由 `seen.ts` 记：面板正文露出算到达（打开面板，或 hidden 超过 10 分钟后再露出），露出至少 5 秒后隐藏或卸载算离开；到达读浏览器本地存储里的上次离开时刻，离开写回，键是图 `nodes` 目录的绝对路径，存储读不了就安静退回 24 小时窗口。第二层是一个盖在首页上的框（`NodeDetail.tsx` 的 `Frame`）：顶部「返回」，Esc 关闭，打开时底下不接焦点，关闭后焦点回到打开它的元素〔`m8-ui-audit` F-01、F-26〕。框里开的页面：需要你全部（每件的问题都展开）、怎么做（多目标时按目标分节，节点按图序编号，在等的一行写等第几件或等哪个节点）、现场（见下「实时现场」）、上次看之后全部（顶部一行进「agent 自己定的事」）、agent 自己定的事（`Decisions.tsx`：agent 正要定的待决与最近的拍板，每条标明是 agent 自己定的、你（经对话）说的还是你拍的；展开只读——理由、转述原话与选项都在，要推翻在对话里说）、框架与模块（方向清单在图上时才出现）、整张图与节点详情；登记的板块页同在这个框里，每块板自己的错误边界，板块出错只倒这一块。节点详情从任何列表、卡片标题或图上的节点点开：祖先路径、类型与状态、正文、待决的选项（只读）加去哪回话的一行、提议的「要批准或不要」加同一行、任务的「运行」一节（谁在这里做，加一行「要停或重做：跟主 Agent 说，或在输入框打 /graph-run stop <id>、/graph-run redo <id>」——没有按钮，见下「运行控制」）、怎样算完成、不做什么、下面的节点、证据、最近的历史；id 放在最后，供人跟 agent 说起它时用；祖先路径里目标写作「目标」（标题在头部）。从详情里再打开的节点叠成一摞，「返回」退一层，退到底回到上一页。「整张图」（`GraphCanvas.tsx`，页脚与首页可达）用引擎的布局（`layout.ts`）画成 React SVG，节点保持身份，重读后移到新位置而不是跳；颜色用主题 token，深浅色主题都跟着变；第二行写节点在等什么，不写 id；筛选只有一个下拉（没做完的、全部、只看等你的），被筛掉的已完成子节点在父节点角上计数；拖动或滚轮平移，Ctrl 加滚轮或按钮缩放，「全貌」看整张图，「回到重点」以可读的缩放对准第一个等你的节点，没有时对准主 Agent 的焦点，再没有时对准第一个进行中的任务；进行中的节点上站着在跑的 agent 时才有呼吸光圈，动效只表示真有活在干〔`m8-ui-audit` V-04〕。正文按 Markdown 排版，详情里超过十行、卡片上超过四行时折叠在「展开」后，按实际渲染高度判断〔`m8-detail-layout`〕；正文以下每一节上方一条分隔线。历史每条写时间、谁、做了什么：编辑写明改了哪些字段，改状态写新状态，验证写新的验证状态，加删连线写种类与目标，取代写另一个节点〔`m8-ui-audit` F-15〕；经对话转述的写「你（经对话）」，原话在下面引用，保留换行；理由开头的「用户：」与这个标签重复，显示时去掉，节点文件里的历史不改；超过三行的条目同样折叠。页脚：登记的板块各一格，然后「上手说明 ›」「整张图 ›」。
- 打包：`scripts/build-ui.mjs` 按目录表 `scripts/packages.mjs` 给两个包各打一份客户端产物：面板的入口 `ui/src/hourness-client.tsx` 打成 `packages/hourness/ui/client.js`，GLM 通道 pill 与设置页的入口 `ui/src/glm-client.js`（`ui/src/channel.js`）打成 `packages/glm/ui/client.js`（构建产物，不入库），CommonJS 外包 `window.__ModuleLoader__.load`，id 是各自的包名，与 rc.3 官方客户端包同形；模块表里的包（React、`react/jsx-runtime`、ui-primitives 等，`scripts/ui-modules.mjs`）保留为 `require`，其余打进包里。preflight 检查每个包恰好有一行以它的精确包名命名、客户端半已构建、外包的 id 是包名、通过 `node --check`、不 `require` 模块表以外的东西。面板的客户端产物不带 GLM 的文件，只装编排层包时面板照常。动画只用 CSS（`prefers-reduced-motion` 下关闭），不加动画库。
- 验证：L2 有命令行（`tests/graph-panel.spec.ts`）与面板数据层（`tests/graph-panel-model.spec.ts`：修订号一致、筛选、进度口径、文案、假 Remote 上的读取与变更跟进）；L3 探针在真运行时上经真实处理函数批注与拍板（76/76）。〔2026-11-04，plain-ui：`tests/graph-panel.spec.ts` 只对运行行；`tests/graph-panel-model.spec.ts` 加只读断言（`ui/src/graph` 下无 `commands.execute`、无 apply 导入）与 seen 机的到达/离开/离席规则及记录读写失败安静；探针场景 `glm-graph-panel` 不再走任何命令；新版面在桌面版的 L4 核对待做。〕L4（2026-10-28，桌面版重启后经 Chrome DevTools 协议驱动）：「开始」页出现入口；四个视图读到本项目的 75 个节点；在详情里批注一条，命令返回「已批注「1.11 L4 真机验收」」，节点文件的历史多了一条 `human` 的批注，面板经变更流在 4 秒内显示；随后用 git 还原这个文件，面板同样跟着变回。页面里有 `isSecureContext` 与 `crypto.subtle`。没做自动化的界面测试（§15）。

实时现场〔已实现 2026-10-28，`m2-8`；在节点上的落点等图工具启用后核对，见下〕：

- 数据：graph-panel 行经 `ctx.inject(['sessionProjections'])` 注册会话投影 `graphLive`（`src/graph/live.ts`，`stateVersion` 2），从会话自己已提交的事件折叠出这个 agent 的现场：`graph_focus` 成功设定的焦点节点、请求头里的模型、本轮开始时间与步数、正在跑的工具调用、最近 6 次工具结果（成败）。`DeferredToolCall` 显示它代跑的工具名。fork 继承的前缀事件跳过。子 agent 名单、token 用量直接读 DSH 自己的投影 `subagentCatalog`、`tokenUsage`，不重复折叠。不写盘：投影是会话日志的视图，检查点进 DSH 自己的投影缓存。取代原计划的节流写 `.llm/graph-live.json`〔agent 定，2026-10-28〕：投影是 DSH 原生路径，第三方行能注册，宿主把每个活会话的投影变化经控制流推给客户端，不需要文件与订阅。
- 到达客户端：客户端 `sessions` 服务的会话列表快照（`projectionsBySession`）跟着宿主的控制流走，宿主每个活会话的投影变化都推过来（`dsh-api-session-controller` 的 `SessionControlController`），所以主会话和子会话都不用 `retain`。还没有投影值的会话（冷会话）调一次 `refreshProjections`；冷会话只带投影缓存里已有的单元，这次启动之前跑完的子 agent 没有 `graphLive`，面板把它们收成一行「还有 N 个子 agent 是这次启动之前跑的」，点开再列；有 agent 在跑时它们并进「另有 N 个子 agent 已停下」那一行。
- 呈现〔2026-10-28 按 `m8-doing-layout` 改，原先在跑与停下的 agent 一样显眼〕：首页「现在」段给一句话概览（`liveLine`：谁在跑、在做什么；停着的收在半句里），「现场」页（`Live.tsx`）才是一节「现场 · N 个在跑」。在跑的 agent 排在前面，每个一行：名字（主 Agent 或子 agent 的标签）、模型、token 用量；现在在做什么（「在跑 Bash · 3 秒」「在想 · 第 2 步 · 40 秒」）；焦点节点「在「…」」（点开详情），没有焦点时写「还没落到图上的节点」；最近几次工具调用，出错的标红；圆点呼吸。空闲的主 Agent 与停下的子 agent 各占安静的一行：名字、「空闲，等你说话」或「已停下」、最近一次工具结果的时间（「3 小时前调过工具」）、焦点、token 用量；焦点节点还开着写「停在「…」」，已经完成、丢弃或被取代写「上次在「…」」；停下的子 agent 打勾。安静的行只用次级颜色区分，不调透明度，浅色主题下文字对比度照常〔`m8-ui-audit` F-09〕。有 agent 在跑时停下的子 agent 收进一行「另有 N 个子 agent 已停下」，点开再列；空闲的主 Agent 不收：后台派发时这是常态，它正等着人〔`m8-ui-audit` F-10〕。token 用量写法同 DSH 输入框下的统计（「282K tok」）；相对时间跟着面板的钟走，有 agent 在跑时每秒、否则每分钟刷新，悬停显示具体到分钟的本地时间〔`m8-ui-audit` F-11、F-32〕。没有 agent 在跑时，现场先写一句「这个会话里没有 agent 在跑。进行中的 N 个任务可能在别的会话或 DSH 之外推进。」（N 只数任务，进行中的特性只是装着工作；活例如在 Kiro 里派出的 worker 那里），下面一行小字「现场只看得见本会话的主 Agent 和它派出的子 agent。」；看不见的活面板不编造〔`m8-ui-audit` F-31〕。「整张图」页里每个 agent 是焦点节点上沿的一枚徽标，在跑时外圈呼吸；子 agent 没有焦点时站在主 Agent 的焦点上；在跑的 agent 没有落点、或落点被筛选隐藏时，列在画布上方的一行；空闲的 agent 不列（现场里有）。这一行与图例都在可平移的画布之外，不遮节点；图例含提议（虚线框）与风险（红色虚线框）；筛选下没有节点时画布中间写「没有等你的事」或「这个筛选下没有节点」；父节点角上的计数悬停写「N 个已关闭的子节点被筛掉了」。人没有拖动或缩放过时，画布尺寸或筛选一变，视图就重新对准重点（点过「全貌」则保持全貌）；拖动、滚轮或缩放按钮之后保持人的视图，直到再点「回到重点」或「全貌」〔`m8-ui-audit` F-16、F-17、F-30、V-05〕。决策紫色只用于描边与填充，标签文字混入正文色，两种主题下对比度不低于 4.5:1〔F-23〕。「回到重点」先对准等你的节点，其次对准主 Agent 的焦点。
- 验证：L2 `tests/graph-live.spec.ts`（8 例：一轮里的步数与在跑工具、焦点只在成功时移动、并行调用与最近 6 次、`DeferredToolCall` 的显示名、模型、无关事件与继承事件不改状态、schema、行在注册表到达时注册与缺席时降级）。L3 探针（78/78）：面板场景读到 `glm-5.3`、本轮 2 步、`Read` 成功、没有在跑的工具；派发场景父会话的 `subagentCatalog` 有这个子 agent，子会话读到 `glm-5.3-flash`、`Bash` 成功、越界 `Write` 失败、域内 `Write` 成功与 token 用量。L4（2026-10-28，桌面版重启后经 Chrome DevTools 协议驱动，GLM-5.3-Flash 新会话，只读任务：派一个子 agent 读 `package.json`，自己读 README、跑 `Get-Date`）：现场一节出现主 Agent 与子 agent，模型、步数、用时、最近工具（`subagent`、`Read`、`Bash`、`LocalToolSearch`）与 token 随回合变化，子 agent 停下后打勾；第二轮里界面依次显示「在跑 Bash」「在跑 Read」，工具结果的宿主事件时间到界面变化 7–35 毫秒。模型流式输出时现场显示「在想」，工具调用在这一步的助手消息提交时才进会话日志，所以「在跑」从工具开始执行算起。未核对：徽标落在焦点节点上，需要 `graph_focus`，图工具行还没启用（`m2-11`）。

运行控制〔已实现 2026-10-28，`m2-9`，L2；L3 场景 `glm-graph-run` 已写好未跑，L4 待做；调研见 `.agents/tasks/m2-9-research/report.md`〕：

- 命令：graph-panel 行注册 `/graph-run <start|stop|redo> <节点 id>`（`src/graph/run-control.ts`），人在输入框里打。plain-ui 起面板没有运行按钮：节点详情的「运行」一节只写两行——谁在这个节点上做（「在做」「做完了」「还没开始」，有在跑的 agent 时列出名字），加一行「要停或重做：跟主 Agent 说，或在输入框打 /graph-run stop <id>、/graph-run redo <id>」〔2026-11-04，plain-ui〕。`recordInput` 保持默认：输入只有几个词，`command/run` 原样记下。命令接不接受的门槛（`src/graph/run.ts` 的 `nodeRefusal`，面板与命令共用）：只用于任务节点；start 要任务在提议之后、未完成（完成时指去 redo），丢弃与被取代的不收；redo 收完成的任务，也收验收条件在上次「开始」「重做」之后改过的进行中任务（2026-10-29 之前叫「改了验收条件后重做」，没改过条件的完成任务上命令也接受，`m8-ui-audit` F-19；找上次开始或重做的历史时两种写法都认）；stop 不查节点状态，只查节点上有没有在跑的 agent——宿主当场从活投影算（站位规则与现场相同，`live.ts` 的 `placeOf`：自己的焦点，子 agent 没有焦点时用主 Agent 的；面板的行可能旧一拍），没有时拒绝。面板没有验收条件编辑器，改条件经对话（LLM 带人的原话 `graph_edit`）或命令行。
- 主 Agent 收到什么：都用 `createUserNotice` 构造，来源 `glm-graph-run`，`source.graphRun` 带 `{action, node, commandId, stopped?}`。开始：`agent.followup` 一条「人在面板上点了「从这里开始做」」，要它先 `graph_focus` 这个节点（投影随之而来，现场徽标随之落到节点上），已批准的任务开工时标 doing；空闲时开新回合，忙时排在当前回合之后，不插进去。暂停：在宿主侧当场重算谁在这个节点上（`sessionProjections.snapshot` 读主会话的 `graphLive` 与 `subagentCatalog`，子 agent 经 `agents.get` 取活 agent 与它的 `graphLive`，只算正在跑的）；主 Agent 在上面就先 `cancel({kind: 'user'}, {keepInbox: true})`，再 `inject` 一条「人暂停了这个节点，不要接着做，也不要重新派发」，然后对每个站在上面的直接子 agent 调 `subagents.interrupt(id, {kind: 'user', parentSessionId})`。说明在中断之前送进去：子 agent 停下后 DSH 会给主 Agent 送结算通知并唤醒它，读到通知的那一步同时读到这条说明。重做：完成的任务先由人改回进行中，停下站在上面的 agent，最后 `followup` 一条带验收条件前后对比的重做消息；先停后发，消息在被停的回合结束后立即开新回合。
- 留痕：每次执行留下三处记录：对话里的命令流节点（`command/run` 的参数与 `command/done` 的结果行，例「已暂停「…」：停下了主 Agent」）；节点历史里一条 `human` 的批注「人在面板里点了「…」」（沿用历史前缀——词是「点了」，实际来自人打的命令，重做靠它找上次开始，换词会断旧图的对账；暂停写明停下了谁；重做一个完成的任务时这句话是改状态的理由）；主 Agent 收到的消息及其 `graphRun` 事实。被拒绝时（未知节点、不是任务、节点上没有在跑的 agent、缺 `sessionProjections`，或主会话有子 agent 而缺 `agents`、`subagents`）只返回一行原因，图与 agent 都不动：节点历史先于任何动作写入，写失败就不动。
- 服务：`sessionProjections`、`agents`、`subagents` 都经 `ctx.inject` 可选取得，激活不抛错；行健康是激活状态，缺哪个写哪个，例「停子 agent 等 agents、subagents 服务」。
- 验证：L2 `tests/graph-run.spec.ts`（开始送 followup 且历史有人的批注；暂停主 Agent 先 cancel 后 inject；暂停子 agent 先给主 Agent inject 再中断子 agent；重做先 cancel 后 followup 并改回进行中；面板的重做规则；各种拒绝不改图、不碰 agent），行健康在 `tests/graph-row.spec.ts`。L3 场景 `glm-graph-run`（未跑）：忙时开始的结果行与历史、开始消息开出下一回合并要求 `graph_focus`、现场焦点落到节点上、暂停取消正在跑的回合之后会话不再发请求、`/glm-status` 里 graph-panel 能停子 agent。要 L4 的：桌面版上对话里的呈现（「收到执行请求」卡片、命令流节点、被停回合的「已停止」）、GLM 是否照开始消息设焦点并开工、暂停子 agent 后 GLM 是否照说明不重新派发、桌面版组合里第三方宿主行能否取到 `agents` 与 `subagents`、面板按钮随现场出现与消失。

LLM 经命令行或 DSH 图工具能做的：读投影、列待办、提议节点、带证据改状态、加连线、批注、拍自己的待决，以及带人的原话替人批准、否决、拍板（§2.9.1）。两边的写入都经过同一个 `apply`，规则一致；人在面板里批准、拍板的结果，LLM 下一次读投影就能看到。

命令行契约〔已实现，`src/graph/cli.ts`，入口 `scripts/graph/cli.ts`〕，DSH 图工具照此暴露（见下）：

```
npm run -s graph -- [--dir 图目录] show <id>
npm run -s graph -- [--dir 图目录] open
npm run -s graph -- [--dir 图目录] <op> [<JSON> | --file <文件>]
```

| 命令 | 引擎调用 | 成功时 stdout |
| --- | --- | --- |
| `show <id>` | `projection(id)` | `{ok: true, projection}` |
| `open` | `openItems()` | `{ok: true, items}`，`items.questions` 是决策队列 |
| `<op>` | `apply('llm', {...请求, op})` | `apply` 的返回值 `{ok: true, id, rev, revision, node, changed}` |

- `<op>` 是 §2.9 的操作名，请求是该操作除 `op` 以外的字段（例 `status` 的 `{"id", "rev", "to", "reason", "evidence"}`）。请求来源三选一：命令行上的一个 JSON 参数；`--file` 指定的 UTF-8 文件；两者都不给（或参数为 `-`）时读 stdin。开头的 BOM 忽略。请求里可以带 `op`，必须与命令相同。
- 每个操作都照样转给引擎，权限全由引擎按 §2.9 判断：`approve`、`reject`、`supersede` 不带转述时拿到 `forbidden` 与正路，`decide` 只对决定者为 `agent` 的待决成功；请求里带 `relay` 时按人的权限执行（§2.9.1）。命令行不另写一份规则。actor 不从请求读：请求里带 `actor` 字段时引擎按多余字段拒绝（`invalid`）。
- stdout 永远是一个 JSON 文档（两空格缩进，换行结尾）。失败也一样，是 `{ok: false, error: {code, message, field?, hint}}`。退出码：0 成功；1 引擎拒绝（错误码见 §2.9）；2 命令行或输入本身有问题（未知命令、参数个数不对、未知选项、JSON 语法错、请求不是对象、`--file` 读不到），错误码为 `invalid`，`hint` 是用法。
- `npm run` 不带 `-s` 时 npm 会先往 stdout 打两行命令回显，读 JSON 的一方要用 `-s`，或直接运行 `node --experimental-strip-types --no-warnings scripts/graph/cli.ts`。
- Windows PowerShell 5.1 下另有三个坑（2026-10-28 本机实测）：往 `npm` 管道送 stdin 时 `--` 被 npm 的 PowerShell 外壳吞掉，`--dir` 被 npm 当成自己的选项；管道文本按 `$OutputEncoding`（默认 ASCII）编码，中文到引擎时已是问号；命令行参数里 JSON 的双引号被剥掉，引擎收到的不是合法 JSON。在这个环境下用 `--file`，文件存为 UTF-8。

DSH 图工具〔已实现，`src/graph/tools.ts`，行入口 `src/graph/index.ts`；2026-10-28 经 L3 探针与 L4 桌面版验收后默认启用；`ROADMAP.md` 2.2、2.11〕：命令行的每个命令注册为一个工具，身份固定为 `llm`；另有设定每步投影焦点的 `graph_focus`（§2.5）。

| 工具 | 参数 | 引擎调用 | 成功时的值 |
| --- | --- | --- | --- |
| `graph_show` | `{id}` | `projection(id)` | `{ok: true, projection, invalid?}` |
| `graph_open` | 无 | `openItems()`，`items.questions` 是决策队列 | `{ok: true, items, invalid?}` |
| `graph_focus` | `{id}` | `load()`，确认节点存在，记下本会话的焦点（§2.5） | `{ok: true, focus: {id, type, title, status}, invalid?}` |
| `graph_propose`、`graph_status`、`graph_edit`、`graph_link`、`graph_unlink`、`graph_comment`、`graph_verify`、`graph_decide`、`graph_approve`、`graph_reject` | 该操作除 `op` 以外的字段，同命令行；除 `graph_comment` 外都有可选的 `relay` | `apply('llm', {...参数, op})` | `{ok: true, id, rev, revision, node, changed}` |

- 〔2026-10-28 起，§2.9.1〕`graph_decide` 拍决定者为 `agent` 的待决，或带人的原话拍人的待决；`graph_approve`、`graph_reject` 的 schema 把 `relay` 列为必填，不带转述时引擎照样拒绝（rc.3 不校验工具参数）。`supersede` 不做成工具：带 `supersedes` 连线的提议做同一件事，带转述时立即生效。`relay` 的参数说明要求逐字引用、不许改写或编造。此前只认人的四个操作都不做成工具，人只能在查看器里点，这正是负担的来源。
- `graph_focus` 是命令行没有的工具：焦点属于会话，不属于图，所以它不写节点文件，图修订号不变（§2.5）。节点不存在时报 `not_found`；调用方没有会话时报 `invalid`。
- 引擎拒绝时工具报错（rc.3 的结果带 `isError`）：错误文本是 `Error: ` 加引擎结构化错误 `{code, message, field?, hint}` 的 JSON，与命令行输出里的 `error` 相同，模型照 `hint` 走正路。参数里带 `actor` 按多余字段拒绝；带 `op` 且与工具不符时拒绝（`invalid`，`field` 为 `op`）；读工具不认识的参数同样按 `invalid` 拒绝。
- 写结果里的 `node` 不带 `history`：刚写的那条历史模型自己知道，要看历史就读投影（最近 5 条）。这是与命令行输出唯一的不同，为的是不让每次写入都把整段历史塞回上下文。
- 图有校验错误时，读工具照常返回，另带 `invalid`（错误数、前 5 条、提示「写入一律被拒，告诉人」）；写工具拿到 `graph_invalid`。
- 图目录：行配置 `dir`，绝对路径照用；相对路径（默认 `docs/graph`）按调用方 agent 的会话工作目录（`session.header.cwd`）解析，每次调用重新解析，所以一个行配置适用于任何工作区。目录不存在时报 `not_found`，提示「空目录就是空图」，工具不替模型建目录，免得在不用项目图的工作区里凭空长出 `docs/graph`；会话没有工作目录而 `dir` 是相对路径时同样报 `not_found`，提示在行配置里写绝对路径。
- 激活期不抛错（`DESIGN.md` §7）：`dir` 不是非空字符串时告警、不注册任何工具；绝对路径的目录还不存在时告警，工具照常注册，每次调用报告；注册失败（重名、输出 schema 被宿主拒收）时撤掉已注册的工具并告警。
- schema：参数与输出 schema 都在 rc.3 `tools.register` 校验的子集内（`dsh-tools` 的 `assertSupportedJsonSchema`：`type`、`properties`、`required`、布尔 `additionalProperties`、`items`、`enum`、`const` 与注解），子集外的输出 schema 会让注册抛错。rc.3 不校验原样注册的工具参数，参数由引擎的请求解析逐字段校验；rc.3 按输出 schema 校验工具返回值，不符时变成错误结果。
- 谁拿到工具：行在全局注册，所有 agent、所有路由都有这组工具，GLM 与非 GLM、主 Agent 与子 agent 都一样。理由：图是项目状态，不是方言；guard 拦直接改图文件（§2.7、§6.4）对哪条路由都生效，被拦的一方必须手边就有正路。GLM 请求里它们常驻，不进延迟目录（`src/toolsearch/exposure.ts`，主 Agent 每拍都用，§2.8）；非 GLM 请求里是普通工具。子 agent 该不该写图、能写什么，等派发（M7）知道谁是主 Agent 时再定，在那之前子 agent 写图也只有 `llm` 的权限。
- 每个操作一个工具，不合成一个带 `op` 字段的写工具：每个工具的参数 schema 只列本操作的字段与必填项，模型不用记哪个操作要哪些字段，枚举值（例 `status` 的 `to`）直接写在 schema 里。代价是 GLM 请求多 13 个常驻工具的 schema（含 `graph_focus`）；它们每步不变，落在可命中提示词缓存的前缀里（推断，未实测命中率）。
- 验证：`tests/graph-tools.spec.ts` 在假宿主 `tests/fake-rc3.ts` 上（L2）覆盖注册与 schema 子集、每个工具（含 `graph_focus` 不改图）、拒绝路径（无证据、过期修订号、无权、多余字段、坏图、缺目录、没有工作目录）、激活期降级、GLM 工具面常驻与行默认禁用。假宿主为此补了 rc.3 的三处行为：`tools.register` 拒收子集外的输出 schema（tools:323、2978），`tools.execute` 把调用方 agent 交给工具体（tools:3227–3260、3406）并按输出 schema 校验返回值（tools:3637–3640）；会话头可带 `cwd`（session:1820–1826）。图文件门禁（§2.7）由 `tests/graph-guard.spec.ts` 覆盖：各种写法的路径、`str_replace_editor`、shell 写法、图目录以外放行、图工具照常写、与 guard 行同时启用时的先后、子调用放行、没有工作目录、行卸载后规则撤掉；为此假宿主的 `tools.execute` 先走 `tools/pre-execute` 瀑布，拒绝时返回 `Error: ` 加理由的错误结果、不执行工具体（tools:3320–3321、3337–3353）。L3（2026-10-28，`npm run probe` 89/89，场景 `glm-graph`、`non-glm-graph`、`glm-graph-compact`、`glm-graph-goal`，图目录是本仓库图在临时 git 仓库里的副本，路径写字面量）：激活无告警，rc.3 收下 13 个工具，GLM 工具面里常驻不延迟，非 GLM 也有；`graph_show` 返回投影，`graph_status` 不带证据标完成拿到 `evidence_required`，`graph_comment` 在副本里留下 `llm` 的历史，仓库的 `docs/graph` 修订号不变；`graph_focus` 之后的下一次请求以投影结尾（`focus`），没变化的步不再注入，改了焦点节点标题后再注入一次（`changed`）；压缩检查点之后的请求带投影（`compaction`），目标轮也带（`goal-round`）；`Write` 与 `Bash` 写副本的节点文件被 `graph-files-only` 拦下并记进违规流水，写别处照常；影子兜底在场且没有把图工具写的节点文件记成影子；`glm:guard` 一节列出 `graph-files-only`；`/glm-status` 的 `graph` 行报出图、节点数与焦点。L4（同日，图行在 bundle 里启用后重启桌面版，GLM-5.3-Flash 会话，只读任务）：`graph_focus m2-9`、`graph_show m2-9` 成功；面板「图」视图里「主 Agent」徽标落在 m2-9 上沿，跑 `Bash` 时外圈呼吸；`/glm-status` 的 `graph` 行「生效，图 …\docs\graph，77 个节点；焦点 m2-9」，`graph-panel` 行「生效」；桌面版日志没有本包的新错误。

### 2.11 实时同步与并发〔已实现，2026-10-28 用户批准原型〕

- 面板经 `remote.workspaceFiles` 对 `nodes/` 目录的变更流跟进（§2.10「DSH 原生面板」）：引擎、命令行、手改文件、git 操作的改动不用刷新就出现。原型的本机服务用 `fs.watch` 加 SSE 做同一件事，随查看器删除。
- 同一进程内的写入按图目录排队串行执行，同一进程里对同一目录开的多个引擎实例共用一条队列。每次写入先重读整张图、比对修订号，再写临时文件、改名替换，读的一方看不到写了一半的文件。
- 跨进程（宿主进程里图工具与命令行同时写同一个节点）靠修订号检查，后写的一方拿到 `stale_revision`。比对与改名之间仍有毫秒级的窗口；单用户接受这个窗口，不加锁文件，因为进程崩溃后锁文件会残留在图目录里，要另做清理。

### 2.12 布局与渲染〔已实现，2026-10-28 用户批准原型〕

布局在 `src/graph/layout.ts`，绘制在 `src/graph/render.ts`。布局只输出坐标与折好的标题行，绘制只认坐标。

视图有三种：整张图；子树（`root`，一个节点及其全部后代）；投影（`focus`，节点本身、它到目标的祖先链、它的子节点，以及经依赖、来源、取代连线与它相连的节点连同这些节点的祖先链；焦点节点外加蓝色描边）。三种视图都可以另外指定折叠的节点。

自建分层布局，从左到右：

1. 分层：沿分解树，目标在最左，每一层深度一列。同一列的框等宽，宽度取该列最宽的节点。
2. 层内顺序：按树的先序排列，每棵子树占一段连续的纵向区间，分解连线因此不交叉。兄弟节点的初始顺序是创建顺序（首条历史的时间，同一时刻按 id）；没有父节点的根，目标在前，其余按创建顺序。
3. 减少交叉：兄弟节点之间调换先后不破坏第 2 条，于是按重心给兄弟排序。一棵子树只含某条依赖、来源或取代连线的一端时，被拉向另一端的位置；排序键是自身中心与这些拉力的平均值，两个互相拉的兄弟因此打平，不会对调。至多扫 4 遍，每遍重排后重算位置并数交叉（每条连线按两端点之间的直线段算，两条都是分解连线的不算），保留交叉最少的顺序，所以重排不会比创建顺序更差。
4. 纵向位置：叶子依次堆叠（叶子之间 10 px，带子树的兄弟之间 22 px，多个根之间 40 px），父节点放在子节点区间的中点；节点比子节点区间高时，子节点区间在节点高度内居中。节点高度随标题折行变化。
5. 依赖、来源、取代连线在节点定位之后画，不移动任何一层：两端接在框侧 70% 高度处（分解连线接在 50% 处），跨列的画 S 形曲线，同一列的两端都从右侧向外绕。
6. 折叠：折叠的节点不画子树，在框右边显示被藏节点数的角标 `+N`；连到被藏节点的连线改连到折叠节点，重复的合并为一条。`graph.svg` 默认全部展开；面板的筛选不用折叠，而是隐藏已关闭的子节点并在父节点角上计数（§2.10）。
7. 折行按字宽估算：中日韩字与全角符号 1 em，`M`、`W`、`m`、`w`、`@` 0.9 em，其余大写字母 0.7 em，其余半角字 0.6 em。不依赖字体度量，同样的输入得到逐字节相同的输出。标题最宽 168 px（目标 200 px）；连续的 ASCII 字符不拆开，比一整行还长时才按字拆；句末标点不放到行首，开括号不留在行尾。
8. 图有校验错误时照样布局：父节点不存在的节点成为根，父链成环的在最小 id 处断开，目标不存在的连线不画。

样式按 2026-10-28 用户认可的草图，形状表示类型，颜色表示状态：

- 状态：完成为绿色，进行中为琥珀色，已批准未开始为灰色，等人为红色（决定者为人、未拍板的待决，以及直接依赖这种待决的未关闭节点）；提议为白底虚线边框；废弃与被取代半透明。决定者为 agent 的未拍板待决按状态着色、填浅紫，第二行写「待 agent 定」，不算等人（§2.9.1）：红色只留给真正要人做的事。
- 类型：目标是大号圆角粗框；决策与待决是紫色边的六边形，等人时填红色，提议时白底虚线，其余填浅紫；风险是红色虚线框，底色按状态。
- 框内两行：标题，以及灰色小字的 id。决策在 id 后带验证状态（例「decision-1 · 未验证」），待决带「待拍板」或「选 A」。人对 LLM 说话时可以直接念 id。
- 连线：分解为灰色实线；依赖为带箭头的虚线；来源为带箭头的点线；取代为带箭头的紫色实线。箭头一律指向后来的一方：从前置指向依赖它的节点，从来源指向因它而有的节点，从旧节点指向取代它的新节点。
- 图内带图例。图例首行写视图、图修订号、节点数（含折叠的）与校验错误数，人与 LLM 可以核对看的是不是同一版图。整张图白底，深色主题的宿主里也看得清。

SVG 只用表现属性，不含脚本、样式表、网络字体与外部引用，任何能显示 SVG 的地方效果相同。每个节点组带 `data-id`、`data-type`、`data-status`、`data-tone`（折叠的另带 `data-hidden`，角标是其中带 `data-badge` 的子组），每条连线带 `data-edge`（`parent`、`depends`、`source`、`supersedes`）、`data-node`（存这条连线的节点，分解连线是子节点）与 `data-to`；原型的查看器据此挂交互；面板直接用布局结果画 React SVG（§2.10），同样不另做布局。每个元素占一行，提交的 `graph.svg` 的 diff 可读。

命令：`npm run graph:render -- [--dir 图目录] [--out 文件] [--root id | --focus id] [--collapse id]…`，默认读 `docs/graph/`、写 `docs/graph/graph.svg`。图有校验错误时照常出图，错误列在 stderr；`root` 与 `focus` 同时给出返回 `invalid`，节点不存在返回 `not_found`，未知的折叠 id 忽略。

与现成方案的比较（体积为 unpkg 上的文件大小，2026-10-28 查询）：

| | Mermaid | Graphviz DOT | elkjs | 自建 |
| --- | --- | --- | --- | --- |
| 在哪能看到 | 宿主要带 Mermaid 渲染，Kiro 对话实测不渲染；浏览器端要加载 `mermaid.min.js`（12.2.0 版 5.5 MB） | 要本机装 Graphviz，或加载 WASM 版（`@viz-js/viz` 3.31.0 后端 1.2 MB）；产出的 SVG 哪里都能看 | 只做布局（`elk.bundled.js` 0.12.0 版 1.6 MB），SVG 要自己画 | 直接产出 SVG，哪里都能看 |
| 约 100 节点以上 | 默认上限 500 条边、5 万字符（配置项 `maxEdges`、`maxTextSize`）；布局交给内置引擎，不受我们控制 | `dot` 是成熟的分层布局实现，规模不是它的瓶颈（推断，本项目未实测） | 分层算法成熟（Sugiyama 一系），支持端口与复合节点 | 布局计算量与节点数成正比，外加几遍重心排序；分解连线不交叉，依赖连线密集时交叉比 `dot` 与 ELK 多 |
| 交互 | 点击回调有限；样式要借它的类定义语法 | 静态 SVG，交互自己写 | 交互自己写 | 布局结果直接给面板用，图片带 `data-id`、`data-edge`；样式完全按草图 |
| 依赖 | 新增依赖或 CDN | 新增依赖或系统程序 | 新增依赖（EPL-2.0 或 GPL-3.0） | 无，代价是几百行自有代码 |

推荐自建。本项目的图以分解树为主，依赖连线是少数；草图要的形状与样式需要完全控制；面板与图片要用同一份布局；本原型不加任何依赖。以后依赖连线多到交叉不可接受时，可以只把布局换成 elkjs，这属于新增依赖，走决策卡。

### 2.13 本项目的图〔2026-10-28 用户批准，合入 main 后是进度的唯一事实源〕

`docs/graph/` 存本项目自己的项目图，是 `ROADMAP.md` 2.5 的一次原型迁移，2026-10-28 写成，55 个节点：

- 目标取自 `CHARTER.md` §1–§4，验收条件是 §3 的五条目标；非目标取自 `CHARTER.md` §6、§9，`DESIGN.md` §1 与本文 §4.3。
- 目标下三支：M0 文档沉淀（完成）、底层、编排层。底层下是 M1（11 个条目、3 项顺带修复与 3 张待决）、用户定案的 3 个决策（带验证状态）、3 个风险与 2 张待决。M1 的状态与证据取自 main 在提交 `abec5e1` 时的 `ROADMAP.md` M1 进度、`HANDOFF.md` 与 git log：完成的条目带提交号，以及文档里记下的测试、检查结果（退出码与通过数照抄文档，没有在本分支重跑）。编排层下是 M2–M8，按 §2.7 新开分支属计划外，全部是提议，M2、M3 带各自的条目；编排层还挂着用户定案的 4 个决策（其中队友角色卡已被任务派发属性取代）与 1 个风险。
- `ROADMAP.md` §3 需要用户的事项各成一张待决，带选项、后果与推荐。M1.9 的检查器用户已在对话中选定，按拍板写入；`q-graph-design` 就是 2.1 要发的那张卡。

写法：经引擎 API 一次性写入，迁移脚本不进仓库（`AGENTS.md`）。用户已定案的内容记为 `human`：目标、三条一级分支、M1、用户定案的决策、用户已拍过的待决，理由以「迁移：」开头并写明出处。整理条目、标状态与证据、提风险与待决记为 `llm`，照 §2.9 的规则走：LLM 在已批准的 M1 下加任务直接为已批准，在编排层下开 M2–M8 只能是提议。历史时间是写入的真实时间，不是原事件发生的时间。此后的改动经命令行（`llm`）或查看器（`human`）；从 main 补进图的进展同样经引擎 API 一次性写入，身份按上面的分法。

补图（2026-10-28，main 在 `37b7eae`）：`m1-6` 按提交 `72c282e`、`37b7eae` 与 `ROADMAP.md` M1 进度记下的测试结果标为完成（`llm`）；`m1-images` 的正文写明用户提供的事实「GLM-5.3 没有视觉塔，只有 GLM-5.3-Flash 是多模态」（`human`）；`q-l4` 记下用户「重启验收明天再说」的批注（`human`）；`risk-rc3` 批注 1.6 已完成的缓解（`llm`）。用户 2026-10-28 的三条定案（`d-dispatch`、`d-async-cards`、`d-driver`）第一次迁移时已以 `human` 写入，不再改动；main 的 `ROADMAP.md` §3 与图上的待决一致，没有新增或关闭的事项。

补图（2026-10-28，main 在 `29211ed`）：`m1-4`、`m1-5`、`m1-8` 按各自的两个提交（`380c4c4`、`fa9d5df`；`bb179df`、`14a4600`；`8467c33`、`29211ed`）与 `ROADMAP.md` M1 进度记下的测试结果标为完成（`llm`）。`q-profile-cleanup` 批注旧目录的记录已复制完、这张卡不再等 1.4（`llm`）。main 的 `ROADMAP.md` §3 新增的两行（L4 重启后补拷用量、原生通道 L4 验收后按用户定案 A 搬凭证）都排在 L4 之后，用户已经定了做法，没有开新的待决，作为批注挂在 `q-l4` 上（`llm`）；其余待决与 §3 一致。本分支第二阶段的进展作为批注写在仍是提议的 `m2-2`、`m2-3` 上（`llm`），状态不动：提议要人批准后才能改状态。

补图（2026-10-28，main 在 `1ae8222`）：`m1-9`、`m1-7` 按各自的两个提交（`c964f75`、`33345dd`；`4cb8799`、`7561e4b`）与 `ROADMAP.md` M1 进度记下的测试结果标为完成，`m1-7` 的正文更新到标定起步之后（`llm`）。派发可行性验证（`953fc39`、`d6977ad`）在 L3 走通后台派发、写入范围门禁与 goal 驱动，`d-dispatch`、`d-driver` 的验证状态改为沙盒验证，证据是 `npm run probe` 69/69（`llm`）。6.1 积分口径与高峰提醒、派发可行性验证分属 M6、M7，这两个里程碑还是提议，图上没有对应条目，进展作为批注写在 `m6`、`m7` 上，状态不动；借用审计落文档（`f9a6a95`）批注在 `orch` 上（`llm`）。main 的 `ROADMAP.md` §3 删去了检查器的决策卡（`q-checkers` 已拍板，main 已执行），批注在 `q-checkers` 上；§3 新增的四项待决各成一张卡，挂在 `m1` 下、来源连到 `m1-9`：`q-gitleaks`、`q-eslint-js`、`q-scripts-dev`、`q-typescript`（`llm`）。`q-l4` 批注用户把 L4 安排在 2026-10-28 与核对项，`q-graph-design` 批注本分支合并 main `1ae8222` 的结果（`llm`）。图上现有 59 个节点。

图片：`docs/graph/graph.svg` 是 `npm run graph:render` 的输出，与节点文件同批提交。`tests/graph-render.spec.ts` 检查节点文件没有校验问题（含非规范写出），且 `graph.svg` 与渲染器对已提交节点的输出逐字节相同；改了节点没有重新出图，`npm test` 就失败。

与路线的关系〔定案 2026-10-28，用户：「其余全部按你的来」，取推荐项〕：图合入 main（`5463662`）之后，进度只记在图上：节点的状态、证据、批注与待决。`ROADMAP.md` 只留里程碑与验收条件，`HANDOFF.md` 只留交接所需的环境与陷阱，两处都不再记进度，免得与图不一致（`CHARTER.md` §10 单一事实源）。此前图是路线在某个 main 提交时的快照，main 的进展每次合入时补进图，这个做法随合入结束。

合入时的补图（2026-10-28，main 在 `5463662`）：路线导入、仍为提议的 M2–M8 及其条目视为已批准，由 LLM 带用户原话转述批准；用户在对话里定过的旧待决同样带原话转述拍板（§2.9.1）。原型的 §15 细则记为一张决定者为 agent 的待决 `q-graph-details`，由 agent 拍板；决策分级的规则记为规范节点 `norm-decision-tiers`。当天的新工作（提示词缓存第二步未命中、签名握手 404、原生面板、实时现场、节点上的运行控制）各成节点。

记录边界〔定案 2026-11-01，人提出图上要写明各板块的作用与允许记的内容，否则会记乱；同批写进图工具说明（`src/graph/tools.ts`）〕：图收工作的状态——条目、待决、定案、风险与规范，及每条状态的证据；其余各有去处：长篇论证与设计取舍进模块设计稿（`.agents/tasks/<模块>/design.md`）或 `docs/`，图上留一行指向它的批注；关于人的偏好进记忆（`.llm/memory.json`，经记忆行写）；做完还值得记的坑与解法进条目正文或复盘节点，经验板块（M5）落地后迁过去。批注只记短事实（改了什么、为什么、证据在哪），不粘贴长文。合入或收口后照这个边界把堆着的事项逐条对一遍、各归各位；图的历史只增不改，归位以新记录表达，不改写旧记录。

## 3. 角色

没有队友角色，也没有角色 preset〔定案 2026-10-28，取代原先「一个 Lead 加若干具名队友、共享任务板」的角色设计与队友角色卡〕。主 Agent 把项目图上的任务节点派给后台子 agent：经 `subagents.startActivation` 用 spawn 后端启动，结果送回主 Agent（`delivery: 'parent'`），主 Agent 不等它，继续做别的，子 agent 完成时收到通知。原来写在角色卡上的内容改为任务节点的派发属性，由 harness 在派发时读取（§3.2）。

### 3.1 主 Agent（项目经理）

主 Agent 是一个项目里人唯一对话的那个会话的根 agent〔定案 2026-10-30，`d-one-main-agent`；M3 第 3 步已实现，设计行 `glm-hourness/design` 默认启用（第 12 步（b）合入起；此前禁用）〕。

- 职责：访谈、规划、派发、验收、汇报。
- 谁是主 Agent：会话级的状态，由人用 `/wish` 开启，模型发不出斜杠命令，所以不能自己进出这个角色。`/wish` 让当前会话当这个项目的主 Agent，后面跟一句话就从许愿开始（空闲的 agent 被唤醒，运行中的 agent 在下一步收到），`/wish off` 退出。状态从命令的 `command/run`、`command/done` 折叠成会话投影 `hournessMainAgent`，处理函数返回到 `command/done` 落盘之间由内存里的待生效状态补上，所以角色从命令之后的第一步就变（身份节、工具面各变一次）。委派出去的子会话从来不是主 Agent。
- 一个项目一个主 Agent：项目就是图目录（同一仓库的两个工作树各有自己的 `docs/graph/`，算两个项目）。持有者记录是用户级目录里 `main-agent/<项目键的哈希前 16 位>.json`，内容是会话 id、图目录、开始时间与命令 id；写入靠独占新建（两个会话同时抢，只有一个成功）和临时文件加改名，读按文件的修改时间与大小缓存。投影为真还不够，记录要指向本会话；记录读不到时只按投影判，行健康提醒再发一次 `/wish`。已有主 Agent 时在别的会话发 `/wish`，回复说它在哪个会话、从什么时候开始、会话标题，并提示 `/wish here`（带一句话时提示「/wish here 加这句话」）；记录指向的会话已经不存在（打开着的会话里没有，存着的会话里也没有）时直接接管；指向一个打开着、却没有开着主 Agent 模式的会话（它的 `/wish` 在写下记录之后被取消或没有成功，会话里又没有正在进行的 `/wish`）时同样直接接管，回复开头说原来记的会话其实没有开着主 Agent 模式，被接管的会话不受影响，它被取消的说明还在它自己下一次读角色时报出来。`/wish here`（后面可以跟一句话）把主 Agent 从别的会话移到当前会话：记录换人，原会话如果还开着，由本行以人的身份对它执行 `/wish off`（原会话变回普通会话，收到一条说明）；原会话没开着的，下次打开时对齐，人 fork 出来的会话也一样，在它第一次空闲之后对齐，不在 `agent/created` 监听器里等。记录不比会话的模式活得久〔第 3 步评审 S3-1〕：指向本会话的记录，在这个会话的 `/wish` 被取消（`command/done` 记成出错）之后由这个会话下一次读自己的角色时删掉，同一个会话再发 `/wish` 则以新命令为准、不删；`/wish` 在写下记录之后出了错的（`/wish here` 里别的会话退不出、写记录后的临时文件清理失败一类），返回错误之前就把记录删掉，删不掉时该会话的行健康写明〔第 3 步评审 R1〕；会话创建时模式是关的（状态读得出）、记录又指向它，创建时就把记录删掉——不看日志里的 `/wish` 是收尾了、出错了还是没落盘〔第 3 步评审 R4〕；会话状态读不到（服务没到、状态读不出）时不判断、不删；删不掉时那个会话的行健康写「在这个会话里发一次 `/wish off`」。同一时刻至多一个会话是主 Agent；`mainAgentOf(userHome, dir)` 给晨报、周报与巡检找人用，它只读记录：`/wish` 被取消之后到该会话下一次读自己的角色之前，它仍返回那个会话；崩溃留下的记录要到那个会话重开时才删〔第 3 步评审 R1〕。接入它的步骤（M5 的晨报、M7 的派发、循环板的投递）要么先经设计行的读法核对那个会话开着且模式开着（模式关、又没有进行中的 `/wish`，按没有主 Agent 处理），要么在自己的设计里写明接受这个窗口〔第 3 步评审 R2〕。
- 身份〔定案 2026-10-28，2026-10-30 收窄〕：本项目自己的提示词文本，是系统提示词里的一节 `hourness:main-agent`，分两部分。第一部分只写角色与边界：这个项目的主 Agent、项目经理，没有写文件的工具；harness 执行的规矩只点名一句（写文件的 shell 命令被拒、放行之前子 agent 只读、图只经图工具改、转述人的话要在人发来的消息里）；git 与 shell 归主 Agent，会丢工作的 git 命令之前 harness 先存快照；设计循环的四个阶段；`/plan` 打开时 `exit_plan_mode` 只离开计划模式、不放行任何节点。第二部分写怎样跟人说话（`TALK_GUIDE`）：只问人的事，能撤回的技术选择自己定、下一批里用一句话告知；人说「这类你定」就用 `record_human_answer` 的 `delegation` 记下；访谈留在聊天里，先猜一个让人改；要人答的事用 `propose_to_human`，原样给人看它返回的文字；回复末尾提问，一条至多三个；收不回的事得到随口的短回答（不在 `AGREE_WORDS` 里）先复述「那我记成：……」等人点头再记；加上换词表。四种问法的写法与硬限制（`TALK_SHAPES`）和每种一道例题（`PLAIN_QUESTION_EXAMPLES`，题材是虚构的图书馆系统，只示范形状）在 `propose_to_human` 的工具说明里，不在身份节里。访谈怎么问、图上怎么写由阶段提醒与工具结果随时下发。长度上限由测试钉住：第一部分 1,500 字符，第二部分 1,800，整节 3,000。身份节只写调用，不写「这类你定」存在哪里（回退时是 `norm-delegations`，M5 合入后是偏好），换存储时它不用改。不用 DSH 的 agent preset 或 persona 行承载。
- 工具面〔定案 2026-10-30，`question-26` C，取代 2026-10-28 的「主 Agent 的工具面不变」〕：设计行的第二个组装监听器（不带 `prepend`，所以在方言与工具检索的 `prepend` 监听器里层，它们 `next()` 之后看到的已是去掉之后的工具）按原生名去掉 `write`、`edit`（`Write`、`Edit` 经方言服务或静态别名表换算）与 `ask_user_question`（问人改成聊天，主 Agent 不出问答卡），并把装着的 `str_replace_editor` 的 `command` 收窄成只剩 `view`。这只是不让模型看见用不了的工具，不是边界：rc.3 按名执行，按名直接调用 `Write`、`write` 或 `ask_user_question` 仍会执行，拦截是 guard 的规则 `main-agent-no-write` 与 `main-agent-ask`（§6.7，M3 第 4 步）。
- 不写代码〔定案；机制于 2026-10-28 改定，工具面一半于 2026-10-30 提前〕：写文件的 shell 命令由 guard 在主 Agent 的 `tools/pre-execute` 拦下，正路是派发任务；文件工具不在主 Agent 的工具面里。
- 阶段提醒与派出去的 agent 只读〔M3 第 5 步，设计行默认启用〕：主 Agent 的每一步，在本步接纳的消息之后带一条阶段提醒（`agent/pre-step` 的 notice，来源 `glm-design-stage`，不进系统提示词），写明焦点所在的目标、它的阶段、本阶段怎么做、还缺什么、下一步问人什么（§4.8）。放行之前，主 Agent 派出的子 agent 和它们再派出的各层 agent 只读；放行指目标，分了模块的目标指焦点所在的那个模块（§4.9）。拦的是 guard 规则 `design-before-release`（§6.8）。
- 说话方式〔定案 2026-10-29 `d-chat-not-cards`，取代每个问题带选项与推荐的卡片；2026-10-31 `d-ask-three-gates` 改写怎么问，试行，人看效果再调〕：聊天，不出问答卡，少术语，给人的话先过换词表（`src/graph/plain-question.ts`）。问人分三道关：问不问（只问人的事）、什么时候问（回复末尾，报告在前、问题在后）、怎么问（四种问法：`recommend` 同意一条推荐、`choose` 在两三条路里选、`want` 改正一个猜测、`look` 看一样东西指毛病；没有统一模板，没有标签行）。
- 把事交给人、把人的话记下来〔M3 第 6 步，设计行默认启用；`src/design/propose.ts`、`src/design/record.ts`〕：两个工具只给主 Agent（别的会话的工具面去掉它们，直接调用得 `forbidden`），在 GLM 上常驻。`propose_to_human` 把一件事交给人，记录与问话分开：记录是 `form`、`title`、`proposal`、`reason`、`cost`、`ways`、`notTaken`，进图成为一张提议式待决（§2.6），harness 核对齐不齐、合不合规则；问话是 `text`，主 Agent 自己写的一句话，一行、恰好一个问号、`recommend` 不超过 160 个字其余 120、不含换词表上的词，harness 只查这些硬限制，并查记录是不是逐字在话里（`recommend` 的 `proposal` 与 `reason`、`want` 的 `proposal` 在问句里，`cost`、`choose` 的 `reason`、`look` 的 `proposal` 在整段话里）。返回的文字要原样给人看：编号（①②③），`choose` 的几条路排成编号列表、最后一条标「（推荐）」，必须原样给人看的原文（`look` 的样稿放进代码围栏；别的组件记下的提议带的原文，`attach`，分派表 `src/design/attach.ts` 此刻是空的，由那块板合入时各加一行）接在最后。已经交过人、人还没回的，可以带 `question` 与新的话再给人看一次，或带 `form`、`title` 与记录改一次（`form` 不能变）。一条回复至多三件（`too_many`）。`confirm`〔第 8 步〕把需求交给人：只收 `goal`、`text` 和可选的 `sample`（问题的记录字段、`module`、`page` 都是 `invalid`）；目标要开着、在访谈中，需求卡 8 项都齐、没有取代旧节点的连线，否则 `gate_unmet`，说明缺哪几项、各该问哪一步、写到哪里，不返回 `text`；`text` 是一句是非问，一行、恰好一个问号、字数按 `recommend` 的上限、不含换词表上的词，需求本身在它前面的汇报里；这一步不写图，占一回复三件里的一件。`release`〔第 9 步〕把设计交给人：收 `goal`、`text`、`module`、`page` 和可选的 `sample`（问题的记录字段是 `invalid`；`page` 与 `sample` 至多一个），`text` 的限制同 `confirm`；不写图。没分模块的目标：目标开着、在设计中（访谈中的 `invalid`，提示先 `confirm`；已放行的 `invalid`），放行门禁成立（放行集合里至少一个设计决策——或目标下已经批准的一个，放行中途停下后要接着放——每个决策五栏齐、每个任务有「怎样算做完」、没有未拍板的待决、没有取代旧节点的连线），否则 `gate_unmet` 列出缺项；带 `page` 是 `invalid`（`this goal is not split into modules`）。分了模块的目标（目标下有模块或候选）放行两层（§4.9）：不带 `module` 的是框架、模块清单与方向清单的放行，门禁是框架（目标下的一个设计决策）、方向清单（`norm-directions` 至少一条）、放行集合里每个决策五栏齐、目标一级的任务有验收、模块以外没有未拍板的待决、没有取代旧节点的连线，放行集合是模块以外的全部提议加候选；带 `module` 的是这个模块的放行，要目标已到 `release`，`module` 是目标的模块（不是候选）、没放行，门禁是模块下有要放行的内容、直接挂着一个设计决策、集合里每个决策五栏齐、任务有验收、模块下没有未拍板的待决，放行集合是模块子树里的提议。两种放行的 `page` 都必填（1 至 2000 个字，`PAGE_LIMITS`），`page` 里要有每个候选与每个框架决策的标题、方向清单每条的原文（框架放行），或模块的标题（模块放行），比较前做 NFKC 与空白合一，缺哪个报哪个，不查标题与行文；`page` 原样接在 `text` 之后给人看。返回里带放行集合与每个节点此刻的修订号（`releaseSet`），`record_human_answer` 按这些修订号批准。`record_human_answer`（`question`）记人的回话（`agree`、`add`、`reject`）：主 Agent 带人的原话（1 至 3 段），harness 在写图之前核对每一段都是人在这件事交给人之后发来的消息里的整句或整段（起止在标点、空白或换行上，`personSaid`，`src/design/talk.ts`；会话投影 `hournessTalk` 折叠出人的消息与给人看过的东西，注册不上时退回读会话日志并让行健康降级，两样都没有就 `unavailable`），之后以 `llm` 加 `relay` 写图，所以带人的权限：同意是 `decide` 带 `conclusion`，补充与否掉是待决上的批注，待决仍开着。`choose` 的同意要带 `way`（人选的第几条），除非人把整件交给主 Agent 定（`recordedAs` 以「交给主 Agent 定：」开头）；带样稿的 `look`，主 Agent 的回话里没有整份样稿就 `not_shown`，图不变。`record_human_answer`（`confirm`，第 8 步）记人对需求的回话，要带 `goal`：本会话里要先给人看过这个目标的需求（没有就 `not_shown`），人的话要在最近一次给人看之后；带样稿的，整份样稿要在主 Agent 的回话里（同意时查，`not_shown`）。同意时先重查需求卡（门禁不成立 `gate_unmet`，不写），再把阶段改成 `design`，目标还是提议就批准；这两条写入出自一次调用，都以 `llm` 加人的原话写，`reason` 是「人在对话里同意（record_human_answer <调用 id>）」。先改阶段、后批准，与附录 0.6 §3.5 表里的次序相反，原因是中途停下时的样子：提议状态的目标，不论字段写什么阶段，有效阶段都是 `wish` 或 `interview`（§4.8），改完阶段停下，目标仍是提议，访谈的门禁照旧关着，用同样的话再记一次就接上；先批准的话，停在中间的是「已批准、没有阶段」，所有门禁都读成不走设计循环，同样的话也接不上（`confirmGate` 拒绝）。第二条写入失败（`stale_revision` 重试一次后仍失败，或引擎抛错，例如磁盘写不进）时，错误说明阶段已改而目标还没批准，错误的 `hint` 里是人的原话。目标由访谈进设计只有这一条路（图工具被 `main-agent-graph-stage` 拒绝，§6.9）。批准这条写入要有得写：目标得还是提议。`/wish` 的开场通知里有一句正路的嘱咐〔2026-11-02 标定 0/6 后加的〕：提议目标时不带 `relay`（带了人的原话，提议直接是已批准，§2.9.1），人对需求卡的同意才是带原话的批准，不是一次改写——那次标定里 GLM-5.3 带原话提议了目标，目标开场就 `approved`，确认时只剩改阶段一条写入，验收要的「带原话的批准」永远落空。补充与否掉在目标上写批注，目标不动，改好需求后再 `propose_to_human`（`confirm`）。`record_human_answer`（`release`，第 9 步）记人对设计的回话，要带 `goal`，放行某个模块时再带 `module`：本会话里要先给人看过这一个放行（目标一级与每个模块各是一件事，给人看了 A 记不了 B），人的话要在最近一次给人看之后；带 `page` 或样稿的，整份要在主 Agent 的回话里（同意时查，`not_shown`）。同意时先重查门禁（不成立 `gate_unmet`，不写）；写入都以 `llm` 加人的原话，`reason` 以「人在对话里同意」开头并含调用 id，按给人看时记下的修订号（改过的节点跳过，已不是提议的节点放过），次序：没分模块的目标和模块——逐个批准放行集合，全部成功且集合里不再有提议时才把阶段改成 `release`（模块与分了模块的目标的阶段写入末尾加「 · 一页放行稿 <页的摘要>」，摘要是规整后 `sha256` 的前 8 位，`pageDigest`）；分了模块的目标的框架放行——先给集合里每个阶段不是 `design` 的候选写 `design`（候选仍是提议，所以停在任何一步之后目标仍是分了模块的、不会落进单层放行），再批准集合（候选因此成为模块），最后写目标的 `release`。某个节点被改过（`stale_revision`）或被拒时进 `skipped`，`outcome` 是 `partial`，阶段不改，`message` 列出跳过的与放行之后新提的；写入中途停下（例如磁盘写不进）时错误的 `hint` 写出已经写上的与人的原话，再给人看一次、用同样的话记一次就接上，已批准的不再批准、已带 `design` 的候选不再写。补充与否掉在被放行的节点（目标或模块）上写批注，阶段不动。三种说法的字面固定在 `src/shared/answer-marks.ts`。指标事件的出口 `src/design/metrics.ts` 此刻不做事（指标流水的接口还没定）。
- 「这类你定」〔M3 第 6 步〕：人说某一类事以后由主 Agent 定，主 Agent 调 `record_human_answer` 的 `delegation`（`scope` 写那一类，`undo: true` 收回）；harness 核对原话出自人的最后一条消息，再在工具体里直接写图上固定 id 的规范节点 `norm-delegations`（每项 `<类>：主 Agent 定，只告知`，类按规整值存，至多 20 项；M5 的偏好合入前的回退，合入后换存储）。任何会话用图工具碰这个节点都被拒（`main-agent-graph-delegations`，§6.7），所以模型不能自己给自己授权。只对能撤回的事成立，由主 Agent 在遇到同一类里收不回的事时照旧问。
- 人设分层：用户的人设管「怎么说」，主 Agent 的身份文本管「做什么」，两层叠加互不干扰。身份节与 `glm-prompt` 的方言改写的叠加已在 L3 实测（场景 `glm-design-wish-idle`、`glm-design-main` 等，`ROADMAP.md` 借用组件核实清单第 16 项）：GLM 路由上这一节在方言节之后、`glm:guard` 之前，非 GLM 路由上在 `glm:guard` 之前。
- 人设〔`m3-main-persona`，设计行默认启用〕：人在设计行的配置里写主 Agent 跟人说话的人设，`persona: {name, text}`（插件管理器里能改，`text` 是多行文本框，默认空）。插件不带人设内容，人设文字是人自己的配置（`docs/CHARTER.md` 非目标「人设与个人习惯不进插件」）。`text` 非空时，只给主 Agent 的系统提示词加一节 `hourness:output-style`：`# Output Style: <name>`、人写的文字、一句范围说明（人设只管回给人的话；工具调用里的文字，例如图节点和给子 agent 的简报，以及写进文件的东西保持朴素）。普通会话、子会话（派出去的子 agent 与审查者）和主 Agent 移走之后的原会话都没有这一节，所以人设用语进不了子 agent 写的代码、注释、提交信息和交回结构。只给主 Agent 的理由：主 Agent 没有写工具，人设的话落不进文件；普通会话直接写代码，人设会落进文件。`propose_to_human` 的 `text` 是主 Agent 放进工具调用的参数，保持朴素，原样放进回复，前后衔接的话是回复的一部分，人设照管。`name` 规整成一行，至多 40 码点（超出截断并告警一次，规整后为空时用「主 Agent」）；`text` 至多 4,000 码点（超过不加，行健康降级并写出原因）。节的位置、GLM 路由上身份节开头句的换法、与 3.17.1 的三处不同见 `DESIGN.md` §5.2 和 `docs/reference/zcode-verbatim.md` 的「不跟 3.17.1 的地方」；本步已随 m3 合入 main（第 12 步（b））。用户自己 `~/.dsh/AGENTS.md` 里的人设所有 agent 都读得到，那是用户配置，插件不动。`glm-prompt` 的汇报细度配置原名 `persona`，与人设不是一回事，已改名 `reportingDepth`。桌面版上的核对（设置位在插件管理器里能改；设了标记人设之后主 Agent 的回复带标记，子 agent 写的文件与交回结构里没有）要改用户的 profile，到时先问人。L2 `tests/design-persona.spec.ts`、`tests/glm-reporting-depth.spec.ts`，L3 场景 `glm-design-persona`、`non-glm-design-persona`。
- 降级：会话状态服务没到、`/wish` 注册不上、持有者记录读不到、会话状态读不出时，设计行报告降级并说明原因，普通会话不受影响（`DESIGN.md` §2.5、§7）。
- 分布说明：ZCode 里的 GLM 是自己写代码的单 agent，「主 Agent 只编排」在 ZCode 训练分布之外，子 agent 干活仍在分布内。用户判断后续模型会具备编排能力〔定案〕；这一层单独度量简报完整率、返工率与主 Agent 上下文占用。

### 3.2 任务节点的派发属性

〔定案 2026-10-28，取代队友角色卡〕任务节点带以下属性，主 Agent 派发时由 harness 读取。节点没有角色字段，§2.2 公共字段里的「负责角色」作废。

| 属性 | 内容 | 落到 DSH |
| --- | --- | --- |
| 种类 | 实现、测试、审查、文档 | 简报模板与交回要求 |
| 写入范围 | 子 agent 可写的文件与目录；审查为空 | guard 在子 agent 的 `tools/pre-execute` 拒绝范围外的写入，拒绝以工具错误回到子 agent |
| 模型档位 | 难题、常规、简单（§3.5） | `startActivation` 的 `request.agentOptions` |
| 验收条件 | 节点的公共字段（§2.2） | 简报的「验收条件」一栏，也是审查的依据 |
| 交回结构 | 交回内容的 JSON Schema | `request.outputSchema`（启动前校验为对象 schema，`dsh-subagent` 3036 行起） |
| 独立工作树 | 多个写任务并行时，各给一个独立的 git 工作树 | `request.cwd` |

- 子 agent 的身份只有简报（§3.3）。派发不选 preset，子 agent 加入父 agent 当前的 preset（`dsh-subagent` 346、373 行），工具面与主 Agent 相同，限制靠 guard 的写入范围。
- 深度：`maxDepth` 默认 1，子 agent 不能再派发；`maxActiveSubagents` 默认 8（`dsh-subagent` 2979–2980 行）。
- 子 agent 调用 `userQuestions.ask` 会被拒（`DELEGATED_CALLER`，`dsh-user-questions` 534 行），委派出去的子 agent 审批策略固定为 `never`，出界请求由主 Agent 汇总后向人申报（§6.2）。
L3 核实〔实测 2026-10-28，派发可行性验证 (a)(b)，`ROADMAP.md` 借用组件核实清单第 4、4b 项〕：探针覆盖层里的验证插件（`scripts/probe/probe-dispatch.mjs`）是宿主层插件，inject `subagents`，注册一个派发工具；GLM 主 Agent 经 DeferredToolCall 调它，派出任务 T1，证据是探针场景 `glm-dispatch`：

- (a) 后台派发成立。`startActivation`（spawn、`delivery: 'parent'`、预留 `childId`）在子 agent 被接受时返回，派发工具当场把子 agent 的 id 交回；主 Agent 接着又走了两步，都在子 agent 第一次请求之前。子 agent 收到的首条用户消息是简报原文，后面附有运行时加的「结束前用 `send_message` 把结果发给父 agent」的指引（`dsh-subagent` 472 行）；工作目录是请求里的 `cwd`；模型是 `agentOptions` 指定的 GLM-5.3-Flash（只传 `model`，provider 继承父 agent，315 行）。子 agent 经 DeferredToolCall 提交 `structured_output` 后回合结束，主 Agent 收到完成通知，通知里带 `Structured result: <JSON>`（526 行），`startActivation` 返回的 `result` 也带同一份结构化结果，`stopReason` 为 `completed`。
- (b) 写入范围门禁成立。宿主层的 `tools/pre-execute` 看到子 agent 的每一次调用，`exec.agent.id` 等于预留的 `childId`（rc.3 的 agent id 就是会话 id），据此映射回任务；主 Agent 自己的调用映射不到任何任务。范围外的 `Write` 被拒，拒绝以工具错误回到子 agent，文件没有写出；范围内的 `Write` 照常执行。

由此带来的实现约束（M7）：

- 任务映射用派发时预留的 `childId`，不靠会话头。子 agent 的会话头 `cwd` 是父 agent 的目录，请求里的 `cwd` 只成为工作目录（`dsh-subagent` 346–355 行；探针实测）。guard 现在以会话头 `cwd` 作包含根（`DESIGN.md` §2.4a），子 agent 的包含根因而是父 agent 的工作区；DSH 自己的文件沙盒根也是父会话的工作区。所以独立工作树要建在父 agent 的工作区之内（例如不入库的 `.worktrees/`），写入范围按任务属性另行判定，不能拿会话头当范围。
- 预留的 `childId` 可以编码任务节点 id，宿主重启后从子会话 id 就能找回任务；映射表只放在内存里时，冷恢复的子 agent 会失去写入范围。
- GLM 路由上 `structured_output` 与 `send_message` 都是延迟工具（不在常驻名单里，`src/toolsearch/exposure.ts`），子 agent 要经 DeferredToolCall 调用。探针实测经 DeferredToolCall 提交的结构化结果能被捕获；是否把这两个工具列为子 agent 的常驻工具，在 M7 的派发实现里定。
- 子 agent 的工具面里仍有 `subagent`、`subagent_fork`；这两个工具把设置里的 `maxDepth`（默认 1）传给服务，服务按它拒绝更深的派发（`dsh-subagent` 279–283 行）。服务只检查调用方传进来的 `maxDepth`，验证插件没有传；本包的派发工具要传 `subagents.resolveMaxDepth()` 的结果，否则子 agent 能经它再派发。

### 3.3 简报与交回

- 简报四栏：目标、上下文、约束、验收条件（对应官方建议的 Goal / Context / Constraints / Done when）。从节点自动预填；缺栏的简报被门禁拦下。
- 小改动用简化简报：规则照样硬，靠降低派发成本来解决「一行小改也得派人」，不给主 Agent 开后门。
- 交回：只交摘要与证据，不交过程。

### 3.4 审查独立

交回的证据由独立的审查 agent 在另一个上下文中核对，可行时用另一档模型。审查是一个种类为审查、写入范围为空的任务节点（§3.2）。同一上下文不自己批自己。

### 3.5 模型档位与并发

- 难度对应档位：难题用 GLM-5.3（effort high 或 max），常规用 GLM-5.3，简单用 GLM-5.3-Flash。主 Agent 对已配置的模型有调用权，使用情况在晨报中披露。
- 主 Agent 用强一档的模型〔定案 2026-10-30，`d-main-agent-models`〕：它的工作是理解人要什么、拆计划、验收，比子 agent 的活更吃判断。插件不替人换模型（`CHARTER.md` §6），只提醒：`/wish` 的回复末尾写「主 Agent 建议用强一点的模型」，开场卡片与流程条的提醒随流程条一步做（M3 第 11 步）。子 agent 的模型由主 Agent 派活时选并记下理由（M7）。DSH 的委派在请求不覆盖时让子 agent 沿用父 agent 的 provider 与模型（`resolveChildAgentOptions`，subagent:302–305）；subagent 工具的 `modelSelectionSettings` 打开时，模型能在每次调用里选 `provider`、`model`、`reasoning_effort`，限于允许清单（tool-subagent:42–66、311–314、360–374）。M3 不改，M7 设计派发选模型时先评估这项现成能力。
- 档位与模型分属两个包〔split 第 5 步，2026-10-29〕：档位词汇 `hard`、`standard`、`simple` 在编排层（任务节点的 `tier` 字段）；档位到模型的映射归通道包，上一条就是 GLM 通道包对自己路由的映射，M7 时由它提供一个服务，只对自己的路由给答案，服务名与接口在 M7 定。没有映射的路由（GLM 包没装，或会话不在 GLM 路由上）：子 agent 继承父 agent 的路由，不给 `agentOptions.model`，`dsh-subagent` 在父路由之上合并（§3.2 的 L3 实测），不跨通道、不换套餐（`CHARTER.md` §6）。
- 不自动切换套餐与渠道（`CHARTER.md` §6）。
- 并行槽位上限可配置，实际派几路由 LLM 判断（包括冲突约束）；槽位空出时 harness 提醒主 Agent 补位。

### 3.6 借用

〔定案 2026-10-28〕派发借用 DSH 的 subagent 系列，不用 Agent Team，也不用工作流引擎承载派发。rc.3 的依据〔实读〕：

- subagent：服务 `subagents` 在宿主层。`startActivation({ provider, label, request: { prompt, parent, cwd?, agentPreset?, agentOptions?, outputSchema?, maxDepth? }, signal, delivery: 'parent' | 'caller', childId? })` 返回 `{ childId, messageId?, result, dispose }`（`dsh-subagent` 3036 行）；另有 `sendMessage`、`interrupt`、`listChildren`、`waitForChildren`、`drainChildren`。spawn 后端支持 `agentOptions`、`agentPreset`、`outputSchema`、`depthLimit`（`dsh-subagent-spawn-in-process` 21–27 行），`cwd` 由服务按父 agent 的工作目录解析；fork 后端继承父会话已完成的回合，拒绝 `agentPreset`。本项目的派发用 spawn。
- 不用 Agent Team：Team 队友由 `subagents.startActivation` 创建，不带 `agentPreset`，工具面与 Lead 相同（`dsh-experimental-agent-team` 1032 行）；Team 作用于 profile 里的每个根 agent，包括非 GLM 会话，与 §6.2 冲突；Team 的任务板与项目图会成为两份状态；所有成员共享一个 checkout，写入范围只是建议；整套是实验包，所在可选包默认关闭（`dsh-app-boot` 579 行 `OPTIONAL_BUNDLES`）。原文「启用 Team 的整包会关闭普通 subagent 委派」不对：Team 的 profile 层只禁用四个顶层行 id（`dsh-experimental-agent-team-profile/cordis.patch.yml` 4–14 行），而 Desktop 上真正提供委派工具的是 `preset-standard` 内 `delegation` 组的同名子行，按 id 打补丁碰不到 preset 内的子行（`dsh-app-boot` 61–68 行），所以 `subagent`、`subagent_fork` 仍在；但 Team 的九个工具装在每个根 agent 的作用域里，以同名遮蔽 `send_message`、`list_agents`、`interrupt_agent`（`dsh-experimental-tool-agent-team/README.md` 12 行），普通子 agent 就不能再续聊、列出或中断（推断，未在真机确认）。
- 不用工作流引擎承载派发：`workflowEngine` 在 Desktop `preset-standard` 的 `delegation` 组内隔离，宿主层插件取不到（`dsh-web-app/presets/standard.patch.yml` 83–87 行）；脚本的 `agent()` 也选不了 preset。它适合一次性的大批量审计或迁移。

## 4. 设计循环

### 4.1 阶段

许愿 → 访谈 → 设计 → 放行 → 分解 → 执行 → 汇合 → 运维。

### 4.2 许愿访谈

背景：DeepSeek 在 V4.1-Flash-1017 发布时提出「许愿式编程」：用户说清楚想要什么，规划、编码、运行、检查、修改由模型自己推进，背后是基于自反馈的强化学习（[量子位，2026-10-17](https://www.qbitai.com/2026/10/504067.html)）。GLM-Hourness 把这个反馈环放在模型外面，由项目图与证据门禁承担，可审计、人随时可介入。模型越自主，愿望越需要说准；真实项目里没说出口的要求不问不会出现。

主 Agent 的新任务〔定案〕：把一套标准流程用普通人能理解的聊天形式与人确认，在一问一答中规划出项目骨架。

| 步 | 问题（对人的说法） | 产出 |
| --- | --- | --- |
| 1 | 你想要什么 | 愿望原话 |
| 2 | 做成以后，你的日子会有什么不一样 | 真正的问题与使用者 |
| 3 | 你会怎么检查它真的做成了 | 验收条件 |
| 4 | 有没有你明确不想要的（先猜几个供挑选） | 非目标 |
| 5 | 有没有不能改、不能花、不能冒的险 | 约束 |
| 6 | 假如最后没做成，最可能是因为什么（先猜三个） | 风险（事前验尸） |
| 7 | 两三条路，每条写得到与代价，推荐的放最后 | 架构岔路的选择 |
| 8 | 看长出来的骨架，哪里不对就点哪里 | 已确认的目标分支 |

规则：

- 每个问题是一张表格卡（§5，决策 `d-option-card`）：两到四个选项，每行写怎么做（加粗短语）、得到与代价，几个选项真正不同的一个维度可以再加一列；题目下面一行「取决于」，写只有人知道答案的那个关键问题；表格下面一行「是 → X；否 → Y」。恰好一个推荐，排在最后一个：可以标明它是推荐，但位置在最后，人先读完其余选项（决策 `d-recommend-last`）。改目标、验收条件或非目标的问题是单向门，多一句「以后改起来很贵」。图上的待决由引擎核对这些字段（§2.6）。可以只点选项作答。
- 内部字段名不出现在对话里，靠词表翻译（例：「验收条件」说成「怎样算做成」）。
- 每答一题，项目图上亮起对应的一格，人看着骨架在聊天旁长出来。
- 资深经验以默认值的形式带入（例：「一般会先打通一条最细的路，你看行吗」），人只需点头或修改。

产出为需求卡，示例：

```
需求：我想把 ZCode 的额度反代出来给 DSH 使用
问题：DSH 里用不上 Coding Plan 套餐额度，也拿不到 ZCode 渠道的 1.5 倍用量
给谁：本人，日常在 DSH 里写代码
成功：DSH 里选 GLM 发消息走套餐额度、按 ZCode 渠道计；连续一周日常使用无限频报错；体感与 ZCode 一致
非目标：不做多用户共享，不对外提供服务，不改 DSH 本体
风险：官方只认指定工具，非官方客户端可能被限频；签名协议随版本变化；DSH 契约漂移
岔路：进程外反代 / DSH 插件内直连。推荐插件内直连：少一个常驻进程，DSH 能感知额度与错误
```

需求卡存在哪〔2026-10-29 定，M3 设计 §3.2；读法已实现：`src/graph/stage.ts` 的 `requirementCard`，纯函数，宿主与客户端共用〕：需求卡不另存，是从图上读出的 8 项。主 Agent 在第 1 步提议目标、聚焦到它，此后每答一题就改这个目标（LLM 能改自己提议、仍为提议的目标，§2.9），人在第 8 步一次批准整张卡。

| 项 | 落点 | 齐的判据 |
| --- | --- | --- |
| 需求 | 目标正文的 `需求：` 一节 | 非空，写人的原话 |
| 问题、给谁 | 目标正文的 `问题：`、`给谁：` | 各自非空 |
| 约束 | 目标正文的 `约束：` | 非空，没有约束写 `无` |
| 成功 | 目标的 `acceptance` | 至少 1 条 |
| 非目标 | 目标的 `nonGoals` | 至少 1 条 |
| 风险 | 目标子树里的风险节点 | 至少 1 个，未废弃、未被取代 |
| 岔路 | 目标子树里的待决 | 至少 1 张已拍板，且最后一次拍板是人做的（在面板里，或 LLM 带人的原话转述）；agent 自己拍的不算 |

正文的标签一节：行首是标签加全角或半角冒号的一行开始一节，到下一个已知标签行或正文末尾为止，值去掉首尾空白；同一标签出现多次只认第一次，第一个标签之前的文字不属于任何一节（`labeledSections`）。面板的节点详情直接显示正文，所以标签行就是需求卡的前四项。

度量：从许愿到骨架放行的轮数、用选项作答的问题占比、放行后目标被修改的次数（越高说明访谈越不到位）。

### 4.3 方案五栏

| 栏 | 回答 |
| --- | --- |
| 理由 | 为什么 |
| 架构 | 怎么做；附流程图；附「查过的现成方案及不用的原因」（先搜再造），以及所依据的学科与标准（界面看人体工学、视觉设计、可访问性与认知负荷；harness 与 guard 看安全工程；运行时看可靠性工程；度量看测量与统计；2026-10-29 用户同意，评审按列出的学科去审） |
| 目标 | 效果是，写成可机检的验收条件 |
| 规划 | 任务分解，即项目图的子树 |
| 非目标 | 明确不做什么，用来管住 LLM 做多的倾向〔定案〕 |

附带风险（事前验尸）。五栏缺任何一栏，不能离开设计阶段。

五栏落在哪〔2026-10-29 定，M3 设计 §3.3.1；判据已实现：`src/graph/stage.ts` 的 `designColumns`〕：一份方案是目标子树里的一个设计决策节点（主 Agent 提议，仍为提议），规划是指向它的节点。

| 栏 | 落点 | 齐的判据 |
| --- | --- | --- |
| 理由 | 决策正文的 `理由：` | 非空 |
| 架构 | 决策正文的 `架构：` 与 `查过的现成方案：` | 两节都非空（先搜再造，§10.2） |
| 目标 | 决策的 `acceptance` | 至少 1 条 |
| 规划 | 目标子树里以 `source` 连线指向这个决策的节点（特性、任务） | 至少 1 个，未废弃、未被取代 |
| 非目标 | 决策的 `nonGoals` | 至少 1 条 |

正文标签的读法同需求卡（§4.2）。放行之前方案的节点都是提议，在面板上是虚线。

不设积分与轮次预算〔定案〕：预算会导致赶工或半途停下。积分消耗只在晨报中披露，范围由非目标约束。DSH 的 goal 必有轮次上限（默认 256，只接受正整数），本项目设一个大值，到上限当作汇报事件处理，不当预算（§2.1）。

### 4.4 五键

只出现在设计阶段，每轮方案汇报附一张〔定案〕：

| 键 | 含义 |
| --- | --- |
| 批准 | 按方案放行，进入自主执行 |
| 拒绝（带理由） | 理由随拒绝返回，供重新设计 |
| 补充 | 补充上下文或约束后重提方案 |
| 讲细点 | 汇报细度上调一档并写入画像 |
| 说重点 | 汇报细度下调一档并写入画像 |

按钮直接写「讲细点」「说重点」〔定案 2026-10-27〕。早期记录中这两键叫「太简单」「太麻烦」，字面可以有两种相反的读法，改名后不再有歧义。

### 4.5 放行

借用 DSH 计划模式 `plan-mode` 的三样东西：提示词节 `plan:policy`、审阅卡（`exit_plan_mode` 经 `userQuestions.ask` 发出带 `plan-review` 意图的卡，`dsh-plan-mode` 257、275 行）与 `plan/mode` 状态。计划模式只靠提示词，所有工具照常可调（`dsh-plan-mode/README.md` 184 行「Guidance, not enforcement」）〔实读〕，所以：

- 设计期只读由 guard 实现〔规划〕：设计阶段在 `tools/pre-execute` 拦下写文件与写文件的 shell，正路是提议节点的图工具（§6.3）。
- 五栏门禁挂在 `exit_plan_mode` 的 `tools/pre-execute`：五栏缺项直接拒绝并给正路，审阅卡不出现。
- 审阅批准时工具返回 `{ approved: true }`，这就是放行信号，对应分支由虚线变实线。

主 Agent 模式下放行不走计划模式的审阅卡，走对话〔M3 第 9 步，`propose_to_human` 与 `record_human_answer` 的 `release`，设计行默认启用〕：主 Agent 把设计写进图（提议），汇报里讲清楚，再用 `propose_to_human`（`kind release`）问一句「照这一页放行，可以吗？」；人说「可以」，主 Agent 用 `record_human_answer` 带人的原话记下，harness 核对原话与门禁之后批准放行集合、把阶段改成 `release`，放行之后派出去的子 agent 才能写文件（§6.8）。没分模块的目标放行一次：集合是目标子树里的全部提议。分了模块的目标放行两层（§4.9）：先放行框架、模块清单与方向清单（目标进 `release`，各模块还在设计，没有哪个模块的开发被放行），再每个模块各放行一次（模块的集合是它子树里的提议，模块进 `release`），两次都带一页放行稿 `page`。给人看的就是人放行的：放行按给人看时记下的修订号批准，改过的节点不替他批；`page` 整页要在主 Agent 的回话里，人才能同意。主 Agent 可以自己把一个模块退回设计（第二档，不要人的原话，§4.8），把整个目标退回设计改框架要人的原话（第三档）。

在 Desktop 上，计划模式在 `preset-standard` 的 `planning` 组里，`planMode` 服务隔离在组内（`dsh-web-app/presets/standard.patch.yml` 45–49 行），宿主层插件的普通查找取到的是宿主域。读写计划状态要经 `ctx.agentPresets.serviceFor(agent, 'planMode')`（`dsh-agent-preset-registry` 725 行），能否取到并生效待沙盒验证（`ROADMAP.md` 借用组件核实清单）。

### 4.6 分解与执行

- 每个分支先打通行走骨架：一条最细的端到端通路，再加宽。
- 叶子都有验收条件，按难度定模型档位（§3.5）。
- 执行期自主推进，不打断人：计划内决策自主执行并留痕；计划外决策发异步决策卡，不阻断也不放行，agent 转去做计划内的其他工作。
- 长任务由 goal 加 `goal-round-driver` 推进（§2.1）；进度写在图里，会话崩溃后从图续上，goal 由人恢复。

### 4.7 汇合门禁

1. 测试证据：真实运行记录与退出码。
2. 检查器零新增告警（§7.6）。
3. 知识同步：改了代码，对应文档或节点同批变更。
4. 独立审查通过（§3.4）。
5. 主干永远是绿的。
6. 草稿区的临时脚本已删除或转正（§7.4）。

### 4.8 阶段状态机

每个阶段配三样东西：

- 告知：每一步注入阶段提醒，写明当前阶段、本阶段能做什么、离开本阶段还差哪几项。
- 门禁：在阶段切换与工具调用处检查证据，不看 LLM 自述。例：设计阶段拦下写代码的工具；五栏缺项不能离开设计阶段；「测试通过」必须有运行记录与退出码。
- 呈现：主 Agent 会话里输入框上方一条流程条（普通会话没有），标出当前阶段、缺项和主 Agent 是否在等人（例：「主 Agent · 设计 · 五栏 3/5 · 等你批准」，细则见本节末）；点开是右侧边栏的流程页，含当前方案、决策队列与决策日志（随 M8，流程条本身只显示，不响应点击）。

阶段的存储与转换〔2026-10-29 定，M3 设计 §2.4、§3.3.2；阶段模型已实现：`src/graph/stage.ts`，纯函数，宿主与客户端共用；转换由 `propose_to_human` 与 `record_human_answer` 的 `confirm`（第 8 步已实现）和 `release`（第 9 步已实现）承担，下表里的 `design_review` 与「卡」是 0.4 的写法，现在换成对话里的同意〕：

阶段存在目标与模块（目标的直接特性子节点，§4.9）的 `stage` 字段（§2.6）；模块的 `stage` 只经模块放行向前，主 Agent 可以把它退回 `design`（下）。主 Agent 的当前目标是焦点节点自身或它最近的目标祖先（`goalOf`）。

| 转换 | 谁写 | 在哪 | 门禁 |
| --- | --- | --- | --- |
| （无）→ `wish` | 主 Agent 提议目标时带上 | `graph_propose` | 无 |
| `wish` → `interview` | 主 Agent 改自己的提议 | `graph_edit` | 无 |
| `wish`、`interview` → `design` | 人在对话里同意，主 Agent 带原话记下，harness 重查门禁后改阶段、批准目标（还是提议时），两条写入都带人的原话，先改阶段后批准〔已实现，第 8 步〕 | `propose_to_human`（`confirm`）与 `record_human_answer`（`confirm`） | 需求卡 8 项都齐（§4.2），目标没有 `supersedes` 连线 |
| `design` → `release`（没分模块的目标） | 人在对话里同意，主 Agent 带原话记下，harness 重查放行门禁后批准放行集合、改阶段〔已实现，第 9 步〕 | `propose_to_human`（`release`）与 `record_human_answer`（`release`） | 放行门禁（下） |
| `design` → `release`（分了模块的目标，框架放行） | 同上；先给集合里的模块候选写阶段 `design`，再批准集合，最后改目标的阶段，每条写入都带人的原话〔第 9 步〕 | 同上，带 `page` | 大循环放行门禁（下） |
| 模块 `design` → `release` | 同上，批准模块子树里的提议再改模块的阶段，阶段写入的 `reason` 末尾带页的摘要〔第 9 步〕 | 同上，带 `module` 与 `page` | 模块放行门禁（下） |
| 模块 `release` 或之后 → `design` | 主 Agent 自己决定（第二档，可逆、只影响本模块），不要人的原话，`reason` 写原因、不得以「人在对话里同意」开头〔第 9 步〕 | `graph_edit`（引擎的一处例外；子 agent 与别的会话被 `main-agent-graph-stage` 拒绝） | 无 |
| 目标 `release` 或之后 → `design` | 人说框架要改，主 Agent 带原话（第三档） | `graph_edit` 加 `relay` | `main-agent-graph-relay` 核对原话 |
| 任意 | 人在面板以外改，或 LLM 带原话转述 | `graph_edit` 加 `relay` | 引擎规则 |

已批准的目标 LLM 与 harness 不能改（§2.9），所以 `design` 与 `release` 只能由人的动作写入。在 DSH 的会话里，向前改阶段和批准要人同意的节点，图工具一概不行（规则 `main-agent-graph-stage`，对所有会话，§6.9）；只有 `record_human_answer` 在核对原话、重查门禁之后直接写引擎。门禁读的是有效阶段（`effectiveStage`），不是字段原值：

| 目标状态 | `stage` | 有效阶段 |
| --- | --- | --- |
| 提议 | 没有，或 `wish` | `wish` |
| 提议 | 其他任何值 | `interview`（LLM 在自己的提议上写的阶段不算数） |
| 已批准、进行中 | 有 | 原值 |
| 已批准、进行中 | 没有 | 无：这个目标不走设计循环 |
| 完成、废弃、被取代 | 任意 | 无，另报目标已关闭 |

放行集合（`releaseSet`）是目标子树里除目标以外的全部提议节点，按深度、创建时间、id 排序，父节点在子节点之前。放行门禁全部成立才出五键卡：放行集合里至少有一个设计决策，每个设计决策五栏都齐（§4.3）；放行集合里每个任务都有验收条件；目标子树里没有未拍板的待决（不论决定者）；放行集合里没有带 `supersedes` 连线的提议（批准它会连带取代卡上看不到的节点，取代要人在面板上批或带原话转述）。设计决策一项也认目标下已经批准的决策：放行写了一半停下或有节点被跳过之后，再放行要从那里接着走，不能因为决策已批准就永远过不了门禁。分了模块的目标的门禁和集合见 §4.9。`stageStatus` 汇总一个目标的有效阶段、是否已关闭、缺项（需求卡与确认门禁，或放行门禁）、能否离开本阶段与等人拍板的待决数，阶段提醒、流程条与 `design_review` 都读它。

阶段提醒〔M3 第 5 步，`src/design/stage-notice.ts`；L2 `tests/design-stage-notice.spec.ts`，L3 场景 `glm-design-stage`、`glm-design-stage-compact`、`glm-design-released`〕：`stageReminder(graph, focus)` 从图和焦点读出正文，英文，中文原话与标签原样；`stageNotice` 决定这一步要不要带（规则在 `src/graph/digest-notice.ts`，每步投影用同一个：历史里还没有这个目标的提醒、正文摘要变了、压缩检查点在最近一条提醒之后或提醒锚在另一个检查点上、本步接纳了目标轮消息，才注入，原因记在 notice 来源的 `designStage.reason`：`goal`、`changed`、`compaction`、`goal-round`）。焦点来自图行服务的 `focusOf`（`src/graph/service.ts`，和每步投影看到的是同一个焦点）。读图或读焦点失败时这一步不带提醒，进程里警告一次，该会话的行健康写「阶段提醒这一步没带上」。提醒只给主 Agent：本步组装时判为主 Agent 的会话。

- 没有焦点、焦点不在图里、焦点上面没有目标：说主 Agent 还没有目标在焦点上，派出去的子 agent 只能读；刚许过愿就按访谈第 1 步提议目标并聚焦，否则 `graph_open` 找到目标或任务再聚焦。目标已关闭：写明状态，要聚焦一项没关闭的工作。已批准而没有阶段的目标：写「不走设计循环」。
- `wish`、`interview`：一行访谈的做法（一两个问题一问，用人的话，猜一个供挑，答完就写进图）；需求卡几项齐了；其余缺项各一行（标签与 `hint`）；一行「下一步」：缺项里访谈步号最小的一项的问句，步号相同按表次序（`problem` 在 `audience` 之前），不按需求卡数组的次序（它把约束排在成功之前）。问句取 §4.2 表的原文；第 7 步不是一句问话，写成「用 `propose_to_human`（`kind question`，`form` 取 `recommend` 或 `choose`）把只有人能定的那个岔路交给人，再用 `record_human_answer` 记下回答；自己定的不算」。缺项只有取代旧节点的连线时没有「下一步」，只列它的标签与 `hint`。8 项齐了写「用 `propose_to_human`（`kind confirm`）把需求交给人」。对照表是 `INTERVIEW_STEPS`，键与 `requirementCard` 的 8 个键一一对应，测试钉住。
- `design`：写图格式一行（每个设计决策正文里写「理由：」「架构：」「查过的现成方案：」，有验收和非目标；任务挂在目标下，以 `source` 连线指向决策，每个任务有验收；小项目的任务直接挂在目标下，只有各部分独立、要人一个一个放行的活才规划成目标下的特性即模块）；决策里五栏最少的那个有几栏；放行门禁的缺项各一行；门禁成立写「用 `propose_to_human`（`kind release`）把方案交给人」。目标下已有直接的特性（分了模块）时换成大循环的写法：框架写成目标下的设计决策，每个模块是目标下直接的特性并以 `source` 连线指向一个框架决策，人定的方向写成目标下 id 为 `norm-directions` 的一个规范节点的验收项；模块自己的决策和任务以后写在模块下面；这时缺项是大循环放行门禁的（§4.9），成立时「下一步」写「用 `propose_to_human`（`kind release`，`page` 列出框架、模块清单与方向）把框架、模块清单和方向交给人」，决策里五栏最少的那个有几栏只数框架的决策。两种设计阶段的提醒都多一行：决策正文可以另写一行「如果失败：<最可能的原因>」，放行给人看时在汇报里用人话说出来；这一行不是一栏，门禁不看它，缺了不拦，但解析时它结束上一节，所以空的「查过的现成方案：」后面接这一行，那一栏仍算空。
- `release`：没分模块写「方案已放行，向人说一句；分解与派发是下一步」。分了模块的目标放行之后写：框架、模块清单和方向已放行，每个模块从设计开始，在模块下写决策和规划，对照 `norm-directions` 的每条方向，用 `propose_to_human`（`kind release`、`module`、`page`）交给人，模块放行之前下面什么都不建；派写文件的子 agent 之前先把焦点聚到那个模块或它下面的任务上。后面逐行列模块，`<标题>（<id>）：设计中 | 已放行 | 退回设计`（退回设计由阶段从 `release` 之后改回 `design` 的历史认出），至多 8 行，多的写 `and <n> more`。焦点在一个模块里：模块在设计时写模块的写图格式（决策挂在模块下、规划挂在模块下、对照每条方向，在汇报里说出它顶着的方向）、同一句聚焦提醒、「如果失败：」一行，缺项（模块放行门禁的，§4.9）各一行，门禁成立时「下一步」写「用 `propose_to_human`（`kind release`、`module <id>`、`page`：一页人话）把这个模块交给人」；模块已放行写「这个模块已放行，向人说一句」。候选（还是提议的特性）按目标一级读。
- 其他阶段（`decompose` 起）：只写阶段名和不属于设计循环。最后一行：目标下有等人拍板的待决时写件数。
- 每个阶段的提醒末尾，图上的 `norm-delegations`（§3.1）有项时多一行：`The human told you to decide these kinds yourself and only report them, while the matter can still be undone: <各类用「；」连接，至多 20 项>.` 加收回的办法（`record_human_answer` 的 `delegation`，`undo: true`）；节点不在、没有项、已关闭时不写；节点不是规范节点时不写并让行健康说明一句。M5 的偏好合入后这一行与它的测试删掉。
- 访谈阶段的提醒说明访谈的问题在聊天里问、先猜一个写成「我猜你……，对吗？」让人改，不走 `propose_to_human`。
- 所有阶段的正文不含 `ask_user_question`、`decision_card`、`design_review`、`ask_human` 与「（推荐）」类字样，测试钉住；`stage.ts` 里两条原来点名 `decision_card` 的 `hint`（岔路一项，放行门禁里人定的待决未拍板）已改写为 `propose_to_human` 与 `record_human_answer` 的说法。

流程条与 `/wish` 入口〔M3 第 11 步，已实现 2026-10-30，L2：`tests/flow-bar.spec.ts`、`tests/wish-entry.spec.ts`；桌面版上的显示核对（L4）随 M3 第 12 步（b）〕：

客户端源码在 `ui/src/flow/`（流程条）与 `ui/src/wish/`（入口），属编排层客户端包 `dsh-hourness`，由 `ui/src/hourness-client.tsx` 注册三个槽项。所有给人看的字串集中在 `ui/src/flow/model.ts` 与 `ui/src/wish/model.ts`，组件里没有字面文字，改字句或位置只动这两个文件和 order 常量。`tests/wish-entry.spec.ts` 对两个文件导出的全部字串（带参数的字串用示例参数调用）和流程条用的阶段名跑 `plainWordsIn`（`src/graph/plain-question.ts`，换词表 `PLAIN_WORDS`），换词表里的词出现一个就失败；新字串放进这两个表里，自动被查。

| 槽项 | 槽与 id | order | 显示条件 |
| --- | --- | --- | --- |
| 流程条 | `conversation.input.dock`，`hourness-flow` | 30（DSH 排队条 20） | 本会话是主 Agent |
| 开场卡片 | `conversation.input.dock`，`hourness-wish` | 40 | 会话空白且工作区有项目图。本会话不是主 Agent 且 `/wish` 已注册时是完整卡片；本会话已是主 Agent 时是一行「这个会话的 agent 是主 Agent」和退出按钮（裸 `/wish` 不开回合，会话可能仍停在开场画面）；其余不显示 |
| 输入框下方的按钮 | `conversation.composer.dock`，`hourness-wish` | 160（DSH 统计 0、1，GLM 按钮 150） | 本会话是主 Agent；或工作区有项目图且 `/wish` 已注册 |

三者读本会话的投影值 `hournessMainAgent`（经 `mainAgentActive`）与 `graphLive`；项目图经 `holdSource` 与面板共用一份数据源；`/wish` 是否注册读 `remote.commands.list`，每个会话读一次，失败后在会话快照变化时再读一次。`hournessMainAgent` 由设计行 `glm-hourness/design` 注册；投影不在时 `mainAgentActive` 为假，流程条不出现，卡片与按钮因为 `/wish` 不在命令表里也不出现。客户端不读持有者记录。

流程条的文字由纯函数 `flowBarText` 算，格式 `主 Agent · <阶段> · <进度> · <等待>`。目标取焦点自身或最近的目标祖先（`goalOf`），焦点取自 `graphLive`，阶段取 `effectiveStage`：

| 情形 | 文字 |
| --- | --- |
| 没有 `graphLive`（graph-panel 行没启用） | 读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用） |
| 图读取中、工作区没有项目图、读取失败 | 读取项目图中；这个工作区还没有项目图；读不到项目图 |
| 没有焦点，或焦点链上没有目标 | 还没有目标 |
| 许愿、访谈 | `许愿 · 需求卡 5/8`、`访谈 · 需求卡 5/8` |
| 设计 | `设计 · 五栏 3/5`，取放行集合里五栏最少的那个决策；还没有设计决策时写「还没有设计决策」 |
| 放行 | 已放行 |
| 目标已批准、没有阶段 | 目标标题 |
| 目标已关闭 | `<目标标题>（已关闭）` |
| 分解、执行、汇合、运维 | 阶段名 |

等待：聊天式设计里主 Agent 用 `propose_to_human` 把事交给人，没有卡片可看，流程条用现场投影判断。回合已结束（`turnSince` 为空）且最近一次工具结果是成功的 `propose_to_human`，就是主 Agent 在对话里等人回话。后缀按阶段写：许愿与访谈「等你确认」，设计「等你批准」，目标子树里有等人拍板的待决时「等你拍板」（优先于前两种）。主 Agent 没在等、而子树里有等人拍板的待决时写「待你拍板 N」。`graphLive` 的 `recent` 只留工具名与成败，不留提议的种类，所以后缀是由阶段和待决数推出的，不是读出来的；放行阶段与不走设计循环的目标没有「等你确认」「等你批准」。

便宜档提醒：主 Agent 最近一步的模型 id 转小写、按 `[-_./:\s]` 切词，有一个整词是 `flash`、`mini`、`lite`、`haiku`、`small`、`nano` 之一时（`gemini-2.5-pro` 不算），流程条另起一行黄字「现在是 <模型>；主 Agent 建议换强一点的模型」和按钮「这次就用它」；按钮按会话记在页面内存里，到重载为止。认不出的模型不提醒。入口上的黄字固定为「主 Agent 用强一点的模型」，不带模型名。插件不替人换模型（`CHARTER.md` §6）。

入口的按钮：「写一句你想做的」在输入框为空时经标准 prop `inputActions.setDraft` 写入 `/wish ` 并把光标放到末尾；输入框有字时不改，提示「输入框里还有没发出的字」；拿不到 `inputActions` 或 `useInput` 时不执行任何命令，换成一行做法和「复制 /wish」。「接着推进现有项目」（图上有未关闭的目标时才有）和「退出主 Agent（/wish off）」经 `remote.commands.execute` 执行 `/wish`、`/wish off`，都是人的点击。输入框下方那一排窄于 520 px（`data-composer-dock` 的宽度）时，「交给主 Agent」写「/wish」。面板设计的 `FirstVisitLine` 还不在这个包里，完整卡片没有这一行；它合入后把 `ui/src/wish/WishCard.tsx` 里的 `FIRST_VISIT_LINE` 改为 `true` 并渲染它，它是完整卡片的最后一块。

限制：输入框下方的按钮要判断「有项目图」，所以对每个可见会话持有图数据源（与面板共用）；有图的工作区读全部节点文件并订阅目录变化，没有图的工作区只列一次目录。数据源遇到「没有图」不会自己重试：会话进行中才建出项目图时，按钮与卡片要等到面板的「重新读取」（数据源是共用的，面板重读它们一起跟上）或重新打开会话才出现。组件的渲染、标准 prop（`useSession`、`useInput`、`inputActions`）在第三方槽项里是否送到、弹层的定位没有单测，由 L4 在桌面版上核对。

### 4.9 两层循环：模块的读法〔M3 第 5 步一半，设计行默认启用〕

分了模块的目标走两层循环：先由人放行框架、模块清单和方向清单（目标一级的放行），再每个模块各放行一次（`d-design-onepage`）。图上没有新的节点类型和字段，`src/graph/modules.ts` 是纯函数（不用 Node 内置模块，宿主与客户端共用）：

- 模块：目标的直接子节点，类型 `feature`，带 `stage`，状态已批准、进行中或完成（`modulesOf`，按第一条历史的时间再按 id 排）。模块下面又挂带 `stage` 的特性是普通特性。
- 候选：目标的直接子节点，类型 `feature`，状态 `proposed`，带不带 `stage` 都算（`moduleCandidatesOf`）；目标一级放行时批准为模块。
- 框架：目标的直接子节点，类型 `decision`，状态已批准或完成（`frameworkOf`）。方向清单：id 固定为 `norm-directions` 的规范节点，没有关闭时才算（`directionsOf`）。
- `moduleOf(graph, node)`：节点自己或最近的、属于模块或候选的祖先；候选也返回，要用 `isReleased` 区分。`isReleased(module)`：已批准、进行中或完成，且 `stage` 是 `release` 或之后；候选和设计中的模块不算。完成的模块算已放行，所以完成的模块下面重开一个任务做返工不被挡。`isSplit(graph, goal)`：有模块或候选。
- 目标一级的放行（`propose_to_human`/`record_human_answer` 的 `release` 不带 `module`，〔第 9 步〕）：放行集合 `bigLoopSet` 是目标子树里不在模块或候选下面的全部提议加候选自己，门禁 `releaseGate` 按 `isSplit` 分两支，分了模块的是大循环的：目标在 `design`；框架（目标下已批准的设计决策，或集合里的决策）至少一个；方向清单 `norm-directions` 至少一条；集合里每个决策五栏齐、每个任务有验收；模块以外的待决（含集合里节点 `source` 指向的）都拍了板；没有取代旧节点的连线。写入次序见 §3.1：先给候选写 `design`、再批准、最后写目标的 `release`，停在哪一步目标都还是分了模块的。目标在这一刻进 `release`，各模块还在设计。
- 一个模块的放行（带 `module`，〔第 9 步〕）：模块集合 `moduleSet` 是模块子树里的提议，门禁 `moduleReleaseGate`：目标已到 `release`；有要放行的内容（集合不空，或下面已有批准的节点——放行停在批准之后、模块被退回设计之后；模块下的决策都已批准时也算）；模块下直接挂着一个设计决策；集合里每个决策五栏齐（规划是模块子树里连到它的节点）、每个任务有验收；模块子树里的待决都拍了板；没有取代旧节点的连线。同意之后批准集合、模块进 `release`，不动别的模块、方向清单和目标。
- 退回（〔第 9 步〕）：主 Agent 用 `graph_edit` 把模块的 `stage` 改回 `design`（第二档），引擎只给这一个例外——`llm` 与 `harness` 不带原话时，节点是模块（目标的直接特性、已批准或进行中）、`set` 只有 `stage: design`、现在的阶段在 `release` 或之后、`reason` 非空且不以「人在对话里同意」开头（那是 `invalid`，退回不是同意），历史记 `from`、`to`；规则 `main-agent-graph-stage` 的 e 只放主 Agent，子 agent 与别的会话被拒并告警（§6.9）。模块下已批准的节点保持已批准，新的设计以提议加进模块子树，再放行时集合可以是空的。整个目标退回 `design`（第三档）要人的原话，之后目标下的子 agent 一律只读，再放行时集合可以是空的，只给这次新批准的候选写 `design`，已放行的模块不动。
- 还没放行的模块下的任务不再出生就是已批准：引擎的 `initialStatus` 对挂在还没放行的模块或候选下（不论多深）的 `llm`、`harness` 提议的任务给 `proposed`，模块放行之后挂的任务照旧直接批准；带原话的提议（`human` 与 `relay`）一律已批准，由 `main-agent-graph-stage` 的 d 拦下。这让 M7 只派已批准的任务这一道挡得住还没放行的模块。
- 本仓库的图〔R5b-N1，第 9 步定，**图上的改动没有做**，由编排方做〕：`hourness`（阶段 `execute`）下的 `orch` 是包一级的特性、已批准、带旧阶段 `design`，按上面的读法它是目标的一个没放行的模块，`m3`、`dogfood`、`m7` 等挂在它下面的节点都读成在那个模块里；`glm-house` 下的 `bottom`（阶段 `execute`）是已放行的模块，不受影响。不处理的后果（拿 2026-11-01 的 `docs/graph` 副本读，没改仓库的图）：焦点在 `m3` 或 `orch` 时 `design-before-release` 拒绝派出去的子 agent 写文件，越界一句点名模块 `orch`；M7 的 `releaseOf` 对 `orch` 下的任务返回「模块没放行」，派发停；`main-agent-graph-stage` 的 c、d 拒绝 DSH 会话里批准或带原话提议 `orch` 子树的节点，也拒绝在 `hourness` 下带原话提议新特性；`orch` 下新提的任务出生为 `proposed`；子树的阶段投影读成 `design`。处置是清掉 `orch` 的 `stage`：它不是两层循环意义上的模块，`hourness` 因此不再是分了模块的目标（`m0` 是没有阶段的已完成特性），子树改读 `hourness` 的 `execute`，`m2` 保持 `release`，`bottom` 不变，上面几条的判定回到今天以前的样子（放行、派发、批准、任务出生为已批准）。没选改成 `execute`：那是声称人放行过这个模块，而两层循环那时还不存在，`hourness` 也仍读成分了模块的目标；没选「方向清单存在才认模块」的代码开关：先提模块候选、后提 `norm-directions` 的次序里，分了模块的目标会落进单层放行，一次批准所有模块子树。要执行的命令（在 DSH 之外；清阶段带人的权限，`llm` 单独改不动已批准特性的阶段，所以带 `relay`，或由编排方在人同意之后以 `human` 调引擎）：`npm run -s graph -- edit '{"id":"orch","rev":"<orch 当前的 rev>","set":{"stage":null},"reason":"orch 是包一级的特性，不是两层循环意义上的模块，清掉旧的 design 阶段（R5b-N1）","relay":"<人同意清掉的原话>"}'`。主 Agent 第一次在这个仓库的 DSH 里跑之前必须做完。M7 的 `src/graph/execute-stage.ts` 里有一段标明 STAND-IN 的同签名替身（§17.2），m3 合入 main 时换成这个文件的导入。

## 5. 决策卡

申报、待批、L3、设计放行本质上都是「需要人拍板的决策」，区别只在急不急，合并为一种决策卡〔定案〕。

〔2026-10-29 `d-chat-not-cards`，2026-10-31 `d-ask-three-gates`；M3 第 6 步实现，设计行默认启用〕主 Agent 模式下，要人定的事不再是卡片：主 Agent 在对话里问（`propose_to_human`，§3.1），待决仍作为提议式待决留在图上、出现在决策队列里（§2.6、§2.9），人当场或之后在同一个对话里回话，主 Agent 带原话记下（`record_human_answer`）。面板对它只看不点。下面的表格卡版式仍用于 agent 自己定的待决与旧待决。

| 形式 | 场景 | 行为 |
| --- | --- | --- |
| 同步 | 出工作区操作（写文件的那一类走下面的申报通道）、往工作区外装工具 | 阻断当次操作，等人批 |
| 异步 | 计划外决策、规范升降级提议、放宽检查配置 | 不阻断，agent 转做计划内工作；进入队列。第三次修复不走这一行：它由 harness 在节点下提一张提议式待决等在队列里（§2.4） |

guard 的申报不走卡（`d-chat-not-cards`；2026-11-04，m4 任务 `m4-request-card`，设计与状态见该任务的设计 §5）。圈禁、`checker-config`、`scratch-only` 拦下一次写入时，纠偏带一个申报编号；agent 调 `request_exception`（guard 行注册，GLM 路由上经检索延迟、`DeferredToolCall` 调用）换出一段由 harness 写好的四行方案——题目带解析后的路径，背景、推荐、疑问、不做四行，「附」里是文件事实与 agent 的三句原话，问话在最后——原样放在回复末尾，结束回合。人的下一句话就是回答：它要同时满足来自 DSH 客户端（`source.kind: 'user'` 且带 `rpcId`）、紧跟在以这段文字结尾的助手消息之后、恰是「可以」一类的整句同意词，才放行——同一个调用（同工具、同参数，按派发链的根匹配）在 30 分钟内放行一次；使用时重新核对目标的事实，变了就作废；目标存在且不大于 10 MiB 时先把旧内容备份到项目的 `requests/`。其余回话——不明确的、不是客户端送来的、人没有刚读过文字的——都不放行，只计数。放行只存在内存里，由 harness 读人的消息之后写入，违规流水只留痕，进程重启即丢，agent 重新申报。申报的开与关写成会话日志里看得见的形状（`ask` 结果与带 `request: {ref, outcome}` 的提醒），面板「需要你」从日志列出开着的申报，只看不批。

- 卡面是一张表〔定案 2026-10-29，决策 `d-option-card`；人：「就改成表格，用「取决于」加一行条件，替换掉「为什么」和「反方」两行」〕，从上到下：

  | 部分 | 内容 | 字段（§2.6） |
  | --- | --- | --- |
  | 题目 | 要决定什么 | `title` |
  | 取决于 | 题目下面一行：只有人知道答案的那个关键问题 | `crux`，一行，不超过 60 个字 |
  | 表格 | 表头「选项 / 怎么做 / 得到 / 代价」。怎么做是一眼能看懂的加粗短语；得到与代价各一行，写数字与具体例子，不写评价词；每个选项都有一项别的选项给不了的得到，不放凑数的选项。推荐项在最后一行 | `options` 的 `key`、`label`（不超过 20 个字）、`gain`、`cost`（各不超过 60 个字） |
  | 对比列 | 可选，至多一列：几个选项真正不同的那个维度；所有行都一样的列不放 | `dimension`，列名不超过 12 个字，每格不超过 20 个字 |
  | 结论行 | 表格下面一行「是 → X；否 → Y」，X、Y 是选项 | `verdict`，一行，不超过 120 个字，点名推荐项 |
  | 单向门提示 | `weight` 为 `one-way` 时多一句「以后改起来很贵」 | `weight` |
  | 来源 | 提出它的节点与来源连线 | `parent`、`edges` |

  「取决于」与结论行取代了原来的「为什么」与「反方」两行（`d-counter-line`）：先让人想清楚关键条件，再看推荐，抵消人跟随 agent 倾向的效应。论证与依据写在正文，「讲细点」时才展开。每张卡恰好一个推荐，推荐项排在最后一个选项（决策 `d-recommend-last`）。卡面按存储顺序列出选项，推荐只是推荐项上的一个标记，不做成能跳过其余选项的捷径（例如置顶推荐项，或单独一个「按推荐」按钮）。agent 自己拍板的卡（`decider` 为 `agent`）可以不写「取决于」、结论行与 `weight`。图上的待决由引擎核对（§2.6）；面板上的表格版式交给 `m8-plain-language`。编排方在对话里给人的选项也照这个格式写。
- 问题必须问在项目经理这一层：不带选项、得到与代价，或问的是代码层面问题的卡，被打回重写。
- 批准只放行当次，不产生残留授权，界面不提供「以后都允许」。
- UI 上只有一个决策队列；积压量与处理时长是度量，等待人拍板的卡也要提醒人。
- 同步卡借用 DSH〔实读〕：`approval.request`（`dsh-user-approval` 128 行）只有「允许一次 / 拒绝」，返回 `allowed-once`、`rejected`、`cancelled`、`unavailable` 之一，必须在打开的回合内调用，没有应答者时失败即拒，与「批准只放行当次」一致。需要多个选项与推荐的同步卡用 `userQuestions.ask`（`dsh-user-questions` 668 行）：卡面有短标题、问题、Markdown 详情、带一句说明的选项、自由文本与跳过，放不下表格，也没有「来源节点」这类结构化字段。表格卡按这个形状写：选项按钮写选项字母加加粗短语，选项说明写得到与代价，问题说明写「取决于」一行，结论行与来源节点写进详情。两者都阻塞当次工具调用；子 agent 调用都被拒（§3.2）。
- 异步卡自建〔定案 2026-10-28〕。rc.3 没有插件可用的异步通道：行动卡片只在 DSH 主干（`main:packages/experimental/action-cards`），rc.3 没有这个包；插件自己调 `userQuestions.askTimed` 时，超时后投影不跟踪这次调用，晚到的答复丢失（`dsh-user-questions` 199–201、552 行）；第三方也不能新增转发给客户端的 waterfall（`dsh-api-remotes/README.md` 77–78 行）。做法：
  - 存储：异步卡就是图上的待决节点，存在节点文件里，跨回合、跨重启都在。
  - 呈现：回合末尾卡片、右侧栏决策队列、输入框上方条显示待批数（§13）。
  - 回写：人拍板时客户端经命令通道调用本包的命令，宿主侧写回节点文件，再向 agent 送一条用户角色消息，运行中用 steer、空闲时用 followup（会开启新回合），来源用本项目自己的 `kind`。命令运行记入会话日志、不进模型（`dsh-commands/README.md` 12、88 行），同时充当审计流水。
- 取代现有的 L1/L2/L3 分级〔已实现，M3 第 10 步，项目图 `m3-5`〕。代码里没有 `gradeDecision`、`DecisionLevel`、`FIVE_KEYS`（`src/workflow/decisions.ts` 整个删去）；决策流水 `<项目目录>/audit/decisions.jsonl` 的记录是 `{at, kind, subject}`（`DecisionRecord`，`src/memory/audit.ts`），旧记录里的 `level` 读入时忽略。

  晨报（`/hourness`，`src/workflow/morning-report.ts`）按顺序分三块：「例外」（违规，没有分级行）、「等你定的事」、「用量」，有影子记录时另有一节。「等你定的事」四行：等你定的件数与最早一件的提出日期（本地日期）；agent 自己要定的件数；本期拍板的次数，按拍板者分为「你」「你在对话里说」「agent」；派遣类调用次数（取决策流水，只数 `kind` 为 `dispatch` 或 `dispatch:` 开头的记录）。前两项取 `openItems()` 的 `questions` 与 `agentQueue`；拍板次数不取 `recentDecisions`（它最多 20 条，每张待决只留最后一次），而是扫全部待决节点的历史里 `op` 为 `decide` 且 `at` 在本期内的每一条：`actor` 为 `human` 记「你」；`actor` 为 `llm`、`reason` 以 `ANSWER_MARKS.agree` 开头（`record_human_answer` 写的同意，`answerKindOf`）并且带 `relay`（harness 核对过的人的原话）记「你在对话里说」；其余记「agent」，包括只带 `relay`、没有标记的旧式转述（原话没经 harness 核对）和只有标记、没有 `relay` 的写入。本期是本地日历日。图由 `/hourness` 的调用会话经图行服务 `dirFor(cwd)` 找到；图行没启用、会话没有工作目录、目录不存在或读图出错时，这一节写「项目图读不到：<原因>」，其余照常（派遣类调用次数仍在，它不取自图）。验证：`tests/workflow.spec.ts`、`tests/hourness.spec.ts`（夹具里本期拍板 25 次，计数 25，不被 20 截断；读不到图的四种原因；旧记录带 `level` 照常读）；L3 场景 `glm-design-question` 的最后一步经 `/hourness` 的处理函数核对输出。

## 6. guard：门禁与正路

### 6.1 规矩即数据

每条规矩是一组数据：告知（提示词或阶段提醒）、探测（执行前后的判定器）、纠偏（四段式：事实 / 越界 / 正路 / 例外）、申报（编号与申报通道，§5）、记录（违规审计）。

现状〔已实现〕：探测与纠偏已接通；记录已接通（2026-10-28）：每次拦截写进项目目录的违规流水 `<项目目录>/audit/violations.jsonl`，项目目录按 `projectHomeFor`（`src/data/project-home.ts`）取：guard 行的 `home`，没有就取会话工作目录所在项目的 `<检出根>/.llm`（`projectOf` 把 git 工作树归到主检出），再没有取数据目录服务的（`DESIGN.md` §2.4；次序钉在 `tests/data-home.spec.ts`），L3 探针实测；告知已接通（2026-10-28，`ROADMAP.md` M1.8）：系统提示词最后一节 `glm:guard`（标题「Workspace rules」；2026-10-29 起每条路由都有，此前只有 GLM 路由，§6.2）逐条列出生效的规则，每条一行，取自规则的声明文本；会话没有工作目录时圈禁规则不生效，也不声明；主 Agent 的会话不列 `file-tools-only` 这一行（2026-11-02 修，评审 S4-4：它的边界由身份节守着，那一行会叫它用它没有的 Write/Edit）。规则是常驻的，所以放在系统提示词（§9.2 的提示词一级），不随每步变化，不影响提示词缓存（`DESIGN.md` §5.2、§6）；随阶段变化的规矩以后走阶段提醒。申报已接通（2026-11-04，m4-request-card G4）：圈禁、`checker-config`、`scratch-only` 的拒绝带申报编号——编号在 guard 行的 `rules()` 里为每次文件工具写入预先生成（8 位 base36），被拒时才登记进内存的拒绝表，违规记录带 `ref`；例外段按调用方给写法：根 agent 是 `request_exception` 的调用写法（§5），普通子 agent 把编号交回派发它的 agent，M7 的 worker 由它的外层门经 `glmHournessRequests` 的 `outsideDenial` 取句。圈禁顺带补上 `str_replace_editor` 的写入判定（`create`、`str_replace`、`insert` 的 `path`，`view` 仍放行）。`file-tools-only` 管的是习惯，不可申报，例外段仍是 2026-10-29 的「Build, test and git commands … If this command writes no file, say so in your reply: the denial is recorded for review.」那句；`suppression-reason` 的出路是它的正路。2026-10-29 之前纠偏的例外段要模型「file a request」，系统中无处提交；圈禁与 file-tools-only 曾都写「tell the human what you need, where and why; only the human can allow it.」，圈禁那句已被申报句取代（git 历史可查）。2026-10-28 之前已知至少 3 次拦截没有留下记录，因为该行没有数据目录，回调也无法从配置传入。

工具名〔已实现 2026-10-29，split 第 2 步〕：规则只认 DSH 原生工具名（`write`、`edit`、`str_replace_editor`、`pwsh`、`bash`、`terminal_send`），判定之前把调用名换成它实际执行的原生工具：先问 GLM 方言提供的方言服务（`glmHournessDialect`，`src/shared/dialect.ts`，由 `glm-prompt` 行提供），服务不在、或它不认识这个名字时，查公共库里的静态别名表 `ZCODE_ALIAS_NATIVES`（`Write` → `write`、`Edit` → `edit`、`Bash` → `pwsh` 等，与 DSH 原生工具名都不重名），都没有就用原名。所以服务缺席时拦截不变，GLM 的 `Bash` 照样按 `pwsh` 判。换算在 guard 行的 `tools/pre-execute`、图文件门禁与影子兜底三处做；图工具不换算（没有别名）。违规与影子记录里的 `tool` 仍写模型调用时用的名字。纠偏与 `glm:guard` 声明里的工具名按模型看到的写：方言服务说它接管了这个 agent 在这条路由上的请求（`claims`）时用方言的名字（`write` → `Write`、`read` → `Read`），文案与之前逐字相同，提示词缓存不受影响；否则用原生名。规则接口为 `detect(call, face)`，`declare` 是字符串或按 `face` 取名的函数；`file-tools-only` 的声明与正路用函数形式，圈禁与 `graph-files-only` 不含文件工具名，仍是字符串。配置追加的规则（guard 行 `config.rules`）按旧接口写照样成立，从这一步起收到的 `call.name` 是原生名。服务的值形状不对、或某个方法抛错时，这次调用按服务缺席处理（拦截照常、文案用原生名），控制台报一次，guard 的会话健康写「方言服务不可用」。静态表不看路由：别的插件若注册了与 ZCode 别名同名的工具，也按对应的原生工具判；今天的组合里只有方言注册这些名字。验证：L2 在 `tests/guard-audit.spec.ts`（有、无服务，服务形状不对，没装上方言的 agent）、`tests/graph-guard.spec.ts`（有、无服务时 `Write` 与 `Bash` 写图文件都被拒）与 `tests/contracts.spec.ts`（静态表与方言自己的别名定义一致）；L3 探针 `glm-no-dialect`（覆盖层禁用 `glm-prompt` 的 GLM 会话：工具面是原生工具，`pwsh` 写文件被拒，纠偏与声明写 `read`、`write`、`edit`），`glm` 场景的纠偏仍写 `Read`、`Write`、`Edit`。

圈禁的路径判定〔已实现 2026-10-28〕：相对路径按会话的当前工作目录解析（rc.3 `workingDirectory.get(session)`，文件工具也按它解析，`cd` 会移动它），没有这个服务时取会话目录，再没有取第一个圈禁根；解析用 `path.resolve`，与 rc.3 `dsh-fs-local` 在 Windows 上的 `localDisplayPath` 相同，`..` 一并折叠。圈禁根仍是会话目录本身，不随 `cd` 移动。此前只做大小写与分隔符的归一化：相对路径一律判为工作区外（L4 中 GLM 写 `.llm/l4-dsh/calc.mjs` 被拒），`C:\ws\..\elsewhere` 这类写法反而能通过。拒绝文案在相对路径时附上解析后的绝对路径。

### 6.2 作用范围

guard 跟着编排层包 `dsh-hourness` 走：包启用时，所有路由、所有模型发出的调用都按规则拦截，所有路由的系统提示词都带规则声明；包不装时都没有〔定案 2026-10-29，项目图 `question-14` 选 G3，人的原话：「围栏到时候跟着编排层走吧，拦全部的。开编排层就全生效，不开就全不生效。」〕。它取代 2026-10-28 的定案「先只作用于 GLM 会话，误伤清零后再考虑放开」及其实现（按会话请求头只拦 GLM 调用，`DEVELOPMENT.md` §7 那次 L4 事故的修复），旧文本在 git 历史里。规则本身不是新的，扩到其他路由时直接拦截，与所有规则一样从启用起就拦（`CHARTER.md` §3.2 第 3 条、§6；§6.5）。子 agent 的出界请求默认拒绝，由主 Agent 汇总后统一向人申报。DSH 在宿主层已是这样：委派出去的子 agent 审批策略固定为 `never`，`userQuestions.ask` 拒绝子 agent 调用（§3.2）。

实现〔2026-10-29，split 第 7 步〕：

- 拦截不看路由。宿主本来就不按路由分发：agent 循环把模型发出的每个调用连同发起它的 agent 交给工具服务（rc.3 `dsh-agent-loop` lib/index.js:506–517、582），`tools/pre-execute` 瀑布跑在按作用域过滤的载体上，没有作用域标记的宿主层监听器收到每个 agent 的调用（`dsh-tools` lib/index.js:3320–3321，`dsh-scope` lib/index.js:327–335）。guard 行与图文件门禁（§2.7）判定每次根调用；带 `parent` 的传输层子调用放行。没有 agent、或会话还没有请求头的根调用同样判定；rc.3 里模型发出的调用都带 agent，并且在请求头写入之后才执行，所以今天的组合里遇不到这两种〔推断〕。
- 路由只决定两件事。一是纠偏与声明里的工具名（§6.1）：方言接管这个 agent 在这条路由上的请求时用方言名，否则用原生名。二是违规与影子记录里的来源（`src/guard/origin.ts`）：`scope` 为 `dialect`（方言接管）或 `other`（GLM 路由但方言不在，或其他模型），`route` 是发起调用那一步的 provider 与 model（会话请求头 `src/shared/route.ts` `sessionRoute`：agent 循环在每步调用模型之前写请求头，`dsh-agent-loop` lib/index.js:1226，`Session.requestHeader()` 折叠这些事件，`dsh-session` lib/index.js:1612；会话没有请求头时省略）。第 7 步之前写下的记录没有 `scope`，按 `dialect` 计：那时只有 GLM 路由被判定。编排层不再有模型族判定。
- 声明：每个 agent 的每次组装都在最后加 `glm:guard` 一节（§6.1）。宿主只渲染节的文本、不渲染节名（`dsh-system-prompt` lib/index.js:117–118），所以名字照旧。非 GLM 路由上的这一节与方言不在时 GLM 路由上的逐字相同。升级前已开始的 DeepSeek 会话在下一步多出这一节：DeepSeek 官方模型声明 `systemPromptUpdate: "in-history"`（`dsh-llm-deepseek` lib/index.js:19–25），提示词的变化作为历史里的系统更新发出（同文件 :1677），前缀缓存不断〔推断：agent 循环怎样算出变化（`dsh-agent-loop` lib/index.js:1057–1058）没有读〕。规则行启用时（它提供服务 `glmHournessRules`）这一节末尾多一行规则板的声明（`RULES_DECLARATION`，§16.11），行卸载时随之消失；这一行不随规则变化，不影响缓存。
- 行健康：每次判定都报「门禁生效 …」，不再有「非 GLM 路由，门禁不介入」。
- 误伤怎样看：file-tools-only 的探测按 GLM 与 ZCode 的习惯调过，在其他模型上的误伤率还没有数据。晨报把 `scope: other` 的拒绝与影子记录另行计数（「违规 file-tools-only（其他路由） × n」），人看着这组数决定要不要调整规则。
- 不装编排层包时：拦截与声明只来自 guard 行、图行注册的图文件门禁，以及 guard 行里的影子兜底，三者都在 `dsh-hourness`；GLM 包没有 `tools/pre-execute` 监听器，也不加规则节。人在插件管理器里单独禁用 `guard` 行是行级的选择，图文件门禁照旧跟着图行走。
- 已知边界：用 complete persona 的 agent（例如 DSH 的预设 minimal，`dsh-web-app/presets/minimal.patch.yml`:15）只保留 persona 一节（`dsh-system-prompt` lib/index.js:399–403），声明被宿主丢掉，拦截照常；预设 minimal 还关掉了 `read`、`write`、`edit`（同一文件 :18–23），shell 写文件被拒后，纠偏里的正路是它没有的工具。GLM 在这个预设上本来就是这样；按 agent 的工具面决定 file-tools-only 是否适用属于新的规则特性，另行决定。
- 验证：L2 `tests/guard-audit.spec.ts`（DeepSeek 路由上的拒绝与原生名纠偏、没有 agent 与没有请求头、会话中途换模型时的来源、非 GLM 回合的影子记录、混合路由回合的归组、所有路由的声明）、`tests/graph-guard.spec.ts`（图文件门禁记录的来源）、`tests/workflow.spec.ts`（晨报的分组）；L3 探针 `non-glm-guard`（`pwsh` 写文件被拒，记录 `scope: other`、路由 `glm-probe/deepseek-probe`，guard 健康「生效」）、`non-glm`（系统提示词以原生名的规则声明结尾）、`hourness-only`（只装编排层包时两种拒绝都在）、`glm-no-dialect`、`glm`、`glm-shadow`（记录的 `scope`）、`glm-only`（只装 GLM 包时没有规则声明）。

### 6.3 正路

每道门禁配一条正路，并让正路在当下最省力：

- 拦 shell 写文件时，直接给出 Edit 的用法。
- 设计阶段拦写代码时，给出「提议节点」的工具。
- 简报门禁从节点自动预填。

度量：拦截后下一步走对的比例，量的是门禁有没有教会模型。每次拦截之后，同一 agent 下一步里模型发出的第一次调用记一条跟进，分走对了正路、原样重试、做了别的、没有下一步四种：GLM 上经 `DeferredToolCall` 包装的调用先拆开再比，和被拦调用同一步发出的不算，回合结束或会话卸载时还没有下一步的记「没有下一步」，跟进、申报、放行、撤下这些记录不算进晨报的违规数〔已实现 2026-11-04，m4-gate G2；`src/guard/followup.ts`，探针场景 `guard-followup`〕。晨报按规则写「拦截后下一步走对 x/y（另有 n 次停下来交给人或上级）」，分母不含「没有下一步」，因为停下交人有几种拒绝的正路就是它（§6.5）。

### 6.4 规矩清单

| 规矩 | 在哪实现 | 状态 |
| --- | --- | --- |
| 工作区圈禁：写操作只在工作区内 | guard 行 `workspace-containment` | 已实现，随行拦；2026-11-04 补上 `str_replace_editor` 的写入判定；可申报（拒绝带编号，§5 的申报通道） |
| 文件修改只用专用工具：shell 不写文件 | guard 行 `file-tools-only` | 已实现，随行拦；2026-10-28 改为识别引号（`=>`、`>>>`、`->` 误判已发生 3 次）：只看命令位置与引号外的真实重定向，git 子命令放行；漏网的 shell 写入由工作区变更兜底在回合结束时记晚到的拦下并在下一步纠正（§6.5.2） |
| 设计阶段不写代码 | M3 `design-before-release`（`src/guard/design-release.ts`，§6.8） | 生效（`question-25`）；计划模式不拦工具，所以不用它 |
| 转述的人话要在人发来的消息里；不给人列选项表；「这类你定」只经记录工具写 | M3 `main-agent-graph-relay`、`main-agent-graph-options`、`main-agent-graph-delegations`（§6.9） | 生效（设计行默认启用） |
| 目标只经确认需求与放行方案向前；会话里不用命令行写项目图 | M3 `main-agent-graph-stage`、`main-agent-graph-cli`（§6.9） | 生效（设计行默认启用）；放行方案那一半与模块的几支随第 9 步生效：模块和目标一样只经放行向前，模块下的批准与带原话的提议、新模块、清模块的阶段都被拒，退回设计只放主 Agent |
| 主 Agent 不写文件 | M3 `main-agent-no-write`、`main-agent-ask`、`git-snapshot`（§6.7） | 生效（`question-25`）；带 `parent` 的嵌套子调用同样过规则（2026-11-02 修，评审 S4-1、S5-1、S6-2、S8-3） |
| 图文件只经图工具修改 | 图行 `graph-files-only`（§2.7） | 已实现，随行拦（L3、L4 后默认启用） |
| 临时脚本只在草稿区 | M4 `scratch-only`（`src/guard/scratch.ts`） | 启用即拦；可申报 |
| 压制注释必须写理由并挂节点 | M4 `suppression-reason`（`src/guard/suppression.ts`） | 启用即拦 |
| 放宽检查配置走决策卡 | M4 `checker-config`（`src/guard/checker-config.ts`）；被拒的写入经 `request_exception` 申报 | 启用即拦；可申报 |
| 同一处第三次修复问人 | M4 图工具：第 3 次重开（第 3 次修复开始）时提一张提议式的人定待决，主 Agent 放进下一批问人；循环板列出 `graph.third-rework`（§6.8） | 已实现（`src/graph/reopen.ts`，`graph_status` 交 notice；2026-11-04）；只问人，不拦 |
| 子 agent 只写任务节点的写入范围 | M7 `worker-scope` | M7 定；接缝已经 L3 核实（2026-10-28，§3.2） |

读凭证文件不在表里，也没有规则（m4 设计 §4.2：读不拦，M4 只拦写检查器配置）。

### 6.5 新规矩直接拦截

规矩从它所在的插件行启用那天起就拦，写在代码里的也一样。没有只记录不拦的试运行期，没有影子判定，也没有按样本数或天数把规矩转为拦截的台阶〔定案 2026-10-31，项目图 `d-code-rules-enforce`，人的原话：「试运行规则啥的直接拦就行了，这样反而有问题好发现」〕。它取代此前的定案「新规矩先只记录、不拦截，测出误伤率，误伤足够低再生效」，旧文本在 git 历史里。

错拦靠看得见和撤得快来发现与纠正：

- 每次拦截带规则 id 与来源 `scope`、`route`（2026-10-29 起，§6.2）写进违规流水〔已实现〕；晨报按规则列出，并把 `scope: other` 的拒绝另行计数，规则名后加「（其他路由）」，没有 `scope` 的旧记录照原来的写法计〔已实现〕。规则页列出同一份记录，属于整块规则板，今天只有最小一片（§16），还没有规则页〔规划〕。
- 误拦看得见：晨报每条被拦过的规则一行——拦下几次、最近一次拦下的样子（工具、命令或目标的前 60 个字符、时刻）、拦截后下一步走对的比例，原样重试过的把次数列在同一行；命令行 `npm run -s guard -- records`（按规则列出每次拦下的完整记录）与 `stats` 读同一份统计 `ruleStats`〔已实现 2026-11-04，m4-gate G2；`src/guard/measure.ts`、`src/guard/cli.ts`，命令行见 `DEVELOPMENT.md` §15〕。
- 用户对主 Agent 说一句话，或敲一条命令，就能撤下一条规则；撤下的动作按宪章 §7.1 条款 11 留痕，记下时间与原话〔已实现 2026-11-04，m4-gate G3〕。两条路：对话里人对主 Agent 说一句话，主 Agent 调 `guard_lift`（工具核原话确在人最新一条消息里，一条消息至多撤一条，拒绝时给出不说这个就别再问的话术）；规则板的 `/rules lift <行>:<规则>` 直接改（经服务 `glmHournessLifts`，不核原话）。两条路都往项目的 `docs/guard/lifts.jsonl` 追加一行 JSON（时刻、规则、动作、经哪条路、原话或命令），文件在每次检出里各有一份，规则 `lift-files-only` 拦人手与 agent 对它的改写（它只能经规则板撤下），缓存按文件 stat 失效。撤下按文件的最后一行算：恢复一行就拦回来；文件不在等于没有撤下。哪条规则只能经哪条路撤由目录的 `liftVia` 定（`any` 两路都行，`board` 只认规则板，现在是 `lift-files-only` 自己）。
- 新插件行默认禁用，验证通过后才启用（`AGENTS.md`）。这一条管插件行，不管行里的规则：行一启用，行里的规则就拦。

只能在事后发现违规的检查拦不住调用，不能当规则用。今天只有一个，§6.5.2 的工作区变更兜底：它在回合结束时才看得见 shell 写入，那时调用早已执行。M4 把它定成「晚到的拦下加下一步之前的纠正提醒」（§6.5.2）：记录照写，纠正交给 agent 的下一步，不假装拦住了。

#### 6.5.1 file-tools-only 的引号感知探测〔已实现 2026-10-28，`ROADMAP.md` M1.8〕

`src/guard/shell.ts` 按 PowerShell 与 POSIX 两种方言读命令文本：引号、PowerShell here-string、POSIX here-document、注释与算术表达式里的内容都是数据，不当语法看。判为写文件的只有两类：

- 引号外指向文件的重定向：`>`、`>>`、`N>`、`*>`、`&>`、`>|`、`<>`。流合并（`2>&1`、`>&2`）、空设备（`$null`、`/dev/null`、`NUL`）与输入重定向不算。
- 命令位置上的写文件命令，命令集与改造前相同：`Set-Content`、`Add-Content`、`Clear-Content`、`Out-File`、`Tee-Object`、`New-Item`、`Copy-Item`、`Move-Item`、`Remove-Item`、`rm`、`mv`、`cp`、`rmdir`、`dd`、`touch`、`truncate`、`tee`、`sed -i`。参数位置的词不算命令，所以 `git rm`、`echo rm`、`rg "=>"` 都放行。

命令位置包括：每个管道段与命令列表的开头、赋值与关键字之后（`FOO=1 rm`、`then rm`、`$null = New-Item`）、包装命令之后（`sudo`、`env`、`xargs` 等）、`find -exec` 之后，以及子表达式、命令替换、进程替换的内部；`bash -c` 与 `pwsh -Command` 的脚本参数按对应方言再读一遍。工具与方言：`pwsh`（`Bash` 别名换算后就是它，§6.1）按 PowerShell，`bash` 按 POSIX，`terminal_send`（参数是 `text`，此前误读 `command`，终端输入从未被检查）两种都判，因为终端后端可以是 bash 或 pwsh。拦截文案的「事实」一句写明命中的是哪个重定向或命令，违规流水里随纠偏文本记下。

与改造前相比：引号里的箭头与运算符、`> $null` 不再误拦；`echo hi>out.txt`、`2> err.txt` 这类贴着写或带流编号的真实重定向改为拦截（原正则漏掉）；参数位置上的 `rm` 等（`git rm`、`echo rm`）不再拦截，`find -exec` 后面的命令照样拦。命令集没有扩充：PowerShell 别名（`del`、`ri`、`ni` 等）、`Rename-Item`、.NET 写文件调用、`cmd /c`、解释器一行脚本都看不见，只有下面的工作区变更兜底在回合结束时记下它们，拦不住（§6.5.2）。把这些写法加进探测就是加规则，加进去的那一版起就拦（§6.5 开头）。

#### 6.5.2 工作区变更兜底：晚到的拦下与下一步之前的纠正〔已实现 2026-11-04，m4-gate G3；前身为 2026-10-28 的影子兜底〕

`src/guard/fallback.ts`（`git mv` 自 `shadow.ts`）。DSH 的 `workspace-changes` 在每个顶层回合结束时，用回合首尾的 git 工作树快照加文件工具改动前后的整文件副本，算出本回合改了哪些文件，并在会话日志里追加一条 `workspace/changes` 事件（`DESIGN.md` §2.4a）。guard 按会话与回合记下文件工具的目标与放行的 shell 调用，所有路由都记（2026-10-29 起，§6.2）：调用名先按 §6.1 换成原生名，`write`、`edit`、`str_replace_editor` 算文件工具（GLM 的 `Write`、`Edit` 换算后在其中，方言服务缺席时同样）。收到该回合的事件后读摘要，本回合跑过 shell、且有文件不是任何文件工具的目标时，写一条晚到的拦下（`mode: "late"`，`via: "turn-end"`，其余字段同影子时代：会话、agent、来源 `scope` 与 `route`、回合、文件显示路径、本回合放行的 shell 调用，摘要截断时另记未列出的文件数），进违规流水，晨报计进「违规」与「其中晚到的拦下」。这些调用在回合结束时早已执行，兜底从不假装拦住了它们。

纠正走到 agent 的下一步之前：每个回合至多排一条纠正，按会话存着（至多八条，满了丢最旧的），会话卸载即弃。`file-tools-only` 与 `main-agent-no-write` 管得到的会话（主 Agent、子 agent），guard 在 `agent/pre-step` 上发第二条 step notice（来源 `hourness-guard`，包在 system-reminder 里），列出至多十个文件、最近三条 shell 调用（每条截到 80 字符），整条至多 600 字符；事实、越界、正路三段照纠偏的写法，措辞随 `scope` 换方言名或原生名。纠正是提醒不是拦截：同一步里模型再发一次 shell 写入，规则面照判，兜底只管上一回合已经发生的。

已知边界：只覆盖有工作目录的顶层会话；工作目录不在 git 仓库里、或主机没有 git 时，摘要只列文件工具的改动，shell 写入看不见；被 `.gitignore` 忽略的文件只有文件工具碰过才看得见；同一回合里用户自己改的文件也会算进来；构建、测试、`git checkout` 这类放行的命令产生的改动同样会被记下，这是它的误报来源。`workspace-changes` 只在 `dsh-web-app` 的组合里，桌面版 profile 有，沙盒模板没有；缺这个服务时只少晚到的拦下与纠正，guard 的行健康写明「事后纠正未启用（组合里没有 workspace-changes）」。

验证：L2 覆盖两种方言下引号与代码体内的 `=>`、`>>>`、`->`，真实重定向，`Set-Content` / `Out-File` / `Add-Content` 等命令，git 子命令，嵌套脚本，以及晚到记录的触发与不触发条件（`tests/guard-shell.spec.ts`、`tests/guard-audit.spec.ts`）与纠正的排队、上限、丢弃（`tests/guard-fallback.spec.ts`）。L3 探针：GLM 与非 GLM 的系统提示词都带规则声明（GLM 用方言名，非 GLM 用原生名，§6.2）；`Bash` 跑引号里带箭头的命令与带引号箭头的 git 子命令都放行；在临时 git 仓库里挂上 `workspace-changes`，一条 .NET 写文件调用照常执行，下一回合的 step notice 里点名那个文件（场景 `guard-fallback`），再下一步没有。

### 6.6 惯犯升级

同一会话同一规矩违规达到 N 次，发强提醒（四段式加违规史回显）。反复出现的模式进入规范阶梯（§9）。

### 6.7 主 Agent 的执行边界与 git 快照〔M3 第 4 步，设计行默认启用〕

主 Agent 在 `tools/pre-execute` 上被三条规矩管着，由设计行装一个监听器（`installMainAgentRules`，`src/guard/main-agent.ts`，`prepend`，不导入 `src/design/`，设计行把「是不是主 Agent」「违规流水」「行健康」「给主 Agent 发 notice」传进来）。监听器先看调用本身（工具名、shell 文本里有没有写文件、有没有 `git`），不相干的调用不查会话角色；相干的才问 `isMainAgent`。读角色抛错时放行并报行健康（fail-open）；git 快照是唯一 fail-closed 的一条。没有会话的调用不判；带 `parent` 的传输层子调用按同一套规则判（2026-11-02 修，评审 S4-1、S5-1、S6-2、S8-3：PTC 预设 `run_code` 里的子调度因此到得了这些规矩，编排方在「照判」与「预设为 `ptc` 时降级行健康」之间选了照判）；不是主 Agent 的会话不受主 Agent 自己那三条与 `design-before-release` 管（对所有会话的图规矩照管）；同一个监听器还判主 Agent 派出的子 agent 的写入，那是第四条规矩 `design-before-release`（第 5 步，§6.8）。各条规矩的 id、标题与步号是常量表 `MAIN_AGENT_RULES`（`src/guard/main-agent-rules.ts`，只有常量，规则板的代码规则目录读它，映射成 `design:<id>` 的 `design` 行只读条目，§16.8）。

- `main-agent-no-write`：写文件的工具（`write`、`edit`、`str_replace_editor` 除 `view`，按原生名判，所以 `Write`、`Edit` 也算）和写文件的 shell 命令（`shellWriteOf`，与 `file-tools-only` 同一个引号感知的判断）被拒；git 子命令不算写文件。`DeferredToolCall` 绕不过去：`Write` 在 GLM 上是常驻工具，`DeferredToolCall` 只收延迟工具。
- `main-agent-ask`：按名调用 `ask_user_question`（`HIDDEN_FROM_MAIN_AGENT`）被拒，纠偏四段：事实、越界（聊天里问，不出选项卡）、正路（回复里问，或用 `propose_to_human`）、例外 `none`。
- `git-snapshot`：主 Agent 可以用任意 git 命令；会丢掉未提交改动或改写历史的命令，执行前由 harness 存一份可恢复的快照（`src/guard/git-snapshot.ts`）。

识别：`simpleCommands`（`src/guard/shell.ts`）取出每个简单命令的词（跳过变量赋值与 `sudo`、`env` 一类包装，进入 `bash -c`、`pwsh -Command`、`find -exec` 与子表达式；引号里的文字不是命令）；`gitInvocations` 跳过 git 的全局选项、跟随字面的 `cd`、`-C`；`gitRisk` 给出 `discard`（工作区或暂存区的改动会丢）、`history`（只靠被移动或删除的引用可达的提交会丢）、`both`，表在 `git-snapshot.ts`。子命令不在已知表里时读一次 `git config --get alias.<名>`：`!` 开头的别名当 `both`，普通别名按展开后的调用再判一层，对外检查与 `clean` 的拒绝也按展开后的调用再来一次（2026-11-02 修，评审 S4-3：别名 `p = push` 时 `git p --mirror` 因此被拒）。参数里有变量或命令替换时，按该子命令能做的最坏情形判（`git log --format=%H` 这样的无损命令不因 `%` 存快照）；子命令本身看不出时当 `both`；`cd` 的目标不是字面路径、又有会丢工作的 git 调用时拒绝。

快照全部用 `execFile('git', …)`，不经 shell，环境带 `LC_ALL=C`，列表一律用 `-z`，整个快照 30 秒期限：已跟踪文件的改动用 `git stash create`（合并冲突没解决时改用系统临时目录里的临时暂存区建一个工作区提交）；会被写出类命令（`reset --hard`、`checkout -f`、`checkout <树> -- <路径>`、`switch --discard-changes`、`restore --source`、`read-tree -u`）盖掉的、会被 `git clean` 删掉的、被 `worktree remove` 带走的未跟踪文件存进一棵树（上限 200 MB 与 20,000 个文件，超过就拒绝）；被忽略的文件（`.env`、`node_modules/`）不存，挡路的被忽略文件让命令被拒，`worktree remove` 只记它们的路径、项数与字节数；被移动或删除的引用的原值挂成一个提交的父提交，引用是 `refs/hourness/snapshots/<id>`；改写历史会让提交只靠 reflog 可达时，另打轻量标签 `hourness-snapshot/<id>`，指向一个树为空、不含改动与文件的提交；`push` 强推或删除前把远端当前的状态取到 `refs/hourness/snapshots/<id>/remote/<分支>`。git 不能让同一个名字既是引用又是引用目录，所以有远端副本的快照，快照提交的引用是 `refs/hourness/snapshots/<id>/commit`（附录写的是 `<id>`，与 `<id>/remote/` 同时存在时无法建）。流水追加到 `<项目根>/.llm/snapshots.jsonl`：项目根取 `projectOf(会话的工作目录)`，会话不在任何仓库里时取被快照的仓库的（行里 `rootFrom` 为 `repo`），两处都没有 `.git` 时不建 `.llm/`；第一次写前 `ensureIgnored`（`src/data/project-root.ts`）并补 `.llm/.gitignore`（`*`）。写流水失败时命令照常执行，行健康 degraded「快照 <id> 已存，记录没写上：<原因>」，找回靠 `git for-each-ref refs/hourness/snapshots`。快照不自动清理。快照之后 `inject` 一条 notice（来源 `glm-git-snapshot`）给主 Agent，写明恢复命令。

不存快照就拒绝（规则 `git-snapshot`，纠偏四段）：快照的任何一步失败或超时、要存的文件超限、远端取不回来、`cd` 的目标认不出、挡路的有被忽略的文件、`clean -n` 的结果与 harness 自己算的列表对不上；找不到 git 是唯一放行的失败（行健康 degraded「找不到 git，快照跳过」）。快照可能存着没提交的改动，所以另有对外检查先于快照：`push --mirror`、有快照标签时的 `push --tags`、refspec 的源是快照引用、快照标签、快照里的提交或通配能匹配到它们、`remote.<名>.mirror` 为真或 `remote.<名>.push` 带这样的 refspec，都被拒——配置连命令行 `-c` 设下的值一起读，快照自己的调用怎么读它就怎么读（2026-11-02 修，评审 S4-2；`refs/hourness/snapshots/<id>/remote/*` 是远端原来的提交，恢复远端时要推它，放行）；`git clean` 带 `-x`、`-X`（删被忽略的文件）或 `-f` 两次（删嵌套仓库）被拒；`push` 的远端或 refspec 藏在变量后面时看不出推什么，也拒绝。

没做、仍是残余：脚本里调用 git、git 钩子、`git` 以外的程序改仓库认不出；合并冲突的三方版本不存；被忽略的文件不存，`worktree remove` 之后不恢复；子 agent 的 git 属于 M7；主干前进时的核对与证据属于 M7（`m7-5`）。

验证：L2 `tests/design-guard.spec.ts`（拒绝、放行、角色、待生效状态、违规流水、fail-open、快照的 notice）、`tests/git-snapshot.spec.ts`、`tests/git-snapshot-files.spec.ts`、`tests/git-snapshot-history.spec.ts`（真实 git 的临时仓库：识别、各类命令的快照与恢复、拒绝、对外检查、流水位置、临时暂存区）、`tests/contracts.spec.ts`（规则表）、`tests/guard-shell.spec.ts`（`simpleCommands`）、`tests/toolsearch.spec.ts`（`DeferredToolCall` 到不了 `Write`）；L3 探针 `glm-design-main`、`non-glm-design-main` 的后半段（再次 `/wish` 之后按名调用 `Write`、shell 写入、`ask_user_question` 被拒，`git status` 不存快照，`git checkout -- README.md` 存快照并在下一步带 notice）。

### 6.8 放行之前，派出去的 agent 只读（`design-before-release`）〔M3 第 5 步，设计行默认启用〕

规则在 §6.7 的同一个监听器里（`installMainAgentRules`，`src/guard/main-agent.ts`），判定与沿派发链往上找根在 `src/guard/design-release.ts`。适用的调用：会话头带 `origin: 'subagent'` 的会话里写文件的调用（文件工具按原生名判，`str_replace_editor` 除 `view`，加上写文件的 shell 命令，判写同 `main-agent-no-write`；读、git、图工具不算写）。先看调用本身，不是写入的在问会话之前就放行。

- 派发链的根：沿会话头的 `parentSession` 往上，每一跳到一个不同的活 agent，直到头里没有 `origin: 'subagent'` 的那个（用户 fork 的会话只带 `parentSession`，链在它那里停下，它自己是根）。孙 agent、`subagent_fork` 的子会话都按这条链走，与「最大递归深度」的设置无关。根不是主 Agent 时不判。
- 判定读根的焦点（`focusOf`）、图和焦点所在目标的有效阶段（§4.8）：没有焦点、焦点不在图里、焦点上面没有目标、目标已关闭，拒绝（主 Agent 没有目标在焦点上，什么都还没放行）；目标在 `wish`、`interview`、`design`（提议状态的目标不论 `stage` 写什么都算访谈；分了模块的目标退回 `design` 改框架时，整个目标下包括已放行的模块），拒绝；目标在 `release` 或之后，而焦点在一个还没放行的模块或候选里（`moduleOf` 有值且 `isReleased` 为假），拒绝，越界一句写出模块；其余放行：已放行的目标、在已放行模块里的焦点、已批准而没有阶段的目标。
- 纠偏四段：事实（`You tried to write …`，同主 Agent 的写入规则）；越界一句（按上面三种各一句，写明阶段与目标 id 或模块 id 与标题）；正路：读、搜、交回，不要把写入再转给别的子 agent；主 Agent 用 `propose_to_human` 把方案交给人，目标或模块放行之后才能再派；没有焦点时先聚焦这项活所属的目标或任务；模块那一种另加 `kind release, module <id>`；例外：为回答一个设计问题要写一下（探路）时，交回，让主 Agent 把这个问题交给人。
- 判不出就放行并说明（fail-open，行健康 degraded，同时记在子会话和根会话上）：没有 `agents` 服务、链上有不活的 agent、会话头没有 `parentSession`、链成环、图行服务不在或不说焦点、读图抛错；读根的角色抛错时同 §6.7，放行并在根会话上报。「没有目标」是判得出的状态，不在其中。

没做、仍是残余：
- 带 `parent` 的传输层子调用按同一套规则判（2026-11-02 修，评审 S4-1、S5-1、S6-2、S8-3）：PTC 预设 `run_code` 里的嵌套写入与图写入由同一个监听器照判，主 Agent 的与派出会话的都在内。编排方在「照判」与「预设为 `ptc` 时降级行健康」之间选了照判。
- 分了模块的目标在目标一级放行之后，所有模块都在设计，主 Agent 的焦点停在目标一级（或不属于任何模块的节点）时，规则放行，一个模块也没放行就能派出写文件的子 agent。规则只看焦点在哪个节点，不去猜活属于哪个模块。身份节、正路一句和阶段提醒里的「派写文件的子 agent 之前先聚焦到模块或它下面的任务」是提示；M7 合入后用 `releaseOf` 取代这一行的判定。
- 判定读的是写入那一刻根的当前焦点（`focusOf` 每次写入重读），不记派发那一刻的焦点：主 Agent 派出写模块 B 的子 agent 之后把焦点移到已放行的模块 A 或目标一级，B 的子 agent 之后的写入就放行（评审 S5-2，附录 §3.14.6 第一段的那一种）。M7 的 `releaseOf` 接手这一行的判定时一并收掉。
- 每个子 agent 的写入调用都读一次图目录（`loadGraph`）。读不重不阻塞主 Agent，但图很大时每次写入多读一遍节点文件；要缓存时按图修订号缓存，不是本步。

验证：L2 `tests/design-guard.spec.ts`（无焦点、各阶段、关闭的目标、孙 agent、shell 写入与读写区分、不判的会话、违规流水、判不出的各种情形、按模块判、模块退回再放行、完成的模块）、`tests/graph-modules.spec.ts`、`tests/contracts.spec.ts`（规则表第四行）；L3 场景 `glm-design-stage`（真的子会话，无焦点与访谈中各被拒一次）、`glm-design-released`（已放行的目标一级与已放行模块里的写入执行，设计中的模块里被拒并写出模块）。

### 6.9 图写入的规矩：谁的转述算人的话〔M3 第 6、8 步，设计行默认启用〕

图工具对所有 agent 注册，引擎给任何带 `relay` 的 `llm` 写入人的权限（§2.9.1），所以「这段话是人说的」要在工具执行之前核对，不靠模型自觉（`d-chat-not-cards`、`d-one-main-agent`）。设计行把五条规矩装在 §6.7 的同一个监听器上（`src/guard/main-agent-graph.ts`，同样不导入 `src/design/`，核对用的 `personSaid` 由设计行传入），按会话的种类分开：

- `main-agent-graph-relay`：主 Agent 的图写入带 `relay` 时，`relay` 的每一行都要是人在该节点最后一次变更（批注不算）之后发来的消息里的整句或整段；新提议的节点没有更早的状态，本会话里人的任何消息都算。读不到会话的消息时一律拒绝，不让没核对过的话把人的权限带进图。子 agent（会话头 `origin: 'subagent'`）带 `relay` 一律拒绝，它不和人说话；这种尝试还会通知持有者：违规流水一条、设计行行健康 degraded、持有者会话下一步里一条 `glm-design-bypass` 的 notice（同一会话同一目标 10 分钟内不重复发）。普通会话的 `relay` 不核对。
- `main-agent-graph-options`（主 Agent）：`graph_propose` 提议、或 `graph_edit` 改，使一张人定的待决带上选项表被拒；正路是 `propose_to_human`（`choose` 在真有取舍时列两三条路）。agent 自己定的待决（`decider: agent`）不受影响；读不到图时放行，行健康降级。
- `main-agent-graph-delegations`（所有会话）：写类图工具（`graph_show`、`graph_open`、`graph_focus` 之外）指向 `norm-delegations`——`graph_propose` 的节点 id 与连线任一端、`graph_link` 与 `graph_unlink` 的两端、其余工具的 `id`——一律被拒，带不带 `relay` 都一样，不告警。只看参数里的节点 id，不读图，没有失败的路。这个节点记的是人交给主 Agent 的长期授权；唯一的写路是 `record_human_answer` 的 `delegation`（§3.1），它先核对原话再直接写引擎。
- `main-agent-graph-stage`（所有会话，第 8 步）：目标只经「把需求交给人、记下人的同意」向前（`propose_to_human` 与 `record_human_answer` 的 `confirm` 和 `release`），图工具不能替它。下面五种调用一律被拒，带不带 `relay` 都一样；阶段的先后照 `STAGES`，有效阶段照 `effectiveStage`（§4.8），节点所属的目标照 `goalOf`：(a) `graph_edit` 给目标或特性设 `stage`：它的有效阶段是 `wish` 或 `interview` 而新值在 `interview` 之后，或有效阶段是 `design` 而新值在 `design` 之后；或把 `stage` 清成空（`set: {stage: null}`）而它带着 `stage`、有效阶段是 `wish`、`interview` 或 `design`；或目标没有有效阶段（已批准而没写阶段，不走设计循环）而新值在 `interview` 之后（给没有阶段的目标写 `wish` 或 `interview` 是把它放进循环，不拦）；或给没有阶段的特性写任何阶段（那会把它变成目标的模块，或写成已放行）；或清掉模块（目标的直接特性，已批准、进行中或完成）的 `stage`，不论它在哪个阶段（已放行的模块会丢掉放行的记录）；(e) 把模块的 `stage` 从 `release` 或之后改回 `design`：只有主 Agent 放行（引擎对它不要人的原话，§4.9），子 agent 与普通会话被拒、告警，纠偏的事实是 `Only the main agent sends a module back to design.`，正路分别是 `Report back to the main agent.` 与 `Ask the main agent in its conversation.`；阶段线有两侧：循环里的目标不能向前，也不能靠清掉阶段走出循环，因为所有门禁把「已批准、没有阶段」读成人没有让它走设计循环，子 agent 随之可写，M7 也只认 `release` 及以后；(b) `graph_approve` 一个有效阶段是 `wish` 或 `interview` 的目标（确认需求）；(c) `graph_approve` 一个所属目标的有效阶段是 `wish`、`interview` 或 `design` 的节点（放行之前批准放行集合里的节点就是绕过门禁的放行），或一个在还没放行的模块或候选下面的节点（模块自己和候选除外：模块放行之前批准它子树里的节点同样是绕过），或一个目标的直接特性子节点而这个目标已放行、已经有模块（新模块，模块清单只在放行框架时定；「已有模块」不含这个节点自己，否则一个已放行目标的每个特性都读成新模块）；(d) `graph_propose` 带 `relay`，类型不是 `question`、`risk`、`retro`，挂在有效阶段是 `wish`、`interview`、`design` 的目标下（带原话的提议直接是已批准，等于 c），或带 `relay` 提议一个没有 `stage` 的目标（带原话的提议直接是已批准，等于一个不走设计循环的目标）、一个 `stage` 在 `interview` 之后的目标、一个带 `stage` 的特性（等于 a）；或带 `relay` 提议的非 `question`、`risk`、`retro` 的节点挂在还没放行的模块或候选下面（等于 c），或一个特性直接挂在已放行、已有模块的目标下（新模块）；目标只收 `wish` 与 `interview`，那是确认需求接得住的地方。不受它管的：向后改阶段（`release` 改回 `design`，要人的原话，由 `main-agent-graph-relay` 核对）、放行之后的阶段、待决的拍板，和写图的 `record_human_answer`（它直接调引擎，自己先核对原话、重查门禁）。纠偏：主 Agent 的事实写它试了什么（例 `You tried to set the stage of "记账小工具" to design while it is in interview.`），越界一句说目标或模块只在人同意主 Agent 交给他的需求或方案时向前，正路是 `propose_to_human`（`confirm` 或 `release`，模块的带 `module` 与 `page`）加 `record_human_answer`；子 agent 与普通会话的事实是「只有主 Agent 在记下人的同意时才把目标往前推」，越界一句写它试了什么，正路分别是「交回给主 Agent」与「人在主 Agent 的对话里同意；本会话的 `/wish` 说它在哪」。子 agent 与普通会话命中时告警（违规流水一行带 `session`、`goal`、`node`、`stageFrom`、`stageTo`；设计行行健康降级；持有者会话下一步里一条 `glm-design-bypass` 的 notice，同一会话同一目标 10 分钟内一次；指标事件 `design.bypass-refused`），主 Agent 自己命中只拒绝、进违规流水。只对这五种调用读图；读图抛错时拒绝（fail-closed，正路是重试，仍不行就告诉人），其余图工具调用不读图。
- `main-agent-graph-cli`（所有会话，第 8 步）：图的命令行（`npm run graph`，`src/graph/cli.ts`）也以 `llm` 身份写、可带 `relay`，且不核对任何东西，是编排方在 DSH 之外用的（§2.6），所以会话里它的写入命令一律被拒，只放行 `show` 与 `open`。认法：shell 调用里有一个简单命令（`simpleCommands`，引号里的文字不是命令）是 `npm`、`pnpm`、`yarn` 后接（可选的 `run`、`-s`、`--silent`）`graph`，或命令名是 `node`、参数里有以 `scripts/graph/cli.ts` 结尾的路径（`\` 与 `/` 等同）；其后的第一个子命令（跳过 `--` 与 `--dir <目录>`）不是 `show`、`open` 就拒绝，没有子命令也拒绝。纠偏：事实 `Inside DSH the project graph changes through the graph tools.`，越界 `The graph tools check whose words a relay carries; the command line does not.`，正路用图工具，例外 `The orchestrator runs the command line outside DSH.`。命令文字里有 `relay` 且会话不是主 Agent 时同样告警。只看命令文字，不读图，没有失败的路。

残余：五条规矩都在 §6.7 的监听器里，带 `parent` 的嵌套调用与直调一样过它们（2026-11-02 修，评审 S4-1、S5-1、S6-2、S8-3）。图的命令行在 DSH 之外不受这些规矩管。目标一级的几种绕过（清阶段、带原话提议没有阶段的目标、给没有阶段的目标写 `release`）已在 a、d 里拦住，`tests/design-graph-rules.spec.ts` 有两次调用从无到 `release`、从设计到 `release` 的端到端用例，最后断言 `releaseVerdict` 仍是拒绝。`main-agent-graph-cli` 认不出的写法（脚本或别的程序里打开图引擎、`npm --prefix` 一类前置选项、别的运行器）是残余。

验证：L2 `tests/design-graph-rules.spec.ts`（五条规矩，主 Agent、子会话、普通会话，阶段线两侧的三种绕过和两次调用端到端，读不到会话与读不到图时的拒绝，通知的去重，命令行的写与读各九种写法；第 9 步的模块几支：模块下的批准与带原话的提议、新模块、清模块与给特性写阶段、退回设计只放主 Agent，读不到图时拒绝）、`tests/record-human-answer.spec.ts`（含确认的写入在第一条或第二条写入处失败后用同样的话接上）、`tests/propose-to-human.spec.ts`（`confirm`）、`tests/contracts.spec.ts`（规则表与触发）；L3 探针场景 `glm-design-question`、`glm-design-interview`、`glm-design-release`、`glm-design-modules`（`DEVELOPMENT.md` §3）。放行（§4.5、§4.9）的 L2：`tests/propose-to-human.spec.ts`、`tests/record-human-answer.spec.ts`（`release`，含大循环放行四个停下点的重放）、`tests/graph-stage.spec.ts`（门禁与集合）、`tests/graph-engine.spec.ts`（模块退回设计的例外、`initialStatus` 收窄）、`tests/design-stage-notice.spec.ts`、`tests/calibrate-interview-check.spec.ts`。

## 7. 环境与检查器

### 7.1 工欲善其事

LLM 爱造轮子，因为写脚本只花当前这一轮的力气，装工具却要停下来问人；代价由后面几十轮来付，到那时它已不记得写过什么，结果是散落全盘的文件与脚本〔定案，用户经验〕。所以正路要在当下就最省力：

- 环境是项目图上的一个分支，每个工具一个节点：用途、用法、选择理由、安装位置。会话开始时与记忆一起放到模型手边。实现：图上 id 为 `env` 的特性节点（挂在一个目标下），env 行（`src/env/`）在每个 agent 的会话第一步与分支变化后的下一步注入提醒，带「改完哪些文件会跑检查」与草稿区两行（M4 设计 §7.1、§7.2）。
- 执行限制在工作区内，与此配合。

### 7.2 查找顺序

工具箱 → DSH 插件与 MCP（DSH 有 MCP 客户端，例如连服务器应接 SSH 类 MCP，不自己写连接脚本）→ 社区成熟包 → 自己写。自己写时，方案架构栏写明查过哪些、为什么不用。

### 7.3 装工具

往工作区外安装，走一次同步决策卡；批准后记入环境分支，以后每一轮都在手边〔定案〕。

### 7.4 草稿区

一次性脚本只允许放在约定的草稿目录；汇合时要么删除，要么转正（挂上节点、移入 `scripts/`、写明用途），放着不管的过不了汇合门禁〔定案〕。位置：工作区根下的 `.llm/scratch/`（M4 设计 §7.3）；`.llm/` 的 git 忽略由 env 行与 guard 行在第一次往项目的 `.llm/` 写东西之前经 `src/data/llm-ignore.ts` 的 `ensureLlmIgnored` 保证（追加 `<git 目录>/info/exclude` 一行并用 `git check-ignore` 复核）。`.llm/docs/` 下曾有的三个抓取脚本属于这一类，已删除（`m4-cleanup`），地址与重新抓取的办法见 `docs/reference/bigmodel-guide-digest.md` 的附。

### 7.5 检查器

| 语言 | 规范与静态检查 | 格式化 |
| --- | --- | --- |
| C / C++ | clang-tidy、cppcheck、编译器 `-Wall -Wextra` | clang-format |
| Python | ruff、mypy 或 pyright | ruff format |
| TypeScript / JavaScript | tsc、ESLint 或 Biome | Prettier 或 Biome |
| Go | go vet、staticcheck | gofmt |
| Rust | clippy | rustfmt |
| Shell | shellcheck | shfmt |
| 跨语言 | jscpd（重复）、gitleaks（密钥）、knip / vulture（死代码） | — |

- 先识别项目语言；项目有自己的配置就用项目的，没有就按社区默认方案发一张决策卡，批一次后记入环境分支。
- 每次改完文件，由 harness 在执行边界跑相关检查，结果当轮回传给模型（`DESIGN.md` §6 注入约定）。模型不需要自己记得去跑。
- 格式类问题自动修；规范类问题必须由模型修。
- rc.3 桌面版没有 LSP 包（`dsh`、`dsh-web-app` 的依赖里都没有）；DSH 主干的 `packages/lsp` 也只提供跳转定义、查引用、查实现、悬停，没有诊断〔实读〕。检查器运行由本层实现。

### 7.6 告警

- 新项目从第一天起零告警；存量告警按棘轮处理：记下基线，新增告警一律拦下，基线只减不增〔定案〕。
- 压制注释（忽略注释、降级、关严格模式）必须写理由并挂节点，没写理由的新增压制直接拦下〔定案〕。
- 把检查配置改松属于计划外决策，走决策卡〔定案〕。
- 压制注释总数单独作为一项指标。实现：env 行每天第一次给某个仓库的会话装环境提醒时，对仓库的已跟踪文件按标记表（`src/shared/suppression-markers.ts`）计数，追加进项目的 `.llm/audit/suppressions.jsonl`（`src/env/suppressions.ts`；同一仓库同一天至多一条，计数在后台跑，失败只进行健康），晨报写「压制注释 N 处（本期 +a / −b）」（M4 设计 §6.7）。

### 7.7 本仓库

〔已实现 2026-10-28，`ROADMAP.md` M1.9〕tsc 之外，规范检查用 ESLint 加 typescript-eslint 的类型感知规则，死代码检查用 knip，重复检查用 jscpd（用户选定方案 A），精确版本、开发依赖，不做格式化。`npm run lint` 接入 `npm test`，三项各自对照入库的基线，按 §7.6 的棘轮执行：基线之外的新发现失败，基线里已不再出现的条目也失败，直到 `npm run lint:update` 把基线缩小；有新发现时 `lint:update` 拒绝写入。ESLint 用自带的批量压制，jscpd 用自带的指纹基线，knip 没有基线功能，由脚本按类型、文件、名称比对清单。命令、范围与基线数字见 `DEVELOPMENT.md` §10。

配置取舍（都写在配置文件的注释里）：

- 规则集：typescript-eslint 的 `recommendedTypeChecked`，加 ESLint 核心推荐规则 `@eslint/js` 的 `configs.recommended`（ESLint 10 不再自带 `@eslint/js`，用户 2026-10-28 同意作为精确版本的开发依赖装上，项目图 `q-eslint-js`）。此前配置从 ESLint 自身的规则元数据里取标为推荐的规则，与 `@eslint/js` 10.0.1 的推荐清单是同样的 64 条，换装后规则集不变。全部规则设为 error，批量压制只对 error 生效。
- 与 tsc 对齐：以下划线开头的参数不算未使用（同 tsc `noUnusedParameters`）；与剩余元素并列解构出来的属性不算未使用（省略字段的写法）。
- `node:test` 的 `test()`、`describe()` 返回由测试运行器等待的 Promise，按 typescript-eslint 文档登记为已知安全调用，不算悬空 Promise。
- 环境全局量：脚本与两个包客户端面的宿主半 `packages/*/ui/index.js` 取运行 ESLint 的 Node 的全局名；客户端源码 `ui/src/` 在 DSH 网页端运行，只登记它用到的浏览器全局量。
- 排除：vendored 上游代码 `src/shared/schemastery.ts` 不进 ESLint 与 jscpd（它随重新 vendor 变化，不随 lint 修复变化）。
- knip：配置是 `knip.js`，根 `package.json` 不再导出行模块，所以 12 个宿主行的源码入口、两个包客户端面的宿主半 `packages/*/ui/index.js` 与两个客户端入口都按目录表 `scripts/packages.mjs` 生成，探针 provider 由探针运行器把路径交给 Loader，也登记为入口；客户端半的 `react` 来自 DSH 客户端模块表，不是 npm 依赖。`scripts/check-lint.mjs` 给 knip 传 `--tsConfig tsconfig.knip.json`，它引用两个包的 tsconfig，脚本对 `packages/*/dist/` 的导入由此对回 `src/`（tsc 拒绝引用非 composite 项目，所以这组映射不放进根 `tsconfig.json`）。
- 现有告警没有成批修：175 条多余的类型断言可自动修复，但会和 `graph-engine` 分支改动的文件冲突，等该分支合并后再修；门禁上线时只修了 3 处明确安全的真问题（测试里一个从不读取的计数变量、一个未用导入、一个被 `unknown` 吞掉的联合类型）。

密钥扫描〔已实现 2026-10-28〕：gitleaks 是工作区外的独立二进制，按用户 2026-10-28 的选择装在用户级工具目录（项目图 `q-gitleaks`）；`npm test` 在检查器门禁之后运行它，扫 HEAD 的历史与已跟踪文件的未提交改动，没有基线，范围与放行规则见 `DEVELOPMENT.md` §10。

未做：§7.5 所说「每次改完文件由 harness 在执行边界跑检查并当轮回传」属于 M4。

度量：每个目标新增的临时脚本数与转正数、同一功能被重复编写的次数、工具箱命中率、压制注释数。

## 8. 记忆与学习

### 8.1 现状〔M5 步骤 M1、G1、H1 已实现，L2、L3；桌面版第一批验收未做〕

记忆行（`src/memory/`）按会话工作：项目目录跟会话的工作区，关于人本人的记忆在用户级目录（`d-memory-scope`），两处都是只追加的流水 `memory.jsonl`（`DESIGN.md` §2.4）；旧的 `memory.json` 在第一次写入时迁移（改名保留为 `memory.json.migrated-<毫秒>`，读不出的旧文件不被覆盖，读与写都报 `io`）。行配置 `home` 不再使用，行健康说明这一点。设计与验收在 `.agents/tasks/m5/design.md`（项目图节点 `m5`、`lessons`）。

原先的问题与现在的做法：约 800 次 GLM 请求只存进 1 条记忆，且落在被废弃的目录——存放跟会话走；只能等模型主动查询——会话开局与压缩之后有索引（§8.3）；工具检索把记忆工具收进延迟目录——记忆工具常驻；「git 能查到的不存」的判据过严，句子里带斜杠或文件名就被拒（「coding-plan/start-plan 的签名规则不同」存不进去）——判据取消，改为类型、Why、出处与写入前查重（§8.4）。

### 8.2 两类记忆

| 类 | 衰减 | 撤销 |
| --- | --- | --- |
| 事实（`project`、`reference`） | 14 天半衰期，每次被召回算一次复审（加成上限 1.5 倍）〔已实现〕；强度低于 0.1 的不进索引，`memory_query` 仍找得到 | 可被新事实覆盖；agent 可以直接删 |
| 偏好（`user`、`feedback`） | 不衰减：这是用户定下的，不因一段时间没被想起而淡化 | 只能由用户撤销：人在输入框打 `/memory forget`；或对主 Agent 说，主 Agent 带人的原话调 `memory_forget`。同一会话里 agent 删自己刚写的误记除外 |

偏好一定有凭据：人的原话（`relay`），或人亲手打的命令。没有凭据的偏好存不进去（`memory_store` 得 `ask_first`，`hint` 指去 `memory_habit`），读流水时也算坏行。会话里人的消息读得到时，`llm` 写偏好的 `relay` 必须出自人最近一条消息，否则 `relay_not_said`；核对了的 `store` 记录记 `relayChecked: true`，读不到人的消息时照收、记 `relayChecked: false`，`memory_query` 与 `/memory show` 标「原话未核对」。人确认过的习惯（见 §8.5 的 `memory_habit`）再被更新时原话核对不了，整条拒收（`unavailable`）。

存放〔定案 2026-10-28；`d-memory-scope` 2026-10-30〕：关于人本人的记忆（范围 `all`，只有 `user`、`feedback` 两类）放用户级目录 `$DSH_HOME/glm-hourness/memory/memory.jsonl`；项目事实与项目规范（范围 `project`）放会话所在项目的 `.llm/memory.jsonl`，项目按会话头的工作目录定（工作树回到主检出）。第一次往一个项目写之前，`.llm/` 先加进该项目的 `.git/info/exclude`，加不进去时这次写入得 `io`、不建 `.llm/`。同名条目：项目的遮住用户级的。

### 8.3 召回与工具

- 会话开局的索引：根 agent 的第一步（存储里有条目时）和每次压缩之后的第一步，在对话末尾加一条来源为 `glm-hourness-memory` 的 `<system-reminder>`，偏好在前，事实按强度，淡忘的事实不列，至多 200 行与 25,000 字符。它是对话里的消息，不是系统提示词的一节，所以系统提示词逐步不变；可见历史里已经有它就不再加，开局时存储为空的会话在第一次写入之后的下一步得到一次。
- 记忆工具 `memory_store`、`memory_query`、`memory_forget` 常驻（不进延迟目录）；只读的 `learning_signals`（§8.5）与习惯问话的 `memory_habit`（§8.5）是主 Agent 的延迟工具，不并入记忆工具名单，所以 GLM 的 Memory 一节出现的条件（三个记忆工具都在）不变。`memory_query` 按关键词（命中数乘强度）或按名字取；返回的事实各算一次复审（项目流水里一条 `review` 记录），偏好不算。
- 子 agent（委派出去的会话）不拿记忆工具、`learning_signals` 和 `memory_habit`、不收索引与学习摘要提醒：行在子 agent 的 `agent/created` 上装一个不带 `prepend` 的 `system-prompt/assemble` 监听器去掉这五个工具，方言的 `prepend` 监听器因此看不到它们，不给子 agent 加 `# Memory` 一节；工具体再按会话头的 `origin` 拒绝按名直接调用（`role`，正路是交回结构）。
- `/memory`（输入框，身份为人）：`show` 列两处的条数与最近 10 条，`forget <名字> [project|all]`，`restore <名字> [project|all]`。
- 服务 `glmHournessMemory`（契约 `src/shared/memory-service.ts`）：`depth(sessionId)` 给 GLM 方言读常设的汇报细度：方言在会话的 agent 创建时问一次，那一次同步读用户级流水，之后同一会话不变（§8.5）；另有 `stats`、`hygiene` 给周报与巡检（`src/memory/service.ts`）。会话投影 `hournessMemory` 把两份流水的路径交给面板。
- 行不注册任何 `tools/pre-execute` 监听器：记忆是建议，不拦任何调用（`d-code-rules-enforce`：本行没有规则）。

### 8.4 写入

- 取消基于路径与文件名的拒绝判据（`defaultKnowableFromGit`、`shouldStore`、行配置 `knowableFromGit` 已删）。写入时要求标明类型，`feedback`、`project` 要有 `Why:` 一行，`project` 要有一个能认出的出处（图里的节点 id、项目里存在的文件、提交号、地址）；`feedback` 必须写明范围；`user`、`feedback` 要有人的原话；像密钥的文本（令牌形状，不是路径或长标识符）整条拒收（`secret_like`）；与同类型的已有条目相似（名字与说明的词重合 0.6 以上，或出处相同）要带 `confirmNew` 才存。同名条目是更新，`type` 不能变。
- 并发：每份流水旁一把锁文件（`src/data/lock.ts`），锁内重读、判写、追加，写不到锁得 `busy`。
- 分工：git 管「是什么」，记忆管「为什么」与偏好。
### 8.5 学习流水线

- 信号〔已实现，M5 步骤 G1〕：harness 从项目图的历史和记忆流水里算出人对 agent 的纠正，按键分组（`src/memory/signals.ts`，纯函数，同样的输入得到同样的输出）：人改了 agent 写的字段 `edit:<节点类型>.<字段>`（人，或 `llm` 带 `relay` 转述人的话，改的字段上一次是 `llm` 或 `harness` 不带 `relay` 写的），人否决提议 `reject:<类型>`，人在对话里对方案的否掉与补充 `chat:reject`、`chat:add`（批注不带 `relay`，认开头的固定说法，`src/shared/answer-marks.ts`），人把做完的节点重开 `reopen:<类型>`，汇报细度从一档拨到另一档 `depth:up`、`depth:down`。开头是「人在对话里同意」的历史项是人对提议说可以，不算纠正。门禁以外的提交改了刚合入的文件这一类要等 M7 写的任务尾注，还没有。
- 流程：学习摘要 → 主 Agent 为每一组选落点 → 观察是否复发。`learning_signals`（只读，主 Agent 的延迟工具，参数 `since`、`minCount`，默认近 28 天、至少 2 次）列出各组：键、一句说明、次数、至多 3 个例子、已落点数 `learned`、这一组有没有被当作习惯问过人与结果 `asked`、落点之后又出现的次数 `recurrences`、最近 4 周每周的次数 `weekly`（只看走向）；图读不出时 `graph: "unavailable"`，哪份流水读不出写进 `notes`，不报错。落点是带这个键的 `learnedFrom` 的记忆条目或经验（人删掉的、退役的不算），或节点上一条 `学自：<键>` 的批注（规则提议与候选标定题这样记），还有习惯问话：生效的习惯偏好算落点，没回的问话 28 天内算，「不用」在 `until` 之前算；落点的时刻取第一次写下这个键的那条记录。服务 `glmHournessMemory` 的 `learningDigest(session, {since?, until?, minCount?})` 给 M7 的周报同一份结构。
- 习惯先问再记〔已实现，M5 步骤 H1〕：agent 从改动里猜出的习惯不再直接写，也不自己开口问；先调 `memory_habit {action: "ask"}`——字段校验、换词表（`plain_words`，词与替法在 `hint`）、像密钥拒收；已是偏好得 `known`，28 天内问过没结果的同一条（按组键认，名字与说法不同也算）得 `asked_recently`，`until` 未过的「不用」得 `declined_recently`，一条回复里与 M3 已交出的提议合计超过三件得 `too_many`（问话排在提议之后，M3 不数问话，§8.5 之外披露的缺口），一个项目一周里的第四条得 `week_cap`；成功时流水里一条 `ask` 记录，返回 `text` 以圈号开头、第二行是「要记的：」加 `description`。人在同一会话、七天内、问话之后第一条消息里答了：`confirm` 带人的原话把问话时的内容存成不衰减的偏好（`store` 记录带 `data.ask`，条目带 `confirmed`，流水里总有内容相同、更早的问话）；原话不在那条消息里得 `words_not_found`，人没回得 `not_answered`，别的会话的问话得 `other_session`，过了七天得 `lapsed`，原话里有像密钥的一段得 `secret_like`（`field: words`），什么都不存、问话仍开着。`decline` 同样核对原话，记一条 `decline`，同一条习惯 28 天内不再问。读不到会话里人的消息时 ask 与 confirm 都得 `unavailable`，流水没有新行。人的消息读自会话投影 `hournessTalk`，没注册上时折叠会话日志（`src/memory/answers.ts`，本仓库里除设计行自身外唯一读 `src/design/talk.ts` 的文件）。
- 学习摘要提醒〔已实现，M5 步骤 G1〕：给 `isMainAgentFor` 判为主 Agent 的步一条来源为 `glm-hourness-learning` 的提醒，指向 `learning_signals`；先看项目记忆流水里最近一条 `learn-notified`，满 7 天或没有才读图计算；至少有一个组没有落点或落点之后又出现，且这些组的键不是上一条提醒列的那些（摘要没变就不再发），才在项目的记忆流水里记一条 `learn-notified`（`data.keys` 是组键）并发出；记不下就不发。算出来不合条件的和写失败的，本进程一小时内不再算。提醒是建议，不拦任何调用，不在图上新增待决。
- 汇报细度闭环〔已实现，M5 步骤 R1〕：三档滑杆（简洁 / 适中 / 详细，LLM 每次自选）的常设档，是人最近一次说定的。人的话表明长短要一直这样时，主 Agent 调 `memory_store`（`name: reporting-depth`、`type: user`、`value` 是三档之一、`relay` 写人的原话）；人只是这一次嫌长或嫌短，主 Agent 只改这一次的讲法，不写。GLM 方言的 `glm:persona` 一节在会话的 agent 创建时读 `glmHournessMemory` 的 `depth` 一次，没有时用配置的 `persona`：写入的那个会话里系统提示词不变，下一个会话带上新的档。人说「汇报细度恢复默认」，主 Agent 带原话调 `memory_forget reporting-depth`，或人打 `/memory forget reporting-depth`，下一个会话回到配置。服务不在、形状不对、读不出时用配置的档，并在行健康里说明。
- 子 agent 各配独立记忆目录，避免互相污染。

### 8.6 经验板〔M5 步骤 L1、L2 已实现，验到 L2、L3 层；桌面版第一批验收未做；行默认禁用〕

经验板（`src/lessons/`，行 `glm-hourness/lessons`）记「在某种情况下踩过的坑与解法」。一条经验写明情况（文件、工具、命令、报错片段）、坑、解法、证据、最近一次确认；都属于项目，存在项目的 `.llm/lessons.jsonl`，没有用户级经验（`d-memory-scope`）。设计与验收在 `.agents/tasks/m5/design.md` §4（项目图节点 `lessons`）。经验是建议，不是规则：行不注册任何 `tools/pre-execute` 监听器，不拦任何调用（`d-code-rules-enforce`：本行没有规则）；它监听工具调用的唯一处是 `tools/post-execute`，只往失败的结果里加提醒，不改调用、不拒绝。

- 来源：worker 交回的候选经验，经服务 `glmHournessLessons` 的 `propose` 收下（契约 `src/lessons/service.ts`）。签名与某条生效经验相同的并入它，与人删过的相同的丢弃，其余成为候选；字段不合格或像密钥的答 `rejected`，什么都不写；服务自己写不成的答 `{error}`，派发一侧走退路批注 `[候选经验] …`，经验行在主 Agent 的下一步（距上次检查超过一分钟且图的修订变了；`propose` 失败之后不等一分钟）把图上的批注导入成候选，每条批注只试一次，被拒的也记一条 `import`。根 agent 自己遇到的坑用 `lessons_merge new` 直接写。
- 工具：`lessons_query`（所有 agent，worker 在内；GLM 路由上常驻）按 `text`、`file`、`command`、`error` 查生效经验，其后至多两条候选，标 `status: "candidate"` 与 `unreviewed`；`lessons_merge`（根 agent；GLM 路由上延迟，候选提醒里写着它的名字）九种动作：`new`（从候选或自己写）、`into`、`revise`、`confirm`、`retire`、`drop`、`reopen`、`delete`、`restore`。`delete`、`restore` 与恢复人删掉的东西是人的决定：身份为人（输入框的 `/lessons`），或 `llm` 带人的原话（`relay`），没带得 `user_only`；删除是墓碑加快照，不抹掉。子 agent 调 `lessons_merge` 得 `role`，正路是交回结构；`lessons_merge` 的工具面过滤和记忆行的同一做法（`agent/created` 上的不带 `prepend` 的 `system-prompt/assemble` 监听器）。
- 提醒（只给 `isMainAgentFor` 判为主 Agent 的步；`src/data/main-agent.ts` 是唯一的判断，设计行不在时所有根 agent 都算，原因写进行健康）：候选提醒（来源 `glm-hourness-lessons-pending`）在开着的候选集与可见历史里最近一条这种提醒列的不同时才来，压缩之后来一次；开了 30 天的候选在这一步记为过期，`lessons_merge reopen` 恢复，年龄从恢复算起。复发提醒（来源 `glm-hourness-lessons-recur`）：一条经验 28 天内在 3 个会话里被命中或并入，提醒主 Agent 可以向人提规则，一步一条、每个项目每周至多两条，先记 `recur-notified` 再提醒。
- `/lessons show | delete <L-编号> | restore <L-编号> | drop <C-编号>`（输入框，身份为人）；命令行 `npm run -s lessons -- [--cwd 文件夹] show | apply [--file 文件]`（`DEVELOPMENT.md` §13），`apply` 按 `lessons_merge` 的规则以 `llm` 身份写，同签名的跳过，所以同一个文件可以再导一次；会话投影 `hournessLessons` 把项目流水的路径交给将来的经验页。
- 服务给 M7 的另两个成员：`stats`（期间的新增、并入、丢弃、过期、人删、人恢复，开着的候选，每条经验碰到的会话数，删后复发）与 `hygiene`（读不出的行、180 天没确认的经验、超过 7 天的候选、相似的经验、被拒的批注）。
- 失败匹配（`src/lessons/failure.ts`，`tools/post-execute` 上的 host 级监听器，所有 agent 的调用都看得到，子 agent 的也是）：shell 工具（原生名 `pwsh` 或 `bash`，GLM 路由上的 `Bash` 就是 `pwsh`）退出码不是 0 或超时，或任何工具的结果是错误（被 `tools/pre-execute` 拒绝的调用也是），而输出里有某条生效经验的报错片段（规整后的子串，片段至少 8 个字符，颜色码去掉后也要够）时，这次调用的结果多带一条提醒（来源 `glm-hourness-lessons`，至多 2 条经验，最长的片段在前），下一次请求里它紧跟在这次工具结果之后。同一会话里同一条经验不再提醒（可见历史里这种提醒列过的，加上本进程已经推给这个会话的）；成功的调用从不触发；`run_code` 的传输层子调用与没有 agent 的调用不看。每条推出去的经验追加一条 `hit`（会话、agent、调用号、原生工具名），不等写完；写失败只告警一次并进行健康。监听器自己出错时结果原样不动，告警一次，行健康写原因。任何调用都不被拦，下游监听器的决定与上下文原样保留。
- 还没做：派发简报里带经验和交回处理调 `propose`（M7 的派发简报与交回，E1b）、周报里的经验一节（E8）、经验页（步骤 P1）、第一批经验（步骤 S1）；这些等邻居或后面的步骤，经验板自己的部分不受影响。

## 9. 规范体系

### 9.1 规范即数据

每条规范：id、意图与理由、服务的指标、级别、量法、历史。美学条款、guard 规矩、汇报规则都是规范。规范没有试运行的模式：门禁一级的规范从它所在的插件行启用起就拦，人撤下一条规范，撤下的时间与原话记进历史（§6.5）。

### 9.2 升降级阶梯

级别从轻到重：记忆 → 提示词 → 阶段提醒 → 门禁〔定案〕。

- 同类纠正反复出现，升一级。
- 长期零违规，降一级，省上下文也少打扰。
- 周报由系统提议升、降、删，附理由与数据，人用五键拍板。规范的修改也走设计循环。

### 9.3 冲突

美学条款冲突按 `CHARTER.md` §7.2 的顺序裁决，裁决记成决策节点。仓库内已识别的冲突：

| 冲突 | 例子 | 裁决 |
| --- | --- | --- |
| 类型严格 vs 不造轮子、去重复 | `src/shared/schemastery.ts` 是 DSH vendor 版 schemastery 的 875 行拷贝。拷贝的原因是 `@deepseek-ai/schemastery` 在已安装的 profile bundle 中无法解析；两处改动是为了通过本仓库的 `exactOptionalPropertyTypes` 与 strip-types | 待复核：能否改为依赖宿主提供的实现 |
| 每个行为可关 vs 配置面小 | 宪章两条并存 | 「可关」只落在插件行一级 |
| 兼容旧构建 vs 零死代码 | 方言行同时保留 rc.3 与旧构建两条路径 | 只对准 rc.3，删另一条 |
| 失败放行 vs 失败要出声 | 签名失败不可见、guard 审计不落盘 | 照样放行，必须上报 |
| 删净 vs 可追溯 | 文档「废除即删」 | 文档照删，git 与项目图保留 |

## 10. 度量

### 10.1 三层指标

| 层 | 看什么 | 指标 |
| --- | --- | --- |
| 过程合规 | 规矩有没有被遵守 | 门禁拦截数、五栏完整率、简报完整率、主 Agent 写代码次数、节点证据覆盖率、验证债 |
| 产出质量 | 做出来的东西好不好 | 返工率、测试一次通过率、规划漂移、回归次数、新增告警与压制数 |
| 人的体验 | 人是不是坐上了项目经理的位置 | 每个目标打扰人的次数、人亲手改代码的次数（目标为零）、同类纠正重复率、细度拨档频率、决策卡积压与处理时长 |

### 10.2 美学条款量法

| 条款 | 量法 | 工具 | 所在环节 |
| --- | --- | --- | --- |
| 零死代码 | 未使用的导出、文件、依赖为 0 | knip、tsc 未使用检查 | 汇合门禁 |
| 去重复 | 重复代码块数 | jscpd | 汇合门禁 |
| 配置面小 | 每行配置项数、面向人的概念数 | 自写计数 | 设计门禁：新增配置项在架构栏给理由 |
| 命名一致 | 违反项目词表的次数 | 词表放在项目图 | 汇合门禁 |
| 修在根上 | 同一节点或文件的修复次数 | 项目图 | 第三次自动发决策卡 |
| 先搜再造 | 新机制节点是否填写「查过的现成方案」 | 架构栏必填 | 设计门禁 |
| 文档单一事实源 | 重复段落数、孤儿文档数 | 自写扫描 | 运维巡检 |
| 失败要出声 | 空错误处理数、未上报的降级 | lint 规则、行健康 | 汇合门禁 |
| 讲人话 | AI 腔词命中数、首句是否为结论 | 自写检测 | 汇报，只提醒 |

面向人的概念控制在七个以内：项目图、节点、五栏、决策卡、阶段、晨报、规范。其余概念只在内部使用。

### 10.3 防刷指标

- 分数不注入模型上下文。
- 门禁只认证据。
- 审查 agent 定期抽查已关闭节点的证据。

### 10.4 讲人话

LLM 不讲人话，多半是默认在向评审汇报，想显得周全。做法：

1. 告诉它听众是谁、听完要做什么决定。
2. 给细节一个去处：过程与证据写进文件，对话里只留结论与链接。
3. 用户评价为「刚好」的汇报留作范例。
4. 可测量项：首句是否为结论；对话中文件名、函数名、工具名的出现次数；AI 腔词命中数；长度是否落在细度档位区间。只检测并在下一轮提醒，不改写模型原话。

### 10.5 标定的 LLM 能力测试集

尺子是一组标定过的固定基准任务〔定案〕：

- 任务覆盖：小功能、修 bug、重构、长程多步任务、需求访谈。每个任务有输入与可机检的验收条件。
- 记分：完成率、返工、打扰人的次数、积分消耗、违规数。
- 标定：对 GLM-5.3 与 GLM-5.3-Flash 各跑出基线，之后 harness 的每次改动按增量衡量。
- 用途：harness 改动前后各跑一遍；DSH 升级回归；原生通道验收。
- 运行环境：尽量在 L3 headless 沙盒内运行（`DEVELOPMENT.md` §3）。
- 存放〔定案 2026-10-28〕：`tests/calibration/`，入库，每个任务一个目录。M1.7 起步两个任务，M3、M7 扩充。

#### 10.5.1 运行器〔已实现 2026-10-28，`ROADMAP.md` M1.7〕

`npm run calibrate`（`scripts/calibrate/run-calibrate.mjs`）在 `glmsandbox` 上以 headless 方式启动桌面版运行时，经按次生成的覆盖补丁启用原生通道行 `glm-hourness/glm-llm`（provider `glm-zcode`），把默认模型设为被测模型，每次运行把任务的 fixture 复制到该次运行自己的目录（系统临时目录下，见「运行目录」一条）的 `ws/` 并初始化为一个 git 仓库，以它为会话工作目录发出任务提示词，结束后运行任务的验收脚本并记分。这是真实请求，消耗积分。参数：`--tasks`、`--models`（默认 `glm-5.3,glm-5.3-flash`）、`--repeat`、`--max-steps`、`--minutes`（命令行不给时取任务 `task.json` 里 `limits` 的值，任务也没写就是 40 步与 15 分钟）、`--permission`，另有 `--collect <时间戳>`（把没拷回的一批拷回，见「运行目录」）。

- 任务目录：`fixture/`（一个很小的 Node 项目，无依赖，`npm test` 即 `node --test`；需求访谈任务的 fixture 只有 `README.md`、一个 `.gitignore`（忽略 `__pycache__/` 与 `*.pyc`，解释器的缓存不算工作区改动）与空的 `docs/graph/nodes/.gitkeep`）、`prompt.md`（原样发给模型的提示词）、`task.json`（类别与任务允许改动的文件；可选的 `limits`：`maxSteps`、`minutes`，必须是正整数，不是时运行器在开跑之前报错退出；需求访谈任务另有 `human`，给模拟人的配置）、`check.mjs`（验收脚本，在模型结束后以独立进程运行，断言不放进 fixture，模型看不到）。验收脚本的公共部分在 `tests/calibration/lib.mjs`。
- 现有任务：`feature-parse-duration`（小功能：给 `formatDuration` 补逆运算 `parseDuration`；验收：提示词里的例子、对 `formatDuration` 所有输出的还原、12 种非法输入抛 `TypeError`、`formatDuration` 不变、工作区测试通过且新增了 `parseDuration` 的测试、README 写了说明）；`bugfix-csv-quotes`（修 bug：引号字段里的转义引号 `""` 没有跳过第二个引号；验收：报告的那一行、另外 4 种转义写法、6 项无关行为不变、工作区测试通过且新增了测试，并且把 fixture 原来的 `src/` 放回后工作区测试会失败，即新测试确实复现了 bug）。两个验收脚本都核对过：原样的 fixture 不通过，参考解通过。`interview-expense-log`〔M3 第 8 步，类别 `interview`〕：提示词是一句话「我想要一个命令行小工具，每天记一下花了多少钱，月底能看出钱花在哪了。」，模拟人（`scripts/calibrate/simulated-human.mjs`，§3.1）先发 `/wish`、再按 `task.json` 的 `human` 在对话里回话（访谈的 7 个回答、对确认说「对，就这样」、对放行说一句补充再说「可以，放行」；放行批准后的下一个回合末尾说一句收尾「今天先到这，设计到这里就行，实现下次再说。」，此后不再回话、不再记 silent——`human` 的 `stop` 配置，回话照记进 `human.jsonl`），主 Agent 要从一句话走到放行、并在这句收尾之后停住，全在项目图上；`limits` 是 120 步、40 分钟〔2026-11-02 第 12 步（a）标定 0/6：放行之后 GLM-5.3 继续把工具实现并自测了 25 分钟、弄脏工作区，任务的边界原来没说在哪，收尾这句话就是边界〕。运行器对这类任务多挂一行设计行启用、一行问答卡工具（好看到它被去掉）和模拟人（`scripts/sandbox.mjs` 的 `designRows`，同探针），模拟人的回话写进运行目录的 `human.jsonl`。验收脚本读运行目录的 `ws/docs/graph`，查：图没有校验错误；恰好一个目标，已批准、`stage: release`、正文四个标签（需求、问题、给谁、约束）都有、有验收条件与非目标；目标下没有直接的特性（这个小工具一次放行，不分模块；分了模块的路径是第 9 步的 `interview-expense-log-modules`）；至少一个风险；至少一个做完的提议式待决，最后一次拍板带人的原话；至少一个已批准的设计决策五栏齐全、规划从它挂出；目标下没有提议，每个提议过的节点都有一条带原话、`reason` 含 `record_human_answer` 的批准；目标的历史有带原话的批准、改阶段到 `design` 与到 `release`，和一条以「人在对话里补充：」开头的批注；运行目录的 `human.jsonl` 最后一条是那句收尾、最后一次 `turn_end` 在它之后；工作区除 `docs/graph/` 外没有改动（fixture 带 `.gitignore`，`__pycache__/` 与 `*.pyc` 不算改动：跑 Python 原型掉下的字节码缓存不进这一条）。核对过：原样的 fixture 不通过，按整个流程写出的参考图通过，漏放行、没有原话的批准、目标下挂特性、工作区多出文件、模拟人最后一句不是收尾各让它失败（`tests/calibrate-interview-check.spec.ts`）。放行一支（第 9 步）已合入这条分支，仍没有真跑过：真跑要桌面版的会话和积分。`interview-expense-log-modules`〔第 9 步，基线，不是通过条件〕：同一个小工具、同一句话，访谈答案多一句「先做记账，再做月底汇总，两块分开做」，让主 Agent 分成两个模块走两层放行；模拟人对框架放行说「可以，放行」、对每个模块说「可以，放行这个模块」；`limits` 是 200 步、60 分钟（对话里多两次模块放行和每个模块的设计）。验收脚本在上面几条之外查：目标下有两个已批准、`stage: release` 的模块；`norm-directions` 已批准、至少一条方向；目标的放行写入与每个模块的放行写入都带人的原话、`reason` 含 `record_human_answer` 与一页稿的摘要；目标的放行写入不晚于任何一个模块的放行写入；没有哪个模块的放行早于它自己的设计决策被批准。两个任务共用的检查在 `tests/calibration/interview-lib.mjs`。核对过：原样的 fixture 不通过，按两层流程写出的参考图通过，缺方向清单、放行没有页的摘要、模块比框架先放行各让它失败（`tests/calibrate-interview-check.spec.ts`）。
- 数据隔离：覆盖补丁把数据目录行、memory、workflow、hourness 的目录指向本次运行的目录，用量流水与违规流水都落在运行目录里，真实的 `~/.dsh/glm-hourness/` 不变；附件存储同样指向运行目录；另挂 `@deepseek-ai/dsh-workspace-changes`（桌面版 profile 有，沙盒模板没有），guard 的影子兜底照常记录。
- 权限：headless 模板的沙盒策略行与审批行读环境变量 `DSH_PERMISSION_MODE`（缺省 `workspace-write`）。运行器默认传 `danger-full-access`，与用户桌面版 profile 的默认预设一致（`danger-full-access`，审批 `never`）。首次试跑用的是缺省的 `workspace-write`：Windows ACL 沙盒下 `node --test` 派生子进程报 `spawn EPERM`，模型无法确认测试通过，转而申请沙盒升级，headless 没有审批通道，申请失败（`FACTS.md` §3）。
- 边界：覆盖层插入一行只在标定时加载的插件 `scripts/calibrate/limits.mjs`（不属于 bundle）。它对进程内全部 agent（含子 agent）的模型步数计数，第 `maxSteps + 1` 步在 `agent/pre-step` 返回 `reject`，回合以 `blocked` 结束（rc.3 `dsh-agent-loop` 961 行）；首个 agent 创建后满 `timeLimitMs`，以 `{ kind: 'hook' }` 取消所有运行中的 agent（`cancel` 815 行、取消原因 731 行），之后的步一律拒绝。运行器在时间上限之后再等 2 分钟，仍未退出就结束整个进程树。探针有两个场景验证这两道边界（`DEVELOPMENT.md` §3）。边界按任务取：命令行的 `--max-steps`、`--minutes` 优先，其次任务 `limits`，再其次 40 步与 15 分钟；`results.json` 的 `options.bounds` 与每次运行的 `bounds` 记下实际用的值。停在步数或时间上限（`stop` 为 `step-limit`、`time-limit`）的运行记作「边界不够」（`boundaryTooTight`），不当模型的失败，汇总里单列。
- 运行目录〔M3 第 8 步，`risk-calib-read`〕：被测模型能读它叫得出名字的任何路径，运行目录原先在仓库的 `.llm/calibration-runs/` 下，沿着工作区往上走就找得到仓库、别的运行与以前的结果。现在整批在系统临时目录里跑（`scripts/calibrate/run-dir.mjs`）：批目录（`results.json` 写在这里）和每次运行各一个目录（`glm-hourness-calib-batch-*`、`glm-hourness-calib-run-*`），互不嵌套，也不在仓库下；开跑之前把它们记进仓库一侧 `.llm/calibration-runs/<时间戳>/pending.json`（先写临时文件再改名）。整批跑完才一次拷回 `.llm/calibration-runs/<时间戳>/`（每个运行目录拷到 `<时间戳>/<运行名>/`，含 `ws/.git`，不覆盖：目标已有同名的就在拷之前停下），再逐个文件核对相对路径与字节数，全部一致才删临时目录——只删记录里的、而且是系统临时目录的直接子目录、名字以 `glm-hourness-calib-` 开头的，不合这两条的不删、报出来——最后删 `pending.json`。拷回或核对出错时什么都不删，拷了一半的拿掉，`pending.json` 留着，运行器打印「拷回没有完成：临时目录 <路径…> 保留；修好后运行 `npm run calibrate -- --collect <时间戳>`」并以退出码 1 结束；`--collect` 不跑新的运行，只按记录做同样的拷回与清理，运行器中途崩溃留下的一批也这样收。残余：被测模型仍能按绝对路径读仓库（guard 不拦读），也能列出系统临时目录找到同批其他运行；提示词与会话里不出现仓库路径与临时目录路径。
- 事件来源：headless 的 `--json` 输出（`dsh-headless` json-stream 172 行起：`session`、`status` 的 `step_start` / `step_end` / `turn_end`、`tool_call`、`tool_result`、`text`、`final`），任务提示词经 stdin 传入。运行器另存每一行到达的时刻（`event-times.json`，与 `events.jsonl` 里能解析的行一一对应），并在运行结束时等 `events.jsonl` 写完，验收脚本才读它。
- 需求访谈任务的指标〔M3 第 12 步（a），`tests/calibration/interview-metrics.mjs`〕：这类任务的验收脚本在检查之外打印 `metrics`，运行器把它写进 `result.json` 的 `interview`，不在 `acceptance` 里，不影响通过与否。数从运行目录里读：`events.jsonl`、`event-times.json`、`human.jsonl`、`home/audit/violations.jsonl`、`ws/.llm/snapshots.jsonl` 和 `ws/docs/graph`。指标流水的写入接口到位之前（`src/design/metrics.ts` 的 `emitMetric` 什么都不做）靠这些算，之后改从指标流水读。项：`disturbed`（模拟人回话的次数、`propose_to_human` 的 `release` 次数、问答卡请求数）；`shown.notVerbatim`（每次 `propose_to_human` 成功之后，同一回合主 Agent 最后一条消息里没有逐字含返回的完整文字的次数；结果被流的字符串上限截断时只比读得到的前半段，计入 `partialResults`）；`questions`（每种问法与 `confirm`、`release` 各问了几次，返回文字码点数的中位数与最大值，从结果返回到下一个回合开始的毫秒数，一条消息问号多于 3 的次数，不是 `choose` 的消息里的选项写法，`plainWordsIn` 命中的次数与词，「我定了：」的条数，「这类你定」存下的条数，「你定」的次数，跟随率，`propose_to_human` 被拒按原因分，访谈里每条消息的问号数）；`copiedExamples`（工具说明里四道例题的 `text` 或问句出现在给人的文字里的次数，应为 0）；`loops`（框架放行与各模块放行的次数、`page` 被拒、放行 `not_shown`、放行前被 `design-before-release` 拒绝的写入、退回设计的次数）；`records`（`record_human_answer` 被拒的次数与原因，原话不到 6 个码点又没有「我记成」的记录次数，`gate_unmet`）；`rules`（§3.11 每条规则的拒绝次数，影子记录不算）；`snapshots`（存了快照、整件跳过、`git-snapshot` 拒绝按原因码）。模拟人在回合结束时立刻回话，所以“从结果返回到下一个回合开始”量的是主 Agent 把这一回合说完的时间，不是真人的等待。原因码从工具返回的错误文字里认，`tests/calibrate-interview-metrics.spec.ts` 把认法钉在写那些文字的代码上；`git-snapshot` 的违规流水只留纠偏文字，不留原因码，`git-failed`、`timeout`、`list-mismatch` 三个共用一段文字，记成一组。

记分口径（每次运行一份 `result.json`，整次调用一份 `results.json`，含日期、提交与工作区是否有未提交改动）：

| 指标 | 口径 |
| --- | --- |
| 完成 | 验收脚本全部通过 |
| 返工 | 一次成功的文件写入（`Write`、`Edit` 等）落在本次运行已写过的文件上，且两次写入之间跑过 shell 命令。即「改了、跑了、又回去改同一个文件」的次数 |
| 打扰人 | `approval/asked` 会话事件数（`dsh-user-approval` 132 行，交互会话里这一刻会弹审批；headless 无应答方，按拒绝处理）加模拟人回话的次数（需求访谈任务，`human.jsonl` 里 `kind` 为 `reply` 的行数：人在对话里每答一次就是被打扰一次）。`ask_user_question` 调用数不再算在里面，另记为 `forbiddenCalls`：主 Agent 不该调它（访谈在聊天里问），沙盒的工具面也没有它 |
| 积分 | 本次运行用量流水的每条记录按 `FACTS.md` §2.4 的系数计算，非高峰按 50%；公式没有缓存写入的系数，缓存写入按输入计。用量流水含会话标题请求 |
| 违规 | guard 违规流水里的拦截记录数；影子记录另计 |
| 其他 | 结束原因（完成、步数上限、时间上限、被结束、错误）、步数、工具调用与失败数、改动的文件、`task.json` 之外的多余文件、各类 token 数、耗时 |

#### 10.5.2 基线（2026-10-28，提交 `4cb8799`）

每格 3 次运行，均值（打扰、违规、多余文件为合计）。时段 06:10–06:31（UTC+8，周三），全部非高峰；边界 40 步、15 分钟；权限 `danger-full-access`。

| 任务 | 模型 | 完成 | 步数 | 工具调用 | 返工 | 打扰 | 违规 | 多余文件 | 积分（计费） | 分钟 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bugfix-csv-quotes | GLM-5.3 | 3/3 | 5.67 | 6.33 | 0 | 0 | 0 | 0 | 9.45 | 0.63 |
| feature-parse-duration | GLM-5.3 | 3/3 | 11.67 | 13.33 | 1 | 0 | 0 | 0 | 21.61 | 1.50 |
| bugfix-csv-quotes | GLM-5.3-Flash | 3/3 | 6.33 | 7.33 | 0 | 0 | 0 | 0 | 4.15 | 0.95 |
| feature-parse-duration | GLM-5.3-Flash | 3/3 | 10.67 | 13.00 | 1 | 0 | 0 | 0 | 12.17 | 3.60 |

按模型：GLM-5.3 六次全部完成，平均 8.67 步、15.53 积分、1.07 分钟；GLM-5.3-Flash 六次全部完成，平均 8.50 步、8.16 积分、2.28 分钟。工具失败、打扰、违规、影子记录、多余文件都是 0。Flash 在功能任务上输出 token 是 GLM-5.3 的约 3 倍（每次 6.5k–12.4k 对 2.7k–3.8k），所以积分省一半，耗时却长一倍多。基线连同两次试跑共花约 155 积分（计费口径）。

解读与局限：两个起步任务对两档模型都没有区分度（12/12 完成），能拉开差距的只有积分、耗时与返工；区分完成率要靠 M3、M7 扩充的更难任务（重构、长程多步、需求访谈）。每格 3 次，样本小，单次波动明显（同一格的积分相差到 1.6 倍）。headless 没有人，打扰只能按审批申请与提问工具计。用量流水不报推理 token（`reasoningTokens` 恒为 0），推理计在输出里。

## 11. 用量与峰谷

### 11.1 口径

用户套餐为新版积分制〔定案〕。积分公式、系数、高峰时段与额度见 `FACTS.md` §2.4。要点：高峰为周一至周五 14:00–18:00（UTC+8），其余时段（含周末全天）积分按 50% 抵扣。

### 11.2 积分口径〔已实现 2026-10-28，`ROADMAP.md` M6.1〕

原问题〔实读〕：`src/ui/panel.ts`（split 第 5 步起是 `src/report/panel.ts`）把谷时写死为每天 0–8 点，统计的是调用次数而非积分。

现在积分规则只有一处：GLM 通道包的 `src/glm-llm/credits.ts`。高峰提醒（§11.4）、标定运行器（§10.5.1）与探针直接用它；编排层包的面板不导入它，也不内置任何套餐系数，经 `glm-login` 行提供的计价服务 `glmHournessPricing` 计积分（契约在 `src/shared/pricing.ts`，§11.3）〔2026-10-29，split 第 3 步〕。

- 一次调用的积分 = （输入 × Input + 缓存命中 × Cached + 输出 × Output）/ 10000，系数按模型 id 取（不分大小写），见 `FACTS.md` §2.4。公式没有缓存写入的系数，缓存写入按输入计。不在积分套餐里的模型（如 `deepseek-flash`）只计次数，不计积分。
- 高峰为周一至周五 14:00–18:00（UTC+8），14:00 整属于高峰，18:00 整不属于；按 UTC+8 判定，与本机时区无关。高峰按全价计，其余时段（含周末全天）按 50% 计。
- 按模型而不是按 provider 计：旧的 `glm` 路由与原生通道 `glm-zcode` 用的是同一份套餐。
- 修正前的用量记录：原生通道的用量块缺陷修正之前（`DESIGN.md` §4.6a），那版解码器写下的记录输入为 0、没有 `totalTokens`。面板按这个形态（provider `glm-zcode`、输入 0、无 `totalTokens`）识别它们，不计入任何数字，只报条数。其他路由同形态的记录照常计（例如旧 `glm` 路由的空回复）。2026-10-28 的真实流水里没有这类记录（原生通道还没在桌面版会话中用过）。
- 读不出时间或 token 计数的行、不是 JSON 的行，计为「无法读取」，同样只报条数。
- MCP 工具调用（每次 1.2 积分）不在用量流水里，面板不计。

验证：L2 用手算的记录覆盖高峰与非高峰、周末下午、缓存命中与缓存写入、修正前的记录、套餐外的模型、无法读取的行，以及边界时刻（公式在 `tests/credits.spec.ts`，面板在 `tests/hourness.spec.ts`，有、无计价服务各一组）。标定基线的 12 次运行用新模块重算，积分与当时记录的完全一致。

### 11.3 面板

`/hourness` 由三部分组成：晨报，面板，额度。「面板」一节〔已实现 2026-10-28；高峰行、范围行、缺口行与额度一节是 M6 的 P1，项目图 `m6-panel`〕：范围是用量流水的全部记录；先列合计，再按模型列出调用次数、积分、高峰占比（高峰时段的积分占该行积分的比例）与缓存命中率（缓存命中 / 全部输入，全部输入含未命中、命中与写入），然后是不计积分的模型、修正前的记录数与无法读取的记录数。

状态板块〔2026-11-03，`DESIGN.md` §2.6〕：这一节的清单是状态板块的一条 `glm/usage` 条目（`hourness` 行交，`src/report/panel.ts` 的 `usageStatusItems`），`renderHourness` 经收集器 `collectStatus(..., 'agent')` 读回它（`src/report/status.ts`），口径说明行、高峰行与范围、缺口行仍是这一节的版面，输出与改前逐字相同；`usagePanelOf`/`usagePanelLines` 只被条目函数一处调用。高峰行与「额度」一节也是条目〔2026-11-04〕：`rules/peak` 的高峰行（`peakStatusItems`，`/glm-status` 的高峰行同出一词）与 `glm/quota` 的额度几行（`quotaStatusItems`）由 `hourness` 行交，版面照旧；规则行启用后 `rules/peak` 整条归规则行交（`src/rules/status.ts`，`fields` 带档位），`hourness` 行的高峰半条只在规则行的状态视图不在场时交；额度的读数仍发生在人敲 `/hourness` 时（至多三秒，M6 定的时机），条目带那次读数，计价服务不在时这两条不出现、这一节照旧缺席。状态读不到时这一节写「<行> 行的状态暂时读不到：<原因>」并告警一次，不用别处的数顶替。晨报的「用量（今天）」一节仍是本期的切片，等 M7 的报告节次接状态板块时再定它与整本账的关系（状态板块设计 0.3 §10 的第 2 步后一半）。

计价服务〔2026-10-29，split 第 3 步〕：面板经 cordis 服务 `glmHournessPricing` 计积分，每次 `/hourness` 调用时读。契约（`src/shared/pricing.ts`）是首行的口径说明 `basis`、套餐名 `plan`（用在「不计积分（不在 … 内）」一行）、一次调用扣的积分 `charged(model, usage, atMs)`（模型不在套餐里时没有值）与高峰判定 `peak(atMs)`。提供方是 GLM 通道包的 `glm-login` 行，值来自 `src/glm-llm/credits.ts`，所以有服务时面板与上面写的完全相同。

- 没有服务（GLM 通道包没装，或 `glm-login` 禁用）：首行写「没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token」，合计与每个模型列调用次数、未命中输入、缓存读、缓存写、输出与缓存命中率，按调用次数排序；修正前的记录与无法读取的记录照旧只报条数（这条清洗规则按 provider id 识别，与 GLM 包在不在无关）。
- 服务的值形状不对（`basis`、`plan` 不是字符串，或 `charged`、`peak` 不是函数）：当作没有服务。只检查这四个成员，多出的成员不算形状不对。
- `charged` 或 `peak` 抛错：这一条记录计入「无法计价的记录 N 条（计价服务出错），未计入」，面板照常输出。
- 形状不对与抛错每行只在控制台告警一次。`hourness` 行的会话健康说明加「积分口径：已提供」或「积分口径：未提供，按 token 列」，再加「额度：已提供」或「额度：未提供」（服务有没有可用的 `quota` 成员），状态不因此降级；`glm-login` 提供服务失败（例如同名服务已在）时激活照常、命令照常注册，行健康为部分生效并写明原因。
- 高峰行：有计价服务时，面板的第一行写此刻是不是高峰、到几点（或下一个高峰几点），如「高峰：高峰中，到 18:00（GLM 积分套餐）」「高峰：不是高峰；下一个高峰 明天 14:00（GLM 积分套餐）」。文字由公共库的 `peakLine` 写（`src/shared/quota.ts`，`/glm-status` 的高峰行是同一个函数），时刻用服务的 `peak` 与 `nextPeakChange` 算，只用服务给的套餐名，编排层不写任何套餐的时段与系数；时刻按本机时区显示（同一天写 `HH:MM`，次日「明天」，2–6 天内「周X」，其余 `MM-DD HH:MM`），高峰的判定仍按 UTC+8。没有计价服务时没有这一行；`peak` 抛错或不答布尔值时也没有，原因经 `problem` 告警一次。
- 范围与缺口：面板在口径说明（`basis`）之后写一行范围，「范围：384 条用量记录，最早 10-27 17:30；只含经 DSH 发出的请求，ZCode 等其他客户端的消耗不在内」，条数是读得出的记录（含修正前的那些，它们另起一行报条数），最早是其中最早一条的时刻。本地算出的数只覆盖经 DSH 发出的请求，同一账号在其他客户端的消耗只在额度一节里。用量记录被删过的地方由缺口文件说明：`<用户级目录>/audit/usage-gaps.jsonl`（`auditPaths(...).gaps`，`DESIGN.md` §2.4），一行一次删除，字段 `at`、`removed`、`reason` 必填，`detail`、`from`、`to`、`ref` 可选；面板每条合法记录写一行「缺口：10-29 11:12 删去 806 条（理由）；这些调用不在本节的数字里」，读不出的行（不是 JSON，或不合字段的类型与上限）合计为一行「无法读取的缺口记录 N 条，未列出」。缺口不进用量流水本身，用量流水只有一种记录形状。
- 晨报的「用量（今天）」：`morningReport` 把本期的记录交给与面板同一个 `usagePanelOf`，用 `usagePanelLines` 写出，只省去口径说明一行（面板一节写一次）。同一批记录两节给出相同的每模型调用次数、积分、高峰占比与缓存命中率；没有计价服务时两节都按 token 列，各有一行「没有计价服务」。本期的记录由 `reportFromFiles` 的 `since` 筛出，时间读不出的行不进本期（它们只在面板一节计入）。这一节带的缺口行只有本期遇到的：缺口没有 `from`、`to` 时，本期开始早于 `at` 才带；有 `from`、`to` 时，范围的结束不早于本期开始才带；今天的报告期开始于 2026-10-29 的删除之后，不带那一行。读不出的缺口行无从判断属于哪一期，所以两节都报条数。
- 额度一节：有计价服务时，面板之后是「额度」一节，内容是服务的 `quota` 成员返回的视图，由 `quotaLines` 写（`/glm-status` 的额度一段是同一个函数，两处输出相同），调用写 `quota({waitMs: 3000})`，所以命令最多等 3 秒，超时用上一次读数并写「额度：正在读取，稍后再看」，读取在 GLM 包里继续，下一次命令显示新读数。服务在而没有 `quota` 成员（旧的 GLM 包，或成员不是函数）时写一行「额度：GLM 通道包没有提供额度数据」；`quota` 抛错、被拒或返回的不是视图时写「额度：读取出错（消息前 80 字符）」，经 `problem` 告警一次，面板其余照常。额度是服务端的读数，与本地用量流水有没有记录无关，所以用量流水为空时这一节也在。没有计价服务时没有这一节。
- 验证：L2 契约用例（`tests/contracts.spec.ts`）覆盖提供与读取、撤销后按 token 列、形状不对、抛错与提供失败；`tests/hourness.spec.ts` 与 `tests/workflow.spec.ts` 覆盖两节同口径、高峰行的六个时刻、范围行、缺口行与报告期规则、额度一节的各种返回；`tests/glm-quota.spec.ts` 用真实的额度读取器核对永不返回的请求在 3.5 秒内返回；L3 探针在 GLM 场景的最后一步跑 `/hourness`，核对面板经真实的 cordis 服务按积分列出 `glm-5.3`，面板第一行是高峰行。
### 11.4 提醒与排期

- 进入高峰时提醒 LLM〔已实现 2026-10-28，`ROADMAP.md` M6.1；正文按档位选，M6 R1〕。提醒属于 GLM 通道包：正文讲的是 GLM 的积分，高峰时段取自 `src/glm-llm/credits.ts` 的 `peakWindowAt`，时段与结束时刻的文字取自同一文件的冻结常量 `PEAK_HOURS` 与 `PEAK_END_LABEL`；编排层不另做通用的高峰提醒。实现在 `src/glm-prompt/peak-reminder.ts`，由 `glm-prompt` 行装在每个 agent 上，与 todo 提醒、工具检索公告用同一个接缝（`agent/pre-step`，本步组装之后、请求之前）。规则：本步是 GLM 路由，此刻处在某个高峰时段，且请求可见历史（`session.deriveMessages()`）里没有这个时段的提醒，就在本步已接纳的消息之后追加一条 `<system-reminder>` notice（来源 `glm-peak-reminder`，`source.peakWindow` 记这个时段的 UTC+8 日期）。效果：会话在高峰中开始，或上一步在高峰之前，都只提醒一次；之后同一时段的步不再提醒；次日的高峰再提醒一次。状态在会话里，不在内存里，所以续跑与重启后不重复；压缩把这条 notice 移出可见历史后，同一时段的下一个 GLM 步会再提醒一次，因为模型已经看不到它。非 GLM 路由永远不提醒；同一步里它排在 todo 提醒与 deferred 公告之前。时间经可注入的时钟读取（默认 `Date.now()`），单测用假时钟。
- 正文按规则板交出的档位选：服务 `glmHournessPeakMode`（契约 `src/shared/peak-mode.ts`，§16）。规则板管档位；提醒的原文、各档措辞和本节只由 GLM 包改。`glm-prompt` 行的 `apply` 给每个 agent 做读取函数，在要发提醒的那一步读这个会话的 `stateFor(sessionId)`，每发一条提醒读一次，不缓存；压缩后补发的那一条读当时的档位。读不到档位时正文是 M6.1 的原文：服务不在（只装 GLM 包，或规则行没启用）、`stateFor` 为 `undefined`（会话没有项目）、`peak` 不是 `true`（`false`，或规则板读不出是不是高峰），或服务给的值不合契约（经控制台告警，每种原因一次）。同一段高峰里档位改了不再提醒，仍按 `source.peakWindow` 判。notice 的 `source` 在 `peakWindow` 之外记 `peakMode`（`none`、`inform`、`reduce`、`stop`）、有档位时的 `peakModeOrigin`、正文写了上限时的 `peakWorkerCap`、读不到档位时的 `peakModeNote`（`no-service`、`no-state`、`not-peak`、`peak-unknown`、`invalid`），事后从会话日志查得到模型那一刻收到的是哪一段、为什么。
- 提醒正文（本项目的文本，不是 ZCode 原文，不在镜像文件里）。前两句四档相同，由 `PEAK_HOURS.en`、`PEAK_END_LABEL` 拼成（下表写作 `<hours>`、`<end>`）：`Peak hours have started (<hours>). Until <end>, GLM usage is charged at the full credit rate; outside peak hours it costs half.` 第三句起按档位：

  | 读到的档位 | 第三句起 |
  | --- | --- |
  | 读不到档位，或无影响（`inform`） | `This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.`（M6.1 的原文，`PEAK_REMINDER_TEXT`） |
  | 少做（`reduce`） | `<level sentence> Until <end>, <cap half>do not start optional work that spends many GLM credits (calibration runs, ablations, large reviews); the main agent moves such work to after peak, including work it dispatches. Necessary work, and a task you were dispatched for, go on. Do not switch models or plans unless the user asks.` |
  | 不做（`stop`） | `<level sentence> Until <end>, do not dispatch a GLM subagent and do not start a script that spends GLM credits; a GLM subagent whose call comes back deferred stops and reports where it stopped. The main agent is not held on any level: it keeps answering the human and working. Do not switch models or plans unless the user asks.` |

  `<level sentence>` 有两种说法，按 `origin` 选，与规则板每步提醒里那一行用同一种说法：`origin` 为 `default`（项目没选过，出厂少做）时 `Peak mode: <level> (the default; the human can change it).`，为 `human` 时 `Peak mode set by the human: <level>.`。`<cap half>` 是 `run at most <N> GLM subagent(s) at a time and `，只在服务给了正的安全整数 `glmWorkerCap` 且档位是少做时写（N 为 1 时是 `1 GLM subagent`），否则整半句不写；上限的数是规则板的常量 `PEAK_REDUCE_GLM_WORKERS`，M7 在派活处执行的数与这里写的是同一个。
- 提醒只说峰谷计价与此刻的档位要谁做什么，从不换模型、换套餐，也从不叫主 Agent 停下或不回话（`d-main-agent-peak-exempt`）；推迟哪些工作由人选的高峰模式定，档位与执行在规则板（出厂少做，`d-peak-mode`）。少做与不做两档不再写「information only」与「pause or postpone work」：规则板的那一行在这两档要主 Agent 挪开可挪的重活、不派 GLM 子 agent，两句相反的话不能出现在同一步里。不做档的正文只说谁该做什么，不说怎么排队，所以在还没有排队的最小一片阶段与整块规则板阶段都是真的。
- 验证：L2 用假时钟覆盖跨入高峰、高峰中开局、同一时段不重复、次日再提醒、周末、非 GLM 路由、空首步、续跑会话、与 ZCode notice 的先后；用假的 `glmHournessPeakMode` 服务覆盖四档、读不到档位的各种情形（每种记号一例，`invalid` 含服务形状不对、`stateFor` 抛错、层级或来源不认识）、上限不合法、正文与上表逐字相等及它们的字数（第三句起 152、400、345 个字符）、禁用片段（`information only`、`keep working`、`pause`、`postpone`、`defers the tool calls`、`tells you when to continue`）、`source` 的字段、每发一条读一次（含压缩后改档位再补发）（`tests/reminder-wiring.spec.ts`）；常量与 `creditPricing.basis` 逐字不变在 `tests/credits.spec.ts`。L3 探针用只存在于覆盖层的时钟行（`scripts/probe/probe-clock.mjs`，把运行时的 `Date.now()` 平移到周三 15:00 UTC+8）：没启用规则行的场景，第一个 GLM 请求带恰好一条 M6.1 原文的提醒，之后的请求仍只带这一条；同一时钟下的非 GLM 会话没有提醒；按真实时钟运行的 GLM 场景，提醒条数与各请求所在的高峰时段一致（夜间运行时为 0）。启用规则行的场景：`rules-peak`（出厂档位）第一个 GLM 请求带恰好一条少做原文（含 `at most 1 GLM subagent`），之后两次改档位（`/rules peak 不做`、`/rules peak 无影响`）仍只有这一条；`rules-peak-stop`（运行前经规则板的引擎以 `human` 设成不做）第一个 GLM 请求带不做原文，主 Agent 的 `Read` 照常执行。提醒与规则板每步那一行同在一个请求里的 L3，随整块规则板的 S3。
- 高峰时推迟哪些工作由人选的高峰模式定（无影响、少做、不做，出厂少做〔定案 2026-10-30，`d-peak-mode`〕）：设置与执行在规则板，少做的并行上限由 M7 在派活处执行，高峰里只剩被挡的活时 M7 停住自动推进，高峰结束时循环板上编排层的一条 `resume-drive` 并提醒主 Agent。高峰模式只管子 agent 与重活脚本，主 Agent 自己的回话和工具调用任何一档都不受影响；模型与套餐不自动更换。人改档位有三条路：规则页，聊天里的 `/rules peak`，或对主 Agent 说，由它经 `rules_propose`（kind `peak-mode`）提议，人批准才改。今天可用的只有 `/rules peak`，规则页与 `rules_propose` 随整块规则板（§16.6），排队、M7 的执行与 `resume-drive` 尚未实现。
- DSH 定时提醒 `schedule` 的边界〔实读〕：`schedule.create(sessionId, { prompt, title, at | after_seconds | every_seconds | daily | weekly | cron })`（`dsh-schedule` 2083 行）。提醒只投递到创建它的会话，不支持每次新开会话（`dsh-schedule/README.md` 157 行）；宿主必须在运行，投递失败不自动重试，等下一次唤醒、任务变更或宿主重启（153 行）；`every_seconds` 至少 60 秒；子 agent 的会话拒绝创建。到期时投递的是一条用户角色的提醒消息（来源 `{ kind: 'schedule' }`，lib 1594 行），工作由那个会话的 agent 执行。所以排期与巡检用一个固定的运维会话〔规划〕。
- 不设预算约束，花费只披露（§4.3）。

## 12. 运维与晨报

- 巡检：仓库卫生（死代码、重复、过期文档）、图卫生（陈旧节点、无证据的完成）、记忆卫生、依赖与安全更新、指标周报。由 DSH 定时提醒在固定的运维会话里触发（提醒只投递到创建它的会话，§11.4），结果进晨报或决策卡。提醒消息的来源不是 `user`，`dsh-tool-goal` 要求当前回合有人直接发的消息才执行的操作（`create_goal`，`update_goal` 的编辑、暂停、恢复）不会因它而执行。本仓库的依赖与安全更新取 `npm run deps:check` 的输出，处理规则见 `DEVELOPMENT.md` §11：补丁与次版本升级过全部门禁、一次一个提交，主版本升级交给用户，`@deepseek-ai/*` 随桌面版运行时升级。
- 交付指标（DORA）：交付频率、变更失败率、恢复时长。
- 事故：生成无责复盘节点，再变成规范进入阶梯。
- DSH 升级：先跑标定测试集与行为探针。
- 晨报按四答对账：目标完成了多少、哪里偏离了规划、做过哪些计划外决策及理由、待批决策卡、等你定的事（`/hourness` 的晨报已有这一节，读项目图，§5）、花费（积分、峰谷占比）、测试与知识同步状态。花费一节按积分口径写，与 `/hourness` 的面板用同一个函数（`usagePanelOf`、`usagePanelLines`），带本期遇到的缺口行（用量记录被删过的说明，§11.3）；今天的 `/hourness` 开头的晨报已是这样（标题「用量（今天）」），四答晨报沿用这两个函数与缺口规则，不另写一套。晨报遵守汇报细度，带「讲细点 / 说重点」按钮。

## 13. 呈现

风格贴近 DSH 原生〔定案〕。用 DSH 的基础组件库 `ui-primitives`：壳层的客户端模块表里有 `@deepseek-ai/dsh-client-ui-primitives`，第三方静态包可以 `require`（`dsh-web-frontend` 的 `index-BXV-oxvX.js` 中 `OZ()`，与 DSH 主干 `packages/client/web/src/platform.ts` 一致）〔实读 2026-10-28〕。组件名以 rc.3 官方包实际用到的为准：`Button`、`Modal`、`Menu`、`Tooltip`、`Switch`、`SegmentedControl`、`Pill`、`Tag`、`StateDot`、`MarkdownText`、`CodeBlock`、`DiffBlock`、`JsonTree`、`DisclosureRow`、`SettingsForm`、`Toast` 与一组 `Icon*`。颜色用 DSH 主题 token `--dsw-*`。上一版不被接受的原因判断为照着颜色变量手搓组件。

尺寸同样照 rc.3 原生抄，不自己定数（2026-11-03 用户指令「这些 UI 大小都和 dsh 的统一一下」，实读 rc.3 的模块 CSS 取数）：输入框上方条用 GoalBar／TodoPanel 的 dock 几何与材质——`width: calc(100% - 2×(--dsh-composer-side-clearance) - 4×(--dsh-composer-dock-inset))`、`max-width: calc(var(--dsh-composer-card-max-width) - 4×(--dsh-composer-dock-inset))`、`margin: 0 auto`，面板圆角 `--dsw-radius-lg`、条形圆角 `--dsw-radius-md`、高 36px，底为 `--dsw-specific-menu` 加 `--dsw-menu-backdrop-filter`，影子 `--dsw-elevation-panel`（描边色 `--dsw-alias-border-l1`）；条上文字用目标条的字阶（名称 13px/500/24px、正文 13px/20px）。开场卡的标题与批准卡 headline 同阶（15px/500/24px），卡上的动作按钮用 `Button` 原生 md 档（36px 高、14px/22px、radius-md，同批准卡的动作行）。提醒徽章直接用 `Tag` 原生（tone warning：11px/17px/500、内边距 1px 8px、全圆角、底色 warn 色 12% 混入，无描边）。面板里的输入件照壳层 Input 的规格（34px 高、13px、.5px `--dsw-alias-border-l4`、radius-md、`--dsw-alias-bg-layer-3` 底、聚焦转 business 色），多行批注照 user-questions 的多行框（radius-lg、`--dsw-alias-bg-module-platform`、内边距 8px 12px）。`ui/src/flow/styles.ts` 的 `DOCK_BOX`／`DOCK_MATERIAL` 是流程条与开场卡共用的两段几何／材质声明。

| 内容 | 位置 |
| --- | --- |
| 当前阶段与未过门禁 | 输入框上方流程条（同 DSH 目标条的位置） |
| 项目图：架构、层级、五栏逐步长出；开发期进度 | 右侧边栏「项目图」页的「图」与「正在做」两个视图；用项目图引擎自己的布局（§2.12）〔已实现 2026-10-28，§2.10〕 |
| 决策队列 | 同一页的「需要你」与「agent 定的」两个视图〔已实现 2026-10-28〕 |
| 用量、额度、峰谷 | 右侧边栏标签页；输入框下方 pill 显示额度速览与峰谷 |
| 记忆：条目、强度、复审、编辑删除、卫生提醒 | 右侧边栏标签页 |
| 行健康、规范与违规曲线 | 右侧边栏标签页 |
| 登录、账号、套餐、签名与路由状态、版本基线 | 插件管理器中本插件的配置页（命令留作后备） |
| guard 拒绝 | 四段式卡片，渲染在被拒的工具行之后：一个聊天节点定义匹配 guard 拒绝产生的 `tool/result`（结果文本带本项目的标记），做法同 `ui-workflow-run`。按工具名注册的工具行视图（槽 `tool.call.toolview`）只用于本项目自己的工具（图工具、派发工具）；原生工具（`pwsh`、`write`、`edit`）的行由 `ui-tool` 内置，第三方同名注册是覆盖、并列还是报错未核实 |
| 晨报、决策卡、五键 | 会话回合末尾的卡片 |
| 方言档位、汇报细度、各行开关 | 插件管理器自动生成的配置表单（补全 `Config` 声明） |

不上 UI：凭证明文、签名细节、提示词原文（只保留一个只读的「查看本会话方言」调试入口）。

约束：每个包的 client 半只能由一行加载（`DESIGN.md` §2.3）：包自己声明 `dsh.client`，唯一的客户端行以精确包名命名，宿主行写子路径说明符。编排层的界面在 `dsh-hourness` 的客户端面，GLM 通道的 pill 与设置页在 `dsh-glm-zcode` 的客户端面；编排层的客户端源码不得导入 GLM 的客户端源码与 GLM 包的目录，反之亦然（ESLint，`DEVELOPMENT.md` §10）。静态包的 factory 只收到 `require`（模块表），但它导出的 `inject` 与 `apply(ctx)` 会被加载器调用，`ctx` 上是声明过的客户端服务（`DEVELOPMENT.md` §5.6）〔实读〕。由此：

- 可用的落点：右侧栏标签页（`sidebarRightTabs.register` 加正文槽 `sidebar.right.pane.tab`）、全局页面（根作用域 `main` 键控槽）、输入框上方条（槽 `conversation.input.dock`，DSH 目标条在这里）、回合末尾卡片（槽 `conversation.chat.turnTail`）、独立聊天节点（`uiConversation.events.register` 加槽 `conversation.chat.node`）、按工具名的工具行视图（槽 `tool.call.toolview`）。证据：`dsh-client-ui-sidebar-right/README.md` 81–84 行、`dsh-client-ui-plan/lib/client.js` 629–705 行、`dsh-client-ui-layout/README.md` 32 行、`dsh-client-ui-goal/lib/client.js` 604 行、`dsh-client-ui-workflow-run/lib/client.js` 591–660 行、`dsh-client-ui-tool/README.md` 36–41 行。
- 读写：读图文件用 `remote.workspaceFiles`（`read`、`list`、`stat`、`changes` 变更订阅，没有写操作，`dsh-api-workspace-files/README.md` 12 行）；宿主推给客户端用会话投影，投影只能折叠已有的会话事件，第三方插件不能追加自定义事件（`dsh-session/README.md` 70 行）；写回走命令通道 `remote.commands.execute` 或图工具。客户端可调用的 Remote 能力集合在构建时固定，自定义 Remote 服务对第三方不现实（`dsh-api-remotes/README.md` 77–78 行）。

项目图的落点〔已实现 2026-10-28，§2.10「DSH 原生面板」〕：原生右侧栏页面类型，不经 Browser 标签页打开网页（用户不要网页形态）。读经 `remote.workspaceFiles` 读节点文件并订阅变更；面板只看不写（plain-ui，`d-ui-look-not-operate`），要改动经图工具、命令行或人自己打的命令，人和 LLM 的改动走同一套校验。本机查看器与服务在面板可用后删除（`m2-10`）。

## 14. 借用与自建

| 环节 | 借用 DSH | 自建 |
| --- | --- | --- |
| 设计期只读、放行审阅 | 计划模式 `plan-mode` 的提示词节、审阅卡与 plan 状态（不拦工具，§4.5） | 设计期只读（guard）、五栏门禁 |
| 五键、访谈提问 | `user-questions`（同步卡） | 五键语义、拨档与画像 |
| 决策卡（同步） | `user-approval`（只有允许一次 / 拒绝，失败即拒）、`user-questions`（多选项） | 卡面格式、项目经理层问题门禁 |
| 决策卡（异步） | 无（行动卡片只在 DSH 主干，rc.3 没有） | 图上的待决节点、决策队列、命令回写（§5） |
| 分解与并行 | subagent（spawn 后端，后台派发；不用 Agent Team 与工作流引擎，§3.6） | 任务节点的派发属性与写入范围门禁（§3.2）、难度对应档位、补位提醒、简报门禁 |
| 驱动循环 | 会话目标 `goal`、`goal-round-driver`（不用 `tool-ralph`，§2.1） | 由人发起、每拍注入投影、完成门禁；项目图与每拍动作 |
| 汇合门禁 | 工作区文件变更记录 `workspace-changes`（数据只在宿主进程内存里，会话释放或宿主重启后没有） | 测试证据检查、知识同步检查；要跨重启保留的证据写进图 |
| guard 兜底（晚到的拦下与纠正） | `workspace-changes` 的回合摘要（已接入 2026-10-28，接口见 `DESIGN.md` §2.4a） | 与文件工具目标比对、晚到的拦下、下一步之前的纠正提醒（§6.5.2） |
| 运维与晨报 | 定时提醒 `schedule`（只投递到创建它的会话，§11.4） | 固定运维会话、巡检内容、四答对账 |
| 用量底座 | `token-meter`、`session-stats` | 积分与峰谷口径、额度 |
| 外部工具 | MCP 客户端 | 环境分支 |
| 检查器 | 无（rc.3 没有 LSP 包，§7.5） | 检查器运行与回传 |
| 状态机、阶段提醒、流程条、项目图 | 无 | 全部自建 |

借用一栏已于 2026-10-28 对照 rc.3 运行时包只读核查，证据按包与行号写在正文各节与 `FACTS.md` §3；`token-meter`、`session-stats` 只核到服务名与投影键，`mcp-client` 只读了说明文档。与本包插件配合的部分（宿主插件启动后台子 agent、读计划状态、目标轮注入、第三方客户端落点）还要在沙盒或真机上核实，清单见 `ROADMAP.md` 借用组件核实清单。

## 15. 待定项

〔2026-10-28〕用户批准项目图原型（M2.1 选 A），其余事项交给 agent（「其余全部按你的来」）。标「agent 定（按原型）」的各行不再等人逐条批准：按决策分级（§2.9.1）由 agent 定、留痕、人可推翻，在图上合为一张决定者为 agent、已由 agent 拍板的待决 `q-graph-details`。各行的备选与取舍保留，供人推翻时参考。

| 项 | 当前倾向 |
| --- | --- |
| 项目图存储格式与位置（`ROADMAP.md` 2.1） | agent 定（按原型）：`docs/graph/nodes/<id>.json`，规范化 JSON（§2.6）。备选是每节点一个 Markdown 文件、自写 frontmatter 子集解析器，正文更好读，代价是多一个解析器与一套嵌套语法 |
| 批准、否决、拍板、取代的权限 | 定案 2026-10-28（§2.9.1）：人，或带人原话转述的 LLM；决定者为 agent 的待决由 LLM 自己拍，人可推翻。取代原型的「只认 `human`」：人在对话里说过的也算数（用户：「一般情况下是人去图里点或者问 LLM 都行」） |
| LLM 不能改任何节点的验收条件与非目标 | agent 定（按原型）（§2.9）；LLM 自己提议、仍在提议状态的节点除外，包括自己提议的目标（2026-10-29 用户选定，`question-23` A）；带转述时可以（§2.9.1） |
| 图片与查看器的渲染 | agent 定（按原型）：自建分层布局，取代 §13 原来的「渲染用开源库」（比较见 §2.12） |
| 跨进程并发写入 | agent 定（按原型）：只靠修订号检查，不加锁文件（§2.11） |
| 图有校验错误时的写入 | agent 定（按原型）：一律拒绝，人改回文件或用 git 还原后再写（§2.9） |
| 引擎规则细则 | agent 定（按原型）（§2.9）：废弃待决只有人可以；LLM 带 `supersedes` 连线的提议一律等人批准，人的此类提议立即生效；取代只作用于已批准、进行中或完成的节点，被取代的决策验证状态同步转为被取代；`verify` 到沙盒或真机要求退出码为 0 的测试或检查；投影只带最近 5 条历史；「可以开工的叶子」只算任务；`edit` 没有实际改动时拒绝 |
| 渲染细则 | agent 定（按原型）（§2.12）：兄弟节点的初始顺序取创建顺序；重心排序含自身位置，至多扫 4 遍，保留交叉最少的顺序；箭头一律指向后来的一方；连到被折叠节点的连线改连到折叠节点；框内第二行显示 id；图例首行带图修订号；同一列的框等宽；废弃与被取代半透明 |
| 节点文件细则 | agent 定（按原型）：历史条目的字段与写出顺序（§2.9）；选项 key 的格式（§2.6）；解析失败或字段类型不对的文件不进节点表，其余有问题的节点照常显示（§2.6）；`edit` 可以改 `parent`，人能把节点挪到别处（§2.9） |
| 任务派发属性 | agent 定（按原型）（§2.2、§2.6、§2.9）：删除 `owner`；任务节点带 `kind`、`tier`、`worktree`、`outputSchema`、`writeScope`，都可选；`tier` 分 `hard`、`standard`、`simple` 三档，对应 §3.5 的难题、常规、简单；LLM 可以改已批准任务的派发属性，写入范围也在内，验收条件仍只有人能改。备选是写入范围在任务批准后只有人能改。推荐放开：派发本来就是主 Agent 的事，不让它改范围，它只会另提一个范围不同的新任务，安全上没有收益 |
| 决策队列 | agent 定（按原型）（§2.9）：队列只放待决节点，提议另列；按提出时间从早到晚；「提出它的节点」取父节点，来源连线另列；拍板时的理由就是人的附言。2026-10-28 起人的队列只放决定者为人的待决，agent 自己的另成 `agentQueue`，最近的拍板另列 `recentDecisions`（§2.9.1） |
| 命令行细则 | agent 定（按原型）（§2.10）：写命令名就是操作名，只认人的操作也转给引擎，由引擎拒绝并给正路；请求从参数、`--file` 或 stdin 读；退出码 0 成功、1 引擎拒绝、2 用法错误；输出两空格缩进的 JSON |
| DSH 图工具细则 | agent 定（按原型）（§2.10）：每个 LLM 能做的操作一个工具，共 12 个，另加设定焦点的 `graph_focus`；2026-10-28 起 `graph_decide`、`graph_approve`、`graph_reject` 也是工具（§2.9.1），`supersede` 仍不做成工具；行在全局注册，所有 agent、所有路由都有，GLM 请求里常驻；写结果里的节点不带历史；图目录默认是会话工作目录下的 `docs/graph`，目录不存在时只报告、不自动建。备选：合成 `graph_show`、`graph_open`、`graph_apply` 三个工具（工具面小，代价是写工具的 schema 列不出每个操作的必填项）；只给 GLM 路由或只给主 Agent（要另挂组装监听器或识别主 Agent，被 guard 拦下的其他 agent 没有正路）。推荐按原型：图工具是主 Agent 每拍的主要动作，schema 写清楚比工具面小更要紧 |
| 每步投影细则 | agent 定（按原型）（§2.5）：焦点由 agent 调 `graph_focus` 设定，每个会话一个，存在会话历史里，另在内存按会话记一份撑过压缩，不写进图；注入条件按顺序是压缩之后、目标轮、新焦点、正文摘要变化，都不成立不注入；投影不带修订号、历史、节点正文与目标的验收条件和非目标；不分路由，只有设了焦点的 agent 收到。备选：焦点写进图（跨会话可见，代价是每次换焦点都改节点文件、多个 agent 争一个字段）；每步都注入（最简单，代价是每步多几百 token）；正文带目标的验收条件与非目标（治漂移更直接，代价是投影长一倍）；只对 GLM 路由注入。推荐按原型：只在变化时注入最省，焦点属于会话不属于项目 |
| 图文件门禁细则 | agent 定（按原型）（§2.7）：规则由图行注册、跟图行一起启停，排在 guard 行之前判断；拦整个图目录（含 `graph.svg`），图目录不存在时也拦；shell 命令沿用 file-tools-only 对写文件的判断，再看命令文本是否提到图目录；直接拦截；拒绝暂不进违规审计（M1.4 的流水已随 main 合入本分支，接入是合入后的跟进项）。备选：规则放进 guard 行（违规审计与行健康现成，代价是 guard 行要另配图目录，图行禁用时也拦，被拦的一方没有图工具可用）；只拦 `nodes/`（`graph.svg` 可以手改，代价是图片与节点文件可能不一致，新鲜度测试会失败）。推荐按原型：门禁与正路同在一行，开关一致 |
| 查看器细则 | 已删除（2026-10-28，`m2-10`）：查看器随原生面板上线删除，原来的细则在提交 `25d1bae` 的本文 |
| 本项目图的迁移写法 | agent 定（按原型）（§2.13）：用户已定案的内容以 `human` 写入，理由以「迁移：」开头并写出处，其余以 `llm` 写入；历史时间取写入时刻。备选是全部以 `llm` 提议、由用户在查看器里逐个批准，代价是批准之前整张图都是虚线，M1 条目也标不了完成 |
| 合入后进度记在哪里 | 定案 2026-10-28（§2.13）：只记在图上，`ROADMAP.md` 只留里程碑与验收 |
| 面板的界面测试 | agent 定（2026-10-28）：查看器页面随原生面板上线删除，原题作废。面板用 Node 自带的 WebSocket 经 Chrome DevTools 协议驱动 DSH 桌面端核对（截图、DOM、点击），不新增依赖；要启动桌面端，不进每次的 `npm test`，作为面板改动的验收步骤 |
| 查看器在 DSH 里的落点 | 定案 2026-10-28（§2.10、§13）：原生右侧栏面板，M2 做，不经 Browser 标签页打开网页 |
| 草稿区位置 | 工作区内通用目录，汇合门禁检查 |
| 小改动简报的简化形态 | M7 设计 |
| 审查 agent 的模型档位 | M7 设计 |

## 16. 规则板（最小一片）〔已实现 2026-10-30，L2、L3；行默认启用（2026-11-04 的启用提交起；此前禁用），桌面版首轮验收未做；纯核心 §16.8 已实现 2026-10-31，L2，调用方是 §16.10 与 §16.11；写入引擎的操作 §16.9 已实现 2026-11-01，L2，调用方是 `/rules` 与测试；`checkCall` 与命令行 §16.10 已实现 2026-11-01，L2，调用方只有命令行与测试；工具调用门、`rules_show` 与完整的 `/rules` §16.11 已实现 2026-11-01，L2、L3；等待单、唤醒、转交、每步提醒与心跳 §16.12 已实现 2026-11-02，L2、L3；高峰不做与少做的执行、goal 的暂停与恢复、主 Agent 的高峰一行 §16.13 已实现 2026-11-02，L2、L3〕

完整设计是 `.agents/tasks/rules/design.md`（不入库，版本 0.10，评审通过、人放行）。自举之前只做其中的一片（项目图 `d-rules-peak-slice`，设计 §16.1）：每个项目一个由人选的高峰模式档位，加少做档的并发上限，经一个服务交出。这一片是整块设计的子集：整块规则板以后往同一批文件里添加，不改写、不删除这一片写下的任何东西。能这样，靠存下来的形状有一条规矩（§16.3）：为空的集合不出现在存档、流水记录的摘要和规则文件里，整块规则板添上它的集合之后，这一片写下的记录照样核对得上。发给模型的高峰提醒与它在各档下的措辞见 §11.4（GLM 通道包），规则板不碰。

### 16.1 档位与上限

- 三档：无影响（`inform`，只提醒）、少做（`reduce`，出厂默认，`d-peak-mode`）、不做（`stop`）。档位按项目存，只有人能改（§16.4）。三档只在 GLM 高峰时段里起作用：此刻是不是高峰读 GLM 包的计价服务（`glmHournessPricing.peak`，`src/shared/pricing.ts`），规则板不带时段表。读不出（没有计价服务、`peak` 抛错或返回的不是布尔值）时三档都不起作用，`PeakModeState.peak` 为 `undefined`，不带上限与挡住的标记；同一条警告每个宿主进程只出一次。
- 少做的并发上限：同一时间在跑的、经 `dispatch_task` 派出且模型为 GLM 的子 agent 至多 1 个（写任务、审查、检查都算），常量 `PEAK_REDUCE_GLM_WORKERS`（现在是 1；少做的说明文字 `PEAK_LEVEL_WORDS.reduce.half` 和 `/rules peak 少做` 的回话里的数字由它算出，不另写，`tests/peak-mode.spec.ts` 钉住文字里的数与常量相同）。数归规则板，执行归派活（M7）：派活在派模型为 GLM 的子 agent 之前读一次 `stateFor(<主 Agent 的会话>)?.glmWorkerCap`，有值就照它数在跑的 GLM 子 agent，没有就照自己的槽位；派活不加别的高峰逻辑。这一片不含派活，所以上限现在只是服务里的一个数。
- `glmWorkerCap` 只在 `peak === true` 且档位为少做时有；`peakHoldFor` 只在高峰里、结束时刻读得出、档位为少做或不做时有值（`{level, until}`，与同一时刻 `stateFor` 的档位和结束时刻一致）。两者由 `src/shared/peak-mode.ts` 的 `peakModeState` 与 `peakHoldOf` 一处算出。这一片没有等待单，不做档的 `peakHoldFor` 对所有会话一视同仁（整块规则板的「本次高峰照常做」只改 GLM 子 agent 的单）。
- 主 Agent 不受高峰模式影响（`d-main-agent-peak-exempt`）：行不在 `agent/pre-step` 里动消息，不暂停 goal；`peakHoldFor` 有值说的是它派 GLM 子 agent 与跑重活脚本的那部分活被挡着，规则板自己什么都不拦。行注册了工具调用门（§16.11）：不做档下，GLM 子 agent 的工具调用和派 GLM 子 agent 的调用排队（等待单、暂停 goal，§16.13），主 Agent 自己的调用在三档下都不被档位拦，也不暂停它的 goal。

### 16.2 服务

规则行提供 cordis 服务 `glmHournessPeakMode`，契约在公共库 `src/shared/peak-mode.ts`（GLM 包不能导入 `src/rules/`，所以契约放在两个包都编进去的地方；方向与计价服务相反：编排层提供，别的行读）。`peakModeService(ctx, problem)` 是读取函数：服务不在时为 `undefined`，成员类型不对时为 `undefined` 并回调 `problem`。

| 成员 | 给什么 |
| --- | --- |
| `stateFor(sessionId)` | 会话所属项目此刻的 `PeakModeState`：`level`、`origin`（`default` 或 `human`）、`at`、`peak`、`until`、`glmWorkerCap`。只读内存与计价服务，不抛错；会话不在本宿主上、没有工作目录或不在项目里时为 `undefined` |
| `stateForProject(cwd)` | 同上，按目录，给不在本宿主上的会话用；不写文件；项目状态读不出（读文件抛错）时为 `undefined`，不冒充出厂默认 |
| `peakHoldFor(sessionId)` | 见 §16.1 |

会话的工作目录来自 `agent/created` 与 `/rules` 的调用参数，会话结束（`session/disposed`）时忘掉；登记里没有的会话再问宿主的 `agents` 服务（行在运行中途启用时仍然答得出）。读它的各方在用的那一刻读一次，不缓存：档位改了，下一次派活和下一条提醒就按新的走。行卸载时服务随 `ctx` 撤回，读的一方按读不出处理。

规则行另提供 `glmHournessRules`（`src/rules/service.ts`，契约与读取函数 `rulesService(ctx, problem)` 同样不导入规则行）：现在只有一个成员 `declaration`，guard 读到它就在 `glm:guard` 节末尾多写这一行（§16.11）。

### 16.3 存放

按项目，规则板不写任何用户级的文件（`d-rules-in-repo`）。项目根按会话头的 `cwd` 往上找 `.git`，git 工作树经 `commondir` 回到主检出，所以主检出与它的工作树是同一个项目（`projectOf`、`gitDirOf`，在 `src/data/project-root.ts`，只读文件，不起 git 进程；它不是规则板专用的：仓库里只有这一份项目根的算法，M5 的数据目录与其他板块直接用它，不再写第二份）；不在 git 仓库里时只认已有 `.llm/` 的目录，用户主目录与盘符根永远不是项目。

| 位置 | 内容 | 进 git |
| --- | --- | --- |
| `<项目根>/docs/rules/rules.json`（行配置 `dir` 可改，相对项目根或绝对） | 人定的部分（`RepoRules`，`repoPart(state)` 一处取出）：`peakMode`、项目范围的规则 `rules`、开关与信号的定义和人手值 `signals`（不含检测器量出的值 `detected`）、检测器 `detectors`、每个脚本条目的引用 `scripts`（`{file, sha256, lang}`，不含批准时刻）。会话规则、检测值、等待单、提醒和恢复记录不在其中。键按码点排序、两个空格缩进、换行结尾，为空的集合不出现（`repoJson`）；人决定过什么之后才有这个文件 | 是 |
| `<项目根>/.llm/rules/journal.jsonl` | 流水，事实源，只追加；每条记录带它写出的状态的摘要 | 否 |
| `<项目根>/.llm/rules/journal-<最后的 seq>.jsonl` | 满了（8 MiB）而被换下来的旧流水，留作审计；新流水的第一条是带完整状态的 `base`（§16.9） | 否 |
| `<项目根>/.llm/rules/hosts/<pid>-<启动毫秒>.json` | 宿主的心跳，只有那个宿主自己写（规则行，每 15 秒，§16.12）；写入的规划读它的 `at`（45 秒内算宿主在），判断等待单的宿主还在不在（§16.9） | 否 |
| `<项目根>/.llm/rules/state.json` | 状态快照，流水推出的缓存 | 否 |
| `<项目根>/.llm/rules/repo-written.json` | 规则板最近一次写成的 `rules.json` 的摘要，用来分清「规则板欠一次写」与「别处改了它」 | 否 |
| `<项目根>/.llm/rules/rules.lock` | 写锁 | 否 |
| `.state.json.pending`、`.state.json.replaced-<时刻>`、`.journal.corrupt-<时刻>`、`.rules.json.outside-<时刻>` | 改名失败留下的新快照；恢复时被替换的旧快照；有读不出的行时整份复制的流水或截掉的末行；被规则板以外改过的 `rules.json` 的原样副本 | 否 |

`.llm/` 要在项目的忽略文件里，任何项目都一样（`d-rules-in-repo`）：第一次写 `.llm/rules/` 之前，规则板把 `.llm/` 追加进项目 git 目录的 `info/exclude`（`ensureIgnored`，在 `src/data/project-root.ts`，M5 的项目目录服务复用它；入口 `ensureRuntimeDir`，`src/rules/store.ts`，写入口和 `settleProject` 建目录前都经它）。`info/exclude` 属于这份克隆、不入库；`info/` 不在就建；文件里已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 之一（两侧空白不计）就不再加；不在 git 仓库里时不加（`.git` 是文件时用它指向的 git 目录）。只读状态（`loadState`、`readProject`、没有待办的 `settleProject`）不建目录也不动这个文件。写不进 `info/exclude` 时这一次写入得 `io` 错误，不在没被忽略的情况下建 `.llm/rules/`。本仓库的 `.gitignore` 本来就有 `.llm/`，这里只是多一条本地的。

- 写：`openRulesBoard({projectRoot, rulesDir}).apply(actor, request)`（`src/rules/engine.ts`）是唯一的写入口。顺序：核对请求形状（`src/rules/request.ts`）与身份（`src/rules/permissions.ts`，一个操作一行，§16.9；身份不对得 `forbidden` 和怎么做），取写锁（`wx` 创建，持有者不在或超过 10 秒的锁被接手，等 2 秒仍取不到得 `busy`；Windows 上创建时别的进程正在删上一把锁会得 `EPERM` 而不是已存在，同样等，等满仍是 `EPERM` 就如实报错而不报 `busy`；实现在 `src/data/lock.ts`，不是规则板专用的：仓库里只有这一份文件锁，M7 的门禁锁（§17.6）已经在用它，M5 以后也用它，不再写第二份；规则板用它的默认值，不传 `LockOptions`），先把读到的待办落实（恢复、从规则文件开始、欠的写），核对修订号 `rev`，规划（`src/rules/plan.ts`，时钟、心跳目录与流水相关的决定都在这里做完、写进记录的 `changes`，含清理与到期，§16.9），再确认锁还是自己的，流水满了先换新（§16.9），追加流水并 `fsync`，原子替换快照（改名遇 `EPERM`、`EBUSY` 按 20、40、80、160、320 毫秒重试，仍失败留下 `.state.json.pending`），最后在人定的部分变了时导出 `rules.json`（人定的部分变成空的就删掉它）。请求要的已经是现状时（同一档位的重复选择、状态已经是那样的等待单）不写任何东西。
- 状态的形状（`ProjectState`，`src/rules/model.ts`）：`peakMode`、`repo`、`recovered`、`unresolved`，加整块规则板的集合，都按 id 存成对象：`rules`（人设的项目规则与会话规则）、`signals`（开关与检测器的信号：定义、人手值、检测器量出的值）、`detectors`、`scripts`（脚本钉 `{file, sha256, lang, approvedAt?}`，键是条目 id）、`tickets`、`notices`，以及标量 `nextTicket`。一处改动 `Change` 只有两种路径（另可带 `cause`：`prune` 或 `expire`，写入时顺带的清理与到期，重放只照改动做，§16.9）：一层 `['peakMode']`、`['repo']`、`['recovered']`、`['nextTicket']` 整个替换或删除，两层 `[集合, id]` 替换或删除集合里的一项；`proposals` 不在这一版的状态里（只有同意的路能产生它，那条路还没有），路径写它得 `not a path of the state`。`stateProblem` 逐项核对每个集合（`src/rules/entries.ts` 管信号、脚本钉、检测器、等待单、提醒，规则用 `validateRule` 的 `stored` 模式：时间依赖与跨条目的限制不查，期限已过的规则、引用了后来被删的信号的规则照样存得下）；键叫 `__proto__` 的条目不收。`changesBetween(前, 后)`（`src/rules/store.ts`）给出把一个状态变成另一个的 `changes`，按键的码点顺序，每个不同的字段或条目一条。
- 状态只经 `applyRecord(state, record)`（`src/rules/store.ts`，纯函数，不读时钟、文件与进程表）改变，写入与重放走同一个函数。重放逐条核对摘要：缺字段或摘要对不上的行（引擎以外追加或改过的）不生效、列入 `unresolved`；读不出的行把链断开，之后的记录不生效，直到一条带完整状态的 `base` 或 `recovered` 记录作锚点。快照清零、截断、被改，流水被截短或最后一行没写完，都按流水重建，旧快照原样另存；重建的结果与出事之前的状态摘要相同（`tests/rules-store.spec.ts` 的性质测试，5 个种子）。
- 读不取锁、不写文件（`loadState`、`readProject`）；落实待办的是持锁的 `settleLocked`，在会话创建与每次 `/rules` 时由行调用。读者碰上写入者在追加与改名之间时，在内存里重放得到新状态，持锁重读后发现已一致就什么都不写。
- 仓库里的规则文件（`src/rules/repo.ts`）：判定按流水，不按文件，因为 git 的切换、合并、回退和脚本都能换掉它。规则板写成之后文件被别处改了（摘要与 `repo-written.json` 的一致、与状态的不同），改动不生效，原样副本另存，差别记进状态（`repo.outside`），行健康写明；文件又改回规则板写的那一份时自己清掉。项目还没有自己的流水与快照（新克隆、换电脑、删了 `.llm/`）而文件里有决定时，状态从文件开始，写一条 `base` 记录。git 正在合并、变基、拣选、二分或持有索引时（`MERGE_HEAD`、`REBASE_HEAD`、`CHERRY_PICK_HEAD`、`rebase-merge`、`rebase-apply`、`BISECT_LOG`、`index.lock`）不写仓库里的文件，档位照流水生效，文件在 git 做完之后的下一次落实时写。规则板不提交、不暂存、不切分支。
- 文件里有任何决定（不止档位）而项目没有自己的状态时，状态从文件开始，整份文件先过 `parseRepoRules`（每个条目的形状，规则用 `validateRule` 的 `stored` 模式；会话范围的规则、带 `approvedAt` 的脚本钉、带 `detected` 的信号、等待单与提醒都不是文件该有的，得到一句指到字段的原因，文件不生效）。从文件读入的脚本钉没有 `approvedAt`：git 历史里没有「谁看过这段原文」，一段随 git 来的脚本在这台电脑上不跑（设计 §7.5、F84；图上的批准记录那一支要等同意的路，它合入后加在 `repo.ts`）。`unapprovedScripts(state)` 列出在用的规则与检测器里没有批准的脚本，原因是 `no-pin`（没有钉）、`not-approved`（钉着但没有批准时刻）、`changed`（钉和条目写的不是同一份字节）；行健康逐条写「这台电脑上没有你看过原文的记录，先不跑」，行不因此降级。批准时刻只由同意的路写，那条路还没有，所以今天所有带脚本的规则都在这一支。基础写入先把文件摘要记进 `repo-written.json` 再追加 `base`：两步之间崩溃，下一次读取仍是新克隆，照文件重新开始，不会把以后别处对文件的改动当成「规则板欠一次写」而覆盖掉。
- 文件被规则板以外改过之后，人有两条路（都是人的记录，设计 §7.5；调用它们的引擎操作 `repo-adopt`、`repo-restore` 随命令一起来，这一步先把写路径放进 `repo.ts`）。`adoptRepoLocked`（`repo-adopt`，「照改」）：整份文件先核对，读不出或已被删掉就拒绝并回原因，什么都不写；核对过就以一条记录把文件的人定部分写进状态（`changes` 是 `changesBetween` 给的逐条差别，含 `repo`），会话规则、检测值、等待单、提醒、恢复记录留着，规则保留自己的 `origin`；名字和字节都没变的脚本钉留着这台电脑上的批准，新的或变了的不带批准，回话里的 `needsRepin` 列出它们；文件不重写，它的摘要成为状态的摘要并记为规则板的，所以文件保持人留下的样子、与状态同步。`restoreRepoLocked`（`repo-restore`，「忽略」）：先丢掉 `repo-written.json`，再以一条记录清掉 `repo.outside` 并把 `repo.digest` 设为规则板自己那一份的摘要，最后把规则板自己的文件写回（git 正在做事时延后；一次写不成留给之后落实）；什么都没决定过时规则板自己的文件是「没有文件」，被人加上的那份删掉（原样副本留着），git 正在做事时这一删延后，文件会再被当作一次文件被别处改过，直到人再要一次。没有外部改动时两个函数都什么都不写。两个函数在持写锁、`settleLocked` 之后调用。
- 状态里没有设计里的 `root` 字段：摘要要是覆盖项目路径，文件夹改名或搬家之后所有记录都对不上。
- 为空的集合不进存下来的东西（`withoutEmptyCollections`，`src/rules/model.ts`）：存档、带完整状态的 `base` 与 `recovered` 记录、每条记录的 `snapshot`（`stateDigest` 先去掉空集合再取摘要）和 `rules.json`（`repoJson`）里，值是空对象的顶层字段一律不出现；`applyRecord` 删掉集合里最后一项时同样去掉整个字段。所以状态加上 `rules`、`signals`、`tickets`、`scripts` 等集合之后，集合还空着时摘要仍与最小一片写下的相同：最小一片写下的流水不需要迁移，重放也不需要知道形状在哪一条记录之后变过（`tests/rules-store.spec.ts`：最小一片写下的流水、快照与规则文件按字节放进来，在完整形状上逐条核对得上、文件仍是同步的；带着空集合的状态摘要相同；集合里的项删光之后摘要回到没有过这个集合的状态）。读到空集合（`unresolved: {}`）不算错，摘要按没有算。这是设计 §7.2、§7.5 写明的规矩，不另起版本号：`ProjectState.version` 从头就是 2，有效快照的 `version` 也是 2。
- 提交 `c7e7fa4`、`ed80a99` 的那一版把空的 `unresolved: {}` 算进了摘要，它写下的记录在现在这一版上核对不过（重放判为不是规则板写的，行健康降级）。那一版默认禁用，本机各检出里没有它写下的 `.llm/rules/`；若别处有，删掉项目的 `.llm/rules/`，规则板照仓库里的规则文件重新开始。

### 16.4 命令

`/rules`（子命令的全表在 §16.11），由 `glm-hourness/rules` 行注册；斜杠命令只有人能发，所以身份固定为 `human`。`peak [无影响|少做|不做]`（也认 `inform`、`reduce`、`stop`）：不带档位回现在的档位、来源（出厂默认，或「你在 HH:MM 选的」）、此刻是不是高峰与到几点，后面接三档的说明（`peakModeIntro`）；带档位就改，回一行，说明档位从下一次工具调用和派活起生效。其他子命令（`show`、`lift`、`delete`、`on`、`off`、`set`、`clear`、`let`、`cancel`、`recovery`）各写自己的操作，别的字回用法。回话里的时刻按本机时区。人在对话里让主 Agent 改档位的路（`rules_propose` 与 M3 的 `propose_to_human`、`record_human_answer`）依赖 M3 第 6 步，不在这里；命令是现在唯一的改法，所以 `peakModeIntro` 只写命令。

### 16.5 行健康与降级

行 `rules` 在 `HOURNESS_ROWS` 里，按会话上报（`src/rules/row-health.ts`）：项目名、档位与来源、此刻是不是高峰（读不出时写原因，不降级：只装编排层包是支持的组合）。部分生效的情形：`/rules` 或 `rules_show` 没注册上、两个服务（`glmHournessPeakMode`、`glmHournessRules`）之一没提供上、会话事件没注册上、会话不在项目里、门读状态失败或判定出错（只那一次调用的上报，下一次能读的调用换回正常）、存档与流水对不上或有没生效的记录、仓库里的规则文件读不出或被改过、读状态失败；等待单的几种（没记下、改不了、宿主没有 `agents` 服务或读它抛错、唤醒发不出、因本宿主心跳超时被过期，§16.12，这些也是只那一次的上报）。`config.dir` 不是路径、工具调用的门装不上时未生效。激活期不抛错。读状态失败只让这一次读不出，不影响别的会话。

出路：有没生效的记录时，行报部分生效，消息写出编号和命令「`/rules recovery <编号> 照改` 或 `/rules recovery <编号> 忽略`」（§16.11）；处理完，下一次读状态时不再报。存档被改过（`snapshot-modified`）和流水被截短（`journal-shorter`）这两种没有清除它们的操作：行从此每个会话都报部分生效，消息的结尾写同一个出路：要清掉，删掉项目的 `.llm/rules/`，规则板照仓库里的规则文件重新开始，下一个会话就不再报（`tests/rules-row.spec.ts`）。选这一条而不是「状态一致了就清掉原因」：前者只是消息文字，后者要新增一种清除记录和它的触发条件。重建过且没有损失的几种（存档没跟上、存档坏了、流水末行没写完）只说明，不降级，也不用清。

### 16.6 这一片没有做的

整块规则板的其余部分，写下的代码按它们能直接加进来的形状留着，没有留空桩：规则页与面板、人加的规则与检测器、脚本与脚本执行器、指标事件（`rules.check` 的形状与可注入的出口已有，§16.10；其余事件与接收方没有）、`rules_propose` 工具、默认规则 `GLM_PEAK_PRICING` 与按档位启用的附属条目（纯代码，§16.8；门判定它们，不做档的两条排队，§16.13）、`openRulesBoard` 的 `projectDir` 参数（设计 §7.4 有；没有调用方给它值，数据目录服务还没有 `projectDirOf`，运行时目录固定为 `<项目根>/.llm/rules/`，`.llm/` 的忽略条目也按项目根算；M5 的项目目录服务合入、规则行要按它放运行时目录时再加，两处一起改）、`hits.json`、`RulesService` 的 `attachable`、`acceptProposal`、`staleEntries`（`glmHournessRules` 只有 `declaration`，§16.11）、对话里改档位的提议一路、少做档的并行上限由派活执行（M7 还没读 `glmWorkerCap`）、高峰结束时叫醒主 Agent（循环板）与高峰里停住自动推进（M7）。

### 16.7 验证

L2：`tests/peak-mode.spec.ts`（共用契约：上限与挡住的标记、读取函数、文字与少做那句里的数、`nextPeakChange`）、`tests/rules-model.spec.ts`（`effectivePeakMode`、序列化、规则文件、状态校验、完整形状的每个集合、规则文件逐项核对、`diffRepo`、`adoptRepo`、`unapprovedScripts`）、`tests/rules-store.spec.ts`（设计 §7.5 表里每一种情形、性质测试、锁、两个进程同时写、规则文件的各种情形与 git 操作、为空的集合不存、最小一片写下的文件按字节放进来仍核对得上、`changesBetween`、第一次写之前 `.git/info/exclude` 里的 `.llm/`）、`tests/rules-repo.spec.ts`（真实 git 仓库里设计 §7.5 末表的每一行：新克隆、`git checkout` 旧版、手改、`MERGE_HEAD` 期间只写流水与快照、`repo-adopt`、`repo-restore`、两者的崩溃点；没有 git 时整个文件跳过并写明原因）、`tests/rules-engine.spec.ts`（身份表的每一格、请求校验、修订号、写入的产物、`busy` 与 `io`、项目根）、`tests/rules-ops.spec.ts`（每个操作：对的身份写一条记录、重放得到状态、做不了的请求得一句话且不写任何文件；清理与到期的每一种、重放不要时钟和心跳目录；恢复的照改与忽略）、`tests/rules-property.spec.ts`（§16.9 的性质测试，5 个种子）、`tests/rules-check.spec.ts`（`checkCall` 与命令行，§16.10）、`tests/rules-metrics.spec.ts`（指标事件的出口）、`tests/rules-row.spec.ts`（假宿主上的行：命令与各子命令、服务、健康、恢复之后降级的出路、三档下主 Agent 的调用照常执行、激活期降级、补丁里的出厂状态（默认启用）；心跳文件与每步提醒，§16.12）、`tests/rules-gate.spec.ts` 与 `tests/rules-host.ts`（门与 `rules_show`，§16.11）、`tests/rules-tickets.spec.ts`（等待单，§16.12）。L3：`npm run probe` 的场景 `glm-rules`、`non-glm-rules`（§16.11）、`rules-queue` 与 `rules-handover`（§16.12）与 `rules-peak`（GLM 与编排层两个包，平移到周三 15:00 UTC+8 的探针时钟，临时 git 工作区：出厂档位、`/rules peak 不做`、`/rules peak 无影响`，每步经真实的 `/rules` 处理函数与服务读回状态；第一步 `/wish` 使会话成为主 Agent，`rules_show` 列出默认规则，主 Agent 的请求里有高峰一行且只在变化时再出现，GLM 包的高峰提醒恰有一条、规则板的提醒不复述它，§16.13）、`rules-peak-stop` 与 `rules-peak-stop-exit`（§16.13）与 `rules-peak-hourness`（只装编排层包：没有计价服务，没有上限与挡住的标记）。L4（桌面版重启后核对）未做。纯核心（§16.8）的 L2 是 `tests/rules-model.spec.ts`（规则的校验）、`tests/rules-judge.spec.ts`（事件、有效值、条件、判定、合并、未批准的脚本）、`tests/rules-builtin.spec.ts`（默认规则、三档、目录）和 `tests/contracts.spec.ts` 里的目录一条。

### 16.8 纯核心（`src/rules/events.ts`、`model.ts`、`judge.ts`、`signals.ts`、`builtin.ts`，`src/guard/catalog.ts`）〔已实现 2026-10-31，L2；调用方是 `checkCall`（§16.10）与规则行的门、`rules_show`（§16.11）〕

设计 §2.2 至 §2.4、§3、§10.1、§12 的纯函数部分。规则行接上它的是门（`tools/pre-execute`）、`rules_show` 与 `checkCall`（§16.10、§16.11）；这一节只写这些纯函数。这几个文件只用公共库和 `src/loops/trigger.ts`（以及图的 `schema.ts` 里的阶段名和节点 id 格式），不导入 Node 内置模块，不读时钟、文件和环境：判定的时刻、信号和调用的字段都由调用方给。

- 四个事件（`events.ts`）：`gate.tool-call`、`gate.dispatch`、`gate.trunk-advance` 要拦，`rules.step` 不拦、只给只告知的规则。声明用循环板的 `LoopEventDeclaration`，合成 `RULES_EVENT_TABLE`；`gate.trunk-advance` 带 `gateOnErrorDefault: 'block'`，其余不带。`gateEvents(call)` 一处造出一次调用推出的事件：`gate.tool-call` 总有，调用方说它是派活就另有 `gate.dispatch`（没写被派的模型或任务时 `targetModel`、`task` 为空串），说它让主干前进就另有 `gate.trunk-advance`；命令文本取前 8 KiB，参数副本至多 64 KiB（多了截成字符串并带 `argsTruncated: true`，序列化不了的不带），调用读不出的字段（角色、模型、会话）不进载荷，不猜。`stepEvent` 造 `rules.step`；`modelId` 把请求头的路线写成 `提供方/模型`，没有 provider 时 provider 段为空，没有模型时没有值。哪个工具名算派活、什么算主干前进，由调用方在规则行里定。
- 规则的形状（`model.ts`）：`Rule` 是循环板的 `when` 加 `filter`，再加规则板自己的 `condition`（信号、时钟、阶段的三值组合）、`onUnknown`、动作、期限、理由；动作是 `block`、`queue`、`record`、`inform` 四种执行方式之一，或人看过原文同意的脚本（`ScriptAction`）。`BuiltinRule` 是代码里的条目：范围 `builtin`，没有脚本，另有 `toldBy`、`partOf`、`enabledBy`、`ticketPerSession` 四个只有代码能用的字段。`effectOf` 取动作的执行方式，脚本没有。
- 规则的校验（`validateRule(input, context)`，设计 §12）：返回 `{path, message}` 的列表，空表示没问题，不抛错。查：id、标题（一行，至多 120 个字符）、理由（至多 2000 个字符）、来源（节点 id 格式）、范围与会话；`when` 只收规则板的事件（`gate.` 的一到三个不重复，或单独的 `rules.step`），`filter` 按事件的声明交给循环板的 `validateWhen`（`allowGate: true`），再补模型 id（`in` 至多 10 个，`提供方/模型` 两段都不空）、写入目标（相对路径、`/` 分隔、无 `..`、只有 `*` 与 `**`）、工具名（至多 20 个）和角色的取值；动作与事件的搭配（`rules.step` 只配 `inform`，要拦的事件不配 `inform`，筛选里有 `writes` 的不配 `queue`）；脚本动作的引用（哈希 64 位小写十六进制，语言，文件写成 `<规则目录>/scripts/<规则 id>.<后缀>`，规则目录可配所以只固定 `scripts/` 与文件名）和超时与失败做法（共用的 `validateScriptAction`，拦路的范围）；条件（嵌套至多 5 层含叶子、至多 20 个叶子、引用的信号已定义且比较值合类型、时钟的 `from` 与 `to` 不同）；期限（`ttl` 晚于现在且至多 30 天，`session` 只配会话规则）；一个项目至多 50 条生效的规则、其中至多 10 条带脚本（替换一条已有的不算两次）。`glmSpend` 筛选与 `ticketPerSession` 只给代码里的条目（`context.code`），人写的规则出现就拒；`origin` 与 `status` 由规则板写，请求里带就拒；0.8 的字段按多余字段拒。
- 判定（`judge.ts`）：`judgeInput` 是判定输入的唯一构造处（门与 `checkCall` 共用），`judge(input, rules, options)` 对每条规则看它听的事件有没有发生、筛选对载荷成不成立、条件成不成立：条件读不出时规则不生效，除非 `onUnknown: 'apply'`。筛选问到的角色、模型、会话、被派的模型这几项调用读不出时，规则不生效，结果的 `subjects` 写是哪条规则、哪一项、为什么。没有放行规则，所以多一条规则不会放松任何判定；`combine` 取最强的执行方式，`block` 强于 `queue` 强于 `record` 强于 `inform`，同样强的按 id 排序，没有命中为 `allow`。条件的三值：`all` 里有一项不成立即不成立，`any` 里有一项成立即成立，`not` 不改变读不出；时钟窗口 `from` 含、`to` 不含，`to` 早于 `from` 表示跨午夜，`days`（1 是星期一）按窗口开始的那一天算，`tz` 缺省或 `local` 取本进程的时区。期限到了（`ttl`）或结束条件成立（`until`）的规则不生效；会话规则只对自己的会话生效；`ticketPerSession` 的条目不排 `RULES_TOOL_NAMES` 里的工具（`src/shared/tool-names.ts`，现在只有 `rules_show`），被停下的 agent 仍然能看规则。
- 脚本不在这里跑：`judge` 对带脚本的规则只做两件事。规则在 `options.approved` 里（这台机器上有人看过原文同意）且存下来的超时与失败做法合法时，把它连同超时和失败做法放进 `pending` 交给调用方去跑；这次调用已被别的规则的自带动作拦下时不交。其余（没有批准，或存下来的超时越界）不跑，按失败做法判：条目写的 `onError`，没写取事件声明的缺省（`gate.trunk-advance` 为拦下，其余放行），拦下时 `hits` 里的理由（英文，给模型看）写脚本 is not approved on this machine，放行时只列在 `refused` 里。批准记录由同意的路产生，那条路还没有，所以今天所有带脚本的规则都落在这一支。
- 信号的有效值（`signals.ts`）：`effectiveSignal(名字, 状态, 现在, 检测器状态?)`：人手值没到期就取它，其次是检测器的值（检测器的状态说它在运行才取），其余读不出，原因写明；检测器失败、超时或没有宿主时读不出，不会变成「否」。`glm-peak` 不在项目状态里，由调用方按计价服务（`source: 'clock'`）或命令行的来源给读数。
- 默认规则与附属条目（`builtin.ts`）：`GLM_PEAK_PRICING`（`rules.step`，筛选 GLM 家族的模型 `^[^/]*/glm`，条件 `glm-peak` 为真，只告知，`toldBy: 'glm-prompt'`）总在；`builtinRulesFor(档位)` 在无影响档只给它，少做档加 `GLM_PEAK_REDUCE`（高峰里自报 `glmSpend: optional` 的脚本排队），不做档加 `GLM_PEAK_STOP`（高峰里 GLM 子 agent 的每次工具调用排队，一个会话一张单）、`GLM_PEAK_STOP_DISPATCH`（派 GLM 子 agent 的调用排队，不论谁派）和 `GLM_PEAK_STOP_SCRIPTS`（自报花 GLM 积分的脚本排队）。四条附属条目的条件是高峰且 `onUnknown: 'skip'`：读不出是不是高峰时什么都不拦。主 Agent 不受高峰模式管：没有一条条目筛选它，只有它派 GLM 子 agent 的那一次调用被 `GLM_PEAK_STOP_DISPATCH` 排队，因为被停下的是被派的子 agent。出厂档位由 `effectivePeakMode` 一处给出。
- 代码规则目录（`builtin.ts` 的 `CATALOG`，设计 §10.1）：guard 框架的规则只在 `src/guard/catalog.ts` 的 `GUARD_RULES` 里写一份（`guard:workspace-containment`、`guard:file-tools-only`、`graph:graph-files-only`、`loops:files-only`、`loops:schedule-tools`，没有 `mode` 列：代码里的规则从所在行启用那天起就拦，没有影子模式），`CATALOG` 把它映射成 `<行>:<id>`；M3 主 Agent 的九条只在 `src/guard/main-agent-rules.ts` 的 `MAIN_AGENT_RULES` 里写一份，`CATALOG` 映射成 `design:<id>`（`design` 行，两种执行方式都是拦截，`effect` 恒为 `block`，没有 `toldBy`，标题照抄）；再加规则板自己的 `rules:files-only`（只有目录项，门随规则行）和默认规则与它的四条附属条目。`tests/contracts.spec.ts` 核对 `GUARD_RULES` 里每个 id 都是对应行实际装上的规则对象的 id，`MAIN_AGENT_RULES` 去 `design:` 前缀后与目录条目一一对应。

### 16.9 写入引擎的操作（`src/rules/permissions.ts`、`request.ts`、`plan.ts`、`engine.ts`、`store.ts`）〔已实现 2026-11-01，L2；调用方只有测试，命令与规则行随后〕

设计 §2.5、§7.4、§9.2 里不经提议就能做的操作。`apply(actor, request)` 的顺序在 §16.3 的「写」；这一节写操作表、规划里的清理与到期、流水轮换和没有做的操作。

**请求与身份。** `parseRequest`（`request.ts`）核对一个请求有它的操作要的字段、类型对；不认识的 `op` 得 `invalid`，请求里写着别的身份（`actor` 之类）的字段不读：身份只是入口给的。`permissions.ts` 的表一个操作一行（谁、做什么、不能做的人该怎么做），`refusalFor(actor, op)` 在不行时给一句「只有人能……（身份 llm 不行）」和怎么做；该人做的写 `/rules` 的命令，该规则板自己做的写「规则板自己会做这件事，不需要你操作」。`detector` 一个操作也不能做：它唯一的写入（自己信号的检测值）要同意的路。`repo-outside`、`repo-outside-cleared` 在表里，但不是请求：它们是 `settleLocked` 发现规则文件被改、又改回来时自己写的记录。

| 操作 | 谁 | 做什么（请求的字段） | 做不了时（`conflict` 或 `invalid`） |
| --- | --- | --- | --- |
| `peak-mode-set` | 人 | 改高峰模式（`level`）；档位已经是人选的这一档时什么都不写 | `invalid`：档位不认识 |
| `rule-lift` | 人 | 解除一条在生效的规则（`id`） | 没有这条、代码里的规则、不在生效 |
| `rule-delete` | 人 | 删一条规则（`id`），它的脚本钉随它删；仓库里的脚本文件不动（脚本文件归同意的路） | 没有这条、代码里的规则 |
| `rule-expire` | 规则板 | 让一条期限到了的规则失效（`id`，会话规则另带 `released: true`）；到期时刻已过、结束条件成立（只看时钟和没有检测器的开关），或宿主说会话已释放，证据写进 `evidence` | 期限没到、没有期限、结束条件里有规则板读不到的信号（`glm-peak`、检测器的信号、阶段）、会话规则没有 `released` |
| `signal-manual` | 人 | 手设信号的值（`name`、`value`、可选 `durationMs`，至多 7 天） | 没有这个信号（`glm-peak` 由宿主现算）、值不合类型、时长越界 |
| `signal-clear` | 人 | 清掉手设值（`name`） | 没有手设的值 |
| `signal-delete` | 人 | 删一个开关（`name`）；引用它的规则留着，存下来的规则宽松读 | 没有、是检测器的信号 |
| `ticket-open` | 规则板 | 开一张等待单：号码取 `nextTicket`（起始 1），`since` 取此刻，`summary` 取前 160 个字符；结果的 `target` 是单号 | 字段缺或类型不对 |
| `ticket-update` | 规则板 | 改单：`state`（`deferred` 到 `cleared`、`done`、`cancelled`、`expired`；`cleared` 到后三种；关了的不再动）、`expiredWhy`、`rules`、`scriptRules`、`pausedGoal`、`pauseFailed`、`resumed`；时间由规划盖：进 `cleared` 记 `clearedAt`，进关闭的状态记 `closedAt`，`resumed` 记 `resumedAt` | 没有这张单、不能这样转；`expired` 没写 `expiredWhy`；什么都没要改 |
| `ticket-handover` | 规则板 | 把开着的单转给别的会话（`sessionId`、`agentLabel`、可选 `focus`）；`handedFrom` 记第一个持有者，再转不改它 | 已经关了 |
| `ticket-adopt` | 规则板 | 宿主接手不做档的单（签名 `any:builtin:glm-peak-stop`）：改 `host`；宿主丢了而过期的（`host-gone`，没有 `resumedAt`）改回 `deferred` | 不是不做档的单、已经结束 |
| `ticket-let-once` | 人 | 放行这一次（`id`，可选 `until`）：`letOnceUntil` 默认此刻加 10 分钟，最晚 24 小时以后 | 已经解除、已经关了；`until` 越界 |
| `ticket-cancel` | 人 | 取消开着的单 | 已经关了 |
| `recovery-accept` | 人 | 照改没有生效的行（`labels`，规则页上的编号）：那几行自己的 `changes` 按它们在流水里的次序接起来，再加删掉 `unresolved` 里对应的项，写后整份校验，不合法整次拒绝 | 没有这个编号；读不出的行与已被锚点覆盖的行、没有 `changes` 的行只能忽略；改动做不了或状态不合法（`invalid`） |
| `recovery-dismiss` | 人 | 忽略（`labels`）：只删 `unresolved` 里对应的项 | 没有这个编号 |
| `repo-adopt` | 人 | 照被改过的规则文件改（`repo.ts` 的 `adoptRepoLocked`）；结果的 `repinNeeded` 列出没有批准的脚本 | 文件读不出或已被删掉 |
| `repo-restore` | 人 | 按规则板自己的存档写回规则文件（`restoreRepoLocked`） | 没有外部改动时什么都不写 |
| `repo-outside`、`repo-outside-cleared` | 规则板 | 见上，由 `settleLocked` 写 | — |
| `notice-add` | 规则板 | 记下要告诉主 Agent 的话（`kind`、`rule`、`text`）；编号 `n-<记录的 seq>` | 字段不对 |
| `notice-delivered` | 规则板 | 删一条已经发出的提醒（`id`） | 没有这条 |

错误码：`forbidden`（身份不对）、`invalid`（请求形状不对，或写后的状态不合法）、`conflict`（请求没错，状态不允许）、`stale_revision`、`busy`、`io`。一个被拒的请求不写文件（先落实待办的恢复与规则文件的开始或变更记录是例外，它们本来就欠着）。

**清理与到期（设计 §7.4 第 5 步）。** 每次写入的规划，在操作自己的改动之外，按此刻的时钟、心跳目录和状态再加这些改动，每条带 `cause`，值都写进记录，重放只照改动做：关闭（`done`、`cancelled`、`expired`）超过 24 小时的单删掉（`prune`）；开着的单转 `expired`（`expire`），原因依次看：宿主的心跳文件 `.llm/rules/hosts/<pid>-<启动毫秒>.json` 不在或 `at` 超过 45 秒（`host-gone`），`cleared` 超过 30 分钟没有人回来（`not-retried`，从 `clearedAt` 算；设计 §7.2 的 `Ticket` 没有这个时刻，这里加了一个可选字段），开单超过 24 小时（`age`）；生效的规则，到期时刻已过，或结束条件成立，转 `expired`（`expire`）。会话规则不在这里失效（会话有没有释放只有宿主知道，走 `rule-expire`）；条件里有规则板读不到的信号的规则也不在这里失效。这一次写入自己改的条目不清理：人取消了一张单，不会因为它的宿主不在了而被改写成过期。`applyRecord` 仍不读时钟、文件与进程表。

**规则文件。** 写入后「人定的部分」（`repoPart`）变了，同一条记录带一个 `repo` 改动（新摘要；没有人定的内容时为 `null`），快照写成之后导出：写 `rules.json`，没有人定的内容了就删它和 `repo-written.json`（`exportRepo`，`file: 'removed'`）；git 正在合并等时延后。会话规则、等待单、提醒、恢复记录不在人定的部分里，写它们不动文件。人定的部分变时同时有外部改动的标记，标记随这条记录清掉，被覆盖的那份仍在 `.rules.json.outside-<时刻>` 里（与最小一片的 `peak-mode-set` 一致）。

**流水轮换（设计 §7.6）。** 当前流水到 8 MiB（`BoardOptions.rotateAtBytes` 可改小，给测试用）时，下一次写入先把它存为 `journal-<最后的 seq>.jsonl`（复制并 `fsync`），再用一条 `base`（`actor: harness`，`changes` 为空，`state` 是完整状态）作为新流水的全部内容，原子换上去，之后才追加那次写入的记录；换不上去（Windows 上文件被别处打开，重试用完）整次写入得 `io`，什么都没变。崩溃只会留下两种东西：没换成而留下的一份复制，没有哪个新流水的 `base` 指向它，读时不理它，下一次轮换写过它；换成了但快照没跟上，读时在旧文件里找到快照那条记录接着重放，只当存档落后，不写 `recovered`。读时（`journalChain`）：以 `base` 开头的文件，接上 `journal-<base 的 seq - 1>.jsonl`，而且那个文件里最大的 seq 正好是它名字里的数，才算它的前一份，一路往前；循环或对不上就停。快照无效时重放从最近一条核对得上的 `base` 开始，没有就从头；`replayJournals(paths)` 把整个目录从头重放，每条（含 `base`）照常核对。

**没有做的操作。** 只有同意的路（M3 第 6 步）能产生数据的都不在引擎里：`propose`、`proposal-show`、`proposal-accept`、`proposal-reject`、`proposal-expire`、`rule-set`、`signal-define`、`detector-set`、`detector-delete`、`repin`、`remove`、`signal-detected`。它们的请求得 `invalid`（不认识的 op），状态里没有 `proposals`。脚本文件的写入与删除也归那条路：`rule-delete` 只删脚本钉。

**性质测试（`tests/rules-property.spec.ts`）。** 5 个固定种子，自写的生成器：请求按当前状态造，所以合法；注入时钟，轮换阈值调小。每个种子至少 200 次写入，用到表里的每个操作；其中一次时钟前进 25 小时并丢掉一个宿主的心跳（有 `prune` 与 `expire`），至少一次轮换，两行引擎以外追加的记录（一行 `snapshot` 随手写、一行没有）随后一个照改、一个忽略，规则文件被外部改了又分别被照改、写回、改回。每次写入后，把新增的记录逐条放到上一个状态上，摘要都要对上、结果等于读到的快照。结束后：(a) 清零快照读一次，摘要等于清零前、没有跳过的行，再写一条原因为 `snapshot-corrupt`、不登记行的 `recovered`；(b) 再清零一次，同样；(c) 对整个流水目录从空状态重放，摘要等于 (b) 之后的快照，`base` 链核对通过。失败时打印种子与第一条对不上的序号。

### 16.10 `checkCall` 与命令行（`src/rules/check.ts`、`heartbeat.ts`、`metrics.ts`、`denial.ts`、`show.ts`、`call.ts`、`cli.ts`，`scripts/rules/cli.mjs`）〔已实现 2026-11-01，L2；调用方只有命令行与测试〕

设计 §9.4、§10.5。库入口 `checkCall({tool, args}, options)` 对一个假设的工具调用（`tool` 是 DSH 原生名）按项目的规则判定，不在 DSH 里也能用；命令行 `check`、仓库脚本在启动前自查（M6 的 `gateOnRules`）、循环板跑脚本之前都走它。

**与门共用的部分。** 事件由 `gateEvents` 构造，输入由 `judgeInput` 构造，判定是 `judge`，规则表是项目状态里的人设规则（按 id 排）加 `builtinRulesFor(effectivePeakMode(state).level)`。`checkCall` 只推出 `gate.tool-call`。调用里的字段由 `describeCall`（`call.ts`）取：shell 工具的命令文本，写入目标（`write`、`edit`、`str_replace_editor` 除 `view` 外的目标，以及守卫的引号感知读法在 shell 命令里找到的重定向目标；没有可见目标的 shell 写，如 `Set-Content`，没有目标，按 `writes` 筛的规则看不到它），和拒绝文字的第一句。门接上时取字段也走这个函数。

**值从哪来。** 与门不同的只有来源：`glm-peak` 取调用方给的值（来源 `caller`，`peakUntil` 随它给），否则取 `liveHeartbeats` 挑出的心跳里第一份有值的 `computed.glmPeak`（来源 `heartbeat`，`host` 是 pid；它的 `nextChangeAt` 不晚于此刻时取反），有活的心跳但都读不出时取最新那份的原因，没有活的心跳时读不出，原因「没有活的宿主，命令行读不到计价服务」（来源 `none`）；阶段只取 `stage`；角色、模型、会话只取调用方给的，没给的那一项读不出，要求它的规则不命中，结果的 `subjects` 写出；开关与检测器的信号读项目状态，没有宿主报告检测器（检测器还没有），所以检测器定义的信号除非人设了值，一律读不出。`signals` 列的是命中事件和筛选的规则在条件与期限里读到的信号，每个一项。

**只读。** `readProject` 读状态，不取锁，不写任何文件：`check.ts` 不导入 `engine.ts` 与 `data/lock.ts`，`src/rules/` 不导入子进程模块（`tests/rules-check.spec.ts` 逐文件查）。状态与流水不一致时隔 50 毫秒重读，至多 3 次，仍不一致就按流水在内存里重放，`notes` 写「状态要重建，已在内存里按变更记录重放，没有写文件」。没有 `.llm/rules/` 时：规则文件在，照它在内存里开始（不写 `base`），`notes` 写明；规则文件也没有，按空状态判，`notes` 写「这个项目还没有规则板的状态」。规则文件被规则板以外改过时照流水判，`notes` 写「仓库里的规则文件被规则板以外改过，按变更记录判」。读不出的心跳文件不采用，`notes` 列文件名。目录不在 git 仓库里、也没有 `.llm/` 时按没有规则状态判，`notes` 写明。读状态抛错是 `RulesCheckError('io')`。

**脚本。** 不起进程。带脚本的规则一律当作脚本未批准（批准的路还没有）：按条目的失败做法判（阻塞的拦下，其余放行），`scripts` 列 `refused`，`notes` 写原因。设计的 `CheckOptions.runScript` 因此没有建。

**结果。** `CheckResult` 照设计：`effect`、`exitCode`（拦截 4，排队 5，其余 0）、`rules`（命中事件和筛选的规则与条件的值；`effect` 比设计多一个 `script`，给脚本动作的规则，脚本的失败做法使它拦下时是 `block`）、`text`、`signals`、`subjects`、`scripts`、`peakMode`、`notes`。

**文字（`denial.ts`）。** 拦截与排队用守卫的 `renderCorrection` 写四段。排队在门里是「Deferred as ticket q-N.」；`checkCall` 没有单，所以三处不同：这一句换成「Would be deferred; the command line opens no ticket.」，Right path 里 harness 发消息的那一句换成「Run it again when the condition no longer holds.」，例外里 `/rules let q-N` 那一半去掉（设计只写了前两处，没有单号时第三处留不住）。同一个函数也供门用，门传 `ticket`。命中的只有按档位启用的附属条目时，边界里写「GLM peak hours now until HH:MM.」（没有结束时刻写「now」）和档位一句（出厂默认「Peak mode: reduce (the default; the human can change it).」，人设过「Peak mode set by the human at YYYY-MM-DD HH:MM: stop.」），Right path 写「Run it again after HH:MM.」（没有时刻写「after peak ends」），例外写 `/rules peak`。时刻按本机时区。结束时刻取调用方的 `peakUntil`，没有则取心跳的 `nextChangeAt`。门里的子 agent 与 `run_code` 子调用变体、不做档的 goal 暂停句在门接上时加。

**事件（`metrics.ts`）。** 每次判定恰好一次 `emitMetric`，交一条 `rules.check`：`effect`、`exitCode`、`rules`（命中的规则 id）、`peakMode.level` 与 `origin`、`glmSpend`、`glmPeakSource`、`unknownSignals`、`waitedMs`、`caller`，不含命令原文。出口是 `CheckOptions.metrics`，默认什么都不做；出口抛错或拒绝，判定、文字、退出码和文件都不变。用法错误不判定，也不交事件。指标流水有了写入口之后只改这个文件的默认出口。

**命令行（`cli.ts`）。** `npm run -s rules -- show|check`，选项与退出码见 `DEVELOPMENT.md` §13。`show` 的文字由 `show.ts` 的 `showText` 写：高峰模式、`glm-peak`、生效的规则、开着的等待单、项目的信号；`rules_show` 工具用同一个格式化函数，按会话筛规则与高峰一行（设计 §6.4）随工具加。`propose` 子命令没有建（同意的路还没有）。

**心跳的读侧（`heartbeat.ts`）。** `readHeartbeats` 读 `.llm/rules/hosts/*.json`，`liveHeartbeats` 取 45 秒内的、新的在前，`hostPeak` 按上面的顺序挑 `glm-peak`。`HEARTBEAT_FRESH_MS` 也是 `plan.ts` 判宿主还在不在的数。心跳的写入见 §16.12。

### 16.11 工具调用门、`rules_show` 与完整的 `/rules`（`src/rules/gate.ts`、`caller.ts`、`tool.ts`、`commands.ts`、`listing.ts`、`table.ts`、`service.ts`、`src/guard/directory-writes.ts`）〔已实现 2026-11-01，L2、L3；行默认启用，桌面版首轮验收未做〕

设计 §6.1、§6.2、§6.4、§9.1（`rules_show` 的文字）、§9.2、§10.1、§10.3、§11。行的 `inject` 是 `['tools', 'commands']`（补丁里同写）。

**门。** 在 `tools/pre-execute` 上以 `{prepend: true}` 注册，最外层。每次调用：

1. 先 `await next()`，内层不是 `allow` 就原样返回：guard、图文件门禁先判，被它们拒绝的调用不进规则板，也不写规则板的流水。会话没有工作目录、不在项目里的调用也放行。
2. 规则文件门禁 `rules:files-only`（下一段），不读状态。
3. 推出事件、构造输入：`gateEvents`（`gate.tool-call` 每次都有；原生名在 `DISPATCH_TOOL_NAMES`（`subagent`、`subagent_fork`）里时另有 `gate.dispatch`；`gate.trunk-advance` 声明了、没有谁交，不推出）、`judgeInput`、`judge` 和规则表 `tableOf`（人设的规则按 id 排，再加此刻档位启用的代码条目）与 `checkCall` 是同一批函数。`glm-peak` 当场读计价服务（`clockReadings`，来源 `clock`），读不出时是未知并带原因，三种原因（没有计价服务、形状不对、`peak` 抛错）各不相同，行健康不降级。`writes` 取文件工具的目标与 shell 重定向的目标，会话工作区之下的写成相对工作区的形式（`describeCall` 的 `cwd` 参数）。原生 `subagent` 的调用带 `provider` 与 `model` 时，`targetModel` 是 `provider/model`，不带时为空串（按读不出处理）。
4. 判定的结果：拦截（规则 `block`，或脚本规则的失败做法是拦下）得 `deny`，理由是 `denialText` 的四段式，与 `checkCall` 对同一批规则和信号给的文字逐字相同；只记录得 `allow`，另写一行 `mode: 'record'`；只告知不改判定。排队：人设的规则和不做档的两条附属条目得 `deny` 和等待单号（§16.12、§16.13）；少做档的 `builtin:glm-peak-reduce` 与不做档的 `builtin:glm-peak-stop-scripts` 只对自报 `glmSpend` 的脚本命中，门里的调用不带这个字段，只在 `checkCall` 里排队。放行的调用还要回答等着它的、已解除的等待单（§16.12）。
5. 读状态或判定抛错时放行，行健康降级并写原因（「读规则板的状态失败：…，这次调用放行」「规则板判定出错：…，这次调用放行」）；下一次能读的调用把这一条上报换回正常的。门不抛错。

**规则文件门禁。** 文件工具（`write`、`edit`、除 `view` 外的 `str_replace_editor`）的目标，以及 file-tools-only 判为写文件、又点了名这些目录的 shell 命令，落在三处就拒绝：规则目录（行配置 `dir`，默认 `<项目根>/docs/rules/`）、本仓库每个工作树里的同一相对路径、`<项目根>/.llm/rules/`。直接调用和带 `parent` 的子调用一样判，读不拦。工作树的名单由 `worktreesOf`（`src/data/project-root.ts`）从 git 目录的 `worktrees/*/gitdir` 读出，与 `git worktree list` 给的相同，不起进程；每个项目根缓存 60 秒。路径与命令的判法在 `src/guard/directory-writes.ts`，图文件门禁（`graph-files.ts`）用同一个函数。拒绝文字四段，违规流水里 `rule` 是 `rules:files-only`。

**违规流水。** 规则板的拦截和只记录的调用写进 guard 写的那一份（`<项目目录>/audit/violations.jsonl`，行配置 `home`，否则数据目录服务的 `projectHome`），一行一次：`{at, rule: 'rules:<规则 id>', mode: 'enforce' | 'record', effect, tool, agentId, sessionId, scope, route, signals, correction?}`；`tool` 是模型调用时的名字，`signals` 是这条规则读到的信号值（读不出为 `null`）；只记录的行没有 `correction`。写流水不等：调用不等写完（同 guard），写失败各告警一次。晨报把 `mode: 'enforce'` 数作违规，`record` 不数（`src/workflow/morning-report.ts`）；`ViolationRecord.mode`、`RecordedCall` 在 `src/guard/index.ts`。

**调用者（`caller.ts`）。** 角色：会话头 `origin: 'subagent'` 为 `subagent`；否则读投影 `hournessMainAgent`（`sessionProjections.stateOf`，交给 `mainAgentActive`）为 `main-agent`，缺值、服务不在、形状不对读作 `root`，投影读时抛错则角色读不出（带原因，问角色的规则不命中）。模型：会话最新请求头的 `provider/model`，没有请求头时读不出。会话：`session.id`。设计行的服务 `glmHournessDesign` 还没有，所以 `/wish` 之后的第一步可能读作 `root`。

**`rules_show`（`tool.ts`）。** 无参数；输出 `{ok, text}`。列出：对调用者生效的规则（人设的规则里，问角色、模型、会话的筛选与调用者不合的不列，问的字段读不出的不列并写一句原因；会话规则只列本会话的）、有计价服务时的默认规则（高峰里写「GLM peak hours until HH:MM: …」，否则写价格的平铺陈述）、此刻档位启用的代码条目、调用者自己开着的等待单、项目的信号及来源、`glm-peak` 的读数、档位、状态读法的说明，一条不截；列了代码条目时末尾一句说它们来自「项目编排」（`pluginLabel`）、人用 `/rules peak` 改档位。文字与 `npm run -s rules -- show` 同一个格式化函数（`show.ts`）。没有工作目录或不在项目里的会话得一句话。`RULES_TOOL_NAMES` 里的工具不被「每会话一张单」的条目排队。

**`/rules`（`commands.ts`）。** 子命令（`input.hint` 与回错的用法同一份）：`show`；`peak [档]`；`lift <规则>`（`rule-lift`）、`delete <规则或开关>`（`r-` 或 `builtin:` 开头为 `rule-delete`，其余为 `signal-delete`）；`on <开关> [时长]`、`off <开关>`、`set <信号> <值> [时长]`（`signal-manual`，值认 true、false、数，其余是字：时长 `30m`、`2h`、`1d`，至多 7 天）、`clear <信号>`（`signal-clear`）；`let <单号>`（`ticket-let-once`）、`cancel <单号>`（`ticket-cancel`）；`recovery <编号…> 照改|忽略`（`recovery-accept`、`recovery-dismiss`，也认 `accept`、`dismiss`，几个编号用逗号隔开）、`recovery 文件 照改|忽略`（`repo-adopt`、`repo-restore`，也认 `file`）。身份固定为 `human`。成功回一行中文，被引擎拒绝回引擎给的那一句（加它的 `hint`），不写任何文件。`/rules show` 用中文写这个项目的档位、生效的规则、在等的工作和信号。人加规则、定义开关、接受或驳回提议的子命令不在（提议一路没有建）：这些字当作未知子命令，回用法。

**服务 `glmHournessRules`（`service.ts`）。** 现在的成员只有 `declaration`（一行说明），guard 在它的 `glm:guard` 节末尾多写这一行（`RULES_DECLARATION`，设计 §6.4 的原文）；服务不在或形状不对时不写，形状不对另告警一次（每个 guard 行一次）。`attachable`、`acceptProposal`、`staleEntries` 随提议一路加。

**行健康。** 门装不上（`tools/pre-execute` 注册抛错）时行未生效，写「工具调用的门没装上，这一行不执行任何规则」；`rules_show` 或 `/rules` 注册失败、两个服务之一没提供上、会话事件没注册上时部分生效。每次判定的调用上报本会话的状态，规则数大于零时多一句「N 条你设的规则生效」。没有生效的记录这一项改为指向 `/rules recovery <编号> 照改 或 忽略`（§16.5）。

**设计里没写死或与设计不同的地方。**
- 等待单、唤醒、会话结束的转交在 §16.12；高峰不做的排队、goal 的暂停与恢复、主 Agent 的高峰一行在 §16.13。声明那一行（`RULES_DECLARATION`）照设计写，说到「ticket」。
- 拒绝文字（`denialText`，§16.10）的「Exception」一段提到 `rules_propose`，这个工具要等提议一路；`rules:files-only` 的文字不提它，只说告诉人、人用 `/rules` 改。
- 工作树名单读 `.git/worktrees`，不起 `git worktree list`：`src/rules/` 不导入子进程模块（§16.10），读文件得到的名单相同。
- 违规流水的 `mode` 取设计的 `enforce`、`record`（设计的 `late` 随脚本）；晨报因此改了一行，数 `enforce`。
- `rules_show` 没有加进 GLM 工具搜索的常驻名单（`ORCHESTRATION_RESIDENT_TOOLS`）：GLM 会话里它是延后加载的工具；要不要常驻等桌面版验收时定。
- `hits.json` 的命中计数随后面的步；宿主心跳的写入与每步提醒见 §16.12。

**验证。** L2：`tests/rules-gate.spec.ts`（门：先 `next()`、拦截与文字、与 `checkCall` 逐字相同、只记录、事件、目标模型、写路径、角色与模型与会话、规则文件门禁（直接、子调用、工作树、60 秒缓存、shell、行配置的目录、读不出状态时照守）、故障放行并降级、计价服务三种读不出、计价读数每分钟一次、`rules_show` 的各个部分）、`tests/rules-row.spec.ts`（行的注册与撤回、各子命令各写自己的操作、被拒回一行、`recovery`、`show`、激活期降级）、`tests/contracts.spec.ts`（工具名、目录、服务读取函数、guard 声明多一行）、`tests/peak-mode.spec.ts`（`pluginLabel`）、`tests/workflow.spec.ts`（晨报数 `enforce`）。L3：场景 `glm-rules`、`non-glm-rules`（场景工作区是临时 git 仓库，规则文件里预置一条拦命令文本 `rules-probe-blocked` 的规则和一条只告知的规则；被拦的命令不执行、违规流水有 `rules:r-probe-block`，文件工具写规则目录被 `rules:files-only` 拒绝、文件不变，没人点名的命令照常执行，请求里只有一条规则板的提醒（那条只告知的规则，没变就不再加），`/glm-status` 列出这一行，场景的用户级目录里没有 `rules/`；非 GLM 场景另用真实运行时里的 `rules_show` 读到这两条规则）。

### 16.12 等待单、唤醒、转交、每步提醒与心跳（`src/rules/tickets.ts`、`wake.ts`、`reminder.ts`、`heartbeat.ts`，接线在 `gate.ts`、`index.ts`）〔已实现 2026-11-02，L2、L3；行默认启用，桌面版首轮验收未做〕

设计 §5.4、§6.3、§6.4、§6.5、§11.2、§15 R4。

**哪些排队执行。** 门判到的最强执行方式是排队时，门把这次调用交给 `TicketDesk.defer`：命中的是人设的规则，或是不做档的两条附属条目（§16.13）。两者同时命中时单上记全部命中的条目，有「每会话一张单」的条目（不做档的 `builtin:glm-peak-stop`）时签名是 `any:<条目 id>`。

**开单与去重。** 签名是原生工具名加规范化参数（键按码点排序的 JSON）的 SHA-256 的前 12 位十六进制。本会话、本宿主、同签名、开着的单就复用，拒绝文字相同、不写状态；没有就开一张（`ticket-open`，身份 `harness`，单号取状态的 `nextTicket`，摘要取命令文字、写入目标或参数的 JSON，至多 160 个码点）。同一会话在本宿主上开着的单至多 20 张，再多就拒绝（`ticketLimitText`：「Too many open waiting tickets: …」）、不开单。写不成单（写锁 2 秒内取不到、磁盘错）时仍然拒绝，文字写「Deferred, but the board could not record a waiting ticket for it」并告诉 agent 要自己重试，行健康降级。门里开单与放行的处理一个接一个排队，同一步里两个同签名的并行调用不会各开一张。带 `parent` 的子调用开的单记 `nested: true`，用子调用的文字，同签名的直接调用复用这张单；会话头 `origin: 'subagent'` 的调用用子 agent 的文字（在交接里报告单号，派发它的 agent 会在解除时收到消息）。拒绝文字的变体由 `denialText` 的三个入参（`nested`、`subagent`、`unrecorded`）给出，在 `denial.ts`；违规流水一行 `{rule: 'rules:<id>', mode: 'enforce', effect: 'queue', ticket, correction, …}`，每次拒绝一行。

**放行这一次与取消。** `/rules let <单号>`（`ticket-let-once`）给单记 `letOnceUntil`（10 分钟）：同会话同签名的下一次调用在这之前来就放行、单转 `done`，再下一次重新排队（开新单）；过了 10 分钟没用，调用仍复用这张单。`/rules cancel <单号>` 把单转 `cancelled`。两者的身份是 `human`（`permissions.ts`），模型、检测器与 harness 被拒。单已经 `cleared` 时：agent 回来重试而规则不再命中，门放行、单转 `done`；规则又成立了，旧单转 `done`、这次调用开新单。

**重判与唤醒（每 5 秒，以及每次 `/rules` 命令之后）。** 拥有单的宿主（单上的 `host` 是自己）对自己这个进程里开的单重判：开单时的事件留在内存里（不写进单，所以进程重启后这样的单不再重判，按 `host-gone` 过期），规则表和信号取此刻的。仍被人设的排队规则挡着的，规则集合变了就 `ticket-update` 改 `rules`；不再被挡（规则解除、删除、过期，条件不成立，或更强的拦截规则挡着）就转 `cleared`，给持有单的 agent 发一条消息（来源 `hourness-rules-wake`，只发一次）。方式看 agent：`running` 用 `steer`；空闲且 `goals.get(agent)?.phase === 'active'` 用 `inject`；其余空闲的用 `followup`；`goals` 服务不在或 `get` 抛错（`GoalError`，不是活实例）按没有 goal。文字在 `wake.ts`：`[rules board] Ticket q-N cleared: <原因>. You may run the deferred call again: <工具> "<摘要>".`，单是 `run_code` 子调用开的，在 `again` 之后加 `from a run_code program`；原因由 `clearedBecause` 给：规则被人解除、被删、已过期，或条件里每个信号现在的值与谁在几点设的，或「rule r-x blocks the call now」。唤醒发不出（agent 已释放、`steer` 等抛错）：子 agent 的单转给派发它的 agent 再发一次，其余单转 `cancelled` 并在流水里写原因，行健康降级。宿主没有 `agents` 服务时不发、不取消，行健康降级。

**会话结束与转交。** 判定是 `session/disposed`；兜底是拥有者每 5 秒重判时 `agents.get(会话)` 为空。会话头带 `origin: 'subagent'` 的会话结束时，单转给派发链的根（`parentSession` 往上找第一个不带 `origin` 的、仍活着的 agent；M3 的 `dispatchRoot` 与 `focusOf` 还没有，所以单上不记焦点节点）：`ticket-handover`，单上的 `handedFrom` 记下原来的子 agent，流水原因写明是事件还是登记里找不到发现的（这是 V11 的现场）。已经 `cleared` 的单转交之后马上给根发唤醒。找不到活的根：`ticket-update` 取消，原因「子 agent <标签> 已结束，派发它的 agent 也不在」。人开的会话（不带 `origin`）结束：取消，原因「会话 <id> 已结束，人关掉了会话，不再替它排队」。登记读不出（服务不在或抛错）时单留着，行健康降级，等登记恢复后的重判再处理。转交来的单唤醒根时用另一段文字：`Subagent "<标签>" was deferred on <工具> "<摘要>" and has ended. Dispatch the task again or run the call yourself; a new dispatch of the same call reuses q-N.` 同一个根下新的子 agent 做同一个调用时接手这张单（单的会话与标签改为它，`handedFrom` 保留），只接手挂在根上、带 `handedFrom`、仍是 `deferred` 的单，不抢活着的兄弟子 agent 的单；它之后被唤醒用普通文字。子 agent 做的调用若回答的是转交给根、已 `cleared` 的单，那张单转 `done`。标签是会话 id，id 长于 12 个字符（UUID，或前缀加 UUID）时取后 8 个字符，因为前缀什么也不说（设计的「任务标签」要 M3 的焦点，还没有）。

**过期。** 开单 24 小时没解除（`age`）、`cleared` 之后 30 分钟 agent 没回来（`not-retried`）、单的宿主心跳不在或 45 秒没更新（`host-gone`）。决定在写入的规划步骤里按当时的时钟与心跳目录做完，写进那条记录的 `changes`，重放不再看时钟与心跳（`plan.ts`，§16.9）。拥有者每 5 秒用自己的时钟另外判 `age` 与 `not-retried` 并写 `ticket-update`，所以没有别的写入时也会过期。宿主活着、只是心跳没写成时，它的单被别的写入按 `host-gone` 过期：拥有者重判时看到本宿主的这样的单、会话仍活着、本进程还没为它发过，就给原来的 agent（转交过的给根）发一次 `[rules board] Ticket q-N was expired after a heartbeat timeout of this host; rule … may still hold. Running <工具> "<摘要>" again queues it again if it does.`，行健康降级一次，不重开单。

**每步提醒（`reminder.ts`）。** 每个 agent 在 `agent/created` 时经 `installStepNotice` 装一个 `agent/pre-step` 的 notice（来源 `hourness-rules`，`<system-reminder>` 包装）。内容只有两样：对这个 agent 生效、由 `rules.step` 事件判出的只告知规则（拦截、排队、只记录的规则不列，默认规则不列）与它自己的开着的等待单；转交来的单写 `handed over from subagent "<标签>"`，有这样的单时多一句「Do not dispatch these tasks again before their tickets clear.」。至多 12 项（规则一行一项，等待单合成一行也算一项并保住位置），多出的写「and N more: call rules_show」。注入时机照 M3 的每步投影：正文摘要（SHA-256 前 12 位，记在 notice 的 `rulesReminder`）与会话里最近一条不同、压缩检查点之后、目标轮；没有变化不注入。有过内容之后变成没有，注入一次「No rules board item applies to you now.」；一直没有就不注入。历史扫描没有从 `src/graph/reminder.ts` 抽成共用文件（那是 M3 的目录），只用它导出的两个来源常量。主 Agent 的高峰一行在 §16.13。

**心跳（`heartbeat.ts`）。** 宿主在一个项目里有至少一个活会话（`agent/created` 记入、`session/disposed` 去掉，门里碰到没登记的会话也记入）时，每 15 秒覆盖一次 `.llm/rules/hosts/<pid>-<启动毫秒>.json`：`sessions`、`runner: false`（选举不在这一步）、`computed.glmPeak`（`{value, nextChangeAt?}` 或 `{unknown: 原因}`）、`catalog`（每个代码规则所在行的 `activation().state`，行的服务不在为 `absent`，有 `toldBy` 的另写 `toldState`）。开单前先写一次，所以刚开的单的宿主一定在。临时文件加改名，改名遇 `EPERM`、`EBUSY` 按 20、40、80、160、320 毫秒重试，仍失败就删掉临时文件、告警一次（成功写成之后重新计），下一周期再写。这个项目 60 秒没有活会话时删自己的文件；写自己的文件时顺手删别的宿主超过 1 小时没更新的。行卸载时删自己的文件、停计时器、撤掉提醒。

**设计里没写死的地方。**
- 计时器经 `RulesConfig.timer` 注入（默认 `setInterval`，`unref`），测试自己跑 5 秒与 15 秒两档。
- `/rules` 命令之后立刻重判一次（设计写「项目状态文件变化时」重判，这是同进程里最直接的那一种；别的宿主的改动由 5 秒一次的周期发现）。
- 单上的 `agentLabel` 与 `handedFrom.agentLabel` 是会话 id，长于 12 个字符时取后 8 个。
- 转交只由「挂在根上、带 `handedFrom`」的单被新的子 agent 接手，不是设计字面的「同一个根下任何开着的同签名单」；后者会把活着的兄弟的单抢走。
- 单被更强的拦截规则取代时也转 `cleared`，唤醒写「rule r-x blocks the call now」，agent 再调用得到的是拦截文字。
- 试图开单时的锁等待沿用写入口的 2 秒，不另设。

**验证。** L2：`tests/rules-tickets.spec.ts`（开单与去重、20 张的上限、子调用、子 agent 的文字、写不成单、唤醒的几种方式与只发一次、清除的几种原因、重试后单转 `done`、转交（事件与登记两种发现、新子 agent 接手、根不在时取消、人开的会话结束取消）、过期三种与别的宿主写入时的 `host-gone`、心跳迟到时的一次唤醒、`/rules let` 与 `cancel`、非人的身份被拒、唤醒发不出、登记抛错与不在、行卸载；不做档与少做档的部分，§16.13）；`tests/rules-row.spec.ts`（心跳文件的内容、60 秒删除、1 小时的旧文件、`EPERM` 退避与告警一次、行卸载；提醒的内容、只在变化时注入、压缩之后、目标轮、等待单的几种写法、12 项的上限、同一个 agent 创建两次只装一个）；`tests/rules-gate.spec.ts`（排队的规则开单、`rules_show` 列出规则与单）。假宿主 `tests/fake-rc3.ts` 加了活 agent 的登记（`steer`、`inject`、`followup` 记录收到的消息）、`goals.get`（对已释放的 agent 抛 `GoalError`）与 `session/disposed`。L3：场景 `rules-queue`（GLM 路由，探针时钟在高峰里：规则按 `glm-peak` 排队；被拒两次是同一张单；探针 provider 在一步里经真实的 `/rules` 处理函数以人的身份解除规则；下一次请求恰有一条唤醒；调用再来执行、单转 `done`；请求里的提醒按「只告知的规则」「加上开着的单」「单已解除」「又只剩规则」的次序各出现一次）与 `rules-handover`（非 GLM 路由，探针的派发插件派一个一次性子 agent，它的调用被排队、交回、会话结束；单转给主 Agent，人解除规则之后主 Agent 的请求里恰有一条转交的唤醒；流水的次序是开单、转交、解除、已解除）。两个场景结束后用户级目录下都没有 `rules/`。核实项 V3（空闲且有 active goal 的 agent 收到 `inject`）由 §16.13 的场景 `rules-peak-stop` 验证；V11（一次性子 agent 交回之后 `session/disposed` 发出）：`rules-handover` 在真实运行时里观察到，转交那条流水的原因写「会话结束的事件」，所以事件发出了；登记里找不到的兜底仍在，单测覆盖，场景没有走到。

### 16.13 高峰模式的执行：不做档的排队与 goal 的暂停和恢复、主 Agent 的高峰一行（`src/rules/tickets.ts`、`goal.ts`、`wake.ts`、`denial.ts`、`reminder.ts`，接线在 `gate.ts`、`index.ts`、`commands.ts`）〔已实现 2026-11-02，L2、L3；行默认启用，桌面版首轮验收未做〕

设计 §3.6、§6.3（不做档的几段）、§6.4（高峰一行、不做档的拒绝与唤醒文字）、§15 R4。

**谁被管。** 不做档（`stop`）只在 GLM 高峰（`glm-peak` 为真）里起作用，读不出是不是高峰时不拦（条目的 `onUnknown` 是 `skip`）。两条条目排队，门把它们和人设的规则一样交给 `TicketDesk.defer`：
- `builtin:glm-peak-stop`：角色是子 agent、模型是 GLM 的会话的每次工具调用（`rules_show` 等规则板自己的工具除外）。一个会话一张单，签名 `any:builtin:glm-peak-stop`（不是按调用算），去重、20 张的上限、转交与过期都照 §16.12。
- `builtin:glm-peak-stop-dispatch`：派模型为 GLM 的子 agent 的调用（`gate.dispatch`，`targetModel` 按 `^[^/]*/glm`），不论谁派。是普通的单，开在派活的会话上，不暂停任何 goal，主 Agent 的其余调用照常执行。
少做档的 `builtin:glm-peak-reduce` 与不做档的 `builtin:glm-peak-stop-scripts` 只对自报 `glmSpend` 的脚本命中，门里的调用不带这个字段，它们只在 `checkCall` 里判（§16.10）。主 Agent 不被任何一档拦、不被暂停 goal：门里没有一条条目点它的工具调用，暂停也只对会话头 `origin: 'subagent'` 的会话做（`goal.ts` 在动 goal 之前核对）。

**开单时暂停 goal。** 开（或复用）不做档的单的那次调用里，用登记里的活 agent 读 `goals.get(agent)`，`phase` 为 `active` 就 `goals.pause(agent, {id, revision})`，把暂停返回的 `id` 与修订号记进单的 `pausedGoal`（修订号比读到的大一，goal:174），暂停和开单是同一次写：先暂停、再写单，单写不成就把 goal 恢复回去。抛错（`GoalError`、修订号对不上）：不重试，单上记 `pauseFailed` 与消息前 80 个字符，这个会话的行健康降级「高峰不做：goal 没暂停（…），每一轮仍会花一步」，排队照常，拒绝文字写「Your goal could not be paused; end your turn anyway.」。开单时没有 goal、之后才有的，单上两样都没有，复用这张单的下一次调用再试一次（已记了 `pausedGoal` 或 `pauseFailed` 的不再试）。没有 `goals` 服务按没有 goal。暂停在这个 agent 自己的工具调用里做，goal-round-driver 在暂停时只在发起者不是这个 agent 时才 `cancel`（goal-round-driver:246）；这一步照常收尾是 V12，由 L3 回答（下面）。

**单结束：先恢复 goal，再叫醒。** 拥有者每 5 秒重判，也在每次 `/rules` 命令之后重判：不做档的条目不再命中（高峰结束、读不出高峰、档位改走）时，有 `pausedGoal` 且没有 `resumedAt` 就 `goals.resume`（只在 goal 还是规则板暂停的那一个时恢复：`goals.get` 的 `id`、修订号、`phase` 为 `paused` 都对得上；人在高峰里自己恢复或改过的不动），然后单直接转 `done`（带 `resumedAt`），最后发一条 `hourness-rules-wake`。文字（`wake.ts`）：
- 子 agent 还在：`[rules board] Ticket q-N cleared: GLM peak hours are over (or the human changed the peak mode). Your goal is resumed. Continue your work from where you stopped; the call that was deferred was <工具> "<摘要>".` goal 没动（没有、或人改过）时没有「Your goal is resumed.」一句；`resume` 抛错时换成「Your goal could not be resumed: <消息前 80 个字符>. Tell the human; they can resume it from the goal bar or with /goal resume.」，单照样转 `done`，没有 `resumedAt`，行健康降级。
- 单已转给派发它的 agent（子 agent 交回、会话结束）：`… Subagent "<标签>" stopped during peak at <工具> "<摘要>". Dispatch the task again to continue it.` 那个会话的 goal 不碰。
- 派活的单：`… You can dispatch again: <工具> "<摘要>".`（设计的 `task` 与模型没有来源，写调用的摘要）。
发送方式同 §16.12：goal 恢复之后子 agent 空闲且 goal 是 `active`，所以是 `inject`，不开新的 `followup` 回合。

**放行这一次。** 对不做档的单打 `/rules let <单号>`：命令（`commands.ts`）读出这张单的签名，把 `until` 设为这一段高峰的结束时刻（读不出是不是高峰时 4 小时）再写 `ticket-let-once`；回话写到几点。重判时 goal 马上恢复（`resumedAt`），单留着，`letOnceUntil` 之前这个会话的调用都放行、不再排队，不叫醒（agent 一直在做）；到期、或高峰先结束，单转 `done`。普通的单（含派活的单）仍是 10 分钟内同签名的下一次调用放行、用后关单。

**宿主重启与卸载。** goal 的状态是持久的，宿主进程没了它还停在 `paused`：
- 接手：新宿主上出现会话（`agent/created`），以及行启用时宿主登记里已有的每个会话（`adoptLive`，用 `agents.list()`），对签名为 `any:builtin:glm-peak-stop`、`sessionId` 是这个会话、状态为 `deferred`、`cleared`，或 `expired` 且 `expiredWhy` 为 `host-gone` 而没有 `resumedAt` 的单，先写心跳，再写 `ticket-adopt`（`host` 改为自己，过期的改回 `deferred`），然后立刻重判：高峰已经结束就当场恢复、叫醒。普通的单不接手。宿主活着、只是心跳迟到而别的写入把不做档的单按 `host-gone` 过期、goal 还停着时，拥有者在 5 秒重判里先补写一次心跳，再用同一条路把单接回来（不叫醒，也不报「心跳超时」那一条：单还是它的）。接手来的单没有开单时的事件，用一个角色为子 agent、模型取会话自己的、取不到（交给根的单、还没发过请求）时取一个 GLM 模型的合成事件重判（单是为 GLM 的调用开的）。
- 卸载（`index.ts` 的返回函数，`tickets.release`）：同一个宿主上每张不做档的、`pausedGoal` 有值而没有 `resumedAt` 的开着的单，先同步 `goals.resume`（在门和监听器撤掉、心跳文件删掉之前），再写 `ticket-update`（原因「规则行卸载，goal 已恢复」，`resumedAt`），不发唤醒。写入至多等 2 秒（规则板自己取锁的上限，卸载函数返回一个 Promise，没有要恢复的单时同步返回），超时的单留着。`resume` 抛错的单留着，下一次激活时按上一条接手（接手之后的重判会因为 goal 修订号已变而不再恢复，只发唤醒；这样的单要靠人用 `/goal resume`，行健康和 `warn` 里有原因）。V13（宿主正常退出时卸载函数会跑、`goals.resume` 那时成功）的 L3 结果见下。

**主 Agent 的高峰一行（`reminder.ts`）。** 每步提醒的第一行，只给角色为 `main-agent` 的会话和身上有不做档单的会话，而且只在有计价服务时（没有计价服务就没有高峰，一行都不写）。四种写法（英文，给模型）：高峰里（`GLM peak: now until 18:00.`）、不在高峰里（`GLM peak: not now (next Mon 14:00).`）、读不出（`GLM peak: unknown (the pricing service failed: …).` 后接「it does not apply while peak is unknown」），后面是档位和它的来历（出厂默认写 `Peak mode: reduce (the default; the human can change it)`，人选的写 `Peak mode set by the human: <档>`，不带时刻）和这一档要它做的事：少做是同时至多 `PEAK_REDUCE_GLM_WORKERS` 个 GLM 子 agent、可挪的活挪到高峰之后；不做是照常回话、高峰里不派 GLM 子 agent 也不跑自报花 GLM 积分的脚本；无影响是 `(no change to your work)`。不在高峰里时少做写「Work moved out of peak can run now.」，不做写「GLM subagents and scripts that report GLM spending can run now.」（设计只给了少做和无影响的例子，不做的这一句是照同一个意思补的）。这一行算 12 项里的一项并排在最前。注入时机同每步提醒：正文摘要变了才注入，所以高峰开始、结束和档位改动各一次，同一段高峰里时刻不走、不重复；压缩之后与目标轮照常再注入。设计的括号时段（`peakHours.en`）计价服务没有这个成员，不写。

**拒绝文字。** 不做档的两条条目的拒绝文字是设计 §6.4 的两段（`denial.ts` 的 `stopText`）：子 agent 的一段说单号、高峰到几点、goal 已暂停（或没暂停成）、在交接里报告单号、`/rules let` 与 `/rules peak`；派活的一段说不拦主 Agent、几点再派。单写不成时仍用 §16.12 的通用文字。

**设计里没写死的地方。**
- 单上记了 `pausedGoal` 的单转给派发它的 agent 之后，这个 goal 属于已结束的会话，不动它（只对会话头 `origin: 'subagent'` 的活 agent 恢复）。
- 新的子 agent 接手挂在根上的不做档的单时，单上若已有旧会话的 `pausedGoal`，不再为新子 agent 暂停 goal（单不能清掉这个字段）。
- 同一次调用既命中不做档又命中人设的排队规则时，签名取 `any:`，单上记全部规则。
- `peakHoldFor` 不变：对一个有「放行这一次」的会话它仍答 `{level, until}`（设计 §15 写的「到期之前为 `undefined`」没有做，这一步不动三个读取函数）。
- 少做档的 `glmSpend` 排队只在 `checkCall` 里：门的事件没有这个字段（§16.10）。

**验证。** L2：`tests/rules-tickets.spec.ts`（不做档：开单与暂停 goal 并记修订号、同会话共用一张单、暂停抛错、之后才有的 goal、主 Agent 与非 GLM 子 agent 与规则板自己的工具从不被拦、读不出高峰时不拦、少做档门里不拦、派活的单与「可以再派」、高峰结束先恢复再叫醒、恢复抛错、人改过的 goal 不恢复、档位改走、子 agent 已结束时交给根、`/rules let` 及 4 小时、重启后接手的几种与高峰已过时当场恢复、行启用时已有的会话、卸载时恢复与 2 秒的上限）、`tests/rules-row.spec.ts`（高峰一行的各种写法与注入时机、没有计价服务时没有、身上有不做档单的会话、算在 12 项里）、`tests/rules-gate.spec.ts`（`rules_show` 里代码条目不再带「未执行」）。假宿主 `tests/fake-rc3.ts` 的 `goals` 有 `pause`、`resume`（`GoalError` 的码、修订号、阶段与 rc.3 一致，调用与顺序记在 `goalCalls`、`log`）与 `agents.list()`。L3：场景 `rules-peak`（见 §16.7）与 `rules-peak-stop`，结果与核实项 V12、V13、V3 的回答见下一段。

**L3 结果与核实项（`npm run probe` 186/186，2026-11-02）。** 场景 `rules-peak-stop`：项目的规则文件里预置不做档，探针时钟在周三 15:00 UTC+8 的高峰里；GLM 主 Agent 经探针行的工具 `probe_stop_goal`（`scripts/probe/probe-dispatch.mjs`）造一个会话头 `origin: 'subagent'` 的 GLM 会话并给它一个 goal，再造一个模型不是 GLM 的子 agent 会话，最后以人的身份经真实的 `/rules` 处理函数打 `/rules peak 无影响`。`rules-peak-stop-exit`：同一个场景停在被暂停的 goal 上、让宿主退出。`rules-peak` 另加 `/wish`、`rules_show` 与主 Agent 的高峰一行。
- V12（在门里暂停 goal 不打断这一步）：成立。`pause` 事件发生时 agent 是 `running`，同一步照常收尾（它的下一个请求里有排队文字，回了一句话结束回合），goal 停在 `paused`，之后四秒里 agent 空闲、轮次数不变，没有新的一轮。插件调 `resume` 之后驱动器马上开下一轮（goal 阶段 `active`、第 2 轮的目标轮消息进了子 agent 的请求），所以「resume 之后要不要改用 `followup` 开回合」这条退路用不上。
- V3（空闲且有 active goal 的 agent 收到 `inject`）：L3 没有走到。恢复之后驱动器立刻开了下一轮，唤醒发出时子 agent 已在 `running`，走的是 `steer`，消息在它再下一步的请求里；`inject` 一路仍只有假宿主的测试。
- V13（宿主正常退出时卸载函数会跑、`goals.resume` 那时成功）：一次性的无头运行器退出时不卸载规则行：退出后心跳文件还在，goal 仍是 `paused`，单仍是 `deferred`、没有 `resumedAt`，流水里没有卸载的那条 `ticket-update`，stderr 没有告警。所以对这种宿主走的是设计写的「不跑」那一支：下一次激活时接手（`adopt` 与 `adoptLive`，L2 测过）。桌面版正常退出时卸载函数跑不跑没有核实（桌面版不动），代码两种情形都照做：卸载跑了就恢复，没跑就靠接手。探针场景钉的是两者自洽：心跳文件不在则 goal 已恢复且单上有 `resumedAt`，在则 goal 与单都是暂停时的样子。
- 场景还核对：主 Agent 与非 GLM 子 agent 的调用照常执行、没有单；被拒的调用不执行，拒绝文字是设计 §6.4 的那一段（含「Your goal is paused.」）；流水依次是 `ticket-open`（harness）、`peak-mode-set`（人）、`ticket-update`（harness，单转 `done`，带 `resumedAt`）；用户级目录下没有 `rules/`。

## 17. 执行层（M7）〔骨架进行中：E0、E1a、E3 已实现，只有纯函数、git 执行器、门禁锁和测试，没有行〕
M7 的设计是 `.agents/tasks/m7/design.md`（不入库，版本 0.6，评审通过、人放行）。执行层的源码在编排层包的 `src/execute/`，目录登记在 `scripts/packages.mjs` 的 `hourness.src`，`packages/hourness/tsconfig.json` 的 `include` 同步加一项（preflight 比对二者）。骨架按设计 §8.1 的步骤实现：E0、E1a、E3 之后没有行、没有监听器，`cordis.patch.yml` 不变；`glm-hourness/execute` 行从 E4 起出现，默认禁用，E9 验证通过后才启用。
### 17.1 写入范围（E0，`src/execute/scope.ts`）
写入范围是任务节点的 `writeScope`：仓库相对路径，`/` 分隔，目录以 `/` 结尾（格式由图的读入检查保证，§2.6）。`scope.ts` 的函数都是纯函数，按整段比较路径：
- `within(scope, path)`：范围里有一项包含这个路径。目录项包含它下面的一切和它自己，文件项只包含它自己；`src/` 不包含 `src2/a.ts`。路径本身可以是目录（计划的 `paths` 写法）：这时只有目录项包含它。比较区分大小写：只会少放行，不会多放行。空范围什么也不包含。不是路径的文本（空段、`.`、`..`、反斜杠、冒号、通配符、控制字符）永远不在任何范围里，所以 `src/../etc` 不会因为前缀相同而放行。
- `overlaps(a, b)`：两个范围里有一对项，一方包含另一方。这一条忽略大小写，因为 Windows 和 macOS 的文件系统会把两种写法当成同一个文件，宁可串行。空范围（审查）不与任何范围相交；不是路径的项按相交处理。
- `repoRelative(root, cwd, target, api)`：工具调用的目标按调用方的工作目录解析，相对工作树根写成 `within` 认的写法；在根之外、在根下的 `.git` 里（不分大小写，忽略末尾的点和空格）时返回 `undefined`，根本身是空串。`api` 可换成 `path.posix` 或 `path.win32`，测试两种都跑。
- `isScopePath(text)`：文本是不是范围写法。`tests/execute-scope.spec.ts` 用一张候选表钉住它与图读入检查的结论一致。
调用方（E4 的 `worker-scope` 与派发门禁、E1a 的 `checkPlan`）按设计 §3.2.1、§3.3.2、§3.5.1 使用这几个函数；E0 本身不接任何调用方。
### 17.2 模块读法与放行状态（E1a，`src/graph/execute-stage.ts`）
M7 判一个任务此刻能不能派、能不能写，要读目标的模块结构。读法的正式出处是 M3 的 `src/graph/modules.ts`（附录 0.5 §3.14.1），它还没合入，所以 `execute-stage.ts` 里有一段标明「STAND-IN」的替身，按附录的签名实现 `modulesOf`、`moduleCandidatesOf`、`moduleOf`、`isReleased`、`isSplit`、`directionsOf`。M3 的文件合入时删掉这一段，改为从 `./modules.ts` 导入，`ModuleReaders` 留作注入类型。m3 分支的第 5 步已经写好 `modules.ts`（§4.9），合入 main 时按这一段换。
- `releaseOf(graph, task, readers?)`：先查任务最近的模块（任务不在模块下时跳过），再查目标；`task` 是目标时只查目标层。结果三种：`{ok: true, goal, module?}`（各带放行时刻 `at`）、`{ok: false, level, node, stage}`、`{ok: false, level: 'module', reason: 'unreadable'}`。第三种在读模块的函数抛错、而目标有带 `stage` 的直接特性（按原始图数，不经读法）时返回，派发与写入都拒绝；没有这种特性的目标不受影响。
- `releaseAtOf(node)`：节点最近一次由 `release` 之前（或没有阶段）改到 `release` 或之后的那条历史的时刻；节点现在不在放行状态时为 `null`。模块被退回设计再放行，时刻不同，pins 因此让退回之前派出的活过期。`sentBack(node)` 认出「由 release 之后改回 design」。
- `scopedTasks(graph, node, readers?)`：目标或模块子树里的任务，去掉模块设计的审查任务；对目标另外去掉设计中的模块下的任务。
- `isDesignReview(graph, task, readers?)`：`kind` 为 `review`、写入范围为空、`source` 连线都指向某个模块下的决策，并且第一条历史是 `harness` 的提议。最后一项比设计多一条：普通审查任务也引用决策，没有它，挂在没放行的模块下的普通审查任务会被当成设计评审而跳过放行检查和「只收已批准」的检查。读法抛错时结果为 `false`。
### 17.3 pins（E1a，`src/graph/pins.ts`）
`pinsOf(graph, task, sha256)` 对任务、它到目标的每个祖先、它的 `source` 连线指向的每个节点各算 12 位十六进制摘要，只含改变意图的字段，按节点类型：任务是验收、非目标、`kind`、是否废弃或被取代；目标、特性等祖先是验收、非目标、是否废弃或被取代，目标和读法认出的模块另带 `releaseAt`；决策是 `verification` 是否为 `overturned` 或 `superseded`、状态；待决是拍板结果或提议式的结论、状态。标题、正文、历史、写入范围不进摘要。`staleness(graph, line, sha256)` 返回变了或不在图里的节点；读不出的 pins 行返回一条 `(pins)`，不会被当成没变。哈希函数是参数，文件不导入 Node 内置模块，客户端也能导入。待决的 `conclusion` 字段由 M3 第 6 步加进 `GraphNode`（§2.6），摘要直接读它。
### 17.4 派发的纯函数（E1a，`src/execute/`）
- `brief.ts`：`parseDispatchArgs`（§6.4 的形状检查）；`briefGate(graph, node, ctx)` 按设计 §3.5.1 的次序返回第一条拒绝：`invalid`、`bad_task`、`not_released`、`bad_attributes`、`no_acceptance`、`deps_open`、`waiting_human`、`busy`、`scope_busy`、`slots_full`（槽位与高峰少做上限两处）、`bad_schema`、`nothing_to_review`、`no_directions`；读不出模块结构时在这之前就以 `not_released` 拒绝。门禁读 `ctx.release`，不读阶段；模块设计的审查任务跳过模块层、目标层照查。要审查任务的交回状态、`outputSchema` 是否可解析这类要别的步骤才有的事实，门禁从 `ctx` 取，不自己造。`renderBrief` 按 §3.5.2 从图生成给 worker 的简报：英文、至多 9000 字符，超出时依次把经验、上一次的发现细节、主 Agent 的补充换成「truncated」；页脚带正文的摘要与图修订号。审查任务和模块设计评审的简报在 E6 与 E4。
- `plan.ts`：`checkPlan` 对 worker 交来的计划做 §3.3.2 的检查（入参按 `unknown` 处理，每条问题一行）；计划一节在任务正文里的渲染、读回、替换与批准标记；批准批注；`carriedPlan` 判已批的计划能不能带到下一次派发。设计里 `checkPlan(task, plan, norm)` 有第三个参数 `norm`，文中没有任何一条检查用到它，没有实现。
- `attempts.ts`：`childId` 的生成与解析（`hz-<id>-a<次>-<6 位>`；目标整体的审查是 `hz-<id>-acc-a<轮>-<6 位>`）、一次在跑的派发的记录 `Attempt` 与对它们的查询、派发批注的渲染与读回、下一次派发的序号。登记表本身（模块级的 Map）是 E4 的事。
- `models.ts`：`parseModelArgs`、`checkModelChoice`（目录核对与档位核对，目录读不到或为空时放行并带注）、`agentOptionsOf`、`catalogHint`。读目录与读档位是调用方的事。
- `digest.ts`：简报、计划与批注用的 12 位摘要。
这些函数没有调用方：`dispatch_task` 与执行行从 E4 起接上它们。
### 17.5 git 执行器（E3，`src/execute/git.ts`）
harness 自己跑的 git 都从这里走：任务与门禁的工作树、两个提交之间的改动清单、一个文件在两个提交里的内容比对、提交尾注、主干与它的远端跟踪引用、`ls-remote`。`createGit(runner)` 返回全部操作，是一组封闭的具名操作，各自检查自己的参数，没有接收任意 git 参数的入口（内部的 `run` 不对外；E3 评审 E3-3）；`tests/execute-git.spec.ts` 钉住这份名单，加操作要连这条断言一起改、一起过审。`execRunner(program)` 是 `execFile` 的包装（不经 shell，环境 `LC_ALL=C` 与 `GIT_TERMINAL_PROMPT=0`，输出上限 64 MiB），它不抛错，把「没有退出码」分成 `missing`、`timeout`、`overflow`、`failed`；测试对着 `node -e` 测退出码、超时和找不到程序。
- 每次 git 调用都以 `--no-replace-objects` 开头，`git replace` 因此改不了 harness 读到的内容。`tests/execute-git.spec.ts` 把一个提交的树替换成另一个提交的树：普通 git 看不到那处改动、读到的是替换后的内容，执行器两样都读对了；同一个用例断言全部操作启动的每个 git 进程都带这个参数。唯一把文件路径当 pathspec 的调用（`ls-tree`）另带 `--literal-pathspecs`，所以名为 `:(top)x.txt` 的文件不会被当成魔法写法而读成「不存在」；它不是全局选项，因为 `check-ignore` 拒绝它。
- 紧跟其后是 `-c core.hooksPath=<空设备>`、`-c core.fsmonitor=false`，再加 `-c hook.post-checkout.enabled=false`、`-c hook.reference-transaction.enabled=false`、`-c hook.post-index-change.enabled=false`（空设备取 `os.devNull`：Unix 上是 `/dev/null`，Windows 上是 `\\.\nul`；不用空值，空设备之下不是目录，git 在那里找不到钩子，测试在本机的 git 上证明了这一点）。仓库的钩子目录里的钩子、配置里定义的钩子（`hook.<名>.event` 与 `hook.<名>.command`，可以写在仓库的 `.git/config`，也可以写在全局或系统配置里）与 `core.fsmonitor` 命令因此不会在 harness 自己的 git 调用里运行。配置里的钩子与钩子目录里的钩子叠加着跑，`core.hooksPath` 指向空设备管不到它们，所以要按事件关：`hook.<事件>.enabled=false` 让这个事件没有任何钩子触发，不用知道钩子叫什么名字；选这三个事件，是因为这些调用（`worktree add`、`checkout --detach`、`reset`、`update-ref`、`branch`、`status`）实测只会触发 `post-checkout`、`reference-transaction`、`post-index-change`（E3 后续评审 FU-4 用 git 2.55.0 逐个事件试过，另外 18 个事件不触发）。钩子若挪动了主干，是发生在任何 agent 的 shell 调用之外，设计 §3.8.4 只能当作外部前进（E3 评审 E3-6，由人定：harness 自己的 git 调用不运行仓库的钩子与 fsmonitor；主 Agent 与子 agent 在自己的 shell 里跑的 git 不受影响）。版本边界：配置里的钩子从 git 2.54 起有，按事件整体关闭的 `hook.<事件>.enabled` 从 2.55 起有；2.54.0 的文档里只有按钩子名关闭的 `hook.<名>.enabled`，没有按事件的开关（没有在 2.54 上实测），按文档推断在 2.54.x 上这三个选项管不住配置里的钩子（目录里的钩子与 fsmonitor 照样管得住，2.54 之前的 git 不读配置里的钩子，没有这个问题），代价是主干被钩子挪动时按外部前进处理，落在 §3.8.4 保守的一侧；没有另去读配置里的钩子名逐个关。没有关的：检出与重置按 `.gitattributes` 调用的过滤器（`filter.<名>.smudge` 等），以及 `ls-remote` 连远端时用的传输程序（`core.sshCommand`、凭据助手）；设计 §6.5 写明这一点。`tests/execute-git.spec.ts` 里四处钉住：全进程用例断言每个进程都带这五个选项；三个用例让真钩子（钩子目录里的 `post-checkout`、`reference-transaction`，配置里定义的这两个加 `post-index-change` 并另有十四个其他事件的哨兵）与真 fsmonitor 命令各自写记号文件，先让普通 git 在同一仓库里运行它们作对照，再断言 `ensureWorktree`、`prepareGateWorktree`（建、移、带改动的移）、`removeWorktree` 之后记号文件不存在；配置钩子那个用例还要先证明这台机器上的 git 读配置里的钩子、且这三个选项在普通 git 上确实关得住它们，做不到（2.54 之前，或 2.54.x）就带理由跳过，不空过；没有这些选项时全进程用例与三个事件逐个去掉时的配置钩子用例都失败。
- 从外面来的修订号、分支名不能以 `-` 开头、不含空白与控制字符，不然不起 git 进程；`ls-remote` 只认配置里的远端名（`[A-Za-z0-9._-]`），不认 URL。git 失败不抛错：读操作返回 `Outcome`（成功的值，或失败的一行原因），有设计里的码的操作返回拒绝（`code`、`reason`、必要时带 `files`）。
- `changedFiles(from, to)`：`diff --no-renames --ignore-submodules=none --name-status -z`。改名算删掉旧路径加新增新路径，`diff.renames` 配置改不了它；文件名按原样读（`-z`）。读不出是失败，由调用方照设计 §3.8.5 当作命中。
- `entryAt(rev, path)` 与 `sameContent(a, b, path)`：用 `ls-tree` 的 mode、类型、对象号比对。三者都相同才算同一份内容（设计写的是对象号；加上 mode 是往严的一侧，改了可执行位的文件不会被当成审过的那一份）。两边都没有这个文件算相同，一边有一边没有不同，修订号不存在是失败而不是「相同」。压缩、变基、合并之后没改的文件仍相同；冲突解决时改过的文件不同。
- `taskTrailers(from, to)` 与 `lastTaskCommit(base, task)`：只认提交说明末尾的 `Hourness-Task:` 段，正文里提到不算，任务号整段相等（`task-1` 不匹配 `task-10`）。
- `ensureWorktree(cwd, task)`：路径 `<仓库根>/.worktrees/hz-<任务>`，分支 `hz/<任务>`，基线是主检出当前的分支。分支名读完整引用（`symbolic-ref --quiet HEAD` 去掉 `refs/heads/`），建工作树的起点和找最近一个带尾注的提交也都写成 `refs/heads/<分支>`：有同名标签时 `--short` 会打印 `heads/main`，裸名 `main` 会解析到标签（E3 评审 E3-4，测试里标签落在旧提交上）。拒绝的码：`not_git`、`no_base_branch`、`bad_task`（任务号不合节点 id 的写法，或叫 `gate`：`hz-gate` 是门禁工作树的目录）、`worktree_dirty`（带文件）、`worktree_failed`（带原因：目录在 git 里登记了却不在、目录在却不是这个仓库的工作树、工作树在别的分支上）。`.worktrees/` 与 `.hourness/` 没被任何忽略规则盖住时，经 `src/data/project-root.ts` 的 `ensureIgnored` 写进主检出的 `info/exclude`（从链接的工作树调用时也写主检出的，各工作树共读它）；写进去的是 `.worktrees/` 而不是设计写的 `/.worktrees/`，这是共用函数的写法，效果包含后者。任务进过主干时按祖先关系判旧分支：`M` 是基线上最近一个尾注带这个任务的提交，`M` 是分支的祖先就复用（分支是进主干之后建的，或快进合入的），不是（压缩合入）就让旧工作树干净地走开：旧工作树干净就不带 `--force` 地删掉，不干净就 `worktree_dirty`；旧分支改名为第一个空着的 `hz/<任务>@<n>`，再从基线新建分支与工作树，结果带 `renamedFrom`。同一次返工里再派一次，新分支以 `M` 为祖先，照样复用。准备命令不在这里跑：新建的工作树返回 `created: true`，由 E4 跑。`removeWorktree` 永远不带 `--force`。
- `prepareGateWorktree({root, commit, saveSnapshot})`（设计 §3.8.3 第 5 步）：门禁工作树 `.worktrees/hz-gate` 不存在就在 `commit` 上新建（分离头指针，`created: true`）；存在就先守卫：必须在 `git worktree list` 里、在磁盘上、是分离头指针，并且对 git 来说是自己的工作树（目录里丢了 `.git` 文件时，git 会把它当成上面的主检出，重置会落在主检出上；设计没写这一条）。「自己的」要同时满足四条：`rev-parse --show-toplevel` 就是这个目录；`--git-common-dir` 与项目根的相同（不是另一个仓库）；`--absolute-git-dir` 是 `<共用目录>/worktrees/<名>`（不是主检出自己的 `.git`）；那个记录目录里的 `gitdir` 文件指回这个目录的 `.git` 文件（不是别的工作树的记录）。`.git` 文件被改成指向主检出的 `.git`、某个任务工作树的记录、另一个仓库时，`--show-toplevel` 仍答这个目录，`git worktree list` 也仍把它列为分离头指针，只有这四条挡得住；`tests/execute-git.spec.ts` 对三种改法各钉一遍：不请求快照，主检出的分支和未存改动、任务工作树的分支都不动（E3 评审 E3-1）。不合就 `gate_worktree_invalid` 而且什么也不重置。门禁工作树里自己提交的东西也不丢（E3 评审 E3-2）：干净的工作树里提交一次，这个提交只有它的 HEAD 指着，下一次 `checkout --detach` 就从所有引用里掉出去，只剩工作树的 reflog，快照也不会存（快照只管未提交的改动）。所以 harness 每次把门禁工作树放到某个提交上之后，在引用 `refs/hourness/gate-head` 里记下这个提交（执行器用 `update-ref` 写的唯一一个引用；`ensureWorktree` 另外建、改名自己的 `hz/<任务>` 分支，主干、别的分支、标签和远端跟踪引用执行器都不写）；再次进来时先看 HEAD 有没有引用包含它（`for-each-ref --contains`），没有就 `gate_worktree_invalid`，原因里说明怎样保住它（`git branch <名> <提交>`）或删掉工作树，什么也不重置。harness 自己放的提交总有这个记录引用包含着，所以检查过的提交之后被改写、分支被删，下一次检查照样能开始；只有此后在这里做的提交没有引用，会被拦下。记录在 `checkout --detach` 成功之后立即写，早于耗时的 `reset` 与 `clean`；新建门禁工作树时在 `worktree add` 之后写。有改动时先存快照再丢：已跟踪文件有改动调一次 `saveSnapshot(path, {sub: 'reset', args: ['--hard']}, 'discard')`，有没被忽略的新文件再调一次 `{sub: 'clean', args: ['-fd']}`；设计只写了前一次，但 M3 的 `reset` 快照只存挡在路上的未跟踪文件，其余的会被 `clean -fd` 删掉，所以两种都存。任何一次存不了（返回失败、抛错）就 `gate_snapshot_failed`，不丢任何东西。然后 `checkout --detach --force`、`reset --hard`、`clean -fd`，被忽略的文件（`node_modules`、产物）留着，最后核对 HEAD 就是要检查的提交。`saveSnapshot` 是 M3 `takeSnapshot` 的接缝类型（M3 的文件还不在 main）；E7 把真函数接到它上面。
- `watchedDigest(dir, files)`：监视文件（缺省 `package.json`、`package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`yarn.lock`）的内容与有无合成的 12 位摘要，与列表次序无关；监视的路径是文件，目录或读不出的路径得一个固定的标记，自己不报变化。
- `trunkUpstream(cwd, trunk)`：主干的上游远端（配置的上游，没有就取唯一的那个远端，远端不止一个才取 `origin`；设计写的是「没有时取 `origin`」，唯一的远端叫 `upstream` 时那会指向一个永远不存在的引用，推到真正远端的推送就没人看（E3 评审 E3-7），所以这一处往严的一侧改，其余情形与设计相同；仓库没有远端时返回 `undefined`，只有本地主干）和它的远端跟踪引用 `refs/remotes/<远端>/<主干>`。`trunkRefs(cwd, trunk, remote)` 一次读出本地主干 `L` 与跟踪引用 `T`。`reflogSubject(cwd, ref)` 读 `T` 最新一条 reflog 的说明，`reflogKind(subject)` 把它分成 `fetch`（`fetch ...`、`pull ...`）、`push`（`update by push`）、`unknown`。说明只是线索：本机对自己 `git fetch . x:refs/remotes/...` 写的是同样的 `fetch` 字样，`update-ref -m` 也能伪造，测试把这几种都钉住了；设计 §3.8.4 因此另要这次调用里的命令来佐证。`lsRemote(cwd, remote, trunk)` 问远端本身主干在哪（没有这个分支是 `undefined`，连不上是失败）。
这些函数没有调用方：任务工作树从 E4 起接上，检查、主干前进的核对和巡检从 E7 起接上。测试 `tests/execute-git.spec.ts`（40 例，真实 git 仓库，裸仓库当远端，同一文件里的用例并行跑；门禁守卫读 git 失败的拒绝由两例注入失败的 runner 钉住：守卫的四次读（三次 `rev-parse`、一次 `for-each-ref --contains`）和记录 `refs/hourness/gate-head` 的两处写（建、移），任何一次失败都得 `gate_worktree_invalid`；读失败时 `checkout`、`reset`、`clean` 都不启动，移时记录失败则 `reset`、`clean` 不启动）。
### 17.6 门禁锁（E3，`src/execute/gate-lock.ts`）与共用文件锁的选项
一个项目同时只有一次检查或主干全量检查在用门禁工作树，锁文件是 `<项目>/.llm/execute/gate.lock`，用的是仓库唯一的文件锁 `src/data/lock.ts`，不是第二份实现。
- `acquireLock(file, environment, options)` 多了第三个参数 `LockOptions`，发现 R5-N6 要的四个值都在里面：`retryMs`（重试间隔，缺省 25 毫秒）、`waitMs`（最长等待，缺省 2 秒）、`staleMs`（锁的 `at` 戳比这更老就算陈旧，缺省 10 秒）、`bootToleranceMs`（锁里的开机时刻与现在的相差超过它就算陈旧，缺省不比），另有 `holder`（持有者名，写进锁文件）、`keepStale`（陈旧的锁改名为 `<文件>.stale-<毫秒>` 留着，缺省直接删）和 `unreadableGraceMs`（读不出内容的文件要看到多久才算废弃，缺省 0，见下面接手一条）。不传选项时行为与之前完全一样，规则板不用改。`LockEnvironment` 多一个可选的 `bootTime()`（现在减去 `os.uptime()`）：环境没有它就不写 `boot`、也不比较开机时刻，按旧接口写的环境对象照常能用（E3 评审 E3-5；原先它是必填的，每次取锁都调用，缺了会抛 `TypeError`）。锁文件内容多 `boot`（环境答得出时）与 `holder`（调用方报了名时）。
- 陈旧按锁里的 `at` 戳算，那就是文件的修改时间：持有者只在创建时写一次，没有人重写；它来自注入的时钟，所以测试不用改文件时间。设计与发现写的是「修改时间」，这里取等价而可测的 `at`。M5 §5.3 的 `host` 字段没有写：没有人读它，M5 有了第一个读者再加。
- `acquireGateLock(execDir, holder, setup?)`：用门禁的值（每 5 秒重试一次，至多等 60 分钟，之后 `busy`，设计里的 `gate_busy`；持锁超过 6 小时陈旧；开机时刻差超过 120 秒陈旧；陈旧的锁改名留着）。第一次用时建 `<exec>/` 和里面内容为 `*` 的 `.gitignore`（已有就不动）。同一进程里的持有者按到达的次序排队，前一个放锁就立刻交接，不等下一次轮询；中途放弃的等待者不会让后面的越过前面还在等的。排队只省时间和保次序，真正排他的是文件。
- 设计只写了开机时刻和持锁时间两种陈旧；持有者进程已经不在也算陈旧（共用锁原有的规则，保留）：同一台机器上进程已死是确定的，否则一次崩溃之后要 `busy` 到 6 小时。进程号被别的进程占用时按活着算，往久等的一侧错。
- 释放时只删令牌还是自己的锁；被误判陈旧而被接手的持有者用 `held()` 发现，不会删接手者的锁。
- 接手不是原子的（E3 评审 E3-8），有两个窗口。一是创建锁分两步：`wx` 打开，再写内容，等待者恰好在两步之间读到的是空文件，原先按「内容读不出就是废弃」立刻接手，创建者其实还活着。新选项 `unreadableGraceMs`（缺省 0，规则板的行为不变；门禁取 `GATE_UNREADABLE_GRACE_MS` = 2 秒，小于一次轮询）：没有 pid 也没有时间戳的内容（空文件、不是 JSON、`{}`）要同一个等待者连续看到同样的内容满这么久才算废弃，期间内容变成有效的锁就不接手，文件消失或被接手之后重新计时（上一次看到的空文件不算在后来的空文件头上）；创建者崩在两步之间留下的空文件，最多多等一次轮询。有 pid 的锁（持有者已死）照旧立即接手。二是等待者「重读、再改名」之间，接手者刚建的新锁可能被挪走，这个窗口是微秒级，没有复现，也没有在锁文件层面消除：门禁锁的持有者（E7）在写检查记录之前要调 `held()`，并按设计 §6.3 比较门禁工作树的 HEAD。
- 测试 `tests/execute-gate-lock.spec.ts`（24 例）：门禁的值与 M5 的值（50 毫秒、2 秒、30 秒、120 秒）各对四个选项带一例，不传选项时的原有行为，`keepStale` 与 `holder`，活着的锁让后来者等到超时，陈旧（时间、开机时刻、进程已死），只删自己的令牌，同进程排队与放弃；没有 `bootTime` 的旧式环境对象，读不出内容的文件在缺省下立即接手、在宽限下等够才接手、创建者在宽限内写完就不接手、中间出现过有效的锁就重新计时、门禁锁的宽限。
## 18. 循环板〔L1（两块板共用的条目形状）已实现 2026-10-31；L2（条目与校验、服务与登记表、循环行自己的事件和默认条目、行的骨架）已实现 2026-11-01，L2、L3；存储、`/loops`、投影与文件门 §18.7、§18.8 已实现 2026-11-02，L2、L3；运行时核心（运行锁与拍、交接、收件箱、去抖与限次、运行与记录）§18.9 已实现 2026-11-02，L2、L3；绑定主 Agent 与投递（到点的 DSH 任务、`holderState`、唤醒表、`loops:schedule-tools`）§18.10 已实现 2026-11-02，L2（L3 只验到两道门装上，见 §18.11）；高峰的开始与结束 §18.12 已实现 2026-11-02，L2、L3；脚本执行器与人采纳的脚本条目的执行（§18.9 的 script 行，`src/loops/script.ts`）已实现 2026-11-04，L2；行默认启用（2026-11-04 的启用提交起；此前禁用），桌面版首轮验收未做〕

完整设计是 `.agents/tasks/schedules/design.md`（不入库，版本 0.6，评审通过、人放行）。循环板放「到点了或碰到某件事，就去做一件事」，是编排层包 `dsh-hourness` 里的一块板，行是 `glm-hourness/loops`（默认启用）。这一节随实现分步补写：两块板共用的条目形状（§18.1、§18.2）、循环板的条目与校验（§18.3）、服务与登记表（§18.4）、循环行自己的事件和默认条目（§18.5）、行（§18.6）、人的条目的存储与 `/loops`（§18.7）、文件门 `loops:files-only`（§18.8）、运行时核心（§18.9：运行锁与拍、交接、收件箱、去抖与限次、运行与记录、脚本与检查的执行）。源码目录 `src/loops/` 登记在 `scripts/packages.mjs` 的 `hourness.src` 和 `packages/hourness/tsconfig.json` 的 `include` 里。还没有：工具（`loop_propose`/`loop_show`/`loop_note` 那条人同意的路）、页面、机器一级的运行者与账号一级的两个通道事件（等 M6 的契约 `src/shared/channel-loop.ts`）、循环行自己的钟（时间触发的 script 与 harness 条目由它跑，设计 §6.2 的 `clock.ts`——人的会跑东西的条目只能经提议通道加，它落地之前够不到）、`/loops` 的列表与接受/拒绝（§18.7 已记）。`src/loops/script.ts` 的执行器（`runScript`/`runCommand`/`resolveProgram`）已就位，检查条目在 env 行合入前仍是 `refused`（`check-missing`）；gate 一路的排队与拦路脚本随规则板采纳共用执行器时再加。

### 18.1 条目的形状（`src/loops/trigger.ts`）

- 两块板的每一条都是 `HookShape<A>`：`when`（`Trigger`：一次 `once`、每隔 `every`、每天 `daily`、每周 `weekly`、`cron`、事件 `event`、命令 `command`）加可选的 `filter`（`EventFilter`，只配事件触发）加各板自己的动作 `A`。脚本动作的共用部分是 `ScriptAction`（`ScriptRef` 钉住文件路径、内容哈希和语言）。规则板导入这个文件，不另写一份。
- 共用的事件表里每个事件由 `LoopEventDeclaration` 声明：字段（`LoopEventField`，每个字段至多声明一种比法）、参数（`LoopEventParam`）、人能不能选、拦路的缺省（`gateOnErrorDefault`）、是否只列出（`listedOnly`）。`gate.` 开头的名字空间是规则板的拦路事件，`validateWhen` 只在 `allowGate` 为真时收。
- 文件只有类型、常量和纯函数，不导入 Node 内置模块，面板也能导入。不读文件；唯一读时钟的地方是 `matches` 写入时试跑用的 `performance.now()`（Node 和浏览器都有的全局），条目要对着哪个时刻检查由调用方传入。
- `nextOccurrence(when, after, systemTimeZone)`：`once`、`every`、`daily`、`weekly` 的下一个时刻；事件、命令和 cron 触发返回 `undefined`（cron 由 DSH 的定时服务算）。缺时区的写法取传入的系统时区。夏令时：春季跳过的钟点那一天不触发，秋季重复的钟点只取较早的一次。读不懂的输入返回 `undefined`，不抛错。
- `validateWhen(when, filter, table, options)`：返回问题列表（`{path, message}`，空表示没问题），不抛错。检查：事件 1 到 4 个、都在事件表里、人只能选标了「人能选」的；筛选的键是每个列出的事件都声明了的字段、比法是字段声明的那一种、值的类型和个数合规（`in` 至多 50 个，`paths` 至多 20 个）；参数按声明（必填、类型、`min`/`max`）；`once` 严格晚于 `now` 且至多一年以后；`every` 为整数秒，告诉主 Agent 的至少 600、其余至少 300，至多 31,536,000；`daily`、`weekly` 的 `HH:MM`、时区（人写的必写）、星期 1 到 7；`cron` 五个字段、总长至多 100、只配告诉主 Agent；命令触发只给插件的「自己做」条目。`options` 在设计写的 `allowGate`、`origin` 之外多两项，都是设计里的规则需要它们才能在这里判：`now`（`once` 对着哪个时刻）和 `action`（`'tell-main'`、`'self'`、`'work'`：`every` 的下限、cron、命令触发和只列出的事件都取决于条目的动作）。路径是否存在、一个项目至多 20 个目录（`loops.file-changed` 的 `path`）这类要读文件系统的检查留给调用方。
- `matchesFilter(filter, payload, project)`：这一次事件的载荷过不过筛选，纯函数，不抛错；字段缺了或类型不对就不过。`paths`：以 `/` 结尾是相对项目根的目录前缀；带 `/` 的名字是相对项目根的一个文件；不带 `/` 的名字匹配任何一层目录里的同名文件；`*` 不跨 `/`；整段的 `**` 匹配零个或多个目录（`docs/**/*.md` 也匹配 `docs/setup.md`，`**/x.json` 也匹配 `x.json`），不是整段的 `**` 同 `*`；项目根下的绝对路径先化成相对路径（反斜杠按 `/` 算，Windows 盘符路径不分大小写）。`matches`：JavaScript 正则，不分大小写，只看值的前 8192 个字符。
- `matches` 的写入检查：至多 300 个字符、编得成；编成之后在固定的长输入上各试一次（一个字符重复、重复加一个不匹配的结尾、空格加结尾、`=` 重复、字母数字交替等九种形状），单次超过 50 毫秒就算太慢、不收。正则一旦开始回溯就停不下来，所以输入从 8 个字符起每次长 15%，一直到 8192，碰到第一个超限的就停；一个行为良好的正则要把全部长度跑完，开销可以忽略；平方级回溯的正则（例 `.*foo`）能跑完但要约一秒，每一步都不到 50 毫秒就照收。

### 18.2 脚本的超时取值（人的决定 `d-timeout-measured`）

- 超时的值只由一个纯函数 `effectiveTimeoutSeconds` 取：写脚本的 agent 在人批准时给的估计值起步；有运行记录之后取最近若干次运行里最慢一次的 3 倍（有运行时估计值让位）；永不高于上限，3 倍最慢超过上限时取上限并返回 `capped: true`，让调用方告诉主 Agent；没有估计也没有运行时取上限。上限：拦路的事件 30 秒（`GATE_TIMEOUT_MAX_SECONDS`），别的事件与时间触发 1800 秒（`WORK_TIMEOUT_MAX_SECONDS`）；下限 1 秒和 5 秒，是 `ScriptAction.timeoutSeconds` 允许的最小值。结果取整数秒、向上取整。设计原文的缺省 10 秒 / 60 秒是没有估计时的旧缺省，被这一决定取代。
- 缺数据、负数、非有限数、空运行列表、没有 id 的运行都当作没有，函数不抛错，不读时钟与文件。结果总带来源：`'ceiling'`、`'estimate'`，或算出它所依据的运行 id 列表；传入的上一个取值原样放在 `previous`，以后写变更记录的一方由此能记下「谁、凭什么、从什么值改成什么值」。
- `validateScriptAction(action, context)`：脚本动作的时间部分，两块板共用。`timeoutSeconds` 必须是整数秒，拦路的事件 1 到 30、别处 5 到 1800，没写时调 `effectiveTimeoutSeconds` 补上（结果带 `filled`，记着来源与有没有被上限截）；`onError` 只在拦路的事件上有，没写时取事件声明的 `gateOnErrorDefault`，再没有则 `allow`。
- 这一步没有做的：每个条目的取值变更记录、超时后拦路脚本在后台接着跑到 10 分钟（gate 一路随规则板采纳执行器时再加）、页面和晨报上的显示。执行器已在（§18.9 的 script 行）：超时的事件记录是结局 `unfinished` 的 `loop-done`，超时的消息按条目的 `report` 交（`unfinished` 不论 report 都交）；还没有的是取值变更记录随提议通道走的那一半。

### 18.3 条目与它的校验（`src/loops/model.ts`）

- 一项条目 `LoopEntryDefinition` 是 `HookShape<Action>`（`when`、可选的 `filter`、`action`）加 `id`、`title`、`why?`、`limits?`（`debounceSeconds` 0 到 3600，`maxPerHour` 1 到 60）、`quiet?`（`from`、`to`，两个不同的 `HH:MM`）、`scope?`（`project`；`machine` 只给通道包的两项）、`basis?`（至多 80 个字）、`ownRules?`（至多 6 行，每行至多 80 个字）。`LoopEntry` 再加 `source` 与 `rev`；插件的条目 `rev` 是规范化 JSON（键按码点排序）的 SHA-256 前 12 位十六进制。人的条目的 `source`（谁、何时、经谁、原话）和 `status` 随存储，这一步的 `LoopEntry` 只有插件一种来源。
- 动作 `Action` 五种：`tell-main`（`text`、`wake`）、`harness`（交来它的那一行跑的动作 id，可带 `tell`）、`script`、`check`、`self`（`does`、`by`，那一行自己做，循环板只列出）。`script` 与 `check` 是类型，校验只收人的条目；插件的条目只能是 `tell-main`、`harness`、`self`。
- `validateEntry(input, origin, context)` 返回问题列表（`{path, message}`，空表示没问题），两种来源同一个函数，不抛错：
  - 字段：`id`（人的 `u-` 加 8 位小写十六进制；插件的 `<名字空间>.<名>`，或通道的 `<通道>:<名>`）、`title`（去首尾空白后 1 到 60 个码点，一行）、`why`（插件的必填，人的可以没有；写了就是 1 到 150 个码点，一行）。不认识的字段按名字拒；`source`、`rev`、`status` 是循环板自己写的，写条目的一方不写。
  - `when` 与 `filter`：交给 `validateWhen`（§18.1），`allowGate` 为假；`options.action` 由动作定：`tell-main` 取 `'tell-main'`，`self` 取 `'self'`，`harness`、`script`、`check` 取 `'work'`。
  - 动作：人的条目只能是 `tell-main`、`script`、`check`，插件的只能是 `tell-main`、`harness`、`self`，别的种类按名字拒。`tell-main.text` 与 `harness.tell.text` 是 1 到 2000 个码点；`{名字}`（字母开头、只含字母和数字）必须是 `when.events` 里每个事件都声明的字段，到点的条目不能有占位；别的花括号写法（`{"a": 1}`、`{ x }`、`{}`）是普通文字。`harness.action` 必须在交来它的那一份列的动作里（`context.actions`）。脚本：`script.file` 等于 `docs/loops/scripts/<条目 id>.<后缀>`（`pwsh` 为 `ps1`，`node` 为 `mjs`，`python` 为 `py`，`bash` 为 `sh`），`sha256` 是 64 位小写十六进制，超时 5 到 1800 的整数秒（调 `validateScriptAction`，目的是 `'work'`）；检查：`tool`、可选的 `check`、`argv` 1 到 64 项且每项 1 到 2000 个码点、不含空字符、超时 5 到 1800；两者共有的 `report`（`always`、`on-failure`、`on-change`）、`to`（`main`；`event-session` 只配事件触发，到点的条目没有会话）、`note`（至多 500 个码点）、`glmSpend`。
  - 安静时段只配「告诉主 Agent」的事件条目。
- 事件表里没有的事件：`context.absent` 里列的 id，插件的条目可以点名（人的条目不行）。这时条目等着，能不靠声明查的现在查（事件个数、已声明的那几个事件的筛选与占位），其余等声明到了再查。
- 这一步没有做、留给存储和 M4 的读法的检查：`loops.file-changed` 的 `path` 是存在的目录、一个项目至多 20 个；检查条目的 `tool` 在项目图上有节点、`commandText(argv)` 至多 4000 个码点。设计里没写上限、本版取的数：`self.does` 至多 500 个码点，`check.tool` 与 `check.check` 至多 200 个码点，事件的标题至多 60 个字。

### 18.4 服务与登记表（`src/loops/service.ts`、`registry.ts`）

- 服务 `glmHournessLoops`（常量 `LOOPS_SERVICE`）：契约与读取函数 `loopsService(ctx, problem)` 在 `service.ts`，不导入循环行的其余代码。成员是已经做出来的 `contribute(source, contribution)`、`emit(event)`、`listens(event, cwd)`、`recordRun(run)`（§18.9）；`attachable`、`acceptProposal`、`staleEntries`、`timeoutEntries` 随人同意的那条路（还没有）。读取函数只查已有的成员，服务比契约宽也照读；不在时返回 `undefined` 不出声，成员类型不对时返回 `undefined` 并回调 `problem`。服务只在有会话控制器的进程提供（§18.6、§18.9），所以「服务在」就是「这个进程能投递、会执行条目」，读不到它的行（M7）照自己的退路执行事件条目。事件声明的类型（`LoopEventDeclaration`、`LoopEventField`、`LoopEventParam`）定义在 `trigger.ts`，`service.ts` 原名再导出。
- `Contribution` 是 `{events?, entries, actions?, run?, details?}`：条目、这一行能告诉循环板的事件、这一行执行的 harness 动作 `{id, title}` 和执行它们的 `run`，以及只给页面看的明细。
- `contribute` 同步完成，同一个来源（包名加行 id）再交一次整份替换上一次；返回的 `dispose` 只撤回它自己那一份（替换之后旧的 `dispose` 什么也不做）。返回 `ok: false` 的情形：来源的包名或行 id 写法不对；名字空间 `loops` 不是循环行交的、`hourness` 不是执行行交的、`channel` 谁也不能占用、`gate.` 的事件不是规则行交的（规则行只交事件，它交的条目被丢掉）；名字空间已被另一个来源占用。被整份拒绝的不改动已有的那一份。
- 名字空间：一份里所有条目、事件、动作的 id 都以同一个名字空间开头，名字空间取第一个条目（没有就第一个动作、再没有就第一个事件）的 id；执行行 `glm-hourness/execute` 的事件例外，以 `hourness.` 开头；别的行的名字空间取到 `hourness`（第一个条目、动作或事件的 id 以 `hourness.` 开头）整份被拒，名字空间是别的名字时它夹带的 `hourness.` 事件按条丢掉。名字空间属于第一个交它的来源，撤回之后空出来。
- 一份至多 32 项条目、16 个事件、16 个动作，多出的各记一条丢弃；id 写成 `<名字空间>.<名>`（名字空间 1 到 16 个字符、名 1 到 48 个字符，小写字母数字和连字符），一份里不重复；事件至多 16 个字段（名字 `^[a-z][A-Za-z0-9]{0,31}$`，不叫 `at`，不叫 `session`——拦路的 `gate.` 事件除外——，不重复；标题 1 到 20 个字；比法与类型相配：`in` 配 `string`，`is` 配 `boolean`，`atLeast` 配 `number`，`paths` 配 `strings`），参数同理；`gateOnErrorDefault` 只给拦路的事件。事件不合，引用它的条目随之丢掉。一份列了动作却没有 `run`，动作全部丢掉，引用它们的条目随之丢掉。`script` 与 `check` 的条目、`scope: 'machine'` 的条目被丢掉。丢掉的理由写成「字段路径：一句话」，几条用「；」连起来。
- 条目引用了此刻没有谁声明的事件（执行行没启用，通道的计价服务不在）：照样收下，列为灰显的 `waiting`，带着等的事件 id 和一句理由（「<事件>现在没有谁报（项目编排的这一部分没启用），这一项现在不跑」），不执行。事件声明一到，登记表把所有已交的各份对着新的事件表再查一遍：合得上就转为生效；合不上（例如筛选的字段那一方没声明成可筛）就丢掉，告诉行健康。撤回声明它的那一份，条目回到灰显。事件名里只有 `hourness.`、`env.`、`graph.`（编排层）和 `channel.`（GLM 通道）认得是哪个包的，别的名字空间只写「没有谁报」。`loops.` 和 `gate.` 的事件不等：前者是循环行自己的，后者循环板的条目不收。
- 人话：条目的 `title` 与 `why` 经 `plainWordsIn`（`src/graph/plain-question.ts`），有没学过的词照样收下，行健康写一次「<id> 的说法里有 <词>」。
- 告诉行健康的每一条（来源、条目、理由）只说一次：「<包> 的 <行> 交来的 <id> 读不懂：<理由>」「<包> 的 <行> 交来的整份被拒：<理由>」。
- `validateContribution(source, contribution, context)` 是纯函数部分（一份交来的东西，加已有的事件表、别的来源占着的名字空间、此刻的时间），`createRegistry({now?, report?})` 是内存里的登记表：`contribute`、`entries()`（每项带 `entry`、`state`、`waitingOn`、`reason`）、`events()`（循环行自己的三个事件加各份交来的）。登记表不落盘；落盘的是人的条目，随存储。

### 18.5 循环行自己的事件和默认条目（`src/loops/events.ts`、`defaults.ts`）

- 三个事件（设计 §4.1）：`loops.host-restarted`（字段 `previousStart`、`downMinutes`、`crashed`、`rebooted`、`appChanged`）、`loops.waiting-on-human`（字段 `items`、`count`；必填参数 `olderThanHours` 1 到 168）、`loops.file-changed`（字段 `path`、`size`、`mtime`；必填参数 `path`）。它们是事件表里一直在的部分，不用谁交；人都能选。发现它们的代码随运行时。去重键的写法已经定下，各一个纯函数：`host-restarted:<项目键>:<这个进程开始跑这个项目的时刻>`；`file-changed:<路径>:<大小>-<修改时间的毫秒>`（文件被删时大小写 `gone`，时间取最后一次看到的版本）；`waiting-on-human:<olderThanHours>:<这一次查的整点，宿主时区 YYYY-MM-DDTHH>`。
- 四项默认条目（设计 §5.2，`LOOP_DEFAULTS`）：`loops.deps-after-merge`（听 `hourness.trunk-advanced`、`hourness.outside-advance`，`files` 里有依赖文件才算，告诉主 Agent 查依赖，去抖 30 秒、每小时至多 6 次；依赖文件的名单 `DEPENDENCY_FILES` 是 17 个不带斜杠的名字）、`loops.remind-waiting`（听 `loops.waiting-on-human` 且 `olderThanHours` 为 24，告诉主 Agent 再说一次，安静时段 22:00 到 08:00，去抖 60 秒、每小时 1 次）、`loops.peak-start`（听 `channel.peak-changed` 且 `edge` 为 `start`，`self`，由规则行做）、`loops.peak-end`（`edge` 为 `end`，harness 动作 `loops.peak-end`，给主 Agent 的话由动作的结果给）。后两项的 `basis` 是「GLM 通道的高峰时刻与规则板的高峰模式」。给模型的文字是英文，不含每条消息第一行的 `Loop board: <id> (default of <插件>).`，那一行投递时才写。
- 不在 `src/loops/` 里的：别的行的条目。执行行、操作行、环境行、图行、GLM 通道包的条目表各在自己那一行里，循环板的代码不导入它们（静态检查：`src/loops/` 没有 `channel.ts`，也不导入 `execute`、`operate`、`env`、`glm-llm` 的目录和 `channel-loop`）。
- 通道事件（`src/loops/channel.ts`，设计 §4.3）：`channel.peak-changed`（字段 `edge`、`boundary`、`until`，人不能选）由循环行自己照计价服务推出，键是 `peak-changed:<edge>:<这一次边界的时刻>`。它不经 `contribute` 进事件表——`channel` 这个名字空间谁也不能占用（§18.4）——而是登记表的 `channel` 选项给的：计价服务在时在表里，不在时不在（`createRegistry({channel})`）。账号一级的另两个通道事件（`channel.quota-low`、`channel.login-rejected`）要 M6 的额度读取，还没有。
- 第 13、14 项（`loops.peak-start`、`loops.peak-end`）跟着计价服务：服务在时交出，不在时这两项连列都不列（设计 §5.2）；每一拍比一次，服务来了或走了就把自己那一份重交一次。另两项里 `loops.deps-after-merge` 听执行行的 `hourness.*`，此刻没有谁声明，列为灰显；`loops.remind-waiting` 生效。
- `loops.peak-end` 动作由循环行自己执行（设计 §6.9 第 4 条），那一步还没有做；在那之前它返回 `skipped`，理由「高峰结束时的接续这一版还没有做」，不做事也不报错。

### 18.6 行（`src/loops/index.ts`）

- 行 `glm-hourness/loops`（cordis 名 `dsh-glm-hourness/loops`，补丁里在 `design` 之后、`ui` 之前，`inject: ['commands']`）。`apply(ctx, config)` 做这些：提供行健康、把循环行自己的条目和那一个 harness 动作交给自己的登记表、注册 `/loops`（§18.7）、在 `tools/pre-execute` 上最外层装 `loops:files-only`（§18.8）、注册会话投影 `hournessLoops`，在 `agent/created` 时对着那个会话的项目对账一次（§18.7），并在 `ctx.inject(['sessionController'], …)` 里提供服务 `glmHournessLoops`、起 60 秒一拍、运行这个进程遇到的每个项目（§18.9）。
- 哪些事只在有会话控制器的进程做（设计 §3.1、§6.1、§11.1）：提供服务、运行条目、起拍。没有它的进程（headless、探针、标定）照样注册工具面以外的全部——命令、文件门、投影、步 notice——行健康写一行「这个进程不跑循环板（没有会话控制器）」，状态不降级；读不到服务的行按自己的退路执行事件条目。所以 guard 的 `glm:guard` 节那一句跟着行健康走（`activationState(ctx, 'loops')` 不是 `absent`、`inactive` 就写），不跟着服务走：门在每个进程里都装着，告知也要在每个进程里。
- 不抛错：宿主没有 `provide`，行健康是 `inactive` 并写原因、告警一次；服务提供不上（第二个实例）只写一条降级，不动第一个实例的服务。缺一部分只降级、写明缺哪一样：没有 `commands` 服务就没有 `/loops`；没有 `on` 就装不上文件门（行健康写「没有什么拦着别人写循环板的文件」）；`sessionProjections` 还没来、注册失败，投影那一行写明；没有 `inject` 就既没有投影也没有服务与拍。登记表告诉的每一条（别的行交来的东西有几项不合、被整份拒绝、有没学过的词）、每个项目读文件时出的问题和运行时报的每一件事都进行健康：`degraded` 级进「问题」，`info` 级只写一行不降级。
- 行健康只在激活时报（`ACTIVATION_ONLY`）：循环板属于项目，不属于某个会话。配置：`home`（违规流水的项目目录，不设时按 `projectHomeFor` 取，§6.1）、`io`、`lock`、`delay`、`beat`（存储的文件操作、写锁环境、一次性定时器与 60 秒的拍，测试替换）。
- 注册：`scripts/packages.mjs` 的 `rows`，`packages/hourness/cordis.patch.yml`，`packages/hourness/package.json` 的 `exports`，`packages/hourness/locale/loops/{en,zh}.json`，`src/shared/health.ts` 的 `HOURNESS_ROWS`（与补丁同序）。

### 18.7 人的条目的存储、`/loops`、投影与 `view.json`（`src/loops/store.ts`、`journal.ts`、`commands.ts`、`boards.ts`、`view.ts`、`projection.ts`，`src/loops/model.ts` 的条目文件）〔已实现 2026-11-02，L2、L3；行默认启用〕

- 文件（设计 §9.1）。仓库里：`docs/loops/entries/<id>.json` 一项一个文件（id 是 `u-` 加 8 位小写十六进制），`docs/loops/scripts/<id>.<后缀>` 是那一项的脚本原文。项目的 `.llm/loops/` 里（不入 git）：变更记录 `journal.jsonl`（只追加，每条带写后的全文）、循环板最近一次写成了什么 `repo-written.json`、写锁 `write.lock`、写仓库文件之前的临时文件 `tmp/`、给页面的 `view.json`。`.llm/loops/` 第一次建时先经 `ensureIgnored`（`src/data/project-root.ts`）把 `.llm/` 追加进 `<git 目录>/info/exclude`，再以 `wx` 写一个内容为 `*` 的 `.gitignore`（已在就不动），所以运行时的东西不会在项目里显示成未跟踪文件，项目自己的忽略配置也不动。`.llm/` 只从项目根算，不取数据目录服务的 `projectHome`。
- 条目文件的字节（`entryFileText`）：两格缩进的 JSON，条目自己的字段按固定次序（`id`、`title`、`why`、`when`、`filter`、`action`、`limits`、`quiet`、`scope`、`basis`、`ownRules`、`source`），里层对象的键按码点排序，末尾一个换行。一项只有一种写法，所以文件的 SHA-256 就能说明它是不是循环板写的那一份，`git diff` 也读得懂。`validatePersonEntry` 在 `validateEntry`（§18.3）之外另查 `source`（`kind`、`at`、`via`、`relay`、`question?`、`proposal`）；文件对着「人同意的那一刻」（`source.at`）检查，所以 `once` 的条目不会因为读得晚而变成过去。
- 判定按变更记录，不按文件（设计 §9.3）。`readBoard` 只读不写，`settle` 在写锁里把读到的结果落实。七种情形：文件等于记录里最后一条同意的 `fileSha256` → 照它跑；记录比文件新而 `repo-written.json` 里这一项还不是最后一条（上次写在 git 操作当中，或宿主在记录与改名之间退出）→ 循环板欠着一次写，能写的时候补上；`repo-written.json` 说已经写成而文件是别的样子（手改、`git revert`、检出旧版）→ 「在循环板之外变了」，不跑，变更记录追加一条 `external`（同一个哈希只记一次），不把旧版当成欠着的写补回去；文件不在而循环板写过它（切了分支、`git stash -u`）→ 「不在这份检出里」，不跑也不写回；文件读不出（空、全零、截断、不是 JSON、不合校验）→ 不跑，`/loops restore` 按记录写回；文件的 id 在记录里从没出现过（新克隆、队友的条目随拉取带来）→ 只告诉主 Agent 的条目照文件认回（追加 `adopt`），会跑东西的条目只标 `unadopted`、不跑（这台电脑上没有人同意的记录；图上的提议式待决还没有，所以认回只走这一支，impl-plan Interpretations 1、2）；记录末行没写完 → 原样存进 `.journal.corrupt-<时刻>` 再截掉，中间有读不出的行 → 跳过、整份另存一份，页面列出行号，人打 `/loops ack` 之前行健康 `degraded`。
- 写入次序（设计 §9.2）：先追加变更记录并 `fsync`（从这里起这次改动已经生效），再写文件。每个文件先写进 `.llm/loops/tmp/` 并 `fsync`，再改名到 `docs/loops/` 里的目标（同一个卷，改名是原子的；临时文件不落在 `docs/` 里，崩溃留下的不会被误提交，超过 1 小时的在下一次对账时清掉）；写时先脚本后条目，删时先条目后脚本；都写成之后以临时文件加改名更新 `repo-written.json`。改名在 Windows 上遇到 `EPERM`、`EBUSY` 按 20、40、80、160、320 毫秒重试 5 次（共用 `src/rules/store.ts` 的 `renameWithRetry`），仍失败就留着临时文件、下一次读时补上。git 正在合并、变基、拣选、回退、二分或占着 `index.lock` 时（判定共用 `src/rules/repo.ts` 的 `gitOperationIn`）不往 `docs/loops/` 里写：记录已经追加、这一项已经生效，文件欠着，标记都不在了再写。要被覆盖或删掉的文件如果不是循环板预期的那一份，先另存一份 `.<文件名>.outside-<时刻>`（可能是人手改的）。写锁是 `src/data/lock.ts` 的 `acquireLock`（`keepStale`），取不到返回 `busy`。
- `/loops`（设计 §7.2，`commands.ts`）：`definitionId` 是 `dsh-glm-hourness/loops`，`input.hint` 写用法。`delete <名字或 id>`（先按 id 精确找，再按去首尾空白后完全相同的名字找人自己的条目；重名不删、列出 id；插件带来的 id 回「插件带来的条目只能看，删不掉」）、`restore <id>`（恢复 7 天内删掉的一项，或把读不出的一项按记录写回）、`ack`（确认变更记录里读不出的那几行）。回一行中文；文件这次没落地时句尾写明（git 占着：「文件等它做完再写」；改名失败：「下一次读时会补上」）。身份是人：斜杠命令模型发不出，`apply` 再查一次，不是 `human` 返回 `forbidden`。还没有的：不带参数列出全部条目（要运行时的上次与下次）、`accept`/`reject`（随提议那条路）。
- 对账的时机与 `view.json`（`boards.ts`、`view.ts`）：一个项目根一个存储。会话在某个项目里开起来（`agent/created`）与每次 `/loops` 之后，对账那个项目一次并重写 `view.json`。`view.json` 只在内容变了时写，一个项目至多每 2 秒一次（提前来的那一份等满 2 秒再写；比较时不算里面的时刻），以临时文件加改名换上。里面是版本号、时刻、项目键、全部条目（插件的带登记表的状态，人的带存储判出的状态）和「要你看一眼的」几句话。`view.ts` 只有类型和纯函数、不导入 Node 内置模块，面板能直接导入。会话投影 `hournessLoops`（`projection.ts`）只给页面指路：`{projectKey, viewFile}`，从会话头的工作目录算一次，会话里的事件都不改它；工作目录不在 git 项目里时两项都是 `null`（这个会话没有循环板）。读文件出的问题不进会话，进行健康。
- 不变量：一个项目至多 50 项人的条目、空集合不落盘（`withoutEmptyCollections` 的做法：没有值的字段不写进文件）；会跑东西的条目只有人同意过才跑，仓库里读入的没有批准记录就只标 `unadopted`；这一层防的是改过的条目照样跑（误改、合进来的改动、拉来的改动），不防有意的伪造——同时改条目文件又在变更记录里补一行的写入者要先绕过 `loops:files-only`（§18.8），它的命令文本留在会话日志里。

### 18.8 文件门 `loops:files-only`（`src/loops/guard.ts`）〔已实现 2026-11-02，L2、L3；行默认启用〕

- 规则（设计 §2.4 第 16a 行、§13）：条目文件、脚本与运行时文件只由循环板写。目标在仓库任何一份检出（主检出与它的工作树，`git worktree list` 的结果，共用 `src/data/project-root.ts` 的 `cachedWorktrees`，缓存 60 秒）的 `docs/loops/` 之下，或项目的 `.llm/loops/` 之下，一律拒绝：文件工具与 `file-tools-only` 判为写文件的 shell 命令都算（共用 `src/guard/directory-writes.ts` 的 `writesInto`），带 `parent` 的子调用（`run_code` 里的工具调用）照样判，读不拦。
- 装法同图行的 `graph-files-only`（`src/guard/graph-files.ts`）：guard 框架的 `GuardRule`，在 `tools/pre-execute` 上以 `{ prepend: true }` 最外层，所以写循环板文件的 shell 命令拿到的是这一条的四段式理由，不是 `file-tools-only` 的。这条与 `loops:schedule-tools`（§18.10）两道门都经 guard 框架唯一的 `installRuleGate`（`src/guard/gate.ts`）装上（`src/loops/guard.ts`）。从行启用的那天起就拦，没有只记录的影子模式（`d-code-rules-enforce`）。
- 拒绝时写一条项目违规流水（`projectJournal` 的 `violation`，规则是 `loops:files-only`，带工具名、agent 与会话 id、路由来源），记录由 `installRuleGate` 写（`src/guard/gate.ts`），不带 `mode` 字段；流水写不进也不改变判定、不挡调用。规则不读循环板的任何状态，所以文件读不出时它照样成立；循环板写自己的文件走自己的代码（`store.ts`），这条规则看不见——它只看工具调用。判不出来时（取不到项目、取不到工作树）调用照常放行，宿主日志写一行告警。
- 登记：`src/guard/catalog.ts` 的 `GUARD_RULES` 加 `{ id: 'files-only', row: 'loops' }`（另有 `title`、`blocks` 与 `liftVia`，没有 `mode` 列），经规则板的 `CATALOG` 映射成 `loops:files-only` 在规则页上只读显示；契约测试核对这个 id 就是循环行装上的规则对象的 id。服务 `glmHournessLoops` 的 `declaration` 让 guard 的 `glm:guard` 节在这一行启用时多写一句（同规则板 `glmHournessRules` 的做法），这句话不随条目变，所以不动提示词缓存。

### 18.9 运行时核心：运行锁与拍、交接、收件箱、去抖与限次、运行与记录（`src/loops/lock.ts`、`inbox.ts`、`run.ts`、`harness.ts`、`file-watch.ts`、`records.ts`、`channel.ts`，接线在 `index.ts`）〔已实现 2026-11-02，L2、L3；行默认启用〕

- 谁来跑（设计 §6.1，`lock.ts`）：一个项目一把运行锁 `<项目根>/.llm/loops/runner.lock`，以 `wx` 独占创建，内容 `{pid, boot, startedAt, at, token}`（`boot` 取到分钟）。持锁的进程每一拍以临时文件加改名刷新 `at`。别的进程看到 `at` 在 3 分钟以内、`boot` 与本机相差不超过 120 秒就不跑这个项目（页面写「另一个 DSH 进程在跑这块板」）；否则把旧锁改名为 `runner.lock.stale-<毫秒>` 留痕，再创建自己的。不按 pid 判活（Windows 会复用 pid）。行卸载与宿主退出时只删 `token` 是自己的那一把。
- 交接（设计 §6.1，评审 F33）：投递只能在主 Agent 的会话打开着的那个进程里做，所以锁跟着那个会话走。不持锁的进程看到持有者会话在自己这里，就以临时文件加改名写 `handover.json`（`{pid, boot, session, at, token}`）并每一拍刷新；持锁的进程每一拍读它，`at` 新鲜、`boot` 对得上、它说的会话不在本进程里、而且本进程手上没有正在跑的运行时，写下状态、删锁（页面写交给了谁），写交接文件的那个进程在它的下一拍拿到锁。手上有运行时不交，锁的状态是 `handing` 并写出在等哪一项。别的进程在别人的 `handover.json` 新鲜时不抢锁，所以两个进程不会来回争。锁换手时各写一条 `loop-handover`（`release`、`take`）；单纯第一次拿到一把空锁不算换手，不记。这一步还没有持有者记录的读法（`holder.ts` 随投递那一步），所以 `holderHere` 眼下恒为「不在本进程」，交接的机制有了、生产路径上不会触发。
- 收件箱（设计 §6.3，`inbox.ts`）：`emit` 把一行追加进 `<项目根>/.llm/loops/events.jsonl` 并 `fsync`，与谁在跑无关；写之前校验事件在当前的事件表里（`gate.` 的事件一律回 `unknown-event`「拦路的时刻归规则板」，`listedOnly` 的也不收）、载荷只含这个事件声明过的字段且类型对、去重键说的是「这一次发生」（至少三段、每段非空、第一段是事件名去掉名字空间，1 到 200 个字符）。取不到写锁或写不进时在内存里按 1、3、6 秒重试三次（共 10 秒），第四次仍失败才返回 `busy`/`io` 并报一次行健康 degraded；调用方不必再重试。这个进程正跑着这个项目、执行表已读全、却没有一项生效的条目听这个事件时，不写盘、不记键，返回 `unheard`（评审 F54）。文件到 8 MiB 时在锁里改名为 `events-<时刻>.jsonl`。
- 读与去重（设计 §6.3，评审 F22）：持锁的进程在 `emit` 当场、每一拍从记下的字节位置往后读，没写完的最后一行留到下一次（所以两个进程同时追加也不会读到半行）；读不懂的行跳过并计数。同一个去重键 7 天内只跑一次，再来的写一条 `loop-duplicate` 并返回 `duplicate: true`；同一个键 24 小时内第 4 次来时行健康 degraded「同一个去重键反复出现」（真正的重放一个键只来两三次）。键按名字空间分开记数，`hourness.` 至多 5000 个、`env.` 2000 个、其余各 1000 个，满了丢同一名字空间里最早的，丢掉的还不到 7 天时写一行 info。在收件箱里躺了超过 7 天的事件不跑，记一条结局 `expired`；事件此刻没有声明也是 `expired`。位置、键、待跑和每项最近一次的结局都在 `state.json` 里，所以重启之后停机期间交进来的事件照样按先后跑一次（设计 §6.8）。
- 去抖、限次、分组与自己触发自己（设计 §6.7，`inbox.ts`）：一项收到事件后等 `debounceSeconds`（缺省插件 5 秒、人 30 秒），这段时间里再来的合进同一次运行（`record.merged`）。一项每小时至多 `maxPerHour` 次（缺省插件 30、人 6），超了的那一次记 `suppressed`（原因 `rate`，插件的条目另报一次行健康 degraded），事件攒着（至多 100 个），下一个整点之后的第一次运行一起带上，不丢。动作为 `check`、或 `script` 带 `to: 'event-session'` 的条目按「条目 + 会话 + 检出根」分组算这几件事（缺省每组每小时 30 次），一项同时有待跑的组至多 32 个，第 33 个记 `suppressed`（原因 `groups`）。同一项正在跑时不重叠：新的触发并进下一次。一次运行自己的执行期间交来的事件（`emit` 从异步上下文取到运行号，`harness.ts` 的 `withinRun`）10 分钟内又触发同一项时不跑，记 `suppressed`（原因 `self-loop`）；经过主 Agent 一回合的链不算（打转由限次兜住）。只告诉主 Agent 的条目带安静时段时，落在时段里的那一次等到时段结束再跑，事件留在待跑里。
- 循环行自己推出的事件（设计 §4.1、§6.8，`run.ts`、`file-watch.ts`、`channel.ts`）：每一拍对着 `state.json` 记下的值比一次，所以停机期间发生的各补一次。`loops.host-restarted` 在开始跑一个项目时比 `host`（上次的 `{pid, boot, startedAt, cleanExit, appStamp}`），一个进程一次，键里带这一次的 `startedAt`；`crashed` 是上次没有写下正常退出，`rebooted` 是开机时刻不同，`appChanged` 是 DSH 程序文件的大小或修改时间变了；这个项目第一次被跑（没有上次）不算重启。`loops.file-changed` 的判定在 `file-watch.ts` 的 `watchPaths(paths, onChange)` 一处（规则板的检测器以后用同一个）：`fs.watch` 求快、每一拍比大小与修改时间兜底，变了之后 60 秒内不再变才算一次（所以连写十次是一次），这台机器没有这个路径的状态时第一次读到的不算变化，文件没了也算一次、键里写 `gone` 并带最后一次看到的修改时间（载荷的 `size` 是数字，所以删除只在键里说得出，设计的字段表没有一个「已删除」的字段）。`loops.waiting-on-human` 每小时读一次项目图（`openEngine(<项目根>/docs/graph).load()` 加 `listOpenItems`：等人批准的提议与人定的开着的待决，`since` 取提议那条历史或问出来的时刻），只列这次新越过门槛的，同一件 24 小时内只列一次，门槛取条目的 `olderThanHours`。`channel.peak-changed` 照计价服务的 `peak(now)` 比，变了就按 `nextPeakChange` 算出的边界时刻推一次（边界就是键），定时器也设在下一次边界上；没有计价服务时不推。
- 运行一项（设计 §6.5、§6.10，`run.ts`、`harness.ts`、`records.ts`）：每次运行写一对记录，`loop-fired`（触发并过了去抖与限次之后，带来源、触发、合进来的事件个数、运行号、`cause`、`late`）与 `loop-done`（带结局、原因、用时、投递方式，起过进程的带退出码与输出字节数），进 `<项目根>/.llm/loops/runs.jsonl`（8 MiB 轮换；指标流水合入时只改一个文件）。记录里从不写运行的输出原文。
  - `tell-main`：文字交给投递的接缝。投递本身是下一步（`deliver.ts`），在那之前接缝回「存着」，结局 `held`、原因 `holder-unreadable`（这台机器上还读不出主 Agent 是哪个会话），消息不丢、页面与行健康写得出。
  - `harness`：在带着运行号的异步上下文里调交来它的那一行的 `run(action, event)`，至多等 6 小时（设计 §3.1），超时记 `failed`（原因 `timeout`）。`done` 带 `tell` 就交给主 Agent（结局 `delivered`），`done` 不带话是 `ran`，`skipped` 原样记下不发消息，`failed` 记 `failed` 并报一次行健康 degraded——动作跑完了就是 `done`，不论它发现了什么（主干红了是检查的结果，不是行的故障）。动作 id 不在交来它的那一份列的动作里时 `failed`（原因 `action-missing`）。
  - `self`：循环板不执行，只列出；执行它的那一行经 `recordRun` 报一次运行，循环板写那一对记录（只认执行表里 `self` 条目的 id，别的丢掉）。
  - `script`〔执行器与人采纳条目的执行已实现 2026-11-04，L2〕：人采纳过的条目经两块板共用的执行器 `src/loops/script.ts`（设计 0.6 §6.6，编排方接缝裁定「the script runner in one shared module that both boards import」）跑，规则板以后从这里导入它自己那一路。跑之前先过规则板的库入口 `checkCall`（§6.9 第 1 条，`commandText` 写解释器与仓库里的脚本路径）：放行、只告知、只记录照跑；排队记 `deferred`，每一拍重问一次、至多每 5 分钟一次，放行了以原运行号跑，24 小时没放行记 `expired`；拦截记 `blocked` 与规则 id；规则板的库抛错照跑并记一笔 `rules-unavailable`。执行器核对脚本字节与同意时的哈希（`script-changed`）、以 `wx` 写私有副本 `.llm/loops/run/<run>.<后缀>` 执行、跑完删掉（崩了的副本下一拍清掉超 1 小时的）；不经 shell、程序经 `resolveProgram`（跳过项目根与各工作树里的同名程序）、环境只有名单上的变量与 `HOURNESS_*`、超时结束整棵进程树、输出每路至多 1 MiB、日志第一行写命令、哈希与解析出的程序路径（`.llm/loops/logs/<条目>/<时刻>-<运行号>.log`——设计写的 `<项目目录>/logs/` 按 §9.1「运行时的进 `.llm/`」落在这里）。结局：退出 0 为过；别的码与起不来算没过（`reported`/`ran`，原因带 `spawn` 等）；超时是没跑完，结局 `unfinished`（原因 `timeout <秒>s`），这次的事件退回待跑、下一次触发一起再跑；`refused` 原样记、不发消息。交给主 Agent（或 `to: 'event-session'` 的事件会话）按条目的 `report`：`on-failure` 没过之后第一次过也交一次，`on-change` 过与不过变了才交（第一次算变），文字是命令、退出码与用时一行加上输出末尾（至多 40 行 4000 字符）、过 `redactSecrets`（M5 的 `src/data/secret-shape.ts`）再接日志路径。没有人的采纳记录的条目仍是 `refused`（`unadopted`）：存储本不放它进执行表，run.ts 的核对是同一扇门的第二道闩。脚本在跑、或跑完 60 秒内发生的 `loops.file-changed` 对该条目记 `suppressed`（原因 `self-loop`，§6.7 的第二种）。这一版 `runScript` 的 purpose 只有 `work`（一个项目每块板同时一个、排队不算超时）；gate 一路的队列与拦路脚本超时后接跑随规则板采纳执行器时再加。静态检查钉住 `src/loops/` 里只有 `script.ts` 导入 `node:child_process`。
  - `check`：执行器的检查队（`runCommand` 的 `queue: 'check'`，一个项目同时至多 2 个、单独一队不等 work 脚本）已就位，但检查的命令要项目图上批过的环境工具节点，env 行还没合入（m4 impl-progress 记着 E3 在等 `src/loops/script.ts` 的 `runCommand` 与 `resolveProgram`），所以在它落地之前一律 `refused`（`check-missing`），不发消息。
- 什么时候开始跑一个项目（设计 §6.1）：这个进程里出现了这个项目的会话（`agent/created`），或人在它里面打了 `/loops`；之后每 60 秒一拍，10 分钟没有这两件事就放手、删锁（让给有主 Agent 会话的那个进程）。设计里的另两条入口（DSH 工作区登记表列项目、项目里有主 Agent 的持有者记录）随后面两步。一拍里的每一步都各自 `try`：读不出锁、读不出收件箱、跑出错都只报行健康，不抛进定时器。

### 18.10 绑定主 Agent 与投递：到点的 DSH 任务、`holderState`、唤醒表与 `loops:schedule-tools`（`src/loops/holder.ts`、`bind.ts`、`deliver.ts`、`remove.ts`、`reminder.ts`、`guard.ts`，接线在 `run.ts`、`index.ts`）〔已实现 2026-11-02，L2；L3 见 §18.11，行默认启用〕

- 主 Agent 是谁（设计 §6.4，`holder.ts`）：一个函数 `holderStateOf`，对账、每一次投递和每一拍都重新问，不缓存——`/wish here` 之后的下一次投递就投到新会话。记录的位置也收在一个函数 `holderRecordFor` 里（实施计划 Interpretations 第 5 条）：M3 眼下把它放在用户级目录，按项目的图目录定位（图行的服务给 `dirFor`，没有图行时取 `<项目根>/docs/graph`）；M3 把记录搬进项目的 `.llm/` 之后只改这一个函数。不改 `src/graph/main-agent-holder.ts`。
- 六种结果与各自的代价（设计 §6.4 的表）：`ok` 照常投；`none`（没有记录）、`archived`（会话在 `workspaceRegistry.archivedSessionIds` 里）、`not-found`（上一次 `resolveAgent` 回 `session/not-found`）确知没有能收消息的主 Agent，消息存着、绑在那个会话上的到点任务删掉；`elsewhere`（别的进程写着新鲜的 `handover.json`，或上一次 `resolveAgent` 回 `session/writer-held` 且不到 5 分钟）要那个进程去投，这边只存着、什么任务都不动；`unknown` 分两种原因，`archive-unreadable`（读不到归档集合）照常投但一条任务都不删（偏向晨报照常来，行健康 degraded 在报），`holder-unreadable`（记录读不出）不知道投给谁，存着。`elsewhere` 连着超过 5 分钟时行健康 degraded，手上有运行时写出在等哪一项。状态每变一次写一条 `loop-holder`，所以「这段时间消息没投，是因为会话归档了」事后查得到。
- 记录之外还核对模式（M3 对 `/wish` 修法的评审 R2）：`mainAgentOf` 会返回一条指向「模式已关」的会话的记录（`/wish` 被取消、写下记录之后崩溃、`/wish` 失败过一次），往那里投提醒就落在一个普通 agent 身上。所以持有者会话在本进程里打开着时，再读一次投影 `hournessMainAgent`：模式为假且没有未结的 `/wish` 时读作 `none`（原因 `mode-off`，`none` 还要连着两次对账才删任务，所以一次误读不会删掉晨报）；会话不在本进程里时读不出模式，记录说什么就是什么。M3 在 `mainAgentOf` 旁边加上同时说这两件事的读法之后，只换 `holder.ts` 这一处。
- 到点的任务（设计 §6.2，`bind.ts`）：只告诉主 Agent 的、时间触发的条目各对应一条 `dsh-schedule` 任务（事件与命令触发的不是）。标题 `循环板 · <标题>`（至多 120 字符），提示文字第一行固定 `Loop board: <id> (default of <插件> | added by the human). Change it on the loop board, not here.`，第二行起是这一项给主 Agent 的话；选择器按设计 §2.2 映射到宿主的 `at` / `every_seconds` / `daily` / `weekly` / `cron`（`HH:MM` 补成 `HH:MM:00`，时区取条目的或本机的）。`state.json` 的 `bindings` 记 `{entry, scheduleId, sessionId, specDigest, fingerprint, done?, deliveredMessageId?, dueSince?}`：`specDigest` 是标题、文字与时间的摘要，`fingerprint` 取自 DSH 返回的那条记录（`{kind, title, prompt}` 加按种类的时间字段，重复任务的 `scheduledAt` 不进指纹）。
- 一次对账做的事，按顺序：先问 `holderState`（第 0 条）；把 DSH 里认得出是循环板写的、`bindings` 里没有的那种认回来（第 4 条的前一半，评审 F13：先认回再建，否则丢了 `state.json` 就会多建一条、把原来那条连发送记录一起删掉）；该有的没有就建（第 1 条）；绑在别的会话上的先在新会话建、再删旧的（第 2 条，原因 `moved`）；内容对不上就按条目改回（第 3 条：`expected` 取 `schedule.list` 的那条记录而不是 catalog 的一行——catalog 多三个键，DSH 的整键解码一律回 `invalid_rule`，评审 F7；改不回来时 `ok` 状态下删掉重建，`unknown` 时留着下一拍再试；只有「外面改的」记一条 `loop-drift` 并在页面上一天写一句）；剩下的孤儿按原因删（第 4 条的后一半）。对账在开始跑一个项目时、每一拍、收到 `schedule/changed` 时、持有者会话被归档（`workspace/session-stop`）时各做一次。
- 删任务的规矩（设计 §6.2、§11.3，`remove.ts`）：只有一个函数 `removeTask` 调 `schedule.delete`（删一条连它的发送记录一起删，不可逆）。两件事都成立才删：**能证明是自己建的**（`scheduleId` 在 `bindings` 里，或标题与提示文字第一行都是循环板的写法——agent 建不出这样的提醒，`loops:schedule-tools` 不让；主 Agent 自己设的提醒永远不碰），**能说出为什么没用**（原因只有八种：`moved`、`entry-gone`、`duplicate`、`no-holder`、`holder-archived`、`holder-not-found`、`repair`、`not-delivered`；持有者状态为 `elsewhere`、`unknown` 时绑在持有者会话上的不在其中任何一种里）。删之前先把这条任务在 `schedule.catalog()` 里的整条追加进 `<项目根>/.llm/loops/removed-tasks.jsonl` 并 `fsync`，写不进就不删、行健康 degraded；删完写一条 `loop-task-delete`（只有 id、原因与成没成）。文件按行里的时刻保留 30 天，每天第一次对账裁一次。
- `entry-gone` 什么时候算确知（评审 F41）：人删了这一项（变更记录里这一项是 `deleted`）当拍就删；否则要这个进程开始跑这个项目已满 5 分钟、且连着两次相隔至少 60 秒的对账都看不到它才删——条目暂时不在多半是交它的那一行还没交（循环行先起来、M7 的运维行后到）。设计里还有一条「交它的来源在这个进程里新交来的一份里没有它」，眼下没做：登记表没有把每个来源的交付历史交出来（见 FEAT-012 的 findings）。
- 到点之后（设计 §6.2 末段）：DSH 投出去就更新这条任务的 `lastDelivery` 并发 `schedule/changed`；对账看到 `messageId` 变了就记这一次运行（`loop-fired` 加 `loop-done`，结局 `delivered`、投递方式 `dsh`）。`lastDelivery` 没变、而离「到点时刻与本进程开始跑这个项目两者中较晚的那个」已过 5 分钟时（评审 F25），记一条 `loop-drift`（`not-delivered`）、由循环板自己投这一次，`ok` 状态下把这条任务删掉重建（宿主因此从现在重新算下一次），别的状态下任务原样留着。
- 投递（设计 §6.4，`deliver.ts`）：消息是一条 user 角色的合成 notice（来源 `glm-hourness-loop`，正文裹 `<system-reminder>`），所以模型读它是 harness 的提醒，不是人的话（没写来源的 `followup`、`steer` 会被当成人的授权，tool-goal:44–52）。同一个目标 2 秒内要投的几条合成一条，每段写出自己的标题与运行号。先问 `holderState`：不能投就按上面的表存着（每个项目至多 50 条，满了丢最早的，存了 24 小时作废，回到能投的状态之后按先后投）。能投时取活 agent：`agents.get(会话 id)`，没有（会话是冷的）且这条要叫醒它时调 `sessionController.resolveAgent`（宿主自己的定时投递用的同一个调用）；不叫醒的条目不去恢复冷会话，留着等它下一次 `agent/created`。`resolveAgent` 的两种答复不算失败：`session/not-found` 让 `holderState` 从此为 `not-found`（要人指定新的主 Agent），`session/writer-held` 记下这一刻、5 分钟内读作 `elsewhere`（等运行锁交过去），两者都只是存着；别的错误码按失败重试。唤醒方式与规则板的同一张表：要叫醒且在跑用 `steer`，空闲且有 active 的 goal 用 `inject`（`followup` 会被 goal 驱动器当作竞争输入作废这一轮的预约），其余空闲用 `followup`，不叫醒的一律 `inject`。整个投递放在 `agents.withoutInitiator` 里，投完要 `sessions.flush` 说收下了才算投出；`flush` 说没有或任何一步抛错时按 1、5、15 分钟重试三次，每次重试之前重问 `holderState`，三次都不成记 `failed` 并报行健康 degraded。结果要交给事件来的那个会话（`to: 'event-session'`）时：那个会话在本进程里且正在跑就 `inject` 给它（不叫醒一个做完了的子 agent），否则交给主 Agent 并在文字后加一句 `For session <id>, which is not running now.`。
- 主 Agent 那一步的一行与两份走步记录（设计 §6.1、§6.4，`reminder.ts`）：到点的消息由 DSH 投，循环行只在主 Agent 领到它的那一步、`next()` 之后追加一行。那一步领到的消息里有来源 `schedule` 且 `schedule_id_json`（或批次的 `reminders_json`）指向 `bindings` 里的任务时，先做一次对账（于是这一次已经成了一次运行），再写 `Loop run <run> for <entry>.`；运行号还没有时写 `Loop board reminder for <entry>.`。同一个监听器写两份记录：`<项目根>/.llm/loops/main-step.json`（`{session, at}`，第 14 项用它判「这段高峰里主 Agent 走过步」）与 `<userHome>/loops/machine/last-step.json`（`{projectKey, project, session, at}`，账号一级的条目用它找最近有活动的项目），都以临时文件加改名写，至多每 60 秒一次，但这一步跨进或跨出高峰时当场写，所以每段高峰里的第一步一定留下。
- `loops:schedule-tools`（设计 §6.2 末段、§2.4 第 16 行，`guard.ts`）：循环行在 `tools/pre-execute` 上以 `prepend` 装的第二道门，从行启用那天起就拦，没有影子模式。拒三种调用：提示文字去掉首尾空白后以 `Loop board: ` 开头的 `schedule_create`（否则主 Agent 建的提醒会被对账当成孤儿认下，评审 F13）；`schedule_update` 与 `schedule_delete` 的 `id` 指向循环板的任务（在 `bindings` 里，或 `schedule.catalog()` 里这条的提示文字是循环板的写法；catalog 读不出时放行，由对账第 3 条事后改回）。`schedule_list`、别的提醒的增删改、以及与提醒无关的调用都照常。拒绝文字是四段式，纠偏那一段逐字是设计给的那句；拒绝写进项目违规流水，规则 `loops:schedule-tools`，记录不带 `mode` 字段。规则列在 `src/guard/catalog.ts` 里。
- 接线（`run.ts`、`index.ts`）：运行时每一拍在读完文件与高峰之后对一次账、投一次存着的消息；`holderHere`（持有者会话在本进程里打开着）接上运行锁，所以锁真的跟着主 Agent 的会话走了（§18.9 里它恒为「不在本进程」）；`schedule/changed` 与 `workspace/session-stop` 各挂一个只读的监听器，收不到时每 60 秒一拍的对账照样做（设计 §10.2 V2、V15）；每个会话装上那一行与走步记录（哪一步是主 Agent 由记录每次重判，`/wish here` 之后跟着变）。宿主没有定时服务时到点的条目不建、不删、不报错（`scheduleOf` 返回 undefined，对账直接返回），事件条目照常。

### 18.12 高峰的开始与结束（`src/loops/peak.ts`，接线在 `run.ts`、`index.ts`）〔已实现 2026-11-02，L2、L3；行默认启用〕

- 两个条目、两个来源（设计 §5.2、§6.9 第 5 条）：`loops.peak-start` 是 `self` 条目，活是规则板干的（定档位与上限），循环板只做两件事——事件来了把它记进收件箱（`self` 条目不从收件箱跑，§18.9）与在边缘那一刻记一条自己的运行（`loop-fired` 加 `loop-done`，结局 `delegated`，`reason` 是规则板服务 `stateForProject` 此刻读出的档位；读不出档位就没有 `reason`），页面照列。`loops.peak-end` 是 `harness` 条目，动作 `loops.peak-end` 由 `src/loops/peak.ts` 自己执行：设计的 §6.9 第 4 条那张十行表，一次判断从第一行走到底，行内的任何读法失败都按该行的偏向落下去，整张表不抛错。
- 表怎么读（每行一次重问，不缓存）：第 1 行，持有者状态是 `none`、`archived`、`not-found` 或读不出记录时跳过「没有能叫醒的主 Agent」，页面早已说了为什么（§18.10）；第 2 行，会话在别的 DSH 进程里时这次判断存着不走（下面第 4 条）；第 3 行，登记表里有谁把 `execute.resume-drive` 列进自己的动作就调它（M7 还不存在时没有谁列它，整行跳过，叫醒的路照走）：在本进程里活着的会话任何档位都调（评审 F48），冷的只在这次高峰里走过步（第 14 项的走步记录）且档位不是读得出的无影响时才经 `resolveAgent` 恢复了再调，60 秒不回答按 `failed` 收场；动作说 `skipped` 而会话刚恢复、goal 又是活跃的，记 `done`、原因「打开会话时 M7 接上了推进」（评审 F40）；第 4 行，规则板的服务读不出档位时跳过「读不到高峰模式」；第 5 行是落穿，少做与不做到达同样的行（`d-main-agent-peak-exempt`）；第 6 行，无影响档跳过「无影响档没有挪开的活」；第 7 行，主 Agent 正在跑时跳过「主 Agent 正在干活，它下一步的高峰一行已经变了」；第 8 行，走步记录里的会话与时刻比高峰的开始晚才算干过活——高峰的开始按分钟倒着走计价服务的 `peak(t)` 找（至多 24 小时，找不到或时钟读不出就开始不明，按干过活算，偏向多叫一次）；第 9 行，goal 暂停说「自动推进暂停着」，挡住时按原因说（`hourness-waiting-human`「主 Agent 在等你回话」、`hourness-idle-rounds`「主 Agent 没事可做，已经在问你」、其余「自动推进被挡住了（…）」），冷的会话先恢复再读 goal；第 10 行，`done`，告诉主 Agent 挪开的活可以开始。tell 的句子只有这四句（接上、在跑、没接上、开始），`{end}` 是边界时刻在本机时区的 `HH:MM`。
- 等另一进程的判断怎么再走（设计 §6.9 第 4 条第 2 行）：动作的 `skipped` 带着 `held`（循环行自己的延伸，别的行的结果没有这个字段）时，运行记 `held`，收件箱的存着列表里留一条重判标记（`rerun: 'loops.peak-end'`，带整份事件），投递的 flush 不碰它。之后每一拍（拿得到运行锁的进程才做）把每条标记按表从头再判一次，还等着就继续等；判出来 `done` 就投那份 tell、记 `delivered`（运行号是原来那一个），`failed` 照投文字、记 `failed`，`skipped` 把标记收走记结局；标记躺了 24 小时还没判成就记 `expired` 收场。
- 页面与项目从哪来（设计 §6.9 第 3 条、§6.1 V17）：`view.json` 的 `peak` 一节 `{now, until?, level, origin?, cap?}`，档位与上限只读规则板服务的 `stateForProject`，读不出时一行「档位在规则板上看」，没有计价服务时整节不写（§5.2）。每个项目的运行时在档位变化的那一刻重写页面，所以高峰一过页面不再写昨天的档位。宿主的工作区登记表列出的每个工作区，只要它的项目有主 Agent 记录，每一拍都开始在这里跑（会话出现之前就接得住事件）；登记表还没起或读不出只是一句 info，不是故障，项目等它的会话出现才开始跑。运行时第一次拿锁之前先把自己的 `.llm/loops/` 建好——从登记表认下的项目什么都不曾写过 here。

### 18.11 验证

L2：`tests/loops-trigger.spec.ts`（`nextOccurrence` 在 `Asia/Shanghai` 与有夏令时的 `America/New_York` 上的每天、每周、跳过的钟点、重复的钟点；`validateWhen` 各类触发与筛选；`matchesFilter` 的各种比法和路径写法；慢正则被拒；`effectiveTimeoutSeconds` 的每个分支和坏数字；`validateScriptAction`；模块不导入 Node 内置模块）。

L2（条目、登记表和行的骨架）：`tests/loops-model.spec.ts`（`validateEntry` 两种来源：id 与标题的边界，`why` 插件必填人可缺，不认识的字段与循环板自己写的字段，各种动作按来源收或拒，占位的各种情形，脚本引用与超时，检查的 `argv`，`to: event-session` 只配事件触发，`when` 的映射（告诉主 Agent 的 `every` 至少 600、脚本与 harness 至少 300），没有声明的事件等着，坏输入不抛错；模块不导入 Node 内置模块）；`tests/loops-registry.spec.ts`（测试里写的、形状取设计 §5.1 的 M7 条目表整份交给真实的 `contribute` 全部收下；每种不合的条目、事件、动作丢掉并带字段路径；来源与名字空间的整份拒绝；个数上限；灰显、转为生效、合不上时丢掉并告诉行健康、撤回后回到灰显；替换与撤回；`rev`；循环行自己的三个事件、参数和去重键；四项默认条目；行的激活、降级与卸载；补丁、清单、目录表和 locale；`src/loops/` 没有别的行的表和 `channel.ts`）；`tests/health.spec.ts`、`tests/contracts.spec.ts` 加了行 `loops` 与服务读取函数的用例。

L3（§18.1 到 §18.6）：这一片不加场景。这一行被组装进探针的配置（当时补丁里还是 `disabled: true`，覆盖层不启用它），`client-modules` 的检查在设置页清单里认出它的 locale 标题和包的子路径（全部组合 16 行，只装编排层包 11 行）；原有场景不受影响。行随启用提交（2026-11-04）起默认启用，探针的场景 `loops`、`loops-peak`、`loops-peak-restart` 用覆盖层把它钉在开上。

L2（存储，§18.7）：`tests/loops-store.spec.ts`，用真实的临时 git 仓库（同 `tests/rules-helpers.ts` 的做法）：条目文件对得上就跑；清零、截断、不是 JSON、不合校验的条目文件与 `/loops restore` 写回；变更记录末行截断（存进 `.journal.corrupt-<时刻>` 再截掉）；中间坏一行（跳过、整份另存、页面列行号、`/loops ack` 之后不再提示）；锁残留（`keepStale`）与两个写者只有一个写成；改名失败（注入的 `rename` 返回 `EPERM`，临时文件留下、下一次读补上）；变更记录写成而仓库文件没写成之后的补写；git 正在合并、变基、拣选、回退、二分或占着 `index.lock` 时不写 `docs/loops/`、标记消失后补上；条目文件在循环板之外被改（手改、`git revert`、检出旧版）→ 不跑、追加一条 `external`、同一个哈希只记一次；切分支或 `git stash -u` 之后文件不在 → 「不在这份检出里」、不写回、切回来照常跑；新克隆没有 `.llm/loops/` → 只告诉主 Agent 的条目认回，会跑东西的条目只标 `unadopted`；`git status` 在循环板写过之后只列出 `docs/loops/`（验收第 32 条）、`.llm/` 进了 `info/exclude` 且 `.llm/loops/.gitignore` 是 `*`；空集合不落盘；`/loops delete|restore|ack` 的每条回话与重名、插件 id、超过 7 天、没有存档几种拒绝；两个进程同时追加（锁与记录的原语）。`tests/loops-row.spec.ts` 另钉行把存储、命令、投影和门接起来的那几件事（注册与卸载、宿主缺一部分时只降级、`agent/created` 时对账一次、`view.json` 的节流与内容）。

L2（文件门，§18.8）：`tests/loops-guard.spec.ts`，先在没有这一行的代码上失败：写 `docs/loops/` 与 `.llm/loops/` 的文件工具与 shell 命令被拒（直接调用与带 `parent` 的子调用，各工作树的同一相对路径，`git worktree list` 的结果缓存 60 秒），读不拦，拒绝文字是 `renderCorrection` 的四段式，违规流水里规则是 `loops:files-only`，记录不带 `mode` 字段；行启用起就拦、卸载后不留；会话不在 git 项目里时没有要守的板；`src/loops/` 里没有只记录的模式。`tests/contracts.spec.ts` 加一条：`GUARD_RULES` 里 `loops:files-only` 的 id 就是循环行装上的规则对象的 id。

L2（运行时核心，§18.9）：`tests/loops-inbox.spec.ts`（键与载荷的校验；不认识的事件、拦路的事件、没人听的事件各自的回答；写不进时的三次重试与 1、3、6 秒；同一个键第二次来只写 `loop-duplicate`、第 4 次来降级；去抖把两个事件合成一次运行；每小时限次超出时记 `suppressed`、事件攒到下一个整点一起跑；一次运行自己引起的事件 10 分钟内不再触发同一项；两个子进程各追加 200 行，400 行全在、每行都读得完整，持锁的一方把每一件各跑一次、第二次读从上次的位置接着；停机期间留下的事件起来后跑一次并标 `late`，躺了 8 天的记 `expired`；安静时段的算法）；`tests/loops-run.spec.ts`（第一个进程拿到锁、第二个不跑、三分钟没人刷新的锁被接管并留痕；主 Agent 的会话在另一个进程里时的交接与两条 `loop-handover`；手上有运行时锁不交；`loops.host-restarted` 一个进程一次、键里带启动时刻、崩溃与否；`channel.peak-changed` 有无计价服务两种、键是边界时刻；`loops.waiting-on-human` 的门槛、每小时一次、同一件一天一次；harness 动作的 `done`/`skipped`/`failed` 与只有 `failed` 降级、运行号进得了异步上下文、动作不在表里、动作不回答时按 6 小时的限收场；脚本与检查的条目 `refused`、原因 `unadopted`/`check-missing`、不发消息、`state.json` 的 `last` 写明；投递接缝眼下 `held` 且记录里没有消息原文；`self` 条目不从收件箱跑、`recordRun` 只认它、别的 id 丢掉；静态检查 `src/loops/` 不碰子进程）；`tests/loops-watch.spec.ts`（第一次读到的不算变化；连写三次是一次、取它停下来的那个状态；文件没了也算一次、键里写 `gone`、再写回来是另一次；平台不给 `fs.watch` 时每一拍照样发现；跟着条目改要看的路径；真实文件上的一次改与一次删）。`tests/loops-row.spec.ts` 另加两条：没有 `inject` 时不提供服务但门照装；会话控制器来了才提供服务与起拍、走了就一起收回。
L2（绑定与投递，§18.10）：`tests/loops-bind.spec.ts`（人的每周条目建成一条提醒、写法与选择器逐字比、再对一次账什么都不动；五种时间触发各自的选择器，事件与命令触发不建；主 Agent 换会话时先建后删、原因 `moved`、`removed-tasks.jsonl` 里有整条；外面改过的改回来（`expected` 取自 `list`）、一条 `loop-drift`、一天一句；丢了 `state.json` 之后认回而不是多建一条，同一项多出来的那条记 `duplicate`；条目不在表里时的 5 分钟与两次对账，人删了的当拍删；没有主 Agent 要连着两次才删，归档与找不到各自的原因，`elsewhere` 与 `unknown`（`holder-unreadable`）时连 catalog 都不读、`unknown`（`archive-unreadable`）时照常建却一条不删；`removed-tasks.jsonl` 写不进时不删、行健康 degraded；DSH 投出去的那一次记成运行，五分钟没投出去时补投并换一条新的；一次性条目跑过之后不再建；`removeTask` 对证明不了是自己的任务一律 `kept`、八种原因各删一次各写一行、`elsewhere`/`unknown` 下绑在持有者会话上的一律 `kept`），用 `tests/fake-rc3.ts` 新加的假定时服务（标题与选择器的拒绝、整键解码、`schedule_conflict`、规范化后等价的 `updated: false`、硬删除、catalog 的排序与 `lastDelivery`、每次写入后的 `schedule/changed`，都按 rc.3 的行为）。`tests/loops-deliver.spec.ts`（`holderState` 的六种结果与各自允许的事，真实的临时用户目录里 M3 写法的记录，模式为假读作 `none`、未结的 `/wish` 读作「还是」、读不出模式时记录说什么是什么；归档集合来自假的工作区登记表，服务没启动时读作 `archive-unreadable`；唤醒表四种走法与 `goals.get` 抛错时按没有 goal；冷会话只为要叫醒的消息恢复，`session/not-found` 与 `session/writer-held` 存着并改变后面的 `holderState`，别的错误码算失败；存着的消息按先后投、满 50 丢最早、过 24 小时作废；2 秒合成一条；`flush` 说没收下时按 1 分钟重试并投出；结果给事件会话时在跑就 `inject`、不在跑就转给主 Agent 并加那一句）。`tests/loops-guard.spec.ts` 加 `loops:schedule-tools` 的用例（三种调用各一例、`schedule_list` 与别人的提醒放行、catalog 读不出时放行、四段式文字逐字比、违规流水的规则与 `mode`，以及真实宿主上 `schedule_create` 被拒而另一条提醒照常建）。`tests/contracts.spec.ts` 的 guard 目录用例加这条规则。 L2（高峰的开始与结束，§18.12）：`tests/loops-peak.spec.ts`，四十例，十行表一行至少一例、两档都到的行两档各一例：第 1 行的三种「没有人」（没有记录、归档、上一次 resolveAgent 说不在这）；第 2 行存着重判标记、跨进程接管的那一方再判且动作至多跑一次、24 小时没有判成记 `expired`；第 3 行 done/skipped/failed/抛错/60 秒不回答各一例、热会话任何档位都调（评审 F48）、恢复后动作说 skipped 而 goal 活跃记 done（评审 F40）、冷会话只在高峰里走过步才恢复、无影响档不恢复冷会话；M7 不存在（没有谁列那个动作）时整行跳过、叫醒照走；第 4 行读不到高峰模式；第 5 行少做与不做同一路径同一句话（`d-main-agent-peak-exempt`）；第 6 行无影响档、且列了动作时热会话照样调；第 7 行正在跑的不叫醒、列了动作时照样调；第 8 行高峰的第一分钟算走过、之前一分钟不算、别的会话不算、读不出按走过算（偏向叫醒）；第 9 行 paused、等回话、没事可做、别的挡住原因，冷的先恢复再读；`loops.peak-start` 记 `delegated` 带档位、无档位时不带、不是变化不记、高峰结束不再记；`view.json` 的 peak 一节三种（有档位、只有「档位在规则板上看」、没有计价服务整节不写）；登记表认下的项目在会话出现之前就跑起来、读不出登记表只是一句 info 而项目照跑。

L3（§18.12，`npm run probe` 198/198，2026-11-02）：新场景 `loops-peak` 与 `loops-peak-restart`，都在临时 git 仓库里同时启用循环行与规则行（规则文件里是人的少做），跑在 GLM 路由与探针时钟上（时钟行新加一支可注册的移钟工具，场景用它把时钟拨过高峰的结束），并新加一支只提供 `sessionController` 的覆盖层行（headless 宿主本来没有它，循环行的运行时那一半因此不激活）。`loops-peak`：脚本让会话用 /wish 成为这个项目的主 Agent（探针的设计行走原路），读一次文件（循环行的走步记录写下这一步），等过循环行的第一拍（读进「在高峰里」），用移钟工具把时钟拨到高峰结束后五分钟，派一个睡 30 秒的后台子 agent，然后空闲（headless 运行器在静止的空闲退出，子 agent 让这次空闲不算静止）：子 agent 的创建让循环行对这个项目拍了一拍，十行表在第 3 行找不到谁列了接上的动作，走到第 10 行，空闲的主 Agent 在高峰里干过活，被叫醒一次——runs 流水里恰好一条 `delivered` 的 `loops.peak-end`，被叫醒的那个请求带着循环板的提醒、说的是表里第 10 行的那句话（followup 会留着，子 agent 完成叫醒的下一轮还带着它，不算第二次投递）。`loops-peak-restart`：同一个项目重启一次，时钟从高峰结束前五分钟起，第一次被叫醒的运行与去重键都随 `state.json` 带了过来；脚本再跨进同一高峰的结束（拨到边界后半分钟，时钟的跳跃不超过「十分钟没动静就放手」的量程）：第二次冒出的同键事件被记作 `loop-duplicate`，没有第二次提醒，流水里 `delivered` 的 `loops.peak-end` 仍是一条。L3（§18.7、§18.8、§18.9，`npm run probe` 195/195，2026-11-02）：新场景 `loops`。场景项目是新初始化的 git 仓库，里面已经有一项人的条目文件并已提交（同新克隆）；覆盖层启用这一行。脚本的三步：用文件工具写那个条目文件、用 shell 写 `.llm/loops/journal.jsonl`、再读那个条目文件。钉住：两次写都被 `loops:files-only` 拒掉（第一次的四段式文字逐字比，shell 那次拿到的是这一条而不是 `file-tools-only` 的），条目文件没变、变更记录里没有 shell 写进去的字节，两次拒绝都在项目违规流水里；只告诉主 Agent 的那一项被认回（一条 `adopt`、`actor: 'harness'`、`via: 'repo'`，`repo-written.json` 记下文件哈希，`view.json` 里状态 `ok`、没有要人看的事）；读那一步照常执行；`.llm/` 在 `info/exclude` 里、`.llm/loops/.gitignore` 是 `*`、循环板写过之后 `git status` 什么也不列；`/glm-status` 把这一行列为生效，每个请求的系统提示词里有 guard 节替循环板写的那一句。另加一条钉运行时（§18.9）：headless 宿主没有会话控制器，所以行健康写「这个进程不跑循环板（没有会话控制器）」且状态仍是生效，`.llm/loops/` 里 `runner.lock`、`handover.json`、`events.jsonl`、`runs.jsonl`、`state.json` 一个都没有，门与文件照常工作。另有一条钉「没有覆盖层时这一行是未加载」。§18.10 另加一条：这一行把两道门都装上并在行健康里写出来，而这个宿主里不可能有循环板的提醒（没有定时服务）。`loops:schedule-tools` 拦的那三种调用在 L3 拦不到：headless 模板既没挂 `dsh-schedule` 也没有会话控制器，所以 DSH 的四个提醒工具根本没注册（设计 §10.2 V1）；要在 L3 验它们，得另开一个挂上 Web 组合那两行的场景（现有 `loops` 场景钉的正是「没有会话控制器」，不能在它上面挂），或者等桌面版 L4。