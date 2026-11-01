# M3 设计附录：0.4 之后的定案与实施步骤的调整

版本：0.3（2026-10-30）。回应第 2 轮独立设计评审（`reviews/addendum.json`、`reviews/addendum.md`：HIGH 1、MEDIUM 2、NIT 9），三条挡路按编排方的裁定改（图上 `m3` 2026-10-29T16:57Z 的批注与 `d-main-agent-shell` 16:57Z 的落地细则，agent 定、人可推翻）；并按人定 `d-chat-not-cards`（2026-10-29T17:01Z 定，格式在 17:27Z 定稿）把主 Agent 问人的方式整体改成聊天。`.agents/` 不进 git：0.2 原文在 `design-addendum-0.2.md`；上一次运行写到 §3 中途停下的 0.3 草稿在 `design-addendum-0.3-draft.md`，本版取代它。逐条回应见 §14，修订记录见 §13。本版改了什么：

- 一个项目一个主 Agent（H1，`d-one-main-agent`）：§2.4。项目就是图目录；harness 在用户级目录记下这个项目的主 Agent 是哪个会话；别的会话发 `/wish` 时告诉人主 Agent 在哪，`/wish here` 把它移过来，原会话由 harness 执行一次 `/wish off` 变回普通会话；`isMainAgent` 另看这份记录；面板拍板的回写只发给它。第 3、7、11 步与 L3 随之改。
- git 交给主 Agent（M1，`d-main-agent-shell` 定稿与落地细则）：§2.5。git 不当写文件拦；会丢掉没提交的改动或改写历史的 git 命令，执行前 harness 先存快照（`git stash create` 等存下改动，引用放在 `refs/hourness/snapshots/<id>`；改写历史时另打标签 `hourness-snapshot/<id>`）、记进流水、告诉主 Agent 怎么恢复，然后放行；只在存不了快照时拒绝。主干前进时按 `norm-merge-gate` 核对属于 M7 的 `m7-5`，M3 不做（§10）。第 4 步。
- 背景字段（M2）：§2.9。待决的 `background` 字段与上限以面板设计为准（plain-ui §4.2：一行，至多 150 个码点，人定的待决必须带）；M3 写人定的待决时写这个字段。
- 问人改成聊天（`d-chat-not-cards`）：§3。去掉 `decision_card`、`design_review` 的确认卡与五键卡、访谈的 `ask_human`，以及卡片的构造、以人的身份写图的模块与选项规则模块。换成两个工具：`propose_to_human` 把一件事按四行（背景、推荐、疑问、不做，每行重点几个字加粗）交给人，`record_human_answer` 把人在对话里的回话带原话记进图；harness 核对这段原话确实是人在提议之后发来的。图引擎多认一种「提议式待决」（没有选项，存四行与结论）。访谈改成对话：要什么的事先问一两句开放的问题，其余出一个方案。五键变成人会说的五种话。主 Agent 仍不带 `ask_user_question`。第 3、5、6、8、9 步与第 12 步。
- `d-main-agent-models`：黄字与回复删去「子 agent 用便宜的就行」（N1）；M3 没有派活工具，子 agent 的模型由 M7 的派发让主 Agent 选（§2.6、§9 第 7 条）。
- `d-auto-drive`：M3 止于放行；放行那一次写入的样子写明，M7 的驱动从它接手（§9 第 7 条）。
- 其余 NIT：换词表补齐并由 plain-ui 的检查读同一份（N3）；`choice` 的下一步不再套问句模板（N5）；§9 第 1、2 条改为已定（N7）；第 3 步 L3 列上两个 wish-idle 场景（N8）。N2、N4、N6 落在被去掉的卡片代码上，不再适用（§14）。
- 新 §12：按 `d-design-onepage` 的方向清单自查。本附录过审之后写一页人话放行稿 `.agents/tasks/m3/onepage.md`，人放行之后才进实现。

依据：main `4d2edb7`。工作树 `.worktrees/m3`、`.worktrees/m3-flow` 都在 `eb614ab`，两条分支没有自己的提交；`eb614ab..4d2edb7` 除 `docs/graph/` 外只有一个代码提交 `6134c83`（m8-row-titles）：宿主行改用包的子路径命名（`dsh-hourness/<行>`），每行在 `packages/hourness/locale/<行>/` 有设置页标题，客户端行改名为 `dsh-hourness`，`scripts/packages.mjs`、`scripts/probe/probe-llm.mjs`、`scripts/probe/run-probe.mjs`、`ui/src/hourness-client.tsx` 都改过。所以实施的第一件事是把两个工作树快进到 main（第 3 步）。3.17.1 的代码改动在运行 `wf_e48380fb20a69493`（接替 `wf_920936995c163f50`）的分支上，开工时核对是否已合入。被修改的设计是 `.agents/tasks/m3/design.md` 0.4 及其 §15（D1–D6）；第 1、2 步在 main（`bf4d127`、`7aa8fe5`），推荐放最后的引擎核对在 main（`44e8601`），表格版卡片字段在 main（`e22282f`）。plain-ui 设计停在 0.4（文件 2026-10-30 00:29），按第 4 轮的裁定：背景字段与上限由它定，`/wish` 入口归 M3；它下一稿还要吸收 `d-one-main-agent` 与 `d-chat-not-cards`，本附录 §9 第 5 条写了 M3 给它的契约。`mockup-wish.svg`（2026-10-29 22:24）没有改动。运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准，证据写法同 0.4（「包:行」，省略 `dsh-` 前缀）；〔实读〕读过源码，〔推断〕由源码推出、未运行，未运行的接缝都列进 L3 或 L4。

本附录只写 0.4 之后变了的东西；没写到的按 0.4 做；与 0.4 冲突时以本附录为准。范围同 0.4：只有设计，不改产品代码、`docs/graph/`、`~/.dsh`。

## 0. 摘要

0.4 之后定下来、改 M3 实施的事（编号与 §1 的行对应）：

1. `question-26` C：主 Agent 的工具面去掉写文件的工具，编排层包在组装时按角色去掉；guard 照旧拦 shell 写入。第 3、4 步。
2. `m3-1` 验收第 4 条：`/wish` 入口醒目，按 plain-ui §7.5 与 `mockup-wish.svg`。第 11 步。
3. `question-31` C：身份节第一部分只留角色与边界（上限 1,500 字符）；访谈的问法与写图格式随阶段提醒与工具结果下发；harness 执行的规矩一句。第 3、5 步。
4. `d-plain-questions`：问人的话说人话。换词表与人给的那道四行例题只定义一次，进身份节与 `propose_to_human` 的说明。第 3、6 步。
5. `m3-main-persona`：人设设置位只进主 Agent 的系统提示词；GLM 路由上进 Output Style 槽位并换开头句；汇报细度旋钮改名 `reportingDepth`。单独一步。
6. `d-option-card`、`d-recommend-last`：给人看的选项卡与「推荐放最后」随 `d-chat-not-cards` 不再出现在主 Agent 与人之间；引擎里已合入的表格字段照旧用于 agent 自己定的题（§3.3）。
7. 主 Agent 用强一档的模型，`/wish` 的回复、入口与流程条提醒人；子 agent 的模型由主 Agent 派活时选（`d-main-agent-models`，M7）。第 3、11 步。
8. `d-interview-cards`：访谈不经 DSH 的 `ask_user_question`，这一条留下；「harness 出卡」一半随 `d-chat-not-cards` 作废，访谈是对话。第 3、4 步。
9. `d-one-main-agent`：一个项目恰有一个主 Agent 会话（§2.4）。第 3、7、11 步。
10. `d-main-agent-shell`：git 与命令行交给主 Agent，只有写文件被拦；会丢工作的 git 命令先存快照（§2.5）。第 4 步。
11. `d-main-agent-models`：见第 7 条。
12. `d-auto-drive`：M3 止于放行；M7 的驱动从放行那一次写入接手（§9 第 7 条）。
13. `d-chat-not-cards`：问人改成聊天（§3）。第 3、5、6、8、9、12 步。
14. `d-design-onepage`：对照方向清单自查（§12）；过审后写一页放行稿，人放行之后才实施。

实施顺序按编排方定的布局：先把两个工作树快进到 main；第 3、4、5、6、7、8、9、10 步，然后 `m3-main-persona`，都在 `.worktrees/m3`（分支 `m3`）串行；第 11 步在 `.worktrees/m3-flow`（分支 `m3-flow`）并行，做完合入 `m3`；然后第 12 步（a）标定、（b）合入与批次 L4。0.2 的「访谈选择题」一步取消，它剩下的内容（去掉 `ask_user_question` 与兜底规则、模拟人）并进第 3、4、8 步。独立代码评审给第 4、5、6、8、9 步。

## 1. 定案与来源

| # | 事项 | 来源 | 改的 0.4 章节 | 落在哪步 |
| --- | --- | --- | --- | --- |
| 1 | 主 Agent 去掉写工具 | `question-26` C；`m3-1` 验收第 3 条 | §0、§1.2、§3.1.3「工具面」、§6.4 第 1 行 | 3、4 |
| 2 | `/wish` 入口醒目 | `question-19` 的附加要求；`m3-1` 验收第 4 条；plain-ui §7.5、§12 M3 第 4、5 条与第 4 轮裁定 P4-02；`mockup-wish.svg` | §3.6.4、§15 末段 | 11 |
| 3 | 身份节收窄 | `question-31` C；`.agents/tasks/prompt-audit/report.md` §4.2 第 4 条、§4.3 第 4 条、§7 第 9 条 | §3.1.3 的 10 项与长度上限、§3.6.2 | 3、5 |
| 4 | 问人的话说人话 | `d-plain-questions`；`.agents/tasks/design-context.md`「Questions for the person carry their background」「Plain words in questions」 | §3.1.3、§3.1.1、§6.2 的字串 | 3、6、9、11 |
| 5 | 人设设置位与改名 | `m3-main-persona`；清点报告 §7 第 3 条、§9 Q2 | §2.1、§11「新的配置项」一句 | m3-main-persona |
| 6 | 选项卡与推荐放最后 | `d-option-card`（`e22282f`）、`d-recommend-last`、`question-29` C；随 `d-chat-not-cards` 第一点改写 | §3.5.1、§3.4.1、§6.3 | §3；事前验尸一行在第 9 步 |
| 7 | 强一档模型的提醒 | `m3` 上 2026-10-29T10:16Z 的批注；`d-main-agent-models` | §3.1.1 成功回复、§3.6.4 | 3、11 |
| 8 | 访谈不经 `ask_user_question` | `d-interview-cards`；plain-ui 评审 P3-02；`d-chat-not-cards` 第一点（「访谈改为聊天，主 Agent 仍不带 ask_user_question」） | §0、§1.2、§2.2 第 3 条、§3.1.3 第 5 条、§3.2.1、§4、§9.1.2、§9.1.3、§9.2、§9.3 第 3 项、§11 | 3、4、8 |
| 9 | 一个项目一个主 Agent | `d-one-main-agent`；编排方对 H1 的裁定 | §2.2 第 1 条、§2.3、§3.1.1、§3.1.2、§3.5.2 | 3、7、11 |
| 10 | git 交给主 Agent，会丢工作的命令先存快照 | `d-main-agent-shell`（2026-10-29T16:53Z 定稿）与 16:57Z 的落地细则 | §3.1.4、§6.4 第 1 行、§10 的残余缺口 | 4 |
| 11 | 背景字段 | plain-ui §4.2；第 4 轮裁定 P4-01；编排方对 M2 的裁定 | §3.5.1 参数 | 6（§2.9） |
| 12 | 设计放行后主 Agent 自己推进 | `d-auto-drive` | §2.4 末段 | 不改代码（§9 第 7 条） |
| 13 | 问人改成聊天 | `d-chat-not-cards`（17:01Z 定；17:08Z 人对五点落地方案说「没问题」；17:16Z 定「要什么、做成什么样的事先问一两句开放的问题」；17:27Z 格式定稿） | §2.2、§3.1.3 第 5、7、8、9 项、§3.2、§3.4、§3.5、§9 | 3、5、6、8、9、12 |
| 14 | 两层循环与方向清单 | `d-design-onepage` | 无 | §12；实施之前 |

## 2. 共用的改动

### 2.1 主 Agent 的工具面（`question-26` C）

0.4 §3.1.3 的「工具面」一段作废，换成下面这段。

- 单独一个不带 `prepend` 的 `system-prompt/assemble` 监听器 `roleFace`，由 `installAgentHooks(agent)` 装、按 agent 去重、卸载函数进本行的卸载列表（同 0.4 的身份节监听器）。它在 `next()` 之后按角色改 `tools`：
  - 是主 Agent（§2.4 的 `isMainAgent`）：去掉每个原生名在 `WRITE_NATIVES = ['write', 'edit']`（`src/design/index.ts` 的常量）里的工具，原生名取 `toNativeTool(dialectService(ctx, problem), tool.name, problem)`（`src/shared/dialect.ts`，guard 用同一个函数）。`Write`、`Edit` 由方言服务或静态表 `ZCODE_ALIAS_NATIVES` 换成 `write`、`edit`（`src/shared/dialect.ts`:30–33、70–83），方言以后多一个写文件的别名时自动覆盖。再去掉名字在 `HIDDEN_FROM_MAIN_AGENT = ['ask_user_question']`（`src/design/talk.ts`，§3.2）里的工具。`str_replace_editor` 在工具面里时，把它的参数 schema 复制一份，`properties.command.enum` 改为 `['view']`；schema 形状不对（没有 `properties.command.enum` 数组）时整个去掉这个工具，会话健康记一条「str_replace_editor 的参数形状不认识，主 Agent 的工具面里去掉了它」。rc.3 的预设与 headless 组合里没有这一行（`reference/dsh-desktop-0.2.1-rc.3/**/*.yml` 里没有 `tool-str-replace-editor`〔实读〕），这条只为装了它的组合。
  - 不是主 Agent：去掉 `DESIGN_TOOL_NAMES` 里的名字（`propose_to_human`、`record_human_answer`，§3.4、§3.5）。这个常量随第 6 步出现；在那之前 `roleFace` 只有主 Agent 的一支。
- 为什么不放在身份节的 `prepend` 监听器里：方言行与 guard 的声明监听器都是 `prepend`，它们在 `next()` 之后读到的工具就是要改写、要交给工具检索的那一份；本行的 `prepend` 监听器与它们谁在外层取决于各行激活的先后（0.4 §3.1.3）。cordis 的 `on` 对 `prepend` 用 `unshift`、否则 `push`（cordis:336〔实读〕），串行 waterfall 从列表头开始调用，所以不带 `prepend` 的监听器在所有 `prepend` 监听器的里层，方言与工具检索看到的已是去掉之后的工具。DSH 自己的 `system-prompt/assemble` 监听器都不改 `tools`（dsh-agent:167、dsh-working-directory:48、dsh-session-reference:459）。不同插件在同一个 agent 作用域上的监听器进同一张表是〔推断〕，L3 核对（第 3 步 `glm-design-main` 请求 3）。
- 只在工具面上去掉不是边界：rc.3 按名执行（`docs/DESIGN.md` §2.4a）。主 Agent 按名直接调用 `Write`、`write`、`Edit`，由第 4 步的 `main-agent-no-write` 在 `tools/pre-execute` 拒绝；按名调用 `ask_user_question` 由第 4 步的 `main-agent-ask` 拒绝。经 `DeferredToolCall` 包一层的 `Write` 到不了执行：`Write` 在 GLM 上是常驻工具（`src/toolsearch/exposure.ts`:39），`roleFace` 去掉之后它也不在延迟目录里，`DeferredToolCall` 先报「不可用」（`src/toolsearch/index.ts`:161–164），就算在目录里也会因为是常驻名报错（:165）。
- 工具面在 `/wish`、`/wish off` 与主 Agent 移走（§2.4）的下一步各变一次。

### 2.2 身份节（`question-31` C、`d-chat-not-cards`、`d-plain-questions`）

`MAIN_AGENT_IDENTITY`（`src/design/identity.ts`）分两部分，按这个次序拼成一节，中间一个空行。参考文本是英文的指令，对人说的话与标签用中文原文；实现者可以改措辞，单测钉住长度与下面列的内容。

第一部分：角色与边界，上限 1,500 字符（参考文本实测 1,117；取代 0.4 的 9,000）：

```text
# Main agent
You are the main agent of this project: the human's one conversation with the project, and its project manager. You turn what the human wants into a plan on the project graph that the human approves, dispatch the work to subagents, accept it against its acceptance criteria and report back in plain words. You have no tools that write files.
The harness enforces the boundaries and its denials name the right path: shell commands that write files are denied; until the goal in your focus is released, the subagents you dispatch, and theirs, only read; the graph changes only through the graph tools, and words you relay as the human's must be in a message they sent. The shell and git are yours; before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot and tells you how to restore it.
The design loop runs wish, interview, design, release. A stage reminder tells you where the goal in your focus stands and what is missing; tool results tell you the next step.
If the human has /plan on, exit_plan_mode only leaves plan mode; it releases nothing on the graph.
```

五项：角色（这个项目唯一的主 Agent、项目经理、没有写文件的工具）；一句边界（会执行的规矩只点名，含转述的原话要在人发来的消息里，§3.6）；git 归主 Agent 与快照一句（§2.5）；阶段与提醒；`/plan` 的说明。

第二部分：怎样和人说话，上限 1,400 字符（参考文本实测 1,258），由两个常量依次拼成、中间换行：

- `TALK_GUIDE`（`src/design/talk.ts`，§3.2，实测 676）：

```text
Talk with the human about at most three matters in one reply, and never give them options or letters to pick from. To learn what they want, ask one or two open questions in plain words, with your guess when you have one. Put everything else to them with propose_to_human: one plan in four short lines (背景, 推荐, 疑问, 不做), shown as given, then one question at the end. They agree, add or reject in their own words. Restate a loose answer in one line ("那我记成：…") and wait; then record it with record_human_answer and their exact words. Decide reversible details yourself and say so in one line. Ask at the project-manager level, never about code, and never ask what you can look up.
```

- `PLAIN_QUESTION_GUIDE`（`src/graph/plain-question.ts`，§2.8，实测 581），带人给的那道例题与换词表。

整节上限 2,700 字符（参考文本实测 2,377），单测钉住三个上限。单测另钉：整节不含 `ask_user_question`、`decision_card`、`design_review`、`ask_human`、`(Recommended)`、`(推荐)`、`（推荐）`、`depth`；含 `propose_to_human`、`record_human_answer` 与四个标签。第二部分点名的两个工具在第 6 步才注册；第 3 步到第 6 步都在分支 `m3` 上，第 12 步（b）一起合入 main，所以 main 上不会出现身份节点名了不存在的工具的版本。

`question-31` C 的「约 1k–1.5k 字符」指角色与边界，第一部分在这个范围里；第二部分来自之后的两个人定（`d-plain-questions` 点名了主 Agent 身份文本，`d-chat-not-cards` 定了说话方式），人后一个决定优先。三个上限的数是 agent 定的（§11）。

0.4 §3.1.3 第 1–10 项的去向：

| 0.4 第几项 | 去向 |
| --- | --- |
| 1 角色；「用户的人设管怎么说」 | 角色留在第一部分，改为「这个项目的主 Agent」（§2.4）；人设一句删去，人设在 Output Style 一节（§2.7） |
| 2 三问四答 | 设计循环的五栏随设计阶段的提醒下发（§2.3）；给人看的是四行（§3.1） |
| 3 harness 执行的规矩 | 一句（第一部分第二段）；git 一句 |
| 4 阶段 | 一句（第三段）；各阶段做什么在阶段提醒里 |
| 5 八步访谈与提问规则 | 问句与做法移到 wish、interview 阶段的提醒（§2.3）；说话方式在第二部分 |
| 6 图上的写法 | 移到阶段提醒与门禁的 `hint`（`src/graph/stage.ts` 已有，main `7aa8fe5`） |
| 7 `design_review` | 作废；确认与放行是 `propose_to_human` 与 `record_human_answer` 的两种（§3.4、§3.5） |
| 8 决策卡 | 作废；要人定的事是 `propose_to_human` 的 `question` 一种（§3.4） |
| 9 汇报细度以 `design_review` 的 `depth` 为准 | 删去；系统提示词里汇报细度只有 GLM 包的一个来源（§2.7）。「讲细点」「说重点」是人说的话，主 Agent 照着改讲法（§3.7） |
| 10 `/plan` | 留（第一部分末段） |

### 2.3 阶段提醒承接访谈与写图格式

0.4 §3.6.2 第 3 条的正文按阶段加下面几行（英文，中文原话与标签原样）。提醒照旧只在变化时注入，所以这些文字只在阶段或缺项变了的那一步出现。

- `wish`、`interview`：
  - 一行访谈的做法：`Interview the human in plain chat, one or two questions at a time, in their words: say 怎样算做成 for acceptance, 明确不做的 for non-goals, 最可能出岔子的地方 for risks, 不能改、不能花、不能冒的险 for constraints; offer your guess from experience; write each answer to the graph as soon as you have it.`
  - 一行「下一步」。对照表是 `src/design/stage-notice.ts` 里按 `GateItem.key` 的常量，每项带访谈步号与一句「下一步」：

    | `GateItem.key` | 步号 | 「下一步」一行 |
    | --- | --- | --- |
    | `need` | 1 | `Next: ask 「你想要什么」 as an open question, then <hint>.` |
    | `problem` | 2 | `Next: ask 「做成以后，你的日子会有什么不一样」, then <hint>.` |
    | `audience` | 2 | 同 `problem` |
    | `acceptance` | 3 | `Next: ask 「你会怎么检查它真的做成了」, then <hint>.` |
    | `non-goals` | 4 | `Next: ask 「有没有你明确不想要的」 with your guesses in one line, then <hint>.` |
    | `constraints` | 5 | `Next: ask 「有没有不能改、不能花、不能冒的险」, then <hint>.` |
    | `risks` | 6 | `Next: ask 「假如最后没做成，最可能是因为什么」 with your three guesses in one line, then <hint>.` |
    | `choice` | 7 | `Next: put the one fork only the human can decide with propose_to_human (kind question) and record their answer with record_human_answer; a question you decide on your own does not count.` |

    问句取 `docs/ORCHESTRATION.md` §4.2 表的原文。`choice` 一行不套「ask 「<问句>」」的模板（N5：§4.2 第 7 步的那一格是描述，不是问人的话）。「下一步」取缺项里步号最小的一项，步号相同按上表次序（`problem` 在 `audience` 之前）；`requirementCard` 的数组次序（约束排在成功之前，`src/graph/stage.ts`:121–143）不用来排序。缺项只有 `goal:supersedes` 时不写「下一步」一行，只写它的 `label` 与 `hint`。需求卡 8 项都齐时写 `Next: put the requirement to the human with propose_to_human (kind confirm).`
  - 其余缺项各一行（`label` 与 `hint`，同 0.4）。
- `design`：一行写图格式：`Write each design decision with "理由：", "架构：" and "查过的现成方案：" lines in its body, acceptance and nonGoals; plan features and tasks under the goal with a source edge to the decision, every task with acceptance.` 放行门禁成立时另一行 `Next: put the design to the human with propose_to_human (kind release).`；不成立时列缺项（同 0.4）。事前验尸一行（`如果失败：`）在第 9 步加，与它的解析同一步。
- `release`：`The design is released. Tell the human in one line; decomposition and dispatch come next.`（M7 落地时按 `d-auto-drive` 改写，§9 第 7 条）
- `stage.ts` 里两条今天点名 `decision_card` 的 `hint` 改写（第 5 步）：`choice` 的 hint 改为 `interview step 7 (the fork only the human can decide): put it with propose_to_human (kind question) and record the answer with record_human_answer; a question the agent decided on its own does not count`；放行门禁里人定待决未拍板的 hint 改为 `wait for the human's answer in the chat and record it with record_human_answer`。两条都与 main 上的判定一致：`lastDecidedByHuman` 认人在面板上的拍板与带原话的转述（`src/graph/stage.ts`:112–115）。
- 单测钉住：所有阶段的正文都不含 `ask_user_question`、`decision_card`、`design_review`、`ask_human`、`(Recommended)`、`(推荐)`、`（推荐）`。

### 2.4 一个项目一个主 Agent（`d-one-main-agent`，H1）

`d-one-main-agent`（人定，relay「一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」）：每个项目恰有一个主 Agent 会话，人只在这里和项目对话；已有主 Agent 时在别的会话发 `/wish`，告诉人主 Agent 在哪个会话，并可以把它移到当前会话，原会话变回普通会话；细节由编排方定、人可推翻。0.4 §2.3「一个工作区可以有多个主 Agent 会话」与「用户 fork 的会话仍是主 Agent」作废。下面的细节记进 §11。

项目与持有者记录：

- 项目就是图目录。键 `projectKey(dir)`：`fs.realpathSync.native(dir)`，失败时退回 `path.resolve(dir)`；`\` 换成 `/`，去掉末尾的 `/`，`process.platform === 'win32'` 时转小写。与 0.4 §3.5.2 的 `sameDir` 同一套规整，`sameDir(a, b)` 改为 `projectKey(a) === projectKey(b)`。会话的图目录取图行服务的 `dirFor(session.header.cwd)`（同 0.4 §3.5.2 的理由）；`projectKey` 按会话缓存（`WeakMap<SessionLike, string>`，会话目录不变）。同一个仓库的两个工作树各有自己的 `docs/graph/`，算两个项目；图行的 `dir` 配成绝对路径时所有会话共用一张图，算一个项目。
- 持有者记录：`<userHome>/main-agent/<sha256(projectKey) 的前 16 个十六进制字符>.json`，内容 `{version: 1, sessionId, graphDir, since, commandId}`。`userHome` 取数据服务的 `userHome`，数据行不在时取 `userDataHome()`（`src/shared/data-home.ts`，与渠道行的 `credentialHome` 同一个退路）。不放在项目目录（`projectHome`，评审建议的位置）：数据行的 `projectHome` 是一个配置值，桌面版上所有工作区共用它（`src/data/index.ts`:20、31），放在那里会让不同项目共用一个主 Agent；它也可能没配置。会话 id 是这台机器上 DSH 主目录里的东西，记录跟着它放在用户级目录。
- 模块 `src/graph/main-agent-holder.ts`（宿主专用，用 `node:fs`、`node:crypto`；放在图目录，因为面板行 `src/graph/panel-row.ts` 也要读它，依赖方向是设计目录 → 图目录）：`projectKey`、`holderFile(userHome, key)`、`readHolder(file): {kind: 'none'} | {kind: 'held', record} | {kind: 'unreadable', reason}`、`claimHolder(file, record)`（独占新建：先写同目录临时文件，再 `fs.linkSync(临时, 目标)`，目标已存在时 `EEXIST`，最后删临时文件）、`replaceHolder(file, record)`（临时文件加 `renameSync`）、`releaseHolder(file, sessionId)`（读出来仍指向这个会话才删）、`mainAgentOf(userHome, dir)`（给 M5、M7 的晨报、周报与巡检提醒用，也给 plain-ui 面板「点开跳到主 Agent 的对话」用；M3 只导出）。`readHolder` 同步，按文件的 `mtimeMs` 与 `size` 缓存，没变就不重读。

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
| `here` | 指向别的会话 | `replaceHolder` 改为本会话，做一次「对齐」，然后同 0.4 的「空」；success「主 Agent 已从另一个会话移到这里；那个会话变回普通会话。那个会话派出去还在跑的子 agent 从现在起按普通会话的规矩。」 | 同 0.4 的「空」 |
| `here` | 其余 | 同「空」 | 同「空」 |

写记录在写待生效状态之前；写失败（磁盘错误、权限）时返回 error「主 Agent 的持有者记录写不了：<原因>」，不开启，不写待生效状态。标题取 `sessionProjections.stateOf(session, 'title')`（session-title 注册的投影键 `title`，dsh-session-title:173〔实读〕），读不到时不写标题；`sessionPersistence` 是 JSONL 后端注册的服务（dsh-session-persistence-jsonl:2398〔实读〕），`list()` 返回存着的每个会话的 `header`（:2603 起〔实读〕），`src/shared/dsh-min.ts` 加薄类型 `SessionPersistenceLike { list(options?): Promise<readonly { header: { id: string } }[]> }`。

对齐（让「投影为真」与记录一致）：

- `demoteOthers(key, except)`：取 `agents.roots()`（0.4 §3.5.2 加的成员），留下 `projectKey` 等于 `key`、投影为真、不是 `except` 的会话，对每个执行 `commands.execute(它的 agent, '/wish off', [], AbortSignal.timeout(10_000))`（dsh-commands:327–339〔实读〕：先追加 `command/run`，`source` 固定为 `{kind: 'user'}`）。它们的 `/wish off` 走上表第二行，投影随之为假，流程条、开场卡片与「主 Agent」按钮都只读投影，所以跟着变。在 `/wish here`、`/wish` 覆盖读不到的记录之后各调一次。
- `agent/created`（不是委派子会话、投影为真、记录 `held` 且指向别的会话）：同样执行一次 `/wish off`。这覆盖两种情形：移走时没有打开的原会话，下次打开时对齐；人 fork 了主 Agent 会话，新会话继承了命令事件、投影为真，它不是持有者，创建时就变回普通会话。
- 执行失败（agent 已释放、超时、命令没注册）时告警一次，行健康 degraded「没能让会话 <id> 退出主 Agent：<原因>」。这时那个会话的投影仍为真，但 `isMainAgent` 读记录判它不是，身份节、写入规则与工具面都按普通会话；只有它的流程条与按钮显示得不对，直到下一次对齐。
- 残余：两个会话几乎同时 `/wish here` 时后写的一方胜，`demoteOthers` 按各自读到的会话执行，可能有一个会话投影仍为真而不是持有者；执行边界照记录判，显示不对的那个会话下次 `agent/created` 时对齐。`demoteOthers` 发出的 `/wish off` 在会话日志里记为 `source: {kind: 'user'}`（rc.3 固定如此），会话日志里看不出它是 harness 发的；回复文字写明「主 Agent 在另一个会话里」，留痕靠这一句与持有者记录的 `since`。

其他读法随之改：

- 面板拍板的回写（0.4 §3.5.2，第 7 步）：候选只有持有者一个会话（`readHolder(holderFile(userHome, projectKey(dir)))` 给 `sessionId`，`agents.get` 取活 agent），再按条件 B（投影为真）、D（焦点在这个目标下）判；条件 C（同一张图）由记录按被写的图目录取得，天然满足。记录读不到时退回 0.4 的四条件扫描，结果行注明「（持有者记录读不到，按会话逐个判）」。持有者不活时不发消息，它打开后每步的投影里已是新的状态。
- 子 agent 的设计期只读（`design-before-release`，0.4 §3.3.3）照旧按 `isMainAgent(root)` 判。主 Agent 移走之后，原会话派出、还在跑的子 agent 的根不再是主 Agent，规则不再适用：原会话已是普通会话，它的子 agent 与普通会话的子 agent 一样（`/wish here` 的回复写明这一点）。
- 人的原话的核对只看持有者会话自己的日志（§3.6）：主 Agent 移过来之后，确认与放行要在新会话里重新提一次；要人定的待决按图上的时间判，人在新会话里回话照样算。
- 客户端不读记录：流程条、`WishCard`、`WishPill` 照旧只读投影（§2.6）。普通会话里点「交给主 Agent」执行 `/wish`，已有主 Agent 时由命令的回复指路。
- 晨报、周报与巡检由 harness 到点提醒这个会话（`d-one-main-agent` 后半）属于 M5、M7（§10）；M3 只保证同一时刻至多一个会话是主 Agent，并导出 `mainAgentOf`。

### 2.5 git 交给主 Agent，会丢工作的命令先存快照（`d-main-agent-shell`，M1）

`d-main-agent-shell`（人定，2026-10-29T16:53Z 定稿，relay「主Agent只是不能动文件，但是可以任意操作git，或者说git交由主Agent是最好的」与「按你上面推荐的来」）：主 Agent 能任意使用命令行与 git，什么时候合、先合哪个、冲突怎么处理、要不要回退都由它定；唯一的限制是没有写文件的工具，shell 里写文件的命令由 guard 兜底，git 命令不在此列；harness 只守主干前进的那一刻（`norm-merge-gate`，M7 的 `m7-5` 改为「主 Agent 合入，harness 核对与记证据」）。编排方的落地细则（16:57Z，agent 定、可推翻）：git 不当写文件拦；会丢掉未提交改动或改写已推送历史的命令（`reset --hard`、按路径 `checkout` 或 `restore`、`clean -f`、`stash drop` 或 `clear`、`branch -D`、`push --force` 等）执行前，harness 先存一份可恢复的快照（`git stash create` 加 `refs/hourness/snapshots/` 下的引用；改写历史时打标签）并记下，再放行。依据 `d-failure-plans`：不拦，但失败要能恢复、能追溯。

M3 做的范围：主 Agent 自己的 shell 调用。子 agent 的 git 属于 M7 的派发与工作树（§10）。主干前进时核对这个提交跑过 `norm-merge-gate`、记证据，在 M7 的 `m7-5`；M3 不拦主干前进，留痕靠 git 自己的 reflog、会话日志里的命令与本节的快照流水（§10、§9 第 7 条）。

识别（新文件 `src/guard/git-snapshot.ts`；`src/guard/shell.ts` 加一个导出）：

- `simpleCommands(command, dialect): readonly (readonly string[])[]`（`shell.ts`）：每个简单命令在命令位置之后的词（去掉引号之后的文字），跳过变量赋值前缀与包装命令，并按 `shellWrites` 的同一条规则进入 `bash -c`、`pwsh -Command`、`find -exec` 与子表达式。引号里的文字不是命令，所以 `echo "git reset --hard"` 不算。
- 一个简单命令的命令名（同 `commandName`：最后一段路径、小写、去 `.exe`）是 `git` 时是一次 git 调用。跳过全局选项：`-C <路径>`（可以多个，依次相对解析）、`-c <k=v>`、`--git-dir[=]`、`--work-tree[=]`、`--namespace[=]`、`--no-pager`、`-p`、`--paginate`、`--bare`、`--no-replace-objects`、`--literal-pathspecs`、`--no-optional-locks`；第一个不是全局选项的词是子命令。
- 仓库目录：`-C` 给的路径，相对于会话的工作目录（`baseFor`，同 guard 的写入目标）。同一行里 git 之前有 `cd`、`Set-Location`、`sl`、`chdir`、`pushd` 时，参数是字面路径就按它解析；不是字面路径（含 `$`、`%`、反引号）时拒绝（下面的「拒绝」），因为 harness 认不出要在哪个仓库存快照。
- `gitRisk(sub, args): 'discard' | 'history' | 'both' | undefined`：
  - `discard`（可能丢掉工作区或暂存区里没提交的东西）：`checkout`、`switch`、`restore`（都不论参数：工作区干净时快照什么都不存，代价只是几次 git 调用）；`reset` 带 `--hard`、`--merge`、`--keep`；`clean`（不带 `-n`、`--dry-run`）；`stash drop`、`stash clear`；`rm` 带 `-f`、`--force`；`merge`、`rebase`、`cherry-pick`、`revert`、`am` 带 `--abort`；`worktree remove`。
  - `history`（移动或删除引用，只靠它可达的提交会丢）：`reset`（任何模式）；`rebase`（不带 `--abort`）；`commit --amend`；`branch` 带 `-D`、`-d`、`--delete`、`-M`、`-m`、`--move`、`-C`、`-f`、`--force`；`tag` 带 `-d`、`--delete`、`-f`、`--force`；`update-ref`；`push` 带 `-f`、`--force`、`--force-with-lease`、`--force-if-includes`、`-d`、`--delete`、`--mirror`、`--prune`，或有以 `+` 或 `:` 开头的 refspec；`filter-branch`、`filter-repo`、`replace`；`reflog expire`、`reflog delete`；`gc` 带 `--prune`；`prune`；`stash drop`、`stash clear`（暂存条目也是引用）；`remote remove`、`remote rm`。
  - 两类都有时为 `both`；子命令或参数里有 `$`、`%`、反引号时为 `both`。
  - 子命令不在上面、也不在已知的只读或无损命令表里（`status`、`log`、`diff`、`show`、`blame`、`grep`、`fetch`、`add`、`commit`、`init`、`clone`、`ls-files`、`rev-parse`、`describe`、`shortlog`、`config`、`remote`、`notes`、`bisect`、`branch`、`tag`、`merge`、`pull`、`cherry-pick`、`revert`、`am`、`stash push|list|show|apply|create|store|branch`、`worktree list|add`……完整表是 `git-snapshot.ts` 的常量）时，读一次 `git config --get alias.<子命令>`：是 `!` 开头的别名为 `both`，是普通别名时按展开后的文字再判一层，都不是时不存快照。
  - 认不出的情形（脚本里调用 git、git 钩子、`read-tree -u` 一类底层命令）是残余，记在 §10。

快照（`takeSnapshot(repo, invocation, risk)`）。全部 git 调用用 `execFile('git', args, {cwd: repo, timeout})`，不经 shell，参数是数组，命令文字里的引号与特殊字符不会被再解释；整个快照的期限 30 秒。

1. `git rev-parse --git-common-dir --show-toplevel`。不是仓库（退出码 128）时不存快照、放行（git 自己会失败）。找不到 git（`ENOENT`）时放行，行健康 degraded「找不到 git，快照跳过」。
2. `discard`：`git stash create` 得到 `S`（已跟踪文件与暂存区的改动，暂存格式，不动工作区；工作区干净时为空）。合并冲突没解决时 `stash create` 会失败（暂存区有未合并的条目）；这时用临时暂存区 `git read-tree HEAD`、`git add -u`、`git write-tree`，再 `git commit-tree <树> -p HEAD` 得到 `W`，存的是工作区里已跟踪文件的当前内容（冲突标记也在内）；冲突的三方版本不存（`merge --abort` 之后本来就没了，记在 §10）。这样主 Agent 处理冲突时的 `merge --abort`、`checkout --theirs` 不会因为存不了快照被拒。`clean` 另把要删的文件存下：用同样的参数去掉 `-f`、`--force`、`-i`、`--interactive` 再加 `-n` 跑一次，读出「Would remove <路径>」的列表 `L`；`L` 的总大小超过 200 MB 或超过 20,000 个文件时拒绝；否则用临时暂存区（`GIT_INDEX_FILE=<git-common-dir>/hourness/tmp-index-<id>`）`git read-tree --empty`，`git add -f -- <L>`（每次 100 个路径），`git write-tree` 得到树 `T`，删掉临时暂存区。`worktree remove` 对被删的工作树做同样两件（`git -C <那个工作树> stash create` 与 `clean -n -d -x` 的列表）。
3. `history`：`git for-each-ref --format=%(refname)%00%(objectname)%00%(*objectname)` 读 `refs/heads`、`refs/tags`、`refs/remotes`、`refs/stash`；`refs/stash` 存在时 `git log -g --format=%H refs/stash` 读出全部暂存条目；`git rev-parse HEAD` 与 `git symbolic-ref -q HEAD`。`push` 另把远端当前的状态取回：目标分支是 refspec 的目标，没写 refspec 时取 `@{push}`，`--all`、`--mirror` 时取全部分支；对每个 `git fetch --no-tags <远端> +<分支>:refs/hourness/snapshots/<id>/remote/<分支>`；远端没有这个分支时跳过；取不回来（网络、权限）时拒绝。
4. 一个快照提交 `K`：树是 `T`（没有时用 `git mktree` 读空输入得到的空树），父提交是 `HEAD`、`S` 或 `W`、各引用指向的提交（附注标签取它指向的提交）与暂存条目，去重。父提交超过 200 个时先每 200 个做一个中间提交，`K` 以这些中间提交为父（Windows 的命令行长度上限约 32,000 字符）。提交说明是一句人话的摘要加一段 JSON：快照 id、时间、会话 id、原命令、类别、每个引用当时的值、`S`、`W`、`T` 与恢复办法（超过 64 KB 时 JSON 只写在下面的流水里）。
5. 引用：`git update-ref refs/hourness/snapshots/<id> <K>`，`<id>` 为 UTC 时间 `yyyymmddThhmmssZ` 加 4 位随机十六进制。类别是 `history` 或 `both` 时另打轻量标签 `git tag hourness-snapshot/<id> <K>`：改写历史之后人在任何 git 界面的标签列表里都找得到旧的提交。用轻量标签，`git push --follow-tags` 不会带上它；`git push --tags` 会，记在 §10。
6. 流水：在 `<git-common-dir>/hourness/snapshots.jsonl` 追加一行 `{id, at, sessionId, agentId, command, subcommand, risk, ref, tag?, head: {sha, branch?}, stash?: S, worktree?: W, files?: {tree: T, count}, refs: [{name, sha}], remote?: [{remote, branch, ref}], restore: string[]}`。放在仓库的 git 目录里：跟着仓库走、不进版本库，`refs/hourness/snapshots/` 就在旁边。写流水失败时快照引用已在，仍可恢复：放行，行健康 degraded「快照 <id> 已存，记录没写上：<原因>」。
7. 告诉主 Agent：`inject` 一条 notice（来源 `glm-git-snapshot`，下一步收到）：`[git 快照] 执行「<命令>」之前存了快照 <id>（refs/hourness/snapshots/<id><，标签 hourness-snapshot/<id>>）。要撤回：` 后接适用的几行：没提交的改动 `git stash apply <S>`（冲突时的退路是 `git restore --source=<W> --worktree -- <路径>`）；删掉的文件 `git restore --source=<K> --worktree -- <路径>`（或 `.` 全部）；被移动或删除的分支与引用 `git update-ref <引用> <原值>`、`git branch <名字> <原值>`；被删的暂存条目 `git stash store -m "<说明>" <sha>`；远端 `git push --force-with-lease <远端> refs/hourness/snapshots/<id>/remote/<分支>:<分支>`。恢复全部是 git 命令，主 Agent 自己能做，不用写文件的工具。
8. `next()`，命令照常执行。

拒绝（只有存不了快照的时候）：第 1 步之外任何一步失败或超时，或 `clean` 超过上限、`push` 取不回远端、`cd` 的目标认不出时，在 `tools/pre-execute` 拒绝，规则 id `git-snapshot`，进违规流水；纠偏四段：事实 `The harness could not save a snapshot before "<command>": <reason>.`；越界 `Git commands that can lose uncommitted work or rewrite history run after the harness has saved a copy it can restore.`；正路按原因给：`Narrow the git clean so it removes less than 200 MB`、`Retry when the remote is reachable`、`Run git with -C <literal path>`、其余 `Retry; if it fails again, tell the human the reason`；例外 `The human can run the command in their own terminal.`。这是对 git 唯一的拒绝：放行一条存不了快照的命令，丢掉的东西就没有恢复办法（`docs/DEVELOPMENT.md` §1.1 第二类），理由与上限记在 §11。

不做：快照不自动清理（`refs/hourness/snapshots/*`、`hourness-snapshot/*` 标签与流水留到人删，`git for-each-ref refs/hourness/snapshots` 列出全部）；不另做恢复命令；忽略的文件只在 `clean -x`、`-X` 与 `worktree remove` 时存（`checkout -f` 不碰它们）。见 §10。

### 2.6 `/wish` 入口与强一档模型的提醒（`m3-1` 验收第 4 条）

按 plain-ui §7.5.2–§7.5.5 与 `mockup-wish.svg` 场景 ①–⑤，M3 只做其中属于 `/wish` 的部分（plain-ui 第 4 轮裁定 P4-02：`/wish` 入口以 M3 为准）；上手页、「第一次用？」一行、没有项目图时的卡片、面板首页里的一句属于 plain-ui。全部在编排层包的客户端（`6134c83` 之后客户端行叫 `dsh-hourness`，产物在 `packages/hourness/ui/`，入口 `ui/src/hourness-client.tsx`），第 11 步。这里的「卡片」是 DSH 开场画面上的停靠组件，不是问人的问答卡，`d-chat-not-cards` 不涉及它。

- 开场卡片 `WishCard`：`ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({name: 'conversation.input.dock', id: 'hourness-wish', order: 40, label: '交给主 Agent', inject: (sessionId) => ({ sessionId })}, WishCard))`，外层 `ctx.effect` 同流程条。这个槽在开场画面里位于工作区行与输入框之间（conversation client.js:17901–17907）。组件每次渲染判断，按下面三种情形之一显示，都不成立时返回 `null`：
  1. 完整卡片：会话是空白的（标准 prop `useSession` 的 `blank` 为真、`promptAttempted` 与 `running` 为假；拿不到时退到 `sessions.list` 的 `byId[sessionId].blank`）；本会话不是主 Agent（`mainAgentActive(values)` 为假）；有项目图（`holdSource`）且 `/wish` 已注册（`remote.commands.list(sessionId)` 里有 `wish`，每个会话读一次，失败时会话快照变化后再读一次）。文字照 `mockup-wish.svg` ①，只改黄字：标题「把这个工作区交给主 Agent」；正文「说一句你想做的。主 Agent 先问清楚、出方案给你批，再分给子 agent 去做；它自己不写代码。」；主按钮「写一句你想做的」；次按钮「接着推进现有项目」（图上有未关闭的目标时）；黄字带图标「主 Agent 用强一点的模型」（N1：后半句「子 agent 用便宜的就行」删去，子 agent 的模型由主 Agent 派活时选，`d-main-agent-models`）；灰字「命令是 /wish，随时 /wish off 退出。」
  2. 一行：会话仍是空白的、有项目图，而本会话已是主 Agent。这是人点了「接着推进现有项目」之后的样子：`/wish` 不带话时只 `inject`、不开回合，会话可能仍停在开场画面（conversation client.js:17378–17379、17608–17610），而 `conversation.composer.dock` 只在非开场画面渲染（:19343–19344）。这时卡片换成一行「这个会话的 agent 是主 Agent」与按钮「退出主 Agent（/wish off）」。人发出第一句话后会话不再空白，这一行消失，退出方式由输入框下方的「主 Agent」按钮接手。
  3. 其余情形不显示。
  已有主 Agent 在别的会话时，新会话照样显示完整卡片；点了之后由 `/wish` 的回复说主 Agent 在哪、怎样移过来（§2.4）。客户端不读持有者记录。
- 黄字不带模型名：plain-ui 0.4 正文 §7.5.2 写「（如 GLM-5.3）」，草图没有括号。按草图：编排层包对所有模型生效，不点名某个模型（`hourness` 目标的非目标「不含任何模型的方言」）。
- 输入框下方的按钮 `WishPill`：`conversation.composer.dock`，id `hourness-wish`，order 160。普通会话、有项目图、`/wish` 已注册时写「交给主 Agent」，点开小弹层（`mockup-wish.svg` ②：一句说明、命令、黄字「主 Agent 用强一点的模型」、两个按钮）；主 Agent 会话里写「主 Agent」，点开「这个会话的 agent 是这个项目的主 Agent：按项目图推进，不写文件。进度在右边的项目图里。」与「退出主 Agent（/wish off）」。那一排窄于 520 px（`closest('[data-composer-dock]')` 的宽度，`ResizeObserver`）时「交给主 Agent」写「/wish」，「主 Agent」不变。
- 按钮做什么（plain-ui §7.5.3）：「写一句你想做的」在输入框为空时经标准 prop `inputActions.setDraft` 写入 `/wish ` 并聚焦，输入框有字时不改并提示「输入框里还有没发出的字」；拿不到 `inputActions` 或 `useInput` 时不执行命令，换成一行「在输入框打 /wish，后面跟一句你想做的」与「复制 /wish」（`writeClipboard`）。「接着推进现有项目」与「退出主 Agent」经 `remote.commands.execute` 执行 `/wish`、`/wish off`，都是人的点击。
- 流程条：order 由 0.4 的 20 改为 30（DSH 排队条是 20，conversation client.js:17269，plain-ui §12 M3 第 5 条），开场卡片 40。`flowBarText` 多一个输入 `cheapModel: boolean`：主 Agent 最近一步的模型（`graphLive` 的 `model`，`src/graph/live.ts`:41）属于便宜档时，末尾另起一行黄字「现在是 <模型>；主 Agent 建议换强一点的模型」与「这次就用它」（按会话记在内存里，收起到重载为止）。便宜档按 plain-ui §7.5.5：模型 id 转小写，按 `[-_./:\s]` 切词，有一个词是 `flash`、`mini`、`lite`、`haiku`、`small`、`nano` 之一；认不出的不提醒。纯函数 `isCheapModel(id)` 放在 `ui/src/flow/model.ts`。0.4 的「主 Agent · 读不到阶段（现场投影未注册）」改为「主 Agent · 读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用）」（§2.8）。流程条的「等你确认 / 等你批准 / 等你拍板」照 0.4，含义改为「主 Agent 在对话里等你回话」。
- `/wish` 的成功回复（0.4 §3.1.1 表里「已让这个会话的 agent 当主 Agent…」两行与 §2.4 的 `here`、接管几行）末尾加「主 Agent 建议用强一点的模型」。第 3 步。
- `docs/ORCHESTRATION.md` §3.5 补两句（第 3 步）：主 Agent 用强一档的模型，在 `/wish` 的回复、入口与流程条上提醒人，插件不替人换模型（`docs/CHARTER.md` §6）；子 agent 的模型由主 Agent 派活时选并记理由（`d-main-agent-models`，M7）。今天 DSH 的委派让子 agent 沿用父 agent 的模型（subagent:305–316〔实读〕），M3 不改。
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
- 人设与四行格式的关系：人设管主 Agent 回话的语气；`propose_to_human` 返回的四行由 harness 生成、原样给人看（§3.4），人设的话不进这四行；范围说明一句已经写了「工具调用里的文字保持朴素」。
- 不是主 Agent 的会话（普通会话、子会话、审查者、主 Agent 移走之后的原会话）没有这一节。只给主 Agent 的理由：主 Agent 没有写工具（§2.1），人设的话落不进代码与注释；普通会话直接写代码，人设会落进文件（`m3-main-persona` 正文）。
- GLM 路由（GLM 包，`src/glm-prompt/assembly.ts` `rewriteDialectSections`）：本次组装的 `sections` 里有 `OUTPUT_STYLE_SECTION` 一节时，身份节用 `buildIdentitySection(true, …)`（开头句 `IDENTITY_OPENING_WITH_STYLE`，`src/glm-prompt/verbatim.ts`:15，已在逐字门禁里，`scripts/check-verbatim.mjs`:237），并把这一节移到 `glm:context-management` 之前（ZCode 的次序是 Environment、Output Style、Context management，`docs/reference/zcode-capabilities.md`:374）；方言节里没有 `glm:context-management`（start-plan 档）时，放在最后一个方言节之后。没有这一节时与今天一样。`installDialect` 今天在安装时算一次 `sections`（`src/glm-prompt/index.ts`:184），改为两份身份节（有无风格）都在安装时算好，按组装时有没有这一节选一份。
- 其他路由：这一节原样留在 `roleFace` 追加的位置，不换开头句。
- 子 agent 不带：`isMainAgent` 对 `origin: 'subagent'` 为假。子 agent 写的文件里不出现人设用语（验收第 2 条）在提示词层面由此保证；模型行为在 L4 用标记词核对（第 12 步（b））。用户自己 `~/.dsh/AGENTS.md` 里的人设所有 agent 都读得到，那是用户配置，插件不动。

改名：

- GLM 包 `glm-prompt` 行的配置 `persona`（汇报细度，`concise`、`balanced`、`detailed`）改名 `reportingDepth`；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts`，`PERSONA_LEVELS`、`PersonaLevel`、`personaSection`、`PERSONA_SECTION_NAME`、`isPersonaLevel` 改为 `REPORTING_DEPTHS`、`ReportingDepth`、`reportingDepthSection`、`REPORTING_DEPTH_SECTION`、`isReportingDepth`；节名 `glm:persona` 改为 `glm:reporting-depth`；`GlmPromptConfig` 与 `dialectSections` 的参数同改。模型看到的文字（`# Reporting Depth` 一节的正文）一个字不改。`packages/glm/locale/glm-prompt/` 的设置页说明随键名改。
- 旧配置照读：用户桌面版 profile 的 `glm-prompt` 行今天写着 `persona: balanced`（`~/.dsh/profiles/desktop/cordis.patch.yml`:57〔实读，只读〕），本仓库不改用户 profile。cordis 在激活前用插件导出的 `Config` 规整配置（cordis lib/index.js:956–961、:1631〔实读〕）；本仓库的 schemastery 在值缺席时填默认值（`src/shared/schemastery.ts`:535–544），对象只留有值或原本就有的键（:814–823）。所以：
  - Schema 里 `reportingDepth` 与已弃用的 `persona` 都不带默认值（`reportingDepth` 的说明写「缺省为 balanced」，`persona` 的说明写「已改名为 reportingDepth，只为读旧配置」）；规整之后哪个键在，就是用户写了哪个键。
  - `apply` 取 `config.reportingDepth ?? config.persona ?? 'balanced'`。
  - 只有 `persona` 时告警一次「glm-prompt 的 persona 已改名为 reportingDepth，这次按旧键生效」，行健康说明写同一句；两者都有且不同时用 `reportingDepth`，告警一次「persona 与 reportingDepth 不同，按 reportingDepth」；两者都有且相同时不告警，行健康说明写「旧键 persona 可以删掉」；两者都没有时不告警。
  - 插件管理器里不带默认值的单选框怎样显示〔推断〕，L4 截图（第 12 步（b）第 8 项）。
- `tests/profile-shape.spec.ts` 里的 `persona:` 是 YAML 解析的夹具，不改。
- 汇报细度并进 Output Style、子 agent 不带汇报细度（清点报告 Q2 C 后半、Q5 B）改所有 GLM 会话的提示词，不在 `m3-main-persona` 的验收里，本次不做（§9 第 9 条）。

ZCode 基线 3.17.1（`d-zcode-3171`）：3.17.1 改写了两种身份开头句，`IDENTITY_OPENING_WITH_STYLE` 的文字会变，由 `zcode-3171-follow` 改。本节只按常量名写（`IDENTITY_OPENING_WITH_STYLE`、`IDENTITY_OPENING_PLAIN`、`buildIdentitySection`），L2 也按常量比对。两条分支都改 `src/glm-prompt/`，后合入的一方 rebase（`m3-main-persona` 一步的依赖）。

### 2.8 换词表与例题（`d-plain-questions`）

人读不懂问题里的「验收」「标定」「补遗」「改写验收语句」（2026-10-29），并要求每道题先交代前因后果。`d-plain-questions` 定：给人的问题不用人没学过的词；凡是让模型给人写题的地方放一道完整的好题与换词表；harness 的写法检查在问题字段里查这些词。`d-chat-not-cards` 之后「题」是聊天里的四行提议，人在 2026-10-30 自己给了一道（§3.1），它就是例题。M3 管其中的身份文本、`propose_to_human` 的说明与 harness 自己写给人看的字串。

一处定义：新模块 `src/graph/plain-question.ts`（纯文字与纯函数，不用 Node 内置模块；放在图目录，因为图工具的说明、plain-ui 的写法检查与面板都要用它）。谁先合入谁建，另一方导入：plain-ui 的 `jargon` 规则（plain-ui §4.3，`src/graph/plain.ts`）从这里读 `PLAIN_WORDS`，不另写一份（N3）。

- `PLAIN_WORDS`：换词表，按 plain-ui §4.3 `jargon` 的词补齐，五项：

  | `avoid` | `say` |
  | --- | --- |
  | `验收`、`acceptance` | 怎样算做完（目标一级说「怎样算做成」，与需求卡的「成功（怎样算做成）」一致） |
  | `标定`、`calibration` | 练习题（固定的几道小项目，系统自己做一遍、由脚本代人回话，用来查改动有没有把系统改坏） |
  | `门禁`、`gate` | 合入前的检查 |
  | `投影`、`projection` | 每一步给 agent 的项目摘要 |
  | `补遗`、`附录`、`addendum` | 说清它是什么 |

- `PLAIN_QUESTION_EXAMPLE`：人给的那道题，按提议式待决的字段存（§3.3）：`{title: '高峰时段要不要告诉模型', background: '高峰时 GLM **更费积分**，现在会提醒模型', proposal: '**只显示给你看**，不再提醒模型', doubt: '以后要主 Agent **避开高峰**干活，就得加回来', notTaken: '继续提醒，它收到 32 次**一次都没用上**'}`。四行的文字是人的原话；加粗的位置是本附录按人「每一个背景推荐那些总结几个字加粗」补的。例题与标定任务（记账小工具）不在一个领域，不给标定的模型现成的答案。
- `PLAIN_QUESTION_GUIDE`：由上面两个常量与 `renderProposal`（§3.3）生成的英文说明，上限 1,000 字符。参考文本（实测 581 字符）：

```text
Whatever you say to the human is in plain words. A proposal from propose_to_human reads like this, each line its own paragraph and a few key words of each line in bold:
① 高峰时段要不要告诉模型
背景：高峰时 GLM **更费积分**，现在会提醒模型
推荐：**只显示给你看**，不再提醒模型
疑问：以后要主 Agent **避开高峰**干活，就得加回来
不做：继续提醒，它收到 32 次**一次都没用上**
Plain words for the human: 怎样算做完 (for a goal: 怎样算做成), not 验收 or acceptance; 练习题, not 标定 or calibration (fixed small projects the system runs by itself to check nothing broke); 合入前的检查, not 门禁 or gate; 每一步给 agent 的项目摘要, not 投影 or projection; never 补遗, 附录 or addendum: say what the document is.
```

- `plainWordsIn(text): string[]`：返回 `text` 里出现的 `avoid` 词（中文按子串，英文按词边界、不分大小写）。用处：各步的单测查 harness 写给人看的字串；第 12 步（a）在标定里数主 Agent 写给人的文字里出现的次数；plain-ui 的写法检查直接调用。

落在哪里：

| 位置 | 内容 | 步 |
| --- | --- | --- |
| `src/graph/plain-question.ts` 与 `tests/plain-question.spec.ts` | `PLAIN_WORDS`、`PLAIN_QUESTION_EXAMPLE`、`PLAIN_QUESTION_GUIDE`、`plainWordsIn`；单测：说明不超过 1,000 字符、含五个 `say` 与每个 `avoid`；例题各字段 `plainWordsIn` 为空；`plainWordsIn` 的中文子串、英文词边界（`gateway` 不算 `gate`）、大小写 | 3（例题按 §3.3 的规则过 `proposalLineRefusal` 的一例在第 6 步加） |
| 身份节第二部分 | 原样引用（§2.2） | 3 |
| `propose_to_human` 的说明 | 原样引用（§3.4） | 6 |
| `/wish` 的回复、错误与行健康说明 | 0.4 §3.1.1「主 Agent 模式要用会话投影服务，这个组合里没有」改为「主 Agent 模式要用 DSH 的会话状态服务（sessionProjections），这个组合里没有」；0.4 §6.2 的 degraded「主 Agent 模式要会话投影服务」改为「主 Agent 模式要会话状态服务（sessionProjections）」；§2.4 新增的几句 | 3 |
| 五栏门禁的标签（`src/graph/stage.ts`） | `目标（验收条件）` 改为 `目标（怎样算做成）`；`任务「<标题>」的验收条件` 改为 `任务「<标题>」怎样算做完` | 9 |
| 流程条 | 「读不到阶段（现场投影未注册）」改写（§2.6） | 11 |
| 标定指标 | 主 Agent 写给人的文字里 `plainWordsIn` 命中的次数 | 12（a） |

各步的单测对 harness 写给人看的字串（回复、错误、行健康说明、notice、批注的固定部分、按钮与流程条的固定文字、`renderProposal` 的标签）调 `plainWordsIn`，结果为空。模型写给人的文字 M3 不在运行时拦：拦截属于 plain-ui 的写法检查，M3 在标定里数。

### 2.9 待决的背景字段（M2）

编排方的裁定（2026-10-30，按 plain-ui 第 4 轮 P4-01）：问题的背景字段与上限由 plain-ui 定，M3 照用。plain-ui §4.2：待决节点的新字段 `background`，非空白、不含换行、不超过 `PLAIN_LIMITS.background`（150）个码点；决定者是人的待决必须带（plain-ui 的检查第一阶段警告、第二阶段拒绝）；写出顺序紧跟 `title`；面板只读这个字段，不从正文拆（plain-ui §3.8.1）。

M3 的规则：

- M3 唯一写人定待决的地方是 `propose_to_human` 的 `question` 一种（§3.4）。四行里的「背景」就写进 `background` 字段，不写进 `body`；它的长度与一行的要求只读 `PLAIN_LIMITS.background`，不另设数值。提议式待决对四行另有一条「恰好一处加粗」的要求（§3.3），这是四行格式的规则，不改 `background` 的形状。
- 字段由引擎认：今天引擎拒绝未知字段（`src/graph/format.ts`:90–92）。plain-ui 第 1 步加这个字段；M3 第 6 步先于它合入时，由第 6 步按 plain-ui §4.2 加：`schema.ts` 的 `GraphNode.background?: string` 与 `PLAIN_LIMITS = { title: 40, why: 80, background: 150 }`（放在 `CARD_LIMITS` 旁），`format.ts` 只在 `type: 'question'` 上接受它（写出顺序紧跟 `title`），提议式待决必须带它（§3.3），不加 plain-ui 的分阶段检查。plain-ui 后合入时直接用这两处；P4-01 若改了数值，M3 跟着读常量。
- 例题与说明里的背景写法同一条规则（§2.8）。

## 3. 问人改成聊天（`d-chat-not-cards`）

### 3.1 人定了什么

`d-chat-not-cards`（人定，2026-10-29T17:01Z，relay「我是要改产品的，而且聊天不仅是不给问答卡，是连选项都没有的那种，就彻底回归到我们的设计循环那里。你提几点和方案，我补充或者同意这种。」）适用于产品里主 Agent 与人的全部交流。之后的批注逐步定下细则，后一条取代前一条：

- 17:08Z：人对编排方的五点落地方案回「没问题」（见下表）。
- 17:16Z：人纠正「我明明说的是选择题我觉得不轻松，看起来好累，不能根据我的直觉想还得考虑你说的方案的可能性」，「我暂时的设想就是聊天的形式，你出方案和不做的，我来补充或者确认」。定为：agent 出一个方案，人补充或确认；要什么、做成什么样的事先问一两句开放的问题；人回完 agent 复述一句再记图。
- 17:23Z–17:27Z（格式定稿）：每件事题目单独一段；背景、推荐、疑问、不做四行各自成段，标签不加粗，每行一句短话，把那一行的重点几个字加粗；问话放在整条消息最后，只问一次。人给的样子（加粗是本附录补的，见 §2.8）：

  > ① 高峰时段要不要告诉模型
  >
  > 背景：高峰时 GLM **更费积分**，现在会提醒模型
  >
  > 推荐：**只显示给你看**，不再提醒模型
  >
  > 疑问：以后要主 Agent **避开高峰**干活，就得加回来
  >
  > 不做：继续提醒，它收到 32 次**一次都没用上**

`.agents/tasks/design-context.md` 最后一节写的「一行加粗的结论、2 到 4 条要点、推荐、疑问、不做三行」是 17:08Z 那一版，已被 17:23Z 起的批注取代；本附录按图上的定稿做。

五点落地方案在 M3 里的落法：

| 方案的一点 | M3 怎么做 | 在哪 |
| --- | --- | --- |
| 一、问答卡与选项相关的决定改写或作废；访谈改为聊天，主 Agent 仍不带 `ask_user_question`；`d-inertia-breaker` 改为要紧的事先问人怎么想再给方案 | 不出任何卡片，不列选项；`ask_user_question` 从主 Agent 的工具面去掉并有兜底规则；要什么的事先问开放的问题（身份节、阶段提醒）。先想后看与跟随率的算法不在 M3 | §2.1、§2.2、§2.3；第 3、4 步 |
| 二、要人定的事仍是待决节点，存方案原文、人的原话与结论，不再要求选项一类的字段 | 图引擎多认一种「提议式待决」：没有 `options`，存四行与结论；决定照旧是 `decide`，带人的原话（`relay`） | §3.3；第 6 步 |
| 三、五键变成人在聊天里会说的五种话，不做按钮；设计放行仍是图上一次人的拍板，由主 Agent 带人的原话记下 | `record_human_answer` 记三种（同意、补充、否掉），另两种只改讲法；确认需求与放行方案都由它带原话写图；harness 核对原话 | §3.5、§3.6、§3.7；第 8、9 步 |
| 四、面板只看不操作，「需要你」列出在等人回话的方案，点开跳到主 Agent 的对话 | 面板改版属于 plain-ui；M3 只让面板能显示提议式待决（四行与「在主 Agent 的对话里回话」，没有按钮），并导出 `mainAgentOf` 供跳转 | §3.3；第 6 步；§9 第 5 条 |
| 五、跟随率改为统计人原样同意、补充、否掉的比例，进指标流水 | `record_human_answer` 写进图的说法固定为三种（§3.5），指标流水从图上数；指标流水本身不在 M3 | §3.5、§10 |

### 3.2 说话的规矩只在一处定：`src/design/talk.ts`

人在一个晚上把格式改了五次。主 Agent 怎样跟人说话、哪些提问工具对它藏起来、harness 怎样从会话日志里认出「给人看过什么」和「人说了什么」，都只在这一个模块里定，格式再改只动它与 `src/graph/proposal.ts`（§3.3）。模块不导入设计行的其他文件，纯函数，宿主与模拟人都能导入（模拟人从 `packages/hourness/dist/design/talk.js` 导入，同 `run-probe.mjs` 从 `dist/` 导入的做法）。

```ts
// src/design/talk.ts
export const TALK_GUIDE: string                                   // §2.2 第二部分的前一半
export const HIDDEN_FROM_MAIN_AGENT: readonly string[]            // ['ask_user_question']
export const PROPOSE_TOOL = 'propose_to_human'
export const RECORD_TOOL = 'record_human_answer'
export type ProposalKind = 'question' | 'confirm' | 'release'

/** 会话日志里人发来的消息（§3.6） */
export interface PersonMessage { readonly seq: number, readonly time: number, readonly text: string }
export function personMessages(events: readonly SessionEventLike[]): readonly PersonMessage[]

/** 每一段原话是不是人在 afterMs 之后发来的某一条消息的一段（§3.6） */
export function personSaid(events: readonly SessionEventLike[], quotes: readonly string[], afterMs: number):
  { readonly ok: true, readonly relay: string } | { readonly ok: false, readonly reason: string }

/** 会话日志里 propose_to_human 成功返回的结果，按先后（§3.4、§3.5） */
export interface Shown { readonly seq: number, readonly time: number, readonly result: ProposeResult }
export function shownProposals(events: readonly SessionEventLike[]): readonly Shown[]
```

`SessionEventLike` 是 `src/shared/dsh-min.ts` 新加的薄类型 `{seq: number, time: number, type: string, data: unknown}`（dsh-session 的事件带 `seq` 与整数毫秒的 `time`，session:1129〔实读〕），`SessionLike` 加可选成员 `snapshotEvents?(): readonly SessionEventLike[]`（dsh-session 的会话有这个方法，fork 与 api-session-controller:1134 都在用它〔实读〕）。

`shownProposals` 的认法：顺序扫一遍事件，`assistant/message` 里 `tool-call` 块的 `name` 经 `toNativeTool` 后等于 `PROPOSE_TOOL` 的，记下它的 `id`；`tool/result` 的消息 `toolCallId` 在记下的集合里、`isError` 不为真、正文文本按 JSON 解析出 `tool: 'propose_to_human'` 的，收进结果。解析不了的跳过（告警一次）。

### 3.3 提议式待决（图引擎）

人定的事仍是图上的待决（方案第二点）。今天的待决必须有 2–4 个选项与推荐（`src/graph/format.ts`:397–406），决定是选项键（`decision`）。本节加第二种形状，旧的形状照旧能读能写。

纯函数模块 `src/graph/proposal.ts`（不用 Node 内置模块，引擎、`propose_to_human`、例题与面板共用，规则只实现一次）：

```ts
export const PROPOSAL_FIELDS = ['background', 'proposal', 'doubt', 'notTaken'] as const
export const PROPOSAL_LABELS = { background: '背景', proposal: '推荐', doubt: '疑问', notTaken: '不做' } as const
export const PROPOSAL_LIMITS = { line: 40, boldMin: 2, boldMax: 12, conclusion: 120, perReply: 3 } as const
export const CIRCLED = ['①', '②', '③'] as const
/** 一行的检查；background 的长度上限取 PLAIN_LIMITS.background，其余三行取 PROPOSAL_LIMITS.line */
export function proposalLineRefusal(field: typeof PROPOSAL_FIELDS[number], value: unknown): { message: string, hint: string } | undefined
export function splitBold(line: string): { before: string, bold: string, after: string } | undefined
/** 题目一段、四行各一段，段与段之间一个空行；标签不加粗 */
export function renderProposal(p: ProposalText, number: 1 | 2 | 3): string
```

一行的规则（`proposalLineRefusal`）：是字符串；去掉首尾空白后非空；不含换行；不以本行的标签加冒号开头（「背景：」之类由 harness 加，`hint`「leave out the label; the harness adds it」）；恰好一处 `**…**`，里面 2–12 个码点、不含 `*`，前后至少有一边还有别的字（整行加粗不算）；去掉两对 `**` 之后的码点数：`background` 不超过 `PLAIN_LIMITS.background`（§2.9），其余三行不超过 40。题目：一行，非空，不超过 `PLAIN_LIMITS.title`（40），不含 `*`。上限的理由：人说「一行不要写太多东西」，人给的四行是 13–23 个码点；40 是它的两倍左右，`background` 用 plain-ui 定的数（§11）。

`renderProposal` 的输出（`n` 为 1 时）：

```text
① <title>

背景：<background>

推荐：<proposal>

疑问：<doubt>

不做：<notTaken>
```

改动（第 6 步，图引擎的格式与权限，独立评审）：

- `src/graph/schema.ts`：`GraphNode` 加 `proposal?`、`doubt?`、`notTaken?`、`conclusion?`（都是字符串，只有待决能带）；`background?` 与 `PLAIN_LIMITS` 按 §2.9；`NODE_FIELDS` 的写出顺序在 `recommend` 之后插 `proposal`、`doubt`、`notTaken`，在 `decision` 之后插 `conclusion`（`background` 紧跟 `title`，plain-ui 的次序）；`EDITABLE_FIELDS` 加 `background`、`proposal`、`doubt`、`notTaken`；`HistoryEntry` 加 `conclusion?`，`HISTORY_FIELDS` 在 `option` 之后插 `conclusion`。
- `src/graph/format.ts`（读图时的形状）：待决有两种形状。有 `options` 的是选项式，规则不变；没有 `options` 的是提议式：`background`、`proposal`、`doubt`、`notTaken` 四个都要有（字符串），`CARD_FIELDS` 与 `decision` 都不能有，`conclusion` 可有；做完（`done`）的提议式待决，决定证据的 `ref` 是字面 `conclusion`（今天要求是选项键，:417–420）。两种都不是时报「a question node has options, or background, proposal, doubt and notTaken」。非待决节点不能带这四个字段与 `conclusion`（扩展 :408–411 的检查）。读图只查形状，不查一行与加粗：写入规则在引擎里，同 `option` 的做法（:217 的注释）。
- `src/graph/engine.ts`（写入规则）：
  - `propose` 与碰到这四个字段的 `edit`：待决是提议式时，四行按 `proposalLineRefusal` 查，题目按上面的规则查；`field` 指到出错的字段。`questionRefusal` 对提议式不查表格字段。不能在 `edit` 里换形状（给提议式设 `options` 或给选项式设四行之一）：`invalid`，`hint`「propose a new question」。
  - 谁能改四行：`LLM_EDITABLE` 加 `background`、`proposal`、`doubt`、`notTaken`，只对提议式、且状态是 `approved` 或 `doing` 的待决成立；做完的提议式待决不能由 `llm`、`harness` 改这四行与题目（`forbidden`，`hint`「the human decided this proposal; propose a new question」），人照旧能改。理由：人补充或否掉之后主 Agent 要改方案再提（§3.5），而人同意之后方案就是人同意的那一版。
  - `decide`：选项式照旧要 `option`、不收 `conclusion`；提议式要 `conclusion`、不收 `option`。`conclusion` 去掉首尾空白后非空、一行、不超过 120 个码点。写入 `status: 'done'`、`conclusion`、证据 `{kind: 'decision', ref: 'conclusion'}`，历史 `{op: 'decide', …, conclusion}`。同一结论再拍为 `bad_transition`；权限同今天（`decideRefusal`：决定者是人时要人或带原话的转述，`decidedByHuman` 之后只有人的权限能再拍）。
- `src/graph/mutation.ts`：`decide` 的 `option` 与 `conclusion` 恰有一个，两者都有或都没有时 `invalid`。命令行（`npm run graph`）读的是同一个变更 JSON，不另改。
- `src/graph/tools.ts`：`graph_decide` 的参数 `option`、`conclusion` 都改为可选（rc.3 的 schema 子集没有 `oneOf`，由引擎查），`required` 为 `id`、`rev`、`reason`；说明加一句「a proposal (a question with proposal, doubt and notTaken) takes conclusion: one line, what was decided」。`graph_propose` 的节点 schema 加四个字段的说明；说明里「A question is a table card: rows of label, gain, cost, recommended option last; the human's also crux, verdict, weight.」改为「A question for the human is a proposal: background, proposal, doubt and notTaken, one short line each with a few key words in bold; the main agent puts one with propose_to_human. A question you decide yourself (decider agent) is a table of options, the recommended option last.」这句话所有会话都读到，编排方用命令行写图时同样适用（`d-chat-not-cards` 也适用于编排方与人）。
- `src/graph/stage.ts`：需求卡「岔路」一项的判据 `node.decision !== undefined` 改为 `(node.decision !== undefined || node.conclusion !== undefined)`，其余（最后一次 `decide` 是人或带原话）不变。
- `src/graph/projection.ts`：`openItems.questions` 的条目对提议式另带四个字段（`options` 照旧是 `[]`，类型不变）；`recentDecisions` 的条目加 `conclusion?`，提议式时 `decision` 不出现、`label` 为 `conclusion`（今天 `label` 已经在找不到选项时退回 `decision`，:276）。每步给主 Agent 的项目摘要因此看得到在等人回话的四行。
- `src/graph/panel-row.ts`：`/graph-apply` 的 `decide` 结果说法对提议式写「已拍板「<标题>」：<conclusion>」。
- 面板（客户端，最小改动，plain-ui 改版时整体重写）：`ui/src/graph/common.tsx` 的待决区对提议式显示四行（标签照常、`splitBold` 出的那几个字加粗）与一行「在主 Agent 的对话里回话」，不显示选项按钮；`ui/src/graph/model.ts` 的状态说法对做完的提议式写「定了：<conclusion>」；`ui/src/graph/Decisions.tsx` 的近期决定对提议式写「定了：<conclusion>」。
- 不改的：选项式待决的全部规则（`e22282f`、`44e8601`）照旧，agent 自己定的题照旧用表格字段；已有的待决不迁移。引擎不禁止新写选项式的人定待决：限制只对主 Agent（§3.8 第三条），引擎与编排方的用法由改写 `d-option-card` 的那件事定（§9 第 4 条）。
- 测试：`tests/graph-format.spec.ts`（两种形状、两种都不是、混合、非待决带这些字段、做完的提议式的证据）、`tests/graph-engine.spec.ts`（四行的每条规则各一例；`llm` 改未拍板的提议式成功、改做完的被拒；`decide` 的两种形状互斥；同一结论再拍；没有原话时 `llm` 拍人定的提议式被拒）、`tests/graph-tools.spec.ts`、`tests/graph-stage.spec.ts`（提议式拍板之后「岔路」一项为真）、`tests/graph-projection.spec.ts`、`tests/graph-panel-model.spec.ts`、`tests/proposal.spec.ts`（`renderProposal` 的输出逐字等于上面的样子；`splitBold`；例题过 `proposalLineRefusal`）。引擎与格式已有的测试不改且通过，这是选项式行为不变的证据；`tests/graph-tools.spec.ts` 里钉 `graph_decide` 的 `required` 与 `graph_propose` 说明文字的断言随之改。

### 3.4 `propose_to_human`：把一件事交给人

设计行注册（`tools.register`，全局，参数与输出 schema 在 rc.3 校验的子集内）；名字在 `DESIGN_TOOL_NAMES` 里，进 `ORCHESTRATION_RESIDENT_TOOLS`（GLM 上常驻）；非主 Agent 的工具面去掉它（§2.1）。文件 `src/design/propose.ts`。

参数：

```text
{ kind: 'question' | 'confirm' | 'release',
  title, background, proposal, doubt, notTaken,          // 四行与题目，规则见 §3.3
  goal?: string,          // confirm、release：目标 id，必填
  parent?: string,        // question 新提：挂在哪个节点下；缺省为焦点所在的目标，没有焦点时必填
  question?: string,      // question 改一张未拍板的提议式待决（人补充或否掉之后），与 parent 互斥
  sources?: string[] }    // question 新提：来源节点，各成一条 source 连线
```

工具说明：一句用途「Put one matter to the human: one plan in four short lines. The harness checks it, keeps it on the graph when the human decides it, and returns the text to show.」，三种 `kind` 各一句（`question`：只有人能定的事；`confirm`：访谈结束，把需求交给人；`release`：设计做完，把方案交给人放行），然后原样引用 `PLAIN_QUESTION_GUIDE`。

检查，第一条不成立就抛错（文本为 `{code, message, field?, hint}` 的 JSON，同图工具的 `refuse`）：

1. 调用方是主 Agent（`exec.agent`，`isMainAgent`），否则 `forbidden`，`hint`「只有主 Agent 能用；人用 /wish 开启」。
2. 参数合法：不收别的字段；题目与四行按 §3.3；`kind` 与 `goal`、`parent`、`question`、`sources` 的搭配；否则 `invalid`，`field` 与 `hint`。
3. 图行服务在、图目录存在，否则 `not_found`；读图有校验错误时 `graph_invalid`。
4. 本条回复里已经交给人的件数：`shownProposals(session.snapshotEvents())` 里排在最后一条人的消息（`personMessages`）之后的个数加一为 `n`；`n` 大于 3 时 `too_many`，`hint`「at most three matters in one reply: end this reply with one question and wait」。拿不到 `snapshotEvents` 时 `n` 取 1，会话健康记一条。
5. 按 `kind`：
   - `question` 新提：父节点存在且未关闭（`proposed`、`approved`、`doing`），否则 `invalid`。以 `llm` 身份提议 `{type: 'question', parent, title, background, proposal, doubt, notTaken, edges: sources 各一条 source}`，`reason`「主 Agent 在对话里把这件事交给人（propose_to_human <callId>）」；引擎拒绝时把引擎的错误原样抛出。待决挂在未关闭的节点下直接为 `approved`（`initialStatus` 的 `OPEN_PARENT_TYPES`），出现在人的决策队列里。
   - `question` 改：节点存在、是提议式待决、状态 `approved` 或 `doing`，否则 `invalid`（做完的 `hint`「decided; propose a new question」）。以 `llm` 身份 `edit` 题目与四行，`rev` 取刚读到的，`reason`「主 Agent 改了交给人的方案（propose_to_human <callId>）」；`stale_revision` 时重读再试一次。
   - `confirm`：目标存在、未关闭、有效阶段为 `wish` 或 `interview`；`requirementCard` 8 项都齐且目标没有 `supersedes` 连线（0.4 §3.2.3 的门禁）。不齐就 `gate_unmet`，`message` 列出缺的项，`hint` 写出每项该问哪一步、写到哪里。不写图。
   - `release`：目标已批准、有效阶段为 `design`；`releaseGate` 成立（0.4 §3.3.2 的六条）。不成立就 `gate_unmet`，`message` 按决策列出缺的栏与其余缺项。不写图；记下放行集合与每个节点的修订号（放进结果）。
6. `text = renderProposal(题目与四行, n)`。

输出 schema：`{tool: 'propose_to_human', kind, goal?, question?, number, text, releaseSet?: [{id, rev}], message}`。`goal` 是目标 id（`question` 时为父节点所在的目标）；`question` 是待决 id；`message`：「Show text to the human exactly as given; it is Markdown with a blank line between paragraphs. End your reply with one question for everything you showed, then end your turn. When they answer, restate a loose answer in one line and wait; then call record_human_answer with kind <kind> and their exact words.」。`render` 同图工具，输出 JSON 文本。工具不结束回合：主 Agent 要接着把 `text` 写进回复。

为什么四行由 harness 拼：人这一晚上纠正的三次都是排版（几行之间没有空行，Markdown 把它们并成一坨；标签加粗；重点没有加粗），模型照规矩写也会走样；字段由工具查、文字由 `renderProposal` 拼，排版只有一份实现。主 Agent 有没有把 `text` 原样放进回复，运行时不拦，第 12 步（a）在标定里数（§10）。

`confirm` 与 `release` 不写图：给人看了什么记在会话日志里（这次工具调用与结果），`record_human_answer` 从日志里认它（§3.5），所以重启与压缩之后仍能核对（压缩只加检查点，不删事件，0.4 §2.3）。

### 3.5 `record_human_answer`：把人的回话记进图

设计行注册，同上；文件 `src/design/record.ts`。

参数：

```text
{ kind: 'question' | 'confirm' | 'release',
  goal?: string,          // confirm、release
  question?: string,      // question：待决 id
  answer: 'agree' | 'add' | 'reject',
  words: string[],        // 人的原话，1–3 段，逐字从人的消息里摘
  recordedAs: string }    // 一行：记成什么（同意时是结论；补充、否掉时是主 Agent 的复述）
```

检查：

1. 调用方是主 Agent，否则 `forbidden`。
2. 参数合法：`words` 1–3 段，每段去掉首尾空白后非空、不超过 500 个码点，拼起来（段间换行）不超过 2,000 字符（与 `relay` 同上限）；`recordedAs` 一行、非空、不超过 120 个码点；否则 `invalid`。
3. 图与目标同 `propose_to_human` 第 3 条；`question` 时节点是提议式待决、状态 `approved`、`doing` 或 `done`（人改主意时可以再拍）；`confirm`、`release` 时目标存在、未关闭。
4. 起点（人的话必须在这之后）：
   - `question`：这张待决最后一条 `propose`、`edit` 或 `decide` 历史的 `at`（人同意的是它最新的那一版；人在面板上拍过板之后，要人在那之后说的话才能再拍，0.4「卡片不改面板上的拍板结果」由此保留）。
   - `confirm`、`release`：本会话里最后一次 `kind` 与 `goal` 都相同的 `shownProposals` 结果的 `time`；没有时 `not_shown`，`hint`「show it with propose_to_human first, in this session」。
5. `personSaid(events, words, 起点)`（§3.6）不成立时 `invalid`，`field: 'words'`，`message` 写明哪一段没找到，`hint`「quote the human's own words exactly, from a message they sent after you showed the proposal; if they have not answered yet, end your turn and wait」。拿不到 `snapshotEvents` 或解析抛错时 `unavailable`，`hint`「the harness cannot read this session's messages, so nothing was recorded; tell the human」，会话健康 degraded。
6. 按下表写图。全部以 `llm` 身份写，同意的那几条带 `relay`（人的原话，段间换行），引擎因此给它们人的权限（`src/graph/engine.ts`:154）；批注不带 `relay`（引擎对 `comment` 丢掉 `relay`，:150），原话写进批注正文。

| `kind` | `answer` | 写图 | `outcome` 与给模型的下一步 |
| --- | --- | --- | --- |
| `question` | `agree` | `decide {conclusion: recordedAs}`，`relay`，`reason`「人在对话里同意（record_human_answer <callId>）」 | `decided`；照结论继续 |
| `question` | `add` | 在待决上批注「人在对话里补充：「<原话>」；主 Agent 记成：<recordedAs>（record_human_answer <callId>）」 | `added`；改好方案后 `propose_to_human`（`question` 填这张待决）再给人看 |
| `question` | `reject` | 批注「人在对话里否掉：「<原话>」；主 Agent 记成：<recordedAs>（record_human_answer <callId>）」 | `rejected`；换一个方案同样再提；人要的是这件事不用定了时，带人的原话 `graph_status` 改为 `dropped` |
| `confirm` | `agree` | 重查需求卡门禁（同 `propose_to_human`；两者之间图可能变了），不成立时 `gate_unmet`、不写；成立时目标仍是提议则 `approve`，再 `edit` 设 `stage: 'design'`，两条都带 `relay`，`reason` 同上 | `confirmed`，`stage: 'design'`；开始做方案 |
| `confirm` | `add`、`reject` | 在目标上批注，说法同 `question` 两行 | `added` 或 `rejected`；改需求后再 `propose_to_human`（`confirm`） |
| `release` | `agree` | 重查放行门禁；按提议时记下的修订号逐个 `approve` 放行集合，带 `relay`；全部成功且目标子树里不再有提议时 `edit` 设 `stage: 'release'`，带 `relay` | `released`，`approved`、`stage`；跳过的节点进 `skipped`，`outcome` 为 `partial`，不改阶段，`message` 列出它们，改好后再提（0.4 §3.4.2「部分失败」的规则，修订号与跳过的判法照旧） |
| `release` | `add`、`reject` | 在目标上批注，说法同上 | `added` 或 `rejected`；按人的话改方案，再提 |

写入的次序与修订号同 0.4（§3.2.3、§3.4.2）：每条写入带重新读到的修订号，后一条带前一条结果里的 `rev`；`stale_revision` 时重读再试一次，仍失败就抛引擎的错误，`hint` 带上人的原话（「nothing more was recorded; the human said: …」）。

输出 schema：`{outcome: 'decided' | 'confirmed' | 'released' | 'partial' | 'added' | 'rejected', message, stage?, approved?: string[], skipped?: [{id, code}]}`。

三种说法是固定的：同意写在 `decide`、`approve`、`edit` 的 `reason` 里（「人在对话里同意」），补充与否掉写在批注开头（「人在对话里补充：」「人在对话里否掉：」）。指标流水按这三个前缀数原样同意、补充、否掉的比例（方案第五点）；放行由这一次 `edit` 写入认出（`d-auto-drive`，§9 第 7 条）。

0.4 §3.4.3 的「卡片回答以人的身份写图」（D3，`question-21` A）与 `src/design/human-writes.ts` 不再需要：没有卡片，人没有在 harness 发出的界面上点过什么；人说的话在会话日志里，由主 Agent 带原话记，harness 核对原话（§3.6）。写入身份因此是 `llm` 加 `relay`，与引擎已有的「带原话的转述有人的权限」是同一条路；验收里「历史记为人」的字样请人改为「历史带人的原话」（§9 第 1 条）。

### 3.6 人的原话由 harness 核对

`d-chat-not-cards` 之后，确认需求与放行方案这两件只有人能做的事，都由主 Agent 带人的原话写进图。放行之后子 agent 就能写文件（`design-before-release`），M7 起主 Agent 会自己一路推进（`d-auto-drive`）。所以「这段话是人说的」由 harness 核对，不靠模型自觉（`d-failure-plans`：失败要能被发现；这里的失败是模型编出或挪用人的话）。

人发来的消息（`personMessages`）：`snapshotEvents()` 里 `type === 'user/message'`、`data.source.kind === 'user'`、`data.source.form` 不存在的事件；正文是 `data.content` 里 `type: 'text'` 块的文字按换行连起来。依据：桌面版上人在输入框发的话由 api-session-controller 建成 `source: {kind: 'user', rpcId, …}`（:3224–3229〔实读〕），headless 的任务消息是 `source: {kind: 'user'}`（dsh-headless:340–346〔实读〕）；插件的 notice 带 `form: 'notice'`（`createUserNotice`，`src/shared/dsh-min.ts`:462–470），`/wish` 等命令事件是 `command/run`，都不算。排队后被人删掉的消息不会成为事件（api-session-controller:1041–1045）。

`personSaid(events, quotes, afterMs)`：两边都先做 NFKC，再把连续空白换成一个空格、去掉首尾空白；每一段都要是某一条 `time > afterMs` 的人的消息的子串（各段可以出自不同的消息）；全部找到时 `relay` 为各段原文（规整之前的）按换行连起来，否则 `reason` 写明第几段没找到。

防的与不防的：

- 防模型编出人的话、把人很早以前说的话挪来用、把对上一版方案的同意算到这一版上（起点按最新一版算）。
- 不防别的插件伪造人的消息：本仓库的模拟人就是这样代人回话的（§3.10），威胁是模型，不是同一进程里的插件。
- 不防模型把人的话归错类（把「不行」记成同意）：harness 判断不了语义。补救靠三处：人随口回答时先复述「那我记成……」、人确认了再记（身份节）；历史里同时有原话与「记成」那一句，面板与汇报里人看得到；放行之后发现不对，人说一句，主 Agent 带原话把阶段改回 `design`（§3.8 第二条只拦向前）。标定里数「原话不到 6 个码点、前面没有复述」的记录次数（第 12 步（a））。

主 Agent 移到别的会话之后（§2.4），核对只看持有者会话自己的日志：`confirm`、`release` 要在新会话里重新提一次；`question` 按图上的时间判，人在新会话里回话照样算。

### 3.7 五键变成人说的五种话

| 0.4 的键 | 人在对话里会说的，例如 | 主 Agent 做什么 | 图上留下什么 |
| --- | --- | --- | --- |
| 批准 | 「可以」「就这样，放行吧」 | `record_human_answer`，`agree` | 同意的写入，带原话 |
| 拒绝（带理由） | 「不行，钱要能按月看」 | `record_human_answer`，`reject`；按理由重新设计再提 | 「人在对话里否掉：」批注 |
| 补充 | 「另外，数据只放在本机」 | `record_human_answer`，`add`；补进方案再提 | 「人在对话里补充：」批注 |
| 讲细点 | 「为什么这样？」「说细点」 | 展开理由、证据与没选的做法，再问一次；不调工具 | 无 |
| 说重点 | 「太长了」 | 只留结论与要人定的那一处，再问一次；不调工具 | 无 |

人随口说的（「嗯」「行吧」「差不多」）先复述「那我记成：……」，等人确认；记的时候 `words` 取人确认的那句，需要时连同前一句。0.4 的汇报细度一档一档调（`depth`）去掉：系统提示词里的汇报细度只有 GLM 包的旋钮（§2.7），「讲细点」「说重点」只改这一次怎么讲，写进画像属于 M5。

### 3.8 主 Agent 用图工具时的三条规矩（`main-agent-graph`）

主 Agent 也能直接用图工具写图。下面三条在 `tools/pre-execute` 上执行（`src/guard/main-agent.ts`，由 `installMainAgentRules` 一起装，依赖由设计行传入），只对主 Agent（`isMainAgent`，调用名经 `toNativeTool` 后在 `GRAPH_TOOL_NAMES` 里），普通会话与子 agent 不受影响：

1. 转述要是人的原话（第 6 步）：参数带 `relay` 时，按换行切成段，`personSaid(events, 段, 起点)`；起点是目标节点最后一条不是 `comment` 的历史的 `at`，`graph_propose` 新节点时为 0（本会话里任何一条人的消息）。不成立时拒绝。纠偏：事实 `The words you relayed are not in a message the human sent after <node> last changed.`；越界 `Only the human's own words carry their authority.`；正路 `Quote them exactly from their message, or ask them and wait; to record an answer to a proposal, use record_human_answer.`；例外 `none`。
2. 阶段只经门禁向前（第 8 步）：`graph_edit` 设 `stage` 为 `design`（目标的有效阶段是 `wish` 或 `interview` 时）或 `release`（有效阶段是 `design` 时），以及 `graph_approve` 一个有效阶段是 `wish` 或 `interview` 的目标，一律拒绝，带不带原话都一样。纠偏正路：`Put it to the human with propose_to_human (kind confirm or release) and record their answer with record_human_answer; the harness checks the requirement or the design first.` 向后改阶段（例如 `release` 改回 `design`）照引擎规则，要带人的原话（第一条核对）。这一条落实 `m3-6` 验收第 2 条「阶段前进只经门禁」：0.4 留着「带原话转述可以改任意阶段」一条路（0.4 §2.4 表末行），在聊天之后它会绕过需求卡与五栏的门禁。
3. 不给人列选项（第 6 步）：`graph_propose` 一张决定者是人（`decider` 不是 `agent`）且带 `options` 的待决，或 `graph_edit` 给决定者是人的待决设表格字段，拒绝。纠偏正路：`Put a matter for the human with propose_to_human: one plan in four lines, no options. A question you decide yourself takes decider agent.`

两个设计工具的写入在工具体里直接调 `openEngine(dir).apply`，不经图工具，也就不经这三条；它们自己做同样的核对（§3.4、§3.5）。人在面板上的写入是 `human` 身份，不受影响。

失败的处理：第一条读不到会话日志或核对抛错时拒绝（fail-closed），纠偏事实写「the harness cannot read this session's messages」，会话健康 degraded：放行等于把人的权限交给一段核对不了的话。第二、三条读图或判定抛错时放行（fail-open，同 0.4 写入规则），会话健康 degraded：它们管的是走哪条路，权限仍由第一条与引擎守着。三条的拒绝都进违规流水。

### 3.9 去掉的与留下的

去掉（0.4 与 0.2 设计了、不再实现）：

- `decision_card`（0.4 §3.5.1，0.2 §2.4）、`design_review` 的确认卡与五键卡（0.4 §3.2.3、§3.4.1–§3.4.4）、访谈的 `ask_human` 与接缝 A/B/C 的对照（0.2 §2.7，0.3 草稿 §3.3）。
- `src/design/cards.ts`（卡片构造、回答解析、`answerPhrase`）、`src/design/human-writes.ts`（D3）、`src/graph/card-rules.ts`、卡片的忙碌集合、卸载检查里与卡片等待有关的部分、`depth`。
- 设计行对 `userQuestions` 的依赖与 `UserQuestionsService` 薄类型；`hourness-confirm`、`hourness-five-keys`、`hourness-decision` 等问题 id。
- `FIVE_KEYS` 不迁移：第 10 步删 `src/workflow/decisions.ts` 时一起删（0.4 原定迁到 `cards.ts`）。
- 0.2 的兜底规则 `main-agent-ask-card` 改名 `main-agent-ask`，正路改为 §3.8 第三条那一句（第 4 步）。

留下（0.4 照做）：需求卡与五栏的门禁（`src/graph/stage.ts`，main `7aa8fe5`）；放行集合的排序、`supersedes` 的拒绝、按修订号批准、部分失败不改阶段（0.4 §3.3.2、§3.4.2）；有效阶段（0.4 §2.4）；`design-before-release`；面板拍板的回写（§2.4 改为只发给持有者）；流程条；去掉 L1/L2/L3。

### 3.10 模拟人（探针与标定）

0.4 §9.1.2 的模拟人插件（`scripts/calibrate/simulated-human.mjs`）答的是卡片；改为在对话里回话。

- 配置：`{wish?: true | string, answers?: {<GateItem.key>: string}, replies?: {question?: string[], confirm?: string[], release?: string[]}, restateReply?: string, fallback?: string, maxReplies?: number}`。`restateReply` 默认「对」，`fallback` 默认「你按经验定吧」，`maxReplies` 默认 24；未知字段与不合法的项告警并忽略。去掉 0.4 的 `confirm`、`fiveKeys`、`decisions`、`choose`、`freeText`。
- 发 `/wish`：同 0.4 §9.1.2 第 1 条。
- 回话的时机：在 `ctx.on('session/event', …)` 上只收根 agent 会话的 `turn/end`；回话经 `agent.followup(消息)` 发出，消息形状同 headless 的任务消息 `{id, role: 'user', content: [{type: 'text', text}], source: {kind: 'user'}}`（dsh-headless:340–346〔实读〕），所以 §3.6 把它当作人的话。headless 在 agent 静止空闲、且序号没变时才退出（dsh-headless:348–351〔实读〕），回话让 agent 继续跑下一回合〔推断：`turn/end` 时同步 `followup`，headless 的空闲判断看到序号变了；L3 `glm-design-question` 核对一次运行跨过了回合〕。
- 回什么（纯函数 `simulatedReply(context)`，同文件导出，单测直接测），按次序第一条成立的：
  1. 已回满 `maxReplies`：不回。
  2. 这一回合最后一条主 Agent 的消息含「我记成」：回 `restateReply`。
  3. 这一回合有 `propose_to_human` 的结果（`shownProposals`）：每一件按 `kind` 依次取 `replies[kind]` 的下一句（用完时取最后一句；没有配置时 `question` 为「可以，就按推荐的来」、`confirm` 为「对，就这样」、`release` 为「可以，放行」），多件时按先后用换行连起来，回一次。
  4. 焦点目标的需求卡有缺项：取步号最小的一项（同 §2.3 的次序），回 `answers[key]`；没有配置时回 `fallback`。
  5. 焦点目标的有效阶段不是 `release`：回 `fallback`。
  6. 其余：不回（运行随之结束）。
  每次回话或不回都在 `human.jsonl` 写一条 `{kind: 'reply' | 'silent', rule, text?, shown: [{kind, number}]}`。图目录取 `ctx.get('glmHournessGraph')?.dirFor(cwd)`，用 `dist/graph/store.js` 的 `loadGraph` 读，需求卡用 `dist/graph/stage.js`（同 0.4 §9.1.1 的占位做法）。
- 卡片：覆盖层仍插入 `tool-ask-user`（好核对它对主 Agent 藏起来了），模拟人在每个 agent 上监听 `user-questions/request`，收到就以 `ASK_CANCELLED` 拒绝并写 `{kind: 'unexpected-question', id}`：主 Agent 不该出卡，出了就是要量的违规。

## 4. 逐步的改动

每步的门禁、提交、文档同批与 0.4 §8 相同。「今天必败」写的是新增或改了的检查；0.4 原有的检查不变时不重复。「验收（待人改）」列这一步碰到的、要请人改字句的验收条件（§9 第 1 条）：实现照本附录做，L2、L3 按本附录写；人改字句之前，图上的旧字句与本附录冲突的地方以人后来的决定 `d-chat-not-cards`、`d-one-main-agent` 为准，并在第 12 步（b）合入前由编排者确认人已改好。

### 开工之前：两个工作树快进到 main

`.worktrees/m3`、`.worktrees/m3-flow` 都在 `eb614ab`，分支没有自己的提交；在两个工作树里各跑 `git merge --ff-only main`（main 当时的提交），装依赖、`npm run build`。快进失败（分支上有了提交）时停下交编排者。原因见文件头：`6134c83` 改了行命名、`scripts/packages.mjs`、探针脚本与客户端入口，M3 的改动都碰这些文件。

### 第 3 步（m3-1：主 Agent 模式、持有者与身份）

变化：

- 行登记按 `6134c83` 的命名：`packages/hourness/cordis.patch.yml` 在 `glm-hourness/graph-panel` 之后、`glm-hourness/ui` 之前插 `{id: glm-hourness/design, name: dsh-hourness/design, disabled: true}`；`scripts/packages.mjs` 的 `hourness.src` 加 `design`、`rows` 加 `{id: 'glm-hourness/design', module: 'design/index'}`；`packages/hourness/locale/design/zh.json`、`en.json` 写设置页的标题与说明（「主 Agent 与设计循环」：「/wish 让一个会话当这个项目的主 Agent：在对话里问清楚、出方案给你批，自己不写文件。」）。`tests/contracts.spec.ts` 的字面行 id 清单加一项。
- `/wish` 与持有者记录（§2.4，`src/graph/main-agent-holder.ts`、`src/design/mode.ts`）。
- 身份节（§2.2）；新建 `src/design/talk.ts`（本步只有 `TALK_GUIDE`、`HIDDEN_FROM_MAIN_AGENT`、两个工具名常量与 `ProposalKind`）与 `src/graph/plain-question.ts`（§2.8）。
- `installAgentHooks` 多装 `roleFace`（§2.1），本步只有主 Agent 的一支：去掉原生名为 `write`、`edit` 的工具与 `ask_user_question`，收窄 `str_replace_editor`。人设一节不在这一步。
- `/wish` 的成功回复加强一档模型的一句（§2.6）；`docs/ORCHESTRATION.md` §3.5 补两句；`/wish` 的错误与行健康说明按 §2.8 改两处字串；`docs/ORCHESTRATION.md` §3.1 写「一个项目一个主 Agent」与 `/wish here`。
- 模拟人在这一步只有骨架：发 `/wish`；卡片请求以 `ASK_CANCELLED` 拒绝并记 `unexpected-question`；没有配置回话时不回。

验收（待人改）：`m3-1` 第 3 条（§9 第 1 条的新字句）。本步做到去掉写文件的工具与 `ask_user_question`；两个设计工具在第 6 步加上。

L2（`tests/design-mode.spec.ts`、新 `tests/main-agent-holder.spec.ts`、新 `tests/plain-question.spec.ts`）：

- 身份节：第一部分不超过 1,500 字符、含五项；第二部分等于 `TALK_GUIDE` 加换行加 `PLAIN_QUESTION_GUIDE`，不超过 1,400；整节不超过 2,700；§2.2 列的不许出现与必须出现的字样。删去 0.4 里「长度上限 9000」一例。
- 工具面：主 Agent 的组装结果没有 `Write`、`Edit`、`write`、`edit`、`ask_user_question`（有方言服务与没有方言服务各一遍，后者走静态表），`str_replace_editor` 的 `command` 只剩 `view`（假宿主的组装带上这几个工具），形状不对时去掉并报会话健康；`roleFace` 不带 `prepend` 注册，在一个外层 `prepend` 监听器里 `next()` 得到的工具已经去掉（两种安装先后各一遍）；普通会话的工具面不变。
- 持有者（真实的临时目录当 `userHome`）：第一个会话 `/wish` 建记录；第二个会话 `/wish` 得到指路的回复、角色不变、不写待生效状态；`/wish here` 之后记录换人、原会话（活的）收到 `/wish off` 的命令事件、投影为假；原会话不活时在它下一次 `agent/created` 对齐；fork 出的会话在 `agent/created` 变回普通会话；记录指向已不存在的会话时接管并说明；记录损坏时 `isMainAgent` 按投影判并报 degraded，`/wish` 覆盖它；两个会话同时 `claimHolder` 只有一个成功；持有者 `/wish off` 删记录，非持有者的 `/wish off` 不删；`projectKey` 对大小写不同（win32）与 junction 到达的同一目录相等。
- 字串：`/wish` 的成功文字含「强一点的模型」；`/wish` 的全部回复与行健康说明 `plainWordsIn` 为空。
- `tests/plain-question.spec.ts` 按 §2.8 的表。

今天必败：同 0.4（没有 `wish` 命令）；另：照 0.4 写法实现时主 Agent 的组装结果里有 `Write`、`ask_user_question`，身份节第一部分超过 1,500；第二个会话 `/wish` 也成为主 Agent；导入 `src/graph/plain-question.ts`、`src/graph/main-agent-holder.ts` 失败。

L3：

- `glm-design-main`、`non-glm-design-main` 请求 3 的「工具面等于请求 1 的工具面加两个设计工具」改为「等于请求 1 的工具面去掉 `Write`、`Edit`、`ask_user_question`（非 GLM 为 `write`、`edit`、`ask_user_question`）」；第 6 步起加上两个设计工具（场景的期望随步骤扩展，每步都跑探针）。请求 8（`/wish off` 之后）恢复请求 1 的工具面。
- `glm-design-wish-idle`、`non-glm-design-wish-idle`（N8）：0.4 §9.1.3 的请求 1 写「有 `hourness:main-agent` 与两个设计工具」；本步只核对身份节与工具面去掉的三个工具，第 6 步起再核对两个设计工具。
- 新场景 `glm-design-one-main`（`probe-full`，模拟人 `wish: true`）：探针 provider 的脚本步加字段 `other: {line: string}`，第一次用到时经 `ctx.get('agents').create({sessionId: '<场景>-other', meta: {cwd}})` 建第二个根会话（headless 同样这样建会话，dsh-headless:316〔实读〕；探针里这样做是〔推断〕），再 `commands.execute(第二个 agent, line, [], signal)`，结果记进 dump（同 `line` 的记法）。脚本：请求 1 主会话已是主 Agent；`other: {line: '/wish'}` 的结果文本含「这个项目的主 Agent 在另一个会话里」与 `/wish here`；`other: {line: '/wish here'}` 成功；请求 3：主会话没有身份节、工具面恢复，消息里有「主 Agent 在另一个会话里」的 notice；持有者记录指向第二个会话；主会话 `Write .llm/x.txt` 执行。

依赖：开工之前的快进；`src/graph/main-agent.ts` 在 main。无独立评审（同 0.4）。

### 第 4 步（m3-1：`main-agent-no-write`、git 快照、`main-agent-ask`）

变化：

- `main-agent-no-write`：规则、判写、纠偏同 0.4（§3.1.4）。主 Agent 的工具面里已经没有写工具，这条规则是兜底；身份节不再逐条声明规则（§2.2 第一部分一句），0.4 §3.1.4「声明写在身份节里（第 3 条）」改为「身份节一句点名」。判写照旧继承 file-tools-only 的 `shellWrites`，git 子命令不算写（`src/guard/rules.ts`:123–126），这正是 `d-main-agent-shell` 要的。
- git 快照（§2.5）：`src/guard/git-snapshot.ts`、`src/guard/shell.ts` 的 `simpleCommands`；在同一个 `tools/pre-execute` 监听器里，先判写文件（拒绝），再判 git（存快照后放行，存不了时拒绝）。只对主 Agent（`isMainAgent`，自己就是根）。
- `main-agent-ask`：主 Agent 按名调用 `HIDDEN_FROM_MAIN_AGENT` 里的工具（经 `toNativeTool`）时拒绝；纠偏四段：事实 `You called ask_user_question.`；越界 `As the main agent you talk with the human in plain chat, without option cards.`；正路 `Ask in your reply in plain words, or put a plan to them with propose_to_human.`；例外 `none`。进违规流水；读角色或判定抛错时放行（fail-open，同 0.4 写入规则），会话健康 degraded。

L2（`tests/design-guard.spec.ts`、新 `tests/git-snapshot.spec.ts`）：

- `main-agent-no-write`：同 0.4，另加主 Agent 按名直接调用不在工具面上的 `Write`、`write`、`Edit` 被拒并进违规流水；`DeferredToolCall {name: 'Write'}` 返回工具错误、目标文件不存在；`str_replace_editor` 的 `create`、`str_replace`、`insert` 被拒，`view` 放行；`git commit -m x`、`git status` 放行（不当写文件）。
- git 快照（真实 git，系统临时目录里的仓库，本地裸仓库当远端）：`git status`、`git log`、`git diff`、`git commit -m x`、`git fetch`、`git branch x` 不存快照；`git checkout -- a.txt`（`a.txt` 有改动）之后 `refs/hourness/snapshots/<id>` 存在、`git stash apply <S>` 恢复改动、流水一行、notice 正文含这条恢复命令；`git reset --hard HEAD~1` 之后标签 `hourness-snapshot/<id>` 存在、旧提交从它可达；`git branch -D x` 之后 `git branch x <原值>` 恢复；`git clean -fd` 之后被删的未跟踪文件能用 `git restore --source=<K> --worktree -- <路径>` 恢复；`git clean` 超过上限（测试把上限调小）时拒绝、文件还在；`git push --force` 之后远端旧的提交在 `refs/hourness/snapshots/<id>/remote/<分支>`；合并冲突没解决时 `git merge --abort` 照样存下（走 `W` 的退路）；`echo "git reset --hard"` 不触发；`cd $X; git reset --hard` 被拒；`git -C sub reset --hard` 在 `sub` 存快照；`!` 开头的别名当作 `both`；不是仓库的目录放行、不存；找不到 git 时放行并报 degraded；某一步失败（测试注入）时拒绝、进违规流水，纠偏是 `git-snapshot` 的四段；写流水失败时放行并报 degraded。
- `main-agent-ask`：主 Agent 按名调用 `ask_user_question` 被拒并进违规流水，非主 Agent 照常。

今天必败：同 0.4；另：导入 `src/guard/git-snapshot.ts` 失败；主 Agent 的 `git checkout -- a.txt` 之后改动丢失、没有快照；按名调用 `ask_user_question` 被放行。

L3：`glm-design-main` 加三步：`Bash git status` 执行、没有 `glm-git-snapshot` notice；`Bash git checkout -- README.md`（场景先改一行 `README.md`）执行，下一步请求里有 `glm-git-snapshot` notice，探针的场景核对读到 `refs/hourness/snapshots/` 下一个引用；按名调用 `ask_user_question` 被拒，纠偏是 `main-agent-ask` 的。请求 3、4 的 `Write` 与 shell 写入此时是按名调用工具面上没有的工具，照样被拒，正好核对兜底。

依赖：无新增。独立评审：是（guard 规则；git 快照碰用户的检出，§1.1 第二类）。与其他分支的先后：运行 `wf_e48380fb20a69493` 若改了 `src/guard/rules.ts` 的 `APPLICATION_PROTOCOL`，本步在同一文件里导出 `fileWriteTarget`、`shellWriteOf`；谁先合入 main，另一方 rebase 后重跑门禁（`question-28` C：同文件串行，由编排方排）。

### 第 5 步（m3-3、m3-6：阶段提醒与设计期只读）

变化：阶段提醒按 §2.3：访谈的做法一行、按步号取的「下一步」与 §4.2 的问句、写图格式、`confirm` 与 `release` 的下一步；`stage.ts` 两条 `hint` 改写；不写 `如果失败：`（第 9 步）。`design-before-release` 同 0.4，正路一句改为 `The main agent puts the design to the human with propose_to_human; once the goal of its focus is released, the work can be dispatched again.`，例外一句改为 `If a write is needed to answer a design question (a spike), report back and let the main agent put the question to the human.`。

L2（`tests/design-stage-notice.spec.ts`、`tests/graph-stage.spec.ts`）：`interview` 阶段缺「问题」时正文含 `做成以后，你的日子会有什么不一样` 与访谈做法一行；只缺约束与成功时「下一步」问的是成功（`你会怎么检查它真的做成了`），不是约束；只缺 `goal:supersedes` 时没有「下一步」一行，有它的 `label` 与 `hint`；只缺 `choice` 时「下一步」是 `propose_to_human (kind question)` 那一行（N5）；8 项都齐时是 `kind confirm` 那一行；对照表的键与 `requirementCard` 的 8 个键一一对应；`design` 阶段正文含三个标签，门禁成立时含 `kind release`；所有阶段的正文不含 §2.3 末条列的字样；两条 `hint` 不含 `decision_card`。

今天必败：同 0.4；另：`interview` 阶段的提醒里没有 §4.2 的问句；`choice` 的 `hint` 含 `decision_card`（main 上今天的文字）。

L3：`glm-design-stage` 请求 3 的提醒另核对含下一项的问句。依赖：无新增。独立评审：是。

### 第 6 步（m3-5：提议式待决、`propose_to_human` 与 `record_human_answer` 的 `question` 一种）

变化：

- 图引擎的提议式待决（§3.3）：`src/graph/proposal.ts`（新）、`schema.ts`、`format.ts`、`engine.ts`、`mutation.ts`、`tools.ts`、`stage.ts`、`projection.ts`、`panel-row.ts`；`background` 字段与 `PLAIN_LIMITS` 在 plain-ui 第 1 步没有先合入时按 §2.9 建；面板三个文件的最小显示。
- `src/design/talk.ts` 补齐 `personMessages`、`personSaid`、`shownProposals`（§3.2、§3.6）；`src/shared/dsh-min.ts` 加 `SessionEventLike` 与 `snapshotEvents?`。
- `src/design/propose.ts`、`src/design/record.ts` 的 `question` 一种（§3.4、§3.5）；`confirm`、`release` 两种在参数校验里先拒绝（`invalid`，`hint`「not yet」），第 8、9 步打开。
- `src/shared/tool-names.ts`：`DESIGN_TOOL_NAMES = ['propose_to_human', 'record_human_answer']`，进 `ORCHESTRATION_RESIDENT_TOOLS`；契约测试同 0.4 的写法。`roleFace` 加非主 Agent 去掉设计工具的一支。
- `main-agent-graph` 的第一、三条（§3.8）。
- 模拟人的 `replies.question`、`restateReply`、`maxReplies` 与回话时机（§3.10 第 1–3 条）。
- 文档：`docs/ORCHESTRATION.md` §2.9 的待决一行（两种形状）、§5 决策卡一节（改为「要人定的事」：主 Agent 在对话里提，待决留在图上，人当场或之后在同一个对话里回话）、§2.6（给人看的不再是选项卡）；`docs/DESIGN.md` 的图格式一节。

验收（待人改）：`m3-5` 第 1 条（§9 第 1 条）。

L2：

- §3.3 列的引擎、格式与投影测试。
- `tests/propose-to-human.spec.ts`：参数的每条规则各一例（题目与四行、标签开头、没有加粗或两处加粗、加粗过长、超长、多行、`parent` 与 `question` 互斥）；新提写出提议式待决，字段等于参数，状态 `approved`，`reason` 含调用 id；改未拍板的待决成功，改做完的被拒；`text` 逐字等于 `renderProposal`；同一条回复里第 4 件被拒（`too_many`），人发了消息之后计数从 1 起；子 agent 与普通会话调用 `forbidden`；工具说明含 `PLAIN_QUESTION_GUIDE`；`renderProposal` 的标签与固定文字 `plainWordsIn` 为空。
- `tests/record-human-answer.spec.ts`（假会话带 `snapshotEvents`，事件形状照 rc.3）：人在提议之后说的原话同意，待决做完、`conclusion` 等于 `recordedAs`、`relay` 等于原话、`reason` 是「人在对话里同意」开头；原话出自提议之前的消息、出自 notice、出自主 Agent 自己的消息、是编的，都 `invalid`、图不变；原话里全角与半角、空白不同仍算（NFKC 与空白规整）；两段原话出自两条消息；`add`、`reject` 写批注、待决仍开着、批注开头是两个固定前缀；拿不到 `snapshotEvents` 时 `unavailable`、图不变。
- `tests/design-guard.spec.ts`：`main-agent-graph` 第一条（`graph_decide`、`graph_approve`、`graph_status` 带编的原话被拒、带真的原话放行）、第三条（`graph_propose` 带 `options` 的人定待决被拒，`decider: 'agent'` 的放行）；普通会话照旧。
- `tests/simulated-human.spec.ts`：`simulatedReply` 的第 1、2、3 条。

今天必败：`propose_to_human` 不存在；`format.ts` 拒绝没有 `options` 的待决（:398）；`graph_decide` 没有 `conclusion`；主 Agent 带编的原话 `graph_decide` 成功。

L3：`glm-decision-card` 改为 `glm-design-question`（`probe-full`；模拟人 `wish: true`、`replies: {question: ['可以，就按推荐的来']}`；图里预置一个人提议（因而已批准）的 `goal-1`）：

1. 回复 `graph_focus goal-1`。
2. 回复 `propose_to_human`（`kind: question`，四行取例题）：结果的 `text` 逐字等于例题的 `renderProposal`；`question-1` 是提议式待决、`approved`，在 `openItems.questions` 里。
3. 回复一段文字（`text` 原样加一句「按这个来吗？」），回合结束：`human.jsonl` 有一条 `reply`、`rule` 为 3；一次运行跨过了回合（下一个请求到达）。
4. 请求 4：消息里有模拟人的那句话（`source.kind` 为 `user`）。回复 `record_human_answer`（`agree`，`words` 为模拟人的原话）：`decided`；`question-1` 做完，`conclusion` 与 `relay` 都在，最后一次 `decide` 的历史带 `relay`。
5. 回复 `record_human_answer`，`words` 为编的一句：`invalid`、图不变。
6. 回复 `graph_propose` 一张带 `options` 的人定待决：被 `main-agent-graph` 拒绝，违规流水多一条。
7. 回复 `done`；`human.jsonl` 里没有 `unexpected-question`。

`glm-design-main` 请求 3 的工具面加上两个设计工具；两个 wish-idle 场景同样加上。

依赖：card-fields-table 已在 main（`e22282f`）。plain-ui 第 1 步若已合入，用它的 `background` 与 `PLAIN_LIMITS`（§2.9）。独立评审：是（图引擎的格式与权限、人的权限从哪来）。

### 第 7 步（m3-5：面板拍板的回写）

变化：回写只发给持有者（§2.4「其他读法」第一条）；其余同 0.4 §3.5.2。plain-ui §12 M3 第 2 条（把面板上「都不要」「补充」的批注也通知主 Agent）依赖 plain-ui 面板改版的动作，M3 不预留。

验收（待人改）：`m3-5` 第 2 条（§9 第 1 条）。

L2（`tests/graph-panel-apply.spec.ts`）：0.4 的「两个主 Agent 会话 A、B 焦点在不同目标下」与「两个主 Agent 焦点在同一目标下都收到」两例改为「投影为真而不是持有者的会话收不到」；持有者记录读不到时退回四条件扫描、结果行注明；两个工作区同 id 的那一例保留。

L3：`glm-design-stage` 请求 6 的 `glm-graph-decision` notice 照旧到达（持有者就是本会话）。依赖：第 3 步。无独立评审（同 0.4）。

### 第 8 步（m3-2：确认需求一支、标定任务与运行隔离）

变化：

- `propose_to_human` 与 `record_human_answer` 打开 `confirm` 一种（§3.4、§3.5）；`main-agent-graph` 第二条（§3.8）。
- 模拟人补齐 `answers`、`replies.confirm` 与 §3.10 第 4–6 条。
- 标定任务 `tests/calibration/interview-expense-log/`：题面与夹具同 0.4 §9.2；`task.json` 改为

  ```json
  {"kind": "interview", "touches": ["docs/graph/"], "limits": {"maxSteps": 120, "minutes": 40},
   "human": {"wish": true,
     "answers": {"need": "我想要一个命令行小工具，每天记一下花了多少钱，月底能看出钱花在哪了",
                 "problem": "月底我能一眼看出钱主要花在吃饭、交通还是别的上面", "audience": "就我自己用",
                 "acceptance": "我输入一笔花销，月底跑一个命令能看到按类别的合计",
                 "non-goals": "不要手机版，也不要联网", "constraints": "数据只存在本机，一个文件就够",
                 "risks": "我可能懒得每天记"},
     "replies": {"question": ["可以，就按推荐的来"], "confirm": ["对，就这样"],
                 "release": ["补充：月底的汇总按金额从大到小排", "可以，放行"]}}}
  ```

  步数上限从 0.4 的 90 加到 120、时间从 30 加到 40 分钟：对话里每问一次多一个回合与一次回话（0.4 §9.2 的估计按工具调用里回来的回答算，约 30–45 步；对话多出访谈约 8 个回合的往返）。`stop` 为 `step-limit` 或 `time-limit` 时照 0.4 记作「边界不够」。运行器对 `interview` 种类加 0.4 §9.1 的三条覆盖行。0.4 §9.2 末条「整段访谈要在一个回合里完成」作废：人的回答从对话里回来，回合要结束，模拟人在回合结束时回话（§3.10）。
- `check.mjs`（独立进程，读运行目录里 `ws/docs/graph` 与违规流水）在 0.4 §9.2 的基础上改三条：第 2 条「至少 1 个已拍板的待决」改为「至少 1 个做完的提议式待决，最后一次 `decide` 带 `relay`」；第 4 条「放行的节点都由卡片批准」改为每个放行的节点有一条 `op: 'approve'`、带 `relay`、`reason` 含 `record_human_answer` 的记录；第 5 条改为目标历史里有带 `relay`、`reason` 含 `record_human_answer` 的批准与两次改阶段，以及一条以「人在对话里补充：」开头的批注。
- 运行器的 `HUMAN_TOOLS`（`scripts/calibrate/run-calibrate.mjs`:38）今天是 `['ask_user_question']`，用来数打扰人的次数；改为数模拟人回话的次数（`human.jsonl` 的 `reply` 条数），`HUMAN_TOOLS` 只留作「主 Agent 不该调用的工具」的计数。
- 标定运行与仓库隔离（`risk-calib-read`，同 0.2 第 8 步，全文照录）：新模块 `scripts/calibrate/run-dir.mjs`，运行器调用它，仓库根由参数传入（测试用临时目录当仓库）：
  - `openBatch(repo, stamp)`：建 `<repo>/.llm/calibration-runs/<stamp>/`（今天的位置，gitignored）；在系统临时目录建一个批目录 `fs.mkdtempSync(join(os.tmpdir(), 'glm-hourness-calib-batch-'))`，`results.json` 写在这里；在仓库那一边写 `pending.json`：`{root: <批目录>, runs: []}`。
  - `openRun(batch, name)`：每次运行在系统临时目录单独建一个 `mkdtempSync(join(tmpdir(), 'glm-hourness-calib-run-'))`，不嵌在批目录里（工作区的 `..` 到不了同批其他运行）；开跑之前把 `{name, dir}` 记进 `pending.json`（先写临时文件再改名）。运行器今天写进运行目录的东西照旧全写在这里：`calibrate.patch.yml`、`events.jsonl`、`stderr.txt`、`check.txt`、`check/`、`limits.jsonl`、`home/`（含 `audit/violations.jsonl`）、`dsh-home/`（含 `glm-hourness/audit/usage.jsonl` 与附件）、`human.jsonl`、`result.json`、`ws/`（含 `ws/.git`）（`scripts/calibrate/run-calibrate.mjs`:97–133、150–157、227–237；`scripts/sandbox.mjs` `dataRows`、`attachmentsIn`）。验收脚本照旧在会话结束后由运行器从仓库里的任务目录执行，不复制进工作区（:155）。运行目录名照今天的 `${task.id}--${model}[--k]`（:227）。
  - `closeBatch(batch)`：整批跑完之后一次拷回。批目录拷到 `<repo>/.llm/calibration-runs/<stamp>/`，每个运行目录拷到 `<stamp>/<name>/`，整棵树原样拷（`fs.cpSync(src, dst, {recursive: true, errorOnExist: true, force: false})`，含 `ws/.git`）。拷完核对：源里的每个文件在目标里都有，相对路径与字节数相同。全部一致才删临时目录：只删 `pending.json` 里记着的路径，且每个都必须是 `os.tmpdir()` 的直接子目录、名字以 `glm-hourness-calib-` 开头，不合这两条的不删并报出来；删完再删 `pending.json`。
  - 失败：拷回或核对出错时不删任何临时目录，`pending.json` 留着，运行器打印「拷回没有完成：临时目录 <路径…> 保留；修好后运行 npm run calibrate -- --collect <stamp>」并以退出码 1 结束。运行器中途崩溃时同样留下 `pending.json`。
  - 恢复：`npm run calibrate -- --collect <stamp>` 不跑新的运行，只按 `pending.json` 做 `closeBatch`。
  - 残余：被测模型仍能按绝对路径读仓库（guard 不拦读），也能列出系统临时目录找到同批其他运行；提示词与会话里不出现仓库路径与临时目录路径。记在 §10。

验收（待人改）：`m3-2` 第 2、3 条（§9 第 1 条）。

L2：`tests/record-human-answer.spec.ts` 加 `confirm`：需求卡不齐时 `propose_to_human` 返回 `gate_unmet` 且不返回 `text`；提议之后同意，目标由提议变为已批准、阶段为 `design`，两条历史带 `relay`；提议与回话之间有人在面板上改了目标、需求卡不再齐时 `record_human_answer` 返回 `gate_unmet`、图不变；本会话里没有提过 `confirm` 时 `not_shown`。`tests/design-guard.spec.ts` 加 `main-agent-graph` 第二条：主 Agent `graph_edit` 设 `stage: 'design'` 与 `graph_approve` 访谈中的目标被拒，带真的原话也被拒；`release` 改回 `design` 带真的原话放行。`tests/simulated-human.spec.ts` 加第 4–6 条。新测试 `tests/calibrate-run-dir.spec.ts`（同 0.2 第 8 步）：运行目录与批目录都不在仓库下，也不互相嵌套；`closeBatch` 之后目标里有源里的每一个文件（含嵌套目录里的文件与 `ws/.git/HEAD`），字节数相同，临时目录与 `pending.json` 都已删除；目标里预先放一个同名文件让拷贝失败时，临时目录与 `pending.json` 都保留，返回值列出临时目录的路径；模拟崩溃之后 `collect` 拷回并清理；`pending.json` 里伪造一个仓库下的路径或不带前缀的路径时，它不被删除并被报出。

今天必败：`propose_to_human` 的 `confirm` 返回 `invalid`（第 6 步留下的「not yet」）；主 Agent 带原话 `graph_edit` 设 `stage: 'design'` 成功；导入 `scripts/calibrate/run-dir.mjs` 失败；今天的运行器把运行目录建在仓库的 `.llm/calibration-runs/` 下（`scripts/calibrate/run-calibrate.mjs`:89）。

L3：`glm-design-interview` 改为对话：脚本化的模型按八步写图，每步一个回合，回合末是一句问话，模拟人按 `answers` 回话；需求卡缺项时 `propose_to_human`（`confirm`）报 `gate_unmet`；补齐后提议、模拟人回「对，就这样」、`record_human_answer` 同意，目标为已批准、`stage: design`，两条历史带 `relay`、`reason` 含调用 id；主 Agent 中途试一次 `graph_edit` 设 `stage: 'design'` 被拒。依赖：第 6 步。独立评审：是。

### 第 9 步（m3-3、m3-4：放行一支、五栏门禁的修正）

变化：

- `propose_to_human` 与 `record_human_answer` 打开 `release` 一种（§3.4、§3.5）；模拟人补齐 `replies.release`。
- 事前验尸一行（`question-29` C）：设计决策正文可选一行 `如果失败：<最可能的原因>`，不进五栏门禁、缺了不拦。`designColumns` 今天只按 `COLUMN_LABELS = ['理由', '架构', '查过的现成方案']` 切节，一节到下一个已知标签为止（`src/graph/stage.ts`:61–80、146–150），未知标签会并进前一节：空的「查过的现成方案：」后面接一行「如果失败：…」时那一栏变成非空，五栏门禁误放行。所以 `src/graph/stage.ts` 加 `PARSED_LABELS = [...COLUMN_LABELS, '如果失败']`，`designColumns` 用它切节，门禁仍只看三栏。设计阶段提醒加一行 `Optionally add a line "如果失败：<the likeliest reason it fails>" to a decision body; when you put the design to the human, the 疑问 line says it in plain words.`。0.2 原定把它显示在五键卡上；没有卡片之后，它是放行提议里「疑问」一行的来源（`d-chat-not-cards`：写明最可能不对的是哪一处）。
- 五栏门禁的两处标签按 §2.8 改成人话（`src/graph/stage.ts`；`tests/graph-stage.spec.ts` 里钉这两个标签的断言同改）。

验收（待人改）：`m3-3` 第 1、3 条，`m3-4` 第 1–3 条，`m3-6` 第 2 条（§9 第 1 条）。

L2：`tests/record-human-answer.spec.ts` 加 `release`：门禁不成立时 `gate_unmet`、不返回 `text`；提议之后同意，放行集合全部为已批准、目标 `stage: release`，每条批准与改阶段都带 `relay`；提议之后有一个节点被改过（修订号变了）时它进 `skipped`、`outcome: 'partial'`、阶段不改；提议之后新提了一个节点时阶段不改、`message` 列出它；`add` 与 `reject` 写批注、阶段不改。`tests/graph-stage.spec.ts`：正文为「理由：…／架构：…／查过的现成方案：（空）／如果失败：…」时 `designColumns` 的架构一项 `ok` 为假、`propose_to_human`（`release`）返回 `gate_unmet` 且缺项含「架构（含查过的现成方案）」；有 `如果失败：` 一行时「架构」一节的值不含它；门禁的全部 `label` `plainWordsIn` 为空。`tests/design-stage-notice.spec.ts`：设计阶段的提醒含 `如果失败：`。

今天必败：`release` 返回 `invalid`；上面那段正文在今天的 `designColumns` 下架构一项为 `ok`；`目标（验收条件）` 标签含「验收」。

L3：`glm-design-release` 改为对话（模拟人 `replies.release` 为「补充：…」「可以，放行」）：缺一栏时 `gate_unmet`；补齐后提议，模拟人补充，`record_human_answer`（`add`）写「人在对话里补充：」批注、阶段不改；主 Agent 改方案再提，模拟人同意，放行集合全部为已批准、目标 `stage: release`；另加一个带 `如果失败：` 的决策；放行之后子 agent 的 `Write` 执行。依赖：第 8 步。独立评审：是。

### 第 10 步（m3-5：去掉 L1/L2/L3）

同 0.4 §3.5.3，两处改：`FIVE_KEYS` 不迁移，随 `src/workflow/decisions.ts` 一起删（knip 基线里的 `types src/workflow/decisions.ts FiveKey` 随之消失，`npm run lint:update` 缩小基线，同一提交）；晨报新增的一节叫「等你定的事」（0.4 叫「决策卡」），内容同 0.4：待你定的件数与最早一件的日期、agent 自己要定的件数、本期拍板的次数按拍板者分为你、你在对话里说、agent。

### `m3-main-persona` 一步（排在第 10 步之后）

内容：§2.7 全部。文件：`src/shared/output-style.ts`（新）、设计行的配置 Schema（`persona`）与 `roleFace` 加节；`packages/hourness/locale/design/` 的设置项说明；`src/glm-prompt/assembly.ts` 与 `index.ts`（识别契约节、两份身份节、`reportingDepth` 与旧键的读法）；`src/glm-prompt/persona.ts` 改名 `reporting-depth.ts` 及其引用（`src/glm-prompt/index.ts`、`assembly.ts` 的注释，`tests/s5.spec.ts`、`tests/dialect-wiring.spec.ts`）；`packages/glm/locale/glm-prompt/` 的设置项说明；文档 `docs/DESIGN.md` §5.2 节表（`glm:reporting-depth`、`hourness:output-style`）、§2.5 的配置说明，`docs/ORCHESTRATION.md` §3.1（人设只给主 Agent）。

L2：

- 人设：主 Agent、`persona.text` 非空时组装结果有这一节（标题、用户文字、范围说明），`interpolate: false`；`text` 为空或全是空白、普通会话、子会话、主 Agent 移走之后的原会话都没有；`/wish off` 的下一步没有；`text` 超过 4,000 码点时不加、行健康 degraded；`name` 有换行与连续空白时规整成一行、超过 40 码点时截断并告警一次、规整后为空时用「主 Agent」。
- GLM 路由：有这一节时身份节开头是 `IDENTITY_OPENING_WITH_STYLE`（按常量比，不写字面），这一节在 `glm:context-management` 之前，start-plan 档在最后一个方言节之后；没有这一节时开头是 `IDENTITY_OPENING_PLAIN`，与改动之前的组装结果逐字相同；方言与设计行两种安装先后结果相同。非 GLM 路由：这一节原样，在身份节与 `glm:guard` 之前。
- 改名：先经 `Config(raw)` 规整再调 `apply`（与 cordis 的 `resolveConfig` 同一条路）：只写 `persona: concise` 时细度为 concise、告警一次、行健康说明有改名一句；只写 `reportingDepth: detailed` 时为 detailed、不告警；两者都写且不同时用 `reportingDepth`、告警一次；两者都写且相同时不告警、行健康说明有「旧键 persona 可以删掉」；两者都不写时为 balanced、不告警。`# Reporting Depth` 的正文与改名前逐字相同。
- 契约：`OUTPUT_STYLE_SECTION` 在两个包的产物里是同一个字符串（`tests/contracts.spec.ts`）。

今天必败：配置了 `persona.text` 的主 Agent 组装结果里没有 `hourness:output-style`；方言的开头总是 `IDENTITY_OPENING_PLAIN`；`glm-prompt` 的 `Config` 里没有 `reportingDepth`；规整只写旧键的配置之后，照带默认值的写法细度为 balanced。

L3（新场景）：`glm-design-persona`（`probe-full`，覆盖行给设计行 `persona: {name: 'PM', text: 'End every reply to the human with 「（PM-MARK）」.'}`，模拟人 `wish: true`）：主 Agent 的请求里身份节开头为 `IDENTITY_OPENING_WITH_STYLE`，有 `# Output Style: PM` 且位于 `# Context management` 之前；脚本派一个子 agent（同 `glm-dispatch`），子会话的请求里没有这一节、开头为 `IDENTITY_OPENING_PLAIN`。`non-glm-design-persona`（`probe-hourness`）：有这一节、开头句不变。

依赖：`m3-1` 在同一分支上已完成。同文件串行：运行 `wf_e48380fb20a69493` 改 `src/glm-prompt/index.ts`、`src/glm-prompt/verbatim.ts` 与身份开头句（3.17.1）、`tests/dialect-wiring.spec.ts`、`docs/DESIGN.md`、`docs/reference/zcode-verbatim.md`；本步改其中的 `src/glm-prompt/index.ts`、`tests/dialect-wiring.spec.ts`、`docs/DESIGN.md`。后合入 main 的一方 rebase，重跑三道门禁与探针（`question-28` C）；本步的 L2 按常量写，开头句的字面变了不用改测试。无独立评审（改的是提示词组装与配置，不涉及凭证、guard 与图引擎权限）。

### 第 11 步（m3-6：流程条与 `/wish` 入口，`.worktrees/m3-flow`）

内容：0.4 第 11 步的流程条，加 §2.6 的全部客户端部分。文件：`ui/src/flow/model.ts`（`flowBarText` 加 `cheapModel`、`isCheapModel`、读不到阶段的新说法）、`ui/src/flow/FlowBar.tsx`、`ui/src/wish/model.ts`（显示规则的三种情形、短标签、按钮动作的选择，纯函数）、`ui/src/wish/WishCard.tsx`、`ui/src/wish/WishPill.tsx`，在 `ui/src/hourness-client.tsx` 注册三个槽项；`scripts/packages.mjs` 编排层客户端的 `sources` 加 `ui/src/flow/`、`ui/src/wish/`（快进之后的 main 上是 `['ui/src/hourness-client.tsx', 'ui/src/dsh.ts', 'ui/src/primitives.d.ts', 'ui/src/graph/']`）。`ui/src/dsh.ts` 按需补 `useSession`、`inputActions`、`useInput` 与 `commands.list` 的薄类型。

L2：`tests/flow-bar.spec.ts` 同 0.4，另加便宜档（`GLM-5.3-Flash`、`gpt-4o-mini`、`claude-3-5-haiku`、`gemini-2.0-flash-lite` 命中；`GLM-5.3`、`gemini-2.5-pro`、`deepseek-chat`、空串、非字符串不命中），读不到阶段的说法；`tests/wish-entry.spec.ts`：开场卡片三种情形的判定（空白与否、主 Agent 与否、有图没图、`/wish` 在不在、`useSession` 拿不到时退到 `sessions.list`），空白且已是主 Agent 时是退出那一行；「接着推进现有项目」只在有未关闭的目标时；按钮在普通会话与主 Agent 会话里的文字；窄于 520 px 的短标签；拿不到 `inputActions` 时换成复制退路；黄字等于「主 Agent 用强一点的模型」、不含「便宜」与模型名（N1）；`ui/src/wish/model.ts` 与 `ui/src/flow/model.ts` 里所有给人看的字串 `plainWordsIn` 为空（客户端测试从 `src/graph/plain-question.ts` 导入，它不用 Node 内置模块）。

今天必败：模块不存在。L4：随第 12 步（b）。

依赖：快进之后的 main（`src/graph/stage.ts`、`src/graph/main-agent.ts` 已在）；plain-ui 0.4 仍在修订：本步按 `mockup-wish.svg` 与 §7.5 写，所有给人看的字串集中在 `ui/src/wish/model.ts` 与 `ui/src/flow/model.ts`，plain-ui 定稿后若改字句或位置，只改这两个文件与 order 常量；`hournessMainAgent` 投影在 `m3` 分支的第 3 步才注册，本步的 L2 只用纯函数，真实显示在合入后的 L4 看。无独立评审。

与 `m3` 分支的合并：两条分支都改 `scripts/packages.mjs`（第 3 步改编排层的 `src` 与 `rows`，本步改客户端 `sources`）与 `docs/ORCHESTRATION.md` §4.8。`m3-flow` 合入 `m3` 时 `scripts/packages.mjs` 两边都留；§4.8 手工合并，按节内的先后把两边的段落都放进去；合入之后在 `.worktrees/m3` 上重跑三道门禁与探针。合入时机：`m3-main-persona` 一步之后、第 12 步（a）之前。

### 第 12 步（a）：标定

在 `m3-main-persona` 与 `m3-flow` 都合入 `m3` 之后跑。运行目录在系统临时目录、整批之后拷回（第 8 步）；模拟人在对话里回话（§3.10）；临时 profile 里设计行的 `persona.text` 为空（标定量的是设计循环，不带人设）。通过的标准同 0.4（GLM-5.3 三次里至少一次通过验收脚本，两档模型的结果都记作基线）。另记的指标（写进 `result.json`）：

- 打扰人：模拟人回话的次数；到放行的轮数（`propose_to_human` 的 `release` 次数）。
- 四行有没有原样给人看：每次 `propose_to_human` 之后，同一回合主 Agent 最后一条消息里有没有逐字包含它的 `text`；没包含的次数。
- 问人的形状：主 Agent 给人的消息里出现选项写法（行首 `A.`、`B)`、`1.` 后接「选」字一类，正则写在 `check.mjs`）的次数；一条消息里问号的个数大于 1 的次数；`plainWordsIn` 命中的次数与词。
- 记录：`record_human_answer` 被拒的次数与原因（原话找不到、门禁）；原话不到 6 个码点、前一条主 Agent 的消息里没有「我记成」的记录次数；`main-agent-graph`、`main-agent-ask`、`main-agent-no-write` 的拒绝次数；`gate_unmet` 次数。

### 第 12 步（b）：合入与批次 L4

0.4 §9.3 的七项改动与新增：

- 第 1 项另看：会话文件里主 Agent 的工具清单没有 `Write`、`Edit`、`ask_user_question`，有 `propose_to_human`、`record_human_answer`。
- 第 3 项改为：访谈是对话：主 Agent 问要什么时是一两句开放的问题；交给人的事是题目一段、背景、推荐、疑问、不做各一段，标签不加粗，每段重点几个字加粗，问话在整条消息最后、只有一句；没有卡片、没有选项与按钮。人在输入框回一句「可以」，4 秒内面板显示这张待决由「你在对话里说」拍板。消息里没有「验收」「标定」「门禁」「投影」「补遗」「附录」。
- 第 4 项改为：人先不回话，这张待决留在面板「需要你」里，显示四行与「在主 Agent 的对话里回话」；之后在同一个对话里回话，它被拍板。两个工作区的那一半照 0.4。
- 第 5 项改为：确认与放行：人回「补充：……」时目标上出现「人在对话里补充：」批注；回「说重点」时主 Agent 换一种更短的讲法再问；回「可以，放行」之后面板里的虚线框变实线，历史写「你在对话里说」与原话。
- 第 6 项另看（`m3-1` 验收第 4 条）：新会话开场画面里卡片在工作区那一行与输入框之间、与输入框同宽；点「接着推进现有项目」之后，会话仍在开场画面时卡片换成「这个会话的 agent 是主 Agent」与退出按钮（截一张）；普通会话输入框下方「交给主 Agent」、主 Agent 会话里「主 Agent」与退出；「写一句你想做的」把 `/wish ` 写进输入框；1280 宽、右侧栏打开时各截一张；GLM-5.3-Flash 上流程条带便宜档提醒，换成 GLM-5.3 后消失。
- 新增第 8 项（`m3-main-persona`）：插件管理器里设计行的「人设」设置位能改、`glm-prompt` 行的 `reportingDepth` 显示正常（各截一张）；设了标记人设之后，主 Agent 的回复带标记，主 Agent 派出的子 agent 写的文件与交回结构里没有标记；清掉设置后恢复。这一项要改桌面版 profile 里设计行的配置，属于改用户 profile（`AGENTS.md` 第 6 条），到时先问人，按四行写：

  > ① 在桌面版上试一次人设
  >
  > 背景：要看主 Agent 的话**带上你设的记号**，它派出去的 agent 写的文件里没有
  >
  > 推荐：**你自己在插件管理器里设**，测完自己清掉，各约 1 分钟
  >
  > 疑问：你要是**不想动手**，就得由我改你的配置文件
  >
  > 不做：**我直接改你的配置**，仓库规矩是改你的配置要先问你
  >
  > 你自己设，行吗？

- 新增第 9 项（`d-one-main-agent`）：在第二个会话里发 `/wish`，回复指向第一个会话；`/wish here` 之后第一个会话的流程条与「主 Agent」按钮消失、第二个会话出现（各截一张）。
- 新增第 10 项（`d-main-agent-shell`）：在临时工作区里改一行 `README.md`，让主 Agent 跑 `git checkout -- README.md`：命令执行，主 Agent 下一步说出快照与恢复命令；照它说的 `git stash apply` 之后那一行回来。
- 合入之后第一个提交把设计行改为默认启用（同 0.4）；`persona.text` 默认空，启用之后不带人设。

## 5. 失败与降级（新增的行，接 0.4 §6）

| 操作 | 失败条件 | 可恢复？ | 调用方收到 | 记录 |
| --- | --- | --- | --- | --- |
| `roleFace` | 读角色抛错 | 是 | 本步当作非主 Agent：去掉两个设计工具，写工具与 `ask_user_question` 不去掉（写入与提问照样由规则拦） | 告警一次，会话健康 degraded |
| `roleFace` | 方言服务抛错 | 是 | `toNativeTool` 退到静态表 `ZCODE_ALIAS_NATIVES`，`Write`、`Edit` 照样去掉 | `dialectWarner` 告警一次（同 guard） |
| `roleFace` | `str_replace_editor` 的参数形状不认识 | 是 | 主 Agent 的工具面里整个去掉它 | 会话健康说明 |
| `roleFace` | 人设超过 4,000 码点 | 是，人改短 | 不加这一节 | 行健康 degraded |
| `roleFace` | `persona.name` 超过 40 码点 | 是 | 截断后照用 | 告警一次 |
| 方言识别 Output Style 节 | 节的文字不是字符串 | 是 | 当作没有这一节，开头句不换 | 告警一次 |
| `/wish` 写持有者记录 | 磁盘错误、权限 | 是，修好后重发 | error「主 Agent 的持有者记录写不了：<原因>」，不开启 | 命令结果 |
| 读持有者记录 | 文件损坏、形状不对 | 是，再发一次 `/wish` 覆盖 | `isMainAgent` 只按投影判 | 行健康 degraded |
| `demoteOthers`、`agent/created` 对齐 | 执行 `/wish off` 失败或超时 | 是，下次 `agent/created` 再对齐 | 那个会话按记录判不是主 Agent，只有显示不对 | 告警一次，行健康 degraded |
| git 快照 | 第 1 步以外任何一步失败或超时；`clean` 超上限；`push` 取不回远端；`cd` 目标认不出 | 是，按正路改命令或重试；人可在自己的终端里跑 | 拒绝，`git-snapshot` 的纠偏 | 违规流水 |
| git 快照 | 不是仓库 | — | 放行（git 自己会报错） | 无 |
| git 快照 | 找不到 git | 是 | 放行 | 行健康 degraded |
| git 快照 | 写流水失败 | 是，快照引用已在 | 放行 | 行健康 degraded「快照 <id> 已存，记录没写上」 |
| git 快照 | 进程在快照与命令之间退出 | 是 | 命令没执行；快照引用与流水留着，无害 | 流水 |
| `propose_to_human` | 参数不合法、子 agent 或普通会话调用、图读不到、门禁不成立、一条回复超过三件 | 是 | 工具错误 `invalid`、`forbidden`、`not_found`、`graph_invalid`、`gate_unmet`、`too_many`，带 `hint` | 会话日志的工具结果 |
| `propose_to_human` | 引擎拒绝提议式待决 | 是 | 引擎的错误原样 | 工具结果 |
| `propose_to_human` | 拿不到 `snapshotEvents` | 是 | 照常，编号取 1 | 会话健康说明 |
| `record_human_answer` | 原话不在人的消息里；没在本会话提过 | 是，照 `hint` 摘原话或先提 | `invalid`（`field: 'words'`）、`not_shown`，图不变 | 工具结果 |
| `record_human_answer` | 拿不到会话日志、解析抛错 | 否（这个宿主上） | `unavailable`，图不变，`hint` 让主 Agent 告诉人 | 会话健康 degraded |
| `record_human_answer` | 门禁在提议之后不再成立 | 是 | `gate_unmet`，图不变 | 工具结果 |
| `record_human_answer` | 写入 `stale_revision` 两次 | 是 | 引擎的错误，`hint` 带人的原话，已写的几条留着 | 工具结果；已写的条目在节点历史里 |
| `record_human_answer` | 放行时部分节点跳过 | 是，改好后再提 | `partial`，阶段不改 | 工具结果 |
| `main-agent-graph` 第一条 | 读不到会话日志、核对抛错 | 否（这个宿主上） | 拒绝（fail-closed） | 违规流水，会话健康 degraded |
| `main-agent-graph` 第二、三条 | 读图、判定抛错 | 是 | 放行（fail-open） | 会话健康 degraded |
| `main-agent-ask` | 读角色抛错、判定器抛错 | 是 | 放行（fail-open，同 0.4 写入规则） | 会话健康 degraded |
| 改名后的 `glm-prompt` 配置 | 只写了旧键 `persona` | 是 | 照旧生效 | 告警一次，行健康说明 |
| 改名后的 `glm-prompt` 配置 | 新旧两键都写且不同 | 是 | 按 `reportingDepth` | 告警一次 |
| 标定 `openRun` | 建临时目录或写 `pending.json` 失败 | 否（这次调用） | 运行器以用法错误的退出码 2 结束，已跑完的运行照常由 `closeBatch` 拷回 | 控制台 |
| 标定 `closeBatch` | 拷贝或核对出错 | 是，`--collect` | 不删临时目录，`pending.json` 留着，退出码 1 | 控制台写明每个临时目录的路径 |
| 标定 `closeBatch` | `pending.json` 里的路径不在系统临时目录下或不带前缀 | 是，人看过之后手工处理 | 那个路径不删 | 控制台报出 |
| 模拟人 | 读图失败；`followup` 抛错 | 是 | 回 `fallback`；不回，运行随之结束 | `human.jsonl` 记 `{kind: 'reply-failed', reason}` |
| 流程条、`/wish` 入口 | 拿不到 `useSession`、`inputActions`、`commands.list` | 是 | 退到 `sessions.list`；退到复制；不显示入口 | 客户端控制台（同面板） |

## 6. 外部输入的校验（新增，接 0.4 §6.3）

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `propose_to_human.kind` | 是 | `question`、`confirm`、`release` | `invalid` |
| `propose_to_human.title` | 是 | 一行，非空，至多 `PLAIN_LIMITS.title`（40）码点，不含 `*` | `invalid`，`field` |
| `propose_to_human` 的四行 | 是 | §3.3：一行、非空、不以标签开头、恰好一处 2–12 码点的加粗；`background` 至多 `PLAIN_LIMITS.background`（150），其余至多 40（不算 `**`） | `invalid`，`field` 与 `hint` |
| `propose_to_human.goal` | `confirm`、`release` 时是 | 已有的目标 id | `invalid` 或 `not_found` |
| `propose_to_human.parent`、`question`、`sources` | `question` 时可选，`parent` 与 `question` 互斥 | 已有节点 id；`sources` 至多 8 个 | `invalid` |
| `record_human_answer.words` | 是 | 1–3 段，每段非空、至多 500 码点，合起来至多 2,000 字符；每段是人在起点之后某条消息的一段（§3.6） | `invalid`，`field: 'words'` |
| `record_human_answer.recordedAs` | 是 | 一行，非空，至多 120 码点 | `invalid` |
| `record_human_answer.answer` | 是 | `agree`、`add`、`reject` | `invalid` |
| 图工具的 `relay`（主 Agent 调用时） | 否 | 按换行切段，每段是人在起点之后某条消息的一段 | `main-agent-graph` 拒绝 |
| 提议式待决（引擎，任何写入方） | 四行在提议式上都必填 | §3.3；`conclusion` 一行、非空、至多 120 码点 | 引擎 `invalid`，`field` |
| `graph_decide` 的 `option`、`conclusion` | 恰有一个 | 选项式要 `option`，提议式要 `conclusion` | 引擎 `invalid` |
| 持有者记录文件 | — | `{version: 1, sessionId: string, graphDir: string, since: ISO 时间, commandId: string}` | 当作 `unreadable`（§2.4） |
| 会话日志里的事件（`snapshotEvents`） | — | `{seq, time, type, data}`；`user/message` 的 `data.source` 是对象 | 形状不对的事件跳过；整个读不到时按 §5 |
| 设计行 `persona.name` | 否 | 规整成一行，至多 40 码点；空时用「主 Agent」 | 超长截断并告警一次 |
| 设计行 `persona.text` | 否 | 至多 4,000 码点；去掉首尾空白后为空即不加 | 超长不加，行健康 degraded |
| `glm-prompt` 的 `reportingDepth`、旧键 `persona` | 否，都不带默认值 | `concise`、`balanced`、`detailed` | Schema 拒绝（同今天） |
| 模拟人配置 | — | §3.10 | 未知字段与不合法的项告警并忽略 |
| 标定的 `pending.json`（`--collect` 读它） | 是 | `{root: string, runs: [{name, dir}]}`，路径须为系统临时目录的直接子目录、带前缀 | 形状不对时不拷不删，退出码 2；单个路径不合格时跳过那一个并报出 |

## 7. 不变量（新增或改，接 0.4 §6.4）

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 主 Agent 不写文件 | 两层：组装时 `roleFace` 按原生名去掉写工具（看不到就不试，`question-26` C）；执行边界的 `main-agent-no-write`（按名调用与 shell 写入的兜底）。git 不算写文件（`d-main-agent-shell`） | 工具面不是边界，rc.3 按名执行 |
| 主 Agent 的 git 命令丢不掉东西 | `tools/pre-execute`：会丢工作或改写历史的命令先存快照再放行，存不了就拒绝（§2.5） | 不可逆损失要有预防（`docs/DEVELOPMENT.md` §1.1 第二类）；git 交给主 Agent 之后这是唯一的守卫 |
| 主 Agent 不给人列选项、不出卡 | 身份节与阶段提醒的说法（`talk.ts`）；`ask_user_question` 从工具面去掉并由 `main-agent-ask` 兜底；`main-agent-graph` 第三条拒绝主 Agent 写带选项的人定待决；`propose_to_human` 只收四行 | `d-chat-not-cards`；不靠模型照身份文本做 |
| 四行的排版只有一份实现 | `src/graph/proposal.ts` 的 `renderProposal` 与 `proposalLineRefusal`，工具、引擎、例题与面板共用 | 人纠正的都是排版；两份会走样 |
| 人的权限只来自人自己的话 | `record_human_answer` 与 `main-agent-graph` 第一条都按会话日志核对原话（`talk.ts` 的 `personSaid`）；引擎照旧只给 `human` 与带 `relay` 的写入人的权限 | 放行解开子 agent 的写入、M7 起主 Agent 自己推进；原话核对不了就不记（fail-closed） |
| 阶段只经门禁向前 | `record_human_answer` 在写入前重查需求卡与放行门禁；`main-agent-graph` 第二条拒绝主 Agent 用图工具向前改阶段与批准访谈中的目标 | `m3-6` 验收第 2 条 |
| 人同意的就是人看到的那一版 | 待决：起点取最新一版的时间，做完之后 `llm` 改不了四行；放行：按提议时记下的修订号批准，改过的跳过 | 0.4 §3.4.2 的同一条，换成对话之后照旧 |
| 同一时刻一个项目至多一个主 Agent | 持有者记录（`main-agent-holder.ts`）与 `isMainAgent` 的读法；投影与记录不一致时按记录判，显示靠对齐 | `d-one-main-agent` |
| 说话的规矩只在一处定 | `src/design/talk.ts` | 格式再改只动它与 `proposal.ts` |
| 例题与换词表只定义一次 | `src/graph/plain-question.ts`，身份节与 `propose_to_human` 的说明原样引用，plain-ui 的检查从它读 | `d-plain-questions` 点名了几处，抄几份会走样 |
| 人设只进主 Agent 的系统提示词 | 设计行 `roleFace`（`isMainAgent`） | 子 agent 与普通会话会写文件 |
| 插件不带人设文字 | 设计行的配置默认空串 | `docs/CHARTER.md` 非目标 |
| 身份节的角色与边界部分只有角色与边界 | 单测钉住长度与内容 | `question-31` C |
| 标定运行时仓库里没有同批运行的解 | 运行器：运行目录在系统临时目录，整批之后才拷回 | `risk-calib-read` |
| 标定运行的记录不在拷回之前删掉 | `run-dir.mjs` 的 `closeBatch`：核对一致才删，只删 `pending.json` 里记着、在系统临时目录下、带前缀的路径 | 删除不可撤回 |

0.4 §6.4 里两行改写：「只有人的动作能把目标推到 `design`、`release`」改为「只有 `record_human_answer` 带核对过的人的原话、或人在面板上，能把目标推到 `design`、`release`」；「`human` 写入都带出处」（`human-writes.ts`）改为「带原话的写入都带出处：`reason` 含 `record_human_answer <callId>`，原话在 `relay` 或批注正文里」。

## 8. 0.4 原文要改的地方

行号是 0.4 当前文件（`.agents/tasks/m3/design.md`，1,234 行）的。改法照本附录；实现各步时在 0.4 里同批改写，或在 0.4 的这些位置加一句「见附录 §x」。

| 行 | 现在写的 | 改为 |
| --- | --- | --- |
| 14（§0 m3-1） | 身份文本：三问四答、八步访谈、五栏、五键、决策卡；工具面等于普通会话的工具面加两个设计工具 | 身份节两部分（§2.2）；工具面按 §2.1 |
| 15、38（§0、§1.2 的 m3-2） | 八步访谈经 `ask_user_question`；`design_review` 出确认卡 | 访谈是对话（§2.3）；确认经 `propose_to_human` 与 `record_human_answer`（§3.4、§3.5） |
| 16–19（§0 m3-3 至 m3-6） | 五键卡、决策卡、`design_review` | §3 |
| 23（§0 待人定 D1–D3） | 按会话开启；卡片工具；卡片回答以人的身份写图 | 一个项目一个主 Agent（§2.4）；对话工具（§3.4、§3.5）；带核对过的原话写图（§3.5、§3.6） |
| 62、63、71（§2.1 构件表） | `cards.ts`、`human-writes.ts`、`UserQuestionsService` | 删；加 `talk.ts`、`propose.ts`、`record.ts`、`proposal.ts`、`main-agent-holder.ts`、`git-snapshot.ts`、`plain-question.ts`；薄适配层加 `SessionEventLike`、`snapshotEvents?`、`SessionPersistenceLike` |
| 86（§2.2 第 3 条） | 每步一个 `ask_user_question`，推荐项放第一并加 `(Recommended)` | 每步在对话里问一两句开放的问题，拿到回答就写图 |
| 87、88、90（§2.2 第 4、5、7 条） | `decision_card`、确认卡、五键卡 | `propose_to_human`（`question`、`confirm`、`release`）与 `record_human_answer` |
| 101–102（§2.3） | fork 的会话仍是主 Agent；一个工作区可以有多个主 Agent 会话 | §2.4 |
| 160（§3.1.1 表） | 「主 Agent 模式要用会话投影服务，这个组合里没有」 | §2.8 的说法 |
| 241（§3.1.3 第 5 项） | 八步访谈与 `ask_user_question` 的规则 | 整项删去，按 §2.2 的去向表 |
| 242–245（§3.1.3 第 6–9 项） | 图上的写法、`design_review`、决策卡、汇报细度 | §2.2 的去向表 |
| 248（§3.1.3） | 长度上限 9000 | 第一部分 1,500、第二部分 1,400、整节 2,700 |
| 258（§3.1.4 判写） | 判写继承 file-tools-only 的缺口（含改工作树的 git 子命令） | git 不当写文件，会丢工作的命令先存快照（§2.5） |
| 282、283、311（§3.2.1） | `ask_user_question`；问题的形状写进身份文本 | 对话；第 7 步按 §2.3 |
| 332–350（§3.2.3 确认卡） | 整节 | §3.4、§3.5 的 `confirm` |
| 458–551（§3.4 五键与 `design_review`） | 整节 | §3.4、§3.5 的 `release` 与 §3.7；放行集合、修订号与部分失败的规则照旧 |
| 509–516（§3.4.3 D3） | 卡片回答以人的身份写图 | §3.5 末段 |
| 555–586（§3.5.1 `decision_card`） | 整节 | §3.3、§3.4、§3.5 的 `question` |
| 594（§3.5.2） | 一个工作区可以有多个主 Agent 会话写同一张图 | 候选只有持有者（§2.4） |
| 624（§3.5.3） | `FIVE_KEYS` 已迁到 `cards.ts` | 随 `decisions.ts` 一起删 |
| 708（§3.6.4） | `order: 20` | 30 |
| 752（§4 契约表） | `ask_user_question` 的参数与「推荐项放第一」 | `ask_user_question`：从主 Agent 的工具面按角色去掉，`main-agent-ask` 兜底；探针与标定的覆盖层仍插入 `tool-ask-user`；另加 `session.snapshotEvents()`（dsh-session）与 `user/message` 的 `source` 形状（api-session-controller:3224–3229、dsh-headless:340–346） |
| 804（§6.2 表） | degraded「主 Agent 模式要会话投影服务」 | §2.8 的说法 |
| 847（§6.3） | `decision_card.why` | 删去，按 §6 |
| 860、869（§6.4） | 只有人的动作…；`human` 写入都带出处 | §7 末段 |
| 921、924、927（§8 表第 3、6、9 步） | `UserQuestionsService`；`cards.ts`、`human-writes.ts`、`decision-card.ts`；五键卡、汇报细度、`FIVE_KEYS` 迁移 | §4 |
| 968、972、987（§9.1.2、§9.1.3） | 模拟人的卡片配置与选法；`glm-decision-card` | §3.10；`glm-design-question`（第 6 步） |
| 1030、1040、1042（§9.2） | `task.json` 的卡片配置；`ask_user_question` 次数；整段访谈要在一个回合里完成 | 第 8 步与第 12 步（a） |
| 1050（§9.3 第 3 项） | 访谈中 `ask_user_question` 的卡片标出推荐项 | 第 12 步（b）第 3 项 |
| 1086、1095（§11） | 「要改」不带文字时用 `ask_user_question` 追问；访谈的提问形状只写进身份文本 | 对话里追问；四行的形状由 `propose_to_human` 与引擎执行（§3.3、§3.4） |

## 9. 交给编排者记图的事项

本运行不写 `docs/graph/`。下面的事项写成草稿 `.agents/tasks/m3/graph-ops-addendum.json`，由编排者决定怎么记。

1. 验收要请人改字句（必须问人的第 1 类，`norm-decision-tiers`）。起因是人后来的两个决定 `d-chat-not-cards`（不出卡、不给选项）与 `d-one-main-agent`（一个项目一个主 Agent），图上的旧字句点名了卡片与多个主 Agent。建议的新字句（实现照这些做；人若改成别的，只改第 3、6–9 步的「验收（待人改）」与对应的 L2、L3）：
   - `m3-1` 第 3 条：「主 Agent 的工具面等于同一组合下普通会话的工具面去掉写文件的工具（Write、Edit 及其别名、str_replace_editor 的写操作）与 ask_user_question，加上 propose_to_human、record_human_answer；由编排层插件在组装时去掉，不用 preset；shell 写入由 guard 兜底」
   - `m3-2` 第 2 条：「需求卡缺项时 propose_to_human 拒绝并列出缺项，人看不到提议；人在对话里同意之后，目标由提议变为已批准、阶段为 design，历史带人的原话」
   - `m3-2` 第 3 条：「标定任务 interview-expense-log 在 GLM-5.3 上三次里至少一次完整通过验收脚本；模拟人在对话里回话：开放的问题按任务写好的事实答，提议按任务写好的话答（需求同意一次，方案先补充一次再同意）；两档模型的结果都记作基线」
   - `m3-3` 第 1 条：「五栏缺任一栏时 propose_to_human 拒绝并说明缺什么，人看不到提议」
   - `m3-3` 第 3 条：「放行把提议时列出的提议全部转为已批准，阶段为 release，历史带人的原话；带 supersedes 连线的提议不能这样放行」
   - `m3-4` 第 1 条：「人在对话里对提议说的五种话（同意、否掉并说理由、补充、讲细点、说重点）都有确定的去向：前三种由主 Agent 带人的原话记进图，后两种只改主 Agent 这一次怎么讲」
   - `m3-4` 第 2 条：「否掉的理由与补充的话记成目标或待决上的批注，带人的原话与主 Agent 记成的那一句；harness 核对这段话确实是人在提议之后发来的」
   - `m3-4` 第 3 条：「桌面版上主 Agent 的提议是题目一段，背景、推荐、疑问、不做各一段，每段重点几个字加粗，问话在最后；没有选项与按钮」
   - `m3-5` 第 1 条：「要人定的事在图上留一张待决，主 Agent 在对话里提出；人当场回话就由人定；没回话时这张待决留在「需要你」里，人之后在同一个主 Agent 的对话里回话也算」
   - `m3-5` 第 2 条：「人在面板上拍板、批准或否决后，这个项目的主 Agent 会话收到消息（不论面板开在哪个会话里），焦点不在这个节点所属的目标下时不收到，下一次投影带结果；别的工作区的主 Agent 会话与普通会话不收到」
   - `m3-6` 第 2 条：「阶段前进只经主 Agent 带人的原话记下的确认与放行，门禁同 m3-2、m3-3」
   - `m3-4`、`m3-5` 的标题与正文里的「五键」「决策卡（同步 / 异步）」「借用 user-questions」随之改写。
2. 已经人定、前提随 `d-chat-not-cards` 变了的三件，建议在节点上各记一条批注，不必再问人：`question-20` B（D2：两个借用组件改为本项目的卡片工具，现在是两个对话工具）；`question-21` A（D3：卡片回答以人的身份写图，现在没有卡片，改为带核对过的原话）；`question-24` A（D6：同步卡原定的出工作区申报归 M4，见第 6 条）。
3. `question-39` B：`m3-1`、`m3-2` 的第 3 条已在 2026-10-29T15:33Z 按建议文字改好，16:14Z 人重答仍是 B（N7）；第 1 条的新字句再改一次。
4. 给改写 `d-option-card` 的那件事：M3 只让主 Agent 不再写选项式的人定待决（`main-agent-graph` 第三条），引擎照旧接受两种形状。编排方用命令行写人定的题、面板的选项卡、`e22282f` 的必填规则要不要对新写入改为只收提议式，由那件事定；`graph_propose` 的说明已在第 6 步改成「人定的题是提议式」。
5. 给 plain-ui 的契约（它下一稿吸收 `d-chat-not-cards` 时用）：
   - 提议式待决的字段与规则在 `src/graph/proposal.ts` 与 §3.3：`background`（plain-ui 的字段，长度照 `PLAIN_LIMITS.background`）、`proposal`、`doubt`、`notTaken`、`conclusion`；四行都恰有一处加粗。面板读这几个字段，不从正文拆；加粗用 `splitBold`。
   - M3 第 6 步只给面板加了最小显示（四行与「在主 Agent 的对话里回话」）；「需要你」的改版与「点开跳到主 Agent 的对话」属于 plain-ui，主 Agent 是哪个会话用 `mainAgentOf(userHome, dir)`（§2.4）。
   - `PLAIN_WORDS` 在 `src/graph/plain-question.ts`，plain-ui 的 `jargon` 从它读（N3）；例题是人给的那道四行题。
   - 流程条 order 30、开场卡片 40 照 plain-ui；`/wish` 入口在 M3 第 11 步实现；空白会话里已是主 Agent 时卡片换成退出一行（草图没有这一屏）；黄字照草图不带「（如 GLM-5.3）」，并删去「子 agent 用便宜的就行」。
   - plain-ui §12 M3 第 3 条（访谈第 2 步的问题写进 `why`）取决于 plain-ui 待人定的 P2，同 0.2 §8 第 4 条最后一点。
6. 给 M4（`m4-request-card`，D6 `question-24` A）：0.4 说申报通道复用 M3 的 `cards.ts` 与 `human-writes.ts`，这两个文件不再有。按 `d-chat-not-cards`，出工作区的申报也该是主 Agent 在对话里提、人回话、harness 核对原话（`src/design/talk.ts` 的 `personSaid` 可直接用），「批准只放行当次」的执行另设计。
7. 给 M7：
   - `d-auto-drive`：放行那一次写入是 `record_human_answer`（`release`、`agree`）以 `llm` 身份、带 `relay` 把目标的 `stage` 改为 `release`，`reason` 以「人在对话里同意（record_human_answer <callId>）」开头。驱动循环从这条历史认出放行，不另找信号；`release` 阶段提醒那一句由 M7 改为「接着分解与派发，不用等人」。
   - `d-main-agent-shell`：主干前进时按 `norm-merge-gate` 核对、记证据是 `m7-5` 的事；M3 合入之后到 M7 合入之前，主 Agent 移动主干不受核对，留痕在 git 的 reflog、会话日志与快照流水（只有改写历史的命令进流水）。子 agent 的 git 快照或工作树隔离也归 M7。
   - `d-main-agent-models`：M3 没有派活工具；DSH 的委派让子 agent 沿用父 agent 的模型（subagent:305–316）。派发时让主 Agent 选模型、记理由在 M7。
   - `d-one-main-agent`：晨报、周报与巡检由 harness 到点提醒持有者会话，用 `mainAgentOf` 找它；`m7-7` 的运维会话与 `/patrol on` 作废。
8. `d-plain-questions` 里 M3 不做的两件：图工具说明的例题（第 6 步只改了 `graph_propose` 里说待决形状的那句）、问题字段的写法检查（plain-ui §4.3）。`PLAIN_QUESTION_GUIDE` 与 `plainWordsIn` 在 `src/graph/plain-question.ts`，可以直接用。
9. 发现（不变）：`question-31` C 里汇报细度并进 Output Style（清点报告 Q2 C 后半）与子 agent 只拿它需要的（Q5 B）没有落到任何节点上；建议在 `prompt-audit` 或 `glm-house` 下提一个任务，等 `question-30` 的消融。
10. ZCode 3.17.1（`d-zcode-3171`）：`m3-main-persona` 一步与 `wf_e48380fb20a69493` 同改 `src/glm-prompt/`，后合入的一方 rebase；本附录按常量名写（§2.7 末段）。
11. 实施开工时两个工作树先快进到 main（§4 开头）；`m3` 上批注：附录 0.3 写成、待第 3 轮评审。

## 10. 不做的事（新增）

- 主干前进时的 `norm-merge-gate` 核对与证据（M7 `m7-5`）；子 agent 的 git 快照（M7）。M3 不拦主 Agent 移动主干。
- 快照的自动清理与恢复命令。残余：`git push --tags` 会把 `hourness-snapshot/*` 轻量标签推到远端，M3 不拦；脚本与 git 钩子里调用的 git、`read-tree -u` 一类底层命令认不出；合并冲突的三方版本不存。
- 先想后看与跟随率的算法（`d-inertia-breaker`、指标流水）：M3 只把同意、补充、否掉写成三种固定说法（§3.5）。
- 主 Agent 有没有把 `propose_to_human` 的 `text` 原样放进回复，运行时不拦；第 12 步（a）数。
- 普通会话（没有 `/wish`）里图工具的 `relay` 不核对：只有主 Agent 的转述有人的权限这件事是 M3 新开的路，普通会话照今天。
- 晨报、周报与巡检的到点提醒（M5、M7，`d-one-main-agent` 后半）；面板「需要你」的改版与跳转（plain-ui）。
- 汇报细度并进 Output Style、子 agent 不带汇报细度（§9 第 9 条）。
- ZCode 的 Output Style 提醒（`${styleName} output style is active…`）：本项目的 Output Style 节在系统提示词里、会话内不变，不加周期提醒。
- 普通会话的人设。
- 标定会话的读取圈禁（`risk-calib-read` 的第三条处理方向）：本次只把运行目录移出仓库、整批之后才拷回、会话结束后才跑验收脚本。残余：被测模型按绝对路径仍能读仓库（包括本批的 `pending.json`）与系统临时目录里同批的其他运行。
- 上手页、没有项目图时的开场卡片、面板首页的 `/wish` 一句（plain-ui 的引导与面板改版）。

## 11. 由 agent 定、人可推翻的事项（新增）

- 角色相关的工具过滤放在不带 `prepend` 的 `roleFace` 里层监听器，身份节仍是 0.4 的 `prepend` 监听器；写工具按原生名判（§2.1）。
- `str_replace_editor` 在主 Agent 的工具面上收窄为只有 `view`，形状不认识时整个去掉（§2.1）。
- 身份节分两部分：角色与边界 1,500 字符、五项内容；说话方式、例题与换词表 1,400 字符；整节 2,700（§2.2）。例题在主 Agent 的系统提示词里出现两次（身份节与 `propose_to_human` 的说明），约 1,200 字符，静态，能进提示词缓存。
- 一条回复至多三件事，题目按交给人的先后编号 ①②③，只有一件时也编号（照人给的样子）（§3.3、§3.4）。
- 四行的上限：`background` 用 plain-ui 的 150，其余三行 40 个码点（不算 `**`），加粗 2–12 个码点、恰好一处；结论 120（§3.3）。
- 四行由 harness 拼、模型原样转给人，不让模型自己排版（§3.4）。
- 提议式待决是引擎里的第二种形状，存四个字段与 `conclusion`；做完之后 `llm` 改不了四行（§3.3）。
- `confirm` 与 `release` 的提议不写图，「给人看过」从会话日志里认（§3.4）。
- 人的原话的认法：`user/message`、`source.kind === 'user'`、不是 notice；NFKC 与空白规整之后按子串比；起点按最新一版（§3.6）。原话核对不了时不记、不放行（fail-closed），其余两条规矩 fail-open（§3.8）。
- 放行与确认由 `llm` 带 `relay` 写，不由 harness 以 `human` 身份写（§3.5 末段）。
- 主 Agent 用图工具向前改阶段、批准访谈中的目标一律拒绝，向后改照引擎规则（§3.8 第二条）。
- 主 Agent 不能写带选项的人定待决；引擎本身照旧收两种形状（§3.8 第三条、§9 第 4 条）。
- 模拟人在 `turn/end` 时回话，消息形状同 headless 的任务消息；回话规则六条（§3.10）。
- 一个项目一个主 Agent 的细节：项目就是图目录；持有者记录放在用户级数据目录，键是规整后图目录的哈希；`/wish here` 移动；原会话由 harness 执行一次 `/wish off`；fork 出的会话创建时变回普通会话；记录读不到时按投影判（§2.4）。
- git：只在存不了快照时拒绝；快照提交以所有旧的引用为父，引用放在 `refs/hourness/snapshots/<id>`，改写历史时另打轻量标签；`clean` 的上限 200 MB、20,000 个文件；整个快照 30 秒；`cd` 到非字面路径时拒绝；快照流水放在仓库的 git 目录里；不自动清理（§2.5）。
- 人设只给主 Agent，不给普通会话；人设节末尾加插件自己的范围说明一句（§2.7）。
- 旧配置键 `persona` 保留为已弃用的同形字段并照读；两个键都不带默认值，告警按规整之后的值判（§2.7）。
- 标定的运行目录每次运行一个系统临时目录，整批之后整棵树拷回 `.llm/calibration-runs/` 再删，失败时 `--collect` 重做；访谈任务的边界 120 步、40 分钟（第 8 步）。
- `/wish` 入口在 M3 第 11 步实现，没有项目图时不显示；空白会话里已是主 Agent 时开场卡片换成退出一行；黄字不点名模型（§2.6）。

## 12. 按方向清单自查（`d-design-onepage`）

`d-design-onepage` 要每个模块的设计对照人定过的产品方向，违背即挡路。逐条：

| 方向（节点） | 本附录 | 结论 |
| --- | --- | --- |
| 设计放行后主 Agent 自己推进，不用 `/drive`（`d-auto-drive`） | M3 止于放行，不加任何 `/drive` 一类的命令；放行写入的样子写明给 M7（§9 第 7 条） | 一致 |
| 模型由主 Agent 选（`d-main-agent-models`） | 不加任何按档位固定的映射；黄字与回复不再叫人挑子 agent 的模型（N1） | 一致；派发时选模型在 M7 |
| git 交给主 Agent（`d-main-agent-shell`） | git 不当写文件；只在存不了快照时拒绝；主干前进的核对留给 M7（§2.5） | 一致 |
| 一个项目一个主 Agent（`d-one-main-agent`） | 持有者记录、`/wish here`、回写只发给持有者（§2.4） | 一致；巡检提醒在 M5、M7 |
| 问人改成聊天，不出卡、不给选项（`d-chat-not-cards`） | §3 全部；主 Agent 不带 `ask_user_question` | 一致 |
| 推荐放最后（`d-recommend-last`） | 主 Agent 与人之间不再有选项组，这一条在 M3 里没有对象；agent 自己定的题照旧推荐放最后（引擎 `44e8601`） | `d-chat-not-cards` 第一点把它列为要改写，按后一个决定 |
| 规则只由人定（`d-rules-human-only`） | M3 不写规则节点；三条 harness 规矩是代码里的边界，不是规则板上的规则 | 一致 |
| 问人的话说人话（`d-plain-questions`） | 换词表与人给的例题只定义一次，进身份节与工具说明；harness 的字串过 `plainWordsIn`（§2.8） | 一致；写法检查在 plain-ui |
| 主 Agent 不写文件（`question-26` C） | §2.1、第 4 步 | 一致 |
| 人设只给主 Agent（`m3-main-persona`） | §2.7 | 一致 |
| 不怕失败，怕没有预案（`d-failure-plans`） | git 快照（预防不可逆损失）；原话核对（发现编造）；§5 每行写了能否恢复、调用方收到什么、记在哪 | 一致 |
| 项目图给人看、少给人用（`d-ui-look-not-operate`） | 提议式待决在面板上只显示、不给按钮，回话在对话里 | 一致；面板改版在 plain-ui |
| 系统看得到的数由 harness 写（`metrics`） | 同意、补充、否掉由 harness 写成固定说法，不靠模型自报 | 一致；指标流水本身不在 M3 |
| ZCode 基线 3.17.1（`d-zcode-3171`） | 人设一节按常量名写（§2.7 末段） | 一致 |

两处要人看一眼的方向性选择，写进一页放行稿：一是确认需求与放行方案改由主 Agent 带人的原话记下、harness 核对原话（§3.5、§3.6）；二是 M3 合入到 M7 合入之间，主 Agent 移动主干不受核对（§9 第 7 条）。

## 13. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-29 | 第一稿：吸收 `question-26` C、`m3-1` 验收第 4 条、`question-31` C、`m3-main-persona`、`d-option-card`、强一档模型的提醒、`d-interview-cards` |
| 0.2 | 2026-10-30 | 回应第 1 轮评审（MEDIUM 4、NIT 12）；吸收 `question-39` B、`d-plain-questions`、`d-zcode-3171` 与 `d-option-card` 正在重新商量；依据 main `9c71ed0` |
| 0.3 | 2026-10-30 | 回应第 2 轮评审（HIGH 1、MEDIUM 2、NIT 9，§14），三条挡路按编排方的裁定改；吸收 `d-one-main-agent`（§2.4）、`d-main-agent-shell` 定稿（§2.5）、`d-chat-not-cards`（§3，问人改成聊天，去掉全部卡片）、`d-main-agent-models`、`d-auto-drive`、`d-design-onepage`（§12）；「访谈选择题」一步取消；依据改为 main `4d2edb7`（`6134c83` 的行命名与探针脚本，实施前快进两个工作树）。取代上一次运行停在 §3 的草稿（`design-addendum-0.3-draft.md`） |

## 14. 对第 2 轮评审的回应

| 发现 | 处理 | 改在哪 |
| --- | --- | --- |
| H1 每个会话都能开主 Agent | 照编排方的裁定（`d-one-main-agent`）改：项目就是图目录；持有者记录；`isMainAgent` 另看记录；`/wish` 指路、`/wish here` 移动、原会话由 harness 执行 `/wish off`；fork 出的会话创建时对齐；回写只发给持有者；身份节第一句改为「the main agent of this project」；L2 七例、L3 新场景 `glm-design-one-main`。与评审改法的两处不同：记录放在用户级数据目录而不是项目目录（项目目录是桌面版各工作区共用的一个配置值，理由见 §2.4）；记录读不到时 `/wish` 覆盖它，而不是只报 degraded | §2.4；第 3、7 步；§5、§6、§7、§11 |
| M1 主 Agent 的 git 能丢掉没提交的改动 | 照编排方的裁定改，与评审的改法相反：`d-main-agent-shell` 定稿之后 git 不当写文件拦（人的原话「可以任意操作git」）；会丢工作或改写历史的命令先存快照（`git stash create` 等，引用在 `refs/hourness/snapshots/<id>`，改写历史时另打标签），记进流水，告诉主 Agent 怎么恢复，再放行；只在存不了快照时拒绝。不可逆损失由此有预防。身份节一句改为「The shell and git are yours; before a git command that can lose uncommitted work or rewrite history, the harness saves a snapshot」。主干前进的核对在 M7 | §2.5；第 4 步；§5、§7、§10、§11 |
| M2 `background` 的形状与存法不一致 | 照裁定改：字段与上限照 plain-ui（`PLAIN_LIMITS.background`，一行，150），M3 不另设数值；写进 `background` 字段、不写正文；引擎没认这个字段时由第 6 步按 plain-ui §4.2 建。0.2 的 600 码点、多行作废。四行另有「恰好一处加粗」的规则，是四行格式的，不改字段形状 | §2.9、§3.3；第 6 步 |
| N1 「子 agent 用便宜的就行」 | 删去后半句；`docs/ORCHESTRATION.md` §3.5 补子 agent 的模型由主 Agent 派活时选（M7）；`tests/wish-entry.spec.ts` 的黄字断言同改 | §2.6；第 3、11 步 |
| N2 结论行的解析被挪两次 | 不再适用：M3 不再建 `card-rules.ts`，不碰结论行的解析，`verdict.ts` 由 plain-ui 定 | §3.9 |
| N3 两份换词表 | 照改：`PLAIN_WORDS` 补齐「附录」与 `gate`、`projection`、`addendum`；plain-ui 的 `jargon` 从它读，谁先合入谁建 | §2.8、§9 第 5 条 |
| N4 选项检查的必填参数 | 不再适用：没有 `ask_human` 与 `card-rules.ts` | §3.9 |
| N5 `choice` 的「下一步」把描述当问句 | 照改，且随 `d-chat-not-cards` 写成点名 `propose_to_human (kind question)` 的一句；L2 一例 | §2.3；第 5 步 |
| N6 做法 B 会让两条断言失败 | 不再适用：接缝的 A/B/C 对照取消，没有 `askLine`；断言改为直接查身份节与提醒不含卡片工具与推荐后缀 | §2.2、§2.3 |
| N7 §8 第 1、2 条写「编排者正在写图」 | 照改：已改（`question-39` B）；新字句另列 | §9 第 1、3 条 |
| N8 第 3 步 L3 的 wish-idle 场景 | 照改：第 3 步只核对身份节与工具面，第 6 步起加两个设计工具 | 第 3、6 步 |
| N9 `d-auto-drive` 的触发点 | 照改：放行写入的样子写给 M7；`release` 阶段提醒那一句标明由 M7 改写 | §9 第 7 条、§2.3 |

评审之后到达的事：

- `d-chat-not-cards`（人定，17:01Z；17:08Z 五点方案「没问题」；17:16Z、17:23Z、17:27Z 的格式细则）：新 §3。去掉 `decision_card`、确认卡、五键卡、`ask_human`、`cards.ts`、`human-writes.ts`、`card-rules.ts`；加 `propose_to_human`、`record_human_answer`、提议式待决、原话核对与 `main-agent-graph`；访谈改为对话；模拟人改为回话；标定的通过条件与指标随之改。人给的四行例题成为 `d-plain-questions` 要的那道例题。
- `d-main-agent-models`、`d-auto-drive`、`d-design-onepage`：§2.6、§9 第 7 条、§12。
- 依据从 `e5ac3ed` 改为 `4d2edb7`：上一次运行的草稿写「工作树基点到 main 之间只有 `docs/graph/` 的改动」，`6134c83`（m8-row-titles）合入之后不再成立；行登记、探针脚本与客户端入口按它改，实施前快进两个工作树（§4 开头）。
