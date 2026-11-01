# 规则板设计：信号、资源与规则（项目图节点 `rules`）

版本：0.3（2026-10-29），按设计评审第 1 轮（F1–F19）与第 2 轮（F20–F27，`design-review.md`）修订，修订记录见 §20。
节点：`rules`（feature，父 `orch`，依赖 `split`）；相关节点 `d-plan-approval`、`m4`、`m7`、`m8`、`question-14`（G3）。
人的原话（逐字，按时间先后）：

- 「对！资源管理这方面，你好好设计一下。比如我另一个项目就很容易需要申请大量的系统CPU和内存资源，但是我有时候在用电脑又不想让LLM占用那么多。。。或许我们应该抽象成一个叫做规则的板块？里面可以实时更新一些正在遵守的规则，例如dsh正在被使用、不允许占用过多资源等等？」
- 「范围会不会太大了点？要不改成单项目的？」「我需要的是抽象成一种概念，我刚才举得例子只是可能的情况。还可能有很多种情况啊。」
- 「先不允许自己加规则吧，只有人能动」
- 「以后每个选项依旧推荐一个但是推荐的放到最后一个选项，靠这种方式强制人读完吧」

由此：本稿先给概念，资源管理是概念下的第一族规则；范围是待人定事项 D1；规则只由人写，引擎在每次写入时按身份核对（§2.5）；本稿里每一组选项恰有一个推荐项，放在最后；交人定的 §19 按选项卡格式写（图节点 `d-option-card`：每个选项一段加粗的「怎么做」与一行效果，推荐项多一行「为什么」），只有单向门的题带一行反方（`d-counter-line`，2026-10-29 改为只对单向门）。

依据：main `0639bf5`。其中与本稿有关的：`f08981f`（`question-26` C、`d-failure-plans`）；`d3e777d`、`3ee62aa`（评审挡路标准，预案包括优雅地重试与事后可追溯）；`22bebec`（`d-counter-line`）；`d67980b`（`docs/DEVELOPMENT.md` §1.1「设计依据的学科」）；`6f28898`（`d-option-card`、反方只对单向门、`d-inertia-breaker`）；`44e8601`（图引擎要求推荐项放最后）；`7aa8fe5`（M3 第 2 步：`src/graph/stage.ts` 的 `goalOf`、`effectiveStage` 与 `src/graph/main-agent.ts` 的 `MAIN_AGENT_KEY`、`mainAgentActive` 已在 main）；`04d3394`（split 分支评审通过，等合入）。图引擎核对卡片字段 `why`、`weight`、`counter` 与选项字数的改动停在分支 `m3-base-card` 的 `de0ccf6`，没有合入 main（等表格版卡片定稿，`recommend-last` 节点批注），本稿按那个提交的字段与上限写（§9.4）。split 设计 0.3 与附录 0.5（附录评审 APPROVED，图提交 `b5eb2c9`）：两个插件 `dsh-glm-zcode`、`dsh-hourness`，规则板属于编排层包 `dsh-hourness`，包启用时对所有路由与模型生效（`question-14` G3）。M3 设计 0.4 与它 §15 的人定结果。宿主契约以桌面版运行时包 `reference/dsh-desktop-0.2.1-rc.3/` 为准（`docs/DEVELOPMENT.md` §4）。

依据的学科与标准（`docs/DEVELOPMENT.md` §1.1、`docs/ORCHESTRATION.md` §4.3「架构」一栏，评审按这里列的去审）：

| 部分 | 学科与标准 | 用在哪 |
| --- | --- | --- |
| 存储、流水与恢复（§4） | 可靠性工程：预写日志（先追加流水并 `fsync`，再原子替换快照）、崩溃一致性、确定的状态转换（写入与重放用同一个纯函数）、事件溯源里「快照是缓存、流水是事实源」 | §4.4、§4.5、§11.2 |
| 权限、身份与文件门禁（§2.5） | 安全工程：最小权限、身份由入口决定不从请求里读、纵深防御（引擎核对加文件门禁）、威胁模型写明防什么不防什么 | §2.5、§7.5、§13 |
| 租约（§8） | 分布式系统的租约：期限加续租、占用者死亡的证明、持有凭证（`token`）才能释放 | §8 |
| Windows 资源控制（§7） | 操作系统的调度与 Job Object 文档（优先级类的继承、亲和性限制、CPU 硬上限、嵌套 job），每条行为都以本机试验或文档语义标明 | §7.1–§7.5 |
| 在场检测（§5） | 测量：近似量（输入空闲、前台窗口）先影子运行、按一致率放开 | §5.6、§19 D2 |
| 面板、在场按钮与给人的选项（§9、§19） | 认知负荷与 `d-option-card`：一眼看懂的加粗短语、推荐放最后、单向门才有反方；日常不加人的点击（`d-plan-approval`） | §9、§19 |
| L3 的阈值（§15） | 测量与统计：按处理器数推出期望值，留出误差界（不超过 1.1k、不少于 1.5k），延迟取 p95 | §15 R9 |

查过的现成方案及不用的原因：检测器做成调用前的命令 hook（§5.9）；DSH 的 `ctx.subprocess`、DSH 内部的进程绑定、自编译的可执行文件（§7.4）；每条命令一个 job、CPU 硬上限（§7.3）；把规则写成项目图节点（§10.2）。

范围：只有设计。没有改产品代码、已跟踪文件、`docs/graph/` 与 `~/.dsh`，没有用桌面版。本机试验在 `.agents/tasks/rules/exp/`（说明见其中的 `README.md`），只作用在试验脚本自己启动的一次性 node 与 powershell 进程上，结束后没有残留进程（`exp/out/results*.json` 的 `leftRunning` 都为空），没有改系统或用户的执行策略。

证据写法：沿用 split 与 M3 设计。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，其他文件写出文件名；README 写文件名与行号或小节。〔实读〕读过源码或包文档；〔本机试验〕在 `exp/` 下运行过；〔推断〕由源码或文档推出、没有运行；〔未核实〕列进 §15 的核实项。Windows API 的语义以 Microsoft 文档为依据，本轮没有联网复核；用到的行为凡是本机试验覆盖了的都写明〔本机试验〕。

## 0. 摘要

- 概念（§2）。规则板由三样东西组成。信号是关于世界的事实：人在不在电脑前、桌面版被谁占着、是不是 GLM 高峰、焦点所在目标在哪个阶段、机器还剩多少内存。资源是要分配的东西：一次只能给一个占用者的（桌面版、沙盒 profile，用租约记占用者），以及按档分给大家的（CPU、派发槽位）。规则写明在什么条件下、对谁、约束哪一类动作、按什么方式执行、管多久、谁设的、为什么。被规则推迟的工作是等待单。条件与动作只能用一套固定的词汇写，词汇在代码里扩充；harness 查得了的规则在执行边界执行，写不成词汇的规则只告知，面板与给 agent 的提醒都标明「只告知，harness 不检查」。
- 执行方式：规则有四种，拦截、排队、只记录（影子）、只告知；第五种限速只属于内置的预算规则，人改的是预算的数字（§2.3，F9）。多条规则同时命中时取最强的一种；没有「放行」规则，所以加规则只会更严（§2.4）。
- 谁能写（§2.5，人定）：规则只由人增、改、解除、删除；agent、子 agent 与检测器都不能写规则。检测器只更新信号，agent 只能提议规则或检测器，人在面板上点一次才生效。引擎对每次写入按身份核对，规则文件另有文件门禁。
- 自动检测（§5，回应人问的「借鉴一下 hook 的设计」）：检测器像 hook 一样由触发（定时、时间表、文件变化、日志行、进程起停、宿主事件）加检查（内置检查，或一条命令：退出码 0 且标准输出是 JSON 才算读到值）组成，只写信号，不写规则。信号带值、来源、时间与有效期；检测器失败、超时或过期，信号读作「未知」，不会读成「否」。内置检测器覆盖人举的例子：人在不在电脑前（输入空闲、前台窗口、桌面版窗口在前台）、GLM 高峰、机器负载（CPU、内存、磁盘）、错误日志（盯一个文件，数匹配的行）、服务健康（HTTP 探测）。检测器由人加（agent 可以提议），低优先级、有超时；新检测器先影子运行，引用它的规则在影子期只记录、不执行。
- 范围（§3，D1）：推荐只把物理上一台机器只有一份的东西放在机器一级（在场、租约、预算、等待单，`~/.dsh/glm-hourness/rules/`），规则按项目存，另有代码里的内置规则。
- 执行边界（§6）：每次工具调用（`tools/pre-execute`）、每步提醒（`agent/pre-step`）、系统提示词里的一行声明、派发（`subagent`、`subagent_fork` 与 M7 的派发工具）、本仓库的探针与标定脚本，以及一个给 Kiro 与脚本用的命令行。排队的调用当场拒绝并开一张等待单，条件解除时 harness 给原来的 agent 发消息叫它重试；规则也可以要求在调用处等一段时间。
- Windows 上能控制的（§7，本机试验两轮）：两级手段。优先级一级不要辅助进程：降低 DSH 宿主进程的优先级，之后派生的进程都继承（Node `os.setPriority`）。job 一级要辅助进程（Windows PowerShell 5.1 的 Add-Type P/Invoke，经 `-EncodedCommand` 引导，不加依赖）：规则行激活时就把宿主收进一个命名的 Job Object（先把 job 句柄复制进宿主，辅助进程死了名字也在），人在电脑前时用 job 的亲和性限制把宿主进程树压在 k 个逻辑处理器上，宿主自己保持正常优先级，宿主的后代（含已经在跑的命令）由辅助进程逐个降为低于正常；人走开时先放宽、强制回正常，再清掉限制。试验里 4 个空转线程在 2 个处理器的限制下合计 1.94 核，放开后 3.96 核，限制打满时宿主的定时器延迟 p95 为 1.0 毫秒；CPU 硬上限同样压得住（1.6 核上限下 1.5 核），但打满时宿主停顿 p95 262–316 毫秒，所以不用。做不到的：改写或包装 agent 的命令（参数被冻结）、拿到 DSH 为某次调用派生的进程的 pid、在不危及 DSH 宿主的前提下给内存设总上限、管 DSH 以外的进程、管规则行激活之前宿主已经派生的进程的 CPU（只能降它们的优先级）。内存靠「重活」排队与可用内存信号管。
- 第一批规则（§2.6、§8）：桌面版与沙盒 profile 的租约（占用者、用途、期限、占用者死亡即释放，机器重启与状态文件被清零之后能恢复）；人在电脑前时的预算（降优先级、CPU 上限、重活排队、派发槽位）；在场的判断（人手设为主，检测器先影子运行）。已有的 guard 规则、图文件门禁、M3 的两条写入规则与 GLM 高峰提醒留在原处，规则板只列出它们；「一次只跑一个探针」与模型选择器的提醒收进规则板。
- 实施（§16）：split 合入之后，在编排层包里加一行 `glm-hourness/rules`，默认禁用；按 `question-28` C 排在 M3 骨架、推荐放最后、人话面板之后实现。核心、租约、预算的优先级一级、重活排队与最小面板放 M4（在场按钮从第一版起就让 LLM 的活让路；顺带给 M4 一套影子模式机制），job 一级、在场检测与派发槽位放 M7，面板的完整呈现随 M8。
- 待人定（§19，按 `d-option-card` 写，推荐项在最后）：D1 范围、D2「人在用电脑」怎么判断、D3 限速还是排队、D4 默认预算（单向门，带反方）、D5 已有规则收进来多少。

## 0.1 待人定的事项（摘要；选项、得到与代价、推荐见 §19，每组的推荐项都是最后一个 C）

| # | 事项 | 推荐 |
| --- | --- | --- |
| D1 | 规则板的范围 | 信号与资源在机器一级，规则按项目 |
| D2 | 「人在用电脑」怎么判断 | 人手设为主，检测器先影子运行，达标后由人放开 |
| D3 | 人在电脑前时，限速还是排队 | 两者都用：重活排队，其余限速 |
| D4（单向门） | 默认预算 | 中档：低于正常优先级、CPU 上限为全部逻辑处理器的 25%（这台机器上 8 个）、重活排队、派发 1 路；带 CPU 上限时 DSH 宿主在重启之前一直在一个系统作业里 |
| D5 | 已有规则收进规则板多少 | 代码里已有的规则只列出、不搬；探针、桌面版与模型选择器的约定收进来执行 |

人已定、本稿照做的：规则只由人写（2026-10-29）；选项的推荐项放最后（2026-10-29）。

## 1. 需求与验收

### 1.1 要解决的问题

1. 人在用电脑时，LLM 的活（构建、测试、并行的子 agent）把 CPU 与内存占满。人的另一个项目尤其如此。
2. 有些资源一台机器只有一份：桌面版（Electron 独占 profile，`docs/DEVELOPMENT.md` §3）与沙盒 profile `glmsandbox`（探针与标定共用，同节「不要同时运行」）。今天靠约定。2026-10-29 02:09 的蓝屏（BugCheck 0x3B）中断了几个运行，其中一个的状态文件被清零（`.agents/tasks/zcode-parity/graph-comment-crash.json`、`.agents/tasks/split/graph-comment-crash.json`、`.agents/tasks/zcode-parity/integration.md`:168），约定上的占用没人释放，也没有记录可查。
3. 规则散在各处（guard、M3 的写入规则、高峰提醒、文档里的约定），人看不到哪些正在生效、谁设的、在挡着什么。
4. 人要的是一个概念，资源只是例子（人的第二条原话）。

### 1.2 功能需求

- F1 规则模型：每条规则写明管什么、对谁、条件、执行方式、期限、来源与理由；条件与动作用固定词汇写；写不成词汇的只告知，并标明。
- F2 信号与检测器：信号来自人手设、检测器、租约、时钟、项目图阶段与主 Agent 角色；检测器由触发加检查组成，内置在场、GLM 高峰、机器负载、错误日志、服务健康与命令检查；每个信号带来源、时间、有效期与证据，失败或过期读作未知。
- F3 资源与租约：独占资源的占用者、用途、期限、续租，占用者死亡与机器重启后的回收；按档分配的 CPU 与派发槽位。
- F4 执行：在执行边界拦截、排队、限速、只记录、只告知；排队的工作有等待单，条件解除时通知原来的 agent。
- F5 agent 看到对它生效的规则：变化时、压缩之后与目标轮上注入一次，之后留在它的上下文里。
- F6 人在面板上看到生效的规则、设的人、起始时间与在等它们的工作，一次操作设或解除。
- F7 只有人能写规则；agent 可以提议；引擎按身份核对每次写入。
- F8 留痕：规则、信号、租约与等待单的每次变化都有一条记录，写明谁、何时、为什么、凭什么（`docs/CHARTER.md` §7.1 条款 11）。
- F9 激活期不抛错，降级经行健康上报（`AGENTS.md`；`docs/DESIGN.md` §2.5、§7）。
- F10（可选）其他工具（本仓库开发时用的 Kiro）能读同一份状态、按规则自查。

### 1.3 非功能需求

- 机器一级的状态被多个进程同时读写（桌面版宿主、headless 运行、命令行、脚本）：写入原子、带锁，崩溃之后可以恢复。
- 每次工具调用的额外开销在毫秒级：内存里的状态按文件修改时间刷新，不每次解析。
- 不增加运行时依赖：PowerShell 5.1 随 Windows 提供，其余用 Node 内置模块。
- 规则要少：一个项目同时生效的规则至多 50 条，每步提醒至多列 12 行（`docs/CHARTER.md` §7.3「规则少而精」）。

### 1.4 验收条件

1. 人在面板上点「我在用电脑」之后 10 秒内，本机每个用真实用户级目录的 DSH 宿主进程按它能做到的一级执行，并在行健康与面板上写明是哪一级：
   - 优先级一级（M4，不要辅助进程）：宿主降为低于正常，之后派生的进程继承；点之前已经在跑的命令不变（§7.5）。
   - job 一级（M7，要辅助进程，D4 的档位带 CPU 上限）：宿主保持正常优先级；宿主在 job 里的全部后代，包括点之前人不在时已经在跑的命令，读到低于正常；宿主进程树合计至多用 k = max(1, ⌈n × `cpuPercent` / 100⌉) 个逻辑处理器（n 为本机逻辑处理器数），所有宿主用同一组处理器，所以全机的宿主合计同样至多 k 个（量得的误差 10% 以内）；上限打满时宿主自己的定时器延迟 p95 不超过 20 毫秒。规则行激活之前宿主已经派生的进程不在上限之内，只降优先级，它们的个数写在行健康与面板上。
   点「我走开了」之后 10 秒内：job 一级下宿主与它在 job 里的全部后代读到正常优先级、可以用全部逻辑处理器；优先级一级下宿主回到正常，人在时派生的进程保持低于正常（机器空闲时不影响速度，§7.3）。
2. 被人声明为重活的命令在人在电脑前时被拒并开一张等待单，拒绝文字写明规则、设的人、起始时间、单号与正路；人走开或规则解除之后 30 秒内，原来的 agent 收到可以重试的消息，原来的 agent 是已经结束的子 agent 时，派发它的根 agent 收到（§6.3）；同一会话重试同一个调用不开第二张单，同一个派发根下重派的子 agent 做同一个调用也不开第二张。
3. 桌面版租约被人占着时，agent 驱动桌面版的调用（重启脚本、DevTools 协议脚本、`plugin_manager`）被排队；租约释放之后，排在最前的等待单得到 5 分钟的保留。
4. `npm run probe` 或 `npm run calibrate` 在同一个沙盒 profile 上已有运行时立即退出（退出码 3）并写明占用者；带 `--wait` 时等待。占用它的进程被强行结束之后，下一次运行能接手。命令行续租与释放外部或进程占用者的租约要带取得时拿到的 `token`，不带或不符时被拒（`forbidden`）。
5. 机器状态快照被清零或截断之后，下一次读取从流水重建，面板显示「快照损坏（清零、截断或读不出），已按流水重建」；重建出来的状态与清零前最后一次完整写入之后的状态摘要相同（租约、等待单、预算、信号、宿主条目与没有生效的记录逐项相同，包括写入时清理掉的条目与之前的恢复记录），引擎自己写的记录一条也不会被列为「不是引擎写的」；再清零一次重建，结果相同（§4.5）。在引擎之外往流水末尾追加一条记录（例如一条 `actor: human` 的 `rule-lift`）之后，那条记录不生效，面板与行健康写「流水第 N 条不是引擎写的，没有生效，请核对」，人点「按记录生效」或「忽略」之前一直列着（§4.5）。
6. 机器重启之后，绑定进程或会话的租约全部失效。
7. agent 调用 `rules_propose` 只产生图上一张决定者为人、双向门、推荐项在最后的待决和随后的一条提议，任何调用的判定都不变；图引擎拒绝这张待决时两样都不产生，工具结果带引擎的字段路径；人在「需要你」里拍 `set`（或在规则视图里点「设为生效」）之后规则才生效，历史写明提议者、人与那张待决；拍板之后规则行没跟上时，下一次读状态补写。agent 经工具或命令行写规则一律被拒（错误码 `forbidden`）；agent 用文件工具或 shell 改规则文件被拦。
8. 只有文字、没有动作的规则在面板与提醒里标「只告知」，不改变任何调用的判定。
9. 新加的检测器（含在场检测器）在影子期内：信号照常算出并显示，引用它的规则只写影子记录、不执行；放开要人在面板上操作。检测器的检查失败、超时（命令检查默认 10 秒）或它的运行者心跳过期之后，信号读作未知，引用它的规则不生效，面板写明原因；不会把它读成「否」。命令检查在低于正常优先级运行，同一宿主同时至多一个。
10. 每步提醒只在对这个 agent 生效的规则或它的等待单变化、压缩之后与目标轮上出现；没有变化的步不注入。
11. 行未启用、数据目录行缺席、辅助进程起不来、PowerShell 被策略禁止时，激活不抛错，行健康写明哪一项不生效，其余照常。
12. 面板列出 guard 的两条规则、图文件门禁、M3 的两条写入规则与 GLM 高峰提醒，写明在哪一行实现、那一行是否生效；这些在面板上不能解除。
13. 命令行 `npm run -s rules -- check` 对一个假设的调用给出与执行边界相同的判定。

### 1.5 让人少做了什么（`question-27` B）

- 今天：桌面版与沙盒的排他靠人记着、靠 agent 读文档自觉；人坐下时要自己去结束或暂停 LLM 起的构建；规则散在文档里，出事后要人去翻是谁违反了约定。
- 之后：人坐下时点一次在场按钮（检测器放开之后连这一下也不用），LLM 的活自己让路；被推迟的工作由 harness 记下并在条件解除时叫回 agent，无人值守时不需要人去重派；桌面版与沙盒的占用由租约管，崩溃后自己回收；人只在想加、改、撤规则时出场，agent 的提议在「需要你」里一次点击。
- 不增加的：日常的派发、排队、唤醒、租约与预算都不要人点（`d-plan-approval`）；可量的负担（每周被问几次、每次要读多少字）在晨报的规则板一节里按提议数与人的操作数计（§10.5）。

## 2. 概念

### 2.1 三样东西

| 概念 | 是什么 | 例子 | 谁更新 |
| --- | --- | --- | --- |
| 信号 | 关于世界的一条事实，带值、来源、时间、有效期与证据；谁都能读 | 人在不在电脑前；现在是不是工作日 9–18 点；GLM 是不是在高峰；机器负载；后台日志里最近 5 分钟有几条错误；某个服务是不是活着；焦点所在目标的阶段；人设的开关（例如「代码冻结」） | 检测器（像 hook 一样由触发加检查组成，§5）、人手设（也可以盖过检测器的值）、宿主自己算（时钟、租约、阶段、角色） |
| 资源 | 要分配的东西：一次只能给一个占用者的（独占资源，用租约记占用者），或按档分给大家的（份额资源） | 独占：桌面版、沙盒 profile、检测器的运行者。份额：DSH 宿主进程树的 CPU、派发槽位 | 租约由占用者在执行边界或脚本里取得、续租、释放；份额的大小由预算决定，预算只由人改 |
| 规则 | 在某个条件下，对某些主体，约束某一类动作，按某种方式执行，管多久，谁设的，为什么 | 人在电脑前时重活排队；21 点以后不推送；桌面版被别人占着时，驱动桌面版的调用排队 | 只有人（§2.5）；内置规则在代码里 |

派生的东西是等待单：排队的规则推迟一次调用时，harness 开一张单，记下谁、哪个调用、因为哪条规则、从何时起；条件解除时通知原来的 agent，人在面板上看得到每张单在等什么。

为什么把信号和规则分开：规则管动作，信号是条件的输入。同一个信号可以被很多规则引用，「人在电脑前」既可以触发限速，也可以触发「重活排队」。检测器只管把事实测准，不必懂规则；人写规则时也不必知道信号是怎么测的。人的原话里规则的来源有四种：人设的、自动检测的、时间表、代码里的。在这个模型里，规则本身只有两种来源，人设的与代码里的（§2.5）；「自动检测」与「时间表」是信号的来源，规则引用它们，例如「当检测到人在电脑前时」「工作日 9–18 点」。

### 2.2 一条规则的字段

| 字段 | 必填 | 含义 | 取值 |
| --- | --- | --- | --- |
| `id` | 是 | 标识，创建后不改 | `r-` 开头，小写字母、数字与连字符，至多 48 个字符；内置规则为 `builtin:<名字>` |
| `title` | 是 | 管什么，一行人话 | 1–120 个字符，一行 |
| `scope` | 是 | 存在哪一级、对哪些会话生效 | `project`（这个项目的全部会话）、`session`（一个会话）；内置规则为 `builtin`；D1 选 S3 时另有 `machine` |
| `when` | 否 | 条件；没有即总是 | 条件表达式（§2.3） |
| `onUnknown` | 否 | 条件读不出时怎么办 | `skip`（默认：不生效，同 guard 的判定器出错即放行）或 `apply`（按成立处理，适合「服务健康读不出时也别部署」这类宁严勿松的规则） |
| `subjects` | 否 | 对谁；没有即这个范围内的全部 agent | 角色、模型、会话（§2.3） |
| `action` | 否 | 约束哪一类动作；没有即 harness 查不了这条规则 | 动作匹配（§2.3） |
| `effect` | 是 | 执行方式 | `block` 拦截、`queue` 排队、`shadow` 只记录、`inform` 只告知；没有 `action` 时只能是 `inform`。限速不是规则的执行方式：它只属于内置预算规则，人改的是机器状态里预算的数字（§2.3、§7.3） |
| `params` | 按执行方式 | 排队时在调用处最多等多久 | `queue`：`{holdMs}`，0–900000，默认 0 |
| `lifetime` | 是 | 管多久 | `{kind: 'until-lifted'}`；`{kind: 'ttl', expiresAt}`；`{kind: 'until', condition}`（条件成立即失效）；`{kind: 'session'}`（`scope` 为 `session` 时，会话结束即失效） |
| `reason` | 是 | 为什么 | 1–2000 个字符 |
| `source` | 否 | 因为哪个项目图节点而存在 | 节点 id，只校验格式 |
| `origin` | 引擎写 | 谁设的 | `{actor, at, relay?, proposedBy?, question?}`：`actor` 只能是 `human`，或带人原话转述的 `llm`（`relay` 为原话，只经图上对提议待决的拍板产生，§2.5）；`proposedBy` 记提议它的会话与 agent，`question` 记那张待决（§9.4） |
| `status` | 引擎写 | 状态 | `active`、`lifted`、`expired`；agent 的提议不是规则，另存在项目状态的 `proposals` 里（`open`、`accepted`、`rejected`，§4.2、§9.4） |
| `history` | 引擎写 | 变化历史 | 每次写入一条，字段见 §4.4 |

### 2.3 harness 查得了的词汇

条件取三个值：成立、不成立、读不出。条件的主体是信号：一种通用写法比较任意一个有名字的信号，另有三种由宿主当场算出的信号（租约、时钟、阶段）用专门的写法。人加一个检测器（§5），它的信号马上就能在规则里用，不用改代码。

| 条件 | 写法 | 说明 |
| --- | --- | --- |
| 信号比较 | `{"signal": "<名字>", "is": <值>}`；`"in": [<值>…]`；`"above": <数>`；`"below": <数>`；`"known": true`（这个信号读得出） | 值的类型（布尔、数、取值表里的字符串）由定义这个信号的检测器声明，规则写入时按它校验。例：`{"signal": "presence", "is": "present"}`、`{"signal": "cpu-load", "above": 0.8}`、`{"signal": "free-memory-mib", "below": 8192}`、`{"signal": "glm-peak", "is": true}`、`{"signal": "staging-health", "is": "down"}`、`{"signal": "server-errors-5m", "above": 0}`、`{"signal": "code-freeze", "is": true}`（人手设的开关就是一个没有检测器、只有人手值的信号） |
| 租约 | `{"lease": "dsh-desktop", "held": "by-other"}`；`held` 取 `by-other`（被调用方以外的占用者占着）、`by-human`、`by-anyone`、`free` | 机器状态里的租约（§8），判定时现算 |
| 时钟 | `{"clock": {"days": [1, 2, 3, 4, 5], "from": "09:00", "to": "18:00", "tz": "+08:00"}}`；`days` 1 为周一；`from` 含、`to` 不含，`to` 早于 `from` 表示跨午夜；`tz` 为 `local` 或 `±HH:MM` | 判定时刻的系统时钟 |
| 阶段 | `{"stage": ["interview", "design"]}` | 调用方会话的焦点所在目标的有效阶段：图行服务的 `focusOf(session)` 加 `src/graph/stage.ts` 的 `goalOf`、`effectiveStage`（M3 §2.4；`stage.ts` 已在 main，`7aa8fe5`；`focusOf` 是 M3 后面的步骤）；`focusOf` 没有合入时读不出 |
| 组合 | `{"all": [...]}`、`{"any": [...]}`、`{"not": ...}` | 三值逻辑：`all` 有一项不成立即不成立，否则有一项读不出即读不出；`any` 与之对称；`not` 不改变读不出 |

信号什么时候读不出：没有值；值的来源是检测器，而检测器的检查失败、超时，或运行它的宿主心跳过期（§5.5）；检测器在影子期（这时信号照常显示，但规则按 §5.6 只记录）。读不出不等于「否」。

规则在条件成立时生效。读不出时按规则的 `onUnknown`：默认 `skip` 不生效，与 guard 的判定器抛错即放行相同（`src/guard/rules.ts` `evaluate`）；`apply` 按成立处理。面板与行健康写明「条件读不出」与原因，所以不生效也有声音。

主体（各项之间为「且」，一项里的多个值为「或」）：

| 主体 | 写法 | 读自 |
| --- | --- | --- |
| 角色 | `"roles": ["main-agent", "root", "subagent"]` | `main-agent`：设计行提供服务 `glmHournessDesign` 时用它的 `isMainAgent(agent)`（M3 §3.1.2：待生效状态或投影的 `active`，覆盖 `/wish <一句话>` 唤醒的第一步）；服务不在时退到 M3 的投影 `hournessMainAgent`：`sessionProjections.stateOf`（session-projection:122–131）读出投影值表，交给 `src/graph/main-agent.ts` 的 `mainAgentActive(values)`（main 上已有，`7aa8fe5`；值缺失或形状不对时为假），这时 `/wish` 之后的第一步可能读作不是主 Agent。M3 设计 0.4 里设计行只经 `ctx.provide` 提供行健康（M3 §4 契约表的 `ctx.provide` 一行），这个服务是规则板对 M3 的新要求：一个成员 `isMainAgent`，由先实现的一方加（§10.3）。`subagent` 取会话头 `origin: 'subagent'`（session:1051–1053，subagent:346–356）；其余为 `root`。M3 没有合入时 `main-agent` 读不出 |
| 模型 | `"models": ["glm-zcode/*", "*/deepseek-*"]` | 调用方会话最新的请求头（`src/shared/route.ts` `sessionRoute`），在 `provider/model` 上做 `*` 通配 |
| 会话 | `"sessions": ["<会话 id>"]` | `exec.agent.session.id` |

动作（每类写明 harness 在哪个边界、凭什么判断）：

| 动作 | 写法 | 判断 |
| --- | --- | --- |
| 工具 | `{"class": "tool", "names": ["plugin_manager"]}` | 调用名经 `toNativeTool` 换成 DSH 原生名后比对（split 第 2 步，`src/shared/dialect.ts`） |
| 命令文本 | `{"class": "shell", "patterns": ["^\\s*git\\s+push\\b"]}` | `pwsh`、`bash` 的 `command` 与 `terminal_send` 的 `text`（`src/guard/rules.ts` `shellCommandOf`），按不区分大小写的 JavaScript 正则匹配，只看前 8 KiB |
| 写文件 | `{"class": "file-write", "paths": ["src/payments/**"]}` | 文件工具的目标与 file-tools-only 判为写文件的 shell 命令（复用 guard 的判写与路径解析）；路径相对会话工作区，支持 `*` 与 `**` |
| 派发 | `{"class": "dispatch"}` | `subagent`、`subagent_fork`（tool-subagent:313；base 的 `cordis.patch.yml`:384、395）与 M7 的派发工具 |
| 重活 | `{"class": "heavy"}` | 命令文本命中这个项目里人声明的重活模式（§7.6） |
| 用资源 | `{"class": "resource", "resource": "dsh-desktop"}` | 命中这个资源的使用模式（§8.3） |

执行方式的强弱：`block` > `queue` > `shadow` > `inform`。可用的搭配：`queue` 配工具、命令文本、派发、重活与用资源；`block`、`shadow` 配任何按调用判断的动作；`inform` 配什么都可以，也可以没有动作。

限速为什么不进规则（评审 F9）：限速只能作用在整个 DSH 宿主进程上（§7.3），而一个宿主跑本机所有项目的会话；一个项目里写的限速规则会限住别的项目，哪个宿主读哪些项目的限速规则也说不清。所以限速只在内置规则 `builtin:budget-throttle` 里，条件固定为在场，档位取机器状态里人定的预算（D4）；人想在别的条件下限速（例如 GLM 高峰），在项目图上提一个任务扩充预算的档位，不写成项目规则。

只告知：规则没有 `action`，或人只写了一句话（「周五别发版」），就是只告知。harness 不检查它；面板标「只告知，harness 不检查」，每步提醒里标 `[inform, not checked]`。人想让它被检查，正路是在面板上给它补一个词汇里的动作；词汇不够用时，在项目图上提一个任务扩充词汇（加一种条件或动作要改代码，经设计与评审）。

### 2.4 多条规则怎样合起来

- 一次调用：收集条件成立、主体与动作都命中的规则，取最强的执行方式；同为最强的有几条时，拒绝文字全部列出，按 id 排序。
- 没有「放行」规则，任何规则都只让结果更严，所以加一条规则不会放开原来被拦的动作，规则之间不需要优先级。人「放行这一次」是等待单上的操作（§6.3），不是规则。
- 规则板的判定排在 guard、图文件门禁与 M3 写入规则之后（§6.2）：那些规则已拒绝的调用不进规则板，也不开等待单。
- 限速：只有内置的 `builtin:budget-throttle` 一条，按有效在场取「人在」或「不在」一档（§7.3），不与别的规则合并。

### 2.5 谁能写（人定 2026-10-29：「先不允许自己加规则吧，只有人能动」）

| 写入 | 人（面板与 `/rules` 命令） | agent（主 Agent、子 agent，经工具或命令行，身份 `llm`） | 检测器（身份 `detector`） | harness 代码（身份 `harness`） |
| --- | --- | --- | --- | --- |
| 增加、修改、解除、删除规则 | 可以 | 拒绝（`forbidden`） | 拒绝 | 拒绝 |
| 提议规则、解除规则、检测器或重活声明（先在图上提一张待决，成功后记进 `proposals`，不生效，§9.4） | 不需要 | 可以 | 拒绝 | 拒绝 |
| 把提议设为生效、驳回提议（在图上拍板，或在规则视图里点） | 可以；带人原话转述的 `llm` 经 `graph_decide` 拍那张待决，同样生效 | 拒绝 | 拒绝 | 只按图上人的拍板补写（§9.4） |
| 流水恢复：把没有生效的记录按记录生效、忽略（§4.5） | 可以 | 拒绝 | 拒绝 | 拒绝 |
| 检测器：增加、修改、删除、从影子转为生效 | 可以 | 拒绝 | 拒绝 | 拒绝 |
| 预算（各档的数字）、重活声明 | 可以 | 拒绝 | 拒绝 | 拒绝 |
| 信号的人手值（在场、命名开关；盖过检测器的值） | 可以 | 拒绝 | 拒绝 | 拒绝 |
| 信号的检测值 | 不需要 | 拒绝 | 只写自己那个检测器的信号 | 拒绝 |
| 租约：取得、续租、释放自己的 | 可以（占用者是人） | 可以（经执行边界或命令行，占用者是自己） | 拒绝（检测器只写自己的信号；检测器运行者的租约由宿主代码以 `harness` 取） | 可以（脚本的进程占用者；宿主代码以占用者 `host` 取检测器运行者租约，§5.5） |
| 租约：强行收回别人的 | 可以 | 拒绝 | 拒绝 | 只在证明占用者已死时（§8.2） |
| 等待单：开、关、保留、过期 | 不需要 | 拒绝 | 拒绝 | 可以 |
| 等待单：放行这一次、取消 | 可以 | 拒绝 | 拒绝 | 拒绝 |

- 转述（评审 F10）：规则板没有写规则的工具，命令行的身份固定为 `llm`，所以转述只有一条路：人在对话里说「把 r-x 解除」，agent 调 `rules_propose`（`kind: 'lift'`，`body: {id: 'r-x'}`）得到提议与图上的待决，再调 `graph_decide` 拍这张待决、带 `relay`（人的原话，逐字，至多 2000 字符）。图引擎按人的权限接受这次拍板（`docs/ORCHESTRATION.md` §2.9.1），规则板按 §9.4 以人的身份执行，原话写进规则的历史与 `origin.relay`，面板显示为「你在对话里说」。增、改规则同理（`kind: 'rule'`）。宪章 §2 规定在图上操作与在对话里告诉主 Agent 等价；引擎核不了原话的真假，转错的代价是人在面板上再改一次。这一条由 agent 定、人可推翻（§18）。图不可用时没有转述，人在面板或用 `/rules` 操作。
- 身份由入口决定，不从请求里读（同项目图，`docs/ORCHESTRATION.md` §2.7）：面板命令 `/rules-apply` 与人敲的 `/rules` 一律为 `human`，斜杠命令只有人能发、模型发不出（同 §2.10）；agent 的工具与命令行固定为 `llm`；检测器的运行器（§5.5）固定为 `detector`，而且只接受「把检测器 X 的信号设为 v」这一种写入，X 是这次运行的检测器；宿主代码固定为 `harness`。命令检查的子进程拿不到任何写入口：它只把值写到自己的标准输出，由运行器解析后写入。
- 引擎强制：`apply(actor, mutation)` 是唯一的写入口（§4.4），检查顺序的第一步就是按上表核对身份与操作，再做修订号与校验；被拒的请求不写任何文件。
- 文件门禁：规则文件在用户级目录里（§4.1），guard 的工作区圈禁本来就拒绝文件工具写工作区外，file-tools-only 拒绝 shell 写文件；但 G3 之后 guard 的圈禁根可以由配置改，shell 的判写也有看不见的写法（`docs/ORCHESTRATION.md` §6.5.1）。所以规则行另带一条内置拦截规则 `builtin:rules-files-only`：文件工具与 file-tools-only 判为写文件的 shell 命令，目标在规则目录（`<userHome>/rules/`）之下一律拒绝，正路是 `rules_propose` 或告诉人。做法同图文件门禁（`src/guard/graph-files.ts`），由规则行注册，跟规则行启停。读不拦。看不见的 shell 写法（.NET 调用、`cmd /c`、`node -e`）仍可能写进去，最可能的是往流水末尾追加一行。引擎重放流水时逐条核对：每条记录带写后状态的摘要，引擎用写入时同一个状态转换与同一个确定的序列化重算，对不上的记录不生效（§4.4、§4.5）。所以三种情形各有一个说法，§4.5 与面板、行健康用同样的字：「快照没跟上，已补上」（改名失败的正常降级，只记信息）；「快照被引擎以外的写入改过，已按流水重建」；「流水第 N 条不是引擎写的，没有生效，请核对」。这一层防的是看不见的一行追加与误改，不防有意的伪造：会照着算摘要的写入者仍能写出能通过核对的记录；那样的写法要先绕过 file-tools-only 与 `builtin:rules-files-only`，它的命令文本留在会话日志里，事后查得到是哪个会话做的（§7.5）。
- 以后放开时要改的地方（人说的是「先」）：上表 agent 一栏改为允许「只收紧」的写入；`apply` 的身份核对之后加一个判定「这次写入是否只收紧」。按 §2.4，增加任何一条非 `inform` 规则、提高执行方式、延长期限、让条件更常成立、扩大主体与动作都是收紧；解除、降低、缩短与反过来的改动是放宽。代码改动：`src/rules/permissions.ts` 的权限表与新判定函数；两个新工具 `rules_add`、`rules_lift`（只能解除 agent 自己设的）；面板「规则」视图加「agent 设的」一组；L2 用例覆盖每种收紧与放宽；本节整节重写。存储格式不用改：规则的 `origin.actor` 已经是 `human` 与 `llm` 的联合，今天的校验拒绝 `llm` 不带 `relay` 出现，放开时只改校验。检测器同理：让 agent 自己加检测器只会多出信号，不改变任何判定，但检测器会在宿主里定时运行命令，放开它要单独决定。

### 2.6 用这套概念写已有规则与几条无关的例子

| 规则 | 条件 | 主体 | 动作 | 执行 | 来源 | 在哪实现 |
| --- | --- | --- | --- | --- | --- | --- |
| 工作区圈禁 | 总是 | 全部 agent、全部模型（G3） | 写文件，目标在工作区外 | 拦截 | 代码 | guard 行，不搬 |
| 文件只用专用工具改 | 总是 | 同上 | shell 写文件 | 拦截；影子兜底只记录 | 代码 | guard 行，不搬 |
| 图文件只经图工具改 | 总是 | 同上 | 写文件，目标在 `docs/graph` 下 | 拦截 | 代码 | 图行，不搬 |
| 主 Agent 不写文件（M3） | 会话是主 Agent | 主 Agent | 写文件 | 工具面里去掉写文件的工具，shell 写入拦截（`question-26` 选 C） | 代码 | 设计行，不搬 |
| 设计期只读（M3） | 主 Agent 焦点目标的阶段在 `release` 之前 | 派发链的根是主 Agent 的各层子 agent | 写文件 | 拦截 | 代码 | 设计行，不搬 |
| GLM 高峰 | `glm-peak is true` | GLM 路由 | 无 | 只告知 | 代码 | GLM 包的高峰提醒，不搬；规则板显示这个信号 |
| 一次只跑一个探针或标定 | 租约 `dsh-profile:<名字>` 被别人占着 | 全部，含 Kiro（经脚本） | 用资源 | 排队；脚本里退出码 3 或等待 | 代码 | 收进规则板：内置资源加脚本（§6.6） |
| 桌面版正在被人用 | 租约 `dsh-desktop` 被别人占着 | 全部 | 用资源（重启脚本、DevTools 协议脚本、`plugin_manager`） | 排队 | 租约由人设；检测器的判断先影子 | 收进规则板（§8.3） |
| 模型选择器的提醒（`docs/HANDOFF.md` §6） | 持有 `dsh-desktop` 租约 | 持有者 | 无 | 只告知，取得与释放租约时显示 | 代码 | 收进规则板，附在资源上 |
| 人在电脑前的预算 | `presence is present` | 全部 | 宿主进程树；重活；派发 | 限速；排队；排队（槽位） | 代码（内置规则），各档的数字由人定 | 收进规则板（§7） |
| 21 点以后不推送（例） | `not clock 09:00–21:00` | 全部 | 命令文本 `^\s*git\s+push\b` | 拦截 | 人 | 项目规则 |
| 不碰生产机（例） | 总是 | 全部 | 命令文本 `\b(ssh\|scp\|rsync)\b.*\bprod-db-01\b` | 拦截 | 人 | 项目规则；按文本匹配，换个写法就看不见（§7.5），面板注明 |
| 代码冻结期间不改支付模块（例） | `code-freeze is true`（人手开关） | 全部 | 写文件 `src/payments/**` | 拦截 | 人 | 项目规则 |
| 访谈与设计阶段子 agent 不跑重活（例） | `stage in [interview, design]` | 子 agent | 重活 | 排队 | 人 | 项目规则 |
| 机器负载过高时不再派发（例） | `cpu-load above 0.9`（内置检测器） | 主 Agent | 派发 | 排队 | 人 | 项目规则 |
| 后台有错误日志时先别部署（例） | `server-errors-5m above 0`（人加的日志检测器，盯 `logs/server.log` 里的 `ERROR`） | 全部 | 命令文本 `npm\s+run\s+deploy` | 排队；`onUnknown: apply` | 人 | 项目规则 |
| 预发服务挂了时提醒 agent（例） | `staging-health is down`（人加的 HTTP 检测器） | 全部 | 无 | 只告知 | 人 | 项目规则；只往提醒里加一行，像 agent 型 hook |
| 周五别发版（例，只有文字） | 无 | 全部 | 无 | 只告知 | 人 | 项目规则，标「只告知」 |

## 3. 范围（待人定 D1）

人问「范围会不会太大了点？要不改成单项目的？」。三种做法，推荐项在最后：

| 方案 | 机器一级 | 项目一级 | 好处 | 代价 |
| --- | --- | --- | --- | --- |
| S3 机器一级的规则库 | 信号、资源、全部规则（规则带项目匹配） | 无 | 一处看全；跨项目的规则只写一次 | 为一个项目写的规则可能误伤另一个；规则不随项目走；正是人担心的「范围太大」 |
| S2 全部按项目 | 无 | 信号、资源、规则 | 最小，与项目图一样按工作区 | 桌面版、沙盒 profile 与「人在电脑前」本来一台机器只有一份：两个项目会同时驱动桌面版，这正是租约要防的；在场要在每个项目里各设一次；DSH 宿主是一个进程，跑所有项目的会话，CPU 上限只能按宿主设，不能按项目分，于是预算只剩按项目的排队 |
| S1 信号与资源在机器一级，规则按项目（推荐） | 机器的信号与检测器（在场、负载、GLM 高峰）、租约、预算（各档的数字）、等待单、宿主登记 | 规则、项目的信号与检测器（开关、错误日志、服务健康）、重活声明、重活的学习结果 | 规则是单个项目的，与人的提议一致；只有物理上只有一份的东西共享，租约与预算在项目之间生效 | 多一份机器一级的状态，要处理它的并发与恢复（§4）；人要在每个项目里各写各的规则（内置规则在所有项目里相同） |

S1 也可以分两步上线：§16 的 R1–R4 先交付项目规则与内置规则，机器一级的状态从 R5（租约）开始。人想先只要单项目，就在 R4 之后停下看一段时间再决定。

S1 下各样东西的位置：

| 东西 | 级别 | 理由 |
| --- | --- | --- |
| 在场、机器负载、GLM 高峰等机器信号与它们的检测器 | 机器 | 人只有一个，电脑只有一台，套餐跟账号走 |
| 项目自己的检测器（这个项目的日志、这个项目的预发服务）与人手开关 | 项目 | 只对这个项目有意义 |
| 租约（`dsh-desktop`、`dsh-profile:<名字>`、`detector-runner:*`） | 机器 | 资源一台机器一份 |
| 预算（人在与不在两档的数字） | 机器 | 限速作用于整个 DSH 宿主进程，跨项目 |
| 等待单 | 机器 | 一张单可能在等另一个项目占着的资源；排队要跨进程按先后 |
| 宿主登记（每个宿主进程的 pid、启动时间、心跳、当前档位） | 机器 | 判断占用者死活 |
| 规则、重活声明、学习结果 | 项目 | 人提议的范围 |
| 会话规则 | 项目状态里，`scope: session` | 生命随会话 |
| 内置规则 | 代码 | 随编排层包，对所有项目相同 |

## 4. 存储与并发

### 4.1 文件

```
<userHome>/rules/                     userHome = glmHournessData.userHome，默认 C:\Users\29596\.dsh\glm-hourness
  machine.json                        机器状态的快照（由流水推出的缓存）
  .machine.json.pending               改名失败时留下的新快照（§4.4 第 7 步），下一次读取采用后消失
  machine.journal.jsonl               机器状态的流水（事实源，只追加）
  machine.lock                        写锁
  hosts/<pid>-<启动毫秒>.json          每个宿主进程的心跳与它在运行的检测器（只有它自己写，不进流水，§5.5）
  helper-<sha8>.ps1                   辅助进程脚本的正文（§7.4），按内容摘要命名；每次启动前核对，执行时由引导再核对一次
  projects/<key>/
    project.json                      项目键对应的工作区根（显示用）
    rules.json                        项目状态的快照：规则、提议、项目的检测器与信号、重活声明
    .rules.json.pending               同 .machine.json.pending
    journal.jsonl                     项目状态的流水
    rules.lock                        写锁
    heavy-stats.json                  重活的学习结果（§7.6，只是统计，不是规则）
    hits.json                         每条规则最近 7 天每天的命中次数（各宿主至多每分钟在锁内合并一次，不进流水）
```

用户级目录只从数据目录服务取（`docs/DESIGN.md` §2.4：没有数据行就不写用户级数据）。命令行与脚本不在 DSH 里，用同一个解析函数 `userDataHome()`（`src/shared/data-home.ts`，显式配置 > `$DSH_HOME` > `~/.dsh`），所以与宿主落在同一处。探针的每个场景把数据目录行指向场景自己的目录（`docs/DEVELOPMENT.md` §3），场景里的规则板与真实的互不影响。

项目规则放在哪，三种做法（推荐项在最后）：

1. 工作区里的 `.llm/rules/`：随项目，人在资源管理器里看得到。代价是往别的项目的工作树里写目录，那些项目不一定忽略 `.llm/`（`docs/CHARTER.md` §7.1 条款 10）。
2. 仓库里入库，例如 `docs/rules/`：可以评审、随 git 走。代价是「今晚别推送」这类运行时开关会频繁改已跟踪文件，给 git 历史添噪声。
3. 用户级目录按项目分（推荐，本设计采用）：不碰任何项目的工作树；面板按绝对路径读（§9.2）。代价是项目搬家后规则留在旧的键下，`project.json` 记着原路径，面板据此提示。

### 4.2 结构

```ts
// src/rules/model.ts：纯类型与校验，不用 Node 内置模块（客户端也导入，先例 src/graph/parse.ts）
/** 规则的执行方式；限速只属于内置预算规则，不在这里（§2.3） */
export type Effect = 'block' | 'queue' | 'shadow' | 'inform'
export type RulesActor = 'human' | 'llm' | 'harness' | 'detector'
export type Presence = 'present' | 'away'

export interface Rule {
  readonly id: string
  readonly title: string
  readonly scope: 'project' | 'session'
  readonly sessionId?: string                 // scope 为 session 时必填
  readonly when?: Condition
  readonly onUnknown?: 'skip' | 'apply'
  readonly subjects?: SubjectMatcher
  readonly action?: ActionMatcher
  readonly effect: Effect
  readonly params?: { readonly holdMs?: number }
  readonly lifetime: { readonly kind: 'until-lifted' } | { readonly kind: 'ttl', readonly expiresAt: string } | { readonly kind: 'until', readonly condition: Condition } | { readonly kind: 'session' }
  readonly reason: string
  readonly source?: string
  readonly origin: { readonly actor: 'human' | 'llm', readonly at: string, readonly relay?: string, readonly proposedBy?: { readonly sessionId: string, readonly agentId: string }, readonly question?: string }
  readonly status: 'active' | 'lifted' | 'expired'          // 提议另存在 proposals 里
}

export interface Lease {
  readonly resource: string
  readonly holder: Holder
  readonly purpose: string
  readonly acquiredAt: string
  readonly renewedAt: string
  readonly expiresAt: string
  readonly bootAt: string                     // 取得时的开机时刻（§4.6）
  readonly ticket?: string                    // 由哪张等待单的保留转来
  readonly tokenDigest?: string               // 外部与进程占用者：取得时返回的随机 token 的 SHA-256 前 16 位（§8.1）
}

export type Holder =
  | { readonly kind: 'human', readonly label: string }
  | { readonly kind: 'session', readonly sessionId: string, readonly host: HostId, readonly project?: string, readonly label: string }
  | { readonly kind: 'process', readonly pid: number, readonly startedAt?: string, readonly label: string }
  | { readonly kind: 'external', readonly label: string }
  /** 宿主进程本身（检测器运行者，§5.5）：死活按心跳文件，§8.2「宿主」一行 */
  | { readonly kind: 'host', readonly host: HostId, readonly label: string }

/** 一个宿主进程：pid 加进程启动时刻（毫秒），防 pid 复用 */
export interface HostId { readonly pid: number, readonly startedAt: number }

export interface Ticket {
  readonly id: string                         // q-<序号>，机器范围内唯一
  readonly state: 'deferred' | 'held' | 'reserved' | 'cleared' | 'done' | 'cancelled' | 'expired'
  readonly rules: readonly string[]           // 推迟它的规则 id
  readonly resource?: string
  readonly project?: string
  readonly sessionId: string
  readonly agentLabel: string
  readonly host: HostId
  readonly signature: string                  // 原生工具名加规范化参数的 SHA-256 前 12 位十六进制
  readonly tool: string
  readonly summary: string                    // 命令或参数的前 160 个字符
  readonly since: string
  readonly reservedUntil?: string
  readonly letOnceUntil?: string              // 人「放行这一次」的有效期
  readonly closedAt?: string                  // 进入 done、cancelled、expired 的时刻（清理用，§4.4）
  readonly nested?: true                      // 开单的是 run_code 程序里的子调用（§6.2 第 1 步），唤醒文字随之改写
  /** 原来的子 agent 会话结束后，单转给派发链的根（§6.3）；sessionId 与 agentLabel 随之改为根的 */
  readonly handedFrom?: { readonly sessionId: string, readonly agentLabel: string, readonly focus?: string, readonly at: string }
}

/** 重放时没有生效的流水行（§4.5），人按记录生效或忽略之前一直列着 */
export interface SkippedRecord {
  /** 这一行原始字节的 SHA-256 前 12 位十六进制；也是它在 unresolved 里的键。按内容取，流水轮换改名之后不变，同样的行每次重放得到同一个键 */
  readonly key: string
  readonly seq?: number                       // 这一行能解析时它自己写的序号
  readonly afterSeq: number                   // 它之前最后一条生效记录的序号（显示「第 N 条之后」用）
  readonly why: 'digest-mismatch' | 'after-unreadable' | 'unreadable'
  readonly actor?: string
  readonly op?: string
  readonly target?: string
}

/** 状态的一处改动：整条替换或删除一个顶层字段或集合里的一项（§4.4） */
export interface Change {
  /** 一层：['budgets']、['nextTicket']、['bootAt']、['recovered']、['heavy']；两层：['leases', <资源>]、['tickets', <单号>]、['hosts', <宿主键>]、['signals', <名字>]、['detectors', <id>]、['rules', <id>]、['proposals', <id>]、['unresolved', <键>] */
  readonly path: readonly [string] | readonly [string, string]
  readonly value?: unknown                    // 没有即删除
  readonly cause?: 'prune'                    // 写入时顺带的清理（§4.4 第 5 步）
}

/** 流水的一条记录（字段的人话说明见 §4.4 的表） */
export interface JournalRecord {
  readonly seq: number
  readonly at: string
  readonly actor: RulesActor
  readonly op: string
  readonly target?: string
  readonly from?: unknown
  readonly to?: unknown
  readonly reason?: string
  readonly relay?: string
  readonly evidence?: string
  /** 这次写入对状态的全部改动，按顺序；重放只照它执行 */
  readonly changes: readonly Change[]
  /** applyRecord(写入前的状态, 这条记录) 的 stateDigest */
  readonly snapshot: string
  /** 只在 base 与 recovered：写后的完整状态，链断开之后作锚点 */
  readonly state?: MachineState | ProjectState
}

export interface MachineState {
  readonly version: 1
  readonly seq: number                        // 流水的最后一条
  readonly bootAt: string
  readonly signals: Readonly<Record<string, SignalState>>
  readonly detectors: Readonly<Record<string, Detector>>
  readonly budgets: { readonly present: Budget, readonly away: Budget }
  readonly leases: Readonly<Record<string, Lease>>
  readonly tickets: Readonly<Record<string, Ticket>>       // 按单号；面板按 since 排序
  /** 每个宿主进程的档位，只在档位、手段或读回的结果变化时写；心跳在 hosts/ 下的文件里 */
  readonly hosts: Readonly<Record<string, HostBudgetState>>
  readonly nextTicket: number
  readonly recovered?: { readonly at: string, readonly reason: RecoveryReason, readonly lost: boolean }
  readonly unresolved: Readonly<Record<string, SkippedRecord>>   // 没有生效、人还没处理的流水行，键为 SkippedRecord.key
}

export type RecoveryReason = 'snapshot-behind' | 'snapshot-corrupt' | 'snapshot-modified' | 'journal-tail' | 'journal-unreadable' | 'journal-not-engine'

export interface HostBudgetState {
  readonly host: HostId
  readonly level: 'present' | 'away'
  readonly mechanism: 'job' | 'priority' | 'none'
  /** job 一级：job 名、收进的时刻、句柄是否已复制进宿主（§7.4 attach） */
  readonly job?: { readonly name: string, readonly attachedAt: string, readonly dupInHost: boolean }
  /** 读回的结果：宿主的优先级类、job 的亲和性处理器数（没有限制时为 n）、job 里已降优先级的后代数、规则行激活之前派生、不在 job 里的后代数 */
  readonly readback?: { readonly hostPriority: 'normal' | 'below-normal' | 'idle' | 'other', readonly processors: number, readonly lowered: number, readonly outside: number, readonly at: string }
  /** job 一级、人在时被降了优先级的 job 外后代（§7.3，评审 F27）：恢复时按 pid 加启动时刻核对身份，回到 prior；名单的主人是宿主进程，辅助进程重启不丢，这里是它的留痕 */
  readonly outsideLowered?: readonly { readonly pid: number, readonly startedAt: number, readonly prior: 'normal' | 'above-normal' | 'high' }[]
  /** 人走开之后没能恢复的 job 外后代数（进程拒绝访问等）；大于 0 时行健康 degraded */
  readonly outsideNotRestored?: number
  /** 档位没有落实时的原因（行健康 degraded 的同一句话） */
  readonly degraded?: string
  readonly at: string
}

export type SignalValue = boolean | number | string

/** 一个信号：检测值与人手值分开存，有效值按 §5.1 现算 */
export interface SignalState {
  readonly type: { readonly kind: 'boolean' } | { readonly kind: 'number', readonly unit?: string } | { readonly kind: 'enum', readonly values: readonly string[] }
  readonly detected?: { readonly value: SignalValue, readonly since: string, readonly detector: string, readonly evidence?: string }
  readonly detectorError?: { readonly at: string, readonly message: string }
  readonly manual?: { readonly value: SignalValue, readonly at: string, readonly expiresAt?: string, readonly relay?: string }
}

/** 检测器：触发加检查，只写一个信号（§5.2） */
export interface Detector {
  readonly id: string                         // 内置为 builtin:<名字>，人加的为 d-<slug>
  readonly signal: string                     // 写哪个信号，名字在机器与项目两级之间不重复
  readonly trigger: Trigger
  readonly check: Check
  readonly ttlMs: number                      // 值多久不更新就读作未知
  readonly mode: 'shadow' | 'enforce'
  readonly origin: { readonly actor: 'human' | 'llm', readonly at: string, readonly relay?: string, readonly proposedBy?: { readonly sessionId: string, readonly agentId: string } } | { readonly actor: 'builtin' }
  readonly status: 'active' | 'removed'                     // 提议另存在 proposals 里
}

export type Trigger =
  | { readonly kind: 'interval', readonly everyMs: number }                         // 内置检查至少 5 秒，命令检查至少 60 秒
  | { readonly kind: 'schedule', readonly at: readonly string[], readonly days?: readonly number[], readonly tz: string }  // 每天的 HH:MM
  | { readonly kind: 'file', readonly path: string }                                // 文件变化，另每 30 秒查一次大小与修改时间
  | { readonly kind: 'process', readonly names: readonly string[] }                // 进程起停，由辅助进程每 15 秒查一次
  | { readonly kind: 'host-event', readonly events: readonly ('session-created' | 'session-disposed' | 'tool-error')[] }

export type Check =
  | { readonly kind: 'builtin', readonly name: 'presence' | 'desktop-foreground' | 'glm-peak' | 'cpu-load' | 'free-memory' | 'disk-free' | 'process-running' }
  | { readonly kind: 'log-match', readonly path: string, readonly pattern: string, readonly windowMs: number }
  | { readonly kind: 'http', readonly url: string, readonly timeoutMs: number, readonly expectStatus?: readonly number[] }
  | { readonly kind: 'command', readonly argv: readonly string[], readonly cwd?: string, readonly timeoutMs: number }

export interface Budget {
  readonly priority: 'normal' | 'below-normal' | 'idle'
  /** 没有即不设 CPU 上限；有时上限为 k = max(1, ceil(n * cpuPercent / 100)) 个逻辑处理器（§7.3） */
  readonly cpuPercent?: number
  readonly heavy: 'run' | 'queue'
  readonly dispatchSlots: number              // 本宿主同时在跑的子 agent 上限
}

export interface ProjectState {
  readonly version: 1
  readonly seq: number
  readonly root: string
  readonly rules: Readonly<Record<string, Rule>>             // 按 id；含提议与已失效的，面板按状态分组
  readonly signals: Readonly<Record<string, SignalState>>    // 项目的信号，含人手开关
  readonly detectors: Readonly<Record<string, Detector>>
  readonly heavy: { readonly patterns: readonly string[] }
  readonly proposals: Readonly<Record<string, Proposal>>
  readonly recovered?: { readonly at: string, readonly reason: RecoveryReason, readonly lost: boolean }
  readonly unresolved: Readonly<Record<string, SkippedRecord>>
}
```

集合一律按 id 存成对象，而不是数组：`canonicalJson` 按键排序，同一份内容只有一种写法；一处改动（`Change`）按 id 整条替换或删除一项，不依赖数组下标。

agent 的提议单独存（评审 F23）：`ProjectState` 另有 `proposals: Readonly<Record<string, Proposal>>`，`rules` 与 `detectors` 里只有人设的条目，所以 `Rule.status` 只取 `active`、`lifted`、`expired`，`Detector.status` 只取 `active`、`removed`；人拍 `set` 之后引擎按提议写出规则、检测器、重活声明或解除，提议转 `accepted`。

```ts
export interface Proposal {
  readonly id: string                         // p-<8 位十六进制>，由 rules_propose 在提待决之前分配
  readonly kind: 'rule' | 'lift' | 'detector' | 'heavy'
  readonly body: unknown                      // rule-set、detector-set、heavy-set 的内容，lift 时为 {id}
  readonly summary: string                    // 待决的题目
  readonly reason: string
  readonly ifSet: string                      // 「设」这一项的效果，一行
  readonly ifSkip: string                     // 「不设」这一项的效果，一行
  readonly why: string                        // 为什么推荐「设」，一行
  readonly counter?: string
  readonly question?: string                  // 图上那张待决的 id（§9.4：先提待决，成功才记提议）；图不可用时没有，人在规则视图里点
  readonly proposedBy: { readonly sessionId: string, readonly agentId: string }
  readonly at: string
  readonly status: 'open' | 'accepted' | 'rejected'
  readonly decidedBy?: { readonly actor: 'human' | 'llm', readonly relay?: string, readonly at: string }
}
```

条件、主体与动作的类型按 §2.3 的表逐项写成联合类型，在同一个文件里。确定的序列化 `canonicalJson(state)` 也在这个文件里（纯函数）：按键名的码点顺序排列对象的键、数组保持原序、不留空白、字符串按 `JSON.stringify` 转义；摘要 `stateDigest(state)` 在 `src/rules/store.ts`（用 `node:crypto`），是 `canonicalJson` 的 UTF-8 字节的 SHA-256 前 16 位十六进制。

状态转换只有一个函数（评审 F20）：`applyRecord(state, record)`（`src/rules/store.ts`，纯函数，不读时钟、文件系统与环境）。它按顺序执行 `record.changes`：一层路径整体替换或删除那个顶层字段，两层路径整条替换或删除集合里的一项；最后把 `seq` 设为 `record.seq`；路径不在 `Change` 注释列出的范围内就抛错（重放把这条记录判为 `digest-mismatch`）。它不看 `op`、`from`、`to`，那几个字段只给人看、给 `recovery-accept` 显示。写入（§4.4）、重放（§4.5）与 `recovery-accept` 都只经它改状态；写快照、写记录的 `snapshot` 与重放核对都用 `canonicalJson` 与 `stateDigest`（评审 F4）。内置规则不进文件，在 `src/rules/builtin.ts` 里：`builtin:lease`（用资源且租约被别人占着即排队）、`builtin:budget-throttle`、`builtin:budget-heavy`、`builtin:budget-dispatch`（三条的条件都是 `presence is present`，参数取 `budgets.present`；人走开时取 `budgets.away`）、`builtin:rules-files-only`；另有只用来在面板上列出的代码规则目录（§10.1）。

### 4.3 项目键

项目键取会话头的 `cwd`（session:1820–1826）：从它往上找 `.git`；是目录，仓库根就是它的父目录；是文件（git 工作树），读其中的 `gitdir:` 指向 `<公共目录>/worktrees/<名字>`，再读那里的 `commondir` 得到公共目录，仓库根是公共目录的父目录。找不到 `.git` 就用 `cwd` 本身。键为 `<根目录名>-<规整后的根路径（小写、正斜杠）的 SHA-256 前 8 位>`。只读文件，不起 git 进程。结果按 `cwd` 缓存在内存里。

这样主检出与它的工作树（例如 `.worktrees/split`）是同一个项目；委派子会话的会话头 `cwd` 就是父会话的目录（subagent:346–355，`docs/ORCHESTRATION.md` §3.2 的 L3 实测），也落在父会话的项目里。会话没有 `cwd` 时没有项目：只有内置规则与会话规则对它生效，后者存在机器状态之外的内存里（会话没有工作区，规则也不落盘），行健康写明。

### 4.4 写入

写只有一个入口：`openRulesBoard({userHome, project?}).apply(actor, mutation)`（`src/rules/engine.ts`）。命令、工具、命令行、检测器与宿主代码都经它写。一次写入：

1. 校验请求结构（§12）；只看身份就能拒的先拒（§2.5 的表），错误码 `forbidden`，带 `hint`：人怎样做这件事。
2. 取写锁：以 `wx` 创建 `<文件>.lock`，内容 `{pid, startedAt, at, token}`（`token` 是这次写入的随机串）。已存在时读它：持有者的 pid 不在，或锁已存在超过 10 秒（临界区只有几十毫秒），就删掉重取；否则每 25 毫秒重试，2 秒内取不到返回 `busy`。做法照 DSH 的 `withFileLock`（atomic-write:189–219，split 附录 G10 已核对），在 `src/rules/lock.ts` 里重写并注明出处：运行时包不能从本仓库解析（`docs/DESIGN.md` §2.4 的同一个理由）。
3. 读最新状态（§4.5；要恢复时在这把锁内先恢复），核对请求里的修订号 `rev` 等于当前的 `seq`（读、提议与检测器的写入不带 `rev`，按当前状态做）；不等返回 `stale_revision`。
4. 规划（评审 F20）：这个操作的规划函数（`src/rules/plan.ts`，每个 `op` 一个）按当前状态、请求与时钟算出这次写入的全部改动 `changes`：目标本身的改动，以及它带出的每一处改动，例如新分配的单号与 `nextTicket`、释放租约时给排在最前的单的保留（`reservedUntil` 按此刻的时钟算好写进去）、开机时刻变化时失效的租约。按节点判断的权限也在这里（例如人收回一个租约时，那个租约还在），不合返回 `forbidden` 或 `conflict`。规划函数可以读时钟（写入时刻都写成值放进改动），`applyRecord` 不读。
5. 清理（评审 F15、F20）：机器状态里进入 `done`、`cancelled`、`expired` 超过 24 小时的等待单，以及 `at` 早于 1 小时之前、心跳文件已不在、也不再是任何租约或等待单拥有者的宿主条目，写成 `changes` 末尾带 `cause: 'prune'` 的删除。删不删只在这一步、按此刻的时钟与 `hosts/` 目录决定，决定的结果写进记录；重放只照记录删，不再看时钟与心跳文件。被删的条目的全文留在更早的流水记录里。
6. 组记录：`seq` 取流水里能解析的最大序号加一（通常就是 `state.seq + 1`；引擎以外追加的行带了更大的序号时跳过它）；`next = applyRecord(current, record)`；整份校验 `next`，不合法返回 `invalid`，不写任何文件；`record.snapshot = stateDigest(next)`。
7. 再读一次锁文件，`token` 不是自己的（卡住太久、锁被接手）就放弃并返回 `busy`。然后先追加这条记录并 `fsync`，再把 `canonicalJson(next)` 写到同目录的 `.<文件>.<随机串>.tmp`、`fsync`、改名覆盖快照。Windows 上改名遇到 `EPERM`、`EBUSY`（读者正开着文件）时按 20、40、80、160、320 毫秒重试 5 次；仍失败就把临时文件改名为固定的 `.<文件>.pending`（覆盖旧的 pending），这一步也失败就保留临时文件、在本进程内存里记下它的路径。旧快照留着，流水已经写下，下一次读取按 §4.5 采用 pending 或补上，不报「被改过」。
8. 释放锁。

写入路径与重放路径得到同一个状态，是因为两边都只经 `applyRecord`，而 `applyRecord` 的输入只有写入前的状态与这条记录；凡是依赖时钟、文件系统或进程表的决定（清理、单号、保留期限、回收的证据）都在第 4、5 步做完并写进 `changes`。L2 的性质测试钉住这一点（§15 R2）。

流水的每一条：

| 字段 | 内容 |
| --- | --- |
| `seq` | 序号，从 1 起，引擎写的记录逐条加一（第 6 步） |
| `at` | ISO 8601 UTC |
| `actor` | `human`、`llm`、`harness`、`detector` |
| `op` | 操作名（§9.3 的表） |
| `target` | 规则 id、租约的资源、等待单 id、信号名 |
| `from`、`to` | 改动前后（规则写全条，信号与租约写值）；给人看，重放不用 |
| `reason` | 理由；人的操作由入口生成（「人在面板上点了『我在用电脑』」） |
| `relay` | 转述的原话 |
| `evidence` | 判断的依据：检测器写空闲毫秒数与前台进程名，收回租约写「pid 12345 不在」，过期写到期时刻 |
| `changes` | 这次写入对状态的全部改动（`Change`，§4.2），含带出的改动与带 `cause: 'prune'` 的清理；重放只照它执行 |
| `snapshot` | `stateDigest(applyRecord(写入前的状态, 这条记录))`，重放时逐条核对（§4.5） |
| `state` | 只在 `base`（流水轮换，§4.7）与 `recovered`（恢复之后）两种记录里：写后的完整状态，链断开之后作重放的锚点。`base` 的 `changes` 为空；`recovered` 的 `changes` 是设 `recovered` 与给这次没有生效的每一行加一条 `unresolved`，所以链没断时它们和别的记录一样核对，不用特殊处理 |

快照与流水的关系同 `graph.svg` 与节点文件：流水是事实源，快照由它推出，只为读得快（`docs/CHARTER.md` §7.1 条款 11：一处动作只记一个事实源）。

### 4.5 读与恢复

读不取锁。快照有效的条件：能解析，`version` 为 1，流水里有序号等于快照 `seq` 的记录，且 `stateDigest(快照)` 等于那条记录的 `snapshot`。快照有效、且它的 `seq` 就是流水最后一条完整记录的 `seq` 时直接用。宿主进程在内存里留一份，每次判定前 `stat` 两个文件，修改时间与大小都没变就用内存里的。

其余情形先排除读写竞争（评审 F7）：读者不取锁时，可能在写入者追加流水与改名快照之间读到两边不一致。所以读者看到不一致时取写锁，在锁内重新读两个文件、重新校验；这时一致就直接用，不算恢复，不写记录。仍不一致才按下面的重放处理，同样在锁内。

重放（评审 F4、F20）只经 `applyRecord`，不读时钟、文件系统与进程表，所以同一份流水从同一个起点重放，每次得到同一个状态与同一组不生效的行：

1. 起点：有效的快照，从它的 `seq` 之后接着读（这条记录可能在轮换改名的旧文件里，按文件名里的序号接到当前文件）；快照无效时取最新一个流水文件第一条 `base` 的 `state`（§4.7），没有 `base` 时从空状态与最早一个流水文件的第一行开始。另有这次重放的跳过表，起初为空。
2. 逐行读。一行解析不了，或缺 `seq`、`changes`、`snapshot` 之一：记为 `unreadable`，进跳过表，核对链从这里断开。
3. 链没断时，每条记录一律同样核对，`base` 与 `recovered` 也不例外：`candidate = applyRecord(state, record)`，`stateDigest(candidate)` 等于 `record.snapshot` 就生效（`state = candidate`）；不等，或 `applyRecord` 抛错，就不生效（`digest-mismatch`，进跳过表），`state` 不变，记录留在流水里。
   - `base` 的 `changes` 为空，所以它只在当前状态确实就是轮换时的状态时通过。
   - `recovered` 的 `changes` 是设 `recovered` 与登记几条 `unresolved`。上一次恢复时跳过的那几行，这一次重放走到同一处时同样被跳过（摘要依旧对不上，或依旧在同一处坏行之后），当前状态与那次恢复之前的状态相同，所以 `applyRecord` 之后正好等于那次写下的状态，摘要对得上。
   - 链没断时 `state` 字段不参与核对，所以不能靠追加一条带任意 `state` 的 `recovered` 改写状态。
4. 一条 `recovered` 生效时，把它的 `changes` 登记过的 `unresolved` 键从跳过表里去掉：那几行上一次已经报给人，这次不再报一遍。
5. 链断开之后：`base` 与 `recovered` 记录在 `stateDigest(record.state)` 等于它的 `snapshot` 时作新的锚点（`state = record.state`），链重新接上，同样按第 4 步去掉它登记过的键；其余记录不生效（`after-unreadable`，进跳过表）。不应用核对不了的记录，是因为这样的记录里可能有伪造的放宽（解除规则、收回租约），而不应用的代价可逆：租约过期或按死活回收，等待单重开，规则的改动由人在恢复一节里点「按记录生效」补上。
6. 结束：跳过表不空、快照被替换（损坏或被改过）或流水末尾被截掉一行时，在这把锁内按 §4.4 写一条 `recovered`：`changes` 是 `['recovered']`（时刻、原因、`lost`）与跳过表里每一行一条 `['unresolved', <键>]`，`state` 是写后的完整状态；再写快照。之后的写入从这个状态接着写。以后再从同一个起点或更早的起点重放，走到这条 `recovered` 时第 3 步照常通过，第 4 步把它登记过的行从跳过表里去掉，所以不会对同一行再写一条 `recovered`。
7. `unresolved` 里的行在面板「恢复」一节与行健康里逐条列出（序号、在第几条之后、`actor`、`op`、目标、原因）。面板把同一处断开之后连续的行归成一组。人对一条或一组点「按记录生效」（`recovery-accept`）或「忽略」（`recovery-dismiss`），都进流水，条目随之从 `unresolved` 删掉：
   - `recovery-accept`：以人的身份写一条新记录，`changes` 是这几行各自的 `changes` 按流水顺序接起来，再加删掉对应的 `unresolved`；写后整份校验，不合法就整次拒绝。人担保的是「照这几行写的改」，所以 `harness`、`detector` 写的行也能这样补上；读不出的行没有 `changes`，只能忽略。面板在按钮旁按 `to` 显示每行会改什么。
   - `recovery-dismiss`：只删掉对应的 `unresolved`。

蓝屏清零快照之后（§1.4 第 5 条）走第 1 步的 `base` 或第一行，第 3 步逐条通过：清理写在记录里，以前的 `recovered` 照常核对通过，所以重建出来的状态与清零前相同，跳过表为空，第 6 步只写一条原因为 `snapshot-corrupt`、不登记任何行的 `recovered`。一次读取同时碰上下表几种情形时（例如快照清零、流水最后一行也没写完），`recovered.reason` 取表里最靠下的那一种，面板与行健康把每一种的说法都列出。

| 读到的情况 | 处理 | 面板与行健康（每种情形一个说法，§2.5 用同样的字） | `recovered.reason` |
| --- | --- | --- | --- |
| 快照有效但落后于流水，或有一个 `.<文件>.pending`（或本进程内存里记下的临时文件）的 `stateDigest` 等于流水最后一条的 `snapshot` | 采用 pending（改名覆盖快照），或从快照重放其后的记录（逐条核对通过）并写新快照；没有不生效的记录时不写 `recovered` | 宿主日志 info「快照没跟上，已补上」；面板与行健康不显示（这是 §4.4 第 7 步的正常降级） | 只在同时有不生效的记录时写，`snapshot-behind` |
| 快照为空、全是零字节、截断或解析不了（2026-10-29 蓝屏后的情形：元数据已提交、数据没有落盘） | 从 `base` 或第一行重放 | 「快照损坏（清零、截断或读不出），已按流水重建」 | `snapshot-corrupt` |
| 快照能解析，但流水里没有它的 `seq`，或摘要与那条记录的 `snapshot` 不符 | 从 `base` 或第一行重放 | 「快照被引擎以外的写入改过，已按流水重建」，行健康 degraded | `snapshot-modified` |
| 流水最后一行不完整或解析不了 | 截掉这一行（先把它的字节复制进 `.corrupt-<时刻>`），再按上面判断快照 | 「流水最后一条没写完，已丢掉（N 字节）」 | `journal-tail` |
| 流水中间有读不出的行 | 按第 5 步，坏行之后到下一个锚点之前的记录不生效；流水不改写，整份复制一份 `.corrupt-<时刻>` 供人查看 | 「流水第 N 行读不出，之后 M 条记录核对不了，没有生效，请核对」，行健康 degraded，`recovered.lost` 为真 | `journal-unreadable` |
| 某条记录的摘要对不上（引擎以外追加或改了流水） | 按第 3 步不生效 | 「流水第 N 条不是引擎写的，没有生效，请核对」，行健康 degraded，直到人处理完 | `journal-not-engine` |
| 两个文件都不存在 | 空状态，不算恢复 | 无 | 无 |

流水每次追加都 `fsync`，快照写入先 `fsync` 临时文件再改名，所以掉电时最多丢最后一次没写完的操作。面板不取锁也不写文件（§9.2）：它读到两边不一致时保留上一次一致的内容，1 秒后重读；连续 3 次不一致就写「状态等宿主重建」，宿主下一次读取时按上面处理。

### 4.6 开机时刻

`bootAt` = 当前时刻减 `os.uptime()`，取到秒。租约记下取得时的 `bootAt`；读到的租约与当前的差超过 5 秒，说明机器重启过：占用者是会话、进程（以及带 pid 的外部占用者）的租约当场失效（`harness` 写一条 `reclaim`，`evidence` 为两个开机时刻）；人的租约按自己的期限走。等待单同理：上一次开机开的单全部过期。

### 4.7 流水的增长

单个流水文件超过 8 MiB 时，在锁内改名为 `<名字>-<最后的 seq>.jsonl`，新流水的第一条是 `base`：`changes` 为空，`state` 为完整状态，`snapshot` 照常是 `stateDigest(applyRecord(当前状态, 这条记录))`（只有 `seq` 变了）。快照无效时重放从最近的 `base` 开始。旧文件保留，供审计。记账信号只在值变化时写（§5.1），在场一天几十条；采样信号与心跳不进流水。

## 5. 信号与检测器

人问：「自动检测？你想怎么设计？比如人在用电脑，现在是高峰期，服务器负载过高，后台有错误日志等等，借鉴一下hook的设计？」本节的回答：检测器像 hook，由触发加检查组成，但它只写信号；判断调用的是人写的规则，规则只读内存里的信号。

### 5.1 信号与它的有效值

每个信号有一个类型（布尔、数、取值表）和两份值：检测器写的检测值、人写的人手值。有效值按顺序取第一个成立的：

1. 人手值设了且没到期：取人手值（人总是能盖过检测器，例如检测器认为人不在而人点了「我在用电脑」）。
2. 有检测器，它不在影子期（§5.6），最近一次检查成功，且离最近一次成功不超过它的有效期 `ttlMs`：取检测值。
3. 其余：未知。

检测器失败、超时、被禁用或运行它的宿主已经不在，信号都变成未知，从不变成「否」。人手设的开关（`code-freeze`）就是一个没有检测器、只有人手值的信号。人手值默认期限：在场 8 小时，开关直到解除；「交给自动判断」清掉人手值。

信号按变化的频率分两种存法：

- 记账信号（布尔与取值表：在场、服务健康、开关）：值变化时经引擎写进机器或项目状态，进流水，留痕。
- 采样信号（数：CPU 负载、可用内存、磁盘、日志行数）：变化太频繁，写进流水只会添噪声；运行它的宿主把值与时刻写在自己的心跳文件 `hosts/<宿主>.json` 里，每 15 秒覆盖一次，不进流水。用到它的判定在执行记录里写下当时的值（§10.5），留痕落在判定上。

### 5.2 检测器：触发加检查

| 部分 | 内容 |
| --- | --- |
| 触发 | `interval`（每隔多久，内置检查至少 5 秒，命令检查至少 60 秒）；`schedule`（每天的几个时刻，可限星期）；`file`（某个文件变化，另每 30 秒比一次大小与修改时间作兜底）；`process`（某些进程名出现或消失，由辅助进程每 15 秒查一次）；`host-event`（宿主事件：会话创建、会话结束、工具调用出错，5 秒内的多次合并成一次） |
| 检查 | 内置检查（下表），或 `log-match`（读文件新增的部分，数最近一段时间里匹配某个正则的行）、`http`（对一个地址发 GET，看状态码）、`command`（运行一条命令，§5.4） |
| 信号 | 写哪个信号、它的类型、有效期 `ttlMs` |
| 模式 | `shadow` 或 `enforce`（§5.6） |

宿主事件的来源是规则行已经能接的钩子：`agent/created`（agent:581–585）、`session/disposed`（session:1925–1936）与 `session/event`（session:1517–1536、1579–1598，追加即同步通知）。工具出错从 `session/event` 里认出工具结果的错误标记，事件类型名与字段在实现时按 rc.3 核对〔未核实，§15 L3〕。

### 5.3 内置检测器

| 检测器 | 信号（级别） | 触发 | 检查 | 值 | 有效期 | 初始模式 |
| --- | --- | --- | --- | --- | --- | --- |
| `builtin:presence` | `presence`（机器，记账） | 每 15 秒 | 辅助进程的 `GetLastInputInfo`：空闲少于 3 分钟为在、不少于 10 分钟为不在，之间保持上一次；一次变化持续 60 秒才算数 | `present`、`away` | 60 秒 | 影子（推断性的检测，§5.6） |
| `builtin:desktop-foreground` | `desktop-foreground`（机器，记账） | 每 15 秒 | 辅助进程的 `GetForegroundWindow` 与 `GetWindowThreadProcessId`：前台进程名为 `DeepSeek Harness` 且空闲少于 60 秒 | 布尔 | 60 秒 | 影子；只显示，不替人取桌面版租约（取人的租约等于替人做决定） |
| `builtin:glm-peak` | `glm-peak`（机器，记账） | 每 60 秒，另在高峰时段的起止时刻 | GLM 包计价服务的 `peak(atMs)`（split 0.3 §4.3） | 布尔 | 120 秒 | 生效：由代码里的时段表算出，没有误判要量；服务不在时未知 |
| `builtin:cpu-load` | `cpu-load`（机器，采样） | 每 10 秒 | `os.cpus()` 的时间差分 | 0–1 | 30 秒 | 生效：测量值，不是推断 |
| `builtin:free-memory` | `free-memory-mib`（机器，采样） | 每 10 秒 | `os.freemem()` | MiB | 30 秒 | 生效 |
| 人加：磁盘 | 人起名，例 `disk-free-d-gib`（机器，采样） | 每 60 秒 | `fs.statfs(<路径>)`（Node 18.15 起内置） | GiB | 180 秒 | 影子 |
| 人加：错误日志 | 例 `server-errors-5m`（项目，采样） | 文件变化 | `log-match`：从上次的位置读新增内容（每次至多 1 MiB；文件变小即从头读），数最近 `windowMs` 里匹配的行 | 行数；证据是最后一条匹配的行，截到 200 字符，只在面板上显示，不进给模型的提醒（日志里可能有密钥） | `windowMs` | 影子 |
| 人加：服务健康 | 例 `staging-health`（项目，记账） | 至少每 30 秒 | `http`：GET，超时至多 10 秒，状态码在期望范围内（默认 200–399）为 `up`，否则 `down`；连接失败也是 `down`，检测器自己出错（地址非法）才是未知 | `up`、`down` | 3 倍间隔 | 影子 |
| 人加：进程在不在 | 例 `obs-running`（机器，记账） | `process` | 辅助进程的进程表 | 布尔 | 45 秒 | 影子 |
| 人加：命令 | 人起名（机器或项目） | 任一种 | `command`（§5.4） | 人声明的类型 | 至少 2 倍间隔 | 影子 |

GLM 高峰在这里只是一个信号：GLM 包自己的高峰提醒留在 GLM 包（split 0.3 §4.4），规则板不另发提醒；人想在高峰时排队重活，就写一条引用 `glm-peak` 的规则（`docs/ORCHESTRATION.md` §11.4 的排期，「到时候由用户决定」）。

### 5.4 命令检查的约定

- `argv` 是数组，不经 shell（要 shell 就写 `["pwsh", "-NoProfile", "-Command", "…"]`）；工作目录默认是项目根（项目检测器）或用户级目录（机器检测器）。
- 环境只给 `PATH`、`SystemRoot`、`TEMP`、`TMP`、`USERPROFILE`，以及 `HOURNESS_SIGNAL`（信号名）与 `HOURNESS_PROJECT_ROOT`（项目检测器）。不传其他环境变量，免得宿主的凭证进到人写的脚本里；需要密钥的检查自己从文件读。
- 结果：退出码 0 且标准输出（至多 64 KiB）是一个 JSON 对象 `{"value": <值>, "evidence"?: <至多 200 字符>, "ttlMs"?: <数>}`，值的类型与声明相符，才算读到值。退出码非 0、超时、输出不是这样的 JSON、类型不符，都记为检测器出错，信号变成未知。退出码不表示「放行」或「拦下」。
- 资源：用 Node `child_process.spawn`（`windowsHide: true`、`shell: false`），起来后立刻 `os.setPriority(child.pid, PRIORITY_BELOW_NORMAL)`；超时默认 10 秒、至多 30 秒，到时只要 Node 的 `ChildProcess` 还没有 `exit`，就用 `taskkill /PID <pid> /T /F` 结束整棵进程树（已退出就不发，免得 pid 被复用后杀错进程）；同一宿主同时至多运行一个命令检查，其余排队；连续失败 3 次后间隔加倍，至多 10 分钟。
- 宿主进程在预算的 Job Object 里时（§7.3），命令检查同样受 CPU 上限约束：它们也是 DSH 宿主进程树的一部分。

### 5.5 谁来运行检测器

- 机器检测器：一台机器一个运行者。宿主代码以 `harness` 身份取独占资源 `detector-runner:machine` 的租约，占用者 `{kind: 'host', host: <本宿主>, label: 'detector runner'}`（§4.2 `Holder`，死活按 §8.2「宿主」一行的心跳判断，评审 F21），拿到的运行全部机器检测器。
- 项目检测器：由一个当前有这个项目的活会话的宿主运行（租约 `detector-runner:<项目键>`）。没有活会话就没人运行，信号变成未知；这时也没有 agent 在这个项目里动作，不影响判定。
- 每个宿主自己算 `cpu-load` 与 `free-memory-mib` 给自己的判定用，不读文件；运行者另把它们写进心跳文件，给面板与命令行看。
- 心跳：运行者每 15 秒覆盖自己的 `hosts/<宿主>.json`（临时文件加改名，只有它自己写），内容是宿主身份、各检测器最近一次运行与成功的时刻、出错原因、采样信号的值。别的进程判断一个检测器的值是否过期，看的就是这个文件。运行者的宿主退出时释放租约；崩溃时租约在心跳超过 45 秒后被下一个宿主收回（§8.2）。
- 检测器的工作都是异步的（定时器、异步读文件、子进程、`fetch`），不阻塞工具调用；`log-match` 每次至多读 1 MiB，正则只对新读到的行跑。

### 5.6 影子先行

人新加的检测器、在场检测器与桌面版前台检测器都从影子开始（`docs/CHARTER.md` §6：新门禁先以影子模式运行）。影子期内：

- 信号照常算出，面板上显示值并标「影子」。
- 引用它的规则照常判定，但执行方式一律降为只记录：判为拦截或排队时写一条影子记录（规则、调用、信号当时的值），调用照常执行。所以人能在规则真正生效之前，看到它会挡下哪些调用。
- 不引用它的条件不受影响。

放开（影子转生效）只有人能做（§2.5）。面板给出放开所需的数据：影子期多久、产生了多少条影子记录、人看过之后标记的误判数；在场检测器另给一致率（最近 7 天里，人每次手设在场时，检测器当时的判断与之相同的比例）。放开的判据由人定，§19 D2 给出推荐的数字。

### 5.7 宿主当场算的信号

- 时钟：判定时刻现读。每个宿主每 60 秒重判一次自己在等时钟条件的等待单，另在条件里出现的下一个时刻加一次。
- 租约：读机器状态（§8）。
- 阶段：图行服务的 `focusOf(session)`（M3 §2.1 新增）给出焦点，`src/graph/stage.ts`（M3 §3.6.1）给出有效阶段。
- 角色：设计行的服务 `glmHournessDesign.isMainAgent(agent)`（经 `ctx.get`，每次判定时读）；服务不在时退到 M3 的投影 `hournessMainAgent`（§2.3）。
- M3 没有合入时阶段与角色读不出，引用它们的规则不生效并在面板上写明。

### 5.8 读不出的信号

面板的「信号」一节列出每个读不出的信号与原因（检测器出错及其信息、运行者心跳过期、服务不在、辅助进程不可用、M3 未合入、检测器在影子期）。引用它的规则按 `onUnknown` 处理；行健康按会话写「N 条规则的条件读不出」。

### 5.9 与 hook 的对照

三种做法（推荐项在最后）：

1. 检测器直接做成调用前的命令 hook：每次工具调用都跑一条外部命令，按退出码放行或拦下。最像 Kiro。代价：每次调用都要等外部命令（几十毫秒到几秒），命令卡住 agent 就卡住；判定散在各个脚本里，面板说不清是哪条规则在挡；人写的脚本能直接拦调用，绕过了「规则用词汇表达、查不了的只告知」。
2. 只用内置检查，不开放命令与日志：最安全。代价：人举的「后台有错误日志」「服务器负载过高」这类项目特有的情况，要等改代码才能表达。
3. 检测器是只写信号的 hook，调用路径上只读内存里的信号（推荐，本设计采用）：调用路径上只有毫秒级的判断；命令只在后台按触发运行，失败只让信号变成未知；新情况由人加一个检测器、再写一条规则就能表达。

Kiro hook 的各部分怎样对到规则板（本仓库的 hook 文件：`.kiro/hooks/graph-on-workflow-launch.json`、`graph-sync-reminder.json`、`reading-digest-weekly.json`，格式为 `{version, hooks: [{name, trigger, description, matcher, action: {type, prompt}}]}`）：

| Kiro hook | 规则板里对应的 | 一样的地方 | 不一样的地方 |
| --- | --- | --- | --- |
| `trigger`：`PreToolUse`、`PostToolUse`、会话开始等（本仓库用到 `PostToolUse`；会话开始的 hook 输出带 `hook_event_name: SessionStart`） | 检测器的触发（定时、时间表、文件、进程、宿主事件）；规则的执行边界（工具调用前对应 `PreToolUse`，每步提醒对应往上下文里放内容） | 都回答「什么时候跑」 | 规则不是在一个事件上跑一次就完：它是持续的状态，每次调用都按当时的信号判断 |
| `matcher`：工具名的正则（例 `^run_workflow$`） | 规则的 `action`：工具名、命令文本、写文件路径、派发、重活、用资源 | 都回答「对哪些调用」 | 规则的匹配有类型：写文件按解析后的目标路径，shell 复用 guard 引号感知的判写，不只看工具名 |
| `action.type: agent`：给 agent 一段提示（本仓库的三个 hook 都是这一类） | 执行方式 `inform`：每步提醒里的一行 | 都只告诉 agent，不拦 | 规则板的告知只在变化时注入，标明「只告知」，有期限与来源 |
| 命令型 hook：运行一条命令，按退出码与输出放行或拦下（本仓库没有用；Kiro 支持哪些写法、退出码怎样解释没有核对〔未核实〕） | 检测器的命令检查：退出码 0 且输出 JSON 才取值 | 都靠一条外部命令的退出码与输出 | 检测器的命令不在调用路径上，拦不了任何调用，只产出信号；拦不拦由人写的规则决定。失败只算未知：脚本坏了，不会悄悄全放开，也不会悄悄全拦下 |
| 各个 hook 文件各自独立，按顺序跑 | 检测器与规则都在规则板的状态里，经引擎校验后写入 | 都由人写 | 规则按最强的执行方式合并，没有顺序；租约、等待单、跨进程的唤醒与恢复，hook 没有对应的东西 |

类比在三处断开：hook 是无状态的、一次事件一次结论，规则板的判断依赖持续的状态（信号、租约、等待单）；hook 的命令可以直接拦调用，规则板把「测事实」和「做判断」分给检测器与规则两方，命令只能测事实；hook 的提示是软约束，规则板只有在词汇里的动作才被执行，写不进词汇的明确标为只告知。

## 6. 执行

### 6.1 执行边界一览

| 边界 | 能做的执行方式 | 宿主契约与证据 |
| --- | --- | --- |
| 每次工具调用 `tools/pre-execute` | 拦截；排队（当场拒绝并开单，或在调用处等）；只记录；只告知 | waterfall `(exec, next)`，决定只有 `allow`、`deny{reason, info?}`、`ask`、`cancel`（tools:3310–3360 `prepareExecution`，瀑布在 :3321）〔实读〕。参数在 `createExecution` 里被深冻结（tools:3227–3263，`deepFreeze(detached)` 在 :3263），监听器改不了命令〔实读〕。监听器被 `await`，瀑布与 agent 循环都没有超时（dsh-agent-loop 的 lib 里没有 timeout 或 deadline 字样，检索）〔实读〕。`exec.signal` 是调用方的取消信号（tools:3235）；`cancel` 决定得到「调用前已中止」的结果（tools:3332）。已有的用法：guard、图文件门禁（`docs/DESIGN.md` §2.4a） |
| 每步 `agent/pre-step` | 告知：对这个 agent 生效的规则与它的等待单 | agent-loop:901–925；notice 与 `createUserMessage` 同形（llm:37–66）；经共享接缝 `installStepNotice`（split 第 1 步移到 `src/shared/step-notice.ts`） |
| 系统提示词 `system-prompt/assemble` | 一行静态声明 | system-prompt:365–405；guard 的 `glm:guard` 节（G3 之后所有路由都有，M3 §7） |
| 派发 | 排队（派发槽位） | 模型调用的 `subagent`、`subagent_fork` 经 `tools/pre-execute`；在跑的子 agent：`agents.roots()`（agent:617–625）、各根的 `subagentCatalog` 投影（subagent:703–803）与 `agents.get(id).status`（agent:596；agent-loop:790–791）；M7 的派发工具在调用 `subagents.startActivation` 之前问规则板（§6.5） |
| 脚本 | 排队（退出码 3 或等待） | 本仓库 `scripts/sandbox.mjs`（探针与标定共用，`docs/DEVELOPMENT.md` §3） |
| 命令行 | 检查一个假设的调用；取得、续租、释放租约 | `npm run -s rules -- …`（§9.5） |
| 宿主进程树 | 限速 | Node `os.setPriority`；辅助进程的 Job Object（§7） |
| 会话结束 | 释放会话的租约；子 agent 的等待单转给派发链的根，其余会话的单取消（§6.3） | `session/disposed`（session:1925–1936）；兜底是每 5 秒重判时 `agents.get(sessionId)` 为空 |

### 6.2 工具调用门

规则行在 `tools/pre-execute` 上以 `prepend: true` 注册（最外层），每次调用：

1. 带 `parent` 的子调用（`run_code` 程序里的工具调用；本包的 DeferredToolCall 不带 `parent`，`src/toolsearch/index.ts` 文件头注释）照样判定，与 guard 不同（评审 F11）：guard 放行它们是因为 guard 管的是模型的习惯，规则板管的是资源与人定的约束，程序里跑的重活与驱动桌面版的命令同样要管。子调用只出现在非 native 的呈现模式（`ptc`）下：`run_code` 只对呈现模式不是 `native` 的 agent 可见（tools:3075），而 `ptc` 下模型直接调用 `run_code` 以外的工具一律被拒、带 `parent` 的子调用可以调任何可见的工具（tools:3096–3101 `resolveExecution` 的注释、3195–3197 `collapses`），所以这样的 agent 的每一次工具调用都是子调用（评审 F26）。因此子调用照常开等待单、照常去重与唤醒，与直接调用只差一处：不在调用处等（`holdMs` 按 0），因为 `run_code` 自己有期限，等待计入它（Node 默认 120000 毫秒、至多 600000，含子调用的等待，`dsh-tools/README.md`:136）。拒绝作为错误回到程序里，理由是子调用的排队文字（§6.4），单上记 `nested: true`；只记录照常；用资源且资源空闲时照常替会话取得租约。规则板不需要读 agent 的呈现模式：有没有 `parent` 就够了。
2. 先 `await next()`；内层不是 `allow` 就原样返回。这样 guard、图文件门禁、M3 的写入规则先判，被它们拒绝的调用不进规则板（§2.4）。规则行在最外层，不论各行的加载先后都成立。
3. 构造判定的输入：调用名经 `toNativeTool` 换成原生名；命令文本（`shellCommandOf`）；写文件的目标（复用 guard 的判写与路径解析：文件工具的 `file_path` / `path`，以及 file-tools-only 判为写文件的 shell 命令）；会话、项目键（§4.3）、角色、路由；信号快照（内存缓存，按两个状态文件的修改时间与心跳文件刷新）。
4. 判定：纯函数 `judge(input, rules, signals)`（`src/rules/judge.ts`），得到最强的执行方式、命中的规则与每条规则当时的条件值。
5. 按执行方式：
   - 没有命中，或只有只告知：`allow`。放行时，本会话有同签名、状态为 `cleared` 的单就转 `done`；调用方是子 agent 时，同一个派发根下同签名的 `cleared` 单（含转交来的）同样转 `done`。
   - 只记录：写影子记录（§10.5），`allow`。
   - 拦截：写执行记录，返回 `deny`，理由是四段式（§6.4）。
   - 用资源、资源空闲、取得方式是「执行边界」（§8.3）：以本会话为占用者取得租约，`allow`。资源被别人占着即按排队处理。
   - 排队：按本会话与这次调用的签名（原生工具名加规范化参数的 SHA-256 前 12 位）找开着的单。人对这张单点过「放行这一次」且没到期：关单，`allow`。资源保留给了这张单：取得租约，关单，`allow`。规则的 `holdMs` 大于 0 且这不是子调用（第 1 步）：在调用处等到条件不再成立、`holdMs` 到期或 `exec.signal` 中止；条件不再成立即 `allow`，中止返回 `{kind: 'cancel'}`，到期转为下一项。其余：开单（同签名已有开着的单就复用），写执行记录，返回 `deny`，理由是排队文字（§6.4）。
6. 判定或读状态抛错：放行，行健康记降级并写原因（与 guard 的判定器抛错即放行相同）。

调用处的等待：DSH 里这次工具调用在界面上显示为还没有结果、人按停止就结束等待〔推断：监听器在工具体之前被 `await`，停止经 `exec.signal` 传来（tools:3235、3332）；桌面版界面上的样子没有核对，§15 V9，随 R4 的第一批 L4〕。等待期间每 2 秒、以及状态文件变化时重判一次。等待的期限只来自规则的 `holdMs`（至多 15 分钟），内置规则都是 0（当场开单）：让 agent 转去做别的，比让它停在一次调用上更合「执行期自主推进，不打断人」（`docs/ORCHESTRATION.md` §4.6）。

### 6.3 等待单

- 状态：`deferred`（调用已拒绝）、`held`（调用在调用处等）、`reserved`（独占资源为它保留）、`cleared`（条件已解除，等原 agent 重试）、`done`、`cancelled`、`expired`。
- 去重：同一会话、同一签名只开一张。子 agent 开单时另按派发链的根去重：同一个根下已有同签名、开着的单（包括从已结束的子 agent 转来的，见下）就复用它，单的会话与 agent 改为这个子 agent，`handedFrom` 保留。主 Agent 重派同一个任务、新的子 agent 做同一个调用，不会叠出第二张单。同一会话开着的单至多 20 张，再多就直接拦截，拒绝文字写「开着的等待单太多，先处理已有的」。
- 谁来重判：拥有这个会话的宿主进程（单上记着宿主身份）。它在状态文件变化与每 5 秒时重判自己的单。条件不再成立：单转 `cleared`，给 agent 发一条消息（来源 `hourness-rules-wake`，只发一次）：
  - agent 在跑（`status` 为 `running`）：`steer`，下一步收到（agent-loop:800–814；M3 §4 已核对的用法）。
  - agent 空闲，且它有处于 active 的 goal（`goals.get(agent)?.phase === 'active'`；`get` 对不是活实例的 agent 抛 `GoalError`，goal:611–614，这时按没有 goal 处理）：`inject`，由驱动器开的下一轮第一步收到。不用 `followup`：进入下一回合收件箱的消息会被 goal-round-driver 当作竞争输入，这一轮的预约作废（goal-round-driver:249，`docs/ORCHESTRATION.md` §2.1）〔推断：`inject` 不触发这条判定，§15 L3 核实〕。
  - 其余空闲的 agent：`followup`，开一个新回合（`/graph-run` 的开始用的是同一个，`src/graph/run-control.ts`）。
- 独占资源的排队：资源释放时，把它保留给排在最前（开单最早）的那张单 5 分钟（`reservedUntil`），这期间别人取得会被排队；原来的 agent 5 分钟内没回来重试，保留过期，轮到下一张。
- 过期：开单 24 小时后仍没解除；转为 `cleared` 之后 30 分钟原来的 agent 没有重试（面板写「已解除，agent 没回来」）；或拥有它的宿主进程已不在（§8.2 的判断）。
- 会话结束（评审 F5）：判定是 `session/disposed`，兜底是拥有它的宿主每 5 秒重判时 `agents.get(sessionId)` 为空。M7 的子 agent 是一次性的后台 worker（`docs/ORCHESTRATION.md` §3，spawn 后端、`delivery: 'parent'`），重活被推迟后它照提示收尾、会话随之结束〔推断：一次性子 agent 静止后 `finishDisposal` 释放它的 handle（subagent:1921–1960、1978–2035），会话的 `session/disposed` 因此发出；没有发出时由兜底的重判发现，§15 R4 L3 核实〕。所以：
  - 会话头带 `origin: 'subagent'` 的会话结束时，它开着的单不取消，转给派发链的根：M3 合入后用 `dispatchRoot(agents, caller)`（`src/guard/main-agent.ts`，M3 §3.3.3），之前取 `agents.get(header.parentSession)` 的活 agent，它本身也是子 agent 时沿 `parentSession` 往上找，直到不带 `origin` 的会话。单上记 `handedFrom`（原来的会话、agent 标签、焦点节点，焦点读图行服务的 `focusOf`，没有时省略），会话与 agent 改为根的；机器流水写一条 `ticket-handover`。spawn 后端的子 agent 是本宿主进程里的活 agent（`activation.kind === 'local'`，handle 上有 `agent`，subagent:1893、2026），根与它在同一个宿主进程里，拥有这张单的宿主不变；进程外的 `external` 子 agent 的工具调用不经本宿主的 `tools/pre-execute`，不会在这里开单〔推断，M7 不用 external 后端〕。
  - 解除时唤醒消息发给根 agent（文字见 §6.4），根按自己的状态选 `steer`、`inject`、`followup`，同上。
  - 链上找不到活的根（根已释放、链断开）时才取消，机器流水写原因「子 agent <标签> 已结束，派发它的 agent 也不在」。
  - 不带 `origin` 的会话（人开的会话）结束时，它的单取消：人关掉了会话，就不再替它排队；机器流水写原因。
- 人：面板上「放行这一次」（10 分钟内同签名的下一次调用放行，用后关单）与「取消」。两者都只有人能做（§2.5）。

### 6.4 agent 看到什么

全部是给模型看的英文，同本项目其他提醒（`docs/ORCHESTRATION.md` §11.4）。

拦截（四段式，与 guard 用同一个渲染 `renderCorrection`，`src/guard/rules.ts`）：

```text
You tried to run "git push origin main".
Boundary: Rule r-no-push-night "No push after 21:00" (set by the human at 2026-10-29 21:05, until lifted) blocks it now: the clock is outside 09:00-21:00 +08:00.
Right path: Commit locally and continue with other planned work; push after 09:00, or tell the human that you need to push now.
Exception: Only the human can change or lift rules (/rules lift r-no-push-night, or the Rules view of the project graph panel). You may propose a change with rules_propose; it takes effect only if the human sets it.
```

排队：

```text
You tried to run "npm run build", which this project marks as heavy.
Boundary: Deferred as ticket q-12. Rule builtin:budget-heavy defers heavy commands while the human is at the computer (presence: set by the human at 14:02).
Right path: The call did not run. Continue with other planned work; the harness sends you a message when q-12 clears, then run the same call again. Running it again before that returns this message and does not queue it twice.
Exception: The human can let it through once from the Rules view, or change the presence.
```

排队，调用方是子 agent（会话头 `origin: 'subagent'`）时，「Right path」一段换成：

```text
Right path: The call did not run. If your task cannot finish without this call, stop and report ticket q-12 in your handoff; the agent that dispatched you is told when it clears. Otherwise continue with the rest of your task.
```

排队，调用是 `run_code` 程序里的子调用（带 `parent`，§6.2 第 1 步）时，照常开单，「Boundary」与「Right path」两段为（评审 F26）：

```text
Boundary: Deferred as ticket q-12. Rule builtin:budget-heavy defers heavy commands while the human is at the computer (presence: set by the human at 14:02). Your program received this as an error.
Right path: The call did not run. Continue with other planned work, in this program or the next one; the harness sends you a message when q-12 clears, then run the deferred call again. Running it again before that returns this message and does not queue it twice.
```

调用方是子 agent 时，「Right path」一段换成上面子 agent 的那一段，只把第一句改为「The call did not run; your program received this as an error.」。

唤醒（`hourness-rules-wake`）：

```text
[rules board] Ticket q-12 cleared: the human is away now (presence detected at 18:40). You may run the deferred call again: pwsh "npm run build".
```

唤醒，单是从已结束的子 agent 转来的（§6.3）：

```text
[rules board] Ticket q-12 cleared: the human is away now (presence detected at 18:40). Subagent "build-ui" (task m7-ui-build) was deferred on pwsh "npm run build" and has ended. Dispatch the task again or run the call yourself; a new dispatch of the same call reuses q-12.
```

独占资源被保留时，唤醒消息另写「dsh-desktop is reserved for you until 18:45」。单上有 `nested: true` 时，「You may run the deferred call again」之后加「from a run_code program」。

每步提醒（来源 `hourness-rules`，`<system-reminder>` 包装，`wrapSystemReminder` 在 split 第 1 步之后位于 `src/shared/zcode-notice.ts`）：

```text
Rules board: rules in effect for you now. The harness enforces them at tool calls; a blocked or deferred call returns the reason.
- [queue] builtin:budget-heavy: heavy commands are deferred while the human is at the computer (since 14:02)
- [throttle] builtin:budget-throttle: commands run below normal priority on at most 8 of 32 logical processors; long builds and tests take longer, this is expected
- [queue] lease dsh-desktop: held by the human since 14:05 until 16:05; calls that drive the desktop app are deferred
- [block] r-no-push-night: no git push outside 09:00-21:00 +08:00 (set by the human)
- [inform, not checked] r-friday: "No release on Fridays" (set by the human)
Your open tickets: q-12 pwsh "npm run build" (deferred since 14:06); q-15 handed over from subagent "build-ui" (task m7-ui-build): pwsh "npm test". Do not dispatch these tasks again before their tickets clear.
```

`[throttle]` 一行按宿主当前用的一级写：job 一级如上（处理器数取 k 与 n）；优先级一级为「commands started from now on run below normal priority」；档位没有落实时不列这一行。

列入提醒的：条件此刻成立、主体命中这个 agent 的规则（只告知的规则只要主体命中就列），这个 agent 持有的租约，它的等待单。至多 12 行，多出的写「and N more: call rules_show」。注入时机照搬每步投影（`src/graph/reminder.ts`）：正文摘要变化、压缩检查点之后、目标轮；没有变化不注入，请求前缀不变，便于命中提示词缓存（`docs/DESIGN.md` §6）。从有规则变成没有规则时注入一次「No rules board rule applies to you now.」。只在变化时注入的历史扫描在 M3 里从 `reminder.ts` 抽成 `src/graph/digest-notice.ts`（M3 §2.1）；规则板先于 M3 实现时由规则板抽出，同一个文件，后到的一方直接用。

持有 `dsh-desktop` 时另加一行资源的提醒：「If you change the model in the desktop model picker, switch it back before you release the lease: DSH writes the pick into the profile's agent-default-model (docs/HANDOFF.md §6).」

系统提示词的声明：guard 的 `glm:guard` 节末尾加一行「A rules board may block, defer or throttle tool calls; the rules in effect for you arrive as reminders, and a deferred call returns a ticket.」。做法同 `GRAPH_FILES_DECLARATION`（`src/shared/graph-service.ts`，split 第 1 步移到 `src/graph/service.ts`）：规则行启用时提供服务 `glmHournessRules`，guard 经 `ctx.get` 读到它的 `declaration` 才加这一行；规则行卸载时这一行随之消失。这一行不随规则变化，不影响缓存。

### 6.5 派发

内置规则 `builtin:budget-dispatch`：人在电脑前时，本宿主同时在跑的子 agent 数达到 `budgets.present.dispatchSlots` 就排队新的派发。计数：`agents.roots()` 的每个根，读它的 `subagentCatalog`，对每个条目 `agents.get(id)?.status === 'running'` 计一个。槽位按宿主进程计，不跨进程：桌面版是一个宿主进程，日常的派发都在它里面；标定与探针各在自己的进程里，本来就是隔离的运行。

M7 的派发工具在调用 `subagents.startActivation` 之前调用 `glmHournessRules.admit({kind: 'dispatch', agent})`，得到与工具调用门相同的判定与文字；DSH 的 `subagent`、`subagent_fork` 走工具调用门。两条路用同一个 `judge`。

### 6.6 脚本

`scripts/sandbox.mjs`（探针与标定共用）在启动沙盒之前取租约 `dsh-profile:<profile 名>`（默认 `glmsandbox`，用 `DSH_SANDBOX_PROFILE` 时是那个名字）：

- 占用者 `{kind: 'process', pid, startedAt, label: 'probe <运行目录名>'}`，期限 2 小时，进程每 60 秒续租，退出时释放（`process.on('exit')`）；`token` 只在脚本的内存里。
- 被别人占着：标准错误写「dsh-profile:glmsandbox is held by <label> since <时刻> (pid <pid>)」，退出码 3；带 `--wait` 时每 5 秒重试，至多 60 分钟。
- 用真实的用户级目录（`$DSH_HOME` 或 `~/.dsh`），不是场景的：场景的 DSH 目录给被测的运行时用，排他要在真实的机器状态里才对所有人生效。探针今天比对的是真实 `~/.dsh/glm-hourness/audit/usage.jsonl` 前后不变（`docs/DEVELOPMENT.md` §3），规则目录不在其中。
- DSH 里的 agent 与 Kiro 都经这个脚本跑探针，所以两边都被覆盖。DSH 里的工具调用门另把 `npm run probe|calibrate` 认作「用资源」，取得方式是「脚本」：只检查、不替会话取租约，被占着时排队，免得 agent 起一个注定失败的进程。

### 6.7 宿主契约对照

「已用」指本包已经在用、`docs/DESIGN.md` §2.4a 有证据并经 L3 或 L4；「M3 新用」指 M3 设计第一次用、规则板跟着用；「新用」指规则板第一次用，实现时补进接口对照表与薄适配层 `src/shared/dsh-min.ts`，并在 §15 列出核实的层。

| 接口 | 规则板的用法 | rc.3 证据 | 状态 |
| --- | --- | --- | --- |
| 模块导出 `name`、`inject`、`apply(ctx, config)`；`ctx.on`（`prepend`）；`ctx.get`；`ctx.provide`；`ctx.inject` | 规则行入口；读数据目录、图行、计价、方言服务；提供 `glmHournessRules` 与行健康 | cordis:1625–1635、1536、372–381、763–766、800–830、1600 | 已用 |
| `tools/pre-execute` 的 `allow`、`deny` | 拦截、开单 | tools:3320–3353 | 已用 |
| 在 `tools/pre-execute` 监听器里长时间 `await`；`exec.signal`；`cancel` 决定 | 调用处的等待 | tools:3310–3360、3235、3332；agent 循环无超时（检索） | 新用 |
| `agent/created`、`agent/pre-step` 与 notice | 每步提醒 | agent:581–585；agent-loop:901–925；llm:37–66 | 已用 |
| `system-prompt/assemble` | 经 guard 的声明一行 | system-prompt:365–405 | 已用 |
| `session/event`、`session/disposed` | 宿主事件触发；会话结束时释放 | session:1517–1536、1579–1598、1925–1936 | 已用（guard 影子兜底） |
| 工具结果出错在 `session/event` 里的事件形状 | `host-event` 的 `tool-error` | 〔未核实〕 | 新用，L3 核实 |
| `commands.register`（`recordInput`、`input.hint`）与调用参数 | `/rules`、`/rules-apply` | commands:149–181、379–385 | 已用 |
| `tools.register` 与输出 schema 子集 | `rules_show`、`rules_propose` | tools:2974–2984、3637–3640 | 已用 |
| `sessionProjections.register`：`init(header, inheritedEventCount)` 只依赖会话头的单元，`wire.view` | 投影 `hournessRules`：把两个状态文件的绝对路径交给面板 | session-projection:67–91 | 新用（形状与 `graphLive` 相同，`init` 只读会话头） |
| `sessionProjections.stateOf` | 读 M3 的 `hournessMainAgent` | session-projection:122–131 | M3 新用 |
| `agents.get`、`agents.roots()`；活 agent 的 `status`、`followup`、`inject`、`steer` | 计派发槽位；唤醒 | agent:596、617–625；agent-loop:790–821 | `get`、`followup`、`inject` 已用；`roots`、`steer` M3 新用 |
| `subagentCatalog` 投影 | 计派发槽位 | subagent:703–803 | 已用 |
| `goals.get(agent)` 的 `phase` | 唤醒时判断有没有 active 的 goal | goal:611–614（`get`，对不是活实例的 agent 抛 `GoalError`）、880–888（视图展开 `state.goal`）、348–353（`phase` 取 `active`、`paused`、`blocked`、`complete`） | 新用（探针验证插件用过，`docs/DESIGN.md` §2.4a 派发表） |
| 会话头的 `parentSession`、`origin`；`agents.get(parentSession)` | 子 agent 的单转给派发链的根（M3 之前的走法） | session:1051–1053；subagent:346–355；agent:596 | 已用（glm-llm 的请求归因） |
| 一次性子 agent 静止后释放、`session/disposed` 发出 | 单的转交时机 | subagent:1921–1960（`watchLocalSettlement`）、1978–2035（`finishDisposal` 里 `handle.dispose()`）；session:1925–1936 | 新用；释放到 `session/disposed` 一段是推断，有每 5 秒的兜底，L3 核实（§15 R4） |
| `exec.parent`（`run_code` 程序里的子调用）；`run_code` 只对非 native 呈现模式可见；`ptc` 下模型直接调用其他工具被拒 | 子调用照样判定、照常开单，不在调用处等 | tools:3195–3197（`collapses`）、3234、3246（`exec.parent` 进执行对象）、3075、3096–3101；`dsh-tools/README.md`:136（`run_code` 的期限含子调用的等待） | 新用（guard 放行它，规则板判定）；不读呈现模式（`modeFor` 不在 README 的公开说明里） |
| 设计行的服务 `glmHournessDesign.isMainAgent(agent)` | 角色 `main-agent` | 不是宿主契约：M3 设计 0.4 没有这个服务，规则板要求设计行加一个成员（§2.3） | 新要求，L2 契约测试 |
| `remote.workspaceFiles.readBytes` 读工作区外的绝对路径文件、`changes` 监视工作区外的单个文件 | 面板读机器与项目状态 | `dsh-api-workspace-files/README.md`:40（文件读不受工作区圈禁）、54、58（文件的监视按文件读的权限，目录的监视限于工作区；文件不存在时只要父目录在就能监视到它重新出现） | 新用（读工作区内的文件已 L4），L4 核实 |
| `conversation.composer.dock` 槽 | 在场按钮 | `ui/src/channel.js`:350（GLM 按钮同一个槽） | 已用 |
| 工具名 `plugin_manager` | 桌面版资源的使用模式 | `dsh-plugin-manager/lib/types/tools.js`:75 | 新用（只比对名字） |

规则板不注册 Remote 服务、不加 waterfall、不追加自定义会话事件（第三方都做不到，`docs/DEVELOPMENT.md` §5 第 6 条、`dsh-session/README.md` 70 行）。

## 7. Windows 上的资源控制

### 7.1 哪些机制可用

| 机制 | 能做什么 | 本设计怎样用 | 证据 | 限制 |
| --- | --- | --- | --- | --- |
| 降低宿主进程的优先级（Node `os.setPriority(process.pid, PRIORITY_BELOW_NORMAL)`） | 宿主之后派生的进程都继承低于正常的优先级 | 优先级一级（M4），不要辅助进程 | 〔本机试验〕降低后派生的子进程报 10（`BELOW_NORMAL`），父进程恢复后子进程仍为 10。DSH 的普通进程走 Job 运行器，`CreateProcessW` 的标志是 1028（`CREATE_SUSPENDED` 加 `CREATE_UNICODE_ENVIRONMENT`），受限令牌一支是 4（`CREATE_SUSPENDED`），都不带优先级类（win32-process:693、704）〔实读〕；Windows 规定不指定优先级类时，父进程为 `BELOW_NORMAL` 或 `IDLE` 的子进程继承父进程的类 | 只管之后派生的进程；已经在跑的不变；宿主恢复之后，人在时派生的进程仍是低于正常；只是调度优先，CPU 闲时照样用满；内存与磁盘不受影响 |
| 把进程收进 job（`AssignProcessToJobObject`） | 进程与它之后派生的进程进 job | 规则行激活时就把宿主收进去（评审 F1） | 〔本机试验，第 2 轮〕宿主先派生一个子进程、之后才被收进 job：宿主在 job 里，那个子进程不在（`IsProcessInJob` 为假），job 强制低于正常时它仍是 Normal；收进之后派生的都在 job 里 | 收进之前已有的子进程永远在 job 之外；进程一旦进 job 就出不来 |
| job 的名字与句柄 | 按名字 `OpenJobObjectW` 打开同一个 job | 辅助进程重启后按名重开；建 job 之后、收进宿主之前先把句柄复制进宿主（评审 F2） | 〔本机试验，第 2 轮〕创建者把一次性进程收进命名 job 后退出：进程仍在某个 job 里，按名打开失败，Win32 错误 2；创建者退出前用 `DuplicateHandle(自己, job, 目标, …, DUPLICATE_SAME_ACCESS)` 把句柄复制进目标：按名打开成功，能设、读 CPU 上限 | job 的最后一个句柄关闭时名字就没了，job 因为里面还有进程继续存在、但再也打不开；复制要对宿主有 `PROCESS_DUP_HANDLE`，同一用户下可得 |
| Job Object：亲和性限制（`JOB_OBJECT_LIMIT_AFFINITY` 0x10，`BasicLimitInformation.Affinity`，信息类 9） | job 里全部进程只在给定的逻辑处理器上运行；对已经在 job 里、包括嵌套 job 里的进程立刻生效 | 人在电脑前一档的 CPU 上限：宿主进程树至多用 k 个逻辑处理器（评审 F12） | 〔本机试验，第 2 轮〕4 个空转线程，限 2 个处理器：合计 1.94–1.96 核；嵌套在类似 DSH 运行器的 job 里的进程同样读到被限的亲和性、1.98 核；只清掉标志时亲和性不变（1.97 核）；先设为系统的全部处理器再清掉标志，回到 3.96 核 | 上限以整个处理器计（32 线程上 5% 只能是 2 个处理器，6.25%）；多于 64 个逻辑处理器（多个处理器组）时这个字段不够用；job 里的进程能在限制内再收窄自己的亲和性，放宽不了〔文档语义〕；选哪几个处理器见 §7.3 |
| Job Object：CPU 硬上限（`JobObjectCpuRateControlInformation`，信息类 15，`ENABLE` 加 `HARD_CAP`，`CpuRate` 以全部逻辑处理器的万分之一计） | 把一个进程树的 CPU 合计压在上限以内，随时可以改或解除 | 不用（0.1 用它，评审 F12 之后换成亲和性限制） | 〔本机试验〕第 1 轮 `CpuRate` 156（约 0.5 核）时两个空转子进程合计 0.5 核；第 2 轮 5%（1.6 个处理器）时 4 个空转线程合计 1.5 核，解除后 3.94 核。上限打满时宿主自己每 20 毫秒一次的定时器延迟 p95 为 316 毫秒（job 强制低于正常）与 262 毫秒（宿主正常、只有空转进程低于正常），没有上限时为 0.9–1.0 毫秒 | 硬上限按整个 job 计：份额在一个调度区间里用完后，job 里全部线程，包括宿主，停到下一个区间，与优先级无关；所以宿主会成批停顿几百毫秒 |
| Job Object：强制优先级类（`JOB_OBJECT_LIMIT_PRIORITY_CLASS`） | 对 job 里已经在跑与之后的全部进程立刻生效 | 只在人走开与行卸载时用：先强制为正常，再清掉标志，让 job 里全部进程回到 Normal（评审 F3）；人在时不用 | 〔本机试验〕对在跑的进程设 `BELOW_NORMAL` 后读到 BelowNormal，改为 `NORMAL` 后读到 Normal；〔第 2 轮〕只清掉标志时宿主与子进程都停在 BelowNormal，先强制为 `NORMAL` 再清掉标志，两者都是 Normal。限 2 个处理器时整个 job 强制低于正常，宿主与空转线程同级，宿主的定时器延迟 p50 29 毫秒、p95 103 毫秒 | 会把 job 里自己设了别的优先级类的进程一并改成 Normal；强制时宿主与它的后代同级 |
| 逐个进程设优先级（`SetPriorityClass`，由辅助进程按 job 的进程列表与进程快照做） | 只降宿主的后代，宿主自己保持正常 | 人在电脑前时，宿主的后代降为低于正常（评审 F1、F12） | 〔本机试验，第 2 轮〕限 2 个处理器、宿主正常、空转进程单独设为低于正常：空转合计 1.94 核，宿主的定时器延迟 p95 1.0 毫秒、最大 1.6 毫秒；job 的进程列表（`JobObjectBasicProcessIdList`，信息类 3）包含嵌套 job 里的进程、不含收进之前派生的子进程；Toolhelp 快照按父 pid 找得到后者 | 两次扫描之间新起的进程以正常优先级运行，至多 2 秒（§7.3）；进程可以自己再把优先级调高 |
| 嵌套 job（Windows 8 起） | 已在我们 job 里的进程可以再被别的 job 收进去，我们的上限照样管它 | DSH 的运行器给每条命令建一个关闭即结束的 job（win32-process:537–548 `createKillOnCloseJob`、659 `assignProcessToJobObject`）〔实读〕，这些 job 嵌在我们的 job 下 | 〔本机试验〕把我们 job 里的子进程收进一个新的空 job 成功，它仍在我们的 job 里 | 嵌套 job 的上限按层叠加，文档语义，本机只测了一层 |
| job 里派生进程 | 默认继承 job | DSH 不带脱离 job 的标志（全库检索没有 `BREAKAWAY`）〔实读〕 | 〔本机试验〕Node v22 在我们的 job 里（没有设 `BREAKAWAY_OK`）普通派生与 `detached: true` 派生都成功，两个子进程都在 job 里 | DSH 宿主是 Node v24（Electron node 模式），没有在它上面试〔未核实，§15 L3〕 |
| Job Object：单进程内存上限（`JOB_OBJECT_LIMIT_PROCESS_MEMORY`） | 进程的提交内存超过上限时分配失败 | 不用在宿主的 job 上 | 〔本机试验〕上限 256 MiB 时，第二次分配 128 MiB 报 `RangeError: Array buffer allocation failed` | 失败表现为进程里的分配错误，不是干净地结束；宿主自己也在 job 里，宿主分配失败等于 DSH 崩溃 |
| Job Object：整个 job 的内存上限（`JOB_OBJECT_LIMIT_JOB_MEMORY`） | 进程树合计的上限 | 不用 | 文档语义 | 宿主在里面，总量一到宿主就分配失败 |
| 输入空闲时间（`GetLastInputInfo`）、前台窗口（`GetForegroundWindow`、`GetWindowThreadProcessId`） | 在场检测 | 辅助进程每 15 秒读 | 〔本机试验〕空闲 12609 毫秒，前台进程 `Kiro` | 只是近似：看视频不碰键盘会被判为不在；远程桌面、多个用户会话没有试 |

### 7.2 本机试验

`.agents/tasks/rules/exp/exp-jobobject.ps1`（Windows PowerShell 5.1.26100.9444，本机 Node v22.20.0，Windows 11 10.0.26300，32 个逻辑处理器，128 GiB 内存），只作用于脚本自己启动的进程，每个试验 job 都带 `KILL_ON_JOB_CLOSE`，结束时关句柄即结束进程，`finally` 里再按 pid 兜底：

| 项 | 结果 |
| --- | --- |
| Add-Type 编译 P/Invoke 类 | 222 毫秒 |
| 建命名 job `Local\glmh-rules-exp-<pid>`，设 CPU 硬上限 156（0.5 核） | 成功 |
| 把一次性「宿主」进程收进 job，设它为 BelowNormal | 成功，`IsProcessInJob` 为真 |
| 宿主之后派生普通与 detached 子进程 | 都成功；两个子进程都在 job 里，都是 BelowNormal |
| 把普通子进程再收进一个新的空 job（模拟 DSH 的运行器） | 成功，它仍在我们的 job 里 |
| 上限下 3 秒内的 CPU 合计 | 0.5 核 |
| 用按名重开的句柄解除上限后 | 1.98 核 |
| 单进程内存上限 256 MiB | 第二次分配 128 MiB 失败（`RangeError`），峰值 145 MiB |
| job 强制优先级 | 在跑的进程立刻变为 BelowNormal，改回后为 Normal |
| `GetLastInputInfo` 与前台窗口 | 12609 毫秒；`Kiro` |
| 结束后残留进程 | 无 |

`exp-priority.cjs`：Node `os.setPriority` 把自己降为 `BELOW_NORMAL` 后派生的子进程报 10；父进程恢复为 0 后子进程仍为 10。

第 2 轮（`exp-round2.ps1`、`exp-round2b.ps1` 到 `exp-round2d.ps1`、`exp-bootstrap.ps1`，同一台机器，结果在 `exp/out/results-round2*.json`）。job 不带 `KILL_ON_JOB_CLOSE`（与设计相同），结束时按 pid 结束每个进程，`leftRunning` 都为空。一次性「宿主」`exp-host2.cjs` 启动时先派生一个休眠子进程（代表规则行激活之前派生的进程），之后才被收进 job；收到信号后派生一个 4 线程的空转进程；每 20 毫秒记一次自己的定时器延迟。每段测量 3–5 秒。

| 项 | 结果 | 回应 |
| --- | --- | --- |
| 先收进 job（不设限制）、把 job 句柄复制进宿主，再起空转 | 收进、复制都成功；空转 3.95 核 | F1、F2 |
| 设 5% 硬上限（1.6 个处理器）加强制低于正常 | 空转 1.5 核；宿主与空转进程 BelowNormal；收进之前派生的子进程仍是 Normal、不在 job 里；宿主定时器延迟 p95 315.6 毫秒、最大 354.9 毫秒 | F1、F6、F12 |
| 5% 硬上限、宿主正常、空转进程单独降为低于正常 | 空转 1.66 核；宿主定时器延迟 p95 262.1 毫秒、最大 343.8 毫秒 | F12 |
| 人走开：强制 Normal 再清标志，解除上限 | 宿主与空转进程都是 Normal；空转 3.94 核 | F3 |
| 对照：强制低于正常后只清标志 | 宿主与空转进程都停在 BelowNormal | F3 |
| 创建者的句柄关闭、宿主持有复制的句柄 | 按名打开成功，设上限 2500、读回 2500 | F2 |
| 另一个创建者进程收进目标后退出，不复制句柄 | 按名打开失败，错误 2；目标仍在某个 job 里 | F2 |
| 同上，退出前把句柄复制进目标 | 按名打开成功 | F2 |
| 亲和性限制 2 个处理器（掩码 `0xC0000000`）加整个 job 强制低于正常 | 空转 1.96 核；宿主与空转进程的亲和性都是 `0xC0000000`；宿主定时器延迟 p50 29.4、p95 103.0、最大 170.3 毫秒 | F12 |
| 亲和性限制 2 个处理器、宿主正常、空转进程单独降为低于正常 | 空转 1.94 核；宿主定时器延迟 p50 0.4、p95 1.0、最大 1.6 毫秒（没有限制时 p95 1.0 毫秒） | F12，§7.3 采用 |
| 只清亲和性标志 | 亲和性仍是 `0xC0000000`，空转 1.97 核 | F3 的同类 |
| 先把亲和性设为系统的全部处理器（`0xFFFFFFFF`）并强制 Normal，再清标志 | 亲和性 `0xFFFFFFFF`，空转 3.96 核，宿主与空转进程 Normal | F3 |
| 空转进程再被收进一个类似 DSH 运行器的新 job，之后设亲和性限制 | 嵌套成功；它的亲和性 `0xC0000000`，1.98 核；放宽后 3.97 核 | V1 的一部分 |
| job 的进程列表 | 含宿主与嵌套 job 里的空转进程，不含收进之前派生的子进程 | §7.3 的扫描 |
| 引导：`-EncodedCommand` 读脚本正文、核对 SHA-256、作为 ScriptBlock 运行 | 引导 379 个字符，编码后 1012 个字符；正文没改时输出正确、退出码 0；正文被追加一句之后退出码 9、没有运行 | F14 |
| 同上，子进程的执行策略设为 Restricted（只对这个进程） | 引导照常运行，Add-Type 可用，语言模式 FullLanguage；同一份正文用 `-File` 运行被策略拒绝 | §7.4 不再需要 `-ExecutionPolicy Bypass` |

### 7.3 做法：两级

预算的每一档（`Budget`，§4.2）落成两级手段，宿主按能做到的那一级执行，并在行健康与机器状态的 `hosts` 里写明用的是哪一级（`mechanism`）与读回的结果（`readback`）。

优先级一级（M4，没有辅助进程也能做）：

- 人在：`os.setPriority(process.pid, p)`，`p` 由档位的 `priority` 定（`below-normal` 为 `PRIORITY_BELOW_NORMAL`，`idle` 为 `PRIORITY_LOW`）。之后派生的进程继承。
- 人走开：`os.setPriority(process.pid, 0)`。人在时派生、还在跑的进程保持低于正常：人走开之后机器上没有更高优先级的工作和它们抢，它们照样用满 CPU。
- 读回：`os.getPriority(process.pid)` 写进 `readback.hostPriority`，与期望不符时行健康 degraded「优先级没有落实：…」。
- 做不到的：切换那一刻已经在跑的命令不变；没有 CPU 上限。面板的预算一节写「已经在跑的命令不受影响，CPU 上限要辅助进程（M7）」。

job 一级（M7，要辅助进程，D4 的「人在」一档带 `cpuPercent` 时用；不带时，例如 D4 的宽档，只用优先级一级，不收进 job）：

- 收进（评审 F1、F2）：规则行激活后，辅助进程 `ping` 通、且 `budgets.present.cpuPercent` 有值，就立刻 `attach`，不等人第一次点在场：建命名 job `Local\glm-hourness-budget-<宿主 pid>-<宿主启动毫秒>`（不带 `KILL_ON_JOB_CLOSE`、不设任何限制与内存上限、不设脱离标志）；先用 `DuplicateHandle` 把 job 句柄复制进宿主进程（`DUPLICATE_SAME_ACCESS`），复制失败就关掉 job（这时 job 里还没有进程，句柄一关它就消失），本宿主停在优先级一级，行健康 degraded「CPU 上限不可用：句柄复制失败（错误 N）」；复制成功才把宿主收进 job。之后宿主一生都持有这个句柄，job 的名字随之一直在，辅助进程死了也能按名重开。`hosts` 记下 job 名与 `dupInHost`。人在 D4 里后来才给「人在」一档加上 CPU 上限时，在那一刻收进；那之前派生的进程同样在 job 之外。
- 人在：k = max(1, ⌈n × `cpuPercent` / 100⌉)，n 为系统亲和性掩码里的处理器数；掩码取编号最高的 k 个处理器。所有宿主用同一个函数，所以本机所有宿主的进程树合计至多用这 k 个处理器（评审 F16）。辅助进程 `limits`：信息类 9，`LimitFlags = JOB_OBJECT_LIMIT_AFFINITY`、`Affinity` 为这个掩码，不设优先级类；宿主保持正常优先级（`os.setPriority(process.pid, 0)`）。随后 `sweep`：读 job 的进程列表（信息类 3），把宿主与辅助进程自己以外的每个进程设为档位的优先级（低于正常或空闲；已经更低的不动；辅助进程在收进之前就起来了，通常本来就在 job 外，重启后的才在 job 里）；每 2 秒一次，另在每次放行命令文本类调用之后 0.3 秒与 1.5 秒各一次。每 15 秒与每次档位切换时另取一次 Toolhelp 快照，找出宿主不在 job 里的后代（规则行激活之前派生的，例如启动时的 MCP 服务器；按父 pid 找，子进程的启动时刻要晚于父进程，防 pid 复用；不含辅助进程自己与它的 `conhost`），同样降优先级，个数写进 `readback.outside`。恢复名单（评审 F27）：`sweep` 的应答列出这次降过的每个 job 外进程 `{pid, startedAt, prior}`（`prior` 是降之前的优先级类，已经低于或等于目标的不降、不列）；名单的主人是宿主进程（Node），它按 `(pid, startedAt)` 合并进内存里的名单，已在名单里的保留原来的 `prior`，名单变化时随 `host-level` 写进 `hosts` 的 `outsideLowered` 留痕。辅助进程只是执行者，它重启不丢名单；重启后的辅助进程看到这些进程已经是低于正常，不会再列它们，也不影响宿主名单里的 `prior`。
- 人走开与行卸载（评审 F3）：先以 `LimitFlags = JOB_OBJECT_LIMIT_AFFINITY | JOB_OBJECT_LIMIT_PRIORITY_CLASS`、`Affinity` 为系统的全部处理器、`PriorityClass = NORMAL_PRIORITY_CLASS`（0x20）设一次，让 job 里全部进程回到全部处理器与 Normal；再以 `LimitFlags = 0` 设一次清掉限制；宿主把恢复名单交给辅助进程（`sweep` 的 `restore`），名单上 pid 与启动时刻都还对得上的进程设回各自的 `prior`，已经退出的从名单去掉，设不回的（拒绝访问等）个数写进 `hosts` 的 `outsideNotRestored`，大于 0 时行健康 degraded「N 个规则行激活之前派生的进程没能恢复优先级」并在面板上列出它们的 pid；`os.setPriority(process.pid, 0)`。只清标志不够：亲和性与优先级都会停在被限的值上（§7.2 第 2 轮的对照）。
- 读回：每次切换之后，辅助进程 `readback` 给出宿主的优先级类、宿主的亲和性处理器数、job 里处于期望优先级的进程数、job 外后代数，写进 `hosts`；与期望不符（例如人走开之后宿主仍是 BelowNormal，或亲和性没放开）时行健康 degraded 并写明哪一项。
- 代价：每 2 秒一次进程列表查询与少量 `SetPriorityClass`；Toolhelp 快照每 15 秒一次。都在辅助进程里，不占宿主的事件循环。

档位由有效的在场决定：在为「人在」一档，不在为「不在」一档；在场未知（没有人手设，检测器在影子期或不可用）时按「不在」一档执行，在场按钮写「不知道你在不在」（D2）。档位变化时，每个宿主在 10 秒内（状态文件变化时立即，另有每 5 秒的兜底）按新档执行。CPU 上限压的是整个 DSH 宿主进程树：所有项目、所有会话，包括宿主自己与命令检查。宿主自己保持正常优先级、它的后代低于正常，所以在被限的 k 个处理器上宿主先跑：限制打满时宿主的定时器延迟 p95 1.0 毫秒（§7.2 第 2 轮）；真实宿主上同样的量法放进 R9 的 L3（§15）。

CPU 上限用哪种机制，三种做法（推荐项在最后）：

1. CPU 硬上限（0.1 的做法）：按百分比设，粒度细。代价：份额用完时 job 里全部线程连同宿主一起停到下一个调度区间，本机量到宿主成批停顿 p95 262–316 毫秒，与宿主的优先级无关。
2. 亲和性限制加整个 job 强制低于正常：不用逐个进程设优先级，实现最简单。代价：宿主与它的后代同级，在被限的处理器上和构建平分时间，宿主定时器延迟 p95 103 毫秒。
3. 亲和性限制，宿主保持正常，辅助进程逐个把后代降为低于正常（推荐，本设计采用）：宿主不被自己的构建拖住（p95 1.0 毫秒），已经在跑的命令同样被限。代价：上限以整个处理器计；两次扫描之间新起的进程以正常优先级运行至多 2 秒，这段时间里它和宿主在被限的处理器上同级；辅助进程要多一个 `sweep`。

选编号最高的处理器：编号低的处理器上通常有更多的系统中断与延迟过程调用〔推断，本机没有量〕，人的前台工作在全部处理器上，LLM 的进程挤在编号最高的几个上。混合架构（性能核加能效核）的机器上编号最高的往往是能效核〔未核实，本机没有查拓扑〕，这对「人在用电脑」是想要的效果；以后需要时可以按 `GetLogicalProcessorInformationEx` 选，不改其余设计。

为什么把宿主进程整个放进 job，而不是每条命令一个 job，两种做法（推荐项在最后）：

1. 每条命令一个 job：上限可以按命令、按项目分。做不到：DSH 不给出它派生进程的 pid（`dsh-subprocess/README.md`「Starting a managed process」：目标与受管范围的身份由提供方私有），只能事后按进程表去找，派生与收进 job 之间有空隙，空隙里派生的子进程漏掉。
2. 宿主进程整个放进一个命名 job（推荐，本设计采用）：激活时收进，之后派生的一切都在里面，上限是合计的、随时能改；句柄复制进宿主，辅助进程崩溃后能按名重开接着管。代价是宿主一生都在这个 job 里（没有限制时它只是记账），上限按宿主而不是按项目，规则行激活之前派生的进程不在里面。

### 7.4 辅助进程

- 是什么：一段 Windows PowerShell 5.1 脚本，正文在 `src/rules/helper/script.ts` 里以字符串常量保存，写成 `<userHome>/rules/helper-<内容 SHA-256 前 8 位>.ps1`。正文里用 Add-Type 定义与试验相同的 P/Invoke 类（`exp/exp-glmhjob2.cs` 的成员）。
- 启动与核对（评审 F14）：每次启动之前，Node 读这个文件、算 SHA-256，与常量的摘要不符（或文件不在）就重写（临时文件加改名）。然后 `child_process.spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', <引导>], {windowsHide: true})`。引导是一小段固定的脚本（UTF-16LE 加 Base64，试验里编码后约 1000 个字符，远小于命令行的 32767 字符上限），里面写着正文的路径、正文的 SHA-256 与宿主 pid：读正文、算 SHA-256，不符就以退出码 9 结束，否则 `& ([ScriptBlock]::Create($正文))` 运行它。所以执行的正是核对过的那段文字，Node 核对与执行之间的空隙也被引导的核对兜住。不再需要 `-ExecutionPolicy Bypass`：执行策略管的是脚本文件，本机试验里子进程策略为 Restricted 时引导照常运行、`-File` 被拒（§7.2 第 2 轮）。退出码 9 时 Node 重写正文再起一次；仍是 9 就不再起，行健康 degraded「辅助进程脚本被改过，没有运行」。
- 协议：标准输入输出上一行一个 JSON。请求 `{id, op, …}`，应答 `{id, ok, …}`。每个请求 5 秒内要应答，连续 3 次超时就结束并重启它。

| 操作 | 输入 | 作用与应答 |
| --- | --- | --- |
| `ping` | 无 | `{ok, psVersion, languageMode}`；语言模式不是 `FullLanguage` 时 `ok: false` |
| `idle` | 无 | 输入空闲毫秒、前台 pid 与进程名 |
| `processes` | `{names}` | 按名字的进程在不在 |
| `procStart` | `{pid}` | 进程的启动时刻（防 pid 复用） |
| `attach` | `{name}` | 先按名打开；打不开（错误 2）时：`hosts` 没有记过本宿主收进过 job 就新建、复制句柄进宿主、收进宿主，返回 `{created: true, dupInHost}`；记过就不新建，返回 `{orphaned: true}`（§11.2）；`IsProcessInJob(宿主, job)` 为真才算成功 |
| `limits` | `{affinity: <处理器数> \| 'all', restoreNormal: boolean}` | 处理器数时设亲和性限制（§7.3）；`all` 时按 §7.3「人走开」的两次设置，`restoreNormal` 为真时第一次带强制 Normal |
| `sweep` | `{priority: 'below-normal' \| 'idle' \| 'normal', outside: boolean, restore?: [{pid, startedAt, prior}]}` | 按 job 的进程列表降或恢复宿主以外的进程；`outside` 为真时另取 Toolhelp 快照，把 job 外的后代降到 `priority`（只降，不升）；`restore` 给出时把名单上身份对得上的进程设回 `prior`。返回 `{lowered, outside, outsideLowered: [{pid, startedAt, prior}], restored, notRestored: [pid]}` |
| `readback` | 无 | 宿主的优先级类与亲和性处理器数、job 里处于各优先级的进程数、job 外后代数 |
| `accounting` | 无 | job 的 CPU 时间与活动进程数 |

- 生命：规则行激活时启动（D4 的「人在」一档带 CPU 上限、在场检测器或进程触发要运行时），每个宿主一个；收进 job 要在激活时做（§7.3），所以带 CPU 上限的预算让辅助进程常驻。行卸载时先按「人走开」一档恢复（`limits all` 加 `restoreNormal`、`sweep normal` 带 `restore` 名单），再结束辅助进程。辅助进程意外退出时按 1、5、30 秒，之后每 5 分钟重启；重启后 `attach` 按名重开（宿主持有复制的句柄，名字还在），按当前档位重设 `limits` 并 `sweep`；恢复名单在宿主里，不随辅助进程丢失（§7.3）。
- 辅助进程不在的这段时间：job 的限制停在最后设的值（job 还在，宿主还在里面），扫描停了，新起的命令以正常优先级在被限的处理器上运行。行健康 degraded「辅助进程不在：CPU 上限停在 <档位>，新起的命令没有降优先级」；重启成功后恢复。
- 降级：`powershell.exe` 不在、被组策略禁止，或语言模式不是 `FullLanguage`（AppLocker、WDAC 下常见，Add-Type 不可用）时，`ping` 失败：预算退到优先级一级，在场检测、桌面版前台检测与进程触发不可用（信号未知），行健康写明。规则行激活时 `ping` 不通，宿主就不收进 job，之后辅助进程起来了也只在那一刻收进，之前派生的进程留在 job 外（计入 `outside`）。

辅助进程的做法（推荐项在最后）：

1. 经 DSH 的 `ctx.subprocess.spawn`：DSH 的能力接缝，有管道。代价：它把辅助进程放进运行器的 job、不给 pid；辅助进程不是 agent 的工作，用不上这个接缝的输出与生命管理。
2. 引用桌面版安装里的 `@deepseek-ai/dsh-win32-process` 或 koffi：已有绑定。代价：它不是给第三方的契约（README「No public process service」），从本仓库也解析不到运行时包（`docs/DESIGN.md` §2.4、§5.6），桌面版升级可能改掉它。
3. 编译一个小的 C# 可执行文件（本机有 `csc.exe`）：启动快。代价：要构建、要分发一个二进制，多一道审核。
4. Node 子进程加 Windows PowerShell 5.1 的 Add-Type（推荐，本设计采用）：Windows 自带，不加依赖；试验里编译 222 毫秒，常驻一个进程摊掉。

### 7.5 做不到的

- 改写或包装 agent 要执行的命令：`tools/pre-execute` 只能放行、拒绝、询问、取消，参数被深冻结（§6.1）。所以「给这条命令加上低优先级前缀」做不到，只能管整个宿主进程树。
- 拿到 DSH 为某次工具调用派生的进程的 pid：提供方私有（§7.3）。所以没有按命令的上限，也不能精确地量一条命令用了多少资源。
- 在不危及 DSH 宿主的前提下给内存设硬上限：job 的内存上限把宿主算在里面，宿主分配失败就是 DSH 崩溃。内存靠两件事管：重活排队（人在电脑前时不起新的重活），以及 `free-memory-mib` 信号（人可以写「可用内存低于 8 GiB 时重活排队」）。
- 管 DSH 以外的进程：Kiro 里跑的构建、人自己终端里的命令都不在宿主进程树里。命令行（§9.5）能让它们自查，但不能限速它们。
- 规则行激活之前宿主已经派生的进程（例如启动时的 MCP 服务器、早于规则行激活的其他行起的进程）的 CPU（评审 F1）：Windows 不把已有的子进程随父进程收进 job（§7.2 第 2 轮）。job 一级只能降它们的优先级，个数写在行健康与面板上「N 个进程在上限之外（规则行激活之前派生）」；这个数在桌面版上有多大没有量过〔未核实，§15 V10，R9 的 L4 读面板上的数〕。
- 优先级一级下切换那一刻已经在跑的命令：不变（要辅助进程才能逐个改）。
- 精确到百分比的 CPU 上限：亲和性限制以整个处理器计（§7.1）；硬上限能做到，但会让宿主成批停顿（§7.3）。
- 多于 64 个逻辑处理器的机器：亲和性掩码只覆盖一个处理器组，这种机器上不设 CPU 上限，退到逐个降优先级，行健康写明〔没有这样的机器可试〕。
- 进程自己调高优先级：两次扫描之间做得到，下一次扫描再降；job 里的进程放宽不了亲和性〔文档语义〕。
- 人走开时强制回 Normal：job 里自己设了别的优先级类的进程（例如自己设为空闲的后台工具）也被改成 Normal。job 外的后代按恢复名单回到各自降之前的优先级类（§7.3）。
- `run_code` 程序里的子调用（`ptc` 呈现模式下的全部调用）不在调用处等：`holdMs` 对它们按 0，照常开单与唤醒（§6.2 第 1 步）；程序收到的是错误，程序自己怎么处理这个错误由 agent 写的代码决定。
- 防有意伪造的规则文件写入：流水的摘要核对只防看不见的追加与误改（§2.5、§4.5）；会照着算摘要的写入者能写出通过核对的记录，这种写法留在会话日志的命令文本里。
- 磁盘读写、GPU 与网络带宽：本设计不管。
- 确定人在不在：空闲时间与前台窗口都只是近似（看视频、远程桌面）。所以在场检测先影子运行，人手值总是赢。
- 按命令文本匹配的规则（例如不碰生产机）：换个写法（变量、别名、脚本文件）就看不见；网络连接本身看不到。面板上这类规则标「按命令文本匹配」。

### 7.6 什么算重活

三种做法（推荐项在最后）：

1. agent 自己声明：最省事。代价：agent 不能写规则（人定），`pwsh` 的参数表也加不了字段。
2. 只按实测：限速已经管着在跑的命令。代价：测量只能在命令跑起来之后，做不到「人在电脑前时先不开始」。
3. 人声明，系统学习只给建议（推荐，本设计采用）：
   - 声明：项目状态的 `heavy.patterns`，命令文本的正则，只有人设（面板上「标为重活」，或从 agent 的提议里点「设为生效」）。
   - 学习：宿主记下每次 shell 调用的用时（M4 起）；M7 起辅助进程在、且这次调用期间宿主里没有别的 shell 调用在跑时，另记宿主 job 的 CPU 时间增量（`accounting`）。按签名（命令的前两个词，第二个词是 `run` 或解释器时加第三个词，例 `npm run build`、`node scripts/x.mjs`、`cargo build`）汇总到 `heavy-stats.json`：次数、CPU 秒与用时的中位数、最近一次。至少 3 次、CPU 中位数不少于 120 秒或用时中位数不少于 300 秒的签名列为「看起来是重活」，只在面板上显示，带一键「标为重活」；从不自动生效（规则只由人写）。

## 8. 租约与崩溃安全

### 8.1 操作

| 操作 | 谁 | 结果 |
| --- | --- | --- |
| 取得 `acquire(resource, holder, purpose, ttlMs)` | 人（面板）、执行边界（会话）、脚本与命令行（进程或外部）、检测器运行者（`host`，宿主代码以 `harness` 取） | 空闲、已过期或占用者已死：取得；占用者是自己：续租；否则 `conflict`，带占用者、用途、起始与到期。进程与外部占用者另得到一个随机 `token`（128 位，十六进制），状态里只存它的 SHA-256 前 16 位（评审 F8） |
| 续租 `renew` | 占用者 | 到期时间往后推；进程与外部占用者要带 `token`，摘要不符返回 `forbidden` |
| 释放 `release` | 占用者 | 资源空闲，按 §6.3 保留给排在最前的等待单；进程与外部占用者同样要带 `token` |
| 收回 `break` | 人 | 任何占用者，写明理由 |
| 回收 `reclaim` | harness | 只在证明占用者已死时（§8.2），证据写进流水 |

### 8.2 占用者与死活

| 占用者 | 怎样取得 | 怎样判断它还活着 | 默认期限 |
| --- | --- | --- | --- |
| 人 | 面板「我在用桌面版」、`/rules hold desktop` | 只看期限 | 2 小时，可延长；人解除 |
| 会话 | 执行边界在调用用资源时替会话取得 | 拥有它的宿主活着（心跳文件 45 秒内更新过，或 pid 在且启动时刻相同）且会话没有结束；拥有它的宿主自己用 `agents.get` 与 `session/disposed` 判断 | 60 分钟，每次用资源时续到 60 分钟之后；会话 30 分钟没用这个资源就释放 |
| 进程 | 脚本、`npm run -s rules -- lease acquire --pid` | pid 在且启动时刻相同（辅助进程的 `procStart`；没有辅助进程时只看 pid 在，并要求每 60 秒续租） | 2 小时 |
| 外部 | 命令行，不给 pid（例如 Kiro 的一次运行） | 只看期限 | 必填，至多 8 小时；`renew` 续 |
| 宿主（`Holder` 的 `host`，检测器运行者） | 宿主代码以 `harness` 身份取，占用者 `{kind: 'host', host, label}` | 心跳文件 `hosts/<pid>-<启动毫秒>.json` 45 秒内更新过；心跳过期而 pid 仍在且启动时刻相同时（宿主卡住）同样判为已死，免得一个卡住的宿主一直占着运行者 | 24 小时，宿主每 12 小时续一次；死活只看心跳文件，心跳本身不进流水（§5.1） |

pid 在不在用 `process.kill(pid, 0)`（不发信号，只查存在）。开机时刻不同（§4.6）时，会话、进程、宿主与带 pid 的占用者当场失效；人与外部占用者按期限走。回收（`lease-reclaim`）的证据写进记录的 `evidence`，失效写成 `changes` 里对 `['leases', <资源>]` 的删除，重放不再判断死活（§4.4 第 4 步）。

### 8.3 内置资源

| 资源 | 使用模式（判为「用资源」的调用） | 取得方式 | 附带的提醒 |
| --- | --- | --- | --- |
| `dsh-desktop` | 工具 `plugin_manager`（`dsh-plugin-manager/lib/types/tools.js`:75）；命令文本 `restart\.ps1`、`DeepSeek Harness\.exe`、`--remote-debugging-port`、`\bcdp\.mjs\b`、`Stop-Process\b.*DeepSeek Harness` | 执行边界 | 模型选择器的提醒（§6.4） |
| `dsh-profile:<名字>` | 命令文本 `\bnpm\s+run\s+(probe\|calibrate)\b`，名字取同一条命令里对 `DSH_SANDBOX_PROFILE` 的赋值（例 `$env:DSH_SANDBOX_PROFILE='x'; npm run probe`），没有即 `glmsandbox`；判断不准时以脚本自己取的租约为准（§6.6） | 脚本（§6.6） | 无 |
| `detector-runner:machine`、`detector-runner:<项目键>` | 无（只供检测器运行者用） | 宿主 | 无 |

项目可以由人声明自己的独占资源（例如 `staging-db`），写使用模式与取得方式，存在项目状态里。

桌面版里的 agent 不会在自己的会话里驱动桌面版（那等于重启自己）；驱动桌面版做 L4 的是 Kiro 里的 agent（`docs/HANDOFF.md` §6「桌面版自验」）。它们的重启脚本在 `.agents/` 下、不入库，所以这一边靠命令行：重启之前 `lease acquire dsh-desktop --label "kiro <运行>" --ttl 90m`，把输出里的 `token` 记进这次运行的状态文件；被占着就停下等或交人；结束后 `lease release dsh-desktop --token <token>`。别的运行没有这个 token，释放不了它。运行的状态文件丢了（2026-10-29 蓝屏后的情形）时 token 随之丢失：租约到期自动失效，人也可以在面板上立即收回。这是约定加命令行，不是强制（§9.6）。

### 8.4 崩溃之后

蓝屏、宿主崩溃、辅助进程崩溃、写锁残留、占用者丢失各自怎样被发现、之后怎样，统一写在 §11.2 的故障预案里。

## 9. 面板、命令与工具

### 9.1 输入框旁的在场按钮

编排层客户端包 `dsh-hourness-ui` 在槽 `conversation.composer.dock`（与 GLM 按钮同一个槽，`ui/src/channel.js`:350）注册一个按钮，写当前的在场与等待单数：「你在 · 2 单在等」「你走开了」「不知道你在不在」。点开是一个小菜单：「我在用电脑」「我走开了」「交给自动判断」（检测器放开之后才出现）、「桌面版：我在用（2 小时）」或「桌面版：释放」、「打开规则」。每一项执行一次 `/rules-apply`，会话里留一行结果（例「已设为：你在用电脑（到 22:10）」）。M3 的 D1 要求输入框附近有 `/wish` 的提示（M3 §15），两者在同一个槽里按 `order` 排开，实现时一起排版。

### 9.2 「规则」视图

项目图页签加第五个视图「规则」（现有四个：需要你、agent 定的、正在做、图，`docs/ORCHESTRATION.md` §2.10）：

- 信号：每个信号一行，写值、来源（你设的、检测器、宿主算的）、起始时刻、到期、是否影子；读不出的写原因。检测器一节列出每个检测器的触发、最近一次运行与结果、影子期的统计，以及「放开」「改为影子」「删除」。
- 租约：每个资源一行：空闲，或占用者、用途、起始、到期；人可以「收回」。
- 预算：两档的数字（CPU 上限同时写成「最多 8 个逻辑处理器（共 32 个）」）、每个宿主现在用的是哪一档、哪一级手段（优先级或 job）与读回的结果（宿主优先级、处理器数、已降优先级的后代数）；有规则行激活之前派生、在上限之外的进程时写「N 个进程在上限之外（规则行激活之前派生）」；档位没有落实时写原因；「改数字」。
- 生效的规则：分三组。你设的（每条写执行方式、条件此刻是否成立、范围、起始、期限、最近 7 天命中次数，「解除」「改」「删除」；一直不命中的规则让人看出它可能写错了）；内置（规则板自己的，标「在代码里」）；其他行的（guard 的两条、图文件门禁、M3 的两条、GLM 高峰提醒，写明在哪一行、那一行的行健康是否生效，只读）。只告知的规则标「只告知，harness 不检查」；按命令文本匹配的标「按命令文本匹配，换写法看不见」。
- 提议：agent 的规则与检测器提议，写提议者、理由、内容与对应的待决（人在「需要你」里拍板，§9.4）；图不可用时在这里点「设为生效」「驳回」。
- 在等的工作：每张等待单一行：会话与 agent、调用的摘要、因为哪条规则、从何时起、状态；「放行这一次」「取消」。等待单的会话在这个面板的会话树里时，另写它的焦点节点（读 `graphLive`）。
- 新规则：几个模板（「这个项目的重活命令」「某个时段不推送」「开关打开时不改某个目录」「只告知的一句话」）与一个表单（范围、条件、主体、动作、执行方式、期限、理由）；表单只给出词汇里的选项，写不成词汇的只能存为只告知。
- 恢复：机器或项目状态在流水上重建过时，视图顶上用 §4.5 表里那一种情形的说法写出时刻与原因；没有生效的流水记录（`unresolved`）逐条列出序号、在第几条之后、写入身份、操作、目标与原因，同一处断开之后连续的行归成一组，每条或每组有「按记录生效」「忽略」（§4.5 第 7 步）；图上拍了 `set`、规则板却没有对应提议的待决也列在这里（§9.4）。

读：投影 `hournessRules` 的 `init(header)` 算出这个会话对应的两个状态文件与心跳文件所在的绝对路径（`{machineFile, projectFile, hostsDir, projectKey}`，session-projection:67–91），面板经 `remote.workspaceFiles.readBytes` 按绝对路径读，经 `changes` 监视这两个文件（文件的监视按文件读的权限，`dsh-api-workspace-files/README.md`:40、58），并读检测器运行者的心跳文件（路径由 `detector-runner:*` 租约的占用者算出）。改名替换文件之后监视能否接着报变化没有核对，所以视图可见时另每 15 秒按大小与修改时间重读一次〔未核实，§15 L4〕。面板只读不写文件。

写：一律经 `/rules-apply`（下一节），身份为人。

位置：面板的整体组织正在由 `m8-plain-language` 重新设计（按三问组织首页，人在面板上的操作只有五键加开关规则）。本节定的是规则板要呈现什么、写入走哪条路；放在哪个位置随那份设计。在它定稿之前，最小版按第五个视图实现；那份设计里的「开关规则」就是这里的设、改、解除与在场按钮。

### 9.3 命令

| 命令 | 谁用 | 输入 | 说明 |
| --- | --- | --- | --- |
| `/rules-apply` | 面板 | 一个写入请求的 JSON | `recordInput: false`（同 `/graph-apply`：流水已记下这次写入，会话里只显示一行结果）；身份为人；拒绝时写人能照着做的中文 |
| `/rules` | 人在输入框里敲 | `present [时长]`、`away [时长]`、`auto`、`hold desktop [时长] [用途]`、`release desktop`、`lift <规则 id>`、`let <单号>`（放行这一次）、`show` | `recordInput` 默认，命令事件记下人敲的几个词；身份为人；`input.hint` 写这几种用法。人的 `release desktop` 只释放人自己的租约，收回别人的走面板的「收回」（`lease-break`） |

写入请求的操作（`apply` 的 `op`），按 §2.5 的表核对身份：

| 类 | 操作 |
| --- | --- |
| 规则 | `rule-set`（新建，或带 `rev` 修改）、`rule-lift`、`rule-delete`、`propose`（只有 `llm`，`kind` 为 `rule`、`lift`、`detector`、`heavy`）、`proposal-accept`、`proposal-reject` |
| 恢复 | `recovery-accept`、`recovery-dismiss`（只有人，一次一条或一组，§4.5 第 7 步） |
| 检测器 | `detector-set`、`detector-delete`、`detector-mode` |
| 信号 | `signal-manual`、`signal-clear`、`signal-detected`（只有 `detector`，且只能写它自己的信号） |
| 预算与重活 | `budgets-set`、`heavy-set` |
| 租约 | `lease-acquire`、`lease-renew`、`lease-release`（进程与外部占用者带 `token`）、`lease-break`（只有人）、`lease-reclaim`（只有 `harness`，带证据） |
| 等待单 | `ticket-open`、`ticket-update`、`ticket-handover`（只有 `harness`）、`ticket-let-once`、`ticket-cancel`（只有人） |
| 宿主档位 | `host-level`（只有 `harness`：档位、手段、读回的结果、job 名，§7.3） |

两个命令的 `definitionId` 为 `dsh-glm-hourness/rules` 与 `dsh-glm-hourness/rules-apply`，与本项目其他命令同一前缀（split 0.3 §3.3）。

### 9.4 给 agent 的工具

| 工具 | 输入 | 输出 |
| --- | --- | --- |
| `rules_show` | 无 | 对调用方生效的规则（含只告知的）、它的等待单与租约、信号的有效值与来源、机器的档位；与每步提醒同一份内容，不截断 |
| `rules_propose` | `{kind: 'rule' \| 'lift' \| 'detector' \| 'heavy', body, summary, reason, ifSet, ifSkip, why, counter?}`：`body` 是 `rule-set`、`detector-set` 或 `heavy-set` 的内容，`lift` 时为 `{id}`（一条生效的规则）；`summary` 是待决的题目，一句话；`ifSet`、`ifSkip` 是两个选项各自的效果（得到什么、代价是什么），一行；`why` 是为什么推荐设，一行；`counter` 可选，一行反方（双向门不要求，`d-counter-line`） | 提议的 id 与图上待决的 id；提议不生效，人拍板之后才生效；内容不合词汇、`lift` 的规则不存在或不在生效、卡片字段超长时直接返回 `invalid` 与字段路径；图引擎拒绝待决时原样返回它的错误与字段路径，什么都不记 |

两个工具在 GLM 路由上延迟加载，不进常驻名单（`ORCHESTRATION_RESIDENT_TOOLS`，split 0.3 §2.6）：规则经每步提醒到达 agent，工具很少用。名字登记在 `src/shared/tool-names.ts` 的新常量 `RULES_TOOL_NAMES`，契约测试核对规则行注册的名字与它相等。没有写规则的工具（§2.5）。

提议怎样到人面前。`d-rules-human-only` 写明 agent 的提议「只能经图上的待决提给人，人设了才生效」，所以 `rules_propose` 既提图上的待决、也记规则板的提议，按下面三步、顺序固定（评审 F23）：

1. 校验：`body` 按 §2.3 的词汇与 §12 整份校验，卡片字段按下表与图引擎的上限校验；不合返回 `invalid` 与字段路径，什么都不写。分配提议 id `p-<8 位十六进制>`。
2. 先提待决：经图引擎以 `llm` 身份在焦点节点下（没有焦点时在目标下）提一张决定者为人的待决。图引擎拒绝（字段不合、焦点不存在、图不可写）时规则板什么都不记，工具结果原样返回引擎的错误码、信息与字段路径（例如 `invalid`、`node.options[0].label`），agent 按它改了再提。
3. 待决提成功之后才记提议：在项目状态的 `proposals` 里记一条 `open` 的提议，带完整的规则、检测器、重活声明或解除，以及这张待决的 id。这一步取不到锁（`busy`）或写不进（`io`）时重试一次；仍失败，工具结果写明「图上的待决 `<id>` 已提出，规则板没有记下提议，拍板不会生效」，并以 `llm` 身份在这张待决上加一条批注说同样的话（批注也失败时只在工具结果里）。之后人拍这张待决时由下面的「发现与恢复」接住。

待决的字段（图引擎的卡片字段，`d-option-card`、`d-counter-line`；字段与上限按 `de0ccf6` 的 `CARD_LIMITS`：`label` 20、`consequence` 120、`why` 200、`counter` 200 个码点，都是一行）：

| 字段 | 内容 |
| --- | --- |
| `title` | 提议的 `summary` |
| `body` | 理由 `reason`，加规则板生成的一段人话说明（条件、对谁、动作、执行方式、期限），末行「规则板提议 `<提议 id>`」 |
| `options` | 两项，推荐项在最后（图引擎按 `d-recommend-last` 核对，`44e8601`）：先 `skip`，后 `set`。`label` 由规则板按种类给定，不由 agent 写：`rule` 为「不设这条规则」「设为生效」，`lift` 为「保留这条规则」「解除这条规则」，`detector` 为「不加这个检测器」「加上，先影子运行」，`heavy` 为「不标为重活」「标为重活」（都不超过 20 个码点，L2 用例核对）；`consequence` 取 agent 写的 `ifSkip`、`ifSet` |
| `recommend` | `set` |
| `why` | agent 写的 `why` |
| `weight` | `two-way`：规则、检测器与重活声明都能随时由人解除或删除，没有单向门 |
| `counter` | agent 给了才写（双向门不要求，`d-counter-line`） |
| `decider` | `human` |

`why`、`weight`、`counter` 三个字段要等图引擎的卡片改动合入 main 才有（今天停在 `m3-base-card` 的 `de0ccf6`）。规则板只经一个函数 `proposalQuestion(proposal)`（`src/rules/proposal.ts`）组这张待决：实现时 main 上的图引擎没有这三个字段就不写它们；表格版卡片定稿时如果最后一行改成「取决于」，也只改这个函数与 `rules_propose` 的输入。L2 契约测试把它组出的待决交给真实的图引擎（临时目录）提一次，必须被接受。

人在「需要你」里拍板，与其他待决一样一次点击；人在对话里说了，agent 带人的原话经 `graph_decide` 拍同一张待决，效果相同（§2.5 转述）：

- 拍 `set`：面板的 `/graph-apply` 与图工具的 `graph_decide`（带转述时）在拍板成功之后调用规则板服务的 `acceptProposal(questionId, {actor, relay?})`，规则板以人的身份按提议写出生效的规则、检测器、重活声明或解除（`origin.proposedBy` 记提议者，`source` 记这张待决），提议转 `accepted`，同一次写入。拍 `skip`：提议转 `rejected`。
- 发现与恢复：拍板写在图上、规则板没跟上（规则行当时没加载，或两次写入之间进程退出）时，规则行每次读项目状态都对照 `open` 的提议引用的待决：已拍 `set` 的，按提议写出，流水写「按图上 `<id>` 的拍板补写」；已拍 `skip` 的补记驳回。补写的身份是 `harness`，引擎先读那张待决的历史，核对最后一次拍板的身份是 `human` 或带转述的 `llm`、选项是 `set`，才写；`origin` 记那次拍板的人与原话。所以图是人拍板的事实源，规则板只是执行它，「只有人能写规则」照样成立。
- 待决有、提议没有（上面第 3 步写失败）：`acceptProposal` 按待决正文末行的提议 id 找不到提议，返回 `missing`；`/graph-apply` 与 `graph_decide` 的结果里多一行「规则板没有这条提议的内容，规则没有生效；要的话让 agent 重新提议，或在规则视图里新建」；规则视图「恢复」一节在拍板之后 7 天内列出这张待决，行健康在拍板之后 24 小时内 degraded「图上待决 `<id>` 没有对应的规则板提议」（两者都在读状态时对照图算出，不另存状态）。待决的正文只有人话说明，不足以无损地写出规则，所以停下交人，不猜。

另两种做法（推荐项在最后）：

1. 只记在规则板里，人在规则视图里点「设为生效」：一个引擎、一次写入。代价：与 `d-rules-human-only` 写的「经图上的待决」不符，人要多看一个地方。
2. 只提图上的待决，不在规则板里存提议：代价：拍板之后没有现成的规则可写，人还得再去规则视图里照着填一遍。
3. 两边各记一份，图上拍板、规则板照办（推荐，本设计采用）：人只在「需要你」里点一次，图上的拍板是事实源，规则板按它补写，进程中途退出也能补上。

图行不在或会话没有图目录时，`rules_propose` 只在规则板里记提议，工具结果写明「图不可用，提议只在规则视图里，人要在那里点」；规则视图里的提议同样有「设为生效」「驳回」（身份为人）。

### 9.5 命令行

`npm run -s rules -- <命令>`（`scripts/rules/cli.mjs`，经 `--experimental-strip-types` 跑 `src/rules/cli.ts`，同项目图的命令行，`docs/DEVELOPMENT.md` §12）。身份固定为 `llm`，所以它不能写规则。JSON 进、JSON 出；退出码 0 成功（`check` 为放行）、1 引擎拒绝、2 用法错误、4 判为拦截、5 判为排队。

| 命令 | 作用 |
| --- | --- |
| `show [--project <目录>]` | 机器与项目的状态，与 `rules_show` 同一份内容 |
| `check --tool <名字> --args <文件> [--project <目录>] [--session <id>]` | 对一个假设的调用判定，输出执行方式、规则与拒绝文字；用 `judge` 本身 |
| `lease acquire <资源> --label <文字> --ttl <时长> [--pid <pid>]`、`lease renew <资源> --token <token>`、`lease release <资源> --token <token>` | 外部或进程占用者的租约；`acquire` 的输出带 `token`，只出现这一次，调用方自己保存 |
| `propose --file <请求文件>` | 同 `rules_propose` |

用户级目录按 `userDataHome()` 解析（显式 `--dsh-home` > `$DSH_HOME` > `~/.dsh`）。试写时用 `--dsh-home` 指向临时目录，同项目图命令行的 `--dir`。

### 9.6 可选：给 Kiro 用

本仓库开发时，Kiro 里的 agent 会重启桌面版、跑探针。探针已经经脚本取租约（§6.6），不用另做。桌面版一边，可以在 `.kiro/hooks/`（不入库，`docs/CHARTER.md` §7.1 条款 10）放一个 `PreToolUse` hook，用本仓库已有的 `agent` 型写法提醒 Kiro 的 agent：驱动桌面版之前先跑 `npm run -s rules -- lease acquire dsh-desktop …`，退出码非 0 就停下。Kiro 能否用命令型 hook 按退出码直接拦下调用没有核对〔未核实〕；能的话，`check` 的退出码就是给它准备的。这一节是可选的，不进任何一步的验收。

## 10. 与现有部分的关系

### 10.1 guard 与其他行的规则

guard 的两条规则、图文件门禁与 M3 的两条写入规则都留在原处（D5）：它们经过了独立评审与 L3、L4，搬进规则板的数据格式没有收益，只有回归风险。规则板只列出它们：`src/rules/builtin.ts` 里有一张只读的目录（规则 id、标题、在哪一行、执行方式），面板按 `glmHournessHealth/<行>` 读那一行的行健康，写「生效」或「未加载」。契约测试核对目录里的 id 与各行实际的规则 id 一致（`src/guard/rules.ts` 的 `workspaceContainment`、`fileToolsOnly`，`src/guard/graph-files.ts`，M3 的 `src/guard/main-agent.ts`），加了规则忘了登记就失败。

规则板自己的拦截规则 `builtin:rules-files-only`（§2.5）由规则行在 `tools/pre-execute` 上注册，复用 guard 的判写（`fileToolsOnly.detect` 与目标解析，同 `src/guard/graph-files.ts` 的做法）。

G3 之后 guard 对所有路由生效；规则板同样不分路由，规则可以用 `subjects.models` 自己收窄。

### 10.2 项目图与每步投影

规则不是图上的节点：在场、租约、等待单一天变很多次，写进图会让 git 历史与图的修订号不停变化；机器一级的状态也不属于某个项目的意图（`docs/CHARTER.md` §2：图画意图）。两者的联系：规则的 `source` 可以指向一个节点（为什么有这条规则）；人想把一条长期的政策留在项目图上，可以建一个规范节点并在正文里写规则 id。规则板的提醒与投影是两条 notice，用同一个接缝与同一种只在变化时注入的做法。

### 10.3 M3

规则板用 M3 的三样东西：主 Agent 角色、焦点目标的阶段（`stage.ts`）与派发链的根 `dispatchRoot`（等待单的转交，§6.3）。角色要读到 `/wish` 的待生效状态，所以规则板要求设计行经 `ctx.provide` 提供服务 `glmHournessDesign`，成员只有 `isMainAgent(agent)`（就是 M3 §3.1.2 的那个函数）；先实现的一方加这个服务与它的契约测试，服务不在时规则板退到投影 `hournessMainAgent`（§2.3）。M3 的两条写入规则留在设计行。M3 没有合入时规则板照样工作，引用这两个信号的规则读不出（§5.7）。两边会改同几个登记文件（`src/shared/health.ts` 的 `HOURNESS_ROWS`、`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`src/shared/tool-names.ts`、`tests/contracts.spec.ts`），先合入的一方先改，后到的一方在它之后追加（§16）。

### 10.4 派发（M7）与 `d-plan-approval`

- 派发槽位与重活排队是 M7 派发的执行边界之一（§6.5）。主 Agent 审派发计划时（`d-plan-approval`：计划由主 Agent 按 harness 可查的条件批），`rules_show` 给出计划要遵守的规则与已经开着的等待单；被排队的派发不算计划失败，主 Agent 转去做计划里其他能做的事。
- 人不出现在日常里：规则只在人想改时由人改；预算、租约、等待单与唤醒都不要人点。人点的只有在场（检测器放开之前）与提议，这些都不是每次派发都要的。
- 主 Agent 想要一条新规则时，用 `rules_propose`，然后照常工作；提议不阻塞任何东西。
- 无人值守时被推迟的子 agent 工作不会丢（§6.3）：子 agent 收尾时在交回里写单号，单转给主 Agent，解除时主 Agent 收到消息、重派或自己跑；重派同一个调用复用原来的单，所以不会反复重派、反复开单。

### 10.5 审计流水与晨报

| 发生了什么 | 记在哪 | 字段 |
| --- | --- | --- |
| 规则、检测器、记账信号、预算、重活声明的变化 | 项目或机器的流水（§4.4） | 见 §4.4 |
| 租约与等待单的变化 | 机器流水 | 同上；等待单写调用的签名与摘要 |
| 一次调用被规则板拦截、排队或只记录 | 违规流水 `<projectHome>/audit/violations.jsonl`，经 `rowJournal`，与 guard 同一份 | `{at, rule: 'rules:<规则 id>', mode: 'enforce' \| 'shadow', effect, tool, agentId, sessionId, ticket?, signals: {<名字>: <当时的值>}, correction}`；`signals` 写下判定用到的信号值，采样信号的留痕落在这里（§5.1） |
| 采样信号的值、心跳 | 心跳文件，不留历史 | 只是当前值 |

一处动作只记一处：拦截的事实在违规流水，等待单的生命在机器流水，两边互相写对方的 id。违规流水的项目目录取 guard 一样的来源（行配置 `home`，否则数据目录服务的 `projectHome`）；这个目录今天是按 profile 配的，不按会话的工作区，规则板沿用这一点，不在这里改。晨报（M7）加一节「规则板」：按规则与执行方式计数、等待单开了多少、解除了多少、转交了多少、过期了多少、回收的租约、状态重建与没有生效的流水记录、检测器的影子统计、在上限之外的进程数，以及人的负担：这段时间里规则板提给人的待决数、人在规则板上的操作数（按在场、规则、租约、等待单分）（`question-27` B 的可量部分）。

### 10.6 GLM 通道包

规则板只读 GLM 包的计价服务得到 `glm-peak`（§5.3），不导入 GLM 包的代码（split 0.3 §2.7 的边界）。GLM 包不在时这个信号读不出，其余照常。

## 11. 失败与降级

### 11.1 激活期（`apply` 不抛错）

规则行 `inject = ['tools', 'commands']`：两个服务都在时 cordis 才激活本行，否则行健康为「未加载」。`sessionProjections`、`agents`、`subagents` 经 `ctx.inject` 可选地取（同 `graph-panel`）；数据目录服务、图行服务、计价服务、方言服务在每次用时经 `ctx.get` 读。

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| 数据目录服务不在（没有 `userHome`） | 门、提醒、命令都注册；门放行一切，提醒只说「规则板没有状态目录」，命令返回错误 | 行健康 inactive「没有用户级目录（数据目录行未启用）」；数据行以后到达时自动恢复 |
| 两个命令或两个工具之一注册失败 | 告警；撤掉已注册的命令与工具；门与提醒照常（人改不了规则，但已有的规则照样执行） | degraded，写明哪个没注册上 |
| `tools/pre-execute` 监听器注册抛错 | 告警；本行不执行任何规则，只显示 | inactive |
| 会话投影注册失败或服务不在 | 面板读不到状态文件路径，规则视图写「宿主没有提供路径」；门与提醒照常 | degraded；服务以后到达时 `reactivate` |
| 辅助进程起不来（激活时 `ping` 不通） | 预算退到优先级一级，宿主不收进 job；在场与前台检测器、进程触发不可用；之后重启成功时才收进，之前派生的进程留在 job 外 | degraded「辅助进程不可用：…」 |
| 宿主进程收进 job 失败（句柄复制失败、已在一个不允许嵌套的 job 里，或权限不够） | 预算退到优先级一级 | degraded「CPU 上限不可用：…」 |
| 状态文件读出来要恢复 | 按 §4.5 | 流水与面板 |

### 11.2 故障预案

按项目图 `d-failure-plans`（人的原话「一个优秀的软件或者工程怕的不是失败，而是失败后的预案做的够不够」，写进 `docs/DEVELOPMENT.md` §1.1「评审挡路的标准」）写：每种故障怎样被发现，之后怎样（降级、恢复、停下交人）。规则板自己出问题时一律偏向放行（规则不生效），但每次都出声；它从不因为自己的故障去拦 agent 的工作，唯一的例外是人在规则上写了 `onUnknown: apply`。

| 故障 | 怎样发现 | 之后 | 留痕 |
| --- | --- | --- | --- |
| 读状态或判定抛错 | 门里的 `catch` | 降级：这次调用放行 | 会话健康 degraded，告警一次 |
| 违规流水写失败 | `rowJournal` 的失败回调 | 判定照常 | 第一次失败告警一次（同 guard） |
| 开单时写锁 2 秒内取不到 | `busy` | 照样拒绝，文字写「排队时没能记下等待单，规则解除后请自己重试」 | 告警；会话健康 degraded |
| 人在图上拍了提议的待决，规则板没跟上（规则行没加载，或两次写入之间进程退出） | 读项目状态时对照提议引用的待决（§9.4） | 恢复：按图上的拍板补写或补记驳回 | 流水写「按图上 `<id>` 的拍板补写」 |
| 子 agent 的会话结束时它还有开着的单（无人值守时最常见：一次性 worker 被推迟后收尾） | `session/disposed`，或每 5 秒重判时 `agents.get` 为空 | 恢复：单转给派发链的根，解除时唤醒根（§6.3）；找不到活的根才取消 | 机器流水 `ticket-handover`，或取消的原因 |
| 唤醒消息发不出（agent 已释放） | `steer`、`inject`、`followup` 抛错 | 子 agent 的单按上一行转给根再发一次；其余单转 `cancelled` | 机器流水写原因 |
| 唤醒发出去了，agent 30 分钟没回来重试 | 每 5 秒的重判看到 `cleared` 超过 30 分钟 | 单转 `expired`，面板「在等的工作」里写「已解除，agent 没回来」 | 机器流水 |
| 读者在两次读之间碰上写入 | 快照与流水不一致 | 取锁重读，一致就用，不算恢复（§4.5） | 无 |
| 快照改名失败（读者开着文件） | §4.4 第 7 步的重试用完 | 降级：留下 `.<文件>.pending`；下一次读取采用它 | 宿主日志 info「快照没跟上，已补上」 |
| 蓝屏或断电，快照被清零（2026-10-29 的情形） | 读时快照解析失败（§4.5） | 恢复：按流水重建；开机时刻变了，绑定进程与会话的租约失效（§4.6），人设的租约按期限保留 | `recovered`（`snapshot-corrupt`）；面板「快照损坏（清零、截断或读不出），已按流水重建」 |
| 流水最后一行写了一半 | 解析失败 | 恢复：截掉这一行 | `recovered`（`journal-tail`），写丢掉的字节数，字节另存 |
| 流水中间有读不出的行 | 解析失败 | 恢复加交人：按 §4.5 第 5 步，坏行之后到下一个锚点之前的记录不生效，规则板照常运行；人按组（同一处坏行之后的连续几行）按记录生效或忽略 | 面板「流水第 N 行读不出，之后 M 条记录核对不了，没有生效，请核对」，行健康 degraded；流水另复制一份，不删 |
| 引擎以外的写入改了快照 | 快照能解析、摘要与流水不符 | 恢复：按流水重建 | 面板与行健康「快照被引擎以外的写入改过，已按流水重建」 |
| 引擎以外往流水里追加或改了记录（例如一条伪造的 `actor: human` 的 `rule-lift`） | 重放时这条记录的摘要对不上 | 不生效、留在流水里，交人：按记录生效或忽略 | 面板与行健康「流水第 N 条不是引擎写的，没有生效，请核对」，列出序号、身份、操作、目标 |
| 写入者卡住超过 10 秒，锁被接手 | 后来者的接手判断（§4.4） | 卡住的写入者恢复后、追加流水之前再读一次锁文件，内容不是自己的随机标记就放弃这次写入并返回 `busy`；剩下的毫秒级窗口按修订号检查兜住 | 放弃时告警 |
| 流水写不进（磁盘满、权限） | `appendFile` 抛错 | 这次写入失败，返回 `io`；状态不变 | 告警；行健康 degraded |
| 快照改名重试 5 次仍失败 | `rename` 抛 `EPERM`、`EBUSY` | 降级：流水已写，下一次读取重建 | 告警 |
| 宿主进程崩溃 | 心跳文件超过 45 秒没更新、pid 不在或启动时刻不同 | 恢复：其他宿主或命令行回收它的租约，它的等待单过期；它的 job 随最后一个进程退出而消失 | `reclaim`，证据写进流水 |
| 某个占用者没释放就丢了（例如 Kiro 的一次运行失去状态） | 到期 | 恢复：到期即失效；人可以在面板上立即收回 | 流水 |
| 检测器检查失败、超时、输出不对 | 运行器 | 降级：信号未知，引用它的规则按 `onUnknown`；连续失败按 §5.4 退避 | 检测器状态 `detectorError`，面板显示 |
| 检测器一直「成功」却一直报错的值（例如日志路径写错，永远是 0） | 面板上每个检测器的值的历史与影子期的统计；每条规则「最近 7 天命中次数」 | 人看到一直不命中的规则或一直不变的信号，改检测器 | 面板 |
| 命令检查超时 | 运行器的计时 | 结束进程树：只在 Node 的 `ChildProcess` 还没有 `exit` 时才执行 `taskkill /PID <pid> /T /F`，避免 pid 被复用后杀错进程；`taskkill` 失败时该检测器停到下一次触发 | 告警 |
| 辅助进程无应答或退出 | 请求 5 秒超时，进程 `exit` 事件 | 重试：按 §7.4 的退避重启，`attach` 按名重开 job（宿主持有复制的句柄，名字还在），按当前档位重设并扫描。期间 job 的限制停在最后的值，新起的命令没有降优先级 | 行健康 degraded「辅助进程不在：CPU 上限停在 <档位>，新起的命令没有降优先级」，重启成功后恢复 |
| 重启后的辅助进程按名打不开 job（错误 2），而 `hosts` 记着本宿主收进过（句柄复制没有生效等意外） | `attach` 返回 `orphaned` | 停下交人：不新建 job（新 job 会嵌在旧 job 之下，放不开旧的限制）；在场按钮不再声称已经放开 | 行健康与面板的预算一节 degraded「CPU 上限停在 <hosts 里记的最后档位>，重启 DSH 才能改」 |
| 档位没有落实（`os.setPriority` 抛错、宿主收进 job 失败，或读回的优先级、处理器数与期望不符） | 抛错；`readback` 与期望比对（§7.3） | 降级：用能做到的那一级；读回不符时下一次切换或扫描再试一次 | 行健康 degraded，写明哪一项（例「人走开了，宿主仍是低于正常」） |
| 有规则行激活之前派生的进程在上限之外 | Toolhelp 快照（§7.3） | 降级：只降它们的优先级，记进宿主里的恢复名单 | 行健康与面板「N 个进程在上限之外（规则行激活之前派生）」；名单随 `host-level` 进 `hosts` 的 `outsideLowered` |
| 人在时辅助进程重启，之后人走开（评审 F27） | 辅助进程的 `exit` 事件 | 恢复：名单在宿主进程里，重启后的辅助进程按名单把 job 外后代设回各自的 `prior` | 设不回的个数进 `outsideNotRestored`，大于 0 时行健康 degraded「N 个规则行激活之前派生的进程没能恢复优先级」，面板列出 pid |
| `rules_propose` 提的待决被图引擎拒绝（卡片字段不合、焦点不存在） | 图引擎的返回 | 什么都不记；工具结果原样返回引擎的错误与字段路径，agent 改了再提 | 图上没有这次写入；工具结果在会话日志里 |
| `rules_propose` 的待决已提出，记提议时取不到锁或写不进 | `busy`、`io` | 重试一次；仍失败就在工具结果与待决的批注里写明「拍板不会生效」；人拍这张待决时 `acceptProposal` 返回 `missing`，停下交人（§9.4） | 待决的批注；拍板结果里的一行；行健康拍板后 24 小时内 degraded |
| 规划出的改动不合法（规划函数的缺陷：`applyRecord` 抛错，或写后整份校验不过） | §4.4 第 6 步 | 这次写入失败，返回 `invalid`（请求本身合法时为 `internal`），不写任何文件；状态不变 | 告警，带操作名与出错的路径；`internal` 时行健康 degraded |
| CPU 上限让 DSH 宿主自己明显变慢 | R9 的 L3 量宿主的定时器延迟（§15）；L4 人的观察；行健康里写着当前上限 | 人在面板上改数字或改宽档；最坏时重启 DSH，新进程按新档位收进 | 预算的变化进流水 |
| 规则行被禁用或卸载 | cordis 调用卸载函数 | 按「人走开」一档恢复：放宽亲和性并强制 Normal 再清标志、恢复 job 外后代与宿主的优先级（§7.3），再结束辅助进程；宿主仍在 job 里（没有限制，只记账），之后重启的宿主不进 job | 宿主日志一行；行健康随行消失 |
| 面板写入被拒 | 命令结果 | 一行人话，例「这条规则刚被改过，面板已读到新内容，看一眼再点一次」 | 命令流节点 |
| 命令行写不进用户级目录 | 抛错 | 退出码 1，JSON 错误 | 标准错误 |
| 脚本取租约时被占着 | `conflict` | 退出码 3，或 `--wait` 时等待 | 标准错误一行 |

不可逆的东西与它们的防线：规则板不删任何数据（解除、删除的规则留在流水里，有坏行的流水另复制一份，原文件不改写）；不动任何项目的工作树（状态在用户级目录）；不改用户 profile；唯一的外部副作用是把 DSH 宿主进程放进一个 job：D4 的「人在」一档带 CPU 上限时，规则行激活就收进（§7.3）。它在 DSH 重启之前不可撤回，但没有限制时不起作用；限制随时可以放开，因为 job 句柄先复制进了宿主，辅助进程死了也能按名重开；复制失败时不收进（§7.3）。要不要 CPU 上限由人在 D4 里决定。

### 11.3 行健康

`src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `rules`（split 0.3 §2.5 的编排层组），按会话上报，不在 `ACTIVATION_ONLY` 里。`/glm-status` 与 `/hourness-status` 都列出这一行。

| 何时上报 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- |
| 激活；每次工具调用的判定；每次提醒；档位切换；读回 | 「N 条规则对本会话生效；在场：你在（你设的）；档位：人在，job：最多 8 个逻辑处理器（共 32 个），后代低于正常」或「档位：人在，优先级：低于正常（已经在跑的命令不受影响）」 | 没有用户级目录；辅助进程不可用或不在；CPU 上限不可用；CPU 上限停在某档，重启 DSH 才能改；N 个进程在上限之外；N 个规则行激活之前派生的进程没能恢复优先级；档位没有落实；图上待决没有对应的规则板提议；规划出的改动不合法（`internal`）；§4.5 表里的恢复情形（每种一个说法）；流水里有 N 条没有生效的记录待核对；N 条规则的条件读不出；会话没有工作目录（只有内置规则与会话规则） |

## 12. 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| 规则 `id` | 是 | `^r-[a-z0-9][a-z0-9-]{0,45}$`，项目内不重复 | `invalid`（`field: rule.id`） |
| `title` | 是 | 1–120 个字符，一行 | `invalid` |
| `reason` | 是 | 1–2000 个字符 | `invalid` |
| `when`、`lifetime.condition` | 否 | §2.3 的条件；嵌套至多 5 层，至多 20 个叶子；引用的信号必须已定义，比较值的类型与信号的类型相符 | `invalid`，`field` 指到叶子 |
| `subjects.models` | 否 | 至多 10 项，每项 `provider/model`，只允许 `*` 通配 | `invalid` |
| `action.patterns`（命令文本） | 按类 | 至多 20 项，每项至多 300 字符，必须能以 `iu` 标志编译成 JavaScript 正则 | `invalid`，写出编译错误 |
| `action.paths` | 按类 | 至多 20 项，相对路径，`/` 分隔，不含 `..`，只允许 `*`、`**` | `invalid` |
| `effect` 与 `action`、`params` 的搭配 | 是 | §2.3 的搭配表 | `invalid` |
| `params.holdMs` | 否 | 0–900000 的整数 | `invalid` |
| 规则的 `effect` | 是 | `block`、`queue`、`shadow`、`inform`；`throttle` 与 `params.priority`、`params.cpuPercent` 按多余或非法字段拒绝（限速只在内置预算里，§2.3） | `invalid` |
| 预算的 `cpuPercent` | 否 | 5–100 的整数；换算成 k 个逻辑处理器（§7.3），面板同时显示 k | `invalid` |
| `rules_propose` 的 `summary` | 是 | 1–120 个码点，一行 | `invalid`（`field: summary`） |
| `rules_propose` 的 `ifSet`、`ifSkip` | 是 | 1–120 个码点，一行（图引擎 `CARD_LIMITS.consequence`） | `invalid` |
| `rules_propose` 的 `why` | 是 | 1–200 个码点，一行（`CARD_LIMITS.why`） | `invalid` |
| `rules_propose` 的 `counter` | 否 | 1–200 个码点，一行（`CARD_LIMITS.counter`） | `invalid` |
| `rules_propose` 被图引擎拒绝 | — | 图引擎的规则（推荐项在最后、卡片字段） | 原样返回引擎的错误码、信息与字段路径，规则板不记提议 |
| 租约的 `token` | 进程与外部占用者续租、释放时必填 | 32 个十六进制字符；摘要与状态里的不符 | `forbidden` |
| 预算的 `dispatchSlots` | 是 | 0–8 的整数（8 是 DSH 的 `maxActiveSubagents` 默认值，subagent:2979–2980） | `invalid` |
| `lifetime.expiresAt` | 按种类 | 晚于现在，至多 30 天之后 | `invalid` |
| 一个项目里 `active` 的规则 | — | 至多 50 条 | `invalid`，写「先解除一些」 |
| 检测器 `id`、`signal` | 是 | `^d-[a-z0-9][a-z0-9-]{0,45}$`；信号名 `^[a-z][a-z0-9-]{0,47}$`，在机器与项目两级之间不重复 | `invalid`、`conflict` |
| 检测器的触发间隔 | 是 | 内置检查至少 5 秒，`http` 至少 30 秒，命令至少 60 秒 | `invalid` |
| `log-match.path`、`file.path` | 是 | 绝对路径，或相对项目根；是普通文件或尚不存在 | `invalid` |
| `http.url` | 是 | `http:` 或 `https:`，不含用户名与密码 | `invalid` |
| `command.argv` | 是 | 1–32 项，每项至多 1000 字符；`timeoutMs` 1000–30000 | `invalid` |
| 人手值 | 是 | 与信号的类型相符；期限至多 7 天 | `invalid` |
| 租约 `ttlMs` | 是 | 人：1 分钟到 12 小时；外部：1 分钟到 8 小时；进程：1 分钟到 2 小时 | `invalid` |
| `relay` | 否 | 1–2000 个字符；只有 `llm` 能带 | `invalid` |
| 命令检查的输出 | — | §5.4 | 信号未知，检测器出错 |
| 状态文件 | — | 每次读都整份校验；不合法按 §4.5 恢复 | 不报给调用方，走恢复 |
| `/rules` 的输入 | — | §9.3 的几种用法 | 一行用法说明 |

正则的风险：人写的正则可能在病态输入上回溯很久。缓解：只对命令文本的前 8 KiB 匹配；写入时用一组固定的长输入试跑每个模式，单个模式超过 50 毫秒就拒绝（`invalid`，写「这个模式太慢」）。

## 13. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 只有人能增、改、解除、删除规则与检测器，放开影子，改预算与人手值 | 引擎 `apply` 的第一步按身份核对（`src/rules/permissions.ts`）；入口固定身份；`builtin:rules-files-only` 拦文件写入 | 人定；规则文件在用户级目录，引擎之外的写入还有文件门禁兜着 |
| 加一条规则不会放开原来被拦的动作 | 判定 `judge`：没有放行规则，取最强 | §2.4 |
| 检测器失败不会把信号读成「否」 | 有效值的计算（`src/rules/signals.ts`） | §5.1 |
| 影子期的检测器不改变任何调用的结果 | 判定：引用影子信号的规则降为只记录 | §5.6 |
| 一个独占资源同时至多一个占用者 | 引擎：锁内读最新状态、核对修订号再写 | §4.4 |
| 状态的每次变化都有一条流水，流水先于快照落盘 | 引擎的写入顺序 | 崩溃安全与留痕 |
| 被 guard 等拒绝的调用不进规则板 | 门的顺序：先 `next()` | §6.2 |
| 调用处的等待随会话取消而结束 | 门监听 `exec.signal` | 人按停止就停 |
| 规则行卸载时恢复宿主优先级、放开限制 | 规则行的卸载函数；放开的顺序（先放宽、强制 Normal，再清标志）在辅助进程的 `limits all` 里 | 不留下没人管的限速；只清标志会停在被限的值上 |
| 宿主的 job 不带关闭即结束、不设内存上限 | 辅助进程的 `attach` | 辅助进程死了不能带走 DSH |
| job 句柄先复制进宿主，复制成功才收进宿主 | 辅助进程的 `attach` | 句柄只在辅助进程里时，它一死 job 就再也打不开（§7.1） |
| 不为已经收进过 job 的宿主新建第二个 job | 辅助进程的 `attach` 按 `hosts` 的记录判断 | 新 job 嵌在旧 job 之下，放不开旧的限制 |
| 宿主自己保持正常优先级，只有它的后代被降 | job 一级的 `limits` 不设优先级类；`sweep` 跳过宿主 | 限制打满时宿主不被自己的构建拖住（§7.3） |
| 摘要对不上的流水记录不生效 | 重放（`src/rules/store.ts`） | 引擎以外追加的记录不能冒充人的写入（§4.5） |
| 写入与重放得到同一个状态：状态只经 `applyRecord` 改，它不读时钟、文件系统与进程表；依赖它们的决定在规划时做完并写进 `changes` | `src/rules/store.ts` 的 `applyRecord`（纯函数）与 `src/rules/plan.ts` 的规划函数；R2 的性质测试 | 引擎自己写的记录在重放时永远对得上，快照清零之后能无损重建（§1.4 第 5 条，评审 F20） |
| 提议先有图上的待决，再有规则板的提议；待决被拒时没有提议 | `rules_propose` 的顺序（`src/rules/proposal.ts`） | 不会留下一条人只能在规则视图里看到的提议（评审 F23） |
| job 外后代的恢复名单由宿主进程持有 | 宿主侧的预算（`src/rules/budget.ts`） | 辅助进程只是执行者，它重启不丢名单（评审 F27） |
| 子 agent 的等待单在会话结束时转给派发链的根，不悄悄取消 | 宿主侧的单管理（`src/rules/tickets.ts`） | 无人值守时被推迟的工作有人接（§6.3） |
| 进程与外部占用者的租约只能由持有 `token` 的一方续租、释放 | 引擎的租约操作 | 一个运行不能释放另一个运行的租约 |
| 给模型的提醒里没有日志原文 | 提醒的渲染只用信号值，不用证据 | 日志里可能有密钥 |

## 14. 可测性

纯函数在 L2 直接测：条件的三值求值、主体与动作的匹配、`judge`、有效值、权限表、校验、项目键、提醒的渲染与摘要、等待单的去重与保留、唤醒方式的选择。存储在 L2 用临时目录的真实文件测（`docs/DEVELOPMENT.md` §1 允许 mock 文件系统，这里直接用真实的临时目录更接近事故）：清零的快照、截断的流水、锁残留、改名失败（用注入的 `rename` 模拟 `EPERM`）、开机时刻变化（注入时钟与 `uptime`）、两个子进程同时写（L2 里起两个 Node 子进程各写 200 次，最后 `seq` 连续、没有丢）。宿主侧的行在假宿主 `tests/fake-rc3.ts` 上测，假宿主为此补 rc.3 的这些信号：`tools/pre-execute` 的 `cancel` 决定与 `exec.signal`；监听器长时间 `await` 期间调用不执行；活 agent 的 `steer`、`inject`、`followup` 记下消息；`agents.roots()`；`goals.get(agent)` 的 `phase`；会话投影的 `init(header)`。辅助进程在 L2 用注入的假进程（只验协议、档位切换的请求顺序、读回不符时的降级与 `orphaned` 的处理），真实的 PowerShell 在一个只在 Windows 上跑、默认不进 `npm test` 的检查 `npm run -s rules:helper-check` 里跑（照 `exp/exp-round2*.ps1` 的做法，作用于自己起的一次性进程：激活前派生的子进程在 job 外、先复制句柄后收进、强制 Normal 再清标志、放宽亲和性再清标志、按名重开；job 外的子进程被 `sweep` 降为低于正常之后结束辅助进程、起一个新的，带恢复名单的 `sweep normal` 把它设回 Normal）。确定的序列化在 L2 用打乱键顺序的同一状态核对摘要相同。真实组合里的门、提醒、唤醒、转交与 job 在 L3 探针里测；面板与按钮要 L4。

## 15. 验证计划

每一步的「今天必败」是这一步新增的检查在今天的代码上怎样失败，用来证明检查确实钉住了新行为。

| 步（§16） | L2 | L3 探针（`npm run probe`） | L4 桌面版 | 今天必败 |
| --- | --- | --- | --- | --- |
| R1 模型与判定 | `tests/rules-model.spec.ts`：§2.3 每种条件的成立、不成立、读不出；`all`、`any`、`not` 的三值表；`onUnknown`；每类动作的匹配（工具名换算、命令文本、写文件、派发、重活、用资源）；最强者合并；搭配表的拒绝；只告知 | 无（不碰运行时） | 无 | 导入 `src/rules/model.ts` 失败 |
| R2 存储 | `tests/rules-store.spec.ts`：§4.5 表的每一种情形与它的说法；`canonicalJson` 对打乱键顺序的同一状态给出同一摘要；往流水末尾追加一条手写的 `{"actor":"human","op":"rule-lift",…}`（摘要缺失或随手写的），重放后那条规则仍生效、记录进 `unresolved`、原因 `journal-not-engine`（F4）；坏行之后的记录不生效，下一个 `recovered` 锚点之后接上；改名重试用完留下 pending，下一次读取采用它、不写 `recovered`、不降级；读者在写入者追加与改名之间读（注入的钩子在两次读之间完成一次写），取锁重读后不写 `recovered`（F7）；锁的接手；开机时刻；两个子进程并发写；流水轮换；清理：关闭超过 24 小时的单与心跳不在超过 1 小时的宿主在下一次写入后不在快照里，那条记录的 `changes` 里有带 `cause: 'prune'` 的删除，从头重放同样删掉（F15、F20）；`applyRecord` 不读时钟（L2 在冻结的假时钟与空的 `hosts/` 目录下重放，结果不变）；`recovery-accept` 一组连续的行，按流水顺序生效、`harness` 写的行也能补上，读不出的行只能忽略。性质测试（F20）：固定 5 个种子的自写生成器（合法操作序列的生成器无论用不用库都要按领域自己写；重放会直接报出第一条对不上的序号，用不上库的收缩，所以不加开发依赖），注入时钟与可调的轮换阈值。每个种子生成 200 次写入，覆盖 §9.3 表里每一个操作，其中至少有一次清理（时钟前进 25 小时，删掉一个宿主的心跳文件）、一次流水轮换、两行引擎以外追加的记录（`changes` 合法、`snapshot` 随手写）各自随后的恢复，以及对其中一行的 `recovery-accept`、对另一行的 `recovery-dismiss`。之后：(a) 清零快照、读一次：重放得到的状态（追加 `recovered` 之前）的摘要等于清零前的快照；那两行照样被跳过，又被各自之前的 `recovered` 从跳过表里去掉，跳过表为空，所以新追加的 `recovered` 原因为 `snapshot-corrupt`、不登记任何行；(b) 再清零一次、读一次：摘要等于 (a) 之后的快照，同样只多一条不登记行的 `recovered`；(c) 直接调用 `store.ts` 的重放函数（它的起点参数在正常读取时取快照、`base` 或空状态），起点取空状态、按序读全部旧流水文件与当前文件：重放得到的状态摘要与 (a) 的相同，链上的 `base` 照常核对通过。失败时打印种子与第一条对不上的序号 | 无 | 无 | 导入 `src/rules/store.ts` 失败；在 0.2 的写法下（清理不进记录、`recovered` 按 `state` 比对）同一个性质测试在 (a) 失败 |
| R3 引擎、权限与命令行 | `tests/rules-engine.spec.ts`：§2.5 表的每一格（`human` 可以、`llm` 被拒、`detector` 只能写自己的信号、`harness` 只能回收已证明死亡的占用者，`recovery-accept`、`recovery-dismiss` 只有人）；`llm` 带 `relay` 直接写规则被拒（转述只经图上的拍板，F10）；`propose` 的四种 `kind`，`lift` 的规则不在生效时 `invalid`，缺 `why`、`ifSet`、`ifSkip` 或超长时 `invalid`、没有 `counter` 照常接受（F23）；`proposalQuestion` 组出的待决交给真实的图引擎（临时目录）提一次被接受，四种 `kind` 的 `label` 都不超过 20 个码点、推荐项 `set` 在最后、`weight` 为 `two-way`；图引擎拒绝时（注入一个不存在的焦点）项目状态没有新提议、工具结果带引擎的字段路径；待决提成功而记提议时注入 `io`：结果带待决 id 与「拍板不会生效」，之后以人拍 `set`，`acceptProposal` 返回 `missing`、没有规则生效；租约：进程与外部占用者 `renew`、`release` 不带或带错 `token` 时 `forbidden`，状态里没有 token 原文（F8）；修订号；校验表的每一行；`scripts/rules` 的冒烟（以独立进程跑 `show`、`check`、`lease`，`acquire` 的输出带 `token`，`propose` 之后状态里只有提议） | 无 | 无 | `npm run -s rules -- show` 不存在；`llm` 写规则今天没有任何地方会拒绝 |
| R4 规则行：门、提醒、声明、命令、工具、投影、行健康 | `tests/rules-row.spec.ts`（假宿主）：先 `next()` 后判；拦截文字；开单与去重；调用处等待与取消；唤醒按 agent 状态与 goal 选 `steer`、`inject`、`followup`；带 `parent` 的子调用判为排队时开单（单上 `nested: true`）、规则的 `holdMs` 大于 0 也不在调用处等、文字是子调用的那一段，同签名的直接调用复用这张单，解除时唤醒文字带「from a run_code program」（F11、F26）；`goals.get` 对已释放的 agent 抛 `GoalError` 时唤醒按没有 goal 选 `followup`（F22）；子 agent 开单时用子 agent 的排队文字；子 agent 的会话结束（`session/disposed`，以及没有这个事件、只是 `agents.get` 为空两种）之后单转给派发链的根、`handedFrom` 记下原来的子 agent，解除时根收到转交的唤醒文字，根下新的子 agent 做同一个调用复用这张单，根也不在时取消并写原因（F5）；角色 `main-agent` 有设计行服务时取它的 `isMainAgent`（`/wish <一句话>` 之后、`command/done` 之前的第一步读作主 Agent），没有服务时退到投影（F17）；提醒只在变化时注入、压缩后重注、目标轮；`glm:guard` 多一行；`/rules-apply` 身份为人；`rules_propose` 先提一张决定者为人、推荐 `set` 在最后、`weight: two-way` 的待决，成功之后才记提议（F23），`/graph-apply` 以人拍 `set` 之后规则生效、拍 `skip` 之后提议驳回，`graph_decide` 带转述拍 `lift` 提议之后规则解除且历史里有原话，规则行不在时拍的板在下一次读状态时补写；激活期的每种降级 | 新场景 `glm-rules`、`non-glm-rules`（场景的 DSH 目录里预置一条项目规则：命令文本 `rules-probe-blocked` 拦截，一条排队规则配人手开关）：拦截的调用不执行且违规流水有 `rules:` 记录；排队的调用拿到单号；场景中途由探针 provider 经 `commands.find` 取到本包真实的 `/rules-apply` 处理函数，以人的身份清掉开关（与探针调用 `/glm-status` 的方式相同，`docs/DEVELOPMENT.md` §3），原会话收到唤醒消息、重试后执行；同一步改用命令行（身份 `llm`）清开关被拒；请求里有规则板的提醒，没有变化的步不再有；`/glm-status` 有 `rules` 行；规则行在只装编排层包的组合（`probe-hourness`）里同样生效。新场景 `rules-handover`：经探针的派发插件（`scripts/probe/probe-dispatch.mjs`）派一个一次性子 agent，它的排队调用开单后它交回、会话结束；开关清掉之后主 Agent 收到转交的唤醒消息（V11） | 桌面版重启后（行仍默认禁用时先在临时 profile 验证，`AGENTS.md` 强制流程第 3 条）：一个 GLM 会话与一个 DeepSeek 会话各自看到提醒；拦截与排队的文字；配了 `holdMs` 的规则在调用处等待时界面的样子与停止按钮（V9） | 场景在今天的代码上：被规则拦的命令照常执行，场景判失败；`rules-handover` 里主 Agent 收不到任何消息 |
| R5 租约 | `tests/rules-lease.spec.ts`：§8.2 每种占用者的死活判断；保留与过期；会话结束释放；开机时刻变化后回收；脚本的退出码 3 与 `--wait`；脚本退出时带自己的 `token` 释放 | 场景 `rules-lease`：命令行先以外部占用者取 `dsh-desktop`，会话里调用匹配使用模式的命令被排队；不带 `token` 的 `lease release` 被拒；带 `token` 释放后得到保留、重试执行；`npm run probe` 在已有占用时退出码 3（用临时的 profile 名，不碰 `glmsandbox` 的真实租约） | Kiro 重启桌面版之前取租约，人点「桌面版：我在用」之后 Kiro 的取得被拒 | 第二次 `npm run probe` 今天照常启动 |
| R6 预算的优先级一级与重活排队 | `tests/rules-budget.spec.ts`：档位到优先级的映射；切换时 `os.setPriority` 的调用与读回；读回不符时降级；`builtin:budget-heavy` 的判定；重活声明与学习结果（只有用时）的汇总；卸载时恢复 | 场景 `rules-priority`：以人的身份设「你在」之后，一条 `pwsh` 命令 `node -e "console.log(require('os').getPriority())"` 打印 10；场景里声明的重活命令被排队并拿到单号；设「你走开了」之后宿主读回 0、原会话收到唤醒、重试后执行 | 在场按钮切到「你在」之后任务管理器里 DSH 宿主进程为低于正常；之后起的命令同样 | 场景在今天的代码上：打印 0，重活命令照常执行 |
| R7 面板最小版 | `tests/rules-panel-model.spec.ts`：状态文件的解析、分组、提议计数、恢复一节的条目与两个按钮、预算一节的处理器数与「在上限之外」的文字、按钮的文字 | 无（面板在客户端） | 规则视图读到机器与项目状态；按绝对路径读文件与监视文件可用（V4）；改名替换后的变化 15 秒内出现；在场按钮来回切换，会话里各一行结果 | 没有「规则」视图 |
| R8 检测器框架、内置检测器与辅助进程 | `tests/rules-detector.spec.ts`：触发与检查的每一种（注入时钟、假文件、假 HTTP、假进程）；有效期；失败与超时为未知；命令检查的输出约定、退避、同时一个；影子期的降级；运行者租约的接手。`tests/rules-helper.spec.ts`（假进程）：启动前核对正文摘要、不符时重写；引导退出码 9 时重写一次、第二次降级；`ping` 的语言模式不是 `FullLanguage` 时降级 | 场景 `rules-detector`：一个命令检测器（`node -e` 输出 JSON）把信号写出，引用它的规则在影子期只写影子记录，经 `/rules-apply` 处理函数以人的身份放开后生效；命令超时后信号未知；`tool-error` 宿主事件的事件形状（V5）；场景宿主里辅助进程经 `-EncodedCommand` 起来、`ping` 通 | 在场检测器影子运行一天，面板上的一致率与人手设的记录相符（V6） | 没有检测器 |
| R9 预算的 job 一级与派发槽位 | `tests/rules-budget.spec.ts` 补：`attach` 的顺序（先复制句柄、复制失败不收进）；人在与走开两档发给辅助进程的请求序列（走开时先放宽并强制 Normal 再清标志，`sweep normal` 带恢复名单）；恢复名单：`sweep` 应答里的 job 外进程按 `(pid, startedAt)` 合并、已有的保留原来的 `prior`，人在时假辅助进程退出并重启、重启后的应答不再列这些进程，人走开时发出的 `restore` 仍是完整名单，`notRestored` 非空时行健康 degraded（F27）；`orphaned` 时不新建 job、行健康的文字；读回不符时降级；派发槽位的计数；k 的换算（n 为 1、4、32、64 时）。`npm run -s rules:helper-check`（Windows，不进 `npm test`）：§14 列的真实 PowerShell 检查 | 场景 `rules-budget`（场景的宿主是 Electron node 模式、Node v24；预算 `cpuPercent` 取 5）。探针按 `os.cpus().length` 算 n、k = max(1, ⌈n × 0.05⌉)、空转线程数 s = min(n, max(4, 2k))，n < 2k + 2 时跳过并写明原因；这台 32 线程的机器上 k = 2、s = 4（评审 F6）。CPU 由辅助进程的 `accounting` 按 job 的 CPU 时间算，每段 5 秒。顺序：(1) 规则行激活后宿主在 job 里、没有限制（读回的处理器数为 n）；(2) 设「你走开了」，会话里起一条 `pwsh` 命令，空转 s 个线程 60 秒；8 秒后量一段，合计不少于 1.5k；(3) 这条命令还在跑，设「你在」，3 秒后量一段：合计不超过 1.1k，读回里这条命令的进程为低于正常、宿主为正常，探针 provider 在宿主里每 20 毫秒记一次定时器延迟，这段的 p95 不超过 20 毫秒（F1、F12）；(4) 设「你走开了」，3 秒后：宿主与这条命令的进程读回 Normal，合计不少于 1.5k（F3）；(5) 结束辅助进程（pid 取宿主心跳文件），等它重启，`hosts` 没有 `orphaned`；设「你在」之后合计不超过 1.1k，再设「你走开了」之后不少于 1.5k（F2）；(6) 宿主在 job 里时 `pwsh` 与 detached 派生照常、DSH 运行器的嵌套成功（V1），`DSH_PERMISSION_MODE=workspace-write` 下再跑一遍 (2)–(4)（V2）；(7) `subagent` 调用在槽位满时排队 | 人在桌面版前点「我在用电脑」：任务管理器里 DSH 宿主为正常、它的子进程为低于正常，亲和性为编号最高的 8 个处理器；跑一次真实的构建，观察人的前台操作是否流畅（人的主观判断记进节点批注，V7）；面板上「在上限之外」的进程数（V10） | 场景在今天的代码上：第 (3) 步的命令读到 Normal、合计约为 s，判失败 |
| R10 晨报与放开检测器的数据 | `tests/workflow.spec.ts` 加规则板一节（含转交、没有生效的流水记录、在上限之外的进程数、人的操作数） | 无 | 晨报里有规则板一节 | 晨报没有这一节 |

核实项（没有运行过的假设）：

| # | 假设 | 层 | 不成立时 |
| --- | --- | --- | --- |
| V1 | DSH 宿主（Node v24、Electron node 模式）在我们的 job 里派生进程照常，DSH 的运行器把目标收进自己的 job 时嵌套成功（本机 Node v22 与类似运行器的 job 已试过，§7.2） | L3（R9） | 预算退到优先级一级，CPU 上限标为不可用 |
| V2 | `workspace-write` 预设下受限令牌的进程同样在宿主的 job 里 | L3（R9，`DSH_PERMISSION_MODE=workspace-write`） | 在面板上注明这种预设下上限不覆盖受限进程，扫描仍降它们的优先级 |
| V3 | 空闲的、有 active goal 的 agent 收到 `inject` 的唤醒消息，不破坏 goal-round-driver 的预约，下一轮第一步读到它 | L3（R4，探针验证插件建 goal） | 改为等驱动器的下一轮投影里带上「q-12 已解除」一行，不发唤醒消息 |
| V4 | 面板能按绝对路径读与监视用户级目录里的文件，改名替换能被监视到 | L4（R7） | 只靠每 15 秒重读 |
| V5 | 工具出错在 `session/event` 里的事件形状 | L3（R8） | `host-event` 只保留会话创建与结束两种 |
| V6 | 桌面版宿主进程里能读到 `GetLastInputInfo` 与前台窗口（试验是在 Kiro 的 PowerShell 子进程里做的） | L4（R8） | 在场只靠人手设 |
| V7 | 限制打满时人在桌面版上感觉不到 DSH 卡顿（L3 只量宿主的定时器延迟，界面在 Electron 的其他进程里） | L4（R9） | 人在 D4 里调档位；量到宿主延迟超标时改用更宽的 k |
| V8 | Kiro 支持能按退出码拦下调用的命令型 hook | 不在计划内（可选） | 只用 `agent` 型 hook 提醒 |
| V9 | 规则在调用处等待（`holdMs` 大于 0）时，桌面版界面上这次调用显示为还没有结果，人按停止就结束等待（§6.2） | L4（R4，第一批） | 内置规则本来就是 0；面板上给 `holdMs` 加说明「等待期间界面上看不出在等规则」，或不允许大于 0 |
| V10 | 桌面版上规则行激活之前宿主已经派生、在 job 之外的进程很少 | L4（R9） | 面板与行健康照样写出个数；数字大时在项目图上提一个任务，研究让规则行更早激活 |
| V11 | 一次性子 agent 交回之后它的会话发出 `session/disposed` | L3（R4，`rules-handover`） | 只靠每 5 秒的 `agents.get` 兜底，转交晚至多 5 秒 |

## 16. 实施分解与里程碑

开工条件：split 已合入 main（编排层包 `packages/hourness/`、`src/shared/step-notice.ts`、`src/shared/dialect.ts` 的 `toNativeTool`、`src/shared/pricing.ts`、`src/shared/tool-names.ts`、`/hourness-status`），合入时段里的 profile 切换已完成。分支 `rules`，工作树 `.worktrees/rules`，从合入 split 之后的 main 建。每步一个提交，提交信息带节点 id；文档与代码同一批（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰运行时的步另跑 `npm run probe`。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `rules`，`rows` 加 `{id: 'glm-hourness/rules', module: 'rules/index'}`；`packages/hourness/cordis.patch.yml` 里本行排在 `graph-panel`（M3 合入后在 `design`）之后、`ui` 之前，`disabled: true`。

| 步 | 内容 | 里程碑 | 层 | 独立评审 |
| --- | --- | --- | --- | --- |
| R1 | `src/rules/model.ts`、`judge.ts`、`signals.ts`（有效值）、`builtin.ts`（内置规则与其他行规则的目录） | M4 | L1、L2 | 否 |
| R2 | `src/rules/store.ts`（`applyRecord`、`stateDigest`、重放与恢复）、`lock.ts`、`project-key.ts`：快照、流水、锁、开机时刻、轮换；R2 的性质测试 | M4 | L2 | 是（崩溃安全与审计流水，`docs/DEVELOPMENT.md` §1.1 的同类） |
| R3 | `src/rules/engine.ts`、`permissions.ts`、`plan.ts`（每个操作的规划函数，产出 `changes`，含清理）：`apply` 与权限表；`src/rules/proposal.ts`（`proposalQuestion` 与提议的顺序）；`src/rules/cli.ts`、`scripts/rules/cli.mjs`；`package.json` 加 `rules` 脚本；`DEVELOPMENT.md` 加命令行一节 | M4 | L2 | 是（权限与审计） |
| R4 | `src/rules/index.ts`：规则行（门，含带 `parent` 的子调用；`builtin:rules-files-only`；`src/rules/tickets.ts` 的等待单、子 agent 单的转交与唤醒；提醒；`glmHournessRules` 服务与 guard 的声明一行、`/rules`、`/rules-apply`、`rules_show`、`rules_propose`、投影 `hournessRules`、行健康）；`src/graph/panel-row.ts` 的 `/graph-apply` 与 `src/graph/tools.ts` 的 `graph_decide` 在拍板成功之后调用 `acceptProposal`（§9.4）；`src/graph/digest-notice.ts`（M3 没有先做时由这里抽出）；`HOURNESS_ROWS`、`RULES_TOOL_NAMES`、契约测试；探针场景 `glm-rules`、`non-glm-rules`；`ORCHESTRATION.md` 新增规则板一节与 §6.4 规矩清单、`DESIGN.md` §2.2 行表与 §2.4a 接口对照、§2.5 行健康、§7 降级表 | M4 | L2、L3 | 是（guard 同类的拦截规则） |
| R5 | 租约：内置资源、执行边界取得、会话结束释放、心跳与回收、`token`；`scripts/sandbox.mjs` 取 `dsh-profile:<名字>`；`DEVELOPMENT.md` §3「不要同时运行」改为写明由租约保证 | M4 | L2、L3 | 否 |
| R6 | 预算的优先级一级（`src/rules/budget.ts`：档位、`os.setPriority`、读回）与 `builtin:budget-heavy`（重活声明、只记用时的学习结果）；探针场景 `rules-priority` | M4 | L2、L3、L4 | 否（不碰 job，只改宿主自己的优先级） |
| R7 | 面板最小版：`ui/src/rules/`（规则视图含恢复一节、在场按钮）、编排层客户端包的 `sources` 加 `ui/src/rules/` | M4（呈现的完整版随 M8） | L2、L4 | 否 |
| R8 | 检测器框架与内置检测器、辅助进程 `src/rules/helper/`（正文、引导、`ping`、`idle`、`processes`、`procStart`） | M7 | L2、L3、L4 | 否 |
| R9 | 预算的 job 一级（辅助进程加 `attach`、`limits`、`sweep`、`readback`、`accounting`；`npm run -s rules:helper-check`）、学习结果加 CPU 时间、派发槽位 `builtin:budget-dispatch`；`ORCHESTRATION.md` §3.5 写明槽位来自预算 | M7 | L2、L3、L4 | 是（宿主进程的 job，动到用户正在用的 DSH） |
| R10 | 晨报的规则板一节；检测器放开所需的统计 | M7 | L2 | 否 |
| R11（可选） | Kiro 的 hook 提醒（不入库，写在 `.agents/` 的说明里） | 任意 | 无 | 否 |

R1–R7 合起来是可以用的第一版：人手设在场，项目规则，租约，在场按钮让 DSH 降优先级、重活排队，面板（评审 F13：人最想要的那件事从第一版起就有）。R8–R10 让它不要人点，并且管住已经在跑的命令与 CPU 总量。D1 选 S2（全部按项目）时，R5 的租约降为项目级，R9 只剩派发槽位。

与 M3 的先后：两者都只依赖 split，可以并行写设计；实现按 `question-28` C，M3 骨架优先，规则板在推荐放最后与人话面板之后。会改同几个登记文件（§10.3），先合入的一方先改。R4 的 `digest-notice.ts` 与 M3 第 5 步要的是同一个文件，`glmHournessDesign` 服务（§10.3）同理，谁先做谁加。

批次 L4（`docs/DEVELOPMENT.md` §1.1）：R4–R7 合入后一批，R8–R9 合入后一批。规则行通过 L3 与第一批 L4 之后才改为默认启用（`AGENTS.md` 强制流程第 4 条）。

## 17. 不做的事

- agent、子 agent 与检测器写规则（人定；放开时要改的见 §2.5）。
- 给单条命令设 CPU 或内存上限，管 DSH 以外的进程，管磁盘、GPU 与网络带宽（§7.5）。
- 替人取桌面版的租约（检测器只显示「人在用桌面版」）。
- 按模型或套餐做任何自动切换（`docs/CHARTER.md` §6）；GLM 高峰只是一个信号。
- 把规则写成项目图的节点（§10.2）。
- 搬动 guard、图文件门禁与 M3 的规则（D5）。
- 跨宿主进程的派发槽位。
- 读用户 profile 里的配置值（例如核对模型选择器写进去的 `agent-default-model`）：只给提醒；要核对，读这个值要人同意，作为以后的任务。
- 入库的项目政策文件。

## 18. 由 agent 定、人可推翻的事项

每项的推荐（本设计采用的）在最后。

| 事项 | 选项 |
| --- | --- |
| 转述算不算人 | 1. 不算：规则只能在面板上点。代价是人在对话里说的「把这条规则解除」要人再去点一次，与宪章 §2 两个入口等价相悖。2. 算，但只经图上的拍板：agent 提一条提议（含 `kind: 'lift'`），再带人的原话 `graph_decide` 拍那张待决；原话写进历史、面板显示「你在对话里说」（采用，§2.5）：同项目图（`docs/ORCHESTRATION.md` §2.9.1），规则板自己没有写规则的工具，转错时人再改一次 |
| 项目规则存在哪 | 见 §4.1：工作区 `.llm/`；入库；用户级目录按项目分（采用） |
| 检测器做成什么样 | 见 §5.9：调用前的命令 hook；只用内置检查；只写信号的 hook（采用） |
| 信号怎样存 | 1. 全部进流水：留痕最全，代价是采样值每几秒一条，流水被噪声淹没。2. 记账信号进流水、采样信号进心跳文件，判定记录写下当时的值（采用，§5.1） |
| 排队时默认等还是当场拒绝 | 1. 在调用处等到解除：agent 不用重试，代价是 agent 停在一次调用上，人在电脑前时可能一停几个小时。2. 当场拒绝并开单，解除时唤醒（采用，`holdMs` 默认 0；人可以按规则设等待） |
| 每步提醒的时机 | 1. 每步都注入：最简单，代价是每步几百 token、请求前缀每步都变。2. 只在变化、压缩之后与目标轮注入（采用，同每步投影） |
| 辅助进程 | 见 §7.4：`ctx.subprocess`；引用 DSH 的内部绑定；编译的可执行文件；Node 子进程加 PowerShell Add-Type（采用） |
| CPU 上限的范围 | 见 §7.3：每条命令一个 job；整个宿主进程（采用） |
| CPU 上限的机制 | 见 §7.3：CPU 硬上限；亲和性限制加整个 job 强制低于正常；亲和性限制、宿主保持正常、辅助进程逐个降后代（采用，本机量过宿主的停顿） |
| 什么时候把宿主收进 job | 1. 第一次需要上限时（0.1）：代价是那之前派生、还在跑的命令永远在上限之外，正好是人坐下时最想压住的那批（评审 F1）。2. 规则行激活时就收进，人不在时不设限制（采用，§7.3） |
| 子 agent 结束后它的等待单 | 1. 取消（0.1）：代价是无人值守时被推迟的工作没人接（评审 F5）。2. 转给派发链的根，解除时唤醒根，重派复用同一张单（采用，§6.3） |
| `run_code` 里的子调用 | 1. 放行，与 guard 相同：代价是程序里的重活与驱动桌面版的命令不经规则板。2. 照样判定，排队按拦截返回、不开单（0.2）：代价是 `ptc` 呈现模式下每次调用都是子调用，排队一律变成没有单、没有唤醒的拦截（评审 F26）。3. 按 agent 的呈现模式区分：代价是要读 `modeFor`，它不在 `dsh-tools` README 的公开说明里。4. 照样判定、照常开单与唤醒，只是不在调用处等（采用，§6.2）：子调用只在非 native 模式下出现，有没有 `parent` 就够了 |
| 流水记录写什么 | 1. 只写操作与参数，重放时按操作重算：记录小。代价是清理、单号、保留期限这类依赖时钟与文件系统的决定在重放时复现不了，引擎自己的记录被判为不是引擎写的（评审 F20）。2. 写全部改动 `changes`（整条替换或删除），重放只照它执行（采用，§4.2、§4.4）：一个纯函数 `applyRecord` 同时服务写入与重放，`recovered` 与 `base` 不用特殊处理；代价是记录稍大（一张单、一个租约整条写） |
| 流水里核对不了的记录 | 1. 照样生效并提醒人：代价是伪造的放宽会先生效。2. 不生效，列给人按记录生效或忽略（采用，§4.5）：不生效的代价可逆 |
| 派发槽位的范围 | 1. 跨所有宿主进程：要在机器状态里实时记每个宿主的在跑数，多一份频繁写入。2. 按宿主进程（采用，§6.5） |
| 条件读不出时 | 1. 一律按成立：宁严勿松，代价是检测器一坏就挡住所有相关工作。2. 默认不生效，规则可以写 `onUnknown: apply`（采用） |
| 内置检测器的初始模式 | 1. 全部影子：最稳，代价是 GLM 高峰、CPU、内存这些按代码或测量算出的值也要等人放开。2. 推断性的（在场、桌面版前台）与人加的影子，按代码或测量算出的直接生效（采用，§5.3） |
| 给 agent 的工具 | 1. 不给工具，只给提醒：代价是 agent 看不到被截断的规则，也没有提议的入口。2. `rules_show` 与 `rules_propose` 两个，延迟加载（采用） |
| 提议怎样到人面前 | 见 §9.4：只记在规则板；只提图上的待决；两边各记一份、图上拍板、规则板照办（采用，照 `d-rules-human-only` 的「经图上的待决提给人」） |
| 面板的位置 | 1. 单独一个右侧栏页签：多一个入口。2. 设置页：人在工作时不在那里。3. 项目图页签的第五个视图加输入框旁的在场按钮（采用）：人已经在这个页签里看「需要你」；最终位置随 `m8-plain-language` 的设计（§9.2） |
| 里程碑 | 1. 新建一个里程碑：多一个路线条目。2. 核心、租约与面板最小版进 M4，预算全部进 M7（0.1）：代价是 M7 之前在场按钮不改变任何 CPU 占用（评审 F13）。3. 核心、租约、预算的优先级一级、重活排队与面板最小版进 M4，job 一级、检测器、派发槽位与晨报进 M7，呈现完整版随 M8（采用）：优先级与重活排队不要辅助进程；M4 本来就要影子模式机制与环境，M7 本来就要派发与运维 |

## 19. 待人定的事项

按 `d-option-card` 写（评审 F25）：每个选项一段加粗的「怎么做」（不超过 20 字），后面是得到与代价；推荐项放最后，多一行「为什么」；只有单向门的题带一行反方（`d-counter-line`），这里只有 D4 是单向门。表格按人选的表格版排（`d-option-card` 2026-10-29 的批注：选项 / 怎么做 / 得到 / 代价）；字母键照旧，人可以直接回「C」。编排方在对话里用 DSH 的问答卡交给人时，按钮上放加粗短语，说明放得到与代价，为什么与反方放题目说明。

### D1 规则板管多大范围

你问过「要不改成单项目的」。分量：双向门（改范围要迁移一次状态文件，规则内容不丢）。A、B、C 依次是 §3 的 S3、S2、S1。

| 选项 | 怎么做 | 得到 | 代价 |
| --- | --- | --- | --- |
| A | **全机一个规则库** | 所有项目的规则在一处，跨项目的规则只写一次 | 为一个项目写的规则可能误伤另一个项目 |
| B | **全部按项目** | 最小，和项目图一样按工作区分 | 两个项目会同时去动桌面版；在场要每个项目各点一次；CPU 上限没法按项目分，只剩排队 |
| C | **机器管资源，项目管规则** | 规则只管本项目；你在不在、桌面版、沙盒、CPU 预算与排队的工作全机共享 | 机器上多一份跨项目的状态；可以先只上项目规则那一半（§16 的 R1–R4），用一段时间再上机器那一半 |

为什么推荐 C：桌面版、沙盒和「你在不在」一台电脑本来只有一份，只有它们放到全机，规则仍是单项目的。

### D2 「你在用电脑」怎么判断

分量：双向门（检测器随时可以改回影子或删掉）。

| 选项 | 怎么做 | 得到 | 代价 |
| --- | --- | --- | --- |
| A | **只靠自动检测** | 不用点按钮 | 看视频不碰键盘 10 分钟会被判为走开，这时 LLM 的活全速跑 |
| B | **只靠手动按钮** | 输入框旁点「我在用电脑」或「我走开了」，不会判错 | 忘了点就和今天一样，LLM 的活不受限制 |
| C | **手动为主，自动先只记录** | 你点的总是算数；检测器在后台记它会怎么判，面板给出它和你对得上的比例，对得上 95% 以上、满 7 天、你手动改过至少 20 次时提示你可以放开 | 放开之前，你没点过的时候按「不在」处理（不限制） |

为什么推荐 C：空闲时间与前台窗口只是近似，先拿你的手动记录量出它准不准，放不放开由你点。

### D3 你在电脑前时，限速还是排队

分量：双向门（预算的数字随时能在面板上改）。

| 选项 | 怎么做 | 得到 | 代价 |
| --- | --- | --- | --- |
| A | **只限速** | 所有活照跑，只是优先级低、CPU 有上限 | 内存管不住，你另一个项目那种吃内存的构建照样占满内存 |
| B | **只排队** | 重活和多出的派发等你走开再跑；不要辅助进程，不把 DSH 放进系统作业 | 没标成重活的命令、已经在跑的长构建照样全速 |
| C | **重活排队，其余限速** | 标成重活的命令与超出槽位的派发等你走开；其余的活照跑，但低优先级、CPU 有上限 | CPU 上限要辅助进程（M7 起），在那之前只降优先级 |

为什么推荐 C：内存只能靠排队管，已经在跑的命令只能靠限速管，只用一种总有一类活管不住。

### D4 默认预算

定的是「你在」一档；「不在」一档都是正常优先级、不限 CPU、重活照跑、派发 4 路。分量：单向门。带 CPU 上限的档（A 与 C）让 DSH 每次启动时就把宿主进程放进 Windows 的一个系统作业，进去之后到 DSH 重启才出来；你不在时这个作业不限制任何东西，限制随时能放开，但「在作业里」这件事本身撤不回（§11.2 的不可逆清单）。

| 选项 | 怎么做 | 得到 | 代价 |
| --- | --- | --- | --- |
| A | **严档** | 你在电脑前时 LLM 几乎不占资源：最低优先级，CPU 只用 32 个逻辑处理器里的 4 个（10%），重活与派发全部排队 | LLM 几乎停工，测试都跑得很慢；DSH 进系统作业 |
| B | **宽档** | 不进系统作业，不要常驻的辅助进程：低于正常优先级，重活照跑，派发 2 路 | 只靠优先级，重活照样能把内存和风扇拉满 |
| C | **中档** | LLM 起的进程只在固定的 8 个逻辑处理器上跑（25%），你的程序用全部 32 个；重活排队，派发 1 路；低于正常优先级 | DSH 进系统作业，待到重启；DSH 启动早期开起来的少数进程不在上限内（面板写出个数） |

为什么推荐 C：本机试验里模拟的宿主进程树被限在 2 个处理器上打满时，宿主自己的延迟 p95 仍是 1.0 毫秒；限 8 个时 LLM 的构建仍有四分之一台机器可用（真实 DSH 上的量法在 §15 R9）。

反方：如果 LLM 跑构建时你的电脑只是风扇响、操作并不卡，宽档就够，也不让 DSH 进系统作业。

CPU 上限要到 M7 才有，在那之前 A 与 C 都只是降优先级加重活排队；数字以后可以在面板上随时改，从 C 改成 B 之后作业还在、只是不再限制，DSH 重启之后才不进作业。

### D5 已有规则收进规则板多少

分量：双向门（以后想搬再搬，代码规则留在原处不影响）。

| 选项 | 怎么做 | 得到 | 代价 |
| --- | --- | --- | --- |
| A | **全部搬进来** | 面板上能统一地临时关掉或改任何一条规则，包括 guard 的 | 要重写已经评审、真机验证过的 guard、图文件门禁与 M3 的门禁，有回归风险 |
| B | **一条都不收** | 规则板只管新规则，改动最小 | 面板上看不到全部在生效的规则；「一次只跑一个探针」「桌面版在用」照旧靠约定，出事时没人管 |
| C | **代码规则只列出，约定收进来** | 面板列出全部在生效的规则（在哪实现、是否生效）；探针一次一个、桌面版在用、换了模型要换回来，这三条约定真正执行 | 代码里的规则不能在面板上解除 |

为什么推荐 C：出事的是靠人记的约定；代码里的规则已经验证过，搬过来只多回归风险。

## 20. 修订记录

- 0.1（2026-10-29）：初稿。写稿期间人的输入与本稿的落点：「要不改成单项目的」（D1，推荐只把物理上只有一份的东西放机器一级）；「我需要的是抽象成一种概念」（§2：信号、资源、规则，资源管理是其中一族规则）；「先不允许自己加规则吧，只有人能动」（§2.5：引擎按身份核对，写明放开时要改什么）；「以后每个选项依旧推荐一个但是推荐的放到最后一个选项」（全文的选项与 §18、§19）；「自动检测？你想怎么设计？……借鉴一下hook的设计？」（§5：检测器是只写信号的 hook，§5.9 与 Kiro hook 对照）；`docs/DEVELOPMENT.md` §1.1 的新原则「一个优秀的软件或者工程怕的不是失败，而是失败后的预案做的够不够」（§11.2 按「怎样发现、之后怎样」写故障预案，并列出不可逆的东西与防线）。另按同日图上的新节点对齐：`d-rules-human-only` 写的「经图上的待决提给人」（§9.4：提议另提一张待决，图上拍板、规则板照办）；`question-26` 选 C（§2.6：主 Agent 的工具面里没有写文件的工具）；`m8-plain-language` 在重新设计面板（§9.2：规则板只定内容与写入路径，位置随那份设计）。
- 0.2（2026-10-29）：按设计评审第 1 轮（HIGH 1、MEDIUM 5、LOW 13）修订。本轮在一次性进程上补了第 2 轮本机试验（§7.2，`exp/exp-round2*.ps1`、`exp/exp-bootstrap.ps1`）。逐条：
  - F1（HIGH）：规则行激活时就把宿主收进 job，人不在时不设限制；辅助进程按 job 的进程列表把宿主的后代（含已经在跑的命令）降为低于正常，按 Toolhelp 快照找出激活之前派生、在 job 外的后代，只降优先级并在行健康与面板上报个数（§7.3、§7.4、§7.5、§11.2）；验收 §1.4 第 1 条按两级重写；R9 的 L3 加「人不在时起空转命令、切到人在之后被限且读到低于正常」（§15）。
  - F2（MEDIUM）：`attach` 先把 job 句柄复制进宿主、成功才收进（实测：创建者退出后有复制的句柄按名能打开，没有时错误 2）；重启的辅助进程按名打不开而 `hosts` 记着收进过时不新建 job，行健康与面板写「CPU 上限停在 <档位>，重启 DSH 才能改」（§7.3、§7.4、§11.2、§13）；R9 的 L3 加结束辅助进程、重启后重开并放开（§15 第 (5) 步）。
  - F3（MEDIUM）：人走开与卸载时先强制 Normal（并把亲和性放宽到全部处理器）再清标志，`os.setPriority(process.pid, 0)`，读回宿主与后代的优先级写进 `hosts`，不符即 degraded（§7.3、§11.2）；实测只清标志会停在 BelowNormal、亲和性同样停在被限的值；R9 的 L3 断言走开之后宿主与在跑的命令读到 Normal（§15 第 (4) 步）。
  - F4（MEDIUM）：确定的序列化 `canonicalJson` 加 `stateDigest`，写入与重放用同一对函数；重放逐条核对摘要，对不上的记录不生效、留在流水里、进 `unresolved`，人按记录生效或忽略；坏行之后到下一个锚点之前的记录同样不生效；改名失败留下 `.<文件>.pending`，读取时采用；§2.5、§4.5、§11.2、§11.3 对每种情形用同一个说法（§4.2、§4.4、§4.5）；写明这一层不防会算摘要的有意伪造（§7.5）。
  - F5（MEDIUM）：子 agent 会话结束时它的单转给派发链的根（M3 的 `dispatchRoot`，之前沿 `parentSession`），解除时唤醒根，根下重派的同一个调用复用这张单，找不到活的根才取消并写原因；子 agent 的排队文字改为「stop and report ticket q-N in your handoff」；会话结束另有每 5 秒 `agents.get` 的兜底（§6.3、§6.4、§10.4、§11.2）；L2 与 L3 场景 `rules-handover`（§15，V11）。
  - F6（MEDIUM）：R9 的 L3 按 `os.cpus().length` 算 k，取 `cpuPercent` 5（32 线程上 k = 2）、空转 s = max(4, 2k) 个线程，限制时合计不超过 1.1k、放开后不少于 1.5k，F1、F2、F3 的检查用同一组数（§15）；第 2 轮试验按这组数实测 1.94 核与 3.96 核。
  - F7（LOW）：读者看到不一致时取锁重读，一致就不算恢复（§4.5），L2 用例（§15 R2）。
  - F8（LOW）：进程与外部占用者取得时拿到随机 `token`，状态只存摘要，续租与释放要带它（§8.1、§8.3、§9.5、§12），L2、L3 用例。
  - F9（LOW）：限速从规则的执行方式里去掉，只留在内置预算规则里，人改预算的数字（§2.2、§2.3、§2.4、§4.2、§12）。
  - F10（LOW）：转述只经图上对提议待决的拍板生效；`rules_propose` 加 `kind: 'lift'`（§2.5、§9.3、§9.4、§18）。
  - F11（LOW）：带 `parent` 的子调用照样判定，排队按拦截返回、不开单，另有子调用的文字（§6.2、§6.4、§6.7）。
  - F12（LOW）：实测 CPU 硬上限打满时宿主停顿 p95 262–316 毫秒，与宿主优先级无关；改用 job 的亲和性限制，宿主保持正常、后代逐个降为低于正常，实测宿主定时器延迟 p95 1.0 毫秒；R9 的 L3 断言 p95 不超过 20 毫秒（§7.1、§7.2、§7.3、§15）。
  - F13（LOW）：预算的优先级一级与重活排队移到 M4（新 R6），job 一级、检测器与派发槽位留在 M7；步骤重新编号为 R1–R11（§16、§18）。
  - F14（LOW）：辅助进程经 `-EncodedCommand` 引导启动，引导核对正文的 SHA-256 后才运行，Node 启动前另核对一次；实测执行策略为 Restricted 时引导照常运行、被改过的正文退出码 9；去掉 `-ExecutionPolicy Bypass`（§7.4）。
  - F15（LOW）：写入时清掉关闭超过 24 小时的单与心跳不在超过 1 小时的宿主（§4.4 第 5 步）。
  - F16（LOW）：亲和性掩码对所有宿主相同，所以全机的宿主合计至多 k 个处理器；验收按这一点写（§1.4 第 1 条、§7.3）。
  - F17（LOW）：角色 `main-agent` 先读设计行服务 `glmHournessDesign.isMainAgent`，没有时退到投影；这是对 M3 的新要求，先实现的一方加（§2.3、§5.7、§6.7、§10.3）。
  - F18（LOW）：调用处等待时的界面表现标为推断，列为 V9，随 R4 的第一批 L4（§6.2、§15）。
  - F19（LOW）：依据改为 main `22bebec`，它包含评审写的 `f08981f`，以及之后的 `3ee62aa`（预案含优雅重试与事后可追溯）、`d-counter-line`、`question-27` B、`question-28` C；据此另加 §1.5（让人少做了什么）、§19 每组的反方、`rules_propose` 的 `counter`、§16 的实现先后。
- 0.3（2026-10-29）：按设计评审第 2 轮（MEDIUM 1、LOW 7）修订。本轮没有新的 Windows 试验；本稿新引用的 rc.3 行号按换行符重数过（`exp/linecheck-round3.cjs`，只读文件）。逐条：
  - F20（MEDIUM）：写入与重放用同一个纯函数 `applyRecord(state, record)`（`src/rules/store.ts`）。流水记录新增 `changes`：这次写入对状态的全部改动（整条替换或删除一个顶层字段或集合里的一项），由每个操作的规划函数（`src/rules/plan.ts`）在写入时算出，含带出的改动（单号、保留期限、失效的租约）与带 `cause: 'prune'` 的清理；`snapshot = stateDigest(applyRecord(current, record))`。重放只照 `changes` 执行，不读时钟、文件系统与进程表。`base` 的 `changes` 为空，`recovered` 的 `changes` 是设 `recovered` 与登记 `unresolved`，所以链没断时它们与别的记录同样核对，不再按 `state` 比对；`recovered` 生效时把它登记过的行从这次的跳过表里去掉，不重复报。评审给的写法（`candidate = {...current, seq, recovered, unresolved: 累积的跳过}`）与此等价：`recovered` 的 `changes` 正是这几项，写进 `changes` 之后锚点不需要单独一条比对规则。集合改为按 id 存的对象，`unresolved` 按行内容的摘要作键（轮换改名后不变），去掉 `skipped` 字段。`recovery-accept` 改为以人的身份照被跳过的行的 `changes` 生效（可以一次一组，`harness` 写的行也能补上）。验收 §1.4 第 5 条写明重建后摘要相同、引擎自己的记录不被列出、再清零一次结果相同；R2 加性质测试（5 个种子、每个 200 次写入，含清理、轮换、两行外来记录与各自的恢复、`recovery-accept`、`recovery-dismiss`，清零两次与从最早的流水重放），并写明 0.2 的写法在 (a) 失败（§4.2、§4.4、§4.5、§4.7、§11.2、§13、§15、§16、§18）。
  - F21（LOW）：`Holder` 加 `{kind: 'host', host, label}`；检测器运行者的租约由宿主代码以 `harness` 身份取，死活按心跳文件，期限 24 小时、每 12 小时续一次，心跳不进流水；§2.5 表里检测器一栏的租约改为拒绝（§2.5、§4.2、§5.5、§8.1、§8.2）。
  - F22（LOW）：`goals.get` 的证据改为 goal:611–614、880–888、348–353；`get` 对不是活实例的 agent 抛 `GoalError`，唤醒时按没有 goal 处理，R4 的 L2 加这一条（§6.3、§6.7、§15）。
  - F23（LOW）：提议单独存在 `proposals`（`Proposal`），规则与检测器里不再有 `proposed`、`rejected`。`rules_propose` 的输入改为 `summary`、`reason`、`ifSet`、`ifSkip`、`why`、可选的 `counter`；待决 `weight: 'two-way'`，两个选项的 `label` 由规则板按种类给定（不超过 20 个码点），`consequence` 取 `ifSkip`、`ifSet`，推荐 `set` 在最后，字段与上限按 `de0ccf6` 的 `CARD_LIMITS`，只经 `proposalQuestion` 一个函数组出。顺序为先提待决、成功后再记提议；图引擎拒绝时什么都不记、原样返回引擎的错误与字段路径；记提议失败时在工具结果与待决批注里写明，人拍板时 `acceptProposal` 返回 `missing`、停下交人（§2.2、§2.5、§4.2、§9.4、§11.2、§12、§13、§15）。
  - F24（LOW）：依据改为 main `0639bf5`，列出其中与本稿有关的提交（含 `d67980b`、`6f28898`、`44e8601`、`7aa8fe5`）与停在 `de0ccf6` 的卡片字段；文首加「依据的学科与标准」表与查过的现成方案；`stage.ts` 与 `main-agent.ts` 已在 main，§2.3 的角色与阶段两行随之改写（文首、§2.3）。
  - F25（LOW）：§19 按 `d-option-card` 重写：字母键 A、B、C，加粗的「怎么做」不超过 20 字，得到与代价分列（人选的表格版），推荐项最后、带「为什么」；D4 标为单向门并保留反方，其余四组是双向门、去掉反方（§0、§0.1、§19）。
  - F26（LOW）：核实子调用只出现在非 native 的呈现模式下（`run_code` 只对这些 agent 可见，tools:3075；`ptc` 下直接调用其他工具被拒，tools:3096–3101、3195–3197）。改为子调用照常开单、去重与唤醒，只是不在调用处等（`run_code` 的期限含子调用的等待，`dsh-tools/README.md`:136）；单上记 `nested`，排队与唤醒文字随之改写，删掉做不到的「Make it a direct tool call」；不需要读 `modeFor`（§4.2、§6.2、§6.4、§6.7、§7.5、§15、§18）。
  - F27（LOW）：job 外后代的恢复名单 `{pid, startedAt, prior}` 由宿主进程持有，`sweep` 的应答给出、`sweep` 的 `restore` 交回，随 `host-level` 写进 `hosts` 的 `outsideLowered` 留痕；恢复到各自的 `prior`，设不回的个数进 `outsideNotRestored` 并 degraded；L2 与 `rules:helper-check` 覆盖辅助进程重启后的恢复（§4.2、§7.3、§7.4、§7.5、§11.2、§13、§14、§15）。

