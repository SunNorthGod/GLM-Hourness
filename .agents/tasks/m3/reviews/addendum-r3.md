# M3 设计附录的独立评审（第 3 轮，评 0.3）

评审对象：`.agents/tasks/m3/design-addendum.md` 0.3（2026-10-30 02:14 本地时间写入，即 2026-10-29T18:14Z）。下文「附录:行」指这个文件的物理行号。

对照：M3 设计 `.agents/tasks/m3/design.md` 0.4；第 2 轮评审 `reviews/addendum.md`、`reviews/addendum.json`（HIGH 1、MEDIUM 2、NIT 9）；`.agents/tasks/design-context.md` 最新几节；图节点 `m3`、`m3-1`、`m3-2`、`m3-6`、`m3-main-persona`、`d-one-main-agent`、`d-main-agent-shell`、`d-chat-not-cards`、`d-main-agent-models`、`d-auto-drive`、`d-design-onepage`、`d-rules-visible`、`d-defaults-readonly`、`d-peak-mode`、`norm-review-floor`、`metrics`、`schedules`、`d-zcode-3171`、`zcode-3171-follow`、`m8-plain-language`（P4-01 的裁定）；规则板设计 `.agents/tasks/rules/design.md` 0.5；面板设计 `.agents/tasks/plain-ui/design.md` 0.5（02:52 写入，晚于本附录）；main `1e9ba84`（附录依据 `4d2edb7`，两者之间除 `docs/graph/` 外是 prompt-fixes 的合入 `823795a`）；`reference/dsh-desktop-0.2.1-rc.3/`；`reference/zcode-3.17.1/zcode.cjs`。

挡路标准：`docs/DEVELOPMENT.md` §1.1（`d-failure-plans`）。只有三类挡路：验收条件或需求没有满足；不可逆损失（丢数据、毁掉检出或用户 profile、对外的动作）没有预防；失败了没有途径发现、没有恢复办法或事后查不到原因。编排方要求违背人定即挡路。主机制与人定直接相反的记 HIGH，其余挡路的记 MEDIUM，不挡路的记 NIT。

结论：CHANGES_REQUESTED。HIGH 0，MEDIUM 8，NIT 12。第 2 轮的 H1、M1、M2 与 9 条 NIT 全部关闭。挡路的 8 条：4 条来自附录写成之前已经在图上的人定（`d-rules-visible`、`norm-review-floor`、`d-peak-mode`）与 `d-zcode-3171` 的重核，1 条来自附录写成之后的面板设计 0.5，3 条来自 0.3 新机制（git 快照、原话核对）的细查。

收敛：第 2 轮挡路 3 条，本轮 8 条，没有减少。按 `docs/DEVELOPMENT.md` §1.1 末句，这个循环应停下交人，由编排方决定是否带人的话开第 4 轮。

## 第 2 轮发现的复核

| 第 2 轮 | 状态 | 依据 |
| --- | --- | --- |
| H1 每个会话都能开主 Agent | 关闭 | §2.4（附录:142–191）：项目就是图目录；持有者记录在用户级数据目录；`isMainAgent` 另看记录；别的会话 `/wish` 指路、`/wish here` 移动、原会话由 harness 执行 `/wish off`；fork 在 `agent/created` 对齐；回写只发给持有者。核对：`agents.get`、`roots()` 与带 `source` 的 `agent/created`（dsh-agent lib/index.js:581、596、623）；`commands.execute` 先写 `command/run`、`source` 固定为 `{kind: 'user'}`（dsh-commands lib/index.js:326–339）；`ctx.sessionPersistence` 的 `list()` 返回带 `header` 的快照（dsh-session-persistence-jsonl lib/index.js:2398、2601、2626–2631）；投影键 `title`（dsh-session-title lib/index.js:171–173）。不放在项目目录的理由成立：`projectHome` 是一个配置值（src/data/index.ts:20、31），编排层包的补丁把它固定为本仓库的 `.llm`（packages/hourness/cordis.patch.yml 的 data 行）。对齐路径的两处小问题见 N7、N9 |
| M1 主 Agent 的 git 能丢掉没提交的改动 | 关闭（被人定取代） | `d-main-agent-shell` 16:53Z 定稿「可以任意操作git」，16:57Z 的落地细则改成先存快照再放行；§2.5（附录:193–224）照此实现，预防从「拒绝」换成「快照」。快照漏存的两条路与对外泄露的一条路是本轮新发现 M3、M4 |
| M2 `background` 的形状与存法 | 关闭（形状与存法）；数值见 M8 | §2.9（附录:321–329）：写进待决的 `background` 字段，一行，只读 `PLAIN_LIMITS.background`；引擎没认这个字段时由第 6 步建。面板设计 0.5 之后数值变了 |
| N1 「子 agent 用便宜的就行」 | 关闭 | §2.6 黄字、`/wish` 回复与 `docs/ORCHESTRATION.md` §3.5 两句；第 11 步 `tests/wish-entry.spec.ts` 断言。描述 DSH 委派的一句不完整，见 N5 |
| N2 结论行的解析被挪两次 | 关闭（不再适用） | `card-rules.ts` 取消；面板设计 0.5 §11 M3 第 8 条也写明 `verdict.ts` 不再需要 |
| N3 两份换词表 | 关闭 | §2.8 的 `PLAIN_WORDS` 含「附录」与 `gate`、`projection`、`addendum`；面板设计 0.5 §5.3 的 `jargon` 调 `plainWordsIn` |
| N4 选项检查的必填参数 | 关闭（不再适用） | 没有 `ask_human` 与 `card-rules.ts` |
| N5 `choice` 的「下一步」 | 关闭 | §2.3 表 `choice` 一行；第 5 步 L2 一例 |
| N6 做法 B 让两条断言失败 | 关闭（不再适用） | 接缝对照取消，没有 `askLine` |
| N7 §8 写「编排者正在写图」 | 关闭 | §9 第 3 条 |
| N8 wish-idle 场景 | 关闭 | 第 3 步 L3 第二条；第 6 步末句 |
| N9 `d-auto-drive` 的触发点 | 关闭 | §9 第 7 条；§2.3 `release` 一行 |

## 人定与裁定逐项

| 人定或裁定 | 附录位置 | 结果 |
| --- | --- | --- |
| `d-one-main-agent`：一个项目一个主 Agent；别的会话 `/wish` 指路并能移过来 | §2.4 | 一致 |
| `d-main-agent-shell`：git 归主 Agent；丢未提交改动或改写已推送历史的命令先存快照；主干前进的核对在 M7 | §2.5、§9 第 7 条、§10 | 方向一致；快照漏存（M3）、被忽略文件的存法（M4） |
| `d-chat-not-cards`：不出卡、不列选项；四行背景、推荐、疑问、不做各成段、每行重点几个字加粗、标签不加粗、问话在最后；记下人的原话 | §3 | 格式一致（`renderProposal` 与 `message`）；人的权限只在主 Agent 一个会话里核对（M5） |
| `d-main-agent-models` | §2.6、§9 第 7 条 | 一致；DSH 现成能力描述不完整（N5） |
| `d-auto-drive` | §2.3 `release` 一行、§9 第 7 条 | 一致 |
| `d-design-onepage`：对照方向清单自查，违背即挡路 | §12 | 有自查，但清单漏了 `d-rules-visible`、`d-defaults-readonly`、`d-peak-mode`、`norm-review-floor`（M1、M2、M7） |
| `d-rules-visible`：每条生效的规矩在规则板或循环板上看得到 | §12「规则只由人定」一行 | 不一致（M1） |
| `d-defaults-readonly` | 无 | M3 没有可改的默认条目；登记进规则板目录后按只读显示（M1 的改法） |
| `d-peak-mode`：照旧提醒模型，默认少做 | §2.8 例题 | 不一致（M7） |
| `norm-review-floor` | §0 末段、第 3 步、第 10 步 | 不一致（M2） |
| `metrics` | §3.5 末段、§12 | harness 写固定说法，一致；事件交接见 N6 |
| P4-01 裁定：背景字段与上限由面板设计定 | §2.9、§3.3、§6、§11 | 原则一致，数值过期（M8） |
| `d-zcode-3171` | §2.7 | 引了 3.16.3 的次序（M6） |

## 发现

### M1 MEDIUM 主 Agent 的门不在规则板上，与 `d-rules-visible` 相反

位置：§12「规则只由人定」一行（附录:1037，「三条 harness 规矩是代码里的边界，不是规则板上的规则」）；§9 没有给规则板的一条；新增的拒绝规则在 §2.5（`git-snapshot`）、§3.8（`main-agent-graph` 三条）、第 4 步（`main-agent-ask`）。

问题：

- `d-rules-visible`（人定 2026-10-29T18:06Z，relay「没问题，项目所有规则确实应该都在明面上」）：项目里所有生效的规矩都要在两块板之一上明面可见，会拦住动作的门放在规则板；插件带来的默认条目只能看（`d-defaults-readonly`，17:55Z）。两条都早于附录写成（18:14Z），§12 的方向清单没有它们。
- 规则板设计 0.5 §10.1（rules/design.md:1209–1211）用只读目录 `src/rules/builtin.ts` 列代码里的规则，id 写成 `<行>:<代码里的规则 id>`，契约测试按每行导出的规则 id 逐个比对；它列的是「M3 的两条」（0.4 的 `main-agent-no-write`、`design-before-release`）。0.3 新增的 `main-agent-ask`、`main-agent-graph` 的三条与 `git-snapshot` 的拒绝都没有登记的出口，附录还把它们定性为不在规则板上。照做，主 Agent 的门有一半在规则板上看不到。

改法：

- `src/guard/main-agent.ts` 导出 `MAIN_AGENT_RULES: readonly {id: string, title: string, enforcement: 'deny' | 'deny-when-no-snapshot'}[]`。id 固定为 `main-agent-no-write`、`design-before-release`、`main-agent-ask`、`main-agent-graph-relay`、`main-agent-graph-stage`、`main-agent-graph-options`、`git-snapshot`：`main-agent-graph` 的三条各一个 id，违规流水的 `rule` 用同一个 id，规则板能分开计数。`title` 一行人话，`plainWordsIn` 为空。
- 第 4、6、8 步各自把新 id 加进这个常量；`tests/contracts.spec.ts` 钉住：每条规则拒绝时写进违规流水的 `rule` 都在常量里。
- §9 加一条给规则板：目录里 M3 的条目改为上面七个，所在行 `glm-hourness/design`，`git-snapshot` 的执行方式写「存不了快照时才拦」；先合入的一方建，后到的一方追加。
- §12「规则只由人定」一行改为「M3 的门是代码里的规则，按 `question-36` B 只读列进规则板的目录（`d-rules-visible`、`d-defaults-readonly`）」，并加 `d-rules-visible`、`d-defaults-readonly`、`d-peak-mode`、`norm-review-floor` 四行。

### M2 MEDIUM 第 3 步与第 10 步没有独立评审，与 `norm-review-floor` 不符

位置：§0 末段（附录:37，「独立代码评审给第 4、5、6、8、9 步」）；第 3 步依赖一段（附录:629，「无独立评审（同 0.4）」）；第 10 步（附录:764–766）没有写评审。

问题：

- `norm-review-floor`（`question-38` C，人批 2026-10-29T17:12Z，早于附录）要求改动落在「改到拦截与权限：guard 规则、写入范围、主 Agent 与子 agent 的工具面」或「改用户配置目录（~/.dsh、~/.zcode 等）或写到项目目录之外」时全审。
- 第 3 步加 `roleFace`（主 Agent 的工具面去掉写工具与 `ask_user_question`、收窄 `str_replace_editor`），并在 `<userHome>/main-agent/` 写持有者记录；`userHome` 是 `<DSH home>/glm-hourness`（src/shared/data-home.ts:24、65），即 `~/.dsh` 之下。两类都命中。第 3 步还定了 `isMainAgent` 的新读法，它决定 `main-agent-no-write`、`design-before-release`、`git-snapshot`、`main-agent-graph` 是否适用。
- 第 10 步照 0.4 §3.5.3 改决策流水的记录（`DecisionRecord` 去掉 `level`）。`docs/DEVELOPMENT.md` §1.1 的独立评审范围写明「图引擎的权限与审计（…违规与决策流水）」。

改法：第 3 步、第 10 步改为「独立评审：是」，各写一句理由（第 3 步：主 Agent 的工具面与角色判定、写用户级数据目录，`norm-review-floor` 第 1、4 条；第 10 步：决策流水的格式，`docs/DEVELOPMENT.md` §1.1）；§0 的名单改为第 3、4、5、6、8、9、10 步；§12 加 `norm-review-floor` 一行。

### M3 MEDIUM git 快照漏存两类会被删掉的文件，§7「主 Agent 的 git 命令丢不掉东西」不成立

位置：§2.5 `gitRisk` 的 `discard`（附录:205）与「快照」第 2 步（附录:214）；§7 第 2 行（附录:898）。

问题：

- (a) 挡路的未跟踪文件。`git reset --hard <rev>` 会删掉挡在要写出的已跟踪文件路径上的未跟踪文件（git-reset 文档：「Any untracked files or directories in the way of writing any tracked files are simply deleted」）；`git checkout -f <分支>` 与 `git switch --discard-changes`、`-f` 同样（git-checkout 文档：「throw away local changes and any untracked files or directories that are in the way」）；`git restore --source=<树> -- <路径>` 覆盖路径上的未跟踪文件。第 2 步对 `discard` 只做 `git stash create`，它只存已跟踪的改动，挡路的未跟踪文件没有存下。模型遇到「untracked working tree files would be overwritten」之后加 `-f` 重试是常见做法，正好走这条路。
- (b) `clean` 的文件列表来自给人看的输出。第 2 步从 `git clean -n` 读「Would remove <路径>」。这一行在 git 里是可翻译的消息（clean.c 的 `msg_would_remove` 走 gettext），中文环境下不是这串英文；非 ASCII 的路径按 `core.quotePath` 转义成八进制并加引号。读不出时列表为空或路径不对，`git add -f -- <L>` 存不下要删的文件，快照照样记为成功，命令随后删掉文件。附录没有写读不出时怎么处理。

两条都是 §1.1 第二类（丢数据，没有预防）。

改法：

- (a) 对会从另一棵树写工作区的 `discard` 命令（`reset` 带 `--hard`、`--merge`、`--keep` 与目标；`checkout` 带 `-f`、`--force`，或带分支、提交与路径；`switch` 带 `-f`、`--force`、`--discard-changes`；`restore --source`；`read-tree -u`），另取挡路的文件：`git ls-tree -r -z --name-only <目标>` 与 `git ls-files -z --others` 的交集，并进第 2 步的树 `T`，上限同 `clean`；目标解析不出时取全部未跟踪、未忽略的文件（`--exclude-standard`）。L2 加一例：`other` 跟踪 `x.txt`、工作区有未跟踪的 `x.txt`，`git reset --hard other` 之后 `git restore --source=<K> --worktree -- x.txt` 拿回原内容。
- (b) 列表不读给人看的输出，按 `clean` 的参数用 `git ls-files -z --others --directory` 算：不带 `-x`、`-X` 时加 `--exclude-standard`；`-X` 时加 `--ignored --exclude-standard`；`-x` 时不加排除；路径参数原样传；不带 `-d` 时去掉以 `/` 结尾的目录项。`-z` 的输出不转义、不翻译。若仍要对照 `clean -n`，调用加 `-c core.quotePath=false`，环境设 `LC_ALL=C`、`LANGUAGE=C`，有一行不以 `Would remove ` 开头就按「存不了快照」拒绝。L2 加：中文文件名的未跟踪文件在 `git clean -fd` 之后能恢复；环境 `LANG=zh_CN.UTF-8` 下同一例通过。

### M4 MEDIUM 被忽略的文件进快照：例行清理工作树被拒，秘密进引用后可被推到远端

位置：§2.5 第 2 步（附录:214，`clean` 与 `worktree remove` 存被忽略的文件，200 MB、20,000 个文件的上限，超了拒绝）；第 4、5 步（附录:216–217，`K` 以 `T` 为树，挂引用，`history` 或 `both` 时打标签）；§2.5「不做」（附录:224，快照不自动清理）；§10 残余（附录:992，只记了 `git push --tags`）。

问题：

- (a) `git worktree remove` 不带 `--force` 只删得了干净的工作树，这时被删的全是被忽略的文件，也就是依赖与构建产物。装过依赖的工作树超过 20,000 个文件或 200 MB 是常态（本附录自己要求开工时在两个工作树里装依赖、`npm run build`）。于是主 Agent 收尾清理工作树时快照存不了、命令被拒，只能请人在自己的终端里跑。`norm-review-floor` 正文写明「清理已合进主干的分支与工作树…每件活收尾都要做，删除前 harness 先存快照（d-main-agent-shell 的细则）」，`d-main-agent-shell` 把 git 交给主 Agent；这一条把例行清理变成每次问人。
- (b) 被忽略的文件常是 `.env` 一类的本机配置，在本仓库还包括 `.llm/`（凭证、记忆、审计，`docs/DEVELOPMENT.md` 列为不入库）。附录把它们存成 git 对象，挂在 `refs/hourness/snapshots/<id>` 上，类别为 `both` 时另打标签，永不清理。`git push --mirror` 推送全部引用（附录把 `--mirror` 归入 `history`，存完快照照样放行），`git push --tags` 推送全部标签（§10 只记为残余），快照里的文件与提交说明里的原命令就到了远端。这是 §1.1 第二类里「对外的动作」，没有预防。

改法（选定这一种，记进 §11；人可推翻）：

- 被忽略的文件不进快照提交。`clean -x`、`clean -X` 拒绝，规则 id `git-snapshot`，正路 `Run git clean without -x or -X; ignored files stay.`，例外 `The human can run it in their own terminal.`。`worktree remove` 只存那个工作树里已跟踪的改动与未跟踪、未忽略的文件（只在 `--force` 时会有）；被忽略的文件只把路径、个数与总大小写进流水与 notice；§10 记「被删工作树里被忽略的文件不恢复」。200 MB、20,000 个文件的上限只对要存的文件。
- 标签只打在只含旧引用值的提交 `K_h` 上（父提交是被移动或删除的引用的原值，不含 `S`、`W`、`T`）；`K` 本身只挂 `refs/hourness/snapshots/<id>`。
- `push` 带 `--mirror`，或某个 refspec 的源匹配 `refs/hourness/` 时拒绝，规则 id `git-snapshot`，正路 `Push branches and tags by name; snapshot refs stay on this machine.`；§11 记为 git 上的第二处拒绝，理由是对外的动作。L2 各一例。

### M5 MEDIUM 阶段前进与原话核对只管主 Agent 一个会话，`m3-6` 第 2 条不成立

位置：§3.8 第一、二条只对主 Agent（附录:555–556）；§10「普通会话里图工具的 relay 不核对」（附录:995）；§7「人的权限只来自人自己的话」「阶段只经门禁向前」两行（附录:901–902）；§9 第 1 条 `m3-6` 第 2 条的新字句。

问题：

- 图工具对所有 agent 注册（src/graph/index.ts:109），引擎给任何带 `relay` 的 `llm` 写入人的权限（src/graph/engine.ts:150、154），0.4 §2.4 表末行允许带原话改任意阶段。
- §3.8 第二条只拦主 Agent，所以主 Agent 派出的子 agent（放行之前也能调用图工具，`design-before-release` 只管文件写入）与同一项目里的普通会话，都能带一段编的 `relay` 调 `graph_edit {stage: 'release'}` 或 `graph_approve` 放行集合：不过门禁、不核对原话、没有告警。放行会解开子 agent 的写入，M7 起主 Agent 自己推进（`d-auto-drive`）。
- 图上 `m3-6` 第 2 条现行字句「阶段前进只经确认卡与五键卡」与 §9 的新字句「只经主 Agent 带人的原话记下的确认与放行」都因此不成立；§7 的两行不变量只对一个会话成立。
- 不能把第一条直接推广到子会话：子会话里父 agent 的任务消息是 `source: {kind: 'user'}`（dsh-subagent lib/index.js:1460–1461），`personSaid` 会把主 Agent 写的话当成人的话。

改法：

- 第二条（阶段只经门禁向前）对所有会话生效：规则仍在 `src/guard/main-agent.ts`，适用条件由 `isMainAgent` 改为「调用名经 `toNativeTool` 后在 `GRAPH_TOOL_NAMES` 里」。`record_human_answer` 直接调引擎，不受影响；人在面板上的写入身份是 `human`，不受影响。
- 子会话（`origin: 'subagent'`）的图工具调用带 `relay` 一律拒绝，记为 `main-agent-graph-relay`：子 agent 不和人对话（`d-one-main-agent`），正路 `Report back; the main agent records the human's words.`。
- 普通会话的 `relay` 照今天（§10 原句保留），向前改阶段已被上一条拦住。
- L2：子 agent 带 `relay` 的 `graph_edit stage: 'release'`、普通会话带 `relay` 的同一调用都被拒；普通会话带 `relay` 的 `graph_decide` 照旧放行。§7 两行写明适用范围。

### M6 MEDIUM 人设一节按 3.16.3 的位置与写法设计，没有按 `d-zcode-3171` 重核

位置：§2.7「注入」第 2 条（附录:256，`# Output Style: <name>`、空行、用户的文字）与「GLM 路由」一条（附录:259，「ZCode 的次序是 Environment、Output Style、Context management（docs/reference/zcode-capabilities.md:374）」）；§10「ZCode 的 Output Style 提醒…不加周期提醒」（附录:998）。

问题：

- `d-zcode-3171` 要设计里引用的 3.16.3 包内事实按 3.17.1 重核。docs/reference/zcode-capabilities.md:374 记的是 3.16.x 的组装次序。
- 3.17.1 的系统提示词组装（zcode.cjs @12850435）依次是 CLI 前缀、身份节（有输出风格时开头句用 `pBa`，@12792148）、Dynamic Behavior、Session guidance、Memory、环境各节、Context Management、git 等，没有 Output Style 一节。风格正文由 `n8o` 生成（@12945672）：`# Output Style: ${name}`、一个换行、风格文字，中间没有空行；它作为上下文条目 `output_style_instructions` 只在主回合下发（@13142888）。另有每回合的 `${name} output style is active. Remember to follow the specific guidelines for this style.`（`r8o`，条目 `output_style`，@13451285）。
- `m3-main-persona` 验收第 1 条要「主 Agent 会话的系统提示词带人设一节」，与 3.17.1 的放法不一致。附录没有发现这处取舍，按 3.16.3 定了位置与空行，又把 3.17.1 的每回合提醒判为「不加」。

改法：§2.7「GLM 路由」一条写明上面三处 3.17.1 的事实与取舍：人设一节留在系统提示词（验收第 1 条）；位置定在环境各节之后、`glm:context-management` 之前（3.17.1 这里没有节；选这里是因为 3.16.3 在这里，且节在会话内不变、不破坏提示词缓存）；标题与正文之间一个换行（照 `n8o`）；开头句用 3.17.1 的 `pBa`（随 `zcode-3171-follow` 改常量）。这处与 3.17.1 的差异和「不加每回合提醒」都写进 `docs/reference/zcode-verbatim.md` 的不跟一栏，理由各一句，请编排方同意（`zcode-3171-follow` 验收第 1 条的做法）。L2 的「节在 `glm:context-management` 之前」照旧。

### M7 MEDIUM 例题的推荐与 `d-peak-mode` 相反，写进每个主 Agent 的系统提示词

位置：§2.8 `PLAIN_QUESTION_EXAMPLE`（附录:292）与 `PLAIN_QUESTION_GUIDE`；§2.2 第二部分原样引用；§3.4 工具说明再引用一次；§3.1 人给的样子。

问题：

- 例题「推荐：只显示给你看，不再提醒模型」「不做：继续提醒，它收到 32 次一次都没用上」是 M6 高峰题的 A。人随后定了 `d-peak-mode`（17:33Z，relay「高峰继续提醒模型，但是加一个档位吧就是高峰模式，人可以选择无影响，少做，不做。要让主Agent知道现在是不是高峰，应该选哪个档位」；17:45Z 默认少做）：照旧提醒模型，主 Agent 每一步从 harness 的提醒里知道是不是高峰、人选了哪一档，并照档位少做。
- 附录把这条被人否掉的推荐写进每个主 Agent 的系统提示词两次（§11 自己估约 1,200 字符），读它的正是 `d-peak-mode` 要它照高峰提醒行事的那个 agent，例题还断言这类提醒「一次都没用上」。人给这道题是给格式：`d-chat-not-cards` 17:23Z 至 17:27Z 的三条批注都在讲排版。

改法：保留人给的格式（题目一段，四行各一段，每行一处加粗、不以标签开头），内容换成已定的事，并与标定任务不同领域。例如照 `d-peak-mode`：

```text
① 高峰时段主 Agent 怎么干活
背景：高峰时 GLM **更费积分**，系统每步都会提醒
推荐：默认**少做**：少开几个，不做重活
疑问：要是**赶工期**，你可以改成无影响
不做：**高峰全停**，活要排到高峰以后
```

（背景 21 个码点，其余三行 13–14 个，各一处 2–4 个码点的加粗；实现时过一遍 `proposalLineRefusal` 与 `plainWordsIn`。）§2.8 与 §3.1 的「四行的文字是人的原话」改为「格式是人给的，内容取已定的 `d-peak-mode`」，§11 记一条，§12 加 `d-peak-mode` 一行。

### M8 MEDIUM `PLAIN_LIMITS.background` 写死 150，面板设计 0.5 已定 60

位置：§2.9 第 2 条（附录:328，「`PLAIN_LIMITS = { title: 40, why: 80, background: 150 }`」）；§2.9 第 1 段（附录:323，「（150）」）；§6 第 3 行；§11 第 5 条（附录:1009，「`background` 用 plain-ui 的 150」）。

问题：P4-01 的裁定（`m8-plain-language` 的批注）定背景的字段与上限由面板设计定，M3 照用。面板设计 0.5（02:52，晚于本附录）§5.2 把上限改为去掉 `**` 后 60 个码点（plain-ui/design.md:394–397），§11 M3 第 2 条写「第 6 步先于本稿合入时，M3 建 `PLAIN_LIMITS` 用 `{ title: 40, why: 80, background: 60 }`」（:739）。附录在 M3 先合入时照字面建 150，与上限的所有者相反；面板设计第二阶段切换的前提 (b) 会在之后失败，但那时 M3 已按 150 写过提议。

改法：§2.9 第 2 条去掉字面数值，改为「按面板设计当前 §5.2 建（0.5：title 40、why 80、background 60，去掉 `**` 再数）」；附录:323、§6、§11 的「150」改为「`PLAIN_LIMITS.background`（面板设计 0.5 为 60）」。例题背景 18 个码点，不受影响。

### NIT

N1 `snapshotEvents()` 在 rc.3 已标弃用。§3.2 的 `SessionLike.snapshotEvents?`、§3.6、§3.8 第一条都建在它上面；rc.3 对 `snapshotEvents()`、`eventAt()`、`ownEvents()` 标了 `@deprecated`，「new production calls are prohibited」（dsh-session lib/index.js:1444–1452；README.md:62），附录只写了「fork 与 api-session-controller:1134 都在用它」。另外第一条在主 Agent 每次带 `relay` 的图工具调用上、§3.4 第 4 条在每次 `propose_to_human` 上扫整份日志。拿不到时 fail-closed 并报 degraded，所以不挡路。改法：设计行注册会话投影 `hournessTalk`（同 dsh-time-context 用 `sessionProjections` 折叠 `user/message` 的做法，dsh-time-context lib/index.js:189–211），状态只存人的消息（`seq`、`time`、规整后的文字）与 `propose_to_human` 的成功结果（`seq`、`time`、`kind`、`goal`、`question`、`number`、`releaseSet`）；`personMessages`、`shownProposals` 改读 `stateOf(session, 'hournessTalk')`；投影服务不在时退回 `snapshotEvents`（存在时）并报 degraded。

N2 子串匹配能改掉原意。§3.6 `personSaid`（附录:529）允许从「不可以」里摘出「可以」。附录把「归错类」列为不防，这一种是摘录改了原意，与「防模型编出人的话」同类。改法：每段原话的起止落在边界上：起点是消息开头，或前一个字符是空白、换行或 Unicode 标点（P 类）；终点同理。L2 加「不可以」摘「可以」被拒一例。

N3 依据过期。main 已到 `1e9ba84`，prompt-fixes（`823795a`）已合入：`src/guard/rules.ts` 的 `APPLICATION_PROTOCOL` 已删，例外段改为 `ASK_THE_HUMAN`（:56，`61be79a`），第 4 步（附录:649）那句「若改了 `APPLICATION_PROTOCOL`」不再成立；`installDialect` 按会话取环境（`c17ff5d`，src/glm-prompt/index.ts:197–204，附录引的是 :184、:189）；逐字门禁的常量表在 scripts/check-verbatim.mjs:243（附录引 :237）；rules.ts 的 git 注释在 :122–128。改法：依据改为开工时的 main，第 4 步删去这句，保留「同文件串行」；行号随之改。

N4 面板设计 0.5 给 M3 的五处落点。面板设计 0.5（02:52）§11 M3 第 3–6 条与 §6.5 要：三种说法用 `src/shared/answer-marks.ts` 的 `ANSWER_MARKS`；`personMessages` 逐条调 `src/shared/person-message.ts` 的 `isPersonMessage`；`main-agent-holder.ts` 另导出 `holderFileOf(userHome, dir)`；`src/shared/tool-names.ts` 导出 `PROPOSE_TO_HUMAN`；完整开场卡片底部放 `FirstVisitLine`。内容与附录一致，只是落点不同。改法：§3.2、§3.5、§2.4、§2.6 照这五条改落点（谁先合入谁建），§9 第 5 条改为确认这几处。

N5 DSH 委派的描述不完整。§2.6（附录:240）与 §9 第 7 条（附录:982）写「DSH 的委派让子 agent 沿用父 agent 的模型（subagent:305–316）」。`resolveChildAgentOptions` 的说明是「the parent's provider/model … unless the request overrides them」（dsh-subagent lib/index.js:302–305）；tool-subagent 的 `modelSelectionSettings`（lib/index.js:311–314、360–374）打开之后，模型能在调用里选 `provider`、`model`、`reasoning_effort`（:42–66），限于允许清单。改法：两处补一句「DSH 的 subagent 工具在 `modelSelectionSettings` 打开时可以按调用选模型（限允许清单），M7 设计派发选模型时先评估它」。

N6 指标流水的事件交接。`metrics` 要问人的次数、人读了多少字、拍板等了多久、跟没跟推荐都由 harness 写。`confirm`、`release` 的提议不写图，只在会话日志里；附录只写了「指标流水按这三个前缀数」。面板设计 0.5 §11 指标流水第 1 条写的是 `record_human_answer` 写图的同时记进流水。指标流水的设计还没成稿，不挡路。改法：§9 加给指标流水设计的事件表（同规则板 0.5 §10.5，出口 `emitMetric`，接口到位之前不做事）：`design.proposal-shown`（`kind`、`number`、`text` 的码点数、目标与待决 id）、`design.answer-recorded`（`kind`、`answer`、从提议到回话的毫秒数、原话码点数）、`design.answer-refused`（原因码）、`design.holder-moved`、`git.snapshot`（类别、存了什么、耗时）、`git.snapshot-refused`（原因码）。

N7 对齐里执行命令的两处细节。`commands.execute` 在命令名解析不出时返回 `undefined`、不抛错（dsh-commands lib/index.js:326–330），§2.4 把「命令没注册」写成执行失败，实现要把 `undefined` 当失败。`agent/created` 是串行监听（dsh-agent lib/index.js:581），在监听器里同步执行另一条命令会不会与创建流程互相等待没有核实；L3 只覆盖了活会话的 `/wish here`。改法：`agent/created` 里不直接执行，排到 `agent.whenIdle()` 之后；L3 `glm-design-one-main` 加一步：fork 主会话，新会话第一步没有身份节、投影为假。

N8 快照的噪声。`checkout`、`switch`、`restore` 不论参数都算 `discard`（附录:205），工作区干净时写「什么都不存」，没写是否仍建引用、记流水、发 notice；`reset`（任何模式）、`commit --amend`、`branch -d` 每次打标签，快照不清理，标签列表会被例行操作填满。改法：`discard` 在 `S` 为空、没有 `W`、没有 `T` 时整件跳过（不建引用、不记流水、不发 notice）；标签只在旧值会变得不可达时打（`branch -D`；`push` 的强推与删除；`reset`、`rebase`、`commit --amend` 移走的提交是某个远端跟踪分支的祖先），其余只挂 `refs/hourness/snapshots/<id>`。

N9 已有主 Agent 时人写的那句话要重打。§2.6（附录:234）在已有主 Agent 的项目里照样显示完整卡片；人写的一句话得到「你这句话还没交给它；移过来之后再说一遍」（附录:168）。改法：`/wish here` 接受后面跟一句话（移过来之后按「一句话」一行开启），那一行的回复改为「要把它移过来并交给它，输入 /wish here 加这句话」，`input.hint` 同改。

N10 `TALK_GUIDE` 的「Put everything else to them with propose_to_human」（附录:92）可以读成每件要说的事都走工具，包括汇报与放行之后的一句话。改法：改为「Put every matter that needs their answer to them with propose_to_human」。

N11 `ask_user_question` 按字面名去掉。§2.1（附录:65）写工具按 `toNativeTool` 的原生名判，`HIDDEN_FROM_MAIN_AGENT` 按字面名判。工具检索的常驻表里已有 ZCode 名 `AskUserQuestion`（src/toolsearch/exposure.ts:39），`zcode-3171-follow` 若给它加别名，工具面会漏掉别名。改法：`HIDDEN_FROM_MAIN_AGENT` 同样经 `toNativeTool` 比较。

N12 `/goal` 带附件时的固定文字会被当成人的话。dsh-command-goal 以 `source: {kind: 'user'}`、不带 `form` 追加一条固定文字「Reference attachments for the goal objective.」（lib/index.js:100–107），§3.6 的判据（附录:527）会把它算进人的消息。改法：判据排除只含这一句的消息，或在 §3.6「不防的」里记下。

## 核实过的假设

1. 依据：`git diff --stat 4d2edb7 1e9ba84` 去掉 `docs/graph/` 之后是 prompt-fixes 的 10 个文件（docs/DESIGN.md、docs/DEVELOPMENT.md、docs/ORCHESTRATION.md、scripts/check-verbatim.mjs、scripts/reference-dir.mjs、src/glm-prompt/index.ts、src/guard/rules.ts 与三个测试）；`.worktrees/m3`、`.worktrees/m3-flow` 都在 `eb614ab`，快进仍可行。
2. 持有者与对齐用到的宿主成员：`agents.get`、`list`、`roots`、`agent/created`（dsh-agent lib/index.js:581、596、614、623）；`commands.execute`（dsh-commands lib/index.js:326–339）；`ctx.sessionPersistence.list()` 返回带 `header` 的快照（dsh-session-persistence-jsonl lib/index.js:2398、2601、2626–2631）；`sessionProjections.stateOf(session, key)`（dsh-session-projection lib/index.js:126）；投影键 `title`（dsh-session-title lib/index.js:171–173）；headless 建会话与任务消息（dsh-headless lib/index.js:316–321、340–346）、空闲退出（:347–351）。
3. 人的消息的判据：桌面版输入框的消息 `source: {kind: 'user', rpcId, …}`（dsh-api-session-controller lib/index.js:3222–3228），排队后删除的消息不进日志（:1036–1044）；dsh-time-context 的时间消息 `source.kind` 是插件名、`form: 'snapshot'`（dsh-time-context lib/index.js:231–241），被判据排除；本仓库的 notice 带 `form: 'notice'`（src/shared/dsh-min.ts:460–468）。
4. 事件形状：`seq`、`time` 为安全整数（dsh-session lib/index.js:1126–1128、1529–1531）；`user/message` 的 `data` 就是消息，`assistant/message` 与 `tool/result` 的消息在 `data.message`（:221–227）；`tool/result` 消息带 `toolCallId`、`isError`（dsh-llm lib/index.js:108–110）。
5. 组装次序：cordis 对 `prepend` 用 `unshift`、否则 `push`（cordis lib/index.js:335）；DSH 自己的 `system-prompt/assemble` 监听器不改 `tools`（dsh-agent :166、dsh-working-directory :47、dsh-session-reference :458）。
6. 客户端槽位：排队条 order 20（conversation client.js:17266）；阶段判定（:17378–17379）；开场画面（:17608–17610）；`conversation.input.dock` 在工作区行与输入框之间（:17901–17907）；`conversation.composer.dock` 只在 `variant === 'composer'` 时渲染（:19344）。
7. rc.3 的 yml 里只有 dsh-tool-str-replace-editor 自己的 README.i18n.yaml 提到 `tool-str-replace-editor`，预设与 headless 组合都没有它。
8. 图引擎：未知字段被拒（src/graph/format.ts:90–92）；待决要 2–4 个选项与推荐（:397–406）；非待决不能带卡片字段（:408–411）；决定证据的 `ref` 是选项键（:416–419）；`comment` 丢掉 `relay`、带 `relay` 的写入有人的权限（src/graph/engine.ts:150、154）；`LLM_EDITABLE`（:101）；待决挂在未关闭节点下直接为已批准（:104、417–427）；`lastDecidedByHuman`（src/graph/stage.ts:112–116）；需求卡 8 项与点名 `decision_card` 的 hint（:121–143）；投影的 `label` 退回 `decision`（src/graph/projection.ts:276）；图工具全局注册（src/graph/index.ts:109）。
9. 工具面：`Write` 在 GLM 上常驻（src/toolsearch/exposure.ts:39）；`DeferredToolCall` 先报不可用、再报常驻（src/toolsearch/index.ts:161–165）；`ZCODE_ALIAS_NATIVES`（src/shared/dialect.ts:30–33）；file-tools-only 不把 git 当写（src/guard/rules.ts:122–128）。
10. 数据目录：`userHome` 是 `<DSH home>/glm-hourness`（src/shared/data-home.ts:24、65）；`projectHome` 是配置值（src/data/index.ts:20、31），编排层补丁的 data 行把它设为本仓库的 `.llm`。
11. 标定运行器：`HUMAN_TOOLS`（scripts/calibrate/run-calibrate.mjs:38）、运行根在仓库下（:89）、运行目录名（:227）。
12. ZCode 3.17.1：身份开头两句 `dBa`、`pBa`（zcode.cjs @12792148）；`n8o` 的风格正文（@12945672）；`output_style_instructions` 条目（@13142888）；每回合提醒 `r8o`（@13451285）；系统提示词组装（@12850435）没有 Output Style 一节；3.16.3 包里没有 `output_style_instructions`。
13. 规则板设计 0.5 §10.1 的只读目录与契约测试（rules/design.md:1209–1211）；面板设计 0.5 的背景上限 60（plain-ui/design.md:394–397、739）与给 M3 的五处落点（:473–486、:734–760）。
14. 人定与规范的时刻：`norm-review-floor` 17:12Z、`d-peak-mode` 17:33Z 与 17:45Z、`d-defaults-readonly` 17:55Z、`d-rules-visible` 18:06Z，都早于附录写成的 18:14Z；面板设计 0.5 写于 18:52Z。

## 没有核实或不成立的假设

- 不成立：3.17.1 的系统提示词里有 Output Style 一节，次序是 Environment、Output Style、Context management（§2.7；M6）。
- 不成立：主 Agent 的 git 命令丢不掉东西（§7；M3 的挡路未跟踪文件与 `clean` 列表）。
- 不成立：快照只在本机（M4：`push --mirror`、`push --tags`）。
- 不成立：阶段只经门禁向前、人的权限只来自人自己的话（§7；只对主 Agent 成立，M5）。
- 不成立：M3 的门不必上规则板（§12；M1）。
- 不成立（过期）：`PLAIN_LIMITS.background` 为 150（M8）；依据 `4d2edb7` 与 `APPLICATION_PROTOCOL`（N3）。
- 不完整：DSH 的委派总让子 agent 沿用父 agent 的模型（N5）。
- 未提及：`snapshotEvents()` 在 rc.3 已弃用（N1）。
- 没有核实：在 `agent/created` 监听器里执行 `/wish off`（N7）；`demoteOthers` 发出的 `/wish off` 在桌面版界面上怎样显示（附录已列进 L4 第 9 项）。
- 没有核实（附录已标〔推断〕并列进 L3 或 L4，可以接受）：模拟人在 `turn/end` 时 `followup` 让 headless 继续下一回合；探针经 `agents.create` 建第二个根会话；不同插件在同一个 agent 作用域上的组装监听器进同一张表；schemastery 子集里多行文本框的写法。
