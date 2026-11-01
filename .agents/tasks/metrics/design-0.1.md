# metrics 设计：每个项目一份指标流水（项目图 `metrics`）

版本：0.1（2026-10-30，初稿，待独立设计评审）

依据：main `bab224a`；项目图节点 `metrics`（2026-10-29 人批准，原话「指标能全记就全记下，b直接做」）；`.agents/tasks/design-context.md` 全部各节；`docs/CHARTER.md` 0.6（§3.2 第 5 条、§7.1 条款 7 与 11、§8）；`docs/DESIGN.md` §2.4、§2.4a、§2.5；`docs/ORCHESTRATION.md` §10、§11、§12；`docs/DEVELOPMENT.md` §1.1；本仓库源码 `src/memory/audit.ts`、`src/memory/index.ts`、`src/workflow/index.ts`、`src/workflow/morning-report.ts`、`src/report/index.ts`、`src/shared/data-home.ts`、`src/shared/lm-min.ts`、`src/graph/engine.ts`；已有流水 `.llm/audit/decisions.jsonl`（15 行）与 `.llm/audit/violations.jsonl`（4 行）；设计 M7 `.agents/tasks/m7/design.md`（§3.4.4、§3.10–§3.15、§5）、M4 `.agents/tasks/m4/design.md`（§3.2–§3.5）、plain-ui `.agents/tasks/plain-ui/design.md`（§3.9）、M6 `.agents/tasks/m6/design.md`（§4.5、§6.2、§13）、规则板 `.agents/tasks/rules/design.md`（§7.3、§7.6、§10.5）、接管 `.agents/tasks/bootstrap/design.md`（§4 末段，`projectHome` 钉死在本仓库的问题）。

证据写法沿用 `docs/DESIGN.md` §2.4a：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行号；`types.d.ts:行` 指 `node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts`。〔实读〕读过源码；〔推断〕由源码推出、没有运行验证；〔未核实〕列进 §11，实施时先核实。

## 0. 摘要

- 每个项目一份只追加的事件流水：`<项目根>/.llm/metrics/events-<UTC 日期>.jsonl`。项目根按会话头的 `cwd` 找 git 仓库根（与规则板 §7.3 同一个算法，工作树归到主检出），不用数据目录服务里钉死的 `projectHome`。目录里自带一个只写 `*` 的 `.gitignore`，不碰项目自己的忽略配置。
- 只有 harness 写。新行 `glm-hourness/metrics`（编排层包，出厂 `disabled: true`）是唯一的写入者：它自己挂在 DSH 的通用接缝上记每一次模型调用、每一次工具调用、回合、审批与命令；别的行与 GLM 通道包经进程内服务 `glmHournessMetrics` 交给它领域事件（门禁拦截、项目图的每次写入、问人的卡片、M7 的派发、审查、门禁与合入、上游应答）。模型说的数一律不收：没有任何工具能写这份流水，工具参数与模型交回里的数字不进流水。
- 记的是数与引用，不记文字：闭合的字段表，字符串只许 id 形状（ASCII 字母数字与 `_.:@+/-`，至多 120 字符），不合规的整条拒收并计数。文件路径记散列，shell 命令只记第一个词。
- 写入失败不挡工作：写入器从不把错误抛给调用方；失败的事件留在有上限的内存队列里按序重试，溢出时丢最早的并在恢复后写一条 `gap` 说明丢了多少；行健康降级并写明原因。每行带写入者 id、序号与链式摘要，事后能查出缺行、改行与没有正常退出的进程（蓝屏）。
- 报告从流水算：读取、去重、排序、计算都是纯函数，同样的文件前缀得到逐字相同的输出；输出写明依据的文件与行范围、计算版本。按构建版本、模型、问法分组比较。`npm run metrics -- summary | verify | compare | backfill-graph` 给编排方用。
- 已有的数：用量流水（用户级，整个账号）、额度流水、违规流水的文字与标注、规则板的状态流水、项目图历史、会话日志都保留，各管各的；指标流水对它们只记数与引用。只有派遣决策流水 `decisions.jsonl` 被完全取代，它的写入行 `workflow` 在最后一步退役。
- 量不到的照实写：人在系统外花的精力、读懂了没有、做出来的东西好不好用、跟了的推荐对不对，只能靠真实项目试用（`field-trial`）与人的反馈。
- 待人定：只有一件，D1「这几件活怎样算做完」（§16，必须问人的第 1 类）。

## 1. 需求与验收

### 1.1 来源

- 人 2026-10-29：「还有为了后续项目的优化，能不能做到所有指标都可以量化记录啊？」；批准时「指标能全记就全记下，b直接做」。
- 节点 `metrics` 正文（已批准的范围）：每个项目一份只追加的事件流水，固定格式，只记数与引用、不记对话正文；每一步的模型、token 与积分、用时、工具调用与被拦次数、派活、审查发现、返工、合入、失败与重试、问人的次数、人读了多少字、拍板等了多久、是否跟了推荐，都由 harness 写，模型写的数不算；晨报、周报、各种指标都从这一份算，同样的输入算出同样的数。量不到的照实写。
- `docs/CHARTER.md` §3.2 第 5 条（减负只量系统里看得到的数）、§8（只看曲线；指标不注入模型上下文；基线从早采集）、§7.1 条款 11（处处留痕，一处动作一个事实源，别处引用）。
- `design-context.md`「Main agent direction」：`d-main-agent-models`（主 Agent 选每个子 agent 的模型并写明理由，harness 只记录）、`d-one-main-agent`、`d-auto-drive`。

### 1.2 功能需求

| 编号 | 需求 |
| --- | --- |
| F1 | 每个项目一份只追加的事件流水，放在项目目录下，固定格式，可轮换，不入库 |
| F2 | 每一步记：模型与 provider、token（输入、缓存读、缓存写、输出、推理）、积分与是否高峰、用时与首字用时、结束原因、本步发出的工具调用数；每次工具调用记：工具与类别、结果（成功、出错、被拦、被审批拒）、用时、结果大小；每次被拦记：规则、模式、拦截方，引用违规记录 |
| F3 | 每个任务记：派发（任务、第几次、子会话、角色、选的模型与档位、主 Agent 给的理由类别）、计划提交与批准、交回、审查（轮次、挡路与非挡路发现数、结论）、门禁（通过与否、失败的命令序号、用时）、合入（提交）、重开、失败与重试 |
| F4 | 每次问人记：问了什么（引用，不记文字）、在哪问（卡片、面板、对话、DSH 原生问题、审批）、问法（普通、先想后看）、选项数与推荐的位置、人要读的字数、等了多久、选了哪项、是否跟了推荐、是否先看了推荐 |
| F5 | 项目图的每一次写入记一条：节点、类型、操作、状态的前后、身份、是否转述、拍板的选项与推荐；写入失败记错误码 |
| F6 | 只有 harness 写；模型报的数不收；没有工具能写这份流水；模型的选择（选了哪个模型、哪个理由类别）作为「选择」记，不当量出来的数用 |
| F7 | 报告与比较从这份流水算；同样的输入得到逐字相同的输出；能按 harness 版本、模型、问法分组比较 |
| F8 | 隐私：只记数与引用，不记对话正文、工具参数、文件内容、路径原文、命令全文、错误文字、凭证与请求头 |
| F9 | 写入失败不挡工作，能被发现并上报；记录跨重启保留；事后能追到原因（`DEVELOPMENT.md` §1.1） |
| F10 | 已有的数（用量、违规、决策、项目图历史、额度、标定结果）盘点清楚，能并的并，不能并的只引用，不重复存一份当第二个事实源 |
| F11 | 写明量不到的，交给 `field-trial` 与人的反馈 |

### 1.3 非功能需求

- 开销：每次模型调用与工具调用多一次内存操作与一次追加写；不加锁等待、不阻塞流。一行至多 4 KiB。
- 体积：估计重度使用一天 0.5–1.5 MB（§5.3），一年数百 MB 以内。
- 两个包各自单独装上都能工作：只装 GLM 通道包时没有指标流水（没有写入者），GLM 包的行照常；只装编排层包时没有 `upstream` 事件与积分。
- 激活期不抛错（`AGENTS.md`）；行健康上报（`DESIGN.md` §2.5）；不新增告警。
- 指标不注入模型上下文（`CHARTER.md` §8）：流水与报告只给人与编排方看，不进每步投影、提醒或系统提示词。

### 1.4 验收条件（草稿，D1 由人定）

1. 指标行启用后，L3 探针的 GLM 场景与非 GLM 场景里，每次模型调用在 `<ws>/.llm/metrics/events-<日期>.jsonl` 恰好留下一条 `llm` 事件：provider、model、各类 token 与该次 `usage` 块相同，`ms` 大于 0，`fin` 与流的结束原因一致，`turn`、`step` 与会话里该步的 `agent/pre-step` 一致；同一次调用在用量流水里的那一行 token 数相同。
2. 同一探针里，`tool` 事件的条数等于会话日志里 `tool/call` 事件的条数；被 guard 拦下的调用 `out` 为 `denied`，同一 `call` 有一条 `rule` 事件，它的 `ref` 等于违规流水里那一行的记录键（M4 §3.2 的 `recordKey`）。
3. L2：项目图引擎每次成功的写入（图工具、`/graph-apply`、命令行）为它追加的每一条历史各留一条 `graph` 事件，带节点、操作、状态前后、身份；`decide` 带选项、推荐与是否跟随；写入失败留一条带错误码的 `graph` 事件。
4. L3：一次 `userQuestions.ask` 留下 `ask` 与 `answer` 两条事件，`q` 相同，`ask` 带选项数与字数，`answer` 带用时与结局；L2：经卡片构造打过标签的问题，`ask` 带 `pres` 与 `rpos`。
5. 隐私：L2 性质测试，写入器拒收带未知键或字符串不合 id 形状的事件并计数；L3 扫描探针留下的指标文件，找不到探针自己的提示词、工具参数、文件内容、凭证文件与请求头里的任何 8 字符以上的片段。
6. 失败：L2 把指标目录换成一个同名文件，模型流与工具调用的结果逐字不变，行健康为部分生效并写明原因；故障解除后排队的事件按序号写入；只有队列溢出时才有 `gap`，其中 `lost` 等于丢掉的条数。
7. 重启：L2 造一份以半行加 NUL 字节结尾的文件，新的写入者第一行从新行开始；读取把那一行计为无法读取并写出文件与行号，其余照算；`verify` 报出上一个写入者没有正常退出。
8. 确定性：L2 用固定的事件文件算两次，输出逐字相同；把同一批行打乱顺序后输出仍相同；输出第一行写明文件、行范围与计算版本。
9. 比较：`npm run metrics -- compare --by v` 对含两个构建的夹具，按构建列出每步用时与 token 的中位数、每个任务的积分、跟随率，以及每组的样本数。
10. 追查：`npm run metrics -- verify` 报出每个写入者缺的序号、链断的位置、没有正常退出的次数、流水开始之后项目图历史里有而流水里没有的条目、每个会话 `llm` 事件与用量流水条数不一致之处；没有发现时退出码 0，有发现时 1。
11. 报告：`/hourness` 对本仓库的会话，派遣次数与拦截计数从指标流水算（L2 对夹具），并多一行覆盖范围（最早一条、今天几条、本进程丢了几条）。
12. 并发：L3 两个进程同时往同一个项目流水各追加 5000 条，10000 行全部能解析，每个写入者的序号齐全；不通过时改用每个进程一份文件（§5.2 的退路），同一检查通过。
13. 包：新行出厂 `disabled: true`；`npm run build`、`npm run preflight`、`npm test` 全绿；L3 启用该行真实启动无新错误；探针通过之后才在 bundle 里默认启用。
14. 体积：批次 L4 记一天真实使用的流水大小，写进 `docs/FACTS.md`；超过 5 MB 时在节点上批注并查原因。
15. 退役：`workflow` 行退役之后，L3 带用户 profile 同形的覆盖层（含给 `glm-hourness/workflow` 的 `home` 覆盖）真实启动无新错误；不通过就停下交人（§12 第 9 步）。

### 1.5 让人少做了什么（question-27 B）

这份流水本身不减负，它让减负可以被量：人每周被问几次、每次读多少字、等多久、跟了几次推荐、因人的决定返工几次，以前散在图历史与设计里，有的根本没有记（卡片的用时、DSH 原生问题与审批、主 Agent 在对话里写给人的字数）。以后改提示词、换模型、换问法，前后对照用的是同一份数据和同一套算式。人不需要读这份流水。

### 1.6 不做的事

- 不做新的面板或页面：报告仍是 `/hourness` 与 M7 的晨报、周报；面板上的指标页属于 M8。
- 不按指标自动调整任何行为（换模型、换问法、限流）：只记录与报告。先想后看的触发仍按 plain-ui §3.9 从项目图算。
- 不记人在对话里打的字（内容与字数都不记）：需求里没有，DSH 用户消息的事件形状也没有核实（§11 第 6 条）。以后要加，是加一个事件种类。
- 不把用量流水按项目拆开、不迁移历史用量：用量跟账号走（`DESIGN.md` §2.4），面板看整个账号；项目流水从启用那天起记。
- 不做匿名化导出与回收：属于 `field-trial`。
- 不改宪章，不改用户的 `~/.dsh` profile。

## 2. 现状：已有的数在哪

| 已有的 | 位置与写入者 | 记什么 | 本设计怎样处理 |
| --- | --- | --- | --- |
| 用量流水 | `<userHome>/audit/usage.jsonl`，memory 行（`src/memory/index.ts`） | 每次模型调用的 provider、模型、token、用途、会话 | 保留，照写：它是整个账号的账，面板、M6 的预估、标定运行器都读它，范围是一台机器的所有项目。指标流水的 `llm` 事件是同一次调用在本项目里的记录，另带用时、步、积分与结束原因。两者的条数由 `verify` 按会话对账（验收第 10 条），对不上就报 |
| 违规流水 | `<projectHome>/audit/violations.jsonl`，guard 行；M4 起还有跟进、申报、放行与规则板的记录 | 拦截与影子记录，带纠偏全文 | 保留：纠偏文字、M4 的标注（按行的 `recordKey`）与回归语料都靠它。指标流水的 `rule` 事件只记规则、模式、结果与 `ref`（那一行的 `recordKey`），报告的拦截计数从指标流水算 |
| 派遣决策流水 | `<projectHome>/audit/decisions.jsonl`，workflow 行（`src/workflow/index.ts`） | 派遣类工具调用的等级（全是 L1）与从参数截的 120 字主题 | 被取代：`tool` 事件按类别 `dispatch` 记了同样的调用，还不记参数文字。晨报的「决策曲线」改从指标流水算（§7.3）；workflow 行在最后一步退役（§12 第 9 步）；旧文件留在磁盘上不删 |
| `dialect-init.jsonl` | 已删（`DESIGN.md` §2.4，2026-10-29） | — | 无 |
| 项目图历史 | `docs/graph/nodes/*.json` 的 `history`，引擎写 | 每次写入的时刻、身份、操作、理由、转述原话 | 保留为节点状态与文字的事实源。`graph` 事件只记数与引用（节点 id、历史序号、修订号），两者不一致时以图为准，`verify` 报差。启用前的历史由 `backfill-graph` 一次补成事件（§7.5），让人的负担曲线从 2026-10-28 开始 |
| 额度流水、用量缺口 | `<userHome>/audit/quota.jsonl`、`usage-gaps.jsonl`（M6 设计 §4.5、§6.2） | 账号的额度读数、删过的用量 | 保留，不进项目流水：它们属于账号，不属于项目 |
| 规则板的状态流水与命中计数 | `<userHome>/rules/projects/<项目键>/journal.jsonl`、`hits.json`（规则板 §7） | 规则与等待单的状态 | 保留：那是规则板的状态存储。规则板对每次拦截、排队、只记录各交一条 `rule` 事件（`by: 'rules'`） |
| M4 的压制计数、标注 | `<projectHome>/audit/suppressions.jsonl`、`labels.jsonl` | 每天的压制注释数；人对记录的判断 | 压制计数改为每天一条 `count` 事件（M4 实现时直接写这里，不另建文件）；标注保留在 `labels.jsonl`（那是判断，不是测量） |
| M7 的门禁结果、派发与交回批注 | `<项目目录>/gate/<任务>/<时间>/result.json`；图上的批注 | 门禁每条命令的日志路径与结论；派发次数、计划版本、问答计数 | 明细照旧在 `result.json` 与会话日志；`task` 事件记数（§4.2），批注照旧引用 `childId`。M7 §3.4.4 的「问了几次」等计数改从 `task` 事件算 |
| 标定结果 | `.llm/calibration-runs/<时间>/…/result.json` | 每次运行的完成、步数、积分、返工等 | 保留运行器自己的记分；运行目录是一个 git 仓库，指标流水自然落在它的 `ws/.llm/metrics/`，`result.json` 加一节用同一套算式算出的 `metrics`（§12 第 8 步） |
| 会话日志 | `~/.dsh/sessions/`，DSH 写 | 对话全文与事件 | 不动，是对话的事实源；指标事件带会话 id 与调用 id，可以回查 |
| plain-ui 的跟随率 | 由项目图历史当场算（`src/graph/inertia.ts`，plain-ui §3.9.1，尚未实现） | 最近 10 次拍板里跟了几次推荐 | 触发先想后看的那个数仍从图算（它决定行为，图是事实源）；报告里的跟随率从 `graph` 事件算，计数规则共用同一个判定函数 |

结论：新的事件流水只新增别处没有的数（每步的用时与结束原因、工具调用的结果与用时、问人的用时与问法、审批与命令、任务各阶段的计数），对已有的数只记引用加计算要用的数字。唯一完全并进来的是派遣决策流水。

## 3. 总体设计

### 3.1 依据的学科与标准

- 事件溯源与只追加日志（Fowler，Event Sourcing；Kleppmann，《数据密集型应用系统设计》第 11 章）：事件一旦写下不改，报告是事件的纯函数，所以同样的前缀得到同样的数。
- 结构化日志与 JSON Lines（jsonlines.org）：一行一个对象，以换行分隔，坏一行不影响别的行。
- OpenTelemetry 生成式 AI 语义约定（`gen_ai.usage.input_tokens`、`gen_ai.response.finish_reasons`、`gen_ai.request.model`）：每次模型调用记哪些字段按它取，名字按本仓库已有的 `TokenUsage` 词汇（`src/shared/lm-min.ts`）。不引入 OpenTelemetry SDK：只要一份本地文件，SDK 的导出器、采样与上下文传播都用不上。
- DORA 四项指标（M7 §3.13）与 SPACE 框架里「只量看得到的活动、配合人的反馈」的原则（Forsgren 等，2021）。
- 数据最小化（GDPR 第 5 条第 1 款 c 项的原则）：只收计算要用的字段；字段表闭合，未知字段拒收，而不是事后脱敏。
- Goodhart 定律与 `CHARTER.md` §8：指标不进模型上下文，量到的数不反过来驱动模型。
- 防篡改的散列链（与 git 对象链同一思路）：只用来发现误写与缺行，不防有意伪造。

### 3.2 构件与位置

| 构件 | 文件 | 新建或改 |
| --- | --- | --- |
| 事件的类型与字段表、校验 | `src/metrics/schema.ts` | 新建 |
| 写入器（序号、链、队列、重试、轮换） | `src/metrics/writer.ts` | 新建 |
| 读取（逐行解析、去重、排序、链与序号核对） | `src/metrics/read.ts` | 新建 |
| 计算（每步、每任务、每次问人、分组比较；纯函数） | `src/metrics/calc.ts` | 新建 |
| 通用接缝上的观察（模型流、步、会话事件、问题） | `src/metrics/observe.ts` | 新建 |
| 行入口 `glm-hourness/metrics`：提供服务、挂接缝、报行健康 | `src/metrics/index.ts` | 新建 |
| 命令行 | `src/metrics/cli.ts`、`scripts/metrics/cli.ts`、`package.json` 的 `metrics` 脚本 | 新建 |
| 服务契约与发事件的帮手（两个包共用） | `src/shared/metrics.ts` | 新建 |
| 项目根（规则板 §7.3 的算法，两处共用） | `src/shared/project-root.ts` | 新建；规则板实现时导入它，不另写一份 |
| 字数（中文按字、英文按词，M7 §3.12.3 的口径） | `src/shared/text-units.ts` | 新建 |
| 构建戳 | `scripts/build-info.mjs`（`npm run build` 最后一步）写 `packages/*/dist/build-info.json`；`src/shared/build-info.ts` 读本包的那一份 | 新建；`package.json` 的 `build` 改 |
| 工具类别表 | `src/shared/tool-names.ts` 加 `toolCategory(name)` | 改 |
| 项目图引擎的观察者 | `src/graph/engine.ts` 的 `EngineOptions` 加 `observe`；`src/graph/index.ts`（图行）与 `src/graph/cli.ts` 传入 | 改 |
| guard 与图文件门禁交 `rule` 事件 | `src/guard/index.ts`、`src/guard/graph-files.ts`（M4 合入后改在 `installRuleGate` 一处）；记录键 `recordKey` 在 `src/guard/records.ts`（M4 先合入就用它的） | 改 |
| GLM 通道交 `upstream` 事件 | `src/glm-llm/zcode.ts`（每次上游应答或网络错误之后） | 改 |
| 晨报改读指标流水 | `src/workflow/morning-report.ts`、`src/report/index.ts` | 改 |
| 行登记 | `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（`disabled: true`）、`src/shared/health.ts` 的 `HOURNESS_ROWS`、`tests/contracts.spec.ts` 的行清单 | 改 |
| 测试 | `tests/metrics-schema.spec.ts`、`tests/metrics-writer.spec.ts`、`tests/metrics-read.spec.ts`、`tests/metrics-calc.spec.ts`、`tests/metrics-row.spec.ts`、`tests/fixtures/metrics/`；`package.json` 的 `test` 列表 | 新建 |
| 探针场景 | `scripts/probe/` 的 `metrics` 与 `metrics-concurrent` 两个场景 | 改 |
| 文档 | `docs/ORCHESTRATION.md` 新增 §10.6「指标流水」并改 §10.1 的来源列；`docs/DESIGN.md` §2.4 数据表加一行、§2.4a 对照表加本设计用到的接口、§2.5 行健康表加一行；`docs/HANDOFF.md` | 改，随各步同一批提交 |

技术栈锁定：TypeScript strict（`exactOptionalPropertyTypes`），Node 22 内置模块（`node:fs/promises`、`node:crypto` 的 SHA-256、`node:readline`），不加依赖。

### 3.3 放在哪：项目根下的 `.llm/metrics/`

「项目目录」在本仓库的词表里是工作区的 `.llm/`（`DESIGN.md` §2.4）。今天违规与决策流水按数据目录服务的 `projectHome` 写，这个值在 profile 里钉在本仓库的 `.llm`（接管设计 §4 末段指出：在别的项目里干活，记录仍写进本仓库）。指标流水要「每个项目一份」，所以不用 `projectHome`，按会话算项目根：

1. 会话：`agents.get(sessionId)` 取活 agent（agent:596），读 `session.header.cwd`（session:1820–1826）。委派子会话的 `cwd` 是父会话的目录（subagent:346–355），worker 的事件因此落在主会话的项目里。
2. 项目根：`projectRootOf(cwd)`（`src/shared/project-root.ts`），算法与规则板 §7.3 相同：从 `cwd` 往上找 `.git`；是目录，根是它的父目录；是文件（git 工作树），读 `gitdir:` 与 `commondir` 得到公共目录，根是公共目录的父目录。只读文件，不起 git 进程，按 `cwd` 缓存。主检出与 `.worktrees/*` 是同一个项目。
3. 找不到 `.git`：这个会话没有项目，事件不写（计入行健康的「无项目的事件 N 条」）。不在任意目录里建 `.llm/`（例如会话目录是用户主目录时）。
4. 目录：`<根>/.llm/metrics/`。第一次建目录时以 `wx` 写一个内容为 `*\n` 的 `.gitignore`（已在就不动）：目录自己把自己从 git 里排除，不改项目的 `.gitignore` 或 `.git/info/exclude`。本仓库的 `.llm/` 本来就被忽略，多这一个文件无害。
5. 命令行：`--project <目录>`，默认当前目录，按同一个函数算根。项目图的写入按图目录（`<根>/docs/graph`）算根。

标定的每次运行目录 `ws/` 是新初始化的 git 仓库（`ORCHESTRATION.md` §10.5.1），它的事件落在 `ws/.llm/metrics/`，与真实项目天然隔开；探针同理。

### 3.4 谁写：只有 harness

- 写入者只有一个模块：`src/metrics/writer.ts`。进程里由指标行持有（宿主），命令行进程各自持有一个（`host: 'cli'`）。
- 指标行自己观察 DSH 的通用接缝（§6.1），得到的都是宿主在执行边界上看到的事实：流里的 `usage` 块、时钟、会话事件。
- 其余事件经服务 `glmHournessMetrics` 交来，调用方都是本仓库的宿主侧代码（§6.2）。服务只在进程内，不注册任何工具，模型调不到它。
- 不收模型报的数：工具参数、`structured_output` 交回、`submit_plan` 里写的任何数字（例如「测试过了 12 条」）都不进流水；门禁的通过与否取 harness 自己跑的结果（M7 §3.8.4）。模型做的选择（主 Agent 给 worker 选的模型、理由类别、人在卡上选的项）照记，字段名放在 `chose` 里，计算时只当分组的键，不当测量值。
- 防误写：新增 guard 规则 `metrics-files-only`，文件工具写到 `<根>/.llm/metrics/` 之下、或 shell 命令文本里出现 `.llm/metrics` 并带写入动作时记下。按 `CHARTER.md` §6「新门禁先影子后拦截」，出厂为影子模式，走 M4 的阶梯转生效；它依赖 M4 的 `GuardRule.mode`，M4 合入之前不装。在此之前与之后都由链式摘要发现误写（§5.4）。

## 4. 记录格式

### 4.1 每一行的公共字段

| 字段 | 必填 | 类型 | 含义 |
| --- | --- | --- | --- |
| `s` | 是 | 整数，现为 1 | 格式版本。已有种类的字段改了含义才加一；新加种类、新加可选字段不加 |
| `k` | 是 | 枚举（§4.2） | 种类 |
| `at` | 是 | ISO 8601 UTC，毫秒 | 发生的时刻。会话事件取事件自己的 `time`（session:1528–1534，`Date.now()`），其余取写入者的时钟 |
| `w` | 是 | 8 位十六进制 | 写入者 id：进程第一次写时随机生成；补录用 `bf-<提交前 7 位>` |
| `n` | 是 | 正整数 | 这个写入者在这个项目里的序号，从 1 起连续 |
| `h` | 是 | 12 位十六进制 | 链式摘要：`sha256(上一条的 h + 本行不含 h 的 JSON 文本)` 的前 12 位；写入者第一条的「上一条」是空串 |
| `v` | 是 | id | 交来这条事件的包的构建戳：`<包版本>+<提交前 7 位>`，构建时工作区有未提交改动再加 `.dirty`，没有 git 时提交写 `nogit`，读不到构建戳写 `<包版本>+unknown` |
| `sid` | 否 | id | 会话 id（rc.3 的 agent 与会话共用 id，agent:514） |

写入器按字段表的顺序序列化（不靠对象的插入顺序），同一事件的文本是确定的，链可以重算。

### 4.2 事件种类

除公共字段外的字段（`?` 为可选）：

| 种类 | 谁交来 | 何时 | 字段 |
| --- | --- | --- | --- |
| `start` | 写入器 | 这个写入者第一次往这个项目写，排在第一条之前 | `host`（`desktop`、`headless`、`cli`）、`pid`、`node`、`electron?` |
| `stop` | 写入器 | 行卸载或命令行退出之前，尽力写 | `written`、`dropped`、`rejected`（本写入者在本项目里的累计） |
| `gap` | 写入器 | 丢过事件之后第一次写成功 | `lost`、`from`、`to`（丢掉的序号范围）、`lastH`（丢掉的最后一条的 `h`，校验从它接上） |
| `reject` | 写入器 | 拒收一条事件 | `of`（被拒的种类，未知种类写 `unknown`）、`field`（第一个不合规的字段名；不是字段表里的名字且不像 id 时写 `other`） |
| `session` | 指标行；M3 的 `/wish` | 本进程第一次见到一个会话；主 Agent 模式开关变化 | `parent?`、`origin?`（`subagent`）、`depth?`、`main?` |
| `turn` | 指标行（会话事件） | 回合开始与结束 | `turn`、`phase`（`start`、`end`）、`end?`（`reason.kind`，如 `completed`、`blocked`） |
| `llm` | 指标行（`llm/stream`） | 一次模型调用结束：正常、出错、被中止或消费方提前停下 | `turn?`、`step?`、`provider`、`model`、`purpose?`、`input?`、`output?`、`cacheRead?`、`cacheWrite?`、`reasoning?`、`total?`（流里没有 `usage` 块时这六项都不写）、`ms`、`ttft?`、`fin`（`stop`、`tool-calls`、`max-tokens`、`aborted`、`error`、`none`）、`calls`（输出里的工具调用块数）、`text`（输出文字块的字数，§4.3）、`credits?`、`peak?` |
| `tool` | 指标行（会话事件） | 模型发出的一次工具调用有了结果，或回合结束时仍没有结果 | `turn`、`step`、`call`、`name`、`cat`（§4.3）、`out`（`ok`、`error`、`denied`、`declined`、`none`）、`ms?`、`chars?`（结果文字的字符数）、`target?`（路径散列）、`cmd?`（shell 命令的第一个词） |
| `rule` | guard、图文件门禁；以后 M4 的 `installRuleGate`、规则板、M3 与 M7 的写入门禁 | 一次判定不是放行 | `call?`、`rule`、`by`（`guard`、`graph`、`rules`、`design`、`execute`）、`mode`（`enforce`、`shadow`）、`effect`（`deny`、`shadow`、`queue`、`ask`、`followup`）、`outcome?`（M4 的跟进结果 `right-path`、`repeat`、`other`、`none`）、`ref?`（违规流水那一行的 `recordKey`） |
| `approval` | 指标行（会话事件） | DSH 审批的发起与结论 | `id`、`phase`（`asked`、`decided`）、`tool?`、`call?`、`outcome?` |
| `command` | 指标行（会话事件） | 人发的斜杠命令开始与结束 | `cid`、`name`、`phase`（`run`、`done`）、`result?`（`success`、`error`） |
| `ask` | 指标行（`user-questions/request`）；标签来自 M3 的卡片构造 | 一次问题请求开始 | `q`、`qs`（问题数）、`opts`（选项总数）、`units`（问题、说明与选项文字的字数）、`ref?`（图上的待决 id）、`form?`（`decision`、`interview`、`plain`）、`pres?`（`standard`、`think-first`）、`rpos?`（推荐在显示中的位置，从 1 起） |
| `answer` | 同上 | 这次请求结束 | `q`、`ms`、`end`（`answered`、`aborted`、`no-provider`、`error`）、`pick?`（选中项的显示位置）、`followed?`、`peeked?` |
| `graph` | 项目图引擎的观察者 | 一次写入追加的每条历史；一次写入失败 | `node`、`type`、`op`、`hi`（历史序号）、`rev`、`actor`（`human`、`llm`、`harness`）、`relay`（是否带转述）、`from?`、`to?`、`decider?`、`option?`、`recommend?`、`followed?`、`counted?`（是否 plain-ui §3.9.1 定义的计数拍板）、`asked?`、`shown?`、`peeked?`、`weight?`、`units?`（问题从这一刻起等人拍板时，面板要显示的字数）、`err?`（失败的错误码）、`src?`（补录时为 `history`） |
| `task` | M7 的执行行与运维行 | 任务的每个阶段 | `task`、`phase`（`dispatch`、`plan`、`plan-ok`、`plan-back`、`ask-main`、`handback`、`review`、`gate`、`merge`、`fail`、`retry`、`stale`）、`attempt`、`child?`、`role?`（`worker`、`reviewer`、`gate`、`acceptance`）、`provider?`、`model?`、`tier?`、`chose?`（主 Agent 给的理由类别：`difficulty`、`cost`、`independence`、`escalation`、`person`、`other`）、`round?`、`blocking?`、`minor?`、`verdict?`、`passed?`、`failedAt?`（失败命令的序号）、`code?`、`ms?`、`commit?` |
| `upstream` | GLM 通道的适配器 | 每次上游 HTTP 应答或网络错误 | `model`、`status`（HTTP 状态码，网络错误为 0）、`code?`（服务端错误码，合 id 形状才收）、`ms`、`attempt` |
| `report` | hourness 行；以后 M7 的报告工具 | 生成一次报告 | `kind`（`morning`、`weekly`、`patrol`、`status`）、`units`、`ms` |
| `count` | 每天一次的计数（第一个用户是 M4 的压制注释数） | | `what`、`value`、`by?`（`{id: 整数}`，至多 32 项） |

主 Agent 选模型的理由（`d-main-agent-models`）：理由的文字由主 Agent 写在派发调用里，留在会话日志与图上的派发批注（M7 §5）；流水只记它选的模型与理由类别（`task.chose`）。理由类别是 M7 派发工具新加的必填枚举参数（§14）。

### 4.3 口径

- 字数 `textUnits(s)`（`src/shared/text-units.ts`）：每个汉字、假名、谚文音节与全角字符算 1；每一段连续的 ASCII 字母与数字算 1（一个英文词）；标点与空白不算。M7 §3.12.3「中文按字、英文按词计」的同一口径，项目图、卡片、报告都用这一个函数。
- 一步：`agent/pre-step` 给出的 `(turn, step)`；它之后同一 agent 的第一次不带 `purpose` 的模型调用属于这一步〔推断，§11 第 2 条〕。压缩与会话标题的调用带 `purpose`，不算步。
- 用时：`llm.ms` 从调用 `llm/stream` 到流结束；`ttft` 到第一个 `text-delta`、`reasoning-delta` 或 `tool-call-delta`；`tool.ms` 是 `tool/result` 与 `tool/call` 两个会话事件的 `time` 之差（含审批等待）；`answer.ms` 从请求进入到结束。
- 积分：写入时经计价服务 `glmHournessPricing` 的 `charged(model, usage, atMs)` 与 `peak(atMs)` 算（`src/shared/pricing.ts`，口径 `ORCHESTRATION.md` §11.2），保留 4 位小数。记的是当时规则下的数；没有计价服务或模型不在套餐里时不写这两个字段，报告只列 token。
- 工具类别 `toolCategory(name)`（`src/shared/tool-names.ts`）：`read`、`write`、`search`、`shell`、`graph`、`dispatch`、`memory`、`web`、`todo`、`question`、`mcp`、`other`。表覆盖 rc.3 的原生名（`DESIGN.md` §2.4a 工具名表）与 ZCode 别名（`src/glm-prompt/aliases.ts`），`mcp__` 开头的归 `mcp`，其余 `other`。派发类就是 `src/workflow/index.ts` 的 `DISPATCH_TOOLS` 六个名字。
- 路径散列 `target`：文件工具的目标（`file_path`、`path`，字段表同 guard），在项目根之内用相对路径，之外用绝对路径；正斜杠，Windows 上转小写；取 SHA-256 前 12 位。用来算「改了、跑了、又回去改同一个文件」（标定的返工口径，`ORCHESTRATION.md` §10.5.1），看不出是哪个文件。
- 命令第一个词 `cmd`：shell 工具（`pwsh`、`bash` 读 `command`，`terminal_send` 读 `text`，同 guard）命令文本去掉首尾空白后的第一个词，去掉 `.exe`，转小写；只在它由字母、数字与 `._-` 组成、至多 24 字符、不含 6 位以上连续数字、不像 16 位以上的十六进制串时记，否则写 `other`。`TOKEN=… cmd` 这种带赋值的开头含 `=`，记为 `other`。

### 4.4 隐私：字段表是唯一的关口

写入器在序列化之前逐字段校验（`src/metrics/schema.ts`），这是唯一的关口，调用方怎么写都过这一道：

| 类型 | 规则 |
| --- | --- |
| 整数 | 非负的安全整数 |
| 数 | 有限、非负 |
| 布尔 | `true` 或 `false` |
| 枚举 | 表里的值之一 |
| id | 匹配 `^[A-Za-z0-9_.:@+/-]{1,120}$`：没有空白、没有反斜杠、没有非 ASCII 字符，所以装不下一句话、一个 Windows 路径或一段中文 |
| 映射 | 只有 `count.by`：键是 id，值是整数，至多 32 项 |

缺必填、类型不对、有字段表之外的键：整条拒收，不截断、不改写，写一条 `reject`，行健康计数，控制台每个「种类 × 字段」告警一次。序列化后超过 4096 字节也拒收。

从不记：对话正文与提示词、推理内容、工具参数与结果正文、文件内容、路径原文、命令全文、审批理由、错误文字、转述原话、节点正文与选项文字、凭证、令牌、请求头、签名、设备 id。字段表里没有放得下它们的字段。

## 5. 写入

### 5.1 写入器

```ts
export interface MetricsWriter {
  /** Validate, number and queue one event for a project root. Never throws; never awaits I/O for the caller. */
  record(root: string, event: MetricsEvent): void
  /** Write what can be written now, in sequence order per root. */
  flush(): Promise<void>
  /** Queue `stop` for every root written to, then flush with a 2 s budget. */
  close(): Promise<void>
  /** Per root: written, queued, dropped, rejected, the last error code, today's file size. */
  status(): ReadonlyMap<string, WriterRootStatus>
}

export function openWriter(options: {
  readonly host: 'desktop' | 'headless' | 'cli'
  readonly fs: MetricsFs                 // mkdir, appendFile, stat, readTail, writeFileExclusive; injected in tests
  readonly now: () => number
  readonly randomId: () => string        // 8 hex; crypto.randomBytes(4) by default
}): MetricsWriter
```

一条事件的路径：

1. 校验（§4.4）。不合规就拒收，写 `reject`。
2. 这个根在本进程里第一次出现：先排一条 `start`。
3. 编号：`n` 取这个根的下一个序号，`h` 按上一条的 `h` 算。编号与链都在入队时定，所以链的顺序就是序号的顺序，与什么时候写成功无关。
4. 入队。每个根一条队列，至多 2000 条。满了就丢最早的一条，记进「待报的缺口」（序号范围与最后一条的 `h`）。
5. 排一次写（微任务）。每个根同时只有一个写在进行，按队列顺序：
   - 第一次写这个根：`mkdir -p <根>/.llm/metrics`，以 `wx` 写 `.gitignore`（已在就跳过）。
   - 文件取队首事件 `at` 的 UTC 日期：`events-YYYY-MM-DD.jsonl`。本进程第一次写某个文件时读它的大小与最后一个字节：不是换行（上次崩溃留下的半行），这一次写的开头先补一个换行。
   - 一次 `appendFile` 写一整行（带结尾换行）。成功就出队，接着写下一条；有待报的缺口时，在队尾加一条 `gap`。
   - 失败：记下错误码（`EACCES`、`ENOSPC`、`EBUSY`、`ENOTDIR`、`EPERM` 等），停止写这个根，30 秒后重试（`setTimeout(...).unref()`），下一条事件进来时也会重试。队首的事件不丢，下一次从它开始，保证顺序。
6. 卸载：`close()` 给每个写过的根排一条 `stop`，至多等 2 秒；没写完的就没了，下一次 `verify` 会把这个写入者报为没有正常退出。

写入器不缓冲成批：事件在一次微任务之内就写下去，宿主被杀时最多丢正在写和还在队里的几条。不调用 `fsync`：每条一次 `fsync` 在 Windows 上要几毫秒，模型流与工具调用多了以后是明显的开销；代价是蓝屏时最后几秒可能没落盘，由 §5.4 发现。

### 5.2 多个进程

桌面版、headless（探针与标定）、命令行（编排方在 Kiro 里跑 `npm run graph`、`npm run metrics`）都可能同时写同一个项目。每个进程是一个写入者，有自己的 `w` 与序号，互不协调，不用锁。

同一个文件的并发追加：每行一次 `appendFile`（Node 以追加方式打开，libuv 在 Windows 上用 `FILE_APPEND_DATA`），一行至多 4 KiB。〔推断〕本机 NTFS 上这样的追加不会交错。验收第 12 条用 L3 场景 `metrics-concurrent` 核实（两个进程各写 5000 条）。不通过时的退路已经定下：文件名改为每个写入者一份 `events-YYYY-MM-DD-<w>.jsonl`；读取从第一天起就按 `events-*.jsonl` 取文件，换退路只改写入器。

项目放在同步盘（OneDrive 等）里时，同步程序可能短暂占住文件，追加得到 `EBUSY` 或 `EPERM`，走 §5.1 第 5 步的重试。

### 5.3 文件、大小与轮换

- 一天一个文件，按事件 `at` 的 UTC 日期命名。没有改名、没有锁，多个写入者跨过午夜也不冲突。
- 体积估计：一条 250–450 字节。本机用量流水 2026-10-27 前后两天约 1080 次模型调用（`DESIGN.md` §2.4 的迁移计数），按每天 600 次模型调用、同样多的工具调用、另有几百条其他事件算，约 0.5 MB/天；并行派发多个 worker 的日子按 3 倍算约 1.5 MB/天；一年 200–550 MB。
- 保留：写入器从不删除、不改写、不压缩。`/hourness` 的覆盖行与 `verify` 写出总大小。人或主 Agent 可以删掉整天的旧文件，报告按现存最早的文件写明覆盖范围。
- 一天的文件超过 64 MiB 时（多半是某个循环失控），行健康注明，照写不停。

### 5.4 发现缺行、改行与没有正常退出

读取一侧（`src/metrics/read.ts` 的 `checkLog`）按写入者核对：

| 发现 | 依据 |
| --- | --- |
| 缺行 | 序号不连续，且缺的范围不在任何 `gap` 的 `from`–`to` 里 |
| 改行或插行 | 按序号重算 `h` 对不上；从 `gap` 的 `lastH` 接着算 |
| 没有正常退出（崩溃、蓝屏、被杀） | 有 `start` 没有 `stop`，且不是正在运行的写入者（最后一条早于 10 分钟之前） |
| 无法读取的行 | 不是 JSON、带 NUL 字节、字段表不认；写出文件名与行号 |
| 时钟回拨 | 同一写入者序号增加而 `at` 倒退超过 5 分钟 |
| 重复 | 同一 `(w, n)` 出现两次（写成功了却报错之后重写）：保留第一条，计数 |

这些都只能发现误写与丢失，不防有意伪造：会改文件的人或程序也能重算摘要。

## 6. 接上的地方

### 6.1 指标行自己挂的接缝

| 接缝 | 用法 | rc.3 证据 |
| --- | --- | --- |
| `llm/stream`（waterfall，`(options, next)`） | 包住 `next()` 返回的流，逐块原样转出；块的观察在 `try/finally` 里，流结束、出错或消费方提前停下时写一条 `llm`。`next()` 抛错时 `fin` 为 `error`，原样再抛 | llm:2397；`options` 的 `provider`、`model`、`sessionId?`、`purpose?` 见 types.d.ts:506–548（541、547）；块：`text-delta` types.d.ts:439、`block-end` 453、`usage` 457、`finish` 460；结束原因 `aborted`、`error` 见 types.d.ts:142–146。memory 行对同一接缝的用法见 `src/memory/index.ts` |
| `agent/pre-step`（waterfall） | 按 agent id 记最近一次的 `(turn, step)`，原样返回 `next()` | agent-loop:909（载荷 `{agent, messages, turn, step, signal}`，agent-loop:901–925） |
| `session/event`（只观察，在 `append` 内同步调用） | 同步部分只把事件引用放进一个数组，解析放到微任务里做（工具参数可能很大，不在 `append` 里解析） | session:1517–1536（`append`，事件 `{type, seq, time, data}` 冻结，1528–1534）、session:1579–1598（同步通知观察者） |
| 会话事件 `turn/start`、`turn/end` | `turn` 事件 | agent-loop:945（`{turn}`）；agent-loop:1029–1032（`{turn, reason}`，`reason` 为 `{kind: 'blocked'}` 或 `{kind: 'completed'}` 等，agent-loop:950–966） |
| 会话事件 `tool/call`、`tool/result` | `tool/call` 记下 `(会话, callId) → {turn, step, name, time, target, cmd}`；`tool/result` 按 `message.toolCallId` 找到它，写一条 `tool`；`turn/end` 时这个回合里仍没有结果的调用写 `out: 'none'` | agent-loop:682–689（`{turn, step, callId, name, arguments}`）；agent-loop:691–706（`{turn, step, message, error?, meta?}`，`message` 由 `createToolResultMessage`，llm:101，带 `toolCallId` 与 `isError`，session:864）；宿主重启后补回的结果用同一种事件，agent-loop:984 |
| 会话事件 `approval/asked`、`approval/decided` | `approval` 事件；`reason` 是文字，不记 | user-approval:132–137（`{id, toolName, callId?, reason?}`）、139–142（`{id, outcome}`） |
| 会话事件 `command/run`、`command/done` | `command` 事件；`args` 与 `text` 不记 | commands:334–339（`{commandId, name, args?, source}`）、341–346（`{commandId, kind, text?}`） |
| `session/disposed`（只观察） | 清掉这个会话在内存里的表 | session:1925–1936 |
| `user-questions/request`（waterfall），`prepend` 注册 | 进入时写 `ask`，`await next()`，结束时写 `answer`，结果或错误原样交回。`prepend` 排到最外层，用时包含所有应答方 | user-questions:681（瀑布）、668–681（`ask(request)`：`questions[]` 带 `id`、`options[].label`、`detail?`、`intent?`；`agent?`、`signal?`；错误码 `ASK_ABORTED`、`NO_PROVIDER` 等）；`prepend` 用 `unshift`，cordis:336 |
| `ctx.provide('glmHournessMetrics', …)` | 给别的行发事件 | cordis:800–830 |
| `ctx.get('agents')`、`agents.get(id)` | `llm/stream` 与问题请求只给会话 id，用它找活 agent，读 `session.header` 的 `cwd`、`parentSession`、`origin` | cordis:763–766；agent:596；session:1051–1053、1820–1826；subagent:346–355 |
| `ctx.get('glmHournessPricing')` | 每次写 `llm` 时读，形状检查同 `/hourness` | `src/shared/pricing.ts`（本仓库契约，`ORCHESTRATION.md` §11.3） |

工具调用的结果分类：`isError` 为假是 `ok`；为真时，本进程里有同一 `(会话, callId)` 的 `rule` 拒绝（§6.2 的发送方先于结果交来，`tools/pre-execute` 在执行之前，tools:3317–3352）就是 `denied`；有同一调用的审批且结论不是批准就是 `declined`；其余是 `error`（含参数校验失败、找不到工具、执行抛错与取消）。审批结论的取值〔未核实，§11 第 4 条〕。

为什么不用 `tools/post-execute`：参数校验失败、找不到工具这类在准备阶段就给出最终结果的调用不经过它（tools:3212–3222 的 `final-result` 分支直接 `finishScheduledExecution`），会漏记；会话事件 `tool/result` 是模型实际看到的每一个结果，带回合与步，不漏。代价是只记模型发出的根调用，`run_code` 之类内部的子调用不记，这正是要量的那一层。

### 6.2 别的行交来的事件

契约在公共库 `src/shared/metrics.ts`（两个包之间的服务契约，同 `src/shared/pricing.ts` 的位置）：

```ts
export const METRICS_SERVICE = 'glmHournessMetrics'

export interface MetricsService {
  /** Record one event for the project of a session or of a directory inside the project. Never throws. */
  emit(event: EmittedEvent, where: { readonly sessionId?: string, readonly dir?: string }): void
  /** Tag the userQuestions request whose first question has this id (the card builder calls it just before ask). */
  tagQuestion(questionId: string, tag: QuestionTag): void
}

/** The service when the metrics row is active and the value has this shape; undefined otherwise. */
export function metricsOf(ctx: ServiceLookup): MetricsService | undefined
/** Emit through the service when present; adds `v` from this package's build stamp; swallows and counts errors. */
export function emitMetric(ctx: ServiceLookup, event: EmittedEvent, where: { readonly sessionId?: string, readonly dir?: string }): void
```

`emitMetric` 在每次调用时 `ctx.get`（不需要 inject，指标行晚激活或没装都不影响调用方）。`v` 由调用方所在的包填：公共库编进两个包各自的 `dist/`，`src/shared/build-info.ts` 读的是本包的 `dist/build-info.json`。

| 发送方 | 种类 | 何时 | 现在有没有这段代码 |
| --- | --- | --- | --- |
| guard 行 `src/guard/index.ts` | `rule`（`by: 'guard'`） | 写违规流水的同一处，拦截与影子记录都交；`ref` 是那一行文本的 `recordKey`（先序列化，再用同一份文本写流水和算键）。`recordKey` 按 M4 §3.2 的定义（这一行 JSON 文本、不含换行的 SHA-256 前 12 位十六进制）；M4 没合入时由本设计第 3 步加在 `src/guard/records.ts`，M4 沿用 | 有，本设计改 |
| 图文件门禁 `src/guard/graph-files.ts` | `rule`（`by: 'graph'`） | 拒绝时 | 有，本设计改；M4 合入后两处都并进 `installRuleGate` 一处 |
| 项目图引擎 `src/graph/engine.ts` | `graph` | 见 §6.3 | 有，本设计改 |
| hourness 行 `src/report/index.ts` | `report` | 每次 `/hourness` | 有，本设计改 |
| GLM 通道 `src/glm-llm/zcode.ts` | `upstream` | 每次上游应答或网络错误之后；会话 id 取请求的 `sessionId`（types.d.ts:541） | 有，本设计改 |
| M4 的 `installRuleGate` | `rule`（含 `followup`）；`count`（压制注释数） | M4 §3.2、§3.3、§6.7 | M4 实现时 |
| 规则板 | `rule`（`by: 'rules'`） | 拦截、排队、只记录（规则板 §10.5） | 规则板实现时 |
| M3 的卡片构造 `src/design/cards.ts`、`/wish` | `tagQuestion`；`session`（`main`） | 出卡之前；主 Agent 模式开关时 | M3 实现时 |
| M7 的执行行与运维行 | `task`；`rule`（`by: 'execute'`）；`report` | M7 §3.1–§3.13 各处 | M7 实现时 |

只装 GLM 通道包时没有服务，`emitMetric` 什么也不做，GLM 的行照常。

### 6.3 项目图引擎

`EngineOptions` 加一个可选的 `observe(note: EngineNote): void`。引擎在 `commit` 里 `writeNodes` 成功之后（`src/graph/engine.ts` 约 205 行）对这次写入追加的每条历史各给一条，失败的返回路径给一条带错误码的；`observe` 抛错被引擎接住，不影响返回值。映射到事件的纯函数在 `src/graph/metrics-events.ts`：

- `followed`：`decide` 的选项等于当时节点的 `recommend`。
- `counted`：plain-ui §3.9.1 的计数拍板（带 `recommend` 的待决，最后一次 `decide` 由人做或带原话转述）。判定函数放在这个文件里，plain-ui 的 `src/graph/inertia.ts` 实现时导入它；后实现的一方导入先实现的一方，不写两份。
- `units`：一张决定者为人的待决开始等人（批准，或提议时直接为已批准）时，按面板卡片显示的字段（标题、正文、选项的说法与得到、代价、取决于、结论行，plain-ui §3.8）算字数。
- 图行（`src/graph/index.ts`）传 `note => emitMetric(ctx, …, {dir: 图目录})`；命令行（`src/graph/cli.ts`）自己开一个写入者（`host: 'cli'`）传入，退出前 `close()`。项目根按图目录算（§3.3 第 5 条）。

## 7. 读与计算

### 7.1 读取

`readLog(root, {from, to})`（`src/metrics/read.ts`）：

1. 列出 `<根>/.llm/metrics/events-*.jsonl` 里日期落在 `[from, to)` 的文件（文件日期就是其中事件 `at` 的 UTC 日期，不需要多读一天）。
2. 逐行读（`node:readline`），每行 `JSON.parse` 后按字段表校验。读不出、带 NUL、种类不认识、格式版本 `s` 比本代码新的行不进计算，各自计数并记下文件与行号。
3. 按 `(w, n)` 去重，保留先读到的一条。
4. 按 `(at, w, n)` 排序。
5. 返回 `{events, basis, problems}`。`basis` 是每个文件的名字与读到的行数：文件只追加，前 L 行以后不会变，所以「某文件的前 L 行」就是一份确定的输入。

### 7.2 计算

`src/metrics/calc.ts` 全是纯函数：输入是 `readLog` 的事件、窗口 `[from, to)` 与时区偏移（`+08:00` 这样的字符串，由调用方给；`/hourness` 取本机时区，命令行用 `--tz`），不读时钟、不读文件、不用随机数。规则：

- 中位数：奇数个取中间那个；偶数个取中间两个的平均，毫秒四舍五入到整数。
- 百分比保留一位小数，积分保留两位；分母为 0 写「—」。
- 所有排序带确定的次序键（先按数值，再按 id 的字典序）。
- 常量 `CALC_VERSION`（从 1 起），任何口径的改动都加一。
- 输出第一行是依据：`依据：events-2026-10-30.jsonl 1–842 行，events-2026-10-31.jsonl 1–120 行；无法读取 0；计算版本 1`。

同样的依据行（同样的文件前缀）、同样的窗口与时区、同一个计算版本，输出逐字相同（验收第 8 条）。

指标目录（`summary` 与各报告从这里取）：

| 组 | 指标 | 算法 |
| --- | --- | --- |
| 每步 | 步数；每步 token 与积分（中位数）；每步用时、首字用时（中位数、最长）；结束原因分布 | 带 `turn`、`step`、不带 `purpose` 的 `llm` 事件；按模型分组 |
| 工具 | 每步工具调用数；结果分布；被拦率；按类别的调用数与出错率；返工次数 | `tool` 事件按 `(sid, turn, step)` 归到步；被拦率 = `denied` / 全部；返工 = 同一 `target` 的第二次成功写入，且两次之间同一会话有过 `shell` 调用 |
| 拦截 | 按规则与模式的次数；拦截后下一步走对的比例（有 M4 的跟进时） | `rule` 事件 |
| 积分 | 按模型、按角色、高峰占比 | `llm` 的 `credits`、`peak`；角色由会话 id 与 `task.dispatch` 的 `child`、`role` 连接得到，主 Agent 会话由 `session.main` 得到，其余为「其他」 |
| 任务 | 派发次数；每个任务的尝试次数；第一次派发到合入的时长（DORA 前置时间）；门禁一次通过率；审查轮数与挡路发现数；重开次数；失败与重试按码 | `task` 事件；重开是 `graph` 事件里任务从 `done` 回到 `doing` |
| 问人 | 次数；每次要读的字数；等待时长（中位数、最长）；跟随率；先想后看的次数与其中跟随的次数；先看了推荐的比例；审批次数与等待；主 Agent 在对话里写给人的字数 | 次数 = 不同的 `ask.q` 加「开始等人」的 `graph` 问题（同一待决经卡片又在面板上，按 `ref` 只算一次）；卡片的等待 = `answer.ms`，面板与对话转述的等待 = 开始等人到 `decide` 的时长；跟随率只算 `counted` 的拍板；对话字数 = 主 Agent 会话里 `llm.text` 之和 |
| 覆盖 | 事件数；丢失、拒收、无法读取、未正常退出的次数；总大小 | `gap`、`reject`、`checkLog` |

### 7.3 报告怎样改用它

- `/hourness`（`src/report/index.ts`、`src/workflow/morning-report.ts`）：报告的项目是调用会话的项目根（`invocation.agent.session.header.cwd`，commands:379–385 给出 `agent`）。「决策曲线」改为按工具名的派遣次数（`tool` 事件 `cat: 'dispatch'`）；拦截与影子的计数改从 `rule` 事件算；「用量（今天）」改为本项目今天的 `llm` 事件（有积分时按积分）；「面板」一节照旧读用户级用量流水，标题写明「本机全部项目」；末尾多一行「记录：最早 <日期>，今天 <N> 条，本进程丢了 <K> 条（<原因>）」。读不到指标流水时（行没启用、项目没有 `.git`）写明原因，其余照旧输出。生成之后交一条 `report` 事件。
- M7 的四答晨报、人的负担与质量对照、DORA（M7 §3.10、§3.12.3、§3.13）：数字由 `calc.ts` 从指标流水算，标题等文字从图上取（报告的依据行另写图的修订号）。M7 设计下一次修订按 §14 改来源列。
- plain-ui：报告里的跟随率从 `graph` 事件算；触发先想后看的那个数仍从图当场算（§2 表末行）。

### 7.4 比较版本

`compare(events, by, window)`，`by` 取 `v`（构建）、`model`、`pres`（问法）、`host`、`role`。每组列同一套指标（§7.2 的表）与样本数，不做显著性检验：用户只有一人，样本小，只看走向（`CHARTER.md` §8）。

「同样的数据上比版本」有两种用法，都靠只追加：

1. 同一段真实使用或同一批标定运行里，按 `v` 分组，比两个构建的数。
2. 同一份流水换算法：新代码对旧流水重算；要复现某一份旧报告，检出那时的提交，用它依据行里的文件前缀重跑命令行，输出逐字相同。

### 7.5 命令行

`npm run metrics -- <子命令> [--project <目录>] [--from <ISO>] [--to <ISO>] [--tz <±HH:MM>] [--json]`（`scripts/metrics/cli.ts` 调 `src/metrics/cli.ts`，写法同 `npm run graph`）：

| 子命令 | 做什么 | 写不写流水 |
| --- | --- | --- |
| `summary` | §7.2 的指标目录 | 不写 |
| `verify` | §5.4 的核对；另外两项对账：流水里第一条实时 `graph` 事件之后，图历史里有而流水里没有的条目；每个会话的 `llm` 事件数与用户级用量流水同一会话的行数。没有发现退出码 0，有发现 1 | 不写 |
| `compare --by <键>` | §7.4 | 不写 |
| `backfill-graph` | 读图（`loadGraph`），把早于流水里第一条实时 `graph` 事件（没有就是全部）、且 `(node, hi)` 还没有的历史条目补成 `graph` 事件，`src: 'history'`，写入者 `bf-<HEAD 前 7 位>`。重跑不会重复。打印补了几条 | 写 |

参数校验：`--from`、`--to` 必须能被 `Date.parse` 解析，`--tz` 匹配 `^[+-]\d{2}:\d{2}$`，`--project` 必须是存在的目录且找得到 `.git`；不合格时退出码 2，打印用法。

## 8. 量不到的

这些只能靠真实项目里的试用（`dogfood`，之后 `field-trial`）与人的反馈，流水里没有，报告里照实写「量不到」：

- 人在系统外花的精力：读代码、想问题、在别处查资料、和别人商量的时间。流水只有人在 DSH 里点卡片、发命令的时刻。
- 人读懂了没有：字数与等待时长只是代理量。等得久可能是难，也可能是人走开了。
- 跟了的推荐对不对：流水能给出「拍板之后 7 天内因这个决定返工」的次数（M7 §3.12.3），给不出没返工的决定是不是好决定。
- 做出来的东西好不好用、合不合人的本意：门禁与审查只查写下来的验收条件。
- 主 Agent 的话好不好懂：流水有字数，没有内容（§4.4），也不打分。
- 同一账号在 ZCode 等其他客户端的消耗（`ORCHESTRATION.md` §11.3）。
- 桌面版没开、宿主没运行时发生的事。
- 人对报告与卡片的感受：以后面板的「讲细点 / 说重点」按钮按下的次数可以记（M8 加一个事件种类），感受本身仍要人说。

试用中人的反馈是文字，进图（复盘节点、批注，M7 §3.15），不进指标流水。

## 9. 失败与预案

### 9.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 行健康 |
| --- | --- | --- |
| 服务 `glmHournessMetrics` 提供失败（同名服务已在） | 自己的接缝照装，别的行交来的事件收不到；控制台告警一次 | 部分生效，写明原因 |
| 接缝注册抛错（某一个） | 跳过这一个，其余照装 | 部分生效，写明缺哪一个 |
| 构建戳读不到 | `v` 写 `<包版本>+unknown` | 说明里注明，状态不降级 |
| 没有 `agents` 服务 | `llm` 与 `ask` 事件找不到项目，计为无项目；会话事件照常（直接读 `session.header.cwd`） | 部分生效 |

### 9.2 运行期

| 故障 | 怎样发现 | 怎样恢复 | 事后怎样查 |
| --- | --- | --- | --- |
| 追加失败（权限、磁盘满、文件被占、目录被换成文件） | 写入器记下错误码；行健康部分生效，写明错误码与排队条数；控制台每个根每种错误码告警一次 | 队首事件不丢，30 秒后与下一条事件进来时重试；顺序不变 | `/hourness` 的覆盖行；溢出时的 `gap` |
| 队列满（故障持续，2000 条） | 同上，另写丢了几条 | 丢最早的，写成功后补一条 `gap` | `gap` 的序号范围；`verify` 不把它报成缺行 |
| 会话找不到项目根（没有 `.git`、没有 `cwd`、agent 已不在） | 行健康「无项目的事件 N 条」 | 按设计不写（§3.3 第 3 条） | 行健康 |
| 事件不合字段表（代码缺陷） | 拒收并写 `reject`；行健康计数；控制台按「种类 × 字段」告警一次 | 不重试（再写一次也一样）；L2 的字段表测试拦住大多数 | `reject` 的 `of` 与 `field` |
| 观察代码自己出错（缺陷） | `try/catch` 接住，行健康「内部错误 N 次」，控制台告警一次 | 模型流、工具调用、问题请求的结果原样交回，不受影响 | 行健康；控制台 |
| 计价服务没有或抛错 | `llm` 事件不带 `credits` | 报告按 token 列 | 行健康说明「积分口径：未提供」 |
| 崩溃、蓝屏、被杀 | 下一次 `verify`：没有正常退出、无法读取的行（半行、NUL） | 新写入者补换行再写，不截断旧文件 | `verify` 的文件与行号；没有 `stop` 的写入者 |
| 多进程追加交错 | 无法读取的行；L3 场景 `metrics-concurrent` 预先核实 | 换成每个写入者一份文件（§5.2） | `verify` |
| 时钟回拨 | `verify` 报「时钟回拨」 | 报告按 `at` 排序，同一写入者内的先后看 `n` | `verify` |
| 文件过大（一天超过 64 MiB） | 行健康注明 | 照写；查失控的循环 | 文件大小 |
| 读到更新格式的行、不认识的种类 | 读取计数 | 不进计算，其余照算；报告写明 | 依据行之后的「看不懂 N 行」 |
| 图引擎的观察者抛错 | 引擎接住 | 写入结果不变 | 少一条 `graph`，`verify` 对账报出 |
| 只装 GLM 通道包 | 没有服务 | `emitMetric` 不做事 | 不需要 |
| `workflow` 行退役后启动报错 | §12 第 9 步的 L3 预检 | 不合入；停下交人（profile 改动是必须问人的第 2 类） | 预检日志 |

### 9.3 不可逆的地方与预防

- 写入器只追加：不删除、不改写、不截断（半行用补换行处理，不截掉）。轮换靠按日期取新文件名，没有改名。
- 只写 `<根>/.llm/metrics/` 之下；`.gitignore` 以 `wx` 写，已有的文件不覆盖。
- 补录只追加，重跑不重复。
- `workflow` 行退役不删 `decisions.jsonl`（用户数据）；退役前的 L3 预检用的是带覆盖层的临时 profile，不碰用户的 profile。
- 字段表闭合，不会写进凭证与文字。万一某个缺陷让不该有的东西进了流水，补救是删掉那几天的文件：这会丢那几天的数，所以字段表的测试是 L2 的硬门（验收第 5 条），改字段表的提交走独立评审（§12 第 1 步）。

### 9.4 外部输入的校验

| 输入 | 规则 | 不合格时 |
| --- | --- | --- |
| 别的行交来的事件 | §4.4 字段表 | 拒收，`reject` |
| 会话事件的 `data` | 读到的每个字段先查类型：`turn`、`step` 是整数，`callId`、`name` 是字符串，`message.toolCallId` 是字符串，`isError` 是布尔 | 这条事件不记，内部计数 |
| 工具参数（`tool/call` 的 `arguments`，字符串） | `JSON.parse` 失败或目标字段不是字符串时不写 `target`、`cmd` | 照写 `tool`，少这两个字段 |
| `llm/stream` 的块 | `usage` 的计数必须是非负有限数，不是的那一项不写；没有 `usage` 块时各类 token 都不写，`fin` 照实 | 照写 |
| 问题请求 | `questions` 是数组，`id` 是字符串（不合 id 形状时 `q` 写 `x-` 加 SHA-256 前 12 位） | 不写 `ask`，`answer` 也不写，内部计数 |
| 计价服务 | 形状同 `/hourness`（`basis`、`plan` 是字符串，`charged`、`peak` 是函数）；返回值必须是有限非负数或 `undefined` | 不写积分 |
| 补录读的图 | `loadGraph` 的校验；读不出的节点跳过并计数 | 打印跳过的节点 |
| 命令行参数 | §7.5 | 退出码 2 |
| 流水文件 | §7.1 第 2 步 | 计数、记行号 |

### 9.5 不变量与所在层

| 不变量 | 由谁保证 | 为什么在这一层 |
| --- | --- | --- |
| 只有 harness 写 | 写入器是唯一的写文件代码；服务不注册工具；guard 规则 `metrics-files-only` 记下（以后拦下）工具的写入；链式摘要发现误写 | 写的路径只有一条，堵在这里最省；工具层的门禁防的是 agent |
| 不记文字与秘密 | `src/metrics/schema.ts` 的字段表 | 所有事件都从这里过，调用方的错误也在这里被挡 |
| 序号连续、链按序号 | 写入器在入队时编号 | 写入的先后可能被重试打乱，编号的时刻不会 |
| 同样的输入同样的输出 | `calc.ts` 是纯函数，窗口与时区显式传入 | 时钟与环境只在边上读一次，写进依据行 |
| 节点状态以图为准 | 项目图引擎；`graph` 事件只是测量 | 图是人和 agent 编辑的对象，流水是事后的计量 |
| 账号用量以用户级用量流水为准 | memory 行 | 跨项目的账不能按项目拆着存 |
| 指标不进模型上下文 | `src/metrics/` 只被指标行、报告与命令行导入；L2 契约测试列出导入 `src/metrics/` 的文件，每步投影、提醒、提示词组装的文件不在其中 | 防止模型把分数当目标（`CHARTER.md` §8） |
| 观察不改变行为 | 每个接缝原样传 `next()` 的结果；L2 用例逐字比较有无指标行时的流块与工具结果 | 指标行出错不能变成用户可见的故障 |

### 9.6 行健康

| 行 | 何时上报 | 生效 | 部分生效或未生效 |
| --- | --- | --- | --- |
| metrics | 激活；每次模型调用与每个会话事件所在的会话 | 「指标记入 <根>/.llm/metrics，今天 N 条」 | 写入失败（错误码、排队条数、丢了几条）；拒收 N 条；内部错误 N 次；无项目的事件 N 条；服务未提供；某个接缝没装上 |

`/hourness-status` 与 `/glm-status` 的表多一行（`HOURNESS_ROWS` 加 `metrics`，顺序同 patch）。

## 10. 宿主契约与 rc.3 证据（汇总）

| 接口 | 证据 | 结论 |
| --- | --- | --- |
| `llm/stream` 瀑布与 `GenerateOptions` | llm:2397；types.d.ts:506–548 | 〔实读〕一致；memory 行在真机上用同一接缝（`DESIGN.md` §2.4a） |
| 流块 `text-delta`、`block-end`、`usage`、`finish` 与结束原因 | types.d.ts:439、453、457、460、142–146；`src/shared/lm-min.ts` | 〔实读〕 |
| `agent/pre-step` 的 `turn`、`step` | agent-loop:901–925、909 | 〔实读〕 |
| `session/event`、事件的 `time` | session:1517–1536、1528–1534、1579–1598 | 〔实读〕；guard 在真机上用它（`DESIGN.md` §2.4a） |
| `turn/start`、`turn/end` | agent-loop:945、1029–1032、950–966 | 〔实读〕 |
| `tool/call`、`tool/result` | agent-loop:682–689、691–706、984；llm:101；session:864 | 〔实读〕 |
| `approval/asked`、`approval/decided` | user-approval:132–142 | 〔实读〕；`outcome` 的取值〔未核实〕 |
| `command/run`、`command/done` | commands:334–346 | 〔实读〕 |
| `session/disposed` | session:1925–1936 | 〔实读〕 |
| `user-questions/request` 瀑布、`ask` 的请求与错误码 | user-questions:668–681 | 〔实读〕；问题正文的字段名与应答的形状〔未核实〕 |
| `tools/pre-execute` 先于执行、拒绝成为结果 | tools:3317–3352 | 〔实读〕 |
| 准备阶段的最终结果不经 `tools/post-execute` | tools:3212–3222、3455–3466、3600 | 〔实读〕；所以工具事件取会话事件 |
| `prepend` 排在最外层 | cordis:336（`unshift`）、cordis:372–381 | 〔实读〕 |
| `ctx.provide`、`ctx.get` | cordis:800–830、763–766 | 〔实读〕 |
| `agents.get`、会话头 `cwd`、`parentSession`、`origin` | agent:596；session:1051–1053、1820–1826；subagent:346–355 | 〔实读〕 |
| agent id 等于会话 id | agent:514 | 〔实读〕 |

## 11. 未核实的假设

| # | 假设 | 怎样核实 | 不成立时 |
| --- | --- | --- | --- |
| 1 | 本机 NTFS 上多个进程各自一次 `appendFile` 写不超过 4 KiB 的一行，不会交错 | L3 `metrics-concurrent`（验收第 12 条） | 每个写入者一份文件（§5.2），读取不变 |
| 2 | 同一 agent 在 `agent/pre-step` 之后的第一次不带 `purpose` 的模型调用属于这一步 | L3 `metrics`：`llm` 事件的 `(turn, step)` 与 headless 输出的 `step_start` 一一对应 | 改从会话事件 `request/header`（session:1612，agent-loop:1218–1240）对齐，它只在配置变化时写，需要另记每步 |
| 3 | 问题请求里问题正文的字段名、应答的形状（选中的是哪个 `label`） | 实施第 2 步读 `dsh-user-questions` 的请求 schema 与 `client-ui-user-questions` 的应答；L3 | `units` 只数选项与 `detail`；不写 `pick`，卡片的 `followed` 由 M3 的卡片构造在拿到结果后经 `tagQuestion` 的回调补 |
| 4 | `approval/decided` 的 `outcome` 取值 | 实施第 2 步读 `dsh-user-approval` | 只记 `asked` 与 `decided` 的时刻，`tool.out` 不分 `declined` |
| 5 | 子 agent 与会话标题的 `llm/stream` 也带 `sessionId` | L3 | 不带的计为无项目 |
| 6 | DSH 用户消息的事件形状 | 本设计不用（§1.6） | — |
| 7 | `agents.get` 对同一宿主里的子 agent 会话也返回活 agent | L3（派发场景） | 子 agent 的 `llm` 事件按父会话的项目根记：会话事件里先见过它的 `cwd` 就用它 |
| 8 | 用户 profile 里给已删除行 `glm-hourness/workflow` 的覆盖不会让启动报错 | §12 第 9 步的 L3 预检 | 不退役，停下交人 |
| 9 | 桌面版安装后 `dist/build-info.json` 与模块的相对位置不变 | preflight 检查文件在；L3 事件的 `v` 不是 `unknown` | `v` 为 `unknown`，行健康注明；查 bundle 布局 |
| 10 | `session/event` 对子 agent 的会话同样触发 | L3 派发场景 | 子 agent 的工具调用不记，报告写明 |
| 11 | NTFS 崩溃后文件尾可能是半行或 NUL | 不专门验证，读取按最坏情况处理 | — |
| 12 | `tools/pre-execute` 的 `exec.callId`（tools:3229–3260）等于会话事件 `tool/call` 的 `callId`（模型输出里工具调用块的 id，agent-loop:682–689） | L3 `metrics`：guard 拦截的那次调用，`rule.call` 与 `tool.call` 相同 | 被拦的调用按「同一会话、同一工具名、`tool/call` 之后的第一次拒绝」配对，配不上的记 `error` |

## 12. 实施分解

每一步一个提交（`AGENTS.md` 第 7 条），文档与行为同一批（`docs/ORCHESTRATION.md` §10.6、`docs/DESIGN.md` §2.4、§2.4a、§2.5、`docs/HANDOFF.md` 随各步改到当时的样子）。

| 步 | 内容 | 主要文件 | 验证 | 档位 | 独立评审 |
| --- | --- | --- | --- | --- | --- |
| 1 | 基础：字段表与校验、写入器、读取与核对、字数、项目根、构建戳 | `src/metrics/{schema,writer,read}.ts`、`src/shared/{text-units,project-root,build-info}.ts`、`scripts/build-info.mjs`、`package.json`、`scripts/preflight-bundle.mjs`（检查构建戳）、`tests/metrics-{schema,writer,read}.spec.ts` | L1、L2（验收 5 的 L2 部分、6、7、8） | 高 | 是：字段表是隐私的唯一关口 |
| 2 | 指标行：接缝、服务、行健康、行登记（`disabled: true`）；探针场景 | `src/metrics/{index,observe}.ts`、`src/shared/metrics.ts`、`src/shared/tool-names.ts`、`src/shared/health.ts`、`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`tests/metrics-row.spec.ts`、`tests/fake-rc3.ts`（只补 rc.3 真宿主会给的信号）、`tests/contracts.spec.ts`、`scripts/probe/` | L2；L3 `metrics`、`metrics-concurrent`（验收 1、2、4、5、12、13） | 高 | 否 |
| 3 | 现有代码交事件：guard 与图文件门禁、项目图引擎与命令行、GLM 上游、`/hourness` 的 `report` | `src/guard/{index,graph-files,records}.ts`、`src/graph/{engine,index,cli}.ts`、`src/graph/metrics-events.ts`、`src/glm-llm/zcode.ts`、`src/report/index.ts` 与对应测试 | L2；L3（guard 拦截后的 `rule` 与 `ref`，验收 2、3） | 高 | 是：碰 guard 与图引擎的审计（`DEVELOPMENT.md` §1.1） |
| 4 | 计算与命令行：`summary`、`verify`、`compare`、`backfill-graph` | `src/metrics/{calc,cli}.ts`、`scripts/metrics/cli.ts`、`package.json`、`tests/metrics-calc.spec.ts`、`tests/fixtures/metrics/` | L2（验收 8、9、10） | 高 | 否 |
| 5 | 报告改读指标流水，加覆盖行 | `src/workflow/morning-report.ts`、`src/report/index.ts`、`tests/hourness.spec.ts` | L2（验收 11）；L3 探针里的 `/hourness` | 高 | 否 |
| 6 | 启用：bundle 里指标行改为默认启用；在本仓库跑一次 `backfill-graph`，结果批注在 `metrics` 节点上 | `packages/hourness/cordis.patch.yml` | L3 全量探针；之后合入前关桌面版（`DEVELOPMENT.md` §1.1 末段） | 标准 | 否 |
| 7 | guard 规则 `metrics-files-only`（影子） | `src/guard/rules.ts` 或 M4 的规则目录 | L2、L3 | 高 | 是：guard 规则。等 M4 的 `GuardRule.mode` 合入后做 |
| 8 | 标定：每次运行的 `result.json` 加 `metrics` 一节（同一套算式） | `scripts/calibrate/run-calibrate.mjs` | L2（纯函数部分）；跑一次两题两档（积分预先授权，`norm-decision-tiers`） | 标准 | 否 |
| 9 | `workflow` 行退役：先 L3 预检（临时 profile 带给 `glm-hourness/workflow` 的 `home` 覆盖、bundle 里没有这一行，真实启动无新错误）；通过后删 `src/workflow/index.ts` 与 `decisions.ts`，`morning-report.ts` 移到 `src/report/`，删 patch 行、目录表、行健康与契约测试里的这一行 | 上述文件、`tests/workflow.spec.ts` | L3 预检；L1–L3 | 标准 | 否；预检不过就停下交人 |
| 10 | 批次 L4：桌面版重启，用一天；`verify` 干净；一天的大小写进 `docs/FACTS.md`；`/hourness` 的样子 | `docs/FACTS.md`、`docs/HANDOFF.md` | L4（验收 14、15 之外各条的真机部分） | 标准 | 否 |

先后：1 → 2 → 3 与 4 可以并行（3 改 guard、图、GLM 通道的文件，4 只在 `src/metrics/` 与命令行）→ 5 → 6 → 8、9 → 10。第 7 步跟 M4。M3、M4、M7、规则板各自实现时按 §4.2 与 §6.2 交事件，不在本特性的步里。

## 13. 验证

- L2：字段表的性质测试（随机生成带未知键、带空白或中文的字符串、超长行，全部拒收）；写入器的故障注入（注入的文件系统依次给出 `EACCES`、`ENOSPC`、`EBUSY`、目录是文件，之后恢复）；半行加 NUL 的文件尾；链与序号的核对（删一行、改一行、插一行、带 `gap` 的空洞）；计算的确定性（同一夹具算两次、打乱行序再算）；观察不改变行为（同一组流块与工具结果，有无指标行逐字相同）；契约测试（导入 `src/metrics/` 的文件清单）。假宿主只给 rc.3 真宿主会给的信号（`AGENTS.md`）。
- L3：探针场景 `metrics`（GLM 与非 GLM 各一回合，含一次 guard 拦截、一次 `userQuestions.ask`、一次图写入；核对验收 1–5）；`metrics-concurrent`（验收 12）；第 9 步的预检。
- L4：第 10 步。
- 标定：第 8 步跑一次，核对 `result.json` 的 `metrics` 与运行器自己的记分在步数、工具调用数、积分上相同。

## 14. 对其他设计的影响（各自下一次修订时改，本次不动它们的文件）

- M7：§3.4.4 的问答计数、§3.10 四答晨报、§3.12.3 人的负担与质量对照、§3.13 DORA 的来源列改为本设计 §7.2 的指标目录；派发工具加必填参数「理由类别」（`difficulty`、`cost`、`independence`、`escalation`、`person`、`other`），理由文字照旧写在调用里；在派发、计划、交回、审查、门禁、合入、失败、重试、过期各处交 `task` 事件；M7 的写入门禁交 `rule`（`by: 'execute'`）；workflow 行由本设计第 9 步退役，M7 不再接手它。
- M4：`installRuleGate` 交 `rule` 事件（跟进的 `outcome` 也交）；压制注释数改为每天一条 `count` 事件，不建 `suppressions.jsonl`；`metrics-files-only` 进规则目录，影子模式。
- M3：卡片构造在 `userQuestions.ask` 之前调 `tagQuestion`（`ref`、`form`、`pres`、`rpos`）；`/wish` 开关主 Agent 模式时交 `session`（`main`）。标定里模拟人的选择照常成为 `answer` 事件。
- plain-ui：计数拍板的判定函数共用 `src/graph/metrics-events.ts` 里的那一个；报告的跟随率从流水算。
- 规则板：交 `rule`（`by: 'rules'`）；项目键的根目录用 `src/shared/project-root.ts`。
- M6：额度与缺口流水不变；`/hourness` 面板标题写「本机全部项目」。
- 接管（`bootstrap`）：它指出的 `projectHome` 钉在本仓库的问题不影响指标流水（按会话算根）；违规流水仍受影响，按它提的任务处理。
- M8：以后的指标页经命令读 `calc.ts` 的结果；「讲细点 / 说重点」按下的次数加一个事件种类。
- `field-trial`：导出与匿名化以后基于这份流水；字段表本来就只有数与 id。

## 15. 由 agent 定、人可推翻的事项

1. 位置：项目的 git 根下的 `.llm/metrics/`，目录里自带 `.gitignore`；不用钉死的 `projectHome`，不在没有 `.git` 的目录里写。
2. 一天一个文件，按 UTC 日期；不删、不压缩；一天超过 64 MiB 只告警。
3. 多进程共用一天一个文件，L3 不过就改每个写入者一份。
4. 队列每个项目至多 2000 条，30 秒重试；不 `fsync`。
5. 一行至多 4 KiB；字符串只许 id 形状；未知字段整条拒收。
6. 路径记散列，命令只记第一个词；工具结果只记字符数。
7. 用户级用量流水照旧（账号的账），项目流水另记一份本项目的调用，`verify` 对账。
8. 违规流水照旧（文字、标注、语料），`rule` 事件引用它。
9. 派遣决策流水被取代，`workflow` 行退役（第 9 步）；旧文件不删。
10. 图历史补录成事件，让负担曲线从 2026-10-28 开始；用量不补录。
11. 主 Agent 选模型的理由：流水只记理由类别，文字留在会话与图上。
12. 不记人在对话里打的字。
13. `metrics-files-only` 先影子，走 M4 的阶梯。
14. 中位数、百分比与积分的取整规则；`CALC_VERSION`。
15. 给人的只有 `/hourness` 多一行覆盖范围，不加新命令；明细给编排方用命令行。
16. 不引入 OpenTelemetry SDK，只借它的字段口径。
17. 对话里人读的字数：主 Agent 会话里模型输出的文字块的字数。

## 16. 待人定的事项

### D1 指标流水这几件活怎样算做完

指标流水要拆成 10 步来做（§12），从写入器、接到 DSH 上、改晨报，到在桌面版上用一天。每一步要先写下「怎样算做完」，做的人和查的人都照它来；这属于定目标，按分工只能你定（`ORCHESTRATION.md` §2.9.1 第 1 类）。草稿是 §1.4 的 15 条，约 1,700 字符。

- A 逐条改后写入：你改哪条、删哪条、加哪条，就按你的话写；要读完 15 条草稿。
- B 按草稿原样写入：今天就能开工，查的人照这 15 条查；以后要改，仍要你点头。推荐 B：这些条目只描述机器上能核对的结果，没有替你定方向的内容。

一页纸（`onepage.md`）可以把 D1 并进人对整页的确认：确认这一页就按 B 写入，要改哪条直接说。

## 17. 交给编排者记图的事项

`graph-ops.json`（本目录）：

- `metrics` 节点批注：设计 0.1 写成，待独立评审；要点与待人定 D1。
- 提议 D1 的待决（决定者为人，推荐 B，单向门：验收写进节点之后改要人点头）。
- `m7`、`m4`、`m3`、`rules` 节点批注：本设计 §14 里各自要改的地方，下一次修订时处理。

实施任务节点在人确认一页纸之后由主 Agent 按 §12 提，不在本次。

## 18. 修订记录

- 0.1（2026-10-30）：初稿。
