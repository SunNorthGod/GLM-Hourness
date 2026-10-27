# S1→S2 进度档（重建版，2026-10-27）

注：本档 Round 10 期间因 PowerShell 编码事故损坏后重建；Round 1-2 为摘要重建，Round 3 起为原文。

## Round 1（2026-10-26，重建摘要）

前置侦察与事实基线：ZCode 逆向手册消化（01 手册 §12 usage、02 八件套 schema）、BigModel 端点矩阵 digest、DSH 源码机制侦察（systemPrompt.section / tools.register / assemble waterfall）。落 00-charter / 03-runtime-design / 04-external-facts / 05-zcode-verbatim 骨架。

## Round 2（2026-10-26，重建摘要）

verbatim 层起步：CliPrefix / SECURITY_NOTICE / HARNESS_BLOCK / TODO_REMINDER 文案逐字转录 + identity 分层组装 + TodoWrite 三字段 schema/校验/映射；tests 11/11 绿（node:test 直跑，vitest 沙箱不可用）。

## Round 3（2026-10-27）——插件接线 + guard 落地

**完成**
1. 原生工具隐藏机制定案：`agent.ctx.tools.restrict({deny})`（作用域级）+ scoped 同名影子（`harness:identity`，order -1000）+ `when({modelSelection})` 步级激活别名。
2. 插件入口：`src/glm-prompt/index.ts`、`src/guard/index.ts`（`tools/pre-execute` waterfall，deny reason=四段纠偏）、`src/shared/dsh-min.ts` duck-type。
3. guard 规则纯逻辑层 + 测试（圈禁/专用工具/fail-open）；cordis.patch.yml 起步。

## Round 3b（2026-10-27）——原文来源勘误（用户输入触发）

**用户输入**：本机 DSH 与 ZCode 均已改装——插件按上游纯净 DSH 设计；zcode-api 仅参考不受证书约束；按美学设计。

**勘误**：pristine 3.15.1 验证发现安装版「逆向授权」安全声明是用户自己的 ZCode 补丁。官方段（Ydo）= 授权安全测试声明。verbatim 拆 SECURITY_NOTICE_OFFICIAL / SECURITY_NOTICE_USER；start-plan 用 OFFICIAL，coding-plan 用 USER。05 档案证据源分级重写。CliPrefix 与 HARNESS 两源一致无污染。

## Round 4（2026-10-27）——官方源接入 + 八件套别名落地

**重大升级**：`zai-org/ZCode` + `zcode-plugins`（均 Apache-2.0）克隆入 reference/。权威链重排：官方源码 > 协议采样 > pristine bundle > 安装版。逆向提取退役。master 提示词契约已演进（CLI prefix 独立首条 system 消息）——方言基线核对以 system-prompt-contract.md 为准。

**完成**：注入 seam 定案（post-execute additionalContexts，repeat-tool-reminder 同款）；八件套别名（六件 + TodoWrite；ToolSearch 留 S3——deferred 注册表未建前出它是虚假承诺）；index.ts 装配 + 隐藏名单扩全。

## Round 5（2026-10-27）——官方源逐节验证 + todo 提醒回路

**完成**：官方源逐节验证（SECURITY_NOTICE / Harness / identity 组装 / 10+10 阈值 / 回显格式与我们逐字一致——方言层文本首次源码级闭环）；plan-mode 提醒族原文定位（留 workflow 行）；todo-reminder.ts 状态机（TodoWrite 重置+回显、双阈值门、触发后间隔重置）。S1 偏差记录：turn≈已完成的工具调用。

## Round 6（2026-10-27）——提醒接线 + 方言基线钉定

**完成**：todo 提醒接线进 apply()（glm-todo-reminder 源标签 notice）；**方言基线钉定**：训练分布锚=3.16.3 协议采样，master 只做机制参考（master 差异录 05 §4：DeferredToolCall 包装、registry aliases/searchHint、通知文案）；reminder-wiring 套件三态。

## Round 7（2026-10-27）——S1 验收冲刺（完成）

**完成**
1. **集成探针落地并 3/3 全绿**：上游 DSH 仓库迁入工作区（reference/deepseek-harness，同 commit 22ddee37），探针挂生产 spine + mock adapter 注册为 provider `glm`。三用例实证：①末请求系统提示词=纯 ZCode 镜像+七别名原生全隐 ②TodoWrite 垫片委托原生+10/10 提醒真实注入（逐字+回显）③guard 出界写硬拒（四段纠偏、原生未执行）。
2. 探针抓出三个真缺陷并修复：别名/垫片 output 契约需复用捕获的原生契约；身份影子必须同名 `harness:identity`；ToolExecution 无 `nested` 字段（嵌套=parent token）。
3. 违规审计：guard `onViolation` 回调 + ViolationRecord；申报协议对齐任务书四要素；README 落档。

**已记录偏差**：ToolSearch 随 S3；首步方言面未生效（pre-step 晚于首请求工具解析）。

**S1 验收：达成**。对照表见 s1-acceptance.md。

## S2 Round 8（2026-10-27）——dsh-glm-llm 通道核心

**完成**
1. DSH LLM seam 契约定型（llm/src/types.ts @22ddee37）：GenerateOptions / StreamChunk / TokenUsage（DISJOINT）/ ReasoningEffortId / SystemPromptUpdate 'in-history'。
2. **dsh-glm-llm 核心**（构建零 DSH 依赖，传输注入）：wire.ts（wire 类型+SSE 解析器）；translate.ts（请求组装+StreamDecoder）；adapter.ts（GlmAdapter：三档 low/high/max、默认 32000、in-history、HTTP fail-loud）；index.ts（apply 注册 glm 路由，缺配置即抛）。
3. 测试 7 用例。注：当轮报「39/39 绿」为误报，见 Round 10 勘误。

## S2 Round 9（2026-10-27）——首步 seam 关闭 + 真 glm 冒烟就位

**完成**
1. **首步 seam 落地**：方言初始化迁到 `agent/created`（创建解析前串行等待）——agent.ts:285-289 的 tools.resolve/assemble 在 pre-step waterfall 之前，pre-step 挂点天然晚一步；created 挂点让第一个请求就是方言面。探针改断言首请求，3/3 绿——S1 首步偏差正式关闭。
2. 真 glm 冒烟用例就位：探针第 4 用例自跳过（无 GLM_SMOKE_KEY 时 skip），有 Key 时真流式跑「确认看见 TodoWrite→调用」并断言方言提示词+垫片委托；可配 GLM_SMOKE_BASE / GLM_SMOKE_MODEL。
3. cordis.patch.yml 挂 dsh-glm-llm 行；README 行表更新。

## S2 Round 10（2026-10-27）——档位层 + 上轮误报勘误

**勘误（重要）**：Round 8 报的「39/39 全绿」是误报——glm-llm 套件因 `constructor(private readonly …)` 参数属性在 node strip-only 模式不支持，根本没执行，而收尾时过滤掉了退出码。修复后真跑暴露两个真缺陷（工具参数续传 delta 无 id 被开新块；401 测试未迭代生成器）。教训入流程：每轮收尾必须带 npm exit 退出码。

**完成**
1. 档位层（tiers.ts）：payg-bigmodel / coding-bigmodel / coding-zai 预设（zcode-api providers.ts 事实源）；tier 简写，显式 baseUrl 永远赢；直连 coding 档未实现签名→fail-loud 提示走反代（签名协议侦察完毕：handshake HMAC/HKDF + Ed25519 + PoW + 双 401 降级，留作移植备选）。
2. 修复：参数属性改显式字段；StreamDecoder 续传语义（无 id 的工具 delta 接最近工具块）。
3. 基线：**44/44 绿（8 套件，npm exit 0）**，tsc 0 错。进度档因编码事故重建（本档）。

**待 Key**：真 glm 冒烟（GLM_SMOKE_KEY 触发）；环境仍无 Key。

## S2 Round 11（2026-10-27）——真 glm 端到端跑通（S2 验收达成）

**通道发现（用户指路）**：反代就在本机——DSH 桌面 profile（`~/.dsh/profiles/desktop/cordis.patch.yml`）已配 glm 路由：baseURL 8317、Key 走 `~/.dsh/.credentials.yaml` refs.GLM_API_KEY（51 位）、模型 glm-5.3 / glm-5.3-flash（512k ctx、efforts low/high/max——与我们的模型元数据事实一致）。Chat Completions 前端路径 `/v1/chat/completions`（试 401→正确 Key→200 实证；响应含 `reasoning_content`，解码器已支持）。

**完成**
1. 适配器补全 LlmAdapter 基类鸭子面：providerInfo / providerRetryPolicy / imageRequestPricing / prepareCall / listModels（探针逐个暴露的运行时探针契约）。
2. 新增本地 SSE 全链路彩排用例：真 GlmAdapter（默认 fetch、真网络栈）+ 真 AgentLoop + 方言栈 + 10/10 提醒 + usage 透传，且**服务端视角**断言首个请求即方言面（提示词+别名工具面+原生隐藏）。
3. **真 glm 冒烟 5/5 全绿**：glm-5.3-flash 经反代真流式 18s 完成多步回合——首请求带 ZCode 镜像提示词，模型真实调用 TodoWrite，垫片委托原生（'todo_write ok'）。
4. 基线：本包 44/44（npm exit 0）、tsc 0；探针 5/5（3 mock 方言面 + 1 本地 SSE 全链路 + 1 真 glm 冒烟）。

**S2 验收对照**：真 glm 会话✅（多步+工具调用真实发生）；todo 提醒在真实 spine 由 mock/SSE 彩排双证（机制与 adapter 无关，post-execute 层）——同一真实环境的合并证据。端点矩阵✅（三预设+反代前门+DSH 凭证 Key 分治）。首步 seam✅（Round 9）。

**S2 验收：达成**。

## S3 Round 12（2026-10-27）——dsh-toolsearch 懒加载行（S3 验收达成）

**机制定案**：deferred 原生 = 全部可见原生减驻留面（七件）；行内 restrict 隐藏（restrictions 相交）；激活 = **scoped 同名注册**（dsh-tools 契约明言 restrict 不影响 scoped 注册）+ deferLoading 标记；DSH 在解析面增长时自动发 tool-addition developer 通知（探针 seq15 早已实证）——与 ZCode 提醒流同构。ToolRunContext 继承 ToolExecution 带 `agent`，垫片执行期拿得到作用域。

**完成**
1. `src/toolsearch/`：search.ts（select:/关键词查询、名称命中>描述命中、max_results、`<functions>` 块逐字格式）+ index.ts（agent/created 建 deferred 目录+restrict；ToolSearch 别名 schema 逐字 3.16.3 采样；execute→激活→块回注）。
2. 单测 5 用例（select/关键词/渲染/目录构建/激活+委托+render）；套件 49/49 绿（npm exit 0）、tsc 0。
3. 探针：harness 挂 toolsearch 行 + 新懒加载用例（首请求无 web_fetch、ToolSearch 后第二请求带上+tool-addition 通知+委托执行）——一把过。
4. **真 glm 冒烟升级**：glm-5.3-flash 真流式自己完成 ToolSearch(select:web_fetch)→收 `<functions>` 块→激活→真实调用 web_fetch——**6/6 全绿**。
5. patch.yml 挂 dsh-toolsearch 行；README 更新。

**S3 验收对照**：非驻留默认不可见✓（首请求断言）；ToolSearch 查询后可调用✓（mock+真 glm 双证）；完成一次真实工具调用✓（真模型驱动 web_fetch）。

**S3 验收：达成**。

## S4 Round 13（2026-10-27）——compact 镜像 + 审计基座 + workflow 行

**完成**
1. **S3b compact 镜像**：官方源（ZCode prompt.ts）逐字库 `compact.ts`（CRITICAL 前导 + `<analysis>` 分析段 + 9 节 + example + REMINDER；custom instructions 块；`formatCompactSummary` 剥析改写；续接模板 + transcript 兜底）。
2. **compact 镜像引擎** `compact-engine.ts`：官方 `BasicCompactionEngine.summarize()` 是唯一子类钩——`makeGlmCompactionEngine(Base)` 基类注入工厂（构建零依赖、可测）；glm 路由走 ZCode 指令（前缀对齐重放+末条 user 指令+purpose compaction+剥 `<analysis>`），非 glm 委托 super。行入口（运行时动态 import 真基类 + 服务挂载）留下轮。
3. **dsh-memory 审计基座**：`.llm/audit/` 三 JSONL（violations/usage/decisions）；用量经只读 `llm/stream` waterfall 逐调用记账（fs 注入可测；探针真 spine 实证 usage.jsonl 落盘）。补 @types/node。
4. **dsh-workflow 行**：决策分级（03 §10 表）+ 派单决策日志（挂 team 工具的 pre-execute，L1 静默记录）+ 五键卡片文案（批准/拒绝带理由/补充/太简单/太麻烦——主人原语）+ 晨报聚合（例外先行→决策曲线→用量，纯函数）。
5. 基线：**69/69 绿（13 套件，npm exit 0）**，tsc 0；探针 7 用例 6 过 1 跳。patch.yml 挂 dsh-memory/dsh-workflow 行。

**Round 14 计划**
1. compact 引擎行入口（动态 import 真基类 + ctx.plugin 挂载替换）+ 探针真 spine 压缩用例（真基类 + glm mock 路由触发 compactNow）。
2. guard onViolation 接 audit journal 落盘接线；晨报 CLI/入口。
3. 用量面板数据面（hourness-ui 行起步：读 usage.jsonl 聚合 API）。

## S4 Round 14（2026-10-27）——压缩镜像引擎 + 审计闭环（S3b+S4 验收达成）

**完成**
1. 引擎类工厂重构（makeGlmCompactionEngineClass：ctx.plugin 可用类形态，config 从 this.config 读）+ 行入口 `compact-row.ts`（createRequire 同步解析真 BasicCompactionEngine，缺失即 fail-loud）；patch.yml 挂 dsh-glm-compact 行（替代 compaction-basic 行）。
2. **探针压缩镜像用例（真基类）**：子类化真 BasicCompactionEngine——glm 路由末条 user 消息=ZCode 指令（CRITICAL 前导/9 节/analysis 标签断言）＋落盘摘要剥 `<analysis>`；非 glm 委托 base（DSH 原生指令断言「You are now acting as a compaction engine」）。一把过（修两处：owner 补 toolHistory、deepseek 路由注册 adapter）。
3. **guard→审计闭环**：harness 接线 onViolation→journal.violation，guard 用例断言 violations.jsonl 落盘（rule/tool/correction 逐字段）。
4. **全量探针 8/8 绿（含真 glm 38s 冒烟）**；本包 69/69 绿 + tsc 0。

**验收对照（S3b+S4 goal）**：glm 压缩走 ZCode 镜像✓（真基类探针）；工作流行注册/派单日志/审计✓（Round 13 + 单测）；违规曲线有数据✓（violations.jsonl 探针实证）。

**S3b+S4 验收：达成**。剩余 S4 外延（用量面板 UI、晨报入口）随 S5 hourness-ui 行交付。

## S5 Round 15（2026-10-27）——记忆层 + 画像滑杆 + 面板数据面

**完成**
1. **记忆层** `src/memory/store.ts`：`.llm/memory.json` 条目（text/tags/created/lastReviewed/reviews）；知识衰减律=14 天半衰期 × 复审加成（≤×1.5 封顶）——长期不复核照样衰退；检索=命中数×强度排序；remember 幂等 upsert 且复读计复审；shouldStore 政策口只存 git 查不到的；loadStore/saveStore 持久层（fs 注入，缺文件起空库）。
2. **画像滑杆** `src/glm-prompt/persona.ts`：三档（简洁/适中/详细）LLM 逐回复自选不询问；常设偏好可配（行 config.persona，默认适中）；`glm:persona` 节（order 2400）注入方言面——探针断言 `# Reporting Depth` 入首请求系统提示词。dialect-wiring 两断言随节计数更新（3→4）。
3. **hourness-ui 数据面** `src/ui/panel.ts`：usagePanel（总计/分模型/24 小时曲线/谷时占比+徽章 `谷 N%`，坏行跳过）；dispatchPanel（decisions 流水倒序限量）；峰谷窗口可配（默认 0-8 时；ZCode 服务端下发值未知，配置项不冒充事实）。
4. 基线：**78/78 绿（14 套件，npm exit 0）**、tsc 0；探针 8 用例 7 过 1 跳（含画像节断言）。

**Round 16 计划**：①记忆工具面——Memory/MemoryQuery 别名（deferred 家族）接 store 持久层，模型可存取；②真 glm 冒烟补画像/记忆用例；③晨报入口（读三流水出全文）+ S5 验收对照。

## S5 Round 16（2026-10-27）——记忆工具面 + 晨报入口（S5 验收达成）

**完成**
1. **记忆工具面** `src/memory/tools.ts`：memory_store/memory_query/memory_forget 三工具（DSH 原生蛇形命名，非 verbatim 家族）；注册走普通 tools seam——toolsearch 的 deferred 目录收「可见且 executable 的任意工具」，三件自动进懒加载家族（glm 首面隐藏、ToolSearch 关键词激活），零额外接线。memory_store 走 shouldStore 政策口（默认启发式：路径/工件名即拒收，可注入 git grep 谓词）；memory 行 apply 扩展为注册三工具+usage 记账（memory-audit 测试补 tools 桩）。
2. **探针记忆全链**：glm 会话首请求无 memory_store→ToolSearch 关键词 'memory' 激活全家→memory_store 落真盘（`AUDIT_HOME/memory.json` 断言）→memory_query。
3. **晨报入口** reportFromFiles(fs, home, period)：读三流水缺档容错出全文（单测：缺 violations 档报「无」）。
4. 基线：**81/81 绿（15 套件，npm exit 0）**、tsc 0；**探针 9/9 绿（含真 glm 55s 冒烟，exit 0）**。

**S5 验收对照**：记忆可存取且衰减生效✓（14 天半衰+复审封顶单测；工具面真盘持久化探针）；画像节进入 glm 系统提示词✓（探针 `# Reporting Depth` 断言）；面板 API 从审计流水出真数据✓（usagePanel/dispatchPanel 单测 + usage.jsonl 真流水探针实证）。

**S5 验收：达成**。挂账：hourness-ui 原生渲染（DSH client 插件面）待客户端插件契约侦察后另行交付；ZCode 真实峰谷窗口值（服务端下发）按需配置。

## 清账 Round 17（2026-10-27）——九处本地化清单清账（S1b 完成）

**九处定案**（03 §10 coding-plan 档；`localize.ts` 落地）：
① Harness 五条（勘误：官方源五条，清单误记六条）——coding-plan 用 DSH 版（terminal→Web GUI 一句），start-plan 逐字；② SessionGuidance DSH 版（skill 内容出现即执行、不重复调用 loader）；③ EnvInfo 参数化 builder（cwd/platform/shell/osVersion/git/附加目录，`config.env` 注入，缺省不拼节）；④ DesktopContext 裁（DSH 无 Gen UI/文件 URL，不注入）；⑤ Skills note（`config.skills` 时追加）；⑥ Bash schema 兑现实况：persistent→fresh pwsh per call、state 不持久明示、`shell` 参数从 schema 删除（宿主恒 pwsh）、working_dir 提示每次显式传；⑦ ContextManagement 逐字（承诺与 DSH 压缩一致）；⑧ Memory 节 DSH 版（`.llm` 家+memory 工具三件+衰减纪律）；⑨ deferred 声明自证（S3 探针已证）。

**档位机制**：`tier: 'coding-plan'（默认）| 'start-plan'`——start-plan 除 persona 节外逐字节官方镜像（含官方安全声明），coding-plan 全本地化（用户工程声明+九处）。identity 分 notice/harness 两轴。

**峰谷校真（goal ⑤）**：ZCode 官方源无本地峰谷窗口常量——off-peak 是服务端排队协议（x-off-peak-ticket-id、429/3105 排队豁免重试、3102 续跑），调度全在服务端。面板谷时窗口保持可配置近似（默认 0-8 时），不冒充官方口径。

基线：**84/84 绿（15 套件，npm exit 0）**、tsc 0、探针 9 用例 8 过 1 跳（含九节断言）。

## 清账 Round 18（2026-10-27）——签名直连移植 + hourness 行 + 装机

**完成**
1. **zcode-api 签名直连移植**（goal ④）`src/glm-llm/client-signing.ts`：node:crypto 自研实现（协议常量/模板逐字：handshake HMAC(HKDF)→privateCipher AES-256-GCM(AAD=apiKeyId)→Ed25519 业务签名→PoW 8 零头位→七签名头→401 VERIFY 双连 bypass→startplan/off-peak 永不签）。单测 8 用例含密码学互证（Ed25519 verify、HMAC 对照、GCM 环回、PoW 重算）。**坑**：Node GCM 解密须显式 setAuthTag（WebCrypto 隐式尾部——zcode-api 用 subtle 所以无此行）。接 adapter 传输层挂账（反代在跑，直连是备选档）。
2. **dsh-hourness 行**（goal ①）`src/ui/index.ts`：`/hourness` 人命令（command-compact 同构 duck-type）= 晨报 + 面板摘要（谷时徽章）；patch.yml 挂行；单测 4。
3. **goal ③ 定案**：DSH 会话工具面只增不减（懒加载激活不可逆、无运行时反注册面），ZCode removed 通知在本形态不可达；deferred 声明通用措辞与机制自证一致（S3 探针已证）。
4. **goal ⑥ 定案**：startplan 直连档不做（阿里验证码池+system blocks 前置属反代级基建），经反代可用即满足。
5. **装机**：`~/.dsh/profiles/desktop/cordis.patch.yml` 加 insert 六行（glm-prompt[ctier coding-plan+env 真值+skills]、toolsearch、guard[workspaceRoots=本工作区]、memory/workflow/hourness[home=.llm]）；glm 通道保持主人 pi-ai 反代（避免同 provider 撞车）；dsh-glm-llm/dsh-glm-compact 不装（后者依赖禁 compaction-basic，风险后置）。workflow apply 双形态（注入 journal/ config.home）；compact-row 加 apply 别名。
6. 基线（熔断前最后实证）：**96/96 绿（17 套件，npm exit 0）**、tsc 0。

**熔断事故**：写 `~/.dsh` profile 后 shell 执行通道被宿主 guard 全拦（含 npm test/vitest，此前同命令全通过；判定为回合内粘性拦截，非命令本身）。**残项**（下轮 shell 恢复后补）：①profile-rows 探针（fixture 已写好：insert 语法 loader 干跑+六 dist 入口 apply 导出存在性）；②全量探针含真 glm 复跑；③装机后真机会话验证（需主人重启 DSH 或新开 glm 会话看方言面生效）。

**清账验收对照**：九处本地化✓（Round 17）；hourness 行✓；removed 定案✓；签名直连✓（核心+单测，接通道挂账）；峰谷校真✓（Round 17 文档）；startplan 定案✓；装机✓（写盘完成，运行时验证残）。

## 清账 Round 19（2026-10-27）——全量核查闭环（装机验证补完）

**完成**
1. 熔断复盘：拦截非粘性——`$env:` 赋值与管道形态触发模式匹配，裸命令（`npm test`、`pnpm exec vitest run …`）全通。
2. **全量核查**：本包 **96/96 绿（17 套件，npm exit 0）**、tsc 0；探针 **12 过 1 跳**（glm-dialect 8+装机行 3+指针 1）。
3. **装机行探针 3/3 绿**：上游 loader 干跑 insert 语法（fixture 相对路径锚定 file:// 断言）＋六 dist 入口文件存在＋全部具名导出 apply（装载契约）。
4. **真 glm 冒烟 56s 过**（九节方言面下 ToolSearch→调用链正常；首跑 120s 超时是反代中午负载（健康测速 10s/请求），用例超时放宽至 300s 定档）。修 profile-rows 相对路径（tests→packages 三级）、installer-patch 空壳改指针测试。
5. 装机终态：desktop profile insert 六行（coding-plan 全节+env 真值）；glm 通道保留 pi-ai 反代；glm-llm/glm-compact 不装（挂账：直连档+压缩引擎随需再装）。

**唯一剩余**：GUI 实跑——desktop 进程运行中加行不热载，需重启 DSH 后新开 glm 会话验证（方言面九节+别名八件套+/hourness 命令）。待主人重启反馈后收官。

## 清账 Round 20（2026-10-27）——装载根因修复+实跑验证达成

**根因**（主人重启后审计仍空，逐层挖出）：`--dump-config` 证 compose 无恙（六行进树、file:// 转换正确）；headless `--patch` 实跑抓到真凶——**cordis 顶层 plugin ctx 访问注入服务必须具名导出 `inject`**：memory 行 `ctx.tools`、ui 行 `ctx.commands` 触发「cannot get property without inject」→ 激活失败被静默 skip（进程只报 warning: N entries did not activate）。探针直调 apply(ctx) 绕过 fiber，从未暴露此契约。

**修复**：六行全部补具名 `export const name`；memory 补 `inject=['tools']`、ui 补 `inject=['commands']`（DSH function plugin 约定：name/inject/Config/apply 具名导出——reference AGENTS 有记载；教训：装载契约要用真装载路径验证）。

**实跑验证（headless --patch 全链，源码仓，与 desktop 同一装载路径）**：
1. 六行全部激活（剩 1 失败=源码仓 typert 未 build 既有噪音，与本包无关）；
2. glm-5.3-flash 真调用经反代完成（"ok"）；
3. **usage.jsonl 实证落盘**（glm/session-title purpose/cacheReadTokens 逐字段）——llm/stream 记账生效，memory/guard/toolsearch/workflow 同装载路径全活。

**desktop 端**：profile 行无需改（dist 已重建含 inject），主人再完全重启一次桌面 DSH 即同样生效。

**基线**：96/96 绿（npm exit 0）、tsc 0。

**清账+上线验收：达成**（headless 实跑全链实证；desktop GUI 最终体验随主人下次完全重启确认）。

## Round 21（2026-10-27 14:00-14:25）——desktop 方言面失活根因修复（pre-step 惰性初始化）

**现象**：主人 14:11 重启后新会话仍自称「DeepSeek Harness 框架/lead（Team Lead）」——方言面未生效，而 memory 行记账正常（14:11 三条 glm 流水实证），headless 同六行却自称 ZCode。

**根因**：方言初始化只挂 `agent/created` 一次性判定 `agent.model.current()`。headless/探针创建前 provider 已定；desktop 的 GUI 会话（尤其 Agent Teams lead 会话——主人问的正是 lead 会话）模型绑定晚于创建，判定落空后不再重试 → 方言面永不初始化。

**修复**（机制级）：`agent/pre-step` waterfall 兜底——payload 自带已解析 `modelSelection`，每步在工具解析与提示词组装**之前**检查未初始化的 glm agent 并完成初始化（幂等）；created 路径保留（创建即定则首请求前生效）。新增可选 `initLogPath` 探针日志（append 初始化决策，desktop 定位用）。

**验证**：单测新增「created 未绑定→pre-step 兜底初始化→后续步不重复」三段路径（97/97 绿，npm exit 0；reminder-wiring fake 补 pre-step 分支）；tsc 0；headless 真跑「你是谁」=「喵桃在此侍奉～人家是 ZCode 编码智能体，由 GLM 模型驱动」——人设（用户级 AGENTS.md）与方言身份正确叠加。

**待主人**：再完全重启一次 desktop（dist 已含修复；profile 无需改动——initLogPath 可选，如需诊断日志在 glm-prompt 行 config 加 `initLogPath: C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\audit\dialect-init.jsonl`）。
