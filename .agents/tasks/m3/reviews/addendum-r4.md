# M3 设计附录的独立评审（第 4 轮，评 0.4）

评审对象：`.agents/tasks/m3/design-addendum.md` 0.4（2026-10-30 13:35 本地时间写入）。下文「附录:行」指这个文件的物理行号；0.3 原文在 `design-addendum-0.3.md`。

对照：第 3 轮评审 `reviews/addendum-r3.md`、`reviews/addendum-r3.json`（HIGH 0、MEDIUM 8、NIT 12）；`docs/DEVELOPMENT.md` §1.1；`.agents/tasks/design-context.md` 的「Seam rulings between designs」与其后人的决定；规则板设计 `.agents/tasks/rules/design.md` 0.8；`reference/zcode-3.17.1/zcode.cjs`；`reference/dsh-desktop-0.2.1-rc.3/`；仓库 main 与图节点（只经 `npm run -s graph -- show <id>` 读）。

挡路标准：`docs/DEVELOPMENT.md` §1.1。只有这几类挡路：验收条件或需求没有满足；不可逆损失没有预防；失败了没有途径发现、没有恢复办法或事后查不到原因；与接缝裁定或人的决定相反。主机制与人定直接相反的记 HIGH，其余挡路的记 MEDIUM，不挡路的记 NIT。

挡路计数：MEDIUM 2、NIT 2。结论 CHANGES_REQUESTED（挡路 2 > 0）。两条挡路都来自附录写成之后、人在 2026-10-30 定的新决定：`d-main-agent-peak-exempt`（主 Agent 不受高峰影响）与 `d-design-onepage` 扩到产品（每个模块一次放行归 M3）。第 3 轮的 M1–M8、N1–N12 全部关闭。收敛：第 3 轮挡路 8、本轮 2，降了，方向对。

## 第 3 轮发现的复核

| 第 3 轮 | 状态 | 依据 |
| --- | --- | --- |
| M1 M3 的门不在规则板上（`d-rules-visible`） | 关闭 | §3.11：`src/guard/main-agent-rules.ts` 导出 `MAIN_AGENT_RULES`（八条，比评审多 `main-agent-graph-cli`），`main-agent-graph` 拆成三个 id；规则板目录以 `design:<id>` 映射，契约测试钉住违规流水的 `rule` 都在表里、表里每个 id 都被触发；§12「规则只由人定」一行重写，加了 `d-rules-visible`、`d-defaults-readonly`、`d-peak-mode`、`norm-review-floor` 四行；§9 第 12 条给规则板 |
| M2 第 3、10 步没有独立评审（`norm-review-floor`） | 关闭 | §0 名单改为第 3、4、5、6、8、9、10 步，逐步写出按 `norm-review-floor` 哪一条；第 3 步（工具面与角色判定、写 `<DSH home>/glm-hourness/main-agent/`）、第 10 步（决策流水格式）都「独立评审：是」；§12 加 `norm-review-floor` 一行 |
| M3 快照漏存挡路文件、`clean` 读给人看的输出 | 关闭 | §2.5：写出类（`reset --hard/--merge/--keep`、`checkout -f`/切换、`switch --discard-changes`、`restore --source`、`read-tree -u`）另存目标树与未跟踪未忽略文件的交集进 `T`；`clean` 列表用 `git ls-files -z --others --exclude-standard --directory` 算，`execFile` 不经 shell，`env` 设 `LC_ALL=C`、`LANGUAGE=C`，`clean -n` 只在 `core.quotePath=false` 下核对、有一行对不上就拒绝。核对：git-reset/git-checkout 文档的「in the way … deleted」措辞 |
| M4 被忽略的文件进快照 | 关闭 | §2.5：被忽略文件一律不进快照，`clean -x`、`-X` 拒绝、`-ff` 由对外检查拒绝；`worktree remove` 只存已跟踪改动与未忽略未跟踪文件，被忽略的只记路径、个数、字节数，上限只对要存的文件（装依赖的工作树例行清理不被拒）；标签只打在只含旧引用值的 `K_h`；`push --mirror`、`push --tags`（有快照标签时）、源匹配 `refs/hourness/` 或快照对象的 refspec、`remote.<远端>.mirror` 都拒绝 |
| M5 阶段前进只管主 Agent | 关闭 | §3.8 第二条（`main-agent-graph-stage`）对所有会话生效，拦四种候选调用；子会话的图工具调用带 `relay` 一律拒绝（第一条）；普通会话 `relay` 照旧但推不动阶段；告警进违规流水、设计行行健康降级、通知持有者会话。核对：引擎 `engine.ts:150、154` 对 `relay` 给人的权限、`initialStatus`（:417–428）待决挂未关闭节点下为 `approved`、图工具全局注册 |
| M6 人设按 3.17.1 重核 | 关闭 | §2.7：3.17.1 没有 Output Style 一节，风格正文是主回合上下文条目；人设留在系统提示词、`glm:context-management` 之前、标题后单换行、不加每回合提醒，三处写进 `docs/reference/zcode-verbatim.md` 待编排方同意。实读核对：`n8o`（zcode.cjs @12945672）是 `# Output Style: ${name}\n${t}`（一个换行，无空行）；`pBa`（@12792218）开头句；`output_style_instructions` 是上下文条目（@13142888）；`r8o`（@13451285）每回合提醒 |
| M7 例题换成 `d-peak-mode` | 关闭（照评审改了；但例题与更晚的 `d-main-agent-peak-exempt` 相反，见本轮 M1） | §2.8 例题从「高峰时不再提醒模型」换成 `d-peak-mode` 的三档。评审要求的改动已做；0.4 写成之后人又定了 `d-main-agent-peak-exempt`，例题的新内容与它冲突 |
| M8 背景上限 150→60 | 关闭 | §2.9 去掉字面数，只读 `PLAIN_LIMITS.background`（面板设计 0.6 为 60，去掉 `**` 再数）；§6、§11 同改 |
| N1 `snapshotEvents()` 已弃用 | 关闭 | §3.2 注册会话投影 `hournessTalk`（同 dsh-time-context），`snapshotEvents` 只作退路、退路时行健康 degraded |
| N2 子串能改原意 | 关闭 | §3.6 `personSaid`：NFKC 与空白规整后每段起止落在消息边、空白或 `\p{P}` 上；L2 有「不可以」摘「可以」被拒 |
| N3 依据过期 | 关闭 | 文件头依据改为 `fe0bace`，`APPLICATION_PROTOCOL` 已删（实读 `rules.ts:56` 为 `ASK_THE_HUMAN`），`installDialect`（:200）、逐字门禁（:244）行号核对一致 |
| N4 面板给 M3 的落点 | 关闭 | §2.4、§3.2、§3.5、§2.6 采纳五处落点；`isPersonMessage` 留在 `talk.ts`（面板 0.6 §4.9 已删那个文件并交 M3 定） |
| N5 DSH 委派的描述不完整 | 关闭 | §2.6 与 §9 第 7 条补 `modelSelectionSettings` 一句。核对 `subagent:302–305` |
| N6 指标流水的事件 | 关闭 | §3.12 列八类事件，出口 `src/design/metrics.ts` 的 `emitMetric` 在接口到位前不做事 |
| N7 对齐里 `undefined`、`whenIdle` | 关闭 | §2.4 对齐排到 `agent.whenIdle()` 之后、`commands.execute` 返回 `undefined` 当失败；L3 加 fork 一步。核对 `commands.execute:326–330`、`whenIdle`（agent-loop:870–875） |
| N8 快照的噪声 | 关闭 | §2.5：`S` 空、无 `W`、`L` 空时整件跳过；标签只在旧值会不可达或已推送时打 |
| N9 `/wish here <一句话>` | 关闭 | §2.4 `here` 后可跟一句话，回复与 `input.hint` 同改 |
| N10 `TALK_GUIDE` 一句 | 关闭 | §2.2 改为「Put every matter that needs their answer to them」 |
| N11 `ask_user_question` 按原生名 | 关闭 | §2.1 `HIDDEN_FROM_MAIN_AGENT` 经 `toNativeTool` 比较 |
| N12 `/goal` 附件固定文字 | 关闭 | §3.6 排除只含 `GOAL_ATTACHMENT_TEXT` 的消息。核对 `command-goal:99–106` |

## 接缝裁定与人的决定逐项

| 裁定或决定 | 附录位置 | 结果 |
| --- | --- | --- |
| 接缝：`propose_to_human` 收可选 `attach`，`record_human_answer` 拍板后交回提议的一方 | §3.13、§3.4、§3.5 | 一致：`attach` 前缀分派（`rules:`、`loops:`），`acceptProposal` 在 `question`/`agree` 成功后调用，结果进 `handedBack` |
| 接缝：背景字段与上限归面板设计（一行、去 `**` 后至多 60 码点） | §2.9 | 一致：只读 `PLAIN_LIMITS.background` |
| 接缝：`/wish` 入口归 M3 | §2.6 | 一致 |
| 接缝：高峰提醒措辞、脚本门判定事件、少做并行数、高峰结束叫醒、高峰里等待不计空转 | — | 不涉及 M3，附录如实排除（§12 末行） |
| 人定 `d-main-agent-peak-exempt`（主 Agent 不受高峰影响，随时回话） | §2.8 例题 | 不一致（本轮 M1）：例题仍教主 Agent 高峰时自己少做、不做 |
| 人定 `d-design-onepage` 扩到产品（每个模块一次放行，归 M3） | 无 | 不满足（本轮 M2）：附录没有设计，也没记成待办 |

## 发现

## 发现

### M1 MEDIUM 例题教主 Agent 在高峰里自己少做，与 `d-main-agent-peak-exempt` 相反

位置：§2.8 `PLAIN_QUESTION_EXAMPLE`（附录:315）与 `PLAIN_QUESTION_GUIDE` 参考文本（附录:319–326）；§2.2 第二部分原样引用；§3.4 工具说明再引用一次；§0 第 4、17 条。

问题：

- 人在 2026-10-30T05:36Z 定 `d-main-agent-peak-exempt`（relay「主Agent应该不受高峰影响，随时回复的」）：高峰模式的三档都不管主 Agent 自己，它照常回话、照常用工具，包括不做档；高峰模式只管它派出去的子 agent（少做时的并发上限、不做时排队）与自报的重活脚本。图上 `m3` 05:38Z 的批注要本轮评审对照这一条。
- 0.4 的例题题目是「高峰时段主 Agent 怎么干活」，推荐一行「默认少做：少开几个，不做重活」，不做一行「高峰全停，活要排到高峰以后」。它进每个主 Agent 的系统提示词两次（身份节与 `propose_to_human` 的说明），读它的正是被豁免的那个 agent：照字面，主 Agent 会以为少做档要它自己少干、不做档要它自己停下，与人刚定的相反。附录写例题时的理由「它说的是已经定了的事，模型照抄它也不会把一个被否掉的做法推给人」（附录:315）因此不再成立。

改法：保留格式，把对象从「主 Agent」换成「派出去的活」，不做一行写明主 Agent 照常回话。例如：

```text
① 高峰时段派出去的活怎么排
背景：高峰时 GLM **更费积分**，系统每步都会提醒
推荐：默认**少做**：少派几个，不派重活
疑问：要是**赶工期**，你可以改成无影响
不做：**派活全停**，主 Agent 照常回你话
```

（题目 12 个码点；背景不变；推荐、疑问、不做三行去掉标签与 `**` 后 14、13、15 个码点，各一处 4 个码点的加粗；实现时照旧过 `proposalLineRefusal` 与 `plainWordsIn`。）§2.8 的理由一段加一句「主 Agent 自己不受高峰模式影响（`d-main-agent-peak-exempt`），例题说的是派出去的活」；§1 表第 17 行与 §12 的 `d-peak-mode` 一行加 `d-main-agent-peak-exempt`。

### M2 MEDIUM 放行仍是「一个目标一次」，没有接人定的「每个模块一次放行」

位置：§0 第 12、14 条；§2.3 `design`、`release` 两行（附录:146–147）；§3.4、§3.5 的 `release` 一种；第 9 步（放行一支）；§12 `d-design-onepage` 一行。

问题：

- `d-design-onepage` 在 2026-10-30T05:19Z 扩到产品（relay「两层循环加，我正想说这个事情呢」）。`.agents/tasks/design-context.md` 最新一节「Two-level loop in the product」写明：访谈之后主 Agent 与人先定框架、模块清单与方向清单（图上可见）；每个模块一份设计与一页人话，人在对话里同意（一个四行方案）之后才派这个模块的开发；「release per module is M3」。图上 `m3` 05:19Z 的批注把这件交给 M3 下一稿：「设计放行从『一个目标一次』改为『每个模块一次』…方向清单存在图上、供评审对照」。
- 0.4 全文没有模块、框架或方向清单（附录里「方向清单」只出现在 §12 的自查，指本项目自己的清单）。阶段机仍是目标一级的 wish、interview、design、release；放行门禁、`propose_to_human {kind: 'release'}`、`design-before-release` 与 §3.8 的「批准放行集合」都按整个目标判。照做，产品里用户的项目只有一次放行，人同意之后所有模块一起派开发，与人定的每个模块先同意再开发相反（§1.1 第一类，需求没有满足）。`m3` 05:38Z 的批注写「没赶上的在实现开工前补」，但附录本身没有任何一处记下这件，§10 也没有，开工的人无从知道。

改法（选一种写进附录，另一种不要）：

- A（推荐）本版补设计：模块是目标下的 `feature` 子节点；框架与模块清单在 `design` 阶段经 `propose_to_human {kind: 'confirm'}` 的一次「框架确认」定下，方向清单是目标下 `type: 'decision'`、带固定标记（例如标题以「方向：」开头，或引擎认的一个布尔字段，由附录定一种）的节点；放行集合按模块算（那个 `feature` 及其子孙，加它 `source` 指向的待决）；`propose_to_human {kind: 'release'}` 加必填参数 `module`，`record_human_answer` 按模块批准；`design-before-release` 改为子 agent 焦点所在的模块已放行；§3.8 的「放行之前批准放行集合里的节点」按模块判；目标的 `release` 阶段在最后一个模块放行时才到；L2 与第 12 步（a）的标定各加一个两模块的例子。
- B 本版不做：§10 加一条「每个模块一次放行（`d-design-onepage` 扩到产品，2026-10-30T05:19Z）本版没有设计；第 9 步（放行一支）开工之前，附录先补这一节并再过一轮评审」，第 9 步的依赖段写同一句，§12 的 `d-design-onepage` 一行改为「部分满足：本项目的自查做了，产品里每个模块一次放行未设计」。

（图上 `m3` 05:38Z 的批注写「没赶上的在实现开工前补」，但附录正文、§9、§10 都没有把这件记下来，开工的人看不到；所以即使选 B，也必须在附录里留下这条可追的待办，否则需求既没满足也没留痕。）

### NIT

N1 NIT 第 7 步（面板拍板的回写）与面板设计 0.6 删 `/graph-apply` 相反

位置：第 7 步（附录:837–844）、§3.9「留下」一行（附录:636，「面板拍板的回写（§2.4 改为只发给持有者）」）、§2.4「其他读法」第一条（附录:200）、§9 第 1 条给 `m3-5` 第 2 条的新字句（附录:1126）。

问题：面板设计 0.6 §9.1 与 §11 第 6a 条写明 `/graph-apply` 整条删去（`APPLY_COMMAND`、注册、`apply` 写入分支），M3 附录第 7 步「没有了触发的地方，整步删去」，`m3-5` 验收第 2 条「说的事不再存在」。附录 0.4 把第 7 步照旧留着（L2 还建 `tests/graph-panel-apply.spec.ts`），§9 第 1 条给 `m3-5` 第 2 条提的新字句仍写「人在面板上拍板、批准或否决后……主 Agent 会话收到消息」。附录头声明按面板设计现行 0.6 读，这一处却是 0.5 之前的样子。不挡路（§1.1 四类都不沾，`/graph-apply` 的删除是面板设计的决定、不在本轮挡路所依据的接缝裁定或人定清单里；两设计的合入先后也能把它调和），但会留下一个建在被删命令上的步骤与一条面板设计已消灭的验收字句。

改法：第 7 步照面板设计 0.6 §11 第 6a 条整步删去，不建 `tests/graph-panel-apply.spec.ts`；§3.9「留下」去掉「面板拍板的回写」；§2.4「其他读法」第一条删去或改为「面板不再写图（面板设计 0.6 §9.1），持有者记录只供面板「去主 Agent 的对话回话」读」；§9 第 1 条给 `m3-5` 第 2 条改为「删去这一条（面板不再有拍板写回，面板设计 0.6 §9.1）」，与面板设计请编排方并进那批待人改的验收。

N2 NIT 面板设计要的「第二阶段常量下的 `propose_to_human` 契约测试」没有写进第 6 步

位置：第 6 步 L2（附录:819–822，`tests/propose-to-human.spec.ts` 的用例）。

问题：面板设计 0.6 §11 第 6c 条要 M3 的 `propose_to_human` 有一条契约测试：它组出的提议式待决交给真实引擎提一次，在写法检查第二阶段的常量下通过（`m8-plain-language` 0.6 §15/graph 批注第 7 条同样请了这件，是面板写法检查从第一阶段切到第二阶段的前提）。附录第 6 步的 L2 有 `propose_to_human` 的参数用例与 `renderProposal` 的逐字用例，但没有「交给真实引擎、在第二阶段常量下通过」这一条。不挡路（测试覆盖缺口，不沾 §1.1 四类，也不在本轮挡路清单里），但面板切第二阶段的前提 (b)(c) 会缺这条证据。

改法：第 6 步 L2 加一例：`propose_to_human` 组出的提议式待决交给真实引擎 `apply` 提一次，在 `PLAIN_LIMITS.background`（60）与第二阶段的写法检查常量下通过；注明它满足面板设计 0.6 §11 第 6c 条。

## 核实过的假设

1. ZCode 3.17.1（`reference/zcode-3.17.1/zcode.cjs`，实读）：`n8o`（@12945672）返回 `` `# Output Style: ${e.name}\n${t}` ``，标题与正文之间一个换行、无空行（§2.7 照此）；`r8o`（@12945672 相邻）返回 `${e.name} output style is active. Remember to follow the specific guidelines for this style.`（§2.7 判为不加）；`pBa`（@12792218）是有风格时的开头句原文，与 `src/glm-prompt/verbatim.ts:16` 的 `IDENTITY_OPENING_WITH_STYLE` 一致；`output_style_instructions` 是上下文条目（@13142888、@5008017 一带，不是系统提示词的固定节）；系统提示词组装（@12850435）没有 Output Style 一节。M6 的三处取舍成立。
2. 逐字门禁与常量（实读）：`IDENTITY_OPENING_WITH_STYLE` 在 `src/glm-prompt/verbatim.ts:15–16`，逐字门禁 `scripts/check-verbatim.mjs:242–245` 读它；`installDialect` 在 `src/glm-prompt/index.ts:200`；`src/guard/rules.ts:56` 已是 `ASK_THE_HUMAN`（`APPLICATION_PROTOCOL` 已删）。N3 成立。
3. 图引擎（实读）：`engine.ts:150` 对 `comment` 丢 `relay`、:151–154 非 `llm` 带 `relay` 拒绝、`privileged = human 或有 relay`；`initialStatus`（:417–428）待决挂在 `approved`/`doing` 的父节点下直接为 `approved`。§3.8 第二条 d、§3.4 第 5 条成立。
4. 阶段与有效阶段（实读）：`STAGES`（`schema.ts:18`）= wish、interview、design、release、decompose、execute、merge、operate；`effectiveStage`（`stage.ts:90–93`）proposed→wish/interview、approved/doing→`stage ?? null`。§3.8 第二条用的先后成立。
5. 命令行写图（实读）：`scripts/graph/cli.ts:70–96`，`show`/`open` 只读、其余 `op` 以 `llm` 身份 `apply`；`package.json` 的 `graph` 脚本是 `node … scripts/graph/cli.ts`。§3.8 第四条的认法（`npm/pnpm/yarn … graph`、`node … scripts/graph/cli.ts`）成立。
6. rc.3 运行时（实读）：`whenIdle`（agent-loop lib/index.js:870–875）等当前活动结束；`command-goal` 的附件固定文字 `Reference attachments for the goal objective.`、`source:{kind:'user'}`、无 `form`（lib/index.js:99–106）；`session-projection.stateOf`（lib/index.js:126–131）先 `materializeCells` 再读。N7、N12、§3.2 的投影读法成立。
7. 仓库 main：`fe0bace` 是写本版时的 HEAD 一带（`git log` 确认该提交存在，commit 说明「M4 design 0.3 written」）；`fe0bace..HEAD` 之间碰代码的改动不影响 M3 引的行号（抽查 `rules.ts`、`verbatim.ts`、`glm-prompt/index.ts`、`graph/engine.ts`、`stage.ts`、`schema.ts` 的行号都对得上）。
8. 人定与裁定的时刻（图实读）：`d-main-agent-peak-exempt` 2026-10-30T05:36Z approved（relay「主Agent应该不受高峰影响，随时回复的」）；`d-design-onepage` 2026-10-30T05:19Z 扩到产品（relay「两层循环加，我正想说这个事情呢」），正文写明「放行一侧归 M3（每个模块一次放行，四行方案）」；`m3` 05:19Z、05:38Z 批注要 0.4 对照这两条、没赶上的开工前补。
9. 接缝裁定原文（`design-context.md`「Seam rulings between designs」实读）：`attach`、背景上限归面板、`/wish` 归 M3 三条与 §3.13、§2.9、§2.6 一致。
10. 面板设计 0.6（实读）：§11 第 2 条背景 60；第 4 条 `isPersonMessage` 留在 M3；第 6a 条 `/graph-apply` 删、第 7 步删；第 6c 条要第二阶段常量下的 `propose_to_human` 契约测试。N1（本轮）、N2（本轮）、M8（第 3 轮）据此。

## 没有核实或不成立的假设

- 不成立（与人定相反）：高峰时主 Agent 自己少做/不做（§2.8 例题；本轮 M1，`d-main-agent-peak-exempt`）。
- 不满足（人定的需求没落地）：产品里每个模块一次放行归 M3（本轮 M2，`d-design-onepage` 扩到产品）。
- 过时（与面板设计 0.6 相反，不挡路）：第 7 步面板拍板回写与 `/graph-apply` 还在（本轮 N1）。
- 缺测试（面板 0.6 请求未落，不挡路）：第二阶段常量下的 `propose_to_human` 契约测试（本轮 N2）。
- 没有核实（接受）：`agent/created` 监听器里执行 `/wish off` 会不会与创建流程互等（附录已改为排到 `whenIdle()` 之后，列进 L3，N7）；探针里 `agents.create` 建第二个根会话、`fork` 第二个会话、`uiWorkspace.openSession` 第三方客户端注入（附录标〔推断〕并列进 L3 或 L4）；桌面版组合允不允许 `readBytes` 读用户目录下的持有者记录（面板设计 §4.9 的〔推断〕，L4）。
- 没有核实（不影响本轮判定）：`src/graph/proposal.ts`、`src/design/talk.ts`、`src/design/attach.ts`、`src/guard/git-snapshot.ts` 等新模块尚不存在（本就是设计稿要新建的），只按 §1.1 审设计而非实现。
