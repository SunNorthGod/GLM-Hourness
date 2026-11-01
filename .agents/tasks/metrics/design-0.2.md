# metrics 设计：每个项目一份指标流水（项目图 `metrics`）

版本：0.2（2026-10-30，按第 1 轮独立设计评审 F1–F22 修订；0.1 原文原样留在同目录 `design-0.1.md`，MD5 `7C74656E2BC0B654DC0B0829AE25EFDC`，第 1 轮评审的行号指那一份）。逐条回应见 §19。

依据：main `bab224a`；项目图节点 `metrics`（2026-10-29 人批准，原话「指标能全记就全记下，b直接做」）；`.agents/tasks/design-context.md` 全部各节（含「Questions become conversation」`d-chat-not-cards`、「Main agent direction」`d-one-main-agent`、「Seam rulings between designs」「Two-level loop in the product」）；`docs/CHARTER.md` 0.6（§3.2 第 5 条、§7.1 条款 7 与 11、§8）；`docs/DESIGN.md` §2.4、§2.4a、§2.5；`docs/ORCHESTRATION.md` §2.9.1、§10、§11、§12；`docs/DEVELOPMENT.md` §1.1；本仓库源码 `src/memory/audit.ts`、`src/memory/index.ts`、`src/workflow/index.ts`、`src/workflow/morning-report.ts`、`src/report/index.ts`、`src/shared/data-home.ts`、`src/shared/lm-min.ts`、`src/graph/engine.ts`；已有流水 `.llm/audit/decisions.jsonl`、`violations.jsonl`。

兄弟设计（读时的版本，F18）：M7 `.agents/tasks/m7/design.md` 0.4（§3.16 事件表、§3.1–§3.13）、M4 `.agents/tasks/m4/design.md` 0.3（§3.2 `recordKey`、§6.7）、plain-ui `.agents/tasks/plain-ui/design.md` 0.6（§5.6、§11「指标流水」）、M6 `.agents/tasks/m6/design.md` 0.4（§14.2）、规则板 `.agents/tasks/rules/design.md` 0.8（§7.3 项目键、§9.4、§10.5 事件表）、循环板 `.agents/tasks/schedules/design.md` 0.4（§2.2、§2.3、§6.10 事件表）、M3 附录 `.agents/tasks/m3/design-addendum.md` 0.4（§3.3 提议式待决、§3.4 `propose_to_human`、§3.5 `record_human_answer`、§3.12 事件表、§3.13 `attach`）、接管 `.agents/tasks/bootstrap/design.md` 0.3（`projectHome` 钉死在本仓库的问题）。

证据写法沿用 `docs/DESIGN.md` §2.4a：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行号；`types.d.ts:行` 指 `node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts`。〔实读〕读过源码；〔推断〕由源码推出、没有运行验证；〔未核实〕列进 §11，实施时先核实。

## 0. 摘要

- 每个项目一份只追加的事件流水：`<项目根>/.llm/metrics/events-<UTC 日期>.jsonl`。项目根按会话头的 `cwd` 找 git 仓库根（与规则板 §7.3 同一个算法，工作树归到主检出），不用数据目录服务里钉死的 `projectHome`。目录里自带一个只写 `*` 的 `.gitignore`，不碰项目自己的忽略配置。没有 git 根的会话（有会话但不属于任何项目）不写；完全没有会话、属于机器一级的事件（额度读取、循环板的机器级运行）写进机器级流水 `<userDataHome>/metrics/machine/`（F5）。
- 信封加正文的两层格式（F1）：信封由本设计定（`s`、`k`、`at`、`w`、`n`、`h`、`v`、`by`、`sid?`），正文按名字空间各一张闭合表——本设计自己的种类，加规则板 0.8 §10.5、循环板 0.4 §6.10、M7 0.4 §3.16、M6 0.4 §14.2、M3 附录 0.4 §3.12 已经定好的那些，逐字取自各自那一节，放在 `src/metrics/kinds/<名字空间>.ts`。本设计不再另造 `task` 种类与 `upstream` 种类，也不要兄弟设计改用本设计的词汇。
- 只有 harness 写。新行（id `glm-hourness/metrics`，导出名 `dsh-hourness/metrics`，编排层包，出厂 `disabled: true`，F15）是唯一的写入者：它自己挂在 DSH 的通用接缝上记每一次模型调用、每一次工具调用、回合、审批、命令、问题与人发的消息（F10）；别的行与 GLM 通道包经进程内服务 `glmHournessMetrics` 交各自名字空间的事件。DSH 之外的一次性进程（规则板的 `checkCall`、M6 的 `gateOnRules`、循环板之外的脚本）经 `appendEvents` 库写入口写，调用方 `await` 它再退出，事件不丢（F4）。模型说的数一律不收。
- 记的是数与引用，不记文字：闭合的字段表，字符串只许 id 形状，数组至多 32 项、只放 id 或整数，记录只一层、键与类型在表里声明；不合规的整条拒收并计数。文件路径记每个项目一份密钥的 HMAC 散列（密钥不随流水导出，F16），shell 命令只记第一个词。
- 写入失败不挡工作：失败的事件留在有上限的内存队列里按序重试，溢出时丢队首之后最早的一条（队首正在重试，不丢，F17）并在恢复后写一条 `gap`。每行带写入者 id、序号与链式摘要。核对不只在有人跑命令时做：指标行激活后在后台对前一天与当天各核对一次，结果进行健康与 `/hourness` 的覆盖行；另有一条每天一次的编排层自查条目（F6）。整天的文件只有人能删，删前先写一条 `prune`，并对着用户数据目录里的账本核对，少了文件就报出来（F7）。
- 报告从流水算，分「事实」与「打分」两类（F9）：事实（几件做完、几件在等人、哪次检查没过、记录缺了几行、覆盖范围）可以经主 Agent 的对话给人；打分（原样同意率、被拦率、返工次数、门禁一次通过率、按模型或版本的比较）只给命令行与以后的面板，不进模型上下文（`CHARTER.md` §8）。真实流水上复现旧报告靠依据行里的文件前缀加 `--basis`（F8）。
- 已有的数（用量、违规、额度、规则板状态、项目图历史、会话日志）各管各的；指标流水对它们只记数与引用。只有派遣决策流水 `decisions.jsonl` 被完全取代，它的写入行 `glm-hourness/workflow` 在最后一步退役，这一步做独立评审并排在 M3、M7、M4 动同一批文件之后（F11）。
- 问人只按对话路径量（F2）：`propose_to_human` 与 `record_human_answer` 的两种事件（M3 附录 0.4 §3.12）给出问人的次数、字数、等待与人原样同意/补充/否掉的次数；卡片、跟随率、先想后看都不再有（plain-ui 0.6 已取消）。
- 量不到的照实写：人在系统外花的精力、读懂了没有、做出来的东西好不好用、跟了的推荐对不对，只能靠真实项目试用（`field-trial`）与人的反馈。
- 待人定：只有一件，D1「这几件活怎样算做完」（§16，必须问人的第 1 类，`ORCHESTRATION.md` §2.9.1），写成对话里的一个四行方案，并进一页放行稿的末尾问（F3）。

## 1. 需求与验收

### 1.1 来源

- 人 2026-10-29：「还有为了后续项目的优化，能不能做到所有指标都可以量化记录啊？」；批准时「指标能全记就全记下，b直接做」。
- 节点 `metrics` 正文（已批准的范围）：每个项目一份只追加的事件流水，固定格式，只记数与引用、不记对话正文；每一步的模型、token 与积分、用时、工具调用与被拦次数、派活、审查发现、返工、合入、失败与重试、问人的次数、人读了多少字、拍板等了多久、是否跟了推荐，都由 harness 写，模型写的数不算；晨报、周报、各种指标都从这一份算，同样的输入算出同样的数。量不到的照实写。
- `docs/CHARTER.md` §3.2 第 5 条（减负只量系统里看得到的数）、§8（只看曲线；指标不注入模型上下文；基线从早采集）、§7.1 条款 11（处处留痕，一处动作一个事实源，别处引用）。
- `design-context.md`：`d-main-agent-models`（主 Agent 选每个子 agent 的模型并写明理由，harness 只记录）、`d-one-main-agent`（报告在主 Agent 的对话里给人）、`d-auto-drive`、`d-chat-not-cards`（问人是对话里的一个方案，不出卡与选项）、「Two-level loop in the product」（两层循环）。

### 1.2 功能需求

| 编号 | 需求 |
| --- | --- |
| F1 | 每个项目一份只追加的事件流水，放在项目目录下，固定格式，可轮换，不入库；没有项目的机器级事件另有一份机器级流水 |
| F2 | 每一步记：模型与 provider、token（输入、缓存读、缓存写、输出、推理）、积分与是否高峰、用时与首字用时、结束原因、本步发出的工具调用数；每次工具调用记：工具与类别、结果（成功、出错、被拦、被审批拒）、用时、结果大小；每次被拦记：规则、模式、拦截方，引用违规记录 |
| F3 | 任务各阶段的记录由 M7 的 `execute.*`、`operate.*` 事件给（本设计收下、不另造）：派发、计划、交回、审查、门禁、合入、重开、失败与重试，含主 Agent 选的模型与理由所在的节点序号 |
| F4 | 问人只按对话路径记：每次 `propose_to_human` 记一条、每次 `record_human_answer` 记一条（问了什么的引用、种类、字数、等待、人原样同意/补充/否掉）；另单独数 DSH 原生问题与审批 |
| F5 | 项目图的每一次写入记一条：节点、类型、操作、状态的前后、身份、是否转述；写入失败记错误码 |
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
3. L2：项目图引擎每次成功的写入（图工具、命令行；plain-ui 0.6 已删 `/graph-apply`）为它追加的每一条历史各留一条 `graph` 事件，带节点、操作、状态前后、身份；写入失败留一条带错误码的 `graph` 事件。
4. L3（假的设计行）：一次 `propose_to_human` 与一次 `record_human_answer` 各留恰好一条事件（`design.proposal-shown`、`design.answer-recorded`），`answer` 取自调用参数，等待毫秒数等于两段会话事件 `time` 之差；一次放行写下 N+1 条图历史时，`design.answer-recorded` 仍只有一条（plain-ui 0.6 §5.6 的计数单位）。一次 `userQuestions.ask`（DSH 原生问题，非主 Agent）留 `ask` 与 `answer` 两条，`q` 相同。
5. 名字空间示例（F1）：L2 对每个名字空间（`rules.*`、`loop-*`、`execute.*`/`operate.*`、`glm.*`、`design.*`/`git.*`）各取那份设计里的一条示例事件，经 `emitMetric` 写入后能读回、字段逐字相同；带一个未知键或一个超 32 项的数组的同一事件被整条拒收并计 `reject`。
6. 隐私：L2 性质测试，写入器拒收带未知键或字符串不合 id 形状的事件并计数；L3 扫描探针留下的指标文件，找不到探针自己的提示词、工具参数、文件内容、凭证文件与请求头里的任何 8 字符以上的片段，也找不到人发的消息正文。
7. 失败与自查：L2 把指标目录换成一个同名文件，模型流与工具调用的结果逐字不变，行健康为部分生效并写明原因；故障解除后排队的事件按序号写入；只有队列溢出时才有 `gap`，其中 `lost` 等于丢掉的条数。另造一份以半行加 NUL 字节结尾、且有一个写入者只写了 `start` 没有 `stop` 的旧文件后启动指标行，后台自查把那一行计为无法读取、把那个写入者报为「没有正常退出」，写进行健康与覆盖行。
8. 确定性与复现：L2 用固定的事件文件算两次，输出逐字相同；把同一批行打乱顺序后输出仍相同；输出第一行写明文件、行范围、窗口、时区与计算版本。出一份报告之后往同一文件追加一条 `at` 落在窗口里的事件，按原依据行带 `--basis` 重跑，输出逐字相同；不带 `--basis` 时不同。
9. 比较：`npm run metrics -- compare --by v` 对含两个构建的夹具，按构建列出每步用时与 token 的中位数、每个任务的积分、原样同意率，以及每组的样本数。
10. 追查：`npm run metrics -- verify` 报出每个写入者缺的序号、链断的位置、没有正常退出的次数、流水开始之后项目图历史里有而流水里没有的条目、每个会话 `llm` 事件与用量流水条数不一致之处、账本里有而磁盘上没有且没有 `prune` 覆盖的文件、`start.host` 为 `cli` 却写了宿主专属种类的写入者；没有发现时退出码 0，有发现时 1。
11. 报告：`/hourness` 对本仓库的会话，派遣次数与拦截计数（事实）从指标流水算（L2 对夹具），并多一行覆盖范围（最早一条、今天几条、本进程丢了几条）；经对话给人的那部分不含任何「打分」（比率、比较）。
12. 并发：L3 两个进程同时往同一个项目流水各追加 5000 条，10000 行全部能解析，每个写入者的序号齐全；不通过时改用每个进程一份文件（§5.2 的退路），同一检查通过。
13. 一次性进程（F4）：L2 用一个子进程调 `appendEvents`（模拟规则板的 `checkCall`）后立即退出，项目流水里恰好多一条 `rules.check`。
14. 删文件（F7）：L2 删掉一天的文件（其中有一个写入者的全部行）后跑 `verify`，报出那个文件丢失、退出码 1；经 `prune` 删的不报，且 `prune` 事件里 `files`、`lines` 等于被删的。
15. 包：新行出厂 `disabled: true`；`npm run build`、`npm run preflight`、`npm test` 全绿；L3 启用该行真实启动无新错误；探针通过之后才在 bundle 里默认启用。
16. 体积：批次 L4 记一天真实使用的流水大小，写进 `docs/FACTS.md`；超过 5 MB 时在节点上批注并查原因。
17. 退役（F11）：`glm-hourness/workflow` 行退役之后，L3 带用户 profile 同形的覆盖层真实启动无新错误；不通过就停下交人（§12 末步）。

### 1.5 让人少做了什么（question-27 B）

这份流水本身不减负，它让减负可以被量：人每周被问几次、每次读多少字、等多久、原样同意了几次、因人的决定返工几次，以前散在图历史与设计里，有的根本没有记（对话里问人的用时、DSH 原生问题与审批、主 Agent 在对话里写给人的字数、人自己发的消息）。以后改提示词、换模型、换问法，前后对照用的是同一份数据和同一套算式。人不需要读这份流水。

### 1.6 不做的事

- 不做新的面板或页面：报告仍是 `/hourness` 与 M7 的晨报、周报；面板上的指标页属于 M8。
- 不按指标自动调整任何行为（换模型、换问法、限流）：只记录与报告。
- 不记人在对话里打的字的内容（只记条数、字数、附件数，F10）：内容进不了字段表（§4.4）。
- 不把用量流水按项目拆开、不迁移历史用量：用量跟账号走（`DESIGN.md` §2.4），面板看整个账号；项目流水从启用那天起记。
- 不做匿名化导出与回收：属于 `field-trial`。
- 不改宪章，不改用户的 `~/.dsh` profile。

## 2. 现状：已有的数在哪

| 已有的 | 位置与写入者 | 记什么 | 本设计怎样处理 |
| --- | --- | --- | --- |
| 用量流水 | `<userHome>/audit/usage.jsonl`，memory 行（`src/memory/index.ts`） | 每次模型调用的 provider、模型、token、用途、会话 | 保留，照写：它是整个账号的账，面板、M6 的预估、标定运行器都读它，范围是一台机器的所有项目。指标流水的 `llm` 事件是同一次调用在本项目里的记录，另带用时、步、积分与结束原因。两者的条数由 `verify` 按会话对账（验收第 10 条），对不上就报 |
| 违规流水 | `<projectHome>/audit/violations.jsonl`，guard 行；M4 起还有跟进、申报、放行的记录 | 拦截与影子记录，带纠偏全文 | 保留：纠偏文字、M4 的标注（按行的 `recordKey`）与回归语料都靠它。指标流水的 `rule` 事件只记规则、模式、结果与 `ref`（那一行的 `recordKey`），报告的拦截计数从指标流水算 |
| 派遣决策流水 | `<projectHome>/audit/decisions.jsonl`，workflow 行（`src/workflow/index.ts`） | 派遣类工具调用的等级（全是 L1）与从参数截的 120 字主题 | 被取代：`tool` 事件按类别 `dispatch` 记了同样的调用，还不记参数文字。M7 起派发的全貌在 `execute.dispatch`。晨报的「决策曲线」改从指标流水算（§7.3）；workflow 行在最后一步退役（§12 末步）；旧文件留在磁盘上不删 |
| 项目图历史 | `docs/graph/nodes/*.json` 的 `history`，引擎写 | 每次写入的时刻、身份、操作、理由、转述原话 | 保留为节点状态与文字的事实源。`graph` 事件只记数与引用（节点 id、历史序号、修订号），两者不一致时以图为准，`verify` 报差。启用前的历史由 `backfill-graph` 一次补成事件（§7.5），让人的负担曲线从 2026-10-28 开始 |
| 额度流水、用量缺口 | `<userHome>/audit/quota.jsonl`、`usage-gaps.jsonl`（M6 设计 §4.5、§6.2） | 账号的额度读数、删过的用量 | 保留，不进项目流水：它们属于账号。额度读取由循环板发起、没有会话时，M6 另交一条 `glm.quota-read`（M6 0.4 §14.2），本设计把它收进机器级流水（§3.5、F5） |
| 规则板的状态流水与命中计数 | `<userHome>/rules/projects/<项目键>/journal.jsonl`、`hits.json`（规则板 §7） | 规则与等待单的状态 | 保留：那是规则板的状态存储。规则板另交 `rules.*`（11 种，规则板 0.8 §10.5），本设计收下（§4.2、F1） |
| M4 的压制计数、标注 | `<projectHome>/audit/suppressions.jsonl`、`labels.jsonl` | 每天的压制注释数；人对记录的判断 | 压制计数改为每天一条 `count` 事件（M4 实现时直接交，不另建文件）；标注保留在 `labels.jsonl`（那是判断，不是测量） |
| M7 的门禁结果、派发与交回批注 | `<项目目录>/gate/<任务>/<时间>/result.json`；图上的批注 | 门禁每条命令的日志路径与结论；派发次数、计划版本、问答计数 | 明细照旧在 `result.json` 与会话日志；`execute.*` 事件记数（§4.2，M7 0.4 §3.16）。M7 §3.12 的计数改从这些事件算 |
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
| 写入器（序号、链、队列、重试、轮换、账本） | `src/metrics/writer.ts` | 新建 |
| 库写入口（DSH 之外的一次性进程，F4） | `src/metrics/library.ts` | 新建 |
| 读取（逐行解析、去重、排序、链与序号核对） | `src/metrics/read.ts` | 新建 |
| 计算（纯函数；分事实与打分两组出口，F9） | `src/metrics/calc.ts` | 新建 |
| 通用接缝上的观察（模型流、步、会话事件、问题、人的消息） | `src/metrics/observe.ts` | 新建 |
| 行入口 `glm-hourness/metrics`：提供服务、挂接缝、报行健康、后台自查、交自查条目 | `src/metrics/index.ts` | 新建 |
| 命令行 | `src/metrics/cli.ts`、`scripts/metrics/cli.ts`、`package.json` 的 `metrics` 脚本 | 新建 |
| 服务契约与发事件的帮手（两个包共用） | `src/shared/metrics.ts` | 新建 |
| 项目根（规则板 §7.3 的算法，返回 `{root, kind}`，两处共用，F4） | `src/shared/project-root.ts` | 新建；规则板实现时导入它，不另写一份 |
| 字数（中文按字、英文按词，M7 §3.12.3 的口径） | `src/shared/text-units.ts` | 新建 |
| 构建戳 | `scripts/build-info.mjs`（`npm run build` 最后一步）写 `packages/*/dist/build-info.json`；`src/shared/build-info.ts` 读本包的那一份 | 新建；`package.json` 的 `build` 改 |
| 工具类别表 | `src/shared/tool-names.ts` 加 `toolCategory(name)` | 改 |
| 项目图引擎的观察者 | `src/graph/engine.ts` 的 `EngineOptions` 加 `observe`；`src/graph/index.ts`（图行）与 `src/graph/cli.ts` 传入 | 改 |
| guard 与图文件门禁交 `rule` 事件 | `src/guard/index.ts`、`src/guard/graph-files.ts`（M4 合入后改在 `installRuleGate` 一处）；记录键 `recordKey` 在 `src/guard/records.ts`（M4 先合入就用它的）；`guard:metrics-files-only` 进 `src/guard/catalog.ts` 的 `GUARD_RULES`（影子，F20） | 改 |
| 晨报改读指标流水 | `src/workflow/morning-report.ts`、`src/report/index.ts` | 改 |
| 行登记 | `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（id `glm-hourness/metrics`，name `dsh-hourness/metrics`，`disabled: true`）、`src/shared/health.ts` 的 `HOURNESS_ROWS`、`tests/contracts.spec.ts` 的行清单 | 改 |
| 测试 | `tests/metrics-schema.spec.ts`、`tests/metrics-writer.spec.ts`、`tests/metrics-read.spec.ts`、`tests/metrics-calc.spec.ts`、`tests/metrics-row.spec.ts`、`tests/metrics-library.spec.ts`、`tests/fixtures/metrics/`；`package.json` 的 `test` 列表 | 新建 |
| 探针场景 | `scripts/probe/` 的 `metrics` 与 `metrics-concurrent` 两个场景 | 改 |
| 文档 | `docs/ORCHESTRATION.md` 新增 §10.6「指标流水」并改 §10.1 的来源列；`docs/DESIGN.md` §2.4 数据表加一行、§2.4a 对照表加本设计用到的接口、§2.5 行健康表加一行；`docs/HANDOFF.md` | 改，随各步同一批提交 |

技术栈锁定：TypeScript strict（`exactOptionalPropertyTypes`），Node 22 内置模块（`node:fs/promises`、`node:crypto` 的 SHA-256 与 HMAC、`node:readline`），不加依赖。

### 3.3 放在哪：项目根下的 `.llm/metrics/`

「项目目录」在本仓库的词表里是工作区的 `.llm/`（`DESIGN.md` §2.4）。今天违规与决策流水按数据目录服务的 `projectHome` 写，这个值在 profile 里钉在本仓库的 `.llm`（接管设计指出：在别的项目里干活，记录仍写进本仓库）。指标流水要「每个项目一份」，所以不用 `projectHome`，按会话算项目根：

1. 会话：`agents.get(sessionId)` 取活 agent（agent:596），读 `session.header.cwd`（session:1820–1826）。委派子会话的 `cwd` 是父会话的目录（subagent:345–356），worker 的事件因此落在主会话的项目里。
2. 项目根：`projectRootOf(cwd)`（`src/shared/project-root.ts`）返回 `{root, kind: 'git' | 'cwd'}`（F4）：从 `cwd` 往上找 `.git`；是目录，`root` 是它的父目录、`kind: 'git'`；是文件（git 工作树），读 `gitdir:` 与 `commondir` 得到公共目录，`root` 是公共目录的父目录、`kind: 'git'`；找不到 `.git` 返回 `{root: cwd, kind: 'cwd'}`。只读文件，不起 git 进程，按 `cwd` 缓存。主检出与 `.worktrees/*` 是同一个项目。规则板按它的 §7.3 用 `root`（不管 `kind`）；指标流水只在 `kind: 'git'` 时写项目流水。两边共用同一个函数而退路不同一，就靠 `kind` 由各自判断，不再是「同一个函数两种退路」。
3. `kind: 'cwd'`（有会话但没有 git 根）：这个会话没有项目，事件不写项目流水（计入行健康的「无项目的事件 N 条」）。不在任意目录里建 `.llm/`。
4. 目录：`<root>/.llm/metrics/`。第一次建目录时以 `wx` 写一个内容为 `*\n` 的 `.gitignore`（已在就不动）。本仓库的 `.llm/` 本来就被忽略，多这一个文件无害。
5. 命令行：`--project <目录>`，默认当前目录，按同一个函数算根（必须 `kind: 'git'`，否则退出码 2）。项目图的写入按图目录（`<root>/docs/graph`）算根。

标定的每次运行目录 `ws/` 是新初始化的 git 仓库（`ORCHESTRATION.md` §10.5.1），它的事件落在 `ws/.llm/metrics/`，与真实项目天然隔开；探针同理。

### 3.4 谁写：只有 harness

- 写入者只有一个模块：`src/metrics/writer.ts`。进程里由指标行持有（宿主），命令行与库写入口进程各自持有一个（`host: 'cli'`）。
- 指标行自己观察 DSH 的通用接缝（§6.1），得到的都是宿主在执行边界上看到的事实：流里的 `usage` 块、时钟、会话事件、人发的消息。
- 其余事件经服务 `glmHournessMetrics` 交来，调用方都是本仓库的宿主侧代码（§6.2）。服务只在进程内，不注册任何工具，模型调不到它。
- 不收模型报的数：工具参数、`structured_output` 交回、`submit_plan` 里写的任何数字都不进流水；门禁的通过与否取 harness 自己跑的结果（M7 §3.8.4）。模型做的选择（主 Agent 给 worker 选的模型、人在对话里的回话）照记，但计算时只当分组的键或人的决定，不当测量值。
- 防误写：新增 guard 规则 `guard:metrics-files-only`（进 `src/guard/catalog.ts` 的 `GUARD_RULES`，规则板的只读目录随之列出，F20），文件工具写到 `<root>/.llm/metrics/` 之下、或 shell 命令文本里出现 `.llm/metrics` 并带写入、删除或移动动作时记下。按 `CHARTER.md` §6「新门禁先影子后拦截」，出厂为影子模式，走 M4 的阶梯转生效；它依赖 M4 的 `GuardRule.mode`，M4 合入之前不装。在此之前与之后都由链式摘要与账本发现误写与删除（§5.4、§5.5）。

### 3.5 没有项目的事件：机器级流水（F5）

有些系统看得到的数不属于任何项目：循环板发起的额度读取（`glm.quota-read` 不带会话，M6 0.4 §14.2）、循环板的机器一级运行（`loop-read`、`loop-contribution`，循环板 0.4 §6.10）。丢掉它们不满足「能全记就全记下」，也没满足 M6 与循环板交给本设计定归属的请求。

- 一份机器级流水 `<userDataHome>/metrics/machine/events-<UTC 日期>.jsonl`（`userDataHome()` 来自 `src/shared/data-home.ts`），格式、写入者、序号与链与项目流水完全相同，信封里带 `machine: true`，没有项目字段。
- `emit` 的 `where` 加一种 `{machine: true}`；字段表注明哪些种类允许写进机器级（`glm.quota-read` 不带会话时、`loop-read`、`loop-contribution`）；别的种类带 `{machine: true}` 被拒收。
- `summary` 与 `/hourness` 在项目之外另列「本机」一组，`verify` 与后台自查同样核对它。
- 有会话而 `kind: 'cwd'`（找不到项目根）的事件仍不写、只计数（§3.3 第 3 条）；机器级只收本来就没有会话、声明为机器级的那几种。

## 4. 记录格式：信封加名字空间正文（F1）

字段表分两层。信封由本设计定，对每一条都一样；正文按名字空间各一张闭合表，本设计自己的那几种写在这里，兄弟设计已经定好的那几种逐字取自对应设计的那一节，放在 `src/metrics/kinds/<名字空间>.ts`，表头注明来源设计与版本。校验规则对两层一样：未知键、类型不对、数组超限整条拒收（§4.4）。

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
| `by` | 是 | 枚举：`host`、`graph`、`guard`、`rules`、`loops`、`execute`、`operate`、`glm`、`design` | 交来这条事件的构件。`host` 是指标行自己观察的；其余是经服务交来的那一行。`verify` 用它加 `start.host` 认出伪造（§5.4、F21） |
| `machine` | 否 | 布尔 | 机器级流水里为 `true`（§3.5）；项目流水里不写 |
| `sid` | 否 | id | 会话 id（rc.3 的 agent 与会话共用 id，agent:514） |

写入器按信封加正文字段表的顺序序列化（不靠对象的插入顺序），同一事件的文本是确定的，链可以重算。

### 4.2 种类总表

下表按名字空间列出全部种类。「正文字段」里 `?` 为可选；来源一列指字段的定义出处（本设计，或兄弟设计的那一节，字段逐字取自那里）。

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
| `llm` | 一次模型调用结束 | `turn?`、`step?`、`provider`、`model`、`purpose?`、`input?`、`output?`、`cacheRead?`、`cacheWrite?`、`reasoning?`、`total?`（流里没有 `usage` 块时这六项都不写）、`ms`、`ttft?`、`fin`（`stop`、`tool-calls`、`max-tokens`、`aborted`、`error`、`none`、`other`，F12）、`calls`（输出里的工具调用块数）、`text`（输出文字块的字数，§4.3）、`retries?`（本步 `agent/request-error` 的次数，F13）、`credits?`、`peak?` |
| `tool` | 模型发出的一次工具调用有了结果，或回合结束时仍没有结果 | `turn`、`step`、`call`、`name`、`cat`（§4.3）、`out`（`ok`、`error`、`denied`、`declined`、`none`）、`ms?`、`chars?`（结果文字的字符数）、`target?`（路径散列）、`cmd?`（shell 命令的第一个词） |
| `rule`（`by: guard` 或 `graph`） | guard 框架一次判定不是放行（基础 guard 行、图文件门禁；M4 合入后在 `installRuleGate` 一处） | `call?`、`rule`、`by` 同信封、`mode`（`enforce`、`shadow`）、`effect`（`deny`、`shadow`）、`outcome?`（M4 的跟进结果 `right-path`、`repeat`、`other`、`none`）、`ref?`（违规流水那一行的 `recordKey`） |
| `approval` | DSH 审批的发起与结论 | `id`、`phase`（`asked`、`decided`）、`tool?`、`call?`、`outcome?`（`allowed-once`、`rejected`、`cancelled`、`unavailable`，F14） |
| `command` | 人发的斜杠命令开始与结束 | `cid`、`name`、`phase`（`run`、`done`）、`result?`（`success`、`error`） |
| `ask` | 一次 DSH 原生问题请求开始（子会话之外的普通会话与探针；主 Agent 出原生问题本身是要数的违规，M3 §3.10） | `q`、`qs`（问题数）、`opts`（选项总数）、`units`（问题与选项文字的字数）、`ref?` |
| `answer` | 这次原生问题请求结束 | `q`、`ms`、`end`（`answered`、`aborted`、`no-provider`、`timed-out`、`error`，F12）、`pick?` |
| `said` | 人往会话发一条消息（F10） | `units`（文本块的字数）、`attachments`（附件块数）、`source`（消息 `source.kind`） |
| `graph`（`by: graph`） | 一次写入追加的每条历史；一次写入失败 | `node`、`type`、`op`、`hi`（历史序号）、`rev`、`actor`（`human`、`llm`、`harness`）、`relay?`（是否带转述）、`from?`、`to?`、`err?`（失败的错误码）、`src?`（补录时为 `history`） |
| `report` | `/hourness` 生成一次报告（基础 hourness 行；M7 的报告用 `operate.report`） | `kind`（`status`）、`units`、`ms` |
| `count`（`by: guard`） | 每天一次的计数（第一个用户是 M4 的压制注释数） | `what`、`value`、`byKey?`（一层记录：键是 id，值是整数，至多 32 项） |

#### 规则板 0.8 §10.5（`by: rules`，11 种，字段逐字取自那一节）

`rules.judged`、`rules.session-summary`、`rules.ticket`、`rules.wake`、`rules.write`、`rules.proposal`、`rules.peak-mode`、`rules.recovery`、`rules.detector-run`、`rules.check`、`rules.health`。其中 `rules.check` 是接缝裁定「checkCall 写判定事件」要的那一条（`design-context.md`「Seam rulings」第 2 条），每一次 `checkCall` 都写、放行也写，带数组 `rules: id[]`、`unknownSignals: id[]` 与一层记录 `peakMode: {level, origin}`。

#### 循环板 0.4 §6.10（`by: loops`，11 种，字段逐字取自那一节）

`loop-fired`、`loop-done`、`loop-entry`、`loop-drift`、`loop-note`、`loop-read`、`loop-contribution`、`loop-duplicate`、`loop-holder`、`loop-handover`、`loop-task-delete`。带数组 `exits: int[]` 与一层记录 `trigger`。其中 `loop-read` 与 `loop-contribution` 可写机器级（§3.5）。

#### M7 0.4 §3.16（`by: execute` 或 `operate`，22 种，字段逐字取自那一节）

`execute.dispatch`（带 `sameAsMain`、`sameAsWorker`、理由所在的节点与历史序号 `whyRef`）、`execute.dispatch-refused`、`execute.plan`、`execute.ask`、`execute.handback`、`execute.review-depth`、`execute.review`、`execute.stop`、`execute.check`（每条命令的序号、退出码与毫秒，`int[]`）、`execute.advance`、`execute.advance-refused`、`execute.unchecked-advance`、`execute.goal`、`execute.completion-gate`、`execute.acceptance-review`、`execute.reconcile`、`execute.loop-entry`、`execute.loop-fallback`、`execute.loop-contribute`、`execute.peak-cap`、`operate.report`、`operate.patrol`。主 Agent 选模型的理由：类别与文字不进流水，流水只记 `execute.dispatch` 的模型与 `whyRef`（理由所在的节点与历史序号），理由文字留在会话日志与图上的派发批注（M7 0.4 §3.16、§5）。

#### M6 0.4 §14.2（`by: glm`，4 种，字段逐字取自那一节）

`glm.quota-read`（不带会话时写机器级，§3.5）、`glm.upstream-limit`、`glm.login-rejected`、`glm.peak-reminder`。积分、token 与每次调用的耗时已在用量流水里，GLM 包不重复交（M6 0.4 §14.2 末段），本设计第 3 步不再改 `src/glm-llm/zcode.ts`。

#### M3 附录 0.4 §3.12（`by: design`，8 种，字段逐字取自那一节）

`design.proposal-shown`（`propose_to_human` 成功返回：`kind`、`number`、目标 id、待决 id、`attach` 的前缀、`text` 的码点数）、`design.answer-recorded`（`record_human_answer` 成功返回，一次调用一条：`kind`、`answer`、`outcome`、目标 id、待决 id、从提议到含第一段原话的人的消息的毫秒数、原话的码点数、前一条主 Agent 消息里有没有「我记成」）、`design.answer-refused`、`design.holder-moved`（持有者记录建、换、删——主 Agent 是哪个会话由它认，本设计不再用 `session.main`，F2）、`design.rule-denied`、`design.bypass-refused`、`git.snapshot`、`git.snapshot-refused`。

### 4.3 口径

- 字数 `textUnits(s)`（`src/shared/text-units.ts`）：每个汉字、假名、谚文音节与全角字符算 1；每一段连续的 ASCII 字母与数字算 1（一个英文词）；标点与空白不算。M7 §3.12.3「中文按字、英文按词计」的同一口径，项目图、卡片、报告都用这一个函数。
- 一步：`agent/request` 瀑布（agent-loop:1191–1194）在每次模型请求之前给出 `(turn, step)`（F13）；按 agent id 记下最近一次 `agent/request` 的 `(turn, step)`，下一次带同一 `sessionId`、不带 `purpose` 的 `llm/stream` 就属于这一步。压缩与会话标题的调用带 `purpose`，不算步。`agent/request-error`（agent-loop:1136）给出本步的重试次数，写进 `llm.retries`。
- 用时：`llm.ms` 从调用 `llm/stream` 到流结束；`ttft` 到第一个 `text-delta`、`reasoning-delta` 或 `tool-call-delta`；`tool.ms` 是 `tool/result` 与 `tool/call` 两个会话事件的 `time` 之差（含审批等待）；问人的等待在 `design.answer-recorded` 里（M3 交）。
- 积分：写入时经计价服务 `glmHournessPricing` 的 `charged(model, usage, atMs)` 与 `peak(atMs)` 算（`src/shared/pricing.ts`，口径 `ORCHESTRATION.md` §11.2），保留 4 位小数。记的是当时规则下的数；没有计价服务或模型不在套餐里时不写这两个字段，报告只列 token。
- 工具类别 `toolCategory(name)`（`src/shared/tool-names.ts`）：`read`、`write`、`search`、`shell`、`graph`、`dispatch`、`memory`、`web`、`todo`、`question`、`mcp`、`other`。表覆盖 rc.3 的原生名（`DESIGN.md` §2.4a 工具名表）与 ZCode 别名（`src/glm-prompt/aliases.ts`），`mcp__` 开头的归 `mcp`，其余 `other`。派发类就是 `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 六个名字。
- 路径散列 `target`：文件工具的目标（`file_path`、`path`，字段表同 guard），在项目根之内用相对路径，之外用绝对路径；正斜杠，Windows 上转小写；取 `HMAC-SHA-256(key, 路径)` 前 12 位，`key` 是每个项目一份的随机 32 字节，放在 `<userDataHome>/metrics/keys/<项目键>`，不进流水、不随 `field-trial` 导出（F16）。用来算「改了、跑了、又回去改同一个文件」（标定的返工口径）；导出到别的机器上看不出是哪个文件。
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
| 一层记录 | 键是 id，值是整数、布尔、枚举或 id，字段表声明每个键的类型，至多 32 项；不能再嵌套（F1） |

缺必填、类型不对、有字段表之外的键、数组或记录超项：整条拒收，不截断、不改写，写一条 `reject`，行健康计数，控制台每个「种类 × 字段」告警一次。序列化后超过 4096 字节也拒收。

从不记：对话正文与提示词、推理内容、工具参数与结果正文、文件内容、路径原文、命令全文、审批理由、错误文字、转述原话、节点正文与选项文字、人发的消息正文、凭证、令牌、请求头、签名、设备 id。字段表里没有放得下它们的字段：字符串只许 id 形状，装不下一句话或一个 Windows 路径；数组只放 id 或整数；记录只一层。

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

`MetricsDest` 是项目根（`<root>/.llm/metrics/`）或机器级（`<userDataHome>/metrics/machine/`）；每个 `dest` 一条队列、一套序号与一条链，互不相干。一条事件的路径：

1. 校验（§4.4）。不合规就拒收，写 `reject`。
2. 这个 `dest` 在本进程里第一次出现：先排一条 `start`，并在打开当天文件时往账本追加一行（§5.5）。
3. 编号：`n` 取这个 `dest` 的下一个序号，`h` 按上一条的 `h` 算。编号与链都在入队时定，所以链的顺序就是序号的顺序，与什么时候写成功无关。
4. 入队。每个 `dest` 一条队列，至多 2000 条。满了就丢**队首之后最早的一条**（队首正在重试，不丢，F17），记进「待报的缺口」（序号范围与最后一条的 `h`）。
5. 排一次写（微任务）。每个 `dest` 同时只有一个写在进行，按队列顺序：
   - 第一次写这个 `dest`：`mkdir -p` 目标目录，以 `wx` 写 `.gitignore`（机器级目录不写 `.gitignore`，它在用户数据目录下、本来就不入项目库）。
   - 文件取队首事件 `at` 的 UTC 日期：`events-YYYY-MM-DD.jsonl`。本进程第一次写某个文件时读它的大小与最后一个字节：不是换行（上次崩溃留下的半行），这一次写的开头先补一个换行。
   - 一次 `appendFile` 写一整行（带结尾换行）。成功就出队，接着写下一条；有待报的缺口时，在队尾加一条 `gap`。
   - 失败：记下错误码（`EACCES`、`ENOSPC`、`EBUSY`、`ENOTDIR`、`EPERM` 等），停止写这个 `dest`，30 秒后重试（`setTimeout(...).unref()`），下一条事件进来时也会重试。队首的事件不丢，下一次从它开始，保证顺序。
6. 卸载：`close()` 给每个写过的 `dest` 排一条 `stop`，至多等 2 秒；没写完的就没了，下一次 `verify` 会把这个写入者报为没有正常退出。

写入器不缓冲成批：事件在一次微任务之内就写下去，宿主被杀时最多丢正在写和还在队里的几条。不调用 `fsync`：每条一次 `fsync` 在 Windows 上要几毫秒，模型流与工具调用多了以后是明显的开销；代价是蓝屏时最后几秒可能没落盘，由 §5.4 发现。

### 5.2 库写入口：DSH 之外的一次性进程（F4）

规则板的命令行 `check`、M6 的 `gateOnRules`、循环板之外的脚本在 DSH 之外运行，判完就退出。`openWriter().record()` 不等 I/O，这些进程在微任务之前就退出，事件会丢，且 `verify` 只看到一个没有 `stop` 的写入者，看不出少了哪条判定。所以给它们一个会等的入口：

```ts
/** Open a short-lived writer, record all events for the project of `dir`, close (2 s budget). Never throws. */
export function appendEvents(
  dir: string,
  events: readonly EmittedEvent[],
  host: 'cli',
): Promise<{ written: number, rejected: number, error?: string }>
```

`appendEvents` 按 `projectRootOf(dir)` 定位（`kind: 'cwd'` 时把事件写进机器级或不写，按事件声明），开一个 `host: 'cli'` 的写入者，逐条 `record`，`await close()`，返回计数。规则板、M6 与循环板在 DSH 之外只调它，并 `await` 它的结果再退出。宿主里照旧经服务的 `emit`（不等 I/O，队列与重试在常驻进程里）。

### 5.3 文件、大小与删除（F7）

- 一天一个文件，按事件 `at` 的 UTC 日期命名。没有改名、没有锁，多个写入者跨过午夜也不冲突。
- 体积估计：一条 250–450 字节。本机用量流水 2026-10-27 前后两天约 1080 次模型调用，按每天 600 次模型调用、同样多的工具调用、另有几百条其他事件算，约 0.5 MB/天；并行派发多个 worker 的日子按 3 倍算约 1.5 MB/天；一年 200–550 MB。
- 保留：写入器从不删除、不改写、不压缩。`/hourness` 的覆盖行与 `verify` 写出总大小。
- 删旧文件只有人能做，经 `npm run metrics -- prune --before <日期>`：先往项目流水（与机器级流水，若删的是它）各写一条 `prune {before, files, lines}`，再删那些文件。不提供给主 Agent 的工具或提示；主 Agent 按 `d-main-agent-shell` 能用 shell，所以 `metrics-files-only` 的 shell 判法把删除与移动也算进去（`Remove-Item`、`rm`、`del`、`mv`、`Move-Item`、`git clean` 带 `-x`），影子期记下、转生效后拦下。
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
| 文件丢失（F7） | 账本里有、磁盘上没有、又没有覆盖它的 `prune` 的文件 |
| 伪造（F21） | `start.host` 为 `cli` 的写入者写了只有宿主才会写的种类（`llm`、`tool`、`turn`、`approval`、`command`、`said`），报「命令行写入者写了宿主事件」 |

这些只能发现误写与丢失，不防有意伪造：会改文件或调写入器的人也能重算摘要；伪造一项只是便宜地报出来。

### 5.5 账本（F7）

写入者每打开一个新的日文件，在用户数据目录的账本 `<userDataHome>/metrics/ledger/<项目键>.jsonl` 追加一行 `{file, w, firstN, at}`（项目键同规则板 §7.3：`<根目录名>-<规整后根路径的 SHA-256 前 8 位>`）。账本只追加、不入项目库；它本身被删或损坏时，`verify` 只能少一项核对，不影响其余。`verify` 与后台自查对照账本：账本里有、磁盘上没有、又没有 `prune` 覆盖的文件，报「文件丢失」——这就补上了「一个写入者的全部行都在被删的那天、序号上看不出缺口」那个盲点。

### 5.6 多个进程

桌面版、headless（探针与标定）、命令行（`npm run graph`、`npm run metrics`、库写入口）都可能同时写同一个项目。每个进程是一个写入者，有自己的 `w` 与序号，互不协调，不用锁。

同一个文件的并发追加：每行一次 `appendFile`（Node 以追加方式打开，libuv 在 Windows 上用 `FILE_APPEND_DATA`），一行至多 4 KiB。〔推断〕本机 NTFS 上这样的追加不会交错。验收第 12 条用 L3 场景 `metrics-concurrent` 核实（两个进程各写 5000 条）。不通过时的退路已经定下：文件名改为每个写入者一份 `events-YYYY-MM-DD-<w>.jsonl`；读取从第一天起就按 `events-*.jsonl` 取文件，换退路只改写入器与账本的文件名规则。项目放在同步盘（OneDrive 等）里时，同步程序可能短暂占住文件，追加得到 `EBUSY` 或 `EPERM`，走 §5.1 第 5 步的重试。

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
  /** Record one event for the project of a session or directory, or machine-level. Never throws. */
  emit(event: EmittedEvent, where: { readonly sessionId?: string, readonly dir?: string, readonly machine?: boolean }): void
}

/** The service when the metrics row is active and the value has this shape; undefined otherwise. */
export function metricsOf(ctx: ServiceLookup): MetricsService | undefined
/** Emit through the service when present; adds `v` and `by` from the caller's package; swallows and counts errors. */
export function emitMetric(ctx: ServiceLookup, event: EmittedEvent, where: { readonly sessionId?: string, readonly dir?: string, readonly machine?: boolean }): void
```

`emitMetric` 在每次调用时 `ctx.get`（不需要 inject，指标行晚激活或没装都不影响调用方，`src/shared/pricing.ts:32` 的同一做法）。`v` 与 `by` 由调用方所在的包填：公共库编进两个包各自的 `dist/`，`src/shared/build-info.ts` 读本包的 `dist/build-info.json`。`tagQuestion` 删去（F2）：问人不再经卡片构造打标签。

| 发送方 | 名字空间 | 何时 | 现在有没有这段代码 |
| --- | --- | --- | --- |
| guard 行 `src/guard/index.ts` | `rule`（`by: guard`） | 写违规流水的同一处，拦截与影子记录都交；`ref` 是那一行文本的 `recordKey`（先序列化，再用同一份文本写流水和算键）。`recordKey` 按 M4 §3.2 的定义；M4 没合入时由本设计第 3 步加在 `src/guard/records.ts`，M4 沿用 | 有，本设计改 |
| 图文件门禁 `src/guard/graph-files.ts` | `rule`（`by: graph`） | 拒绝时 | 有，本设计改；M4 合入后两处都并进 `installRuleGate` 一处 |
| 项目图引擎 `src/graph/engine.ts` | `graph`（`by: graph`） | 见 §6.3 | 有，本设计改 |
| hourness 行 `src/report/index.ts` | `report`（`by: host`） | 每次 `/hourness` | 有，本设计改 |
| M4 的 `installRuleGate` | `rule`（含 `followup` 的 `outcome`）；`count`（压制注释数） | M4 §3.2、§3.3、§6.7 | M4 实现时 |
| 规则板 | `rules.*`（11 种，`by: rules`） | 规则板 0.8 §10.5 的各时刻；DSH 之外经 `appendEvents`（§5.2） | 规则板实现时 |
| 循环板 | `loop-*`（11 种，`by: loops`） | 循环板 0.4 §6.10 的各时刻；`loop-read`、`loop-contribution` 机器级 | 循环板实现时 |
| M7 的执行行与运维行 | `execute.*`、`operate.*`（22 种，`by: execute`/`operate`） | M7 0.4 §3.16 的各时刻 | M7 实现时 |
| GLM 通道 | `glm.*`（4 种，`by: glm`） | M6 0.4 §14.2 的各时刻；`glm.quota-read` 不带会话时机器级 | M6 实现时 |
| M3 的设计行 `src/design/metrics.ts` | `design.*`、`git.*`（8 种，`by: design`） | M3 附录 0.4 §3.12 的各时刻 | M3 实现时 |

兄弟各行只有一个出口 `emitMetric`（`src/<包>/metrics.ts`），接口到位之前什么都不做，事实照旧在各自的流水里（规则板 0.8 §10.5、M3 附录 0.4 §3.12、M7 0.4 §3.16、M6 0.4 §14.2 都这样写）。`emitMetric` 自带有上限的队列与 `gap`（§5.1），调用方不必另记丢失（M7 0.4 §3.16 的 `metrics-gaps.jsonl` 随 M7 下一次修订按「指标流水自带缓冲与重放」删去，§14）。只装 GLM 通道包时没有服务，`emitMetric` 什么也不做，GLM 的行照常。

### 6.3 项目图引擎

`EngineOptions` 加一个可选的 `observe(note: EngineNote): void`。引擎在 `commit` 里 `writeNodes` 成功之后（`src/graph/engine.ts:205`）对这次写入追加的每条历史各给一条，失败的返回路径给一条带错误码的；`observe` 抛错被引擎接住，不影响返回值。映射到事件的纯函数在 `src/graph/metrics-events.ts`：只映射节点、类型、操作、历史序号、修订号、身份、是否转述、状态前后（`graph` 事件的字段，§4.2）。plain-ui 0.6 取消了跟随率与计数拍板（§2 表末行、F2），所以不再有 `followed`、`counted`、`units` 的共用约定，`src/graph/inertia.ts` 不存在。图行（`src/graph/index.ts`）传 `note => emitMetric(ctx, …, {dir: 图目录})`；命令行（`src/graph/cli.ts`）自己开一个 `host: 'cli'` 的写入者传入，退出前 `close()`。项目根按图目录算（§3.3 第 5 条）。

### 6.4 后台自查（F6）

指标行激活、第一次写成功之后，在后台对每个已写过的 `dest` 跑一次 `checkLog`（§5.4），范围是前一天与当天的文件；只读，用 `setTimeout(...).unref()` 排到空闲，不阻塞任何一步。结果进行健康（「上次有 N 个进程没有正常退出，缺 M 行，链断 K 处，文件丢失 J 个」）与 `/hourness` 的覆盖行。这样崩溃、缺行、链断、整天文件被删，人与主 Agent 在下一次会话里就看得到，不用等谁想起来跑命令行。

另有一条每天一次的自查，走循环板：指标行经 `glmHournessLoops.contribute`（循环板 0.4 §3.1）交一条默认条目 `metrics.selfcheck`（`daily`，harness 动作，`by: 'dsh-hourness'`，`why`「每天查一遍指标记录有没有缺行、链断或被删，有就告诉主 Agent」），动作由指标行的 `runAction` 跑同一个 `checkLog`，有发现时带 `tell` 叫主 Agent 看一眼。页面显示为编排层带来的、只能看（`d-rules-visible`、`d-defaults-readonly`）。循环板没装时退路是后台自查已经覆盖，只是没有每天固定的那一次。

## 7. 读与计算

### 7.1 读取

`readLog(root, {from, to, basis?})`（`src/metrics/read.ts`）：

1. 列出 `<root>/.llm/metrics/events-*.jsonl`（或机器级目录）里日期落在 `[from, to)` 的文件，按文件名的字典序读（F19）。
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
| 覆盖 | 事件数、最早一条、今天几条；丢失、拒收、无法读取、未正常退出、文件丢失的次数；总大小 | F | `gap`、`reject`、`checkLog`、账本 |
| 任务 | 几件派出、几件做完、几件在等人、哪次检查没过（任务与命令序号） | F | `execute.*`（M7 0.4 §3.16） |
| 问人 | 次数、DSH 原生问题数、审批数（都是计数） | F | `design.proposal-shown` 条数；`ask`、`approval` |
| 每步 | 每步 token 与积分（中位数）、用时、首字用时（中位数、最长）、结束原因分布 | S | 带 `turn`、`step`、不带 `purpose` 的 `llm`，按模型分组 |
| 工具 | 每步工具调用数、结果分布、被拦率、按类别的出错率、返工次数 | S | `tool` 按 `(sid,turn,step)` 归到步；被拦率 = `denied`/全部；返工 = 同一 `target` 的第二次成功写入，且两次之间同一会话有过 `shell` 调用 |
| 拦截 | 按规则与模式的次数、拦截后下一步走对的比例（有 M4 跟进时） | S | `rule` 事件 |
| 积分 | 按模型、按角色、高峰占比 | S | `llm` 的 `credits`、`peak`；角色由会话 id 与 `execute.dispatch` 的 `child`、`role` 连接，主 Agent 会话由 `design.holder-moved` 得到（F2），其余「其他」 |
| 任务（打分） | 每个任务的尝试次数、第一次派发到合入的时长（DORA 前置）、门禁一次通过率、审查轮数与挡路发现数、返工率、失败与重试按码 | S | `execute.*`；返工是 `graph` 事件里任务从 `done` 回到 `doing` |
| 问人（打分） | 每次要读的字数、等待时长（中位数、最长）、原样同意/补充/否掉各占几成 | S | 字数 = `design.proposal-shown` 的 `text` 码点数之和 + 主 Agent 会话的 `llm.text` 之和；等待 = `design.answer-recorded` 的毫秒数；三类按 `answer` 分（`agree`、`add`、`reject`），按 `kind`（`question`、`confirm`、`release`）分组 |

问人的次数口径（F2）：次数 = `design.proposal-shown` 条数（`confirm`、`release` 也在内，它们不写图但写这条事件，所以数得到）；原样同意率只按 `record_human_answer` 的调用（`design.answer-recorded`，一次调用一条），不从图历史数（一次放行写下 N+1 条带「同意」的历史，plain-ui 0.6 §5.6）。

### 7.3 报告怎样改用它

- `/hourness`（`src/report/index.ts`、`src/workflow/morning-report.ts`）：报告的项目是调用会话的项目根（`invocation.agent.session.header.cwd`，commands:379–385）。它的输出经主 Agent 的对话给人（`d-one-main-agent`），所以只用 `factsFor`（F9）：派遣次数、拦截计数、几件做完/在等人、哪次检查没过、今天的用量计数、覆盖范围（末尾一行「记录：最早 <日期>，今天 <N> 条，本进程丢了 <K> 条（<原因>）；上次自查 <结果>」）；「面板」一节照旧读用户级用量流水，标题写明「本机全部项目」。不含任何比率与比较。读不到指标流水时（行没启用、项目没有 `.git`）写明原因，其余照旧。生成之后交一条 `report` 事件。
- M7 的四答晨报、人的负担与质量对照、DORA（M7 §3.10、§3.12、§3.13）：事实（计数、哪件做完、哪件没过）由 `factsFor` 算，经主 Agent 给人；打分（比率、比较、按模型或版本）不进主 Agent 的对话，只给命令行与 M8（F9）。M7 若认为周报必须带比率给人，那是与 `CHARTER.md` §8 的冲突，按必须问人的方向性岔路以四行问人，不由本设计替人定。M7 设计下一次修订按 §14 改来源列与这条分界。
- plain-ui：报告里的原样同意率从 `design.answer-recorded` 算，属打分，面板显示（M8），不经主 Agent 的对话（plain-ui 0.6 §11 也写明面板不显示这个比例、由流水与周报给）。

### 7.4 比较版本

`compare(events, by, window, basis?)`，`by` 取 `v`（构建）、`model`、`host`、`role`（不再有 `pres`，F2）。每组列同一套打分指标与样本数，不做显著性检验：用户只有一人，样本小，只看走向（`CHARTER.md` §8）。compare 属打分，只给命令行与 M8。「同样的数据上比版本」靠只追加：同一段真实使用里按 `v` 分组；或新代码对旧流水重算，要复现某一份旧报告就检出那时的提交、用它依据行里的文件前缀带 `--basis` 重跑（§7.5、F8），输出逐字相同。

### 7.5 命令行

`npm run metrics -- <子命令> [--project <目录>] [--from <ISO>] [--to <ISO>] [--tz <±HH:MM>] [--basis '<文件>:<行数>[,…]'] [--json]`（`scripts/metrics/cli.ts` 调 `src/metrics/cli.ts`，写法同 `npm run graph`）：

| 子命令 | 做什么 | 写不写流水 |
| --- | --- | --- |
| `summary` | §7.2 的全部指标（事实加打分；给编排方与人用命令行时看） | 不写 |
| `verify` | §5.4 的核对；另外三项对账：图历史里有而流水里没有的条目；每个会话的 `llm` 事件数与用量流水同一会话的行数；账本与磁盘。没有发现退出码 0，有发现 1 | 不写 |
| `compare --by <键>` | §7.4 | 不写 |
| `prune --before <日期>` | §5.3：先写 `prune` 事件再删旧文件；只给人用 | 写 |
| `backfill-graph` | 读图，把早于流水里第一条实时 `graph` 事件、且 `(node, hi)` 还没有的历史条目补成 `graph` 事件，`src: 'history'`，写入者 `bf-<HEAD 前 7 位>`。重跑不重复。打印补了几条 | 写 |

参数校验：`--from`、`--to` 必须能被 `Date.parse` 解析；`--tz` 匹配 `^[+-]\d{2}:\d{2}$`；`--project` 必须是存在的目录且 `projectRootOf` 为 `kind: 'git'`；`--basis` 的每一项文件名匹配 `^events-\d{4}-\d{2}-\d{2}(-[0-9a-f]{8})?\.jsonl$`、行数为正整数；`--before` 是日期。不合格退出码 2，打印用法。

## 8. 量不到的

这些只能靠真实项目里的试用（`dogfood`，之后 `field-trial`）与人的反馈，流水里没有，报告里照实写「量不到」：

- 人在系统外花的精力：读代码、想问题、在别处查资料、和别人商量的时间。流水只有人在 DSH 里发消息、点命令的时刻。
- 人读懂了没有：字数与等待时长只是代理量。等得久可能是难，也可能是人走开了。
- 跟了的推荐对不对：流水能给出「拍板之后 7 天内因这个决定返工」的次数（M7 §3.12.3），给不出没返工的决定是不是好决定。
- 做出来的东西好不好用、合不合人的本意：门禁与审查只查写下来的验收条件。
- 主 Agent 的话好不好懂：流水有字数，没有内容（§4.4），也不打分。
- 同一账号在 ZCode 等其他客户端的消耗（`ORCHESTRATION.md` §11.3）。
- 桌面版没开、宿主没运行时发生的事。
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
| 会话有但找不到项目根（`kind: 'cwd'`） | 行健康「无项目的事件 N 条」 | 按设计不写（§3.3 第 3 条）；机器级的另写机器级（§3.5） | 行健康 |
| 事件不合字段表（代码缺陷） | 拒收并写 `reject`；行健康计数；控制台按「种类 × 字段」告警一次 | 不重试；L2 的字段表测试拦住大多数 | `reject` 的 `of` 与 `field` |
| 观察代码自己出错（缺陷） | `try/catch` 接住，行健康「内部错误 N 次」，控制台告警一次 | 模型流、工具调用、问题请求的结果原样交回，不受影响 | 行健康；控制台 |
| 计价服务没有或抛错 | `llm` 事件不带 `credits` | 报告按 token 列 | 行健康说明「积分口径：未提供」 |
| 崩溃、蓝屏、被杀 | 后台自查（§6.4）与 `verify`：没有正常退出、无法读取的行 | 新写入者补换行再写，不截断旧文件 | 文件与行号；没有 `stop` 的写入者 |
| 整天文件被删 | 账本对照（§5.5）：报「文件丢失」 | 不可恢复（数丢了）；经 `prune` 删的有记录不报 | `prune` 事件；`verify` 退出码 1 |
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
- 只写 `<root>/.llm/metrics/` 与机器级目录之下；`.gitignore` 以 `wx` 写，已有的文件不覆盖。
- 删旧文件只有人能做，经 `prune`：先写 `prune` 事件再删，账本对账能发现未经 `prune` 的删除（§5.3、§5.5、F7）。主 Agent 没有删它的工具；`metrics-files-only` 的删除与移动判法在影子期记下、转生效后拦下。
- 补录只追加，重跑不重复。
- 字段表闭合，不会写进凭证与文字。万一某个缺陷让不该有的东西进了流水，补救是经 `prune` 删掉那几天的文件：这会丢那几天的数，所以字段表的测试是 L2 的硬门（验收第 6 条），改字段表与各名字空间表的提交走独立评审（§12 第 1 步）。
- `workflow` 行退役不删 `decisions.jsonl`（用户数据）；退役前的 L3 预检用的是带覆盖层的临时 profile，不碰用户的 profile。

### 9.4 外部输入的校验

| 输入 | 规则 | 不合格时 |
| --- | --- | --- |
| 别的行交来的事件 | §4.4 字段表（信封加正文） | 拒收，`reject` |
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
| 只有 harness 写 | 写入器是唯一的写文件代码；服务不注册工具；guard 规则 `metrics-files-only` 记下（以后拦下）工具与 shell 的写、删、移；链式摘要与账本发现误写与删除 | 写的路径只有一条，堵在这里最省；工具层的门禁防的是 agent |
| 不记文字与秘密 | `src/metrics/schema.ts` 加 `kinds/*` 的字段表 | 所有事件从这里过，调用方的错误也在这里被挡 |
| 序号连续、链按序号 | 写入器在入队时编号 | 写入的先后可能被重试打乱，编号的时刻不会 |
| 同样的输入同样的输出 | `calc.ts` 是纯函数，窗口、时区与 `basis` 显式传入 | 时钟与环境只在边上读一次，写进依据行；`basis` 把输入锁到文件前缀（F8） |
| 节点状态以图为准 | 项目图引擎；`graph` 事件只是测量 | 图是人和 agent 编辑的对象，流水是事后的计量 |
| 账号用量以用户级用量流水为准 | memory 行 | 跨项目的账不能按项目拆着存 |
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
| spawn 后端的 worker 在外部子进程（F22） | subagent:1486–1502（`startExternal`） | 〔实读〕 |

%%NEXT%%
