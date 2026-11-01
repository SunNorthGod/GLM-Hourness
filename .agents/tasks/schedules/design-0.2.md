# 循环板设计（项目图节点 `schedules`）

版本：0.2（2026-10-30），第二稿。0.1 经第 1 轮独立评审（同目录 `design-review.md`、`design-review.json`：CHANGES_REQUESTED，挡路 8 条：HIGH 4、MEDIUM 4；不挡路 10 条），本稿逐条处理，处理表在 §19。0.1 原文与草图留在同目录的 `design-0.1.md`、`mockup-loops-0.1.svg`（`.agents/` 不进 git）。改动最大的四处：插件的默认条目与事件改由各行经服务 `glmHournessLoops` 的 `contribute` 交给循环板，循环板的代码里不写别的行的条目（§3）；页面只看，人的写入只有对话与人敲的 `/loops` 命令（§7、§8）；在对话里加条目走 M3 的 `propose_to_human` 与 `record_human_answer`（§7.1）；GLM 的四条照 M6 0.3 计价服务的 `loopDefaults` 读，M6-L1 到 M6-L5 逐条落实（§3.4）。

依据：项目图节点 `schedules` 的正文与全部批注；人定的 `d-defaults-readonly`、`d-rules-visible`、`d-one-main-agent`、`d-chat-not-cards`、`d-design-onepage`、`d-peak-mode`、`d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-rules-human-only`、`d-ui-look-not-operate`、`d-plain-questions`、`metrics`；共用的人定清单 `.agents/tasks/design-context.md`（到「Peak mode and clock facts」一节）。相邻设计按今晚改过的版本：M7 `.agents/tasks/m7/design.md` 0.3（§2.5、§3.8.3、§3.8.4、§3.9、§3.11）；M6 `.agents/tasks/m6/design.md` 0.3（§4.4、§4.9、§5、§8、§18）；规则板 `.agents/tasks/rules/design.md` 0.6（§3.6、§6.3、§7.2 的 `RulesService` 与 `PeakModeService`、§9.3、§9.4、§10.7）；plain-ui `.agents/tasks/plain-ui/design.md` 0.6（§3.1、§4.7、§6.4、§11）；M3 附录 `.agents/tasks/m3/design-addendum.md` 0.3（§2.4、§3.3–§3.8）；M4 `.agents/tasks/m4/design.md` 0.3（§6）。另有 `docs/DESIGN.md` §2.4a、§6；DSH 运行时 `reference/dsh-desktop-0.2.1-rc.3/`（`dsh-schedule`、`dsh-tool-schedule`、`dsh-tool-goal`、`dsh-agent`、`dsh-agent-loop`、`dsh-api-session-controller`、`dsh-session`、`dsh-tools`、`dsh-commands`、`dsh-session-projection`、`dsh-workspace`）；本仓库 main `436fbe7` 的 `src/`。

证据写法：沿用 `docs/DESIGN.md` §2.4a。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，其他文件写出文件名；「m7:」「m6:」「rules:」「plain-ui:」「m3:」指上面各设计文件的节号。〔实读〕读过源码或包文档；〔推断〕由源码推出、没有运行；〔未核实〕列进 §10.2 的核实项，随 L3 或 L4 核对。

范围：只有设计。不改代码、已跟踪文件、`docs/graph/`、`~/.dsh`；要写进项目图的事项写在同目录的 `graph-ops-v02.json`，由编排方写入。

依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）：作业调度的常规做法（cron 与 systemd timer 的「错过的只补一次」、去抖与限次、同一项不重叠运行）；插件架构里的扩展点与登记表（宿主只定契约与校验，扩展方交数据，宿主不认识扩展方的内部）；事件驱动系统里的至少一次投递与幂等键（每个事件一个去重键，每次运行一个运行号）；可靠性工程（锁、超时、退避、只追加的记录、崩溃后从持久的事实重建）；安全工程（命令只由人写、最少的环境变量、给模型的文字先转义与脱敏）；人机交互与认知负荷（页面只说人话、只看不操作，改法写成一句能照说的话）；`docs/CHARTER.md` §7.1 条款 7（失败要出声）与条款 11（处处留痕）；`d-failure-plans`（按操作写发现、重试、恢复与留痕，不穷举）。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

- 循环板是编排层包 `dsh-hourness` 里的一块板（新行 `glm-hourness/loops`），放「到点了或碰到某件事，就去做一件事」。每一项由几样东西组成：什么时候（一次、每隔、每天、每周、cron；或某个事件）、做什么（告诉主 Agent 一段话；做一个 harness 动作再告诉主 Agent；跑人写的命令、结果交给主 Agent；或者由带来它的那一行自己做、循环板只列出）、谁带来的（哪个插件的哪一行，或人自己）。每跑一次都由 harness 记进指标流水。
- 代码只提供机制。循环板的代码里只有：条目与事件的格式和校验、到点怎样投递、事件怎样收集、命令怎样跑、记录怎样写、谁能写。编排层与 GLM 插件原本要写死的联动，都由各自那一行把条目当数据交给循环板，页面上写明是哪个插件带来的，只能看（`d-defaults-readonly`）：
  - M7 的执行行与运维行交 10 项（设计放行之后开始推进、交回之后派审查、审查过了之后合入、停下之后在对话里问人、活都关了之后派整体审查、合进主干之后跑一遍完整检查、重启之后接上、晨报、周报、夜间巡检），条目的数据留在 M7 的 `entries.ts`。
  - M4 交 2 项：env 行的「改完文件就跑检查」与图行的「同一处第三次返工之前停下问你」，都由它们自己执行，循环板列出、记录，并写出检查器自己的规矩。
  - GLM 通道包经计价服务的 `loopDefaults` 交 4 项（高峰开始时提醒模型、看状态时读额度，这两项由 GLM 包自己做；额度快用完时告诉你、登录失效时提醒你重新登录，这两项由循环板执行）。
  - 循环行自己带 4 项：依赖文件变了之后查依赖、有事等你太久时再说一次、GLM 高峰开始时按档位收放（由规则板执行）、GLM 高峰结束时接上挪开的活（少做档下主 Agent 闲着就叫醒它一次）。
- 人自己的条目只由人定：人在主 Agent 的对话里说「每 30 分钟查一下服务器，挂了告诉我」，主 Agent 先用 `loop_propose` 让循环板核对并记下这条提议，再用 M3 的 `propose_to_human` 把它写成四行给人看；人同意后主 Agent 用 `record_human_answer` 带人的原话记下，harness 核对原话，循环板照提议写入（与规则板的提议同一条路）。删除、恢复与确认存档恢复，人也可以在输入框打 `/loops delete|restore|ack`。页面上没有任何写入控件（`d-ui-look-not-operate`）。
- 时间：「到点告诉主 Agent」的条目用 DSH 自带的定时服务 `dsh-schedule`，任务绑在主 Agent 的会话上，DSH 负责时区、夏令时、cron、重启后补一次与发送记录；主 Agent 换会话时循环板把任务搬过去；在 DSH 任务页里改了循环板的任务，循环板按自己的定义改回。「到点跑命令或做 harness 动作」的条目由循环板自己的钟跑（不支持 cron），因为 DSH 的投递每次都会叫醒主 Agent、在人唯一的对话窗口里留一回合。
- 事件：一张运行时的事件表，由各行声明（M7 的 `hourness.*` 八个加一个新请求的、M4 的两个只供列出的 `env.files-edited` 与 `graph.third-reopen`、循环行自己的 `loops.*` 四个），另有循环行从计价服务推出的通道事件两个（`channel.quota-low`、`channel.login-rejected`）。各行经 `glmHournessLoops.emit` 交事件，循环板把它追加进项目的收件箱，带去重键；收件箱跨进程、跨重启，停机期间没处理的起来后照常处理。
- 去抖与限次：插件带来的事件条目默认 5 秒内的事件合成一次，人的条目默认 30 秒；插件的条目每项每小时至多 30 次、人的 6 次，超出的不丢，合进下一次；循环板自己执行的命令或 harness 动作直接引起的事件，10 分钟内又触发同一项时不跑，记「自己触发自己」。
- 与高峰模式和规则板：循环板跑的命令先经规则板的判定（`checkCall`）；高峰「不做」档下，只在规则板说这个会话此刻停着（`heldForPeak`，含人说的「这个会话本次高峰照常做」）时攒着事件消息，单解除后合成一条投出；档位只经规则板的服务读，不读规则板的文件。少做档的高峰结束时，主 Agent 若闲着、这段高峰里干过活、又不是在等你，循环板叫醒它一次接上挪开的活（M6-R5）。
- 失败：投递失败按 1、5、15 分钟重试，之后记失败、报行健康；命令超时结束整棵进程树；没有主 Agent 时事件消息先存着，24 小时后作废；所有结局都进记录，页面上看得到（§11）。
- 面板：第 2 层的一页，标题「循环板 · 到点了或碰到某件事，就去做一件事」，分组照 plain-ui §4.7：碰到某件事就做的、到点做的、本项目加的；每项一行灰字「<插件名>带来的 · 只能看」或「你在对话里加的」；人能改的地方只写一句「要改：跟主 Agent 说「……」，或在输入框打 /loops ……」。
- 所有规矩都在明面上（`d-rules-visible`）：§2.4 列出今天写在各处的每一条规矩去哪块板；会挡住动作的门在规则板，到点或碰到事就去做的在循环板。
- 要问人的：没有。替人定的方向列在 §18，放进一页放行稿 `onepage.md`。

## 1. 需求

### 1.1 来源

人的原话（取自项目图节点 `schedules` 与相关决定的转述）：

- 「新增一个循环任务或者定时任务面板如何？我们那些美化工作放成默认的，用户也可以自定义一些任务比如服务器巡查啊之类的，和钩子系统联动起来」
- 「定时任务差不多就那些，还有我忘记说的能联动的吗」
- 「我指的是，合进主干之后：跑一遍完整检查这种类似的我们编排层的东西，而且也没说咱们这个项目具体的东西。你重新讲」
- 「我指的是，你现在编排层自带的是写死进代码里的是吗？我想让你把这些和GLM插件自带的功能做到这个面板的默认功能里去，而不是写死进代码里。能理解吗」
- 「那现在就有一个规则板，一个循环板了是吧？我们几乎没有写死在代码里的逻辑了是吗，都抽象出来了？以及默认的东西先暂时不能修改、开关，只能看」（`d-defaults-readonly`）
- 「档位当然能选。」（高峰模式的档位不算改默认条目）
- 「没问题，项目所有规则确实应该都在明面上」（`d-rules-visible`：合入前的检查清单与必须全审清单是门，放规则板；改完文件就跑的检查器是循环板的条目）
- 「巡检应该由harness提醒主Agent发出。一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」（`d-one-main-agent`）
- 「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」（`d-peak-mode`）
- 「项目图那一套东西大部分是给人看的，而不是给人用的。」（`d-ui-look-not-operate`）；「我是要改产品的，而且聊天不仅是不给问答卡，是连选项都没有的那种，就彻底回归到我们的设计循环那里。你提几点和方案，我补充或者同意这种。」（`d-chat-not-cards`）

编排方记下、人没有反对的事实与提议：DSH 已经带定时服务 `dsh-schedule` 与任务页，时间触发用它，本模块补事件触发与面板；默认分三层（编排层、GLM 插件、本项目自己的）；本项目自己的几项不进产品，是人自己加条目的例子。

### 1.2 功能需求

- F1 条目模型：每一项写明什么时候、做什么、交给谁、谁带来的、为什么有它；上次与下次；最近一次的结论。
- F2 时间触发：一次、每隔、每天、每周、cron，按人看得懂的时区。
- F3 事件触发：从运行时的事件表里选；每个事件写明是谁报的、带什么字段、能怎样筛。
- F4 动作：告诉主 Agent 一段话；做带来它的那一行提供的 harness 动作，再按结果告诉主 Agent；跑人写的命令、结果交给主 Agent；由带来它的那一行自己做，循环板只列出与记录。
- F5 默认条目：编排层各行与 GLM 插件原本要写死的联动，都由那一行把条目当数据交给循环板；循环板的代码里没有别的行的条目；页面写明来自哪个插件的哪一行，只能看。
- F6 人的条目：人在主 Agent 的对话里加、改、删自己的条目，有一次记在图上、带人原话的决定；删除、恢复与存档恢复的确认另有人的命令。
- F7 一个主 Agent：报告与巡检是条目，动作是提醒主 Agent，不另开会话。
- F8 记录：每次运行的触发、结局、用时、退出码进指标流水；结论由主 Agent 记成这一项的批注。
- F9 漏跑与重启：宿主停机期间错过的时间点、各行交来而没处理的事件，起来后各处理一次。
- F10 防循环：去抖、限次、自己触发自己时不跑。
- F11 与高峰模式、规则板并存：命令经规则板判定；高峰不做时按规则板的判断攒着消息；少做档的高峰结束时接上挪开的活。
- F12 面板：第 2 层的一页，只看；首页在有事要人看时多一行。
- F13 明面上：今天写在各处的规矩，逐条有去处（规则板或循环板）。
- F14 GLM 的四条（M6-L1 到 M6-L5）：列出；额度快用完时在 GLM 有新用量后读额度；每分钟看一次登录状态；账号一级的事只交给一个主 Agent 一次；每次执行留痕。

### 1.3 非功能需求

- 不打扰人（`question-27` B）：循环板自己不出问答卡、不向人提问；要人定的事都由主 Agent 用 `propose_to_human` 在对话里说（`d-chat-not-cards`）。主 Agent 被叫醒说的话都在它的对话窗口里，次数看得见（页上每项写「每天大约叫醒主 Agent N 次」）。
- 失败要出声：任何一项停了、跑失败、被限次、被高峰攒着，页面与行健康都写出来；插件交来的条目读不懂时，行健康写明是哪个插件的哪一项。
- 激活期不抛错（`AGENTS.md`）：缺服务时降级并上报。
- 对所有模型生效：编排层的条目不依赖 GLM 包；GLM 的条目与高峰的两项只在计价服务在时出现。
- 不依赖反向代理；不改用户 profile。
- 同一个项目同一时刻只有一处在跑循环板（一把锁），宿主崩溃后由下一次启动接上；账号一级的事整台机器只有一处在判（另一把锁）。

### 1.4 验收条件

下面每条写明在哪一层验证（L2 单测、L3 沙盒探针、L4 桌面版真机）。条目 id 与事件 id 见 §4、§5。

1. 两个包都装、M3、M4、M7 已合入且各自交了条目、项目有主 Agent 时，循环板页按「碰到某件事就做的」「到点做的」「本项目加的」三组列出 M7 的 10 项、M4 的 2 项、GLM 通道包的 4 项与循环行自己的 4 项；每项写名字、什么时候、做什么、谁执行、上次与下次，下面一行灰字「<插件名>带来的 · 只能看」（GLM 包自己执行的两项写「GLM 通道带来的 · 它自己执行，这里只列出 · 只能看」）。页面没有写入控件：`ui/src/loops/` 下的源码不含 `commands.execute`（L2 静态检查，同 plain-ui 验收第 7 条）；L4 走查一遍。
2. 只装编排层包时，页面没有任何 GLM 的条目，没有 `loops.peak-start`、`loops.peak-end`，事件表里没有 `channel.*`；其余照常。L2。
3. 插件交来的条目整份校验：一项字段不合（例如 `title` 超过 60 个码点、文字里用了事件没声明的 `{占位}`、事件不在表里）时这一项不显示、不执行，其余照常，循环行的行健康写「<插件> 的 <行> 交来的 <id> 读不懂：<原因>」；另一个来源交来已被占用的名字空间时整份被拒，同一个来源再交一次是整份替换。L2。
4. 主 Agent 第一次出现（`/wish` 成功）之后 60 秒内，`schedule.catalog()` 里恰好有三条循环板的任务绑在主 Agent 的会话上：「循环板 · 晨报」每天 08:30、「循环板 · 周报」每周一 09:00、「循环板 · 夜间巡检」每天 02:30（M7 的 `operate.*` 三项），时区为宿主的系统时区。L3。
5. 主 Agent 移到另一个会话（`/wish here`）之后 60 秒内，这三条只绑在新会话上，旧会话上没有循环板的任务。L3。
6. 改回：有人在 DSH 自带的任务页里改了一条循环板任务的标题、文字或时间，60 秒内循环板按自己的定义改回：`schedule.update` 的 `expected` 取自 `schedule.list({sessionId})` 里那一条，返回 `updated: true`；DSH 判为没变化时不记改回；返回 `schedule_conflict`、`invalid_rule` 或别的码时删掉重建。删掉的 60 秒内重建。各记一笔 `loop-drift`，页面写一行说明。假宿主照 schedule:74–77、1806–1837 的样子做整键核对（多一个键就 `invalid_rule`）。主 Agent 调 `schedule_delete`、`schedule_update` 改循环板的任务，或调 `schedule_create` 建以 `Loop board: ` 开头的提醒，被拒，拒绝文字写明「循环板的事去找循环板」。L2（假宿主）与 L3。
7. M7 在跑循环板的那个宿主进程里交一条 `hourness.handback` 之后 10 秒内，主 Agent 收到一条消息，里面有任务 id 与「Dispatch its review」；指标流水里有这次运行的 `loop-fired` 与结局为 `delivered` 的 `loop-done`。L3；L2 用注入的时钟钉住去抖 5 秒加合并 2 秒。
8. harness 动作：一条 `hourness.design-released` 让循环板恰好调一次 M7 交来的 `run('execute.start-drive', 事件)`；返回 `done` 时主 Agent 收到条目里固定的那段话；返回 `skipped` 时记 `skipped` 与原因、不发消息；返回 `failed` 并带 `tell` 时把 `tell` 交给主 Agent；`run` 抛错或被拒时记 `failed`，循环行的行健康写明。同一个去重键第二次交来时不跑（记录 `duplicate`）。L2。
9. 同一项在去抖时间里来 10 个事件，只跑一次，消息里列出 10 个；人的条目一小时里第 7 次触发不在这一小时里跑，记 `suppressed`（原因 `rate`），这几个事件合进下一个整点之后的第一次运行；页面写出。L2。
10. 自己触发自己：人的一项「`loops.file-changed` 看 X 时跑一条会改 X 的命令」，命令跑完后 X 的变化不再触发它，记 `suppressed`（原因 `self-loop`）；主 Agent 被这一项告诉之后自己去改 X，照常触发。L2。
11. 人加一项「每 5 分钟跑 `node -e "process.exit(1)"`，没过时告诉主 Agent」（`report: 'on-failure'`）：每次运行主 Agent 收到一条带退出码 1 与输出末行的消息（结局 `reported`）；改成 `process.exit(0)` 之后，第一次运行给主 Agent 一条「又过了」（`reported`），之后不再发，记录照写（结局 `ran`，退出码 0）。L2（假宿主）与 L3。
12. 命令输出里有密钥形状的字串时，给主 Agent 的消息里它被遮住（`[redacted]`）；指标流水里没有任何输出正文。L2。
13. 人设了一条规则板规则拦下某条命令时，循环板不跑这条命令，记 `blocked` 与规则 id；判为排队时记 `deferred`，规则解除后 5 分钟内跑。`checkCall` 收到的 `args.command` 是 `argv.map(quoteForPwsh).join(' ')`；条目没写 `glmSpend` 时不带这个选项；不带 `session`、`role`、`model`。L2（真实的 `checkCall` 与临时目录）。
14. 高峰不做：主 Agent 会话的 `heldForPeak` 为真时，事件消息不投，记 `held`；它变成假之后 1 分钟内按先后合成一条投出，第一行写 `Held during GLM peak (level stop) since <time>.`。人对那张单打了 `/rules let`（`heldForPeak` 因此为假）时，消息照常投。`src/loops/` 不导入 `src/rules/` 里 `service.ts`、`check.ts` 以外的文件，也不读规则板的任何文件（L2 静态检查）。L2（假的规则服务与注入的时钟）。
15. 少做档的高峰结束：档位为少做、主 Agent 闲着、它在这段高峰里走过至少一步、它的 goal 不是在等人也不是被人暂停时，高峰结束后 1 分钟内主 Agent 恰好收到一条消息（没有 goal 时经 `followup`，goal 为 active 时经 `inject`），写着高峰结束的时刻；goal 因 `hourness-idle-rounds` 阻塞而执行行交了 `execute.resume-after-peak` 时，先恰好调一次这个动作；档位为无影响或不做、这段高峰里它一步也没走、goal 阻塞原因为 `hourness-waiting-human`、goal 为 `paused` 时，都不发，记 `skipped` 与原因；同一段高峰只发一次。L2（注入的时钟与假的规则服务）。
16. 停机与重启：宿主起来后 `loops.host-restarted` 恰好触发一次，宿主被强杀时 `crashed` 为真、正常退出时为假；循环板自己的钟管的命令项在停机期间到了点，起来后补跑一次，记录标 `late`，漏了几个点都只补一次；停机期间各行交进收件箱的事件起来后照常处理。L2、L3 与 L4。
17. 在对话里加：主 Agent 调 `loop_propose`，循环板记一条 `open` 的提议、不写图；主 Agent 调 `propose_to_human`（`attach: 'loops:<提议 id>'`），图上多一张提议式待决，正文最后一行是「循环板提议 `lp-<id>`」；人同意后 `record_human_answer` 返回 `decided`，这一项生效，`source` 记人的原话与待决 id，结果里多一行 `Loop board: proposal lp-<id> took effect (<entry id>).`；补充、否掉时什么都不写；原话核对不过时什么都不写。拍板写在图上而循环行当时不在时，循环行起来后 60 秒内按图补写。循环板从不写带选项的待决。L2（临时目录里的真实图引擎与 M3 的 `record.ts`）。
18. 人的命令：人在输入框打 `/loops delete 服务器巡查`、`/loops restore <id>`、`/loops ack`，写入的身份是人，结果一行中文；对插件带来的 id 打 `/loops delete` 返回「插件带来的条目只能看」，什么都不写；`/loops-apply` 不存在。L2。
19. §6.10 的每一种结局在 L2 里各有一个用例：每次运行恰好一条 `loop-fired`，最终恰好一条带最终结局的 `loop-done`；`deferred` 与 `held` 是中间状态，各写一条 `loop-done`，之后放行、投出或作废时再写一条最终的。L2。
20. `entries.json` 被清零或截断时，下一次读取按 `journal.jsonl` 重建，人的条目一项不少，页面写「存档坏了，已按变更记录重建」。L2。
21. 页面上全部固定字串、插件交来的 `title` 与 `why` 经 `plainWordsIn`（M3 附录的 `src/graph/plain-question.ts`）检查为空；插件交来的不为空时照样显示，行健康写一次。L2。
22. `/hourness-status` 有循环行一行；宿主没有 `schedule` 服务时这一行为部分生效，原因写「没有 DSH 定时服务：到点告诉主 Agent 的条目不跑，事件条目照常」。L2。
23. 账号一级的事只说一次（M6-L4）：两个项目各有主 Agent，GLM 的登录状态从 `ok` 变成 `rejected`，恰好一条消息投给最近一次走过步的那个主 Agent；回到 `ok` 再变成 `rejected` 时再投一条；额度快用完同一个窗口同一期只投一条。L2。
24. 读额度的时机（M6-L2）：用量流水里出现一条 GLM 记录、上一次读数已满 15 分钟时，恰好调一次 `quota({waitMs: 3000})`；15 分钟内的第二条记录不读；用量流水里没有 GLM 记录时一次都不读；登录状态的查看只用 `quota({waitMs: 0, read: false})`，不发请求。L2（假的计价服务）。
25. §2.4 的去向表里每一行，在 L4 走查时都能在它写的那块板上找到。L4。

### 1.5 不做

- 默认条目的修改、开关、删除（`d-defaults-readonly`；以后放开时要改的地方见 §7.4）。
- 页面上的任何写入（新建、改、删、恢复、确认）；`/loops-apply` 随面板的写入删去。
- 人用命令新建条目（命令行里写不下一条完整的条目，新建只在对话里）。
- agent 直接写条目（agent 只能提议，§7.3）。
- 循环板代码里写别的行的条目或事件（各行经 `contribute` 交，§3）。
- 命令类与 harness 动作类的条目用 cron（§6.2）。
- 在没有会话控制器的进程（headless 运行、探针与标定）里跑条目；那里没有循环板的服务，M7 按它自己的退路执行事件条目（m7:§2.5）。
- 每次运行新开一个会话（`d-one-main-agent`）。
- 后台定时读 GLM 额度（只在 GLM 有新用量之后读，M6-L2）。
- 跨项目的人的条目（`question-32` C：条目按项目）；账号一级的只有 GLM 交来的两项。
- DSH 之外的通知（邮件、系统通知）。
- 把规则板的检测器搬到循环板（检测器只写信号，仍归规则板；两块板共用一套时间写法，§2.2）。
- 自己从 git 推出主干前进（0.1 的每 30 秒查一次删去：主干前进由 M7 按核对与执行后比对的记录交事件，§4.2）。

### 1.6 方向清单自查（`d-design-onepage`）

| 人定的方向 | 本设计怎样遵守 |
| --- | --- |
| 代码只提供机制，插件的每个行为都是写明插件的默认条目（2026-10-30 的讨论，`schedules` 批注） | 循环板的代码只有格式、校验、投递、执行与记录；M7、M4、GLM 包与循环行自己的条目都是数据，经 `contribute` 或计价服务的 `loopDefaults` 交来，页面写「<插件名>带来的」（§3、§5） |
| 默认条目只能看，档位能选（`d-defaults-readonly`） | 插件的条目不进存储；存储只收 `u-` 开头的 id；页面没有控件；档位仍在规则板，循环板只读它（§6.9） |
| 项目所有规则在明面上（`d-rules-visible`） | §2.4 的去向表；M4 检查器自己的规矩写在它那一项下面（§5.3） |
| 一个项目一个主 Agent，报告与巡检由 harness 提醒它做（`d-one-main-agent`） | 晨报、周报、巡检是条目，动作都是提醒主 Agent；不开运维会话（§5.1） |
| 问人改成聊天（`d-chat-not-cards`） | 加条目走 `loop_propose` 加 M3 的 `propose_to_human`、`record_human_answer`；循环板不写带选项的待决；默认条目的提醒都叫主 Agent 用 `propose_to_human`（§7.1、§5） |
| 面板只看不操作（`d-ui-look-not-operate`） | 页面没有写入控件；人能改的地方写一句「要改：跟主 Agent 说……，或在输入框打 /loops ……」（§8） |
| 高峰模式三档，默认少做（`d-peak-mode`） | 档位与执行归规则板；循环板经 `heldForPeak` 与 `glmHournessPeakMode` 读，不另判；少做档的高峰结束时接上挪开的活（§6.9） |
| 设计放行后主 Agent 自己推进（`d-auto-drive`） | M7 的 10 项全部在板上执行，含 0.1 漏掉的「审查过了之后合入」与「活都关了之后派整体审查」（§5.1） |
| 子 agent 的模型由主 Agent 选（`d-main-agent-models`） | 派审查、派整体审查的条目都只提醒主 Agent 去派，模型由它选（§5.1） |
| git 交给主 Agent，harness 只守主干前进那一刻（`d-main-agent-shell`） | 循环板不做 git 写操作；主干全量检查是 M7 的 harness 动作（§5.1） |
| 规则只由人定（`d-rules-human-only`） | 人的条目只由人写；agent 只提议（§7） |
| 界面说人话（`d-plain-questions`） | 页面字串与插件交来的标题过 `plainWordsIn`（验收第 21 条） |
| 指标由 harness 写（`metrics`） | 每次运行的记录由循环行写，模型写的不算（§6.10） |

## 2. 概念

### 2.1 一项是什么

| 字段 | 必填 | 含义 | 取值 |
| --- | --- | --- | --- |
| `id` | 是 | 项目内唯一 | 编排层各行交来的写 `<名字空间>.<名>`（M7 的 `execute.*`、`operate.*`，M4 的 `env.*`，循环行自己的 `loops.*`）；通道包经计价服务交来的写 `<通道>:<名>`（`glm:*`，M6 §5 的写法）；人的条目 `u-<8 位十六进制>`，写入时分配 |
| `title` | 是 | 给人看的名字 | 1–60 个码点（与 M6 的 `ChannelLoopDefault.title` 同一上限），不含换行 |
| `why` | 插件的条目必填 | 为什么有它，一句人话 | 1–150 个码点，不含换行；人的条目可以没有 |
| `when` | 是 | 什么时候 | `Trigger`（§2.2） |
| `action` | 是 | 做什么 | `Action`（§2.3） |
| `limits` | 否 | 去抖与限次 | `{debounceSeconds?: 0–3600, maxPerHour?: 1–60}`；缺省见 §6.7 |
| `quiet` | 否 | 安静时段 | `{from: 'HH:MM', to: 'HH:MM'}`，宿主系统时区；只用于告诉主 Agent 的事件条目：落在这段时间里的消息攒到时段结束再投 |
| `scope` | 否 | 归谁 | `project`（缺省）或 `machine`：账号一级的事，同一件事整台机器只交一次，交给最近走过一步的那个主 Agent（M6-L4）；只给通道包交来的条目 |
| `basis` | 否 | 它还依赖什么，一句人话 | 至多 80 个码点；显示在来源一行，例「依据 GLM 峰谷定价（GLM 通道包）与高峰模式（规则板）」（M6 §8.3 要的那句） |
| `ownRules` | 否 | 这一项自己写死的规矩，人话 | 至多 6 行，每行至多 80 个码点；展开后显示为「<名字>自己的规矩」（例 M4 检查器的三个数，§5.3） |
| `source` | 由循环板写 | 谁带来的 | 插件：`{kind: 'plugin', plugin: <包名>, row: <行 id>}`；人：`{kind: 'person', at, via: 'chat' \| 'board', relay, question?, proposal}` |
| `rev` | 由循环板写 | 版本 | 人的条目每写一次加一；插件的条目取交来那一份规范化 JSON 的 SHA-256 前 12 位十六进制 |
| `status` | 由循环板写 | 人的条目的状态 | `active` 或 `deleted` |

插件交来的部分（`id` 到 `basis`）在代码里叫 `LoopEntryDefinition`，加上后三个字段叫 `LoopEntry`。

一项属于一个项目（`question-32` C），`scope: 'machine'` 的两项除外。项目键与规则板同一个函数（rules:§7.3：从会话头的 `cwd` 往上找 `.git`，主检出与它的工作树是同一个项目）；M5 的 `src/data/project-root.ts` 先合入就用它，否则循环行与规则板谁先实现谁建这个模块。

### 2.2 什么时候

```ts
// src/loops/model.ts：纯类型与校验，不用 Node 内置模块。客户端、M7 的 entries.ts、M4 的 env 行与规则板都导入这里的类型
export type Trigger =
  | { readonly kind: 'once', readonly at: string }                         // ISO 8601，带时区偏移；严格晚于写入时刻，至多一年后
  | { readonly kind: 'every', readonly seconds: number }
  | { readonly kind: 'daily', readonly time: string, readonly timeZone?: string }                      // 'HH:MM'，IANA 时区
  | { readonly kind: 'weekly', readonly time: string, readonly weekdays: readonly number[], readonly timeZone?: string }  // ISO 星期 1–7
  | { readonly kind: 'cron', readonly expression: string, readonly timeZone?: string }                 // 五字段；只用于告诉主 Agent
  | { readonly kind: 'event', readonly events: readonly string[], readonly filter?: EventFilter, readonly params?: EventParams }   // §4
  | { readonly kind: 'command', readonly names: readonly string[] }        // 只用于动作为 self 的条目：人敲这些命令时（GLM 包的看状态读额度）

/** 键是事件声明里的字段名；每个字段只能用它声明的那一种比法（§3.2 的 LoopEventField.filter） */
export type EventFilter = Readonly<Record<string, FilterTest>>
export type FilterTest =
  | { readonly in: readonly string[] }        // string 字段：值在列表里
  | { readonly is: boolean }                  // boolean 字段
  | { readonly atLeast: number }              // number 字段
  | { readonly paths: readonly string[] }     // strings 字段（路径列表）：有一个路径匹配就算
/** 键是事件声明里的参数名（例 loops.file-changed 的 path）；参数决定这个事件怎样被发现，不是对载荷的筛选 */
export type EventParams = Readonly<Record<string, string | number | boolean>>
```

- 时间的五种与 `dsh-schedule` 的选择器一一对应（`after_seconds` 不用：条目都按绝对时刻存）：`once` → `at`（带偏移的字符串），`every` → `every_seconds`，`daily` → `daily {time, time_zone}`，`weekly` → `weekly {time, time_zone, weekdays}`，`cron` → `cron {expression, time_zone}`（`dsh-schedule/README.zh.md`「使用此包」的表；选择器的键多一个少一个都拒，schedule:1052–1059、1118–1123、1366〔实读〕）。存储里写 `timeZone`，发给 `dsh-schedule` 时写 `time_zone`；`time` 存 `HH:MM`，发送时补成 `HH:MM:00`。DSH 存下的是它规范化之后的样子（`time` 为 `HH:mm:ss.SSS`，时区为 `Intl` 的规范名，schedule:1056–1057、212–222〔实读〕），循环板比较时用 DSH 返回的那一份，不自己再算一遍规范化（§6.2）。
- 时区：人的条目写入时总写明时区（取宿主的系统时区 `Intl.DateTimeFormat().resolvedOptions().timeZone`）。插件交来的时间条目可以不写，意思是「宿主此刻的系统时区」：每次对账时现取，人改了系统时区，DSH 里的任务跟着改。页面只在时区与系统时区不同时写出时区（同 DSH 任务页，`dsh-client-ui-schedule/README.zh.md`「规则」一段〔未核实，0.1 评审没有核对，照抄文档〕）。
- 下限：告诉主 Agent 的 `every` 至少 600 秒：每次投递都叫醒主 Agent、在人的对话窗口里留一回合，10 分钟一次就是每天 144 回合。DSH 自己的下限是 60 秒（schedule:21），循环板更严。跑命令与 harness 动作的 `every` 至少 300 秒，它们不叫醒任何人，下限只防把机器跑满。
- 事件：`events` 列 1–4 个事件 id（例 M7 的「审查过了之后」同时听 `hourness.review-passed` 与 `hourness.review-skipped`）。`filter` 的键必须是每个列出的事件都声明了的字段，比法必须是那个字段声明的那一种；`params` 的键必须是事件声明的参数。`paths` 的写法：以 `/` 结尾的是相对项目根的目录前缀；带 `/` 的是相对项目根的文件；不带 `/` 的名字在任何一层目录都算（`package.json` 也匹配 `packages/glm/package.json`）。
- 一套写法两块板用：规则板检测器的触发（rules:§5.2 `DetectorTrigger`）取同一个 `Trigger` 的子集：`every`、`daily`、`weekly` 与 `{kind: 'event', events: ['loops.file-changed'], params: {path}}`。0.1 写的 `{event: 'file-changed', filter: {path}}` 随事件表的名字空间改了，规则板下一稿跟着改（§17）。下一次的时刻（夏令时缺的钟点跳过、重叠的取较早那次）写在 `src/loops/trigger.ts` 一处，循环板的钟与规则板的检测器都调它。

### 2.3 做什么

```ts
export type Action =
  | { readonly kind: 'tell-main', readonly text: string, readonly wake: boolean }
  | { readonly kind: 'harness', readonly action: string, readonly tell?: { readonly text: string, readonly wake: boolean } }
  | { readonly kind: 'run', readonly argv: readonly (readonly string[])[], readonly report: 'always' | 'on-failure' | 'on-change', readonly note?: string, readonly timeoutSeconds?: number, readonly glmSpend?: 'optional' | 'necessary' }
  | { readonly kind: 'self', readonly does: string, readonly by: string }
```

| 动作 | 给人看的说法 | 谁能用 | 谁执行 | 结果给谁 |
| --- | --- | --- | --- | --- |
| `tell-main` | 告诉主 Agent：<一句话> | 插件与人 | 循环行；到点的经 `dsh-schedule` 投递（§6.2） | 主 Agent；`wake` 为假时等它下一步再看，不叫醒它 |
| `harness` | <动作的人话>，再按结果告诉主 Agent | 只有插件，动作 id 必须是交来它的那一份声明过的（§3.1） | 交来它的那一行的 `run(action, event)`；循环板调用、等结果、记录（§6.5） | 主 Agent：结果里带 `tell` 时投 `tell`，否则结果为 `done` 时投条目的 `tell` |
| `run` | 跑 <命令>，<每次 / 没过时 / 结果变了时>告诉主 Agent | 只有人 | 循环行的命令执行器（§6.6） | 主 Agent |
| `self` | <`does`> | 只有插件 | 交来它的那一行自己（`by` 写哪一行或哪个包，例 `glm-hourness/env`、`glm-hourness/rules`、`dsh-glm-zcode`） | 那一行自己定；循环板只列出，那一行经 `recordRun` 报它的每次运行（§3.1），报不了的（GLM 包）页面不写「上次」 |

- 给模型的文字（`tell-main.text`、`harness.tell.text`）里的 `{名字}` 由事件载荷的同名字段填；名字必须是 `when.events` 里每个事件都声明了的字段（通道事件的 `{line}` 也是声明过的字段，由循环板在推出事件时填，§4.3）；时间条目的文字不能有占位。填进去的值经 `escapeForPrompt`：字符串去掉控制字符、换行写成 `\n`、双引号与反斜杠前加反斜杠、至多 200 个码点（多的写 `…`）；字符串列表逐项这样处理后以 `, ` 连起来、至多 20 项（多的写 `and N more`）；数与布尔原样。文字里引号要不要加由写文字的一方定（M6 的 `"{line}"` 自己带引号）。目的是载荷里的标题、路径与原因不能提前结束一句、另起一行冒充指示。
- 每条消息的第一行固定为 `Loop board: <id> (default of <插件>).`，人的条目写 `(added by the human)`，模型与人在对话里都看得出它从哪来；到点类的提醒交给 DSH 时，这一行末尾另加 `Change it on the loop board, not here.`（§6.2）。各行交来的文字从第二行起。
- `run` 的 `report`：`always` 每次都把结果交给主 Agent；`on-failure` 每次没过都交，没过之后第一次过了也交一次（让主 Agent 知道好了），其余不交；`on-change` 只在这次的过与不过和上一次不同时交（第一次运行算不同）。「过」指每条命令都退出 0、没有超时、跑得起来。`note` 是交结果时放在前面的一段话（至多 500 个码点），告诉主 Agent 拿结果做什么。
- 命令只由人写：`run` 只能出现在人的条目里（§7）；命令不经 shell，`argv` 的第一项是程序，要 shell 的写成 `["pwsh", "-NoProfile", "-Command", "…"]`（同 rules:§5.3）。0.1 的第二种命令来源（读 `norm-merge-gate` 的 `$` 行，给「合进主干之后跑完整检查」用）删去：那件事改由 M7 的 harness 动作做（§5.1），循环板不再碰门禁工作树。
- 时间触发配 `harness` 或 `run` 时由循环板自己的钟跑（§6.2）；出厂的条目里没有时间触发的 harness 动作。

为什么是四种、每种只有一个执行者：人要的三种（告诉主 Agent；跑命令、结果交给主 Agent；harness 带的联动「做一件事再告诉主 Agent」）覆盖了今天各行要交给循环板的全部；第四种 `self` 是那些必须在别处当场执行的事（检查器在改完文件的那一步之前跑、高峰的收放在规则板的执行边界上、GLM 的高峰提醒在 GLM 的请求里），把它们再在循环板上实现一遍就成了两套机制管同一件事。所以 `self` 的条目，循环板只负责列出、记录与显示，页面写明谁执行。同一件事只有一处在做，两块板各显示它的一面。

### 2.4 所有规矩去哪块板（`d-rules-visible`）

两块板的分界：规则板管「一件事要发生时让不让做」，在执行边界当场拦下、排队或只告知；循环板管「一件事发生了或到点了就去做一件事」。门的内容仍可以存在项目图的规范与工具节点里，两块板负责显示。

| # | 今天写在哪 | 是什么 | 去哪 | 那里怎样显示 |
| --- | --- | --- | --- | --- |
| 1 | 规范节点 `norm-merge-gate` | 合入前的检查清单 | 规则板「会挡住动作的门」（rules:§9.1，plain-ui §4.7）；主干全量检查用它的命令，是 M7 的 `execute.trunk`（循环板，§5.1） | 规则板列出每条原文；循环板那一项写「用合入前的检查清单的全部命令」 |
| 2 | 规范节点 `norm-review-floor` | 必须全审的改动 | 规则板「会挡住动作的门」 | 同上 |
| 3 | M4 的 env 工具节点（检查行） | 改完文件就跑的检查器 | 循环板 `env.checks-after-edit`，M4 交来、env 行执行 | 每个批过的工具节点一行，写检查命令与「来自你批准的工具节点」 |
| 4 | M4 §6.3、§6.5、§6.6 写死的数 | 检查器自己的规矩：一步至多等 20 秒、同一检查器在一个会话里连续失败 3 次后不再跑、没有检查器覆盖的语言每个会话提醒一次（m4:§6、验收表 m4-checks 第 2–4 条） | 循环板 `env.checks-after-edit` 展开后「检查器自己的规矩」一段 | 原样写出三个数 |
| 5 | M4 §4（规划规矩，`src/graph/reopen.ts`） | 同一处第三次返工之前停下问人 | 循环板 `graph.third-rework`，M4 经图行交来、图工具执行 | — |
| 6 | M7 0.3 §3.11.1 的三条时间条目 | 晨报、周报、夜间巡检 | 循环板 `operate.morning`、`operate.weekly`、`operate.patrol`，M7 交来 | 时间、上次、下次 |
| 7 | M7 0.3 §3.11.1 的七条事件条目 | 设计放行之后开始推进、交回之后派审查、审查过了之后合入、停下之后问人、活都关了之后派整体审查、合进主干之后跑完整检查、重启之后接上 | 循环板 `execute.*` 七项，M7 交来；harness 动作（开始推进、主干全量检查、重启对账）由 M7 执行 | — |
| 8 | M7 的门（写入范围、派发链只读、主干前进的核对、完成门禁、停下之后不再派等八道） | 会挡住动作的门 | 规则板「写在代码里的规则」（rules:§10.1，M7 合入后登记） | 只读 |
| 9 | 编排方的提议 | 依赖文件变了之后查依赖；有事等你太久时再说一次 | 循环板 `loops.deps-after-merge`、`loops.remind-waiting`，循环行自己带 | — |
| 10 | GLM 包的高峰提醒（`glm-prompt`） | 高峰开始时提醒模型 | 循环板 `glm:peak-reminder`（GLM 包自己执行）；默认规则「GLM 峰谷定价」在规则板 | 循环板写「GLM 通道包自己执行，这里只列出」 |
| 11 | 规则板的高峰模式（rules:§3.6） | 高峰开始与结束时按档位收放 | 档位与执行边界上的收放在规则板（档位只显示，改法是 `/rules peak` 或跟主 Agent 说，rules:§9.1）；开始与结束这两个时刻在循环板 `loops.peak-start`（由规则板执行）与 `loops.peak-end`（不做档由规则板恢复；少做档由循环板叫醒闲着的主 Agent） | 循环板写「此刻是否高峰、档位、下一次变化」与「档位在规则板上看，要改：在输入框打 /rules peak」 |
| 12 | M6 的额度读取（`/glm-status`、`/hourness`） | 看状态时读一次额度 | 循环板 `glm:quota-on-command`（GLM 包自己执行） | 同第 10 行 |
| 13 | M6 0.3 §8.2 | 额度快用完时告诉你 | 循环板 `glm:quota-low`，循环板执行 | — |
| 14 | M6 0.3 §4.9、§8.2 | 登录失效时提醒重新登录 | 循环板 `glm:login-rejected`，循环板执行 | — |
| 15 | guard 的规则、图文件只经图工具、M3 的写入规则、主 Agent 没有写文件的工具、危险 git 命令前存快照 | 安全底线 | 规则板「写在代码里的规则」（rules:§10.1） | 只读 |
| 16 | 循环板自己的门（新） | agent 不能经 DSH 的定时工具改循环板的任务、不能冒充循环板建提醒（§6.2） | 规则板「写在代码里的规则」的 `loops:schedule-tools`（rules 0.6 已列这一行） | 只读 |
| 17 | 循环板自己的护栏（新） | 去抖、限次、自己触发自己、命令的超时与最少环境、给模型的文字转义与脱敏、一个项目一把运行锁 | 循环板页底「循环板自己的规矩」 | 写出数字 |
| 18 | 规则板的等待单唤醒 | 排队的调用在条件解除后叫回 agent | 规则板（「排队」的后半截，rules:§6.3） | 规则板「在等的工作」 |
| 19 | 本仓库的 Kiro 钩子（会话开始时提醒 `reading-digest` 是否到期） | 每周读文章 | 自举（`dogfood`）开始后改为本仓库循环板「本项目加的」一项（§5.5）；之前照旧 | — |

### 2.5 仍在代码里的

- 机制：条目与事件的格式和校验（§2、§3.2）、事件怎样收集（§6.3）、到点怎样投递（§6.2）、命令怎样跑（§6.6）、记录怎样写（§6.10）、谁能写人的条目（§7）；规则板与项目图本身的机制。
- 各行自己的条目表：M7 的 `src/execute/entries.ts`、`src/operate/entries.ts`，M4 的 env 行的一张表，GLM 包的 `src/glm-llm/loop-defaults.ts`，循环行自己的 `src/loops/defaults.ts`。它们是数据，在页面上原样显示，只是暂时放在代码里、不能改（`d-defaults-readonly`）。每张表只在它那一行里，循环板的代码不导入别的行的表。
- 安全底线：§2.4 第 15、16 行，显示在规则板上。
- GLM 通道里必须和 ZCode 一字不差的部分（请求头、签名、系统提示词原文），不是规矩，不上板。
- 循环板自己的护栏（§2.4 第 17 行）：防的是循环板自己出毛病，页面写出数字。

## 3. 各行怎样把条目与事件交给循环板

0.1 把编排层的 11 项写在循环行自己的 `src/loops/defaults.ts` 里，同一件事因此在 M7 的 `entries.ts` 与循环行里各定义一遍（评审 F1）。本稿改为登记表：循环板只定格式、校验与执行，条目与事件由拥有那件事的那一行交来。M7 0.3 已按这个形状写好它那一侧（m7:§2.5「名字以那份设计为准，M7 只改 entries.ts」），下面是定稿的接口。

### 3.1 服务 `glmHournessLoops`

```ts
// src/loops/service.ts：只有类型、常量与读取函数，不导入循环行的其余代码（M7、M4 与 M3 导入它）
import type { ServiceLookup } from '../shared/dsh-min.ts'
import type { LoopEntryDefinition } from './model.ts'

export const LOOPS_SERVICE = 'glmHournessLoops'

export interface ContributionSource {
  readonly plugin: string                    // 包名：dsh-hourness
  readonly row: string                       // 行 id：glm-hourness/execute
}

export interface LoopEventField {
  readonly name: string                      // /^[a-z][A-Za-z0-9]{0,31}$/
  readonly type: 'string' | 'number' | 'boolean' | 'strings'
  readonly title: string                     // 人话，1–20 个码点，页面写筛选时用
  /** 能怎样筛；不写即不能筛。in 只配 string，is 只配 boolean，atLeast 只配 number，paths 只配 strings */
  readonly filter?: 'in' | 'is' | 'atLeast' | 'paths'
}

export interface LoopEventParam {
  readonly name: string
  readonly type: 'string' | 'number' | 'boolean'
  readonly title: string
  readonly required: boolean
  readonly min?: number
  readonly max?: number
}

export interface LoopEventDeclaration {
  readonly id: string                        // <名字空间>.<名>，名字空间与同一份交来的条目相同
  readonly title: string                     // 人话：「一件活交回了」
  readonly fields: readonly LoopEventField[] // 载荷的字段；信封另有 at、session
  readonly params?: readonly LoopEventParam[]// 只给循环行自己推出的事件（§4.1）
  readonly personSelectable: boolean         // 人能不能在自己的条目里用它
  /** 只给 self 条目引用：循环板不收这个事件（例 M4 的 env.files-edited 只在 env 行内部发生） */
  readonly listedOnly?: boolean
}

export interface Contribution {
  readonly events?: readonly LoopEventDeclaration[]
  readonly entries: readonly LoopEntryDefinition[]
  /** 这一行提供的 harness 动作；条目的 harness 动作只能用这里列出的 id */
  readonly actions?: readonly { readonly id: string, readonly title: string }[]
  /** 循环板调用 harness 动作。不抛错，失败写进结果；actions 非空时必有 */
  run?(action: string, event: LoopEventRecord): Promise<HarnessResult>
  /** 只给页面：一项展开后的明细行（例 M4 每个批过的检查器一行）。同步、不抛错；至多 20 行，每行至多 160 个码点 */
  details?(entry: string, project: string): readonly string[]
}

export type ContributeResult =
  | { readonly ok: true, readonly dispose: () => void, readonly accepted: readonly string[], readonly dropped: readonly { readonly id: string, readonly reason: string }[] }
  | { readonly ok: false, readonly reason: string }

export interface LoopEventInput {
  readonly event: string
  readonly cwd: string                       // 发生它的会话的工作目录，按 §2.1 算项目键
  readonly session?: string                  // 相关的会话（M7 交持有者会话）
  readonly key: string                       // 去重键，1–200 个字符；同一个项目里同一个键 7 天内只处理一次
  readonly payload: Readonly<Record<string, unknown>>
}

export type EmitResult =
  | { readonly ok: true, readonly id: string, readonly duplicate: boolean }
  | { readonly ok: false, readonly code: 'unknown-event' | 'invalid' | 'no-project' | 'busy' | 'io', readonly message: string }

/** 循环板交给 run 的事件：收件箱里的一行，加上去抖合进来的个数 */
export interface LoopEventRecord {
  readonly id: string                        // ev-<16 位十六进制>
  readonly event: string
  readonly at: string
  readonly project: string                   // 项目根的绝对路径
  readonly session?: string
  readonly key: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly merged: readonly { readonly id: string, readonly key: string, readonly payload: Readonly<Record<string, unknown>> }[]   // 合进同一次运行的其余事件，按先后
}

export type HarnessResult =
  | { readonly outcome: 'done', readonly tell?: string }
  | { readonly outcome: 'skipped', readonly reason: string }
  | { readonly outcome: 'failed', readonly reason: string, readonly tell?: string }

/** self 条目的一次运行，由执行它的那一行报 */
export interface ListedRun {
  readonly cwd: string
  readonly entry: string
  readonly outcome: 'ran' | 'reported' | 'skipped' | 'failed'
  readonly durationMs?: number
  readonly exits?: readonly number[]
  readonly reason?: string                   // 一行，至多 120 个码点
}

/** 与规则板的 AcceptRequest、AcceptResult 同形（rules:§7.2）；契约测试核对两边互相可赋值 */
export interface AcceptRequest {
  readonly questionId: string
  readonly graphDir: string
  readonly cwd: string | undefined
  readonly by: { readonly actor: 'human' | 'llm', readonly relay?: string }
}
export type AcceptResult =
  | { readonly ok: true, readonly proposal: string, readonly outcome: 'accepted' | 'rejected', readonly entry?: string }
  | { readonly ok: false, readonly code: 'missing' | 'busy' | 'io' | 'invalid' | 'forbidden', readonly message: string }

export interface LoopsService {
  /** 激活时交出条目、事件与 harness 动作。同一个来源再交一次就整份替换上一次；不抛错 */
  contribute(source: ContributionSource, contribution: Contribution): ContributeResult
  /** 交一个事件：校验后追加进项目收件箱（§6.3）。不抛错，promise 不被拒 */
  emit(event: LoopEventInput): Promise<EmitResult>
  /** self 条目执行它的那一行报一次运行；只认 self 条目的 id，不抛错 */
  recordRun(run: ListedRun): void
  /** M3 的 propose_to_human 带 attach 'loops:<id>' 时先问（§7.1 第 2 步）；只读内存，不抛错 */
  attachable(request: { readonly cwd: string | undefined, readonly proposal: string }): { readonly ok: true } | { readonly ok: false, readonly message: string }
  /** M3 的 record_human_answer 拍板成功之后调用（§7.1 第 4 步）；不抛错 */
  acceptProposal(request: AcceptRequest): Promise<AcceptResult>
}

/** 读服务；不在时为 undefined；成员类型不对时也为 undefined，并回调 problem（同 pricingService） */
export function loopsService(ctx: ServiceLookup, problem?: (message: string) => void): LoopsService | undefined
/** 待决正文末行「循环板提议 `lp-<8 位十六进制>`」；与 loopProposalIdOf 互为逆 */
export function loopProposalLine(proposal: string): string
export function loopProposalIdOf(body: string): string | undefined
```

- 谁提供：循环行在 `ctx.inject(['sessionController'], sub => …)` 里 `sub.provide(LOOPS_SERVICE, …)`（cordis 的 `inject`，`src/shared/dsh-min.ts`:303 的注释与 `src/graph/panel-row.ts`:122 的用法〔实读〕；会话控制器的服务名 `sessionController`，api-session-controller:2952〔实读〕）。所以只有能投递的进程（DSH 的 Web 组合，桌面版）有这个服务；headless 运行、探针与标定里没有它，M7 照它的退路自己执行事件条目（m7:§2.5 末段），不会出现「服务在、却没人执行」的进程。
- 交条目的一方怎样交：在自己的 `apply` 里 `ctx.inject([LOOPS_SERVICE], sub => { const r = sub[LOOPS_SERVICE].contribute(source, contribution); if (r.ok) sub.effect(() => r.dispose) })`，循环行后到或重启时自动重交，卸载时自动撤回〔推断：`inject` 对本包 `ctx.provide` 的服务与对宿主服务同样生效，§10.2 V12〕。不成立时的退路：交的一方在每次 `agent/created` 时调 `loopsService(ctx)?.contribute(...)`，同一个来源再交只是替换，重复交没有副作用；`dispose` 在自己的 `ctx.effect` 里调。
- `contribute` 同步完成：整份按 §3.2 校验，合格的条目立刻出现在页面上（`view.json` 的下一次重写）与执行表里；不合格的进 `dropped`，循环行的行健康报一次。返回 `ok: false` 只有两种：来源的名字不合；名字空间已被另一个来源占用（§3.2）。
- `emit`：校验事件 id 在当前的事件表里、载荷合它的声明、`cwd` 算得出项目键；在收件箱锁内追加一行（§6.3）；这个进程正跑着这个项目时立刻交给处理函数，不等文件监视。`busy`、`io` 时循环行的行健康 degraded「没能把『<事件>』记进收件箱：<原因>」，调用方不必另报，也不重试（漏了的那一次怎样被发现，见 §6.3 末条）。M7 在 `agent/pre-step` 等热路径里调用，可以不等这个 promise。
- `run`：循环板在执行一项 harness 条目时调用（§6.5），调用放在一个异步上下文里，记着这次运行的运行号（§6.7 用它认出「自己触发自己」）；循环板等它的结果，至多 6 小时（M7 门禁锁的最长持有时间，m7:§3.8.3），过了记 `failed`（`reason: 'timeout'`）、不再等，动作本身由那一行自己收场。`run` 抛错或 promise 被拒时记 `failed`，循环行的行健康写「<行> 的 harness 动作 <id> 出错：<消息前 80 字>」。
- `recordRun`：只认当前执行表里 `self` 条目的 id，其余丢掉并计数；写一对 `loop-fired`、`loop-done`（§6.10）。M4 的 env 行每跑完一次检查、图工具每提一次第三次返工的待决调它；规则板不调（高峰两项的记录由循环行自己在高峰变化时写，§5.2）；GLM 包不调（它在另一个包里，自己的事件进指标流水，M6 §14.2）。

### 3.2 交来的东西怎样校验

| 项 | 规则 | 不合时 |
| --- | --- | --- |
| 来源 | `plugin` 匹配 `^[a-z0-9@/._-]{1,64}$`，`row` 匹配 `^[a-z0-9/._-]{1,64}$` | 整份拒绝，`ok: false` |
| 名字空间 | 一份里所有条目、事件与动作的 id 都以同一个名字空间开头（`execute.`、`operate.`、`env.`、`graph.`）；例外一条：`glm-hourness/execute` 交的事件以 `hourness.` 开头（M7 0.3 先定的名字，§3.3），别的来源不能用 `hourness.`；`loops` 留给循环行，`channel` 留给通道事件；一个名字空间只属于第一个交它的来源，同一个来源再交是替换 | 被占用时整份拒绝；循环行的行健康 degraded「<名字空间> 已由 <行> 交过」 |
| 个数 | 一份至多 32 项条目、16 个事件、16 个动作 | 多出的丢掉，各记一条 `dropped` |
| 事件 id、条目 id、动作 id | `^[a-z][a-z0-9-]{0,15}\.[a-z0-9-]{1,48}$`，一份里不重复 | 那一个丢掉 |
| 事件的字段 | 至多 16 个；`name` 合 §3.1 的写法、不重复，不叫 `at`、`session`；`filter` 与 `type` 的搭配合 §3.1 的注释；参数同理 | 那个事件丢掉，引用它的条目随之丢掉 |
| 条目的 `title`、`why`、`basis` | §2.1 的长度；不含换行 | 那一项丢掉 |
| 条目的 `when` | §2.2 与 §12 的规则；`events` 里每个 id 是这一份声明的、循环行自己的（§4.1）、通道的（§4.3）或另一份当前交着的；`listedOnly` 的事件只能配 `self`；`command` 只能配 `self`；`cron` 只能配 `tell-main` | 那一项丢掉 |
| 条目的 `action` | `run` 不收（命令只由人写）；`harness.action` 必须在这一份的 `actions` 里；`self.by` 1–64 个字符；`tell-main.text` 与 `harness.tell.text` 1–2000 个字符，每个 `{名字}` 都是 `when.events` 里每个事件都声明了的字段（时间条目不能有占位） | 那一项丢掉 |
| 条目的 `limits`、`quiet`、`scope` | §2.1 的范围；`scope: 'machine'` 不收（只给通道包的两项，§3.4） | 那一项丢掉 |
| 人话 | 条目的 `title`、`why`，事件与字段的 `title` 经 `plainWordsIn`（M3 附录 §2.8） | 照样收下、照样显示；循环行的行健康写一次「<id> 的说法里有 <词>」 |
| 依赖的事件此刻没有谁交 | 条目引用的事件属于一份已撤回或从没交过的（例 M7 的执行行没启用时 `loops.deps-after-merge` 引用的 `hourness.trunk-advanced`） | 照样收下；页面这一项灰显，写「<事件的人话>现在没有谁报（<行> 没启用），这一项现在不跑」 |

丢掉的项不显示、不执行，返回在 `dropped` 里，循环行的行健康按（来源、id）各报一次「<插件> 的 <行> 交来的 <id> 读不懂：<原因>」（验收第 3 条）。插件的行为不因此消失而不出声：交的一方照 M7 的写法也在自己的行健康里报（M7 的 E8 测试钉住它自己的表全部被接受）。

### 3.3 编排层各行交来的

| 行 | 名字空间 | 条目 | 事件 | harness 动作 | 条目表在哪 |
| --- | --- | --- | --- | --- | --- |
| `glm-hourness/execute`（M7） | `execute` | 7 项（§5.1） | `hourness.*` 中的八个与本稿新请求的 `hourness.outside-advance`（§4.2） | `execute.start-drive`、`execute.trunk-check`、`execute.reconcile`，以及本稿新请求的 `execute.resume-after-peak`（§5.2） | `src/execute/entries.ts` |
| `glm-hourness/operate`（M7） | `operate` | 3 项（§5.1） | 无 | 无 | `src/operate/entries.ts` |
| `glm-hourness/env`（M4） | `env` | 1 项（§5.3） | `env.files-edited`，`listedOnly` | 无 | `src/env/` 里的一张表（M4 定文件名） |
| `glm-hourness/graph`（M4 的 R1 那一部分） | `graph` | 1 项（§5.3） | `graph.third-reopen`，`listedOnly` | 无 | `src/graph/reopen.ts` 旁的一张表（M4 定文件名） |
| `glm-hourness/loops`（本稿） | `loops` | 4 项（§5.2） | `loops.*` 四个（§4.1） | `loops.peak-end` | `src/loops/defaults.ts` |

M7 的事件 id 以 `hourness.` 开头，与它的条目的名字空间（`execute.`）不同：M7 0.3 先定了这些名字（m7:§2.5），本稿不让它改名，名字空间规则对事件放一个例外：`hourness.` 开头的事件只收 `glm-hourness/execute` 交来的（写在 §3.2 的校验里）。

### 3.4 通道包交来的（M6-L1 到 M6-L5）

通道包不导入编排层的代码（split 0.3 §2.7 的边界），所以它不调 `contribute`，而是把条目放在计价服务的 `loopDefaults` 里（m6:§5 的 `ChannelLoopDefault`），循环行读出来、换成自己的条目。M6 说循环板要别的形状时只改 `channel-loop.ts` 与 `loop-defaults.ts` 两个文件（m6:§8.1）；本稿照 M6 0.3 的形状读，不要它改。0.1 另设的服务 `glmHournessChannelLoop` 与推送 `subscribe` 删去（评审 F2）。

换法只在一个函数里：`channelEntries(pricing, problem)`（`src/loops/channel.ts`），读 `loopDefaultsOf(pricing, problem)`（M6 已按它的 §11 逐条校验），每一项：

| `ChannelLoopDefault.when` | 换成的 `when` | `runBy` 换成的 `action` | `scope` |
| --- | --- | --- | --- |
| `peak-start` | `{kind: 'event', events: ['loops.peak-changed'], filter: {edge: {in: ['start']}}}` | `channel` → `{kind: 'self', does: title, by: 'dsh-glm-zcode'}` | `project` |
| `command` | `{kind: 'command', names}` | 同上 | `project` |
| `quota-low` | `{kind: 'event', events: ['channel.quota-low'], params: {usedPercent, exhaustsWithinMinutes, afterUsageMinutes}}` | `loop-board` → `{kind: 'tell-main', text: tell, wake: false}` | `machine` |
| `login-rejected` | `{kind: 'event', events: ['channel.login-rejected']}` | 同上 | `machine` |

`source` 写 `{kind: 'plugin', plugin: 'dsh-glm-zcode', row: 'glm-hourness/glm-login'}`（提供计价服务的是 `glm-login` 行，`src/glm-llm/login-row.ts`:40–43）。`why` 原样。`runBy` 与 `when` 的别的搭配（例如 `channel` 配 `quota-low`）当作不合，丢掉并报一次。通道包以后加新的 `when` 种类时，循环板读不懂就丢掉那一项、报一次，不猜。

M6 对循环板的五条要求逐条落在这里：

| # | M6 的要求（m6:§8.4） | 本稿怎样做 | 在哪 |
| --- | --- | --- | --- |
| M6-L1 列出 | 只读列出 `loopDefaultsOf(pricing)` 的条目；`runBy: 'channel'` 的写「GLM 通道包自己执行，这里只列出」 | 四项都列出，`self` 的两项来源一行写「GLM 通道带来的 · 它自己执行，这里只列出 · 只能看」。没有计价服务时什么都不写：plain-ui §2 定了只装编排层包时面板上不出现模型名，M6 要的那一行「GLM 通道包未装，或它的 glm-login 行未启用」因此不写（§17 告诉 M6） | §8.2 |
| M6-L2 额度快用完 | 用量流水里出现新的 GLM 记录、上一次读数满 `afterUsageMinutes` 分钟时调 `quota({waitMs: 3000})`；`quotaLowOf` 命中且这一期没说过时交 `tell`（`{line}` 为 `quotaLowLine`） | 机器一级的运行者（§6.1）每一拍读用量流水新增的行，见到 `isGlmModel(model)` 为真的记录、且 `quota({read: false}).reading.at` 已满门槛（没有读数也算满）时读一次；读完用条目的 `params` 组成 `QuotaLowRule` 调 `quotaLowOf`；命中、且「窗口名 + 重置时刻（相差 120 秒内算同一期）」不在机器一级的已说记录里时，产生 `channel.quota-low`，载荷 `{window, usedPercent, resetAt?, line}`，`line` 为 `quotaLowLine(window, now)` | §4.3、§6.1 |
| M6-L3 登录失效 | 至多每分钟一次 `quota({waitMs: 0, read: false})`；`login.state` 由别的值变成 `rejected` 时交一次；回到 `ok` 后再变成 `rejected` 时再交一次 | 机器一级的运行者每一拍（60 秒）调一次，记下上一次的 `state`；由别的值变成 `rejected` 时产生 `channel.login-rejected`，载荷 `{since, path?, line}`，`line` 为 `loginLine(login, now)`；变成 `ok` 时清掉已说记录里这一件 | §4.3、§6.1 |
| M6-L4 交给谁 | 账号一级的事同一件只交一次，交给最近一次有活动的那个项目的主 Agent | `scope: 'machine'`：事件只在机器一级产生一次，写进「最近一次有主 Agent 走过步的项目」的收件箱（§6.1 的 `lastMainStep`），由那个项目的运行者投递；已说记录在机器一级（§9.1 `machine/told.json`）。主 Agent 自己走 GLM 而登录被拒时它回不了话：首页那一行写「GLM 登录失效了：在输入框打 /glm-login」（§8.3），这正是 M6 说的「改在面板上显示」 | §6.4、§8.3 |
| M6-L5 留痕 | 每次执行（交给主 Agent、读额度）记一条指标事件，由循环板写 | 交给主 Agent 的每一次是一次运行（`loop-fired`、`loop-done`）；循环板发起的每一次额度读取写一条 `loop-read`（§6.10）；每分钟一次的登录状态查看只读本机文件、不发请求，不记（一天 1440 条只是噪声），状态的每次变化随运行记下 | §6.10 |

高峰开始与结束两项不在 GLM 包里（它们要看档位，GLM 包不知道档位，m6:§8.3），由循环行自己带，`basis` 写「依据 GLM 峰谷定价（GLM 通道包）与高峰模式（规则板）」（§5.2）。

### 3.5 没有循环板时

| 情形 | M7 | M4 | GLM 通道包 |
| --- | --- | --- | --- |
| 循环行没启用，或这个进程没有会话控制器（headless、探针、标定） | 服务不在：事件条目由 M7 的 `entries.ts` 在本进程里照同一张表执行，时间条目不跑（m7:§2.5 末段） | env 行照常执行检查与第三次返工的待决（它们本来就是 env 行自己做的），只是没有地方列出 | 高峰提醒与看状态读额度照常；额度快用完与登录失效没有人执行，也没有主 Agent 可告诉（m6:§8.4 末段） |
| 循环行在，另一个 DSH 进程持有这个项目的运行锁 | 服务在：M7 照常交事件，事件进收件箱，由持锁的进程处理（§6.3） | 照常 | 机器一级的运行者是持机器锁的那个进程（§6.1） |

## 4. 事件表

事件表在运行时由四部分合成：循环行自己推出的（§4.1，声明在 `src/loops/events.ts`）、M7 交来的（§4.2）、循环行从计价服务推出的通道事件（§4.3）、M4 交来的只供列出的（§4.4）。页面的「什么时候」一栏用事件的 `title`；人新建条目时能选的只有 `personSelectable` 为真的那些。每个事件的信封是 `{id, event, at, project, session?, key, payload}`（§3.1 `LoopEventRecord`）。

### 4.1 循环行自己推出的（`loops.*`）

| id | 人话 | 怎样发现 | 字段（能怎样筛） | 参数 | 停机期间发生的 | 人能选 |
| --- | --- | --- | --- | --- | --- | --- |
| `loops.host-restarted` | DSH 重新启动了 | 循环行开始跑一个项目时对照 `state.json` 的 `host`（§6.8） | `previousStart` string；`downMinutes` number（`atLeast`）；`crashed` boolean（`is`）：上次没有写下正常退出；`rebooted` boolean（`is`）：开机时刻不同；`appChanged` boolean（`is`）：DSH 程序文件的大小或修改时间与上次不同（§10.2 V6） | — | 本身就是 | 是 |
| `loops.waiting-on-human` | 有事等你超过一段时间 | 每小时一次读项目图，取 plain-ui 的 `needsOf(graph, [], now)`（`src/graph/plain-view.ts`，plain-ui §5.4）里的两种：开着的人定待决、等人批准的提议；plain-ui 那一步没合入时取 `openItems` 里同样的两类。`since` 是它们进入等人状态的时刻 | `items` strings：只列这次新越过门槛的，每件写成 `<id> "<title>" since <MM-DD HH:MM>`，同一件 24 小时内只列一次；`count` number（`atLeast`） | `olderThanHours` number，必填，1–168 | 状态型：起来后照算，不需要补 | 是 |
| `loops.file-changed` | 某个文件变了 | `fs.watch` 加每一拍（60 秒）比一次大小与修改时间作兜底（同规则板检测器的文件触发）；变了之后 60 秒内不再变才算一次 | `path` string；`size` number；`mtime` string | `path` string，必填：存在的目录下的绝对路径；一个项目至多 20 个 | 起来时比一次，变了补一次 | 是 |
| `loops.peak-changed` | GLM 高峰开始或结束 | 计价服务的 `peak(now)`（`src/shared/pricing.ts`:27）；定时器设在 `nextPeakChange(peak, now)`（M6 Q1 或规则板 R4 加进同一个文件，m6:§5）；每一拍也比一次 | `edge` string（`in`：`start`、`end`）；`until` string：这一段高峰的结束（`start` 时）或下一段的开始（`end` 时） | — | 起来时与记下的值比，不同就补最近的那一次 | 否：高峰怎么办在规则板选档位 |

0.1 的 `main-advanced`（每 30 秒查一次 git）删去：主干前进由 M7 按它的核对与执行后比对的记录交事件（§4.2），比轮询准，也不会和 M7 各报一次（评审 F1）。

### 4.2 M7 交来的（`hourness.*`）

名字、何时与载荷照 m7:§2.5 的表；「字段」一栏是本稿定的声明（字段的类型与能怎样筛），M7 照它写进 `entries.ts`。信封里的 `session` 是持有者会话。

| id | 人话 | 何时（M7） | 字段（能怎样筛） | 人能选 |
| --- | --- | --- | --- | --- |
| `hourness.design-released` | 设计放行了 | 主 Agent 的一步里看到焦点目标放行、这次放行还没开始推进（m7:§3.9.1） | `goal` string（`in`）；`release` string | 是 |
| `hourness.handback` | 一件活交回了 | `done` 的交回处理完、有效深浅不是不审（m7:§3.6.2） | `task` string（`in`）；`attempt` number（`atLeast`）；`status` string（`in`）；`depth` string（`in`）；`reviewTask` string；`commits` number；`floorHit` string：碰到必须全审清单的哪一条，没有时为空串 | 是 |
| `hourness.review-passed` | 审查过了 | 审查通过 | `task` string（`in`）；`round` number | 是 |
| `hourness.review-skipped` | 按理由不审 | 有效深浅为不审 | `task` string（`in`） | 是 |
| `hourness.stopped` | 一件活停下来了 | 审查、检查或目标整体的审查停下（m7:§3.7.3） | `node` string（`in`）；`kind` string（`in`：`review`、`check`、`acceptance`）；`rounds` number | 是 |
| `hourness.tasks-closed` | 一个目标下的活都关了 | 一个目标下的任务都关了 | `goal` string（`in`） | 是 |
| `hourness.trunk-advanced` | 合进主干了 | 主干前进且核对通过（m7:§3.8.4） | `from` string；`to` string；`tasks` strings；`files` strings（`paths`）：`git diff --name-only from to`，至多 200 项；`truncated` boolean | 是 |
| `hourness.outside-advance` | 主干在系统之外前进了 | M7 在 `advances.jsonl` 记 `{by: 'outside'}` 时（m7:§3.8.4 末两段；本稿新请求，§17） | `from`；`to`；`files`（`paths`）；`truncated` | 是 |
| `hourness.host-started` | 主 Agent 的会话在这次启动后第一次走动 | 主 Agent 会话在这个进程里第一次走步或被创建 | — | 否：只给重启对账用 |

`commits`、`floorHit` 与两个前进事件的 `files`、`truncated` 是 M7 0.3 的载荷里没有、它的提醒文字里却要用的（`execute.handback` 的「<commits> commits」「raised to full: <floor hit>」），本稿把它们写进声明，M7 填（§17）。

### 4.3 通道事件（`channel.*`）

由机器一级的运行者（§6.1）照通道包交来的条目推出（§3.4），不认得任何一个具体的通道：只要计价服务的 `loopDefaults` 里有 `quota-low`、`login-rejected` 这两种 `when`，就按条目的参数推。

| id | 人话 | 怎样发现 | 字段 | 参数 | 停机期间 | 人能选 |
| --- | --- | --- | --- | --- | --- | --- |
| `channel.quota-low` | 额度快用完了 | §3.4 的 M6-L2 一行 | `window` string；`usedPercent` number；`resetAt` string；`line` string：`quotaLowLine` 的中文一行 | `usedPercent` 1–100；`exhaustsWithinMinutes` 1–1440；`afterUsageMinutes` 1–1440 | 不补；下一次读到再判 | 否 |
| `channel.login-rejected` | 通道的登录被拒了 | §3.4 的 M6-L3 一行 | `since` string；`path` string；`line` string：`loginLine` 的中文一行 | — | 不补；起来后第一拍照判 | 否 |

`{line}` 就是这两个事件声明的字段，M6 的 `tell` 文字照它填（m6:§8.2）。

### 4.4 M4 交来的，只供列出（`env.*`、`graph.*`）

| id | 人话 | 何时（M4） | `listedOnly` |
| --- | --- | --- | --- |
| `env.files-edited` | 一个 agent 改了文件 | env 行在那个 agent 的下一步之前推出这一步之前改过的文件（m4:§6.2） | 是：只在 env 行内部，循环板不收 |
| `graph.third-reopen` | 同一件活第三次重开 | 图工具里 LLM 第 3 次把同一节点从完成改回进行中（m4:§4，`src/graph/reopen.ts`） | 是：只在图工具内部 |

### 4.5 以后可加的（本版不做）

一个 agent 的回合出错（`agent/error`，agent-loop:880 发出，监听方式没有核对）；会话打开（`agent/created`）；规则板的信号变了（检测器写的信号，例如服务器负载）。加一种事件：属于某一行的，由那一行在它的 `Contribution.events` 里声明，循环板不改；循环行自己推出的，改 `src/loops/events.ts`，经设计评审。

## 5. 默认条目

给模型的文字是英文，`{…}` 由事件载荷的同名字段填（§2.3）。每条消息的第一行固定为 `Loop board: <id> (default of <插件>).`，下面各条只写第一行之后的部分。人看到的「做什么」一栏是页面上的说法。`limits` 一栏是 `debounceSeconds` / `maxPerHour`。

### 5.1 M7 交来的（`dsh-hourness`：`glm-hourness/execute` 与 `glm-hourness/operate`）

条目的数据与给模型的文字归 M7（m7:§3.11.1，`src/execute/entries.ts`、`src/operate/entries.ts`），本表只为验收与 `limits` 列出；文字以 M7 的为准，本稿只要求它们的占位改成 `{名字}`，且只用 §4.2 声明的字段。

| # | id | 页面上的名字（M7 的 `title`） | 什么时候 | 做什么 | `wake` | `limits` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `execute.release` | 设计放行之后：主 Agent 开始自己推进 | `hourness.design-released` | harness `execute.start-drive`（建 DSH 的 goal、在目标上批注「自动推进已开始」），`done` 之后告诉主 Agent 分解与派活、不用等人 | 是 | 5 / 30 |
| 2 | `execute.handback` | 一件活交回之后：派审查 | `hourness.handback` | 告诉主 Agent 派审查，深浅与模型由它定 | 是 | 5 / 30 |
| 3 | `execute.reviewed` | 审查过了（或按理由不审）之后：做出要进主干的提交，检查后合入 | `hourness.review-passed`、`hourness.review-skipped` | 告诉主 Agent 做出带尾注的提交，`check_commit` 之后快进主干 | 是 | 5 / 30 |
| 4 | `execute.stopped` | 审查或检查一再不过停下之后：在对话里问你 | `hourness.stopped` | 告诉主 Agent 别再派这件活，用 `propose_to_human` 把它交给你（m7:§3.7.4 的正文） | 是 | 5 / 30 |
| 5 | `execute.tasks-closed` | 一个目标下的活都关了之后：派目标整体的审查 | `hourness.tasks-closed` | 告诉主 Agent 派整体审查，模型由它选 | 是 | 5 / 30 |
| 6 | `execute.trunk` | 合进主干之后：在主干上跑一遍完整的检查 | `hourness.trunk-advanced`、`hourness.outside-advance` | harness `execute.trunk-check`：在专门做检查的那份检出里跑一遍合入前的检查；没过时把命令、退出码与日志交给主 Agent | 是 | 30 / 30 |
| 7 | `execute.restart` | 重启之后：接上停了的活 | `hourness.host-started` | harness `execute.reconcile`；有丢失或补写时把清单交给主 Agent | 是 | 5 / 6 |
| 8 | `operate.morning` | 每天 08:30：晨报 | 每天 08:30，系统时区 | 告诉主 Agent 出晨报原样给你看，至多三件等你的事用 `propose_to_human` 交给你 | DSH 投递 | — |
| 9 | `operate.weekly` | 每周一 09:00：周报 | 每周一 09:00 | 告诉主 Agent 出周报，提议至多三件，用 `propose_to_human` | DSH 投递 | — |
| 10 | `operate.patrol` | 每天 02:30：夜间巡检 | 每天 02:30 | 告诉主 Agent 巡检：计划内的活去做或派出，要你定的留到下一批 | DSH 投递 | — |

- `limits` 的取值（评审 F8）：一件活交回、审查过了、停下、活都关了与设计放行，都是自动推进链上的一环，晚一步就是主 Agent 多空等一步，所以去抖 5 秒；同一小时里并行的活多，交回与审查过了每小时可能十几次，所以上限 30（人的条目是 6），被限的事件不丢（§6.7）。主干全量检查去抖 30 秒：几次快进常常前后脚，合成一次跑。重启对账一小时至多 6 次。
- `execute.trunk` 跑什么、什么时候可以跳过，是 M7 的 harness 动作自己的事（m7:§3.11.1 写「所有 `$` 与 `when` 命令都跑」）。0.1 让循环板自己在门禁工作树里跑，并用 `skipIfGated` 判断跳过；评审 F1 指出那条判法几乎从不成立，而一次 30 分钟的全量检查会占住门禁锁、排住下一次 `check_commit`。本稿把这件事整个交回 M7，并建议 M7 的 `execute.trunk-check` 用这一条规则（§17）：对新主干 `N`，在同一个 `normDigest` 下，与 `N` 的树相同或只差 `only` 路径的那些提交已有的通过记录合起来，已经覆盖 `norm-merge-gate` 的每一条 `$` 与 `when` 命令时，记为跳过（「这个主干提交的每条检查都跑过了」）；否则只跑还没覆盖到的那几条，结果与已有记录合成一条 `kind: 'trunk'` 的记录。这样「合进主干之后跑一遍完整检查」照人的话做到了（每个进主干的提交的内容，每条检查都跑过一次），又不在 `check_commit` 刚跑完的几条上重跑、少占门禁锁。M7 不采用时循环板什么都不用改：它只调 `run` 并记录结果。
- 0.1 把巡检里的「停下来报告」「等人太久」等写成「四行的方案（背景、推荐、疑问、不做）」让主 Agent 自己拼；M7 0.3 的文字已改为 `propose_to_human`，由 harness 拼四行（m3:§3.4「为什么四行由 harness 拼」），本稿自己的条目也照这样写（§5.2）。

### 5.2 循环行自己带的（`dsh-hourness`：`glm-hourness/loops`，`src/loops/defaults.ts`）

| # | id | 页面上的名字 | 什么时候 | 做什么 | `wake` | `limits` |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | `loops.deps-after-merge` | 依赖文件变了之后：查依赖 | `hourness.trunk-advanced`、`hourness.outside-advance`，`files` 里有依赖文件 | 告诉主 Agent 跑依赖检查，大版本升级交给你定 | 是 | 30 / 6 |
| 12 | `loops.remind-waiting` | 有事等你太久时：再跟你说一次 | `loops.waiting-on-human`，`olderThanHours: 24`；`quiet` 22:00–08:00 | 告诉主 Agent 再跟你说一次，等得最久的在前，一次至多三件 | 是 | 60 / 1 |
| 13 | `loops.peak-start` | GLM 高峰开始时：按你选的高峰模式收放 | `loops.peak-changed`，`edge` 为 `start` | `self`（`by: 'glm-hourness/rules'`）：主 Agent 每一步都知道此刻是高峰、是哪一档；少做时少开并行的 GLM 子 agent，练习题、对照实验、大的评审挪到高峰之后；不做时 GLM 的活排队 | — | 5 / 6 |
| 14 | `loops.peak-end` | GLM 高峰结束时：接上挪开的活 | `loops.peak-changed`，`edge` 为 `end` | harness `loops.peak-end`（循环行自己执行，§6.9）：不做档由规则板恢复排队的活；少做档下主 Agent 闲着、这段高峰里干过活时叫醒它一次 | 由动作定 | 5 / 6 |

- 第 13、14 项只在计价服务在时出现（GLM 包没装就没有高峰），`basis` 写「依据 GLM 峰谷定价（GLM 通道包）与高峰模式（规则板）」（m6:§8.3 要的来源一句）。规则行没加载时这两项照样列出，第 13 项灰显并写「规则板没启用：高峰只由 GLM 通道包提醒模型，档位不起作用」，第 14 项的不做档一支不会出现（没有规则板就没有不做档）。
- 第 13 项的运行由循环行在 `loops.peak-changed` 时自己记（结局 `delegated`，载荷写当时的档位），规则板不调 `recordRun`。
- 给模型的文字：
  - 11：`Dependency files changed on the main branch ({from}..{to}): {files}. Run the project's dependency check (the patrol lines of norm-merge-gate) and report what it found. Put a major-version upgrade to the human with propose_to_human.` 依赖文件的名单写在 `src/loops/defaults.ts`：`package.json`、`package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`yarn.lock`、`requirements.txt`、`pyproject.toml`、`poetry.lock`、`uv.lock`、`Pipfile.lock`、`Cargo.toml`、`Cargo.lock`、`go.mod`、`go.sum`、`Gemfile.lock`、`composer.lock`；名字不带 `/`，按 §2.2 的写法在任何一层目录都算。
  - 12：`These have waited for the human for more than 24 hours: {items}. Remind the human once, the longest-waiting first and at most three in one reply: show a proposal-style question again with propose_to_human (question <its id>, the same four lines unless something changed); say any other item in one plain line. Then end your turn.` 用 `propose_to_human` 改同一张待决重新给人看，是 M3 给「人补充或否掉之后」留的路（m3:§3.4 `question` 一种），这里四行没变也照用，因为人要看到的就是那张待决最新的样子〔推断：引擎接受字段不变的 `edit`；不接受时主 Agent 拿到引擎的错误，改为每件写一行题目，§10.2 V13〕。
  - 14：由 `loops.peak-end` 的结果给（§6.9）。

### 5.3 M4 交来的（`dsh-hourness`：`glm-hourness/env` 与 `glm-hourness/graph`）

| # | id | 页面上的名字 | 什么时候 | 做什么 | `limits` |
| --- | --- | --- | --- | --- | --- |
| 15 | `env.checks-after-edit` | 改完文件就跑检查 | `env.files-edited` | `self`（`by: 'glm-hourness/env'`）：跑你批过的检查，结果在那个 agent 的下一步交给它 | — |
| 16 | `graph.third-rework` | 同一件活第三次返工之前：停下问你 | `graph.third-reopen` | `self`（`by: 'glm-hourness/graph'`）：在这件活下面提一件要你定的事，由主 Agent 在对话里问你（m4:§4） | — |

- 第 15 项展开时列出两样：每个批过的检查器一行（由 M4 的 `Contribution.details` 给，§3.1 末的补充一条：「ESLint：改了 .ts、.js 之后跑 · `npx eslint {files}`」），与「检查器自己的规矩」（评审 F16，由 M4 交在条目的 `ownRules` 里）：一步至多等 20 秒，跑得慢的在之后的步里送到；每个检查 60 秒超时；同一个检查器在一个会话里连续失败 3 次后这个会话不再跑它；改了没有检查器覆盖的语言的文件时，每个会话每种语言提醒一次（m4:§6.3、§6.5、§6.6，验收表 m4-checks 第 2–4 条）。
- 为此 `LoopEntryDefinition` 多一个可选字段 `ownRules?: readonly string[]`（至多 6 行，每行至多 80 个码点，人话，经 `plainWordsIn`），`Contribution` 多一个可选成员 `details?(entry: string, project: string): readonly string[]`（同步、不抛错，至多 20 行、每行至多 160 个码点；循环板在重写 `view.json` 时调它，抛错时那一项写「<行> 没给出明细」）。两样都只给页面，不影响执行。
- 两项的每次运行由 env 行与图工具调 `recordRun` 报（§3.1）。

### 5.4 GLM 通道包交来的（`dsh-glm-zcode`：`glm-hourness/glm-login`，经计价服务的 `loopDefaults`）

条目的数据与文字归 M6（m6:§8.2，`src/glm-llm/loop-defaults.ts`），本稿照 §3.4 换成自己的条目：

| # | id | 页面上的名字 | 什么时候 | 谁执行 |
| --- | --- | --- | --- | --- |
| 17 | `glm:peak-reminder` | GLM 高峰开始时提醒模型 | 高峰开始时 | GLM 通道包自己（`self`） |
| 18 | `glm:quota-on-command` | 看状态时读一次 GLM 额度 | 你敲 `/glm-status` 或 `/hourness` 时 | GLM 通道包自己（`self`） |
| 19 | `glm:quota-low` | GLM 额度快用完时告诉你 | `channel.quota-low`：5 小时或每周额度用到 80%，或照现在的速度一小时内会用完；只在 GLM 有新用量、上次读数满 15 分钟时读 | 循环板；账号一级，只告诉一个主 Agent 一次 |
| 20 | `glm:login-rejected` | GLM 登录失效时提醒你重新登录 | `channel.login-rejected` | 循环板；账号一级 |

### 5.5 本仓库自己的（人的条目的例子，不进产品）

自举开始、本仓库的开发改在 DSH 里由主 Agent 做之后，由人在主 Agent 的对话里加这几项（§7.1）；在那之前它们只是例子，`reading-digest` 照旧由 Kiro 钩子提醒。

| 名字 | 什么时候 | 做什么 |
| --- | --- | --- |
| ZCode 更新之后比一遍提示词与线路 | `loops.file-changed`，`path: C:\Program Files\ZCode\resources\app.asar` | 告诉主 Agent：`ZCode was updated (app.asar changed). Dispatch a task to extract the new bundle and compare the system prompt, tool texts and wire (headers, signing, quota) with docs/reference/zcode-verbatim.md and the current baseline; put the differences to the human with propose_to_human.` |
| DSH 更新之后核对插件契约并跑探针 | `loops.host-restarted`，`appChanged` 为真 | 告诉主 Agent：`DSH was updated. Re-export the runtime packages into reference/ (docs/DEVELOPMENT.md §4), re-check the contract table of docs/DESIGN.md §2.4a, run npm run probe, and report what changed.` |
| 每周读 Anthropic 与 OpenAI 的文章 | 每周四 09:00（Asia/Shanghai；下一次 2026-11-05） | 告诉主 Agent：`Weekly reading (graph task reading-digest): read the new agent articles of Anthropic Engineering and the OpenAI Cookbook since the date in the last loop note, have a worker write the digest under .agents/tasks/reading-<date>/digest.md, propose what is worth changing, and record where you stopped with loop_note.` |
| 蓝屏或崩溃重启之后查主检出、工作树与在跑的运行 | `loops.host-restarted`，`crashed` 为真 | 跑命令 `["git", "status", "--porcelain=v1", "-b"]`、`["git", "worktree", "list", "--porcelain"]`、`["pwsh", "-NoProfile", "-Command", "npm run -s graph -- open"]`，每次都交给主 Agent，前面一段 `After a crash: check the main checkout, the worktrees and the runs that were going; restore or re-dispatch.`（`npm` 在 Windows 上是 `.cmd`，不经 shell 起不来，所以包一层 `pwsh`） |

人自己会加的另一类例子：服务器巡查，每 30 分钟跑 `["pwsh", "-NoProfile", "-File", "scripts/check-server.ps1"]`，没过时告诉主 Agent，前面一段 `The server check failed. Tell the human in one line what failed; do not try to fix the server.`。

`reading-digest` 节点：它是一件定期的事，在两次之间挂在「进行中」（plain-ui 原 P4 的问题）。循环板上线、上面那一项加上之后，这个节点以带证据的完成关闭（证据写循环板条目的 id），以后每次的结论记在条目的批注里（§6.10），不再挂在图上。

### 5.6 主 Agent 自己设的提醒

主 Agent 仍带 DSH 的四个提醒工具（`schedule_create` 等，standard preset 挂载，web-app `presets/cordis.patch.yml`:38–39），可以给自己设「30 分钟后看一眼 CI」这类提醒。这些不是循环板的条目，页面在「主 Agent 自己设的提醒（DSH 自带）」一组里只读列出（`schedule.catalog()` 里绑在主 Agent 会话上、又不是循环板建的那些），写标题、下次与「在 DSH 的自动化任务页里管理」。它的提示文字不能以 `Loop board: ` 开头（§6.2 的规则）。

## 6. 运行

### 6.1 谁来跑

新行 `glm-hourness/loops`（源码 `src/loops/`，编排层包，默认 `disabled: true`，通过 L3 与第一批 L4 后启用）。每个宿主进程里它都注册工具、命令、投影与步 notice（§7、§8）；只有有会话控制器的进程提供服务 `glmHournessLoops` 并运行条目（§3.1 第一条）。

- 项目的运行锁：`<项目目录>/runner.lock`（§9.1），以 `wx` 独占创建，内容 `{pid, boot, startedAt, at, token}`（`boot` 为本机开机时刻，`Date.now() - os.uptime() * 1000` 取到分钟，同 M5 §5.3 锁的写法）。持有者每一拍（60 秒）以临时文件加改名的方式刷新 `at`。别的进程看到锁在、`at` 在 3 分钟以内、`boot` 与本机相差不超过 120 秒：不跑，页面写「另一个 DSH 进程在跑这块板」；否则把旧锁改名为 `runner.lock.stale-<毫秒>`（留痕），再重新创建。不用 `process.kill(pid, 0)` 判活（Windows 上 pid 会被复用，M7 0.3 为门禁锁也改掉了这一判法）。行卸载与宿主退出时删锁（只删 `token` 是自己的）。
- 什么时候开始跑一个项目：这个宿主里出现了这个项目的会话（`agent/created`，agent:581–585；项目按会话头的 `cwd` 算，session:1820–1826）；行激活时，用户级目录里每个有主 Agent 持有者记录的项目（M3 附录 §2.4 的 `<userHome>/main-agent/*.json`，`graphDir` 给出项目）也开始跑，所以桌面版刚启动、人还没打开会话时，到点的提醒照样由 DSH 投、事件照样处理。之后每 60 秒一拍（`setInterval`，`unref`），直到这个项目 10 分钟没有活会话、也没有持有者记录时停下并删锁。主 Agent 的会话是冷的（没有打开）时照样跑：到点的投递由 DSH 恢复会话（schedule:1576），事件的投递由循环行经 `sessionController.resolveAgent` 恢复（§6.4）。
- 机器一级的运行者：账号一级的两项（§3.4）只能在一处判，否则两个进程各读一次额度、各说一次。锁 `<userHome>/loops/machine/runner.lock`，写法同上。只在计价服务在、且它交来的条目里有 `channel.*` 事件的条目时去抢。它每一拍做两件事：看登录状态（M6-L3）；读用量流水新增的行、按门槛读额度（M6-L2）。产生的事件写进「最近一次有主 Agent 走过步的项目」的收件箱。
- 最近一次走过步：每个进程的步 notice 监听器（`agent/pre-step`）看到持有者会话走步时，至多每 60 秒一次把 `{projectKey, project, at}` 以临时文件加改名写进 `<userHome>/loops/machine/last-step.json`；后写的覆盖先写的，就是最近的那个。同一个监听器也在内存里记每个主 Agent 每一段高峰里有没有走过步（§6.9 第 4 条用）。

### 6.2 时间：DSH 的定时服务与循环板自己的钟

| 条目 | 谁计时 | 到点时 |
| --- | --- | --- |
| 告诉主 Agent（`tell-main`），五种时间都行 | `dsh-schedule`：循环行为每一项建一个绑在主 Agent 会话上的任务 | DSH 把提醒当成一条 user 消息投进主 Agent 会话并叫醒它（schedule:1576–1598，`followup`），主 Agent 读到的是 DSH 的固定开头加上这一项的英文文字（schedule:1386–1418） |
| 跑命令（`run`）与 harness 动作，一次、每隔、每天、每周 | 循环行自己的钟（`src/loops/clock.ts`，用 `src/loops/trigger.ts` 算下一次） | 循环行执行；按 `report` 或 harness 的结果决定要不要告诉主 Agent（§6.4–§6.6） |

为什么分开（三种做法，采用的放最后）：

1. 全部走 `dsh-schedule`，跑命令的条目在主 Agent 收到提醒那一步之前跑命令、把结果接在提醒后面：时区、cron、补跑都用 DSH 的。代价：每次到点都叫醒主 Agent，命令过了也在人唯一的对话窗口里留一回合；服务器巡查每 30 分钟一次就是每天 48 回合「一切正常」。想不叫醒，只能在 `agent/pre-step` 里把领走的提醒拿掉，那会丢消息（agent-loop:101–110 领走的消息不放回收件箱，rules:§3.6 的同一个理由）。
2. 全部用循环板自己的钟：一套语义。代价：DSH 的时区、cron、夏令时与重启补跑要自己重写一遍；人在 DSH 的任务页上看不到这些到点的事；发送记录也用不上。这和编排方已经告诉人的「时间触发直接用 DSH 的定时服务」不一致。
3. 告诉主 Agent 的走 `dsh-schedule`，其余的用自己的钟（采用）：要叫醒主 Agent 的事，DSH 的投递正是要的效果；不该叫醒人的命令，不经过它。代价：命令与 harness 动作类的条目不支持 cron（自己的钟只做一次、每隔、每天、每周，夏令时规则照 DSH：缺的钟点跳过，重叠的取较早那次），以及两种钟各有各的补跑记录（都只补一次，§6.8）。

`dsh-schedule` 任务的绑定与对账（`src/loops/bind.ts`）：

- 一项对应一个任务：标题 `循环板 · <title>`（至多 120 个字符，schedule:96），提示文字的第一行固定 `Loop board: <id> (default of <插件> | added by the human). Change it on the loop board, not here.`，之后是这一项的英文文字；选择器按 §2.2 映射。`state.json` 的 `bindings` 记 `{entry, specDigest, scheduleId, sessionId, fingerprint, done?}`：`specDigest` 是这一项的标题、文字与时间（时区已按 §2.2 取定）的摘要；`fingerprint` 取自 DSH 上一次 `create` 或 `update` 返回的那条记录，是 `{kind, title, prompt}` 加上按种类的时间字段：`at` 的 `scheduledAt`，`every` 的 `everySeconds`，`daily` 的 `time`、`timeZone`，`weekly` 的 `time`、`timeZone`、`weekdays`，`cron` 的 `expression`、`timeZone`（记录的键见 schedule:256–312、356–365、411–421、463–472〔实读〕）。重复任务的 `scheduledAt` 每投一次都会变，所以不进指纹（`at` 种类除外，它的 `scheduledAt` 就是那一次的时刻）。
- 对账在这些时候做：开始跑一个项目时；每一拍；收到 `schedule/changed`（schedule:2231–2237，提交之后发出，没有载荷）；主 Agent 的持有者记录变了（M3 附录 §2.4 的 `readHolder` 按文件的 `mtimeMs` 与 `size` 缓存）；执行表变了（有一份 `contribute` 或人的条目写入）。
- 对账按 `schedule.catalog()`（schedule:2129–2136：每条是记录加 `sessionId`、`status` 与 `lastDelivery?`）做四件事：
  1. 该有的没有（新条目、新的主 Agent、任务被删了）：`schedule.create(主 Agent 会话 id, {title, prompt, <选择器>})`（schedule:2083–2112），把返回的记录记成 `fingerprint`。
  2. 绑在别的会话上（主 Agent 换了会话）：在旧会话上 `schedule.delete({sessionId: 旧, id})`（schedule:2164–2182），在新会话上建。旧任务的发送记录随之删掉（硬删除）；循环板自己的运行记录不受影响。
  3. 内容不对：catalog 里这一条的指纹与 `bindings` 里的不同（有人在 DSH 任务页上改了），或这一项的 `specDigest` 变了（插件更新了这一项、系统时区变了）。按条目改回或改成新的：`expected` 取 `schedule.list({sessionId})`（schedule:2120–2122，只返回这个会话活动任务的记录本身，没有 `sessionId`、`status`、`lastDelivery`）里 id 相同的那一条，调 `schedule.update({sessionId, id, expected, title, prompt, change: {kind, <选择器>}})`（schedule:2197–2224；`change` 只能有 `kind` 与对应的那一个键，schedule:1710–1716）。结果：`updated: true` → 记下返回记录的指纹；`updated: false` 且没有 `code`（DSH 判为规范化之后没变，schedule:1824–1829）→ 记下 list 里那条的指纹，不算改动；其余（`schedule_conflict`、`invalid_rule`、`schedule_not_found`、`schedule_ended`、会话的拒绝）→ 删掉重建。0.1 拿 catalog 的一行当 `expected`，多出三个键，DSH 的整键解码一律返回 `invalid_rule`（schedule:74–77、1806–1815〔实读〕），改回从来不会成功（评审 F7）。只有第一种原因（外面改的）记一笔 `loop-drift`（`what: 'edited'`），页面在这一项下面写一行「在 DSH 的自动化任务页里改的不算数，已按循环板改回；要改：跟主 Agent 说」（同一项一天至多写一次）。
  4. 不认识的循环板任务（提示文字以 `Loop board: ` 开头、`bindings` 里没有：上一次的 `state.json` 丢了，或条目已删）：这一项还在、任务绑在主 Agent 的会话上、这一项此刻没有别的活着的绑定时才认下来写进 `bindings`；否则删掉（评审 F13）。
  - 一次性的条目投过之后，DSH 留着一条 `status: 'inactive'` 的记录。对账认得它：`bindings` 记 `done: true`，不再建，页面这一项写「已跑过（<时刻>）」。不活动的记录不参与上面的比较。
- 归档（评审 F12）：DSH 把一个会话的活动任务当作这个会话还有活动（schedule:2044–2055），不带 `stopActivity` 归档会被拒（dsh-workspace:512–516），带上它归档时 DSH 删掉这个会话的全部活动任务（schedule:2056–2058、2273–2292）〔实读，评审核对〕。所以主 Agent 的会话挂着循环板的任务时不能直接归档。页头因此有一行灰字「主 Agent 的会话里挂着循环板的提醒；归档这个会话时 DSH 会先停掉它们，换到新的主 Agent 会话之后循环板再建」。任务因归档被删时，循环行分不出这次删除是归档还是人在任务页上删的：任务不见了先记 `loop-drift`（`what: 'deleted'`），持有者记录仍指向已归档的会话时不在它上面重建（DSH 会拒绝给不能投递的会话建提醒，schedule:2199–2200 的 `reminderTargetRefusal`），等主 Agent 换会话时再建；这一段时间里这几项不会到点，页面写明。
- agent 不能改循环板的任务，也不能冒充：规则 `loops:schedule-tools`，由循环行在 `tools/pre-execute`（tools:3321–3346）上注册，用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`，拒绝写进违规流水，同 M7 §3.2 写入门禁的做法）。拒绝三种调用：`schedule_update` 与 `schedule_delete` 的 `id`（tool-schedule:581–600、637–647）指向循环板的任务（在 `bindings` 里，或 `schedule.catalog()` 里这条的提示文字以 `Loop board: ` 开头；catalog 读不出时放行，由对账第 3 条事后改回）；`schedule_create` 的提示文字去掉首尾空白后以 `Loop board: ` 开头（评审 F13：否则主 Agent 建的提醒会被对账当成孤儿认下）。纠偏写「That reminder belongs to the loop board; changes go through the loop board (loop_propose), not the schedule tools.」。DSH 任务页走的是 Remote 的 `schedule.update`、`delete`，不经工具，靠对账第 3 条改回。这条规则列在规则板「写在代码里的规则」里（rules:§2.6 的表已有这一行）。
- 到点之后：DSH 投递成功时更新这条任务的 `lastDelivery`（`scheduledAt`、`deliveredAt`、`messageId`）并发 `schedule/changed`。循环行在对账时比较 `lastDelivery.messageId` 与上次记下的，变了就记这次运行（`loop-fired` 与结局 `delivered`，§6.10）。DSH 投递失败时不自动重试，下一次有任务写入或宿主重启才再试（schedule:1627–1640）；循环行看到某项的 `scheduledAt` 已过 5 分钟而 `lastDelivery` 没变时，记一次 `failed`（原因「DSH 没投出去」），删掉这条任务、按同一规则建一条新的；错过的这一次由循环行按 §6.4 自己投一次。不用「改一下」去催：DSH 对规范化后等价的更新不写入、不重新计算（`dsh-schedule/README.zh.md`「使用此包」末段），催不动。

### 6.3 事件的收集：项目收件箱

各行交事件不能依赖跑这个项目的进程此刻在不在（另一个 DSH 进程持锁、宿主刚起来、项目还没开始跑），所以 `emit` 就是往项目目录里的收件箱追加一行，与谁在跑无关：

- `emit` 按 `cwd` 算出项目键，在 `entries.lock`（§9.1）内往 `<userHome>/loops/projects/<键>/events.jsonl` 追加一行 `{id: 'ev-<16 位十六进制>', at, event, key, payload, session?, from: <交它的行>, cause?}` 并 `fsync`。`cause` 是运行号：这次 `emit` 发生在循环板执行某一项的 harness 动作期间时（异步上下文里有运行号，§6.5），取那个运行号；否则没有。
- 去重：`state.json` 的 `keys` 记最近 7 天处理过的去重键（至多 5000 个，满了丢最早的）；同一个键再来时不跑，记一笔 `duplicate`（只计数，不进指标流水）。本进程正跑着这个项目时 `emit` 当场查一次，返回 `duplicate: true`。M7 的去重键照它退路执行者的写法（m7:§2.5，例 `handback:<childId>`），所以重启之后同一次交回再报一次也只派一次审查。
- 处理：跑这个项目的进程在 `emit` 当场（本进程）、收件箱文件变化时（`fs.watch`，别的进程）与每一拍，从记下的位置往后读；每行校验（事件在当前的事件表里、载荷合声明），读不懂的跳过并计数；处理完把位置（字节偏移与最后一个 id）写进 `state.json`。事件不在当前的表里（交它的那一份此刻在这个进程里没有交）时记 `expired`（原因「这个事件现在没有声明」）。文件超过 8 MiB 时在锁内改名为 `events-<时刻>.jsonl`，旧文件保留 7 天。
- 处理顺序按写入顺序。写入超过 7 天还没处理（宿主一直没跑这个项目）：记 `expired`，不跑。
- 漏报怎样被发现：M7 的事件都先写进了项目图（交回、审查、停下有 M7 的批注，放行有目标的阶段，前进有 `advances.jsonl` 与证据），收件箱只是通知。漏了的那一次由图上的事实兜住：夜间巡检列出「完成却没有合入证据的写任务」「进行中超过 24 小时、没有活着派发的任务」（m7:§3.11.2），晨报的「例外」一节列出「有停下标记、却没有给人的待决」（m7:§3.10）；主 Agent 读到之后照常处理。循环板不另从图上反推事件，以免两条路各报一次、重复叫醒主 Agent。

循环行自己推出的事件（§4.1）与通道事件（§4.3）也写进收件箱（同一个格式，`from` 为 `glm-hourness/loops`），这样它们与各行交来的走同一条路、同一份去重与重启补处理。所有事件都经同一个处理函数 `handleEvent(project, record)`：找出 `when.events` 含这个事件、筛选都对得上的条目，按 §6.7 去抖、限次，再交给动作的执行者。

### 6.4 交给主 Agent

主 Agent 是谁：M3 附录 §2.4 的 `mainAgentOf(userHome, graphDir)`（持有者记录），`graphDir` 取图行服务的 `dirFor(项目根)`。M3 没合入、项目没有主 Agent、或记录读不出时，「告诉主 Agent」的事件消息存进 `state.json` 的 `held`（每个项目至多 50 条，满了丢最早的并记 `expired`），有了主 Agent 之后按先后投；存了 24 小时还没投出的记 `expired`。到点类的条目没有主 Agent 时不建 DSH 任务，页面写「还没有主 Agent：在一个会话里发 /wish」。

消息怎样投（`src/loops/deliver.ts`）：

1. 消息是一条 user 角色的合成 notice：`createUserNotice('glm-hourness-loop', <标题>, <正文>, {hournessLoop: {entry, run}})`（`src/shared/dsh-min.ts`:462；与 M7 退路执行者同一个来源名，m7:§2.5 末段，模型分不出、也不必分出是哪一方投的），正文用 `<system-reminder>` 包起来（`docs/DESIGN.md` §6 第 1、3 条）。来源不是 `user`：DSH 把没写来源的 `followup`、`steer` 当成人的话（tool-goal:44–52），带上来源，循环板的消息就不会被当成人的授权（例如不能让模型因此 `create_goal`）。同一个主 Agent 2 秒内要投的几条合成一条，每段前面写各自的第一行。
2. 拿到活 agent：`agents.get(会话 id)`（agent:596）；没有（会话是冷的）且这条要叫醒它时，`sessionController.resolveAgent(会话 id)`（api-session-controller:3037–3039，返回 `{agent}` 或 `{error}`；DSH 的定时服务用的同一个调用，schedule:1576）；不叫醒的条目不去恢复会话，留在 `held` 里，等这个会话下一次 `agent/created` 时投。整个投递放在 `agents.withoutInitiator` 里（agent:414），与 DSH 定时服务的投递相同（schedule:1531）。
3. 按 agent 的状态与条目的 `wake` 选方式，与规则板的唤醒表一致（rules:§6.3）：
   - `wake` 为真，agent 在跑（`status` 为 `running`，agent-loop:790–793）：`steer`（进下一步并设唤醒标记，agent-loop:809–811）。0.1 这里用 `inject`，消息若在这一回合最后一次查收件箱之后、回合转为空闲之前进来，就要等下一回合，记录却写了已投（agent-loop:1037、892–898，评审 F15）；`steer` 的唤醒标记让它不会滞留。
   - `wake` 为真，agent 空闲、有 active 的 goal（`goals.get(agent)?.phase === 'active'`；`get` 对不是活实例的 agent 抛 `GoalError`，按没有 goal 处理）：`inject`，由驱动器开的下一轮第一步收到；不用 `followup`，进入下一回合收件箱的消息会被 goal-round-driver 当作竞争输入、作废这一轮的预约（goal-round-driver:249）〔推断：`inject` 不触发这条判定，同 rules:§15 V3〕。
   - `wake` 为真，其余空闲的 agent：`followup`（进下一回合并叫醒，agent-loop:806–808）。
   - `wake` 为假：`inject`（下一步才看，不叫醒，agent-loop:812–814）。
4. 确认落盘：`sessions.flush(agent.session)`（session:1950；DSH 的定时服务同样在投递后调它，schedule:1597）返回假，或上面任何一步抛错：按 1、5、15 分钟重试三次，仍失败记 `failed` 并报行健康 degraded（「没能把『<title>』交给主 Agent：<原因>」）。投递与记录是两次写入，中间崩溃可能重投一次：记录先写 `loop-fired`、投完再写 `loop-done`，重启后有 `loop-fired` 没有 `loop-done` 的运行按「可能已投」重投，消息第一行多写 `(may repeat run <run>)`。至少一次，不保证恰好一次，与 DSH 的定时服务同样（`dsh-schedule/README.zh.md`「已知限制」第 2 条）。

账号一级的条目（`scope: 'machine'`，M6-L4）：机器一级的运行者产生事件时，先把它追加进最近一次走过步的那个项目的收件箱（§6.1），再把这件事（条目 id 加期：额度是窗口名与重置时刻，登录是 `since`）写进 `<userHome>/loops/machine/told.json`；那个项目的运行者照常投递。次序取「先追加、后记已说」：中间崩溃时最多重说一次，而不是漏说。`last-step.json` 读不出或指向的项目没有主 Agent 时，事件留在机器一级的 `held`（至多 10 条，24 小时作废），等有主 Agent 走步时写进它的收件箱。

到点类的消息由 DSH 投，循环行只在主 Agent 领到它的那一步加一句（`agent/pre-step` 的步 notice，`installStepNotice`，`src/shared/step-notice.ts`:28；agent-loop:902–927）：领走的消息里有来源 `schedule`（schedule:1594）、`schedule_id_json` 或 `reminders_json` 里的 id 在 `bindings` 里的，循环行在 `next()` 之后追加一行 `Loop run <run> for <entry>.`；高峰停着时改为 §6.9 的那一行。

### 6.5 harness 动作与列出的条目

一项 harness 条目被触发、过了去抖与限次之后（`src/loops/harness.ts`）：

1. 写 `loop-fired`。
2. 在一个异步上下文（`AsyncLocalStorage`）里调交来它的那一份的 `run(action, record)`，上下文里放这次的运行号。等结果，至多 6 小时（§3.1）。
3. 按结果：
   - `done` 且带 `tell`：把 `tell` 当作这一项的文字交给主 Agent（`wake` 取条目 `tell.wake`，条目没有 `tell` 时为真），结局 `delivered`。
   - `done` 不带 `tell`、条目有 `tell`：交条目的 `tell`，结局 `delivered`。
   - `done`，两边都没有：结局 `ran`。
   - `skipped`：结局 `skipped`，`reason` 原样，不发消息。
   - `failed`：带 `tell` 时交给主 Agent；结局 `failed`，`reason` 原样；循环行的行健康 degraded 一次「<id> 的 harness 动作失败：<reason 前 80 字>」。
   - `run` 抛错、promise 被拒、超时：同 `failed`，不发消息。
4. 写 `loop-done`。

同一项正在跑时（例如一次主干全量检查还没跑完），新的触发只留一次待跑，再来的合进这一次（§6.7 的不重叠）。

`self` 条目不执行：循环板只把它列在页面上，执行它的那一行经 `recordRun` 报运行（§3.1），循环板写记录、更新页面的「上次」。

### 6.6 跑命令

`src/loops/command.ts`（与规则板检测器共用，rules:§5.3；谁先实现谁建）：

- 每条命令用 `child_process.spawn(argv[0], argv.slice(1), {shell: false, windowsHide: true, cwd: <项目根>})`。
- 环境只给 `PATH`、`PATHEXT`、`SystemRoot`、`TEMP`、`TMP`、`USERPROFILE`、`HOME`、`APPDATA`、`LOCALAPPDATA`，以及 `HOURNESS_LOOP_ENTRY`、`HOURNESS_LOOP_RUN`、`HOURNESS_PROJECT_ROOT`（同 rules:§5.3，多给了 `npm` 与 `git` 要的几项）。宿主的其他环境变量（包括 `GLM_HOURNESS_CREDENTIAL_SECRET`）不传。
- 起来后 `os.setPriority(child.pid, PRIORITY_BELOW_NORMAL)`；每条命令的上限默认 60 秒，人的条目可设 5–1800 秒；到时只要 `ChildProcess` 还没 `exit` 就 `taskkill /PID <pid> /T /F`（其他平台对进程组发 `SIGKILL`）。一项的几条命令按顺序跑，第一条失败就停。
- 同一个项目同一时刻至多跑一个循环板命令，其余排队。
- 输出：标准输出与错误合在一起写进 `<项目目录>/logs/<entry>/<时刻>.log`（第一行是命令原文），内存里至多留 1 MiB；日志按条目保留最近 50 份或 7 天。
- 交给主 Agent 的结果：每条命令一行 `` `<命令>` exit <码>（<用时>）``，失败那条下面至多 40 行、4000 个字符的输出末尾；整段先过 `redactSecrets`（M5 的 `src/data/secret-shape.ts`；M5 没合入时用同目录 `src/loops/redact.ts` 里同一组模式，M5 合入时删掉换成它），密钥形状的串换成 `[redacted]`；再接 `Full output: <日志路径>`。指标流水只记退出码、用时与字节数，不记输出。
- 命令原文的写法（日志第一行、给主 Agent 的那一行、交给规则板的 `args.command` 都用它）：`argv.map(quoteForPwsh).join(' ')`，`quoteForPwsh` 对含空白、引号或 PowerShell 特殊字符的项加单引号并把单引号写两遍，其余原样（评审 F10）。
- 跑之前问规则板（§6.9 第 1 条）。

### 6.7 去抖、限次与自己触发自己

- 去抖：一项收到事件后等 `debounceSeconds`，这段时间里再来的同一项事件合进同一次运行，交给 harness 动作的在 `merged` 里，消息里按先后列出（至多 20 个，多的写「还有 N 个」）。缺省：插件的事件条目 5 秒，人的事件条目 30 秒（0.1 一律 30 秒，验收要的 10 秒因此做不到，评审 F8）。到点类的条目不去抖（DSH 自己把同一会话同时到期的几条合成一批，schedule:1571）。
- 限次：一项每小时至多跑 `maxPerHour` 次，缺省插件的 30、人的 6。超了的触发记 `suppressed`（原因 `rate`），事件不丢：攒着，下一个整点之后的第一次运行把它们一起合进去（同一项至多攒 100 个，多的丢最早的并计数）。页面这一项写「一小时里触发了 N 次，后面的合进下一次」。插件的条目被限次，说明哪里在打转，循环行的行健康 degraded。
- 不重叠：同一项正在跑或正在等投递时，新的触发只留一次待跑。
- 自己触发自己：一次运行自己的执行直接引起的事件，10 分钟内又触发同一项时不跑，记 `suppressed`（原因 `self-loop`），页面写「这一项触发了自己，已停下这一次」。「直接引起」只认两种，都由 harness 自己看得见：在这一项的 harness 动作执行期间交来的事件（`emit` 从异步上下文取到运行号，§6.3）；这一项的命令在跑的时候或跑完 60 秒内发生的 `loops.file-changed`。0.1 还把「主 Agent 被这一项叫醒之后那一回合里发生的事」算作这一项引起的；那样会挡住正常的修复：全量检查没过 → 主 Agent 修好合入 → 主干前进，这一次必须再检查，却会被当成自己触发自己。所以经过主 Agent 一回合的链不算，打转由限次兜住（打转时一小时至多 30 次或 6 次，行健康报出）。不对整条因果链设长度上限：设计放行 → 派活 → 交回 → 派审查 → 合入 → 全量检查，本来就是一条连着的正常的链。

### 6.8 漏跑与重启

| 情形 | 怎样发现 | 补法 |
| --- | --- | --- |
| DSH 任务在宿主停机时到了点 | DSH 自己：重启后每个重复任务只补最近错过的一次，一次性的照投（`dsh-schedule/README.zh.md`「概述」；schedule:590、656、687、821） | 不另补；补投的提醒带 `occurrence_at`，循环行记录时标 `late` 与晚了多久 |
| 循环板自己的钟管的条目在停机时到了点 | 起来时 `nextDue < now` | 只补一次，记 `late`；之后从现在起算下一次 |
| 收件箱里停机前没处理完的事件，与停机期间别的进程交进来的 | 位置之后还有行 | 按先后处理；超过 7 天的记 `expired` |
| 停机期间文件变了、高峰变了 | 起来时与 `state.json` 里记下的值比 | 各补一次（§4.1 的「停机期间」一栏） |
| 有 `loop-fired` 没有 `loop-done` 的运行 | 起来时读记录 | 投递类按「可能已投」重投一次；命令类重跑一次，记 `late`（命令可能跑过一半：`loop_propose` 的 `cautions` 把这一句交给人看，§7.1）；harness 动作类不重跑，记 `failed`（原因「宿主在动作执行中退出」）：harness 动作由交它的那一行自己幂等（M7 按图上的批注，m7:§3.9.1、§3.11.2），它的事件若需要重做，那一行会再交 |
| `state.json` 丢了或坏了 | 读不出 | 按 §9.3 重建；收件箱的位置取文件末尾（这一次不补处理），记一笔 `state-reset`，页面写「循环板的运行状态坏了，已重建；停机期间的事件这次没有补」 |

`loops.host-restarted`：循环行开始跑项目时读 `state.json` 的 `host`（上一次的 `{pid, boot, startedAt, cleanExit, appStamp}`），写入这一次的，并在行卸载与宿主退出的清理里（`ctx.effect` 返回的函数）写 `cleanExit: true`。上一次存在而没有 `cleanExit` 就是 `crashed`（蓝屏、断电、被强杀；Windows 关机时 DSH 若没走到清理，也会算成这一种，页面说成「上次没有正常退出」）。`appStamp` 是 DSH 程序文件的大小与修改时间（§10.2 V6）。

### 6.9 与高峰模式、规则板

规则板管「让不让做」，循环板不另写高峰的判断，档位只经规则板的两个服务读（`glmHournessRules` 的 `heldForPeak`，`glmHournessPeakMode` 的 `stateFor`，rules:§7.2），从不读规则板的文件（验收第 14 条的静态检查）。五处接缝：

1. 循环板跑的命令先经规则板判定：每次运行 `run` 之前调规则板的库入口 `checkCall({tool: 'pwsh', args: {command: <命令原文>}}, {project: <项目根>, signals: {'glm-peak': <计价服务的 peak(now)>}, glmSpend?: <条目的 glmSpend>})`（rules:§9.4；两者在同一个包里，直接导入 `src/rules/check.ts`）。条目没写 `glmSpend` 时不带这个选项（`CheckOptions.glmSpend` 只收 `optional`、`necessary`，0.1 传的 `'none'` 不是合法值，评审 F10）；计价服务不在时不给 `signals`，`checkCall` 自己读心跳。不带 `session`、`role`、`model`、`stage`：循环板的命令不是哪个会话发的，所以带主体的规则一律不命中（rules:§9.4 的表），管得到它们的只有不带主体的规则与自报 `glmSpend` 的那两条附属条目；页面在「循环板自己的规矩」里写明这一点。结果：放行、只告知、只记录 → 跑；排队 → 记 `deferred`，每 5 分钟再判一次，放行了就跑，24 小时还没放行记 `expired`；拦截 → 记 `blocked` 与规则 id，不跑，页面写「被规则『<标题>』拦下」。规则板的库导入失败或判定抛错时照常跑，记一笔 `rules-unavailable`（规则板自己的故障偏向放行，同 rules:§9.4 与 M6 §7.2）。所以人设的「代码冻结期间不跑发布命令」之类的规则也管得到循环板。
2. 高峰不做时攒着事件消息（评审 F6）：投给主 Agent 之前问 `rulesService(ctx)?.heldForPeak(主 Agent 会话)`（rules:§7.2：这个会话此刻是否因高峰不做停着，即有 `deferred` 或 `cleared` 的不做档单，且人没有说「这个会话本次高峰照常做」）。为真时不投，放进 `held`（结局 `held`），每一拍再问；变成假之后 1 分钟内按先后合成一条投出，第一行写 `Held during GLM peak (level stop) since <time>.`。这样人对那张单打了 `/rules let`（这个会话本次高峰照常做），循环板跟着照常投，不会再对主 Agent 说「人选了停下」。规则服务不在时不攒（读不出就不收不放，同 rules:§3.6）。
   - 这个判断的空当：主 Agent 在高峰里还没有哪一次调用被排队（还没开单）时 `heldForPeak` 为假，循环板会投，主 Agent 多走一步，它的第一个工具调用就开单、暂停 goal、它写一行收尾；会话不在本宿主上（冷的）时同样为假。所以每段高峰每个会话至多多花一步，与规则板对「被拒之前已经发出的那一步」的说法相同（rules:§3.6 的表）。要补上这个空当，本稿请规则板加一个成员 `peakStop(sessionId): {stopped: boolean, until?: string}`，在一处按档位、此刻是不是高峰、会话走不走 GLM 与人说的「本次照常做」判断，对冷的会话也按项目判（§17）；它在了，循环板改问它，只改 `deliver.ts` 一处。
   - DSH 到点投来的循环板提醒挡不住（投递是 DSH 做的）：主 Agent 领到它的那一步 `heldForPeak` 为真时，循环行把 §6.4 的那一行换成 `GLM peak hours and the human chose to stop GLM work: reply in one line that this is deferred; the loop board delivers it again after peak. Do not start it now.`，同时把这次运行记为 `held`，单解除之后按上一条投一次原文。
3. 档位怎样显示：页面与 `view.json` 写的档位取 `glmHournessPeakMode.stateFor(会话)`（rules:§7.2 的 `PeakModeState`：`level`、`origin`、`peak`、`until`），会话取这个项目在本宿主上的任意一个活会话；没有时页面写「档位在规则板上看」。
4. 少做档的高峰结束（评审 F5，M6-R5）：`loops.peak-end` 的 harness 动作由循环行自己执行（`src/loops/peak.ts`），按顺序取第一条成立的：
   | 情形 | 结果 |
   | --- | --- |
   | 读不出档位（`stateFor` 在这个项目的任何活会话上都是 `undefined`） | `skipped`，「读不到高峰模式」 |
   | 档位为不做 | `skipped`，「不做档由规则板在高峰后恢复排队的活」（规则板的等待单解除时恢复 goal、叫回 agent，rules:§6.3） |
   | 档位为无影响 | `skipped`，「无影响档没有挪开的活」 |
   | 主 Agent 在跑 | `skipped`，「主 Agent 正在干活，它下一步的高峰一行已经变了」（rules:§6.4） |
   | 这一段高峰里主 Agent 一步也没走（§6.1 末条的记录） | `skipped`，「高峰里主 Agent 没干活，没有挪开的活」 |
   | 它的 goal 为 `paused`，或为 `blocked` 且原因码为 `hourness-waiting-human` | `skipped`，「人暂停了自动推进」或「主 Agent 在等你回话」 |
   | 它的 goal 为 `blocked`，原因码为 `hourness-idle-rounds`，且执行行交了 `execute.resume-after-peak` | 先调 M7 的这个动作（经 M7 那一份的 `run`），再 `done`，`tell` 为 `GLM peak hours ended at {end}. Work you moved to after peak can start now; the harness resumed your goal, which was blocked for idle rounds during peak.` |
   | 同上，执行行没交这个动作 | `done`，`tell` 为 `GLM peak hours ended at {end}. Work you moved to after peak can start now. Your goal is blocked for idle rounds and you cannot resume it yourself: tell the human in one line that the moved work can start and the drive resumes when they say so.` |
   | 其余（闲着，没有 goal 或 goal 为 active） | `done`，`tell` 为 `GLM peak hours ended at {end}. Work you moved to after peak can start now.` |

   `tell` 的 `wake` 为真，按 §6.4 第 3 条选方式：闲着、没有 goal 时是 `followup`；goal 刚被恢复为 active 时是 `inject`，由驱动器的下一轮收到。评审给的文字里有「resume the goal if it was blocked for idle rounds」，模型做不到：`update_goal resume` 要当前回合里有人直接说的话（tool-goal:348–349 的 `requireDirectHuman`〔实读〕），循环板的消息不是人的话。所以恢复改由 harness 做，本稿请 M7 加 `execute.resume-after-peak`：只恢复原因码为 `hourness-idle-rounds`、且阻塞发生在这一段高峰之内的 goal，幂等（§17）。叫醒的代价：每个工作日至多一步，只在主 Agent 这段高峰里干过活时才花；规则板 0.6 不采用 M6-R5 的理由（「它空闲时多半在等人」「规则板不知道它挪开过什么」，rules:§3.6）由「在等人时不叫」与「高峰里没走过步时不叫」两条接住。
5. 高峰开始（第 13 项）只记录与显示；计价服务不在或 `peak` 抛错时第 13、14 项不出现，第 2 条也不起作用（读不出不算高峰，同 rules:§3.6）。

### 6.10 每次运行的记录

每次运行写两条事件，都由循环行写，模型写的不算（`metrics`）：

| 事件 | 何时 | 字段 |
| --- | --- | --- |
| `loop-fired` | 触发并通过去抖、限次之后，执行之前；被限次或自己触发自己时也写，紧跟一条 `loop-done` | `{at, project, entry, run, source: 'plugin' \| 'person', plugin?, row?, trigger: {kind, event?, occurrenceAt?}, events: <合进来的事件个数>, cause?, late?}` |
| `loop-done` | 运行有了结局 | `{at, project, entry, run, outcome, reason?, exits?: number[], durationMs?, outputBytes?, delivery?: 'steer' \| 'inject' \| 'followup' \| 'dsh', messageId?}` |
| `loop-entry` | 人的条目写入 | `{at, project, entry, op: 'add' \| 'edit' \| 'delete' \| 'restore', actor, via: 'chat' \| 'command' \| 'board', question?}` |
| `loop-drift` | DSH 里的任务被改、被删或投不出 | `{at, project, entry, what: 'edited' \| 'deleted' \| 'not-delivered' \| 'orphan'}` |
| `loop-note` | 主 Agent 记了一次结论 | `{at, project, entry, run?, chars}` |
| `loop-read` | 机器一级的运行者为通道条目读了一次额度（M6-L5） | `{at, entry, ok, ms, hit}` |
| `loop-contribution` | 一份交来的条目被接受、替换或撤回 | `{at, plugin, row, op: 'add' \| 'replace' \| 'dispose', accepted, dropped}` |

`outcome` 的取值：`delivered`（消息已进主 Agent 的会话）、`ran`（命令或 harness 动作跑完，没有要交给主 Agent 的）、`reported`（命令跑完并已交给主 Agent）、`delegated`（`self` 条目由别的行执行，第 13 项与 `recordRun` 报来的）、`skipped`（条件不满足：harness 动作说跳过、主 Agent 在跑、档位不对）、`suppressed`（限次、自己触发自己）、`deferred`（规则板判为排队，之后还会有一条结局）、`blocked`（规则板拦下）、`held`（没有主 Agent，或高峰停着，之后还会有一条结局）、`failed`（投不出、命令起不来、harness 动作失败）、`expired`（等太久作废、事件没有声明）。

写到哪里：指标流水（`metrics`）的设计还没定稿；它合入之前写 `<项目目录>/runs.jsonl`（按 8 MiB 轮换），机器一级的 `loop-read` 写 `<userHome>/loops/machine/runs.jsonl`；指标流水合入的那一步只改 `src/loops/metrics.ts` 一个文件，换成写指标流水（同 rules:§10.5 给 `metrics` 的约定）。页面上的「上次」从 `state.json` 的 `last` 缓存读（每项最近一次的运行号、时刻与结局），缓存坏了从记录的末尾重建。

结论（节点 `schedules` 正文的「每次的结论记成那一项的批注」）：主 Agent 用 `loop_note({entry, text})` 记一行（至多 500 个码点），挂在这一项最近一次投给它的运行上；存进 `notes.jsonl`（每项保留最近 20 条），页面这一项展开后列出；指标流水只记字数。

## 7. 人怎样加、改、删一项

人的条目只由人定（同 `d-rules-human-only` 的理由：条目会在人的电脑上按时跑命令、按时叫醒主 Agent）。存储的写入只有一个入口 `openLoopStore({userHome, project}).apply(actor, mutation)`（`src/loops/store.ts`），它按身份核对（§13）：`human`（人敲的 `/loops` 命令）能删、恢复、确认恢复、对没有图的提议拍板；`harness` 只能照图上人拍过的待决写（§7.1 第 4、5 步）；`llm` 只能记一条 `open` 的提议，不能写条目。页面不写任何东西（§8）。

### 7.1 在主 Agent 的对话里（加、改、删）

人说「每 30 分钟查一下服务器，挂了告诉我」这类话时，走与规则板的提议同一条路（rules:§9.3）：循环板管提议的内容，M3 管说给人听与记人的话。0.1 让 `loop_propose` 自己在图上提一张带「不加」「加上」两个选项、推荐放最后的待决，人同意后用 `graph_decide` 拍板，并自带一套四行的校验；这违背 `d-chat-not-cards`，也绕过了 M3 附录 0.3 定的提议式待决与原话核对（m3:§3.3–§3.6、§3.8 第 3 条，评审 F4）。本稿改为：

1. `loop_propose`（只有主 Agent，`isMainAgent`）：输入 `{kind: 'add' | 'edit' | 'delete', entry?, body?, reason, replaces?}`。`add` 带 `body`（一项的 `title`、`why?`、`when`、`action`、`limits?`、`quiet?`），`edit` 带 `entry` 与新的 `body`，`delete` 只带 `entry`。按 §12 整份校验，插件的 id 直接返回 `forbidden`（「插件带来的条目暂时只能看」）。分配提议 id `lp-<8 位十六进制>`，在存储里记一条 `open` 的提议，`via` 取会话有没有图目录（图行服务的 `dirFor(cwd)`），带 `replaces` 时同一次写入把旧提议转 `superseded`。不写图。返回 `{proposal, describe, cautions, attach, message}`：
   - `describe`：循环板按 `body` 生成的一行人话，写生效之后会怎样，例「每 30 分钟在项目目录里跑 pwsh -NoProfile -File scripts/check-server.ps1，没过时告诉主 Agent」。
   - `cautions`：要让人知道的后果，按内容由循环板给出，例「这条命令会在你的电脑上、在项目目录里按时运行，拿不到 DSH 的凭证」「宿主崩溃之后它可能被重跑一次」「每天大约叫醒主 Agent 48 次」（告诉主 Agent 的条目按 §8.2 的算法算）。
   - `attach`：`loops:<提议 id>`。
   - `message`：`via: 'graph'` 为「Put it to the human with propose_to_human (kind question, attach <attach>): one plan in four lines; the recommendation line says what describe says, and the cautions go in the doubt or not-doing line. It takes effect only when the human agrees and you record their words with record_human_answer.」；`via: 'board'` 为「The project graph is not available: tell the human this proposal in four lines and that they can type /loops accept <id> or /loops reject <id>.」。
   - 内容不合时返回 `invalid` 与字段路径，什么都不记；取不到锁或写不进时 `busy`、`io`。
2. `propose_to_human`（M3，主 Agent）带 `attach: 'loops:<id>'`：M3 先经 `loopsService(ctx)?.attachable({cwd, proposal})` 核对它是这个项目里 `open`、`via: 'graph'` 的提议（不是就拒绝，`invalid`，`field: 'attach'`，`hint` 带循环板给的原因），再照常提一张提议式待决（四行由主 Agent 写，M3 查行与加粗、拼排版、数一条回复里的件数），正文最后一行写 `loopProposalLine(id)`，即「循环板提议 `lp-<id>`」。人补充或否掉之后主 Agent 改了再提：先 `loop_propose` 带 `replaces`，再 `propose_to_human` 带 `question`（改同一张待决）与新的 `attach`，M3 把正文末行换成新的提议 id。M3 0.3 还没有 `attach` 这个参数；规则板 0.6 已请 M3 加 `rules:` 一种（rules:§9.3、§10.7），本稿请 M3 按前缀分派，`loops:` 走循环板（§17）。
3. 人在对话里回话。同意：主 Agent 先复述一句「那我记成：每 30 分钟跑 …，没过时告诉你」，再调 `record_human_answer`（`kind: 'question'`、`answer: 'agree'`、`words` 是人的原话）；M3 核对原话（m3:§3.6 的 `personSaid`）后以 `llm` 加 `relay` 拍这张待决（`decide`，`conclusion` 为主 Agent 记成的那一句），拍板成功之后用 `loopProposalIdOf(待决正文)` 看它是不是循环板的待决，是就调 `acceptProposal({questionId, graphDir, cwd, by: {actor: 'llm', relay}})`，把结果的那一行放进 `record_human_answer` 的结果（下表）。补充、否掉：M3 只写批注，循环板什么都不改，提议仍是 `open`。人说这件事不用加了：主 Agent 带原话把待决改为 `dropped`（m3:§3.5），循环板在下一次对照时把提议转 `rejected`（第 5 步）。
4. `acceptProposal` 的核对与写入：读 `graphDir` 里那张待决；它是提议式、状态 `done`、有 `conclusion`；正文末行的提议 id 等于请求里这条（人同意的是最新那一版，旧版的 id 已被换掉）；最后一条 `decide` 历史的身份是 `human`，或是带 `relay` 的 `llm`；提议是 `open`（已经 `accepted` 时原样返回 `ok`，不写第二次）。都成立时以 `harness` 身份按提议写入（加、改或删），`source` 记 `{kind: 'person', via: 'chat', at, relay, question, proposal}`，提议转 `accepted`，同一次写入。原话的真假由 M3 在拍板之前核对过（`personSaid`，fail-closed），循环板不再核对一遍。
5. 对照与补写（拍板写在图上、循环板没跟上：循环行当时没加载，或两次写入之间进程退出）：循环行在开始跑项目时与之后每 60 秒，对每条 `via: 'graph'`、`open` 的提议在图上找正文末行指向它的待决：找到已同意的，按第 4 步同样核对后补写，`loop-entry` 的 `via` 为 `chat`，变更记录写「按图上 `<id>` 的拍板补写」；找到被带原话放弃的，记 `rejected`；7 天里没有任何待决指向它，记 `expired`（提了没交给人）。图是人拍板的事实源，循环板只执行它，所以别的路径写下、身份合第 4 步的拍板也会在这一步生效。立即生效的钩子只挂在 `record_human_answer` 上（评审 F4 的改法）；`graph_decide` 不挂，`/graph-apply` 已随面板只看删去（plain-ui §3.1）。

`acceptProposal` 的结果与 `record_human_answer` 多写的一行（英文，给模型）：

| 结果 | 多写的一行 |
| --- | --- |
| `ok`，`accepted` | `Loop board: proposal lp-<id> took effect (<entry id>).` |
| `missing` | `Loop board has no open proposal lp-<id> for this question; nothing took effect. Propose again with loop_propose and put the new one to the human.` |
| `busy` | `Loop board was busy; it applies this decision within a minute from the graph.` |
| `io` | `Loop board could not write; the decision is listed on the loop board page. Tell the human.` |
| `invalid` | `Loop board rejected the proposal content now: <message>. Tell the human; propose again if still needed.` |
| `forbidden` | `Loop board: this decision cannot write entries (<message>).` |

循环板服务不在时，M3 什么都不多写，由第 5 步补上。`busy` 与 `io` 之后第 5 步照图上的拍板补写；`missing`、`invalid`、`forbidden` 不补，交人：页面「要你看一眼的」一组在拍板之后 7 天内列出这张待决，行健康在拍板之后 24 小时内 degraded「图上待决 `<id>` 没有对应的循环板提议」（两者都在对照时从图算出，不另存状态）。

为什么要图上的待决（两种做法，采用的放最后）：

1. 只在存储里记，原话写在条目上：一次写入、不碰图。代价：人在对话里同意的这件事，图上没有任何痕迹，晨报的「拍板等多久」也量不到它；原话没有 harness 核对；和规则板走两条路。
2. 循环板记内容，M3 把它作为提议式待决交给人，人同意后带原话记下、harness 核对原话，循环板照办（采用）：拍板是图上的事实，`metrics` 的人的负担照常算到它；与规则板同一条路，主 Agent 只学一种做法；四行的排版只在 M3 一处（m3:§3.4）。代价是多一次图写入与一次跨行的调用。

图行不在或会话没有图目录时（`via: 'board'`），提议只在循环板里，主 Agent 照 `message` 把它说给人听，人打 `/loops accept <id>` 或 `/loops reject <id>`（§7.2）。

### 7.2 人的命令 `/loops`

人的命令只有一个 `/loops`（人在输入框里敲；身份为人，斜杠命令模型发不出，`docs/ORCHESTRATION.md` §2.10；`recordInput` 用默认值，命令事件记下人敲的几个词，同 `/rules`，rules:§9.2；`input.hint` 写下表的用法；`definitionId` 为 `dsh-glm-hourness/loops`）。0.1 的 `/loops-apply`（给页面用的 JSON 写入命令）随页面只看删去：没有调用方了，留着是死代码（`AGENTS.md`）。

| 命令 | 作用 | 结果（一行中文） |
| --- | --- | --- |
| `/loops` | 列出这个项目的全部条目，每项一行「名字 · 什么时候 · 上次 · 下次」，再一行「在等的 N 件」；只读 | — |
| `/loops delete <名字或 id>` | 把你的一项标为已删；变更记录留全文，7 天内能恢复 | 「已删「<名字>」；7 天内打 /loops restore <id> 能恢复」 |
| `/loops restore <id>` | 恢复 7 天内删掉的一项 | 「已恢复「<名字>」，下次 <时刻>」 |
| `/loops ack` | 确认页面上「存档恢复」那一行（§9.3 中间坏一行的情形），之后不再提示 | 「好，这条提示不再显示」 |
| `/loops accept <lp-id>`、`/loops reject <lp-id>` | 只给 `via: 'board'` 的提议（没有项目图时） | 「已加上「<名字>」，下次 <时刻>」或「这条提议不加了」 |

- `<名字或 id>`：先按 id 精确找，再按名字（去掉首尾空白之后完全相同）找你自己的条目；名字对上几项时不删，列出它们的 id。插件带来的 id 一律返回「插件带来的条目只能看，删不掉」，什么都不写（`d-defaults-readonly`）。
- 新建与修改没有命令：一项要写清什么时候、做什么、命令原文，写成命令参数人打不清楚，也绕开了提议的四行与 `cautions`；在对话里说一句，主 Agent 会提出来（§7.1）。
- 命令跑在打开它的会话里，会话日志里留一行命令事件（`source` 为 `user`，commands:333–346）。

### 7.3 agent 能做什么

| 工具 | 谁能用 | 输入 | 输出 |
| --- | --- | --- | --- |
| `loop_show` | 任何 agent | 无 | 这个项目的全部条目（插件的与人的）、每项的上次与下次、在等的（`held`、`deferred`）与最近 10 次运行；不截断 |
| `loop_propose` | 只有主 Agent（`isMainAgent`，M3） | §7.1 第 1 步 | 同 §7.1 第 1 步；不是主 Agent 时 `forbidden`，`hint`「ask the main agent to propose it」 |
| `loop_note` | 只有主 Agent | `{entry, text}`（`text` 1–500 个码点） | `{entry, run}`；这一项没有投给主 Agent 的运行时 `invalid`（「这一项还没有交给你的运行」） |

- 名字登记在 `src/shared/tool-names.ts` 的新常量 `LOOP_TOOL_NAMES`，契约测试核对循环行注册的与它相等。在 GLM 路由上延迟加载，不进常驻名单（同规则板的两个工具）；`loop_note` 的用法写在需要它的条目文字里，模型读到消息时才需要它。
- `loop_propose` 不写给人看的话：四行由主 Agent 在 `propose_to_human` 里写，M3 的说明已原样带 `PLAIN_QUESTION_GUIDE`（m3:§3.4），`loop_propose` 的说明只写一句「The human reads describe and cautions through your propose_to_human lines; write those lines in plain words as propose_to_human's guide says.」，不另带一份例题。
- agent 没有写条目的工具；`loop_propose` 只在存储里记提议，不生效。

### 7.4 以后放开默认条目时要改的地方

人说的是「先暂时」。放开时：存储加一种覆盖记录 `{entry: 'execute.…', override: {when?, action?, disabled?}}`，只有人能写（经对话的提议，或 `/loops` 的新子命令）；页面在插件的条目上加一句「要改：跟主 Agent 说……」，停用时写明停了会怎样（例如停了 `execute.handback`，交回之后没人提醒主 Agent 派审查）；插件更新时交来的条目变了，覆盖记录照旧生效，页面写「插件更新了这一项的默认值，你的改动仍在」。存储格式今天就留着 `override` 这个字段名不用，不另做迁移。

## 8. 面板

### 8.1 位置与登记

按 plain-ui §4.7：循环板是第 2 层的一页，从首页页脚「循环板 ›」、上手页第 5 块（plain-ui §6.4，字句归 plain-ui）与首页「现在」里循环板的那一行进入。板块登记表 `ui/src/graph/boards.ts` 里登记：

- `id: 'loops'`，`label: '循环板'`（0.1 写的「循环」改掉，与 plain-ui 同名）。
- `subscribe`、`snapshot`：读投影 `hournessLoops`（§8.4）与 `view.json`，变了就通知；`available` 为投影在这个会话上有值且 `projectKey` 不为空。
- `homeLine`：只在有事要人看时给一行（§8.3），没有时为 `null`。
- `guideLine`：`null`（上手页第 5 块的字句是固定的引导，plain-ui 不要它给此刻的状态）。
- `Page`：`ui/src/loops/LoopsPage.tsx`。

右侧栏 DSH 自带的「自动化任务」页照样在，循环板建的任务也出现在那里（标题以「循环板 · 」开头）。

### 8.2 页面（`mockup-loops.svg`）

页面只看（`d-ui-look-not-operate`，plain-ui §3.1、§4.7）：没有开关、新建、改、删除、恢复、「知道了」按钮与表单，页面也不经任何命令写。能点的只有展开收起（讲细点、说重点）与导航（打开主 Agent 的对话、打开项目图里的节点）。自上而下：

1. 页头：「循环板 · 到点了或碰到某件事，就去做一件事」。下面一行「主 Agent 在会话「<标题>」」（点开跳到那个会话，同 plain-ui「点开跳到主 Agent 的对话」）；没有主 Agent 时「还没有主 Agent：在输入框打 /wish，到点的几项才会开始」。再一行灰字：「到点告诉主 Agent 的几项，DSH 的自动化任务页里也看得到；在那里改的不算数。主 Agent 的会话里挂着这些提醒，归档这个会话时 DSH 会先停掉它们，换到新的主 Agent 会话之后循环板再建。」
2. 要你看一眼的（只在有时出现）：连着失败的、被限次的、被规则拦下的、DSH 里的提醒被改过或没了的、在等高峰结束的、存档恢复过的、插件交来却读不懂的、图上拍了板却没生效的，每件一行，带「讲细点」。存档中间坏了一行的那一件下面写「知道了就在输入框打 /loops ack」。
3. 碰到某件事就做的：事件触发的插件条目（M7 的七项、M4 的两项、循环行的四项、GLM 的四项，计价服务不在时没有高峰与 GLM 的几项）。每项一行名字；一行「什么时候 · 做什么」；一行「上次 10 月 30 日 01:40 · 已交给主 Agent」（`self` 条目报不了运行的，写「它自己执行，这里只列出」）；一行灰字写它从哪来：「<插件名>带来的 · 只能看」，有 `basis` 时加一句「· 依据 <basis>」。插件名用插件管理器里显示的名字（plain-ui §4.7 的约定，例「项目编排」「GLM 通道」；名字从同一个函数 `pluginLabel(包名)` 来，§17 请规则板共用）。灰显的项写原因（「执行那一行没启用，这一项现在不跑」）。第 15 项展开是每个批过的检查器一行与「检查器自己的规矩」（§5.3）。第 13、14 项写「此刻：不是高峰；下一个高峰 明天 14:00 · 高峰模式：少做（出厂默认）」，下面一行「档位在规则板上看；要改：在输入框打 /rules peak 不做，或跟主 Agent 说」。
4. 到点做的：时间触发的插件条目（晨报、周报、夜间巡检）。同上，另写「下次 10 月 31 日 08:30 · 每天叫醒主 Agent 1 次」。
5. 本项目加的：人的条目，事件的与时间的都在这一组。来源一行写「你在对话里加的：「<原话>」」（`via: 'board'` 的写「你在输入框里同意的」）；命令类的写出命令原文。每项最后一行：「要改：跟主 Agent 说「把<名字>改成……」；要删：在输入框打 /loops delete <名字>」。一项都没有时一行：「还没有你加的。要加：跟主 Agent 说「每 30 分钟查一下服务器，挂了告诉我」」。最近 7 天删掉的折在下面，每项写「要恢复：在输入框打 /loops restore <id>」。
6. 主 Agent 自己设的提醒（DSH 自带）：只读，标题与下次，「在 DSH 的自动化任务页里管理」。
7. 最近跑过的：最近 20 次运行，每次一行「时刻 · 名字 · 结局的人话」；点开是那次的触发、合进来的事件个数、用时、退出码、日志路径与主 Agent 记的结论。
8. 循环板自己的规矩（折起）：「插件的事件条目 5 秒内的事件合成一次、每小时至多 30 次；你加的 30 秒内合成一次、每小时至多 6 次，多出来的合进下一次；循环板自己做的事直接引起的事件，10 分钟内又触发同一项时停下那一次；命令默认 60 秒超时、拿不到 DSH 的凭证、只受不分会话的规则管；给主 Agent 的文字先转义、遮住像密钥的字串；一个项目只有一个 DSH 进程在跑这块板。」

每项点开（讲细点）：为什么有它（`why`）、触发的原文（cron 表达式、事件与筛选）、给主 Agent 的英文原文或命令原文、harness 动作的名字、它自己的规矩（`ownRules`）与明细（`details`）、最近 5 次运行与主 Agent 记的最近 3 条结论、id 与交它的行（小字）。

「每天大约叫醒主 Agent N 次」的算法：每天 1、每周 1/7、每隔 86400/秒数、cron 取接下来 7 天的次数除以 7；事件条目按最近 7 天的运行数除以 7，没有记录时不写。

### 8.3 首页的一行

首页「现在」一节的循环板一行（`homeLine`，至多 60 个码点），按顺序取第一个成立的：「GLM 登录失效了：在输入框打 /glm-login」（`glm:login-rejected` 投给了一个自己走 GLM 的主 Agent：它这时回不了话，M6-L4）；「循环板：「<名字>」连着 3 次没过」；「循环板：N 件消息在等高峰结束」；「循环板：DSH 里的提醒被改过，已改回」（当天）；「循环板：<插件>交来的 N 项读不懂」。都不成立时为 `null`。点了打开循环板。

### 8.4 数据怎样到页面

- 投影 `hournessLoops`（`sessionProjections.register`，session-projection:68）的 `init(header)` 按会话头的 `cwd` 算出项目键与 `view.json` 的绝对路径 `{projectKey, viewFile}`；会话没有 `cwd` 时 `{projectKey: null}`，页面写「这个会话没有工作目录，没有循环板」。
- 跑这个项目的宿主把页面要显示的东西写成一份 `view.json`（§9.1，由执行表、存储、`state.json`、记录末尾、`schedule.catalog()` 与 `stateFor` 推出，内容变化时写，至多每 2 秒一次，临时文件加改名）。页面经 `remote.workspaceFiles.readBytes` 按绝对路径读，经 `changes` 监视（与规则页同一种读法，rules:§9.1；`dsh-api-workspace-files/README.md`:40、58），页面可见时另每 15 秒按大小与修改时间重读一次（改名替换之后监视还报不报变化没核对，同规则板的 V4）。
- 页面不调 DSH 的 `schedule` Remote，也不读循环板的其他文件：`view.json` 里已经有页面要的全部内容。没有进程在跑这个项目时（`view.json` 超过 3 分钟没更新），页面照旧显示，页头多一行「现在没有 DSH 进程在跑这块板，下面是 <时刻> 的样子」。

### 8.5 页上的字

设计里的词在页上换成人话（`d-plain-questions`）：条目 →「一项」；触发 →「什么时候」；动作 →「做什么」；来源 →「谁带来的」；运行 →「这一次」；harness 动作 →「系统自己做」；结局按 §6.10 换成「已交给主 Agent」「跑完了，没事」「跑完了，已告诉主 Agent」「交给它自己的那一行」「这次不用跑」「次数太多，合进下一次」「在等规则放行」「被规则拦下」「先存着」「没成功」「放太久，作废了」；快照 →「存档」；流水 →「变更记录」；门禁 →「合入前的检查」；门禁工作树 →「专门做检查的那份检出」；标定 →「练习题」。事件 id、条目 id 只作小字。L2 对全部固定字串跑 `plainWordsIn`（验收第 21 条）。0.1 第 4 项的页面说法与草图里有「门禁」两个字，验收的检查过不了（评审 F14）；那一项现在是 M7 的 `execute.trunk`，本稿给它的说法是「在专门做检查的那份检出里跑一遍合入前的检查」（§5.1），草图同改。

## 9. 存储与恢复

### 9.1 文件

```
<userHome>/loops/                         userHome = glmHournessData.userHome（默认 C:\Users\29596\.dsh\glm-hourness）
  projects/<key>/                         key 同 rules:§7.3
    project.json                          项目键对应的工作区根（显示用）
    entries.json                          人的条目与提议的快照（由 journal 推出）
    journal.jsonl                         人的条目与提议的变更记录（事实源，只追加）
    entries.lock                          写锁（存储与收件箱共用）
    events.jsonl                          项目收件箱（§6.3）；events-<时刻>.jsonl 为轮换下来的
    state.json                            运行状态：bindings、收件箱位置、keys、held、待跑、限次攒着的事件、host、last、已确认的恢复（可重建的缓存）
    runner.lock                           项目的运行锁（§6.1）
    runs.jsonl                            运行记录（指标流水合入之前，§6.10）
    notes.jsonl                           主 Agent 记的结论
    view.json                             给页面的一份（§8.4）
    logs/<entry>/<时刻>.log                命令输出（§6.6）
  machine/
    runner.lock                           机器一级的运行者（§6.1）
    state.json                            上一次的登录状态、用量流水读到的位置、上一次读额度的时刻、机器一级的 held
    told.json                             账号一级已说过的事（§6.4）；只有机器一级的运行者写
    last-step.json                        最近一次走过步的主 Agent 在哪个项目；各进程以改名覆盖，后写的算数
    runs.jsonl                            loop-read（§6.10）
```

插件的条目不在任何文件里：它们在交来它的那一行的代码里，循环板每次读时与人的条目合在一起；进程重启后各行重新交（§3.1）。用户级目录只从数据目录服务取（`docs/DESIGN.md` §2.4）；数据行不在时循环板没有存储，页面写「没有用户级目录：循环板不可用」，行健康 inactive。探针的每个场景把数据目录行指向场景自己的目录（`docs/DEVELOPMENT.md` §3），场景里的循环板与真实的互不影响。放在用户级目录、按项目分，而不是工作区里或入库，理由同 rules:§7.1 的第 3 种做法：不往项目的工作树里写，运行状态不给 git 历史添噪声。

### 9.2 写入

1. 校验请求结构（§12）与身份（§13），不合返回 `invalid` 或 `forbidden`。
2. 取写锁：以 `wx` 创建 `entries.lock`，内容 `{pid, startedAt, token}`；已存在且持有超过 10 秒，改名为 `.stale-<毫秒>` 后重取；否则每 25 毫秒重试，2 秒内取不到返回 `busy`。做法同 rules:§7.4 第 2 步；M5 的 `src/data/lock.ts` 先合入就用它。
3. 读最新状态；带 `rev` 的写入核对修订号，不等返回 `stale_revision`。
4. 追加一条变更记录并 `fsync`：`{seq, at, actor, op, id, before, after, relay?, question?, proposal?, via}`。`op` 为 `propose`、`supersede`、`accept`、`reject`、`expire`（提议）与 `add`、`edit`、`delete`、`restore`、`ack`（条目与恢复的确认）。每条都带这一项写后的全文 `after`（删除时 `after.status` 为 `deleted`），所以重放不需要上一条也能得到这一项的状态。
5. 写快照：`entries.json.<随机串>.tmp`、`fsync`、改名覆盖；Windows 上改名遇到 `EPERM`、`EBUSY` 按 20、40、80、160、320 毫秒重试 5 次，仍失败就留着临时文件，下一次读时按记录补上（同 rules:§7.4 第 7 步）。
6. 释放锁；发一次对账（§6.2）与 `view.json` 重写。

人的条目一个项目至多 50 项（`invalid`：「已经有 50 项了，先删掉不用的」）；`open` 的提议至多 20 条。

### 9.3 读与恢复

| 读到的情况 | 处理 | 页面与行健康 |
| --- | --- | --- |
| 快照有效且 `seq` 等于记录最后一条 | 用快照 | 无 |
| 快照落后于记录（改名失败过） | 从快照的 `seq` 之后按记录补上，写新快照 | 无（日志 info） |
| 快照为空、全零、截断或解析不了 | 从头按记录重放，写新快照 | 「循环板的存档坏了，已按变更记录重建」 |
| 记录最后一行没有以换行结尾 | 把这一行的字节存进 `.journal.corrupt-<时刻>`，截掉，再按上面判断 | 「变更记录的最后一条没写完，已丢掉」 |
| 记录中间有读不出的行 | 跳过它，继续往后读；因为每条带全文，后面同一项的记录照样生效，只丢那一次的版本；整份复制到 `.journal.corrupt-<时刻>` | 「要你看一眼的」一组：「变更记录第 N 行读不出，已跳过；涉及的那一项按之后的记录显示。知道了就在输入框打 /loops ack」；行健康 degraded，直到人打 `/loops ack`（进记录，`op: 'ack'`） |
| `state.json` 读不出 | 重建：`bindings` 从 `schedule.catalog()` 按提示文字的第一行认回（指纹取那一行的记录）；收件箱位置取文件末尾（不补处理）；`keys` 从收件箱最近 7 天的行取；`last` 从运行记录末尾取；`held` 与待投的消息正文只存在 `state.json` 里，丢了就丢了：运行记录里有 `loop-fired`、没有 `loop-done` 的那些运行各补一条结局 `expired`（原因 `state-lost`） | 「循环板的运行状态坏了，已重建；停机期间的事件这次没有补，先存着的 N 条消息丢了」，列出这 N 项的名字 |
| 机器一级的 `state.json` 或 `told.json` 读不出 | 重建为空：登录状态从下一拍重新看（`rejected` 时会再说一次），已说记录清空（额度快用完这一期可能再说一次） | 行健康 info 一次 |
| 两个文件都不在 | 空 | 无 |

人的条目的事实源只有 `journal.jsonl`；`state.json` 里的东西都是可以重新推出或可以丢的，丢的时候有记录（`expired`、`state-lost`）。`state.json` 的写法同快照（临时文件、`fsync`、改名），由运行锁的持有者一个进程写，不会有两个写者。

## 10. 宿主契约与 rc.3 证据

### 10.1 用到的钩子、服务成员与载荷字段

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据；「新用」指循环行第一次用，实现时补进接口对照表与薄适配层 `src/shared/dsh-min.ts`。文件都在 `reference/dsh-desktop-0.2.1-rc.3/` 下。

| 接口 | 用在哪 | 证据 | 结论 |
| --- | --- | --- | --- |
| 服务 `schedule`（`ScheduleService`，服务名在构造里给出） | 绑定与对账（§6.2） | schedule:1992 `super(ctx, "schedule")`；`dsh-tool-schedule` 用 `ctx.schedule`，tool-schedule:540；Web 组合挂载，web-app `cordis.patch.yml`:139–140 | 新用〔实读〕；经 `ctx.get('schedule')` 取，不写进 `inject`（headless 没有它） |
| `schedule.create(sessionId, request, signal?)`：`title` 必填、去空白后 1–120 字符；`prompt` 非空；六个选择器恰好一个；返回存下的记录 | 建任务，记指纹 | schedule:2083–2112；标题 schedule:93–97；`every_seconds` 至少 60，schedule:21 | 新用〔实读〕 |
| 选择器形状：`daily {time, time_zone}`、`weekly {time, time_zone, weekdays}`、`cron {expression, time_zone}`、`every_seconds`、`at`（带偏移的字符串，或 `{date, time, time_zone}`）；键多一个少一个都拒 | 映射（§2.2） | schedule:1052–1059、1118–1123、1366、977–996 | 新用〔实读〕 |
| 记录的键：`at` 为 `id, kind, title, prompt, scheduledAt`；`every` 多 `everySeconds`；`daily` 多 `time, timeZone`；`weekly` 多 `time, timeZone, weekdays`；`cron` 多 `expression, timeZone`；解码要求键恰好这些 | 指纹（§6.2） | schedule:74–77、256–312、356–365、411–421、463–472、508 | 新用〔实读〕 |
| 规范化：`time` 写成 `HH:mm:ss.SSS`，时区取 `Intl` 的规范名 | 不自己再算规范化，比 DSH 返回的记录 | schedule:1056–1057、212–222 | 〔实读〕 |
| `schedule.list({sessionId})`：这个会话的活动任务的记录本身 | 改回时取 `expected` | schedule:2120–2122 | 新用〔实读〕 |
| `schedule.catalog()`：全部任务，每条是记录加 `sessionId`、`status`、`lastDelivery?`，按 `scheduledAt` 再按 id 排序 | 对账、页面、主 Agent 自己设的提醒 | schedule:2129–2136 | 新用〔实读〕 |
| `schedule.delete({sessionId, id}, signal?)` → `{id, deleted, code?}`；硬删除，连发送记录 | 搬任务、删条目、清孤儿 | schedule:2164–2182 | 新用〔实读〕 |
| `schedule.update({sessionId, id, expected, title?, prompt?, change?})`：`expected` 按整键解码，不合返回 `invalid_rule`；与当前记录不等返回 `schedule_conflict`；`schedule_not_found`、`schedule_ended`；规范化后等价的不写，返回 `updated: false`；`change` 只能有 `kind` 与对应的选择器 | 改回被人改过的任务 | schedule:2197–2224、1806–1837、1710–1716 | 新用〔实读〕 |
| 会话的拒绝（子会话 `subagent_session`、不能投递的会话） | 只记错误 | schedule:2199–2200、2244–2262 | 〔实读〕 |
| 事件 `schedule/changed`：任务写入提交之后发，没有载荷，监听抛错被吞 | 触发对账 | schedule:2231–2237 | 新用；本行的 `ctx.on('schedule/changed')` 收不收得到〔未核实，V2〕；收不到时每 60 秒一拍的对账照样做 |
| 投递：`sessionController.resolveAgent(sessionId)` 恢复冷会话；`createUserMessage({content, source: {kind: 'schedule'}})`；`agent.followup(message)`；`sessions.flush(session)` 返回假即失败；失败只记日志，不自动重试；同一会话同时到期的重复任务合成一批；在 `agents.withoutInitiator` 里 | 理解 DSH 的投递、在主 Agent 那一步认出循环板的提醒 | schedule:1576–1598、1627–1640、1571、1531 | 〔实读〕 |
| 提醒正文：`[SCHEDULE REMINDER]`、`schedule_id_json`、`occurrence_at`、`reminder_prompt_json`；批次 `[SCHEDULE REMINDER BATCH]` 与 `reminders_json` | 认出循环板的提醒（§6.4） | schedule:1386–1418 | 〔实读〕 |
| 重启后每个重复任务只补最近错过的一次 | 漏跑（§6.8） | schedule:590、656、687、821；`dsh-schedule/README.zh.md`「概述」 | 〔实读〕 |
| 活动任务算会话的活动；归档要 `stopActivity`，带上时删掉这个会话的全部活动任务 | 归档的说明（§6.2） | schedule:2044–2058、2273–2292；dsh-workspace:512–516、623 | 〔实读，评审核对〕 |
| 服务 `sessionController` 与 `resolveAgent(sessionId)` → `{agent}` 或 `{error}` | 提供循环板服务的条件（§3.1）；恢复冷的主 Agent 会话来投递（§6.4） | api-session-controller:2951–2952（构造与 `super(ctx, "sessionController", …)`）、3037–3039 | 新用；从本行调用的效果〔未核实，V3〕 |
| `agents.get(id)`、`agents.withoutInitiator(op)` | 投递 | agent:596、414 | `get` 已用；`withoutInitiator` 新用〔实读，DSH 定时服务的同一用法〕 |
| `agent/created`（serial，`{agent, source, signal?}`） | 开始跑项目、投存着的消息、搬任务 | agent:581–585 | 已用 |
| 活 agent 的 `status`、`followup`、`steer`、`inject` 与唤醒标记 | 投递（§6.4 第 3 条） | agent-loop:790–793、800–814 | 已用（graph-panel 的 `/graph-run`、规则板的唤醒） |
| 收件箱的领取：下一回合领走下一步队列的全部与下一回合队列的一条；回合末尾查一次待领 | 理解 `inject` 与 `steer` 何时被读到 | agent-loop:101–111、1000–1008、1037 | 〔实读〕 |
| `agent/pre-step`（waterfall，`{agent, messages, turn, step, signal}`） | 在主 Agent 领到循环板提醒的那一步加一行；记主 Agent 走过步 | agent-loop:902–927；经公共库的 `installStepNotice` | 已用 |
| 没写来源的 `followup`、`steer` 被当成人的话；`update_goal` 的 `resume` 要当前回合有人直接说的话 | 循环板的消息带来源（§6.4）；高峰结束时模型不能自己恢复被阻塞的 goal（§6.9 第 4 条） | tool-goal:44–52、348–352 | 〔实读〕 |
| `goals.get(agent)` 的 `phase` 与阻塞原因码 | 唤醒方式、高峰结束的判断 | goal:611–614、880–888（rules:§6.6 已列） | 新用（规则板同用） |
| 会话头 `cwd`、`requestHeader().config.provider` | 项目键 | session:1820–1826、1612 | 已用（guard、`sessionRoute`） |
| `sessions.flush(session)` | 投递后确认落盘 | session:1950；schedule:1597 同一用法 | 新用〔实读〕 |
| `tools/pre-execute`（waterfall，`(exec, next)`）；`exec.name`、`exec.arguments`、`exec.agent`；拒绝结果 | 规则 `loops:schedule-tools` | tools:3321、3335–3346 | 已用（guard 框架） |
| 工具 `schedule_create {title, prompt, …}`、`schedule_delete {id}`、`schedule_update {id, …}`；后两者只作用于调用方会话 | 规则 `loops:schedule-tools` 的判定 | tool-schedule:540–600、637–647 | 〔实读〕 |
| `commands.register`；`recordInput` 默认记下参数 | `/loops` | commands:266、170、334–339 | 已用 |
| `tools.register` | `loop_show`、`loop_propose`、`loop_note` | tools:2968–2981（文档注释 2968–2973，方法从 2974 起） | 已用 |
| `sessionProjections.register` 与 `init(header)` | 投影 `hournessLoops` | session-projection:68 | 已用 |
| 客户端 `remote.workspaceFiles.readBytes` 与 `changes` | 页面读 `view.json` | `dsh-api-workspace-files/README.md`:40、58 | 规则板新用，循环板照用 |
| Web 组合的 preset 挂载 `dsh-tool-schedule` 与 `dsh-time-context` | 主 Agent 自己设的提醒 | web-app `presets/cordis.patch.yml`:22–23、38–39 | 〔实读〕 |
| cordis `ctx.inject(names, cb)` 与 `ctx.provide` | 只在有会话控制器时提供服务；各行交条目 | `src/shared/dsh-min.ts`:303–310 的注释（cordis:1600）；`src/graph/panel-row.ts`:122、150 | 已用（对宿主服务）；对本包服务〔推断，V12〕 |

不用的：自定义 Remote 服务与新的 waterfall（第三方做不到，`docs/DEVELOPMENT.md` §5 第 6 条）；`agent/pre-step` 的 `reject` 与改动领走的消息（会丢消息，§6.2 第 1 种做法）；DSH 的 `schedule` Remote（客户端，§8.4）；`agents.currentInitiator`（0.1 用它推因果，本稿改用自己的异步上下文，§6.7）。

### 10.2 未核实与验证方式

| # | 什么 | 怎样验 | 不成立时 |
| --- | --- | --- | --- |
| V1 | 本行经 `ctx.get('schedule')` 拿到的就是 `ScheduleService`，`create`、`list`、`catalog`、`delete`、`update` 可调 | L3：探针覆盖层挂 Web 组合的 `schedule` 与 `session-controller` 行（沙盒模板没有它们，场景照 guard 影子场景的做法加） | 到点告诉主 Agent 的条目不跑，行健康 degraded「拿不到 DSH 定时服务」；事件条目照常 |
| V2 | `ctx.on('schedule/changed')` 在本行收得到 | L3 同上 | 只靠 60 秒一拍的对账，验收第 6 条的 60 秒仍成立 |
| V3 | 本行调 `sessionController.resolveAgent` 能恢复冷的主 Agent 会话，恢复出的 agent 投 `followup` 后照常开一回合 | L3（冷会话的场景：建会话、释放、再投） | 冷会话只等它下一次 `agent/created` 再投（同 `wake: false`），页面写「主 Agent 的会话没打开，打开后才收到」 |
| V4 | 主 Agent 换会话后旧会话的任务删掉、新会话的任务到点照常投 | L3（`/wish here` 的场景，平移时钟） | 对账照样按 catalog 修正，验收第 5 条改为 L4 |
| V5 | 宿主被强杀后 `cleanExit` 缺失、正常退出时写下 | L4（任务管理器结束进程；正常退出） | `crashed` 只按开机时刻判（只认重启电脑） |
| V6 | DSH 程序文件的位置：Electron node 模式下 `process.resourcesPath` 有没有值；没有时用 `path.dirname(process.execPath)` 下的 `resources/app.asar` | L4（桌面版里打一行日志） | `appChanged` 恒为假，页面在用到它的条目旁写「看不出 DSH 有没有更新」 |
| V7 | Windows 上两个进程在同一把 `entries.lock` 下追加收件箱不丢行 | L2（两个 Node 子进程各写 200 行，同 rules:§14 的做法） | 改为每个进程写自己的收件箱文件 `events-<pid>.jsonl`，读的一方合并 |
| V8 | 主 Agent 在高峰停着时读到 §6.9 的那一行就只回一行 | L3（脚本 provider 不能证明，靠 L4 看一次真实回复） | 多花的是一回合，档位与等待单仍由规则板管；记进 dogfood 的复盘 |
| V9 | 主 Agent 有 active 的 goal 时，`inject` 进去的消息不被 goal-round-driver 当作竞争输入（rules:§15 V3 的同一件事） | 随规则板 V3 的 L3 | 改为等这一轮结束、agent 空闲时再 `inject` |
| V10 | DSH 到点投来的提醒（`followup`）在主 Agent 正由 goal 驱动时进来，驱动器把它当竞争输入作废这一轮的预约（goal-round-driver:249）之后，处理完提醒是否照常开下一轮 | L3（goal 驱动中投一条到点提醒） | 循环行在那一步的那一行末尾加 `When this is done, continue the goal you were driving.`；仍停住时记进 dogfood 的复盘，并报给 M7 |
| V11 | `steer` 进运行中的主 Agent 的消息在这一回合里被读到（唤醒标记在回合末尾的检查之后仍生效） | L2（假宿主照 agent-loop:809–811、1037 的样子）与 L3 | 退回 0.1 的 `inject`，并在回合结束时（`agent/turn-end` 一类的事件，监听方式没有核对）补投滞留的那条 |
| V12 | `ctx.inject(['glmHournessLoops'], …)` 对本包 `ctx.provide` 的服务与对宿主服务同样生效：服务后到时回调被调、撤回时子上下文被销毁 | L2（真实 cordis，两个假行）与 L3 | 交条目的一方改为每次 `agent/created` 调一次 `contribute`（同一个来源再交是替换，§3.1）；`dispose` 放在它自己的 `ctx.effect` 里 |
| V13 | 图引擎接受字段不变的 `edit`（`loops.remind-waiting` 叫主 Agent 用 `propose_to_human` 的 `question` 把同一张待决重新给人看） | L2（临时目录里的真实图引擎） | 文字改为「say each in one plain line with its title」，不重新提 |

0.1 的 V9（ZCode 桌面版自己会不会定时读额度）删去：读额度的时机已由 M6 0.3 定为「GLM 有新用量之后、至多每 15 分钟」（m6:§4.4），本稿照做，不再取决于这一点。

## 11. 失败与降级

### 11.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| 没有数据目录服务 | 不注册投影与命令；工具注册，调用时返回「循环板不可用：没有用户级目录」；不提供服务 | 行健康 inactive |
| 没有 `sessionController` | 不提供服务、不跑条目，只注册工具、命令与投影；M7 照它的退路执行事件条目 | info「这个进程不跑循环板（没有会话控制器）」；headless、探针与标定里本来如此，不算降级 |
| 有 `sessionController`，没有 `schedule` | 跑事件条目、命令条目与 harness 条目；到点告诉主 Agent 的几项不建任务 | degraded「没有 DSH 定时服务：到点告诉主 Agent 的条目不跑，事件条目照常」 |
| 工具或命令注册失败 | 撤掉本行全部注册 | inactive，写原因 |
| 一份交来的条目被整份拒绝或丢了几项 | 其余照常 | degraded，按（来源、id）各一次 |
| 计价服务形状不对，或 `loopDefaults` 里有不合的项 | 那几项不显示；`loopDefaultsOf` 自己按 id 报一次（m6:§5） | degraded，一次 |
| 规则服务、高峰模式服务不在 | 不攒消息，档位显示「在规则板上看」，第 14 项判不了档位时 `skipped` | 不降级，行健康写一行 |

### 11.2 运行期

| 操作 | 失败的情形 | 可恢复吗 | 调用方得到什么 | 怎样发现与留痕 |
| --- | --- | --- | --- | --- |
| 存储写入（`/loops`、`acceptProposal`、`loop_propose`） | 取不到锁 | 是 | `busy`：「循环板正忙，没记上，再打一次」；`acceptProposal` 一分钟内按图补写 | 不记（没有写成） |
| 同上 | 修订号变了 | 是 | `stale_revision`：「这一项刚被改过，再打一次」 | 不记 |
| 同上 | 内容不合、身份不对 | 是（改了再提） | `invalid`（字段路径与人话）、`forbidden` | 不记 |
| 同上 | 写不进文件 | 视磁盘 | `io`：「写不进文件：<原因>」 | 行健康 degraded；宿主日志 warn |
| `contribute` | 来源不合、名字空间被占 | 否（交的一方改代码） | `ok: false` 与原因 | 行健康 degraded；`loop-contribution` |
| 同上 | 几项不合 | 否 | `dropped` | 同上 |
| `emit` | 事件没声明、载荷不合、算不出项目 | 否（交的一方改代码） | `ok: false` 与码 | 行健康 degraded（按事件 id 一次） |
| 同上 | 取不到锁、写不进 | 否（这一次） | `busy`、`io` | 行健康 degraded；事实在图上，晨报的例外一节照常推出（§6.3） |
| harness 动作 | `run` 返回 `failed`、抛错、被拒、超过 6 小时 | 视动作 | — | `loop-done` `failed`；行健康 degraded 一次；有 `tell` 时交给主 Agent |
| `recordRun` | id 不是 `self` 条目 | — | 丢掉 | 计数进行健康 |
| 建、改、删 DSH 任务 | `ScheduleInputError`（内容不合） | 否（等条目或主 Agent 变化） | 这一项标「DSH 不收这个时间：<信息>」 | `loop-drift`；行健康 degraded |
| 同上 | 存储失败（DSH 的 promise 被拒） | 是 | — | 下一拍重试，连续失败按 1、2、5、10 分钟退避；宿主日志 warn |
| 同上 | `update` 返回 `updated: true` 以外的码 | 是 | — | 删掉重建（§6.2 第 3 条） |
| DSH 到点没投出 | 过了 5 分钟 `lastDelivery` 没变 | 是 | — | `failed` 一次，删掉重建，循环行补投 |
| 投给主 Agent | 没有主 Agent | 是 | — | `held`；24 小时后 `expired`；页面写原因 |
| 同上 | 恢复会话失败、`flush` 为假、抛错 | 是 | — | 1、5、15 分钟重试；仍失败 `failed`，行健康 degraded |
| 同上 | 高峰停着（`heldForPeak`） | 是 | — | `held`；单解除后投出 |
| 跑命令 | 起不来（找不到程序） | 是（人改命令） | 按 `report`：没过算一次失败，交给主 Agent 的写「没跑起来：<原因>」 | `loop-done` `reported` 或 `ran`，`reason: 'spawn'` |
| 同上 | 超时 | 是 | 同上，写「超过 <秒> 秒，已结束」 | 进程树被结束；`reason: 'timeout'` |
| 同上 | 退出码非 0 | — | 这是结果不是故障，按 `report` 交 | `exits` |
| 同上 | 日志写不进 | 是 | 结果里写「没有日志」 | 宿主日志 warn |
| 问规则板 | 排队 | 是 | — | `deferred`，24 小时后 `expired` |
| 同上 | 拦截 | 否（人改规则） | — | `blocked` 与规则 id；页面「要你看一眼的」 |
| 同上 | 规则板读不了 | — | 照常跑 | `rules-unavailable` |
| 读收件箱 | 一行读不懂、事件没声明 | — | 跳过、`expired` | 计数进页面「最近跑过的」末尾一行与行健康 |
| 运行锁、机器锁 | 别的活进程持有 | — | 本进程只显示 | 页面一行，行健康 info |
| 同上 | 旧锁 3 分钟没刷新或开机时刻不同 | 是 | 接手 | 改名的旧锁留着 |
| 读额度（机器一级） | `quota()` 抛错、被拒、返回 `failure` | 是 | — | `loop-read` `ok: false`；下一次新用量、满 15 分钟再读；GLM 包自己记失败（m6:§4.5） |
| 读用量流水 | 文件不在、读不出、行读不懂 | 是 | 这一拍不判 | 计数；连续 60 拍读不出时行健康 degraded「读不到用量流水，额度快用完这一项暂时不判」 |
| 写 `last-step.json` | 改名失败 | 是 | 下一次再写 | 无（最多让账号一级的事投给前一个项目） |
| 时钟回拨或跳变 | 下一次的时刻算错 | 是 | 每一拍按当前时钟重算 | 无 |
| 限次、自己触发自己 | 触发太多 | 是 | — | `suppressed`；插件的条目被限次时行健康 degraded |
| `loop_note` | 不是主 Agent、条目没有交给它的运行 | 是 | `forbidden`、`invalid` | 不记 |

### 11.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 删 DSH 任务 | 连发送记录一起删掉（schedule:2164–2182） | 只删 `bindings` 里循环板自己建的、或提示文字以 `Loop board: ` 开头的；agent 不能用这个开头建提醒（§6.2），所以不会删到主 Agent 自己的；循环板自己的运行记录另存，不依赖 DSH 的发送记录 |
| 人删自己的条目 | 条目不再跑 | 只标为已删，变更记录留全文，7 天内 `/loops restore` |
| 跑人写的命令 | 命令自己可能有副作用 | 只跑人在对话里同意过的命令（同意之前人看到命令原文与 `cautions`）；最少的环境变量；先问规则板 |
| harness 动作 | 动作自己的效果（建 goal、在门禁工作树里重置、写证据） | 只调交来它的那一行声明过的动作；不可逆的那几步与它们的守卫在那一行里（m7:§3.8.3 第 5 步的门禁工作树守卫）；循环板不做 git 写操作 |

## 12. 外部输入的校验

人的条目经 `loop_propose` 的 `body` 进来，插件的条目经 `contribute` 与 `loopDefaults` 进来（后两者另见 §3.2、§3.4）。一项的字段对两边用同一个校验函数 `validateEntry(definition, origin)`（`src/loops/model.ts`），`origin` 为 `person` 或 `plugin`，只在下表写明的几处不同。

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `title` | 是 | 1–60 个码点，不含换行，去首尾空白 | `invalid`，`title` |
| `why` | 插件的必填 | 1–150 个码点，不含换行 | `invalid`，`why` |
| `when.kind` 为 `once` | — | `at` 是带时区偏移的 ISO 8601，严格晚于现在，至多一年后 | `invalid`，`when.at` |
| `every` | — | 正整数秒；告诉主 Agent 600–31,536,000；跑命令与 harness 动作 300–31,536,000 | `invalid`，`when.seconds`，写下限与理由 |
| `daily`、`weekly` | — | `time` 为 `HH:MM`（00:00–23:59）；`timeZone` 经 `Intl.DateTimeFormat` 能构造（人的必写，插件的可空）；`weekdays` 为 1–7 的不重复整数，非空 | `invalid`，字段路径 |
| `cron` | — | 只配告诉主 Agent；恰好 5 个以空白分隔的字段，总长至多 100；其余由 DSH 校验，DSH 返回的 `invalid_rule` 信息原样给人 | `invalid`，`when.expression` |
| `event` | — | `events` 1–4 个，都在当前的事件表里；人的条目只能用 `personSelectable` 的；`filter` 的键与比法按事件声明（§3.1）；`params` 的键、类型与范围按声明，必填的不能缺；`loops.file-changed` 的 `path` 是存在的目录下的绝对路径，一个项目至多 20 个 | `invalid`，`when.events` 或 `when.filter.<键>`、`when.params.<键>` |
| `command` | — | 只给插件的 `self` 条目；`names` 1–8 个命令名，每个匹配 `^[a-z0-9-]{1,32}$` | 那一项丢掉 |
| `action.kind` | 是 | 人的只能是 `tell-main` 或 `run`；插件的不能是 `run` | `invalid`，`action.kind` |
| `action.text`（`tell-main`、`harness.tell`） | 是 | 1–2000 个码点；`{名字}` 只用声明过的字段，时间条目不能有 | `invalid`，`action.text` |
| `action.argv`（`run`） | 是 | 1–8 条命令，每条 1–32 项，每项 1–1000 个码点，不含换行与 NUL | `invalid`，`action.argv[i][j]` |
| `action.report` | 是 | 三者之一 | `invalid` |
| `action.note` | 否 | 至多 500 个码点 | `invalid` |
| `action.timeoutSeconds` | 否 | 5–1800 的整数 | `invalid` |
| `action.glmSpend` | 否 | `optional` 或 `necessary` | `invalid` |
| `limits` | 否 | `debounceSeconds` 0–3600，`maxPerHour` 1–60 | `invalid` |
| `quiet` | 否 | `from`、`to` 为 `HH:MM`，不相等；只配告诉主 Agent 的事件条目 | `invalid` |
| `loop_propose` 的其余字段 | — | `kind` 三者之一；`edit`、`delete` 的 `entry` 是这个项目里 `active` 的人的条目；`reason` 1–300 个码点；`replaces` 是 `open` 的提议 | `invalid`，字段路径；插件的 id 为 `forbidden` |
| `/loops` 的参数 | — | 子命令为 §7.2 的五个之一；`<名字或 id>` 1–60 个码点；`<id>` 匹配 `u-[0-9a-f]{8}` 或 `lp-[0-9a-f]{8}` | 一行中文用法说明，什么都不写 |
| `loop_note.text` | 是 | 1–500 个码点 | `invalid` |
| `emit` 的输入 | — | `event` 在表里；`cwd` 是绝对路径；`key` 1–200 个字符；`payload` 是对象，每个声明的字段类型对，没声明的字段丢掉；字符串字段至多 2000 个码点，`strings` 至多 200 项 | `ok: false`，`invalid` 或 `unknown-event`，`message` 写字段 |
| `HarnessResult` | — | `outcome` 三者之一；`reason` 1–300 个码点；`tell` 1–4000 个码点 | 当作 `failed`，`reason`「harness 动作返回的结果读不懂」 |
| `ListedRun` | — | `entry` 是当前的 `self` 条目；`outcome` 四者之一；数值有限、非负 | 丢掉，计数 |
| `details()` 的返回 | — | 字符串数组，至多 20 行，每行至多 160 个码点 | 多的截掉；不是数组时那一项写「<行> 没给出明细」 |
| 收件箱的一行 | — | 能解析为对象，`event` 在表里，载荷合声明 | 跳过，计数 |
| `checkCall` 的结果 | — | 按 rules:§9.4 的类型 | 当作放行，记 `rules-unavailable` |
| `heldForPeak`、`stateFor` 的返回 | — | 布尔；`PeakModeState` 或 `undefined` | 当作没有（不攒、不显示档位），行健康 info 一次 |
| 用量流水的行 | — | JSON 对象，`model` 为字符串 | 跳过，计数 |
| `quota()` 的返回 | — | `QuotaView`（m6:§5）；`login.state` 三者之一 | 这一拍不判，`loop-read` 记 `ok: false` |

## 13. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 人的条目只由人写（人直接写，或 harness 照人拍过、原话经 M3 核对的待决写） | 存储的 `apply`（`src/loops/store.ts`）；原话的核对在 M3 的 `record_human_answer` | 命令、工具与补写都经 `apply`，只在一处核对身份；原话只在 M3 一处核对 |
| 插件的条目不能被改、停、删 | 插件的条目不进存储；存储只收 `u-` 开头的 id | 没有可改的数据，也就改不了 |
| 插件的行为只在拥有它的那一行定义一次 | `contribute` 是交条目的唯一入口；循环行的代码不导入别的行的条目表（L2 静态检查：`src/loops/` 不导入 `src/execute/`、`src/operate/`、`src/env/`、`src/glm-llm/`） | 0.1 的两张表会走样（评审 F1） |
| 命令只能是人写的 | 校验：`run` 只收 `origin: 'person'`；执行器不接受别处来的命令 | 条目会在人的电脑上按时跑 |
| 页面不写 | `ui/src/loops/` 不调用 `commands.execute`（L2 静态检查） | `d-ui-look-not-operate` |
| 一个项目同一时刻只有一个进程跑循环板；账号一级的事整台机器只有一处判 | 运行锁、机器锁 | 两处同时投就会重复叫醒主 Agent、重复读额度 |
| 每次运行都有记录 | 执行器的 `recordRun` 内部函数：执行前写 `loop-fired`，结局写 `loop-done` | 一个函数，所有执行者都调它 |
| agent 不能经 DSH 工具改循环板的任务、不能冒充循环板建提醒 | guard 框架上的规则 `loops:schedule-tools` | 在执行边界拦，模型绕不过；对账的改回是兜底 |
| 给模型的文字不带载荷里的换行与控制字符、不带密钥形状的字串 | `escapeForPrompt` 与结果格式化函数 `formatRunResult` | 交给主 Agent 只有这两条路 |
| 循环板的消息不算人的话 | `createUserNotice` 带来源 `glm-hourness-loop`（§6.4） | DSH 把没写来源的消息当成人的授权（tool-goal:44–52） |
| 高峰停着时不叫醒停着的会话 | 投递函数（`deliver.ts`）问 `heldForPeak` | 事件消息都经它；DSH 的投递由那一步的提醒兜住 |
| 档位只由规则板判 | 循环行只经 `glmHournessRules`、`glmHournessPeakMode` 两个服务读（L2 静态检查） | 档位与「本次照常做」的判断只在规则板一处（评审 F6） |
| DSH 任务的内容以循环板为准 | 对账（`bind.ts`） | DSH 任务页能改，只能事后改回 |

## 14. 隐私

- 记什么：指标流水与运行记录只有 id、时刻、结局、退出码、用时与字节数，不记命令输出、消息正文与人的原话（`metrics`：只记数与引用）。
- 原话：人在对话里同意加的那句话存在条目的 `source.relay` 与图上的待决里，同图上别的转述。
- 命令输出：完整的在用户级目录的日志里（不在项目工作树、不进 git），保留 7 天或最近 50 份；给模型的至多 40 行，先遮住密钥形状的字串。页面只显示日志路径，点开由人自己打开文件。
- 环境：人写的命令拿不到 DSH 宿主的环境变量（§6.6），所以拿不到通道的凭证。
- 额度与登录：机器一级的文件只存窗口名、已用比例、重置时刻、登录状态与时刻，不存令牌、Key 与请求头（同 m6:§12）；读用量流水只取 `model` 与 `at`。
- 本仓库的条目里写了本机路径（`C:\Program Files\ZCode\...`），它们只在用户级目录里，不进仓库。
- 页面与 `view.json` 不包含 `held` 消息的正文以外的对话内容；`held` 正文是循环板与各行写的英文消息。

## 15. 可测性

- L2，纯函数：`trigger.ts` 的下一次时刻（每天、每周在 `Asia/Shanghai` 与一个有夏令时的时区里，缺的钟点跳过、重叠取较早；每隔；一次）；`validateEntry` 两种来源；`validateContribution`（名字空间、`hourness.` 的例外、占位、动作 id、个数）；`channelEntries` 对 M6 的四种 `when` 与两种 `runBy`；事件筛选（`paths` 的三种写法、`in`、`is`、`atLeast`）；去抖与合并；限次与攒着的事件；自己触发自己（异步上下文与命令的时间窗）；`report` 的三种；`escapeForPrompt`、`formatRunResult` 与脱敏；`quoteForPwsh`；指纹（§6.2）；`loops.peak-end` 的判断表（§6.9 第 4 条的每一行一例）；页面的视图模型（三组、来源一行、每种结局的说法、「每天大约叫醒 N 次」）与 `plainWordsIn`。
- L2，存储：用真实的临时目录（同 rules:§14）：清零的快照、截断的记录、中间坏一行与 `/loops ack`、锁残留、改名失败（注入的 `rename` 模拟 `EPERM`）、两个子进程同时追加收件箱（V7）。
- L2，与别的设计的接缝：临时目录里的真实图引擎与 M3 的 `record.ts`：`loop_propose` → `propose_to_human`（`attach`）→ `record_human_answer` 三种回话；第 5 步的补写。真实的 `checkCall`（规则板 R3）。M7 的 `entries.ts` 交给真实的 `contribute` 全部被接受（M7 的 E8 测试与本稿的契约测试各钉一次）。`loopDefaultsOf` 用 M6 的 `GLM_LOOP_DEFAULTS`。
- L2，假宿主（`tests/fake-rc3.ts`）补这些 rc.3 的信号：`schedule` 服务（`create`、`list`、`catalog`、`delete`、`update` 的形状、整键解码与 `schedule/changed`，以及「到点」时按 schedule:1576–1598 的样子往会话里投一条来源 `schedule` 的消息）；`sessionController.resolveAgent`；活 agent 的 `followup`、`steer`、`inject` 记下消息、目标与 `status`；`goals.get`；计价服务的 `peak`、`quota`、`loopDefaults`；规则服务的 `heldForPeak` 与高峰模式服务的 `stateFor`。用注入的时钟测去抖、限次、高峰攒着与高峰后投出、少做档的高峰结束、停机补跑。
- L3（`npm run probe` 新场景 `loops`）：真实宿主组合里 M7 的条目交进来；绑任务、到点投递到主 Agent 会话（平移时钟）；`schedule/changed` 的收到与否；冷会话的恢复；`/wish here` 后搬任务；`loops:schedule-tools` 拦三种调用；`hourness.handback` 到消息的 10 秒；命令项的跑与报；`ctx.inject` 对本包服务（V12）。
- L4（批次）：页面（三组、本项目加的、要改的那一行、首页一行、没有写入控件）、DSH 自动化任务页里看到「循环板 · 」的任务并在那里改一次看改回、归档主 Agent 会话时的提示、宿主强杀与正常退出、`appChanged`、真实的晨报在 08:30 出现在主 Agent 的窗口。

## 16. 实施分解

开工条件：本稿过独立评审，人读一页放行稿 `onepage.md` 后放行（`d-design-onepage`）。分支 `loops`，工作树 `.worktrees/loops`，从当时的 main 建。每步一个提交，文档与代码同一批。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰运行时的步另跑 `npm run probe`。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `loops`，`rows` 加 `{id: 'glm-hourness/loops', module: 'loops/index'}`；`packages/hourness/cordis.patch.yml` 里本行排在 `rules` 之后、`ui` 之前，`disabled: true`；`src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `loops`。

步的编号用 S，免得和验证的层级 L2、L3、L4 混在一起。

| 步 | 内容 | 依赖 | 验证 |
| --- | --- | --- | --- |
| S1 | `src/loops/model.ts`（类型与 `validateEntry`）、`service.ts`（契约与读取函数）、`trigger.ts`、`events.ts`（循环行自己的四个事件）、`registry.ts`（`contribute` 与 `validateContribution`）、`defaults.ts`（循环行自己的四项）、`channel.ts`（`channelEntries`） | 无；`channel.ts` 的类型来自 M6 Q1 的 `src/shared/channel-loop.ts`，没合入时这一个文件随 S7 | L2 |
| S2 | 存储 `store.ts`（锁、记录、快照、恢复）、`/loops` 命令、投影 `hournessLoops`、`view.json` | S1 | L2 |
| S3 | 运行锁与拍、收件箱与 `emit`、`handleEvent`、去抖与限次、`loops.host-restarted`、`loops.file-changed`、`loops.waiting-on-human`、`loops.peak-changed`；命令执行器 `command.ts`（规则板 R6 先合入就用它的）；问规则板；harness 执行器 `harness.ts`；记录与 `runs.jsonl`；服务在 `ctx.inject(['sessionController'])` 里提供 | S2；规则板 R3（`checkCall`）合入，否则「问规则板」按 `rules-unavailable` 走，规则板合入的那一步补上；M6 Q1 或规则板 R4（`nextPeakChange`）合入，否则 `loops.peak-changed` 只靠每一拍比一次（至多晚 60 秒） | L2、L3 |
| S4 | `bind.ts`（建、搬、改回、孤儿、归档）、`deliver.ts`（唤醒表、`held`、高峰攒着）、`agent/pre-step` 的那一行与走步记录、`loops:schedule-tools`、`peak.ts`（`loops.peak-end`） | S3；M3 的 `mainAgentOf` 合入；规则板的 `RulesService.heldForPeak` 与 `glmHournessPeakMode`（规则板 R4）合入，否则高峰攒着与第 14 项按「读不出档位」走 | L2、L3 |
| S5 | `loop_show`、`loop_propose`、`loop_note`；`attachable`、`acceptProposal`；对照与补写 | S4；M3 第 6 步（`propose_to_human`、`record_human_answer` 的 `question` 一种）与 M3 的 `attach` 分派（§17）合入 | L2（真实图引擎与 `record.ts`）、L3 |
| S6 | 页面 `ui/src/loops/`、板块登记表的一项、首页一行；`pluginLabel` | S2；plain-ui 第 6 步（板块登记表）合入，之前是项目图页签里的一个视图，合入时移到第 2 层（同 rules:§9.1 的最小版） | L2（视图模型、静态检查）、L4 |
| S7 | 机器一级的运行者：锁、`last-step.json`、读用量流水、`channel.quota-low`、`channel.login-rejected`、`told.json`、`loop-read` | S4；M6 Q1（契约）与 Q2（额度读取与登录状态）合入；之前 GLM 包交来的两项列出但灰显「GLM 通道包还没有额度读取」 | L2、L3 |
| S8 | 各行改成交条目：M7 的 `entries.ts` 照 §3.1 的形状交、照 §4.2 声明事件、`run` 接 `runAction`；M4 的 env 行与图行各交一项；`hourness.outside-advance`、`execute.resume-after-peak`（§17） | 各自合入之后，由各自的步带上；循环板这一侧只有契约测试 | 各自的 L2、L3 |

批次 L4（`docs/DEVELOPMENT.md` §1.1）：S4、S6 合入后一批。本行通过 L3 与第一批 L4 之后才改为默认启用（`AGENTS.md` 强制流程第 4 条）。启用之前，M7 照它的退路自己执行事件条目，时间条目（晨报、周报、巡检）不会到点，晨报仍是人发 `/hourness` 或在对话里让主 Agent 出。

## 17. 对其他设计的影响（各自下一稿改，本稿不动它们的文件）

- M7 0.3（m7:§2.5 写明「名字以循环板设计为准，M7 只改 entries.ts」；下面前三条在 `entries.ts` 里，后四条在执行行的别处，都是小改）：
  1. `src/execute/entries.ts`、`src/operate/entries.ts` 的每条照 `LoopEntryDefinition`（§2.1）写，两行各自经 `ctx.inject([LOOPS_SERVICE], …)` 调 `contribute({plugin: 'dsh-hourness', row}, {events, entries, actions, run})`（§3.1）；`run` 就是 `glmHournessExecute.runAction`，返回 `HarnessResult`；`limits` 照 §5.1 的表。服务不在时的退路执行者不变。
  2. 事件照 §4.2 的表声明字段；提醒文字的占位改成 `{名字}`，只用声明过的字段；`hourness.handback` 的载荷加 `commits`、`floorHit`，`hourness.trunk-advanced` 加 `files`、`truncated`。
  3. 事件经 `emit({event, cwd, session, key, payload})` 交，`key` 用退路执行者已有的去重键。
  4. 新事件 `hourness.outside-advance`：在 `advances.jsonl` 记 `{by: 'outside'}` 时交，载荷 `{from, to, files, truncated}`；`execute.trunk` 同时听它与 `hourness.trunk-advanced`（m7:§3.8.4 末两段）。人在终端里直接推进的主干由此也跑一遍完整检查，0.1 用每 30 秒查 git 想接住的就是这一种。
  5. `execute.trunk-check` 的跳过规则（建议，§5.1）：在同一个 `normDigest` 下，与新主干的树相同或只差 `only` 路径的那些提交已有的通过记录合起来覆盖了每一条 `$` 与 `when` 命令时跳过，否则只跑没覆盖到的那几条。不采用时循环板不用改。
  6. 新 harness 动作 `execute.resume-after-peak`：主 Agent 的 goal 为 `blocked`、原因码为 `hourness-idle-rounds`、阻塞发生在事件给的那一段高峰之内时 `goals.resume`，幂等；返回 `done` 或带原因的 `skipped`（§6.9 第 4 条）。模型自己恢复不了被阻塞的 goal（tool-goal:348–349），所以由 harness 做。
  7. 0.1 对 M7 0.2 的请求（`withGateLock` 给循环板用、M7 删掉三条定时提醒、`emitLoopEvent`）作废：M7 0.3 已经把这几件写成交给循环板的条目与事件，主干全量检查留在 M7。
- M6 0.3：契约不用改，循环板照 `loopDefaultsOf` 读、照 §3.4 落实 M6-L1 到 M6-L5。两处请 M6 知道：M6-L1 要的那一行「GLM 通道包未装，或它的 glm-login 行未启用」不显示（plain-ui §2：只装编排层包时面板上不出现模型名），M6 下一稿把这半句删去或改为「不显示」；M6-R5（少做档的高峰结束时叫醒闲着的主 Agent）由循环板的 `loops.peak-end` 做（§6.9 第 4 条），M6 §18 的那一行可以写「循环板接了」。`nextPeakChange` 由 M6 Q1 或规则板 R4 先合入的一方加进 `src/shared/pricing.ts`（循环板 S3 的依赖，§16）。
- 规则板 0.6：
  1. 加一个成员 `peakStop(sessionId): {stopped: boolean, until?: string}`（`RulesService` 或 `PeakModeService` 上都行），在一处按档位、此刻是不是高峰、会话走不走 GLM 与「这个会话本次高峰照常做」判断，对不在本宿主上的会话按它的项目判；循环板改问它，补上 §6.9 第 2 条的空当（评审 F6 的改法）。在它之前循环板用 `heldForPeak`。
  2. `stateFor` 对冷的会话返回 `undefined`；加 `stateForProject(cwd)`，或让第 1 条的成员也带回档位，循环板显示档位与 `loops.peak-end` 判档位时用它。
  3. `DetectorTrigger` 的文件一种改为 `{kind: 'event', events: ['loops.file-changed'], params: {path}}`（§2.2 末条）。
  4. 代码规则目录里 `loops:schedule-tools` 一行的说明加一句「也拒绝以 Loop board: 开头的 schedule_create」（§6.2）。
  5. 两块板的「<插件名>带来的」用同一个函数 `pluginLabel(包名)`（`src/shared/plugin-labels.ts`，谁先实现谁建）。
  6. 规则板对 M6-R5 的「不采用」照旧成立：叫醒由循环板做，规则板不用改它的高峰一行。
  7. 命令执行与 rules:§5.3 共用 `src/loops/command.ts`（谁先合入谁建，不变）；循环板调 `checkCall` 时不带主体（§6.9 第 1 条），rules:§9.4 不用改。
- M3 附录 0.3：
  1. `propose_to_human` 的 `attach` 按前缀分派：`rules:` 走规则服务的 `attachable` 与 `proposalLine`（规则板 0.6 已请），`loops:` 走循环板服务的 `attachable` 与 `loopProposalLine`（§3.1）。两种形状相同，M3 写成一张两行的表即可。
  2. `record_human_answer` 在 `decide` 成功之后，正文末行用 `proposalIdOf` 与 `loopProposalIdOf` 各认一次，认出哪一种就调哪一个服务的 `acceptProposal`，把它那一行放进结果（§7.1 的表）。挂在 `src/design/record.ts` 一处，规则板挂的也是这里。
  3. 0.1 请 M3 在放行之后报 `design-released`，作废：M7 0.3 自己在主 Agent 的一步里认出放行并交 `hourness.design-released`。
  4. `mainAgentOf` 给循环板用（已导出，不变）。
- M4 0.3：
  1. env 行交一项 `env.checks-after-edit`（§5.3），带 `ownRules`（一步至多等 20 秒、每个检查 60 秒超时、连续失败 3 次后这个会话不再跑、没有检查器覆盖的语言每个会话提醒一次）与 `details`（每个批过的检查器一行），声明 `env.files-edited`（`listedOnly`）；每跑完一次检查调 `recordRun`（结局 `ran` 或 `reported`，`exits` 为各检查行的退出码）。
  2. 图行里 R1 的那一部分交一项 `graph.third-rework`，声明 `graph.third-reopen`（`listedOnly`）；每提一次第三次返工的待决调 `recordRun`。
  3. 0.1 请 M4 在第三次修复之前改报 `work-stopped`、给人的话由循环板经主 Agent 说，作废：M4 0.3 已由 `graph_status` 的结果让主 Agent 在对话里问人，那是它自己的机制，循环板只列出。
- plain-ui 0.6：本稿照 §4.7 的约定改了页面（只看、名字「循环板」、页头一句、三组的次序、来源一行、要改的那一句），`/loops-apply` 删去，plain-ui §4.7 那半句「`/loops-apply` 没有面板这个调用方」随之可以删；上手页第 5 块的字句归 plain-ui，循环板不再给（0.1 §7.3 给的那一句作废），`guideLine` 为 `null`；`homeLine` 的几种说法见 §8.3；`pluginLabel` 同规则板第 5 条。
- metrics：§6.10 的七类事件是循环板这边的输入清单（比 0.1 多 `loop-read` 与 `loop-contribution`）；字段的通用部分由那份设计定，定了之后循环板只改 `src/loops/metrics.ts`。
- `docs/ORCHESTRATION.md`：编排层的运维一节（晨报、巡检）改写为「循环板的默认条目，由 M7 交」，并加循环板一节（概念、登记表、事件表、两块板的分界、去向表）；`docs/DESIGN.md` §2.2 行表加 `glm-hourness/loops`，§2.4a 接口对照表加 §10.1 的新用接口，§7 降级表加一行。这些随 S2、S4 的提交改。

## 18. 替人定的方向与要问人的

替人定的（agent 定、人可推翻，写进一页放行稿）：

1. 到点跑命令（以及 harness 动作）的条目用循环板自己的钟，不用 DSH 的定时服务（§6.2）：DSH 的投递每次都叫醒主 Agent，命令过了也会在人的对话窗口里留一回合。代价：这两类条目不支持 cron。
2. 插件的条目由各行当数据交给循环板；必须在别处当场做的（检查器、高峰的收放、GLM 的提醒与看状态读额度）循环板只列出与记录，执行留在原来那一行（§2.3）。同一件事只有一处在做。
3. 人在对话里加条目，经 `propose_to_human` 交给人、人同意后带原话记下（§7.1），与规则板同一条路；人的命令只有删、恢复、确认与没有图时的同意（§7.2），新建不做成命令。
4. 在 DSH 自带的任务页里改循环板的任务不算数，循环板改回并写一行说明（§6.2）。
5. 账号一级的 GLM 提醒（额度快用完、登录失效）只告诉最近一次干过活的那个主 Agent，一次（§6.4）。
6. 少做档的高峰结束时，主 Agent 闲着、这段高峰里干过活、又不是在等你，就叫醒它一次接上挪开的活；它的 goal 若因高峰里没活干被挡住，由系统恢复（§6.9 第 4 条，要 M7 加一个动作）。
7. 不做档下，循环板只在规则板说这个会话停着时才攒消息；所以每段高峰每个会话至多多花一步，直到规则板加上 `peakStop`（§6.9 第 2 条）。
8. 次数超了的事件不丢，合进下一次（§6.7）；「自己触发自己」只算循环板自己做的事直接引起的，经过主 Agent 一回合的不算，靠限次兜住。
9. 插件条目的去抖与上限：5 秒、每小时 30 次；人的：30 秒、每小时 6 次。「等你太久」的门槛 24 小时，22:00–08:00 不说。告诉主 Agent 的条目最短 10 分钟一次，跑命令的最短 5 分钟一次。
10. 晨报 08:30、周报周一 09:00、夜间巡检 02:30 沿用 M7 的默认时刻；默认条目暂时只能看，所以这三个时刻暂时改不了。人想在别的时间多看一次，可以自己加一项「告诉主 Agent 出晨报」。
11. 建议 M7 的主干全量检查只跑这个提交还没跑过的那几条（§5.1）；这是给 M7 的建议，M7 定。

要问人的：没有。上面几条都能随时改回，不涉及目标、验收、不做的事或花钱的方向（`docs/ORCHESTRATION.md` §2.9.1）。最可能不对的是第 6 条：人若觉得「高峰结束时叫醒一次」也是打扰，就改成不叫，代价是挪到高峰之后的活要等人下一次说话才开始。

## 19. 第 1 轮评审意见的处理

| # | 级别 | 意见 | 处理 | 在哪 |
| --- | --- | --- | --- | --- |
| F1 | HIGH | M7 的接缝与 M7 0.3 不符：两张代码表、漏了「审查过了之后」「活都关了之后」、没有 harness 动作、事件名与载荷不同、轮询 git、跳过规则几乎不成立、提醒文字不同 | 改。循环板改为登记表：M7 经 `contribute` 交条目、事件与 harness 动作，`emit` 交事件（§3.1）；动作加 `harness` 一种（§2.3），经交来那一份的 `run` 执行（§6.5）；事件表取 M7 的八个原名与载荷，加循环行自己的、通道的与 M4 的（§4），并请 M7 加 `hourness.outside-advance`；条目是 M7 的 10 项加循环行的 4 项、M4 的 2 项、GLM 的 4 项（§5），「审查过了之后」「活都关了之后」在内；删掉 git 轮询（§4.1）；主干全量检查整个交回 M7，跳过规则改为给 M7 的建议（§5.1）；提醒文字以 M7 的为准；§17 的 M7 一行按 0.3 重写。评审 (b) 说的 `then` 写成 `harness.tell`，结果里也可以带 `tell`（M7 的「没过时才提醒」需要） | §2.3、§3、§4、§5.1、§6.5、§17 |
| F2 | HIGH | GLM 的接缝与 M6 0.3 不符：另开服务、三项对四项、读额度的时机、登录的判据、账号一级的投递 | 改。删掉 `glmHournessChannelLoop` 与 `subscribe`，照 `loopDefaultsOf` 读，换法在 `channelEntries` 一个函数里（§3.4）；四项都列出，GLM 包自己执行的两项写明；额度在 GLM 有新用量、满 15 分钟时读（M6-L2）；登录状态每一拍用 `quota({read: false})` 看（M6-L3）；账号一级的事由机器一级的运行者判、只交给最近走过步的主 Agent 一次，已说记录在机器一级（M6-L4，§6.1、§6.4）；`loop-read` 留痕（M6-L5）；高峰的两项挂在 `dsh-hourness` 下，来源一句照 M6；0.1 §1.5 的「只在有人看时读」一条删去；§17 的 M6 一行按 0.3 重写。一处没照 M6-L1 的原话：没有计价服务时不写「GLM 通道包未装」那一行，因为 plain-ui 定了只装编排层包时面板上不出现模型名，已告诉 M6 | §1.5、§3.4、§4.3、§5.4、§6.1、§6.4、§17 |
| F3 | HIGH | 页面有新建、改、删、恢复、「知道了」，违反面板只看；分组、名字、页头、来源一行与 plain-ui 不同 | 改。页面只看，没有任何写入控件，`/loops-apply` 删去（§8.2、§7.2）；人能改的地方写一句「要改：跟主 Agent 说……，或在输入框打 /loops ……」；人的命令 `/loops delete`、`restore`、`ack`，新建只在对话里；分组照 plain-ui（碰到某件事就做的、到点做的、本项目加的），名字「循环板」，页头「循环板 · 到点了或碰到某件事，就去做一件事」，来源一行「<插件名>带来的 · 只能看」；§2.4 第 11 行不再提三个单选；验收第 1、18 条改写（静态检查同 plain-ui 验收第 7 条）；草图重画。没照评审的一处：评审说保留 `recordInput: false`；本稿的 `/loops` 是人敲的短命令，改用默认值记下参数，与 `/rules` 一致，参数里没有要藏的东西 | §2.4、§7.2、§8、`mockup-loops.svg` |
| F4 | HIGH | 对话里加条目用带选项的待决，绕过 `propose_to_human` 与 `record_human_answer`；默认条目让主 Agent 自己拼四行 | 改。`loop_propose` 只校验并记一条 `open` 的提议，不写图（§7.1 第 1 步）；主 Agent 用 `propose_to_human`（`attach: 'loops:<id>'`）提提议式待决，正文末行是提议 id；`record_human_answer` 返回 `decided` 之后 M3 调 `acceptProposal`，钩子在 `src/design/record.ts`（第 3、4 步），不挂 `graph_decide` 与 `/graph-apply`；删掉 `plan` 字段、四行的自带校验与 `loopProposalQuestion`；S5 依赖 M3 第 6 步；默认条目的文字都改为 `propose_to_human`（M7 0.3 已改，§5.2 照写）；验收第 17 条改写。另外照规则板 0.6 补了图上的对照与补写（第 5 步），两块板同一条路 | §5.2、§7.1、§16、§17 |
| F5 | MEDIUM | 少做档的高峰结束时没有叫醒闲着的主 Agent（M6-R5） | 改。`loops.peak-end` 由循环行执行，少做档下主 Agent 闲着、这段高峰里走过步、goal 不是在等人或被人暂停时投一条 `followup`（§6.9 第 4 条），验收第 15 条（L2，注入的时钟）。评审给的文字里「resume the goal if it was blocked for idle rounds」模型做不到（`update_goal resume` 要人直接说的话，tool-goal:348–349），改为请 M7 加 harness 动作 `execute.resume-after-peak`，没有它时文字叫主 Agent 跟人说一句。加了两条评审没写的条件（高峰里没走过步、在等人时不叫），用来接住规则板 0.6 不采用 M6-R5 的两个理由 | §5.2、§6.9、§17 |
| F6 | MEDIUM | 不做档的判断读不到档位，也没看「这个会话本次高峰照常做」 | 改。循环板只问规则板：攒不攒看 `heldForPeak`（它已含「本次照常做」），档位的显示看 `glmHournessPeakMode.stateFor`；从不读规则板的文件（验收第 14 条的静态检查）；请规则板加 `peakStop`，补上「还没开单」与冷会话的空当（§17） | §6.9 第 2、3 条，§13，§17 |
| F7 | MEDIUM | `schedule.update` 的 `expected` 用 catalog 的一行，整键解码一律 `invalid_rule`；比较不用 DSH 的规范化形式会每拍都判为改过 | 改。`expected` 取 `schedule.list({sessionId})` 里那一条；比较用 DSH 返回的记录算的指纹，不自己规范化；`updated: true` 以外的码一律删掉重建，`updated: false` 不带码的算没变；假宿主照整键解码做（验收第 6 条） | §6.2 第 3 条，§10.1 |
| F8 | MEDIUM | 交回之后 10 秒的验收与默认 30 秒的去抖矛盾 | 改。§5.1、§5.2 的表给每个事件条目写 `limits`；插件的事件条目缺省 5 秒，人的 30 秒；投递的合并从 5 秒减到 2 秒；验收第 7 条的 10 秒在同一进程里成立，L2 钉住 | §5.1、§5.2、§6.4、§6.7 |
| F9 | NIT | 依据的版本过时；`nextPeakChange` 还不在 main | 改。依据按 M7 0.3、M6 0.3、规则板 0.6、plain-ui 0.6、M3 附录 0.3、M4 0.3 写，main 取 `436fbe7`；S3 的依赖加「M6 Q1 或规则板 R4」 | 文首、§4.1、§16 |
| F10 | NIT | `checkCall` 的 `glmSpend: 'none'` 不合法；命令原文怎样写没定；带主体的规则不会命中 | 改。没写 `glmSpend` 时不带；`run` 的 `glmSpend` 只收两种；命令原文 `argv.map(quoteForPwsh).join(' ')`；写明只有不带主体的规则与自报那两条管得到循环板的命令，页面也写 | §2.3、§6.6、§6.9 第 1 条，§8.2 |
| F11 | NIT | `emitLoopEvent` 没有 `agents` 却要读 `currentInitiator` | 改，换了做法。没有库函数了，各行经服务的 `emit` 交；因果改用循环板自己的异步上下文（harness 动作执行期间交来的事件带运行号），不再读 `currentInitiator`；也因此删掉了 0.1 会挡住正常修复的那半条（经过主 Agent 一回合的链） | §3.1、§6.3、§6.7 |
| F12 | NIT | 主 Agent 的会话挂着循环板的任务时不能直接归档 | 改。§6.2 写明归档的行为与之后怎样重建，页头加一行说明 | §6.2、§8.2 |
| F13 | NIT | 孤儿在已有绑定时也被认下；主 Agent 能建冒充的提醒 | 改。只在这一项没有活的绑定时认，否则删；`loops:schedule-tools` 也拒绝以 `Loop board: ` 开头的 `schedule_create` | §6.2 |
| F14 | NIT | 第 4 项的页面说法与草图有「门禁」 | 改。说法改为「在专门做检查的那份检出里跑一遍合入前的检查」，换词表加「门禁工作树 → 专门做检查的那份检出」，草图重画 | §5.1、§8.5 |
| F15 | NIT | 运行中的主 Agent 用 `inject` 可能滞留 | 改。要叫醒的条目在 agent 运行时用 `steer`，唤醒表与规则板一致；加 V11 | §6.4 第 3 条，§10.2 |
| F16 | NIT | M4 检查器写死的几个数没有显示 | 改。M4 的条目带 `ownRules`，页面展开写「检查器自己的规矩」；`LoopEntryDefinition` 加这个字段，`Contribution` 加 `details` | §2.1、§3.1、§5.3 |
| F17 | NIT | 验收说 `main-advanced` 恰好一次，两项都听它 | 随 F1 消掉：`main-advanced` 删了，主干前进的事件由 M7 交；停机期间的事件改为「各行交进收件箱的起来后照常处理」（验收第 16 条） | §1.4 |
| F18 | NIT | 行号：`sessionController` 名字在 2951；`tools.register` 在 2964–2979 | 部分改。复核原文：2951 是构造函数，服务名在 2952 的 `super(ctx, "sessionController", …)`，本稿写 2951–2952；`register` 的文档注释在 2968–2973、方法从 2974 起，2964 是别处的一条 `throw`，本稿写 2968–2981 | §10.1 |

评审「未核实」里的几项：`dsh-client-ui-schedule` 只在时区不同时写时区的说法，本稿在 §2.2 标为〔未核实〕；其余的 V1–V11 照旧列在 §10.2，新加 V11–V13。

## 20. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-30 | 第一稿 |
| 0.2 | 2026-10-30 | 回应第 1 轮评审（HIGH 4、MEDIUM 4、NIT 10，§19）：插件的条目与事件经 `glmHournessLoops.contribute`、`emit` 交，M7 的 10 项、M4 的 2 项、GLM 的 4 项与循环行自己的 4 项；动作加 `harness` 与 `self`，删掉 `checks`、`peak-mode` 与 `norm` 命令来源；GLM 照 M6 0.3 的 `loopDefaults` 读，落实 M6-L1 到 M6-L5，加机器一级的运行者；页面只看，`/loops-apply` 删去，人的命令 `/loops delete|restore|ack|accept|reject`；对话里加条目走 `propose_to_human` 与 `record_human_answer`；高峰不做只看 `heldForPeak`，少做档的高峰结束时叫醒闲着的主 Agent；`schedule.update` 的 `expected` 取 `schedule.list`，比较用 DSH 的指纹；去抖与限次分插件与人，超了的合进下一次；「自己触发自己」只算循环板自己的执行；删掉 git 轮询与 `main-advanced`。草图重画（旧的留作 `mockup-loops-0.1.svg`）；新增一页放行稿 `onepage.md` 与 `graph-ops-v02.json` |

