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
