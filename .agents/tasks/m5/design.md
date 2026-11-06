# M5 设计：记忆与学习，连同经验板块（项目图节点 `m5`、`lessons`）

版本：0.6（2026-10-31），按人 2026-10-31 的定案 `d-code-rules-enforce` 修订第一批经验第 7 条（§4.8）及引用它的几处（§0、§1.1、§8.3、§11），改动见 §15「0.6」一段；0.5 原文另存为 `design-0.5.md`，0.4 为 `design-0.4.md`，0.3 为 `design-0.3.md`。0.5 是按第 4 轮设计评审（`design-review.md`，R4-01 至 R4-11）修订、并与已放行的邻居设计对齐的版本（M3 附录 0.5 与 M7 0.6 不改，M5 能就着它们现有的接口改的都改，剩下的写成自举之后再办的请求，§13），改动与对应的发现见 §15「0.5」一段。
状态：0.5 已在对齐轮放行；0.6 待定案修订的复核（`decisions-review.json`）。实现排在 split 合入之后（main 已含 split 第 0–8 步），不在自举关键路径上。本稿不改代码，不写 `docs/graph/`，不碰 `~/.dsh` 与桌面版。

依据：`.agents/tasks/design-context.md` 全文，尤其「Both boards are hook-style; storage scope」「Main agent and peak; stale entries; hook seam」（`d-memory-scope`）「Rules thin slice: orchestrator rulings after its review」；`AGENTS.md`；`docs/CHARTER.md` 0.8（§3.2 第 3 条、§6、§9）；`docs/ORCHESTRATION.md` §8、§16.3、§17.6；`docs/DESIGN.md` §2.3–§2.5、§2.4a、§5.2–§5.3、§6、§7；`docs/ROADMAP.md` M5；`docs/DEVELOPMENT.md` §1.1、§3、§5、§7、§9；`docs/HANDOFF.md` §6；阅读摘要 `.agents/tasks/reading-2026-10-29/digest.md` §2.2 第 3、13 篇，§4 第 16、17 条，§5 C5，§6 K4、K5、K7，§7 第 10 条；清点报告 `.agents/tasks/prompt-audit/report.md` §2–§5、§7；已放行的邻居设计：规则板 `.agents/tasks/rules/design.md` 0.10（§7.1、§7.4、§10.7、§16.3）、循环板 `.agents/tasks/schedules/design.md` 0.6、M3 附录 `.agents/tasks/m3/design-addendum.md` 0.5（§2.4、§2.7、§3.4–§3.7）、M7 `.agents/tasks/m7/design.md` 0.6（§3.5.5、§3.11.1、§3.12.2、§3.12.4）；同批对齐中的 plain-ui `.agents/tasks/plain-ui/design.md` 0.7（§4.7、§11）；图节点 `m5`、`lessons`、`d-memory-scope`、`d-failure-plans`、`d-rules-human-only`、`d-code-rules-enforce`、`d-rules-in-repo`、`d-chat-not-cards`、`d-ui-look-not-operate`、`norm-decision-tiers`、`norm-audit-trail`、`question-26`、`question-28`、`question-31`，以及 `m5` 2026-10-30T13:04Z 与 13:12Z 的批注、`lessons` 2026-10-30T06:11Z 与 06:25Z 的批注、`recommend-last` 2026-10-29T11:39 与 `orch` 2026-10-29T12:41 的批注；现有代码 `src/data/`（`project-root.ts`、`lock.ts`）、`src/graph/engine.ts`、`src/design/mode.ts`、`src/memory/`、`src/glm-prompt/localize.ts`、`src/glm-prompt/persona.ts`、`src/shared/`、`scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs`。

证据写法：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行（`cordis` 包不带前缀），其他文件写出文件名与行号。ZCode 的文字以 `reference/ZCode/apps/zcode-cli/packages/core/src/` 下的源码为准，写作「ZCode <文件>:行」，但 ZCode 的基线已是 3.17.1（`d-zcode-3171`），逐字文本只认 `reference/zcode-3.17.1/zcode.cjs`，Memory 节的原句取自它（§3.5），3.16.2 源码只作机制参考（§14 U8）。〔实读〕读过源码；〔推断〕由源码推出、没运行；没运行过的接缝都列在 §14。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。
## 0. 摘要

- 两者的关系（§2.1）：一个存储层，两个集合。记忆（`memory`）记人是谁、人要怎样干活，以及指向项目事实出处的线索；经验板块（`lessons`）记「在某种情况下踩过的坑与解法」。两者共用 `src/data/` 下新的流水存储（只追加的 JSONL、按会话找项目根），文件锁与项目根用仓库里已有的那一份（`src/data/lock.ts`、`src/data/project-root.ts`），各有自己的数据形状、工具、插件行与用途。没选「一个存储加 `kind` 字段」：两者的读法不同（记忆在会话开局给索引，经验按文件、命令与报错匹配），一套工具同时教两件事，模型分不清该往哪写；也没选「两套存储」：崩溃恢复与留痕要写两遍。
- 存放的范围（`d-memory-scope`，§2.1、§5.1）：关于人本人的记忆（说话习惯、拍板偏好）在用户级目录，跨项目共用；项目事实、项目规范和全部经验（含通用的踩坑经验）都在项目的 `.llm/` 里，新项目要重新学一遍通用的坑，这个代价人已知道。用户级目录里没有经验。`memory_store` 写 `feedback` 时必须写明范围：`all`（人怎样干活）或 `project`（本项目的规范），没有缺省（§3.2）。
- 记忆（§3）：条目沿用 ZCode 的四类（`user`、`feedback`、`project`、`reference`）与字段（`name`、`description`、正文带 Why）。分类看来源：人说过的（带 `relay` 原话，或来自人的命令）`user`、`feedback` 是偏好，不衰减，只有人能撤；其余是事实，14 天半衰期。取消路径与文件名的拒绝判据，改为类型、Why 与写入前查重；`project` 事实要写出处。会话开局与压缩之后，在对话末尾放一条 `<system-reminder>` 记忆索引，形状照 ZCode 的 MEMORY.md 索引，系统提示词逐步不变。子 agent 不拿记忆工具，也不收索引。项目目录跟会话的工作区走，不再用 profile 里钉死的本仓库 `.llm`。
- 方言（§3.5）：`glm:memory` 节改为「ZCode 3.17.1 原句加最少的本地化」，全文在 §3.5 写定（约 2,210 字符）；原句放进新的镜像文件，由逐字门禁核对；L2 用白名单断言钉住「不是原文的只有这几处」，不算占比。记忆工具不在就不出这一节，经验查询工具不在就不出提到它的那一句。
- 学习流水线（§3.6）：harness 从图的历史（人改的字段按「人，或 `llm` 带 `relay`」认，人在对话里的否掉与补充是不带 `relay` 的批注，按引擎实际写出的形状读，§3.6 第 1 步）、汇报细度的变动与门禁以外的提交里算出纠正信号并分组；不依赖 M7 的周报：记忆行提供只读工具 `learning_signals`，并每七天至多一次提醒主 Agent 去看（§3.6 第 2 步）；主 Agent 把每组落成偏好、推测、经验、规则提议或候选练习题；只有规则要人批（`d-rules-human-only`）；之后按组计复发。M7 的周报日后可以加一节同样的内容，那是自举之后的请求，不是前提（§13）。汇报细度闭环（§3.7）：M3 附录 0.5 作废了 `design_review` 与五键卡，「讲细点」「说重点」是人在对话里说的话；人的话表明长短要一直这样时，主 Agent 带人的原话写偏好 `reporting-depth`，下一个会话的默认细度取它；会话内的系统提示词不变。
- 经验板块（§4）：每条经验写明情况（文件、工具、命令、报错片段）、坑、解法、证据、最近一次确认，都属于本项目。来源是 worker 交回里的候选（M7 接缝）：与已有经验完全相同的自动并入，与人删过的相同的自动丢弃，像密钥的拒收（M7 不把被拒的候选写进图，退路批注也先略去像密钥的字段，§8.1 第 5 条），其余由主 Agent 用 `lessons_merge` 合并或丢弃。人在面板上只看（面板没有任何写入控件，plain-ui 0.7 §4.7）；删除与恢复是人在主 Agent 的对话里说，主 Agent 带人的原话调 `lessons_merge`，人也可以在输入框打 `/lessons`。三条用途：派发时进简报（M7 调 `relevant`）；命令失败时按报错片段推一条提醒；所有 agent 都能调的 `lessons_query`。经验只是建议：经验行不注册任何拦截；同一条经验 28 天内在 3 个会话里复发，harness 提醒主 Agent 可以向人提规则。第一批 21 条来自 `DEVELOPMENT.md` §5 与 §7、`HANDOFF.md` §6、2026-10-29 的两次事故（worker 不顾简报写了图；简报写在人拍板之前而过时），以及蓝屏清零状态文件的那一次（§4.8）；第 7 条的解法写「引号感知解析；启用行之前把无害写法写进测试；规则从行启用那天起就拦」，不写影子期（`d-code-rules-enforce`，§4.8）。
- 存储（§5）：项目级是会话项目根下的 `.llm/memory.jsonl` 与 `.llm/lessons.jsonl`，用户级只有 `<userHome>/memory/memory.jsonl`（关于人本人的记忆）。每个改变状态的动作是流水里的一行，写明谁、何时、为什么、凭什么。删除是墓碑，旧的 `memory.json` 改名保留，任何文件都不覆盖写。项目根与文件锁不新写：`src/data/project-root.ts` 的 `projectOf`、`ensureIgnored` 与 `src/data/lock.ts` 的 `acquireLock` 已经在仓库里，M5 直接用，不加第二份（`m5` 节点 2026-10-30T13:12Z 的裁定）。像密钥的文本按令牌形状判（§5.6），路径、文件名与长标识符不受影响；证据与出处有一套固定写法（§5.7）。不在 git 仓库里的文件夹只有已有 `.llm/` 时才算项目（§5.5）。
- 实施（§9）：三条线并行先做纯函数与存储（A1 存储底座、B1 记忆模型、C1 经验模型），再并行做两行（M1 记忆行、L1 经验行），之后是方言节、失败匹配、第一批经验、面板、细度闭环与学习信号。L4 攒两批。
- 要人定的（§12）：D1 M5 与经验板块各任务的「怎样算做完」（必须问人的第 1 类），按四行方案写，单独交人（§12）；D2（记忆里还存不存项目事实）是 agent 决定。
## 1. 需求与验收

### 1.1 必须遵守的定案

| 定案 | 原话或出处 | 本设计怎样遵守 |
| --- | --- | --- |
| 经验板块（`lessons`，用户 2026-10-29） | 「要不要设置一个经验板块，用来统计项目里遇到的坑和解决办法？要不然每个子代理都得自己摸一次？」「还得允许子代理主动查经验板块的内容」 | 字段、来源、三条用途、人能删都按节点正文（§4）；节点正文里的「适用范围（本项目或所有项目）」被 `d-memory-scope` 取代，经验只属于本项目；人删条目是对主 Agent 说一句（§4.7）；`lessons_query` 在每个 agent 的工具面里，GLM 路由上常驻（§2.3） |
| `d-memory-scope`（人 2026-10-30，「全都没问题」） | 关于人本人的记忆（说话习惯、拍板偏好）留全局；项目的经验含通用的踩坑经验都进项目，新项目要重新学，代价已告知人 | 用户级目录只放关于人本人的记忆；所有经验、项目事实、项目规范进项目的 `.llm/`；经验没有范围字段，没有用户级经验流水（§2.1、§4.1、§5.1） |
| `d-rules-in-repo`、CHARTER 0.7 §9 | 属于项目的都在项目里；运行时的东西进项目的 `.llm/`，不进 git | 两份项目流水在 `<项目根>/.llm/`，第一次写之前把 `.llm/` 加进 `.git/info/exclude`（用 `ensureIgnored`，§5.5） |
| `d-chat-not-cards`、`d-ui-look-not-operate`（plain-ui 0.7 §4.7、`lessons` 节点 2026-10-30T06:11Z 的批注） | 面板只看不操作，人要做的事在主 Agent 的对话里说；`/graph-apply` 已删 | 经验页没有按钮，也不经任何命令写；删除与恢复是人对主 Agent 说，主 Agent 带人的原话调 `lessons_merge`（§4.2.2、§4.7）；给人的待决是对话里的四行方案，不是卡片（§12） |
| `m5` 节点 2026-10-30T13:12Z 的裁定 | 仓库里只留一份项目根模块和一份锁模块；M5 需要可注入文件系统或异步读法时给这一份加选项，不另写第二份 | 用 `src/data/project-root.ts` 与 `src/data/lock.ts`，M5 不新建这两个文件，也不加选项（§5.3、§5.5） |
| `d-rules-human-only` | 「先不允许自己加规则吧，只有人能动」 | 记忆与经验都不是规则，两行都不注册拦截；复发的坑只提醒主 Agent 去提规则提议（§4.6）；学习流水线里只有规则要人批（§3.6） |
| `d-code-rules-enforce`（人 2026-10-31） | 「试运行规则啥的直接拦就行了，这样反而有问题好发现」：写在代码里的规则从它所在的插件行启用那天起就拦，没有影子期，没有转正的门槛；新插件行默认禁用、验证过才启用不变（管的是行，不是规则） | M5 的两行不注册任何拦截，没有要改的规则；第一批经验第 7 条的解法不再教「新门禁先在影子模式运行」，改为启用行之前把无害写法写进测试、规则启用即拦（§4.8） |
| `ORCHESTRATION.md` §8.2 存放〔定案 2026-10-28〕 | 关于人的偏好放用户级目录，项目事实与项目规范放工作区 `.llm/` | 范围 `all`（关于人本人的记忆）进用户级目录，`project` 进会话项目根的 `.llm/`（§5.1）；「工作区」落实为会话的工作区，不是 profile 里钉死的本仓库。`d-memory-scope` 把用户级收窄到关于人本人的记忆，经验不在用户级 |
| `d-failure-plans`、`docs/DEVELOPMENT.md` §1.1 | 「优雅的失败重试，以及事后可追溯性（用来修bug）」 | §7 按操作写发现、重试、恢复与留痕；流水本身就是留痕 |
| `norm-audit-trail`（条款 11） | 「记得可审计性处处留痕」 | 每次写入是流水里的一行：身份、时刻、原因、证据，经转述的带原话；删除记下被删条目的快照（§5.2） |
| `question-31` C | 子 agent 只拿它需要的 | 子 agent 不拿记忆工具与索引、不拿 `lessons_merge`，拿 `lessons_query`（§2.3） |
| `question-26` C | 主 Agent 不拿写文件工具 | 记忆与经验的写入都经工具与 harness，不经文件工具，主 Agent 照常可用 |
| `question-28` C | 「你在没有副作用的情况下尽可能开更多的并行」 | §9 三条纯函数线并行；改同一批登记文件的步按先合入先改排队 |
| `question-14` G3 | 「开编排层就全生效，不开就全不生效」 | 记忆与经验对所有路由、所有模型生效；GLM 只多方言的一节文字 |
| `question-17` B | 两个插件 | 记忆与经验都在编排层包；GLM 包只经公共库的契约读细度与工具名（§8.6） |
| `d-chat-not-cards`、`d-plain-questions`（取代 `d-option-card` 的卡片版式） | 问人用对话里的四行方案（背景、推荐、疑问、不做），一次至多三件，不出选项表，用人学过的词 | §12 的 D1 照这个写；M5 不新增 harness 给人的待决 |
| `question-27` B | 只量系统里看得到的数 | 经验与记忆的统计只取流水、图与会话日志（§3.6、§4.9） |
| 阅读摘要 C5、第 17 条 | 记忆只放可复用的经验与偏好，事实放人审过的产物 | 坑与解法归经验板块；记忆的 `project` 事实要写出处（D2，agent 决定，§3.2） |
| 阅读摘要第 16 条 | 纠正还要变成回归检查或标定题 | 学习流水线的落点之一是 M7 §3.14.5 的候选练习题（§3.6） |
| K5、K7（阅读摘要 §6） | 简报过期；提醒要有条件 | K5 收进第一批经验（§4.8）；每条提醒只在内容变化或事件发生时注入（§3.3、§4.2、§4.4） |
| `docs/DESIGN.md` §5.1、`d-zcode-3171` | 行为习惯类镜像 ZCode；基线是 3.17.1，逐字文本只认 `reference/zcode-3.17.1/zcode.cjs` | 记忆的四类、字段、索引、Memory 节的原句照 3.17.1 的 `buildMemorySection`（§3.5） |
| 标定的角色（用户 2026-10-29） | 「真正的标定应该是……在真实的项目开发中进行测试」 | 经验板块是否有用看自举里的复发数（§4.9），不靠标定集证明；标定运行不读真实的经验与记忆（§8.7） |

### 1.2 各节点的行为与建议的验收（怎样算做完，D1）

建议在 `m5` 下建 `m5-1` 到 `m5-5`，在 `lessons` 下建 `lessons-1` 到 `lessons-4`（§13）。下表的「建议验收」是草稿，写进节点要人批准（决策分级第 1 类，D1，§12）；人定之前，实现与 L2、L3 检查按下表做。ROADMAP 的六项与节点的对应：事实与偏好分类、取消路径判据 → `m5-1`；会话开局召回、记忆工具常驻 → `m5-2`；学习流水线 → `m5-4`；汇报细度闭环 → `m5-5`；`m5-3` 是方言节，`lessons-*` 是经验板块。

| 节点 | 内容 | 建议验收 | 层 |
| --- | --- | --- | --- |
| m5-1 | 记忆的分类与写入：两类、四种类型、取消路径判据、按会话的项目目录、迁移 | 1. 带 `relay` 的 `user` 或 `feedback` 条目是偏好，60 天后强度仍为 1；不带 `relay` 的是事实，0 次复审时 14 天后强度为 0.5（注入时钟）。2. 含 `coding-plan/start-plan` 与 `src/shared/dsh-min.ts` 的文本能存进去；含深层路径（如 `reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts`）与 32 字符以上标识符（如 `buildProviderEndpointRoutingHeaders`）的正文与出处存得进去；作出处的 40 位提交号（裸写与 `commit:` 写法，§5.7）存得进去；`commit:` 后面不是 7–40 位十六进制时拒绝（`invalid`）；`ghp_` 开头的令牌、40 个字符的大小写加数字混排令牌、PEM 头被拒为 `secret_like`，拒绝信息写出命中的类别（§5.6）；源码里不再有 `defaultKnowableFromGit`、`shouldStore` 与行配置 `knowableFromGit`。3. `feedback`、`project` 正文没有 `Why:` 一行时拒绝（`invalid`）；`project` 没有可识别的出处时拒绝（`bad_source`）；`project`、`reference` 类带范围 `all` 拒绝（`invalid`，`d-memory-scope`：用户级只放关于人本人的记忆）；`feedback` 没写 `scope` 拒绝（`invalid`，`hint` 说明 `all` 与 `project` 各指什么），`user` 没写 `scope` 时按 `all` 存；多余字段拒绝。4. 新名字与已有条目相似时拒绝（`similar`）并列出相似条目，带 `confirmNew: true` 时存。5. 两个仓库里的两个会话各写进自己项目根的 `.llm/memory.jsonl`；工作树里的会话写主检出的 `.llm`；范围 `all` 写进用户级目录（只有 `user`、`feedback` 两类能用）；第一次往一个项目写之前，该项目的 `.git/info/exclude` 里有了 `.llm/`，加不进去时这次写入得 `io`、`.llm/` 没有被建出来（§5.5）；会话没有工作目录时 `project` 范围拒绝（`no_project`），`all` 照常；不在 git 仓库里的文件夹没有 `.llm/` 时同样 `no_project`、不建 `.llm/`，已有 `.llm/` 时写进它（§5.5）。6. 旧的 `.llm/memory.json` 在第一次写入时迁移：新流水第一行是带这条条目的 `base`，旧文件改名为 `memory.json.migrated-<时间>`；读不出的旧文件不被覆盖，工具报 `io`。7. agent 删偏好不带 `relay` 被拒（同一会话里自己刚写的除外），带了就删；流水记下身份、原话、原因与被删条目；人对主 Agent 说「忘掉这条」，主 Agent 带人的原话调 `memory_forget`，偏好也删得掉；人在输入框打 `/memory forget` 能删任何条目。8. 两个进程各向同一流水写 200 条，`seq` 从 1 到 400 连续，没有丢 | L2；L3 `glm-memory`、`non-glm-memory` |
| m5-2 | 召回与工具面：会话开局的索引、记忆工具常驻、子 agent 不带 | 1. 一个新的根会话，存储里有条目时，第一次请求里、第一条用户消息之后有一条来源为 `glm-hourness-memory` 的 `<system-reminder>` 记忆索引（偏好在前，事实按强度，淡忘的事实不列）；之后每步的系统提示词与第一步逐字节相同，索引不再重复；开局时存储为空的会话第一步没有这条，本会话第一次写入之后的下一步出现一次，之后不再重复（§3.3）。2. 压缩检查点之后的第一次请求再带一次索引，之后不重复。3. 子 agent 的请求里没有记忆工具，也没有 `# Memory` 一节；根 agent 有三个记忆工具，GLM 路由上不带 `deferLoading`。`subagent_fork` 的子 agent 继承父会话的历史，历史里可以有父会话的索引与候选提醒，这不算违反本条（§2.3）。4. 索引至多 200 行、25,000 字符，超出时末尾有截断说明 | L2；L3 `glm-memory`、`glm-memory-compact`、`glm-worker-memory`；L4 |
| m5-3 | 方言的 Memory 节贴训练分布 | 1. ZCode 原句放在镜像文件 `src/glm-prompt/zcode-memory-text.ts`，`npm run check:verbatim` 通过（门禁只读 `reference/zcode-3.17.1/zcode.cjs`）；本地化后的节与 §3.5 写定的全文逐字相同；节里保留 §3.5 表中标「原样」的每一句（L2 逐句核对）；白名单断言通过：节里不是 ZCode 原文的文字只有 Z2、Z6 的改写句，Z3 的 `body: ` 前缀与 `type:` 行去掉的缩进，Z7 的两处替换，L1 与 L2（§3.5「白名单断言」）。不设占比下限。2. 记忆工具三个都在才出这一节；`lessons_query` 在工具面里才出提到经验板块的那一句。3. 节里没有「memory_store 会拒绝仓库能回答的内容」这类说法。4. 探针 `glm` 场景看到新的首句，`glm-only` 场景没有这一节 | L1、L2；L3 |
| m5-4 | 学习流水线 | 1. 测试的图历史不手写，由真实的图引擎（`src/graph/engine.ts`）在临时目录里写出再读回：一次 `llm` 带 `relay` 的 `edit`（人经主 Agent 改字段）、一次人身份的 `edit`、一次不带 `relay` 的 `llm` 的 `edit`（agent 自己改，不是信号）、一次 `llm` 带 `relay` 的 `reject`、一次开头是 `ANSWER_MARKS.reject` 的 `comment`、一次开头是 `ANSWER_MARKS.add` 的 `comment`（批注不带 `relay`，引擎丢掉它）、一次人发起的重开。`correctionSignals` 在这份读回的历史上找出：人改了 LLM 写的字段、人否决提议、人在对话里对方案说的否掉与补充、人发起的重开，再加汇报细度的变动；按键分组；同样的输入得到同样的输出（§3.6 第 1 步）。2. 学习摘要不依赖 M7 的周报：记忆行的只读工具 `learning_signals` 在这份历史上返回至少 2 次的组，以及已经学过（带 `learnedFrom`）之后又出现的复发数，附前 4 周的值；根 agent 有这个工具，子 agent 的工具面里没有，直接调用被拒（`role`）；有符合条件的组、且距上一次摘要提醒满 7 天时，主 Agent 的下一步收到一条提醒，7 天内、没有符合条件的组、摘要没有变化时不来（§3.6 第 2 步）。3. 落点只有规则要人批：偏好、推测、经验、候选标定题都不出给人的待决 | L2 |
| m5-5 | 汇报细度闭环 | 1. 主 Agent 调 `memory_store {name: "reporting-depth", type: "user", value: "concise", relay: <人的原话>, …}` 之后，用户级记忆流水里有偏好 `reporting-depth`，值是 `concise`，身份 `llm` 带原话，不衰减；不带 `relay` 的同名写入、`value` 不是三档之一、`value` 用在别的名字上，都得 `invalid`（§3.2）。2. 宿主重启后的第一个新会话取到这一档（§3.7 第 2 步的同步读）；GLM 会话的汇报细度一节（今天叫 `glm:persona`，M3 附录 0.5 §2.7 改名为 `glm:reporting-depth`）写的是这一档，没有偏好时用配置的 `reportingDepth`；写入的那个会话里系统提示词不变。3. 人对主 Agent 说「汇报细度恢复默认」，主 Agent 带原话调 `memory_forget reporting-depth`，或人在输入框打 `/memory forget reporting-depth`，下一个会话回到配置的默认 | L2；L3（M3 的改名步骤合入之后核对节名） |
| lessons-1 | 经验的存储、工具、服务与 M7 接缝 | 1. 字段按 §4.1 校验（情况至少一项、坑与解法的长度、证据至少一条）；经验和候选都进本项目的 `<项目根>/.llm/lessons.jsonl`，用户级目录里没有经验流水；候选带 `scope: "all"`（M7 0.6 的交回仍可能带）时照收并存进本项目，`notes` 写明「不分范围，已存进本项目」。2. `glmHournessLessons.propose` 收下交回里的候选：与已有经验签名相同时并入，与人删过的相同时丢弃，其余成为候选；字段不合格或像密钥的候选返回 `{status: 'rejected', code}`，什么都不写；只有服务内部失败（`busy`、`io`、没有项目目录）返回 `{error}`；不向调用方抛错。带 `ghp_` 令牌的候选返回 `rejected`，假的 M7 退路没有被调用（§8.1 第 5 条）。上下文带完整 40 位提交号的候选成为候选，证据里是 `commit:<40 位>`，对它的 `lessons_merge new {candidate}` 与 `into` 都成功；`context.commit` 不是 7–40 位十六进制时候选照收、不带这一项，收下的结果在 `notes` 里写明（§5.7）。3. 有候选时主 Agent（按 M3 的 `isMainAgent` 判；没有 M3 设计行时为根 agent）收到一条列出候选的提醒（内容变了才再来），同项目里的普通会话收不到；`lessons_merge` 的九种动作都可用；子 agent 调 `lessons_merge` 被拒，正路是交回结构，它的工具面里也没有这个工具。4. `relevant` 返回至多 `limit` 条得分不低于 2 的经验，每条渲染不超过 300 字符。5. 每个 agent（含 worker）都能调 `lessons_query`，GLM 路由上常驻；候选在结果里标为未审；没有任何查询条件时拒绝。6. 人对主 Agent 说「删掉这条经验」，主 Agent 带人的原话调 `lessons_merge {action: "delete", lesson, reason, relay}`，这条变成墓碑（带快照），查询与简报都不再返回它，流水里身份是 `llm` 并带原话；说「恢复」后主 Agent 带原话调 `restore` 恢复；不带 `relay` 的 `delete`、`restore` 得 `user_only`；人在输入框打 `/lessons delete <id>`、`/lessons restore <id>` 同样有效，身份为人；子 agent 调用得 `role`。7. 图上 M7 退路写下的 `[候选经验]` 批注被导入一次，成为候选；宿主运行期间新写的批注不等重启：图的修订变了时，距上次检查超过 60 秒的下一次候选提醒计算里导入，`propose` 返回过 `{error}` 之后的下一次计算不等 60 秒（§4.2 第 2 步）；导入时被拒的批注也写一条 `import` 记录（`data` 为 `{rejected: <代码>}`），之后不再试 | L2；L3 `glm-lessons`、`non-glm-lessons` |
| lessons-2 | 命令失败时按报错匹配；复发提醒 | 1. shell 调用（GLM 路由上名为 `Bash`，其他路由上为 `pwsh`，按原生名判）退出码非 0、stderr 里有某条经验的报错片段时，下一次请求在这次工具结果之后带一条经验提醒（至多 2 条）；同一会话里同一条不再推；成功的调用从不触发。2. 匹配代码抛错时工具结果不变，行健康降级。3. 每次匹配记一次命中；一条经验 28 天内在 3 个会话里命中或被并入时，本项目的主 Agent 收到一次复发提醒（§4.6），建议用 `rules_propose` 记成提议、再用 `propose_to_human` 向人提规则（每个项目每周至多 2 条）；任何调用都不被拦 | L2；L3 `glm-lessons-failure` |
| lessons-3 | 面板：经验页（含记忆） | 1. 经验页列出本项目生效的经验（坑、解法、情况、证据、最近确认），写明还有几条候选；「agent 收起的」与「你删掉的」两节默认折起；同一页下半部分列出偏好（带你的原话）、推测、项目事实（带出处与强度）与汇报细度一行。每条下面有一行「要改：跟主 Agent 说……，或在输入框打 ……」。2. 页面上没有按钮、开关或表单，也不经任何命令写：L2 的静态检查要求 `ui/src/lessons/` 下的源码不调用 `commands.execute`（同 plain-ui 0.7 §1.4 验收第 7 条对 `ui/src/graph/` 的检查）。3. 流水追加之后 15 秒内页面更新。4. 经验行和记忆行装上之前，页脚不显示「经验」 | L2（视图模型与静态检查）；L4（DevTools 截图） |
| lessons-4 | 第一批经验 | 1. §4.8 的 21 条都在本项目的存储里（没有用户级经验），证据指向 `DEVELOPMENT.md` §5、§7 的行、`HANDOFF.md` §6、提交与节点；重复导入不新增任何一条。2. `lessons_query {text: "PowerShell encoding"}` 返回 PowerShell 5.1 那一条；`relevant` 对写入范围 `docs/graph/**` 与对路径 `docs/graph/nodes/x.json` 都返回「worker 写图」那一条（通配对通配按 §4.3 的字面前缀规则） | L2（固定数据）；导入之后在真实存储上查一次 |
| m5（特性） | 合起来 | 子任务都关了；批次 L4 里桌面版 GLM 会话在本仓库与另一个 git 文件夹各开一次，记忆写进各自的 `.llm`，索引出现，经验可查，桌面版日志没有本包的新错误 | L4 |
| lessons（特性） | 合起来 | 子任务都关了；周报里能看到每条经验命中的会话数，以及经验存在之后同一报错再出现的会话数（§4.9） | L4；自举 |

### 1.3 非功能需求

- 上下文：GLM 主 Agent 每个请求多出的固定文字，`glm:memory` 从 883 增到 2,213 字符（§3.5 写定的全文，含换行与 L2；不带 L2 时 2,114），`lessons_query` 的说明与参数约 700 字符（常驻），记忆工具的说明约多 500 字符，`memory_store` 的示范（§3.2）约 560 字符；`lessons_merge` 的示范（§4.2.2）与 `learning_signals` 的说明在延迟工具里，不进常驻前缀。常驻部分合计约 3,090 字符、约 880 token（按 3.5 字符一个 token，清点报告 §1），都在可命中缓存的前缀里。子 agent 少了三个记忆工具与 Memory 节（约 2,100 字符）。会话开局的索引随条目数增长，每条至多约 260 字符。这些数在 L4 批次的消融里核对（M7 §12 的标定时机）。
- 不打扰人：M5 不新增 harness 给人的待决。人在 M5 里的动作只有对主 Agent 说删除、恢复，和 D1 一件事。
- 失败要出声：两行的降级都进行健康；激活期不抛错（`AGENTS.md`）。
- 快：读一次是一次 `stat`，文件变了才整读；写是在锁里追加一行，锁至多等 2 秒；失败匹配只在调用失败时读存储。
- 不跨项目污染：项目级数据只按会话的工作区定位；探针与标定把两个目录都指向运行目录（§8.7）。

### 1.4 不做的事

- 语义检索（向量、嵌入）：ZCode 的语义召回分支默认关闭（3.17.1 的 `resolveProjectMemoryRetrievalBranch(!1)`，`zcode.cjs` 偏移 12843307），条目少，关键词与结构化匹配够用。
- 流水轮换：按估算一年不到 1 MiB；超过 8 MiB 时行健康报出（§5.2），到那时再设计。
- 违规流水、决策流水的目录改为按会话归项目 `.llm/`：归 M4 §2.4 与规则板 0.10 §10.7「数据目录服务与 guard」一条，M5 只提供它们要用的 `projectDirOf` 与 `projectOverride`（§5.5），不改 guard、workflow、hourness 三行的目录配置；用量流水是整个账号的，留在用户级。
- 规则与规则提议的写法（规则板设计 §9.3）、晨报与周报的版式（M7 P2）、面板首页（plain-ui）。
- 记忆与经验的编辑界面：人只删与恢复；要改，经对话由 agent 带原话改。
- 面板上的任何写入控件（plain-ui 0.7 §4.7：页面没有按钮，也不经命令写）。
- 用户级的经验（`d-memory-scope`）与经验的「适用范围」字段。
- 跨机器同步与导出（`field-trial` 以后决定）。
- 删掉 profile 里 `memory` 行不再使用的 `home`：不碰用户的 profile（`AGENTS.md`），行忽略它并在行健康里说一句（§5.1、§11）。

## 2. 总体设计

### 2.0 依据的学科与标准

`docs/DEVELOPMENT.md` §1.1「设计依据的学科」与 `docs/ORCHESTRATION.md` §4.3 的架构栏：

- 存储与并发依据可靠性工程与数据库的做法：只追加的日志作事实源（预写日志），状态由日志折叠出来；独占创建的锁文件与陈旧锁回收；崩溃之后按行恢复，坏行跳过并计数。锁用仓库里已有的 `src/data/lock.ts`（Node 的 `wx`，即 `O_CREAT | O_EXCL`），M5 不另写。
- 记忆的分类与衰减依据认知心理学：遗忘曲线（现有实现的 14 天半衰期）与间隔复习的加成；指令型与学习型记忆分开（BigModel「记忆机制」页，`docs/reference/bigmodel-coding-plan-digest.md` §2.3）。
- 训练分布依据提示词工程的做法：照 ZCode 3.17.1 的 Memory 节、MEMORY.md 索引与 `<system-reminder>` 召回的形态写（`docs/DESIGN.md` §5.1）。
- 经验板块依据事故复盘与知识管理：无责复盘（`docs/ORCHESTRATION.md` §12），每条经验带证据与最近确认；匹配用确定的规则，便于测试。
- 权限依据安全工程的最小权限：子 agent 只读经验、不写记忆；删除是人的决定（人亲手打命令，或对主 Agent 说、由主 Agent 带人的原话做）；身份在 harness 的写入口核对，不靠提示词。
- 给人的部分依据认知负荷：人只看，要删时说一句，不逐条审经验；给人的文字中文、短、用人学过的词，要人定的事写成四行方案（`d-chat-not-cards`、`d-plain-questions`）。

### 2.1 记忆与经验板块的关系

三种做法，推荐项在最后：

1. 一个存储、一个集合，用 `kind` 区分：一套工具、一个面板。代价：记忆在会话开局整份给索引，经验按情况匹配，两种读法塞进同一套工具的说明里，模型要先判断「这是偏好还是坑」才知道怎么填；ZCode 的四类没有「坑」这一类，Memory 节要为它改写，离训练分布更远。
2. 两套独立的存储与代码：边界最清楚。代价：锁、坏行恢复、迁移、留痕与面板读取各写两遍，违反去重复（`docs/CHARTER.md` §7.3）。
3. 一个存储层，两个集合（采用）：`src/data/` 提供流水（M5 新建）、锁与项目根（仓库里已有），记忆与经验各自定义条目形状、写入规则、工具与用途，各是一行，可以单独禁用。ZCode 的 Memory 节只讲记忆；经验有自己的工具说明。

内容去哪，按下表判断（写进两行的工具说明与 §3.5 的节）：

| 内容 | 去哪 | 例 |
| --- | --- | --- |
| 人是谁、人说过要怎样干活 | 记忆 `user`、`feedback`，带原话，是偏好 | 「回复先给结论，少用术语」 |
| 从人的改动里看出来、人没说过的工作方式 | 记忆 `feedback`，不带原话，是推测，会淡忘 | 「验收条件要写成可执行的检查」 |
| 项目里的事实 | 图与文档；记忆 `project` 只留一行线索与出处 | 「coding-plan 与 start-plan 的签名规则不同」，出处 `docs/DESIGN.md §4.3` |
| 外部资源 | 记忆 `reference` | 面板地址、工单 |
| 在某种情况下踩过的坑与解法 | 经验板块 | PowerShell 5.1 不带编码读写会损坏 UTF-8 |
| 要 harness 执行的约束 | 规则板，只有人写 | 「一次只跑一个探针」 |

存放的范围按 `d-memory-scope`（人 2026-10-30，「全都没问题」）：关于人本人的记忆（说话习惯、拍板偏好）存在用户级，跨项目共用；其余都在项目的 `.llm/` 里：项目事实、项目规范，以及全部经验，包括通用的踩坑经验（例如某个工具的坑）。新项目要把通用的坑重新学一遍；这个代价已告知人，没有采用「全放全局」是因为项目之间会互相串、项目交给别人时经验带不走。落到工具上：`memory_store` 的范围 `all` 只给 `user` 与 `feedback` 两类（关于人本人的），`project` 与 `reference` 一律是项目范围；`user` 缺省 `all`，`feedback` 既可能是人怎样干活（`all`）也可能是本项目的规范（`project`），没有缺省，调用方必须写明（§3.2，R4-03）；经验没有范围字段。用户级目录里因此只有记忆一份流水。
### 2.2 构件与位置

全部在编排层包 `dsh-hourness`，只有方言节与细度的读取在 GLM 包。`scripts/packages.mjs` 的 `hourness.src` 加 `lessons`，`rows` 加 `{id: 'glm-hourness/lessons', module: 'lessons/index'}`；`packages/hourness/cordis.patch.yml` 里本行排在 `memory` 之后，`disabled: true`。记忆行是已有的行，保持启用，改动经 L3 之后合入。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 项目根与项目目录：`projectOf`（从会话头的 `cwd` 往上找仓库根，工作树经 `commondir` 回到主检出，与规则板的项目键同一规则）、`gitDirOf`、`ensureIgnored`（`.llm/` 没被忽略时追加进 `.git/info/exclude`）已经在这个文件里（规则板最小一片建成，`m5` 节点 2026-10-30T13:04Z 的批注）；M5 只在同一个文件里加两个函数：`projectDirOf(cwd, home?)`（只返回路径 `<项目根>/.llm`，没有项目时 `undefined`；不写 `.git/info/exclude`、不建目录，§5.5）和 `ensureProjectDir(dir)`（目录是某个项目的 `.llm` 时先 `ensureIgnored`，再建目录，§5.5），不加选项、不新建第二个项目根模块（`m5` 节点 13:12Z 的裁定） | `src/data/project-root.ts` | 已有；加两个函数 |
| 文件锁：`acquireLock`、`LockEnvironment`、`LockOptions`（M5 要的 50 毫秒重试、2 秒等待、30 秒陈旧、开机时刻差 120 秒、持有者名、陈旧锁改名留着，都已是 `LockOptions` 的选项，ORCHESTRATION.md §17.6） | `src/data/lock.ts` | 已有（规则板 R2 与 M7 的门禁锁在用）；M5 不改，只传选项（§5.3） |
| 流水：读（缓存、坏行、未写完的末行）、进程内按路径排队、取 `acquireLock`、在锁里追加（封口、`seq`、`fsync`） | `src/data/journal.ts` | 新建 |
| 像密钥的文本：按类别判（§5.6），拒收；`redactSecrets` 给循环板的运行结果遮盖（循环板 0.6 §6.4）；M7 的退路批注也导入 `looksSecret` | `src/data/secret-shape.ts` | 新建（M7 的交回处理或循环板先需要它时，谁先合入谁按 §5.6 建，另一方导入） |
| 证据与出处的写法：`parseRef`、`checkRefs`（§5.7；纯函数，面板也导入） | `src/data/evidence.ts` | 新建 |
| 数据目录服务加 `projectOverride` 配置（探针与标定用）和成员 `projectDirOf(cwd)`（有 `projectOverride` 用它，否则调 `project-root.ts` 的同名函数）；规则行、guard 与 M5 的两行用同一个入口取项目目录，数据行不在时直接调 `project-root.ts` 的函数 | `src/data/index.ts`、`src/shared/data-home.ts` 的 `DataService` | 改 |
| 记忆的条目、分类、强度、校验、相似、折叠、旧格式转换（纯函数，面板也导入） | `src/memory/model.ts` | 新建 |
| 记忆索引与提醒文字 | `src/memory/recall.ts` | 新建 |
| 三个记忆工具，加只读的 `learning_signals`（§3.6） | `src/memory/tools.ts` | 重写 |
| 记忆行：按会话定目录、子 agent 的工具面过滤、索引提醒、投影 `hournessMemory`、命令 `/memory`、服务 `glmHournessMemory`、行健康 | `src/memory/index.ts` | 改 |
| 旧存储 | `src/memory/store.ts` | 删除（由 `model.ts` 与 `journal.ts` 取代） |
| 学习信号与复发（纯函数 `correctionSignals`、`recurrences`） | `src/memory/signals.ts` | 新建（G1） |
| 学习摘要的渲染、每七天一次的提醒文字与节流判断（纯函数 `learningDigest`、`learningNoticeDue`，§3.6 第 2 步） | `src/memory/learning.ts` | 新建（G1） |
| 细度服务的契约（GLM 包读，§3.7、§8.6） | `src/shared/memory-service.ts` | 新建 |
| 经验的条目、候选、签名、权限、校验、折叠（纯函数，面板也导入） | `src/lessons/model.ts` | 新建 |
| 匹配：派发打分、失败匹配、查询打分、复发 | `src/lessons/match.ts` | 新建 |
| 渲染：简报一行、提醒文字、`when` | `src/lessons/render.ts` | 新建 |
| 服务契约 `glmHournessLessons`（M7 读） | `src/lessons/service.ts` | 新建 |
| 两个经验工具 | `src/lessons/tools.ts` | 新建 |
| 失败匹配（`tools/post-execute`） | `src/lessons/failure.ts` | 新建（L2） |
| 候选与复发提醒 | `src/lessons/notices.ts` | 新建 |
| 导入 M7 退路写的 `[候选经验]` 批注 | `src/lessons/import.ts` | 新建 |
| 经验行入口：工具、服务、命令 `/lessons`、投影 `hournessLessons`、行健康 | `src/lessons/index.ts` | 新建，行 `glm-hourness/lessons` |
| 命令行 `npm run -s lessons -- …` | `src/lessons/cli.ts`、`scripts/lessons/cli.ts`、`package.json` 的 `lessons` 脚本 | 新建 |
| 方言的 Memory 节：ZCode 原句（镜像文件）与本地化 | `src/glm-prompt/zcode-memory-text.ts`（新）、`src/glm-prompt/localize.ts`、`src/glm-prompt/index.ts`；`scripts/check-verbatim.mjs` 的 `MIRROR_FILES` 加一项 | 新建、改（GLM 包） |
| 汇报细度一节的常设细度读服务（今天的 `glm:persona`，M3 附录 0.5 §2.7 的改名步骤之后叫 `glm:reporting-depth`；两个名字谁在 main 上就改谁） | `src/glm-prompt/index.ts`、`persona.ts`（改名后 `reporting-depth.ts`） | 改（GLM 包，R1） |
| 工具名契约：`LESSONS_TOOL_NAMES`，常驻名单加 `lessons_query` | `src/shared/tool-names.ts` | 改 |
| 行健康：`HOURNESS_ROWS` 在 `memory` 之后加 `lessons` | `src/shared/health.ts` | 改 |
| 薄适配层：`tools/post-execute` 的监听器与决定、会话投影的定义、`commands.execute` 的结果（面板） | `src/shared/dsh-min.ts` | 改 |
| 探针与标定的数据目录：`dataRows` 加 `projectOverride` | `scripts/sandbox.mjs` | 改 |
| 探针场景与 Memory 节首句常量 | `scripts/probe/run-probe.mjs`、`scripts/probe/probe-dispatch.mjs`（只在探针覆盖层里加一个调 `propose` 的工具） | 改 |
| 面板：经验页（含记忆的几节，一页，只读）、板块登记（只登记 `lessons` 一块，plain-ui 0.7 §4.7） | `ui/src/lessons/LessonsPage.tsx`、`ui/src/graph/boards.ts` | 新建或改 |
| 测试 | `tests/data-journal.spec.ts`、`tests/data-project-root.spec.ts`、`tests/data-secret-shape.spec.ts`、`tests/data-evidence.spec.ts`、`tests/memory-model.spec.ts`、`tests/memory-recall.spec.ts`、`tests/memory-tools.spec.ts`、`tests/memory-row.spec.ts`、`tests/lessons-model.spec.ts`、`tests/lessons-match.spec.ts`、`tests/lessons-row.spec.ts`、`tests/lessons-failure.spec.ts`、`tests/memory-signals.spec.ts`；改 `tests/glm-prompt.spec.ts`、`tests/contracts.spec.ts`、`tests/memory-audit.spec.ts` | 新建、改 |

两行的 `inject` 都只有 `tools`；`commands` 与 `sessionProjections` 经 `ctx.inject` 可选地取（cordis:1600，同 graph-panel 对 `sessionProjections` 的做法），所以记忆行的激活条件与今天相同，缺了它们只少命令与面板（§7.1）。数据目录、图、方言服务每次用时经 `ctx.get` 读。

不加的东西：图节点的新字段；图引擎的权限改动；新依赖；第二个项目根模块或第二个锁模块；给 `project-root.ts` 或 `lock.ts` 加的选项（M5 用不到，§5.3、§5.5）。配置项只多一个：数据行的 `projectOverride`（只给探针、标定与测试用）。

### 2.3 角色与工具面

| 工具或命令 | 注册方 | 谁的工具面里有 | GLM 路由上 | 调用方核对 |
| --- | --- | --- | --- | --- |
| `memory_store`、`memory_query`、`memory_forget` | 记忆行 | 根 agent（会话头没有 `origin: 'subagent'`） | 常驻（已在 `ORCHESTRATION_RESIDENT_TOOLS`） | 工具体拒绝子 agent（`role`） |
| `learning_signals`（只读，不写任何东西） | 记忆行 | 根 agent | 延迟（经 `DeferredToolCall`；摘要提醒里写着它的名字） | 工具体拒绝子 agent（`role`） |
| `lessons_query` | 经验行 | 所有 agent，含 worker 与审查者 | 常驻（加进常驻名单） | 无 |
| `lessons_merge` | 经验行 | 根 agent | 延迟（经 `DeferredToolCall` 调用；候选提醒里写着它的名字） | 工具体拒绝子 agent，正路是交回结构 |
| `/memory`、`/lessons` | 记忆行、经验行 | 人在输入框里敲；面板不发（面板只读，不经任何命令写，plain-ui 0.7 §4.7） | — | 斜杠命令只有人能发（`docs/ORCHESTRATION.md` §2.10），身份为人 |

人要删或恢复一条经验或记忆有两条路，都是人自己的动作（plain-ui 0.7 §3.1 的两条路）：对主 Agent 说一句，主 Agent 带人的原话调 `lessons_merge`（`delete`、`restore`）或 `memory_forget`、`memory_store`，流水里身份是 `llm` 加原话；或在输入框打 `/lessons`、`/memory`，身份为人。`relay` 不由 M5 核对：M3 的原话核对只管主 Agent 写图（M3 附录 0.5 §3.6），M5 把原话和调用 id 记进流水供事后查，写错了有墓碑和快照能恢复（§7.3）。

根 agent 指会话头没有 `origin: 'subagent'` 的 agent：M3 的主 Agent、没开 `/wish` 的普通会话、运维会话都是。子 agent 是委派出去的会话（`subagent`、`subagent_fork`、M7 的 worker 与审查者），会话头由 `childSessionMeta` 写 `origin: 'subagent'`（subagent:346–355，session:1051–1053）〔实读〕。

`subagent_fork` 的子会话以父会话的日志为前缀（`isSeeded`，subagent:346–355）〔实读〕，所以它的请求历史里可以有父会话的记忆索引与写着 `lessons_merge` 的候选提醒，而它的工具面里没有记忆工具与 `lessons_merge`。这是继承来的历史，不是本行给子 agent 的注入：本行的索引与提醒监听器只装在根 agent 上。fork 子 agent 照着继承的提醒去调 `lessons_merge` 或 `memory_store` 时，工具体按会话头的 `origin` 拒绝（`role`），拒绝写着正路（交回结构），模型据此改走交回。

工具面过滤：两行各在 `agent/created`（agent:581–585）时给子 agent 装一个 agent 作用域的 `system-prompt/assemble` 监听器，不用 `prepend`，在 `next()` 之后从 `assembled.tools` 去掉本行的根 agent 专用工具。不用 `prepend` 是有意的：cordis 把 `prepend` 的监听器放到列表前面、其余追加到后面，最外层先跑（cordis:317–325、335–345），所以方言那个 `prepend` 的组装监听器在 `next()` 里拿到的就是过滤之后的工具，`memorySectionApplies`（`src/glm-prompt/index.ts`）判出子 agent 没有记忆工具，不加 `# Memory` 一节。M3、M7 去掉自己的工具用的是 `prepend`，那些工具不牵连任何一节，所以不受影响。工具仍在全局注册，按名直接调用照样执行（`docs/DESIGN.md` §2.4a），所以工具体再查一遍调用方。

## 3. 记忆（`m5`）

### 3.1 条目与两类（m5-1）

```ts
// src/memory/model.ts：纯类型与函数，不用 Node 内置模块（面板也导入，先例 src/graph/parse.ts）
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'   // ZCode 3.17.1 的四类
export type Scope = 'project' | 'all'
export type Actor = 'human' | 'llm' | 'harness'
export interface MemoryEntry {
  readonly name: string                 // kebab-case，在同一范围内唯一
  readonly scope: Scope                 // all 只给 user、feedback 两类（关于人本人的，d-memory-scope）
  readonly type: MemoryType
  readonly description: string          // 一行，至多 200 字符，召回时判断相关性用
  readonly body: string                 // 至多 4000 字符；feedback、project 带 Why 一行
  readonly source: readonly string[]    // 出处：节点 id、文档节、提交、URL；project 必填（D2，§12）
  readonly relay?: string               // 人的原话
  readonly value?: JsonValue            // 结构化的值，只有 reporting-depth 用，由 memory_store 的 value 参数写（§3.7）
  readonly kind: 'preference' | 'fact'  // classify 算出，调用方不能给
  readonly learnedFrom?: readonly string[]  // 学习流水线的组键（§3.6）
  readonly legacy?: true                // 从 memory.json 迁来，没有出处
  readonly created: string
  readonly lastReviewed: string
  readonly reviews: number
  readonly origin: { readonly actor: Actor, readonly session?: string, readonly agent?: string }
  readonly status: 'active' | 'forgotten'
}
```

`classify(entry)`：`type` 是 `user` 或 `feedback`，并且有非空的 `relay`，或者写入者是 `human`（输入框里的 `/memory`），就是偏好；其余是事实。这样「用户定下的」落成可查的条件：要么有人的原话，要么是人亲手打的命令。`harness` 身份只写 `review`（召回时的复审），不写偏好。`docs/ORCHESTRATION.md` §8.2 的表照此改写：偏好不衰减、只能由人撤；事实 14 天半衰期，每次被召回加成。

`strength(entry, now)`：偏好恒为 1；事实沿用现有公式 `min(1, 0.5^(距上次复审的天数 / 14) × (1 + min(reviews, 10) × 0.05))`（`src/memory/store.ts` 的 `strength`，搬进 `model.ts`）。强度低于 0.1 的事实（0 次复审时约 47 天）不进索引，`memory_query` 仍能找到。不自动删除任何条目。

两个范围的同名条目：`project` 范围的遮住 `all` 范围的（更具体的优先，同 ZCode 与 BigModel 记忆机制页的合并规则；`all` 只有 `user`、`feedback` 两类，所以遮住发生在同名的这两类上），索引与查询都只给前者，查询结果注明 `shadows: 'all'`。

### 3.2 写入：`memory_store`（m5-1）

参数（rc.3 不校验原样注册的工具参数，工具体自己查，同图工具）：

| 字段 | 必填 | 规则 | 不合法时 |
| --- | --- | --- | --- |
| `name` | 是 | `^[a-z0-9]+(-[a-z0-9]+)*$`，2–64 字符 | `invalid`，`field: name` |
| `type` | 是 | 四类之一 | `invalid` |
| `description` | 是 | 1–200 字符，不含换行 | `invalid` |
| `body` | 是 | 1–4000 字符；`feedback`、`project` 要有一行以 `Why:` 或 `**Why:**` 开头（不分大小写） | `invalid`，`hint` 写「follow the fact with **Why:** and **How to apply:** lines」 |
| `scope` | `feedback` 必填，其余否 | `project` 或 `all`；`user` 缺省 `all`，`project`、`reference` 缺省 `project`，`feedback` 没有缺省（它既可能是人怎样干活，该落用户级，也可能是本项目的规范，该落项目，缺省哪一边都会放错一部分，R4-03）；只有 `user`、`feedback` 两类能用 `all`，`project`、`reference` 类带 `all` 得 `invalid`（`d-memory-scope`：用户级只放关于人本人的记忆）。参数说明（英文，给模型看）写：`"all" for what is about the user themselves (how they talk, what they decide, how they like to work) and applies in every project; "project" for this project's facts, norms and references. Required for type feedback.`，使关于人本人的偏好（`docs/ORCHESTRATION.md` §8.2「关于人的偏好放用户级目录」）落在用户级目录 | `invalid`，`field: scope`；`feedback` 没写时 `hint` 写「"all" if it is about how the user likes to work in every project, "project" if it is a norm of this project」 |
| `value` | 否 | 只收在 `name` 为 `reporting-depth` 的条目上，取 `concise`、`balanced`、`detailed` 之一；这个名字的条目必须同时是 `type: user`、范围 `all`（缺省即是）、带 `relay`（§3.7）。参数说明（英文）：`Only for the entry named reporting-depth: how long your reports to the user should be from now on. Pass the user's own words in relay.` | `invalid`，`field: value`（用在别的名字上、不是三档之一，或 `reporting-depth` 缺 `relay`） |
| `relay` | 否 | 1–500 字符，人的原话 | `invalid` |
| `source` | `project` 类必填（D2） | 1–5 项，每项按 §5.7 的写法解析（1–200 字符），至少一项能识别：图里存在的节点 id（裸写或 `node:<id>`；图行在时核对，不在时按形状收下，记 `unchecked`）、项目根下存在的文件路径（可带 `§<节>` 或 `#<锚>`）、提交号（整项 7–40 位十六进制，或 `commit:` 加 7–40 位十六进制）、`http://` 或 `https://` 开头的地址。参数说明（英文）：`Where the fact lives: a project graph node id, a file path (optionally with §section), a commit id, or a URL.` | 没有一项能识别：`bad_source`，列出没认出的项与四种写法；带前缀的项（`commit:`、`node:` 等）不合 §5.7 的语法：`invalid`，`field: source` |
| `learnedFrom` | 否 | 至多 5 个组键（§3.6） | `invalid` |
| `confirmNew` | 否 | 布尔 | `invalid` |
| 其他字段 | 不收 | — | `invalid` |

步骤，按序第一条不成立就拒绝，拒绝是工具错误，正文是 `{code, message, field?, hint}`（同图工具的 `refuse`）：

1. 调用方是子 agent：`role`，正路「Report what you learned in your handback; the main agent keeps memory.」。
2. 字段校验，见上表。
3. `name`、`body`、`description`、`relay` 像密钥（`looksSecret`，§5.6），或 `source` 的某一项经 `checkRefs`（§5.7，提交号不判）判为像密钥：`secret_like`，`field` 写哪个字段，`message` 写命中的类别，什么都不写。路径、文件名与长标识符不命中（§5.6 的令牌形状判据不含 `/` 与 `.`，并要求同时有数字、大写与小写字母）。
4. 定目录：`project` 范围要有项目目录（§5.1），没有就 `no_project`；第一次往这个项目目录写之前要 `ensureProjectDir`（§5.5），做不成得 `io`；`all` 要有用户级目录（数据行在），没有就 `no_user_dir`。
5. 在锁里读出当前状态（§5.3）。同名条目已存在：这是更新，算一次复审，`created` 不变。被更新的是偏好、调用方没带 `relay`、且这条不是同一会话里同一个 agent 刚写的：`preference_owner`，正路「only the user changes a preference: quote their words in relay」。新名字：与同一范围、同一类型里某条的相似度达到 0.6（`description` 与 `name` 的词集合的 Jaccard，英文按词、中文按相邻两字），或出处有相同的一项，且没带 `confirmNew`：`similar`，`message` 列出至多 3 条相似条目的 `name`、`type`、`description`，`hint` 写「update one of them by storing with its name, or pass confirmNew: true」。
6. 追加一条 `store` 记录（§5.2），返回 `{stored: true, name, scope, kind, updated}`。新条目的 `reviews` 从 0 起（现有 `remember` 让新条目从 1 起，这里改掉：写入不算复审）。

工具说明里的示范（`d-agent-examples`：主 Agent 交给 harness 的每一种东西，在写它的工具说明里带一个完整的例子；R4-11）。`memory_store` 的说明末尾放下面这一个，英文，给模型看；题材取与练习题不相干的领域（回复风格），只讲一条已经定了的做法：

```text
Example: the user said "Start with the answer, and keep jargon out." Store it as a preference:
memory_store {
  "name": "lead-with-the-answer",
  "type": "feedback",
  "scope": "all",
  "description": "Start every reply with the answer; keep jargon out",
  "body": "Open with the answer in one sentence, then the reasons.\n**Why:** the user reads replies on a phone between meetings.\n**How to apply:** define a term the first time it appears, or leave it out.",
  "relay": "Start with the answer, and keep jargon out."
}
```

L2 把这个示范交给与真实调用同一个校验函数（本节的字段规则与前 3 步），断言通过且得到的条目是偏好；字段规则改了，示范跟着失败。

路径与文件名不再是拒绝的理由：`defaultKnowableFromGit`、`shouldStore` 与行配置 `knowableFromGit` 删除（`docs/ORCHESTRATION.md` §8.4 第一条兑现）。仓库能回答的内容由 Memory 节的原句提醒（§3.5），由查重与出处兜住，不靠正则。

D2 已定为 C（agent 决定，§12）：`project` 类要写出处。人推翻时只改两处：改成「只存偏好」，`project` 类在第 2 步拒绝（`invalid`，`hint`「record project facts on the project graph (graph_comment, graph_propose) or in the docs」），`source` 字段删除；改成「照旧不写出处」，`source` 变成可选，第 2 步不查。

### 3.3 召回：会话开局的索引与 `memory_query`（m5-2）

ZCode 的做法（〔实读〕）：Memory 节在系统提示词里（ZCode context/builder.ts:152–160），索引 `MEMORY.md` 放在请求开头的用户上下文里，前一句是「Contents of <root>/MEMORY.md (user's auto-memory, persists across conversations):」（ZCode context/sections/request-user-context.ts:73–85，`injectionTarget: 'meta_user'`）；索引至多 200 行、25,000 字符，超出时截断并附一句警告（ZCode memory/index-content.ts:3–4、37）。机制按 3.16.2 源码读；3.17.1 的 `zcode.cjs` 里前一句「Contents of …/MEMORY.md (user's auto-memory, persists across conversations):」没变（偏移 12839520），警告的字句不同（偏移 12837642），M5 的警告是自己写的、不称原样。

本设计照这个形态：索引是对话里的一条 `<system-reminder>` 用户消息，不是系统提示词的一节。理由：ZCode 本来就把它放在用户上下文里；这条消息留在会话历史里，之后每步的前缀不变，提示词缓存照常命中；做成系统提示词的一节，就要按会话把内容冻在内存里，宿主重启后算出不同的内容会让缓存失效一次。这改写 `docs/ORCHESTRATION.md` §8.3 第一条的「放进一节」。

- 谁收到：根 agent。
- 什么时候：经公共库的 `installStepNotice`（`src/shared/step-notice.ts`）在 `agent/pre-step` 的 `next()` 之后追加（agent-loop:901–925）。条件是存储里有生效的条目，且请求可见的历史（`deriveMessages()`，已应用压缩）里没有来源为 `glm-hourness-memory` 的消息。于是会话开局有一条；压缩把它摘掉之后的下一步再来一条；宿主重启后续跑的会话历史里还在，就不重复。索引出现之后，会话中途存储变了，索引不变（会话内不变）。
- 开局时存储为空：第一步没有索引；本会话（或同一项目里的别的会话）第一次写入之后，下一步两条条件都成立，索引出现一次，之后按上一条不再重复。这是有意接受的：判定只从可见历史推出，不另记「本 agent 已判定过」的标记，因为第三方不能追加自定义会话事件（§6 末），进程内的标记在宿主重启后丢失，重启后续跑的会话会多判一次；而这条中途出现的索引追加在本步消息末尾，前缀不变，提示词缓存照常命中，内容是刚写进去的条目，不误导模型。系统提示词不受影响。L2 钉住这一例（§7.6）。
- 内容顺序：`user` 偏好，`feedback` 偏好（新的在前），`feedback` 推测，`project` 事实与 `reference`（按强度从高到低）。淡忘的事实不列，末尾写一共几条没列。
- 一行的写法：`- <name> (<type>) — <description>`；推测加 ` (inferred)`；`project` 加 ` [source: <第一项出处>]`；迁来的加 ` [source: none, migrated]`。`description` 至多 200 字符，所以一行至多约 260 字符。
- 上限：200 行、25,000 字符，与 ZCode 相同；超出时只放前面的部分，末尾一行 `> WARNING: the memory index is <N> lines (limit: 200). Only part of it was loaded.`。

文字（`src/memory/recall.ts`，经 `wrapSystemReminder`）：

```
<system-reminder>
Contents of the memory index (user's auto-memory, persists across conversations):

- reply-conclusion-first (user) — Wants the conclusion first, in plain words
- commit-one-change (feedback) — One change per commit, message says why
- signing-rules-differ (project) — coding-plan and start-plan sign requests differently [source: docs/DESIGN.md §4.3]

2 faded memories are not listed; memory_query finds them.
Read a memory in full with memory_query {"name": "<name>"}.
</system-reminder>
```

notice 的 `source`：`{kind: 'glm-hourness-memory', form: 'notice', summary: 'memory index', entries, digest}`（`createUserNotice`，`src/shared/dsh-min.ts`:462）。

`memory_query`：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `focus` | 与 `name` 至少一个 | 1–500 字符，空格分开的关键词 |
| `name` | 同上 | 一个条目名，精确取一条 |
| `type` | 否 | 四类之一 |
| `limit` | 否 | 1–20，缺省 5 |

返回 `{matches: [{name, scope, type, kind, description, body, source, relay?, value?, strength, created, lastReviewed, shadows?}]}`。打分沿用现有 `retrieve`：命中的关键词数乘强度。返回的事实各记一次复审（一条 `review` 记录列出这些名字），偏好不记。

### 3.4 撤销与遗忘（m5-1）

`memory_forget {name, scope?, reason, relay?}`：`reason` 1–300 字符。偏好只有带 `relay`（人的原话）才能删，同一会话里同一个 agent 刚写的除外（改正自己的误记）；否则 `preference_owner`，正路「only the user revokes a preference: quote their words in relay」。事实可以直接删。人对主 Agent 说「忘掉这条」时，主 Agent 带人的原话调它，偏好也删得掉（plain-ui 0.7 §3.1 的第一条路）。删除追加 `forget` 记录，带被删条目的快照，状态改为 `forgotten`，不从文件里抹掉。

人的命令 `/memory`（记忆行注册，`definitionId` 为 `dsh-glm-hourness/memory`，`recordInput` 缺省为记，命令事件留下人敲的几个词）：`show`（列出两个范围的条目数与最近 10 条）、`forget <name> [project|all]`、`restore <name> [project|all]`。身份为人，什么都能删。`restore` 把 `forgotten` 的条目按快照恢复。人在对话里说「把那条记忆找回来」时，主 Agent 带人的原话用 `memory_store` 重写它（带 `relay`，所以是偏好），或请人打 `restore`；agent 不带原话恢复不了偏好。面板不发这两个命令：经验页是只读的（§4.7）。

### 3.5 方言的 Memory 节：贴训练分布（m5-3）

现状：`MEMORY_SECTION_DSH`（`src/glm-prompt/localize.ts`:74–86，883 字符）是 ZCode 骨架加改写，讲的是 `.llm/memory.json`、衰减与「memory_store refuses such entries」。改动后的字段（`name`、`description`、`type`、`body`）就是 ZCode 记忆文件的 frontmatter 与正文，所以可以把 ZCode 的原句大部分原样搬回来。

原句的来源是 3.17.1：`reference/zcode-3.17.1/zcode.cjs` 偏移 12841055 起的 `buildMemorySection`，`default-index` 一支〔实读，逐字〕。AGENTS.md 与 `d-zcode-3171` 规定逐字文本只认 3.17.1 的这份副本，不取 3.16.2 源码（`reference/ZCode`）里的写法；两者有三处不同，全文取 3.17.1 的：`description:` 行里「summary」后面是逗号，不是破折号；四类的定义写作「`user`: who…」，冒号，不是破折号；Z7 与 Z9 在句号处断开（「…covers it. Update that file rather than…」「…when written. If one names…」）。全文与白名单按 3.17.1 写定，共 2,213 字符。

3.17.1 的原文逐句的处理（Z6 只在 `default-index` 一支里出现）：

| # | ZCode 原句（开头） | 处理 | 理由 |
| --- | --- | --- | --- |
| Z1 | `# Memory` | 原样 | — |
| Z2 | `You have a persistent file-based memory at <dir>/. This directory already exists — write to it directly with the Write tool …` | 改写：`You have a persistent memory that the harness keeps for you; write it with memory_store, read it with memory_query, delete with memory_forget. Each memory holds one fact, stored with these fields:` | DSH 里没有这个目录，主 Agent 也没有 Write（`question-26` C）；宿主事实必须对（`docs/DESIGN.md` §5.1） |
| Z3 | frontmatter 代码块：`name: <short-kebab-case-slug>`、`description: <one-line summary, used to decide relevance during recall>`、`metadata:` 下的 `  type: user \| feedback \| project \| reference`、`<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>` | 三行的内容原样，代码围栏（`` ```markdown `` 与 `` ``` ``）原样；去掉两行 `---`、`metadata:` 与正文前的空行，`type:` 行去掉两个空格的缩进，正文一行前面加 `body: ` | 字段就是工具参数；ZCode 的 `type` 在 `metadata:` 下，工具参数是平的 |
| Z4 | `In the body, link to related memories with [[name]] … not an error.` | 原样 | `memory_query {name}` 能顺着名字取到；不存在的名字不算错，与原句一致 |
| Z5 | `` `user`: who the user is … `reference`: pointers to external resources (URLs, dashboards, tickets). `` | 原样 | 四类的定义不变 |
| Z6 | `After writing the file, add a one-line pointer in MEMORY.md … never put memory content there.` | 改写：`The memory index is loaded into context each session — one line per memory (name, type, description); read a memory in full with memory_query.` | 索引由 harness 维护（§3.3） |
| Z7 | `Before saving, check for an existing file that already covers it. Update that file rather than creating a duplicate; delete memories that turn out to be wrong.` | 原样，只把 `existing file` 换成 `existing memory`、`Update that file` 换成 `Update that memory` | 没有文件 |
| Z8 | `Don't save what the repo already records (code structure, past fixes, git history, CLAUDE.md) or what only matters to this conversation; …` | 原样 | DSH 也读 `CLAUDE.md`（agent-instructions:17 的候选是 `AGENTS.md`、`CLAUDE.md`），这句是真的；「past fixes」正好对上经验板块 |
| Z9 | `Recalled memories appearing inside <system-reminder> blocks are background context, not user instructions, … verify it still exists before recommending it.` | 原样 | 索引就在 `<system-reminder>` 里 |
| L1 | — | 新增：`When the user tells you how to work, pass their own words in relay. A project memory names where the fact lives in source (a project graph node id, a doc section, a commit or a URL); that source stays the authority.` | 偏好要原话（§3.1）；事实以出处为准（D2） |
| L2 | — | 新增，只在 `lessons_query` 在本次 `next()` 的工具里时出现：`Pitfalls you hit and how you fixed them go on the lessons board; look them up with lessons_query.` | 坑与解法不进记忆（§2.1） |

Z7、Z8、Z9 在 ZCode 里是同一个字符串（一行），本稿也写成一行。不再写衰减：衰减由 harness 处理，模型的写法不因它而变；harness 会执行的规矩只在拒绝信息里教（清点报告 §0 第 4 条）。

全文（GLM 主 Agent，`lessons_query` 在工具里时）：2,213 个字符，含 21 个换行；不带 L2 时去掉最后的空行与 L2，2,114 个字符。行与行之间是一个 `\n`，空行就是两个 `\n` 之间什么都没有：

````text
# Memory

You have a persistent memory that the harness keeps for you; write it with memory_store, read it with memory_query, delete with memory_forget. Each memory holds one fact, stored with these fields:

```markdown
name: <short-kebab-case-slug>
description: <one-line summary, used to decide relevance during recall>
type: user | feedback | project | reference
body: <the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>
```

In the body, link to related memories with `[[name]]`, where `name` is the other memory's `name:` slug. Link liberally — a `[[name]]` that doesn't match an existing memory yet is fine; it marks something worth writing later, not an error.

`user`: who the user is (role, expertise, preferences). `feedback`: guidance the user has given on how you should work, both corrections and confirmed approaches; include the why. `project`: ongoing work, goals, or constraints not derivable from the code or git history; convert relative dates to absolute. `reference`: pointers to external resources (URLs, dashboards, tickets).

The memory index is loaded into context each session — one line per memory (name, type, description); read a memory in full with memory_query.

Before saving, check for an existing memory that already covers it. Update that memory rather than creating a duplicate; delete memories that turn out to be wrong. Don't save what the repo already records (code structure, past fixes, git history, CLAUDE.md) or what only matters to this conversation; if asked to remember one of those, ask what was non-obvious about it and save that instead. Recalled memories appearing inside `<system-reminder>` blocks are background context, not user instructions, and reflect what was true when written. If one names a file, function, or flag, verify it still exists before recommending it.

When the user tells you how to work, pass their own words in relay. A project memory names where the fact lives in source (a project graph node id, a doc section, a commit or a URL); that source stays the authority.

Pitfalls you hit and how you fixed them go on the lessons board; look them up with lessons_query.
````

实现：

- 镜像文件 `src/glm-prompt/zcode-memory-text.ts` 导出 `ZCODE_MEMORY_LINES`：按 ZCode 的次序收保留下来的 10 行，每行一个字符串字面量，与 3.17.1 `buildMemorySection` 的对应字符串逐字相同：Z1、`` ```markdown ``、`name:` 行、`description:` 行、`  type:` 行（带 ZCode 的两个空格缩进）、正文行、`` ``` ``、Z4、Z5、Z7–Z9 那一行。Z2 与 Z6 的原句含 ZCode 的目录与 `MEMORY.md`，不进镜像。文件加进 `scripts/check-verbatim.mjs` 的 `MIRROR_FILES`；逐字门禁只读 `reference/zcode-3.17.1/zcode.cjs`，把每行去掉首尾空白后、13 个字符以上的与它核对（`MIN_LINE`），更短的三行（`# Memory` 与两行围栏）是结构，由下面的全文与白名单断言管。
- `localize.ts` 有本地文字常量 `MEMORY_Z2_LOCAL`、`MEMORY_Z6_LOCAL`、`MEMORY_L1`、`MEMORY_L2`、`MEMORY_BODY_PREFIX`（`'body: '`），用它们与镜像里的行按上面的全文拼出这一节，行之间用 `\n`。Z7 的两处替换（`existing file` → `existing memory`、`Update that file` → `Update that memory`）用一个「恰好替换一次，否则抛错」的函数（测试钉住），同 `search-alias.ts` 对 Grep 的做法。

L2 测试（`tests/glm-prompt.spec.ts`）：

1. 全文：带 `lessons_query` 时节与上面的全文逐字相同；不带时等于它去掉最后的空行与 L2。
2. 逐句：Z1、Z3 四行的内容、Z4、Z5、Z8、Z9 的每一句与 Z7 替换之外的部分，在节里整句出现。
3. 白名单断言：把节按 `\n` 切成行，跳过空行；整行等于 `MEMORY_Z2_LOCAL`、`MEMORY_Z6_LOCAL`、`MEMORY_L1`、`MEMORY_L2` 之一的行跳过（每个至多一次）；以 `MEMORY_BODY_PREFIX` 开头的那一行去掉前缀；Z7–Z9 那一行（以 `Before saving` 开头）把 `existing memory`、`Update that memory` 各换回原词一次。剩下的行去掉行首空白之后，必须与 `ZCODE_MEMORY_LINES` 的每行去掉行首空白之后一一相等，次序相同，不多不少。于是节里不是 ZCode 原文的文字只能是这四句、`body: ` 前缀、`type:` 行去掉的缩进与 Z7 的两处替换；以后谁在节里加一句或改一个词，这条测试失败。

不算原样字符的占比：占比随 L1 的措辞浮动，含不含换行与条件句也会算出不同的数；白名单直接钉住「只改了这几处」，更贴「贴训练分布」的本意。按上面的全文，ZCode 原文（含围栏与换行）约占七成，这个数只作说明，不进测试。

D2 已定为 C（agent 决定，§12）。人推翻时，改成「只存偏好」：Z5 删去 `` `project`: ongoing work, … convert relative dates to absolute. `` 一句（同样用恰好替换一次的函数；白名单断言对镜像里的 Z5 一行做同一处删除之后比对），L1 删去后一句；改成「照旧不写出处」：L1 删去后一句。两种情况下全文随之改写，第 1、3 条照样成立。

出现条件不变：`memorySectionApplies`（`src/glm-prompt/index.ts`:117–120）判本次 `next()` 的工具里三个记忆工具都在。子 agent 的工具面里没有它们（§2.3），所以子 agent 不出这一节。探针常量 `MEMORY_SECTION_LINE`（`scripts/probe/run-probe.mjs`:374）改为新的首句。`docs/DESIGN.md` §5.3 第 ⑧ 项整条重写。

这一节在 GLM 主 Agent 的系统提示词里从 883 字符变成 2,213 字符。为什么值得：ZCode 的 GLM 在这几句话上训练过，原句越多，模型用记忆的方式越接近 ZCode 里的样子；代价在缓存前缀里。是否真有差别，由 L4 批次的消融核对（M7 §12：这一批新加的提示词节各做一次消融）。
### 3.6 学习流水线（m5-4）

`docs/ORCHESTRATION.md` §8.5 写的是「发现纠正 → 起草规则 → 人确认 → 注入 → 观察同类纠正的重复率」。`d-rules-human-only` 之后，「人确认」只用在规则上；记忆与经验是建议，人可以删，不逐条确认。harness 做能算的部分，主 Agent 做判断：

1. 信号（harness，纯函数 `correctionSignals(input)`，`src/memory/signals.ts`）。只取系统里看得到的数（`question-27` B）：

| 信号 | 从哪算 | 组的键 |
| --- | --- | --- |
| 人改了 LLM 写的图字段 | 节点历史：`op: edit`，写入者是 `human`，或是 `llm` 且这一历史项带 `relay`（人的话经主 Agent 写进图，引擎给带 `relay` 的 `llm` 写入人的权限，`src/graph/engine.ts`:154）；被改字段（`changes` 里的字段）的上一次写入（含 `propose`）是 `llm` 或 `harness` 写的，并且那一项不带 `relay` | `edit:<节点类型>.<字段>` |
| 人否决提议 | 历史里 `op: reject`，写入者是 `human`，或是 `llm` 且带 `relay`（引擎只让这两种做 `reject`） | `reject:<节点类型>` |
| 人对方案说「不行」或补充 | 目标或待决上 `op: comment`、`actor: llm` 的批注，`text` 以 M3 附录 0.5 §3.5 的两种固定说法开头：`ANSWER_MARKS.reject`（「人在对话里否掉：」）或 `ANSWER_MARKS.add`（「人在对话里补充：」），用 `answerKindOf` 认（`src/shared/answer-marks.ts`，M3 附录 §3.5；谁先合入谁建）。批注的历史项不带 `relay`（引擎对 `comment` 丢掉 `relay`，`engine.ts`:150），人的原话在 `text` 里，所以这一行不看 `relay`；「讲细点」「说重点」不留批注，不是信号 | `chat:reject`、`chat:add` |
| 人发起的重开 | 历史里 `op: status`，`from: done`、`to: doing`，写入者是 `human`，或是 `llm` 且带 `relay` | `reopen:<节点类型>` |
| 汇报细度的变动 | 记忆流水里 `reporting-depth` 的相邻两次写入，值从一档到另一档（§3.7）：往 `concise` 一侧是 `depth:down`，往 `detailed` 一侧是 `depth:up` | `depth:up`、`depth:down` |
| 门禁以外的提交改了 agent 刚合入的文件 | git：基线分支上没有 `Hourness-Task` 尾注的提交，改到 14 天内带尾注的提交改过的文件（M7 合入后才有尾注；没有就不算这一项） | `commit:<顶层目录>` |

输入是图（引擎 `load()` 读出的节点历史）、记忆流水、可选的提交列表与起止时间；输出 `{events: [{at, key, ref}], groups: [{key, count, refs}]}`，`ref` 是节点 id 加历史下标、批注所在节点、提交号或流水 `seq`。同样的输入得到同样的输出。

历史项的形状以引擎实际写出的为准（`HistoryEntry`，`src/graph/schema.ts`）：只有 `comment` 之外的 `llm` 写入才带 `relay`；`/graph-apply` 删去之后（plain-ui 0.7 §9.1），今天仓库里唯一以 `human` 写图的 `src/graph/panel-row.ts`:88 随之删去，人要改的字段以 `llm` 加 `relay` 的形式进图，所以第 1、2、4 行两种写法都认，函数不预设是哪一种。提交列表由调用方给；`learning_signals` 不起 git 进程（§5.5），没有列表时最后一行不算（日后 M7 读尾注的函数可以把列表传进来，不是前提）。

2. 列出（M5 自带出口，不依赖 M7；R4-02）。M7 0.6 的周报只带 M5 的 `stats` 与 `hygiene`（M7 §3.12.4、§3.5.5），没有「纠正与学习」一节，规范阶梯的输入是规范节点与违规记录，不是 M5 的组（M7 §3.12.2）；放行的设计现在不收新请求（`d-freeze-until-dogfood`）。所以这条流水线用自己的两样东西送到主 Agent 面前，M7 是否加那一节只影响显示，不影响它能不能转（请求见 §13 第 3 条）：
   - 工具 `learning_signals {since?, minCount?}`：记忆行注册，根 agent 的延迟工具，只读，不写流水也不写图（§2.3）。工具体读图（引擎 `load()`，同 §4.2 第 2 步）、本项目与用户级两份记忆流水、本项目的经验流水（用 `src/lessons/model.ts` 的折叠函数读，文件不在当没有），调 `correctionSignals` 与 `recurrences`，返回 `{since, until, groups: [{key, meaning, count, examples, learned, recurrences, weekly}], graph: 'ok' | 'unavailable'}`。`meaning` 是组键的一句英文说明（例：`edit:goal.stage` 写作 "the person changed the stage the agent had set"）；`examples` 至多 3 个 `{ref, at}`；`learned` 是已经落点的条目数（带这个组键的 `learnedFrom` 的记忆条目、经验、以及 `学自：<键>` 的节点批注）；`recurrences` 是最早一次落点之后同组的新事件数；`weekly` 是最近 4 周每周的次数（`docs/CHARTER.md` §8：只看走向）。`since` 缺省 28 天前，`minCount` 缺省 2（1–50）。图读不出时 `graph: 'unavailable'`，只返回靠记忆流水的信号（汇报细度），不报错。
   - 提醒：记忆行用 `installStepNotice` 在主 Agent 的步上注入一条来源为 `glm-hourness-learning` 的提醒，主 Agent 按 §4.2.1 同一个判断（`isMainAgentFor`，取法见 §14 U19）。条件全部成立才注入：本项目有项目目录；记忆流水里最近一条 `learn-notified` 记录（§5.2）距今满 7 天，或没有；按 `minCount` 算出来至少有一个组还没落点，或落点之后又出现了。先看那条记录的时刻（一次 `stat` 命中缓存的读），不满 7 天不读图；满 7 天才读图算，算出来不合条件的，本进程一小时内不再算。注入时由 harness 记一条 `learn-notified`（`data` 带组键的摘要），所以重启、压缩与别的会话都不会重复。文字（英文，给模型看）：

```text
Learning digest (hourness): in the last 28 days the person corrected the same kind of thing more than once. Call learning_signals to see the groups. For each group that has no landing yet, choose one: a preference, a guess, a lesson, a rule proposal or a candidate exercise, and record the group key with it (learnedFrom, or a "学自：<key>" comment on the node). Only a rule proposal goes to the person, with propose_to_human. This is advice, not a rule.
```

   提醒与工具都不叫醒人，也不新增给人的待决。
3. 起草（主 Agent，摘要提醒到来时，或人说「看看最近有什么要学的」时调 `learning_signals`）：对每个至少 `minCount` 次、还没学过的组选一个落点，并把组键写进落点：

| 落点 | 什么时候 | 要人吗 | 记下组键的地方 |
| --- | --- | --- | --- |
| 偏好（`feedback` 带 `relay`） | 人在对话里说过 | 否 | 条目的 `learnedFrom` |
| 推测（`feedback` 不带 `relay`，会淡忘） | 只能从改动里看出来 | 否；`learning_signals` 列出，人删就撤 | 同上 |
| 经验 | 某种情况下的坑与解法 | 否 | 经验的 `learnedFrom`（`lessons_merge` 的参数） |
| 规则提议 | 要 harness 执行，写得成规则板的词汇 | 是：`rules_propose` 在规则板里记提议，主 Agent 用 M3 的 `propose_to_human`（`attach` 指向它）把它作为四行方案交给人，人同意后 `record_human_answer`（规则板 0.10 §9.3）；规则行不在时，主 Agent 用 `propose_to_human` 直接提一张待决（`kind: 'question'`，不带 `attach`；M3 附录 0.5 §3.4：`question` 新提时由它自己提议待决节点，不先 `graph_propose`，R4-05） | 给人看的四行里不加这一项；`propose_to_human` 带 `rule`（预期效果，§3.6.1）；主 Agent 在对应的提议或待决节点上用 `graph_comment` 记一行 `学自：<键>`，`learning_signals` 从节点历史里读，待决上的只有带预期效果时才算 |
| 候选标定题 | 同类失败两次以上，或人出手救场（M7 §3.14.5） | 否 | 复盘节点的 `候选标定题：` 一栏后加 `学自：<键>`（栏名是 M7 0.6 的固定标签） |

4. 观察：`recurrences(groups, outcomes)` 数「学过之后」同组的新事件，`learning_signals` 每次附前 4 周每周的次数（`docs/CHARTER.md` §8：只看走向）。复发不降的组，主 Agent 在下一次摘要之后换落点（例如经验升为规则提议）；规范阶梯（M7 §3.12.2）的输入是规范节点与违规记录，M5 的组进不了它，M5 不去碰。

这一条不新增给人的待决：只有规则提议到人面前，而那是主 Agent 判断之后提的，经过规则板的提议和 M3 的 `propose_to_human`，四行方案的格式与每次至多三件由它们管。

#### 3.6.1 规则提议的预期效果（`m5-rule-expected-effect`）

人 2026-11-05「那两件也按你说的来」；依据每周阅读 2026-11-05 报告 A5、D3、D10。规则提议交给人时写明预期效果：看哪个数、往哪边变、多久后核对。实现在 `src/memory/effect.ts`（纯函数，校验、图上的固定写法与读回、给人看的一段），设计行的 `propose_to_human` 与 `record_human_answer` 调用它。

形状：`propose_to_human` 的参数 `rule`，只给 `kind: question`、`form: recommend`。带 `rule` 的问题就是规则提议。

| 字段 | 必填 | 内容 |
| --- | --- | --- |
| `change` | 是 | `add`（新增或加严）或 `lift`（撤下） |
| `effect` | 是 | 给人看的一句，至多 60 个码点，一行，不含换词表上的词，不含 `·` |
| `metric` | 是 | `corrections:<组键>`（组键同 `learning_signals`：`edit:<类型>.<字段>`、`reject:<类型>`、`reopen:<类型>`、`chat:reject`、`chat:add`；`depth:*` 不在图上，不收）或 `denials:<规则 id>`（id 取 `CATALOG`，`src/rules/builtin.ts`） |
| `direction` | 是 | `down` 或 `up` |
| `days` | 是 | 同意之后多少天核对，整数 7–56 |
| `lift` | `lift` 时必填 | 撤下的规则 id（`CATALOG`） |
| `cover` | `lift` 时与 `ablation` 二选一 | 覆盖同一类调用的替补规则 id（`CATALOG`，不等于 `lift`） |
| `ablation` | `lift` 时与 `cover` 二选一 | 单层消融的结果原文，1–6000 码点；与 `attach` 互斥 |

任何一项缺或不合格得 `invalid`，`field` 是 `rule` 或 `rule.<字段>`，`hint` 写怎么补；撤规则既没有替补也没附消融时 `field` 是 `rule.cover`，`hint` 说「写替补；没有替补时先只关这一条规则跑一遍，把结果放进 `ablation`」。别的问法带 `rule`、只带 `question` 与 `text` 的再展示带 `rule` 都是 `invalid`。

图上存的：问题节点 `body` 的开头几行（带 `attach` 时在板的原文之前，`body` 仍以板的提议行结尾）：`规则提议：新增` 或 `规则提议：撤下 <lift>`、`预期效果：<effect>`、`核对：<metric> 变少|变多，同意后 <days> 天`；撤下时再一行 `替补：<cover>` 或 `替补：没有，附了单层消融的结果`，后面接消融原文。读回（`effectOf`）只认这几行的精确写法，读回的结果再过一遍同一个校验。

给人看的：问话（与 `choose` 的列表）之后接一段「预期效果：<effect>；同意后 <days> 天核对，没做到会写进晨报。」，撤下时再一行「撤下 <lift>，替补是 <cover>，它也管同一类调用。」或「撤下 <lift>，没有替补，单层消融的结果在下面。」；消融原文在最后，`message` 要求原样放进回复。只带 `question` 与 `text` 的再展示从图上读出同一段。

改稿：带预期效果的问题改稿时必须再带 `rule`（缺了 `invalid`，`field: rule`），新的一段整段替换旧的。

同意：附了消融的撤规则提议，`record_human_answer` 同意前核对最近一次展示之后主 Agent 说的话里有整份消融原文（规整后比较），没有就 `not_shown`，图不变。

学习流水线的落点：问题节点上的 `学自：<键>` 只有在这个问题带预期效果时才算落点；别的类型节点上的照旧算。提醒文字与 `learning_signals` 的说明写明规则提议用 `propose_to_human` 带 `rule`。

到期核对（`effectChecks`、`effectCheckLines`，`/hourness` 晨报调用，`docs/ORCHESTRATION.md` §12）：同意时刻是待决 `done` 时最后一条 `decide` 的 `at`，没拍板、被否、放弃的不核对。到期 = 同意 + `days` 天；之前的窗口 [同意 − `days` 天, 同意)，之后的窗口 [同意, 到期)。`corrections:<键>` 用 `correctionSignals` 在项目图上数；`denials:<id>` 在会话项目的指标流水里数 `rule`（`effect` 为 `deny` 或 `late`）与 `rules.judged`（`how: block`），事件的规则名等于 id 或 `<行>:<名>` 等于 id。`down` 要之后严格少于之前，`up` 要严格多于，相等算没做到。核对不了：指标流水读不到、没有记录、或最早一条晚于之前窗口的起点（只对 `denials`）。旧规则（D10）：同意得更早、仍是 `done` 的规则提议，在这一条的两个窗口里各数一次自己的 `metric`，往自己预期的反方向走了就列在这一条下面。晨报一节「规则提议的核对」：到期落在报告时刻之前 7 天内的，没做到、核对不了、或有旧规则往回走了的才列，全做到了不出这一节；写两段的原始次数，不写比率；最后一行「这里只列出来，规则不会自己变；要撤或要改，跟主 Agent 说」。图读不出时没有这一节（「等你定的事」已写原因）。

不做的事：到期没做到只在晨报里列出，harness 与 agent 都不因此撤、改或加严规则；要撤要改，照旧提给人（`d-rules-human-only`）。规则板的 `rules_propose` 带同一栏、人设规则的 id 进名单，等规则板 R3（`rules-r4d`）。

### 3.7 汇报细度闭环（m5-5）

现状：三档 `concise`、`balanced`、`detailed`（`src/glm-prompt/persona.ts`），常设偏好来自 GLM 包 `glm-prompt` 行的配置（今天叫 `persona`，用户 profile 写的是 `balanced`）。M3 附录 0.5 作废了 `design_review`、五键卡和它的 `depth`（附录 §2.2 去向表第 7、9 项）：「讲细点」「说重点」是人在对话里说的话，主 Agent 照着改这一次怎么讲，不调工具、图上不留东西（附录 §3.7），「写进画像属于 M5」。所以没有任何工具调用可以观察，M5 里没有观察监听器、没有 `harness` 身份写偏好的权限，也不改 M3 的 `depth` 函数（agent 决定，可逆，§11）。系统提示词里的汇报细度只有 GLM 包的一个来源：配置改名 `reportingDepth`（旧键 `persona` 照读），节名 `glm:persona` 改 `glm:reporting-depth`，文件 `persona.ts` 改 `reporting-depth.ts`（附录 §2.7，`m3-main-persona` 一步）。

闭环：

1. 写：人的话表明汇报长短要一直这样（例如「以后都说重点」「你每次都太长了」「细一点也行，我愿意看」）时，主 Agent 调 `memory_store`：`name: reporting-depth`、`type: user`、范围 `all`、`value`（`concise`、`balanced`、`detailed` 之一：人点名的那一档，没点名就从现在这一档移一档）、`relay` 写人的原话、`body` 带 Why 一行。写入身份是 `llm` 带原话，所以是偏好，不衰减，只有人能撤（§3.1）。人只是这一次嫌长或嫌短、没说要一直这样的，主 Agent 只改这一次的讲法，不写。这是主 Agent 的判断，由 `memory_store` 的 `value` 参数说明和 Memory 节的 L1 一句引导，harness 不去匹配人的措辞。没选「harness 监听人的话、按词表判」：自然语言的词表会误判，而 M3 附录已经把「这句话是什么意思」交给主 Agent。没选「每次说都写」：一次性的抱怨会改掉之后每个会话的默认。
2. 服务：记忆行提供 `glmHournessMemory`，契约在公共库 `src/shared/memory-service.ts`：`depth(sessionId)` 返回这个会话第一次问到时存储里的值，之后同一会话一直返回它（进程内按会话缓存，至多 500 个会话，先进先出）；没有偏好时返回 `undefined`。`depth` 是同步函数（`glm:reporting-depth` 在组装系统提示词时调用），所以第一次问到时用同步读：`journal.readSync(path)` 对用户级记忆流水（`reporting-depth` 的范围是 `all`）做 `statSync`，大小与修改时间和读缓存相同就用缓存，否则 `readFileSync` 整读，用 `model.ts` 的同一个折叠函数算出状态并更新读缓存（与异步读共用缓存与折叠，§5.2）。流水估计每年不到 1 MiB，这次同步读在毫秒级，每个会话只做一次。没选「异步读、缓存热了再返回」：宿主重启后的第一个会话会在缓存热起来之前拿到 `undefined`，回到配置的默认档，m5-5 验收第 2 条时好时坏。读失败（权限、I/O）或没有数据行时返回 `undefined`，这个会话用配置的默认档；读失败另在控制台告警一次、行健康降级。
3. 读的一方：GLM 包的汇报细度一节（`glm:reporting-depth`，改名前是 `glm:persona`）的「The user's standing preference is …」一句，服务在且有值时用它，否则用配置的 `reportingDepth`（再退到旧键 `persona`，再退到 `balanced`，取法照 M3 附录 §2.7）。按会话冻住，所以人在会话中途说的话只改这个会话里主 Agent 的讲法，系统提示词不变，下一个会话才带上新的常设档。其他路由没有这一节（附录 §9 第 9 条：汇报细度并进 Output Style、子 agent 不带汇报细度，本次不做），但偏好是 `user` 类的记忆，每个会话的记忆索引都会列出它（§3.3），模型照样看得到。`question-31` C 的 Output Style 做出来之后，同一句改由那里读同一个服务。
4. 撤：人对主 Agent 说「汇报细度恢复默认」，主 Agent 带原话调 `memory_forget reporting-depth`；或人在输入框打 `/memory forget reporting-depth`。下一个会话回到配置的默认。

先后：人最近一次说的（偏好里的值）> 配置 `reportingDepth` > `balanced`。为什么取「最近一次」而不平滑：人能一眼看懂（「你上次说要简洁，所以这次从简洁开始」），记忆页上写明来由，人说一句就回去。
## 4. 经验板块（`lessons`）

### 4.1 一条经验（lessons-1）

```ts
// src/lessons/model.ts：纯类型与函数，面板也导入
export interface Situation {
  readonly files: readonly string[]     // ≤20 项，仓库相对路径或 glob（*、**、?），正斜杠
  readonly tools: readonly string[]     // ≤10 项，工具名，存原生名（经 toNativeTool 换算）
  readonly commands: readonly string[]  // ≤10 项，命令名或前缀，如 "Get-Content"、"npm run probe"
  readonly errors: readonly string[]    // ≤5 项，报错片段，每项 8–300 字符
}
export interface Lesson {
  readonly id: string                   // "L-" + 6 位小写十六进制；在本项目的流水里唯一（经验都属于本项目，没有范围字段，d-memory-scope）
  readonly status: 'active' | 'retired' | 'deleted'
  readonly situation: Situation         // 四项至少一项非空
  readonly pitfall: string              // 坑，一行，1–300 字符
  readonly fix: string                  // 解法，1–600 字符
  readonly evidence: readonly string[]  // 1–8 项，写法见 §5.7：commit:<sha>、node:<id>、task:<id>、session:<id>、文档节、路径
  readonly created: string
  readonly lastConfirmed: string        // 最近一次被确认
  readonly confirmations: number
  readonly origin: { readonly actor: Actor, readonly session?: string, readonly agent?: string, readonly relay?: string }
  readonly mergedFrom: readonly string[]  // 并入的候选 id
  readonly learnedFrom?: readonly string[]
}
export interface Candidate {
  readonly id: string                   // "C-" + 6 位小写十六进制
  readonly situation: Situation
  readonly pitfall: string
  readonly fix: string
  readonly evidence: readonly string[]  // harness 按 §5.7 拼出：task:<id>、session:<childId>、commit:<7–40 位十六进制>
  readonly at: string
  readonly status: 'open' | 'merged' | 'dropped' | 'expired'
  readonly signature: string
}
```

id 的生成：在锁里折叠出状态之后（§5.3 第 3 步），取 6 位随机十六进制，与本项目流水里已有的经验与候选 id 比对，撞了重取，至多 5 次，之后返回 `io`（「could not allocate a lesson id」）。只有一份流水，所以撞号检查和写入在同一把锁里，不会有两个进程各自生成同一个 id。

候选的证据全由 harness 从 `propose` 的上下文拼出（交回结构的 `lessons` 没有证据字段，M7 §3.6.1）：`task:<context.task>`、`session:<context.childId>`（没有 `childId`，或 `childId` 不合 §5.7 的语法时，用 `context.session` 的 id）、`commit:<context.commit>`。提交号照 M7 交回里的原样写全（M7 按 7–40 位十六进制校验，worker 交回的多是 40 位），不截成短号：全号在任何仓库里都不会有歧义，而 §5.7 让 `commit:` 加 7–40 位十六进制不判为像密钥。拼之前每个值按 §5.7 的语法查；`task:` 与 `commit:` 不合语法的那一项不写，候选照收，收下的结果在 `notes` 里写明（§8.1）。`session:` 一项总在（`context.session` 是宿主给的会话，合语法），所以证据不会因此变空。

签名 `signature(situation, pitfall)`：`errors` 非空时是规整后（小写、空白折叠、去首尾标点）的报错片段排序后连接；否则是规整后的坑的前 80 个字符加 `|` 加排序后的命令。签名用来判「完全相同」，不用来判「相似」。

相似 `similar(a, b)`：坑与解法的词集合 Jaccard 至少 0.5（英文按词、中文按相邻两字），或有一个相同的报错片段，或文件与命令各有一项重合。

经验的文字用英文写：它进简报与提醒，是给模型看的（M7「给模型看的文字用英文」）。面板照原文显示，表头是中文（§4.7）。

### 4.2 来源：候选、合并与去重（lessons-1）

1. 交回（M7 接缝）：worker 交回结构里的 `lessons` 每项由 M7 的交回处理调 `glmHournessLessons.propose(candidate, context)`（§8.1）。harness 以 `harness` 身份：校验（§7.4）；像密钥的拒收；算签名。候选里的 `scope`（M7 0.6 的交回和退路批注还带这个字段）不起作用：经验都属于本项目（`d-memory-scope`），`scope: 'all'` 的候选照样存进本项目，收下的结果在 `notes` 里写明「不分范围，已存进本项目」。签名与某条生效的经验相同：直接并入（`into`，原因「same signature as L-…」），这条经验的确认数加一；与某条人删掉的经验相同：丢弃（`drop`，原因「matches L-… the user deleted on <日期>」），并计一次「删后复发」；否则记成候选。结果分三种（§8.1 的 `ProposeResult`），不向 M7 抛错：
   - 收下：`{status: 'candidate' | 'merged' | 'dropped', id, notes?}`。`notes` 列出收下时去掉的部分（短于 8 个字符的报错片段、不合 §5.7 语法的上下文值、被忽略的 `scope`），M7 可以照抄进交回摘要，也可以不看。
   - 拒收：`{status: 'rejected', code: 'invalid' | 'secret_like', field?}`。字段不合格或像密钥，什么都不写，流水里也没有记录（拒收的内容不能落盘）；经验行的计数器加一，行健康与 `stats` 报「N 条候选被拒（secret_like M 条）」。拒收是确定的结果，重试也一样，所以 M7 不走退路批注，只在交回摘要里记计数与代码（§8.1 第 5 条）。
   - 失败：`{error}`，只用于服务内部失败：`busy`（锁等不到）、`io`（读写失败）、`no_project`（会话没有项目目录）、`internal`（服务内部抛错，被 `propose` 自己接住）。M7 这时走退路批注，批注写进图之前先把每个字段过一遍同一个 `looksSecret`（§8.1 第 5 条）。
2. 导入 M7 的退路：M7 在经验服务不在或返回 `{error}` 时，把候选写成任务上的批注 `[候选经验] …`（M7 §3.5.5）。经验行在算候选提醒（§4.2.1）时决定要不要扫图：每个进程对每个项目第一次算时扫；之后距本项目上一次检查超过 60 秒时，经图引擎的 `load()` 取整张图的修订（`LoadedGraph.revision`，`src/graph/parse.ts`），与上一次扫时记下的不同才再扫；本进程的 `propose` 对这个项目返回过 `{error}` 之后，下一次计算不等 60 秒就检查。于是宿主运行期间 M7 新写的退路批注，至多一分钟后（或 `propose` 失败之后的下一步）进候选提醒，不等桌面版重启。`load()` 读全部节点文件（现在 149 个、约 411 KB），按 60 秒一次只在主 Agent 的步上做，图读不出时这一次不扫、下次再试。扫的时候把身份为 `harness`、以 `[候选经验]` 开头、还没导入过的批注导入为候选；每条批注无论导入成功还是被拒，都记一条 `import` 记录（节点 id 加批注时刻；成功时 `data` 为 `{candidate: <C-id>}`，被拒时为 `{rejected: 'invalid' | 'secret_like'}`，不带批注的内容），所以每条只试一次。`import` 记录一律写进本项目的经验流水（经验只有这一份流水），「还没导入过」也只查这一份：不会有记录写在一处、查重看另一处而在每个进程里重复导入的情形（评审 R3-03）。批注末尾带 JSON 时按 JSON 取字段（§8.1 请 M7 这样写；JSON 里的 `scope` 同样被忽略），否则整句当坑、解法写「see the annotation on <节点>」。M7 略去的字段（「（像密钥，已略去）」）当作空；空了必填字段就按 `invalid` 拒。签名与一条开着的候选相同的批注不再新建候选（M7 在 `propose` 超时后走了退路、而 `propose` 其实已写成功时，同一条候选会两处都有），`import` 记录的 `data` 写 `{duplicateOf: <C-id>}`。导入同样过 `looksSecret`：M7 的略去若漏了一处（例如 M7 的实现早于本设计的第 5 条），令牌也不会再从图进到经验存储。被拒的批注由卫生检查（§4.9）列出所在节点，批注本身留在图上，由人决定是否处理。
3. 根 agent 自己遇到的坑：用 `lessons_merge {action: 'new', …}` 直接写，不经候选。
4. 主 Agent 合并：有开着的候选时，根 agent 每步收到一条提醒（§4.2.1）；主 Agent 用 `lessons_merge` 处理。
5. 过期：开了 30 天还没处理的候选，在下一次算候选提醒时由 harness 记 `expire`，提醒里不再列；恢复用 `lessons_merge {action: 'reopen'}`（见下表）。

#### 4.2.1 候选提醒

`installStepNotice` 给根 agent 装一个 `agent/pre-step` 监听器，只在主 Agent 的步上注入：主 Agent 由一个薄访问器 `isMainAgentFor(ctx, agent)`（`src/shared/main-agent.ts`，两行共用）判：它调 M3 附录 0.5 §2.4 为 M5、M7 导出的 `mainAgentOf`（找这个项目持有者记录里的会话），拿到持有者就比会话 id；拿不到（M3 设计行不在、没有图目录、记录 `none` 或读不了、`mainAgentOf` 的导出名或形状与此处不符）时按「设计行不在」处理，任何根 agent 都算，并在行健康里写原因（R4-06，§14 U19）。M3 里的 `isMainAgent(deps, agent)`（`src/design/mode.ts`:174，今天不导出，依赖设计行内部的 `deps`）不是 M5 的入口；M5 不自己读投影或持有者记录。这样同一个项目里人随手开的普通会话不会收到合并候选的提醒。条件是本项目的开着的候选不为空，且这组候选的摘要与可见历史里最近一条来源为 `glm-hourness-lessons-pending` 的提醒不同（或可见历史里没有这样的提醒，例如压缩之后）时注入，其余步不注入（K7）。文字：

```
<system-reminder>
Lesson candidates waiting for you to merge (3):
- C-1a2b3c from task-3: Get-Content without -Encoding garbled the Chinese text in a fixture (likely duplicate of L-0f12aa)
- C-77e0d1 from task-5: npm run probe failed while a calibration run held the sandbox
- C-9b3f20 from review of task-3: …
Merge each with lessons_merge: new, into <lesson>, or drop. Lessons are advice, not rules.
</system-reminder>
```

至多列 5 条，其余写「and N more」；相似的经验写在括号里。

#### 4.2.2 `lessons_merge`（根 agent）

| 动作 | 必填 | 做什么 | 拒绝 |
| --- | --- | --- | --- |
| `new` | `reason`；带 `candidate` 时其余字段取候选，可覆盖；不带时要 `pitfall`、`fix`、`situation`（至少一项）、`evidence`（至少一条） | 生成一条生效的经验；候选转 `merged` | 签名与生效的经验相同：`duplicate`，`hint`「use action into with lesson L-…」；相似的不拒，结果里列 `similar` |
| `into` | `candidate`、`lesson`、`reason` | 把候选并进经验：情况取并集（各项上限内）、证据追加（超过 8 条时留最早 3 条与最新 5 条）、确认数加一、最近确认改为现在 | 候选不是 `open`：`stale`，带它现在的状态 |
| `revise` | `lesson`、`reason`，以及要改的字段 | 改坑、解法、情况或证据 | 经验已删：`not_found` |
| `confirm` | `lesson`、`reason`、`evidence`（至少一条） | 最近确认改为现在，确认数加一 | 同上 |
| `retire` | `lesson`、`reason` | 状态转 `retired`：不进简报、不推提醒，查询不返回；面板列在「agent 收起的」 | 同上 |
| `drop` | `candidate`、`reason` | 候选转 `dropped` | `stale` 同上 |
| `reopen` | `candidate` 或 `lesson`、`reason` | 把 `expired`、`dropped` 的候选或 `retired` 的经验恢复；人删掉的不能由 agent 自己恢复 | 人删掉的：`user_only`，正路「the user restores it: quote their words in relay and use action restore」 |
| `delete` | `lesson`、`reason`、`relay`（人的原话） | 人要删一条经验时用：人对主 Agent 说「删掉这条」，主 Agent 带原话调它。状态转 `deleted`，流水里留带快照的 `delete` 记录，身份 `llm` 加原话；不从文件里抹掉 | 没带 `relay`：`user_only`，正路「only the user deletes a lesson: quote their words in relay」；经验不存在或已删：`not_found` |
| `restore` | `lesson`、`reason`、`relay` | 把 `deleted` 的经验按快照恢复（人说「把那条经验找回来」）；`retired` 的不用它，用 `reopen` | 没带 `relay`：`user_only`；经验不是 `deleted`：`stale` |

`learnedFrom` 可选；没有 `scope` 参数（经验不分范围）。证据（调用方给的与从候选取来的）每项都经 §5.7 的 `checkRefs`：从候选取来的在 `propose` 时已过同一个函数，这里再过一次，结果相同，所以 `new {candidate}` 与 `into` 不会因 harness 自己写的 `commit:<40 位>` 被拒。所有动作都在锁里先折叠出当前状态再判（§5.3），所以两个根会话同时并同一条候选，后到的拿到 `stale`。`delete` 与 `restore` 是人的决定：只有带人的原话的 `llm` 调用或人在输入框打的 `/lessons`（§4.7）做得了，原话不由 M5 核对，记进流水（§2.3）；`lessons_merge` 的其余动作不需要原话。

工具说明里的示范（`d-agent-examples`；R4-11）。`lessons_merge` 的说明末尾放下面这一个，英文，给模型看；题材是图片批处理：

```text
Example: you hit a pitfall yourself and want to record it as a lesson.
lessons_merge {
  "action": "new",
  "reason": "hit twice while resizing the product photos",
  "situation": {
    "files": ["tools/resize/**"],
    "commands": ["resize-batch"],
    "errors": ["EMFILE: too many open files"]
  },
  "pitfall": "resize-batch opens every source image at once and fails with EMFILE when the folder holds more than about 1000 files.",
  "fix": "Run it with --chunk 200, or split the folder first. The exit code is 0 even when files were skipped, so count the outputs.",
  "evidence": ["commit:3fa9c21d7be0"]
}
To delete a lesson the person asked you to delete, use action delete with their own words in relay.
```

L2 把这个示范交给与真实调用同一个校验函数（本节的字段规则与 §5.7 的 `checkRefs`），断言通过且得到一条生效的经验。

### 4.3 用途一：派发时进简报（lessons-1，M7 接缝）

M7 在派发时调 `relevant({session, paths, tools, commands, limit: 5})`（M7 §3.5.5；`session` 是本设计请 M7 加的参数，用来定位项目，§8.1）。打分（`src/lessons/match.ts`，纯函数）：

| 命中 | 分 |
| --- | --- |
| 经验的某个文件模式与任务的某个路径相交（下面的规则） | 3 |
| 经验的某个命令出现在任务某条命令的命令位置上（不分大小写，按词） | 2 |
| 经验的某个工具在任务的工具里（两边都换成原生名） | 1 |

文件相交 `pathsMeet(lessonPattern, taskPath)`（纯函数，两边先换成正斜杠、去掉开头的 `./`，Windows 上不分大小写）。M7 传的 `paths` 是写入范围加已批计划的路径，多为通配（`docs/graph/**`），经验里存的也常是通配，所以按两边都可能是通配来判。通配只认三种：`*`（不跨 `/`）、`**`（跨 `/`，含零段）、`?`（一个非 `/` 字符），由 `match.ts` 里的纯函数 `globMatch(pattern, path)` 转成正则判，其余字符按字面（经验的 `files` 写入时校验同一套写法）；不用 Node 的 `path.matchesGlob`（Node 22 上仍标为实验，且 `match.ts` 不用 Node 内置模块）。字面前缀 `literalPrefix(p)` 是 `p` 里第一个通配符（`*`、`?`）之前的部分；不带通配符时是 `p` 本身。下面任一条成立就算相交：

1. 任务路径不带通配符，经验的模式匹配它（`docs/graph/**` 对 `docs/graph/nodes/x.json`）。
2. 任务路径带通配符，经验的模式匹配任务路径的字面前缀（经验 `docs/graph/**` 对任务 `docs/graph/nodes/**` 的前缀 `docs/graph/nodes/`）。
3. 两边的字面前缀都非空，且一方是另一方的前缀（经验 `docs/graph/**` 对任务 `docs/graph/**`，两边都是 `docs/graph/`；经验 `src/*/index.ts` 的前缀 `src/` 对任务 `src/memory/**` 的前缀 `src/memory/`）。字面前缀为空的模式（`**/*state*.json`）不参加这一条，否则它会与每个任务相交；它只经第 1、2 条命中。

L2 用经验 `docs/graph/**` 分别对任务路径 `docs/graph/**` 与 `docs/graph/nodes/x.json` 各测一次（lessons-4 验收第 2 条），另测 `**/*state*.json` 对 `src/**` 不相交、对 `.agents/tasks/x/state.json` 相交。

只给生效的经验，总分至少 2；同分按「28 天内命中的会话数」再按最近确认排序；取前 `limit` 条。每条返回 `{id, when, problem, fix, line}`：`when` 是情况的一句话（「files src/guard/**; commands Get-Content」），`line` 是渲染好的一行 `L-3f9a2c: when <when> → <pitfall> → <fix>`，超过 300 字符时先截解法再截情况，末尾注明 `…`。只有工具命中（1 分）的不进简报：「用 Bash」几乎对每个任务都成立，放进去只是噪声；这类经验靠失败匹配与查询到达。

### 4.4 用途二：命令失败时按报错匹配（lessons-2）

经验行在 `tools/post-execute` 上装一个监听器（tools:3599–3627；先例 repeat-tool-reminder:2247–2260）。它先 `await next()`，再看这次调用：

1. 不看的：带 `parent` 的传输层子调用（`run_code` 里的调用，它们的失败会出现在 `run_code` 的结果里）；没有 `exec.agent` 的调用。
2. 算失败文字：先把调用名换成原生名 `toNativeTool(dialect, exec.name)`（`src/shared/dialect.ts`；方言服务经 `ctx.get` 读，不在时用 `ZCODE_ALIAS_NATIVES`）。GLM 路由上 shell 调用的名字是别名 `Bash`，结果值沿用原生 `pwsh` 的 schema（`src/glm-prompt/aliases.ts` 的 `buildAlias`），换算后是 `pwsh`。原生名是 `pwsh` 或 `bash` 的 shell 工具，结果有 `value.exitCode` 且不为 0，或 `timedOut` 为真（tool-pwsh:267–290、tool-bash:303）：取 stderr 末尾 4,000 字符加 stdout 末尾 2,000 字符；其余工具的结果 `isError` 为真：取 `content` 的文字与 `error.message`，至多 6,000 字符。都不是就结束。被 `tools/pre-execute` 拒绝的调用同样走到这里（tools:3339–3353），它们的拒绝文字若含某条经验的片段，也算匹配。
3. 匹配：规整后（小写、空白折叠、去掉 ANSI 转义）看哪些生效经验的报错片段是失败文字的子串，按片段长度从长到短。片段至少 8 个字符，写入时校验，所以「error」这类词进不了片段。
4. 去重：本会话可见历史里来源为 `glm-hourness-lessons` 的提醒列过的经验不再推；剩下的取至多 2 条。
5. 注入：把一条 notice 放进决定的 `additionalContexts`，保留下游已有的（同 repeat-tool-reminder 的 `prependContext`）。DSH 把它放进下一步的收件箱，下一次请求里它紧跟在这次工具结果之后（agent-loop:492–506、572）。文字：

```
<system-reminder>
This failure matches a lesson from earlier work (advice, not a rule; check that the fix still applies):
- L-6c1d02: dsh : The term 'dsh' is not recognized → dsh is not on PATH on the desktop install → Run DSH through the Electron node mode of "DeepSeek Harness.exe" with a separate profile (docs/DEVELOPMENT.md §3).
More with lessons_query.
</system-reminder>
```

每条至多 400 字符，合计至多 1,200 字符。来源 `{kind: 'glm-hourness-lessons', summary: 'lesson match', lessons: [id…]}`。

6. 记命中：对推出去的每条经验追加一条 `hit` 记录（会话 id、调用 id、工具的原生名），写进本项目的经验流水，不等它写完，写失败只告警一次；同一会话同一条只记一次（第 4 步已保证）。会话没有项目（§5.5）时没有经验流水，这一步整个跳过。

监听器自己抛错时返回下游的决定原样不动，控制台告警一次，行健康降级（§7.2）。它不读存储，除非这次调用失败；读也是一次 `stat` 命中缓存。

### 4.5 用途三：`lessons_query`（lessons-1）

所有 agent 都能调，worker 在内（人的要求）。参数：`text`（1–500 字符，关键词）、`file`（一个路径）、`command`（一条命令文字）、`error`（一段报错，至多 6,000 字符）、`limit`（1–10，缺省 5）、`includeCandidates`（布尔，缺省真）；前四个至少一个，否则 `invalid`。打分：`file`、`command` 同 §4.3 的规则；`error` 同 §4.4 的子串匹配，再加报错文字与经验坑的词集合重合；`text` 是关键词在坑、解法、情况里的命中数。结果先列生效的经验，再列至多 2 条开着的候选，候选标 `status: 'candidate'` 与「unreviewed」。返回 `{lessons: [{id, status, when, pitfall, fix, evidence, lastConfirmed, score}], more}`。查询的是调用方会话所在项目的经验；查询不写流水。

工具说明（英文，常驻，约 700 字符）写明：经验是以前工作里的建议，不是规则，用之前先确认解法还适用；命令失败或工具行为反常时先查一次再绕路（与 M7 简报约束栏的那一句一致）。

### 4.6 建议不是规则：复发与规则提议（lessons-2）

- 经验行与记忆行都不在 `tools/pre-execute` 上注册监听器，不出任何拒绝；契约测试钉住这一点（§7.5）。简报、提醒、查询结果里都写「advice, not a rule」。
- 复发：一条经验 28 天内至少 3 个不同会话里被命中（`hit`）或被并入（`into`），且过去 28 天没为它发过复发提醒，经验行在本项目主 Agent 的下一步发一次提醒（判据同 §4.2.1，来源 `glm-hourness-lessons-recur`），并记一条 `recur-notified`。经验只有本项目这一份流水，计数和抑制都在这一份里算，不需要在记录里带项目根。提醒文字：

```
<system-reminder>
Lesson L-6c1d02 matched failures in 3 sessions in the last 28 days. Lessons stay advice. If the harness should enforce it, record a rule proposal with rules_propose and put it to the user with propose_to_human; if you do not have rules_propose, put the point to the user in plain words with propose_to_human.
</system-reminder>
```

  每个项目每个自然周至多 2 条，多的下周再发。提规则是主 Agent 的判断；规则板的提议与 M3 的 `propose_to_human` 负责四行方案的格式与「只有人能设规则」（`d-rules-human-only`、规则板设计 §9.3）。
- 人删掉之后又复发的（§4.2 第 1 步的「删后复发」）不发提醒，只进周报的计数，人删过的不再往 agent 面前推。

### 4.7 人看与删：只读的页面，删除在对话里说（lessons-3）

这一节按 plain-ui 0.7 §4.7 与 §3.1 写（`lessons` 节点 2026-10-30T06:11Z 的批注：页面没有写入控件，`/graph-apply` 已删，面板不经 `remote.commands.execute` 写任何东西）。

位置：经验板是第 2 层的一页，从首页页脚「规则板 › 循环板 › 经验 › 整张图 › 上手说明 ›」进入。本设计在板块登记表 `ui/src/graph/boards.ts` 登记一块：`id: 'lessons'`、`label: '经验'`，接口是 plain-ui 0.7 §4.7 的 `subscribe(sessionId, listener)` 加 `snapshot(sessionId)`；`BoardState` 里 `available` 看投影 `hournessLessons`、`hournessMemory` 在不在（两者有一个就算），`homeLine` 与 `guideLine` 为 `null`（首页不为它多一行），`peakApplies` 为 `false`。记忆的几节放在同一页的下半部分，不另登记一块：plain-ui 的登记表和页脚只有 `rules`、`loops`、`lessons` 三块，多一块要改它的设计；所以不登记 `memory` 板块（agent 决定，可逆，§11）。

页面没有写入控件：没有删除、撤销、恢复按钮，没有开关与表单，也不经任何命令写。L2 的静态检查要求 `ui/src/lessons/` 下的源码不调用 `commands.execute`。页头写板名与一句它管什么：「经验 · 这个项目踩过的坑和解法，以及 agent 记住的事」。每个条目照 plain-ui 的约定写三层：一行人话标题；下面一行它此刻的样子；再一行灰字写它从哪来；能改的条目下面再有一行「要改：跟主 Agent 说「……」，或在输入框打 ……」，括号里是一句能直接照说的话。

经验（中文表头，经验原文照显示）：

- 顶上一行：「本项目 12 条经验 · 2 条候选等主 Agent 合并」。
- 每条经验：标题是坑；样子一行写解法与「3 天前确认 · 28 天里 2 个会话碰到」；情况（文件、命令、报错片段作小标签）和证据（提交号与节点 id 可点开对应的页）；灰字写来源（「task-3 的交回，主 Agent 合并的」「第一批导入：docs/HANDOFF.md §6」）；末行「要改：跟主 Agent 说「删掉经验 L-3f9a2c」，或在输入框打 /lessons delete L-3f9a2c」。
- 页尾两节默认折起：「agent 收起的（N）」，末行「要恢复：跟主 Agent 说「把 L-… 找回来」，或打 /lessons restore L-…」；「你删掉的（N）」同样写怎么恢复。

记忆（同一页的下半部分）：

- 「关于你」：偏好，每条写说明、你的原话（`relay`）与何时；汇报细度单独一行「汇报细度：简洁 · 你 10-29 说过「太长了」」。这一节的数据在用户级目录，换个项目打开也在。
- 「agent 推测的（会淡忘）」：推测的 `feedback`，写强度（「还记得七成」）。
- 「项目里的线索」：`project` 与 `reference`，写出处（节点 id 可点开）与强度；迁来的标「没有出处」。
- 每条的末行：「要改：跟主 Agent 说「忘掉 <名字>」，或在输入框打 /memory forget <名字>」。

读：两行各注册一个会话投影（session-projection:68–102），`init(header)` 在会话创建时（session-projection:51–63）算出这个会话对应的流水的绝对路径与问题（没有工作目录、没有用户级目录），`apply` 不改状态，`wire.view` 把它交给客户端。rc.3 把 `init(header, inheritedEventCount)` 的返回值直接当状态存（session-projection:58、296、368），`wire.view` 也是同步的，所以 `init` 里定项目目录用 `project-root.ts` 的 `projectDirOf(cwd)`（它是同步的，只读文件、不起 git 进程，§5.5），不读流水，只算路径；返回 Promise 会被当成状态。客户端经 `remote.workspaceFiles.readBytes(sessionId, 绝对路径, {})` 整读，经 `changes` 订阅这几个文件（文件的读与监视不限于工作区，按文件系统的读权限，`dsh-api-workspace-files/README.md`:12、40、58），用 `src/lessons/model.ts`、`src/memory/model.ts` 的折叠函数算出状态。页面可见时另每 15 秒按大小与修改时间检查一次（工作区外文件的监视在桌面版上没核对，§14 U4；现在只有用户级记忆流水在工作区外）。读失败时保留上一次读到的内容，顶上写原因。

写：人要删或恢复一条经验或记忆，有 plain-ui 0.7 §3.1 说的两条路，都是人自己的动作：

1. 对主 Agent 说一句。主 Agent 带人的原话调 `lessons_merge`（`delete`、`restore`，§4.2.2）、`memory_forget` 或 `memory_store`（§3.4）；流水里身份是 `llm`，`relay` 是人的原话，记删除前的快照。主 Agent 看得到 `lessons_merge` 是因为它是延迟工具，目录里有名字；页面上「要改」一行也写明了该说什么。
2. 在输入框打人的命令：

| 命令 | 输入 | 结果（会话里一行） |
| --- | --- | --- |
| `/lessons` | `show`；`delete <L-id>`；`restore <L-id>`；`drop <C-id>`（人也可以直接丢候选） | 「已删除经验「Get-Content without -Encoding …」」；拒绝时写人能照着做的中文（「找不到 L-3f9a2c，可能已被删除，刷新一下」） |
| `/memory` | `show`；`forget <name> [project\|all]`；`restore <name> [project\|all]` | 同上 |

两个命令的 `definitionId` 是 `dsh-glm-hourness/lessons` 与 `dsh-glm-hourness/memory`，`recordInput` 缺省为记（commands:148–180）：人敲的几个词留在会话日志里，与流水里的记录互为印证。删除记一条 `delete`（经验）或 `forget`（记忆），带被删条目的快照与命令的 `commandId`。命令是人在输入框里打的，模型发不出斜杠命令（`docs/ORCHESTRATION.md` §2.10），所以这条路的身份为人，用 `/graph-run` 同样的理由留着。`/lessons` 没有 `scope` 参数：经验只有一份流水。

在面板做出来之前（P1 之前），人用对话里说一句或这两个命令，照样能看（`show`）与删。
### 4.8 第一批经验（lessons-4）

来源是人审过的文档与图上的记录。导入方式：L1 合入之后，编排者把下表写成一个操作文件（放在 `.agents/tasks/<实施运行>/` 下，不入库），经命令行 `npm run -s lessons -- apply --file <文件>` 以 `llm` 身份写成生效的经验（不经候选：来源已经审过），原因写「seed from <出处>」。重复导入按签名跳过。下表的证据一栏是给人看的说明；操作文件里按 §5.7 的写法写，例如第 19 条写 `commit:cae6ddf`、`node:recommend-last@2026-10-29T11:39`，第 1 条写 `docs/HANDOFF.md §6`，第 2 条写 `docs/DEVELOPMENT.md §7`、`AGENTS.md`。21 条全部进本项目的 `.llm/lessons.jsonl`：经验没有范围（`d-memory-scope`），第 1、13、21 条（通用的坑）也在项目里，新项目要重新学一遍，这个代价人已知道。

| # | 情况 | 坑（pitfall） | 解法（fix） | 证据 |
| --- | --- | --- | --- | --- |
| 1 | tools `pwsh`；commands `Get-Content`、`Set-Content`、`Out-File`、`Add-Content` | Windows PowerShell 5.1 reads and writes the ANSI code page when -Encoding is omitted; a UTF-8 file round-tripped this way loses its non-ASCII characters. | Edit files with the file tools or a Node script; when PowerShell must read or write text, pass -Encoding UTF8; never redirect output into source files. | `docs/HANDOFF.md` §6（2026-10-28 损坏 `src/shared/dsh-min.ts`） |
| 2 | files `src/*/index.ts` | A row whose apply() throws during activation takes the whole DSH host startup down. | Never throw in apply: degrade to a warning plus no-op and report row health; boot the bundle in the headless sandbox (npm run probe) before installing. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 1 行）；`AGENTS.md`「代码」 |
| 3 | files `ui/**`、`packages/*/cordis.patch.yml`；errors `resolves from multiple active Loader sources` | A client half declared in a package with several rows makes client-modules see one package from several Loader sources, and the host fails to start. | Keep each client half in its own single-row client package; npm run preflight checks it. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 2 行） |
| 4 | files `src/glm-llm/**`；errors `adapter returned invalid or duplicate model` | listModels returned models without provider and the host rejected the adapter. | Check the adapter against the official .d.ts with AdapterContractCheck; tsc then catches it. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 3 行） |
| 5 | files `ui/src/**`；errors `styles is not defined` | A static package's client half used the styles builtin of dynamic packages, which does not exist there. | Static client halves get only require (the module table); render styles with a <style> element in the component. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 4 行） |
| 6 | files `src/*/index.ts`、`packages/*/cordis.patch.yml` | Rows that configured their own home wrote 190 usage records and a memory into ~/.dsh/profiles/desktop/.llm/, where /hourness could not read them. | Resolve data directories through the data service glmHournessData (docs/DESIGN.md §2.4); never give a row its own data path. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 5 行）；`docs/DESIGN.md` §2.4 |
| 7 | files `src/guard/**`；tools `pwsh`、`bash` | Regex shell detection without quote awareness treated =>, >>> and -> inside quoted text as redirects and denied harmless commands. | Parse shell text quote-aware (src/guard/shell.ts) and put the harmless forms (=>, >>> and -> inside quotes, git subcommands) into tests before the row is enabled; a rule written in code enforces from the day its row is enabled, so a false denial shows up as a block recorded with its rule id. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 6 行）；`docs/ROADMAP.md` M1.8 |
| 8 | files `src/shared/dsh-min.ts`、`src/shared/lm-min.ts` | reference/deepseek-harness is the 2026-10-23 trunk, not the desktop runtime; fields read from it (toolCalls, exec.agentId, terminal_send.command) do not exist in rc.3 and the code silently did nothing. | Read the runtime package in reference/dsh-desktop-0.2.1-rc.3/<package>/lib/index.js, record package:line in docs/DESIGN.md §2.4a, and type it in the thin adapter layer. | `docs/DEVELOPMENT.md` §7（2026-10-28 三行）；`docs/DESIGN.md` §2.4a |
| 9 | files `src/guard/**`；tools `write`、`edit` | The guard judged relative paths as outside the workspace and let C:\ws\..\elsewhere through, because it only normalised case and separators. | Resolve paths against the session working directory with path.resolve, as the file tools do; test relative paths and "..". | `docs/DEVELOPMENT.md` §7（2026-10-28 相对路径一行） |
| 10 | files `src/glm-llm/**` | A random x-session-id per request broke the gateway's cache affinity, so follow-up requests missed the latest prefix. | Keep the session id fixed per DSH session (docs/DESIGN.md §4.5b) and check cache hits per step in the usage journal. | `docs/DEVELOPMENT.md` §7（2026-10-28 缓存一行）；`docs/DESIGN.md` §4.5b |
| 11 | files `src/glm-llm/**` | Ported code lost details of its source: the signing handshake got the routed URL (404 on every request) and four request fields were dropped. | Port line by line against reference/zcode-api (body-transformer.ts, client-signing) and assert complete URLs and headers in assembly tests. | `docs/DEVELOPMENT.md` §7（2026-10-28 签名与请求细节两行）；`docs/DESIGN.md` §4.3 |
| 12 | files `ui/**`；errors `entry did not activate` | After rebuilding a client half, refreshing the desktop page requested a stale revision and the client package failed to import (404). | Restart the desktop app after rebuilding a client half; a page refresh is not enough. | `docs/DEVELOPMENT.md` §7（2026-10-28 客户端 404 一行） |
| 13 | files `cordis.patch.yml`；commands `restart.ps1` | Switching the model in the desktop's input menu writes it into the profile's agent-default-model, so later sessions start on that model. | After a check, switch back through the same menu and verify agent-default-model in the profile patch. | `docs/HANDOFF.md` §6 |
| 14 | commands `dsh`、`DeepSeek Harness.exe`；errors `'dsh' is not recognized` | dsh is not on PATH on the desktop install, and --profile desktop is refused because the desktop app owns that profile. | Run DSH through the Electron node mode of "DeepSeek Harness.exe" with a separate temporary profile (docs/DEVELOPMENT.md §3). | `docs/DEVELOPMENT.md` §3 |
| 15 | commands `npm run probe`、`npm run calibrate` | A probe and a calibration run started together share the sandbox and disturb each other. | Run one at a time; wait for the other to finish before starting the next (docs/HANDOFF.md §6). | `docs/HANDOFF.md` §6 |
| 16 | commands `npm test`、`npm run check:secrets` | npm test fails when gitleaks is not installed; the secret scan has no skip. | Install gitleaks 8.30.1 to %LOCALAPPDATA%\Programs\gitleaks or set GITLEAKS_PATH (docs/DEVELOPMENT.md §11). | `docs/HANDOFF.md` §6；`docs/DEVELOPMENT.md` §10 |
| 17 | commands `cdp.mjs`；tools `pwsh` | Sending Chinese text to the desktop page through CDP from PowerShell 5.1 garbles it. | Use evalfile or typefile of .agents/tasks/m2-panel/cdp.mjs to send non-ASCII text from a file. | `docs/HANDOFF.md` §6 |
| 18 | files `ui/src/**`；errors `without inject` | Declaring only a nested service name (remote.commands) in inject throws when the code reads ctx.remote. | Declare the whole service path chain in inject, e.g. 'remote' and 'remote.commands', copied from the official package's inject list. | `docs/DEVELOPMENT.md` §5 第 7 条 |
| 19 | files `docs/graph/**`；tools `graph_comment`、`graph_status`；commands `git commit` | A worker committed a graph comment on local main although its brief said not to touch the graph; a constraint that lives only in a brief is not kept. | Report graph changes in the handback (questions, lessons) and let the main agent write the graph; constraints that matter belong in a harness gate (M7 worker-graph-readonly, write scope). | 提交 `cae6ddf`；节点 `recommend-last` 2026-10-29T11:39 的批注 |
| 20 | files `.agents/tasks/**`、`docs/graph/nodes/**` | A brief written before the user's decision was not updated; the worker implemented the superseded rule and two reviews passed it. | Generate the brief from the graph at dispatch and re-brief when a pinned node changes (M7 pins); before writing a design, read .agents/tasks/design-context.md and the graph node, and the node wins. | 阅读摘要 §6 K5；节点 `orch` 2026-10-29T12:41 的批注；`.agents/tasks/design-context.md` |
| 21 | files `**/*state*.json`；tools `write` | A blue screen zeroed a workflow's state file and the run could not resume, while the graph, written by temp file plus rename, kept the real progress. | Keep orchestration state on the graph or in git; write any state file to a temp file and rename it over the old one. | 节点 `m1-parity` 的批注（蓝屏）；阅读摘要 §6 K4 |

第 7 条的解法不写影子期：人 2026-10-31 定 `d-code-rules-enforce`（「试运行规则啥的直接拦就行了，这样反而有问题好发现」），写在代码里的规则（这条经验的情况栏是 `src/guard/**`）从插件行启用那天起就拦，没有试运行，没有转正的门槛，误拦由带规则 id 的拦截记录发现。解法因此改成两件事：引号感知解析，启用行之前把无害写法写进测试。证据一栏的 `DEVELOPMENT.md` §7 与 `ROADMAP.md` M1.8 记的是 2026-10-27 的事故和 10-28 的修复。`DEVELOPMENT.md` §7 那一行的「影子记录」指 guard 的工作区变更兜底（`src/guard/shadow.ts`，回合结束时只记录、拦不住），不是新规则的试运行期；它变成什么由 M4 定（`d-code-rules-enforce`）。`ROADMAP.md` M1.8 一行没有「影子」字样。第 15 条的解法里没有「take the rules board's dsh-profile lease」：规则板 0.10 没有租约（「探针一次一个」不做成产品规则，`question-36` B），`HANDOFF.md` §6 只写「两者不要同时运行」。

第 12、18 条的报错片段是原报错里的一段（`web boot: 1 entry did not activate`、`cannot get property "remote" without inject`），选的是 split 改名之后仍会出现、又不至于太宽的部分。

### 4.9 统计与卫生（给 M7 的晨报、周报与巡检）

经验服务与记忆服务各提供两个只读函数（§8.1），M7 P2、P3 调用；不在时 M7 不列这一节。

- `stats(session, since, until)`：经验新增、并入、丢弃、过期、人删、人恢复的条数（人删与人恢复包括人对主 Agent 说、主 Agent 带原话做的）；开着的候选数与最老一条的天数；每条经验在期间命中的会话数；删后复发数；「经验存在之后同一报错又出现的会话数」（经验的 `created` 之后带同一片段的失败匹配，按会话计）。记忆新增的偏好、推测与事实，删除数，`reporting-depth` 的变化。这些是 `lessons`「同一个坑不用每个子 agent 各踩一次」的度量：看曲线走向，不设达标线（`docs/CHARTER.md` §8）。
- `hygiene(session, now)`：`project` 事实的出处节点已被取代、废弃或不在，出处文件不在；强度低于 0.1 超过 30 天的事实；180 天没确认的经验；流水里的坏行；超过 7 天的候选；相似的经验对（§4.1）。M7 的巡检把可以安全自动做的交给 harness（只有「候选过期」一项，由经验行自己做），其余列成发现。

纠正信号与复发（§3.6）不在这两个函数里：M7 0.6 的周报只调这两个（M7 §3.5.5、§3.12.4），纠正信号走记忆行自己的 `learning_signals` 与每七天的摘要提醒。

## 5. 存储与并发

### 5.1 目录：用户级与项目

| 数据 | 位置 | 写的一方 | 读的一方 |
| --- | --- | --- | --- |
| 项目的记忆（范围 `project`） | `<项目目录>/memory.jsonl` | 记忆行（工具、harness）、`/memory`（人） | 记忆行、面板、命令行 |
| 关于人本人的记忆（范围 `all`，只有 `user`、`feedback` 两类） | `<userHome>/memory/memory.jsonl` | 同上 | 同上 |
| 项目的经验 | `<项目目录>/lessons.jsonl` | 经验行（工具、harness）、`/lessons`（人）、命令行（`llm`） | 经验行、面板、命令行 |
| 写锁 | 每份流水旁的 `<文件>.lock`；陈旧的改名为 `<文件>.lock.stale-<毫秒>` 留着（`src/data/lock.ts` 的 `keepStale`） | 写的一方 | 写的一方 |
| 旧格式 | `<项目目录>/memory.json`，迁移后改名为 `memory.json.migrated-<毫秒>` | 迁移 | 无 |
| 两个投影 | 宿主内存，每个会话一份路径 | 两行 | 面板 |
| 读缓存、每会话冻住的细度 | 宿主内存 | 两行 | 两行 |

`userHome` 只取数据目录服务（`docs/DESIGN.md` §2.4：没有数据行就不写用户级数据）；命令行用同一个解析函数 `userDataHome()`（显式 `--dsh-home` > `$DSH_HOME` > `~/.dsh`），所以与宿主落在同一处。用户级目录在 `d-memory-scope` 之后只放关于人本人的记忆；经验、项目事实、项目规范都不在这里（`docs/CHARTER.md` 0.7 §9 的存放表）。

项目目录，按序取第一个成立的：

1. 数据目录服务的 `projectOverride`（数据行的新配置，绝对路径）。只给探针、标定与测试用：`scripts/sandbox.mjs` 的 `dataRows(dir)` 设成 `<dir>/home`，于是探针（默认 `cwd` 就是本仓库）与标定都不碰本仓库的 `.llm`，也不碰真实的用户级目录（`dshHome` 本来就指向运行目录）。
2. 会话头 `cwd`（session:1820–1826）所在 git 仓库的根下的 `.llm/`（§5.5 `projectDirOf`）。
3. `cwd` 不在 git 仓库里：`<cwd>/.llm/` 已经是一个目录时用它（§5.5）。
4. 都没有（含 `cwd` 是用户主目录或盘符根）：没有项目，`project` 范围不可用（`no_project`）。

不再用的：记忆行配置 `home`。用户 profile 给记忆行配了 `home: C:\Users\29596\Desktop\Project\GLM-Hourness\.llm`（profile 补丁第 67–69 行，只读看过），如果它继续优先，别的项目里的会话照样写进本仓库，正是 §8.2 定案要防的「混在一起会互相污染」。所以记忆行忽略 `home`，在行健康里写明「行配置 home 已不再使用（M5），项目目录跟会话的工作区」。M5 不改用户的 profile（`AGENTS.md`），这一行留着无害，不向人提问（agent 决定，§11）；人哪天想清理，改前备份。数据行的 `projectHome`（bundle 默认是本仓库的 `.llm`）仍给 guard、workflow、hourness 的流水用，本设计不改它（§1.4）。

为什么放项目的 `.llm/`：`d-rules-in-repo` 与 CHARTER 0.7 §9 定了「属于项目的都在项目里，运行时的东西进项目的 `.llm/`，不进 git」；记忆里关于项目的事实与全部经验是项目知识，跟着项目文件夹走，人在资源管理器里看得到，项目交给别人时带得走。代价是往别的项目的工作树里写一个目录，那些项目不一定忽略 `.llm/`。对策见 §5.5 的 `ensureIgnored`，与规则行在第一次建 `.llm/rules/` 之前做的是同一件事（ORCHESTRATION.md §16.3），也与 M7 往 `.git/info/exclude` 追加 `/.worktrees/` 是同一个做法（M7 §6.3）。

### 5.2 流水与折叠

每份流水是 UTF-8 的 JSON Lines，一行一条记录，只追加：

```ts
// src/data/journal.ts
export interface JournalRecord<Op extends string = string> {
  readonly v: 1
  readonly seq: number            // 本文件内从 1 起连续
  readonly at: string             // ISO 时刻
  readonly actor: 'human' | 'llm' | 'harness'
  readonly relay?: string         // llm 替人做时人的原话，至多 500 字符
  readonly by?: { readonly session?: string, readonly agent?: string, readonly tool?: string, readonly callId?: string, readonly commandId?: string }
  readonly op: Op
  readonly id: string             // 记忆的 name 加范围，经验或候选的 id；base 记录为 "*"
  readonly reason?: string        // 至多 300 字符
  readonly evidence?: readonly string[]
  readonly data?: JsonValue       // 操作的内容；删除时是被删条目的快照
}
```

记忆的操作：`base`（迁移）、`store`、`review`、`forget`、`restore`、`learn-notified`（每七天的学习摘要提醒发过一次，只写在项目的记忆流水里，`id` 取 `*`，`data` 带组键摘要，§3.6 第 2 步）。经验的操作：`propose`、`import`、`new`、`into`、`revise`、`confirm`、`retire`、`drop`、`expire`、`reopen`、`delete`、`restore`、`hit`、`recur-notified`。每个操作在 `model.ts` 里有一个纯函数 `applyRecord(state, record)`，不读时钟与文件；折叠就是按文件顺序逐条调用。

- 坏行：解析不了、字段不合、操作对当前状态不成立（例如对不存在的经验 `into`）的行跳过，记下行号与原因，计入 `bad`。读出的状态与坏行一起交给调用方，行健康与面板写「N 行读不出」。
- 顺序以文件为准，`seq` 只用来发现并发异常：`seq` 与上一条相同（两个写者在锁失效时按同一份状态算出了同一个号）或小于上一条的行照样按文件顺序应用，计入 `seqAnomalies`，行健康写「流水 seq 重复或回退 N 处（锁可能失效过）」；不把它们当坏行，所以调用方已拿到成功的写不会在折叠时丢掉。
- 末行没有换行：可能是另一个进程正在写，也可能是崩溃留下的半行。读的一方忽略它。写的一方在锁里，所以这时它一定是崩溃留下的：先补一个 `\n` 把它封成一行坏行，再追加新记录。坏行留在文件里，不改写。
- 读缓存：按路径记 `{size, mtimeMs, state}`；每次读先 `stat`，没变就用缓存，变了整读并折叠。读有两个入口：异步的 `journal.read(path)` 给工具、提醒与服务；同步的 `journal.readSync(path)`（`statSync`、`readFileSync`）只给 `depth`（§3.7 第 2 步）。两者共用缓存与折叠函数。
- 大小：估算每年不到 1 MiB（经验与候选几十到几百条，命中每天几条）。不做轮换；文件超过 8 MiB 时行健康写「流水超过 8 MiB」。面板整读的上限是 32 MiB（`dsh-api-workspace-files/README.md`:65）。

流水是事实源，没有另存的快照（`docs/CHARTER.md` §7.1 条款 11：一处动作只记一个事实源）。

### 5.3 锁、并发与崩溃

写的一方（工具、harness、命令、命令行）都只经 `journal.append(path, plan)`。锁用仓库里已有的 `src/data/lock.ts`（`acquireLock`、`LockEnvironment`、`LockOptions`、`WriteLock`；规则板最小一片建成，规则板的写入和 M7 的门禁锁已在用，`docs/ORCHESTRATION.md` §17.6）。M5 不写第二份锁，也不给这个模块加选项：它的 `LockOptions` 已经含 M5 要的全部值，`m5` 节点 2026-10-30T13:12Z 的裁定是——真要加，就加在这一份上，照 `LockEnvironment` 的做法。

1. 进程内按路径排队（Windows 上路径先小写），同一进程里的写一个接一个。排队在 `journal.ts` 里，只省时间和保次序，真正排他的是锁文件。
2. 准备目录：`acquireLock` 要求锁文件所在的目录已经存在。路径在项目目录里时，第一次用这个目录之前先调 `project-root.ts` 的 `ensureProjectDir(dir)`（先 `ensureIgnored`，再建目录，§5.5）；路径在用户级目录里时 `mkdir -p`。做不成返回 `io`，不取锁。目录之后被删掉（人手动删，或 `git clean -fdx`）而进程里的「已准备」标记还在时：第 3 步的 `acquireLock` 创建锁文件遇到 `ENOENT` 会把错误抛出来（`src/data/lock.ts`:127–128 只吞 `EEXIST`），`append` 接住它，清掉这个目录的标记，回到第 2 步再准备一次并再取锁一次；还是失败返回 `io`，行健康写原因。于是 `.llm/` 被删之后的下一次写入就把它建回来，不必重启宿主（R4-07）。
3. 取锁：`acquireLock(<文件>.lock, realLockEnvironment, {retryMs: 50, waitMs: 2000, staleMs: 30000, bootToleranceMs: 120000, holder: 'm5:<行名>', keepStale: true})`。这五个值就是 `docs/ORCHESTRATION.md` §17.6 记的「M5 的值」（50 毫秒、2 秒、30 秒、120 秒）。返回 `'busy'` 时 `append` 返回 `busy`。陈旧的判法归模块：持有者进程已经不在，或锁里的 `at` 比 30 秒更老，或锁里的开机时刻与现在相差超过 120 秒，三者之一成立就接手，旧锁改名为 `<文件>.lock.stale-<毫秒>` 留着。进程已不在算陈旧是模块自己的规则（同一台机器上进程已死是确定的；进程号被别的进程占用时按活着算，往久等的一侧错）；M7 §15 U14 担心的 `process.kill(pid, 0)` 在 Windows 上的行为，随这个模块的测试一并核对，M5 不重复。120 秒的容差吸收两次计算之间的取整与时间同步的小幅校正；墙钟被大幅改动时最坏是把一把正被持有的锁判为陈旧，后果由第 5 步的 `held()` 与 §5.2 的 `seq` 规则兜住。
4. 在锁里：读出并折叠当前状态（不用缓存），调用 `plan(state)` 得到要追加的记录或拒绝；拒绝就放锁返回。这一步保证「先判后写」看到的是最新状态：两个会话同时并同一条候选，后到的判出 `stale`。
5. 追加之前调 `held()`：锁文件里的令牌不是自己的（自己的锁已被别人判为陈旧并接手）就放弃这次写，返回 `busy`，控制台告警一次，行健康写「锁被判陈旧过」，这一次的写由调用方重试。然后末行封口（§5.2），追加记录（`seq` 取当前最大加一），`fh.sync()`，关闭。`held()` 到追加之间的毫秒级窗口由 §5.2 的 `seq` 规则兜住：两个写同时进行时，`seq` 相同的两行都按文件顺序应用，不丢已确认的写。
6. 释放：任何一步抛错也在 `finally` 里调 `release()`；模块只在令牌还是自己的时才删锁文件，所以第一个写者不会删掉第二个写者的锁。

跨进程（桌面版宿主、headless 探针、Kiro 里的命令行）都经同一把锁。读不取锁。

### 5.4 迁移

记忆行读项目目录时：有 `memory.jsonl` 就只读它；没有而有 `memory.json`（版本 1，`src/memory/store.ts` 的格式）时，在内存里把它转成状态：每条成为 `type: project`、`kind: fact`、`legacy: true`、`source: []` 的条目，`created`、`lastReviewed`、`reviews` 原样，`name` 取原 `id`（不是 kebab-case 的规整成 kebab-case，冲突时加 `-2`）。第一次写入时，在锁里先写一条 `base` 记录（`data` 是转出的完整状态），再写这次的记录，然后把 `memory.json` 改名为 `memory.json.migrated-<毫秒>`。

- 旧文件解析失败：不迁移、不覆盖、不写新流水；读与写都返回 `io`，`message` 写「旧记忆文件读不出：<原因>」，行健康降级。这延续现有 `loadStore` 的规矩「A corrupted store must surface, never silently reset」。
- 改名失败：新流水已在，下一次读只认新流水；行健康写「旧文件还在，已迁移」，下一次写入时再改名。
- 本仓库现在只有 1 条（`glm-hourness-handoff`，2026-10-27 的交接，已经过时）。迁移把它保留为没有出处的事实，按衰减淡出索引，卫生检查列出它（§4.9）；删不删由 agent 按卫生结果定。

### 5.5 项目根与项目目录

仓库里只有一份项目根模块：`src/data/project-root.ts`（规则板最小一片建成，规则板、M3 的快照流水和循环板都在用它，`m5` 节点 2026-10-30T13:04Z、13:12Z 的批注）。M5 直接用它的三样：`projectOf(cwd, home?)`（同步，只读文件、不起 git 进程：从 `cwd` 往上找 `.git`，是目录则仓库根是它的父目录，是文件〔git 工作树〕则读 `gitdir:` 与那里的 `commondir` 回到主检出；找到 `.git` 的结果按 `cwd` 缓存；用户主目录与盘符根永远不是项目；不在 git 仓库里时只认已有 `.llm/` 的目录；没有项目时返回 `undefined`）、`gitDirOf(root)`、`ensureIgnored(root, directory)`（把 `<directory>/` 追加进仓库的 `info/exclude`，已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 之一就不重复，不在 git 仓库里不做事，写不进去时抛错，调用方这时不建目录）。M5 不建异步版的 `projectRootOf`、注入的 `probe` 或用 `git check-ignore` 的忽略函数：它们与这一份做同一件事，不另写第二份（`m5` 节点 13:12Z 的裁定）。

M5 没有给这个模块加「可注入文件系统」或「异步读」的选项，因为用不上：投影的 `init` 要求同步（rc.3），`projectOf` 就是同步的；工具、提醒与服务调同步函数的代价只是对几个很小的文件做 `stat`，找到 `.git` 的结果还有缓存；测试用真实的临时目录（`docs/DEVELOPMENT.md` §1 允许，同规则板的做法）。将来真有需要，选项加在这个模块上，照 `lock.ts` 用 `LockEnvironment` 的做法，不另写模块。

M5 在同一个文件里只加两个函数：`projectDirOf(cwd, home?)`，返回 `join(projectOf(cwd, home).root, '.llm')`，没有项目时返回 `undefined`（规则板 0.10 §7.1 说的「数据目录服务给的 `projectDirOf(cwd)`」与 §7.4 里 `openRulesBoard` 的 `projectDir` 参数对应它）；和下面的 `ensureProjectDir(dir)`。`projectDirOf` 不写任何东西：不建目录，也不碰 `.git/info/exclude`。规则板 0.10 §7.1 的括号把它描述成连带追加忽略条目，那是 `ensureIgnored` 的事，所以规则行在建 `.llm/rules/` 之前继续调 `ensureIgnored`（或 `ensureProjectDir`），不能因为有了 `projectDirOf` 就去掉这一步，否则别的项目里 `.llm/rules/` 会没有忽略条目。请规则板把 §7.1 的括号改成同样的话，记在 `rules` 节点上，等自举之后（§13 第 4 条，R4-04）。数据目录服务的成员 `projectDirOf(cwd)` 先看 `projectOverride`（§5.1 第 1 条），没有再调同名函数。`projectDirOf` 这一层的结果：

- `git: true`：`<root>/.llm/`，不存在时在第一次写入时建。
- `git: false`：只有 `<cwd>/.llm/` 已经是一个目录时才有项目，否则没有项目，`project` 范围返回 `no_project`，用户级范围照常，什么都不建。行健康写「这个文件夹不在 git 仓库里，也没有 .llm/：本项目范围的记忆与经验不可用；要用就在这里建一个 .llm 文件夹」。理由：在桌面、下载这类文件夹里开的会话，不该因为第一次写记忆或经验就在那里多出一个 `.llm/`；不用 git 又想要项目记忆的人，建一个空的 `.llm` 文件夹就开启了。「`.llm/` 在不在」模块每次 `stat` 一次，所以建了之后下一次写入就生效；已开的会话的面板投影在会话创建时算过路径，要新开会话才显示。
- 用户主目录与盘符根：没有项目，不论有没有 `.git` 与 `.llm/`（免得 `~/.llm` 成了所有会话共用的项目）。

于是主检出与它的工作树（例如 `.worktrees/split`）是同一个项目；委派子会话的会话头 `cwd` 就是父会话的目录（subagent:346–355），也落在父会话的项目里。

`ensureProjectDir(dir)`（`project-root.ts` 里的函数，`journal.append` 在第一次往一个项目目录写之前调，每个进程每个目录一次）：目录的名字是 `.llm` 时先 `await ensureIgnored(dirname(dir), '.llm')`，再 `mkdir -p`；`projectOverride` 给的目录（探针、标定、测试，在仓库之外，名字不是 `.llm`）只 `mkdir -p`。`ensureIgnored` 抛错时这次写入得 `io`，`.llm/` 不被建出来，行健康写原因（「不能把 .llm/ 加进 <根> 的 .git/info/exclude：<原因>；本项目范围的记忆与经验暂时不能写」）——这与 `docs/ORCHESTRATION.md` §16.3 里规则板的做法一致（写不进 `info/exclude` 时不在没被忽略的情况下建 `.llm/rules/`）：别的项目的 `git status` 不会冒出一个没人认的 `.llm/`。读不受影响。目录之后被删掉时，`append` 清掉这个目录的「已调过」标记再调一次（§5.3 第 2 步，R4-07）。模块不问 git 这个目录是否已被 `.gitignore` 忽略，只看 `info/exclude` 里有没有那一行，所以本仓库（`.gitignore` 已有 `.llm/`）也会多一行本地的 `.llm/`，无害；不起 git 进程，所以不依赖宿主 PATH 里有 git。
### 5.6 像密钥的文本

`looksSecret(text, skip?: readonly SecretClass[]): SecretClass | undefined`（`src/data/secret-shape.ts`，纯函数，不用 Node 内置模块；编排层包内的 M7 交回处理也导入它，§8.1 第 5 条）。返回命中的类别，没命中返回 `undefined`；`skip` 只给 §5.7 的 `checkRefs` 用，其他调用方不传。按下表从上到下判，第一条命中即返回：

| 类别 | 判据 | 例 |
| --- | --- | --- |
| `prefix` | 命名前缀 `sk-`、`ghp_`、`gho_`、`ghs_`、`github_pat_`、`xoxb-`、`xoxp-` 出现在开头或一个非 `[A-Za-z0-9_]` 字符之后，后接至少 16 个 `[A-Za-z0-9_-]`；或 `AKIA` 后接 16 个 `[A-Z0-9]` | `ghp_` 加 36 个字符；`task-3`、`risk-shared-desktop` 里的 `sk-` 前面是字母，不命中 |
| `bearer` | `Bearer ` 后接至少 20 个 `[A-Za-z0-9._~+/=-]` | 请求头里的令牌 |
| `pem` | `-----BEGIN ` 加若干大写字母与空格加 `PRIVATE KEY-----` | 私钥头 |
| `token` | 至少 32 个连续字符取自 `[A-Za-z0-9+=_-]`（不含 `/` 与 `.`），并且其中同时有数字、大写字母与小写字母 | 40 个字符的大小写加数字混排串 |
| `hex` | 至少 32 个连续的十六进制字符，前后不是 `[A-Za-z0-9]` | 完整的 sha256 摘要 |

为什么是令牌形状而不是「32 个以上的 base64 字符」：base64 字母表含 `/` 与大小写字母，普通的正斜杠路径（`cli/packages/core/src/context/sections/memory`，45 个字符）与长驼峰标识符（`buildProviderEndpointRoutingHeaders`，35 个字符）都会命中，那等于把 m5-1 要取消的「带路径就存不进」从另一个口子带回来。路径里的 `/` 与 `.` 把字符串切成短段；标识符没有数字，或没有大写；随机令牌三样都有。代价：中间带 `/` 的 base64 密钥可能被切成几段而漏判，命名前缀与 `Bearer` 两条兜住最常见的来源，经验与记忆的流水在 `.llm/` 与用户级目录，不进 git。

哪些字段过它：记忆的 `name`、`description`、`body`、`relay`；经验与候选的坑、解法、`situation` 四组的每一项。证据（经验、候选与流水记录的 `evidence`）与出处（记忆的 `source`）的每一项不直接过它，而是经 §5.7 的 `checkRefs`：先按写法解析，再按写法决定判哪些类别。命中就整条拒收（记忆 `secret_like`，经验 `secret_like`，`propose` 返回 `rejected`），什么都不写，流水里也不记被拒的内容。

提交号的例外（在 `checkRefs` 里）：一项整项是 7–40 位十六进制，或是 `commit:` 后接 7–40 位十六进制，都按提交号放行，不判 `hex`；`commit:` 后面不是 7–40 位十六进制时这一项按 `invalid` 拒（`field: evidence` 或 `source`），不进 `looksSecret`。harness 自己写的 `commit:` 加 40 位十六进制（§4.1）因此不会被判为像密钥。正文里 7–12 位的短提交号本来就不到 32 位。

拒绝信息写出命中的类别，只在 `hex` 一类时建议写短提交号：

- `prefix`、`bearer`、`pem`：`looks like a secret (<类别>: <前缀或 Bearer 或 PEM header>); remove it`。
- `token`：`looks like a secret (token shape: 32+ letters and digits mixing upper and lower case); remove it`。
- `hex`：`looks like a secret (hex: 32+ hex digits); remove it, or write a short commit id instead of a full one`。

理由：经验与候选会进简报（发给模型服务）、交回摘要，经 M7 的退路批注还会进被提交并推到远端的图；范围 `all` 的记忆（关于人本人的）会出现在别的项目的索引里。一段报错里的令牌会跟着扩散；拒收比事后清理容易。经验只在本项目（`d-memory-scope`），没有跨项目扩散这一条理由，上面几条已经够了。

`redactSecrets(text, skip?: readonly SecretClass[]): string`（同一个文件，同一张类别表）：把文本里每一段命中某个类别的连续字符换成 `[redacted]`，其余原样。循环板 0.6 §6.6 让运行结果在交给主 Agent 之前过它（它写明「M5 没合入时用 `src/loops/redact.ts` 里同一组模式，M5 合入时删掉换成它」），脚本原文里有密钥形状的字串时 `loop_propose` 也用同一组模式判（循环板 0.6 §14）。`skip` 同 `looksSecret`：运行结果里常有完整的提交号（40 位十六进制），循环板可以传 `['hex']` 保留它们，由循环板定，M5 不替它定。`looksSecret` 与 `redactSecrets` 共用一张模式表，所以一个文本 `looksSecret` 返回 `undefined` 当且仅当 `redactSecrets` 不改它（L2 的性质测试，用同一批固定用例）。

L2 固定用例（`tests/data-secret-shape.spec.ts` 测 `looksSecret`，`tests/data-evidence.spec.ts` 测 `checkRefs`）：

- 必须收下：`cli/packages/core/src/context/sections/memory` 作记忆正文；`reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts` 作 `project` 记忆的 `source` 与经验的 `files`；`buildProviderEndpointRoutingHeaders`、`stripTopLevelMarkdownHtmlComments` 作正文；`coding-plan/start-plan`；作 `source` 与证据的 40 位提交号，裸写与 `commit:` 写法各一次；候选证据 `commit:` 加 40 位十六进制（harness 拼出的那一种）；证据 `task:task-3`、`node:risk-shared-desktop`、`node:recommend-last@2026-10-29T11:39`；`session:session-` 加一个 UUID；`call:call_00_` 加 24 个大小写字母与数字（`call:` 之后共 32 个令牌字符）。
- 必须拒收，并核对类别：`ghp_` 加 36 个字符（`prefix`）；40 个字符的大小写加数字混排令牌（`token`）；`-----BEGIN RSA PRIVATE KEY-----`（`pem`）；`Bearer ` 加 30 个令牌字符（`bearer`）；正文里的 64 位十六进制（`hex`）；证据 `call:ghp_` 加 36 个字符（`prefix`，`call:` 的 id 仍判这一类）。
- 必须按 `invalid` 拒（不是 `secret_like`）：证据 `commit:` 加 `ghp_` 令牌；证据 `commit:xyz1234`；证据 `node:Recommend_Last`（不合 `ID_PATTERN`）。

### 5.7 证据与出处的写法

经验与候选的 `evidence`、流水记录的 `evidence`、记忆的 `source` 共用一套写法。`parseRef(item)` 把一项解析成下表的一种，`checkRefs(items, field)` 逐项校验并按写法调 `looksSecret`，返回第一处不合格（`invalid` 或 `secret_like`，带 `field` 与项的下标）或解析结果（`src/data/evidence.ts`，纯函数，不用 Node 内置模块，面板也导入）。每项 1–200 字符，不含换行。按表从上到下认，第一种认得出的算数：

| 写法 | 规则（不合时 `invalid`） | 例 | `looksSecret` 判哪些类别 |
| --- | --- | --- | --- |
| `commit:<sha>` | `sha` 是 7–40 位十六进制，不分大小写，存为小写（同图的 `COMMIT_PATTERN`，`src/graph/schema.ts`） | `commit:cae6ddf`；`commit:` 加 40 位 | 不判（提交号） |
| `node:<id>`、`task:<id>` | `id` 合图的 `ID_PATTERN`（`^[a-z][a-z0-9-]{0,47}$`）；可带 `@<时刻>`（`YYYY-MM-DDTHH:MM`，可带秒与 `Z`），指向那一刻的批注或历史 | `node:recommend-last@2026-10-29T11:39`；`task:task-3` | 全部 |
| `session:<id>`、`call:<id>`、`command:<id>` | `id` 是 1–128 个 `[A-Za-z0-9_.:-]` | `session:session-` 加 UUID；`call:call_00_…` | 只判 `prefix`、`bearer`、`pem`，不判 `token`、`hex` |
| `http://`、`https://` 开头 | 不含空白 | 工单地址 | 全部 |
| 整项是 7–40 位十六进制 | — | `cae6ddf` | 不判（提交号） |
| 其他 | 文档节、路径、运行记录，原样存 | `docs/DEVELOPMENT.md §7`、`.agents/tasks/m1-l4/report.md` | 全部 |

以 `commit:`、`node:`、`task:`、`session:`、`call:`、`command:` 开头的项一定按那一种判，后面不合语法就是 `invalid`，不会落到「其他」里被收下。裸写的 7–40 位十六进制按提交号认；一个恰好全由十六进制字符组成的节点 id（如 `deadbeef`）会被认作提交号，要指节点就写 `node:`。记忆的 `source` 另要求至少一项「能识别」（§3.2）：`node:<id>` 或裸写的节点 id 在图里，路径在项目根下，提交号，地址。

`session:`、`call:`、`command:` 的 id 不判 `token`、`hex`：这三种 id 由宿主或模型服务生成，不是从报错或人的话里抄来的。会话 id 是 `session-<序号>` 或 `session-<UUID>`（session:1802；api-session-controller:509、879）；工具调用 id 是模型服务返回的 `block.id`，宿主原样用作 `exec.callId`（agent-loop:512），GLM 适配层也原样转交服务给的 id（`src/glm-llm/anthropic.ts`），长度与字符由服务定，本设计不假定它短于 32 个字符。`prefix`、`bearer`、`pem` 三类照判，所以 `call:` 后面贴一个 `ghp_` 令牌仍被拒。

harness 拼证据时先按同一语法查拿到的值：`propose` 的 `task:`、`session:`、`commit:`（§4.1）。不合语法的那一项不写：`propose` 照收候选，在收下结果的 `notes` 里写明；`session:` 取不到合语法的值时用 `context.session` 的 id（§4.1，评审 R3-05）。`call:`、`command:` 这两种写法只在 agent 引用运行记录时用（例如 `lessons_merge` 的证据）；汇报细度由主 Agent 带原话写（§3.7），harness 不拼这两种证据。

流水记录的 `by`（`session`、`agent`、`tool`、`callId`、`commandId`）是宿主给的身份字段，不是证据：只按 id 语法（1–128 个 `[A-Za-z0-9_.:-]`）校验，不过 `looksSecret`；不合语法的字段不写，其余照写。

## 6. 宿主契约与 rc.3 证据

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据并经 L3 或 L4；「新用」指 M5 第一次用，实现时补进接口对照表与 `src/shared/dsh-min.ts`；「M3 新用」「M7 新用」指那两份设计先用。

| 契约 | M5 的用法 | 文件与符号（行） | 状态 |
| --- | --- | --- | --- |
| `tools/post-execute` 瀑布 `(exec, result, next)`；决定 `{kind: 'accept', content?, value?, additionalContexts?}` 或 `{kind: 'block', feedback, additionalContexts?}`；监听器抛错由外层捕获，结果变成错误 | 失败匹配（追加 `additionalContexts`） | tools:3588–3628（`postExecute`）；外层 try/catch 见 3597 的注释 | 新用；同一接缝 DSH 自己的 repeat-tool-reminder 在用（repeat-tool-reminder:2247–2260） |
| 被 `tools/pre-execute` 拒绝的调用、工具体抛错的调用也走 post-execute | 失败文字包括拒绝与工具错误 | tools:3337–3353（拒绝走 `post-result`）、3416–3420（工具失败仍走 post-execute） | 实读 |
| `additionalContexts` 的元素是 `createUserMessage` 形状的用户消息，`source.form: 'notice'`；agent 循环把它们放进下一步的收件箱，下一次请求里在这次工具结果之后 | 失败提醒的位置 | repeat-tool-reminder:2235–2245（形状）；agent-loop:492–506、572（`acceptContext`） | 实读；GLM 路由上的位置〔未核实，U2〕 |
| shell 工具的结果值：`exitCode`、`timedOut`、`aborted`、`stdout{text, truncated}`、`stderr{text, truncated}` | 判失败、取失败文字 | tool-pwsh:267–290（`canonicalPwshResult`）；tool-bash:303 | 实读 |
| host 级 `tools/post-execute` 看得到子 agent 的调用（`exec.agent` 是子 agent） | worker 的失败也匹配 | 分发按 `scopeTarget(this, exec.agent)`（tools:3600），与 pre-execute（tools:3320）同一做法；pre-execute 看得到子 agent 已由探针 `glm-dispatch` 实测 | 推断〔U1〕 |
| `system-prompt/assemble` 瀑布；`assembly.tools` 可改 | 子 agent 的工具面去掉记忆工具与 `lessons_merge` | system-prompt:356–405 | 已用 |
| cordis 监听器顺序：`prepend` 放到前面（`unshift`），其余追加（`push`）；瀑布从最外层开始；分发按 `Context.filter` 过滤作用域 | 过滤监听器不用 `prepend`，方言的 `memorySectionApplies` 才看得到过滤后的工具 | cordis:335–345（`register`）、317–325（`waterfall`）、258–264（`dispatch`） | 实读；组合后的效果〔U3〕 |
| `agent/created`（serial，`{agent, source}`） | 给子 agent 装过滤；给根 agent 装索引与候选提醒 | agent:581–585 | 已用 |
| `agent/pre-step` 与公共库 `installStepNotice`；notice 要带 `id` 与 `role` | 索引、候选提醒、复发提醒 | agent-loop:901–925；`src/shared/step-notice.ts`；`createUserNotice`（`src/shared/dsh-min.ts`:462） | 已用 |
| 会话头 `cwd`；子会话头带 `parentSession`、`origin: 'subagent'` | 项目目录；根与子 agent 的判定 | session:1820–1826；session:1051–1053；subagent:346–355（`childSessionMeta`） | 已用 |
| M3 附录 0.5 §2.4 的主 Agent 判断：`isMainAgent` 先看设计行的投影，再核对这个项目的持有者记录；M3 为 M5、M7 导出的是 `mainAgentOf(userHome, dir)`（找持有者记录里的会话）与 `holderHome(ctx)` | 候选、复发与学习摘要提醒只给主 Agent；M5 经薄访问器 `isMainAgentFor(ctx, agent)`（`src/shared/main-agent.ts`）调 `mainAgentOf`，比会话 id（§4.2.1） | M3 附录 0.5 §2.4；`src/design/mode.ts`:174 的 `isMainAgent(deps, agent)` 今天不导出，也不是 M5 的入口 | M3 新用；导出名与形状〔推断，U19〕；取不到按「设计行不在」处理并在行健康写原因 |
| `session.deriveMessages()` 给出请求可见的历史（已应用压缩） | 索引与提醒的去重、压缩后重注 | session:1672–1686 | 已用 |
| `sessionProjections.register({key, stateSchema, init(header, inheritedEventCount), apply, wire{viewSchema, view}, stateVersion})`；`init` 在 `session/created` 时调用 | 投影 `hournessMemory`、`hournessLessons` 把流水的路径交给面板 | session-projection:51–63、68–102 | 已用（`graphLive`）；`init` 读文件是新用 |
| `remote.workspaceFiles.readBytes`、`stat`、`changes`：文件的读与监视不限于工作区，按组合文件系统的读权限；整文件读上限 32 MiB | 经验页读本项目的两份流水，和用户级目录里的记忆流水 | `dsh-api-workspace-files/README.md`:12、28、34、40、58、65 | 新用（规则板设计 §9.2 也这样用）；桌面版上读工作区外的文件〔U4〕 |
| `commands.register`：`name` 匹配 `/^[a-z][a-z0-9_-]*$/u`；`recordInput` 缺省为记；调用参数带 `agent` 与 `commandId` | `/memory`、`/lessons` | commands:148–180、266–269、379–385 | 已用 |
| `tools.register` 与输出 schema 子集；执行按名解析，与工具面无关；工具体收到 `exec`（`agent`、`callId`） | 六个工具；工具体查调用方 | tools:2974–2984、3227–3260、3406、3637–3640；`docs/DESIGN.md` §2.4a | 已用 |
| 工具调用 id：`exec.callId` 就是模型服务返回的 `block.id`；会话 id 是 `session-<序号>` 或 `session-<UUID>` | 证据 `call:`、`session:` 的写法，以及它们不判 `token`、`hex` 的理由（§5.7） | agent-loop:512；session:1802；api-session-controller:509、879 | 实读 |
| `ctx.get` 读服务、`ctx.provide` 提供服务、`ctx.inject` 在可选服务到达时开子 fiber | 读数据目录、图、方言服务；提供两个服务；可选地拿 `commands` 与 `sessionProjections` 而不改记忆行的激活条件 | cordis:763–766、800–830、1600 | 已用 |
| DSH 自己的 AGENTS.md 也是一条 `<system-reminder>` 用户消息，在第 1 步插在认领的消息之后；候选文件是 `AGENTS.md` 与 `CLAUDE.md` | 索引的位置与它并列；Memory 节 Z8 原句里的 `CLAUDE.md` 在 DSH 里成立 | agent-instructions:17、324–334、897–908、1406–1424 | 实读；两条消息的先后〔U10〕 |
| 子 agent 调 `userQuestions.ask` 被拒（`DELEGATED_CALLER`） | 子 agent 的经验与记忆只能经交回给主 Agent，不能直接问人 | user-questions:534 | 实读 |

ZCode 的事实（Memory 节的文字〔实读，逐字〕取自 3.17.1 的 `reference/zcode-3.17.1/zcode.cjs`，偏移是该文件里的字符位置；机制类事实仍按 `reference/ZCode` 的 3.16.2 源码读，U8）：

| 事实 | M5 的用法 | 位置 |
| --- | --- | --- |
| Memory 节的全文（四类、frontmatter、链接、写入纪律、召回的内容是背景） | §3.5 的原句 | 3.17.1 `buildMemorySection`，`zcode.cjs` 偏移 12841055（`default-index` 一支含 Z6）；机制参照 ZCode context/sections/memory.ts:30–64 |
| Memory 节在系统提示词，`MEMORY.md` 索引在请求开头的用户上下文，前一句「Contents of …/MEMORY.md (user's auto-memory, persists across conversations):」 | 索引是用户消息，不是系统提示词的一节 | 前一句在 3.17.1 `zcode.cjs` 偏移 12839520（`d3a`）；位置机制 ZCode context/builder.ts:152–160、199–207；context/sections/request-user-context.ts:73–85 |
| 索引至多 200 行、25,000 字符，超出时附警告 | 同样的上限与一句自己写的警告（3.17.1 的警告字句不同，偏移 12837642，不称原样） | ZCode memory/index-content.ts:3–4、37 |
| 语义召回分支默认关闭 | 不做语义检索 | 3.17.1 `zcode.cjs` 偏移 12843307（`resolveProjectMemoryRetrievalBranch(!1)`） |

本仓库的事实（不是宿主契约，M5 依赖而不改）：

| 事实 | M5 的用法 | 位置 |
| --- | --- | --- |
| `memorySectionApplies` 按本次 `next()` 的工具判三个记忆工具都在 | 子 agent 不出 Memory 节；工具名不变 | `src/glm-prompt/index.ts`:117–120；`src/shared/tool-names.ts` 的 `MEMORY_TOOL_NAMES` |
| 常驻名单 `ORCHESTRATION_RESIDENT_TOOLS` 已含三个记忆工具 | 「记忆工具常驻」已由 split 做到，M5 加探针断言 | `src/shared/tool-names.ts`:25–30 |
| 现有衰减公式与召回加成 | 搬进 `model.ts` | `src/memory/store.ts` 的 `strength`、`strengthen` |
| 探针每个场景用自己的数据目录，并核对真实用量流水不变 | 扩到记忆与经验的三份流水（用户级记忆、项目记忆、项目经验） | `scripts/probe/run-probe.mjs`:127–130、`scripts/sandbox.mjs` 的 `dataRows` |
| 图节点的历史项：`actor`、`op`、`changes`（改动前后的值）、`reason`、`relay`（`comment` 之外的 `llm` 写入才带，`comment` 的 `relay` 被引擎丢掉）、`text`（批注正文）、`from`、`to` | 学习信号（§3.6 第 1 步） | `docs/ORCHESTRATION.md` §2.6、§2.9；`src/graph/schema.ts` 的 `HistoryEntry`；`src/graph/engine.ts`:150、154 |

不做的：不注册 Remote 服务、不加瀑布、不追加自定义会话事件（第三方都做不到，`docs/DEVELOPMENT.md` §5、`dsh-session/README.md` 70 行）；harness 给模型的文字都是带本项目来源的 notice。

## 7. 失败预案

按 `d-failure-plans`：不穷举边角，按操作写清怎样发现、怎样重试、怎样恢复、事后从哪里查。两行自己出问题时一律偏向「不给建议」而不是「挡住工作」：经验与记忆都是建议，缺了它们 agent 照常干活。

### 7.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| `tools` 服务不在 | 本行不注册任何东西（`inject` 里有 `tools`，cordis 不会激活本行） | 行健康「未加载」 |
| 某个工具注册失败（重名、输出 schema 被拒） | 撤掉本行全部注册 | inactive，写明原因 |
| `commands` 不在（经 `ctx.inject` 可选地取） | 工具照常；没有输入框里的 `/memory`、`/lessons`，删除与恢复仍可经主 Agent 的对话做 | degraded「没有命令服务，输入框里的 /memory、/lessons 不可用」 |
| `sessionProjections` 不在 | 工具照常；经验页看不到数据（`available` 为假） | degraded |
| 数据行不在 | 用户级的记忆（关于人本人的，范围 `all`）不可用，项目范围的记忆和经验照常（项目目录靠 `project-root.ts` 的 `projectDirOf`，不靠数据行；`projectOverride` 只在数据行在时有，探针与标定总带着数据行） | degraded「没有数据目录服务：用户级的记忆不可用」 |
| 记忆行有旧配置 `home` | 忽略 | 行健康的说明里写一次「行配置 home 已不再使用（M5）」 |

### 7.2 运行期

| 操作 | 失败的情形 | 怎样发现 | 重试 | 恢复 | 留痕 |
| --- | --- | --- | --- | --- | --- |
| 读流水 | 文件不在 | `ENOENT` | — | 当作空 | — |
| 读流水 | 坏行、`seq` 回退、操作不成立 | 折叠时计数 | — | 跳过坏行，其余照用；面板与行健康写「N 行读不出」，卫生检查列出行号 | 坏行原样留在文件里 |
| 读流水 | 权限、超过 32 MiB、其他 I/O 错误 | 抛错 | 下一次调用再读 | 工具返回 `io`；提醒这一步不注入；失败匹配这一次不推 | 控制台告警一次，行健康 degraded |
| 写流水 | 锁被占超过 2 秒，或追加之前 `held()` 发现自己的锁已被别人接手 | `acquireLock` 返回 `'busy'`；`held()` 为假 | 50 毫秒一次，至多 2 秒；被接手的这次写放弃 | 工具返回 `busy`，`hint`「retry in a moment」；harness 的写（命中、过期）丢掉这一次，下次再算 | 告警一次；接手的情形行健康「锁被判陈旧过」 |
| 写流水 | 陈旧锁（持有者进程已不在，或 `at` 在 30 秒以前，或开机时刻相差超过 120 秒；判法归 `src/data/lock.ts`） | 锁文件的内容 | 模块接手后继续取锁 | 照常写；被误判的持有者在追加前用 `held()` 发现令牌不是自己的，放弃，也不删别人的锁 | 改名留下的 `.stale-<毫秒>`（`keepStale`）；`seq` 异常计数 |
| 写流水 | 写或 `fsync` 失败（磁盘满、`EPERM`） | 抛错 | 不自动重试 | 工具返回 `io`；可能留下半行，下一次写入时封口成坏行 | 告警一次；坏行计数 |
| 判写（在锁里） | 状态已变（候选已并、条目已删） | `plan` 拒绝 | — | `stale` 或 `not_found`，带当前状态 | 无写入 |
| 项目目录 | 会话没有 `cwd`；`cwd` 是主目录或盘符根；不在 git 仓库里且没有 `.llm/`；`.git` 文件读不出 | `projectDirOf` 的结果 | 不在 git 仓库里的文件夹：每次定目录都重看 `.llm/` 在不在 | 没有项目：`project` 范围 `no_project`，索引只用用户级；不建 `.llm/` | 行健康写原因；不在 git 仓库里时写怎样开启（建一个 `.llm` 文件夹） |
| 准备项目目录（`ensureProjectDir`） | 写不进 `.git/info/exclude`（`ensureIgnored` 抛错）、建目录失败 | 异常 | 下一次写入再试 | 这次写入得 `io`，`.llm/` 不被建出来，读不受影响；用户级的记忆照常写 | 行健康写原因；告警一次 |
| 项目目录被删（人手动删，或 `git clean -fdx`） | 进程里的「已准备」标记还在，创建锁文件遇到 `ENOENT` | `acquireLock` 抛出的 `ENOENT` | 清掉这个目录的标记，再准备一次、再取锁一次（§5.3 第 2 步） | 第二次成功则这次写入照常，`.llm/` 被建回；仍失败返回 `io` | 行健康写原因；告警一次 |
| `learning_signals` 与学习摘要提醒 | 图读不出；经验流水读不出；`learn-notified` 写不进 | 引擎 `load()` 的返回；`journal.read` 的错误；`append` 的返回 | 下一次调用或下一个小时的检查再试 | 图读不出：返回 `graph: 'unavailable'` 与靠记忆流水的信号，不抛错；经验流水读不出：`learned` 只算记忆与图上的落点；`learn-notified` 写不进：这一步不注入提醒，本进程一小时内不再试（先写记录再注入，所以不会没记录就提醒、也不会每步重复提醒） | 告警一次；行健康 degraded |
| 迁移 | 旧文件读不出；改名失败 | §5.4 | 改名在下一次写入时重试 | §5.4 | 行健康 |
| 索引提醒 | 组装抛错 | `try/catch` | 下一步再试（历史里还没有索引） | 这一步不带索引 | 告警一次，行健康 degraded |
| 失败匹配、索引与提醒的监听器 | 监听器内部抛错 | `try/catch` | — | 返回下游的决定，工具结果不变 | 告警一次，行健康 degraded |
| `relevant`（M7 调） | 读存储失败、内部抛错 | `try/catch` | M7 下次派发再调 | 返回空数组，简报不带经验（M7 已有「服务抛错或超过 2 秒时不带经验」） | 行健康 degraded |
| `propose`（M7 调） | 校验不过、像密钥 | 返回 `{status: 'rejected', code, field?}` | 不重试（结果是确定的） | M7 不写退路批注，只在交回摘要里记「N 条候选经验被拒：<代码>」（§8.1 第 5 条）；被拒的内容不落盘 | 交回摘要的计数与代码；经验行的拒收计数（行健康、`stats`） |
| `propose`（M7 调） | 写失败（`busy`、`io`）、没有项目目录、内部抛错 | 返回 `{error}` | M7 不重试，走退路 | M7 把候选写成任务上的批注，写之前逐字段过 `looksSecret`，命中的字段换成「（像密钥，已略去）」；经验行之后导入（§4.2 第 2 步） | 任务上的批注；告警一次 |
| 导入批注 | 图读不出、批注格式认不出 | 引擎返回、解析失败 | 图读不出时 60 秒后的下一次检查再试（§4.2 第 2 步） | 认不出的整句当坑导入；图读不出就不导 | `import` 记录；行健康 |
| 导入批注 | 批注的字段不合格或像密钥 | `propose` 同一套校验与 `looksSecret` | 不重试 | 不导入；写一条 `import` 记录，`data` 为 `{rejected: <代码>}`，不带批注内容，所以只试一次；卫生检查列出所在节点 | `import` 记录；卫生检查 |
| 源节点核对 | 图行不在、图读不出 | `graphService` 为空或抛错 | — | 节点 id 形状的出处按形状收下，记 `unchecked`；卫生检查以后再核 | 条目上的 `unchecked` |
| 命令 `/memory`、`/lessons`（输入框） | 输入不认识；目标不在；写失败 | 解析与 `plan` | 人再发一次 | 错误行写人能照着做的中文 | 命令事件；成功时的流水记录 |
| 对话里删除或恢复（`lessons_merge delete`、`restore`，`memory_forget`） | 没带 `relay`；目标不在；写失败 | 工具体的校验与 `plan` | 主 Agent 补上人的原话再调 | `user_only`、`not_found`、`stale` 或 `busy`，带正路；主 Agent 把原因转告人 | 成功时的流水记录（身份 `llm`，带原话与调用 id） |
| 面板读（只读） | 读不出、监视断开 | `readBytes` 与 `changes` 的错误 | 15 秒后再读 | 保留上一次读到的，顶上写原因 | 无 |
| 第一批经验导入 | 中途失败 | 命令行退出码 | 重跑 | 按签名跳过已导入的 | 每条一条 `new` 记录 |
| 两个根会话同时合并 | 同一条候选 | 第二个在锁里判出 `stale` | — | 主 Agent 读结果里的当前状态 | 只有一条 `into` |
| 宿主重启 | 内存里的缓存、冻住的细度 | — | — | 从文件重建；每个会话的汇报细度第一次问到时重读（可能与重启前不同，这个会话的系统提示词变一次，缓存失效一次） | — |

### 7.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 删经验、删记忆 | 丢内容 | 只是追加一条带快照的记录，状态改为墓碑；人能恢复（经验与记忆都能：对主 Agent 说一句，主 Agent 带原话恢复，或在输入框打命令）；agent 不带人的原话恢复不了人删掉的东西，能重写事实、恢复自己收起的经验与过期或丢弃的候选；对话里删错了（主 Agent 听错或原话编造）有快照可恢复，流水里留着原话与调用 id 供追查 |
| 迁移旧 `memory.json` | 丢旧数据 | 改名保留，不删；解析失败不迁移、不覆盖 |
| 流水 | 被覆盖或截断 | 只追加；半行封口而不删；没有轮换，不重写 |
| 陈旧锁 | 误接手别人的锁让两个写同时进行 | 判法归 `src/data/lock.ts`：持有者进程已不在、`at` 在 30 秒以前或开机时刻相差超过 120 秒才接手；旧锁改名保留，不删；追加前 `held()` 核对令牌，不是自己的就放弃这次写；释放只删令牌是自己的锁；万一两个写重叠，`seq` 相同的两行都按文件顺序应用，不丢已确认的写（§5.2） |
| 被拒的候选经验经 M7 退路写进图 | 图提交并推到 Gitee，删掉要改写历史，而 `docs/DEVELOPMENT.md` §9 不许强推 | `propose` 把拒收（`rejected`）与服务失败（`{error}`）分开，只有后者走退路；退路批注写进图之前，M7 逐字段过同一个 `looksSecret` 并略去命中的字段，经验服务整行不在时也这样（§8.1 第 5 条）；导入时再过一次 |
| 写别的项目的 `.git/info/exclude` | 改那个仓库的本地 git 配置 | 只经 `ensureIgnored` 追加一行 `.llm/`（不改已有内容；已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 之一就不动；不在 git 仓库里不动）；追加不成就不建 `.llm/`；同规则行与 M7 对 `/.worktrees/` 的做法 |
| 范围 `all` 的记忆（关于人本人的）进入别的项目的索引 | 一段文字里的令牌被带到别处 | 写入前拒收像密钥的文本（§5.6）；`all` 只给 `user`、`feedback` 两类，要显式写或按类型缺省；人能删（对主 Agent 说，或在输入框打 `/memory forget`） |
| 用户 profile | 改坏用户配置 | 不写 profile；不再使用的 `home` 留着，行健康说一句，不向人提问（§11） |

### 7.4 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `memory_store` 各字段 | 见 §3.2 | 见 §3.2（含 `value` 只给 `reporting-depth`、`all` 只给 `user`、`feedback`） | `invalid`、`bad_source`、`secret_like`、`similar`、`preference_owner`、`no_project`、`no_user_dir`、`busy`、`io` |
| `memory_query` | `focus` 与 `name` 至少一个 | §3.3 | `invalid` |
| `memory_forget` | `name`、`reason` | `reason` 1–300；`relay` 1–500；`scope` 两值之一 | `invalid`、`not_found`、`preference_owner` |
| `lessons_query` | `text`、`file`、`command`、`error` 至少一个 | §4.5 | `invalid` |
| `learning_signals` | 否 | `since`：ISO 日期或时刻，不晚于现在，缺省 28 天前；`minCount`：整数 1–50，缺省 2 | `invalid`，`field`；子 agent 调用得 `role` |
| `lessons_merge` | 按动作，见 §4.2.2 | 坑 1–300；解法 1–600；情况各项见 §4.1；证据 1–8 项，每项按 §5.7（`commit:` 加 40 位十六进制收下）；`reason` 1–300；`relay` 1–500（`delete`、`restore` 必填）；没有 `scope` 参数 | `invalid`、`duplicate`、`stale`、`not_found`、`role`、`user_only`、`secret_like`、`busy`、`io` |
| `propose` 的候选（M7） | `problem`、`fix`，情况的四项（`files`、`commands`、`tools`、`errors`）至少一项非空（与 §4.1、lessons-1 一致，评审 R3-04） | 同上；`errors` 至多 5 项、每项 8–300（不够长的丢弃，收下结果的 `notes` 里注明；丢弃后四项全空的候选按 `invalid` 拒）；`scope` 若有，取 `project` 或 `all`，两者都存进本项目，`notes` 注明；每个字符串字段过 `looksSecret`；上下文的 `task`、`childId`、`commit` 按 §5.7 的语法查，不合的那一项不进证据（`childId` 不合时用 `context.session` 的 id），`notes` 注明，候选照收 | 返回 `{status: 'rejected', code: 'invalid' \| 'secret_like', field}`，不抛、不写；`{error}` 只给服务内部失败 |
| `relevant` 的参数（M7） | `session`；`paths`、`tools`、`commands` 可为空数组 | 每组至多 50 项；`limit` 1–10 | 多余的截掉；`session` 缺失返回空数组 |
| 证据与出处的每一项（经验、候选、流水记录的 `evidence`，记忆的 `source`） | 按所在字段 | §5.7 的写法，1–200 字符，不含换行 | 带前缀而不合语法：`invalid`（`field` 带下标）；像密钥：`secret_like`；`source` 没有一项能识别：`bad_source` |
| `/memory`、`/lessons` 的输入（输入框） | 是 | §3.4、§4.7 的几种写法 | 错误行，列出能用的写法 |
| 流水的每一行 | — | §5.2 的结构与每个操作的 `data` 形状 | 坏行 |
| 旧 `memory.json` | — | 版本 1 | `io`，不迁移 |
| 命令行的操作文件 | 是 | 一组 `lessons_merge` 的参数（`new` 为主） | 退出码 1，逐条写出不合格的项，已写入的不回滚（按签名可以重跑） |
| 数据行配置 `projectOverride` | 否 | 非空的绝对路径 | 忽略，行健康写明 |
| 六个工具的其他字段 | 不收 | — | `invalid`（rc.3 不校验原样注册的工具参数，工具体自己查，同图工具） |

### 7.5 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 经验与记忆不拦任何调用 | 两行都不在 `tools/pre-execute` 注册监听器；`tools/post-execute` 的监听器只追加上下文、不返回 `block`；契约测试断言两行注册的事件只有 `agent/created`、`agent/pre-step`、`tools/post-execute`、`system-prompt/assemble`（agent 作用域），记忆行另有既有的 `llm/stream`（用量流水，只观察） | 「经验只是建议，不是规则」（`lessons` 节点、`d-rules-human-only`） |
| 只有人删经验、撤偏好 | `model.ts` 的权限表（`apply(actor, op)` 先查表）：`human`（输入框命令）什么都能做；`llm` 做 `delete`、`restore`、删偏好，要带 `relay`（人的原话），没带得 `user_only` 或 `preference_owner`；`harness` 只写 `propose`、`import`、`into`（自动并入）、`drop`（自动丢弃）、`expire`、`hit`、`recur-notified`、`review`、`learn-notified`；工具体按调用方与 `relay` 判 | 身份在 harness 的入口核对，不靠提示词（`docs/CHARTER.md` §6）；原话本身 M5 不核对（§2.3） |
| 子 agent 不写记忆与经验 | 工具面过滤（让模型看不到）；工具体按会话头的 `origin` 拒绝（按名直接调用也拦住） | 工具面过滤不是安全边界（`docs/DESIGN.md` §2.4a）；worker 的经验经交回由主 Agent 合并 |
| 每个状态变化都有一条记录 | `journal.append` 是唯一的写入口；记录必带身份与时刻，删除带快照 | 条款 11 |
| 一个项目的数据不进另一个项目 | 项目目录只按会话头的 `cwd` 定位（或测试与探针的 `projectOverride`），不读 profile 里的 `home`；经验没有用户级的一份 | §8.2 定案「混在一起会互相污染」，`d-memory-scope` |
| 会话内系统提示词不变 | 索引是对话里的 notice；`depth(sessionId)` 按会话冻住 | 提示词缓存（`docs/DESIGN.md` §6 第 2 条） |
| `project` 事实以出处为准（D2） | `memory_store` 的第 2 步；召回时带出处；卫生检查出处是否还在 | 单一事实源（`docs/CHARTER.md` §10） |
| 标定与探针不读真实的经验与记忆 | `dataRows` 设 `projectOverride` 与 `dshHome`；探针核对三份真实流水不变 | 否则标定结果随经验的积累漂移（`risk-calib-read`） |
| 像密钥的文本不进存储 | `looksSecret`（正文类字段）与 `checkRefs`（证据与出处，§5.7）在所有写入口之前，在 `model.ts` 的校验里，工具、`propose`、命令、命令行与 harness 的写都经它 | 经验与候选会进简报、交回摘要和（经 M7 退路）被推到远端的图；用户级的记忆会进别的项目的索引 |
| 面板不写 | 页面不调用任何命令，L2 的静态检查要求 `ui/src/lessons/` 下的源码不含 `commands.execute` | plain-ui 0.7 §4.7、§3.1：面板只看不操作 |

### 7.6 可测性

纯函数在 L2 直接测：记忆的 `classify`、`strength`（注入时钟）、校验的每一条（含 `all` 只给 `user`、`feedback`，`feedback` 不写 `scope` 得 `invalid`，`value` 只给 `reporting-depth`）；`memory_store` 与 `lessons_merge` 工具说明里的示范交给同一个校验函数，断言通过（§3.2、§4.2.2）、相似、索引的渲染（顺序、遮蔽、淡忘、上限与警告）、旧格式转换；经验的签名、相似、权限表（`llm` 带与不带 `relay` 的 `delete`、`restore`）、每个 `applyRecord`、派发打分、失败匹配（规整、长度、去重、至多 2 条）、查询打分、复发计数与每周上限、渲染（每行 300 与 400 字符上限、截断次序）；`correctionSignals` 与 `recurrences`（图历史不手写：测试用真实的图引擎在临时目录里写一次带 `relay` 的 `edit`、一次人身份的 `edit`、一次不带 `relay` 的 `llm` 的 `edit`、一次带 `relay` 的 `reject`、两次不带 `relay` 的 `comment`（正文分别以 `ANSWER_MARKS.reject`、`ANSWER_MARKS.add` 开头）、一次 `done` 到 `doing` 的带 `relay` 的 `status`，再经引擎读回，断言：前两次 `edit` 成为 `edit:` 信号，第三次不是；`reject` 成为 `reject:` 信号；两次批注分别成为 `chat:reject`、`chat:add`，而且读回的批注历史项确实没有 `relay`（钉住 `engine.ts`:150 的行为，引擎改了这里测试先失败）；重开成为 `reopen:` 信号；`learning_signals` 的返回、`learningDigest` 的渲染与每七天一次的节流判断（注入时钟：没有 `learn-notified` 时到点；6 天 23 小时不到点；满 7 天到点；到点但没有合条件的组不记录也不注入；先写记录再注入，写失败不注入）；`looksSecret` 与 `redactSecrets`（§5.6 的三组固定用例，拒绝信息的类别；同一批用例上两者一致）；`projectDirOf` 与 `ensureProjectDir`（git 仓库、工作树、主目录与盘符根、不在 git 仓库里有与没有 `.llm/`、建了 `.llm/` 之后下一次就认出；`ensureIgnored` 抛错时不建目录、名字不是 `.llm` 的目录只建不忽略；`projectOf` 本身的行为由它自己的测试管，M5 不重测）；`parseRef` 与 `checkRefs`（§5.7 的每种写法、提交号的两种写法不判 `hex`、`commit:` 后不是十六进制时 `invalid`、`call:` 加 32 个大小写字母与数字的 id 收下、`call:` 加 `ghp_` 令牌判 `prefix`）；`pathsMeet` 与 `globMatch`（§4.3 的通配对通配用例）；经验 id 在流水里查重（注入的随机源先给出撞号的 id，第二次取到别的）；`seq` 重复的两行都应用并计入 `seqAnomalies`；`harness` 身份写偏好一律是坏行。

经验服务在 L2 加：`propose` 收到带 `ghp_` 令牌的候选返回 `{status: 'rejected', code: 'secret_like', field}`，流水没有新行，假的 M7 交回处理（测试替身，按 §8.1 第 5 条写）没有调用退路批注；`propose` 在锁被占时返回 `{error: 'busy'}`，替身写退路批注，批注里像密钥的字段换成「（像密钥，已略去）」；导入一条带令牌的 `[候选经验]` 批注两次，第一次写一条 `import` 记录（`data.rejected` 为 `secret_like`），第二次不再写。`propose` 的上下文带 40 位十六进制的 `commit` 时返回 `{status: 'candidate'}`，候选证据里是 `commit:<40 位>`；对这条候选做 `lessons_merge new {candidate}` 成功，另一条同样带 40 位提交号的候选 `into` 一条已有经验也成功，经验的证据里多了这一项；`context.commit` 是 `xyz` 时候选照收、证据里没有 `commit:`、`notes` 写明；`context.childId` 不合语法时证据里的 `session:` 取 `context.session` 的 id（R3-05）；只带报错片段、`files`、`commands`、`tools` 都为空的候选照收（R3-04）；带 `scope: "all"` 的候选存进本项目、`notes` 写明。`lessons_merge` 的 `delete` 不带 `relay` 得 `user_only`，带了变成墓碑，`restore` 带 `relay` 恢复，子 agent 调用得 `role`。导入的触发：注入的时钟与假图服务，第一次计算扫一次；图的修订没变时 60 秒后不再扫；修订变了且过了 60 秒时再扫并导入新批注；`propose` 返回 `{error}` 之后的下一次计算不等 60 秒就检查。

记忆行在 L2 加：开局时存储为空的根 agent 第一步没有索引，`memory_store` 之后的下一步有一条，再下一步没有（§3.3）；`memory_store {name: "reporting-depth", value: "concise", relay}` 写入一条偏好，不带 `relay` 或 `value` 不是三档之一或用在别的名字上得 `invalid`；新进程（空缓存）里第一次调 `depth(sessionId)` 就同步读出流水里的档，不返回 `undefined`；同一会话里第二次问仍是第一次的值；`memory_forget reporting-depth` 带 `relay` 之后下一个会话的 `depth` 为 `undefined`。

失败匹配在 L2 加：GLM 路由上名为 `Bash` 的调用（结果值是 `pwsh` 的形状）退出码 1、stderr 含片段时推提醒；非 GLM 路由上名为 `pwsh` 的同样推。

存储在 L2 用临时目录里的真实文件测（`docs/DEVELOPMENT.md` §1 允许 mock 文件系统，这里用真实的临时目录更接近事故，同规则板设计 §14）：两个 Node 子进程各追加 200 条，`seq` 连续、没有丢；末行半行在读时被忽略、在下一次写时被封口；`journal.append` 传给 `acquireLock` 的是 M5 的五个选项值（用注入的 `LockEnvironment` 与 `bootTime` 断言：开机时刻差 60 秒不接手、差超过 120 秒接手并留下 `.stale-` 文件）；追加前锁已被别人接手时放弃并返回 `busy`；锁被占 2 秒以上返回 `busy`；`fsync` 失败（注入）返回 `io`；旧 `memory.json` 的迁移、读不出时不覆盖、改名失败之后的再试。锁本身的行为（`wx`、令牌、接手）由 `src/data/lock.ts` 的测试管（`tests/rules-engine.spec.ts`、`tests/execute-gate-lock.spec.ts`），M5 不重测。

宿主侧在假宿主 `tests/fake-rc3.ts` 上测，假宿主为此补 rc.3 的这些信号：`tools.execute` 在工具体之后走 `tools/post-execute` 瀑布，`accept` 的 `additionalContexts` 进下一步的收件箱，拒绝的调用也走它（tools:3337–3353、3599–3627）；shell 工具的结果值带 `exitCode` 与 `stderr`；`system-prompt/assemble` 的监听器按 `prepend` 与否排序（cordis:335–345）；子会话头带 `origin: 'subagent'`；会话投影的 `init(header)`。不 mock 契约之外的东西。真实组合里的过滤、索引、失败提醒、两条第 1 步消息的先后在 L3 探针里测（§10.1）；面板与工作区外文件的读取要 L4。

### 7.7 行健康

`HOURNESS_ROWS` 在 `memory` 之后加 `lessons`，按会话上报。

| 行 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- |
| memory | 写明本会话的项目目录与用户级目录、两边的条目数（偏好、推测、事实）、本会话是否已带索引 | 会话没有工作目录或不算项目；不在 git 仓库里且没有 `.llm/`（写明建一个 `.llm` 文件夹即可开启）；没有数据目录服务；旧文件读不出、旧文件还在；流水有 N 行坏行；流水超过 8 MiB；`ensureIgnored` 抛了错、`.llm/` 没建成；行配置 `home` 已不再使用；索引提醒抛过错；锁被判陈旧过；没有命令或投影服务；`learning_signals` 读图失败过或 `learn-notified` 写失败过；取不到 M3 的主 Agent 判断（`mainAgentOf` 缺失、形状不符或没有持有者记录），摘要提醒改发所有根 agent |
| lessons | 写明本项目的生效经验数、开着的候选数、本会话推过几条失败提醒 | 同上的目录与流水问题；失败匹配抛过错；`relevant` 或 `propose` 失败过；导入批注失败；没有命令或投影服务；取不到 M3 的主 Agent 判断，候选与复发提醒改发所有根 agent |

`/glm-status` 与 `/hourness-status`（split 第 4 步）都列出这两行。

## 8. 与其他特性的接口

### 8.1 M7（派发简报与交回，设计 0.6 已放行）

M7 0.6 §3.5.5 已按 M5 请的五处写过（`lessons` 节点 2026-10-29T19:14Z 的批注：M7 0.3 采纳，0.6 保留）。M5 照它提供。服务契约：

```ts
// src/lessons/service.ts（编排层内部的契约，M7 的执行行经 ctx.get 读）
export const LESSONS_SERVICE = 'glmHournessLessons'
export interface RelevantQuery {
  readonly session: SessionLike            // 定位项目（主 Agent 的会话）
  readonly paths: readonly string[]
  readonly tools: readonly string[]        // 别名或原生名都行，内部换成原生名
  readonly commands: readonly string[]
  readonly limit?: number                  // 1–10，缺省 5
}
export interface RelevantLesson { readonly id: string, readonly when: string, readonly problem: string, readonly fix: string, readonly line: string }
export interface LessonCandidateInput {
  readonly problem: string, readonly fix: string
  readonly files: readonly string[], readonly commands: readonly string[], readonly tools: readonly string[]
  readonly errors?: readonly string[]      // 报错片段
  readonly scope?: 'project' | 'all'       // M7 0.6 仍传这个字段；d-memory-scope 之后不起作用，两个值都存进本项目（§4.2 第 1 步）
}
export interface LessonProposeContext { readonly session: SessionLike, readonly task?: string, readonly childId?: string, readonly commit?: string }
// 证据由这几项拼出（§4.1、§5.7）：task:<task>、session:<childId，不合语法时 session.id>、commit:<commit，7–40 位十六进制，原样写全>
export type ProposeResult =
  | { readonly status: 'candidate' | 'merged' | 'dropped', readonly id: string, readonly notes?: readonly string[] }  // 收下；notes 写收下时去掉的部分（§4.2 第 1 步）
  | { readonly status: 'rejected', readonly code: 'invalid' | 'secret_like', readonly field?: string }  // 拒收：什么都不写，M7 不走退路
  | { readonly error: 'busy' | 'io' | 'no_project' | 'internal', readonly message: string }            // 服务内部失败：M7 走退路批注
export interface LessonsService {
  relevant(query: RelevantQuery): Promise<readonly RelevantLesson[]>   // 从不 reject
  propose(candidate: LessonCandidateInput, context: LessonProposeContext): Promise<ProposeResult>  // 从不 reject
  stats(session: SessionLike, since: string, until: string): Promise<LessonStats>
  hygiene(session: SessionLike, now: string): Promise<readonly HygieneFinding[]>
}
```

M7 0.6 已接住的五处，这里只留 M5 一侧要做的：

1. `relevant` 的查询与 `propose` 的上下文都带 `session`；`LessonProposeContext.session` 必填。
2. 交回结构 `hourness-handback-v1` 的 `lessons` 每项可带 `errors`（至多 5 项，每项 8–300 字符）与 `scope`，都不进 `required`。M5 对 `scope` 的处理见上面的类型注释。
3. 退路批注末尾带候选的 JSON，导入时无损（§4.2 第 2 步）。
4. 工具名：`LESSONS_TOOL_NAMES = ['lessons_query', 'lessons_merge']`，常驻名单只加 `lessons_query`。
5. 按结果分三路，退路批注不带密钥：`candidate`、`merged`、`dropped` 在交回摘要里记计数；`rejected` 不写退路批注，只记计数与代码；`{error}` 或经验服务整行不在时写退路批注，写之前逐字段过 `looksSecret`（`src/data/secret-shape.ts`，M5 的 A1 建，M7 的交回处理先需要时谁先合入谁建，另一方导入），命中的字段整项换成「（像密钥，已略去）」。图节点文件由主 Agent 提交并推到 Gitee `origin`，令牌写进去要改写历史才删得掉，而 `docs/DEVELOPMENT.md` §9 不许强推，所以这是预防。M7 交回处理的 L2 用假的经验服务覆盖三路。

对 M7 0.6 的一条新请求（`d-freeze-until-dogfood`：放行的设计与进行中的实现现在不收新请求，记成 `m7` 节点上的批注，等自举之后）：`d-memory-scope` 之后经验没有范围，请把交回结构 `lessons` 每项的 `scope` 与退路批注 JSON 里的 `"scope":"project"` 去掉。不去也不坏：M5 收到 `scope` 照收并存进本项目，只在 `notes` 里提一句。

M7 其余的接缝照用：简报约束栏的那一句「When a command fails or a tool behaves unexpectedly, search the lessons board before working around it.」；简报里经验至多 5 条、合计至多 1,500 字符（M5 的 `line` 每条至多 300）；复盘节点的 `候选经验：` 一栏由主 Agent 处理完之后用 `lessons_merge new` 落成经验，证据写复盘节点 id（M7 §3.15）；`候选标定题：` 是 M7 固定的栏名，§3.6 按它读。M7 的周报（P2）与巡检（P3）调 §4.9 的 `stats`、`hygiene`（M7 0.6 §3.5.5、§3.12.4 已采纳）；没有经验行时这两节不出现。§3.6 的 `correctionSignals` 与 `recurrences` 不在 M7 已采纳的接口里：M7 0.6 的周报没有「纠正与学习」一节，规范阶梯的输入也不是 M5 的组。M5 因此不把学习流水线挂在 M7 上，由记忆行的 `learning_signals` 与每七天一次的摘要提醒送到主 Agent（§3.6 第 2 步，R4-02）；M7 日后愿意在周报里列同样的数，可以调记忆行服务 `glmHournessMemory` 的 `learningDigest(session, since, until)`（返回 `learning_signals` 同一份结构，§8.6），那是 `m7` 节点上自举之后再办的请求（§13 第 3 条），不是前提，也不阻塞 m5-4 的任何一条验收。

worker 的写入门禁不碰经验与记忆：`lessons_query` 是只读工具；记忆工具不在 worker 的工具面里，按名调用也被工具体拒绝（§2.3）。

### 8.2 plain-ui（面板，设计 0.7）

- 板块登记表 `ui/src/graph/boards.ts`（plain-ui 0.7 §4.7）：M5 登记 `id: 'lessons'`、`label: '经验'` 一块，接口是 `subscribe` 加 `snapshot`，`BoardState` 的 `homeLine`、`guideLine` 为 `null`，`peakApplies` 为 `false`。记忆的几节放在这一页里，不另登记 `memory`，所以不需要 plain-ui 改它的 `Board.id` 联合与页脚（§4.7）。
- 页面没有写入控件，不经任何命令写；删除与恢复在对话里说（`lessons` 节点 2026-10-30T06:11Z 与 plain-ui 0.7 §4.7 末段「经验板：人删条目也在对话里说（M5 定）」）。0.3 的按钮、撤销提示和「同 `/graph-apply` 的通道」删去，`/graph-apply` 本身 plain-ui 0.7 已删。
- plain-ui 的首页先落地时，M5 的 P1 只往登记表里登记；M5 先落地时，P1 按 plain-ui §4.7 的接口建登记表，并在现有面板底部放一行「经验 ›」作为临时入口，plain-ui 改首页时换成它的页脚。两种先后都只改 `boards.ts` 与入口一处。
- 页面的组件与样式用 `ui-primitives`（`docs/ORCHESTRATION.md` §13），人话与 plain-ui §3.2 的一套词一致：「经验」「记忆」「恢复」；板上的字照它的换词表写，不出现人没学过的词。

### 8.3 规则板（设计 0.10）

- 复发的坑走 `rules_propose` 记提议、M3 的 `propose_to_human` 交给人（规则板 0.10 §9.3）。M5 不生成规则，也不生成规则的提议正文。
- 公共的存储件已经在仓库里：`src/data/project-root.ts`（`projectOf`、`gitDirOf`、`ensureIgnored`）与 `src/data/lock.ts`（`acquireLock`），规则板的写入和 M7 的门禁锁在用，M5 用同一份（规则板 0.10 §10.7 M5 一条、`m5` 节点 13:04Z 与 13:12Z 的批注）。规则板和 M7「谁先合入谁建」的安排已经兑现，没有新请求。
- 规则板 0.10 §7.1 与 §7.4 等着数据目录服务给出 `projectDirOf(cwd)` 与 `projectOverride`（规则行的 `openRulesBoard` 现在没有 `projectDir` 参数，等它们合入时加）：M5 的 A1 提供。M5 的 `projectDirOf` 只返回路径，不追加 `.git/info/exclude`（§5.5）；规则板 §7.1 的括号写成它连带追加，所以规则行要继续在建 `.llm/rules/` 之前调 `ensureIgnored`。这是 `rules` 节点上自举之后再办的一条请求（§13 第 4 条，R4-04），现在不要求规则板改代码。
- 违规流水搬进会话所属项目的 `.llm/` 归 M4 §2.4 与 guard，不归 M5（§1.4）。
- 第一批经验第 7 条的解法不写影子期（`d-code-rules-enforce`，§4.8）。规则板 0.10 §10.7 撤回过的那条请求（删掉「先影子」一句）因此没有对象；M5 对规则板没有新请求。

### 8.4 M3（附录 0.5）

- 汇报细度：M3 附录 0.5 作废了 `design_review`、五键卡和它的 `depth`（§2.2 去向表第 7、9 项），「讲细点」「说重点」是人说的话，只改这一次怎么讲，「写进画像属于 M5」（§3.7）。M5 不观察任何 M3 工具，也不改 M3 的任何函数。
- 学习信号：读 M3 附录 §3.5 写进图的两种固定批注开头 `ANSWER_MARKS.reject`、`ANSWER_MARKS.add`，用 `answerKindOf` 认（`src/shared/answer-marks.ts`，谁先合入谁建）。这两种批注是 `actor: llm` 的 `comment`，历史项不带 `relay`（附录 §3.5 第 6 步、`src/graph/engine.ts`:150），人的原话在正文里；同意的写入（`decide`、`approve`、`edit`）才带 `relay`。契约测试用真实引擎写、读回（§3.6、§7.6），M3 改了说法或引擎改了 `relay` 的规则，测试先失败。
- 主 Agent：M5 经薄访问器 `isMainAgentFor(ctx, agent)`（`src/shared/main-agent.ts`）调 M3 附录 §2.4 为 M5、M7 导出的 `mainAgentOf`，比持有者会话的 id（§4.2.1）。`isMainAgent(deps, agent)`（`src/design/mode.ts`:174）今天不导出，依赖设计行内部的 `deps`，不是 M5 的入口；`mainAgentOf` 的导出名与返回形状按 M3 实现后的实际改访问器这一处（§14 U19）。取不到时按「设计行不在」处理：任何根 agent 都算，行健康写原因。M5 不自己读 `hournessMainAgent` 投影或持有者记录；持有者记录在哪一级（附录 0.5 写在用户级目录，`d-rules-in-repo` 要它进项目的 `.llm/`）是 M3 的事，M5 不依赖这个位置。若 M3 日后在设计行服务上直接给 `isMainAgent(agent)`，访问器改调它，是 `m3` 节点上自举之后的可选请求（§13 第 5 条）。
- 人的原话：M3 的 `personSaid` 核对只管 `record_human_answer` 和主 Agent 写图（附录 §3.6）。M5 的 `relay` 不经它（§2.3），不要求 M3 改什么。
- 提议与记录：复发提醒、学习摘要提醒（§3.6）里让主 Agent 去提的方案，都走 M3 的 `propose_to_human` 与 `record_human_answer`，格式（四行、每次至多三件）归它们。

### 8.5 GLM 包、`question-31` C 与 `prompt-fixes`

- Memory 节在 GLM 包（`src/glm-prompt/`），由 M5 的 D1 步改。`question-31` C 的整理（方言节按 ZCode 次序、Output Style 承载人设与细度、子 agent 只拿需要的）、`prompt-fixes` 与 M3 的 `m3-main-persona` 一步（附录 §2.7：`persona.ts` 改名 `reporting-depth.ts`、节名 `glm:persona` 改 `glm:reporting-depth`）也改 `src/glm-prompt/`；各步按 `question-28` C 排队，谁先合入谁先改，后到的在它之上改。D1 只动 `localize.ts` 的 Memory 一节、新镜像文件与 `index.ts` 里经验那一句的条件，不动节的次序。
- 汇报细度一节的常设细度改读 `glmHournessMemory.depth`（R1），名字取 main 上当时的（`glm:persona` 或改名后的 `glm:reporting-depth`）。`question-31` C 把汇报细度并进 Output Style 时，同一个读法搬过去。
- GLM 包单独装时：没有记忆工具，就没有 Memory 节（现状）；没有记忆服务，汇报细度一节用配置（现状）。

### 8.6 两个包之间的契约

公共库新增 `src/shared/memory-service.ts`：

```ts
export const MEMORY_SERVICE = 'glmHournessMemory'
export type ReportingDepth = 'concise' | 'balanced' | 'detailed'
export interface MemoryService {
  /** 这个会话的常设汇报细度：第一次问到时同步读用户级记忆流水（§3.7 第 2 步），之后同一会话一直返回同一个值；没有偏好或读不出时为 undefined。 */
  depth(sessionId: string): ReportingDepth | undefined
}
/** 读服务；形状不对当作不在，并经 problem 回调告一次警（同 dialectService 的写法）。 */
export function memoryService(ctx: ServiceLookup, problem?: (message: string) => void): MemoryService | undefined
```

只放类型、常量与纯函数（`docs/DESIGN.md` §8：公共库不持有跨行共享的状态）。编排层内部另有 `src/memory/service.ts` 声明 `stats`、`hygiene` 和 `learningDigest(session, {since?, until?, minCount?})`（异步，返回 `learning_signals` 的同一份结构，§3.6 第 2 步）等成员，M7 导入它；GLM 包只认 `depth`。`learningDigest` 现在只有 `learning_signals` 和每七天的提醒在用，M7 不用它也不影响任何验收。`tests/contracts.spec.ts` 加：`MEMORY_TOOL_NAMES` 等于记忆行注册的名字；`LESSONS_TOOL_NAMES` 等于经验行注册的名字；常驻名单含 `lessons_query`、不含 `lessons_merge`；记忆行与经验行注册的事件集合（§7.5）。

### 8.7 标定与消融（`ablation`、`risk-calib-read`）

- 隔离：标定运行器用 `dataRows(dir)`（`scripts/calibrate/run-calibrate.mjs`:103），A1 给它加上 `projectOverride`，于是标定会话读不到本仓库的经验与记忆，也读不到真实用户级目录里的（`dshHome` 已指向运行目录）。否则同一道题会随着经验的积累得到不同的上下文，回归对比失去意义。`ablation` 把运行目录移出仓库之后，这一点照样成立。
- 消融：这一批新加的注入是记忆索引、经验的三种提醒与改写后的 Memory 节。按 M7 §12 的时机，L4 批次各做一次消融，开关由 `ablation` 在 `scripts/calibrate/` 里加（只在标定时加载，`docs/CHARTER.md` §7.1 条款 1「可关只落在插件行这一级」不受影响）。注意记忆行同时写用量流水，消融不能用禁用记忆行来代替关掉索引。

### 8.8 M8 与晨报

面板没有写入，晨报里也没有「讲细点」「说重点」按钮（plain-ui 0.7 §3.1）。人读完晨报说「太长了」，走的是 §3.7 的同一条路：主 Agent 判断是不是要一直这样，是的话带原话写 `reporting-depth`。面板的展开与收起是看的动作，不算细度信号。
## 9. 实施分解

分支 `m5`，每条线一个工作树（`.worktrees/m5-a`、`m5-b`……），都从合入 split 之后的 main 建。每步一个提交，提交信息带节点 id，文档与代码同一提交（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`（L3，`docs/DEVELOPMENT.md` §1.1）。「今天必败」是这一步新增的检查在今天的代码上怎样失败。「档」是派出去的 worker 用的推理档（`norm-verify-tiers`：规格清楚的实现用高档）。

### 9.1 步骤

| 步 | 节点 | 内容 | 文件（只这些） | 层 | 档 | 今天必败 | 独立评审 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | m5-1、lessons-1 | 存储底座：流水（异步与同步读、折叠接口、进程内排队、取 `acquireLock`、坏行、封口、`seq`、`fsync`）、`looksSecret` 与 `redactSecrets`、证据与出处的写法（`parseRef`、`checkRefs`）；在已有的 `src/data/project-root.ts` 里加 `projectDirOf`、`ensureProjectDir` 两个函数；数据行加 `projectOverride` 与成员 `projectDirOf`；`dataRows` 设它。不新建项目根模块和锁模块，也不给它们加选项（`m5` 节点 13:12Z 的裁定） | 新建 `src/data/journal.ts`、`secret-shape.ts`、`evidence.ts`、`tests/data-journal.spec.ts`、`tests/data-project-root.spec.ts`（只测新加的两个函数）、`tests/data-secret-shape.spec.ts`、`tests/data-evidence.spec.ts`；改 `src/data/project-root.ts`（加两个函数）、`src/data/index.ts`、`src/shared/data-home.ts`、`scripts/sandbox.mjs`、`package.json`（测试清单） | L1、L2 | 高 | 导入失败；两个子进程各写 200 条之后 `seq` 连续的检查失败；§5.6 的三组固定用例与 §5.7 的写法用例（`secret-shape.ts`、`evidence.ts` 还不存在，导入失败；今天的 `knowableFromGit` 会拒深层路径）；`projectDirOf` 在 `project-root.ts` 里还没有 | 是：崩溃安全、留痕与密钥判据，同规则板 R2 一类 | 无 |
| B1 | m5-1、m5-2 | 记忆模型：条目、`classify`、`strength`、校验、相似、`applyRecord`、旧格式转换、权限；索引渲染 | 新建 `src/memory/model.ts`、`recall.ts`、`tests/memory-model.spec.ts`、`tests/memory-recall.spec.ts` | L1、L2 | 高 | 导入失败 | 权限函数随 A1 一起评审 | 无（流水的记录形状按 §5.2，与 A1 并行） |
| C1 | lessons-1、lessons-2 | 经验模型与匹配：条目、候选、签名、相似、权限、`applyRecord`；派发打分、失败匹配、查询打分、复发；渲染 | 新建 `src/lessons/model.ts`、`match.ts`、`render.ts`、`tests/lessons-model.spec.ts`、`tests/lessons-match.spec.ts` | L1、L2 | 高 | 导入失败 | 权限函数随 A1 一起评审 | 无（同上） |
| M1 | m5-1、m5-2、m5-5 | 记忆行改线：三个工具的新参数与规则（含 `value`，`all` 只给 `user`、`feedback`）；按会话定目录；子 agent 的过滤；索引提醒；投影 `hournessMemory`；`/memory`；服务 `glmHournessMemory`；迁移；行健康；删 `src/memory/store.ts` 与路径判据；探针场景 | 改 `src/memory/tools.ts`、`src/memory/index.ts`、`src/shared/dsh-min.ts`、`src/shared/health.ts`（说明文字）、`scripts/probe/run-probe.mjs`；删 `src/memory/store.ts`；改 `tests/memory-audit.spec.ts`，新建 `tests/memory-tools.spec.ts`、`tests/memory-row.spec.ts`；文档 `docs/ORCHESTRATION.md` §8.1–§8.4、`docs/DESIGN.md` §2.2、§2.4、§2.4a、§2.5、§7 | L2、L3 | 高 | 含 `coding-plan/start-plan` 的文本被拒的用例失败；探针里子 agent 的请求有记忆工具 | 否 | A1、B1；与 D1 同一批合入 |
| D1 | m5-3 | 方言的 Memory 节：镜像文件、本地化、经验那一句的条件、逐字门禁登记 | 新建 `src/glm-prompt/zcode-memory-text.ts`；改 `src/glm-prompt/localize.ts`、`src/glm-prompt/index.ts`、`scripts/check-verbatim.mjs`（`MIRROR_FILES`）、`tests/glm-prompt.spec.ts`、`scripts/probe/run-probe.mjs`（首句常量）；文档 `docs/DESIGN.md` §5.2、§5.3 ⑧、§5.8 | L1、L2、L3 | 高 | 保留原句的逐句断言失败（今天的节只有 883 字符） | 否 | M1 的语义；与 `prompt-fixes`、`question-31` C 的 `src/glm-prompt/` 改动排队 |
| L1 | lessons-1 | 经验行：两个工具（含 `lessons_merge` 的 `delete`、`restore`）、服务 `glmHournessLessons`、候选提醒、复发提醒、`/lessons`、投影 `hournessLessons`、导入批注、命令行、登记 | 新建 `src/lessons/index.ts`、`tools.ts`、`service.ts`、`notices.ts`、`import.ts`、`cli.ts`、`scripts/lessons/cli.ts`、`tests/lessons-row.spec.ts`；改 `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（`disabled: true`）、`src/shared/health.ts`、`src/shared/tool-names.ts`、`tests/contracts.spec.ts`、`package.json`、`scripts/probe/probe-dispatch.mjs`、`scripts/probe/run-probe.mjs`；文档 `docs/ORCHESTRATION.md` §8.6（新）、`docs/DESIGN.md` §2.2、§2.4、§2.4a、§2.5、§7、`docs/DEVELOPMENT.md` §12 之后加命令行一节 | L2、L3 | 高 | 契约测试：`LESSONS_TOOL_NAMES` 与注册不符 | 否 | A1、C1；登记文件与 M1 排队（先合入的先改） |
| L2 | lessons-2 | 失败匹配与命中记录 | 新建 `src/lessons/failure.ts`、`tests/lessons-failure.spec.ts`；改 `src/lessons/index.ts`、`tests/fake-rc3.ts`（post-execute 瀑布）、`scripts/probe/run-probe.mjs` | L2、L3 | 高 | 失败的 `pwsh` 调用之后下一次请求没有经验提醒 | 否 | L1 |
| S1 | lessons-4 | 第一批经验 | 操作文件放在 `.agents/tasks/<实施运行>/`（不入库）；仓库里只加一个固定数据的导入测试 `tests/lessons-seed.spec.ts`（两条样例，导入两次只多两条） | L2；导入后真实存储上查一次 | 常规 | 导入两次多出重复的检查失败 | 否 | L1 合入 |
| P1 | lessons-3 | 面板：经验页（含记忆的几节，只读）、板块登记（只登记 `lessons`） | 新建 `ui/src/lessons/LessonsPage.tsx`；改或新建 `ui/src/graph/boards.ts`、`ui/src/hourness-client.tsx`；`tests/lessons-panel-model.spec.ts`（客户端的折叠与视图模型，含「源码不调用 `commands.execute`」的静态检查） | L2、L4 | 高 | 板块登记表里没有 `lessons`；静态检查找得到按钮或命令调用 | 否 | L1、M1；plain-ui 的 `boards.ts`（没有时按 §8.2 自建） |
| R1 | m5-5 | 细度闭环的读一侧：汇报细度一节读服务 `glmHournessMemory`（契约在公共库）；写的一侧已在 M1（`memory_store` 的 `value`） | 新建 `src/shared/memory-service.ts`；改 `src/memory/index.ts`、`src/glm-prompt/index.ts`、`src/glm-prompt/persona.ts`（M3 的改名步骤合入后是 `reporting-depth.ts`）、`tests/memory-row.spec.ts`、`tests/glm-prompt.spec.ts`、`tests/contracts.spec.ts` | L2、L3 | 高 | 写入 `reporting-depth` 之后新会话的汇报细度一节仍是配置的默认 | 否 | M1；与 `question-31` C、`prompt-fixes` 与 M3 的 `m3-main-persona` 对 `src/glm-prompt/` 的改动排队（谁先合入谁先改，节名取 main 上当时的） |
| G1 | m5-4 | 学习信号、复发与出口 | 新建 `src/memory/signals.ts`、`src/memory/learning.ts`、`src/shared/main-agent.ts`、`tests/memory-signals.spec.ts`；改 `src/memory/tools.ts`（`learning_signals`）、`src/memory/index.ts`（摘要提醒、`learn-notified`）、`src/memory/service.ts`（`learningDigest`）；`learnedFrom` 参数在 M1、L1 里已留；读 M3 的 `src/shared/answer-marks.ts`（没有时按 M3 附录 §3.5 建，谁先合入谁建） | L2 | 高 | 导入失败；`learning_signals` 在真实图上返回空而 L2 通过（以 §7.6 的真实引擎样例防） | 否 | M1、L1；不依赖 M7 的周报；主 Agent 判断在 M3 设计行合入之前按「设计行不在」处理 |

### 9.2 并行的线

```
线 1：A1 ──► M1 ──► D1 ──► R1
线 2：B1 ──┘
线 3：C1 ──► L1 ──► L2 ──► S1
线 4：            （M1 与 L1 之后）P1
线 5：            （M1 与 L1 之后）G1
```

A1、B1、C1 三步互不碰文件，同时开工。M1 与 L1 都改登记文件（`src/shared/tool-names.ts`、`src/shared/health.ts`、`src/shared/dsh-min.ts`、`tests/contracts.spec.ts`、`scripts/probe/run-probe.mjs`），代码可以并行写，合入排队：先合入的一方先改，后到的一方 rebase 后追加（同规则板设计 §10.3 的做法）。D1 与 R1 改 `src/glm-prompt/`，与 `prompt-fixes`、`question-31` C、M3 的 `m3-main-persona` 排队。P1 改 `ui/src/graph/`，与 plain-ui 的实现排队。要桌面版的只有 L4 批次，由编排者按 `risk-shared-desktop` 一次一个持有者做。

### 9.3 批次 L4（`docs/DEVELOPMENT.md` §1.1）

- 第一批：M1、D1、L1、L2、S1 合入之后。桌面版重启后，在本仓库与另一个临时 git 文件夹各开一个 GLM 会话：两个 `.llm/memory.jsonl` 各自生成；第二个会话的第一次请求带索引（会话日志里只读核对）；`lessons_query` 查得到第一批经验；在会话里让模型跑一条会以第 14 条的报错失败的命令，下一步看到提醒；临时文件夹的 `.git/info/exclude` 多了 `.llm/`；桌面版日志没有本包的新错误；用过模型菜单就换回 `agent-default-model`（`docs/HANDOFF.md` §6）。通过后经验行改为默认启用（`AGENTS.md` 第 4 条），在节点上记一笔。
- 第二批：P1、R1 合入之后。经验页（含记忆的几节）经 DevTools 截图核对，页面上没有任何按钮；对主 Agent 说「删掉经验 L-…」，主 Agent 带原话删，页面 15 秒内更新，「你删掉的」里有它；再说「找回来」，恢复；说「以后汇报都说重点」，主 Agent 写 `reporting-depth`，新开会话的汇报细度一节是简洁。G1 合入之后顺带核对：在本仓库的真实图上让主 Agent 调 `learning_signals`，返回里至少有一个组（图历史里已经有人经主 Agent 改过的字段和对话里否掉的方案）；在还没有 `learn-notified` 记录的项目里，主 Agent 的下一步收到一次摘要提醒，记忆流水多一条 `learn-notified`，再下一步不再来（满 7 天的情形由 L2 的注入时钟管）；U20 的数也在这里记。

批次 L4 之前，汇报里写明哪些改动还没在桌面版上跑过。

## 10. 验证

### 10.1 L3 探针场景

都在 `npm run probe` 里，场景的数据目录是自己的（`dataRows` 加了 `projectOverride` 之后，记忆与经验也在场景目录里）。探针结束时核对真实用户级目录下的 `memory/memory.jsonl` 与本仓库 `.llm/` 下的 `memory.jsonl`、`lessons.jsonl` 三份流水都没变（扩展 `run-probe.mjs`:127–130 的用量核对）；用户级目录里不应出现 `lessons/`。

| 场景 | 路由 | 做什么 | 断言 |
| --- | --- | --- | --- |
| `glm-memory` | GLM | 第一个根 agent：存一条带 `relay` 的 `feedback`、一条带出处的 `project`、一条正文含 `coding-plan/start-plan` 与 `src/shared/dsh-min.ts` 的 `reference`、一条 `reporting-depth`（`value: concise`，带 `relay`）；第二个根 agent 开局，之后再开一个新会话 | 四次都存成功；第二个 agent 的第一次请求里、第一条用户消息之后有来源 `glm-hourness-memory` 的索引，含四行；它之后的步不再带；两个 agent 的系统提示词各自逐步不变；三个记忆工具没有 `deferLoading`；`# Memory` 一节的首句是新的；新会话的汇报细度一节是 `concise`（节名取当时 main 上的），写入的那个会话的系统提示词没变 |
| `non-glm-memory` | DeepSeek 探针 provider | 同上 | 同上，没有 `# Memory` 一节（方言不接管） |
| `glm-memory-compact` | GLM | 有条目时开局，强制压缩 | 压缩检查点之后的第一次请求再带一次索引，再下一步不带 |
| `glm-worker-memory` | GLM | 主 agent 用原生 `subagent` 派一个子 agent，子 agent 试调 `memory_store` 与 `lessons_merge` | 子 agent 的请求里没有三个记忆工具、没有 `lessons_merge`、没有 `# Memory` 一节，有 `lessons_query`；两次调用都被拒（`role`），拒绝写着正路 |
| `glm-lessons` | GLM | 探针覆盖层的验证插件调 `propose` 交一条候选；根 agent 下一步；它用 `lessons_merge new`；再用 `lessons_query`；脚本化的模型带原话调 `lessons_merge delete`、`restore`；另有一步不带 `relay` 调 `delete`；人发 `/lessons delete`、`/lessons restore` | 候选提醒出现一次、合并后不再出现；`relevant` 对匹配的路径返回它；查询返回它；删除后查询不返回、恢复后返回；不带 `relay` 的 `delete` 得 `user_only`；流水里每一步一条记录，身份分别是 `harness`、`llm`、`llm`（带原话）、`human` |
| `non-glm-lessons` | DeepSeek 探针 provider | 同上的查询与合并 | 同上 |
| `glm-lessons-failure` | GLM | 场景里有一条报错片段为 `probe-lesson-fragment-1` 的经验；模型两次调 `Bash`（GLM 工具面上的 shell 别名，原生 `pwsh`）跑一条向 stderr 写这段文字并以 1 退出的命令，第三次跑一条成功的命令；再派一个子 agent 跑同一条失败的命令（U1） | 第一次失败之后的下一次请求在工具结果之后带来源 `glm-hourness-lessons` 的提醒；第二次失败之后不再带；成功的那次之后也不带；子 agent 的下一次请求也带提醒；流水里每个会话一条 `hit` |
| `non-glm-lessons-failure` | DeepSeek 探针 provider | 同上，模型调原生 `pwsh` | 同上的前三条断言 |
| `glm-only`、`hourness-only`（已有） | — | — | `glm-only` 没有 Memory 节；`hourness-only` 有两个工具行的工具，没有 GLM 方言节 |

### 10.2 L4 检查清单

见 §9.3。另：U4（面板读工作区外的文件，现在只有用户级记忆流水在工作区外）、U10（两条第 1 步消息的先后）、U13（恢复的会话装上监听器）在第一批里看。

## 11. 由 agent 定、人可推翻的事项

命名：行 `glm-hourness/lessons`；目录 `src/lessons/`；工具 `lessons_query`、`lessons_merge`、`learning_signals`（记忆工具沿用原名）；命令 `/memory`、`/lessons`；服务 `glmHournessLessons`、`glmHournessMemory`；投影 `hournessLessons`、`hournessMemory`；notice 来源 `glm-hourness-memory`、`glm-hourness-learning`、`glm-hourness-lessons`、`glm-hourness-lessons-pending`、`glm-hourness-lessons-recur`；流水 `memory.jsonl`、`lessons.jsonl`；经验 id `L-<6 位十六进制>`，候选 `C-<6 位十六进制>`；数据行配置 `projectOverride`。

做法（每项写了选它的理由与没选的做法）：

- 一个存储层、两个集合（§2.1）。没选：一个集合加 `kind`（读法不同、Memory 节离 ZCode 更远）；两套存储（重复）。
- 存放的范围照 `d-memory-scope`：关于人本人的记忆在用户级，其余（项目事实、规范、全部经验）在项目；经验不分范围。没选：经验分「本项目 / 所有项目」两档（`d-memory-scope` 取消了它）；全放全局（项目之间串、交接带不走）。
- 项目根与锁只用仓库里已有的两个模块，不加选项：投影的 `init` 要同步，`projectOf` 就是同步的，用不到异步与可注入文件系统；锁的五个值已是 `LockOptions`。没选：`projectRootOf` 异步加同步一对加注入的 `probe`（与已合入的 `projectOf` 重复，违反 `m5` 节点 13:12Z 的裁定）；M5 自己的锁（同上）。
- 记忆的类型照 ZCode 的四类，字段照它的 frontmatter：模型在这套字段上训练过，Memory 节可以大段原样。没选：沿用现在的 `id`、`text`、`tags`。
- 偏好看来源（人的原话或人的动作），不只看类型：「用户定下的」才不衰减（§8.2），推测的偏好会淡忘。没选：`user`、`feedback` 一律不衰减（agent 的误判会永久留着）。
- agent 推测的偏好不问人、会淡忘，`learning_signals` 列出、人删即撤；只有规则要人批。没选：每条推测都发确认卡（人的负担，`question-27` B）。
- 索引是对话里的一条 notice（§3.3），不是系统提示词的一节：ZCode 的位置就是用户上下文，缓存也稳。没选：系统提示词里按会话冻住的一节。
- 索引的上限照 ZCode：200 行、25,000 字符。没选：只放「强度最高的若干条」（`docs/ORCHESTRATION.md` §8.3 的原写法；条目少时整份放更贴 ZCode，淡忘的事实已经不进）。
- 子 agent 不拿记忆工具与索引，拿 `lessons_query`：`question-31` C；worker 需要的经验经简报与查询到达，偏好里需要 worker 遵守的应当是规则。没选：子 agent 各配独立记忆目录（`docs/ORCHESTRATION.md` §8.5 原写法，出自已被取代的角色卡设计 `d-role-cards`，同批改写）。
- 项目目录跟会话的工作区，忽略记忆行的 `home`：防跨项目污染。没选：`home` 继续优先（桌面版 profile 把它钉在本仓库）。
- 项目数据放工作区 `.llm/` 并追加 `.git/info/exclude`（§5.1、§5.5）。没选：用户级目录按项目分（规则板的做法；与 §8.2 的定案不符）；不碰 `exclude`、只在行健康提示（别的项目的 `git status` 会一直看到 `.llm/`）。
- 不在 git 仓库里的文件夹只在已有 `.llm/` 时算项目（§5.5）：随手打开的文件夹里不多出目录，人建一个 `.llm` 就开启。没选：用 `cwd` 本身并在第一次写入时建 `.llm/`；完全不支持没有 git 的文件夹（不用 git 的人就没有项目记忆）。
- 证据与出处一套写法（§5.7），提交号写全号 `commit:<sha>`：全号没有歧义，与 M7 交回的提交号同形；`commit:` 与裸写的 7–40 位十六进制都不判为像密钥。没选：harness 只写 12 位短号（短号与交回里的不同形，要再查一次才能对上）。
- 只追加的 JSONL 流水，不另存快照，不轮换：条目少，整读折叠够快；坏行与半行可以恢复。没选：整文件 JSON 加改名替换（现有做法，没有历史，删除留不下痕）；规则板的快照加流水（为每天几十条的写入多一套一致性检查）。
- 锁的陈旧门槛 30 秒、开机时刻容差 120 秒、等 2 秒、50 毫秒一试，作为选项传给共用的 `acquireLock`；进程已不在算陈旧是模块自己的规则。没选：改用模块缺省的 10 秒（这组值评审过，ORCHESTRATION.md §17.6 已把它记作 M5 的值，改动没有收益）。
- 像密钥的文本拒收：经验与候选会进简报、交回摘要和（经 M7 退路）被推到远端的图，用户级的记忆会进别的项目的索引。没选：存进去、读时遮盖（遮盖漏一次就扩散）。
- `lessons_query` 常驻、`lessons_merge` 延迟：前者是人要求的随时可查，后者只有根 agent 处理候选时用，提醒里写着它的名字。没选：两个都常驻（多约 900 字符的前缀）。
- 与已有经验签名相同的候选自动并入，与人删过的签名相同的自动丢弃，其余交主 Agent：完全相同的不必劳动主 Agent，人删过的不再往 agent 面前推。没选：全部交主 Agent（主 Agent 的上下文与回合更多）；相似的也自动合（会误合）。
- 查询结果带至多 2 条未审的候选并标明：并行的 worker 可以在主 Agent 合并之前用上兄弟 worker 刚交回的经验。没选：候选不可查（要等主 Agent 合并）。
- 失败匹配只认报错片段，片段至少 8 个字符，一次至多 2 条，同一会话同一条只推一次：要准，不要多。没选：按命令或工具匹配（几乎每次失败都会推）。
- 派发进简报至少 2 分，单凭工具命中不进：「用 Bash」对每个任务都成立。
- 复发门槛：28 天内 3 个会话；复发提醒每项目每周至多 2 条；人删过的复发不提醒。没选：harness 直接提规则待决（规则的内容要判断，且会给人添题）。
- 汇报细度由主 Agent 判断人的话是不是「一直这样」，是的话带原话写偏好；取最近一次写的值：人一眼看懂来由。M3 附录 0.5 作废了 `design_review`，没有可观察的工具调用，所以没有观察监听器，也没有 harness 身份写偏好的权限。没选：按人的措辞词表由 harness 判（自然语言会误判）；每次说「太长了」都改默认（一次性的抱怨会改掉之后所有会话）；按最近几次的多数平滑（人看不出为什么是这一档）。
- 第一批经验不经候选、直接以 `llm` 身份写成生效：来源是人审过的文档与图。
- 第一批经验第 7 条的解法照 `d-code-rules-enforce` 改写，不再写影子期（§4.8）：经验是给 agent 的建议，不能教与人的定案相反的做法；引号感知解析这个坑本身仍然成立，所以改写而不删。没选：保留原句（与定案相反）；删掉整条（丢掉「引号里的 `=>`、`>>>`、`->` 被当成重定向」这个还会再踩的坑）。
- 经验的文字用英文：它进简报与提醒，给模型看；面板照原文显示。没选：每条另存中文摘要（每条多一个字段，agent 要写两遍）。
- `/memory`、`/lessons` 两个命令只给人在输入框敲，记录输入：会话日志里留着人做了什么；面板不发命令（plain-ui 0.7）。删除与恢复的另一条路是对主 Agent 说，主 Agent 带原话调工具（`lessons_merge delete`、`restore`、`memory_forget`）。没选：规则板那样另设一个面板用的命令（面板没有写入了）；给 `lessons_merge` 不设 `delete`、`restore`，只留命令（人在对话里说要删时主 Agent 就没有办法办）。
- 不自动删除淡忘的事实：不进索引就不占上下文，删除留给 agent 按卫生结果判断。
- 面板只登记一块（经验），记忆的几节放在同一页下半部分，首页不加行：plain-ui 0.7 的登记表和页脚只有规则板、循环板、经验三块，另加 `memory` 要改它的设计。没选：登记 `memory` 为第二块（要 plain-ui 改 `Board.id` 与页脚）。
- profile 里不再使用的 `home` 不动，也不问人：`AGENTS.md` 规定不改用户的 profile，行忽略它并在行健康说一句，留着无害（agent 决定，可逆）。
- 对话里删除或恢复经验时的 `relay` 不由 M5 核对，写进流水供事后追查：M3 的原话核对只管主 Agent 写图，删错了有墓碑和快照；经验是建议，不是规则，删错的代价低。没选：M5 自己再做一遍原话核对（要读 M3 的会话投影，M5 的行就依赖了 M3）。
- 人要删一条经验时，`lessons_merge` 加 `delete`、`restore` 两个动作，必须带 `relay`：不另设工具，少一个常驻或延迟的工具说明。没选：新工具 `lessons_delete`。
- 学习流水线自带出口（R4-02）：只读工具 `learning_signals`（延迟）加记忆行每七天至多一次的摘要提醒（§3.6 第 2 步），不等 M7 的周报。M7 0.6 的周报只调 `stats`、`hygiene`，规范阶梯的输入是规范节点与违规记录，放行的设计又不收新请求，所以把学习流水线挂在周报上会让它在产品里不转。代价：多一个延迟工具和每七天至多一条提醒。没选：只写请求、让 m5-4 的验收等 M7 改（流水线在 M7 改之前不转）；把组塞进规范阶梯（组不是规范节点）。M7 日后愿意在周报里列同样的数是可选的请求（§13 第 3 条）。
- `feedback` 的范围必须写明（R4-03）：它既可能是人怎样干活（用户级）也可能是本项目的规范（项目），缺省哪一边都会放错一部分；`user` 仍缺省 `all`。没选：`feedback` 缺省 `project`（人的说话习惯会落进项目，换个项目就没有）；缺省 `all`（项目规范会漏到别的项目的索引里）。
- 主 Agent 的判断经薄访问器 `isMainAgentFor`（R4-06）：M3 的 `isMainAgent` 今天不导出且依赖设计行内部状态，M5 调 M3 已写明为 M5、M7 导出的 `mainAgentOf`，取不到按「设计行不在」处理；M3 的导出形状变了只改访问器。没选：M5 自己读投影与持有者记录（违反 M3 附录 §2.4 的分工）；要求 M3 现在改导出（放行的设计不收新请求）。
- 工具说明里带示范（R4-11）：`memory_store`、`lessons_merge` 各一个完整的例子，过与真实调用同一个校验函数（`d-agent-examples`）。没选：不带示范（`d-agent-examples` 要求主 Agent 交给 harness 的每一种东西配一个）。
- 项目目录被删之后的下一次写入重新准备目录（R4-07）：清掉进程内标记再试一次。没选：写入一直返回 `io` 直到重启宿主。

默认值：相似阈值记忆 0.6、经验 0.5；淡忘阈值 0.1；候选过期 30 天；复发 28 天 3 个会话；每周复发提醒 2 条；卫生「没确认」180 天、「淡忘」30 天；锁等待 2 秒、重试 50 毫秒、陈旧 30 秒、开机时刻容差 120 秒；细度缓存 500 个会话。改这些是改常量，不改设计。

## 12. 待人定的事项

只有一件：D1。按 `d-chat-not-cards` 与 `d-plain-questions` 写成对话里的四行方案，由主 Agent 用 M3 的 `propose_to_human` 交给人，放在 M5 的一页放行稿里（评审通过之后另写 `onepage.md`，九张单子的人话版本在那一页里）。不出选项表，一个方案，问题放在最后（`d-chat-not-cards`）；D1 单独交人，一次至多三件，这里一件。

为什么要人定：每个任务做完的条件，写进图之后只有人能改（必须问人的第 1 类，`docs/ORCHESTRATION.md` §2.9.1）。D1 管的是记忆与经验板拆成的九件活（`m5` 下五件、`lessons` 下四件），草稿在 §1.2。D1 是从第 3 轮评审（R3-01）和人 2026-10-29 在「经验板设计停在第三轮」一题里选的「结束设计循环，由编排方改写这两道题」来的。

给写放行稿的人：九张单子在放行稿里用人话写，点名这九件活，即记忆的分类与写入、会话开局的召回、方言里的记忆一节、从你的改动里学习、汇报长短，和经验板的存取、命令失败时的提醒、页面、第一批经验；用 `d-plain-questions` 的换词表，不写人没学过的词。疑问一行点名会改变方案的事实：推测出的习惯 14 天没被用到就淡忘，你说一句就撤；你对这一条不放心，单子里要单独写出来（R4-10）。

### D1 记忆与经验板九张「怎样算做完」的单子

背景：记忆与经验板拆成**九件活**，每件活做完的条件已经拟好草稿。

推荐：九张单子写成人话，**逐条给你看**，你改完再开工。

疑问：最没把握的是**推测出的习惯**，它不问你就记下，14 天不用就淡忘。

不做：不照草稿**直接写进项目图**，上次开发流程那十张单子你也是逐条看的。

九张单子写成人话、逐条交你看，可以吗？

### 已由 agent 决定、不问人的

D2 记忆里还存不存项目事实：存，但每条必须写出处（`source`）。理由：保留 ZCode 记忆的四类与 Memory 节原句；召回时带出处，过时的能对照出处认出来；写不出出处的存不进。没选「只存偏好不存事实」：要改掉 ZCode 的原句，agent 想记的事实每条多一次写图。没选「照旧存、不写出处」：事实在记忆、图、文档里各一份，记忆里那份会过时，现在仅有的一条就是 10-27 的过时交接。它不属于必须问人的几类（可逆的设计细节：`docs/ORCHESTRATION.md` §2.9.1 只列必须问人的几类，`design-context.md` 写「decide reversible details yourself and record them as agent decisions」），所以是 agent 决定，人可推翻；推翻时的改法见 §3.2 末与 §3.5 末。

其余新增的 agent 决定见 §11：汇报细度由主 Agent 判断后写偏好、删除与恢复经 `lessons_merge` 的 `delete`、`restore`、经验页并入记忆的几节、profile 里的 `home` 不问人。

## 13. 交给编排者记图的事项

本设计不写 `docs/graph/`。以下由编排者在人看过之后记到图上：

1. D1：主 Agent 用 `propose_to_human` 把 §12 的四行交给人，图上是一张提议式待决，没有选项表和卡片字段（`d-chat-not-cards` 之后不写这些字段）。D2：在 `m5` 上批注一条 agent 决定（内容见 §12）。
2. D1 通过后：在 `m5` 下建 `m5-1` 到 `m5-5`，在 `lessons` 下建 `lessons-1` 到 `lessons-4`，怎样算做完按 §1.2 和人的话；依赖连线：`lessons-3` 依赖 `lessons-1` 与 `m5-1`；`lessons-2`、`lessons-4` 依赖 `lessons-1`；`m5-3` 依赖 `m5-1`；`m5-4` 依赖 `m5-1` 与 `lessons-1`；`m5-5` 依赖 `m5-1`。`lessons` 对 `split` 的依赖在 `split` 关闭后自然解除。
3. 在 `m7` 上批注（等自举之后，`d-freeze-until-dogfood`；M7 0.6 已放行，不改它）：
   - 经验不分范围（`d-memory-scope`）：请把交回结构 `lessons` 每项的 `scope` 与退路批注 JSON 里的 `"scope":"project"` 去掉；不去也不坏，M5 收到 `scope` 照收并存进本项目（§8.1）。
   - 可选，不是前提（R4-02）：M7 0.6 的周报（§3.12.4）只带 M5 的 `stats`，没有「纠正与学习」一节；规范阶梯（§3.12.2）的输入是规范节点与违规记录，M5 的组进不了它。M5 的学习流水线用自己的 `learning_signals` 与每七天一次的摘要提醒送到主 Agent，不等周报（§3.6 第 2 步）。M7 日后愿意在周报里列同样的数，可以调记忆行服务 `glmHournessMemory` 的 `learningDigest(session, {since, until, minCount})`（§8.6）；加了之后 M5 的提醒不用改，周报那一节只列数，详查仍用 `learning_signals`。
4. 在 `rules` 上批注（等自举之后）：规则板 0.10 §7.1 的括号把 `projectDirOf` 描述成连带追加 `.git/info/exclude`，M5 的 `projectDirOf` 只返回路径，忽略条目由 `ensureIgnored` 或 `ensureProjectDir` 写（§5.5）。规则行合入 `projectDirOf` 时要继续在建 `.llm/rules/` 之前调 `ensureIgnored`；请把 §7.1 的括号改成同样的话，§7.4 的 `projectDir` 参数随 `projectDirOf` 一起加（R4-04）。
5. 在 `m3` 上批注（等自举之后，可选）：M5 经 `mainAgentOf` 加会话 id 比较判主 Agent（§4.2.1、§8.4）；M3 的 `isMainAgent`（`src/design/mode.ts`:174）今天不导出，且依赖设计行内部的 `deps`。如果 M3 日后在设计行的服务上直接给 `isMainAgent(agent)`，M5 的访问器改调它，别处不动（R4-06）。不给也行。
6. 在 `bootstrap` 上批注：`src/data/project-root.ts` 与 `src/data/lock.ts` 已在仓库里，接管不必按 M5 §5 的规格另建；`src/data/journal.ts`、`src/data/secret-shape.ts` 仍是 M5 的 A1（谁先合入谁建，规格不变）。
7. 在 `ablation` 与 `risk-calib-read` 上批注：标定运行的 `dataRows` 要带 `projectOverride`（A1 做），记忆索引、经验提醒、学习摘要提醒与新的 Memory 节在 L4 批次各做一次消融；不能用禁用记忆行代替关掉索引（记忆行还写用量）。
8. 在 `question-31` 的后续实现、`prompt-fixes` 与 M3 的 `m3-main-persona` 上批注：D1、R1 也改 `src/glm-prompt/`，排队；Output Style 做出来时常设细度改读 `glmHournessMemory.depth`。
9. profile 里记忆行的 `home`（`cordis.patch.yml` 第 67–69 行）：不问人，不改（§5.1、§11）。
10. 在 `m5` 与 `lessons` 上批注本稿与评审结果的路径；M1 合入时 `docs/ROADMAP.md` M5 一节的条目改为带节点 id 的表（与 M7 一节同形）。

上面第 3 至 8 条与 `graph-ops-align.json` 的批注一一对应（节点 `m7`、`rules`、`m3`、`bootstrap`、`ablation`、`risk-calib-read`、`question-31`、`prompt-fixes`、`m3-main-persona`，加第 10 条的 `m5`、`lessons`），文件里没有的批注这里也不列（R4-09）。
## 14. 未核实的假设

| # | 假设 | 依据 | 在哪核实 | 不成立时 |
| --- | --- | --- | --- | --- |
| U1 | host 级 `tools/post-execute` 的监听器看得到子 agent 的调用，`exec.agent` 是子 agent | 分发与 pre-execute 同一做法（tools:3320、3600）；pre-execute 看得到子 agent 由探针 `glm-dispatch` 实测〔推断〕 | L3 `glm-lessons-failure` 加一个子 agent 失败的步 | 失败匹配只对根 agent 生效；worker 仍有简报里的经验与 `lessons_query`；行健康注明 |
| U2 | `additionalContexts` 里的 notice 在 GLM 路由的下一次请求里紧跟这次工具结果，方言不丢、不改顺序 | agent-loop:492–506、572；方言只追加 notice、不改已有消息（清点报告 §7 第 12 条）〔推断〕 | L3 `glm-lessons-failure` | 改为下一步的 `agent/pre-step` 读历史里最后一次失败的工具结果再追加（`installStepNotice`），位置晚一步 |
| U3 | 子 agent 上不带 `prepend` 的过滤监听器在方言的 `prepend` 监听器之内运行，`memorySectionApplies` 看得到过滤后的工具 | cordis:317–325、335–345〔实读〕；组合后的效果没跑过 | L3 `glm-worker-memory` | 方言另按会话头的 `origin` 不给子 agent 加 Memory 节（`question-31` C 本来也要这样做），过滤照旧 |
| U4 | 桌面版上，面板能经 `remote.workspaceFiles` 读并监视工作区外（用户级目录）的文件；现在只有用户级记忆流水在工作区外 | README:12、40、58 说文件的读与监视不限于工作区；沙盒策略是否限制没有核对 | L4 第一批 | 记忆行把用户级记忆流水折叠后的状态放进投影 `hournessMemory` 的 view，面板读投影，不读文件也不经命令；监视改为随流水变化更新投影、页面可见时每 15 秒取一次 |
| U5 | 面板在另一个进程追加时整读，拿到的是以半行结尾的前缀 | 追加是一次 `write`；读是一次整读〔推断〕 | L2 模拟（读到半行的折叠） | 已按「忽略没有换行的末行」设计，不成立也不影响 |
| U8 | Memory 节的原句：3.17.1 的 `buildMemorySection`（`default-index` 一支）与 §3.5 表里写的一致；机制类事实（索引放在请求开头的用户上下文、200 行与 25,000 字符的上限、语义召回默认关）仍按 3.16.2 源码读，3.17.1 上只核对了前一句与语义召回开关 | 本稿读过 `reference/zcode-3.17.1/zcode.cjs` 偏移 12841055 起的函数，§3.5 的全文与白名单在它上面验证过；索引位置、上限在 3.17.1 上没有逐项读〔推断〕 | `npm run check:verbatim`（只读 3.17.1 副本）；索引位置在 L3 `glm-memory` 看请求 | 镜像文件与 §3.5 的全文按 3.17.1 重拼；索引位置不同时索引文字不变，只改注入位置 |
| U9 | 常驻名单里的 `lessons_query` 在 GLM 工具检索里不延迟 | split 的机制（`src/shared/tool-names.ts`），记忆与图工具已实测 | L3 `glm-lessons` | 契约测试会先失败 |
| U10 | DSH 的 AGENTS.md 消息与记忆索引都在第 1 步，两条都保留，先后不影响 agent-instructions 的基线核对 | agent-instructions:1406–1424 在 `next()` 之后插在认领的消息之后；`installStepNotice` 追加在末尾〔推断〕 | L3 `glm-memory`；L4 | 索引改到第 2 步再注入 |
| U11 | 标定与探针的会话读不到真实的经验与记忆 | `dataRows` 设 `projectOverride` 与 `dshHome` | L3 的真实流水不变核对；标定的事后扫描（`ablation`） | 标定运行判无效，修 `dataRows` |
| U13 | 恢复的会话也触发 `agent/created`，过滤与提醒装得上 | agent:574–589 对创建与恢复的 agent 都派发（M7 §15 U7 同一假设）〔推断〕 | L4 | 工具体的调用方核对照样拦住子 agent；索引改由 host 级的 `agent/pre-step` 监听器注入 |
| U14 | M7 的交回处理按 §8.1 第 5 条实现三路：`rejected` 不写退路批注，退路批注逐字段过 `looksSecret` | M7 0.6 §3.5.5 已写明这三路，实现还没有〔读设计，未实现〕 | M7 交回处理的 L2（§8.1 第 5 条末尾的三路用例） | M7 的退路在经验服务不在时就会走，与 M5 合入与否无关，所以第 5 条随 M7 的交回处理一起合入。M7 已先合入而没有第 5 条时，把它排成 M7 的修订任务，排在 L1 之前。在那之前漏进图的令牌：M5 的导入照样过 `looksSecret`，不进经验存储；图上那条批注由卫生检查列出，交人处理 |
| U16 | M3 的 `answerKindOf`（`src/shared/answer-marks.ts`）能认「人在对话里否掉：」「人在对话里补充：」开头的批注，M3 写批注的方式如附录 0.5 §3.5 所述；批注的历史项没有 `relay`（引擎对 `comment` 丢掉 `relay`，`src/graph/engine.ts`:150），人的原话在批注正文里，学习信号的 `chat:*` 两行因此不看 `relay`（R4-01） | M3 附录 0.5 §3.5 第 6 步的表〔读设计，M3 还没实现〕；`engine.ts`:150、154〔实读〕 | G1 合入时的契约测试：用真实引擎写一次不带 `relay` 的 `comment`、一次带 `relay` 的 `edit`，读回历史再交给 `correctionSignals`（§3.6、§7.6） | 学习信号这一项按 M3 实际的写法改一处；引擎改了 `relay` 的规则时契约测试先失败 |
| U17 | 主 Agent 能分清「这一次嫌长」和「以后都要简短」，只在后者调 `memory_store` 写 `reporting-depth`；这是模型行为，不是 harness 保证 | `value` 参数的英文说明、Memory 节 L1 一句、M3 附录 §3.7 把「写进画像」交给 M5〔推断〕 | L3 `glm-memory` 用脚本化的模型只测写入路径；L4 第二批里让真实的 GLM 会话听一句「以后汇报都说重点」 | 写得太少：人再说一遍或直接说「汇报细度改成简洁」；写得太多：人说「恢复默认」，主 Agent `memory_forget`。两者都不丢数据，最坏是下个会话的汇报长短不合人意 |
| U18 | 人说「删掉这条经验」时，主 Agent 能找到延迟工具 `lessons_merge` 并带原话调 `delete` | 延迟工具在目录里有名字，经验页每条下面的「要改」一行写明该说什么〔推断〕 | L3 `glm-lessons` 的脚本化步骤；L4 第二批用真实会话说一次 | 候选提醒与复发提醒之外，在 `lessons_query` 的说明里加一句「to delete a lesson the user asks for, use lessons_merge delete with their words in relay」；人也可以在输入框打 `/lessons delete` |
| U19 | M3 为 M5、M7 导出的 `mainAgentOf`（附录 0.5 §2.4）能取到这个项目持有者记录里的会话，M5 的访问器 `isMainAgentFor(ctx, agent)` 用它比会话 id；M3 的 `isMainAgent(deps, agent)`（`src/design/mode.ts`:174）今天不导出，不是入口 | 附录 0.5 §2.4 写明 `mainAgentOf(userHome, dir)` 给 M5、M7 找主 Agent 用，`holderHome(ctx)` 给出 `userHome`〔读设计，M3 还没实现；导出名与返回形状没有核对〕 | M3 设计行合入后，在 `src/shared/main-agent.ts` 的 L2 里用 M3 的真实导出和临时持有者记录各测一次（持有者是本会话、是别的会话、记录不在） | 取不到、形状不符，或设计行不在：按「设计行不在」处理，任何根 agent 都算，两行的行健康写原因；M3 的导出形状变了只改访问器这一处（R4-06）。日后 M3 给出 `isMainAgent(agent)` 服务时访问器改调它（§13 第 5 条） |
| U20 | 人在对话里要求改图上的字段时，主 Agent 调图工具会带 `relay`（人的原话），`edit:` 信号才认得出这是人的纠正 | M3 附录 0.5 §3.8 的 `main-agent-graph-relay` 规则要求转述带原话；不带 `relay` 的 `edit` 引擎照收，在历史里与 agent 自己的修改无法区分〔推断〕 | L4 第二批里数一次：人让主 Agent 改字段的次数与 `edit:` 信号的次数 | `edit:` 信号数偏少，周摘要里这一类偏低；其余信号（`reject:`、`chat:*`、`reopen:`）不受影响。不丢数据，也不误报 |
没有 U6、U7、U12、U15（编号不重排，保持与前几稿引用一致）。

## 15. 修订记录

- 0.1（2026-10-29）：初稿。
- 0.2（2026-10-29）：按第 1 轮设计评审（挡路 2 条、非阻断 11 条）修订。逐条：
  - R1-01（挡路）：§5.6 去掉「32 个以上 base64 字符」，换成令牌形状判据（至少 32 个 `[A-Za-z0-9+=_-]`、不含 `/` 与 `.`、同时有数字与大小写字母）；十六进制、命名前缀、`Bearer`、PEM 保留，整项 7–40 位十六进制的提交号豁免不变；`looksSecret` 返回类别，拒绝信息写出类别，只在 `hex` 时建议短提交号；记忆的 `source` 各项也过它（§3.2 第 3 步）。新增 `tests/data-secret-shape.spec.ts` 两组固定用例（§5.6 末、§7.6、§9.1 A1）。m5-1 验收第 2 条加深层路径、32 字符以上标识符、40 位提交号作出处与三类必须拒收的样例。
  - R1-02（挡路）：`ProposeResult` 分为收下、`rejected`（`invalid`、`secret_like`）、`{error}`（`busy`、`io`、`no_project`、`internal`）三种（§4.2 第 1 步、§8.1）。§8.1 请 M7 改的清单加第 5 条：只有 `{error}` 与服务不在时写退路批注，写前逐字段过 `looksSecret` 并略去命中的字段；`rejected` 只在交回摘要记计数与代码。导入被拒的批注也写 `import` 记录（`data.rejected`），只试一次；签名与开着的候选相同的批注不新建候选（§4.2 第 2 步）。§7.2 的 `propose` 拆成两行，新增导入被拒一行；§7.3 新增「被拒的候选经验经 M7 退路写进图」一行；§7.4 的 `propose` 一行改写；lessons-1 验收第 2、7 条补上；L2 用例见 §7.6；M7 一侧的依赖记为 §14 U14。
  - R1-03：锁文件带 `boot`（毫秒）与随机 `token`；开机时刻相差超过 120 秒才算陈旧；释放时令牌是自己的才删；`seq` 重复或回退的行按文件顺序照样应用，计入 `seqAnomalies` 并进行健康，不当坏行（§5.2、§5.3、§7.2、§7.3、§7.6）。
  - R1-04：选「承认」：开局为空的会话在第一次写入之后的下一步出现一次索引，之后不重复；理由写在 §3.3（不能追加自定义会话事件，进程内标记重启即丢，中途出现的索引不动前缀）。m5-2 验收第 1 条改写，L2 加这一例（§7.6）。
  - R1-05：§8.1 第 1 条改为 `relevant` 的查询与 `propose` 的上下文都加 `session`，清单从四处改为五处（§13 第 3 条同步）。
  - R1-06：§4.4 第 2 步先经 `toNativeTool(dialect, exec.name)` 换算再判 shell，写明 GLM 路由上的名字是 `Bash`、结果值是 `pwsh` 的形状；lessons-2 验收第 1 条与 §7.6 的 L2 用例照此写。§10.1 的 `glm-lessons-failure` 改为调 `Bash`，并加子 agent 一步（核实 U1）；新增 `non-glm-lessons-failure` 调原生 `pwsh`。
  - R1-07：`memory_store` 的 `scope` 参数说明加 `all` 与 `project` 各用于什么（§3.2），缺省值不变。
  - R1-08：D1 的「取决于」只留推测偏好一问；两行 `weight` 说明移到 §13 第 1 条，并写明「经验只给建议」是 `lessons` 节点里人的原话，不再出题（§12）。
  - R1-09：§5.5 分出 `projectRootOf` 与 `projectRootOfSync`，共用解析函数与缓存；§4.7 写明投影 `init` 用同步版本、只算路径。
  - R1-10：§2.3 写明 `subagent_fork` 继承父会话历史里的索引与候选提醒，工具体按 `origin` 拒绝；m5-2 验收第 3 条注明。
  - R1-11：§4.3 定义 `pathsMeet` 与 `globMatch`（`*`、`**`、`?`；字面前缀规则，字面前缀为空的模式不参加前缀比较），L2 用 `docs/graph/**` 对 `docs/graph/**` 与 `docs/graph/nodes/x.json`；lessons-4 验收第 2 条补上。
  - R1-12：新经验与候选 id 在两份流水里查重，撞号重取；`/lessons` 的 `delete`、`restore`、`drop` 可带范围，两份都有同一 id 时不动手（§4.1、§4.7）。`hit`、`into`、`recur-notified` 的 `data` 带项目根，复发按项目过滤（§4.4 第 6 步、§4.6）；lessons-2 验收第 3 条补上。
  - R1-13：§7.5 权限表加 `harness` 写偏好一行（只限 `reporting-depth`、范围 `all`，证据含会话 id 与调用 id 或命令 id）；§3.2 第 5 步写明 `preference_owner` 只管 `llm`；§3.7 第 1 步写明观察监听器不等写入完成、写失败的处理。
- 0.3（2026-10-29）：按第 2 轮设计评审（挡路 2 条、非阻断 3 条）修订。逐条：
  - R2-01（挡路）：新增 §5.7「证据与出处的写法」与 `src/data/evidence.ts`（`parseRef`、`checkRefs`）：`commit:<7–40 位十六进制>`、`node:<id>`、`task:<id>`（可带 `@<时刻>`）、`session:<id>`、`call:<id>`、`command:<id>`、地址、裸写的提交号、其他（文档节、路径）。提交号的例外改为「整项是 7–40 位十六进制，或 `commit:` 后接 7–40 位十六进制」，都不判 `hex`；`commit:` 等带前缀的项不合语法时按 `invalid` 拒（§5.6、§5.7）。`session:`、`call:`、`command:` 的 id 只判 `prefix`、`bearer`、`pem`，不判 `token`、`hex`（理由与 rc.3 证据 agent-loop:512、session:1802、api-session-controller:509、879 见 §5.7 与 §6 新增的一行；同一类问题会出现在 `reporting-depth` 的 `call:` 证据上；调用 id 不合语法时写 `call:sha-<16 位>`，新增 §14 U15）。记忆的 `source` 认两种提交号写法与 `node:`（§3.2）。harness 拼候选证据前按同一语法查上下文的值，不合的那一项不写，候选照收，`ProposeResult` 的收下一支加可选的 `notes`（§4.1、§4.2 第 1 步、§8.1、§7.4）；`lessons_merge new {candidate}` 与 `into` 的证据经同一函数（§4.2.2）。固定用例加 `commit:` 加 40 位、`call:` 加 32 个令牌字符、`node:…@时刻`，以及按 `invalid` 拒的三例（§5.6）；§7.6 加 `propose` 带 40 位 `commit` 返回 `candidate`、对它 `new` 与 `into` 都成功、`context.commit` 不合语法时照收；lessons-1 验收第 2 条、m5-1 验收第 2 条补上；§4.8 写明操作文件里的证据按 §5.7 写。评审的备选（只写 12 位短号）没有采用，理由见 §11。
  - R2-02（挡路）：选评审推荐的第 2 种。§3.5 写定 Memory 节的全文（2,220 字符，含 21 个换行；不带 L2 时 2,121，已按 ZCode context/sections/memory.ts:34–59 拼出核对），去掉 70% 的占比下限，换成三条 L2 断言：全文逐字相同、逐句、白名单（不是原文的只有 Z2、Z6 的改写句，`body: ` 前缀，`type:` 行去掉的缩进，Z7 的两处替换，L1 与 L2）。镜像文件导出 `ZCODE_MEMORY_LINES`（保留的 10 行），短于逐字门禁 `MIN_LINE`（13）的三行由全文与白名单断言管。§3.5 的 Z3 一行写明去掉的行与缩进；m5-3 验收第 1 条改写；§1.3 的字符数改为 2,220，合计约 2,540 字符、约 730 token。
  - R2-03：§4.2 第 2 步的导入触发改为「每个进程第一次算候选提醒时扫；之后距上次检查超过 60 秒时经引擎 `load()` 取图的 `revision`，变了才再扫；本进程的 `propose` 返回过 `{error}` 之后下一次计算不等 60 秒」；lessons-1 验收第 7 条、§7.2 导入一行、§7.6 补上。
  - R2-04：§3.7 第 2 步写明 `depth` 第一次问到时用同步读（`journal.readSync`：`statSync`、`readFileSync`，与异步读共用缓存与折叠，§5.2），读失败或没有数据行时返回 `undefined`；§8.6 的注释、m5-5 验收第 1 条与 §7.6 的「新进程里第一次就读出」用例补上。
  - R2-05：§5.5 把共用的项目根（与规则板 §7.3 的项目键同一规则，找不到 `.git` 时是 `{root: cwd, git: false}`）与 M5 的项目目录 `projectDirOf` 分开：不在 git 仓库里时只认已有的 `.llm/`，否则没有项目、不建目录，行健康写明怎样开启；主目录与盘符根的排除移到这一层。§5.1、§4.7、§7.2、§7.6、§7.7、m5-1 验收第 5 条随之改；顺带把三处误引的「规则板 §4.3」改为 §7.3（规则板设计里项目键在 §7.3，§4 没有分节）。

- 0.4（2026-10-30）：对齐轮（`d-alignment-rounds`）。按第 3 轮设计评审的未关发现（R3-01 至 R3-05）、人 2026-10-30 的定案、`m5` 节点的两条裁定，以及已放行的邻居设计（规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6、CHARTER 0.7）修订；0.3 原文另存为 `design-0.3.md`。逐条：
  - `d-memory-scope`：用户级目录只放关于人本人的记忆；所有经验（含通用的坑）进项目的 `.llm/lessons.jsonl`。去掉经验的 `scope` 字段、用户级经验流水、跨两份流水的 id 查重、`/lessons` 的范围参数、`hit`/`recur-notified` 里的项目根与复发按项目过滤；第一批经验去掉「范围」一列（第 1、13、21 条原为 `all`，现在在项目里）；`propose` 收到 `scope` 照收并存进本项目；`memory_store` 的范围 `all` 只给 `user`、`feedback` 两类。涉及 §0、§1.1、§1.2（lessons-1、lessons-4）、§2.1、§4.1、§4.2、§4.4、§4.6、§4.8、§5.1、§5.6、§7.3、§7.5、§8.1、§10.1、§11。
  - plain-ui 0.7 对 `lessons` 节点的批注（`lessons` 节点 2026-10-30T06:11Z）：经验页没有写入控件，也不经任何命令写，`/graph-apply` 的通道删去；删除与恢复是人对主 Agent 说，主 Agent 带人的原话调 `lessons_merge` 新增的 `delete`、`restore`（必须带 `relay`，否则 `user_only`），记忆经 `memory_forget` 与 `memory_store`；输入框里的 `/lessons`、`/memory` 留着，只给人敲。§4.7 重写，板块登记表改成 plain-ui 0.7 的 `subscribe`/`snapshot` 接口；记忆的几节并进经验页，不另登记 `memory`（plain-ui 0.7 只有 `rules`、`loops`、`lessons` 三块）。涉及 §1.2（lessons-3）、§2.3、§3.4、§4.2.2、§4.7、§7.2、§7.5、§8.2、§9（P1）、§11。
  - `m5` 节点 13:04Z、13:12Z 的裁定（一份项目根模块、一份锁模块）：不再新建 `src/data/project-root.ts` 与 `src/data/lock.ts`，也不加选项；用已有的 `projectOf`、`ensureIgnored`、`acquireLock`（`LockOptions` 传 M5 的五个值）。删去 0.3 的 `projectRootOf`/`projectRootOfSync` 一对、注入的 `probe`、`git check-ignore`、自写的锁（含 `host` 字段与「不判进程死活」）；只在 `project-root.ts` 里加 `projectDirOf` 与 `ensureProjectDir` 两个函数，数据目录服务加 `projectOverride` 与 `projectDirOf` 成员。`ensureIgnored` 抛错时这次写入得 `io`、不建 `.llm/`（与 ORCHESTRATION.md §16.3 一致，取代 0.3 的「照写」）；追加前用 `held()` 核对令牌。涉及 §2.2、§2.3、§5.1、§5.3、§5.5、§7.2、§7.3、§7.6、§8.3、§9（A1）、§11、§14（删 U6、U12）。
  - 规则板 0.10 §10.7 撤回「请 M5 改第 7 条经验」：第 7 条原文保留（「新的门禁先在影子模式运行」），§4.8 写明它说的是写在代码里的门禁，在 CHARTER 0.7 下仍成立（0.6 取代，见本节 0.6 一段）。顺带改正第 15 条：规则板 0.10 没有租约，解法去掉「take the rules board's dsh-profile lease」。
  - D1 照第 6 条规矩重写（§12）：标题加四段（背景、推荐、疑问、不做），标签不加粗，每行一处加粗、一句话，问题放在最后，不出选项表；D1 原要与 M7 的十张单子一起交人，那十张人已批，现在单独交；D2 移出待人定，写作 agent 决定（R3-01 的第 3 种改法），§3.2、§3.5 的「D2 选别的选项时」两段随之改成「推翻时怎样改」。§13 第 1 条删去过渡写法与卡片字段（R3-02）。
  - R3-03：`import` 记录一律写进本项目的经验流水，「还没导入过」只查这一份，成功时 `data` 带导入出的候选 id（§4.2 第 2 步）；经验只有一份流水之后这个问题本身也消失。
  - R3-04：§7.4 的 `propose` 一行改为情况的四项（含 `errors`）至少一项非空，与 §4.1、lessons-1 一致。
  - R3-05：`childId` 不合 §5.7 的语法时 `session:` 取 `context.session` 的 id（§4.1、§7.4、§7.6）。
  - `d-zcode-3171` 与 AGENTS.md「逐字文本只认 3.17.1 副本」：§3.5 的 Memory 节全文按 `reference/zcode-3.17.1/zcode.cjs` 偏移 12841055 起的 `buildMemorySection` 重拼，3.16.2 源码拼出的 0.3 全文有三处与它不同（`description:` 行的逗号、四类定义的冒号、Z7 与 Z9 的句号），字符数 2,220 变 2,213（不带 L2 2,121 变 2,114）；白名单断言在新全文上验证过。U8 重写。
  - M3 附录 0.5 作废 `design_review`、五键卡与 `depth`（附录 §2.2、§3.7，「写进画像属于 M5」）：§3.7 重写，汇报细度由主 Agent 判断人的话是不是「一直这样」，是的话带原话调 `memory_store`（新增 `value` 参数，只给 `reporting-depth`）；删去观察监听器、`recordDepthPress`、harness 身份写偏好的权限、对 M3 `depth` 函数的改动、`DESIGN_TOOL_NAMES`、`call:sha-` 写法；R1 只剩读的一侧，节名取 main 上当时的（`glm:persona` 或 M3 改名后的 `glm:reporting-depth`）。学习信号的「五键卡」一项改读 `ANSWER_MARKS`（附录 §3.5）；主 Agent 的判断改用 M3 的 `isMainAgent`（附录 §2.4）。这一条没有在人的定案里，是已放行的 M3 附录造成的接缝，记为 agent 决定（§11），U17 记模型行为的不确定。
  - 循环板 0.6 §6.6、§14 引用 M5 的 `redactSecrets`：§5.6 加该函数（与 `looksSecret` 共用模式表）。
  - 规则提议的写法改为规则板 0.10 §9.3（`rules_propose` 记提议，`propose_to_human` 交给人）；复发提醒文字同改。
  - 一并改的小处：§1.3 的字符数；§1.4 违规流水的位置归 M4 0.4 §2.4；§9.3 L4 批次的检查项；§10.1 探针场景；§14 新增 U16 至 U18，删 U6、U7、U12、U15（编号不重排）。
  - 对已放行设计的请求（记成图上批注，等自举之后，`d-freeze-until-dogfood`）：M7 去掉交回里的 `scope`（§8.1、§13 第 3 条）；其余没有。给 `bootstrap` 的一条是通知（§13 第 4 条）。

- 0.5（2026-10-31）：按第 4 轮设计评审（`design-review.md`，R4-01 至 R4-11，挡路 2 条、非阻断 9 条）修订；0.4 原文另存为 `design-0.4.md`。M3 附录 0.5 与 M7 0.6 是已放行的设计，不改（`d-freeze-until-dogfood`）：M5 能就着它们现有的接口改的都改，剩下的写成 `m7`、`rules`、`m3` 节点上自举之后再办的批注（§13）。逐条：
  - R4-01（挡路）：学习信号按引擎实际写出的历史形状读。第 1 行（人改了 LLM 写的字段）：`op: edit`，写入者是 `human`，或是 `llm` 且该历史项带 `relay`；「上一次写入是 LLM 写的」改为 `llm` 或 `harness` 写的且不带 `relay`。第 3 行（`chat:reject`、`chat:add`）：去掉「带 `relay`」，判据是 `op: comment`、`actor: llm`、正文以 `ANSWER_MARKS.reject` 或 `ANSWER_MARKS.add` 开头（`answerKindOf`）。第 2、4 行写明「`human`，或 `llm` 带 `relay`」。m5-4 验收第 1 条与 §7.6 的样例不再手写：用真实图引擎写一次带 `relay` 的 `edit`、一次人身份的 `edit`、一次不带 `relay` 的 `llm` 的 `edit`、两次不带 `relay` 的 `comment`（正文分别以 `ANSWER_MARKS.reject`、`ANSWER_MARKS.add` 开头）等，读回历史再断言，并钉住「批注的历史项没有 `relay`」（引擎改了先失败）。U16 加一句：批注历史项没有 `relay`（`engine.ts`:150）。新增 U20：主 Agent 改字段时带不带 `relay` 是模型行为，不带则 `edit:` 信号偏少，不误报。涉及 §0、§1.2（m5-4）、§3.6 第 1 步、§7.6、§8.4、§14（U16、U20）。
  - R4-02（挡路）：选评审的备选，并保留可选请求。M7 0.6 的周报只带 `stats`、`hygiene`，规范阶梯的输入是规范节点与违规记录，放行的设计又不收新请求，所以学习流水线自带出口：记忆行加只读工具 `learning_signals`（根 agent，延迟工具）和每七天至多一次的摘要提醒（来源 `glm-hourness-learning`，记忆流水新增 `learn-notified` 记录做节流，先写记录再注入）；§3.6 第 2 步重写，第 3 步改为摘要提醒到来时起草，第 4 步的「由 M7 的规范阶梯处理」改为主 Agent 在下一次摘要之后换落点。§8.1 末段、§9.1 G1 的依赖、m5-4 验收第 2 条不再依赖 M7；M7 日后愿意在周报里列同样的数，可调 `glmHournessMemory.learningDigest`，记成 `m7` 节点上的可选请求（§13 第 3 条，`graph-ops-align.json`）。涉及 §0、§1.2（m5-4）、§2.2、§2.3、§3.6、§4.9、§5.2、§7.2、§7.4、§7.5、§7.6、§8.1、§8.6、§9.1（G1）、§11、§13。
  - R4-03：`feedback` 没有缺省范围，必须写明 `all` 或 `project`，没写得 `invalid` 并带 `hint`；`user` 仍缺省 `all`（§0、§1.2 m5-1、§2.1、§3.2、§7.6、§11）。
  - R4-04：§5.5 与 §8.3 写明 `projectDirOf` 只返回路径、不写任何东西，规则行继续在建 `.llm/rules/` 之前调 `ensureIgnored`；引文改为规则板 0.10 §7.1 与 §7.4（原引 §7.3）；在 `rules` 节点上记一条自举之后的批注（§13 第 4 条）。
  - R4-05：§3.6 第 3 步落点表里规则行不在时的退路改为 `propose_to_human` 直接提一张待决（`kind: 'question'`，不带 `attach`），不先 `graph_propose`。
  - R4-06：新增薄访问器 `isMainAgentFor(ctx, agent)`（`src/shared/main-agent.ts`），调 M3 附录 0.5 §2.4 为 M5、M7 导出的 `mainAgentOf` 比会话 id；取不到按「设计行不在」处理（任何根 agent 都算）并在行健康写原因。§4.2.1、§6 对应行、§7.7、§8.4 随改，新增 U19；在 `m3` 节点上记一条可选的、自举之后的批注（§13 第 5 条）。
  - R4-07：`journal.append` 创建锁遇到 `ENOENT` 时清掉该目录的「已准备」标记，重新 `ensureProjectDir` 并重试一次（§5.3 第 2 步、§5.5、§7.2 新增一行）。
  - R4-08：正文里叙述 0.3 或更早做法的行已改成只写现行设计（§0、§3.5、§3.7、§4.1、§4.6、§4.7、§4.8、§5.3、§5.5、§5.6、§5.7、§8.1 至 §8.4、§11、§12、§13、§14）；变更留在本条与前几条修订记录里。
  - R4-09：`graph-ops-align.json` 补齐 §13 列出的批注（`m5`、`lessons`、`m7`、`rules`、`m3`、`bootstrap`、`ablation`、`risk-calib-read`、`question-31`、`prompt-fixes`、`m3-main-persona`），§13 改成与文件逐条一致。
  - R4-10：§12 D1 的「不做」一行改为「上次开发流程那十张单子」，「疑问」一行改为点名会改变方案的事实（推测出的习惯 14 天不用就淡忘），仍是 31 个码点以内、每行一处加粗；给放行稿作者的说明同步。
  - R4-11：`memory_store` 与 `lessons_merge` 的工具说明各带一个完整示范（§3.2、§4.2.2；题材是回复风格与图片批处理），L2 把示范交给与真实调用同一个校验函数；§1.3 的字符数改为约 3,090（常驻）。

- 0.6（2026-10-31）：核对人 2026-10-31 的三条定案，只有第一条触到本稿；0.5 原文另存为 `design-0.5.md`。0.5 在对齐轮已放行，本次只改与定案直接相关的几处，0.5 评审的八条 NIT（R5-01 至 R5-08）不在本次范围，仍留到实现时处理。逐条：
  - `d-code-rules-enforce`（写在代码里的规则启用即拦，不设试运行期）：触到第一批经验第 7 条，原解法写「start a new gate in shadow mode and count false denials before enforcing it」，与定案相反。§4.8 表第 7 条的解法改为「引号感知解析，启用行之前把无害写法（引号里的 `=>`、`>>>`、`->`，git 子命令）写进测试，规则启用即拦，误拦由带规则 id 的拦截记录发现」；表后的说明整段重写（0.4、0.5 为保留原句所作的论证失去前提：CHARTER 0.7 那一句被定案取代）；§0 经验板块一条的末句、§8.3 末条随之改；§1.1 加一行定案；§11 加一条 agent 决定（改写而不删）；依据一行加节点 `d-code-rules-enforce`。M5 里没有 PROMOTION 门槛、影子判定与标注、会话回放、页面标注、周报「影子转生效」这些东西，没有别的要删。M5 的两行不注册拦截，没有规则要改成启用即拦。
  - `d-credentials-readable`（agent 可以读登录密钥文件，M4 的 credential-read 规则整条删掉）：不触本稿。M5 没有读密钥文件的规则；§5.6 的 `looksSecret` 拒收管的是写进记忆与经验流水、简报、交回摘要和图退路批注的文本，不管 agent 读什么文件，定案写明「`check:secrets`、`looksSecret` 照旧」，所以 §5.6、§5.7、§7.3、§8.1 第 5 条不动。
  - 脚本与检查的超时（`d-timeout-measured`）：不触本稿。M5 没有写脚本或检查，也没有给它们定超时；§1.3、§5.3 的 2 秒、30 秒、120 秒是文件锁的参数，60 秒与 15 秒是图修订检查与页面刷新的间隔，§7.2 引用的 M7「超过 2 秒时不带经验」是 M7 对服务调用的限制，都不是脚本或检查的超时。所以本稿不写 `d-timeout-measured` 的规则，也不把它列进 §12。
  - 复核后的小修（版本仍是 0.6）：§4.8 表后说明改正对 `DEVELOPMENT.md` §7「影子记录」与 `ROADMAP.md` M1.8 的描述（前者指 guard 的工作区变更兜底，后者没有「影子」字样）；上面 0.4 一段第四个子条加「0.6 取代」的指向；§1.4、§8.3 的「M4 0.4 §2.4」改为「M4 §2.4」，0.4 一段里的同样写法是修订记录，不改。