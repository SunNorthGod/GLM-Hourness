# 注入文字清点与整理建议（项目图 `prompt-audit`）

日期 2026-10-29。基线：main `9f002ab`；split 分支 `40190cf`（`.worktrees/split`，第 0–6 步）。只读调查：没有改代码、`docs/graph` 与 `~/.dsh`，没有跑标定。

## 0. 结论

回答用户的问题「人设、条件要不要融合进系统提示词」：不要整体融进去，按内容的性质分开放。

1. ZCode 有原文的，逐字放在 ZCode 的位置。现状缺一节：ZCode 3.16.3 的 Dynamic Behavior（3,065 字符，以 `# Communicating with the user` 开头）在 coding-plan 方言里没有，start-plan 通道（`src/glm-llm/start-plan.ts`）却发了它；DESIGN.md §5.3 的本地化清单与 §5.8 的差异表都没有记这一节。
2. 不变的、本项目加的文字（主 Agent 的角色、主 Agent 的人设与汇报方式、规矩的一句总声明）进系统提示词，用 ZCode 已有的槽位：人设与汇报方式对应 ZCode 的 Output Style 槽位（`# Output Style: <name>` 加正文，身份开头句换成 `IDENTITY_OPENING_WITH_STYLE`，这句原文已在 `src/glm-prompt/verbatim.ts`），并且只给需要的会话。今天 `glm:persona`、`glm:memory` 与 13 个图工具在 GLM 子 agent 里也全部出现。
3. 会变的状态（项目图投影、设计阶段、生效的规则、高峰、todo）走对话末尾的 `<system-reminder>`。这一条现状已经守住：会话内系统提示词逐字节不变（截包 8 步都是 9,058 字符），所有 notice 都只追加在末尾。
4. harness 会执行的规矩只留一句总声明，细节由拒绝信息教。现状里「用专用文件工具、别用 shell 写」在 GLM 的系统提示词和工具说明里静态出现 4 处，「图只经图工具改」出现 3 处（其中一处随每次投影重复）。
5. 步骤性的做法（八步访谈、各阶段该做什么）随阶段提醒与设计工具的返回下发，不放进系统提示词。M3 设计的主 Agent 身份节上限 9,000 字符，与阶段提醒、`glm:persona` 有重复。

体量：GLM 主 Agent 的首个请求里，两个插件放进的文字约 34.5k 字符（约 9.9k token），占桌面版实测首个请求输入（18.1k–18.5k token）的一半多；13 个图工具的说明与 schema 就有 13,802 字符（约 3.9k token，约占 22%）。非 GLM 会话约 15.0k 字符，split 第 7 步（question-14 G3）后约 15.8k。

可靠度：长度是加载 `src/` 实算的；位置与路由是读代码并对照 2026-10-29 的 L3 探针请求核实的；token 是按实测比值换算的估计。没有任何一段非 ZCode 文字经过标定检验。现有两道标定任务已饱和（12/12 完成），只能量出步数、积分、返工的变化，量不出 3% 量级的质量差。消融方案见 §8，分两期，估计 1,100–2,000 积分（非高峰）。

另有三处宿主事实不对，与原则无关，属于缺陷：

- `glm:environment` 的工作目录取自 profile 配置。桌面版钉在 `C:\Users\29596\Desktop\Project\GLM-Hourness`，在别的项目里开会话也这么写。
- DSH 的 `tool:read`、`tool:write`、`tool:edit`、`tool:glob`、`tool:grep` 节在 GLM 路由上照常渲染，点名的原生工具在 GLM 工具面上已被别名遮住（DESIGN.md §5.1 要求宿主事实与实际一致）。
- guard 拒绝信息的「例外」段（`src/guard/rules.ts` `APPLICATION_PROTOCOL`）让模型「file a request」，没有任何工具或通道能提交（M3 设计 §3.5.1 也记为缺口）。

## 1. 方法与依据

- 实读：`src/glm-prompt/`（`index.ts`、`assembly.ts`、`identity.ts`、`verbatim.ts`、`localize.ts`、`persona.ts`、`step-notice.ts`、`todo-reminder.ts`、`peak-reminder.ts`、`compact.ts`、`compact-row.ts`、`zcode-tool-text.ts`），`src/toolsearch/`，`src/guard/`，`src/graph/`（`reminder.ts`、`tools.ts`、`run-control.ts`、`index.ts`），`src/memory/tools.ts`，`src/workflow/index.ts`，`src/glm-llm/start-plan.ts`、`zcode-system.ts`；split 的 `git diff main...split`（guard、glm-prompt、toolsearch、graph 相关文件）与 `.agents/tasks/split/design.md`；`.agents/tasks/m3/design.md`；`.agents/tasks/rules/design.md`；图节点 `orch`、`question-14`、`question-26`、`question-27`、`question-28`、`m3-1`、`m3-main-persona`、`d-recommend-last`、`d-failure-plans`、`risk-calib-read`。
- 实测：L3 探针 `.llm/probe-runs/2026-10-29T03-45-50-008Z/*/requests.jsonl`（探针 provider，不花积分）的首个请求：系统提示词全文、工具清单与各自 JSON 长度、消息来源；截包 `.agents/tasks/cache-2026-10-28/runs/tap-1793168439212/{1,2}/bodies/` 与同目录的用量流水；`~/.dsh/glm-hourness/audit/usage.jsonl`（只读）里 2026-10-28 之后桌面版 GLM 会话的首个请求。
- 字符数：用 node 22 加载 `src/` 的常量与构造函数实算。token 是估计：截包里整条请求 41,758–51,534 字符对应 12,178–14,746 token，比值 3.43–3.52，下文统一按 3.5 字符/token 换算；中文多的文字（汇报细度、投影里的节点标题与验收、运行控制消息）中文部分按约 1.3 字符/token，标「中文多」。
- ZCode 对照：`reference/ZCode` 源码（3.16.2）`context/builder.ts`、`dynamic-sections.ts`、`sections/*.ts`，与本机 3.16.3 安装包 `C:/Program Files/ZCode/resources/glm/zcode.cjs`（用户补丁版，只看机制；补丁只在安全声明与 `__ZC_DECL` 一处）。Dynamic Behavior 的文字在安装包 @5052417（`N0o`）、源码与本仓库 `ZCODE_SYSTEM.dynamicSections.beforeEnvironment` 三处一致，都是 3,065 字符。
- 没有核实：设计稿里的文字还没写成代码，长度按设计稿的上限或示例估；DSH 命令的结果文本是否进入模型可见的历史没有查；`src/workflow` 与 `src/ui` 没有找到给模型的文字（只写流水、只回人）。

## 2. ZCode 3.16.3 的提示词骨架（对照用）

安装包 `Fje.build`（@~5057900）的组装次序：

1. `cli_prefix`：`You are ZCode, an interactive coding agent`，单独一块。
2. Agent Identity（stable）：开头句、安全声明、`# Harness`。有 Output Style 时开头句换成 `You respond to the user according to the active Output Style below while using ZCode's tools and instructions.`。工作流子代理换成 Workflow Actor Identity（`# Working inside a workflow`，作者写的 persona 叠在开场句之后、契约之前）。
3. dynamic：[Desktop Context] → Dynamic Behavior → Session-specific guidance（只在有 `Skill` 工具且有技能时出现）→ Memory → Environment（含 `- You are powered by the model named <provider>/<model>.`）→ Output Style（激活时）→ Context management → gitStatus。
4. meta_user（用户消息，`<system-reminder>` 包裹）：技能清单；`# agentsMd`（「Codebase and user instructions are shown below. … IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.」）加记忆索引；当前日期。
5. 对话中：`todo_reminder`、deferred 名单公告等附件，`<system-reminder>` 包裹。

与本项目问题直接相关的两个 ZCode 槽位：Output Style（怎么跟人说话），Workflow Actor Identity（子代理的角色与契约，persona 叠在里面）。

## 3. 清单

### 3.1 系统提示词（main，GLM 路由，按实际渲染次序）

桌面版配置：`tier: coding-plan`、`skills: true`、配了 `env`、图行与记忆行启用、`toolSearchMode` 缺省 `local`。

| # | 节名（标题） | 源文件与符号 | 谁看到 | 字符 | 约 token | 逐步变化 | ZCode 对应 | 性质 | 要求汇报或计划 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `glm:cli-prefix` | `src/glm-prompt/verbatim.ts` `CLI_PREFIX` | GLM 路由上方言装上的所有 agent（主与子） | 42 | 12 | 不变 | 逐字（门禁覆盖） | 身份 | 否 |
| 2 | `harness:identity`（同名替换 DSH 的 `You are an AI agent powered by DeepSeek Harness.`） | `identity.ts` `buildIdentitySection`；`verbatim.ts` `IDENTITY_OPENING_PLAIN`、`SECURITY_NOTICE_USER`；`localize.ts` `HARNESS_BLOCK_DSH` | 同上 | 2,318（安全声明 1,549，Harness 块 681）；start-plan 档 1,210 | 660 | 不变 | 开头句与 Harness 块逐字，Harness 第 1 条本地化（terminal 改为 DSH Web GUI）；coding-plan 的安全声明是用户自己的 ZCode 补丁（`docs/reference/zcode-verbatim.md` §1a），不是 ZCode 原文 | 身份与宿主事实 | 否 |
| 3 | `glm:environment`（`# Environment`） | `localize.ts` `buildEnvInfoSection`；值来自 profile 的 `glm-hourness/glm-prompt` `config.env` | 只有配了 `env` 才有：桌面版有，探针与标定没有 | 222 | 63 | 不变；按 profile 固定，不随会话目录 | ZCode Environment 的骨架；ZCode 放在 Memory 之后，这里紧跟身份节；模型行没配（`modelLine`） | 宿主事实 | 否 |
| 4 | `glm:persona`（`# Reporting Depth`） | `persona.ts` `personaSection`，配置 `persona` | 同 1，含子 agent | 401（中文多） | 约 155 | 不变 | 无原文；同类槽位是缺失的 Dynamic Behavior（`# Communicating with the user`）与 Output Style | 要求 | 是：规定每次对人回复的汇报结构（结论、影响、理由、岔路） |
| 5 | `glm:session-guidance` | `localize.ts` `SESSION_GUIDANCE_DSH`，`skills: true` 时加 `SKILLS_NOTE_DSH` | coding-plan | 161；加技能一行 268 | 46 / 77 | 不变 | 本地化（清单 ②⑤）；ZCode 没有技能时不出这一节，这里总出 | 要求 | 否 |
| 6 | `glm:memory`（`# Memory`） | `localize.ts` `MEMORY_SECTION_DSH` | coding-plan，含子 agent | 883 | 252 | 不变 | ZCode Memory 节的骨架，写入纪律改写（清单 ⑧） | 要求，另声明一条会执行的规矩（「memory_store refuses such entries」） | 否 |
| 7 | `glm:context-management` | `localize.ts` `CONTEXT_MANAGEMENT_DSH` | coding-plan | 1,915 | 547 | 不变 | 逐字（门禁覆盖） | 要求 | 反方向：最后一段若是计划就去做，不以计划收尾 |
| 8 | DSH 的 `tool:*` 节与模型行（宿主文字，方言放行） | DSH 包 `tool-pwsh` `tool:pwsh`，`tool-fs` `tool:read`、`tool:write`、`tool:edit`，`tool-fs-search` `tool:glob`、`tool:grep`，`tool-jobs` `tool:jobs`，`tool-web` `tool:web_search`、`tool:web_fetch`，`tool-goal` `tool:goal`，workflow 与 subagent 各一节 | 所有路由 | 约 2,700 | 约 770 | 不变 | 无；点名的 `read`、`write`、`edit`、`glob`、`grep` 在 GLM 工具面上被别名遮住，`job_output`、`job_kill`、`web_*`、`create_goal`、`update_goal` 被延迟 | 要求 | 否 |
| 9 | `glm:guard`（`# Workspace rules`，最后一节） | `src/guard/index.ts` `declarationSection`；`rules.ts` `workspaceContainment` 与 `fileToolsOnly` 的 `declare`；`src/shared/graph-service.ts` `GRAPH_FILES_DECLARATION` | main：只 GLM 路由，含子 agent；split 第 7 步后所有路由 | 646；图行在时 732 | 209 | 不变（只随会话目录与图行加载变） | 无原文；ZCode Harness 块已有泛泛一句「Tools run behind a user-selected permission mode … Hooks may intercept tool calls」 | 声明会执行的规矩 | 否 |
| — | ZCode Dynamic Behavior（缺失） | ZCode `N0o`；本仓库只在 `src/glm-llm/zcode-system.ts` `dynamicSections.beforeEnvironment`（start-plan 用） | coding-plan 上没有人看到 | 3,065 | 876 | — | 逐字可得 | 要求 | 是：首个工具调用前用一句话说要做什么，途中简短更新；另有「Lead with the outcome」「Report outcomes faithfully」、注释卫生、难撤销操作先确认 |

次序：DESIGN.md §5.2 的节表写的是 `glm:session-guidance` 2300、`glm:memory` 2350、`glm:persona` 2360、`glm:context-management` 2400。代码不看 `order`：`src/glm-prompt/assembly.ts` `rewriteDialectSections` 按 `dialectSections()` 数组的先后把其余方言节插到身份节之后，数组里 `personaSection` 排在 `glm:session-guidance` 之前。2026-10-29 探针 `glm` 场景的实际标题顺序是 `# Harness` → `# Reporting Depth` → `# Session-specific guidance` → `# Memory` → `# Context management` → （DSH 节）→ `# Workspace rules`。

小计：插件放进系统提示词的 6,781 字符（约 1.98k token）里，ZCode 逐字 2,042（前缀、开头句、Context management），ZCode 骨架本地化 2,054（Harness 块、Environment、Session guidance、Memory），用户自己的安全声明 1,549，本项目自己的 1,133（`glm:persona`、`glm:guard`）。

### 3.2 对话末尾的 notice

| # | 来源标签 | 源 | 何时注入 | 谁看到 | 字符 / 约 token | ZCode 对应 | 性质 | 包装 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | `glm-tool-search` | `src/toolsearch/index.ts` 的 `agent/pre-step` 监听器；`zcode-text.ts` `renderToolSearchAnnouncement` | 会话第一个 GLM 步；之后 deferred 名单有增、恢复、移除时 | GLM，`toolSearchMode: local` | 418（13 个名字）/ 120 | 逐字（`Lla`、`Ggt`） | 告知 | `<system-reminder>` |
| 11 | `glm-todo-reminder` | `todo-reminder.ts` `buildTodoReminderBody` | 距上次 TodoWrite 与上次提醒都不少于 10 个 GLM 助手轮 | GLM，工具面有 TodoWrite | 无回显 421；三条回显 603 / 120–170 | 逐字（`z4o`，门禁覆盖） | 软提醒 | 同上 |
| 12 | `glm-peak-reminder` | `peak-reminder.ts` `PEAK_REMINDER_TEXT` | 每个高峰时段里第一个 GLM 步 | GLM | 336 / 96 | 无原文（ZCode 没有本地高峰窗）；位置同 ZCode 附件 | 告知，并要求「不要换模型或套餐、不要暂停或推迟」 | 同上；没有 ZCode 公告里的「This is ambient context — do not narrate it to the user …」一句 |
| 13 | `glm-graph-projection` | `src/graph/reminder.ts` `renderProjection` | `graph_focus` 之后：焦点变、正文摘要变、压缩之后、goal 轮 | 所有路由；调过 `graph_focus` 的 agent，含子 agent | 本仓库图实测 496（`prompt-audit`）、976（`m3-1`）、1,423（`m3`）、2,530（`orch`）；中文多，约 150–970 | 无原文；位置同 `todo_reminder` | 告知，开头一句兼声明规矩（「change the graph only through the graph tools」） | 同上 |
| 14 | `glm-graph-run` | `src/graph/run-control.ts` `startLines`、`redoLines` 与暂停消息 | 人在面板上点开始、暂停、重做 | 发起命令的会话的主 Agent，所有路由 | 约 150–600，中文 | 无 | 要求（先 `graph_focus`、开工用 `graph_status` 标 doing、「标完成要带证据」） | 普通用户消息（`followup`、`inject`），没有 `<system-reminder>` 包装 |
| 15 | LocalToolSearch 结果里的 Loaded / already-available 提醒 | `zcode-text.ts` `localToolsLoadedReminder`、`localToolsAlreadyLoadedReminder` | 工具结果里 | GLM | 270 起 | 逐字 | 告知 | 同上 |

缓存：这些 notice 都追加在本步已接纳的消息之后，前缀不变（DESIGN.md §6，§4.5b 实测只追加）。它们写进会话、留在历史里，直到被压缩。投影每次重注都留下一份副本：一个长会话里图上子节点状态多次变化，就有多份 1–2.5k 字符的副本，每份第一次按普通输入计费，之后按缓存命中计费。

### 3.3 工具说明与 schema

| 组 | 源 | 谁看到 | 字符 | 约 token | ZCode 对应 |
| --- | --- | --- | --- | --- | --- |
| ZCode 别名 `Bash`、`Grep`、`Edit`、`Read`、`Write`、`Glob` | `src/glm-prompt/zcode-tool-text.ts`、`read-alias.ts`、`search-alias.ts`、`aliases.ts` | GLM，所有 agent | 9,641（2,816、2,253、1,430、1,308、1,105、729） | 2,750 | 逐字或本地化（Grep、Bash，DESIGN.md §5.4） |
| `TodoWrite` | 同上 | GLM；延迟，检索后才进上下文 | — | — | 逐字 |
| `LocalToolSearch`、`DeferredToolCall` | `src/toolsearch/zcode-text.ts` | GLM | 2,666 | 760 | 逐字 |
| `graph_*` 13 个 | `src/graph/tools.ts` `graphTools`、`WRITES` | 所有路由、所有 agent；GLM 上按项目决定常驻（ZCode 的规则下，没有 ZCode 对应物的工具应延迟） | 13,802（`graph_propose` 3,181、`graph_status` 1,583、`graph_verify` 1,387 等） | 3,940 | 无 |
| `memory_*` 3 个 | `src/memory/tools.ts` `memoryTools` | 所有路由、所有 agent；GLM 上常驻 | 1,234 | 350 | 无 |

工具说明不随步变，与系统提示词一起在缓存前缀里。2026-10-28 06:20 的截包里 GLM 工具面是 16 个工具、19,910 字符；2026-10-29 的探针是 29 个、33,663 字符，多出来的是 13 个图工具。标定基线（提交 `4cb8799`，2026-10-28 06:10–06:31）早于图工具进工具面，这 13.8k 字符没有经过标定。

### 3.4 工具结果与拒绝文字

| 文字 | 源 | 何时 | 谁看到 | 字符 | 备注 |
| --- | --- | --- | --- | --- | --- |
| guard 拒绝（四段式：事实、Boundary、Right path、Exception） | `src/guard/rules.ts` `renderCorrection`；`workspaceContainment`、`fileToolsOnly` | 违规时 | main：GLM；G3 后所有路由 | 497（圈禁）、635（shell 写） | Exception 段 `APPLICATION_PROTOCOL` 要模型「file a request … A human approves each request individually」，这条通道不存在 |
| 图文件门禁拒绝 | `src/guard/graph-files.ts` `correction` | 直接写图目录时 | 所有路由 | 约 700 | 正路列出 8 个图工具；例外说明人在面板拍板或经转述 |
| 图工具拒绝 `{code, message, field?, hint}` | `src/graph/tools.ts` `refuse` | 引擎拒绝时 | 所有路由 | 短 | — |
| `memory_store` 拒绝 | `src/memory/tools.ts` | 文本像是仓库能回答的 | 所有路由 | 短 | 同一规矩在 `glm:memory` 与工具说明里各说过一次 |

### 3.5 压缩请求

| 文字 | 源 | 谁看到 | 字符 / 约 token | ZCode 对应 | 备注 |
| --- | --- | --- | --- | --- | --- |
| ZCode compact 指令 | `src/glm-prompt/compact.ts` `buildCompactPrompt`；`compact-row.ts` `withZcodeInstruction` 替换 compaction-basic 的指令 | GLM 的压缩请求 | 5,977 / 1,710 | 逐字（门禁覆盖） | 单独的请求，不碰对话前缀；产物经 `formatCompactSummary`，外框仍是 DSH 的 `<compacted-summary>` |

### 3.6 不是插件的、但也进模型的（人设与规矩的另一半）

| 文字 | 源 | 谁看到 | 字符 | 备注 |
| --- | --- | --- | --- | --- |
| 用户人设与习惯 | `~/.dsh/AGENTS.md`（喵桃人设、汇报粒度、写作风格、仓库与代码卫生） | DSH `agent-instructions` 用户消息；所有路由、所有 agent，含子 agent | 约 2,200（中文多） | 这就是 `m3-main-persona` 要解决的问题：子 agent 也读到人设。「二、汇报粒度」的三件事与 `glm:persona` 的三档说的是同一件事 |
| 仓库 AGENTS.md | 工作区 | 同上 | 约 1,450 | — |
| DSH 的包装语 | DSH `agent-instructions` | 同上 | — | 「may be relevant … They do not override system, developer, or direct user instructions」，与 ZCode `# agentsMd` 的「OVERRIDE any default behavior」意思相反；GLM 路由上用的是 DSH 的 |
| DSH runtime-context | DSH | 所有路由 | 约 570；子 agent 约 1,300 | 含当前工作目录（正确的值），与 `glm:environment` 重复 |
| DSH 技能清单 | DSH | 所有路由 | 截包里 8,815 | 单条最大的 notice |
| DSH `tool:*` 节 | 见 3.1 第 8 行 | 所有路由 | 约 2,700 | — |

### 3.7 split 改变了什么

已实现（第 0–6 步，`40190cf`）：

- 搬家不改字：`wrapSystemReminder` 与 `DEFERRED_TOOL_CALL_NAME` 移到新镜像文件 `src/shared/zcode-notice.ts`；`installStepNotice` 移到 `src/shared/step-notice.ts`；`src/shared/graph-service.ts` 移到 `src/graph/service.ts`；常驻名单的编排层部分移到 `src/shared/tool-names.ts` `ORCHESTRATION_RESIDENT_TOOLS`。模型看到的文字不变。
- `glm:memory` 只在本次组装 `next()` 返回的工具里三个记忆工具都在时出现（`memorySectionApplies`，split 设计 X10）。只装 GLM 包时少 883 字符。
- guard 规则只认原生名，`GuardRule.declare` 可以是取名函数：`fileToolsOnly` 的声明与纠偏按 `face` 写工具名。方言接管的 GLM 路由（C）上文字与今天相同；没有方言的 GLM 调用（N）与非 GLM（O）上写 `write`、`edit`、`read`；方言服务缺席时 C 上也用原生名，行健康报 degraded。
- 包边界：只装 GLM 包时没有图与记忆工具、没有 `glm:guard`；只装编排层包时非 GLM 会话有图与记忆工具。

未实现：

- 第 7 步（question-14 G3，人选「全拦」）：`glm:guard` 加到所有路由，节名不改（split 设计 F14：节名不进模型），非 GLM 的主与子 agent 各多约 730 字符，拦截与影子记录覆盖所有路由。
- bootstrap（split 设计 §9 B5、B8）：节名前缀 `hourness:` 给编排层，所有路由都加（项目规则、M3 主 Agent 身份）；强提醒经 `installStepNotice` 对所有模型生效。

### 3.8 已设计、未实现

| 文字 | 出处 | 落点 | 谁看到 | 长度 | 变化 | ZCode 槽位 | 问题 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hourness:main-agent`，`MAIN_AGENT_IDENTITY` | M3 设计 §3.1.3（10 项内容，上限 9,000 字符） | 系统提示词，`insertHournessSection` 插在 `glm:guard` 之前 | `/wish` 开启的主 Agent，所有路由 | 至多 9,000，约 2.6k–3k token | 模式内不变；`/wish` 与 `/wish off` 各使缓存失效一次 | 无角色原文；说话方式对应 Output Style，角色与契约对应 Workflow Actor Identity | 第 3 项再声明会执行的 `main-agent-no-write`、`design-before-release` 与图只经图工具；第 4、5 项（阶段、八步访谈）与阶段提醒重复；第 5 项「推荐项放第一个并加 `(Recommended)`」与 `d-recommend-last` 冲突；第 9 项汇报细度以 `design_review` 的 `depth` 为准，与 `glm:persona` 成了两个来源 |
| `glm-design-stage` notice | M3 设计 §3.6.2 | 末尾 `<system-reminder>`，阶段或缺项变化时才注入 | 主 Agent | 估 300–1,200 | 动态，只追加 | 同 `todo_reminder` | 位置对；每个阶段「做什么」的说明与身份节第 4、5 项重复 |
| `glm-design-wish` notice | M3 设计 §3.1.1 | 用户消息 | 主 Agent | 人的原话 | 一次 | — | 无 |
| `design_review`、`decision_card` | M3 设计 §3.4.4、§3.5.1 | 工具说明（未写），结果的 `message` 字段写给模型的下一步 | 主 Agent 的工具面；非主 Agent 从工具面滤掉 | 未写，估 2–4k | 不变 | 无 | 决策卡把推荐项排第一（§3.5.1 第 4 步），与 `d-recommend-last` 冲突 |
| 主 Agent 人设 | 图 `m3-main-persona` | 主 Agent 的系统提示词 | 只主 Agent | 用户自己写 | 不变 | Output Style | 节点要求子 agent 不带人设，与今天 `~/.dsh/AGENTS.md` 的做法相反 |
| 主 Agent 去掉写工具 | 图 `question-26` 选 C | 主 Agent 工具面去掉 `Write`、`Edit`（少 2,535 字符），guard 继续拦 shell 写 | 主 Agent | — | — | — | `m3-1` 验收第 3 条与 M3 设计 §3.1.3 仍写「写文件的工具都还在」 |
| 规则板 | rules 设计 §6.4 | `glm:guard` 末尾一行（约 150 字符，规则行启用时，不变）；每步 `hourness-rules` notice（至多 12 行，示例约 900 字符，变化时）；`hourness-rules-wake` 唤醒消息（不包装）；拦截与排队的四段式文字；`rules_show`、`rules_propose` 工具 | 规则命中的 agent，所有路由 | 见左 | 提醒是动态的 | 提醒同 `todo_reminder` | 提醒里列出 harness 会执行的 block、queue、throttle 规则，与拒绝信息重复；只告知的规则才必须靠提醒 |

## 4. 按四条原则检查

### 4.1 原则一：ZCode 有原文的地方逐字镜像

1. Dynamic Behavior 缺失（3,065 字符）。ZCode 对每个非工作流 agent 都发这一节；本仓库的 start-plan 通道发了，coding-plan 方言没发；DESIGN.md §5.3、§5.8 没有记，`docs/reference/zcode-capabilities.md` §10.3 的组装顺序用「…」略过了它。这是本次清点里离训练分布最远的一处。
2. 节的次序与 ZCode 不同：Environment 紧跟身份节（ZCode 在 Memory 之后）；本项目的 `glm:persona` 插在第二位；DSH 的 `tool:*` 节排在 Context management 之后。
3. Session-specific guidance：ZCode 没有技能时不出这一节，方言总出（161 字符）。本地化清单 ② 改了内容，没有说明为什么改出现条件。
4. 说话方式另起了新结构 `# Reporting Depth`，没用 ZCode 的 Output Style 槽位。`IDENTITY_OPENING_WITH_STYLE` 已在 `verbatim.ts`，`buildIdentitySection(outputStyleActive)` 也支持，只是从没打开。
5. `# agentsMd` 的包装语与当前日期 notice 没有镜像。DESIGN.md §5.1 把 agentsMd 列为 start-plan 的例外，§5.8 第 13 项把日期提醒记为「低成本可选、未实现」。包装语语义相反这一点（3.6）没有记。改它要动 DSH 的 `agent-instructions` 消息，方言今天只追加 notice、不改已有消息，接缝没有查。
6. 门禁缺口：`scripts/check-verbatim.mjs` 只检查 `ZCODE_SYSTEM.stableSections` 与 `cliPrefix`，没检查 `dynamicSections`（Dynamic Behavior 与 Context management 在 start-plan 上的原文）。
7. start-plan 通道（`buildStartPlanSystem`）把调用方的整份系统提示词附在 ZCode 的 stable 块之后，而 GLM 路由上调用方的系统提示词已经被方言换成 ZCode 身份，于是 start-plan 上 CLI 前缀与身份会出现两次。start-plan 没有额度、没验证过（DESIGN.md §4.8），优先级低。

### 4.2 原则二：静态进固定位置、只给需要的会话；动态走末尾；复用 ZCode 槽位

做到了的：系统提示词会话内不变；所有动态内容都是末尾追加的 notice；格式统一用 ZCode 的 `wrapSystemReminder`。

没做到的：

1. 只该给主 Agent 的东西给了所有 agent。方言装在每个 `agent/created` 上，GLM 子 agent 同样有 `# Reporting Depth`（「For each user-facing reply …」，而子 agent 的回复是交给父 agent 的）、`glm:memory`，以及全部 13 个图工具，含 `graph_approve`、`graph_reject`、`graph_decide`。探针 `glm-dispatch` 的子会话（`glm-5.3-flash`）：系统提示词 9,373 字符，标题与主会话相同，工具 29 个。
2. `glm:environment` 是按 profile 固定的静态值，却当作会话事实陈述。
3. 运行控制消息（`glm-graph-run`）与规则板的唤醒消息不带 `<system-reminder>` 包装，是中文的普通用户消息；其他 harness notice 都是英文加包装。它们代表人的操作，按用户消息发说得过去，但 DESIGN.md §6 第 1 条没有给出这种例外。
4. M3 身份节把步骤性内容（八步访谈、写图格式）放进系统提示词，同样的内容按阶段又出现在阶段提醒里。

### 4.3 原则三：harness 会执行的规矩，只留一句声明，靠拒绝信息教

1. `glm:guard` 的 file-tools-only 一行列出 18 个命令（373 字符），这些细节拒绝信息里已经有。
2. `glm:memory` 的「memory_store refuses such entries」在工具说明与参数说明里又各说一次。
3. 投影开头的「change the graph only through the graph tools」随每次投影重复，`glm:guard` 已声明过。
4. M3 身份节第 3 项再声明三条会执行的规矩；`question-26` C 之后主 Agent 本来就看不到 `Write`、`Edit`。
5. 规则板的每步提醒列出会执行的规则。对 block 规则来说拒绝信息已经够了；queue 与 throttle 提前知道能省一次白跑的重活调用，值得留；只告知的规则只能靠提醒。
6. 拒绝信息本身有一处教错：Exception 段让模型去走一条不存在的申报通道。

### 4.4 原则四：每段都要在标定里证明有用

没有一段非 ZCode 文字做过消融：`glm:persona`、`glm:guard`、高峰提醒、投影文字、常驻的图与记忆工具都一样。13 个图工具进 GLM 工具面（约 3.9k token/请求）是在基线之后，标定没跟上。现有两道任务（`bugfix-csv-quotes`、`feature-parse-duration`）两档模型都是 12/12 完成，完成率分不出差别；每格 3 次时同一格的积分相差到 1.6 倍（ORCHESTRATION.md §10.5.2）。Anthropic 那次掉 3% 是在一套宽得多的评测上发现的，这套标定量不出这个量级。

### 4.5 要不要求模型汇报或先说计划

OpenAI 的 Codex 提示词指南建议去掉所有「先交代计划、写开场白、途中汇报状态」的提示，理由是这类提示会让模型在任务没做完时提前停下；它同时说明这条针对 gpt-5.3-codex 之前的 Codex 模型，gpt-5.3-codex 起开场白可以按指南的写法去提示。这是针对 Codex 模型的建议，不是对所有模型的结论。

- 本项目自己的文字没有一段要求模型先说计划或途中汇报。`glm:persona` 规定的是对人回复的结构，不是过程中的状态汇报。
- `glm:context-management`（ZCode 原文）明确反对以计划收尾。
- 缺失的 Dynamic Behavior 恰好要求「首个工具调用前用一句话说要做什么，途中简短更新」。它是 GLM 在 ZCode 里的训练分布，原则一倾向于加；Codex 的经验倾向于不加。两者冲突时，应该用消融定（§8 的 A4），不靠推理。
- 高峰提醒没有 ZCode 公告里「这是环境信息，不要转述给用户」那一句，可能让模型对人复述高峰时段，人就要多读一段。
- M3 设计让汇报走 `design_review` 卡片，不在对话里问「可以开始了吗」，方向对。

## 5. 重复与冲突

| 编号 | 同一件事 | 出现在（GLM 路由） |
| --- | --- | --- |
| D1 | 用专用文件工具，别用 shell | Harness 块第 4 条（ZCode）；Bash 说明的 IMPORTANT 一行（ZCode）；DSH `tool:read`、`tool:glob`、`tool:grep`（用的是原生名）；`glm:guard` file-tools-only 一行；违规时的拒绝信息 |
| D2 | 图只经图工具改 | `glm:guard` 的 `GRAPH_FILES_DECLARATION`；每次投影的开头一句；图文件门禁的拒绝信息；M3 身份节第 3 项（设计） |
| D3 | 写或改之前先读 | ZCode `Write`、`Edit` 说明；DSH `tool:write`、`tool:edit`（原生名，提到 `fs-observation-policy`） |
| D4 | 汇报的结构与细度 | `glm:persona` 三档；`~/.dsh/AGENTS.md`「二、汇报粒度」；ZCode Dynamic Behavior 的「Lead with the outcome」（缺失）；M3 身份节第 9 项「细度以 `design_review` 的 `depth` 为准」（设计） |
| D5 | 工作目录 | `glm:environment`（按 profile 固定，可能错）；DSH runtime-context（正确）；DSH working-directory notice |
| D6 | 记忆不存仓库能回答的 | `glm:memory`；`memory_store` 说明；`text` 参数说明 |
| D7 | 推荐项的位置 | `d-recommend-last`（放最后）；M3 设计 §3.1.3 第 5 项与 §3.5.1 第 4 步（放第一并加 `(Recommended)`）；`graph_propose` 的 `recommend` 说明没写位置 |
| D8 | 设计循环的阶段与步骤 | M3 身份节第 4、5 项；阶段提醒的各阶段正文（设计） |
| D9 | 规则板的规则 | `glm:guard` 末尾一行；每步 `hourness-rules` 提醒；拒绝与排队信息（设计） |
| C1 | 「被拒 = 用户拒绝了」 | Harness 块第 2 条说 denied call 就是用户拒绝；guard 的拒绝来自 harness，不是用户。`glm:guard` 的开头一句正好澄清这一点，这也是保留一句总声明的理由 |
| C2 | AGENTS.md 的优先级 | DSH 包装语说不覆盖系统、开发者与用户指令；ZCode `# agentsMd` 说覆盖默认行为 |

## 6. 各会话类型的注入总量（插件放进的文字，首个请求）

token 按 3.5 字符/token 估。JSON schema 的实际比值可能更低，所以工具一栏可能偏低。

| 会话类型 | 系统提示词 | 工具说明与 schema | 首步 notice | 合计字符 | 约 token |
| --- | --- | --- | --- | --- | --- |
| GLM 主 Agent（main，桌面版配置） | 6,781 | 27,343（ZCode 别名 9,641，检索控制 2,666，图 13,802，记忆 1,234） | 418（高峰时段另加 336） | 34,542 | 9.9k |
| GLM 子 agent（main） | 同上（方言、guard、图与记忆在每个 agent 上） | 同上 | 418 | 约 34.5k | 9.9k |
| 非 GLM 主 Agent（main） | 0 | 15,036（图 13,802，记忆 1,234） | 0 | 15,036 | 4.3k |
| 非 GLM 子 agent（main） | 0 | 15,036 | 0 | 15,036 | 4.3k |
| 非 GLM 主与子（split 第 7 步 G3 后） | 约 732（原生名的 `glm:guard`） | 15,036 | 0 | 约 15.8k | 4.5k |
| GLM，只装 GLM 包（split 后） | 5,166（无 `glm:memory`、无 `glm:guard`） | 12,307 | 418 | 约 17.9k | 5.1k |
| GLM 主 Agent，`/wish` 模式（M3、规则板、人设都做完，估） | 上面的 6,781，加身份节至多 9,000、规则一行约 150、人设 | 27,343 减 `Write`、`Edit` 2,535，加设计工具约 2–4k，加规则工具约 1–2k | 418 | 约 44k–48k 加人设 | 约 13k–14k |

对照实测：桌面版 2026-10-28 至 29 的 5 个 GLM-5.3-Flash 会话，首个请求输入 18,079–18,500 token（用量流水），插件部分约占 55%。2026-10-28 的截包（还没有图工具）首个请求 12,178 token，插件部分约 5.8k，约占 48%。

费用量级：GLM-5.3 一个 9 步的会话，插件文字约 9.9k token/请求：第 1 步按普通输入（6.9），后 8 步按缓存命中（1.7），合计约 20 积分（全价），非高峰约 10。其中图工具约 4 积分（非高峰）。

## 7. 整理建议（按收益排序；只是建议，没有实施）

1. 补上 ZCode Dynamic Behavior：放在 ZCode 的位置（身份节之后、Session guidance 之前），原文取 `ZCODE_SYSTEM.dynamicSections.beforeEnvironment`，同时把 `dynamicSections` 加进逐字门禁，DESIGN.md §5.3 加一行、§5.8 记差异。它带开场白一句，先过消融 A4 再定。每请求加约 876 token，缓存命中后每个 9 步 GLM-5.3 会话约多 0.9 积分（非高峰）。
2. 方言节按 ZCode 次序渲染：前缀、身份、[Dynamic Behavior]、Session guidance（只在有技能时）、Memory、Environment、[Output Style]、Context management，然后是 DSH 的其余节，`glm:guard` 最后。`order` 字段要么真用上，要么删掉（AGENTS.md「不留死代码」），DESIGN.md §5.2 的表随代码改。
3. 人设与汇报细度进 Output Style 槽位：有主 Agent 人设或汇报细度时，身份开头句换成 `IDENTITY_OPENING_WITH_STYLE`，加 `# Output Style: <name>` 一节，正文是用户配置的人设加选定的汇报细度；删掉独立的 `glm:persona` 节。只给主 Agent（会话头 `origin: 'subagent'` 判子 agent，`src/glm-llm/headers.ts` 已在用这个判定）。`persona.ts` 里写死的中文三档提示来自用户自己 AGENTS.md 的词汇，CHARTER 的非目标是「人设与个人习惯不进插件」，建议插件只提供槽位与档位名，文字放用户配置。`m3-main-persona` 做完后，由用户自己把人设从 `~/.dsh/AGENTS.md` 挪出去（用户配置，插件不动）。
4. 子 agent 只拿它需要的：不带汇报细度与人设；图写工具按 M7 的派发设计裁（`graph_approve`、`graph_reject`、`graph_decide` 要人的原话转述，子 agent 拿不到人的原话）。每个子 agent 请求可省约 3k–4k token。
5. `glm:guard` 缩成一句总声明加三条规则名，例如「The harness checks every tool call before it runs. Writes outside the workspace, file changes through the shell, and direct edits of the project graph are denied with the reason and the right way to proceed.」（约 250 字符，现在 732）。规则板那一行并进这一句，不另加行。投影开头删掉「change the graph only through the graph tools」半句；M3 身份节不再逐条声明会执行的规矩。
6. 改正拒绝信息的 Exception 段：在 M4 的申报卡做出来之前，写一条现在走得通的路，例如「Tell the human what you need, where and why; only the human can allow it.」。
7. `glm:environment` 从会话头取值（`session.header.cwd`，guard 已经这样取圈禁根），或者在 profile 配置与会话目录不一致时不出这一节。代价：不同项目的会话之间，跨会话共享的缓存前缀会在这一节处断开，每个新项目会话的第 1 步少命中约 1k–2k token，GLM-5.3 全价约 1 积分。
8. GLM 路由上去掉被别名覆盖的 DSH `tool:read`、`tool:write`、`tool:edit`、`tool:glob`、`tool:grep` 节，节名固定，可按名过滤，与方言替换 `harness:identity` 是同一种做法。`tool:pwsh` 的 `[exit code: N]` 说明对 Bash 别名的结果仍然成立，保留。先过消融 A5。
9. M3 身份节收窄：系统提示词里只留角色与边界（约 1k–1.5k 字符）；八步访谈与写图格式随阶段提醒和设计工具结果的 `message` 下发；第 5 项改成推荐放最后；第 9 项删掉，细度只有一个来源（第 3 条的 Output Style）。同时按 `question-26` C 改 `m3-1` 验收第 3 条与 M3 设计 §3.1.3。
10. 规则板的每步提醒只列 queue、throttle、只告知的规则与等待单；block 规则留给拒绝信息。
11. 高峰提醒：见 §9 Q7。
12. AGENTS.md 包装语改成 ZCode 的 `# agentsMd` 写法：先查 rc.3 有没有改写已有消息的接缝，再定，暂不排期。

## 8. 消融方案（待人批，花积分）

### 8.1 先做的两件事

1. 处理 `risk-calib-read`：运行目录移出仓库（例如 `%TEMP%` 下按时间戳建目录），验收脚本放在被测模型够不着的位置。重复次数一多，同批里后面的运行能读到前面运行的解。
2. 消融开关：在 `scripts/calibrate/` 里加一行只在标定时加载的插件（同 `limits.mjs`，不进 bundle），按配置去掉指定的系统提示词节与指定来源的 notice，或者在 ZCode 的位置加入 Dynamic Behavior 原文。它必须是最外层的组装监听器（同一组插件行的激活次序不跟配置顺序走，M3 设计 §3.1.3 已记录），所以每一臂先用 L3 探针（探针 provider，不花积分）核对：截下的请求里恰好少了或多了那一段。

### 8.2 臂

每臂相对 A0 只改一处：

| 臂 | 改动 | 主要看 |
| --- | --- | --- |
| A0 | 当前 main，不改（同时替换 `4cb8799` 的旧基线，那时还没有图工具） | 全部指标 |
| A1 | 去掉 `glm:persona` | 积分、输出 token、最终回复长度 |
| A2 | `glm:guard` 缩成一句总声明（拦截不变） | 违规（拒绝）次数、步数 |
| A3 | 图与记忆工具在 GLM 上改为延迟（按 ZCode 对 MCP 工具的规则） | 积分、步数、是否多出检索调用 |
| A4 | 加 ZCode Dynamic Behavior 原文 | 完成、步数、工具调用之间的文字条数、积分 |
| A5 | GLM 路由上去掉 DSH `tool:read`、`tool:write`、`tool:edit`、`tool:glob`、`tool:grep` | 步数、工具失败数、shell 读写的次数 |

不做消融的：ZCode 逐字文字（原则一保留）；环境目录与拒绝信息的 Exception 段（宿主事实错误，直接修）；M3、规则板、人设的文字（还没写，做出来时带开关，用 M3 设计 §9.2 的访谈任务 `interview-expense-log` 标定）。

### 8.3 任务、次数、两档模型

- 任务：现有两道任务；能加一道完成率会失败的任务（多文件重构或长程多步）就加，否则这一轮只能看步数、积分、返工与违规，看不出质量。
- 两档模型：`glm-5.3` 与 `glm-5.3-flash`，都跑。
- 第一期筛选：6 臂 × 2 任务 × 2 模型 × 3 次 = 72 次。
- 第二期确认：第一期里在两档模型上同向变化超过 15%，或完成数有变化的臂，连同 A0 再各补 5 次，至多 3 臂 = 60 次。
- 判据：非 ZCode 的文字，去掉之后没有一项指标变差就删；加 ZCode 原文（A4），持平或更好就加。这套样本只看得出大的变化（同一格积分波动到 1.6 倍，30%–40% 以下的差别分不清）。

### 8.4 积分估计

- 每次运行：基线（`4cb8799`，非高峰计费）GLM-5.3 平均 15.53、Flash 8.16（ORCHESTRATION.md §10.5.2）。现在的工具面多了图工具，约 3.9k token/请求，按 9 步折算，GLM-5.3 每次约多 4.1、Flash 约多 1.35，所以按 GLM-5.3 约 20、Flash 约 10 估。A0 的实测会给出准数。
- 第一期：36 × 20 + 36 × 10 ≈ 1,080 积分。
- 第二期：至多 30 × 20 + 30 × 10 ≈ 900 积分。
- 合计约 1,100–2,000 积分，全在非高峰；高峰时段加倍。之前基线连同两次试跑共花约 155 积分。
- 时长：基线每次 1.1–3.6 分钟，第一期 72 次串行约 2 小时。
- 额度对照（`FACTS.md` §2.4，用户档位没有记录）：第一期约占 Pro 周额度 60,000 的 1.8%，Lite 周额度 10,000 的 11%。

## 9. 需要人定的事项（每组推荐项在最后）

Q1 ZCode Dynamic Behavior

- A 不加，维持现状：离 ZCode 训练分布差一节，不花积分。
- B 直接加：符合原则一；带一句开场白要求，Codex 的经验提示可能让模型话多或提前停下，没有数据。
- C 先在消融 A4 里对照，持平或更好就加（推荐）：多花一臂的积分，结论有数据。

Q2 汇报细度与人设放哪

- A 维持独立的 `glm:persona` 节：不改代码；子 agent 继续看到，与用户 AGENTS.md 的汇报粒度重复。
- B 删掉 `glm:persona`，汇报细度交给用户自己的 AGENTS.md：最省；子 agent 仍从 AGENTS.md 读到人设与汇报粒度。
- C 主 Agent 用 ZCode 的 Output Style 槽位承载人设与汇报细度，开头句随之换成 `IDENTITY_OPENING_WITH_STYLE`，子 agent 不带（推荐）：复用 ZCode 已有的位置，与 `m3-main-persona` 合成一件事；要改方言的组装与 M3 的设计。

Q3 M3 主 Agent 身份节的形状

- A 按现设计，一节至多 9,000 字符：一次讲全；与阶段提醒、`glm:persona` 重复，每请求约 2.6k–3k token。
- B 剧本做成技能，`/wish` 时以技能内容注入：系统提示词不变；压缩之后技能内容还在不在没核实。
- C 系统提示词只留角色与边界（约 1k–1.5k 字符），访谈步骤与写图格式随阶段提醒和设计工具的结果下发（推荐）：没有重复，各段在用得着的那一步才出现；要改 M3 设计 §3.1.3 与 §3.6.2。

Q4 harness 会执行的规矩在提示词里怎么说

- A 维持现状：逐条声明，细节多。
- B 一句也不说，全靠拒绝信息：最短；模型第一次碰到时会多一次被拒，并且 Harness 块「被拒就是用户拒绝」那句会被误用到 harness 的拒绝上。
- C 一节一句总声明加规则名，细节只在拒绝信息里（推荐）：保留 C1 需要的那句澄清，`glm:guard` 从 732 字符降到约 250。

Q5 子 agent 的注入

- A 维持：方言、汇报细度、记忆节与全部图工具都给子 agent。
- B 子 agent 只留 ZCode 原文、guard 一句与它要用的工具；汇报细度与人设不给，图写工具按 M7 派发设计裁（推荐）：每个子 agent 请求省约 3k–4k token；裁哪些图工具要等 M7。

Q6 消融的规模

- A 不标定，按原则直接整理：不花积分；原则四落空，加 Dynamic Behavior 这类改动没有依据。
- B 每臂一开始就跑 5 次：第一期约 1,800 积分，把握大一些。
- C 两期：先每格 3 次筛，变化大的臂再补 5 次（推荐）：约 1,100–2,000 积分；先修 `risk-calib-read` 并加消融开关。

Q7 高峰提醒

- A 去掉给模型的提醒，只在面板显示：模型拿到它也做不了什么（没有换模型的工具，又被要求不暂停）；`ORCHESTRATION.md` §11.4 的「提醒 LLM」要改。
- B 放进消融（用探针的时钟平移行 `scripts/probe/probe-clock.mjs`），看它是否让模型对人复述：花一臂积分，量的是话多不多。
- C 先不花积分，查桌面版已有的 GLM 会话里模型有没有复述过高峰提醒，再从 A、B 里选（推荐）：只读，现成数据。

## 10. 交编排者记到图上的事项

本步只读，没有写 `docs/graph`。以下由编排者决定怎么记：

1. `m3-1` 验收第 3 条与 M3 设计 §3.1.3 仍写「写文件的工具都还在」，与 `question-26` 选的 C 不一致。
2. M3 设计 §3.1.3 第 5 项与 §3.5.1 第 4 步把推荐项排第一，与 `d-recommend-last` 不一致（`d-recommend-last` 正文已写明要改写，还没改）。
3. DESIGN.md §5.2 的节表与实际渲染次序不一致；§5.3、§5.8 漏了 Dynamic Behavior；`scripts/check-verbatim.mjs` 没检查 `ZCODE_SYSTEM.dynamicSections`。
4. 缺陷三条：`glm:environment` 的工作目录固定在 profile 配置里；GLM 路由上的 DSH `tool:*` 节点名被遮住的原生工具；guard 拒绝信息的 Exception 段指向不存在的申报通道。
5. 标定基线 `4cb8799` 早于图工具进 GLM 工具面，基线已过时；任何消融先修 `risk-calib-read`。

## 来源

- OpenAI，[Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide)：建议从提示词里去掉要求模型先交代计划、写开场白或途中汇报状态的内容，因为可能让模型在任务完成前突然停下；同时说明这条针对 gpt-5.3-codex 之前的模型，之后的模型可以按其 Preambles 一节提示。（转述）
- Anthropic，[An update on recent Claude Code quality reports（2026-04-23）](https://www.anthropic.com/research/april-23-postmortem)：2026-04-16 加进系统提示词的一句长度限制「Length limits: keep text between tool calls to ≤25 words. Keep final responses to ≤100 words unless the task requires more detail.」，在逐行删除的消融里让一项评测对 Opus 4.6 与 4.7 都掉了 3%，随即撤回；之后每次系统提示词改动都跑逐模型的评测并继续逐行消融。（引文 22 词，其余转述）
