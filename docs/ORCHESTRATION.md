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

现状〔已实现〕：workflow 行只记录派遣类工具调用（`spawn_teammate`、`team_task_create`、`team_task_update`、`send_message`、`subagent`、`subagent_fork`），分级恒为 L1；五键文案已定义但没有任何调用点；晨报从三条审计流水聚合，决策与违规取自项目目录、用量取自用户级目录（`DESIGN.md` §2.4）；`/hourness` 命令输出晨报与积分口径的用量面板（§11.3）；GLM 会话进入高峰时段时收到一条提醒（§11.4）。

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
- 同一节点第三次修复，发决策卡「停下查根因」（`CHARTER.md` §7.1 条款 4）。

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
| `decision` | 选项 key | 待决，拍板后 | 人选中的选项 |
| `edges` | 数组 | 可选 | `{type, to}`：`depends` 依赖（本节点依赖 `to`）、`source` 来源（本节点因 `to` 而存在）、`supersedes` 取代（本节点取代 `to`） |
| `evidence` | 数组 | 可选 | `{kind, ref, exit?, note?}`：`commit`（`ref` 为 7–40 位十六进制提交号）；`test` 与 `check`（`ref` 为命令或检查器名，`exit` 为退出码，必填）；`decision`（拍板时由引擎写入，`ref` 为选项 key） |
| `history` | 数组 | 必填，至少一条 | 每次变更一条，格式见 §2.9 |

§2.3 的五种连线落在三处：分解是 `parent`；依赖、来源、取代写在起点节点的 `edges` 里；证据指向图外的提交与运行记录，写在 `evidence` 里。

字符串字段不能是空串或只有空白；`title`、`outputSchema`、选项的 `label`、证据的 `ref` 只能是一行。

派发属性取代了原来的 `owner`（负责角色）字段（2026-10-28 用户决定，§2.2）。此前的原型带过 `owner`，但还没有任何节点文件用过它，所以不做迁移；文件里出现 `owner` 时按未知字段报错。

校验在读入时执行，每条错误写明文件与字段路径（例 `nodes/task-3.json` 的 `history[2].actor`）：

- 字段类型、枚举值、必填字段，未知字段报错；id 与文件名一致。
- `parent` 与连线目标都存在，连线不指向自己，同一节点上没有重复连线；分解与依赖都无环；目标节点没有父节点，其他节点必须有父节点，于是沿 `parent` 最终走到一个目标节点。
- `recommend` 与 `decision` 是已有选项；`verification` 只出现在决策节点，`options`、`dimension`、`recommend`、`crux`、`verdict`、`weight`、`decider`、`decision` 只出现在待决节点，`stage` 只出现在目标与特性节点；`decision` 类证据只出现在待决节点，`ref` 是已有选项。表格卡的字段在文件里只查形状：`gain`、`cost`、`consequence`、`crux`、`verdict` 是非空字符串，`weight` 是两个取值之一，`dimension` 有非空的 `name` 与 `values`，`values` 至少一格，键是选项 key 的格式，格子是非空字符串。行文、长度与必填是写入规则（见下）。
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

有错误的图照常可读：解析失败、或已知字段的类型与必填不对的文件不进节点表；其余问题（未知字段、跨字段规则、引用与环）只报告，节点照常显示。这样一个手误不会让它的整棵子树从面板里消失。只读 `nodes/` 下的 `.json` 文件；引擎写入时的临时文件名为 `.<id>.<随机串>.tmp`，读入时忽略；`nodes/` 不存在时是一张空图。

修订号：节点修订号是节点文件字节的 SHA-256 前 12 位十六进制；图修订号是 SHA-256 的前 12 位，输入是每个节点文件一行 `<id> <节点修订号>\n`，按 id 排序，解析失败的文件也算在内。引擎写入、手改文件、git 检出都会改变修订号，查看器与并发检查都以它为准（§2.11）。

### 2.7 读写权限与变更分类

| 角色 | 能做什么 |
| --- | --- |
| 人 | 在 UI 上看图、给节点写批注、在决策卡上拍板；可直接改目标与验收条件。人的改动优先级最高，也是最强的学习信号 |
| LLM | 只通过一组图工具读写，不直接改图文件（guard 拦截） |
| harness | harness 代码自动发起的变更（例：已关闭节点的关联文件被改动后重开），权限与 LLM 相同 |

这三种身份在引擎里是 `actor` 的三个取值：`human`、`llm`、`harness`。actor 由客户端入口决定，不从请求数据里读：面板的写入（命令 `/graph-apply`）一律记为 `human`，命令行与 DSH 图工具一律记为 `llm`，以后的 DSH 钩子记为 `harness`。每种操作对各身份的限制见 §2.9。

guard 拦截〔已实现，规则 `graph-files-only`，`src/guard/graph-files.ts`；由行 `glm-hourness/graph` 注册，2026-10-28 经 L3 探针与 L4 后默认启用〕：

- 拦什么：目标在图目录里的文件工具调用，即 `Write`、`Edit`（GLM 别名）、`write`、`edit` 的 `file_path`，以及 `str_replace_editor` 除 `view` 以外各命令的 `path`；shell 命令（`Bash`、`bash`、`pwsh` 的 `command`，`terminal_send` 的 `text`）在规则 file-tools-only 判为写文件、且命令文本提到图目录时也拦。命令文本的取法与写文件的判断都照搬 file-tools-only（2026-10-28 起引号感知，§6.5.1），所以引号里提到图目录的箭头不算写入。图目录指整个目录，`graph.svg` 也在内（它由渲染器重新生成）。读不拦。
- 路径：相对路径按调用方会话的工作目录解析，`..` 先规整再判断；大小写与 `/`、`\` 不区分。shell 命令里认绝对路径与相对工作目录的写法（可带 `./`），前后紧挨着路径字符的不算（`docs/graphs`、`docs/graph.svg`、`x/docs/graph`）。会话没有工作目录时，相对路径的图目录不判断，绝对路径的图目录只判断绝对路径的目标。
- 纠偏：四段式（§6.1）。事实写出被拦的路径或命令；越界说明图文件只经图工具改，图工具留历史、查修订号、证据与权限；正路是先 `graph_show` 或 `graph_open` 读，再用对应的写工具；例外是要人权限的操作由人在面板里做，或人在对话里说、LLM 带原话转述（§2.9.1），节点文件坏了或没有对应工具时告诉人，由人手改或用 git 还原。
- 注册：图行在 `tools/pre-execute` 上以 `prepend` 注册（排在最外层），先于 guard 行判断：shell 写图目录拿到的是图工具这条正路，而不是 file-tools-only 的「改用 Write 或 Edit」，否则模型照做后还要再被拦一次。guard 行的规则不变，图目录以外的调用照旧由它判断。与 guard 行一样，带 `parent` 令牌的传输层子调用直接放行（`DESIGN.md` §2.4a）。规则跟图行走：图行禁用时没有图工具，也就没有这道门禁，被拦的一方手边总有正路。
- 图目录不存在时同样拦：手写节点文件也是绕过引擎。开始一张新图的正路是建一个空目录（图工具报 `not_found` 时的提示里写着）；`mkdir docs/graph` 不在 file-tools-only 的写文件模式里，本规则也就不拦。
- 直接拦截，不先走影子模式（§6.5）：新规则先只记录的通用机制还没有（M4）；M1.8 的影子兜底只记 file-tools-only 看不见的 shell 写入（§6.5.2），不是这种机制。本规则只看图目录里的目标，误伤面小；2026-10-28 经 L3、L4 后随图行默认启用。
- 拒绝进违规审计〔已实现 2026-10-28〕：图行像 guard 行一样经数据目录服务取项目目录（行配置 `home` 优先），每次拒绝写一条与 guard 同形的记录（`rule: "graph-files-only"`、工具名、调用方 agent 与会话、来源 `scope` 与 `route`（§6.2）、纠偏全文）到同一份 `audit/violations.jsonl`（`CHARTER.md` §7.1 条款 11）。写入失败不影响拦截，第一次失败在控制台报一次。
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

决策队列就是异步决策卡（§5）〔定案 2026-10-28：自建，卡即图上的待决节点〕：已批准或进行中（拍过后重开）、决定者为人的待决，按提出时间从早到晚排（首条历史的时间，同一时刻按 id）。每张卡带节点引用、正文、选项（说法、得到与代价，表格卡之前的待决是说法与后果）、推荐项、决定者、提出它的节点（父节点）、来源连线指向的节点、提出时间与提出者。人在面板里选一个选项、写一句理由拍板（`decide`，actor 为 `human`），或在对话里告诉 LLM，由 LLM 带转述拍板（见下）；都不阻塞 agent。拍板后卡离开队列，待决转为完成并带 `decision`，LLM 下次读投影就能看到：父节点与来源节点的投影里这张卡的引用带 `decision`，待决自己的投影带 `decision` 与拍板那条历史（含理由）。

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
| `decide` | `id`、`rev`、`option` | 已批准、进行中或完成的待决拍板：写入 `decision`，追加 `decision` 证据，状态转为（或保持）完成；完成的待决再拍即推翻 | 可以 | 决定者为 `agent`、且人没有拍过的待决可以；其余拒绝，正路同 `approve`。这条拒绝排在修订号检查之前 |
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
| 人：DSH 面板 | 右侧栏「项目图」页（见下「DSH 原生面板」），读经 `remote.workspaceFiles`，写经命令 `/graph-apply`，任务上的运行控制经命令 `/graph-run`（见下「运行控制」）〔2026-10-28 取代本机查看器，用户：不想放到网页，应与 IDE 深度耦合〕 | M8 的其余界面沿用它的组件与样式 |
| LLM：命令行与 DSH 图工具 | 命令行 `npm run -s graph -- <命令>`，JSON 进、JSON 出，actor 固定为 `llm`；DSH 图工具按命令行契约实现，行 `glm-hourness/graph` 2026-10-28 经 L3、L4 后默认启用（见下） | 命令行留给在 Kiro 里开发本仓库时用 |

本机查看器〔2026-10-28 删除，`m2-10`〕：原型阶段人用的是本机服务加单文件网页（`src/graph/server.ts`、`viewer.html`，入口 `npm run graph:serve`）：平移缩放、折叠、筛选、节点详情与各种人的操作，经带令牌的回环 HTTP 写入，经 SSE 实时刷新。用户不要网页形态，DSH 原生面板（见下）上线后整套删除，人的读写只经面板；代码、路由表与安全措施留在 git 历史里（提交 `25d1bae` 是最后一个含它们的版本）。原型的冒烟改为只跑入口脚本（`npm run graph:smoke`：命令行以独立进程批注、`open`、`show`，再出图）。

在 DSH 里用〔2026-10-28 读 rc.3 包文档与源码所得，实读，未真机验证；第 1 条已放弃，第 2 条提前到 M2〕：

1. 放弃：Desktop rc.3 默认启用内置 Browser 标签页（`dsh-web-app/cordis.patch.yml` 中的 `ui-sidebar-browser` 行）。一个客户端插件调用 `ctx.sidebarRight.openTab('browser', { params: { url } })`（`dsh-client-ui-sidebar-browser/README.md`）即可在右侧栏打开本查看器的回环地址；那是 Electron `<webview>`，页面里没有 DSH API。用户不要网页形态，这条不做。
2. 现在（M2）：原生右侧栏标签页（`sidebarRightTabs.register` + 槽 `sidebar.right.pane.tab`，`dsh-client-ui-sidebar-right/README.md`）。读图经 `remote.workspaceFiles`（只读，带变更订阅，`dsh-api-workspace-files/README.md`），写回经命令通道 `remote.commands.execute` 进入宿主侧的引擎，人和 LLM 走同一个引擎、同一套规则。客户端可调用的 Remote 能力在 `dsh-api-remotes` 构建时固定（其 README），第三方插件实际上不能注册自定义 Remote 服务，所以不走那条路。

DSH 原生面板〔已实现 2026-10-28，`m2-7`；L3 探针与 L4 桌面版核对，见下〕：

- 落点：编排层包 `dsh-hourness` 的客户端面（`packages/hourness/ui`，行 `glm-hourness/ui`，`DESIGN.md` §2.3）注册页面类型 `dsh-glm-hourness-ui/graph`（kind `glm-hourness-graph`，`keepMounted`），右侧栏的「开始」页多一个「项目图」入口。页面 id 与 kind 没有随包改名：页面 id 只要求全局唯一（`FACTS.md` §3），已打开的面板标签按它恢复。正文槽的 `inject(sessionId)` 把会话交给正文，面板显示这个会话工作区里的图（`docs/graph`）。
- 读：`ui/src/graph/source.ts` 列出 `docs/graph/nodes`，逐个 `readBytes`，用 Web Crypto 算修订号（与 `store.ts` 的 node:crypto 结果相同，有测试），用引擎自己的规则解析（`src/graph/parse.ts`，从 `store.ts` 拆出，不含文件系统与 Node 内置模块），再经同一个目录的 `changes` 变更流跟进：一帧变更只重读它点名的文件，120 ms 内的连续变更合并一次。每个会话一份数据源，多个面板共用，最后一个卸载时释放。变更流起不来时图照常可读，头部的「实时」变为「重新读取」。错误状态〔2026-10-29，`m8-ui-audit` F-29〕：图有校验错误时页签下方的提示写出第一处（文件、字段与说明），其余收在「还有 N 处」后；某个节点文件读失败（不是已删除）时节点不再悄悄消失，提示「面板读不出 N 个节点文件，这些节点没有显示」并列出文件与原因，提示里有自己的「重新读取」，点了重读全部节点文件（变更流在跑时头部没有这个按钮，失败的文件只在它的下一次变更时重读）〔`m8-ui-audit` R-02〕，下一次读成功就消失；面板渲染出错时显示错误与「重新加载」按钮，点了重新渲染，不用关掉页签；工作区没有图时的说明不变，建图入口属于特性 `bootstrap`。
- 写：新行 `glm-hourness/graph-panel`（`src/graph/panel-row.ts`）注册命令 `/graph-apply`，输入是一个 mutation 的 JSON，以 `human` 身份交给引擎，图目录按调用会话的工作目录解析（与图工具相同）。只有人能发斜杠命令，模型发不出，所以身份固定为 `human` 是对的。`recordInput: false`：会话日志不记原始 JSON，节点历史已经记了这次改动；会话里显示的是一行结果（例「已拍板「面板放哪」：A 右侧栏」），拒绝时是「图没有写入（错误码）：」加一句人能照着做的中文（`labels.ts` 的 `refusalForHuman`，例 stale_revision「这个节点刚被改过，面板已读到新内容，看一眼再点一次」，bad_transition 带上节点现在的状态）；引擎写给 LLM 的英文说明与正路只经图工具的结构化错误给模型，原先把它们拼进命令结果的 `refusalText` 已删除；`/graph-run` 写节点历史失败或找不到图时同样用人话〔2026-10-29，`m8-ui-audit` F-06〕。两个命令在 `/` 菜单里的说明是中文（「项目图面板用：以人的身份改一次图」「项目图面板用：开始、暂停或重做一个任务」），`/graph-run` 带输入提示 `start|stop|redo <节点 id>`〔F-20〕。这一行是 DSH 命令的流节点，人能在对话里看到自己在面板里做过什么；它不进模型请求（`dsh-commands/README.md` Model Experience）。行不注册任何工具，经 L3 探针（场景 `glm-graph-panel`）后默认启用。同一行还注册运行控制的命令 `/graph-run`，它会给主 Agent 发消息（见下「运行控制」）。
- 四个视图：「需要你」只放等人做的事（人的待决与提议，先提的在前），卡片上直接拍板、批准或否决，处理完的卡片滑出；没有时显示空状态，并指向 agent 自己定的事。「agent 定的」列 agent 正要定的待决与最近的拍板，每条标明是 agent 自己定的、你在对话里说的还是你拍的，展开后可以直接改选（推翻）。「正在做」先列各个 agent 的现场（见下「实时现场」），再列进行中的节点、可以开工的任务、采纳了还没验证的决策。〔排版 2026-10-28，`m8-doing-layout`〕四节的标题、间距与分隔线同节点详情的各节；三个节点列表用同一种行：标题，下一行是类型、路径与进度，行与行之间一条直线；列表按「图」画兄弟节点的顺序排（创建时间，即第一条历史，再按 id），不按文件名，节点详情的子节点同样〔2026-10-29，`m8-ui-audit` F-07〕。路径不含目标（目标在面板头部：头部列出全部未关闭的目标，按 id 排、以「 · 」连接，悬停时每行一个，全部关闭时只写第一个目标；本项目的图有 `glm-house` 与 `hourness` 两个根目标〔2026-10-29，`split` 第 8 步〕），目标直属的节点没有路径。进度只数直属子节点里的工作（任务与特性），丢弃与被取代的不算，写成一条短进度条加「工作完成 18/21」；已拍板的待决不是做完的工作，另写「待决已定 7/7」；没有工作子节点就没有进度条；决策、规矩、风险、工具、复盘两边都不算。节点详情「下面的节点」的标题用同一口径。「图」用引擎的布局（`layout.ts`）画成 React SVG，节点保持身份，重读后移到新位置而不是跳；颜色用主题 token，深浅色主题都跟着变；第二行写节点在等什么（等你拍板、agent 来定、未开始、已采纳……），不写 id；筛选只有一个下拉（没做完的、全部、只看等你的），被筛掉的已完成子节点在父节点角上计数；拖动或滚轮平移，Ctrl 加滚轮或按钮缩放，「全貌」看整张图，「回到重点」以可读的缩放对准第一个等你的节点，没有时对准主 Agent 的焦点，再没有时对准第一个进行中的任务。进行中的节点上站着在跑的 agent 时才有呼吸光圈，列表里它的圆点同样呼吸；只是状态标着进行中、没有 agent 在跑的节点，光圈与圆点都不动，动效只表示真有活在干〔2026-10-29，`m8-ui-audit` V-04〕。等你的节点光圈是红的。点节点打开详情：祖先路径、类型与状态、正文、待决的选项、提议的批准与否决、任务的运行控制、怎样算完成、不做什么、子节点、证据、最近的历史、批注；id 放在最后，供人跟 agent 说起它时用。详情盖在视图上，但不随列表滚动（列表在不滚动的底板里滚，详情盖住底板），所以从滚到底的列表里打开也在眼前；详情打开时列表不接焦点。从详情里再打开的节点（祖先、子节点）叠成一摞：「返回」退一层，退到底回到列表；Esc 关闭详情；打开时焦点到「返回」，关闭后回到打开它的元素。切换视图时回到该视图的顶部〔2026-10-29，`m8-ui-audit` F-01、F-26〕。键盘：列表行、卡片标题与「图」上的节点都在 Tab 顺序里，Enter 或空格打开；用 Tab 走到画布外的节点时视图平移，把它放到画布中间，焦点框总在眼前；页签上的计数读屏读作「需要你，3 项」，出错的工具标签读出「出错」。详情的祖先路径里目标写作「目标」（标题在面板头部），挂在目标下的卡片与待定行不写「挂在「…」下」；待定行写「倾向 A 方案名」；子节点用「正在做」的同一种行（类型、状态、进度）；验证标签沙盒、真机验证为绿，被推翻为红，被取代为灰〔`m8-ui-audit` F-08、F-22、F-25、F-27、F-28〕。提议的批准与否决在详情里是一节「批准或否决」，与「需要你」卡片同一个控件：「不要」先要一句可不填的理由，再点「否决」才写入；理由输入框里按 Enter 拍板时，输入法组字中的 Enter 不算，写入进行中也不再发；「agent 定的」的两组同其他视图一样分节，标题带数（「agent 正要定的 · N」「最近拍板的 · N」），后一组为空时写「还没有拍过板的事。」〔`m8-ui-audit` F-12、F-13、F-14〕。〔排版 2026-10-28，`m8-detail-layout`〕正文按 Markdown 排版，字号与段落间距随面板，行内代码用面板的主题 token；详情里超过十行、卡片上超过四行时折叠在「展开」后，按实际渲染高度判断，不超出就没有「展开」。正文以下每一节上方一条分隔线，节标题与内容的间距一致。历史每条写时间、谁、做了什么：编辑写明改了哪些字段（例「编辑验收条件」）；改状态写新状态（「改为「完成」」），验证写新的验证状态（「验证为「沙盒验证」」），加删连线写种类与目标（「加连线 依赖 → task-2」），取代写另一个节点（「被 decision-2 取代」）〔`m8-ui-audit` F-15〕；经对话转述的写「你（经对话）」，原话在下面引用，保留换行；理由开头的「用户：」与这个标签重复，显示时去掉，节点文件里的历史不改；超过三行的条目同样折叠。
- 打包：`scripts/build-ui.mjs` 按目录表 `scripts/packages.mjs` 给两个包各打一份客户端产物：面板的入口 `ui/src/hourness-client.tsx` 打成 `packages/hourness/ui/client.js`，GLM 通道 pill 与设置页的入口 `ui/src/glm-client.js`（`ui/src/channel.js`）打成 `packages/glm/ui/client.js`（构建产物，不入库），CommonJS 外包 `window.__ModuleLoader__.load`，id 是各自的包名，与 rc.3 官方客户端包同形；模块表里的包（React、`react/jsx-runtime`、ui-primitives 等，`scripts/ui-modules.mjs`）保留为 `require`，其余打进包里。preflight 检查每个包恰好有一行以它的精确包名命名、客户端半已构建、外包的 id 是包名、通过 `node --check`、不 `require` 模块表以外的东西。面板的客户端产物不带 GLM 的文件，只装编排层包时面板照常。动画只用 CSS（`prefers-reduced-motion` 下关闭），不加动画库。
- 验证：L2 有命令行（`tests/graph-panel.spec.ts`）与面板数据层（`tests/graph-panel-model.spec.ts`：修订号一致、筛选、进度口径、文案、假 Remote 上的读取与变更跟进）；L3 探针在真运行时上经真实处理函数批注与拍板（76/76）。L4（2026-10-28，桌面版重启后经 Chrome DevTools 协议驱动）：「开始」页出现入口；四个视图读到本项目的 75 个节点；在详情里批注一条，命令返回「已批注「1.11 L4 真机验收」」，节点文件的历史多了一条 `human` 的批注，面板经变更流在 4 秒内显示；随后用 git 还原这个文件，面板同样跟着变回。页面里有 `isSecureContext` 与 `crypto.subtle`。没做自动化的界面测试（§15）。

实时现场〔已实现 2026-10-28，`m2-8`；在节点上的落点等图工具启用后核对，见下〕：

- 数据：graph-panel 行经 `ctx.inject(['sessionProjections'])` 注册会话投影 `graphLive`（`src/graph/live.ts`，`stateVersion` 2），从会话自己已提交的事件折叠出这个 agent 的现场：`graph_focus` 成功设定的焦点节点、请求头里的模型、本轮开始时间与步数、正在跑的工具调用、最近 6 次工具结果（成败）。`DeferredToolCall` 显示它代跑的工具名。fork 继承的前缀事件跳过。子 agent 名单、token 用量直接读 DSH 自己的投影 `subagentCatalog`、`tokenUsage`，不重复折叠。不写盘：投影是会话日志的视图，检查点进 DSH 自己的投影缓存。取代原计划的节流写 `.llm/graph-live.json`〔agent 定，2026-10-28〕：投影是 DSH 原生路径，第三方行能注册，宿主把每个活会话的投影变化经控制流推给客户端，不需要文件与订阅。
- 到达客户端：客户端 `sessions` 服务的会话列表快照（`projectionsBySession`）跟着宿主的控制流走，宿主每个活会话的投影变化都推过来（`dsh-api-session-controller` 的 `SessionControlController`），所以主会话和子会话都不用 `retain`。还没有投影值的会话（冷会话）调一次 `refreshProjections`；冷会话只带投影缓存里已有的单元，这次启动之前跑完的子 agent 没有 `graphLive`，面板把它们收成一行「还有 N 个子 agent 是这次启动之前跑的」，点开再列；有 agent 在跑时它们并进「另有 N 个子 agent 已停下」那一行。
- 呈现〔2026-10-28 按 `m8-doing-layout` 改，原先在跑与停下的 agent 一样显眼〕：「正在做」顶上一节「现场 · N 个在跑」。在跑的 agent 排在前面，每个一行：名字（主 Agent 或子 agent 的标签）、模型、token 用量；现在在做什么（「在跑 Bash · 3 秒」「在想 · 第 2 步 · 40 秒」）；焦点节点「在「…」」（点开详情），没有焦点时写「还没落到图上的节点」；最近几次工具调用，出错的标红；圆点呼吸。空闲的主 Agent 与停下的子 agent 各占安静的一行：名字、「空闲，等你说话」或「已停下」、最近一次工具结果的时间（「3 小时前调过工具」）、焦点、token 用量；焦点节点还开着写「停在「…」」，已经完成、丢弃或被取代写「上次在「…」」；停下的子 agent 打勾。安静的行只用次级颜色区分，不调透明度，浅色主题下文字对比度照常〔`m8-ui-audit` F-09〕。有 agent 在跑时停下的子 agent 收进一行「另有 N 个子 agent 已停下」，点开再列；空闲的主 Agent 不收：后台派发时这是常态，它正等着人〔`m8-ui-audit` F-10〕。token 用量写法同 DSH 输入框下的统计（「282K tok」）；相对时间跟着面板的钟走，有 agent 在跑时每秒、否则每分钟刷新，悬停显示具体到分钟的本地时间〔`m8-ui-audit` F-11、F-32〕。没有 agent 在跑时，现场先写一句「这个会话里没有 agent 在跑。进行中的 N 个任务可能在别的会话或 DSH 之外推进。」（N 只数任务，进行中的特性只是装着工作；活例如在 Kiro 里派出的 worker 那里），下面一行小字「现场只看得见本会话的主 Agent 和它派出的子 agent。」；看不见的活面板不编造〔`m8-ui-audit` F-31〕。「图」里每个 agent 是焦点节点上沿的一枚徽标，在跑时外圈呼吸；子 agent 没有焦点时站在主 Agent 的焦点上；在跑的 agent 没有落点、或落点被筛选隐藏时，列在画布上方的一行；空闲的 agent 不列（现场里有）。这一行与图例都在可平移的画布之外，不遮节点；图例含提议（虚线框）与风险（红色虚线框）；筛选下没有节点时画布中间写「没有等你的事」或「这个筛选下没有节点」；父节点角上的计数悬停写「N 个已关闭的子节点被筛掉了」。人没有拖动或缩放过时，画布尺寸或筛选一变，视图就重新对准重点（点过「全貌」则保持全貌）；拖动、滚轮或缩放按钮之后保持人的视图，直到再点「回到重点」或「全貌」〔`m8-ui-audit` F-16、F-17、F-30、V-05〕。决策紫色只用于描边与填充，标签文字混入正文色，两种主题下对比度不低于 4.5:1〔F-23〕。「回到重点」先对准等你的节点，其次对准主 Agent 的焦点。
- 验证：L2 `tests/graph-live.spec.ts`（8 例：一轮里的步数与在跑工具、焦点只在成功时移动、并行调用与最近 6 次、`DeferredToolCall` 的显示名、模型、无关事件与继承事件不改状态、schema、行在注册表到达时注册与缺席时降级）。L3 探针（78/78）：面板场景读到 `glm-5.3`、本轮 2 步、`Read` 成功、没有在跑的工具；派发场景父会话的 `subagentCatalog` 有这个子 agent，子会话读到 `glm-5.3-flash`、`Bash` 成功、越界 `Write` 失败、域内 `Write` 成功与 token 用量。L4（2026-10-28，桌面版重启后经 Chrome DevTools 协议驱动，GLM-5.3-Flash 新会话，只读任务：派一个子 agent 读 `package.json`，自己读 README、跑 `Get-Date`）：现场一节出现主 Agent 与子 agent，模型、步数、用时、最近工具（`subagent`、`Read`、`Bash`、`LocalToolSearch`）与 token 随回合变化，子 agent 停下后打勾；第二轮里界面依次显示「在跑 Bash」「在跑 Read」，工具结果的宿主事件时间到界面变化 7–35 毫秒。模型流式输出时现场显示「在想」，工具调用在这一步的助手消息提交时才进会话日志，所以「在跑」从工具开始执行算起。未核对：徽标落在焦点节点上，需要 `graph_focus`，图工具行还没启用（`m2-11`）。

运行控制〔已实现 2026-10-28，`m2-9`，L2；L3 场景 `glm-graph-run` 已写好未跑，L4 待做；调研见 `.agents/tasks/m2-9-research/report.md`〕：

- 命令：graph-panel 行注册 `/graph-run <start|stop|redo> <节点 id>`（`src/graph/run-control.ts`），面板经 `remote.commands.execute` 发出，与 `/graph-apply` 同一通道，身份同样是人。只用于任务节点。`recordInput` 保持默认：输入只有几个词，就是人点了什么，`command/run` 原样记下。按钮何时出现与命令何时接受用同一份规则（`src/graph/run.ts`）：「从这里开始做」在任务已批准或进行中、且没有 agent 在上面跑时出现（命令本身不查这一条，再点一次只是多排一条消息）；「暂停」在有正在跑的 agent 站在这个节点上时出现（站位规则与现场相同，`live.ts` 的 `placeOf`：自己的焦点，子 agent 没有焦点时用主 Agent 的）；「按现在的验收条件重做」在任务完成后，或进行中且验收条件在上次「开始」「重做」之后改过时出现（2026-10-29 之前叫「改了验收条件后重做」，没改过条件的完成任务上也这么写，名不副实，`m8-ui-audit` F-19；找上次开始或重做的历史时两种写法都认）。按钮上方每条说明占一行：有 agent 在上面跑时列出名字；没有时写「这个 DSH 会话里没有 agent 在做它」，进行中的任务再说明活可能在别的会话或 DSH 之外（面板只看得见本会话的主 Agent 与它的子 agent），完成的任务不写这一条。面板没有验收条件编辑器，改条件经对话（LLM 带人的原话 `graph_edit`）或命令行。
- 主 Agent 收到什么：都用 `createUserNotice` 构造，来源 `glm-graph-run`，`source.graphRun` 带 `{action, node, commandId, stopped?}`。开始：`agent.followup` 一条「人在面板上点了「从这里开始做」」，要它先 `graph_focus` 这个节点（投影随之而来，现场徽标随之落到节点上），已批准的任务开工时标 doing；空闲时开新回合，忙时排在当前回合之后，不插进去。暂停：在宿主侧当场重算谁在这个节点上（`sessionProjections.snapshot` 读主会话的 `graphLive` 与 `subagentCatalog`，子 agent 经 `agents.get` 取活 agent 与它的 `graphLive`，只算正在跑的）；主 Agent 在上面就先 `cancel({kind: 'user'}, {keepInbox: true})`，再 `inject` 一条「人暂停了这个节点，不要接着做，也不要重新派发」，然后对每个站在上面的直接子 agent 调 `subagents.interrupt(id, {kind: 'user', parentSessionId})`。说明在中断之前送进去：子 agent 停下后 DSH 会给主 Agent 送结算通知并唤醒它，读到通知的那一步同时读到这条说明。重做：完成的任务先由人改回进行中，停下站在上面的 agent，最后 `followup` 一条带验收条件前后对比的重做消息；先停后发，消息在被停的回合结束后立即开新回合。
- 留痕：每次点击留下三处记录：对话里的命令流节点（`command/run` 的参数与 `command/done` 的结果行，例「已暂停「…」：停下了主 Agent」）；节点历史里一条 `human` 的批注「人在面板里点了「…」」（暂停写明停下了谁；重做一个完成的任务时这句话是改状态的理由）；主 Agent 收到的消息及其 `graphRun` 事实。被拒绝时（未知节点、不是任务、节点上没有在跑的 agent、缺 `sessionProjections`，或主会话有子 agent 而缺 `agents`、`subagents`）只返回一行原因，图与 agent 都不动：节点历史先于任何动作写入，写失败就不动。
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
- 跨进程（宿主进程里面板的 `/graph-apply` 与图工具、Kiro 里的命令行同时写同一个节点）靠修订号检查，后写的一方拿到 `stale_revision`。比对与改名之间仍有毫秒级的窗口；单用户接受这个窗口，不加锁文件，因为进程崩溃后锁文件会残留在图目录里，要另做清理。

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

## 3. 角色

没有队友角色，也没有角色 preset〔定案 2026-10-28，取代原先「一个 Lead 加若干具名队友、共享任务板」的角色设计与队友角色卡〕。主 Agent 把项目图上的任务节点派给后台子 agent：经 `subagents.startActivation` 用 spawn 后端启动，结果送回主 Agent（`delivery: 'parent'`），主 Agent 不等它，继续做别的，子 agent 完成时收到通知。原来写在角色卡上的内容改为任务节点的派发属性，由 harness 在派发时读取（§3.2）。

### 3.1 主 Agent（项目经理）

主 Agent 是会话的根 agent。

- 职责：访谈、规划、派发、验收、汇报。
- 身份〔定案 2026-10-28〕：本项目自己的提示词文本，内容是三问四答（`CHARTER.md` §4）、五键（§4.4）与许愿访谈（§4.2）。不用 DSH 的 agent preset 或 persona 行承载。
- 不写代码〔定案；机制于 2026-10-28 改定〕：由 guard 在主 Agent 的 `tools/pre-execute` 拦下写文件的调用（文件工具与写文件的 shell），正路是派发任务。主 Agent 的工具面不变，不靠 preset 去掉写文件工具（原定「工具面里不放写文件的工具」作废）。
- 说话方式：聊天、少术语、一次只问一个问题、每个问题带选项与推荐。
- 人设分层：用户的人设管「怎么说」，主 Agent 的身份文本管「做什么」，两层叠加互不干扰。身份文本与 `glm-prompt` 的方言改写怎样叠加，实现前在沙盒验证（`ROADMAP.md` 借用组件核实清单）。
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
- 呈现：输入框上方一条流程条，标出当前阶段与未通过的门禁（例：「设计 · 五栏 3/5 · 等待批准」）；点开是右侧边栏的流程页，含当前方案、决策队列与决策日志。

阶段的存储与转换〔2026-10-29 定，M3 设计 §2.4、§3.3.2；阶段模型已实现：`src/graph/stage.ts`，纯函数，宿主与客户端共用；转换所在的 `design_review` 随 M3 后续步骤实现〕：

阶段存在目标节点的 `stage` 字段（§2.6；特性上的阶段只读）。主 Agent 的当前目标是焦点节点自身或它最近的目标祖先（`goalOf`）。

| 转换 | 谁写 | 在哪 | 门禁 |
| --- | --- | --- | --- |
| （无）→ `wish` | 主 Agent 提议目标时带上 | `graph_propose` | 无 |
| `wish` → `interview` | 主 Agent 改自己的提议 | `graph_edit` | 无 |
| `wish`、`interview` → `design` | 人在确认卡上点确认，harness 以人的身份批准目标、改阶段 | `design_review` | 需求卡 8 项都齐（§4.2），目标没有 `supersedes` 连线 |
| `design` → `release` | 人在五键卡上点批准，harness 以人的身份批准放行集合、改阶段 | `design_review` | 放行门禁（下） |
| 任意 | 人在面板以外改，或 LLM 带原话转述 | `graph_edit` 加 `relay` | 引擎规则 |

已批准的目标 LLM 与 harness 不能改（§2.9），所以 `design` 与 `release` 只能由人的动作写入。门禁读的是有效阶段（`effectiveStage`），不是字段原值：

| 目标状态 | `stage` | 有效阶段 |
| --- | --- | --- |
| 提议 | 没有，或 `wish` | `wish` |
| 提议 | 其他任何值 | `interview`（LLM 在自己的提议上写的阶段不算数） |
| 已批准、进行中 | 有 | 原值 |
| 已批准、进行中 | 没有 | 无：这个目标不走设计循环 |
| 完成、废弃、被取代 | 任意 | 无，另报目标已关闭 |

放行集合（`releaseSet`）是目标子树里除目标以外的全部提议节点，按深度、创建时间、id 排序，父节点在子节点之前。放行门禁全部成立才出五键卡：放行集合里至少有一个设计决策，每个设计决策五栏都齐（§4.3）；放行集合里每个任务都有验收条件；目标子树里没有未拍板的待决（不论决定者）；放行集合里没有带 `supersedes` 连线的提议（批准它会连带取代卡上看不到的节点，取代要人在面板上批或带原话转述）。`stageStatus` 汇总一个目标的有效阶段、是否已关闭、缺项（需求卡与确认门禁，或放行门禁）、能否离开本阶段与等人拍板的待决数，阶段提醒、流程条与 `design_review` 都读它。

## 5. 决策卡

申报、待批、L3、设计放行本质上都是「需要人拍板的决策」，区别只在急不急，合并为一种决策卡〔定案〕。

| 形式 | 场景 | 行为 |
| --- | --- | --- |
| 同步 | 出工作区操作、往工作区外装工具 | 阻断当次操作，等人批 |
| 异步 | 计划外决策、规范升降级提议、放宽检查配置、第三次修复停下查根因 | 不阻断，agent 转做计划内工作；进入队列 |

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
- 取代现有的 L1/L2/L3 分级。

## 6. guard：门禁与正路

### 6.1 规矩即数据

每条规矩是一组数据：告知（提示词或阶段提醒）、探测（执行前后的判定器）、纠偏（四段式：事实 / 越界 / 正路 / 例外）、申报（走决策卡）、记录（违规审计）。

现状〔已实现〕：探测与纠偏已接通；记录已接通（2026-10-28）：每次拦截写进项目目录的违规流水 `<项目目录>/audit/violations.jsonl`，项目目录取 guard 行的 `home`，没有就取数据目录服务的（`DESIGN.md` §2.4），L3 探针实测；告知已接通（2026-10-28，`ROADMAP.md` M1.8）：系统提示词最后一节 `glm:guard`（标题「Workspace rules」；2026-10-29 起每条路由都有，此前只有 GLM 路由，§6.2）逐条列出生效的规则，每条一行，取自规则的声明文本；会话没有工作目录时圈禁规则不生效，也不声明。规则是常驻的，所以放在系统提示词（§9.2 的提示词一级），不随每步变化，不影响提示词缓存（`DESIGN.md` §5.2、§6）；随阶段变化的规矩以后走阶段提醒。申报还没有通道（M4 的决策卡，§5）。2026-10-29 之前纠偏的例外段要模型「file a request」，系统中无处提交；现在圈禁与 file-tools-only 的例外段都写「If the task really needs …, tell the human what you need, where and why; only the human can allow it.」，事实、越界、正路三段不变（`src/guard/rules.ts`，项目图 `prompt-fixes`）。决策卡做出来后，例外段改指向它。2026-10-28 之前已知至少 3 次拦截没有留下记录，因为该行没有数据目录，回调也无法从配置传入。

工具名〔已实现 2026-10-29，split 第 2 步〕：规则只认 DSH 原生工具名（`write`、`edit`、`str_replace_editor`、`pwsh`、`bash`、`terminal_send`），判定之前把调用名换成它实际执行的原生工具：先问 GLM 方言提供的方言服务（`glmHournessDialect`，`src/shared/dialect.ts`，由 `glm-prompt` 行提供），服务不在、或它不认识这个名字时，查公共库里的静态别名表 `ZCODE_ALIAS_NATIVES`（`Write` → `write`、`Edit` → `edit`、`Bash` → `pwsh` 等，与 DSH 原生工具名都不重名），都没有就用原名。所以服务缺席时拦截不变，GLM 的 `Bash` 照样按 `pwsh` 判。换算在 guard 行的 `tools/pre-execute`、图文件门禁与影子兜底三处做；图工具不换算（没有别名）。违规与影子记录里的 `tool` 仍写模型调用时用的名字。纠偏与 `glm:guard` 声明里的工具名按模型看到的写：方言服务说它接管了这个 agent 在这条路由上的请求（`claims`）时用方言的名字（`write` → `Write`、`read` → `Read`），文案与之前逐字相同，提示词缓存不受影响；否则用原生名。规则接口为 `detect(call, face)`，`declare` 是字符串或按 `face` 取名的函数；`file-tools-only` 的声明与正路用函数形式，圈禁与 `graph-files-only` 不含文件工具名，仍是字符串。配置追加的规则（guard 行 `config.rules`）按旧接口写照样成立，从这一步起收到的 `call.name` 是原生名。服务的值形状不对、或某个方法抛错时，这次调用按服务缺席处理（拦截照常、文案用原生名），控制台报一次，guard 的会话健康写「方言服务不可用」。静态表不看路由：别的插件若注册了与 ZCode 别名同名的工具，也按对应的原生工具判；今天的组合里只有方言注册这些名字。验证：L2 在 `tests/guard-audit.spec.ts`（有、无服务，服务形状不对，没装上方言的 agent）、`tests/graph-guard.spec.ts`（有、无服务时 `Write` 与 `Bash` 写图文件都被拒）与 `tests/contracts.spec.ts`（静态表与方言自己的别名定义一致）；L3 探针 `glm-no-dialect`（覆盖层禁用 `glm-prompt` 的 GLM 会话：工具面是原生工具，`pwsh` 写文件被拒，纠偏与声明写 `read`、`write`、`edit`），`glm` 场景的纠偏仍写 `Read`、`Write`、`Edit`。

圈禁的路径判定〔已实现 2026-10-28〕：相对路径按会话的当前工作目录解析（rc.3 `workingDirectory.get(session)`，文件工具也按它解析，`cd` 会移动它），没有这个服务时取会话目录，再没有取第一个圈禁根；解析用 `path.resolve`，与 rc.3 `dsh-fs-local` 在 Windows 上的 `localDisplayPath` 相同，`..` 一并折叠。圈禁根仍是会话目录本身，不随 `cd` 移动。此前只做大小写与分隔符的归一化：相对路径一律判为工作区外（L4 中 GLM 写 `.llm/l4-dsh/calc.mjs` 被拒），`C:\ws\..\elsewhere` 这类写法反而能通过。拒绝文案在相对路径时附上解析后的绝对路径。

### 6.2 作用范围

guard 跟着编排层包 `dsh-hourness` 走：包启用时，所有路由、所有模型发出的调用都按规则拦截，所有路由的系统提示词都带规则声明；包不装时都没有〔定案 2026-10-29，项目图 `question-14` 选 G3，人的原话：「围栏到时候跟着编排层走吧，拦全部的。开编排层就全生效，不开就全不生效。」〕。它取代 2026-10-28 的定案「先只作用于 GLM 会话，误伤清零后再考虑放开」及其实现（按会话请求头只拦 GLM 调用，`DEVELOPMENT.md` §7 那次 L4 事故的修复），旧文本在 git 历史里。规则本身不是新的，所以扩到其他路由时直接拦截，不先走影子模式（`CHARTER.md` §6「新门禁先以影子模式运行」）。子 agent 的出界请求默认拒绝，由主 Agent 汇总后统一向人申报。DSH 在宿主层已是这样：委派出去的子 agent 审批策略固定为 `never`，`userQuestions.ask` 拒绝子 agent 调用（§3.2）。

实现〔2026-10-29，split 第 7 步〕：

- 拦截不看路由。宿主本来就不按路由分发：agent 循环把模型发出的每个调用连同发起它的 agent 交给工具服务（rc.3 `dsh-agent-loop` lib/index.js:506–517、582），`tools/pre-execute` 瀑布跑在按作用域过滤的载体上，没有作用域标记的宿主层监听器收到每个 agent 的调用（`dsh-tools` lib/index.js:3320–3321，`dsh-scope` lib/index.js:327–335）。guard 行与图文件门禁（§2.7）判定每次根调用；带 `parent` 的传输层子调用放行。没有 agent、或会话还没有请求头的根调用同样判定；rc.3 里模型发出的调用都带 agent，并且在请求头写入之后才执行，所以今天的组合里遇不到这两种〔推断〕。
- 路由只决定两件事。一是纠偏与声明里的工具名（§6.1）：方言接管这个 agent 在这条路由上的请求时用方言名，否则用原生名。二是违规与影子记录里的来源（`src/guard/origin.ts`）：`scope` 为 `dialect`（方言接管）或 `other`（GLM 路由但方言不在，或其他模型），`route` 是发起调用那一步的 provider 与 model（会话请求头 `src/shared/route.ts` `sessionRoute`：agent 循环在每步调用模型之前写请求头，`dsh-agent-loop` lib/index.js:1226，`Session.requestHeader()` 折叠这些事件，`dsh-session` lib/index.js:1612；会话没有请求头时省略）。第 7 步之前写下的记录没有 `scope`，按 `dialect` 计：那时只有 GLM 路由被判定。编排层不再有模型族判定。
- 声明：每个 agent 的每次组装都在最后加 `glm:guard` 一节（§6.1）。宿主只渲染节的文本、不渲染节名（`dsh-system-prompt` lib/index.js:117–118），所以名字照旧。非 GLM 路由上的这一节与方言不在时 GLM 路由上的逐字相同。升级前已开始的 DeepSeek 会话在下一步多出这一节：DeepSeek 官方模型声明 `systemPromptUpdate: "in-history"`（`dsh-llm-deepseek` lib/index.js:19–25），提示词的变化作为历史里的系统更新发出（同文件 :1677），前缀缓存不断〔推断：agent 循环怎样算出变化（`dsh-agent-loop` lib/index.js:1057–1058）没有读〕。
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

度量：拦截后下一步走对的比例，量的是门禁有没有教会模型。

### 6.4 规矩清单

| 规矩 | 状态 |
| --- | --- |
| 工作区圈禁：写操作只在工作区内 | 已实现 |
| 文件修改只用专用工具：shell 不写文件 | 已实现；2026-10-28 改为识别引号（`=>`、`>>>`、`->` 误判已发生 3 次）：只看命令位置与引号外的真实重定向，git 子命令放行；执行后以工作区变更记录兜底，只记录不拦截（§6.5） |
| 设计阶段不写代码 | 规划；计划模式不拦工具，由 guard 实现（§4.5） |
| 主 Agent 不写文件 | 规划 |
| 图文件只经图工具修改 | 已实现（规则 `graph-files-only`，由行 `glm-hourness/graph` 注册，拒绝记入违规流水，L3、L4 后默认启用；§2.7） |
| 临时脚本只在草稿区 | 规划 |
| 压制注释必须写理由并挂节点 | 规划 |
| 放宽检查配置走决策卡 | 规划 |
| 同一处第三次修复走决策卡 | 规划 |
| 子 agent 只写任务节点的写入范围 | 规划；接缝已经 L3 核实（2026-10-28，§3.2） |

### 6.5 影子模式

新规矩先只记录、不拦截，测出误伤率，误伤足够低再生效。`=>` 误判就是缺了这一步。

影子记录与拦截记录写在同一条违规流水里，带 `mode: "shadow"` 区分；晨报把影子记录单列一节「影子记录（只记录，未拦截）」，不算违规，也不进「例外」。两种记录都带来源 `scope` 与 `route`（2026-10-29 起，§6.2）；晨报在两节里都把 `scope: other` 的记录另行计数，规则名后加「（其他路由）」，没有 `scope` 的旧记录照原来的写法计。

#### 6.5.1 file-tools-only 的引号感知探测〔已实现 2026-10-28，`ROADMAP.md` M1.8〕

`src/guard/shell.ts` 按 PowerShell 与 POSIX 两种方言读命令文本：引号、PowerShell here-string、POSIX here-document、注释与算术表达式里的内容都是数据，不当语法看。判为写文件的只有两类：

- 引号外指向文件的重定向：`>`、`>>`、`N>`、`*>`、`&>`、`>|`、`<>`。流合并（`2>&1`、`>&2`）、空设备（`$null`、`/dev/null`、`NUL`）与输入重定向不算。
- 命令位置上的写文件命令，命令集与改造前相同：`Set-Content`、`Add-Content`、`Clear-Content`、`Out-File`、`Tee-Object`、`New-Item`、`Copy-Item`、`Move-Item`、`Remove-Item`、`rm`、`mv`、`cp`、`rmdir`、`dd`、`touch`、`truncate`、`tee`、`sed -i`。参数位置的词不算命令，所以 `git rm`、`echo rm`、`rg "=>"` 都放行。

命令位置包括：每个管道段与命令列表的开头、赋值与关键字之后（`FOO=1 rm`、`then rm`、`$null = New-Item`）、包装命令之后（`sudo`、`env`、`xargs` 等）、`find -exec` 之后，以及子表达式、命令替换、进程替换的内部；`bash -c` 与 `pwsh -Command` 的脚本参数按对应方言再读一遍。工具与方言：`pwsh`（`Bash` 别名换算后就是它，§6.1）按 PowerShell，`bash` 按 POSIX，`terminal_send`（参数是 `text`，此前误读 `command`，终端输入从未被检查）两种都判，因为终端后端可以是 bash 或 pwsh。拦截文案的「事实」一句写明命中的是哪个重定向或命令，违规流水里随纠偏文本记下。

与改造前相比：引号里的箭头与运算符、`> $null` 不再误拦；`echo hi>out.txt`、`2> err.txt` 这类贴着写或带流编号的真实重定向改为拦截（原正则漏掉）；参数位置上的 `rm` 等（`git rm`、`echo rm`）不再拦截，`find -exec` 后面的命令照样拦。命令集没有扩充：PowerShell 别名（`del`、`ri`、`ni` 等）、`Rename-Item`、.NET 写文件调用、`cmd /c`、解释器一行脚本都看不见，交给下面的兜底记录，等影子数据再决定要不要加进拦截。

#### 6.5.2 工作区变更兜底〔已实现 2026-10-28，影子模式〕

`src/guard/shadow.ts`。DSH 的 `workspace-changes` 在每个顶层回合结束时，用回合首尾的 git 工作树快照加文件工具改动前后的整文件副本，算出本回合改了哪些文件，并在会话日志里追加一条 `workspace/changes` 事件（`DESIGN.md` §2.4a）。guard 按会话与回合记下文件工具的目标与放行的 shell 调用，所有路由都记（2026-10-29 起，§6.2）：调用名先按 §6.1 换成原生名，`write`、`edit`、`str_replace_editor` 算文件工具（GLM 的 `Write`、`Edit` 换算后在其中，方言服务缺席时同样），影子记录里的 `calls` 仍写模型调用时的名字；收到该回合的事件后读摘要，本回合跑过 shell、且有文件不是任何文件工具的目标时，写一条影子记录：会话、agent、来源（本回合只要有一次 shell 调用在方言接管的路由上就是 `dialect`，否则 `other`；`route` 取本回合最后一次 shell 调用的路由）、回合、这些文件的显示路径、本回合放行的 shell 调用，摘要截断时另记未列出的文件数。从不拦截。

已知边界：只覆盖有工作目录的顶层会话；工作目录不在 git 仓库里、或主机没有 git 时，摘要只列文件工具的改动，shell 写入看不见；被 `.gitignore` 忽略的文件只有文件工具碰过才看得见；同一回合里用户自己改的文件也会算进来；构建、测试、`git checkout` 这类放行的命令产生的改动同样会被记下，这是影子数据要量的误报来源。`workspace-changes` 只在 `dsh-web-app` 的组合里，桌面版 profile 有，沙盒模板没有；缺这个服务时只少影子记录，guard 的行健康写明「影子兜底未启用」。

验证：L2 覆盖两种方言下引号与代码体内的 `=>`、`>>>`、`->`，真实重定向，`Set-Content` / `Out-File` / `Add-Content` 等命令，git 子命令，嵌套脚本，以及影子记录的触发与不触发条件（`tests/guard-shell.spec.ts`、`tests/guard-audit.spec.ts`）。L3 探针：GLM 与非 GLM 的系统提示词都带规则声明（GLM 用方言名，非 GLM 用原生名，§6.2）；`Bash` 跑引号里带箭头的命令与带引号箭头的 git 子命令都放行；在临时 git 仓库里挂上 `workspace-changes`，一条 .NET 写文件调用照常执行，留下恰好一条影子记录，只列 shell 写的文件，不列 `Write` 写的文件。

### 6.6 惯犯升级

同一会话同一规矩违规达到 N 次，发强提醒（四段式加违规史回显）。反复出现的模式进入规范阶梯（§9）。

## 7. 环境与检查器

### 7.1 工欲善其事

LLM 爱造轮子，因为写脚本只花当前这一轮的力气，装工具却要停下来问人；代价由后面几十轮来付，到那时它已不记得写过什么，结果是散落全盘的文件与脚本〔定案，用户经验〕。所以正路要在当下就最省力：

- 环境是项目图上的一个分支，每个工具一个节点：用途、用法、选择理由、安装位置。会话开始时与记忆一起放到模型手边。
- 执行限制在工作区内，与此配合。

### 7.2 查找顺序

工具箱 → DSH 插件与 MCP（DSH 有 MCP 客户端，例如连服务器应接 SSH 类 MCP，不自己写连接脚本）→ 社区成熟包 → 自己写。自己写时，方案架构栏写明查过哪些、为什么不用。

### 7.3 装工具

往工作区外安装，走一次同步决策卡；批准后记入环境分支，以后每一轮都在手边〔定案〕。

### 7.4 草稿区

一次性脚本只允许放在约定的草稿目录；汇合时要么删除，要么转正（挂上节点、移入 `scripts/`、写明用途），放着不管的过不了汇合门禁〔定案〕。位置待定（§15）。`.llm/docs/` 下的三个抓取脚本就属于这一类，待清理。

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
- 压制注释总数单独作为一项指标。

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

### 8.1 现状

约 800 次 GLM 请求只存进 1 条记忆，且落在被废弃的目录（`~/.dsh/profiles/desktop/.llm/memory.json`）〔实读〕；这条记忆已于 2026-10-28 复制进仓库 `.llm/memory.json`（`DESIGN.md` §2.4）。原因：只能等模型主动查询；工具检索把记忆工具收进了延迟目录；会话开局召回未实现；「git 能查到的不存」的判据过严，句子里带斜杠或文件名就被拒（例：「coding-plan/start-plan 的签名规则不同」存不进去）。

### 8.2 两类记忆

| 类 | 衰减 | 撤销 |
| --- | --- | --- |
| 事实 | 14 天半衰期，每次确认复审加成（上限 1.5 倍）〔已实现〕 | 可被新事实覆盖 |
| 偏好与规范 | 不衰减：这是用户定下的，不因一段时间没被想起而淡化 | 只能由用户撤销 |

存放〔定案 2026-10-28〕：关于人的偏好放用户级目录 `$DSH_HOME/glm-hourness/`，项目事实与项目规范放工作区 `.llm/`（`DESIGN.md` §2.4）。偏好类记忆尚未实现，现有记忆工具只写工作区。

### 8.3 召回与工具

- 会话开局把强度最高的若干条放进一节（会话内不变，不影响逐步缓存）。
- 记忆工具常驻，不进延迟目录。

### 8.4 写入

- 取消基于路径与文件名的拒绝判据。写入时要求标明类型与 Why；重复由写入前查询与运维巡检处理。
- 分工：git 管「是什么」，记忆管「为什么」与偏好。

### 8.5 学习流水线

- 信号：五键、拒绝理由、汇报细度拨档、对话中的纠正，以及最强的一种：人亲手修改了 LLM 的产出，改动本身就是偏好。
- 流程：发现纠正 → 起草规则（写明 Why 与 How to apply）→ 人确认 → 注入 → 观察同类纠正的重复率。
- 汇报细度闭环：现有的三档滑杆（简洁 / 适中 / 详细，LLM 每次自选，常设偏好可配）〔已实现〕接上「讲细点 / 说重点」的反馈，拨档并写入画像，下次会话自动带上。
- 子 agent 各配独立记忆目录，避免互相污染。

## 9. 规范体系

### 9.1 规范即数据

每条规范：id、意图与理由、服务的指标、级别、模式（影子 / 生效）、量法、历史。美学条款、guard 规矩、汇报规则都是规范。

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

`npm run calibrate`（`scripts/calibrate/run-calibrate.mjs`）在 `glmsandbox` 上以 headless 方式启动桌面版运行时，经按次生成的覆盖补丁启用原生通道行 `glm-hourness/glm-llm`（provider `glm-zcode`），把默认模型设为被测模型，每次运行把任务的 fixture 复制到 `.llm/calibration-runs/<时间戳>/<任务>--<模型>[--序号]/ws/` 并初始化为一个 git 仓库，以它为会话工作目录发出任务提示词，结束后运行任务的验收脚本并记分。这是真实请求，消耗积分。参数：`--tasks`、`--models`（默认 `glm-5.3,glm-5.3-flash`）、`--repeat`、`--max-steps`（默认 40）、`--minutes`（默认 15）、`--permission`。

- 任务目录：`fixture/`（一个很小的 Node 项目，无依赖，`npm test` 即 `node --test`）、`prompt.md`（原样发给模型的提示词）、`task.json`（类别与任务允许改动的文件）、`check.mjs`（验收脚本，在模型结束后以独立进程运行，断言不放进 fixture，模型看不到）。验收脚本的公共部分在 `tests/calibration/lib.mjs`。
- 现有任务：`feature-parse-duration`（小功能：给 `formatDuration` 补逆运算 `parseDuration`；验收：提示词里的例子、对 `formatDuration` 所有输出的还原、12 种非法输入抛 `TypeError`、`formatDuration` 不变、工作区测试通过且新增了 `parseDuration` 的测试、README 写了说明）；`bugfix-csv-quotes`（修 bug：引号字段里的转义引号 `""` 没有跳过第二个引号；验收：报告的那一行、另外 4 种转义写法、6 项无关行为不变、工作区测试通过且新增了测试，并且把 fixture 原来的 `src/` 放回后工作区测试会失败，即新测试确实复现了 bug）。两个验收脚本都核对过：原样的 fixture 不通过，参考解通过。
- 数据隔离：覆盖补丁把数据目录行、memory、workflow、hourness 的目录指向本次运行的目录，用量流水与违规流水都落在运行目录里，真实的 `~/.dsh/glm-hourness/` 不变；附件存储同样指向运行目录；另挂 `@deepseek-ai/dsh-workspace-changes`（桌面版 profile 有，沙盒模板没有），guard 的影子兜底照常记录。
- 权限：headless 模板的沙盒策略行与审批行读环境变量 `DSH_PERMISSION_MODE`（缺省 `workspace-write`）。运行器默认传 `danger-full-access`，与用户桌面版 profile 的默认预设一致（`danger-full-access`，审批 `never`）。首次试跑用的是缺省的 `workspace-write`：Windows ACL 沙盒下 `node --test` 派生子进程报 `spawn EPERM`，模型无法确认测试通过，转而申请沙盒升级，headless 没有审批通道，申请失败（`FACTS.md` §3）。
- 边界：覆盖层插入一行只在标定时加载的插件 `scripts/calibrate/limits.mjs`（不属于 bundle）。它对进程内全部 agent（含子 agent）的模型步数计数，第 `maxSteps + 1` 步在 `agent/pre-step` 返回 `reject`，回合以 `blocked` 结束（rc.3 `dsh-agent-loop` 961 行）；首个 agent 创建后满 `timeLimitMs`，以 `{ kind: 'hook' }` 取消所有运行中的 agent（`cancel` 815 行、取消原因 731 行），之后的步一律拒绝。运行器在时间上限之后再等 2 分钟，仍未退出就结束整个进程树。探针有两个场景验证这两道边界（`DEVELOPMENT.md` §3）。
- 事件来源：headless 的 `--json` 输出（`dsh-headless` json-stream 172 行起：`session`、`status` 的 `step_start` / `step_end` / `turn_end`、`tool_call`、`tool_result`、`text`、`final`），任务提示词经 stdin 传入。

记分口径（每次运行一份 `result.json`，整次调用一份 `results.json`，含日期、提交与工作区是否有未提交改动）：

| 指标 | 口径 |
| --- | --- |
| 完成 | 验收脚本全部通过 |
| 返工 | 一次成功的文件写入（`Write`、`Edit` 等）落在本次运行已写过的文件上，且两次写入之间跑过 shell 命令。即「改了、跑了、又回去改同一个文件」的次数 |
| 打扰人 | `approval/asked` 会话事件数（`dsh-user-approval` 132 行，交互会话里这一刻会弹审批；headless 无应答方，按拒绝处理）加 `ask_user_question` 调用数。沙盒的工具面没有 `ask_user_question` |
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

`/hourness` 的「面板」一节〔已实现 2026-10-28〕：范围是用量流水的全部记录；先列合计，再按模型列出调用次数、积分、高峰占比（高峰时段的积分占该行积分的比例）与缓存命中率（缓存命中 / 全部输入，全部输入含未命中、命中与写入），然后是不计积分的模型、修正前的记录数与无法读取的记录数。

计价服务〔2026-10-29，split 第 3 步〕：面板经 cordis 服务 `glmHournessPricing` 计积分，每次 `/hourness` 调用时读。契约（`src/shared/pricing.ts`）是首行的口径说明 `basis`、套餐名 `plan`（用在「不计积分（不在 … 内）」一行）、一次调用扣的积分 `charged(model, usage, atMs)`（模型不在套餐里时没有值）与高峰判定 `peak(atMs)`。提供方是 GLM 通道包的 `glm-login` 行，值来自 `src/glm-llm/credits.ts`，所以有服务时面板与上面写的完全相同。

- 没有服务（GLM 通道包没装，或 `glm-login` 禁用）：首行写「没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token」，合计与每个模型列调用次数、未命中输入、缓存读、缓存写、输出与缓存命中率，按调用次数排序；修正前的记录与无法读取的记录照旧只报条数（这条清洗规则按 provider id 识别，与 GLM 包在不在无关）。
- 服务的值形状不对（`basis`、`plan` 不是字符串，或 `charged`、`peak` 不是函数）：当作没有服务。只检查这四个成员，多出的成员不算形状不对。
- `charged` 或 `peak` 抛错：这一条记录计入「无法计价的记录 N 条（计价服务出错），未计入」，面板照常输出。
- 形状不对与抛错每行只在控制台告警一次。`hourness` 行的会话健康说明加「积分口径：已提供」或「积分口径：未提供，按 token 列」，状态不因此降级；`glm-login` 提供服务失败（例如同名服务已在）时激活照常、命令照常注册，行健康为部分生效并写明原因。
- 验证：L2 契约用例（`tests/contracts.spec.ts`）覆盖提供与读取、撤销后按 token 列、形状不对、抛错与提供失败；L3 探针在 GLM 场景的最后一步跑 `/hourness`，核对面板经真实的 cordis 服务按积分列出 `glm-5.3`。

尚未实现：5 小时窗口剩余、周额度、预估耗尽时间、MCP 余额。原因：5 小时窗口从服务端记录的消耗起点刷新，周期自下单日起算，用户档位也未记录（`FACTS.md` §2.4）；用量流水只看得到经 DSH 发出的请求，同一账号在 ZCode 等其他客户端的消耗看不到，本地算出的剩余量会偏高。这几项等通道取数（`DESIGN.md` §4.7）。

### 11.4 提醒与排期

- 进入高峰时提醒 LLM〔已实现 2026-10-28，`ROADMAP.md` M6.1〕。提醒属于 GLM 通道包：正文讲的是 GLM 的积分，高峰时段取自 `src/glm-llm/credits.ts` 的 `peakWindowAt`；编排层不另做通用的高峰提醒。实现在 `src/glm-prompt/peak-reminder.ts`，由 `glm-prompt` 行装在每个 agent 上，与 todo 提醒、工具检索公告用同一个接缝（`agent/pre-step`，本步组装之后、请求之前）。规则：本步是 GLM 路由，此刻处在某个高峰时段，且请求可见历史（`session.deriveMessages()`）里没有这个时段的提醒，就在本步已接纳的消息之后追加一条 `<system-reminder>` notice（来源 `glm-peak-reminder`，`source.peakWindow` 记这个时段的 UTC+8 日期）。效果：会话在高峰中开始，或上一步在高峰之前，都只提醒一次；之后同一时段的步不再提醒；次日的高峰再提醒一次。状态在会话里，不在内存里，所以续跑与重启后不重复；压缩把这条 notice 移出可见历史后，同一时段的下一个 GLM 步会再提醒一次，因为模型已经看不到它。非 GLM 路由永远不提醒；同一步里它排在 todo 提醒与 deferred 公告之前。时间经可注入的时钟读取（默认 `Date.now()`），单测用假时钟。
- 提醒正文（本项目的文本，不是 ZCode 原文，不在镜像文件里）：

  ```text
  Peak hours have started (weekdays 14:00-18:00 UTC+8). Until 18:00, GLM usage is charged at the full credit rate; outside peak hours it costs half. This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.
  ```

- 提醒只告知：不换模型、不换套餐、不拦截、不推迟任何工作。
- 验证：L2 用假时钟覆盖跨入高峰、高峰中开局、同一时段不重复、次日再提醒、周末、非 GLM 路由、空首步、续跑会话、与 ZCode notice 的先后（`tests/reminder-wiring.spec.ts`）。L3 探针用只存在于覆盖层的时钟行（`scripts/probe/probe-clock.mjs`，把运行时的 `Date.now()` 平移到周三 15:00 UTC+8）：第一个 GLM 请求带恰好一条提醒，之后的请求仍只带这一条；同一时钟下的非 GLM 会话没有提醒；按真实时钟运行的 GLM 场景，提醒条数与各请求所在的高峰时段一致（夜间运行时为 0）。
- 排期功能要有：可把不急的重活（批量测试、巡检、大范围重构）用 DSH 定时提醒排到谷段。高峰期排不排、排哪些，到时候由用户决定〔定案〕。交互中的任务不动，模型与套餐不自动更换。尚未实现。
- DSH 定时提醒 `schedule` 的边界〔实读〕：`schedule.create(sessionId, { prompt, title, at | after_seconds | every_seconds | daily | weekly | cron })`（`dsh-schedule` 2083 行）。提醒只投递到创建它的会话，不支持每次新开会话（`dsh-schedule/README.md` 157 行）；宿主必须在运行，投递失败不自动重试，等下一次唤醒、任务变更或宿主重启（153 行）；`every_seconds` 至少 60 秒；子 agent 的会话拒绝创建。到期时投递的是一条用户角色的提醒消息（来源 `{ kind: 'schedule' }`，lib 1594 行），工作由那个会话的 agent 执行。所以排期与巡检用一个固定的运维会话〔规划〕。
- 不设预算约束，花费只披露（§4.3）。

## 12. 运维与晨报

- 巡检：仓库卫生（死代码、重复、过期文档）、图卫生（陈旧节点、无证据的完成）、记忆卫生、依赖与安全更新、指标周报。由 DSH 定时提醒在固定的运维会话里触发（提醒只投递到创建它的会话，§11.4），结果进晨报或决策卡。提醒消息的来源不是 `user`，`dsh-tool-goal` 要求当前回合有人直接发的消息才执行的操作（`create_goal`，`update_goal` 的编辑、暂停、恢复）不会因它而执行。本仓库的依赖与安全更新取 `npm run deps:check` 的输出，处理规则见 `DEVELOPMENT.md` §11：补丁与次版本升级过全部门禁、一次一个提交，主版本升级交给用户，`@deepseek-ai/*` 随桌面版运行时升级。
- 交付指标（DORA）：交付频率、变更失败率、恢复时长。
- 事故：生成无责复盘节点，再变成规范进入阶梯。
- DSH 升级：先跑标定测试集与行为探针。
- 晨报按四答对账：目标完成了多少、哪里偏离了规划、做过哪些计划外决策及理由、待批决策卡、花费（积分、峰谷占比）、测试与知识同步状态。晨报遵守汇报细度，带「讲细点 / 说重点」按钮。

## 13. 呈现

风格贴近 DSH 原生〔定案〕。用 DSH 的基础组件库 `ui-primitives`：壳层的客户端模块表里有 `@deepseek-ai/dsh-client-ui-primitives`，第三方静态包可以 `require`（`dsh-web-frontend` 的 `index-BXV-oxvX.js` 中 `OZ()`，与 DSH 主干 `packages/client/web/src/platform.ts` 一致）〔实读 2026-10-28〕。组件名以 rc.3 官方包实际用到的为准：`Button`、`Modal`、`Menu`、`Tooltip`、`Switch`、`SegmentedControl`、`Pill`、`Tag`、`StateDot`、`MarkdownText`、`CodeBlock`、`DiffBlock`、`JsonTree`、`DisclosureRow`、`SettingsForm`、`Toast` 与一组 `Icon*`。颜色用 DSH 主题 token `--dsw-*`。上一版不被接受的原因判断为照着颜色变量手搓组件。

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

项目图的落点〔已实现 2026-10-28，§2.10「DSH 原生面板」〕：原生右侧栏页面类型，不经 Browser 标签页打开网页（用户不要网页形态）。读经 `remote.workspaceFiles` 读节点文件并订阅变更，写经命令 `/graph-apply` 进入宿主侧的引擎，人和 LLM 的改动走同一套校验。本机查看器与服务在面板可用后删除（`m2-10`）。

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
| guard 影子兜底 | `workspace-changes` 的回合摘要（已接入 2026-10-28，接口见 `DESIGN.md` §2.4a） | 与文件工具目标比对、影子记录（§6.5.2） |
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
| 图文件门禁细则 | agent 定（按原型）（§2.7）：规则由图行注册、跟图行一起启停，排在 guard 行之前判断；拦整个图目录（含 `graph.svg`），图目录不存在时也拦；shell 命令沿用 file-tools-only 对写文件的判断，再看命令文本是否提到图目录；直接拦截，不先走影子模式；拒绝暂不进违规审计（M1.4 的流水已随 main 合入本分支，接入是合入后的跟进项）。备选：规则放进 guard 行（违规审计与行健康现成，代价是 guard 行要另配图目录，图行禁用时也拦，被拦的一方没有图工具可用）；只拦 `nodes/`（`graph.svg` 可以手改，代价是图片与节点文件可能不一致，新鲜度测试会失败）；先影子模式只记录（要先有 M4 的机制）。推荐按原型：门禁与正路同在一行，开关一致 |
| 查看器细则 | 已删除（2026-10-28，`m2-10`）：查看器随原生面板上线删除，原来的细则在提交 `25d1bae` 的本文 |
| 本项目图的迁移写法 | agent 定（按原型）（§2.13）：用户已定案的内容以 `human` 写入，理由以「迁移：」开头并写出处，其余以 `llm` 写入；历史时间取写入时刻。备选是全部以 `llm` 提议、由用户在查看器里逐个批准，代价是批准之前整张图都是虚线，M1 条目也标不了完成 |
| 合入后进度记在哪里 | 定案 2026-10-28（§2.13）：只记在图上，`ROADMAP.md` 只留里程碑与验收 |
| 面板的界面测试 | agent 定（2026-10-28）：查看器页面随原生面板上线删除，原题作废。面板用 Node 自带的 WebSocket 经 Chrome DevTools 协议驱动 DSH 桌面端核对（截图、DOM、点击），不新增依赖；要启动桌面端，不进每次的 `npm test`，作为面板改动的验收步骤 |
| 查看器在 DSH 里的落点 | 定案 2026-10-28（§2.10、§13）：原生右侧栏面板，M2 做，不经 Browser 标签页打开网页 |
| 草稿区位置 | 工作区内通用目录，汇合门禁检查 |
| 小改动简报的简化形态 | M7 设计 |
| 审查 agent 的模型档位 | M7 设计 |

## 16. 规则板（最小一片）〔已实现 2026-10-30，L2、L3；行默认禁用，桌面版首轮验收未做〕

完整设计是 `.agents/tasks/rules/design.md`（不入库，版本 0.10，评审通过、人放行）。自举之前只做其中的一片（项目图 `d-rules-peak-slice`，设计 §16.1）：每个项目一个由人选的高峰模式档位，加少做档的并发上限，经一个服务交出。这一片是整块设计的子集：整块规则板以后往同一批文件里添加，不改写、不删除这一片写下的任何东西。发给模型的高峰提醒与它在各档下的措辞见 §11.4（GLM 通道包），规则板不碰。

### 16.1 档位与上限

- 三档：无影响（`inform`，只提醒）、少做（`reduce`，出厂默认，`d-peak-mode`）、不做（`stop`）。档位按项目存，只有人能改（§16.4）。三档只在 GLM 高峰时段里起作用：此刻是不是高峰读 GLM 包的计价服务（`glmHournessPricing.peak`，`src/shared/pricing.ts`），规则板不带时段表。读不出（没有计价服务、`peak` 抛错或返回的不是布尔值）时三档都不起作用，`PeakModeState.peak` 为 `undefined`，不带上限与挡住的标记；同一条警告每个宿主进程只出一次。
- 少做的并发上限：同一时间在跑的、经 `dispatch_task` 派出且模型为 GLM 的子 agent 至多 1 个（写任务、审查、检查都算），常量 `PEAK_REDUCE_GLM_WORKERS`。数归规则板，执行归派活（M7）：派活在派模型为 GLM 的子 agent 之前读一次 `stateFor(<主 Agent 的会话>)?.glmWorkerCap`，有值就照它数在跑的 GLM 子 agent，没有就照自己的槽位；派活不加别的高峰逻辑。这一片不含派活，所以上限现在只是服务里的一个数。
- `glmWorkerCap` 只在 `peak === true` 且档位为少做时有；`peakHoldFor` 只在高峰里、结束时刻读得出、档位为少做或不做时有值（`{level, until}`，与同一时刻 `stateFor` 的档位和结束时刻一致）。两者由 `src/shared/peak-mode.ts` 的 `peakModeState` 与 `peakHoldOf` 一处算出。这一片没有等待单，不做档的 `peakHoldFor` 对所有会话一视同仁（整块规则板的「本次高峰照常做」只改 GLM 子 agent 的单）。
- 主 Agent 不受高峰模式影响（`d-main-agent-peak-exempt`）：行只监听 `agent/created` 与 `session/disposed`，不注册工具调用门，不在 `agent/pre-step` 里动消息，不暂停 goal；`peakHoldFor` 有值说的是它派 GLM 子 agent 与跑重活脚本的那部分活被挡着，规则板自己什么都不拦。这一片不排队、不暂停，三档下没有任何调用被拦。

### 16.2 服务

规则行提供 cordis 服务 `glmHournessPeakMode`，契约在公共库 `src/shared/peak-mode.ts`（GLM 包不能导入 `src/rules/`，所以契约放在两个包都编进去的地方；方向与计价服务相反：编排层提供，别的行读）。`peakModeService(ctx, problem)` 是读取函数：服务不在时为 `undefined`，成员类型不对时为 `undefined` 并回调 `problem`。

| 成员 | 给什么 |
| --- | --- |
| `stateFor(sessionId)` | 会话所属项目此刻的 `PeakModeState`：`level`、`origin`（`default` 或 `human`）、`at`、`peak`、`until`、`glmWorkerCap`。只读内存与计价服务，不抛错；会话不在本宿主上、没有工作目录或不在项目里时为 `undefined` |
| `stateForProject(cwd)` | 同上，按目录，给不在本宿主上的会话用；不写文件；项目状态读不出（读文件抛错）时为 `undefined`，不冒充出厂默认 |
| `peakHoldFor(sessionId)` | 见 §16.1 |

会话的工作目录来自 `agent/created` 与 `/rules` 的调用参数，会话结束（`session/disposed`）时忘掉；登记里没有的会话再问宿主的 `agents` 服务（行在运行中途启用时仍然答得出）。读它的各方在用的那一刻读一次，不缓存：档位改了，下一次派活和下一条提醒就按新的走。行卸载时服务随 `ctx` 撤回，读的一方按读不出处理。

### 16.3 存放

按项目，规则板不写任何用户级的文件（`d-rules-in-repo`）。项目根按会话头的 `cwd` 往上找 `.git`，git 工作树经 `commondir` 回到主检出，所以主检出与它的工作树是同一个项目（`projectOf`、`gitDirOf`，在 `src/data/project-root.ts`，只读文件，不起 git 进程；它不是规则板专用的：仓库里只有这一份项目根的算法，M5 的数据目录与其他板块直接用它，不再写第二份）；不在 git 仓库里时只认已有 `.llm/` 的目录，用户主目录与盘符根永远不是项目。

| 位置 | 内容 | 进 git |
| --- | --- | --- |
| `<项目根>/docs/rules/rules.json`（行配置 `dir` 可改，相对项目根或绝对） | 人定的部分：目前只有 `peakMode`（`{level, at, origin}`）。键按码点排序、两个空格缩进、换行结尾；人选过档位之后才有这个文件 | 是 |
| `<项目根>/.llm/rules/journal.jsonl` | 流水，事实源，只追加；每条记录带它写出的状态的摘要 | 否 |
| `<项目根>/.llm/rules/state.json` | 状态快照，流水推出的缓存 | 否 |
| `<项目根>/.llm/rules/repo-written.json` | 规则板最近一次写成的 `rules.json` 的摘要，用来分清「规则板欠一次写」与「别处改了它」 | 否 |
| `<项目根>/.llm/rules/rules.lock` | 写锁 | 否 |
| `.state.json.pending`、`.state.json.replaced-<时刻>`、`.journal.corrupt-<时刻>`、`.rules.json.outside-<时刻>` | 改名失败留下的新快照；恢复时被替换的旧快照；有读不出的行时整份复制的流水或截掉的末行；被规则板以外改过的 `rules.json` 的原样副本 | 否 |

`.llm/` 要在项目的忽略文件里：本仓库的 `.gitignore` 有它；别的项目里把它加进 `.git/info/exclude` 是 M5 的项目目录（`ensureIgnored`）做的事，这一片没有做。

- 写：`openRulesBoard({projectRoot, rulesDir}).apply(actor, request)`（`src/rules/engine.ts`）是唯一的写入口。顺序：核对身份（`src/rules/permissions.ts`，`peak-mode-set` 只给 `human`，其他身份得 `forbidden` 和怎么做）与请求形状，取写锁（`wx` 创建，持有者不在或超过 10 秒的锁被接手，等 2 秒仍取不到得 `busy`），先把读到的待办落实（恢复、从规则文件开始、欠的写），核对修订号 `rev`，规划（时钟与文件系统相关的决定都在这里做完、写进记录的 `changes`），再确认锁还是自己的，追加流水并 `fsync`，原子替换快照（改名遇 `EPERM`、`EBUSY` 按 20、40、80、160、320 毫秒重试，仍失败留下 `.state.json.pending`），最后导出 `rules.json`。同一档位的重复选择不写任何东西。
- 状态只经 `applyRecord(state, record)`（`src/rules/store.ts`，纯函数，不读时钟、文件与进程表）改变，写入与重放走同一个函数。重放逐条核对摘要：缺字段或摘要对不上的行（引擎以外追加或改过的）不生效、列入 `unresolved`；读不出的行把链断开，之后的记录不生效，直到一条带完整状态的 `base` 或 `recovered` 记录作锚点。快照清零、截断、被改，流水被截短或最后一行没写完，都按流水重建，旧快照原样另存；重建的结果与出事之前的状态摘要相同（`tests/rules-store.spec.ts` 的性质测试，5 个种子）。
- 读不取锁、不写文件（`loadState`、`readProject`）；落实待办的是持锁的 `settleLocked`，在会话创建与每次 `/rules` 时由行调用。读者碰上写入者在追加与改名之间时，在内存里重放得到新状态，持锁重读后发现已一致就什么都不写。
- 仓库里的规则文件（`src/rules/repo.ts`）：判定按流水，不按文件，因为 git 的切换、合并、回退和脚本都能换掉它。规则板写成之后文件被别处改了（摘要与 `repo-written.json` 的一致、与状态的不同），改动不生效，原样副本另存，差别记进状态（`repo.outside`），行健康写明；文件又改回规则板写的那一份时自己清掉。项目还没有自己的流水与快照（新克隆、换电脑、删了 `.llm/`）而文件里有决定时，状态从文件开始，写一条 `base` 记录。git 正在合并、变基、拣选、二分或持有索引时（`MERGE_HEAD`、`REBASE_HEAD`、`CHERRY_PICK_HEAD`、`rebase-merge`、`rebase-apply`、`BISECT_LOG`、`index.lock`）不写仓库里的文件，档位照流水生效，文件在 git 做完之后的下一次落实时写。规则板不提交、不暂存、不切分支。
- 状态里没有设计里的 `root` 字段：摘要要是覆盖项目路径，文件夹改名或搬家之后所有记录都对不上。整块规则板往状态里添字段时，读到旧快照要在核对摘要之后再补默认值，否则这一片写下的记录重放不过。

### 16.4 命令

`/rules peak [无影响|少做|不做]`（也认 `inform`、`reduce`、`stop`），由 `glm-hourness/rules` 行注册；斜杠命令只有人能发，所以身份固定为 `human`。不带档位回现在的档位、来源（出厂默认，或「你在 HH:MM 选的」）、此刻是不是高峰与到几点，后面接三档的说明（`peakModeIntro`）；带档位就改，回一行并说明这一版只记档位、没有排队和暂停。其他子命令回用法。回话里的时刻按本机时区。人在对话里让主 Agent 改档位的路（`rules_propose` 与 M3 的 `propose_to_human`、`record_human_answer`）依赖 M3 第 6 步，不在这一片里；命令是现在唯一的改法，所以 `peakModeIntro` 只写命令。

### 16.5 行健康与降级

行 `rules` 在 `HOURNESS_ROWS` 里，按会话上报（`src/rules/row-health.ts`）：项目名、档位与来源、此刻是不是高峰（读不出时写原因，不降级：只装编排层包是支持的组合）。部分生效的情形：`/rules` 没注册上、服务没提供上、会话事件没注册上、会话不在项目里、存档与流水对不上或有没生效的记录、仓库里的规则文件读不出或被改过、读状态失败。`config.dir` 不是路径时未生效。激活期不抛错。读状态失败只让这一次读不出，不影响别的会话。

### 16.6 这一片没有做的

整块规则板的其余部分，写下的代码按它们能直接加进来的形状留着，没有留空桩：规则页与面板、人加的规则与检测器、脚本与脚本执行器、工具调用门里的拦截、等待单与排队、违规流水的新记录、`checkCall` 与命令行、指标事件、`rules_show` 与 `rules_propose`、默认规则 `GLM_PEAK_PRICING` 与按档位启用的附属条目（没有判定它们的门，没有调用方）、`/rules recovery`（没有生效的记录与被改过的规则文件只能列出：要清掉，删 `.llm/rules/` 让规则板照仓库里的文件重新开始，或再选一次档位让它按流水重写文件）、流水轮换、宿主心跳与 `hits.json`、`RulesService`（`glmHournessRules`）、对话里改档位的提议一路、高峰结束时叫醒主 Agent（循环板）与高峰里停住自动推进（M7）。

### 16.7 验证

L2：`tests/peak-mode.spec.ts`（共用契约：上限与挡住的标记、读取函数、文字、`nextPeakChange`）、`tests/rules-model.spec.ts`（`effectivePeakMode`、序列化、规则文件、状态校验）、`tests/rules-store.spec.ts`（设计 §7.5 表里每一种情形、性质测试、锁、两个进程同时写、规则文件的各种情形与 git 操作）、`tests/rules-engine.spec.ts`（权限、请求校验、修订号、写入的产物、`busy` 与 `io`、项目根）、`tests/rules-row.spec.ts`（假宿主上的行：命令、服务、健康、不挡任何调用、激活期降级、补丁里默认禁用）。L3：`npm run probe` 的场景 `rules-peak`（GLM 与编排层两个包，平移到周三 15:00 UTC+8 的探针时钟，临时 git 工作区：出厂档位、`/rules peak 不做`、`/rules peak 无影响`，每步经真实的 `/rules` 处理函数与服务读回状态）与 `rules-peak-hourness`（只装编排层包：没有计价服务，没有上限与挡住的标记）。L4（桌面版重启后核对）未做，行保持禁用。
