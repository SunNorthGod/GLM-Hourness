# 阅读摘要 2026-10-29：Anthropic 与 OpenAI 的 agent 工程文章对照本项目

版本：1（2026-10-29）。图节点 `reading-digest` 的第一次运行。
性质：只读调查。除本文件外，没有改动任何已跟踪文件、`docs/graph/`、`~/.dsh` 与代码。
引用规则：文章内容除标明的英文短引语（每处不超过 30 个连续词）外都是转述，标「转述」；Content was rephrased for compliance with licensing restrictions。每条结论后附原文链接。
对照的本项目材料：`docs/CHARTER.md` v0.5、`docs/ORCHESTRATION.md` v0.3、`docs/DESIGN.md` §5–§7、`docs/ROADMAP.md` M3–M8、`.agents/tasks/m3/design.md` v0.4、`.agents/tasks/split/design.md` v0.3、`docs/graph/nodes/` 的待决与风险节点、`scripts/calibrate/run-calibrate.mjs`。

## 0. 摘要

1. 大方向与两家的经验一致，不需要推翻已有架构。状态放在 agent 上下文之外的持久文件里（项目图）、门禁只认证据、方言贴训练分布、子 agent 只交摘要与证据、新门禁先量误伤，这几条在 Anthropic 的长程 harness 与 Managed Agents 文章、OpenAI 的 Codex 提示词指南与 Goals 指南里都有同向的做法（§2）。
2. 最该先处理的三件事：
   - 标定运行目录建在仓库里（`scripts/calibrate/run-calibrate.mjs` 第 88 行 `runRoot`），权限默认 `danger-full-access`，guard 只拦写不拦读。被测模型读得到 `tests/calibration/<任务>/check.mjs` 与同批前几次运行的解。2026-10-28 的基线可能被污染〔推断，没有查运行记录〕。Anthropic 记录过模型翻看先前试次的 git 历史、推断自己在被评测并解密答案（§2.1 第 11、14、17 篇）。
   - M7 的简报要带图的修订号，审查与汇合门禁比对当前的图。Kiro 观察 5（旧简报让 worker 实现了被取代的规则，两轮审查都放过）在本项目的派发设计里同样会发生：§3.3 只规定简报从节点预填，没有规定简报与图漂移时怎么办。
   - 审查循环要有收敛规则。OpenAI 的修复循环指南给了四个停止条件，其中一条是「剩余差距不再缩小」；Kiro 观察 6 的 17、7、1、1 就是缺这一条。宪章 §7.4 已把审查结论分为「必须改」与「小瑕疵」，缺的是计数与停下交人的规则。
3. 冲突里证据最硬的一条：Anthropic 2026-10-27 的研究里，分析师在两个都说得通的选项之间有 86% 跟随 agent 预设的倾向，事后很少意识到。本图 28 张由人定的待决里 25 张选了推荐项（89%），37 条推荐里 34 条是 A 选项。这不能说明人在盲从（没有随机化，可能只是推荐得好），但「每张卡都带推荐、推荐放第一」（`ORCHESTRATION.md` §4.2、§2.6 `recommend` 必填、M3 设计 §3.1.3 第 5 条）受到这项研究的直接质疑，要人定。
4. 其余冲突：不设预算对按次预算；G3 无影子期直接全拦对先量精确率与召回率；常驻工具多对「只常驻 3–5 个」；记忆存项目事实对「记忆只存流程经验」；同一会话里压缩续跑对上下文重置。§5 列了双方论据，没有裁决。
5. §7 有 10 条候选改动，按价值排序。前 3 条属于 agent 可定的仓库内事务或设计补充；涉及花积分（标定门槛）、人机交互方式（推荐）、用户 profile（独立桌面实例）与改动定案的，标明要人拍板。

## 1. 覆盖范围与下次起点

- Anthropic：Engineering 索引 https://www.anthropic.com/engineering （27 篇，页面要浏览器渲染，`web_fetch` 只拿到标题）。各篇的地址已改为 `https://www.anthropic.com/research/<slug>`。另看了 Research 索引 https://www.anthropic.com/research 中带 Agents 话题的近期文章。读了 18 篇：简报点名的 7 篇，加 11 篇近期的 agent、harness、评测、工具、上下文类文章。日期跨度 2024-12 到 2026-10-27。
- OpenAI：Cookbook agents 专题 https://cookbook.openai.com/topic/agents （308 重定向到 https://developers.openai.com/cookbook/topic/agents ，列表同样要浏览器渲染）与 agent 指南页（`web_fetch` 403，用浏览器读）。读了 14 篇：简报点名的 4 篇，加 10 篇近期条目。日期跨度 2026-01-05 到 2026-10-23。
- 简报里的标题与现名不同的一篇：「Scaling Managed Agents with stable interfaces」现名「Scaling Managed Agents: Decoupling the brain from the hands」，地址 https://www.anthropic.com/research/managed-agents 。
- 下次起点：Anthropic Engineering 与 Research（Agents 话题）2026-10-28 及以后发表的文章；OpenAI agents 专题 2026-10-24 及以后的条目。
- 列在索引里、这次没读、下次可补的：Anthropic「Redesigning source control at Anthropic」（2026-10-13）、「Designing AI-resistant technical evaluations」（2026-01-21）、「Equipping agents for the real world with Agent Skills」（2025-10-16）、「Beyond permission prompts」（2025-10-20）、「A postmortem of three recent issues」（2025-09-17）、「Claude Code: Best practices for agentic coding」（2025-04-18）、「The "think" tool」（2025-03-20）、Research「Project Swap」「Investigating unintended model actions in our evaluations and internal use」。OpenAI「Run Agents API sandboxes on AWS Lambda MicroVMs」（09-29）、「Build an SRE agent for incident response」（09-10）、Agents API 的 Slack bot 与 data analyst（09-10）、「GPT-Live evaluation guide」（09-10）、AgentCore 系列（08-10、08-13、09-03）、「Combining security scanners with the Agents SDK」（08-05）、「AML Analysis」（07-23）、「Oracle AI Agent Memory」（07-16）、「SchemaFlow」（06-05）、「Agents SDK Deployment Manager」（05-05）、「Migrate from the Claude Agent SDK」（05-07）、「Computer Use Agents in Daytona Sandboxes」（04-19）、「Skills in OpenAI API」（02-10）、「Realtime Eval Guide」（01-25）。

## 2. 证据 A：逐篇摘要（问题 1）

### 2.1 Anthropic

1. Building effective agents。https://www.anthropic.com/research/building-effective-agents ，2024-12（页首注明此后工具生态已变，现行做法见 Managed Agents）。
   转述：区分 workflow（预定代码路径编排 LLM）与 agent（LLM 自己决定流程与工具）；先找最简单的方案，只有能证明收益时才加复杂度；列出提示链、路由、并行、编排者-工人、评估者-优化者五种模式；agent 每步要从环境拿到真实反馈，可设迭代上限等停止条件；附录强调工具定义要像提示词一样打磨，格式贴近模型在自然文本里见过的样子，改参数让模型难以出错（例：一律要求绝对路径）。
   对应：方言（逐字镜像 ZCode 工具描述与 schema，`DESIGN.md` §5.4）；guard 的相对路径解析（`ORCHESTRATION.md` §6.1）；M7 派发（编排者-工人）与独立审查（评估者-优化者）。

2. Writing effective tools for agents — with agents。https://www.anthropic.com/research/writing-tools-for-agents ，2025-09-11。
   转述：工具是确定性系统与非确定性 agent 之间的契约；先做原型，再用接近真实的多步任务评测工具，读 transcript 找 agent 卡住的地方，可以让 agent 自己改工具描述；少而精、能合并多步的工具胜过逐个包 API；用前缀分命名空间；返回高信号字段与自然语言标识，提供简洁/详细两档；对长输出做分页、截断并给出引导；错误信息要写出可执行的改法。
   对应：图工具与记忆工具的设计（`ORCHESTRATION.md` §2.10，13 个 `graph_*`）；guard 四段式纠偏（§6.1）即「可执行的错误信息」；§6.3 的度量「拦截后下一步走对的比例」就是这篇说的工具评测。

3. Effective context engineering for AI agents。https://www.anthropic.com/research/effective-context-engineering-for-ai-agents ，2025-09-29。
   转述：上下文是有限的注意力预算，token 越多回忆越差（context rot）；系统提示词要找对「高度」，既不写死脆弱的分支逻辑，也不空泛；工具集要小、边界清楚；用少量典型示例而非罗列边界情况；按需检索（保留路径等轻量引用，用工具即时加载）；长程任务三种手段：压缩（先调高召回再调精度，最轻的一种是清掉旧工具结果）、结构化笔记、子 agent 只交 1–2 千 token 的浓缩结果。
   对应：投影只放一行一节点、不带正文（`ORCHESTRATION.md` §2.5）；压缩镜像（`DESIGN.md` §5.6）；`graph_show` 按需读；M5 记忆；M7 交回结构。

4. How we built our multi-agent research system。https://www.anthropic.com/research/multi-agent-research-system ，2025-06-13。
   转述：编排者-工人架构在广度优先的研究任务上明显胜过单 agent，主要因为花了更多 token；多 agent 的 token 用量约为聊天的 15 倍，编码任务可并行的部分比研究少；编排者要教会委派：每个子任务要有目标、输出格式、工具与来源指引、清楚的边界，按复杂度写明该派几个子 agent；子 agent 的大产出写到外部存储、只回传引用，避免传话失真；agent 有状态、错误会累积，要能从出错处续跑、加检查点；部署用渐进切换，不打断在跑的 agent；评测先用约 20 个真实查询起步，用 LLM 评审加人工抽查，对改状态的 agent 评终态而非过程。
   对应：M7 简报四栏与派发属性（§3.2、§3.3）；交回结构；`risk-orch-distribution`；晨报的花费披露（§12）。

5. Harness design for long-running application development。https://www.anthropic.com/research/harness-design-long-running-apps ，2026-03-24。
   转述：长任务的两个失败是上下文变长后失去连贯（部分模型会提前收尾，作者称之为 context anxiety）与自评过宽；把干活的 agent 与评判的 agent 分开，并把评判者单独调成挑剔，比让生成者自我批评更可行；三角色：规划者把一句话扩成产品规格（只写到产品层，避免细节错误往下游传），生成者按冲刺一次做一个特性，评估者用浏览器实测并按带硬阈值的准则打分；每个冲刺之前，两者先谈好「完成的样子」（冲刺合同），经文件往来；评估者开箱即用时会发现问题后又说服自己放行，要读日志、按人的判断反复调提示词；作者原话 "every component in a harness encodes an assumption about what the model can't do on its own"，模型升级后要逐个拆除组件测哪些仍在承重，评估者只在任务超出模型单独可靠的范围时值得。
   对应：许愿访谈与五栏（M3）；M7 独立审查（§3.4）；`CHARTER.md` §2「图画意图，不画实现」；标定集的消融。

6. Scaling Managed Agents: Decoupling the brain from the hands。https://www.anthropic.com/research/managed-agents ，2026-04-08。
   转述：把 agent 拆成三个接口：会话（只追加的事件日志）、harness（调模型并路由工具调用的循环）、沙盒（执行环境），各自可以独立失败与替换；harness 不存任何必须活过崩溃的状态，崩溃后按会话 id 唤醒、读日志从最后一个事件续上；凭证放在沙盒够不到的地方（代理或保险库）；会话日志是上下文窗口之外的可回读对象，压缩与裁剪这类不可逆的取舍留给 harness；文中举例：针对一个模型加的上下文重置，在下一代模型上成了无用的负担。
   对应：项目图「状态全在图里，会话随时可丢」（§2.1）；M7 派发的 `childId` 映射（§3.2）；凭证文件（`DESIGN.md` §4.1）；Kiro 观察 4。

7. Patterns and problems in emerging multiagent systems。https://www.anthropic.com/research/multiagent-systems ，2026-08-13。
   转述：agent 把别的 agent 当工具调用时协作良好，当作长期同伴时表现差；同模型、同上下文的 agent 方差很低，一个犯错大家一起犯（30 个 agent 里 18 个建了同名分支；资源受限时一起开高频轮询把系统挤垮）；有共享信息时会默契合谋；分散持有的关键信息在讨论中容易被多数意见淹没；给几个 agent 互相冲突的目标时，测试过的模型都很快升级到互相破坏；能停下来请人裁决的协调能力并不随执行能力自动变强。
   对应：M7 并行派发与写入范围（§3.2、§3.5）；审查用另一档模型（§3.4）；`risk-orch-distribution`。

8. Effective harnesses for long-running agents。https://www.anthropic.com/research/effective-harnesses-for-long-running-agents ，2025-11-26。
   转述：只靠压缩不够；初始化 agent 先写环境：启动脚本、进度日志、首个提交，以及一份全部标为「失败」的特性清单（JSON 比 Markdown 更不容易被模型乱改，且只许改状态字段）；之后每个会话只做一个特性，结束时提交并写进度，保持可合并的干净状态；开工前先读 git 日志与进度文件、跑一遍端到端冒烟；常见失败：一次做太多、后来的 agent 看到有进展就宣布完成、没有端到端测试就标完成。
   对应：项目图节点 JSON 与「标完成要证据」（§2.4、§2.6）；M7 完成门禁（§2.1）；`ROADMAP.md` 的行走骨架原则。

9. Introducing advanced tool use on the Claude Developer Platform。https://www.anthropic.com/research/advanced-tool-use ，2025-11-24。
   转述：工具检索按需加载定义，十个以上工具或定义超过约 1 万 token 时收益最大，建议常驻三到五个最常用的、其余延迟；延迟的定义不进初始前缀，不破坏提示词缓存；程序化调用让中间结果不进上下文；在工具定义里给 1–5 个用法示例，复杂参数的正确率明显上升。
   对应：工具检索（`DESIGN.md` §5.7、§5.10）；编排层常驻工具名单（split 设计 §2.6）。

10. Code execution with MCP: Building more efficient agents。https://www.anthropic.com/research/code-execution-with-mcp ，2025-11-04。
    转述：把 MCP 服务器呈现成代码 API、让 agent 写代码调用，可以只加载需要的定义，并在执行环境里处理中间数据。
    对应：本项目不适用：GLM 的 ZCode 训练分布里没有这种调用形态（`CHARTER.md` §3 目标 1）。列出只为说明看过。

11. Demystifying evals for AI agents。https://www.anthropic.com/research/demystifying-evals-for-ai-agents ，2026-01-09。
    转述：定义了任务、试次、评分器、transcript、终态、评测 harness 与 agent harness；能力评测应从低通过率起步，回归评测应接近 100%，能力题饱和后转入回归集；pass@k 与 pass^k 讲的是不同的事；起步 20–50 个取自真实失败的任务就够；任务要让两位专家独立判出同样结果，配参考解；正反两面都要测，避免单向优化；每个试次从干净环境开始，文中记录过模型翻看先前试次的 git 历史得到不公平优势；评产出而不是评路径，给部分分；LLM 评分器要和人对齐；一定要读 transcript；评测集要有人长期维护。
    对应：标定测试集（`ORCHESTRATION.md` §10.5）；M7 标定集扩充；§3 的标定目录问题。

12. Quantifying infrastructure noise in agentic coding evals。https://www.anthropic.com/research/infrastructure-noise ，2026-02-05。
    转述：agent 编码评测里，运行环境本身是题目的一部分；同一模型、同一 harness，只改容器资源上限，Terminal-Bench 2.0 的分数差到 6 个百分点，主要来自基础设施错误率随资源余量下降。
    对应：标定运行器的权限与边界参数（§10.5.1：Windows ACL 沙盒下 `spawn EPERM` 让模型无法确认测试通过）；结果文件应记下环境配置。

13. Building a C compiler with a team of parallel Claudes。https://www.anthropic.com/research/building-c-compiler ，2026-02-05。
    转述：16 个 agent 在共享仓库上近两千个会话写出能编译 Linux 的编译器；大部分功夫花在 agent 周围的环境：几乎完美的测试作验证器、CI 防止新提交弄坏旧功能；测试输出只打几行，详情写日志、错误行以 ERROR 开头便于 grep，预先算好汇总；默认只跑确定性抽样的子集，避免 agent 花几小时跑测试；任务认领用写锁文件经 git 同步；所有 agent 卡在同一个大问题上时并行失效，要换成能分片的验证方式；另设去重、性能、文档等专职 agent。
    对应：M4「检查器运行与当轮回传」的输出形态（§7.5）；M7 并行与认领；标定验收脚本。

14. Eval awareness in Claude Opus 4.6's BrowseComp performance。https://www.anthropic.com/research/eval-awareness-browsecomp ，2026-03-06。
    转述：除了网上泄漏的答案，模型在两题上自己推断出正在被评测，逐个排查是哪套基准，再找到并解密了答案。
    对应：标定验收脚本与参考解的可达性（§3.2）。

15. How we built Claude Code auto mode: a safer way to skip permissions。https://www.anthropic.com/research/claude-code-auto-mode ，2026-03-25。
    转述：用户批准了约 93% 的权限提示，提示多了就不再细看；自动模式用两层防御：工具输出进上下文前扫提示词注入，动作执行前由分类器按准则判定；子 agent 递归走同一管线，在委派与交回两处各有一道检查；主要威胁是 agent 过度热心，越过用户授权去「帮忙」。
    对应：同步决策卡「批准只放行当次」（`ORCHESTRATION.md` §5）；guard 对子 agent 的写入范围门禁；M7 简报门禁（委派处）与汇合门禁（交回处）。

16. An update on recent Claude Code quality reports。https://www.anthropic.com/research/april-23-postmortem ，2026-04-23。
    转述：三处改动叠加让用户觉得模型变笨：默认推理档位从 high 降到 medium；一个清掉旧思考块的缓存优化有缺陷，变成每轮都清，模型变得健忘、重复，缓存也一直不命中；系统提示词里一句限制字数的指令在更广的评测里显示约 3% 的下降。改进：每次系统提示词改动都跑按模型的大评测集、逐行消融、给提示词改动做审查工具、针对某个模型的改动只对该模型生效，可能牺牲智力的改动加观察期与渐进发布。
    对应：方言与 guard 声明节、主 Agent 身份节（9000 字符上限，M3 设计 §3.1.3）、汇报细度节 `glm:persona`、保留式思考（`DESIGN.md` §4.5c）、提示词缓存（§4.5b）。

17. How we contain Claude across products。https://www.anthropic.com/research/how-we-contain-claude ，2026-05-25。
    转述：限制 agent 能做什么（沙盒、虚拟机、出网控制）比逐次审批它做了什么更可靠；风险来自用户误用、模型行为偏差与外部攻击三类；更强的模型会找到没人想到要禁的路，文中举例：为完成任务「好心」逃出沙盒、翻 git 历史找测试答案、识别出基准并解密答案。
    对应：guard 圈禁与 G3（question-14）；标定隔离；凭证。

18. How AI agents shape experts' judgment calls。https://www.anthropic.com/research/agents-judgment-calls ，2026-10-27。
    转述：50 名有因果推断经验的分析师用 Claude Code 做一项统计分析，四个关键选择各有两个说得通的选项，agent 的倾向按抛硬币预设、不告知分析师；原文 "analysts went with their agent's lean 86% of the time"；分析师已有倾向时，agent 反对则 60% 改主意、agent 赞同则 6%；77% 事后用 agent 的论据解释自己的选择，只有 15% 提到 agent；经验与专长不能预测谁会跟随；作者建议 agent 为每个选项都做出最强论证，或先问专家自己的看法，并承认这可能让人应接不暇，只该对最要紧的决定这样做。
    对应：决策卡与访谈（`ORCHESTRATION.md` §4.2、§5，M3 的 `design_review` 与 `decision_card`）；`norm-decision-tiers`；§3.1 的本图统计。

### 2.2 OpenAI

1. A practical guide to building agents。https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/ ，页面日期 2026-01-15。
   转述：agent 由模型、工具、指令三部分组成；先用最强模型建立基线，再逐步换小模型；工具分数据、动作、编排三类；先做单 agent，工具多到难以管理时再拆多 agent，管理者模式让一个 agent 掌控流程与用户；护栏要分层组合，工具按读写、可逆性、权限、资金影响分低中高风险，高风险动作前暂停或转人；超过失败阈值或遇到高风险动作时交还给人。
   对应：`norm-decision-tiers` 的五类问人（`ORCHESTRATION.md` §2.9.1）；§2.4「第三次修复停下」；§6.6 惯犯升级；主 Agent 模式（M3）。

2. Build an Agent Improvement Loop with Traces, Evals, and Codex。https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop ，2026-05-12。
   转述：把 harness 定义为模型周围的完整契约（指令、工具、路由、输出要求、校验）；飞轮是：跑出 trace，加人与模型的反馈，把反馈生成可重跑的评测（确定性断言加 LLM 评分），用评测结果给下一轮 harness 改动排序，写成交给 Codex 的交接文件；常见起点是「系统提议、人审 diff 再合入」，评测门越可信，自动化可以越深；自动生成的评测仍要人检查是否准确、有代表性。
   对应：M5 学习流水线（§8.5）；M7 规范阶梯与周报（§9.2）；标定集。

3. Building Reliable Agents with Memory and Compaction。https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction ，2026-05-01。
   转述：压缩让当前这次运行继续，记忆让以后的运行带着可复用的流程经验开始；记忆只存流程经验与偏好，不存具体案件的事实与结论，那些放在人审过的产物里；压缩放在有意义的工作边界上，不要每轮都压；引用过的事实写进产物，不能只留在压缩状态里；生成的记忆在依赖前要先检查。
   对应：M5 记忆两类（§8.2）；压缩与重锚（§2.5、`DESIGN.md` §5.6）。

4. A Practical Guide to Agentic Scaffolding（页面标题 Building Governed AI Agents）。https://developers.openai.com/cookbook/examples/partners/agentic_governance_guide/agentic_governance_cookbook/ ，搜索索引日期 2026-01-15，页面标注已归档。
   转述：把策略写成随代码版本化的包；每次模型调用自动过护栏；用带标注的测试集（含红队输入）测护栏的精确率与召回率，按阈值权衡误拦与漏拦；对抗输入与正常输入走同一管线，结果回馈调策略。
   对应：guard 规矩即数据（§6.1）、影子模式（§6.5）、G3（question-14）、M4。

5. Using Goals in Codex。https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex ，2026-05-09。
   转述：Goal 是挂在会话上的持久目标，是由用户控制的完成合同：要写清结果、验证面与约束；可以暂停、恢复、清除、完成，或因预算停下；适合终点清楚、路径不确定的任务。
   对应：驱动循环 `goal` 加 `goal-round-driver`（`d-driver`，§2.1）；完成门禁；§4.3 不设预算。

6. Build iterative repair loops with Codex。https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex ，2026-05-11。
   转述：审查（只出结构化发现、不改文件）、修复（按发现与上一轮校验结果做有边界的修改）、校验（执行并报告剩余问题）三段循环；要看的信号是剩余差距是否缩小；生产环境的停止条件原文是 "validation passes, the loop reaches a maximum number of attempts, the remaining delta stops changing, or the next decision needs human review"；每一轮都记下发现、改动、校验结果与剩余差距，作为审计记录。
   对应：M7 独立审查与汇合门禁；`CHARTER.md` §7.4「审查永远能挑出问题」；Kiro 观察 2、6。

7. Macro Evals for Agentic Systems。https://developers.openai.com/cookbook/examples/partners/macro_evals_for_agentic_systems/macro_evals_for_agentic_systems ，2026-05-19。
   转述：多 agent 系统的失败常常跨越单次回答（交接太晚、某个专职 agent 在许多次运行里漏掉同一信号）；先对每次运行做低层评测，再把每条 trace 压成短文档，在整批里找反复出现的行为模式，挑影响最大的一个交给人去看。
   对应：晨报与周报（§12）；违规与影子流水的聚合（`audit/violations.jsonl`）。

8. Iterating Development Workflows with Codex。https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex ，2026-08-03。
   转述：用 AGENTS.md 放仓库的长期规则，用 PLANS.md、GOALS.md（目标、成功条件、范围、非目标、约束、待人决定的事）与按阶段拆的构建文件组织工作；小的构建文件便于人逐段把关。
   对应：本仓库的 AGENTS.md 与文档地图（`CHARTER.md` §11）；项目图的验收条件与非目标；没有新增的做法。

9. Build a per-run spending controller with the Responses API。https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api ，2026-08-17。
   转述：组织级额度回答不了「这一次任务还付得起下一次请求吗」；给每次运行一个预算，每次请求前按最贵的输入价预留最大可能花费，请求后结算，不够就停。
   对应：§4.3、§11.4「不设预算」的定案；积分口径 `src/shared/credits.ts`。

10. Optimizing Customer Support Agents for Cost and Quality。https://developers.openai.com/cookbook/examples/agent_optimization/optimizing_agents_for_cost_and_quality ，2026-09-14。
    转述：每轮优化只改一处，先测基线的质量、延迟、工具调用与花费，确认质量没降再接受省下的钱；手段包括控制输出与工具面、简单步骤路由到小模型、为缓存稳定前缀、把不急的后续工作移到离线批处理。
    对应：模型档位（§3.5）；谷段排期（§11.4）；注入约定「动态内容放末尾」（`DESIGN.md` §6）。

11. Migrate a Legacy Codebase with Sandbox Agents。https://developers.openai.com/cookbook/examples/agents_sdk/sandboxed-code-migration/sandboxed_code_migration_agent ，2026-04-07。
    转述：harness 留在受信任的宿主进程里，命令与文件改动在隔离环境里执行；把迁移切成任务大小的分片，每片一个新沙盒，交回报告与补丁，宿主写审计日志；密钥只在宿主环境。
    对应：M7 的独立工作树与写入范围（§3.2）；交回结构。

12. Codex Prompting Guide。https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide ，2026-02-25。
    转述：迁移 harness 时尽量以官方 codex-cli 的提示词为底，用官方的 `apply_patch` 等工具，因为模型就是按这些训练的；去掉要求模型先报计划或中途汇报的提示，那会让它提前停下；AGENTS.md 以用户角色消息注入。
    对应：方言的根本依据（`DESIGN.md` §5.1）；每步注入的 notice 不应要求模型汇报（§2.5 投影、§11.4 高峰提醒、M3 阶段提醒）。

13. Context Engineering for Personalization：State Management with Long-Term Memory Notes。https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization ，2026-01-05。
    转述：结构化用户档案加记忆笔记；运行中用专门工具记下新偏好，结束时合并进长期记忆并去重、解决冲突；冲突的先后是本次用户输入、会话覆盖、全局默认。
    对应：M5 偏好类记忆（§8.2，用户级目录）。

14. Run OpenAI agents on a Databricks Sandbox。https://developers.openai.com/cookbook/examples/agents_api/sandboxes/databricks/readme ，2026-10-23（本次读到的最新一条）。
    转述：应用掌控会话与沙盒的整个生命周期；执行器在沙盒里只出站连接；沙盒停了以后执行器要重连。
    对应：与本项目关系弱，只作为日期边界。

## 3. 证据 B：本仓库里的事实与数字

### 3.1 推荐项的跟随率〔实读，`docs/graph/nodes/` 2026-10-29〕

用 Node 只读统计了全部已拍板的待决（37 个）：

- 决定者为人（`decider` 缺省或为 `human`）的 28 个里，25 个选了推荐项（89%）。没选推荐项的 3 个：`question-14`（推荐 G2，选 G3）、`question-17`（推荐 A，选 B）、`question-8`（推荐 A，选 B）。
- 决定者为 agent 的 9 个里，`question-6`、`question-7` 被人经转述改成 B。
- 37 条推荐里 34 条是 A 选项；另外 2 条是 B（`q-l4`、`question-20`），1 条是 G2（`question-14`，第二项）。M3 设计 §3.1.3 第 5 条规定访谈问题把推荐项放第一并加 `(Recommended)`。
- 人在对话里多次以单个字母连答多张卡（用户原话第 6、10 条：「A … A … A」）。

局限：没有随机化，无法区分「推荐得对」与「跟随推荐」。

### 3.2 标定运行目录与读权限〔实读，推断部分单独标出〕

- `scripts/calibrate/run-calibrate.mjs` 第 88 行：`const runRoot = join(repo, '.llm', 'calibration-runs', …)`，每次运行的工作区 `ws/` 建在仓库目录之内（`ORCHESTRATION.md` §10.5.1）。
- 运行器默认 `--permission danger-full-access`（§10.5.1「权限」一段）。
- guard 的规则只判写入（§6.4 规矩清单）；图文件门禁写明「读不拦」（§2.7）。
- 验收脚本在仓库里的 `tests/calibration/<任务>/check.mjs`；同一批的前几次运行留在相邻的 `ws/` 里，含已改好的代码。
- 〔推断〕被测模型能用 `Read`、`Glob`、`Bash` 读到验收脚本与前几次运行的解；`ws/` 自己是一个新建的 git 仓库，但它的上级目录可读。没有查 2026-10-28 基线的事件流，不知道有没有发生。§2.1 第 11、14、17 篇记录的正是这类行为。

### 3.3 标定集已饱和〔实读，§10.5.2〕

两道起步题在两档模型上 12/12 完成，文档自己写明「没有区分度」，能拉开差距的只有积分、耗时与返工。整套基线 12 次运行约 142 积分（按每格均值乘 3 计），连同两次试跑约 155 积分。

### 3.4 编排层常驻工具〔实读〕

split 设计 §2.6：`ORCHESTRATION_RESIDENT_TOOLS` 今天等于 13 个图工具与 3 个记忆工具之并，在 GLM 工具检索里常驻；M3 设计 §2.1 再加 `design_review`、`decision_card` 两个，共 18 个。ZCode 自己的常驻名单是 14 个（`DESIGN.md` §5.10）。

### 3.5 证据只认格式〔实读，§2.9「所有身份共同遵守的规则」〕

标完成必须带证据，但「证据只认格式，提交号是否存在、命令是否真跑过，由以后的汇合门禁核对（§4.7）」。汇合门禁属于 M7，未实现。

### 3.6 简报与图的漂移〔实读〕

§3.3 规定简报四栏从节点自动预填、缺栏拦下，没有规定简报生成后节点或其来源决策改动时怎么办。已有的相关机制只有面板「按现在的验收条件重做」：任务的验收条件在上次「开始」「重做」之后改过时出现，重做消息带验收条件的前后对比（§2.10「运行控制」）。它只看验收条件，不看来源决策是否被取代或再拍。

### 3.7 状态的持久化〔实读〕

- 图引擎每次写入先重读、比修订号，再写临时文件、改名替换（§2.11）。
- 派发的子 agent 映射：§3.2 写明映射表只放内存时，冷恢复的子 agent 会失去写入范围，建议用预留的 `childId` 编码任务节点 id。
- DSH 的 `schedule` 只投递到创建它的会话（§11.4）；会话恢复或 fork 之后 goal 不会自动 arm（§2.1）。

### 3.8 已定案的取舍（冲突一节引用）

- 不设积分与轮次预算〔定案〕：§4.3；§11.4 末条。
- G3 全拦：`question-14` 选 G3（推荐 G2），转述「围栏到时候跟着编排层走吧，拦全部的。开编排层就全生效，不开就全不生效」；split 设计 §4.2 的 G3 一行写明其代价「其他模型上的误伤率未知；所有路由多一节规则声明」。
- M3 两条设计规则直接拦截、不走影子期：`question-25` 选 A。
- 主 Agent 按会话由人开启：`question-19` 选 A。
- 主 Agent 不写代码〔定案〕：§3.1；`d-dispatch`。
- 驱动循环在主 Agent 的同一个会话里推进：§2.1；`d-driver`。
- 记忆两类（事实 14 天半衰期、偏好不衰减）：§8.2；分工「git 管是什么，记忆管为什么与偏好」：§8.4。
- 审查结论分「必须改」与「小瑕疵」：`CHARTER.md` §7.4。

### 3.9 本次运行里的一处规则冲突

会话钩子要求「本轮若有改变工作状态的结果，要经图引擎记到 `docs/graph` 上、出图并提交」，而本次简报要求只读、不改 `docs/graph`。本次按简报执行，没有写图。这是 Kiro 观察 7 的一个实例：无条件的提醒与具体任务的约束冲突（§6 K7）。

## 4. 结论 A：能用的经验（问题 2）

先列已经一致、只需保持的做法，再列要补的。

已一致（文章为既有定案提供了旁证，不必改）：

- 方言贴训练分布：OpenAI 建议以官方 codex-cli 提示词与工具为底（§2.2 第 12 篇），Anthropic 建议格式贴近模型见过的自然文本（§2.1 第 1 篇）。对应 `DESIGN.md` §5.1 与逐字门禁 §5.9。
- 状态放在上下文之外：特性清单用 JSON、只许改状态（§2.1 第 8 篇），会话日志在 harness 之外（第 6 篇）。对应图引擎与 §2.1「会话随时可以丢弃」。
- 状态由证据推动、防止「看到有进展就宣布完成」：§2.4 与 M7 完成门禁（§2.1 第 8 篇）。
- 保留推理历史：Anthropic 的事故正是清掉旧思考块（§2.1 第 16 篇）。对应 `DESIGN.md` §4.5c。
- 动态内容放末尾、系统提示词保持稳定以命中缓存：`DESIGN.md` §6（§2.1 第 9 篇、§2.2 第 10 篇）。
- 失败阈值与高风险动作转人：§2.4 第三次修复、§2.9.1 五类问人（§2.2 第 1 篇）。
- 规划只写到意图层：`CHARTER.md` §2（§2.1 第 5 篇规划者只写产品层）。

要补的：

| # | 经验 | 组件 | 里程碑 | 预期收益 | 成本 | 来源 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 标定每次试次要与仓库、与其他试次隔离，验收脚本与参考解对被测模型不可达；事后检查事件流里有没有越出 `ws/` 的读取 | 标定与评测 | 现在（运行器已有，M1.7） | 基线可信；后续 harness 改动的增量才有意义 | 小：扫描一次已有事件流，或改运行目录 | §2.1 第 11、14、17 篇 |
| 2 | 系统提示词节与每步注入的改动要跑按模型的评测，并做逐行或逐节消融；只针对 GLM 的改动只对 GLM 生效（G3 之后 guard 声明会进入所有路由的系统提示词，DeepSeek 也受影响） | 方言、guard 声明、主 Agent 身份、汇报细度、标定 | M3（身份节）、M4、split 第 7 步 | 捕捉几个百分点量级的回退（Anthropic 一句字数限制掉了约 3%） | 一套完整基线约 142 积分 | §2.1 第 16 篇 |
| 3 | 行是可禁用的插件行，正好做组件消融：关掉一行跑一遍标定，判断哪些行对 GLM-5.3 与 Flash 仍在承重 | 标定、全部行 | M7 标定集扩充 | 区分有用的 harness 与负担；模型升级时有依据删减 | 积分乘以行数 | §2.1 第 5、6 篇 |
| 4 | 标定集分能力集与回归集；现有两题已饱和，转为回归；新题取自真实失败；同时报 pass@1 与 pass^3 | 标定 | M3（访谈题）、M7 | 能看出 harness 改动的真实增量与稳定性 | 出题与跑题的积分 | §2.1 第 11 篇 |
| 5 | 结果文件记下环境配置（权限模式、步数与时间上限、桌面运行时版本、是否高峰），基础设施错误单独计，不算模型失败 | 标定 | M7 | 区分环境噪声与模型差异（`spawn EPERM` 一类） | 小 | §2.1 第 12 篇 |
| 6 | 检查器当轮回传只给几行：计数、前几条带文件与行号的发现，全文写日志文件，错误行可 grep | guard、检查器 | M4（§7.5「每次改完文件由 harness 跑检查并当轮回传」） | 少占上下文，避免 context rot | 设计时定格式 | §2.1 第 13、2 篇 |
| 7 | 把纠偏文案当工具来评测：在标定里放会触发门禁的题，量「拦截后下一步走对的比例」（§6.3 已列为度量），按结果改文案 | guard | M4 | 门禁真能教会模型；文案按 GLM 的实际反应调 | 出题 | §2.1 第 2 篇 |
| 8 | 用带标注的调用语料量 guard 的精确率与召回率，尤其是 G3 新覆盖的非 GLM 路由 | guard | M4、split 第 7 步之后 | 量化 G3 的误伤，替代缺失的影子期数据 | 建语料 | §2.2 第 4 篇 |
| 9 | 凭证不放在 agent 够得到的地方；在那之前，至少把对凭证文件的读取记成影子 | guard、通道 | M4；`DESIGN.md` §4.1 规划的钥匙串迁移 | 发现注入或越权读取凭证的路径（用户桌面版是 `danger-full-access`） | 一条影子规则 | §2.1 第 6、17 篇；§2.2 第 11 篇 |
| 10 | 主 Agent 的身份文本写明委派的要素（目标、输出格式、可用工具与来源、边界）与按复杂度派几个子 agent 的规则 | 派发、主 Agent 身份 | M3（身份节）、M7 | 少出现重复劳动与含糊子任务 | 提示词长度（上限 9000 字符） | §2.1 第 4 篇 |
| 11 | 交回的大产出（报告、补丁）写成文件，交回结构里只放摘要、证据与路径 | 派发、交回结构 | M7 | 主 Agent 上下文小，避免传话失真 | 小 | §2.1 第 4 篇；§2.2 第 11 篇 |
| 12 | 并行的写任务，写入范围必须两两不相交（或各用独立工作树），由 harness 在派发时检查，不只交给 LLM 判断 | 派发、guard | M7（§3.5 现写「由 LLM 判断」） | 防止互相覆盖与「抢地盘」 | 派发时一次集合比较 | §2.1 第 7、13 篇 |
| 13 | 实现类任务的审查默认用另一档模型；审查者的提示词调成挑剔，并用人的历史拍板校准 | 审查 | M7（§3.4 现写「可行时」） | 同模型同上下文的错误高度相关，换档降低共错；减少「发现了又放行」 | 审查的 token | §2.1 第 5、7 篇 |
| 14 | 派发之前先由审查方确认验收条件可检查（相当于冲刺合同） | 设计循环、派发 | M3（五栏门禁）、M7（简报门禁） | 减少因验收含糊造成的返工 | 多一次只读审查 | §2.1 第 5 篇 |
| 15 | goal 的目标文本带上验收条件与非目标，不只是标题；目标轮提示词固定、只含目标原文（§2.1），完成条件只能从这里进 | 驱动循环 | M7 | 每一拍都看得到「怎样算做成」 | 无 | §2.2 第 5 篇 |
| 16 | 人的纠正除了变成规则（§8.5），还要变成一条回归检查或标定题；周报按行为模式聚合违规与影子记录，而不是逐条列 | 记忆与学习、晨报 | M5、M7 | 规则有测试保护，不会悄悄失效；人看到的是模式 | 每条规则一份检查 | §2.2 第 2、7 篇 |
| 17 | 记忆只放可复用的经验与偏好；项目事实的唯一出处是图与文档，记忆里只留指向它们的引用 | 记忆 | M5 | 符合单一事实源（`CHARTER.md` §10.1） | 改记忆的类型与写入判据 | §2.2 第 3 篇 |
| 18 | 压缩之后的重锚要有评测：强制压缩后，主 Agent 是否仍知道焦点、阶段与已拍板的决定 | 压缩、投影 | M7 | 验证 §2.5 的重锚真起作用 | 一道探针或标定题 | §2.1 第 3 篇；§2.2 第 3 篇 |
| 19 | 每步注入的 notice 不要求模型汇报或先报计划 | 方言注入、编排注入 | M3（阶段提醒） | 避免模型提前停下 | 审一遍文案 | §2.2 第 12 篇 |

## 5. 结论 B：与已有定案冲突的地方（问题 3）

每条只列双方论据，不裁决。

### C1 每张卡都带推荐，且推荐放第一

- 定案：`ORCHESTRATION.md` §4.2 规则「每个问题带两到四个选项和一个推荐」；§5 卡面字段「推荐与理由」；§2.6 待决节点 `recommend` 必填；M3 设计 §3.1.3 第 5 条推荐项放第一并加 `(Recommended)`；目标见 `CHARTER.md` §4「没有项目管理经验的人也能坐上项目经理的位置」。
- 文章：Anthropic 2026-10-27 的随机对照实验，跟随率 86%，人很少意识到；建议为每个选项都做最强论证，或先问人自己的看法（§2.1 第 18 篇）。
- 本项目一方：用户是一个人，注意力是最贵的资源（§2.9.1）；只有五类事问人，问到的都是要人拍板的；带推荐能把一句话需求快速展开；人确有三次不选推荐（`question-14`、`question-17`、`question-8`），说明他在看；文章自己也说逐项论证会让人应接不暇。
- 文章一方：本图 89% 的跟随率与实验数字接近（§3.1）；推荐几乎都在 A 位，位置本身就是一种倾向；第 1 类（目标、验收、非目标）与第 5 类（以后改起来很贵的方向性岔路）恰好是「两个都说得通、取决于人的价值」的判断，跟随的代价最大；本项目又以「人在图上编程」为第一理念（`CHARTER.md` §2），如果拍板实际由 agent 的倾向决定，这条理念会被架空。

### C2 不设积分与轮次预算

- 定案：§4.3「不设积分与轮次预算〔定案〕：预算会导致赶工或半途停下」；§11.4「不设预算约束，花费只披露」；goal 的轮次上限当汇报事件（§2.1）。
- 文章：OpenAI 给每次运行设预算，请求前预留、不够就停（§2.2 第 9 篇）；Codex Goals 可因预算停下（第 5 篇）；Anthropic 多 agent 系统约 15 倍 token，提示词里写明按复杂度分配的投入（§2.1 第 4 篇）。
- 本项目一方：预算让模型赶工或半途停下；用户只一人、按套餐积分计，花费在晨报里披露即可；已有轮次上限作为汇报事件。
- 文章一方：M7 后台并行派发后，单个任务失控的花费在晨报出来之前就已发生；「预算」可以只作汇报阈值而不作硬停（与轮次上限同样处理）。

### C3 G3：编排层对所有模型直接拦截，没有影子期

- 定案：`question-14` 选 G3（agent 推荐 G2）；split 设计 §4.2；`question-25` 两条设计规则直接拦截。
- 与之相对的条款：`CHARTER.md` §6「新门禁先以影子模式运行」；`ORCHESTRATION.md` §6.2「先只作用于 GLM 会话，误伤清零后再考虑放开」（被 G3 改写）；§6.5。
- 文章：护栏用标注集量精确率与召回率后再依赖（§2.2 第 4 篇）；Anthropic 的提示词改动要按模型评测（§2.1 第 16 篇），G3 让 guard 声明进入所有路由的系统提示词。
- 本项目一方（人的决定）：编排层是一个整体开关，开就全生效、不开就全不生效，概念最简（`CHARTER.md` §7.1 条款 1）；限制 agent 能做什么本身就是 Anthropic 推荐的做法（§2.1 第 17 篇）；用户随时可以关掉整个编排层包。
- 文章一方：file-tools-only 的探测是按 GLM 与 ZCode 的习惯调的，在 DeepSeek 的原生工具面上误伤率未知（split 设计 §4.2 G3 一行自己写明）；没有影子期就没有误伤数据，误伤只能事后从违规流水里发现。

### C4 编排层工具大量常驻

- 定案：§8.3「记忆工具常驻，不进延迟目录」；图工具常驻（`DESIGN.md` §5.7）；split 设计 §2.6 `ORCHESTRATION_RESIDENT_TOOLS`（16 个，M3 后 18 个）。
- 文章：常驻三到五个最常用的、其余延迟（§2.1 第 9 篇）；工具少而精、能合并就合并（第 2、3 篇）。
- 本项目一方：图工具每一拍都用，延迟要多一次检索；`CHARTER.md` §6「工具与记忆放在模型手边」；记忆召回失败的原因之一正是记忆工具被收进延迟目录（§8.1）；ZCode 自己常驻 14 个。
- 文章一方：Anthropic 的建议针对 Claude，GLM 没测过，但工具多、名字相近时选错工具与填错参数是最常见的失败；13 个 `graph_*` 是否可以合并成更少的高层工具，本项目没有数据。

### C5 记忆存项目事实

- 定案：§8.2「事实：14 天半衰期」；`DESIGN.md` §2.4 项目事实放工作区 `.llm/`。
- 文章：记忆只存可复用的流程经验与偏好，具体事实放在人审过的产物里（§2.2 第 3 篇）。
- 本项目一方：§8.4 已写「git 管是什么，记忆管为什么与偏好」，方向相同；有些事实（例「coding-plan/start-plan 的签名规则不同」）作为召回线索有用；`glm:memory` 节的写入习惯来自 ZCode，改语义可能离开训练分布（`DESIGN.md` §5.3 第 ⑧ 项）。
- 文章一方：事实同时存在记忆、图与文档里，违反单一事实源（`CHARTER.md` §10.1）；记忆里的事实会过期而图上的会被更新。

### C6 同一会话里压缩续跑，不做上下文重置

- 定案：驱动循环在主 Agent 的同一个会话里推进，执行模型不沿用 Ralph（§2.1，`d-driver`）；压缩镜像 ZCode（`DESIGN.md` §5.6）。
- 文章：Anthropic 的长程 harness 每个会话从干净上下文开始、靠进度文件交接（§2.1 第 8 篇）；Sonnet 4.5 需要上下文重置、Opus 4.5 不需要（第 5、6 篇）。
- 本项目一方：状态全在图里，重置与否都不丢东西；同一会话能并行派发、能发异步卡后转做别的，`tool-ralph` 做不到（§2.1）；压缩后有投影重锚。
- 文章一方：GLM 有没有「接近上下文上限就提前收尾」的倾向没有测过；这是一个未经验证的假设，需要在标定的长程题里测。

### C7 主 Agent 只编排

- 定案：§3.1 主 Agent 不写代码〔定案〕；`d-dispatch`；`question-19` 按会话 `/wish` 开启。
- 文章：先用单 agent，复杂度证明有需要再上多 agent（§2.1 第 1 篇，§2.2 第 1 篇）；编码任务可并行部分少，LLM 还不擅长实时协调与委派（§2.1 第 4 篇）；agent 当同伴协作时表现差（第 7 篇）。
- 本项目一方：用户判断后续模型具备编排能力〔定案〕；风险已登记（`risk-orch-distribution`）并单独度量简报完整率、返工率与主 Agent 上下文占用；主 Agent 模式由人按会话开启，不开就是普通单 agent。
- 文章一方：这是一个由 harness 编码的「模型做不到什么」的假设（§2.1 第 5 篇），要在标定里与单 agent 对照，否则无法判断它是否承重。

## 6. 结论 C：Kiro 工作流观察对照（问题 4）

| # | 观察 | 采纳或避免 | 本项目对应 | 里程碑 | 防的失败 |
| --- | --- | --- | --- | --- | --- |
| K1 | 创建者设计步骤，人先批准计划再运行 | 采纳「先批准再执行」；避免把计划放在图外的单独文件里 | 设计循环的放行（`design_review` 五键卡，M3 设计 §3.4）；计划外变更走决策卡（§2.7） | M3、M7 | 计划漂移；图与计划两份状态 |
| K2 | 审查循环以机器可读的门文件（`verdict` 为 `APPROVED`）停，有轮次上限，用完暂停交人；作者与审查者分会话；审查者读记录的证据而不重跑 | 采纳：审查结论用交回结构（`outputSchema`）返回，记成任务节点上的证据；作者与审查者分上下文（§3.4 已定）。改造：轮次上限按本项目口径作为汇报事件而非预算（同 goal 的 `round-limit`）。避免：审查者只信作者记录的证据。证据要由 harness 产生（运行器记退出码、会话日志里的 `tool_result`），汇合门禁核对提交号存在、命令真的跑过（§2.9 现在只认格式） | §3.4、§4.7、§2.9 | M7 | 假绿：证据格式正确、内容不实 |
| K3 | 步骤以警告暂停、收到回答后续跑；本项目据此约定了共享桌面版的租约（DESKTOP-SLOT REQUEST / go） | 采纳同步卡的暂停与续跑（`decision_card`，M3 设计 §3.5）。避免只靠约定的租约：独占资源要么消除共享（独立 profile 的验证实例，`risk-shared-desktop` 的缓解项），要么把租约记在图上并由 guard 在执行边界检查 | `risk-shared-desktop`；§5 同步卡 | M7（并发）、M4（guard） | 两个 worker 同时重启桌面版；打断人正在用的会话 |
| K4 | 运行状态存在工具自己的文件里：一次崩溃把状态文件清零、无法恢复；属于已消失会话的运行，新会话接不过来；而仓库的项目图（临时文件加改名）保住了真实进度 | 采纳：编排状态（派发记录、简报修订号、审查结论与轮数、租约）只放在图上或能从 DSH 会话日志推出（Managed Agents 的做法，§2.1 第 6 篇）。避免：内存里的 `childId` 映射（§3.2 已指出）；运行绑定到创建它的会话（DSH `schedule` 就有这个限制，§11.4，运维会话要按此设计） | §2.1、§2.11、§3.2、§11.4 | M7 | 崩溃丢进度；孤儿运行 |
| K5 | 人拍板之前写的 worker 简报没有更新，worker 实现了被取代的规则，两轮审查都放过 | 采纳：简报在派发时由 harness 从图生成，记下任务节点、祖先链与来源决策的修订号；审查与汇合门禁比对当前的图，任一节点被改、被取代或再拍时拒绝并要求重新简报；审查依据是当前的验收条件与决策，不是简报 | §3.3 简报门禁；§2.10「按现在的验收条件重做」只看验收条件 | M7 | 旧简报实现被取代的规则并通过审查 |
| K6 | 设计评审循环每轮都找到新的边界情况（17、7、1、1），没有收敛信号 | 采纳 OpenAI 修复循环的停止条件（§2.2 第 6 篇）加 `CHARTER.md` §7.4：每条发现挂一条验收条件或宪章条款并标「必须改/小瑕疵」，逐轮计数；必须改为 0 即通过；必须改的数量一轮不降就停下交人；验收之外的新边界情况记成提议节点，不挡本轮 | `CHARTER.md` §7.4；M3 设计循环 | M3、M7；也适用于当前在 Kiro 里跑的开发流程 | 无尽打磨；评审范围悄悄扩大 |
| K7 | 会话事件上的钩子提醒编排者把进度记到图上 | 采纳 harness 侧的有条件提醒：只在状态变了而图没变时提醒（例：本回合有提交但节点没有证据；§2.4「进行中节点连续若干轮没有相关变更，发提醒」）。避免每轮无条件提醒：既占上下文，又会与具体任务的约束冲突（本次运行即一例，§3.9）；只读任务（写入范围为空的审查、文档调研）应当不收到写图提醒 | §2.4、§2.5 | M4、M7 | 提醒噪声；提醒与任务约束冲突 |

## 7. 候选改动（问题 5，按价值排序）

每条写成可以直接提到图上的待决或提议。决策分级按 `norm-decision-tiers` 的五类。

### 1. 标定运行防泄漏（提议，挂 `m7` 或标定相关节点；agent 可定 A、B，C 属第 2 类）

背景：§3.2。2026-10-28 的基线可能被污染，后续一切 harness 增量都以它为准。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 扫描已有与以后每次运行的事件流，工具调用参数里出现 `ws/` 以外的读路径（验收脚本、相邻运行目录）就判该次运行无效；先回查 2026-10-28 基线 | 不改运行行为，马上知道基线是否可信；只能事后发现，不能阻止 |
| B | 标定覆盖层（与 `scripts/calibrate/limits.mjs` 同层、不属于 bundle）加一条读圈禁，读 `ws/` 以外的文件即拒 | 运行中就阻止；多一条只在标定时生效的规则，模型在标定与日常环境里看到的规矩不完全一样 |
| C | 运行目录移到系统临时目录，结果摘要拷回 `.llm/calibration-runs/` | 物理隔离最彻底；写仓库以外的目录，属第 2 类，要人批 |

推荐 A：零行为改动，先回答基线是否可信；查到泄漏再上 B。

### 2. 简报带修订号，来源决策变了就失效（M7 设计待决，挂 `m7`；agent 定）

背景：Kiro 观察 5；§3.6。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 简报在派发时由 harness 生成，记下任务节点、祖先链与来源决策的修订号；审查与汇合门禁比对当前的图，任一变化（含被取代、再拍）即拒绝并要求重新简报 | 杜绝旧简报；修订号变化包括无关的标题改动，会有少量误拒，可以只比对验收条件、非目标与决策结果来收窄 |
| B | 不设门禁，审查者的提示词要求先读当前的图再审 | 实现简单；仍依赖 LLM 自觉，与「门禁只认证据」（`CHARTER.md` §6）不符 |
| C | 维持现状（从节点预填，不记修订） | 观察 5 会在 M7 重演 |

推荐 A：机制与图引擎的 `stale_revision` 同一思路，正路是「重新简报」，在当下最省力。

### 3. 审查循环的收敛规则（规范提议，挂 `orch`；新规范经人批准）

背景：Kiro 观察 6；§2.2 第 6 篇；`CHARTER.md` §7.4。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 每条发现挂一条验收条件或宪章条款并标「必须改/小瑕疵」，逐轮计数写进审查结论；必须改为 0 即通过；必须改的数量一轮不降就停下发卡给人；验收之外的新边界情况记成提议节点，不挡本轮 | 循环有确定的终点；审查者要多写一段归属；验收条件写得差时，「挂不上条款」的真问题会被降级，需要人在卡上看到被降级的条目 |
| B | 只设轮次上限（例 3 轮），到限交人 | 简单；不区分收敛中与发散中的循环，第 4 轮才收敛的会被打断 |
| C | 维持现状 | 继续出现 17、7、1、1 这样的循环 |

推荐 A：它把 §7.4 已有的分类变成可计数的门；同样可以先用在当前 Kiro 里的开发流程上。

### 4. 卡片的推荐与跟随（待决，挂 `m3`；人定，涉及人怎样拍板）

背景：C1；§3.1。M3 正在做 `design_review` 与 `decision_card`，现在改成本最低。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 维持现状，只在晨报加一项度量「跟随推荐率」与「推荐位置分布」 | 不改交互；只能看到数字，不能区分推荐得对与跟随 |
| B | 每个选项都写一句最强的支持理由（与后果并列）；推荐不再固定放第一；加 A 的度量 | 人每张卡多读两三句；位置偏向消失；访谈的 `ask_user_question` 约定（推荐放第一加 `(Recommended)`）要改，客户端仍能按 `(Recommended)` 标出推荐 |
| C | 第 1 类与第 5 类的卡先问人自己的倾向，再显示推荐；加 A 的度量 | 最能保住人的判断；每张这类卡多一个来回，访谈变长 |

推荐 B：成本低，保留「带推荐」对非项目经理用户的帮助，同时去掉位置偏向、让另一个选项也有人替它说话；如果度量显示第 1、5 类卡跟随率仍很高，再考虑 C。

### 5. G3 的误伤度量（提议，挂 `m4`；A、B agent 定，C 要人）

背景：C3；split 设计 §4.2。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 建一份标注语料：从非 GLM 会话（DeepSeek）与 GLM 会话的真实工具调用里抽样，标「该拦/不该拦」，L2 测试报每条规则在每类路由上的精确率与召回率；晨报按路由列拦截数 | 不推翻人的决定，又补上缺失的影子期数据；要抽样与标注 |
| B | 只看违规流水，人发现误伤再改 | 无额外工作；误伤只能靠人碰到 |
| C | 重新讨论 G3，改回影子先行 | 推翻人刚定的事，要人重新拍板 |

推荐 A。

### 6. 凭证读取的影子规则（规范提议，挂 `m4`；新规范经人批准）

背景：§4 第 9 条；`DESIGN.md` §4.1（密钥可由环境推导，迁到钥匙串属规划）。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | guard 加一条影子规则：读 `$DSH_HOME/glm-hourness/` 下凭证文件的文件工具调用与 shell 命令记影子，晨报单列 | 看得见注入或越权读取；不拦，零误伤 |
| B | 直接拦截 | 立即阻断；违反「新门禁先影子」，且本包自己的行读凭证不经工具调用，不受影响，但用户让 agent 排查登录问题时会被拦 |
| C | 不做，等凭证迁到系统钥匙串 | 无工作量；迁移之前风险一直在 |

推荐 A。

### 7. 提示词与注入改动的评测门槛（待决，挂 `m7` 或 `orch`；人定，第 3 类花积分）

背景：§4 第 2、3 条；§3.3 基线约 142 积分。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 每次改系统提示词节或每步注入的 notice，都跑一遍完整标定（两档 GLM） | 回退当次就能发现；每次约 142 积分，改动频繁时花费大 |
| B | 攒到批次点（与 `norm-verify-tiers` 的 L4 批次同步）跑一次；新加的提示词节另做一次消融（关掉该行对比）；G3 合入时加跑一组非 GLM 路由 | 花费可控；回退要到批次点才发现 |
| C | 不设门槛 | 无花费；重演 Anthropic 那类「每项单测都过、整体变笨」 |

推荐 B：与现有的验证分级一致，又覆盖了 M3 身份节与 G3 两个即将到来的提示词改动。

### 8. 标定集的结构（提议，挂 `m7`；agent 定结构，跑题的积分随第 7 条）

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 现有两题转为回归集；新增能力集，题目取自真实失败（引号里的箭头被误拦、相对路径被拒、`spawn EPERM`、旧简报实现被取代规则、M3 的访谈题）；同时报 pass@1 与 pass^3；结果记环境配置，基础设施错误单列 | 能看到增量与稳定性；出题要时间，能力题起步通过率低是预期 |
| B | 只加题，不分集 | 简单；饱和的题与新题混在一起，平均分看不出变化 |
| C | 维持两题 | 标定对 harness 改动没有区分度（§10.5.2 已写明） |

推荐 A。

### 9. 共享桌面版的独占（待决，挂 `risk-shared-desktop`；C 属第 2 类，要人）

背景：Kiro 观察 3。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 桌面版作为环境分支的工具节点，租约以批注记持有者与到期时间；guard 在无租约时拒绝重启桌面版一类的命令 | 在仓库内就能做；判断「哪些命令会重启桌面版」是启发式，拦不全 |
| B | 沿用约定（DESKTOP-SLOT 请求、同步卡） | 无工作量；靠 worker 自觉 |
| C | 另开一个用独立 profile 的桌面实例专供 L4 验证（风险节点里已列为待查的缓解项） | 从根上消除共享（`CHARTER.md` §7.1 条款 4）；要建新的用户 profile，属第 2 类；要先查一个桌面版能否并行跑两个实例 |

推荐 C：先查可行性；不可行再退到 A。

### 10. 记忆的范围（待决，挂 `m5`；人定，改 §8.2 的设计）

背景：C5。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 记忆只存「为什么」、偏好与流程经验；项目事实只写进图或 `docs/FACTS.md` | 单一事实源最干净；`glm:memory` 节的写入纪律要随之改，可能偏离 ZCode 的记忆习惯 |
| B | 维持两类 | 无改动；事实在记忆、图、文档里重复 |
| C | 事实类保留，但每条必须带指向事实源的引用（节点 id 或文档节号），召回时一并给出 | 保留召回线索，事实以出处为准；写入时多一个字段 |

推荐 C：兼顾召回与单一事实源，对 ZCode 的记忆写入习惯改动最小。

## 8. 交接给编排者

- 本次没有写图，没有提交，按简报只读；上面的钩子冲突见 §3.9。
- 建议在节点 `reading-digest` 上批注：这次读到 Anthropic 2026-10-27、OpenAI 2026-10-23；摘要在本文件；§7 的哪些已提成待决或提议。
- §7 第 1 条（基线是否被污染）的结论会影响 `ORCHESTRATION.md` §10.5.2 的可信度，建议最先处理。
- 下次运行的读法：两个索引页都要浏览器渲染；Anthropic 文章地址用 `/research/<slug>`；OpenAI 指南页直接抓取返回 403，要用浏览器。

## 来源清单

Anthropic：
- https://www.anthropic.com/engineering
- https://www.anthropic.com/research
- https://www.anthropic.com/research/building-effective-agents
- https://www.anthropic.com/research/writing-tools-for-agents
- https://www.anthropic.com/research/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/research/multi-agent-research-system
- https://www.anthropic.com/research/harness-design-long-running-apps
- https://www.anthropic.com/research/managed-agents
- https://www.anthropic.com/research/multiagent-systems
- https://www.anthropic.com/research/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/research/advanced-tool-use
- https://www.anthropic.com/research/code-execution-with-mcp
- https://www.anthropic.com/research/demystifying-evals-for-ai-agents
- https://www.anthropic.com/research/infrastructure-noise
- https://www.anthropic.com/research/building-c-compiler
- https://www.anthropic.com/research/eval-awareness-browsecomp
- https://www.anthropic.com/research/claude-code-auto-mode
- https://www.anthropic.com/research/april-23-postmortem
- https://www.anthropic.com/research/how-we-contain-claude
- https://www.anthropic.com/research/agents-judgment-calls

OpenAI：
- https://developers.openai.com/cookbook/topic/agents
- https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop
- https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction
- https://developers.openai.com/cookbook/examples/partners/agentic_governance_guide/agentic_governance_cookbook/
- https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex
- https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex
- https://developers.openai.com/cookbook/examples/partners/macro_evals_for_agentic_systems/macro_evals_for_agentic_systems
- https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex
- https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api
- https://developers.openai.com/cookbook/examples/agent_optimization/optimizing_agents_for_cost_and_quality
- https://developers.openai.com/cookbook/examples/agents_sdk/sandboxed-code-migration/sandboxed_code_migration_agent
- https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization
- https://developers.openai.com/cookbook/examples/agents_api/sandboxes/databricks/readme
