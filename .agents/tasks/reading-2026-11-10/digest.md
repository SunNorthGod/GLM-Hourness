# 阅读摘要 2026-11-10：DeepSeek super-agent 文章线、Anthropic 的记忆组件与源码控制改造、OpenAI cookbook 增量，对照本项目

版本：1（2026-11-10）。图节点 `reading-digest` 的第二次运行，起点由上一份摘要（`.agents/tasks/reading-2026-10-29/digest.md`）§1 定义：Anthropic Engineering 与 Research（Agents 话题）2026-10-28 及以后发表的文章、OpenAI agents 专题 2026-10-24 及以后的条目。
性质：只读调查。本分支除本文件外没有改动任何已跟踪文件、`docs/graph/`、`~/.dsh` 与代码。
引用规则：文章内容除标明的英文短引语（每处不超过 30 个连续词）外都是转述，标「转述」。每条结论后附原文链接；读不到的页面如实列出，不补写内容。
对照的本项目材料：`docs/CHARTER.md` v0.9（2026-11-05）、`docs/ORCHESTRATION.md`（main `8dd308ae` 的 §2.4、§2.6、§4.7、§6、§8、§10.6、§17、§18）、`docs/DESIGN.md` §5.2a、`docs/HANDOFF.md` 0.8（其 §10 记到 2026-11-09 批次合入与 L4）。源码未逐行读，代码级说法以 ORCHESTRATION.md 各节的实现记录为准。

## 0. 摘要

1. DeepSeek Harness 团队 2026 年 11 月初发布了「Exploring Super-agent Design: Towards a More Autonomous Agent System」，并开源官方原型 `deepseek-ai/dsh-superagent-prototype`〔文章正文在 X 上，本次没读到；仓库 README 与 `docs/000-philosophy.md`、`docs/007-architecture.md` 实读〕。它就是一个装在 DSH 上的编排 bundle：router 只说话不干活、worker 干活、SQLite 引擎独写全部领域状态、面板只留等人拍板的东西。上一期摘要的冲突 C7（主 Agent 只编排）从「用户对模型的判断」升级为宿主厂自己公开的设计立场；本次逐条对照见 §2.1 与 §5。
2. 上一期摘要 §7 的 10 条候选改动，已落地 7 条（§3.1 逐条核对）：推荐放最后（`d-recommend-last` + 表格卡，决策正文引用了同一篇 86% 研究与本图 89%/34 的统计）、审查收敛规则（`review.ts` 的 `converge`，挡路 0 过、不收敛或轮次用尽或人给过一轮停下）、简报带修订号（pins + 页脚图修订号）、标定运行目录搬系统临时目录、桌面验证改用隔离实例、第三次返工问人（`d-habits-into-framework`）、提示词消融真的做了（六臂 × 两档 × 三题，有效 176 次，`DESIGN.md` §5.2a）。仍开着的：G3 误伤标注语料、提示词改动的评测门槛、凭证读取影子规则。
3. Anthropic 2026-11-06「The components of agent memory」：最好用的 agent 记忆是「会话内抓要点 + 空闲时离线整固（dreaming）」的分工；告诉模型记忆是干什么的，比规定它怎么记更好——文中一条「只记失败」的规定动作指令实测让两档模型变差。对我们 M5 的直接含义：`transcript` 行已把整份会话日志落盘到 `.llm/transcripts/`，抓取的一半齐了，离线整固这一半还没有（§4 第 1 条、§6 候选 1）。
4. Anthropic 2026-10-13「Redesigning source control at Anthropic」（上一期 §1 点名的可补项）：agent 规模下合并队列与全局仓库锁不成立，他们改靠合入后自动测试。我们 M7 的串行门禁与 ff-only 在单人单库的规模是对的，但这条边界值得写进冲突记录（§5 C3）。
5. OpenAI cookbook agents 专题在窗口期内只有一条新内容：Decisions API 客服路由（2026-10-29 添加，11-02 从已发布目录撤下，仓库里仍可读）。registry 其余变化只是作者署名从个人换成 openai。站点对 WebFetch 与代理 curl 都 403，结论来自 GitHub 镜像的提交扫描与 `registry.yaml` 前后 diff（实读）。

## 1. 覆盖范围与下次起点

- Anthropic：Engineering 索引与 Research 索引都扫过。这次 `web_fetch` 直接拿到了索引全文（上一期的记录是「页面要浏览器渲染、只拿到标题」，这次没有发生，下次可先试 WebFetch）。窗口期（2026-10-28 及以后）内 Agents 话题只有一篇：「The components of agent memory」（11-06）。Research 索引同期其余条目（teaching-ai-to-build-scientific-models 11-06、how-researchers-use-claude 11-05、provable-inference 11-02 等）不带 Agents 话题，未读。另按上一期 §1 的可补清单读了「Redesigning source control at Anthropic」（2026-10-13，页面注 10-15 更新）。
- OpenAI：cookbook agents 专题页（`developers.openai.com/cookbook/topic/agents`）WebFetch 403，本机代理 curl 也 403（7255 字节拦截页），`cookbook.openai.com/sitemap.xml` 同样 403。改用 GitHub 镜像 `openai/openai-cookbook`：扫 2026-10-24 以来的提交、diff 窗口两端的 `registry.yaml`（实读）。窗口内的新内容：examples/decisions/（10-29 加，11-02 从 registry 的已发布条目里撤下）；`articles/chatgpt-agents-sales-meeting-prep.md` 11-06 的一次更新（原文 2026-04-22 发布，只算日期边界）。11-05 的提交把五篇 agent cookbook 的作者从个人换成 openai，无内容变化。上一期 §1 可补清单里的 OpenAI 旧条目仍未读，优先级低。
- DeepSeek：官方文章「Exploring Super-agent Design: Towards a More Autonomous Agent System」的正文没读到（发布在 X，本次无法抓取）；改读官方原型仓库 `https://github.com/deepseek-ai/dsh-superagent-prototype`（README、docs/000-philosophy.md、docs/007-architecture.md，都是实读，约 21.7k star 由抓取页面显示）。第三方解读（cellcog 2026-11-01、kingy.ai 2026-11-01、mindstudio、linas substack）只登记未读。
- 下次起点：Anthropic Engineering 与 Research（Agents 话题）2026-11-07 及以后；OpenAI agents 专题 2026-11-07 及以后（继续用 GitHub 镜像扫描）；DeepSeek super-agent 线——盯原型仓库与官方文章正文（在 X 之外可读到时补读）。

## 2. 证据 A：逐篇摘要

### 2.1 DeepSeek（super-agent 文章线）

1. Exploring Super-agent Design: Towards a More Autonomous Agent System（官方文章，约 2026-11-01；正文未读，以下以官方原型仓库的文档为准）。https://github.com/deepseek-ai/dsh-superagent-prototype
   转述：多数「AI agent」仍像聊天窗口；团队提议 router-and-worker 的 super-agent：router 与人说话、自己不干活，worker 干活；事件驱动、后台执行，agent 因此常在。核心论点：agent 的瓶颈是人花掉的注意力，不是模型能力。原型仓库自述：研究原型（非正式产品），覆盖单个 GitHub 仓库，作为 bundle 装进 DeepSeek Harness（仓库里有 `cordis.patch.yml`、`locale/`、`prompts/`、`skills/`，与我们两个包同构）；监听 GitHub（可选 Feishu），受权的人开口才有工单，干完回原线程（例如一个 PR）；文章里的一部分设计是未来方向，原型没有实现；发布版与内部版本有改编差异。
   对应：与本项目的关系不是「借鉴一篇文章」，而是宿主厂自己交出了一份同构答案。`CHARTER.md` §3.2 的目标（开发体系由 harness 保证实施、减负可量化）、§2 第一理念（在图上编程）与它的「注意力经济」出发点同向；差异在结构（§5 C1 前提）。

2. 原型 README 与 docs/000-philosophy.md（实读，2026-11-10 抓取）。https://github.com/deepseek-ai/dsh-superagent-prototype 、https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/000-philosophy.md
   转述：指导句原文 "Take as little human attention as possible, and give as much value as possible"。行为规则：只在被明确要求、或成文规则允许时才行动；未经要求的工作要成文规则，且先以只记录的 dry-run 起步；只在人必须行动或能受益时说话；每个请求确认一次计划，干活期间沉默；做完、要决定、被挡住才再开口；一次只问一个具体问题，用结构化形式；按影响停下，不按力气停下——本地改动做到可审查的成果，需要设计决定的停下来问；草稿标未完成，失败报失败，上限不为了不问人而绕过。运营者义务：从窄名单加只记录的主动模式起步；吵了就收提示词或暂停，绝不靠加解释性的话去盖噪声；不量产（批量 PR、广播）；operator 替 agent 的发言把关。设计规则：概念最少（新需求变成既有概念的属性或提示词，不开新概念）；设置最少（一个值对几乎所有团队都对就不做设置，用语言描述的行为写成提示词）；面板只给「等人拍板的」占地方，健康状态不占。
   对应：`CHARTER.md` §3.2 第 5 条减负、§2.9.1 用户注意力最贵；规则板与循环板的「人看过原文同意才生效」（`d-boards-as-hooks`）与它的 dry-run + 成文规则同构；「一次只问一件」与我们 `await_human` 成批 ≤3 的差异见 §5 C4；「概念最少、设置最少」对 `CHARTER.md` §7.1 条款 1 是旁证，也对着我们正在长出来的行配置面（`slots`、`contextWindow`、`persona`、`plan`）敲了一下。

3. docs/007-architecture.md（实读）。https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/007-architecture.md
   转述：组件：Source 插件把外部事件翻译成 Trigger；Engine 是 Trigger、Thread、Decision、Ticket、Assignment 的唯一写者，SQLite 单文件，目录锁防并发进程；五条流水线（Intake、Evals、Tickets、Assignments、Replies）单向依赖；外部动作经事务内排队、提交后执行（Outbox + Effects 持久队列，指数退避重试）。评估：每 Thread 一次 Eval，候选连上下文窗口交给主会话（Trigger 原文至多 4,000 字符、至多 8 张相关工单、Thread 窗口取首 5 条加两侧各 5 条、每条约 400 字符，其余消息是 50 字符的桩、可用 `orchestrator_eval_read` 展开）；Policy 带版本号，设置变更时算出受影响的开着工单，在跑的评估按新版重启；Mandate 记录准入依据（addressed、followup、admission、bot）。执行：每工单一个会话加一个目录（`workerSessionId` 由工单 id 派生），WorkerSlots 预留容量，人的消息可超 `maxWorkers` 一格，唤醒优先于启动；提示词版本按请求绑定并落盘，worker 可查哪些修订受限；中断的 Assignment 在启动时按最老工单优先恢复。主会话有 noWait 守卫：禁 `sleep`、禁超过 30 秒的 shell 等待、禁超过 5 秒的 `job_output` 等待，因为报告自动到达。读取资源分页（默认 4,000 UTF-16 单元、20 项），执行者只见自己工单的范围。失败处理：等人的工单收住自动 Input 与 launch，直到人的消息到达；stop 经 `Store.afterCommit` 取消 worker 回合，回滚的结束不杀 worker。
   对应：每工单一会话一目录 ↔ 我们每任务一工作树（`ensureWorktree`，`.worktrees/hz-<任务>`，ORCHESTRATION.md §17.5）；提示词版本绑定 ↔ 我们的 pins 与简报修订号（§17.3、§17.4）；WorkerSlots ↔ 我们的 `slots` 加高峰 `glmWorkerCap`（§17.9、§16.1）；中断恢复 ↔ 我们的对账 `execute.reconcile`（§17.13）；策略版本重验证 ↔ 我们的缺口，见 §5 C2；noWait 守卫我们没有对应物（主 Agent 长等待目前只受 `await_human` 与 goal 停等约束）。

### 2.2 Anthropic

1. The components of agent memory（2026-11-06，Engineering，作者 Lance Martin）。https://www.anthropic.com/research/components-of-agent-memory
   转述：agent 记忆指从经验获得、跨会话保留的知识（不含权重变化、上下文内学习与压缩）。两个主张：一、最好用的记忆是分工——会话里抓有显著性的要点，空闲时用「dreaming」（对会话日志做离线反刍，类比睡眠记忆巩固）去重组、纠错、巩固；记忆本质是对未来需要的预测，显著性判断比穷举记录重要。二、告诉 Claude 记忆是干什么的，比规定它怎么用更好：一条「只记失败」的规定动作指令实测让 Opus 5 与 Opus 4.7 的表现变差。定向帮助对旧模型最有效：提示 Sonnet 4.6 先读记忆再验证猜想，分数约翻倍；Sonnet 5 十次里九次自己读记忆。dreaming 的五类用途：纠错（Pokémon 例：Claude 记错了 PokéCenter 位置，卡在 Mt. Moon 打转到不了下一城，dreaming 拿日志对证后改对）、构建新表示（wiki）：约 35 万份内部文档（约 4.2 亿 token）上，dreaming 会话从 2 加到 128，25 道题的答对率从 13% 到 48%；「搜索 + wiki」61% 对纯搜索 53%，每题约省 2 万 token；wiki 只在多文档综合题上有用（87% 对 73%），单文档够用的场景反而长过了源文件；把笔记沿记忆层级上提（注入的上下文必须小：Claude Code 只加载 MEMORY.md 的前 200 行或 25 KB 作索引）；把记忆聚焦到目标上：多 agent 共写一张合同条款大表时互相覆盖（57 条事实只活下来 41 条、72% 得分），每份合同单独一页并留逐字引用则 100%；跨会话补洞（第二轮 dreaming 修 9 个断链、补索引页）。显著性对照：一代模型写 413 个文件、225 个目录、得 1 个徽章；另一代写 9 个文件加一张全局索引、得 4 个徽章；最强的组合用一个改写得很小的记忆文件夹通了关。未解问题：何时建记忆（会话内还是离线）、怎么不花大算力保持记忆新鲜、「transcript 搜索 + 表示」是不是对的底座；作者明说没有模型能完全预测未来的轮次需要什么。
   对应：M5 的两处直接对照。一、我们的召回索引上限（§8.3：至多 200 行与 25,000 字符）与文中 Claude Code 的 MEMORY.md 索引上限（200 行 / 25 KB）数值相同——这个默认值等于拿到了发布方的背书。二、我们已经有「会话内抓取」的一半：`memory_store` 判据、经验板的失败匹配（§8.6）、`transcript` 行的整份日志落盘（HANDOFF §3 transcript 行）；没有「离线整固」的一半——学习流水线（§8.5）只由人对 agent 的纠正信号驱动，不回放 transcript。「每份合同单独一页」的教训我们靠另一条路躲开了：worker 不拿记忆工具（§8.3），写记忆与经验的只有根 agent。「只记失败」的指令风险对我们的 `glm:memory` 节与经验条目是不是也成立，没测过（§5 C1）。

2. Redesigning source control at Anthropic（2026-10-13，页面注 10-15 更新；上一期 §1 点名的可补项）。https://www.anthropic.com/research/redesigning-source-control
   转述：AI 开发的速度把为人设计的 git 工具用穿了：合并从 2026 年 5 月的每天约 2,500 涨到 9 月的 30,000 以上；main 历史近 100 GB；每天约 2,500 万次 CI 检出，按 git 原样算要走 600 PB 以上。核心认识：git 设计上是离线优先的，而他们的客户端几乎全是永远在线的 agent，离线优先的优点成了扩容的负担。五个月、七个人建了并迁完 Scion（借鉴 Piper 与 Sapino/Mononoke 的家课）：客户端永远在线、服务器承担提交/合并/blame/diff、没有完整仓库副本、服务端无锁增量提交、稀疏可选的工作副本、refs 用得极少；数据模型是「changeset 写前日志 + 内容寻址 blob 指针」，blame 与路径历史这类派生数据可自由增减。基础设施 footprint 缩到原来的 1/200（CPU/内存），检出快两个数量级，CI 白捡 25% CPU。Claude 既造成问题也造了解：一次 Claude 重写把摄取管线的内存降到 1/20、速度 4 倍，还保住了没人写下来的隐含不变量；工程师的角色移向设计取舍、审意图、对 Claude 说「不」。对 agent 规模工作流的经验：原文 "merge queues and global repo locks don't make sense"——一次测试运行期间就有数千个变更落地，他们改靠合入后与部署前自动测试，冲突让 Claude 解，比人发现得还快；并预计这种压力六到十二个月内向一般组织扩散。
   对应：我们的 M7 是反着选的——串行门禁锁（§17.6）、ff-only 快进、`trunk-advance-checked`、完成门禁（§17.12、§17.13），靠合入前检查保主干。规模差六个数量级，两个结论不矛盾；但「并行派发 × 串行门禁」的吞吐上限值得记成已知边界（§5 C3）。文中「superfan agent 盯单个组件的遥测与日志」与循环板的检查条目、`env` 行每日压制计数同形（§18、§10.6）。

### 2.3 OpenAI

1. Customer support routing with the Decisions API（cookbook 条目，2026-10-29 加入 registry，2026-11-02 撤下；仓库仍可读）。https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/decisions/README.md
   转述：Decisions API 把文本、图片或 JSON 变成应用决策（分类、路由、量规打分），这一用途比 Responses API 快约 10 倍。示例用 BANKING77 数据集的十条银行客服消息路由到四个专组，`choice` 型问题，靠每个选项的描述区分相近意图（忘记应用密码对卡片 PIN 被锁）。护栏：只有消息与问题发给模型，标签留在本地；拒绝重定向、30 秒超时、不自动重试；解析器校验答案类型、问题名、取值与置信度区间；拒答或不可用答案返回 `human_review` 加空置信度，真正派单归应用；文档建议在定复核阈值前先拿标注消息评估，并给范围外的流量加一个 `other` 选项。
   对应：与本项目直接关系弱。可取的是方法论一句：先标注再定阈值——正是上一期 §7 第 5 条（G3 误伤标注语料）的做法，这条 cookbook 等于第三次出现同一建议（前两次：Anthropic 的护栏精确率/召回率、OpenAI 治理指南）。「加一个 `other` 选项」与 guard 的「认不出的写法放行、单独计数」是同一件事的两半（ORCHESTRATION.md §10.6 的 `metrics-files-only`「认不出的写法」清单）。

2. registry 变动（实读，作为覆盖记录）：2026-11-05 提交 `86c50508` 把五篇 agent cookbook 的作者从 `alfozan` 换成 `openai`，无内容变化；2026-11-06 提交 `2d5b1a9b` 更新 `articles/chatgpt-agents-sales-meeting-prep.md`（原文 2026-04-22 发布）。都不构成新条目，列出只为说明看过。

## 3. 证据 B：本仓库里的事实与数字〔实读〕

### 3.1 上一期候选改动的落地清单

| 上一期 §7 | 现状 | 出处 |
| --- | --- | --- |
| 1 标定防泄漏（推荐先扫事件流，C 选项移运行目录） | 已按 C 落地：标定运行目录在系统临时目录，整批之后拷回；`scripts/calibrate/run-dir.mjs`、`npm run calibrate -- --collect <时间戳>`。探针运行 2026-11-06 起同样出仓库 | HANDOFF §3 design 行、§2 `.llm/` 条目 |
| 2 简报带修订号，来源决策变了就失效（K5） | 已落地：`pinsOf` 对任务、祖先链、source 指向的决策各算 12 位摘要，只含改意图的字段；简报页脚带图修订号；审批时 `staleness` 对派发批注核对，不新鲜报 `brief_stale` | ORCHESTRATION.md §17.3、§17.4、§17.10 |
| 3 审查收敛规则（K6） | 已落地：`converge(rounds, humanSeen)` 给 `pass`、`stop`（`not-converging`、`rounds-used`、`human-gave-one-round`）、`notify`；发现清单压过结论字面，没挂上标准的挡路发现降级并计数 | ORCHESTRATION.md §17.7、§17.11 |
| 4 卡片的推荐与跟随（C1，人定） | 已落地且走得更远：`d-recommend-last`（2026-10-29）把推荐项放到最后一个选项；卡面改表格卡（`d-option-card`、`d-counter-line`）；决策正文引用了上一期 §5 C1 的 86% 研究与本图 89%/34 的统计 | ORCHESTRATION.md §2.6「待决的写入规则」 |
| 5 G3 误伤度量 | 未做。`file-tools-only` 在其他路由上的误伤率仍无数据（HANDOFF §5 第 3 条原话保留） | HANDOFF §5.3 |
| 6 凭证读取的影子规则 | 未找到落地记录；相关的一步是 `transcript` 行导出时按 `secret_like` 表遮凭证（防的是另一头：凭证进日志） | HANDOFF §3 transcript 行 |
| 7 提示词与注入改动的评测门槛（人定，花积分） | 未设门槛；但消融方法已备好：§5.2a 的六臂 × 两档 × 三题、分层置换检验 10,000 次 + Fisher、Wilson 区间，有效 176 次。结论 A1 保留、A2 可缩、A3 采纳延迟、A4 保留、A5 保留，注入文字未动、等人看 | DESIGN.md §5.2a、HANDOFF §10 第 5 条 |
| 8 标定集的结构 | 部分：标定任务从 2 个加到 3 个再加访谈两题（`interview-expense-log`、`interview-expense-log-modules`，只有验收脚本核对过没真跑）；能力/回归分集与 pass@1/pass^3 双报未见 | HANDOFF §2、§3 |
| 9 共享桌面的独占 | 已按缓解项落地：2026-11-06 起的桌面 L4 都在隔离实例上跑（transcript 行、panel Q4、2026-11-09 批次 L4） | HANDOFF §3、§8、§10 |
| 10 记忆的范围（C5） | 两类维持；写入改从严：类型必标、`project`/`feedback` 要 `Why:` 与出处、查重、密钥拒收；「git 管是什么，记忆管为什么」保留（§8.4） | ORCHESTRATION.md §8.4 |

### 3.2 第三次返工问人（上一期没单列、本次对照 OpenAI 修复循环停止条件的新事实）

`CHARTER.md` §9 把人的工程习惯变成框架默认；数法统一为「节点第 n 次重开即第 n 次修复开始」。第二次重开时 `graph_status` 结果带一句 notice（只提示，不问不拦）；第三次重开时 harness 在节点下提一张提议式待决，主 Agent 放进下一批问「先停下查原因，可以吗？」；人答过之后窗口重开。循环板列出 `graph.third-rework`。实现 `src/graph/reopen.ts`（第三次 2026-11-04，第二次 2026-11-05）。这与 OpenAI 修复循环的第四个停止条件「下一个决定需要人审」和 Kiro 观察 6 的收敛诉求接上了。

### 3.3 M7 执行层的现状（上一期 §3.5「证据只认格式」的缺口已关）

E0–E9 已实现，2026-11-07 合入 main，执行行默认启用。交回语义校验收紧到 git 事实：提交号 7–40 位十六进制、`git is-ancestor` 在派发基线上、`git branch --contains` 在 `hz/<任务>` 上（§17.11）；检查记录带 SHA-256 与结果摘要，读回时核对（§17.12）；完成门禁七条，包括每个进主干的提交都在被审的那个提交里（§17.13）。审查者与 worker 的面被过滤（审查者没有 `submit_plan`，派发链没有九个图写工具，§17.9）。`ORCHESTRATION_RESIDENT_TOOLS` 并入了执行面四份工具名单（§17.8）——上一期冲突 C4（常驻工具多）所指的集合又变大了。骨架端到端真实运行：第三次把放行的 goal 推到完成，7.3 分钟、129 积分，对 worker 0 次拦截、问人 0 次（§17.14）。

### 3.4 其余对照点

- 记忆索引上限 200 行 / 25,000 字符（§8.3），截掉与查询落空各交一条只有计数的指标（`memory.index-truncated`、`memory.query-empty`），「不上向量库，先攒数据」（§8.3）。
- 经验板出厂启用（2026-11-06），第一批 21 条经验 2026-11-05 导入本项目 `.llm/lessons.jsonl`，重复导入全跳过（HANDOFF §3 lessons 行）。
- docs-at-hand（`ORCHESTRATION.md` §8.7）：组件 = 检出根以下含 `AGENTS.md` 的目录；「决策」一节只列图上的决策 id，不写结论，结论由路径提醒按 id 现查——单一事实源在组件文档上的落法。读它的路径提醒已实现（§8.6 路径提醒一条）。
- 申请通道：E5 的三件工具（`submit_plan`/`ask_main`/`answer_worker`）与 worker-scope 的申报接缝（`request_exception`、放行簿 `peekGrant`、备份后消耗）已合入（§17.9、§17.10）；m4 的 `m4-request-card` 未开工（HANDOFF §8）。HANDOFF §10 待人定一项「申请通道接面板『需要你』时三种事改四种事」。
- 指标流水（§10.6）：第 1–7 步已实现（2026-11-04），90 种事件闭表、写入器、指标行、板视图、`/hourness` 报告接线、`metrics-files-only` 规则；练习题运行器、批次 L4 与退役未做。

## 4. 结论 A：能用的经验

先列已一致、保持即可的，再列要补的。

已一致（文章为既有定案供旁证）：

- 「主 Agent 只编排」：superagent 的 router 明文不干活。上一期冲突 C7 的文章一侧现在有了宿主厂的公开实践。
- 注意力经济与减负度量：philosophy 的指导句与 `CHARTER.md` §3.2 第 5 条同源。
- 主动行为要成文规则 + dry-run 起步：规则板「看过原文同意才生效」+ 超时可追溯（`d-boards-as-hooks`、`d-timeout-measured`）。
- 每件活一个会话一个目录、提示词与依据按请求钉住：M7 的任务工作树与 pins。
- 停下看影响不看力气（要设计决定就停下来问）：三档问人与 `await_human`。
- 汇报诚实（草稿标未完成、失败报失败）：`CHARTER.md` §9「汇报说清每个结论是读过、跑过还是推断」。
- 记忆注入的索引上限 200 行 / 25 KB：与 Claude Code 相同，默认值有背书。
- 记忆按目标分页、防互相覆盖：worker 不拿记忆工具（§8.3）已经在结构上避开文中 41/57 的覆写事故。

要补的：

| # | 经验 | 组件 | 里程碑 | 预期收益 | 成本 | 来源 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 离线整固拍：拿 `.llm/transcripts/`（在期内）与 lessons/memory 流水做离线对证——纠正记错的事实（文中 Pokémon 例）、把复发模式提炼成经验候选或组件 AGENTS.md 的提议 | M5 记忆与经验、循环板 | 自举之后 | 记忆错账有人查；经验从「人纠正驱动」扩到「日志反刍驱动」 | 每拍一次的积分与算力 | §2.2 第 1 篇 |
| 2 | 记忆与经验的提示词从「规定动作」往「讲用途」挪，并把 `glm:memory` 节列进下一轮消融臂 | M5、方言 | 下一轮消融 | 排除「规定动作指令伤表现」在 GLM 上的风险 | 文案一次 + 消融一次的积分 | §2.2 第 1 篇 |
| 3 | 门禁阈值先标注后定标：G3 语料、`metrics-files-only` 的认不出写法按「`other` 选项」的思路单独计数后定期复核 | guard、指标 | M4 收尾 | 误伤有数，撤下有据 | 抽样标注 | §2.3 第 1 篇；上一期 §7 第 5 条 |
| 4 | 策略/范围变更影响在跑的活：先核实两处判据（当前图 `within` 与批准时刻并集）的先后与覆盖，再决定要不要补门 | M7 | 核实即可开工 | 在跑 worker 不会按旧范围写完 | 一次代码核实 | §2.1 第 3 篇 |
| 5 | 主会话禁长等待（noWait 一类）：主 Agent 的 `sleep`、长 shell 等待目前无门，自动推进会被一次长等待卡住一拍 | guard、执行行 | M4/M7 收尾 | 自动推进的拍子不被拖住 | 一条规则 | §2.1 第 3 篇 |
| 6 | 规模边界写进文档：并行度上去之后串行门禁是吞吐上限，冲突由谁解没有条款 | M7、DESIGN | 文档一句话 | 换规模时有记录可循 | 无 | §2.2 第 2 篇 |

## 5. 结论 B：与已有设计冲突或张力最大的地方

每条只列双方论据，不裁决。

### C1 记忆写入的「规定动作」对「讲用途不讲做法」

- 本项目一方：§8.4 的写入判据（类型、Why、出处、查重、密钥拒收）在 harness 校验层，不靠模型自觉；纪律来自实测事故（约 800 次请求只存 1 条记忆、存放错位、旧判据过严，§8.1）；`habit-ask-first` 拦绕路有真实运行依据（2026-11-04 批次模型绕过 `memory_habit`）。Anthropic 文章的「只记失败」实验是提示词层的指令，且对象是 Claude。
- 文章一方：那条指令同样简短、同样合理，实测仍让两档模型变差；「记忆是对未来需要的预测，显著性判断比穷举规则重要」直接指向判据型纪律的机会成本；本项目没有对 `glm:memory` 节与经验条目字段做过消融（§5.2a 的六臂不含记忆节）。
- 事实底座：本项目要的是跨会话共享状态的整洁，文章要的是单 agent 记忆的产出质量；两者不完全同题。

### C2 规则或范围变更时，在跑的活要不要重验证

- 本项目一方：门禁判定大多在调用边界读当前图（worker-scope 按当前图判 `within`，§17.9），规则改了下一笔就生效；计划批准时按当前图重跑 `checkPlan`（§17.10）；pins 防的是简报与图漂移。单人规模，变更频率低。
- 文章一方（superagent）：Policy 带版本号，设置变更时算出受影响的开着工单，在跑的评估按新版重启；Mandate 记录准入依据可复核。我们的 pins 明确不含 `writeScope`（§17.3「写入范围不进摘要」），而批准时记下的路径并集与 scratch-only 豁免的「计划并集或当前 writeScope」或语义（§17.9）各是一份快照——人在 worker 跑到一半时收窄范围，两条判据与当前图之间的先后关系没有专项测试钉住。
- 本仓库一方补充：范围收窄后，当前图判据会把新范围外的写入当场拦下（同一节），所以缺口比 superagent 当年要窄；缺的是一致性与测试，不是机制。

### C3 合入前串行检查对 agent 规模的「合入后测试」

- 本项目一方：单人单库，串行门禁吞吐足够；「门禁只认证据」是宪章条款（§6）；Anthropic 文章自己写明那是异常规模、短期不影响多数组织。
- 文章一方：合并队列与全局锁在 agent 规模不成立（原文引语见 §2.2 第 2 篇），靠合入后自动测试加 agent 解冲突；我们并行派发（`slots` 3、高峰上限 1）提高后，串行门禁与「冲突由谁解」都会成为问题，DESIGN/ORCHESTRATION 现在没有条款记录这条边界。

### C4 一次问一件对成批 ≤3

- 文章一方（superagent philosophy）：一次只问一个具体问题、结构化，问题不会淹没在长报告里。
- 本项目一方：`await_human` 成批（每批至多三件）、`propose_to_human` 与问话合计一条回复超三件被拒（§17.13、§8.5）；每一件都是一行一问，且有「等你回话」的面板列表集中呈现。三项上限是自定值，没有依据数据。

## 6. 候选改动（按价值排序；分级按 `norm-decision-tiers`）

### 1. 离线整固拍（提议；机制选择 agent 可定，花积分与新增板上条目要人）

背景：§4 第 1 条；`transcript` 行已把整份会话日志写进 `.llm/transcripts/`（明文副本的取舍人已知情并同意出厂启用）。

| 选项 | 说法 | 后果 |
| --- | --- | --- |
| A | 循环板脚本条目（周期，例如每周）：读在期内的 transcripts 与 lessons/memory 流水，产出「记忆与经验核对报告」写到 `.hourness/` 或提议节点，不直接改流水；落地仍走 `lessons_merge` 与主 Agent | 机制全是现成的（人看过脚本原文同意、超时实测、哈希钉住）；每次跑要积分 |
| B | 先做窄版：每拍只做「事实对证」（拿 transcript 对证记忆条目的出处，矛盾记成经验候选），不做提炼 | 积分少；收益也窄 |
| C | 不做，等自举后再说 | transcript 会过期堆积；错账继续无人查 |

推荐 A，从 B 起步试跑一次再转周期。

### 2. 记忆与经验文案的「讲用途」改写 + 列入消融臂（agent 可定文案；消融要人，花积分）

背景：§5 C1。`glm:memory` 节与 MEMORY_L3、经验工具说明里「怎么记」的句子，改写为「记忆/经验给谁用、解决什么」；§5.2a 的方法直接可复用（同款分层置换检验）。

### 3. G3 与门禁阈值的标注语料（提议；agent 可定，标定运行花积分随第 5 条）

背景：§4 第 3 条。上一期第 5 条原样重申，本次新增第三个同向来源（Decisions API 条目「先标注再定阈值」）。

### 4. 范围变更影响在跑的活的核实（agent 可定核实；若要改 pins 要人——M7 设计 0.6 已冻结）

背景：§5 C2。第一步只做核实：写一两个测试钉住「批准后收窄 writeScope」时 worker-scope、planPaths 并集、scratch-only 豁免三者的判定次序；核实后再议是否把 `writeScope` 纳入 pins 或在审批时比对当前范围。

### 5. 提示词与注入改动的评测门槛（待决；人定，第 3 类花积分）

背景：§3.1 第 7 行。上一期第 7 条仍开着；本次消融把方法与脚本都备好了（分层置换检验、Wilson 区间、六臂框架），门槛的边际成本比上一期估计的低。建议按上一期推荐的 B（批次点跑 + 新节消融）。

### 6. 凭证读取的影子规则（上期第 6 条，本次无新证据，维持原推荐 A）

背景：上一期 §7 第 6 条。`transcript` 行的凭证遮盖解决的是日志这一头；读凭证的影子规则仍开着。

## 7. 交接

- 本次为只读 + 本文件；没有写图（图节点 `reading-digest` 由编排方记录）。与上一期 §3.9 同型的钩子冲突这次没有出现：本次简报与只读一致。
- 上一期可补清单余项（Designing AI-resistant technical evaluations、Agent Skills、Beyond permission prompts 等 OpenAI/Anthropic 旧文）仍未读；优先级维持低。
- 方法注记：Anthropic 索引这次 WebFetch 直出，下次先试 WebFetch 再动用浏览器；developers.openai.com 与 cookbook.openai.com 对 WebFetch、代理 curl 全部 403，GitHub 镜像（提交扫描 + `registry.yaml` diff + raw 文件）可用且足够；X 无法抓取，DeepSeek 文章正文等可读来源再补。
- 数字复核说明：Anthropic 记忆一文的模型名（Sonnet/Opus 各代）与「Fable 5」一处未逐一复核，本文件只引数字与结论，不引模型代次对比的细节；superagent 的 star 数与文章日期为抓取页面与搜索结果所示，未从第二来源复核。

## 来源清单

Anthropic：
- https://www.anthropic.com/engineering
- https://www.anthropic.com/research
- https://www.anthropic.com/research/components-of-agent-memory
- https://www.anthropic.com/research/redesigning-source-control

OpenAI：
- https://developers.openai.com/cookbook/topic/agents（403，经 GitHub 镜像覆盖）
- https://github.com/openai/openai-cookbook（提交扫描 2026-10-24 起；registry.yaml 前后 diff）
- https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/decisions/README.md
- https://raw.githubusercontent.com/openai/openai-cookbook/main/articles/chatgpt-agents-sales-meeting-prep.md（未读正文，只记日期边界）

DeepSeek：
- https://github.com/deepseek-ai/dsh-superagent-prototype
- https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/000-philosophy.md
- https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/007-architecture.md
- 官方文章正文（X）未读；第三方解读未读：https://cellcog.ai/blog/deepseek-super-agent 、https://kingy.ai/blog/deepseek-super-agent-design-explained 、https://www.mindstudio.ai/blog/deepseek-super-agent-harness-design 、https://linas.substack.com/p/deepseek-super-agent-blueprint
