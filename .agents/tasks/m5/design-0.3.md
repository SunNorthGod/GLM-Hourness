# M5 设计：记忆与学习，连同经验板块（项目图节点 `m5`、`lessons`）

版本：0.3（2026-10-29），按第 2 轮设计评审（`design-review.md`）修订，改动见 §15。
状态：待第 3 轮设计评审。实现排在 split 合入之后（main `6a6895e` 已含 split 第 0–8 步）。本稿不改代码，不写 `docs/graph/`，不碰 `~/.dsh` 与桌面版。

依据：`.agents/tasks/design-context.md`；`AGENTS.md`；`docs/CHARTER.md` 0.6；`docs/ORCHESTRATION.md` 0.3 §3.2–§3.3、§6、§8、§12、§13；`docs/DESIGN.md` §2.3–§2.5、§2.4a、§5.2–§5.3、§6、§7；`docs/ROADMAP.md` M5；`docs/DEVELOPMENT.md` §1.1、§3、§5、§7；`docs/HANDOFF.md` §6；阅读摘要 `.agents/tasks/reading-2026-10-29/digest.md` §2.2 第 3、13 篇，§4 第 16、17 条，§5 C5，§6 K4、K5、K7，§7 第 10 条；清点报告 `.agents/tasks/prompt-audit/report.md` §2–§5、§7；M7 设计 0.2（评审中）§2.3.2、§3.5.5、§3.6、§3.12、§3.14.5、§3.15；规则板设计 0.3 §4、§7.3、§9；plain-ui 设计 0.3 §7.6；M3 设计 0.4 §3.4.4；图节点 `m5`、`lessons`、`d-failure-plans`、`d-rules-human-only`、`d-option-card`、`d-recommend-last`、`norm-decision-tiers`、`norm-audit-trail`、`question-26`、`question-28`、`question-31`，以及 `recommend-last` 2026-10-29T11:39 与 `orch` 2026-10-29T12:41 的批注；现有代码 `src/memory/`、`src/glm-prompt/localize.ts`、`src/glm-prompt/persona.ts`、`src/shared/`、`scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs`。

证据写法：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行（`cordis` 包不带前缀），其他文件写出文件名与行号。ZCode 的文字以 `reference/ZCode/apps/zcode-cli/packages/core/src/` 下的源码为准，写作「ZCode <文件>:行」，逐字门禁另以 3.16.3 安装包核对（§14 U8）。〔实读〕读过源码；〔推断〕由源码推出、没运行；没运行过的接缝都列在 §14。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

- 两者的关系（§2.1）：一个存储层，两个集合。记忆（`memory`）记人是谁、人要怎样干活，以及指向项目事实出处的线索；经验板块（`lessons`）记「在某种情况下踩过的坑与解法」。两者共用 `src/data/` 下新的流水存储（只追加的 JSONL、文件锁、按会话找项目根），各有自己的数据形状、工具、插件行与用途。没选「一个存储加 `kind` 字段」：两者的读法不同（记忆在会话开局给索引，经验按文件、命令与报错匹配），一套工具同时教两件事，模型分不清该往哪写；也没选「两套存储」：锁、崩溃恢复与留痕要写两遍。
- 记忆（§3）：条目沿用 ZCode 3.16.3 的四类（`user`、`feedback`、`project`、`reference`）与字段（`name`、`description`、正文带 Why）。分类看来源：人说过的（带 `relay` 原话，或来自人的动作）`user`、`feedback` 是偏好，不衰减，只有人能撤；其余是事实，14 天半衰期。取消路径与文件名的拒绝判据，改为类型、Why 与写入前查重；`project` 事实要写出处（D2 推荐的做法）。会话开局与压缩之后，在对话末尾放一条 `<system-reminder>` 记忆索引，形状照 ZCode 的 MEMORY.md 索引，系统提示词逐步不变。子 agent 不拿记忆工具，也不收索引。项目目录跟会话的工作区走，不再用 profile 里钉死的本仓库 `.llm`。
- 方言（§3.5）：`glm:memory` 节改为「ZCode 原句加最少的本地化」，全文在 §3.5 写定（约 2,220 字符）；原句放进新的镜像文件，由逐字门禁核对；L2 用白名单断言钉住「不是原文的只有这几处」，不算占比。记忆工具不在就不出这一节，经验查询工具不在就不出提到它的那一句。
- 学习流水线（§3.6）：harness 从图的历史、五键卡、细度拨档与门禁以外的提交里算出纠正信号并分组，周报列出；主 Agent 把每组落成偏好、推测、经验、规则提议或候选标定题；只有规则要人批（`d-rules-human-only`）；之后按组计复发。汇报细度闭环（§3.7）：人点「讲细点」「说重点」之后，harness 把新档写成偏好 `reporting-depth`，下一个会话的默认细度取它；会话内的系统提示词不变。
- 经验板块（§4）：每条经验写明情况（文件、工具、命令、报错片段）、坑、解法、证据、范围（本项目或所有项目）、最近一次确认。来源是 worker 交回里的候选（M7 接缝）：与已有经验完全相同的自动并入，与人删过的相同的自动丢弃，像密钥的拒收（M7 不把被拒的候选写进图，退路批注也先略去像密钥的字段，§8.1 第 5 条），其余由主 Agent 用 `lessons_merge` 合并或丢弃；人在面板上看、删、恢复。三条用途：派发时进简报（M7 调 `relevant`）；命令失败时按报错片段推一条提醒；所有 agent 都能调的 `lessons_query`。经验只是建议：经验行不注册任何拦截；同一条经验 28 天内在 3 个会话里复发，harness 提醒主 Agent 可以向人提规则。第一批 21 条来自 `DEVELOPMENT.md` §5 与 §7、`HANDOFF.md` §6、2026-10-29 的两次事故（worker 不顾简报写了图；简报写在人拍板之前而过时），以及蓝屏清零状态文件的那一次（§4.8）。
- 存储（§5）：项目级是会话项目根下的 `.llm/memory.jsonl` 与 `.llm/lessons.jsonl`，用户级是 `<userHome>/memory/memory.jsonl` 与 `<userHome>/lessons/lessons.jsonl`。每个改变状态的动作是流水里的一行，写明谁、何时、为什么、凭什么。删除是墓碑，旧的 `memory.json` 改名保留，任何文件都不覆盖写。像密钥的文本按令牌形状判（§5.6），路径、文件名与长标识符不受影响；证据与出处有一套固定写法（§5.7），提交号的两种写法（裸写、`commit:` 加 7–40 位十六进制）都不判为像密钥。不在 git 仓库里的文件夹只有已有 `.llm/` 时才算项目（§5.5）。
- 实施（§9）：三条线并行先做纯函数与存储（A1 存储底座、B1 记忆模型、C1 经验模型），再并行做两行（M1 记忆行、L1 经验行），之后是方言节、失败匹配、第一批经验、面板、细度闭环与学习信号。L4 攒两批。
- 要人定的（§12）：D1 M5 与经验板块各任务节点的验收（必须问人的第 1 类）；D2 记忆里还存不存项目事实（阅读摘要 C5，推荐「存，但必须写出处」）。

## 1. 需求与验收

### 1.1 必须遵守的定案

| 定案 | 原话或出处 | 本设计怎样遵守 |
| --- | --- | --- |
| 经验板块（`lessons`，用户 2026-10-29） | 「要不要设置一个经验板块，用来统计项目里遇到的坑和解决办法？要不然每个子代理都得自己摸一次？」「还得允许子代理主动查经验板块的内容」 | 字段、来源、三条用途、人能删都按节点正文（§4）；`lessons_query` 在每个 agent 的工具面里，GLM 路由上常驻（§2.3） |
| `d-rules-human-only` | 「先不允许自己加规则吧，只有人能动」 | 记忆与经验都不是规则，两行都不注册拦截；复发的坑只提醒主 Agent 去提规则提议（§4.6）；学习流水线里只有规则要人批（§3.6） |
| `ORCHESTRATION.md` §8.2 存放〔定案 2026-10-28〕 | 关于人的偏好放用户级目录，项目事实与项目规范放工作区 `.llm/` | 范围 `all` 进用户级目录，`project` 进会话项目根的 `.llm/`（§5.1）；「工作区」落实为会话的工作区，不是 profile 里钉死的本仓库 |
| `d-failure-plans`、`docs/DEVELOPMENT.md` §1.1 | 「优雅的失败重试，以及事后可追溯性（用来修bug）」 | §7 按操作写发现、重试、恢复与留痕；流水本身就是留痕 |
| `norm-audit-trail`（条款 11） | 「记得可审计性处处留痕」 | 每次写入是流水里的一行：身份、时刻、原因、证据，经转述的带原话；删除记下被删条目的快照（§5.2） |
| `question-31` C | 子 agent 只拿它需要的 | 子 agent 不拿记忆工具与索引、不拿 `lessons_merge`，拿 `lessons_query`（§2.3） |
| `question-26` C | 主 Agent 不拿写文件工具 | 记忆与经验的写入都经工具与 harness，不经文件工具，主 Agent 照常可用 |
| `question-28` C | 「你在没有副作用的情况下尽可能开更多的并行」 | §9 三条纯函数线并行；改同一批登记文件的步按先合入先改排队 |
| `question-14` G3 | 「开编排层就全生效，不开就全不生效」 | 记忆与经验对所有路由、所有模型生效；GLM 只多方言的一节文字 |
| `question-17` B | 两个插件 | 记忆与经验都在编排层包；GLM 包只经公共库的契约读细度与工具名（§8.6） |
| `d-option-card`、`d-recommend-last` | 表格版选项卡，推荐项最后 | §12 两题照此写；M5 不新增 harness 给人的待决 |
| `question-27` B | 只量系统里看得到的数 | 经验与记忆的统计只取流水、图与会话日志（§3.6、§4.9） |
| 阅读摘要 C5、第 17 条 | 记忆只放可复用的经验与偏好，事实放人审过的产物 | 坑与解法归经验板块；记忆的 `project` 事实要写出处（D2 推荐，§3.2） |
| 阅读摘要第 16 条 | 纠正还要变成回归检查或标定题 | 学习流水线的落点之一是 M7 §3.14.5 的候选标定题（§3.6） |
| K5、K7（阅读摘要 §6） | 简报过期；提醒要有条件 | K5 收进第一批经验（§4.8）；每条提醒只在内容变化或事件发生时注入（§3.3、§4.2、§4.4） |
| `docs/DESIGN.md` §5.1 | 行为习惯类镜像 ZCode 3.16.3 | 记忆的四类、字段、索引、Memory 节的原句照 ZCode（§3.5） |
| 标定的角色（用户 2026-10-29） | 「真正的标定应该是……在真实的项目开发中进行测试」 | 经验板块是否有用看自举里的复发数（§4.9），不靠标定集证明；标定运行不读真实的经验与记忆（§8.7） |

### 1.2 各节点的行为与建议验收（D1）

建议在 `m5` 下建 `m5-1` 到 `m5-5`，在 `lessons` 下建 `lessons-1` 到 `lessons-4`（§13）。验收写进节点要人批准（决策分级第 1 类）；人定之前，实现与 L2、L3 检查按下表做。ROADMAP 的六项与节点的对应：事实与偏好分类、取消路径判据 → `m5-1`；会话开局召回、记忆工具常驻 → `m5-2`；学习流水线 → `m5-4`；汇报细度闭环 → `m5-5`；`m5-3` 是方言节，`lessons-*` 是经验板块。

| 节点 | 内容 | 建议验收 | 层 |
| --- | --- | --- | --- |
| m5-1 | 记忆的分类与写入：两类、四种类型、取消路径判据、按会话的项目目录、迁移 | 1. 带 `relay` 的 `user` 或 `feedback` 条目是偏好，60 天后强度仍为 1；不带 `relay` 的是事实，0 次复审时 14 天后强度为 0.5（注入时钟）。2. 含 `coding-plan/start-plan` 与 `src/shared/dsh-min.ts` 的文本能存进去；含深层路径（如 `reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts`）与 32 字符以上标识符（如 `buildProviderEndpointRoutingHeaders`）的正文与出处存得进去；作出处的 40 位提交号（裸写与 `commit:` 写法，§5.7）存得进去；`commit:` 后面不是 7–40 位十六进制时拒绝（`invalid`）；`ghp_` 开头的令牌、40 个字符的大小写加数字混排令牌、PEM 头被拒为 `secret_like`，拒绝信息写出命中的类别（§5.6）；源码里不再有 `defaultKnowableFromGit`、`shouldStore` 与行配置 `knowableFromGit`。3. `feedback`、`project` 正文没有 `Why:` 一行时拒绝（`invalid`）；`project` 没有可识别的出处时拒绝（`bad_source`，D2 选 C 时）；多余字段拒绝。4. 新名字与已有条目相似时拒绝（`similar`）并列出相似条目，带 `confirmNew: true` 时存。5. 两个仓库里的两个会话各写进自己项目根的 `.llm/memory.jsonl`；工作树里的会话写主检出的 `.llm`；范围 `all` 写进用户级目录；会话没有工作目录时 `project` 范围拒绝（`no_project`），`all` 照常；不在 git 仓库里的文件夹没有 `.llm/` 时同样 `no_project`、不建 `.llm/`，已有 `.llm/` 时写进它（§5.5）。6. 旧的 `.llm/memory.json` 在第一次写入时迁移：新流水第一行是带这条条目的 `base`，旧文件改名为 `memory.json.migrated-<时间>`；读不出的旧文件不被覆盖，工具报 `io`。7. agent 删偏好不带 `relay` 被拒（同一会话里自己刚写的除外），带了就删；流水记下身份、原话、原因与被删条目；人用 `/memory forget` 能删任何条目。8. 两个进程各向同一流水写 200 条，`seq` 从 1 到 400 连续，没有丢 | L2；L3 `glm-memory`、`non-glm-memory` |
| m5-2 | 召回与工具面：会话开局的索引、记忆工具常驻、子 agent 不带 | 1. 一个新的根会话，存储里有条目时，第一次请求里、第一条用户消息之后有一条来源为 `glm-hourness-memory` 的 `<system-reminder>` 记忆索引（偏好在前，事实按强度，淡忘的事实不列）；之后每步的系统提示词与第一步逐字节相同，索引不再重复；开局时存储为空的会话第一步没有这条，本会话第一次写入之后的下一步出现一次，之后不再重复（§3.3）。2. 压缩检查点之后的第一次请求再带一次索引，之后不重复。3. 子 agent 的请求里没有记忆工具，也没有 `# Memory` 一节；根 agent 有三个记忆工具，GLM 路由上不带 `deferLoading`。`subagent_fork` 的子 agent 继承父会话的历史，历史里可以有父会话的索引与候选提醒，这不算违反本条（§2.3）。4. 索引至多 200 行、25,000 字符，超出时末尾有截断说明 | L2；L3 `glm-memory`、`glm-memory-compact`、`glm-worker-memory`；L4 |
| m5-3 | 方言的 Memory 节贴训练分布 | 1. ZCode 原句放在镜像文件 `src/glm-prompt/zcode-memory-text.ts`，`npm run check:verbatim` 通过；本地化后的节与 §3.5 写定的全文逐字相同；节里保留 §3.5 表中标「原样」的每一句（L2 逐句核对）；白名单断言通过：节里不是 ZCode 原文的文字只有 Z2、Z6 的改写句，Z3 的 `body: ` 前缀与 `type:` 行去掉的缩进，Z7 的两处替换，L1 与 L2（§3.5「白名单断言」）。不设占比下限。2. 记忆工具三个都在才出这一节；`lessons_query` 在工具面里才出提到经验板块的那一句。3. 节里没有「memory_store 会拒绝仓库能回答的内容」这类说法。4. 探针 `glm` 场景看到新的首句，`glm-only` 场景没有这一节 | L1、L2；L3 |
| m5-4 | 学习流水线 | 1. `correctionSignals` 在一份固定的图历史上找出：人改了 LLM 写的字段、人否决提议、五键卡上的拒绝与补充、人发起的重开、细度拨档；按键分组；同样的输入得到同样的输出。2. 有 M7 的周报时，周报列出至少 2 次的组，以及已经学过（带 `learnedFrom`）之后又出现的复发数；没有周报时这个函数只在 L2 里跑。3. 落点只有规则要人批：偏好、推测、经验、候选标定题都不出给人的待决 | L2 |
| m5-5 | 汇报细度闭环 | 1. 人在 `design_review` 卡上点「说重点」之后，记忆流水里有偏好 `reporting-depth`，值下调一档，证据是 `session:<会话 id>` 与 `call:<调用 id>`（§5.7）；宿主重启后的第一个新会话同样取到这一档（§3.7 第 2 步的同步读）；下一个新会话的默认细度（M3）是这一档，GLM 会话的 `glm:persona` 写的常设偏好也是这一档；点键的那个会话里系统提示词不变。2. 人 `/memory forget reporting-depth` 之后，下一个会话回到配置的默认 | L2；L3（M3 合入之后） |
| lessons-1 | 经验的存储、工具、服务与 M7 接缝 | 1. 字段按 §4.1 校验（情况至少一项、坑与解法的长度、证据至少一条）；两种范围各进自己的流水。2. `glmHournessLessons.propose` 收下交回里的候选：与已有经验签名相同时并入，与人删过的相同时丢弃，其余成为候选；字段不合格或像密钥的候选返回 `{status: 'rejected', code}`，什么都不写；只有服务内部失败（`busy`、`io`、没有项目目录）返回 `{error}`；不向调用方抛错。带 `ghp_` 令牌的候选返回 `rejected`，假的 M7 退路没有被调用（§8.1 第 5 条）。上下文带完整 40 位提交号的候选成为候选，证据里是 `commit:<40 位>`，对它的 `lessons_merge new {candidate}` 与 `into` 都成功；`context.commit` 不是 7–40 位十六进制时候选照收、不带这一项，收下的结果在 `notes` 里写明（§5.7）。3. 有候选时主 Agent（没有 M3 设计行时为根 agent）收到一条列出候选的提醒（内容变了才再来），同项目里的普通会话收不到；`lessons_merge` 的七种动作都可用；子 agent 调 `lessons_merge` 被拒，正路是交回结构，它的工具面里也没有这个工具。4. `relevant` 返回至多 `limit` 条得分不低于 2 的经验，每条渲染不超过 300 字符。5. 每个 agent（含 worker）都能调 `lessons_query`，GLM 路由上常驻；候选在结果里标为未审；没有任何查询条件时拒绝。6. 人 `/lessons delete <id>` 之后这条变成墓碑（带快照），`/lessons restore <id>` 恢复；agent 删不了。7. 图上 M7 退路写下的 `[候选经验]` 批注被导入一次，成为候选；宿主运行期间新写的批注不等重启：图的修订变了时，距上次检查超过 60 秒的下一次候选提醒计算里导入，`propose` 返回过 `{error}` 之后的下一次计算不等 60 秒（§4.2 第 2 步）；导入时被拒的批注也写一条 `import` 记录（`data` 为 `{rejected: <代码>}`），之后不再试 | L2；L3 `glm-lessons`、`non-glm-lessons` |
| lessons-2 | 命令失败时按报错匹配；复发提醒 | 1. shell 调用（GLM 路由上名为 `Bash`，其他路由上为 `pwsh`，按原生名判）退出码非 0、stderr 里有某条经验的报错片段时，下一次请求在这次工具结果之后带一条经验提醒（至多 2 条）；同一会话里同一条不再推；成功的调用从不触发。2. 匹配代码抛错时工具结果不变，行健康降级。3. 每次匹配记一次命中（带项目根）；一条经验 28 天内在本项目的 3 个会话里命中或被并入时，本项目的主 Agent 收到一次复发提醒（范围 `all` 的经验按项目分别计数与抑制，§4.6），建议用 `rules_propose` 向人提规则（每个项目每周至多 2 条）；任何调用都不被拦 | L2；L3 `glm-lessons-failure` |
| lessons-3 | 面板：经验页与记忆页 | 1. 经验页按范围列出生效的经验（坑、解法、情况、证据、最近确认），写明还有几条候选；每条可删，删后可撤销；你删掉的收在一节里，可以恢复。记忆页列出偏好（带你的原话）、推测、项目事实（带出处与强度）与汇报细度一行；每条可删。2. 流水追加之后 15 秒内页面更新；页面只经 `/lessons`、`/memory` 两个命令写，身份为人。3. 两个板块装上之前页脚不显示它们 | L4（DevTools 截图） |
| lessons-4 | 第一批经验 | 1. §4.8 的 21 条在存储里，证据指向 `DEVELOPMENT.md` §5、§7 的行、`HANDOFF.md` §6、提交与节点；重复导入不新增任何一条。2. `lessons_query {text: "PowerShell encoding"}` 返回 PowerShell 5.1 那一条；`relevant` 对写入范围 `docs/graph/**` 与对路径 `docs/graph/nodes/x.json` 都返回「worker 写图」那一条（通配对通配按 §4.3 的字面前缀规则） | L2（固定数据）；导入之后在真实存储上查一次 |
| m5（特性） | 合起来 | 子任务都关了；批次 L4 里桌面版 GLM 会话在本仓库与另一个 git 文件夹各开一次，记忆写进各自的 `.llm`，索引出现，经验可查，桌面版日志没有本包的新错误 | L4 |
| lessons（特性） | 合起来 | 子任务都关了；周报里能看到每条经验命中的会话数，以及经验存在之后同一报错再出现的会话数（§4.9） | L4；自举 |

### 1.3 非功能需求

- 上下文：GLM 主 Agent 每个请求多出的固定文字，`glm:memory` 从 883 增到 2,220 字符（§3.5 写定的全文，含换行与 L2；不带 L2 时 2,121），`lessons_query` 的说明与参数约 700 字符（常驻），记忆工具的说明约多 500 字符，合计约 2,540 字符、约 730 token（按 3.5 字符一个 token，清点报告 §1），都在可命中缓存的前缀里。子 agent 少了三个记忆工具与 Memory 节（约 2,100 字符）。会话开局的索引随条目数增长，每条至多约 260 字符。这些数在 L4 批次的消融里核对（M7 §12 的标定时机）。
- 不打扰人：M5 不新增 harness 给人的待决。人在 M5 里的动作只有删除、恢复与 D1、D2 两题。
- 失败要出声：两行的降级都进行健康；激活期不抛错（`AGENTS.md`）。
- 快：读一次是一次 `stat`，文件变了才整读；写是在锁里追加一行，锁至多等 2 秒；失败匹配只在调用失败时读存储。
- 不跨项目污染：项目级数据只按会话的工作区定位；探针与标定把两个目录都指向运行目录（§8.7）。

### 1.4 不做的事

- 语义检索（向量、嵌入）：ZCode 3.16 的语义召回分支默认关闭（ZCode memory/project-memory-retrieval-branch.ts:4），条目少，关键词与结构化匹配够用。
- 流水轮换：按估算一年不到 1 MiB；超过 8 MiB 时行健康报出（§5.2），到那时再设计。
- 违规、决策、用量流水的目录改为按会话（guard、workflow、hourness 三行今天仍按 profile 配，规则板设计 §10.5 同样不改）。
- 规则与规则提议的卡片（规则板设计 §9.4）、晨报与周报的版式（M7 P2）、面板首页（plain-ui）。
- 记忆与经验的编辑界面：人只删与恢复；要改，经对话由 agent 带原话改。
- 跨机器同步与导出（`field-trial` 以后决定）。
- 删掉 profile 里 `memory` 行不再使用的 `home`（用户配置，§13 交编排者问人）。

## 2. 总体设计

### 2.0 依据的学科与标准

`docs/DEVELOPMENT.md` §1.1「设计依据的学科」与 `docs/ORCHESTRATION.md` §4.3 的架构栏：

- 存储与并发依据可靠性工程与数据库的做法：只追加的日志作事实源（预写日志），状态由日志折叠出来；独占创建的锁文件与陈旧锁回收；崩溃之后按行恢复，坏行跳过并计数。Windows 上的独占创建用 Node 的 `wx`（`O_CREAT | O_EXCL`）。
- 记忆的分类与衰减依据认知心理学：遗忘曲线（现有实现的 14 天半衰期）与间隔复习的加成；指令型与学习型记忆分开（BigModel「记忆机制」页，`docs/reference/bigmodel-coding-plan-digest.md` §2.3）。
- 训练分布依据提示词工程的做法：照 ZCode 3.16.3 的 Memory 节、MEMORY.md 索引与 `<system-reminder>` 召回的形态写（`docs/DESIGN.md` §5.1）。
- 经验板块依据事故复盘与知识管理：无责复盘（`docs/ORCHESTRATION.md` §12），每条经验带证据与最近确认；匹配用确定的规则，便于测试。
- 权限依据安全工程的最小权限：子 agent 只读经验、不写记忆；删除只有人能做；身份在 harness 的写入口核对，不靠提示词。
- 给人的部分依据认知负荷：人只看与删，不逐条审经验；给人的文字中文、短；推荐项最后（`d-option-card`）。

### 2.1 记忆与经验板块的关系

三种做法，推荐项在最后：

1. 一个存储、一个集合，用 `kind` 区分：一套工具、一个面板。代价：记忆在会话开局整份给索引，经验按情况匹配，两种读法塞进同一套工具的说明里，模型要先判断「这是偏好还是坑」才知道怎么填；ZCode 的四类没有「坑」这一类，Memory 节要为它改写，离训练分布更远。
2. 两套独立的存储与代码：边界最清楚。代价：锁、坏行恢复、迁移、留痕与面板读取各写两遍，违反去重复（`docs/CHARTER.md` §7.3）。
3. 一个存储层，两个集合（采用）：`src/data/` 提供流水、锁与项目根，记忆与经验各自定义条目形状、写入规则、工具与用途，各是一行，可以单独禁用。ZCode 的 Memory 节只讲记忆；经验有自己的工具说明。

内容去哪，按下表判断（写进两行的工具说明与 §3.5 的节）：

| 内容 | 去哪 | 例 |
| --- | --- | --- |
| 人是谁、人说过要怎样干活 | 记忆 `user`、`feedback`，带原话，是偏好 | 「回复先给结论，少用术语」 |
| 从人的改动里看出来、人没说过的工作方式 | 记忆 `feedback`，不带原话，是推测，会淡忘 | 「验收条件要写成可执行的检查」 |
| 项目里的事实 | 图与文档；记忆 `project` 只留一行线索与出处 | 「coding-plan 与 start-plan 的签名规则不同」，出处 `docs/DESIGN.md §4.3` |
| 外部资源 | 记忆 `reference` | 面板地址、工单 |
| 在某种情况下踩过的坑与解法 | 经验板块 | PowerShell 5.1 不带编码读写会损坏 UTF-8 |
| 要 harness 执行的约束 | 规则板，只有人写 | 「一次只跑一个探针」 |

### 2.2 构件与位置

全部在编排层包 `dsh-hourness`，只有方言节与细度的读取在 GLM 包。`scripts/packages.mjs` 的 `hourness.src` 加 `lessons`，`rows` 加 `{id: 'glm-hourness/lessons', module: 'lessons/index'}`；`packages/hourness/cordis.patch.yml` 里本行排在 `memory` 之后，`disabled: true`。记忆行是已有的行，保持启用，改动经 L3 之后合入。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 项目根：从会话头的 `cwd` 找仓库根（工作树经 `commondir` 回到主检出），与规则板的项目键同一规则；项目目录：git 仓库根下的 `.llm/`，不在 git 仓库里时只认已有的 `.llm/`，用户主目录与盘符根不算项目；`/.llm/` 没被忽略时追加进 `.git/info/exclude` | `src/data/project-root.ts` | 新建 |
| 文件锁：独占创建、进程内排队、陈旧锁改名 | `src/data/lock.ts` | 新建；规则板 R2 与 M7 的门禁锁按 §8.3 改用它 |
| 流水：读（缓存、坏行、未写完的末行）、在锁里追加（封口、`seq`、`fsync`） | `src/data/journal.ts` | 新建 |
| 像密钥的文本：按类别判（§5.6），拒收；M7 的退路批注也导入它 | `src/data/secret-shape.ts` | 新建 |
| 证据与出处的写法：`parseRef`、`checkRefs`（§5.7；纯函数，面板也导入） | `src/data/evidence.ts` | 新建 |
| 数据目录服务加 `projectOverride`（探针与标定用） | `src/data/index.ts`、`src/shared/data-home.ts` 的 `DataService` | 改 |
| 记忆的条目、分类、强度、校验、相似、折叠、旧格式转换（纯函数，面板也导入） | `src/memory/model.ts` | 新建 |
| 记忆索引与提醒文字 | `src/memory/recall.ts` | 新建 |
| 三个记忆工具 | `src/memory/tools.ts` | 重写 |
| 记忆行：按会话定目录、子 agent 的工具面过滤、索引提醒、投影 `hournessMemory`、命令 `/memory`、细度观察、服务 `glmHournessMemory`、行健康 | `src/memory/index.ts` | 改 |
| 旧存储 | `src/memory/store.ts` | 删除（由 `model.ts` 与 `journal.ts` 取代） |
| 学习信号（纯函数） | `src/memory/signals.ts` | 新建（G1） |
| 细度服务的契约（两个包都读） | `src/shared/memory-service.ts` | 新建 |
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
| `glm:persona` 的常设细度读服务 | `src/glm-prompt/index.ts`、`persona.ts` | 改（GLM 包，R1） |
| M3 的默认细度读服务 | M3 设计里算当前细度的函数所在文件（`src/design/`） | 改（R1） |
| 工具名契约：`LESSONS_TOOL_NAMES`，常驻名单加 `lessons_query` | `src/shared/tool-names.ts` | 改 |
| 行健康：`HOURNESS_ROWS` 在 `memory` 之后加 `lessons` | `src/shared/health.ts` | 改 |
| 薄适配层：`tools/post-execute` 的监听器与决定、会话投影的定义、`commands.execute` 的结果（面板） | `src/shared/dsh-min.ts` | 改 |
| 探针与标定的数据目录：`dataRows` 加 `projectOverride` | `scripts/sandbox.mjs` | 改 |
| 探针场景与 Memory 节首句常量 | `scripts/probe/run-probe.mjs`、`scripts/probe/probe-dispatch.mjs`（只在探针覆盖层里加一个调 `propose` 的工具） | 改 |
| 面板：经验页、记忆页、板块登记 | `ui/src/lessons/LessonsPage.tsx`、`ui/src/memory/MemoryPage.tsx`、`ui/src/graph/boards.ts`（plain-ui §7.6） | 新建或改 |
| 测试 | `tests/data-journal.spec.ts`、`tests/data-project-root.spec.ts`、`tests/data-secret-shape.spec.ts`、`tests/data-evidence.spec.ts`、`tests/memory-model.spec.ts`、`tests/memory-recall.spec.ts`、`tests/memory-tools.spec.ts`、`tests/memory-row.spec.ts`、`tests/lessons-model.spec.ts`、`tests/lessons-match.spec.ts`、`tests/lessons-row.spec.ts`、`tests/lessons-failure.spec.ts`、`tests/memory-signals.spec.ts`；改 `tests/glm-prompt.spec.ts`、`tests/contracts.spec.ts`、`tests/memory-audit.spec.ts` | 新建、改 |

两行的 `inject` 都只有 `tools`；`commands` 与 `sessionProjections` 经 `ctx.inject` 可选地取（cordis:1600，同 graph-panel 对 `sessionProjections` 的做法），所以记忆行的激活条件与今天相同，缺了它们只少命令与面板（§7.1）。数据目录、图、方言服务每次用时经 `ctx.get` 读。

不加的东西：图节点的新字段；图引擎的权限改动；新依赖。配置项只多一个：数据行的 `projectOverride`（只给探针、标定与测试用）。

### 2.3 角色与工具面

| 工具或命令 | 注册方 | 谁的工具面里有 | GLM 路由上 | 调用方核对 |
| --- | --- | --- | --- | --- |
| `memory_store`、`memory_query`、`memory_forget` | 记忆行 | 根 agent（会话头没有 `origin: 'subagent'`） | 常驻（已在 `ORCHESTRATION_RESIDENT_TOOLS`） | 工具体拒绝子 agent（`role`） |
| `lessons_query` | 经验行 | 所有 agent，含 worker 与审查者 | 常驻（加进常驻名单） | 无 |
| `lessons_merge` | 经验行 | 根 agent | 延迟（经 `DeferredToolCall` 调用；候选提醒里写着它的名字） | 工具体拒绝子 agent，正路是交回结构 |
| `/memory`、`/lessons` | 记忆行、经验行 | 人在输入框里敲；面板经 `remote.commands.execute` 发 | — | 斜杠命令只有人能发（`docs/ORCHESTRATION.md` §2.10），身份为人 |

根 agent 指会话头没有 `origin: 'subagent'` 的 agent：M3 的主 Agent、没开 `/wish` 的普通会话、运维会话都是。子 agent 是委派出去的会话（`subagent`、`subagent_fork`、M7 的 worker 与审查者），会话头由 `childSessionMeta` 写 `origin: 'subagent'`（subagent:346–355，session:1051–1053）〔实读〕。

`subagent_fork` 的子会话以父会话的日志为前缀（`isSeeded`，subagent:346–355）〔实读〕，所以它的请求历史里可以有父会话的记忆索引与写着 `lessons_merge` 的候选提醒，而它的工具面里没有记忆工具与 `lessons_merge`。这是继承来的历史，不是本行给子 agent 的注入：本行的索引与提醒监听器只装在根 agent 上。fork 子 agent 照着继承的提醒去调 `lessons_merge` 或 `memory_store` 时，工具体按会话头的 `origin` 拒绝（`role`），拒绝写着正路（交回结构），模型据此改走交回。

工具面过滤：两行各在 `agent/created`（agent:581–585）时给子 agent 装一个 agent 作用域的 `system-prompt/assemble` 监听器，不用 `prepend`，在 `next()` 之后从 `assembled.tools` 去掉本行的根 agent 专用工具。不用 `prepend` 是有意的：cordis 把 `prepend` 的监听器放到列表前面、其余追加到后面，最外层先跑（cordis:317–325、335–345），所以方言那个 `prepend` 的组装监听器在 `next()` 里拿到的就是过滤之后的工具，`memorySectionApplies`（`src/glm-prompt/index.ts`）判出子 agent 没有记忆工具，不加 `# Memory` 一节。M3、M7 去掉自己的工具用的是 `prepend`，那些工具不牵连任何一节，所以不受影响。工具仍在全局注册，按名直接调用照样执行（`docs/DESIGN.md` §2.4a），所以工具体再查一遍调用方。

## 3. 记忆（`m5`）

### 3.1 条目与两类（m5-1）

```ts
// src/memory/model.ts：纯类型与函数，不用 Node 内置模块（面板也导入，先例 src/graph/parse.ts）
export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'   // ZCode 3.16.3 的四类
export type Scope = 'project' | 'all'
export type Actor = 'human' | 'llm' | 'harness'
export interface MemoryEntry {
  readonly name: string                 // kebab-case，在同一范围内唯一
  readonly scope: Scope
  readonly type: MemoryType
  readonly description: string          // 一行，至多 200 字符，召回时判断相关性用
  readonly body: string                 // 至多 4000 字符；feedback、project 带 Why 一行
  readonly source: readonly string[]    // 出处：节点 id、文档节、提交、URL；project 必填（D2 选 C）
  readonly relay?: string               // 人的原话
  readonly value?: JsonValue            // harness 写的结构化偏好，只有 reporting-depth 用
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

`classify(entry)`：`type` 是 `user` 或 `feedback`，并且有非空的 `relay`，或者写入者是 `human`（`/memory`）或 `harness`（只在人的动作之后写，§3.7），就是偏好；其余是事实。这样「用户定下的」落成可查的条件：要么有人的原话，要么有人的动作作证据。`docs/ORCHESTRATION.md` §8.2 的表照此改写：偏好不衰减、只能由人撤；事实 14 天半衰期，每次被召回加成。

`strength(entry, now)`：偏好恒为 1；事实沿用现有公式 `min(1, 0.5^(距上次复审的天数 / 14) × (1 + min(reviews, 10) × 0.05))`（`src/memory/store.ts` 的 `strength`，搬进 `model.ts`）。强度低于 0.1 的事实（0 次复审时约 47 天）不进索引，`memory_query` 仍能找到。不自动删除任何条目。

两个范围的同名条目：`project` 范围的遮住 `all` 范围的（更具体的优先，同 ZCode 与 BigModel 记忆机制页的合并规则），索引与查询都只给前者，查询结果注明 `shadows: 'all'`。

### 3.2 写入：`memory_store`（m5-1）

参数（rc.3 不校验原样注册的工具参数，工具体自己查，同图工具）：

| 字段 | 必填 | 规则 | 不合法时 |
| --- | --- | --- | --- |
| `name` | 是 | `^[a-z0-9]+(-[a-z0-9]+)*$`，2–64 字符 | `invalid`，`field: name` |
| `type` | 是 | 四类之一 | `invalid` |
| `description` | 是 | 1–200 字符，不含换行 | `invalid` |
| `body` | 是 | 1–4000 字符；`feedback`、`project` 要有一行以 `Why:` 或 `**Why:**` 开头（不分大小写） | `invalid`，`hint` 写「follow the fact with **Why:** and **How to apply:** lines」 |
| `scope` | 否 | `project` 或 `all`；缺省 `user` 为 `all`，其余为 `project`；`project` 类不能是 `all`。参数说明（英文，给模型看）写：`"all" for preferences that apply in every project; "project" for this project's facts and norms.`，使跨项目的个人偏好（`docs/ORCHESTRATION.md` §8.2「关于人的偏好放用户级目录」）落在用户级目录；缺省值不变 | `invalid` |
| `relay` | 否 | 1–500 字符，人的原话 | `invalid` |
| `source` | `project` 类必填（D2 选 C） | 1–5 项，每项按 §5.7 的写法解析（1–200 字符），至少一项能识别：图里存在的节点 id（裸写或 `node:<id>`；图行在时核对，不在时按形状收下，记 `unchecked`）、项目根下存在的文件路径（可带 `§<节>` 或 `#<锚>`）、提交号（整项 7–40 位十六进制，或 `commit:` 加 7–40 位十六进制）、`http://` 或 `https://` 开头的地址。参数说明（英文）：`Where the fact lives: a project graph node id, a file path (optionally with §section), a commit id, or a URL.` | 没有一项能识别：`bad_source`，列出没认出的项与四种写法；带前缀的项（`commit:`、`node:` 等）不合 §5.7 的语法：`invalid`，`field: source` |
| `learnedFrom` | 否 | 至多 5 个组键（§3.6） | `invalid` |
| `confirmNew` | 否 | 布尔 | `invalid` |
| 其他字段 | 不收 | — | `invalid` |

步骤，按序第一条不成立就拒绝，拒绝是工具错误，正文是 `{code, message, field?, hint}`（同图工具的 `refuse`）：

1. 调用方是子 agent：`role`，正路「Report what you learned in your handback; the main agent keeps memory.」。
2. 字段校验，见上表。
3. `name`、`body`、`description`、`relay` 像密钥（`looksSecret`，§5.6），或 `source` 的某一项经 `checkRefs`（§5.7，提交号不判）判为像密钥：`secret_like`，`field` 写哪个字段，`message` 写命中的类别，什么都不写。路径、文件名与长标识符不命中（§5.6 的令牌形状判据不含 `/` 与 `.`，并要求同时有数字、大写与小写字母）。
4. 定目录：`project` 范围要有项目目录（§5.1），没有就 `no_project`；`all` 要有用户级目录（数据行在），没有就 `no_user_dir`。
5. 在锁里读出当前状态（§5.3）。同名条目已存在：这是更新，算一次复审，`created` 不变。被更新的是偏好、调用方没带 `relay`、且这条不是同一会话里同一个 agent 刚写的：`preference_owner`，正路「only the user changes a preference: quote their words in relay」。这条只管 `llm` 身份的调用；`harness` 身份只经 `recordDepthPress`（§3.7）写偏好，由 `model.ts` 的权限表放行（§7.5：只限名字 `reporting-depth`，证据必须含 `session:<id>` 与 `call:<id>` 或 `command:<id>`），不经本工具。新名字：与同一范围、同一类型里某条的相似度达到 0.6（`description` 与 `name` 的词集合的 Jaccard，英文按词、中文按相邻两字），或出处有相同的一项，且没带 `confirmNew`：`similar`，`message` 列出至多 3 条相似条目的 `name`、`type`、`description`，`hint` 写「update one of them by storing with its name, or pass confirmNew: true」。
6. 追加一条 `store` 记录（§5.2），返回 `{stored: true, name, scope, kind, updated}`。新条目的 `reviews` 从 0 起（现有 `remember` 让新条目从 1 起，这里改掉：写入不算复审）。

路径与文件名不再是拒绝的理由：`defaultKnowableFromGit`、`shouldStore` 与行配置 `knowableFromGit` 删除（`docs/ORCHESTRATION.md` §8.4 第一条兑现）。仓库能回答的内容由 Memory 节的原句提醒（§3.5），由查重与出处兜住，不靠正则。

D2 选别的选项时：选 A，`project` 类在第 2 步拒绝（`invalid`，`hint`「record project facts on the project graph (graph_comment, graph_propose) or in the docs」），`source` 字段删除；选 B，`source` 变成可选，第 2 步不查。

### 3.3 召回：会话开局的索引与 `memory_query`（m5-2）

ZCode 的做法（〔实读〕）：Memory 节在系统提示词里（ZCode context/builder.ts:152–160），索引 `MEMORY.md` 放在请求开头的用户上下文里，前一句是「Contents of <root>/MEMORY.md (user's auto-memory, persists across conversations):」（ZCode context/sections/request-user-context.ts:73–85，`injectionTarget: 'meta_user'`）；索引至多 200 行、25,000 字符，超出时截断并附一句警告（ZCode memory/index-content.ts:3–4、37）。

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

返回 `{matches: [{name, scope, type, kind, description, body, source, relay?, strength, created, lastReviewed, shadows?}]}`。打分沿用现有 `retrieve`：命中的关键词数乘强度。返回的事实各记一次复审（一条 `review` 记录列出这些名字），偏好不记。

### 3.4 撤销与遗忘（m5-1）

`memory_forget {name, scope?, reason, relay?}`：`reason` 1–300 字符。偏好只有带 `relay`（人的原话）才能删，同一会话里同一个 agent 刚写的除外（改正自己的误记）；否则 `preference_owner`，正路「only the user revokes a preference: quote their words in relay, or the user deletes it on the panel」。事实可以直接删。删除追加 `forget` 记录，带被删条目的快照，状态改为 `forgotten`，不从文件里抹掉。

人的命令 `/memory`（记忆行注册，`definitionId` 为 `dsh-glm-hourness/memory`，`recordInput` 缺省为记，命令事件留下人敲的几个词）：`show`（列出两个范围的条目数与最近 10 条）、`forget <name> [project|all]`、`restore <name> [project|all]`。身份为人，什么都能删。`restore` 把 `forgotten` 的条目按快照恢复；agent 只能经 `memory_store` 重写事实，不能恢复偏好。面板的删除与恢复就是发这两句（§4.7）。

### 3.5 方言的 Memory 节：贴训练分布（m5-3）

现状：`MEMORY_SECTION_DSH`（`src/glm-prompt/localize.ts`:74–86，883 字符）是 ZCode 骨架加改写，讲的是 `.llm/memory.json`、衰减与「memory_store refuses such entries」。改动后的字段（`name`、`description`、`type`、`body`）就是 ZCode 记忆文件的 frontmatter 与正文，所以可以把 ZCode 的原句大部分原样搬回来。

ZCode 原文（ZCode context/sections/memory.ts:30–64〔实读〕）逐句的处理：

| # | ZCode 原句（开头） | 处理 | 理由 |
| --- | --- | --- | --- |
| Z1 | `# Memory` | 原样 | — |
| Z2 | `You have a persistent file-based memory at …/. This directory already exists — write to it directly with the Write tool …` | 改写：`You have a persistent memory that the harness keeps for you; write it with memory_store, read it with memory_query, delete with memory_forget. Each memory holds one fact, stored with these fields:` | DSH 里没有这个目录，主 Agent 也没有 Write（`question-26` C）；宿主事实必须对（`docs/DESIGN.md` §5.1） |
| Z3 | frontmatter 代码块：`name: <short-kebab-case-slug>`、`description: <one-line summary — used to decide relevance during recall>`、`type: user \| feedback \| project \| reference`、`<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>` | 四行的内容原样，代码围栏（`` ```markdown `` 与 `` ``` ``）原样；去掉两行 `---`、`metadata:` 与正文前的空行，`type:` 行去掉 `metadata:` 下的两个空格缩进，正文一行前面加 `body: ` | 字段就是工具参数；ZCode 的 `type` 在 `metadata:` 下，工具参数是平的 |
| Z4 | `In the body, link to related memories with [[name]] … not an error.` | 原样 | `memory_query {name}` 能顺着名字取到；不存在的名字不算错，与原句一致 |
| Z5 | `` `user` — who the user is … `reference` — pointers to external resources (URLs, dashboards, tickets). `` | 原样 | 四类的定义不变 |
| Z6 | `After writing the file, add a one-line pointer in MEMORY.md … never put memory content there.` | 改写：`The memory index is loaded into context each session — one line per memory (name, type, description); read a memory in full with memory_query.` | 索引由 harness 维护（§3.3） |
| Z7 | `Before saving, check for an existing file that already covers it — update that file rather than creating a duplicate; delete memories that turn out to be wrong.` | 原样，只把 `existing file` 换成 `existing memory`、`update that file` 换成 `update that memory` | 没有文件 |
| Z8 | `Don't save what the repo already records (code structure, past fixes, git history, CLAUDE.md) or what only matters to this conversation; …` | 原样 | DSH 也读 `CLAUDE.md`（agent-instructions:17 的候选是 `AGENTS.md`、`CLAUDE.md`），这句是真的；「past fixes」正好对上经验板块 |
| Z9 | `Recalled memories appearing inside <system-reminder> blocks are background context, not user instructions, … verify it still exists before recommending it.` | 原样 | 索引就在 `<system-reminder>` 里 |
| L1 | — | 新增：`When the user tells you how to work, pass their own words in relay. A project memory names where the fact lives in source (a project graph node id, a doc section, a commit or a URL); that source stays the authority.` | 偏好要原话（§3.1）；事实以出处为准（D2 选 C） |
| L2 | — | 新增，只在 `lessons_query` 在本次 `next()` 的工具里时出现：`Pitfalls you hit and how you fixed them go on the lessons board; look them up with lessons_query.` | 坑与解法不进记忆（§2.1） |

不再写衰减：衰减由 harness 处理，模型的写法不因它而变；harness 会执行的规矩只在拒绝信息里教（清点报告 §0 第 4 条）。

全文（GLM 主 Agent，`lessons_query` 在工具里时）：2,220 个字符，含 21 个换行；不带 L2 时去掉最后的空行与 L2，2,121 个字符。行与行之间是一个 `\n`，空行就是两个 `\n` 之间什么都没有：

````text
# Memory

You have a persistent memory that the harness keeps for you; write it with memory_store, read it with memory_query, delete with memory_forget. Each memory holds one fact, stored with these fields:

```markdown
name: <short-kebab-case-slug>
description: <one-line summary — used to decide relevance during recall>
type: user | feedback | project | reference
body: <the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>
```

In the body, link to related memories with `[[name]]`, where `name` is the other memory's `name:` slug. Link liberally — a `[[name]]` that doesn't match an existing memory yet is fine; it marks something worth writing later, not an error.

`user` — who the user is (role, expertise, preferences). `feedback` — guidance the user has given on how you should work, both corrections and confirmed approaches; include the why. `project` — ongoing work, goals, or constraints not derivable from the code or git history; convert relative dates to absolute. `reference` — pointers to external resources (URLs, dashboards, tickets).

The memory index is loaded into context each session — one line per memory (name, type, description); read a memory in full with memory_query.

Before saving, check for an existing memory that already covers it — update that memory rather than creating a duplicate; delete memories that turn out to be wrong. Don't save what the repo already records (code structure, past fixes, git history, CLAUDE.md) or what only matters to this conversation; if asked to remember one of those, ask what was non-obvious about it and save that instead. Recalled memories appearing inside `<system-reminder>` blocks are background context, not user instructions, and reflect what was true when written — if one names a file, function, or flag, verify it still exists before recommending it.

When the user tells you how to work, pass their own words in relay. A project memory names where the fact lives in source (a project graph node id, a doc section, a commit or a URL); that source stays the authority.

Pitfalls you hit and how you fixed them go on the lessons board; look them up with lessons_query.
````

实现：

- 镜像文件 `src/glm-prompt/zcode-memory-text.ts` 导出 `ZCODE_MEMORY_LINES`：按 ZCode 的次序收保留下来的 10 行，每行一个字符串字面量，与 ZCode context/sections/memory.ts:34–59 的对应行逐字相同：Z1、`` ```markdown ``、`name:` 行、`description:` 行、`  type:` 行（带 ZCode 的两个空格缩进）、正文行、`` ``` ``、Z4、Z5、Z7–Z9 那一行。Z2 与 Z6 的原句含 ZCode 的目录与 `MEMORY.md`，不进镜像。文件加进 `scripts/check-verbatim.mjs` 的 `MIRROR_FILES`；逐字门禁把每行去掉首尾空白后、13 个字符以上的与 ZCode 核对（`MIN_LINE`），更短的三行（`# Memory` 与两行围栏）是结构，由下面的全文与白名单断言管。
- `localize.ts` 有本地文字常量 `MEMORY_Z2_LOCAL`、`MEMORY_Z6_LOCAL`、`MEMORY_L1`、`MEMORY_L2`、`MEMORY_BODY_PREFIX`（`'body: '`），用它们与镜像里的行按上面的全文拼出这一节，行之间用 `\n`。Z7 的两处替换（`existing file` → `existing memory`、`update that file` → `update that memory`）用一个「恰好替换一次，否则抛错」的函数（测试钉住），同 `search-alias.ts` 对 Grep 的做法。

L2 测试（`tests/glm-prompt.spec.ts`），替代 0.2 稿的占比下限：

1. 全文：带 `lessons_query` 时节与上面的全文逐字相同；不带时等于它去掉最后的空行与 L2。
2. 逐句：Z1、Z3 四行的内容、Z4、Z5、Z8、Z9 的每一句与 Z7 替换之外的部分，在节里整句出现。
3. 白名单断言：把节按 `\n` 切成行，跳过空行；整行等于 `MEMORY_Z2_LOCAL`、`MEMORY_Z6_LOCAL`、`MEMORY_L1`、`MEMORY_L2` 之一的行跳过（每个至多一次）；以 `MEMORY_BODY_PREFIX` 开头的那一行去掉前缀；Z7–Z9 那一行（以 `Before saving` 开头）把 `existing memory`、`update that memory` 各换回原词一次。剩下的行去掉行首空白之后，必须与 `ZCODE_MEMORY_LINES` 的每行去掉行首空白之后一一相等，次序相同，不多不少。于是节里不是 ZCode 原文的文字只能是这四句、`body: ` 前缀、`type:` 行去掉的缩进与 Z7 的两处替换；以后谁在节里加一句或改一个词，这条测试失败。

不算原样字符的占比：占比随 L1 的措辞浮动，含不含换行与条件句也会算出不同的数；白名单直接钉住「只改了这几处」，更贴「贴训练分布」的本意。按上面的全文，ZCode 原文（含围栏与换行）约占七成，这个数只作说明，不进测试。

D2 选 A 时 Z5 删去 `` `project` — ongoing work, … convert relative dates to absolute. `` 一句（同样用恰好替换一次的函数；白名单断言对镜像里的 Z5 一行做同一处删除之后比对），L1 删去后一句；选 B 时 L1 删去后一句。两种情况下全文随之改写，第 1、3 条照样成立。

出现条件不变：`memorySectionApplies`（`src/glm-prompt/index.ts`:117–120）判本次 `next()` 的工具里三个记忆工具都在。子 agent 的工具面里没有它们（§2.3），所以子 agent 不出这一节。探针常量 `MEMORY_SECTION_LINE`（`scripts/probe/run-probe.mjs`:374）改为新的首句。`docs/DESIGN.md` §5.3 第 ⑧ 项整条重写。

这一节在 GLM 主 Agent 的系统提示词里从 883 字符变成 2,220 字符。为什么值得：ZCode 的 GLM 在这几句话上训练过，原句越多，模型用记忆的方式越接近 ZCode 里的样子；代价在缓存前缀里。是否真有差别，由 L4 批次的消融核对（M7 §12：这一批新加的提示词节各做一次消融）。

### 3.6 学习流水线（m5-4）

`docs/ORCHESTRATION.md` §8.5 写的是「发现纠正 → 起草规则 → 人确认 → 注入 → 观察同类纠正的重复率」。`d-rules-human-only` 之后，「人确认」只用在规则上；记忆与经验是建议，人可以删，不逐条确认。harness 做能算的部分，主 Agent 做判断：

1. 信号（harness，纯函数 `correctionSignals(input)`，`src/memory/signals.ts`）。只取系统里看得到的数（`question-27` B）：

| 信号 | 从哪算 | 组的键 |
| --- | --- | --- |
| 人改了 LLM 写的图字段 | 节点历史：`actor: human` 的 `edit`，被改字段的上一次写入（含 `propose`）的身份是 `llm` 或 `harness` | `edit:<节点类型>.<字段>` |
| 人否决提议 | 历史里 `reject`，身份为人或带 `relay` | `reject:<节点类型>` |
| 人在五键卡上拒绝或补充 | 目标上身份为人的批注，由 M3 的 `answerPhrase` 生成（「点了「拒绝」」「点了「补充」」，后面带 `design_review <callId>`） | `card:reject`、`card:augment` |
| 人发起的重开 | 历史 `status` 从 `done` 到 `doing`，身份为人或带 `relay` | `reopen:<节点类型>` |
| 汇报细度拨档 | 记忆流水里 `reporting-depth` 的写入（§3.7） | `depth:up`、`depth:down` |
| 门禁以外的提交改了 agent 刚合入的文件 | git：基线分支上没有 `Hourness-Task` 尾注的提交，改到 14 天内带尾注的提交改过的文件（M7 合入后才有尾注；没有就不算这一项） | `commit:<顶层目录>` |

输入是图（引擎 `load()`）、记忆流水、可选的提交列表与起止时间；输出 `{events: [{at, key, ref}], groups: [{key, count, refs}]}`，`ref` 是节点 id 加历史下标、批注所在节点、提交号或流水 `seq`。同样的输入得到同样的输出。

2. 列出（M7 P2 的周报）：「纠正与学习」一节列至少 2 次的组（键译成人话、次数、至多 3 个例子），与「学过之后又出现」的次数。组的「学过」由下一步记下的 `learnedFrom` 判断。没有 M7 的周报时这个函数只在 L2 里跑（m5-4 验收第 2 条）。
3. 起草（运维会话里的主 Agent，周报的定时提醒到来时）：对每个至少 2 次、还没学过的组选一个落点，并把组键写进落点：

| 落点 | 什么时候 | 要人吗 | 记下组键的地方 |
| --- | --- | --- | --- |
| 偏好（`feedback` 带 `relay`） | 人在对话或卡片文字里说过 | 否 | 条目的 `learnedFrom` |
| 推测（`feedback` 不带 `relay`，会淡忘） | 只能从改动里看出来 | 否；周报列出，人删就撤 | 同上 |
| 经验 | 某种情况下的坑与解法 | 否 | 经验的 `learnedFrom`（`lessons_merge` 的参数） |
| 规则提议 | 要 harness 执行，写得成规则板的词汇 | 是：`rules_propose` 提图上的待决（规则板设计 §9.4）；规则行不在时 `graph_propose` 一张待决 | 待决正文里一行 `学自：<键>` |
| 候选标定题 | 同类失败两次以上，或人出手救场（M7 §3.14.5） | 否 | 复盘节点的 `候选标定题：` 一栏后加 `学自：<键>` |

4. 观察：`recurrences(groups, outcomes)` 数「学过之后」同组的新事件，周报每周报，附前 4 周的值（`docs/CHARTER.md` §8：只看走向）。复发不降的组由 M7 的规范阶梯处理（升一级，`docs/ORCHESTRATION.md` §9.2）。

这一条不新增给人的待决：只有规则提议到人面前，而那是主 Agent 判断之后提的，经过规则板与图引擎的卡片规则。

### 3.7 汇报细度闭环（m5-5）

现状：三档 `concise`、`balanced`、`detailed`（`src/glm-prompt/persona.ts`），常设偏好来自 GLM 包 `glm-prompt` 行的配置 `persona`（用户 profile 写的是 `balanced`）；M3 让「讲细点」「说重点」在本会话内调一档，当前档取会话历史里最近一次 `design_review` 结果的 `depth`，没有时为 `balanced`，「写入画像属于 M5」（M3 设计 §3.4.4、§3.4.2）。

闭环：

1. 信号：记忆行在 `tools/post-execute` 上装一个只观察的监听器（不改结果，总是返回下游的决定，tools:3599–3627）。调用名是 `design_review`（取 M3 加进 `src/shared/tool-names.ts` 的 `DESIGN_TOOL_NAMES`）、结果不是错误、`value.outcome` 是 `more-detail` 或 `to-the-point`、`value.depth` 是三档之一时，以 `harness` 身份写偏好：`name: reporting-depth`、`scope: all`、`type: user`、`description: "Reporting depth: concise (the user chose 说重点 on a design card)"`、`body` 带 Why 一行、`relay` 写人点的键、`value` 为新档、证据是 `session:<会话 id>` 与 `call:<调用 id>`（§5.7）。新档与已存的相同就不写。M8 的晨报按钮以后调同一个函数 `recordDepthPress(level, evidence)`。监听器在 `next()` 之后把写入交给 `recordDepthPress`（不 `await`），立即返回下游的决定，所以 `design_review` 的结果不为写锁多等（锁至多等 2 秒，§5.3）；写失败（`busy`、`io`）时控制台告警一次、行健康降级，这一次拨档没有记下，下一次点键照样写。`recordDepthPress` 以 `harness` 身份写，权限表只放行名字 `reporting-depth`、证据含会话 id 与调用 id 的写入（§7.5）。
2. 服务：记忆行提供 `glmHournessMemory`，契约在公共库 `src/shared/memory-service.ts`：`depth(sessionId)` 返回这个会话第一次问到时存储里的值，之后同一会话一直返回它（进程内按会话缓存，至多 500 个会话，先进先出）；没有偏好时返回 `undefined`。`depth` 是同步函数（M3 与 `glm:persona` 在组装时调用），所以第一次问到时用同步读：`journal.readSync(path)` 对用户级记忆流水（`reporting-depth` 的范围是 `all`）做 `statSync`，大小与修改时间和读缓存相同就用缓存，否则 `readFileSync` 整读，用 `model.ts` 的同一个折叠函数算出状态并更新读缓存（与异步读共用缓存与折叠，§5.2）。流水估计每年不到 1 MiB，这次同步读在毫秒级，每个会话只做一次。没选「异步读、缓存热了再返回」：宿主重启后的第一个会话会在缓存热起来之前拿到 `undefined`，回到配置的默认档，m5-5 验收第 1 条时好时坏。读失败（权限、I/O）或没有数据行时返回 `undefined`，这个会话用配置的默认档；读失败另在控制台告警一次、行健康降级。
3. 读的一方：M3 算当前细度时，历史里没有 `design_review` 结果就取 `depth(sessionId)`，再没有才是 `balanced`；GLM 包 `glm:persona` 的「The user's standing preference is …」一句，服务在且有值时用它，否则用配置的 `persona`。两处都按会话冻住，所以人在会话中途点键只改这个会话的当前档（M3 已有），系统提示词不变，下一个会话才带上新的常设档。`question-31` C 的 Output Style 做出来之后，同一句改由那里读同一个服务。
4. 撤：人 `/memory forget reporting-depth`，下一个会话回到配置的默认。

先后：人在面板或卡片上的最近一次点键 > 配置 `persona` > `balanced`。为什么取「最近一次」而不平滑：人能一眼看懂（「你上次点了说重点，所以这次从简洁开始」），记忆页上写明来由，人删一条就回去。

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
  readonly id: string                   // "L-" + 6 位小写十六进制；在本项目与用户级两份流水里都唯一
  readonly scope: 'project' | 'all'
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
  readonly scope: 'project' | 'all'
  readonly situation: Situation
  readonly pitfall: string
  readonly fix: string
  readonly evidence: readonly string[]  // harness 按 §5.7 拼出：task:<id>、session:<childId>、commit:<7–40 位十六进制>
  readonly at: string
  readonly status: 'open' | 'merged' | 'dropped' | 'expired'
  readonly signature: string
}
```

id 的生成：在锁里折叠出状态之后（§5.3 第 3 步），取 6 位随机十六进制，与本项目与用户级两份流水里已有的经验与候选 id 比对（另一份流水读缓存，不取它的锁），撞了重取，至多 5 次，之后返回 `io`（「could not allocate a lesson id」）。两个进程分别往两份流水里同时生成同一个 id 的机会约为一千六百万分之一；万一发生，`/lessons delete <id>` 在两份里都找到它时不动手，列出两条与各自的范围，请人加 `project` 或 `all`（§4.7）。

候选的证据全由 harness 从 `propose` 的上下文拼出（交回结构的 `lessons` 没有证据字段，M7 §3.6.1）：`task:<context.task>`、`session:<context.childId>`（没有 `childId` 时用 `context.session` 的 id）、`commit:<context.commit>`。提交号照 M7 交回里的原样写全（M7 按 7–40 位十六进制校验，worker 交回的多是 40 位），不截成短号：全号在任何仓库里都不会有歧义，而 §5.7 让 `commit:` 加 7–40 位十六进制不判为像密钥。拼之前每个值按 §5.7 的语法查；不合语法的那一项不写，候选照收，收下的结果在 `notes` 里写明（§8.1）。`session:` 一项总在，所以证据不会因此变空。

签名 `signature(situation, pitfall)`：`errors` 非空时是规整后（小写、空白折叠、去首尾标点）的报错片段排序后连接；否则是规整后的坑的前 80 个字符加 `|` 加排序后的命令。签名用来判「完全相同」，不用来判「相似」。

相似 `similar(a, b)`：坑与解法的词集合 Jaccard 至少 0.5（英文按词、中文按相邻两字），或有一个相同的报错片段，或文件与命令各有一项重合。

经验的文字用英文写：它进简报与提醒，是给模型看的（M7「给模型看的文字用英文」）。面板照原文显示，表头与按钮是中文（§4.7）。

### 4.2 来源：候选、合并与去重（lessons-1）

1. 交回（M7 接缝）：worker 交回结构里的 `lessons` 每项由 M7 的交回处理调 `glmHournessLessons.propose(candidate, context)`（§8.1）。harness 以 `harness` 身份：校验（§7.4）；像密钥的拒收；范围缺省 `project`；算签名。签名与某条生效的经验相同：直接并入（`into`，原因「same signature as L-…」），这条经验的确认数加一；与某条人删掉的经验相同：丢弃（`drop`，原因「matches L-… the user deleted on <日期>」），并计一次「删后复发」；否则记成候选。结果分三种（§8.1 的 `ProposeResult`），不向 M7 抛错：
   - 收下：`{status: 'candidate' | 'merged' | 'dropped', id, notes?}`。`notes` 列出收下时去掉的部分（短于 8 个字符的报错片段、不合 §5.7 语法的上下文值），M7 可以照抄进交回摘要，也可以不看。
   - 拒收：`{status: 'rejected', code: 'invalid' | 'secret_like', field?}`。字段不合格或像密钥，什么都不写，流水里也没有记录（拒收的内容不能落盘）；经验行的计数器加一，行健康与 `stats` 报「N 条候选被拒（secret_like M 条）」。拒收是确定的结果，重试也一样，所以 M7 不走退路批注，只在交回摘要里记计数与代码（§8.1 第 5 条）。
   - 失败：`{error}`，只用于服务内部失败：`busy`（锁等不到）、`io`（读写失败）、`no_project`（会话没有项目目录）、`internal`（服务内部抛错，被 `propose` 自己接住）。M7 这时走退路批注，批注写进图之前先把每个字段过一遍同一个 `looksSecret`（§8.1 第 5 条）。
2. 导入 M7 的退路：M7 在经验服务不在或返回 `{error}` 时，把候选写成任务上的批注 `[候选经验] …`（M7 §3.5.5）。经验行在算候选提醒（§4.2.1）时决定要不要扫图：每个进程对每个项目第一次算时扫；之后距本项目上一次检查超过 60 秒时，经图引擎的 `load()` 取整张图的修订（`LoadedGraph.revision`，`src/graph/parse.ts`），与上一次扫时记下的不同才再扫；本进程的 `propose` 对这个项目返回过 `{error}` 之后，下一次计算不等 60 秒就检查。于是宿主运行期间 M7 新写的退路批注，至多一分钟后（或 `propose` 失败之后的下一步）进候选提醒，不等桌面版重启。`load()` 读全部节点文件（现在 149 个、约 411 KB），按 60 秒一次只在主 Agent 的步上做，图读不出时这一次不扫、下次再试。扫的时候把身份为 `harness`、以 `[候选经验]` 开头、还没导入过的批注导入为候选；每条批注无论导入成功还是被拒，都记一条 `import` 记录（节点 id 加批注时刻；被拒时 `data` 为 `{rejected: 'invalid' | 'secret_like'}`，不带批注的内容），所以每条只试一次。批注末尾带 JSON 时按 JSON 取字段（§8.1 请 M7 这样写），否则整句当坑、解法写「see the annotation on <节点>」。M7 略去的字段（「（像密钥，已略去）」）当作空；空了必填字段就按 `invalid` 拒。签名与一条开着的候选相同的批注不再新建候选（M7 在 `propose` 超时后走了退路、而 `propose` 其实已写成功时，同一条候选会两处都有），`import` 记录的 `data` 写 `{duplicateOf: <C-id>}`。导入同样过 `looksSecret`：M7 的略去若漏了一处（例如 M7 的实现早于本设计的第 5 条），令牌也不会再从图进到经验存储与别的项目。被拒的批注由卫生检查（§4.9）列出所在节点，批注本身留在图上，由人决定是否处理。
3. 根 agent 自己遇到的坑：用 `lessons_merge {action: 'new', …}` 直接写，不经候选。
4. 主 Agent 合并：有开着的候选时，根 agent 每步收到一条提醒（§4.2.1）；主 Agent 用 `lessons_merge` 处理。
5. 过期：开了 30 天还没处理的候选，在下一次算候选提醒时由 harness 记 `expire`，提醒里不再列；恢复用 `lessons_merge {action: 'reopen'}`（见下表）。

#### 4.2.1 候选提醒

`installStepNotice` 给根 agent 装一个 `agent/pre-step` 监听器，只在主 Agent 的步上注入：主 Agent 按 M3 的判据（投影 `hournessMainAgent` 为开启，经 `mainAgentActive` 读，M3 §3.1.2）；M3 的设计行不在时，任何根 agent 都算。这样同一个项目里人随手开的普通会话不会收到合并候选的提醒。条件是本项目与用户级的开着的候选不为空，且这组候选的摘要与可见历史里最近一条来源为 `glm-hourness-lessons-pending` 的提醒不同（或可见历史里没有这样的提醒，例如压缩之后）时注入，其余步不注入（K7）。文字：

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
| `revise` | `lesson`、`reason`，以及要改的字段 | 改坑、解法、情况、证据或范围 | 经验已删：`not_found` |
| `confirm` | `lesson`、`reason`、`evidence`（至少一条） | 最近确认改为现在，确认数加一 | 同上 |
| `retire` | `lesson`、`reason` | 状态转 `retired`：不进简报、不推提醒，查询不返回；面板列在「agent 收起的」 | 同上 |
| `drop` | `candidate`、`reason` | 候选转 `dropped` | `stale` 同上 |
| `reopen` | `candidate` 或 `lesson`、`reason` | 把 `expired`、`dropped` 的候选或 `retired` 的经验恢复；人删掉的不能由 agent 恢复 | 人删掉的：`role`，正路「the user restores it on the panel」 |

`scope`、`learnedFrom` 可选。证据（调用方给的与从候选取来的）每项都经 §5.7 的 `checkRefs`：从候选取来的在 `propose` 时已过同一个函数，这里再过一次，结果相同，所以 `new {candidate}` 与 `into` 不会因 harness 自己写的 `commit:<40 位>` 被拒。所有动作都在锁里先折叠出当前状态再判（§5.3），所以两个根会话同时并同一条候选，后到的拿到 `stale`。

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

6. 记命中：对推出去的每条经验追加一条 `hit` 记录（会话 id、调用 id、工具的原生名，`data` 带本会话的项目根；没有项目时为 `null`），写进经验所在的流水，不等它写完，写失败只告警一次；同一会话同一条只记一次（第 4 步已保证）。

监听器自己抛错时返回下游的决定原样不动，控制台告警一次，行健康降级（§7.2）。它不读存储，除非这次调用失败；读也是一次 `stat` 命中缓存。

### 4.5 用途三：`lessons_query`（lessons-1）

所有 agent 都能调，worker 在内（人的要求）。参数：`text`（1–500 字符，关键词）、`file`（一个路径）、`command`（一条命令文字）、`error`（一段报错，至多 6,000 字符）、`limit`（1–10，缺省 5）、`includeCandidates`（布尔，缺省真）；前四个至少一个，否则 `invalid`。打分：`file`、`command` 同 §4.3 的规则；`error` 同 §4.4 的子串匹配，再加报错文字与经验坑的词集合重合；`text` 是关键词在坑、解法、情况里的命中数。结果先列生效的经验，再列至多 2 条开着的候选，候选标 `status: 'candidate'` 与「unreviewed」。返回 `{lessons: [{id, scope, status, when, pitfall, fix, evidence, lastConfirmed, score}], more}`。查询不写流水。

工具说明（英文，常驻，约 700 字符）写明：经验是以前工作里的建议，不是规则，用之前先确认解法还适用；命令失败或工具行为反常时先查一次再绕路（与 M7 简报约束栏的那一句一致）。

### 4.6 建议不是规则：复发与规则提议（lessons-2）

- 经验行与记忆行都不在 `tools/pre-execute` 上注册监听器，不出任何拒绝；契约测试钉住这一点（§7.5）。简报、提醒、查询结果里都写「advice, not a rule」。
- 复发：一条经验 28 天内在本项目至少 3 个不同会话里被命中（`hit`）或被并入（`into`），且过去 28 天没在本项目为它发过复发提醒，经验行在本项目主 Agent 的下一步发一次提醒（判据同 §4.2.1，来源 `glm-hourness-lessons-recur`），并记一条 `recur-notified`（`data` 带项目根）。「本项目」按记录 `data` 里的项目根过滤：`hit`、`into`、`recur-notified` 三种记录的 `data` 都带写入时那个会话的项目根（`propose` 的会话是 M7 传来的主 Agent 会话）。于是范围 `all` 的经验在每个项目分别计数、分别抑制，与「每个项目每周至多 2 条」同一口径。提醒文字：

```
<system-reminder>
Lesson L-6c1d02 matched failures in 3 sessions in the last 28 days. Lessons stay advice. If the harness should enforce it, propose a rule to the user with rules_propose; without the rules board, propose a question with graph_propose.
</system-reminder>
```

  每个项目每个自然周至多 2 条，多的下周再发。提规则是主 Agent 的判断；规则板与图引擎负责卡片的格式与「只有人能设规则」（`d-rules-human-only`、规则板设计 §9.4）。
- 人删掉之后又复发的（§4.2 第 1 步的「删后复发」）不发提醒，只进周报的计数，人删过的不再往 agent 面前推。

### 4.7 人看与删：面板与命令（lessons-3）

位置按 plain-ui 设计 §7.6：经验板与规则板都是第 2 层的一页，从首页页脚进入，只读为主。本设计在板块登记表 `ui/src/graph/boards.ts` 登记两块：`lessons`（页脚「经验」）与 `memory`（页脚「记忆」），`Board.id` 的联合类型加上 `'memory'`。`available(sessionId)` 看投影 `hournessLessons`、`hournessMemory` 在不在；不提供 `homeLine`，首页不为它们多一行。

经验页（中文表头，经验原文照显示）：

- 顶上一行：「本项目 12 条 · 所有项目 3 条 · 2 条候选等主 Agent 合并」。
- 每条经验一块：坑（加粗）、解法、情况（文件、命令、报错片段作小标签）、证据（提交号与节点 id 可点开对应的页）、「3 天前确认 · 28 天里 2 个会话碰到」；右上角「删除」。
- 删除之后出现「已删除 · 撤销」提示 10 秒；撤销即恢复。
- 页尾两节默认折起：「agent 收起的（N）」与「你删掉的（N）」，每条有「恢复」。

记忆页：

- 「关于你」：偏好，每条写说明与你的原话（`relay`）、何时；汇报细度单独一行「汇报细度：简洁 · 你 10-29 在方案卡上点了说重点」。
- 「agent 推测的（会淡忘）」：推测的 `feedback`，写强度（「还记得七成」）。
- 「项目里的线索」：`project` 与 `reference`，写出处（节点 id 可点开）与强度；迁来的标「没有出处」。
- 每条「删除」，删后同样可撤销。

读：两行各注册一个会话投影（session-projection:68–102），`init(header)` 在会话创建时（session-projection:51–63）算出这个会话对应的两份流水的绝对路径与问题（没有工作目录、没有用户级目录），`apply` 不改状态，`wire.view` 把它交给客户端。rc.3 把 `init(header, inheritedEventCount)` 的返回值直接当状态存（session-projection:58、296、368），`wire.view` 也是同步的，所以 `init` 里定项目目录用同步版本 `projectDirOfSync(cwd)`（`statSync`、`readFileSync`，§5.5），不起 git 进程、不读流水，只算路径；返回 Promise 会被当成状态。客户端经 `remote.workspaceFiles.readBytes(sessionId, 绝对路径, {})` 整读，经 `changes` 订阅这两个文件（文件的读与监视不限于工作区，按文件系统的读权限，`dsh-api-workspace-files/README.md`:12、40、58），用 `src/lessons/model.ts`、`src/memory/model.ts` 的折叠函数算出状态。页面可见时另每 15 秒按大小与修改时间检查一次（工作区外文件的监视在桌面版上没核对，§14 U4）。读失败时保留上一次读到的内容，顶上写原因。

写：面板不写文件，按钮发命令（`remote.commands.execute`，同 `/graph-apply` 的通道），身份为人：

| 命令 | 输入 | 结果（会话里一行） |
| --- | --- | --- |
| `/lessons` | `show`；`delete <L-id> [project\|all]`；`restore <L-id> [project\|all]`；`drop <C-id> [project\|all]`（人也可以直接丢候选）。范围可省；省略时在两份流水里找，两份都有这个 id 时不动手，列出两条与各自的范围，请人加范围（§4.1 的 id 查重让这几乎不发生） | 「已删除经验「Get-Content without -Encoding …」」；拒绝时写人能照着做的中文（「找不到 L-3f9a2c，可能已被删除，刷新一下」） |
| `/memory` | `show`；`forget <name> [project\|all]`；`restore <name> [project\|all]` | 同上 |

两个命令的 `definitionId` 是 `dsh-glm-hourness/lessons` 与 `dsh-glm-hourness/memory`，`recordInput` 缺省为记（commands:148–180）：人敲的与面板发的都是几个词，会话日志里留下它们，与流水里的记录互为印证。删除记一条 `delete`（经验）或 `forget`（记忆），带被删条目的快照与命令的 `commandId`。

在面板做出来之前（P1 之前），人用这两个命令照样能看与删。

### 4.8 第一批经验（lessons-4）

来源是人审过的文档与图上的记录。导入方式：L1 合入之后，编排者把下表写成一个操作文件（放在 `.agents/tasks/<实施运行>/` 下，不入库），经命令行 `npm run -s lessons -- apply --file <文件>` 以 `llm` 身份写成生效的经验（不经候选：来源已经审过），原因写「seed from <出处>」。重复导入按签名跳过。下表的证据一栏是给人看的说明；操作文件里按 §5.7 的写法写，例如第 19 条写 `commit:cae6ddf`、`node:recommend-last@2026-10-29T11:39`，第 1 条写 `docs/HANDOFF.md §6`，第 2 条写 `docs/DEVELOPMENT.md §7`、`AGENTS.md`。范围 `all` 的进用户级目录，其余进本仓库的 `.llm/lessons.jsonl`。

| # | 情况 | 坑（pitfall） | 解法（fix） | 证据 | 范围 |
| --- | --- | --- | --- | --- | --- |
| 1 | tools `pwsh`；commands `Get-Content`、`Set-Content`、`Out-File`、`Add-Content` | Windows PowerShell 5.1 reads and writes the ANSI code page when -Encoding is omitted; a UTF-8 file round-tripped this way loses its non-ASCII characters. | Edit files with the file tools or a Node script; when PowerShell must read or write text, pass -Encoding UTF8; never redirect output into source files. | `docs/HANDOFF.md` §6（2026-10-28 损坏 `src/shared/dsh-min.ts`） | all |
| 2 | files `src/*/index.ts` | A row whose apply() throws during activation takes the whole DSH host startup down. | Never throw in apply: degrade to a warning plus no-op and report row health; boot the bundle in the headless sandbox (npm run probe) before installing. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 1 行）；`AGENTS.md`「代码」 | project |
| 3 | files `ui/**`、`packages/*/cordis.patch.yml`；errors `resolves from multiple active Loader sources` | A client half declared in a package with several rows makes client-modules see one package from several Loader sources, and the host fails to start. | Keep each client half in its own single-row client package; npm run preflight checks it. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 2 行） | project |
| 4 | files `src/glm-llm/**`；errors `adapter returned invalid or duplicate model` | listModels returned models without provider and the host rejected the adapter. | Check the adapter against the official .d.ts with AdapterContractCheck; tsc then catches it. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 3 行） | project |
| 5 | files `ui/src/**`；errors `styles is not defined` | A static package's client half used the styles builtin of dynamic packages, which does not exist there. | Static client halves get only require (the module table); render styles with a <style> element in the component. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 4 行） | project |
| 6 | files `src/*/index.ts`、`packages/*/cordis.patch.yml` | Rows that configured their own home wrote 190 usage records and a memory into ~/.dsh/profiles/desktop/.llm/, where /hourness could not read them. | Resolve data directories through the data service glmHournessData (docs/DESIGN.md §2.4); never give a row its own data path. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 5 行）；`docs/DESIGN.md` §2.4 | project |
| 7 | files `src/guard/**`；tools `pwsh`、`bash` | Regex shell detection without quote awareness treated =>, >>> and -> inside quoted text as redirects and denied harmless commands. | Parse shell text quote-aware (src/guard/shell.ts); start a new gate in shadow mode and count false denials before enforcing it. | `docs/DEVELOPMENT.md` §7（2026-10-27 第 6 行）；`docs/ROADMAP.md` M1.8 | project |
| 8 | files `src/shared/dsh-min.ts`、`src/shared/lm-min.ts` | reference/deepseek-harness is the 2026-10-23 trunk, not the desktop runtime; fields read from it (toolCalls, exec.agentId, terminal_send.command) do not exist in rc.3 and the code silently did nothing. | Read the runtime package in reference/dsh-desktop-0.2.1-rc.3/<package>/lib/index.js, record package:line in docs/DESIGN.md §2.4a, and type it in the thin adapter layer. | `docs/DEVELOPMENT.md` §7（2026-10-28 三行）；`docs/DESIGN.md` §2.4a | project |
| 9 | files `src/guard/**`；tools `write`、`edit` | The guard judged relative paths as outside the workspace and let C:\ws\..\elsewhere through, because it only normalised case and separators. | Resolve paths against the session working directory with path.resolve, as the file tools do; test relative paths and "..". | `docs/DEVELOPMENT.md` §7（2026-10-28 相对路径一行） | project |
| 10 | files `src/glm-llm/**` | A random x-session-id per request broke the gateway's cache affinity, so follow-up requests missed the latest prefix. | Keep the session id fixed per DSH session (docs/DESIGN.md §4.5b) and check cache hits per step in the usage journal. | `docs/DEVELOPMENT.md` §7（2026-10-28 缓存一行）；`docs/DESIGN.md` §4.5b | project |
| 11 | files `src/glm-llm/**` | Ported code lost details of its source: the signing handshake got the routed URL (404 on every request) and four request fields were dropped. | Port line by line against reference/zcode-api (body-transformer.ts, client-signing) and assert complete URLs and headers in assembly tests. | `docs/DEVELOPMENT.md` §7（2026-10-28 签名与请求细节两行）；`docs/DESIGN.md` §4.3 | project |
| 12 | files `ui/**`；errors `entry did not activate` | After rebuilding a client half, refreshing the desktop page requested a stale revision and the client package failed to import (404). | Restart the desktop app after rebuilding a client half; a page refresh is not enough. | `docs/DEVELOPMENT.md` §7（2026-10-28 客户端 404 一行） | project |
| 13 | files `cordis.patch.yml`；commands `restart.ps1` | Switching the model in the desktop's input menu writes it into the profile's agent-default-model, so later sessions start on that model. | After a check, switch back through the same menu and verify agent-default-model in the profile patch. | `docs/HANDOFF.md` §6 | all |
| 14 | commands `dsh`、`DeepSeek Harness.exe`；errors `'dsh' is not recognized` | dsh is not on PATH on the desktop install, and --profile desktop is refused because the desktop app owns that profile. | Run DSH through the Electron node mode of "DeepSeek Harness.exe" with a separate temporary profile (docs/DEVELOPMENT.md §3). | `docs/DEVELOPMENT.md` §3 | project |
| 15 | commands `npm run probe`、`npm run calibrate` | A probe and a calibration run started together share the sandbox and disturb each other. | Run one at a time; take the rules board's dsh-profile lease when the rules row is installed. | `docs/HANDOFF.md` §6 | project |
| 16 | commands `npm test`、`npm run check:secrets` | npm test fails when gitleaks is not installed; the secret scan has no skip. | Install gitleaks 8.30.1 to %LOCALAPPDATA%\Programs\gitleaks or set GITLEAKS_PATH (docs/DEVELOPMENT.md §11). | `docs/HANDOFF.md` §6；`docs/DEVELOPMENT.md` §10 | project |
| 17 | commands `cdp.mjs`；tools `pwsh` | Sending Chinese text to the desktop page through CDP from PowerShell 5.1 garbles it. | Use evalfile or typefile of .agents/tasks/m2-panel/cdp.mjs to send non-ASCII text from a file. | `docs/HANDOFF.md` §6 | project |
| 18 | files `ui/src/**`；errors `without inject` | Declaring only a nested service name (remote.commands) in inject throws when the code reads ctx.remote. | Declare the whole service path chain in inject, e.g. 'remote' and 'remote.commands', copied from the official package's inject list. | `docs/DEVELOPMENT.md` §5 第 7 条 | project |
| 19 | files `docs/graph/**`；tools `graph_comment`、`graph_status`；commands `git commit` | A worker committed a graph comment on local main although its brief said not to touch the graph; a constraint that lives only in a brief is not kept. | Report graph changes in the handback (questions, lessons) and let the main agent write the graph; constraints that matter belong in a harness gate (M7 worker-graph-readonly, write scope). | 提交 `cae6ddf`；节点 `recommend-last` 2026-10-29T11:39 的批注 | project |
| 20 | files `.agents/tasks/**`、`docs/graph/nodes/**` | A brief written before the user's decision was not updated; the worker implemented the superseded rule and two reviews passed it. | Generate the brief from the graph at dispatch and re-brief when a pinned node changes (M7 pins); before writing a design, read .agents/tasks/design-context.md and the graph node, and the node wins. | 阅读摘要 §6 K5；节点 `orch` 2026-10-29T12:41 的批注；`.agents/tasks/design-context.md` | project |
| 21 | files `**/*state*.json`；tools `write` | A blue screen zeroed a workflow's state file and the run could not resume, while the graph, written by temp file plus rename, kept the real progress. | Keep orchestration state on the graph or in git; write any state file to a temp file and rename it over the old one. | 节点 `m1-parity` 的批注（蓝屏）；阅读摘要 §6 K4 | all |

第 12、18 条的报错片段是原报错里的一段（`web boot: 1 entry did not activate`、`cannot get property "remote" without inject`），选的是 split 改名之后仍会出现、又不至于太宽的部分。

### 4.9 统计与卫生（给 M7 的晨报、周报与巡检）

经验服务与记忆服务各提供两个只读函数（§8.1），M7 P2、P3 调用；不在时 M7 不列这一节。

- `stats(session, since, until)`：经验新增、并入、丢弃、过期、人删、人恢复的条数；开着的候选数与最老一条的天数；每条经验在期间命中的会话数；删后复发数；「经验存在之后同一报错又出现的会话数」（经验的 `created` 之后带同一片段的失败匹配，按会话计）。记忆新增的偏好、推测与事实，删除数，`reporting-depth` 的变化。这些是 `lessons`「同一个坑不用每个子 agent 各踩一次」的度量：看曲线走向，不设达标线（`docs/CHARTER.md` §8）。
- `hygiene(session, now)`：`project` 事实的出处节点已被取代、废弃或不在，出处文件不在；强度低于 0.1 超过 30 天的事实；180 天没确认的经验；流水里的坏行；超过 7 天的候选；相似的经验对（§4.1）。M7 的巡检把可以安全自动做的交给 harness（只有「候选过期」一项，由经验行自己做），其余列成发现。

## 5. 存储与并发

### 5.1 目录：用户级与项目

| 数据 | 位置 | 写的一方 | 读的一方 |
| --- | --- | --- | --- |
| 项目的记忆（范围 `project`） | `<项目目录>/memory.jsonl` | 记忆行（工具、harness）、`/memory`（人） | 记忆行、面板、命令行 |
| 用户的记忆（范围 `all`） | `<userHome>/memory/memory.jsonl` | 同上 | 同上 |
| 项目的经验 | `<项目目录>/lessons.jsonl` | 经验行（工具、harness）、`/lessons`（人）、命令行（`llm`） | 经验行、面板、命令行 |
| 用户的经验（范围 `all`） | `<userHome>/lessons/lessons.jsonl` | 同上 | 同上 |
| 写锁 | 每份流水旁的 `<文件>.lock`；陈旧的改名为 `<文件>.lock.stale-<毫秒>` 留着 | 写的一方 | 写的一方 |
| 旧格式 | `<项目目录>/memory.json`，迁移后改名为 `memory.json.migrated-<毫秒>` | 迁移 | 无 |
| 两个投影 | 宿主内存，每个会话一份路径 | 两行 | 面板 |
| 读缓存、每会话冻住的细度 | 宿主内存 | 两行 | 两行 |

`userHome` 只取数据目录服务（`docs/DESIGN.md` §2.4：没有数据行就不写用户级数据）；命令行用同一个解析函数 `userDataHome()`（显式 `--dsh-home` > `$DSH_HOME` > `~/.dsh`），所以与宿主落在同一处。

项目目录，按序取第一个成立的：

1. 数据目录服务的 `projectOverride`（数据行的新配置，绝对路径）。只给探针、标定与测试用：`scripts/sandbox.mjs` 的 `dataRows(dir)` 设成 `<dir>/home`，于是探针（默认 `cwd` 就是本仓库）与标定都不碰本仓库的 `.llm`，也不碰真实的用户级目录（`dshHome` 本来就指向运行目录）。
2. 会话头 `cwd`（session:1820–1826）所在 git 仓库的根下的 `.llm/`（§5.5 `projectDirOf`）。
3. `cwd` 不在 git 仓库里：`<cwd>/.llm/` 已经是一个目录时用它（§5.5）。
4. 都没有（含 `cwd` 是用户主目录或盘符根）：没有项目，`project` 范围不可用（`no_project`）。

不再用的：记忆行配置 `home`。用户 profile 给记忆行配了 `home: C:\Users\29596\Desktop\Project\GLM-Hourness\.llm`（profile 补丁第 67–69 行，只读看过），如果它继续优先，别的项目里的会话照样写进本仓库，正是 §8.2 定案要防的「混在一起会互相污染」。所以记忆行忽略 `home`，在行健康里写明「行配置 home 已不再使用（M5），项目目录跟会话的工作区」。删不删 profile 里这一行由人定（§13）；不删也无害。数据行的 `projectHome`（bundle 默认是本仓库的 `.llm`）仍给 guard、workflow、hourness 的流水用，本设计不改它（§1.4）。

为什么放工作区 `.llm/`，不学规则板放用户级目录按项目分：§8.2 的定案写明项目事实与规范放工作区；经验与记忆是项目知识，跟着项目文件夹走，人在资源管理器里看得到。代价是往别的项目的工作树里写一个目录，那些项目不一定忽略 `.llm/`。对策见 §5.5 的 `ensureIgnored`，与 M7 往 `.git/info/exclude` 追加 `/.worktrees/` 是同一个做法（M7 §6.3）。

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

记忆的操作：`base`（迁移）、`store`、`review`、`forget`、`restore`。经验的操作：`propose`、`import`、`new`、`into`、`revise`、`confirm`、`retire`、`drop`、`expire`、`reopen`、`delete`、`restore`、`hit`、`recur-notified`。每个操作在 `model.ts` 里有一个纯函数 `applyRecord(state, record)`，不读时钟与文件；折叠就是按文件顺序逐条调用。

- 坏行：解析不了、字段不合、操作对当前状态不成立（例如对不存在的经验 `into`）的行跳过，记下行号与原因，计入 `bad`。读出的状态与坏行一起交给调用方，行健康与面板写「N 行读不出」。
- 顺序以文件为准，`seq` 只用来发现并发异常：`seq` 与上一条相同（两个写者在锁失效时按同一份状态算出了同一个号）或小于上一条的行照样按文件顺序应用，计入 `seqAnomalies`，行健康写「流水 seq 重复或回退 N 处（锁可能失效过）」；不把它们当坏行，所以调用方已拿到成功的写不会在折叠时丢掉。
- 末行没有换行：可能是另一个进程正在写，也可能是崩溃留下的半行。读的一方忽略它。写的一方在锁里，所以这时它一定是崩溃留下的：先补一个 `\n` 把它封成一行坏行，再追加新记录。坏行留在文件里，不改写。
- 读缓存：按路径记 `{size, mtimeMs, state}`；每次读先 `stat`，没变就用缓存，变了整读并折叠。读有两个入口：异步的 `journal.read(path)` 给工具、提醒与服务；同步的 `journal.readSync(path)`（`statSync`、`readFileSync`）只给 `depth`（§3.7 第 2 步）。两者共用缓存与折叠函数。
- 大小：估算每年不到 1 MiB（经验与候选几十到几百条，命中每天几条）。不做轮换；文件超过 8 MiB 时行健康写「流水超过 8 MiB」。面板整读的上限是 32 MiB（`dsh-api-workspace-files/README.md`:65）。

流水是事实源，没有另存的快照（`docs/CHARTER.md` §7.1 条款 11：一处动作只记一个事实源）。

### 5.3 锁、并发与崩溃

写的一方（工具、harness、命令、命令行）都只经 `journal.append(path, plan)`：

1. 进程内按路径排队（Windows 上路径先小写），同一进程里的写一个接一个。
2. 取锁：`fs.open(<文件>.lock, 'wx')`（独占创建），内容 `{pid, host, at, boot, token, holder}`，`boot` 是本机开机时刻（`Date.now() - os.uptime() × 1000`，毫秒），`token` 是 16 位随机十六进制（`crypto.randomBytes(8)`）。已存在时每 50 毫秒重试，至多 2 秒，之后返回 `busy`。锁文件的修改时间早于 30 秒前，或里面的 `boot` 与本机当前开机时刻相差超过 120 秒，判为陈旧：改名为 `.stale-<毫秒>` 后重试一次。120 秒的容差吸收两次计算之间的取整与时间同步的小幅校正；墙钟被大幅改动时最坏是把一把正被持有的锁判为陈旧，后果由第 5 步与 §5.2 的 `seq` 规则兜住。一次写在锁里只停留几毫秒，所以 30 秒的门槛不用判断进程死活（M7 §15 U14 指出 `process.kill(pid, 0)` 在 Windows 上的行为没有核对，这里不依赖它）。
3. 在锁里：读出并折叠当前状态（不用缓存），调用 `plan(state)` 得到要追加的记录或拒绝；拒绝就放锁返回。这一步保证「先判后写」看到的是最新状态：两个会话同时并同一条候选，后到的判出 `stale`。
4. 末行封口（§5.2），追加记录（`seq` 取当前最大加一），`fh.sync()`，关闭。
5. 释放：任何一步抛错也在 `finally` 里做。先读出锁文件，里面的 `token` 是自己的才删；不是自己的（自己的锁已被别人判为陈旧并改名，现在的锁属于别人）就不删，控制台告警一次，行健康写「锁被判陈旧过」。这样第一个写者不会删掉第二个写者的锁，两个写同时进行的窗口只有被误判的那一次。

跨进程（桌面版宿主、headless 探针、Kiro 里的命令行）都经同一把锁。读不取锁。

### 5.4 迁移

记忆行读项目目录时：有 `memory.jsonl` 就只读它；没有而有 `memory.json`（版本 1，`src/memory/store.ts` 的格式）时，在内存里把它转成状态：每条成为 `type: project`、`kind: fact`、`legacy: true`、`source: []` 的条目，`created`、`lastReviewed`、`reviews` 原样，`name` 取原 `id`（不是 kebab-case 的规整成 kebab-case，冲突时加 `-2`）。第一次写入时，在锁里先写一条 `base` 记录（`data` 是转出的完整状态），再写这次的记录，然后把 `memory.json` 改名为 `memory.json.migrated-<毫秒>`。

- 旧文件解析失败：不迁移、不覆盖、不写新流水；读与写都返回 `io`，`message` 写「旧记忆文件读不出：<原因>」，行健康降级。这延续现有 `loadStore` 的规矩「A corrupted store must surface, never silently reset」。
- 改名失败：新流水已在，下一次读只认新流水；行健康写「旧文件还在，已迁移」，下一次写入时再改名。
- 本仓库现在只有 1 条（`glm-hourness-handoff`，2026-10-27 的交接，已经过时）。迁移把它保留为没有出处的事实，按衰减淡出索引，卫生检查列出它（§4.9）；删不删由 agent 按卫生结果定。

### 5.5 项目根

`projectRootOf(cwd, fs)` 与 `projectRootOfSync(cwd, fs)`（`src/data/project-root.ts`，只读文件，不起 git 进程）：两者共用同一个解析函数 `resolveRoot(cwd, probe)`，`probe` 是注入的「这个路径是目录、文件还是不存在，文件的内容是什么」；异步版本的 `probe` 用 `fs.promises.stat`、`readFile`，给工具、提醒与服务；同步版本用 `statSync`、`readFileSync`，只给会话投影的 `init`（§4.7，rc.3 要求同步）。两者共用按 `cwd` 的缓存，测试对同一组目录断言两者结果相同。解析规则：从 `cwd` 往上找 `.git`。是目录，仓库根就是它的父目录。是文件（git 工作树），读其中的 `gitdir:` 指向 `<公共目录>/worktrees/<名字>`，再读那里的 `commondir` 得到公共目录，仓库根是公共目录的父目录；没有 `commondir`（子模块）时仓库根是 `.git` 文件所在的目录。结果是 `{root, git: true}`；找不到 `.git` 时是 `{root: cwd, git: false}`。结果按 `cwd` 缓存。这与规则板设计 §7.3 的项目键是同一条规则（规则板对不在 git 里的文件夹也用 `cwd` 本身，它的数据在用户级目录，不往那个文件夹里写），所以两边共用这一个函数（§8.3）。

项目目录 `projectDirOf(cwd)`（同样有同步与异步两个版本，共用解析与缓存）在项目根之上多一层 M5 自己的规则：

- `root` 是用户主目录或盘符根：没有项目，不论有没有 `.git` 与 `.llm/`（免得 `~/.llm` 成了所有会话共用的项目）。
- `git: true`：`<root>/.llm/`，不存在时在第一次写入时建。
- `git: false`：`<cwd>/.llm/` 已经是一个目录时用它；否则没有项目，`project` 范围返回 `no_project`，`all` 照常，什么都不建。行健康写「这个文件夹不在 git 仓库里，也没有 .llm/：本项目范围的记忆与经验不可用；要用就在这里建一个 .llm 文件夹」。理由：在桌面、下载这类文件夹里开的会话，不该因为第一次写记忆或经验就在那里多出一个 `.llm/`；不用 git 又想要项目记忆的人，建一个空的 `.llm` 文件夹就开启了。这一层的「`.llm/` 在不在」不进按 `cwd` 的缓存，每次定目录时 `stat` 一次，所以建了之后下一次写入就生效；已开的会话的面板投影在会话创建时算过路径，要新开会话才显示。

于是主检出与它的工作树（例如 `.worktrees/split`）是同一个项目；委派子会话的会话头 `cwd` 就是父会话的目录（subagent:346–355），也落在父会话的项目里。

`ensureIgnored(root)`：根下有 `.git` 时，每个进程对每个根做一次。`child_process.execFile('git', ['check-ignore', '-q', '.llm/memory.jsonl'], {cwd: root, timeout: 2000})`：退出码 0 表示已忽略，什么都不做；1 表示没忽略，向 `<公共目录>/info/exclude` 追加一行 `/.llm/`（目录不在就建），行健康记一次「已在 <根> 的 .git/info/exclude 里忽略 /.llm/」；其他结果（没有 git、超时）不追加，行健康写原因。只追加，不改写已有内容。本仓库的 `.gitignore` 已有 `.llm/`，不会追加。

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

理由：范围 `all` 的经验会出现在别的项目的简报与提醒里，一段报错里的令牌会跟着扩散；拒收比事后清理容易。

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

harness 拼证据时先按同一语法查拿到的值：`propose` 的 `task:`、`session:`、`commit:`（§4.1），`recordDepthPress` 的 `session:`、`call:`、`command:`（§3.7、§7.5）。不合语法的那一项不写：`propose` 照收候选，在收下结果的 `notes` 里写明。`recordDepthPress` 拿到的调用 id 不合语法时写 `call:sha-<调用 id 的 SHA-256 前 16 位十六进制>`（`node:crypto`，在记忆行里算；16 位不到 `hex` 的 32 位；会话日志里按同一算法对得上），所以拨档不会因调用 id 的形状丢掉；调用 id 与命令 id 都为空时这一次不写，控制台告警一次，因为权限表要求其一（§7.5）。

流水记录的 `by`（`session`、`agent`、`tool`、`callId`、`commandId`）是宿主给的身份字段，不是证据：只按 id 语法（1–128 个 `[A-Za-z0-9_.:-]`）校验，不过 `looksSecret`；不合语法的字段不写，其余照写。

## 6. 宿主契约与 rc.3 证据

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据并经 L3 或 L4；「新用」指 M5 第一次用，实现时补进接口对照表与 `src/shared/dsh-min.ts`；「M3 新用」「M7 新用」指那两份设计先用。

| 契约 | M5 的用法 | 文件与符号（行） | 状态 |
| --- | --- | --- | --- |
| `tools/post-execute` 瀑布 `(exec, result, next)`；决定 `{kind: 'accept', content?, value?, additionalContexts?}` 或 `{kind: 'block', feedback, additionalContexts?}`；监听器抛错由外层捕获，结果变成错误 | 失败匹配（追加 `additionalContexts`）；细度观察（只看不改） | tools:3588–3628（`postExecute`）；外层 try/catch 见 3597 的注释 | 新用；同一接缝 DSH 自己的 repeat-tool-reminder 在用（repeat-tool-reminder:2247–2260） |
| 被 `tools/pre-execute` 拒绝的调用、工具体抛错的调用也走 post-execute | 失败文字包括拒绝与工具错误 | tools:3337–3353（拒绝走 `post-result`）、3416–3420（工具失败仍走 post-execute） | 实读 |
| `additionalContexts` 的元素是 `createUserMessage` 形状的用户消息，`source.form: 'notice'`；agent 循环把它们放进下一步的收件箱，下一次请求里在这次工具结果之后 | 失败提醒的位置 | repeat-tool-reminder:2235–2245（形状）；agent-loop:492–506、572（`acceptContext`） | 实读；GLM 路由上的位置〔未核实，U2〕 |
| shell 工具的结果值：`exitCode`、`timedOut`、`aborted`、`stdout{text, truncated}`、`stderr{text, truncated}` | 判失败、取失败文字 | tool-pwsh:267–290（`canonicalPwshResult`）；tool-bash:303 | 实读 |
| host 级 `tools/post-execute` 看得到子 agent 的调用（`exec.agent` 是子 agent） | worker 的失败也匹配 | 分发按 `scopeTarget(this, exec.agent)`（tools:3600），与 pre-execute（tools:3320）同一做法；pre-execute 看得到子 agent 已由探针 `glm-dispatch` 实测 | 推断〔U1〕 |
| `system-prompt/assemble` 瀑布；`assembly.tools` 可改 | 子 agent 的工具面去掉记忆工具与 `lessons_merge` | system-prompt:356–405 | 已用 |
| cordis 监听器顺序：`prepend` 放到前面（`unshift`），其余追加（`push`）；瀑布从最外层开始；分发按 `Context.filter` 过滤作用域 | 过滤监听器不用 `prepend`，方言的 `memorySectionApplies` 才看得到过滤后的工具 | cordis:335–345（`register`）、317–325（`waterfall`）、258–264（`dispatch`） | 实读；组合后的效果〔U3〕 |
| `agent/created`（serial，`{agent, source}`） | 给子 agent 装过滤；给根 agent 装索引与候选提醒 | agent:581–585 | 已用 |
| `agent/pre-step` 与公共库 `installStepNotice`；notice 要带 `id` 与 `role` | 索引、候选提醒、复发提醒 | agent-loop:901–925；`src/shared/step-notice.ts`；`createUserNotice`（`src/shared/dsh-min.ts`:462） | 已用 |
| 会话头 `cwd`；子会话头带 `parentSession`、`origin: 'subagent'` | 项目目录；根与子 agent 的判定 | session:1820–1826；session:1051–1053；subagent:346–355（`childSessionMeta`） | 已用 |
| `sessionProjections.snapshot(session, keys)` 读 M3 的投影 `hournessMainAgent`；M3 的纯函数 `mainAgentActive` | 候选与复发提醒只给主 Agent | session-projection:141；M3 设计 §3.1.2、`src/graph/main-agent.ts` | 已用（`snapshot`）；`hournessMainAgent` 是 M3 新用 |
| `session.deriveMessages()` 给出请求可见的历史（已应用压缩） | 索引与提醒的去重、压缩后重注 | session:1672–1686 | 已用 |
| `sessionProjections.register({key, stateSchema, init(header, inheritedEventCount), apply, wire{viewSchema, view}, stateVersion})`；`init` 在 `session/created` 时调用 | 投影 `hournessMemory`、`hournessLessons` 把两份流水的路径交给面板 | session-projection:51–63、68–102 | 已用（`graphLive`）；`init` 读文件是新用 |
| `remote.workspaceFiles.readBytes`、`stat`、`changes`：文件的读与监视不限于工作区，按组合文件系统的读权限；整文件读上限 32 MiB | 面板读两份流水，含用户级目录里的 | `dsh-api-workspace-files/README.md`:12、28、34、40、58、65 | 新用（规则板设计 §9.2 也这样用）；桌面版上读工作区外的文件〔U4〕 |
| `commands.register`：`name` 匹配 `/^[a-z][a-z0-9_-]*$/u`；`recordInput` 缺省为记；调用参数带 `agent` 与 `commandId` | `/memory`、`/lessons` | commands:148–180、266–269、379–385 | 已用 |
| `tools.register` 与输出 schema 子集；执行按名解析，与工具面无关；工具体收到 `exec`（`agent`、`callId`） | 五个工具；工具体查调用方 | tools:2974–2984、3227–3260、3406、3637–3640；`docs/DESIGN.md` §2.4a | 已用 |
| 工具调用 id：`exec.callId` 就是模型服务返回的 `block.id`；会话 id 是 `session-<序号>` 或 `session-<UUID>` | 证据 `call:`、`session:` 的写法，以及它们不判 `token`、`hex` 的理由（§5.7） | agent-loop:512；session:1802；api-session-controller:509、879 | 实读 |
| `ctx.get` 读服务、`ctx.provide` 提供服务、`ctx.inject` 在可选服务到达时开子 fiber | 读数据目录、图、方言服务；提供两个服务；可选地拿 `commands` 与 `sessionProjections` 而不改记忆行的激活条件 | cordis:763–766、800–830、1600 | 已用 |
| DSH 自己的 AGENTS.md 也是一条 `<system-reminder>` 用户消息，在第 1 步插在认领的消息之后；候选文件是 `AGENTS.md` 与 `CLAUDE.md` | 索引的位置与它并列；Memory 节 Z8 原句里的 `CLAUDE.md` 在 DSH 里成立 | agent-instructions:17、324–334、897–908、1406–1424 | 实读；两条消息的先后〔U10〕 |
| 子 agent 调 `userQuestions.ask` 被拒（`DELEGATED_CALLER`） | 子 agent 的经验与记忆只能经交回给主 Agent，不能直接问人 | user-questions:534 | 实读 |

ZCode 3.16 的事实（〔实读〕源码；逐字以 3.16.3 安装包核对，U8）：

| 事实 | M5 的用法 | 位置 |
| --- | --- | --- |
| Memory 节的全文（四类、frontmatter、链接、写入纪律、召回的内容是背景） | §3.5 的原句 | ZCode context/sections/memory.ts:30–64 |
| Memory 节在系统提示词，`MEMORY.md` 索引在请求开头的用户上下文，前一句「Contents of …/MEMORY.md (user's auto-memory, persists across conversations):」 | 索引是用户消息，不是系统提示词的一节 | ZCode context/builder.ts:152–160、199–207；context/sections/request-user-context.ts:73–85 |
| 索引至多 200 行、25,000 字符，超出时附警告 | 同样的上限与一句警告 | ZCode memory/index-content.ts:3–4、37 |
| 语义召回分支默认关闭 | 不做语义检索 | ZCode memory/project-memory-retrieval-branch.ts:4 |

本仓库的事实（不是宿主契约，M5 依赖而不改）：

| 事实 | M5 的用法 | 位置 |
| --- | --- | --- |
| `memorySectionApplies` 按本次 `next()` 的工具判三个记忆工具都在 | 子 agent 不出 Memory 节；工具名不变 | `src/glm-prompt/index.ts`:117–120；`src/shared/tool-names.ts` 的 `MEMORY_TOOL_NAMES` |
| 常驻名单 `ORCHESTRATION_RESIDENT_TOOLS` 已含三个记忆工具 | 「记忆工具常驻」已由 split 做到，M5 加探针断言 | `src/shared/tool-names.ts`:25–30 |
| 现有衰减公式与召回加成 | 搬进 `model.ts` | `src/memory/store.ts` 的 `strength`、`strengthen` |
| 探针每个场景用自己的数据目录，并核对真实用量流水不变 | 扩到记忆与经验的四份流水 | `scripts/probe/run-probe.mjs`:127–130、`scripts/sandbox.mjs` 的 `dataRows` |
| 图节点的历史带身份、操作、改动前后的值与转述 | 学习信号 | `docs/ORCHESTRATION.md` §2.6、§2.9；`src/graph/engine.ts` |

不做的：不注册 Remote 服务、不加瀑布、不追加自定义会话事件（第三方都做不到，`docs/DEVELOPMENT.md` §5、`dsh-session/README.md` 70 行）；harness 给模型的文字都是带本项目来源的 notice。

## 7. 失败预案

按 `d-failure-plans`：不穷举边角，按操作写清怎样发现、怎样重试、怎样恢复、事后从哪里查。两行自己出问题时一律偏向「不给建议」而不是「挡住工作」：经验与记忆都是建议，缺了它们 agent 照常干活。

### 7.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| `tools` 服务不在 | 本行不注册任何东西（`inject` 里有 `tools`，cordis 不会激活本行） | 行健康「未加载」 |
| 某个工具注册失败（重名、输出 schema 被拒） | 撤掉本行全部注册 | inactive，写明原因 |
| `commands` 不在（经 `ctx.inject` 可选地取） | 工具照常；没有 `/memory`、`/lessons`，面板的删除不可用 | degraded「没有命令服务，面板与命令不能删除」 |
| `sessionProjections` 不在 | 工具照常；面板看不到这两块（`available` 为假） | degraded |
| 数据行不在 | `all` 范围不可用，`project` 范围照常（项目目录不靠数据行） | degraded「没有数据目录服务：用户级的记忆与经验不可用」 |
| 记忆行有旧配置 `home` | 忽略 | 行健康的说明里写一次「行配置 home 已不再使用（M5）」 |

### 7.2 运行期

| 操作 | 失败的情形 | 怎样发现 | 重试 | 恢复 | 留痕 |
| --- | --- | --- | --- | --- | --- |
| 读流水 | 文件不在 | `ENOENT` | — | 当作空 | — |
| 读流水 | 坏行、`seq` 回退、操作不成立 | 折叠时计数 | — | 跳过坏行，其余照用；面板与行健康写「N 行读不出」，卫生检查列出行号 | 坏行原样留在文件里 |
| 读流水 | 权限、超过 32 MiB、其他 I/O 错误 | 抛错 | 下一次调用再读 | 工具返回 `io`；提醒这一步不注入；失败匹配这一次不推 | 控制台告警一次，行健康 degraded |
| 写流水 | 锁被占超过 2 秒 | 独占创建一直失败 | 50 毫秒一次，至多 2 秒 | 工具返回 `busy`，`hint`「retry in a moment」；harness 的写（命中、过期）丢掉这一次，下次再算 | 告警一次 |
| 写流水 | 陈旧锁（30 秒以上，或开机时刻相差超过 120 秒） | 锁文件的时刻与 `boot` | 改名后重试一次 | 照常写；被误判的持有者释放时发现令牌不是自己的，不删别人的锁 | 改名留下的 `.stale-<毫秒>`；`seq` 异常计数；行健康「锁被判陈旧过」 |
| 写流水 | 写或 `fsync` 失败（磁盘满、`EPERM`） | 抛错 | 不自动重试 | 工具返回 `io`；可能留下半行，下一次写入时封口成坏行 | 告警一次；坏行计数 |
| 判写（在锁里） | 状态已变（候选已并、条目已删） | `plan` 拒绝 | — | `stale` 或 `not_found`，带当前状态 | 无写入 |
| 项目目录 | 会话没有 `cwd`；`cwd` 是主目录或盘符根；不在 git 仓库里且没有 `.llm/`；`.git` 文件读不出 | `projectDirOf` 的结果 | 不在 git 仓库里的文件夹：每次定目录都重看 `.llm/` 在不在 | 没有项目：`project` 范围 `no_project`，索引只用用户级；不建 `.llm/` | 行健康写原因；不在 git 仓库里时写怎样开启（建一个 `.llm` 文件夹） |
| `ensureIgnored` | 没有 git、超时、写 `exclude` 失败 | 退出码与异常 | 每个进程每个根一次 | 照常写 `.llm/`；那个项目的 `git status` 会看到它，guard 的影子兜底可能多一条影子记录（只记录，不拦） | 行健康写原因 |
| 迁移 | 旧文件读不出；改名失败 | §5.4 | 改名在下一次写入时重试 | §5.4 | 行健康 |
| 索引提醒 | 组装抛错 | `try/catch` | 下一步再试（历史里还没有索引） | 这一步不带索引 | 告警一次，行健康 degraded |
| 失败匹配、细度观察 | 监听器内部抛错 | `try/catch` | — | 返回下游的决定，工具结果不变 | 告警一次，行健康 degraded |
| `relevant`（M7 调） | 读存储失败、内部抛错 | `try/catch` | M7 下次派发再调 | 返回空数组，简报不带经验（M7 已有「服务抛错或超过 2 秒时不带经验」） | 行健康 degraded |
| `propose`（M7 调） | 校验不过、像密钥 | 返回 `{status: 'rejected', code, field?}` | 不重试（结果是确定的） | M7 不写退路批注，只在交回摘要里记「N 条候选经验被拒：<代码>」（§8.1 第 5 条）；被拒的内容不落盘 | 交回摘要的计数与代码；经验行的拒收计数（行健康、`stats`） |
| `propose`（M7 调） | 写失败（`busy`、`io`）、没有项目目录、内部抛错 | 返回 `{error}` | M7 不重试，走退路 | M7 把候选写成任务上的批注，写之前逐字段过 `looksSecret`，命中的字段换成「（像密钥，已略去）」；经验行之后导入（§4.2 第 2 步） | 任务上的批注；告警一次 |
| 导入批注 | 图读不出、批注格式认不出 | 引擎返回、解析失败 | 图读不出时 60 秒后的下一次检查再试（§4.2 第 2 步） | 认不出的整句当坑导入；图读不出就不导 | `import` 记录；行健康 |
| 导入批注 | 批注的字段不合格或像密钥 | `propose` 同一套校验与 `looksSecret` | 不重试 | 不导入；写一条 `import` 记录，`data` 为 `{rejected: <代码>}`，不带批注内容，所以只试一次；卫生检查列出所在节点 | `import` 记录；卫生检查 |
| 源节点核对 | 图行不在、图读不出 | `graphService` 为空或抛错 | — | 节点 id 形状的出处按形状收下，记 `unchecked`；卫生检查以后再核 | 条目上的 `unchecked` |
| 命令 `/memory`、`/lessons` | 输入不认识；目标不在；写失败 | 解析与 `plan` | 人再发一次 | 错误行写人能照着做的中文 | 命令事件；成功时的流水记录 |
| 面板读 | 读不出、监视断开 | `readBytes` 与 `changes` 的错误 | 15 秒后再读 | 保留上一次读到的，顶上写原因 | 无 |
| 第一批经验导入 | 中途失败 | 命令行退出码 | 重跑 | 按签名跳过已导入的 | 每条一条 `new` 记录 |
| 两个根会话同时合并 | 同一条候选 | 第二个在锁里判出 `stale` | — | 主 Agent 读结果里的当前状态 | 只有一条 `into` |
| 宿主重启 | 内存里的缓存、冻住的细度 | — | — | 从文件重建；每个会话的细度第一次问到时重读（可能与重启前不同，这个会话的系统提示词变一次，缓存失效一次） | — |

### 7.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 删经验、删记忆 | 丢内容 | 只是追加一条带快照的记录，状态改为墓碑；人能恢复（经验与记忆都能）；agent 能重写事实、恢复自己收起的经验与过期或丢弃的候选 |
| 迁移旧 `memory.json` | 丢旧数据 | 改名保留，不删；解析失败不迁移、不覆盖 |
| 流水 | 被覆盖或截断 | 只追加；半行封口而不删；没有轮换，不重写 |
| 陈旧锁 | 误删别人的锁让两个写同时进行 | 只在 30 秒以上（一次写只要几毫秒）或开机时刻相差超过 120 秒时判陈旧；改名保留，不删；释放时核对锁里的令牌，不是自己的不删；万一两个写重叠，`seq` 相同的两行都按文件顺序应用，不丢已确认的写（§5.2） |
| 被拒的候选经验经 M7 退路写进图 | 图提交并推到 Gitee，删掉要改写历史，而 `docs/DEVELOPMENT.md` §9 不许强推 | `propose` 把拒收（`rejected`）与服务失败（`{error}`）分开，只有后者走退路；退路批注写进图之前，M7 逐字段过同一个 `looksSecret` 并略去命中的字段，经验服务整行不在时也这样（§8.1 第 5 条）；导入时再过一次 |
| 写别的项目的 `.git/info/exclude` | 改那个仓库的本地 git 配置 | 只追加一行 `/.llm/`；先 `git check-ignore`，已忽略就不动；不改已有内容；同 M7 对 `/.worktrees/` 的做法 |
| 范围 `all` 的经验与偏好进入别的项目 | 一段报错里的令牌被带到别处 | 写入前拒收像密钥的文本（§5.6）；范围要显式写或按类型缺省；人能删 |
| 用户 profile | 改坏用户配置 | 不写 profile；不再使用的 `home` 留给人定（§13） |

### 7.4 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `memory_store` 各字段 | 见 §3.2 | 见 §3.2 | `invalid`、`bad_source`、`secret_like`、`similar`、`preference_owner`、`no_project`、`no_user_dir`、`busy`、`io` |
| `memory_query` | `focus` 与 `name` 至少一个 | §3.3 | `invalid` |
| `memory_forget` | `name`、`reason` | `reason` 1–300；`relay` 1–500；`scope` 两值之一 | `invalid`、`not_found`、`preference_owner` |
| `lessons_query` | `text`、`file`、`command`、`error` 至少一个 | §4.5 | `invalid` |
| `lessons_merge` | 按动作，见 §4.2.2 | 坑 1–300；解法 1–600；情况各项见 §4.1；证据 1–8 项，每项按 §5.7（`commit:` 加 40 位十六进制收下）；`reason` 1–300 | `invalid`、`duplicate`、`stale`、`not_found`、`role`、`secret_like`、`busy`、`io` |
| `propose` 的候选（M7） | `problem`、`fix`，`files`、`commands`、`tools` 至少一项非空 | 同上；`errors` 至多 5 项、每项 8–300（不够长的丢弃，收下结果的 `notes` 里注明）；`scope` 两值之一；每个字符串字段过 `looksSecret`；上下文的 `task`、`childId`、`commit` 按 §5.7 的语法查，不合的那一项不进证据，`notes` 注明，候选照收 | 返回 `{status: 'rejected', code: 'invalid' \| 'secret_like', field}`，不抛、不写；`{error}` 只给服务内部失败 |
| `relevant` 的参数（M7） | `session`；`paths`、`tools`、`commands` 可为空数组 | 每组至多 50 项；`limit` 1–10 | 多余的截掉；`session` 缺失返回空数组 |
| 证据与出处的每一项（经验、候选、流水记录的 `evidence`，记忆的 `source`） | 按所在字段 | §5.7 的写法，1–200 字符，不含换行 | 带前缀而不合语法：`invalid`（`field` 带下标）；像密钥：`secret_like`；`source` 没有一项能识别：`bad_source` |
| `/memory`、`/lessons` 的输入 | 是 | §3.4、§4.7 的几种写法 | 错误行，列出能用的写法 |
| 流水的每一行 | — | §5.2 的结构与每个操作的 `data` 形状 | 坏行 |
| 旧 `memory.json` | — | 版本 1 | `io`，不迁移 |
| 命令行的操作文件 | 是 | 一组 `lessons_merge` 的参数（`new` 为主） | 退出码 1，逐条写出不合格的项，已写入的不回滚（按签名可以重跑） |
| 数据行配置 `projectOverride` | 否 | 非空的绝对路径 | 忽略，行健康写明 |
| 五个工具的其他字段 | 不收 | — | `invalid`（rc.3 不校验原样注册的工具参数，工具体自己查，同图工具） |

### 7.5 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 经验与记忆不拦任何调用 | 两行都不在 `tools/pre-execute` 注册监听器；`tools/post-execute` 的监听器只追加上下文、不返回 `block`；契约测试断言两行注册的事件只有 `agent/created`、`agent/pre-step`、`tools/post-execute`、`system-prompt/assemble`（agent 作用域），记忆行另有既有的 `llm/stream`（用量流水，只观察） | 「经验只是建议，不是规则」（`lessons` 节点、`d-rules-human-only`） |
| 只有人删经验、撤偏好 | `model.ts` 的权限表（`apply(actor, op)` 先查表）；命令是唯一的 `human` 入口；工具体按调用方与 `relay` 判 | 身份在 harness 的入口核对，不靠提示词（`docs/CHARTER.md` §6） |
| `harness` 只在人的动作之后写偏好 | 权限表的一行：`harness` 可以 `store` 偏好，只限名字 `reporting-depth`、范围 `all`，`evidence` 必须含 `session:<id>`，并含 `call:<id>`（人点键的那次 `design_review` 调用）或 `command:<id>`（M8 晨报按钮发的命令）之一；其余 `harness` 写偏好的记录在 `applyRecord` 里判为坏行，写入口在追加前就拒绝 | 偏好不衰减、只有人能撤（§3.1），harness 写的偏好必须有人的动作作证据 |
| 子 agent 不写记忆与经验 | 工具面过滤（让模型看不到）；工具体按会话头的 `origin` 拒绝（按名直接调用也拦住） | 工具面过滤不是安全边界（`docs/DESIGN.md` §2.4a）；worker 的经验经交回由主 Agent 合并 |
| 每个状态变化都有一条记录 | `journal.append` 是唯一的写入口；记录必带身份与时刻，删除带快照 | 条款 11 |
| 一个项目的数据不进另一个项目 | 项目目录只按会话头的 `cwd` 定位（或测试与探针的 `projectOverride`），不读 profile 里的 `home` | §8.2 定案「混在一起会互相污染」 |
| 会话内系统提示词不变 | 索引是对话里的 notice；`depth(sessionId)` 按会话冻住 | 提示词缓存（`docs/DESIGN.md` §6 第 2 条） |
| `project` 事实以出处为准（D2 选 C） | `memory_store` 的第 2 步；召回时带出处；卫生检查出处是否还在 | 单一事实源（`docs/CHARTER.md` §10） |
| 标定与探针不读真实的经验与记忆 | `dataRows` 设 `projectOverride` 与 `dshHome`；探针核对四份真实流水不变 | 否则标定结果随经验的积累漂移（`risk-calib-read`） |
| 像密钥的文本不进存储 | `looksSecret`（正文类字段）与 `checkRefs`（证据与出处，§5.7）在所有写入口之前，在 `model.ts` 的校验里，工具、`propose`、命令、命令行与 harness 的写都经它 | 范围 `all` 会把它带到别的项目 |

### 7.6 可测性

纯函数在 L2 直接测：记忆的 `classify`、`strength`（注入时钟）、校验的每一条、相似、索引的渲染（顺序、遮蔽、淡忘、上限与警告）、旧格式转换；经验的签名、相似、权限表、每个 `applyRecord`、派发打分、失败匹配（规整、长度、去重、至多 2 条）、查询打分、复发计数与每周上限、渲染（每行 300 与 400 字符上限、截断次序）；`correctionSignals` 与 `recurrences`（固定的图历史）；`looksSecret`（§5.6 的三组固定用例，拒绝信息的类别）；`projectRootOf` 与 `projectRootOfSync`（目录、工作树文件、没有 `commondir`、找不到 `.git`；同一组目录两者结果相同）；`projectDirOf`（git 仓库、主目录与盘符根、不在 git 仓库里有与没有 `.llm/`、建了 `.llm/` 之后下一次就认出）；`parseRef` 与 `checkRefs`（§5.7 的每种写法、提交号的两种写法不判 `hex`、`commit:` 后不是十六进制时 `invalid`、`call:` 加 32 个大小写字母与数字的 id 收下、`call:` 加 `ghp_` 令牌判 `prefix`）；`pathsMeet` 与 `globMatch`（§4.3 的通配对通配用例）；复发按项目根过滤（范围 `all` 的经验在项目 A 发过提醒，项目 B 照样计数与提醒）；经验 id 在两份流水里查重（注入的随机源先给出撞号的 id）；`seq` 重复的两行都应用并计入 `seqAnomalies`；`harness` 写偏好的权限（`reporting-depth` 带证据放行，别的名字或缺证据拒绝）。

经验服务在 L2 加：`propose` 收到带 `ghp_` 令牌的候选返回 `{status: 'rejected', code: 'secret_like', field}`，流水没有新行，假的 M7 交回处理（测试替身，按 §8.1 第 5 条写）没有调用退路批注；`propose` 在锁被占时返回 `{error: 'busy'}`，替身写退路批注，批注里像密钥的字段换成「（像密钥，已略去）」；导入一条带令牌的 `[候选经验]` 批注两次，第一次写一条 `import` 记录（`data.rejected` 为 `secret_like`），第二次不再写。`propose` 的上下文带 40 位十六进制的 `commit` 时返回 `{status: 'candidate'}`，候选证据里是 `commit:<40 位>`；对这条候选做 `lessons_merge new {candidate}` 成功，另一条同样带 40 位提交号的候选 `into` 一条已有经验也成功，经验的证据里多了这一项；`context.commit` 是 `xyz` 时候选照收、证据里没有 `commit:`、`notes` 写明。导入的触发：注入的时钟与假图服务，第一次计算扫一次；图的修订没变时 60 秒后不再扫；修订变了且过了 60 秒时再扫并导入新批注；`propose` 返回 `{error}` 之后的下一次计算不等 60 秒就检查。

记忆行在 L2 加：开局时存储为空的根 agent 第一步没有索引，`memory_store` 之后的下一步有一条，再下一步没有（§3.3）；细度观察在锁被占时立即返回下游的决定（写在后台，失败告警一次）；`design_review` 的调用 id 是 `call_00_` 加 24 个大小写字母与数字时，`reporting-depth` 照样写进去，证据是 `session:<id>` 与 `call:<id>`；调用 id 含 `|` 这类语法外的字符时证据是 `call:sha-<16 位>`，同样写进去；新进程（空缓存）里第一次调 `depth(sessionId)` 就同步读出流水里的档，不返回 `undefined`。

失败匹配在 L2 加：GLM 路由上名为 `Bash` 的调用（结果值是 `pwsh` 的形状）退出码 1、stderr 含片段时推提醒；非 GLM 路由上名为 `pwsh` 的同样推。

存储在 L2 用临时目录里的真实文件测（`docs/DEVELOPMENT.md` §1 允许 mock 文件系统，这里用真实的临时目录更接近事故，同规则板设计 §14）：两个 Node 子进程各追加 200 条，`seq` 连续、没有丢；末行半行在读时被忽略、在下一次写时被封口；陈旧锁（改过时间的锁文件、`boot` 相差超过 120 秒）被改名，`boot` 相差 60 秒的不算陈旧；持有者释放时锁里的令牌已换成别人的，它不删锁；锁被占 2 秒以上返回 `busy`；`fsync` 失败（注入）返回 `io`；旧 `memory.json` 的迁移、读不出时不覆盖、改名失败之后的再试；`ensureIgnored` 在临时 git 仓库里（已忽略不动、没忽略追加一行、没有 git 时不动）。

宿主侧在假宿主 `tests/fake-rc3.ts` 上测，假宿主为此补 rc.3 的这些信号：`tools.execute` 在工具体之后走 `tools/post-execute` 瀑布，`accept` 的 `additionalContexts` 进下一步的收件箱，拒绝的调用也走它（tools:3337–3353、3599–3627）；shell 工具的结果值带 `exitCode` 与 `stderr`；`system-prompt/assemble` 的监听器按 `prepend` 与否排序（cordis:335–345）；子会话头带 `origin: 'subagent'`；会话投影的 `init(header)`。不 mock 契约之外的东西。真实组合里的过滤、索引、失败提醒、两条第 1 步消息的先后在 L3 探针里测（§10.1）；面板与工作区外文件的读取要 L4。

### 7.7 行健康

`HOURNESS_ROWS` 在 `memory` 之后加 `lessons`，按会话上报。

| 行 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- |
| memory | 写明本会话的项目目录与用户级目录、两边的条目数（偏好、推测、事实）、本会话是否已带索引 | 会话没有工作目录或不算项目；不在 git 仓库里且没有 `.llm/`（写明建一个 `.llm` 文件夹即可开启）；没有数据目录服务；旧文件读不出、旧文件还在；流水有 N 行坏行；流水超过 8 MiB；`ensureIgnored` 没做成；行配置 `home` 已不再使用；索引或细度观察抛过错；没有命令或投影服务 |
| lessons | 写明两边的生效经验数、开着的候选数、本会话推过几条失败提醒 | 同上的目录与流水问题；失败匹配抛过错；`relevant` 或 `propose` 失败过；导入批注失败；没有命令或投影服务 |

`/glm-status` 与 `/hourness-status`（split 第 4 步）都列出这两行。

## 8. 与其他特性的接口

### 8.1 M7（派发简报与交回，设计 0.2 评审中）

M7 §3.5.5 只定了接缝。M5 照它提供，并请 M7 改五处（§13 记在 `m7` 上）：

```ts
// src/lessons/service.ts（编排层内部的契约，M7 的执行行经 ctx.get 读）
export const LESSONS_SERVICE = 'glmHournessLessons'
export interface RelevantQuery {
  readonly session: SessionLike            // 新增：定位项目（主 Agent 的会话）
  readonly paths: readonly string[]
  readonly tools: readonly string[]        // 别名或原生名都行，内部换成原生名
  readonly commands: readonly string[]
  readonly limit?: number                  // 1–10，缺省 5
}
export interface RelevantLesson { readonly id: string, readonly when: string, readonly problem: string, readonly fix: string, readonly line: string }
export interface LessonCandidateInput {
  readonly problem: string, readonly fix: string
  readonly files: readonly string[], readonly commands: readonly string[], readonly tools: readonly string[]
  readonly errors?: readonly string[]      // 新增：报错片段
  readonly scope?: 'project' | 'all'       // 新增：缺省 project
}
export interface LessonProposeContext { readonly session: SessionLike, readonly task?: string, readonly childId?: string, readonly commit?: string }
// 证据由这几项拼出（§4.1、§5.7）：task:<task>、session:<childId 或 session.id>、commit:<commit，7–40 位十六进制，原样写全>
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

请 M7 改的五处：

1. `relevant` 的查询与 `propose` 的上下文都加 `session`（主 Agent 的会话；M7 两处调用的地方都有它）。没有它就不知道是哪个项目的经验，`propose` 也无从定位候选该进哪份流水。`LessonProposeContext.session` 是必填，漏了编译期报错。
2. 交回结构 `hourness-handback-v1` 的 `lessons` 每项加可选的 `errors: string[]`（至多 5 项，每项 8–300 字符）与 `scope: 'project' | 'all'`，两者都不进 `required`。经验板块的节点要求「情况」里有报错；没有报错片段，失败匹配就用不上 worker 交回的经验。
3. 退路批注（经验服务不在或返回 `{error}` 时）末尾带上候选的 JSON：`[候选经验] <problem> → <fix> · {"files":[…],"commands":[…],"tools":[…],"errors":[…],"scope":"project"}`，导入时无损（§4.2 第 2 步）。批注里的每个字段先按第 5 条处理。
4. 工具名：`LESSONS_TOOL_NAMES = ['lessons_query', 'lessons_merge']`，常驻名单只加 `lessons_query`。M7 §2.3.2 写的是「经验查询」常驻，与此一致；`lessons_merge` 是 M5 加的、只给根 agent、用得少，保持延迟。
5. 按结果分三路，退路批注不带密钥。图节点文件由主 Agent 提交并推到 Gitee `origin`，写进去的令牌要改写历史才删得掉，而 `docs/DEVELOPMENT.md` §9 不许强推，所以这一条是预防，不是事后清理：
   - `status` 是 `candidate`、`merged`、`dropped`：照 M7 现在的做法，交回摘要里记计数。
   - `status` 是 `rejected`：不写退路批注；交回摘要的批注里记一个计数与代码（「1 条候选经验被拒：secret_like」），不带候选的内容。拒收是确定的结果，重试与退路都会得到同样的判断。
   - `{error}`，或经验服务整行不在（`ctx.get('glmHournessLessons')` 为空）：写退路批注。写之前把候选的每个字符串字段（坑、解法、`files`、`commands`、`tools`、`errors` 的每一项）过一遍 `looksSecret`（从 `src/data/secret-shape.ts` 导入，同在编排层包，经验行不在也能导入），命中的字段整项换成「（像密钥，已略去）」，坑或解法被略去时批注照写，由导入一方按 `invalid` 拒（§4.2 第 2 步）。
   M7 交回处理的 L2 用一个假的经验服务覆盖三路：返回 `rejected` 时没有退路批注；返回 `{error}` 时退路批注里像密钥的字段被略去；服务不在时同样略去。

M7 其余的接缝照用：简报约束栏的那一句「When a command fails or a tool behaves unexpectedly, search the lessons board before working around it.」；简报里经验至多 5 条、合计至多 1,500 字符（M5 的 `line` 每条至多 300）；复盘节点的 `候选经验：` 一栏由主 Agent 处理完之后用 `lessons_merge new` 落成经验，证据写复盘节点 id（M7 §3.15）。M7 的周报（P2）与巡检（P3）调 §4.9 的 `stats`、`hygiene` 与 §3.6 的 `correctionSignals`；没有 M5 时这几节不出现。

worker 的写入门禁不碰经验与记忆：`lessons_query` 是只读工具；记忆工具不在 worker 的工具面里，按名调用也被工具体拒绝（§2.3）。

### 8.2 plain-ui（面板，设计 0.3）

- 板块登记表 `ui/src/graph/boards.ts`（plain-ui §7.6）：`Board.id` 的联合加 `'memory'`；M5 登记 `lessons`（「经验」）与 `memory`（「记忆」），`available` 看两个投影，不给 `homeLine`。
- plain-ui 的首页先落地时，M5 的 P1 只登记两块；M5 先落地时，P1 按 plain-ui §7.6 的接口建登记表，并在现有面板底部放一行「经验 › 记忆 ›」作为临时入口，plain-ui 改首页时换成它的页脚。两种先后都只改 `boards.ts` 与入口一处。
- 页面的组件与样式用 `ui-primitives`（`docs/ORCHESTRATION.md` §13），人话与 plain-ui §2.2 的词一致：「经验」「记忆」「删除」「恢复」「撤销」。

### 8.3 规则板（设计 0.3）

- 复发的坑走 `rules_propose`（规则板 §9.4）。M5 不生成规则，也不生成规则的卡片。
- 公共的存储件：项目根（规则板 §7.3 的项目键用同一个根；M5 的项目目录在它之上多一层规则，§5.5）与文件锁。本设计把它们放在 `src/data/project-root.ts`、`src/data/lock.ts`。规则板 R2 写的是 `src/rules/project-key.ts`、`src/rules/lock.ts`；先合入的一方建模块，后到的一方改为导入，项目键的哈希函数 `projectKey(root)` 留在规则板。M7 的门禁锁（M7 §3.8.3，等待 60 分钟、5 秒一次）同样可以用 `withFileLock` 的参数实现，由 M7 定。
- 两者在面板上相邻（plain-ui 的页脚：规则 › 经验 › 记忆 › …）。

### 8.4 M3（设计 0.4）

- 细度：M3 的 `design_review` 输出带 `outcome` 与 `depth`（M3 §3.4.4 的输出 schema）；M5 的观察依赖这两个字段，契约测试在 M3 合入后钉住。M3 算当前细度的函数在历史里没有结果时改读 `glmHournessMemory.depth(sessionId)`（R1 改 M3 的这一处）。
- 学习信号读 M3 的 `answerPhrase` 写进图的批注（「点了「拒绝」」「点了「补充」」）；契约测试用 M3 的 `answerPhrase` 生成样例，改了说法测试失败。
- 工具名常量 `DESIGN_TOOL_NAMES` 由 M3 加进 `src/shared/tool-names.ts`；M5 读它判 `design_review`。

### 8.5 GLM 包、`question-31` C 与 `prompt-fixes`

- Memory 节在 GLM 包（`src/glm-prompt/`），由 M5 的 D1 步改。`question-31` C 的整理（方言节按 ZCode 次序、Output Style 承载人设与细度、子 agent 只拿需要的）与 `prompt-fixes` 也改 `src/glm-prompt/`；三者按 `question-28` C 排队，谁先合入谁先改，后到的在它之上改。D1 只动 `localize.ts` 的 Memory 一节、新镜像文件与 `index.ts` 里经验那一句的条件，不动节的次序。
- `glm:persona` 的常设细度改读 `glmHournessMemory.depth`（R1）。`question-31` C 删掉 `glm:persona`、改用 Output Style 时，同一个读法搬过去。
- GLM 包单独装时：没有记忆工具，就没有 Memory 节（现状）；没有记忆服务，`glm:persona` 用配置（现状）。

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

只放类型、常量与纯函数（`docs/DESIGN.md` §8：公共库不持有跨行共享的状态）。编排层内部另有 `src/memory/service.ts` 声明 `stats`、`hygiene` 等成员，M7 导入它；GLM 包只认 `depth`。`tests/contracts.spec.ts` 加：`MEMORY_TOOL_NAMES` 等于记忆行注册的名字；`LESSONS_TOOL_NAMES` 等于经验行注册的名字；常驻名单含 `lessons_query`、不含 `lessons_merge`；记忆行与经验行注册的事件集合（§7.5）。

### 8.7 标定与消融（`ablation`、`risk-calib-read`）

- 隔离：标定运行器用 `dataRows(dir)`（`scripts/calibrate/run-calibrate.mjs`:103），A1 给它加上 `projectOverride`，于是标定会话读不到本仓库的经验与记忆，也读不到真实用户级目录里的（`dshHome` 已指向运行目录）。否则同一道题会随着经验的积累得到不同的上下文，回归对比失去意义。`ablation` 把运行目录移出仓库之后，这一点照样成立。
- 消融：这一批新加的注入是记忆索引、经验的三种提醒与改写后的 Memory 节。按 M7 §12 的时机，L4 批次各做一次消融，开关由 `ablation` 在 `scripts/calibrate/` 里加（只在标定时加载，`docs/CHARTER.md` §7.1 条款 1「可关只落在插件行这一级」不受影响）。注意记忆行同时写用量流水，消融不能用禁用记忆行来代替关掉索引。

### 8.8 M8

晨报的「讲细点」「说重点」按钮（`docs/ORCHESTRATION.md` §12）调 §3.7 的 `recordDepthPress`；面板的展开与收起是看的动作，不算细度信号。

## 9. 实施分解

分支 `m5`，每条线一个工作树（`.worktrees/m5-a`、`m5-b`……），都从合入 split 之后的 main 建。每步一个提交，提交信息带节点 id，文档与代码同一提交（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`（L3，`docs/DEVELOPMENT.md` §1.1）。「今天必败」是这一步新增的检查在今天的代码上怎样失败。「档」是派出去的 worker 用的推理档（`norm-verify-tiers`：规格清楚的实现用高档）。

### 9.1 步骤

| 步 | 节点 | 内容 | 文件（只这些） | 层 | 档 | 今天必败 | 独立评审 | 依赖 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | m5-1、lessons-1 | 存储底座：项目根、项目目录与 `ensureIgnored`、文件锁、流水（异步与同步读、折叠接口、坏行、封口、`seq`、`fsync`）、`looksSecret`、证据与出处的写法（`parseRef`、`checkRefs`）；数据行加 `projectOverride`；`dataRows` 设它 | 新建 `src/data/project-root.ts`、`lock.ts`、`journal.ts`、`secret-shape.ts`、`evidence.ts`、`tests/data-journal.spec.ts`、`tests/data-project-root.spec.ts`、`tests/data-secret-shape.spec.ts`、`tests/data-evidence.spec.ts`；改 `src/data/index.ts`、`src/shared/data-home.ts`、`scripts/sandbox.mjs`、`package.json`（测试清单） | L1、L2 | 高 | 导入失败；两个子进程各写 200 条之后 `seq` 连续的检查失败；§5.6 的三组固定用例与 §5.7 的写法用例（`secret-shape.ts`、`evidence.ts` 还不存在，导入失败；今天的 `knowableFromGit` 会拒深层路径） | 是：崩溃安全、留痕与密钥判据，同规则板 R2 一类 | 无 |
| B1 | m5-1、m5-2 | 记忆模型：条目、`classify`、`strength`、校验、相似、`applyRecord`、旧格式转换、权限；索引渲染 | 新建 `src/memory/model.ts`、`recall.ts`、`tests/memory-model.spec.ts`、`tests/memory-recall.spec.ts` | L1、L2 | 高 | 导入失败 | 权限函数随 A1 一起评审 | 无（流水的记录形状按 §5.2，与 A1 并行） |
| C1 | lessons-1、lessons-2 | 经验模型与匹配：条目、候选、签名、相似、权限、`applyRecord`；派发打分、失败匹配、查询打分、复发；渲染 | 新建 `src/lessons/model.ts`、`match.ts`、`render.ts`、`tests/lessons-model.spec.ts`、`tests/lessons-match.spec.ts` | L1、L2 | 高 | 导入失败 | 权限函数随 A1 一起评审 | 无（同上） |
| M1 | m5-1、m5-2 | 记忆行改线：三个工具的新参数与规则；按会话定目录；子 agent 的过滤；索引提醒；投影 `hournessMemory`；`/memory`；迁移；行健康；删 `src/memory/store.ts` 与路径判据；探针场景 | 改 `src/memory/tools.ts`、`src/memory/index.ts`、`src/shared/dsh-min.ts`、`src/shared/health.ts`（说明文字）、`scripts/probe/run-probe.mjs`；删 `src/memory/store.ts`；改 `tests/memory-audit.spec.ts`，新建 `tests/memory-tools.spec.ts`、`tests/memory-row.spec.ts`；文档 `docs/ORCHESTRATION.md` §8.1–§8.4、`docs/DESIGN.md` §2.2、§2.4、§2.4a、§2.5、§7 | L2、L3 | 高 | 含 `coding-plan/start-plan` 的文本被拒的用例失败；探针里子 agent 的请求有记忆工具 | 否 | A1、B1；与 D1 同一批合入 |
| D1 | m5-3 | 方言的 Memory 节：镜像文件、本地化、经验那一句的条件、逐字门禁登记 | 新建 `src/glm-prompt/zcode-memory-text.ts`；改 `src/glm-prompt/localize.ts`、`src/glm-prompt/index.ts`、`scripts/check-verbatim.mjs`（`MIRROR_FILES`）、`tests/glm-prompt.spec.ts`、`scripts/probe/run-probe.mjs`（首句常量）；文档 `docs/DESIGN.md` §5.2、§5.3 ⑧、§5.8 | L1、L2、L3 | 高 | 保留原句的逐句断言失败（今天的节只有 883 字符） | 否 | M1 的语义；与 `prompt-fixes`、`question-31` C 的 `src/glm-prompt/` 改动排队 |
| L1 | lessons-1 | 经验行：两个工具、服务 `glmHournessLessons`、候选提醒、复发提醒、`/lessons`、投影 `hournessLessons`、导入批注、命令行、登记 | 新建 `src/lessons/index.ts`、`tools.ts`、`service.ts`、`notices.ts`、`import.ts`、`cli.ts`、`scripts/lessons/cli.ts`、`tests/lessons-row.spec.ts`；改 `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（`disabled: true`）、`src/shared/health.ts`、`src/shared/tool-names.ts`、`tests/contracts.spec.ts`、`package.json`、`scripts/probe/probe-dispatch.mjs`、`scripts/probe/run-probe.mjs`；文档 `docs/ORCHESTRATION.md` §8.6（新）、`docs/DESIGN.md` §2.2、§2.4、§2.4a、§2.5、§7、`docs/DEVELOPMENT.md` §12 之后加命令行一节 | L2、L3 | 高 | 契约测试：`LESSONS_TOOL_NAMES` 与注册不符 | 否 | A1、C1；登记文件与 M1 排队（先合入的先改） |
| L2 | lessons-2 | 失败匹配与命中记录 | 新建 `src/lessons/failure.ts`、`tests/lessons-failure.spec.ts`；改 `src/lessons/index.ts`、`tests/fake-rc3.ts`（post-execute 瀑布）、`scripts/probe/run-probe.mjs` | L2、L3 | 高 | 失败的 `pwsh` 调用之后下一次请求没有经验提醒 | 否 | L1 |
| S1 | lessons-4 | 第一批经验 | 操作文件放在 `.agents/tasks/<实施运行>/`（不入库）；仓库里只加一个固定数据的导入测试 `tests/lessons-seed.spec.ts`（两条样例，导入两次只多两条） | L2；导入后真实存储上查一次 | 常规 | 导入两次多出重复的检查失败 | 否 | L1 合入 |
| P1 | lessons-3 | 面板：经验页、记忆页、板块登记 | 新建 `ui/src/lessons/LessonsPage.tsx`、`ui/src/memory/MemoryPage.tsx`；改或新建 `ui/src/graph/boards.ts`、`ui/src/hourness-client.tsx`；`tests/lessons-panel-model.spec.ts`（客户端的折叠与视图模型） | L2、L4 | 高 | 板块登记表里没有 `lessons` | 否 | L1、M1；plain-ui 的 `boards.ts`（没有时按 §8.2 自建） |
| R1 | m5-5 | 细度闭环：观察 `design_review`、`reporting-depth`、服务 `glmHournessMemory`、M3 与 `glm:persona` 读它 | 新建 `src/shared/memory-service.ts`；改 `src/memory/index.ts`、M3 算细度的文件、`src/glm-prompt/index.ts`、`src/glm-prompt/persona.ts`、`tests/memory-row.spec.ts`、`tests/glm-prompt.spec.ts`、`tests/contracts.spec.ts` | L2、L3 | 高 | 点「说重点」之后新会话的默认仍是 `balanced` | 否 | M1；M3 的 m3-4 合入；与 `question-31` C 的 `src/glm-prompt/` 改动排队 |
| G1 | m5-4 | 学习信号与复发 | 新建 `src/memory/signals.ts`、`tests/memory-signals.spec.ts`；`learnedFrom` 参数在 M1、L1 里已留 | L2 | 高 | 导入失败 | 否 | M1、L1；周报里显示要 M7 P2 |

### 9.2 并行的线

```
线 1：A1 ──► M1 ──► D1 ──► R1（等 M3 m3-4）
线 2：B1 ──┘
线 3：C1 ──► L1 ──► L2 ──► S1
线 4：            （M1 与 L1 之后）P1
线 5：            （M1 与 L1 之后）G1
```

A1、B1、C1 三步互不碰文件，同时开工。M1 与 L1 都改登记文件（`src/shared/tool-names.ts`、`src/shared/health.ts`、`src/shared/dsh-min.ts`、`tests/contracts.spec.ts`、`scripts/probe/run-probe.mjs`），代码可以并行写，合入排队：先合入的一方先改，后到的一方 rebase 后追加（同规则板设计 §10.3 的做法）。D1 与 R1 改 `src/glm-prompt/`，与 `prompt-fixes`、`question-31` C 排队。P1 改 `ui/src/graph/`，与 plain-ui 的实现排队。要桌面版的只有 L4 批次，由编排者按 `risk-shared-desktop` 一次一个持有者做。

### 9.3 批次 L4（`docs/DEVELOPMENT.md` §1.1）

- 第一批：M1、D1、L1、L2、S1 合入之后。桌面版重启后，在本仓库与另一个临时 git 文件夹各开一个 GLM 会话：两个 `.llm/memory.jsonl` 各自生成；第二个会话的第一次请求带索引（会话日志里只读核对）；`lessons_query` 查得到第一批经验；在会话里让模型跑一条会以第 14 条的报错失败的命令，下一步看到提醒；临时文件夹的 `.git/info/exclude` 多了 `/.llm/`；桌面版日志没有本包的新错误；用过模型菜单就换回 `agent-default-model`（`docs/HANDOFF.md` §6）。通过后经验行改为默认启用（`AGENTS.md` 第 4 条），在节点上记一笔。
- 第二批：P1、R1 合入之后。面板的经验页与记忆页经 DevTools 截图核对；删一条、撤销、再删、在「你删掉的」里恢复；在 `design_review` 卡上点「说重点」，新开会话的 `glm:persona` 一句与 M3 的默认都是简洁。

批次 L4 之前，汇报里写明哪些改动还没在桌面版上跑过。

## 10. 验证

### 10.1 L3 探针场景

都在 `npm run probe` 里，场景的数据目录是自己的（`dataRows` 加了 `projectOverride` 之后，记忆与经验也在场景目录里）。探针结束时核对真实用户级目录下的 `memory/memory.jsonl`、`lessons/lessons.jsonl` 与本仓库 `.llm/` 下的两份流水都没变（扩展 `run-probe.mjs`:127–130 的用量核对）。

| 场景 | 路由 | 做什么 | 断言 |
| --- | --- | --- | --- |
| `glm-memory` | GLM | 第一个根 agent：存一条带 `relay` 的 `feedback`、一条带出处的 `project`、一条正文含 `coding-plan/start-plan` 与 `src/shared/dsh-min.ts` 的 `reference`；第二个根 agent 开局 | 三次都存成功；第二个 agent 的第一次请求里、第一条用户消息之后有来源 `glm-hourness-memory` 的索引，含三行；它之后的步不再带；两个 agent 的系统提示词各自逐步不变；三个记忆工具没有 `deferLoading`；`# Memory` 一节的首句是新的 |
| `non-glm-memory` | DeepSeek 探针 provider | 同上 | 同上，没有 `# Memory` 一节（方言不接管） |
| `glm-memory-compact` | GLM | 有条目时开局，强制压缩 | 压缩检查点之后的第一次请求再带一次索引，再下一步不带 |
| `glm-worker-memory` | GLM | 主 agent 用原生 `subagent` 派一个子 agent，子 agent 试调 `memory_store` 与 `lessons_merge` | 子 agent 的请求里没有三个记忆工具、没有 `lessons_merge`、没有 `# Memory` 一节，有 `lessons_query`；两次调用都被拒（`role`），拒绝写着正路 |
| `glm-lessons` | GLM | 探针覆盖层的验证插件调 `propose` 交一条候选；根 agent 下一步；它用 `lessons_merge new`；再用 `lessons_query`；人发 `/lessons delete`、`/lessons restore` | 候选提醒出现一次、合并后不再出现；`relevant` 对匹配的路径返回它；查询返回它；删除后查询不返回、恢复后返回；流水里每一步一条记录，身份分别是 `harness`、`llm`、`human` |
| `non-glm-lessons` | DeepSeek 探针 provider | 同上的查询与合并 | 同上 |
| `glm-lessons-failure` | GLM | 场景里有一条报错片段为 `probe-lesson-fragment-1` 的经验；模型两次调 `Bash`（GLM 工具面上的 shell 别名，原生 `pwsh`）跑一条向 stderr 写这段文字并以 1 退出的命令，第三次跑一条成功的命令；再派一个子 agent 跑同一条失败的命令（U1） | 第一次失败之后的下一次请求在工具结果之后带来源 `glm-hourness-lessons` 的提醒；第二次失败之后不再带；成功的那次之后也不带；子 agent 的下一次请求也带提醒；流水里每个会话一条 `hit`，`data` 带场景目录的项目根 |
| `non-glm-lessons-failure` | DeepSeek 探针 provider | 同上，模型调原生 `pwsh` | 同上的前三条断言 |
| `glm-only`、`hourness-only`（已有） | — | — | `glm-only` 没有 Memory 节；`hourness-only` 有两个工具行的工具，没有 GLM 方言节 |

### 10.2 L4 检查清单

见 §9.3。另：U4（面板读工作区外的文件）、U10（两条第 1 步消息的先后）、U13（恢复的会话装上监听器）在第一批里看。

## 11. 由 agent 定、人可推翻的事项

命名：行 `glm-hourness/lessons`；目录 `src/lessons/`；工具 `lessons_query`、`lessons_merge`（记忆工具沿用原名）；命令 `/memory`、`/lessons`；服务 `glmHournessLessons`、`glmHournessMemory`；投影 `hournessLessons`、`hournessMemory`；notice 来源 `glm-hourness-memory`、`glm-hourness-lessons`、`glm-hourness-lessons-pending`、`glm-hourness-lessons-recur`；流水 `memory.jsonl`、`lessons.jsonl`；经验 id `L-<6 位十六进制>`，候选 `C-<6 位十六进制>`；数据行配置 `projectOverride`。

做法（每项写了选它的理由与没选的做法）：

- 一个存储层、两个集合（§2.1）。没选：一个集合加 `kind`（读法不同、Memory 节离 ZCode 更远）；两套存储（重复）。
- 记忆的类型照 ZCode 的四类，字段照它的 frontmatter：模型在这套字段上训练过，Memory 节可以大段原样。没选：沿用现在的 `id`、`text`、`tags`。
- 偏好看来源（人的原话或人的动作），不只看类型：「用户定下的」才不衰减（§8.2），推测的偏好会淡忘。没选：`user`、`feedback` 一律不衰减（agent 的误判会永久留着）。
- agent 推测的偏好不问人、会淡忘，周报列出、人删即撤；只有规则要人批。没选：每条推测都发确认卡（人的负担，`question-27` B）。
- 索引是对话里的一条 notice（§3.3），不是系统提示词的一节：ZCode 的位置就是用户上下文，缓存也稳。没选：系统提示词里按会话冻住的一节。
- 索引的上限照 ZCode：200 行、25,000 字符。没选：只放「强度最高的若干条」（`docs/ORCHESTRATION.md` §8.3 的原写法；条目少时整份放更贴 ZCode，淡忘的事实已经不进）。
- 子 agent 不拿记忆工具与索引，拿 `lessons_query`：`question-31` C；worker 需要的经验经简报与查询到达，偏好里需要 worker 遵守的应当是规则。没选：子 agent 各配独立记忆目录（`docs/ORCHESTRATION.md` §8.5 原写法，出自已被取代的角色卡设计 `d-role-cards`，同批改写）。
- 项目目录跟会话的工作区，忽略记忆行的 `home`：防跨项目污染。没选：`home` 继续优先（桌面版 profile 把它钉在本仓库）。
- 项目数据放工作区 `.llm/` 并追加 `.git/info/exclude`（§5.1、§5.5）。没选：用户级目录按项目分（规则板的做法；与 §8.2 的定案不符）；不碰 `exclude`、只在行健康提示（别的项目的 `git status` 会一直看到 `.llm/`）。
- 不在 git 仓库里的文件夹只在已有 `.llm/` 时算项目（§5.5）：随手打开的文件夹里不多出目录，人建一个 `.llm` 就开启。没选：用 `cwd` 本身并在第一次写入时建 `.llm/`（0.2 稿的做法）；完全不支持没有 git 的文件夹（不用 git 的人就没有项目记忆）。
- 证据与出处一套写法（§5.7），提交号写全号 `commit:<sha>`：全号没有歧义，与 M7 交回的提交号同形；`commit:` 与裸写的 7–40 位十六进制都不判为像密钥。没选：harness 只写 12 位短号（短号与交回里的不同形，要再查一次才能对上）。
- 只追加的 JSONL 流水，不另存快照，不轮换：条目少，整读折叠够快；坏行与半行可以恢复。没选：整文件 JSON 加改名替换（现有做法，没有历史，删除留不下痕）；规则板的快照加流水（为每天几十条的写入多一套一致性检查）。
- 锁的陈旧门槛 30 秒，不判进程死活：一次写只要几毫秒；Windows 上 `process.kill(pid, 0)` 的行为没核对过。没选：按 pid 判（M7 的门禁锁要等 60 分钟，才需要那种判法）。
- 像密钥的文本拒收：范围 `all` 会扩散。没选：存进去、读时遮盖（遮盖漏一次就扩散）。
- `lessons_query` 常驻、`lessons_merge` 延迟：前者是人要求的随时可查，后者只有根 agent 处理候选时用，提醒里写着它的名字。没选：两个都常驻（多约 900 字符的前缀）。
- 与已有经验签名相同的候选自动并入，与人删过的签名相同的自动丢弃，其余交主 Agent：完全相同的不必劳动主 Agent，人删过的不再往 agent 面前推。没选：全部交主 Agent（主 Agent 的上下文与回合更多）；相似的也自动合（会误合）。
- 查询结果带至多 2 条未审的候选并标明：并行的 worker 可以在主 Agent 合并之前用上兄弟 worker 刚交回的经验。没选：候选不可查（要等主 Agent 合并）。
- 失败匹配只认报错片段，片段至少 8 个字符，一次至多 2 条，同一会话同一条只推一次：要准，不要多。没选：按命令或工具匹配（几乎每次失败都会推）。
- 派发进简报至少 2 分，单凭工具命中不进：「用 Bash」对每个任务都成立。
- 复发门槛：28 天内 3 个会话；复发提醒每项目每周至多 2 条；人删过的复发不提醒。没选：harness 直接提规则待决（规则的内容要判断，且会给人添题）。
- 细度取最近一次点键：人一眼看懂来由。没选：按最近几次的多数平滑（人看不出为什么是这一档）。
- 第一批经验不经候选、直接以 `llm` 身份写成生效：来源是人审过的文档与图。
- 经验的文字用英文：它进简报与提醒，给模型看；面板照原文显示。没选：每条另存中文摘要（每条多一个字段，agent 要写两遍）。
- `/memory`、`/lessons` 两个命令既给人敲也给面板发，记录输入：少两个命令，会话日志里留着人做了什么。没选：规则板那样分成人用与面板用的两个（规则板的写入请求是大 JSON，这里只有几个词）。
- 不自动删除淡忘的事实：不进索引就不占上下文，删除留给 agent 按卫生结果判断。
- 面板登记两块（经验、记忆），首页不加行：人只在想看时进去。
- profile 里不再使用的 `home` 不动，交人定（§13）。

默认值：相似阈值记忆 0.6、经验 0.5；淡忘阈值 0.1；候选过期 30 天；复发 28 天 3 个会话；每周复发提醒 2 条；卫生「没确认」180 天、「淡忘」30 天；锁等待 2 秒、陈旧 30 秒；细度缓存 500 个会话。改这些是改常量，不改设计。

## 12. 待人定的事项

编排者在 2026-10-30 按人的回答（结束设计循环，由编排者改写这两道题）改写本节：问题照 `d-plain-questions` 说人话、先交代背景；D2 不属于必须问人的几类，改为 agent 决策。

### D1 记忆与经验板这 9 件活，「怎样算做完」由谁定（问人）

背景：M5 有 5 件活（记忆），经验板有 4 件活，每件都要一张「怎样算做完」的单子，§1.2 已拟好草稿。定这张单子是人的事。其中两条最值得人看：agent 从人的改动里推测出来的习惯不再问人就记下；一条记忆 14 天没被用到就慢慢淡忘。

- A. 人逐条看过再定：9 张单子都按人的意思写，实现等人看完再开工。
- B. 照草稿写进去，人以后在面板上改（推荐，因为两条要紧的都能事后改回来）。

人对 M7 的同类问题选了逐条看（question-37 A），编排者把这 9 张与 M7 的 10 张一起改写成人话交给人。

### D2 记忆里还存不存项目事实（agent 决策）

决定：存，但每条必须写出处（`source`）。理由：保留 ZCode 记忆的四类与 Memory 节原句；召回时带出处，过时的能对照出处认出来；写不出出处的存不进。没选「只存偏好不存事实」：要改掉 ZCode 的原句，agent 想记的事实每条多一次写图。没选「照旧存、不写出处」：事实在记忆、图、文档里各一份，记忆里那份会过时，现在仅有的一条就是 10-27 的过时交接。可逆，人可推翻。

## 13. 交给编排者记图的事项

本设计不写 `docs/graph/`。以下由编排者在人看过之后记到图上：

1. D1、D2 各提一张决定者为人的待决，挂 `m5`，题目、选项（`label`、`gain`、`cost`）、`crux`、`verdict`、`recommend` 按 §12。`weight`：D1 为 `one-way`（验收写进节点之后再改要人出手，决策分级第 1 类）；D2 为 `two-way`（改了以后可以再改）。「经验只给建议、不拦任何调用，复发才提醒去提规则」是 `lessons` 节点正文里人的原话，不再出题。表格版字段要等 `card-fields-table` 合入后引擎才认（之前写进节点文件会报「不是已知字段」，`src/graph/format.ts` 88 行）；在那之前按 M7 §14 第 1 条的过渡写法：得到与代价合进选项的 `consequence`，「取决于」与结论行、`weight` 写进正文。
2. D1 选 B 时：在 `m5` 下建 `m5-1` 到 `m5-5`，在 `lessons` 下建 `lessons-1` 到 `lessons-4`，验收按 §1.2；依赖连线：`m5-5` 依赖 `m3-4`；`lessons-3` 依赖 `lessons-1` 与 `m5-1`；`lessons-2`、`lessons-4` 依赖 `lessons-1`；`m5-3` 依赖 `m5-1`；`m5-4` 依赖 `m5-1` 与 `lessons-1`。`lessons` 对 `split` 的依赖在 `split` 节点关闭后自然解除（split 第 0–8 步已在 main）。
3. 在 `m7` 上批注 §8.1 请 M7 改的五处（`relevant` 的查询与 `propose` 的上下文都加 `session`；交回的 `lessons` 加 `errors` 与 `scope`；退路批注带 JSON；`LESSONS_TOOL_NAMES` 与常驻只含 `lessons_query`；`propose` 的结果分三路，`rejected` 不写退路批注，退路批注逐字段过 `looksSecret` 并略去命中的字段；收下的结果多一个可选的 `notes`，M7 可以不看），以及 M7 的周报与巡检要调的三个函数。
4. 在 `rules` 上批注：项目根与文件锁放 `src/data/`，先合入的一方建；复发的坑经 `rules_propose` 提给人。
5. 在 `m8-plain-language` 上批注：板块登记表加 `memory`，页脚「经验 › 记忆」，不加首页行。
6. 在 `m3`（或 `m3-4`）上批注：`design_review` 输出的 `outcome`、`depth` 被 M5 观察；算当前细度的函数在 R1 改为先读 `glmHournessMemory.depth`；`answerPhrase` 的说法被学习信号读。
7. 在 `ablation` 与 `risk-calib-read` 上批注：标定运行的 `dataRows` 要带 `projectOverride`（A1 做），记忆索引、经验提醒与新的 Memory 节在 L4 批次各做一次消融；不能用禁用记忆行代替关掉索引（记忆行还写用量）。
8. 在 `question-31` 的后续实现（或 `prompt-fixes`）上批注：D1、R1 也改 `src/glm-prompt/`，排队；Output Style 做出来时常设细度改读 `glmHournessMemory.depth`。
9. 用户 profile 里记忆行的 `home`（`cordis.patch.yml` 第 67–69 行）在 M1 之后不再使用：问人要不要删（决策分级第 2 类，用户 profile），删前备份；不删也无害，行健康会一直写一句说明。
10. 在 `m5` 与 `lessons` 上批注本稿与评审结果的路径；M1 合入时 `docs/ROADMAP.md` M5 一节的条目改为带节点 id 的表（与 M7 一节同形）。

## 14. 未核实的假设

| # | 假设 | 依据 | 在哪核实 | 不成立时 |
| --- | --- | --- | --- | --- |
| U1 | host 级 `tools/post-execute` 的监听器看得到子 agent 的调用，`exec.agent` 是子 agent | 分发与 pre-execute 同一做法（tools:3320、3600）；pre-execute 看得到子 agent 由探针 `glm-dispatch` 实测〔推断〕 | L3 `glm-lessons-failure` 加一个子 agent 失败的步 | 失败匹配只对根 agent 生效；worker 仍有简报里的经验与 `lessons_query`；行健康注明 |
| U2 | `additionalContexts` 里的 notice 在 GLM 路由的下一次请求里紧跟这次工具结果，方言不丢、不改顺序 | agent-loop:492–506、572；方言只追加 notice、不改已有消息（清点报告 §7 第 12 条）〔推断〕 | L3 `glm-lessons-failure` | 改为下一步的 `agent/pre-step` 读历史里最后一次失败的工具结果再追加（`installStepNotice`），位置晚一步 |
| U3 | 子 agent 上不带 `prepend` 的过滤监听器在方言的 `prepend` 监听器之内运行，`memorySectionApplies` 看得到过滤后的工具 | cordis:317–325、335–345〔实读〕；组合后的效果没跑过 | L3 `glm-worker-memory` | 方言另按会话头的 `origin` 不给子 agent 加 Memory 节（`question-31` C 本来也要这样做），过滤照旧 |
| U4 | 桌面版上，面板能经 `remote.workspaceFiles` 读并监视工作区外（用户级目录）的文件 | README:12、40、58 说文件的读与监视不限于工作区；沙盒策略是否限制没有核对 | L4 第一批 | 记忆行与经验行加一个只读命令 `show --json`，面板经 `remote.commands.execute` 取它的结果；监视改为可见时每 15 秒取一次 |
| U5 | 面板在另一个进程追加时整读，拿到的是以半行结尾的前缀 | 追加是一次 `write`；读是一次整读〔推断〕 | L2 模拟（读到半行的折叠） | 已按「忽略没有换行的末行」设计，不成立也不影响 |
| U6 | Windows 上 `fs.open(path, 'wx')` 对已存在的文件报 `EEXIST`，改名陈旧锁不受另一个进程打开它的影响 | Node 文档〔推断〕 | L2 在本机（Windows）跑 | 陈旧锁改为删除前先 `stat` 核对时刻未变；仍不行就只在机器重启后回收 |
| U7 | M3 的 `design_review` 输出带 `outcome` 为 `more-detail` 或 `to-the-point` 与 `depth` | M3 设计 §3.4.4 的输出 schema；M3 未合入 | M3 合入后的契约测试 | R1 按 M3 实际的字段改观察函数一处 |
| U8 | ZCode 3.16.3 安装包里 Memory 节的原句与 `reference/ZCode` 源码相同 | 源码是 3.16.2 前后的树（`docs/DESIGN.md` §5.10）〔推断〕 | `npm run check:verbatim`，本机有安装包时 | 镜像文件以安装包为准，§3.5 的表随之改 |
| U9 | 常驻名单里的 `lessons_query` 在 GLM 工具检索里不延迟 | split 的机制（`src/shared/tool-names.ts`），记忆与图工具已实测 | L3 `glm-lessons` | 契约测试会先失败 |
| U10 | DSH 的 AGENTS.md 消息与记忆索引都在第 1 步，两条都保留，先后不影响 agent-instructions 的基线核对 | agent-instructions:1406–1424 在 `next()` 之后插在认领的消息之后；`installStepNotice` 追加在末尾〔推断〕 | L3 `glm-memory`；L4 | 索引改到第 2 步再注入 |
| U11 | 标定与探针的会话读不到真实的经验与记忆 | `dataRows` 设 `projectOverride` 与 `dshHome` | L3 的真实流水不变核对；标定的事后扫描（`ablation`） | 标定运行判无效，修 `dataRows` |
| U12 | 桌面版宿主的 PATH 里有 git，`git check-ignore` 在 2 秒内返回 | 本机开发环境有 git〔推断〕 | L4 第一批（临时文件夹的 `exclude`） | 不追加，行健康写明 |
| U13 | 恢复的会话也触发 `agent/created`，过滤与提醒装得上 | agent:574–589 对创建与恢复的 agent 都派发（M7 §15 U7 同一假设）〔推断〕 | L4 | 工具体的调用方核对照样拦住子 agent；索引改由 host 级的 `agent/pre-step` 监听器注入 |
| U14 | M7 按 §8.1 第 5 条实现三路：`rejected` 不写退路批注，退路批注逐字段过 `looksSecret` | M7 设计 0.2 在评审中，这一条由 §13 第 3 条交给编排者批注在 `m7` 上〔未定〕 | M7 交回处理的 L2（§8.1 第 5 条末尾的三路用例） | M7 的退路在经验服务不在时就会走，与 M5 合入与否无关，所以第 5 条要随 M7 的交回处理一起合入：编排者在 `m7` 的批注里把它写成 M7 交回处理（`src/execute/handback.ts`）的合入条件。M7 已先合入而没有第 5 条时，把它排成 M7 的修订任务，排在 L1 之前。在那之前漏进图的令牌：M5 的导入照样过 `looksSecret`，不进经验存储与别的项目；图上那条批注由卫生检查列出，交人处理 |
| U15 | 模型服务返回的工具调用 id（`exec.callId`）只含 `[A-Za-z0-9_.:-]`，不超过 128 个字符，合 §5.7 的 `call:` 语法 | 宿主原样用 `block.id`（agent-loop:512），GLM 适配层原样转交（`src/glm-llm/anthropic.ts`）；常见服务的 id 是 `call_`、`toolu_` 加字母与数字〔推断〕 | L3 `glm-memory` 与 `non-glm-memory` 的会话日志里核对调用 id 的形状；M3 合入后 L3 点一次「说重点」 | 拨档照样记下：§5.7 已规定不合语法的调用 id 写成 `call:sha-<SHA-256 前 16 位>`；只是人工追查时要按同一算法算一次才对得上会话日志 |

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
