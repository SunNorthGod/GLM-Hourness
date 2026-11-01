# 循环板设计（项目图节点 `schedules`）

版本：0.1（2026-10-30），第一稿，未经评审。

依据：项目图节点 `schedules` 的正文与全部批注（人的原话与编排方的记录）；`d-defaults-readonly`、`d-rules-visible`、`d-one-main-agent`、`d-chat-not-cards`、`d-design-onepage`、`d-peak-mode`、`d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-rules-human-only`、`d-ui-look-not-operate`、`d-plain-questions`、`metrics`；共用的人定清单 `.agents/tasks/design-context.md`（含 2026-10-30 的各节）；相邻设计：规则板 `.agents/tasks/rules/design.md` 0.5、M4 `.agents/tasks/m4/design.md` 0.3 §6、M7 `.agents/tasks/m7/design.md` 0.2（m7-6、m7-7、m7-8、§3.7、§3.8、§3.9.6）、plain-ui `.agents/tasks/plain-ui/design.md` 0.4（§6 P4、§7.6）、M3 附录 `.agents/tasks/m3/design-addendum.md` 0.3（§2.4 主 Agent 的持有者记录）、M6 `.agents/tasks/m6/design.md` 0.2（§4、§5 `nextPeakChange`）；`docs/DESIGN.md` §2.4a、§6；DSH 运行时 `reference/dsh-desktop-0.2.1-rc.3/`（`dsh-schedule`、`dsh-tool-schedule`、`dsh-client-ui-schedule`、`dsh-agent`、`dsh-agent-loop`、`dsh-api-session-controller`、`dsh-session`、`dsh-tools`、`dsh-commands`、`dsh-session-projection`）；本仓库 main `4e26f79` 的 `src/`。

证据写法：沿用 `docs/DESIGN.md` §2.4a。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，其他文件写出文件名。〔实读〕读过源码或包文档；〔推断〕由源码推出、没有运行；〔未核实〕列进 §9.2 的核实项，随 L3 或 L4 核对。

范围：只有设计。不改代码、已跟踪文件、`docs/graph/`、`~/.dsh`；要写进项目图的事项写在同目录的 `graph-ops-written.json`，由编排方写入。

依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）：作业调度的常规做法（cron 与 systemd timer 的「错过的只补一次」、去抖与限次、同一项不重叠运行）；事件驱动系统里的至少一次投递与幂等记录（每次运行一个运行号，重复投递看得出来）；可靠性工程（锁、超时、退避、只追加的记录、崩溃后从持久的事实重建）；安全工程（命令只由人写、最少的环境变量、给模型的输出先脱敏）；人机交互与认知负荷（页面只说人话，插件带来的条目只给看，按钮只出现在人自己的条目上）；`docs/CHARTER.md` §7.1 条款 7（失败要出声）与条款 11（处处留痕）；`d-failure-plans`（按操作写发现、重试、恢复与留痕，不穷举）。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

- 循环板是编排层包 `dsh-hourness` 里的一块板，放「到点或碰到某件事就去做的事」。每一项由三样东西组成：什么时候（时间：一次、每隔、每天、每周、cron；或从代码里一张固定的事件表里选一个事件）、做什么（告诉主 Agent 一段话；跑命令，把结果交给主 Agent；跑检查，把结果交给改文件的那个 agent；按高峰模式收放）、谁带来的（编排层、GLM 插件，或人自己）。每跑一次都记进指标流水。
- 代码只提供机制：事件怎样发现、到点怎样投递、命令怎样跑、记录怎样写、谁能写。编排层与 GLM 插件原本要写死的联动，都是板上的默认条目，各自写明是哪个插件带来的；默认条目暂时只能看（`d-defaults-readonly`）。出厂默认：编排层 11 项（晨报、周报、夜间巡检、合进主干之后跑完整检查、设计放行之后开始推进、交回之后派审查、停下来报告、重启之后接上停了的活、依赖变了查依赖、等人太久提醒、改完文件跑检查），GLM 插件 3 项（高峰开始与结束按档位收放、额度快用完提前说、登录过期提醒重登）。
- 人可以自己加、改、删自己的条目：在循环板页上填表（经 `/loops-apply`，身份是人），或在主 Agent 的对话里说，主 Agent 提一张图上的待决、人同意后带原话拍板（`d-chat-not-cards`，同规则板的提议路径）。agent 不能直接写条目，因为条目会在人的电脑上按时跑命令。
- 时间：凡是「到点告诉主 Agent」的条目都用 DSH 自带的定时服务 `dsh-schedule`，任务绑在主 Agent 的会话上，DSH 负责时区、夏令时、cron、重启后补一次与发送记录；主 Agent 换会话时循环板把任务搬过去。「到点跑命令」的条目由循环板自己的钟跑（每隔、每天、每周、一次，不支持 cron），因为 DSH 的投递每次都会叫醒主 Agent、在人唯一的对话窗口里留一回合，而命令通过时多半不该打扰任何人（§5.2）。
- 事件：11 个，写在代码里（§3）。来源四类：DSH 的钩子（`agent/pre-step` 与会话历史，改完文件跑检查用）；编排层各行写进项目收件箱的事件（设计放行、交回、停下）；循环行自己从持久的事实推出的事件（git 主干的头、宿主的启动记录、项目图里等人的待决、文件的大小与修改时间、通道插件的高峰时段）；通道插件经公共库的契约推来的事件（额度、登录）。从持久事实推出的事件，宿主停机期间发生的，起来后补发一次；收件箱里没处理的照常处理。
- 去抖、限次与自己触发自己：同一项 30 秒内的事件合成一次；每项每小时至多 6 次（人的条目可设到 60）；一次运行引起的事件 10 分钟内又触发同一项时不跑，记一笔「自己触发自己」（§5.6）。
- 失败：投递失败按 1、5、15 分钟重试，之后记失败、报行健康；命令超时结束整棵进程树；没有主 Agent 时告诉主 Agent 的条目先存着，24 小时后作废；所有结局都进记录，页面上看得到（§10）。
- 与高峰模式和规则板：循环板跑的命令先经规则板的判定（`checkCall`），人设的规则同样管得到它们；高峰「不做」档下，循环板不在高峰里叫醒用 GLM 的主 Agent，攒到高峰结束再投；DSH 到点投来的提醒在高峰里只让主 Agent 回一行，高峰结束后循环板再投一次（§5.8）。
- 面板：第 2 层的一页，和规则板、经验板同在首页页脚（「规则 › 循环 › 经验 › 整张图 › 上手说明 ›」），在 plain-ui 的板块登记表里登记（§7）。
- 所有规矩都在明面上（`d-rules-visible`）：§2.4 列出今天写在各处的每一条规矩去哪块板；会挡住动作的门（合入前的检查、必须全审、停下标记、主 Agent 没有写文件的工具……）在规则板，到点或碰到事就去做的在循环板。
- 留在代码里的（§2.5）：各块板与项目图的机制、安全底线、GLM 通道里必须和 ZCode 一字不差的部分，以及循环板自己的限次与防循环。
- 要问人的：没有必须问人的事。替人定的方向列在 §17，放进一页放行稿。

## 1. 需求

### 1.1 来源

人的原话（取自项目图节点 `schedules` 与相关决定的转述）：

- 「新增一个循环任务或者定时任务面板如何？我们那些美化工作放成默认的，用户也可以自定义一些任务比如服务器巡查啊之类的，和钩子系统联动起来」
- 「定时任务差不多就那些，还有我忘记说的能联动的吗」
- 「我指的是，合进主干之后：跑一遍完整检查这种类似的我们编排层的东西，而且也没说咱们这个项目具体的东西。你重新讲」
- 「我指的是，你现在编排层自带的是写死进代码里的是吗？我想让你把这些和GLM插件自带的功能做到这个面板的默认功能里去，而不是写死进代码里。能理解吗」
- 「那现在就有一个规则板，一个循环板了是吧？我们几乎没有写死在代码里的逻辑了是吗，都抽象出来了？以及默认的东西先暂时不能修改、开关，只能看」（`d-defaults-readonly`）
- 「档位当然能选。」（高峰模式的档位不算改默认条目）
- 「没问题，项目所有规则确实应该都在明面上」（`d-rules-visible`：合入前的检查清单与必须全审清单是门，放规则板；改完文件就跑的检查器做成循环板的条目）
- 「巡检应该由harness提醒主Agent发出。一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」（`d-one-main-agent`）

编排方记下、人没有反对的事实与提议：DSH 已经带定时服务 `dsh-schedule` 与任务页，时间触发用它，本模块补事件触发与面板；默认三层（编排层、GLM 插件、本项目自己的）；本项目自己的几项不进产品，是人自己加条目的例子。

### 1.2 功能需求

- F1 条目模型：每一项写明什么时候、做什么、交给谁、谁带来的、为什么有它；上次与下次；最近一次的结论。
- F2 时间触发：一次、每隔、每天、每周、cron，按人看得懂的时区。
- F3 事件触发：从代码里一张固定的事件表里选；每个事件写明来源与能用的筛选。
- F4 动作：告诉主 Agent 一段话；跑命令、结果交给主 Agent；跑检查、结果交给改文件的 agent；按高峰模式收放。
- F5 默认条目：编排层与 GLM 插件原本要写死的联动都以默认条目出现，写明来自哪个插件，只能看。
- F6 人的条目：人在页上或在主 Agent 的对话里加、改、删自己的条目；在对话里加的有一次记在图上的决定。
- F7 一个主 Agent：报告与巡检是条目，动作是提醒主 Agent，不另开会话。
- F8 记录：每次运行的触发、结局、用时、退出码进指标流水；结论由主 Agent 记成这一项的批注。
- F9 漏跑与重启：宿主停机期间错过的时间点、发生的事件，起来后各补一次。
- F10 防循环：去抖、限次、自己触发自己时不跑。
- F11 与高峰模式、规则板并存：命令经规则板判定；高峰不做时不在高峰叫醒 GLM 主 Agent。
- F12 面板：第 2 层的一页，人话；首页在有事要人看时多一行。
- F13 明面上：今天写在各处的规矩，逐条有去处（规则板或循环板）。

### 1.3 非功能需求

- 不打扰人（`question-27` B）：循环板自己不出问答卡、不向人提问；要人定的事都由主 Agent 在对话里按四行的方案说（`d-chat-not-cards`）。人只在自己加条目时动手。主 Agent 被叫醒说的话都在它的对话窗口里，次数看得见（页上每项写「每天大约叫醒主 Agent N 次」）。
- 失败要出声：任何一项停了、跑失败、被限次、被高峰攒着，页面与行健康都写出来。
- 激活期不抛错（`AGENTS.md`）：缺服务时降级并上报。
- 对所有模型生效：编排层的默认条目不依赖 GLM 包；GLM 的条目只在 GLM 包装上时出现。
- 不依赖反向代理；不改用户 profile。
- 同一个项目只有一处在跑循环板（一把锁），宿主崩溃后由下一次启动接上。

### 1.4 验收条件

下面每条写明在哪一层验证（L2 单测、L3 沙盒探针、L4 桌面版真机）。

1. 两个包都装、M3 与 M7 已合入、项目有主 Agent 时，循环板页列出「编排层带的」11 项与「GLM 插件带的」3 项（§4.1、§4.2），每项写名字、什么时候、做什么、交给谁、谁带来的、上次与下次；这 14 项上没有改、开关、删除的控件。L2（页面的视图模型）与 L4。
2. 只装编排层包时，页面没有「GLM 插件带的」一组，任何地方都不出现 GLM 的条目与事件筛选；编排层的 11 项照常。L2。
3. 主 Agent 第一次出现（`/wish` 成功）之后 60 秒内，`schedule.catalog()` 里恰好有三条循环板的任务绑在主 Agent 的会话上：「循环板 · 晨报」每天 08:30、「循环板 · 周报」每周一 09:00、「循环板 · 夜间巡检」每天 02:30，时区为宿主的系统时区。L3。
4. 主 Agent 移到另一个会话（`/wish here`）之后 60 秒内，这三条只绑在新会话上，旧会话上没有循环板的任务。L3。
5. 有人经 DSH 自带的任务页删掉或改掉一条默认条目的任务时，60 秒内循环板按自己的定义恢复它，记一笔「已恢复」，页面写一行说明；主 Agent 调 `schedule_delete` 或 `schedule_update` 改循环板的任务时被拒，拒绝文字写明「去循环板」。L3。
6. 一条 `task-handed-back` 事件（种类为实现、结局为完成）写进项目收件箱之后 10 秒内，主 Agent 收到一条消息，里面有任务 id 与「派审查」；指标流水里有这次运行的 `loop-fired` 与结局为 `delivered` 的 `loop-done`。L3。
7. 同一项 30 秒内来 10 个事件，只跑一次，消息里列出 10 个；同一项一小时里第 7 次触发不跑，记 `suppressed`（原因 `rate`），页面写出。L2。
8. 一次运行引起的事件在 10 分钟内又触发同一项时不跑，记 `suppressed`（原因 `self-loop`）。L2。
9. 人加一项「每 5 分钟跑 `node -e "process.exit(1)"`，没过时告诉主 Agent」（`report: 'on-failure'`）：每次运行主 Agent 收到一条带退出码 1 与输出末行的消息（结局 `reported`）；改成 `process.exit(0)` 之后，第一次运行给主 Agent 一条「又过了」（`reported`），之后不再发，记录照写（结局 `ran`，退出码 0）。L2（假宿主）与 L3。
10. 命令输出里有密钥形状的字串时，给主 Agent 的消息里它被遮住（`[redacted]`）；指标流水里没有任何输出正文。L2。
11. 人设了一条规则板规则拦下某条命令时，循环板不跑这条命令，记 `blocked` 与规则 id；规则板判为排队时记 `deferred`，规则解除后 5 分钟内跑。L2（`checkCall` 与临时目录）。
12. 高峰模式为「不做」、主 Agent 走 GLM 时：高峰里来的事件类消息不投，记 `held`，高峰结束后 1 分钟内按先后合成一条投出；DSH 在高峰里投来的循环板提醒，同一步里主 Agent 收到一行英文说明「高峰不做，回一行即可」，高峰结束后循环板再投一次原来的内容。L2（注入的时钟与假的计价服务）与 L3（平移的时钟）。
13. 宿主停着时主干前进了 2 个提交：宿主起来后恰好有一次 `main-advanced` 运行，范围是停机前记下的头到现在的头；`host-restarted` 恰好触发一次，宿主被强杀时 `crashed` 为真，正常退出时为假。L3 与 L4。
14. 循环板自己的钟管的命令项在停机期间到了点：起来后补跑一次，记录标 `late`；漏了几个点都只补一次。L2。
15. 页上新建一项（`/loops-apply`）写入后出现在「你加的」一组，`source` 记人与时刻；字段不合时返回人话错误与字段名，什么都不写；默认条目的 id 写不进存储。L2。
16. 主 Agent 调 `loop_propose` 之后图上多一张决定者为人的待决；主 Agent 带人的原话拍板后，这一项生效，`source` 记原话与待决 id；不带原话的拍板不生效。L2（临时目录里的真实图引擎）。
17. §5.9 的每一种结局（`delivered`、`ran`、`reported`、`delegated`、`skipped`、`suppressed`、`deferred`、`blocked`、`held`、`failed`、`expired`）在 L2 里各有一个用例：每次运行恰好一条 `loop-fired`，最终恰好一条带最终结局的 `loop-done`；`deferred` 与 `held` 是中间状态，各写一条 `loop-done`，之后放行、投出或作废时再写一条最终的。L2。
18. `entries.json` 被清零或截断时，下一次读取按 `journal.jsonl` 重建，人的条目一项不少，页面写「存档坏了，已按变更记录重建」。L2。
19. 页面上全部固定字串经 `plainWordsIn`（M3 附录的 `src/graph/plain-question.ts`）检查为空。L2。
20. `/hourness-status` 有循环行一行；宿主没有 `schedule` 服务时这一行为部分生效，原因写「没有 DSH 定时服务：到点的条目不跑，事件条目照常」，事件条目照常跑。L2。
21. §2.4 的去向表里每一行，在 L4 走查时都能在它写的那块板上找到。L4。

### 1.5 不做

- 默认条目的修改、开关、删除（`d-defaults-readonly`；以后放开时要改的地方见 §6.5）。
- agent 直接写条目（agent 只能提议，§6.4）。
- 事件表以外的事件；事件表的扩充要改代码、经设计评审（§3.3 列了以后可加的几种）。
- 命令类条目用 cron（§5.2）。
- 在 headless 运行、探针与标定里跑条目（它们没有 Session controller，§5.1）。
- 每次运行新开一个会话（`d-one-main-agent`）。
- 后台定时读 GLM 额度（M6 定了只在有人看时读，§4.2 第 13 项）。
- 跨项目的条目、整机一份的条目（`question-32` C 的同一条线：条目按项目）。
- DSH 之外的通知（邮件、系统通知）。
- 把规则板的检测器搬到循环板（检测器只写信号，仍归规则板；两块板共用一套时间写法，§2.2）。

### 1.6 方向清单自查（`d-design-onepage`）

| 人定的方向 | 本设计怎样遵守 |
| --- | --- |
| 一个项目一个主 Agent，报告与巡检由 harness 提醒它做（`d-one-main-agent`） | 晨报、周报、巡检是条目，动作都是提醒主 Agent；不开运维会话（§4.1） |
| 设计放行后主 Agent 自己推进（`d-auto-drive`） | 「设计放行之后开始推进」是默认条目（§4.1 第 5 项） |
| 子 agent 的模型由主 Agent 选（`d-main-agent-models`） | 「交回之后派审查」的动作是提醒主 Agent 去派、自己选审查用的模型，harness 不替它派（§4.1 第 6 项） |
| git 交给主 Agent，harness 只守主干前进那一刻（`d-main-agent-shell`） | 循环板不做 git 写操作；「合进主干之后跑完整检查」只读主干、在 M7 的门禁工作树里跑（§4.1 第 4 项） |
| 问人改成聊天（`d-chat-not-cards`） | 停下来报告与提醒等人的事，都要主 Agent 用四行的方案说给人听；加条目在对话里说（§6.2） |
| 默认条目只能看，档位能选（`d-defaults-readonly`） | 默认条目不在存储里，页面不给控件；档位仍在规则板（§5.8） |
| 规则只由人定（`d-rules-human-only`） | 人的条目只由人写；agent 只提议（§6） |
| 项目所有规则在明面上（`d-rules-visible`） | §2.4 的去向表 |
| 面板只看不操作，界面说人话（`d-ui-look-not-operate`、`d-plain-questions`） | 页面以看为主；人能动手的只有自己的条目，与规则板的「设规则」同一类时刻（§7） |
| 高峰模式三档，默认少做（`d-peak-mode`） | 循环板不另设高峰逻辑，档位与执行归规则板；循环板只在「不做」档下不叫醒 GLM 主 Agent（§5.8） |
| 指标由 harness 写（`metrics`） | 每次运行的记录由循环行写，模型写的不算（§5.9） |

## 2. 概念

### 2.1 一项是什么

| 字段 | 必填 | 含义 | 取值 |
| --- | --- | --- | --- |
| `id` | 是 | 项目内唯一 | 默认条目 `hourness:<名>`、`glm:<名>`（代码里定）；人的条目 `u-<8 位十六进制>`（写入时分配） |
| `title` | 是 | 给人看的名字 | 1–40 个码点，不含换行 |
| `when` | 是 | 什么时候 | `Trigger`（§2.2） |
| `action` | 是 | 做什么 | `Action`（§2.3） |
| `source` | 是 | 谁带来的 | `{kind: 'plugin', plugin: 'dsh-hourness' \| 'dsh-glm-zcode'}` 或 `{kind: 'person', at, via: 'page' \| 'chat', relay?, question?}` |
| `why` | 否 | 为什么有它，一句人话 | 至多 150 个码点；默认条目都写 |
| `limits` | 否 | 去抖与限次 | `{debounceSeconds?: 5–3600（默认 30）, maxPerHour?: 1–60（默认 6）}`；默认条目的值写在代码里 |
| `rev` | 是 | 修订号 | 人的条目每写一次加一；默认条目取代码表的版本号 |

一项属于一个项目（`question-32` C）。项目键与规则板同一个函数（规则板 §7.3：从会话头的 `cwd` 往上找 `.git`，主检出与它的工作树是同一个项目）；M5 的 `src/data/project-root.ts` 先合入就用它，否则循环行与规则板谁先实现谁建这个模块。

### 2.2 什么时候

```ts
// src/loops/model.ts（纯类型与校验，不用 Node 内置模块；客户端也导入）
export type Trigger =
  | { readonly kind: 'once', readonly at: string }                         // ISO 8601，严格晚于写入时刻，至多一年后
  | { readonly kind: 'every', readonly seconds: number }                   // 告诉主 Agent 的至少 600；跑命令的至少 300
  | { readonly kind: 'daily', readonly time: string, readonly timeZone: string }                      // 'HH:MM'，IANA 时区
  | { readonly kind: 'weekly', readonly time: string, readonly timeZone: string, readonly weekdays: readonly number[] }  // ISO 星期 1–7
  | { readonly kind: 'cron', readonly expression: string, readonly timeZone: string }                 // 五字段 Vixie；只用于告诉主 Agent
  | { readonly kind: 'event', readonly event: LoopEventId, readonly filter?: EventFilter }            // §3
```

- 时间的五种与 `dsh-schedule` 的六种选择器一一对应（`after_seconds` 不用：「几秒之后」只适合一次性的提醒，条目都按绝对时刻存）：`once` → `at`，`every` → `every_seconds`，`daily` → `daily {time, time_zone}`，`weekly` → `weekly {time, time_zone, weekdays}`，`cron` → `cron {expression, time_zone}`（`dsh-schedule/README.zh.md`「使用此包」的表；`hasExactKeys` 多一个键少一个键都拒，M7 设计 §3.11.1 已核对 schedule:1052–1059、1118–1130）。存储里写 `timeZone`，发给 `dsh-schedule` 时写 `time_zone`；`time` 存 `HH:MM`，发送时补成 `HH:MM:00`。
- 时区默认取宿主的系统时区（`Intl.DateTimeFormat().resolvedOptions().timeZone`）；页面在时区与系统时区不同时才写出时区（同 DSH 任务页的做法，`dsh-client-ui-schedule/README.zh.md`「规则」一段）。
- 告诉主 Agent 的 `every` 至少 600 秒：每次投递都叫醒主 Agent、在人的对话窗口里留一回合（§5.2），10 分钟一次就是每天 144 回合。DSH 自己的下限是 60 秒（schedule:21），循环板更严。跑命令的 `every` 至少 300 秒，命令不叫醒任何人，下限只防把机器跑满。
- 一套写法两块板用：规则板检测器的触发（规则板 §5.2：`interval`、`schedule`、`file`）改为同一个 `Trigger` 的子集：`every`、`daily`、`weekly` 与事件 `file-changed`。时间的计算（下一次是什么时候、夏令时缺的钟点跳过、重叠的取较早那次）写在 `src/loops/trigger.ts` 一处，循环板的钟与规则板的检测器都调它（§16）。

### 2.3 做什么

```ts
export type Action =
  | { readonly kind: 'tell-main', readonly text: string, readonly wake: boolean }
  | { readonly kind: 'run', readonly commands: CommandSource, readonly report: 'always' | 'on-failure' | 'on-change', readonly note?: string, readonly where?: 'project' | 'gate-worktree', readonly timeoutSeconds?: number, readonly glmSpend?: 'none' | 'optional' | 'necessary' }
  | { readonly kind: 'checks' }        // 只用于事件 files-edited；命令来自项目图里人批过的 env 工具节点
  | { readonly kind: 'peak-mode' }     // 只用于事件 peak-changed；按人选的档位收放

export type CommandSource =
  | { readonly kind: 'argv', readonly argv: readonly (readonly string[])[] }            // 人写的命令，每条一个数组，不经 shell
  | { readonly kind: 'norm', readonly norm: 'norm-merge-gate', readonly lines: 'always' } // 项目图规范节点里人批过的 `$` 行
```

| 动作 | 给人看的说法 | 谁执行 | 结果给谁 |
| --- | --- | --- | --- |
| `tell-main` | 告诉主 Agent：<一句话> | 循环行（到点的经 `dsh-schedule` 投递，§5.2） | 主 Agent；`wake` 为假时等它下一步再看，不叫醒它 |
| `run` | 跑 <命令>，<每次 / 没过时 / 结果变了时> 告诉主 Agent | 循环行的命令执行器（§5.5） | 主 Agent |
| `checks` | 跑项目图里批过的检查，结果交给改文件的那个 agent | env 行（M4 §6，机制不变） | 改文件的 agent，在它下一步 |
| `peak-mode` | 按你选的高峰档位收放（规则板执行） | 规则板（规则板 §3.6、§6.3，机制不变） | 规则板的每步提醒与等待单 |

为什么是四种、每种只有一个执行者：人提的三种（告诉主 Agent、跑命令交给主 Agent、交给触发它的 agent）覆盖了 14 项默认条目里的 13 项，第三种就是第 11 项的 `checks`；剩下的第 12 项（高峰的两头）是规则板的门在高峰开始与结束时的样子（规则板 §3.6 的附属条目，条件 `glm-peak is true`），再在循环板上实现一遍就成了两套机制管同一件事。所以 `peak-mode` 与 `checks` 这两种动作，循环板只负责列出、记录与显示，执行仍在原来的那一行；页面写明「由规则板执行」「由检查器执行」。同一件事只有一处在做，两块板各显示它的一面（§2.4 第 11 行）。

`report` 的三种：`always` 每次都把结果交给主 Agent；`on-failure` 每次没过都交，没过之后第一次过了也交一次（让主 Agent 知道好了），其余不交；`on-change` 只在这次的过与不过和上一次不同时交（第一次运行算不同）。「过」指每条命令都退出 0、没有超时、跑得起来。`note` 是交结果时放在前面的一段话（至多 500 个码点），告诉主 Agent 拿结果做什么。

命令只由人写：`argv` 只有人能写进条目（§6）；`norm` 只引用图上人批过的规范节点（状态为已批准、进行中或完成），命令文本仍是人批过的那一份，循环板不复制。`run` 的命令不经 shell：`argv` 的第一项是程序，要 shell 的写成 `["pwsh", "-NoProfile", "-Command", "…"]`（同规则板 §5.3）；`norm` 的 `$` 行按 M7 的做法经 `shell: true` 运行（M7 §3.8.1：命令来自人批过的规范，Windows 上 `npm` 是 `.cmd`）。

### 2.4 所有规矩去哪块板（`d-rules-visible`）

两块板的分界：规则板管「一件事要发生时让不让做」，在执行边界当场拦下、排队或只告知；循环板管「一件事发生了或到点了就去做一件事」。门的内容仍可以存在项目图的规范与工具节点里，两块板负责显示。

| # | 今天写在哪 | 是什么 | 去哪 | 那里怎样显示 |
| --- | --- | --- | --- | --- |
| 1 | 规范节点 `norm-merge-gate` | 合入前的检查清单 | 规则板「合入前的检查」（门）；循环板第 4 项读它的命令跑合入后的完整检查 | 规则板列出每条命令的人话与原文（规则板下一稿加，§16） |
| 2 | 规范节点 `norm-review-floor` | 必须全审的改动 | 规则板「必须全审」（门） | 同上 |
| 3 | M4 的 env 工具节点（检查行） | 改完文件就跑的检查器 | 循环板第 11 项 | 每个工具节点一行，写检查命令与「来自你批准的工具节点」 |
| 4 | M7 m7-6、m7-7、m7-8 的三条定时提醒（`/patrol on` 已由 `d-one-main-agent` 作废） | 晨报、夜间巡检、周报 | 循环板第 1–3 项 | 时间、上次、下次 |
| 5 | M7 §3.7.1（交回后 harness 直接派审查） | 交回之后派审查 | 循环板第 6 项；按 `d-main-agent-models` 改为提醒主 Agent 去派 | — |
| 6 | M7 §3.7.3、§3.8.3 第 8 步，M4 §4.6 | 审查不收敛、检查连着失败、第三次返工时停下 | 停下标记（拒绝再派）是门，在规则板「写在代码里的规则」；向人报告是循环板第 7 项 | — |
| 7 | M7 §3.9.6（重启后对账） | 重启之后接上停了的活 | 对账写批注是机制，留在 M7；提醒主 Agent 去接是循环板第 8 项 | — |
| 8 | `d-auto-drive`（M7 §3.9 改写） | 设计放行之后开始推进 | 循环板第 5 项；建 DSH goal 是机制，留在 M7 | — |
| 9 | M7 巡检里的 `patrol $` 依赖检查 | 依赖或锁文件变了查依赖 | 循环板第 9 项（合入时）；夜间那次仍在巡检里 | — |
| 10 | 编排方的提议 | 有事等人太久提醒 | 循环板第 10 项 | — |
| 11 | GLM 包的高峰提醒（`glm-prompt`）与规则板的默认规则、高峰模式 | 高峰时告诉模型、按档位收放 | 告诉模型的那一行与档位在规则板（默认规则与三个单选）；开始与结束在循环板第 12 项（由规则板执行） | 循环板写「此刻是否高峰、档位、下一次变化」 |
| 12 | M6 的额度显示 | 额度快用完提前说 | 循环板第 13 项 | — |
| 13 | GLM 通道的登录失败提示 | 登录过期提醒重登 | 循环板第 14 项 | — |
| 14 | guard 的规则、图文件只经图工具、M3 的两条写入规则、M7 的合入核对、主 Agent 没有写文件的工具、危险 git 命令前存快照 | 安全底线 | 规则板「写在代码里的规则」（规则板 §9.1 已有这一组；M3 附录 §2.5 的快照、M7 的合入核对随它们合入加行） | 只读 |
| 15 | 循环板自己的门（新） | agent 不能经 `schedule_update`、`schedule_delete` 改循环板的任务（§5.2） | 规则板「写在代码里的规则」 | 只读 |
| 16 | 规则板的等待单唤醒 | 排队的调用在条件解除后叫回 agent | 规则板（「排队」的后半截，规则板 §6.3） | 规则板「在等的工作」 |
| 17 | 本仓库的 Kiro 钩子（会话开始时提醒 `reading-digest` 是否到期） | 每周读文章 | 自举（`dogfood`）开始后改为本仓库循环板「你加的」一项（§4.3）；之前照旧 | — |

### 2.5 仍在代码里的

- 机制：事件怎样发现（§3）、到点怎样投递（§5.2）、命令怎样跑（§5.5）、记录怎样写（§5.9）、谁能写条目（§6）；规则板与项目图本身的机制（谁能拍板、完成要证据、状态怎么变）。
- 默认条目的定义本身：两张代码里的表（编排层 `src/loops/defaults.ts`，GLM 包 `src/glm-llm/loop-defaults.ts`），在页面上原样显示。它们是数据，只是暂时放在代码里、不能改（`d-defaults-readonly`）。
- 安全底线：§2.4 第 14、15 行，显示在规则板上。
- GLM 通道里必须和 ZCode 一字不差的部分（请求头、签名、系统提示词原文），不是规矩，不上板。
- 循环板自己的护栏：限次、自己触发自己、命令的最少环境变量与超时、给模型的输出脱敏、一个项目一把运行锁。它们防的是循环板自己出毛病，页面在「循环板自己的规矩」一行里写出数字（§7.2）。

## 3. 事件表

### 3.1 事件

固定写在 `src/loops/events.ts`。「来源」一栏回答「这个事件从哪里来」：DSH 的钩子、编排层各行写进项目收件箱的事件（§5.3）、循环行自己从持久的事实推出，或通道插件经契约推来（§3.4）。

| id | 人话 | 来源 | 怎样发现 | 载荷 | 宿主停机期间发生的 |
| --- | --- | --- | --- | --- | --- |
| `main-advanced` | 主干前进了（合进主干之后） | 循环行看 git | 每 30 秒 `git -C <项目根> rev-parse --verify <基线>`（`execFile`，不经 shell，5 秒上限）；变了再取 `git rev-list --count <旧>..<新>` 与 `git diff --name-only <旧> <新>`。基线是主检出当前所在的分支（`git symbolic-ref --short HEAD`），分离头指针时不报这个事件 | `{base, from, to, commits, files: string[]（至多 200，多的写 truncated）, rewritten: boolean}`；`rewritten` 为真表示旧头不是新头的祖先（被重写或回退） | 起来时与记下的头比，变了补发一次，范围是记下的头到现在 |
| `design-released` | 设计放行了 | 编排层：M3 设计行在人放行之后写入收件箱 | 收件箱（§5.3） | `{goal, title}` | 收件箱里没处理的照常处理 |
| `task-handed-back` | 一件活交回了 | 编排层：M7 执行行在交回处理之后写入 | 收件箱 | `{task, title, kind: 'implement' \| 'test' \| 'doc' \| 'review' \| 'other', status: 'done' \| 'blocked' \| 'failed', attempt}` | 同上 |
| `work-stopped` | 一件活停下来了 | 编排层：M7 写停下标记时（审查不收敛、检查连着失败、验收审查不收敛），M4 第三次修复时 | 收件箱 | `{node, title, why: 'review-not-converging' \| 'gate-failing' \| 'third-rework' \| 'acceptance-review', counts: string}` | 同上 |
| `waiting-on-human` | 有事等你超过一段时间 | 循环行读项目图 | 每小时一次，按 `listOpenItems` 取决定者为人、还开着的待决与等人批准的提议，`since` 取它们进入等人状态的时刻 | `{items: [{id, title, since}]}`，只列这次新越过门槛的 | 状态型：起来后照算，不需要补 |
| `host-restarted` | 宿主重新起来了 | 循环行激活时 | 对照上一次的宿主记录（§8.1 `state.json` 的 `host`） | `{previousStart, downMinutes, crashed, rebooted, appChanged}`；`crashed`：上次没有写下正常退出；`rebooted`：开机时刻不同；`appChanged`：DSH 程序文件的大小或修改时间与上次不同（§9.2 V6） | 本身就是 |
| `files-edited` | 一个 agent 改了文件 | DSH 钩子 `agent/pre-step` 加会话历史（M4 §6.2） | 每一步，env 行推出这一步之前改过的文件 | 按 agent，由 env 行在内部处理 | 状态在会话里，M4 已处理 |
| `file-changed` | 某个文件变了 | 循环行看文件 | `fs.watch` 加每 30 秒比一次大小与修改时间作兜底（同规则板检测器的 `file` 触发）；变了之后 60 秒内不再变才算一次 | `{path, size, mtime}` | 起来时比一次，变了补发一次 |
| `peak-changed` | 高峰开始或结束 | 通道插件的计价服务（GLM 包提供 `glmHournessPricing.peak`，`src/shared/pricing.ts`） | 定时器设在 `nextPeakChange(peak, now)`（M6 §5，`src/shared/pricing.ts`）；每 60 秒一拍（§5.1）也比一次 | `{edge: 'start' \| 'end', until?: string}` | 起来时与记下的值比，不同就补最近的那一次 |
| `quota-read` | 读到了一次额度，或额度已用完 | 通道插件经契约推送（§3.4） | 订阅 | `{windows: [{name, usedPercent, resetAt?}], cause: 'reading' \| 'upstream-limit'}`；上游报额度用完时通道推一条 `usedPercent: 100`、`cause: 'upstream-limit'` 的读数 | 不补；下一次读到再判 |
| `login-lost` | 通道的登录失效了 | 通道插件经契约推送 | 订阅 | `{reason}`（一行，不含凭证） | 不补；下一次请求失败时通道再推 |

`files-edited` 只能配 `checks`，`peak-changed` 只能配 `peak-mode`；这两个事件不出现在人的新建表单里：检查器在项目图的工具节点里加（M4 §6.1），高峰怎么办在规则板选档位。

### 3.2 筛选

| 事件 | 能用的筛选 | 含义 |
| --- | --- | --- |
| `main-advanced` | `paths: string[]`；`skipIfGated: boolean` | `paths` 的写法在 M7 的 `when` 上多一条：以 `/` 结尾的是相对项目根的目录前缀；带 `/` 的是相对项目根的文件；不带 `/` 的名字在任何一层目录都算（`package.json` 也匹配 `packages/glm/package.json`）。改动的文件里有一个匹配就算；`skipIfGated` 为真时，范围里每个提交都带 M7 的尾注 `Hourness-Task`，且它的门禁记录（M7 §3.8.3 的 `result.json`）里 `norm-merge-gate` 的每条 `$` 行（含带 `when` 的）都跑过并退出 0，这次就不跑 |
| `task-handed-back` | `kinds`、`status` | 列出的种类与结局才算 |
| `work-stopped` | `why` | 列出的原因才算 |
| `host-restarted` | `crashed`、`rebooted`、`appChanged` | 写了的那几项都为真才算 |
| `waiting-on-human` | `olderThanHours: 1–168`（默认 24）；`quietHours: {from, to}`（`HH:MM`，默认 22:00–08:00） | 等过门槛才列；落在安静时段里的攒到时段结束再投 |
| `file-changed` | `path`（必填，绝对路径；一个项目至多 20 个） | 看哪个文件 |
| `peak-changed` | `edge` | 只看开始或只看结束 |
| `quota-read` | `minPercent: 1–100`（默认 80）；`windows` | 已用比例不低于它的窗口才算；同一个窗口同一个重置周期只算一次 |

### 3.3 以后可加的（本版不做）

一个 agent 的回合出错（`agent/error`，agent-loop:880 发出，监听方式没有核对）；会话打开（`agent/created`）；规则板的信号变了（检测器写的信号，例如服务器负载）。加一种事件要改 `src/loops/events.ts`、它的发现方式与筛选，经设计评审；其余设计不用改。

### 3.4 通道插件的契约

编排层不带任何模型的方言（`hourness` 非目标），所以通道的两个事件（`quota-read`、`login-lost`）与 GLM 的三项默认条目都由 GLM 包经公共库的契约提供，编排层只认契约里的通用说法（高峰、额度、登录），不认 GLM：

```ts
// src/shared/channel-loop.ts（公共库，两包都编进去；只有类型、常量与纯函数）
export const CHANNEL_LOOP_SERVICE = 'glmHournessChannelLoop'

export type ChannelEvent =
  | { readonly kind: 'quota-read', readonly at: string, readonly cause: 'reading' | 'upstream-limit', readonly windows: readonly { readonly name: string, readonly usedPercent: number, readonly resetAt?: string }[] }
  | { readonly kind: 'login-lost', readonly at: string, readonly reason: string }

export interface ChannelLoopSource {
  /** 包名，页面上的「谁带来的」 */
  readonly plugin: string
  /** 这个通道的 provider id（GLM 包是 'glm-zcode'）；用来判断主 Agent 自己是不是走这个通道 */
  readonly providers: readonly string[]
  /** 这个插件带来的默认条目；事件只能用 quota-read、login-lost 与 peak-changed */
  readonly defaults: readonly LoopEntryDefinition[]
  /** 订阅通道事件；返回取消订阅的函数 */
  subscribe(listener: (event: ChannelEvent) => void): () => void
}

/** 读服务；不在或形状不对时为 undefined，形状不对报给 problem 一次（同 pricingService） */
export function channelLoopSource(ctx: ServiceLookup, problem?: (message: string) => void): ChannelLoopSource | undefined
```

- GLM 包的 `glm-login` 行与计价服务一起 `ctx.provide` 这个服务（同 `providePricing`，`src/glm-llm/login-row.ts`）。推送的时机：M6 的额度读取每次写额度流水时推 `quota-read`（`cause: 'reading'`）；通道收到上游限额错误（M6 F5，1308 等）时推一条 `cause: 'upstream-limit'` 的读数；`ZcodeAdapter.stream` 走到「未登录」「拿不到项目令牌」两处（`src/glm-llm/zcode.ts`:384–386、546–549，今天各报一次行健康 `inactive`）时推 `login-lost`，同一原因 10 分钟内只推一次。
- `LoopEntryDefinition` 是 `LoopEntry` 去掉 `source` 与 `rev` 的那一部分，也在公共库里（从 `src/loops/model.ts` 移到 `src/shared/loop-model.ts`，编排层的 `src/loops/model.ts` 从那里再导出）。循环行读到 GLM 包的默认条目时整份校验，不合的那一项不显示，行健康写「GLM 插件带来的第 n 项读不懂」。
- 高峰不另走契约：`peak()` 已经在计价服务里（`src/shared/pricing.ts`），`nextPeakChange` 在 M6 的同一个文件里。

## 4. 默认条目

给模型的文字是英文，`<…>` 是由事件载荷填的部分（填进去的标题与路径经 `JSON.stringify` 转义，与 DSH 的提醒同一种写法，schedule:1388–1418）。每条消息的第一行固定为 `Loop board: <id> (default of <插件>).`（人的条目写 `(added by the human)`），模型与人在对话里都看得出它从哪来；到点类的提醒交给 DSH 时，这一行末尾另加 `Change it on the loop board, not here.`（§5.2）。下面各条只写第一行之后的部分。人看到的「做什么」一栏是页面上的说法。

### 4.1 编排层带的（`dsh-hourness`，`src/loops/defaults.ts`）

| # | id | 页面上的名字 | 什么时候 | 做什么 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| 1 | `hourness:morning-report` | 晨报 | 每天 08:30 | 告诉主 Agent 出晨报，原样给你看 | M7 m7-6 的 `hourness_report` |
| 2 | `hourness:weekly-report` | 周报 | 每周一 09:00 | 告诉主 Agent 出周报 | M7 m7-8 |
| 3 | `hourness:patrol` | 夜间巡检 | 每天 02:30 | 告诉主 Agent 巡检：清理、主干检查、列出要处理的 | M7 m7-7 |
| 4 | `hourness:full-check-after-merge` | 合进主干之后跑一遍完整检查 | 事件 `main-advanced`，`skipIfGated: true` | 在门禁工作树里对新的主干跑「合入前的检查」的全部命令，没过时告诉主 Agent，过了之后再说一次 | M7 m7-5 的门禁工作树与锁；`norm-merge-gate` |
| 5 | `hourness:drive-after-release` | 设计放行之后开始推进 | 事件 `design-released` | 告诉主 Agent 开始推进这个目标 | M3 的放行；M7 的驱动 |
| 6 | `hourness:review-after-handback` | 一件活交回之后派审查 | 事件 `task-handed-back`，种类为实现、测试、文档，结局为完成 | 告诉主 Agent 派审查，模型由它选 | M7 m7-4 |
| 7 | `hourness:stop-and-report` | 连着失败或第三次返工时停下来报告 | 事件 `work-stopped` | 告诉主 Agent 别再派这件活，用一段方案告诉你 | M7 §3.7.3、M4 §4.6 |
| 8 | `hourness:resume-after-restart` | 重启之后接上停了的活 | 事件 `host-restarted` | 告诉主 Agent 查哪些活停了，接着做或重派 | M7 §3.9.6 的对账 |
| 9 | `hourness:deps-after-merge` | 依赖或锁文件变了之后查依赖 | 事件 `main-advanced`，改动里有依赖文件 | 告诉主 Agent 跑依赖检查，大版本升级留给你 | `norm-merge-gate` 的 `patrol $` 行 |
| 10 | `hourness:remind-waiting` | 有事等你太久时提醒你 | 事件 `waiting-on-human`，超过 24 小时，22:00–08:00 不说 | 告诉主 Agent 再跟你说一次，一件一段 | 项目图 |
| 11 | `hourness:checks-after-edit` | 改完文件就跑检查 | 事件 `files-edited` | 跑项目图里你批过的检查，结果交给改文件的那个 agent | M4 m4-checks；env 工具节点 |

给模型的文字：

- 1：`Call hourness_report with kind "morning" and reply with its text unchanged, then at most three lines on what waits for the human. Then call loop_note with entry "hourness:morning-report" and one line on what you reported.`
- 2：同 1，`kind "weekly"`，没有「三行」一句。
- 3：`Call hourness_report with kind "patrol". For each finding that is planned work, propose a task. For each finding the human must decide, propose a pending question and tell the human as one plan in the four-line form (背景, 推荐, 疑问, 不做) when they are back. Do not write files. Then call loop_note with the counts.` M7 §3.11.1 的巡检原文里「propose a question with options and the recommendation last」随 `d-chat-not-cards` 改成上面这句。
- 4（没过时）：`Full check of <base> at <to> failed: \`<command>\` exit <code> (log <path>). Last lines:` 下面至多 40 行输出（§5.5），再一行 `Main must stay green: fix it or revert, then let the check run again.`；过了之后第一次：`Full check of <base> at <to> passed again.`
- 5：`The human released the design of goal <goal> "<title>". Drive it to the end on your own: dispatch the ready tasks, review, merge and pass the completion check. Stop only at a point the human must decide.`
- 6：`Task <task> "<title>" was handed back done (attempt <attempt>). Dispatch its review now: choose the depth (norm-review-floor says when a full review is required) and the reviewer's model, and say why.`
- 7：`Work on <node> "<title>" stopped: <why> (<counts>). Do not dispatch it again. Tell the human as one plan in the four-line form (背景, 推荐, 疑问, 不做) and wait for their answer.`
- 8：`The host restarted at <time> after <downMinutes> minutes<; it did not shut down cleanly>. Workers that were running ended with it. Call graph_open, find the tasks in progress without a live dispatch, and resume or re-dispatch them.`
- 9：`Dependency files changed on <base> (<from>..<to>): <files>. Run the project's dependency check (the patrol lines of norm-merge-gate) and report what it found; a major-version upgrade is the human's call.` 依赖文件的名单写在代码里：`package.json`、`package-lock.json`、`npm-shrinkwrap.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`yarn.lock`、`requirements.txt`、`pyproject.toml`、`poetry.lock`、`uv.lock`、`Pipfile.lock`、`Cargo.toml`、`Cargo.lock`、`go.mod`、`go.sum`、`Gemfile.lock`、`composer.lock`。名单里的名字不带 `/`，按 §3.2 的写法在任何一层目录都算。
- 10：`These have waited for the human for more than 24 hours: <id "title" since …>. Remind the human once, each as one plan in the four-line form, the shortest first.` 同一件事 24 小时内只列一次。
- 11：没有给主 Agent 的文字；检查结果的提醒是 M4 §6.5 的样子，交给改文件的 agent。

第 4 项为什么带 `skipIfGated`：主 Agent 合入时 harness 已经核对这个提交跑过合入前的检查（`d-main-agent-shell`），对同一个提交再跑 30 分钟只花时间。这一项真正要接住的是门禁之外的合入（人在别处直接合、带 `when` 的命令因为路径没跑），所以范围里有任何一个提交没有完整的门禁记录才跑。跑的地方是 M7 的门禁工作树：经 `glmHournessExecute.withGateLock(repoRoot, 'trunk-check', fn)` 取锁（M7 §3.8.3），在分离头指针上检出新的头，按顺序跑 `norm-merge-gate` 的全部 `$` 行（不看 `when`，`setup $` 行在需要时先跑），第一条失败就停；`report` 为 `on-failure`，`glmSpend` 为 `none`，每条命令 30 分钟上限（M7 的 `GATE_COMMAND_MS`）。锁被占时等 M7 的规则（每 5 秒重试，至多 60 分钟）；同一项正在跑时新的主干前进只留一次待跑（§5.6）。执行行没启用时这一项结局为 `skipped`，原因「没有门禁工作树（M7 执行行未启用）」。

### 4.2 GLM 插件带的（`dsh-glm-zcode`，`src/glm-llm/loop-defaults.ts`，经 §3.4 的契约提供）

| # | id | 页面上的名字 | 什么时候 | 做什么 |
| --- | --- | --- | --- | --- |
| 12 | `glm:peak` | GLM 高峰开始与结束：按你选的档位收放 | 事件 `peak-changed` | 规则板按档位执行：无影响只提醒；少做时不起重活、少派；不做时停下 GLM 的活，高峰后接着做。页面写此刻是不是高峰、档位与下一次变化 |
| 13 | `glm:quota-warn` | GLM 额度快用完时提前说 | 事件 `quota-read`，已用不低于 80% | 告诉主 Agent 跟你说一句，可挪的 GLM 重活挪到额度重置以后 |
| 14 | `glm:login-expired` | GLM 登录过期时提醒你重新登录 | 事件 `login-lost` | 告诉主 Agent 跟你说一句「打 /glm-login」，在那之前不派 GLM 的子 agent |

- 12：动作 `peak-mode`。循环行在高峰开始与结束时记一次运行（`loop-fired` 与结局 `delegated`，载荷写当时的档位），不另发任何消息：主 Agent 的那一行高峰提醒与档位由规则板的每步提醒给（规则板 §3.6「主 Agent 那一行」），排队、暂停 goal 与高峰后的恢复由规则板的等待单做（规则板 §6.3）。规则行没加载时页面写「规则板没启用：高峰只由 GLM 插件提醒模型，档位不起作用」，记录照写。
- 13：`GLM quota: the <window> window is <p>% used<, resets at <time>>. Tell the human in one line, and move optional heavy GLM work (practice runs, ablations, large reviews) after the reset.`；`cause` 为 `upstream-limit` 时改为 `GLM quota is used up<, resumes at <time>>: GLM requests fail until then. Tell the human in one line and dispatch no GLM workers until then.`。同一个窗口、同一个重置时刻只说一次。
- 14：`GLM sign-in has expired (<reason>). GLM requests fail until the human runs /glm-login. Tell the human in one line; until then dispatch no GLM workers.` 主 Agent 自己走 GLM 时（它会话的 `requestHeader().config.provider` 在契约的 `providers` 里，session:1612）不投：它下一回合的模型请求本身就会报「运行 /glm-login」（`src/glm-llm/zcode.ts`:384–386），叫醒它只会多一回合失败；结局 `skipped`，原因「主 Agent 自己也走 GLM」，首页多一行「GLM 登录过期了：在输入框里打 /glm-login」（§7.3）。

额度只在有人读的时候读（M6 §0 第 2 条：只在人敲 `/glm-status`、`/hourness` 时读，60 秒内复用，不后台轮询），所以第 13 项「提前说」只在这些时候判断。晨报会读一次（M7 的四答晨报「花费」一节用 M6 的 `quotaLines`，§16 给 M7 的一条），所以周额度每天早上至少判一次；5 小时窗口靠人看的时候与用完时的那一条。是否另加定时读取，要先查清 ZCode 桌面版自己会不会定时读额度（§9.2 V9），读法要和它一致；查清之前不加。

### 4.3 本仓库自己的（人的条目的例子，不进产品）

自举开始、本仓库的开发改在 DSH 里由主 Agent 做之后，由人在本仓库的循环板上加这几项（§6）；在那之前它们只是例子，`reading-digest` 照旧由 Kiro 钩子提醒。

| 名字 | 什么时候 | 做什么 |
| --- | --- | --- |
| ZCode 更新之后比一遍提示词与线路 | 事件 `file-changed`，`C:\Program Files\ZCode\resources\app.asar` | 告诉主 Agent：`ZCode was updated (app.asar changed). Dispatch a task to extract the new bundle and compare the system prompt, tool texts and wire (headers, signing, quota) with docs/reference/zcode-verbatim.md and the current baseline; report the differences to the human as one plan.` |
| DSH 更新之后核对插件契约并跑探针 | 事件 `host-restarted`，`appChanged: true` | 告诉主 Agent：`DSH was updated. Re-export the runtime packages into reference/ (docs/DEVELOPMENT.md §4), re-check the contract table of docs/DESIGN.md §2.4a, run npm run probe, and report what changed.` |
| 每周读 Anthropic 与 OpenAI 的文章 | 每周四 09:00（Asia/Shanghai；下一次 2026-11-05） | 告诉主 Agent：`Weekly reading (graph task reading-digest): read the new agent articles of Anthropic Engineering and the OpenAI Cookbook since the date in the last loop note, have a worker write the digest under .agents/tasks/reading-<date>/digest.md, propose what is worth changing, and record where you stopped with loop_note.` |
| 蓝屏或崩溃重启之后查主检出、工作树与在跑的运行 | 事件 `host-restarted`，`crashed: true` | 跑命令 `["git", "status", "--porcelain=v1", "-b"]`、`["git", "worktree", "list", "--porcelain"]`、`["pwsh", "-NoProfile", "-Command", "npm run -s graph -- open"]`，每次都交给主 Agent，前面一段 `After a crash: check the main checkout, the worktrees and the runs that were going; restore or re-dispatch.`（`npm` 在 Windows 上是 `.cmd`，不经 shell 起不来，所以包一层 `pwsh`） |

人自己会加的另一类例子：服务器巡查，每 30 分钟跑 `["pwsh", "-NoProfile", "-File", "scripts/check-server.ps1"]`，没过时告诉主 Agent，前面一段 `The server check failed. Tell the human in one line what failed; do not try to fix the server.`。

`reading-digest` 节点：它是一件定期的事，在两次之间挂在「进行中」（plain-ui P4 的问题）。循环板上线、上面那一项加上之后，这个节点以带证据的完成关闭（证据写循环板条目的 id），以后每次的结论记在条目的批注里（§5.9），不再挂在图上。plain-ui 为它设计的任务字段 `repeat` 与「进行中回到已批准」的转换不再需要（§16）。

### 4.4 主 Agent 自己设的提醒

主 Agent 仍带 DSH 的四个提醒工具（`schedule_create` 等，standard preset 挂载，web-app `presets/cordis.patch.yml`:38–39），可以给自己设「30 分钟后看一眼 CI」这类提醒。这些不是循环板的条目，页面在最后一组「主 Agent 自己设的提醒（DSH 自带）」里只读列出（`schedule.catalog()` 里绑在主 Agent 会话上、又不是循环板建的那些），写标题、下次与「在 DSH 的自动化任务页里管理」。

## 5. 运行

### 5.1 谁来跑

新行 `glm-hourness/loops`（源码 `src/loops/`，编排层包，默认 `disabled: true`，通过 L3 与第一批 L4 后启用）。每个宿主进程里它都注册工具、命令与投影（§6、§7），但一个项目同一时刻只有一个宿主进程「跑」这个项目的循环板：

- 能跑的条件：这个宿主有 `sessionController` 服务（`ctx.get`，不写进 `inject`；投递要它恢复冷会话）。它与 `schedule` 服务只在 Web 组合里（web-app `cordis.patch.yml`:121–122、139–140），headless 运行、探针与标定没有，所以那些进程从不跑条目（`dsh-schedule/README.zh.md`「使用此包」：Schedule 不能在 headless 或仅 SDK 的组合中挂载）。有 `sessionController` 而没有 `schedule` 时照样跑，只是到点告诉主 Agent 的几项不跑（行健康 degraded，验收第 20 条）。
- 运行锁：`<项目目录>/runner.lock`（§8.1），以 `wx` 独占创建，内容 `{pid, boot, startedAt}`（`boot` 为本机开机时刻，`Date.now() - os.uptime() * 1000` 取到分钟，同 M7 门禁锁）。锁在、持有者的 pid 活着（`process.kill(pid, 0)` 不报 `ESRCH`）且 `boot` 与本机相同：不跑，页面写「另一个 DSH 进程在跑这块板」。否则先把旧锁改名为 `runner.lock.stale-<时刻>`（留痕），再重新创建。行卸载与宿主退出时删锁（只删 `pid` 是自己的）。
- 什么时候开始跑一个项目：这个宿主里出现了这个项目的会话（`agent/created`，agent:581–585；项目按会话头的 `cwd` 算，session:1820–1826）；之后每 60 秒一拍（`setInterval`，`unref`），直到这个项目 10 分钟没有活会话、也没有主 Agent 的持有者记录时停下并删锁。主 Agent 的会话是冷的（没有打开）时照样跑：到点的投递由 DSH 恢复会话（schedule:1576），事件的投递由循环行经 `sessionController.resolveAgent` 恢复（§5.4）。
- 桌面版一启动、人还没打开任何会话：宿主里还没有这个项目的会话，循环行不知道有哪些项目。用户级目录里每个有主 Agent 持有者记录的项目（M3 附录 §2.4 的 `<userHome>/main-agent/*.json`，`graphDir` 给出项目）在行激活时就开始跑。没有主 Agent 的项目要等人打开它的会话。

### 5.2 时间：DSH 的定时服务与循环板自己的钟

两种动作配时间触发，走不同的钟：

| 条目 | 谁计时 | 到点时 |
| --- | --- | --- |
| 告诉主 Agent（`tell-main`），五种时间都行 | `dsh-schedule`：循环行为每一项建一个绑在主 Agent 会话上的任务 | DSH 把提醒当成一条 user 消息投进主 Agent 会话并叫醒它（schedule:1576–1598，`followup`），主 Agent 读到的是 DSH 的固定开头加上这一项的英文文字（schedule:1388–1418） |
| 跑命令（`run`），一次、每隔、每天、每周 | 循环行自己的钟（`src/loops/clock.ts`，用 `src/loops/trigger.ts` 算下一次） | 循环行跑命令；按 `report` 决定要不要、什么时候告诉主 Agent（§5.4、§5.5） |

为什么分开（三种做法，采用的放最后）：

1. 全部走 `dsh-schedule`，跑命令的条目在主 Agent 收到提醒那一步之前由 `agent/pre-step` 跑命令、把结果接在提醒后面：时区、cron、补跑都用 DSH 的。代价：每次到点都叫醒主 Agent，命令过了也要在人唯一的对话窗口里留一回合；服务器巡查每 30 分钟一次就是每天 48 回合「一切正常」。想不叫醒，只能在 `agent/pre-step` 里把领走的提醒拿掉，那会丢消息（规则板 §3.6 的同一个理由，agent-loop:101–110 领走的消息不放回收件箱）。
2. 全部用循环板自己的钟：一套语义。代价：DSH 的时区、cron、夏令时与重启补跑要自己重写一遍；人在 DSH 的任务页上看不到这些到点的事；`dsh-schedule` 的发送记录也用不上。这和编排方已经告诉人的「时间触发直接用 DSH 的定时服务」不一致。
3. 告诉主 Agent 的走 `dsh-schedule`，跑命令的用自己的钟（采用）：要叫醒主 Agent 的事，DSH 的投递正是要的效果；不该叫醒人的命令，不经过它。代价：命令类条目不支持 cron（自己的钟只做一次、每隔、每天、每周，夏令时规则照 DSH：缺的钟点跳过，重叠的取较早那次），以及两种钟各有各的补跑记录（都只补一次，§5.7）。

`dsh-schedule` 任务的绑定与对账（`src/loops/bind.ts`）：

- 一项对应一个任务：标题 `循环板 · <title>`（至多 120 个字符，schedule:23），提示文字是 §4 的英文文字，第一行固定 `Loop board: <id> (default of <插件> | added by the human). Change it on the loop board, not here.`；选择器按 §2.2 映射。循环行在 `state.json` 的 `bindings` 里记 `{entry, rev, scheduleId, sessionId, rule}`。
- 对账在这些时候做：循环行开始跑一个项目时；每一拍（60 秒）；收到 `schedule/changed`（schedule:2231–2237，提交之后发出，没有载荷）；主 Agent 的持有者记录变了（M3 附录 §2.4 的 `readHolder` 按文件的 `mtimeMs` 与 `size` 缓存，变了才重读）；一项人的条目写入之后。
- 对账按 `schedule.catalog()`（schedule:2129–2137，返回每条任务的记录、`sessionId`、`status` 与 `lastDelivery`）做四件事：
  1. 该有的没有（新条目、新的主 Agent、任务被删了）：`schedule.create(主 Agent 会话 id, {title, prompt, <选择器>})`（schedule:2083–2112）。主 Agent 会话是被委派的子会话时 DSH 拒绝（`subagent_session`，schedule:2244–2262），主 Agent 不会是子会话，这里只记错误。
  2. 绑在别的会话上（主 Agent 换了会话）：在旧会话上 `schedule.delete({sessionId: 旧, id})`（schedule:2164–2183），在新会话上建。旧任务的发送记录随之删掉（DSH 的删除是硬删除）；循环板自己的运行记录不受影响（§5.9）。
  3. 内容与条目不同（人在 DSH 的任务页上改了名字、文字或时间）：按条目改回，用 `schedule.update({sessionId, id, expected: <catalog 里的那条记录>, title, prompt, change})`（schedule:2197–2222）；返回 `schedule_conflict` 时重读一次 catalog 再试，仍冲突就删掉重建。这一项记一笔 `loop-drift`，页面在这一项下面写一行「在 DSH 的自动化任务页里改的不算数，已按循环板改回；要改请在循环板上改」（同一项一天至多写一次）。
  4. 不认识的循环板任务（提示文字以 `Loop board: ` 开头、`bindings` 里没有：上一次的 `state.json` 丢了，或条目已删）：条目还在、会话是主 Agent 的就认下来写进 `bindings`；否则删掉。
  - 一次性的条目投过之后，DSH 留着一条未运行的记录（`status: 'inactive'`，schedule:2129–2137 的 `status`）。对账认得它：`bindings` 记 `done: true`，不再建，页面这一项写「已跑过（<时刻>）」。未运行的记录不参与上面第 1–3 条的比较。
- 只有一种情况不立刻重建：任务因为会话被归档而被 DSH 一起停掉（归档时 DSH 删除这个会话的全部活动任务，schedule:2056–2059、2273–2297）。循环行分不出这次删除是归档还是人在任务页上删的，所以任务不见了时先记 `loop-drift`（「DSH 里的提醒没了」），在下一次这个会话的 `agent/created` 或主 Agent 换会话时再建，不在已归档的会话上反复重建。这一段时间里这一项不会到点，页面写明。
- agent 不能改循环板的任务：一条规则 `loops:schedule-tools`，由循环行自己在 `tools/pre-execute`（tools:3320–3345）上注册，用 guard 的规则框架（`GuardRule`、`evaluate`、`renderCorrection`，拒绝写进违规流水，同 M7 §3.2 写入门禁的做法）。`schedule_update` 与 `schedule_delete` 的 `id`（tool-schedule:570–600、604–650）指向循环板的任务（在 `bindings` 里，或 `schedule.catalog()` 里这条的提示文字以 `Loop board: ` 开头；catalog 读不出时放行，由第 3 条事后改回）时拒绝，纠偏写「That reminder belongs to the loop board; propose a change with loop_propose instead.」。DSH 任务页走的是 Remote 的 `schedule.update`/`delete`，不经工具，靠上面第 3 条改回。这条规则列在规则板「写在代码里的规则」里（§2.4 第 15 行）。
- 到点之后：DSH 投递成功时它更新这条任务的 `lastDelivery`（`scheduledAt`、`deliveredAt`、`messageId`）并发 `schedule/changed`。循环行在对账时比较 `lastDelivery.messageId` 与上次记下的，变了就记这次运行（`loop-fired` 与结局 `delivered`，§5.9）。DSH 投递失败时不自动重试，下一次有任务写入或宿主重启才再试（schedule:1626–1640）；循环行看到某项的 `scheduledAt` 已过 5 分钟而 `lastDelivery` 没变时，记一次 `failed`（原因「DSH 没投出去」），删掉这条任务、按同一规则建一条新的；新任务的第一个目标严格在未来，错过的这一次由循环行按 §5.4 自己投一次（投不出同样按 §5.4 重试与记失败）。不用「改一下」去催：DSH 对规范化后等价的更新不写入、不重新计算（`dsh-schedule/README.zh.md`「使用此包」末段），催不动。

### 5.3 事件的收集：项目收件箱

编排层的设计行、执行行与 env 行要报事件，又不能依赖循环行这时在不在（加载顺序、行被禁用、宿主刚起来）。所以报事件就是往项目目录里的收件箱追加一行，与谁在跑无关：

- `emitLoopEvent({userHome, cwd}, event)`（`src/loops/emit.ts`，库函数，任何编排层的行都可以导入）：按 §2.1 的项目键找到 `<userHome>/loops/projects/<键>/events.jsonl`，在 `entries.lock`（§8.1）内追加一行 `{id: 'ev-<16 位十六进制>', at, event, payload, from: <行名>, cause?}` 并 `fsync`。返回 `true`，或取不到锁、写不进时返回 `false`；调用方把 `false` 报成自己的行健康 degraded（「没能把『<事件>』交给循环板」），不重试（漏报的那一次怎样被发现，见本节最后一条）。
- 循环行跑这个项目时，每一拍与收件箱文件变化时（`fs.watch`）从记下的位置往后读：每行校验，读不懂的跳过并计数；处理完把位置（字节偏移与最后一个 id）写进 `state.json`。文件超过 8 MiB 时在锁内改名为 `events-<时刻>.jsonl`，旧文件保留 7 天。
- 处理顺序按写入顺序。事件写入超过 7 天还没处理（宿主一直没跑这个项目）：记 `expired`，不跑。
- 各行报事件的地方（各自的设计在下一稿里加上这一句调用，§16）：M3 设计行在人放行目标的设计之后（`design-released`）；M7 执行行在交回处理写完批注之后（`task-handed-back`）、写停下标记之后（`work-stopped`）；M4 在第三次修复之前（`work-stopped`，`why: 'third-rework'`）。
- 漏报怎样被发现：这些事件都先写进了项目图（交回与停下有 M7 的批注，放行有目标的阶段），收件箱只是通知。漏了的那一次由图上的事实兜住：夜间巡检列出「完成却没有合入证据的写任务」「进行中超过 24 小时、没有活着派发的任务」（M7 §3.11.2），晨报的「例外」一节列出「有停下标记、却没有给人的待决」（M7 §3.10）；主 Agent 读到之后照常处理。循环板不另从图上反推事件，以免两条路各报一次、重复叫醒主 Agent。

循环行自己发现的事件（`main-advanced`、`waiting-on-human`、`host-restarted`、`file-changed`、`peak-changed`）不经收件箱，直接进处理；通道事件（`quota-read`、`login-lost`）经 §3.4 的订阅进来。三路进来的事件走同一个处理函数 `handleEvent(project, event)`：找出所有事件与筛选都对得上的条目，按 §5.6 去抖、限次，再交给动作的执行者。

### 5.4 交给主 Agent

主 Agent 是谁：M3 附录 §2.4 的 `mainAgentOf(userHome, graphDir)`（持有者记录），`graphDir` 取图行服务的 `dirFor(项目根)`。M3 没合入、项目没有主 Agent、或记录读不出时，「告诉主 Agent」的条目没有人可告诉：事件类的消息存进 `state.json` 的 `held`（每个项目至多 50 条，满了丢最早的并记 `expired`），有了主 Agent 之后按先后投；存了 24 小时还没投出的记 `expired`。到点类的条目没有主 Agent 时不建 DSH 任务，页面写「还没有主 Agent：在一个会话里发 /wish」。

事件类的消息怎样投（`src/loops/deliver.ts`）：

1. 消息是一条 user 角色的合成消息（`createUserNotice`，`src/shared/dsh-min.ts`；与 `createUserMessage` 同形，llm:37–66），正文用 `<system-reminder>` 包起来（`docs/DESIGN.md` §6 第 1、3 条），`source: {kind: 'hourness-loop', entry, run}`。同一个主 Agent 5 秒内要投的几条合成一条，每段前面写各自的第一行。
2. 拿到活 agent：`agents.get(会话 id)`（agent:596）；没有（会话是冷的）且这条要叫醒它时，`sessionController.resolveAgent(会话 id)`（api-session-controller:3037–3039，返回 `{agent}` 或 `{error}`；DSH 的定时服务用的同一个调用，schedule:1576）；不叫醒的条目不去恢复会话，留在 `held` 里，等这个会话下一次 `agent/created` 时投。整个投递放在 `agents.withoutInitiator` 里（agent:414），与 DSH 定时服务的投递相同（schedule:1524–1545），这样投进去的消息不算哪个 agent 发起的。
3. 按 agent 的状态与条目的 `wake` 选方式（参照规则板 §6.3 的唤醒表；那里 agent 在跑时用 `steer`，这里用 `inject`，因为循环板的消息不需要唤醒，两者都进下一步的队列）：`wake` 为假，或 agent 在跑（`status` 为 `running`，agent-loop:790–793），或它空闲但有 active 的 goal：`inject`（下一步才看，不叫醒，agent-loop:812–814）；其余：`followup`（进下一回合并叫醒，agent-loop:806–808）。
4. 确认落盘：`sessions.flush(agent.session)`（session:1951；DSH 的定时服务同样在投递后调它，schedule:1598）返回假，或上面任何一步抛错：按 1、5、15 分钟重试三次，仍失败记 `failed` 并报行健康 degraded（「没能把『<title>』交给主 Agent：<原因>」）。投递与记录是两次写入，中间崩溃可能重投一次：每条消息带运行号，记录先写 `loop-fired`、投完再写 `loop-done`，重启后有 `loop-fired` 没有 `loop-done` 的运行按「可能已投」重投，消息第一行多写 `(may repeat run <run>)`。至少一次，不保证恰好一次，与 DSH 的定时服务同样（`dsh-schedule/README.zh.md`「已知限制」第 2 条）。

到点类的消息由 DSH 投，循环行只在主 Agent 领到它的那一步加一句（`agent/pre-step` 的步 notice，`installStepNotice`，`src/shared/step-notice.ts`；agent-loop:901–925）：领走的消息里有来源 `schedule`（schedule:1594）、`schedule_id_json` 或 `reminders_json` 里的 id 在 `bindings` 里的，循环行在 `next()` 之后追加一行 `Loop run <run> for <entry>.`；高峰「不做」时改为 §5.8 的那一行。这一步还记下主 Agent 这一回合是被哪次运行叫起来的，供 §5.6 判断「自己触发自己」。

### 5.5 跑命令

`src/loops/command.ts`（与规则板检测器共用，规则板 §5.3 的约定；谁先实现谁建，§16）：

- `argv` 的每一条用 `child_process.spawn(argv[0], argv.slice(1), {shell: false, windowsHide: true, cwd})`；`norm` 的 `$` 行用 `spawn(命令, {shell: true, …})`（M7 §3.8.1）。`cwd` 是项目根，`where: 'gate-worktree'` 时是 M7 的门禁工作树（§4.1 第 4 项）。
- 环境只给 `PATH`、`PATHEXT`、`SystemRoot`、`TEMP`、`TMP`、`USERPROFILE`、`HOME`、`APPDATA`、`LOCALAPPDATA`，以及 `HOURNESS_LOOP_ENTRY`、`HOURNESS_LOOP_RUN`、`HOURNESS_PROJECT_ROOT`（同规则板 §5.3，多给了 `npm` 与 `git` 要的几项）。宿主的其他环境变量（包括 `GLM_HOURNESS_CREDENTIAL_SECRET`）不传。`norm` 行沿用 M7 门禁的环境，循环板不另改。
- 起来后 `os.setPriority(child.pid, PRIORITY_BELOW_NORMAL)`；每条命令的上限默认 60 秒，人的条目可设 5–1800 秒，`norm` 行 30 分钟；到时只要 `ChildProcess` 还没 `exit` 就 `taskkill /PID <pid> /T /F`（其他平台对进程组发 `SIGKILL`）。一个条目的几条命令按顺序跑，第一条失败就停。
- 同一个项目同一时刻至多跑一个循环板命令，其余排队；`where: 'gate-worktree'` 的不占这个名额，它排在 M7 的门禁锁上。同一项正在跑时它又被触发：只留一次待跑，再来的合进这一次（`overlap: 'queue-one'`，§5.6）。
- 输出：标准输出与错误合在一起写进 `<项目目录>/logs/<entry>/<时刻>.log`（第一行是命令原文），内存里至多留 1 MiB；日志按条目保留最近 50 份或 7 天。
- 交给主 Agent 的结果：每条命令一行 `` `<命令>` exit <码>（<用时>）``，失败那条下面至多 40 行、4000 个字符的输出末尾；整段先过 `redactSecrets`（M5 的 `src/data/secret-shape.ts`；M5 没合入时用同目录 `src/loops/redact.ts` 里同一组模式，M5 合入时删掉换成它），密钥形状的串换成 `[redacted]`；再接 `Full output: <日志路径>`。指标流水只记退出码、用时与字节数，不记输出。
- 跑之前问规则板（§5.8）。

### 5.6 去抖、限次与自己触发自己

- 去抖：一项收到事件后等 `debounceSeconds`（默认 30 秒），这段时间里再来的同一项事件合进同一次运行，消息里按先后列出（至多 20 个，多的写「还有 N 个」）。到点类的条目不去抖（DSH 自己把同一会话同时到期的几条合成一批，schedule:1571）。
- 限次：一项每小时至多跑 `maxPerHour` 次（默认 6；人的条目可设 1–60；第 11 项检查器不受这一条管，它的节奏由 M4 按步决定）。超了的触发记 `suppressed`（原因 `rate`），页面这一项写「一小时里触发了 N 次，后面的先不跑了」，下一个整点重新计数。默认条目被限次，说明哪里在打转，行健康 degraded。
- 不重叠：同一项正在跑或正在等投递时，新的触发只留一次待跑。
- 自己触发自己：每次运行有运行号 `r-<16 位十六进制>`。事件带 `cause`：收件箱里的事件，报事件的行把此刻的发起者一起写进去（`emitLoopEvent` 取 `agents.currentInitiator()?.id`，agent:370；不在任何 agent 的调用里时没有），循环行查这个 agent 这一回合是不是被某次运行叫起来的（§5.4 末尾）；循环行自己发现的 `main-advanced` 在主 Agent 的一回合里被发现时，同样取那一回合的运行号。一项的运行将由一个 `cause` 是同一项、且这次运行开始不到 10 分钟的事件触发时，不跑，记 `suppressed`（原因 `self-loop`），页面写「这一项触发了自己，已停下这一次」。不对整条因果链设长度上限：设计放行 → 派活 → 交回 → 派审查 → 合入 → 完整检查，本来就是一条连着的正常的链，按长度截断会截掉自动推进本身。
- 例：第 6 项「交回之后派审查」的筛选只认实现、测试、文档的交回，审查任务交回不再触发它；第 4 项的命令不合入、不改主干，不会引起 `main-advanced`。

### 5.7 漏跑与重启

| 情形 | 怎样发现 | 补法 |
| --- | --- | --- |
| DSH 任务在宿主停机时到了点 | DSH 自己：重启后每个重复任务只补最近错过的一次，一次性的照投（`dsh-schedule/README.zh.md`「概述」；schedule:590、656、687、821 的「不枚举错过的」） | 不另补；补投的提醒带 `occurrence_at`，循环行记录时标 `late` 与晚了多久 |
| 循环板自己的钟管的命令项在停机时到了点 | 起来时 `nextDue < now` | 只补一次，记 `late`；之后从现在起算下一次 |
| 收件箱里停机前没处理完的事件 | 位置之后还有行 | 按先后处理；超过 7 天的记 `expired` |
| 停机期间主干前进、文件变了、高峰变了 | 起来时与 `state.json` 里记下的值比 | 各补发一次（§3.1 最后一栏） |
| 有 `loop-fired` 没有 `loop-done` 的运行 | 起来时读记录 | 投递类按「可能已投」重投一次；命令类重跑一次，记 `late`（命令可能跑过一半：人的命令要能重跑，页面在新建表单上写这一句） |
| `state.json` 丢了或坏了 | 读不出 | 按 §8.3 重建；水位线取「现在」，这一次不补发主干与文件的事件，记一笔 `state-reset`，页面写「循环板的运行状态坏了，已重建；停机期间的事件这次没有补」 |

`host-restarted`：循环行开始跑项目时读 `state.json` 的 `host`（上一次的 `{pid, boot, startedAt, cleanExit, appStamp}`），写入这一次的，并在行卸载与宿主退出的清理里（`ctx.effect` 返回的函数）写 `cleanExit: true`。上一次存在而没有 `cleanExit` 就是 `crashed`（蓝屏、断电、被强杀；Windows 关机时 DSH 若没走到清理，也会算成这一种，页面说成「上次没有正常退出」）。`appStamp` 是 DSH 程序文件的大小与修改时间（§9.2 V6）。

### 5.8 与高峰模式、规则板

规则板管「让不让做」，循环板不另写高峰的逻辑。三处接缝：

1. 循环板跑的命令先经规则板判定：每次运行 `run` 之前调规则板的库入口 `checkCall({tool: 'pwsh', args: {command: <命令原文>}}, {project: <项目根>, glmSpend: <条目的 glmSpend，默认 none>})`（规则板 §9.4，M6 的脚本自查用的同一个入口；两者在同一个包里，直接导入 `src/rules/check.ts`）。结果：放行、只告知、只记录 → 跑；排队 → 记 `deferred`，每 5 分钟与规则板状态文件变化时再判，放行了就跑，24 小时还没放行记 `expired`；拦截 → 记 `blocked` 与规则 id，不跑，页面写「被规则『<标题>』拦下」。规则板的库导入失败或判定抛错时照常跑，记一笔 `rules-unavailable`（规则板自己的故障偏向放行，同规则板 §9.4 与 M6 §7.2）。所以人设的「代码冻结期间不跑发布命令」之类的规则也管得到循环板。
2. 高峰「不做」档：主 Agent 走 GLM（会话的 `requestHeader().config.provider` 是 GLM 的 provider，`src/shared/route.ts` 的 `sessionRoute`），此刻是高峰（`pricingService(ctx)?.peak(now)`），档位是不做（规则板的 `ProjectState.peakMode`，规则板 §3.6）时：
   - 事件类的消息不投，放进 `held`（结局 `held`），高峰结束（`peak-changed` 的 `end`）或档位改走后 1 分钟内按先后合成一条投出，第一行写 `Held during GLM peak (level stop) since <time>.`。
   - DSH 到点投来的循环板提醒挡不住（投递是 DSH 做的），循环行在那一步把 §5.4 的那一行换成 `GLM peak hours and the human chose to stop GLM work: reply in one line that this is deferred; the loop board delivers it again at <18:00>. Do not start it now.`，同时把这次运行记为 `held`，高峰结束后按上一条投一次原文。主 Agent 多花一步短回答，与规则板对「被拒之前已经发出的那一步」的说法一致（规则板 §3.6 表的最后一栏）。
   - 循环板跑命令不花 GLM 积分，档位不管它们；条目自报 `glmSpend` 的由第 1 条交给规则板判。
   - 少做与无影响：循环板照常投。少做的「少派、不起重活」由主 Agent 照每步提醒做，规则板管脚本（规则板 §3.6）。
3. 第 12 项 `glm:peak` 只记录与显示（§4.2）；高峰时段读不出时（GLM 包不在或计价服务形状不对）第 12 项不出现，第 2 条也不起作用（读不出不算高峰，同规则板「读不出是不是高峰时三档都不拦」）。

### 5.9 每次运行的记录

每次运行写两条事件，都由循环行写，模型写的不算（`metrics`）：

| 事件 | 何时 | 字段 |
| --- | --- | --- |
| `loop-fired` | 触发并通过去抖、限次之后，执行之前；被限次或自己触发自己时也写，紧跟一条 `loop-done` | `{at, project, entry, run, source: 'plugin' \| 'person', plugin?, trigger: {kind, event?, occurrenceAt?}, events: <合进来的事件个数>, cause?, late?}` |
| `loop-done` | 运行有了结局 | `{at, project, entry, run, outcome, reason?, exits?: number[], durationMs?, outputBytes?, delivery?: 'followup' \| 'inject' \| 'dsh', messageId?}` |
| `loop-entry` | 人的条目写入 | `{at, project, entry, op: 'add' \| 'edit' \| 'delete', actor, via: 'page' \| 'chat', question?}` |
| `loop-drift` | DSH 里的任务被改、被删或投不出 | `{at, project, entry, what: 'edited' \| 'deleted' \| 'not-delivered' \| 'orphan'}` |
| `loop-note` | 主 Agent 记了一次结论 | `{at, project, entry, run?, chars}` |

`outcome` 的取值：`delivered`（消息已进主 Agent 的会话）、`ran`（命令跑完，没有要交给主 Agent 的）、`reported`（命令跑完并已交给主 Agent）、`delegated`（交给规则板或 env 行执行，第 11、12 项）、`skipped`（条件不满足：已经过门禁、没有门禁工作树、主 Agent 自己走这个通道）、`suppressed`（限次、自己触发自己）、`deferred`（规则板判为排队，之后还会有一条结局）、`blocked`（规则板拦下）、`held`（没有主 Agent，或高峰不做，之后还会有一条结局）、`failed`（投不出、命令起不来）、`expired`（等太久作废）。

写到哪里：指标流水（`metrics`）的设计还没定稿；它合入之前写 `<项目目录>/runs.jsonl`（按 8 MiB 轮换），指标流水合入的那一步只改 `src/loops/metrics.ts` 一个文件，换成写指标流水（同规则板 §10.7 给 `metrics` 的约定）。页面上的「上次」从 `state.json` 的 `last` 缓存读（每项最近一次的运行号、时刻与结局），缓存坏了从记录的末尾重建。

别的行怎样记它们执行的那一份：循环行 `ctx.provide` 一个服务 `glmHournessLoops`（同本包其他行的服务写法，`docs/DESIGN.md` §2.4a 的 `ctx.provide` 一行），成员两个：`recordRun({cwd, entry, outcome, exits?, durationMs?, reason?})`（env 行给第 11 项用；循环行不在时调用方什么都不做，只少这几条记录）、`acceptProposal(request)`（§6.2 第 5 步）。规则板的第 12 项记录由循环行自己在 `peak-changed` 时写，不需要规则板调用。

结论（节点 `schedules` 正文的「每次的结论记成那一项的批注」）：主 Agent 用 `loop_note({entry, text})` 记一行（至多 500 个码点），挂在这一项最近一次投给它的运行上；存进 `notes.jsonl`（每项保留最近 20 条），页面这一项展开后列出；指标流水只记字数。

## 6. 人怎样加一项

人的条目只由人写（同 `d-rules-human-only` 的理由：条目会在人的电脑上按时跑命令、按时叫醒主 Agent）。存储的写入只有一个入口 `openLoopStore({userHome, project}).apply(actor, mutation)`（`src/loops/store.ts`），它按身份核对（§12）：`human` 能写；`harness` 只能按图上人拍过的待决写（§6.2）；`llm` 一律不能。

### 6.1 在循环板页上

- 「你加的」一组的页尾有「新建一项」，打开一张表：名字；什么时候（一次、每隔、每天、每周、cron，或「碰到某件事」时选 §3.1 里人能选的事件与筛选）；做什么（告诉主 Agent 一段话；或跑命令，写命令与「每次 / 没过时 / 结果变了时告诉主 Agent」，可加一段给主 Agent 的话）；为什么（可空）。表单只给能组合的选项：选了 cron 就只能选「告诉主 Agent」；选了跑命令，时间里没有 cron。
- 跑命令时表单上方一行灰字：「这条命令会在你的电脑上、在项目目录里按时运行，环境里没有 DSH 的凭证；它可能会被重跑一次（宿主崩溃之后），请让它能重跑。」告诉主 Agent 时写「每天大约叫醒主 Agent N 次」（按规则算：每天 1、每周 1/7、每隔 86400/秒数，cron 取接下来 7 天的次数除以 7）。
- 提交经命令 `/loops-apply`（`recordInput: false`，同 `/rules-apply` 与 `/graph-apply`：存储的变更记录已经记下这次写入，会话里只显示一行结果；commands:170、337），身份为人。结果一行中文：「已加上「<名字>」，下次 <时刻>」或「没加上：<哪一栏>：<人能照着改的说法>」。
- 自己的条目每行有「改」与「删除」。删除要再点一次确认；删除只把条目标为已删，变更记录里留着全文，页面的「最近删掉的」里保留 7 天，可以「恢复」。
- 页面不写文件（`d-ui-look-not-operate`），写都经命令；命令跑在打开这个页面的会话里，会话日志里留一行命令事件（`source` 为 `user`，commands:333–346）。
- 人在输入框里敲 `/loops`：列出这个项目的全部条目，每项一行「名字 · 什么时候 · 上次 · 下次」，再一行「在等的 N 件」（`input.hint` 写「不带参数」）。只读，加和改走页面或对话。

### 6.2 在主 Agent 的对话里

人说「每 30 分钟查一下服务器，挂了告诉我」这类话时：

1. 主 Agent 调 `loop_propose`（§6.4），参数是条目的内容与给人看的几样：`summary`（待决的题目）、`background`（两三句前因后果，`d-plain-questions`）、`plan`（按 `d-chat-not-cards` 的四行：背景、推荐、疑问、不做）。循环行校验内容（§11），不合直接返回 `invalid` 与字段路径。
2. 先提图上的待决：经图引擎以 `llm` 身份在这个项目的项目图里、主 Agent 的焦点节点下（没有焦点时在焦点所在的目标下，都没有时在第一个未关闭的目标下；同规则板 §9.3 第 2 步）提一张决定者为人的待决，正文是 `plan`、条目的人话说明（什么时候、做什么、命令原文）与末行「循环板提议 `<p-id>`」。待决的字段按当时的图引擎要求写，只经一个函数 `loopProposalQuestion(proposal)`（`src/loops/proposal.ts`）组出：`d-chat-not-cards` 之后人定的待决不再要求选项与推荐（那份决定的落地第二点，引擎改动未合入）；合入之前按今天的引擎写两项「不加」「加上」，推荐「加上」放最后，同规则板 `proposalQuestion` 的写法（规则板 §9.3）。卡片格式再变时只改这一个函数。
3. 待决提成功后，在存储里记一条 `open` 的提议（带完整内容与待决 id）。写不进时重试一次，仍失败就在工具结果里写明「图上的待决 `<id>` 已提出，循环板没有记下提议，拍板不会生效」，并在待决上批注同一句。
4. 主 Agent 在对话里按四行的格式说给人听。人同意（「可以」「加上吧」）时，主 Agent 先复述一句「那我记成：每 30 分钟跑 …，没过时告诉你」，再带人的原话调 `graph_decide` 拍这张待决。人改了内容（「改成每小时」），主 Agent 重新 `loop_propose`，旧的那张由它带原话拍「不加」。
5. 拍板之后：图工具的 `graph_decide` 与面板的 `/graph-apply` 在拍板成功之后看待决正文末行是不是循环板的提议（`proposalIdOf`），是就调循环行服务 `glmHournessLoops.acceptProposal({questionId, graphDir, cwd, by})`；循环行以 `harness` 身份按提议写入，`source` 记 `{kind: 'person', via: 'chat', relay, question}`。写入之前核对那张待决最后一次拍板的身份是 `human`，或是带原话的 `llm`；只认这两种。原话的真假：引擎只要求转述带原话（`src/graph/engine.ts` 的 `privileged`）；M3 附录 §3.6 另在主 Agent 会话的日志里核对人确实打过这句话，那一步合入后循环板的写入跟着受它保护，在那之前与规则板一样只信 `relay`。
6. 结果多写一行（`graph_decide` 给模型英文，`/graph-apply` 给人中文）：已生效、提议不在、存储正忙（一分钟内按图上的拍板补上）、写不进（页面恢复一节列出）、内容不合（引用的工具节点已删之类）、身份不对。补写：循环行每次读存储时对照 `open` 的提议引用的待决，已拍「加上」的补写，已拍「不加」的记为驳回，同规则板 §9.3 的「发现与恢复」。

为什么要图上的待决（两种做法，采用的放最后）：

1. 只在存储里记，原话写在条目上：一次写入、不碰图。代价：人在对话里同意的这件事，图上没有任何痕迹，晨报的「拍板等多久」「跟了推荐没有」也量不到它；和规则板走两条路。
2. 图上提一张人定的待决，人同意后带原话拍板，循环板照办（采用）：拍板是图上的事实，`metrics` 的人的负担四项照常算到它；与规则板的提议同一条路，主 Agent 只学一种做法。代价是多一次图写入。

### 6.3 改与删

- 页上：「改」打开同一张表，带着现值；提交时带修订号 `rev`，存储里的修订号变了返回「这一项刚被改过，请刷新后再改」。
- 对话里：`loop_propose` 的 `kind` 为 `edit`（带 `entry` 与新内容）或 `delete`（带 `entry`），走 §6.2 同一条路。
- 默认条目在两条路上都改不了：存储拒绝 `hourness:`、`glm:` 开头的 id（`forbidden`，「插件带来的条目暂时只能看」），`loop_propose` 对它们直接返回同一句。

### 6.4 agent 能做什么

| 工具 | 谁能用 | 输入 | 输出 |
| --- | --- | --- | --- |
| `loop_show` | 任何 agent | 无 | 这个项目的全部条目（默认与人的）、每项的上次与下次、在等的（`held`、`deferred`）与最近 10 次运行；不截断 |
| `loop_propose` | 只有主 Agent（`isMainAgent`，M3） | `{kind: 'add' \| 'edit' \| 'delete', entry?, body?, summary, background, plan}` | 提议 id 与图上待决的 id；内容不合时 `invalid` 与字段路径；图引擎拒绝时原样返回它的错误 |
| `loop_note` | 只有主 Agent | `{entry, text}`（`text` 1–500 个码点） | `{entry, run}`；这一项没有投给主 Agent 的运行时 `invalid`（「这一项还没有交给你的运行」） |

- 名字登记在 `src/shared/tool-names.ts` 的新常量 `LOOP_TOOL_NAMES`，契约测试核对循环行注册的与它相等。在 GLM 路由上延迟加载，不进常驻名单（同规则板的两个工具）；`loop_note` 的用法写在默认条目的消息里，模型读到消息时才需要它。
- `loop_propose` 是叫模型写给人看的话的地方之一（`d-plain-questions`），说明末尾原样带 M3 附录的 `PLAIN_QUESTION_GUIDE`（`src/graph/plain-question.ts`），前面一句英文「summary, background and plan are read by the human: write them as the guide below says, and present the plan in the chat in the four-line form before you call graph_decide」。
- agent 没有写条目的工具；`loop_propose` 只在图上提待决、在存储里记提议，不生效。

### 6.5 以后放开默认条目时要改的地方

人说的是「先暂时」。放开时：存储加一种覆盖记录 `{entry: 'hourness:…', override: {when?, action?, disabled?}}`，只有人能写；页面在默认条目上加「改」「停用」，停用时写明停了会怎样（例如停了第 6 项，交回之后没人提醒主 Agent 派审查）；插件更新时代码表里的默认条目变了，覆盖记录照旧生效，页面写「插件更新了这一项的默认值，你的改动仍在」。存储格式今天就留着 `override` 这个字段名不用，不另做迁移。

## 7. 面板

### 7.1 位置

按 plain-ui 设计 §7.6：循环板是第 2 层的一页，和规则板、经验板一样从首页页脚进入。页脚改为「规则 › 循环 › 经验 › 整张图 › 上手说明 ›」。板块登记表 `ui/src/graph/boards.ts` 的 `Board.id` 加 `'loops'`（§16）：

- `label`：「循环」。
- `available(sessionId)`：投影 `hournessLoops`（§7.4）在这个会话上有值且 `projectKey` 不为空。
- `homeLine(sessionId)`：只在有事要人看时给一行（§7.3），没有时为空。
- `Page`：`ui/src/loops/LoopsPage.tsx`。

右侧栏 DSH 自带的「自动化任务」页照样在，循环板建的任务也出现在那里（标题以「循环板 · 」开头）。循环板页的页头一行灰字：「DSH 的自动化任务页里也看得到到点的这几项；要改请在这里改。」

### 7.2 页面（`mockup-loops.svg`）

自上而下：

1. 页头：「循环板：到点或碰到某件事就去做的事」；下面一行「主 Agent 在会话「<标题>」」（点开跳到那个会话，同 plain-ui「点开跳到主 Agent 的对话」），没有主 Agent 时「还没有主 Agent：在一个会话里发 /wish，到点的几项才会开始」。
2. 要你看一眼的（只在有时出现）：连着失败的、被限次的、被规则拦下的、DSH 里的提醒被改过或没了的、在等高峰结束的、存档重建过的，每件一行，带「讲细点」。
3. 编排层带的 · 11（组名后小字「插件带来的，暂时只能看」）：每项一行名字，一行「什么时候 · 做什么」，一行「上次 10 月 30 日 08:30 · 已交给主 Agent · 下次 10 月 31 日 08:30」；告诉主 Agent 的写「每天大约叫醒主 Agent N 次」。第 11 项展开是每个批过的工具节点一行（「ESLint：改了 .ts、.js 之后跑」），写「检查命令来自你批准的工具节点」。没有按钮。依赖没装上的（例如 M7 执行行没启用）这一项灰显，写「<哪一块> 没启用，这一项现在不跑」。
4. GLM 插件带的 · 3：同上。第 12 项写「此刻：不是高峰；下一个高峰 明天 14:00 · 你选的：少做（在规则板改）」，「规则板」可点。
5. 你加的 · N：同上，每行右边「改」「删除」；页尾「新建一项」。最近删掉的折在下面。
6. 主 Agent 自己设的提醒（DSH 自带）· N：只读，标题与下次，「在 DSH 的自动化任务页里管理」。
7. 最近跑过的：最近 20 次运行，每次一行「时刻 · 名字 · 结局的人话」；点开是那次的触发、合进来的事件个数、用时、退出码、日志路径与主 Agent 记的结论。
8. 循环板自己的规矩（折起）：「同一项 30 秒内的事件合成一次；每项每小时至多 6 次；一项触发了自己时停下那一次；命令默认 60 秒超时、只给最少的环境变量；给主 Agent 的输出先遮住密钥形状的字串。」

每项点开（讲细点）：为什么有它、触发的原文（cron 表达式、事件与筛选）、给主 Agent 的英文原文或命令原文、最近 5 次运行与主 Agent 记的最近 3 条结论、id（小字）。

### 7.3 首页的一行与上手页

- 首页「现在」一节的循环板一行（`homeLine`），按顺序取第一个成立的：「GLM 登录过期了：在输入框里打 /glm-login」（第 14 项因主 Agent 自己走 GLM 而没投时）；「循环板：「<名字>」连着 3 次没过」；「循环板：N 项在等高峰结束」；「循环板：DSH 里的提醒被改过，已改回」（当天）。都不成立时不显示。点了打开循环板。
- 上手页（plain-ui §7.4 第 4 块，规则那一块）之后加一句：「循环：到点或碰到某件事就去做的事。出厂带晨报、周报、夜间巡检，合进主干之后的检查，交回之后提醒派审查这些；你也可以自己加，例如服务器巡查。」字句由本稿提供，经板块登记表给上手页（同规则板给第 4 块的做法）。

### 7.4 数据怎样到页面

- 投影 `hournessLoops`（`sessionProjections.register`，session-projection:68）的 `init(header)` 按会话头的 `cwd` 算出项目键与几个文件的绝对路径 `{projectKey, viewFile, entriesFile}`；会话没有 `cwd` 时 `{projectKey: null}`，页面写「这个会话没有工作目录，没有循环板」。
- 跑这个项目的宿主把页面要显示的东西写成一份 `view.json`（§8.1，由存储、`state.json`、记录末尾与 `schedule.catalog()` 推出，内容变化时写，至多每 2 秒一次，临时文件加改名）。页面经 `remote.workspaceFiles.readBytes` 按绝对路径读，经 `changes` 监视（与规则页同一种读法，规则板 §9.1；`dsh-api-workspace-files/README.md`:40、58），页面可见时另每 15 秒按大小与修改时间重读一次（改名替换之后监视还报不报变化没核对，规则板的 V4）。
- 页面不调 DSH 的 `schedule` Remote：第三方客户端能不能用它没有核对，`view.json` 里已经有页面要的全部内容。

### 7.5 页上的字

设计里的词在页上换成人话（`d-plain-questions`）：条目 →「一项」；触发 →「什么时候」；动作 →「做什么」；来源 →「谁带来的」；运行 →「这一次」；结局按 §5.9 的表换成「已交给主 Agent」「跑完了，没事」「跑完了，已告诉主 Agent」「交给规则板」「这次不用跑」「次数太多，先停」「在等规则放行」「被规则拦下」「先存着」「没成功」「放太久，作废了」；快照 →「存档」；流水 →「变更记录」；门禁 →「合入前的检查」；标定 →「练习题」。事件的 id、条目 id 只作小字。L2 对全部固定字串跑 `plainWordsIn`（验收第 19 条）。

## 8. 存储与恢复

### 8.1 文件

```
<userHome>/loops/                         userHome = glmHournessData.userHome（默认 C:\Users\29596\.dsh\glm-hourness）
  projects/<key>/                         key 同规则板 §7.3
    project.json                          项目键对应的工作区根（显示用）
    entries.json                          人的条目与提议的快照（由 journal 推出）
    journal.jsonl                         人的条目与提议的变更记录（事实源，只追加）
    entries.lock                          写锁（存储与收件箱共用）
    events.jsonl                          项目收件箱（§5.3），events-<时刻>.jsonl 为轮换下来的
    state.json                            运行状态：bindings、水位线、held、待跑、host、last（可重建的缓存）
    runner.lock                           运行锁（§5.1）
    runs.jsonl                            运行记录（指标流水合入之前，§5.9）
    notes.jsonl                           主 Agent 记的结论
    view.json                             给页面的一份（§7.4）
    logs/<entry>/<时刻>.log                命令输出（§5.5）
```

默认条目不在任何文件里：它们是代码表，每次读时与人的条目合在一起。用户级目录只从数据目录服务取（`docs/DESIGN.md` §2.4）；数据行不在时循环板没有存储，页面写「没有用户级目录：循环板不可用」，行健康 inactive。探针的每个场景把数据目录行指向场景自己的目录（`docs/DEVELOPMENT.md` §3），场景里的循环板与真实的互不影响。放在用户级目录、按项目分，而不是工作区里或入库，理由同规则板 §7.1 的第 3 种做法：不往项目的工作树里写，运行状态不给 git 历史添噪声。

### 8.2 写入

1. 校验请求结构（§11）与身份（§12），不合返回 `invalid` 或 `forbidden`。
2. 取写锁：以 `wx` 创建 `entries.lock`，内容 `{pid, startedAt, token}`；已存在且持有者 pid 不在、或已存在超过 10 秒，删掉重取；否则每 25 毫秒重试，2 秒内取不到返回 `busy`。做法同规则板 §7.4 第 2 步。
3. 读最新状态；带 `rev` 的写入核对修订号，不等返回 `stale_revision`。
4. 追加一条变更记录并 `fsync`：`{seq, at, actor, op, id, before, after, relay?, question?, via}`。每条都带这一项写后的全文 `after`（删除时 `after.status` 为 `deleted`），所以重放不需要上一条也能得到这一项的状态。
5. 写快照：`entries.json.<随机串>.tmp`、`fsync`、改名覆盖；Windows 上改名遇到 `EPERM`、`EBUSY` 按 20、40、80、160、320 毫秒重试 5 次，仍失败就留着临时文件，下一次读时按记录补上（同规则板 §7.4 第 7 步）。
6. 释放锁；发一次对账（§5.2）与 `view.json` 重写。

人的条目一个项目至多 50 项（`invalid`：「已经有 50 项了，先删掉不用的」）。

### 8.3 读与恢复

| 读到的情况 | 处理 | 页面与行健康 |
| --- | --- | --- |
| 快照有效且 `seq` 等于记录最后一条 | 用快照 | 无 |
| 快照落后于记录（改名失败过） | 从快照的 `seq` 之后按记录补上，写新快照 | 无（日志 info） |
| 快照为空、全零、截断或解析不了 | 从头按记录重放，写新快照 | 「循环板的存档坏了，已按变更记录重建」 |
| 记录最后一行没有以换行结尾 | 把这一行的字节存进 `.journal.corrupt-<时刻>`，截掉，再按上面判断 | 「变更记录的最后一条没写完，已丢掉」 |
| 记录中间有读不出的行 | 跳过它，继续往后读；因为每条带全文，后面同一项的记录照样生效，只丢那一次的版本；整份复制到 `.journal.corrupt-<时刻>` | 「变更记录第 N 行读不出，已跳过；涉及的那一项按之后的记录显示」，行健康 degraded，直到人在页上点「知道了」（`recovery-dismiss`，进记录） |
| `state.json` 读不出 | 重建：`bindings` 从 `schedule.catalog()` 按提示文字的第一行认回；水位线取现在（不补发）；`last` 从运行记录末尾取；`held` 与待投的消息正文只存在 `state.json` 里，丢了就丢了：运行记录里有 `loop-fired`、没有 `loop-done` 的那些运行各补一条结局 `expired`（原因 `state-lost`） | 「循环板的运行状态坏了，已重建；停机期间的事件这次没有补，先存着的 N 条消息丢了」，列出这 N 项的名字 |
| 两个文件都不在 | 空 | 无 |

人的条目的事实源只有 `journal.jsonl`；`state.json` 里的东西都是可以重新推出或可以丢的，丢的时候有记录（`expired`、`state-lost`）。`state.json` 的写法同快照（临时文件、`fsync`、改名），在 `entries.lock` 之外由运行锁的持有者一个进程写，不会有两个写者。

## 9. 宿主契约与 rc.3 证据

### 9.1 用到的钩子、服务成员与载荷字段

「已用」指本包已在用，`docs/DESIGN.md` §2.4a 有证据；「新用」指循环行第一次用，实现时补进接口对照表与薄适配层 `src/shared/dsh-min.ts`。文件都在 `reference/dsh-desktop-0.2.1-rc.3/` 下。

| 接口 | 用在哪 | 证据 | 结论 |
| --- | --- | --- | --- |
| 服务 `schedule`（`ScheduleService`，服务名在构造里给出） | 绑定与对账（§5.2） | schedule:1992 `super(ctx, "schedule")`；`dsh-tool-schedule` 用 `ctx.schedule`，tool-schedule:540；Web 组合挂载，web-app `cordis.patch.yml`:139–140 | 新用〔实读〕；经 `ctx.get('schedule')` 取，不写进 `inject`（headless 没有它） |
| `schedule.create(sessionId, request, signal?)`：`title` 必填、去空白后 1–120 字符；`prompt` 非空；六个选择器恰好一个；返回存下的记录 | 建任务 | schedule:2083–2112；标题上限 schedule:23；`every_seconds` 至少 60，schedule:21；建完 `emitChanged` 与 `requestDrive`，schedule:2110–2111 | 新用〔实读〕 |
| 选择器形状：`daily {time, time_zone}`、`weekly {time, time_zone, weekdays}`、`cron {expression, time_zone}`、`every_seconds`、`at`；键多一个少一个都拒 | 映射（§2.2） | `dsh-schedule/README.zh.md`「使用此包」的表；M7 设计 §3.11.1 已核对 schedule:1052–1059、1118–1130、333–335、394–405 | 新用〔实读，沿用 M7 的核对〕 |
| `schedule.catalog()`：全部任务，每条是记录加 `sessionId`、`status`、`lastDelivery?`，按 `scheduledAt` 排序 | 对账、页面、主 Agent 自己设的提醒 | schedule:2129–2137；记录字段 `id`、`kind`、`title`、`prompt`、`scheduledAt`，按种类另有 `everySeconds`、`time`、`timeZone`、`weekdays`、`expression`（`dsh-schedule/README.zh.md`「管理调用后的工具结果」） | 新用〔实读〕 |
| `schedule.delete({sessionId, id}, signal?)` → `{id, deleted, code?}`；硬删除，连发送记录 | 搬任务、删条目、清孤儿 | schedule:2164–2183 | 新用〔实读〕 |
| `schedule.update({sessionId, id, expected, title?, prompt?, change?})`：完整记录的比较与写入；`schedule_not_found`、`schedule_ended`、`schedule_conflict`；规范化后等价的不写 | 改回被人改过的任务 | schedule:2197–2222；无变化的语义见 `dsh-schedule/README.zh.md`「使用此包」末段 | 新用〔实读〕 |
| 子会话的拒绝 `subagent_session` | 只记错误 | schedule:2244–2262 | 〔实读〕 |
| 事件 `schedule/changed`：任务写入提交之后发，没有载荷，监听抛错被吞 | 触发对账 | schedule:2231–2237 | 新用；本行的 `ctx.on('schedule/changed')` 收不收得到〔未核实，V2〕；收不到时每 60 秒一拍的对账照样做 |
| 投递：`sessionController.resolveAgent(sessionId)` 恢复冷会话；`createUserMessage({content, source: {kind: 'schedule'}})`；`agent.followup(message)`；`sessions.flush(session)` 返回假即失败；失败只记日志，不自动重试；同一会话同时到期的重复任务合成一批 | 理解 DSH 的投递、在主 Agent 那一步认出循环板的提醒 | schedule:1576–1598、1626–1640、1571 | 〔实读〕 |
| 提醒正文：`[SCHEDULE REMINDER]`、`This is a scheduled message from the user`、`schedule_id_json`、`occurrence_at`、`reminder_prompt_json`；批次 `[SCHEDULE REMINDER BATCH]` 与 `reminders_json`（每项 `schedule_id`、`occurrence_at`、`reminder_prompt`） | 认出循环板的提醒（§5.4） | schedule:1386–1418 | 〔实读〕 |
| 重启后每个重复任务只补最近错过的一次 | 漏跑（§5.7） | schedule:590、656、687、821；`dsh-schedule/README.zh.md`「概述」 | 〔实读〕 |
| 会话归档时删掉这个会话的全部活动任务 | 对账的例外（§5.2） | schedule:2044–2059、2273–2297 | 〔实读〕 |
| `sessionController.resolveAgent(sessionId)` → `{agent}` 或 `{error}` | 恢复冷的主 Agent 会话来投递（§5.4） | api-session-controller:3037–3039，服务名 api-session-controller:2952 | 新用；从本行调用的效果〔未核实，V3〕 |
| `agents.get(id)`、`agents.withoutInitiator(op)`、`agents.currentInitiator()` | 投递、因果 | agent:596、414、370 | `get` 已用；`withoutInitiator` 新用〔实读，DSH 定时服务的同一用法 schedule:1531〕；`currentInitiator` 新用，读的是异步上下文里的发起 agent（`initiators.getStore()`，agent:370–373）〔实读〕；它先调 `assertInitiatorsReadable`，抛错时 `emitLoopEvent` 不带 `cause`，自己触发自己只靠限次兜住 |
| `agent/created`（serial，`{agent, source, signal?}`） | 开始跑项目、投存着的消息、搬任务 | agent:581–585 | 已用 |
| 活 agent 的 `status`、`followup`、`inject` | 投递（§5.4） | agent-loop:790–793、800–815 | 已用（graph-panel 的 `/graph-run`） |
| 收件箱的领取：下一回合领走下一步队列的全部与下一回合队列的一条 | 理解 `inject` 在空闲时何时被读到 | agent-loop:101–110 | 〔实读〕 |
| `agent/pre-step`（waterfall，`{agent, messages, turn, step, signal}`） | 在主 Agent 领到循环板提醒的那一步加一行（§5.4、§5.8） | agent-loop:901–925；经公共库的 `installStepNotice` | 已用 |
| 会话头 `cwd`、`requestHeader().config.provider` | 项目键、主 Agent 走不走 GLM | session:1820–1826、1612 | 已用（guard、`sessionRoute`） |
| `sessions.flush(session)` | 投递后确认落盘 | session:1951；schedule:1598 同一用法 | 新用〔实读〕 |
| `tools/pre-execute`（waterfall，`(exec, next)`）；`exec.name`、`exec.arguments`、`exec.agent` | 规则 `loops:schedule-tools` | tools:3320–3345、3229–3260 | 已用（guard 框架） |
| 工具 `schedule_delete {id}`、`schedule_update {id, …}` 只作用于调用方会话 | 规则 `loops:schedule-tools` 的判定 | tool-schedule:570–600、604–650 | 〔实读〕 |
| `commands.register`；`recordInput: false` 时命令事件不记参数 | `/loops-apply`、`/loops` | commands:266、170、337 | 已用 |
| `tools.register` | `loop_show`、`loop_propose`、`loop_note` | tools:2974–2984 | 已用 |
| `sessionProjections.register` 与 `init(header)` | 投影 `hournessLoops` | session-projection:68；规则板 §9.1 引的 67–91 | 已用 |
| 客户端 `remote.workspaceFiles.readBytes` 与 `changes` | 页面读 `view.json` | `dsh-api-workspace-files/README.md`:40、58（规则板 §9.1 已引） | 规则板新用，循环板照用 |
| Web 组合的 preset 挂载 `dsh-tool-schedule` 与 `dsh-time-context` | 主 Agent 自己设的提醒；时钟 | web-app `presets/cordis.patch.yml`:22–23、38–39 | 〔实读〕 |

不用的：自定义 Remote 服务与新的 waterfall（第三方做不到，`docs/DEVELOPMENT.md` §5 第 6 条）；`agent/pre-step` 的 `reject` 与改动领走的消息（会丢消息，§5.2 第 1 种做法）；DSH 的 `schedule` Remote（客户端，§7.4）。

### 9.2 未核实与验证方式

| # | 什么 | 怎样验 | 不成立时 |
| --- | --- | --- | --- |
| V1 | 本行经 `ctx.get('schedule')` 拿到的就是 `ScheduleService`，`create`、`catalog`、`delete`、`update` 可调 | L3：探针覆盖层挂 Web 组合的 `schedule` 与 `session-controller` 行（沙盒模板没有它们，场景照 guard 影子场景的做法加） | 循环行到点的条目不跑，行健康 degraded「拿不到 DSH 定时服务」；事件条目照常 |
| V2 | `ctx.on('schedule/changed')` 在本行收得到 | L3 同上 | 只靠 60 秒一拍的对账，验收第 5 条的 60 秒仍成立 |
| V3 | 本行调 `sessionController.resolveAgent` 能恢复冷的主 Agent 会话，恢复出的 agent 投 `followup` 后照常开一回合 | L3（冷会话的场景：建会话、释放、再投） | 冷会话只等它下一次 `agent/created` 再投（同 `wake: false`），页面写「主 Agent 的会话没打开，打开后才收到」 |
| V4 | 主 Agent 换会话后旧会话的任务删掉、新会话的任务到点照常投 | L3（`/wish here` 的场景，平移时钟） | 对账照样按 catalog 修正，验收第 4 条改为 L4 |
| V5 | 宿主被强杀后 `cleanExit` 缺失、正常退出时写下 | L4（任务管理器结束进程；正常退出） | `crashed` 只按开机时刻判（只认重启电脑） |
| V6 | DSH 程序文件的位置：Electron node 模式下 `process.resourcesPath` 有没有值；没有时用 `path.dirname(process.execPath)` 下的 `resources/app.asar` | L4（桌面版里打一行日志） | `appChanged` 恒为假，页面在「DSH 更新之后」这类条目旁写「看不出 DSH 有没有更新」 |
| V7 | Windows 上两个进程在同一把 `entries.lock` 下追加收件箱不丢行 | L2（两个 Node 子进程各写 200 行，同规则板 §14 的做法） | 改为每个进程写自己的收件箱文件 `events-<pid>.jsonl`，读的一方合并 |
| V8 | 主 Agent 在高峰不做时读到 §5.8 的那一行就只回一行 | L3（脚本 provider 不能证明，靠 L4 看一次真实回复） | 多花的是一回合，档位与等待单仍由规则板管；记进 dogfood 的复盘 |
| V9 | ZCode 桌面版自己会不会定时读额度、隔多久 | 读 3.17.1 桌面壳的额度提供者（M6 §4.1 读过 3.16.3 的取数，没写调度） | 不加定时读取（今天的设计） |
| V10 | 主 Agent 有 active 的 goal 时，`inject` 进去的消息不被 goal-round-driver 当作竞争输入（规则板 V3 的同一件事） | 随规则板 V3 的 L3 | 改为等这一轮结束、agent 空闲时再 `inject` |
| V11 | DSH 到点投来的提醒（`followup`）在主 Agent 正由 goal 驱动时进来，驱动器把它当竞争输入作废这一轮的预约（goal-round-driver:249）之后，处理完提醒是否照常开下一轮 | L3（goal 驱动中投一条到点提醒） | 循环行在那一步的那一行末尾加 `When this is done, continue the goal you were driving.`；仍停住时记进 dogfood 的复盘，并把这一点报给 M7 的驱动设计 |

## 10. 失败与降级

### 10.1 激活期（`apply` 不抛错）

| 情况 | 处理 | 上报 |
| --- | --- | --- |
| 没有数据目录服务 | 不注册投影与命令；工具注册，调用时返回「循环板不可用：没有用户级目录」 | 行健康 inactive |
| 没有 `sessionController` | 不跑条目，只注册工具、命令与投影 | info「这个进程不跑循环板（没有会话控制器）」；headless、探针与标定里本来如此，不算降级 |
| 有 `sessionController`，没有 `schedule` | 跑事件条目与命令条目；到点告诉主 Agent 的几项不建任务 | degraded「没有 DSH 定时服务：到点的条目不跑，事件条目照常」 |
| 工具或命令注册失败 | 撤掉本行全部注册 | inactive，写原因 |
| GLM 包的契约服务形状不对 | 不显示 GLM 一组 | degraded，一次 |

### 10.2 运行期

| 操作 | 失败的情形 | 可恢复吗 | 调用方得到什么 | 怎样发现与留痕 |
| --- | --- | --- | --- | --- |
| 存储写入（`/loops-apply`、`acceptProposal`） | 取不到锁 | 是 | `busy`：「循环板正忙，没记上，再点一次」；`acceptProposal` 下一次读时按图补写 | 不记（没有写成） |
| 同上 | 修订号变了 | 是 | `stale_revision`：「这一项刚被改过，请刷新后再改」 | 不记 |
| 同上 | 内容不合、身份不对 | 是（改了再提） | `invalid`（字段路径与人话）、`forbidden` | 不记 |
| 同上 | 写不进文件 | 视磁盘 | `io`：「写不进文件：<原因>」 | 行健康 degraded；宿主日志 warn |
| 建、改、删 DSH 任务 | `ScheduleInputError`（内容不合） | 否（等条目或主 Agent 变化） | 这一项标「DSH 不收这个时间：<信息>」 | `loop-drift`；行健康 degraded |
| 同上 | 存储失败（DSH 拒绝 promise） | 是 | — | 下一拍重试，连续失败按 1、2、5、10 分钟退避；宿主日志 warn |
| 同上 | `schedule_conflict` | 是 | — | 重读 catalog 再试一次，仍冲突就删掉重建 |
| DSH 到点没投出 | 过了 5 分钟 `lastDelivery` 没变 | 是 | — | `failed` 一次，删掉重建，循环行补投（§5.2） |
| 投给主 Agent | 没有主 Agent | 是 | — | `held`；24 小时后 `expired`；页面写原因 |
| 同上 | 恢复会话失败、`flush` 为假、抛错 | 是 | — | 1、5、15 分钟重试；仍失败 `failed`，行健康 degraded |
| 跑命令 | 起不来（找不到程序） | 是（人改命令） | 按 `report`：没过算一次失败，交给主 Agent 的写「没跑起来：<原因>」 | `loop-done` `reported` 或 `ran`，`reason: 'spawn'` |
| 同上 | 超时 | 是 | 同上，写「超过 <秒> 秒，已结束」 | 进程树被结束；`reason: 'timeout'` |
| 同上 | 退出码非 0 | — | 这是结果不是故障，按 `report` 交 | `exits` |
| 同上 | 日志写不进 | 是 | 结果里写「没有日志」 | 宿主日志 warn |
| 问规则板 | 排队 | 是 | — | `deferred`，24 小时后 `expired` |
| 同上 | 拦截 | 否（人改规则） | — | `blocked` 与规则 id；页面「要你看一眼」 |
| 同上 | 规则板读不了 | — | 照常跑 | `rules-unavailable` |
| 报事件（`emitLoopEvent`） | 取不到锁、写不进 | 否（这一次） | `false` | 调用方行健康 degraded；事实在图上，晨报的例外一节照常推出 |
| 读收件箱 | 一行读不懂 | — | 跳过 | 计数进页面「最近跑过的」末尾一行与行健康 |
| 运行锁 | 别的活进程持有 | — | 本进程只显示 | 页面一行，行健康 info |
| 同上 | 旧锁的进程不在或开机时刻不同 | 是 | 接手 | 改名的旧锁留着 |
| 主干与文件的观察 | `git` 超时或报错 | 是 | 这一拍不判 | 连续 10 次失败行健康 degraded「看不到主干」 |
| 时钟回拨或跳变 | 下一次的时刻算错 | 是 | 每一拍按当前时钟重算 | 无 |
| 限次、自己触发自己 | 触发太多 | 是（下个整点） | — | `suppressed`；默认条目被限次时行健康 degraded |
| `loop_note` | 不是主 Agent、条目没有交给它的运行 | 是 | `forbidden`、`invalid` | 不记 |

### 10.3 不可逆的地方与预防

| 动作 | 不可逆在哪 | 预防 |
| --- | --- | --- |
| 删 DSH 任务 | 连发送记录一起删掉（schedule:2164–2183） | 只删 `bindings` 里循环板自己建的、或提示文字以 `Loop board: ` 开头的；循环板自己的运行记录另存，不依赖 DSH 的发送记录 |
| 人删自己的条目 | 条目不再跑 | 只标为已删，变更记录留全文，7 天内可以恢复 |
| 跑人写的命令 | 命令自己可能有副作用 | 只跑人写的或人批过的命令；最少的环境变量；先问规则板；表单上写明会按时跑、可能重跑一次 |
| 合进主干之后的完整检查 | M7 门禁工作树里的 `reset --hard`、`clean -fd` | 只在 M7 的门禁工作树里、经 M7 的锁与目录核对（M7 §3.8.3 第 5 步），循环板不自己做 git 写操作 |

## 11. 外部输入的校验

| 输入 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `title` | 是 | 1–40 个码点，不含换行，去首尾空白 | `invalid`，`title` |
| `why` | 否 | 至多 150 个码点，不含换行 | `invalid`，`why` |
| `when.kind` 为 `once` | — | `at` 是带时区的 ISO 8601，严格晚于现在，至多一年后 | `invalid`，`when.at` |
| `every` | — | 正整数秒；告诉主 Agent 600–31,536,000；跑命令 300–31,536,000 | `invalid`，`when.seconds`，写下限与理由 |
| `daily`、`weekly` | — | `time` 为 `HH:MM`（00:00–23:59）；`timeZone` 经 `Intl.DateTimeFormat` 能构造；`weekdays` 为 1–7 的不重复整数，非空 | `invalid`，字段路径 |
| `cron` | — | 只用于告诉主 Agent；恰好 5 个以空白分隔的字段，总长至多 100；其余由 DSH 校验，DSH 返回的 `invalid_rule` 信息原样给人 | `invalid`，`when.expression` |
| `event` | — | 在 §3.1 的表里，且是人能选的（不是 `files-edited`、`peak-changed`）；筛选的键与类型按 §3.2；`file-changed` 的 `path` 是存在的目录下的绝对路径，一个项目至多 20 个 | `invalid`，`when.event` 或 `when.filter.<键>` |
| `action.text`（告诉主 Agent） | 是 | 1–2000 个码点 | `invalid`，`action.text` |
| `action.commands`（`argv`） | 是 | 1–8 条命令，每条 1–32 项，每项 1–1000 个码点，不含换行与 NUL | `invalid`，`action.commands[i][j]` |
| `action.commands`（`norm`） | — | 只能是 `norm-merge-gate`；人的条目不能用（它只给第 4 项） | `invalid` |
| `action.report` | 是 | 三者之一 | `invalid` |
| `action.note` | 否 | 至多 500 个码点 | `invalid` |
| `action.timeoutSeconds` | 否 | 5–1800 的整数 | `invalid` |
| `action.glmSpend` | 否 | `none`、`optional`、`necessary` | `invalid` |
| `limits` | 否 | §2.1 的范围 | `invalid` |
| `loop_propose` 的 `summary`、`background`、`plan` | 是 | `summary` 至多 40 个码点；`background` 至多 150、不含换行（plain-ui `PLAIN_LIMITS.background`）；`plan` 四行，以「背景」「推荐」「疑问」「不做」开头，每行至多 60 个码点 | `invalid`，字段路径；图引擎的写法检查原样转给模型 |
| `loop_note.text` | 是 | 1–500 个码点 | `invalid` |
| GLM 包提供的默认条目 | — | 整份按上面校验，事件只能是 `quota-read`、`login-lost`、`peak-changed` | 那一项不显示，行健康 degraded |
| 收件箱的一行 | — | 能解析为对象，`event` 在表里，载荷字段的类型对 | 跳过，计数 |
| `checkCall` 的结果 | — | 按规则板 §9.4 的类型 | 当作放行，记 `rules-unavailable` |

## 12. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 人的条目只由人写（人直接写，或 harness 照人拍过的待决写） | 存储的 `apply`（`src/loops/store.ts`） | 页面、命令、工具与补写都经它，只在一处核对 |
| 默认条目不能被改、停、删 | 默认条目不进存储；存储拒绝插件前缀的 id | 没有可改的数据，也就改不了 |
| 命令只能是人写的或人批过的 | 存储的校验（只有人能写 `argv`）与执行器（`norm` 只读已批准的规范节点） | 执行器不接受别处来的命令 |
| 一个项目同一时刻只有一个进程跑循环板 | 运行锁 | 两个宿主同时投就会重复叫醒主 Agent |
| 每次运行都有记录 | 执行器的 `recordRun`：执行前写 `loop-fired`，结局写 `loop-done` | 一个函数，所有执行者都调它 |
| agent 不能经 DSH 工具改循环板的任务 | guard 框架上的规则 `loops:schedule-tools` | 在执行边界拦，模型绕不过；页面上的改回是兜底 |
| 给模型的命令输出不带密钥形状的字串 | 结果格式化函数（`formatRunResult`） | 交给主 Agent 只有这一条路 |
| 高峰不做时不叫醒走 GLM 的主 Agent | 投递函数（`deliver.ts`） | 事件类的消息都经它；DSH 的投递由那一步的提醒兜住 |
| DSH 任务的内容以循环板为准 | 对账（`bind.ts`） | DSH 任务页能改，只能事后改回 |

## 13. 隐私

- 记什么：指标流水与运行记录只有 id、时刻、结局、退出码、用时与字节数，不记命令输出、消息正文与人的原话（`metrics`：只记数与引用）。
- 原话：人在对话里同意加的那句话存在条目的 `source.relay` 与图上的待决里，同图上别的转述。
- 命令输出：完整的在用户级目录的日志里（不在项目工作树、不进 git），保留 7 天或最近 50 份；给模型的至多 40 行，先遮住密钥形状的字串。页面只显示日志路径，点开由人自己打开文件。
- 环境：人写的命令拿不到 DSH 宿主的环境变量（§5.5），所以拿不到通道的凭证。
- 本仓库的条目里写了本机路径（`C:\Program Files\ZCode\...`），它们只在用户级目录里，不进仓库。
- 页面与 `view.json` 不包含 `held` 消息的正文以外的对话内容；`held` 正文是循环板自己写的英文消息。

## 14. 可测性

- L2，纯函数：`trigger.ts` 的下一次时刻（每天、每周在 `Asia/Shanghai` 与一个有夏令时的时区里，缺的钟点跳过、重叠取较早；每隔；一次）；事件筛选（`paths` 的三种写法、`skipIfGated` 用造的 `result.json`）；去抖与合并；限次；自己触发自己；`report` 的三种；默认条目表的合法性（每项的事件在表里、筛选合法、文字长度、页面说法过 `plainWordsIn`）；`formatRunResult` 与脱敏；`loopProposalQuestion` 组出的待决交给临时目录里的真实图引擎被接受；页面的视图模型（每组、每种结局的说法、「每天大约叫醒 N 次」）。
- L2，存储：用真实的临时目录（同规则板 §14）：清零的快照、截断的记录、中间坏一行、锁残留、改名失败（注入的 `rename` 模拟 `EPERM`）、两个子进程同时追加收件箱（V7）。
- L2，假宿主（`tests/fake-rc3.ts`）补这些 rc.3 的信号：`schedule` 服务（`create`、`catalog`、`delete`、`update` 的形状与 `schedule/changed`，以及「到点」时按 schedule:1576–1598 的样子往会话里投一条来源 `schedule` 的消息）；`sessionController.resolveAgent`；活 agent 的 `followup`、`inject` 记下消息与 `status`；`agents.currentInitiator`；计价服务的 `peak`；GLM 契约服务的推送。用注入的时钟测高峰攒着与高峰后投出、停机补跑。
- L3（`npm run probe` 新场景 `loops`）：真实宿主组合里绑任务、到点投递到主 Agent 会话（平移时钟）、`schedule/changed` 的收到与否、冷会话的恢复、`/wish here` 后搬任务、`loops:schedule-tools` 拦 `schedule_delete`、收件箱事件到消息、命令项的跑与报。
- L4（批次）：页面（三组、你加的、新建表单、首页一行）、DSH 自动化任务页里看到「循环板 · 」的任务并在那里改一次看改回、宿主强杀与正常退出、`appChanged`、真实的晨报在 08:30 出现在主 Agent 的窗口。

## 15. 实施分解

开工条件：本稿过独立评审，写一页人话放行稿，人放行（`d-design-onepage`）。分支 `loops`，工作树 `.worktrees/loops`，从当时的 main 建。每步一个提交，文档与代码同一批。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰运行时的步另跑 `npm run probe`。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `loops`，`rows` 加 `{id: 'glm-hourness/loops', module: 'loops/index'}`；`packages/hourness/cordis.patch.yml` 里本行排在 `rules` 之后、`ui` 之前，`disabled: true`；`src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `loops`。

步的编号用 S，免得和验证的层级 L2、L3、L4 混在一起。

| 步 | 内容 | 依赖 | 验证 |
| --- | --- | --- | --- |
| S1 | `src/shared/loop-model.ts`、`src/shared/channel-loop.ts`、`src/loops/model.ts`、`trigger.ts`、`events.ts`、`defaults.ts`（编排层 11 项）；校验 | 无 | L2 |
| S2 | 存储 `store.ts`（锁、记录、快照、恢复）、`/loops-apply`、`/loops show`；投影 `hournessLoops`；`view.json` | S1 | L2 |
| S3 | 运行锁、拍、`host-restarted`、`main-advanced`、`file-changed`、`waiting-on-human`、`peak-changed`；收件箱与 `emitLoopEvent`；命令执行器（`command.ts`，规则板 R6 先合入就用它的）；问规则板；`recordRun` 与 `runs.jsonl` | S2；规则板 R3（`checkCall`）合入，否则「问规则板」一步按 `rules-unavailable` 走，规则板合入的那一步补上 | L2、L3 |
| S4 | `bind.ts`（建、搬、改回、孤儿）、`deliver.ts`（事件类投递、`held`、高峰不做）、`agent/pre-step` 的那一行、`loops:schedule-tools` | S3；M3 的 `mainAgentOf` 合入 | L2、L3 |
| S5 | `loop_show`、`loop_propose`、`loop_note`；`graph_decide` 与 `/graph-apply` 调 `acceptProposal`；补写 | S4；plain-ui 第 1 步（`background` 字段）与 M3 第 3 步（`plain-question.ts`）合入 | L2（真实图引擎）、L3 |
| S6 | 页面 `ui/src/loops/`、板块登记表的一项、首页一行、上手页一句 | S2；plain-ui 第 6 步（板块登记表）合入，之前是项目图页签里的一个视图，合入时移到第 2 层（同规则板 §9.1 的最小版） | L2（视图模型）、L4 |
| S7 | GLM 包：`glm-login` 行提供 `glmHournessChannelLoop`（三项默认条目与推送）；`ZcodeAdapter` 两处推 `login-lost`；M6 的额度读取推 `quota-read` | S1；M6 Q 线合入（额度读取），之前只有 `login-lost` 与第 12、14 项 | L2、L3 |
| S8 | 其他行报事件：M3 设计行（`design-released`）、M7 执行行（`task-handed-back`、`work-stopped`）、M4（`work-stopped` 第三次修复）；M7 的晨报用 `quotaLines` | 各自合入之后，由各自的步带上（§16） | 各自的 L2、L3 |

批次 L4（`docs/DEVELOPMENT.md` §1.1）：S4、S6 合入后一批。本行通过 L3 与第一批 L4 之后才改为默认启用（`AGENTS.md` 强制流程第 4 条）。启用之前，M7 照原设计不建它自己的三条定时提醒（`d-one-main-agent` 已作废 `/patrol on`），晨报仍是 `/hourness` 由人发。

## 16. 对其他设计的影响（各自下一稿改，本稿不动它们的文件）

- 规则板 0.5：「写在代码里的规则」一组加四行：合入前的检查（读 `norm-merge-gate` 的命令，人话加原文）、必须全审（读 `norm-review-floor` 的条目）、M7 的停下标记、`loops:schedule-tools`；检测器的触发改为 `src/loops/trigger.ts` 的 `Trigger` 子集（`every`、`daily`、`weekly` 与 `file-changed` 事件），`interval`、`schedule`、`file` 三个名字作废；命令执行与规则板 §5.3 共用 `src/loops/command.ts`（谁先合入谁建）；循环板调 `checkCall` 时 `tool` 写 `pwsh`、带 `glmSpend`（规则板 §9.4 不用改，只是多一个调用方）。
- M7 0.2：m7-6、m7-7、m7-8 的定时提醒由循环板的第 1–3 项代替，`times` 配置与 `/patrol` 删去；`hourness_report` 不变；巡检原文那句「options and the recommendation last」随 `d-chat-not-cards` 改（§4.1）；§3.7.1 的「harness 直接派审查」改为第 6 项提醒主 Agent 派（`d-main-agent-models`）；交回处理与停下标记写完之后调 `emitLoopEvent`；`glmHournessExecute.withGateLock` 给第 4 项用；四答晨报的「花费」一节用 M6 的 `quotaLines`（一天读一次额度）。
- M4 0.3：§4.6 第三次修复之前改为报 `work-stopped`（`why: 'third-rework'`），给人的话由第 7 项经主 Agent 说（`d-chat-not-cards`，不出卡）；env 行每次跑完检查调 `recordRun`（第 11 项的记录，结局 `delegated`，`exits` 为各检查行的计数），循环板页列出批过的工具节点。
- M3 附录 0.3：设计放行之后调 `emitLoopEvent('design-released')`；`mainAgentOf` 给循环板用（已导出）。
- M6 0.2：额度读取每次写流水时经 `glmHournessChannelLoop` 推 `quota-read`；上游限额错误推 `cause: 'upstream-limit'` 的读数；`nextPeakChange` 给循环板用（已在 `src/shared/pricing.ts`）。
- plain-ui 0.4：§6 的 P4（任务字段 `repeat`、进行中回到已批准、`recurring` 一组、验收第 9 条）由循环板代替，删去；`Board.id` 加 `'loops'`，页脚加「循环 ›」；上手页第 4 块之后加循环板的一句（§7.3）。
- metrics：§5.9 的五类事件是循环板这边的输入清单；字段的通用部分由那份设计定，定了之后循环板只改 `src/loops/metrics.ts`。
- `docs/ORCHESTRATION.md`：编排层的运维一节（晨报、巡检）改写为「循环板的默认条目」，并加循环板一节（概念、事件表、两块板的分界、去向表）；`docs/DESIGN.md` §2.2 行表加 `glm-hourness/loops`，§2.4a 接口对照表加 §9.1 的新用接口，§7 降级表加一行。这些随 S2、S4 的提交改。

## 17. 替人定的方向与要问人的

替人定的（agent 定、人可推翻，写进一页放行稿）：

1. 到点跑命令的条目用循环板自己的钟，不用 DSH 的定时服务（§5.2）：DSH 的投递每次都叫醒主 Agent，命令过了也会在人的对话窗口里留一回合。代价：命令类条目不支持 cron。
2. 高峰开始与结束（第 12 项）、改完文件就跑检查（第 11 项）在循环板上列出与记录，执行仍在规则板与检查器里（§2.3）：同一件事只有一处在做。
3. 人在对话里加条目，要经图上一张待决，人同意后带原话拍板（§6.2），与规则板同一条路。
4. 在 DSH 自带的任务页里改循环板的任务不算数，循环板改回并写一行说明（§5.2）。
5. 额度预警不加定时读取，只在有人看额度、晨报与额度用完时判断（§4.2）；查清 ZCode 自己读不读之前不加。
6. 晨报 08:30、周报周一 09:00、夜间巡检 02:30（沿用 M7 的默认时刻）；默认条目暂时只能看，所以这三个时刻暂时改不了。人想在别的时间多看一次，可以自己加一项「告诉主 Agent 出晨报」。
7. 「等你太久」的门槛 24 小时，22:00–08:00 不说。
8. 告诉主 Agent 的条目最短 10 分钟一次，跑命令的最短 5 分钟一次。

要问人的：没有。上面几条都能随时改回，不涉及目标、验收、不做的事或花钱的方向（`docs/ORCHESTRATION.md` §2.9.1）。最可能不对的是第 1 条：如果人更在意「时间都在 DSH 的任务页里看得到」，命令类条目就要改走 DSH，代价是每次到点都在对话窗口里留一回合。

## 18. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-30 | 第一稿 |
