# M3 设计附录：0.4 之后的定案与实施步骤的调整

版本：0.2（2026-10-30），回应第 1 轮独立设计评审（`reviews/addendum.json`、`reviews/addendum.md`：HIGH 0、MEDIUM 4、NIT 12），并吸收评审之后到达的四件事：`question-39` B（人同意按本附录 §8 的文字改 `m3-1`、`m3-2` 各一条验收，编排者正在写图）；`d-plain-questions`（人定：问人的话说人话，`.agents/tasks/design-context.md`「Plain words in questions」）；`d-zcode-3171`（人定：ZCode 基线换到 3.17.1）；`d-option-card` 的卡片格式正与人重新商量（图上 2026-10-29 深夜与 10-30 的批注）。逐条回应见 §12，修订记录见 §11。本版改了什么：

- `ask_human` 的选择题与决策卡是同一张表：参数加 `background`、`crux`、`verdict`、`dimension`、`weight`；带推荐的单选题必须有取决于、结论行与每项的得到、代价；推荐与维度的规则与引擎共用纯函数模块 `src/graph/card-rules.ts`（M1；§2.7）。
- 问人的话：身份节、`decision_card` 与 `ask_human` 的工具说明带同一道完整的例题与换词表，文字只定义一次（`src/graph/plain-question.ts`）；`decision_card` 的参数 `question` 改为 `background`；harness 自己写给人看的几处字串去掉换词表里的词（新 §2.8；第 3、6、8、9、11 步与「访谈选择题」）。
- 汇报细度改名：`reportingDepth` 与旧键 `persona` 都不带 Schema 默认值，按 cordis 规整之后的值判断用户写了哪个键（M2；§2.6）。
- 「如果失败：」一行进五栏的解析标签表、不进门禁；阶段提醒里的写法与解析放在同一步（第 9 步），第 5 步不再提它（M3；§2.3、§2.4、第 5、9 步）。
- 标定运行目录：每次运行一个系统临时目录；整批结束后把运行器写下的全部内容原样拷回仓库，核对无缺才删临时目录；拷回失败可以事后用 `--collect` 重做（M4；第 8 步）。
- 卡片怎样显示收在几个文件里，`d-option-card` 改了只改它们（新 §2.9）；人设一节按常量名写，不依赖 3.16.3 的开头句字面（§2.6 末段）。
- NIT：第 4 步一例测试改写（N1）；§10 删去 `oneOf` 一句（N2）；§7 加五行（N3 的三行与两处字串）；plain-ui 的版本说明与草图为准（N4）；开场画面上已是主 Agent 时的退出方式（N5）；同文件串行的清单（N6）；模拟人 `decisions` 的说法统一（N7）；阶段提醒的步号（N8）；`persona.name` 的规整（N9）；写文件的工具按原生名判（N10）；客户端预选的说法与后缀清单（N11）；第 12 步（b）问人的那道题按表格卡写好（N12）。

依据：main `9c71ed0`。工作树 `.worktrees/m3`、`.worktrees/m3-flow` 的基点 `eb614ab` 到 `9c71ed0` 之间只有 `docs/graph/` 的改动（`git diff --name-only eb614ab 9c71ed0` 全在 `docs/graph/` 下），代码相同；3.17.1 的代码改动在运行 `wf_920936995c163f50` 的分支上，还没有合入。被修改的设计是 `.agents/tasks/m3/design.md` 0.4 及其 §15（D1–D6 人定）；第 1、2 步已在 main（`bf4d127`、`7aa8fe5`），推荐放最后的引擎核对在 main（`44e8601`），表格版卡片字段在 main（`e22282f`，card-fields-table）。plain-ui 设计（`.agents/tasks/plain-ui/design.md`）文件头已是 0.4（第 4 稿，修订中，§16、§17 还没有 0.4 的条目）；本附录 §2.5 的位置与字句按当前的 `mockup-wish.svg`（2026-10-29 22:24）逐字核对过，与 0.4 正文的一处差别见 §2.5。运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准，证据写法同 0.4（「包:行」，包名省略 `dsh-` 前缀）；〔实读〕读过源码，〔推断〕由源码推出、未运行，未运行的接缝都列进 L3 或 L4。

本附录只写 0.4 之后变了的东西；没写到的地方按 0.4 做。附录与 0.4 冲突时以附录为准。范围同 0.4：只有设计，不改产品代码、`docs/graph/`、`~/.dsh`。

## 0. 摘要

0.4 之后有八件事定下来，都改 M3 的实施：

1. `question-26` C：主 Agent 的工具面去掉写文件的工具（原生名为 `write`、`edit` 的工具，含 `Write`、`Edit` 这些别名；`str_replace_editor` 的写操作），由编排层包在组装时按角色去掉；guard 照旧拦 shell 写入并兜底。落在第 3 步（去掉）与第 4 步（兜底，规则不变，测试加按名直接调用）。
2. `m3-1` 验收第 4 条：`/wish` 入口要醒目。按 plain-ui §7.5 与 `mockup-wish.svg`：新会话开场画面里 `conversation.input.dock` 的卡片、输入框下方 `conversation.composer.dock` 的按钮、主 Agent 会话里的「主 Agent」按钮与退出。落在第 11 步（客户端，`.worktrees/m3-flow`）。
3. `question-31` C（依据 `.agents/tasks/prompt-audit/report.md` §7 第 9 条）：身份节的角色与边界部分上限 1,500 字符；八步访谈的问法与写图格式改随阶段提醒（第 5 步）与设计工具结果的 `message` 下发；harness 会执行的规矩只留一句。落在第 3、5 步。
4. `d-plain-questions`（人在 2026-10-30 定）：给人的每道题先用两三句交代前因后果，再给取决于、表格与结论行；不用人没学过的词。身份节、`decision_card`、`ask_human` 的说明各带同一道例题与换词表。身份节因此多出约 960 字符的第二部分（§2.2、§2.8）。落在第 3、6、8、9、11 步与「访谈选择题」。
5. `m3-main-persona`：编排层设计行加一个人设设置位，只进主 Agent 的系统提示词；GLM 路由上放进 ZCode 的 Output Style 槽位并把身份开头句换成 `IDENTITY_OPENING_WITH_STYLE`，其他路由上是一节普通的节；子 agent 与写进文件的东西不带人设；插件只给设置位，不带人设文字。GLM 包里叫 `persona` 的汇报细度旋钮改名 `reportingDepth`。单独一步，排在「访谈选择题」之后。
6. `d-option-card`：设计工具出的题用表格版字段（`label`、`gain`、`cost`、可选 `dimension`、`crux`、`verdict`、`weight`），推荐放最后（`d-recommend-last`）。`decision_card` 的参数与卡面落在第 6 步；`ask_human` 的同一套规则落在「访谈选择题」；设计放行卡的事前验尸一行（`question-29` C）落在第 9 步。
7. 主 Agent 用强一档的模型（编排方 2026-10-29 记在 `m3` 上的人的原话）：`/wish` 的成功回复（第 3 步）、`/wish` 入口与流程条（第 11 步）提醒人。
8. `d-interview-cards`（人在 2026-10-29 定，plain-ui 评审 P3-02 里记作 A）：访谈里的选择题由 harness 出卡，主 Agent 的工具面去掉 `ask_user_question`，模拟人在待决卡上选图上的推荐、在访谈题上选最后一项。这些都收在一个接缝 `src/design/interview.ts` 后面（§2.7），整件事放在第 10 步之后的「访谈选择题」一步；它之前的各步不写死「推荐放第一」或 `(Recommended)`，也不写死模拟人对选择题的选法。

实施顺序按编排方定的布局：第 3、4、5、6、7、8、9、10 步，然后「访谈选择题」，然后 `m3-main-persona`，都在 `.worktrees/m3`（分支 `m3`）里串行做；第 11 步在 `.worktrees/m3-flow`（分支 `m3-flow`）里并行做，做完合入 `m3`；然后第 12 步（a）标定、（b）合入与批次 L4。独立代码评审给第 4、5、6、8、9 步与「访谈选择题」。

## 1. 定案与来源

| 事项 | 来源 | 改的 0.4 章节 | 落在哪步 |
| --- | --- | --- | --- |
| 主 Agent 去掉写工具 | `question-26` C；`m3-1` 验收第 3 条（`question-39` B 之后的文字，§3 第 3 步） | §0、§1.2、§3.1.3「工具面」、§6.4 第 1 行 | 3、4 |
| `/wish` 入口醒目 | `question-19` 的附加要求；`m3-1` 验收第 4 条；plain-ui §7.5、§12 M3 第 4、5 条；`mockup-wish.svg` | §3.6.4、§15 末段 | 11 |
| 身份节收窄 | `question-31` C；清点报告 §4.2 第 4 条、§4.3 第 4 条、§7 第 9 条 | §3.1.3 的 10 项内容与长度上限、§3.6.2 | 3、5 |
| 问人的话说人话 | `d-plain-questions`；`.agents/tasks/design-context.md`「Questions for the person carry their background」「Plain words in questions」；`d-option-card`、`m8-plain-language` 上 2026-10-29 的批注 | §3.1.3、§3.4.4、§3.5.1、§3.6.4、§6.2 的字串 | 3、6、8、9、11、访谈选择题 |
| 人设设置位 | `m3-main-persona`（依赖 `m3-1`）；清点报告 §7 第 3 条、§9 Q2 | §2.1、§11「新的配置项」一句 | m3-main-persona |
| 表格版卡片 | `d-option-card`（done，`e22282f`）；`d-recommend-last`；`question-29` C | §3.5.1、§3.4.1、§6.3 | 6、9、访谈选择题 |
| 强一档模型的提醒 | `m3` 上 2026-10-29T10:16Z 的批注；plain-ui §2.5、§7.5.5 | §3.1.1 成功回复、§3.6.4 | 3、11 |
| 访谈选择题由 harness 出卡 | `d-interview-cards`；plain-ui 评审 P3-02；`m3-1`、`m3-2` 验收第 3 条（`question-39` B） | §0、§1.2、§2.2 第 3 条、§3.1.3 第 5 条、§3.2.1、§4、§9.1.2、§9.1.3、§9.2、§9.3 第 3 项、§11 | 访谈选择题 |

## 2. 共用的改动

### 2.1 主 Agent 的工具面（`question-26` C）

0.4 §3.1.3 的「工具面」一段作废，换成下面这段。

- 单独一个不带 `prepend` 的 `system-prompt/assemble` 监听器 `roleFace`，由 `installAgentHooks(agent)` 装、按 agent 去重、卸载函数进本行的卸载列表（同 0.4 的身份节监听器）。它在 `next()` 之后按角色改 `tools`：
  - 是主 Agent：去掉每个原生名在 `WRITE_NATIVES = ['write', 'edit']`（`src/design/index.ts` 的常量）里的工具，原生名取 `toNativeTool(dialectService(ctx, problem), tool.name, problem)`（`src/shared/dialect.ts`，guard 的三处换算用的是同一个函数）。`Write`、`Edit` 由方言服务或静态表 `ZCODE_ALIAS_NATIVES` 换成 `write`、`edit`，方言以后多一个写文件的别名时自动覆盖，不另写别名清单。`str_replace_editor` 在工具面里时，把它的参数 schema 复制一份，`properties.command.enum` 改为 `['view']`，其余不动；schema 形状不对（没有 `properties.command.enum` 数组）时整个去掉这个工具，会话健康记一条「str_replace_editor 的参数形状不认识，主 Agent 的工具面里去掉了它」。rc.3 的预设与 headless 组合里都没有这一行（`reference/dsh-desktop-0.2.1-rc.3/**/*.yml` 里没有 `tool-str-replace-editor`〔实读〕），这条只为装了它的组合。
  - 不是主 Agent：去掉 `DESIGN_TOOL_NAMES` 里的名字（同 0.4 §3.1.3；这个常量在第 6 步才有，第 3 步的 `roleFace` 只有主 Agent 的一支）。
- 为什么不放在身份节的 `prepend` 监听器里：方言行（`src/glm-prompt/index.ts` `installDialect`）与 guard 的声明监听器都是 `prepend`，它们在 `next()` 之后读到的工具就是要改写、要交给工具检索的那一份；本行的 `prepend` 监听器与它们谁在外层取决于各行激活的先后（0.4 §3.1.3：加载器并发创建同组各行）。cordis 的 `on` 对 `prepend` 用 `unshift`、否则 `push`（cordis:336〔实读〕），串行 waterfall 从列表头开始调用，所以不带 `prepend` 的监听器在所有 `prepend` 监听器的里层，方言与工具检索看到的已是去掉之后的工具。DSH 自己的 `system-prompt/assemble` 监听器都不改 `tools`（评审核实：dsh-agent:167、dsh-working-directory:48、dsh-session-reference:459）。不同插件在同一个 agent 作用域上的监听器进同一张表，这一点是〔推断〕，L3 核对（第 3 步 `glm-design-main` 请求 3）。
- 只在工具面上去掉不是边界：rc.3 按名执行，与本次工具面无关（`docs/DESIGN.md` §2.4a）。主 Agent 按名直接调用 `Write`、`write`、`Edit`，由第 4 步的 `main-agent-no-write` 在 `tools/pre-execute` 拒绝。经 `DeferredToolCall` 包一层的 `Write` 到不了执行：`Write` 在 GLM 上是常驻工具（`src/toolsearch/exposure.ts`:39），`roleFace` 去掉之后它也不在延迟目录里，`DeferredToolCall` 先报「不可用」（`src/toolsearch/index.ts`:161–164），就算在目录里也会因为是常驻名报错（:165）。
- 工具面在 `/wish` 与 `/wish off` 的下一步各变一次，同 0.4。

### 2.2 身份节收窄（`question-31` C）

`MAIN_AGENT_IDENTITY`（`src/design/identity.ts`）分两部分，按这个次序拼成一节，中间一个空行：

1. 角色与边界，上限 1,500 字符（单测钉住，取代 0.4 的 9,000）。参考文本（英文；实现者可以改措辞，单测钉住长度与下面列的五项内容）：

```text
# Main agent
You are the main agent of this session: the human's project manager. You turn what the human wants into a plan on the project graph that the human approves, dispatch the work to subagents, accept it against its acceptance criteria and report back in plain words. You do not write files yourself.
The harness enforces the boundaries and its denials name the right path: you cannot write or change files, not even through the shell; until the goal in your focus is released, the subagents you dispatch, and theirs, only read; the graph changes only through the graph tools.
The design loop runs wish, interview, design, release. A stage reminder tells you where the goal in your focus stands and what is missing; the results of the design tools tell you the next step.
Ask the human for decisions through the cards: design_review to confirm the requirement card and to present every design round (never ask "shall I start?" in chat), decision_card when the work cannot go on without the human's choice; otherwise propose a question on the graph and carry on. Ask at the project-manager level, never about code, and never ask what you can look up.
If the human has /plan on, exit_plan_mode only leaves plan mode; it releases nothing on the graph.
```

   五项：角色（项目经理，不写文件）；一句边界（三条会执行的规矩只点名，不讲细节）；阶段与提醒；三张卡怎么用；`/plan` 的说明。参考文本实测 1,256 字符。

2. 问人的写法：常量 `PLAIN_QUESTION_GUIDE`（§2.8），上限 1,000 字符，原样引用，身份节不另写一份。

整节（含「访谈选择题」一步加的 `askLine`，§2.7）上限 2,700 字符，单测钉住三个上限。单测另钉：整节不含 `ask_user_question`、`(Recommended)`、`(推荐)`、`（推荐）`、`depth`。

这比 `question-31` C 的「约 1k–1.5k 字符」长：角色与边界仍在那个范围里，多出来的是例题与换词表，来自之后的 `d-plain-questions`（人定，点名了主 Agent 身份文本）。`question-31` C 是 agent 定的，人的后一个决定优先；三个上限的具体数是 agent 定，记在 §10；`question-30` 的消融以后能量出例题值不值这些字符。

0.4 §3.1.3 第 1–10 项的去向：

| 0.4 第几项 | 去向 |
| --- | --- |
| 1 角色；「用户的人设管怎么说」 | 角色留在第一部分；人设一句删去，人设在 Output Style 一节（§2.6） |
| 2 三问四答 | 删去；方案五栏的写法随设计阶段的提醒下发（§2.3） |
| 3 harness 执行的规矩 | 一句（第一部分第二段） |
| 4 阶段 | 一句（第三段）；各阶段做什么在阶段提醒里 |
| 5 八步访谈与提问规则 | 问句与做法移到 wish、interview 阶段的提醒（§2.3）；用词规则移到第二部分（§2.8）；问人用哪个工具、推荐放哪，归「访谈选择题」一步（§2.7） |
| 6 图上的写法 | 移到阶段提醒与门禁的 `hint`（`src/graph/stage.ts` 已有，main `7aa8fe5`） |
| 7 `design_review` | 一句（第四段）；五个键各自的下一步在工具结果的 `message` 里（0.4 §3.4.2 已有） |
| 8 决策卡 | 一句（第四段） |
| 9 汇报细度以 `design_review` 的 `depth` 为准 | 删去。`design_review` 的结果照旧带 `depth`，`message` 写「下一轮汇报按 <档>」；系统提示词里汇报细度只有 GLM 包的一个来源（§2.6） |
| 10 `/plan` | 留（第五段） |

### 2.3 阶段提醒承接访谈与写图格式

0.4 §3.6.2 第 3 条的正文按阶段加下面几行（英文，中文原话与标签原样）。提醒照旧只在变化时注入，所以这些文字只在阶段或缺项变了的那一步出现。

- `wish`、`interview`：
  - 一行访谈的做法：`Interview the human one question at a time, in their words: say 怎样算做成 for acceptance, 明确不做的 for non-goals, 最可能出岔子的地方 for risks, 不能改、不能花、不能冒的险 for constraints; offer defaults from experience; write each answer to the graph as soon as you have it.`
  - 一行「下一步」：`Next: ask 「<问句>」, then <这一项的 hint>.` 对照表是 `src/design/stage-notice.ts` 里按 `GateItem.key` 的常量，每项带访谈步号，问句取 `docs/ORCHESTRATION.md` §4.2 表的原文：

    | `GateItem.key` | 步号 | 问句 |
    | --- | --- | --- |
    | `need` | 1 | 你想要什么 |
    | `problem` | 2 | 做成以后，你的日子会有什么不一样 |
    | `audience` | 2 | 做成以后，你的日子会有什么不一样 |
    | `acceptance` | 3 | 你会怎么检查它真的做成了 |
    | `non-goals` | 4 | 有没有你明确不想要的（先猜几个供挑选） |
    | `constraints` | 5 | 有没有不能改、不能花、不能冒的险 |
    | `risks` | 6 | 假如最后没做成，最可能是因为什么（先猜三个） |
    | `choice` | 7 | 两三条路，各一句利弊，加上推荐 |

    「下一步」取缺项里步号最小的一项，步号相同按上表次序（`problem` 在 `audience` 之前）；`requirementCard` 的数组次序（约束排在成功之前，`src/graph/stage.ts`:121–143）不用来排序。缺项只有 `goal:supersedes` 时不写「下一步」一行，只写它的 `label` 与 `hint`。`src/graph/stage.ts` 不改（它的 `hint` 已写明写到哪里）。
  - 其余缺项各一行（`label` 与 `hint`，同 0.4）。
  - 这一步不写问人用哪个工具、推荐放在哪：那是「访谈选择题」一步经接缝加的一行（§2.7）。
- `design`：一行写图格式：`Write each design decision with "理由：", "架构：" and "查过的现成方案：" lines in its body, acceptance and nonGoals; plan features and tasks under the goal with a source edge to the decision, every task with acceptance; present the design with design_review.` 事前验尸的一行（`如果失败：`）在第 9 步加，与它的解析同一步（§2.4 末条）。其余同 0.4（五栏计数、缺项、放行门禁）。
- 单测钉住：所有阶段的正文都不含 `ask_user_question`、`(Recommended)`、`(推荐)`、`（推荐）`。

### 2.4 表格版卡片（`d-option-card`、`d-recommend-last`、`question-29` C）

`decision_card` 的参数（取代 0.4 §3.5.1 的参数一段与 §6.3 的 `why` 一行）：

```text
{ parent, title, background, options: [{key, label, gain, cost}], dimension?: {name, values: {<key>: <cell>}},
  recommend, crux, verdict, weight, sources?: string[] }
```

- `title` 是题目本身，一句问话（例「预约记在哪里」），卡上的大字。`background` 取代 0.4 的 `question`：两三句前因后果（这道题关于哪一块、从哪个决定或发现来、为什么要人定），非空，至多 600 码点，可以多行；它是待决的正文，也是卡片 `detail` 的第一段（§2.8）。带 `question` 的调用被拒，`hint`「background replaces question: two or three plain sentences of background; the question itself is the title」。
- 去掉 `why`：`d-option-card` 定「取决于」与结论行替换为什么与反方。带 `why` 的调用被拒（工具不收的字段）。
- 形状与长度交给引擎（`e22282f`）：`CARD_LIMITS = {label: 20, gain: 60, cost: 60, dimensionName: 12, cell: 20, crux: 60, verdict: 120}`（`src/graph/schema.ts`:55）；推荐必须是最后一个选项（`engine.ts` `questionRefusal`）；人定的题必须有 `crux`、`verdict`、`weight`；`verdict` 每个 `→` 后面是一个选项键且含推荐键（`verdictKeys`，`engine.ts`:295）；维度所有格相同被拒（`dimensionRefusal`）；新写入带 `consequence` 被拒。工具不另写一份校验，引擎的错误原样抛给模型（同 0.4）。工具自己只查引擎不管的两项：`background` 的长度，与不收的字段。
- 工具说明：一句用途（「当工作离不开人的选择时，在卡片上问人；选中即由人拍板」），然后原样引用 `PLAIN_QUESTION_GUIDE`（§2.8）。不点名提问工具，不写推荐放第一。
- 提议的待决：`{type: 'question', parent, title, body: background, options, dimension?, recommend, crux, verdict, weight, decider: 'human', edges: sources 各一条 source}`；正文不再拼「推荐 <key>：<why>」。
- 卡面（取代 0.4 §3.5.1 第 4 步；写法取 plain-ui §3.8.4）：
  - 问题 `id` 为 `hourness-decision:<待决 id>`（模拟人凭它到图上取推荐，§2.7）；`header` 为「要你拍板」；`question` 为 `title`。
  - `detail` 依次：`background`；`weight: 'one-way'` 时一行「这件事以后改起来很贵，多看一眼」；一行「取决于：<crux>」；一行结论「<verdict> · agent 推荐 <recommend>」；来源节点的标题；最后一行「关掉卡片也可以：这件事会留在项目图「需要你」里」。这几行由 `src/design/cards.ts` 的 `choiceDetail` 构造，「访谈选择题」一步的 `ask_human` 卡用同一个函数。
  - 选项按存储顺序（推荐就在最后），说法 `<key> · <label>`，说明 `得到：<gain>；代价：<cost>`，有维度时说明末尾加 `；<维度名>：<值>`。不加 `(Recommended)`、`(推荐)` 或 `（推荐）`：客户端认出这些后缀会显示推荐标签，第一项带后缀时还会在初稿里预选它（client-ui-user-questions client.js:672–686、783–795〔实读〕）；没有后缀就没有标签，也没有预选。
  - 回答：选中的说法要恰为本卡某个选项的 `<key> · <label>`，取 `key`；其余同 0.4 的表（只写了文字记成「没有选项，写道」的批注，待决留在队列，`outcome: 'text'`；结果的 `message` 写明人可能是「都不要」或在补条件，按文字换一组选项或补条件后再问）。
  - 一问，不加 plain-ui §3.8.4 建议的第二问「都不要或补充」：0.4 §11 定了决策卡保持一问（多一问每张卡多点一次「跳过」），「都不要」与「补充」在输入行里写文字就是一种回答。这与 plain-ui 不同，记在 §8 第 4 条。
- 先想后看（`d-inertia-breaker`）不在 M3：它的引擎部分在 plain-ui 的第 5 步。到时 `src/design/cards.ts` 的 `choiceDetail` 加一个问法参数，本附录不预留。
- 事前验尸（`question-29` C；plain-ui §12 M3 第 7 条）：设计决策正文可选一行 `如果失败：<最可能的原因>`，与「理由」「架构」「查过的现成方案」同一种正文标签，不进五栏门禁、缺了不拦。`designColumns` 今天只按 `COLUMN_LABELS = ['理由', '架构', '查过的现成方案']` 切节，一节到下一个已知标签为止（`src/graph/stage.ts`:61–80、146–150），未知标签会并进前一节：空的「查过的现成方案：」后面接一行「如果失败：…」时那一栏变成非空，五栏门禁误放行。所以第 9 步在 `src/graph/stage.ts` 加 `PARSED_LABELS = [...COLUMN_LABELS, '如果失败']`，`designColumns` 与五键卡的渲染都用它切节，门禁仍只看 `COLUMN_LABELS` 三栏；同一步在设计阶段提醒里加写法一行 `Optionally add a line "如果失败：<the likeliest reason it fails>" to a decision body; the release card shows it.`，五键卡 `detail` 在每个决策的五栏之后显示「如果失败，最可能是因为：<文字>」，没有就不显示。五键卡的五个键不带推荐，不受表格版字段影响。

### 2.5 `/wish` 入口与强一档模型的提醒（`m3-1` 验收第 4 条）

按 plain-ui §7.5.2–§7.5.5 与 `mockup-wish.svg` 场景 ①–⑤，M3 只做其中属于 `/wish` 的部分；上手页、「第一次用？」一行、没有项目图时的卡片、面板首页里的一句属于 plain-ui 的引导与面板改版，不在这里。全部在编排层客户端包 `dsh-hourness-ui`，第 11 步。

- 开场卡片 `WishCard`：`ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({name: 'conversation.input.dock', id: 'hourness-wish', order: 40, label: '交给主 Agent', inject: (sessionId) => ({ sessionId })}, WishCard))`，外层 `ctx.effect` 同流程条。这个槽在开场画面里位于工作区行与输入框之间（conversation client.js:17901–17907）。组件每次渲染判断，按下面三种情形之一显示，都不成立时返回 `null`：
  1. 完整卡片：会话是空白的（标准 prop `useSession` 的 `blank` 为真、`promptAttempted` 与 `running` 为假；拿不到时退到 `sessions.list` 的 `byId[sessionId].blank`）；本会话不是主 Agent（`mainAgentActive(values)` 为假）；有项目图（`holdSource`）且 `/wish` 已注册（`remote.commands.list(sessionId)` 里有 `wish`，每个会话读一次，失败时会话快照变化后再读一次）。文字照 `mockup-wish.svg` ①：标题「把这个工作区交给主 Agent」；正文「说一句你想做的。主 Agent 先问清楚、出方案给你批，再分给子 agent 去做；它自己不写代码。」；主按钮「写一句你想做的」；次按钮「接着推进现有项目」（图上有未关闭的目标时）；黄字带图标「主 Agent 用强一点的模型，子 agent 用便宜的就行」；灰字「命令是 /wish，随时 /wish off 退出。」
  2. 一行：会话仍是空白的、有项目图，而本会话已是主 Agent。这是人点了「接着推进现有项目」之后的样子：`/wish` 不带话时只 `inject`、不开回合，会话可能仍停在开场画面（开场画面取决于 `blank`、`awaitingFirstTurn`、`running`、`promptAttempted`，conversation client.js:17378–17379、17608–17610），而 `conversation.composer.dock` 只在非开场画面渲染（:19343–19344），「主 Agent」按钮看不到。所以这时卡片换成一行「这个会话的 agent 是主 Agent」与按钮「退出主 Agent（/wish off）」，满足 `m3-1` 验收第 4 条后半句。人发出第一句话后会话不再空白，这一行消失，退出方式由输入框下方的「主 Agent」按钮接手。
  3. 其余情形（不空白、没有项目图、`/wish` 没注册）不显示。
- 黄字不带模型名：plain-ui 0.4 正文 §7.5.2 写「主 Agent 用强一点的模型（如 GLM-5.3），子 agent 用便宜的就行」，草图没有括号。本附录按草图：编排层包对所有模型生效，不点名某个模型（`hourness` 目标的非目标「不含任何模型的方言」）。记在 §8 第 4 条告诉 plain-ui。
- 输入框下方的按钮 `WishPill`：`conversation.composer.dock`，id `hourness-wish`，order 160。普通会话、有项目图、`/wish` 已注册时写「交给主 Agent」，点开小弹层（`mockup-wish.svg` ②：一句说明、命令、黄字提醒、两个按钮）；主 Agent 会话里写「主 Agent」，点开「这个会话的 agent 是主 Agent：按项目图推进，不写文件。进度在右边的项目图里。」与「退出主 Agent（/wish off）」。那一排窄于 520 px（`closest('[data-composer-dock]')` 的宽度，`ResizeObserver`）时「交给主 Agent」写「/wish」，「主 Agent」不变。
- 按钮做什么（plain-ui §7.5.3）：「写一句你想做的」在输入框为空时经标准 prop `inputActions.setDraft` 写入 `/wish ` 并聚焦，输入框有字时不改并提示「输入框里还有没发出的字」；拿不到 `inputActions` 或 `useInput` 时不执行命令，换成一行「在输入框打 /wish，后面跟一句你想做的」与「复制 /wish」（`writeClipboard`）。「接着推进现有项目」与「退出主 Agent」经 `remote.commands.execute` 执行 `/wish`、`/wish off`，都是人的点击。
- 流程条：order 由 0.4 的 20 改为 30（DSH 排队条是 20，conversation client.js:17269，plain-ui §12 M3 第 5 条），开场卡片 40。`flowBarText` 多一个输入 `cheapModel: boolean`：主 Agent 最近一步的模型（`graphLive` 的 `model`，`src/graph/live.ts`:41）属于便宜档时，末尾另起一行黄字「现在是 <模型>；主 Agent 建议换强一点的模型」与「这次就用它」（按会话记在内存里，收起到重载为止）。便宜档按 plain-ui §7.5.5：模型 id 转小写，按 `[-_./:\s]` 切词，有一个词是 `flash`、`mini`、`lite`、`haiku`、`small`、`nano` 之一；认不出的不提醒。纯函数 `isCheapModel(id)` 放在 `ui/src/flow/model.ts`。0.4 的「主 Agent · 读不到阶段（现场投影未注册）」改为「主 Agent · 读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用）」（§2.8）。
- `/wish` 的成功回复（0.4 §3.1.1 表里「已让这个会话的 agent 当主 Agent…」两行）末尾加「主 Agent 建议用强一点的模型，子 agent 用便宜的就行」。第 3 步。
- `docs/ORCHESTRATION.md` §3.5 只写了子任务的档位，第 3 步补一句：主 Agent 用强一档的模型，在 `/wish` 的回复、入口与流程条上提醒人，插件不替人换模型（`docs/CHARTER.md` §6）。
- 没有项目图的工作区里，M3 的入口什么都不显示（`/wish` 在那里会报「还没有项目图」）。`m3-1` 验收第 4 条在有项目图的工作区里核对；没有图时的说明卡属于 plain-ui 的引导（§7.8）。

### 2.6 人设设置位与汇报细度改名（`m3-main-persona`）

设置位：

- 设计行（`glm-hourness/design`）的配置加一项（0.4 §2.1 写「设计行只有与图行同形的 `home`、`fs`」，这一句改为加上 `persona`）：`persona: {name: string, text: string}`，`name` 默认「主 Agent」，`text` 默认空串。Schema 经 `src/shared/schemastery.ts` 写，插件管理器里能改（验收第 3 条）；`text` 用多行文本框，schemastery 的写法（`role` 一类的注解，`src/shared/schemastery.ts`:466）在实现时按本仓库那份子集核对〔推断〕，L4 截图。
- 插件只给设置位，`text` 是用户自己的配置（`docs/CHARTER.md` 非目标「人设与个人习惯不进插件」）。
- `name` 的规整：去掉首尾空白，内部的换行与连续空白换成一个空格，然后按 40 码点截断；截断时告警一次（行日志），规整后为空时用「主 Agent」。`text`：去掉首尾空白后为空就不加这一节；超过 4,000 码点时不加，行健康 degraded「人设超过 4000 字符，没有加」。

注入：

- 公共库新文件 `src/shared/output-style.ts`，只放契约常量 `OUTPUT_STYLE_SECTION = 'hourness:output-style'` 与说明（两个包都编进去，同 `tool-names.ts`、`dialect.ts` 的做法）。
- 设计行的 `roleFace` 监听器（§2.1，不带 `prepend`，在里层）在本步是主 Agent、`persona.text` 非空时，在 `sections` 末尾追加一节 `{name: OUTPUT_STYLE_SECTION, text, interpolate: false}`，`text` 为 `# Output Style: <name>`、空行、用户的文字、空行，再加插件自己的一句范围说明：`This style applies to your replies to the human only. Text you put into tool calls (graph nodes, cards, briefs for subagents) and anything written to files stays plain.` 标题的写法取 ZCode 的 Output Style 节（`# Output Style: {name}` 加风格正文，`docs/reference/zcode-capabilities.md` §11.4；两段之间的分隔在实现时对照本机 3.16.3 安装包核对，写进 `docs/reference/zcode-verbatim.md`）。
- 不是主 Agent 的会话（普通会话、子会话 `origin: 'subagent'`、审查者）没有这一节。只给主 Agent 的理由：主 Agent 没有写工具（§2.1），人设的话落不进代码与注释；普通会话直接写代码，人设会落进文件（`m3-main-persona` 正文「代码注释里写个喵字不得闹笑话」）。
- GLM 路由（GLM 包，`src/glm-prompt/assembly.ts` `rewriteDialectSections`）：本次组装的 `sections` 里有 `OUTPUT_STYLE_SECTION` 一节时，身份节用 `buildIdentitySection(true, …)`（开头句 `IDENTITY_OPENING_WITH_STYLE`，`src/glm-prompt/verbatim.ts`:15，已在逐字门禁里，`scripts/check-verbatim.mjs`:237），并把这一节移到 `glm:context-management` 之前（ZCode 的次序是 Environment、Output Style、Context management，`docs/reference/zcode-capabilities.md`:374）；方言节里没有 `glm:context-management`（start-plan 档）时，放在最后一个方言节之后。没有这一节时与今天一样。`installDialect` 今天在安装时算一次 `sections`（`src/glm-prompt/index.ts`:184），改为两份身份节（有无风格）都在安装时算好，按组装时有没有这一节选一份。
- 其他路由：这一节原样留在 `roleFace` 追加的位置（guard 的声明在外层追加在它之后，身份节由 `insertHournessSection` 插在 `glm:guard` 之前），不换开头句。
- 子 agent 不带：`isMainAgent` 对 `origin: 'subagent'` 为假（0.4 §2.3）。子 agent 写的文件里不出现人设用语（验收第 2 条）在提示词层面由此保证；模型行为在 L4 用标记词核对（§3 第 12 步（b））。用户自己的 `~/.dsh/AGENTS.md` 里的人设所有 agent 都读得到，那是用户配置，插件不动（清点报告 §7 第 3 条：做完后由用户自己挪进设置位）。

改名：

- GLM 包 `glm-prompt` 行的配置 `persona`（汇报细度，`concise`、`balanced`、`detailed`）改名 `reportingDepth`；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts`，`PERSONA_LEVELS`、`PersonaLevel`、`personaSection`、`PERSONA_SECTION_NAME`、`isPersonaLevel` 改为 `REPORTING_DEPTHS`、`ReportingDepth`、`reportingDepthSection`、`REPORTING_DEPTH_SECTION`、`isReportingDepth`；节名 `glm:persona` 改为 `glm:reporting-depth`；`GlmPromptConfig` 与 `dialectSections` 的参数同改。模型看到的文字（`# Reporting Depth` 一节的正文）一个字不改。
- 旧配置照读：用户桌面版 profile 的 `glm-prompt` 行今天写着 `persona: balanced`（`~/.dsh/profiles/desktop/cordis.patch.yml`:57〔实读，只读〕），本仓库不改用户 profile（`AGENTS.md` 第 6 条）。cordis 在激活前用插件导出的 `Config` 校验并规整配置，`apply` 收到的是规整之后的值（cordis lib/index.js:956–961 `resolveConfig`、:1631〔实读〕）；本仓库的 schemastery 在值缺席时填默认值（`src/shared/schemastery.ts`:535–544），对象只留有值或原本就有的键（:814–823）。所以：
  - Schema 里 `reportingDepth` 与已弃用的 `persona` 都不带默认值（`reportingDepth` 的说明写「缺省为 balanced」，`persona` 的说明写「已改名为 reportingDepth，只为读旧配置」）；规整之后哪个键在，就是用户写了哪个键。
  - `apply` 取 `config.reportingDepth ?? config.persona ?? 'balanced'`。
  - 告警按规整之后的值判：只有 `persona` 时告警一次「glm-prompt 的 persona 已改名为 reportingDepth，这次按旧键生效」，行健康说明里写同一句；两者都有且不同时用 `reportingDepth`，告警一次「persona 与 reportingDepth 不同，按 reportingDepth」；两者都有且相同时不告警，行健康说明里写「旧键 persona 可以删掉」；两者都没有时不告警。
  - 插件管理器里不带默认值的单选框怎样显示〔推断〕，L4 截图（第 12 步（b）第 8 项）。
- `tests/profile-shape.spec.ts` 里的 `persona:` 是 YAML 解析的夹具，与 GLM 配置无关，不改。
- 清点报告 §7 第 3 条与 `question-31` C 还要把汇报细度并进 Output Style、子 agent 不带汇报细度（Q2 C、Q5 B）。这两件会改变所有 GLM 会话的开头句与子 agent 的提示词，不在 `m3-main-persona` 的验收里，本次不做，记在 §8 第 3 条。

ZCode 基线换到 3.17.1（`d-zcode-3171`，人在 2026-10-30 定）：3.17.1 改写了两种身份开头句与 CLI 前缀，`IDENTITY_OPENING_WITH_STYLE` 的文字会变，由运行 `prompt-fixes-merge-then-zcode-3171`（`wf_920936995c163f50`，任务 `zcode-3171-follow`）改。本节只按常量名写：`IDENTITY_OPENING_WITH_STYLE`、`IDENTITY_OPENING_PLAIN`、`buildIdentitySection`，不依赖 3.16.3 的字句，L2 也按常量比对。Output Style 节的标题写法与它在 Environment、Context management 之间的次序取自 3.16.3 的记录（`docs/reference/zcode-capabilities.md` §11.4、:374），实现时对照 `reference/zcode-3.17.1/zcode.cjs` 重新核对，不同就按 3.17.1 改并写进 `docs/reference/zcode-verbatim.md`。两条分支都改 `src/glm-prompt/`，后合入的一方 rebase（§3 `m3-main-persona` 一步的依赖）。

### 2.7 访谈选择题的接缝（P3-02，`d-interview-cards`）

本附录不替人定 P3-02：人已在 `d-interview-cards` 定了（图上 `approved`，2026-10-29T14:12Z，`relay`「B」，即 P3-02 里记作 A 的做法）。附录按人定实现 A，同时把它收在一个接缝后面，并写出 B 在同一接缝上的样子；人若推翻，改的是接缝模块与 `ask_human` 的文件，之前各步不动。

接缝：模块 `src/design/interview.ts`，导出常量 `INTERVIEW_CHANNEL` 与函数 `pickChoice`。下面三件事都只从这里读：访谈选择题怎样发出、主 Agent 怎样对待 `ask_user_question`、模拟人对选择题怎样选。

```ts
export interface InterviewChannel {
  /** 主 Agent 在对话里问人（选择题或问答题）用的工具名 */
  readonly askTool: string
  /** 组装时按角色从主 Agent 的工具面去掉的提问工具 */
  readonly hiddenFromMainAgent: readonly string[]
  /** 身份节、阶段提醒与设计工具的 message 说「怎么问人」的那一句（英文） */
  readonly askLine: string
}
export const INTERVIEW_CHANNEL: InterviewChannel
/**
 * 模拟人对一个选择题的选法，返回要选的那一项的说法。
 * questionId 与选项说法是卡片请求里的原样；recommendOf 按待决 id 读图上的 recommend。
 */
export function pickChoice(questionId: string, labels: readonly string[], recommendOf: (nodeId: string) => string | undefined): string
```

谁读它：

| 读的一方 | 读什么 |
| --- | --- |
| 设计行的 `roleFace`（§2.1） | `hiddenFromMainAgent`，与写文件的工具一起从主 Agent 的工具面去掉 |
| 身份节（`src/design/identity.ts`，第二部分之后一句）、阶段提醒（`src/design/stage-notice.ts`）、`design_review` 与 `decision_card` 的 `message`（`src/design/review.ts`、`decision-card.ts`） | `askLine`；0.4 里写「用 `ask_user_question` 问人……」的几处（§3.2.3 的「要改」、§3.4.2 的「拒绝」与「补充」没有文字两行）改为引用它 |
| 提问工具本身 | `askTool` 是它注册的名字 |
| 模拟人（`scripts/calibrate/simulated-human.mjs`，从 `packages/hourness/dist/design/interview.js` 导入，同 `run-probe.mjs` 从 `dist/` 导入的做法） | `pickChoice` |
| 标定与探针的场景核对 | `askTool`、`hiddenFromMainAgent` |

两种做法在接缝上的样子：

| | A（人选了，`d-interview-cards`） | B（没选） |
| --- | --- | --- |
| `askTool` | `ask_human`，设计行注册，`src/design/ask-human.ts`；卡片由 `src/design/cards.ts` 经 `userQuestions.ask` 写，与决策卡同一张表 | `ask_user_question`（DSH 自带，模型自己写选项与说明） |
| `hiddenFromMainAgent` | `['ask_user_question']` | `[]` |
| `askLine` | `Ask the human with ask_human, one question at a time, written like the example; for guesses to pick from (multiSelect) and open questions, the background, the question and the option labels are enough.` | 写明推荐放最后、不加 `(Recommended)`，取决于与结论行写进 `question`，并承认与 DSH 工具说明（tool-ask-user:94、250）相反 |
| `pickChoice` | 问题 id 是 `hourness-decision:<id>` 时，选说法以 `<recommendOf(id)> · ` 开头的那一项；其余选最后一项 | 选说法带 `(Recommended)`、`(推荐)` 或 `（推荐）` 的那一项，没有就选最后一项 |
| 违反怎样被发现 | 卡片由 harness 写，参数规则在工具体里执行；按名直接调用 `ask_user_question` 被规则拒绝并进违规流水（下面） | 标定与 L3 数调用里推荐不在最后、带后缀、缺取决于的次数 |

A 的其余内容，都在「访谈选择题」一步（§3）：

- `ask_human` 的参数（M1；与决策卡同一套字段，人看到的每一组选项都是同一张表）：

  ```text
  { background: string, question: string, header?: string,
    options?: [{key, label, gain?, cost?}], dimension?: {name, values: {<key>: <cell>}},
    recommend?: string, crux?: string, verdict?: string, weight?: 'one-way' | 'two-way',
    multiSelect?: boolean }
  ```

  工具体按下面的次序查，第一条不成立就抛 `invalid`，`field` 指到参数，`hint` 写改法（rc.3 不校验原样注册的参数，工具体自己查，同图工具）：
  1. 不收别的字段。
  2. `background` 去掉首尾空白后非空，至多 600 码点（§2.8：每道题先交代前因后果）。
  3. `question` 一行、非空、至多 120 码点；`header` 一行、至多 20 码点，缺省为「问你一下」。
  4. 没有 `options` 是问答题：这时 `dimension`、`recommend`、`crux`、`verdict`、`weight`、`multiSelect` 都不能有。
  5. `options` 2–4 项，`key` 合 `OPTION_KEY_PATTERN`（`src/graph/schema.ts`:195）且互不相同；`label` 一行、至多 `CARD_LIMITS.label`；`gain`、`cost` 有就要一行、至多 `CARD_LIMITS.gain`、`CARD_LIMITS.cost`。
  6. `multiSelect: true`（访谈第 4、6 步的「先猜几个供挑选」）不能带 `recommend`。
  7. 带 `recommend` 的单选题：`recommend` 是最后一项的 `key`（`hint`「把推荐项排在最后」）；`crux`、`verdict` 必填；每一项的 `gain`、`cost` 必填。
  8. `dimension`、`crux`、`verdict` 有就按引擎的同一条规则查：维度每键一格、各格一行至多 `CARD_LIMITS.cell`、不全相同；`crux` 一行至多 `CARD_LIMITS.crux`；`verdict` 一行至多 `CARD_LIMITS.verdict`，每个 `→` 之后是本题的选项键，有推荐时含推荐键。
  9. `weight` 缺省为 `two-way`：访谈的回答最后都在确认卡上由人整体确认，改起来不贵；回答定了就回不了头时才写 `one-way`。
  
  第 5、8 条的规则只实现一次：`src/graph/engine.ts` 私有的 `codePoints`、`shortLine`、`verdictKeys`（:285–297）、几条 `*_HINT` 常量（:299–307）、`optionRefusal` 里的 `label`、`gain`、`cost` 检查与 `dimensionRefusal` 的检查（:309–347）、`questionRefusal` 里 `crux`、`verdict` 的形状检查（:363 起）挪进新的纯函数模块 `src/graph/card-rules.ts`，返回 `{message, hint, at} | undefined`，消息里的主语由调用方给（引擎给 `"<节点 id>"`，所以引擎的错误文字一个字不变；`ask_human` 给 `this question`）。引擎与 `ask_human` 都调用它。这一处碰引擎文件，随「访谈选择题」的独立评审；引擎的已有测试不改且通过，就是行为不变的证据。
- 工具说明：一句用途（「在对话里问人一个问题：选择题或问答题；选中或回答之后，把回答写进图」），原样引用 `PLAIN_QUESTION_GUIDE`（§2.8），再一句字段规则的摘要（带推荐的单选题要有取决于、结论行与每项的得到、代价，推荐排最后）。
- 卡面：问题 `id` 为 `hourness-ask`；`header`；`question`；`detail` 由 `choiceDetail` 构造（§2.4）：`background`，`weight: 'one-way'` 时一行「这件事以后改起来很贵，多看一眼」，有 `crux` 时一行「取决于：<crux>」，有 `verdict` 时一行结论，带推荐时结论行末尾加「 · agent 推荐 <key>」。选项按参数顺序，说法 `<key> · <label>`，说明写有的那几样（「得到：…；代价：…」，有维度时末尾加一格）；不加任何推荐后缀，客户端因此不显示推荐标签、不预选。
- 回答与结果：`{outcome: 'chose' | 'text' | 'skipped' | 'closed', keys?: string[], text?: string, message: string}`。单选题选中即 `chose`（说法要恰为本卡选项，取 `key`）；只写文字为 `text`；多选题 `selected` 与 `custom` 都交（client.js:937–948），两者都有时 `chose` 并带 `text`；跳过为 `skipped`，`message`「人跳过了：用你的默认值并在汇报里说明，或换一问」；关掉卡片（`ASK_CANCELLED`）为 `closed` 并 `exec.concludeTurn()`。`message` 说下一步：把回答写进图（阶段提醒说写到哪里）。工具不写图，没有以人的身份写入。错误码与忙碌集合同 `design_review`（0.4 §3.4.4 第 1–4、9、10 条）。
- 工具名契约：`DESIGN_TOOL_NAMES` 加 `ask_human`，进 `ORCHESTRATION_RESIDENT_TOOLS`（GLM 上常驻），非主 Agent 的工具面去掉它（同两个设计工具）。
- 兜底规则 `main-agent-ask-card`（`src/guard/main-agent.ts`，由 `installMainAgentRules` 一起装，依赖由设计行传入）：调用方是主 Agent、调用名（经 `toNativeTool`）在 `INTERVIEW_CHANNEL.hiddenFromMainAgent` 里时拒绝；纠偏四段：事实 `You called ask_user_question.`；越界 `As the main agent you ask the human through ask_human: the harness writes the choices as a card, the recommendation last.`；正路 `Call ask_human with the same question and options, written like the example in its description.`；例外 `none`。进违规流水。失败一类按 0.4 §6.2 写入规则那一行 fail-open。
- 模拟人：`decisions` 仍只有 `{key}` 与 `'close'`（第 6 步）；没有配置 `decisions` 时，`hourness-decision:*` 按 `pickChoice` 选（图上的推荐；图目录取 `ctx.get('glmHournessGraph')?.dirFor(cwd)`，用 `dist/graph/store.js` 的 `loadGraph` 读，同 0.4 §9.1.1 的占位）；`hourness-ask` 的单选与多选都选 `pickChoice` 给的最后一项；问答题答 `freeText`；去掉 0.4 的 `choose` 配置。
- 0.4 里由模型写选项的标定指标（「`ask_user_question` 次数与带选项的比例」）改为 `ask_human` 的次数与带选项的比例；运行器的 `HUMAN_TOOLS`（`scripts/calibrate/run-calibrate.mjs`:37）加 `ask_human`。

第 10 步之前各步的约束：不写死「推荐放第一」、`(Recommended)` 或模拟人对选择题的选法。具体是：身份节、阶段提醒、`message` 都不点名提问工具（§2.2、§2.3 的单测）；例题里推荐在最后（`d-recommend-last`，§2.8）；决策卡按存储顺序出、不加后缀（§2.4）；模拟人在第 3–10 步只有按场景写死的回答（`confirm`、`fiveKeys` 按说法，`decisions` 按键，§3 第 6 步），遇到没配置的问题以 `ASK_CANCELLED` 拒绝并在 `human.jsonl` 写一条 `{kind: 'unexpected-question', id}`，不按任何规则选。

### 2.8 问人的话说人话（`d-plain-questions`，人在 2026-10-30 定）

人读不懂问题里的「验收」「标定」「补遗」「改写验收语句」（2026-10-29），并要求每道题先交代前因后果。`d-plain-questions` 定：给人的问题不用人没学过的词；凡是让模型给人写题的地方（图工具说明、主 Agent 身份文本、`decision_card` 与 `ask_human` 的说明）放一道完整的好题与换词表；harness 的写法检查在问题字段里查这些词。M3 管其中的身份文本与两个设计工具的说明，以及 harness 自己写给人看的字串。

一处定义：新模块 `src/graph/plain-question.ts`（纯文字与纯函数，不用 Node 内置模块；放在图目录，因为图工具的说明是 `d-plain-questions` 点名的另一处，图是两边都能导入的下层）：

- `PLAIN_QUESTION_EXAMPLE`：结构化的例题 `{background, title, options, recommend, crux, verdict, weight}`，字段与待决节点相同。
- `PLAIN_WORDS`：换词表，`[{avoid: ['验收', 'acceptance'], say: '怎样算做完', note: '…'}, …]`，五项：验收 → 怎样算做完（目标一级说「怎样算做成」，与需求卡的「成功（怎样算做成）」一致；任务一级说「怎样算做完」，即任务上那张做完要附证据的核对清单）；标定 → 练习题（固定的几道小项目，系统自己做一遍、由脚本代人点卡片，用来查改动有没有把系统改坏）；门禁 → 合入前的检查；投影 → 每一步给 agent 的项目摘要；补遗 → 说清它是什么。
- `PLAIN_QUESTION_GUIDE`：由上面两个常量生成的英文说明，上限 1,000 字符。参考文本（实测 963 字符；加上身份节第一部分的 1,256 与 `askLine` 的 201，整节约 2,420）：

```text
Every question you put to the human is in plain words and opens with its background: two or three sentences on which part of the work it is about, where the question came from and why the human, not you, decides it. Then the crux (取决于), one row per option (what it does in at most 20 characters, what it gets, what it costs, with numbers or examples), the verdict, and the recommendation last. A good one:
  background: 店里的预约页要记下客人的预约。记在哪里，决定店员能不能在手机上改预约。店里平时怎么用只有你知道，所以问你。
  title: 预约记在哪里
  crux: 店员要在手机上改预约吗？
  options:
    A  label 存到网上的表格; gain 手机、电脑都能改; cost 要做登录，多花约 1 天
    B  label 存在店里电脑的一个文件; gain 不用联网，今天就能用; cost 只有那台电脑能改
  recommend: B (last)
  verdict: 要 → A；不要 → B
  weight: two-way
Plain words for the human: 怎样算做完 (for a goal: 怎样算做成), not 验收 or acceptance; 练习题, not 标定 or calibration (fixed small projects the system runs by itself to check nothing broke); 合入前的检查, not 门禁; 每一步给 agent 的项目摘要, not 投影; never 补遗 or addendum: say what the document is.
```

  例题故意选了与标定任务（记账小工具）不同的领域，免得给标定的模型现成的答案。
- `plainWordsIn(text): string[]`：返回 `text` 里出现的 `avoid` 词（中文词按子串，英文词按词边界、不分大小写）。三个用处：各步的单测查 harness 写给人看的字串；第 12 步（a）在标定里数卡片请求里出现的次数；plain-ui 的写法检查以后可以直接调用（§8 第 5 条）。

落在哪里：

| 位置 | 内容 | 步 |
| --- | --- | --- |
| `src/graph/plain-question.ts` 与 `tests/plain-question.spec.ts` | 三个导出；单测：例题经引擎 `propose` 为一张人定的待决被接受（推荐在最后、字段齐、长度在 `CARD_LIMITS` 内），例题各字段 `plainWordsIn` 为空，说明不超过 1,000 字符、含例题的每个字段值与五个 `say` | 3 |
| 身份节第二部分 | 原样引用 `PLAIN_QUESTION_GUIDE`（§2.2） | 3 |
| `/wish` 的回复、错误与行健康说明 | 0.4 §3.1.1 表里「主 Agent 模式要用会话投影服务，这个组合里没有」改为「主 Agent 模式要用 DSH 的会话状态服务（sessionProjections），这个组合里没有」；0.4 §6.2 的 degraded「主 Agent 模式要会话投影服务」改为「主 Agent 模式要会话状态服务（sessionProjections）」 | 3 |
| `decision_card` 的说明 | 原样引用（§2.4） | 6 |
| `design_review` 的 `summary` 参数说明 | 一句：`The human reads summary: plain words, as the swap list in your instructions says.` | 8 |
| 五栏门禁的标签（`src/graph/stage.ts`，五键卡与 `gate_unmet` 的 `message` 都显示） | `目标（验收条件）` 改为 `目标（怎样算做成）`；`任务「<标题>」的验收条件` 改为 `任务「<标题>」怎样算做完` | 9 |
| `ask_human` 的说明 | 原样引用（§2.7） | 访谈选择题 |
| 流程条 | 「读不到阶段（现场投影未注册）」改写（§2.5） | 11 |
| 标定指标 | 卡片请求（`human.jsonl`）里 `plainWordsIn` 命中的次数 | 12（a） |

各步的单测对 harness 写给人看的字串（回复、错误、行健康说明、卡片的固定文字）调 `plainWordsIn`，结果为空。模型写进卡片的文字 M3 不在运行时拦：拦截属于 plain-ui 的写法检查（§8 第 5 条），M3 在标定里数（第 12 步（a））。

### 2.9 卡片怎样显示只在一处定（`d-option-card` 正与人重新商量）

2026-10-29 深夜到 10-30，人说表格版选项卡「看着太累」，编排方在对话里试一种更轻的写法（每题一两句背景、选项一行一个、推荐放最后、不画表），人回答之前 `d-option-card` 不改（图上 `d-option-card` 的批注；`.agents/tasks/design-context.md`「keep the card display rules in one section so a change stays local」）。所以 M3 把人看到的选择题的样子收在下面几处，`d-option-card` 改了只改它们，实施步骤的结构不变：

| 管什么 | 在哪 |
| --- | --- |
| 卡面文字：`detail` 的行与次序、选项的说法与说明、固定的提示句 | `src/design/cards.ts` 的 `choiceDetail`、`optionLabel`、`optionDescription`（决策卡与 `ask_human` 卡共用；确认卡与五键卡的固定文字也在这个文件） |
| 例题与换词表 | `src/graph/plain-question.ts`（§2.8） |
| `ask_human` 的字段要求（哪些字段必填） | `src/design/ask-human.ts` 的一个函数 `askHumanRefusal`，规则的细节调 `src/graph/card-rules.ts` |
| 决策卡的字段要求 | 引擎（`e22282f`，不是 M3 的代码；改它属于 card-fields-table 的后续） |

依赖这几处的步骤是第 6 步与「访谈选择题」，排得靠后；人的新回答在第 6 步开工前到达时，按新写法实现这几处，附录只改 §2.4 的卡面、§2.7 的参数规则与 §2.8 的例题。

## 3. 逐步的改动

每步的门禁、提交、文档同批与 0.4 §8 相同。「今天必败」写的是新增或改了的检查；0.4 原有的检查不变时不重复。「验收（修订后）」只列这一步碰到的、0.4 之后改过文字的验收条件。

### 第 3 步（m3-1：主 Agent 模式与身份）

变化：

- 身份节按 §2.2（两部分）；本步建 `src/graph/plain-question.ts`（§2.8），身份节第二部分引用它。
- `installAgentHooks` 多装 `roleFace`（§2.1），本步只有主 Agent 的一支：去掉原生名为 `write`、`edit` 的工具，收窄 `str_replace_editor`。非主 Agent 去掉设计工具的一支随第 6 步（那时才有 `DESIGN_TOOL_NAMES`）。人设一节不在这一步，不预写代码。
- 0.4 第 3 步 L2 的「发 `/wish <一句话>` 后第一次组装就有这一节与两个设计工具」改为「就有这一节」：`decision_card` 在第 6 步注册，`design_review` 在第 8 步。
- `/wish` 的成功回复加强一档模型的一句（§2.5）；`docs/ORCHESTRATION.md` §3.5 补主 Agent 的档位提醒。`/wish` 的错误与行健康说明按 §2.8 改两处字串。
- 模拟人的应答部分在这一步只有骨架：没配置的问题按 §2.7 末段以 `ASK_CANCELLED` 拒绝并记 `unexpected-question`。

验收（修订后）：`m3-1` 第 3 条（`question-39` B 之后）「主 Agent 的工具面等于同一组合下普通会话的工具面去掉写文件的工具（Write、Edit 及其别名、str_replace_editor 的写操作）与 ask_user_question，加上 design_review、decision_card、ask_human；由编排层插件在组装时去掉，不用 preset；shell 写入由 guard 兜底」。本步做到去掉写文件的工具；`decision_card`、`design_review` 在第 6、8 步加上；`ask_user_question` 与 `ask_human` 在「访谈选择题」一步。

L2 改动（`tests/design-mode.spec.ts`、新 `tests/plain-question.spec.ts`）：

- 身份节：第一部分不超过 1,500 字符、含五项；第二部分与 `PLAIN_QUESTION_GUIDE` 逐字相同；整节不超过 2,700；整节不含 `ask_user_question`、`(Recommended)`、`(推荐)`、`（推荐）`、`depth`。删去 0.4 里「长度上限 9000」一例。
- 工具面：主 Agent 的组装结果没有 `Write`、`Edit`、`write`、`edit`（有方言服务与没有方言服务各一遍，后者走静态表），`str_replace_editor` 的 `command` 只剩 `view`（假宿主的组装带上这几个工具），形状不对时去掉并报会话健康；`roleFace` 不带 `prepend` 注册，在一个外层 `prepend` 监听器里 `next()` 得到的工具已经去掉（两种安装先后各一遍）；普通会话的工具面不变。
- 字串：`/wish` 的成功文字含「强一点的模型」；`/wish` 的全部回复与行健康说明 `plainWordsIn` 为空。
- `tests/plain-question.spec.ts` 按 §2.8 的表。

今天必败：同 0.4（没有 `wish` 命令）；另：照 0.4 写法实现时主 Agent 的组装结果里有 `Write`、身份节第一部分超过 1,500；导入 `src/graph/plain-question.ts` 失败。

L3：`glm-design-main`、`non-glm-design-main` 请求 3 的「工具面等于请求 1 的工具面加两个设计工具」改为「等于请求 1 的工具面去掉 `Write`、`Edit`（非 GLM 为 `write`、`edit`）」；第 6 步起加上 `decision_card`，第 8 步起加上 `design_review`，「访谈选择题」起去掉 `ask_user_question`、加上 `ask_human`（场景的期望随步骤扩展，每步都跑探针）。请求 8（`/wish off` 之后）恢复请求 1 的工具面。

依赖：split 已合入（开工条件满足）；`src/graph/main-agent.ts` 在 main。无独立评审（同 0.4）。

### 第 4 步（m3-1：`main-agent-no-write`）

变化：规则、判写、纠偏同 0.4。主 Agent 的工具面里已经没有写工具，这条规则是兜底；纠偏的正路不提「写工具不在」，照 0.4。身份节不再逐条声明规则（§2.2 第一部分一句），0.4 §3.1.4「声明写在身份节里（第 3 条）」改为「身份节一句点名」。

L2 加（`tests/design-guard.spec.ts`）：主 Agent 按名直接调用不在工具面上的 `Write`、`write`、`Edit` 被拒并进违规流水；`DeferredToolCall {name: 'Write'}` 返回工具错误、目标文件不存在（`Write` 既不在延迟目录里，也是常驻名，§2.1）；`str_replace_editor` 的 `create`、`str_replace`、`insert` 被拒，`view` 放行。

今天必败：同 0.4。L3 同 0.4（请求 3、4 的 `Write` 与 shell 写入此时是按名调用工具面上没有的工具，照样被拒，正好核对兜底）。依赖：无新增。独立评审：是。

与其他分支的先后：运行 `prompt-fixes-merge-then-zcode-3171`（`wf_920936995c163f50`，接手了 prompt-fixes 的 `939bf9a`、`0059e63`）改 `src/guard/rules.ts` 的 `APPLICATION_PROTOCOL`，本步在同一文件里导出 `fileWriteTarget`、`shellWriteOf`；谁先合入 main，另一方 rebase 后重跑门禁（`question-28` C：同文件串行，由编排方排）。

### 第 5 步（m3-3、m3-6：阶段提醒与设计期只读）

变化：阶段提醒按 §2.3：访谈的做法一行、按步号取的「下一步」与 §4.2 的问句、写图格式；不点名提问工具；不写 `如果失败：`（第 9 步）。`design-before-release` 同 0.4。

L2 加（`tests/design-stage-notice.spec.ts`）：`interview` 阶段缺「问题」时正文含 `做成以后，你的日子会有什么不一样` 与访谈做法一行；只缺约束与成功时「下一步」问的是成功（`你会怎么检查它真的做成了`），不是约束；只缺 `goal:supersedes` 时没有「下一步」一行，有它的 `label` 与 `hint`；对照表的键与 `requirementCard` 的 8 个键一一对应；`design` 阶段正文含 `理由：`、`架构：`、`查过的现成方案：`；所有阶段的正文都不含 `ask_user_question`、`(Recommended)`、`(推荐)`、`（推荐）`。

今天必败：同 0.4；另：`interview` 阶段的提醒里没有 §4.2 的问句（照 0.4 写法实现时，问句在身份节里，不在提醒里）。

L3：`glm-design-stage` 请求 3 的提醒另核对含下一项的问句。依赖：无新增。独立评审：是。

### 第 6 步（m3-5：决策卡）

变化：`decision_card` 按 §2.4（表格版参数、`background` 取代 `question`、去掉 `why`、说明带 `PLAIN_QUESTION_GUIDE`、卡面由 `choiceDetail` 构造、问题 `id` 带待决 id、一问）。`DESIGN_TOOL_NAMES` 与常驻名单同 0.4；`roleFace` 加非主 Agent 去掉设计工具的一支。模拟人的应答部分：`decisions?: Array<{key: string} | 'close'>`，`{key}` 选说法以 `<key> · ` 开头的那一项；不设 `'recommended'`（那是 §2.7 的选法规则）；去掉 0.4 的 `choose` 与「其余问题」的选法；`freeText` 留到「访谈选择题」一步。

L2 改与加（`tests/decision-card.spec.ts`）：卡片请求的选项说法依次为 `A · <label>`、`B · <label>`……与存储顺序相同，最后一项是推荐；没有一项带 `(Recommended)`、`(推荐)`、`（推荐）`；说明为 `得到：…；代价：…`，有维度时末尾加一格；`detail` 第一段是 `background`，然后是「取决于：」一行与「<verdict> · agent 推荐 <key>」一行，只有 `weight: 'one-way'` 才有「以后改起来很贵」一行；待决的正文等于 `background`；`background` 缺、全是空白或超过 600 码点被拒；带 `question` 或 `why` 的调用被拒（工具不收的字段，`question` 的 `hint` 指向 `background`），带 `consequence` 的被引擎拒绝、原样返回；推荐不在最后被引擎拒绝、原样返回；回答的说法不是本卡任何一项时当作没有选项；工具说明含 `PLAIN_QUESTION_GUIDE`；卡片的固定文字 `plainWordsIn` 为空。0.4 里「选项说法含 `(Recommended)`」的解析一例删去。

今天必败：同 0.4（工具不存在）；另：照 0.4 写法实现时第一项是推荐并带 `(Recommended)`，`detail` 没有「取决于」一行。

L3：`glm-decision-card` 的模拟人改为 `decisions: [{key: 'B'}, 'close']`；脚本里的两张决策卡都是两个选项 `A`、`B`、推荐 `B`（推荐在最后），带 `background`、`crux`、`verdict`、`weight`；请求 2 另核对 `human.jsonl` 里卡片请求的说法与 `detail`（同上面的 L2 规则）；`line` 步的 `decide` 照旧选 `A`。`glm-design-main` 请求 3 的工具面加上 `decision_card`。

依赖：card-fields-table 已在 main（`e22282f`），满足。`d-option-card` 正与人重新商量（§2.9）：第 6 步开工前编排者确认人有没有新回答，有就按新写法改 §2.9 列的几处。独立评审：是（以人的身份写图）。

### 第 7 步（m3-5：面板拍板的回写）

不变。plain-ui §12 M3 第 2 条（把面板上「都不要」「补充」的批注也通知主 Agent）依赖 plain-ui 面板改版的动作，那时由 plain-ui 的实现把 `comment` 加进通知的操作，M3 不预留。

### 第 8 步（m3-2：访谈一支与标定任务）

变化：

- `design_review` 访谈一支同 0.4；`message` 里不点名提问工具（「要改」不带文字时写 `ask the human what is wrong, one question`），「访谈选择题」一步再接上 `askLine`；`summary` 参数的说明加 §2.8 的一句。0.4 第 8 步的「身份文本的访谈部分定稿」删去（访谈部分在第 5 步的提醒里）。`glm-design-main` 请求 3 的工具面加上 `design_review`。
- 标定任务 `tests/calibration/interview-expense-log/` 与运行器的 `interview` 种类、`limits` 同 0.4；`task.json` 的 `human` 去掉 `"choose": "recommended"`；运行器的 `HUMAN_TOOLS` 加 `design_review`、`decision_card`（0.4 §9.2「计入打扰人」）。
- 标定运行与仓库隔离（`risk-calib-read`），第 12 步（a）之前就要有。新模块 `scripts/calibrate/run-dir.mjs`，运行器调用它，仓库根由参数传入（测试用临时目录当仓库）：
  - `openBatch(repo, stamp)`：建 `<repo>/.llm/calibration-runs/<stamp>/`（今天的位置，gitignored）；在系统临时目录建一个批目录 `fs.mkdtempSync(join(os.tmpdir(), 'glm-hourness-calib-batch-'))`，`results.json` 写在这里；在仓库那一边写 `pending.json`：`{root: <批目录>, runs: []}`。
  - `openRun(batch, name)`：每次运行在系统临时目录单独建一个 `mkdtempSync(join(tmpdir(), 'glm-hourness-calib-run-'))`，不嵌在批目录里（工作区的 `..` 到不了同批其他运行）；开跑之前把 `{name, dir}` 记进 `pending.json`（先写临时文件再改名）。运行器今天写进运行目录的东西照旧全写在这里：`calibrate.patch.yml`、`events.jsonl`、`stderr.txt`、`check.txt`、`check/`、`limits.jsonl`、`home/`（含 `audit/violations.jsonl`）、`dsh-home/`（含 `glm-hourness/audit/usage.jsonl` 与附件）、`human.jsonl`、`result.json`、`ws/`（含 `ws/.git`）（`scripts/calibrate/run-calibrate.mjs`:97–133、150–157、227–237；`scripts/sandbox.mjs` `dataRows`、`attachmentsIn`）。验收脚本照旧在会话结束后由运行器从仓库里的任务目录执行，不复制进工作区（:155）。
  - `closeBatch(batch)`：整批跑完之后一次拷回（不是每次运行之后：每次运行后拷回，前几次运行的解，含 `events.jsonl` 里的全部工具调用，就回到了仓库，同批后面的运行按绝对路径能读到）。批目录拷到 `<repo>/.llm/calibration-runs/<stamp>/`，每个运行目录拷到 `<stamp>/<name>/`，整棵树原样拷（`fs.cpSync(src, dst, {recursive: true, errorOnExist: true, force: false})`，含 `ws/.git`，所以工作区可以照原样还原）。拷完核对：源里的每个文件在目标里都有，相对路径与字节数相同。全部一致才删临时目录：只删 `pending.json` 里记着的路径，且每个都必须是 `os.tmpdir()` 的直接子目录、名字以 `glm-hourness-calib-` 开头，不合这两条的不删并报出来；删完再删 `pending.json`。
  - 失败：拷回或核对出错时不删任何临时目录，`pending.json` 留着，运行器打印「拷回没有完成：临时目录 <路径…> 保留；修好后运行 npm run calibrate -- --collect <stamp>」并以退出码 1 结束（同「运行没有到达模型」的退出码，是 harness 失败，不是模型结果）。运行器中途崩溃时同样留下 `pending.json`。
  - 恢复：`npm run calibrate -- --collect <stamp>` 不跑新的运行，只按 `pending.json` 做 `closeBatch`。
  - 残余：被测模型仍能按绝对路径读仓库（guard 不拦读），也能列出系统临时目录找到同批其他运行；提示词与会话里不出现仓库路径与临时目录路径。记在 §9。

L2 加：今天没有运行器的测试。新测试 `tests/calibrate-run-dir.spec.ts`（真实的系统临时目录，一个临时目录当仓库）：运行目录与批目录都不在仓库下，也不互相嵌套；`closeBatch` 之后目标里有源里的每一个文件（含嵌套目录里的文件与 `ws/.git/HEAD`），字节数相同，临时目录与 `pending.json` 都已删除；目标里预先放一个同名文件让拷贝失败时，临时目录与 `pending.json` 都保留，返回值列出临时目录的路径；模拟崩溃（只有 `pending.json` 与临时目录）之后 `collect` 拷回并清理；`pending.json` 里伪造一个仓库下的路径或不带前缀的路径时，它不被删除并被报出。`tests/design-review.spec.ts` 访谈部分同 0.4，`message` 断言改为不含 `ask_user_question`，`summary` 的说明含 §2.8 那一句。

今天必败：同 0.4（`design_review` 不存在）；另：导入 `scripts/calibrate/run-dir.mjs` 失败；今天的运行器把运行目录建在仓库的 `.llm/calibration-runs/` 下（`scripts/calibrate/run-calibrate.mjs`:89）。

L3：`glm-design-interview` 只留图的写入、`gate_unmet` 与确认（脚本化的模型不提问，直接按八步写图）；提问的部分移到「访谈选择题」一步的 `glm-design-interview-ask`。依赖：无新增。独立评审：是。

### 第 9 步（m3-3、m3-4：五栏门禁与五键）

变化：

- 事前验尸一行（§2.4 末条）：`src/graph/stage.ts` 加 `PARSED_LABELS`，`designColumns` 与五键卡的渲染都用它切节，门禁仍只看三栏；设计阶段提醒加写法一行；五键卡 `detail` 在每个决策的五栏之后显示「如果失败，最可能是因为：…」。
- 五栏门禁的两处标签按 §2.8 改成人话（`src/graph/stage.ts`；`tests/graph-stage.spec.ts` 里钉这两个标签的断言同改）。
- §3.4.2 表里「拒绝」「补充」没有文字的两行，`message` 不点名提问工具（「访谈选择题」再接 `askLine`）。其余同 0.4。

L2 加（`tests/graph-stage.spec.ts`、`tests/design-review.spec.ts`、`tests/design-stage-notice.spec.ts`）：正文为「理由：…／架构：…／查过的现成方案：（空）／如果失败：…」时 `designColumns` 的架构一项 `ok` 为假、`design_review` 返回 `gate_unmet` 且缺项含「架构（含查过的现成方案）」；有 `如果失败：` 一行时「架构」一节的值不含它；五键卡 `detail` 在有这一行时含「如果失败，最可能是因为：」，没有时不含、门禁照样成立；设计阶段的提醒含 `如果失败：`；门禁的全部 `label` `plainWordsIn` 为空；`message` 不含 `ask_user_question`。

今天必败：同 0.4；另：上面那段正文在今天的 `designColumns` 下架构一项为 `ok`（「如果失败：…」被并进了「查过的现成方案」）；`目标（验收条件）` 标签含「验收」。

L3 同 0.4（`glm-design-release` 另加一个带 `如果失败：` 的决策，核对五键卡请求的 `detail`）。依赖：无新增。独立评审：是。

### 第 10 步（m3-5：去掉 L1/L2/L3）

不变。

### 「访谈选择题」一步（`d-interview-cards`，排在第 10 步之后）

内容（§2.7 的 A）：

- 新文件 `src/design/interview.ts`（接缝）、`src/design/ask-human.ts`（工具体与 `askHumanRefusal`）、`src/graph/card-rules.ts`（从引擎挪出的规则，§2.7）；`src/graph/engine.ts` 改为调用 `card-rules.ts`（错误文字不变）；`src/design/cards.ts` 加 `askCardRequest`、`parseAskAnswer`（复用 `choiceDetail`）；`src/design/index.ts` 注册 `ask_human`，`roleFace` 去掉 `INTERVIEW_CHANNEL.hiddenFromMainAgent`；`src/guard/main-agent.ts` 加 `main-agent-ask-card`；`src/shared/tool-names.ts` 的 `DESIGN_TOOL_NAMES` 加 `ask_human`；阶段提醒、`review.ts`、`decision-card.ts` 的 `message` 接上 `askLine`；身份节第二部分之后加 `askLine`（整节仍不超过 2,700）。
- 模拟人按 §2.7 改；运行器的 `HUMAN_TOOLS` 加 `ask_human`；`task.json` 的 `human` 不变（第 8 步已去掉 `choose`）。
- 文档：`docs/ORCHESTRATION.md` §4.2（访谈的问题怎样到人面前：harness 出卡、与决策卡同一张表、推荐在最后、主 Agent 不带 `ask_user_question`）；`docs/DESIGN.md` §2.4a（`userQuestions.ask` 的问答题、按角色去掉 `ask_user_question`）；`docs/DEVELOPMENT.md` §3（模拟人的选法）；0.4 原文要改的行见 §7。

验收（修订后）：`m3-1` 第 3 条（见第 3 步，本步做完 `ask_user_question` 与 `ask_human` 两项）；`m3-2` 第 3 条（`question-39` B 之后）「标定任务 interview-expense-log 在 GLM-5.3 上三次里至少一次完整通过验收脚本；模拟人在待决卡上选图上的推荐项、访谈的选择题选最后一项（有推荐时推荐就在最后）、确认卡点确认、五键卡先补充一次再批准；两档模型的结果都记作基线」中模拟人的选法一段（标定本身在第 12 步（a））。

L2（`tests/ask-human.spec.ts`、`tests/card-rules.spec.ts`、`tests/design-guard.spec.ts`、`tests/contracts.spec.ts`）：

- 参数（§2.7 第 1–9 条每条至少一例）：未知字段；`background` 缺、全空白、超长；`question` 多行或超长；问答题带 `recommend` 或 `crux`；2–4 项、键格式与重复；`label`、`gain`、`cost` 超长或多行；带推荐的单选题缺 `crux`、缺 `verdict`、某一项缺 `gain` 或 `cost` 时 `invalid`，`field` 指到那个参数；推荐不在最后；`verdict` 指向不存在的键、不含推荐键；维度各格相同；多选题带 `recommend`；多选题与没有推荐的单选题不带 `crux`、`verdict`、`gain`、`cost` 时通过。
- 卡面：说法 `A · …` 按参数顺序，没有推荐后缀；`detail` 依次为 `background`、单向门一行（只在 `one-way`）、「取决于：」一行、结论行，带推荐时结论行以「 · agent 推荐 <key>」结尾，没有 `crux`、`verdict` 时这两行不出现；卡片的固定文字 `plainWordsIn` 为空；工具说明含 `PLAIN_QUESTION_GUIDE`。
- 回答：单选、只写文字、多选带文字、跳过、关掉并结束回合；子 agent 调用 `forbidden`；忙碌。
- `card-rules.ts`：每个函数的拒绝与放行；引擎的已有测试（`tests/graph-engine.spec.ts`、`tests/graph-format.spec.ts` 等）不改且通过。
- 工具面与规则：主 Agent 的组装结果没有 `ask_user_question`、有 `ask_human`，非主 Agent 没有 `ask_human`；主 Agent 按名调用 `ask_user_question` 被 `main-agent-ask-card` 拒绝、进违规流水，非主 Agent 照常；设计行注册的名字等于 `DESIGN_TOOL_NAMES`（三个）。
- 接缝：`pickChoice` 对决策卡取图上的推荐（推荐不在最后一项的旧待决也对）、对 `hourness-ask` 取最后一项；`askLine` 出现在身份节与 `interview` 阶段的提醒里。

今天必败：`ask_human` 不存在；导入 `src/graph/card-rules.ts` 失败；带 `tool-ask-user` 的组合里主 Agent 的工具面有 `ask_user_question`；按名调用 `ask_user_question` 被放行。

L3（移进来的部分）：

| 场景 | 内容 |
| --- | --- |
| `glm-design-main`、`non-glm-design-main`（扩展） | 请求 3 的工具面另核对没有 `ask_user_question`、有 `ask_human`；加一步脚本回复 `ask_user_question`：被拒，纠偏是 `main-agent-ask-card` 的，违规流水多一条 |
| `glm-design-interview-ask`（新） | `probe-full`，模拟人 `wish: true`。脚本化的模型提目标、聚焦，然后：一个 `ask_human` 单选题（三项，推荐 `C`，带 `background`、`crux`、`verdict`、每项 `gain`、`cost`）：`human.jsonl` 的请求说法依次为 `A · …`、`B · …`、`C · …`，都不带推荐后缀，`detail` 依次有背景、取决于与以「 · agent 推荐 C」结尾的结论行，模拟人选 `C`；一个多选题（非目标的猜测，只有 `label`）：模拟人选最后一项；一个问答题：模拟人答 `freeText`；一个推荐不在最后的 `ask_human` 与一个带推荐、缺 `crux` 的 `ask_human`：都是 `invalid`，`human.jsonl` 里没有对应的请求；一个 `decision_card`（推荐 `B` 在最后）：模拟人按图上的推荐选 `B`。最后 `design_review` 走到确认 |

依赖：`d-interview-cards` 已定（满足）；`d-option-card` 正与人重新商量（§2.9，同第 6 步）。独立评审：是（guard 规则、图引擎文件、人看到的卡）。

### `m3-main-persona` 一步（排在「访谈选择题」之后）

内容：§2.6 全部。文件：`src/shared/output-style.ts`（新）、设计行的配置 Schema（`persona`）与 `roleFace` 加节；`src/glm-prompt/assembly.ts` 与 `index.ts`（识别契约节、两份身份节、`reportingDepth` 与旧键的读法）；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts` 及其引用（`src/glm-prompt/index.ts`、`assembly.ts` 的注释，`tests/s5.spec.ts`、`tests/dialect-wiring.spec.ts`）；文档 `docs/DESIGN.md` §5.2 节表（`glm:reporting-depth`、`hourness:output-style`）、§2.5 的配置说明，`docs/ORCHESTRATION.md` §3.1（人设只给主 Agent）。

L2：

- 人设：主 Agent、`persona.text` 非空时组装结果有这一节（标题、用户文字、范围说明），`interpolate: false`；`text` 为空或全是空白、普通会话、子会话都没有；`/wish off` 的下一步没有；`text` 超过 4,000 码点时不加、行健康 degraded；`name` 有换行与连续空白时规整成一行、超过 40 码点时截断并告警一次、规整后为空时用「主 Agent」。
- GLM 路由：有这一节时身份节开头是 `IDENTITY_OPENING_WITH_STYLE`（按常量比，不写字面），这一节在 `glm:context-management` 之前，start-plan 档在最后一个方言节之后；没有这一节时开头是 `IDENTITY_OPENING_PLAIN`，与改动之前的组装结果逐字相同；方言与设计行两种安装先后结果相同。非 GLM 路由：这一节原样，在身份节与 `glm:guard` 之前。
- 改名：先经 `Config(raw)` 规整再调 `apply`（与 cordis 的 `resolveConfig` 同一条路）：只写 `persona: concise` 时细度为 concise、告警一次、行健康说明有改名一句；只写 `reportingDepth: detailed` 时为 detailed、不告警；两者都写且不同时用 `reportingDepth`、告警一次；两者都写且相同时不告警、行健康说明有「旧键 persona 可以删掉」；两者都不写时为 balanced、不告警。`# Reporting Depth` 的正文与改名前逐字相同。
- 契约：`OUTPUT_STYLE_SECTION` 在两个包的产物里是同一个字符串（`tests/contracts.spec.ts`）。

今天必败：配置了 `persona.text` 的主 Agent 组装结果里没有 `hourness:output-style`；方言的开头总是 `IDENTITY_OPENING_PLAIN`；`glm-prompt` 的 `Config` 里没有 `reportingDepth`；规整只写旧键的配置之后，照 0.1 带默认值的写法细度为 balanced（这一例钉住 M2）。

L3（新场景）：`glm-design-persona`（`probe-full`，覆盖行给设计行 `persona: {name: 'PM', text: 'End every reply to the human with 「（PM-MARK）」.'}`，模拟人 `wish: true`）：主 Agent 的请求里身份节开头为 `IDENTITY_OPENING_WITH_STYLE`，有 `# Output Style: PM` 且位于 `# Context management` 之前；脚本派一个子 agent（同 `glm-dispatch`），子会话的请求里没有这一节、开头为 `IDENTITY_OPENING_PLAIN`。`non-glm-design-persona`（`probe-hourness`）：有这一节、开头句不变。

依赖：`m3-1` 在同一分支上已完成（满足）。同文件串行：运行 `prompt-fixes-merge-then-zcode-3171`（`wf_920936995c163f50`）改 `src/glm-prompt/index.ts`（环境节的工作目录）、`src/glm-prompt/verbatim.ts` 与身份开头句（3.17.1）、`tests/dialect-wiring.spec.ts`、`docs/DESIGN.md`、`docs/reference/zcode-verbatim.md`；本步改其中的 `src/glm-prompt/index.ts`、`tests/dialect-wiring.spec.ts`、`docs/DESIGN.md`。后合入 main 的一方 rebase，重跑三道门禁与探针（`question-28` C）；本步的 L2 按常量写，开头句的字面变了不用改测试。无独立评审（不在编排方的评审名单里；改的是提示词组装与配置，不涉及凭证、guard 与图引擎权限）。

### 第 11 步（m3-6：流程条与 `/wish` 入口，`.worktrees/m3-flow`）

内容：0.4 第 11 步的流程条，加 §2.5 的全部客户端部分。文件：`ui/src/flow/model.ts`（`flowBarText` 加 `cheapModel`、`isCheapModel`、读不到阶段的新说法）、`ui/src/flow/FlowBar.tsx`、`ui/src/wish/model.ts`（显示规则的三种情形、短标签、按钮动作的选择，纯函数）、`ui/src/wish/WishCard.tsx`、`ui/src/wish/WishPill.tsx`，在 `ui/src/hourness-client.tsx` 注册三个槽项；`scripts/packages.mjs` 编排层客户端的 `sources` 加 `ui/src/flow/`、`ui/src/wish/`（今天是 `['ui/src/hourness-client.tsx', 'ui/src/dsh.ts', 'ui/src/primitives.d.ts', 'ui/src/graph/']`，`scripts/packages.mjs`:66）。`ui/src/dsh.ts` 按需补 `useSession`、`inputActions`、`useInput` 与 `commands.list` 的薄类型。

L2：`tests/flow-bar.spec.ts` 同 0.4，另加便宜档（`GLM-5.3-Flash`、`gpt-4o-mini`、`claude-3-5-haiku`、`gemini-2.0-flash-lite` 命中；`GLM-5.3`、`gemini-2.5-pro`、`deepseek-chat`、空串、非字符串不命中），读不到阶段的说法；`tests/wish-entry.spec.ts`：开场卡片三种情形的判定（空白与否、主 Agent 与否、有图没图、`/wish` 在不在、`useSession` 拿不到时退到 `sessions.list`），空白且已是主 Agent 时是退出那一行；「接着推进现有项目」只在有未关闭的目标时；按钮在普通会话与主 Agent 会话里的文字；窄于 520 px 的短标签；拿不到 `inputActions` 时换成复制退路；黄字不含模型名；`ui/src/wish/model.ts` 与 `ui/src/flow/model.ts` 里所有给人看的字串 `plainWordsIn` 为空（客户端测试从 `src/graph/plain-question.ts` 导入，它不用 Node 内置模块）。

今天必败：模块不存在。L4：随第 12 步（b）。

依赖：`src/graph/stage.ts`、`src/graph/main-agent.ts` 在 main（满足）；plain-ui 0.4 仍在修订：本步按 `mockup-wish.svg` 与 §7.5 写，所有给人看的字串集中在 `ui/src/wish/model.ts` 与 `ui/src/flow/model.ts`，plain-ui 定稿后若改字句或位置，只改这两个文件与 order 常量；`hournessMainAgent` 投影在 `m3` 分支的第 3 步才注册，本步的 L2 只用纯函数，真实显示在合入后的 L4 看。无独立评审。

与 `m3` 分支的合并：两条分支都改 `scripts/packages.mjs`（第 3 步改编排层的 `src` 与 `rows`，本步改客户端 `sources`）与 `docs/ORCHESTRATION.md` §4.8（0.4 第 2、5 步的阶段与本步的呈现都写在这一节）。`m3-flow` 合入 `m3` 时 `scripts/packages.mjs` 两边都留；§4.8 手工合并，按节内的先后把两边的段落都放进去；合入之后在 `.worktrees/m3` 上重跑三道门禁与探针。合入时机：`m3-main-persona` 一步之后、第 12 步（a）之前。

### 第 12 步（a）：标定

在「访谈选择题」、`m3-main-persona` 与 `m3-flow` 都合入 `m3` 之后跑。变化：运行目录在系统临时目录、整批之后拷回（第 8 步）；模拟人的选法来自接缝（§2.7）；临时 profile 里设计行的 `persona.text` 为空（标定量的是设计循环，不带人设）。指标：提问次数改为 `ask_human`；另记卡片请求里 `plainWordsIn` 命中的次数与命中的词。其余同 0.4（GLM-5.3 三次里至少一次通过验收脚本，两档模型的结果都记作基线）。

### 第 12 步（b）：合入与批次 L4

0.4 §9.3 的七项改动与新增：

- 第 1 项另看：会话文件里主 Agent 的工具清单没有 `Write`、`Edit`、`ask_user_question`，有 `design_review`、`decision_card`、`ask_human`。
- 第 3 项改为：访谈的选择题卡由 harness 出：`detail` 先是两三句背景，有推荐时有取决于与结论行；说法 `A · …` 按顺序、推荐在最后一项、没有「推荐」标签、初稿里没有预选；`decision_card` 的卡片同样；选中之后 4 秒内面板显示这张待决由「你」拍板。卡片上没有「验收」「标定」「门禁」「投影」「补遗」。
- 第 6 项另看（`m3-1` 验收第 4 条）：新会话开场画面里卡片在工作区那一行与输入框之间、与输入框同宽；点「接着推进现有项目」之后，会话仍在开场画面时卡片换成「这个会话的 agent 是主 Agent」与退出按钮（截一张）；普通会话输入框下方「交给主 Agent」、主 Agent 会话里「主 Agent」与退出；「写一句你想做的」把 `/wish ` 写进输入框；1280 宽、右侧栏打开时各截一张；GLM-5.3-Flash 上流程条带便宜档提醒，换成 GLM-5.3 后消失。
- 新增第 8 项（`m3-main-persona`）：插件管理器里设计行的「人设」设置位能改、`glm-prompt` 行的 `reportingDepth` 显示正常（各截一张）；设了标记人设（例「每次回复以「（PM-MARK）」结尾」）之后，主 Agent 的回复带标记，主 Agent 派出的子 agent 写的文件与交回结构里没有标记；清掉设置后恢复。这一项要改桌面版 profile 里设计行的配置，属于改用户 profile（`AGENTS.md` 第 6 条），到时先问人，照 `d-option-card` 与 `d-plain-questions` 写（若人那时已改了卡片格式，按新格式写同样的内容）：

  > 人设是你给主 Agent 定的说话方式，比如每句话结尾加一个记号。这次要在桌面版上试一回：设一个记号，看主 Agent 的回复带它、它派出去干活的 agent 写的文件里没有它。设这个要改你桌面版的插件配置，仓库的规矩是改你的配置要先问你。
  >
  > 取决于：这几分钟里你愿意自己在插件管理器里点两下吗？
  >
  > | 选项 | 怎么做 | 得到 | 代价 |
  > | --- | --- | --- | --- |
  > | A | **agent 备份后改、测完还原** | 你不用动手 | agent 改你的配置文件；改前备份，测完还原 |
  > | B | **你自己设、测完自己清掉** | 你的配置只有你动过 | 要你点两回，设一次、清一次，各约 1 分钟 |
  >
  > 愿意 → B；不愿意 → A（agent 推荐 B）

- 合入之后第一个提交把设计行改为默认启用（同 0.4）；`persona.text` 默认空，启用之后不带人设。

## 4. 失败与降级（新增的行，接 0.4 §6）

| 操作 | 失败条件 | 可恢复？ | 调用方收到 | 记录 |
| --- | --- | --- | --- | --- |
| `roleFace` | 读角色抛错 | 是 | 本步当作非主 Agent：去掉三个设计工具，写工具与 `ask_user_question` 不去掉（写入照样由规则拦） | 告警一次，会话健康 degraded |
| `roleFace` | 方言服务抛错 | 是 | `toNativeTool` 退到静态表 `ZCODE_ALIAS_NATIVES`，`Write`、`Edit` 照样去掉 | `dialectWarner` 告警一次（同 guard） |
| `roleFace` | `str_replace_editor` 的参数形状不认识 | 是 | 主 Agent 的工具面里整个去掉它 | 会话健康说明 |
| `roleFace` | 人设超过 4,000 码点 | 是，人改短 | 不加这一节 | 行健康 degraded |
| `roleFace` | `persona.name` 超过 40 码点 | 是 | 截断后照用 | 告警一次 |
| 方言识别 Output Style 节 | 节的文字不是字符串 | 是 | 当作没有这一节，开头句不换 | 告警一次 |
| `ask_human` | 参数不合法、忙碌、没有卡片通道、子 agent 调用 | 是 | 工具错误，码同 `design_review`；参数错误带 `field` 与 `hint` | 会话日志的工具结果 |
| `ask_human` | 人关掉卡片 | 是 | `closed`，结束回合 | 工具结果 |
| `card-rules.ts` | （纯函数，不抛错；输入形状不对由调用方先挡住） | — | — | — |
| `main-agent-ask-card` | 读角色抛错、判定器抛错 | 是 | 放行（fail-open，同 0.4 写入规则） | 会话健康 degraded |
| 改名后的 `glm-prompt` 配置 | 只写了旧键 `persona` | 是 | 照旧生效 | 告警一次，行健康说明 |
| 改名后的 `glm-prompt` 配置 | 新旧两键都写且不同 | 是 | 按 `reportingDepth` | 告警一次 |
| 标定 `openRun` | 建临时目录或写 `pending.json` 失败 | 否（这次调用） | 运行器以用法错误的退出码 2 结束，已跑完的运行照常由 `closeBatch` 拷回 | 控制台 |
| 标定 `closeBatch` | 拷贝或核对出错 | 是，`--collect` | 不删临时目录，`pending.json` 留着，退出码 1 | 控制台写明每个临时目录的路径 |
| 标定 `closeBatch` | `pending.json` 里的路径不在系统临时目录下或不带前缀 | 是，人看过之后手工处理 | 那个路径不删 | 控制台报出 |
| 标定模拟人 | `pickChoice` 读图失败（决策卡） | 是 | 选最后一项，`human.jsonl` 记 `{kind: 'recommend-unread', reason}` | `human.jsonl` |
| 流程条、`/wish` 入口 | 拿不到 `useSession`、`inputActions`、`commands.list` | 是 | 退到 `sessions.list`；退到复制；不显示入口 | 客户端控制台（同面板） |

## 5. 外部输入的校验（新增，接 0.4 §6.3）

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `decision_card.background` | 是 | 去掉首尾空白后非空，至多 600 码点，可多行 | 工具 `invalid` |
| `decision_card.options[].gain`、`cost`、`dimension`、`crux`、`verdict`、`weight` | 按引擎规则（人定的题 `crux`、`verdict`、`weight` 必填） | `CARD_LIMITS`；推荐在最后 | 引擎的 `invalid`，原样返回 |
| `decision_card.question`、`why`、`options[].consequence` | 不收 | — | `invalid`（前两者工具拒，`question` 的 `hint` 指向 `background`；后者引擎拒） |
| `ask_human` 的各字段 | `background`、`question` 必填；带推荐的单选题另要 `crux`、`verdict` 与每项的 `gain`、`cost` | §2.7 第 1–9 条 | `invalid`，`field` 与 `hint` |
| 设计行 `persona.name` | 否 | 规整成一行，至多 40 码点；空时用「主 Agent」 | 超长截断并告警一次 |
| 设计行 `persona.text` | 否 | 至多 4,000 码点；去掉首尾空白后为空即不加 | 超长不加，行健康 degraded |
| `glm-prompt` 的 `reportingDepth`、旧键 `persona` | 否，都不带默认值 | `concise`、`balanced`、`detailed` | Schema 拒绝（同今天） |
| 卡片回答（决策卡、`hourness-ask`） | — | 说法要恰为本卡某一项的 `<key> · <label>` | 当作没有选项，文字照取 |
| 标定的 `pending.json`（`--collect` 读它） | 是 | `{root: string, runs: [{name, dir}]}`，路径须为系统临时目录的直接子目录、带前缀 | 形状不对时不拷不删，退出码 2；单个路径不合格时跳过那一个并报出 |

## 6. 不变量（新增或改，接 0.4 §6.4）

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 主 Agent 不写文件 | 两层：组装时 `roleFace` 按原生名去掉写工具（看不到就不试，`question-26` C）；执行边界的 `main-agent-no-write`（按名调用与 shell 写入的兜底） | 工具面不是边界，rc.3 按名执行 |
| 人看到的每一组选项推荐都在最后、不带推荐后缀、不预选，带推荐时有取决于与结论行 | 决策卡：引擎核对字段与推荐在最后（`44e8601`、`e22282f`）加 `cards.ts` 按存储顺序出卡；访谈题：`ask_human` 工具体按 `card-rules.ts` 核对加 `cards.ts`；`ask_user_question` 从主 Agent 的工具面去掉并由 `main-agent-ask-card` 兜底 | 不靠模型照身份文本做（`d-interview-cards`） |
| 选项规则只有一份实现 | `src/graph/card-rules.ts`，引擎与 `ask_human` 共用 | 两份会走样 |
| 人看到的选择题长什么样只在 §2.9 列的几处 | `cards.ts`、`plain-question.ts`、`ask-human.ts` 的 `askHumanRefusal` | `d-option-card` 正与人重新商量，改动要局部 |
| 例题与换词表只定义一次 | `src/graph/plain-question.ts`，身份节与两个工具说明原样引用 | `d-plain-questions` 点名了几处，抄几份会走样 |
| 访谈的问法、提问工具与模拟人的选法只有一处定义 | `src/design/interview.ts` | 接缝；换做法只改一个文件 |
| 人设只进主 Agent 的系统提示词 | 设计行 `roleFace`（`isMainAgent`） | 子 agent 与普通会话会写文件 |
| 插件不带人设文字 | 设计行的配置默认空串 | `docs/CHARTER.md` 非目标 |
| 身份节的角色与边界部分只有角色与边界 | 单测钉住长度与内容 | `question-31` C |
| 标定运行时仓库里没有同批运行的解 | 运行器：运行目录在系统临时目录，整批之后才拷回 | `risk-calib-read` |
| 标定运行的记录不在拷回之前删掉 | `run-dir.mjs` 的 `closeBatch`：核对一致才删，只删 `pending.json` 里记着、在系统临时目录下、带前缀的路径 | 删除不可撤回（`docs/DEVELOPMENT.md` §1.1 第三类） |

## 7. 0.4 原文要改的地方

行号是 0.4 当前文件（`.agents/tasks/m3/design.md`，1,234 行）的。前五行是 `d-interview-cards` 点名的。改法照本附录；实现各步时在 0.4 里同批改写，或在 0.4 的这些位置加一句「见附录 §x」。prompt-fixes 的节点正文也写了要改 0.4 §3.1.3 第 5 项与 §3.5.1 第 4 步的推荐次序：那两处以本附录为准（§2.2、§2.4）。

| 行 | 现在写的 | 改为 |
| --- | --- | --- |
| 86（§2.2 第 3 条） | 每步一个 `ask_user_question`，推荐项放第一并加 `(Recommended)` | 每步一个 `ask_human`（harness 出卡，与决策卡同一张表，推荐在最后）；拿到回答就写图 |
| 241（§3.1.3 第 5 项） | 八步访谈与 `ask_user_question` 的规则 | 整项删去，按 §2.2 的去向表 |
| 752（§4 契约表） | `ask_user_question` 的参数与「推荐项放第一」 | `ask_user_question`：从主 Agent 的工具面按角色去掉，`main-agent-ask-card` 兜底；探针与标定的覆盖层仍插入 `tool-ask-user`，好核对它被去掉；另加一行 `userQuestions.ask` 的问答题（没有 `options`，user-questions:33–51） |
| 972（§9.1.2 第 2 条） | 有选项时选带 `(Recommended)` 的一项、没有就选第一项 | 按 §2.7：决策卡选图上的推荐，访谈题选最后一项，问答题答 `freeText`；没配置的问题在「访谈选择题」之前以 `ASK_CANCELLED` 拒绝 |
| 1050（§9.3 第 3 项） | 访谈中 `ask_user_question` 的卡片标出推荐项 | 按 §3 第 12 步（b）第 3 项 |
| 14（§0 m3-1） | 身份文本：三问四答、八步访谈、五栏、五键、决策卡；工具面等于普通会话的工具面加两个设计工具 | 身份节两部分（§2.2）；工具面按 §2.1 与 `m3-1` 第 3 条（`question-39` B） |
| 15、38（§0、§1.2 的 m3-2） | 八步访谈经 `ask_user_question` | 经 `ask_human` |
| 160（§3.1.1 表） | 「主 Agent 模式要用会话投影服务，这个组合里没有」 | §2.8 的说法 |
| 248（§3.1.3） | 长度上限 9000 | 第一部分 1,500、第二部分 1,000、整节 2,700 |
| 282、283（§3.2.1 表第 1、2 行） | `ask_user_question` | `ask_human` |
| 311（§3.2.1 末段） | 问题的形状写进身份文本；`ask_user_question` 带选项的比例 | 形状由 `ask_human` 的参数规则执行；指标改为 `ask_human` 带选项的比例 |
| 344、494、496（§3.2.3、§3.4.2 的 `message`） | 用 `ask_user_question` 问人 | 引用 `askLine`（第 8、9 步先写成不点名工具） |
| 537（§3.4.4 回答的解析） | 选了一项的说法「含 `(Recommended)` 后缀」 | 说法是 `<key> · <label>`，不带后缀（§2.4） |
| 557、564（§3.5.1 参数与第 4 步） | `question`、`consequence`、`why`；推荐排第一加后缀；`header` 为标题 | §2.4 |
| 708（§3.6.4） | `order: 20` | 30 |
| 804（§6.2 表） | degraded「主 Agent 模式要会话投影服务」 | §2.8 的说法 |
| 847（§6.3） | `decision_card.why` | 删去，按 §5 |
| 968、987（§9.1.2 配置、§9.1.3 `glm-decision-card`） | `choose: 'recommended'`；`decisions: ['recommended', 'close']` | §3 第 6 步与 §2.7 |
| 1030、1040（§9.2） | `"choose": "recommended"`；`ask_user_question` 次数 | 去掉 `choose`；`ask_human` 次数，另加 `plainWordsIn` 命中次数 |
| 1086（§11） | 「要改」不带文字时用 `ask_user_question` 追问 | 用 `ask_human` 追问 |
| 1095（§11） | 访谈的提问形状不设门禁，只写进身份文本并在标定里计数 | 形状由 `ask_human` 的参数规则在工具体里执行（§2.7）；标定照样计数 |

## 8. 交给编排者记图的事项

本步不写 `docs/graph/`。下面的事项写在同目录的 `graph-ops-addendum-v02.json`，由编排者决定怎么记：

1. `m3-1` 验收第 3 条：人已按 `question-39` B 同意建议文字（2026-10-29T15:33Z），编排者正在写图。`d-option-card` 的批注记着人可能把之前的回答重答一遍；重答不同时，只改本附录第 3 步与「访谈选择题」的「验收（修订后）」。
2. `m3-2` 验收第 3 条：同上。
3. 发现（不变）：`question-31` C 里汇报细度并进 Output Style（清点报告 Q2 C 的后半）与子 agent 只拿它需要的（Q5 B）没有落到任何节点上；`m3-main-persona` 只做人设与改名。建议在 `prompt-audit` 或 `glm-house` 下提一个任务，等 `question-30` 的消融（这两件改所有 GLM 会话的提示词）。
4. 给 plain-ui 的回话：
   - 决策卡与 `ask_human` 卡保持一问，没有采用 §3.8.4 的第二问「都不要或补充」（§2.4 的理由）；卡片 `detail` 在取决于之前多一段两三句的背景（`d-plain-questions`）。
   - 流程条 order 30、开场卡片 40 照 plain-ui；`/wish` 入口在 M3 第 11 步按 §7.5 与 `mockup-wish.svg` 实现，plain-ui 的第 9 步（`/wish` 入口）因此只剩上手页与没有图时的卡片；空白会话里已是主 Agent 时卡片换成退出一行（§2.5 第 2 种情形），plain-ui 的草图没有这一屏。
   - 黄字按草图写，不带「（如 GLM-5.3）」：编排层包对所有模型生效，不点名某个模型。plain-ui 0.4 正文 §7.5.2 与草图不一致，请以草图为准或说明理由。
   - plain-ui §12 M3 第 3 条「访谈第 2 步的问题写进目标的 `why`（P2 按 D 定时）」取决于 plain-ui 待人定的 P2。M3 照 main 上的 `src/graph/stage.ts` 用正文标签 `问题：`；P2 定为 D 时，改的是 `requirementCard` 的 `problem` 一项（读 `why`）与它的 `hint`，由 plain-ui 的实现做；M3 第 5 步的问句对照表按 `GateItem.key` 建，不受影响。
5. `d-plain-questions` 里 M3 不做的两件：图工具的说明（`graph_propose` 提待决时）带例题与换词表；harness 的写法检查在问题字段里查这些词（plain-ui §4.3）。`PLAIN_QUESTION_GUIDE` 与 `plainWordsIn` 在 `src/graph/plain-question.ts`（第 3 步建），这两件可以直接用；写法检查落地之后，`ask_human` 的工具体也该调用它（`ask_human` 不经引擎写图，引擎的检查管不到它）。建议在 `d-plain-questions` 或 `m8-plain-language` 下提任务。
6. `d-option-card` 正与人重新商量：M3 把卡片的样子收在 §2.9 列的几处。人有新回答时请在第 6 步开工前告诉 M3 的运行。
7. ZCode 3.17.1（`d-zcode-3171`）：`m3-main-persona` 一步与 `wf_920936995c163f50` 同改 `src/glm-prompt/`，后合入的一方 rebase；本附录按常量名写（§2.6 末段）。
8. `m3` 上批注：附录 0.2 写成、待第 2 轮评审；本版的改动按 §12。

## 9. 不做的事（新增）

- 先想后看在对话卡上的问法（plain-ui 第 5 步加，`cards.ts` 那时加问法参数）。
- 汇报细度并进 Output Style、子 agent 不带汇报细度（§8 第 3 条）。
- ZCode 的 Output Style 提醒（`${styleName} output style is active…`，`docs/reference/zcode-capabilities.md` §4.3，3.16.3 的记录）：本项目的 Output Style 节在系统提示词里、会话内不变，不加周期提醒。
- 普通会话（没有 `/wish`）的人设。
- 标定会话的读取圈禁（`risk-calib-read` 的第三条处理方向）：属于 guard 的读规则，本次只把运行目录移出仓库、整批之后才拷回、会话结束后才跑验收脚本。残余：被测模型按绝对路径仍能读仓库（包括本批的 `pending.json`）与系统临时目录里同批的其他运行；提示词与会话里不出现这两个路径。
- 上手页、没有项目图时的开场卡片、面板首页的 `/wish` 一句（plain-ui 的引导与面板改版）。
- 图工具说明里的例题、问题字段的写法检查（§8 第 5 条）；M3 不在运行时拦模型写进卡片的生词，只在标定里数。

## 10. 由 agent 定、人可推翻的事项（新增）

- 角色相关的工具过滤放在不带 `prepend` 的 `roleFace` 里层监听器，身份节仍是 0.4 的 `prepend` 监听器；写工具按原生名判（§2.1）。
- `str_replace_editor` 在主 Agent 的工具面上收窄为只有 `view`，形状不认识时整个去掉（§2.1）。
- 身份节分两部分：角色与边界 1,500 字符、五项内容；例题与换词表 1,000 字符；整节 2,700（§2.2）。代价：主 Agent 的系统提示词里例题出现三次（身份节、`decision_card` 与 `ask_human` 的说明），约 2,900 字符，只在主 Agent 会话里，静态，能进提示词缓存。
- 例题用与标定任务不同的领域；目标一级说「怎样算做成」、任务一级说「怎样算做完」（§2.8）。
- 八步访谈的问句按需求卡的项在阶段提醒里给，按步号取下一项（§2.3）。
- 提问工具叫 `ask_human`，问选择题与问答题都用它，不做成 `decision_card` 的一种模式。理由：访谈题与追问不是图上的待决，写成待决会让图上多出大量节点，也会算进跟随率。`d-interview-cards` 写的是「decision_card 的一种模式或新工具 interview_choice」；`ask_human` 也用于设计阶段的追问（拒绝的理由、要补充什么），所以不叫 `interview_choice`。
- `ask_human` 的字段规则：带推荐的单选题与决策卡一样要取决于、结论行与每项的得到、代价；多选的猜测、不带推荐的单选题与问答题免这几项；`weight` 缺省为 `two-way`（§2.7）。
- `decision_card` 与 `ask_human` 都必须带 `background`，`decision_card` 的 `question` 参数改名为它（§2.4）。
- 决策卡与 `ask_human` 卡保持一问（§2.4）。
- 决策卡的问题 `id` 带待决 id，模拟人凭它读图上的推荐（§2.4、§2.7）。
- 人设只给主 Agent，不给普通会话；人设节末尾加插件自己的范围说明一句（§2.6）。
- 旧配置键 `persona` 保留为已弃用的同形字段并照读；两个键都不带默认值，告警按规整之后的值判（§2.6）。
- 标定的运行目录每次运行一个系统临时目录，整批之后整棵树拷回 `.llm/calibration-runs/` 再删，失败时 `--collect` 重做（§3 第 8 步）。
- `/wish` 入口在 M3 第 11 步实现，没有项目图时不显示；空白会话里已是主 Agent 时开场卡片换成退出一行；黄字不点名模型（§2.5）。

## 11. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-29 | 第一稿：吸收 `question-26` C、`m3-1` 验收第 4 条、`question-31` C、`m3-main-persona`、`d-option-card`、强一档模型的提醒、`d-interview-cards` |
| 0.2 | 2026-10-30 | 回应第 1 轮评审（MEDIUM 4、NIT 12，§12）；吸收 `question-39` B、`d-plain-questions`（新 §2.8）、`d-zcode-3171`（§2.6 末段）与 `d-option-card` 正在重新商量（新 §2.9）；依据改为 main `9c71ed0` |

## 12. 对第 1 轮评审的回应

| 发现 | 处理 | 改在哪 |
| --- | --- | --- |
| M1 `ask_human` 的选择题没有取决于与结论行 | 照改：参数加 `background`、`crux`、`verdict`、`dimension`、`weight`；带推荐的单选题 `crux`、`verdict` 与每项 `gain`、`cost` 必填；规则挪进 `src/graph/card-rules.ts`，引擎与 `ask_human` 共用，引擎错误文字不变；卡面与决策卡同一个 `choiceDetail`；`askLine` 改写；L2、L3 加缺 `crux` 被拒与 `detail` 各行的核对。多选、无推荐与问答题免这几项，`weight` 缺省 `two-way`，记进 §10 | §2.7、§2.4、§5、§6、§10；「访谈选择题」一步 |
| M2 `reportingDepth` 带默认值，旧键读不到 | 照改：两个键都不带默认值，`apply` 取 `reportingDepth ?? persona ?? 'balanced'`，四种写法的告警写定；L2 经 `Config(raw)` 规整后再调 `apply`，五种写法各一例，另有一例钉住带默认值时的错误 | §2.6、§4、§5；`m3-main-persona` 一步 |
| M3 「如果失败：」并进前一节 | 照改：`PARSED_LABELS` 进解析、不进门禁，改在第 9 步并随它的独立评审；写法提醒也挪到第 9 步，第 5 步不提，所以没有哪一步单独带着这个缺口；L2 加评审给的那段正文 | §2.3、§2.4、第 5、9 步 |
| M4 拷回清单不全 | 照改：每次运行一个系统临时目录；整批之后整棵树原样拷回（含 `ws/.git`），核对相对路径与字节数一致才删；只删 `pending.json` 里记着、在系统临时目录下、带前缀的路径；失败时保留并可 `--collect`。评审的可选建议（整批之后再拷回、`pending.json`）也采纳 | 第 8 步；§4、§5、§6、§9 |
| N1 `DeferredToolCall` 一例做不出来 | 照改：断言返回工具错误、文件不存在 | §2.1、第 4 步 |
| N2 rc.3 子集有 `oneOf` | 删去那一句，保留「访谈题不是图上的待决」的理由 | §10 |
| N3 §7 漏了三处 | 加 14、537、1095 三行；另加 160、804 两处字串（§2.8） | §7 |
| N4 plain-ui 版本 | 文件头写明 plain-ui 0.4 在修订、按当前草图逐字核对；黄字按草图，告诉 plain-ui；P2 的条件性要求记进 §8 第 4 条 | 文件头、§2.5、§8 |
| N5 开场画面上看不到退出 | 照改：空白会话里已是主 Agent 时开场卡片换成退出一行；L2 与 L4 截图各一项 | §2.5、第 11 步、第 12 步（b）第 6 项 |
| N6 同节合并与同文件串行 | 写明 §4.8 手工合并后在 `.worktrees/m3` 重跑门禁与探针；`tests/dialect-wiring.spec.ts` 等列进 `m3-main-persona` 的同文件串行（prompt-fixes 已并入 `wf_920936995c163f50`） | 第 11 步、`m3-main-persona` 一步 |
| N7 模拟人 `decisions` 说法不一 | §2.7 改为「`decisions` 仍只有 `{key}` 与 `'close'`；没配置时 `hourness-decision:*` 按 `pickChoice` 选」 | §2.7 |
| N8 「下一步」的步序 | 对照表每项带步号，取最小，同号按表次序；只缺 `goal:supersedes` 时不写；L2 加两例 | §2.3、第 5 步 |
| N9 `persona.name` 多行 | 去首尾空白、换行与连续空白换成一个空格、按 40 码点截断并告警一次、空时用「主 Agent」 | §2.6、§4、§5 |
| N10 写工具手写别名 | 改为按 `toNativeTool` 得到的原生名判，常量只有 `['write', 'edit']`；方言服务缺席时退到静态表 | §2.1、§4、第 3 步 |
| N11 预选说法与后缀清单 | 改为「第一项带后缀时才预选」；各处清单补 `(推荐)`，`pickChoice` 的 B 一列也认三种后缀 | §2.4、§2.2、§2.3、§2.7、第 3、5、6 步 |
| N12 第 12 步（b）问人的格式 | 把那道题按表格卡与人话写好放进附录（背景、取决于、表、结论行、推荐在最后）；人若已改卡片格式，按新格式写同样的内容 | 第 12 步（b）第 8 项 |

评审之后到达的事：

- `question-39` B：两条验收的新文字写进第 3 步与「访谈选择题」的「验收（修订后）」；§8 第 1、2 条改为已定。
- `d-plain-questions`（人在 2026-10-30 定；编排方 2026-10-29 的说明先把它当作 agent 定）：新 §2.8；身份节多出第二部分，长度上限随之改（§2.2、§10）；`decision_card` 的 `question` 改为 `background`；几处 harness 字串改成人话。编排方说明里「这也解决了 M1」：例题与换词表让模型知道该写取决于与结论行，但工具体不查就没有保证，所以 M1 仍按评审的改法做参数规则。
- `d-zcode-3171`：§2.6 末段按常量名写；`m3-main-persona` 与 `wf_920936995c163f50` 同文件串行。
- `d-option-card` 正与人重新商量：新 §2.9；第 6 步与「访谈选择题」的依赖各加一句。
