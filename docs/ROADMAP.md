# 实施路线

版本：0.1（2026-10-27）
状态：生效。设计依据：`DESIGN.md`、`ORCHESTRATION.md`。

## 1. 原则

- 行走骨架：先打通最细的端到端通路，再加宽。原生通道还没在 DSH 真实会话里跑过，所以底层收口排在最前。
- 一次一个变量：每个条目单独提交、单独验证（`DEVELOPMENT.md` §5）。
- 用这套流程建这套流程：M2 完成后，后续所有条目都作为任务节点挂在项目图上推进。
- 验证层级（`DEVELOPMENT.md` §1）：L1 静态、L2 单测、L3 headless 沙盒、L4 真机。Kiro 会话内可执行 L1–L3（L3 经 Electron node 模式）；L4 需要用户重启桌面版并在真实会话中验收。

## 2. 里程碑

### M0 文档沉淀（完成）

宪章、总体与底层设计、编排层设计、事实账、路线、流程、交接整理入库；git 之前的记录导入后由新文档取代（提交 `c518317`、`f2e0b36`）。

### M1 底层收口

| # | 条目 | 验收 |
| --- | --- | --- |
| 1.1 | 版本基线统一到 3.16.3：身份头 `appVersion`、OAuth、签名平面 `clientVersion` 共用一个常量；按 3.16.3 复核三处协议变化。方言文本按 ZCode 源码重建（`DESIGN.md` §5.9：工具描述与参数 schema、deferred 声明段、ToolSearch 描述、todo 提醒正文、compact 三处），并加逐字比对检查 | L2 单测；逐字检查对照 `reference/ZCode` 全部通过；`smoke:authorized` 真网通过 |
| 1.2 | 路由判定收口（`DESIGN.md` §3）：共享判定函数，方言按模型族、通道按 provider；删除旧构建分支；单测假宿主只提供 rc.3 的信号 | L2：只有组装变量携带路由时，方言、工具检索、todo 提醒均生效 |
| 1.3 | 删除与反代有关的判断与文案 | 代码与文档中无反代依赖 |
| 1.4 | 共享数据目录与审计服务（`DESIGN.md` §2.4）；guard 违规落盘；迁移 profile 目录下的 190 条用量记录与 1 条记忆 | L2；L3 中 guard 拦截后违规流水有记录 |
| 1.5 | 行健康上报与 `/glm-status` 健康表 | L3：每行在会话中报告生效或原因 |
| 1.6 | 事件钩子与服务对照官方类型；DSH 接口收进薄适配层 | L1 |
| 1.7 | L3 沙盒自动化：真实启动 + 行为探针（方言前缀、工具面、提醒）作为门禁；标定测试集起步（1–2 个任务） | 一条命令跑完，结果可机检 |
| 1.8 | guard：`file-tools-only` 改为引号感知；规则声明注入提示词；工作区变更兜底（影子模式） | L2 覆盖 `=>`、`>>>`、`->` 与 git 子命令；L3 |
| 1.9 | 本仓库补规范检查、死代码检查、重复检查，记录告警基线（新增开发依赖，先告知用户） | 门禁中可运行，基线入库 |
| 1.10 | todo 提醒改为按助手轮次计数 | L2 |
| 1.11 | L4 真机验收：用户重启桌面版，选 `glm-zcode` 发消息 | 行健康全绿；会话文件中系统提示词含方言；用量记录 provider 为 `glm-zcode` |

M1 进度：

- 1.1 版本基线：完成（2026-10-27）。三处版本统一为 3.16.3；L2 141 用例通过；`smoke:authorized` 真网返回 `pong`（签名仍无签发送）。
- 1.1 方言文本重建：逐字门禁上线（`scripts/check-verbatim.mjs`，接入 `npm test`）；todo 提醒正文与 compact 三处已按原文修正；11 段文本通过，8 段为已知偏差（Deferred 声明段、ToolSearch 描述、六个工具描述）。其中 Deferred 声明段与 ToolSearch 描述已随 ④ 处理。
- 用户定案（2026-10-27）：工具检索默认开启，实现与 ZCode 一致；`X-Title` 保持 `cli`。
- 新发现：桌面版运行时接口与 `reference/deepseek-harness` 不同，方言工具面与工具检索依赖的 `executable()` 在运行时不存在（`DESIGN.md` §2.4a）；用量块输入计为 0（`DESIGN.md` §4.6a）。
- 用量块：完成（2026-10-27），真网实测输入与缓存计数正确。
- 1.7 L3 探针：第一版完成（`npm run probe`，六项检查）。首次运行基线 1/6：只有启动通过；方言提示词、工具面、别名执行全部未生效，确认了 `DESIGN.md` §2.4a 的推断。探针同时发现原生通道在 DSH 会话里不发送系统提示词，已修（`DESIGN.md` §4.5）。
- 1.2 路由收口：`glm-prompt` 完成（2026-10-27），改在组装瀑布中逐请求改写提示词与工具面；L3 探针 9/9（GLM 与非 GLM 两个场景）。工具检索随 ④ 完成。
- ④ 工具检索：完成（2026-10-27）。按 3.16.3 安装包移植 local 模式（安装包把检索工具改名为 `LocalToolSearch`，与 3.16.2 源码不同，`DESIGN.md` §5.10 已更正）；并入 `glm-prompt`，`toolsearch` 行删除；deferred 声明段删除；逐字门禁改为按镜像文件的字面量片段检查，已知偏差剩 6 条（六个工具描述）。L2 165 用例；L3 探针 15/15（检索、公告、`DeferredToolCall` 调 TodoWrite 都在真运行时上执行）。顺带修复：合成 notice 缺 `id` / `role`；探针脚本被会话标题请求打乱顺序。
- 新发现：`glm-compact` 在桌面版上从未挂载。已修（2026-10-27）：改在 `llm/stream` 瀑布上替换 GLM 压缩请求的指令并格式化产物，不再另挂引擎（`DESIGN.md` §5.6）；L3 探针加压缩场景，17/17。
- ⑤ 工具描述重建，第一批 Read、Write、Edit：完成（2026-10-28）。描述、schema、结果文本按 3.16.3 安装包重建，放进镜像文件 `src/glm-prompt/zcode-tool-text.ts`；垫片兑现描述的承诺（cat -n 行号形态、部分视图提醒、图片转 `read_image`、二进制与视频拒读、`offset` 0、`replace_all` 语义布尔、沙盒升级字段），兑现不了的行删去（`DESIGN.md` §5.4）。逐字门禁 223 段通过、已知偏差剩 3 条（TodoWrite、Glob、Grep，M1.1b）；L2 176 用例；L3 探针 23/23（新增 Write、Edit、回读、覆盖未读文件被拒）。新发现：原生通道丢弃图片块，经 `glm-zcode` 读图只得到文字摘要（`DESIGN.md` §5.4 已知缺口）。
- ⑤ 工具描述重建，第二批 Glob、Grep、TodoWrite、Bash：完成（2026-10-28）。描述、schema 与 Glob、Grep 的结果文本按 3.16.3 安装包重建，放进镜像文件。Glob 按 ZCode 从新到旧取前 100 条；Grep 的 `-i`、`glob`、`type`、`output_mode`、`-n`、`head_limit`、`offset` 在垫片里按 ZCode 实现，原生做不到的 `-A`、`-B`、`-C`、`context`、`-o`、`multiline` 从 schema 删去；Bash 只改 shell 与工作目录两行，去掉 `dangerouslyDisableSandbox`，`timeout` 改为毫秒（此前按秒换算，与 ZCode 不符），`working_dir` 删去（`DESIGN.md` §5.4）。逐字门禁 397 段通过、已知偏差 0 条；L2 184 用例；L3 探针 28/28（新增 Glob、Grep、Bash 的工具面与执行检查）。M1.1 的方言文本重建至此完成。
- 原生通道读图：完成（2026-10-28，`DESIGN.md` §4.5a）。GLM-5.3 改为只声明文本（用户提供的事实），GLM-5.3-Flash 声明文本与图像；Flash 收到 ZCode 形态的 base64 图片块（用户消息与 `tool_result` 内），请求版本按 ZCode 的长边 2000 像素与 5 MiB 上限读取。Read 描述的图片一行按 ZCode 不随模型取舍。修图片时发现编码器按 rc.3 不存在的 `toolCalls` 字段读工具调用，助手的工具调用会被全部丢弃，一并修复，相邻同角色消息按 ZCode 合并（`DESIGN.md` §4.5）。L2 192 用例；L3 探针 32/32（新增：纯文本模型拒读、Flash 的 `tool_result` 图片块）；真网一次读图答对颜色。
- 1.10 todo 提醒按助手轮次计数：完成（2026-10-28，`DESIGN.md` §5.5）。按 ZCode 3.16.3 改为每步在 `agent/pre-step` 从会话历史重新计算：一条 GLM 助手消息算一轮，经 `DeferredToolCall` 的 TodoWrite 算写入，提醒以 `<system-reminder>` notice 递送并写入会话，排在 deferred 名单公告之前；非 GLM 路由与工具面没有 TodoWrite 时不提醒。回显改为取历史中最近一次成功的写入。原 `tools/post-execute` 计数与按 agent 记录路由的 `createRouteTracker` 删除。L2 198 用例；L3 探针 35/35（新增：一轮两个并行调用、提醒恰好在第 12 次请求出现一次、包装正文与回显位于最后一批工具结果之后）。
- 1.3 反代文案：完成（2026-10-28，`DESIGN.md` §1）。删除授权冒烟脚本的「reverse proxy can retire」输出、设置页的「无反向代理」、原生通道两处源码注释的「No reverse proxy in the path」；参考手册把 zcode-api 称作「反代工程」「反代项目」的四处改为直接写 zcode-api，其中补凭证的验证路径改为 `/glm-login`。保留移植出处注释、ZCode 服务端字段 `proxyEndpoint`、用户 profile 的 8317 路由说明。代码中本来就没有识别反代路由的判断。
- 1.6 DSH 接口对照：完成（2026-10-28，`DESIGN.md` §2.4a、§8）。本包用到的每个钩子、服务成员、载荷字段与工具名逐项对照 rc.3 运行时包，接口对照表写明包与行号。发现并修复两处行为偏差：guard 的违规记录从 `tools/pre-execute` 载荷上不存在的 `agentId` / `sessionId` 取值，记录里永远为空，改为取调用方 agent 的 id 与会话 id；workflow 的派遣名单缺 base profile 的 `subagent_fork`。另删去四处类型偏差或死类型（agent 的 `model` 成员、memory 的两参数 `tools.register`、无人使用的 `ctx.systemPrompt` 与 `tools/post-execute`）。宿主结构类型收进薄适配层 `src/shared/dsh-min.ts` 与 `src/shared/lm-min.ts`（原 `src/glm-llm/lm-min.ts` 迁入，GLM 模型目录拆到 `src/glm-llm/models.ts`），各行不再自带；装了官方 `.d.ts` 的两处加编译期检查（`GenerateOptions`、`AttachmentStore`）。L2 199 用例；L3 探针 38/38（新增：用量流水按步记录路由与会话 id、压缩调用带 `purpose`、运行时的 `subagent` 与 `subagent_fork` 都在派遣名单里）。
- 1.4 共享数据目录：完成（2026-10-28，`DESIGN.md` §2.4）。新行 `glm-hourness/data` 提供数据目录服务：用户级目录按 DSH 的布局解析为 `$DSH_HOME/glm-hourness/`（默认 `~/.dsh/glm-hourness/`，用户定案），项目目录是工作区 `.llm/`。用量流水改写用户级目录，违规与决策写项目目录；guard 每次拦截都落盘，原来无法从配置传入的回调删除；各行在每次写入时取目录，有无数据行都能激活，用户 profile 补丁里的 `home` 照旧优先。数据行经探针证明后默认启用。迁移：用户级用量流水 1080 条（仓库 890 条加旧目录 190 条，无重复），旧目录的 1 条记忆并入仓库 `.llm/memory.json`，3 条决策仓库里已有；源文件未改动。加密凭证按用户定案 A 在 L4 验收后再搬（§3）。L2 215 用例（22 个 spec）；L3 探针 41/41（新增：用量只落在场景的用户级目录、真实目录不变；shell 写入被拦并在场景项目目录留下违规记录）。
- 1.5 行健康：完成（2026-10-28，`DESIGN.md` §2.5）。每行激活时提供自己的健康视图，在会话中起作用时报告生效、部分生效或未生效及原因（例如非 GLM 路由、缺凭证、缺项目目录）；`/glm-status` 在凭证状态之后列出调用会话的行健康表，未启用的行显示未加载。`glm-login` 没有 `home` 时保留 `/glm-status`。报告只在主机进程内存里，不进模型请求。L2 233 用例（23 个 spec）；L3 探针 46/46（新增：真实的 `/glm-status` 处理函数在 GLM、非 GLM、压缩三个场景输出 9 行的健康表，状态与原因符合路由，表的内容不进模型请求）。
- 1.8 guard：完成（2026-10-28，`ORCHESTRATION.md` §6.1、§6.5）。`file-tools-only` 改为引号感知：按 PowerShell 与 POSIX 两种方言读命令，引号、here-string、here-document、注释里的 `=>`、`>>>`、`->` 不再误拦，只认命令位置上的写文件命令（命令集不变）与引号外指向文件的重定向，git 子命令放行；`bash -c`、`pwsh -Command` 的脚本与子表达式照样检查。规则声明以 `glm:guard` 一节放在 GLM 系统提示词最后。工作区变更兜底按影子模式实现：读 DSH `workspace-changes` 的回合摘要，跑过 shell 的回合里有文件不是文件工具的目标时只记录、不拦截，晨报单列。顺带修复：`terminal_send` 的命令文本参数是 `text`，guard 原先读 `command`，终端输入从未被检查。L2 250 用例（24 个 spec）；L3 探针 51/51（新增：GLM 提示词带规则声明、非 GLM 不带；引号里的箭头与带引号箭头的 git 子命令放行；临时 git 仓库里 .NET 写文件照常执行并留下恰好一条影子记录；行健康写明影子兜底状态）。
- 1.9 检查器与依赖例行：完成（2026-10-28，`ORCHESTRATION.md` §7.7，`DEVELOPMENT.md` §10、§11）。按用户选定的方案 A 装 ESLint 10.13.0、typescript-eslint 8.72.1、knip 6.43.0、jscpd 5.4.2（精确版本、开发依赖，没有其他新增依赖）。`npm run lint` 接入 `npm test`，三项各自对照入库的基线，只减不增：ESLint 317 条、knip 35 条、jscpd 7 处克隆。上线时用临时违规演示过一次：三项都失败，`npm run lint:update` 拒绝写入；撤回后全绿。顺手修了 3 处明确安全的真问题；175 条多余的类型断言可自动修复，等 `graph-engine` 分支合并后再修，免得冲突。依赖例行：`npm run deps:check` 汇总 `pnpm outdated` 与 `pnpm audit` 并逐条写出处理方式，`@deepseek-ai/*` 钉在桌面版运行时的版本。当前结果：TypeScript 7 是主版本升级，待用户决定；zod 的高危公告只经 DSH 包进入，随桌面版处理。gitleaks、`@eslint/js`、`scripts/dev/` 的去留列入 §3。L2 250 用例（24 个 spec）；L3 探针 51/51（本条不改运行时行为，照跑一次）。
- 1.7 标定测试集起步：完成（2026-10-28，`ORCHESTRATION.md` §10.5）。`npm run calibrate` 在 `glmsandbox` 上经原生通道 `glm-zcode` 跑真实模型（覆盖补丁启用 `glm-llm` 行），每次运行用任务 fixture 的新副本，结束后由验收脚本判定；两个任务放在 `tests/calibration/`：小功能 `feature-parse-duration`、修 bug `bugfix-csv-quotes`。每次运行有步数与时间上限（标定专用插件 `scripts/calibrate/limits.mjs`，再加进程树兜底）；记分为完成、返工、打扰人、积分、违规，另记步数、耗时、多余文件。基线（提交 `4cb8799`，每格 3 次，非高峰）：两档模型 12/12 完成；GLM-5.3 平均 8.67 步、15.53 积分、1.07 分钟，GLM-5.3-Flash 平均 8.50 步、8.16 积分、2.28 分钟；返工各 0.5 次，打扰、违规、多余文件均为 0。起步任务对完成率没有区分度，靠 M3、M7 扩充更难的任务。新发现：沙盒模板缺省的 `workspace-write` 下 `node --test` 报 `spawn EPERM`，运行器改按用户桌面版的预设传 `danger-full-access`（`FACTS.md` §3）。L2 250 用例（24 个 spec）；L3 探针 53/53（新增：步数上限拒绝第 3 步、时间上限在 5 秒时取消一条 60 秒的 shell 命令）。1.7 的两部分（L3 探针、标定起步）至此都已完成。
- 调整后的顺序：① 修用量块（完成）；② 先做 1.7 的 L3 探针（用探针确认现状、验证后续每一步）；③ 1.2 路由收口，工具面改为在组装瀑布中逐请求改写；④ 工具检索按 ZCode local 模式移植（`DESIGN.md` §5.10）；⑤ 六个工具描述按源码重建，垫片兑现原文的参数与行为。

### M2 项目图行走骨架

| # | 条目 | 验收 |
| --- | --- | --- |
| 2.1 | 存储格式定案（`ORCHESTRATION.md` §2.6，向用户发决策卡） | 用户批准 |
| 2.2 | 图工具：读投影、提议节点、带证据更新状态 | L2：无证据不能标完成 |
| 2.3 | 每步投影注入（`DESIGN.md` §6）与压缩后重锚 | L3：模型请求中可见投影 |
| 2.4 | 只读视图：先以命令输出文本树，UI 标签页放在 M8 | 命令可用 |
| 2.5 | 迁移本项目：底层与编排两大分支、设计决策（带验证状态）、已知问题（风险）、本路线条目（任务） | 用户能在图上看到项目全貌 |

### M3 设计循环最小闭环

| # | 条目 |
| --- | --- |
| 3.1 | 主 Agent 身份文本（三问四答、五键、许愿访谈）；guard 拦主 Agent 的写入，不靠 preset（`ORCHESTRATION.md` §3.1） |
| 3.2 | 许愿访谈八步与需求卡；访谈过程中图实时生长 |
| 3.3 | 方案五栏与设计门禁：五栏门禁挂在 `exit_plan_mode` 的 `tools/pre-execute`；设计期只读由 guard 实现，计划模式只靠提示词（`ORCHESTRATION.md` §4.5） |
| 3.4 | 五键（`ORCHESTRATION.md` §4.4），借用 `user-questions` |
| 3.5 | 决策卡：同步借用 `user-approval` 与 `user-questions`，异步自建在图的待决节点上（`ORCHESTRATION.md` §5）；取代 L1/L2/L3 |
| 3.6 | 阶段状态机：阶段提醒、门禁、最小流程条 |

验收：标定测试集中的「需求访谈」任务，从一句话到骨架放行全程走通。

### M4 guard 补齐与环境

`ORCHESTRATION.md` §6.4 的规划规矩；影子模式机制；检查器运行与当轮回传；告警棘轮与压制规则；环境分支与草稿区；清理 `.llm/docs/` 下的抓取脚本。

### M5 记忆与学习

事实与偏好分类；会话开局召回；记忆工具常驻；取消路径判据；学习流水线；汇报细度闭环。

### M6 用量与峰谷

积分口径与峰谷修正（`ORCHESTRATION.md` §11.2）；通道额度取数（`DESIGN.md` §4.7）；高峰提醒；排期功能。

M6 进度：

- 6.1 积分口径与高峰提醒：完成（2026-10-28，`ORCHESTRATION.md` §11.2–§11.4）。积分规则收进 `src/shared/credits.ts`，面板、高峰提醒与标定运行器共用；标定基线的 12 次运行用新模块重算，积分与原记录一致。`/hourness` 面板改为积分口径：按模型列出积分、高峰占比（按积分）与缓存命中率，非高峰按 50% 计，周末全天算非高峰；不在积分套餐里的模型只计次数；原生通道修正前的用量记录按其形态识别，不计入，只报条数。高峰提醒：GLM 会话在高峰时段的第一个步收到一条 `<system-reminder>`，同一时段不重复，状态取自会话历史；只告知，不换模型、不拦截、不推迟工作。5 小时窗口、周额度与预估耗尽时间需要通道取数，尚未实现；排期功能尚未实现。L2 258 用例（25 个 spec）；L3 探针 57/57（新增：探针时钟下第一个 GLM 请求带提醒、之后不重复，同一时钟下的非 GLM 会话没有提醒，真实时钟下提醒条数与请求所在的时段一致）。

### M7 执行、汇合与运维

后台派发：主 Agent 把任务节点派给后台子 agent（`subagents.startActivation`，spawn 后端），派发属性取自任务节点（种类、写入范围、模型档位、验收条件、交回结构、独立工作树，`ORCHESTRATION.md` §3.2），没有队友角色与角色 preset；子 agent 的写入范围门禁；驱动循环用 goal 加 `goal-round-driver`，由人发起创建与恢复，完成门禁核对图上证据（§2.1）；简报门禁、并发补位提醒；独立审查；汇合门禁；四答晨报；巡检（固定运维会话）；规范阶梯与周报；DORA 指标；标定测试集扩充。

### M8 呈现

按 `ORCHESTRATION.md` §13 实现 UI：项目图查看器先经 Desktop 的 Browser 标签页打开，再做原生右侧栏标签页；`ui-primitives` 在壳层模块表里（2026-10-28 读 rc.3 确认），组件以 rc.3 官方包实际用到的为准；替换现有设置页与 pill；按截图迭代，用户终审。

### 借用组件核实清单（L3 / L4）

2026-10-28 对照 rc.3 运行时包的只读核查（结论见 `ORCHESTRATION.md` §2.1、§3、§4.5、§5、§13、§14 与 `FACTS.md` §3）留下的真机核实项，按依赖顺序排列。L3 在 `glmsandbox` 上用探针做（`DEVELOPMENT.md` §3），L4 要在桌面版真实会话里看界面。同日的定案（不用队友角色与角色 preset，不用 Agent Team）让其中几项不再需要，保留编号备查。4、4b、12 三项在 M3、M7 动工之前由一次派发可行性验证一并做（L3，探针 provider 同时为子 agent 脚本化应答），结论写进 `DESIGN.md` §2.4a 与 `ORCHESTRATION.md` §2.1、§3。

| # | 核实项 | 层 | 依赖它的条目 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 启用 `agent-team-profile` 后根会话的工具面：是否同时有 `subagent`、`subagent_fork` 与 Team 九个工具，`send_message` 是否为 Team 版本 | L3 | 无（不用 Agent Team） | 不再需要 |
| 2 | 宿主层插件调用 `ctx.agentPresets.serviceFor(agent, 'planMode')` 能否拿到控制器，`set(agent, true)` 是否生效 | L3 | M3.3、M3.6 | 待核实 |
| 3 | bundle 插入的 preset：子行以包名子路径引用本包模块能否解析和激活，persona 与 `tool-fs` 的 `write: false` 是否生效，能否在设置与新会话中选到 | L3 / L4 | 无（不用角色 preset） | 不再需要 |
| 4 | 本包的宿主插件经 `subagents.startActivation` 启动后台子 agent，带 prompt、cwd、agentOptions、outputSchema；父 agent 的步继续；完成通知带结构化结果回到父 agent。原项「preset 内的 `tool-subagent` 派出角色 preset 子 agent」按定案改为这一项 | L3 | M7 后台派发 | 待核实（派发可行性验证 a） |
| 4b | `tools/pre-execute` 看到子 agent 的工具调用，`exec.agent` 能映射回派发它的任务；范围外的写入被拒，拒绝以工具错误回到子 agent | L3 | M7 写入范围门禁 | 待核实（派发可行性验证 b） |
| 5 | 第三方右侧栏标签页：`sidebarRightTabs.register`（带 `extension`）、正文槽与 guide 入口是否出现；`dsh.client.inject` 列出 sidebar-right 后加载顺序是否正确 | L4 | M8 | 待核实 |
| 6 | 第三方客户端调用 `ctx.sidebarRight.openTab('browser', { params: { url: 'http://127.0.0.1:<端口>/' } })`，webview 能否打开本机查看器并正常交互（含实时推送） | L4 | M8 查看器第一步 | 待核实 |
| 7 | 自己标签页里的 `<iframe>` 指向回环地址在 Desktop 是否被拦 | L4 | M8 | 待核实 |
| 8 | 第三方客户端 inject `remote.workspaceFiles` 后 `read`、`list`、`changes` 是否可用 | L4 | M8 原生标签页 | 待核实 |
| 9 | 第三方宿主插件注册的会话投影能否经 `faceOf(key)` 到达客户端 | L3（宿主侧注册）/ L4 | M8 | 待核实 |
| 10 | 第三方以 `pwsh`、`write` 为键注册 `tool.call.toolview` 的行为（覆盖、优先级、报错） | L4 | M8 guard 卡片 | 待核实 |
| 11 | 匹配 `tool/result` 的第三方聊天节点定义能否渲染在工具行之后 | L4 | M8 guard 卡片 | 待核实 |
| 12 | 在 `agent/pre-step` 给目标轮追加的 notice 是否破坏 `goal-round-driver` 的预约校验；`update_goal` 的 `complete` 能否在 `tools/pre-execute` 拦下 | L3 | M2.3 目标轮投影、M7 完成门禁 | 待核实（派发可行性验证 c） |
| 13 | guard 在 `tools/pre-execute` 里调用 `userQuestions.ask` 与 `approval.request` 时卡片是否出现、取消时信号是否正确；`conversation.approval.detail` 子槽能否由第三方占用 | L4 | M3.5 | 待核实 |
| 14 | `tool-ask-user` 改为 `mode: timed` 后，pending 与晚到答复的完整路径 | L4 | M3.4、M3.5（若用 timed 卡） | 待核实 |
| 15 | 用命令通道做 UI 写回时会话日志的增长量，以及确认命令运行不进模型请求 | L3（不进模型）/ L4（UI 写回） | M3.5 异步卡回写、M8 | 待核实 |
| 16 | 主 Agent 身份文本与 `glm-prompt` 方言改写的叠加结果。原项「`glm-prompt` 与 preset persona 的叠加」按定案改为这一项 | L3 | M3.1 | 待核实 |
| 17 | schedule 投递到冷会话时，恢复出的 agent 的工具面与本包各行是否齐全 | L4 | M7 巡检、M6 排期 | 待核实 |

## 3. 需要用户的事项

| 事项 | 时机 |
| --- | --- |
| L4 真机验收（重启桌面版、真实会话） | M1.11，以及之后每个涉及运行时的里程碑 |
| 是否关闭 cot-translation 实验行（会把推理碎片显示到界面；改 profile 需用户同意） | 任意时间 |
| 清理 profile 目录中的备份 `cordis.patch.yml.bak-1793101338423` 与旧数据目录 `~/.dsh/profiles/desktop/.llm/`（记录已于 2026-10-28 复制完，`DESIGN.md` §2.4） | 任意时间 |
| 桌面版重启后补拷用量：重启前运行中的旧代码仍把用量写进仓库 `.llm/audit/usage.jsonl`，把其中晚于 2026-10-27T12:29:08.993Z 的记录按整行去重复制到 `~/.dsh/glm-hourness/audit/usage.jsonl`；此后仓库里的这份用量流水是否删除由用户决定 | L4 重启之后（Kiro 执行） |
| 加密凭证 `credentials.json` 与 `device-mid.txt` 搬到 `~/.dsh/glm-hourness/`（用户定案 A），同时把 `glm-llm`、`glm-login` 的 `home` 改过去；密钥推导与文件路径无关，搬后可直接解密（`DESIGN.md` §2.4） | 原生通道 L4 验收之后 |
| profile 中指向 8317 的 pi-ai `glm` 路由去留（用户配置，本项目不改） | 任意时间 |
| 删除已迁入本仓库的旧文件夹 `Desktop\Project\dsh-glm-dialect`（工作区外） | 任意时间 |
| 密钥扫描 gitleaks（`ORCHESTRATION.md` §7.5）：工作区外的独立二进制，安装要用户同意。选项：A 装到用户级工具目录，接成 `npm test` 的一道；B 不装，维持提交前人工扫描。推荐 A | 任意时间 |
| 是否新增 `@eslint/js`（ESLint 官方的推荐规则包，ESLint 10 起不随 ESLint 安装）：现在的配置从 ESLint 规则元数据取推荐清单，用的是 ESLint 标为「自担风险」的接口，取到的 64 条规则与 `@eslint/js` 10.0.1 的推荐清单相同。选项：A 加 `@eslint/js` 精确版本，配置改成社区常规写法；B 保持现状，不加依赖。推荐 A，升级 ESLint 时少一处风险 | 任意时间 |
| `scripts/dev/` 的 9 个历史调试脚本：部分针对已不存在的接口，没有任何入口引用（knip 报未用文件），占 ESLint 基线 11 条、jscpd 克隆 4 处。推荐删除（git 历史保留），基线随之缩小 | 任意时间 |
| TypeScript 升级：当前 5.7.2，最新 7.0.2 是主版本；typescript-eslint 8.72.1 只支持低于 6.1 的 TypeScript。选项：A 先按例行流程升到 5.x 线的 5.9.3（次版本，过全部门禁），7.x 等 typescript-eslint 支持后再议；B 维持 5.7.2。推荐 A（尚未做，`DEVELOPMENT.md` §11） | 任意时间 |
| `graph-engine` 分支合并：合并到 main 时要过 `npm run lint`，分支新增的文件不在基线里，按新代码零告警处理；两边都改了 `package.json` 的 `test` 脚本，合并时保留检查器门禁那一道 | M2.1 评审与合并时 |
