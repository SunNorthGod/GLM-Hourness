# metrics 设计 0.7 独立评审

## 第 1 遍（2026-11-01）

评审对象：`.agents/tasks/metrics/design.md` 0.7（1319 行，UTF-8 无 BOM，LF）。
基线对照：`.agents/tasks/metrics/design-0.6.md`（1149 行，`design-gate-fix.json` 通过的那一稿）。
范围：只评 0.7 相对 0.6 改动的节（逐行 diff 得出），即文首、§0、§1.1、§1.2（F15）、§1.3、§1.4（第 22、25 条）、§1.6、§3.1、§3.2、§3.3、§3.4、§4.2 规矩六、§6.1、§7.2、§7.3、§7.5、§7.6（新）、§9.1–§9.3、§11（第 19 项）、§12（第 4、4a 步与先后）、§13、§14、§15（第 32、38、40、41、42 条）、§16、§17、§18、§19.9。

核对方式：对 §7.6 所依赖的外部契约逐一实读来源，不取设计的转述。读了面板设计 `plain-ui/design.md` 1.3 §4.7/§6.4/§8.2/§10.3 第 13 项、循环板 `schedules/design.md` 0.6 §8.1/§8.3/§8.4、`reference/dsh-desktop-0.2.1-rc.3/dsh-session-projection/README.md`、`dsh-api-workspace-files/README.md`、`docs/CHARTER.md` §3.2 第 5 条与 §8、`src/graph/plain-question.ts` 的 `PLAIN_WORDS`、M7 `m7/design.md` 的周报与 `hourness_report`、图节点 `d-metrics-ratios-person-only.json`、以及 `design-review-fix.md` 中 F63–F65 的原文。

### 发现

1. MEDIUM — 第四个减负数字的「周报里」说明在 `MetricsBoardView` 形状里没有落点，且与验收第 25 条 (a) 相抵。
   位置：§7.6.2（`design.md:793`「`load` 一组是……三个数，另一行 `note` 写第四个在周报里」）、§7.6 例子（`design.md:731` 独立成行的「第四个数「因你的决定返工几次」在周报里，由项目图算」）、形状定义（`MetricsBoardGroup` 无 `note` 字段，`design.md:779–783`；`MetricsBoardRow.values` 是必填的 `readonly [string, string]`，`design.md:787`）、验收第 25 条 (a)（`design.md:117`「第四个（因人的决定返工几次）不在任何一组」）。
   问题：例子把第四个数画成 `load` 组里一条没有数值的独立文字行。但 `MetricsBoardGroup` 没有组级 `note`，`MetricsBoardRow.values` 又是必填的两元组，所以这条纯文字行既不能是组的字段，也不能是一条没有值的行；若硬塞成一条带两个占位值的行，既别扭又使「第四个在 `load` 组里」，与验收第 25 条 (a)「不在任何一组」直接相抵。§7.6.2 的「另一行 `note`」没有指明这条说明挂在哪个字段，三处（形状、例子、验收）无法同时成立。
   具体改法（三选一，改完让 §7.6.2、例子、接口、第 25 条 (a) 一致）：
   - A. 给 `MetricsBoardGroup` 加 `readonly note?: string`（一行，至多 60 个码点，用人话、过 `plainWordsIn`），§7.6.2 写明第四个数作为 `load` 组的 `note`；第 25 条 (a) 改成「第四个不作为 `MetricsBoardRow` 出现在任何组，只作为 `load` 组的 `note`」。
   - B. 声明这句话是页面固定文案（页头或页脚那一行），不进 `groups`；删去 §7.6.2 的「另一行 `note`」，例子里把它画成页面文案而不是组内行；第 25 条 (a) 原样成立。
   - C. 把它挂在 `load` 组某条已有行（例如「等多久」）的 `note` 上，并在 §7.6.2 写明挂在哪一行、例子按行内 `note` 画；第 25 条 (a) 补一句「不作为独立行」。

2. NIT — 非 `BOARD_ORDER` 板的 `guideLine` 在上手页怎样渲染，是本设计的解读，不是面板设计写定的行为。
   位置：§7.6.1 末段、§7.6.3「`guideLine`」、§11 第 19 项。
   依据：面板 1.3 §10.3 第 13 项 (c) 实读确认「页脚与上手页也会多出这块板的入口」，§4.7 实读确认页脚与上手页对每块登记过的板渲染一个 `<BoardLine>`；但 §6.4 的六块固定文案没有写 `BOARD_ORDER` 之外的板的 `guideLine` 一行落在上手页哪里。入口出现在上手页已核实，命令行 `summary` 与板页面本身的页头/`guideLine` 都是退路，人「新手教程里写明白」在最低限度上已满足。设计已把这一行渲染作为对面板的顺手对齐请求写在 §7.6.1 与 §14、并在 §11 第 19 项标为开着。建议保留此请求并在面板下一稿确认，不阻塞。

3. NIT — `guideLine` 字段的文档语义与指标板的用法不同。
   位置：§7.6.3；对照面板 1.3 §4.7（`guideLine` 注释「上手页那一块的一行此刻状态」，`design.md` 面板稿第 358 行）。
   问题：面板把 `guideLine` 记成「此刻状态」（规则板用它显示当前档位，循环板为 `null`），指标板用它放一句固定的指路话。编排方裁定允许「每块板经 `snapshot` 给 `homeLine` 与 `guideLine`，`guideLine` 告诉人去哪看比率」，所以用法本身获授权。建议把这一点并进 §7.6.1 给面板的对齐说明，免得面板后续维护者把非状态的 `guideLine` 当成缺陷。

4. NIT — 样本数的渲染与形状的分工不一致。
   位置：§7.6 例子（「原样同意 62.5%（8 次里 5 次）」）、§7.6.2 形状（`MetricsBoardRow.samples?: readonly [number, number]`，注释「the denominator」）、§7.6.3（「样本数作小字」）。
   问题：例子把「（8 次里 5 次）」拼进了值串，而形状把 `samples` 与 `values` 分开、`samples` 只放分母；分子（5）既不在 `samples` 也不单独存。建议写明括号里的分子/分母是由 `board-view.ts` 格式化进 `values`，还是客户端从 `samples` 与比率推出，使验收第 25 条与渲染一致。

### 对上一遍 NIT（F63–F65）的核对

这三条是 0.6 第二遍评审（`design-review-fix.md`）带过来的不挡路项，0.7 声明顺手改。逐条对照来源，均已落实（Closed）：
- F63（Closed）：§7.3 plain-ui 一条的括号由行号改成「plain-ui 1.3 §1.5『不做的事』的跟随率一条与人读字数一条、§12 第 29 条」。实读面板 1.3：§1.5 确有跟随率一条（第 149 行「人原样同意、补充、否掉的比例……面板不显示这个数」）与人读字数一条（第 152 行），§12 第 29 条（第 1063 行）确为「人原样同意、补充、否掉的比例不在面板上显示」。节号指得准。
- F64（Closed）：§3.4 的 `isPruneCall` 分隔符加单个 `&`（引号内与紧挨 `>` 的重定向除外），取头一个词前跳过 `call`、`start`、`time`、`env`、`NAME=value`、`cmd /c|/k`；验收第 22 条加 `& npm …` 与 `cmd /c npm …` 两例；§15 第 32 条同改；认不出的两种写法（整条包进引号交给另一个 shell、带空格的引号路径）写明靠事后 `prune` 与 `tool` 事件追。与 `design-review-fix.md` F64 的改法逐项一致。
- F65（Closed）：§4.2 规矩六写明 `TimeoutLine.kind='timeout'`、`ValueLine.kind='value'` 是行类型、不搬进事件，并补 `ValueLine → timeout.set` 的 `entry`、`kind`、`previousMs→prevMs` 与 `capped` 时 `told` 的交法；§17 `m4` 同补。与 F65 的改法一致。

### 已核实的假设

| 设计里的说法 | 依据（实读） | 结论 |
| --- | --- | --- |
| 人 2026-11-01 的原话与 §16 ②、§0、§1.2 逐字一致 | `docs/graph/nodes/d-metrics-ratios-person-only.json`：`status` 为 approved，`history[0].relay` 即那句原话 | 成立 |
| 面板的板块登记表容得下第三块之外的板，id 为 string、排在 `BOARD_ORDER` 之后、按登记先后 | plain-ui 1.3 §4.7（`BOARD_ORDER=['rules','loops','lessons']`；`Board.id: string`；按 id 去重；不在序内的排后、按登记先后；各板实现往表里登记自己）、§12 第 52 条 P11-03 | 成立 |
| `homeLine`、`guideLine` 为一行、至多 60 个码点，`null` 不显示；校验在 §8.2 | plain-ui 1.3 §4.7、§8.2（第 813 行：`homeLine`/`guideLine` 为 `null` 或字符串、一行、至多 60 个码点，不合那一行不显示） | 成立 |
| `peakApplies` 只有规则板用、其余板为假；每块板一个错误边界、`snapshot`/`subscribe` 抛错当这块板不在 | plain-ui 1.3 §4.7 | 成立 |
| 登记一块板后页脚与上手页都多出它的入口 | plain-ui 1.3 §10.3 第 13 项 (c)（「页脚与上手页也会多出这块板的入口」） | 成立 |
| `guideLine` 一句「同意的比例、问法的分布、按模型的比较都在「指标」板上，主 Agent 不转述」是 38 个码点 | 逐字符计数 | 成立（≤60） |
| 会话投影是客户端读模型，不注册任何给模型的东西，不参与给 provider 的请求 | dsh-session-projection README「Model Experience: None … registers nothing model-facing」「projections never assemble or send provider requests」 | 成立（支撑 §7.6.4 与 `CHARTER` §8） |
| 可选登记经 `ctx.inject(['sessionProjections'], …)`；没有 `wire` 的投影只在宿主 | dsh-session-projection README「Contributors may preserve optional registration through `ctx.inject(['sessionProjections'], …)`」「a unit without a `wire` block stays host-only」 | 成立 |
| `init(header)` 按 `cwd` 算路径、`apply` 原样返回状态是既有可行做法 | 循环板 0.6 §8.4（`hournessLoops` 的 `init(header)` 按 `cwd` 算 `view.json` 路径）；session-projection README（`apply` 对不相关事件返回同一引用） | 成立（与循环板同一种做法） |
| 客户端 `remote.workspaceFiles.readBytes(sessionId, viewFile, {})` 读整份文件 | dsh-api-workspace-files README（`readBytes(sessionId, path, options, signal)`；「Pass the required options object as `{}` for a complete file under `maxFileBytes`」，`maxFileBytes` 32 MiB，`view.json` 至多 64 KiB） | 成立 |
| 循环板的 `view.json`/`readBytes` 做法在 §8.1、§8.3、§8.4 | 循环板 0.6：§8.1 位置与登记、§8.3 首页一行、§8.4 数据怎样到页面（宿主写 `view.json`、页面经 `readBytes` 读） | 成立 |
| 宪章要的四个减负数字是：每周被问次数、每次要读的字数、拍板等待时间、因人的决定返工次数；其中前三个流水算得出、第四个要图 | `docs/CHARTER.md` §3.2 第 5 条（第 46 行逐字列这四项）；§8（第 128 行「指标不注入模型上下文」） | 成立 |
| 第四个数由 M7 从图算、周报转述 | m7 设计 m7-8（周报含「因人的决定返工了几次」）、§3.12.3（降档后的返工、底线清单提议）、`floor-add`（第 721 行） | 成立 |
| `hourness_report` 是主 Agent 的工具、结果进模型上下文；周报函数是 `weeklyReport`（`src/report/weekly.ts`） | m7 设计（`hourness_report` 工具表「只有主 Agent」；`weeklyReport(input)`（`src/report/weekly.ts`）第 1147 行） | 成立（§14 M7 ③ 的文件名与函数名与 M7 一致） |
| 板上固定字串不含换词表的词，也不含「流水」 | `src/graph/plain-question.ts` 的 `PLAIN_WORDS`（验收、标定、门禁、投影、补遗/附录）与例子逐字对照；§7.6 的页头、组名、`guideLine` 均不中 | 成立 |
| F63 指出的面板原句在面板下一稿漂移、F65 指出 `TimeoutLine`/`ValueLine` 有行类型 `kind` | `design-review-fix.md` F63、F65 与面板、M4 的行号对照 | 成立（0.7 的改法与评审一致） |

### 未核实 / 存疑的假设

| 设计里的说法 | 为什么未完全核实 | 影响 |
| --- | --- | --- |
| M7 0.6 §3.12.4 写「数字由 harness 算，模型只转述」 | 未在 m7 设计里定位到这一句的逐字原文；m7 的报告结构（四答晨报、周报、DORA 从图/审计/用量算）与此一致 | 低：§14 M7 ③ 是对已冻结 M7 的请求（dogfood 之后对齐），非本设计的实现项 |
| 非 `BOARD_ORDER` 板的 `guideLine` 在上手页会作为「入口加一行」渲染 | 面板 §6.4 只写了六块固定文案，未写这种板的上手页样子；设计按此解读并已向面板提对齐请求 | 见 NIT 2：入口出现已核实，`guideLine` 一行的渲染待面板确认，有退路 |
| 面板下一稿会把 §12 第 29 条、§1.5 里的「周报」改成「指标板」、`Board.id` 注释补上生产板 | 这些是设计写给面板的顺手对齐，面板尚未改 | 低：都标为 dogfood 之后对齐，不改本设计行为 |

### 结论

挡路（HIGH+MEDIUM）1 条：MEDIUM 1（发现 1），HIGH 0。verdict：CHANGES_REQUESTED。
0.7 要做的几件（记人 2026-11-01 的决定并删代价句、§16 ② 改为已定、新增 §7.6 指标板并对面板 1.3 登记表核过装得下、三个减负数字移到事实、对 M7 周报改写、折入 F63–F65、§16 ① 留开）均已落实，对面板/投影/工作区文件/宪章/循环板/M7 的外部引用逐项实读核对为真。唯一挡路项是 §7.6 指标板页面数据形状里第四个减负数字的说明没有落点、并与验收第 25 条 (a) 相抵，按发现 1 的三选一补一处即可，是一次小的回环。

## 第 2 遍（2026-11-01）

评审对象：`.agents/tasks/metrics/design.md` 0.7 第二遍（版本号不变；评审读过的第一遍稿存为 `design-0.7-pass1.md`）。
基线对照：`design-0.6.md`（1149 行），仍只评 0.7 相对 0.6 改动的节；本遍是修订评审，先逐条复核第 1 遍的 F66–F69，再看第二遍改动有没有引入新问题。
范围与第 1 遍相同，重点在 §7.6（§7.6.1–§7.6.5、例子、形状 `MetricsBoardView`/`MetricsBoardGroup`/`MetricsBoardRow`）、§1.4 第 25 条、§3.4（`prune` 前缀写法）、§9.2–§9.3（`view.json` 为副本）、§11 第 19 项、§14（plain-ui）、§17（`m8-plain-language`、`m7`、`user-journey`）、§18、§19.10。
核对方式：对 §7.6 的形状、例子、§7.6.2、§7.6.3 与验收第 25 条逐处对读取其是否四处一致；外部契约（面板 1.3 §4.7/§8.2 的 `Board`/`BoardState` 字段、投影 README、工作区文件 README、循环板 §8.1/§8.4、`PLAIN_WORDS`）在第 1 遍已实读核对为真，第二遍没有改这些契约的引用，沿用第 1 遍的核对结论。

### 对第 1 遍发现的复核

- **F66（MEDIUM，Closed）**：取评审三选一的 A。`MetricsBoardGroup` 现有 `readonly note?: string`（注释「one line, at most 60 code points, plain words; only `load` uses it」，`design.md:783`）。四处已一致：形状（§7.6.2，`MetricsBoardGroup.note`）；「上板的数」（§7.6.2「第四个减负数字不作为行，而是这一组的 `note`……（25 个码点，`note` 只有 `load` 组用，F66）」）；页面渲染（§7.6.3「`load` 组在末尾多一行纯文字，是这一组的 `note`（第四个减负数字，F66）」）；验收第 25 条 (a)（「第四个（因人的决定返工几次）不作为 `MetricsBoardRow` 出现在任何组，只作为 `load` 组的 `note`（F66）」）。`MetricsBoardGroup.note`（组级，限 `load`）与 `MetricsBoardRow.note`（行级，M7 未接上的比率行用「还没接上」）是两个字段，互不冲突。该 `note` 在本设计的 `view.json` schema（`src/shared/metrics-board.ts`）里，不在面板的 `BoardState`，所以不动面板契约、无新增事件种类——与第 1 遍核过的「登记表装得下、不改面板设计」一致。
- **F67（NIT，Closed）**：§7.6.1 末段二、§11 第 19 项、§14 plain-ui、§17 `m8-plain-language` 都写明「入口出现在上手页已核实，加板页面与命令行 `summary` 后备，人『新手教程写明白』在最低限度上已满足，`guideLine` 一行待面板下一稿确认，不挡事」，并保留给面板的对齐请求。落实一致。
- **F68（NIT，Closed）**：§7.6.1 末段四写明面板 §4.7 把 `guideLine` 记成「此刻状态」、指标板用它放固定指路话，由编排方裁定授权，提示面板后续维护者不要当缺陷；§14 plain-ui、§17 `m8-plain-language` 同补。§7.6.1 的「三处文字」已改「四处文字」。落实一致。
- **F69（NIT，Closed）**：形状注释已写明 `values` 里由 `board-view.ts` 拼进括号样本数（如「62.5%（8 次里 5 次）」），`samples` 是每个窗口的分母、机器可读、给 `compare`/`verify`/测试、页面不另渲染；§7.6.3「每行行名与两个值」一句与验收第 25 条 (a)（「值以 `40.0%` 开头、`samples` 最近 7 天一项为 5」）一致。按验收第 4 条夹具 40.0%＝2/5，分母 5 进 `samples`、括号显示「5 次里 2 次」，自洽。

### 第二遍的新发现

1. NIT — §7.6 例子里第四个减负数字的 `note` 文字与 §7.6.2/§19.10 的规范文字内层引号不一致。
   位置：§7.6 例子（`design.md:735` 画成「第四个数「因你的决定返工几次」在周报里，由项目图算」，内层用「」）；§7.6.2（`design.md:797`「第四个数『因你的决定返工几次』在周报里，由项目图算」，内层用『』）；§19.10（F66 行同用『』）。
   问题：设计写明这句 `note` 由 `board-view.ts` 写死、L2 对它跑 `plainWordsIn`，是逐字串；例子与规范文字对同一串用了不同的内层引号。两处码点都是 25、都过 `plainWordsIn`、都 ≤60，行为无差别，仅文档不一致。
   具体改法：把例子第 735 行的内层「」改成『』，与 §7.6.2、§19.10 对齐（规范文字用嵌套『』更正，取规范一侧）。

### 已核实的假设（第二遍）

| 设计里的说法 | 依据（实读） | 结论 |
| --- | --- | --- |
| `MetricsBoardGroup.note` 只在本设计的 `view.json` schema 里，不进面板 `BoardState`，加它不动面板契约 | §7.6.2（形状在 `src/shared/metrics-board.ts`，宿主与客户端共用）、§7.6.3（客户端读 `view.json`、校验、自渲 `Page`；登记给面板的仍只是 `id/label/homeLine/guideLine/peakApplies/Page`） | 成立：无新增事件种类、无面板请求 |
| 组级 `note`（限 `load`）与行级 `note`（M7 未接上比率行用）是两个字段，不冲突 | `MetricsBoardGroup.note`（`design.md:783`，注释 only `load`）与 `MetricsBoardRow.note`（`design.md:793`，无限制）；§7.6.2「还没接上」挂在行、§7.6.2 第四个数挂在组 | 成立 |
| 第四个数的 `note`「第四个数『因你的决定返工几次』在周报里，由项目图算」为 25 个码点、≤60 | 逐字符计数（含『』两个括号字符） | 成立 |
| 验收第 25 条 (a) 的 40.0% 与 `samples` 最近 7 天一项 5 对得上验收第 4 条夹具 | 验收第 4 条「比例是 40.0%（5 条里 2 条）」，分母 5 | 成立 |
| 面板登记表装得下这块板（`Board.id` string、排 `BOARD_ORDER` 后、`homeLine`/`guideLine` 60 码点限、`peakApplies` 其余板为假、每板一错误边界、固定字串不含换词表的词与「流水」） | 第 1 遍已对 plain-ui 1.3 §4.7/§8.2、投影/工作区文件 README、`PLAIN_WORDS` 实读核对；第二遍未改这些引用 | 沿用第 1 遍：成立 |

### 未核实 / 存疑的假设（第二遍）

| 设计里的说法 | 为什么未完全核实 | 影响 |
| --- | --- | --- |
| M7 0.6 §3.12.4「数字由 harness 算，模型只转述」的逐字原文 | 第 1 遍即未在 m7 设计里定位到逐字句，报告结构与此一致 | 低：§14 M7 ③ 是对已冻结 M7 的 dogfood 后对齐请求，非本设计实现项 |
| 非 `BOARD_ORDER` 板的 `guideLine` 在上手页的渲染样式 | 面板 §6.4 未写这种板的上手页样子，设计按「入口加 `guideLine` 一行」解读并提对齐请求 | 低（F67）：入口出现已核实，板页面与命令行 `summary` 是退路，待面板下一稿确认 |

### 结论

复核：第 1 遍 F66（MEDIUM）、F67–F69（NIT）全部 Closed，四处落实一致，无新增事件种类、不改面板设计。第二遍新发现 1 条 NIT（例子内层引号与规范文字不一致），不挡路。
挡路（HIGH+MEDIUM）0 条：HIGH 0、MEDIUM 0。verdict：APPROVED。
