# M7 设计：执行、汇合与运维

版本：0.3（2026-10-30），第三稿。0.2 经两轮独立评审批准（第 2 轮 APPROVED，挡路 0、不挡路 11），人读了它的人话版清单之后改了四处方向（`d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-one-main-agent`），随后又定了问人改成聊天（`d-chat-not-cards`）、两层循环与一页放行稿（`d-design-onepage`）、两块板上的默认条目只能看（`d-defaults-readonly`）、项目里的规矩都在两块板上看得到（`d-rules-visible`）、审查深浅由主 Agent 定而底线由人批（`question-38` C 与 `norm-review-floor`）、统一的指标流水（`metrics`）。本稿按这些改写；方向清单的逐条对照在 §1.1，评审按它挡路。0.2 全文留在同目录的 `design-0.2.md`（`.agents/` 不进 git）。0.2 第 2 轮评审的 11 条不挡路意见在本稿的处理见 §16。
依据：main `d32468c`。split 第 0–8 步已在 main（`0d9c337`..`de14525`），两个插件 `dsh-glm-zcode`、`dsh-hourness` 的布局以它为准，行按包的子路径命名（`6134c83`：`{id: glm-hourness/<行>, name: dsh-hourness/<行>}`）；表格版卡片字段已在引擎（`e22282f`），本稿不再生成卡片。M3 第 1、2 步在 main（`7aa8fe5`、`bf4d127`），其余按 `.agents/tasks/m3/design-addendum.md` 0.3 实施中（`src/design/`、`src/guard/git-snapshot.ts`、`src/graph/plain-question.ts` 今天都还不在 main）。同时在写或已写的设计：规则板 `.agents/tasks/rules/design.md` 0.5、M5 `.agents/tasks/m5/design.md` 0.3、接管项目 `.agents/tasks/bootstrap/design.md` 0.2、plain-ui `.agents/tasks/plain-ui/design.md` 0.4；循环板（`schedules`）与指标流水（`metrics`）的设计已派出、还没有成稿，本稿只写 M7 交给它们的东西与没有它们时的退路（§2.5、§3.16）。`.agents/tasks/design-context.md` 读到 2026-10-30 的最后一节。
范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/`、`~/.dsh`，不用桌面版。要记到图上的事写成同目录的 JSON 草稿（§14）。
证据写法：运行时契约以 `reference/dsh-desktop-0.2.1-rc.3/` 为准（`docs/DEVELOPMENT.md` §4）。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，包名省略 `dsh-` 前缀；§4 的契约表另写出文件与符号。〔实读〕读过源码；〔实测〕已有 L3 探针证据；〔推断〕由源码推出、没有运行；〔未核实〕列进 §15。ZCode 基线是 3.17.1（`reference/zcode-3.17.1/zcode.cjs`，`d-zcode-3171`）；本稿只引它的一处事实（GLM 模型 id，§10.3）。
干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。给人看的验收与问题按 `d-plain-questions` 的换词表写（验收说成「怎样算做完」，标定说成「练习题」，门禁说成「合入前的检查」）。

## 0. 摘要

M7 在编排层包 `dsh-hourness` 里加两行，都默认禁用：`glm-hourness/execute`（`src/execute/`：派活、写入范围、计划审批、通信、交回、审查、合入前的检查与主干前进的核对、自动推进与「目标做完了」的检查）与 `glm-hourness/operate`（`src/operate/`：晨报、周报与夜间巡检的内容）。报告的纯函数在 `src/report/`。另改 M3 的几处文字与一条规则（§7 的 M3 一行）。

0.3 与 0.2 不同的地方：

- 自动推进（`d-auto-drive`）：没有 `/drive`。人在对话里同意放行设计，M3 把目标的阶段记为放行；主 Agent 的下一步里 harness 看到它，就替这个会话建一个 DSH goal 并开始自动推进，直到完成、或剩下的事都在等人。重启之后接着推进；人自己暂停或清掉的不替人恢复（§3.9.1）。
- 模型（`d-main-agent-models`）：没有档位映射。主 Agent 每次派活（干活的、审查的、目标整体的审查）都在 `dispatch_task` 里写用哪个模型和一句理由；harness 只核对这个模型在 provider 的目录里，记下选了什么（§3.1.3）。
- git（`d-main-agent-shell`）：合并哪件、先合哪个、冲突怎么解、要不要回退由主 Agent 用 git 做。harness 守一处：主干前进的那一刻，新的主干提交必须由 harness 自己在这个提交上跑过 `norm-merge-gate` 并全部通过，改到 `norm-review-floor` 里那几类的内容必须全审过；认得出的命令在执行前拦下，认不出的在执行后立刻发现、记违规、不给证据（§3.8）。证据（提交号、每条命令与退出码、日志）由 harness 写；模型自报的不算。会丢工作或改写历史的 git 命令先存快照：主 Agent 一侧由 M3 做，子 agent 一侧由 M7 用同一个函数做（§3.2.4）。
- 一个主 Agent（`d-one-main-agent`）：没有运维会话，没有 `/patrol`。晨报、周报、夜间巡检是循环板上的三条默认条目，到点由循环板提醒主 Agent，主 Agent 在同一个对话窗口里做和汇报（§3.11）。
- 审查深浅（`question-38` C）：主 Agent 派活时定全审、轻审或不审（不审要写理由），审查的模型也由它选；改动碰到 `norm-review-floor` 的任一类时 harness 一律按全审处理，主 Agent 绕不过去；周报数降档或不审的活后来返工了几次（§3.7.1、§3.12.3）。
- 问人（`d-chat-not-cards`）：harness 不再出给人的待决与选项卡。要人定的事（审查或检查一再不过、目标整体的审查不过、规矩该升该降、底线清单该加）harness 只把事实和一份四行草稿交给主 Agent，由它在对话里按背景、推荐、疑问、不做四行问人（M3 的 `propose_to_human`），一次至多三件（§3.7.4）。
- 明面上（`d-rules-visible`）：M7 里「碰到某件事或到点就去做」的联动是循环板上的十条默认条目（数据，只能看）；会拦住动作的门列在规则板的代码规则目录里（§2.5）。
- 指标（`metrics`）：M7 的每一个数（派活、模型、计划、提问、交回、审查、检查、主干前进、自动推进的启停、完成检查、报告）由 harness 作为事件写进指标流水；报告从它算（§3.16）。

不变的部分：后台派发（spawn 后端、`delivery: 'caller'`、预留 `childId`、`outputSchema` 交回）、写入范围的五条执行边界规则、计划由主 Agent 批而 harness 在边界核对（`d-plan-approval`）、主 Agent 与 worker 的三条通信路、简报与 pins 过期、补位提醒、经验接缝、审查挡路只认三类与收敛规则、目标的验收审查不建节点、完成门禁与放行凭据、练习题只做回归与对照守门、复盘留痕。

最薄端到端骨架（§10）：许愿 → 访谈（聊天）→ 人同意放行 → harness 开始自动推进 → 主 Agent 选模型派一件活 → 计划审批 → worker 写、提交、交回 → 主 Agent 选模型派审查 → 主 Agent 用 git 做出要合入的提交 → `check_commit` → 主 Agent 快进主干、harness 核对并记证据 → 主 Agent 派目标整体的审查 → 完成检查 → 目标完成。人只在许愿、回答访谈、同意需求与放行时出现，中途不发任何命令。

要人定的（§13）：两件，都是改人批过的清单：给 `norm-review-floor` 的四类各加一段机器认得的写法；给 `norm-merge-gate` 加一条「只改项目图的提交不用跑命令」。M7 十件活的「怎样算做完」由人按 `question-37` A 逐条看（§1.2，一页放行稿里另有人话版）。

## 1. 需求与验收

### 1.1 必须遵守的定案（方向清单）

`d-design-onepage`：每个模块的设计对照人定过的方向，违背即挡路。下表是本稿用到的全部方向。

| 定案 | 人的原话或出处 | 本稿怎样遵守 | 在哪 |
| --- | --- | --- | --- |
| `d-auto-drive` | 「自动推进不应该是经过设计循环之后，就全部让主Agent自己推进了吗，怎么需要我/drive」 | 没有 `/drive` 与任何要人发的 M7 命令；放行被 harness 看到就建 goal 开始推进；推进中的停下（都在等人、空转、轮次上限）由人在对话里一句话接着走，或由人的回话自动解开 | §3.9.1、§3.9.5 |
| `d-main-agent-models` | 「还有所有的模型选择交给主Agent吧，包括审计什么的」 | `dispatch_task` 的 `model` 与 `why` 必填，worker、审查、目标整体的审查都一样；harness 只核对目录与记录，没有默认模型、档位与「高一档」；主 Agent 自己的模型仍由人选，提醒在 M3 | §3.1.3、§3.7.1、§3.9.4 |
| `d-main-agent-shell` 与它的快照细则 | 「主Agent只是不能动文件，但是可以任意操作git，或者说git交由主Agent是最好的。」「按你上面推荐的来」 | 主 Agent 的 git 不受 M7 限制，只在主干前进时核对（§3.8.4）；没有 `merge_task`，harness 不替它合并、推送或删分支；子 agent 的危险 git 命令先存快照（§3.2.4），主 Agent 的由 M3 | §3.2.4、§3.8 |
| `d-one-main-agent` | 「巡检应该由harness提醒主Agent发出。一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」 | 没有运维会话与 `/patrol`；所有提醒只发给 M3 持有者记录里的那一个会话；报告由主 Agent 在同一窗口里给人 | §2.3.1、§3.11 |
| `d-chat-not-cards` | 「我是要改产品的，而且聊天不仅是不给问答卡，是连选项都没有的那种……你提几点和方案，我补充或者同意这种。」 | harness 不写给人的待决、不出选项；要人定的事交给主 Agent 用四行在对话里问，人回话由 M3 的 `record_human_answer` 带原话记图 | §3.7.4、§3.12、§13 |
| 四行的写法（`d-chat-not-cards` 2026-10-30 的批注） | 「背景一行，推荐一行，疑问一行，不做一行」；「每一个背景推荐那些总结几个字加粗」 | harness 给主 Agent 的草稿按四行写，排版由 M3 的 `renderProposal` 做；本稿 §13 同样 | §3.7.4、§13 |
| `d-design-onepage` | 两层循环；每个模块的设计对照方向清单，人看一页放行稿再开发；问题攒着成批问，一次至多三题 | 本表；人放行之前不开工；harness 交给主 Agent 的问人事项不打断，攒进下一批，一次至多三件 | §1.1、§3.7.4 |
| `d-defaults-readonly` | 「默认的东西先暂时不能修改、开关，只能看」 | M7 带来的十条循环板默认条目与规则板上的代码规则都只读；没有配置项能关掉它们 | §2.5、§3.11.1 |
| `d-rules-visible` | 「没问题，项目所有规则确实应该都在明面上」 | 会拦住动作的门列在规则板，碰到事或到点就做的列在循环板；两张清单的内容仍在规范节点里 | §2.5 |
| `question-38` C 与 `norm-review-floor` | 「C」；「没问题，我暂时也想不到什么加审不审的」 | 审查深浅由主 Agent 派活时定并写理由；碰到底线清单任一类时 harness 按全审处理，并在主干前进时核对这些内容确实全审过；周报数降档后的返工并提议加类 | §3.7.1、§3.8.4、§3.12.3 |
| `norm-merge-gate` | 人批准（「B」） | 合入前的检查只认这份清单的命令，由 harness 在要进主干的那个提交上跑；改松清单要人同意 | §3.8.1–§3.8.3 |
| `metrics` | 「指标能全记就全记下，b直接做」 | 每个数由 harness 写进指标流水；模型写的数不算；报告从流水算 | §3.16 |
| `d-plain-questions` | 不用人没学过的词 | §1.2、§13 与 harness 交给主 Agent的草稿都用人话；草稿过 M3 的 `plainWordsIn` | §1.2、§3.7.4 |
| `d-plan-approval` | 「先批计划，再开工要做也是让主Agent做吧」 | 计划由主 Agent 批，harness 在边界核对；人不出场 | §3.3 |
| `question-26` C | 「C 就删个写工具，把主Agent变成聊天模型就行了呗」 | 主 Agent 没有写文件的工具（M3）；git 不算写文件 | §2.3 |
| `d-rules-human-only` | 「先不允许自己加规则吧，只有人能动」 | M7 不写规则与规范；规矩的升降与底线清单的增删都经主 Agent 问人 | §3.12 |
| `question-28` C | 「你在没有副作用的情况下尽可能开更多的并行」 | 写任务的并行上限是 `slots`（默认 3），写入范围相交的排队；同文件的实施步骤串行（§8.3） | §3.5.1、§8.3 |
| `question-14` G3 | 「围栏到时候跟着编排层走吧，拦全部的」 | M7 的规则不看路由 | §3.2 |
| `question-17` B | 「分，彻底改成两个插件」 | M7 的代码全在 `dsh-hourness`；GLM 包只经公共库的工具名契约知道哪些 M7 工具常驻 | §2.3.2 |
| `d-peak-mode` | 「默认少做……减少并发数量，不做重活之类的」 | 高峰档位的设置与执行归规则板；M7 不另加高峰逻辑，派活工具名进 `DISPATCH_TOOL_NAMES` 让规则板的门管得到；主干全量检查与练习题按重活由循环板与规则板排 | §3.5.1、§3.11.1 |
| 不替人在模型、套餐、渠道上做主（`hourness` 非目标，`docs/CHARTER.md` §6） | — | 子 agent 的模型由主 Agent 选是人的决定（`d-main-agent-models`）；harness 不改人给主 Agent 选的模型，不切换 provider 或套餐 | §3.1.3 |
| `d-failure-plans` | 「怕的不是失败，而是失败后的预案做的够不够」 | §6 按操作写发现、重试、恢复与留痕；绕过检查的主干前进在命令之后立刻发现；必须改的条数不降就停下交人 | §3.7.3、§3.8.4、§6 |
| `question-37` A | 「A」 | §1.2 的「怎样算做完」是草稿，人逐条看过、带原话改写节点之后才开工 | §1.2、§14 |
| 练习题的角色（2026-10-29） | 「我认为真正的标定应该是……在真实的项目开发中进行测试，或者等待社区的反馈。」 | 练习题只做回归与对照守门；有效性看自举与试用 | §3.14 |
| 经验板块（`lessons`） | 「还得允许子代理主动查经验板块的内容」 | 查询工具常驻；派活时带至多 5 条；交回带候选，按 M5 的三路处理 | §3.5.5 |

### 1.2 各条目的行为与「怎样算做完」（草稿，人按 `question-37` A 逐条看）

下表第三列写给人看，按换词表用人话；节点上现有的验收是 0.2 的草稿，人看过、改过之后由编排者带人的原话改写（§14）。第四列写给实现者：每条挂在哪个检查上。

| 节点 | 内容 | 怎样算做完（人话） | 对应的检查与层 |
| --- | --- | --- | --- |
| m7-1 | 派活、只写自己那块、先批计划、主 Agent 与干活的子 agent 说话 | 1. 主 Agent 派一件已批准、写清了怎样算做完的活时，自己写用哪个模型和一句理由；harness 给这件活开一个单独的工作目录和分支，在后台起一个子 agent 去做，记下模型与理由，主 Agent 不用等它就能接着做别的。2. 干活的子 agent 只能写自己工作目录里、这件活划定的范围里、批过的计划写到的文件；写别处被拦下，拦下时告诉它该怎么做，并记一笔。要先交计划的活，计划批下来之前一个文件都写不了。3. 主 Agent 用普通办法叫出来的子 agent、干活的子 agent 再叫出来的子 agent，都只能读；干活的子 agent 不能改项目图（只能批注），不能推送，不能动别的分支；它做会丢掉没提交改动的 git 操作之前，harness 先存一份能恢复的快照。4. 不合格的计划（缺每一步怎样算做完、写到范围外、漏了某条要求）当场退回给子 agent，不打扰主 Agent；合格的写进这件活的说明，主 Agent 批了它才能动手，图上留一条批准记录。5. 子 agent 有问题可以问主 Agent，回答回到它手里；主 Agent 可以中途给它发话改方向或叫停；两个子 agent 之间不能直接说话 | 1：L3 `glm-exec-dispatch`；2、3：L2 `execute-guard.spec.ts`、L3 `glm-exec-dispatch`；4、5：L3 `glm-exec-plan`；L4 随批次 |
| m7-2 | 派活前的检查、空位提醒、经验 | 1. 这件活缺了怎样算做完、前面的活没做完、还有等人回话的事、目标还没放行、和正在做的另一件活要写同一批文件、或同时在做的活已满时，派不出去，并告诉主 Agent 差什么。2. 交给子 agent 的说明由 harness 从项目图写出：为什么做、做到什么程度算完、不许碰什么。派出去之后，这件活或它上级的「怎样算做完」「不做什么」改了、或它依据的决定被推翻，这次做出来的东西不能进主干，要重新派；只改标题不算。3. 有空位又有能开工的活时，主 Agent 下一步收到一次提醒；情况不变不重复。4. 经验板块在的时候，说明里带至多 5 条相关经验；子 agent 交回的新经验交给经验板块，像密钥的内容不写进项目图 | 1、2：L2 `execute-brief.spec.ts`、L3 `glm-exec-dispatch`；3：L3 `glm-exec-parallel`；4：L2 `execute-handback.spec.ts` |
| m7-3 | 自动推进与「目标做完了」的检查 | 1. 人在对话里同意放行设计之后，不用再发任何命令，主 Agent 就自己推进：派活、审查、合入，直到目标做完或剩下的事都要问人。电脑或 DeepSeek Harness 重启之后接着推进；人自己按了暂停或清掉的，不替人恢复。2. 主 Agent 说目标做完了时，harness 先核对：每件活都进了主干并有 harness 记的证据、没有等人回话的事、目标整体的审查过了；不满足就不让它收尾，并列出差什么；满足才在图上把目标记为完成，证据由 harness 写。3. 剩下的事都在等人时，主 Agent 在对话里把它们问给人（一次至多三件），自动推进停下；人回话、主 Agent 记下之后，自动推进自己接着走。4. 连着 3 轮什么都没变时自动推进停下，记一条复盘，主 Agent 在对话里说明；人说继续就接着走。5. 重启之后，没交回的活在主 Agent 下一步的提醒里列出来，不会重复派 | 1：L3 `glm-exec-drive`、L4；2–5：L2 `execute-drive.spec.ts`、`execute-reconcile.spec.ts`，L3 `glm-exec-drive` |
| m7-4 | 审查 | 1. 主 Agent 派活时给这件活定审查深浅：全审、轻审或不审，轻审和不审要写理由；审查用哪个模型也由主 Agent 选并写理由。2. 改动碰到「必须全审的改动」清单里任一类时，不管主 Agent 定了什么，都按全审做；全审要逐条对照这件活的「怎样算做完」看过。3. 审查只在三种情况下挡路：没做到要求的某一条；可能造成收不回的损失却没防住；出了错没法发现、没法恢复或事后查不清。其余意见不挡路。4. 第 1、2 轮没过就再修再审，第 2 轮没过加一轮；挡路的条数一轮没少、或第 3 轮还没过，就停下：这件活不再派，主 Agent 在对话里把它问给人，人回话之后才继续 | 1、2：L2 `execute-review.spec.ts`、`execute-floor.spec.ts`；3、4：L2，L3 `glm-exec-review` |
| m7-5 | 主 Agent 合入，harness 核对与记证据 | 1. 合并哪件、先合哪个、冲突怎么解、要不要回退，都由主 Agent 用 git 自己做，harness 不替它做。2. 主干前进的那一刻，harness 核对新的主干提交确实由 harness 跑过「合入前要跑的检查清单」并全部通过，「必须全审的改动」那几类的内容确实全审过；不满足就拦下。检查由 harness 自己跑、结果由 harness 记；主 Agent 或子 agent 自己报的结果不算。3. 主干前进之后，harness 把提交号和每条检查的结果记到对应的活上，并把活记为完成。4. 用 harness 认不出的办法让主干前进了（例如写在脚本里），harness 在那条命令之后马上发现：记一笔违规，告诉主 Agent，这次不给证据，直到它退回去按检查重新合 | 2：L2 `execute-advance.spec.ts`（临时 git 仓库）、L3 `glm-exec-merge`；3、4：L2、L3；L4 |
| m7-6 | 晨报 | 1. 每天早上到点，主 Agent 在对话里给人一份晨报：目标、规划、理由、架构四段，加在等你回话的事、花了多少、检查与审查、出了什么例外、各用了哪些模型。2. 晨报里的每个数都由 harness 从指标流水、项目图与 git 算出，模型不写数；同样的输入得到一字不差的晨报。3. 晨报是循环板上的一条默认条目，人能看见，暂时不能改、不能停 | 1、2：L2 `report-four-answers.spec.ts`；3：L2 `operate-entries.spec.ts`；冷会话投递随 L4 |
| m7-7 | 夜间巡检 | 1. 每天夜里到点，主 Agent 做一次巡检：harness 先查工作目录、分支、主干与项目图的卫生，并对主干跑一遍完整的检查；能做的主 Agent 去做或派出去，要人定的攒进下一批问人。2. 漏跑的一次在下一次巡检时报出来。3. 巡检是循环板上的一条默认条目，只能看 | L2 `operate-patrol.spec.ts`（临时 git 仓库）、L3 `glm-operate-patrol`；冷会话投递随 L4 |
| m7-8 | 规矩的升降与周报 | 1. 每周到点，主 Agent 在对话里给人一份周报：人被问了几次、要读多少字、回话等了多久、因人的决定返工了几次，对照一次通过的比例、审查发现与返工率，以及交付的四个数。2. 周报数出降档审查或不审的活后来返工了几次、集中在哪类改动；哪类返工多，就提议把它加进「必须全审的改动」，人同意才改。3. 规矩该升该降按固定的数提议，连同上一条每周至多 3 件，由主 Agent 在对话里问人。4. 周报是循环板上的一条默认条目，只能看 | L2 `report-weekly.spec.ts`、`report-ladder.spec.ts` |
| m7-9 | 交付的四个数 | 每周合入几次、一件活从派出到进主干要多久、进主干后出问题的比例、主干变坏到修好要多久，按固定口径从 harness 记的证据与项目图算出，写进指标流水 | L2 `report-metrics.spec.ts` |
| m7-10 | 练习题只查有没有改坏 | 1. 练习题运行时，被测的模型读本次练习目录以外的文件被拦下并记一笔；有越界读取的那一次判作无效，不算进汇总。2. 每道题写明是回归题（应该一直做对的）还是能力题（现在还做不好的）、从哪来；结果记下当时的环境，环境本身出的错单列；汇总报一次做对的比例和连做 k 次都对的比例。3. 现有两题归回归题；文档写明练习题的作用是查改动有没有把系统改坏，不证明系统好用。4. 自举中记下的复盘可以收成新的练习题，有一条收题流程 | L2 `calibrate-fence.spec.ts`、L3 `calib-fence`；运行目录在仓库外与事后扫描属于 `ablation` |
| m7（特性） | 合起来 | 1. 最小的一条完整链路在 DeepSeek Harness 桌面版上，对一个临时项目，从人许愿、聊需求、同意放行，到主 Agent 自己派活、审查、合入、目标完成，人中途不用发任何命令。2. 之后本项目的开发改由它在 DSH 里做（自举），卡住、返工、要人救场的地方记成节点。3. 链路上的每个数（模型、花费、用时、被拦次数、派活、审查、合入、问人）都由 harness 写进指标流水 | §10.3 的四条；L4 |

### 1.3 非功能需求

- 少打扰人：M7 不新增必须问人的类别。要人定的事只有四种来源（审查或检查一再不过、目标整体的审查不过、规矩的升降、底线清单的增删），都经主 Agent 攒成批，一次至多三件（§3.7.4、§3.12）。
- 主 Agent 的上下文小：交回只给摘要与证据位置，长报告写文件；harness 的提醒只在变化时注入；循环板条目的提醒每个事件一次。
- 失败要出声（`docs/CHARTER.md` §7.1 条款 7）：两行的降级都进行健康表；激活期不抛错（`AGENTS.md`）。
- 处处留痕（条款 11）：每个改变状态的动作在它所属的地方有一条记录（§5）；每个数在指标流水里（§3.16）。
- 明面上：M7 的联动与门在两块板之一上看得到（§2.5）。

## 2. 总体设计

依据的学科与标准（`docs/DEVELOPMENT.md` §1.1、`docs/ORCHESTRATION.md` §4.3 架构栏），评审按这里去审：

- 门禁、重试与恢复依据可靠性工程与持续集成的主干开发：主干只前进到检查过的提交，主干保持绿（合入后与夜间的全量检查兜底），失败先求可发现、可重试、可追溯（`d-failure-plans`）。
- 版本控制的做法：检查绑定到提交（同一个提交、同一份清单），而不是绑定到「谁说跑过」；任务与提交的对应写在提交信息的尾注里（git trailer），由 git 自己保存。
- 写入范围、只读的派发链、worker 对图只读、worker 只碰自己的分支依据安全工程的最小权限：每个角色只拿完成本任务所需的写权限，在执行边界判定，不靠提示词。主 Agent 的 git 权限按人的决定放开，补救靠快照与主干前进的核对（预防加发现）。
- 指标依据可观测性的事件流水做法：一份只追加的事件流水，数由测量的一方写，报告是它的纯函数；DORA 四项用标准口径，人的负担只量系统里看得到的数；样本小，只看曲线，不设考核线（`docs/CHARTER.md` §8）。
- 问人依据认知负荷与人因：一次一个方案、四行、至多三件（`d-chat-not-cards` 的批注里人给的理由：比较几条选项「看起来好累」）。

### 2.1 构件与位置

全部在编排层包 `dsh-hourness`（`packages/hourness/`）。`scripts/packages.mjs` 的 `hourness.src` 加 `execute`（E0）与 `operate`（P3），`rows` 加两行；`packages/hourness/cordis.patch.yml` 加 `{id: glm-hourness/execute, name: dsh-hourness/execute, disabled: true}` 与 `{id: glm-hourness/operate, name: dsh-hourness/operate, disabled: true}`，排在 `design`（M3）与 `rules`（规则板，若已合入）之后、`ui` 之前。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 执行行入口：主 Agent 的四个工具（`dispatch_task`、`answer_worker`、`check_commit`、`await_human`）、worker 的两个工具（`submit_plan`、`ask_main`）、检查的 provider `hourness-gate`、服务 `glmHournessExecute`、行健康 `execute` | `src/execute/index.ts` | 新建，行 `glm-hourness/execute` |
| 派发：读简报门禁、工作树、`startActivation`、登记表的写入 | `src/execute/dispatch.ts` | 新建 |
| 模型的选择：参数校验、读 provider 的模型目录、`agentOptions`、记录（§3.1.3） | `src/execute/models.ts` | 新建 |
| 任务映射：`childId` 的编解码、本进程的派发登记表 | `src/execute/attempts.ts` | 新建 |
| 工具面：按角色去掉不属于它的工具（含非主 Agent 的图写工具，§2.3.2） | `src/execute/faces.ts` | 新建 |
| 简报的渲染与门禁判定（纯函数） | `src/execute/brief.ts` | 新建 |
| 计划：`checkPlan`、正文里计划一节的渲染与摘要（纯函数） | `src/execute/plan.ts` | 新建 |
| 写入范围：路径规整、包含、相交（纯函数） | `src/execute/scope.ts` | 新建 |
| 等主 Agent 回应的 worker 请求：登记、超时、回应 | `src/execute/requests.ts` | 新建 |
| 交回结构与审查结论的 schema、语义校验 | `src/execute/schemas.ts` | 新建 |
| 交回处理：pins 核对、图上的记录、审查任务与有效深浅、候选经验 | `src/execute/handback.ts` | 新建 |
| 审查结论的规整与收敛判定（纯函数） | `src/execute/review.ts` | 新建 |
| 底线清单：解析 `norm-review-floor` 的判定写法、对改动与命令判命中（纯函数） | `src/execute/floor.ts` | 新建 |
| 要人定的事：交给主 Agent 的事实与四行草稿（纯函数，§3.7.4） | `src/execute/asks.ts` | 新建 |
| git 操作（可注入的执行器，`child_process.execFile`，不经 shell） | `src/execute/git.ts` | 新建 |
| 门禁锁：检查与主干全量检查共用（§3.8.3） | `src/execute/gate-lock.ts`（用 `src/data/lock.ts`） | 新建 |
| `norm-merge-gate` 的解析（纯函数，导出 `GATE_LINE_FORMS`） | `src/execute/gate-norm.ts` | 新建 |
| `check_commit` 的执行、检查记录、外部 provider | `src/execute/check.ts`、`src/execute/gate-provider.ts` | 新建 |
| 主干前进的核对：执行前判定、执行后比对、证据与完成（§3.8.4） | `src/execute/advance.ts` | 新建 |
| 自动推进：开始与恢复、完成门禁、`await_human`、空转、重启对账 | `src/execute/drive.ts` | 新建 |
| 派发状态提醒（补位、过期、等回应、丢失、模型目录） | `src/execute/notice.ts` | 新建，用公共库 `installStepNotice` 与 M3 的 `src/graph/digest-notice.ts` |
| 循环板的默认条目（数据）、M7 发出的事件、没有循环板时的执行者 | `src/execute/entries.ts` | 新建 |
| 指标事件的出口 `emitMetric` | `src/execute/metrics.ts` | 新建（出口可注入，指标流水的接口到位之前什么都不做） |
| 复盘节点的生成 | `src/execute/retro.ts` | 新建（P5） |
| 语义摘要 pins（纯函数，宿主与客户端都能导入） | `src/graph/pins.ts` | 新建 |
| 推出的执行阶段 `derivedStage`、完成门禁 `goalCompletion`（纯函数，只导入 `src/graph/stage.ts` 的 `effectiveStage`） | `src/graph/execute-stage.ts` | 新建 |
| worker 的五条执行边界规则 | `src/guard/execute-rules.ts`；M3 的 `src/guard/main-agent.ts` 的 `design-before-release` 放行一行改为询问执行服务 | 新建、改 |
| git 调用的解析：M3 的 `src/guard/git-snapshot.ts` 导出 `gitInvocations(text, dialect, base)`（M3 内部已有的读法，行为不变）与 `takeSnapshot` | `src/guard/git-snapshot.ts`（M3） | 改：只加导出 |
| M3 的文字：身份节边界一句、`main-agent-no-write` 的正路、`release` 与三个推出阶段的提醒、没有 `norm-merge-gate` 时的一句（§7 的 M3 一行） | `src/design/identity.ts`、`src/guard/main-agent.ts`、`src/design/stage-notice.ts`（M3） | 改 |
| 运维行入口：`hourness_report`、三条时间条目（数据） | `src/operate/index.ts`、`src/operate/entries.ts` | 新建，行 `glm-hourness/operate` |
| 巡检 | `src/operate/patrol.ts` | 新建 |
| 四答晨报、周报、人的负担与 DORA、规矩阶梯、底线清单的增类提议（纯函数） | `src/report/four-answers.ts`、`weekly.ts`、`metrics.ts`、`ladder.ts`、`floor-proposals.ts` | 新建（P2） |
| 晨报的读入 | `src/workflow/morning-report.ts` | 改：改为调四答 |
| 派遣记录的工具名 | `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 加 `dispatch_task` | 改 |
| 工具名契约 | `src/shared/tool-names.ts`：加 `EXECUTE_TOOL_NAMES`、`WORKER_TOOL_NAMES`、`OPERATE_TOOL_NAMES`，常驻名单加它们与 `structured_output`；规则板的 `DISPATCH_TOOL_NAMES` 加 `dispatch_task`；`LESSONS_TOOL_NAMES` 由 M5 加 | 改 |
| 薄适配层：`SubagentsService`、`SubagentProvider`、`GoalsService`、`LlmCatalog`（`listModels`、`resolveModelInfo`）、`SessionQueryService` 的所用成员 | `src/shared/dsh-min.ts` | 改 |
| 行健康表 | `src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `execute`、`operate` | 改 |
| 规则板的代码规则目录登记 M7 的门（§2.5） | `src/rules/builtin.ts`（规则板） | 改（规则板合入之后） |
| 练习题：读圈禁、`task.json` 与 `result.json` 的新字段、pass^k（运行目录、事后扫描与对照开关归 `ablation`） | `scripts/calibrate/read-fence.mjs`、`scripts/calibrate/run-calibrate.mjs`、`tests/calibration/*/task.json`、`tests/calibration/lib.mjs` | 新建、改（P4） |
| 探针在工作树里自动用临时 profile（本仓库专用） | `scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs` | 改（H1） |

不加的东西：图节点的新字段；图引擎的权限改动；新依赖；斜杠命令（0.2 的 `/drive`、`/patrol` 删去）；`merge_task`（主 Agent 自己合）；harness 生成的给人的待决（`questions.ts` 删去）。配置项只有执行行的 `slots`（并行写任务上限，默认 3）。

运行时文件放在仓库的公共 git 目录下（`git rev-parse --git-common-dir`，下称 `<git>`）的 `hourness/` 里：跟着仓库走、不入库、各工作树共用，与 M3 的快照流水同一处（M3 附录 §2.5）。不放在数据服务的 `projectHome`：桌面版上它是一个对所有工作区共用的配置值（M3 附录 §2.4），放在那里会让不同项目的门禁记录混在一起。

### 2.2 一次任务的路径

1. 放行：人在对话里同意，M3 的 `record_human_answer` 带人的原话把目标的 `stage` 改为 `release`（M3 附录 §3.5）。
2. 主 Agent 的下一步：执行行的 `agent/pre-step` 监听器看到焦点目标已放行、这次放行还没开始推进，发出事件 `hourness.design-released`；循环板的默认条目「设计放行之后」执行：harness `goals.create` 一个 goal、在图上的目标批注「自动推进已开始」，提醒主 Agent 分解与派活（§3.9.1）。
3. 主 Agent 在已批准的特性与任务下把规划细化成可派发的叶子，`dispatch_task {id: task-3, model: 'glm-5.3-flash', why: '…', review: {depth: 'light', why: '…'}}`。
4. 简报门禁通过；harness 建工作树、跑准备命令、生成简报、起 worker；派发批注记下模型、理由与审查深浅，任务转为进行中，指标流水记一条派活。
5. worker `submit_plan`；`checkPlan` 通过；主 Agent `answer_worker approve`；worker 开始写。
6. worker 提交到 `hz/task-3`，跑一遍检查命令，`structured_output` 交回 `done`。
7. 交回处理：核 pins；按改动与 worker 跑过的命令判底线清单；算出有效深浅（命中就是全审）；深浅不是「不审」时在 `task-3` 下建审查任务。事件 `hourness.handback` → 条目「一件活交回之后」提醒主 Agent 派审查（写模型与理由），或在不审时直接去合入。
8. 主 Agent `dispatch_task {id: <审查任务>, model, why}`；审查者交回结论；规整与收敛；通过 → 事件 `hourness.review-passed` → 条目提醒主 Agent 合入。
9. 主 Agent 用 git 做出要进主干的提交（例：在 `task-3` 的工作树里 `git rebase main`，压成一个提交，提交信息带 `Hourness-Task: task-3`），然后 `check_commit {commit}`：harness 在门禁工作树里把这个提交检出，跑 `norm-merge-gate` 里适用的命令，写检查记录（§3.8.3）。
10. 主 Agent 在主检出里 `git merge --ff-only <提交>`：harness 在执行前核对（这个提交检查通过、底线清单的内容全审过），放行；执行后看到主干确实前进到它，给 `task-3` 写证据（提交号、每条命令与退出码、日志）、标完成，删掉干净的工作树。事件 `hourness.trunk-advanced` → 条目「合进主干之后」在主干上跑一遍完整的检查。主 Agent 按规范推送。
11. 目标下的活都关了 → 条目提醒主 Agent 派目标整体的审查：`dispatch_task {id: <目标>, model, why}`，结论批注在目标上。
12. 主 Agent `update_goal complete`：完成门禁核对（§3.9.3），放行；图上的目标以 harness 的证据标完成。

### 2.3 角色与工具面

#### 2.3.1 谁是谁

| 角色 | 判定 | 能写什么 |
| --- | --- | --- |
| 主 Agent | M3 的 `isMainAgent`：不是委派子会话，投影为真，且是这个项目持有者记录里的会话（M3 附录 §2.4）。一个项目只有一个 | 只经图工具写图；没有写文件的工具（M3）；git 任意，主干只能前进到检查过的提交（§3.8.4） |
| worker | 本进程的派发登记表里、映射到写任务、仍活着的激活（§3.1.4） | 自己工作树里、写入范围与已批计划之内的文件；工作树下 `.hourness/` 里的报告；自己分支上的提交；对图只能批注 |
| 审查者 | 登记表里映射到审查任务的激活，或目标整体的审查激活（§3.9.4） | 只能写 `.hourness/` 里的报告；对图只能批注 |
| 只读子 agent | 派发链的根是主 Agent、自己不在登记表里（原生 `subagent` 派出的、worker 再派出的、冷恢复出来的） | 放行之后也不能写文件（§3.2.2） |

0.2 的「运维会话的 agent」一行删去（`d-one-main-agent`）。

#### 2.3.2 工具与常驻

| 工具 | 注册方 | 谁的工具面里有 | GLM 路由上 | 理由 |
| --- | --- | --- | --- | --- |
| `dispatch_task`、`answer_worker`、`check_commit`、`await_human` | 执行行 | 只有主 Agent | 常驻 | 主 Agent 推进时每拍都可能用 |
| `hourness_report` | 运维行 | 只有主 Agent | 常驻 | 每条时间条目的提醒都用它 |
| `submit_plan`、`ask_main` | 执行行 | worker（审查者只有 `ask_main`） | 常驻 | worker 的关键路径 |
| `structured_output` | DSH（subagent:889–960） | 带 `outputSchema` 的子 agent | 常驻 | 交回是 worker 的终点 |
| `lessons_query`（M5 的 `LESSONS_TOOL_NAMES` 里只有它常驻） | M5 的经验行 | 所有 agent | 常驻 | 人要求子 agent 能主动查（M5 §8.1 第 4 条） |
| `send_message`、`interrupt_agent` | DSH（tool-subagent-control:23–86） | 原样 | 照旧延迟 | 用得少 |
| `subagent`、`subagent_fork` | DSH | 原样 | 照旧 | 主 Agent 可以派只读的探索，写入被拒（§3.2.2） |
| 图的写工具 `graph_propose`、`graph_status`、`graph_edit`、`graph_link`、`graph_unlink`、`graph_verify`、`graph_decide`、`graph_approve`、`graph_reject` | 图行 | 主 Agent 与普通会话；主 Agent 派发链里的子 agent 没有（0.2 评审 F19，`question-31` C） | 照旧 | 子 agent 对图只读与批注（§3.2.3）；少九个工具的 schema；`worker-graph-readonly` 仍是兜底 |

工具面过滤（`src/execute/faces.ts`）：执行行在 `agent/created` 时给每个 agent 装一个 agent 作用域、不带 `prepend` 的 `system-prompt/assemble` 监听器（同 M3 附录 §2.1 `roleFace` 的做法：不带 `prepend` 的监听器在方言与工具检索的 `prepend` 监听器里层，它们看到的已是过滤之后的工具），`next()` 之后按角色从 `assembled.tools` 去掉：不是主 Agent 的去掉 `EXECUTE_TOOL_NAMES` 与 `OPERATE_TOOL_NAMES`；不是 worker 或审查者的去掉 `WORKER_TOOL_NAMES`；审查者再去掉 `submit_plan`；派发链的根是主 Agent 的子 agent（worker、审查者、只读子 agent）去掉上表的九个图写工具，留 `graph_show`、`graph_open`、`graph_focus`、`graph_comment`。工具仍在全局注册，按名直接调用照样执行（`docs/DESIGN.md` §2.4a），所以每个工具体先查调用方角色，图写工具由 `worker-graph-readonly` 兜底。会话在执行行激活之前已开着时，监听器在主 Agent 的第一次 `agent/pre-step` 补装。

常驻名单：GLM 包的工具检索只读公共库 `src/shared/tool-names.ts` 的 `ORCHESTRATION_RESIDENT_TOOLS`（split §2.6）。常驻只表示「在工具面里时不延迟」，谁的工具面里有由上面的过滤决定。

### 2.4 执行阶段：推出，不存

M3 让阶段存在目标的 `stage` 字段，`release` 之后的阶段留给 M7。已批准的目标 LLM 与 harness 都改不了（M3 §2.4，D5 只放开仍为提议的目标），所以 M7 不写阶段，按图推出：

`derivedStage(graph, goal)`（`src/graph/execute-stage.ts`，纯函数，导入 `src/graph/stage.ts` 的 `effectiveStage`，main `7aa8fe5` 起已在）：M3 的 `effectiveStage(goal)` 为 `release` 或其后的值（含人手写的 `decompose`、`execute`、`merge`、`operate`）时：

| 条件（按顺序取第一条成立的） | 推出的阶段 |
| --- | --- |
| 目标为 `done` | `operate` |
| 子树里有进行中或可以开工的任务（可以开工的定义同 `openItems`） | `execute` |
| 子树里的任务都关了或都在等审查与门禁 | `merge` |
| 子树里没有任务，或任务都缺派发属性 | `decompose` |

`effectiveStage` 为 `null`（已批准、没有阶段）的目标不走设计循环，推出的阶段同样按上表算（它可以直接执行）。流程条与阶段提醒用推出的阶段；M3 的设计期只读对 `release` 及以后放行这一行，由 §3.2.2 的规则取代。

### 2.5 写在代码里的与放在两块板上的（`d-rules-visible`、`d-defaults-readonly`）

人在 2026-10-30 同意了这个分法：代码只留机制（板子与项目图本身怎样运作、谁能拍板、完成要证据）与安全底线（主 Agent 没有写文件的工具、危险 git 命令前先存快照、主干前进时核对检查、指标由 harness 记）；碰到某件事或到点就去做的，是循环板上的条目；会拦住动作的门，在规则板上列出。M7 的东西按这个分：

| 类 | M7 里有什么 | 人在哪里看到 | 能不能改 |
| --- | --- | --- | --- |
| 门（拦住一个动作） | `execute:worker-scope`、`execute:dispatch-chain-readonly`、`execute:worker-graph-readonly`、`execute:worker-git`、`execute:worker-message-live-only`（§3.2）；`execute:trunk-advance-checked`（主干前进的核对，§3.8.4）；`execute:completion-gate`（§3.9.3）；`execute:stopped`（停下之后不再派，§3.7.3） | 规则板的「代码里的规则」一节（规则板设计 §10.1：只读目录，id 写成 `<行>:<规则 id>`，显示所在行的激活状态）。门读的两张清单 `norm-merge-gate`、`norm-review-floor` 是图上的规范节点，规则板显示它们的条目 | 代码里的门不能改；两张清单只有人能改（验收条件只有人的权限能写） |
| 联动（碰到事或到点就做） | 十条循环板默认条目（§3.11.1）：设计放行之后开始推进、一件活交回之后、审查过了之后、停下之后、目标下的活都关了之后、合进主干之后、重启之后、晨报、周报、夜间巡检 | 循环板，每条写明来自 `dsh-hourness` 的哪一行 | 只能看（`d-defaults-readonly`）；人可以另加自己的条目 |
| 机制 | 派发、简报与 pins、计划核对、请求与回答、交回解析、审查规整与轮数、检查的执行与记录、证据的写入、登记表、指标事件 | 不在板上；行为写在本稿，出错进行健康 | — |

条目是数据：`src/execute/entries.ts` 与 `src/operate/entries.ts` 各导出一张常量表，每条 `{id, title, source, trigger, action}`，循环板显示与执行的是这张表，没有循环板时 M7 自己按同一张表执行（下文）。条目的动作只有两种：给主 Agent 的一段提醒（英文，固定文字，带事件的事实），或 M7 提供的 harness 动作（按 id 调 `glmHournessExecute.runAction(id, event)`，例如开始推进、主干全量检查、重启对账），二者可以同时有，先做 harness 动作、再送提醒。

M7 发出的事件（名字与载荷是 M7 给循环板事件表的条目）：

| 事件 | 何时 | 载荷（另有 `{at, project, session}`，`session` 是持有者会话） |
| --- | --- | --- |
| `hourness.design-released` | 主 Agent 的一步里看到焦点目标放行、这次放行还没开始推进（§3.9.1） | `goal`、`release`（放行那条历史的 `at`） |
| `hourness.handback` | `done` 的交回处理完、有效深浅不是不审（§3.6.2） | `task`、`attempt`、`status`、`depth`（有效深浅）、`reviewTask?` |
| `hourness.review-passed`、`hourness.review-skipped` | 审查通过；或有效深浅为不审 | `task`、`round?` |
| `hourness.stopped` | 审查、检查或目标整体的审查停下（§3.7.3） | `node`、`kind: 'review' \| 'check' \| 'acceptance'`、`rounds` |
| `hourness.tasks-closed` | 一个目标下的任务都关了 | `goal` |
| `hourness.trunk-advanced` | 主干前进且核对通过（§3.8.4） | `from`、`to`、`tasks` |
| `hourness.host-started` | 主 Agent 会话在这个进程里第一次走步或被创建 | — |

与循环板的接口（循环板设计还没成稿，下面是 M7 需要的最少的东西，名字以那份设计为准，只改 `entries.ts` 一处）：服务 `glmHournessLoops`，成员 `contribute(source, entries)`（激活时交出默认条目，循环板标为只读）与 `emit(event)`（交出事件）。循环板负责：显示；按触发执行；把提醒送进持有者会话（M3 的 `mainAgentOf`，来源不是 `user`）；高峰停着时推迟（规则板的 `heldForPeak`，规则板设计 §10.7）；每次执行写进指标流水与它自己的执行记录。

没有循环板时（服务不在）：时间条目不跑（晨报、周报、巡检不会到点出现，人可以在对话里让主 Agent 出，它调 `hourness_report`）；事件条目由 `entries.ts` 在本进程里按同一张表执行：harness 动作照做；提醒以 `createUserNotice('glm-hourness-loop', 标题, 正文, {hournessLoop: {entry, event}})` 送给持有者的活 agent（运行中 `steer`，空闲 `followup`，agent-loop:806–811），持有者不活时留在内存里、它下一次走步时送；`rulesService(ctx)?.heldForPeak(session)` 为真时同样留着，单解除、agent 被叫回之后送。去重：每个事件有键（例 `handback:<childId>`），同一键在一个进程里只执行一次；harness 动作另按图上的批注幂等（§3.9.1、§3.11.2）。行健康写「循环板没启用：M7 的事件条目照常执行，时间条目不跑」。

## 3. 各条目的设计

### 3.1 派发 `dispatch_task`（m7-1）

#### 3.1.1 参数与输出

参数（rc.3 校验的 schema 子集，`docs/ORCHESTRATION.md` §2.10）：

```ts
{
  id: string                 // 写任务、审查任务或目标（目标整体的审查，§3.9.4）
  model: string              // 子 agent 用的模型 id（§3.1.3）
  why: string                // 为什么选这个模型，一行，1–300 字符
  provider?: string          // 缺省为主 Agent 当前的 provider
  reasoningEffort?: string   // 缺省由所选模型决定
  review?: { depth: 'full' | 'light' | 'skip', why?: string }   // 只给写任务；缺省 full；light、skip 必须带 why（1–300 字符）
  depth?: 'full' | 'light'   // 只给审查任务：改这一轮的深浅（§3.7.1）
  depthWhy?: string          // 只给审查任务：depth 比派活时定的浅时必填，1–300 字符
  context?: string           // 主 Agent 给子 agent 的补充，至多 4000 字符
  quick?: boolean            // 简化简报（§3.3.1），只给写任务
}
```

输出：`{task, attempt, childId, role, worktree?, branch?, provider, model, reasoningEffort?, review?, brief, plan}`。`brief` 是简报摘要（12 位十六进制）；`plan` 为 `required`、`approved`（沿用上一次已批的计划）、`skipped` 或 `none`（审查）。

#### 3.1.2 步骤

1. 调用方必须是主 Agent（M3 的 `isMainAgent`，含持有者记录，M3 附录 §2.4）。设计行不在时拒绝，`hint` 写「先启用 glm-hourness/design 并 /wish」。
2. 读图（图行服务 `dirFor(cwd)` 加 `openEngine(dir).load()`），按 `id` 的节点分三路：写任务走本节；审查任务走 §3.7.1；目标走 §3.9.4。过简报门禁（§3.5.1），不过就拒绝，结构化错误 `{code, message, hint}`，不起子 agent。
3. 槽位：写任务受本行的 `slots`（默认 3）约束，审查与检查不占。DSH 自己的上限 `maxActiveSubagents`（默认 8，subagent:2980）满时 `startActivation` 抛 `ACTIVATION_LIMIT_REACHED`（subagent:1046–1048），同样作为 `slots_full` 返回。规则板不经服务参与：`dispatch_task` 的原生名进 `DISPATCH_TOOL_NAMES`，规则板在它自己的工具调用门里判派发一类，排队时这次调用在工具体之前就被拒并带等待单（规则板设计 §6.5）。
4. 工作树（只对写任务）：`git.ensureWorktree(repoRoot, task)`。
   - 仓库根取主 Agent 会话头 `cwd` 往上的 `git rev-parse --show-toplevel`；不是 git 仓库时拒绝（`not_git`）。基线分支取主检出当前分支（`git symbolic-ref --short HEAD`），分离头指针时拒绝（`no_base_branch`）。
   - 路径 `<仓库根>/.worktrees/hz-<任务 id>`，分支 `hz/<任务 id>`。`.worktrees/` 或 `.hourness/` 没被忽略时，把 `/.worktrees/`、`/.hourness/` 追加到 `<git>/info/exclude`（本地文件、各工作树共用、不入库；先查同一行是否已在）。
   - 这个任务进过主干（重开之后再派，返工）时按祖先关系判断旧分支（0.2 评审 F17）：`M` 是基线上最近一个尾注 `Hourness-Task: <id>` 的提交。`git merge-base --is-ancestor M hz/<id>` 成立：分支是进主干之后建的或已接到它之上，复用。不成立：它是进过主干的那条分支（之后可能还有提交）：旧工作树干净就 `git worktree remove`（不带 `--force`；不干净时拒绝 `worktree_dirty` 并列出文件），把旧分支改名为第一个不存在的 `hz/<id>@<n>`（`n` 从 1 起，`git branch -m`），再从当前基线新建 `hz/<id>` 与工作树，派发批注写「旧分支留在 hz/<id>@<n>」。同一次返工里的下一次派发（例如审查没过、再修）按同一个判断复用新分支。
   - 不存在时 `git worktree add -b hz/<id> <路径> <基线分支>`；已存在且不需要改名时复用。
   - 新建的工作树跑 `norm-merge-gate` 里的准备命令（§3.8.1），每条 10 分钟上限，日志写 `<git>/hourness/execute/<任务>/setup-<时间>.log`，跑完把监视文件的摘要写进 `<git>/hourness/execute/<任务>/setup.json`；复用的工作树先算摘要，变了就重跑。失败时新建的工作树与分支删掉、复用的保留，都拒绝（`worktree_setup_failed`，带日志路径与最后 20 行）。
   - 工作树在主 Agent 会话的工作区之内（L3 实测的约束，`docs/ORCHESTRATION.md` §3.2）。
5. 次数：`attempt` = 图上这个任务已有的派发批注数加一。`childId` = `hz-<任务 id>-a<次数>-<6 位 base36 随机>`（字符在 `[A-Za-z0-9._-]` 之内，session-persistence-jsonl:866；随机后缀避开 `DUPLICATE_CHILD`，subagent:1430–1437）。
6. 生成简报（§3.5.2）与 pins（§3.5.3）。
7. 模型（§3.1.3）：校验，得到 `agentOptions`。
8. `startActivation({provider: 'spawn', label: 'hourness task <id> attempt <n>', childId, request: {prompt: [{type: 'text', text: 简报}], parent: 主 Agent, cwd: 工作树绝对路径, agentOptions, outputSchema, maxDepth: subagents.resolveMaxDepth()}, signal: exec.signal, delivery: 'caller'})`（subagent:3036–3048；`cwd` 为绝对路径时原样使用，1523–1527；`resolveMaxDepth` 3023）。
9. 写登记表（§3.1.4），在 `result` 上挂交回处理（§3.6.2）。
10. 以 `harness` 身份在任务上批注派发记录：`第 <n> 次派发 · <childId> · 基线 <分支>@<短号> · 模型 <provider>/<model>[ <effort>]，理由：<why> · 审查：<全审|轻审|不审>[，理由：<why>] · 简报 <digest>`，最后一行是 pins（§3.5.3）；已批准的任务转为进行中。指标流水记 `execute.dispatch`（§3.16）。写图失败不撤销派发：重试 3 次（每次重读修订号，间隔 200、800、2000 毫秒），仍失败时告警一次、行健康降级；派发的事实（含模型与理由）仍在主 Agent 会话的工具调用里，对账从会话推出（§3.9.6）。

`delivery: 'caller'` 的理由同 0.2：`parent` 模式会给子 agent 附「用 `send_message` 把结果发给父 agent」的指引（subagent:472–476、1460），并在结束时把整段结构化结果作为结算通知送进主 Agent（508–540、2049–2063），同一份交回会进主 Agent 的上下文两次；`caller` 模式只交给 harness，由 harness 送一行摘要。驱动器照样等它（`waitForChildren` 按派发链等所有常驻后代，1296–1330）。`caller` 没在 L3 跑过（§15 U1），不成立时退回 `parent`，简报写明只用 `structured_output` 交回。

#### 3.1.3 模型由主 Agent 选（`d-main-agent-models`）

0.2 的档位映射（行配置 `tiers`）、「实现任务默认便宜档」「审查高一档」「目标整体的审查固定最强档」与 `modelReminder` 全部删去。

- 每次 `dispatch_task`（写任务、审查任务、目标整体的审查）都必须带 `model` 与 `why`，缺一个就 `invalid`，`hint` 写这个 provider 目录里的前 10 个模型 id。没有默认模型：harness 不替主 Agent 选。
- provider：缺省取主 Agent 当前的路由，同 DSH 委派时取父路由的读法：会话的 `requestHeader()?.config.provider`，没有时取 agent 的 `options.provider`（subagent:293–303）。给了 `provider` 时它必须是已注册的 provider（`llm` 服务对未注册的 provider 抛错），否则 `unknown_provider`。
- 目录核对 `checkModelChoice(choice, catalog, efforts)`（`src/execute/models.ts`，纯函数）：`catalog` 取 `llm.listModels(provider)`（llm:2086–2101，按 provider 去重的 `{id, name}`）。目录非空且不含 `model` 时 `unknown_model`，`hint` 列出目录；目录读不到（抛错）或为空时放行，派发批注注明「模型目录读不到，没有核对」。`reasoningEffort` 给了时，取 `llm.resolveModelInfo(provider, model)` 的 `reasoning.efforts`，有这一项且不含它时 `invalid`；读不到时放行。目录只作参考：rc.3 写明目录成员不约束路由（llm:2080–2083），所以「读不到就放行」不会让一个能用的模型派不出去。
- `agentOptions = {provider, model, reasoningEffort?}`。DSH 把它合并在父路由之上；换了 provider 或模型而没给档位时，父路由的思考档位被清掉，由所选模型自己的默认值决定（subagent:315–329）。
- 记录：派发批注一行（§3.1.2 第 10 步）与指标事件 `execute.dispatch`（`role`、`provider`、`model`、`reasoningEffort`、`sameAsMain`、审查另带 `sameAsWorker`、`whyRef`：批注所在的节点与历史序号）。理由的原文只在图上，指标流水只记引用（`metrics`：只记数与引用、不记对话正文）。
- 主 Agent 知道能选什么：派发状态提醒（§3.5.4）在每个进程里第一次注入、以及目录变了时，带一行 `Models you can dispatch on <provider>: <id>, <id>, … (choose one per dispatch and say why)`，至多 20 个。
- 不做的：不按任务难度推荐模型；不比较模型强弱（harness 判断不了「更强」，全审要「更强的模型」由主 Agent 自己判断，周报列出每次审查与被审的活是不是同一个模型，供人看）；不替人换主 Agent 的模型（主 Agent 用强一点的模型的提醒在 M3：`/wish` 的回复与流程条，M3 附录 §2.6）；不切换套餐或渠道（`docs/CHARTER.md` §6）。

#### 3.1.4 任务映射

- 事实源：DSH 的会话日志与图。`childId` 本身编码任务与次数；主 Agent 会话的工具调用记下每次派发；worker 会话的首条消息是简报；任务上的派发批注记下 `childId` 与 pins。
- 登记表：模块级的 `Map<childId, Attempt>`（角色 `worker`、`review`、`acceptance-review` 或 `check`，任务或目标，次数、工作树、模型与理由、计划状态、pins、请求表），只在执行行本进程里 `startActivation` 成功之后写入，激活结算后保留到交回处理完成再删。`tools/pre-execute` 用它判断调用方是不是 worker：写权限只给登记表里、且 `agents.get(id)` 仍是活 agent 的 id。名字以 `hz-` 开头不算数：主 Agent 用 `send_message` 冷恢复一个已结束的 worker 时，DSH 会以同一个 id 恢复出一个没有 `outputSchema`、投递方式为默认 `parent` 的激活（subagent:2095 `deliverFollowup` 转 `coldResume`，2141–2189），交回处理接不到它，所以它不能写；§3.2.5 在源头拒绝这种发送。
- 登记表丢失：宿主重启时活着的 worker 随进程一起结束（DSH 的激活只在进程内，subagent:1214 注释「Process-local, never durable」），重启之后没有需要映射的活 worker。行在同一进程里禁用再启用时，登记表在模块作用域里，跟着模块留下〔未核实：DSH 重新应用插件时是否重新导入模块，§15 U13〕；模块被重新导入时登记表为空，还活着的 worker 一律按「不在登记表里」处理：只读（§3.2.2），派发状态提醒把它们列为「失联：先 interrupt_agent，再重新派发」，健康表注明原因。计划状态在需要时取任务上最新的计划批准批注（§3.3.4）。不按 `childId` 前缀解码来恢复写权限。

### 3.2 写入门禁（m7-1）

五条规则，都在 `src/guard/execute-rules.ts`，由执行行在 `tools/pre-execute` 上以 `prepend` 注册（tools:3320–3353），用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`），拒绝写进违规流水（与 guard 同形的 `ViolationRecord`）。判写与 M3 的 `main-agent-no-write` 相同（文件工具的目标，以及 file-tools-only 判为写文件的 shell 命令，M3 §3.1.4）；带 `parent` 的传输层子调用放行。不分路由（G3）。

#### 3.2.1 `worker-scope`：worker 只写自己的范围

调用方在登记表里时：

1. 目标路径按调用方的工作目录解析（`workingDirectory.get(session)`，同 guard），`path.resolve` 规整。
2. 必须在本次派发的工作树根之内，且不在工作树根下的 `.git` 里；否则拒绝，越界一句 `You are the worker for task <id>; you write only inside your worktree <path>.`
3. 相对工作树根的路径在 `.hourness/` 下时放行（交回的长报告，§3.6.2；这个目录被 `info/exclude` 忽略，不进改动）。其余必须在任务当前的 `writeScope` 之内（`scope.within`，按段比较：`src/` 包含 `src/a.ts`，不包含 `src2/a.ts`；文件项只包含它自己），并且：需要计划的任务，计划获批之前一律拒绝（`Submit your plan with submit_plan and wait for approval before writing.`）；获批之后还要在已批计划各步 `paths` 的并集之内。
4. 审查者（`kind: review`）与目标整体的审查只能写 `.hourness/`。

写入范围取当前的图，不取派发时的快照：主 Agent 中途把范围改大，worker 重新提交计划（§3.3.3）即可写新路径；改小立即生效。范围读图按图修订号缓存。

纠偏的正路：`If the task needs this file, ask the main agent with ask_main; it can widen the write scope, then resubmit your plan.`；例外：`If the file belongs to another task, report it in your handback under questions.`

#### 3.2.2 `dispatch-chain-readonly`：派发链里不在登记表的 agent 只读

取代 M3 `design-before-release` 的「有效阶段为 `release` 或之后：放行」一行。M3 的规则按派发链找根（`dispatchRoot`，M3 §3.3.3）；根是主 Agent、写调用方不在登记表里时：执行服务在（执行行启用）→ 拒绝，越界一句 `In a main-agent session only dispatched task workers write; you were started with the plain subagent tool.`，正路「Read, search and report back; the main agent dispatches writing work with dispatch_task.」；执行服务不在 → 保持 M3 的行为（`release` 之后放行）。设计期（放行之前）照旧按 M3 拒绝。M3 的身份节边界一句与 `main-agent-no-write` 的正路在执行服务在时同样改为「writing work goes to workers you dispatch with dispatch_task; subagents started with the subagent tool only read」，否则主 Agent 会先走一次必被拒绝的路（0.2 评审 F18）。这条规则改的是 M3 的文件 `src/guard/main-agent.ts`，判定经服务 `glmHournessExecute.isWorker(agentId)` 取得，guard 目录不导入执行目录。

理由：原生 `subagent` 派出的子 agent 写在主检出上，绕过工作树、写入范围、审查与合入前的检查；worker 再派出的 agent 同理。只读的探索仍然有用，所以只拦写。

#### 3.2.3 `worker-graph-readonly`：worker 对图只读

派发链的根是主 Agent 的子 agent（登记表里的与只读子 agent）调图的写工具（`graph_propose`、`graph_status`、`graph_edit`、`graph_link`、`graph_unlink`、`graph_verify`、`graph_decide`、`graph_approve`、`graph_reject`）被拒；`graph_show`、`graph_open`、`graph_focus`、`graph_comment` 放行。这九个工具本来就不在它们的工具面里（§2.3.2），这条是按名直接调用时的兜底。正路：`Report it in your handback (questions, assumptions, lessons); the main agent updates the graph.`。理由：规划状态只有主 Agent 与 harness 两个写入方，worker 写图会与主 Agent 争修订号，也会绕过「计划外的变更走待决」。这回答了 `docs/ORCHESTRATION.md` §2.10 留给 M7 的「子 agent 该不该写图」。

#### 3.2.4 `worker-git`：worker 只碰自己的分支，危险命令先存快照

0.2 的 `main-agent-no-git-write`（拦主 Agent 的 `git merge`、`commit`、`reset` 一类）删去：git 交给主 Agent（`d-main-agent-shell`），主 Agent 的 git 只受两样东西约束：M3 的快照规则（会丢未提交改动或改写历史的命令先存快照，M3 附录 §2.5）与本稿主干前进的核对（§3.8.4）。

worker 与它派出的 agent（派发链里、根是主 Agent、不是主 Agent 自己）的 shell 命令里的 git 调用，用 M3 的 `gitInvocations(text, dialect, base)` 读出（`src/guard/git-snapshot.ts` 的导出，引号感知，跳过全局选项，解析 `-C`；M3 内部已有这套读法，M7 只请它导出），按下面判：

1. 仓库目录必须是调用方自己的工作树（登记表里的 `worktree`）或它之下；`-C`、`--git-dir`、`--work-tree` 指到别处，或 `cd` 的目标认不出时拒绝。只读子 agent 与审查者只能用只读子命令（`status`、`log`、`diff`、`show`、`blame`、`grep`、`rev-parse`、`ls-files`、`describe`、`shortlog`、不带改写参数的 `branch` 与 `tag` 列表）。
2. worker 可以在自己的分支 `hz/<id>` 上做任何事：`add`、`commit`（含 `--amend`）、`rebase <基线>`、`merge <基线>`、`reset`、`stash`、`restore`、`checkout -- <路径>`、`cherry-pick`、`revert`。
3. 拒绝：`push`；`pull`（取别处的东西进来由主 Agent 定）；`worktree`；`update-ref`、`symbolic-ref` 的写法；`branch` 的创建、删除、改名与 `-f`，`tag` 的创建与删除，`checkout`、`switch` 到 `hz/<id>` 以外的分支或以 `-b`、`-B`、`-c`、`-C` 新建分支；`fetch` 写进 `refs/heads/` 的 refspec；`config` 的写法；`filter-branch`、`filter-repo`、`replace`、`gc --prune`、`prune`、`reflog expire|delete`。
4. 放行之前，M3 的 `gitRisk(sub, args)` 为 `discard`、`history` 或 `both` 的，先调 M3 的 `takeSnapshot(repo, invocation, risk)`（快照引用 `refs/hourness/snapshots/<id>`、流水 `<git>/hourness/snapshots.jsonl`、给调用方的恢复提示，与主 Agent 一侧同一套）；存不了快照时按 M3 的同一条拒绝（`git-snapshot`）。worker 的工作区只有它自己的改动，快照救的是它自己与之后接手的那一次派发。

纠偏一句：`You are the worker for task <id>: use git only on your branch hz/<id> in your worktree; the main agent integrates, pushes and manages other branches.`；例外：`If the task needs another branch, ask the main agent with ask_main.`。这是启发式：认不出的写法（例如脚本里调 git）改到别的分支或主干时，由主干前进的执行后比对（§3.8.4，对 worker 的 shell 调用同样做）与巡检发现。

#### 3.2.5 `worker-message-live-only`：主 Agent 只给活着的派发发消息

主 Agent 调 DSH 原生 `send_message`（参数 `{agent_id, message}`，tool-subagent-control:23–36）或 `interrupt_agent` 时，`agent_id` 以 `hz-` 开头、却不是执行行在本进程里起的、仍活着的激活（登记表里的 worker 与审查，加上检查与目标整体审查的激活，§3.1.4）就拒绝。对活着的检查，`send_message` 也拒绝（外部激活收不了续发），`interrupt_agent` 放行。理由：对已结束的 worker，`send_message` 走冷恢复（subagent:2095、2141–2189），恢复出来的激活没有 `outputSchema`、投递方式是默认的 `parent`，交回处理接不到它，它的工作也不会进审查与合入前的检查。正路：`That worker has ended; dispatch the task again with dispatch_task (the new attempt carries the earlier findings).`。`interrupt_agent` 对已结束的 id 本来无事可做，同一句纠偏。不是 `hz-` 开头的 id 不管（主 Agent 自己用 `subagent` 派的只读探索照常可以续聊）。

### 3.3 计划审批（m7-1，`d-plan-approval`）

#### 3.3.1 什么任务要计划

写入范围非空的任务都要，除非派发时 `quick: true` 且满足：写入范围至多 2 项、都是文件（不以 `/` 结尾）（0.2 的「档位不是 `hard`」随档位一起删去）。不满足时 `quick` 被拒（`invalid`，`hint` 写条件）。审查任务没有计划。理由：`docs/ORCHESTRATION.md` §3.3「小改动用简化简报：规则照样硬，靠降低派发成本来解决」。

#### 3.3.2 `submit_plan`（worker 的工具）

参数：

```ts
{
  steps: Array<{
    title: string                  // 一行
    paths: string[]                // 仓库相对路径，同 writeScope 的写法
    acceptance: string[]           // 至少 1 条
    covers: number[]               // 覆盖任务验收的第几条（从 0 起）
    verify: 'L1' | 'L2' | 'L3' | 'L4-batch'
    commands: string[]             // 这一步要跑的检查命令；L2、L3 至少 1 条
  }>
  notes?: string                   // 至多 2000 字符
}
```

`checkPlan(task, plan, norm)`（`src/execute/plan.ts`，纯函数）全部成立才通过：步骤 1–12 个；每步标题非空、验收至少一条、`verify` 合法、L2 与 L3 有命令；每步的 `paths` 都在任务的 `writeScope` 之内（§3.2.1 的 `within`）；任务的每条验收至少被一步的 `covers` 覆盖，`covers` 里没有越界的下标；`L4-batch` 的步不带命令（桌面版的验收攒到批次，`docs/DEVELOPMENT.md` §1.1）。

不通过：工具当场返回错误（每条一行，例 `step 2: path "ui/x.ts" is outside the write scope [src/execute/]`），不通知主 Agent，worker 改了再交。同一次派发里第 4 次不通过时，返回「plan rejected 4 times; hand back with status blocked」。

通过：
1. harness 以 `harness` 身份改任务正文：把正文里 `## 计划` 开头的一节（没有就追加）换成渲染后的计划（`第 <版本> 版 · 等主 Agent 审 · 摘要 <plan digest>`，每步一行标题、一行路径与验证层级），版本从 1 起，每次通过加一。写正文失败时照样继续（计划的事实源是 worker 会话里这次工具调用的参数），健康表记降级。
2. 在请求表里登记一个请求 `{id: 'R-<6 位>', kind: 'plan', child, task, version, digest}`，给主 Agent 送一条通知（§3.4.3），正文是渲染后的计划与 `answer_worker` 的用法。
3. 工具调用不返回，等主 Agent 回应，上限 30 分钟（常量 `PLAN_WAIT_MS`）。等待期间 worker 的回合开着，驱动器不会开下一拍（它等子 agent），主 Agent 由通知唤醒（空闲时 `followup`，运行中 `steer`）。
4. 回应或超时之后返回：`{status: 'approved' | 'revise' | 'timeout', version, text?}`。超时时提示 worker：`No review within 30 minutes; hand back with status plan-pending.`（主 Agent 之后可以批这一版并重新派发，新的一次派发直接沿用已批的计划）。

#### 3.3.3 改计划

已批的计划要扩大路径（主 Agent 中途改了写入范围，或 worker 发现要动别的文件）时，worker 再 `submit_plan`（版本加一），批准之前已批路径照样可写，新路径不可写。

#### 3.3.4 主 Agent 的批准

`answer_worker {request, verdict: 'approve' | 'revise', text}`（§3.4.2）。`approve` 时 harness 再跑一次 `checkPlan`（图可能在这之间变了）并核对 pins（§3.5.3），都过才：把正文那一节的「等主 Agent 审」改为「主 Agent 已批」；在任务上批注 `计划第 <版本> 版已批 · 摘要 <digest> · <childId> · <调用 id>`；把请求标为已回应，worker 的调用返回 `approved`。不过就把原因返回给主 Agent（`plan_invalid`、`brief_stale`），worker 的调用不动。`revise` 时 `text` 必填，原样交给 worker。

计划批准的记录在图上，所以后续每一次派发都能沿用：简报门禁在任务的最新计划批准批注存在、它的摘要等于正文里当前计划一节的摘要、批注之后 pins 没过期时，在简报里附上这份计划，`plan` 输出为 `approved`，worker 直接按计划写（写入门禁取这份计划的路径）。正文里的计划被人或 LLM 改过（摘要对不上）时，这份批准失效，worker 要重新提交。

人不出场：批准者是主 Agent，可查的条件由 harness 在边界核对；计划不合格不打扰主 Agent，主 Agent 不批 worker 就不能写。

### 3.4 主 Agent 与 worker 的通信（m7-1）

#### 3.4.1 rc.3 里已有的通道〔实读〕

- 子到父：`subagents.sendMessage(sender, parentId, content)`，发送方是常驻的直接子 agent 时走 `sendToParent`，以 `steer` 投给父 agent，父空闲则唤醒（subagent:1538–1544、2119–2135、1630–1642）。消息来源 `{kind: 'agent-message', form: 'relay', senderSessionId}`（subagent:443–465）。L3 实测过结束时的这一条（探针 `glm-dispatch`）。
- 父到子：同一个 `sendMessage`，目标是直接子 agent 时走 `deliverToChild`，常驻时 `submitAdmitted` 以 `steer` 投给子 agent（下一步收到），不常驻时从持久化冷恢复（subagent:1545–1549、2080–2117、2216–2231、1584–1590）。子 agent 正在提交结构化结果时拒绝（`INPUT_CLOSED`，subagent:1588）。源码核对过，运行时没有跑过〔未核实，§15 U3〕。
- 工具：`send_message {agent_id, message}` 与 `interrupt_agent {agent_id}`（tool-subagent-control:23–86）。目标只能是直接子 agent，或自己是常驻子 agent 时的直接父 agent；兄弟之间发不了：目标不是自己的父，就当作自己的子去投，按派发链核对时以 `UNAUTHORIZED` 拒绝（subagent:1545–1549、`authorizeLineage` 1659–1662）。
- 中断：`subagents.interrupt(target, authority)`，祖先或人的身份，取消子 agent 当前的回合、保留收件箱（subagent:1258–1278、3105）。
- 投递是步与步之间的：运行中 `steer`（下一步收到），空闲时开新回合；没有逐 token 的对话。

#### 3.4.2 三条路

| 用途 | 做法 | 为什么不用别的 |
| --- | --- | --- |
| worker 要主 Agent 拿主意 | worker 调 `ask_main {question, assumption, options?}`：harness 登记请求（`kind: 'question'`），通知主 Agent；worker 的调用开着，上限 20 分钟（常量 `ASK_WAIT_MS`）。主 Agent `answer_worker {request, text}`，回答作为这次调用的结果回到 worker。超时返回 `{status: 'timeout'}`，worker 按它自己写下的 `assumption` 继续，并在交回的 `assumptions` 里列出 | 带 `outputSchema` 的子 agent 若停下回合等回答，DSH 会以 `error` 结算这次激活（没有结构化结果的 `completed` 记为 `error`，subagent:1098–1117），交回就丢了；所以等待必须发生在一次工具调用里，回合不能结束。`send_message` 只投递、不等回答 |
| 主 Agent 改 worker 的方向 | 原生 `send_message {agent_id: <childId>, message}`；worker 在下一步收到（正在 `ask_main`、`submit_plan` 里等的话，在那次调用返回后的下一步） | 已是 DSH 的通道，消息与来源都落在双方会话日志里。改方向如果涉及验收、非目标或写入范围，正路是先改图：前两者由人定（转述），写入范围主 Agent 自己能改；改了验收与非目标会让简报过期（§3.5.3），这次的改动进不了主干，所以重大改向用「中断 + 重新派发」 |
| 停下 worker | 原生 `interrupt_agent`，或人在面板上点「暂停」（M2.9 的 `/graph-run stop`，按 worker 的焦点找到它；简报要求 worker 先 `graph_focus` 自己的任务，§3.5.2） | 被中断的 worker 以 `aborted` 结算（subagent:487–498），交回处理记一条「第 n 次被中断」，任务保持进行中。之后要继续就重新派发，不用 `send_message` 唤醒：结构化交回是按激活算的，冷恢复的回合没有 `outputSchema`（subagent:555–560 注释、2141–2189）。§3.2.5 在执行边界拒绝对已结束 worker 的 `send_message`，正路就是重新派发 |

worker 之间不直接说话：DSH 已经拒绝；简报里写明「需要别的任务的东西时用 `ask_main`」。

#### 3.4.3 harness 发给主 Agent 的消息

都用 `createUserNotice('glm-hourness-execute', 摘要, 正文, {hournessExecute: {...}})`（来源种类非空、其余字段原样保存，`docs/DESIGN.md` §2.4a；来源不是 `user`，所以不会被 `update_goal` 当成人直接说的话，tool-goal:44–52）。主 Agent 运行中用 `steer`，空闲用 `followup`（agent-loop:806–811）。事实字段：`{event: 'plan' | 'question' | 'handback' | 'review' | 'check' | 'advance' | 'stale' | 'drive', task, attempt, childId, request?}`。这些是请求与事实的通知（机制）；「碰到某件事就去做」的提醒是循环板条目的正文（§2.5），来源为 `glm-hourness-loop`。

#### 3.4.4 留痕

- 每条消息的全文在双方的会话日志里：worker 的 `ask_main`、`submit_plan` 调用与结果；主 Agent 的 `answer_worker`、`send_message` 调用与 harness 通知。这是事实源，图上不复制全文。
- 交回处理时在任务上批注一行计数：`第 <n> 次：问了 <k> 次（答 <a>、超时 <t>），计划 <v> 版，主 Agent 发来 <m> 条消息`，`m` 由 worker 会话里来源为 `agent-message` 且 `senderSessionId` 是主 Agent 的用户消息数得出。
- 问答里定下的设计取舍，主 Agent 按身份文本的要求记成决定者为 agent 的待决再拍板（M3 的做法）；harness 不替它判断哪条回答算决定。

### 3.5 简报与简报门禁（m7-2）

#### 3.5.1 门禁

`briefGate(graph, node, ctx)`（`src/execute/brief.ts`，纯函数；`ctx` 带在跑的派发、槽位、执行状态、停下标记与所属目标推出的阶段 `stage`），按序第一条不成立就拒绝。写任务全表适用；审查任务与目标只用标出的几行，其余见 §3.7.1、§3.9.4。

| 检查 | 适用 | 不成立时的码 | `hint` |
| --- | --- | --- | --- |
| 参数合法：`model`、`why` 齐，`review`、`depth`、`depthWhy`、`quick` 与节点种类相符（§6.4） | 全部 | `invalid` | 写出缺的或多的字段 |
| 节点是任务（或目标），状态为已批准或进行中 | 全部 | `bad_task` | 完成的任务先重开 |
| 所属目标的推出阶段不早于 `release`，或目标已批准、没有阶段（推出的阶段由调用方放进 `ctx.stage`） | 全部 | `not_released` | 先在对话里把设计交给人放行 |
| 有 `kind`；`review` 的写入范围为空，其余种类非空；`worktree` 不是 `false` | 写任务 | `bad_attributes` | 用 `graph_edit` 补派发属性 |
| `acceptance` 至少一条 | 写任务、目标 | `no_acceptance` | `Propose the task again with acceptance criteria; changing the acceptance of an existing task is the human's.`（`src/graph/engine.ts` `LLM_EDITABLE`:101 不含 `acceptance`） |
| 依赖都完成 | 写任务 | `deps_open` | 列出未完成的依赖 |
| 任务子树里没有等人回话的待决（含提议式待决）；也没有未解除的停下标记（§3.7.3）；或执行行在内存里记着它已停下（`ctx.stopped`） | 写任务、审查任务 | `waiting_human` | 列出待决与停下标记所在的批注；「the person has not answered yet: put it to them in the chat with propose_to_human」 |
| 这个节点没有活着的派发 | 全部 | `busy` | 带在跑的 `childId` |
| 写入范围与每个在跑的写任务两两不相交（`scope.overlaps`） | 写任务 | `scope_busy` | 写出相交的任务与路径；可以 `graph_link` 依赖 |
| 写任务数小于 `slots` | 写任务 | `slots_full` | 写出在跑的写任务 |
| `outputSchema` 能解析（内置名或仓库内的 JSON 文件，对象 schema，在 rc.3 子集内） | 写任务 | `bad_schema` | — |
| 审查任务：被审的任务有 `done` 的交回，且这次交回之后没有过期 | 审查任务 | `nothing_to_review` | — |

四栏都由 harness 从图生成，所以门禁检查的是图上的来源：目标栏要标题，上下文栏总有祖先链，约束栏要写入范围，完成栏要验收。

#### 3.5.2 简报的文字

英文，上限 9000 字符；超出时依次裁掉经验、上一次的发现细节、主 Agent 的补充（各自注明「truncated」）。结构：

```
# Task <id>: <title>
You are a worker dispatched by the main agent (agent id "<parent>") for exactly one task of the project graph.

## Goal
<title>. Why it exists: <ancestor chain, goal first: "<goal title>" > "<feature title>" > this task>.
Decisions it follows: <source decisions and decided questions: id, title, chosen option>.

## Context
- From the main agent: <context>
- Workspace: your worktree "<path>" on branch "hz/<id>", created from "<base>" at <sha>. Paths below are relative to it.
- Project graph: read with graph_show / graph_open; graph_focus "<id>" first so the panel shows you on this task. You may only graph_comment.
- Earlier attempts: <attempt n-1: outcome; review blocking findings; merge check failure (command, last lines, log path)>
- Approved plan (version <v>): <steps>            # only when one carries over
- Lessons that match this task: <lesson id: when ... -> problem -> fix>   # at most 5

## Constraints
- Write only inside: <writeScope>. Writes elsewhere are refused.
- <Before writing, submit a plan with submit_plan and wait for approval. | Quick task: no plan needed.>
- Questions that need the main agent: ask_main (state the assumption you will use if no answer comes). Do not end your turn to wait.
- Commit on your branch; start every commit message with "<id>: ". Do not push, and do not touch other branches or worktrees; the main agent integrates your branch.
- Subagents you start may only read. Do not start or restart the DeepSeek Harness desktop app; desktop checks are batched (verify "L4-batch").
- Not in scope: <nonGoals of the task and its ancestors>
- Rules in effect: <rules board lines for this session, when the rules row is enabled>

## Done when
1. <acceptance 1>
2. ...
- Run the project checks in your worktree before handing back: <gate commands from norm-merge-gate>.
- Hand back by calling structured_output once (status, summary of at most 2000 characters, commits, files, checks, questions, assumptions, lessons). Write long reports to ".hourness/<childId>.md" in your worktree and give the path in "report".

brief <digest> · graph <revision>
```

审查任务的简报同形，目标栏写「Review task <被审 id> at commit <sha> against its acceptance」，约束栏写「You write nothing except your report under .hourness/」、挡路的三类标准（§3.7.2）与这一轮的深浅（全审或轻审的那一句，§3.7.1），完成栏的交回是审查结论。

#### 3.5.3 pins 与过期

`pinsOf(graph, task)`（`src/graph/pins.ts`，纯函数）：对任务、它到目标的每个祖先、它的 `source` 连线指向的每个节点（决策与待决），各算一个 12 位十六进制的语义摘要：SHA-256 输入是规范化的 JSON，只含这些字段：

| 节点 | 进摘要的字段 |
| --- | --- |
| 任务 | `acceptance`、`nonGoals`、`kind`、状态是否为废弃或被取代 |
| 祖先（目标、特性、任务） | `acceptance`、`nonGoals`、状态是否为废弃或被取代 |
| 来源决策 | `verification` 是否为 `overturned` 或 `superseded`、状态 |
| 来源待决 | `decision`（选项式的拍板结果）或 `conclusion`（提议式的结论，M3 附录 §3.3）、状态 |

不进摘要的：标题、正文、`slope`、历史、写入范围（写入范围由写入门禁按当前的图核对，交回时另按 git 核对，§3.2.1、§3.6.2）。

派发批注的最后一行写 `pins: <id>@<摘要> <id>@<摘要> …`。`staleness(graph, pinsLine)` 返回变了的节点与变化（摘要不同、节点不在图里）。核对的时机：交回处理、派审查时、`check_commit` 读到尾注里的任务时、主干前进时、`answer_worker` 批计划时、派发状态提醒每次计算时。过期时：交回处理照记，但不建审查任务，主 Agent 收到 `stale` 通知（写明哪个节点变了）；派它的审查被拒（`brief_stale`）；`check_commit` 的结果写明过期的任务，主干前进时这些任务不写完成证据（内容进了主干也不算这件活做完）；正路是重新派发（新的简报）。主 Agent 在跑的 worker 过期时，通知里建议 `interrupt_agent` 后重新派发。

只用语义字段的理由：阅读摘要 §7 第 2 条的推荐 A 提到，修订号连无关的标题改动也会变，会带来误拒；只比验收、非目标与决策结果，误拒只剩真正改了意图的情形。

#### 3.5.4 并行与补位提醒

派发状态提醒（`src/execute/notice.ts`）：执行行经公共库的 `installStepNotice(agent, 'dispatch status', eligible, build, 'execute')` 给主 Agent 装一个 `agent/pre-step` 监听器（`eligible`：本步是主 Agent，且焦点目标的推出阶段为 `execute`、`merge` 或 `decompose`）。正文（英文）只列有内容的项：在跑的 worker（任务、第几次、用时、最近一次请求）、等主 Agent 回应的请求（计划、问题，按等待时长）、过期的派发、丢失的派发（§3.9.6）、自动推进的状态（人暂停、清掉、阻塞的原因，§3.9.1）、模型目录（每个进程第一次与目录变了时，§3.1.3）、空闲槽位数与可以开工的任务（前 5 个，按依赖序），可以开工且槽位空闲时末尾一句 `Free slots: <n>. Dispatch ready tasks with dispatch_task.`。注入规则用 M3 抽出的 `src/graph/digest-notice.ts`：压缩之后、目标轮、正文摘要变化时注入，其余不注入（K7：有条件提醒，不每轮重复）。

#### 3.5.5 经验板块的接缝（按 M5 设计 0.3 §8.1 的五处改）

经验板块是 M5 的 `lessons`。经验行不在时这几处什么都不做，行健康注明「经验板块未启用」。服务契约以 M5 的 `src/lessons/service.ts` 为准（`LESSONS_SERVICE = 'glmHournessLessons'`）：

- 进简报：派发时调 `relevant({session: 主 Agent 的会话, paths, tools, commands, limit: 5})`（`session` 是 M5 要的第 1 处改动，用来定位项目）。`paths` 是写入范围加已批计划的路径；`commands` 是 `norm-merge-gate` 的命令加计划各步的命令；`tools` 取 `['Write', 'Edit', 'Bash']` 与计划命令的首个词。返回的每条带 `line`（至多 300 字符），合计至多 1500 字符，渲染进上下文栏。`relevant` 从不 reject；超过 2 秒不等，派发照常，告警一次。
- 交回候选：交回结构的 `lessons` 每项可以带 `errors`（至多 5 项，每项 8–300 字符）与 `scope`（`project` 或 `all`），都不进 `required`（M5 第 2 处）。harness 对每项调 `propose(candidate, {session, task, childId, commit?})`，按结果分三路（M5 第 5 处）：`candidate`、`merged`、`dropped` 只在交回摘要里计数；`rejected` 不写任何批注，只在交回摘要里记「1 条候选经验被拒：<code>」，不带内容；返回 `{error}` 或服务不在时写退路批注 `[候选经验] <problem> → <fix> · {"files":[…],"commands":[…],"tools":[…],"errors":[…],"scope":"project"}`（M5 第 3 处），写之前每个字符串字段过一遍 `looksSecret`（`src/data/secret-shape.ts`），命中的整项换成「（像密钥，已略去）」。理由：图节点文件会提交并推到远端，写进去的令牌要改写历史才删得掉。
- 主动查询：`LESSONS_TOOL_NAMES = ['lessons_query', 'lessons_merge']`，常驻名单只加 `lessons_query`（M5 第 4 处）；所有 agent 都有 `lessons_query`。简报约束栏加一句 `When a command fails or a tool behaves unexpectedly, search the lessons board before working around it.`。
- 周报与巡检调 M5 的 `stats(session, since, until)` 与 `hygiene(session, now)`（M5 §4.9）；没有经验行时这两节不出现。

### 3.6 交回（m7-1、m7-4）

#### 3.6.1 结构

内置 schema `hourness-handback-v1`（`src/execute/schemas.ts`，只用 rc.3 `assertObjectJsonSchema` 认的子集：`type`、`properties`、`required`、布尔 `additionalProperties`、`items`、`enum`）：

```ts
{
  status: 'done' | 'blocked' | 'partial' | 'plan-pending'
  summary: string                                     // harness 截到 2000 字符
  commits: string[]                                   // 本次在分支上的提交号
  files: string[]                                     // 改过的文件，仓库相对路径
  checks: Array<{ command: string, exit: number }>    // worker 自报，不当证据
  questions: string[]                                 // 留给主 Agent 的问题
  assumptions: string[]                               // ask_main 超时后用的假设，及其他假设
  lessons: Array<{ problem: string, fix: string, files: string[], commands: string[], tools: string[],
                   errors?: string[], scope?: 'project' | 'all' }>   // errors 至多 5 项、每项 8–300 字符（M5 §8.1 第 2 处）
  report?: string                                     // 长报告的路径：工作树里的 .hourness/<childId>.md
}
```

审查用 `hourness-review-v1`：`{verdict: 'APPROVED' | 'CHANGES_REQUESTED', commit: string, findings: Array<{id, blocking: boolean, criterion: string, where: string, what: string, fix: string}>, checked: string[], lessons: [...]}`。

任务的 `outputSchema` 写了仓库内的文件时，harness 把内置的核心字段合并进去（`properties` 取并集、`required` 取并集；同名字段以内置为准），保证交回处理需要的字段都在。

#### 3.6.2 处理

worker 的 `result` 落定后（`{output, stopReason, structured?}`，subagent:1098–1117；`caller` 模式下由 harness 自己收，2049）：

1. `stopReason` 不是 `completed`（`aborted`、`error`、`max-tokens`、`refusal`）：批注「第 <n> 次结束：<原因>」，任务保持进行中；给主 Agent 送一条事实通知（§3.4.3 的 `handback` 事件），建议重新派发或在下一批里问人。
2. 有结构化结果：语义校验（提交号是 7–40 位十六进制且在分支上，`git merge-base --is-ancestor <基线> <提交>` 与 `git branch --contains`；文件是仓库相对路径）。校验不过的项记进批注，不丢整份交回。
3. 长报告：`report` 指向 `<工作树>/.hourness/<childId>.md` 时复制到 `<git>/hourness/reports/<childId>.md`（工作树之后会删），批注里写后者。
4. 批注交回摘要：状态、提交数与最新提交、文件数、问题与假设各几条、通信计数（§3.4.4）、候选经验的计数（§3.5.5）、报告路径。
5. 候选经验按 §3.5.5 处理。
6. pins 过期 → `stale` 通知，停在这里。
7. `status: done`：读这次的改动（`git diff --name-status <merge-base> <最新提交>`）与这次派发里 worker 一方跑过的命令记录（`<git>/hourness/execute/<任务>/<childId>.commands.jsonl`，§3.7.1），按 `norm-review-floor` 判命中，得出有效深浅（§3.7.1）。有效深浅不是不审：确保审查任务在，发出 `hourness.handback`；是不审：发出 `hourness.review-skipped`。`blocked`、`partial`、`plan-pending`：事实通知给主 Agent，由它决定重新派发、改任务或问人。
8. 给主 Agent 的一行结论（例「task-3 第 1 次交回 done，提交 1a2b3c4（2 个），按轻审：等你派审查」）；整段结构化结果不进主 Agent 的上下文。指标流水记 `execute.handback`。

处理是幂等的：每一步先看图上有没有同一 `childId` 的对应批注，有就跳过，重启后的对账可以安全地重跑（§3.9.6）。

### 3.7 独立审查（m7-4）

#### 3.7.1 深浅、底线清单与派审查

深浅（`question-38` C，深浅的含义取 `norm-review-floor` 正文）：全审是「更强的模型对照验收逐条看」，轻审是「只扫改动」，不审是「只改文档、错字一类」。

- 主 Agent 在写任务的 `dispatch_task` 里定 `review`（缺省 `full`；`light`、`skip` 必须写 `why`），记在派发批注里。每一次派发都可以重新定。
- 底线清单的判定（`src/execute/floor.ts`，纯函数）：`parseFloor(acceptance)` 从 `norm-review-floor` 的每一条验收里读出反引号里的判定写法（§3.8.5），没有判定写法的条目记为「harness 判不了」，行健康列出第几条。`floorHits(floor, change, commands)` 对一次改动给出命中：改动的文件落在 `files` 的路径里；改动里有删掉的文件而这一条写了 `deletes`；这次派发里 worker 一方跑过的命令以 `commands` 列的词开头；worker 一方的文件工具目标或 shell 命令里的绝对路径落在它的工作树以外而这一条写了 `outside`（被拦下的也算：试过就要全审）。
- 命令记录：worker、审查者与它们派出的 agent 的每次 shell 调用，`worker-scope` 与 `worker-git` 在 `tools/pre-execute` 里已经读了一遍命令；同一处把命令位置上的词（经 M3 的 `simpleCommands`）、git 子命令与参数、指到工作树以外的路径与判定结果追加进 `<git>/hourness/execute/<任务>/<childId>.commands.jsonl`（只记命令词与路径，不记输出）。写失败时这次派发记为「命令记录不全」，有效深浅一律按全审（宁可多审，不让判不了变成不审）。
- 有效深浅：有命中就是全审，批注「审查改为全审：碰到必须全审清单第 <n> 类（<文件或命令>）」，指标流水记 `execute.review-depth`（声明的、有效的、命中哪一类）；没有命中就是主 Agent 定的那一档。
- 审查任务：有效深浅不是不审时，harness 确保被审任务下有一个审查任务：标题「审查：<任务标题>」、`kind: review`、`writeScope: []`、`source` 指向被审任务、验收 `["verdict APPROVED under the docs/DEVELOPMENT.md §1.1 standard, at the depth recorded in the latest dispatch"]`（深浅写在每一轮的派发批注里，不写进验收：验收只有人能改）。以 `harness` 身份提议，挂在进行中的任务下，引擎直接批准（`initialStatus`，`engine.ts`:417–428）。一个实现任务一个审查任务，每一轮是它的一次派发。
- 派审查：主 Agent `dispatch_task {id: <审查任务>, model, why, depth?, depthWhy?}`。`depth` 可以比派活时定的深；比它浅要写 `depthWhy`；有命中时低于全审被拒（`floor_requires_full`，列出命中）。审查者的工作目录是被审任务的工作树（只读，报告写 `.hourness/`），简报写被审的提交与基线、计划、交回摘要、上一轮的发现与这一轮的深浅：全审 `Check every acceptance item; "checked" must list every acceptance:<i> with the evidence you looked at.`；轻审 `Read the change; report only findings that meet one of the three blocking criteria, the rest as non-blocking.`。审查不占写任务的槽位。
- 全审的覆盖核对：全审的结论里 `checked` 没有覆盖每一条 `acceptance:<i>` 时，这一轮作废，harness 以同一个模型与理由重派一次（派发批注写「覆盖不全，重派」）；再不全就通知主 Agent，按 `blocked` 处理。
- 被审的提交：最近一次 `done` 交回的最新提交。审查通过时的证据 `{kind: 'check', ref: 'review <childId>', exit: 0, note: '<提交> · <全审|轻审> · patch <patch-id> · <provider>/<model>'}`，patch-id 取 `git diff <merge-base> <提交>` 经 `git patch-id --stable`。主干前进时核对底线清单内容用的就是这个提交（§3.8.4）。
- 不审：没有审查任务；主干前进时仍按底线清单核对（§3.8.4），所以「不审」碰不到底线清单里的内容。

#### 3.7.2 结论的规整

`normalizeVerdict(task, verdict)`（`src/execute/review.ts`）：挡路的发现（`blocking: true`）的 `criterion` 必须是下面三类之一，否则改为不挡路，并在批注里注明「改为不挡路：没有挂到三类标准上」：

| `criterion` | 含义（`docs/DEVELOPMENT.md` §1.1） |
| --- | --- |
| `acceptance:<i>` | 任务第 `i` 条验收没满足（`i` 必须是已有的下标） |
| `irreversible-loss` | 会造成不可逆损失（丢数据、毁掉检出或用户 profile、对外的动作）而没有预防 |
| `failure-plan` | 失败了没有途径发现、发现了没有恢复办法，或事后查不到原因 |

`verdict` 与规整后的发现不一致时（`APPROVED` 却有挡路的发现，或 `CHANGES_REQUESTED` 却一条都没有），以发现为准。`commit` 不是被审的提交时，这一轮作废，harness 以同一个模型与理由重派一次；再错就按 `blocked` 交主 Agent。

#### 3.7.3 收敛

审查任务上每轮批注一条 `第 <k> 轮：挡路 <b_k>，不挡路 <n_k> · <全审|轻审> · <childId>`，轮数与计数从这些批注读出（图是事实源）。计数从任务子树（被审任务、审查任务、挂在它们下面的待决）里最近一条人的历史条目（`actor: human`，或带 `relay` 的写入）之后算起（0.2 评审 F21）；`roundsSinceHuman(history)` 是审查、检查失败与目标整体的审查共用的一个纯函数，L2 钉住。

| 情形（`k` 为人的最近一条历史之后的轮数） | 处理 |
| --- | --- |
| `b_k = 0` | 审查任务以 `harness` 身份标完成，证据见 §3.7.1；发出 `hourness.review-passed` |
| 子树里还没有过人的条目，`k ≥ 2` 且 `b_k ≥ b_{k-1}` | 停下（不收敛） |
| 子树里还没有过人的条目，`k = 3` 且 `b_k > 0` | 停下（三轮用完；`question-11` A 的第三轮就是这一轮） |
| 人回过话之后，第一轮仍有 `b_k > 0` | 停下（人给的是一轮，不是又一个三轮） |
| 其余 `b_k > 0` | 事实通知给主 Agent（§3.4.3 的 `review` 事件）：挡路的发现列表，建议 `dispatch_task <被审任务>`；新的一次派发的简报带这些发现。不挡路的发现批注在被审任务上 |

停下分两步：

1. 停下标记：这一轮的轮次批注末尾加 `· 停下`。简报门禁认它（§3.5.1 `waiting_human`）：标记之后任务子树里没有人的历史条目，就拒绝派发这个任务与它的审查任务。人在对话里的回话由主 Agent 用 M3 的 `record_human_answer` 记下（`llm` 加人的原话，引擎给它人的权限），这条写入就解除标记；人在面板上的写入同样解除。标记写不进图（引擎拒绝或 I/O 错误）时重试 3 次，仍失败就在内存里记 `ctx.stopped`，本进程内照样拒绝派发，行健康降级，图恢复可写后补写。
2. 发出 `hourness.stopped`：循环板的默认条目「停下之后」把事实与一份四行草稿交给主 Agent（§3.7.4），由它在对话里问人。harness 自己不写给人的待决，也不出选项（`d-chat-not-cards`）。

人回话之后做什么由主 Agent 按人的话做，harness 不替它回写：再修一轮就重新派；回到设计就带人的原话把目标的阶段改回 `design`（M3 的 `main-agent-graph` 第 2 条只拦向前改阶段）；放弃就带人的原话把任务改为 `dropped`，它下面还开着的审查任务不用另关，完成门禁跳过祖先已废弃或被取代的任务（§3.9.3 第 1 条，0.2 评审 F22）。

同样的收敛规则用在三处：计划被 `checkPlan` 退回第 4 次（§3.3.2，worker 交回 `blocked`，不问人）；同一任务的 `check_commit` 因命令失败、在人的最近一条历史之后第 3 次没过（§3.8.3 第 9 步，标记写在任务上的检查失败批注里）；目标整体的审查（§3.9.4，标记写在目标上的轮次批注里）。

#### 3.7.4 要人定的事：交给主 Agent 去问

`askDraft(kind, facts)`（`src/execute/asks.ts`，纯函数）是 M7 里唯一写「要问人的事」的地方。它不写图，只产出两样交给主 Agent 的东西：事实（几轮、几处挡路、哪条命令、日志在哪、涉及哪些文件），与一份四行草稿 `{title, background, proposal, doubt, notTaken}`，主 Agent 可以照用，也可以按它知道的改。草稿在 L2 里必须过 M3 的 `proposalLineRefusal`（每行一处加粗、长度上限，M3 附录 §3.3）与 `plainWordsIn`（换词表，`src/graph/plain-question.ts`）。排版由 M3 的 `renderProposal` 做，格式再改只改 M3 一处（`d-chat-not-cards` 的批注：「把卡片显示规则放在一处」）。

| `kind` | 何时 | 草稿的推荐（只出一个方案） |
| --- | --- | --- |
| `review-stuck` | 审查停下 | 最后一轮挡路不超过 2 处：按这几处再修一轮；否则回到设计。「不做」一行写另一条与「放弃这件活」为什么不先选 |
| `check-stuck` | 检查第 3 次没过 | 带上三次失败的命令与日志再修一轮；「疑问」写「如果检查本身有问题，再修也白修」 |
| `acceptance-stuck` | 目标整体的审查停下 | 没过的条目不超过 2 条：拆成新活再做；否则回到设计 |
| `norm-ladder` | 周报里的规矩升降（§3.12.2） | 升级、转为真拦或降级，按数据给一个方向 |
| `floor-add` | 周报里降档后的返工集中在某类改动（§3.12.3） | 把这类路径加进「必须全审的改动」 |

例（`review-stuck`，最后一轮挡路 2 处）：

```text
title:      「写入范围的纯函数」审了三轮还没过
background: 审查**三轮都没过**，最后一轮还剩 2 处必须改的
proposal:   按这 2 处**再修一轮**，还不过就停下
doubt:      要是这件活的**要求本身不对**，再修也没用
notTaken:   不先**放弃这件活**，放弃了目标会少一块
```

交给主 Agent 的提醒（条目「停下之后」的正文，英文）：`<task> stopped: <k> review rounds, <b> blocking findings left (<files>). Put it to the person in your next batch with propose_to_human (kind question, parent <task>, sources [<review task>]); a draft that passes the checks: <五个字段>. Other work goes on. When everything left waits for the person, call await_human with the question ids.` 一次回复至多三件由 M3 的 `propose_to_human` 守（M3 附录 §3.4 第 4 条）；攒到哪一批由主 Agent 定（`d-design-onepage`：成批问，一次至多三题）。

主 Agent 用 `propose_to_human` 提的是挂在任务（或目标、规范）下的提议式待决，它在任务子树里，简报门禁同样按 `waiting_human` 拦，直到人回话。

### 3.8 合进主干前的检查与主干前进的核对（m7-5）

`d-main-agent-shell` 的分工：合并、先后、冲突、回退都是主 Agent 的 git；harness 只守主干前进的那一刻，并且自己跑检查、自己记证据。M7 由此有两样东西：主 Agent 调用的 `check_commit`（harness 在一个确定的提交上跑 `norm-merge-gate`），与执行边界上的 `trunk-advance-checked`（主干只能前进到检查过的提交）。0.2 的「门禁替主 Agent 压缩、快进、推送」与 `merge_task` 删去。

#### 3.8.1 检查清单写在哪：规范节点 `norm-merge-gate`

每张图一个规范节点，id 固定为 `norm-merge-gate`，命令写在它的 `acceptance` 里，每条一项；验收只有人的权限能改，所以清单变松要人同意（`docs/ORCHESTRATION.md` §7.6）。`parseGateNorm(acceptance)`（`src/execute/gate-norm.ts`，纯函数）认下面的写法，其余条目是说明文字，原样显示；导出 `GATE_LINE_FORMS` 供接管项目只提它认的写法（接管设计 §5.6 的 `changed` 写法由接管的 `bootstrap-ratchet` 加进这里）：

| 写法 | 含义 |
| --- | --- |
| `` `$ <命令>` `` | 检查命令，总是跑，按列出的顺序 |
| `` `$ <命令>` when <路径>[, <路径>…] `` | 改动碰到这些路径（写法同 `writeScope`）时才跑 |
| `` `setup $ <命令>` ``、`` `setup $ <命令>` when <路径>[, …] `` | 准备命令：新建工作树之后跑；监视文件（`when` 的路径，缺省 `package.json`、`package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`yarn.lock`）的摘要变了就再跑 |
| `` `patrol $ <命令>` `` | 只在夜间巡检里跑 |
| `` `push` `` | 主干前进之后推送、不强推。推送是主 Agent 的 git：harness 在核对通过的提醒里写上这一句，巡检报出没推上去的主干 |
| `` `only <路径>[, <路径>…]` ``（本稿新加） | 一次主干前进只改了这些路径时，不用跑命令：harness 核对改动确实只在这些路径里，记为通过。另外，两个提交只差这些路径时，一个的检查结果对另一个同样算数（§3.8.4） |

清单的摘要 `normDigest`：解析出的条目按次序写成规范化的 JSON，SHA-256 的前 12 位十六进制。检查记录带它；清单改了，旧的检查记录对新的主干前进不再算数。

本仓库的 `norm-merge-gate` 已由人批准（2026-10-29「B」）；加 `only docs/graph/` 一条要人同意（§13 ②）。别的项目里，图上没有 `norm-merge-gate` 时，M3 的设计阶段提醒加一句「Before release, propose norm-merge-gate under the goal: read the project's build and test setup and list each command as `$ <command>`.」，让它随放行一起被人同意（同 0.2；M3 的放行集合是目标子树里的全部提议，`src/graph/stage.ts` `releaseSet`）。图上没有它、或一条命令都解析不出时，`check_commit` 拒绝（`no_gate_norm`）；主干前进的核对同样不过，拒绝写明正路。

命令经 `child_process.spawn(command, {shell: true, cwd})` 运行（命令文本来自人批过的规范；Windows 上 `npm` 是 `.cmd`，要经 shell）。每条上限 30 分钟，超时结束整棵进程树（Windows 用 `taskkill /T /F /PID`）。输出写日志文件，不进内存全文。

#### 3.8.2 `check_commit` 与运行方式

参数 `{commit: string}`（提交号或能解析成提交的引用名）；输出 `{commit, status: 'started' | 'already-passed' | 'passed-by-paths', job?, tasks}`。只有主 Agent 能调。

检查作为外部后端的子 agent 运行（本包注册的 provider `hourness-gate`，同 0.2 §3.8.2：`registerProvider`，subagent:3256–3267；能力全为否，2789–2794；`start` 返回 `{id, result, dispose}`，1768–1790）：`subagents.startActivation({provider: 'hourness-gate', label: 'hourness check <短号>', request: {prompt, parent: 主 Agent, cwd: 仓库根}, signal, delivery: 'caller'})`。驱动器等它（`waitForChildren` 等外部激活的 `result`，subagent:1310–1313），人按停止或 `interrupt_agent` 能停它，主 Agent 这一回合不被占住。没在 L3 跑过（§15 U2）；不成立时 `check_commit` 在工具调用里同步跑，行健康记「检查以同步方式运行」。

#### 3.8.3 一次检查的步骤

门禁锁：一个仓库同时只有一次检查或主干全量检查在用门禁工作树。锁文件 `<git>/hourness/gate.lock`，用 M5 的 `src/data/lock.ts`（`withFileLock`，M5 §5.3、§8.3：独占创建、内容带 `pid`、`boot`、`token`、`holder`；`boot` 与本机当前开机时刻相差超过 120 秒判为陈旧；释放时只删 `token` 是自己的锁）。M7 用它的参数：等待每 5 秒一次、至多 60 分钟，之后 `gate_busy`；持锁的最长时间 6 小时，超过判为陈旧（高于最长的一次检查，0.2 评审 F24）；陈旧的锁改名为 `.stale-<毫秒>` 留着。M5 的模块还没合入时，E3 照 M5 §5.3 的契约建 `src/data/lock.ts`，M5 之后改为导入（M5 §8.3「先合入的一方建模块」）。headless、探针与另一个桌面版进程都受这把锁约束。

| 步 | 做什么 | 不成立时 |
| --- | --- | --- |
| 1 | 解析：`git rev-parse --verify <commit>^{commit}` 得到全号 `C`；读 `norm-merge-gate`，算 `normDigest`；`<git>/hourness/checks.jsonl` 里已有 `C` 在同一个 `normDigest` 下通过的记录时返回 `already-passed` | `not_commit`、`no_gate_norm` |
| 2 | 改动：`mb = git merge-base <主干> C`，`paths = git diff --name-only mb C`。`paths` 全在 `only` 路径里时直接写一条 `kind: 'only'` 的通过记录，返回 `passed-by-paths` | — |
| 3 | 这次检查覆盖哪些任务：`mb..C` 里提交信息尾注 `Hourness-Task:` 的值（`git log --format=%H%x00%(trailers:key=Hourness-Task,valueonly,separator=%x2C) mb..C`），列进结果；一个都没有时照样检查，结果里写「没有任务尾注：进主干之后不会记到任何活上」 | — |
| 4 | 取门禁锁；起外部激活（§3.8.2），返回 `started` | `gate_busy` |
| 5 | 门禁工作树 `.worktrees/hz-gate`（只建一次，分离头指针）：确认它在 `git worktree list` 里且是分离头指针，然后 `git checkout --detach --force C`、`git reset --hard`、`git clean -fd`（保留被忽略的 `node_modules` 与产物）。这三条破坏性命令只对这个由 harness 建、由 harness 写的目录执行；主 Agent 动过它（git 是它的）时，对不上就拒绝，不重置 | `gate_worktree_invalid` |
| 6 | 门禁工作树新建过、或监视文件的摘要与 `<git>/hourness/gate-setup.json` 记下的不同时，先跑准备命令并更新记录 | `setup_failed`（不计入失败次数） |
| 7 | 按顺序跑适用的命令：`$` 总跑；`when` 在 `paths` 碰到它的路径时跑；第一条失败就停 | `failed`（命令、退出码、日志最后 40 行、日志路径） |
| 8 | 写记录：先写 `<git>/hourness/checks/<C>/<时间>/result.json`（`{commit, tree, normDigest, base, mergeBase, ran: [条目序号], commands: [{line, exit, ms, log}], passed, tasks, at}`）与各条日志，再在 `<git>/hourness/checks.jsonl` 追加一行 `{commit, tree, normDigest, ran, passed, tasks, at, result, resultDigest}`（`resultDigest` 是 `result.json` 的 SHA-256），`fh.sync()`。放锁 | 写失败：结果当作没有检查，通知主 Agent 重试；行健康降级 |
| 9 | 通知主 Agent（§3.4.3 的 `check` 事件）：通过时「`<C>` passed the merge checks (<n> commands). Fast-forward <主干> with `git merge --ff-only <C>` in the main checkout<；then push without --force>.」；没过时写命令、退出码、日志最后 40 行与路径，并给 `tasks` 里每个任务批注 `检查第 <n> 次没过：<命令> exit <码> · <日志路径>`；同一任务在人的最近一条历史之后第 3 次没过时，这条批注末尾加 `· 停下` 并发出 `hourness.stopped`（§3.7.3）。指标流水记 `execute.check` | — |

检查记录只由 harness 写：路径在 `<git>/hourness/` 下，worker 的写入范围出不了自己的工作树，主 Agent 没有写文件的工具、shell 写入由 M3 的 `main-agent-no-write` 兜底；核对时同时要 `checks.jsonl` 的一行与它指向的 `result.json`，且摘要相符。剩下的风险（用一条认不出的 shell 写法伪造两份文件）记在 §6.5。

#### 3.8.4 `trunk-advance-checked`：主干前进的那一刻

主干是自动推进开始时主检出所在的分支，记在目标上的「自动推进已开始」批注里（§3.9.1），之后不随主 Agent 在主检出里切分支而变；没有这条批注时取上游的默认分支（`refs/remotes/origin/HEAD`），再没有就取主检出当前的分支。

适用：主 Agent 与它派发链里所有 agent 的 shell 调用（`Bash`、`bash`、`pwsh` 的 `command`，`terminal_send` 的 `text`，原生名经 `toNativeTool`）。执行行在 `tools/pre-execute` 与 `tools/post-execute` 上各注册一个监听器（tools:3321、3595–3624；`post-execute` 能拿到同一个 `exec`，按 `exec.callId` 配对，1267）。

允许主干前进到 `N`（`advanceOk(O, N)`，`src/execute/advance.ts` 纯函数，git 事实由参数给），`O` 是前进之前的主干：

1. `N` 是 `O` 的祖先（回退；会改写历史，M3 的快照先存了）；或 `N` 已在上游的主干上（`git merge-base --is-ancestor N refs/remotes/<上游>/<主干>`：别人已经推上去的主干，拉下来不算这台机器上的前进）。
2. 否则必须同时满足：
   - 检查：`checks.jsonl` 里有一条通过的记录 `R`，`R.normDigest` 等于当前清单的摘要，`R.commit` 与 `N` 只差 `only` 路径（通常 `R.commit` 就是 `N`），并且 `O..N` 碰到的 `when` 命令在 `R.ran` 里都跑过；或 `O..N` 的改动全在 `only` 路径里。
   - 底线清单：`O..N` 里落在某一条 `files` 路径里的每个文件 `f`，有一次通过的全审，它审的提交 `Rv` 里 `f` 的内容与 `N` 里一样（`git rev-parse Rv:f` 等于 `git rev-parse N:f`）；有 `deletes` 的那一条，`O..N` 删掉的每个文件在某次通过的全审里也是被删的（`Rv` 里没有、`Rv` 的 merge-base 里有）；尾注里的任务，若它最近一次派发的命令记录命中了 `commands` 或 `outside`，它最近一次审查是通过的全审。按内容核对，而不是按「哪个任务审过」：主 Agent 怎样压缩、变基、解冲突都可以，只要进主干的底线内容就是全审看过的那一份。

执行前（`tools/pre-execute`）：用 M3 的 `gitInvocations` 读出命令里的 git 调用，按目标仓库的状态判：

| 写法 | 判定 |
| --- | --- |
| 目标是主干且结果可预知：`merge --ff-only <rev>`、`reset [--hard\|--keep\|--merge\|--soft] <rev>`（主检出在主干上时）、`branch -f <主干> <rev>`、`update-ref refs/heads/<主干> <rev>`、`checkout -B`/`switch -C <主干> <rev>`、`fetch <远端或 .> <rev>:<主干>`、`push <远端> <rev>:<主干>`、`pull --ff-only`（目标是上游，按第 1 条） | 解析出 `N`，`advanceOk(O, N)` 不成立就拒绝 |
| 主检出在主干上、结果预知不了：`commit`、不带 `--ff-only` 的 `merge`、`rebase`、`cherry-pick`、`revert`、`am`、不带 `--ff-only` 的 `pull` | `commit` 且暂存的改动（`-a` 时取已跟踪文件的改动、带路径时取这些路径）全在 `only` 路径里：放行（执行后再核）。其余拒绝 |
| 别的 | 放行，交给执行后的比对 |

拒绝的纠偏（四段）：事实 `<主干> would move from <O> to <N> without a passed merge check (<缺什么>).`；越界 `The main branch moves only to a commit the harness checked.`；正路 `Build the commit off the main branch (for example in the task's worktree), run check_commit <commit>, then fast-forward <主干> with git merge --ff-only <commit>.`，底线清单不满足时另写 `dispatch a full review of the task that changed <f>`；例外 `none`。进违规流水，规则 id `execute:trunk-advance-checked`。

执行后（`tools/post-execute`，成功与失败的调用都看）：重读主干的值 `N'`。没变就什么都不做。变了：

- `advanceOk(O, N')` 成立：在 `<git>/hourness/advances.jsonl` 追加 `{from: O, to: N', agent, callId, check: R.commit | null, only, tasks, at}`；对 `O..N'` 里尾注出现的每个任务，以 `harness` 身份写证据 `{kind: 'commit', ref: <带尾注的那个提交>}` 与 `R` 的每条命令一条 `{kind: 'test', ref: <命令>, exit: 0, note: '<日志路径>'}`（只按路径通过时写一条 `{kind: 'check', ref: 'only <路径>', exit: 0}`），状态从已批准或进行中转为完成，批注「进主干 `<N'>`（从 `<O>`）· 检查 `<R.commit>`」；任务已经完成的只批注。任务的工作树干净就 `git worktree remove`（不带 `--force`；分支留着，删不删由主 Agent 定）。发出 `hourness.trunk-advanced`；指标流水记 `execute.advance`。写图失败重试 3 次，仍失败行健康降级，`advances.jsonl` 里已有全部事实，对账与巡检会补写（§3.9.6、§3.11.2）。
- 不成立（执行前没认出来的写法，例如脚本里的 git）：不写任何证据；违规流水记一条（`execute:trunk-advance-checked`，`effect: 'detected-after'`），`advances.jsonl` 记 `{ok: false, missing}`，记复盘，指标流水记 `execute.unchecked-advance`；通知主 Agent：`<主干> moved from <O> to <N'> without a passed merge check (<缺什么>). No evidence was recorded. Run check_commit <N'>; if it fails, fix or revert on the main branch.`。之后 `check_commit <N'>` 通过时，harness 按上一条补写证据，批注与 `advances.jsonl` 写明「检查在前进之后」，晨报的「例外」一节列出它。这样做而不要求把主干退回去：主干可能已经推送，退回去要强推，那是收不回的动作；前进之后补的检查让主干的内容有据可查，次序上的违规留在违规流水、复盘与晨报里。

每一步开始时再比一次：执行行给主 Agent 装的 `agent/pre-step` 监听器读主干的值，与上一次记下的值（上一次执行后比对或上一步记的）不同，而这段时间里没有哪次执行后比对认领这次变化时：变化落在某次 agent 的 shell 调用期间（执行后比对没有触发，§15 U20）按上一条「不成立」一支处理；没有落在任何 agent 的调用期间（人自己在终端里推进、别的工具）记 `advances.jsonl` `{by: 'outside'}` 与指标 `execute.advance {external: true}`，不算违规、不给证据，巡检汇总（§3.11.2）。

代价：主 Agent 与派发链里的每次 shell 调用前后各一次、主 Agent 每一步一次 `git rev-parse refs/heads/<主干>`（`execFile`，不经 shell）。

规则板的代码规则目录登记 `execute:trunk-advance-checked`（规则板设计 §10.1、§10.7）。

#### 3.8.5 底线清单的判定写法（`norm-review-floor`）

`norm-review-floor` 的每条验收是一类改动的人话描述（接管设计 §5.7 定的形状：类名加冒号，后面是具体的路径或动作）。harness 只认写在反引号里的判定写法，附在这一行末尾：

| 写法 | 命中条件 |
| --- | --- |
| `` `files <路径>[, <路径>…]` `` | 改动的文件落在这些路径里（写法同 `writeScope`：以 `/` 结尾的是目录，按段比较） |
| `` `deletes` `` | 改动里有删掉的文件 |
| `` `commands <词>[, <词>…]` `` | 这次派发里 worker 一方跑过以这些词开头的命令（git 调用规整为 `git <子命令> <参数>` 再比，`git -C x push` 算 `git push`） |
| `` `outside` `` | worker 一方的文件工具目标或 shell 命令里的绝对路径在它的工作树以外（被拦下的也算） |

没有判定写法的条目 harness 判不了，不强制全审，行健康与规则板上这一条旁边写「这一条 harness 判不了」。本仓库已批准的四条都还没有判定写法，加上它们要人同意（§13 ①）；没加之前，`norm-review-floor` 对本仓库不起作用，这一点写进一页放行稿。

#### 3.8.6 桌面版与沙盒

worker 与检查都不碰桌面版：简报禁止，L4 的步标 `L4-batch` 攒到批次（`docs/DEVELOPMENT.md` §1.1），由编排方按 `risk-shared-desktop` 的常设授权排队用，同一时间一个持有者。规则板 0.5 不再有租约（规则板设计 §10.7）：0.2 里引用 `dsh-desktop`、`dsh-profile:<名字>` 租约与重活排队的地方都删去。沙盒 profile：H1 让 `npm run probe` 在工作树里自动建指向这个工作树的临时 profile，用完删除，几个工作树并行跑探针各用各的 profile 与运行目录〔推断，§15 U9〕。

### 3.9 自动推进与完成门禁（m7-3，`d-driver`、`d-auto-drive`）

#### 3.9.1 开始、恢复与人的停止

0.2 的 `/drive`、`/drive stop` 删去。驱动循环仍是 DSH 的 goal 加 goal-round-driver；谁开始、何时恢复改为下面这样。

放行的认法：焦点目标（M3 `goalOf(focusOf(session))`）的历史里，最近一条把 `stage` 改为 `release` 的写入（M3 附录 §9 第 7 条：`record_human_answer` 以 `llm` 带人的原话写入，`reason` 以「人在对话里同意（record_human_answer <callId>）」开头；人在面板上改的也算），它的 `at` 是这次放行的键。目标已批准、从来没有阶段（没走设计循环）的，不自动开始：主 Agent 在对话里问人，人一句话之后它可以自己 `create_goal`（要当前回合有人的输入，tool-goal:49–52、292），之后的门禁照样适用。

执行行给主 Agent 装的 `agent/pre-step` 监听器（每一步）与 `agent/created`（持有者会话被创建或恢复时）判断，按序第一条成立的：

| 情形 | 做什么 |
| --- | --- |
| 不是持有者、或没有 `goals` 服务、或焦点目标没放行或已关闭 | 什么都不做 |
| 这次放行还没有「自动推进已开始」批注，DSH 里没有 goal 或上一个已 `complete` | 发出 `hourness.design-released`；循环板条目「设计放行之后」的 harness 动作 `execute.start-drive`：`goals.create(agent, {objective, maxGoalRounds: 500})`（goal:635–650，服务层不查人的授权；授权来自人在对话里的同意，M3 已核对原话），在目标上以 `harness` 身份批注 `自动推进已开始 · 放行 <at> · goal <goalId> · 主干 <分支>`，指标流水记 `execute.goal {op: 'start'}`；条目的提醒告诉主 Agent 接着分解与派活、不用等人。`GOAL_ALREADY_EXISTS`（goal:639）时跳过 |
| 有批注，goal 为 `active` 但未 arm（会话恢复或宿主重启之后，DSH 在 `agent/created` 时一律 disarm，goal:594–596） | `goals.resume(agent, ref)`（goal:686–699），发出 `hourness.host-started`（重启对账，§3.9.6）。理由：重启不是人决定停下；人要的是「放行之后自己推进到底」 |
| goal 为 `paused`（人在目标条上、用 `/goal pause`、或取消了一个目标轮的回合，驱动器据此暂停，goal-round-driver:223–242） | 不恢复。派发状态提醒写「The person paused the drive; it resumes when they press resume on the goal bar or run /goal resume.」（模型不能恢复人暂停的 goal，tool-goal:352；`/goal resume` 是 DSH 自带的命令，command-goal:11、149–151） |
| 有批注，DSH 里没有 goal（人清掉了，`goal/changed` 的 `clear`，goal:736–753），目标没完成 | 不重建。提醒写「The person cleared the drive. If they ask you to continue, call create_goal with this objective: …」 |
| goal 为 `blocked`，原因码 `hourness-waiting-human`，列出的待决都已拍板或废弃 | `goals.resume`（§3.9.5） |
| goal 为 `blocked`，其他原因码 | 不恢复；提醒写明原因与「when the person says to go on, call update_goal resume」（被阻塞的 goal 在有人的输入的回合里模型可以恢复，tool-goal:343–352）；`round-limit` 另写先 `update_goal edit` 把 `max_goal_rounds` 加 500（轮次用尽时 `resume` 抛错，goal:697） |

一次放行只自动开始一次：批注是幂等的键。宿主在 `create` 与写批注之间重启时，下一次判断看到 DSH 里已有 goal，只补写批注。

`objective`（英文，至多 2000 字符，每一拍的目标轮提示词都带它，goal-round-driver:11–19）：

```
Project graph goal <id>: <title>
Done when: 1. <acceptance> 2. ...
Not in scope: <nonGoals>
Drive it through the project graph without waiting for the person: dispatch ready tasks with dispatch_task (choose a model and say why), dispatch their reviews the same way, answer worker requests with answer_worker, integrate with git, run check_commit on the commit you want on <trunk>, then fast-forward <trunk> to it. Put matters only the person can decide to them in the chat (at most three at a time); when everything left waits for them, call await_human. Mark this goal complete only when the completion gate passes; it lists what is missing.
```

#### 3.9.2 每一拍

投影注入沿用 M2.3（目标轮必注入），派发状态提醒在变化时注入（§3.5.4），M3 的阶段提醒在推出的阶段为 `decompose`、`execute`、`merge` 时写本阶段做什么（M7 给 `src/design/stage-notice.ts` 补这三段，`release` 一句改为「The design is released and the harness has started the drive: decompose into tasks with dispatch attributes and dispatch them; do not wait for the person.」，M3 附录 §2.3 写明由 M7 改）。三条都追加在 `next()` 之后，不经收件箱，不破坏驱动器的预约（L3 实测，`docs/ORCHESTRATION.md` §2.1）。

`merge` 阶段的提醒写合入的做法（主 Agent 可以换别的做法，harness 只看主干前进的那一刻）：`To integrate a reviewed task: in its worktree rebase onto <trunk> (dispatch a worker if it conflicts), squash into one commit whose message starts with "<id>: <title>" and ends with "Hourness-Task: <id>", run check_commit on it, then git merge --ff-only it in the main checkout and push without --force. Several tasks may share one commit with one trailer line each. Commit the graph files you changed through the graph tools the same way (on a branch, check_commit, fast-forward); when norm-merge-gate has an only line that covers docs/graph/, you may commit them on <trunk> directly.`

驱动器在每一拍之前等主 Agent 的后代（worker、审查、检查）都静下来（goal-round-driver:130–133，subagent:1296–1330）。

#### 3.9.3 完成门禁

执行行在 `tools/pre-execute` 上看 `update_goal`，`action === 'complete'` 且调用方是主 Agent 时算 `goalCompletion(graph, goal, git)`（`src/graph/execute-stage.ts` 的纯函数加 git 的几项事实）：

1. 目标子树里每个任务都是完成、废弃或被取代；祖先任务已废弃或被取代的任务跳过（0.2 评审 F22：废弃一件活时，它下面开着的审查任务不必另关）。
2. 每个写入范围非空、已完成的任务都有 harness 写的 `commit` 证据，且这个提交的内容在主干上（它是主干的祖先，或它的尾注出现在主干上的某个提交里）。
3. 子树里没有已批准或进行中的待决（人的与 agent 的、选项式与提议式都算）。
4. 子树里没有提议节点。
5. 目标上最新一条整体审查的批注（`验收审查第 <k> 轮：APPROVED · 挡路 0 · <childId> · @<主干提交> · pins: <目标>@<摘要>`）存在，pins 没过期，每个任务的进主干证据都是它记下的主干提交的祖先，最新一条不带 `· 停下`。
6. 没有活着的 worker、审查、整体审查或检查属于这个目标。

不成立：拒绝（工具错误回到模型，goal 保持 active，tools:3337–3353），列出前 10 项缺口与下一步（例 `the goal's acceptance review has not passed: dispatch_task <goal id> with a model and why`）。成立：放行，并在内存里记放行凭据 `{agentId, goalId, graphRevision, callId, at}`；`goal/changed` 的 `complete` 配对到 10 分钟内的凭据时，以 `harness` 身份把图上的目标标为完成，证据 `{kind: 'check', ref: 'hourness completion gate', exit: 0, note: '<任务数> tasks, <进主干次数> advances, acceptance review <childId>, call <callId>'}`；配不到（例如 `/wish off` 之后、别的插件直接完成）就不写完成，只批注「goal 在完成门禁之外完成」并记复盘（同 0.2）。指标流水记 `execute.completion-gate`（通过与否、缺口数）。

不是主 Agent 的会话不受这道门禁约束。`update_goal` 的 `blocked` 放行，harness 在 `goal/changed` 里给图上的目标批注阻塞原因。

#### 3.9.4 目标整体的审查

不建图节点（同 0.2：挂在目标下的任务提议要人批准，`initialStatus`）。由主 Agent 派：`dispatch_task {id: <目标 id>, model, why}`，模型与理由同样记录（§3.1.3）；深浅固定为全审，`checked` 必须覆盖目标的每一条 `acceptance:<i>`，每条引用证据（提交、检查日志、文件）。

- 什么时候派：目标子树里的任务都关了（发出 `hourness.tasks-closed`，循环板条目「目标下的活都关了之后」提醒主 Agent 派），或完成门禁只差第 5 条时（拒绝信息写明）。目标上已有对当前主干提交的整体审查、或有活着的整体审查时拒绝（`busy`）。
- 激活：`startActivation({provider: 'spawn', label: 'hourness acceptance <目标> round <k>', childId: 'hz-<目标 id>-acc-a<k>-<6 位>', request: {prompt: [简报], parent: 主 Agent, cwd: 主检出, agentOptions, outputSchema: hourness-review-v1, maxDepth}, delivery: 'caller'})`，登记表角色 `acceptance-review`，写入一律被拒（报告写 `<主检出>/.hourness/`）。
- 记录、收敛、停下与之后由主 Agent 拆新活，同 0.2 §3.9.4；停下时发出 `hourness.stopped`（`kind: 'acceptance'`），由主 Agent 问人（§3.7.4 的 `acceptance-stuck`）。

#### 3.9.5 都在等人、空转与轮次上限

- `await_human {questions: string[], summary: string}`（主 Agent 的工具）：每个 id 必须是目标子树里已批准或进行中、决定者为人的待决（含 `propose_to_human` 提的提议式待决）；否则 `invalid`。harness `goals.block(agent, ref, {code: 'hourness-waiting-human', message: 'Waiting for the person: question-3, question-7. <summary>'})`（goal:720–735；原因码小写连字符，goal:76–83）。
- 恢复：人在对话里回话，主 Agent 用 `record_human_answer` 记下；之后的每一步，执行行的监听器看到原因里列的待决都已拍板或废弃，就 `goals.resume`，提醒里写一行「已恢复自动推进」。人在面板上拍板时，M3 的回写把结果作为通知送给持有者（M3 附录 §2.4「面板拍板的回写」），通知叫醒空闲的主 Agent，它的下一步里做同一判断；M7 因此不改 `src/graph/panel-row.ts`。人补充或否掉（待决仍开着）时不恢复，主 Agent 改方案再问。
- 空转：按主 Agent 会话在内存里记每个目标轮开始时的（图修订号、执行活动计数：派发、交回、请求、检查、主干前进）。连续 3 个目标轮都没变时 `goals.block(…, {code: 'hourness-idle-rounds', …})`，记复盘，提醒主 Agent 在对话里说明；人说继续，主 Agent `update_goal resume`。重启后计数从零开始。
- 轮次上限：驱动器到上限时以 `round-limit` 阻塞（goal-round-driver:135–140）。harness 在 `goal/changed` 里记复盘，晨报单列；人说继续时主 Agent 先加上限再恢复。上限是汇报事件，不是预算（`docs/ORCHESTRATION.md` §4.3）。

#### 3.9.6 宿主重启后的对账

循环板条目「重启之后」的 harness 动作 `execute.reconcile`（事件 `hourness.host-started`），也在完成门禁拒绝时顺带做一次：

1. 找出目标子树里进行中、最新一条派发批注的 `childId` 既不在登记表里、也不是活 agent（`agents.get`，agent:596）的任务。
2. 这次派发已有交回批注：什么都不做。
3. 否则从 worker 的会话推出交回：执行行注册的会话投影 `hournessHandback` 折叠最后一次成功的 `structured_output` 调用的参数，用 `sessionQuery.observeSession(childId)` 读（subagent:2339–2352）。读到就按 §3.6.2 处理（幂等）〔会话事件的形状未核实，§15 U6〕。
4. 读不到：批注「第 <n> 次在宿主重启时丢失」，派发状态提醒列为「丢失」，下一次派发的简报写「上一次丢失：分支 hz/<id> 上已有提交 <列表>，先检查再接着做」。
5. 主干前进的证据：`advances.jsonl` 里 `ok` 的记录，图上缺证据的任务补写；检查记录里通过、主干已在那个提交而 `advances.jsonl` 没有记录的（宿主在执行后比对之前退出），按 §3.8.4 的执行后一支补判。
6. 等人的 goal 不动。
7. DSH 的 goal 已 `complete`、图上的目标没有完成证据：重算 `goalCompletion`。成立就以 `harness` 身份标目标完成，证据 `{kind: 'check', ref: 'hourness completion gate (reconcile)', exit: 0}`（重算本身是 harness 自己的依据，K2 成立；0.2 评审 F25）；不成立就在提醒里列缺口，「when the gaps are closed and the person asks to go on, call create_goal again」。

不会重复派发：对账只写批注与提醒，派发仍由主 Agent 决定。

### 3.10 四答晨报（m7-6）

`fourAnswers(input)`（`src/report/four-answers.ts`，纯函数）。输入：指标流水在时取它的本期事件；不在时取图、审计流水（违规、用量、派遣）、`<git>/hourness/` 下的检查与前进记录（同规则板 R7 的做法：流水合入之前从原始记录算同样的数）。`hourness_report {kind: 'morning'}` 与人发的 `/hourness` 都调它，文字相同。给人看的字串过 `plainWordsIn`，不出「门禁」「验收」「标定」。

| 节 | 内容 |
| --- | --- |
| 一、目标（效果是） | 每个未关闭的目标一行：推出的阶段；任务完成 x/y，本期进主干 m 次；完成检查差几项（前 3 项）；整体审查的逐条结论（有时） |
| 二、规划（任务分解） | 本期 agent 新增与废弃的任务数（前 5 条标题）；返工（重开）次数与节点；过期的派发；卡住的：等主 Agent 回应超过 1 小时的请求、空转与轮次上限、停下的审查与检查 |
| 三、理由（为什么） | 本期 agent 自己定的事（前 5 条，一句理由）；计划批准次数；worker 问了几次、超时几次；审查深浅：全审、轻审、不审各几件，因为碰到必须全审的清单被改成全审的几件 |
| 四、架构（怎么做） | 已采纳、还没验证的决定数；本期被推翻、被取代的决定 |
| 在等你回话的 | 主 Agent 问了还没回的几件，最早一件等了几天；自动推进是不是因此停着 |
| 检查与审查 | 合入前的检查跑了几次、第一次就过的比例、没过的按命令计；审查轮数分布、挡路发现数 |
| 花了多少 | 积分与高峰占比，按模型；主 Agent 与各子 agent 各占多少（经公共库的计价服务；GLM 包不在时只计次数与 token） |
| 用了哪些模型 | 主 Agent 的模型；子 agent 按角色（干活、审查、整体审查）列模型与次数；审查与被审的活用同一个模型的次数 |
| 例外 | 违规按规则计；没经检查的主干前进；新增的复盘；在完成检查之外完成的 goal |

默认至多 40 行，每节先给数字、再给至多 5 条明细，其余写「还有 N 条」。同样的输入得到逐字相同的输出（L2 钉住）。

### 3.11 循环板上的默认条目与巡检（m7-6、m7-7、m7-8）

#### 3.11.1 默认条目

0.2 的运维会话、`/patrol on|off|status` 与本包直接调 DSH `schedule` 的做法删去（`d-one-main-agent`）。下面十条是 M7 交给循环板的默认条目（§2.5），都只读。时间条目由循环板用 DSH 的定时服务触发（DSH 已带一次、每隔、每天、每周、cron 五种触发，投递回原会话，重启后仍在，`.agents/tasks/design-context.md` 最后一节），投到持有者会话。提醒正文是英文、固定，`<…>` 由事件的载荷填。

| id | 标题（人话） | 触发 | 动作 |
| --- | --- | --- | --- |
| `execute.release` | 设计放行之后：主 Agent 开始自己推进 | `hourness.design-released` | harness `execute.start-drive`；提醒 `The design of <goal> is released and the drive has started. Decompose it into tasks with dispatch attributes and dispatch them with dispatch_task; do not wait for the person.` |
| `execute.handback` | 一件活交回之后：派审查 | `hourness.handback` | 提醒 `<task> is handed back (attempt <n>, <commits> commits). Review depth: <depth><, raised to full: <floor hit>>. Dispatch its review: dispatch_task <review task> with a model and why.` |
| `execute.reviewed` | 审查过了（或按理由不审）之后：做出要进主干的提交，检查后合入 | `hourness.review-passed`、`hourness.review-skipped` | 提醒 `<task> is ready to integrate. Build the commit for <trunk> with the trailer "Hourness-Task: <task>", run check_commit on it, then fast-forward <trunk>.` |
| `execute.stopped` | 审查或检查一再不过停下之后：在对话里问人 | `hourness.stopped` | 提醒：§3.7.4 的正文与草稿 |
| `execute.tasks-closed` | 一个目标下的活都关了之后：派目标整体的审查 | `hourness.tasks-closed` | 提醒 `All tasks of <goal> are closed. Dispatch its acceptance review: dispatch_task <goal> with a model and why.` |
| `execute.trunk` | 合进主干之后：在主干上跑一遍完整的检查 | `hourness.trunk-advanced` | harness `execute.trunk-check`（§3.11.2 的主干检查，所有 `$` 与 `when` 命令都跑，不按路径筛；同一时刻只排一次，排着时再来的事件并进去）；没过时提醒 `The full check on <trunk> <commit> failed: <command> exit <code> (<log>). Fix it or revert.` |
| `execute.restart` | 重启之后：接上停了的活 | `hourness.host-started` | harness `execute.reconcile`（§3.9.6）；有丢失或补写时提醒列出 |
| `operate.morning` | 每天 08:30：晨报 | 每天 08:30，本机时区 | 提醒 `Scheduled morning report (hourness). Call hourness_report with kind "morning" and reply with its text unchanged. Then put at most three matters that wait for the person to them with propose_to_human.` |
| `operate.weekly` | 每周一 09:00：周报 | 每周一 09:00 | 提醒 `Scheduled weekly report (hourness). Call hourness_report with kind "weekly" and reply with its text unchanged. Put its proposals (at most three) to the person with propose_to_human, one plan each.` |
| `operate.patrol` | 每天 02:30：夜间巡检 | 每天 02:30 | 提醒 `Scheduled patrol (hourness). Call hourness_report with kind "patrol". For each finding that is planned work, act on it or dispatch it; keep matters for the person for your next batch. Do not write files.` |

时刻的取舍：02:30 不在 GLM 高峰里，人多半不在；高峰档位（`d-peak-mode`）下推迟哪些由循环板与规则板定，「合进主干之后」的全量检查与巡检里的主干检查是重活，按它们的规矩排。提醒的来源不是 `user`，不算人直接说的话，`create_goal` 这类要人授权的操作不会因它执行（tool-goal:49–52）。

#### 3.11.2 巡检做什么

`hourness_report {kind: 'patrol'}` 的工具体执行 `patrolRun`（`src/operate/patrol.ts`）：harness 先做只读与只由它写的事，再把其余列成发现交给主 Agent。git 的增删改是主 Agent 的事（`d-main-agent-shell`），所以 0.2 里巡检自动删工作树与分支的部分改为列成发现。

| 项 | harness 自己做的 | 列成发现的 |
| --- | --- | --- |
| 主干检查 | 当前主干提交在 24 小时内没有过一次通过的全量检查时，经门禁锁（§3.8.3）在门禁工作树上跑全部 `$` 与 `when` 命令；结果写进检查记录（`kind: 'trunk'`）；锁被占时这次跳过 | 失败的命令与日志（记复盘「主干变坏」，交付指标的恢复时长从这里起算）；连续两次跳过 |
| 巡检命令 | 跑规范里的 `patrol $` 命令（本仓库：`npm run deps:check`） | 退出码非 0 时输出的前 40 行（大版本升级属于必须问人的第 4 类） |
| 证据 | `advances.jsonl` 里有、图上缺的证据补写 | 完成却没有 harness 进主干证据的写任务 |
| 工作树 | — | 任务已关、干净的 `.worktrees/hz-*`（主 Agent `git worktree remove`）；不干净的（列文件，可能有没交回的工作） |
| 分支 | — | 任务已完成、内容已进主干超过 14 天的 `hz/<id>` 与 `hz/<id>@<n>`（主 Agent 删；删之前 M3 的快照先存，`norm-review-floor` 正文的例外：清理已合入的不算「删东西」）；任务已关、内容没进主干的分支 |
| 主干 | — | 规范有 `push` 而主干领先上游的提交数；近 7 天主干上既没有前进记录、也不在上游的提交数（harness 以外的改动；自举的指标「人亲手改代码的次数」，`docs/ORCHESTRATION.md` §10.1） |
| 图 | — | 进行中超过 24 小时、没有活着派发的任务；过期的派发；等人超过 3 天的待决；图的校验错误 |
| 经验与记忆 | M5 的 `hygiene` 里能安全自动做的由经验行自己做 | 其余 `hygiene` 发现 |
| 自身 | 每次运行追加一行 `<git>/hourness/operate/patrol.jsonl` | 距上次巡检超过 26 小时（漏跑） |

巡检发现的计划内工作，主 Agent 挂在相关的已批准特性或任务下（直接批准）；找不到可挂的就提议，它等人点头，进下一批。指标流水记 `operate.patrol`（各类发现的条数、harness 做了什么）。

### 3.12 规矩阶梯与周报（m7-8）

#### 3.12.1 规范节点上的量法

同 0.2：规范节点正文的标签 `级别：记忆 | 提示词 | 阶段提醒 | 门禁`、`模式：影子 | 生效`、`规则：<规则 id>, …`（M3 的 `labeledSections` 解析）。没有 `规则：` 标签的规范不进阶梯，周报只报个数。

#### 3.12.2 提议的阈值

`ladderProposals(norms, violations, decided)`（`src/report/ladder.ts`，纯函数），阈值同 0.2：升一级（级别低于门禁，近 7 天拦截不少于 3 条）、影子转生效（近 14 天影子记录不少于 20 条且人没标过误判）、降一级（门禁级、近 28 天拦截与影子都是 0）。

变的是怎样问人：harness 不再提待决。周报列出提议与数据，`askDraft('norm-ladder', …)` 给每条一份四行草稿；主 Agent 把它们与 §3.12.3 的底线清单提议一起，每周至多 3 件，用 `propose_to_human`（`sources` 带规范节点）问人。人否掉过的（规范节点下最近 28 天有一张提议式待决，批注里有「人在对话里否掉」）不再提。人同意之后的改动（改规范正文的级别、写门禁代码）是主 Agent 的计划内任务；改规范的验收要人的原话（规则只由人写）。

#### 3.12.3 人的负担、质量对照与降档后的返工（`question-27` B、`question-38` C）

只量系统里看得到的数，每周报，附前 4 周的值看走向（`docs/CHARTER.md` §8）：

| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 每周被问几次 | 本周主 Agent 交给人的事项数（`propose_to_human` 成功返回的次数，三种 `kind` 合计） | 指标流水；没有时数主 Agent 会话里的工具结果与图上的提议式待决 |
| 每次要读多少字 | 上一项各次的题目与四行的字数，另报本周晨报与周报的总字数（中文按字、英文按词） | 同上；报告自身 |
| 回话等多久 | 交给人到 `record_human_answer` 记下回话的时长，中位数与最长 | 同上 |
| 人怎么回的 | 原样同意、补充、否掉各占几成（`record_human_answer` 的三种说法，`d-chat-not-cards` 第五点） | 图的历史 |
| 因人的决定返工几次 | 本周的重开里，重开之前 7 天内其祖先或来源有人的再拍、推翻或取代的次数 | 图的历史 |
| 对照：检查第一次就过 | 本周 `check_commit` 第一次就通过的任务比例 | 检查记录 |
| 对照：审查发现 | 本周每个进主干的任务的挡路发现数（中位数）与审查轮数，按深浅分开 | 审查批注 |
| 对照：返工率 | 本周重开次数除以本周完成的任务数 | 图的历史 |
| 降档后的返工 | 有效深浅为轻审或不审、进主干后 14 天内被重开或有 `source` 指向它的修复任务的件数，除以同期降档的件数；按改动文件的顶层目录分组 | 派发批注、证据与图的历史 |

底线清单的增类提议（`floorProposals`，`src/report/floor-proposals.ts`）：近 28 天某一组降档后的返工不少于 2 件、且这组的路径不在 `norm-review-floor` 的任何 `files` 里时，提议把这组路径作为一条加进清单（`askDraft('floor-add', …)`，例「降档的 12 件里 2 件后来返工，都改了 `src/graph/`」）。放松清单（删一类）只在人提出时做。

#### 3.12.4 周报

`weeklyReport(input)`（`src/report/weekly.ts`）：人的负担与人怎么回的、质量对照、降档后的返工、交付的四个数（§3.13）、规矩阶梯与底线清单的提议（至多 3 件，带草稿）、审查收敛（各轮次分布、停下的次数）、复盘与候选（本周新增的复盘、候选经验与候选练习题的条数）、练习题回归（本周有运行时：回归集一次做对的比例与上一次的差）、M5 的 `stats`（有经验行时）。数字由 harness 算，模型只转述；输入来源同晨报。

### 3.13 交付的四个数（m7-9）

`dora(input)`（`src/report/metrics.ts`）。部署在本项目里指「主干经核对前进一次」：

| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 交付频率 | 每周 `ok` 的主干前进次数 | `advances.jsonl`（指标流水的 `execute.advance`） |
| 变更前置时间 | 任务第一次派发到它进主干的时长，中位数 | 派发批注与进主干证据 |
| 变更失败率 | 进主干后 14 天内，任务被重开、或出现 `source` 指向它的修复任务、或主干全量检查失败且失败的提交是它之后的第一个，三者之一的前进所占比例 | 图的历史；检查记录（`kind: 'trunk'`） |
| 恢复时长 | 主干全量检查从失败到下一次通过的时长；批次 L4 失败到修复进主干的时长 | 检查记录；L4 批注 |

### 3.14 标定集：回归与消融守门（m7-10）

#### 3.14.1 角色

〔用户 2026-10-29〕系统有没有用，由自举与真实项目里的试用来检验（`dogfood`、`field-trial`）。仓库里的标定集只回答一个窄问题：某次 harness 或提示词改动有没有让结果变差。它不证明系统有效，文档与报告里都这样写（`docs/ORCHESTRATION.md` §10.5 随 P4 改写）。

#### 3.14.2 结构

`tests/calibration/<任务>/` 的结构不变（`fixture/`、`prompt.md`、`task.json`、`check.mjs`），`task.json` 加三个字段：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `set` | `regression`、`capability` | 回归集：预期接近全过，掉分即回退的信号；能力集：起步通过率低是预期，饱和后转入回归集（阅读摘要 §2.1 第 11 篇） |
| `origin` | `{kind: 'seed' \| 'retro', node?, commit?}` | 题目从哪来：起步题，或自举中的复盘节点与当时的提交 |
| `isolation` | 固定为 `fenced` | 运行带读圈禁（§3.14.3） |

现有两题 `feature-parse-duration`、`bugfix-csv-quotes` 归回归集（两档模型 12/12，已饱和，`docs/ORCHESTRATION.md` §10.5.2）；M3 的 `interview-expense-log` 归能力集。新题只从自举中真实的失败来（§3.14.5）。

`result.json` 加：`env`（权限模式、步数与时间上限、桌面运行时版本、是否高峰、圈禁命中次数、`ablation` 的开关状态）、`infra`（基础设施失败的类别，例 `spawn EPERM`、沙盒启动失败；这类运行不算模型失败，阅读摘要 §2.1 第 12 篇）、`valid`（取 `ablation` 的事后扫描结论与圈禁记录，§3.14.3）。`results.json` 的汇总按集分开报 pass@1 与 pass^k（同一格 k 次全过的比例），无效的运行不进汇总。

#### 3.14.3 防泄漏（`risk-calib-read`）

三层。物理隔离与事后扫描归已批准的任务 `ablation`（`question-30` B，验收第 1 条「标定运行目录在仓库外，被测模型的读取够不到验收脚本与别的试次（事后扫事件流核对）」）；M7 只加读圈禁，并消费扫描的结论：

1. 读圈禁（预防，M7 的 P4）：标定覆盖层加一行只在标定时加载的插件 `scripts/calibrate/read-fence.mjs`（与 `limits.mjs` 同层，不属于 bundle）。在 `tools/pre-execute` 上：文件读工具（`Read`、`read`、`Glob`、`glob`、`Grep`、`grep`、`read_image`、`str_replace_editor` 的 `view`）的目标解析后不在本次 `ws/` 之内就拒绝；shell 命令文本里出现解析后在 `ws/` 以外的绝对路径、`..` 越出 `ws/` 的相对路径、或 `calibration-runs`、`tests/calibration`、`check.mjs` 字样时拒绝。这是只在标定里生效的严规则，误伤只影响标定。每次拒绝记进运行目录的 `fence.jsonl`。
2. 事后扫描（发现，`ablation` 做）：每次运行结束后扫这次的事件流，工具调用参数里有 `ws/` 以外的路径就判越界、写明证据。M7 把它的结论写成 `result.json` 的 `valid`：越界或圈禁命中过的运行 `valid: false`，不进汇总。圈禁拦下了也照样判无效（模型试图越界本身就让这次运行的结果不可信）。`ablation` 的验收第 1 条若只是在它的对照运行里核对一次、没有把扫描做成每次运行之后的一步，P4 在 `run-calibrate.mjs`（P4 本来就改它）里加这一步并把结论写进 `valid`（0.2 评审 F26）。
3. 物理隔离（`ablation` 做）：运行目录移到系统临时目录，被测模型够不到验收脚本与别的试次。

`check.mjs` 与参考解本来就不进 `ws/`（运行器只复制 `fixture/`，验收脚本以独立进程在模型结束后运行，`docs/ORCHESTRATION.md` §10.5.1）；运行目录搬出仓库之后，圈禁仍管从 `ws/` 往外读（系统临时目录里同批的别的试次、按绝对路径读回仓库）。

#### 3.14.4 消融

消融开关由 `ablation` 加在 `scripts/calibrate/`（只在标定时加载），M7 不另加开关。M7 的用法：标定回归与消融的时机由 agent 定（§12），结果按同一提交的基线对比，报每格的差，进周报的「标定回归」一行，花费进晨报。

#### 3.14.5 从自举失败到标定题

复盘节点（§3.15）正文的 `候选标定题：` 一栏非空时，主 Agent 可以在任务 `m7-10` 下提一个任务（计划内，挂在进行中的任务下直接批准），种类 `test`，写入范围 `tests/calibration/<新题>/`，验收固定为：夹具在出问题时的提交上缩减而来、不超过 30 个文件；`check.mjs` 对原样的夹具不通过、对参考解通过；`task.json` 的 `origin` 指向复盘节点，`set` 为 `regression`。收题的门槛：同类失败出现两次以上，或这次失败让人出手救场。

### 3.15 自举与试用中的留痕

自举（`dogfood`）的验收是「卡住、返工、要人救场的地方就是要改的地方，记成节点」。harness 在下面这些事件发生时自动记一个复盘节点（`retro`，挂在事件所属的目标下，直接批准，`docs/ORCHESTRATION.md` §2.9）：

| 事件 | 在哪发现 |
| --- | --- |
| 审查停下；目标整体的审查停下 | §3.7.3、§3.9.4 |
| 检查第 3 次没过 | §3.8.3 |
| 没经检查的主干前进 | §3.8.4 |
| 交回的改动里有写入范围以外的文件（写入门禁没拦住的写法） | §3.6.2 第 2 步 |
| 计划被退回 4 次 | §3.3.2 |
| goal 因空转或轮次上限阻塞 | §3.9.5 |
| goal 在完成门禁之外完成 | §3.9.3 |
| 停下标记没写进图 | §3.7.3 |
| 派发在宿主重启时丢失 | §3.9.6 |
| 主干变坏；主干上有 harness 以外的提交 | §3.11.2 |
| 同一任务同一规则的拦截达到 3 次 | 写入门禁的计数 |

正文的固定标签同 0.2：`触发：`、`任务：`、`会话：`、`提交：`、`经过：`（harness 记得的事实）、`恢复：`、`候选经验：`、`候选标定题：`（标签名不改，M5 §3.6 按它读）。后两栏由主 Agent 处理完之后补（LLM 可以改复盘的正文）；harness 只写事实。`field-trial` 沿用这个格式。

### 3.16 指标流水（`metrics`）

人批准的 `metrics`：每个项目一份只追加的事件流水，只记数与引用、不记对话正文；每个数由 harness 写，模型写的数不算；晨报、周报与各种指标都从它算。指标流水的设计还没成稿，写入接口与通用字段（时刻、项目、会话、来源行）由它定。M7 只有一个出口 `emitMetric(event)`（`src/execute/metrics.ts`，运维行导入同一个），在下表的时刻调用；接口到位之前它什么都不做，M7 的事实照旧在图、会话日志与 `<git>/hourness/` 的记录里，报告从那里算（§3.10）。写失败不影响任何判定，每个宿主进程告警一次，行健康不降级。

| 事件 | 何时 | 内容 |
| --- | --- | --- |
| `execute.dispatch` | 每次派发成功 | 角色、任务或目标、次数、`childId`、provider、模型、思考档位、`sameAsMain`、审查另带 `sameAsWorker`、声明的审查深浅、理由所在的节点与历史序号 |
| `execute.dispatch-refused` | `dispatch_task` 被拒 | 码（`slots_full`、`scope_busy`、`unknown_model`……） |
| `execute.plan` | 计划被退回、交给主 Agent、批准、打回、超时 | 任务、版本、结果、步数、等了多少毫秒 |
| `execute.ask` | `ask_main` 回答或超时 | 任务、等了多少毫秒、结果 |
| `execute.handback` | 交回处理完 | 任务、次数、状态、`stopReason`、提交数、文件数、用时、范围外文件数 |
| `execute.review-depth` | 算出有效深浅；主 Agent 派审查时改深浅 | 任务、声明的、有效的、命中底线清单的哪几类 |
| `execute.review` | 每一轮审查的结论规整之后 | 任务、轮次、深浅、模型、挡路数、不挡路数、改为不挡路的条数 |
| `execute.stop` | 停下 | 节点、`kind`、轮数 |
| `execute.check` | 每次 `check_commit` 结束 | 提交、任务、通过与否、`kind`（`commands`、`only`、`trunk`）、每条命令的序号、退出码与毫秒、是否跑了准备命令、等锁多少毫秒 |
| `execute.advance` | 主干前进且核对通过 | 从、到、任务、按检查还是按路径、是否检查在前进之后 |
| `execute.advance-refused` | 执行前拒绝 | 缺什么（检查、清单变了、`when` 命令、底线内容） |
| `execute.unchecked-advance` | 执行后发现没经检查的前进 | 从、到、缺什么 |
| `execute.goal` | 自动推进开始、恢复、阻塞、完成 | 目标、操作、原因码、恢复的原因（重启、人回话） |
| `execute.completion-gate` | 每次完成门禁判定 | 目标、通过与否、缺口数 |
| `execute.acceptance-review` | 每一轮目标整体的审查 | 目标、轮次、模型、结论、挡路数 |
| `execute.reconcile` | 每次对账 | 丢失、补处理、补写证据的条数 |
| `execute.loop-entry` | 没有循环板时 M7 自己执行一条条目 | 条目 id、事件键、是否送达、推迟原因 |
| `operate.report` | 每次 `hourness_report` | 种类、行数、字数 |
| `operate.patrol` | 每次巡检 | 各类发现的条数、harness 做了什么、主干检查的结果 |

违规（五条 worker 规则与主干前进的核对）照旧进违规流水（与 guard 同形的 `ViolationRecord`），指标流水的设计决定要不要同时进它（规则板设计 §10.5 也把这件事交给那份设计）。token 与积分不由 M7 记：用量流水按请求记了会话、模型与积分，指标流水按会话 id 把它与 `execute.dispatch` 的 `childId` 连起来。

## 4. 宿主契约与 rc.3 证据

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据并经 L3 或 L4；「L3 实测」指派发可行性验证的探针（`scripts/probe/probe-dispatch.mjs`，场景 `glm-dispatch`、`glm-goal`、`goal-headless`）跑过；「新用」指 M7 第一次用，实现时补进接口对照表与 `src/shared/dsh-min.ts`。文件都在 `reference/dsh-desktop-0.2.1-rc.3/` 下。

| 契约 | M7 的用法 | 文件与符号（行） | 状态 |
| --- | --- | --- | --- |
| `subagents.startActivation({provider, label, childId?, request{prompt, parent, cwd?, agentOptions?, outputSchema?, maxDepth?}, signal, delivery})` | 派 worker、审查、整体审查与检查 | `dsh-subagent/lib/index.js` `startActivation`（3036–3048）、`startLocal`（1391–1477） | L3 实测（`delivery: 'parent'`） |
| 预留 `childId` 已有会话时 `DUPLICATE_CHILD` | `childId` 带随机后缀 | 同上 `startLocal`（1430–1437） | 实读 |
| `request.cwd` 为绝对路径时原样用；子会话头 `cwd` 取父会话 | worker 在工作树里；写入门禁按工作目录解析 | 同上 `resolveDirectory`（1523–1527）、`childSessionMeta`（346–356） | L3 实测 |
| `agentOptions` 合并在父路由之上；父路由取会话的 `requestHeader().config`，没有时取 agent 的 `options`；换了 provider 或模型而没给档位时清掉父的档位 | 主 Agent 选的模型（§3.1.3）；缺省 provider 的读法 | 同上 `parentAgentOptionsForDelegation`（293–303）、`resolveChildAgentOptions`（315–329）；`startLocal` 读 `provider`、`model`、`reasoningEffort`（1400–1404） | `model` L3 实测；其余实读 |
| `llm.listModels(provider)`：适配器给的目录，按 id 去重；目录成员不约束路由；`resolveModelInfo(provider, model)` 带 `reasoning.efforts` | 模型目录的核对与派发状态提醒里的模型列表 | `dsh-llm/lib/index.js` 服务名 `llm`（1816）、`listModels`（2080–2101）、`resolveModelInfo`（2111–2116） | 实读，新用 |
| `outputSchema` → 子 agent 得到 `structured_output`；有 schema 却没提交、回合 `completed` 时结算为 `error` | 交回；`ask_main` 必须在工具调用里等 | 同上 `attachStructuredRuntime`（889–960）、`captureLocalResult`（1098–1117） | L3 实测（交回）；结算为 `error` 实读 |
| `delivery: 'caller'`：不附交回指引、不送结算通知 | 交回只到 harness | 同上（1460、2048–2063、472–476） | 实读〔U1〕 |
| `ACTIVATION_LIMIT_REACHED`；`maxActiveSubagents` 默认 8 | `slots_full` | 同上 `reserve`（1046–1048）、Config（2979–2980） | 实读 |
| `resolveMaxDepth` | worker 不能经派发再派发 | 同上（3023–3030、279–283） | 实读 |
| `waitForChildren(parent)`：等所有常驻后代（本地与外部） | 驱动器每拍之前等 | 同上（1296–1330）；`dsh-goal-round-driver/lib/index.js` `drive`（130–133） | 实读；本地子 agent 随 `glm-goal` 间接实测 |
| `registerProvider`；外部后端能力全为否；`start` 返回 `{id, result, dispose}`；外部激活也有派发链 | 检查的 provider `hourness-gate` | 同上（3256–3267、2789–2794、1483–1520、1768–1790、1844） | 实读〔U2〕 |
| `subagents.sendMessage`：子到父 steer；父到子常驻时 steer、否则冷恢复；只认直接父子 | 通信 | 同上（1538–1550、2119–2135、2080–2117、2216–2231、1584–1590、1658–1662） | 子到父 L3 实测；父到子实读〔U3〕 |
| 冷恢复出的激活不带 `outputSchema` | `worker-message-live-only`；登记表不认它 | 同上（2094–2095、2141–2189） | 实读 |
| `send_message`、`interrupt_agent` 工具 | 主 Agent 改方向、中断 | `dsh-tool-subagent-control/lib/index.js`（21–91） | 实读 |
| `listChildren` 与 `sessionQuery.observeSession(id)` | 重启对账 | `dsh-subagent/lib/index.js`（2339–2352）；`dsh-web-app/cordis.patch.yml`（27） | 实读〔U6〕 |
| 会话 id 在 `[A-Za-z0-9._-]` 内原样落成文件名 | `childId` 的字符集 | `dsh-session-persistence-jsonl/lib/index.js`（866） | 实读 |
| `goals.create`（已有未完成的 goal 时 `GOAL_ALREADY_EXISTS`；服务层不查人的授权）、`get`、`edit`、`pause`、`resume`（`active` 且已 arm 时拒绝；轮次用尽时拒绝）、`complete`、`block`、`clear`；`agent/created` 时一律 disarm | 自动推进的开始与恢复（§3.9.1）、`await_human`、空转阻塞 | `dsh-goal/lib/index.js` `create`（635–650，639）、`get`（611–614）、`edit`（657–669）、`pause`（676–678）、`resume`（686–699，696–697）、`complete`（706–712）、`block`（720–735）、`clear`（736–753）、构造函数里的 disarm（594–596）、`decodeBlockReason`（76–83） | `create`、`get` L3 实测；其余实读 |
| `goal/changed`：载荷 `{change: {operation, ref: {id, revision}, goal?}}` | 放行凭据配对；人清掉、暂停的认法；轮次上限的复盘 | 同上（872–877、763） | 事件 L3 实测；载荷实读 |
| 驱动器：目标轮提示词只含目标原文与轮次；每拍前等后代；到上限 `round-limit`；人取消目标轮的回合时暂停 goal；`goal/changed` 时重排 | `objective` 的写法；人暂停的来源 | `dsh-goal-round-driver/lib/index.js` `renderGoalRoundPrompt`（11–19）、`drive`（108–170）、`agent/status`（223–242）、`goal/changed`（243–246） | L3 实测（`glm-goal`） |
| `update_goal`：`complete`、`blocked` 要人的输入或当前目标轮；`edit`、`pause`、`resume` 要人的输入；模型不能恢复人暂停的 goal；`create_goal` 要人的输入；工具说明写明会话恢复或 fork 之后 goal 被 disarm | 完成门禁的位置；人说继续时模型恢复被阻塞的 goal；人清掉之后模型重建 | `dsh-tool-goal/lib/index.js` `hasDirectHumanInput`（49–52）、`requireDirectHuman`（62–65）、`completionAuthority`（72–80）、`guidance`（196）、`create_goal`（292）、`resume` 与 `GOAL_TOOL_RESUME_PAUSED`（343–352） | 完成门禁 L3 实测；其余实读 |
| `/goal pause`、`/goal resume` | 人自己停下与恢复（提醒里告诉主 Agent） | `dsh-command-goal/lib/index.js`（11、146–151） | 实读 |
| `tools/pre-execute`（waterfall，`deny` 即工具错误、工具体不执行）；`exec.callId` | 五条 worker 规则、主干前进的执行前判定、完成门禁 | `dsh-tools/lib/index.js`（3321、3337–3353；`exec.callId` 1267） | 已用 |
| `tools/post-execute`：拿到同一个 `exec` 与结果，可以替换内容或追加上下文 | 主干前进的执行后比对与证据（§3.8.4） | 同上 `postExecute`（3595–3624） | 实读，新用 |
| `tools.register` 与输出 schema 子集；执行按名解析 | 七个 M7 工具；工具体自查调用方 | 同上（2974–2984、3227–3260、3637–3640） | 已用 |
| `system-prompt/assemble`（agent 作用域 waterfall） | 按角色过滤工具面 | `dsh-system-prompt/lib/index.js`（365–405） | 已用 |
| `agent/pre-step` 与 notice 追加 | 派发状态提醒；放行的认法；空转计数 | `dsh-agent-loop/lib/index.js`（901–925） | 已用 |
| 活 agent 的 `followup`、`steer` | harness 通知与条目提醒送进主 Agent | 同上（806–811） | `followup` 已用；`steer` M3 新用 |
| `agents.get`、`roots`、`list`、`agent/created` | 映射、对账、持有者的创建 | `dsh-agent/lib/index.js`（596、614、623、574–589） | 已用 |
| `sessionProjections.register` / `snapshot` / `stateOf` | `hournessHandback`；M3 的 `hournessMainAgent` | `dsh-session-projection/lib/index.js`（68、126、141） | 已用 |
| `userQuestions.ask` 拒绝子 agent（`DELEGATED_CALLER`） | worker 的问题只能经主 Agent | `dsh-user-questions/lib/index.js`（534） | 实读 |
| headless 在自己 agent 第一次静止空闲时退出 | 探针里驱动循环跑在第二个根 agent 上 | `dsh-headless/lib/index.js`（349–351） | L3 实测 |

不再用的：`commands.register`（没有 `/drive`、`/patrol`）；`schedule.create`、`list`、`delete`（时间条目由循环板触发）；`subagents.interrupt`（`/drive stop` 删去，停下用 DSH 的目标条与 `interrupt_agent`）。

本仓库图引擎的事实（main `d32468c` 实读，M7 依赖而不改）：

| 事实 | M7 的用法 | 位置 |
| --- | --- | --- |
| 任务提议只在父节点是已批准或进行中的特性、任务时直接批准；待决、风险、复盘在开放的父节点下直接批准；有人的权限的提议直接批准 | 审查任务挂在实现任务下；整体审查不建节点；复盘挂在目标下 | `src/graph/engine.ts` `initialStatus`（417–428）、`OPEN_PARENT_TYPES`（104） |
| LLM 与 harness 能改的字段不含 `acceptance`；有人的权限的写入不受限 | `no_acceptance` 的提示；审查任务的验收不写深浅；人的原话由主 Agent 带着写 | `engine.ts` `LLM_EDITABLE`（101）、`privileged`（154）、`planEdit`（578–617） |
| 任何身份都能批注；批注不带 `relay` | 轮次批注、停下标记、证据旁的说明 | `engine.ts` `planChange` 的 `comment` 分支（472 起）、`relay` 对批注丢弃（150） |
| 节点文件里不认识的字段报错 | M7 不加节点字段 | `src/graph/format.ts`（91） |
| 阶段的读法与放行集合 | `derivedStage`、设计阶段提议 `norm-merge-gate` 随放行批准 | `src/graph/stage.ts` `effectiveStage`（90）、`releaseSet`（172）、`labeledSections`（61） |

M3 设计中、还不在 main 的接口（M7 依赖，按 M3 附录 0.3）：`isMainAgent` 与持有者记录、`mainAgentOf`（§2.4）；`simpleCommands`（`src/guard/shell.ts`）、`gitRisk`、`takeSnapshot` 与请 M3 导出的 `gitInvocations`（`src/guard/git-snapshot.ts`，§2.5）；`propose_to_human`、`record_human_answer`、`renderProposal`、`proposalLineRefusal`（§3.3–§3.5）；`plainWordsIn`（`src/graph/plain-question.ts`，§2.8）。

## 5. 数据与状态

| 数据 | 事实源 | 谁写 | 读的一方 | 寿命 |
| --- | --- | --- | --- | --- |
| 任务的派发属性、验收、非目标 | 图 | 主 Agent 写派发属性；人写验收 | 全部 | 随 git |
| 一次派发（`childId`、次数、基线、模型与理由、审查深浅与理由、简报摘要、pins） | 图：派发批注；会话：主 Agent 的工具调用、worker 的首条消息 | harness | 对账、过期判定、报告 | 图随 git；会话随 DSH |
| 登记表 | 模块内存，只由本进程的派发写入（§3.1.4） | 执行行 | 写入门禁、`worker-message-live-only`、通知 | 进程内 |
| worker 一方的命令记录 | `<git>/hourness/execute/<任务>/<childId>.commands.jsonl` | 执行行 | 底线清单的判定 | 不入库；巡检报出 30 天以上的 |
| 计划与批准 | worker 会话里 `submit_plan` 的参数；任务正文的计划一节；批准批注 | worker；harness | 主 Agent、写入门禁、后续派发 | 会话；图 |
| 请求与回答 | 双方会话；等待中的在内存 | worker、主 Agent；harness 登记 | 双方 | 会话；内存随进程 |
| 交回 | worker 会话里 `structured_output` 的参数；交回摘要批注；`<git>/hourness/reports/<childId>.md` | worker；harness | 主 Agent、审查、对账 | 会话；图；不入库 |
| 审查结论、深浅与轮数；停下标记 | 审查任务上每轮的批注与完成证据；任务上的检查失败批注；目标上的整体审查批注；写不进图时内存的 `ctx.stopped` | harness | 收敛、简报门禁、主干前进的底线核对、报告 | 图 |
| 检查记录 | `<git>/hourness/checks.jsonl` 与 `checks/<提交>/<时间>/`（`result.json`、日志） | harness | 主干前进的核对、对账、巡检、报告 | 不入库 |
| 主干前进记录 | `<git>/hourness/advances.jsonl`；任务上的证据；提交尾注 `Hourness-Task` | harness；尾注由主 Agent 写 | 对账、巡检、交付指标 | 不入库；图与 git 随仓库 |
| 门禁锁 | `<git>/hourness/gate.lock`（陈旧的改名为 `.stale-<毫秒>`） | 执行行 | 检查、主干全量检查 | 用完删除 |
| 准备命令的监视摘要 | `<git>/hourness/execute/<任务>/setup.json`、`<git>/hourness/gate-setup.json` | 执行行 | 派发、检查 | 不入库 |
| 两张清单 | 图：`norm-merge-gate`、`norm-review-floor` 的验收 | 人（LLM 提议） | 检查、主干前进的核对、简报、报告 | 随 git |
| goal | DSH 会话日志（`goal/change`） | harness（开始、恢复、阻塞）、驱动器、主 Agent（`update_goal`）、人（目标条） | 驱动器、完成门禁 | 随会话 |
| 「自动推进已开始」 | 图：目标上的批注（放行的键、goal id、主干分支） | harness | 自动推进的判断、主干的认法 | 随 git |
| 放行凭据、空转计数、没有循环板时排着的条目提醒 | 内存 | 执行行 | 完成门禁、空转阻塞、条目执行 | 进程内；丢了的后果见下 |
| 循环板的默认条目 | 代码里的常量表（`entries.ts`）；循环板显示 | 本包 | 循环板、M7 的退路执行者 | 随版本 |
| 巡检运行记录 | `<git>/hourness/operate/patrol.jsonl` | 运维行 | 漏跑判断 | 不入库 |
| 复盘 | 图（`retro`） | harness；主 Agent 补正文 | 人、M5、收题 | 随 git |
| 指标 | 指标流水（`metrics` 设计定）；之前按需从上面各项算 | harness | 报告 | — |
| 工作树与分支 | git（`.worktrees/hz-*`、`hz/*`、`hz/*@<n>`、`.worktrees/hz-gate`） | harness 建；worker 提交；主 Agent 合并与删除 | 检查、巡检 | 任务完成时删干净的工作树；分支由主 Agent 删 |

K4 的核对：编排状态都在图上、会话日志里或 `<git>/hourness/` 的只追加记录里；内存里只有登记表、等待中的请求、放行凭据、空转计数、`ctx.stopped` 与排着的条目提醒。丢了的后果：登记表丢了，活着的 worker 变只读；等待中的请求随 worker 一起结束；凭据丢了，对账重算完成门禁补写（§3.9.6 第 7 步）；空转计数从零开始；`ctx.stopped` 只在图写不进时用，图恢复后补写；排着的提醒丢了，主 Agent 下一步的派发状态提醒仍列出同样的事（在跑、等审查、可以合入）。

处处留痕：每个动作只在它所属的地方记一个事实，别处引用。派发的事实在会话日志里，图上的批注引用 `childId`；检查的明细在 `result.json`，图上的证据引用日志路径；主干前进在 `advances.jsonl` 与提交尾注里，图上的证据引用提交号；消息全文在会话日志里，图上只有计数。

## 6. 失败预案

按 `d-failure-plans`：按操作写清怎样发现、怎样重试、怎样恢复、事后从哪里查。「交人」都经主 Agent 在对话里问，或进晨报的「例外」。

### 6.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| `subagents` 不在 | 执行行不注册工具 | 行健康 inactive「没有 subagents 服务」 |
| `goals` 不在 | 派发照常；不自动推进；完成门禁不装 | degraded「没有 goal 服务，不能自动推进」 |
| `llm` 服务不在 | 派发照常，模型不核对目录 | degraded「读不到模型目录」 |
| 检查的 provider 注册失败 | `check_commit` 在工具调用里同步跑（§3.8.2） | degraded「检查以同步方式运行：<原因>」 |
| 设计行（M3）不在 | 工具注册，调用时拒绝 | degraded |
| 图行不在 | 工具注册，调用时 `not_found` | 会话健康说明 |
| 循环板不在 | 事件条目由本行执行，时间条目不跑（§2.5） | 写明，不降级 |
| 指标流水的接口不在 | `emitMetric` 什么都不做 | 不报 |
| `norm-review-floor` 有没有判定写法的条目 | 那几条不强制全审 | 写明第几条，不降级 |
| 某个工具注册失败 | 撤掉本行全部注册 | inactive，写明原因 |

运维行：`hourness_report` 注册失败时 inactive；循环板不在时只写明「到点的报告不会出现」。

### 6.2 运行期

| 操作 | 失败的情形 | 怎样发现 | 重试 | 恢复 | 留痕 |
| --- | --- | --- | --- | --- | --- |
| `dispatch_task` | 门禁不过；`unknown_model`、`unknown_provider`；槽位满；工作树或准备命令失败；`startActivation` 抛错 | 工具错误，码与 `hint`（模型错时 `hint` 列出目录） | 不自动重试；`DUPLICATE_CHILD` 换后缀重试一次 | 主 Agent 按 `hint` 改；准备命令失败时新建的工作树已删 | 主 Agent 会话；准备命令日志；`execute.dispatch-refused` |
| 模型目录 | `listModels` 抛错或为空 | 返回值 | — | 放行，批注写「没有核对」 | 派发批注 |
| 派发之后写图失败 | 引擎拒绝或 I/O 错误 | 重试仍失败 | 3 次，0.2、0.8、2 秒 | worker 照跑；对账补写 | 告警一次；degraded；会话里有派发事实 |
| worker 跑着 | 卡住、跑偏 | 派发状态提醒的用时；面板 | — | 主 Agent `send_message` 改向或 `interrupt_agent`；人在目标条上暂停 | 双方会话 |
| `submit_plan` | 不合格；主 Agent 30 分钟不回应 | 工具结果 | worker 改了再交，至多 3 次 | 第 4 次 → `blocked`；超时 → `plan-pending` | worker 会话；正文与批注 |
| `ask_main` | 20 分钟不回应 | `timeout` | — | worker 按自己写的假设继续 | 交回的 `assumptions` |
| 交回 | 结算为 `error`、`aborted`、`max-tokens`；结构化结果语义不对；pins 过期；改动出了写入范围 | 交回处理 | — | 批注与通知；过期的不建审查任务；范围外的文件记违规与复盘，交给审查看 | 任务批注；复盘 |
| 命令记录 | 写不进 | 追加失败 | — | 这次派发按全审处理 | 批注「命令记录不全」 |
| 审查 | 引了别的提交；全审覆盖不全；不收敛 | 规整与收敛判定 | 重派一次（同一模型与理由） | 不收敛 → 停下标记，主 Agent 问人 | 审查任务的轮次批注 |
| 停下标记 | 图写不进 | 引擎的返回 | 3 次 | 本进程 `ctx.stopped` 拒绝派发；图恢复后补写 | degraded；复盘；晨报「例外」 |
| 交给主 Agent 的问人提醒 | 主 Agent 不活或高峰停着 | 送达失败 | 留到它下一步 | 派发状态提醒里也列着停下的任务 | `execute.loop-entry` |
| `check_commit` | 不是提交；没有清单；锁被占 60 分钟；门禁工作树对不上；准备命令失败；命令失败；记录写不进 | 工具结果或检查的报告 | 主 Agent 再调；同一任务第 3 次失败 → 停下 | 锁的陈旧判定后重建；门禁工作树被主 Agent 动过时由它恢复或删掉（harness 下一次新建） | `result.json`、日志、任务批注、`execute.check` |
| 主干前进（执行前） | 没检查、清单变了、`when` 命令没跑、底线内容没全审 | `advanceOk` | — | 拒绝，纠偏给正路 | 违规流水；`execute.advance-refused` |
| 主干前进（执行后） | 认不出的写法让主干前进了 | 前后两次读主干对不上、`advanceOk` 不成立 | — | 不写证据；通知主 Agent 补检查；补检查通过后补证据，没过就修或退回 | 违规流水；`advances.jsonl`；复盘；晨报「例外」 |
| 写证据 | 引擎拒绝或 I/O 错误 | 重试仍失败 | 3 次 | `advances.jsonl` 里有事实，对账与巡检补写 | degraded |
| 推送 | 网络、凭证、非快进 | 主 Agent 自己的命令结果 | 主 Agent 定 | 巡检报出主干领先上游 | 巡检发现 |
| 自动推进开始 | `goals.create` 抛错（`GOAL_ALREADY_EXISTS` 以外） | 抛错 | 下一步再判一次，至多 3 次 | 仍失败：提醒主 Agent 在对话里告诉人，人一句话后它 `create_goal` | degraded；`execute.goal` |
| 自动恢复 | `goals.resume` 抛错（轮次用尽等） | 抛错 | — | 提醒主 Agent 按原因处理（加上限再恢复） | 复盘 |
| 完成门禁 | 有缺口 | 工具错误列出缺口 | — | 主 Agent 按缺口做 | 主 Agent 会话 |
| 目标完成 | `complete` 不经完成门禁 | 配不到凭据 | — | 不写完成证据；对账重算 | 目标批注；复盘 |
| 主 Agent 给已结束的 worker 发消息 | 冷恢复 | `worker-message-live-only` 拒绝 | — | 正路是重新派发 | 违规流水 |
| 空转、轮次上限 | 3 拍没进展；`round-limit` | 内存计数；`goal/changed` | — | goal 阻塞，复盘，人说继续时主 Agent 恢复 | 复盘；goal 事件 |
| 宿主重启 | worker、审查、检查、等待中的请求都丢 | 「重启之后」条目 | — | §3.9.6 | 批注「丢失」；复盘 |
| 主干全量检查 | 主干变坏 | 「合进主干之后」条目、巡检 | — | 主 Agent 派修复或退回 | 检查记录；复盘 |
| 规则板排队 | 派发被高峰或人的规则推迟 | 规则板的门拒绝，带单号 | 单解除时规则板叫回原 agent（规则板设计 §6.3） | 主 Agent 先做别的 | 规则板的流水 |

### 6.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 主干前进 | 主干变了，推送之后对外 | 执行前只放行到检查过的提交；执行后发现绕过的；回退由主 Agent 用 git 做，改写历史之前 M3 存快照 |
| 推送 | 对外 | 由主 Agent 做；M3 的快照覆盖 `push --force` 一类；规范写了 `push` 时提醒里写「不强推」 |
| 门禁工作树的 `reset --hard`、`clean -fd` | 丢这个目录里的改动 | 只对 `.worktrees/hz-gate`，执行前核对它在 `git worktree list` 里且是分离头指针；它只由 harness 写 |
| 删任务工作树 | 丢没提交的工作 | 只在任务完成且工作树干净时删，不带 `--force`；分支留着 |
| worker 在自己分支上的 `reset`、`rebase`、`checkout -- <路径>` 等 | 丢它自己没提交的改动 | M3 的 `takeSnapshot` 先存（§3.2.4） |
| 重开时旧分支改名 | — | 只改名不删，`hz/<id>@<n>` 留着 |
| 删合入过的分支 | 丢只在分支上的提交 | 由主 Agent 做；M3 的快照先存 |
| 门禁锁的陈旧判定 | 误判会让两次检查同时用门禁工作树 | 开机时刻差 120 秒以上或持锁超过 6 小时才判陈旧；陈旧的锁改名保留；检查写记录前核对门禁工作树的 HEAD 仍是要检查的提交，不是就作废这次结果 |
| 写 `<git>/info/exclude` | 改本地 git 配置 | 只追加 `/.worktrees/`、`/.hourness/`，先查是否已有 |

### 6.4 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `dispatch_task.id` | 是 | 节点 id 格式；图里的写任务、审查任务或目标 | `invalid`、`not_found`、`bad_task` |
| `dispatch_task.model` | 是 | 1–200 字符，不含空白；目录非空时必须在目录里 | `invalid`、`unknown_model` |
| `dispatch_task.why` | 是 | 1–300 字符，单行化 | `invalid` |
| `dispatch_task.provider` | 否 | 已注册的 provider id | `unknown_provider` |
| `dispatch_task.reasoningEffort` | 否 | 1–40 字符；模型的档位读得到时必须是其中之一 | `invalid` |
| `dispatch_task.review` | 否（只给写任务） | `depth` 为 `full`、`light`、`skip`；后两者 `why` 1–300 字符 | `invalid` |
| `dispatch_task.depth`、`depthWhy` | 否（只给审查任务） | `full`、`light`；比声明的浅时 `depthWhy` 必填；底线命中时只能 `full` | `invalid`、`floor_requires_full` |
| `dispatch_task.context` | 否 | 至多 4000 字符 | `invalid` |
| `dispatch_task.quick` | 否 | 布尔；条件见 §3.3.1 | `invalid` |
| `answer_worker.*` | 同 0.2 | `request` 为 `R-` 加 6 位；`verdict` 为 `approve`、`revise`；`text` 1–4000 字符 | `not_found`、`invalid` |
| `check_commit.commit` | 是 | 1–200 字符，不以 `-` 开头（不能被当成 git 选项），`git rev-parse --verify <x>^{commit}` 能解析 | `invalid`、`not_commit` |
| `await_human.questions`、`summary` | 是 | 1–20 个等人的待决；1–500 字符 | `invalid` |
| `submit_plan`、`ask_main` | 同 0.2 | §3.3.2；各 1–2000 字符 | 工具错误逐条列出 |
| 交回结构、审查结论 | — | DSH 按 schema 校验（subagent:941–948）；harness 再查提交号、路径、`criterion`、全审的覆盖 | 不合格的项记进批注；审查按 §3.7.2 规整 |
| 提交尾注 `Hourness-Task` | — | 值是图里的任务 id；一个提交可以有多行 | 不认识的 id 忽略并在前进批注里写明 |
| `norm-merge-gate` 的条目 | — | §3.8.1 的写法；其余是说明 | 一条命令都没有时 `no_gate_norm` |
| `norm-review-floor` 的条目 | — | §3.8.5 的判定写法；路径同 `writeScope`；`commands` 的词非空 | 写错的判定写法当作没有，行健康写明第几条 |
| 循环板事件的载荷 | — | M7 自己产生，类型在 `entries.ts` | — |
| 工具的其他字段 | 不收 | — | `invalid`（rc.3 不校验原样注册的工具参数，工具体自己查） |

### 6.5 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 主 Agent 不写文件 | 工具面没有写工具（M3）；`main-agent-no-write`（M3） | `question-26` C |
| 主干只前进到 harness 检查过的提交 | 执行前：`trunk-advance-checked` 的判定；执行后：主干值的比对；巡检：没有前进记录的提交 | 人定的那一处（`d-main-agent-shell`）；预防、发现与留痕三层，因为执行前的读法是启发式 |
| 检查的结果只来自 harness 自己跑的命令 | `check.ts` 是唯一写 `checks.jsonl` 的地方；核对时要记录与 `result.json` 摘要相符 | K2；模型自报的不算。残余风险：一条认不出的 shell 写法伪造两份文件，由 M3 的 `main-agent-no-write` 与执行后比对之外的东西都防不住，记在 §15 U19 |
| 底线清单里的内容进主干前全审过 | 有效深浅（交回时）；派审查时拒绝降档；主干前进时按内容核对 | `question-38` C「主 Agent 绕不过去」 |
| 派发链里只有 worker 写，只写自己的范围 | `worker-scope`、`dispatch-chain-readonly` | 子 agent 的工具面与父相同，只能在执行边界拦 |
| worker 只碰自己的分支 | `worker-git`；执行后比对对 worker 的 shell 同样做 | 主干的整合归主 Agent |
| worker 不写图 | 工具面（§2.3.2）；`worker-graph-readonly` | 规划状态只有主 Agent 与 harness 写 |
| 每次派发都有模型与理由 | `dispatch_task` 的参数校验；派发批注 | `d-main-agent-models` |
| 简报过期的不进主干 | pins；交回处理不建审查任务；`check_commit` 读到尾注里的任务过期时在结果里写明，主干前进时这些任务不写完成证据 | K5 |
| 目标完成要 harness 的证据 | 完成门禁；凭据配对；对账重算 | K2 |
| 停下之后、人回话之前不再派 | 图上的停下标记；`ctx.stopped` | `d-failure-plans` |
| 问人的事都经主 Agent 在对话里问 | harness 不写给人的待决（`asks.ts` 只产草稿）；M3 的 `main-agent-graph` 第 3 条拒绝主 Agent 写带选项的人定待决 | `d-chat-not-cards` |
| 联动在循环板上看得到 | `entries.ts` 是唯一的定义；退路执行者读同一张表 | `d-rules-visible` |
| 写权限只给本进程派发出去、仍活着的激活 | 登记表；`worker-message-live-only` | §3.1.4 |
| 门禁工作树的破坏性命令只作用于它，同一时间一个使用者 | `git.ts` 的守卫；门禁锁 | §6.3 |

### 6.6 可测性

纯函数在 L2 直接测：`pins`、`staleness`、`scope`、`briefGate`（含停下标记的设与解、人回话之后的计数）、简报渲染、`checkPlan`、`checkModelChoice`、`normalizeVerdict`、`roundsSinceHuman` 与收敛判定、`askDraft` 的每一种（草稿过 `proposalLineRefusal` 与 `plainWordsIn`）、`parseFloor` 与 `floorHits`、`parseGateNorm`（含 `only` 与 `GATE_LINE_FORMS`）、`advanceOk`（git 事实由参数给）、执行前的写法分类（给定 `gitInvocations` 的输出与仓库状态）、`derivedStage`、`goalCompletion`（含祖先已废弃的跳过）、自动推进的判断表（§3.9.1，给定 goal 视图与图）、条目表与事件的对应、`fourAnswers`、`weeklyReport`、`ladderProposals`、`floorProposals`、`dora`、人的负担、`childId` 的编解码。

git 在 L2 用临时目录里的真实 git 仓库测：建工作树与分支、复用、`info/exclude`、重开后按祖先关系改名（含同一次返工里再派一次不改名，0.2 评审 F17）、检查在指定提交上跑、`only` 的判定与两个提交只差 `only` 路径时检查结果通用、尾注读取、执行前拒绝 `merge --no-ff` 与主干上的 `commit`、放行检查过的 `merge --ff-only`、执行后发现脚本里的 `git update-ref`、证据写给尾注里的任务、底线内容按内容核对（压缩与变基之后仍认、解冲突改了底线文件之后不认）、门禁工作树守卫、门禁锁（独占、同进程排队、开机时刻差超过 120 秒与持锁超过 6 小时判陈旧、活着的锁让第二个持有者等待并超时）。命令执行器可注入，L2 用 `node -e "process.exit(1)"` 测失败、超时与进程树结束。

宿主侧在假宿主 `tests/fake-rc3.ts` 上测，假宿主补 rc.3 的这些信号：`startActivation` 按 `delivery` 区分；`registerProvider` 与外部激活；`resolveMaxDepth`；`sendMessage` 只认直接父子与冷恢复；`goals` 的各操作、阶段规则、`agent/created` 时的 disarm 与 `goal/changed`；`llm.listModels`、`resolveModelInfo`；`tools/post-execute` 与 `exec.callId`；`sessionQuery.observeSession`；工具调用期间长时间 `await`。真实组合里的派发、计划等待、通信、检查 provider、自动推进与完成门禁在 L3 测（§9.1）；面板与冷会话的到点提醒要 L4。

### 6.7 行健康

`HOURNESS_ROWS` 在 `design`（与 `rules`）之后加 `execute`、`operate`，都按会话上报。

| 行 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- |
| execute | 主 Agent 会话：派发、写入门禁、检查与主干前进的核对、自动推进可用；写明在跑的 worker 数、槽位、检查方式（外部或同步）、自动推进的状态、主干分支 | 不是主 Agent；没有 subagents（inactive）；没有 goals；读不到模型目录；检查同步运行；循环板不在；经验板块不在；底线清单有判不了的条目；派发批注或证据写不进图；停下标记写不进图（列出任务）；登记表被重新导入后有失联的 worker；门禁锁被别的进程占着超过 60 分钟 |
| operate | 本会话是主 Agent：上次巡检、晨报、周报的时间 | 循环板不在（到点的报告不会出现）；上次巡检超过 26 小时 |

`/glm-status` 与 `/hourness-status` 都列出这两行。

## 7. 依赖

| 依赖 | 状态（2026-10-30） | M7 的用法 | 若形态有变 |
| --- | --- | --- | --- |
| split | 第 0–8 步已在 main（`0d9c337`..`de14525`），不再挡 M7（0.2 评审 F27）；E0 仍等 M3 合入，因为两者都改 `scripts/packages.mjs`（§8.3） | 两行登记在 `packages/hourness/cordis.patch.yml`；`scripts/packages.mjs`（preflight 要求 `src/` 下每个目录都登记、登记的都存在）；公共库的 `installStepNotice`、工具名契约、计价服务、`/hourness-status` | — |
| M3（附录 0.3，实施中） | 第 1、2 步在 main；其余在 `.worktrees/m3` | `isMainAgent` 与持有者记录、`mainAgentOf`、`goalOf`、`effectiveStage`、`releaseSet`、`focusOf`、`digest-notice.ts`、`stage-notice.ts`、`main-agent-no-write`、`design-before-release`、`simpleCommands`、`gitRisk`、`takeSnapshot`、`propose_to_human`、`record_human_answer`、`renderProposal`、`proposalLineRefusal`、`plainWordsIn`、探针的模拟人 | M7 在 M3 合入之后开工（§8.3：E0 与 M3 同改 `scripts/packages.mjs`；E1b 的草稿要过 M3 的 `proposalLineRefusal` 与 `plainWordsIn`）。M7 改 M3 的几处：`design-before-release` 的放行一行改问执行服务；身份节的边界一句与 `main-agent-no-write` 的正路在执行行在时改为「writing work goes to workers you dispatch with dispatch_task; subagents started with the subagent tool only read」（0.2 评审 F18）；阶段提醒的 `release` 一句与 `decompose`、`execute`、`merge` 三段、没有 `norm-merge-gate` 时的一句；`git-snapshot.ts` 加导出 `gitInvocations`。不再改 `panel-row.ts` |
| 规则板（设计 0.5） | 设计评审中 | `DISPATCH_TOOL_NAMES` 加 `dispatch_task`；代码规则目录登记 M7 的门（§2.5）；`heldForPeak`（循环板或 M7 的退路执行者送提醒前读） | 0.2 用的 `admit`、租约与重活排队都不存在了（规则板设计 §10.7），本稿已删 |
| 循环板（`schedules`） | 设计已派出、未成稿 | `glmHournessLoops.contribute`、`emit`；时间触发；送达持有者；高峰推迟 | 接口以它的定稿为准，只改 `entries.ts`；没有它时事件条目由 M7 执行（§2.5） |
| 指标流水（`metrics`） | 已批准；设计已派出、未成稿 | `emitMetric` 的出口；报告从它算 | 定稿后只改 `src/execute/metrics.ts`；之前报告从原始记录算 |
| M5（设计 0.3） | 已批准，未实施 | `glmHournessLessons` 的 `relevant`、`propose`、`stats`、`hygiene`；`LESSONS_TOOL_NAMES`；`src/data/lock.ts`、`src/data/secret-shape.ts` | 没有服务时接缝空转；锁模块谁先合入谁建 |
| 接管项目（设计 0.2） | 评审中 | 用 `GATE_LINE_FORMS`；给 `gate-norm.ts` 加 `changed` 写法；按 §3.8.5 的判定写法给别的项目起草底线清单 | 接管的草稿要把路径写进反引号里的判定写法（§14 批注） |
| `ablation`（已批准的任务） | 排在 split 之后 | 练习题运行目录移出仓库、事后扫描、对照开关（§3.14） | P4 排在它之后；它不把扫描做成每次运行的一步时，P4 在 `run-calibrate.mjs` 里加（0.2 评审 F26） |
| plain-ui（设计 0.4） | 设计中 | 晨报用词；流程条显示推出的阶段；规则页与循环板页的显示 | 只影响文字 |
| M6 | 设计评审中 | 积分口径（晨报的花费）；高峰的计算 | — |

## 8. 实施分解

分支 `m7`，工作树 `.worktrees/m7`，从 main 建。人看过一页放行稿、按 `question-37` A 改好十件活的「怎样算做完」之前不开工（`d-design-onepage`）。每步一个提交，提交信息带节点 id，文档与代码同一提交（`AGENTS.md`）。检查「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`。「今天必败」是这一步新增的检查在今天的代码上怎样失败。

### 8.1 骨架（E 步）

| 步 | 节点 | 内容 | 文件（只这些） | 层 | 今天必败 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- |
| E0 | m7-1 | `scripts/packages.mjs` 的 `hourness.src` 加 `execute`；写入范围的纯函数 | 改 `scripts/packages.mjs`；新建 `src/execute/scope.ts`、`tests/execute-scope.spec.ts` | L1、L2 | 导入失败 | 否 |
| E1a | m7-1、m7-2 | 纯函数：pins、简报门禁与渲染、计划、`childId` 与登记表的纯部分、`checkModelChoice` | 新建 `src/graph/pins.ts`、`src/execute/brief.ts`、`plan.ts`、`attempts.ts`、`models.ts` 的纯部分与各自的测试 | L1、L2 | 导入失败 | 否 |
| E1b | m7-3、m7-4、m7-5 | 纯函数：审查规整、`roundsSinceHuman` 与收敛、`askDraft`、`parseFloor` 与 `floorHits`、`parseGateNorm`（含 `only`、`GATE_LINE_FORMS`）、`advanceOk` 与执行前的写法分类（输入是解析好的 git 调用）、`derivedStage`、`goalCompletion`、自动推进的判断表、条目表 | 新建 `src/execute/review.ts`、`asks.ts`、`floor.ts`、`gate-norm.ts`、`advance.ts` 的纯部分、`entries.ts` 的表、`src/graph/execute-stage.ts` 与测试 | L1、L2 | 导入失败 | 否 |
| E2 | m7-1 | schema；工具名契约（`EXECUTE_TOOL_NAMES`、`WORKER_TOOL_NAMES`、`OPERATE_TOOL_NAMES`、常驻名单、`DISPATCH_TOOL_NAMES` 加 `dispatch_task`）；薄适配层；`emitMetric` | 新建 `src/execute/schemas.ts`、`src/execute/metrics.ts`；改 `src/shared/tool-names.ts`、`src/shared/dsh-min.ts`、`tests/contracts.spec.ts` | L1、L2 | 契约测试断言常驻名单含 `dispatch_task` 失败 | 否 |
| E3 | m7-5 | git 执行器（工作树、改动清单、按内容比对、尾注、门禁工作树守卫、按祖先关系改名、监视文件摘要）；门禁锁（`src/data/lock.ts` 还不在时按 M5 §5.3 建） | 新建 `src/execute/git.ts`、`src/execute/gate-lock.ts`、（`src/data/lock.ts`）、`tests/execute-git.spec.ts`、`tests/execute-gate-lock.spec.ts` | L2 | 导入失败 | 是（动工作树与锁） |
| E4 | m7-1 | 执行行、`dispatch_task`（模型、理由、审查深浅）、工作树与准备命令、登记表、工具面过滤（含非主 Agent 的图写工具）、五条 worker 规则（含快照与命令记录）、行登记与行健康 | 新建 `src/execute/index.ts`、`dispatch.ts`、`faces.ts`、`src/guard/execute-rules.ts`；改 `src/guard/main-agent.ts`、`src/guard/git-snapshot.ts`（只加导出）、`src/design/identity.ts`（F18 的一句）、`src/workflow/index.ts`、`src/shared/health.ts`、`packages/hourness/cordis.patch.yml`、`scripts/packages.mjs`（加行）；测试；探针场景 | L2、L3（`glm-exec-dispatch`、`non-glm-exec-dispatch`） | 没有 `dispatch_task`；假宿主上 worker 写范围外的文件被放行；worker 的 `git push` 被放行；执行行启用时 `main-agent-no-write` 的正路仍指向 `subagent` 工具（F18） | 是（guard 规则、工具面） |
| E5 | m7-1 | 计划与通信 | 新建 `src/execute/requests.ts`；改 `index.ts`；测试 | L2、L3（`glm-exec-plan`） | 计划获批之后写入仍被拒 | 是 |
| E6 | m7-4、m7-2 | 交回处理、有效深浅与审查任务、派审查（深浅改动与 `floor_requires_full`）、全审覆盖核对、收敛与停下、`execute.stopped` 的提醒、经验接缝（无服务的路径） | 新建 `src/execute/handback.ts`；改 `index.ts`、`dispatch.ts`；测试 | L2、L3（`glm-exec-review`） | 碰到底线清单的改动按轻审派审查被放行 | 否 |
| E7 | m7-5 | `check_commit`、检查的 provider、检查记录、`trunk-advance-checked` 的执行前与执行后、证据与完成、`hourness.trunk-advanced`、主干全量检查的动作 | 新建 `src/execute/check.ts`、`gate-provider.ts`；补全 `advance.ts`；改 `index.ts`；测试 `tests/execute-advance.spec.ts`、`execute-check.spec.ts` | L2（临时仓库）、L3（`glm-exec-merge`） | 主 Agent 的 `git merge --no-ff` 让主干前进到没检查的提交 | 是（主干） |
| E8 | m7-3 | 自动推进（开始、重启后恢复、人停下的认法、等人后的恢复）、完成门禁与凭据、目标整体的审查、`await_human`、空转、对账与 `hournessHandback`、派发状态提醒（含模型目录）、条目的退路执行者；M3 阶段提醒的四段与 `norm-merge-gate` 一句 | 新建 `src/execute/drive.ts`、`notice.ts`；补全 `entries.ts`；改 `index.ts`、`src/design/stage-notice.ts`；测试 `tests/execute-drive.spec.ts`、`execute-reconcile.spec.ts`、`execute-entries.spec.ts` | L2、L3（`glm-exec-drive`） | 放行之后没有 goal；`update_goal complete` 在缺证据时被放行 | 是（目标完成、harness 建 goal） |
| E9 | m7 | 骨架端到端：L3 `glm-exec-skeleton`；真实模型跑一次（§10.3）；合入 main，之后一个提交把 `execute` 改为默认启用；批次 L4（§9.2） | 探针场景与文档 | L3、真实模型、L4 | `glm-exec-skeleton` 在第一次 `dispatch_task` 就失败：工具不存在（0.2 评审 F27） | — |
| H1 | dogfood | 本仓库专用：`npm run probe` 在 git 工作树里自动建临时 profile，用完删除 | 改 `scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs`；`docs/DEVELOPMENT.md` §3 | L3 | 在工作树里跑探针加载的是主检出的 `dist` | 否 |

### 8.2 骨架之后（P 步）

| 步 | 节点 | 内容 | 文件 | 层 | 今天必败 | 独立评审 |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | m7-2 | 并行派发、补位提醒、两路 worker 的 L3 | 改 `dispatch.ts`、`notice.ts`；测试 | L2、L3（`glm-exec-parallel`） | 有空槽与可开工的任务时没有补位提醒 | 否 |
| P2 | m7-6、m7-8、m7-9 | 四答晨报、人的负担、降档后的返工、交付的四个数、周报、规矩阶梯与底线清单的提议（含草稿） | 新建 `src/report/four-answers.ts`、`metrics.ts`、`weekly.ts`、`ladder.ts`、`floor-proposals.ts`；改 `src/workflow/morning-report.ts`、`src/report/index.ts`；测试 | L2 | 今天的晨报没有「目标」一节 | 否 |
| P3 | m7-7、m7-6、m7-8 | 运维行：`hourness_report`、三条时间条目交给循环板、巡检 | 新建 `src/operate/index.ts`、`entries.ts`、`patrol.ts`；改 `src/shared/health.ts`、`packages/hourness/cordis.patch.yml`、`scripts/packages.mjs`；测试 | L2、L3（`glm-operate-patrol`）；L4（冷会话投递） | 没有 `hourness_report` | 否 |
| P4 | m7-10 | 练习题（`ablation` 不做的部分）；`docs/ORCHESTRATION.md` §10.5 | 新建 `scripts/calibrate/read-fence.mjs`；改 `run-calibrate.mjs`、`tests/calibration/*/task.json`、`tests/calibration/lib.mjs`；测试 | L2、L3（`calib-fence`） | 读 `ws/` 以外的文件被放行 | 否 |
| P5 | dogfood | 复盘节点的生成 | 新建 `src/execute/retro.ts`；改各调用处 | L2 | 审查停下时图上没有复盘节点 | 否 |
| P6 | m7-2 | 经验板块接上 M5 的服务 | 改 `brief.ts`、`handback.ts` 的服务读取 | L2、L3 | 假的经验服务返回经验时简报里没有经验一节（0.2 评审 F27） | 否 |

### 8.3 先后与并行线

`question-28` C：没有副作用的就并行；改同一批文件或要桌面版的串行，后一方等前一方合入之后再开工（0.2 评审 F20：不再写「谁先合入、另一方 rebase」）。

M7 内部：M3 合入之后 E0 先做；E1a、E1b、E2、E3 四条线只建新文件或各改不同的文件，E0 之后并行；E4 → E5 → E6 → E7 → E8 → E9 依次（都改 `src/execute/index.ts`）；E4 等 E1a、E2 与 M3 合入，E6、E7、E8 等 E1b，E7 等 E3。H1 只改 `scripts/sandbox.mjs` 与 `scripts/probe/run-probe.mjs`，随时可做，dogfood 开始之前合入。P1、P2、P5 文件不相交，可以并行；P3 等 P2；P4 等 `ablation`；P6 等 M5。

跨设计的同一批文件（编排者按表里的先后开工）：

| 文件 | 涉及的步 | 先后 |
| --- | --- | --- |
| `scripts/packages.mjs` | M7 E0、E4、P3；M3 第 3 步；规则板 R4；M5 | M3 → E0 → 规则板 R4 → E4 → P3；M5 排在实施时已合入的最后一方之后 |
| `src/shared/tool-names.ts`、`tests/contracts.spec.ts` | M7 E2；M3；规则板 R4；M5 | M3 → 规则板 R4 → E2 → M5 |
| `src/shared/health.ts`、`packages/hourness/cordis.patch.yml` | M7 E4、P3；M3；规则板 R4 | M3 → 规则板 R4 → E4 → P3 |
| `src/guard/main-agent.ts`、`src/guard/git-snapshot.ts`、`src/design/identity.ts`、`src/design/stage-notice.ts` | M7 E4、E8；M3 | M3 合入 → E4 → E8 |
| `src/rules/builtin.ts`（代码规则目录） | M7 E4、E7；规则板 R1 | 规则板 R1 → M7 在 E4、E7 里各加自己的条目；规则板晚于 M7 时由规则板 R1 一次加齐 M7 已有的门 |
| `src/workflow/morning-report.ts`、`tests/workflow.spec.ts` | M7 P2；规则板 R7 | P2 → R7（规则板的一节加在四答晨报之后） |
| `src/data/lock.ts` | M7 E3；M5；规则板 R2 | 先开工的一方建，后两方改为导入；同时开工时 M5 先 |
| `src/execute/gate-norm.ts` | M7 E1b；接管的 `bootstrap-ratchet` | E1b → `bootstrap-ratchet` |
| `scripts/calibrate/` | M7 P4；`ablation` | `ablation` → P4 |

要桌面版的只有 E9 与 P3 的 L4：攒成两个批次（§9.2），按 `risk-shared-desktop` 的常设授权由编排方排队，同一时间一个持有者。

每步同批改的文档：E4：`docs/ORCHESTRATION.md` §3（派发）、§3.2、§3.5（模型由主 Agent 选）、§6.4（五条规矩）、`docs/DESIGN.md` §2.2、§2.4a（§4 的新用各行）、§2.5、§7；E5：§3.3；E6：§3.4（审查深浅与底线清单）；E7：§4.7（合入前的检查与主干前进的核对）、§14；E8：§2.1（自动推进）、§4.6、§4.8；E9：`docs/ROADMAP.md` 核实清单第 4、4b、12 项；P2：§9.2、§10、§12；P3：§11.4、§12（循环板上的默认条目）；P4：§10.5、`docs/DEVELOPMENT.md` §3。

## 9. 验证

### 9.1 L3 探针场景

都用 `probe-full`（GLM 探针模型）除非另写；工作区是运行目录下的临时 git 仓库，图是预置的副本（已放行的目标、带派发属性的任务、`norm-merge-gate` 的命令是 `node -e` 写的快速假命令、`norm-review-floor` 有一条 `files src/guarded/` 的判定写法）；主 Agent 模式与人的回话由 M3 的模拟人做（M3 附录 §3.10：发 `/wish`，在对话里回话），会话中途的命令经 M3 的 `line` 步发出。子 agent 按派发次序取探针 provider 的 `others` 脚本；场景里循环板不在，事件条目由 M7 的退路执行者执行。

| 场景 | 核对 |
| --- | --- |
| `glm-exec-dispatch` | 不带 `model` 的 `dispatch_task` 得到 `invalid`，`hint` 列出探针 provider 的目录；带 `model` 与 `why` 的当场返回 `childId`，主 Agent 在 worker 第一次请求之前又走一步；worker 的请求记录里模型就是选的那个、工作目录是 `.worktrees/hz-<id>`；派发批注有模型与理由；worker 的首条消息是简报，没有 DSH 的交回指引（U1）；worker 的工具面里没有 `graph_status` 等九个图写工具，按名调 `graph_status` 被拒，`graph_comment` 执行；范围内的 `Write` 执行、范围外与工作树外的被拒；`.hourness/` 里的报告可写；主 Agent 用原生 `subagent` 派出的子 agent 的 `Write` 被拒；worker 的 `git push` 被拒；worker 在自己工作树里 `git reset --hard` 之后有 `refs/hourness/snapshots/<id>` 与快照流水一行；交回后主 Agent 收到 `glm-hourness-execute` 通知，没有 DSH 的结算通知 |
| `non-glm-exec-dispatch` | 同上，非 GLM 探针模型，工具名是原生名（G3） |
| `glm-exec-plan` | 同 0.2：计划获批之前的写被拒；不合格的计划当场退回、主 Agent 没有通知；合格的写进正文、`answer_worker approve` 之后可写、有批准批注；`ask_main` 的回答回到同一次调用；主 Agent 的 `send_message` 在 worker 下一步到达（U3）；兄弟之间 `UNAUTHORIZED` |
| `glm-exec-review` | 声明轻审的任务交回、改动没碰底线：建审查任务，条目提醒主 Agent 派审查；主 Agent 选的审查模型出现在审查者的请求记录里。另一件改了 `src/guarded/x.ts`、声明不审的任务：有效深浅为全审，批注写明命中；主 Agent 以 `depth: 'light'` 派审查被拒（`floor_requires_full`）；全审的结论 `checked` 不全时这一轮作废并以同一模型重派一次。挡路发现里 `criterion` 不合格的一条被改为不挡路；第 2 轮挡路数不降时轮次批注带 `· 停下`，主 Agent 收到「停下之后」的提醒与草稿；`dispatch_task` 这个任务得到 `waiting_human`；模拟人回「再修一轮」、主 Agent `record_human_answer` 之后派发放行；之后第一轮仍不过就再停下（F21） |
| `glm-exec-merge` | 脚本化的主 Agent 在任务工作树里压成一个带 `Hourness-Task` 尾注的提交，`check_commit` 起外部激活（U2），驱动器等它（场景同时有 goal）；`checks.jsonl` 有一条通过的记录；主检出里 `git merge --no-ff hz/<id>` 被拒，纠偏写正路；`git merge --ff-only <提交>` 执行；执行后任务有 harness 的 `commit` 与 `test` 证据、转为完成、工作树已删、`advances.jsonl` 有一行；「合进主干之后」的全量检查跑了一次；另一次让一条命令失败：没有通过记录，`merge --ff-only` 被拒；脚本 `node -e` 里调 `git update-ref refs/heads/main <没检查的提交>`：执行后被发现，违规流水一条、没有证据，`check_commit` 补检查通过后证据补上并写明「检查在前进之后」；任务重开后再派：旧分支改名为 `hz/<id>@1`，再修再派一次复用新分支（F17）；只改 `docs/graph/` 的提交在规范有 `only docs/graph/` 时直接 `git commit` 在主干上被放行并记为按路径通过 |
| `glm-exec-drive` | 第二个根 agent 承载主 Agent（`docs/ORCHESTRATION.md` §2.1 的做法）；模拟人同意放行之后，主 Agent 的下一步里出现 goal（没有任何命令），目标原文含验收条件，目标上有「自动推进已开始」批注；缺证据时 `update_goal complete` 被拒、goal 仍 active；`await_human` 让 goal 阻塞（`hourness-waiting-human`）；模拟人回话、主 Agent 记下之后 goal 恢复（U12）；脚本连续 3 拍只读，goal 以 `hourness-idle-rounds` 阻塞；模拟人说「继续」，主 Agent `update_goal resume` 成功；`line` 步发 `/goal pause` 之后监听器不恢复；`/wish off` 之后的 `update_goal complete` 不写图上的完成证据；主 Agent 对已结束的 worker 调 `send_message` 被拒 |
| `glm-exec-skeleton` | 完整链条：放行 → 自动开始 → 派发（选模型）→ 计划 → 批准 → 写与提交 → 交回 → 派审查（选模型）→ 主 Agent 做提交 → `check_commit` → 快进 → 证据 → 派目标整体的审查（选模型）→ `update_goal complete` 放行 → 图上目标完成。模拟人只在 `/wish`、访谈的回答、同意需求与放行时出手；`norm-merge-gate` 在设计阶段由主 Agent 提议、随放行一起同意 |
| `glm-exec-parallel`（P1） | 两个写入范围不相交的任务同时在跑；第三个相交的被 `scope_busy` 拒；一个交回后主 Agent 下一步有补位提醒，再下一步没有 |
| `glm-operate-patrol`（P3） | 假的循环板服务收下三条时间条目（只读、时刻、来源）；`hourness_report {kind: 'patrol'}` 报出已关任务的干净工作树、不干净的工作树、内容已进主干超过 14 天的分支（时钟拨后）、主干领先上游的提交；主干 24 小时内没有通过的全量检查时跑一次；门禁锁被占时记「跳过」；距上次超过 26 小时报漏跑 |
| `calib-fence`（P4） | 练习题覆盖层里脚本化的模型读 `ws/` 以外的文件被拒、`fence.jsonl` 有记录；这次运行 `valid: false`，不进汇总 |

这些场景不花积分。合入 main 之前全部探针一次通过。

### 9.2 批次 L4

第一批在 E9（骨架合入、`execute` 默认启用、主检出重建之后），第二批在 P1–P3 合入、循环板可用之后。桌面版按 `risk-shared-desktop` 的常设授权直接用，编排方在运行之间排队，同一时间一个持有者；合入与重建时桌面版关着。在主检出 `.llm/` 下建一个临时工作区（一个很小的 Node 项目、一个 git 仓库、空的 `docs/graph/`），不写本仓库的图：

1. GLM-5.3 会话 `/wish` 一句话需求，在对话里走访谈、同意需求与放行（M3）；主 Agent 在设计阶段提议 `norm-merge-gate`（命令 `node --test`），随放行一起被同意。
2. 不发任何命令：DSH 的目标条上出现 goal；主 Agent 派一个 worker，写了模型与理由（记下它选了什么）；面板「正在做」里 worker 站在任务上。
3. 计划写进任务正文；主 Agent 批准之后 worker 写文件。
4. 主 Agent 派审查（记下模型）；用 git 做出提交、`check_commit`、快进：临时工作区的 `main` 多一个带尾注的提交；面板上任务转为完成。
5. 主 Agent 派目标整体的审查；完成门禁放行；图上的目标转为完成，DSH 的 goal 收尾。
6. 再起一个任务，在目标条上暂停：不被自动恢复；在目标条上恢复后接着做。
7. 推进中关掉桌面版再打开：goal 被自动恢复，丢失的派发在提醒里列出（U7、U24）。
8. DeepSeek 会话里同样派一次（G3）。
9. 第二批另核：循环板上看得到 M7 的十条默认条目、都只读；晨报由「每天 08:30」条目到点送进主 Agent 的对话（把时钟或条目的下一次时刻调近）；关掉主 Agent 所在的标签页后等一条到点提醒投递（U8）。
10. 桌面版日志没有本包的新错误；用过模型菜单就换回 `agent-default-model`（`docs/HANDOFF.md`）。

## 10. 最薄端到端骨架（`dogfood` 的起点）

### 10.1 骨架包含什么

`/wish` → 访谈（聊天）→ 人同意需求与放行（M3 的 `record_human_answer`）→ harness 看到放行、建 goal 开始自动推进 → `dispatch_task` 一个写任务（模型与理由、简报门禁、工作树、写入门禁）→ `submit_plan` 与 `answer_worker` → worker 写、提交、交回 → 交回处理（有效深浅、审查任务）→ 主 Agent 选模型派审查（规整与收敛）→ 主 Agent 用 git 做出带尾注的提交 → `check_commit`（外部 provider、门禁锁、`norm-merge-gate` 的命令、检查记录）→ 主 Agent 快进主干、harness 执行前核对与执行后记证据 → 主 Agent 选模型派目标整体的审查 → 完成门禁（放行凭据）→ 目标完成。重启后的恢复与对账、空转阻塞、`await_human` 与等人后的恢复在骨架里（E8），没有它们，自举中的一次重启或一次等人就会让推进卡住或空转。循环板不在时事件条目由 M7 自己执行，骨架不等循环板。

人在骨架里出现四次：许愿、回答访谈、同意需求、同意放行（`norm-merge-gate` 在设计阶段提出，随放行同意）。之后人不发命令。

实施上是 E0–E9，加本仓库专用的 H1。

### 10.2 骨架不包含什么

并行派发的补位提醒（P1；`slots` 与写入范围相交照常生效）；四答晨报、周报、规矩阶梯、底线清单的增类提议、交付的四个数（P2）；三条时间条目与巡检（P3，等循环板；骨架期间分支的清理与夜间检查不跑，「合进主干之后」的全量检查照跑）；练习题（P4，等 `ablation`）；复盘节点的自动生成（P5；骨架期间由编排者手记）；经验板块（P6，等 M5）。

### 10.3 骨架的验收与 dogfood 的开始条件

1. §9.1 的骨架场景全部通过（L3）。
2. 真实模型跑一次：在运行目录的临时仓库里，用 headless 加探针的「第二个根 agent」做法，主 Agent 用 GLM-5.3，从已放行的目标跑到目标完成；worker 与审查用什么模型由主 Agent 选，记下它的选择与理由、步数、积分、被拦次数、问答次数。可选的 GLM 模型是本仓库通道的目录 `glm-5.3`、`glm-5.3-flash`（`src/glm-llm/models.ts`:25–28，经 `listModels` 给出，`src/glm-llm/zcode.ts`:316–319；ZCode 3.17.1 的包里同样有这两个 id，`reference/zcode-3.17.1/zcode.cjs` 第 386 行的模型 id 映射）。花积分按 `norm-decision-tiers` 的常设授权，花费进晨报；这是一次性的骨架验收，不算定期的练习题。
3. 第一批 L4 通过（§9.2）。
4. 一页放行稿已由人放行，十件活的「怎样算做完」已按人的原话改好（`question-37` A）；H1 已合入。§13 的两件人回答之前也能开始：① 没加之前底线清单对本仓库不起作用（一页放行稿写明），② 没加之前只改项目图的提交每次都跑全部命令。

满足之后，编排者把本仓库的下一件实现任务（建议 P2，文件与别的线不相交）交给 DSH 里的主 Agent 做，Kiro 只观察；卡住、返工、要人救场的地方记成节点（`dogfood` 的验收），P5 合入之后由 harness 自动记。

## 11. 不做的事

- 循环板本身（显示、时间触发、投递、执行记录）：`schedules`。M7 只交条目与事件，并在没有它时执行自己的事件条目。
- 指标流水本身（格式、写入、按时段切）：`metrics`。M7 只调 `emitMetric`。
- 规则板本身（信号、规则、等待单、高峰档位的执行）：规则板设计。
- 经验板块的存储、去重、面板与失败匹配：M5 的 `lessons`。
- 真实项目试用的安装、匿名化导出与反馈回收：`field-trial`。
- 档位映射、默认模型、「审查高一档」、按难度推荐模型（`d-main-agent-models`）。
- harness 替主 Agent 合并、压缩、推送或删分支；`merge_task`（`d-main-agent-shell`）。
- git 钩子（例如 `reference-transaction`）：它在主干前进的那一刻最准，但它也管人自己在终端里的提交与别的工具（`docs/CHARTER.md` §6 不替用户做主；接管设计 §5.6 同样不写 git 钩子的理由），`.git/hooks` 不进版本控制，项目已有 husky 一类时会冲突。
- harness 写给人的待决、选项卡与回写标签（`d-chat-not-cards`）。
- `/drive`、`/patrol`、运维会话（`d-auto-drive`、`d-one-main-agent`）。
- 知识同步的机械检查、草稿区的检查（同 0.2）。
- 晨报的界面、「讲细点 / 说重点」的按钮：M8 与 M3（五键已变成人说的五种话）。
- 逐 token 的 agent 间对话；worker 之间直接通信；用 `send_message` 唤醒被中断的 worker。
- 自动切换人给主 Agent 选的模型、套餐或渠道；预算与按次计费上限。
- 练习题运行目录移出仓库、事后扫描、对照开关：`ablation`。
- 改图引擎的权限与节点字段。
- 跨仓库、跨机器的派发。

## 12. 由 agent 定、人可推翻的事项

命名：行 `glm-hourness/execute`、`glm-hourness/operate`；目录 `src/execute/`、`src/operate/`；工具 `dispatch_task`、`answer_worker`、`check_commit`、`await_human`、`hourness_report`、`submit_plan`、`ask_main`；规则 `execute:worker-scope`、`execute:dispatch-chain-readonly`、`execute:worker-graph-readonly`、`execute:worker-git`、`execute:worker-message-live-only`、`execute:trunk-advance-checked`、`execute:completion-gate`、`execute:stopped`；provider `hourness-gate`；投影 `hournessHandback`；notice 来源 `glm-hourness-execute`、`glm-hourness-loop`；schema `hourness-handback-v1`、`hourness-review-v1`；事件 `hourness.*`（§2.5）；条目 id `execute.*`、`operate.*`（§3.11.1）；指标事件 `execute.*`、`operate.*`（§3.16）；运行时文件 `<git>/hourness/`；工作树 `.worktrees/hz-<id>`、分支 `hz/<id>`、`hz/<id>@<n>`、门禁工作树 `.worktrees/hz-gate`；报告目录 `.hourness/`；提交尾注只有 `Hourness-Task`（0.2 的 `Hourness-Attempt`、`Hourness-Branch-Tip` 删去：提交信息由主 Agent 写，分支的判断改按祖先关系）；停下标记 `· 停下`；goal 阻塞码 `hourness-waiting-human`、`hourness-idle-rounds`。

做法（选它的理由与没选的做法）：

- 放行在主 Agent 的每一步与持有者会话创建时从图上认出来：面板上改的、对话里记的、重启之后的都认得到。没选：在 `record_human_answer` 的执行后监听（只认得对话里那一条路，重启之后漏掉）。
- 重启后自动恢复，人暂停或清掉的不恢复：重启不是人决定停下，人要的是「推进到底」；暂停与清掉是人的动作。没选：重启后等人说继续（与 `d-auto-drive` 不符）；连人暂停的也恢复（推翻人的动作）。
- 没走设计循环的已批准目标不自动开始：迁移来的老目标被聚焦时突然开始花积分，人不会预期。没选：任何已批准目标一聚焦就开始。
- `model` 与 `why` 必填，没有默认：harness 不替主 Agent 选（`d-main-agent-models`），周报的对照才有意义。没选：缺省继承主 Agent 的模型（悄悄替它选了）。
- 模型目录只作参考，读不到时放行并注明：rc.3 的目录不约束路由（llm:2080–2083）。没选：读不到就拒绝（没有目录的 provider 派不出去）。
- 审查深浅在派活时声明（缺省全审），派审查时可以改：`question-38` C 写的是「派发时写」；「不审」需要一个记录的地方；缺省全审是往质量一侧错。没选：只在派审查时定（不审没有地方记）；缺省轻审。
- 审查由主 Agent 派，harness 只建审查任务与提醒：模型要由主 Agent 在看过交回之后选。没选：harness 用派活时预先写下的模型自动派（模型选在看到改动之前，且有两条派审查的路）。
- 底线清单在主干前进时按内容核对（文件内容等于某次全审看过的那一份）：主 Agent 怎样压缩、变基、合并都能认，解冲突改了底线文件就不认。没选：按任务核对（压缩与多任务合成一个提交时对不上）；按 patch-id（同上）。
- 底线清单的判定写法写在验收里的反引号中：验收只有人的权限能改，主 Agent 改不松它。没选：写在正文（LLM 能改正文，等于能绕过）；按仓库写在代码里（包里带了项目的内容，违背接管设计的「机制不带内容」）。
- 没有判定写法的条目不强制，明面列出：强制「一律全审」等于取消 `question-38` C 的降档。没选：没有写法时一律全审。
- 主干前进：执行前拒绝认得出的写法，执行后比对，主 Agent 每一步开始时再比一次；不用 git 钩子（§11）；不替主 Agent 合（`d-main-agent-shell`）。
- 没经检查的前进之后补检查，证据写明「检查在前进之后」，不要求退回：主干可能已经推送，退回要强推，那是收不回的动作。没选：一律要求退回重合。
- 检查绑定提交与清单摘要；`only` 让只差这些路径的两个提交共用一次检查：项目图的提交很频繁，不能每次重跑。没选：只绑树（清单改了照样算数）；每个提交都重跑。
- 任务与提交的对应用尾注 `Hourness-Task`，由主 Agent 写：它在 git 里、变基与压缩之后还在。没选：`check_commit` 带任务参数（不在 git 里）；按分支祖先判断（压缩之后对不上）。
- 任务完成时 harness 删干净的任务工作树，分支留给主 Agent：工作树是派发的基础设施，删干净的不丢东西；删分支是 git 的事。没选：harness 也删分支；什么都不删。
- worker 只碰自己的分支，危险命令先存快照：主干的整合归主 Agent；快照用 M3 的同一个函数。没选：worker 的 git 也放开（它能移动主干）。
- 问人只经主 Agent，harness 给事实与四行草稿：人唯一的窗口是主 Agent（`d-one-main-agent`），harness 不会聊天。没选：harness 直接写提议式待决（人看到的话不是在对话里提的）。
- 联动做成循环板上的数据，没有循环板时 M7 按同一张表执行：明面上看得到（`d-rules-visible`），又不让自动推进依赖一个还没设计出来的模块。没选：写死在代码里；没有循环板就不推进。
- 运行时文件放 `<git>/hourness/`：按仓库、不入库、各工作树共用。没选：`projectHome`（桌面版上所有工作区共用）。
- 「合进主干之后」的全量检查合并排队，夜间巡检只在 24 小时内没有通过时再跑：人提过合入之后跑一遍完整检查；重活不重复跑。没选：只在夜间跑；每次前进都单独跑。
- 子 agent 的工具面去掉图写工具（0.2 评审 F19）；门禁锁用 M5 的锁规则加 6 小时上限（F24）。
- 默认配置：`slots` 3；条目时刻 08:30、周一 09:00、02:30（本机时区）；门禁锁等待 60 分钟、持锁上限 6 小时；`maxGoalRounds` 500；计划等待 30 分钟、问题 20 分钟；每条命令 30 分钟；空转 3 拍；全量检查的跳过窗口 24 小时；分支清理的发现 14 天。改它们不改设计。
- 练习题的时机：每个 L4 批次跑一遍回归集；这一批新加的提示词节与每步注入各做一次对照（用 `ablation` 的开关）；花费进晨报（`norm-decision-tiers` 的常设授权）。
- 沿用 0.2 的：执行阶段推出、不存；`delivery: 'caller'`；写任务一律用工作树；计划写在正文、批准记成批注；计划等待放在一次工具调用里；`ask_main` 与 `send_message` 分工；pins 只比语义字段；worker 对图只读；空转 3 拍；目标整体的审查不建节点；停下先写标记；复盘由 harness 记事实。
- 0.2 §12 的「规矩阶梯的提议走决策队列，不用五键卡」与 §14 第 6 条（`docs/ORCHESTRATION.md` §9.2 的五键）随 `d-chat-not-cards` 失效：五键已是人说的五种话，提议经主 Agent 在对话里问。

## 13. 待人定的事项

两件，都是改人批过的清单，按 `d-chat-not-cards` 的四行写；一页放行稿里原样放。

① 必须全审的清单加上机器认得的写法

背景：清单现在只有人话，harness **判不出**哪次改动碰到了它

推荐：每一类后面加**具体路径或动作**，例如拦截与权限加 src/guard/

疑问：路径要是**列漏了**，漏掉的地方就不会被强制全审

不做：不让主 Agent **自己判断**算不算碰到，那样它能绕过去

② 只改项目图的提交不跑全套检查

背景：主 Agent 每次记图都要提交，现在**每次都跑**构建和全部测试

推荐：合入前的检查清单加一条：**只改项目图**的提交不跑命令

疑问：图文件要是**写坏了**，要等合入后的全量检查才发现

不做：不让这类提交**完全不查**，harness 仍核对它只改了图

这两处你看行吗？

记图时的具体内容（给编排者，人同意之后带人的原话写进验收）：

- ① `norm-review-floor` 四条验收的末尾各加：第 1 条 `` `files src/guard/, src/execute/scope.ts, src/execute/faces.ts, src/design/index.ts, src/shared/tool-names.ts, src/shared/dialect.ts` ``；第 2 条 `` `files src/graph/engine.ts, src/graph/format.ts, src/graph/schema.ts, src/graph/parse.ts, src/graph/mutation.ts, src/graph/store.ts` ``；第 3 条 `` `deletes` `` 与 `` `commands git push, git branch -d, git branch -D, git update-ref -d, git filter-branch, git filter-repo` ``；第 4 条 `` `outside` ``。人话部分不改。
- ② `norm-merge-gate` 的验收在 `push` 之前加一条 `` `only docs/graph/` ``。

## 14. 交给编排者记图的事项

本设计不写 `docs/graph/`。同目录两份 JSON 草稿，变更的形状同 `src/graph/mutation.ts`：

1. `graph-ops-v03.json`（只有批注，设计过审之后可以直接记）：`m7`（0.3 写完、改了什么、待人定的两件与 `question-37` A）；`m3`（M7 对 M3 的改动：身份节与 `main-agent-no-write` 的一句、阶段提醒的四段与 `norm-merge-gate` 一句、`git-snapshot.ts` 导出 `gitInvocations`，不再改 `panel-row.ts`）；`rules`（代码规则目录要登记的八个 id、`DISPATCH_TOOL_NAMES`、M7 不再用 `admit` 与租约）；`schedules`（M7 的八个事件、十条默认条目与它需要的接口，§2.5、§3.11.1）；`metrics`（M7 的事件表，§3.16）；`lessons`（M5 请改的五处已采纳）；`bootstrap`（底线清单的草稿要把路径写成反引号里的判定写法；`GATE_LINE_FORMS`；`only` 写法）；`question-31`（子 agent 的工具面去掉图写工具，0.2 评审 F19）；`ablation`（扫描若不是每次运行的一步，由 P4 加，F26）；`norm-review-floor`（四条还没有判定写法，harness 判不了，等人定 ①）；`norm-merge-gate`（`push` 现在是主 Agent 做；`only` 等人定 ②）；`dogfood`（开始条件按 §10.3）。
2. `graph-ops-v03-pending.json`（要人的原话，人看过一页放行稿、回话之后再记）：`m7-1` 到 `m7-10` 与 `m7` 的验收按 §1.2 改写，`m7-3`、`m7-5`、`m7-7`、`m7-8`、`m7-9`、`m7-10` 的标题与各节点正文指向 0.3；`norm-review-floor` 的验收按 §13 ①；`norm-merge-gate` 的验收按 §13 ②。这些写入不带 `relay`，原样提交会被引擎以 `forbidden` 拒绝；编排者按人的回话逐条补上人的原话再提交，人改了哪条就按人的话改。修订号是写稿时读到的，提交前重读。

## 15. 未核实的假设

| # | 假设 | 依据 | 在哪核实 | 不成立时 |
| --- | --- | --- | --- | --- |
| U1 | `delivery: 'caller'` 的 worker 不附交回指引、父 agent 收不到结算通知、驱动器照样等它 | subagent:1460–1465、2048–2063、1296–1330 | L3 `glm-exec-dispatch` | 改用 `parent`，简报写明只用 `structured_output` 交回 |
| U2 | 第三方插件能注册外部 provider；外部激活被驱动器等待 | subagent:3256–3267、1483–1520、1768–1790、1310–1313 | L3 `glm-exec-merge` | `check_commit` 同步运行 |
| U3 | 主 Agent 的 `send_message` 在常驻 worker 的下一步到达 | subagent:1545–1549、2080–2117 | L3 `glm-exec-plan` | 改向用中断加重新派发 |
| U4 | 子 agent 一次工具调用 `await` 30 分钟不被切断 | 没读到工具执行的默认超时〔推断〕 | L3、L4 | 等待上限改小 |
| U5 | `agent/created` 时装的组装监听器对子 agent 生效，能按角色过滤工具面 | M3 的同一做法 | L3 `glm-exec-dispatch` | 只靠工具体自查与 `worker-graph-readonly` |
| U6 | 会话事件能折叠出 `structured_output` 的参数；`observeSession` 对冷会话返回第三方投影 | subagent:986–990、2339–2352 | L2、L3 | 对账只走「丢失」一支 |
| U7 | 桌面版重启后，恢复出来的主 Agent 会话触发 `agent/created` 与第一次走步的监听器 | agent:574–589〔推断〕 | L4 | 人打开会话说一句话时恢复（那一步一定触发） |
| U8 | 冷会话收到到点提醒时恢复出来的 agent 工具面齐全（循环板的投递） | `docs/ROADMAP.md` 核实清单第 17 项 | L4 第二批 | 人在对话里要报告 |
| U9 | 几个工作树各用临时 profile 时并行跑探针互不干扰 | `docs/DEVELOPMENT.md` §3〔推断〕 | H1 的 L3 | 探针串行 |
| U10 | `agentOptions.reasoningEffort` 在原生通道上生效 | subagent:1400–1404 | L3 | 只换模型 |
| U11 | 桌面版运行时在主检出上快进主干无害（加载的是不入库的 `dist`） | `docs/DEVELOPMENT.md` §7〔推断〕 | L4 | 快进之前提醒主 Agent 桌面版在用 |
| U12 | 在主 Agent 自己的 `agent/pre-step` 里调 `goals.resume` 之后，驱动器在这一回合结束后开下一拍 | goal:686–699；driver 在 `goal/changed` 时重排、空闲时开拍（243–246、223–242） | L3 `glm-exec-drive` | 恢复放到 `agent/status` 变为空闲时做 |
| U13 | 同一进程里禁用再启用执行行时登记表留着 | 〔推断〕 | L3 | 两种情况都安全：为空时活着的 worker 只读、列为失联 |
| U15 | `goal/changed` 的 `ref.id` 与 `goals.get` 的 goal `id` 相同且不变 | goal:763、872–877 | L3 `glm-exec-drive` | 凭据按 `agentId` 加 10 分钟窗口配对 |
| U17 | worker 的工具面不受 M3 去掉写工具的影响 | M3 的过滤只看 `isMainAgent`〔推断〕 | L3 `glm-exec-dispatch` | 执行行给 worker 补回写文件工具 |
| U18 | `caller` 模式的检查不进面板的子 agent 目录 | subagent:1483–1520〔实读〕 | L4 | 不改：进度靠提醒与批注 |
| U19 | 主 Agent 与 worker 伪造不了检查记录 | 写文件只能经工具（M3 去掉写工具、shell 写入由 `main-agent-no-write` 与 `worker-scope` 判）〔推断：shell 写入的判定是启发式〕 | L2（已知的写法都被拦） | 残余风险写进一页放行稿；加强判写属于 guard |
| U20 | `tools/post-execute` 对每次 shell 调用都触发，含失败的与代码模式程序里带 `parent` 的子调用 | tools:3595–3624；子调用经同一个 `execute`〔推断〕 | L3 `glm-exec-merge` | 主 Agent 每一步开始时的主干比对（§3.8.4）兜底，发现晚一步 |
| U21 | 本仓库通道的 `listModels` 给出 `glm-5.3`、`glm-5.3-flash` | `src/glm-llm/zcode.ts`:316–319〔实读代码，没有运行〕 | L3 | 目录为空时放行（§3.1.3） |
| U22 | 循环板提供 `contribute` 与 `emit`，能执行 harness 动作与提醒、只读显示默认条目 | 循环板设计未成稿 | 循环板设计定稿时 | 只改 `entries.ts`；在那之前 M7 自己执行事件条目 |
| U23 | 指标流水提供一个写入接口，M7 的事件表能放进它的通用格式 | 指标流水设计未成稿 | 那份设计定稿时 | 只改 `src/execute/metrics.ts` |
| U24 | 桌面版启动时是否为上次打开的会话创建 agent（决定重启后恢复发生在启动时还是人打开会话时） | 〔未读到〕 | L4 第一批第 7 步 | 恢复推迟到人打开会话；不影响正确性 |

0.2 的 U14（门禁锁在 Windows 上的失效判定）由改用 M5 的锁规则关掉（不靠 `process.kill(pid, 0)`）；U16（卡片字段）随卡片一起删去。

## 16. 0.2 → 0.3 的改动与第 2 轮评审意见的处理

改动按方向：

| 方向 | 改了什么 | 在哪 |
| --- | --- | --- |
| `d-auto-drive` | 删 `/drive`、`/drive stop`；放行被看到就建 goal；重启后恢复；人暂停、清掉的不恢复；人说继续由主 Agent 恢复 | §0、§1.2 m7-3、§2.2、§3.9.1、§3.9.5、§3.9.6、§9、§10 |
| `d-main-agent-models` | 删档位映射与 `modelReminder`；`model`、`why` 必填；目录核对；记录 | §0、§1.2 m7-1、m7-4、§3.1.1–§3.1.3、§3.7.1、§3.9.4、§3.16 |
| `d-main-agent-shell` | 删 `main-agent-no-git-write`、`merge_task` 与门禁的压缩与快进；加 `check_commit`、`trunk-advance-checked`、检查与前进记录、尾注映射；worker 的 git 与快照 | §0、§1.2 m7-5、§3.2.4、§3.8、§5、§6 |
| `d-one-main-agent` | 删运维会话、`/patrol` 与本包直接调 `schedule`；三条时间条目交给循环板 | §0、§1.2 m7-6–m7-8、§2.3.1、§3.11 |
| `question-38` C、`norm-review-floor` | 审查深浅、有效深浅、底线清单的判定写法与按内容核对、降档后的返工与增类提议 | §1.2 m7-4、§3.7.1、§3.8.4、§3.8.5、§3.12.3、§13 ① |
| `d-chat-not-cards` | 删 `questions.ts`、回写标签与 harness 的待决；加 `asks.ts` 的草稿与主 Agent 问人；§13 改为四行 | §3.7.3、§3.7.4、§3.12.2、§13 |
| `d-rules-visible`、`d-defaults-readonly` | 门列进规则板；联动成为十条只读的循环板条目；没有循环板时的退路 | §2.5、§3.11.1 |
| `metrics` | 事件表与 `emitMetric`；报告的来源 | §3.10、§3.16 |
| `d-design-onepage` | 方向清单的对照；开工条件加一页放行稿 | §1.1、§8、§10.3 |
| 规则板 0.5、M5 0.3、接管 0.2 | 删 `admit`、租约；M5 的五处；`GATE_LINE_FORMS` 与 `changed`；锁用 `src/data/lock.ts`；运行时文件改放 `<git>/hourness/` | §3.5.5、§3.8、§7、§8.3 |

0.2 第 2 轮评审的不挡路意见：

| 发现 | 处理 | 在哪 |
| --- | --- | --- |
| F17 重开后同一次返工里的第二次派发改名失败 | 采纳：按祖先关系判断，复用进主干之后建的分支，改名取第一个不存在的 `hz/<id>@<n>`；L2 与 L3 各一例 | §3.1.2 第 4 步、§6.6、§9.1 `glm-exec-merge` |
| F18 M3 的身份与纠偏文字仍说子 agent 放行后能写 | 采纳：执行行在时两处改为 dispatch_task 的说法；E4 的今天必败加一条 | §7 M3 一行、§8.1 E4 |
| F19 子 agent 带着九个图写工具 | 采纳：工具面去掉，`worker-graph-readonly` 兜底；批注 `question-31` | §2.3.2、§9.1、§14 |
| F20 跨设计同一批文件的先后 | 采纳：§8.3 加表，后一方等前一方合入再开工。`/graph-apply` 的三个回调的次序问题随 M7 不再改 `panel-row.ts` 消失 | §8.3 |
| F21 人给了一轮之后下一次停在哪 | 采纳：轮数与失败次数从人的最近一条历史之后算；人给一轮之后再不过就停 | §3.7.3、§3.8.3 第 9 步 |
| F22 放弃任务后它的审查任务挡住完成门禁 | 采纳第二种：完成门禁跳过祖先已废弃或被取代的任务 | §3.9.3 第 1 条 |
| F23 回写动作读自 LLM 能改的正文 | 随回写标签一起删去：harness 不再替人回写，主 Agent 带人的原话写 | §3.7.3 |
| F24 开机时刻取整到分钟会抖、pid 复用让锁永远有效 | 采纳：改用 M5 的锁规则（开机时刻差 120 秒以上判陈旧）加 6 小时持锁上限 | §3.8.3 |
| F25 对账让主 Agent 发 `/drive` | 采纳：对账重算完成门禁，成立就以 harness 的证据标完成；`/drive` 已删 | §3.9.6 第 7 步 |
| F26 每次运行的事后扫描没有归属 | 采纳：`ablation` 不做成每次运行的一步时，P4 在 `run-calibrate.mjs` 里加 | §3.14.3、§7 |
| F27 split 已合入；E9、P6 没写今天必败 | 采纳：文首与 §7 写明；E9、P6 补上 | 文首、§7、§8.1、§8.2 |
