# 提议式待决、问人与记话两个工具、图写入规矩：附录第 6 步的独立评审

评审对象是 `.worktrees/m3`（分支 `m3`）上这一步唯一的提交 `05d524a`，叠在第 5 步（`e48fc70`）之后。我读了整个提交：图引擎的格式与权限（`src/graph/` 的 `proposal.ts`、`schema.ts`、`format.ts`、`engine.ts`、`mutation.ts`、`projection.ts`、`tools.ts`、`stage.ts`、`pins.ts`）、`src/design/` 的 `talk.ts`、`propose.ts`、`record.ts`、`attach.ts`、`tool-support.ts`、`index.ts`、`role-face.ts`、`stage-notice.ts`、`identity.ts`、`metrics.ts`，`src/guard/` 的 `main-agent-graph.ts` 与 `main-agent.ts`，`src/shared/` 的三处，面板三个文件，模拟人与探针脚本，四份文档的改动，以及新增和改写的 spec 的用例清单。对照附录 0.6 的 §2.2、§2.8、§3.2 至 §3.8、§3.11、§3.15、§4 开头的「0.6 对步骤的影响」和第 6 步一节，`design.md`，`onepage.md`，`design-context.md`（「How the agent asks the person」一节），图上 `m3-5`，`docs/DEVELOPMENT.md` §1.1，以及 `brief.md` 的流程规则。没有重跑套件，采用提交说明和 `impl/notes/step6-*.txt` 记录的结果：build、preflight 退出码 0；`npm test` 退出码 0，失败 0，跳过 1（面板写法检查第二阶段，理由见 Details）；eslint 250 条压制、knip 21、jscpd 2 处克隆，三者都等于基线，基线文件没有改，diff 里唯一的压制是一条写了理由的 `@ts-expect-error`；gitleaks 无发现；probe 173/173。这一步没有更早一轮的评审文件，没有旧发现要逐条核对；第 5 步评审留给本步核对的一件事（`lastDecidedByHuman` 那条旧路）在 Details 里有交代。工作树干净。

## 摘要

这一步把主 Agent 问人的办法落成代码。图引擎认第二种待决（没有 `options` 的提议式，带问句、问法、推荐、理由、代价、做法和结论）；设计行注册 `propose_to_human` 与 `record_human_answer`，只给主 Agent；会话投影 `hournessTalk` 折叠出人发来的消息和给人看过的东西，`personSaid` 逐段核对主 Agent 引的原话；守卫加三条图写入规矩（转述要是原话、不给人列选项表、「这类你定」只经记录工具写）。实现与附录 0.6 逐条对得上，文档与代码同批，设计行仍是 `disabled: true`，没有新增行，没有新增告警或基线。没有阻塞项。

Watch for：（1）主 Agent 有 shell，而图的命令行把请求里的 `relay` 原样交给引擎并得到人的权限；规矩第 4 条 `main-agent-graph-cli` 在第 8 步才来，所以在那之前「转述的人话要是原话」对主 Agent 在会话里并不成立，§6.9 的残余把命令行写成「在 DSH 之外」，说少了（confirmed，读 `cli.ts` 与 `src/guard/` 的全部规则）。（2）PTC 预设下带 `parent` 的嵌套调用到不了这三条规矩，而人的权限只靠它们把关（S4-1、S5-1 仍欠；§6.9 与 HANDOFF 如实写了，测试把这个洞钉成了现状；触发条件要选 PTC 预设，likely）。（3）S4-4 按编排方的话要在第 6 步之前清掉，仍欠。

**Verdict**: APPROVED

## 高层视图

「人的原话是不是人说的」：折叠只认 `source.kind` 为 `user`、没有 `form`、正文不只是 `/goal` 附件那句固定文字的 `user/message`。我对过 rc.3 里别的会往会话里放消息的地方：子 agent 完成回报是 `subagent-settled`（notice），换模型提示是 `model-selection`（notice），agent 之间的消息是 `agent-message`，目标驱动的消息是 `goal`，都不会被当成人的话。核对把每一段规整后要求落在人发来的某条消息里，起止在空白或标点上；起点有三种，读不到消息就拒绝，行健康降级。核对的是「这段话在人的消息里」，记成什么意思（`recordedAs`、`scope`）是主 Agent 的转述，harness 判断不了语义，附录 §3.6 明说了。

「子 agent 与别的会话的图工具权限」：子会话（会话头 `origin: 'subagent'`）带任何 `relay` 一律拒绝，不看内容，并通知持有者。指向 `norm-delegations` 的写类图调用对所有会话都拒绝，带不带 `relay` 一样。子 agent 和普通会话调两个新工具得 `forbidden`，工具面里也没有它们。普通会话的 `relay` 不核对，是附录定下的。

「主 Agent 有没有写文件的办法」：这一步没有给它任何写文件的工具；两个新工具只写项目图，图文件仍由 `graph-files-only` 守着不许直接写。仍然成立的缺口有三个：PTC 嵌套调用（S6-2）、图的命令行（S6-1）、guard 声明还叫主 Agent 用 Write/Edit（S6-3）。

「高峰」：没有东西拦住主 Agent。diff 里没有读高峰档位、排队、等待或定时的代码；两个工具都不结束回合，也不等人；`too_many`、`unavailable`、`not_shown` 都是立刻返回的拒绝。

「示例题」：四道例题（虚构的图书馆系统）走和真实输入同一套检查：`plainWordsIn`、`askTextRefusal`、`proposalRecordRefusal`、`textCoversRecord`，再交给真实引擎提议一次；探针里用同一道 `recommend` 例题走完整条路，并核对工具说明没有被截断。

「流程规则」：一步一个提交，消息写了 `m3-5`，文档与代码同批，没有新行，激活期没有新的会抛错的路。具名用例大多写了；没写的在提交说明里列出并给了理由，其中指标字段那几例的理由偏弱（S6-4）。

<details>
<summary>Issues (8)</summary>

1. **S6-1 图的命令行在第 8 步之前是主 Agent 伪造转述的路**（MEDIUM，非阻塞，confirmed）：`src/graph/cli.ts` 以 `llm` 身份把请求里的字段（含 `relay`）原样交给引擎，引擎给带 `relay` 的写入人的权限；主 Agent 的 shell 没有被拦（`src/guard/` 里没有任何规则认命令行，`main-agent-graph-cli` 在第 8 步）。`ORCHESTRATION.md` §6.9 的残余写成「在 DSH 之外不受这些规矩管」，HANDOFF 的残余清单没有它。改：两处改成「会话里的 shell 能到命令行，第 8 步的 `main-agent-graph-cli` 之前，主 Agent 可以用编的 `relay` 经它写图」；设计行在第 8 步合入前保持禁用，不要因为 §6.4 的表写着「已实现」就放进任何真实会话。
2. **S6-2 嵌套调用到不了三条图写入规矩**（MEDIUM，非阻塞，confirmed 读代码，触发条件 likely）：带 `parent` 的调用在监听器第一行放行（S4-1、S5-1），所以 PTC 预设下 `run_code` 里的 `graph_decide` 带编的 `relay` 不被核对。`tests/design-graph-rules.spec.ts` 的「a nested call with a parent token is never judged」把这个洞钉成了现状。§6.9 与 HANDOFF 如实写了，§6.4 的表和身份节的说法仍无条件。改：按编排方的裁定在合并步骤之前以独立提交修一次（主 Agent、子 agent、图写入共用同一个入口，或工具模式是 `ptc` 时行健康降级），提交里把这条测试翻过来。
3. **S6-3 S4-4 该在第 6 步之前清掉，仍欠**（LOW，非阻塞，confirmed）：`src/guard/rules.ts:161` 的声明仍对主 Agent 写着「Modify files and code only with the dedicated Write/Edit tools」，同一份提示词里的身份节说它没有写文件的工具。第 4 步评审写的是「第 6 步前处理」，编排方的话也是「before step 6」；提交说明把它列进「owed」。改：guard 的声明监听器对主 Agent 省掉这一行或改成不点名工具，独立提交，先写失败的测试。
4. **S6-4 指标字段的具名用例没写，理由偏弱**（LOW，非阻塞，confirmed）：附录点名「事件 `delegated` 为真、不计入跟随率」「`choose` 选最后一条时 `pickedRecommended` 为真、选别的为假」；提交说明的理由是出口不做事所以没有测试看得见。`emitMetric` 是模块级函数，加一个可替换的出口只要几行（守卫那一支已经走 `deps.metric`）。试行的跟随率靠这几个字段，指标流水接上之后第一个用户会相信它们。改：给 `src/design/metrics.ts` 一个测试用的出口，补 `delegated`、`pickedRecommended`、`form`、`restated` 的断言；不晚于指标流水接上的那个提交。
5. **S6-5 「这类你定」规矩的拒绝在指标里被标成主 Agent**（NIT，非阻塞，confirmed）：`main-agent.ts` 的 `denial()` 把 `session` 标成 `delegated ? 'subagent' : 'main-agent'`，指向 `norm-delegations` 的拒绝发生在读角色之前，普通会话被拒也标 `main-agent`；对应的违规流水也没有 `session`。出口现在不做事，接上之前改成不猜（省略或 `unknown`）。
6. **S6-6 探针脚本一处断行丢了**（NIT，非阻塞，confirmed）：`scripts/probe/run-probe.mjs:1126` 是 `}function designChecks() {`，`questionChecks` 的结尾和下一个函数连在一行。拆开。
7. **S6-7 一页放行稿与提交里的解释要编排方落笔**（NIT，过程，非阻塞）：`onepage.md`（人批过）还写着四行版式、「随口的短话一律先复述」和「回『行』可能多问一次」；实现按人之后的决定 `d-ask-three-gates`（「都没问题。先这样改和试行吧」）和附录 §3.7 走，只对收不回的事复述，`AGREE_WORDS` 含「行」。这不是本步的缺陷，但「做出来的东西不许和一页稿冲突」这条要能核对，请在一页稿上注明被 `d-ask-three-gates` 取代的几处。提交说明里的解释（检查次序、模拟人在最后一条助手消息之后晚一个微任务回话、空 `acceptance` 被引擎从文件里去掉、撤销一类用自己的 `reason` 开头、`norm-delegations` 被丢弃或取代时 `delegation` 拒绝、`isPlainYes` 接受「第 N 条」里的空格等）按「由 agent 定、人可推翻」记进图。
8. **S6-8 「这类你定」是长期授权，原话不必提到授权**（NIT，非阻塞，possible）：`delegation` 只核对 `words` 出自人的最后一条消息，一句「好」也能给任意 `scope` 做依据。附录接受这一点（harness 判断不了语义，补救靠当场那句告知、每个阶段列出现有各类、一句「这类还是问我」撤销）。建议在 `design.delegation` 事件里记原话的长度，标定时像数短记录那样数一下；不要求现在加检查。

</details>

<details>
<summary>Details</summary>

### 人的权限从哪来，一条线

引擎只认一件事：写入是人，或者是 `llm` 且带 `relay`（`engine.ts` 的 `privileged`）。所以「relay 是不是人说的」必须在写入之前由别处核对。这一步有两条核对的路，另有规矩拦住别的路：

```
人的消息 ──> user/message(source.kind=user, 无 form) ──> hournessTalk.people
                                                               │
        record_human_answer(words) ──> personSaid(起点) ───────┤──> engine.apply('llm', relay=原话)
        graph_* 带 relay（主 Agent）──> main-agent-graph-relay ┘        （人的权限）
        graph_* 带 relay（子 agent） ──> 一律拒绝
        graph_* 指向 norm-delegations ──> 一律拒绝（所有会话）
        PTC 嵌套 ──> 到不了守卫（S6-2）      shell 里的图命令行 ──> 第 8 步才拦（S6-1）
```

折叠里人的消息只来自 `personTextOf`：类型、`source.kind`、没有 `form`、去掉首尾空白后不等于 `GOAL_ATTACHMENT_TEXT`。通知、dsh-time-context 的消息、主 Agent 自己的消息、`/goal` 附件那一句，都不进 `people`；`record-human-answer.spec.ts` 的「words the human did not say …」用真实折叠逐个喂了这几类，并核对图的修订号没动。子会话的 `talkInit` 是 `inert`，父 agent 的任务消息不会被当成人的话。`personSaid` 的时间比较用严格的 `>`，同一毫秒的消息不算（偏安全）。

起点三种：`question` 取待决最后一次 `propose`、`edit` 或 `decide` 的时间；图工具取节点最后一次非批注历史的时间，批注不挪起点；`delegation` 取 `people` 倒数第二项的时间，所以原话必须出自人的最后一条消息。`record_human_answer` 的 `question` 一支不要求这件事是本会话 `propose_to_human` 交过的（只有带样稿或带别的组件原文时才查 `Shown`）。这是附录有意的：主 Agent 搬到新会话以后，人在新会话里回话照样算，所以我没有当成缺陷。

第 5 步评审留给本步核对的那条旧路：`stage.ts` 的 `lastDecidedByHuman` 把任何带 `relay` 的拍板当成人定的，需求卡的「岔路」一项靠它，一条编的 `relay` 能把它凑齐。这一步对工具路径收了口：主 Agent 的 `graph_decide` 带编的原话被 `main-agent-graph-relay` 拒绝，子 agent 一律被拒，`record_human_answer` 自己核对。没收的是 S6-1 和 S6-2 的两条路，以及普通会话（附录定的不核对）。

### 守卫里的次序和失败方向

监听器先判指向 `norm-delegations` 的写类图调用（所有会话），再判子会话带 `relay`（拒绝并告警），再读主 Agent 的角色，最后才对主 Agent 的 `relay` 与选项表判断。读不出角色时放行并让行健康说明，这是第 4 步的取舍，对 `relay` 也是这个方向；读不到会话消息时，`relay` 的核对和 `record_human_answer` 都是拒绝，方向相反，附录有意如此（放行等于把人的权限交给没核对过的话）。探针场景 `glm-design-question` 在真实运行时上走了子 agent 带 `relay` 改目标阶段的一幕：目标没动，流水里有子 agent 的会话，主 Agent 的下一个请求里有 `glm-design-bypass`，设计行显示「部分生效」。

`delegation` 在工具体里先 `personSaid`、再直接调 `openEngine(dir).apply`，不经图工具，所以设计期（目标在 `interview`）也写得进去，附录要求的这一点有真实引擎的用例。

### 引擎的格式与权限改动

`decide` 在 `options` 在不在两条路之间分流，`planConclude` 排在 `decideRefusal` 之后，所以对人定的提议式待决，没有人或没有 `relay` 的 `llm` 仍然 `forbidden`。已拍板的提议式待决，非特权写入不能改标题和记录字段（`sealed`）；`form` 不在可编辑字段里，`parseMutation` 直接拒；`edit` 不能换形状（`shapeChange`）。被改动的几个 spec（design-guard、graph-engine、graph-tools、plain-question、design-mode、design-stage-notice、contracts）用例数前后相等或增加，没有用例被删。

一处可改善、我没有记成发现的：任何 `llm` 都能改一张未拍板提议式待决的记录字段（附录 §3.3 的写法），所以子 agent 能在人回话之前改面板上显示的 `ask`、`proposal`。这样的改动会把待决的最后变更时间挪到之后，人的回话随后被拒（偏安全），而且历史里留着前后值。

### 示例题与硬限制

`PLAIN_QUESTION_EXAMPLES` 的四道题我手算了字数和位置，都在上限之内、记录字段落在该在的地方。`tests/plain-question.spec.ts` 的「every example passes the checks a real question passes」和 `propose-to-human.spec.ts` 的契约用例（每道例题经 `propose_to_human` 交给真实引擎）把这件事固定了，改任何一个上限都会让例题失败。附录点名的〔未核实〕的事（rc.3 对工具说明长度有没有限制）有了结果：探针第一个检查核对工具说明含四道例题和换词表、以 `say what the document is.` 结尾，总长 3,251 字符，没有被截。

### 没写的具名用例

提交说明列了：面板写法检查第二阶段（`plain.ts` 不在 main，显式跳过一例，不做替身，符合附录与 AGENTS.md）；`confirm` 带 `sample` 的 `not_shown`（第 8 步）；指标事件（S6-4）；`stale_revision` 重试路径（附录没有点名，代码重试一次）；面板组件没有 DOM 测试环境，类型检查覆盖。除指标那一项外，理由成立。附录点名的 L3 八项检查都在探针里，两个工具进了主 Agent 的工具面检查，普通会话的工具面检查确认没有它们。

</details>

<details>
<summary>File map</summary>

完整 diff：`git -C .worktrees/m3 show 05d524a`。

- `src/graph/proposal.ts`：问法、数、记录规则、问句与硬限制的纯函数、`renderAsk`，唯一定义处
- `src/graph/schema.ts`、`format.ts`、`mutation.ts`、`engine.ts`：提议式待决的字段、读图形状、`decide` 的 `conclusion`、封存与不许换形状
- `src/graph/projection.ts`、`tools.ts`、`stage.ts`、`pins.ts`：投影、工具说明、需求卡的岔路、摘要直接读 `conclusion`
- `src/graph/plain-question.ts`：换词表和四道例题
- `src/design/talk.ts`：会话投影 `hournessTalk`、`personSaid`、`TALK_GUIDE`、`TALK_SHAPES`
- `src/design/propose.ts`、`record.ts`、`tool-support.ts`：两个工具和它们共用的拒绝与读图
- `src/design/attach.ts`、`metrics.ts`：别的组件提议的分派表（空）、指标出口（不做事）
- `src/design/index.ts`、`role-face.ts`、`stage-notice.ts`、`identity.ts`、`mode.ts`：投影与工具的注册、告警、普通会话去掉两个工具、偏好提醒行、身份节
- `src/guard/main-agent-graph.ts`、`main-agent.ts`、`main-agent-rules.ts`、`index.ts`：三条图写入规矩与告警
- `src/shared/answer-marks.ts`、`tool-names.ts`、`dsh-min.ts`：三种说法的字面、两个工具名与 `shownProposalOf`、薄类型
- `ui/src/graph/common.tsx`、`model.ts`、`Decisions.tsx`：面板只读显示
- `scripts/calibrate/simulated-human.mjs`、`scripts/probe/run-probe.mjs`：模拟人回话与探针场景
- `docs/ORCHESTRATION.md`、`DESIGN.md`、`HANDOFF.md`、`DEVELOPMENT.md`、`package.json`：文档与测试链
- `tests/`：新增 8 个 spec 与 2 个辅助文件，改写 9 个 spec 与 2 个辅助文件

</details>
