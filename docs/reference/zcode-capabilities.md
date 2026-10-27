# ZCode（GLM Coding Agent）能力技术参考手册

供 DSH（DeepSeek Harness）插件工程参考。定位：ZCode 各项 harness 能力的机制级功能文档——描述 ZCode 如何做、为何这样做、哪些设计点与 GLM 训练特性耦合。不规定 DSH 侧实现方式；DSH 侧的架构落点（bundle 结构、接管点）仅作为索引附注。

## 0. 文档定位与证据基准

| 证据源 | 版本/位置 | 说明 |
|---|---|---|
| ZCode 客户端 bundle | 3.16.3，`resources/glm/zcode.cjs`，15,245,023 B，MD5 `51257c0d11da7dc56c157d92e7048146` | 混淆单行 bundle，按字符串偏移定位（附录 A） |
| ZCode 会话协议采样 | 3.16.3 实跑会话的系统提示词与合成消息 | 文案为发给模型的原文（第一手） |
| DSH 源码 | master（MIT）本地克隆 | 仅用于落点索引（附录 B） |
| 行为实验 | GLM-5.3 双臂 n=3（L1-L2 探针） | 附录 C |

ZCode 未开源：无源码工程、无官方文档。本手册全部机制描述来自对混淆 bundle 的逆向实读与会话协议采样；每章末给出证据偏移。标注【未验证】的条目为推断或未实测项。

## 1. 总体架构：系统提示词、请求组装与合成消息

### 1.1 系统提示词分节拼装

系统提示词由一组 section builder 函数产出后拼装。通用 section 结构（`createDesktopSection`，偏移 5049753）：

```ts
{
  name: string,            // 节名，如 "ZCode Desktop Context"
  source: string,          // 来源标签：configured-default | user | plugin | git | provider | auto-detected | ...
  injectionTarget: "system" | "meta_user",   // 注入通道
  cacheHint: "stable" | "dynamic",           // 缓存友好度提示
  chars, tokens,           // 预算计量
  content: string,
  preview: string          // 前 100 字符
}
```

- `injectionTarget`：`system` = 进系统提示词数组；`meta_user` = 进合成用户消息通道（见 1.3）。
- `cacheHint`：`stable` 节排前缀保 KV cache 命中；`dynamic` 节（日期、git 状态等）靠后。
- 多数 builder 产出 `{default, additional:{beforeDefault}}` 槽位，允许运行时在默认文案前插入增量段。

实测可见的 builder 全集（18 个，bundle 内以 `r(fn,"buildXxxSection")` 注册）：

| Builder | 内容 | cacheHint 语义 |
|---|---|---|
| CliPrefix | 身份开头："You are ZCode, an interactive coding agent" | stable |
| Identity | 角色身份扩展 | stable |
| WorkflowActorIdentity | 工作流场景下的 actor 身份 | stable |
| EnvInfo | `# Environment`：主工作目录/附加目录/git 仓库标记/平台/Shell/OS 版本 | dynamic |
| GitSystemContext | gitStatus 快照（branch/main/user/status/recent commits；clean/dirty/unknown），附「快照不随会话更新」声明 | dynamic |
| Skills | 技能体系说明 | stable |
| RequestUserContext | 单次请求附加上下文 | dynamic |
| CurrentDate | 当前日期 | dynamic |
| Memory | 持久记忆节（见第 7 章） | stable |
| DesktopContext | Desktop 宿主特性（Gen UI、文件 URL、行内代码注释指令） | stable |
| SessionGuidance | `# Session-specific guidance`（技能调用规矩等，按装载能力条件拼装） | stable |
| DynamicBehavior | 自主运行/计划模式等行为段 | stable |
| OutputStyle | 输出风格 | stable |
| ContextManagement | 上下文压缩说明 + 自主性行为准则 | stable |
| WorkflowReportsNotification / Manifest | 工作流报告通知/清单 | dynamic |
| WorkflowArtifactsNotification / Manifest | 工作流工件通知/清单 | dynamic |

### 1.2 Anthropic 协议请求组装

- 端点：BigModel anthropic 兼容通道（`https://open.bigmodel.cn/api/anthropic`），消息协议 anthropic-messages。
- 缓存断点：请求级 `cacheControl: {type:"ephemeral", ttl?: "5m"|"1h"}`（偏移 3587213）；工具级 cache_control 见 2.2。
- beta 能力集：按请求能力动态添加 header 标记（集合注入模式），实测枚举：`advanced-tool-use-2025-11-20`、`structured-outputs-2025-11-13`、`code-execution-2025-05-22`、`code-execution-2025-08-25`。
- 工具定义组装字段（偏移 3544479）：`{name, description, input_schema, cache_control?, eager_input_streaming?, strict?, defer_loading?, allowed_callers?}`。`defer_loading` 为工具级懒加载开关（与第 3 章联动）。
- 客户端身份头（反代工程已逆向的语义）：`User-Agent`、`X-ZCode-App-Version`、`X-Title`、`X-ZCode-Agent`、`HTTP-Referer`、`X-Platform`、`X-Os-Category`、`X-Os-Version`；请求签名 clientSigning V4。绑定计费渠道，非协议必需。

### 1.3 合成消息体系

harness 主动注入的消息有三类通道：

1. `<system-reminder>` 块：以用户消息角色包裹（"system may send updates... via mid-conversation system turns"为系统提示词 Harness 节声明）。载荷 schema（偏移 1503140）：text 与 `tool_reference` 混排数组。用途：todo 提醒、deferred 工具名单变更、记忆召回、日期变更。
2. 合成 user notice：`persistSyntheticUserNoticeForSession`（偏移 13348079）——带来源标签（如 `Sy("todo_reminder", body)`）写入会话持久化，注入为用户角色消息。
3. `meta_user` 注入目标：section 体系第二通道（1.1），机制同源。

设计含义：ZCode 的所有 harness→模型单向下行信息都以「用户角色 + 显式标签/包裹块」形态出现，而非 system 角色消息——与 anthropic 协议下 system 角色仅用于开场的约束一致。

## 2. 内置工具集

### 2.1 工具面（3.16.3 会话实测装载）

默认直载：`TodoWrite`、`Bash`、`Read`、`Write`、`Edit`、`Glob`、`Grep`、`ToolSearch`。
按需/deferred 直载能力位：`Skill`。
deferred（仅报名，见第 3 章）：`WebSearch`、`WebFetch`、`Agent`（子代理派发）、`SendMessage`、`TaskOutput`、`TaskStop`、workflow 族（`AmendWorkflow`、`CreateWorkflow` 等）、计划模式族（`EnterPlanMode`/`ExitPlanMode`）、全部 `mcp__*` 工具。
bundle 内另有内置工具名单组（偏移 1036469，`Yxr` 数组）：`Read/Write/Edit/ApplyPatch/Bash/Glob/Grep/WebFetch/WebSearch/web_search/TodoRead/TodoWrite/GoalRead/ReadSessionContext/AskUserQuestion/SendMessage/RespondToCoordinator/TaskOutput/TaskStop/js/js_reset/js_add_node_module_dir/mcp__node_repl__*`——这是 runtime-mode 判定用的白名单，非装载清单。

各工具 schema 为发给模型的原文，DSH 侧可直接对齐字段命名与语义（会话采样可复现完整 JSONSchema）。

### 2.2 工具定义关键细节

- 工具级可选字段：`cache_control`（工具列表缓存断点）、`strict`（严格 schema 模式，provider 不支持时警告并忽略）、`defer_loading`、`allowed_callers`、`eager_input_streaming`（流式输入）。
- 服务端工具按 provider 能力映射（偏移 3548503）：`anthropic.tool_search_regex_20251119` → `{type:"tool_search_tool_regex_20251119", name:"tool_search_tool_regex"}`；同型 bm25；`anthropic.code_execution_*` 同机制。

## 3. 工具懒加载（toolSearch / deferred tools）

### 3.1 设计动机

工具面膨胀时全量 schema 常驻上下文造成固定重发开销（实测：656 条 MCP schema 下单任务 token 为小工具面的 10 倍量级；跨 harness 研究显示同模型换 harness 通过率不变而成本差 3 倍，首发固定上下文 Claude Code 16,581 tok vs mini-SWE-agent 829 tok）。懒加载目标：注册表全量保留，上下文按需曝光。

### 3.2 机制

- 分层：注册表全量在客户端；请求只带活跃集合 schema；其余 deferred——上下文中仅有名字（`tool_reference` content block，`{type:"tool_reference", toolName}`，经 system-reminder 注入），模型不可调用。
- 检索工具双模式（设置枚举 `auto|native|local|off`，`appToolSearchModeSchema`）：
  - native：Anthropic 服务端检索器 `tool_search_tool_regex_20251119` / `tool_search_tool_bm25_20251119` + beta header `advanced-tool-use-2025-11-20`；匹配在服务端。工具名 `ToolSearch`。
  - local：客户端匹配，工具名 `LocalToolSearch`；query 支持 `select:<name>[,<name>...]` 精确拉取与空格关键词（不支持正则）；`max_results` 默认 5。
- 拉取结果注入：命中工具完整 JSONSchema 以 `<functions>` 块返回，每工具一行 `<function>{"description":...,"name":...,"parameters":{...}}</function>`；随后工具进入活跃集合。
- 装载状态机（`mOr`）：`{addedNames, removedNames, readdedNames}`，约束 readded ⊆ added。
  - 回收：上下文管理阶段将闲置工具卸载回 deferred，注入提示：`N deferred tools are no longer available: <摘要>. Do not search for them — ToolSearch will return no match.`（长名单按 `mcp__<server>__` 前缀聚合折叠，函数 `Mgo`）。
  - 重载：`available again (names announced earlier in this conversation)... Load via ToolSearch as before.`
- 工具级 `defer_loading` 字段（2.2）与该体系联动：标记为可延迟装载的工具默认进 deferred 集合。
- 附属概念 DeferredToolCall：对已装载 deferred 工具存在统一调用包装的示例（偏移 4975227），属高级工具用法，机制未完全取证【未验证】。

### 3.3 GLM 训练特性相关

- 系统提示词对 deferred 机制有显式说明段（"Some tools are deferred..."运行时拼装），模型侧预期经过训练对齐：能主动检索、遵守「no longer available 不再检索」约束。
- native 检索器为 Anthropic 协议类型，BigModel 端点是否对非 ZCode 客户端透传未验证【未验证】。

### 3.4 验收参照

1. 装载 50+ 工具时首轮请求不含任何 deferred 工具 parameters schema。
2. `select:` 与关键词两形态均可拉取并调用成功。
3. 回收提示后对已回收工具检索返回空。
4. 同任务 token 相对全量装载降 ≥50%，完成率不降。

## 4. Todo 体系与提醒点

### 4.1 TodoWrite 工具

结构化任务清单工具，整表替换语义（每次写入全量 todos 数组）。会话采样 schema：每个条目必含 `content`、`status`（pending/in_progress/completed）、`priority`（字符串枚举，实测样本值 "high"）三字段，拒绝缺省。附带 todo 读取工具（名单组中的 `TodoRead`，默认面未装载）。

### 4.2 提醒点机制（偏移 12963381-12965769、13348079）

**触发条件**（双阈值，常量 `j4o = Object.freeze({TURNS_SINCE_WRITE:10, TURNS_BETWEEN_REMINDERS:10})`）：

```
turnsSinceLastTodoWrite >= 10 && turnsSinceLastReminder >= 10
```

**启用门控**（调用点原文语义）：

```
工具面含 TodoWrite && 双阈值满足 && !/claude/i.test(modelId)
```

即模型为 claude 系时提醒整体跳过——ZCode 官方认定 claude 不需要 todo 提醒；对 GLM 启用，这是模型特性驱动的分歧点。

**提醒文案**（原文）：

> The TodoWrite tool hasn't been used recently. If you're working on tasks that would benefit from tracking progress, consider the TodoWrite tool to track progress. Also consider cleaning up the todo list if it has become stale and no longer matches what you are working on. Only use it if it's relevant to the current work. This is just a gentle reminder - ignore if not applicable.

会话已有 todo 时追加：`Here are the existing contents of your todo list:` + 当前清单回显。

**注入形态**：`Sy("todo_reminder", body)` 构造带标签载荷 → `WS()` 注入请求流 → `persistSyntheticUserNoticeForSession` 持久化为会话内合成用户消息。以 `<system-reminder>` 包裹呈现。

### 4.3 同族合成提醒

- 日期变更提醒：`buildDateChangeReminderBody`，同合成 user notice 体系。
- 运行时模式（计划模式）提醒：独立节流常量（`TURNS_BETWEEN_ATTACHMENTS`、`FULL_REMINDER_EVERY_N_ATTACHMENTS`——每 N 次附挂发全量提醒、其余发简版）。
- 输出风格提醒：`${styleName} output style is active. Remember to follow the specific guidelines for this style.`

### 4.4 GLM 训练特性相关

- 三必含字段（含 priority）：GLM 在 ZCode 下的训练习惯带 priority；不带该字段的其他 harness todo schema 属已知不兼容点。
- 提醒对 GLM 开放、对 claude 关闭：说明 GLM 训练侧被强化过「响应 todo 提醒维持清单纪律」的行为回路；移植提醒机制对长任务稳定性有正预期。

## 5. 上下文压缩（compact）

### 5.1 触发

- 自动：`autoCompactThresholdTokens`（contextWindow 对象 `{usedTokens, maxTokens, autoCompactThresholdTokens: nullable}`；nullable 表示可禁用）。超阈值时自动触发，事件字段含 `willRetriggerNextTurn`（连续压缩标记）、`truePostCompactTokenCount`。
- 触发模式枚举（timeline 事件）：`manual | auto | partial | reactive`——手动、自动、部分压缩（保留近期消息）、反应式（被动触发）。
- 压缩计量事件：`summarizedMessageCount`、`keptMessageCount`、`lastSummarizedMessageId`。

### 5.2 压缩提示词（bundle 偏移 5062377 起，原文结构）

任务指令：

> Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions. ... Before providing your final summary, wrap your analysis in `<analysis>` tags ...

分析阶段要求（逐消息时序分析）：识别用户显式请求与意图、处理方式、关键决策/技术概念/代码模式、细节（文件名/完整代码片段/函数签名/文件编辑/错误与修复）、**用户反馈（用户要求改变做法时特别关注）**、**安全相关指令逐字保留**（原文：`Note any security-relevant instructions or constraints the user stated... These MUST be preserved verbatim in the summary so they continue to apply after compaction.`）。

产物结构要求（9 节）：

1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections（强调最近消息、含完整代码片段与读写动机）
4. Errors and fixes（含用户纠错反馈）
5. Problem Solving
6. All user messages（列出全部非工具结果的用户消息；安全指令 verbatim 保留）
7. Pending Tasks
8. Current Work（压缩前正在做什么，含文件名与代码片段）
9. Optional Next Step（约束：只列与用户最近显式请求直接相关的步骤；任务已收尾且用户未要求则不列；禁止捡起陈旧或已完成任务）

格式硬约束（REMINDER 段，原文）：

> Do NOT call any tools. Respond with plain text only — an `<analysis>` block followed by a `<summary>` block. Tool calls will be rejected and you will fail the task.

### 5.3 产物处理与续接

- 客户端解析（偏移 5060814）：剥离 `<analysis>...</analysis>`；`<summary>X</summary>` 改写为 `Summary: X`；空白归一。
- 续接声明模板（`v0t`）：

```
This session is being continued from a previous conversation that ran out of context.
The summary below covers the earlier portion of the conversation. {摘要}
[可选] If you need specific details from before compaction (like exact code snippets,
error messages, or content you generated), read the full transcript at: {transcriptPath}
[可选，partial 时] Recent messages are {preserved...}
```

transcriptPath 引导模型按需回读完整压缩前记录——压缩连续性的兜底设计。

### 5.4 GLM 训练特性相关

- `<analysis>` 先行 + 9 节结构 + verbatim 安全条款为 ZCode 与 GLM 的成熟配对形态；双臂实验中 ZCode 侧三轮探针无压缩误续现象（附录 C，样本量小）。
- 「只回 DONE」类宽松中文指令在两侧同为弱项（模型特性，非方言差异）。

## 6. Web 搜索与网页阅读（服务端工具）

### 6.1 机制

ZCode 的搜索与网页阅读是 **Z.ai 渠道的服务端工具**，非客户端实现：

- 执行证据：调用时输出标注 `Executing on server...`，由 BigModel 网关执行后回传结果。
- 客户端证据：zcode.cjs 全文（15.2MB）对 `web_search_prime`、`webReader`、`web_reader`、translation 等关键词零命中——工具定义与执行均在服务端，随渠道下发。
- 形态：搜索工具 `web_search_prime`（入参 search_query/location/content_size/搜索域过滤/时间范围；返回 title/link/content/summary/site 结构化结果）；网页阅读 `webReader` 以 MCP 形态挂载（`mcp__web_reader__webReader`，入参 url/return_format/retain_images 等）。
- 渠道绑定：计费与身份走 ZCode 端点+身份头；对非 ZCode 客户端是否放行未验证【未验证】。

### 6.2 等价能力移植参照（DSH 侧现状索引）

DSH 原生 `dsh-tool-web`（web_search/web_fetch，schema 稳定）+ `dsh-web`（ctx.web，提供方按操作解析，本包不发请求）。官方后端包：`web-search-deepseek`、`web-search-exa`、`web-search-perplexity`、`web-fetch-http`；另有 `browser-use`（真浏览器重方案）。无 BigModel 后端——可按 ctx.web 后端接口自建 provider（参照 web-search-exa 结构），走 BigModel 开放平台搜索 API + 现有 GLM key。API 端点细节以智谱开放平台文档为准【未验证】。

## 7. 持久记忆

### 7.1 机制（buildMemorySection/buildMemoryContent，偏移 5045359）

目录：`<memory-root>/<project-hash>/memory/`，索引文件 `MEMORY.md` 与会话同级注入。

单条记忆文件格式（系统提示词模板原文）：

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary — used to decide relevance during recall>
metadata:
  type: user | feedback | project | reference
---

<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines.
Link related memories with [[their-name]].>
```

- 四类型语义：`user`（用户画像：角色/专长/偏好）、`feedback`（用户对工作方式的纠正与确认，必须含 why）、`project`（进行中的工作/目标/约束，相对日期转绝对日期）、`reference`（外部资源指针）。
- `[[name]]` 双链：允许指向尚未存在的记忆（标记待写）。
- 写入纪律（提示词原文要求）：写入前查重、更新而非新建；错误记忆删除；不存代码库/git 历史已有内容；不存仅本会话相关内容；用户要求记住 repo 已有内容时，反问非显而易见点再存。
- 索引规则：`MEMORY.md` 每会话载入，一行一条 `- [Title](file.md) — hook`，禁止放记忆正文。

### 7.2 检索双分支（resolveProjectMemoryRetrievalBranch）

- `default-index`：索引全量常驻（默认）。
- `semantic-recall`：按相关性召回，命中记忆以 `<system-reminder>` 注入；提示词声明召回内容为背景上下文非指令、且有时效（引用的文件/函数/旗标需先验证存在）。

### 7.3 索引预算与超载

`MEMORY.md` 有行数上限；超载时部分载入并注入警告：`MEMORY.md is {N} lines (limit: {max}). Only part of it was loaded. Keep index entries to one line under ~200 chars; move detail into topic files.`（偏移 5042202）。

### 7.4 DSH 侧现状索引

DSH 无原生记忆体系（无包、无文档）。可经 system prompt section（`ctx.systemPrompt.section()`）注入索引 + fs 工具写入 + 合成消息召回完整移植；v1 建议 default-index 模式（无检索服务依赖）。

## 8. GLM 训练特性耦合点汇总

以下设计点为「模型特性驱动」而非通用工程选择，移植时优先保持形态：

| # | 耦合点 | 证据 | 移植建议 |
|---|---|---|---|
| 1 | todo 条目三必含字段（content/status/priority） | 会话 schema 采样 | 对齐字段集；GLM 训练惯带 priority，缺失即已知不兼容 |
| 2 | todo 提醒对 GLM 启用、对 claude 系跳过 | `!/claude/i.test(modelId)` 偏移 13348079 | GLM 路由保留提醒回路（10+10 双阈值） |
| 3 | 合成下行信息走用户角色（system-reminder/合成 user notice），system 角色仅开场 | 1.3 全部证据 | 保持通道形态；DSH inject/steer/followup 同构，天然兼容 |
| 4 | compact 的 `<analysis>` 先行 + 9 节 summary + 安全指令 verbatim 保留 | 5.2 原文 | 提示词结构对 GLM 成熟配对，可直接借鉴 |
| 5 | deferred 工具机制的系统提示词声明段与「不再检索」服从性 | 3.3 | GLM 已训练对齐该协议；DSH 复刻时保留文案语义 |
| 6 | 服务端工具（web 搜索/翻译）渠道绑定 | 6.1 | 非 ZCode 身份可用性未验证；不可用时走独立搜索后端等价实现 |
| 7 | 身份头与 clientSigning V4 | 反代工程逆向 | 仅影响计费渠道与套餐识别，不影响模型行为 |
| 8 | 日期变更提醒、输出风格提醒等合成提醒族 | 4.3 | 低成本行为增强，可选移植 |

非耦合项（通用工程，DSH 已有等价物或哲学不同）：请求组装字段、缓存断点策略、工具面大小、子代理体系、MCP 挂载。

## 9. 附录

### 附录 A：zcode.cjs 关键偏移索引（3.16.3）

| 偏移 | 内容 |
|---|---|
| 1036469 | 内置工具名单组 `Yxr`（runtime-mode 白名单） |
| 1104117 | `appToolSearchModeSchema` |
| 12963381-12965769 | todo 提醒：触发函数 `U4o`、文案 `z4o`、常量 `j4o`（10/10） |
| 1331425 | compact 事件字段（autoCompactThreshold/willRetriggerNextTurn 等） |
| 13348079 | todo 提醒调用点：claude 检测跳过 + persistSyntheticUserNotice |
| 1502670-1503345 | toolSearch 模式常量（$b/PM/icn=5/fOr beta/mOr/kvs/Qge/ust） |
| 3543618-3545013 | 工具组装字段（cache_control/strict/defer_loading/allowed_callers）+ 服务端工具类型映射 |
| 3587213-3589871 | 请求级 cacheControl（ephemeral 5m/1h）、maxUses/caching schema |
| 4972704-4975227 | LocalToolSearch 描述与 DeferredToolCall 示例 |
| 4973912 | deferred 回收/重载文案 + `Mgo` 聚合 |
| 4992493-4999297 | CliPrefix（"You are ZCode..."）、Harness 节、Environment 节字段 |
| 5042202-5049753 | MEMORY.md 超载警告、Memory 提示词模板 `Eda`、`createDesktopSection` |
| 5051716-5054150 | Communication/ContextManagement 节槽位结构 |
| 5060814-5064672 | compact 产物解析 `v0t` 续接模板、压缩提示词 `Lda`/`Nda` 全文 |

### 附录 B：DSH 侧落点索引

| 能力 | DSH 源码/文档位置 |
|---|---|
| 系统提示词接管 | `packages/core/system-prompt/`（section/variable、assemble waterfall） |
| 工具注册 | 工具插件包（tool/call 事件）；工具目录 `docs/tool-catalog.zh.md` |
| web 后端 | `packages/web/`（dsh-web、web-search-exa、web-search-perplexity、web-fetch-http） |
| MCP | `packages/mcp/`（mcp-client、mcp-resources） |
| 压缩 | `packages/compaction/` |
| skills | `packages/skill/skill-filesystem/`（~/.agents 与 ~/.dsh 双根） |
| 指令文件 | `packages/context/agent-instructions/`（AGENTS.md/CLAUDE.md 候选、用户全局文件） |
| 记忆 | 无原生对应【需插件】 |

### 附录 C：双臂行为实验摘要（GLM-5.3，L1-L2 探针，n=3/臂）

- ZCode 臂：18/28/22 工具调用，154/230/168s，51/95/67 万 token；DSH 臂：11/13/17 调用，43/74/104s，4.6-8.7 万 token。量级差来自 ZCode 子代理静态 MCP schema 行李（656 条）。
- 两侧 todo 零失败、文件校验零幻觉、任务全部完成——基础工具面与合成消息体系无降智证据。
- 弱项两侧同现：「只回 DONE」中文松散指令执行（模型特性，非方言差异）。
- 未覆盖：compact 连续性、长程任务、故障注入（L3 探针集待跑）。

## 10. 补充：生成参数、身份文案与工程边界细节（2026-10-26 深挖）

### 10.1 thinking 与采样参数

请求组装（anthropic adapter，偏移 3603477-3606286）：

```js
{
  model, max_tokens: maxOutputTokens ?? 默认,
  temperature, top_k, top_p, stop_sequences,
  ...(thinking 启用) && { thinking: {
      type: "enabled" | "adaptive",
      ...(enabled && budget!=null) && { budget_tokens: budget },
      ...(adaptive) && { display: "omitted" | "summarized" }
  }},
  ...(effort || taskBudget || jsonSchema) && { output_config: {
      effort?, task_budget?: {type,total,remaining?}, format?: {type:"json_schema",schema}
  }},
  speed?, inference_geo?
}
```

- thinking 配置三态（内部 schema，偏移 3587040）：`{type:"enabled", budgetTokens?} | {type:"adaptive", display?:"omitted"|"summarized"} | {type:"disabled"}`；disabled 时请求不带 thinking 字段。
- **budget 缺省兜底**：enabled 且未给 budget 时注入默认 `{type:"enabled", budget_tokens: 1024}` 并记警告（偏移 3605953）。
- **thinking 启用（enabled/adaptive）时 temperature/top_p/top_k 全部剥离**（"not supported when thinking is enabled"，偏移 3606286）；temperature 有值时钳位 [0,1]（anthropic 上限 1.0）。presence_penalty 与 seed 在该 adapter 恒不支持。
- temperature/top_p 无静态默认值：组装层纯透传，实跑值取决于会话级/模型级配置（服务端下发的模型配置含此类字段，见 10.5）。[未取证实跑具体值]
- **effort 档位六枚举**：`none | minimal | low | medium | high | xhigh`（偏移 3666043）。UI 有 `/effort [list|<level>]` 命令切换会话档位（偏移 964202）；选中后经 `output_config.effort` 下发。
- max_tokens 与 budget_tokens 独立：max_tokens 取会话 maxOutputTokens 或模型级默认；budget 是 thinking 内部子字段（anthropic 语义 budget < max_tokens）。

### 10.2 四个 beta 头的触发条件（偏移 3544737-3545013）

| beta 头 | 触发条件 |
|---|---|
| `structured-outputs-2025-11-13` | 本次请求存在 `strict: true` 的工具（supportsStrictTools 开启且有 strict 工具） |
| `advanced-tool-use-2025-11-20` | 任一工具带 `input_examples` 或 `allowed_callers` 字段；tool_search 工具声明亦在此能力族 |
| `code-execution-2025-05-22` / `2025-08-25` | 请求声明对应版本 `anthropic.code_execution_*` 服务端工具时 |

### 10.3 身份节文案定案（偏移 4992508-4993369）

- **CliPrefix** 全文：`You are ZCode, an interactive coding agent`（仅此一句）。
- **Identity（Agent Identity 节）**：开头句二选一——OutputStyle 激活时 `You respond to the user according to the active Output Style below while using ZCode's tools and instructions.`；否则 `You are an interactive ZCode agent that helps users with software engineering tasks.` 随后拼接安全声明段（`d0o`，即 SECURITY_NOTICE 所在，偏移 4993369 之后）与 Harness 节。
- **Harness 节**六条原文：markdown 终端渲染、权限模式语义（denied=用户拒绝，勿原样重试）、system turns 声明（system-controlled，区别于工具结果；hook 输出按用户反馈对待）、优先专用文件/搜索工具、独立调用可并行、`file_path:line_number` 可点击引用。
- **agentsMd 节**（wda，偏移 5043397）：头 `# agentsMd` + `Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instruct...`，正文=用户指令（userInstructions）+ **MEMORY.md 索引内容（memoryRoot+memoryIndexContent）**——记忆索引经本节注入，非独立节。
- **系统提示词组装顺序**（偏移 5058423 实录）：... → SessionGuidance（按 guidanceToolNames/skills 条件）→ Memory 节（memoryRoot 存在时）→ EnvInfo → OutputStyle → ContextManagement → GitSystemContext → ...
- OutputStyle：默认风格文案=代码卫生三条（match surrounding code 等）；可选风格列表未在 bundle 静态字符串（服务端/用户配置下发）[未取证]。

### 10.4 semantic-recall 的结构化选记忆机制（偏移 3815965-3816671）

语义召回不是本地检索：请求 messages 注入两条 user 角色内容——`Available memories: ...` 与 `Select memories relevant: ...`——配合 `output_config.format = {type:"json_schema", schema{required:["selected_memories"]}}`，由**一次受 json_schema 约束的模型调用**完成相关性筛选；响应处理时这两条消息按前缀识别剥离。移植含义：语义召回可完全在插件层实现（构造同样的两条 user 消息 + 结构化输出），不依赖服务端能力。

### 10.5 模型表与 autoCompact 默认值

`"glm-5.3"` 等模型名字符串在 bundle 零命中——**模型目录（contextWindow/maxOutputTokens/thinking 默认/supportsNativeWebSearch 等字段）由服务端下发**，客户端 schema（Gme，偏移 550208）只定义字段形状：`{requiresMfjsToolSchema, contextWindow, inputFormat, outputFormat, supportsToolCall, supportsJsonSchemaOutput, supportsNativeWebSearch, supportsMidConversationSystem, ...}`。GLM-5.3 与 glm-5.3-flash 的具体 contextWindow/预算值不在客户端 [未取证]；本机抓包参照（反代项目 config）：GLM 目录覆盖 glm-4.5-air 至 glm-5.3-flash，thinking 预算字段随模型下发。autoCompactThresholdTokens 的默认值/比例同样未在 bundle 静态出现（字段从 usage 快照传递）[未取证]。

### 10.6 记忆目录结构与 project-hash 算法（本机实测定案）

```
~/.zcode/cli/memories/projects/{workspaceDirName}-{hash16}/memory/
├── MEMORY.md          # 索引，每会话经 agentsMd 节注入
└── <memory-slug>.md   # 单事实文件
```

- **hash16 = sha256(工作区绝对路径小写化).slice(0,16)**。实测：`c:\users\29596\desktop\project\zcode` 的 sha256 前 16 位 = `dbe1a1cb8e0282af`，与真实目录 `zcode-dbe1a1cb8e0282af` 精确命中（同目录 26 个真实样本同构命名）。移植时按同算法可让 DSH 与 ZCode 共享记忆库。

### 10.7 ToolSearch 工程边界：对非 deferred 工具的检索行为

- 出参 schema（dst，偏移 1503366）：`{matches: string[], query, total_deferred_tools: number}`——匹配仅发生在 deferred 名单内。
- 直载工具（read/write 等八件套）不在 deferred 名单：检索它们返回空 matches（`matches: []`），**不报错、不影响其可用性**（它们本就带 schema 可直接调用）。行为契约由回收文案同一逻辑背书：`Do not search for them — ToolSearch will return no match.`
- 回收后的工具检索同样空匹配。工程含义：deferred 名单是唯一检索域，实现方无需处理「已装载工具的检索回退」分支，但建议在空匹配时附一句提示（ZCode 语义即"名单里没有"），避免模型反复重试。
- [标注] matches 为名称数组、schema 经 `<functions>` 块随后的注入呈现；匹配打分实现未逐行取证。

### 10.8 服务端工具直连闸门实测记录

以本机 ZCode 静态凭据（credentials.json 的 access_token 与 zcodejwttoken，Bearer 与 x-api-key 两种形态）+ ZCode 身份头 + `anthropic-beta: advanced-tool-use-2025-11-20` 直连 `open.bigmodel.cn/api/anthropic/v1/messages` 声明 `tool_search_tool_regex_20251119`：**三种组合均 401「令牌已过期或验证不正确」**。判定：401 发生在认证层，静态度量凭据已过期（运行中的 ZCode 使用内存内刷新 token），**工具闸门结论未知**。后续验证路径：从运行中 ZCode 进程取活 token 重试，或经反代项目 `auth login` 产出新鲜凭据对照测。

### 10.9 八件套 schema 获取方式

TodoWrite/Bash/Read/Write/Edit/Glob/Grep/ToolSearch 的完整 JSONSchema 为会话装载时发给模型的原文，可由任一 ZCode 会话协议采样直接导出（tools 数组逐字段）。TodoWrite 条目三必含字段中 **priority 为字符串枚举**（非数字），与官方 todo 语义一致。

## 11. 补充二：effort 档位、压缩公式全链与凭据加密（2026-10-27 深挖）

### 11.1 effort 双通道枚举

- **anthropic 通道**（BigModel 端点请求 schema，偏移 3587887）：`effort: enum(["low","medium","high","xhigh","max"])` 五档；同层还有 `task_budget:{type:"tokens",total≥20000,remaining?}`、`speed: enum(["fast","standard"])`、`inference_geo: enum(["us","global"])`、`toolStreaming: boolean`。
- **OpenAI 兼容通道**（偏移 3666043）：`reasoningEffort: enum(["none","minimal","low","medium","high","xhigh"])` 六档。
- UI `/effort` 档位与 thinking budget 的档位映射表（8k/16k/32k 一类）不在客户端 bundle——预算档位由设置/服务端下发【未取证】。thinking.budget_tokens 与 effort 为两个独立参数轴（10.1）。

### 11.2 autoCompact / microcompact 公式全链（偏移 5070442-5075373）

常量（@5071997）：`tbe=200000`（默认 contextWindow）、`$0o=32000`（默认 maxOutputTokens，即默认 max_tokens）、`zda=21000`（输出预留上限）、`q0o=13000`（默认 bufferTokens）、`I0t=20000`、`Z0o=0.9`、`Y0o=2000`。

```
输出预留 Fkn      = min(maxOutputTokens ?? 32000, 21000)
有效窗口 Lkn      = contextWindow(默认 200000) − 输出预留        → 默认 179000
autoCompact 阈值 Uje = max(0, 有效窗口 − (bufferTokens ?? 13000)) → 默认 166000（≈窗口 83%）
microcompact 阈值 A0t = min(floor(窗口 × 0.9), 窗口 − 2000)
```

- autoCompact 判定（shouldAutoCompact）：估算 token 数 ≥ 阈值触发；token 数可被 provider cache 计数覆盖。
- **microcompact（工具结果微压缩）**：独立于整段 compact，对九个工具（`Read/Bash/Grep/Glob/WebFetch/WebSearch/Edit/Write/ApplyPatch`，@5075373）的历史结果做就地清理（buildClearedToolResultContent），阈值与开关可配（thresholdTokens/enabled），先于整段压缩触发——与 DSH「工具输出修剪」同构。

### 11.3 TodoWrite priority 枚举定案

`priority: enum(["high","medium","low"])` 字符串三枚举——内部 schema（@845643）与模型侧工具 schema（@1447762，带 describe("Priority level of the task")）双重实锤。非数字。

### 11.4 OutputStyle 节结构

`# Output Style: {name}` + 风格 prompt 原文（L0o，@5051125）；未激活风格时无本节。风格集为 {name, prompt} 对，可选列表与各风格文案由配置/服务端下发，客户端无静态列表【未取证】。

### 11.5 凭据加密信封（enc:v1）全算法（偏移 4435298）

```
密文格式  enc:v1: base64url(IV 12B) . base64url(tag 16B) . base64url(ciphertext)
算法      aes-256-gcm
密钥      sha256(secret)
secret    环境变量 ZCODE_CREDENTIAL_SECRET（优先）
          否则 fallback = "zcode-credential-fallback:" + os.platform() + ":" + os.homedir() + ":" + userInfo().username
```

实测勘误：本机 fallback 密钥解密失败（GCM tag 校验不过）+ 环境变量未落盘（注册表/当前环境均无）→ Desktop 进程启动时注入自定义 secret（或加密上下文不同）。**静态文件不可解；活 token 需从运行中进程环境/内存提取**。插件如需复用 ZCode 凭据，同算法解密 + 从 ZCode 进程取 secret 即可。

### 11.6 直连闸门实测（更新）

以密文 token 直发（早前 401「令牌已过期或验证不正确」）的真因勘误：**发出的是 enc:v1 密文而非明文 token**——闸门判定（tool_search_tool_regex / web_search_prime 对非 ZCode 客户端的放行）仍未知，卡在明文凭据获取。`mcp__web_reader__webReader` 为 MCP 形态工具（客户端侧 MCP 连接），不经 anthropic 请求声明，不在本闸门测试范围。

### 11.7 实跑请求参数（temperature/top_p/top_k/max_tokens）

组装层透传、无静态默认（10.1）；**默认 max_tokens=32000**（$0o 常量，11.2）。实跑会话是否携带 temperature/top_p 及其值取决于会话级/服务端配置，export-log 导出目录实测为空壳（0 字节），未取得实跑请求体样本【未取证】。

## 12. 使用统计（Usage）功能

### 12.1 数据结构（偏移 814028-815660，schema 十件套）

总快照（appUsageSnapshot）：

```ts
{
  range: "all" | "7d" | "30d",
  generatedAt: number, timeZone: string,
  source: "agent-db",            // 数据源 = 本地 agent 数据库聚合
  summary: {...}, heatmap: {...},
  dailyModelUsage: [{date, models:[{modelId, totalTokens}]}],
  models: [{modelId, totalTokens, inputTokens, outputTokens, requestCount, share}],
  tools: [{toolName, callCount, errorCount, errorRate, avgDurationMs}]
}
```

summary 指标集：token 四分（total/input/output/**reasoning 思考单列**）、缓存三分（cacheCreation/cacheRead/**cacheHitRate**）、会话（totalSessions/totalTurns/activeDays）、连续性（currentStreakDays/longestStreakDays/longestSessionMs/peakDayTokens）、性能（**avgTimeToFirstTokenMs 首 token 延迟**/avgTurnDurationMs）、质量（toolErrorRate/modelErrorRate）。

heatmap：周×天网格，每天 `{date, level: 0-4 五档, totalTokens, turnCount, toolCallCount}`，附区间 startDate/endDate/maxTokens。

favoriteModel：`{modelId, totalTokens, share}`——高频模型榜。

### 12.2 数据流与口径

- 原始数据 = 每请求 usage 事件（`cumulative{inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}` + `contextWindow{usedTokens, maxTokens, autoCompactThresholdTokens, cache, breakdown}`），落本地 agent-db 后按 range 聚合成快照。
- 界面入口：设置 usage 分区；套餐通道标识（`account:zai-highspeed-card` / `account:bigmodel-highspeed-card`）与用量展示关联。

### 12.3 对 DSH 监控模块的参考价值

dsh-glm-dialect 的监控层可直接借鉴本结构：summary 的 token/缓存/错误率三组指标覆盖套餐监控诉求；heatmap 与 streak 指标是活跃度可视化的现成形态；tools 级 errorRate/avgDurationMs 与 DSH 事件溯源（tool/call + tool/result 时间戳）天然对齐。
