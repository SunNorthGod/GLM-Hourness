# M3 设计附录 0.6 独立评审（第 3 轮）

评审对象：`.agents/tasks/m3/design-addendum.md`（0.6，含第 1、2 轮评审后的两次修订，1,936 行）和邻居请求草稿 `.agents/tasks/m3/graph-ops-addendum-v06.json`（14 条）。对照：`design-addendum-0.5.md`、图节点 `d-ask-three-gates`（只读）、`.agents/tasks/design-context.md` 全文（含「Questions become conversation」一节里的「How the agent asks the person」）、M7 设计 0.6、规则板设计 0.10，以及 main 与 `.worktrees/m3`（未提交的第 6 步）上的 `src/graph/proposal.ts`、`plain-question.ts`、`src/design/identity.ts`、`talk.ts`、`stage-notice.ts`、`src/graph/engine.ts`。另读了被邻居请求引用的 M4 0.6、M5 0.6、bootstrap 0.6、metrics 0.5、user-graph 0.3 设计，和 rc.3 的 `dsh-agent-loop`、`dsh-tools` 里工具并发的实现。

上一轮：第 2 轮（HIGH 0、MEDIUM 1、NIT 9，CHANGES_REQUESTED）。本轮先逐条核对上一轮的 10 条，再审修订带来的变化和上两轮没有覆盖的部分。

## 结论

APPROVED。HIGH 0，MEDIUM 0，NIT 9。

上一轮 10 条全部关闭。修订没有引入新的挡路问题：本轮发现的 9 条都是措辞、清单完整性、邻居请求里的细节和文档清单，不属于 `docs/DEVELOPMENT.md` §1.1 的三类挡路情形（验收不满足；不可逆损失没有预防；失败没有途径发现、恢复或追溯）。其中最该先改的是 N-19：0.6 把确认与放行的短回话是否复述，交给了模型对「能撤回」的判断。

## 上一轮发现的核对

| 编号 | 上一轮级别 | 本轮 | 依据 |
| --- | --- | --- | --- |
| F-08 | MEDIUM | Closed | `graph-ops-addendum-v06.json` 的 `m4` 条已重写：M4 保留 `APPROVAL_WORDS`、`DECLINE_WORDS`、`answerOf` 与 harness 写的确认句，`AGREE_WORDS` 明说不是授权词表、M4 不导入；`request_exception` 仍直接返回 harness 写的文字，事实行在前，最后一行是 `recommend` 形状的是非问，`askTextRefusal` 与 `plainWordsIn` 只查那一行，示例不含路径；第三次修复由 `reopen.ts` 建带 `ask`、`form`、`proposal`、`reason` 的待决。附录 §19 F-07 行末补充已删，留了一句撤回说明。M4 设计 0.6 §5.5（`APPROVAL_WORDS` 在 design.md:974）与此对得上 |
| N-10 | NIT | Closed | 我取出 §2.8 的参考文本块（879 字符，含 19 字符的占位符），换成 291 字符的换词表得 1,151，与附录写的一致；§2.8、§3.4、§11、§19 同写约 1,150，说明总长约 3,300，单测上限 1,200 写明含换词表与围栏 |
| N-11 | NIT | Closed | 第 6 步 L2 现写「扩到本步的三个 id」并注明「九条里的前七条」，「第九个」已删；第 8 步 L2 的「两个 id」是对的（加 `main-agent-graph-stage`、`main-agent-graph-cli`） |
| N-12 | NIT | Closed | §9 开头：0.5 的事项在 v05，0.6 的（第 21 条起）在 v06 |
| N-13 | NIT | Closed | `rules` 条加了第（e）项（`MAIN_AGENT_RULES` 九条、新增 `design:main-agent-graph-delegations`、`main-agent-graph-options` 改标题、规则板设计里「八条」的位置）；§9 第 21 条补了一句 |
| N-14 | NIT | Closed | §4 开头 `talk.ts` 一行改为 `Shown` 加 `form?`、`exact?`，`talkApply` 在 `tool-call` 块读 `input.sample`（第 9 步起另读 `input.page`）。工作树 `talk.ts` 里 `Shown` 确实没有 `page?` |
| N-15 | NIT | Closed | 前言的兄弟设计版本与各设计版本行逐个相同：面板 1.1、规则板 0.10、循环板 0.6、M7 0.6、M4 0.6、bootstrap 0.6、metrics 0.5、user-graph 0.3、M5 0.6；§10 与 §9 第 18 条对 M4 0.6 的请求重新核对过 |
| N-16 | NIT | Closed | §3.3 的 `hint`、§3.4 的 `form` 不同的拒绝、§3.5 `add` 与 `reject` 两行都写了「带人刚说的原话 `graph_status` 改为 `dropped`，再新提一张」；第 6 步 L2 加了真实引擎的一例。我对着 `engine.ts` 的转移表核对：`approved → dropped` 存在，非特权的 `llm` 丢弃 `question` 被拒（`engine.ts`:570），带 `relay` 才有人的权限（:154） |
| N-17 | NIT | Closed | 规整（去首尾空白、NFKC、连续空白合一）、`acceptance` 至多 20 项、新增被拒（`invalid`，`field: 'scope'`）、提醒行至多列 20 项、单测各一例，均已写进 §3.5「委托」、§2.3、§3.15、第 6 步 L2 |
| N-18 | NIT | Closed | `choose` 例题的 `text` 改为「读者快到期或逾期时怎么提醒他们？我推荐站内通知加邮件，因为多数读者不会每天登录。」，我数得 40 个码点，问句 16；§2.8 的例题、`PLAIN_QUESTION_GUIDE` 的参考文本、§3.4 的渲染示例三处一致，§2.8 写明 `text` 里点名的推荐就是 `ways` 的最后一项 |

## 发现

### N-19（NIT）确认与放行的短回话要不要复述，被交给了模型对「能不能撤回」的判断

位置：§3.7 末段（「对能撤回的事，任何短话都直接记」）、§2.2 `TALK_GUIDE` 的复述一句、§11「随口回答的复述」；§3.6 防与不防一节第三条（附录第 806 行）仍写「人随口回答时先复述『那我记成……』」。

问题：0.5 对所有随口的回答先复述；0.6 只对「收不回的事」复述，而 harness 不知道哪件事收得回（§10 写明没有 `irreversible` 标记）。`confirm`、`release`（含模块）和 `delegation` 本身就是开权限的记录：放行解开子 agent 的写入，M7 起主 Agent 自己推进（`d-auto-drive`）。§3.6 自己又写「放行之后发现不对，人说一句，主 Agent 带原话把阶段改回 `design`」，模型多半把这几种归为「能撤回」，于是人回「嗯」「行吧」也直接记成同意，而这一步在 0.5 里有复述兜底。决定里写的是「收不回的事先复述（不变）」，没有说放行与确认可以少这一步。后果可发现（`recordedAs` 和原话进历史，标定数含糊短话的次数）也可恢复（阶段改回），所以不挡路；但 0.6 在最高权限的记录上放宽了，§3.6 与 §3.7 对同一条规则又写成两个版本。

修法：§3.7 与 `TALK_GUIDE` 各加一句：`kind` 为 `confirm`、`release` 的回话和任何 `delegation`，一律按「收不回」处理，清单外的短话先复述再记。harness 按 `kind` 就知道，不需要模型判断；这几种每个目标或模块只出现几次，不增加人的负担。§3.6 附录第 806 行改成「对收不回的事、以及确认与放行，人随口回答时先复述……」。`TALK_GUIDE` 现在 1,475 字符、第二部分 1,767，已贴近 1,800 的上限，所以同时把第二部分上限改为 1,900、整节改为 3,100（或把现有句子压短），单测的三个上限同改。

### N-20（NIT）`AGREE_WORDS` 漏了这位人自己最常用的几个同意说法

位置：§3.7 末段、§2.2 `TALK_GUIDE` 括号里的清单（可以、好、好的、行、就这样、就推荐的、第 N 条）。

问题：本任务的原始消息里人的同意是「没问题」「都没问题」；`want` 问法下 §3.5 写明「人说『对』是 `agree`」，但「对」「是的」「同意」也不在清单里。这些都不到 6 个码点，按 §3.7，对收不回的事会被当成清单外的短话，先复述再记，这正是 `d-ask-three-gates` 要去掉的多余往返。清单也是 `check.mjs` 数「没有复述就记」的上界，漏词会把正常的同意算进可疑记录。

修法：`AGREE_WORDS` 加「没问题」「都没问题」「对」「是的」「同意」，`TALK_GUIDE` 的括号由它生成，所以只改 `answer-marks.ts` 一处；`tests/answer-marks.spec.ts` 的「为真」一列加这五个词。字数见 N-19 的上限调整。

### N-21（NIT）文档同批改的清单点名的章节，不是 main 上写着四行方案的地方

位置：§4 第 6 步「变化」末条（文档）与 §9 第 26 条：「`docs/ORCHESTRATION.md` §2.6、§2.9 的待决一行、§3.5、§5 决策卡一节……；`docs/DESIGN.md` 的图格式一节同改」。

问题：我在 main 的 `docs/` 里搜「四行」「背景、推荐」「propose_to_human」「提议式」：`docs/ORCHESTRATION.md` 里会因 0.6 过时的只有 §3.1 的「身份」一条（第 492 行：「要人答的事用 `propose_to_human` 交四行方案……一道完整的好题（题材是高峰时段派出去的活怎么排……）……长度上限……第一部分 1,500 字符，第二部分 1,400，整节 2,700」）和「说话方式」一条（第 495 行：「聊天，不给选项和字母」），另有 `docs/HANDOFF.md` 第 56 行（「`src/graph/proposal.ts` 只有 `renderProposal`，是第 6 步的起点」）。清单点名的 `ORCHESTRATION.md` §3.5 是「模型档位与并发」（第 538 行），与问人无关；`docs/DESIGN.md` 搜「提议式」「四行」「background」都没有命中，没有「图格式」一节；§2.6（存储与文件格式）与 §2.9（引擎 API）是该新加提议式待决字段的地方，但那是新增，不是把「四行」改成别的。按清单做的人会改不到该改的，`AGENTS.md` 要求的「文档与行为改动同批」落空。

修法：清单改为：`docs/ORCHESTRATION.md` §3.1 第 492 行（四行方案、好题的题材、三个字数上限改为 1,500 / 1,800 / 3,000）与第 495 行（可以列两三条路，走 `choose`）；`docs/HANDOFF.md` 第 56 行的 `design` 行；§2.6 的节点字段与 §2.9 的待决一行新加提议式待决的字段；§5 决策卡一节照原计划改写；删去 §3.5 与 `docs/DESIGN.md`。

### N-22（NIT）放行稿有没有「要你定的」一节，附录前后写成了两个说法

位置：§3.1 末段（「一页放行稿的『要你定的』也用这些形状，不再写四行」，第 506 行）、§12 `d-ask-three-gates` 一行（「放行稿的『要你定的』改用四种问法」）、§18 的 §3.14.5 一行（「放行稿不设『要你定的』」）、§3.14.5 末条（「放行稿不设『要你定的』一节」）。

问题：0.5 的 §3.14.5 没有这一节（`design-addendum-0.5.md` 里搜不到「要你定的」），`d-onepage-concrete` 说的是编排方在 DSH 之外写的 `onepage.md` 里的「要你定的」。§3.14.5 的处理（产品放行稿不设该节，要人定的事先各自问完；编排方的一页稿按四种问法写、至多三件）是清楚的，但 §3.1 与 §12 的说法读起来像产品的放行稿里有这一节，实现者会去找它。

修法：§3.1 第 506 行与 §12 那一行改成同一句话：「产品里的放行稿不设『要你定的』一节，要人定的事各是一张待决，按四种问法单独问（§3.14.5）；编排方在 DSH 之外写的一页稿，其『要你定的』一节按四种问法写、至多三件」。

### N-23（NIT）再给人看一次 `look` 问法的待决时，草图丢了

位置：§3.4 参数表（`sample`：「confirm、release、look」）与「再给人看一次」一条（「`question` 与 `text`，没有 `form` 等」）、检查第 2 条（「`sample` 只对 `confirm`、`release` 和 `form: look`」）。

问题：`look` 的草图只在 `sample` 参数里，不存图（图上只记 `proposal` 的名字）。再给人看一次时没有 `form` 参数，`sample` 又只对带 `form: look` 的调用开放，所以循环板「有事等你超过 24 小时再说一次」或 M4 的第三次修复再展示一张 `look` 待决，人读到的是「借书页草图在下面，看着哪里不对？」，下面却没有草图，`Shown.exact` 也是空的，第 5b 步不核对。

修法：再给人看一次时，节点现有 `form` 是 `look` 就接受 `sample`（同样至多 6,000 个码点、放围栏、记 `exact`）；节点是 `look` 而没给 `sample` 时 `invalid`，`hint`「pass the sample again: it is not kept on the graph」。第 6 步 L2 加一例。

### N-24（NIT）指标里「问人的次数」不含访谈，附录与 `metrics` 请求都没写

位置：§3.12 末段（「问人的次数、每种问法各问了几次、每问读多少字……都由这几条算出」）；`graph-ops-addendum-v06.json` 的 `metrics` 条第四点。

问题：访谈第 1–6 步在聊天里问、不走工具（F-02 的取舍），所以 `design.proposal-shown` 里没有它们。人在第一次接手一个项目时被问得最多的正是访谈，试行要看的「每周被问几次、每问读多少字」因此会偏低，而文字写成「都由这几条算出」。只有第 12 步（a）的标定从会话日志数访谈的问号个数。

修法：§3.12 末段和 `metrics` 条各加一句：「访谈第 1–6 步的问句在聊天里，不进这些事件；试行汇报写『问人次数（不含访谈）』，访谈的负担看标定的问号个数和人的原话」。要把访谈也算上，另需一个 harness 能数的事件，不在本版做。

### N-25（NIT）三条邻居请求各有一处与邻居设计或附录自己的规则对不上

位置：`graph-ops-addendum-v06.json` 的 `bootstrap`、`m4`、`m5` 三条。

1. `bootstrap` 第一点让「不许碰的地方用 `want` 问法」。但 §3.4 与 §3.13 规定 `attach` 只配 `form: recommend`，而接管设计 0.6 的两件必须问人的事都带 `attach`（design.md:52：`bootstrap:<接管 id>:cost` 与 `…:touch`），「不许碰」的路径另提一条 `attach: rules:<id>` 的规则提议（design.md:52、:103）。照这一点做，`touch` 一件就没有 `attach`，也过不了 `propose_to_human`。修法：两件都写 `recommend`（「我建议这些地方不碰：……，可以吗？」）；`want` 只用于不带 `attach` 的问话。
2. `m4` 改了申报文字，没提 `request_exception` 结果里的 `lines`（`{title, background, proposal, doubt, notTaken}`，M4 design.md:892），面板「需要你」的申报一类（M4 design.md:1034）按它显示四行；`m8-plain-language` 条第六点只让面板读 `shownProposalOf` 的结果，而它只认 `propose_to_human`，认不出 M4 的申报。修法：`m4` 条加一句「`request_exception` 结果的 `lines` 改为 `ask`（申报最后那一行问话）与 `form: recommend`」；`m8-plain-language` 条第六点加「M4 的 `request_exception` 的 `ask` 结果同样取 `ask` 一行」。
3. `m5` 只谈了偏好；M5 设计 0.6 里「按四行方案写」还有三处（design.md:21 的 D1、:43、:100）。修法：`m5` 条末尾加一句「M5 设计里按四行方案问人的三处（D1、§1 表第 43 行、依据一栏）随新决定改成按问法写」。

### N-26（NIT）版本行说「会变的东西只在 `talk.ts` 与 `proposal.ts` 两处」，与实际的分布不符

位置：附录版本行（「所以会变的数（长度上限）和四种问法的措辞都收在 `src/design/talk.ts` 与 `src/graph/proposal.ts` 两处，改起来只动这两处」）、§3.2 标题（「说话的规矩只在两处定」）。

问题：照附录自己的安排，例题与换词表句在 `src/graph/plain-question.ts`（单测钉住它们的字数），同意字眼清单在 `src/shared/answer-marks.ts`，「这类你定」的 20 项上限在 `record.ts`，`sample` 与 `PAGE_LIMITS` 的上限在 `propose.ts` 一带。人看效果后要调的多半是这些，按「只动两处」估工作量会低估。

修法：版本行和 §3.2 标题改成「长度上限与四种问法的写法主要在这两处；例题在 `plain-question.ts`，同意字眼在 `answer-marks.ts`」，并在 §11 列出这几个常量各在哪个文件。

### N-27（NIT）§3.7 的举例仍用练习题（记账小工具）的领域

位置：§3.7 表（附录第 817、818 行）：「不行，钱要能按月看」「另外，数据只放在本机」。

问题：任务约束写明例子不用记账小工具的领域，图书管理系统可以。这两句是 0.5 留下的，第 8 步标定任务的答案正是「数据只存在本机，一个文件就够」「月底我能一眼看出钱主要花在……」。§3.7 这一节 0.6 改过表格，却保留了这两句。它们不进模型的提示词（`d-agent-examples` 管的是工具说明里的示范），所以只是文档里的说明例子，但会让人以为这节的话来自练习题。

修法：换成图书管理系统的句子，例如「不行，逾期的读者要能收到提醒」（`reject`）、「另外，读者的借阅记录只放在本机」（`add`）。

## 已核实的假设

- 邻居请求文件：合法 JSON 数组，14 条，每条的键恰为 `op`（值 `comment`）、`id`、`text`；严格 UTF-8 解码通过，前 6 字节 `5B 0A 20 20 7B 20`，无字节序标记；14 个节点 id（m3、m7、m4、m8-plain-language、bootstrap、metrics、m5、user-graph、rules、schedules、d-plain-questions、d-chat-not-cards、d-option-card、d-agent-examples）在图上都存在（逐个 `show`）；任务点名的十个节点全部覆盖；单条最长 1,859 字符，`mutation.ts` 的 `comment` 只要求 `text` 非空字符串，没有长度上限；与 v05 草稿格式相同。附录与草稿里搜不到人设与语气词。
- 决定逐项落点：三道关（问不问、什么时候问、怎么问）写进 `TALK_GUIDE`；四种问法 `recommend`、`choose`、`want`、`look` 与记录字段 `ask`、`form`、`proposal`、`reason`、`cost`、`ways`、`notTaken`、`conclusion`；记录与问话分开，硬限制是一行、恰好一个问号、字数上限、换词表、一条回复至多三件；收不回的事先复述；「这类你定」存成可撤的偏好，只对能撤回的事。字段名用 `form` 而不是 `kind` 有理由（`kind` 已被占用），版本行写明。取消的东西（四行、标签、加粗、`background`、`doubt`、不列选项）在 §0、§3.1、§18 逐项列出。决定没写、附录为落地加的几处（`textCoversRecord`、填空词拒绝、`look` 的 `sample` 要给人看过、`delegation` 的核对、`AGREE_WORDS`、访谈留在聊天里）在 §18 末段与 §11 披露，并在 `m3` 条请编排方告诉人。
- 代码清单：main 上 `src/graph/proposal.ts` 只有 `ProposalText`、`renderProposal` 和未导出的 `CIRCLED`、`LINES`；`plain-question.ts` 有 `PLAIN_QUESTION_EXAMPLE`、`GUIDE_INTRO`、未导出的 `GUIDE_WORDS`；`identity.ts` 的 `MAIN_AGENT_TALK = [TALK_GUIDE, PLAIN_QUESTION_GUIDE]`；`talk.ts` 的 `TALK_GUIDE` 含「never give them options」「four short lines」。工作树里 `PROPOSAL_FIELDS`、`PROPOSAL_LABELS`、`PROPOSAL_LIMITS`（`line: 40`）、`splitBold`、`withoutBold`、`proposalLineRefusal`、`ProposalField`、`PLAIN_LIMITS`（`title: 40, why: 80, background: 60`）、`sealed`、`proposalOpen`、`shapeChange`（`engine.ts`:621、:637、:642）、`ProposalLine`（`ui/src/graph/common.tsx`:232）、`FIELD_LABELS` 的四个旧标签（`model.ts`:272–275）、`propose.ts` 的 `TEXT_FIELDS`、`textOf`、「all five or none」，`main-agent-graph.ts`:138 的 `rightPath` 都在。我对 `src`、`tests`、`ui/src`、`scripts`、`packages` 按这些符号和 `background`、`doubt`、「four lines」做了一遍搜索，命中的文件都在 §4 开头的「要改」「要删」里；`aliases.ts`、`zcode-tool-text.ts` 的 `background` 是无关用法。`stage-notice.ts`:66 的 `INTERVIEW_METHOD`、:104 的「疑问 line」在分支 `m3` 已提交，对得上。`pins.ts` 的未提交改动只是读 `node.conclusion`，与四行无关。
- 引擎事实：`planPropose` 接受调用方给的 `id`（`norm-delegations` 可建）；带 `relay` 的写入是特权，`initialStatus` 直接给 `approved`；非特权的 `llm` 不能把 `question` 改为 `dropped`；`decide` 之后只有人的权限能再拍。
- 数字：身份节第一部分 1,137、`TALK_GUIDE` 1,475、`PLAIN_WORDS_GUIDE` 291、第二部分 1,767、整节 2,906、`TALK_SHAPES` 1,613；`PLAIN_QUESTION_GUIDE` 参考文本 1,151；四道例题的码点数（`recommend` 47/34，`choose` 40/16 与路 23、30，`want` 40，`look` 16 与 `sample` 74）我都重算过，与附录一致。
- 并行调用不会绕过「一条回复至多三件」：rc.3 的 `dsh-tools` 里 `executionMode` 对没有 `isConcurrencySafe` 的工具返回 `exclusive`（`dsh-tools/lib/index.js`:3154–3160），`dsh-agent-loop` 的 `executeToolCalls` 对 `exclusive` 的调用逐个跑完并提交结果再取下一个。工作树里的 `propose_to_human` 与 `record_human_answer` 没有声明 `isConcurrencySafe`，所以第二个调用读投影时第一个的 `Shown` 已在。上一轮把这一点列为未核实，现已核实。
- 兄弟设计：版本行与前言一致（面板 1.1、规则板 0.10、循环板 0.6、M7 0.6、M4 0.6、bootstrap 0.6、metrics 0.5、user-graph 0.3、M5 0.6）；M7 0.6 的 `askDraft`（design.md:713）、「停下之后」提醒与四行草稿、规则板 0.10 的 `rules_propose` 结果文字（:1542）和示范常量（:1561）、循环板的 `loop_propose` 文字都存在，`m7`、`rules`、`schedules` 三条对它们的描述准确。
- `design-addendum-0.5.md` 存在；两版的节标题差异只在版本行列出的位置（2.2、2.8、2.9、3、3.2、3.7 改名，新增 3.15、§4 的 0.6 一节、§18、§19），没有丢节。
- 写入范围：附录与草稿都在 `.agents/tasks/m3/` 下；main 的 `git status` 里没有 `docs/graph` 或 `src/` 的改动（只有 `video/`、`.kiro/` 等无关文件）；`.worktrees/m3` 的未提交改动最晚修改于 2026-10-31 23:42（`scripts/calibrate/simulated-human.mjs`），早于第 2 轮评审（2026-11-01 01:37），所以第 2 轮和本轮核对的是同一份工作树状态。

## 未核实或有误的假设

- 有误：N-21（文档清单点名的章节里没有那些字，真正过时的是 §3.1 两条和 `HANDOFF.md` 一行）；N-22（放行稿「要你定的」的前后矛盾）；N-25 第 1 点（`bootstrap` 条让带 `attach` 的问话用 `want`）；N-26（「只动两处」）。
- 未核实：rc.3 对工具说明长度有没有上限（附录约 3,300 字符）。附录已把它列为第 6 步 L3 的核对项，并写明被截断或被拒时停下交编排者，这是可发现、可恢复的做法，我没有去读 rc.3 的注册代码。
- 未核实：`isPlainYes` 的整句比较在真实对话里会放过多少含糊短话；这靠第 12 步（a）的标定数，附录已写。
- 未核实：M5 合入时 `storeDelegation`、`forgetDelegation` 的实际形状；那是 M5 的设计决定，`m5` 条只提了请求。

## 修订历史

- 第 1 轮：CHANGES_REQUESTED，HIGH 1（F-01：「这类你定」的存法在设计期写不进去，剩下的路让模型给自己授权）、MEDIUM 6（F-02 至 F-07）、NIT 9（N-01 至 N-09）。
- 第 2 轮：上一轮 16 条全部关闭；新发现 MEDIUM 1（F-08：`m4` 条让 M4 的放行词表改用 `AGREE_WORDS`，并让主 Agent 在申报里复述再记，与 M4 设计 0.6 §5.5 冲突）、NIT 9（N-10 至 N-18）。CHANGES_REQUESTED。
- 第 3 轮（本文）：上一轮 10 条全部关闭；新发现 MEDIUM 0、NIT 9（N-19 至 N-27）。APPROVED。
