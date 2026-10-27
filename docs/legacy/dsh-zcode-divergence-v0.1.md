# DSH × ZCode 差异对照与处置方案

版本：0.1
输入：《01-zcode-capabilities-reference.md》（ZCode 3.16.3 逆向实读，下称"参考手册"）+ DSH 当前 profile 实测（194 插件条目、会话工具面、插件启用态）。
定位：逐项列出 DSH 现状与 ZCode 的差异，按差异性质分类，给出处置策略与优先级。是实现前的差距底账，不规定实现细节。

---

## 1. 分类框架

| 类 | 定义 | 处置通道 |
|---|---|---|
| T（transport） | 服务端可见的请求伴随元数据，模型不可见 | llm adapter 插件（dsh-llm-glm） |
| D（dialect） | 模型可见字节与 ZCode 训练分布的偏差 | 提示词 section 覆盖 + 工具投影（dsh-glm-prompt） |
| G（gap） | ZCode 有、DSH 无对应机制 | 新增插件（进入 bundle 或独立行） |
| N（non-goal） | 哲学不同或 DSH 已有等价物，对齐无收益 | 不动 |

判断依据：参考手册第 8 章"GLM 训练特性耦合点"为 D/G 类的优先级锚——耦合点必须对齐，非耦合项按工程收益取舍。

---

## 2. 差异总览

| # | 能力 | 类 | 差距摘要 | 影响 | 优先级 |
|---|---|---|---|---|---|
| 1 | 工具命名与 schema | D | ZCode PascalCase + ZCode 版 schema；DSH snake_case + DSH 版 | 训练分布直接偏差（耦合点 #1） | P0 |
| 2 | TodoWrite 三字段（priority 0-3） | D | DSH 两字段且拒未知键；ZCode 三必含 | 已知不兼容点（耦合点 #1） | P0 |
| 3 | 身份节（CliPrefix） | D | "You are ZCode..." vs DSH 身份文案 | 训练分布偏差（模型自我定位） | P0 |
| 4 | todo 提醒回路 | D | ZCode：10+10 双阈值、特定文案、GLM 启用/claude 跳过；DSH repeat-tool-reminder 机制同族但文案/阈值不同 | 耦合点 #2，长任务清单纪律 | P0 |
| 5 | 合成消息通道 | N | 两侧同族（user 角色 + 标签包裹），DSH inject/steer 同构 | 无偏差（耦合点 #3 天然满足） | 不动 |
| 6 | compact 提示词 | D | ZCode：`<analysis>` 先行 + 9 节 + 安全 verbatim + transcriptPath 续接；DSH compaction-basic 当前 disabled，提示词结构不同 | 耦合点 #4；长会话连续性 | P1 |
| 7 | beta 能力头 | T | ZCode 按请求动态加 4 个 beta 标记；DSH pi-ai 无 | 服务端能力协商 | P1 |
| 8 | 工具懒加载 ToolSearch | G | ZCode 有完整 deferred 体系；DSH 全量直载 | 耦合点 #5；MCP 多时 token 成本 10 倍量级（参考手册 3.1 实测） | P1 |
| 9 | 服务端 web 工具 | G/T | ZCode：web_search_prime + mcp__web_reader__webReader 服务端执行、渠道绑定；DSH：本地工具 + DeepSeek 后端 | 工具形态与执行位置双差异（耦合点 #6） | P2 |
| 10 | 持久记忆 | G | ZCode 有 MEMORY.md 体系；DSH 无原生对应 | 长程个性化与项目连续性 | P2 |
| 11 | 身份头 + clientSigning V4 + 端点路由 | T | 反代职责内化（已有设计，DESIGN.md §3） | 计费渠道识别，不影响模型行为（耦合点 #7） | P1（已在案） |
| 12 | 模型目录 + OAuth | T | 已有设计（DESIGN.md §3.4/3.5） | 接入前提 | P1（已在案） |
| 13 | 日期/输出风格提醒族 | D | ZCode 有同族合成提醒；DSH 部分 | 低成本行为增强（耦合点 #8） | P3 |
| 14 | 缓存断点策略（ephemeral 5m/1h、工具级 cache_control） | N/T | 两侧机制同类，参数不同 | KV cache 命中率（成本），不影响质量 | P3 |
| 15 | 子代理体系、MCP 挂载、请求组装字段 | N | 参考手册明列非耦合项 | 无 | 不动 |
| 16 | thinking 与采样参数 | T/D | ZCode：effort 档位经 `output_config.effort` + `thinking.budget_tokens` 配对下发；thinking 启用时剥离 temperature/top_p/top_k；budget 缺省兜底 1024。DSH pi-ai 走 anthropic 通道无此配对逻辑 | 推理强度直接决定输出质量（参考手册 §10.1） | P0 |

---

## 3. 逐项明细

### 3.1 工具面投影（#1、#2）——P0

**ZCode**：默认直载 `TodoWrite/Bash/Read/Write/Edit/Glob/Grep/ToolSearch`，PascalCase，schema 为发给模型的原文；TodoWrite 条目 `content/status/priority(0-3)` 三必含、整表替换。

**DSH 现状**：`todo_write/pwsh(read/write/edit/glob/grep)...` snake_case，todo_write 两字段且执行器拒绝未知键；工具面更大（web/subagent/skill/schedule 等家族）。

**差距**：模型看到的工具名、描述、参数 schema 三层全部偏离训练分布。参考手册双臂实验证明基础任务无损，但对齐目标是零偏移而非"够用"。

**处置**：glm 会话内做工具方言投影——模型可见面整体替换为 ZCode 形态（名、描述、schema 按会话采样复现），垫片双向翻译到 DSH 执行器。TodoWrite 垫片接受三字段，priority 透传或剥离于执行边界。DSH 独有工具家族（ZCode 无对应名的）两选一：保留 DSH 形态（子代理派发、schedule 等，参考手册列入非耦合项）或映射到 ZCode 的 deferred 报名制（见 3.4）。

### 3.2 身份节（#3）——P0

**ZCode**：CliPrefix "You are ZCode, an interactive coding agent"（stable 节，排前缀）。

**DSH 现状**：DSH 自有身份文案（DeepSeek 系）。

**处置**：glm 会话的 CliPrefix 等身份相关节镜像 ZCode 文案。注意与用户级人设（AGENTS.md）的叠加关系——ZCode 身份节是 harness 层，用户指令层在其后注入，两者不冲突，但要验证叠加后的最终文案顺序与 ZCode 会话采样一致。

### 3.3 todo 提醒回路（#4）——P0

**ZCode**：`turnsSinceLastTodoWrite >= 10 && turnsSinceLastReminder >= 10`，模型为 claude 系时整体跳过（GLM 启用）；固定文案 + 已有 todo 回显；`<system-reminder>` 包裹的合成 user notice 并持久化。

**DSH 现状**：repeat-tool-reminder 插件 enabled，机制同族；文案、阈值、模型门控与 ZCode 的差异待核对（DSH 源码核对项 K1）。

**处置**：以 ZCode 参数为准覆盖——阈值 10/10、原文文案、todo 回显逻辑、GLM 保留 claude 跳过（对 glm provider 恒启用）。

### 3.4 工具懒加载（#8）——P1，缺口里收益最大

**ZCode**：注册表全量、请求只带活跃集 schema，其余以 tool_reference 名单经 system-reminder 注入；检索双模式（native 服务端检索器 / local 客户端匹配，`select:` 精确拉取）；闲置回收 + "no longer available" 提示；系统提示词有 deferred 声明段。

**DSH 现状**：无对应机制，全部工具 schema 直载。当前 profile 已挂 4 个 MCP server，工具面 60+；继续增长则 token 开销线性上升。

**处置**：新增插件（bundle 内第三行）。第一版 local 模式（不依赖 BigModel 对 native 检索器的透传，参考手册标注【未验证】）；声明段、回收/重载文案按参考手册原文。DSH 独有工具家族可借此进 deferred 名单，兼收 token 收益与工具面对齐。验收按参考手册 3.4 四条。

**前置核对（K2）**：BigModel 端点对非 ZCode 客户端透传 `tool_search_tool_regex_20251119` 与 beta 头的行为——我们带全套身份头后大概率与 ZCode 同待遇，实测一发即知；透传则 native 模式可用。

### 3.5 compact（#6）——P1

**ZCode**：自动压缩阈值可配；提示词 `<analysis>` 先行 + 9 节 summary + 安全指令 verbatim；产物解析剥标签；续接模板带 transcriptPath 引导回读。

**DSH 现状**：compaction-basic 当前 disabled（本 profile 无自动压缩）；有 tool-result-pruner、image-offload 等周边。

**处置**：glm 会话启用压缩并把提示词/续接模板替换为 ZCode 原文（耦合点 #4）；transcriptPath 回读依赖 DSH 会话落盘路径，映射到 DSH 的 session log。与 DSH compaction 插件的接管关系是源码核对项（K3）。

### 3.6 服务端 web 工具（#9）——P2

**差距双层面**：形态（模型看到 `web_search_prime`/`mcp__web_reader__webReader`，DSH 是 `web_search`/`web_fetch`）+ 执行位置（服务端 vs 客户端）。渠道绑定，非 ZCode 身份是否放行【未验证】。

**处置**：两步。第一步实测带身份头直连 `web_search_prime`/webReader 是否放行（K4）；放行 → 投影为 ZCode 形态、adapter 透传服务端执行；不放行 → 按参考手册 6.2 自建 BigModel 搜索后端（ctx.web provider，参照 web-search-exa 结构），模型可见面仍投影成 ZCode 形态、执行在本地后端。形态对齐优先于执行位置对齐。

### 3.7 持久记忆（#10）——P2

**ZCode**：memory-root 目录 + MEMORY.md 索引 + 四类型单条格式 + 双链 + 写入纪律提示词 + default-index/semantic-recall 双分支 + 超载警告。

**DSH**：无原生对应。

**处置**：新增插件（bundle 第四行）。v1 按参考手册 7.4 建议 default-index 模式：section 注入索引 + fs 工具写入 + system-reminder 召回。与 DSH 无冲突，纯增量。

### 3.8 transport 组（#7、#11、#12）——已在案

DESIGN.md §3 已覆盖：身份头（注意参考手册 1.2 确认了 `X-ZCode-Agent` 头存在，原开放问题 A1 就此关闭）、clientSigning V4、端点路由、OAuth、模型目录。新增一条：beta 能力头（advanced-tool-use 等 4 个）按请求能力集动态添加，落 adapter 请求头逻辑，与签名同层。

### 3.9 其余（#5、#13、#14、#15）——不动或 P3

合成消息通道天然同构；日期/风格提醒、缓存断点参数为低成本可选；子代理/MCP 挂载/组装字段为明列非耦合项。

---

## 4. 路线建议

按"模型质量影响 × 实现成本"排：

| 阶段 | 内容 | 交付物 |
|---|---|---|
| S1（P0 方言） | 工具面投影（含 TodoWrite 三字段）、CliPrefix 身份节、todo 提醒回路对齐 | dsh-glm-prompt 插件 + 差异 diff 表锁定 |
| S2（P1 transport） | DESIGN.md M1+M2：身份头/签名/路由/OAuth/模型目录 + beta 头 | dsh-llm-glm 插件 |
| S3（P1 机制） | compact 提示词对齐；ToolSearch local 模式（含 K2 实测决定 native 取舍） | 第三插件行 |
| S4（P2 生态） | web 工具形态对齐（K4 实测分支）、Memory 插件 | 第四插件行 + web provider |
| S5（P3 打磨） | 提醒族、缓存参数 | 配置项 |

S1 与 S2 无依赖可并行。bundle 结构从两行扩为最多四行（prompt / llm / toolsearch / memory），每行独立可禁用，维持万物皆插件的组合性。

## 5. 待拍板岔路

1. **DSH 独有工具家族的处置**：保留 DSH 形态直载（模型见过但形态偏 ZCode 无此名）vs 全部塞进 deferred 名单（上下文最省、最贴 ZCode）。建议：先 deferred 名单，实测完成率不降即定案（参考手册 3.4 验收第 4 条）。
2. **身份节镜像深度**：只镜像 CliPrefix，还是连同 Identity/OutputStyle 等 stable 节整套镜像。建议整套镜像（zero-offset 目标），但需与用户级 AGENTS.md 叠加验证顺序。
3. **native ToolSearch 是否追求**：依赖 K2 实测。若透传不可用，local 模式的模型侧行为是否等价需探针验证；不等价则 deferred 机制降级为纯 token 优化。

## 6. 待核对清单（DSH 源码侧）

| # | 项 | 目的 |
|---|---|---|
| K1 | repeat-tool-reminder 的文案/阈值/模型门控 | 决定 #4 是覆盖参数还是重写 |
| K2 | BigModel 对 native 检索器 + beta 头的透传 | ToolSearch 模式取舍 |
| K3 | DSH compaction 插件的提示词接管点与启用链 | #6 落点 |
| K4 | 带身份头直连 web_search_prime/webReader | #9 分支 |
| K5 | 工具投影与各 agent preset（standard/ptc/minimal/cordis）的组合矩阵 | S1 验收范围 |
| K6 | pi-ai 目录中 glm 模型条目的 reasoning 声明现状（reasoningEfforts/thinkingLevelMap） | 决定 #16 是目录声明还是 adapter 组装层补丁 |

## 7. 增量定案（2026-10-26 深挖后，参考手册 §10）

| 项 | 定案 |
|---|---|
| 身份节（#3） | CliPrefix 仅一句 "You are ZCode, an interactive coding agent"；Identity 开头二选一（OutputStyle 激活与否）+ 安全段 + Harness 六条；agentsMd 节承接用户指令 + MEMORY 索引；组装顺序有 bundle 实录。文案齐备，S1 可直接写 |
| TodoWrite priority | **字符串枚举**（实测 "high"），非数字；TodoRead 默认面未装载 |
| beta 头（#7） | 四头触发条件定案：strict 工具→structured-outputs；input_examples/allowed_callers→advanced-tool-use；code_execution 声明→对应版本头 |
| thinking（#16） | 组装形态定案（§10.1）；open 矛盾点：反代 reasoning.ts 记三档 low/high/max（catalog 配 8k/16k/32k 预算），手册 §10.1 记 UI 六枚举 none–xhigh。待一次 `/effort` 切换抓包定终裁（大概率 UI 六档→catalog 映射三档预算） |
| ToolSearch 检索域 | deferred 名单是唯一检索域；直载工具检索空匹配、不报错、不影响可用性；空匹配建议附提示语 |
| Memory hash（#10） | `sha256(工作区绝对路径小写).slice(0,16)`，目录 `~/.zcode/cli/memories/projects/{dirName}-{hash16}/memory/`；实测命中 26 样本——DSH 插件按同算法可与 ZCode **共享记忆库** |
| 模型表来源 | ZCode 客户端不含模型目录（服务端下发）；反代 models.ts 快照（3.11.2）可用作静态目录，注意时效 |
| semantic-recall | 结构化选记忆完全可在插件层复刻（两条 user 消息 + json_schema 约束输出），不依赖服务端 |
| K2/K4（服务端工具闸门） | 仍开放：静态度量凭据 401 过期，闸门结论未知；验证路径 = 运行中 ZCode 活 token 或反代新登录凭据重测 |
| 参考源新增 | TriDefender/zcode-api 全量源码（`GLM-House/reference/zcode-api/`，永久归档）：client-signing/identity/endpoint-routing/oauth 可读 TS 实现，移植工作量降一个量级；动工前核对仓库 LICENSE |

## 8. 增量定案（第二批，2026-10-27 调查回填）

| 项 | 定案 |
|---|---|
| effort 档位 | anthropic 通道 `output_config.effort` 五档 {low, medium, high, xhigh, max}；none/minimal 属 OpenAI 兼容通道六档词汇；`thinking.budget_tokens` 为独立参数轴，客户端无档位映射表【挂账：预算档位下发值】 |
| 八件套 schema | 全量逐字转录于 `02-zcode-tool-schemas.md`——**S1 工具投影阻塞解除** |
| priority 枚举 | `["high","medium","low"]` 字符串三枚举（双偏移实锤） |
| max_tokens 默认 | 32000（常量实锤）；采样参数组装层透传、thinking 启用时剥离；实跑值挂账 |
| compact 公式 | 默认窗口 200k、输出预留 min(maxOutputTokens, 21k)、autoCompact 阈值 166k（≈83%）；microcompact（九工具历史结果就地清理，阈值 min(90%窗口, 窗口−2000)）与 DSH 工具输出修剪同构 |
| OutputStyle | 节结构 `# Output Style: {name}` + prompt 原文；风格集为 {name,prompt} 配置对，列表服务端下发【挂账】 |
| 凭据加密（重大勘误） | credentials.json 为 enc:v1 AES-256-GCM 信封：三段 base64url(IV/tag/密文)，key=sha256(secret)，secret 优先 env `ZCODE_CREDENTIAL_SECRET` 否则 platform fallback。此前 401 真因 = 发出密文。Desktop 写入用注入 secret、静态不可解 → **Vault 必须自带 OAuth 登录产自有凭据（fallback secret 可控），仅共享反代自产的凭据** |
| web_reader | MCP 形态工具，不经 anthropic 请求声明，不在直连闸门内 |
| 三段文案 | deferred 声明段 / SessionGuidance / Skills 引导段全文已录 `02-zcode-tool-schemas.md` 附节 |
| 度量改版 | 本项目验收为产品级三轴度量（见 `00-charter.md`），字节级 diff 降级为 transport 调试工具，非验收标准 |
| 项目更名 | **GLM-Hourness**（GLM+House+Harness）；工作名 dsh-glm-dialect 废弃；项目约定（.docs/.memory、卫生理念、multitask）见宪章 |
