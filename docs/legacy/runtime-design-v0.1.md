# GLM-Hourness 运行时设计

版本：0.1（2026-10-27）。前置：00-charter.md；ZCode 逆向参考（dsh-glm-dialect/docs/01、02 系列）；BigModel digest（本目录）。
证据标注：〔DSH〕= deepseek-harness 源码实读；〔ZC〕= ZCode bundle 逆向；〔BM〕= BigModel 官方文档；〔K*〕= 待核对项。

## 1. 端到端请求流水线

glm 会话每步的数据流与责任边界：

```
① tools.resolve({agent, modelSelection})                    〔DSH: agent-loop/agent.ts:285〕
     dsh-glm-prompt：glm 时挂出 ZCode 形态工具面（别名工具 + 激活谓词门控）
② systemPrompt.assemble({modelSelection, toolSet})          〔DSH: agent.ts:287〕
     dsh-glm-prompt：CliPrefix/Identity/Harness/EnvInfo 节镜像 + deferred 声明段
     dsh-memory：agentsMd 节（用户指令 + MEMORY.md 前 200 行）〔BM 互证〕
     dsh-guard：告知节（圈禁白话声明 + 申报协议）
     dsh-workflow：工作流准则节
③ agent/pre-step waterfall（messages 可修正）               〔DSH: agent.ts:290〕
     todo 提醒（10+10 双阈值）注入；deferred 名单变更提醒
④ 请求 deepFreeze → llm.prepareCall → llm.stream            〔DSH: agent.ts:483,637,728〕
     dsh-glm-llm：身份头 + clientSigning V4 + beta 头 + thinking/budget 配对 +
     output_config.effort。冻结后只动伴随元数据（深冻结铁律）。
     ↆ BigModel 端点（按渠道档位路由，见 §6）
⑤ 工具调用 → tools/pre-execute（guard 门禁）→ 执行 → tools/post-execute
     〔DSH: core/tools/pipeline.ts〕
     别名垫片：ZCode 名 → DSH 执行器；TodoWrite 三字段拆装；
     ToolSearch 结果以 <functions> 块回注；guard 纠偏/申报。
```

系统提示词分层：harness 层逐字镜像 ZCode〔ZC §10.3〕；用户层（全局 AGENTS.md，仅人设）与项目层（仓库 AGENTS.md）经 agentsMd 节注入，顺序按 ZCode 实录。compact 只压缩对话历史不碰系统提示词，基础准则天然免疫；压缩完成瞬间由 guard/workflow 注入重锚 reminder（规矩摘要 + 活跃 todo + 违规计数）。

## 2. 工具面投影（dsh-glm-prompt）

- **别名工具**：在 glm scope 注册 `TodoWrite/Bash/Read/Write/Edit/Glob/Grep/ToolSearch` 等名字，schema 逐字用八件套原文〔ZC 02 系列〕；`execute` 委托 DSH 原生工具。原生 snake_case 工具用 `when({modelSelection})` 在 glm 会话退场或进 deferred 名单。审批、并发、取消、session 记录全部走 DSH 原管线，零修改。
- TodoWrite 垫片：`content/status/priority(high|medium|low)` 三必含，priority 于执行边界剥离或透传 DSH todo 存储。
- 编排族投影：`EnterPlanMode/ExitPlanMode`、`Agent/SendMessage/TaskOutput/TaskStop` → DSH 计划模式与 subagent/job 族。
- DSH 已有 `deferLoading` 骨架且序列化为 `defer_loading`（与 ZCode anthropic 字段同名）〔DSH: llm-deepseek/serialize.ts:165〕——投影直接复用。

## 3. multitask 编排（dsh-workflow）

状态机：需求 → 规划态（投影 PlanMode 族；出方案 ⇄ 人类补充，轮数人类说了算；方案只写动机/怎么做/验收，架构层视角）→ 放行（走审批通道）→ 分解态（主 Agent 拆子任务、按难度定档）→ 并行态 → 汇合态 → 运维态。

- 派发机制零改动 DSH：子代理 start 请求带 `agentOptions: {provider, model, reasoningEffort, maxTokens}`〔DSH: subagent 系列〕；难度→模型档位表（glm-5.3 高 effort / 标准 / glm-5.3-flash）预录进 bundle 的 model-selection 策略（allowedModels），解除「模型自选默认锁死在父路由」的门〔DSH: tool-subagent/model-selection.ts〕。
- **主↔子通信原生可用**〔DSH: tool-subagent-control〕：`send_message`（父→子在下一步边界送达；空闲子代理直接开新轮；continuable 子代理可反向发给父）、`interrupt_agent`（请求停止，外部执行型停止即永久）、`list_agents`。ZCode 的 `SendMessage` 投影到 send_message。
- **崩溃恢复**：in-process continuable 子代理（spawn/fork）是持久化 Session，支持冷恢复（cold resume，会话目录落盘 + subagentAddress/catalog 持久化）——DSH 崩溃重启后子代理历史与续聊能力不丢，但**崩溃瞬间的运行中工作丢失**（恢复的是会话状态不是进程状态）；外部执行型（acp/claude-code）崩溃即永久停止。设计约束：长任务子代理周期性 checkpoint（进度写 `.llm/` 或组件知识库），崩溃后从 checkpoint 续。
- **异常恢复（唯一专项：DSH 异常关闭 / 蓝屏 / 断电）**：会话态每步落盘（DSH Session 原生），重启后子代理历史与续聊能力不丢，进行中的请求重发即可；长任务子代理周期性 checkpoint（进度写 `.llm/`），重启后从 checkpoint 续。普通网络断联不做特殊设计——失败正常重试，子代理死了该上报主 Agent 就上报，**不允许自动更换模型/套餐/渠道**（用户决策铁律）。
- **UI 派遣面板**：DSH 现状仅状态计数 + 子会话目录导航，无「派了谁、什么模型、什么状态」的专版——bundle 附带 client 插件（DSH web 支持 client 插件注入）补：派遣面板（子代理 × provider/model × 状态 × 最新产出链接）+ 峰谷计价指示（当前峰/谷、下次切换时间；峰 = 工作日 14-18 点，谷段 5 折）。多项目分屏 DSH 无（单主视图 + 工作区列表切换），不纳入 bundle 范围，作为 DSH 宿主诉求记录。
- 子代理继承完整方言栈（tools.resolve 按 agent×modelSelection 各自算）。guard 对子代理同样生效；**子代理出界申请默认拒绝**（无人值守不批权限），出界需求由主 Agent 汇总统一向人类申报。
- 会话态隔离：deferred 活跃集、todo 计数器、提醒节流状态全部按 session id 键控，禁止进程级全局。
- 汇合门禁：测试全绿才算 done；改代码必须同步更新对应组件知识库（.llm 外、跟组件住的五件套）。
- **汇报细度规则（harness 强制，不靠模型自觉）**：向用户的汇报只讲理由/设计/效果，代码细节不进对话主频道（用户不读代码）。**五键卡片（批准/拒绝带理由/补充文本/太简单讲细点/太麻烦说重点）只出现在设计阶段**——规划循环的方案汇报每次附卡；放行后的执行阶段由 LLM 自主推进，不打断用户，汇报走自主审计机制（见下条）。太简单/太麻烦是汇报细度调校信号，进迭代记录。落实现：DSH 原生 agent question UI 承载，dsh-hourness-ui 皮肤化。
- **自主执行审计（挂机收菜问题）**：三段式——
  1. **决策分级**（事前分权）：计划内决策（按已批准方案推进、常规工具调用）自主执行只留痕；计划外决策（改范围、动计划外文件、超标花费、新开任务线、危险操作）**不阻断也不放行**——写入待批队列，子代理转做计划内其余工作， overnight 不空转也不越权。
  2. **决策日志**（事中留痕）：`.llm/audit/decision-log`，追加式，每条 = 时间 + 决策点 + 选择 + 理由 + 依据（计划内/计划外标记）。DSH Session 本身全量落盘，日志是面向审计的投影而非替代。
  3. **收菜晨报**（事后审计）：恢复交互时自动生成——完成 vs 计划对照（todo 漂移）、自主决策清单（带理由）、待批队列（逐条过）、花费（token/积分，峰谷口径）、测试与知识库同步状态。汇报粒度遵守汇报细度规则；每条待批项可一键批准/拒绝/追问。
- 运维态：schedule 定时巡检（对齐每日扫描习惯）+ 定期汇报（结论/影响/岔路三段式）。

## 4. guard：规矩数据框架（dsh-guard）

每条纪律是一组数据，不是一段代码：

```
规矩 = { 告知(提示词节) | 探测(pre/post-execute 判定器) | 纠偏(四段式模板) | 申报(结构化例外协议) | 记忆(违规落档) }
```

- 首批规矩：① 工作区圈禁（写类操作解析绝对路径，出工作区即拒）；② 文件修改专用工具（shell 写文件模式识别，宁可误拦）；③ 后续按需追加（工具误用、文档卫生等）。
- 申报协议四要素：目标路径/命令、目的、危险性自查（可逆性/爆炸半径）、替代方案自查。走 DSH ApprovalService（`ask → allowed-once/rejected`）；**无任何残留授权**。人批的是当次这一件事，界面上不提供「以后都允许」入口；申报与审批全量落 `.llm/audit/`。
- 惯犯升级：同会话同规矩 N 次违规 → 强提醒（四段式 + 违规史回显）。反复越界模式写入 `.llm/memory/` feedback 条目（含 Why/How to apply），跨会话累积调校。
- 审计日志：`.llm/audit/`（申报、批准、违规统计）；违规率曲线 = 调校度量。

## 5. 其余插件行

- **dsh-glm-llm**：模块 = identity-headers（8 头）/ client-signing-v4（自 zcode-api 移植，先核 LICENSE）/ beta-headers（四头按能力集动态）/ thinking-pairing（effort **三档 low/high/max**（GLM 实用档；五档词汇 API 接受但 GLM 不用）→`output_config.effort`；budget→thinking.budget_tokens；开 thinking 剥采样参数；缺省兜底 1024；GLM-5.3 系强制 enabled，disabled 需映射 low）〔ZC §10.1 + BM + 用户确认 2026-10-27〕/ vault（ZCode 账号登录产自有凭据；API Key 管理；福利检测+跳转，无领取 API〔BM〕）/ model-catalog（反代快照 + 官方目录合成）。
- **dsh-toolsearch**：registry（全量）+ active-set（装载状态机 {added,removed,readded}）+ local-searcher（v1，`select:` 精确 + 关键词，max_results 5）+ recycler（闲置回收 + 原文提示 + mcp__ 前缀聚合）。native 模式待 K2 透传实测。DSH deferLoading/动态 tool-updates 为底座。
- **dsh-memory**：存储根 `.llm/memory/`；MEMORY.md 前 200 行经 agentsMd 注入〔BM 白纸黑字〕；v1 default-index；semantic-recall 可纯插件层复刻（两条 user 消息 + json_schema 约束输出）〔ZC §10.4〕。卫生审计内建（超载警告、查重、陈旧检测、文档五标准扫描）。不与 ZCode 共享。
- compact 镜像（dsh-glm-prompt 承载）：<analysis> 先行 + 9 节 + 安全指令 verbatim + transcriptPath 续接映射 DSH session log；autoCompact 阈值 166k + microcompact（九工具结果就地清理）公式照抄〔ZC §11.2〕；接管点待 K3。

## 6. 端点路由矩阵（dsh-glm-llm 渠道档位）

**主通道 = ZCode 反代通道**（用户决策：反代通道享 150% 用量加成），官方 API 为备选。

| 档位 | 端点 | 用途 |
|---|---|---|
| ZCode 反代（主） | 反代端点 + ZCode 身份头/签名 | 套餐用量 ×150% 加成 |
| 按量 Chat | `https://open.bigmodel.cn/api/paas/v4` | API Key 按量计费 |
| Coding 套餐 Chat | `https://open.bigmodel.cn/api/coding/paas/v4` | 套餐积分制 |
| Anthropic 兼容 | `https://open.bigmodel.cn/api/anthropic`（x-api-key） | 官方直连时的 ZCode 形态通道 |
| Responses | `https://open.bigmodel.cn/api/v1` | 备用 |

- 2026-10-16 起新 Key 三类分治、额度跟端点/Key 类型走〔BM〕。
- 渠道 × 档位配置；startplan/bigmodel 双渠道差异待 K9。
- 风险：曾订阅 Coding Plan 的账号暂只能 Chat Completion 协议〔BM〕——anthropic 通道可用性 S2 首周实测；不可用则退 OpenAI 兼容通道重组装（方言层在构建层，通道切换不影响投影）。
- 身份头保真 = 限频风险缓解（1313 公平使用盯非官方工具）〔BM〕。

## 7. 失败语义（fail-open 矩阵）

| 插件 | 禁用/故障时 | 用户可见 |
|---|---|---|
| dsh-glm-llm | glm provider 不可用，其他 provider 无影响 | 正常 |
| dsh-glm-prompt | 退回 DSH 原生工具面+文案 | 功能不丢，分布偏离 |
| dsh-toolsearch | 全量直载（现状） | 功能不丢，token 贵 |
| dsh-memory | 无记忆节 | 功能不丢 |
| dsh-guard | 无门禁（显式禁用时） | 功能不丢，纪律失效 |
| dsh-workflow | 无状态机（普通会话） | 功能不丢 |

事件监听全部 try/catch，降级路径显式测试。

## 8. 验证体系

- 无损：同一探针集（L1-L3 + 长任务）双臂对比官方 ZCode：完成率、todo 纪律（提醒响应率）、指令遵循；用户盲测。
- 治顽疾：50+ 工具首轮请求无 deferred schema 直载；同任务 token 降 ≥50% 完成率不降〔ZC §3.4〕；记忆库信噪比曲线。
- 调校：每会话违规次数曲线（guard 审计）；skill 触发命中率。
- 融合度：六行任意启停 × standard/ptc/minimal/cordis preset 矩阵（K5），无交叉污染。

## 9. 核对项状态

| # | 项 | 状态 |
|---|---|---|
| K1 | repeat-tool-reminder 文案/阈值/门控 | 待核 |
| K2 | native 检索器透传（需活 token） | 挂账（凭据） |
| K3 | DSH compaction 接管点 | 待核 |
| K5 | 投影 × preset 矩阵 | S1 验收期 |
| K6 | pi-ai 目录 glm 条目 thinking 声明 | 待核 |
| K7 | per-provider 工具面接缝 | **已解**（本文件 §1/§2） |
| K9 | startplan/bigmodel 双渠道差异 | 待核（zcode-api 源码） |
| K10 | 子代理系统提示词镜像一致性 | S1 验收期 |
| — | effort 档位终裁（三档 vs 五档） | 已裁决：GLM 三档 low/high/max（2026-10-27 用户确认） |

## 10. 增量定案（2026-10-27 第三批）

| 项 | 定案 |
|---|---|
| 安全声明分档 | start-plan：系统提示词与 ZCode 逐字节一致（网关要求前置 system blocks，不可动）；coding-plan：安全声明段替换为用户全局 AGENTS.md 的工程环境声明（授权边界：自有机授权环境、逆向/安全/兼容为日常工程、默认本地可逆目标、仅生产系统谨慎），其余节不动。ZCode 安全段原文尚未逐字录档——S1 前从 bundle 偏移 4993369 后提取补录校对 |
| 镜像原则（事实为真） | 「行为习惯类」内容保分布逐字镜像；「宿主事实类」断言（system turns 呈现、权限语义、渲染细节）必须与 DSH 实际行为一致，对不上按 DSH 实况改写、措辞贴原句形态。**start-plan 档例外：除 agentsMd 节外全部与 ZCode 逐字节一致，不做本地化**（体验档保真优先，网关强制 system blocks） |
| 本地化清点（coding-plan 档） | ① Harness 六条（宿主事实条目改写）② SessionGuidance（按 DSH 装载拼）③ EnvInfo（目录/git/平台/shell 反映 DSH 真实环境）④ DesktopContext（ZCode 桌面特性 Gen UI/文件 URL/行内注释——DSH 无对应则裁或改）⑤ Skills 引导段（DSH 双根技能清单）⑥ 八件套 schema 内行为断言（尤其 Bash=DSH 实际 shell、路径语义、file:line 格式——垫片行为必须兑现 schema 承诺，兑现不了就改写该句）⑦ ContextManagement/transcriptPath（映射 DSH session log 真实路径）⑧ Memory 节路径与写入纪律（指 .llm/memory/ 而非 ~/.zcode）⑨ deferred 声明段与名单机制自证一致。每处改写记录进差异表供审计 |
| 画像量化 | 滑杆制：汇报细度 ∈ {简洁,适中,详细} 三档，默认适中，LLM 每次汇报自选档位；太详细/太简略按钮效果 = 拨档并记录偏好；画像记忆只存档位+场景映射（几十字），不写长描述 |
| 派单自主权（修正版） | 主 Agent 对 DSH 已配置模型有无条件调用权；拆任务/判难度/派模型/并行策略完全自主，与人类无关（人类只在配置层出现：allowedModels 一次配定）。晨报中高配使用为纯披露不构成审批 |
| 待批队列把控 | 队列自学习：同类待批项连续 N 次全批 → 晨报提议升为自动通过（一次性授权、可撤回）；积压量与人类处理时长进度量，积压高 = 分级线调整信号 |
| 记忆×git | git 管「是什么」，记忆管「为什么/偏好」；git 可查内容禁入记忆（写入前强制查）；知识库五件套进仓库随 git 版本化；`.llm/` 整体 gitignore（LLM 私产，含个人画像） |
| 检索命中保障 | 报名带一行用途提示；启发式打分（名字/别名精确 > 描述关键词 > 模糊）+ DSH↔ZCode 别名表；空结果返回「名单无此项+直载清单+建议」防瞎用；度量：检索成功率、同查询重试率 |
| 用量面板 | DSH 有 token-meter 但无套餐视角——补：积分余额 / 5h 窗剩余 / 消耗速率预估耗尽时间 / MCP 余额独立行 / 峰谷提示；重置卡同鸡蛋走检测+跳转控制台 |
| 美学产品化 | 用户 AGENTS.md 美学条款双向落地：工程侧自守（零死代码/命名一致/第三次修同处停下查根因/过时条款整条重写）；产品侧成 guard 规矩（仓库卫生审计：死代码、重复段、IDE 专用目录、过时记忆清退） |
| UI 工程流程 | 设计稿 → flash 模型看截图迭代（改一版截一版，自主修到过审）→ 用户终审；独立视觉语言（极简、信息密度克制、与 DSH 协调但可识别），mood board 供用户选 |

## 11. 增量定案（2026-10-27 第四批）

| 项 | 定案 |
|---|---|
| team 模式地基 | DSH 已有实验性 Agent Team 全家桶（agent-team / tool-agent-team / client-ui-agent-team：名册+任务板+导航 UI）——dsh-workflow 编排建在其上（lead + teammates + 共享任务板），而非裸 subagent 派发；ZCode 侧对应 Subagents（单委托）+ Agent Teams（并行编队）两层，方言投影两层都留 |
| 并发槽位 | 可配置每主 Agent 最大并行子代理数（上限）；实际派几路由 LLM 自判（含冲突约束，可远低于上限）；槽位有子代理归来时**由 harness 强提醒主 Agent 及时补位**，不靠自觉 |
| 子代理三契约（官方最佳实践） | ① 输出契约：子代理只向主会话返回摘要（上下文隔离，方言层教给 GLM）；② 最小权限：per-subagent 工具白名单（guard 支持）；③ 独立记忆：子代理各配独立记忆目录（测试/审查/文档各记各的，避免多代理记忆互相污染） |
| 自动委派 | 子代理/队友的 description 字段写清「何时用我」启用自动委派（官方推荐）；子代理可预载指定 skills |
| 美学·先搜再造 | 动手实现任何非核心机制前先搜索是否已有成熟方案/现成工具，禁止重复造轮子/造工具；引用外部方案记录出处（设计原则+guard 提示双重落地） |
| 晨报粒度 | 晨报遵守汇报细度滑杆（简洁/适中/详细三档自选），晨报本身带太详细/太简略按钮，拨档进画像 |
| 全局 AGENTS.md 融合审计 | 已融合：汇报三段式→汇报细度规则；仓库卫生→guard 审计；代码卫生+根因修→美学规矩；长会话重读→compact 重锚+批次收仓重读（收仓 gate 待 S4 落）。缺口（补入）：中文写作风格（删填充/避 AI 味词句式/精确性例外）→ 进方言层汇报与文档生成规则 |
| ZCode MCP 机制确认 | mcp__* 工具全部 deferred 检索启用：不直载 schema，名单以 tool_reference 经 system-reminder 注入（非改系统提示词本体），系统提示词仅含 deferred 机制声明段——toolsearch 复刻的正是此形态 |
| 用量统计（蓝本：逆向手册 §12） | 纯本地聚合（不依赖服务端）：原始数据 = 每请求 usage 事件（cumulative{input,output,cacheRead,cacheWrite} + contextWindow 快照）→ 聚合快照。指标口径照 ZCode 同款：summary 总账（token 四分法 total/input/output/**reasoning 思考列**；缓存三分含 cacheHitRate；首 token 延迟 + 平均轮时长；toolErrorRate/modelErrorRate 分开；活跃天数/连续 streak/峰值日）；heatmap 周×天热力；按日按模型分布；每模型 share 占比；每工具 callCount/errorRate/avgDurationMs；favoriteModel 高频榜。三档时间窗 all/7d/30d。**在 ZCode 口径之上叠套餐层**（我们独有）：积分余额/消耗速率、MCP 余额独立行、峰谷时段标记、5h 窗剩余与预估耗尽。数据同源供晨报花费块复用。落点：聚合进 dsh-glm-llm（监控模块），呈现进 dsh-hourness-ui 用量面板 |
| — | anthropic 通道对 Coding Plan 老账号 | S2 首周实测 |
