# metrics 设计：每个项目一份指标流水（项目图 `metrics`）

版本：0.3（2026-10-31，对齐轮完成版）。0.2（2026-10-30）按第 1 轮独立设计评审 F1–F22 修订，只写到 §10，文末留着一行 `%%NEXT%%`，§11–§19 没有写成，也没有评审过。对齐轮的第一次动手（2026-10-31 凌晨，账号额度用完时断掉）把文件标成 0.3，改了文首、§0、§1.1 的一条、F1、F5 与验收第 3、4、5、7、10、11、14 条，文首却已经写着「§11–§19 补完」，而 §2–§10 仍是 0.2 的原文，文末仍留着 `%%NEXT%%`。本稿接着把它做完：先把盘上那份当作作者已经离开的草稿，逐节对照 0.2 与对齐轮的输入判断完整性（结果见 §19.3），再改掉 §2–§10 与验收里仍写着用户级目录、机器级流水、旧版本号和旧文件名的地方，补写 §11–§19。版本号仍是 0.3：0.3 从未完成过，也没有放行过，不需要另起一号。

本稿做两件事。一、按人在 0.2 之后定的决定和已放行设计的现行版本改（`d-rules-in-repo`、`d-memory-scope`、`d-main-agent-peak-exempt`、`d-boards-as-hooks`、`d-script-timeout`、`d-agent-examples`；规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6；面板 0.7 对写图的方的说明），主要的一处是用户级目录里不再放任何指标文件（§3.3、§3.5、§5.5）。二、补完 §11–§19，其中 §16 的待人定两件、按四行写。0.2 原文原样留在同目录 `design-0.2.md`（MD5 `9F4EC6D609B56C6D41C7A9EEE4190F80`，只有 §0–§10）；0.1 在 `design-0.1.md`（MD5 `7C74656E2BC0B654DC0B0829AE25EFDC`），第 1 轮评审的行号指 0.1。每处改动答的是哪一条决定或发现，见 §19.1；第 1 轮 F1–F22 各在哪里处理，见 §19.2；盘上草稿的状态与处理见 §19.3。

依据：main `4dc369e`（2026-10-31 读；`src/`、`scripts/`、`packages/` 自 0.3 草稿依据的 `9c346fb` 起没有改动，其间的提交只动了 `video/` 与项目图）；项目图节点 `metrics`（2026-10-29 人批准，原话「指标能全记就全记下，b直接做」；节点上到 2026-10-30T11:58Z 的 25 条历史，其中循环板 0.5 与 0.6、规则板 0.9、M7 0.5、面板 0.7 对本设计的输入清单变化已并入）；人定的决定节点 `d-rules-in-repo`、`d-memory-scope`、`d-main-agent-peak-exempt`、`d-boards-as-hooks`、`d-script-timeout`、`d-agent-examples`、`d-chat-not-cards`、`d-one-main-agent`、`d-design-onepage`、`d-plain-questions`、`d-dogfood-scope`、`d-freeze-until-dogfood`、`d-alignment-rounds`；`.agents/tasks/design-context.md` 全部各节；`docs/CHARTER.md` 0.7（§3.2、§6、§7.1 条款 7 与 11、§8、§9 存放表）；`docs/DESIGN.md` §2.4、§2.4a、§2.5；`docs/ORCHESTRATION.md` §2.9.1、§10、§11、§12、§16；`docs/DEVELOPMENT.md` §1.1；本仓库源码 `src/data/project-root.ts`（`projectOf`、`gitDirOf`、`ensureIgnored`）、`src/data/lock.ts`、`src/memory/audit.ts`、`src/memory/index.ts`、`src/workflow/index.ts`、`src/workflow/morning-report.ts`、`src/report/index.ts`、`src/shared/data-home.ts`、`src/shared/lm-min.ts`、`src/shared/peak-mode.ts`、`src/graph/engine.ts`、`src/graph/tools.ts`、`src/graph/run-control.ts`、`src/graph/cli.ts`；已有流水 `.llm/audit/decisions.jsonl`、`violations.jsonl`。本稿不引 ZCode 包内的事实（`d-zcode-3171` 不涉及）。

兄弟设计（读时的版本，F18）。已放行的四份优先于本设计，本稿不改它们：规则板 `.agents/tasks/rules/design.md` 0.10（含同目录 `design-amendments-followup.md` 的六条修订；§7.1 文件、§7.3 项目根、§9.4 命令行、§10.5 事件表 15 种）、循环板 `.agents/tasks/schedules/design.md` 0.6（§2.1–§2.3 条目形状、§3.1 服务、§6.10 事件表 11 种与「写到哪里」、§9.1 文件、§17）、M3 附录 `.agents/tasks/m3/design-addendum.md` 0.5 连同 `design.md`（§3.12 事件表 8 种、§3.13 `attach`、§3.14 模块放行）、M7 `.agents/tasks/m7/design.md` 0.6（§3.16 事件表 23 种和它对本流水的说明、§2.1 运行时文件）。仍在同一轮对齐里的邻居，读盘上 2026-10-31 02:00 前后的现行稿：M4 `.agents/tasks/m4/design.md` 0.5（§2.4 流水搬进项目、§3.2 `recordKey` 与记录类型、§3.11 交给本流水的事件、§6.7）、M6 `.agents/tasks/m6/design.md` 0.5（§14.2）、plain-ui `.agents/tasks/plain-ui/design.md` 0.8（§5.6、§11、§14 第 14 条）、接管 `.agents/tasks/bootstrap/design.md` 0.4（§2.4）。邻居在这一轮可能再出新稿；各名字空间的种类表以实现时各自那一节的现行版本为准（§12 第 1 步、§14）。

证据写法沿用 `docs/DESIGN.md` §2.4a：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行号；`types.d.ts:行` 指 `node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts`。〔实读〕读过源码；〔推断〕由源码推出、没有运行验证；〔未核实〕列进 §11，实施时先核实。

## 0. 摘要

- 每个项目一份只追加的事件流水：`<项目根>/.llm/metrics/events-<UTC 日期>.jsonl`。全部文件都在项目的 `.llm/` 里，用户级目录里没有指标文件（`d-rules-in-repo`、`d-memory-scope`、`CHARTER.md` 0.7 §9：用户级只留登录凭证、关于人的记忆、整个账号的额度与用量）。项目根用仓库里已有的 `src/data/project-root.ts` 的 `projectOf(cwd)`（返回 `{root, git}` 或 `undefined`，规则板 0.10 §7.3 的同一个函数，工作树归到主检出），不用数据目录服务里钉死的 `projectHome`，也不另写第二份。第一次建 `.llm/` 之前调同一个文件里的 `ensureIgnored(root, '.llm')`，`metrics/` 里另放一个只写 `*` 的 `.gitignore`。`projectOf` 返回 `undefined` 的会话，以及发送方答不出项目的事件，不写，只计数；0.2 加的机器级流水随 `d-memory-scope` 取消（§3.5）。
- 信封加正文的两层格式（F1）：信封由本设计定（`s`、`k`、`at`、`w`、`n`、`h`、`v`、`by`、`sid?`），正文按名字空间各一张闭合表——本设计自己的种类，加规则板 0.10 §10.5（15 种）、循环板 0.6 §6.10（11 种）、M7 0.6 §3.16（23 种）、M6 0.5 §14.2（4 种）、M3 附录 0.5 §3.12（8 种）已经定好的那些，另加接管 0.4 请的 1 种（`bootstrap.trial`，§4.2）。字段名与类型的来源见 §4.5：兄弟设计写了名字的逐字取，只写了内容的由 §4.5 起名，取值清单留在兄弟设计里、本设计不抄。表放在 `src/metrics/kinds/<名字空间>.ts`。本设计不另造 `task` 与 `upstream` 种类，也不要兄弟设计改用本设计的词汇。
- 只有 harness 写。新行（id `glm-hourness/metrics`，导出名 `dsh-hourness/metrics`，编排层包，出厂 `disabled: true`，F15）是唯一的写入者：它自己挂在 DSH 的通用接缝上记每一次模型调用、每一次工具调用、回合、审批、命令、问题与人发的消息（F10）；别的行与 GLM 通道包经进程内服务 `glmHournessMetrics` 交各自名字空间的事件。DSH 之外的一次性进程（规则板的 `checkCall`，命令行 `check` 与 M6 的 `gateOnRules` 都经它判定；循环板之外的脚本）经 `appendEvents` 库写入口写，调用方 `await` 它再退出，事件不丢（F4）。模型说的数一律不收。指标行的写入和自查既不是子 agent 也不是重活，高峰模式的三档（`d-main-agent-peak-exempt`）都不管它；本流水没有给主 Agent 的工具，所以也没有要写的示范（`d-agent-examples`）。
- 记的是数与引用，不记文字：闭合的字段表，字符串只许 id 形状，数组至多 32 项、只放 id 或整数，记录只一层、键与类型在表里声明；不合规的整条拒收并计数。文件路径记每个项目一份密钥的 HMAC 散列（密钥放在项目的 `.llm/metrics-key`，在 `metrics/` 目录之外，导出流水时不带它，F16），shell 命令只记第一个词。
- 写入失败不挡工作：失败的事件留在有上限的内存队列里按序重试，溢出时丢队首之后最早的一条（队首正在重试，不丢，F17）并在恢复后写一条 `gap`。每行带写入者 id、序号与链式摘要。核对不只在有人跑命令时做：指标行激活后在后台对前一天与当天各核对一次，结果进行健康与 `/hourness` 的覆盖行；另有一条每天一次的编排层自查条目（循环板 0.6 的默认条目，F6）。整天的文件只有人能删，删前先写一条 `prune`；每个新的日文件先登记在项目的 `.llm/metrics-manifest.jsonl`（文件清单，在 `metrics/` 目录之外），核对时对着它，少了文件就报出来（F7）。整个 `.llm/` 被删（`git clean -fdx`、换电脑重新克隆）时清单跟着没了，这一种发现不了，流水也回不来，只有图历史能由 `backfill-graph` 补回；这是 `d-rules-in-repo` 把运行记录放在项目 `.llm/` 里的代价，M7 0.6 对自己的 `.llm/execute/` 也这样接受，§5.5、§9.3 写明。
- 报告从流水算，分「事实」与「打分」两类（F9）：事实（几件做完、几件在等人、哪次检查没过、记录缺了几行、覆盖范围）可以经主 Agent 的对话给人；打分（原样同意率、被拦率、返工次数、检查一次通过率、按模型或版本的比较）只给命令行与以后的面板，不进模型上下文（`CHARTER.md` §8）。周报要不要把比率经主 Agent 的对话给人，与 M7 0.6 §3.12.4 写的做法不一致，是要人定的方向（§16 ②）。真实流水上复现旧报告靠依据行里的文件前缀加 `--basis`（F8）。
- 已有的数（用量、违规、额度、规则板状态、项目图历史、会话日志）各管各的；指标流水对它们只记数与引用。违规流水随 M4 的 G1 搬进会话所属项目的 `.llm/audit/`（M4 0.5 §2.4），仍是另一份流水，不并进指标流水（M4 0.5 §3.11 的裁定）。只有派遣决策流水 `decisions.jsonl` 被完全取代，它的写入行 `glm-hourness/workflow` 在最后一步退役，这一步做独立评审并排在 M3、M7、M4 动同一批文件之后（F11）。本流水的实施在自举之后（`d-dogfood-scope`）。M7 0.6 的「怎样算做完」不要求它存在：M7 的报告在那之前从图、检查与前进的记录、违规流水和用量流水算同样的数；M7 §3.16 留给本流水的一项核对（表里每类事件都在种类表里）算本流水的验收（§1.4 第 5 条、§7.3、§14）。
- 问人只按对话路径量（F2）：`propose_to_human` 与 `record_human_answer` 的两种事件（M3 附录 0.5 §3.12）给出问人的次数、字数、等待与人原样同意/补充/否掉的次数；卡片、跟随率、先想后看都不再有（plain-ui 0.6 已取消）。
- 量不到的照实写：人在系统外花的精力、读懂了没有、做出来的东西好不好用、跟了的推荐对不对，只能靠真实项目试用（`field-trial`）与人的反馈。
- 待人定：两件，都按四行写在 §16。① 这几件活怎样算做完（D1，必须问人的第 1 类，`ORCHESTRATION.md` §2.9.1），并进一页放行稿的末尾问（F3）；② 周报里的比率能不能经主 Agent 的对话给人（与 `CHARTER.md` §8 和 M7 0.6 §3.12.4 有关，方向性岔路）。

## 1. 需求与验收

### 1.1 来源

- 人 2026-10-29：「还有为了后续项目的优化，能不能做到所有指标都可以量化记录啊？」；批准时「指标能全记就全记下，b直接做」。
- 节点 `metrics` 正文（已批准的范围）：每个项目一份只追加的事件流水，固定格式，只记数与引用、不记对话正文；每一步的模型、token 与积分、用时、工具调用与被拦次数、派活、审查发现、返工、合入、失败与重试、问人的次数、人读了多少字、拍板等了多久、是否跟了推荐，都由 harness 写，模型写的数不算；晨报、周报、各种指标都从这一份算，同样的输入算出同样的数。量不到的照实写。
- `docs/CHARTER.md` §3.2 第 5 条（减负只量系统里看得到的数）、§8（只看曲线；指标不注入模型上下文；基线从早采集）、§7.1 条款 11（处处留痕，一处动作一个事实源，别处引用）。
- `design-context.md`：`d-main-agent-models`（主 Agent 选每个子 agent 的模型并写明理由，harness 只记录）、`d-one-main-agent`（报告在主 Agent 的对话里给人）、`d-auto-drive`、`d-chat-not-cards`（问人是对话里的一个方案，不出卡与选项）、「Two-level loop in the product」（两层循环）。
- 0.3 加的依据：`d-rules-in-repo`、`d-memory-scope`（运行时的东西进项目的 `.llm/`，用户级目录只留列定的几样；指标流水在项目里，`CHARTER.md` 0.7 §9 存放表）；`d-boards-as-hooks`、`d-script-timeout`（两块板的事件表多了脚本、超时、晚到的拦下，循环板的 `loop-done` 多了 `refused` 与 `unfinished`）；`d-main-agent-peak-exempt`（高峰模式不管主 Agent，也不管指标行）；`d-agent-examples`（本流水没有给主 Agent 的工具，没有要写的示范）；`d-dogfood-scope`（实施在自举之后）；`d-freeze-until-dogfood`（已放行的设计不接新请求，本设计对它们的请求只写成批注，§14）；节点 `metrics` 上 2026-10-30 的批注：循环板 0.5 与 0.6（事件表变化、`loop-read` 挪进项目、运行记录合入后写 `.llm/metrics/`）、规则板 0.9（多四种事件、库写入口按项目根找 `.llm/`）、M7 0.5（验收不再依赖本流水）、面板 0.7（`/graph-apply` 删去后写图的方）。

### 1.2 功能需求

| 编号 | 需求 |
| --- | --- |
| F1 | 每个项目一份只追加的事件流水，放在项目的 `.llm/` 下，固定格式，可轮换，不入库；用户级目录里没有指标文件；不属于任何项目的事件不写、只计数 |
| F2 | 每一步记：模型与 provider、token（输入、缓存读、缓存写、输出、推理）、积分与是否高峰、用时与首字用时、结束原因、本步发出的工具调用数；每次工具调用记：工具与类别、结果（成功、出错、被拦、被审批拒）、用时、结果大小；每次被拦记：规则、模式、拦截方，引用违规记录 |
| F3 | 任务各阶段的记录由 M7 的 `execute.*`、`operate.*` 事件给（本设计收下、不另造）：派发、计划、交回、审查、门禁、合入、重开、失败与重试，含主 Agent 选的模型与理由所在的节点序号 |
| F4 | 问人只按对话路径记：每次 `propose_to_human` 记一条、每次 `record_human_answer` 记一条（问了什么的引用、种类、字数、等待、人原样同意/补充/否掉）；另单独数 DSH 原生问题与审批 |
| F5 | 项目图的每一次写入记一条：节点、类型、操作、状态的前后、身份、是否转述；写入失败记错误码。写图的方现在是图工具（模型和 harness）、命令行和人自己的 `/graph-run`，都经同一个引擎，面板不写图（plain-ui 0.7） |
| F6 | 只有 harness 写；模型报的数不收；没有工具能写这份流水；模型的选择（选了哪个模型、哪个理由）作为「选择」记，不当量出来的数用 |
| F7 | 报告与比较从这份流水算；同样的输入得到逐字相同的输出（真实流水上也能复现）；能按 harness 版本、模型分组比较；报告的数由 harness 算，不经模型；给人的数分事实与打分，打分不进模型上下文 |
| F8 | 隐私：只记数与引用，不记对话正文、工具参数、文件内容、路径原文、命令全文、错误文字、凭证与请求头；人发的消息只记条数、字数与附件数，不记内容 |
| F9 | 写入失败不挡工作，能被发现并上报（不只在有人跑命令时）；记录跨重启保留；整天的文件不被悄悄删掉；事后能追到原因（`DEVELOPMENT.md` §1.1） |
| F10 | 已有的数（用量、违规、决策、项目图历史、额度、标定结果）盘点清楚，能并的并，不能并的只引用，不重复存一份当第二个事实源 |
| F11 | 写明量不到的，交给 `field-trial` 与人的反馈 |

### 1.3 非功能需求

- 开销：每次模型调用与工具调用多一次内存操作与一次追加写；不加锁等待、不阻塞流。一行至多 4 KiB。
- 体积：估计重度使用一天 0.5–1.5 MB（§5.3），一年数百 MB 以内。
- 两个包各自单独装上都能工作：只装 GLM 通道包时没有指标流水（没有写入者），GLM 包的行照常；只装编排层包时没有 `glm.*` 事件与积分。
- 激活期不抛错（`AGENTS.md`）；行健康上报（`DESIGN.md` §2.5）；不新增告警。
- 指标不注入模型上下文（`CHARTER.md` §8）：流水与报告里的「打分」只给人与命令行、面板看，不进每步投影、提醒或系统提示词；经主 Agent 对话的报告只用「事实」（F9、§7.3）。

### 1.4 验收条件（草稿，D1 由人定）

1. 指标行启用后，L3 探针的 GLM 场景与非 GLM 场景里，每次模型调用在 `<ws>/.llm/metrics/events-<日期>.jsonl` 恰好留下一条 `llm` 事件：provider、model、各类 token 与该次 `usage` 块相同，`ms` 大于 0，`fin` 与流的结束原因一致，`turn`、`step` 与 `agent/request` 给的一致；同一次调用在用量流水里的那一行 token 数相同。人在该会话里发的每条消息恰好留一条 `said`，`said` 的条数等于人发的消息数（不含 notice、runtime-context 与子会话继承的首条提示）。
2. 同一探针里，`tool` 事件的条数等于会话日志里 `tool/call` 事件的条数；被 guard 拦下的调用 `out` 为 `denied`，同一 `call` 有一条 `rule` 事件，它的 `ref` 等于违规流水里那一行的记录键（M4 §3.2 的 `recordKey`）。
3. L2：项目图引擎有三个写入入口：图工具（模型与 harness 的身份）、命令行 `npm run graph`、人自己的 `/graph-run`（plain-ui 0.7：`/graph-apply` 已随面板的写入删去，面板不写图）。每个入口一次成功的写入，为它追加的每一条历史各留一条 `graph` 事件，带节点、操作、状态前后、身份、是否转述；写入失败留一条带错误码的 `graph` 事件。静态检查：`src/` 里只有 `src/graph/engine.ts` 导入 `writeNodes`；`openEngine(` 的调用点清单写死在测试里（今天是 `src/graph/tools.ts`、`src/graph/run-control.ts`、`src/graph/cli.ts`，加上 plain-ui 实现删掉面板的写入之前还在的 `src/graph/panel-row.ts`），每个会写图的调用点都传了 `observe`，多出或少掉一处都失败。
4. L3（假的设计行）：一次 `propose_to_human` 与一次 `record_human_answer` 各留恰好一条事件（`design.proposal-shown`、`design.answer-recorded`），`answer` 取自调用参数，等待毫秒数等于两段会话事件 `time` 之差；一次放行写下 N+1 条图历史时，`design.answer-recorded` 仍只有一条（plain-ui 0.7 §5.6 的计数单位）；模块放行（M3 附录 0.5 §3.14）的那两条事件带模块 id。一次 `userQuestions.ask`（DSH 原生问题，非主 Agent）留 `ask` 与 `answer` 两条，`q` 相同。
5. 种类表与兄弟设计一致（F1，也是 M7 0.6 §3.16 留给本流水的那一项核对）：L2 对每个名字空间（`rules.*` 15 种、`loop-*` 11 种、`execute.*` 与 `operate.*` 23 种、`glm.*` 4 种、`design.*` 与 `git.*` 8 种）把测试里写死的种类清单（照各自那一节抄）与 `src/metrics/kinds/<名字空间>.ts` 逐个比对，缺一种或多一种都失败；再对每个种类按字段表造一条各字段取典型值的事件，经 `emitMetric` 写入后能读回、字段逐字相同；带一个未知键或一个超 32 项的数组的同一事件被整条拒收并计 `reject`。
6. 隐私：L2 性质测试，写入器拒收带未知键或字符串不合 id 形状的事件并计数；L3 扫描探针留下的指标文件，找不到探针自己的提示词、工具参数、文件内容、凭证文件与请求头里的任何 8 字符以上的片段，也找不到人发的消息正文。
7. 失败与自查：L2 把指标目录换成一个同名文件，模型流与工具调用的结果逐字不变，行健康为部分生效并写明原因；故障解除后排队的事件按序号写入；只有队列溢出时才有 `gap`，其中 `lost` 等于丢掉的条数。另造一份以半行加 NUL 字节结尾、且有一个写入者只写了 `start` 没有 `stop` 的旧文件后启动指标行，后台自查把那一行计为无法读取、把那个写入者报为「没有正常退出」，写进行健康与覆盖行。另造一个 `.git/info/exclude` 写不进的项目，`ensureIgnored` 抛错：`.llm/metrics/` 不被建出来，事件走同样的排队与重试，行健康写明原因，模型流与工具调用的结果仍逐字不变。
8. 确定性与复现：L2 用固定的事件文件算两次，输出逐字相同；把同一批行打乱顺序后输出仍相同；输出第一行写明文件、行范围、窗口、时区与计算版本。出一份报告之后往同一文件追加一条 `at` 落在窗口里的事件，按原依据行带 `--basis` 重跑，输出逐字相同；不带 `--basis` 时不同。
9. 比较：`npm run metrics -- compare --by v` 对含两个构建的夹具，按构建列出每步用时与 token 的中位数、每个任务的积分、原样同意率，以及每组的样本数。
10. 追查：`npm run metrics -- verify` 报出每个写入者缺的序号、链断的位置、没有正常退出的次数、流水开始之后项目图历史里有而流水里没有的条目、每个会话 `llm` 事件与用量流水条数不一致之处、文件清单（`.llm/metrics-manifest.jsonl`）里有而磁盘上没有且没有 `prune` 覆盖的文件、`start.host` 为 `cli` 却写了宿主专属种类的写入者；没有发现时退出码 0，有发现时 1。
11. 报告：`/hourness` 对本仓库的会话，派遣次数与拦截计数（事实）从指标流水算（L2 对夹具），并多一行覆盖范围（最早一条、今天几条、本进程丢了几条、没有项目可归的事件几条；最早一条晚于项目图历史最早一条时多写一句「图上有更早的记录，流水从 <日期> 起」，§5.5）；经对话给人的那部分不含任何「打分」（比率、比较）。
    M7 的报告层改读本流水之前（M7 0.6 §3.16：在此之前它从图、检查与前进的记录、违规流水和用量流水算同样的数），L2 对同一份夹具——一次运行的原始记录和照这次运行造出的事件流水——比两边的事实：几件派出、几件做完、几件在等人、哪次检查没过、拦截计数，逐项相同；不同的项在夹具报告里列出，改读的那一步不合入。
12. 并发：L3 两个进程同时往同一个项目流水各追加 5000 条，10000 行全部能解析，每个写入者的序号齐全；不通过时改用每个进程一份文件（§5.2 的退路），同一检查通过。
13. 一次性进程（F4）：L2 用一个子进程调 `appendEvents`（模拟规则板的 `checkCall`），项目由 `projectOf(dir)` 定位，调用后立即退出，项目流水里恰好多一条 `rules.check`；目录不在任何项目里时 `appendEvents` 返回 `written: 0` 与原因 `no-project`，不建任何目录。
14. 删文件（F7）：L2 删掉一天的文件（其中有一个写入者的全部行）后跑 `verify`，对着文件清单报出那个文件丢失、退出码 1；经 `prune` 删的不报，且 `prune` 事件里 `files`、`lines` 等于被删的。
15. 包：新行出厂 `disabled: true`；`npm run build`、`npm run preflight`、`npm test` 全绿；L3 启用该行真实启动无新错误；探针通过之后才在 bundle 里默认启用。
16. 体积：批次 L4 记一天真实使用的流水大小，写进 `docs/FACTS.md`；超过 5 MB 时在节点上批注并查原因。
17. 退役（F11）：`glm-hourness/workflow` 行退役之后，L3 带用户 profile 同形的覆盖层真实启动无新错误；不通过就停下交人（§12 末步）。
18. 存放（`d-rules-in-repo`、`d-memory-scope`）：L2 把数据目录服务指向一个临时的用户级目录，指标行启用、写完一轮事件与自查之后，用户级目录里没有任何以 `metrics` 开头的文件或目录；项目的 `.llm/` 里有 `metrics/`、`metrics-manifest.jsonl`、`metrics-key`，别无指标文件。发送方答不出项目的事件（`where` 没有 `dir`，或目录不在任何项目里）不落盘，行健康的「无项目的事件」按种类计数。
19. 高峰模式不管指标行（`d-main-agent-peak-exempt`）：L2 让 `glmHournessPeakMode` 假服务在高峰里报 `stop` 档，指标行照常写事件、自查照常跑，主 Agent 的工具调用与回话在有无指标行时逐字相同。
20. 每天一次的自查条目（F6）：L2 用假的循环板服务，`contribute` 返回的 `accepted` 含 `metrics.selfcheck`；`run('metrics.selfcheck', …)` 有发现时返回 `done` 并带 `tell`，没有发现时返回 `done` 不带 `tell`；循环板服务不在时行健康不降级，后台自查照跑。

### 1.5 让人少做了什么（question-27 B）

这份流水本身不减负，它让减负可以被量：人每周被问几次、每次读多少字、等多久、原样同意了几次、因人的决定返工几次，以前散在图历史与设计里，有的根本没有记（对话里问人的用时、DSH 原生问题与审批、主 Agent 在对话里写给人的字数、人自己发的消息）。以后改提示词、换模型、换问法，前后对照用的是同一份数据和同一套算式。人不需要读这份流水。

### 1.6 不做的事

- 不做新的面板或页面：报告仍是 `/hourness` 与 M7 的晨报、周报；面板上的指标页属于 M8。
- 不按指标自动调整任何行为（换模型、换问法、限流）：只记录与报告。
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
| 违规流水 | 今天是 `<projectHome>/audit/violations.jsonl`（`projectHome` 在 profile 里钉在本仓库的 `.llm`）；M4 的 G1 改为会话所属项目的 `.llm/audit/violations.jsonl`（M4 0.5 §2.4，`d-rules-in-repo`）。guard 行、图行、循环板与规则板的门都写它；M4 起还有跟进、申报、放行、作废的记录，规则板写的 `mode` 为 `record`、`late` 的记录 | 拦截与只记录（含影子）记录，带纠偏全文 | 保留，不并进指标流水（M4 0.5 §3.11 的裁定）：纠偏文字、M4 的标注（按行的 `recordKey`）与回归语料都靠它。指标流水的 `rule` 事件只记规则、模式、结果与 `ref`（那一行的 `recordKey`），拦截计数的口径与 M4 的 `classifyRecord` 一致（§7.2）。流水搬到哪里归 M4，指标流水只引用键，所以搬迁前后都对得上 |
| 派遣决策流水 | `<projectHome>/audit/decisions.jsonl`，workflow 行（`src/workflow/index.ts`） | 派遣类工具调用的等级（全是 L1）与从参数截的 120 字主题 | 被取代：`tool` 事件按类别 `dispatch` 记了同样的调用，还不记参数文字。M7 起派发的全貌在 `execute.dispatch`。晨报的「决策曲线」改从指标流水算（§7.3）；workflow 行在最后一步退役（§12 末步）；旧文件留在磁盘上不删，也不搬 |
| 项目图历史 | `docs/graph/nodes/*.json` 的 `history`，引擎写 | 每次写入的时刻、身份、操作、理由、转述原话 | 保留为节点状态与文字的事实源。`graph` 事件只记数与引用（节点 id、历史序号、修订号），两者不一致时以图为准，`verify` 报差。启用前的历史由 `backfill-graph` 一次补成事件（§7.5），让人的负担曲线从 2026-10-28 开始；图在 git 里，新克隆之后也能再补一次 |
| 额度流水、用量缺口 | `<userHome>/audit/quota.jsonl`、`usage-gaps.jsonl`（用户级，账号一级，M6 设计 §4.5、§6.2） | 账号的额度读数、删过的用量 | 保留，不进项目流水：它们属于账号。额度读取由循环板为某个项目的条目发起时，M6 另交一条 `glm.quota-read`（M6 0.5 §14.2），事件由发送方带上项目目录写进那个项目；发送方答不出项目时不写、只计数（§3.5）。读数本身已在 `quota.jsonl`，所以丢的只是「这次读取成不成功、花了多久」的计数 |
| 规则板的状态流水与命中计数 | 项目的 `.llm/rules/`（运行时的：流水、命中计数、心跳）与仓库的 `docs/rules/`（人定的规则，入 git）（规则板 0.10 §7.1，`d-rules-in-repo`） | 规则与等待单的状态 | 保留：那是规则板的状态存储。规则板另交 `rules.*`（15 种，规则板 0.10 §10.5），本设计收下（§4.2、F1）。规则板的 R7 晨报一节「按 `metrics` 的定案从指标流水算」，指标流水合入之前它自己从项目流水与违规流水算同样的数（规则板 0.10 §10.5） |
| 循环板的运行记录 | 项目的 `.llm/loops/runs.jsonl`（循环板 0.6 §9.1；指标流水合入之前）；变更记录 `.llm/loops/journal.jsonl`、被删任务 `removed-tasks.jsonl`、结论 `notes.jsonl` | 每次运行的 `loop-fired`、`loop-done` 等 11 种 | 指标流水合入之后，运行记录换成 `<项目根>/.llm/metrics/`，循环板只改 `src/loops/metrics.ts` 一个文件（循环板 0.6 §6.10、§17）；变更记录、被删任务的全文、结论仍归循环板，不进指标流水（`loop-task-delete` 只记 id） |
| M4 的压制计数、标注 | `<projectHome>/audit/suppressions.jsonl`、`labels.jsonl`（M4 0.5 §3.11、§2.4） | 每天的压制注释数；人对记录的判断 | 压制计数改为每天一条 `count` 事件；M4 0.5 把 `suppressions.jsonl` 留到指标行默认启用之后，由本设计的实施末步去掉（改 `src/env/suppressions.ts` 与晨报读它的一处，§12 第 10 步）；标注保留在 `labels.jsonl`（那是判断，不是测量） |
| M7 的检查与前进记录、派发与交回批注 | 项目的 `.llm/execute/`（`checks.jsonl`、`advances.jsonl` 等，M7 0.6 §2.1）；图上的批注 | 检查每条命令的日志路径与结论；派发次数、计划版本、问答计数 | 明细照旧在 M7 的记录与会话日志；`execute.*` 事件记数（§4.2，M7 0.6 §3.16）。M7 §3.12 的计数在本流水到位后改从这些事件算 |
| 标定结果 | `.llm/calibration-runs/<时间>/…/result.json` | 每次运行的完成、步数、积分、返工等 | 保留运行器自己的记分；运行目录是一个 git 仓库，指标流水自然落在它的 `ws/.llm/metrics/`，`result.json` 加一节用同一套算式算出的 `metrics`（§12 第 8 步） |
| 会话日志 | `~/.dsh/sessions/`，DSH 写 | 对话全文与事件 | 不动，是对话的事实源；指标事件带会话 id 与调用 id，可以回查 |
| 问人的跟随率、先想后看 | plain-ui 0.4 曾由项目图历史当场算 | 最近 10 次拍板里跟了几次推荐 | plain-ui 0.6 取消（§1.5、§11）：`d-chat-not-cards` 之后不再有卡片与推荐位置。问人改从 `design.proposal-shown`、`design.answer-recorded` 算（§7.2、F2） |

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
| 项目图引擎的观察者 | `src/graph/engine.ts` 的 `EngineOptions` 加 `observe`；`src/graph/index.ts`（图行）与 `src/graph/cli.ts` 传入 | 改 |
| guard 与图文件门禁交 `rule` 事件 | `src/guard/index.ts`、`src/guard/graph-files.ts`（M4 合入后改在 `installRuleGate` 一处）；记录键 `recordKey` 在 `src/guard/records.ts`（M4 先合入就用它的）；规则 `metrics-files-only`（行 `metrics`）经 M4 的 `installRuleGate` 安装，进 `src/guard/catalog.ts` 的 `GUARD_RULES`（影子，F20） | 改 |
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
- 防误写：新增代码规则 `metrics-files-only`（行 `metrics`），由指标行经 M4 的 `installRuleGate` 安装，登进 `src/guard/catalog.ts` 的 `GUARD_RULES`，规则板的只读目录随之列出（F20；规则板 0.10 §2.6 的代码规则表里已有这一行，写明「指标流水合入后登记」）。文件工具写到 `<root>/.llm/metrics/` 之下、或 shell 命令文本里出现 `.llm/metrics` 并带写入、删除或移动动作时记下。写在代码里的新门禁先影子（`CHARTER.md` 0.7 §6）：出厂模式为 `shadow`，走 M4 的 `PROMOTION` 阶梯转生效。它依赖 M4 的 `RuleMode` 与 `installRuleGate`，M4 的 G1 合入之前不装。在此之前与之后，链式摘要与文件清单都能发现误写与删除（§5.4、§5.5）。

### 3.5 没有项目的事件（F5，0.3 取消机器级流水）

有些事件的发送方答不出项目：循环板为某个条目发起的额度读取没带会话时的 `glm.quota-read`（M6 0.5 §14.2 把归属交给本设计定）、没有 `project` 字段的 `loop-contribution`（循环板 0.6 §6.10）、会话的目录不在任何项目里的事件。0.2 为它们设了一份用户级的机器级流水；`d-memory-scope` 与 `CHARTER.md` 0.7 §9 的用户级清单（登录凭证、设备号、人设、关于人的记忆、整个账号的额度与用量、插件配置）里没有指标流水，所以取消。循环板 0.6 对 `loop-read` 同样这样处理（评审 F52：写进 `last-step.json` 指向的项目，没有指向的项目就丢掉、只在行健康里提示一次）。

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
| `w` | 是 | 8 位十六进制 | 写入者 id：进程第一次写时随机生成；补录用 `bf-<提交前 7 位>` |
| `n` | 是 | 正整数 | 这个写入者在这份流水里的序号，从 1 起连续 |
| `h` | 是 | 12 位十六进制 | 链式摘要：`sha256(上一条的 h + 本行不含 h 的 JSON 文本)` 的前 12 位；写入者第一条的「上一条」是空串 |
| `v` | 是 | id | 交来这条事件的包的构建戳：`<包版本>+<提交前 7 位>`，构建时工作区有未提交改动再加 `.dirty`，没有 git 时提交写 `nogit`，读不到构建戳写 `<包版本>+unknown` |
| `by` | 是 | 枚举：`host`、`graph`、`guard`、`rules`、`loops`、`execute`、`operate`、`glm`、`design`、`bootstrap` | 交来这条事件的构件。`host` 是指标行自己观察的；其余是经服务交来的那一行。`verify` 用它加 `start.host` 认出伪造（§5.4、F21） |
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
| `rule`（`by: guard` 或 `graph`） | guard 框架里的代码规则一次判定不是放行（guard 行、图文件门禁、循环板与指标行自己的代码规则；M4 的 G1 合入后全部在 `installRuleGate` 一处）。规则板自己的判定不在这里，是 `rules.judged` | `call?`、`rule`、`mode`（`enforce`、`shadow`）、`effect`（`deny`、`shadow`）、`ref?`（违规流水那一行的 `recordKey`） |
| `followup`（`by: guard`） | M4 的记录器结算一次拦截之后模型下一步做了什么（M4 0.5 §3.3 的 `FollowupRecord`）。跟进的结果在拦截之后才知道，只追加的流水不能回头改 `rule`，所以单独一种 | `rule`、`denial`（被拦那一行的 `recordKey`）、`outcome`（`right-path`、`repeat`、`other`、`none`） |
| `request`（`by: guard`） | M4 的申报通道每走一步（`RequestRecord` 的各结局、`GrantRecord` 的使用、`GrantVoidRecord` 的作废，M4 0.5 §3.2、§3.11） | `rule`、`ref`（这一次申报的 id）、`step`（`asked`、`approved`、`declined`、`unclear`、`not-shown`、`not-client`、`closed`、`expired`、`used`、`voided`） |
| `approval` | DSH 审批的发起与结论 | `id`、`phase`（`asked`、`decided`）、`tool?`、`call?`、`outcome?`（`allowed-once`、`rejected`、`cancelled`、`unavailable`，F14） |
| `command` | 人发的斜杠命令开始与结束 | `cid`、`name`、`phase`（`run`、`done`）、`result?`（`success`、`error`） |
| `ask` | 一次 DSH 原生问题请求开始（子会话之外的普通会话与探针；主 Agent 出原生问题本身是要数的违规，M3 §3.10） | `q`、`qs`（问题数）、`opts`（选项总数）、`units`（问题与选项文字的字数）、`ref?` |
| `answer` | 这次原生问题请求结束 | `q`、`ms`、`end`（`answered`、`aborted`、`no-provider`、`timed-out`、`error`，F12）、`pick?` |
| `said` | 人往会话发一条消息（F10） | `units`（文本块的字数）、`attachments`（附件块数）、`source`（消息 `source.kind`） |
| `graph`（`by: graph`） | 一次写入追加的每条历史；一次写入失败。写入方是图工具（模型与 harness 的身份）、命令行 `npm run graph`、人自己的 `/graph-run`，都经同一个引擎（plain-ui 0.7：面板不写图） | `node`、`type`、`op`、`hi`（历史序号）、`rev`、`actor`（`human`、`llm`、`harness`）、`relay?`（是否带转述）、`from?`、`to?`、`err?`（失败的错误码）、`src?`（补录时为 `history`） |
| `report` | `/hourness` 生成一次报告（基础 hourness 行；M7 的报告用 `operate.report`） | `kind`（`status`）、`units`、`ms` |
| `count`（`by: guard`） | 每天一次的计数（第一个用户是 M4 的压制注释数） | `what`、`value`、`byKey?`（`map`：键是 id，值是整数，至多 32 项） |

#### 规则板 0.10 §10.5（`by: rules`，15 种）

0.8 的 11 种：`rules.judged`、`rules.session-summary`、`rules.ticket`、`rules.wake`、`rules.write`、`rules.proposal`、`rules.peak-mode`、`rules.recovery`、`rules.detector-run`、`rules.check`、`rules.health`；0.9 起多的 4 种：`rules.script`、`rules.late-verdict`、`rules.repo`、`rules.stale`。其中 `rules.check` 是接缝裁定「checkCall 写判定事件」要的那一条（`design-context.md`「Seam rulings」第 2 条），每一次 `checkCall` 都写、放行也写，M6 的 `gateOnRules` 不另写。`rules.late-verdict` 是超时之后晚到的拦下（`d-script-timeout`）。

#### 循环板 0.6 §6.10（`by: loops`，11 种）

`loop-fired`、`loop-done`、`loop-entry`、`loop-drift`、`loop-note`、`loop-read`、`loop-contribution`、`loop-duplicate`、`loop-holder`、`loop-handover`、`loop-task-delete`。0.5 起 `loop-done` 的 `outcome` 多 `refused`（带 `reason`，0.6 多一个 `not-in-checkout`）与 `unfinished`（脚本超时没跑完，`d-script-timeout`），`loop-entry` 的 `op` 多 `repin`、`external`、`adopt`。`loop-read` 写进 `last-step.json` 指向的项目（0.6），不再有机器一级的一份。

#### M7 0.6 §3.16（`by: execute` 或 `operate`，23 种）

`execute.` 开头 21 种：`dispatch`、`dispatch-refused`、`plan`、`ask`、`handback`、`review-depth`、`review`、`stop`、`check`、`advance`、`advance-refused`、`unchecked-advance`、`goal`、`tier`（M7 0.5 新增）、`completion-gate`、`acceptance-review`、`reconcile`、`loop-entry`、`loop-fallback`、`loop-contribute`、`peak-cap`；`operate.` 开头 2 种：`report`、`patrol`。主 Agent 选模型的理由：类别与文字不进流水，流水只记 `execute.dispatch` 的模型与 `whyRef`（理由所在的节点与历史序号），理由文字留在会话日志与图上的派发批注（M7 0.6 §3.16、§5）。

#### M6 0.5 §14.2（`by: glm`，4 种）

`glm.quota-read`、`glm.upstream-limit`、`glm.login-rejected`、`glm.peak-reminder`。积分、token 与每次调用的耗时已在用量流水里，GLM 包不重复交（M6 0.5 §14.2 末段），本设计第 3 步不再改 `src/glm-llm/zcode.ts`。

#### M3 附录 0.5 §3.12（`by: design`，8 种）

`design.proposal-shown`、`design.answer-recorded`、`design.answer-refused`、`design.holder-moved`、`design.rule-denied`、`design.bypass-refused`、`git.snapshot`、`git.snapshot-refused`。`design.answer-recorded` 一次 `record_human_answer` 调用一条（plain-ui 0.7 §5.6 的计数单位），模块放行带模块 id（M3 附录 0.5 §3.14）。`design.holder-moved` 记持有者记录建、换、删——主 Agent 是哪个会话由它认，本设计不再用 `session.main`（F2）；持有者记录自己在项目的 `.llm/`（M3 附录 0.5）。

#### 接管 0.4（`by: bootstrap`，1 种，本设计新答的一种）

`bootstrap.trial`：接管在试跑时每跑完一条命令交一条（接管 0.4 §2.4 请本设计定种类与字段，写明「没定之前不调」）。字段见 §4.5。这是 agent 的决定，可推翻（§15）。

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
| `rules.judged` | `rule:id`、`how:id`（执行方式：拦截、排队、只记录）、`tool:id`（原生工具名）、`ticket?:id`、`sub:bool`（是否子调用）、`signals:map`（判定用到的信号值）、`unread?:id[]`（值不是整数、布尔或 id 的信号名）、`ms:int` |
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

#### M6 0.5 §14.2

| 种类 | 正文字段 |
| --- | --- |
| `glm.quota-read` | `ok:bool`、`why?:id`（原因码）、`ms:int`、`by:id`（`command`、`service`）、`windows:map`（窗口名到已用百分比，四舍五入到整数）、`dropped:int`（丢弃的行数） |
| `glm.upstream-limit` | `code:id`、`hasReset:bool`（有没有恢复时刻） |
| `glm.login-rejected` | `path:id`、`status?:int`、`code?:id` |
| `glm.peak-reminder` | `window:id`（高峰时段的日期 `peakWindow`）、`mode:id`（`peakMode`，读不到时 `none`）、`note?:id`（`peakModeNote`） |

#### M3 附录 0.5 §3.12

| 种类 | 正文字段 |
| --- | --- |
| `design.proposal-shown` | `kind:id`、`number:int`、`goal:id`、`module?:id`、`pending:id`、`attach?:id`（前缀）、`units:int`（`text` 的码点数）、`again:bool`（是否再给人看一次） |
| `design.answer-recorded` | `kind:id`、`answer:id`（`agree`、`add`、`reject`，认法在 `src/shared/answer-marks.ts`）、`outcome:id`、`goal:id`、`module?:id`、`pending:id`、`ms:int`（从提议到含第一段原话的人的消息）、`units:int`（原话的码点数）、`noted:bool`（前一条主 Agent 的消息里有没有「我记成」） |
| `design.answer-refused` | `kind:id`、`code:id` |
| `design.holder-moved` | `how:id`（`wish`、`here`、`takeover`、`unreadable`、`off`）、`from?:id`、`to?:id` |
| `design.rule-denied` | `rule:id`、`tool:id`、`sessionKind:id` |
| `design.bypass-refused` | `rule:id`、`sessionKind:id`、`goal:id`、`from:id`、`to:id` |
| `git.snapshot` | `class:id`、`saved:map`（`S`、`W` 有无，`L_way`、`L_clean`、`L_wt` 的个数与字节数）、`tagged:bool`、`ignored:int`、`ignoredBytes:int`、`ms:int` |
| `git.snapshot-refused` | `code:id` |

#### 接管 0.4

| 种类 | 正文字段 |
| --- | --- |
| `bootstrap.trial` | `cmd:id`（命令的第一个词，口径同 §4.3）、`exit?:int`、`ms:int`、`end:id`（`done`、`timeout`、`refused`、`error`） |

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

`appendEvents` 按 `projectOf(dir)` 定位项目（规则板 0.10 §10.5 要的就是「按 §7.3 的项目根定位，不再用 `userDataHome()`」）。`projectOf` 返回 `undefined` 时不写任何东西，返回 `{written: 0, rejected: 0, error: 'no-project'}`，也不建目录。有项目就开一个 `host: 'cli'` 的写入者，逐条 `record`，`await close()`，返回计数。写入失败（`ensureIgnored` 抛错、目录写不进）时在 2 秒预算内重试一次，仍失败就返回 `error`，不抛错。规则板与循环板之外的脚本在 DSH 之外只调它，并 `await` 它的结果再退出；调用方对 `error` 的处理是自己的事（规则板 0.10：写失败不影响判定，每个宿主进程告警一次）。宿主里照旧经服务的 `emit`（不等 I/O，队列与重试在常驻进程里）。

### 5.3 文件、大小与删除（F7）

- 一天一个文件，按事件 `at` 的 UTC 日期命名。没有改名、没有锁，多个写入者跨过午夜也不冲突。
- 体积估计：一条 250–450 字节。本机用量流水 2026-10-27 前后两天约 1080 次模型调用，按每天 600 次模型调用、同样多的工具调用、另有几百条其他事件算，约 0.5 MB/天；并行派发多个 worker 的日子按 3 倍算约 1.5 MB/天；一年 200–550 MB。
- 保留：写入器从不删除、不改写、不压缩。`/hourness` 的覆盖行与 `verify` 写出总大小。
- 删旧文件只有人能做，经 `npm run metrics -- prune --before <日期>`：先往项目流水写一条 `prune {before, files, lines}`，再删那些文件。不提供给主 Agent 的工具或提示；主 Agent 按 `d-main-agent-shell` 能用 shell，所以 `metrics-files-only` 的 shell 判法把删除与移动也算进去（`Remove-Item`、`rm`、`del`、`mv`、`Move-Item`、`git clean` 带 `-x`），影子期记下、转生效后拦下。
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

桌面版、headless（探针与标定）、命令行（`npm run graph`、`npm run metrics`、库写入口）都可能同时写同一个项目。每个进程是一个写入者，有自己的 `w` 与序号，互不协调，不用锁。

同一个文件的并发追加：每行一次 `appendFile`（Node 以追加方式打开，libuv 在 Windows 上用 `FILE_APPEND_DATA`），一行至多 4 KiB。〔推断〕本机 NTFS 上这样的追加不会交错。验收第 12 条用 L3 场景 `metrics-concurrent` 核实（两个进程各写 5000 条）。不通过时的退路已经定下：文件名改为每个写入者一份 `events-YYYY-MM-DD-<w>.jsonl`；读取从第一天起就按 `events-*.jsonl` 取文件，换退路只改写入器与文件清单的文件名规则。项目放在同步盘（OneDrive 等）里时，同步程序可能短暂占住文件，追加得到 `EBUSY` 或 `EPERM`，走 §5.1 第 5 步的重试。

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
| `ctx.get('glmHournessPricing')` | 每次写 `llm` 时读，形状检查同 `/hourness` | `src/shared/pricing.ts:20–35`（本仓库契约，`ORCHESTRATION.md` §11.3） |

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

`emitMetric` 在每次调用时 `ctx.get`（不需要 inject，指标行晚激活或没装都不影响调用方，`src/shared/pricing.ts:32` 的同一做法）。`v` 与 `by` 由调用方所在的包填：公共库编进两个包各自的 `dist/`，`src/shared/build-info.ts` 读本包的 `dist/build-info.json`。`tagQuestion` 删去（F2）：问人不再经卡片构造打标签。

| 发送方 | 名字空间 | 何时 | 现在有没有这段代码 |
| --- | --- | --- | --- |
| guard 行 `src/guard/index.ts` | `rule`（`by: guard`） | 写违规流水的同一处，拦截与影子记录都交；`ref` 是那一行文本的 `recordKey`（先序列化，再用同一份文本写流水和算键）。`recordKey` 按 M4 §3.2 的定义；M4 没合入时由本设计第 3 步加在 `src/guard/records.ts`，M4 沿用 | 有，本设计改 |
| 图文件门禁 `src/guard/graph-files.ts` | `rule`（`by: graph`） | 拒绝时 | 有，本设计改；M4 的 G1 合入后两处都并进 `installRuleGate` 一处 |
| 项目图引擎的各个调用点 | `graph`（`by: graph`） | 见 §6.3 | 有，本设计改 |
| hourness 行 `src/report/index.ts` | `report`（`by: host`） | 每次 `/hourness` | 有，本设计改 |
| M4 的 `installRuleGate`、跟进记录器、申报通道（`src/guard/metrics.ts` 的 `emitGuardMetric`） | `rule`、`followup`、`request`；`count`（压制注释数，`src/env/metrics.ts`） | M4 0.5 §3.11：每写一条拒绝、影子记录、`FollowupRecord`、`RequestRecord`、`GrantRecord`、`GrantVoidRecord` 之后；E4 每天一条压制计数 | M4 实现时 |
| 规则板（`src/rules/metrics.ts`） | `rules.*`（15 种，`by: rules`） | 规则板 0.10 §10.5 的各时刻；DSH 之外经 `appendEvents`（§5.2） | 规则板实现时 |
| 循环板（`src/loops/metrics.ts`） | `loop-*`（11 种，`by: loops`） | 循环板 0.6 §6.10 的各时刻；指标流水合入之前写 `.llm/loops/runs.jsonl`，合入时只改这一个文件 | 循环板实现时 |
| M7 的执行行与运维行（`src/execute/metrics.ts`） | `execute.*`、`operate.*`（23 种，`by: execute`/`operate`） | M7 0.6 §3.16 的各时刻 | M7 实现时（骨架里出口什么都不做） |
| GLM 通道（`src/glm-prompt/peak-reminder.ts`、`src/glm-llm/*` 的适配器、`glm-login` 行） | `glm.*`（4 种，`by: glm`） | M6 0.5 §14.2 的各时刻；额度读取为某个项目的条目发起时带那个项目的目录（§3.5） | M6 实现时 |
| M3 的设计行 `src/design/metrics.ts` | `design.*`、`git.*`（8 种，`by: design`） | M3 附录 0.5 §3.12 的各时刻 | M3 实现时 |
| 接管（`src/bootstrap/`） | `bootstrap.trial`（`by: bootstrap`） | 试跑每跑完一条命令 | 接管实现时 |

兄弟各行只有一个出口 `emitMetric`（`src/<包>/metrics.ts`），接口到位之前什么都不做，事实照旧在各自的流水里（规则板 0.10 §10.5、M3 附录 0.5 §3.12、M7 0.6 §3.16、M6 0.5 §14.2 都这样写）。`emitMetric` 自带有上限的队列与 `gap`（§5.1），调用方不必另记丢失。M7 0.6 §3.16 写明「指标流水的设计若自己带缓冲与重放，这一段（`<exec>/metrics-gaps.jsonl` 与行健康里的丢失条数）照它改，只改 `src/execute/metrics.ts`」，所以这里不需要对 M7 的设计提请求，指标行默认启用的那一步（§12 第 6 步）顺手去掉那个文件。只装 GLM 通道包时没有服务，`emitMetric` 什么也不做，GLM 的行照常。

违规（M7 的五条 worker 规则与主干前进的核对、规则板的拦截）照旧进违规流水（M7 0.6 §3.16 与规则板 0.10 §10.5 都把「要不要同时进指标流水」交给本设计）：本设计的答案是 guard 框架里的代码规则同时交一条 `rule`（`ref` 指向那一行），规则板的拦截同时交 `rules.judged`（规则板自己的事件，不再另交 `rule`，免得一次拦截在流水里算两次）；M7 的门经 `installRuleGate` 之后自然交 `rule`（M4 0.5 §3.1、M7 0.6 §18.2 的安排）。

### 6.3 项目图引擎

`EngineOptions` 加一个可选的 `observe(note: EngineNote): void`。引擎在 `commit` 里 `writeNodes` 成功之后（`src/graph/engine.ts:205`）对这次写入追加的每条历史各给一条，失败的返回路径给一条带错误码的；`observe` 抛错被引擎接住，不影响返回值。映射到事件的纯函数在 `src/graph/metrics-events.ts`：只映射节点、类型、操作、历史序号、修订号、身份、是否转述、状态前后（`graph` 事件的字段，§4.2）。plain-ui 0.6 取消了跟随率与计数拍板（§2 表末行、F2），所以不再有 `followed`、`counted`、`units` 的共用约定，`src/graph/inertia.ts` 不存在。

引擎的写入方有三个，都经同一个 `openEngine`（plain-ui 0.7 对本设计的说明，其 §14 第 14 条；面板不写图，`/graph-apply` 随面板的写入删去）：

| 写入方 | 代码里的调用点 | 身份 | 怎样交事件 |
| --- | --- | --- | --- |
| 图工具（模型与 harness） | `src/graph/tools.ts`（`openEngine(await graphDir(…))`），图行 | `llm`、`harness` | 传 `note => emitMetric(ctx, …, {dir: 图目录})` |
| 人自己的 `/graph-run` | `src/graph/run-control.ts`，宿主里的斜杠命令 | `human` | 同上 |
| 命令行 `npm run graph` | `src/graph/cli.ts` | 命令行固定的身份 | 自己开一个 `host: 'cli'` 的写入者传入，退出前 `await close()` |

今天 `src/graph/panel-row.ts` 还有第四个调用点（`/graph-apply`，行 `glm-hourness/graph-panel`）；plain-ui 的实现把它连同那一行删掉之前，它也传 `observe`，删掉之后调用点清单少一处（验收第 3 条的静态检查按清单对，多出或少掉都失败，所以谁加了第五个写入方，测试先失败）。项目根按图目录算（§3.3 第 6 条）；图目录不在任何项目里（`projectOf` 为 `undefined`）时事件只计数。

### 6.4 后台自查（F6）

指标行激活、第一次写成功之后，在后台对每个已写过的 `dest` 跑一次 `checkLog`（§5.4），范围是前一天与当天的文件；只读，用 `setTimeout(...).unref()` 排到空闲，不阻塞任何一步。结果进行健康（「上次有 N 个进程没有正常退出，缺 M 行，链断 K 处，文件丢失 J 个」）与 `/hourness` 的覆盖行。这样崩溃、缺行、链断、整天文件被删，人与主 Agent 在下一次会话里就看得到，不用等谁想起来跑命令行。自查读两天的文件（一天约 0.5–1.5 MB），不是子 agent 也不是重活，高峰模式的任何一档都不管它（`d-main-agent-peak-exempt`）。

另有一条每天一次的自查，走循环板：指标行经 `glmHournessLoops.contribute`（循环板 0.6 §3.1 的服务）交一份贡献，名字空间 `metrics`（循环板 §3.2：名字空间只属于第一个交它的来源，`metrics` 没有被占）：

- 动作一个：`{id: 'metrics.selfcheck', title: '检查指标记录有没有缺行'}`；`run('metrics.selfcheck', event)` 对 `event` 给出的项目跑同一个 `checkLog`，没有发现返回 `{outcome: 'done'}`（循环板记 `ran`，不叫醒任何人），有发现返回 `{outcome: 'done', tell: <一句话>}`，由循环板交给主 Agent（`reported`）；读不了项目返回 `{outcome: 'skipped', reason}`。
- 条目一个（循环板 0.6 §2.1 的 `LoopEntryDefinition`）：`id: 'metrics.selfcheck'`、`title: '检查指标记录'`、`why: '每天查一遍指标记录有没有缺行、链断或被删，有就告诉主 Agent'`、`when: {kind: 'daily', time: '10:00'}`（宿主的系统时区）、`action: {kind: 'harness', action: 'metrics.selfcheck'}`、`basis: '依据指标记录的链式摘要与文件清单'`。页面显示为编排层带来的、只能看（`d-defaults-readonly`、`d-rules-visible`）。它是插件交来的数据，不是脚本或检查命令，所以不走人加条目的同意路径（循环板 0.6 §3.2：`script` 与 `check` 不收，`harness` 动作收）。
- 循环板没装或没启用时，退路是上面的后台自查，只是没有每天固定的那一次。循环板 0.6 §3.3 的「编排层各行交来的」表里还没有 `glm-hourness/metrics` 这一行，写成对循环板的一条请求（§14，等 dogfood 之后）；表里没有不影响收下，校验只看名字空间。

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
| 规则板与循环板的执行（晨报与周报各有一节） | 脚本规则与脚本条目跑了几次、结果各几次（含超时 `timeout`、`unfinished`）、晚到的拦下几次、仓库规则文件被规则板以外改过几次；7 天里超时 3 次以上的规则或条目（提议修的单子） | F | `rules.script`、`rules.late-verdict`、`rules.repo`、`loop-done`（`outcome` 为 `unfinished`、`refused`）。「4 周没触发」的两张单子由两块板的服务（`staleEntries`）算，不在这里重算，`rules.stale` 只记它们被列出了几条（规则板 0.10 §10.5、循环板 0.6 §6.11） |
| 问人 | 次数、DSH 原生问题数、审批数（都是计数） | F | `design.proposal-shown` 条数；`ask`、`approval` |
| 每步 | 每步 token 与积分（中位数）、用时、首字用时（中位数、最长）、结束原因分布 | S | 带 `turn`、`step`、不带 `purpose` 的 `llm`，按模型分组 |
| 工具 | 每步工具调用数、结果分布、被拦率、按类别的出错率、返工次数 | S | `tool` 按 `(sid,turn,step)` 归到步；被拦率 = `denied`/全部；返工 = 同一 `target` 的第二次成功写入，且两次之间同一会话有过 `shell` 调用 |
| 拦截（计数） | 按规则与模式的拦截次数；排队、只记录（含影子）单列，不算拦截；晚到的拦下另列一行 | F | 口径同 M4 的 `classifyRecord`（M4 0.5 §3.2）：`rule` 的 `effect` 为 `deny`、`rules.judged` 的 `how` 是拦截、`rules.late-verdict` 的拦下（另列）算拦截；`rule` 的 `effect` 为 `shadow`、`rules.judged` 的排队与只记录单列。这样 `/hourness` 从流水算的拦截数和 M4 从违规流水算的对得上 |
| 拦截（打分） | 拦截后下一步走对的比例（有 M4 跟进时） | S | `followup` 事件的 `outcome`，分母不含 `none`（M4 0.5 §3.2 的口径：「没有下一步」不进分母） |
| 积分 | 按模型、按角色、高峰占比 | S | `llm` 的 `credits`、`peak`；角色由会话 id 与 `execute.dispatch` 的 `child`、`role` 连接，主 Agent 会话由 `design.holder-moved` 得到（F2），其余「其他」 |
| 任务（打分） | 每个任务的尝试次数、第一次派发到合入的时长（DORA 前置）、门禁一次通过率、审查轮数与挡路发现数、返工率、失败与重试按码 | S | `execute.*`；返工是 `graph` 事件里任务从 `done` 回到 `doing` |
| 问人（打分） | 每次要读的字数、等待时长（中位数、最长）、原样同意/补充/否掉各占几成 | S | 字数 = `design.proposal-shown` 的 `units` 之和 + 主 Agent 会话的 `llm.text` 之和；等待 = `design.answer-recorded` 的毫秒数；三类按 `answer` 分（`agree`、`add`、`reject`），按 `kind`（`question`、`confirm`、`release`）分组 |

问人的次数口径（F2）：次数 = `design.proposal-shown` 条数（`confirm`、`release` 也在内，它们不写图但写这条事件，所以数得到）；原样同意率只按 `record_human_answer` 的调用（`design.answer-recorded`，一次调用一条），不从图历史数（一次放行写下 N+1 条带「同意」的历史，plain-ui 0.7 §5.6）；模块放行（M3 附录 0.5 §3.14）的 `design.proposal-shown` 与 `design.answer-recorded` 带 `module`，按模块分组时用它。

### 7.3 报告怎样改用它

- `/hourness`（`src/report/index.ts`、`src/workflow/morning-report.ts`）：报告的项目是调用会话的项目根（`invocation.agent.session.header.cwd`，commands:379–385）。它的输出经主 Agent 的对话给人（`d-one-main-agent`），所以只用 `factsFor`（F9）：派遣次数、拦截计数、几件做完/在等人、哪次检查没过、今天的用量计数、覆盖范围（末尾一行「记录：最早 <日期>，今天 <N> 条，本进程丢了 <K> 条（<原因>）；上次自查 <结果>」）；「面板」一节照旧读用户级用量流水，标题写明「本机全部项目」。不含任何比率与比较。读不到指标流水时（行没启用、`projectOf` 为 `undefined`）写明原因，其余照旧。生成之后交一条 `report` 事件。
- M7 的四答晨报、人的负担与质量对照、DORA（M7 §3.10、§3.12、§3.13）：事实（计数、哪件做完、哪件没过）由 `factsFor` 算，经主 Agent 给人；打分（比率、比较、按模型或版本）不进主 Agent 的对话，只给命令行与 M8（F9）。M7 0.6 §3.12.3、§3.12.4 写的周报却把人的负担、人怎么回的、质量对照这些比率放进 `hourness_report` 的结果（`hourness_report` 是主 Agent 的工具，结果进模型上下文，M7 写「数字由 harness 算，模型只转述」）。这与本条分界、与 `CHARTER.md` §8「指标不注入模型上下文」不一致，M7 0.5 评审 R4-N10 已指明按方向性岔路问人。本设计不替人定，写成 §16 ②。人定之前按本节的分界实现：对话里的周报只带事实，比率走命令行与面板；人定了，范围怎么放宽见 §16 ② 的推荐。M7 0.6 已放行，它的周报怎样改写成对 M7 的请求（§14），等 dogfood 之后。
- plain-ui：报告里的原样同意率从 `design.answer-recorded` 算，属打分，面板显示（M8），不经主 Agent 的对话（plain-ui 0.7 §11 也写明面板不显示这个比例、由流水与周报给；0.8 沿用）。

### 7.4 比较版本

`compare(events, by, window, basis?)`，`by` 取 `v`（构建）、`model`、`host`、`role`（不再有 `pres`，F2）。每组列同一套打分指标与样本数，不做显著性检验：用户只有一人，样本小，只看走向（`CHARTER.md` §8）。compare 属打分，只给命令行与 M8。「同样的数据上比版本」靠只追加：同一段真实使用里按 `v` 分组；或新代码对旧流水重算，要复现某一份旧报告就检出那时的提交、用它依据行里的文件前缀带 `--basis` 重跑（§7.5、F8），输出逐字相同。

### 7.5 命令行

`npm run metrics -- <子命令> [--project <目录>] [--from <ISO>] [--to <ISO>] [--tz <±HH:MM>] [--basis '<文件>:<行数>[,…]'] [--json]`（`scripts/metrics/cli.ts` 调 `src/metrics/cli.ts`，写法同 `npm run graph`）：

| 子命令 | 做什么 | 写不写流水 |
| --- | --- | --- |
| `summary` | §7.2 的全部指标（事实加打分；给编排方与人用命令行时看） | 不写 |
| `verify` | §5.4 的核对；另外三项对账：图历史里有而流水里没有的条目；每个会话的 `llm` 事件数与用量流水同一会话的行数；文件清单与磁盘。没有发现退出码 0，有发现 1 | 不写 |
| `compare --by <键>` | §7.4 | 不写 |
| `prune --before <日期>` | §5.3：先写 `prune` 事件再删旧文件；只给人用 | 写 |
| `backfill-graph` | 读图，把早于流水里第一条实时 `graph` 事件、且 `(node, hi)` 还没有的历史条目补成 `graph` 事件，`src: 'history'`，写入者 `bf-<HEAD 前 7 位>`。重跑不重复。打印补了几条 | 写 |

参数校验：`--from`、`--to` 必须能被 `Date.parse` 解析；`--tz` 匹配 `^[+-]\d{2}:\d{2}$`；`--project` 必须是存在的目录且 `projectOf` 有值；`--basis` 的每一项文件名匹配 `^events-\d{4}-\d{2}-\d{2}(-[0-9a-f]{8})?\.jsonl$`、行数为正整数；`--before` 是日期。不合格退出码 2，打印用法。

## 8. 量不到的

这些只能靠真实项目里的试用（`dogfood`，之后 `field-trial`）与人的反馈，流水里没有，报告里照实写「量不到」：

- 人在系统外花的精力：读代码、想问题、在别处查资料、和别人商量的时间。流水只有人在 DSH 里发消息、点命令的时刻。
- 人读懂了没有：字数与等待时长只是代理量。等得久可能是难，也可能是人走开了。
- 跟了的推荐对不对：流水能给出「拍板之后 7 天内因这个决定返工」的次数（M7 §3.12.3），给不出没返工的决定是不是好决定。
- 做出来的东西好不好用、合不合人的本意：门禁与审查只查写下来的验收条件。
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
| 时钟回拨 | `verify` 报「时钟回拨」 | 报告按 `at` 排序，同一写入者内看 `n` | `verify` |
| 文件过大（一天超过 64 MiB） | 行健康注明 | 照写；查失控的循环 | 文件大小 |
| 读到更新格式的行、不认识的种类 | 读取计数 | 不进计算，其余照算；报告写明 | 依据行之后的「看不懂 N 行」 |
| 图引擎的观察者抛错 | 引擎接住 | 写入结果不变 | 少一条 `graph`，`verify` 对账报出 |
| 只装 GLM 通道包 | 没有服务 | `emitMetric` 不做事 | 不需要 |
| 命令行写入者伪造宿主事件 | `verify`（§5.4、F21）：`start.host` 为 `cli` 却写了宿主专属种类 | 报出；防不住有意伪造 | `verify` |
| `workflow` 行退役后启动报错 | §12 末步的 L3 预检 | 不合入；停下交人（profile 改动是必须问人的第 2 类） | 预检日志 |

### 9.3 不可逆的地方与预防

- 写入器只追加：不删除、不改写、不截断（半行用补换行处理，不截掉）。轮换靠按日期取新文件名，没有改名。
- 只写 `<root>/.llm/metrics/`、`<root>/.llm/metrics-manifest.jsonl`、`<root>/.llm/metrics-key`，以及第一次建 `.llm/` 之前经 `ensureIgnored` 往 `.git/info/exclude` 追加的一行 `.llm/`（那个文件属于这份克隆、不入库，函数只追加、已有等价行不重复，不碰受版本控制的文件）。用户级目录里不写任何指标文件。`.gitignore` 以 `wx` 写，已有的文件不覆盖。
- 删旧文件只有人能做，经 `prune`：先写 `prune` 事件再删，文件清单对账能发现未经 `prune` 的删除（§5.3、§5.5、F7）。主 Agent 没有删它的工具；`metrics-files-only` 的删除与移动判法在影子期记下、转生效后拦下。
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
| 只有 harness 写 | 写入器是唯一的写文件代码；服务不注册工具；代码规则 `metrics-files-only` 记下（以后拦下）工具与 shell 的写、删、移；链式摘要与文件清单发现误写与删除 | 写的路径只有一条，堵在这里最省；工具层的门禁防的是 agent |
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
| 引擎的调用点 | `src/graph/tools.ts`、`run-control.ts`、`cli.ts`、`panel-row.ts` 里的 `openEngine(` | 〔实读〕；`writeNodes` 只在 `engine.ts:205` 调用 |
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

## 12. 实施分解

实施在自举之后，由 DSH 里的主 Agent 做（`d-dogfood-scope`），设计先过两层循环的放行；不在自举关键路径上（M7 0.6 的骨架在它不在时各行自己写项目 `.llm/` 下的记录）。每一步一个提交（`AGENTS.md` 第 7 条），文档与行为同一批（`docs/ORCHESTRATION.md` 新增 §10.6「指标流水」并改 §10.1 的来源列、`docs/DESIGN.md` §2.4、§2.4a、§2.5、`docs/HANDOFF.md` 随各步改到当时的样子）。新行出厂 `disabled: true`；先 `npm run build`、`npm run preflight`、`npm test` 三道全绿，涉及 loader 组合的步先在临时 profile 做 headless 沙盒验证，再动主 profile（`AGENTS.md` 强制流程第 2、3 条）。

第 1 步开始前，把 §4.5 对着各兄弟设计当时的现行版本核一遍，差异记在节点批注里再动手（F18；邻居在对齐轮之后还会出新稿）。

| 步 | 内容 | 主要文件 | 验证 | 档位 | 独立评审 |
| --- | --- | --- | --- | --- | --- |
| 1 | 基础：字段表与校验（含 §4.5 的各名字空间表）、写入器、读取与核对、字数、构建戳；项目根不新建，导入 `src/data/project-root.ts` | `src/metrics/{schema,writer,read}.ts`、`src/metrics/kinds/*.ts`、`src/shared/{text-units,build-info,metrics}.ts`、`scripts/build-info.mjs`、`package.json`、`scripts/preflight-bundle.mjs`（检查构建戳）、`tests/metrics-{schema,writer,read}.spec.ts` | L1、L2（验收 5 的 L2 部分、6、7、8、13） | 高 | 是：字段表是隐私的唯一关口 |
| 2 | 指标行：接缝、服务、行健康、行登记（`disabled: true`）、每天一次的自查条目（循环板在时）；探针场景 | `src/metrics/{index,observe}.ts`、`src/shared/tool-names.ts`、`src/shared/health.ts`、`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`tests/metrics-row.spec.ts`、`tests/fake-rc3.ts`（只补 rc.3 真宿主会给的信号）、`tests/contracts.spec.ts`、`scripts/probe/` | L2；L3 `metrics`、`metrics-concurrent`（验收 1、2、4、12、18、19、20） | 高 | 否 |
| 3 | 现有代码交事件：guard 与图文件门禁（`rule`）、项目图引擎的三个写入方（`observe`）、`/hourness` 的 `report`；`recordKey` 在 M4 的 G1 未合入时先建在 `src/guard/records.ts` | `src/guard/{index,graph-files,records}.ts`、`src/graph/{engine,tools,run-control,cli,index}.ts`、`src/graph/metrics-events.ts`、`src/report/index.ts` 与对应测试 | L2；L3（guard 拦截后的 `rule` 与 `ref`，验收 2、3） | 高 | 是：碰 guard 与图引擎的审计（`DEVELOPMENT.md` §1.1） |
| 4 | 计算与命令行：`summary`、`verify`、`compare`、`backfill-graph`、`prune` | `src/metrics/{calc,cli}.ts`、`scripts/metrics/cli.ts`、`package.json`、`tests/metrics-calc.spec.ts`、`tests/fixtures/metrics/` | L2（验收 8、9、10、14） | 高 | 否 |
| 5 | 报告改读指标流水，加覆盖行 | `src/workflow/morning-report.ts`、`src/report/index.ts`、`tests/hourness.spec.ts` | L2（验收 11）；L3 探针里的 `/hourness` | 高 | 否 |
| 6 | 接线与启用：兄弟各行已合入的 `src/<包>/metrics.ts` 出口接到服务（各只改自己那一个文件：循环板的 `src/loops/metrics.ts` 从写 `.llm/loops/runs.jsonl` 换成写指标流水，M7 的 `src/execute/metrics.ts` 去掉 `metrics-gaps.jsonl`）；bundle 里指标行改为默认启用；在本仓库跑一次 `backfill-graph`，结果批注在 `metrics` 节点上 | `packages/hourness/cordis.patch.yml`，加兄弟各行的 `metrics.ts` | L3 全量探针；合入前关桌面版（`DEVELOPMENT.md` §1.1 末段） | 标准 | 否 |
| 7 | 代码规则 `metrics-files-only`（影子），经 `installRuleGate` 安装，登进 `GUARD_RULES`。等 M4 的 G1 合入 | `src/metrics/rules.ts`、`src/guard/catalog.ts` | L2、L3 | 高 | 是：新的代码规则 |
| 8 | 练习题运行器：每次运行的 `result.json` 加 `metrics` 一节（同一套算式） | `scripts/calibrate/run-calibrate.mjs` | L2（纯函数部分）；跑一次两题两档（积分预先授权，`norm-decision-tiers`） | 标准 | 否 |
| 9 | 批次 L4：桌面版重启，用一天；`verify` 干净；一天的大小写进 `docs/FACTS.md`；`/hourness` 的样子 | `docs/FACTS.md`、`docs/HANDOFF.md` | L4（验收 15、16 的真机部分） | 标准 | 否 |
| 10 | 退役：`workflow` 行先做 L3 预检（临时 profile 带给 `glm-hourness/workflow` 的 `home` 覆盖、bundle 里没有这一行，真实启动无新错误），通过后删 `src/workflow/index.ts` 与 `decisions.ts`，`morning-report.ts` 移到 `src/report/`，删 patch 行、目录表、行健康与契约测试里的这一行；同批去掉 M4 的 `suppressions.jsonl`（`src/env/suppressions.ts` 与晨报读它的一处，M4 0.5 §3.11 约定由本设计的实施做） | 上述文件、`tests/workflow.spec.ts`、`src/env/suppressions.ts` | L3 预检；L1–L3（验收 17） | 标准 | 是（F11）；预检不过就停下交人 |

先后：1 → 2 → 3 与 4 可以并行（3 改 guard、图、报告的文件，4 只在 `src/metrics/` 与命令行）→ 5 → 6 → 7 与 8 可以并行（7 等 M4 的 G1）→ 9 → 10。第 10 步排在 M3 第 10 步、M7 的 E4 与 P2、M4 的 G1 到 E4 合入之后（它们改同一批文件，F11），谁后合入谁在自己的提交里并掉冲突的行。M3、M4、M7、规则板、循环板各自实现时按 §4.2、§4.5 与 §6.2 交事件，不在本特性的步里。

## 13. 验证

- L2：字段表的性质测试（随机生成带未知键、带空白或中文的字符串、超长行、超 32 项的数组与映射，全部拒收）；写入器的故障注入（注入的文件系统依次给出 `EACCES`、`ENOSPC`、`EBUSY`、目录是文件、`ensureIgnored` 抛错，之后恢复）；半行加 NUL 的文件尾；链与序号的核对（删一行、改一行、插一行、带 `gap` 的空洞）；计算的确定性（同一夹具算两次、打乱行序再算）；观察不改变行为（同一组流块与工具结果，有无指标行逐字相同）；项目根的几种情形（主检出、`git worktree add` 出来的工作树、不是 git 但有 `.llm`、用户主目录、盘符根）；用户级目录里没有指标文件（验收第 18 条）；高峰档位为 `stop` 时指标行照常写（第 19 条）；自查条目对假的循环板服务（第 20 条）；契约测试（导入 `src/metrics/` 的文件清单、`openEngine(` 调用点清单）。假宿主只给 rc.3 真宿主会给的信号（`AGENTS.md`）。
- L3：探针场景 `metrics`（GLM 与非 GLM 各一回合，含一次 guard 拦截、一次 `userQuestions.ask`、一次图写入；核对验收 1–5）；`metrics-concurrent`（验收 12）；spawn worker 一例（§11 第 9 项）；第 10 步的预检。
- L4：第 9 步。
- 练习题：第 8 步跑一次，核对 `result.json` 的 `metrics` 与运行器自己的记分在步数、工具调用数、积分上相同。

## 14. 对其他设计的影响

已放行的设计不接新请求（`d-freeze-until-dogfood`）。下面凡是要已放行的设计（规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6）改的，都只写成图上对应节点的批注，等 dogfood 之后按 `d-alignment-rounds` 一批对齐；本稿不改它们的文件。仍在同一轮对齐里的 M4、M6、plain-ui、接管，写的是给它们下一稿的输入。

- M7 0.6（已放行）：① `metrics-gaps.jsonl`：不提请求。M7 0.6 §3.16 自己写了「指标流水若自带缓冲与重放，这一段照它改，只改 `src/execute/metrics.ts`」，本设计的队列、重试与 `gap` 就是这个情形，去掉那个文件放在本设计第 6 步。② 派发工具加必填的理由类别：0.1 §14 的请求撤回。`execute.dispatch` 的 `whyRef` 已指向理由所在的节点与历史序号，理由文字留在图上，不再要第二处记类别。③ 周报里的比率：M7 0.6 §3.12.3、§3.12.4 写的做法与 `CHARTER.md` §8 不一致，等 §16 ② 的答案；答案若与推荐不同，M7 的周报一节要改，写成对 M7 的请求。④ M7 §3.16 留给本流水的核对（表里每类事件都在种类表里）：本设计的验收第 5 条做；字段名按 §4.5，M7 接线（本设计第 6 步）时对照，名字不同的由那一步的评审定改哪一边，不改 M7 的设计文字。
- 循环板 0.6（已放行）：① `loop-contribution`（§6.10）没有 `project` 字段，发送方答不出项目，指标流水只能计数不能落盘（§3.5）；请求加一个可选的 `project`，或写明归属哪个项目。② `glm.quota-read` 为项目里的条目发起时，请循环板（与 M6）把那个项目的目录交给 `emitMetric` 的 `where.dir`。③ §3.3「编排层各行交来的」表里没有 `glm-hourness/metrics` 这一行（它交 `metrics.selfcheck`，§6.4）；表里没有不影响收下，只是文档补一行。④ 指标流水合入后 `src/loops/metrics.ts` 的映射：`{at, project, …}` 里的 `at` 与 `project` 由信封与文件位置承担，其余字段名逐字取自 §6.10（§4.5）；这是对实现者的说明，不是设计改动。
- 规则板 0.10（已放行）：没有必须改的。§4.5 给 `rules.*` 起了字段名（`rules.check` 逐字取自 §10.5），实现 `src/rules/metrics.ts` 时对照；`rules.judged` 的 `signals` 是映射，值不是整数、布尔或 id 的信号，适配器把名字放进 `unread`，不改规则板的信号定义。
- M3 附录 0.5（已放行）：没有必须改的。§3.12 的 8 种字段按 §4.5 起名；`design.answer-recorded.answer` 的取值认法在 `src/shared/answer-marks.ts`，计算处导入它，不再抄一份字面。
- M4 0.5（对齐轮中）：给下一稿的输入：① `rule` 不再带 `outcome`，跟进的结果单独成 `followup`（跟进在拦截之后才知道，只追加的流水不能回头改）；申报、放行、作废并成 `request`（§4.2）。② `recordKey` 谁先建谁建（M4 0.5 §3.11 已这样写）。③ `suppressions.jsonl` 在本设计第 10 步去掉（M4 0.5 §3.11 已这样写）。④ `metrics-files-only` 经 `installRuleGate` 安装、登进 `GUARD_RULES`，行名 `metrics`（M4 0.5 §3.8 的目录已列）。
- M6 0.5（对齐轮中）：`glm.quota-read` 不带会话时的归属已答：发送方带项目目录，答不出就只计数（§3.5）；`windows` 的值取已用百分比，四舍五入到整数；`glm.peak-reminder` 的 `peakMode` 取 `inform`、`reduce`、`stop` 三个值（`src/shared/peak-mode.ts` 的 `PeakLevel`）或读不到时的 `none`。
- plain-ui 0.8（对齐轮中）：不需要改。引擎写入方的三个与面板不写流水的说明，本设计 §6.3 按它写；它实现时删掉 `panel-row.ts`，验收第 3 条的调用点清单随之少一处。
- 接管 0.4（对齐轮中）：已答它要的种类：`bootstrap.trial`（§4.5），接管按它交；接管文中引用的「metrics §6.2、§6.3」两节号在本稿里仍是接上的地方与项目图引擎。
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
8. 违规流水照旧（文字、标注、语料），`rule` 事件引用它；拦截计数口径同 M4 的 `classifyRecord`。
9. 派遣决策流水被取代，`workflow` 行退役（第 10 步）；旧文件不删。
10. 图历史补录成事件，让负担曲线从 2026-10-28 开始；用量不补录。
11. 主 Agent 选模型的理由：流水只记 `whyRef`，文字留在会话与图上；0.1 要 M7 加理由类别的请求撤回。
12. 不记人在对话里打的字。
13. `metrics-files-only` 先影子（代码里的新门禁，`CHARTER.md` §6），走 M4 的阶梯。
14. 中位数、百分比与积分的取整规则；`CALC_VERSION`。
15. 给人的只有 `/hourness` 多一行覆盖范围，不加新命令；明细给编排方用命令行。
16. 不引入 OpenTelemetry SDK，只借它的字段口径。
17. 对话里人读的字数：主 Agent 会话里模型输出的文字块的字数。
18. 没有项目可归的事件只计数，不落盘（0.3，取代 0.2 的机器级流水）。
19. 文件清单和密钥放在 `.llm/` 里 `metrics/` 目录之外（0.3，取代 0.2 的用户级账本和密钥目录）。
20. 每天一次的自查是循环板的默认条目 `metrics.selfcheck`，每天 10:00（宿主的系统时区），有发现才告诉主 Agent，不叫醒（0.3）。
21. 新种类 `bootstrap.trial`，答接管 0.4 的请求（0.3）。
22. 兄弟设计的种类，字段名由 §4.5 起；取值清单留在兄弟设计里，字段表只固定名字和 `id` 类型（0.3）。
23. 跟进的结果单独成 `followup` 种类，不再放在 `rule` 里（0.3，append-only 的必然）。
24. 实施在自举之后，档位与步骤见 §12（`d-dogfood-scope`）。

## 16. 待人定的事项

两件。都按 `d-chat-not-cards` 与 `d-plain-questions` 写：一个方案、四行、问题放最后，不列选项，不用人没学过的词。主 Agent 在对话里照这个样子问；①并进一页放行稿的末尾（F3）。人答了以后，由主 Agent 经 `record_human_answer` 记，本稿不替人写进图。

### ① 指标记录怎样算做完

背景：指标记录是**系统自己写的数据记录**，每个项目一份，要分十步做，每一步怎样算做完只有你能定。

推荐：先照**设计里列的 20 条**写下，它们只描述机器上能核对的结果，不替你定方向，以后要改仍要你点头。

疑问：最没把握的是**事件种类要和别的设计一一对上**，对方改一个名字，这条检查就得跟着改。

不做：不让你**逐条审读**这 20 条，先照写再改，省得你读一大段。

这样定可以吗？

### ② 周报里的比率能不能让主 Agent 转述给你

背景：宪章写着**指标不进模型的上下文**，防止它把分数当目标，可已放行的派活设计让主 Agent 在周报里把比率转述给你。

推荐：只让周报这一次的**四个减负数字**（每周被问几次、每次读多少字、拍板等多久、因你的决定返工几次）经主 Agent 转述，其余比率只走命令行和面板。

疑问：最没把握的是**主 Agent 看到这四个数后会不会拿它当目标追**，设计阶段验证不了，只能用起来看。

不做：不把**按模型、按版本的比较**交给主 Agent，这类数最容易被它当分数。

这样定可以吗？

## 17. 交给编排者记图的事项

对齐轮的约定（`brief.md` 共同规则第 9 条）：每个分支在本目录写一份 `graph-ops-align.json`（一个纯数组，元素是 `{"op":"comment","id":"<节点 id>","text":"…"}`，中文），由编排者执行并提交。本稿的作者不写这份文件；它由评审通过之后的步骤按下面的清单建。批注都写成「等 dogfood 之后」，不改已放行的设计（`d-freeze-until-dogfood`）。

- `metrics`：设计 0.3 完成并对齐（0.2 只写到 §10，0.3 的草稿也断过一次，本稿补完 §11–§19）。要点：用户级目录里不再放任何指标文件，机器级流水、账本与密钥目录取消，文件清单与密钥改放项目的 `.llm/`；项目根导入 `src/data/project-root.ts` 的 `projectOf`；种类表收规则板 0.10 的 15 种、循环板 0.6 的 11 种、M7 0.6 的 23 种、M6 0.5 的 4 种、M3 附录 0.5 的 8 种，另答接管 0.4 的 `bootstrap.trial`；跟进的结果单独成 `followup`；引擎的写入方是图工具、`/graph-run` 与命令行；高峰模式不管指标行；每天一次的自查是循环板默认条目 `metrics.selfcheck`。待人定两件（怎样算做完；周报比率能不能经主 Agent 转述），由主 Agent 在对话里按四行问。
- `m7`：指标设计 0.3 的答复：① `metrics-gaps.jsonl` 照 M7 0.6 §3.16 自己写的条件，在指标流水第 6 步去掉，不要求改设计；② 派发工具加理由类别的请求撤回；③ 周报比率经主 Agent 转述是否违背宪章 §8，等人在指标设计 §16 ② 的答案，答案与推荐不同时 M7 的周报一节要改；④ §3.16 核对由指标设计验收第 5 条做，字段名按指标设计 §4.5（接线时对照）。
- `schedules`：指标设计 0.3 对循环板 0.6 的三条请求，等 dogfood 之后：`loop-contribution` 加可选的 `project` 或写明归属；额度读取为项目里的条目发起时把项目目录交给指标流水（与 M6 一起）；§3.3 的表补一行 `glm-hourness/metrics`，它交 `metrics.selfcheck`（每天 10:00，`harness` 动作，有发现才告诉主 Agent）。
- `rules`：指标设计 0.3 已按规则板 0.10 §10.5 收下 15 种事件，字段名在指标设计 §4.5（`rules.check` 逐字取自规则板）；没有要规则板改的；`rules.judged` 的 `signals` 值不是整数、布尔或 id 的，适配器把名字放进 `unread`。
- `m4`：指标设计 0.3 给 M4 下一稿的输入：`rule` 不再带 `outcome`，跟进的结果单独成 `followup`，申报、放行、作废并成 `request`；`suppressions.jsonl` 在指标流水第 10 步去掉；`metrics-files-only` 的行名是 `metrics`。
- `m6`：`glm.quota-read` 不带会话时的归属已答（发送方带项目目录，答不出就只计数）；`windows` 取已用百分比整数；`peakMode` 取 `inform`、`reduce`、`stop` 或 `none`。
- `bootstrap`：已答接管 0.4 的请求：种类 `bootstrap.trial`，字段在指标设计 §4.5。

## 18. 修订记录

- 0.1（2026-10-30）：初稿。第 1 轮独立评审 CHANGES_REQUESTED（挡路 11 条：HIGH 2、MEDIUM 9；不挡路 11 条）。
- 0.2（2026-10-30）：按 F1–F22 修订。写到 §10 中断，没有 §11–§19，没有评审。原文留在 `design-0.2.md`。
- 0.3（2026-10-31）：对齐轮。第一次动手（2026-10-31 凌晨，账号额度用完时断掉）只改了文首、§0 与 §1 的几处，文首已写「§11–§19 补完」而正文没有；本稿接着做完：判草稿、改 §2–§10 里仍写着用户级目录、机器级流水与旧版本的地方、补 §4.5、§11–§19。每处改动答的哪条决定或发现见 §19.1，草稿的状态见 §19.3。待独立评审，评审通过之后再写一页放行稿。

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
| `d-chat-not-cards`、`d-plain-questions`（第 1 轮 F3 已要求） | 待人定改成两件，各按背景、推荐、疑问、不做四行，问题放最后，不用「验收」「标定」「门禁」「影子」 | §16 |
| `d-design-onepage`、`d-dogfood-scope`（实施前先放行） | 评审通过后再写一页放行稿，D1 并进它的末尾问（F3） | §16、§18 |
| 接管 0.4 §2.4 的请求（「种类与字段由指标设计定」） | 新增 `bootstrap.trial` | §4.2、§4.5、§14 |
| 对齐轮自查 1：`rule.outcome?` 放在拦截事件上 | 跟进的结果拦截之后才知道，只追加的流水不能回头改；拆成 `followup` | §4.2 |
| 对齐轮自查 2：§7.2 的「拦截」在 `/hourness` 事实里要用，表里却标成打分 | 拆成「拦截（计数）」F 和「拦截（打分）」S；计数口径写成与 M4 的 `classifyRecord` 一致 | §7.2 |
| 对齐轮自查 3：0.2 要新建 `src/shared/project-root.ts` 并返回 `{root, kind}`，仓库里已有 `src/data/project-root.ts` 的 `projectOf` | 改为导入已有的模块；「同一个函数两种退路」的说法不再需要；`git: false` 但有 `.llm` 的目录照写 | §0、§3.2、§3.3、§5.2、§7.5 |
| 对齐轮自查 4：「字段逐字取自各自那一节」对只写了内容的兄弟表不成立 | 新增 §4.5：写了名字的逐字取，没写的由本设计起名，取值清单留在兄弟设计里 | §0、§4、§4.4、§4.5 |
| 对齐轮自查 5：每天自查条目按循环板 0.4 的形状写 | 按循环板 0.6 的 `LoopEntryDefinition`、`Contribution.actions`、`HarnessResult` 重写 | §6.4 |
| 对齐轮自查 6：整个 `.llm/` 被删（`git clean -fdx`、重新克隆）没有写后果 | 写明发现不了、回不来，图历史可补；覆盖行加一句对照；列入不可逆处 | §0、§5.5、§8、§9.2、§9.3 |

### 19.2 第 1 轮 F1–F22 各在哪里处理

| # | 级别 | 处理（0.2 起） | 在哪 |
| --- | --- | --- | --- |
| F1 | HIGH | 信封归本设计，正文按名字空间各一张闭合表；加 `id[]`、`int[]`、一层记录，0.3 又加 `map`；不另造 `task`、`upstream`，兄弟设计不改用本设计的词汇 | §4.1、§4.2、§4.4、§4.5 |
| F2 | HIGH | 问人按对话路径：收 `design.proposal-shown`、`design.answer-recorded`，次数、字数、等待、同意/补充/否掉都从它们算；卡片字段、`tagQuestion`、跟随率全部去掉 | §4.2、§4.5、§6.2、§7.2 |
| F3 | MEDIUM | D1 改成四行方案、不列选项、问题放最后；0.3 再加第二件（周报比率） | §16 |
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
| F20 | NIT | `metrics-files-only` 登进 `GUARD_RULES`，影子；0.3 行名与安装函数按 M4 0.5 | §3.4、§12 第 7 步 |
| F21 | NIT | `verify` 查命令行写入者写了宿主事件 | §5.4 |
| F22 | NIT | spawn worker 的事件由子进程写，列为未核实并加 L3 | §11 第 9 项、§13 |

### 19.3 对齐轮读到的盘上草稿：状态与处理

盘上的 `design.md` 是 615 行，文末和 0.2 一样留着一行 `%%NEXT%%`，§10 之后没有内容。与 `design-0.2.md` 逐行比（`git diff --no-index`：20 行新增、18 行删去，集中在第 3–74 行）：

- 0.2 原文完整保留：`design-0.2.md` 的 MD5 与文首记的 `9F4EC6D609B56C6D41C7A9EEE4190F80` 一致，`design-0.1.md` 的 MD5 与 `7C74656E2BC0B654DC0B0829AE25EFDC` 一致，本稿没有改它们。
- 上一次动手改过的只有文首、§0、§1.1 的一条、F1、F5 与验收第 3、4、5、7、10、11、14 条。§2 到 §10 没有动过，仍是 0.2 的原文，所以仍写着用户级的账本、机器级流水、`projectRootOf`、`kind: 'cwd'`、旧版本号（规则板 0.8、循环板 0.4、M7 0.4、M3 附录 0.4、M6 0.4）。§11–§19 没有，尽管文首写着「补完」。草稿没有另存副本（`.agents/` 被 `.gitignore` 忽略，git 里没有），但它与 0.2 的差别只有上面 20 行，都已在本稿里保留或改写，没有信息丢失。
- 判为完整、正确、保留的（核过兄弟设计的现行文本）：事件种类的个数（规则板 15、循环板 11、M7 23、M6 4、M3 8，逐个数过）；验收第 4、5、7、10、11、14 条的内容；F5 一条；§1.1 里 0.3 的依据一条；文首的两个 MD5。
- 判为不完整或不对、重做或改写的：文首的版本说明（说补完了，其实没有；改成与实际一致）；§0 「待人定只有一件」与文首「两件」矛盾（改成两件，补 §16）；§0 与 §4 的「字段逐字取自各自那一节」对只写了内容的表不成立（新增 §4.5）；§0 把 M6 的 `gateOnRules` 列为写事件的一次性进程（它不写，`checkCall` 写）；§0 的「M3 附录 0.4」；验收第 3 条的静态检查弱于代码现状（今天还有 `panel-row.ts` 一个调用点，改成按调用点清单）；依据里的 `9c346fb`（现 `4dc369e`）和邻居版本（M4 0.5、M6 0.5、plain-ui 0.8、接管 0.4）；§2 到 §10 里与现行设计不符的全部地方（见 §19.1）；文末的 `%%NEXT%%` 标记（已删，不是内容）。
- 没有把任何半写的小节当作完成：§2–§10 每一节都对着现行输入读过一遍再决定改不改，读过没有改的小节（§1.3、§1.5、§4.3 除密钥外、§5.3 除两处外、§6.1、§9.1、§10 前 19 行）是 0.2 正文仍然成立的。