# metrics 设计：每个项目一份指标流水（项目图 `metrics`）

版本：0.6（2026-11-01，对齐轮的第三遍修改稿，只处理一条挡路的发现）。0.5 经第 4 轮独立评审（`design-review.md` 第 4 轮与 `align-1031-gate.json`）：CHANGES_REQUESTED，挡路 1 条（MEDIUM F49），非挡路 7 条（NIT F50–F56）；第 3 轮的 F40–F48 在那一轮全部关闭，挡路条数走向 11、6、2、1。停下的经过见同目录 `align-stop-report.md`。F49 的起因在 0.5 收尾（2026-10-31 22:53）之后：人在 23:44 定了 `d-ask-three-gates`（原话「都没问题。先这样改和试行吧，我看看效果」），它取代 §16 所用的四行问法，并点名指标设计跟着改；M3 附录 0.6 据此在节点 `metrics` 第 33 条批注里向本设计要了新的事件与字段。0.6 只改这一件事：§16 的两件待人定的事各改成一句是非问，推荐与理由在句子里；M3 附录 0.6 §3.12 的两种新事件（`design.delegation`、`design.proposal-refused`）收进种类表，两种旧事件加的五个字段收进字段表、都可选；跟随推荐的比例按 0.6 的口径算；文首、§0、§1、§2、§4.2、§4.5、§6.2、§7.2、§12、§14、§15、§17 里跟着它的说法同改。F50–F56 不挡路，本遍没有改。每处改在哪里见 §19.7，修订记录见 §18。评审过的 0.5 原文原样留在同目录 `design-0.5.md`（MD5 `E838AF2DD7C59FAE3DCF60A8723C4E61`，1106 行），0.6 的改动都在 `design.md` 里。没有改方向；种类总数多两种，都是 M3 的，本设计起名的种类不变。

下面一段是 0.5 的说明，原样保留。

0.5 的说明（2026-10-31，对齐轮的第二遍修改稿）。0.4 经第 3 轮独立评审（`design-review.md` 第 3 轮与 `align-1031-gate.json`）：CHANGES_REQUESTED，挡路 2 条（MEDIUM F40、F41），非挡路 7 条（NIT F42–F48）；第 2 轮的 F23–F39 在那一轮全部关闭。本稿逐条处理，每条在哪里怎样改见 §19.6，修订记录见 §18。评审过的 0.4 原文原样留在同目录 `design-0.4.md`（MD5 `8D95556421F5838EE7AA6EDF345E01EE`，1079 行），0.5 的改动都在 `design.md` 里。0.5 的改动只有这几类：撤下一条规则的路与 `lift.via` 的取值跟 M4 现稿对齐（F40）；超时值的来源由三种变五种，加预计用时与下限两个字段，对规则板、循环板、M7 的请求改成编排方 2026-10-31 的裁定写法（F41）；`bootstrap.trial`、`progress.due`、`metrics-files-only` 的判法、读密钥文件的措辞、§16 的两句疑问和变更记录里的一处不实（F42–F48）。没有改方向，没有新增种类，种类总数不变。

下面几段是 0.4 的说明，原样保留，只改 F45 指出的一处不实（草稿对 F27 只做了一半，原文写成「做完」）。

0.4 的说明（2026-10-31，对齐轮的修改稿）。0.3 经第 2 轮独立评审（`design-review.md` 第 2 轮与 `align-resume-gate.json`）：CHANGES_REQUESTED，挡路 6 条（MEDIUM F23–F28），非挡路 11 条（NIT F29–F39）。0.4 逐条处理，每条在哪里怎样改见 §19.4，修订记录见 §18。评审过的 0.3 原文原样留在同目录 `design-0.3.md`（MD5 `B2F9F30C811AE1917FE0B03D88FACB23`，964 行）。

0.4 分两层来。第一层是上一位作者在评审之后写进 `design.md` 的草稿：他的会话在 2026-10-31 机器重启时丢了，没有交报告，草稿按作者已离开处理，原样存为 `design-0.4-draft.md`（MD5 `E07882318FCC9404B8C65D6AD3780711`，985 行，修改时刻 12:44）。草稿已经做完 F23、F24、F25、F26 与 F29–F36、F38 的正文改动，F27 做了一半（字段名 `cmdId` 与接管 0.6 的试跑记录不同，依据一节的历史条数、提交与邻居版本过时，见 §19.4），F28（§16 的四行超长）、F37、F39（§17 由谁建文件）没有做，§18 没有 0.4 一条，文首引用的 §19.4 不存在，没有半写的小节。第二层是 0.4：逐条核对草稿后保留做对的、补上缺的，并把人 2026-10-31 定的五条（`d-code-rules-enforce`、`d-credentials-readable`、`d-timeout-measured`、用户图的额度与汇报两件、`d-desktop-direct-use`）折进来；这五条是人的决定，不是新开的设计问题，没有改方向。草稿的状态与每处取舍见 §19.5，五条决定落在哪里见 §19.1 末尾几行。

下面一段是 0.3 的说明，原样保留。

0.3 的说明（2026-10-31，对齐轮完成版）。0.2（2026-10-30）按第 1 轮独立设计评审 F1–F22 修订，只写到 §10，文末留着一行 `%%NEXT%%`，§11–§19 没有写成，也没有评审过。对齐轮的第一次动手（2026-10-31 凌晨，账号额度用完时断掉）把文件标成 0.3，改了文首、§0、§1.1 的一条、F1、F5 与验收第 3、4、5、7、10、11、14 条，文首却已经写着「§11–§19 补完」，而 §2–§10 仍是 0.2 的原文，文末仍留着 `%%NEXT%%`。本稿接着把它做完：先把盘上那份当作作者已经离开的草稿，逐节对照 0.2 与对齐轮的输入判断完整性（结果见 §19.3），再改掉 §2–§10 与验收里仍写着用户级目录、机器级流水、旧版本号和旧文件名的地方，补写 §11–§19。版本号仍是 0.3：0.3 从未完成过，也没有放行过，不需要另起一号。

本稿做两件事。一、按人在 0.2 之后定的决定和已放行设计的现行版本改（`d-rules-in-repo`、`d-memory-scope`、`d-main-agent-peak-exempt`、`d-boards-as-hooks`、`d-script-timeout`、`d-agent-examples`；规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6；面板 0.7 对写图的方的说明），主要的一处是用户级目录里不再放任何指标文件（§3.3、§3.5、§5.5）。二、补完 §11–§19，其中 §16 的待人定两件、按四行写。0.2 原文原样留在同目录 `design-0.2.md`（MD5 `9F4EC6D609B56C6D41C7A9EEE4190F80`，只有 §0–§10）；0.1 在 `design-0.1.md`（MD5 `7C74656E2BC0B654DC0B0829AE25EFDC`），第 1 轮评审的行号指 0.1。每处改动答的是哪一条决定或发现，见 §19.1；第 1 轮 F1–F22 各在哪里处理，见 §19.2；盘上草稿的状态与处理见 §19.3。

依据：main `aaab499`（2026-10-31 读；`src/`、`scripts/`、`packages/` 自 0.3 草稿依据的 `9c346fb` 起只动了 `src/data/lock.ts` 与 `src/execute/`，与本设计读到的文件无关，其余提交动的是 `video/`、`docs/` 与项目图；0.5 重读时 main 在 `3cd6773`，`git diff --stat aaab499 HEAD -- src scripts packages` 为空，所以代码一侧的核对不变）；项目图节点 `metrics`（2026-10-29 人批准，原话「指标能全记就全记下，b直接做」；节点上到 2026-10-31T05:51Z 的 29 条历史，0.5 重读时多一条第 30 条（13:15Z，第 3 轮评审结论），没有新的决定或请求，其中循环板 0.5 与 0.6、规则板 0.9、M7 0.5、面板 0.7 对本设计的输入清单变化已并入；0.3 只读到 11:58Z 的 25 条，漏了第 26、27 条（F27）：26 条是 21:02Z 接管 0.5 对本设计的依赖，要「命令 id、结果、耗时、envKey」，种类与字段请本设计定，已答，见 §4.2、§4.5 的 `bootstrap.trial`；27 条是 21:23Z 的 M4 0.5 接缝说明，标明「未变」，内容 0.3 已收；第 28 条是 21:57Z 的 M6 0.5 说明，已并入 F4、F27 的处理；第 29 条是 05:51Z 的编排方批注，交代本稿的任务）；人定的决定节点 `d-rules-in-repo`、`d-memory-scope`、`d-main-agent-peak-exempt`、`d-boards-as-hooks`、`d-script-timeout`、`d-agent-examples`、`d-chat-not-cards`、`d-one-main-agent`、`d-design-onepage`、`d-plain-questions`、`d-dogfood-scope`、`d-freeze-until-dogfood`、`d-alignment-rounds`，以及人 2026-10-31 的四个：`d-code-rules-enforce`、`d-credentials-readable`、`d-timeout-measured`（含编排方 07:04Z 的更正、08:17Z 与 12:56Z 的两条裁定：预计用时与 3 倍、下限写在上限旁、给循环板、规则板与 M7 的请求写成第一次超时＝3 倍估计）、`d-desktop-direct-use`，以及编排方记在 `d-code-rules-enforce` 与 `user-journey` 上的撤下裁定 `d-one-lift-path`（07:04:52Z 与 12:56:13Z 两条，没有独立节点），另有用户图节点 `user-journey` 在 2026-10-31T05:37Z 与 T05:51Z 的两条批注（额度重置后自动接上；做完一点汇报一点或等收菜，人确认「都没问题」）；`.agents/tasks/design-context.md` 全部各节；`docs/CHARTER.md` 0.8（§3.2 第 3 条、§6、§7.1 条款 7 与 11、§8、§9 存放表；0.8 取代 0.7 关于代码规则先影子的写法，并写明超时怎样定）；`docs/DESIGN.md` §2.4、§2.4a、§2.5；`docs/ORCHESTRATION.md` §2.9.1、§10、§11、§12、§16；`docs/DEVELOPMENT.md` §1.1；本仓库源码 `src/data/project-root.ts`（`projectOf`、`gitDirOf`、`ensureIgnored`）、`src/data/lock.ts`、`src/memory/audit.ts`、`src/memory/index.ts`、`src/workflow/index.ts`、`src/workflow/morning-report.ts`、`src/report/index.ts`、`src/shared/data-home.ts`、`src/shared/lm-min.ts`、`src/shared/peak-mode.ts`、`src/graph/engine.ts`、`src/graph/tools.ts`、`src/graph/run-control.ts`、`src/graph/cli.ts`；已有流水 `.llm/audit/decisions.jsonl`、`violations.jsonl`。本稿不引 ZCode 包内的事实（`d-zcode-3171` 不涉及）。0.6 的补充（2026-11-01 重读）：节点 `metrics` 现有 34 条历史，0.5 读到第 30 条。第 31 条（15:02Z）是 0.5 写出的说明；第 32 条（19:34Z）是 M4 0.6 的接缝说明，内容与 0.5 已收的相同（拦下、跟进、撤下、申报与放行，检查超时值的调整与超时，每天的压制计数）；这两条都不用处理。第 33 条（20:01Z）是 M3 附录 0.6 对本设计的请求，0.6 收下（§4.2、§4.5、§7.2、§16，逐项见 §19.7）。第 34 条（2026-11-01T01:25Z）是第 4 轮评审停下的记录，它写的下一步就是本遍。决定节点加 `d-ask-three-gates`（2026-10-31T15:44Z 人定，试行）。代码一侧 0.6 没有重读：main 现在是 `061bd32`，`git diff --stat aaab499 HEAD -- src scripts packages` 列出 25 个文件（主要是 M6 的额度一片），其中本设计依据里列的有 `src/memory/audit.ts`、`src/workflow/morning-report.ts`、`src/report/index.ts`、`src/shared/pricing.ts` 四个；F49 不碰这几处，实现前按 §12 第 1 步一并重读。

兄弟设计（读时的版本，F18）。已放行的四份优先于本设计，本稿不改它们：规则板 `.agents/tasks/rules/design.md` 0.10（含同目录 `design-amendments-followup.md` 的六条修订；§7.1 文件、§7.3 项目根、§9.4 命令行、§10.5 事件表 15 种）、循环板 `.agents/tasks/schedules/design.md` 0.6（§2.1–§2.3 条目形状、§3.1 服务、§6.10 事件表 11 种与「写到哪里」、§9.1 文件、§17）、M3 附录 0.5 连同 `design.md`（§3.12 事件表 8 种、§3.13 `attach`、§3.14 模块放行；0.5 原文现在在 `.agents/tasks/m3/design-addendum-0.5.md`，`design-addendum.md` 已是 0.6，见下一句）、M7 `.agents/tasks/m7/design.md` 0.6（§3.16 事件表 23 种和它对本流水的说明、§2.1 运行时文件）。M3 附录 0.6（`.agents/tasks/m3/design-addendum.md`，2026-11-01 03:26 修改；`d-ask-three-gates` 的试行，只改问人这一件事；第 3 轮评审 APPROVED，挡路 0 条，`reviews/addendum-v06-review.md` 03:51；编排方已按它恢复 M3 的实现，节点 `m3` 2026-10-31T20:01:32Z）：0.6 读了它的文首、§2.8 的换词表与例题、§3.2 到 §3.4 里讲问法与硬限制的几处、§3.12 的事件表（10 种）；它不在已放行的四份里，它对本设计的请求按人已定的 `d-ask-three-gates` 收下（§19.7）。仍在同一轮对齐里的邻居，0.3 读的是 2026-10-31 02:00 前后的盘上稿，草稿在 06:00 前后重读过一遍，0.4 在 14:40 前后按盘上现行稿再读了会碰到字段的几处，0.5 在 22:40 前后按盘上现行稿又读了一遍（邻居仍在被别的步骤改，下面只写节号与符号名，不写行号）：M4 `.agents/tasks/m4/design.md` 0.6（22:37；未评审：§3.2 的记录类型与 `LiftRecord`、`classifyRecord`，§3.3 跟进，§3.5 撤下只有一条路（`guard_lift` 与规则板的 `/rules lift`）与服务 `glmHournessLifts`，§3.11 交给本流水的事件，§6.3 与 §6.3.1 检查的超时；§6.3.1 的 `ValueLine`、`TimeoutLine` 已在盘上，0.5 对着它们核过 `timeout.set`、`timeout.hit`，对应写在 §4.2 `timeout.set` 一行之后）、M6 `.agents/tasks/m6/design.md` 0.6（21:15；§14.2 四类事件的字段与 0.5 相同，§7.2 写超时）、plain-ui `.agents/tasks/plain-ui/design.md` 1.1（21:00；§4.7 超时的数与拦下记录、§4.8 的两种行、§11、§1.0 的对接第 5 条与第 46 条，它写的「指标流水设计 1.0」指本设计，本设计现在的版本号是 0.6）、接管 `.agents/tasks/bootstrap/design.md` 0.6（20:50；复核第 1 轮修订之后：试跑流水一节的 `trial` 记录是 `round`、`commandId`、`outcome`、`limitMs`、`limitSource`、`ms?`、`log?`、`envKey`，`exit` 只在 `trial.json`，§2.5 写超时，读项目门禁的撤下并入 M4 的那一条路、没有 `unlock-shell`）、用户图 `.agents/tasks/user-journey/journey.md` 0.6（20:56；§5.2 额度、S10 汇报、缺口 G15、G18、G26、G28 与 §6.3 的请求）。邻居在这一轮可能再出新稿；各名字空间的种类表以实现时各自那一节的现行版本为准（§12 第 1 步、§14）。

证据写法沿用 `docs/DESIGN.md` §2.4a：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行号；`types.d.ts:行` 指 `node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts`。〔实读〕读过源码；〔推断〕由源码推出、没有运行验证；〔未核实〕列进 §11，实施时先核实。

## 0. 摘要

- 每个项目一份只追加的事件流水：`<项目根>/.llm/metrics/events-<UTC 日期>.jsonl`。全部文件都在项目的 `.llm/` 里，用户级目录里没有指标文件（`d-rules-in-repo`、`d-memory-scope`、`CHARTER.md` 0.7 §9：用户级只留登录凭证、关于人的记忆、整个账号的额度与用量）。项目根用仓库里已有的 `src/data/project-root.ts` 的 `projectOf(cwd)`（返回 `{root, git}` 或 `undefined`，规则板 0.10 §7.3 的同一个函数，工作树归到主检出），不用数据目录服务里钉死的 `projectHome`，也不另写第二份。第一次建 `.llm/` 之前调同一个文件里的 `ensureIgnored(root, '.llm')`，`metrics/` 里另放一个只写 `*` 的 `.gitignore`。`projectOf` 返回 `undefined` 的会话，以及发送方答不出项目的事件，不写，只计数；0.2 加的机器级流水随 `d-memory-scope` 取消（§3.5）。
- 信封加正文的两层格式（F1）：信封由本设计定（`s`、`k`、`at`、`w`、`n`、`h`、`v`、`by`、`sid?`），正文按名字空间各一张闭合表——本设计自己的种类，加规则板 0.10 §10.5（15 种）、循环板 0.6 §6.10（11 种）、M7 0.6 §3.16（23 种）、M6 0.6 §14.2（4 种）、M3 附录 0.6 §3.12（10 种；人放行过的 0.5 是 8 种）已经定好的那些，另加接管 0.6 请的 1 种（`bootstrap.trial`，§4.2），以及人 2026-10-31 的决定要而兄弟设计还没有的 5 种，由本设计起名：超时取值的变更与每次超时 `timeout.set`、`timeout.hit`，撤下一条代码规则 `lift`，汇报的到期与交付 `progress.due`、`progress.handover`（§4.2）。字段名与类型的来源见 §4.5：兄弟设计写了名字的逐字取，只写了内容的由 §4.5 起名，取值清单留在兄弟设计里、本设计不抄。表放在 `src/metrics/kinds/<名字空间>.ts`。本设计不另造 `task` 与 `upstream` 种类，也不要兄弟设计改用本设计的词汇。
- 只有 harness 写。新行（id `glm-hourness/metrics`，导出名 `dsh-hourness/metrics`，编排层包，出厂 `disabled: true`，F15）是唯一的写入者：它自己挂在 DSH 的通用接缝上记每一次模型调用、每一次工具调用、回合、审批、命令、问题与人发的消息（F10）；别的行与 GLM 通道包经进程内服务 `glmHournessMetrics` 交各自名字空间的事件。DSH 之外的一次性进程（规则板的 `checkCall`，命令行 `check` 与 M6 的 `gateOnRules` 都经它判定；循环板之外的脚本）经 `appendEvents` 库写入口写，调用方 `await` 它再退出，事件不丢（F4）。模型说的数一律不收。指标行的写入和自查既不是子 agent 也不是重活，高峰模式的三档（`d-main-agent-peak-exempt`）都不管它；本流水没有给主 Agent 的工具，所以也没有要写的示范（`d-agent-examples`）。
- 记的是数与引用，不记文字：闭合的字段表，字符串只许 id 形状，数组至多 32 项、只放 id 或整数，记录只一层、键与类型在表里声明；不合规的整条拒收并计数。文件路径记每个项目一份密钥的 HMAC 散列（密钥放在项目的 `.llm/metrics-key`，在 `metrics/` 目录之外，导出流水时不带它，F16），shell 命令只记第一个词。
- 写入失败不挡工作：失败的事件留在有上限的内存队列里按序重试，溢出时丢队首之后最早的一条（队首正在重试，不丢，F17）并在恢复后写一条 `gap`。每行带写入者 id、序号与链式摘要。核对不只在有人跑命令时做：指标行激活后在后台对前一天与当天各核对一次，结果进行健康与 `/hourness` 的覆盖行；另有一条每天一次的编排层自查条目（循环板 0.6 的默认条目，F6；条目自带一句 `tell`、`wake` 为假，干净时循环板记 `skipped`，有发现时把这句 `tell` 交给主 Agent 而不叫醒它，§6.4，F25）。整天的文件只有人能删，删前先写一条 `prune`；每个新的日文件先登记在项目的 `.llm/metrics-manifest.jsonl`（文件清单，在 `metrics/` 目录之外），核对时对着它，少了文件就报出来（F7）。整个 `.llm/` 被删（`git clean -fdx`、换电脑重新克隆）时清单跟着没了，这一种发现不了，流水也回不来，只有图历史能由 `backfill-graph` 补回；这是 `d-rules-in-repo` 把运行记录放在项目 `.llm/` 里的代价，M7 0.6 对自己的 `.llm/execute/` 也这样接受，§5.5、§9.3 写明。
- 报告从流水算，分「事实」与「打分」两类（F9）：事实（几件做完、几件在等人、哪次检查没过、记录缺了几行、覆盖范围）可以经主 Agent 的对话给人；打分（原样同意率、被拦率、返工次数、检查一次通过率、按模型或版本的比较）只给命令行与以后的面板，不进模型上下文（`CHARTER.md` §8）。周报要不要把比率经主 Agent 的对话给人，与 M7 0.6 §3.12.4 写的做法不一致，是要人定的方向（§16 ②）。真实流水上复现旧报告靠依据行里的文件前缀加 `--basis`（F8）。
- 已有的数（用量、违规、额度、规则板状态、项目图历史、会话日志）各管各的；指标流水对它们只记数与引用。违规流水随 M4 的 G1 搬进会话所属项目的 `.llm/audit/`（M4 0.6 §2.4），仍是另一份流水，不并进指标流水（M4 0.6 §3.11 的裁定）。只有派遣决策流水 `decisions.jsonl` 被完全取代，它的写入行 `glm-hourness/workflow` 在最后一步退役，这一步做独立评审并排在 M3、M7、M4 动同一批文件之后（F11）。本流水的实施在自举之后（`d-dogfood-scope`）。M7 0.6 的「怎样算做完」不要求它存在：M7 的晨报与周报一直从图、检查与前进的记录、违规流水和用量流水算（M7 0.6 §3.12.4、§3.16），本设计不改它们读什么，也没有任何一步让它们改读本流水（F26）；M7 §3.16 留给本流水的一项核对（表里每类事件都在种类表里）算本流水的验收（§1.4 第 5、11 条、§7.3、§14）。
- 问人只按对话路径量（F2）：`propose_to_human` 与 `record_human_answer` 的事件（M3 附录 §3.12：0.5 有提议与回话两种，0.6 起另有「这类你定」与问话被拒两种）给出问人的次数、字数、等待与人原样同意/补充/否掉的次数；卡片与先想后看不再有（plain-ui 0.6 已取消）；跟随推荐的比例 0.6 起按问法从回话事件算，人说「你定」的那几次除外（§7.2，F49）。
- 量不到的照实写：人在系统外花的精力、读懂了没有、做出来的东西好不好用、跟了的推荐对不对，只能靠真实项目试用（`field-trial`）与人的反馈。
- 人 2026-10-31 的五条决定落在这里（逐处见 §19.1 末尾几行）。一、写在代码里的规则（本设计只有 `metrics-files-only`）从指标行启用那天起就拦，没有影子期、试运行期和转正的台阶：字段表里没有只为转正而存在的事件、计数或标签；拦下带规则 id 记成 `rule` 事件，撤下记成 `lift` 事件，事实里按规则 id 列拦下次数和撤下（§3.4、§4.2、§7.2）。二、agent 可以读密钥文件：本设计不为读文件另设规则、事件或标记，读密钥文件在流水里就是一条普通的 `tool` 事件（§1.6）。三、超时从写脚本的 agent 估的预计用时算起（编排方 2026-10-31 的裁定：超时一律是预计的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用条目写明的缺省，不低于发送方的下限、不超过现有上限）：每个超时值的变更记 `timeout.set`（来源共五种，另有预计用时、时间、旧值），每次超时记 `timeout.hit`（条目、限、用时、结局），报告和晨报的事实里都有（§4.2、§7.2）；指标行自己没有脚本或检查的超时，它的等待是固定值，到时放弃、不崩（§9.2）。四、额度用完时推进停住、重置后自己接上，以及做完一块汇报一两句、人不在时攒着、回来一起交、整个目标做完一句带整体审查的结论：额度的停住与接上由 M7 的 `execute.goal` 与 M6 的 `glm.upstream-limit` 的事件算，汇报的到期与交付记成 `progress.due`、`progress.handover`（§4.2、§7.2）。五、验证可以直接用桌面版、含重启，不必先告诉人（§12、§13）。
- 待人定：两件，在 §16，各是一句是非问，推荐与理由在句子里（`d-ask-three-gates` 的确认推荐问法，形状以提问时 M3 附录的现行版为准，F49）。① 这几件活怎样算做完（D1，必须问人的第 1 类，`ORCHESTRATION.md` §2.9.1），并进一页放行稿「要你定的」一节问（F3）；② 周报里的比率能不能经主 Agent 的对话给人（与 `CHARTER.md` §8 和 M7 0.6 §3.12.4 有关，方向性岔路）。

## 1. 需求与验收

### 1.1 来源

- 人 2026-10-29：「还有为了后续项目的优化，能不能做到所有指标都可以量化记录啊？」；批准时「指标能全记就全记下，b直接做」。
- 节点 `metrics` 正文（已批准的范围）：每个项目一份只追加的事件流水，固定格式，只记数与引用、不记对话正文；每一步的模型、token 与积分、用时、工具调用与被拦次数、派活、审查发现、返工、合入、失败与重试、问人的次数、人读了多少字、拍板等了多久、是否跟了推荐，都由 harness 写，模型写的数不算；晨报、周报、各种指标都从这一份算，同样的输入算出同样的数。量不到的照实写。
- `docs/CHARTER.md` §3.2 第 5 条（减负只量系统里看得到的数）、§8（只看曲线；指标不注入模型上下文；基线从早采集）、§7.1 条款 11（处处留痕，一处动作一个事实源，别处引用）。
- `design-context.md`：`d-main-agent-models`（主 Agent 选每个子 agent 的模型并写明理由，harness 只记录）、`d-one-main-agent`（报告在主 Agent 的对话里给人）、`d-auto-drive`、`d-chat-not-cards`（问人是对话里的一个方案，不出卡与选项）、「Two-level loop in the product」（两层循环）。
- 0.3 加的依据：`d-rules-in-repo`、`d-memory-scope`（运行时的东西进项目的 `.llm/`，用户级目录只留列定的几样；指标流水在项目里，`CHARTER.md` 0.7 §9 存放表）；`d-boards-as-hooks`、`d-script-timeout`（两块板的事件表多了脚本、超时、晚到的拦下，循环板的 `loop-done` 多了 `refused` 与 `unfinished`）；`d-main-agent-peak-exempt`（高峰模式不管主 Agent，也不管指标行）；`d-agent-examples`（本流水没有给主 Agent 的工具，没有要写的示范）；`d-dogfood-scope`（实施在自举之后）；`d-freeze-until-dogfood`（已放行的设计不接新请求，本设计对它们的请求只写成批注，§14）；节点 `metrics` 上 2026-10-30 的批注：循环板 0.5 与 0.6（事件表变化、`loop-read` 挪进项目、运行记录合入后写 `.llm/metrics/`）、规则板 0.9（多四种事件、库写入口按项目根找 `.llm/`）、M7 0.5（验收不再依赖本流水）、面板 0.7（`/graph-apply` 删去后写图的方）。
- 0.4 加的依据（人 2026-10-31，宪章 0.8 已写入前三条）：`d-code-rules-enforce`，原话「试运行规则啥的直接拦就行了，这样反而有问题好发现」（写在代码里的规则从所在插件行启用那天起就拦；删掉只为转正而存在的事件、计数与标签；每次拦下带规则 id 记下，规则页与晨报看得见；人一句话或一条命令撤下一条规则；新插件行默认禁用、验证过才启用）；`d-credentials-readable`，原话「密钥文件能读」（agent 可以读密钥文件，不为这次读另记一条；它在流水里只是一条普通的 `tool`）；`d-timeout-measured`，原话「超时那就这样定。不过还是我说的现在拿不准的事情，要做到优雅失败以及可追溯性」（agent 先估预计用时，超时是预计的 3 倍，跑过之后用最近最慢一次的 3 倍，不超上限、不崩不丢、来源与每次超时留痕）；用户图两件，原话「额度重置后自动接上」与「做完一点汇报一点，或者等收菜」（后者人对编排方的读法回「都没问题」）；`d-desktop-direct-use`，原话「桌面版你直接用就行，现在又不是高峰期为什么不放行」（验证可以直接用桌面版，含重启，不必先告诉人）。
- 0.6 加的依据（人 2026-10-31 23:44）：`d-ask-three-gates`，原话「都没问题。先这样改和试行吧，我看看效果」（问人分三道关：该不该问、什么时候问、按种类怎么问；记录与问话分开；取代 `d-chat-not-cards` 的固定版式、`d-plain-questions` 的四行版式与「不列选项」，节点写明指标设计跟着改）；M3 附录 0.6 据此对本设计的请求（节点 `metrics` 第 33 条批注：提议事件加问法与给人读的字数，回话事件加「你定」与是否选了推荐的那条路，另加「这类你定」与问话被拒两种事件，跟随推荐的比例按问法算，§16 改成一个问句）。

### 1.2 功能需求

| 编号 | 需求 |
| --- | --- |
| F1 | 每个项目一份只追加的事件流水，放在项目的 `.llm/` 下，固定格式，可轮换，不入库；用户级目录里没有指标文件；不属于任何项目的事件不写、只计数 |
| F2 | 每一步记：模型与 provider、token（输入、缓存读、缓存写、输出、推理）、积分与是否高峰、用时与首字用时、结束原因、本步发出的工具调用数；每次工具调用记：工具与类别、结果（成功、出错、被拦、被审批拒）、用时、结果大小；每次被拦记：规则 id、拦截方，引用违规记录；人撤下或恢复一条代码规则也记一条（需求 F13） |
| F3 | 任务各阶段的记录由 M7 的 `execute.*`、`operate.*` 事件给（本设计收下、不另造）：派发、计划、交回、审查、门禁、合入、重开、失败与重试，含主 Agent 选的模型与理由所在的节点序号 |
| F4 | 问人只按对话路径记：每次 `propose_to_human` 记一条、每次 `record_human_answer` 记一条（问了什么的引用、种类、字数、等待、人原样同意/补充/否掉）；另单独数 DSH 原生问题与审批；0.6 起（`d-ask-three-gates`）另记问法、给人读的字数、人是否说了「你定」、是否选了推荐的那条路，「这类你定」的存下与撤下、问话被拒各记一条 |
| F5 | 项目图的每一次成功写入，为它追加的每条历史各记一条 `graph`：节点、类型、操作、历史序号、状态的前后、身份、是否转述；写入失败另记一条 `graph-fail`：身份、错误码，目标节点与出错字段有就记（失败没有历史序号与修订号，F23）。引擎的写入方有图工具（模型和 harness）、命令行、人自己的 `/graph-run`，以及 M3 的 `record_human_answer`、接管的 `bootstrap_apply`、M7 的 harness 写入，全部经同一个 `apply`，由引擎的观察者统一看到，调用方不必各自传东西（F24，§6.3）；面板不写图（plain-ui 0.7） |
| F6 | 只有 harness 写；模型报的数不收；没有工具能写这份流水；模型的选择（选了哪个模型、哪个理由）作为「选择」记，不当量出来的数用 |
| F7 | 报告与比较从这份流水算；同样的输入得到逐字相同的输出（真实流水上也能复现）；能按 harness 版本、模型分组比较；报告的数由 harness 算，不经模型；给人的数分事实与打分，打分不进模型上下文 |
| F8 | 隐私：只记数与引用，不记对话正文、工具参数、文件内容、路径原文、命令全文、错误文字、凭证与请求头；人发的消息只记条数、字数与附件数，不记内容 |
| F9 | 写入失败不挡工作，能被发现并上报（不只在有人跑命令时）；记录跨重启保留；整天的文件不被悄悄删掉；事后能追到原因（`DEVELOPMENT.md` §1.1） |
| F10 | 已有的数（用量、违规、决策、项目图历史、额度、标定结果）盘点清楚，能并的并，不能并的只引用，不重复存一份当第二个事实源 |
| F11 | 写明量不到的，交给 `field-trial` 与人的反馈 |
| F12 | 超时（0.4 新增的需求，`d-timeout-measured`）：脚本与检查的每一个超时值，每次变更记来源（agent 估的、harness 按实测算的、被上限截住的）、时间与旧值；每一次超时记条目、限、实际用时与结局；3 倍超过上限、保持上限并告诉了主 Agent 也记一条。这些记录进事实（报告与晨报能列），不进打分 |
| F13 | 拦下与撤下（0.4 新增的需求，`d-code-rules-enforce`）：代码里的规则启用即拦，所以记录里没有影子、试运行、转正进度这类事件、计数或标签；每次拦下带规则 id；人撤下或恢复一条规则记一条，事实里按规则 id 列近期拦下次数与撤下 |
| F14 | 用户走一遍的两个时刻（0.4 新增的需求，用户图 2026-10-31）：额度用完时推进停住与重置后自己接上，从 M7 的 `execute.goal` 与 M6 的 `glm.upstream-limit` 的事件算停了几次、停了多久、自己接上几次；目标里每做完一块（模块或里程碑）的汇报、人不在时攒着、人回来一起交，记 `progress.due`、`progress.handover`，整个目标做完时的那一句带整体审查的结论也在其中 |

### 1.3 非功能需求

- 开销：每次模型调用与工具调用多一次内存操作与一次追加写；不加锁等待、不阻塞流。一行至多 4 KiB。
- 体积：估计重度使用一天 0.5–1.5 MB（§5.3），一年数百 MB 以内。
- 两个包各自单独装上都能工作：只装 GLM 通道包时没有指标流水（没有写入者），GLM 包的行照常；只装编排层包时没有 `glm.*` 事件与积分。
- 激活期不抛错（`AGENTS.md`）；行健康上报（`DESIGN.md` §2.5）；不新增告警。
- 指标不注入模型上下文（`CHARTER.md` §8）：流水与报告里的「打分」只给人与命令行、面板看，不进每步投影、提醒或系统提示词；经主 Agent 对话的报告只用「事实」（F9、§7.3）。

### 1.4 验收条件（草稿，D1 由人定）

1. 指标行启用后，L3 探针的 GLM 场景与非 GLM 场景里，每次模型调用在 `<ws>/.llm/metrics/events-<日期>.jsonl` 恰好留下一条 `llm` 事件：provider、model、各类 token 与该次 `usage` 块相同，`ms` 大于 0，`fin` 与流的结束原因一致，`turn`、`step` 与 `agent/request` 给的一致；同一次调用在用量流水里的那一行 token 数相同。人在该会话里发的每条消息恰好留一条 `said`，`said` 的条数等于人发的消息数（不含 notice、runtime-context 与子会话继承的首条提示）。
2. 同一探针里，`tool` 事件的条数等于会话日志里 `tool/call` 事件的条数；被 guard 拦下的调用 `out` 为 `denied`，同一 `call` 有一条 `rule` 事件，它的 `ref` 等于违规流水里那一行的记录键（M4 §3.2 的 `recordKey`）。
3. L2：项目图引擎的写入都经 `apply`，引擎的观察者（`setEngineObserver`，§6.3）在 `apply` 里统一通知，不靠调用点各传一个选项（F24）。写入方今天有：图工具（模型与 harness 的身份）、命令行 `npm run graph`、人自己的 `/graph-run`（plain-ui 0.7：`/graph-apply` 已随面板的写入删去，面板不写图）、M3 的 `record_human_answer`（`src/design/record.ts`，M3 实现时）、接管的 `bootstrap_apply`、M7 的 harness 写入。一次成功的写入，为它追加的每一条历史各留一条 `graph` 事件，带节点、类型、操作、历史序号、状态前后、身份、是否转述，补录时没有 `rev`；一次写入失败留一条 `graph-fail` 事件，带身份与错误码，`node`、`field`、`op` 有就带（失败时没有历史序号与修订号，F23）。一次 `comment` 恰好一条 `graph`；一次改了多个节点的写入（批准并取代旧节点）每个被改的节点各一条，每条的字段取值与该节点最后追加的那条历史逐字相同。静态检查：`src/` 里只有 `src/graph/engine.ts` 导入 `writeNodes`，且只在 `commit` 里调用，调用之后紧接着通知；`openEngine` 返回的 `apply` 只有一个实现，即包住内部 `apply` 的那个通知包装（失败的返回，含解析失败与校验失败的提前返回，都经它）。再加行为测试：对每个失败码（`invalid`、`forbidden`、`not_found`、`bad_transition`、`conflict`、`stale_revision`、`graph_invalid`、`evidence_required`）各造一例，恰好一条 `graph-fail`。不再维护调用点清单。
4. L3（假的设计行）：一次 `propose_to_human` 与一次 `record_human_answer` 各留恰好一条事件（`design.proposal-shown`、`design.answer-recorded`），`answer` 取自调用参数，等待毫秒数等于两段会话事件 `time` 之差；一次放行写下 N+1 条图历史时，`design.answer-recorded` 仍只有一条（plain-ui 0.7 §5.6 的计数单位）；模块放行（M3 附录 0.5 §3.14）的那两条事件带模块 id。0.6 起（M3 附录 0.6 §3.12，F49）：`kind` 为 `question` 的提议事件带 `form` 与 `points`，回话事件带 `form`，人对眼前一件说「你定」时 `delegated` 为真；一次 `record_human_answer` 的 `delegation` 留一条 `design.delegation`、不留 `design.answer-recorded`；一次被拒的 `propose_to_human` 留一条 `design.proposal-refused`、不留 `design.proposal-shown`。另 L2 对夹具算跟随推荐的比例：`recommend` 的 `agree`、`choose` 的 `agree` 且 `pickedRecommended` 为真、`choose` 的 `agree` 且 `pickedRecommended` 为假、`delegated` 为真的 `recommend` 的 `agree`、`want` 的 `agree` 各一条，比例是 66.7%（3 条里 2 条），`delegated` 与 `want` 两条不进分母；这个比例在 `scoresFor` 里，不在 `factsFor` 里。一次 `userQuestions.ask`（DSH 原生问题，非主 Agent）留 `ask` 与 `answer` 两条，`q` 相同。
5. 种类表与兄弟设计一致（F1，也是 M7 0.6 §3.16 留给本流水的那一项核对）：L2 对每个名字空间（`rules.*` 15 种、`loop-*` 11 种、`execute.*` 与 `operate.*` 23 种、`glm.*` 4 种、`design.*` 与 `git.*` 10 种（照 M3 附录 0.6 §3.12 抄；人放行过的 0.5 是 8 种，F49）、`bootstrap.*` 1 种）以及本设计自己的种类（§4.2 第一张表，其中 `graph` 与 `graph-fail` 是两个种类，F23；加 `lift`；加「人 2026-10-31 的决定要的种类」一节的 `timeout.*` 2 种与 `progress.*` 2 种）把测试里写死的种类清单（照各自那一节抄）与 `src/metrics/kinds/<名字空间>.ts` 逐个比对，缺一种或多一种都失败；再对每个种类按字段表造一条各字段取典型值的事件，经 `emitMetric` 写入后能读回、字段逐字相同；带一个未知键或一个超 32 项的数组的同一事件被整条拒收并计 `reject`。`design.proposal-shown` 与 `design.answer-recorded` 另各造一条只带 0.5 字段的事件，照收（0.6 加的字段都可选，F49）。
6. 隐私：L2 性质测试，写入器拒收带未知键或字符串不合 id 形状的事件并计数；L3 扫描探针留下的指标文件，找不到探针自己的提示词、工具参数、文件内容、凭证文件与请求头里的任何 8 字符以上的片段，也找不到人发的消息正文。
7. 失败与自查：L2 把指标目录换成一个同名文件，模型流与工具调用的结果逐字不变，行健康为部分生效并写明原因；故障解除后排队的事件按序号写入；只有队列溢出时才有 `gap`，其中 `lost` 等于丢掉的条数。另造一份以半行加 NUL 字节结尾、且有一个写入者只写了 `start` 没有 `stop` 的旧文件后启动指标行，后台自查把那一行计为无法读取、把那个写入者报为「没有正常退出」，写进行健康与覆盖行。另造一个 `.git/info/exclude` 写不进的项目，`ensureIgnored` 抛错：`.llm/metrics/` 不被建出来，事件走同样的排队与重试，行健康写明原因，模型流与工具调用的结果仍逐字不变。
8. 确定性与复现：L2 用固定的事件文件算两次，输出逐字相同；把同一批行打乱顺序后输出仍相同；输出第一行写明文件、行范围、窗口、时区与计算版本。出一份报告之后往同一文件追加一条 `at` 落在窗口里的事件，按原依据行带 `--basis` 重跑，输出逐字相同；不带 `--basis` 时不同。
9. 比较：`npm run metrics -- compare --by v` 对含两个构建的夹具，按构建列出每步用时与 token 的中位数、每个任务的积分、原样同意率，以及每组的样本数。
10. 追查：`npm run metrics -- verify` 报出每个写入者缺的序号、链断的位置、没有正常退出的次数、流水开始之后项目图历史里有而流水里没有的条目、每个会话 `llm` 事件与用量流水条数不一致之处、文件清单（`.llm/metrics-manifest.jsonl`）里有而磁盘上没有且没有 `prune` 覆盖的文件、`start.host` 为 `cli` 却写了宿主专属种类的写入者、超时对账（§7.5：`unfinished` 与超时的 `rules.script` 没有同条目的 `timeout.hit`，或 `timeout.set` 的 `prevMs` 对不上上一条的 `limitMs`）；没有发现时退出码 0，有发现时 1。
11. 报告：`/hourness` 对本仓库的会话，派遣次数与拦截计数（事实）从指标流水算（L2 对夹具），并多一行覆盖范围（最早一条、今天几条、本进程丢了几条、没有项目可归的事件几条；最早一条晚于项目图历史最早一条时多写一句「图上有更早的记录，流水从 <日期> 起」，§5.5）；经对话给人的那部分不含任何「打分」（比率、比较）。
    完整性核对（M7 0.6 §3.16 只要求流水做好以后核对表里每类事件在不在；M7 的晨报与周报一直从原始记录算，不改读本流水，也没有哪一步让它们改读，F26）：L2 对同一份夹具——一次运行的原始记录和照这次运行造出的事件流水——比两边的事实：几件派出、几件做完、几件在等人、哪次检查没过、拦截计数，逐项相同。不同的项在夹具报告里列出，说明种类表还不够用，改的是本设计的种类表，不绑任何一方的合入，也不要求 M7 改动。
12. 并发：L3 两个进程同时往同一个项目流水各追加 5000 条，10000 行全部能解析，每个写入者的序号齐全；不通过时改用每个进程一份文件（§5.2 的退路），同一检查通过。
13. 一次性进程（F4）：L2 用一个子进程调 `appendEvents`（模拟规则板的 `checkCall`），项目由 `projectOf(dir)` 定位，调用后立即退出，项目流水里恰好多一条 `rules.check`；目录不在任何项目里时 `appendEvents` 返回 `written: 0` 与原因 `no-project`，不建任何目录。
14. 删文件（F7）：L2 删掉一天的文件（其中有一个写入者的全部行）后跑 `verify`，对着文件清单报出那个文件丢失、退出码 1；经 `prune` 删的不报，且 `prune` 事件里 `files`、`lines` 等于被删的。
15. 包：新行出厂 `disabled: true`；`npm run build`、`npm run preflight`、`npm test` 全绿；L3 启用该行真实启动无新错误；探针通过之后才在 bundle 里默认启用。
16. 体积：批次 L4 记一天真实使用的流水大小，写进 `docs/FACTS.md`；超过 5 MB 时在节点上批注并查原因。
17. 退役（F11）：`glm-hourness/workflow` 行退役之后，L3 带用户 profile 同形的覆盖层真实启动无新错误；不通过就停下交人（§12 末步）。
18. 存放（`d-rules-in-repo`、`d-memory-scope`）：L2 把数据目录服务指向一个临时的用户级目录，指标行启用、写完一轮事件与自查之后，用户级目录里没有任何以 `metrics` 开头的文件或目录；项目的 `.llm/` 里有 `metrics/`、`metrics-manifest.jsonl`、`metrics-key`，别无指标文件。发送方答不出项目的事件（`where` 没有 `dir`，或目录不在任何项目里）不落盘，行健康的「无项目的事件」按种类计数。
19. 高峰模式不管指标行（`d-main-agent-peak-exempt`）：L2 让 `glmHournessPeakMode` 假服务在高峰里报 `stop` 档，指标行照常写事件、自查照常跑，主 Agent 的工具调用与回话在有无指标行时逐字相同。
20. 每天一次的自查条目（F6，F25）：L2 用假的循环板服务，`contribute` 返回的 `accepted` 含 `metrics.selfcheck`；条目的动作是 `{kind: 'harness', action: 'metrics.selfcheck', tell: {text, wake: false}}`，`tell.text` 是一句话、不含占位。`run('metrics.selfcheck', …)` 没有发现时返回 `{outcome: 'skipped', reason: 'clean'}`，假的循环板记 `skipped`、不发任何消息；有发现时返回 `{outcome: 'done'}`（不带 `tell`），假的循环板交条目的那句 `tell`，`wake` 为假、走 `inject`，记 `delivered`，主 Agent 空闲时不开新回合；读不了项目返回 `{outcome: 'skipped', reason}`。循环板服务不在时行健康不降级，后台自查照跑。
21. 超时（需求 F12，`d-timeout-measured`）：L2 对 `timeout.set` 的五种来源（`estimate`、`measured`、`default`、`ceiling`、`fixed`，含义见 §4.2）各造一条事件，经 `emitMetric` 写入后读回，字段逐字相同：`estimate` 带 `estMs`（3000），`limitMs` 为它的 3 倍（9000）；`measured` 带 `runs` 与 `slowestMs`，`limitMs` 为 `slowestMs` 的 3 倍；`default` 不带 `estMs`、`runs`，`limitMs` 是条目写明的缺省；`ceiling` 带 `wantedMs` 与 `told`，另造两条，一条从估计来（带 `estMs`）、一条从实测来（带 `runs` 与 `slowestMs`）；`fixed` 只带 `limitMs`。再造被下限抬起的一条：`estimate`，`estMs` 为 1000，`limitMs` 为 5000，`floored` 为真。同一条目的第二条起 `prevMs` 等于上一条的 `limitMs`，第一条没有 `prevMs`。`timeout.hit` 一条带 `entry`、`kind`、`limitMs`、`elapsedMs`、`outcome`、`source`、`told`，读回逐字相同；任何一种带一个文字字段或未知键的同一事件被整条拒收并计 `reject`，`source` 取表外的值同样整条拒收。`factsFor` 按条目列最近 7 天的超时次数、最近一次的限与用时、最近一个超时值的来源（五个值之一）与预计用时（有才列），`scoresFor` 里没有这几项。写入器不判板端数据的对错：`elapsedMs` 小于 `limitMs` 的 `timeout.hit`、`limitMs` 不等于 3 × `estMs` 的 `timeout.set` 都照收，算式对不对是发送方自己的测试和 `verify` 的对账要管的（§7.5）。
22. 拦下与撤下（需求 F13，`d-code-rules-enforce`）：L2 扫描本设计起名的全部字段名与枚举值（§4.2 各表，不含兄弟设计拥有的 `id` 型取值），找不到 `shadow`、`promotion`、`promote`、`precision`、`recall` 与「影子」「试运行」「转正」（接管的 `bootstrap.trial` 是对项目命令的试跑，与规则的试运行无关，名字不扫）；`rule` 事件造 `deny` 与 `late` 各一条，都带 `rule`，没有 `mode`；`lift` 事件造 `lift` 与 `restore` 各一条，读回逐字相同、不含人的原话（只有字数）；`factsFor` 按规则 id 列近 7 天拦下次数与撤下，没有样本数、误伤率或进度一类的项。撤下这一半不依赖 M4 的 G1，用假的 M4 服务做：假的 `glmHournessLifts.setLifted`（规则板那一路）写一笔撤下，M4 随后交的 `lift` 事件读回逐字相同，`via` 为 `board`；再造一笔 `via` 为 `chat` 的；`via` 取一个表里没有的 id 形状的值（例如 `phone`）时事件照收，`factsFor` 把它归「其他」（`via` 是 `id`，取值留在 M4 设计里，F40）。M4 的 G1 合入之后加 L2：假的 guard 服务下，文件工具往 `.llm/metrics/x` 写、shell 命令 `Remove-Item .llm/metrics/x` 各被拒，各留一条 `rule` 事件（`rule` 为 `metrics-files-only`）；`prune` 的两种写法 `npm run metrics -- prune` 与 `node scripts/metrics/cli.ts prune` 也各被拒、各留一条 `rule` 事件，同一入口的 `npm run metrics -- summary` 放行（判法见 §3.4，F47）；`guard_lift` 之后同样的调用放行，留一条 `lift` 事件（`via` 为 `chat`）。
23. 读密钥文件不另记（`d-credentials-readable`；这次读在流水里只是一条普通的 `tool`）：L3 探针让 agent 用读文件工具读 `~/.dsh` 临时目录下一个放了假令牌的文件：调用放行，流水里这次调用只有一条普通的 `tool`（`cat` 为 `read`，`out` 为 `ok`，`target` 是散列），没有 `rule` 事件，没有任何带该文件名或内容片段的字段；字段表里没有为读文件设的种类或字段（L2 扫描）。
24. 额度与汇报（需求 F14，用户图）：L2 夹具里造一段 `execute.goal`：先一条停住、`code` 取 M7 给额度用完的码，隔一段时间再一条恢复、`resumeWhy` 取 M7 给额度重置的码；`factsFor` 写出「推进因额度停了 1 次，共 X 分钟，自己接上 1 次」，没有一次是人手动接上的时写 0；夹具里没有这两个码（M7 还没定）时这一行写「—」而不是 0。再造 `progress.due` 两条（一块、整个目标）与 `progress.handover` 一条（`n` 为 2、`goalDone` 为真），读回逐字相同；`factsFor` 写出汇报条数、交付次数、最长等了多久；`scoresFor` 里没有这几项。事件都不含汇报的文字。

### 1.5 让人少做了什么（question-27 B）

这份流水本身不减负，它让减负可以被量：人每周被问几次、每次读多少字、等多久、原样同意了几次、因人的决定返工几次，以前散在图历史与设计里，有的根本没有记（对话里问人的用时、DSH 原生问题与审批、主 Agent 在对话里写给人的字数、人自己发的消息）。以后改提示词、换模型、换问法，前后对照用的是同一份数据和同一套算式。人不需要读这份流水。

### 1.6 不做的事

- 不做新的面板或页面：报告仍是 `/hourness` 与 M7 的晨报、周报；面板上的指标页属于 M8。
- 不按指标自动调整任何行为（换模型、换问法、限流）：只记录与报告。超时的值由各块板自己的 harness 按实测改（`d-timeout-measured`），指标流水只记下这个改动，不参与算它。
- 不做影子期、试运行期与转正台阶的任何计量（`d-code-rules-enforce`）：没有只记录模式的计数、标注、精确率召回率、转生效的样本数或天数、「转生效」的提议。用户自己让某条板上规则只记录（宪章 0.8 §6 许可的，那是用户选的做法，不是阶段）时，它的命中在 `rules.judged` 里是 `how` 的一个值，事实里单列一行，不算拦截，也不算进度。
- 不为读密钥文件记任何东西（`d-credentials-readable`）：agent 可以读，字段表里没有为它设的种类、字段或规则；读它在流水里是一条普通的 `tool` 事件。密钥与令牌不进流水仍照旧（§4.4）。
- 不记人在对话里打的字的内容（只记条数、字数、附件数，F10）：内容进不了字段表（§4.4）。
- 不把用量流水按项目拆开、不迁移历史用量：用量跟账号走（`DESIGN.md` §2.4），面板看整个账号；项目流水从启用那天起记。
- 不在用户级目录放任何指标文件（流水、密钥、文件清单、机器级流水都不放，`d-memory-scope`）；换电脑或重新克隆不带走流水，不做跨机器的同步或备份（§5.5、§9.3 写明后果）。
- 不把违规流水并进指标流水，也不接管它的搬迁：违规流水按 M4 的 G1 进项目的 `.llm/audit/`，指标流水只引用它的记录键。
- 不做匿名化导出与回收：属于 `field-trial`。
- 不改宪章，不改用户的 `~/.dsh` profile。

## 2. 现状：已有的数在哪

存放范围按 `CHARTER.md` 0.7 §9：项目的东西在项目的 `.llm/`，用户级只有账号一级的额度与用量。下表「位置」一列写的是各自现行设计定的位置，不是今天代码里的位置时另注。

| 已有的 | 位置与写入者 | 记什么 | 本设计怎样处理 |
| --- | --- | --- | --- |
| 用量流水 | `<userHome>/audit/usage.jsonl`（用户级，账号的账），memory 行（`src/memory/index.ts`） | 每次模型调用的 provider、模型、token、用途、会话 | 保留，照写：它是整个账号的账，面板、M6 的预估、练习题运行器都读它，范围是一台机器的所有项目，属于 `CHARTER.md` 0.7 §9 用户级一行里「整个账号的额度与用量」。指标流水的 `llm` 事件是同一次调用在本项目里的记录，另带用时、步、积分与结束原因。两者的条数由 `verify` 按会话对账（验收第 10 条），对不上就报 |
| 违规流水 | 今天是 `<projectHome>/audit/violations.jsonl`（`projectHome` 在 profile 里钉在本仓库的 `.llm`）；M4 的 G1 改为会话所属项目的 `.llm/audit/violations.jsonl`（M4 0.6 §2.4，`d-rules-in-repo`）。guard 行、图行、循环板与规则板的门都写它；M4 起还有跟进、申报、放行、作废、撤下的记录（M4 0.6 §3.2 的 `LiftRecord`），规则板写的 `mode` 为 `record`（用户选了只记录）、`late`（晚到的拦下）的记录 | 拦截、晚到的拦下与用户选的只记录的记录，带纠偏全文 | 保留，不并进指标流水（M4 0.6 §3.11 的裁定，0.6 沿用）：纠偏文字靠它；M4 0.5 的标注与回归语料随 `d-code-rules-enforce` 在 M4 0.6 删掉了。指标流水的 `rule` 事件只记规则 id、结果与 `ref`（那一行的 `recordKey`），拦截计数的口径与 M4 的 `classifyRecord` 一致（§7.2）。流水搬到哪里归 M4，指标流水只引用键，所以搬迁前后都对得上 |
| 派遣决策流水 | `<projectHome>/audit/decisions.jsonl`，workflow 行（`src/workflow/index.ts`） | 派遣类工具调用的等级（全是 L1）与从参数截的 120 字主题 | 被取代：`tool` 事件按类别 `dispatch` 记了同样的调用，还不记参数文字。M7 起派发的全貌在 `execute.dispatch`。晨报的「决策曲线」改从指标流水算（§7.3）；workflow 行在最后一步退役（§12 末步）；旧文件留在磁盘上不删，也不搬 |
| 项目图历史 | `docs/graph/nodes/*.json` 的 `history`，引擎写 | 每次写入的时刻、身份、操作、理由、转述原话 | 保留为节点状态与文字的事实源。`graph` 事件只记数与引用（节点 id、历史序号、修订号），两者不一致时以图为准，`verify` 报差。启用前的历史由 `backfill-graph` 一次补成事件（§7.5），让人的负担曲线从 2026-10-28 开始；图在 git 里，新克隆之后也能再补一次 |
| 额度流水、用量缺口 | `<userHome>/audit/quota.jsonl`、`usage-gaps.jsonl`（用户级，账号一级，M6 设计 §4.5、§6.2） | 账号的额度读数、删过的用量 | 保留，不进项目流水：它们属于账号。额度读取由循环板为某个项目的条目发起时，M6 另交一条 `glm.quota-read`（M6 0.6 §14.2），事件由发送方带上项目目录写进那个项目；发送方答不出项目时不写、只计数（§3.5）。读数本身已在 `quota.jsonl`，所以丢的只是「这次读取成不成功、花了多久」的计数 |
| 规则板的状态流水与命中计数 | 项目的 `.llm/rules/`（运行时的：流水、命中计数、心跳）与仓库的 `docs/rules/`（人定的规则，入 git）（规则板 0.10 §7.1，`d-rules-in-repo`） | 规则与等待单的状态 | 保留：那是规则板的状态存储。规则板另交 `rules.*`（15 种，规则板 0.10 §10.5），本设计收下（§4.2、F1）。规则板的 R7 晨报一节「按 `metrics` 的定案从指标流水算」，指标流水合入之前它自己从项目流水与违规流水算同样的数（规则板 0.10 §10.5） |
| 循环板的运行记录 | 项目的 `.llm/loops/runs.jsonl`（循环板 0.6 §9.1；指标流水合入之前）；变更记录 `.llm/loops/journal.jsonl`、被删任务 `removed-tasks.jsonl`、结论 `notes.jsonl` | 每次运行的 `loop-fired`、`loop-done` 等 11 种 | 指标流水合入之后，运行记录换成 `<项目根>/.llm/metrics/`，循环板只改 `src/loops/metrics.ts` 一个文件（循环板 0.6 §6.10、§17）；变更记录、被删任务的全文、结论仍归循环板，不进指标流水（`loop-task-delete` 只记 id） |
| M4 的压制计数 | `<projectHome>/audit/suppressions.jsonl`（M4 0.6 §3.11、§2.4） | 每天的压制注释数 | 压制计数改为每天一条 `count` 事件；M4 把 `suppressions.jsonl` 留到指标行默认启用之后，由本设计的实施末步去掉（改 `src/env/suppressions.ts` 与晨报读它的一处，§12 第 10 步）。M4 0.5 的标注 `labels.jsonl` 随 `d-code-rules-enforce` 在 M4 0.6 删掉了，本设计不再有要对着它的东西 |
| 撤下代码规则的记录 | 仓库的 `docs/guard/lifts.jsonl`（人的决定，入 git，原话在里面）与违规流水里的 `LiftRecord`（M4 0.6 §3.5） | 谁在什么时候撤下或恢复了哪条规则、怎么撤的 | 保留。指标流水的 `lift` 事件只记规则 id、动作、怎么撤的（对话里还是命令）与原话的字数，不记原话；晨报对账 `lifts.jsonl` 与流水是 M4 的事 |
| 板上超时值的来历与超时记录 | 规则板与循环板各自的状态（页面从那里读，指标行没启用时也在），M4 的检查与 M7 的合入前检查各自的记录（`d-timeout-measured`） | 每个超时值的来源、时间与旧值；每次超时的条目、限、用时与结局 | 保留为各块的事实源。`timeout.set`、`timeout.hit` 是同一件事的计量副本（§4.2），两边不一致时以各块自己的为准，`verify` 不对账（格式在各块的设计里）；报告与晨报的事实可以从流水算，页面读各块自己的数据（plain-ui 1.0 §4.7：面板不直接读指标流水） |
| M7 的检查与前进记录、派发与交回批注 | 项目的 `.llm/execute/`（`checks.jsonl`、`advances.jsonl` 等，M7 0.6 §2.1）；图上的批注 | 检查每条命令的日志路径与结论；派发次数、计划版本、问答计数 | 明细照旧在 M7 的记录与会话日志；`execute.*` 事件记数（§4.2，M7 0.6 §3.16）。M7 §3.12 的计数仍从 M7 自己的记录算（M7 0.6 §3.12.4、§3.16），不改读本流水；本流水只记事件，验收第 11 条核对种类表够不够算出同样的数（F26） |
| 标定结果 | `.llm/calibration-runs/<时间>/…/result.json` | 每次运行的完成、步数、积分、返工等 | 保留运行器自己的记分；运行目录是一个 git 仓库，指标流水自然落在它的 `ws/.llm/metrics/`，`result.json` 加一节用同一套算式算出的 `metrics`（§12 第 8 步） |
| 会话日志 | `~/.dsh/sessions/`，DSH 写 | 对话全文与事件 | 不动，是对话的事实源；指标事件带会话 id 与调用 id，可以回查 |
| 问人的跟随率、先想后看 | plain-ui 0.4 曾由项目图历史当场算 | 最近 10 次拍板里跟了几次推荐 | plain-ui 0.6 取消（§1.5、§11）：`d-chat-not-cards` 之后不再有卡片与推荐位置。问人改从 `design.proposal-shown`、`design.answer-recorded` 算（§7.2、F2）。M3 附录 0.6（`d-ask-three-gates`）又有了推荐与几条路，跟随推荐的比例回来了，但不从图历史当场算：从 `design.answer-recorded` 的 `form`、`delegated`、`pickedRecommended` 算，属打分（§7.2，F49）；先想后看仍没有 |

结论：新的事件流水只新增别处没有的数（每步的用时与结束原因、工具调用的结果与用时、对话里问人的用时、审批与命令、人发的消息、任务各阶段的计数由 M7 的事件给），对已有的数只记引用加计算要用的数字。唯一完全并进来的是派遣决策流水。

## 3. 总体设计

### 3.1 依据的学科与标准

- 事件溯源与只追加日志（Fowler，Event Sourcing；Kleppmann，《数据密集型应用系统设计》第 11 章）：事件一旦写下不改，报告是事件的纯函数，所以同样的前缀得到同样的数。
- 结构化日志与 JSON Lines（jsonlines.org）：一行一个对象，以换行分隔，坏一行不影响别的行。
- OpenTelemetry 生成式 AI 语义约定（`gen_ai.usage.input_tokens`、`gen_ai.response.finish_reasons`、`gen_ai.request.model`）：每次模型调用记哪些字段按它取，名字按本仓库已有的 `TokenUsage` 词汇（`src/shared/lm-min.ts`）。不引入 OpenTelemetry SDK：只要一份本地文件，SDK 的导出器、采样与上下文传播都用不上。
- DORA 四项指标（M7 §3.13）与 SPACE 框架里「只量看得到的活动、配合人的反馈」的原则（Forsgren 等，2021）。
- 数据最小化（GDPR 第 5 条第 1 款 c 项的原则）：只收计算要用的字段；字段表闭合，未知字段拒收，而不是事后脱敏。
- Goodhart 定律与 `CHARTER.md` §8：指标不进模型上下文，量到的数不反过来驱动模型；给人的打分只经命令行与面板，不经模型转述（§7.3、F9）。
- 防篡改的散列链（与 git 对象链同一思路）：只用来发现误写与缺行，不防有意伪造（§5.4、F21）。

### 3.2 构件与位置

| 构件 | 文件 | 新建或改 |
| --- | --- | --- |
| 信封与正文的类型、名字空间表、校验 | `src/metrics/schema.ts` 与 `src/metrics/kinds/<名字空间>.ts` | 新建 |
| 写入器（序号、链、队列、重试、轮换、文件清单） | `src/metrics/writer.ts` | 新建 |
| 库写入口（DSH 之外的一次性进程，F4） | `src/metrics/library.ts` | 新建 |
| 读取（逐行解析、去重、排序、链与序号核对） | `src/metrics/read.ts` | 新建 |
| 计算（纯函数；分事实与打分两组出口，F9） | `src/metrics/calc.ts` | 新建 |
| 通用接缝上的观察（模型流、步、会话事件、问题、人的消息） | `src/metrics/observe.ts` | 新建 |
| 行入口 `glm-hourness/metrics`：提供服务、挂接缝、报行健康、后台自查、交自查条目 | `src/metrics/index.ts` | 新建 |
| 命令行 | `src/metrics/cli.ts`、`scripts/metrics/cli.ts`、`package.json` 的 `metrics` 脚本 | 新建 |
| 服务契约与发事件的帮手（两个包共用） | `src/shared/metrics.ts` | 新建 |
| 项目根与让 `.llm/` 不进 git：`projectOf(cwd)`、`ensureIgnored(root, '.llm')`（F4） | `src/data/project-root.ts`（规则板的最小一片已建，是仓库唯一的项目根模块） | 不改，导入。需要注入文件系统或异步读时在这个模块上加选项，不写第二份（`AGENTS.md`、`design-context.md`「Rules thin slice」） |
| 字数（中文按字、英文按词，M7 §3.12.3 的口径） | `src/shared/text-units.ts` | 新建 |
| 构建戳 | `scripts/build-info.mjs`（`npm run build` 最后一步）写 `packages/*/dist/build-info.json`；`src/shared/build-info.ts` 读本包的那一份 | 新建；`package.json` 的 `build` 改 |
| 工具类别表 | `src/shared/tool-names.ts` 加 `toolCategory(name)` | 改 |
| 项目图引擎的观察者（F24） | `src/graph/engine.ts` 导出 `setEngineObserver(fn): () => void`（进程内的观察者集合，返回撤销函数），`commit` 在 `writeNodes` 成功之后、`openEngine` 返回的 `apply` 的包装在失败时通知；指标行在激活时登记、卸载时撤销，`src/graph/cli.ts` 在命令行进程里登记自己的。`EngineOptions` 与各调用点不改 | 改 |
| guard 与图文件门禁交 `rule` 事件 | `src/guard/index.ts`、`src/guard/graph-files.ts`（M4 合入后改在 `installRuleGate` 一处）；记录键 `recordKey` 在 `src/guard/records.ts`（M4 先合入就用它的）；规则 `metrics-files-only`（行 `metrics`）经 M4 的 `installRuleGate` 安装，进 `src/guard/catalog.ts` 的 `GUARD_RULES`（启用即拦，F20） | 改 |
| 晨报改读指标流水 | `src/workflow/morning-report.ts`、`src/report/index.ts` | 改 |
| 行登记 | `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（id `glm-hourness/metrics`，name `dsh-hourness/metrics`，`disabled: true`）、`src/shared/health.ts` 的 `HOURNESS_ROWS`、`tests/contracts.spec.ts` 的行清单 | 改 |
| 测试 | `tests/metrics-schema.spec.ts`、`tests/metrics-writer.spec.ts`、`tests/metrics-read.spec.ts`、`tests/metrics-calc.spec.ts`、`tests/metrics-row.spec.ts`、`tests/metrics-library.spec.ts`、`tests/fixtures/metrics/`；`package.json` 的 `test` 列表 | 新建 |
| 探针场景 | `scripts/probe/` 的 `metrics` 与 `metrics-concurrent` 两个场景 | 改 |
| 文档 | `docs/ORCHESTRATION.md` 新增 §10.6「指标流水」并改 §10.1 的来源列；`docs/DESIGN.md` §2.4 数据表加一行、§2.4a 对照表加本设计用到的接口、§2.5 行健康表加一行；`docs/HANDOFF.md` | 改，随各步同一批提交 |

技术栈锁定：TypeScript strict（`exactOptionalPropertyTypes`），Node 22 内置模块（`node:fs/promises`、`node:crypto` 的 SHA-256 与 HMAC、`node:readline`），不加依赖。

### 3.3 放在哪：项目根下的 `.llm/metrics/`

「项目目录」在本仓库的词表里是工作区的 `.llm/`（`DESIGN.md` §2.4）。今天违规与决策流水按数据目录服务的 `projectHome` 写，这个值在 profile 里钉在本仓库的 `.llm`（接管设计指出：在别的项目里干活，记录仍写进本仓库）。指标流水要「每个项目一份」，所以不用 `projectHome`，按会话算项目根：

1. 会话：`agents.get(sessionId)` 取活 agent（agent:596），读 `session.header.cwd`（session:1820–1826）。委派子会话的 `cwd` 是父会话的目录（subagent:345–356），worker 的事件因此落在主会话的项目里。
2. 项目根：`projectOf(cwd)`（`src/data/project-root.ts`，仓库唯一的项目根模块，规则板 0.10 §7.3、循环板 0.6 §2.1 用的同一个函数）返回 `{root, git}` 或 `undefined`：从 `cwd` 往上找 `.git`，是目录则 `root` 是它的父目录；是文件（git 工作树）则读 `gitdir:` 与 `commondir` 得到公共目录，`root` 是公共目录的父目录，所以主检出与 `.worktrees/*` 是同一个项目。找不到 `.git` 时，只有本来就有 `.llm` 目录的目录算项目（`git: false`），用户主目录和盘符根永远不算。只读文件，不起 git 进程，找到 git 根的结果按 `cwd` 缓存。F4 要求的「规则板与指标流水共用一个函数」就是这一个：两边对「有没有项目」的回答一致，不再有一边退到 `cwd`、一边不写的分歧。
3. `undefined`（没有项目的会话，或用户主目录、盘符根、没有 `.git` 也没有 `.llm` 的目录）：事件不写，计入行健康的「无项目的事件 N 条」。不在任意目录里建 `.llm/`。
4. 目录：`<root>/.llm/metrics/`。第一次写某个项目之前先 `await ensureIgnored(root, '.llm')`（同一个文件：在 `.git/info/exclude` 末尾追加一行 `.llm/`，已有等价的行就不追加，不是 git 仓库时什么都不做）；它抛错（`.git/info/exclude` 写不进）时不建 `.llm/metrics/`，这个项目的事件留在队列里，走 §5.1 的重试，行健康写明原因（规则板的最小一片按编排方的裁定「Rules thin slice」同样先调它再写 `.llm/rules/`；循环板 0.6 与 M7 0.6 只在自己的目录里放内容为 `*` 的 `.gitignore`，没有调它，两种做法都不会让 `.llm/` 进 git，谁先建 `.llm/` 谁的做法生效）。成功后 `mkdir -p`，并以 `wx` 在 `metrics/` 里写一个内容为 `*\n` 的 `.gitignore`（已在就不动；`ensureIgnored` 对非 git 目录什么都不做，这个文件是它的补充，M7、循环板在自己的目录里同样放一个）。
5. `metrics/` 目录之外、`.llm/` 之下还有两个文件：`metrics-manifest.jsonl`（文件清单，§5.5）与 `metrics-key`（路径散列的密钥，§4.3）。放在目录之外，是因为误删最可能发生在整个 `metrics/` 上，清单留在外面才能发现；密钥留在外面，导出或复制 `metrics/` 时不会带走它。
6. 命令行：`--project <目录>`，默认当前目录，按同一个函数算根（`projectOf` 必须有值，否则退出码 2）。项目图的写入按图目录（`<root>/docs/graph`，或图行配置的 `dir`）算根。

标定的每次运行目录 `ws/` 是新初始化的 git 仓库（`ORCHESTRATION.md` §10.5.1），它的事件落在 `ws/.llm/metrics/`，与真实项目天然隔开；探针同理。

### 3.4 谁写：只有 harness

- 写入者只有一个模块：`src/metrics/writer.ts`。进程里由指标行持有（宿主），命令行与库写入口进程各自持有一个（`host: 'cli'`）。
- 指标行自己观察 DSH 的通用接缝（§6.1），得到的都是宿主在执行边界上看到的事实：流里的 `usage` 块、时钟、会话事件、人发的消息。
- 其余事件经服务 `glmHournessMetrics` 交来，调用方都是本仓库的宿主侧代码（§6.2）。服务只在进程内，不注册任何工具，模型调不到它。
- 不收模型报的数：工具参数、`structured_output` 交回、`submit_plan` 里写的任何数字都不进流水；检查的通过与否取 harness 自己跑的结果（M7 §3.8.4）。模型做的选择（主 Agent 给 worker 选的模型、人在对话里的回话）照记，但计算时只当分组的键或人的决定，不当测量值。
- 防误写：新增代码规则 `metrics-files-only`（行 `metrics`），由指标行经 M4 的 `installRuleGate` 安装，登进 `src/guard/catalog.ts` 的 `GUARD_RULES`，规则板的只读目录随之列出（F20；规则板 0.10 §2.6 的代码规则表里已有这一行，写明「指标流水合入后登记」）。文件工具写到这三处任一处时拦下：`<root>/.llm/metrics/**`、`<root>/.llm/metrics-manifest.jsonl`、`<root>/.llm/metrics-key`（清单与密钥在 `metrics/` 之外，清单被删恰是 §5.5 要发现的事，F36）；shell 命令文本里出现 `.llm/metrics`（子串，同时覆盖 `metrics-manifest.jsonl` 与 `metrics-key`）并带写入、删除或移动动作时也拦下，`prune` 同样拦下（`prune` 只有人在自己的终端里敲，§5.3；0.4 加这一句，因为规则从启用起就拦，不加的话主 Agent 经 shell 能跑 `prune`，与「只有人能删」相反）。`prune` 的命令文本里没有 `.llm/metrics`，所以它的判法单独写（F47）：纯函数 `isPruneCall(command)`（`src/metrics/rules.ts`）先把命令文本的反斜杠换成斜杠、转小写、按空白切词、去掉每个词尾的 `.cmd` 与 `.exe`，满足下面两条之一就拦下：一、词里有 `npm`，其后有 `run`，再其后有词 `metrics`，`metrics` 之后又有词 `prune`（认 `npm run metrics -- prune`，夹在中间的 `-s` 之类开关不影响）；二、有一个词含子串 `scripts/metrics/cli`，其后有词 `prune`（认 `node scripts/metrics/cli.ts prune` 与 `npx tsx scripts/metrics/cli.ts prune`）。同一入口的别的子命令（`summary`、`verify`、`compare`）不拦。变量拼接、编码一类的绕过写法认不出，规则不防有意绕过（§3.1），事后由链式摘要与文件清单发现（§5.4、§5.5）。这条规则从指标行启用那天起就拦（`d-code-rules-enforce`，宪章 0.8 §3.2 第 3 条）：没有影子期，规则对象没有模式，也没有转生效的台阶；新插件行默认 `disabled: true`、验证过才启用，那是行的事，不是这条规则的阶段。每次拦下带规则 id 记成 `rule` 事件（`ref` 指向违规流水那一行），规则页与晨报看得见，误拦因此能被发现；撤下只有 M4 的那一条路（`d-one-lift-path`，M4 0.6 §3.5）：人对主 Agent 说一句话（它调 `guard_lift` 带上人的原话），或在规则板上打 `/rules lift metrics-files-only`；规则板那一路的接线是对已放行的规则板的请求，等 dogfood 之后，接上之前只有前一条。两条路都由 M4 写一笔 `LiftRecord`，本设计只在它写完之后收一条 `lift` 事件（`via` 的取值由 M4 定，§4.2）。它依赖 M4 的 `installRuleGate` 与 `guard_lift`，M4 的 G1 合入之前不装；在此之前与之后，链式摘要与文件清单都能发现误写与删除（§5.4、§5.5）。这里有一段时间差，要说明白（F42）：§12 的第 6 步让指标行默认启用，第 7 步才装这条规则，而 M4 的 G1 不在本设计手里，所以第 6 步到第 7 步之间行已启用、规则还不存在。这不是影子期（规则不存在，不是只记录不拦），但与「从行启用那天起就拦」差这一段，这一段只靠摘要和清单事后发现；这是 agent 定的、人可推翻的事项，见 §15 第 35 条。

### 3.5 没有项目的事件（F5，0.3 取消机器级流水）

有些事件的发送方答不出项目：循环板为某个条目发起的额度读取没带会话时的 `glm.quota-read`（M6 0.6 §14.2 把归属交给本设计定）、没有 `project` 字段的 `loop-contribution`（循环板 0.6 §6.10）、会话的目录不在任何项目里的事件。0.2 为它们设了一份用户级的机器级流水；`d-memory-scope` 与 `CHARTER.md` 0.7 §9 的用户级清单（登录凭证、设备号、人设、关于人的记忆、整个账号的额度与用量、插件配置）里没有指标流水，所以取消。循环板 0.6 对 `loop-read` 同样这样处理（评审 F52：写进 `last-step.json` 指向的项目，没有指向的项目就丢掉、只在行健康里提示一次）。

- 发送方能说出项目就必须带上：`emit` 的 `where` 取 `{sessionId}` 或 `{dir}`（项目里任何一个目录）。额度读取为项目 P 里的条目发起，就带 P 的目录。`where` 里的东西经 `projectOf` 都找不到项目，或根本没有 `where` 时，事件不落盘。
- 不落盘的事件在进程内计数：行健康写「无项目的事件 N 条」，按种类分，至多列 8 种；`/hourness` 的覆盖行写同一个数（验收第 18 条）。这个计数不跨进程保存。
- 丢的代价小：额度读数本身在用户级的 `quota.jsonl` 里，丢的只是「这次读取成不成功、花了多久」；`loop-contribution` 是行启动时的一次性登记，不是运行中的度量。要让它们也进流水，需要循环板与 M6 在发起时带上项目目录，写成对它们的请求（§14，等 dogfood 之后）。
- 有会话而 `projectOf` 返回 `undefined` 的事件，同样只计数（§3.3 第 3 条）。

## 4. 记录格式：信封加名字空间正文（F1）

字段表分两层。信封由本设计定，对每一条都一样；正文按名字空间各一张闭合表，本设计自己的那几种写在 §4.2，兄弟设计已经定好的那几种的字段名与类型写在 §4.5（名字取自对应设计的那一节，那一节只写了内容没写名字的由 §4.5 起名），放在 `src/metrics/kinds/<名字空间>.ts`，表头注明来源设计与版本。校验规则对两层一样：未知键、类型不对、数组超限整条拒收（§4.4）。

### 4.1 信封：每一行的公共字段

| 字段 | 必填 | 类型 | 含义 |
| --- | --- | --- | --- |
| `s` | 是 | 整数，现为 1 | 格式版本。已有种类的字段改了含义才加一；新加种类、新加可选字段不加 |
| `k` | 是 | 枚举（§4.2 的总表） | 种类 |
| `at` | 是 | ISO 8601 UTC，毫秒 | 发生的时刻。会话事件取事件自己的 `time`（session:1528–1534，`Date.now()`），其余取写入者的时钟 |
| `w` | 是 | id，匹配 `^[0-9a-f]{8}$` 或 `^bf-[0-9a-f]{7}$` | 写入者 id：进程第一次写时随机生成 8 位十六进制；补录用 `bf-<提交前 7 位>`（F31：两种形状都合法，退路的文件名与 `--basis` 的正则同样收两种） |
| `n` | 是 | 正整数 | 这个写入者在这份流水里的序号，从 1 起连续 |
| `h` | 是 | 12 位十六进制 | 链式摘要：`sha256(上一条的 h + 本行不含 h 的 JSON 文本)` 的前 12 位；写入者第一条的「上一条」是空串 |
| `v` | 是 | id | 交来这条事件的包的构建戳：`<包版本>+<提交前 7 位>`，构建时工作区有未提交改动再加 `.dirty`，没有 git 时提交写 `nogit`，读不到构建戳写 `<包版本>+unknown` |
| `by` | 是 | 枚举：`host`、`graph`、`guard`、`rules`、`loops`、`execute`、`operate`、`glm`、`design`、`bootstrap`、`env` | 交来这条事件的构件（`env` 是 M4 的环境行，交它的检查的超时事件，0.4）。`host` 是指标行自己观察的；其余是经服务交来的那一行。`verify` 用它加 `start.host` 认出伪造（§5.4、F21） |
| `sid` | 否 | id | 会话 id（rc.3 的 agent 与会话共用 id，agent:514） |

写入器按信封加正文字段表的顺序序列化（不靠对象的插入顺序），同一事件的文本是确定的，链可以重算。

### 4.2 种类总表

下表按名字空间列出全部种类。「正文字段」里 `?` 为可选。本设计自己的种类字段写在这一节；兄弟设计的种类只列名字与版本，字段名和类型在 §4.5。兄弟设计的信封字段（`at`、`project`）由本设计的信封与文件位置承担，正文不重复。

#### 本设计自己的种类（`by: host`，除注明外）

| 种类 | 何时 | 正文字段 |
| --- | --- | --- |
| `start` | 这个写入者第一次往这份流水写，排在第一条之前 | `host`（`desktop`、`headless`、`cli`）、`pid`、`node`、`electron?` |
| `stop` | 行卸载或进程退出之前，尽力写 | `written`、`dropped`、`rejected`（本写入者累计） |
| `gap` | 丢过事件之后第一次写成功 | `lost`、`from`、`to`（丢掉的序号范围）、`lastH`（丢掉的最后一条的 `h`，校验从它接上） |
| `reject` | 拒收一条事件 | `of`（被拒的种类，未知种类写 `unknown`）、`field`（第一个不合规的字段名；不像表里的名字写 `other`） |
| `prune` | 人用 `prune` 删旧文件之前（F7） | `before`、`files`（删了几个文件）、`lines`（删了几行） |
| `session` | 本进程第一次见到一个会话 | `parent?`、`origin?`（`subagent`）、`depth?` |
| `turn` | 回合开始与结束 | `turn`、`phase`（`start`、`end`）、`end?`（`reason.kind`，如 `completed`、`blocked`，可扩展时写 `other`，F12） |
| `llm` | 一次模型调用结束 | `turn?`、`step?`、`provider`、`model`、`purpose?`、`input?`、`output?`、`cacheRead?`、`cacheWrite?`、`reasoning?`、`total?`（流里没有 `usage` 块时这六项都不写）、`ms`、`ttft?`、`fin`（`stop`、`tool-calls`、`max-tokens`、`aborted`、`error`、`none`、`other`，F12）、`calls`（输出里的工具调用块数）、`text`（输出文字块的字数，§4.3）、`retries?`（本步 `agent/request-error` 的次数，F13）、`credits?`、`peak?`（调用时是不是 GLM 的高峰时段，取自计价服务；只是一个测量值，指标行不读也不受高峰模式的档位影响） |
| `tool` | 模型发出的一次工具调用有了结果，或回合结束时仍没有结果 | `turn`、`step`、`call`、`name`、`cat`（§4.3）、`out`（`ok`、`error`、`denied`、`declined`、`none`）、`ms?`、`chars?`（结果文字的字符数）、`target?`（路径散列）、`cmd?`（shell 命令的第一个词） |
| `rule`（`by: guard` 或 `graph`） | guard 框架里的代码规则一次拦下（guard 行、图文件门禁、循环板与指标行自己的代码规则；M4 的 G1 合入后全部在 `installRuleGate` 一处）。放行不记。规则板自己的拦下不在这里，是 `rules.judged` | `call?`、`rule`、`effect`（`deny`：调用被拒；`late`：只能事后发现的规则在调用之后看到了违规，M4 0.6 §3.4 的晚到的拦下，没有 `call`）、`ref?`（违规流水那一行的 `recordKey`）。0.4 删去 `mode` 与 `effect` 里的 `shadow`（`d-code-rules-enforce`：规则对象没有模式） |
| `followup`（`by: guard`） | M4 的记录器结算一次拦截之后模型下一步做了什么（M4 0.6 §3.3 的 `FollowupRecord`）。跟进的结果在拦截之后才知道，只追加的流水不能回头改 `rule`，所以单独一种。0.4：它不再为转正服务（没有转正了），M4 0.6 §3.3 留着它是为了量门禁有没有教会模型，所以仍是打分 | `rule`、`denial`（被拦那一行的 `recordKey`）、`outcome`（`right-path`、`repeat`、`other`、`none`） |
| `request`（`by: guard`） | M4 的申报通道每走一步（`RequestRecord` 的各结局、`GrantRecord` 的使用、`GrantVoidRecord` 的作废，M4 0.6 §3.2、§3.11） | `rule`、`ref`（这一次申报的 id）、`step:id`（申报走到哪一步：已问、已放行、被否、已关、已过期、已用、已作废等；取值清单留在 M4 设计里，本设计不抄，M4 0.6 §5 还在改，计算遇到不认识的归「其他」） |
| `lift`（`by: guard`） | 人撤下或恢复一条代码规则，M4 每写一条 `LiftRecord` 之后交一条（M4 0.6 §3.5、§3.11；`d-code-rules-enforce`：人一句话或一条命令就能撤下）。撤下只有 M4 的一条路（`d-one-lift-path`），两种说法都由 M4 写 `LiftRecord`，本设计只收它写完之后的这一条；接管的读项目门禁 `bootstrap-read-no-shell` 也走这条路，没有另外的事件 | `rule`、`action`（`lift`、`restore`）、`via:id`（人是怎么撤的，取值留在 M4 设计里，今天是两个：`chat`＝主 Agent 带着人的原话调了 `guard_lift`；`board`＝人在规则板上打了 `/rules lift` 或 `/rules restore`，规则板交给 M4 的服务 `glmHournessLifts`；计算遇到不认识的归「其他」，F40）、`units`（人的原话或命令文本的字数，§4.3；原话本身不记）、`ref?`（违规流水里那一行的 `recordKey`） |
| `approval` | DSH 审批的发起与结论 | `id`、`phase`（`asked`、`decided`）、`tool?`、`call?`、`outcome?`（`allowed-once`、`rejected`、`cancelled`、`unavailable`，F14） |
| `command` | 人发的斜杠命令开始与结束 | `cid`、`name`、`phase`（`run`、`done`）、`result?`（`success`、`error`） |
| `ask` | 一次 DSH 原生问题请求开始（子会话之外的普通会话与探针；主 Agent 出原生问题本身是要数的违规，M3 §3.10） | `q`、`qs`（问题数）、`opts`（选项总数）、`units`（问题与选项文字的字数）、`ref?` |
| `answer` | 这次原生问题请求结束 | `q`、`ms`、`end`（`answered`、`aborted`、`no-provider`、`timed-out`、`error`，F12）、`pick?` |
| `said` | 人往会话发一条消息（F10） | `units`（文本块的字数）、`attachments`（附件块数）、`source`（消息 `source.kind`） |
| `graph`（`by: graph`） | 一次成功的写入追加的每条历史各一条；`backfill-graph` 从图历史补录的条目。写入方是图工具（模型与 harness 的身份）、命令行 `npm run graph`、人自己的 `/graph-run`，以及 M3 的 `record_human_answer`、接管的 `bootstrap_apply`、M7 的 harness 写入，都经同一个引擎的 `apply`（plain-ui 0.7：面板不写图；观察的办法见 §6.3） | `node`、`type`、`op`、`hi`（历史序号）、`actor`（`human`、`llm`、`harness`）、`rev?`（写入后的修订号；补录的历史条目没有，F23）、`relay?`（是否带转述）、`from?`、`to?`、`src?`（补录时为 `history`） |
| `graph-fail`（`by: graph`） | 一次写入没成。引擎的失败结果只有错误码、说明、提示和出错字段，没有历史序号与修订号，`invalid`、`not_found` 时连目标节点和类型都可能没有（`src/graph/engine.ts` 的 `Failure`），所以不与 `graph` 共用一行字段表（F23） | `actor`（调用 `apply` 的那一方，引擎自己知道）、`err`（错误码，id）、`op?`（请求解析出来时才有）、`node?`（请求指向的节点 id，有才记）、`field?`（出错的请求字段名，有才记；不像 id 形状时不写） |
| `report` | `/hourness` 生成一次报告（基础 hourness 行；M7 的报告用 `operate.report`） | `kind`（`status`）、`units`、`ms` |
| `count`（`by: guard`） | 每天一次的计数（第一个用户是 M4 的压制注释数） | `what`、`value`、`byKey?`（`map`：键是 id，值是整数，至多 32 项） |

#### 人 2026-10-31 的决定要的种类（`timeout.*` 的 `by` 是交它的那一块：`rules`、`loops`、`env`、`execute`；`progress.*` 的 `by` 是 `execute`；4 种，本设计起名）

这几种在已放行的规则板 0.10、循环板 0.6、M7 0.6 里还没有，在 M4 0.6 里只提到有这样一条事件而没有定字段；字段表是闭合的，不能等发送方各自起名，所以由本设计定，发送方实现时照这里交（§6.2、§14）。取值清单留在发送方的设计里的写 `id`。

| 种类 | 何时 | 正文字段 |
| --- | --- | --- |
| `timeout.set`（`d-timeout-measured`） | 一条脚本或检查的超时值定下或变了：第一次由写它的 agent 估的预计用时定（限＝3 × 预计，受发送方的下限与上限约束），之后 harness 按实测改，或没有估计时用缺省，或 3 倍超过上限、保持上限。时间是信封的 `at`。值或来源变了就交一条；3 倍超过上限、保持上限并告诉了主 Agent 时也交一条（`limitMs` 与上一条相同，`prevMs` 等于它，`told` 为真）；都没变就不交 | `entry:id`（发送方自己的条目 id：规则板的规则或检测器，循环板的条目，M4 的检查，M7 合入前检查的编号）、`kind:id`（脚本、检查等，取值在发送方设计里）、`limitMs:int`（这个值）、`prevMs?:int`（上一个值，第一次没有）、`source`（枚举，五个值，F41：`estimate`＝还没跑过，限＝3 × `estMs`；`measured`＝限＝3 × 最近几次运行里最慢一次；`default`＝没有估计，用条目写明的缺省；`ceiling`＝3 倍超过上限，保持上限，不论 3 倍是从估计还是从实测来；`fixed`＝设计里定死的值，只给还没改用这条规则的发送方，例如 M7 0.6 合入前检查的 30 分钟）、`estMs?:int`（写它的 agent 估的预计用时，毫秒；`estimate` 带，3 倍从估计来的 `ceiling` 与 `floored` 为真的值也带；`measured`、`default`、`fixed` 不带）、`estSession?:id`（`estimate` 时，agent 估这个数的会话）、`floored?:bool`（发送方的下限抬起了这个值，`limitMs` 因此大于 3 倍；M4 的下限是 5 秒；`estimate` 与 `measured` 可带）、`runs?:int`、`runIds?:id[]`（`measured` 与由实测来的 `ceiling`，依据的运行次数与发送方的运行号，至多 32 项）、`slowestMs?:int`（依据的最慢一次）、`wantedMs?:int`（`ceiling` 一律带：3 倍本来的值）、`told?:bool`（`ceiling` 时是否已告诉主 Agent） |
| `timeout.hit`（`d-timeout-measured`） | 一次脚本或检查超时，结局已按条目写明的办法处理（放行、拦下、算没跑完下次再跑等）。优雅失败的话（写明是哪一条、限多少、跑了多久、接下来怎么办）在发出之后才交这条 | `entry:id`、`kind:id`、`limitMs:int`、`elapsedMs:int`（实际用时）、`outcome:id`（结局，取值在发送方设计里）、`source`（这一次在用的限的来源，五个值同 `timeout.set`）、`told:bool`（上面那句话是否已交给 agent；没交出去时为假，条目照结局走，不因此崩，不丢工作）、`run?:id` |
| `progress.due`（用户图，G18） | 目标里一块做完（一个模块或里程碑），或整个目标做完，按图上的状态变化认（与面板「上次看之后」的两种行同一件事，plain-ui 1.1 §4.8），一次一条 | `goal:id`、`part?:id`（`scope` 为 `part` 时，做完的那一块的节点 id；目标的直接子节点里状态变为完成的特性，有 `stage` 的是模块，没有的是里程碑，两种都放这里，F46）、`scope`（枚举：`part`＝一块，`goal`＝整个目标）、`away:bool`（此刻人不在，这份汇报要攒着） |
| `progress.handover`（用户图，G18） | 汇报交给人：人在时当场交一份（`n` 为 1，`waitedMs` 为 0），人不在时攒着、回来时一起交（`n` 大于 1 是常见情形）。整个目标做完的那一句带整体审查的结论，由主 Agent 写，文字不进流水 | `n:int`（这一次交付带了几份汇报）、`waitedMs:int`（其中最早的一份从到期等到交付的毫秒数）、`goalDone:bool`（这一次含整个目标做完的那一句） |

这几种的规矩：一、`timeout.set` 与 `timeout.hit` 只在发送方自己的记录之外多记一份计量，页面和晨报的来历与超时记录读发送方自己的数据（§2 表里「板上超时值的来历与超时记录」一行）；二、`rules.script` 的结果为超时、`loop-done` 的 `outcome` 为 `unfinished`、`bootstrap.trial` 的 `outcome` 为 `timed-out` 各管各的运行计数，超时的次数以 `timeout.hit` 为准，接管的试跑超时不另交 `timeout.hit`（它的限在 `bootstrap.trial` 里，§4.5）；三、怎样判断人不在、回来，汇报由谁攒，归 M7 的下一次修订（用户图 G18），本设计只记结果：`progress.*` 在 M7 交之前没有发送方，对应的事实行写「—」（§7.2、§11 第 16 项）；四、四种都不带文字：条目 id、运行号、结局是 id，汇报的内容和给 agent 的话不进流水；五、预计用时与超时的关系按编排方 2026-10-31 的裁定（可逆）：agent 估的是预计跑多久，超时一律是它的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用条目写明的缺省，不低于发送方的下限、不超过发送方的上限；所以 `estimate` 的 `limitMs` 是 3 × `estMs`，被下限抬起时 `floored` 为真，被上限截住时来源写 `ceiling` 并带 `wantedMs`，写入器不核对这个算式（验收第 21 条），核对归发送方自己的测试；六、与 M4 0.6 §6.3.1 的对应（0.5 对着盘上的 `ValueLine`、`TimeoutLine` 核过）：`ValueLine.source.by` 为 `estimate` 对应 `estimate`（`estimateS` 乘 1000 是 `estMs`，下限抬起时 `floored` 为真）；`harness` 对应 `measured`（`runs` 里最大的一个是 `slowestMs`，`runs` 的个数是 `runs`）；`ceiling`（没有估计、也没跑过，取最长的）对应 `default`；`ValueLine.capped` 有值时 `source` 写 `ceiling`，`wantedMs` 取 `capped.wantedMs`；`TimeoutLine` 对应 `timeout.hit`（`check` 是 `entry`，`outcome: 'not-finished'` 原样放进 `outcome`）。M4 的 `cap.by: 'setting'`（主 Agent 把这一项检查的上限调高）不另设字段：`limitMs` 与 `wantedMs` 已够核对，调高的时刻与理由留在 M4 的 `limits.jsonl`，页面与晨报读那里。

#### 规则板 0.10 §10.5（`by: rules`，15 种）

0.8 的 11 种：`rules.judged`、`rules.session-summary`、`rules.ticket`、`rules.wake`、`rules.write`、`rules.proposal`、`rules.peak-mode`、`rules.recovery`、`rules.detector-run`、`rules.check`、`rules.health`；0.9 起多的 4 种：`rules.script`、`rules.late-verdict`、`rules.repo`、`rules.stale`。其中 `rules.check` 是接缝裁定「checkCall 写判定事件」要的那一条（`design-context.md`「Seam rulings」第 2 条），每一次 `checkCall` 都写、放行也写，M6 的 `gateOnRules` 不另写。`rules.late-verdict` 是超时之后晚到的拦下（`d-script-timeout`）。

#### 循环板 0.6 §6.10（`by: loops`，11 种）

`loop-fired`、`loop-done`、`loop-entry`、`loop-drift`、`loop-note`、`loop-read`、`loop-contribution`、`loop-duplicate`、`loop-holder`、`loop-handover`、`loop-task-delete`。0.5 起 `loop-done` 的 `outcome` 多 `refused`（带 `reason`，0.6 多一个 `not-in-checkout`）与 `unfinished`（脚本超时没跑完，`d-script-timeout`），`loop-entry` 的 `op` 多 `repin`、`external`、`adopt`。`loop-read` 写进 `last-step.json` 指向的项目（0.6），不再有机器一级的一份。

#### M7 0.6 §3.16（`by: execute` 或 `operate`，23 种）

`execute.` 开头 21 种：`dispatch`、`dispatch-refused`、`plan`、`ask`、`handback`、`review-depth`、`review`、`stop`、`check`、`advance`、`advance-refused`、`unchecked-advance`、`goal`、`tier`（M7 0.5 新增）、`completion-gate`、`acceptance-review`、`reconcile`、`loop-entry`、`loop-fallback`、`loop-contribute`、`peak-cap`；`operate.` 开头 2 种：`report`、`patrol`。主 Agent 选模型的理由：类别与文字不进流水，流水只记 `execute.dispatch` 的模型与 `whyRef`（理由所在的节点与历史序号），理由文字留在会话日志与图上的派发批注（M7 0.6 §3.16、§5）。

#### M6 0.6 §14.2（`by: glm`，4 种）

`glm.quota-read`、`glm.upstream-limit`、`glm.login-rejected`、`glm.peak-reminder`。积分、token 与每次调用的耗时已在用量流水里，GLM 包不重复交（M6 0.6 §14.2 末段），本设计第 3 步不再改 `src/glm-llm/zcode.ts`。

#### M3 附录 0.6 §3.12（`by: design`，10 种；人放行过的 0.5 是 8 种）

`design.proposal-shown`、`design.answer-recorded`、`design.delegation`（0.6 新增）、`design.proposal-refused`（0.6 新增）、`design.answer-refused`、`design.holder-moved`、`design.rule-denied`、`design.bypass-refused`、`git.snapshot`、`git.snapshot-refused`。版本（F49）：人放行过的是 0.5，原文在 `.agents/tasks/m3/design-addendum-0.5.md`；`.agents/tasks/m3/design-addendum.md` 现在是 0.6（`d-ask-three-gates` 的试行，第 3 轮评审 APPROVED，编排方已按它恢复 M3 的实现），它对本设计的请求在节点 `metrics` 第 33 条批注，本设计收下。`design.answer-recorded` 一次 `record_human_answer` 调用一条（plain-ui 0.7 §5.6 的计数单位），0.6 起只在 `question`、`confirm`、`release` 成功时发；「这类你定」（`record_human_answer` 的 `delegation`）记 `design.delegation`；`propose_to_human` 在硬限制、记录规则或一条回复的件数上被拒记 `design.proposal-refused`，不记 `text`。0.6 加在两种旧事件上的字段在 §4.5 都是可选的，所以按 0.5 写的事件和按 0.6 写的事件都照收（§15 第 37 条）。模块放行带模块 id（M3 附录 §3.14）。`design.holder-moved` 记持有者记录建、换、删——主 Agent 是哪个会话由它认，本设计不再用 `session.main`（F2）；持有者记录放在哪里，照 M3 对齐轮的结果：M3 附录 0.5 §2.4 与 `src/graph/main-agent-holder.ts` 今天仍写在用户级目录，搬进项目的 `.llm/` 留给 M3 的对齐轮（F29）；本设计只读 `design.holder-moved` 事件，不读这个文件，所以搬家前后都成立。

#### 接管 0.6（`by: bootstrap`，1 种，本设计新答的一种）

`bootstrap.trial`：接管在试跑时每跑完一条命令交一条（接管 0.5 §2.4 请本设计定种类与字段，写明「没定之前不调」；节点 `metrics` 2026-10-30T21:02Z 的批注要的是命令 id、结果、耗时、`envKey`）。字段见 §4.5，与接管 0.6 的试跑流水记录（`round`、`commandId`、`outcome`、`limitMs`、`limitSource`、`ms?`、`log?`、`envKey`，接管 0.6 比 0.5 多了 `limitMs` 与 `limitSource`）一一对上，F27。试跑里命令的超时也记在这一条里（`outcome` 为 `timed-out`，限在 `limitMs`），不另交 `timeout.hit`。这是 agent 的决定，可推翻（§15）。

### 4.3 口径

- 字数 `textUnits(s)`（`src/shared/text-units.ts`）：每个汉字、假名、谚文音节与全角字符算 1；每一段连续的 ASCII 字母与数字算 1（一个英文词）；标点与空白不算。M7 §3.12.3「中文按字、英文按词计」的同一口径，项目图、卡片、报告都用这一个函数。
- 一步：`agent/request` 瀑布（agent-loop:1191–1194）在每次模型请求之前给出 `(turn, step)`（F13）；按 agent id 记下最近一次 `agent/request` 的 `(turn, step)`，下一次带同一 `sessionId`、不带 `purpose` 的 `llm/stream` 就属于这一步。压缩与会话标题的调用带 `purpose`，不算步。`agent/request-error`（agent-loop:1136）给出本步的重试次数，写进 `llm.retries`。
- 用时：`llm.ms` 从调用 `llm/stream` 到流结束；`ttft` 到第一个 `text-delta`、`reasoning-delta` 或 `tool-call-delta`；`tool.ms` 是 `tool/result` 与 `tool/call` 两个会话事件的 `time` 之差（含审批等待）；问人的等待在 `design.answer-recorded` 里（M3 交）。
- 积分：写入时经计价服务 `glmHournessPricing` 的 `charged(model, usage, atMs)` 与 `peak(atMs)` 算（`src/shared/pricing.ts`，口径 `ORCHESTRATION.md` §11.2），保留 4 位小数。记的是当时规则下的数；没有计价服务或模型不在套餐里时不写这两个字段，报告只列 token。
- 工具类别 `toolCategory(name)`（`src/shared/tool-names.ts`）：`read`、`write`、`search`、`shell`、`graph`、`dispatch`、`memory`、`web`、`todo`、`question`、`mcp`、`other`。表覆盖 rc.3 的原生名（`DESIGN.md` §2.4a 工具名表）与 ZCode 别名（`src/glm-prompt/aliases.ts`），`mcp__` 开头的归 `mcp`，其余 `other`。派发类就是 `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 六个名字。
- 路径散列 `target`：文件工具的目标（`file_path`、`path`，字段表同 guard），在项目根之内用相对路径，之外用绝对路径；正斜杠，Windows 上转小写；取 `HMAC-SHA-256(key, 路径)` 前 12 位，`key` 是每个项目一份的随机 32 字节，放在项目的 `<root>/.llm/metrics-key`（`metrics/` 目录之外，不在用户级目录，`d-memory-scope`），第一次需要时以 `wx` 写，不进流水、不随 `field-trial` 导出（F16）。密钥文件单独丢了就重新生成，之后的散列与之前的对不上，跨过换钥点的返工会少算几次（整个 `.llm/` 一起丢时流水也没了，不存在新旧混在一份流水里的问题）。用来算「改了、跑了、又回去改同一个文件」（标定的返工口径）；导出到别的机器上看不出是哪个文件。
- 命令第一个词 `cmd`：shell 工具（`pwsh`、`bash` 读 `command`，`terminal_send` 读 `text`，同 guard）命令文本去掉首尾空白后的第一个词，去掉 `.exe`，转小写；只在它由字母、数字与 `._-` 组成、至多 24 字符、不含 6 位以上连续数字、不像 16 位以上的十六进制串时记，否则写 `other`。`TOKEN=… cmd` 这种带赋值的开头含 `=`，记为 `other`。

### 4.4 隐私：字段表是唯一的关口

写入器在序列化之前逐字段校验（`src/metrics/schema.ts` 加 `src/metrics/kinds/*`），这是唯一的关口，调用方怎么写都过这一道：

| 类型 | 规则 |
| --- | --- |
| 整数 | 非负的安全整数 |
| 数 | 有限、非负 |
| 布尔 | `true` 或 `false` |
| 枚举 | 表里的值之一 |
| id | 匹配 `^[A-Za-z0-9_.:@+/-]{1,120}$`：没有空白、没有反斜杠、没有非 ASCII 字符 |
| `id[]` | 元素都是 id，至多 32 项（F1） |
| `int[]` | 元素都是非负安全整数，至多 32 项（F1） |
| 一层记录 `rec` | 键固定，由字段表声明每个键的类型（整数、布尔、枚举或 id）和是否必填；不能再嵌套（F1） |
| 映射 `map` | 键是 id，值是整数、布尔或 id，至多 32 项；用于键本身随数据而变的地方（信号名、窗口名、计数的分项）；不能再嵌套。值不是这三种之一的那一项，由发送方的适配器在交来之前换成只留名字（见 §4.5 `rules.judged` 的 `unread`），不由写入器改写 |
| 兄弟设计拥有的取值（`id` 型字段） | 取值清单（例如 `loop-done` 的 `outcome`、`execute.goal` 的操作）留在兄弟设计里，字段表只固定名字和 `id` 类型，不抄清单，免得两处走样（`CHARTER.md` §7.1 条款 6）；计算遇到不认识的取值归入「其他」 |

缺必填、类型不对、有字段表之外的键、数组或记录超项：整条拒收，不截断、不改写，写一条 `reject`，行健康计数，控制台每个「种类 × 字段」告警一次。序列化后超过 4096 字节也拒收。

从不记：对话正文与提示词、推理内容、工具参数与结果正文、文件内容、路径原文、命令全文、审批理由、错误文字、转述原话、节点正文与选项文字、人发的消息正文、凭证、令牌、请求头、签名、设备 id。字段表里没有放得下它们的字段：字符串只许 id 形状，装不下一句话或一个 Windows 路径；数组只放 id 或整数；记录只一层。

### 4.5 兄弟设计的种类：字段名与类型从哪来

兄弟设计的事件表有两种写法：循环板 0.6 §6.10 和规则板的 `rules.check` 把字段写成了 `{…}` 形式的名字，这些名字逐字取；其余只写了内容（M7 的表、M3 的表、M6 的表、规则板的其他 14 种），没有字段名。字段表是闭合的，不能留到实现时再起名，所以由本设计起名：一项内容一个字段，名字用兄弟设计里已有的英文词（`sameAsMain`、`reviewPending`、`incomingFloor`、`unparsed` 等）或内容的直译；类型按 §4.4 取最窄的一种，兄弟设计拥有取值的写 `id`。兄弟设计用到时，`src/<包>/metrics.ts` 的 `emitMetric` 按 `src/shared/metrics.ts` 导出的联合类型写事件，名字写错编译不过，所以名字只定在一处。兄弟设计下一稿给了不同的名字，改 `kinds/<名字空间>.ts` 一个文件和 §4.5 对应的行，格式版本 `s` 不加（新加种类和可选字段不加，改了含义才加）。

记法：`?` 可选；`int`、`bool`、`id`、`id[]`、`int[]` 同 §4.4；`rec{…}` 是声明了键的一层记录；`map` 是映射。会话 id 在信封的 `sid`，项目在文件位置，时刻在 `at`，正文都不再写。

#### 规则板 0.10 §10.5

| 种类 | 正文字段 |
| --- | --- |
| `rules.judged` | `rule:id`、`how:id`（执行方式：拦截、排队、只记录；规则板 0.10 的取值，不抄清单。只记录是用户自己选的做法，不是规则的阶段，宪章 0.8 §6；规则从启用起就拦，所以这里没有『影子』）、`tool:id`（原生工具名）、`ticket?:id`、`sub:bool`（是否子调用）、`signals:map`（判定用到的信号值）、`unread?:id[]`（值不是整数、布尔或 id 的信号名）、`ms:int` |
| `rules.session-summary` | `judged:int`、`allowed:int`、`medianMs:int`、`maxMs:int` |
| `rules.ticket` | `ticket:id`、`rule:id`、`state:id`（开、解除、做完、取消、过期、转交、接手）、`why?:id`（过期原因）、`ms:int`、`goalOk?:bool`（不做档：goal 暂停或恢复是否成功） |
| `rules.wake` | `ticket:id`、`via:id`（`steer`、`inject`、`followup`）、`sent:bool`、`ms?:int`（agent 之后重试或接着做时补的一条） |
| `rules.write` | `seq:int`（流水序号）、`op:id`、`actor:id`、`target:id` |
| `rules.proposal` | `proposal:id`、`pending?:id`、`kind:id`、`result?:id`、`actor?:id`、`ms?:int` |
| `rules.peak-mode` | `level:id`、`by:id`（谁改的）、`held?:int`（高峰开始与结束时，不做档停下的会话数） |
| `rules.recovery` | `why:id`、`dropped:int`（没有生效的行数）、`kept:bool`（是否另存了旧存档） |
| `rules.detector-run` | `detector:id`、`ok:bool`、`ms:int`（值不进事件） |
| `rules.check`（名字逐字取自规则板） | `effect:id`、`exitCode:int`、`rules:id[]`、`peakMode:rec{level:id, origin:id}`、`glmSpend?:id`、`glmPeakSource:id`、`unknownSignals:id[]`、`waitedMs?:int`、`caller:id`（`cli`、`library`） |
| `rules.health` | `code:id`（固定代码，不是文字） |
| `rules.script` | `rule:id`（规则或检测器）、`event:id`、`result:id`、`ms:int`、`inCheck:bool`（是否在 `checkCall` 里） |
| `rules.late-verdict` | `rule:id`、`sig:id`（调用的签名）、`result:id`、`afterMs:int`、`told:bool`（主 Agent 是不是当场收到） |
| `rules.repo` | `kind:id`、`digest:id`、`diffs:int` |
| `rules.stale` | `listed:int`、`proposed:int`、`detectors:int` |

#### 循环板 0.6 §6.10（名字逐字取自循环板，去掉 `at`、`project`）

| 种类 | 正文字段 |
| --- | --- |
| `loop-fired` | `entry:id`、`run:id`、`source:id`、`plugin?:id`、`row?:id`、`trigger:rec{kind:id, event?:id, occurrenceAt?:id}`、`events:int`、`cause?:id`、`late?:bool` |
| `loop-done` | `entry:id`、`run:id`、`outcome:id`、`reason?:id`、`exits?:int[]`、`durationMs?:int`、`outputBytes?:int`、`delivery?:id`、`messageId?:id` |
| `loop-entry` | `entry:id`、`op:id`、`actor:id`、`via:id`、`question?:id`、`sha256?:id` |
| `loop-drift` | `entry:id`、`what:id` |
| `loop-note` | `entry:id`、`run?:id`、`chars:int` |
| `loop-read` | `entry:id`、`ok:bool`、`ms:int`、`hit:bool` |
| `loop-contribution` | `plugin:id`、`row:id`、`op:id`、`accepted:int`、`dropped:int`（循环板 0.6 没有 `project` 字段，发送方答不出项目时按 §3.5 只计数） |
| `loop-duplicate` | `event:id`、`key:id`、`from:id`、`firstSeen:id` |
| `loop-holder` | `session?:id`、`state:id`、`reason?:id` |
| `loop-handover` | `op:id`、`pid:int`、`session:id` |
| `loop-task-delete` | `entry?:id`、`scheduleId:id`、`why:id`、`deleted:bool` |

#### M7 0.6 §3.16

| 种类 | 正文字段 |
| --- | --- |
| `execute.dispatch` | `role:id`、`target:id`（任务或目标）、`n:int`（次数）、`child:id`、`provider:id`、`model:id`、`think:id`、`sameAsMain:bool`、`sameAsWorker?:bool`、`depth?:id`（声明的审查深浅）、`whyRef:rec{node:id, hi:int}`（理由所在的节点与历史序号） |
| `execute.dispatch-refused` | `code:id` |
| `execute.plan` | `task:id`、`version:int`、`result:id`、`steps:int`、`waitedMs:int` |
| `execute.ask` | `task:id`、`waitedMs:int`、`result:id` |
| `execute.handback` | `task:id`、`n:int`、`status:id`、`stopReason:id`、`commits:int`、`files:int`、`ms:int`、`outside:int`（范围外文件数） |
| `execute.review-depth` | `task:id`、`declared:id`、`effective:id`、`floors:id[]`（命中底线清单的哪几类）、`unparsed:bool` |
| `execute.review` | `task:id`、`round:int`、`depth:id`、`model:id`、`blocking:int`、`nonBlocking:int`、`downgraded:int` |
| `execute.stop` | `node:id`、`kind:id`、`rounds:int` |
| `execute.check` | `commit:id`、`task?:id`、`ok:bool`、`kind:id`、`cmds:int[]`（每条命令的序号）、`exits:int[]`、`ms:int[]`、`setup:bool`、`lockMs:int` |
| `execute.advance` | `ref:id`、`how:id`、`from:id`、`to:id`、`task?:id`、`by:id`（按检查还是按路径）、`checkAfter:bool`、`reviewPending:id[]`、`incomingFloor:int`、`external?:bool` |
| `execute.advance-refused` | `missing:id` |
| `execute.unchecked-advance` | `ref:id`、`from:id`、`to:id`、`missing:id` |
| `execute.goal` | `goal:id`、`module?:id`、`op:id`、`code?:id`（阻塞原因码）、`resumeWhy?:id` |
| `execute.tier` | `tier:int`、`node:id`、`running:int`、`stale:int`、`told:int`、`handed:int` |
| `execute.completion-gate` | `goal:id`、`ok:bool`、`gaps:int` |
| `execute.acceptance-review` | `goal:id`、`round:int`、`model:id`、`verdict:id`、`blocking:int` |
| `execute.reconcile` | `lost:int`、`redone:int`、`evidence:int` |
| `execute.loop-entry` | `entry:id`、`key:id`、`sent:bool`、`deferred?:id` |
| `execute.loop-fallback` | `entry:id`、`key:id`、`why:id`、`waitedS:int` |
| `execute.loop-contribute` | `row:id`、`accepted:id[]`、`dropped:id[]`、`reasons:id[]` |
| `execute.peak-cap` | `model:id`、`cap:int`、`running:int` |
| `operate.report` | `kind:id`、`lines:int`、`units:int` |
| `operate.patrol` | `found:map`（各类发现的条数）、`did:id[]`（harness 做了什么）、`trunk:id`（主干检查的结果） |

#### M6 0.6 §14.2

| 种类 | 正文字段 |
| --- | --- |
| `glm.quota-read` | `ok:bool`、`why?:id`（原因码）、`ms:int`、`by:id`（`command`、`service`）、`windows:map`（窗口名到已用百分比，四舍五入到整数）、`dropped:int`（丢弃的行数） |
| `glm.upstream-limit` | `code:id`、`hasReset:bool`（有没有恢复时刻） |
| `glm.login-rejected` | `path:id`、`status?:int`、`code?:id` |
| `glm.peak-reminder` | `window:id`（高峰时段的日期 `peakWindow`）、`mode:id`（`peakMode`，读不到时 `none`）、`note?:id`（`peakModeNote`）、`cap?:int`（`peakWorkerCap`：正文写了子 agent 并发上限时的数，M6 0.6 §14.2，F27） |

#### M3 附录 0.6 §3.12（0.5 的 8 种加 0.6 的 2 种，F49）

0.6 的表只写了内容。写了名字的（`form`、`points`、`sample`、`delegated`、`pickedRecommended`、`field`、`within`）逐字取；只写了内容的由本节起名（`design.delegation` 的 `action`、`count`、`scopeUnits`、`where`，`design.proposal-refused` 的 `code`），规矩同本节开头。0.6 加在两种旧事件上的字段都可选，按 0.5 写的事件照收。取值清单（四种问法、三种动作、两处存放、六个原因码）留在 M3 设计里，字段只固定为 `id`。

| 种类 | 正文字段 |
| --- | --- |
| `design.proposal-shown` | `kind:id`、`form?:id`（0.6：问法，`recommend`、`choose`、`want`、`look`，只在 `kind` 为 `question` 时有）、`number:int`、`goal:id`、`module?:id`、`pending:id`、`attach?:id`（前缀）、`units:int`（`text` 的码点数）、`points?:int`（0.6：返回给人的完整文字的码点数，含选方向时的几条路与原样附上的原文）、`sample?:bool`（0.6：是否带 `sample`）、`again:bool`（是否再给人看一次） |
| `design.answer-recorded` | `kind:id`、`form?:id`（0.6，同上；`confirm`、`release` 没有）、`answer:id`（`agree`、`add`、`reject`，认法在 `src/shared/answer-marks.ts`）、`outcome:id`、`goal:id`、`module?:id`、`pending:id`、`ms:int`（从提议到含第一段原话的人的消息）、`units:int`（原话的码点数）、`noted:bool`（前一条主 Agent 的消息里有没有「我记成」）、`delegated?:bool`（0.6：人对眼前这一件说「你定」，`recordedAs` 以 `DELEGATED` 开头）、`pickedRecommended?:bool`（0.6：`choose` 的 `agree` 且不是 `delegated` 时，人选的是不是推荐的那条路） |
| `design.delegation`（0.6 新增） | `action:id`（存下、撤下或没变：`add`、`remove`、`unchanged`）、`count:int`（写后「这类你定」的条数）、`scopeUnits:int`（人说的那一类 `scope` 的码点数；内容不记）、`where:id`（存放的位置：`graph` 或 `m5`） |
| `design.proposal-refused`（0.6 新增） | `kind:id`、`form?:id`、`code:id`（原因码：`text-shape`、`text-too-long`、`plain-word`、`not-in-text`、`record`、`too_many`）、`field?:id`（`not-in-text`、`record` 时出错的那一项记录字段名）、`within?:id`（`not-in-text` 时那一项该在问句里还是整段里：`ask`、`text`）、`attach?:id`（前缀）。不记 `text` |
| `design.answer-refused` | `kind:id`、`code:id` |
| `design.holder-moved` | `how:id`（`wish`、`here`、`takeover`、`unreadable`、`off`）、`from?:id`、`to?:id` |
| `design.rule-denied` | `rule:id`、`tool:id`、`sessionKind:id` |
| `design.bypass-refused` | `rule:id`、`sessionKind:id`、`goal:id`、`from:id`、`to:id` |
| `git.snapshot` | `class:id`、`saved:map`（`S`、`W` 有无，`L_way`、`L_clean`、`L_wt` 的个数与字节数）、`tagged:bool`、`ignored:int`、`ignoredBytes:int`、`ms:int` |
| `git.snapshot-refused` | `code:id` |

#### 接管 0.6

| 种类 | 正文字段 |
| --- | --- |
| `bootstrap.trial` | `commandId:id`（接管清单里的命令 id；逐字取自接管的试跑记录，草稿曾写成 `cmdId`，0.4 改回，§4.5 的规矩是兄弟设计写了名字的逐字取；已经是 id，不是命令文字，所以不适用 §4.3 的「命令第一个词」规则，也不记命令文字）、`round:int`（接管的试跑流水记录里必填，F43）、`outcome:id`（取值清单留在接管设计里：`passed`、`failed`、`denied`、`confinement-limited`、`timed-out`、`sandbox-broken`、`not-run`、`running`，本设计不抄，计算遇到不认识的归「其他」）、`limitMs:int`（这次试跑的超时限；接管 0.6 §6.3 的记录有，`d-timeout-measured`）、`limitSource:id`（这个限的来源，取值在接管设计里，现为 `ceiling`）、`ms?:int`、`envKey:id`（接管 0.5 §6.3：拼出来的 SHA-256 前 12 位）。接管流水记录里的 `log` 是路径，不进事件；退出码 `exit` 只在接管的 `trial.json` 里，不在它的试跑流水记录里，所以事件里也没有（0.4 曾把 `exit?` 列进「一一对上」，F43） |

## 5. 写入

### 5.1 写入器

```ts
export interface MetricsWriter {
  /** Validate, number and queue one event for a destination. Never throws; never awaits I/O for the caller. */
  record(dest: MetricsDest, event: MetricsEvent): void
  /** Write what can be written now, in sequence order per destination. */
  flush(): Promise<void>
  /** Queue `stop` for every destination written to, then flush with a 2 s budget. */
  close(): Promise<void>
  /** Per destination: written, queued, dropped, rejected, the last error code, today's file size. */
  status(): ReadonlyMap<string, WriterDestStatus>
}

export function openWriter(options: {
  readonly host: 'desktop' | 'headless' | 'cli'
  readonly fs: MetricsFs                 // mkdir, appendFile, stat, readTail, writeFileExclusive; injected in tests
  readonly now: () => number
  readonly randomId: () => string        // 8 hex; crypto.randomBytes(4) by default
}): MetricsWriter
```

`MetricsDest` 就是一个项目根（`projectOf` 给出的 `root`，写 `<root>/.llm/metrics/`）；没有别的目的地（0.2 的机器级目的地随 `d-memory-scope` 取消，§3.5）。每个 `dest` 一条队列、一套序号与一条链，互不相干。一条事件的路径：

1. 校验（§4.4）。不合规就拒收，写 `reject`。
2. 这个 `dest` 在本进程里第一次出现：先排一条 `start`，并在打开当天文件时往文件清单追加一行（§5.5）。
3. 编号：`n` 取这个 `dest` 的下一个序号，`h` 按上一条的 `h` 算。编号与链都在入队时定，所以链的顺序就是序号的顺序，与什么时候写成功无关。
4. 入队。每个 `dest` 一条队列，至多 2000 条。满了就丢**队首之后最早的一条**（队首正在重试，不丢，F17），记进「待报的缺口」（序号范围与最后一条的 `h`）。
5. 排一次写（微任务）。每个 `dest` 同时只有一个写在进行，按队列顺序：
   - 第一次写这个 `dest`：先 `await ensureIgnored(root, '.llm')`（`src/data/project-root.ts`，§3.3 第 4 条）；它抛错就按下面的失败处理，不建任何目录。成功后 `mkdir -p` 目标目录，以 `wx` 写 `.gitignore`。
   - 文件取队首事件 `at` 的 UTC 日期：`events-YYYY-MM-DD.jsonl`。本进程第一次写某个文件时读它的大小与最后一个字节：不是换行（上次崩溃留下的半行），这一次写的开头先补一个换行。
   - 一次 `appendFile` 写一整行（带结尾换行）。成功就出队，接着写下一条；有待报的缺口时，在队尾加一条 `gap`。
   - 失败：记下错误码（`EACCES`、`ENOSPC`、`EBUSY`、`ENOTDIR`、`EPERM` 等），停止写这个 `dest`，30 秒后重试（`setTimeout(...).unref()`），下一条事件进来时也会重试。队首的事件不丢，下一次从它开始，保证顺序。
6. 卸载：`close()` 给每个写过的 `dest` 排一条 `stop`，至多等 2 秒；没写完的就没了，下一次 `verify` 会把这个写入者报为没有正常退出。

写入器不缓冲成批：事件在一次微任务之内就写下去，宿主被杀时最多丢正在写和还在队里的几条。不调用 `fsync`：每条一次 `fsync` 在 Windows 上要几毫秒，模型流与工具调用多了以后是明显的开销；代价是蓝屏时最后几秒可能没落盘，由 §5.4 发现。

### 5.2 库写入口：DSH 之外的一次性进程（F4）

规则板的命令行 `check`、经它判定的 M6 `gateOnRules`（`checkCall` 写 `rules.check`，`gateOnRules` 不另写）、循环板之外的脚本在 DSH 之外运行，判完就退出。`openWriter().record()` 不等 I/O，这些进程在微任务之前就退出，事件会丢，且 `verify` 只看到一个没有 `stop` 的写入者，看不出少了哪条判定。所以给它们一个会等的入口：

```ts
/** Open a short-lived writer, record all events for the project of `dir`, close (2 s budget). Never throws. */
export function appendEvents(
  dir: string,
  events: readonly EmittedEvent[],
  host: 'cli',
): Promise<{ written: number, rejected: number, error?: string }>
```

`appendEvents` 按 `projectOf(dir)` 定位项目（规则板 0.10 §10.5 要的就是「按 §7.3 的项目根定位，不再用 `userDataHome()`」）。`projectOf` 返回 `undefined` 时不写任何东西，返回 `{written: 0, rejected: 0, error: 'no-project'}`，也不建目录。有项目就开一个 `host: 'cli'` 的写入者，逐条 `record`，`await close()`，返回计数。写入失败（`ensureIgnored` 抛错、目录写不进）时在 2 秒预算内重试一次，仍失败就返回 `error`，不抛错。规则板与循环板之外的脚本在 DSH 之外只调它，并 `await` 它的结果再退出；调用方对 `error` 的处理是自己的事（规则板 0.10：写失败不影响判定，每个宿主进程告警一次）。宿主里照旧经服务的 `emit`（不等 I/O，队列与重试在常驻进程里）。宿主进程里也可以同时有一个 `appendEvents` 的短命写入者（F34）：规则板 0.10 §10.7 要库写入口能与宿主里的服务在同一个进程里并存，例如规则行被禁用而循环行在宿主里直接导入规则板的 `check.ts` 时，规则板没有宿主里的写入者，`src/rules/metrics.ts` 只能走库写入口。两个写入者各有自己的 `w`、序号与链，互不影响；`verify` 把它们当两个写入者核对，宿主里的短命写入者 `start.host` 写 `cli`，只写 `rules.*` 这类库写入口的事件，不写宿主专属种类（§5.4 的伪造检查对它同样成立）。

### 5.3 文件、大小与删除（F7）

- 一天一个文件，按事件 `at` 的 UTC 日期命名。没有改名、没有锁，多个写入者跨过午夜也不冲突。
- 体积估计：一条 250–450 字节。本机用量流水 2026-10-27 前后两天约 1080 次模型调用，按每天 600 次模型调用、同样多的工具调用、另有几百条其他事件算，约 0.5 MB/天；并行派发多个 worker 的日子按 3 倍算约 1.5 MB/天；一年 200–550 MB。
- 保留：写入器从不删除、不改写、不压缩。`/hourness` 的覆盖行与 `verify` 写出总大小。
- 删旧文件只有人能做，经 `npm run metrics -- prune --before <日期>`：先往项目流水写一条 `prune {before, files, lines}`，再删那些文件。不提供给主 Agent 的工具或提示；主 Agent 按 `d-main-agent-shell` 能用 shell，所以 `metrics-files-only` 的 shell 判法把删除与移动也算进去（`Remove-Item`、`rm`、`del`、`mv`、`Move-Item`、`git clean` 带 `-x`），`npm run metrics -- prune` 也算，这一整条规则启用即拦（§3.4）。
- 一天的文件超过 64 MiB 时（多半是某个循环失控），行健康注明，照写不停。

### 5.4 发现缺行、改行、删除与没有正常退出

读取一侧（`src/metrics/read.ts` 的 `checkLog`）按写入者核对，后台自查（§6.4）与 `verify` 都调它：

| 发现 | 依据 |
| --- | --- |
| 缺行 | 序号不连续，且缺的范围不在任何 `gap` 的 `from`–`to` 里 |
| 改行或插行 | 按序号重算 `h` 对不上；从 `gap` 的 `lastH` 接着算 |
| 没有正常退出（崩溃、蓝屏、被杀） | 有 `start` 没有 `stop`，且不是正在运行的写入者（最后一条早于 10 分钟之前） |
| 无法读取的行 | 不是 JSON、带 NUL 字节、字段表不认；写出文件名与行号 |
| 时钟回拨 | 同一写入者序号增加而 `at` 倒退超过 5 分钟 |
| 重复 | 同一 `(w, n)` 出现两次（写成功了却报错之后重写）：保留第一条，计数 |
| 文件丢失（F7） | 文件清单（`.llm/metrics-manifest.jsonl`）里有、磁盘上没有、又没有覆盖它的 `prune` 的文件 |
| 伪造（F21） | `start.host` 为 `cli` 的写入者写了只有宿主才会写的种类（`llm`、`tool`、`turn`、`approval`、`command`、`said`），报「命令行写入者写了宿主事件」 |

这些只能发现误写与丢失，不防有意伪造：会改文件或调写入器的人也能重算摘要；伪造一项只是便宜地报出来。

### 5.5 文件清单（F7，0.3 由用户级账本改为项目内）

写入者每打开一个新的日文件，在项目的 `<root>/.llm/metrics-manifest.jsonl` 追加一行 `{file, w, firstN, at}`。清单只追加，在 `metrics/` 目录之外（误删最可能发生在整个 `metrics/` 目录上，清单留在外面才对照得上），也不入项目库（`.llm/` 已被忽略）。0.2 把账本放在用户级目录，随 `d-memory-scope` 取消。它本身被删或损坏时，`verify` 只能少一项核对，不影响其余。`verify` 与后台自查对照清单：清单里有、磁盘上没有、又没有 `prune` 覆盖的文件，报「文件丢失」——这就补上了「一个写入者的全部行都在被删的那天、序号上看不出缺口」那个盲点。

覆盖不到的一种：整个 `.llm/` 被删（`git clean -fdx`、换电脑后重新克隆、手动清目录）。清单、密钥和流水一起没了，`verify` 看到的是一个新项目，什么也发现不了；流水回不来。能补回的只有图历史：图在 git 里，`backfill-graph` 重新补成 `graph` 事件（§7.5）。这是 `d-rules-in-repo` 把运行记录放在不入库的项目 `.llm/` 里的代价，M7 0.6 对自己的 `.llm/execute/` 做了同样的接受（它的检查记录丢了只让核对往严一侧错）。本设计的对应后果是：丢了的这段时间的负担曲线和模型对比没有了，基线要重新攒。两个缓解、都不依赖用户级目录：覆盖行写明「最早一条」的日期，人和主 Agent 一眼看得出数据是不是断过；`/hourness` 的覆盖行在最早一条晚于项目图历史最早的一条时多写「图上有更早的记录，流水从 <日期> 起」。不做跨机器同步或备份（§1.6）。

### 5.6 多个进程

桌面版、headless（探针与标定）、命令行（`npm run graph`、`npm run metrics`、库写入口）都可能同时写同一个项目。每个写入者（`openWriter` 开出来的一个；一个进程里可以有两个，§5.2）有自己的 `w` 与序号，互不协调，不用锁。

同一个文件的并发追加：每行一次 `appendFile`（Node 以追加方式打开，libuv 在 Windows 上用 `FILE_APPEND_DATA`），一行至多 4 KiB。〔推断〕本机 NTFS 上这样的追加不会交错。验收第 12 条用 L3 场景 `metrics-concurrent` 核实（两个进程各写 5000 条）。不通过时的退路已经定下：文件名改为每个写入者一份 `events-YYYY-MM-DD-<w>.jsonl`（`<w>` 取 §4.1 的两种形状，补录的写入者是 `bf-<7 位>`，F31）；读取从第一天起就按 `events-*.jsonl` 取文件，换退路只改写入器与文件清单的文件名规则。项目放在同步盘（OneDrive 等）里时，同步程序可能短暂占住文件，追加得到 `EBUSY` 或 `EPERM`，走 §5.1 第 5 步的重试。

## 6. 接上的地方

### 6.1 指标行自己挂的接缝

| 接缝 | 用法 | rc.3 证据 |
| --- | --- | --- |
| `llm/stream`（waterfall，`(options, next)`） | 包住 `next()` 返回的流，逐块原样转出；块的观察在 `try/finally` 里，流结束、出错或消费方提前停下时写一条 `llm`。`next()` 抛错时 `fin` 为 `error`，原样再抛 | llm:2393–2410；`options` 的 `provider`、`model`、`sessionId?`、`purpose?` 见 types.d.ts:506–548（541、547）；块：`text-delta` 439、`block-end` 453、`usage` 457、`finish` 460；结束原因 `aborted`、`error` 142–146。memory 行对同一接缝的用法见 `src/memory/index.ts:54` |
| `agent/request`（waterfall） | 按 agent id 记最近一次的 `(turn, step)`（F13），原样返回 `next()` | agent-loop:1191–1194（载荷 `{turn, step, signal}`，请求前） |
| `agent/request-error`（waterfall） | 本步重试计数，写进下一条 `llm` 的 `retries` | agent-loop:1136–1146 |
| `session/event`（只观察，在 `append` 内同步调用） | 同步部分只把事件引用放进一个数组，解析放到微任务里做 | session:1517–1536、1579–1599 |
| 会话事件 `turn/start`、`turn/end` | `turn` 事件 | agent-loop:945、1029–1032、950–966 |
| 会话事件 `tool/call`、`tool/result` | `tool/call` 记下 `(会话, callId) → {turn, step, name, time, target, cmd}`；`tool/result` 按 `message.toolCallId` 找到它写一条 `tool`；`turn/end` 时仍没有结果的写 `out: 'none'` | agent-loop:681–706、984；llm:100–110；session:860–868 |
| 会话事件 `approval/asked`、`approval/decided` | `approval` 事件；`reason` 是文字，不记 | user-approval:128–144 |
| 会话事件 `command/run`、`command/done` | `command` 事件；`args` 与 `text` 不记 | commands:333–346 |
| 会话事件 `user/message`（F10） | `said` 事件；只在 `source.kind === 'user'`、会话头没有 `origin: 'subagent'` 时算人说的；`runtime-context` 的注入、notice、子会话继承的首条提示按各自的 `source` 排除 | agent-loop:1067–1073（`user/message` 带 `source`；`runtime-context` 的注入 1067）；子会话首条提示 `source: {kind: 'user'}` 但在子会话里，subagent:1459–1461 |
| `session/disposed`（只观察） | 清掉这个会话在内存里的表 | session:1924–1936 |
| `user-questions/request`（waterfall），`prepend` 注册 | 进入时写 `ask`，`await next()`，结束时写 `answer`（含超时的 `timed-out`，F12），结果或错误原样交回。只用来数 DSH 原生问题（F2） | user-questions:668–691；超时 603–643（`ASK_TIMED_OUT` → `{pending: true}`，640–641）；`prepend` 用 `unshift`，cordis:335–339 |
| `ctx.provide('glmHournessMetrics', …)` | 给别的行发事件 | cordis:800–823 |
| `ctx.get('agents')`、`agents.get(id)` | `llm/stream` 与问题请求只给会话 id，用它找活 agent，读 `session.header` 的 `cwd`、`parentSession`、`origin` | cordis:763–766；agent:596–598；session:1048–1056、1816–1828；subagent:345–356 |
| `ctx.get('glmHournessPricing')` | 每次写 `llm` 时读，形状检查同 `/hourness` | `src/shared/pricing.ts` 的 `pricingService` 与 `UsagePricing`（本仓库契约，`ORCHESTRATION.md` §11.3；按符号名引，不写行号，F32） |

工具调用的结果分类（F14）：`isError` 为假是 `ok`；为真时，`tool/result` 的 `error`（来自 `result.error.info`，agent-loop:701）里带 `{rule}`（guard 与图文件门禁拒绝时放进 `deny` 的 `info`，tools:3337–3350）就是 `denied`；同一调用有审批且结论是 `rejected` 或 `cancelled` 就是 `declined`；其余是 `error`。退路：`error.info` 里没有 `rule` 时，在进程内找同一 `(会话, callId)` 的 `rule` 事件（`exec.callId` 等于 `tool/call` 的 `callId`，agent-loop:509–516、685）。

为什么不用 `tools/post-execute`：参数校验失败、找不到工具这类在准备阶段就给出最终结果的调用不经过它（tools:3211–3222 的 `final-result` 分支直接 `finishScheduledExecution`），会漏记；会话事件 `tool/result` 是模型实际看到的每一个结果，带回合与步，不漏。代价是只记模型发出的根调用，`run_code` 之类内部的子调用不记（带 `rootCallId`，tools:3227），这正是要量的那一层。

### 6.2 别的行交来的事件

契约在公共库 `src/shared/metrics.ts`（两个包之间的服务契约，同 `src/shared/pricing.ts` 的位置）：

```ts
export const METRICS_SERVICE = 'glmHournessMetrics'

export interface MetricsService {
  /** Record one event for the project of a session or directory. Never throws; an event with no project is counted, not written (§3.5). */
  emit(event: EmittedEvent, where: { readonly sessionId?: string, readonly dir?: string }): void
}

/** The service when the metrics row is active and the value has this shape; undefined otherwise. */
export function metricsOf(ctx: ServiceLookup): MetricsService | undefined
/** Emit through the service when present; adds `v` and `by` from the caller's package; swallows and counts errors. */
export function emitMetric(ctx: ServiceLookup, event: EmittedEvent, where: { readonly sessionId?: string, readonly dir?: string }): void
```

`emitMetric` 在每次调用时 `ctx.get`（不需要 inject，指标行晚激活或没装都不影响调用方，`src/shared/pricing.ts` 的 `pricingService` 里 `ctx.get(PRICING_SERVICE)` 的同一做法）。`v` 与 `by` 由调用方所在的包填：公共库编进两个包各自的 `dist/`，`src/shared/build-info.ts` 读本包的 `dist/build-info.json`。`tagQuestion` 删去（F2）：问人不再经卡片构造打标签。

| 发送方 | 名字空间 | 何时 | 现在有没有这段代码 |
| --- | --- | --- | --- |
| guard 行 `src/guard/index.ts` | `rule`（`by: guard`） | 写违规流水的同一处，拒绝与晚到的拦下都交；`ref` 是那一行文本的 `recordKey`（先序列化，再用同一份文本写流水和算键）。`recordKey` 按 M4 §3.2 的定义；M4 没合入时由本设计第 3 步加在 `src/guard/records.ts`，M4 沿用 | 有，本设计改 |
| 图文件门禁 `src/guard/graph-files.ts` | `rule`（`by: graph`） | 拒绝时 | 有，本设计改；M4 的 G1 合入后两处都并进 `installRuleGate` 一处 |
| 项目图引擎的各个调用点 | `graph`（`by: graph`） | 见 §6.3 | 有，本设计改 |
| hourness 行 `src/report/index.ts` | `report`（`by: host`） | 每次 `/hourness` | 有，本设计改 |
| M4 的 `installRuleGate`、跟进记录器、申报通道（`src/guard/metrics.ts` 的 `emitGuardMetric`） | `rule`、`followup`、`request`、`lift`；`count`（压制注释数，`src/env/metrics.ts`） | M4 0.6 §3.11：每写一条拒绝、晚到的拦下、`FollowupRecord`、`RequestRecord`、`GrantRecord`、`GrantVoidRecord`、`LiftRecord` 之后；E4 每天一条压制计数 | M4 实现时 |
| 各块的超时取值与超时（`d-timeout-measured`）：规则板（`src/rules/metrics.ts`）、循环板（`src/loops/metrics.ts`）、M4 的检查（`src/env/metrics.ts`，`by: env`）、M7 的合入前检查（`src/execute/metrics.ts`） | `timeout.set`、`timeout.hit` | 每个超时值定下或变了之后；每次超时按条目的办法处理、给 agent 的话发出之后（§4.2）。M4 0.6 §3.11 已写 E3 会交这两样，只带检查名、上限、实际耗时与结局，字段按本设计 | 各块实现时 |
| M7 的汇报（`src/execute/metrics.ts`） | `progress.due`、`progress.handover`（`by: execute`） | 一块或整个目标做完时；汇报交给人时（§4.2）。怎样判断人不在与回来归 M7（用户图 G18），M7 交之前没有发送方 | M7 下一次修订时 |
| 规则板（`src/rules/metrics.ts`） | `rules.*`（15 种，`by: rules`） | 规则板 0.10 §10.5 的各时刻；DSH 之外经 `appendEvents`（§5.2） | 规则板实现时 |
| 循环板（`src/loops/metrics.ts`） | `loop-*`（11 种，`by: loops`） | 循环板 0.6 §6.10 的各时刻；指标流水合入之前写 `.llm/loops/runs.jsonl`，合入时只改这一个文件。读的一侧同样只改这一个文件（F33）：循环板 0.6 §6.10 末段与 §6.11 要页面「上次」的缓存与 `state.json` 坏了时「从运行记录（指标流水合入后从它）补回」，`staleEntries` 与 `timeoutEntries` 也按 28 天的运行记录算；合入之后它们改为导入本设计的 `readLog(root, {from, to})`（§7.1）取自己的 `loop-fired`、`loop-done` 等种类，不另写解析、不另认文件格式。28 天按 §5.3 的估计是 14–42 MB，读一遍可以接受（页面缓存正常时不读） | 循环板实现时 |
| M7 的执行行与运维行（`src/execute/metrics.ts`） | `execute.*`、`operate.*`（23 种，`by: execute`/`operate`） | M7 0.6 §3.16 的各时刻 | M7 实现时（骨架里出口什么都不做） |
| GLM 通道（`src/glm-prompt/peak-reminder.ts`、`src/glm-llm/*` 的适配器、`glm-login` 行） | `glm.*`（4 种，`by: glm`） | M6 0.6 §14.2 的各时刻；额度读取为某个项目的条目发起时带那个项目的目录（§3.5） | M6 实现时 |
| M3 的设计行 `src/design/metrics.ts` | `design.*`、`git.*`（10 种，`by: design`；0.5 是 8 种） | M3 附录 0.6 §3.12 的各时刻（F49） | M3 实现时 |
| 接管（`src/bootstrap/`） | `bootstrap.trial`（`by: bootstrap`） | 试跑每跑完一条命令 | 接管实现时 |

兄弟各行只有一个出口 `emitMetric`（`src/<包>/metrics.ts`），接口到位之前什么都不做，事实照旧在各自的流水里（规则板 0.10 §10.5、M3 附录 0.5 与 0.6 的 §3.12、M7 0.6 §3.16、M6 0.6 §14.2 都这样写）。`emitMetric` 自带有上限的队列与 `gap`（§5.1），调用方不必另记丢失。M7 0.6 §3.16 写明「指标流水的设计若自己带缓冲与重放，这一段（`<exec>/metrics-gaps.jsonl` 与行健康里的丢失条数）照它改，只改 `src/execute/metrics.ts`」，所以这里不需要对 M7 的设计提请求，指标行默认启用的那一步（§12 第 6 步）顺手去掉那个文件。只装 GLM 通道包时没有服务，`emitMetric` 什么也不做，GLM 的行照常。

违规（M7 的五条 worker 规则与主干前进的核对、规则板的拦截）照旧进违规流水（M7 0.6 §3.16 与规则板 0.10 §10.5 都把「要不要同时进指标流水」交给本设计）：本设计的答案是 guard 框架里的代码规则同时交一条 `rule`（`ref` 指向那一行），规则板的拦截同时交 `rules.judged`（规则板自己的事件，不再另交 `rule`，免得一次拦截在流水里算两次）；M7 的门经 `installRuleGate` 之后自然交 `rule`（M4 0.6 §3.1、M7 0.6 §18.2 的安排）。

### 6.3 项目图引擎

做法是进程内的观察者集合，不是逐个调用点传的选项（F24）。0.3 的做法是 `EngineOptions` 加可选的 `observe`、让每个写图的调用点各传一个；但引擎的调用方不止当时列的三个：M3 附录 0.5 §3.5 第 6 步的 `record_human_answer`（`src/design/record.ts`，以 `llm` 身份写）、接管 0.5 §7.4 的 `bootstrap_apply`（直接调 `openEngine(dir).apply`，与 `record_human_answer` 同一条路）、M7 0.6 的派发批注、计划正文和审查任务（以 `harness` 身份写）都是引擎的调用点，M3、M7、接管的设计里没有「传 `observe`」这一条，M3 的设计也写「没有必须改的」，这些调用点会让 `verify` 把每一次人的拍板和每一条派发批注报成缺失，而这正是最想量的数据。所以改为：

- `src/graph/engine.ts` 导出 `setEngineObserver(fn: (note: EngineNote) => void): () => void`：把 `fn` 加进一个进程内的集合，返回撤销函数（调两次撤销是无害的）。集合放在 `engine.ts` 的模块作用域；两个包是各自 `tsc` 编译的，没有再打包，同一个包里的各行导入同一个 `dist/graph/engine.js`，所以是同一份集合。这一点是假设，列入 §11 第 14 项，退路是把集合挂在 `globalThis[Symbol.for('glm-hourness.graph.observers')]` 上。
- 通知有两处，合起来覆盖 `apply` 的全部返回路径：成功在 `commit` 里 `writeNodes` 成功之后（`src/graph/engine.ts` 的 `commit`；只有这里知道每个草稿追加的那条历史和 `outcome.revisions`），对这次写入改动的每个节点各给一条；失败在 `openEngine` 返回的 `apply` 的包装里（内部 `apply` 返回 `ok: false` 时，按 `Failure` 的错误码与字段、调用时的 `actor` 给一条）。`EngineNote` 是一个带 `dir`（引擎自己的图目录）的联合：成功一支带节点、类型、操作、历史序号、修订号、身份、是否转述、状态前后；失败一支带身份、错误码，目标节点与字段有就带。通知时逐个调用观察者，抛错被接住、不影响返回值，也不影响别的观察者。
- 映射到事件的纯函数在 `src/graph/metrics-events.ts`：成功一支映射成 `graph`，失败一支映射成 `graph-fail`（字段见 §4.2）。plain-ui 0.6 取消了跟随率与计数拍板（§2 表末行、F2），所以不再有 `followed`、`counted`、`units` 的共用约定，`src/graph/inertia.ts` 不存在；M3 附录 0.6 起的跟随推荐比例从 `design.answer-recorded` 算，也不经 `graph` 事件（§7.2，F49）。
- 指标行在 `apply` 里调 `setEngineObserver(note => emitMetric(ctx, 映射(note), {dir: note.dir}))`，卸载时调返回的撤销函数；命令行进程自己开一个 `host: 'cli'` 的写入者，登记自己的观察者，退出前撤销并 `await close()`。项目根按 `note.dir`（图目录）算（§3.3 第 6 条）；图目录不在任何项目里（`projectOf` 为 `undefined`）时事件只计数。指标行没启用时集合是空的，引擎什么都不多做。

这样 M3、M7、接管都不用改：它们已有的或将要有的每个 `openEngine(…).apply` 调用点，只要和指标行在同一个进程里，就被同一个观察者看到。接管 0.5 §2.4 的依赖表写「图的写入由引擎的 `observe` 记（metrics §6.3）」，按本节读成引擎的观察者，不需要它改文字（它下一稿核对节号时顺手改名即可）。

写入方在今天和 M3、M7、接管实现之后是这些（plain-ui 0.7 对本设计的说明，其 §14 第 14 条；面板不写图，`/graph-apply` 随面板的写入删去）。表只用来说明谁会产生事件，不是需要维护的清单，也不是验收的对象：

| 写入方 | 代码里的调用点 | 身份 |
| --- | --- | --- |
| 图工具（模型与 harness） | `src/graph/tools.ts`，图行 | `llm`、`harness` |
| 人自己的 `/graph-run` | `src/graph/run-control.ts`，宿主里的斜杠命令 | `human` |
| 命令行 `npm run graph` | `src/graph/cli.ts` | 命令行固定的身份 |
| `record_human_answer` | `src/design/record.ts`（M3 实现时） | `llm`，带人的原话 |
| `bootstrap_apply` | `src/bootstrap/`（接管实现时） | `llm`，带人的原话 |
| 派发批注、计划正文、审查任务 | `src/execute/`（M7 实现时） | `harness` |

`src/graph/panel-row.ts` 今天还有一个 `openEngine` 调用点（给 `/graph-apply` 用的那一处）。plain-ui 0.8 只删 `/graph-apply` 的分支和它的健康那一半；文件与行 `glm-hourness/graph-panel` 都留着，因为同一个文件还注册 `/graph-run` 和现场投影，要删的只是这个调用点（F30）。观察者集合不依赖调用点清单，所以删不删这个调用点对本设计没有影响。

### 6.4 后台自查（F6，F25）

指标行激活、第一次写成功之后，在后台对每个已写过的 `dest` 跑一次 `checkLog`（§5.4），范围是前一天与当天的文件；只读，用 `setTimeout(...).unref()` 排到空闲，不阻塞任何一步。结果进行健康（「上次有 N 个进程没有正常退出，缺 M 行，链断 K 处，文件丢失 J 个」）与 `/hourness` 的覆盖行。这样崩溃、缺行、链断、整天文件被删，人与主 Agent 在下一次会话里就看得到，不用等谁想起来跑命令行。自查读两天的文件（一天约 0.5–1.5 MB），不是子 agent 也不是重活，高峰模式的任何一档都不管它（`d-main-agent-peak-exempt`）。

另有一条每天一次的自查，走循环板：指标行经 `glmHournessLoops.contribute`（循环板 0.6 §3.1 的服务）交一份贡献，名字空间 `metrics`（循环板 §3.2：名字空间只属于第一个交它的来源，`metrics` 没有被占）：

- 动作一个：`{id: 'metrics.selfcheck', title: '检查指标记录有没有缺行'}`；`run('metrics.selfcheck', event)` 对 `event` 给出的项目跑同一个 `checkLog`。行为按循环板 0.6 §6.5 与 §6.4 第 3 步的送达规则定死（F25）：harness 动作返回 `done` 时，循环板把动作自带的 `tell`（没有就用条目的 `tell`）交给主 Agent，`wake` 取条目 `tell.wake`、条目没有 `tell` 时为真；`wake` 为真且主 Agent 空闲、没有生效的 goal 时走 `followup`，即开一个新回合。所以条目自带一句 `tell` 并把 `wake` 写成假，三种结果这样对应：
  - 没有发现：返回 `{outcome: 'skipped', reason: 'clean'}`。循环板记 `skipped`，不发任何消息。不能返回 `done`，否则条目的 `tell` 每天都会交给主 Agent。
  - 有发现：返回 `{outcome: 'done'}`，不带 `tell`。循环板交条目的那句 `tell`，`wake` 为假，走 `inject`（主 Agent 下一步才看到，不叫醒它、不开新回合），结局是 `delivered`（不是 `reported`；`reported` 是脚本跑完并已交给主 Agent 的结局）。具体发现的内容不在这句话里，主 Agent 与人看 `/hourness` 的覆盖行和行健康。
  - 读不了项目：返回 `{outcome: 'skipped', reason}`。
- 条目一个（循环板 0.6 §2.1 的 `LoopEntryDefinition`）：`id: 'metrics.selfcheck'`、`title: '检查指标记录'`、`why: '每天查一遍指标记录有没有缺行、链断或被删，有就告诉主 Agent'`、`when: {kind: 'daily', time: '10:00'}`（宿主的系统时区）、`action: {kind: 'harness', action: 'metrics.selfcheck', tell: {text: 'The metrics log self-check found something; see the coverage line of /hourness.', wake: false}}`（`tell.text` 是给模型看的英文一句，不含占位，长度在循环板 0.6 §3.2 的 1–2000 个码点之内；用英文是因为它进模型上下文，与循环板其他条目给模型的文字一致，F25）、`basis: '依据指标记录的链式摘要与文件清单'`。页面显示为编排层带来的、只能看（`d-defaults-readonly`、`d-rules-visible`）。它是插件交来的数据，不是脚本或检查命令，所以不走人加条目的同意路径（循环板 0.6 §3.2：`script` 与 `check` 不收，`harness` 动作收）。
- 循环板没装或没启用时，退路是上面的后台自查，只是没有每天固定的那一次。循环板 0.6 §3.3 的「编排层各行交来的」表里还没有 `glm-hourness/metrics` 这一行，写成对循环板的一条请求（§14，等 dogfood 之后）；表里没有不影响收下，校验只看名字空间。这个条目是第一个时间触发的出厂 `harness` 条目：循环板 0.6 §2.3 末条写「出厂的条目里没有时间触发的 harness 动作」，其验收第 1 条按 M7 10、M4 2、GLM 4、循环行 4 项数条目，这一条使页面的条目数多一项，请求里一并写明（§14，F25）。

## 7. 读与计算

### 7.1 读取

`readLog(root, {from, to, basis?})`（`src/metrics/read.ts`）：

1. 列出 `<root>/.llm/metrics/events-*.jsonl` 里日期落在 `[from, to)` 的文件，按文件名的字典序读（F19）。
2. 逐行读（`node:readline`），每行 `JSON.parse` 后按信封加正文字段表校验。读不出、带 NUL、种类不认识、格式版本 `s` 比本代码新的行不进计算，各自计数并记下文件与行号。
3. 按 `(w, n)` 去重，保留文件名在前、行号在前的一条（F19）。
4. 按 `(at, w, n)` 排序。
5. `basis`（F8）给出时（`ReadonlyMap<文件名, 行数 L>`），每个文件只读前 L 行，不在 `basis` 里的文件不读。
6. 返回 `{events, basis, problems}`。`basis` 是每个文件的名字与读到的行数：文件只追加，前 L 行以后不会变，所以「某文件的前 L 行」就是一份确定的输入。

### 7.2 计算：事实与打分两组出口（F9）

`src/metrics/calc.ts` 全是纯函数：输入是 `readLog` 的事件、窗口 `[from, to)` 与时区偏移（`+08:00` 这样的字符串，由调用方给），不读时钟、不读文件、不用随机数。规则：

- 中位数：奇数个取中间那个；偶数个取中间两个的平均，毫秒四舍五入到整数。百分比保留一位小数，积分保留两位；分母为 0 写「—」。
- 所有排序带确定的次序键（先按数值，再按 id 的字典序）。常量 `CALC_VERSION`（从 1 起），任何口径的改动都加一。
- 输出第一行是依据（写全，F8）：`依据：events-2026-10-30.jsonl 1–842 行，events-2026-10-31.jsonl 1–120 行；窗口 2026-10-30T00:00+08:00–2026-10-31T00:00+08:00（+08:00）；无法读取 0；计算版本 1`。同样的依据行（同样的文件前缀）、同样的窗口与时区、同一个计算版本，输出逐字相同（验收第 8 条）。

**两个出口**（F9）：`factsFor(...)` 只出「事实」，`scoresFor(...)` 出全部含「打分」。经主 Agent 对话的报告只导入 `factsFor`；打分只给命令行与 M8。下表每个指标标 F（事实）或 S（打分）：

| 组 | 指标 | F/S | 算法 |
| --- | --- | --- | --- |
| 覆盖 | 事件数、最早一条、今天几条；丢失、拒收、无法读取、未正常退出、文件丢失的次数；总大小 | F | `gap`、`reject`、`checkLog`、文件清单 |
| 任务 | 几件派出、几件做完、几件在等人、哪次检查没过（任务与命令序号） | F | `execute.*`（M7 0.6 §3.16） |
| 规则板与循环板的执行（晨报与周报各有一节） | 脚本规则与脚本条目跑了几次、结果各几次（超时另有「超时」一行）、晚到的拦下几次、仓库规则文件被规则板以外改过几次 | F | `rules.script`、`rules.late-verdict`、`rules.repo`、`loop-done`（`outcome` 为 `unfinished`、`refused`）。两张单子都不在这里算（F38）：「4 周没触发」的单子由两块板的服务（`staleEntries`）算，「7 天里超时 3 次以上」的单子由循环板的 `timeoutEntries`（循环板 0.6 §6.11）与规则板的服务算，M7 周报读的就是它们；流水里的超时次数只用来和这两张单子对账，不另列单子，免得两处各算一次、数对不上。`rules.stale` 只记它们被列出了几条（规则板 0.10 §10.5、循环板 0.6 §6.11） |
| 问人 | 次数、DSH 原生问题数、审批数（都是计数）；0.6 起另有：每种问法各问了几次、「你定」的次数、「这类你定」存下与撤下的次数、问话被拒的次数（按原因码）（F49） | F | `design.proposal-shown` 条数，0.6 起按 `form` 分；`ask`、`approval`；「你定」= `delegated` 为真的 `design.answer-recorded` 条数；「这类你定」= `design.delegation` 按 `action` 分；被拒 = `design.proposal-refused` 按 `code` 分（试行里的长度上限由人看效果再调，被拒多的那一条就是该调的，M3 附录 0.6 §3.12）。主 Agent 说「我定了：」的告知句不在流水里（消息正文不记），由练习题的 `check.mjs` 从会话日志数（M3 附录 0.6 第 12 步（a）） |
| 每步 | 每步 token 与积分（中位数）、用时、首字用时（中位数、最长）、结束原因分布 | S | 带 `turn`、`step`、不带 `purpose` 的 `llm`，按模型分组 |
| 工具 | 每步工具调用数、结果分布、被拦率、按类别的出错率、返工次数 | S | `tool` 按 `(sid,turn,step)` 归到步；被拦率 = `denied`/全部；返工 = 同一 `target` 的第二次成功写入，且两次之间同一会话有过 `shell` 调用 |
| 拦截（计数） | 按规则 id 的拦下次数（近 7 天，晨报按日）；晚到的拦下另列一行；板上规则的排队单列；用户自己选了只记录的规则的命中再单列，不算拦截。没有样本数、误伤率或转正进度（`d-code-rules-enforce`） | F | 口径同 M4 的 `classifyRecord`（M4 0.6 §3.2）：`rule` 的 `effect` 为 `deny`、`rules.judged` 的 `how` 是拦截算拦截；`rule` 的 `effect` 为 `late`、`rules.late-verdict` 的拦下算晚到的拦下，另列；`rules.judged` 的排队与只记录（M4 的 `deferral`、`rule-record`）各单列，不算拦截。这样 `/hourness` 从流水算的拦截数和 M4 从违规流水算的对得上 |
| 撤下 | 近 7 天每条规则被撤下与恢复各几次，现在哪几条处于撤下 | F | `lift`：同一规则最后一条的 `action` 为 `lift` 就是现在处于撤下。这只是计量；撤下的现状以 M4 的 `liftedRules`（M4 0.6 §3.5）为准，两边不一致时以它为准 |
| 超时 | 每个条目近 7 天超时几次、最近一次的限、用时与结局；超时值现在的来源（五个值之一：按预计、按实测、没估计用缺省、截在上限、设计里定死的值）与它依据的预计用时（有才列）、最近一次变更的时间与旧值；被上限截住几次、是否告诉了主 Agent | F | `timeout.hit`、`timeout.set`（§4.2）。`rules.script` 的超时结果、`loop-done` 的 `unfinished`、`bootstrap.trial` 的 `timed-out` 只算各自的运行计数，超时次数以这里为准，`verify` 对账（§7.5） |
| 额度停住 | 推进因 GLM 额度用完停了几次、共停了多久、自己接上几次（人手动接上的另计）、现在是不是停着 | F | `execute.goal`：M7 给额度用完的阻塞原因码的那一条停住，到下一条恢复之间算一次停住；恢复的 `resumeWhy` 是额度重置的算自己接上，别的算人手动接上；`glm.upstream-limit` 的次数与 `hasReset` 作旁证。两个码的字面值由 M7 定（§4.4 末行），M7 没定（用户图 G15）时这一行写「—」，不写 0（§11 第 15 项） |
| 汇报 | 到期几份（一块的、整个目标的）、交付几次（当场的、攒着交的）、最长等了多久、整个目标做完的那一句交了没有 | F | `progress.due`、`progress.handover`（§4.2）；没有发送方时写「—」（§11 第 16 项）。汇报的文字不在流水里，主 Agent 在对话里写的字数仍在它的 `llm.text` |
| 拦截（打分） | 拦截后下一步走对的比例（有 M4 跟进时） | S | `followup` 事件的 `outcome`，分母不含 `none`（M4 0.6 §3.2 的口径：「没有下一步」不进分母） |
| 积分 | 按模型、按角色、高峰占比 | S | `llm` 的 `credits`、`peak`；角色由会话 id 与 `execute.dispatch` 的 `child`、`role` 连接，主 Agent 会话由 `design.holder-moved` 得到（F2），其余「其他」 |
| 任务（打分） | 每个任务的尝试次数、第一次派发到合入的时长（DORA 前置）、门禁一次通过率、审查轮数与挡路发现数、返工率、失败与重试按码 | S | `execute.*`；返工是 `graph` 事件里任务从 `done` 回到 `doing` |
| 问人（打分） | 每次要读的字数、等待时长（中位数、最长）、原样同意/补充/否掉各占几成；0.6 起另有每问读多少字（`points` 的中位数与最大值）与跟随推荐的比例（F49） | S | 字数 = `design.proposal-shown` 的 `units` 之和 + 主 Agent 会话的 `llm.text` 之和；等待 = `design.answer-recorded` 的毫秒数；三类按 `answer` 分（`agree`、`add`、`reject`），按 `kind`（`question`、`confirm`、`release`）分组，0.6 起 `question` 再按 `form` 分。跟随推荐的比例（M3 附录 0.6 §3.12 的口径）：分母是 `form` 为 `recommend` 或 `choose`、`delegated` 不为真的 `design.answer-recorded`；分子是其中 `recommend` 的 `agree`，加上 `choose` 的 `agree` 且 `pickedRecommended` 为真的；`want`、`look` 没有推荐，不进分子也不进分母；没有 `form` 的（按 0.5 写的事件，以及 `confirm`、`release`）不算 |

问人的次数口径（F2）：次数 = `design.proposal-shown` 条数（`confirm`、`release` 也在内，它们不写图但写这条事件，所以数得到）；原样同意率只按 `record_human_answer` 的调用（`design.answer-recorded`，一次调用一条），不从图历史数（一次放行写下 N+1 条带「同意」的历史，plain-ui 0.7 §5.6）；模块放行（M3 附录 0.5 §3.14）的 `design.proposal-shown` 与 `design.answer-recorded` 带 `module`，按模块分组时用它。0.6 起（F49）：「这类你定」走 `record_human_answer` 的 `delegation`，只记 `design.delegation`、不记 `design.answer-recorded`，所以不进原样同意率；人对眼前一件说「你定」仍是一条 `design.answer-recorded`（`delegated` 为真），原样同意/补充/否掉照它的 `answer` 计，跟随推荐的比例把它除外。

### 7.3 报告怎样改用它

- `/hourness`（`src/report/index.ts`、`src/workflow/morning-report.ts`）：报告的项目是调用会话的项目根（`invocation.agent.session.header.cwd`，commands:379–385）。它的输出经主 Agent 的对话给人（`d-one-main-agent`），所以只用 `factsFor`（F9）：派遣次数、拦截计数（按规则 id）、撤下的规则、超时、额度停住、汇报、几件做完/在等人、哪次检查没过、今天的用量计数、覆盖范围（末尾一行「记录：最早 <日期>，今天 <N> 条，本进程丢了 <K> 条（<原因>）；上次自查 <结果>」）；「面板」一节照旧读用户级用量流水，标题写明「本机全部项目」。不含任何比率与比较。读不到指标流水时（行没启用、`projectOf` 为 `undefined`）写明原因，其余照旧。生成之后交一条 `report` 事件。
- M7 的四答晨报、人的负担与质量对照、DORA（M7 §3.10、§3.12、§3.13）：M7 0.6 §3.12.4 与 §3.16 写明这些报告从图、检查与前进的记录、违规流水和用量流水算，只要求指标流水做好以后核对一遍种类表（验收第 5 条、第 11 条的完整性核对）。所以本设计不让 M7 的报告改读本流水，§12 没有这样一步，§14 对 M7 也没有这样一条请求（F26；0.3 在 §2、§7.3、验收第 11 条三处把它当作已定，那三处已改）。`factsFor` 只给 `/hourness` 与命令行用。事实与打分的分界（F9）仍是本设计自己的规矩：经主 Agent 对话给人的只有事实，打分（比率、比较、按模型或版本）只给命令行与 M8。M7 0.6 §3.12.3、§3.12.4 写的周报却把人的负担、人怎么回的、质量对照这些比率放进 `hourness_report` 的结果（`hourness_report` 是主 Agent 的工具，结果进模型上下文，M7 写「数字由 harness 算，模型只转述」），数字的来源是 M7 自己的记录，不是本流水。这与本条分界、与 `CHARTER.md` §8「指标不注入模型上下文」不一致，M7 0.5 评审 R4-N10 已指明按方向性岔路问人。本设计不替人定，写成 §16 ②。人定之前，本设计自己产出的对话内报告只带事实；人定了，M7 的周报一节要不要改见 §16 ② 的推荐与 §14 的请求，等 dogfood 之后。
- plain-ui：报告里的原样同意率从 `design.answer-recorded` 算，属打分，面板显示（M8），不经主 Agent 的对话（plain-ui 0.7 §11 也写明面板不显示这个比例、由流水与周报给；0.8、1.0 沿用）。
- plain-ui 1.0 的对接（它的 §1.0 第 5 条把这几样的种类与字段交给本设计）：面板是客户端，不写指标流水，也不直接读它，所以本设计的种类名对面板没有约束。超时的数、来源、来历、最近 5 次超时与 7 天超时次数，拦下记录（规则 id）与「要撤下」一行，面板经规则板、循环板的页面数据取；这些页面数据与 `timeout.*`、`rule`、`lift` 是同一批事实的两份记录，页面读各块自己的，晨报与 `/hourness` 的事实读流水，两边的口径在 §7.2 对得上。面板「上次看之后」里「这一块做完了」「目标做完了」两种行按图上的状态变化算，与 `progress.due` 认的是同一件事，但不读它；`progress.handover` 记的是汇报交给人的时刻，面板不显示「汇报攒着」，也不判断人回来没有。额度用完时首页「现在」那一行由循环板给，数据来自 M7 的停住原因，指标流水只在事实里数它。

### 7.4 比较版本

`compare(events, by, window, basis?)`，`by` 取 `v`（构建）、`model`、`host`、`role`（不再有 `pres`，F2）。每组列同一套打分指标与样本数，不做显著性检验：用户只有一人，样本小，只看走向（`CHARTER.md` §8）。compare 属打分，只给命令行与 M8。「同样的数据上比版本」靠只追加：同一段真实使用里按 `v` 分组；或新代码对旧流水重算，要复现某一份旧报告就检出那时的提交、用它依据行里的文件前缀带 `--basis` 重跑（§7.5、F8），输出逐字相同。

### 7.5 命令行

`npm run metrics -- <子命令> [--project <目录>] [--from <ISO>] [--to <ISO>] [--tz <±HH:MM>] [--basis '<文件>:<行数>[,…]'] [--json]`（`scripts/metrics/cli.ts` 调 `src/metrics/cli.ts`，写法同 `npm run graph`）：

| 子命令 | 做什么 | 写不写流水 |
| --- | --- | --- |
| `summary` | §7.2 的全部指标（事实加打分；给编排方与人用命令行时看） | 不写 |
| `verify` | §5.4 的核对；另外四项对账：图历史里有而流水里没有的条目；每个会话的 `llm` 事件数与用量流水同一会话的行数；文件清单与磁盘；超时（需求 F12）：每条 `loop-done`（`outcome` 为 `unfinished`）与每条 `rules.script`（`result` 为 `timeout`）在前后 5 秒内应有一条同条目的 `timeout.hit`，缺的报出（发送方还没接上，或那一条写入失败），反过来 `timeout.hit` 找不到对应运行的也报；发送方是 M4 的检查或 M7 的合入前检查时没有这两种运行事件，只核 `timeout.set` 的 `prevMs` 是否等于同一条目上一条的 `limitMs`。没有发现退出码 0，有发现 1 | 不写 |
| `compare --by <键>` | §7.4 | 不写 |
| `prune --before <日期>` | §5.3：先写 `prune` 事件再删旧文件；只给人用 | 写 |
| `backfill-graph` | 读图，把早于流水里第一条实时 `graph` 事件、且 `(node, hi)` 还没有的历史条目补成 `graph` 事件，`src: 'history'`，不带 `rev`（历史条目只有 `at`、`actor`、`op`、`reason`、`from`、`to`，没有修订号；`rev` 在 `graph` 的字段表里可选，F23），写入者 `bf-<HEAD 前 7 位>`（合 §4.1 的 `w`，F31）。重跑不重复。打印补了几条 | 写 |

参数校验：`--from`、`--to` 必须能被 `Date.parse` 解析；`--tz` 匹配 `^[+-]\d{2}:\d{2}$`；`--project` 必须是存在的目录且 `projectOf` 有值；`--basis` 的每一项文件名匹配 `^events-\d{4}-\d{2}-\d{2}(-([0-9a-f]{8}|bf-[0-9a-f]{7}))?\.jsonl$`（§4.1 的两种 `w`，F31）、行数为正整数；`--before` 是日期。不合格退出码 2，打印用法。

## 8. 量不到的

这些只能靠真实项目里的试用（`dogfood`，之后 `field-trial`）与人的反馈，流水里没有，报告里照实写「量不到」：

- 人在系统外花的精力：读代码、想问题、在别处查资料、和别人商量的时间。流水只有人在 DSH 里发消息、点命令的时刻。
- 人读懂了没有：字数与等待时长只是代理量。等得久可能是难，也可能是人走开了。
- 跟了的推荐对不对：流水能给出「拍板之后 7 天内因这个决定返工」的次数（M7 §3.12.3），给不出没返工的决定是不是好决定。
- 做出来的东西好不好用、合不合人的本意：门禁与审查只查写下来的验收条件。
- 给 agent 的超时说明和给人的汇报，agent 与人有没有读懂、读了没有：`timeout.hit.told`、`progress.handover` 只记交出去了，不记收到的一方怎么处理。额度什么时候真的重置、人什么时候真的回来，流水里只有 M6、M7 看到的时刻。
- 主 Agent 的话好不好懂：流水有字数，没有内容（§4.4），也不打分。
- 同一账号在 ZCode 等其他客户端的消耗（`ORCHESTRATION.md` §11.3）。
- 桌面版没开、宿主没运行时发生的事。
- 项目 `.llm/` 被带走之前的记录：`git clean -fdx`、换电脑重新克隆、手动清目录都会让流水从头开始（§5.5）；图历史能补回，别的不能。
- 没有项目可归的事件（§3.5）：只有行健康里的计数，没有内容。
- 人对报告与卡片的感受：以后面板的「讲细点 / 说重点」按下的次数可以记（M8 加一个事件种类），感受本身仍要人说。

试用中人的反馈是文字，进图（复盘节点、批注，M7 §3.15），不进指标流水。人发的消息虽然记了条数与字数（`said`，F10），内容仍不记，也量不出「人其实想要什么」。

## 9. 失败与预案

### 9.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 行健康 |
| --- | --- | --- |
| 服务 `glmHournessMetrics` 提供失败（同名服务已在） | 自己的接缝照装，别的行交来的事件收不到；控制台告警一次 | 部分生效，写明原因 |
| 接缝注册抛错（某一个） | 跳过这一个，其余照装 | 部分生效，写明缺哪一个 |
| 构建戳读不到 | `v` 写 `<包版本>+unknown` | 说明里注明，状态不降级 |
| 没有 `agents` 服务 | `llm` 与 `ask`、`said` 事件找不到项目，计为无项目；会话事件照常（直接读回调参数里的 `session.header.cwd`，session:1579–1599） | 部分生效 |
| 循环板服务不在（交不了自查条目） | 后台自查（§6.4）照跑；没有每天固定那一次 | 不降级，说明里注明 |

### 9.2 运行期

| 故障 | 怎样发现 | 怎样恢复 | 事后怎样查 |
| --- | --- | --- | --- |
| 追加失败（权限、磁盘满、文件被占、目录被换成文件） | 写入器记下错误码；行健康部分生效，写明错误码与排队条数；控制台每个 dest 每种错误码告警一次 | 队首事件不丢，30 秒后与下一条事件进来时重试；顺序不变 | `/hourness` 的覆盖行；溢出时的 `gap` |
| 队列满（故障持续，2000 条） | 同上，另写丢了几条 | 丢队首之后最早的一条（F17），写成功后补一条 `gap` | `gap` 的序号范围；`verify` 不把它报成缺行 |
| 会话或发送方找不到项目（`projectOf` 为 `undefined`，或 `where` 里没有会话和目录） | 行健康「无项目的事件 N 条」，按种类 | 按设计不写（§3.3 第 3 条、§3.5）；不建目录 | 行健康；`/hourness` 覆盖行 |
| `ensureIgnored` 抛错（`.git/info/exclude` 写不进） | 写入器记下错误码；行健康部分生效，写明原因 | `.llm/metrics/` 不建，事件留在队列里，同追加失败：30 秒后与下一条事件进来时重试，模型流与工具调用不受影响（验收第 7 条） | 行健康；溢出时的 `gap` |
| 整个 `.llm/` 被删（`git clean -fdx`、新克隆） | 发现不了（清单一起没了）；覆盖行的「最早一条」晚于图历史最早一条时多写一句（§5.5） | 流水重新开始；图历史由 `backfill-graph` 补回 | 覆盖行；图历史 |
| 事件不合字段表（代码缺陷） | 拒收并写 `reject`；行健康计数；控制台按「种类 × 字段」告警一次 | 不重试；L2 的字段表测试拦住大多数 | `reject` 的 `of` 与 `field` |
| 观察代码自己出错（缺陷） | `try/catch` 接住，行健康「内部错误 N 次」，控制台告警一次 | 模型流、工具调用、问题请求的结果原样交回，不受影响 | 行健康；控制台 |
| 计价服务没有或抛错 | `llm` 事件不带 `credits` | 报告按 token 列 | 行健康说明「积分口径：未提供」 |
| 崩溃、蓝屏、被杀 | 后台自查（§6.4）与 `verify`：没有正常退出、无法读取的行 | 新写入者补换行再写，不截断旧文件 | 文件与行号；没有 `stop` 的写入者 |
| 整天文件被删 | 文件清单对照（§5.5）：报「文件丢失」 | 不可恢复（数丢了）；经 `prune` 删的有记录不报 | `prune` 事件；`verify` 退出码 1 |
| 多进程追加交错 | 无法读取的行；L3 `metrics-concurrent` 预先核实 | 换成每个写入者一份文件（§5.6） | `verify` |
| 一次性进程事件丢失 | `appendEvents` 会 `await`（§5.2） | 调用方等它再退出 | 子进程 L2（验收 13） |
| 指标行自己的等待超时（`close()` 与 `appendEvents` 各 2 秒、写失败后 30 秒重试） | 写入器记下；`stop` 没写成时 `verify` 报没有正常退出 | 指标行没有脚本或检查，这些等待是固定值，不由 agent 估、不按实测改（`d-timeout-measured` 管的是板上与 M4、M7 的脚本和检查）；到时放弃这一次等待，不抛错，不拖宿主；没写完的事件留在队列里按序重试，丢的有 `gap`（优雅失败：不崩、不丢能留的工作） | `verify`；覆盖行 |
| `timeout.*` 事件写不进或被拒 | 同一般事件：`reject`、队列、`gap` | 发送方的超时处理（放行、拦下、算没跑完）与给 agent 的话不等流水；页面读发送方自己的记录，所以页面不缺 | `verify` 的超时对账（§7.5） |
| 时钟回拨 | `verify` 报「时钟回拨」 | 报告按 `at` 排序，同一写入者内看 `n` | `verify` |
| 文件过大（一天超过 64 MiB） | 行健康注明 | 照写；查失控的循环 | 文件大小 |
| 读到更新格式的行、不认识的种类 | 读取计数 | 不进计算，其余照算；报告写明 | 依据行之后的「看不懂 N 行」 |
| 图引擎的观察者抛错 | 引擎接住，逐个观察者各自接住 | 写入结果不变，别的观察者照样被通知 | 少一条 `graph` 或 `graph-fail`，`verify` 对账报出成功写入的缺失 |
| 图引擎的写入失败 | 引擎返回 `ok: false`，包装给一条 `graph-fail` | 写入本来就没成，返回值不变 | `graph-fail` 的错误码；它不进 `verify` 的图历史对账（没有历史条目可对） |
| 只装 GLM 通道包 | 没有服务 | `emitMetric` 不做事 | 不需要 |
| 命令行写入者伪造宿主事件 | `verify`（§5.4、F21）：`start.host` 为 `cli` 却写了宿主专属种类 | 报出；防不住有意伪造 | `verify` |
| `workflow` 行退役后启动报错 | §12 末步的 L3 预检 | 不合入；停下交人（profile 改动是必须问人的第 2 类） | 预检日志 |

### 9.3 不可逆的地方与预防

- 写入器只追加：不删除、不改写、不截断（半行用补换行处理，不截掉）。轮换靠按日期取新文件名，没有改名。
- 只写 `<root>/.llm/metrics/`、`<root>/.llm/metrics-manifest.jsonl`、`<root>/.llm/metrics-key`，以及第一次建 `.llm/` 之前经 `ensureIgnored` 往 `.git/info/exclude` 追加的一行 `.llm/`（那个文件属于这份克隆、不入库，函数只追加、已有等价行不重复，不碰受版本控制的文件）。用户级目录里不写任何指标文件。`.gitignore` 以 `wx` 写，已有的文件不覆盖。
- 删旧文件只有人能做，经 `prune`：先写 `prune` 事件再删，文件清单对账能发现未经 `prune` 的删除（§5.3、§5.5、F7）。主 Agent 没有删它的工具；`metrics-files-only` 的删除与移动判法启用即拦（§3.4），人想让主 Agent 替他删时，撤下这条规则或自己在终端里敲 `prune`。
- 整个 `.llm/` 一起消失（`git clean -fdx`、重新克隆）是不可逆的，没有预防：运行记录放在不入库的 `.llm/` 里是 `d-rules-in-repo` 的决定，代价由人在决定时被告知（M7 0.6 §2.1 同样接受）。本设计的做法是让它看得见（覆盖行的「最早一条」与图历史对照，§5.5），并让能重建的部分可重建（`backfill-graph`）。
- 补录只追加，重跑不重复。
- 字段表闭合，不会写进凭证与文字。万一某个缺陷让不该有的东西进了流水，补救是经 `prune` 删掉那几天的文件：这会丢那几天的数，所以字段表的测试是 L2 的硬门（验收第 6 条），改字段表与各名字空间表的提交走独立评审（§12 第 1 步）。
- `workflow` 行退役不删 `decisions.jsonl`（用户数据）；退役前的 L3 预检用的是带覆盖层的临时 profile，不碰用户的 profile。

### 9.4 外部输入的校验

| 输入 | 规则 | 不合格时 |
| --- | --- | --- |
| 别的行交来的事件 | §4.4 字段表（信封加正文） | 拒收，`reject` |
| 别的行交来的 `where`（`sessionId?`、`dir?`） | 都是字符串且非空；`dir` 经 `projectOf` 找项目，`sessionId` 经 `agents.get` 读 `cwd` 再找；两个都给时先 `dir` | 不合格或找不到项目：按没有项目处理，只计数（§3.5） |
| 会话事件的 `data` | 读到的每个字段先查类型 | 这条事件不记，内部计数 |
| 工具参数（`tool/call` 的 `arguments`，字符串） | `JSON.parse` 失败或目标字段不是字符串时不写 `target`、`cmd` | 照写 `tool`，少这两个字段 |
| `llm/stream` 的块 | `usage` 的计数必须是非负有限数，不是的那一项不写；没有 `usage` 块时各类 token 都不写，`fin` 照实 | 照写 |
| 人发的消息 `user/message` | `source.kind` 是字符串；文本块与附件块计数；内容不读 | 不写 `said`，内部计数 |
| DSH 原生问题请求 | `questions` 是数组，`id` 是字符串（不合 id 形状时 `q` 写 `x-` 加 SHA-256 前 12 位） | 不写 `ask`、`answer`，内部计数 |
| 计价服务 | 形状同 `/hourness`；返回值必须是有限非负数或 `undefined` | 不写积分 |
| 补录读的图 | `loadGraph` 的校验；读不出的节点跳过并计数 | 打印跳过的节点 |
| 命令行参数 | §7.5 | 退出码 2 |
| 流水文件 | §7.1 第 2 步 | 计数、记行号 |

### 9.5 不变量与所在层

| 不变量 | 由谁保证 | 为什么在这一层 |
| --- | --- | --- |
| 只有 harness 写 | 写入器是唯一的写文件代码；服务不注册工具；代码规则 `metrics-files-only` 启用即拦工具与 shell 的写、删、移；链式摘要与文件清单发现误写与删除 | 写的路径只有一条，堵在这里最省；工具层的门禁防的是 agent |
| 不记文字与秘密 | `src/metrics/schema.ts` 加 `kinds/*` 的字段表 | 所有事件从这里过，调用方的错误也在这里被挡 |
| 序号连续、链按序号 | 写入器在入队时编号 | 写入的先后可能被重试打乱，编号的时刻不会 |
| 同样的输入同样的输出 | `calc.ts` 是纯函数，窗口、时区与 `basis` 显式传入 | 时钟与环境只在边上读一次，写进依据行；`basis` 把输入锁到文件前缀（F8） |
| 节点状态以图为准 | 项目图引擎；`graph` 事件只是测量 | 图是人和 agent 编辑的对象，流水是事后的计量 |
| 账号用量以用户级用量流水为准 | memory 行 | 跨项目的账不能按项目拆着存 |
| 指标文件只在项目的 `.llm/` 里，用户级目录里没有 | 写入器的路径函数只接收项目根，代码里没有取用户级目录的写入路径（`d-memory-scope`）；L2（验收第 18 条）把数据目录指向临时目录核对 | 路径只有一个来源，堵在这里；放错位置是代码缺陷，测试先失败 |
| 指标行不受高峰模式影响 | 指标行不读 `glmHournessPeakMode`，写入与自查不经任何会被档位拦住的路径（`d-main-agent-peak-exempt`）；L2（验收第 19 条） | 高峰模式只管子 agent 与重活，指标行两样都不是 |
| 打分不进模型上下文 | `calc.ts` 分 `factsFor`、`scoresFor` 两个出口；报告与提醒的模块只导入 `factsFor`；L2 契约测试列出导入 `scoresFor` 的文件，报告工具与提醒的文件不在其中，并断言报告输出不含 `scores` 的字段名与比率（F9） | 防止模型把分数当目标（`CHARTER.md` §8） |
| 观察不改变行为 | 每个接缝原样传 `next()` 的结果；L2 用例逐字比较有无指标行时的流块与工具结果 | 指标行出错不能变成用户可见的故障 |

### 9.6 行健康

| 行 | 何时上报 | 生效 | 部分生效或未生效 |
| --- | --- | --- | --- |
| metrics | 激活；每次模型调用与每个会话事件所在的会话；后台自查完成 | 「指标记入 <root>/.llm/metrics，今天 N 条；上次自查干净」 | 写入失败（错误码、排队、丢几条）；拒收 N 条；内部错误 N 次；无项目的事件 N 条；服务未提供；某个接缝没装上；自查发现（没正常退出、缺行、链断、文件丢失） |

`/hourness-status` 与 `/glm-status` 的表多一行（`HOURNESS_ROWS` 加 `metrics`，顺序同 patch）。

## 10. 宿主契约与 rc.3 证据（汇总）

| 接口 | 证据 | 结论 |
| --- | --- | --- |
| `llm/stream` 瀑布与 `GenerateOptions` | llm:2393–2410；types.d.ts:506–548 | 〔实读〕；memory 行在真机上用同一接缝（`src/memory/index.ts:54`） |
| 流块与结束原因（可扩展，F12） | types.d.ts:434–464、127–149 | 〔实读〕 |
| `agent/request` 的 `turn`、`step`（F13） | agent-loop:1191–1194 | 〔实读〕 |
| `agent/request-error` 的重试（F13） | agent-loop:1136–1146 | 〔实读〕 |
| `session/event`、事件的 `time`、回调可读 `session.header` | session:1517–1536、1579–1599 | 〔实读〕 |
| `turn/start`、`turn/end` | agent-loop:945、1029–1032、950–966 | 〔实读〕 |
| `tool/call`、`tool/result`、`error.info` | agent-loop:681–706、984、701；llm:100–110；session:860–868 | 〔实读〕 |
| `approval` 的结局枚举（F14） | user-approval:29–34（`allowed-once`、`rejected`、`cancelled`、`unavailable`）、128–144 | 〔实读〕 |
| `command/run`、`command/done` | commands:333–346 | 〔实读〕；`kind` 为 `success` 或 `error` |
| `user/message` 带 `source`（F10） | agent-loop:1067–1073；子会话首条 `source: {kind:'user'}` 在子会话里（subagent:1459–1461） | 〔实读〕 |
| `session/disposed` | session:1924–1936 | 〔实读〕 |
| `user-questions/request` 瀑布、超时一路（F12） | user-questions:668–691、603–643 | 〔实读〕 |
| `tools/pre-execute` 的拒绝带 `info`、入 `tool/result.error` | tools:3211–3222、3337–3350；agent-loop:701 | 〔实读〕 |
| `exec.callId` 等于 `tool/call.callId`（F14） | agent-loop:509–516、685；子调用带 `rootCallId`，tools:3227 | 〔实读〕 |
| `prepend` 排在最外层 | cordis:335–339、371–379 | 〔实读〕 |
| `ctx.provide`、`ctx.get` | cordis:800–823、763–766 | 〔实读〕 |
| `agents.get`、会话头 `cwd`、`parentSession`、`origin` | agent:596–598；session:1048–1056、1816–1828；subagent:345–356 | 〔实读〕 |
| agent id 等于会话 id | agent:512–514 | 〔实读〕 |
| 行名 id `glm-hourness/<行>`、name `dsh-hourness/<行>`（F15） | `packages/hourness/cordis.patch.yml:19–56` | 〔实读〕 |
| spawn 后端的 worker 在外部子进程（F22） | subagent:1486–1502（`startExternal`） | 〔实读〕；子进程里的事件由那个进程的指标行写（§11 第 9 项） |
| 项目根 `projectOf`、`gitDirOf`、`ensureIgnored` | `src/data/project-root.ts`（本仓库，规则板的最小一片建，2026-10-31 读） | 〔实读〕：`projectOf` 返回 `{root, git}` 或 `undefined`；`ensureIgnored` 只在 git 仓库里往 `.git/info/exclude` 追加，写不进时抛错 |
| 高峰模式的契约 `glmHournessPeakMode` | `src/shared/peak-mode.ts` | 〔实读〕：注释写明主 Agent 不被档位拦住；指标行不读它，只在验收第 19 条里用假服务 |
| 引擎的写入与失败返回 | `src/graph/engine.ts`：`openEngine` 返回的 `apply(actor, mutation)` 是唯一写入口，成功由 `commit` 里 `writeNodes` 之后返回，失败是 `Failure`（错误码、说明、提示、出错字段）；今天的 `openEngine(` 调用点在 `src/graph/tools.ts`、`run-control.ts`、`cli.ts`、`panel-row.ts` | 〔实读〕；`writeNodes` 只在 `commit` 里调用。观察者集合放在 `engine.ts` 的模块作用域，同一个包内共用一份〔推断〕，§11 第 14 项 |
| 循环板服务 `contribute`、`HarnessResult` | 循环板 0.6 §3.1、§2.3（设计，代码未建） | 〔设计〕；§11 第 11 项 |

## 11. 未核实的假设

0.1 的 12 项里，#2（一步的归属）、#4（审批结局）、#12（`exec.callId`）在 0.2 已核实并改进正文（F13、F14），#6（用户消息的形状）已核实（F10），不再列。下表是仍未核实的，和对齐轮新增的。

| # | 假设 | 怎样核实 | 不成立时 |
| --- | --- | --- | --- |
| 1 | 本机 NTFS 上多个进程各自一次 `appendFile` 写不超过 4 KiB 的一行，不会交错 | L3 `metrics-concurrent`（验收第 12 条） | 每个写入者一份文件（§5.6），读取不变 |
| 2 | 问题请求里问题正文的字段名、应答的形状（选中的是哪个 `label`） | 实施第 2 步读 `dsh-user-questions` 的请求 schema 与 `client-ui-user-questions` 的应答；L3 | `ask.units` 只数选项文字；不写 `answer.pick` |
| 3 | 子 agent 与会话标题的 `llm/stream` 也带 `sessionId` | L3 | 不带的计为无项目（§3.5） |
| 4 | `agents.get` 对同一宿主里的子 agent 会话也返回活 agent | L3（派发场景） | 子 agent 的 `llm` 事件按父会话的项目记：会话事件里先见过它的 `cwd` 就用它 |
| 5 | `session/event` 对子 agent 的会话同样触发 | L3 派发场景 | 子 agent 的工具调用不记，报告写明 |
| 6 | 用户 profile 里给已删除行 `glm-hourness/workflow` 的覆盖不会让启动报错 | §12 末步的 L3 预检 | 不退役，停下交人 |
| 7 | 桌面版安装后 `dist/build-info.json` 与模块的相对位置不变 | preflight 检查文件在；L3 事件的 `v` 不是 `unknown` | `v` 为 `unknown`，行健康注明；查 bundle 布局 |
| 8 | NTFS 崩溃后文件尾可能是半行或 NUL | 不专门验证，读取按最坏情况处理 | — |
| 9 | M7 的 worker 走 spawn 后端时是外部子进程（subagent:1486–1502），它自己的 `llm/stream` 与工具调用由那个进程里的指标行写（F22） | L3：派发一个 spawn worker，核对它的事件落在同一个项目、`sid` 是 worker 的会话 | worker 的 `llm`、`tool` 事件缺，报告在覆盖行写明；M7 的 `execute.*` 仍由主进程写，不受影响 |
| 10 | 同一个项目里多个行（规则、循环板、M7、指标）第一次同时调 `ensureIgnored` 时，`.git/info/exclude` 里不会出现重复行或被截断的行 | L2：两个并发调用后文件里恰有一行 `.llm/`；该函数先读后追加、没有锁，规则板的最小一片已用它 | 多一行无害（git 不报错）；被截断的一行会成为一条无意义的忽略规则，由规则板那边的函数修，指标行此时不建目录、走重试 |
| 11 | 循环板 0.6 的 `contribute` 收 `metrics` 名字空间与 `harness` 动作；`run` 的 `event` 能给出项目（循环板代码还没建） | L2 用假服务按循环板 0.6 §3.1 的类型；循环板实现后补 L3 | 每天一次的自查条目不生效，后台自查照跑（§6.4），行健康注明 |
| 12 | `projectOf` 在真的 `git worktree` 与 `.worktrees/*` 下回到主检出 | L2 用临时仓库加 `git worktree add`（读了代码，没有在真工作树上跑过） | 工作树的事件落进工作树自己的 `.llm/`；改 `projectOf` 归规则板那一片，指标行跟着用 |
| 13 | 兄弟设计的 `emitMetric` 适配器按 `src/shared/metrics.ts` 的联合类型写事件，字段名与 §4.5 一致 | 各自实现时编译期核对；第 1 步 L2 的种类清单比对（验收第 5 条） | 名字不一致时编译不过，改哪一边由那一步的评审定 |
| 14 | 引擎的观察者集合在同一个包里是一份：指标行与图行、M3 的设计行、接管行、M7 的执行行导入的是同一个 `dist/graph/engine.js` 模块实例（两个包各自用 `tsc` 编译、没有再打包，所以同包内路径相同） | 第 3 步的 L3：在真实宿主里用图工具写一条批注，核对流水里恰有一条 `graph`；L2 用同一模块导入两次 | 把集合挂在 `globalThis[Symbol.for('glm-hourness.graph.observers')]` 上，其余不变 |
| 15 | M7 会为「GLM 额度用完」给 `execute.goal` 一个阻塞原因码，并为「额度重置后自己接上」给一个恢复原因（用户图 G15 要它们；M7 0.6 的阻塞原因码里没有额度这一类，M6 只在 GLM 正在用时读额度） | M7 下一次修订时读它的 §3.8.1、§3.16 的 `execute.goal` 一行；实现第 1 步核对 | 没有这两个码时「额度停住」一行写「—」，不写 0；停住与接上改由 `glm.upstream-limit`（`hasReset`）与 `glm.quota-read` 的前后读数推，口径在 M7 定之前不承诺 |
| 16 | M7 会交 `progress.due`、`progress.handover`，并定怎样判断人不在与回来、攒着的汇报放哪里（用户图 G18：四份已放行的设计都没写） | 同上，M7 下一次修订时 | 没有发送方时「汇报」一行写「—」；对话里主 Agent 写的字数仍在 `llm.text` 里，面板的两种行按图上状态变化算，不受影响 |
| 17 | 规则板、循环板、M4 的检查和 M7 的合入前检查会按 §4.2 交 `timeout.set`、`timeout.hit`（规则板与循环板已放行、M4 0.6 写了 E3 会交事件，其 §6.3.1 已在盘上，0.5 对着 `ValueLine`、`TimeoutLine` 核过（§4.2 规矩六）、M7 0.6 的合入前检查写固定的 30 分钟） | 各自实现时核对；第 1 步 L2 的种类清单比对（验收第 5 条）与超时对账（验收第 10 条） | 缺的发送方在超时对账里报出；页面读各块自己的记录，不受影响；事实里该块的「超时」一行写「—」 |

## 12. 实施分解

实施在自举之后，由 DSH 里的主 Agent 做（`d-dogfood-scope`），设计先过两层循环的放行；不在自举关键路径上（M7 0.6 的骨架在它不在时各行自己写项目 `.llm/` 下的记录）。每一步一个提交（`AGENTS.md` 第 7 条），文档与行为同一批（`docs/ORCHESTRATION.md` 新增 §10.6「指标流水」并改 §10.1 的来源列、`docs/DESIGN.md` §2.4、§2.4a、§2.5、`docs/HANDOFF.md` 随各步改到当时的样子）。新行出厂 `disabled: true`；先 `npm run build`、`npm run preflight`、`npm test` 三道全绿，涉及 loader 组合的步先在临时 profile 做 headless 沙盒验证，再动主 profile（`AGENTS.md` 强制流程第 2、3 条）。

第 1 步开始前，把 §4.5 对着各兄弟设计当时的现行版本核一遍，差异记在节点批注里再动手（F18；邻居在对齐轮之后还会出新稿）。核的时候记三类差异：字段名不同；种类个数不同；兄弟的字段比本设计的表多（F27：`glm.peak-reminder` 的 `peakWorkerCap`、`bootstrap.trial` 的 `envKey` 都是这一类，封闭表遇到表外的键整条拒收，所以多出来的字段要么加进表，要么记下为什么不收）。另核节点 `metrics` 上自上次核对以来新增的批注。再把文首依据里列的源码文件对着当时的 main 重读一遍（0.6 时已有四个改过，见文首「0.6 的补充」）；M3 的 `design.*` 表按 M3 附录当时的现行版核，0.6 加的字段与两种新事件按 §4.5（F49）。

| 步 | 内容 | 主要文件 | 验证 | 档位 | 独立评审 |
| --- | --- | --- | --- | --- | --- |
| 1 | 基础：字段表与校验（含 §4.2 本设计起名的种类，其中 `timeout.*`、`progress.*`、`lift`，与 §4.5 的各名字空间表）、写入器、读取与核对、字数、构建戳；项目根不新建，导入 `src/data/project-root.ts` | `src/metrics/{schema,writer,read}.ts`、`src/metrics/kinds/*.ts`、`src/shared/{text-units,build-info,metrics}.ts`、`scripts/build-info.mjs`、`package.json`、`scripts/preflight-bundle.mjs`（检查构建戳）、`tests/metrics-{schema,writer,read}.spec.ts` | L1、L2（验收 5 的 L2 部分、6、7、13；确定性的验收 8 是计算，归第 4 步，F35） | 高 | 是：字段表是隐私的唯一关口 |
| 2 | 指标行：接缝、服务、行健康、行登记（`disabled: true`）、每天一次的自查条目（循环板在时）；探针场景 | `src/metrics/{index,observe}.ts`、`src/shared/tool-names.ts`、`src/shared/health.ts`、`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`tests/metrics-row.spec.ts`、`tests/fake-rc3.ts`（只补 rc.3 真宿主会给的信号）、`tests/contracts.spec.ts`、`scripts/probe/` | L2；L3 `metrics`、`metrics-concurrent`（验收 1、2 的 `tool` 一半、4、12、18、19、20、23；`rule` 与 `ref` 要第 3 步才交，F35） | 高 | 否 |
| 3 | 现有代码交事件：guard 与图文件门禁（`rule`）、项目图引擎的观察者（`setEngineObserver`、`commit` 与 `apply` 包装里的通知、命令行进程里登记，`graph` 与 `graph-fail`）、`/hourness` 的 `report`；`recordKey` 在 M4 的 G1 未合入时先建在 `src/guard/records.ts` | `src/guard/{index,graph-files,records}.ts`、`src/graph/{engine,cli}.ts`、`src/graph/metrics-events.ts`、`src/report/index.ts` 与对应测试；指标行登记与撤销观察者的那几行（`src/metrics/index.ts`，第 2 步建的文件）也在这一步加，因为 `setEngineObserver` 在这一步才有。图工具、`run-control.ts`、M3、M7、接管的调用点都不改 | L2；L3（guard 拦截后的 `rule` 与 `ref`：验收 2 的 `rule` 一半；验收 3；§11 第 14 项） | 高 | 是：碰 guard 与图引擎的审计（`DEVELOPMENT.md` §1.1） |
| 4 | 计算与命令行：`summary`、`verify`（含超时对账）、`compare`、`backfill-graph`、`prune`；事实里的超时、撤下、额度停住、汇报几行（§7.2） | `src/metrics/{calc,cli}.ts`、`scripts/metrics/cli.ts`、`package.json`、`tests/metrics-calc.spec.ts`、`tests/fixtures/metrics/` | L2（验收 8、9、10、14、21、24；22 的事实部分；4 的跟随推荐比例一句） | 高 | 否 |
| 5 | 本仓库的 `/hourness` 与基础晨报改读指标流水，加覆盖行（M7 的晨报与周报不在这一步，也不在任何一步里改读流水，F26） | `src/workflow/morning-report.ts`、`src/report/index.ts`、`tests/hourness.spec.ts` | L2（验收 11 的两段）；L3 探针里的 `/hourness` | 高 | 否 |
| 6 | 接线与启用：兄弟各行已合入的 `src/<包>/metrics.ts` 出口接到服务（各只改自己那一个文件：循环板的 `src/loops/metrics.ts` 从写 `.llm/loops/runs.jsonl` 换成写指标流水，并把页面「上次」缓存与 `state.json` 的重建、`staleEntries`、`timeoutEntries` 读运行记录的地方换成导入 `readLog(root, {from, to})` 取自己的 `loop-fired`、`loop-done` 等种类，28 天窗口，不另写解析（F33），M7 的 `src/execute/metrics.ts` 去掉 `metrics-gaps.jsonl`）；bundle 里指标行改为默认启用（第 7 步装上 `metrics-files-only` 之前，行已启用而这条规则还不存在，只靠摘要与清单事后发现；这一段的取舍见 §3.4 与 §15 第 35 条）；在本仓库跑一次 `backfill-graph`，结果批注在 `metrics` 节点上 | `packages/hourness/cordis.patch.yml`，加兄弟各行的 `metrics.ts` | L3 全量探针；启用新行的合入先关桌面版再合入、build、启动（`DEVELOPMENT.md` §1.1 末段、§5 第 4 条）；关、启动与重启由实现的主 Agent 直接做，不必先告诉人（`d-desktop-direct-use`），顺序仍按 `AGENTS.md`：临时 profile 先验、动 `~/.dsh` 之前备份要改的文件、每处改动与备份写进运行报告、装后重启并确认日志里没有本包的新错误 | 标准 | 否 |
| 7 | 代码规则 `metrics-files-only`（启用即拦，`d-code-rules-enforce`；规则对象没有模式，行启用时它就拦），经 `installRuleGate` 安装，登进 `GUARD_RULES`；撤下走 M4 的唯一一条路（`d-one-lift-path`）：对主 Agent 说一句话（它调 `guard_lift`），或在规则板上打 `/rules lift metrics-files-only`（规则板的接线是 dogfood 之后的请求，接上之前只有前一条）。`prune` 的判法 `isPruneCall` 也在这个文件里（§3.4，F47）。等 M4 的 G1 合入；第 6 步到本步之间的时间差见 §3.4 与 §15 第 35 条 | `src/metrics/rules.ts`、`src/guard/catalog.ts` | L2、L3（验收 22 的 M4 部分：拦下、`rule` 事件、撤下、`lift` 事件） | 高 | 是：新的代码规则 |
| 8 | 练习题运行器：每次运行的 `result.json` 加 `metrics` 一节（同一套算式） | `scripts/calibrate/run-calibrate.mjs` | L2（纯函数部分）；跑一次两题两档（积分预先授权，`norm-decision-tiers`） | 标准 | 否 |
| 9 | 批次 L4：主 Agent 直接重启桌面版并用一天，不必先告诉人（`d-desktop-direct-use`）；`verify` 干净；一天的大小写进 `docs/FACTS.md`；`/hourness` 的样子 | `docs/FACTS.md`、`docs/HANDOFF.md` | L4（验收 15、16 的真机部分） | 标准 | 否 |
| 10 | 退役：`workflow` 行先做 L3 预检（临时 profile 带给 `glm-hourness/workflow` 的 `home` 覆盖、bundle 里没有这一行，真实启动无新错误），通过后删 `src/workflow/index.ts` 与 `decisions.ts`，`morning-report.ts` 移到 `src/report/`，删 patch 行、目录表、行健康与契约测试里的这一行；同批去掉 M4 的 `suppressions.jsonl`（`src/env/suppressions.ts` 与晨报读它的一处，M4 0.6 §3.11 约定由本设计的实施做） | 上述文件、`tests/workflow.spec.ts`、`src/env/suppressions.ts` | L3 预检；L1–L3（验收 17） | 标准 | 是（F11）；预检不过就停下交人 |

先后：1 → 2 → 3 与 4 可以并行（3 改 guard、图、报告的文件，4 只在 `src/metrics/` 与命令行）→ 5 → 6 → 7 与 8 可以并行（7 等 M4 的 G1）→ 9 → 10。第 10 步排在 M3 第 10 步、M7 的 E4 与 P2、M4 的 G1 到 E4 合入之后（它们改同一批文件，F11），谁后合入谁在自己的提交里并掉冲突的行。M3、M4、M7、规则板、循环板各自实现时按 §4.2、§4.5 与 §6.2 交事件，不在本特性的步里。

## 13. 验证

- L2：字段表的性质测试（随机生成带未知键、带空白或中文的字符串、超长行、超 32 项的数组与映射，全部拒收）；写入器的故障注入（注入的文件系统依次给出 `EACCES`、`ENOSPC`、`EBUSY`、目录是文件、`ensureIgnored` 抛错，之后恢复）；半行加 NUL 的文件尾；链与序号的核对（删一行、改一行、插一行、带 `gap` 的空洞）；计算的确定性（同一夹具算两次、打乱行序再算）；观察不改变行为（同一组流块与工具结果，有无指标行逐字相同）；项目根的几种情形（主检出、`git worktree add` 出来的工作树、不是 git 但有 `.llm`、用户主目录、盘符根）；用户级目录里没有指标文件（验收第 18 条）；高峰档位为 `stop` 时指标行照常写（第 19 条）；自查条目对假的循环板服务（第 20 条）；契约测试（导入 `src/metrics/` 的文件清单；`writeNodes` 只在 `engine.ts` 的 `commit` 里调用，调用后紧接通知；引擎的各失败码各一条 `graph-fail`，F23、F24）。假宿主只给 rc.3 真宿主会给的信号（`AGENTS.md`）。
- L3：探针场景 `metrics`（GLM 与非 GLM 各一回合，含一次 guard 拦截、一次 `userQuestions.ask`、一次成功的图写入与一次失败的图写入、一次读放了假令牌的文件；核对验收 1–5、23 与 §11 第 14 项）；`metrics-concurrent`（验收 12）；spawn worker 一例（§11 第 9 项）；第 10 步的预检。
- L4：第 9 步。验证可以直接用桌面版，含重启，不必先告诉人（`d-desktop-direct-use`）；临时 profile 先验、动 `~/.dsh` 前备份、每处改动与备份写进运行报告、装后重启并确认日志里没有本包的新错误，这些顺序照旧（`AGENTS.md`）。
- 练习题：第 8 步跑一次，核对 `result.json` 的 `metrics` 与运行器自己的记分在步数、工具调用数、积分上相同。

## 14. 对其他设计的影响

已放行的设计不接新请求（`d-freeze-until-dogfood`）。下面凡是要已放行的设计（规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6）改的，都只写成图上对应节点的批注，等 dogfood 之后按 `d-alignment-rounds` 一批对齐；本稿不改它们的文件。仍在同一轮对齐里的 M4、M6、plain-ui、接管，写的是给它们下一稿的输入。

- M7 0.6（已放行）：① `metrics-gaps.jsonl`：不提请求。M7 0.6 §3.16 自己写了「指标流水若自带缓冲与重放，这一段照它改，只改 `src/execute/metrics.ts`」，本设计的队列、重试与 `gap` 就是这个情形，去掉那个文件放在本设计第 6 步。② 派发工具加必填的理由类别：0.1 §14 的请求撤回。`execute.dispatch` 的 `whyRef` 已指向理由所在的节点与历史序号，理由文字留在图上，不再要第二处记类别。③ 周报里的比率：M7 0.6 §3.12.3、§3.12.4 写的做法与 `CHARTER.md` §8 不一致，等 §16 ② 的答案；答案若与推荐不同，M7 的周报一节要改，写成对 M7 的请求。④ M7 §3.16 留给本流水的核对（表里每类事件都在种类表里）：本设计的验收第 5 条做；字段名按 §4.5，M7 接线（本设计第 6 步）时对照，名字不同的由那一步的评审定改哪一边，不改 M7 的设计文字。⑤ 不要求 M7 的晨报与周报改读本流水（F26）：它们按 M7 0.6 §3.12.4、§3.16 继续从自己的记录算；本设计没有对应的实施步，也没有对 M7 的这类请求。⑥ M7 以 `harness` 身份写的派发批注、计划正文、审查任务经 `openEngine(…).apply`，被引擎的观察者统一看到（§6.3），M7 不用传任何选项，也没有对 M7 的请求（F24）。⑦ 额度用完时推进停住、重置后自己接上（用户图 G15，人已定）：请 M7 给 `execute.goal` 加「GLM 额度用完」的阻塞原因码，恢复时的 `resumeWhy` 区分「额度重置后自己接上」与别的恢复，码的字面值由 M7 定，指标流水按它算（§7.2「额度停住」，§11 第 15 项）。⑧ 汇报（用户图 G18，人已定）：请 M7 在目标里一块做完与整个目标做完时交 `progress.due`，汇报交给人时交 `progress.handover`（字段在 §4.2），并定怎样判断人不在与回来、攒着的汇报放哪里（§11 第 16 项）。⑨ 合入前每条检查的超时（`d-timeout-measured`，M7 0.6 写固定的 30 分钟）：请 M7 按编排方 2026-10-31 的裁定写：写检查的 agent 估预计跑多久，超时一律是预计的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用缺省，不低于下限、不超过每条 30 分钟的最长值，人同意时看到的是超时和它依据的预计；并在每个超时值变更时交 `timeout.set`（改用这条规则之前可以先交 `source` 为 `fixed` 的）、每次超时交 `timeout.hit`（字段在 §4.2；M7 的 `execute.check` 里每条命令的毫秒数已在，不够这两样）。⑩ M7 0.6 §3.12.2 周报阶梯里的「影子转生效」一类提议随 `d-code-rules-enforce` 删去，M7 周报里相应的计数本设计不提供（§7.2 没有它）。
- 循环板 0.6（已放行）：① `loop-contribution`（§6.10）没有 `project` 字段，发送方答不出项目，指标流水只能计数不能落盘（§3.5）；请求加一个可选的 `project`，或写明归属哪个项目。② `glm.quota-read` 为项目里的条目发起时，请循环板（与 M6）把那个项目的目录交给 `emitMetric` 的 `where.dir`。③ §3.3「编排层各行交来的」表里没有 `glm-hourness/metrics` 这一行（它交 `metrics.selfcheck`，§6.4）；表里没有不影响收下，只是文档补一行。另请在 §2.3 末条（「出厂的条目里没有时间触发的 harness 动作」）与验收第 1 条的条目计数里写明：这是第一个时间触发的出厂 `harness` 条目（每天 10:00，条目自带 `tell`，`wake` 为假，干净时动作返回 `skipped`、有发现时返回 `done`），页面的条目数多一项（F25）。④ 指标流水合入后 `src/loops/metrics.ts` 的映射：`{at, project, …}` 里的 `at` 与 `project` 由信封与文件位置承担，其余字段名逐字取自 §6.10（§4.5）；这是对实现者的说明，不是设计改动。⑤ 合入以后循环板读自己的运行记录（§6.10 末段、§6.11 的页面缓存、`state.json` 重建、`staleEntries`、`timeoutEntries`）也经本设计的 `readLog(root, {from, to})`，28 天窗口；这是实现者的说明（§6.2 循环板一行、§12 第 6 步），循环板的设计文字已写「合入后从它」，不需要改（F33）。⑥ 超时（`d-timeout-measured`）：循环板 0.6 §6.6 写固定的缺省与封顶（脚本拦路 10 秒，不拦路缺省 60 秒、人的条目 5–1800 秒）。请按编排方 2026-10-31 的裁定写：写条目的 agent 估预计跑多久，超时一律是预计的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用缺省（拦路脚本 10 秒），不低于下限、不超过现有最长值，3 倍超过最长值时保持最长值并告诉主 Agent；同意时人看到的是超时和它依据的预计，与脚本原文一起；超时不崩行、不丢运行合进来的事件，给主 Agent 的话写明是哪一条、限多少、跑了多久、接下来怎么办；每个超时值变更时交 `timeout.set`、每次超时交 `timeout.hit`（`by: loops`，字段在 §4.2；`loop-done` 的 `unfinished` 仍照旧记）；页面列「最近 7 天超时 N 次」、超时值的来源与来历（plain-ui 1.0 §1.0 第 2 条也提了）。⑦ 汇报交付与额度停住的页面一行（plain-ui 1.0 的 `homeLine` 第五种「推进停住」）由循环板与 M7、M6 定，本设计不替它们定，只在 §4.2 与 §7.2 备好事件与事实行。
- 规则板 0.10（已放行）：没有必须改的。§4.5 给 `rules.*` 起了字段名（`rules.check` 逐字取自 §10.5），实现 `src/rules/metrics.ts` 时对照；`rules.judged` 的 `signals` 是映射，值不是整数、布尔或 id 的信号，适配器把名字放进 `unread`，不改规则板的信号定义。0.4 的两条请求，都等 dogfood 之后：① 超时（`d-timeout-measured`）：规则板 0.10 §6.7 与脚本、检测器的超时按编排方 2026-10-31 的裁定写（用户图 G28）：写它们的 agent 估预计跑多久，超时一律是预计的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用缺省（拦路脚本 10 秒），不超过最长值（拦路脚本 30 秒），人同意时看到的是超时和它依据的预计；脚本、检测器与拦路脚本的超时值变更交 `timeout.set`、每次超时交 `timeout.hit`（`by: rules`，字段在 §4.2；`rules.script` 的超时结果仍照旧记），超时之后晚到的拦下仍是 `rules.late-verdict`。② 代码里的规则（`d-code-rules-enforce`、`d-credentials-readable`）：§1.4 第 12 条、§9.1 写的「没有解除，也没有任何改法」和「只记下，不挡」的标注作废，不再列 `credential-read`（用户图 G26）；`rules.judged` 的 `how` 里「只记录」是用户自己选的做法，不是阶段，取值清单不变。规则板与循环板的实现已直接按这两条做（编排方裁定的例外），所以事件的发送先于文字修订，本设计的字段表已备好。
- M3 附录 0.5（已放行）与 0.6（`d-ask-three-gates` 的试行，第 3 轮评审 APPROVED，编排方已按它恢复 M3 的实现）：没有必须改的。`record_human_answer` 在 `src/design/record.ts` 以 `llm` 身份调 `openEngine(…).apply`，被引擎的观察者看到，不用传任何选项（F24，§6.3）。持有者记录今天在用户级目录（附录 0.5 §2.4），搬进项目 `.llm/` 留给 M3 的对齐轮；本设计只读 `design.holder-moved` 事件，不受搬家影响（F29）。§3.12 的字段按 §4.5：0.5 的 8 种照旧；0.6 对本设计的请求（节点 `metrics` 第 33 条批注）已收下（F49）：两种旧事件加的 `form`、`points`、`sample`、`delegated`、`pickedRecommended` 逐字取，都可选，按 0.5 写的事件照收；两种新事件 `design.delegation`、`design.proposal-refused` 里只写了内容的几项由 §4.5 起名（`action`、`count`、`scopeUnits`、`where`、`code`）；跟随推荐的比例按 0.6 的口径算（§7.2）；§16 的两件改成了 0.6 的 `recommend` 问法。`design.answer-recorded.answer` 的取值认法在 `src/shared/answer-marks.ts`，计算处导入它，不再抄一份字面。名字有出入时，由接线那一步（本设计第 6 步）的评审定改哪一边，不改 M3 的设计文字。
- M4 0.6（对齐轮中，未评审、正文还在写）：给下一稿的输入：① `rule` 不再带 `outcome` 与 `mode`，`effect` 取 `deny`、`late`；跟进的结果单独成 `followup`（跟进在拦截之后才知道，只追加的流水不能回头改；留着量门禁有没有教会模型，不为转正）；申报、放行、作废并成 `request`；撤下与恢复成 `lift`（§4.2）：撤下的两条路（对主 Agent 说，由 `guard_lift` 写；规则板上的 `/rules lift`，由规则板经服务 `glmHournessLifts` 交给 M4）都由 M4 写 `LiftRecord`，本设计只在它写完之后收一条 `lift` 事件，`via` 是 id，取值（今天是 `chat`、`board`）留在 M4，M4 改名时本设计不用跟着改（F40）。② `recordKey` 谁先建谁建（M4 0.6 §3.11 已这样写）。③ `suppressions.jsonl` 在本设计第 10 步去掉（M4 0.6 §3.11 已这样写）。④ `metrics-files-only` 经 `installRuleGate` 安装、登进 `GUARD_RULES`，行名 `metrics`，启用即拦（M4 0.6 的目录已列，不再有「影子」）。⑤ E3 检查的超时值变更与超时：M4 0.6 §3.11 写了会交一条事件、只带检查名、上限、实际耗时与结局；字段由本设计定（`timeout.set`、`timeout.hit`，`by: env`，§4.2），多出的来源与旧值是 `d-timeout-measured` 要的。M4 0.6 的 §6.3.1 已在盘上，0.5 对着它的 `ValueLine`、`TimeoutLine` 核过，对应写在 §4.2 `timeout.set` 之后的规矩六：`ValueLine.source` 的 `by: 'estimate'` 对应 `estimate`，`harness` 对应 `measured`，没有估计时取最长的对应 `default`，`capped` 有值时对应 `ceiling`，5 秒下限抬起的值带 `floored`；`timeout.set` 由 M4 在写 `ValueLine` 之后交，`timeout.hit` 在写 `TimeoutLine` 之后交。⑥ M4 0.6 删掉的标注 `labels.jsonl`、精确率召回率与回归语料，本设计不再对着它们（§2）。
- M6 0.6（对齐轮中，0.5 已通过；0.6 的 §14.2 四类事件字段与 0.5 相同）：额度用完时推进停住、重置后自己接上（用户图 G15）：M6 记上游限额错误、不管推进（不变），`glm.upstream-limit` 的 `hasReset` 与 `glm.quota-read` 的读数只作旁证；停住与接上算在 M7 的 `execute.goal`（§7.2「额度停住」）。请 M6 让「停住原因与额度重置时刻」能被循环板读到（plain-ui 1.0 §1.0 第 6 条也提了），读数不带令牌与请求头仍照旧。`glm.quota-read` 不带会话时的归属已答：发送方带项目目录，答不出就只计数（§3.5）；`windows` 的值取已用百分比，四舍五入到整数；`glm.peak-reminder` 的 `peakMode` 取 `inform`、`reduce`、`stop` 三个值（`src/shared/peak-mode.ts` 的 `PeakLevel`）或读不到时的 `none`；它的 `peakWorkerCap`（正文写了子 agent 并发上限时的数）进字段表的 `cap?`，其余按 M6 0.6 §14.2 的原样（F27）。
- plain-ui 1.1（对齐轮中，1.0 经第 9 轮评审之后的修订，等评审）：它的 §1.0 第 5 条、第 46 条与 §4.7、§4.8 把超时值的变更、每次超时、拦下记录与汇报交付的事件种类与字段交给本设计定，并写成「指标流水设计 1.0」，本设计的版本号是 0.6，请它下一稿改成按名字引用（「指标流水设计」）。它第 46 条把超时的来源列成四种（agent 估的、系统按 N 次运行定、没写估计按上限、设计里定的固定值），本设计 `timeout.set` 的 `source` 对得上：`estimate`、`measured`、`default`（没写估计，用条目写明的缺省，M4 的缺省就是上限）、`fixed`，另有第五个 `ceiling`＝3 倍超过上限、保持上限、已告诉主 Agent，对应它「超过上限时写保持上限」那一句（F41）。面板不写流水、不直接读流水，只依赖两块板的页面数据，所以种类名对它没有约束（§7.3 末条）。字段已在 §4.2 定：超时值的变更是 `timeout.set`（来源、时间、旧值），每次超时是 `timeout.hit`（条目、限、用时、结局），拦下记录是 `rule`（规则 id）与板上的 `rules.judged`，撤下是 `lift`，汇报交付是 `progress.handover`。plain-ui 0.8（上一稿）的说明照旧：不需要改。面板不写流水、不写图，本设计 §6.3 按它写；它实现时删去 `src/graph/panel-row.ts` 里 `/graph-apply` 的分支和它的健康那一半，文件与行 `glm-hourness/graph-panel` 因 `/graph-run` 和现场投影留着，消失的只是那个 `openEngine` 调用点（F30）。本设计的观察者集合不依赖调用点清单，所以对本设计没有影响。
- 接管 0.6（对齐轮中，0.5 的评审第 5 轮 CHANGES_REQUESTED 后的修订）：已答它要的种类：`bootstrap.trial`（§4.5），字段与它试跑流水一节的记录一一对上（`round`、`commandId`、`outcome`、`limitMs`、`limitSource`、`ms?`、`log?`、`envKey`；`log` 是路径不进事件，退出码 `exit` 只在 `trial.json` 里、事件里没有，F43），接管按它交（F27；0.6 多了 `limitMs`、`limitSource`，名字逐字取）；试跑里命令的超时记在这一条里，不另交 `timeout.hit`。接管的读项目门禁 `bootstrap-read-no-shell` 的撤下并入 M4 的那一条路（接管 0.6 的复核第 1 轮 F2 已删 `/hourness-init unlock-shell`），本设计在 M4 写完 `LiftRecord` 之后收一条 `lift`，接管不用交任何撤下的事件（F40）。读密钥文件在接管 0.6 里没有规则，也不为它另记（`d-credentials-readable`），与本设计一致。接管文中引用的「metrics §6.2、§6.3」两节号在本稿里仍是接上的地方与项目图引擎。接管 0.5 §2.4、§7.4 假定引擎的写入自动被记：`bootstrap_apply` 直接调 `openEngine(dir).apply`，现在确实被引擎的观察者统一看到，接管不用传任何选项（F24）。接管 §2.4 依赖表里「引擎的 `observe`」一词可在它下一稿改成「引擎的观察者」，不影响实现。
- 文档：`docs/ORCHESTRATION.md` 新增 §10.6「指标流水」并改 §10.1 的来源列；`docs/DESIGN.md` §2.4 数据表加一行、§2.4a 对照表加本设计用到的接口、§2.5 行健康表加一行；`docs/CHARTER.md` 不改（0.7 §9 已列指标流水在项目的 `.llm/`）。
- M8（面板的指标页，以后）：经命令读 `calc.ts` 的结果；「讲细点 / 说重点」按下的次数加一个事件种类。
- `field-trial`：导出与匿名化以后基于这份流水；字段表本来就只有数与 id；`metrics-key` 不随导出。

## 15. 由 agent 定、人可推翻的事项

1. 位置：`projectOf` 给出的项目根下的 `.llm/metrics/`，目录里自带 `.gitignore`；不用钉死的 `projectHome`；不在没有 `.git` 也没有 `.llm` 的目录里写；非 git 但已有 `.llm` 的目录照写。用户级目录里不放任何指标文件（0.3，随 `d-memory-scope`）。
2. 一天一个文件，按 UTC 日期；不删、不压缩；一天超过 64 MiB 只告警。
3. 多进程共用一天一个文件，L3 不过就改每个写入者一份。
4. 队列每个项目至多 2000 条，30 秒重试；不 `fsync`。
5. 一行至多 4 KiB；字符串只许 id 形状；未知字段整条拒收。
6. 路径记散列（密钥在 `.llm/metrics-key`），命令只记第一个词，工具结果只记字符数。
7. 用户级用量流水照旧（账号的账），项目流水另记一份本项目的调用，`verify` 对账。
8. 违规流水照旧（纠偏文字；M4 0.6 删了标注与语料），`rule` 事件引用它；拦截计数口径同 M4 的 `classifyRecord`。
9. 派遣决策流水被取代，`workflow` 行退役（第 10 步）；旧文件不删。
10. 图历史补录成事件，让负担曲线从 2026-10-28 开始；用量不补录。
11. 主 Agent 选模型的理由：流水只记 `whyRef`，文字留在会话与图上；0.1 要 M7 加理由类别的请求撤回。
12. 不记人在对话里打的字。
13. `metrics-files-only` 启用即拦，没有影子期、没有 M4 的阶梯（0.4，`d-code-rules-enforce` 取代 0.3 的先影子）；人一句话或一条命令撤下。
14. 中位数、百分比与积分的取整规则；`CALC_VERSION`。
15. 给人的只有 `/hourness` 多一行覆盖范围，不加新命令；明细给编排方用命令行。
16. 不引入 OpenTelemetry SDK，只借它的字段口径。
17. 对话里人读的字数：主 Agent 会话里模型输出的文字块的字数。
18. 没有项目可归的事件只计数，不落盘（0.3，取代 0.2 的机器级流水）。
19. 文件清单和密钥放在 `.llm/` 里 `metrics/` 目录之外（0.3，取代 0.2 的用户级账本和密钥目录）。
20. 每天一次的自查是循环板的默认条目 `metrics.selfcheck`，每天 10:00（宿主的系统时区），有发现才告诉主 Agent，不叫醒（0.3）。0.4 写死实现：条目自带 `tell`、`wake` 为假；干净时动作返回 `skipped`（循环板记 `skipped`、不发消息），有发现时返回 `done`（循环板交条目的 `tell`，走 `inject`，结局 `delivered`）；这是第一个时间触发的出厂 harness 条目，页面条目数多一项（F25）。
21. 新种类 `bootstrap.trial`，答接管 0.5 的请求（0.3 答 0.4，0.4 按 0.5 的试跑流水改字段，F27）。
22. 兄弟设计的种类，字段名由 §4.5 起；取值清单留在兄弟设计里，字段表只固定名字和 `id` 类型（0.3）。
23. 跟进的结果单独成 `followup` 种类，不再放在 `rule` 里（0.3，append-only 的必然）。
24. 实施在自举之后，档位与步骤见 §12（`d-dogfood-scope`）。
25. 引擎的写入由进程内观察者集合统一观察（`setEngineObserver`），不逐个调用点传选项；M3、M7、接管都不用改（0.4，F24；备选是保留 `EngineOptions.observe` 并向三方提请求，没选，因为已放行的设计不接新请求）。
26. 写入失败的事件单独成 `graph-fail`，字段是 `actor`、`err`、`op?`、`node?`、`field?`；`graph` 只记成功与补录（0.4，F23）。
27. M7 的晨报与周报不改读本流水，本设计没有对应的实施步和请求（0.4，F26；备选是写成 dogfood 之后的请求并加一步，没选，因为 M7 0.6 §3.12.4 与 §3.16 已定它们从自己的记录算）。
28. 超时的值变更与每次超时单独成 `timeout.set`、`timeout.hit` 两种，由本设计起名，`by` 是交它的那一块（0.4，`d-timeout-measured`）；备选是给 `rules.script`、`loop-done`、`execute.check` 各加限与来源的字段，没选，因为这几张表属于已放行的设计，加字段等于逼它们改稿，而且四块各加一遍会有四种写法。超时次数以 `timeout.hit` 为准，运行事件里的超时结果只算各自的运行计数，`verify` 对账。
29. 汇报的到期与交付成 `progress.due`、`progress.handover` 两种，`by: execute`，M7 交（0.4，用户图 2026-10-31）；备选是复用 M7 的 `operate.report`（`kind`、`lines`、`units`），没选，因为它记的是晨报周报这类定时报告的生成，不带「人不在、攒着多久」，也不分一块做完与整个目标做完。怎样判断人不在、攒着的汇报放哪里不替 M7 定（§11 第 16 项）。
30. 额度用完的停住与重置后的接上不新设种类，从 M7 的 `execute.goal` 与 M6 的 `glm.upstream-limit` 算（0.4，用户图 2026-10-31）；备选是新设 `quota.*` 两种，没选，因为停住与恢复的主人是 M7 的 goal，另记一份会有两处各说各话；代价是 M7 没给额度码之前这一行写「—」（§11 第 15 项）。
31. 撤下一条代码规则成 `lift` 一种，不并进 `rule`（0.4，`d-code-rules-enforce`）：`rule` 是拦下，`lift` 是人的决定，只追加的流水里两者的时刻和主体都不同；只记规则 id、动作、方式和原话的字数，不记原话（原话在仓库的 `docs/guard/lifts.jsonl` 里，M4 0.6 §3.5）；方式 `via` 是 id，取值留在 M4 设计里，今天是 `chat`、`board`（0.5，F40：0.4 写成封闭的 `chat`、`command`，M4 改成 `board` 之后经规则板撤下的每一笔都会整条被拒）。
32. `metrics-files-only` 把 `npm run metrics -- prune` 也算在拦的命令里（0.4）：规则从启用起就拦，不加这一句，主 Agent 经 shell 就能跑 `prune`，与「只有人能删」相反；人要主 Agent 代删时撤下规则，或自己在终端里敲。判法是纯函数 `isPruneCall`（§3.4，0.5 写明，F47），认 `npm run metrics -- prune` 与 `node scripts/metrics/cli.ts prune` 两类写法，认不出的绕过写法事后由摘要与清单发现。
33. `bootstrap.trial` 的命令 id 字段逐字取接管的 `commandId`（0.4），草稿用的 `cmdId` 改回；加 `limitMs`、`limitSource`，因为接管 0.6 的试跑记录有（F27 的后续）。
34. 读密钥文件不另记：不设种类、字段或规则，这次读在流水里只是一条普通的 `tool`（0.4，`d-credentials-readable`；0.5 把「什么都不记」改成「不另记」，F44）；密钥与令牌不进流水仍由字段表保证（§4.4）。
35. 第 6 步（指标行默认启用）到第 7 步（装 `metrics-files-only`）之间有一段时间差（0.5，F42）：行已启用、规则还不存在，这段只靠链式摘要与文件清单事后发现误写与删除。理由：规则要等 M4 的 G1 合入才装得上，G1 不在本设计手里，把第 6 步的默认启用挪到第 7 步之后，就会让指标行在 G1 之前一直不能默认启用，而摘要与清单本来就是这条规则之外的第二道（§5.4、§5.5）。这不是影子期：规则不存在，不是只记录不拦；`d-code-rules-enforce` 说的「从所在插件行启用那天起就拦」在这一段不成立，所以列在这里，人可推翻。推翻的做法：第 6 步的默认启用改到第 7 步之后，代价是 G1 合入之前指标行只能在临时 profile 或人手动启用，探针和批次 L4 也跟着等 G1。
36. 超时值的来源取五个值，不给每种来历各开一个字段（0.5，F41）：`estimate`、`measured`、`default`、`ceiling`、`fixed`，再加可选的 `estMs`、`floored`；备选是把 M4 的 `ValueLine.source` 整个结构搬进事件，没选，因为字段表是闭合的、一层的，搬过来会把别人设计里的嵌套记录带进来，而这五个值加两个字段已够回答「来源、时间、旧值」。M4 把上限调高的设置（`cap.by: 'setting'`）也没有字段，原因见 §4.2 规矩六。
37. M3 附录 0.6 的事件现在就收进字段表，不等它被人放行（0.6，F49）：0.6 加在两种旧事件上的字段都可选，所以按 0.5 写和按 0.6 写的事件都照收；两种新事件里只写了内容的五项由 §4.5 起名。理由：表是闭合的，表外的键整条拒收，不收的话试行期间每条带新字段的事件都被拒收、计进 `reject`，而人要看的正是这次试行的数。备选是等 0.6 放行后再加，没选，原因同上。M3 改名时只改 `kinds/design.ts` 一个文件和 §4.5 对应的行（§4.5 开头的规矩）。
38. §16 两件的问法（0.6，F49）：各用一句是非问，来由一句放在问句之前的汇报里，不进问句；①不在一页放行稿里逐条列 24 条检查，只说它们在设计 §1.4，人要看时主 Agent 给出。理由：一页放行稿有篇幅上限，24 条逐条列出就超了；人也说过之前的问法「看起来很累」。备选是照 0.5 把 24 条都放进放行稿正文，没选，原因同上。

## 16. 待人定的事项

两件，都是人才能定的：①是怎样算做完（必须问人的第 1 类，`ORCHESTRATION.md` §2.9.1），②是宪章与派活设计两种说法之间的取舍（`CHARTER.md` §8 与 M7 0.6 §3.12.4）。0.6 起按 `d-ask-three-gates` 的确认推荐问法问（F49；0.5 的四行写法连同它的码点清单被这条决定取代，旧文在 `design-0.5.md`）：每件一句是非问，推荐和理由在问句里，有真代价时问号之后再加一句代价；人答「可以」就是同意。问句之前，主 Agent 在汇报里用一句话说这件事的来由（M3 附录 0.6 用它替代了取消的背景一行）。形状以提问时 M3 附录的现行版为准：0.6 是 `propose_to_human` 带 `kind: question`、`form: recommend`，`proposal` 与 `reason` 原样出现在问句里，`cost` 在问号之后，整段一行、恰好一个问号、用人话，字数在它的上限之内；本设计不写上限的数，试行里会调。下面两句按 0.6 核过这几条，也避开了换词表里的词。②的来由写出四个减负数字是宪章 §3.2 第 5 条本来就要每周报的那四个（F37 的用意：让人看出②推荐的四个数不是新开的口子）。①②一起放进一页放行稿「要你定的」一节（F3）；①里的 24 条检查不在放行稿里逐条列，放行稿说它们在本设计 §1.4，人要看时主 Agent 给出（§15 第 38 条）。「24 条」是 §1.4 现在的条数，条数变了要跟着改。人答了以后，由主 Agent 经 `record_human_answer` 记，本稿不替人写进图。

### ① 指标记录怎样算做完

- 来由（问句之前汇报里的一句）：指标记录是系统自己写的一份数据，要分十步做；每一步怎样算做完，是只有你能定的事。
- 问句：我建议指标记录的十步都照设计里写好的 24 条检查判断做没做完，因为这些检查都由系统自己跑，不用你逐条读，可以吗？
- 记录：推荐「指标记录的十步都照设计里写好的 24 条检查判断做没做完」；理由「这些检查都由系统自己跑，不用你逐条读」；没有代价句（同意之后哪一条要改，再问一次就能改）；没选的做法「你逐条审读这 24 条」。

### ② 周报里的比率能不能让主 Agent 转述给你

- 来由（问句之前汇报里的一句）：宪章写着指标不给模型看，派活的设计却让主 Agent 在周报里转述比率；宪章另要求每周报四个减负数字（每周问你几次、每次读多少字、你等了多久、因你的决定返工几次）。
- 问句：我建议周报里主 Agent 只转述四个减负数字，其余比率只放命令行，因为比率最像分数，进了对话模型容易追着它跑，可以吗？代价是面板做出来之前，看比率得自己敲命令。
- 记录：推荐「主 Agent 只转述四个减负数字，其余比率只放命令行」；理由「比率最像分数，进了对话模型容易追着它跑」；代价「面板做出来之前，看比率得自己敲命令」；没选的做法「照派活设计的写法，比率也经主 Agent 转述」。

## 17. 交给编排者记图的事项

对齐轮的约定（`brief.md` 共同规则第 9 条）：每个分支在本目录写一份 `graph-ops-align.json`（一个纯数组，元素是 `{"op":"comment","id":"<节点 id>","text":"…"}`，中文），由编排者执行并提交。这份文件由本设计评审 APPROVED 之后的那一步建（F39）：它把下面每一条「- `节点 id`：正文」写成一个元素，`id` 取反引号里的节点 id，`text` 取冒号之后的整段正文，一条一个元素，不合并、不改写；评审没有通过时不建，由停下的那一步写 `align-stop-report.md`。本稿的作者不写这份文件。每一条自成一段，不引用别条，批注读的人没有本设计在手也看得懂；批注都写成「等 dogfood 之后」，不改已放行的设计（`d-freeze-until-dogfood`）；给 M4、M6、接管、面板的是它们下一稿的输入。

- `metrics`：指标流水设计 0.6 完成（0.3 经第 2 轮独立评审 CHANGES_REQUESTED，挡路 6 条 F23–F28、不挡路 11 条 F29–F39，上一位作者写了一半的草稿由 0.4 核对后补完并折进人 2026-10-31 的五条决定；0.4 经第 3 轮评审 CHANGES_REQUESTED，挡路 2 条 F40、F41、不挡路 7 条 F42–F48，0.5 逐条改完；0.5 经第 4 轮评审 CHANGES_REQUESTED，挡路 1 条 F49、不挡路 7 条 F50–F56，0.6 改了 F49；评审结果另记）。要点：一、项目图引擎的写入由进程内的观察者统一记（`setEngineObserver`），M3、M7、接管都不用改；写入失败单独成 `graph-fail`。二、写在代码里的规则启用即拦：`metrics-files-only` 没有影子期，拦下带规则 id 记成 `rule`，人撤下记成 `lift`（撤下的方式取值留在 M4，今天是对主 Agent 说与规则板上打 `/rules lift` 两种），字段表里没有转正一类的事件、计数或标签；读密钥文件不为它另记，在流水里只是一条普通的工具调用。三、超时（`d-timeout-measured`）：每个超时值的变更记 `timeout.set`（来源五种：按预计用时的 3 倍、按最近最慢一次的 3 倍、没有估计用缺省、3 倍超过上限而保持上限、设计里定死的值；另有预计用时、是否被下限抬起、时间、旧值），每次超时记 `timeout.hit`（条目、限、用时、结局、来源），两种都由本设计起名，`by` 是交它的那一块。四、用户图两件：额度用完的停住与接上从 M7 的 `execute.goal` 算，汇报的到期与交付记 `progress.due`、`progress.handover`；M7 没给额度码、没有汇报发送方之前，事实里对应两行写「—」。五、每天一次的自查是循环板的默认条目 `metrics.selfcheck`（条目自带 `tell`、`wake` 为假，干净时 `skipped`，有发现时 `done`）。六、M7 的晨报与周报不改读本流水。七、验证可以直接用桌面版，含重启，不必先告诉人。八、问人（`d-ask-three-gates`）：M3 附录 0.6 要的两种新事件（「这类你定」、问话被拒）和提议、回话事件上的五个新字段（问法、给人读的字数、是否带样例、「你定」、是否选了推荐的那条路）已收进字段表，新字段都可选，按 0.5 写的事件照收；跟随推荐的比例只数确认推荐与选方向两种问法里的同意，排除「你定」。待人定两件（怎样算做完；周报比率能不能经主 Agent 转述），评审通过后由主 Agent 各用一句是非问问，推荐与理由在句子里。
- `m7`：指标流水设计 0.6 对 M7 0.6 的答复和请求（等 dogfood 之后）。答复：`metrics-gaps.jsonl` 照 M7 0.6 §3.16 自己写的条件，在指标流水第 6 步去掉，不要求改设计；派发工具加理由类别的请求撤回；§3.16 的核对由指标设计验收第 5 条做；M7 的晨报与周报继续从自己的记录算，不改读指标流水。请求：一、额度用完时推进停住、重置后自己接上（用户图 G15，人 2026-10-31 定「额度重置后自动接上」）：给 `execute.goal` 加「GLM 额度用完」的阻塞原因码，恢复时的 `resumeWhy` 区分「额度重置后自己接上」与别的恢复，指标流水按这两个码数停了几次、停了多久。二、汇报（用户图 G18，人定「做完一点汇报一点，或者等收菜」，并确认读法「都没问题」）：目标里一块（模块或里程碑）做完、整个目标做完时交 `progress.due`，汇报交给人时交 `progress.handover`（字段在指标设计 §4.2），并定怎样判断人不在与回来、攒着的汇报放哪里。三、合入前每条检查的超时（`d-timeout-measured`，现写固定的 30 分钟）：按编排方 2026-10-31 的裁定写，写检查的 agent 估预计跑多久，超时一律是预计的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用缺省，不低于下限、不超过每条 30 分钟的最长值，人同意时看到的是超时和它依据的预计；超时值变更交 `timeout.set`（改用这条规则之前可以先交来源为「设计里定死的值」的），每次超时交 `timeout.hit`。四、周报阶梯里「影子转生效」一类提议删去（`d-code-rules-enforce`）。五、周报里的比率经主 Agent 转述是否违背宪章 §8，等人在指标设计 §16 ② 的答案，答案与推荐不同时周报一节要改。
- `schedules`：指标流水设计 0.6 对循环板 0.6 的请求（等 dogfood 之后）：一、`loop-contribution` 加可选的 `project`，或写明归属哪个项目。二、额度读取为项目里的条目发起时，把项目目录交给指标流水（与 M6 一起）。三、§3.3 的表补一行 `glm-hourness/metrics`，它交 `metrics.selfcheck`（每天 10:00，`harness` 动作，条目自带 `tell` 且 `wake` 为假；干净时动作返回 `skipped`，有发现时返回 `done`，结局 `delivered`）；这是第一个时间触发的出厂 `harness` 条目，§2.3 末条「出厂的条目里没有时间触发的 harness 动作」和验收第 1 条的条目数都要多一项。四、超时（`d-timeout-measured`）：§6.6 的超时按编排方 2026-10-31 的裁定写（写条目的 agent 估预计跑多久，超时一律是预计的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用缺省，不低于下限、不超现有最长值，3 倍超过最长值时保持最长值并告诉主 Agent；人同意时看到的是超时和它依据的预计；超时不崩行、不丢运行合进来的事件；给主 Agent 的话写明是哪一条、限多少、跑了多久、接下来怎么办），每个超时值变更交 `timeout.set`，每次超时交 `timeout.hit`；页面列最近 7 天超时次数与超时值的来源（来源五种：按预计、按实测、没估计用缺省、截在上限、设计里定死的值）。五、合入指标流水之后，循环板读自己的运行记录（页面「上次」缓存、`state.json` 重建、`staleEntries`、`timeoutEntries`）经指标设计的 `readLog(root, {from, to})`，28 天窗口，不另写解析。六、额度用完时首页「现在」的「推进停住」一行（面板 1.0 提的）由循环板与 M7、M6 定。
- `m3`：指标流水设计 0.6 对 M3 附录 0.5 与 0.6 的说明（没有必须改的）：M3 附录 0.6 对指标设计的请求（`metrics` 节点 2026-10-31T20:01Z 的批注）已收下，字段见指标设计 §4.5：`design.proposal-shown` 加可选的 `form`、`points`、`sample`，`design.answer-recorded` 加可选的 `form`、`delegated`、`pickedRecommended`，新种类 `design.delegation`（`action`、`count`、`scopeUnits`、`where`）与 `design.proposal-refused`（`kind`、`form?`、`code`、`field?`、`within?`、`attach?`），附录只写了内容的几项由指标设计起名，M3 的 `emitMetric` 照这些名字交；新字段都可选，按 0.5 写的事件照收；跟随推荐的比例只数 `form` 为 `recommend` 或 `choose` 的 `agree`，排除 `delegated`，`choose` 另要 `pickedRecommended` 为真；指标设计里两件待人定的事已改成各一句是非问。另：`record_human_answer` 在 `src/design/record.ts` 以 `llm` 身份写图，由项目图引擎的进程内观察者统一看到，M3 不用传任何选项；`design.answer-recorded.answer` 的取值认法仍在 `src/shared/answer-marks.ts`；主 Agent 是哪个会话由 `design.holder-moved` 认；持有者记录的位置（今天在用户级目录，搬进项目 `.llm/` 留给 M3 的对齐轮）不影响指标流水，因为它只读事件、不读这个文件。
- `rules`：指标流水设计 0.6 对规则板 0.10 的说明和请求（等 dogfood 之后）：已按 §10.5 收下 15 种事件，字段名在指标设计 §4.5（`rules.check` 逐字取自规则板）；`rules.judged` 的 `signals` 值不是整数、布尔或 id 的，适配器把名字放进 `unread`。请求：一、脚本、检测器与拦路脚本的超时按编排方 2026-10-31 的裁定写（用户图 G28）：写它们的 agent 估预计跑多久，超时一律是预计的 3 倍，第一次用估计，跑过之后用最近几次里最慢一次，没有估计用缺省（拦路脚本 10 秒），不超过最长值（拦路脚本 30 秒），人同意时看到的是超时和它依据的预计；超时值变更交 `timeout.set`，每次超时交 `timeout.hit`（`by: rules`，字段在指标设计 §4.2），`rules.script` 的超时结果与 `rules.late-verdict` 照旧记。二、写在代码里的规则一组（§1.4 第 12 条、§9.1）「没有解除，也没有任何改法」和「只记下，不挡」的标注作废，不再列 `credential-read`（`d-code-rules-enforce`、`d-credentials-readable`）；`rules.judged.how` 里「只记录」是用户自己选的做法，不是阶段。规则板的实现已直接按这两条做，事件先于文字修订。三、`/rules lift <规则 id>` 接到 M4 的服务 `glmHournessLifts`（写在代码里的规则的撤下，`d-one-lift-path`）之后，经规则板撤下的每一笔由 M4 写一条撤下记录，指标流水在它写完之后收一条 `lift` 事件（方式取 `board`）；接上之前，写在代码里的规则只能对主 Agent 说一句话撤下，指标流水里没有 `board` 的撤下。
- `m4`：指标流水设计 0.6 给 M4 下一稿（0.6 及以后）的输入：一、`rule` 不带 `outcome` 与 `mode`，`effect` 取 `deny`、`late`；跟进的结果单独成 `followup`，申报、放行、作废并成 `request`，撤下与恢复成 `lift`（只记规则 id、动作、方式和原话的字数；方式的取值留在 M4，今天是 `chat`、`board`，指标流水不把它写死，M4 加新值时指标流水不用改）。撤下的两条路（对主 Agent 说，由 `guard_lift` 写；规则板上的 `/rules lift`，由规则板经服务 `glmHournessLifts` 交给 M4）都由 M4 写撤下记录，指标流水只在它写完之后收一条 `lift`。二、E3 检查的超时值变更与超时用 `timeout.set`、`timeout.hit`（`by: env`），多出来源与旧值是 `d-timeout-measured` 要的；M4 0.6 的 §6.3.1 已在盘上，指标设计 0.5 对着它的 `ValueLine`、`TimeoutLine` 核过：估计对应「按预计的 3 倍」，harness 调整对应「按实测的 3 倍」，没写估计取最长的对应「没有估计用缺省」，`capped` 对应「截在上限」，5 秒下限抬起的值带「被下限抬起」，检查行里的预计秒数乘 1000 是预计用时；M4 把上限调高的设置不另设字段，原因与调高的理由留在 M4 自己的 `limits.jsonl`。三、`suppressions.jsonl` 在指标流水第 10 步去掉；`metrics-files-only` 经 `installRuleGate` 安装，行名 `metrics`，启用即拦，可用 `guard_lift` 撤下。
- `m6`：指标流水设计 0.6 的答复：`glm.quota-read` 不带会话时的归属已答（发送方带项目目录，答不出就只计数）；`windows` 取已用百分比整数；`peakMode` 取 `inform`、`reduce`、`stop` 或 `none`，`peakWorkerCap` 进 `cap?`。额度用完的停住与接上算在 M7 的 goal 上，`glm.upstream-limit` 的 `hasReset` 与 `glm.quota-read` 的读数只作旁证；请 M6 让停住原因与额度重置时刻能被循环板读到。
- `bootstrap`：指标流水设计 0.6 的答复：已答接管的请求，种类 `bootstrap.trial`，字段逐字取自接管 0.6 的试跑流水记录（`round`、`commandId`、`outcome`、`limitMs`、`limitSource`、`ms?`、`envKey`；记录里的 `log` 是路径不进事件，退出码 `exit` 只在 `trial.json` 里、事件里没有），字段在指标设计 §4.5；试跑里命令的超时记在这一条里，不另交 `timeout.hit`。读项目门禁 `bootstrap-read-no-shell` 的撤下走 M4 的那一条路（接管 0.6 复核后已没有 `/hourness-init unlock-shell`），M4 写完撤下记录后指标流水收一条 `lift`，接管不用交撤下的事件。
- `m8-plain-language`：指标流水设计 0.6 对面板设计 1.1 的答复：超时值的变更是 `timeout.set`（来源、预计用时、时间、旧值），每次超时是 `timeout.hit`（条目、限、用时、结局、来源），拦下记录是 `rule`（规则 id）与板上的 `rules.judged`，撤下是 `lift`，汇报交付是 `progress.handover`，字段都在指标设计 §4.2；超时的来源面板 1.1 列四种（agent 估的、按 N 次运行定、没写估计按上限、设计里定的固定值），指标流水的五个值与它们一一对得上，多出的一个是「3 倍超过上限、保持上限」，对应面板「超过上限时写保持上限、已告诉主 Agent」那一句；面板不写也不直接读指标流水，只依赖两块板的页面数据，种类名对它没有约束。面板设计把本设计写成「指标流水设计 1.0」，本设计的版本号是 0.6，请下一稿改成按名字引用。
- `user-journey`：指标流水设计 0.6 备好了 G15（额度用完的停住与接上）与 G18（汇报的到期与交付）的事件和事实行：额度从 M7 的 `execute.goal` 算，汇报记 `progress.due`、`progress.handover`；这两个缺口仍开着，因为发送方（M7）还没写，等 M7 下一次修订。

## 18. 修订记录

- 0.1（2026-10-30）：初稿。第 1 轮独立评审 CHANGES_REQUESTED（挡路 11 条：HIGH 2、MEDIUM 9；不挡路 11 条）。
- 0.2（2026-10-30）：按 F1–F22 修订。写到 §10 中断，没有 §11–§19，没有评审。原文留在 `design-0.2.md`。
- 0.3（2026-10-31）：对齐轮。第一次动手（2026-10-31 凌晨，账号额度用完时断掉）只改了文首、§0 与 §1 的几处，文首已写「§11–§19 补完」而正文没有；本稿接着做完：判草稿、改 §2–§10 里仍写着用户级目录、机器级流水与旧版本的地方、补 §4.5、§11–§19。每处改动答的哪条决定或发现见 §19.1，草稿的状态见 §19.3。待独立评审，评审通过之后再写一页放行稿。
- 0.4（2026-10-31）：按第 2 轮独立评审 F23–F39 修订（CHANGES_REQUESTED：挡路 6 条 MEDIUM F23–F28，不挡路 11 条 NIT F29–F39），并折进人 2026-10-31 的五条决定。上一位作者已写进 `design.md` 的草稿（他的会话在机器重启时丢了，没有交报告）原样存为 `design-0.4-draft.md`：它做完了 F23–F26、F29–F36、F38 的正文改动，F27 做了一半（字段名 `cmdId` 与接管的 `commandId` 不同，依据一节的历史条数、提交与邻居版本过时；0.4 初稿在这里写成「做完 F23–F27」，F45 指出后 0.5 改正），没有做 F28（§16 的四行超长）、F37、F39，§18 没有 0.4 一条，文首引用的 §19.4 不存在。本稿保留做对的、补上缺的，草稿的状态与取舍见 §19.5，每条发现在哪里怎样改见 §19.4，五条决定落在哪里见 §19.1 末尾几行。待独立评审（至多两轮修改加评审），通过之后再写一页放行稿。

- 0.5（2026-10-31）：按第 3 轮独立评审 F40–F48 修订（`align-1031-gate.json`：CHANGES_REQUESTED，挡路 2 条 MEDIUM F40、F41，不挡路 7 条 NIT F42–F48；挡路条数走向 11、6、2）。评审过的 0.4 原样存为 `design-0.4.md`（MD5 `8D95556421F5838EE7AA6EDF345E01EE`，1079 行）。F40：`lift.via` 改成 id，撤下的路按 M4 现稿改成「对主 Agent 说」加「规则板上打 `/rules lift`」，删掉 §4.2、§14、§17 三处 `unlock-shell`，验收第 22 条加 `board` 一例，文首的 M4 读取时刻更新；F41：`source` 改成五个值，`timeout.set` 加 `estMs` 与 `floored`，`wantedMs` 对 `ceiling` 一律带，验收第 21 条加缺省与下限各一例，对规则板、循环板、M7 的请求改成编排方裁定的写法，「§6.3.1 在盘上还没有」四处改成「已在盘上并核过」并写出映射；F42：新增 §15 第 35 条；F43：`bootstrap.trial` 去掉 `exit?`、`round` 改必填；F44：「什么都不记」改成「不另记」；F45：F27 从「做完」里拿出；F46：`progress.due` 的 `module?` 改名 `part?`；F47：写明 `isPruneCall` 的判法并在验收第 22 条加两种写法各一例；F48：§16 两句疑问重写。另有两处顺手的同步：依据一节补 main `3cd6773` 与节点第 30 条，§14 对面板的一条按 plain-ui 1.1 重写。每条在哪里怎样改见 §19.6。待独立评审（第二遍修改之后的评审），通过之后再写一页放行稿。

- 0.6（2026-11-01）：按第 4 轮独立评审的 F49 修订（`align-1031-gate.json`：CHANGES_REQUESTED，挡路 1 条 MEDIUM F49，不挡路 7 条 NIT F50–F56；挡路条数走向 11、6、2、1；停下的报告 `align-stop-report.md`）。评审过的 0.5 原样存为 `design-0.5.md`（MD5 `E838AF2DD7C59FAE3DCF60A8723C4E61`，1106 行）。F49 的起因是 0.5 收尾之后人定的 `d-ask-three-gates` 与 M3 附录 0.6 对本设计的请求（节点 `metrics` 第 33 条批注）。改动：§16 两件改成各一句是非问，推荐与理由在问句里，②带一句代价，来由一句放在问句之前，去掉四行标签、加粗与码点清单，形状以提问时 M3 附录的现行版为准；§4.2、§4.5、§6.2 的 M3 一节写明放行版 0.5 与现行 0.6 的路径，收进 `design.delegation`、`design.proposal-refused` 两种新事件与 `form`、`points`、`sample`、`delegated`、`pickedRecommended` 五个可选字段；§7.2 问人两行加按问法的计数、「你定」、「这类你定」、被拒的原因码、`points` 与跟随推荐的比例；验收第 4、5 条同改（第 5 条 `design.*` 与 `git.*` 由 8 种改 10 种）；文首依据读到节点第 34 条并写明第 31–34 条的处理；§0、§1.1、§1.2（F4）、§2、§12（第 1 步、第 4 步）、§14、§15（37、38）、§17 跟着改，§17 各条的版本号改成 0.6。F50–F56 没有改。每处在哪里见 §19.7。待独立评审，通过之后再写一页放行稿。

## 19. 评审意见与对齐的处理

### 19.1 对齐轮的改动：每处答哪一条决定或发现

| 依据 | 改了什么 | 在哪 |
| --- | --- | --- |
| `d-rules-in-repo`、`CHARTER.md` 0.7 §9（运行记录进项目 `.llm/`） | 指标流水本来就在项目 `.llm/metrics/`；0.2 里留在用户级的东西全部搬走：账本改成项目内的文件清单，路径散列的密钥改放 `.llm/metrics-key`；违规流水的位置按 M4 的 G1 写成「搬进项目」 | §0、§2、§3.3、§4.3、§5.5、§9.3 |
| `d-memory-scope`（用户级只留列定的几样） | 取消 0.2 的机器级流水：没有项目可归的事件只计数不落盘；`machine` 信封字段删除；写入器没有机器级目的地；验收加第 18 条；不做里加一条 | §0、§1.4、§1.6、§3.5、§4.1、§5.1、§5.2、§9.5 |
| 节点 `metrics` 批注 2026-10-30T08:12Z、T10:13Z（循环板 0.5、0.6） | `loop-done` 多 `refused`（含 `not-in-checkout`）与 `unfinished`，`loop-entry` 多 `repin`、`external`、`adopt`；`loop-read` 写进 `last-step.json` 指向的项目，不再机器级；运行记录合入后写 `.llm/metrics/`，只改 `src/loops/metrics.ts` | §2、§3.5、§4.2、§4.5、§6.2 |
| 节点 `metrics` 批注 2026-10-30T08:12Z（规则板 0.9，现 0.10） | `rules.*` 由 11 种变 15 种（`script`、`late-verdict`、`repo`、`stale`）；库写入口按项目根找项目 `.llm/`，不再用 `userDataHome()` | §4.2、§4.5、§5.2、§7.2 |
| 节点 `metrics` 批注 2026-10-30T11:58Z（M7 0.5，现 0.6）及简报「M7 0.6 的怎样算做完不再依赖流水」 | 事件表 22 种变 23 种（`execute.tier`）；本设计不再是 M7 的前提，M7 §3.16 的核对算本设计的验收第 5 条；M7 报告在流水到位之前从原始记录算同样的数，验收第 11 条加两边对照；0.2 给 M7 的三条请求：`metrics-gaps.jsonl` 不提请求、理由类别撤回、周报比率改成 §16 ② | §0、§1.4（5、11）、§4.2、§7.3、§14、§16 |
| 面板 0.7 对引擎写入方的说明（节点批注 2026-10-30T06:11Z；其 §14 第 14 条） | 引擎的写入方是图工具、命令行与人的 `/graph-run`，面板不写图；验收第 3 条按这三个入口写，静态检查按 `openEngine(` 的调用点清单 | §1.2（F5）、§1.4（3）、§4.2（`graph`）、§6.3 |
| 节点 `metrics` 批注 2026-10-30T07:12Z（M4 0.4 对本设计的答复，现 0.5） | 新增 `followup`、`request`；`recordKey` 谁先建谁建；`suppressions.jsonl` 在末步去掉；`metrics-files-only` 的行名 `metrics`，经 `installRuleGate` 安装；违规流水不并进指标流水 | §2、§3.4、§4.2、§6.2、§12 第 7、10 步 |
| 节点 `metrics` 批注 2026-10-30T05:32Z（M6 0.4，现 0.5）的「不带会话的事件归哪个项目」 | 答：发送方带项目目录，答不出只计数；`windows` 取百分比整数 | §3.5、§4.5、§14 |
| 节点 `metrics` 批注 2026-10-30T05:38Z（M3 附录 0.4，现 0.5） | `design.*` 加模块 id 与「再给人看一次」；模块放行的两条事件带模块 id | §1.4（4）、§4.5、§7.2 |
| `d-main-agent-peak-exempt` | 指标行的写入与自查既不是子 agent 也不是重活，高峰模式的三档都不管它；`llm.peak?` 只是测量值；验收加第 19 条 | §0、§1.4（19）、§4.2、§6.4、§9.5 |
| `d-boards-as-hooks`、`d-script-timeout`、`d-rules-in-repo`（两块板的事件表） | 脚本的运行、超时、晚到的拦下进事件表和计算；周报的两张「4 周没结果」单子由两块板自己算，指标流水不重算 | §4.5、§7.2 |
| `d-agent-examples` | 本流水没有给主 Agent 的工具，没有要写的示范；§0 写明 | §0 |
| `d-dogfood-scope`、`d-freeze-until-dogfood`、`d-alignment-rounds` | 实施在自举之后；对已放行设计的请求只写成批注 | §0、§12、§14、§17 |
| `d-chat-not-cards`、`d-plain-questions`（第 1 轮 F3 已要求） | 待人定改成两件，各按背景、推荐、疑问、不做四行，问题放最后，不用「验收」「标定」「门禁」「影子」（四行写法后被 `d-ask-three-gates` 取代，0.6 改成各一句是非问，F49） | §16 |
| `d-design-onepage`、`d-dogfood-scope`（实施前先放行） | 评审通过后再写一页放行稿，D1 并进它的末尾问（F3） | §16、§18 |
| 接管 0.4 §2.4 的请求（「种类与字段由指标设计定」） | 新增 `bootstrap.trial` | §4.2、§4.5、§14 |
| 对齐轮自查 1：`rule.outcome?` 放在拦截事件上 | 跟进的结果拦截之后才知道，只追加的流水不能回头改；拆成 `followup` | §4.2 |
| 对齐轮自查 2：§7.2 的「拦截」在 `/hourness` 事实里要用，表里却标成打分 | 拆成「拦截（计数）」F 和「拦截（打分）」S；计数口径写成与 M4 的 `classifyRecord` 一致 | §7.2 |
| 对齐轮自查 3：0.2 要新建 `src/shared/project-root.ts` 并返回 `{root, kind}`，仓库里已有 `src/data/project-root.ts` 的 `projectOf` | 改为导入已有的模块；「同一个函数两种退路」的说法不再需要；`git: false` 但有 `.llm` 的目录照写 | §0、§3.2、§3.3、§5.2、§7.5 |
| 对齐轮自查 4：「字段逐字取自各自那一节」对只写了内容的兄弟表不成立 | 新增 §4.5：写了名字的逐字取，没写的由本设计起名，取值清单留在兄弟设计里 | §0、§4、§4.4、§4.5 |
| 对齐轮自查 5：每天自查条目按循环板 0.4 的形状写 | 按循环板 0.6 的 `LoopEntryDefinition`、`Contribution.actions`、`HarnessResult` 重写 | §6.4 |
| 对齐轮自查 6：整个 `.llm/` 被删（`git clean -fdx`、重新克隆）没有写后果 | 写明发现不了、回不来，图历史可补；覆盖行加一句对照；列入不可逆处 | §0、§5.5、§8、§9.2、§9.3 |
| 0.4：`d-code-rules-enforce`（人 2026-10-31：「试运行规则啥的直接拦就行了，这样反而有问题好发现」） | `metrics-files-only` 启用即拦，不设影子期和模式，`rule` 事件删 `mode` 与 `effect` 里的 `shadow`、加 `late`；§7.2「拦截」一行不再有影子，按规则 id 列拦下，用户选的只记录与排队单列、不算进度；新增 `lift`（撤下与恢复）与事实里的「撤下」一行；`prune` 命令也算在拦的命令里；验收加第 22 条；§12 第 7 步、§15 第 13 条、§14 的 M4 一条同改；`followup` 留着但不再为转正服务；M4 的标注与回归语料不再有 | §0、§1.2（F13）、§1.4（22）、§1.6、§2、§3.4、§4.2、§5.3、§7.2、§9.3、§9.5、§12、§14、§15（13、31、32） |
| 0.4：`d-credentials-readable`（人：「密钥文件能读」） | 本设计没有读密钥的规则，也没有为读文件设的种类、字段或标记；读密钥文件是一条普通的 `tool`；M4 的 `credential-read` 不再出现；验收加第 23 条（L3 读假令牌文件，流水里只有一条普通 `tool`） | §0、§1.4（23）、§1.6、§15（34） |
| 0.4：`d-timeout-measured`（人：「超时那就这样定。不过还是我说的现在拿不准的事情，要做到优雅失败以及可追溯性」） | 新增 `timeout.set`（每个超时值的来源、时间、旧值）与 `timeout.hit`（条目、限、用时、结局、有没有告诉 agent），由本设计起名，`by` 是交它的那一块（含 M4 的 `env`）；事实里加「超时」一行，`verify` 加超时对账；上限被 3 倍越过时保持上限并告诉主 Agent 记在 `timeout.set` 的 `ceiling`；接管试跑的超时记在 `bootstrap.trial` 里（加 `limitMs`、`limitSource`）；指标行自己的等待是固定值，到时放弃、不崩（§9.2）；面板读两块板的页面数据，不读流水，本设计只定事件（§7.3 末条）；对规则板、循环板、M7、M4 的请求写进 §14 与 §17 | §0、§1.2（F12）、§1.4（21）、§2、§4.2、§4.5、§6.2、§7.2、§7.3、§7.5、§9.2、§11（17）、§14、§15（28）、§17 |
| 0.4：用户图两件（人：「额度重置后自动接上」；「做完一点汇报一点，或者等收菜」，确认「都没问题」） | 额度用完的停住与接上不新设种类，从 M7 的 `execute.goal` 与 M6 的 `glm.upstream-limit` 算，事实里加「额度停住」一行；汇报的到期与交付记 `progress.due`、`progress.handover`，事实里加「汇报」一行；两处发送方（M7）还没写，对应两行写「—」不写 0（§11 第 15、16 项）；对 M7、M6、循环板的请求写进 §14 与 §17；面板「上次看之后」与「需要你」按 plain-ui 1.0 的写法，汇报不进「需要你」（§7.3 末条） | §0、§1.2（F14）、§1.4（24）、§4.2、§7.2、§7.3、§11（15、16）、§14、§15（29、30）、§17 |
| 0.4：`d-desktop-direct-use`（人：「桌面版你直接用就行，现在又不是高峰期为什么不放行」） | 验证可以直接用桌面版，含重启，不必先告诉人：§12 第 6、9 步和 §13 的 L4 改写；顺序仍按 `AGENTS.md`（临时 profile 先验、动 `~/.dsh` 前备份、每处改动与备份写进运行报告、装后重启并确认日志无新错误）。本设计原来没有「重启前告诉人」的句子，改的是「合入前关桌面版」与第 9 步「桌面版重启」两处的写法 | §12（6、9）、§13 |
| 0.5：编排方 2026-10-31 的两条裁定（`d-one-lift-path` 07:04Z 与 12:56Z；`d-timeout-measured` 08:17Z 与 12:56Z），评审第 3 轮 F40、F41 指出 0.4 没跟上 | 撤下只有 M4 的一条路（对主 Agent 说、规则板 `/rules lift`），`lift.via` 改成 id、取值留在 M4；超时一律是预计用时的 3 倍，`timeout.set` 的来源改成五个值并加 `estMs`、`floored`，对规则板、循环板、M7 的请求写成「第一次就是估计的 3 倍」。这两条不是人的新决定，是编排方对人的决定的细化，可逆 | §3.4、§4.2、§12（7）、§14、§17，详见 §19.6 |
| 0.6：`d-ask-three-gates`（人 2026-10-31 23:44：「都没问题。先这样改和试行吧，我看看效果」）与 M3 附录 0.6 对本设计的请求（节点 `metrics` 第 33 条批注），评审第 4 轮 F49 指出 0.5 没跟上 | §16 两件改成 0.6 的确认推荐问法；M3 的事件收进两种新种类与五个可选字段；跟随推荐的比例按问法算；问人的计数按问法分并加「你定」、「这类你定」与被拒 | 文首、§0、§1.1、§1.2（F4）、§1.4（4、5）、§2、§4.2、§4.5、§6.2、§7.2、§12、§14、§15（37、38）、§16、§17，详见 §19.7 |

### 19.2 第 1 轮 F1–F22 各在哪里处理

| # | 级别 | 处理（0.2 起） | 在哪 |
| --- | --- | --- | --- |
| F1 | HIGH | 信封归本设计，正文按名字空间各一张闭合表；加 `id[]`、`int[]`、一层记录，0.3 又加 `map`；不另造 `task`、`upstream`，兄弟设计不改用本设计的词汇 | §4.1、§4.2、§4.4、§4.5 |
| F2 | HIGH | 问人按对话路径：收 `design.proposal-shown`、`design.answer-recorded`，次数、字数、等待、同意/补充/否掉都从它们算；卡片字段、`tagQuestion`、跟随率全部去掉 | §4.2、§4.5、§6.2、§7.2 |
| F3 | MEDIUM | D1 改成四行方案、不列选项、问题放最后；0.3 再加第二件（周报比率）；四行写法后被 `d-ask-three-gates` 取代，0.6 改成各一句是非问（F49） | §16 |
| F4 | MEDIUM | 项目根共用一个函数（0.3：仓库已有的 `projectOf`）；`appendEvents` 库写入口会等写完再退出；L2 子进程测试 | §3.3、§5.2、§1.4（13） |
| F5 | MEDIUM | 0.2 设了机器级流水；0.3 随 `d-memory-scope` 取消，改为只计数，并向循环板与 M6 提请求 | §3.5、§14 |
| F6 | MEDIUM | 激活后后台自查前一天与当天，进行健康与覆盖行；另有每天一次的循环板默认条目 | §6.4、§9.6 |
| F7 | MEDIUM | 删整天文件只有人能做（`prune`，先写事件），文件清单对账；shell 的删、移判法进 `metrics-files-only` | §5.3、§5.4、§5.5 |
| F8 | MEDIUM | `readLog` 的 `basis`、`--basis`、完整的依据行、复现的验收 | §7.1、§7.2、§7.5、§1.4（8） |
| F9 | MEDIUM | 出口分 `factsFor`、`scoresFor`；对话里的报告只用前者；L2 契约测试；0.3 把「M7 周报要比率」落成 §16 ② | §7.2、§7.3、§9.5、§16 |
| F10 | MEDIUM | `said` 事件：字数、附件数、来源，只数 `source.kind` 为 `user` 的非子会话消息 | §4.2、§6.1 |
| F11 | MEDIUM | `workflow` 行退役做独立评审，排在 M3、M7、M4 的同文件改动之后，`morning-report.ts` 的移动写明 | §12（第 10 步）、§2 |
| F12 | NIT | `llm.fin`、`answer.end` 加 `other`、`timed-out` | §4.2 |
| F13 | NIT | 用 `agent/request` 瀑布给 `(turn, step)`，`agent/request-error` 给重试 | §4.3、§6.1 |
| F14 | NIT | 审批结局取 rc.3 的值；拒绝用 `error.info` 里的 `rule` 分类，进程内配对只做退路 | §4.2、§6.1 |
| F15 | NIT | 行名按补丁里的写法：id `glm-hourness/metrics`，name `dsh-hourness/metrics` | §0、§10 |
| F16 | NIT | 路径记每个项目一份密钥的 HMAC；0.3 密钥放 `.llm/metrics-key` | §4.3 |
| F17 | NIT | 队列满时丢队首之后最早的一条 | §5.1 |
| F18 | NIT | 依据与兄弟设计写明版本；0.3 全部更新到现行版本 | 文首 |
| F19 | NIT | 读取按文件名顺序，重复保留文件名在前、行号在前的一条 | §7.1 |
| F20 | NIT | `metrics-files-only` 登进 `GUARD_RULES`，影子（0.4 改为启用即拦，`d-code-rules-enforce`）；0.3 行名与安装函数按 M4 0.5 | §3.4、§12 第 7 步 |
| F21 | NIT | `verify` 查命令行写入者写了宿主事件 | §5.4 |
| F22 | NIT | spawn worker 的事件由子进程写，列为未核实并加 L3 | §11 第 9 项、§13 |

### 19.3 对齐轮读到的盘上草稿：状态与处理

盘上的 `design.md` 是 615 行，文末和 0.2 一样留着一行 `%%NEXT%%`，§10 之后没有内容。与 `design-0.2.md` 逐行比（`git diff --no-index`：20 行新增、18 行删去，集中在第 3–74 行）：

- 0.2 原文完整保留：`design-0.2.md` 的 MD5 与文首记的 `9F4EC6D609B56C6D41C7A9EEE4190F80` 一致，`design-0.1.md` 的 MD5 与 `7C74656E2BC0B654DC0B0829AE25EFDC` 一致，本稿没有改它们。
- 上一次动手改过的只有文首、§0、§1.1 的一条、F1、F5 与验收第 3、4、5、7、10、11、14 条。§2 到 §10 没有动过，仍是 0.2 的原文，所以仍写着用户级的账本、机器级流水、`projectRootOf`、`kind: 'cwd'`、旧版本号（规则板 0.8、循环板 0.4、M7 0.4、M3 附录 0.4、M6 0.4）。§11–§19 没有，尽管文首写着「补完」。草稿没有另存副本（`.agents/` 被 `.gitignore` 忽略，git 里没有），但它与 0.2 的差别只有上面 20 行，都已在本稿里保留或改写，没有信息丢失。
- 判为完整、正确、保留的（核过兄弟设计的现行文本）：事件种类的个数（规则板 15、循环板 11、M7 23、M6 4、M3 8，逐个数过）；验收第 4、5、7、10、11、14 条的内容；F5 一条；§1.1 里 0.3 的依据一条；文首的两个 MD5。
- 判为不完整或不对、重做或改写的：文首的版本说明（说补完了，其实没有；改成与实际一致）；§0 「待人定只有一件」与文首「两件」矛盾（改成两件，补 §16）；§0 与 §4 的「字段逐字取自各自那一节」对只写了内容的表不成立（新增 §4.5）；§0 把 M6 的 `gateOnRules` 列为写事件的一次性进程（它不写，`checkCall` 写）；§0 的「M3 附录 0.4」；验收第 3 条的静态检查弱于代码现状（今天还有 `panel-row.ts` 一个调用点，改成按调用点清单）；依据里的 `9c346fb`（现 `4dc369e`）和邻居版本（M4 0.5、M6 0.5、plain-ui 0.8、接管 0.4）；§2 到 §10 里与现行设计不符的全部地方（见 §19.1）；文末的 `%%NEXT%%` 标记（已删，不是内容）。
- 没有把任何半写的小节当作完成：§2–§10 每一节都对着现行输入读过一遍再决定改不改，读过没有改的小节（§1.3、§1.5、§4.3 除密钥外、§5.3 除两处外、§6.1、§9.1、§10 前 19 行）是 0.2 正文仍然成立的。
### 19.4 第 2 轮 F23–F39 各在哪里处理（0.4）

「草稿」一列是上一位作者留在 `design.md` 里的 0.4 草稿（`design-0.4-draft.md`）对这一条做到了哪一步，本稿逐条对着正文核过。

| # | 级别 | 草稿 | 0.4 的处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F23 | MEDIUM | 已做 | `graph`（成功与补录，`rev?` 可选）与 `graph-fail`（失败，`actor`、`err`、`op?`、`node?`、`field?`）两个种类。核对失败码：`src/graph/mutation.ts` 的 `failure(` 有 `bad_transition`、`conflict`、`evidence_required`、`forbidden`、`graph_invalid`、`invalid`、`not_found`、`stale_revision` 八个，验收 3 逐个列出。保留 | §1.2（F5）、§1.4（3、5）、§4.2、§6.3、§7.5、§9.2 |
| F24 | MEDIUM | 已做 | 采用评审推荐的 a：`setEngineObserver`，通知在 `commit` 与 `apply` 的包装里；M3、M7、接管不用改；验收 3 改成静态检查加各失败码的行为测试；「同一包内模块实例是一份」列为未核实（§11 第 14 项）。保留 | §3.2、§6.3、§1.4（3）、§11、§12 第 3 步、§14、§15（25） |
| F25 | MEDIUM | 已做 | 选「不叫醒」：条目自带 `tell`、`wake` 为假；干净时动作返回 `skipped`，有发现时返回 `done`（结局 `delivered`，走 `inject`）。对着循环板 0.6 核过：§2.3 的 `Action` 把 `tell` 放在 `harness` 动作里，§6.5 第 3 步「`done` 不带 `tell`、条目有 `tell`：交条目的 `tell`」，与草稿一致；`tell.text` 用英文，循环板 0.6 第 39 行写「给模型看的文字用英文」。保留；请求 ③ 已写明这是第一个时间触发的出厂 `harness` 条目 | §0、§1.4（20）、§6.4、§14、§15（20）、§17 |
| F26 | MEDIUM | 已做 | 选评审的 b：M7 的报告继续从自己的记录算，不改读本流水；验收 11 第二段改成完整性核对，不绑任何合入；§2、§7.3、§12 第 5 步同改。保留 | §0、§1.4（11）、§2、§7.3、§12、§14、§15（27） |
| F27 | MEDIUM | 部分 | 草稿已把 `glm.peak-reminder` 加了 `cap?`、依据一节改成接管 0.5 与历史条数；但 `bootstrap.trial` 用了 `cmdId`，与接管试跑记录的 `commandId` 不同，违反 §4.5「写了名字的逐字取」，接管 0.6 又多了 `limitMs`、`limitSource`；依据一节的 27 条历史、`4dc369e`、邻居版本也已过时。0.4：改回逐字取 `commandId`，加 `limitMs`、`limitSource`；依据一节更新到 29 条历史、`aaab499`、M4 0.6、M6 0.6、plain-ui 1.0、接管 0.6；§12 第 1 步「兄弟字段多于表」一类保留 | 文首、§4.2、§4.5、§12、§14、§15（33） |
| F28 | MEDIUM | 没做 | §16 仍是 0.3 的原文。0.4 按评审给的重写两件的四行，码点数重新数过（背景 33、37，推荐 22、33，疑问 25、24，不做 22、29，加粗 4 到 10），「24 条」取 §1.4 现在的条数；§16 开头一段写明长度按 `proposalLineRefusal`，四个数与各条检查放进放行稿正文。四行写法后被 `d-ask-three-gates` 取代，0.6 改成各一句是非问（F49） | §16 |
| F29 | NIT | 已做 | 持有者记录的位置改成「照 M3 对齐轮的结果，今天在用户级目录；本设计只读 `design.holder-moved`」。保留 | §4.2（M3 一节）、§14 |
| F30 | NIT | 已做 | `panel-row.ts` 只删 `/graph-apply` 分支与那个调用点，文件与行留着。保留；§14 的 plain-ui 一条在 0.4 并入 1.0 的说明 | §6.3、§14 |
| F31 | NIT | 已做 | `w` 的类型改成 id，两种形状 `^[0-9a-f]{8}$` 与 `^bf-[0-9a-f]{7}$`，退路文件名与 `--basis` 正则同改。保留 | §4.1、§5.6、§7.5 |
| F32 | NIT | 已做 | 改引符号名 `pricingService`、`UsagePricing`，不写行号。保留 | §6.1、§6.2 |
| F33 | NIT | 已做 | 循环板合入后读自己的运行记录经 `readLog(root, {from, to})`，28 天窗口。保留 | §6.2、§12 第 6 步、§14 |
| F34 | NIT | 已做 | 宿主进程里可同时有一个 `appendEvents` 的短命写入者，两个写入者各有 `w` 与链；「每个进程」改「每个写入者」。保留 | §5.2、§5.6 |
| F35 | NIT | 已做 | 第 1 步去掉验收 8，第 2 步只留 `tool` 一半，`rule` 一半移到第 3 步。保留；0.4 在第 2、4、7 步的验证列加了验收 23、21、24、22 | §12 |
| F36 | NIT | 已做 | 文件工具的判法覆盖 `<root>/.llm/metrics/**`、`metrics-manifest.jsonl`、`metrics-key` 三处。保留；0.4 把「记下」改成「拦下」（`d-code-rules-enforce`） | §3.4 |
| F37 | NIT | 没做 | §16 开头一段写明放行稿正文补一句「宪章 3.2 已要求每周报这四个数」，并把四个数写在那一段里。后被 `d-ask-three-gates` 取代：0.6 把这句的用意放进②的来由（F49） | §16 |
| F38 | NIT | 已做 | 事实行只列超时次数，两张单子以 `timeoutEntries` 与规则板的服务为准，流水里的数用来对账。保留；0.4 把超时次数改由 `timeout.hit` 算并加 `verify` 的超时对账 | §7.2、§7.5 |
| F39 | NIT | 没做 | §17 仍写「由评审通过之后的步骤按清单建」而没写哪一步。0.4：写明由评审 APPROVED 之后的那一步建，每条「- `节点 id`：正文」写成一个元素，评审没通过时不建；§17 整节按 0.4 重写 | §17 |

### 19.5 盘上的 0.4 草稿：状态与处理（0.4 的第一层）

草稿的来历：对齐轮指标一支的第二遍修改（评审第 2 轮之后）写了 `design.md` 到 0.4（2026-10-31 12:44），会话在机器重启后读不出（`Failed to load session`），没有交报告（节点 `metrics` 第 29 条批注）。本稿按作者已离开的草稿处理：先把盘上的 `design.md` 原样存为 `design-0.4-draft.md`（MD5 `E07882318FCC9404B8C65D6AD3780711`，985 行），再对着 `design-0.3.md`（`git diff --no-index`：83 行新增、62 行删去，集中在文首、§0、§1.4、§2、§4.2、§4.5、§5、§6、§7、§11、§12、§14、§15）、`design-review.md` 第 2 轮、`design-review.json` 与 `align-resume-gate.json` 里的 F23–F39 逐条核对。

- 草稿里完整并且做对的，原样保留：F23、F24、F25、F26 的正文改动，F29–F36、F38；草稿加的验收第 3、5、11、20 条改写、§11 第 14 项、§15 第 25–27 条、§14 对 M7、循环板、M3、M6、plain-ui、接管的几处补充。
- 部分做了的：F27（字段名与依据，见 §19.4）。
- 没有做的：F28（§16 的四行）、F37、F39、§18 的 0.4 一条、§19.4。文首引用了 §19.4 和「修订记录见 §18」，实际两处都没有。
- 没有半写的小节：草稿没有截断，没有标记行，最后一处改动是 §15 第 27 条，§16 到 §19 仍是 0.3 的原文，所以缺的是没轮到，不是写了一半。
- 草稿里本稿核对后改了的说法：节点历史条数（27 改 29）、依据的提交（`4dc369e` 改 `aaab499`）、邻居版本（M4 0.5、M6 0.5、plain-ui 0.8、接管 0.5 改为 0.6、0.6、1.0、0.6）、`bootstrap.trial.cmdId`。
- 本稿在草稿之上新做的：人 2026-10-31 的五条决定（§19.1 末五行），以及 `metrics-files-only` 把 `prune` 算进拦的命令这一处自己发现的不一致（规则启用即拦之后，不加这一句，主 Agent 经 shell 能跑 `prune`，§15 第 32 条）。

### 19.6 第 3 轮 F40–F48 各在哪里处理（0.5）

第 3 轮评审的结论是 `align-1031-gate.json` 与 `design-review.md` 第 3 轮；F23–F39 在那一轮全部关闭，这里只列新的九条。0.5 动手前先把评审过的 `design.md`（MD5 `8D95556421F5838EE7AA6EDF345E01EE`）原样存为 `design-0.4.md`，再逐条对着邻居设计的盘上现行稿重核，不只信评审写的行号。重核时 M4 的 `design.md` 在 22:37 又被别的步骤改过一次，所以下面引 M4 只写节号与符号名；改后我再查了一遍这几处：`LiftRecord.via` 与服务 `lifted()`、`setLifted` 都是 `chat`、`board`（类型声明里原来留的 `'command'` 已改成 `'chat' | 'board'`），§3.5 只有 `guard_lift` 与规则板 `/rules lift` 两条路，§6.3.1 的 `ValueLine`、`TimeoutLine` 没变。

| # | 级别 | 0.4 的状态 | 0.5 的处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F40 | MEDIUM | 成立。§3.4 与 §12 第 7 步写 `/guard lift`，`lift.via` 是封闭枚举 `chat`、`command`，§4.2、§14、§17 三处写接管的 `unlock-shell` 若不经 `guard_lift` 要交 `via=command` 的 `lift` | 一、`lift.via` 改成 `id`，取值留在 M4（今天 `chat`、`board`），不认识的归「其他」，与 §4.4 对兄弟设计拥有的取值的规矩一致。二、§3.4 与 §12 第 7 步的 `/guard lift` 改成「对主 Agent 说一句话（它调 `guard_lift`），或在规则板上打 `/rules lift metrics-files-only`，规则板的接线是 dogfood 之后的请求，接上之前只有前一条」。三、删去 §4.2、§14、§17 里 `unlock-shell` 的三句，改成「读项目门禁的撤下并入 M4 的那一条路，M4 写完撤下记录后指标流水收一条 `lift`」；§14 的 M4 一条和 §17 的 `m4`、`rules` 各补一句：两条路都由 M4 写撤下记录，本设计只收它写完之后的那一条。四、文首 M4 的读取时刻改成 22:37，并写明 §6.3.1 已在盘上。五、验收第 22 条加一例：假的 `glmHournessLifts.setLifted` 写一笔，`lift` 事件读回逐字相同、`via` 为 `board`，另加 `chat` 一例和「表外的 id 形状取值照收、归『其他』」一例 | §3.4、§4.2（`lift` 一行）、§1.4（22）、§12 第 7 步、§14（M4、接管）、§15（31）、§17（`m4`、`rules`、`bootstrap`）、文首 |
| F41 | MEDIUM | 成立。`source` 只有 `estimate`、`measured`、`ceiling` 三个值，没有「没估计」「下限」「估计本身」的位置；§14、§17 对规则板、循环板、M7 的请求写成「先估后测」，与编排方 08:17Z、12:56Z 的裁定（第一次就是估计的 3 倍）不同；「§6.3.1 在盘上还没有」在文首、§11 第 17 项、§14 M4 ⑤、§17 `m4` 四处过时 | 一、`source` 改成五个值：`estimate`（还没跑过，限＝3 × `estMs`）、`measured`（3 × 最近几次最慢一次）、`default`（没有估计，用条目写明的缺省）、`ceiling`（3 倍超过上限，保持上限，不论 3 倍从估计还是实测来）、`fixed`（设计里定死的值，只给还没改用这条规则的发送方）；`timeout.set` 与 `timeout.hit` 都改。二、`timeout.set` 加 `estMs?`、`floored?`，`wantedMs` 对 `ceiling` 一律带；`estimate` 的 `limitMs` 是 3 × `estMs`（受下限与上限约束），写进 §4.2 规矩五。三、验收第 21 条改成五种来源各一例，加「从估计来的 `ceiling`」「从实测来的 `ceiling`」「被下限抬起的 `estimate`」，`factsFor` 列来源（五个值之一）与预计用时。四、§14、§17 对规则板、循环板、M7 的超时请求改成裁定写法（agent 估预计跑多久，超时一律是预计的 3 倍，先用估计，跑过之后用最近几次里最慢一次，没有估计用缺省，人同意时看到超时和它依据的预计）。五、把四处「在盘上还没有」改成「已在盘上，对着 `ValueLine`、`TimeoutLine` 核过」，映射写成 §4.2 规矩六：`by: 'estimate'` 对 `estimate`，`harness` 对 `measured`，没有估计取最长的对 `default`，`capped` 对 `ceiling`，5 秒下限抬起的值带 `floored`。M4 的 `cap.by: 'setting'`（主 Agent 调高上限）不另设字段，理由写在规矩六和 §15 第 36 条。六、§0 与 §1.1 里「先估后测」的概述句同步 | §0、§1.4（21）、§4.2（`timeout.set`、`timeout.hit` 与规矩五、六）、§7.2（超时一行）、§11（17）、§14（M7 ⑨、循环板 ⑥、规则板 ①、M4 ⑤、plain-ui）、§15（36）、§17（`m7`、`schedules`、`rules`、`m4`、`m8-plain-language`）、文首 |
| F42 | NIT | 成立。第 6 步默认启用先于第 7 步装 `metrics-files-only`，中间那段没写成取舍 | 选评审给的第二种：加 §15 第 35 条（agent 定、人可推翻）。不选第一种（把第 6 步的默认启用挪到第 7 步之后），因为第 7 步要等 M4 的 G1，那样指标行会在 G1 之前一直不能默认启用，探针和批次 L4 也跟着等。§3.4 末段和 §12 第 6、7 步各补一句指向它；写明这不是影子期（规则不存在，不是只记录），但与「从行启用那天起就拦」差这一段，这一段只靠摘要与清单事后发现 | §3.4、§12（6、7）、§15（35） |
| F43 | NIT | 成立。§14 的括号和 §4.5 的字段表把 `exit?` 列进「一一对上」，`round` 写成可选 | `bootstrap.trial` 去掉 `exit?`（`exit` 只在接管的 `trial.json` 里，试跑流水记录里没有），`round` 改必填；§4.5 的行、§14 接管一条、§17 `bootstrap` 一条同改，括号里列的是接管记录的八项（`log` 注明是路径不进事件） | §4.5、§14、§17（`bootstrap`） |
| F44 | NIT | 成立。§1.1 与验收第 23 条标题写「什么都不记」，§0、§1.6 与第 23 条正文是「一条普通的 `tool`」 | 三处（§1.1、验收第 23 条标题、§15 第 34 条）改成「不另记」，并在 §1.1 写明它在流水里只是一条普通的 `tool`；接管一条里的「也不记」同改 | §1.1、§1.4（23）、§14（接管）、§15（34） |
| F45 | NIT | 成立。文首与 §18 写草稿「做完」F27，§19.4、§19.5 写「部分」 | 以「部分」为准：核对草稿（`cmdId`、27 条历史、`4dc369e`、旧邻居版本），F27 确是做了一半。文首保留的 0.4 说明和 §18 的 0.4 一条都把 F27 从「做完」里拿出，写「F27 做了一半」。这是对保留原文的一处更正，已在文首注明 | 文首、§18 |
| F46 | NIT | 成立。`progress.due` 的 `module?` 收不下里程碑；用户图 G18 还留着「没分模块的新目标，一部分按什么算」没定 | 改名 `part?:id`（做完的那一块的节点 id，模块与里程碑都放；目标的直接子节点里状态变为完成的特性，有 `stage` 的是模块，没有的是里程碑），`scope` 的 `part`、`goal` 不变；§7.2 的「汇报」一行写的是「一块的、整个目标的」，不用改。G18 那一问仍是 M7 的事，这里不替它定 | §4.2（`progress.due`） |
| F47 | NIT | 成立。`npm run metrics -- prune` 的文本里没有 `.llm/metrics`，规则的 shell 判法认不出它；验收只测 `Remove-Item` | §3.4 写明纯函数 `isPruneCall`（`src/metrics/rules.ts`）：命令文本反斜杠换成斜杠、转小写、按空白切词、去词尾 `.cmd` 与 `.exe`，满足「`npm` 之后有 `run`、其后有 `metrics`、再其后有 `prune`」或「某个词含 `scripts/metrics/cli`、其后有 `prune`」之一就拦；同一入口的 `summary`、`verify`、`compare` 不拦；绕过写法认不出，规则不防有意绕过。验收第 22 条加 `npm run metrics -- prune`、`node scripts/metrics/cli.ts prune` 各被拒、`npm run metrics -- summary` 放行三例；§12 第 7 步与 §15 第 32 条指向它 | §3.4、§1.4（22）、§12（7）、§15（32） |
| F48 | NIT | 成立。§16 ① 疑问「对方」没有指代，② 疑问「会不会被当目标追」没说谁追 | 照评审的重写：①「最没把握的是**别的设计改名**，这里就得跟着改。」② 「最没把握的是**模型追着比率跑**，设计阶段验证不了。」我重数过码点：① 21 个，加粗 6 个；② 23 个，加粗 7 个，都在 M3 的 40 与 2 到 12 之内；§16 开头的码点清单里疑问一项由 25、24 改成 21、23，加粗范围 4 到 10 不变。整节后被 `d-ask-three-gates` 取代，0.6 改成各一句是非问，码点清单删去（F49） | §16 |

本遍没有动的：第 2 轮关闭的 F23–F39 的正文；五条决定的折入（评审逐条核过，除 F40、F41、F44、F46 涉及的几处外保持原样）；`graph-ops-align.json`、`design-review.md`、`design-review.json`、`align-1031-gate.json`（不是作者写的文件）。种类总数不变：本设计起名的仍是 `lift`、`timeout.set`、`timeout.hit`、`progress.due`、`progress.handover` 五种加 `bootstrap.trial`，验收第 5 条的清单比对不受影响。

### 19.7 第 4 轮 F49 各处的处理（0.6）

第 4 轮评审的结论是 `align-1031-gate.json` 与 `design-review.md` 第 4 轮；F40–F48 在那一轮全部关闭。0.6 动手前先把评审过的 `design.md`（MD5 `E838AF2DD7C59FAE3DCF60A8723C4E61`，1106 行）原样存为 `design-0.5.md`，再对着盘上的 M3 附录、节点 `metrics` 的第 31–34 条与 `m3`、`d-ask-three-gates` 两个节点重核，不只信评审写的行号。重核时与评审读到的不同的有两处。一、M3 附录：评审读的是 2026-11-01 01:13 的稿，写的是「第 2 轮待做，未放行」；盘上现在是 03:26 的稿，第 3 轮评审 APPROVED（`reviews/addendum-v06-review.md`，03:51），编排方已按它恢复 M3 的实现（节点 `m3` 2026-10-31T20:01:32Z）；人放行过的仍是 0.5。二、`design.proposal-refused` 的 `not-in-text` 在 0.6 的表里带 `field` 与 `within` 两项，评审给的字段清单只有 `field`；表是闭合的，少一项就整条拒收，所以 0.6 照 M3 的表加了 `within?`。

| 评审 F49 的改法 | 0.6 的处理 | 在哪 |
| --- | --- | --- |
| 1. §16 改成每件一个问句，去掉四行标签、加粗与码点清单，形状以提问时 M3 附录的放行版为准，本设计不钉长度数；§0 与 §17 `metrics` 里的「按四行问」同改；F28、F37、F48 的行保留并注明被取代 | 照做。两句按 0.6 的 `recommend` 写，推荐与理由原样在问句里；①没有代价句（同意之后哪条要改，再问一次就能改），②有一句代价（面板做出来之前看比率要自己敲命令）。每件前面加一句来由，放在汇报里、不进问句（M3 附录 0.6 用它替代背景一行；`design-context.md`「Questions for the person carry their background」）。按 0.6 核过：一行、恰好一个问号、`proposal` 与 `reason` 在问句里、`cost` 在问号之后、换词表的词一个没有、字数在 0.6 的上限之内；上限的数不写进设计。评审的例句①里「以后要改再问你」不是理由，0.6 的 `textCoversRecord` 要理由出现在问句里，所以①用「这些检查都由系统自己跑，不用你逐条读」作理由。①的 24 条不在放行稿里逐条列（§15 第 38 条）；F37 的用意放进②的来由。§19.1、§19.2 的 F3、§19.4 的 F28 与 F37、§19.6 的 F48 各加一句「后被 `d-ask-three-gates` 取代」 | §0、§15（38）、§16、§17（`metrics`）、§19.1、§19.2、§19.4、§19.6 |
| 2. §4.2 与 §4.5 的 M3 一节写明放行版 0.5 与路径，列出 0.6 要的字段与两种新事件；验收第 5 条改个数；§7.2 问人行的同意率口径写明 0.6 的跟随率 | 照做，现在就收（§15 第 37 条）。`design.proposal-shown` 加 `form?:id`、`points?:int`、`sample?:bool`；`design.answer-recorded` 加 `form?:id`、`delegated?:bool`、`pickedRecommended?:bool`；新种类 `design.delegation`（`action:id`、`count:int`、`scopeUnits:int`、`where:id`）与 `design.proposal-refused`（`kind:id`、`form?:id`、`code:id`、`field?:id`、`within?:id`、`attach?:id`）。新字段都可选，按 0.5 写的事件照收，验收第 5 条加一句；`design.*` 与 `git.*` 写 10 种，注明照 M3 附录 0.6 §3.12 抄。§7.2 的问人两行：事实一行加每种问法各问了几次、「你定」的次数、「这类你定」存下与撤下的次数、被拒的次数按原因码，并注明「我定了：」的告知句不在流水里；打分一行加 `points` 的中位数与最大值和跟随推荐的比例（分母、分子按 M3 的口径写全）；次数口径一段写明「这类你定」不进原样同意率。验收第 4 条加 0.6 的事件与一个跟随比例的 L2 例子（没有另加一条，§16 ①里的「24 条」不变），§12 第 4 步的验证列跟着加 | 文首、§0、§1.2（F4）、§1.4（4、5）、§2、§4.2、§4.5、§6.2、§7.2、§12（1、4）、§14（M3）、§15（37） |
| 3. 文首把节点读到 33 条，写明第 31–33 条怎样处理；§17 `m3` 改成「0.6 的请求已收下，字段见 §4.5」 | 照做，读到第 34 条（第 34 条是第 4 轮停下的记录，晚于评审）。第 31、32 条不用处理（0.5 写出的说明；M4 0.6 的接缝说明，内容与 0.5 已收的相同），第 33 条收下，处理落在上一行。§17 `m3` 一条重写，列出收下的字段；§14 的 M3 一条同改；§1.1 加 0.6 的依据一条 | 文首、§1.1、§14（M3）、§17（`m3`） |

本遍没有动的：F50–F56（NIT，不挡路），留到下一遍修改或实现前；第 3 轮及以前关闭的发现的正文；`design-review.md`、`design-review.json`、`align-1031-gate.json`、`align-stop-report.md`（不是作者写的文件）。顺手同步的两处：§17 各条与 §14 面板一条里本设计的版本号由 0.5 改成 0.6（§17 `m4` 一条里「指标设计 0.5 对着它的 `ValueLine`、`TimeoutLine` 核过」是 0.5 做过的事，没改）；文首依据补了 main `061bd32` 与代码一侧自 `aaab499` 起改过的四个依据文件，0.6 没有重读它们，§12 第 1 步加了实现前重读这一句。种类总数多两种（`design.delegation`、`design.proposal-refused`，都是 M3 的）；本设计起名的仍是 `lift`、`timeout.set`、`timeout.hit`、`progress.due`、`progress.handover` 五种加 `bootstrap.trial`。
