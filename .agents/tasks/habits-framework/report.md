# 人的工程习惯融进 Hourness 框架：调查报告

只读调查，2026-11-05。仓库以 origin/main 为准（开始时 5fa6d10，结束时 8560d80，中间只有图的提交，不影响本文引的代码）；M7 读 `.worktrees/m3` 的 m7 分支（3180672），接管读 `.worktrees/bootstrap` 的 bootstrap 分支（2d2fbc9），都只读。

## 摘要

- 习惯全文在 `C:\Users\29596\.zcode\AGENTS.md` 的第四节「仓库卫生」与第五节「代码卫生」，第一、二节里还有几条工作规矩（如实汇报、汇报粒度、干净区），第三节有一条写规则的办法。共录 9 条（H1–H9，「修根因」拆成第三次停下 H4a 与查根因 H4b 两半，对照 10 行）。
- 同一份文字另有一份 `C:\Users\29596\.dsh\AGENTS.md`，DSH 宿主的 `dsh-agent-instructions` 把它放进这台机器上每个 DSH 会话的第一次请求。所以在你自己的机器上模型已经看得到这些习惯，靠的是你的用户级配置，不是框架；别人装上插件拿不到。
- 归类：
  - (a) 已融进框架、各项目生效：H2 规则重读（每步投影压缩后重锚，任务书派发时现生成；缺「规范摘要」）、H4a 第三次修交人（`src/graph/reopen.ts`）、H6 汇报粒度的一部分、H7 如实汇报的门禁一半（harness 自己跑检查）、H8 干净区。共 5 条，其中 3 条只有一部分。
  - (b) 只在本仓库的文档、AGENTS.md 或本仓库的门禁里：H1 不长 IDE 目录、H3 不留死代码（knip、jscpd 只在本仓库的 `npm run lint`；接管默认表没有）、H5 条款整条重写（图上的决策取代是 (a)，文档与规则文件不是）、H9 写规则说意图。共 4 条。
  - (c) 框架完全没有：H4b 遇到问题查根因、修在根上。任务书、交回、审查里都没有，审查的三类挡路标准也不含它。
- 方案要点：修根因挂在「重开过的节点」上（框架认不出「修 bug」，认得出重开）：任务书加一句并附上次重开的理由，交回加 `cause` 字段、没写就由门禁拦下，审查看到只修表现时记不挡路的发现；第二次重开时先提醒一次。不留死代码与条款整条重写合成任务书里常驻的一句，接管默认表按 ORCHESTRATION §7.5 补回 knip、jscpd、vulture。改动大多落在 M7 的任务书与交回上，要等 M7 合入后另开一件小活；第二次重开的提醒、重锚补规范摘要、接管默认表现在就能做。
- 要人定的 4 件：Q1 工程习惯进插件（宪章 §9 与目标的非目标要改写）；Q2 没写原因由交回门禁挡、「只修了表现」不挡路（守住 d-failure-plans）；Q3 主 Agent 身份段上限 3000 抬到 3200，放一句汇报可靠度；Q4 IDE 目录这一条不进框架。四件都推荐「可以」。
- 没有核实的：压缩之后 DSH 是否每次补回用户级 AGENTS.md、子 agent 是否也收到（只读了代码）；knip、jscpd、vulture 的输出能否被 M7 的 `changed` 写法读。

## 第一步：ZCode 全局配置位置

结论：人的工程习惯全文在 `C:\Users\29596\.zcode\AGENTS.md`（4732 字节，最后修改 2026-10-29 00:30:22，SHA256 前 12 位 4F380F063D0B）。只摘了习惯与工作规矩的文字，没有读、没有打印任何凭证文件。

依据（ZCode 机制，pristine 副本 `reference/zcode-3.17.1/host/index.js`）：

- `getUserZcodeAgentsFilePath` = `join(homedir, ".zcode", "AGENTS.md")`，是 ZCode 的用户级指令文件；同文件里 `getClaudeAgentsFileMigrationStatus` 把 `~/.claude/CLAUDE.md` 迁到这个路径。
- CLI 侧 `NodeContextSourceAdapter.resolveContextSources` 的辅助函数 `mPs` 读 `(HOME || USERPROFILE)/.zcode/AGENTS.md` 作为全局上下文源，工作区 AGENTS.md 另走向上查找。
- 内置 init 工作流提示词写明 "Do not write ~/.zcode/AGENTS.md"，说明这个文件是用户级、手写的。

文件自述：「ZCode 全局指令(用户级,所有工作区生效)」。共五节：一、对话人设；二、汇报粒度；三、中文写作风格；四、仓库卫生；五、代码卫生。第一、二、三节管对话与写作，第四、五节是工程习惯，第二步逐条录。

查过的其它位置（都没有工程习惯文字）：

| 位置 | 状态 |
|---|---|
| `C:\Users\29596\.zcode\cli\memories\global\memory\MEMORY.md` | 0 字节 |
| `C:\Users\29596\.zcode\cli\memories\projects\glm-hourness-2d33387aa673440e\memory\` | 3 个文件：索引、npm 发布机制、子代理并发与模型选择；是操作事实，不是工程习惯 |
| `C:\Users\29596\.zcode\v2\setting.json` | 只有 UI/行为开关（`memoryEnabled=true`、`zcodeInteractionBehavior="guide"` 等），没有指令文本 |
| `C:\Users\29596\.zcode\v2\config.json`、`C:\Users\29596\.zcode\cli\config.json` | 顶层只有 provider / mcp / plugins，没有指令文本 |
| `C:\Users\29596\.zcode\skills\` | 3 个技能（byted-web-search、video-shotcraft、一晨叔叔），与工程习惯无关 |
| `C:\Users\29596\.zcode\commands`、`C:\Users\29596\.zcode\plugins`、`C:\Users\29596\.claude\CLAUDE.md`、`C:\Users\29596\.agents\AGENTS.md` | 不存在 |
| `C:\Users\29596\.codex\AGENTS.md` | 存在但 0 字节 |
| `C:\Users\29596\AppData\Roaming\ZCode` | 只有缓存、会话、遥测目录 |
| `C:\Users\29596\.dsh\AGENTS.md` | 4713 字节，2026-10-26 22:14:57，SHA256 前 12 位 6E50817F6E31。与 ZCode 那份是同一套五节，逐行比对只差标题（「DSH 全局指令」）和第五节那一段的半角标点；DSH 宿主会读它，见 2.2 |
| `C:\Users\29596\.dsh\glm-hourness\memory\memory.jsonl` | 不存在：M5 用户级记忆里没有任何习惯 |

未读：`C:\Users\29596\.zcode\v2\credentials.json` 及其 `.bak`、`.tmp`（凭证，按要求跳过）。

另：本仓库 Kiro 侧的全局规则（`~/.kiro` 下的 writing-style-zh、persona）与 ZCode 全局文件的第一到三节内容重合，第四、五节在 Kiro 全局规则里没有；人明确说习惯以 ZCode 全局配置为准，本报告只以 `~/.zcode/AGENTS.md` 为源。

## 第二步：习惯逐条对照

### 2.1 习惯原文（出处 `C:\Users\29596\.zcode\AGENTS.md`）

只录工程习惯与工作规矩。第一节的人设、第三节大部分写作风格只管对话措辞，不属于编排框架的职责，列在 2.1 末尾说明，不参与对照。

- H1（§四 仓库卫生）：「仓库里不长任何 IDE / 工具专用的文档目录或配置。工作流规则放仓库的通用位置(如 `AGENTS.md`、`docs/`),个人配置放用户级目录(仓库外)。」
- H2（§四 仓库卫生）：「**长会话规则重读**(前提修正:continuation/摘要注入时有明确标记,是可感知的硬触发):收到会话延续摘要标记后的第一动作 = 重读工作区规则文件,先于任何派单与落码;每个大批次(波/班)收仓清单再固定含一次重读作保底。上下文被压缩后规则细节必失真,重读成本远低于按失真规则干活的返工成本。」
- H3（§五 代码卫生）：「不留死代码、无用代码；删就删干净，不留「注释掉的旧实现」和「以防万一」的孤儿分支。」
- H4（§五 代码卫生）：「遇到问题查根因，修就修在根上——禁止反复打补丁的行为：同一处被第三次修，停下来问自己是不是修错了地方，先重查根因再动手。」
- H5（§五 代码卫生）：「改规则/文档同理：条款过时就整条重写或删除，不在旧条款上叠补丁让文件越长越乱。」
- H6（§二 汇报粒度）：「用户是项目架构师,不关心实现细节。默认只说三件事: 1. **结论**——以及它有多可靠(实读查证到哪层,还是推断)。 2. **影响**——能不能往下走、要改什么、风险多大。 3. **要他拍板的岔路**——选项 + 建议 + 一句理由。决策依据的数字(直接决定工作量的那种)要留;结论被推翻要主动报。过程细节写进计划/findings 文档,他追再展开;拿不准要不要展开,问一句。」
- H7（§一 对话人设，工作规矩部分）：「侍奉结果如实汇报——查证失败、测试挂了、结论被推翻,第一时间直说;坏消息先事实后语气,顺序不能反。」以及「技术内容零滤镜——函数名、键名、数值、命令一字不差,该查几层查几层,不确定就直说。」
- H8（§一 干净区）：「凡是会写进文件的东西——commit message、计划/进度/交接/findings/spec 文档、派给子 agent 的 prompt、代码与注释——零人设零语气词,用原本的技术话术。」以及「人设只改怎么说,不改做什么、做多严;……压不过任何安全/查证/回归铁律。」
- H9（§三 中文写作风格）：「写规则或文档时,别用穷举限定的写法——不要列清单规定哪些算哪些不算,把意图说清就够了,判断留给读的人。」

不参与对照：§一 的人设本体（自称、称呼、语气词、爱意、卖萌浓度）和 §三 的措辞规则（删填充、AI 味词与句式、长短句、精确性例外）。它们管模型怎么说话，框架不该替各项目决定说话风格；Hourness 的提示词本身是干净区，按 H8 不带人设。

### 2.2 这份文字今天怎样到达模型（框架之外的那条路）

- DSH 宿主的 `@deepseek-ai/dsh-agent-instructions` 在 dsh-base 组合里（`reference/dsh-desktop-0.2.1-rc.3/dsh-base/cordis.patch.yml:303`），把 `$DSH_HOME/AGENTS.md`（本机 `C:\Users\29596\.dsh\AGENTS.md`）作为用户级指令，连同项目链的 AGENTS.md，放进每个会话的第一次请求（`reference/deepseek-harness/packages/context/agent-instructions/README.md`；`src/index.ts` 在看不到基线时重新加载）。这份文件与 ZCode 那份同文，所以在这台机器上，第四、五节的文字已经以提示词的形式进了每个 DSH 会话，与装没装 Hourness 无关。
- 没有核实：基线在压缩之后是否每次都补回（代码读到「可见历史里没有基线就重新加载」，没有 L3 实测）；子 agent 与 worker 是否也加载（插件代码里没有按 `origin` 排除子 agent 的分支，推断会加载）。
- 这条路是人的用户级配置，别人装上插件拿不到；宪章 §9 存放表也写明「用户全局配置：人设与个人习惯（用户全局 AGENTS.md），否，不进插件」，`hourness` 目标的非目标同一句（「人设与个人习惯不进插件（CHARTER.md §9）」）。人这次要的正是越过这一条，见「要人定的事」Q1。
- Hourness 自己的人设开口只给主 Agent：设计行设置 `persona: {name, text}`，插件不带人设（`src/design/persona.ts` 头注释与 `PERSONA_SCOPE`）。
- M5 记忆里没有这些习惯：用户级 `C:\Users\29596\.dsh\glm-hourness\memory\memory.jsonl` 不存在；记忆行在主 profile 里启用，出厂行配置为空。
- 经验板第一批 21 条（本项目 `.llm/lessons.jsonl`，全部 `seed from docs/HANDOFF.md` 或 `docs/DEVELOPMENT.md §7` 一类来源）没有一条讲修根因、死代码或重复；唯一带 duplicate 字样的 `L-59c755` 讲的是适配器返回重复模型。

### 2.3 逐条对照

归类：(a) 已融进框架，各项目都生效；(b) 只写在本仓库的文档或 AGENTS.md，框架本身不带；(c) 框架完全没有。

| 习惯 | 归类 | 在哪一层 | 证据 |
|---|---|---|---|
| H1 仓库里不长 IDE/工具目录 | (b) | 只在本仓库文档 | 宪章 §7.1 第 10 条。框架自己的落地文件都让 git 忽略（`.llm/` 经 `ensureIgnored` 写进 `.git/info/exclude`；M7 让 git 忽略 `.worktrees/`、`.hourness/`，m7 `src/execute/git.ts:496`），但不挡 agent 往别的项目里加 `.vscode/` 一类目录；提示词、门禁、默认表里都没有这一条 |
| H2 长会话规则重读 | (a)，有缺口 | 提醒、派活 | 每步投影在压缩之后重锚（`src/graph/reminder.ts` 头注释，ORCHESTRATION §2.5，L2/L3/L4 验过）；任务书每次派发时从图与规则板现生成，规则板的条目进「Rules in effect」一行（`src/execute/brief.ts` `renderBrief`），worker 读不到过时的规矩。缺口：ORCHESTRATION §2.5「重锚：压缩完成后立即重新注入投影、规范摘要与本会话违规计数」的后两项没做，`m4-reanchor-violations`（doing）补违规计数；「每个大批次收仓时重读一次」框架没有对应物。项目 AGENTS.md 的重读靠宿主（2.2） |
| H3 不留死代码、无用代码 | (b) | 只在本仓库的门禁与文档 | 宪章 §7.1 第 2 条；本仓库 `npm run lint` 里的 knip 与 jscpd 棘轮（DEVELOPMENT §10，ORCHESTRATION §7.7）。框架：任务书（main 与 m7 两边的 `renderBrief`、`renderReviewBrief`、`renderDesignReviewBrief`、`renderAcceptanceBrief`）与主 Agent 身份段（`src/design/identity.ts`、`talk.ts`）没有一句讲删净；审查只挡三类，死代码不在其中（m7 `src/execute/review.ts` `CRITERIA`）。接管设计的默认表（`.agents/tasks/bootstrap/design.md` §5.5）只有 ESLint、tsc、ruff、pytest、go vet、clippy、shellcheck、clang-tidy，没有死代码与重复检查；接管扫描只在项目已有 `knip.*`、`.jscpd.json` 时把它们认作检查器配置（bootstrap 分支 `src/bootstrap/scan.ts:195`）。默认表的代码 `src/bootstrap/defaults.ts` 在 bootstrap 分支上还没写 |
| H4a 同一处第三次修，停下来 | (a)，做法与习惯不同 | 门禁加问人 | LLM 第三次把节点从 done 重开到 doing，harness 在节点下提一张提议式待决「先停下查原因，可以吗？」，主 Agent 必须在下一批里问人（`src/graph/reopen.ts` `REOPEN_LIMIT = 3`、`reopenNotice`，由 `src/graph/tools.ts:425–429` 的 `graph_status` 调用；循环板条目 `graph.third-rework`，`src/graph/loop-entry.ts`；ORCHESTRATION §2.4）。与习惯的差别：习惯是 agent 自己停下重查，框架是把问题交给人；只数图节点的重开，同一个文件在不同节点下被反复修不算；人自己的重开不算 |
| H4b 遇到问题查根因，修在根上 | (c) | 无 | 宪章 §7.1 第 4 条只写了第三次那半句；DEVELOPMENT §5 第 5 条「同一症状连续两次修复无效时停下查契约/根因」只管本仓库。框架里：worker 任务书没有讲根因的句子，交回的 schema（m7 `src/execute/schemas.ts`：status、summary、commits、files、checks、questions、assumptions、lessons）没有根因字段；审查任务书的挡路标准只有 `acceptance:<i>`、`irreversible-loss`、`failure-plan`（m7 `src/execute/brief.ts:615`，`review.ts` `CRITERIA`），只修症状的返工照样 APPROVED；`TASK_KINDS` 是 implement、test、review、docs（`src/graph/schema.ts:37`），没有「修 bug」一类可供识别，能识别的只有返工（节点被重开、或 `BriefInput.earlier` 里有先前的尝试）；重开的 notice 只在第三次、且人同意之后才说「look for the cause and write it into this node before fixing」 |
| H5 条款过时整条重写，不叠补丁 | (b)，图上的决策是 (a) | 文档；图引擎 | 宪章 §7.1 第 6 条、§10 第 2 条，AGENTS.md「被取代的条款整条重写」只管本仓库。框架：图上的决策靠取代连线与 `superseded` 状态整条换掉（ORCHESTRATION §2.3、§2.6，宪章 §7.4），这一半各项目都生效；项目自己的文档与规则文件怎样改，任务书里没有一句 |
| H6 汇报粒度：结论、可靠度、影响、岔路 | (a) 一部分 | 提示词 | 主 Agent 身份段的 `TALK_GUIDE`（`src/design/talk.ts`）有「Ask at the project-manager level, never about code」「report first and questions last」「我定了：X，因为 Y，不对就说」，宪章 §6「汇报讲人话：结论先行」。缺的：结论有多可靠（实读到哪层还是推断）、结论被推翻要主动报、决策依据的数字要留，三样都不在身份段里 |
| H7 如实汇报，不确定就直说 | (a) 门禁一半，提示词一半没有 | 门禁 | 交回的 `checks` 只作参考，「the harness runs its own」（m7 `src/execute/schemas.ts`），合入前的检查由 harness 跑，宪章 §6「门禁只认证据，不认自述」。提示词：Hourness 的身份段与任务书没有「测试挂了先说」一类句子；GLM 方言里的 ZCode 原文 `DYNAMIC_BEHAVIOR` 有「Report outcomes faithfully」（`src/glm-prompt/verbatim.ts`），那是通道包的方言，只管 GLM 路由 |
| H8 干净区 | (a) | 提示词与构造 | 任务书由 harness 从图生成，「the model writes none of it」（`renderBrief` 注释）；主 Agent 人设段后面固定接 `PERSONA_SCOPE`「Text you put into tool calls (graph nodes, briefs for subagents) and anything written to files stays plain」（`src/design/persona.ts`）；人设只进主 Agent，不进普通会话与子 agent |
| H9 写规则别穷举，说清意图 | (b) | 只在本仓库文档 | 宪章 §6「提示词写意图，门禁放可测量的检查」、§7.4 同一句。框架给 agent 写节点、写规则提议的提示词里没有这一条 |

## 第三步：融入方案

### 3.0 读法与几个前提

- 规范阶梯四级（宪章 §6）：记忆、提示词、阶段提醒、门禁。下面每条只取够用的最低一级；能量的检查才进门禁（宪章 §6、§7.4「提示词写意图，门禁放可测量的检查」）。
- 提示词加的总量压在 4 句以内（宪章 §7.3 引 IFScale：规则少而精）。
- 主 Agent 身份段今天 2906 字符，测试钉的上限是 3000（`tests/design-mode.spec.ts:96`，m7 分支上的同名断言也是 3000）。往身份段里加一句就要抬上限，见 Q3；别的句子放进任务书或工具说明，不占这个额度。
- 「修 bug 的提交」框架认不出来：`TASK_KINDS` 只有 implement、test、review、docs（`src/graph/schema.ts:37`），提交信息只要求以节点 id 开头（`renderBrief`）。框架认得出的是返工：节点从 done 被重开到 doing（`reopensAfter`，`src/graph/reopen.ts`），每次重开都带 `reason`（图写入请求的 `reason` 必填，`src/graph/mutation.ts:67`）。所以下面「修根因」一律挂在「重开过的节点」上，不挂在「修 bug」上。
- 任务书、交回与审查的代码在 m7 分支（`.worktrees/m3`，HEAD 3180672，E8 还在 wip），没合入 main。改这几处要等 M7 合入之后另开一件小活，不往在跑的实现里塞（见 3.3 的 d-freeze-until-dogfood 一行）。

### 3.1 逐条方案

**H4b 修根因（c，最要紧）**，三层：

1. 提示词（任务书）。`renderBrief`（m7 `src/execute/brief.ts`）在任务节点重开过（`reopenCount(task, undefined) >= 1`）时，「Constraints」里加一句，意思是：这件活做完后又被重开过，先找出原因再改代码，交回时写明原因，以及这次改动为什么修的是原因而不只是表现；上一次重开的理由原样附上（取 `reopensAfter` 最后一条的 `reason`）。没重开过的活不加，保持缓存与长度。
   验证：L2 `tests/execute-brief.spec.ts` 钉两种情形（重开过有这句与理由，没重开过没有）；长度仍在 `BRIEF_LIMIT` 9000 之内。
2. 门禁（交回）。交回 schema（m7 `src/execute/schemas.ts`）加可选字段 `cause`；交回的语义检查（m7 `src/execute/handback.ts`，今天已在拒坏提交号、坏路径）在节点重开过而 `cause` 为空时拒收，提示写明正路（「写出原因再交回」）。这是一条写在代码里的规则：登进规则总表（m7 `src/guard/execute-rules.ts` 的 `EXECUTE_RULES`，`mode: 'enforce'`），拦下带规则 id 进违规流水，一句话或 `/rules lift` 能撤（d-code-rules-enforce、d-one-lift-path）。门禁只查有没有写，不评判写得对不对，符合「门禁只认证据」：写没写是可查的事实，对不对交给审查。交回处理把 `cause` 以批注写到节点上（「原因：…」），满足宪章 §7.1 第 11 条的留痕，也正是第三次重开的 notice 要人同意之后才做的「write it into this node」。
   验证：L2 `tests/execute-handback.spec.ts`（重开过、无 `cause` 被拒并记规则 id；有 `cause` 收下并写批注；首次建造不要求）；L3 执行探针加一个重开过的节点的场景。
3. 审查（提示词，不挡路）。审查任务书（m7 `renderReviewBrief`）在被审的活重开过时带上交回的 `cause`，并加一句：改动只处理了表现、没碰到写明的原因时，记一条不挡路的发现。挡不挡路见 Q2。
   验证：L2 `tests/execute-brief.spec.ts`、`tests/execute-review.spec.ts`（不挡路的发现不改变判定）。

成本：m7 的 4 个文件加测试，一条规则登记，ORCHESTRATION §3（M7 部分）与 M7 设计各补一段。半天到一天的活。

编排方提过的窄改法（「审查在修 bug 的提交没写根因、或认定只修了症状时挡住」）的对照：「没写根因」改由交回门禁机械地查，比交给审查员判更稳，也不用碰 d-failure-plans；「认定只修了症状」是审查员的主观判断，正是 d-failure-plans 要防的「每轮都找到新问题」的入口，所以默认不挡路，交人定（Q2）。「修 bug 的提交」换成「重开过的节点」，理由见 3.0。

**H4a 第三次修，停下来（a，补一步）**：今天第三次重开才交人。补一个更早的提示：第二次重开成功时，`graph_status` 的结果里带一句「这是第二次修：先找原因、写进节点再改」（`src/graph/reopen.ts` 加一个 notice 函数，`src/graph/tools.ts:425` 一带按 `reopens.length === REOPEN_LIMIT - 1` 交出）。级别：提示词（工具结果），不问人、不拦。这样习惯里「agent 自己停下」的一半有了，「第三次交人」照旧。
验证：L2 图工具的重开测试钉第 2 次有这句、第 1 次与第 3 次（第 3 次是提问的 notice）不重复。成本：很小，main 上就能做，不碰 M7。
同一个文件在不同节点下被反复修，框架今天不数，这里也不加：要数就得把文件与节点对上，成本高，效果没把握。

**H3 不留死代码 + H5 条款整条重写（b）**，两层：

1. 提示词（任务书）。`renderBrief` 的「Constraints」加一句，常驻：删掉这次改动之后没人用的代码和不再成立的文字，不留注释掉的旧实现，不留以防万一的分支；条款过时就整条重写或删掉，不在后面叠补丁。一句同时管 H3 与 H5。
   验证：L2 `tests/execute-brief.spec.ts` 钉这一句在。成本：一行。
2. 门禁（接管的默认表）。ORCHESTRATION §7.5 的社区默认方案本来就列了「跨语言：jscpd（重复）、knip / vulture（死代码）」，接管设计 §5.5 的默认表落到命令时把这一列丢了。按 §7.5 补回：Node 加 knip 与 jscpd 的门禁行；Python 加 vulture；Rust 不用加（默认表里已有 `cargo clippy --locked -- -D warnings`，rustc 的 dead_code 告警因此已是错误）；Go 的 `go vet` 不查没用到的函数，要查得加 staticcheck，先不加，写进默认表的「没有覆盖」说明。新项目第一天就严格；已有项目走 §5.6 已有的基线办法：输出能被 `changed` 读的只挡新出的，读不了的不进门禁、另提一个任务（§5.6 第 4 条）。knip、jscpd、vulture 的输出能不能按 `eslint-json`、`tsc`、`lines` 三种格式读，没核实，要在写 `src/bootstrap/defaults.ts` 时试。
   落点：接管的默认表不冻结（d-tests-required-gate 的先例：「接管的默认表……不冻结，先在那里落实」），`defaults.ts` 在 bootstrap 分支上还没写，现在改设计 §5.5 那张表就行。
   验证：L2 接管的默认表测试（Node、Python 夹具各出对应的门禁行，Rust 不重复出）；L3 `bootstrap-new`、`bootstrap-existing`。
   成本：设计改一张表；对用户项目的成本是多一个开发依赖、合入前多跑十几秒，进一次同意的清单，人看过才生效。

**H2 长会话规则重读（a，补缺口）**：

1. 验证宿主那一路（不写代码）：L3 探针确认压缩之后 `dsh-agent-instructions` 的基线（`$DSH_HOME/AGENTS.md` 与项目 AGENTS.md）重新出现在请求里，子 agent 也收到。今天只读了代码，没实测（2.2）。
2. 阶段提醒（重锚）：ORCHESTRATION §2.5 写了的「规范摘要」补上：压缩之后那一次投影，除了 `m4-reanchor-violations` 在做的本会话违规计数，再附焦点所在目标下已批准的规范节点（`norm-*`）的标题，每条一行。只在压缩后注入一次，平时不加。模块 `src/graph/reminder.ts`。
   验证：L2 `tests/graph-reminder.spec.ts` 钉压缩后有、平时没有；L3 `glm-graph-compact` 场景核对。
   成本：小。别扩进在跑的 `m4-reanchor-violations`，等它合入后另开一件。
「每个大批次收仓时重读一次」不加：worker 的任务书每次派发都从图与规则板现生成（`renderBrief`），已经是这一条在框架里的对应物。

**H6 汇报的可靠度 + H7 如实汇报（a 的一部分，补提示词）**：`TALK_GUIDE`（`src/design/talk.ts`）加一句：每个结论说清是读过、跑过还是推断；自己先前的结论被推翻、检查没过，放在报告最前面说。级别：提示词。身份段要抬上限才放得下，见 Q3。
验证：L2 `tests/design-mode.spec.ts`（新上限、句子在）。成本：一句，加一次上限的理由记录。

**H9 写规范说意图，不穷举（b）**：放进 `graph_propose` 的工具说明，只对规范节点（`norm-*`）说：正文写意图与判断依据，不列「哪些算哪些不算」的清单；能量的检查写成检查行或门禁行。工具说明不占身份段的额度。级别：提示词。
验证：L2 图工具说明的测试钉这一句。成本：一句。

**H1 仓库里不长 IDE / 工具目录（b）**：建议不融，留在人的用户级 AGENTS.md（DSH 已经把它送进人自己的每个会话，2.2）。理由：这条是口味，别的项目常有意提交 `.vscode/settings.json` 一类共享配置；做成默认门禁会挡住别人的正常做法，做成提示词又和项目自己的规矩打架。框架自己落下的文件已经都被 git 忽略（`.llm/`、`.worktrees/`、`.hourness/`），框架本身守住了这一条。见 Q4。

**H8 干净区（a）**：不用动。

### 3.2 做完之后的归类

| 习惯 | 现在 | 做完之后 | 落在哪一级 |
|---|---|---|---|
| H4b 修根因 | (c) | (a) | 提示词 + 交回门禁 + 审查不挡路的发现 |
| H4a 第三次停下 | (a) | (a)，第二次就提醒 | 工具结果 + 已有的问人 |
| H3 不留死代码 | (b) | (a) | 提示词 + 接管默认表的门禁行 |
| H5 条款整条重写 | (b) | (a)（提示词） | 提示词 |
| H2 规则重读 | (a) 有缺口 | (a) | 阶段提醒（重锚）+ L3 实测宿主那一路 |
| H6、H7 汇报 | (a) 一部分 | (a) | 主 Agent 提示词 |
| H9 说意图 | (b) | (a)（提示词） | 工具说明 |
| H1 IDE 目录 | (b) | 不变（建议） | 人的用户级配置 |
| H8 干净区 | (a) | 不变 | — |

建议的顺序：H4a 与 H2 的重锚在 main 上现在就能做（不碰 M7）；H3 的默认表改设计稿，随接管走；H4b、H3/H5 的任务书句子等 M7 合入后一件小活做完；H6/H7、H9 各一句，随手可做，H6/H7 要先答 Q3。

### 3.3 与已定决定的冲突

| 决定 | 冲突在哪 | 处理 |
|---|---|---|
| 宪章 §9 存放表「用户全局配置：人设与个人习惯……否，不进插件」；`hourness` 目标的非目标「人设与个人习惯不进插件（CHARTER.md §9）」 | 人这次要的就是把习惯放进插件 | 交人定（Q1）。建议改写这两处：人设与口味仍不进插件；工程习惯当作框架的默认做法进 |
| 接管设计 §1.1「机制不带内容：包里只有模板、默认表与草稿的算法」 | 任务书里固定的两句是插件自带的内容 | 同 Q1。默认表补 knip 一类本来就是默认表的职责，不冲突；冲突只在任务书的固定句子 |
| d-failure-plans（审查只挡三类） | 窄改法的「认定只修了症状就挡」是第四类 | 交人定（Q2）。建议不挡：「没写根因」改由交回门禁查 |
| d-code-rules-enforce | 交回门禁是一条写在代码里的规则 | 不冲突，照做：启用即拦，带规则 id 记进违规流水，没有试运行期 |
| d-one-lift-path | 新规则要能撤 | 不冲突，照做：登进规则总表，一句话或 `/rules lift <id>` 撤 |
| d-rules-human-only | 规则只能由人加 | 不冲突：写在代码里的规则照开发流程过评审与测试（宪章 §3.2 第 3 条），人对本报告的答复就是加这条规则的授权，要带原话记上图 |
| d-freeze-until-dogfood、d-finish-then-bootstrap | 任务书、交回、审查的改动落在 M7 0.6 已放行的设计与在跑的实现上 | 记成 M7 节点上的请求，M7 合入后另开一件小活做；按 d-finish-then-bootstrap 在自举之前做完。接管默认表不冻结，可以现在改 |
| d-defaults-readonly | 插件带来的默认条目只能看 | 不冲突：新规则在规则页上只能看、能撤，同 d-one-lift-path 的例外 |

## 要人定的事

Q1. 宪章 §9 与 `hourness` 目标的非目标写着「人设与个人习惯不进插件」。工程习惯（修根因、不留死代码、条款整条重写、汇报写可靠度、规范说意图）改成框架的默认做法进插件，人设与口味（说话风格、IDE 目录这类偏好）照旧不进，可以吗？
推荐：可以。理由：人要的就是别的项目里的模型也照做，这几条又正是宪章 §7.1 已写成设计约束的那几条，只是还没落到提示词与门禁上。代价：任务书里有两三句插件固定的话，别的项目改不掉，只能整条规则撤下。同意之后要改宪章 §9 存放表与目标的非目标两处的写法。

Q2. 重开过的活交回时没写原因，由交回门禁挡下（规则启用即拦，一句话能撤）；审查员认为「只修了表现」时，只记不挡路的发现，不改 d-failure-plans 的三类，可以吗？
推荐：可以。理由：写没写原因是可查的事实，适合门禁；「只修了表现」靠审查员判断，挡路就会回到 2026-10-29 那种一轮轮找新问题的局面，d-failure-plans 就是为这个定的。不采用的办法：把「只修了表现」加成第四类挡路标准，换来的是更严，代价是审查轮数可能变多。

Q3. 主 Agent 的身份段测试上限是 3000 字符，今天用到 2906。加一句「结论说清读过、跑过还是推断；先前结论被推翻、检查没过放在最前面说」，上限抬到 3200，可以吗？
推荐：可以。理由：这是汇报习惯里唯一还没进框架的部分，放在别处（阶段提醒、工具说明）主 Agent 在汇报时看不到。代价：每个主 Agent 会话的系统提示多约 150 字符。

Q4. 「仓库里不长 IDE 或工具专用的目录」只留在你自己的用户级配置里，不进框架，可以吗？
推荐：可以。理由：别的项目常有意提交共享的编辑器配置，框架替它们禁掉会挡正常做法；框架自己落下的文件已经都被 git 忽略。你的用户级 AGENTS.md 已经由 DSH 送进你自己的每个会话。

已由本报告定、人可推翻的（agent 决定，不问）：「修 bug」一律按「重开过的节点」认，因为框架里没有修 bug 这一类活；同一个文件在不同节点下被反复修不数；Go 的默认表先不加 staticcheck；「每个大批次重读一次」不另做，派发时现生成的任务书已经是它的对应物。
