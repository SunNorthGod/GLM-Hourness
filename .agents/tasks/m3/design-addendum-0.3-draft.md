# M3 设计附录：0.4 之后的定案与实施步骤的调整

版本：0.3（2026-10-30）。回应第 2 轮独立设计评审（`reviews/addendum.json`、`reviews/addendum.md`：HIGH 1、MEDIUM 2、NIT 9），三条挡路按编排方的裁定改（2026-10-30，图上 `m3` 与 `d-main-agent-shell` 的批注，agent 定、人可推翻），并吸收评审之后的人定 `d-chat-not-cards`。`.agents/` 不进 git，0.2 原文留在同目录的 `design-addendum-0.2.md`。逐条回应见 §14，修订记录见 §13。本版改了什么：

- 一个项目一个主 Agent（H1，`d-one-main-agent`）：新 §2.4。项目就是图目录；harness 记下这个项目的主 Agent 是哪个会话；别的会话发 `/wish` 时告诉人主 Agent 在哪，`/wish here` 把它移过来，原会话由 harness 执行一次 `/wish off` 变回普通会话；`isMainAgent` 另看这份记录；面板拍板的回写只发给它。第 3、7、11 步与 L3 随之改。
- git 交给主 Agent（M1，`d-main-agent-shell` 定稿与编排方的落地细则）：git 不当写文件拦；会丢掉没提交的改动或改写历史的 git 命令，执行前 harness 先存一份能恢复的快照、记下、告诉主 Agent 怎么恢复，然后放行；只在存不了快照时拒绝。新 §2.5，落在第 4 步。
- 背景字段（M2）：待决的 `background` 字段与上限以面板设计为准（plain-ui §4.2：一行，至多 150 个码点，人定的待决必须带）；M3 写人定的待决时写这个字段，不写正文。新 §2.9。
- 卡片与问人的方式（`d-chat-not-cards`）：凡与卡片有关的部分（`decision_card`、`design_review` 的确认卡与五键卡、访谈问人的工具与接缝、例题、模拟人的选法、卡片的样子、标定的提问指标）收进新 §3，整节标为「待 `d-chat-not-cards` 细则」，不再细化；0.2 的卡片方案冻结在副本里。身份节写人定的聊天方式，不点名任何提问工具。第 6 步整步、第 8、9 步的卡片部分与「访谈选择题」一步等细则（§3.5）。
- NIT：黄字与回复里删去「子 agent 用便宜的就行」（N1）；结论行的解析与选项检查的必填参数按 plain-ui 的模块写进冻结方案的修正（N2、N4，§3.6）；换词表补齐并由 plain-ui 的检查读同一份（N3）；`choice` 的下一步不再套问句模板（N5）；两条断言改为去掉接缝那一行之后再判（N6）；§9 第 1、2 条改为已定（N7）；第 3 步 L3 列上两个 wish-idle 场景（N8）；§10 写 `d-auto-drive` 的触发点（N9）。
- 新 §12：按 `d-design-onepage` 的方向清单自查。本附录过审之后写一页人话放行稿 `.agents/tasks/m3/onepage.md`，人放行之后才进实现步骤。

依据：main `e5ac3ed`。工作树 `.worktrees/m3`、`.worktrees/m3-flow` 的基点 `eb614ab` 到 `e5ac3ed` 之间只有 `docs/graph/` 的改动（`git diff --name-only` 去掉 `docs/graph/` 为空），代码相同；3.17.1 的代码改动在运行 `wf_e48380fb20a69493`（接替 `wf_920936995c163f50`）的分支上，还没有合入。被修改的设计是 `.agents/tasks/m3/design.md` 0.4 及其 §15（D1–D6）；第 1、2 步在 main（`bf4d127`、`7aa8fe5`），推荐放最后的引擎核对在 main（`44e8601`），表格版卡片字段在 main（`e22282f`）。plain-ui 设计停在 0.4（人选 B，2026-10-30），按第 4 轮的裁定：背景字段与上限由它定，`/wish` 入口归 M3；它下一稿还要吸收 `d-one-main-agent` 与 `d-chat-not-cards`。`mockup-wish.svg`（2026-10-29 22:24）没有改动。运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准，证据写法同 0.4（「包:行」，省略 `dsh-` 前缀）；〔实读〕读过源码，〔推断〕由源码推出、未运行，未运行的接缝都列进 L3 或 L4。

本附录只写 0.4 之后变了的东西；没写到的按 0.4 做；与 0.4 冲突时以本附录为准。§3 列的部分在 `d-chat-not-cards` 的细则到达、本附录再修订之前不实施。范围同 0.4：只有设计，不改产品代码、`docs/graph/`、`~/.dsh`。

## 0. 摘要

0.4 之后定下来、改 M3 实施的事（编号与 §1 的行对应）：

1. `question-26` C：主 Agent 的工具面去掉写文件的工具，编排层包在组装时按角色去掉；guard 照旧拦 shell 写入。第 3、4 步。
2. `m3-1` 验收第 4 条：`/wish` 入口醒目，按 plain-ui §7.5 与 `mockup-wish.svg`。第 11 步。
3. `question-31` C：身份节只留角色与边界（第一部分上限 1,500 字符），访谈的问法与写图格式随阶段提醒与工具结果下发，harness 执行的规矩一句。第 3、5 步。
4. `d-plain-questions`：问人的话先交代前因后果、不用人没学过的词。换词表与背景规则进身份节（第 3 步）；例题的形状取决于 `d-chat-not-cards`，归 §3。
5. `m3-main-persona`：人设设置位只进主 Agent 的系统提示词；GLM 路由上进 Output Style 槽位并换开头句；汇报细度旋钮改名 `reportingDepth`。单独一步。
6. `d-option-card`、`d-recommend-last`：表格版卡片字段在 main。`d-chat-not-cards` 之后产品不再给人列选项，这一项的去向归 §3。
7. 主 Agent 用强一档的模型，`/wish` 的回复、入口与流程条提醒人（第 3、11 步）；子 agent 的模型由主 Agent 派活时选（`d-main-agent-models`，M7），M3 不提示人去挑子 agent 的模型。
8. `d-interview-cards`：访谈不经 DSH 的 `ask_user_question`，harness 管问人的方式。接缝 `src/design/interview.ts`，「访谈选择题」一步；它的值等 `d-chat-not-cards` 细则（§3.3）。
9. `d-one-main-agent`：一个项目恰有一个主 Agent 会话（§2.4）。第 3、7、11 步。
10. `d-main-agent-shell`：git 与命令行交给主 Agent，只有写文件被拦；会丢工作的 git 命令先存快照（§2.5）。第 4 步。
11. `d-main-agent-models`：见第 7 条。
12. `d-auto-drive`：M3 止于放行（`release`）；M7 的驱动从放行那一次写入接手（§10）。
13. `d-chat-not-cards`：问人改成聊天，不出问答卡、不列选项（§3）。
14. `d-design-onepage`：对照方向清单自查（§12）；过审后写一页放行稿，人放行之后才实施。

实施顺序按编排方定的布局：第 3、4、5、6、7、8、9、10 步，然后「访谈选择题」，然后 `m3-main-persona`，都在 `.worktrees/m3`（分支 `m3`）串行；第 11 步在 `.worktrees/m3-flow`（分支 `m3-flow`）并行，做完合入 `m3`；然后第 12 步（a）标定、（b）合入与批次 L4。独立代码评审给第 4、5、6、8、9 步与「访谈选择题」。§3.5 写了细则没到时各步哪些部分照做、哪些等着，以及给编排者的一个排序建议。

## 1. 定案与来源

| # | 事项 | 来源 | 改的 0.4 章节 | 落在哪步 |
| --- | --- | --- | --- | --- |
| 1 | 主 Agent 去掉写工具 | `question-26` C；`m3-1` 验收第 3 条 | §0、§1.2、§3.1.3「工具面」、§6.4 第 1 行 | 3、4 |
| 2 | `/wish` 入口醒目 | `question-19` 的附加要求；`m3-1` 验收第 4 条；plain-ui §7.5、§12 M3 第 4、5 条与第 4 轮裁定 P4-02；`mockup-wish.svg` | §3.6.4、§15 末段 | 11 |
| 3 | 身份节收窄 | `question-31` C；`.agents/tasks/prompt-audit/report.md` §4.2 第 4 条、§4.3 第 4 条、§7 第 9 条 | §3.1.3 的 10 项与长度上限、§3.6.2 | 3、5 |
| 4 | 问人的话说人话 | `d-plain-questions`；`.agents/tasks/design-context.md`「Questions for the person carry their background」「Plain words in questions」 | §3.1.3、§3.1.1、§6.2 的字串 | 3、9、11；例题归 §3 |
| 5 | 人设设置位与改名 | `m3-main-persona`；清点报告 §7 第 3 条、§9 Q2 | §2.1、§11「新的配置项」一句 | m3-main-persona |
| 6 | 表格版卡片 | `d-option-card`（`e22282f`）、`d-recommend-last`、`question-29` C | §3.5.1、§3.4.1、§6.3 | §3 |
| 7 | 强一档模型的提醒 | `m3` 上 2026-10-29T10:16Z 的批注；`d-main-agent-models` | §3.1.1 成功回复、§3.6.4 | 3、11 |
| 8 | 访谈不经 `ask_user_question` | `d-interview-cards`；plain-ui 评审 P3-02；`m3-1`、`m3-2` 验收第 3 条（`question-39` B） | §0、§1.2、§2.2 第 3 条、§3.1.3 第 5 条、§3.2.1、§4、§9.1.2、§9.1.3、§9.2、§9.3 第 3 项、§11 | 访谈选择题（§3） |
| 9 | 一个项目一个主 Agent | `d-one-main-agent`；编排方对 H1 的裁定 | §2.2 第 1 条、§2.3、§3.1.1、§3.1.2、§3.5.2 | 3、7、11 |
| 10 | git 交给主 Agent，会丢工作的命令先存快照 | `d-main-agent-shell`（2026-10-29T16:53Z 定稿）与 16:57Z 的落地细则 | §3.1.4、§6.4 第 1 行、§10 的残余缺口 | 4 |
| 11 | 背景字段 | plain-ui §4.2；第 4 轮裁定 P4-01；编排方对 M2 的裁定 | §3.5.1 参数 | 第一个写人定待决的步（§2.9） |
| 12 | 设计放行后主 Agent 自己推进 | `d-auto-drive` | §2.4 末段 | 不改代码（§10） |
| 13 | 问人改成聊天 | `d-chat-not-cards`（2026-10-29T17:01Z） | §3.1.3 第 7、8 项、§3.2、§3.4、§3.5.1、§9 | §3 |
| 14 | 两层循环与方向清单 | `d-design-onepage` | 无 | §12；实施之前 |

## 2. 共用的改动（与卡片无关）

### 2.1 主 Agent 的工具面（`question-26` C）

0.4 §3.1.3 的「工具面」一段作废，换成下面这段。

- 单独一个不带 `prepend` 的 `system-prompt/assemble` 监听器 `roleFace`，由 `installAgentHooks(agent)` 装、按 agent 去重、卸载函数进本行的卸载列表（同 0.4 的身份节监听器）。它在 `next()` 之后按角色改 `tools`：
  - 是主 Agent（§2.4 的 `isMainAgent`）：去掉每个原生名在 `WRITE_NATIVES = ['write', 'edit']`（`src/design/index.ts` 的常量）里的工具，原生名取 `toNativeTool(dialectService(ctx, problem), tool.name, problem)`（`src/shared/dialect.ts`，guard 用同一个函数）。`Write`、`Edit` 由方言服务或静态表 `ZCODE_ALIAS_NATIVES` 换成 `write`、`edit`（`src/shared/dialect.ts`:30–33、70–83），方言以后多一个写文件的别名时自动覆盖。`str_replace_editor` 在工具面里时，把它的参数 schema 复制一份，`properties.command.enum` 改为 `['view']`；schema 形状不对（没有 `properties.command.enum` 数组）时整个去掉这个工具，会话健康记一条「str_replace_editor 的参数形状不认识，主 Agent 的工具面里去掉了它」。rc.3 的预设与 headless 组合里没有这一行（`reference/dsh-desktop-0.2.1-rc.3/**/*.yml` 里没有 `tool-str-replace-editor`〔实读〕），这条只为装了它的组合。
  - 不是主 Agent：去掉 `DESIGN_TOOL_NAMES` 里的名字（同 0.4 §3.1.3）。这个常量随第一个设计工具出现；在那之前 `roleFace` 只有主 Agent 的一支。
  - 按角色去掉 `ask_user_question` 属于「访谈选择题」一步（§3.3）。
- 为什么不放在身份节的 `prepend` 监听器里：方言行与 guard 的声明监听器都是 `prepend`，它们在 `next()` 之后读到的工具就是要改写、要交给工具检索的那一份；本行的 `prepend` 监听器与它们谁在外层取决于各行激活的先后（0.4 §3.1.3）。cordis 的 `on` 对 `prepend` 用 `unshift`、否则 `push`（cordis:336〔实读〕），串行 waterfall 从列表头开始调用，所以不带 `prepend` 的监听器在所有 `prepend` 监听器的里层，方言与工具检索看到的已是去掉之后的工具。DSH 自己的 `system-prompt/assemble` 监听器都不改 `tools`（dsh-agent:167、dsh-working-directory:48、dsh-session-reference:459）。不同插件在同一个 agent 作用域上的监听器进同一张表是〔推断〕，L3 核对（第 3 步 `glm-design-main` 请求 3）。
- 只在工具面上去掉不是边界：rc.3 按名执行（`docs/DESIGN.md` §2.4a）。主 Agent 按名直接调用 `Write`、`write`、`Edit`，由第 4 步的 `main-agent-no-write` 在 `tools/pre-execute` 拒绝。经 `DeferredToolCall` 包一层的 `Write` 到不了执行：`Write` 在 GLM 上是常驻工具（`src/toolsearch/exposure.ts`:39），`roleFace` 去掉之后它也不在延迟目录里，`DeferredToolCall` 先报「不可用」（`src/toolsearch/index.ts`:161–164），就算在目录里也会因为是常驻名报错（:165）。
- 工具面在 `/wish`、`/wish off` 与主 Agent 移走（§2.4）的下一步各变一次。

### 2.2 身份节收窄（`question-31` C、`d-chat-not-cards`）

`MAIN_AGENT_IDENTITY`（`src/design/identity.ts`）分两部分，按这个次序拼成一节，中间一个空行。

第一部分：角色与边界，上限 1,500 字符（单测钉住，取代 0.4 的 9,000）。参考文本（英文；实现者可以改措辞，单测钉住长度与下面列的六项内容）：

```text
# Main agent
You are the main agent of this project: the human's one conversation with the project, and its project manager. You turn what the human wants into a plan on the project graph that the human approves, dispatch the work to subagents, accept it against its acceptance criteria and report back in plain words. You have no tools that write files.
The harness enforces the boundaries and its denials name the right path: shell commands that write files are denied; until the goal in your focus is released, the subagents you dispatch, and theirs, only read; the graph changes only through the graph tools. The shell and git are yours: merges, their order, conflicts and reverts are your call. Before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot and tells you how to restore it.
The design loop runs wish, interview, design, release. A stage reminder tells you where the goal in your focus stands and what is missing; tool results tell you the next step.
Talk with the human, one matter at a time: propose a few points and one plan in the design-loop form (reason, architecture, goal, plan, non-goals), say which points you decided for them and which one is most likely wrong, and name in one sentence the way you did not take; they agree, add or reject. When an answer is loose, restate it ("I'll record it as ...") before you write it to the graph with their words. Ask at the project-manager level, never about code, and never ask what you can look up.
If the human has /plan on, exit_plan_mode only leaves plan mode; it releases nothing on the graph.
```

六项：角色（这个项目唯一的主 Agent、项目经理、没有写文件的工具）；一句边界（三条会执行的规矩只点名）；git 归主 Agent 与快照一句（§2.5）；阶段与提醒；怎样和人说话（`d-chat-not-cards` 已定的那部分，原文见节点正文第一句与人的原话「你提几点和方案，我补充或者同意这种」）；`/plan` 的说明。这一段不点名任何提问工具或卡片：问人用哪个工具、放行与拍板怎样记，归 §3 的接缝。「Talk with the human」一段的字句由接缝模块 `src/design/interview.ts` 导出（常量 `TALK_GUIDE`，第 3 步建这个模块，只有这一个导出；其余导出在「访谈选择题」一步加，§3.3），身份节引用它，所以细则改了说法只改接缝一个文件。

第二部分：问人的写法，常量 `PLAIN_QUESTION_GUIDE`（`src/graph/plain-question.ts`，§2.8），上限 1,000 字符，原样引用。第 3 步的文字只有背景规则与换词表（参考文本实测见 §2.8）；`d-plain-questions` 要的那道完整例题，形状取决于 `d-chat-not-cards`（列选项的例题与聊天里的提议不是一个样子），归 §3，例题落地时加在同一个常量里，上限不变。

整节上限 2,700 字符（含「访谈选择题」一步在接缝里加的那一行 `askLine`，§3.3），单测钉住三个上限。单测另钉：整节去掉 `INTERVIEW_CHANNEL.askLine`（第 3 步还没有，按空串处理）之后，不含 `ask_user_question`、`decision_card`、`design_review`、`(Recommended)`、`(推荐)`、`（推荐）`、`depth`（N6）。

`question-31` C 的「约 1k–1.5k 字符」指角色与边界，第一部分在这个范围里；第二部分来自之后的人定 `d-plain-questions`（点名了主 Agent 身份文本），人后一个决定优先。三个上限的数是 agent 定的（§11）。

0.4 §3.1.3 第 1–10 项的去向：

| 0.4 第几项 | 去向 |
| --- | --- |
| 1 角色；「用户的人设管怎么说」 | 角色留在第一部分，改为「这个项目的主 Agent」（§2.4）；人设一句删去，人设在 Output Style 一节（§2.7） |
| 2 三问四答 | 第一部分「Talk with the human」一段用设计循环的五栏提方案；方案五栏的写图格式随设计阶段的提醒下发（§2.3） |
| 3 harness 执行的规矩 | 一句（第一部分第二段）；git 一句 |
| 4 阶段 | 一句（第三段）；各阶段做什么在阶段提醒里 |
| 5 八步访谈与提问规则 | 问句与做法移到 wish、interview 阶段的提醒（§2.3）；用词移到第二部分（§2.8）；问人用哪个工具归 §3 |
| 6 图上的写法 | 移到阶段提醒与门禁的 `hint`（`src/graph/stage.ts` 已有，main `7aa8fe5`） |
| 7 `design_review` | 归 §3（`d-chat-not-cards`：确认与放行改为聊天里人的话，放行仍是图上记下的一次人的拍板） |
| 8 决策卡 | 归 §3 |
| 9 汇报细度以 `design_review` 的 `depth` 为准 | 删去；系统提示词里汇报细度只有 GLM 包的一个来源（§2.7）。「讲细点」「说重点」怎样调细度归 §3 |
| 10 `/plan` | 留（第五段） |

### 2.3 阶段提醒承接访谈与写图格式

0.4 §3.6.2 第 3 条的正文按阶段加下面几行（英文，中文原话与标签原样）。提醒照旧只在变化时注入，所以这些文字只在阶段或缺项变了的那一步出现。

- `wish`、`interview`：
  - 一行访谈的做法：`Interview the human one matter at a time, in their words: say 怎样算做成 for acceptance, 明确不做的 for non-goals, 最可能出岔子的地方 for risks, 不能改、不能花、不能冒的险 for constraints; offer defaults from experience; write each answer to the graph as soon as you have it.`
  - 一行「下一步」。对照表是 `src/design/stage-notice.ts` 里按 `GateItem.key` 的常量，每项带访谈步号与一句「下一步」：

    | `GateItem.key` | 步号 | 「下一步」一行 |
    | --- | --- | --- |
    | `need` | 1 | `Next: ask 「你想要什么」, then <hint>.` |
    | `problem` | 2 | `Next: ask 「做成以后，你的日子会有什么不一样」, then <hint>.` |
    | `audience` | 2 | 同 `problem` |
    | `acceptance` | 3 | `Next: ask 「你会怎么检查它真的做成了」, then <hint>.` |
    | `non-goals` | 4 | `Next: ask 「有没有你明确不想要的」 and offer a few guesses, then <hint>.` |
    | `constraints` | 5 | `Next: ask 「有没有不能改、不能花、不能冒的险」, then <hint>.` |
    | `risks` | 6 | `Next: ask 「假如最后没做成，最可能是因为什么」 and offer three guesses, then <hint>.` |
    | `choice` | 7 | `Next: settle the one fork only the human can decide: write it as a question under the goal, talk it through with them and record their answer with their words; a question you decide on your own does not count.` |

    问句取 `docs/ORCHESTRATION.md` §4.2 表的原文。`choice` 一行不套「ask 「<问句>」」的模板（N5：§4.2 第 7 步的那一格是描述，不是问人的话），也不写怎样列选项（`d-chat-not-cards`）。「下一步」取缺项里步号最小的一项，步号相同按上表次序（`problem` 在 `audience` 之前）；`requirementCard` 的数组次序（约束排在成功之前，`src/graph/stage.ts`:121–143）不用来排序。缺项只有 `goal:supersedes` 时不写「下一步」一行，只写它的 `label` 与 `hint`。
  - 其余缺项各一行（`label` 与 `hint`，同 0.4）。
- `design`：一行写图格式：`Write each design decision with "理由：", "架构：" and "查过的现成方案：" lines in its body, acceptance and nonGoals; plan features and tasks under the goal with a source edge to the decision, every task with acceptance.` 事前验尸一行（`如果失败：`）在第 9 步加，与它的解析同一步。
- 怎样把方案交给人、放行怎样记，归 §3：这一步的提醒不点名 `design_review`、`decision_card` 或任何提问工具。
- `stage.ts` 里两条今天就点名卡片工具的 `hint` 改成不点名的说法（第 5 步）：`choice` 的「ask the human with decision_card」改为 `interview step 7 (the fork only the human can decide): a question under the goal, decided by the human in the panel or relayed from the chat with their words; a question the agent decided on its own does not count`；放行门禁里人定待决未拍板的「or ask them with decision_card」改为 `wait for their decision in the panel, or settle it with them in the chat and record it with graph_decide and their words as relay`。两条都与 main 上的判定一致：`lastDecidedByHuman` 认人在面板上的拍板与带原话的转述（`src/graph/stage.ts`:112–115）。
- 单测钉住：所有阶段的正文去掉 `INTERVIEW_CHANNEL.askLine` 之后都不含 `ask_user_question`、`decision_card`、`design_review`、`(Recommended)`、`(推荐)`、`（推荐）`（N6）。

### 2.4 一个项目一个主 Agent（`d-one-main-agent`，H1）

`d-one-main-agent`（人定）：每个项目恰有一个主 Agent 会话，人只在这里和项目对话；已有主 Agent 时在别的会话发 `/wish`，告诉人主 Agent 在哪个会话，并可以把它移到当前会话，原会话变回普通会话；细节由编排方定、人可推翻。0.4 §2.3「一个工作区可以有多个主 Agent 会话」与 §2.3「用户 fork 的会话仍是主 Agent」作废。下面的细节记进 §11。

项目与持有者记录：

- 项目就是图目录。键 `projectKey(dir)`：`fs.realpathSync.native(dir)`，失败时退回 `path.resolve(dir)`；`\` 换成 `/`，去掉末尾的 `/`，`process.platform === 'win32'` 时转小写。与 0.4 §3.5.2 的 `sameDir` 同一套规整，`sameDir(a, b)` 改为 `projectKey(a) === projectKey(b)`。会话的图目录取图行服务的 `dirFor(session.header.cwd)`（同 0.4 §3.5.2 的理由）；`projectKey` 按会话缓存（`WeakMap<SessionLike, string>`，会话目录不变）。同一个仓库的两个工作树各有自己的 `docs/graph/`，算两个项目；图行的 `dir` 配成绝对路径时所有会话共用一张图，算一个项目。
- 持有者记录：`<userHome>/main-agent/<sha256(projectKey) 的前 16 个十六进制字符>.json`，内容 `{version: 1, sessionId, graphDir, since, commandId}`。`userHome` 取数据服务的 `userHome`，数据行不在时取 `userDataHome()`（`src/shared/data-home.ts`，与渠道行的 `credentialHome` 同一个退路）。不放在项目目录（`projectHome`，评审建议的位置）：数据行的 `projectHome` 是一个配置值，桌面版上所有工作区共用它（`src/data/index.ts`:20、31），放在那里会让不同项目共用一个主 Agent；它也可能没配置。会话 id 是这台机器上 DSH 主目录里的东西，记录跟着它放在用户级目录。
- 模块 `src/graph/main-agent-holder.ts`（宿主专用，用 `node:fs`、`node:crypto`；放在图目录，因为面板行 `src/graph/panel-row.ts` 也要读它，依赖方向是设计目录 → 图目录）：`projectKey`、`holderFile(userHome, key)`、`readHolder(file): {kind: 'none'} | {kind: 'held', record} | {kind: 'unreadable', reason}`、`claimHolder(file, record)`（独占新建：先写同目录临时文件，再 `fs.linkSync(临时, 目标)`，目标已存在时 `EEXIST`，最后删临时文件）、`replaceHolder(file, record)`（临时文件加 `renameSync`）、`releaseHolder(file, sessionId)`（读出来仍指向这个会话才删）、`mainAgentOf(userHome, dir)`（给 M5、M7 的晨报、周报与巡检提醒用，M3 只导出）。`readHolder` 同步，按文件的 `mtimeMs` 与 `size` 缓存，没变就不重读。

谁是主 Agent（取代 0.4 §2.3 第 3 条与 §3.1.2 `isMainAgent` 的读法）：`isMainAgent(agent)` 先按 0.4 判（不是委派子会话，且待生效状态或投影为真）；为真时再读这个会话所在项目的持有者记录：

| 记录 | 结果 |
| --- | --- |
| `held`，`sessionId` 等于本会话 | 是主 Agent |
| `held`，指向别的会话 | 不是（投影为真只是还没对齐，见下面的「对齐」） |
| `none` 或 `unreadable` | 只按投影判；行健康 degraded「主 Agent 的持有者记录读不到（<原因>）：在主 Agent 会话里再发一次 /wish」 |
| 会话没有图目录（`dirFor` 为 `undefined`） | 只按投影判（这种会话发不出 `/wish`，0.4 §3.1.1「图目录不存在」一行） |

`/wish` 的处理（0.4 §3.1.1 的表在「图目录不存在」一行之后改为下面几行；之前的几行与长度检查不变；`input.hint` 改为 `off | here | 一句话`；描述改为「让这个会话的 agent 当这个项目的主 Agent（项目经理）：按项目图推进，不写文件；后面跟一句话就从许愿开始；here 把主 Agent 从别的会话移过来；/wish off 退出」）：

| 输入 | 记录 | 结果 | 对 agent |
| --- | --- | --- | --- |
| `off` | 指向本会话 | 删记录（`releaseHolder`），其余同 0.4「`off` 且是主 Agent」 | 同 0.4 |
| `off` | 指向别的会话，本会话投影为真 | success「主 Agent 在另一个会话里，这个会话已经变回普通会话」 | `inject` 一条 notice：这个项目的主 Agent 移到了别的会话，这个会话的 agent 从下一步起是普通 agent，可以直接写文件 |
| `off` | 其余 | 同 0.4 | 同 0.4 |
| 空或一句话 | `held` 指向别的会话，且那个会话活着（`agents.get(id)` 有值）或还存着（`sessionPersistence.list()` 里有它；这个服务不在或抛错时当作还存着） | success「这个项目的主 Agent 在另一个会话里（<since 的本地时间> 开始，会话「<标题>」，id <id><；现在没有打开>）。要把它移到这里，输入 /wish here，那个会话会变回普通会话。」一句话时另加「你这句话还没交给它；移过来之后再说一遍」 | 无；本会话的角色不变，不写待生效状态 |
| 空或一句话 | `held` 指向的会话已经不存在（`sessionPersistence.list()` 读得到且没有它） | `replaceHolder` 改为本会话，然后同 0.4 的「空」或「一句话」，回复开头加「原来的主 Agent 会话已经不在了，」 | 同 0.4 |
| 空或一句话 | `none` | `claimHolder`；`EEXIST`（别的会话刚抢先）时重读，按「指向别的会话」一行回复；成功后同 0.4 | 同 0.4 |
| 空或一句话 | `held` 指向本会话 | 同 0.4（「已是主 Agent」或许愿） | 同 0.4 |
| 空或一句话 | `unreadable` | `replaceHolder` 改为本会话，回复开头加「原来的主 Agent 记录读不到（<原因>），已改为这个会话；」，然后同 0.4，并做一次「对齐」 | 同 0.4 |
| `here` | 指向别的会话 | `replaceHolder` 改为本会话，做一次「对齐」，然后同 0.4 的「空」；success「主 Agent 已从另一个会话移到这里；那个会话变回普通会话」 | 同 0.4 的「空」 |
| `here` | 其余 | 同「空」 | 同「空」 |

写记录在写待生效状态之前；写失败（磁盘错误、权限）时返回 error「主 Agent 的持有者记录写不了：<原因>」，不开启，不写待生效状态。标题取 `sessionProjections.stateOf(session, 'title')`（session-title 注册的投影键 `title`，dsh-session-title:173〔实读〕），读不到时不写标题；`sessionPersistence` 是 JSONL 后端注册的服务（dsh-session-persistence-jsonl:2398〔实读〕），`list()` 返回存着的每个会话的 `header`（:2603–2652〔实读〕），`src/shared/dsh-min.ts` 加薄类型 `SessionPersistenceLike { list(options?): Promise<readonly { header: { id: string } }[]> }`。

对齐（让「投影为真」与记录一致）：

- `demoteOthers(key, except)`：取 `agents.roots()`（0.4 §3.5.2 加的成员），留下 `projectKey` 等于 `key`、投影为真、不是 `except` 的会话，对每个执行 `commands.execute(它的 agent, '/wish off', [], AbortSignal.timeout(10_000))`（dsh-commands:327–339〔实读〕：先追加 `command/run`，`source` 固定为 `{kind: 'user'}`）。它们的 `/wish off` 走上表第二行，投影随之为假，流程条、开场卡片与「主 Agent」按钮都只读投影，所以跟着变。在 `/wish here`、`/wish` 覆盖读不到的记录之后各调一次。
- `agent/created`（不是委派子会话、投影为真、记录 `held` 且指向别的会话）：同样执行一次 `/wish off`。这覆盖两种情形：移走时没有打开的原会话，下次打开时对齐；人 fork 了主 Agent 会话，新会话继承了命令事件、投影为真，它不是持有者，创建时就变回普通会话（0.4 §2.3「fork 的会话仍是主 Agent」作废）。
- 执行失败（agent 已释放、超时、命令没注册）时告警一次，行健康 degraded「没能让会话 <id> 退出主 Agent：<原因>」。这时那个会话的投影仍为真，但 `isMainAgent` 读记录判它不是，身份节、写入规则与工具面都按普通会话；只有它的流程条与按钮显示得不对，直到下一次对齐。
- 残余：两个会话几乎同时 `/wish here` 时后写的一方胜，`demoteOthers` 按各自读到的会话执行，可能有一个会话投影仍为真而不是持有者；执行边界照记录判，显示不对的那个会话下次 `agent/created` 时对齐。

其他读法随之改：

- 面板拍板的回写（0.4 §3.5.2，第 7 步）：候选只有持有者一个会话（`readHolder(holderFile(userHome, projectKey(dir)))` 给 `sessionId`，`agents.get` 取活 agent），再按条件 B（投影为真）、D（焦点在这个目标下）判；条件 C（同一张图）由记录按被写的图目录取得天然满足。记录读不到时退回 0.4 的四条件扫描，结果行注明「（持有者记录读不到，按会话逐个判）」。持有者不活时不发消息，它打开后的每步投影里已是新的状态。
- 子 agent 的设计期只读（`design-before-release`，0.4 §3.3.3）照旧按 `isMainAgent(root)` 判。主 Agent 移走之后，原会话派出、还在跑的子 agent 的根不再是主 Agent，规则不再适用：原会话已是普通会话，它的子 agent 与普通会话的子 agent 一样。这一点写进 `/wish here` 的回复：「那个会话派出去还在跑的子 agent 从现在起按普通会话的规矩」。
- 客户端不读记录：流程条、`WishCard`、`WishPill` 照旧只读投影（§2.6）。普通会话里点「交给主 Agent」执行 `/wish`，已有主 Agent 时由命令的回复指路。
- 晨报、周报与巡检由 harness 到点提醒这个会话（`d-one-main-agent` 后半）属于 M5、M7（§10）；M3 只保证同一时刻至多一个会话是主 Agent，并导出 `mainAgentOf`。
- 身份节第一句改为「the main agent of this project」（§2.2）。

### 2.5 git 交给主 Agent，会丢工作的命令先存快照（`d-main-agent-shell`，M1）

`d-main-agent-shell`（人定，2026-10-29T16:53Z 定稿）：主 Agent 能任意使用命令行与 git，唯一的限制是没有写文件的工具，shell 里写文件的命令由 guard 兜底，git 命令不在此列；harness 只守主干前进的那一刻（`norm-merge-gate`，M7 的 m7-5）。编排方的落地细则（16:57Z，agent 定、可推翻）：不拦 git，但会丢掉没提交的改动或改写已推送历史的命令执行前，harness 先存一份能恢复的快照并记下，再放行，人或主 Agent 都能从快照恢复。依据 `d-failure-plans`：失败要能恢复、能追溯。M3 只对主 Agent 自己的 shell 调用做这件事；子 agent 的 git 属于 M7 的派发（§10）。主干前进的核对不在 M3。

识别（`src/guard/git-snapshot.ts`，新文件；`src/guard/shell.ts` 加一个导出）：

- `simpleCommands(command, dialect): readonly (readonly string[])[]`（`shell.ts`）：每个简单命令在命令位置之后的词（去掉引号之后的文字），跳过变量赋值前缀与包装命令，并按 `shellWrites` 的同一条规则进入 `bash -c`、`pwsh -Command`、`find -exec` 与子表达式。引号里的文字不是命令，所以 `echo "git reset --hard"` 不算。
- 一个简单命令的命令名（同 `commandName`：最后一段路径、小写、去 `.exe`）是 `git` 时是一次 git 调用。跳过全局选项：`-C <路径>`（可以多个，依次相对解析）、`-c <k=v>`、`--git-dir[=]`、`--work-tree[=]`、`--namespace[=]`、`--no-pager`、`-p`、`--paginate`、`--bare`、`--no-replace-objects`、`--literal-pathspecs`、`--no-optional-locks`；第一个不是全局选项的词是子命令。
- 仓库目录：`-C` 给的路径，相对于会话的工作目录（`baseFor`，同 guard 的写入目标）。同一行里 git 之前有 `cd`、`Set-Location`、`sl`、`chdir`、`pushd` 时，参数是字面路径就按它解析；不是字面路径（含 `$`、`%`、反引号）时拒绝，正路是「用 `git -C <字面路径>` 或单独一次调用」，因为 harness 认不出要在哪个仓库存快照。
- `gitRisk(sub, args): 'discard' | 'history' | 'both' | undefined`：
  - `discard`（可能丢掉工作区或暂存区里没提交的东西）：`checkout`、`switch`、`restore`（都不论参数：工作区干净时快照什么都不存，代价只是几次 git 调用）；`reset` 带 `--hard`、`--merge`、`--keep`；`clean`（不带 `-n`、`--dry-run`）；`stash drop`、`stash clear`；`rm` 带 `-f`、`--force`；`merge`、`rebase`、`cherry-pick`、`revert`、`am` 带 `--abort`；`worktree remove`。
  - `history`（移动或删除引用，只靠它可达的提交会丢）：`reset`（任何模式）；`rebase`（不带 `--abort`）；`commit --amend`；`branch` 带 `-D`、`-d`、`--delete`、`-M`、`-m`、`--move`、`-C`、`-f`、`--force`；`tag` 带 `-d`、`--delete`、`-f`、`--force`；`update-ref`；`push` 带 `-f`、`--force`、`--force-with-lease`、`--force-if-includes`、`-d`、`--delete`、`--mirror`、`--prune`，或有以 `+` 或 `:` 开头的 refspec；`filter-branch`、`filter-repo`、`replace`；`reflog expire`、`reflog delete`；`gc` 带 `--prune`；`prune`；`stash drop`、`stash clear`（暂存条目也是引用）；`remote remove`、`remote rm`。
  - 两类都有时为 `both`；子命令或参数里有 `$`、`%`、反引号时为 `both`。
  - 子命令不在上面、也不是已知的只读或无损命令（`status`、`log`、`diff`、`show`、`blame`、`grep`、`fetch`、`add`、`commit`、`init`、`clone`、`ls-files`、`rev-parse`、`describe`、`shortlog`、`config`、`remote`、`notes`、`bisect`、`branch`、`tag`、`merge`、`pull`、`cherry-pick`、`revert`、`am`、`stash push|list|show|apply|create|store|branch`、`worktree list|add`、`switch -c`……完整表是 `git-snapshot.ts` 的常量）时，读一次 `git config --get alias.<子命令>`：是 `!` 开头的别名为 `both`，是普通别名时按展开后的文字再判一层，都不是时不存快照。
  - 不认的情形（脚本里调用 git、git 钩子、`read-tree -u` 一类底层命令）是残余，记在 §10。

快照（`takeSnapshot(repo, invocation, risk)`）。全部 git 调用用 `execFile('git', args, {cwd: repo, timeout})`，不经 shell，参数是数组，所以命令文字里的引号与特殊字符不会被再解释；整个快照的期限 30 秒。

1. `git rev-parse --git-common-dir --show-toplevel`。不是仓库（退出码 128）时不存快照、放行（git 自己会失败）。找不到 git（`ENOENT`）时放行，行健康 degraded「找不到 git，快照跳过」。
2. `discard`：`git stash create` 得到 `S`（已跟踪文件与暂存区的改动，暂存格式，不动工作区；工作区干净时为空）。合并冲突没解决时 `stash create` 会失败（暂存区有未合并的条目）；这时退一步，用临时暂存区 `git read-tree HEAD`、`git add -u`、`git write-tree`，再 `git commit-tree <树> -p HEAD` 得到 `W`，存的是工作区里已跟踪文件的当前内容（冲突标记也在内），恢复用 `git restore --source=<W> --worktree -- <路径>`；冲突的三方版本不存（`merge --abort` 之后本来就没了，记在 §10）。这样主 Agent 处理冲突时的 `merge --abort`、`checkout --theirs` 不会因为存不了快照被拒。`clean` 另把要删的文件存下：用同样的参数去掉 `-f`、`--force`、`-i`、`--interactive` 再加 `-n` 跑一次，读出「Would remove <路径>」的列表 `L`；`L` 的总大小超过 200 MB 或超过 20,000 个文件时拒绝（下面的失败一行）；否则用临时暂存区（`GIT_INDEX_FILE=<git-common-dir>/hourness/tmp-index-<id>`）`git read-tree --empty`，`git add -f -- <L>`（每次 100 个路径），`git write-tree` 得到树 `T`，删掉临时暂存区。`worktree remove` 对被删的工作树做同样两件（`git -C <那个工作树> stash create` 与 `clean -n -d -x` 的列表）。
3. `history`：`git for-each-ref --format=%(refname)%00%(objectname)%00%(*objectname)` 读 `refs/heads`、`refs/tags`、`refs/remotes`、`refs/stash`；`refs/stash` 存在时 `git log -g --format=%H refs/stash` 读出全部暂存条目；`git rev-parse HEAD` 与 `git symbolic-ref -q HEAD`。`push` 另把远端当前的状态取回：目标分支是 refspec 的目标，没写 refspec 时取 `@{push}`，`--all`、`--mirror` 时取全部分支；对每个 `git fetch --no-tags <远端> +<分支>:refs/hourness/snapshots/<id>/remote/<分支>`；远端没有这个分支时跳过；取不回来（网络、权限）时拒绝。
4. 一个快照提交 `K`：树是 `T`（没有时用 `git mktree` 读空输入得到的空树），父提交是 `HEAD`、`S`、各引用指向的提交（附注标签取它指向的提交）与暂存条目，去重。父提交超过 200 个时先每 200 个做一个中间提交，`K` 以这些中间提交为父（Windows 的命令行长度上限约 32,000 字符）。提交说明是人话的摘要加一段 JSON：快照 id、时间、会话 id、原命令、类别、每个引用当时的值、`S`、`T` 与恢复办法（超过 64 KB 时 JSON 只写在下面的记录里）。
5. `git update-ref refs/hourness/snapshots/<id> <K>`，`<id>` 为 UTC 时间 `yyyymmddThhmmssZ` 加 4 位随机十六进制。
6. 记录：在 `<git-common-dir>/hourness/snapshots.jsonl` 追加一行 `{id, at, sessionId, agentId, command, subcommand, risk, ref, head: {sha, branch?}, stash?: S, files?: {tree: T, count}, refs: [{name, sha}], remote?: [{remote, branch, ref}], restore: string[]}`。放在仓库的 git 目录里：跟着仓库走、不进版本库，`refs/hourness/snapshots/` 就在旁边。写记录失败时快照引用已在，仍可恢复：放行，行健康 degraded「快照 <id> 已存，记录没写上：<原因>」。
7. 告诉主 Agent：`inject` 一条 notice（来源 `glm-git-snapshot`，下一步收到）：`[git 快照] 执行「<命令>」之前存了快照 <id>（refs/hourness/snapshots/<id>）。要撤回：` 后接适用的几行：没提交的改动 `git stash apply <S>`；删掉的文件 `git restore --source=<K> --worktree -- <路径>`（或 `.` 全部）；被移动或删除的分支与引用 `git update-ref <引用> <原值>`、`git branch <名字> <原值>`；被删的暂存条目 `git stash store -m "<说明>" <sha>`；远端 `git push --force-with-lease <远端> refs/hourness/snapshots/<id>/remote/<分支>:<分支>`。恢复全部是 git 命令，主 Agent 自己能做，不用写文件的工具。
8. `next()`，命令照常执行。

拒绝（只有存不了快照的时候）：第 1 步之外任何一步失败或超时，或 `clean` 超过上限、`push` 取不回远端、`cd` 的目标认不出时，在 `tools/pre-execute` 拒绝，规则 id `git-snapshot`，进违规流水；纠偏四段：事实 `The harness could not save a snapshot before "<command>": <原因>.`；越界 `Git commands that can lose uncommitted work or rewrite history run after the harness has saved a copy it can restore.`；正路按原因给：`Narrow the git clean so it removes less than 200 MB`、`Retry when the remote is reachable`、`Run git with -C <literal path>`、其余 `Retry; if it fails again, tell the human the reason`；例外 `The human can run the command in their own terminal.`。这是对 git 唯一的拒绝，理由与上限记在 §11。

不做：快照不自动清理（`refs/hourness/snapshots/*` 与记录留到人删，`git for-each-ref refs/hourness/snapshots` 列出全部）；不另做恢复命令；ignored 文件只在 `clean -x`、`-X` 与 `worktree remove` 时存（`checkout -f` 不碰它们）。见 §10。

### 2.6 `/wish` 入口与强一档模型的提醒（`m3-1` 验收第 4 条）

按 plain-ui §7.5.2–§7.5.5 与 `mockup-wish.svg` 场景 ①–⑤，M3 只做其中属于 `/wish` 的部分（plain-ui 第 4 轮裁定 P4-02：`/wish` 入口以 M3 为准）；上手页、「第一次用？」一行、没有项目图时的卡片、面板首页里的一句属于 plain-ui。全部在编排层客户端包 `dsh-hourness-ui`，第 11 步。这里的「卡片」是 DSH 开场画面上的停靠组件，不是问人的问答卡，不受 `d-chat-not-cards` 影响。

- 开场卡片 `WishCard`：`ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({name: 'conversation.input.dock', id: 'hourness-wish', order: 40, label: '交给主 Agent', inject: (sessionId) => ({ sessionId })}, WishCard))`，外层 `ctx.effect` 同流程条。这个槽在开场画面里位于工作区行与输入框之间（conversation client.js:17901–17907）。组件每次渲染判断，按下面三种情形之一显示，都不成立时返回 `null`：
  1. 完整卡片：会话是空白的（标准 prop `useSession` 的 `blank` 为真、`promptAttempted` 与 `running` 为假；拿不到时退到 `sessions.list` 的 `byId[sessionId].blank`）；本会话不是主 Agent（`mainAgentActive(values)` 为假）；有项目图（`holdSource`）且 `/wish` 已注册（`remote.commands.list(sessionId)` 里有 `wish`，每个会话读一次，失败时会话快照变化后再读一次）。文字照 `mockup-wish.svg` ①，只改黄字：标题「把这个工作区交给主 Agent」；正文「说一句你想做的。主 Agent 先问清楚、出方案给你批，再分给子 agent 去做；它自己不写代码。」；主按钮「写一句你想做的」；次按钮「接着推进现有项目」（图上有未关闭的目标时）；黄字带图标「主 Agent 用强一点的模型」（N1：后半句「子 agent 用便宜的就行」删去，子 agent 的模型由主 Agent 派活时选，`d-main-agent-models`）；灰字「命令是 /wish，随时 /wish off 退出。」
  2. 一行：会话仍是空白的、有项目图，而本会话已是主 Agent。这是人点了「接着推进现有项目」之后的样子：`/wish` 不带话时只 `inject`、不开回合，会话可能仍停在开场画面（conversation client.js:17378–17379、17608–17610），而 `conversation.composer.dock` 只在非开场画面渲染（:19343–19344）。这时卡片换成一行「这个会话的 agent 是主 Agent」与按钮「退出主 Agent（/wish off）」。人发出第一句话后会话不再空白，这一行消失，退出方式由输入框下方的「主 Agent」按钮接手。
  3. 其余情形不显示。
  已有主 Agent 在别的会话时，新会话照样显示完整卡片；点了之后由 `/wish` 的回复说主 Agent 在哪、怎样移过来（§2.4）。客户端不读持有者记录。
- 黄字不带模型名：plain-ui 0.4 正文 §7.5.2 写「（如 GLM-5.3）」，草图没有括号。按草图：编排层包对所有模型生效，不点名某个模型（`hourness` 目标的非目标「不含任何模型的方言」）。
- 输入框下方的按钮 `WishPill`：`conversation.composer.dock`，id `hourness-wish`，order 160。普通会话、有项目图、`/wish` 已注册时写「交给主 Agent」，点开小弹层（`mockup-wish.svg` ②：一句说明、命令、黄字「主 Agent 用强一点的模型」、两个按钮）；主 Agent 会话里写「主 Agent」，点开「这个会话的 agent 是这个项目的主 Agent：按项目图推进，不写文件。进度在右边的项目图里。」与「退出主 Agent（/wish off）」。那一排窄于 520 px（`closest('[data-composer-dock]')` 的宽度，`ResizeObserver`）时「交给主 Agent」写「/wish」，「主 Agent」不变。
- 按钮做什么（plain-ui §7.5.3）：「写一句你想做的」在输入框为空时经标准 prop `inputActions.setDraft` 写入 `/wish ` 并聚焦，输入框有字时不改并提示「输入框里还有没发出的字」；拿不到 `inputActions` 或 `useInput` 时不执行命令，换成一行「在输入框打 /wish，后面跟一句你想做的」与「复制 /wish」（`writeClipboard`）。「接着推进现有项目」与「退出主 Agent」经 `remote.commands.execute` 执行 `/wish`、`/wish off`，都是人的点击。
- 流程条：order 由 0.4 的 20 改为 30（DSH 排队条是 20，conversation client.js:17269，plain-ui §12 M3 第 5 条），开场卡片 40。`flowBarText` 多一个输入 `cheapModel: boolean`：主 Agent 最近一步的模型（`graphLive` 的 `model`，`src/graph/live.ts`:41）属于便宜档时，末尾另起一行黄字「现在是 <模型>；主 Agent 建议换强一点的模型」与「这次就用它」（按会话记在内存里，收起到重载为止）。便宜档按 plain-ui §7.5.5：模型 id 转小写，按 `[-_./:\s]` 切词，有一个词是 `flash`、`mini`、`lite`、`haiku`、`small`、`nano` 之一；认不出的不提醒。纯函数 `isCheapModel(id)` 放在 `ui/src/flow/model.ts`。0.4 的「主 Agent · 读不到阶段（现场投影未注册）」改为「主 Agent · 读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用）」（§2.8）。
- `/wish` 的成功回复（0.4 §3.1.1 表里「已让这个会话的 agent 当主 Agent…」两行与 §2.4 的 `here`、接管几行）末尾加「主 Agent 建议用强一点的模型」。第 3 步。
- `docs/ORCHESTRATION.md` §3.5 补两句（第 3 步）：主 Agent 用强一档的模型，在 `/wish` 的回复、入口与流程条上提醒人，插件不替人换模型（`docs/CHARTER.md` §6）；子 agent 的模型由主 Agent 派活时选并记理由（`d-main-agent-models`，M7）。
- 没有项目图的工作区里，M3 的入口什么都不显示（`/wish` 在那里报「还没有项目图」）。`m3-1` 验收第 4 条在有项目图的工作区里核对；没有图时的说明卡属于 plain-ui 的引导（§7.8）。

### 2.7 人设设置位与汇报细度改名（`m3-main-persona`）

与 0.2 §2.6 相同，只有「主 Agent」按 §2.4 判。全文照录如下，免得读两份。

设置位：

- 设计行（`glm-hourness/design`）的配置加一项（0.4 §2.1「设计行只有与图行同形的 `home`、`fs`」改为加上 `persona`）：`persona: {name: string, text: string}`，`name` 默认「主 Agent」，`text` 默认空串。Schema 经 `src/shared/schemastery.ts` 写，插件管理器里能改（验收第 3 条）；`text` 用多行文本框，写法（`role` 一类的注解，`src/shared/schemastery.ts`:466）在实现时按本仓库那份子集核对〔推断〕，L4 截图。
- 插件只给设置位，`text` 是用户自己的配置（`docs/CHARTER.md` 非目标「人设与个人习惯不进插件」）。
- `name` 的规整：去掉首尾空白，内部的换行与连续空白换成一个空格，然后按 40 码点截断；截断时告警一次（行日志），规整后为空时用「主 Agent」。`text`：去掉首尾空白后为空就不加这一节；超过 4,000 码点时不加，行健康 degraded「人设超过 4000 字符，没有加」。

注入：

- 公共库新文件 `src/shared/output-style.ts`，只放契约常量 `OUTPUT_STYLE_SECTION = 'hourness:output-style'` 与说明（两个包都编进去，同 `tool-names.ts`、`dialect.ts`）。
- 设计行的 `roleFace`（§2.1，不带 `prepend`，在里层）在本步是主 Agent、`persona.text` 非空时，在 `sections` 末尾追加一节 `{name: OUTPUT_STYLE_SECTION, text, interpolate: false}`，`text` 为 `# Output Style: <name>`、空行、用户的文字、空行，再加插件自己的一句范围说明：`This style applies to your replies to the human only. Text you put into tool calls (graph nodes, briefs for subagents) and anything written to files stays plain.` 标题写法取 ZCode 的 Output Style 节（`docs/reference/zcode-capabilities.md` §11.4），实现时对照 `reference/zcode-3.17.1/zcode.cjs` 核对，写进 `docs/reference/zcode-verbatim.md`。
- 不是主 Agent 的会话（普通会话、子会话、审查者、主 Agent 移走之后的原会话）没有这一节。只给主 Agent 的理由：主 Agent 没有写工具（§2.1），人设的话落不进代码与注释；普通会话直接写代码，人设会落进文件（`m3-main-persona` 正文）。
- GLM 路由（GLM 包，`src/glm-prompt/assembly.ts` `rewriteDialectSections`）：本次组装的 `sections` 里有 `OUTPUT_STYLE_SECTION` 一节时，身份节用 `buildIdentitySection(true, …)`（开头句 `IDENTITY_OPENING_WITH_STYLE`，`src/glm-prompt/verbatim.ts`:15，已在逐字门禁里，`scripts/check-verbatim.mjs`:237），并把这一节移到 `glm:context-management` 之前（ZCode 的次序是 Environment、Output Style、Context management，`docs/reference/zcode-capabilities.md`:374）；方言节里没有 `glm:context-management`（start-plan 档）时，放在最后一个方言节之后。没有这一节时与今天一样。`installDialect` 今天在安装时算一次 `sections`（`src/glm-prompt/index.ts`:184），改为两份身份节（有无风格）都在安装时算好，按组装时有没有这一节选一份。
- 其他路由：这一节原样留在 `roleFace` 追加的位置，不换开头句。
- 子 agent 不带：`isMainAgent` 对 `origin: 'subagent'` 为假。子 agent 写的文件里不出现人设用语（验收第 2 条）在提示词层面由此保证；模型行为在 L4 用标记词核对（第 12 步（b））。用户自己 `~/.dsh/AGENTS.md` 里的人设所有 agent 都读得到，那是用户配置，插件不动。

改名：

- GLM 包 `glm-prompt` 行的配置 `persona`（汇报细度，`concise`、`balanced`、`detailed`）改名 `reportingDepth`；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts`，`PERSONA_LEVELS`、`PersonaLevel`、`personaSection`、`PERSONA_SECTION_NAME`、`isPersonaLevel` 改为 `REPORTING_DEPTHS`、`ReportingDepth`、`reportingDepthSection`、`REPORTING_DEPTH_SECTION`、`isReportingDepth`；节名 `glm:persona` 改为 `glm:reporting-depth`；`GlmPromptConfig` 与 `dialectSections` 的参数同改。模型看到的文字（`# Reporting Depth` 一节的正文）一个字不改。
- 旧配置照读：用户桌面版 profile 的 `glm-prompt` 行今天写着 `persona: balanced`（`~/.dsh/profiles/desktop/cordis.patch.yml`:57〔实读，只读〕），本仓库不改用户 profile。cordis 在激活前用插件导出的 `Config` 规整配置（cordis lib/index.js:956–961、:1631〔实读〕）；本仓库的 schemastery 在值缺席时填默认值（`src/shared/schemastery.ts`:535–544），对象只留有值或原本就有的键（:814–823）。所以：
  - Schema 里 `reportingDepth` 与已弃用的 `persona` 都不带默认值（`reportingDepth` 的说明写「缺省为 balanced」，`persona` 的说明写「已改名为 reportingDepth，只为读旧配置」）；规整之后哪个键在，就是用户写了哪个键。
  - `apply` 取 `config.reportingDepth ?? config.persona ?? 'balanced'`。
  - 只有 `persona` 时告警一次「glm-prompt 的 persona 已改名为 reportingDepth，这次按旧键生效」，行健康说明写同一句；两者都有且不同时用 `reportingDepth`，告警一次「persona 与 reportingDepth 不同，按 reportingDepth」；两者都有且相同时不告警，行健康说明写「旧键 persona 可以删掉」；两者都没有时不告警。
  - 插件管理器里不带默认值的单选框怎样显示〔推断〕，L4 截图（第 12 步（b）第 8 项）。
- `tests/profile-shape.spec.ts` 里的 `persona:` 是 YAML 解析的夹具，不改。
- 汇报细度并进 Output Style、子 agent 不带汇报细度（清点报告 Q2 C 后半、Q5 B）改所有 GLM 会话的提示词，不在 `m3-main-persona` 的验收里，本次不做（§9 第 3 条）。

ZCode 基线 3.17.1（`d-zcode-3171`）：3.17.1 改写了两种身份开头句，`IDENTITY_OPENING_WITH_STYLE` 的文字会变，由 `zcode-3171-follow` 改。本节只按常量名写（`IDENTITY_OPENING_WITH_STYLE`、`IDENTITY_OPENING_PLAIN`、`buildIdentitySection`），L2 也按常量比对。两条分支都改 `src/glm-prompt/`，后合入的一方 rebase（第 `m3-main-persona` 步的依赖）。

### 2.8 问人的话说人话：换词表（`d-plain-questions`）

人读不懂问题里的「验收」「标定」「补遗」「改写验收语句」（2026-10-29），并要求每道题先交代前因后果。`d-plain-questions` 定：给人的问题不用人没学过的词；凡是让模型给人写题的地方放一道完整的好题与换词表；harness 的写法检查在问题字段里查这些词。M3 管其中的身份文本与 harness 自己写给人看的字串。`d-chat-not-cards` 之后「题」变成聊天里的提议，背景与人话照旧适用；例题的样子归 §3。

一处定义：新模块 `src/graph/plain-question.ts`（纯文字与纯函数，不用 Node 内置模块；放在图目录，因为图工具的说明与 plain-ui 的写法检查也要用它）。谁先合入谁建，另一方导入：plain-ui 的 `jargon` 规则（plain-ui §4.3，`src/graph/plain.ts`）从这里读 `PLAIN_WORDS`，不另写一份（N3）。

- `PLAIN_WORDS`：换词表，按 plain-ui §4.3 `jargon` 的词补齐，五项：

  | `avoid` | `say` |
  | --- | --- |
  | `验收`、`acceptance` | 怎样算做完（目标一级说「怎样算做成」，与需求卡的「成功（怎样算做成）」一致） |
  | `标定`、`calibration` | 练习题（固定的几道小项目，系统自己做一遍、由脚本代人回答，用来查改动有没有把系统改坏） |
  | `门禁`、`gate` | 合入前的检查 |
  | `投影`、`projection` | 每一步给 agent 的项目摘要 |
  | `补遗`、`附录`、`addendum` | 说清它是什么 |

- `PLAIN_QUESTION_GUIDE`：由 `PLAIN_WORDS` 生成的英文说明，上限 1,000 字符（含 §3 将来加的例题）。第 3 步的参考文本（实测见 §14 末的核对）：

```text
Whatever you put to the human, a question or a proposal, is in plain words and opens with its background: two or three sentences on which part of the work it is about, where it came from and why the human, not you, decides it.
Plain words for the human: 怎样算做完 (for a goal: 怎样算做成), not 验收 or acceptance; 练习题, not 标定 or calibration (fixed small projects the system runs by itself to check nothing broke); 合入前的检查, not 门禁 or gate; 每一步给 agent 的项目摘要, not 投影 or projection; never 补遗, 附录 or addendum: say what the document is.
```

- `PLAIN_QUESTION_EXAMPLE`：归 §3。0.2 的例题是一张列选项的表格卡（背景、取决于、两个选项、结论行），与 `d-chat-not-cards` 的「不列选项」相反，不在第 3 步建；细则到了按聊天的样子写一道（背景、几点、一个方案、替人定了哪几处、最可能错的一处、没选的做法一句），加进 `PLAIN_QUESTION_GUIDE`。
- `plainWordsIn(text): string[]`：返回 `text` 里出现的 `avoid` 词（中文按子串，英文按词边界、不分大小写）。用处：各步的单测查 harness 写给人看的字串；第 12 步（a）在标定里数给人的文字里出现的次数；plain-ui 的写法检查直接调用。

落在哪里：

| 位置 | 内容 | 步 |
| --- | --- | --- |
| `src/graph/plain-question.ts` 与 `tests/plain-question.spec.ts` | `PLAIN_WORDS`、`PLAIN_QUESTION_GUIDE`、`plainWordsIn`；单测：说明不超过 1,000 字符、含五个 `say` 与每个 `avoid`；`plainWordsIn` 的中文子串、英文词边界（`gateway` 不算 `gate`）、大小写 | 3 |
| 身份节第二部分 | 原样引用（§2.2） | 3 |
| `/wish` 的回复、错误与行健康说明 | 0.4 §3.1.1「主 Agent 模式要用会话投影服务，这个组合里没有」改为「主 Agent 模式要用 DSH 的会话状态服务（sessionProjections），这个组合里没有」；0.4 §6.2 的 degraded「主 Agent 模式要会话投影服务」改为「主 Agent 模式要会话状态服务（sessionProjections）」；§2.4 新增的几句 | 3 |
| 五栏门禁的标签（`src/graph/stage.ts`） | `目标（验收条件）` 改为 `目标（怎样算做成）`；`任务「<标题>」的验收条件` 改为 `任务「<标题>」怎样算做完` | 9 |
| 流程条 | 「读不到阶段（现场投影未注册）」改写（§2.6） | 11 |
| 标定指标 | 给人的文字里 `plainWordsIn` 命中的次数 | 12（a） |

各步的单测对 harness 写给人看的字串（回复、错误、行健康说明、notice、按钮与流程条的固定文字）调 `plainWordsIn`，结果为空。模型写给人的文字 M3 不在运行时拦：拦截属于 plain-ui 的写法检查，M3 在标定里数。

### 2.9 待决的背景字段（M2）

编排方的裁定（2026-10-30，按 plain-ui 第 4 轮 P4-01）：问题的背景字段与上限由 plain-ui 定，M3 照用。plain-ui §4.2：待决节点的新字段 `background`，两三句人话，非空白、不含换行、不超过 `PLAIN_LIMITS.background`（150）个码点；决定者是人的待决必须带（plain-ui 的检查第一阶段警告、第二阶段拒绝）；写出顺序紧跟 `title`；面板只读这个字段，不从正文拆（plain-ui §3.8.1）。

M3 的规则（与卡片格式无关，`d-chat-not-cards` 之后人定的事仍是图上的待决，节点正文写道「项目图上要人定的事仍是待决节点」）：

- M3 的代码凡是以工具参数写一张人定的待决（0.2 里是 `decision_card` 与 `ask_human`，§3 定它们的去留），把背景写进 `background` 字段，不写进 `body`；长度与形状只读 `PLAIN_LIMITS.background`，不另设数值；形状不合时工具返回 `invalid`，`field: 'background'`，`hint` 写「one line of at most <PLAIN_LIMITS.background> code points: which part of the work, where it came from, why the human decides」。
- 字段由引擎认：今天引擎拒绝未知字段（`src/graph/format.ts`:90–92）。plain-ui 第 1 步加这个字段；M3 第一个写人定待决的步先于它合入时，由 M3 那一步按 plain-ui §4.2 加：`schema.ts` 的 `GraphNode.background?: string` 与 `PLAIN_LIMITS = { title: 40, why: 80, background: 150 }`（放在 `CARD_LIMITS` 旁），`format.ts` 只在 `type: 'question'` 上接受它（一行、长度、写出顺序紧跟 `title`），不加 plain-ui 的分阶段检查。plain-ui 后合入时直接用这两处；P4-01 若改了数值，M3 跟着读常量。
- 例题与说明里的背景写法同一条规则（§2.8、§3）。

## 3. 卡片与问人的方式（整节待 `d-chat-not-cards` 细则）

本节收齐 M3 里与问答卡、选项列表有关的全部内容。`d-chat-not-cards` 的细则还在和人商量（编排方 2026-10-30 的通知：不再细化卡片格式，相关部分收在一处）。细则到达之后本附录再修订一次本节，修订过审之前本节列的工作不实施。

### 3.1 人定了什么，还在商量什么

已定（`d-chat-not-cards`，人在 2026-10-29T17:01Z 定，原话「我是要改产品的，而且聊天不仅是不给问答卡，是连选项都没有的那种，就彻底回归到我们的设计循环那里。你提几点和方案，我补充或者同意这种。」）：产品里主 Agent 与人的交流不出问答卡、不列 A/B/C；agent 按设计循环的四答加非目标提几点和一个方案，写明替人定了哪几处、最可能不对的是哪一处、没选的做法一句话；人同意、补充或否掉；人随口回答时 agent 复述一句「那我记成……」再记图，图上存人的原话。M3 已经照做的：身份节「Talk with the human」一段（§2.2）、阶段提醒不点名提问工具（§2.3）、`choice` 的下一步与两条 `hint` 不点名卡片工具（§2.3）。

编排方的落地方案（节点正文，待人补充），本节按它标出影响，不替人定：

1. 问答卡与选项相关的决定改写或作废：`d-option-card`、`d-recommend-last`、`d-interview-cards`（访谈改为聊天，主 Agent 仍不带 `ask_user_question`）、`d-inertia-breaker`。
2. 要人定的事仍是待决节点，存方案原文、人的原话与结论，不再要求 `options`、`recommend`、`crux`、`verdict`、`weight`、`gain`、`cost`（`e22282f` 的引擎字段改为不用于人定的题）。
3. 五键变成人在聊天里会说的五种话，不做按钮；设计放行仍是图上一次人的拍板，由主 Agent 带人的原话记下。
4. 面板只看不操作（`d-ui-look-not-operate`），「需要你」列出在等人回话的方案，点开跳到主 Agent 的对话。
5. 跟随率改为统计人原样同意、补充与否掉的比例，进指标流水（`metrics`）。

### 3.2 受影响的清单

| 项 | 0.4 / 0.2 的位置 | 落在哪步 | 细则之前 |
| --- | --- | --- | --- |
| `decision_card`（同步决策卡：参数、卡面、回答解析、关掉转异步） | 0.4 §3.5.1；0.2 §2.4 | 6 | 整步等 |
| `design_review` 的确认卡（访谈一支：需求卡渲染进卡片、确认即以人的身份批准目标并改阶段） | 0.4 §3.2.3、§3.4.4；0.2 第 8 步 | 8 | 卡片与工具等；需求卡 8 项的门禁已在 main（`requirementCard`） |
| `design_review` 的五键卡（放行、拒绝、补充、讲细点、说重点；`depth`；放行集合以人的身份批准） | 0.4 §3.4.1–§3.4.3；0.2 第 9 步 | 9 | 卡片与工具等；放行门禁已在 main（`releaseGate`），第 9 步的解析修正照做 |
| 卡片回答以人的身份写图（`src/design/human-writes.ts`，D3） | 0.4 §3.4.3 | 6、8、9 | 等；`d-chat-not-cards` 第 3 条要「由主 Agent 带人的原话记下」，可能改为经已有的 `relay` 写入，不再需要新的人的身份入口 |
| 访谈问人的工具与接缝（`ask_human`、去掉 `ask_user_question`、`main-agent-ask-card` 兜底） | 0.2 §2.7 | 访谈选择题 | 等（§3.3） |
| 例题 `PLAIN_QUESTION_EXAMPLE` | 0.2 §2.8 | 3（文字）、访谈选择题 | 等；第 3 步只建换词表（§2.8） |
| 卡片的样子收在哪（`cards.ts` 的 `choiceDetail` 等） | 0.2 §2.9 | 6、访谈选择题 | 等 |
| 选项规则的共用模块 `src/graph/card-rules.ts` | 0.2 §2.7 | 访谈选择题 | 等；第 2 条若落地，人定的题不再要选项字段，这个模块可能不需要 |
| 模拟人的选法（确认卡、五键卡、决策卡、访谈题） | 0.4 §9.1.2；0.2 §2.7、第 6 步 | 6、8、访谈选择题、12（a） | 等；聊天时模拟人要在主 Agent 的回合结束后回一句话，是另一种做法 |
| 标定的提问指标（提问次数、带选项的比例）与 `HUMAN_TOOLS` | 0.4 §9.2；0.2 第 8 步、访谈选择题 | 8、12（a） | 等；第 5 条改为同意、补充、否掉的比例 |
| 五键卡上显示「如果失败，最可能是因为」 | 0.2 §2.4 末条 | 9 | 等；解析修正照做（第 9 步） |
| 第 12 步（b）L4 第 3 项（卡片的样子）与第 1 项里的卡片工具名 | 0.4 §9.3；0.2 第 12 步（b） | 12（b） | 等 |
| `m3-1` 第 3 条、`m3-2` 第 2、3 条、`m3-3` 第 1、3 条、`m3-4` 全部、`m3-5` 第 1 条、`m3-6` 第 2 条的「卡」「卡片」字样 | 图上的验收 | — | 改验收要问人（§9 第 2 条） |
| 面板拍板的回写（第 7 步） | 0.4 §3.5.2 | 7 | 照做：今天的面板能拍板，回写只发给持有者（§2.4）；第 4 条若改成面板只看，这一步随之缩小 |

### 3.3 接缝：`src/design/interview.ts`（P3-02）

主 Agent 怎样把要问的事交给人、怎样对待 DSH 的 `ask_user_question`、模拟人对这类问题怎样回答，都只从这一个模块读。第 3 步建这个模块，只导出 `TALK_GUIDE`（§2.2 第一部分「Talk with the human」一段，`d-chat-not-cards` 已定的部分）；下面的其余导出在「访谈选择题」一步加：

```ts
export const TALK_GUIDE: string                     // 第 3 步
export interface InterviewChannel {                  // 访谈选择题
  /** 主 Agent 问人用的工具名；在回复里直接说时为 null */
  readonly askTool: string | null
  /** 组装时按角色从主 Agent 的工具面去掉的提问工具 */
  readonly hiddenFromMainAgent: readonly string[]
  /** 身份节、阶段提醒与工具结果说「怎么问人、怎么记」的那一句（英文） */
  readonly askLine: string
}
export const INTERVIEW_CHANNEL: InterviewChannel
/** 模拟人对一次问人的回答（标定与探针用）；输入是卡片请求或主 Agent 回合末的文字 */
export function simulatedReply(request: SimulatedRequest, graph: GraphLookup): SimulatedAnswer
```

谁读它：设计行的 `roleFace`（`hiddenFromMainAgent`）；身份节、阶段提醒与工具结果（`TALK_GUIDE`、`askLine`）；提问工具本身（`askTool`）；模拟人（`scripts/calibrate/simulated-human.mjs`，从 `packages/hourness/dist/design/interview.js` 导入 `simulatedReply`，同 `run-probe.mjs` 从 `dist/` 导入的做法）；标定与探针的场景核对（`askTool`、`hiddenFromMainAgent`）。

三种做法在接缝上的样子：

| | A（`d-interview-cards`，P3-02 里的 A） | B（P3-02 里的 B，人已否掉） | C（`d-chat-not-cards` 的方向） |
| --- | --- | --- | --- |
| `askTool` | `ask_human`：harness 经 `userQuestions.ask` 出卡，推荐在最后、不加后缀 | `ask_user_question`：模型自己写选项 | `null`：主 Agent 在回复里提方案，人在输入框回话 |
| `hiddenFromMainAgent` | `['ask_user_question']` | `[]` | `['ask_user_question']`（落地方案第 1 条） |
| `askLine` | 用 `ask_human`，照例题写 | 推荐放最后、不加 `(Recommended)`，承认与 DSH 工具说明相反（tool-ask-user:94、250） | 怎样把人的回话记进图：带原话 `relay`，人随口说时先复述一句 |
| 模拟人 | 待决卡选图上的推荐，访谈卡选最后一项 | 选带推荐后缀的一项，没有就选最后一项 | 主 Agent 回合结束、没有工具调用在等人时，按场景回一句话（默认「同意」；场景可写补充或否掉的话） |
| 违反怎样被发现 | 卡片由 harness 写，参数规则在工具体里执行；按名调用 `ask_user_question` 被兜底规则拒绝并进违规流水 | 标定与 L3 数推荐不在最后、带后缀的次数 | 按名调用 `ask_user_question` 被兜底规则拒绝；标定数主 Agent 一次回复里问了几件事、有没有先复述 |

本附录不在这三种之间做选择：A 是 `d-interview-cards` 的定法，C 是之后的人定 `d-chat-not-cards` 指的方向，细则会说 A 留下多少。三种都只改这个模块与「访谈选择题」一步的文件（提问工具、兜底规则、模拟人），之前各步不动。

### 3.4 不论细则怎样都成立的约束（第 3–10 步）

- 不写死「推荐放第一」或 `(Recommended)`、`(推荐)`、`（推荐）`；身份节、阶段提醒与工具结果不点名提问工具与卡片工具（§2.2、§2.3 的单测）。
- 不写死模拟人对任何问人请求的选法：第 3–10 步里模拟人只有按场景写死的回答；遇到没配置的问题以 `ASK_CANCELLED` 拒绝，并在 `human.jsonl` 写一条 `{kind: 'unexpected-question', id}`，不按任何规则选。
- 按角色从主 Agent 的工具面去掉 `ask_user_question` 只在「访谈选择题」一步做（A 与 C 都要去掉；B 不去）。在那之前，主 Agent 的工具面里还有它；身份节不提它。
- 人定的待决写 `background` 字段（§2.9）。

### 3.5 等细则期间各步怎么走

| 步 | 照做的部分 | 等细则的部分 |
| --- | --- | --- |
| 3 | 全部（身份节、`roleFace` 去写工具、`/wish` 与持有者、换词表、接缝模块只有 `TALK_GUIDE`） | 无 |
| 4 | 全部（`main-agent-no-write`、git 快照） | 无 |
| 5 | 全部（阶段提醒、两条 `hint`、`design-before-release`） | 无 |
| 6 | 无 | 整步（`decision_card`） |
| 7 | 全部（回写只发给持有者） | 若面板改为只看，回写缩小（§3.2 末行） |
| 8 | 8a：标定运行目录与仓库隔离（`scripts/calibrate/run-dir.mjs`）、标定任务目录（题面与验收脚本）、运行器的 `interview` 种类与 `limits` | 8b：`design_review` 的访谈一支、`task.json` 的 `human` 配置、`HUMAN_TOOLS` 与提问指标 |
| 9 | 9a：`PARSED_LABELS` 解析修正、门禁标签改人话、设计阶段提醒加「如果失败」写法一行 | 9b：五键卡、放行一支、五键卡上的「如果失败」显示 |
| 10 | 全部（去掉 L1/L2/L3） | 无 |
| 访谈选择题 | 无 | 整步 |
| m3-main-persona | 全部 | 无 |
| 11 | 全部 | 无 |
| 12（a） | 运行器与隔离 | 标定要等 8b、9b 与访谈选择题都落地（它量的是整个设计循环） |
| 12（b） | 第 1 项的写工具部分、第 6 项、第 8 项 | 第 1 项的卡片工具、第 3 项 |

给编排者的排序建议（布局是编排者定的，这里只说依据）：第 6 步整步等细则；第 7、10 步与第 6 步不碰同一个文件（第 6 步新建 `src/design/decision-card.ts`、`src/design/cards.ts`，第 7 步改 `src/graph/panel-row.ts`，第 10 步改 `src/workflow/` 与晨报），所以细则没到时可以先做 7、10，再做 8a、9a，细则到了再做 6、8b、9b 与访谈选择题。第 8、9 步拆开之后各自的独立评审照旧，各做两次（a、b 各一次）。

### 3.6 0.2 的卡片方案：冻结，与第 2 轮发现的处理

0.2 §2.4（表格版 `decision_card`）、§2.7（`ask_human` 与接缝 A）、§2.9（卡片的样子收在哪）原文在 `design-addendum-0.2.md`，冻结：细则若保留卡片，就从这三节出发修订；细则若改成聊天，它们作废。第 2 轮评审里落在这几节上的发现这样处理：

- M2（背景的形状与存法）：不只关卡片，改成通用规则，见 §2.9；冻结方案里「`background` 至多 600 码点、可以多行、写进正文」作废。
- N2（结论行的解析会被挪两次）：冻结方案修正为：`card-rules.ts` 不定义结论行的解析；`src/graph/verdict.ts` 不存在时，按 plain-ui §4.2 的签名 `verdictMarks(verdict): readonly {key, index, length}[]` 建它，引擎改用 `verdictMarks(v).map(m => m.key)`，`card-rules.ts` 从它导入；已存在时直接导入。
- N4（选项检查要带「必填」参数）：冻结方案修正为 `optionTextRefusal(option, subject, at, {required: boolean})`，引擎传 `true`，`ask_human` 只在带推荐的单选题上传 `true`；`label` 的一行检查留在 `askHumanRefusal` 里，引擎的错误文字不变。
- N5、N6：不只关卡片，已在 §2.3、§2.2 改。
- 落地方案第 2 条若落地（人定的题不再要选项字段），引擎 `questionRefusal` 的改动属于改写 `d-option-card` 的那件事，不在 M3；冻结方案里依赖这些字段的规则随之去掉。

<!-- CONTINUE -->
