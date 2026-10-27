# BigModel coding-plan/learning-resources 板块消化文档

来源：docs.bigmodel.cn（Mintlify 托管，每页可经 `.md` 后缀取 markdown 源）。
抓取方式：sitemap.xml 全量枚举 + 页面侧栏链接交叉核对，板块成员两源一致。
用途：GLM-Hourness 项目（GLM 按 ZCode 训练分布无损接入 DeepSeek Harness 的插件工程）设计参考。

## 1. 页面清单

板块总数：**5 页**（cn 语言、coding-plan/learning-resources 路径下无其他页面；sitemap 与页面侧栏交叉验证一致）。

| URL | 标题 | 一句话主旨 |
| - | - | - |
| https://docs.bigmodel.cn/cn/coding-plan/learning-resources/how-coding-agent-works | Coding Agent 工作原理 | 讲清 Agentic Loop（获取上下文→执行操作→验证结果）由模型与工具两个核心组件驱动，以及上下文压缩、安全权限等运行时机制。 |
| https://docs.bigmodel.cn/cn/coding-plan/learning-resources/agentic-extension | Agentic 扩展组件 | 以 Claude Code 生态为参考，逐类讲 CLAUDE.md / Skills / Subagents / Agent Teams / MCP / Hooks / Plugins 的定位、层级优先级与上下文成本。 |
| https://docs.bigmodel.cn/cn/coding-plan/learning-resources/memory-mechanism | 记忆机制 | 记忆分层架构（session/project/semantic/episodic/procedural）、五级作用域（组织/项目/用户/本地/角色）、按路径加载规则文件、指令型与学习型记忆分离。 |
| https://docs.bigmodel.cn/cn/coding-plan/learning-resources/common-workflow | 常用工作流 | 十余个日常操作配方：理解新代码库、修 bug、重构、subagents、Plan Mode、测试、PR、文档、图像输入、`@` 引用。 |
| https://docs.bigmodel.cn/cn/coding-plan/learning-resources/best-practice | 最佳实践 | 十条使用方法论：协作者定位、结构化任务输入（Goal/Context/Constraints/Done when）、先规划再执行、规则沉淀、环境配置、开发闭环、MCP、Skills、Automation、会话治理。 |

失败清单：无。5/5 全部成功抓取并读取完整 markdown 源。

板块外的 coding-plan 页面（overview、quick-start、faq、mcp/*、extension/*、notice/*、tool/others、usage-notes、team、latest-model 共 15 个 URL）不属于 learning-resources 板块，本任务未展开；其中 `/cn/coding-plan/tool/others`、`/cn/coding-plan/mcp/*` 与六插件行有潜在关联，留作后续抓取候选。

## 2. 逐页要点

### 2.1 how-coding-agent-works（Coding Agent 工作原理）

机制：

- Agentic Loop 三阶段：**获取上下文 → 执行操作 → 验证结果**，非严格顺序，全程交替循环。
- 循环由两个核心组件驱动：**模型（Models，理解任务与推理决策）+ 工具（Tools，执行实际操作）**；多数 Coding Agent 在语言模型之上再包一层 Agent 运行框架，管理上下文、调度工具。
- 循环按任务类型动态调整：纯理解类任务只做上下文获取；bug 修复反复"读取→修改→运行测试→验证"；大型重构附加更多验证步骤保行为一致性。
- 用户是循环的一部分，任意时刻可中断、补上下文、改方向。

工具系统类别表（原文）：

| 类别 | 能力 |
| - | - |
| 文件操作 | 读取文件、修改代码、创建新文件、重命名或调整结构 |
| 搜索 | 按模式查找文件、使用正则搜索内容、浏览代码库 |
| 命令执行 | 运行 Shell 命令、启动服务、运行测试、使用 Git |
| Web | 搜索网页、获取文档、查询错误信息 |
| 代码分析 | 查看类型错误、跳转定义、查找引用（需代码智能插件） |

每次工具调用产生新信息反馈给模型，指导下一步决策——这就是 Agentic Loop 的运行过程。

扩展组件四类：Skills（封装常见工作流程）、MCP（连接外部服务）、Hooks（自动化任务流程）、Subagents（任务委托给子 Agent），构成"Agent 循环之上的能力层"。

项目级配置文件命名（原文表格）：Claude Code → `CLAUDE.md`；Cursor → `.cursor/rules`；Cline → `.cline/rules`；Codex → `AGENTS.md`。作用是提供长期项目上下文和开发规则，各工具通常只读自身生态的配置文件。

可访问环境：项目代码（全部代码文件、结构与配置）、开发环境（命令行、构建工具、包管理器、Git）、版本控制信息（当前分支、未提交修改、最近提交）。

运行环境三种：本地（用户机器）/ 云端（云端虚拟机）/ 远程控制（本地机器、远程界面控制）。

会话与上下文管理：上下文 = 对话历史 + 文件内容 + 命令输出 + 项目规则；增长后系统自动做**上下文压缩（Context Compression）**：删旧工具输出、总结历史对话。官方建议：长期规则写入项目级配置文件，不依赖对话历史。

安全与权限：变更回滚（改文件前建快照）；权限控制（是否允许自动改代码、是否允许执行命令、是否需要人工确认）。

高效使用四条（原文）：1) 提供清晰任务（越具体成功率越高）；2) 提供可验证目标（测试用例或期望输出）；3) 复杂任务先规划（先分析代码并制定执行计划）；4) 将任务委托给 Agent（给目标与上下文，不逐条下指令）。

### 2.2 agentic-extension（Agentic 扩展组件）

基本架构（原文）：

```
Coding Agent
Model ↓ Agent Loop ↓ Tools
Extension Layer
 ├ Project Context files
 ├ Skills / workflows
 ├ Subagents
 ├ External tools
 ├ Hooks
 └ Plugins
```

定性：**模型负责思考，工具负责执行，扩展组件层决定 Agent 的能力边界**。引用了对近 3000 个使用 AI coding agent 的 GitHub 仓库的分析：系统普遍通过配置文件和扩展组件（CLAUDE.md、Skills、Subagents 等）控制 Agent 行为。全文明确以 Claude Code 生态为参考展开。

七类扩展组件定位：CLAUDE.md（每次会话加载的持久化上下文）；Skills（可复用的知识、指令和工作流程）；MCP（连接外部服务与工具系统）；Subagents（独立上下文运行子 Agent，返回执行结果摘要）；Agent Teams（协调多个独立会话并行协作）；Hooks（Agent 循环之外执行确定性自动化脚本）；Plugins + Marketplace（打包分发上述能力）。

Skill 本质是一个 Markdown 文件，可含领域知识、操作流程、指令说明；可经 `/deploy` 类命令直接调用，也可由 Agent 在任务相关时自动加载。Skills 既可在当前会话执行，也可经 Subagent 在隔离上下文运行。

组件选型表（原文）：

| 组件 | 作用 | 适用场景 | 示例 |
| - | - | - | - |
| CLAUDE.md | 项目规则与背景，每次开工都读 | 项目规范、全局规则 | "使用 pnpm 而不是 npm；提交前运行测试。" |
| Skills | 常用任务/知识整理为可复用能力模块 | 参考文档、标准任务流程 | `/deploy` 执行部署流程 |
| Subagent | 独立子 Agent 处理复杂耗时任务 | 上下文隔离、并行任务 | 分析大量文件并返回关键结论 |
| Agent Teams | 多 Agent 协同分工 | 并行研究或复杂开发任务 | 同时启动多个 reviewer 查安全、性能与测试 |
| MCP | 访问外部系统或工具 | 外部数据或外部操作 | 查询数据库、发送 Slack 消息 |
| Hook | 特定事件自动执行脚本 | 确定性自动化流程 | 每次修改文件后运行 ESLint |

组件辨析（原文）：

- Skills vs Subagent：Skills 是可复用知识/流程（核心价值：复用），Subagent 是独立执行单元（核心价值：上下文隔离，适合大规模代码分析/并行任务，只向主会话返回摘要）。Skills 分两类：Reference Skills（参考知识，如 API 规范）与 Action Skills（触发具体任务，如 `/deploy`）。可组合：Subagent 可预载指定 Skills；Skills 可在隔离上下文执行。
- CLAUDE.md vs Skills：CLAUDE.md 每次会话自动加载，Skills 按需加载；两者都支持 `@path` 文件引用；CLAUDE.md 不能触发流程。建议：所有任务都需遵守的规则进 CLAUDE.md，可复用流程/参考资料进 Skills。**CLAUDE.md 建议控制在 200 行以内**，超了就拆成 Skills 或 `.claude/rules/` 文件。
- CLAUDE.md / `.claude/rules/` / Skills 三分：CLAUDE.md 每次会话加载管整个项目（核心规则）；`.claude/rules/` 按文件路径加载管指定目录（细粒度规则）；Skills 按需加载到任务级（工作流程）。
- MCP vs Skill：MCP 是外部系统连接协议（提供工具接口与数据访问），Skills 是知识或流程（提供使用方式与业务逻辑）；典型配合：MCP 连数据库，Skills 定义查询方式。

Plugins：一个插件可同时包含 Skills、Hooks、Subagents 和 MCP Servers；插件 Skills 用**命名空间**（如 `/my-plugin:review`）避免命令冲突；跨仓库复用与分发走 Plugin + Marketplace。

层级与优先级（原文，多层级：用户级/项目级/插件级/管理策略级）：

- CLAUDE.md：**叠加（additive）**——所有层级的文件都加载合并入上下文；冲突时**更具体的规则优先生效**。
- Skills：按名称覆盖，优先级 `managed` > `user` > `project`。
- Subagents：按名称覆盖，优先级 `managed` > `CLI flag` > `project` > `user` > `plugin`。
- MCP Servers：按名称覆盖，优先级 `local` > `project` > `user`。
- Hooks：不互相覆盖，**合并执行**——事件匹配则全部触发。

上下文成本表（原文）：

| 组件 | 加载时机 | 加载内容 | 上下文成本 |
| - | - | - | - |
| CLAUDE.md | 会话开始 | 全部内容 | 每次请求 |
| Skills | 会话开始 + 调用时 | 描述 + 完整内容 | 较低 |
| MCP servers | 会话开始 | 工具定义 | 每次请求 |
| Subagents | 创建时 | 独立上下文 | 与主会话隔离 |
| Hooks | 触发时 | 默认无 | 0 |

默认 Skill 描述在会话开始时加载（供 Agent 判断是否使用）；若要 Skill 仅手动调用时加载，在 frontmatter 设 `disable-model-invocation: true`，会话中不可见，上下文成本降为零。加载过多内容会导致模型忽略关键信息、Skills 触发不准确、无法正确遵循项目规则。

### 2.3 memory-mechanism（记忆机制）

架构：外部记忆（External Memory）弥补模型无状态。流程链：`User input → Memory retrieval → Context assembly → LLM reasoning → Action/tool call → Memory update`——任务前检索记忆，任务后更新记忆（LangGraph、AutoGPT、Devin 同款设计）。

完整记忆架构：短期记忆（Session context）+ 长期记忆三支（semantic memory / episodic memory / procedural memory）。

五类记忆（原文）：

- **Session Memory**：当前对话历史、最近工具调用结果、当前执行计划、当前文件内容；存在于上下文窗口中；生命周期单个会话、容量受上下文限制、不长期保存。
- **Project Memory**：整个代码仓库的长期信息（项目架构、编码规范、构建流程、常用命令）；写 `.md` 文件、会话开始时加载。示例结构：`.claude/CLAUDE.md` + `.claude/rules/{code-style.md, testing.md, security.md}`。
- **Semantic Memory**：知识事实（API 文档、语言规则、项目知识库），经 RAG 实现：`query → embedding → vector search → retrieve documents → LLM reasoning`；是 Coding Agent 用得最多的记忆方式之一。
- **Episodic Memory**：历史经验（上次 bug 修复步骤、上次构建失败原因、成功调试策略）。示例：`Episode: CI failure caused by missing dependency / Solution: upgrade pip package`。
- **Procedural Memory**：如何完成任务的策略流程（如 `Debug_Workflow.md`: read error log → locate file → write patch → run tests）；用于系统提示词工程、工作流模板、agent 策略。

使用固定范式三步：1) 记忆检索（任务前检索项目记忆、知识库、历史经验注入上下文）；2) 上下文构建（拼接成完整上下文输入模型）；3) 记忆更新（任务后决定是否写入新记忆）。特点：分层、可控、可检索、可更新。短期/长期二分：短期保当前线程状态，长期靠显式文件、规则配置、向量检索或其他持久化存储。

**指令型记忆 vs 学习型记忆**（本页核心论点）：

- 指令型记忆（instruction memory）：人写的"应该如何做事"——编码规范、目录约定、构建命令、测试流程、命名风格、提交要求、团队安全规则；对应 `CLAUDE.md` 类持久指令文件。
- 学习型记忆（learning memory）：Agent 从纠正、偏好、失败经验、常见命令、项目习惯中积累；Claude Code 称"自动记忆（auto memory）"，每次会话开始时与指令型记忆一起加载。**subagent 可维护自己的独立记忆目录，并在系统提示中自动包含 `MEMORY.md` 的前 200 行**。
- 二者混用会导致行为偏离；分工原则：规范/制度/行为约束进指令型，经验/偏好/临时发现/复盘结论进学习型，避免经验性信息污染系统规则。

五级分层（原文）：

- **组织级**：团队/公司统一下发（安全合规、代码审查底线、敏感目录不可读写规则、依赖与许可证约束、公司工程规范）；组织范围 `sysytem.md`（原文如此，拼写即 system 之误）部署到系统级路径，不能被个人设置排除；支持托管设置、MDM、Group Policy、Ansible 集中分发；定位为最高优先级不可绕过的治理层。
- **项目级**：团队共享的项目上下文，版本控制管理；典型内容：项目架构说明、目录结构约定、构建和测试命令、API 放置路径、命名约定、常见开发流程；Claude Code 建议写入项目级 `project.md`，用 `/init` 自动生成初稿再手工补充模型不易自发现的规则；关键属性：项目共享、版本控制、稳定长期存在。
- **用户级**：个人跨项目偏好，放用户目录；用户级规则先于项目规则加载，但项目规则优先级更高；放偏好代码风格、常用调试顺序、喜欢的输出格式、个人工作流快捷方式；不覆盖项目共识，只补个人习惯。
- **本地级**：只对当前项目副本有效、不进 Git；`local.md` 存放沙箱 URL、个人测试数据、个人测试账号、本地开发端口、临时 mock 服务地址、当前机器运行注意事项、未准备共享的实验性流程；价值是个人高效工作同时不污染团队共享记忆。
- **子代理/角色级**：不同 subagent 各自独立记忆目录，支持 user、project、local 三种作用域；测试/代码审查/文档/重构代理不共享同一份记忆（避免多代理上下文互相污染）：测试代理记测试命令、CI 特性、断言风格；重构代理记模块边界、依赖禁区、迁移策略；文档代理记术语表、文档模板、受众风格——记忆更短更准更稳。

按路径加载 `.md`：大项目把规则拆到 `.claude/rules/` 多个单主题文件（`testing.md`、`api-design.md`、`security.md`）；规则可按**文件路径或子目录范围限定**，仅当 Agent 处理匹配路径的文件时才加载对应规则——减少噪音、节省上下文。三条原则（原文）：主记忆文件只保留全局共识；专项规则模块化按主题拆分；能按路径加载的规则不全量加载。示例结构：

```
agent-memory/
├── project.md            # 项目总说明
├── rules/
│   ├── code-style.md
│   ├── testing.md
│   ├── api-design.md
│   ├── security.md
│   └── frontend/react.md
└── local/developer.local.md
```

好处：便于维护（每文件一个主题）、按需加载（改测试不必带前端规范）、团队协作（各小组各自维护规则目录）。

记忆写法：用**具体、可验证的规则**不用抽象原则；指令简洁明确、规则间一致；**主记忆文件控制在 200 行以内**；用 Markdown 标题与列表；写成可检查可执行的规则。反例：保持代码整洁/做好测试/注意 API 设计/适当拆分模块。正例：所有新增 TypeScript 文件使用 2 空格缩进；修改业务逻辑后必须运行 `pnpm test`；API handler 统一放 `src/api/handlers/`；React 页面组件不超过 300 行，超过拆分为 hooks 或子组件。

作用域分层五级（另一处复述）：项目级（Project，团队共享版本控制）、组织级（Organization，IT/DevOps 统一制定）、用户级（User，仅个人）、本地级（Local，当前机器不进 Git）、角色级（Role/Agent-specific，专用 Agent）。核心原则一句话：**谁负责、谁共享、谁生效**。

导入与规则包：Claude Code 支持在 `CLAUDE.md` 中 `@path/to/import` 导入其他规则文件；`.claude/rules/` 支持符号链接（symlink）共享规则；导入可递归展开，符号链接正常解析。可构建可复用规则包（rule packages）：`company-security-rules`、`frontend-react-rules`、`backend-api-rules`、`python-testing-rules`。收益：规则集中维护统一更新；多仓库行为一致。

故障排除（原文四条）：

- 不遵循 `.md` 记忆文件：记忆文件是上下文提示不是强制配置；模糊/冲突规则不保证执行。排查：运行 `/memory`（或等效命令）确认加载；检查文件是否在允许加载的路径/作用域；检查多文件冲突——同行为不同指令时 Agent 可能随机选一。
- 不知道自动记忆存了什么：运行 `/memory` 查看当前自动记忆目录；自动记忆以 Markdown 文件存储，可直接读改删。
- 记忆文件太大：占上下文、降低遵循度、增加冲突概率。拆多个 Markdown 文件，用 `@path/to/file` 引用或拆到 `rules/`。
- 指令在上下文压缩后消失：记忆文件会在压缩后**重新从磁盘加载**，只有写入记忆文件的内容持续存在；压缩后消失的规则说明只存在于对话中。解决：长期指令写入 `.md` 记忆文件，不要只在对话中说明。

### 2.4 common-workflow（常用工作流）

配方型页面，全部以 Claude Code 为示例载体：

- **理解新代码库**：`cd /path/to/project` → `claude` → "give me an overview of this codebase" → 深入特定组件（"explain the main architecture patterns used here" / "what are the key data models?" / "how is authentication handled?"）。提示：从广泛问题开始再缩小；问编码约定和模式；请求项目术语词汇表。查代码：让 Agent 找相关文件（"find the files that handle user authentication"）→ 问组件如何交互 → 追执行流程（"trace the login process from front-end to database"）。
- **修 bug**：分享错误（"I'm seeing an error when I run npm test"）→ 请求修复建议 → 应用修复。提示：给重现命令和堆栈跟踪；提及重现步骤；说明错误是间歇性还是持续性。
- **重构**：识别遗留代码（"find deprecated API usage"）→ 获取建议 → 安全应用（"refactor utils.js to use ES2024 features while maintaining the same behavior"）→ 验证（"run tests"）。提示：要求解释现代方法优势；需要时保持向后兼容；以小的可测试的增量进行重构。
- **专门的 subagents**：`/agents` 查看并创建。三种用法：自动委派（"review my recent code changes for security issues"、"run all tests and fix any failures"）；显式点名（"use the code-reviewer subagent to check the auth module"、"have the debugger subagent investigate why users can't log in"）；自建（`/agents` → Create New subagent，定义：唯一标识符如 `code-reviewer`/`api-designer`、何时使用、可访问哪些工具、角色行为系统提示）。提示：在 `.coding agent/agents/`（原文如此）创建项目级 subagents 供团队共享；用描述性 `description` 字段启用自动委派；**限制每个 subagent 的工具访问权限为实际所需**。
- **Plan Mode**：限制 Coding Agent 只用**只读操作（read-only tools）**分析代码库先出计划不改代码；适用场景：复杂功能开发（多文件多步修改）、代码库分析（动手前系统理解结构）、方案讨论（反复确认需求和思路再执行）。Claude Code 实操：会话内 Shift+Tab 循环切权限模式（Normal → Auto-Accept 显示 `⏵⏵ accept edits on` → Plan 显示 `⏸ plan mode on`）；启动即 Plan：`claude --permission-mode plan`；无头模式：`claude --permission-mode plan -p "Analyze the authentication system and suggest improvements"`；Plan Mode 下 Claude 经 `AskUserQuestion` 工具主动提问澄清后才出计划；`Ctrl+G` 在默认文本编辑器中打开计划可直接编辑；默认 Plan 配置：`.claude/settings.json` 中 `{"permissions": {"defaultMode": "plan"}}`。
- **编写测试**：找未覆盖代码（"find functions in NotificationsService.swift that are not covered by tests"）→ 生成测试框架 → 补边界用例 → 运行并修复。
- **创建 PR**：直接说 "create a pr for my changes"，或分步：总结更改 → "create a pr" → 审查细化。
- **文档**：找未记录代码 → 生成 JSDoc → 审查增强 → 验证符合项目标准。提示：指定文档样式；请求示例；优先公共 API、接口和复杂逻辑。
- **图像**：拖放 / ctrl+v 粘贴到 CLI（不用 cmd+v）/ 给路径 `Analyze this image: /path/to/your/image.png`；然后描述分析、结合图提问（"Here's a screenshot of the error. What's causing it?"）、从视觉获取代码建议（"Generate CSS to match this design mockup"）。
- **`@` 引用**：`@src/utils/auth.js` 引用单文件（完整内容入对话）；`@src/components` 引用目录（带文件信息的目录列表）；`@github:repos/owner/repo/issues` 引用 MCP 资源。

### 2.5 best-practice（最佳实践）

十条框架（原文小标题）：

1. **将 Coding Agent 视为协作者而不是一次性助手**：持续通过项目说明文件、配置规则、工具接入、技能沉淀改进 Agent 行为；价值来自"模型能力与开发工作流的结合"。
2. **任务输入结构化——上下文比提示技巧更重要**：有效任务描述四要素：**目标（Goal）**（要实现的功能或修改）、**上下文（Context）**（相关文件、错误信息、文档或示例）、**约束（Constraints）**（工程规范：代码风格、架构规则、安全要求、依赖限制）、**完成标准（Done when）**（判断条件：测试通过、行为变化、bug 不再复现）。
3. **复杂任务先规划再执行**：直接写码易逻辑错误反复修改；规划阶段含探索代码结构、确认修改范围；有的工具提供专门 Plan 模式在实现前生成完整执行计划。
4. **重复规则沉淀为项目级配置文件**：目录结构、构建命令、测试流程、代码规范、PR 流程不该每次写 prompt。原则一句话：**临时指令写在 prompt 中，长期规则写入项目级配置文件**。
5. **执行环境决定 Agent 的能力**：效果不稳定常归因模型，实际多来自执行环境配置不完整。典型故障：无法定位项目目录、无权限读写关键文件、无法运行构建测试命令、无法访问外部工具。环境配置机制应覆盖：默认模型或推理强度、文件读写权限与沙箱策略、允许执行的命令、外部工具连接；重点配置四类：项目工作目录与代码访问权限、可执行命令范围（build/test/lint）、外部工具或数据源连接、团队统一默认行为。三类上下文：**任务上下文（Task Context）**（当前 prompt 与输入）、**项目上下文（Project Context）**（仓库结构与工程规则）、**环境上下文（Environment Context）**（工具、权限与执行环境）——环境上下文决定 Agent 能做什么、做到什么程度。
6. **参与完整开发闭环（Development Loop）**：五步：实现代码修改 → 编写或更新测试 → 运行测试套件 → 执行代码检查（lint/格式/类型） → 审查代码变更（diff、回归风险、异常修改）。定位从代码生成工具（code generator）转为开发循环中的执行单元（execution node）。
7. **通过 MCP 扩展上下文**：外部信息（Issue 系统、CI/CD 状态、数据库结构、API 文档）从人工复制粘贴转向工具直接查询；Agent 从代码仓库内执行者变为面向真实研发环境的协作节点。
8. **重复流程沉淀为 Skills**：Skill = 结构化任务模板。判断法则：**如果某段提示词或任务流程被反复使用，它就应该被沉淀为一个 Skill**。用法从即时对话驱动转向基于工作流的任务执行。
9. **稳定流程进一步自动化（Automation）**：Automation 是 Skill 的下一层——Skill 定义任务执行方法，Automation 决定任务何时触发如何持续运行（版本发布触发、每周生成、CI 完成后运行）；角色从交互式工具（interactive tool）转为持续运行的开发辅助系统（continuous assistant）。
10. **合理管理 Agent 会话**：会话是持续积累上下文、推理、执行结果的工作线程。实践：每个任务使用独立线程；避免线程过长（摘要/压缩减负）；分支任务创建新线程；定期压缩历史上下文。复杂场景引入多 Agent 协作：子任务交独立 Agent，主 Agent 协调整体——保持主任务上下文清晰同时提高效率。会话管理本质是**上下文治理（context management）机制**。

## 3. 对 GLM-Hourness 的启示

对照六插件行逐条映射。与 ZCode 已知逆向结论（effort 五档、thinking budget、todo 10+10 提醒、deferred 工具、MEMORY.md 体系）的印证/出入在每条内标注。

### 3.1 dsh-llm-glm（transport）

- 板块内容基本不涉及网络层，但对 transport 有一个间接约束：GLM Coding Plan 面向"Claude Code、Codex、Cline、Cursor、Copilot 等"CLI/IDE 形态的 Coding Agent 高频调用设计（how-coding-agent-works 开篇）。说明 ZCode 训练分布假想的客户端是 Claude Code 式 CLI agent，transport 层把 GLM 接成 DSH provider 时保持 Anthropic 风格 messages/tools 语义即可贴近训练分布；无需模拟 IDE 补全类接口。
- best-practice 第 5 条"指定默认模型或推理强度"是官方明确承认的配置面：推理强度（即 effort 档位）属于环境配置机制的组成部分。**与 ZCode 逆向的 effort 五档相互印证**——官方把"推理强度"列为 Agent 可配置默认值，支持在插件层透出档位控制。
- MCP servers"会话开始时加载工具定义、每次请求都付上下文成本"（agentic-extension 成本表）——transport 层若做工具定义裁剪（配合 toolsearch 懒加载），是官方成本模型直接支持的优化方向。

### 3.2 dsh-glm-prompt（方言）

- **五页通篇以 Claude Code 生态为方言基准**：CLAUDE.md、`/init`、`/memory`、`/agents`、Plan Mode（Shift+Tab、`--permission-mode plan`、`⏸ plan mode on`）、AskUserQuestion、`@path` 引用、`disable-model-invocation: true` frontmatter。dsh-glm-prompt 的方言层目标与官方文档预期完全同向：**GLM 的 coding 训练分布就是围绕这套 Claude Code 式词汇与交互协议组织的**。方言翻译应优先覆盖这些 token/概念：项目记忆文件、计划模式、子代理命令、@引用、技能命令。
- how-coding-agent-works 的工具类别表（文件操作/搜索/命令执行/Web/代码分析）可当 dsh-glm-prompt 工具描述改写的分类骨架——把 DSH 工具描述归整到这五类语义下，更贴训练分布。
- best-practice 第 2 条四要素（Goal/Context/Constraints/Done when）值得吸收进插件的默认任务模板/系统提示：ZCode 分布下的模型被官方建议按此结构接收任务，prompt 方言层可以默认引导用户输入向此结构靠拢。
- 官方建议"复杂任务先规划再执行"（best-practice 第 3 条 + how-coding-agent-works 高效使用第 3 条）与 DSH 自身 plan mode 机制天然契合；方言层应保证 plan mode 状态词在 GLM 侧被正确理解。**与 todo 10+10 提醒的印证**：官方"复杂任务先规划、拆分步骤执行"是 todo 提醒机制的行为学基础，方向一致；但官方文档未出现任何 todo 条数/行数的具体数字，10+10 的具体取值属 ZCode 逆向独有结论，文档侧无法佐证也无冲突。

### 3.3 dsh-glm-toolsearch（懒加载）

- 板块最强的印证来源。agentic-extension 上下文成本节的核心论点：每种扩展都占上下文窗口，加载过多导致"模型忽略关键信息、Skills 触发不准确、无法正确遵循项目规则"——这正是懒加载要解决的问题，官方从成本侧给出了完备论证。
- 可直接吸收为默认行为的官方技巧：
  - Skill 默认只在会话开始加载**描述**，正文按需加载；`disable-model-invocation: true` 可把成本降为零。dsh-glm-toolsearch 对工具/技能元数据应采用同款"描述常驻、正文按取"两级结构。
  - 记忆机制页"能够按路径加载的规则，不要全量加载"三原则（主文件只留全局共识、专项规则模块化、按路径按需引入）——toolsearch 的工具暴露可类比：常用核心工具常驻，低频工具按上下文（当前目录/任务类型）动态挂载。
  - 记忆压缩后"重新从磁盘加载"记忆文件——懒加载的失效重取语义有官方行为参照。
- **与 deferred 工具的印证**：ZCode 逆向的 deferred 工具（延迟暴露）与官方 Skill "描述先行、正文按需"成本模型严丝合缝，属同一设计思想在工具与技能两个维度的体现。文档未直接描述"工具 defer"机制本身，印证是间接的（成本论证同源），无出入。

### 3.4 dsh-glm-memory（记忆）

- 印证最密集的一行。**MEMORY.md 体系直接印证**：memory-mechanism 页原文明说 subagent"维护自己的独立记忆目录，并在系统提示中自动包含 `MEMORY.md` 的前 200 行"——ZCode 逆向的 MEMORY.md 体系在官方文档有白纸黑字对应物，且给出硬参数：**前 200 行**注入系统提示；同页另一处"主记忆文件最好控制在 200 行以内"与之互证。dsh-glm-memory 的 MEMORY.md 裁剪预算应直接采用 200 行。
- 五级作用域（组织/项目/用户/本地/角色）+ "谁负责、谁共享、谁生效"原则可直接当 dsh-glm-memory 的作用域设计基准；组织级不可被个人设置排除、支持 MDM/Group Policy 集中分发，对应插件里 guard 与 memory 的交叉点。
- CLAUDE.md 叠加（additive）合并 + "更具体的规则优先生效"；MCP `local > project > user`；Skills `managed > user > project`；Hooks 合并执行——这套合并/覆盖矩阵是 dsh-glm-memory 多层级记忆文件合并规则的现成官方语义，照抄风险最低。
- 指令型/学习型记忆分离（规范进指令文件、经验进自动记忆）值得作为插件默认行为：防止经验性写入污染规则层。记忆写法正反例（"所有新增 TypeScript 文件使用 2 空格缩进"式可验证规则）可写进插件生成的记忆模板引导。
- 故障排除四条可转化为插件自检功能：`/memory` 类查看命令、多文件冲突检测（同行为不同指令会"随机选一"）、大文件拆分建议、压缩后重载保真。
- 按路径加载规则（`.claude/rules/` 路径限定）与 subagent 独立记忆目录（测试/审查/文档/重构各记各的）两条，官方明确为最佳实践；dsh-glm-memory 若做规则目录应支持路径作用域，dsh-glm-workflow 的子代理应配独立记忆。

### 3.5 dsh-glm-guard（权限圈禁）

- how-coding-agent-works 安全节给出官方权限面：变更回滚（快照）+ 权限三问（是否允许自动修改代码、是否允许执行命令、是否需要人工确认）。guard 的最小权限模型可对齐这三问。
- best-practice 第 5 条环境配置机制四项（默认模型或推理强度、文件读写权限与沙箱策略、允许执行的命令、外部工具连接）是 guard 配置面的官方清单；"环境上下文决定 Agent 能够做什么以及能够做到什么程度"可作为 guard 的设计宗旨句。
- Plan Mode = 只读操作圈禁 + AskUserQuestion 澄清——官方给出的成熟只读白名单模式；guard 实现"分析-only"档位时有官方行为模板可循（`.claude/settings.json` 的 `permissions.defaultMode: "plan"` 是其持久化形态）。
- 记忆页组织级"敏感目录不可读写规则"列为组织级记忆典型内容——guard 的路径黑名单可挂在组织级记忆/配置层，与 memory 作用域联动。
- common-workflow subagent 节"限制工具访问权限为每个 subagent 实际需要的内容"是最小权限原则在子代理维度的官方表述，guard 需支持 per-subagent 工具白名单。
- ZCode 逆向侧（effort/deferred 等）与 guard 无直接交点；thinking budget 与权限无关联，无印证也无出入。

### 3.6 dsh-glm-workflow（多代理工作流）

- 官方组件全集：Subagents（独立上下文、返回摘要）、Agent Teams（多会话并行协作）、Hooks（循环外确定性脚本）、Plugins（打包分发）。dsh-glm-workflow 的多代理编排可对齐 Subagent + Agent Teams 两层：单委托与并行编队。
- "Subagent 在独立上下文中完成工作，只向主会话返回摘要结果，从而避免占用主上下文"——workflow 层的上下文隔离契约与 DSH subagent 机制一致，方言层需保证 GLM 理解"只返回摘要"的输出契约。
- Subagent 定义四要素（唯一标识符、何时使用、可访问工具、系统提示）+ `description` 字段驱动自动委派——插件生成子代理模板时的字段清单。
- Skills 与 Subagent 组合（Subagent 预载 Skills、`/audit` 同时跑安全与性能检查）、Hook + MCP 组合（改关键文件后发通知）是官方给出的两条编队配方，可做成 workflow 预设。
- best-practice 第 10 条多 Agent 协作（子任务独立 Agent、主 Agent 协调）与第 9 条 Automation（Skill 稳定后定时/事件触发运行：发布触发、每周总结、CI 后运行）为 workflow 层的触发模型提供官方参照；DSH 的 goal/reminder 机制可映射到该 Automation 语义。
- 会话治理四实践（任务独立线程、避免线程过长、分支任务开新线程、定期压缩历史）可吸收为 workflow 层会话分配的默认策略。
- **与 todo 10+10、effort、thinking budget 的关系**：workflow 层文档未涉及这些逆向参数；"先规划拆步"思想与 todo 提醒同源（见 3.2），其余无交集。

### 3.7 汇总：印证与出入一览

| ZCode 逆向结论 | 文档侧证据 | 判定 |
| - | - | - |
| MEMORY.md 体系 | memory-mechanism：subagent 系统提示自动含 `MEMORY.md` 前 200 行 | **直接印证**，且给出 200 行硬预算 |
| effort 五档 | best-practice 第 5 条"默认模型或推理强度"为官方配置面 | 间接印证（推理强度可配置被官方承认）；"五档"具体档数文档无载 |
| thinking budget | 全板块无对应表述 | 无印证无出入（文档不涉推理预算细节） |
| todo 10+10 提醒 | "复杂任务先规划再执行""拆分多个步骤逐步执行"多篇出现 | 方向印证；具体数字（10+10）文档无载，属逆向独有 |
| deferred 工具 | Skill"描述常驻、正文按需"+ `disable-model-invocation: true` + 规则按路径加载 | 同源设计思想强印证；"工具 defer"机制本身文档未直接描述 |
| Claude Code 方言基准 | 五页通篇以 Claude Code 为参考生态 | 强印证：GLM coding 训练分布的假想宿主即 Claude Code 式 agent |

无发现"出入"（矛盾）项。文档侧信息与 ZCode 逆向结论全部相容；差异仅在于文档不载具体参数（档数、条数、budget 数值），此类参数仍以逆向结论为准。

## 4. 抓取记录

- sitemap.xml：200，37949 字节，其中 coding-plan 板块 20 URL，learning-resources 5 URL。
- 5 个 HTML 页面（180k–415k）+ 5 个 `.md` 源（8k–17k）全部抓取成功，markdown 源全文读取。
- 环境备注：docs.bigmodel.cn 经本机代理 fake-IP（198.18.x.x）解析，web_fetch 工具拒绝非公网 IP，Windows schannel 亦有故障；改用 Python urllib（OpenSSL 栈）经系统代理抓取成功。原始文件存 `.llm/tmp_bm/`。
