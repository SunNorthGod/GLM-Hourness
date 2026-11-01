# M4 设计：guard 补齐与环境

版本：0.3（2026-10-30），按设计评审第 2 轮（`design-review.md`、`design-review.json`：2 条挡路 F9、F10，13 条非阻断 N14–N26）修订，并吸收评审之后人定的事：D2 已答（选 B，原话「不介意」）；`d-chat-not-cards`（问人改成聊天：只给一个方案，题目一段，背景、推荐、疑问、不做四行各自成段、每行把重点几个字加粗，问话放在最后；不出问答卡、不列选项）；`d-ui-look-not-operate`（面板只看不操作）；`d-plain-questions` 与「问题带前因后果」；`d-main-agent-shell` 定稿（主 Agent 随意用 git 与命令行，只有写文件被拦；会丢工作的 git 命令执行前 harness 先存快照）；`d-one-main-agent`；`d-main-agent-models`；`d-auto-drive`；`d-zcode-3171`；`norm-review-floor`；`d-design-onepage`。其中问人改成聊天这一条让申报通道从「卡片加面板」改为「对话里人的下一句话」（§5），第三次修复与 D1 都改为四行的方案（§4.6、§17）。逐条的处理见 §19.2，第 1 轮的处理见 §19.1。给人看的一页放行稿是同目录的 `onepage.md`。

依据：main `8599304`。相对 0.2 的依据 `eb614ab`，`src/` 没有改动；`6134c83`（行标题）改了登记方式：每个宿主行在补丁里以 `dsh-hourness/<行>` 命名，`packages/hourness/package.json` 导出 `./<行>` 与 `./<行>/locale/*.json`，设置页的标题在 `packages/hourness/locale/<行>/`，`scripts/preflight-bundle.mjs` 逐行核对（E1 按这个做，§2.2）。`.agents/tasks/design-context.md` 2026-10-30 01:44 版。ZCode 基线已换到 3.17.1（`d-zcode-3171`）：本设计用到的 ZCode 事实有两样，都已对 `reference/zcode-3.17.1/zcode.cjs` 重核〔实读 2026-10-30〕：别名表 `ZCODE_ALIAS_NATIVES` 的七个工具（`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Read`、`TodoWrite`）在 3.16.3 与 3.17.1 里各有一处 `name:"<名字>"` 的定义；`DeferredToolCall` 的参数在 3.17.1 第 132 行仍是 `V.object({name: V.string().min(1), input: V.record(V.unknown())}).strict()`，与 3.16.3 同形。split 第 0–8 步都在 main 上（guard 对所有路由判定、`src/guard/origin.ts` 的来源字段）；M3 第 1、2 步在 main 上（`src/graph/stage.ts` 的 `labeledSections`、`goalOf`，`src/graph/main-agent.ts`），M3 其余各步按 `.agents/tasks/m3/design.md` 0.4、它 §15 的人定结果与 `.agents/tasks/m3/design-addendum.md` 0.3 实现（附录 0.3 正在写与审：§2.4 一个项目一个主 Agent、§2.5 git 快照、§2.8 换词表、§2.9 背景字段、§3 卡片待细则；本设计按节号引用，附录定稿时按 §2.3 的分工表核对一次）。M4 不再导入 M3 的卡片与以人的身份写图的函数（§2.3）。评审中的两份设计按标题与节号引用：规则板 `.agents/tasks/rules/design.md` 0.4.1、M7 `.agents/tasks/m7/design.md`。另据阅读摘要 `.agents/tasks/reading-2026-10-29/digest.md` §4 第 6–9 条与 §7 第 5、6 条，注入清点 `.agents/tasks/prompt-audit/report.md` §0（拒绝文案指向不存在的申报通道）。

证据写法：同 M3 设计。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行。〔实读〕读过源码；〔推断〕由源码推出、没有运行；〔未核实〕列进 §14 的 L3 或 L4 项；〔本机实测〕设计期间做过的只读试验：读本机 `~/.dsh/sessions/` 下的会话日志，只在内存里统计条数，没有输出命令原文，没有写任何文件；量了单文件 ESLint 与 `tsc` 的耗时。

范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/` 与 `~/.dsh`，不用桌面版。要记到图上的事写成同目录的 `graph-ops-v03.json`，由编排者执行。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

M4 在编排层包 `dsh-hourness` 里加一行 `glm-hourness/env`（源码 `src/env/`，默认禁用），其余改动落在 guard 行（`src/guard/`）与图工具（`src/graph/tools.ts`）。按 `docs/ROADMAP.md` M4 与节点 `m4`、`m4-request-card` 的条目：

- 影子模式机制（§3）。guard 框架里的每条规则带一个写在代码里的模式 `enforce` 或 `shadow`。所有用 guard 框架的行（guard 行、图行的 `graph-files-only`、M3 与 M7 的规则）都经同一个安装函数 `installRuleGate`（`src/guard/gate.ts`）挂监听器，影子判定、拒绝记录与跟进因此只有一份实现，`evaluate` 删除。影子规则从不拦截：判为违规时调用照常执行，违规流水里多一条 `mode: 'shadow', via: 'rule'` 的记录（规则、工具、命令或目标、来源 `scope` 与路由）。流水里各种记录由唯一的分类函数 `classifyRecord` 区分，晨报、统计、命令行与 M7 的阶梯都用它。每次经 `installRuleGate` 的拦截之后，同一 agent 下一步里模型发出的第一次调用记一条跟进记录（走对了正路、原样重试、别的、没有下一步），不论这次调用被哪一行拒绝；GLM 上经 `DeferredToolCall` 包装的调用先拆开再比，同一步里并行发出的调用不算，回合结束或会话卸载时还没有下一步的记为「没有」。量的是「拦截后下一步走对的比例」（`docs/ORCHESTRATION.md` §6.3，摘要 §4 第 7 条）。agent 用命令行给流水里的记录标「该拦 / 误伤 / 说不准」，带人原话的标注算人的；统计按规则与来源（GLM 方言接管的路由 / 其他路由）给出精确率与召回率（摘要 §4 第 8 条），这也就是 G3 在非 GLM 路由上的误伤率。历史会话回放（人已定，D2 选 B）：用今天的规则重判本机 DSH 会话日志里的工具调用，当天就有样本。标注过的样本脱敏后进入仓库里的回归语料，`npm test` 里有一道检查：生效的规则与语料的标注不一致就失败。影子转生效的判据（至少 20 条带标注的样本、至少 14 天实时影子、0 条误伤）由 M4 定为一个常量，M7 的周报阶梯引用它提议，人拍板，改代码里的模式。
- `docs/ORCHESTRATION.md` §6.4 的规划规矩（§4）。四条新规则都以影子模式上线：`credential-read`（读凭证文件，摘要 §4 第 9 条，按设计只记录）、`suppression-reason`（新增的压制注释没有理由或没挂节点）、`checker-config`（改检查器配置与基线文件）、`scratch-only`（在草稿区以外新建一次性脚本）。「同一处第三次修复要问人」落在图工具上：一次修复是一次重开（从完成改回进行中）之后的工作，LLM 第 3 次重开同一节点、第 3 次修复即将开始时，harness 在它下面提一张人定的待决，正文是一段四行的方案（先停下查原因），由主 Agent 在对话里问人。表里其余三行归 M3（主 Agent 不写文件、设计期只读）与 M7（子 agent 只写写入范围）。
- 申报通道（§5，任务 `m4-request-card`）。工作区圈禁拒绝时，纠偏带一个申报编号，正路写明调用新工具 `request_exception` 与它的四个字段。按 `d-chat-not-cards`，不出问答卡：工具返回一段由 harness 写的方案文字（题目，背景、推荐、疑问、不做四行，一句问话；路径、文件在不在、多大、会不会备份都由 harness 核对后写进去，agent 的理由用原话标明），agent 把它原样放在回复的末尾，结束这一回合。人的下一条消息就是回答：harness 在下一步之前读到它，只在三件事都成立时放行：这条消息来自客户端的输入（`source.kind: 'user'` 且带 `rpcId`）、它之前的最后一条助手消息以这段文字结尾、消息恰是「可以」一类的明确同意词。放行之后，同一派发链里恰好同一个调用（同一工具、同一组参数）在 30 分钟内放行一次，harness 在那一步给 agent 一条说明，带上被拒调用的工具与参数；其余回话都不放行。放行只存在内存里，只由 harness 读人的消息之后写入；违规流水只留痕，项目图不参与授权；进程重启就丢掉，agent 重新申报。使用时重新核对目标：与申报文字里的事实不同就拒绝并作废放行，目标存在且不大于 10 MiB 时一律先备份；再调一次仍被拒。子 agent 不问人，纠偏让它把编号交回给派发它的 agent。拒绝文案不再指向会话里不存在的通道（注入清点 §0）：去掉 `APPLICATION_PROTOCOL` 的那一部分在 G1 先上，带编号的部分随 G4。圈禁顺带补上 `str_replace_editor` 的写入。
- 检查器运行与当轮回传（§6）。项目图的环境分支 `env` 下，每个工具节点的验收条件可以写一行每次改完要跑的检查（命令、输出格式、适用的路径）。agent 用文件工具写成功之后，它的下一步之前 env 行在这些文件上跑适用的检查，至多等 20 秒，把结果以一条 `<system-reminder>` 放在这一步的消息末尾：每个检查器的发现数、至多 5 条带 `文件:行` 的发现（落在本次改动行上的排前面）、完整输出的日志路径（摘要 §4 第 6 条）。没有发现时不出声，除非上一条结果有发现。
- 告警棘轮与压制（§6.7）。棘轮由四处一起守：每次改完的检查只报新发现（本仓库的 ESLint 批量压制让基线里的告警不出现）；汇合门禁跑项目的检查命令（M7 `norm-merge-gate`）；`checker-config` 记下对配置与基线的改动；`suppression-reason` 记下没写理由的新压制。压制注释的总数每天记一次，晨报显示总数与本期变化。
- 环境分支与草稿区（§7）。图上 id 为 `env` 的特性节点是环境分支，子节点是工具节点（用途、用法、选择理由、安装位置、配置文件）。每个 agent 在会话第一步、以及环境分支变化后的下一步收到一条提醒：项目里有哪些工具、怎么用，草稿区在哪。草稿区是工作区的 `.llm/scratch/`；项目没有忽略它时，env 行把一行注释与一行 `/.llm/` 追加进 `.git/info/exclude`，追加之后用 `git check-ignore` 复核，仍未忽略时行健康降级。M7 汇合门禁的第 6 条（草稿区的临时脚本已删除或转正）调用 M4 的 `scratchLeftovers`。
- 清理 `.llm/docs/` 的三个抓取脚本与 `__pycache__`（§8）：删除，保留抓下来的 `_bigmodel_md/`，删除之前把脚本里的地址与重新抓取的办法写进 `docs/reference/bigmodel-guide-digest.md`。
- 不在 M4 里做、M4 要接上的：会丢工作的 git 命令先存快照（`d-main-agent-shell` 定稿）由 M3 第 4 步做（M3 附录 0.3 §2.5），M4 不另做一份。M4 的规则不判 git；快照门与别的门共用跟进记录器，它的拒绝在流水里按拒绝分类（§2.3、§3.3）。

实施（§13）：四条并行的线，互不碰同一个文件。guard 线 G1–G4 串行（影子判定与安装函数、去掉不存在的申报通道 → 跟进、标注与统计 → 四条影子规则 → 申报通道）；env 线 E1–E4（新行 → 环境分支与草稿区 → 检查器 → 压制计数；压制标记表放在 `src/shared/`，E4 不等 G3）；图线 R1（第三次修复之前问人）；清理线 C1。登记文件、晨报与文档由编排者按 §13.3 排先后合入。G4 只等 M3 第 4 步（`dispatchRoot`）合入，不再等 M3 的卡片与以人的身份写图。人放行之后由主 Agent 自己推进到做完（`d-auto-drive`），只在 D1、影子规则转生效与第三次修复三处停下问人；G1–G4 与 C1 按 `norm-review-floor` 全审。

要人定的事（§17）：只剩 D1，七个任务节点「怎样算做完」（改这一项属于必须问人的第 1 类），按 `d-chat-not-cards` 写成一段四行的方案。D2 人已答（选 B）。0.1 的 D3 在 0.2 删去。申报改为对话里回「可以」是 agent 按 `d-chat-not-cards` 定的（§16），写在 D1 的「疑问」一行里请人看一眼。D1 与一页放行稿 `onepage.md` 的问话合成一次问。

## 1. 需求与验收

### 1.1 来源

- `docs/ROADMAP.md` M4：§6.4 的规划规矩；影子模式机制；检查器运行与当轮回传；告警棘轮与压制规则；环境分支与草稿区；清理 `.llm/docs/` 下的抓取脚本。
- 节点 `m4-request-card`（依赖 `m3-5`、`split`，来源 `question-24` 选 A）：圈禁拒绝之后经决策卡申报，写明目标、目的、可逆性与影响面、考虑过的替代；人批准只放行当次，再次调用仍被拒；复用 M3 的 `decision_card` 与以人的身份写图；按所有路由设计。验收在设计时提给人（D1）。其中「经决策卡」「复用 `decision_card`」被之后的 `d-chat-not-cards`（人 2026-10-30：「产品里也不用问答卡、不给选项」）取代：申报改在对话里问，人用下一句话回答（§5）；节点正文与对 `m3-5` 的依赖由编排者按 §18 第 2 条改。
- `docs/ORCHESTRATION.md` §5（同步卡：出工作区操作，批准只放行当次，不产生残留授权）、§6.1（规矩即数据的五样：告知、探测、纠偏、申报、记录）、§6.2（G3）、§6.3（正路与「拦截后下一步走对的比例」）、§6.4、§6.5（影子模式）、§7.1–§7.6（环境、草稿区、检查器、告警）、§10.2（压制注释数、修在根上）。
- `docs/CHARTER.md` §6「新门禁先以影子模式运行」「告警必须修」；§7.1 条款 4（修在根上）、7（失败要出声）、10（不长工具专用目录）、11（处处留痕）。
- 阅读摘要 §4 第 6 条（检查器回传只给几行，全文写日志）、第 7 条（量纠偏是否教会了模型）、第 8 条（用带标注的语料量精确率与召回率，尤其 G3 新覆盖的非 GLM 路由）、第 9 条（凭证读取先记影子）。
- 人在 2026-10-29 的定案：`question-14` G3；`d-failure-plans` 与 `docs/DEVELOPMENT.md` §1.1 的挡路标准；`question-28` C 的并行；验证用的积分预先授权；规则只由人写（`d-rules-human-only`，针对规则板）；问人的话带前因后果（`.agents/tasks/design-context.md`「Questions for the person carry their background」）。
- 人在 2026-10-30 的定案：`d-chat-not-cards`（问人改成聊天；格式定稿见节点的最后一条批注：题目单独一段，背景、推荐、疑问、不做四行各自成段，标签不加粗，每行把重点几个字加粗，问话放在最后；只给一个方案，不编号、不给字母）；它取代 `d-option-card` 与 `d-recommend-last` 对人的问法，所以 0.2 里申报卡与第三次修复待决的表格写法都不再用；`d-ui-look-not-operate`（面板只看不操作，「需要你」只列在等人回话的事，点开跳到主 Agent 的对话）；`d-plain-questions`（验收说「怎样算做完」，标定说「练习题」，门禁说「合入前的检查」，投影、补遗说清是什么）；`d-one-main-agent`（每个项目恰好一个主 Agent，是人唯一的对话窗口）；D2 的回答（选 B，原话「不介意」：只读工具调用的命令文本与路径，不读对话正文，结果留在 `.llm/`，脱敏的个别样本进 `tests/guard-corpus/`）；`d-main-agent-shell` 定稿（主 Agent 随意用命令行与 git，只是没有写文件的工具；harness 只守主干前进的那一刻；编排方的落地细则：会丢掉没提交的改动或改写已推送历史的 git 命令执行前，harness 先存一份可恢复的快照（`git stash create` 加 `refs/hourness/snapshots/` 下的引用，改写历史时打标签）并记下，再放行）；`d-one-main-agent`（每个项目恰好一个主 Agent）；`d-main-agent-models`（子 agent 与审查的模型由主 Agent 选，harness 只记录）；`d-auto-drive`（设计放行之后主 Agent 自己推进到底）；`d-zcode-3171`（ZCode 基线 3.17.1）；`norm-review-floor`（改拦截与权限、删文件等几类改动一律全审，harness 按改动的文件与命令判断）；`d-design-onepage`（每个模块的设计对照方向清单，另写一页人话放行稿，人放行之后才开发；开发中的问题分三档、攒着问、一次至多三件）。

### 1.2 各任务的行为与建议验收（D1）

建议在 `m4` 下另建六个任务节点（§18），与已有的 `m4-request-card` 合起来七个。验收写进节点要人批准；在人定之前，实现与 L2、L3 的检查按下表做。

| 任务 | 行为（本设计） | 建议验收 | 层 |
| --- | --- | --- | --- |
| `m4-shadow` 影子机制与度量 | 规则模式写在代码里；影子判定与记录；拦截后的跟进记录；标注、统计、回放、回归语料；规则目录与规范节点一致（§3） | 1. 模式为 `shadow` 的规则从不拦截：调用照常执行，违规流水里恰好一条 `mode: 'shadow'`、`via: 'rule'` 的记录，带规则、工具、命令或目标、`scope` 与路由；影子规则不出现在 `glm:guard` 声明里。2. 经 `installRuleGate` 安装的规则每拦下一次，同一 agent 下一步里模型发出的第一次调用留下恰好一条跟进记录，不论这次调用又被哪一行拒绝或放行，分为走对正路、原样重试、别的、没有下一步；GLM 上经 `DeferredToolCall` 包装的调用按拆开之后的工具与参数判；与被拦的调用同一步发出的调用不结算；拦截之后回合结束或会话卸载、还没有下一步时记「没有下一步」；晨报按规则写「拦截后下一步走对 x/y」；跟进、申报、放行的记录不计入晨报的违规数，规则板 `mode: 'enforce'` 的记录计入。3. `npm run -s guard -- stats` 按规则与来源（方言 / 其他路由）给出记录数、已标数、该拦、误伤、说不准、精确率，有漏判来源的规则另给召回率；带 `--relay` 的标注算人的。4. `npm run -s guard -- replay` 只读本机会话日志里的工具调用（工具名、shell 命令文本与目标路径，不读写入的内容与对话正文），按规则与来源列出今天的规则会拦的历史调用，输出只写在项目目录下。5. `tests/guard-corpus.spec.ts`：生效的规则对一条语料的判定与标注不一致、且这条没有标为已知误判时失败，并打印每条规则的精确率与召回率。6. guard 框架的每条规则都在目录里，都经 `installRuleGate` 安装，目录里每条规则的模式与它的规范节点的 `模式：` 标签相同；装在 guard 行以外的影子规则判为拒绝时同样留下影子记录 | L2、L3 |
| `m4-rules` 规划规矩 | 四条影子规则；第三次修复之前问人；§6.4 写明每行在哪（§4） | 1. `credential-read`、`suppression-reason`、`checker-config`、`scratch-only` 以影子模式上线：触发的调用照常执行、各留一条影子记录；相邻的不触发情形（读 `~/.dsh` 下别的文件、带 `-- 理由 [节点]` 的压制、改普通源文件、在已有同类文件的目录里新建 `.ts`）不留记录。2. LLM 第 3 次把同一节点从 `done` 改回 `doing`（第 3 次修复开始）时，节点下出现一张由 harness 提出、决定者为人的待决，正文是一段四行的方案（题目，背景、推荐、疑问、不做，最后一句问话），不含 `验收`、`标定`、`门禁`、`投影`、`补遗`；`graph_status` 的结果让主 Agent 在回复里问人；这张待决未拍板时之后的重开不再加。3. `docs/ORCHESTRATION.md` §6.4 的每一行写明在哪一行实现、模式与状态 | L2、L3 |
| `m4-request-card` 申报通道 | 拒绝带编号；`request_exception` 返回 harness 写的方案文字，agent 原样问人；人的下一句话决定；一次性放行；使用时核对目标并备份；拒绝文案改写（§5） | 1. 圈禁拒绝的纠偏带申报编号，点名 `request_exception` 与它的四个字段；它从不指向本会话没有的通道（子 agent：把编号交回给派发它的 agent）。2. `request_exception` 返回一段由 harness 写的方案文字：题目，背景、推荐、疑问、不做四行各自成段，最后一句问话；写明解析后的路径、文件在不在、大小或行数、覆盖前会不会备份，agent 写的目的、可逆性与影响面、替代用「」标成原话；不含 `验收`、`标定`、`门禁`、`投影`、`补遗`。3. 只有人的下一条消息能批准：它来自客户端的输入（`source.kind: 'user'` 且带 `rpcId`），它之前的最后一条助手消息以这段文字结尾，消息去掉首尾空白与句末标点后恰是同意词表里的一个（如「可以」）；这时同一派发链里同一个调用（同一工具、同一组参数）在 30 分钟内放行一次，agent 在这一步收到一条说明，带被拒调用的工具与参数；第二次同样的调用与任何不同的调用仍被拒。别的回话、在这段文字之后又说了别的、文字被改过，都不放行，agent 各收到一条说明。4. 放行只有这一个来源：向违规流水追加任何记录（含伪造的申报与回答）、改项目图、模型自己写的任何文字都不产生放行。5. 使用时目标的存在与否、大小、修改时间与申报文字里的不同时，这次调用被拒、放行作废；相同时，目标存在且不大于 10 MiB 就先把旧内容复制到项目目录，复制失败时这次调用被拒、放行不作废。6. 进程重启之后未答的申报与未用的放行都没有了，agent 重调被拒的调用拿新编号再申报。申报、人的回话（原话）、放行的使用与作废各在违规流水里记一条，写明何时、哪个会话；晨报计数。7. GLM 与非 GLM 路由上都成立；`str_replace_editor` 写工作区外与 `write`、`edit` 一样被圈禁拒绝 | L2、L3；L4 |
| `m4-checks` 检查器当轮回传 | 每次改完在下一步之前跑检查，紧凑回传（§6） | 1. agent 的文件工具写入成功、文件被已批准的工具节点覆盖时，这个 agent 的下一步带一条提醒：每个检查器的发现数，至多 5 条 `文件:行` 的发现（落在改动行上的排前面），日志路径；完整输出在日志里；没有发现时不出提醒，除非上一条提醒有发现。2. 检查命令只来自已批准的工具节点；改动文件的路径按平台加引号，文件名里的 `$(…)`、反引号、`$变量` 不被 shell 展开；每个检查日志的第一行是展开之后的完整命令；跑不起来、超时（60 秒）或输出读不懂时，提醒与行健康写明；同一检查器在一个会话里连续失败 3 次后本会话不再跑它。3. 一步至多等 20 秒，跑得慢的结果在之后的步里送到。4. 改了没有任何已批准检查器覆盖的语言的文件时，每个会话每种语言提醒一次，写明社区默认的检查器与怎样提议工具节点 | L2、L3；L4 |
| `m4-env` 环境分支与草稿区 | 环境分支的格式与会话提醒；草稿区与 git 忽略；给 M7 的草稿区清单（§7） | 1. 图上 `env` 特性的工具子节点，在每个 agent 的会话第一步、以及环境分支变化后的下一步列出（至多 12 个、1500 字符），带草稿区一行。2. 会话所在仓库里 `git check-ignore -q .llm/scratch/x` 的退出码为 0；项目没有忽略时 env 行在 `.git/info/exclude` 末尾追加一行注释与一行恰为 `/.llm/` 的模式（已有这一行时不追加，重启多次也只有一份），追加之后再核对一次，仍未忽略时行健康降级并写明原因。3. `scratchLeftovers(根目录)` 列出草稿区里的文件（M7 汇合门禁用） | L2、L3 |
| `m4-suppressions` 压制计数 | 每天记一次已跟踪文件里的压制注释数，晨报显示（§6.7） | 1. 压制注释数每天至多记一次（`<项目目录>/audit/suppressions.jsonl`），按标记分类。2. 晨报写「压制注释 N 处（本期 +a / −b）」 | L2 |
| `m4-cleanup` 清理抓取脚本 | 删除三个脚本与 `__pycache__`，先把地址与重新抓取的办法写进文档（§8） | 1. `.llm/docs/` 下没有 `_crawl_bigmodel.py`、`_fetch_bigmodel.py`、`_fetch_extra.py` 与 `__pycache__`；`_bigmodel_md/` 不变。2. `docs/reference/bigmodel-guide-digest.md` 的「附」写明重新抓取的办法，并逐字列出三个脚本里的地址与路径字面量；提交信息记下三个脚本的 SHA-256 | L1 |
| `m4`（特性） | 上面七项合起来 | 不变（`m4` 没有验收字段，随子节点关闭）；批次 L4 通过（§14.3） | L4 |

### 1.3 非功能需求

- 不增加人的负担（`question-27` B）：M4 新增的给人的东西只有两种，都在对话里：申报（人本来就要批出工作区的写入，`docs/ORCHESTRATION.md` §5；人回一句「可以」）与第三次修复之前的一问。两种都是 harness 写好的四行方案，人凭直觉说对不对（`d-chat-not-cards`）。影子记录、标注、统计不打扰人；人只在 M7 的周报阶梯提出「影子转生效」时看一次数字与至多 5 条样本。
- 检查器回传占的上下文小：每条提醒至多 1200 字符；没有发现不出声。
- 每条新规则先影子（`docs/CHARTER.md` §6）。§7.6 的「没写理由的新增压制直接拦下」是生效后的状态，按 §3.5 的判据转过去。
- 失败要出声：每一项降级都进行健康；拦截、影子、跟进、申报、放行的每一件事都在违规流水或图上留一条记录。
- 对所有路由与模型生效（G3）；不装 GLM 通道包时同样成立。

### 1.4 不做（详见 §15）

装工具走同步卡（`docs/ORCHESTRATION.md` §7.3）的探测、惯犯升级（§6.6）、格式化工具的自动修复、规范阶梯的提议与周报（M7）、规则板的实现（规则板设计的 R1–R7，与 M4 同一里程碑、另一条线）。

## 2. 总体设计

### 2.1 依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）

- 度量：信息检索的精确率与召回率，按来源分层的抽样标注（每层样本数与误判条数一起报，不只报比例）；回放历史数据作为离线影子，与实时影子分开计数。
- 静态分析的工程经验：Sadowski 等对 Google Tricorder 的总结（ICSE 2015；CACM 61(4), 2018）：分析结果在开发者改代码的那一刻、只在改动处给出；开发者认为是误报的比例（effective false positive）超过约 10% 的检查会被关掉或不被理会。对应本设计的当轮回传、改动行优先、影子期先量误伤。ESLint 的禁用注释描述（`-- reason`）与 TypeScript 的 `@ts-expect-error`（不需要时报错）是压制注释写理由的现成做法。
- 安全工程：最小授权（一次性、绑定到一个调用、有时限）；授权只认模型写不进去的来源（客户端送进来的人的消息，由宿主标 `source.kind: 'user'` 与 `rpcId`），模型能写的文件与项目图只作留痕；人批的就是他读到的那段文字（文字由 harness 写，必须原样出现在人回话之前的最后一条助手消息末尾）；同意要明确（同意词表之外一律不放行，fail-closed）；判定器出错放行、授权缺证据即拒（fail-open 只给探测，授权 fail-closed）；批准的事实与执行时的事实一致才执行（检查时与使用时之间的变化，TOCTOU）；可逆优先（覆盖前备份）；外部命令的参数按目标 shell 的引号规则转义。
- 人因与认知负荷：问人只给一个方案，背景、推荐、疑问、不做四行（`d-chat-not-cards` 的依据：对一个具体方案凭直觉判断对不对，比逐条比较几个选项省力）；问话带前因后果、用人学过的词（`d-plain-questions`）；人回一句话就行，不点按钮；人只看数字与少量样本。
- 可靠性：外部进程有超时并结束整棵进程树；输出有上限；全部异步、不阻塞宿主事件循环；每条降级有行健康。
- 隐私与数据最少化：回放只读工具调用的名字与参数，结果留在不入库的项目目录；进入仓库的样本先脱敏，再过密钥扫描。

### 2.2 构件与位置

全部在编排层包 `dsh-hourness`（`packages/hourness/`）。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `env`。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 规则模式 `RuleMode`、`GuardRule.mode`、`rightPath`；`judge(rules, call, face)`；`evaluate` 删除；圈禁与 file-tools-only 的例外文案改写（G1 去掉 `APPLICATION_PROTOCOL`，G4 加编号）；圈禁覆盖 `str_replace_editor` | `src/guard/rules.ts` | 改（G1、G4） |
| 唯一的安装函数 `installRuleGate`：跟进的 `observe`、`judge`、放行、拒绝记录、`next()` 之后的影子记录、判定出错进行健康 | `src/guard/gate.ts` | 新建（G1；G2 接跟进，G4 接放行） |
| 流水记录的类型：`RuleShadowRecord`、`FollowupRecord`、`RequestRecord`、`GrantRecord`、`GrantVoidRecord`；`ViolationRecord` 加 `call` 与 `ref`；`GuardRecord` 联合类型移到这里；唯一的分类函数 `classifyRecord`；`recordKey(line)`；`subjectOf(call)` | `src/guard/records.ts` | 新建（G1） |
| 代码规则目录 `GUARD_RULES`（id、所在行、模式、标题） | `src/guard/catalog.ts` | 新建（G1） |
| 拦截后的跟进：模块级的共用记录器 `observe`、`noteDenial`、`sessionEvent`、`sessionDisposed`、`followupOf` | `src/guard/followup.ts` | 新建（G2） |
| `DeferredToolCall` 的拆包 `unwrapDeferredCall(name, args)`（纯函数，跟进、回放、改动文件三处共用） | `src/shared/deferred-call.ts` | 新建（G2 或 E3，谁先开工谁建，另一方导入） |
| `graph-files-only` 改经 `installRuleGate` 安装（行为不变） | `src/guard/graph-files.ts` | 改（G1） |
| 标注、统计、转生效判据 `PROMOTION`（纯函数） | `src/guard/measure.ts` | 新建（G2） |
| 会话日志的解码与回放 | `src/guard/replay.ts` | 新建（G2） |
| 回归语料的格式与脱敏（纯函数） | `src/guard/corpus.ts` | 新建（G2） |
| 命令行 | `src/guard/cli.ts`、`scripts/guard/cli.mjs`；根 `package.json` 加脚本 `guard` | 新建、改（G2） |
| 每次调用的判定上下文（目标是否存在、旧内容、已跟踪文件、凭证路径、配置文件名） | `src/guard/context.ts` | 新建（G3） |
| 路径提及的匹配（从 `graph-files.ts` 抽出 `mention`、`pathKey`） | `src/guard/mention.ts`；`src/guard/graph-files.ts` 改为导入 | 新建、改（G3，行为不变） |
| 四条影子规则 | `src/guard/credential-read.ts`、`suppression.ts`、`checker-config.ts`、`scratch.ts`（另导出 `SCRATCH_DIR`、`scratchLeftovers`） | 新建（G3） |
| 压制注释的标记表 `SUPPRESSION_MARKERS`（纯数据，`suppression-reason` 与压制计数共用） | `src/shared/suppression-markers.ts` | 新建（G3 或 E4，谁先开工谁建，另一方导入） |
| 申报编号、`request_exception` 工具、申报文字、读人回话的判定 `answerOf`、同意词表 `APPROVAL_WORDS` 与 `DECLINE_WORDS`、放行簿 `GrantBook`（只在内存）、使用时的核对与备份 | `src/guard/request.ts` | 新建（G4） |
| harness 写给人的方案文字的格式 `renderPlan({title, background, recommend, doubt, notDoing, attachments?, question})`（纯函数；题目一段，四行各自成段，标签不加粗，每行一处加粗，问话最后；行长、加粗与换词不合时抛错，§5.4） | `src/graph/plan-text.ts` | 新建（G4 或 R1，谁先开工谁建，另一方导入） |
| 换词表 `PLAIN_WORDS` 与查词函数 `plainWordsIn`（`renderPlan` 与 L2 用） | `src/graph/plain-question.ts` | M3 第 3 步建（M3 附录 0.3 §2.8）；G4 先开工时照它的内容建，M3 改成导入 |
| guard 行：经 `installRuleGate` 判定、准备上下文、注册 `request_exception`、每个根 agent 一条步 notice（读人的回话、给出放行或不放行的说明，来源 `hourness-request`）、行健康 | `src/guard/index.ts` | 改（G1–G4） |
| 第三次修复之前的待决（重开计数与待决的构造，纯函数）；`graph_status` 成功后调用 | `src/graph/reopen.ts`；`src/graph/tools.ts` | 新建、改（R1） |
| env 行入口：每 agent 装两条步 notice（检查结果、环境提醒）、草稿区忽略、压制计数、行健康 `env` | `src/env/index.ts` | 新建，行 `glm-hourness/env`，默认禁用（E1） |
| 环境分支的读取：工具节点、检查行的语法（纯函数） | `src/env/branch.ts` | 新建（E2） |
| 环境提醒的渲染 | `src/env/notice.ts` | 新建（E2） |
| 草稿区的 git 忽略（核对、追加两行、去重、复核） | `src/env/ignore.ts` | 新建（E2） |
| 检查的运行（进程、超时、日志、轮转） | `src/env/runner.ts` | 新建（E3） |
| 输出解析 `eslint-json`、`tsc`、`lines`；改动行的范围 | `src/env/parsers.ts`、`src/env/changed-lines.ts` | 新建（E3） |
| 检查结果提醒的渲染 | `src/env/check-notice.ts` | 新建（E3） |
| 压制注释计数 | `src/env/suppressions.ts` | 新建（E4） |
| 晨报：拒绝与影子两处过滤改用 `classifyRecord`；影子一节带标注数与误伤数；拦截后走对的比例；申报与放行；压制注释数 | `src/workflow/morning-report.ts` | 改（G1 的过滤、G2、G4、E4） |
| 行健康表加 `env` | `src/shared/health.ts` 的 `HOURNESS_ROWS` | 改（E1） |
| 工具名契约 `GUARD_TOOL_NAMES = ['request_exception']`（不常驻） | `src/shared/tool-names.ts`、`tests/contracts.spec.ts` | 改（G4） |
| 行登记：`env` 行排在编排层宿主行的最后、`ui` 之前，`disabled: true`；按 `6134c83` 的做法在补丁里写 `name: dsh-hourness/env`，导出 `./env` 与 `./env/locale/*.json`，设置页的标题与说明放在 `locale/env/` | `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`packages/hourness/package.json`、`packages/hourness/locale/env/en.json` 与 `zh.json`、`packages/hourness/tsconfig.json`（随表）、`tests/contracts.spec.ts` 的字面行 id 清单 | 改、新建（E1） |
| 回归语料 | `tests/guard-corpus/cases.jsonl`、`tests/guard-corpus.spec.ts` | 新建（G2） |
| 假宿主补 rc.3 的信号：根调用的 `tool/call` 事件先于 `tools/pre-execute`（G2）、`turn/end` 与 `session/disposed`（G2）、步 notice 的 `messages` 里客户端送来的人的消息（`source: {kind: 'user', rpcId}`，G4）；已有的不重复加 | `tests/fake-rc3.ts` | 改（G2、G4） |
| 探针场景 | `scripts/probe/` 下新场景（§14.1） | 改（G1–G4、E1–E3） |

`renderPlan` 放在 `src/graph/` 而不是 `src/shared/`：公共库编进两个包，不能导入图目录的换词表；它只给编排层包用，guard 目录今天就导入图目录（`src/guard/index.ts` 导入 `src/graph/service.ts`），方向不变。

不加的东西：图节点的新字段（工具节点的检查行与配置文件写在验收条件里；申报不留在图上，§5.8）；图引擎的权限改动；问答卡（`d-chat-not-cards`）；新依赖（会话日志的 zstd 解码用 Node 自带的 `zlib`）。配置项：env 行只有与图行同形的 `home`、`fs`；guard 行不加配置项。

### 2.3 与其他设计的分工（什么在哪）

| 东西 | 在哪 | 归谁 |
| --- | --- | --- |
| 代码规则的模式（影子 / 生效） | `GuardRule.mode`，写在代码里，改它是一次提交 | M4。guard 行的规则、图行注册的 `graph-files-only`、M3 的两条写入规则、M7 的五条写入规则都用同一个字段；M3 的两条按 `question-25` 直接生效，M7 的规则开工时自己定 |
| 代码规则的执行（判定、拒绝、影子记录、跟进、判定出错） | `installRuleGate`（`src/guard/gate.ts`） | M4。所有用 guard 框架的行都经它装 `tools/pre-execute` 监听器，不再各写一份：guard 行、图行（G1 改）、M3 的 `installMainAgentRules`（M3 第 4 步；M3 先合入时由 G1 改成经它安装，行为不变）、M7 的写入规则。契约测试核对（§3.8） |
| 影子记录与拦截记录的流水 | `<项目目录>/audit/violations.jsonl`，影子带 `mode: 'shadow'` | 格式已有（split 第 7 步）；M4 加 `via: 'rule'` 与跟进、申报、放行、作废四种记录，和唯一的分类函数 `classifyRecord`（§3.2）。读这份流水的代码都用它：晨报、`ruleStats`、命令行、M7 的 `ladderProposals`、规则板的规则页 |
| 人写的规则的执行方式 `shadow`、检测器的影子期 | 规则板的状态与它的 `judge`（规则板自己的 `tools/pre-execute` 监听器，`prepend`） | 规则板（§2.3、§5.5、§6.2）。M4 不实现人写的规则，规则板也不经 `installRuleGate`（它的判定、排队与等待单是另一套）。两边的分工：执行方式与影子期的判定各管各的；度量只有 M4 一份。规则板写进同一份流水的记录（`rule: 'rules:<id>'`、`mode`、`effect`）由 `classifyRecord` 分类，`mode: 'enforce'` 算拒绝、`mode: 'shadow'` 算规则影子，M4 的标注与统计照样处理；规则页上「人标过的误判数」取 `ruleStats` 对 `labels.jsonl` 的结果，规则板不另存标注，`hits.json` 只是每天的命中次数。规则板的监听器第一件事调 `observe`（§3.3），guard 规则拦截之后下一次调用被规则板拦下时，跟进记录才不会漏；规则板拒绝时调 `noteDenial`（规则 id 为 `rules:<id>`，没有 `rightPath`），规则板的拦截因此也有跟进记录（§18 第 5 条请规则板加这两行；规则板没加时，M4 的验收只覆盖经 `installRuleGate` 的拦截） |
| 标注、精确率与召回率、回放、回归语料 | `src/guard/measure.ts`、`replay.ts`、`corpus.ts` | M4 |
| 影子转生效的判据数字 | `PROMOTION`（`src/guard/measure.ts`） | M4 定数与含义（§3.5）。M7 §3.12.2 今天写「近 14 天影子记录不少于 20 条，且人没有标过误判」，数字与 M4 相同、含义不同（M4 数的是带标注的会拦样本，含回放；14 天是实时影子从第一条记录起的时长）；M7 那一行改为引用 `PROMOTION` 并采用 M4 的含义（§18 第 5 条） |
| 何时提议转生效、问人 | 周报阶梯 `ladderProposals` | M7。M7 合入之前由编排者按 `stats` 的输出手动提 |
| 代码规则目录 | `src/guard/catalog.ts` | M4。规则板 §10.1 的只读目录（`src/rules/builtin.ts`）改为导入它，不另写一份；先合入的一方先建，后到的一方改成导入 |
| 草稿区的位置与清单 | `SCRATCH_DIR`、`scratchLeftovers`（`src/guard/scratch.ts`） | M4。M7 汇合门禁在第 4 步之后加一步「草稿区为空」，不为空时拒绝 `scratch_left`（列文件，正路「删除或转正：移进 `scripts/`、挂节点、写明用途」）；M7 §11 的「等 M4 定草稿区」由此解除 |
| 汇合门禁跑的命令 | 规范节点 `norm-merge-gate` 的验收条件 | M7 |
| 每次改完跑的检查 | env 工具节点的验收条件（§6.1） | M4。M7 的门禁解析器把不是它五种写法的行当说明，所以两边互不干扰 |
| harness 写给人的方案文字（题目，背景、推荐、疑问、不做四行，问话） | `renderPlan`（`src/graph/plan-text.ts`） | M4 建（申报与第三次修复两处用）。M3 的身份节与工具说明是叫模型自己这样写，不经这个函数；M3 以后有 harness 自己写给人的方案时导入它，格式再改只改这一个文件（`design-context.md`「keep the card display rules in one section」在聊天格式下的对应做法） |
| 卡片、卡片回答的解析、以人的身份写图 | 不用 | M4 0.2 用 M3 的这几个函数出申报卡；`d-chat-not-cards` 之后申报在对话里问，人的回话由 harness 直接读，图不参与授权，所以 M4 不再导入 M3 的 `src/design/cards.ts`、`human-writes.ts`，也不再要求把它们移到 `src/graph/human-card.ts`（§18 第 5 条撤回给 `m3` 的那条批注） |
| 派发链的根 `dispatchRoot`；图行服务的 `focusOf` | `src/guard/main-agent.ts`；`src/graph/service.ts` | M3。申报用 `dispatchRoot`；`focusOf` 只用来在申报文字的背景一行写出焦点节点的标题，读不到时省去这半句 |
| 主 Agent 不写文件、设计期只读 | `main-agent-no-write`、`design-before-release` | M3 |
| 会丢工作的 git 命令先存快照（`d-main-agent-shell` 定稿） | `src/guard/git-snapshot.ts`（M3 附录 0.3 §2.5，M3 第 4 步） | M3（主 Agent 自己的 shell 调用）；子 agent 的 git 归 M7 的派发。M4 的规则不判 git：file-tools-only 今天就放行 git 命令（§5.2 的例外文案照旧写明），G3 的四条影子规则只看文件工具、读工具的路径与凭证提及。M4 只要求快照门与别的门共用跟进：监听器第一件事调 `observe`，存不了快照而拒绝时调 `noteDenial`（规则 id `git-snapshot`）；它的拒绝记录不带 `mode`，`classifyRecord` 算拒绝；快照记录写在仓库的 git 目录里，不进违规流水（§3.3、§18 第 5 条） |
| 必须全审的改动 | `norm-review-floor`（harness 按改动的文件与命令判断） | M7 执行。M4 的 G1–G4、C1，以及之后每一次改规则的模式、改可申报名单、改同意词表，都落在清单上（§13） |
| 设计放行之后谁推进、子 agent 用什么模型 | 主 Agent（`d-auto-drive`、`d-main-agent-models`） | M7。M4 只写哪几处必须停下问人（§13） |
| 子 agent 只写写入范围 | `worker-scope` 等 | M7 |
| 人在面板上拍板 | 不用 | `d-ui-look-not-operate`：面板只看不操作；申报不经面板 |
| 系统看得到的数统一记进一份事件流水（`metrics`，已批，设计进行中） | 指标设计 | M4 的记录先写违规流水，每一行经 `classifyRecord` 都能归类；指标设计定稿时由它决定怎样转写，M4 不预留 |
| guard 声明里规则板的一行 | `glm:guard` 节 | 规则板 §6.4；M4 只让影子规则不进声明 |

## 3. 影子模式机制（`m4-shadow`）

### 3.1 模式写在代码里

`src/guard/rules.ts`：

```ts
/** enforce: a deny verdict blocks the call. shadow: a deny verdict is recorded and the call runs. */
export type RuleMode = 'enforce' | 'shadow'

export interface GuardRule {
  readonly id: string
  /** Default 'enforce'. Changing it is a commit that cites the human's decision (§3.5). */
  readonly mode?: RuleMode
  readonly declare: string | ((face: ToolFace) => string)
  detect(call: ToolCall, face: ToolFace): RuleVerdict
  /** Whether `next` took this rule's right path after `denied` was denied (§3.3); absent: never counted as right. */
  rightPath?(next: ToolCall, denied: ToolCall): boolean
}
```

为什么在代码里：模式决定拦不拦，改它属于放宽或收紧门禁。放在图上的规范节点正文里，LLM 能改正文（引擎只禁止改验收条件与非目标）；放在行配置里，就按 profile 而不是按产品走，也绕过评审。写在代码里，转换是一次带评审与测试的提交，提交信息引用人的拍板。图上的规范节点仍写 `模式：影子 | 生效`（M7 §3.12.1 的标签），由契约测试核对它与代码一致（§3.8）。

`judge(rules, call, face): Judgement`：

```ts
export interface RuleDeny { readonly rule: string, readonly correction: Correction }

export interface Judgement {
  /** Every enforced rule that denies, in rule order; the model reads the first one left after grants (§5.6). */
  readonly denies: readonly RuleDeny[]
  /** Every shadow-mode rule that would deny, in rule order. */
  readonly shadows: readonly RuleDeny[]
  /** Rules whose detector threw (fail-open: they neither deny nor shadow). */
  readonly errors: readonly string[]
}
```

每条规则都判一次；生效规则的拒绝全部列出（一个放行只去掉它自己那条规则的拒绝，§5.6）；影子规则判为拒绝的全部列出；抛错的规则放行并记下 id。

`evaluate` 删除。它只返回第一个拒绝，别的行用它装监听器时影子规则的判定会悄无声息地丢掉，看上去和一次也没命中一样。取而代之的是唯一的安装函数（`src/guard/gate.ts`）：

```ts
export interface GateRules {
  readonly rules: readonly GuardRule[]
  readonly face: ToolFace
  /** Where the call ran (src/guard/origin.ts); every record carries it. Facts the rules need (§4.1) are prepared inside `rules` and bound into the rule objects. */
  readonly origin: { readonly scope: RouteScope, readonly route?: Route | undefined }
}

export interface RuleGateOptions {
  /** Row name for health and console warnings. */
  readonly row: string
  /** Outermost (cordis prepend) or in registration order. */
  readonly prepend: boolean
  /** The rules for one root call; undefined: this row has nothing to judge here (the call still settles a follow-up). */
  rules(payload: ToolExecutionPayload, call: ToolCall): Promise<GateRules | undefined> | GateRules | undefined
  readonly journal: (record: GuardRecord) => void
  /** Guard row only (§5.6): may lift an enforced deny of a requestable rule for this one call. */
  readonly grants?: GrantBook
  /** After the inner listeners allowed the call (the guard row feeds its workspace-change fallback). */
  allowed?(payload: ToolExecutionPayload, origin: GateRules['origin']): void
  /** Detector errors and other degradations, per session. */
  readonly health?: (sessionId: string | undefined, problem: string) => void
}

/** The row's context: pre-execute, service lookup, and the two session observers the follow-up recorder needs (§3.3). */
export type GateHost = PreExecuteHost & ServiceLookup & SessionObserverHost

export function installRuleGate(ctx: GateHost, options: RuleGateOptions): () => void
```

`installRuleGate` 除了 `tools/pre-execute` 监听器，还给这一行订阅 `session/event` 与 `session/disposed`，原样交给记录器的 `sessionEvent`、`sessionDisposed`（§3.3）；几行都订阅时记录器按事件去重，所以哪几行启用都不影响跟进。返回的函数一起退订。

装上的 `tools/pre-execute` 监听器对每次调用依次做：

1. 带 `parent` 的子调用 `next()`（同今天）。
2. 调用名经 `toNativeTool(dialectService(ctx), payload.name)` 换成原生名。
3. `observe(payload.agent, call, payload.callId)`（§3.3）：结算这个 agent 未判的跟进，不论这次调用之后被谁拒绝或放行；`DeferredToolCall` 的包装在这里先拆开。
4. `options.rules(...)`；为 `undefined` 时 `next()`。
5. `judge`；`errors` 交给 `health`，控制台每条规则每个会话告警一次。
6. `grants`（只有 guard 行有）对 `denies` 里可申报的规则查放行（§5.6），匹配的那一条拒绝去掉；去掉之前做 §5.6 的使用时核对与备份，其中任何一步要求拒绝时，这条拒绝换成 §5.6 写的那条理由，不去掉。
7. `denies` 仍非空：每条拒绝写一条 `ViolationRecord`（一次调用被两条规则拒绝就是两条，各算各的规则）；`noteDenial` 记下模型读到的那一条（第一条）供跟进；返回 `deny`，理由是第一条的纠偏。
8. `decision = await next()`。`decision.kind === 'allow'` 时：消耗第 6 步的放行（§5.6）；对 `shadows` 里每一项写一条 `RuleShadowRecord`；调 `allowed`。内层不放行（别的监听器拒绝、`ask`、`cancel`）时不消耗放行、不写影子记录：调用本来就没执行，影子规则没有改变结果。

`installGraphFileGuard` 在 G1 改为调用 `installRuleGate({row: 'graph', prepend: true, rules: …})`，纠偏、记录与先后不变。M3 的 `installMainAgentRules` 同样经它安装（谁后合入谁改）。`tests/contracts.spec.ts` 核对：目录（§3.8）里所在行不是 `guard` 的规则，所在行的入口经 `installRuleGate` 安装（L2：在假宿主上装各行，`tools/pre-execute` 的监听器都来自 `gate.ts`，做法是 `installRuleGate` 给它装的每个监听器打一个模块私有的标记，测试按标记数）。

声明：`declarationSection` 只列 `mode` 不是 `shadow` 的规则（`src/guard/index.ts`）。影子规则不告知模型：它不拦，告诉模型「会被拒绝」不是真的；转生效时声明随之多一行，这是所有路由上的一次提示词改动，转生效的那一问要写明这一点（摘要 §4 第 2 条）。

### 3.2 判定与记录

guard 行（`src/guard/index.ts`）改为调用 `installRuleGate({row: 'guard', prepend: false, rules, journal, grants, allowed, health})`（普通注册，位置同今天）：

- `rules(payload, call)`：取路由与 `face`、取圈禁根（不变）；准备判定上下文（§4.1，只有涉及文件或 shell 的调用才读文件系统）；返回 `activeRules(...)`；同时按今天的 `guardHealth` 报行健康。
- `grants`：申报通道的放行簿（§5.6，G4 起）。圈禁拒绝时，`ViolationRecord` 带这次的 `ref`（G4 起）。
- `allowed`：交给工作区变更兜底（不变）。

记录（`src/guard/records.ts`）：

```ts
export interface RuleShadowRecord {
  readonly at: string
  readonly rule: string
  readonly mode: 'shadow'
  /** Distinguishes a rule's verdict from the workspace-change fallback's record, which carries `paths`. */
  readonly via: 'rule'
  readonly tool: string            // the name the model called
  readonly call: CallSubject       // native tool and what it touched
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  readonly scope: RouteScope
  readonly route?: Route | undefined
  readonly correction: string      // what the model would have read
}

/** What one call touched, as the journal keeps it: shell text up to 8 KiB, or the resolved target. */
export interface CallSubject {
  readonly tool: string            // DSH native
  readonly command?: string
  readonly target?: string
}
```

`ViolationRecord` 加可选的 `call?: CallSubject` 与 `ref?: string`，旧记录没有这两个字段。工作区变更兜底的 `ShadowRecord` 不变（它有 `paths`、没有 `via`）。`GuardRecord` 联合类型移到 `records.ts`（加上下面四种新记录），`src/guard/index.ts` 再导出，`src/workflow/morning-report.ts` 与 `src/memory/audit.ts` 的导入不变。

新记录都带 `kind`，字段全部写在这里（评审第 2 轮 N14），G1 一次建好类型，G2、G4 只往流水里写：

```ts
interface RecordOrigin {
  readonly at: string
  readonly rule: string
  readonly tool: string            // the name the model called
  readonly agentId?: string | undefined
  readonly sessionId?: string | undefined
  readonly scope: RouteScope
  readonly route?: Route | undefined
}

/** §3.3: what the model did after a denial. */
export interface FollowupRecord extends RecordOrigin {
  readonly kind: 'followup'
  readonly denial: string          // recordKey of the denial
  readonly outcome: 'right-path' | 'repeat' | 'other' | 'none'
}

/** §5.3, §5.5: one step of a request. `tool` is the denied call's tool. */
export interface RequestRecord extends RecordOrigin {
  readonly kind: 'request'
  readonly ref: string
  readonly outcome: 'asked' | 'approved' | 'declined' | 'unclear' | 'not-shown' | 'not-client' | 'closed' | 'expired'
  readonly target?: string
  /** approved and declined: the answer came from the human's own message through the DSH client. */
  readonly by?: 'human'
  readonly via?: 'chat'
  /** The human's message, verbatim, at most 500 characters (approved, declined, unclear, not-client, not-shown). */
  readonly words?: string
  /** The DSH message id of the human's message. */
  readonly messageId?: string
}

/** §5.6: an approval was used. */
export interface GrantRecord extends RecordOrigin {
  readonly kind: 'grant'
  readonly ref: string
  readonly signature: string
  readonly call: CallSubject
  readonly backup?: string         // <project home>/requests/<ref>.before
}

/** §5.6: an approval was voided at use time. */
export interface GrantVoidRecord extends RecordOrigin {
  readonly kind: 'grant-void'
  readonly ref: string
  readonly reason: string          // what changed, or the stat error code
}
```

分类。今天的晨报把没有 `mode` 的记录算拒绝、`mode === 'shadow'` 的算影子（`src/workflow/morning-report.ts`:38–39）；新记录没有 `mode`、其中两种带 `rule`，照今天的过滤会被算成违规，规则板 `mode: 'enforce'` 的拒绝又两边都不收。所以读流水的代码一律经同一个函数分类：

```ts
export type RecordClass = 'denial' | 'rule-shadow' | 'fallback-shadow' | 'followup' | 'request' | 'grant' | 'grant-void' | 'unknown'

/**
 * One journal line's class. `kind` present: that kind ('followup', 'request', 'grant', 'grant-void'; any other kind is 'unknown').
 * No kind: `mode: 'shadow'` with `paths` is the workspace-change fallback, `mode: 'shadow'` otherwise a rule's shadow
 * (guard framework or rules board); no `mode`, or `mode: 'enforce'` (rules board), with a string `rule` is a denial.
 * Anything else is 'unknown': counted and reported as an unreadable line, never as a denial.
 */
export function classifyRecord(line: Readonly<Record<string, unknown>>): RecordClass
```

晨报的两处过滤、`ruleStats`、命令行的 `records` 都用它；M7 的 `ladderProposals` 与规则板的规则页读流水时同样用它（§2.3）。G1 改晨报的过滤并加 L2：一条 `FollowupRecord` 与一条 `GrantRecord` 不增加「违规」计数；一条 `mode: 'enforce'` 的规则板记录算拒绝；一行 `{"kind": "x"}` 算读不懂、不算拒绝。

记录的键：`recordKey(line)` 是这一行 JSON 文本（不含换行）的 SHA-256 前 12 位十六进制。流水只追加不改写，所以键稳定；旧记录也有键，不需要改格式。

规则板的记录（规则板 §10.5：`rule: 'rules:<id>'`、`mode: 'enforce' | 'shadow'`、`effect`）在同一份流水里，同样有键、能标注、进统计。

### 3.3 拦截之后的下一步

`docs/ORCHESTRATION.md` §6.3 的度量「拦截后下一步走对的比例」量的是门禁有没有教会模型。`src/guard/followup.ts` 导出一个模块级的记录器：

```ts
export interface PendingDenial {
  readonly rule: string
  readonly call: ToolCall              // native name and arguments, unwrapped (DeferredToolCall's target)
  readonly key: string                 // recordKey of the denial's journal line
  readonly rightPath?: GuardRule['rightPath']
  readonly origin: Origin
}
/** The model read this denial; settle it on the agent's next model-issued call. `callId` is the denied execution's id (`<id>:deferred` for a wrapped call). */
export function noteDenial(agent: AgentLike, callId: string, denial: PendingDenial): void
/** First thing every gate listener does for a root call: settles the agent's pending follow-up once per model call. */
export function observe(agent: AgentLike | undefined, call: ToolCall, callId: string): void
/** session/event: `tool/call` maps a call id to its turn and step; `turn/end` settles the session's pending denial as `none`. */
export function sessionEvent(session: SessionLike, event: SessionEventLike): void
/** session/disposed: settles the session's pending denial as `none` and drops its maps. */
export function sessionDisposed(session: SessionLike): void
```

记录器在内存里按 agent 记最近一次拦截（`PendingDenial` 加上会话 id、回合与步）。

只结算模型发出的调用。一次调用的 `callId` 在这个 agent 的会话里有一条 `tool/call` 事件，才算模型发出的：agent loop 先追加 `tool/call` 再过 `tools/pre-execute`（`startCall` 里 `appendToolCall` 在 `prepare` 之前，agent-loop:578–582、681–690〔实读〕），`session.append` 同步通知 `session/event` 的监听器（session:1574–1593〔实读〕），所以 `observe` 运行时映射已经在了。`sessionEvent` 收到 `tool/call` 时记下 `<会话 id>:<callId> → {turn, step}`，每个会话至多 512 条，最早的先出。`DeferredToolCall` 的内层调用以 `<callId>:deferred` 执行，没有自己的 `tool/call` 事件（`src/toolsearch/index.ts`:155–175〔实读〕），按去掉后缀的包装调用查。别的插件经 `tools.execute` 发起的调用没有 `tool/call` 事件，`observe` 对它不结算、不计数：跟进量的是模型读到拒绝之后自己做了什么。

拆包（评审第 2 轮 F9）。GLM 上延迟工具经 `DeferredToolCall {name, input}` 调用：包装本身是一次没有 `parent` 的根调用，先过 `tools/pre-execute`；它的工具体再以 `<callId>:deferred`、同样没有 `parent` 的第二次根调用执行目标（`src/toolsearch/index.ts`:155–175，文件头 :15–19 写明这是有意的）。所以：

1. `observe` 先拆包。原生名是 `DeferredToolCall`、参数恰为 `{name: 非空字符串, input: 对象}`（ZCode 3.17.1 的 schema 同形，见文件头的依据）时，用 `{name: toNativeTool(dialect, input.name), arguments: input.input}` 结算，并把 `<callId>` 与 `<callId>:deferred` 一起记为已结算；形状不对时按包装原样结算。拆包的纯函数 `unwrapDeferredCall(name, args): {name, arguments} | undefined` 在 `src/shared/deferred-call.ts`，回放（§3.6）与改动文件（§6.2）也用它。
2. `noteDenial` 记下的是被拒的那次执行，也就是内层调用（`<callId>:deferred`），参数摘要按拆开之后的参数算。下一次包装调用拆开之后才比得上，所以原样重试记 `repeat`。
3. 内层调用随后进 `observe` 时，它的 `<callId>:deferred` 已经被包装结算过，什么也不做。

同一步的调用（评审第 2 轮 N16）。模型一步发出几个调用时，第一个被拒之后，同一步的其余调用是在模型读到拒绝之前就发出的。结算前比较两次调用的 `{turn, step}`：与被拒的调用相同就跳过、不结算。所以量的是「拦截之后模型下一步里的第一次调用」，与 `docs/ORCHESTRATION.md` §6.3 的说法一致。

跨行（评审第 1 轮 F5）。每个经 `installRuleGate` 装的监听器对根调用第一件事就调 `observe`；waterfall 从外往里走，最外层的监听器先看到这次调用并结算，之后的监听器对同一个 `callId` 什么也不做（记录器记着最近 512 个已结算的 `callId`）。下一次调用被外层的 `graph-files-only`、M3 的规则拒绝，guard 行看不见它，跟进照样由外层结算。不用 guard 框架的两个监听器也接同一个记录器：第一件事调 `observe`，拒绝时调 `noteDenial`。它们是规则板的工具调用门（规则 id `rules:<id>`，没有 `rightPath`）与 M3 的 git 快照门（规则 id `git-snapshot`，只在存不了快照时拒绝，`rightPath` 为同一条 git 命令，M3 附录 0.3 §2.5）。两边各加两行，§18 第 5 条请它们加；没加之前，§1.2 的验收只覆盖经 `installRuleGate` 的拦截（评审第 2 轮 N26）。

模块级的状态在各行之间共用：编排层包由 `tsc` 逐文件输出（`packages/hourness/tsconfig.json`，不打包），guard、图、设计各行导入的是同一个 `dist/guard/followup.js`，Node 对同一个文件 URL 只有一个模块实例〔推断：DSH 加载行时不给模块地址加查询串；L3 场景 `guard-followup` 核对图行拒绝之后的跟进记录，若各行拿到的是不同实例，这条记录不会出现〕。

结算时 `followupOf(denied, next, rule)` 给出：

| 结果 | 条件 |
| --- | --- |
| `repeat` | 同一原生工具、参数摘要相同（两边都按拆开之后的比） |
| `right-path` | 规则的 `rightPath(next, denied)` 为真 |
| `other` | 其余 |
| `none` | 拦截之后，这个 agent 的回合结束（会话事件 `turn/end`，agent-loop:1029〔实读〕）或会话卸载（`session/disposed`，session:1929–1933〔实读〕）时，还没有下一步的调用（评审第 2 轮 N15）。子 agent 交回结果、人不再说话，都在这里结算 |

各规则的 `rightPath`：file-tools-only 是下一次调用为文件工具的写入（`write`、`edit`、`str_replace_editor` 除 `view` 外）；圈禁是 `request_exception` 带这次的编号（GLM 上经包装，拆开之后判），或目标在工作区内的文件工具写入；`graph-files-only` 是图的写工具；M3、M7 的规则各自写自己的 `rightPath`，不写就只得到 `repeat`、`other`、`none`。拒绝方在 `installRuleGate` 第 7 步经 `noteDenial` 记下待判，所以凡经它安装的规则都自动有跟进，不需要各行另接。

写一条 `FollowupRecord`（§3.2）。内存表按 agent 至多一条、全表至多 256 条（最早的先出）；进程重启丢失未判的那几条，记录少几条，不影响别的。

L2：

- 连续两次写图文件都被 `graph-files-only` 拒绝，留下恰好一条 `outcome: 'repeat'` 的跟进记录；guard 拦截之后下一次调用被一个外层的测试规则拒绝，同样留下一条。
- GLM 路由（F9）：圈禁拒绝之后，`DeferredToolCall {name: 'request_exception', input: {ref: <这次的编号>, …}}` 留下恰好一条 `right-path`，内层调用不再加记录；经包装的 `str_replace_editor` 被拒之后原样再发一次包装调用，留下 `repeat`。
- 同一步（N16）：一步里两个调用，第一个被拒，第二个不结算；下一步的第一个调用结算。
- 没有下一步（N15）：拒绝之后回合结束，留下 `none`；拒绝之后会话卸载，留下 `none`。
- 插件经 `tools.execute` 发起、没有 `tool/call` 事件的调用不结算。

### 3.4 标注

标注是给一条记录的判断，不改变任何规则的行为。标注文件 `<项目目录>/audit/labels.jsonl`，每行：

```ts
interface LabelLine {
  readonly at: string
  readonly key: string                       // recordKey of a journal line, or a replay entry key
  readonly rule: string
  readonly label: 'right' | 'wrong' | 'unsure' | 'missed' | 'benign'
  readonly by: 'llm'
  readonly relay?: string                    // the human's words, verbatim: the label counts as the human's
  readonly note?: string
  readonly source: 'journal' | 'replay'
}
```

标签的含义随记录的种类：

| 记录 | 标签 | 含义 |
| --- | --- | --- |
| 拦截、规则的影子记录、回放里「会拦」的调用 | `right` / `wrong` / `unsure` | 拦下它对不对 |
| 工作区变更兜底的影子记录（file-tools-only 的漏判来源） | `missed` / `benign` / `unsure` | shell 真的写了文件而读法没看见；或是构建产物、人自己改的文件这类无关改动 |

同一个键有多行时：有带 `relay` 的就取最后一条带 `relay` 的，否则取最后一条。谁来标：agent（编排者、M7 的运维会话）用命令行标；人不用碰命令行，人在对话里说「那条是误伤」，agent 带原话标。人的负担只在转生效的那一问上：主 Agent 在对话里给出数字与至多 5 条样本（先列 `wrong` 与 `unsure`）。

### 3.5 统计与转生效的判据

`ruleStats(records, labels, {now, since})`（`src/guard/measure.ts`，纯函数）按「规则 × 来源（`dialect` / `other`）× 模式」给出：

- 记录数（拦截或影子）、已标数（其中人的）、`right`、`wrong`、`unsure`；
- 精确率 = `right / (right + wrong)`，同时给出分子分母，样本少于 5 条时只给分数不给百分比；
- 召回率：只对有漏判来源的规则给出。file-tools-only 的漏判是标为 `missed` 的工作区变更兜底记录，召回率 = 拦截里的 `right` / （`right` + `missed`）；其余规则写「没有漏判来源」；
- 跟进：`right-path`、`repeat`、`other`、`none` 的计数；
- 是否达到转生效的判据。

```ts
/** Shadow → enforce: the human decides; these numbers decide when it is proposed. */
export const PROMOTION = { minLabelled: 20, minLiveDays: 14, maxWrong: 0 } as const
```

达到判据：带标注的「会拦」样本（实时影子加回放）至少 20 条；实时影子从第一条记录起至少 14 天；`wrong` 为 0（`unsure` 的条数写进问人的那段话里，由人判断）。这里是唯一出处。M7 §3.12.2 今天写的是「近 14 天影子记录不少于 20 条，且人没有标过误判」：数字相同，含义不同（它数的是近 14 天的影子记录，不论有没有标注，也不含回放）。M7 那一行改为引用 `PROMOTION`，采用这里的含义：没有标注的记录不能证明没有误伤，回放的样本能让人不必干等 14 天的数量，而 14 天的实时影子保证规则在真实会话里跑过（§18 第 5 条）。

转生效的过程：M7 的周报阶梯在达到判据时提一张决定者为人的待决，主 Agent 在对话里按四行的方案问人（`d-chat-not-cards`；M7 的模板随之改），方案里写明所有路由的系统提示词会多一行声明；人同意之后，主 Agent 派一个任务：改代码里的 `mode`、把规范节点的 `模式：` 改为 `生效`、把标注过的样本加进回归语料，提交信息引用那张待决。这次提交改的是 guard 规则，按 `norm-review-floor` 全审。降回影子同样要人拍板。M7 合入之前，编排者看 `stats` 的「达到判据」一列手动提同样的待决。

`credential-read` 按设计一直是影子：它的目的是看见谁读了凭证，不是挡住排查登录问题的正常读取（§4.2），所以它的规范节点写「只记录，不转生效」，阶梯跳过它。

### 3.6 回放（离线影子，人已定 D2 选 B）

用今天的规则重判本机 DSH 会话日志里的历史工具调用，不等实时数据攒够。人 2026-10-30 回「不介意」，边界照他同意的写：只读工具调用的命令文本与路径，不读对话正文；结果留在 `.llm/`；只有脱敏的个别样本进 `tests/guard-corpus/`。

- 日志：`<DSH home>/sessions/<工作区>/session-<id>/session.v4.jsonl.zstd`（或不压缩的 `.jsonl`，session-persistence-jsonl:750–756）。压缩文件是一串独立的 zstd 帧，每帧是若干行 JSONL（session-persistence-jsonl:1138–1230 的逐帧解码器）。Node 自带的 `zlib.zstdDecompressSync` 对整文件只解出第一帧，所以 `decodeSessionLog(bytes)` 按帧头魔数 `28 b5 2f fd` 切开逐帧解码〔本机实测 2026-10-29：本仓库工作区最大的一个日志 5.7 MB、3,397 帧全部解码成功；全机 719 个日志〕。解码失败的帧跳过并计数。
- 读哪些事件、哪些字段（D2 的边界，`src/guard/replay.ts` 在解码的同一处丢掉其余内容，不进内存里的条目）：
  - `tool/call` 的 `data {turn, step, callId, name, arguments}`（agent-loop:681–690）。参数只留规则读的路径与命令：`file_path`、`path`、shell 的 `command`、`terminal_send` 的 `text`、`str_replace_editor` 的 `command`（子命令名）。`content`、`old_string`、`new_string`、`file_text`、`old_str`、`new_str` 等写入的内容一律丢掉。
  - `tool/result` 只读 `isError`，以及错误文本的前 120 个字符是否等于某条已知的 guard 纠偏开头（在内存里比较，不留存、不输出），用来给出「当时拦没拦」。
  - `request/header` 的 `data.header.config {provider, model}`（agent-loop:1226–1240），会话头的 `cwd`。
  - 用户消息、助手消息、思考块与各插件的提醒一概不读。〔本机实测：上面的字段名与日志一致〕
- 拆包：GLM 会话里延迟工具的调用在日志里记的是模型发出的 `DeferredToolCall`，目标在参数 `{name, input}` 里（`docs/DESIGN.md` §5.5、§5.10；内层调用经 `tools.execute` 执行，不经 agent loop，不产生 `tool/call` 事件）。回放先经 `unwrapDeferredCall` 拆开（名字取 `name`、参数取 `input`，再按上一条只留路径与命令），再判定；`summary.json` 记拆开的条数与形状不对、拆不开的条数。
- 判定：调用名经静态别名表 `ZCODE_ALIAS_NATIVES` 换成原生名（历史里没有方言服务；表与 3.17.1 一致，见文件头）；来源按当时最近一个请求头的模型：`glm` 开头记 `dialect`，否则 `other`；圈禁根取会话头的 `cwd`；每条 guard 框架的规则（不论模式）判一次。要读写入内容或当时文件系统的规则不判：`suppression-reason` 要数新增的压制注释，得读写入的内容，D2 的边界不许，回放跳过它；`scratch-only` 要知道目标当时存不存在，同样跳过；两者的跳过条数进 `summary.json`。`credential-read` 只按读工具的路径与 shell 文本判。
- 历史结果：同一 `callId` 的结果是错误、且错误文本以已知的 guard 纠偏开头时记 `historical: 'denied'`，否则 `'allowed'`。
- 输出：`<项目目录>/guard-replay/<时间>/replay.jsonl`，每条 `{key, at, rule, mode, scope, route, tool, call, historical, session}`，`call` 是 `CallSubject`（命令文本至多 8 KiB，或解析后的目标路径），`key` 是 `<会话 id>:<callId>:<规则>` 的 SHA-256 前 12 位；另写 `summary.json`（按规则与来源的条数、拆包与跳过的条数）。命令行默认只打印 `summary`，不打印命令原文。
- 只读：不写 `~/.dsh` 下的任何东西；输出只写项目目录（工作区的 `.llm/`，已被 git 忽略）。进仓库的只有经 `corpus add` 脱敏的单条样本（§3.7）。

设计期的一次试算〔本机实测 2026-10-29，只统计条数〕：719 个日志里有 1,004 次 shell 调用（GLM 路由 892 次、其他路由 112 次）；今天的 file-tools-only 会拦其中 115 次（GLM 85、其他 30），命中最多的是 `Set-Content`（86 次）；当时的旧检测拦过 66 次，其中 21 次今天不会再拦（引号感知之前的误判）。另有 36 次调用的参数提到凭证文件或 `GLM_HOURNESS_CREDENTIAL_SECRET`（`pwsh` 27、`write` 7、`edit` 2）；`write` 与 `edit` 的 9 次是写入的内容里提到，按 D2 的边界回放不再读它们，只数 shell 的 27 次与读工具的路径。

### 3.7 回归语料

`tests/guard-corpus/cases.jsonl`，每行一条：

```ts
interface CorpusCase {
  readonly id: string                 // c-<12 hex>, the source key
  readonly rule: string
  readonly tool: string               // DSH native
  readonly args: Record<string, string | number | boolean>
  readonly scope: RouteScope
  readonly expect: 'deny' | 'allow'
  readonly context?: { readonly exists?: boolean, readonly previous?: string, readonly tracked?: readonly string[] }
  readonly source: 'journal' | 'replay' | 'incident'
  readonly note: string
  /** An accepted misfire, with the node that tracks it. */
  readonly known?: string
}
```

- 进入语料：`npm run -s guard -- corpus add <键> --expect deny|allow --note <说明> [--known <节点 id>]`，从流水或回放取出调用，经 `sanitizeCase`（`src/guard/corpus.ts`）：会话工作目录换成 `<ws>`、用户主目录换成 `<home>`、DSH home 换成 `<dsh>`，内容截到 2 KiB，参数只留规则读的字段。追加到文件末尾，同一 `id` 已在时拒绝。种子共七条，都按 `source: 'incident'` 手写，不经 `corpus add`：`docs/DEVELOPMENT.md` §7 记下的三次 `=>`、`>>>`、`->` 误判，与本仓库流水里现有的 4 条记录（2026-10-28 两条圈禁、2026-10-29 两条 file-tools-only）。这 4 条早于 `call` 字段，`corpus add <键>` 取不出调用，参数从记录的 `correction` 与事故说明里的命令文本抄出，`note` 写出处（评审第 2 轮 N24）。
- 检查：`tests/guard-corpus.spec.ts` 把 `<ws>` 映到固定根（Windows `C:\ws`，其他 `/ws`），按 `rule` 构造规则（上下文取 `context`），逐条判定。生效的规则判定与 `expect` 不同、且没有 `known` 时失败，报行号；影子规则只统计。最后打印每条规则的精确率与召回率（`console.log`，不进断言）。
- 入库与密钥：语料是已跟踪文件，`npm test` 的 `check:secrets` 扫它；命令里有密钥形状的字符串时门禁失败，正路是删掉这条或改写参数。

### 3.8 规则目录与规范节点

`src/guard/catalog.ts` 导出 `GUARD_RULES: readonly {id, row, mode, title}[]`，列出 guard 框架的全部规则：guard 行的六条（`workspace-containment`、`file-tools-only`、§4 的四条）、图行的 `graph-files-only`，M3、M7 的规则随它们的步加入。`mode` 取规则对象自己的字段，不另写一份。

`tests/contracts.spec.ts` 加三条：目录里的 id 不重复、与各行实际装上的规则一致（加了规则忘了登记就失败）；各行装规则都经 `installRuleGate`（§3.1 的标记），一条 `mode: 'shadow'` 的测试规则交给图行的安装路径时留下影子记录、不拦截；本仓库图上每个带 `规则：` 标签的规范节点，列出的规则都在目录里，`模式：` 与代码一致；目录里每条规则恰好出现在一个规范节点里。规范节点分两批提议（§18 第 3 条）：已有的三条规则在 G1 合入之前，四条影子规则在 G3 合入之前，所以这条测试在每一步合入时都成立（评审第 2 轮 N21）。

### 3.9 命令行

`npm run -s guard -- <命令>`（`scripts/guard/cli.mjs` 经 `--experimental-strip-types` 跑 `src/guard/cli.ts`，只用 Node 内置模块，同项目图的命令行）。项目目录按 `--home`，否则 `<工作区>/.llm`。

| 命令 | 作用 | 退出码 |
| --- | --- | --- |
| `records [--since 14d] [--rule <id>] [--unlabelled] [--show]` | 列出记录的键、规则、模式、来源、工具与标注；`--show` 才带命令与目标 | 0；2 用法或目录不对 |
| `label <键> <标签> [--note <文字>] [--relay <原话>]` | 追加一行标注；键不存在时拒绝 | 0；1 键不存在或标签与记录种类不配；2 |
| `stats [--since 14d]` | §3.5 的表，JSON | 0；2 |
| `replay [--sessions <目录>] [--since <日期>]` | §3.6（D2 人已定 B；只读命令文本与路径） | 0；2 读不出目录或写不进输出目录 |
| `corpus add <键> --expect deny\|allow --note <文字> [--known <id>]` | §3.7 | 0；1 已存在或脱敏后仍有绝对路径；2 |

在 DSH 会话里，agent 经 shell 运行这些命令：它们不是写文件命令，file-tools-only 不拦，与项目图的命令行一样。

### 3.10 晨报

`src/workflow/morning-report.ts` 的拒绝与影子两处过滤改用 `classifyRecord`（G1，§3.2）：`denial` 进「违规」，`rule-shadow` 与 `fallback-shadow` 进影子一节，跟进、申报、放行、作废只进下面各自的行，`unknown` 在影子一节末尾写「N 行记录读不懂」。影子一节每行加标注：`- file-tools-only（其他路由） × 3 · 已标 3 · 误伤 1`；拦截一节之后加一行 `- 拦截后下一步走对：file-tools-only 4/5，workspace-containment 1/2`。数字取 `ruleStats`，标注文件读不出时只少这两段。M7 的四答晨报接手时，「例外」一节照这两行写。

## 4. §6.4 的规划规矩（`m4-rules`）

`docs/ORCHESTRATION.md` §6.4 表里标「规划」的各行：

| 规矩 | 在哪实现 | 模式 |
| --- | --- | --- |
| 设计阶段不写代码 | M3 `design-before-release`（`src/guard/main-agent.ts`） | 生效（`question-25`） |
| 主 Agent 不写文件 | M3 `main-agent-no-write` | 生效（`question-25`） |
| 临时脚本只在草稿区 | M4 `scratch-only`（§4.5） | 影子 |
| 压制注释必须写理由并挂节点 | M4 `suppression-reason`（§4.3） | 影子 |
| 放宽检查配置走决策卡 | M4 `checker-config`（§4.4）；转生效后经 `request_exception` 申报（§5） | 影子 |
| 同一处第三次修复走决策卡 | M4 图工具：第 3 次重开（第 3 次修复开始）时提一张人定的待决，主 Agent 在对话里问（§4.6） | 只问人，不拦 |
| 子 agent 只写任务节点的写入范围 | M7 `worker-scope` | M7 定 |

另加一行（不在原表里）：读凭证文件，M4 `credential-read`（§4.2），只记录。§6.4 表在 G3 一步里改写成上面的样子（每行加「模式」一列）。

### 4.1 判定上下文

`detect` 是同步的，四条规则要的外部事实由 guard 行在判定之前异步准备（`src/guard/context.ts` 的 `prepareContext(call, session, services)`），只在调用是文件工具写入、读工具或 shell 时才做：

| 事实 | 怎么取 | 上限与失败 |
| --- | --- | --- |
| 写入目标是否已存在、大小 | `fs.promises.stat`（目标按 §6.1 的圈禁解析） | 出错记为未知 |
| `write` 目标的旧内容（`suppression-reason` 比较标记数） | `fs.promises.readFile`，只在目标存在且不大于 1 MiB 时 | 大于 1 MiB 或出错记为未知 |
| 仓库里已跟踪的文件（`scratch-only`） | `git -C <仓库根> ls-files -z`（`execFile`，不经 shell），仓库根从目标向上找 `.git`；结果按仓库根缓存 60 秒 | 5 秒超时；不在 git 仓库里、没有 git 或超时记为未知 |
| 凭证文件的路径（`credential-read`） | 数据目录服务的 `userHome`（没有时 `userDataHome()`）下的 `credentials.json`；`resolveDshHome()` 下的 `.credentials.yaml` | 纯计算 |
| 检查器配置文件（`checker-config`） | 内置的文件名表加 env 工具节点验收条件里 `config` 行的路径（§6.1，批准之后只有人能改）；图按修订号缓存 | 图读不出时只用内置表 |

事实为未知时，用到它的规则对这次调用放行、不写影子记录；行健康写「<规则> 有 N 次缺上下文」。整个准备至多等 5 秒，超时的项按未知处理。

### 4.2 `credential-read`

- 判什么：读工具的目标（`read`、`read_image` 的 `file_path`，`grep` 的 `path`，`str_replace_editor` `view` 的 `path`，tool-fs:251–258、986–990，tool-fs-search:1090–1100，str-replace-editor:267、281）解析后等于凭证文件之一；写工具的目标同样算；shell 文本（`shellCommandOf`）里提到凭证文件（`src/guard/mention.ts` 的路径提及，另按后缀 `.dsh/glm-hourness/credentials.json`、`.dsh/.credentials.yaml` 匹配，覆盖 `~`、`$HOME`、`$env:USERPROFILE` 等写法）或环境变量名 `GLM_HOURNESS_CREDENTIAL_SECRET`。
- 模式：`shadow`，按设计不转生效（§3.5）。理由：本包的通道行读凭证不经工具调用，不受影响；人让 agent 排查登录问题时的读取是正常的，拦下它是误伤；回放的 36 次里大部分是开发凭证代码时的读写〔推断：没有逐条看〕。它的用处是让「谁读了凭证」在晨报里看得见（摘要 §4 第 9 条：桌面版是 `danger-full-access`，注入或越权读取要能被发现）。
- 记录里的 `correction` 写「Reading credential files is recorded for review.」（只给人看，模型看不到）。

### 4.3 `suppression-reason`

- 判什么：文件工具写入新增的压制注释。新增 = 新文本里某种标记的个数多于旧文本：`edit` 比 `new_string` 与 `old_string`（tool-fs:690–705）；`str_replace_editor` 比 `new_str` 与 `old_str`，`create` 比 `file_text` 与目标旧内容（str-replace-editor:141–171）；`write` 比 `content` 与目标旧内容（§4.1）。
- 标记（`SUPPRESSION_MARKERS`）：`eslint-disable`、`eslint-disable-line`、`eslint-disable-next-line`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`# noqa`、`# type: ignore`、`# pyright: ignore`、`NOLINT`、`NOLINTNEXTLINE`、`#[allow(`、`//nolint`、`# shellcheck disable=`、`jscpd:ignore-start`、`gitleaks:allow`。
- 合格的写法：同一行在标记之后有理由（拉丁字母至少 3 个词，或汉字至少 6 个；ESLint 用它自己的描述语法 `-- <理由>`）与一个方括号里的节点 id（匹配图的 `ID_PATTERN`，图读得出时还要存在）。例：`// eslint-disable-next-line require-await -- the waterfall awaits every listener [m4-checks]`。
- 不合格时的纠偏（生效之后模型看到的）：事实「You added `<标记>` without a reason and a graph node.」；越界「New suppressions need a reason and a node id on the same line.」；正路「Fix the finding instead; if the suppression is right, add `-- <why> [<node id>]` (ESLint) or a reason and `[<node id>]` after the marker.」；例外「If no node fits, propose one with graph_propose first.」
- 模式：`shadow`。§7.6 写「直接拦下〔定案〕」，`docs/CHARTER.md` §6 写「新门禁先以影子模式运行」；两条都是人定的，按宪章先影子，按 §3.5 的判据转生效后就是 §7.6 的状态（§16 记为 agent 定）。

### 4.4 `checker-config`

- 判什么：文件工具写入（`write`、`edit`、`str_replace_editor` 除 `view` 外）的目标是检查器的配置或基线。内置文件名表：`eslint.config.js`、`eslint.config.mjs`、`eslint.config.cjs`、`eslint.config.ts`、`.eslintrc`、`.eslintrc.*`、`eslint-suppressions.json`、`knip.js`、`knip.ts`、`knip.json`、`knip-baseline.json`、`.jscpd.json`、`.jscpd-baseline.json`、`tsconfig.json`、`tsconfig.*.json`、`.gitleaks.toml`、`ruff.toml`、`.ruff.toml`、`mypy.ini`、`.clang-tidy`、`.shellcheckrc`；另加 env 工具节点验收条件里 `config` 行的路径（§6.1）。shell 改这些文件已被 file-tools-only 拦下；`npm run lint:update` 缩小基线不经文件工具，不在这条规则里（它本身拒绝放大基线，`docs/DEVELOPMENT.md` §10）。
- 模式：`shadow`。理由：这条规则分不清改松与改紧，改紧的写入也会命中。影子期的标注量的正是这件事：`wrong` 就是改紧或无关的改动。转生效后被拒的写入走申报通道（§5，规则进入可申报的名单），人在申报文字里看到改动内容再回话。
- 纠偏（生效之后）：事实「You tried to change the checker configuration `<文件>`.」；越界「Changes to checker configuration and baselines need the human: loosening a check is an unplanned decision.」；正路「Fix the findings instead; if the configuration must change, call request_exception with ref "<编号>" and say what the change does to the checks.」；例外「Shrinking a baseline with the project's update script (for example `npm run lint:update`) is not a configuration edit.」

### 4.5 `scratch-only`

- 判什么：文件工具新建文件（目标在调用前不存在：`write`，或 `str_replace_editor` `create`），扩展名是脚本（`.js`、`.mjs`、`.cjs`、`.ts`、`.mts`、`.cts`、`.py`、`.ps1`、`.psm1`、`.sh`、`.bash`、`.bat`、`.cmd`、`.rb`、`.pl`），目标不在 `<工作区根>/.llm/scratch/` 下，且目标所在目录里没有已跟踪的同扩展名文件。最后一条把「在已有源码目录里加一个新模块」与「在仓库根或新目录里丢一个脚本」分开；分得准不准由影子期量。
- 模式：`shadow`。
- 纠偏（生效之后）：事实「You created the script `<路径>` outside the scratch area.」；越界「One-off scripts live in .llm/scratch/ (git-ignored); a script that stays becomes part of the project.」；正路「Write it under .llm/scratch/; to keep it, move it into scripts/ (or the project's source tree), give it a graph node and say what it is for.」；例外「A new module in a directory that already holds files of its kind is not a one-off script; if this is one, say so in your reply: the denial is recorded for review.」
- 草稿区的位置与 M7 的清单见 §7.3。

### 4.6 第三次修复之前问人

`docs/ORCHESTRATION.md` §2.4「同一节点第三次修复，发决策卡「停下查根因」」。按 `d-chat-not-cards` 不出卡：harness 在这个节点下提一张人定的待决，正文是一段四行的方案，主 Agent 在对话里拿它问人，按人的原话记下结论。重开就是状态从 `done` 改回 `doing`（引擎 `TRANSITIONS` 里 `done` 只能到 `doing`，`src/graph/engine.ts`:106–113），历史里是一条 `op: 'status'`、`from: 'done'`、`to: 'doing'`。

数法（全文统一）：节点第一次完成之后，每一次重开开始一次修复，第 n 次重开就是第 n 次修复开始。第 3 次重开时，第 1、2 次修复都完成过又被重开，即「前两次修复没修住」，第 3 次修复即将开始；问题在这一刻提出。

- 何时：`graph_status` 以 `llm` 身份把一个节点从 `done` 改为 `doing` 成功之后（`src/graph/tools.ts` 的 `writeTool`）。人自己重开不触发：那是人自己的决定。
- 判据：`reopenCount(node, since)`（`src/graph/reopen.ts`）数 `since` 之后的重开（不论谁重开）；`since` 是这个节点下最近一张已拍板的「第三次修复」待决的拍板时刻，没有就从头算。计数达到 3、这次重开由 `llm` 做、且节点下没有未拍板的「第三次修复」待决时提问。人说「接着修」之后，再重开 3 次才再问。
- 认法：父节点是这个节点，第一条历史是 `harness` 的 `propose`，且这条历史的 `reason` 恰为 `第三次修复：<节点 id>`。`reason` 由引擎写进历史（`planPropose`），模型改不了，人也不用读它。0.2 认的是正文第一行 `停下查根因：<节点 id>`：正文模型能改，这一行还挡在背景前面（评审第 2 轮 F10），所以不再放进正文。
- 待决：以 `harness` 身份在这个节点下提一张待决（节点正在进行中，待决直接为已批准，`initialStatus`），决定者为人，标题 `「<节点标题>」要修第 3 次了`（节点标题超过 24 个字时截断加「…」）。正文由 `renderPlan`（`src/graph/plan-text.ts`，§5.4 写它的格式与检查）生成：

  ```markdown
  「Windows 上的路径解析」要修第 3 次了

  背景：这件活**修过两次又被重新打开**，同一处反复修不好，常常是问题没找对

  推荐：**先停下查原因**，查清了写进这件活，再接着修

  疑问：前两次**是不是方向错了**，现在还拿不准

  不做：**直接接着修**，多半还要修第 4 次

  附：
  - 第 1 次重新打开：10-29 14:02「测试在 Windows 上挂了」
  - 第 2 次重新打开：10-29 18:40「改了路径之后又挂」
  - 第 3 次重新打开：10-30 09:15「还是同一个测试」

  回「查」就先停下查原因，回「接着修」就照常往下做。
  ```

  「附」里的时刻与理由取自三条重开历史的 `at` 与 `reason`，理由截到 40 个字。
- 记录结论要用的字段。今天的引擎拍板时要一个选项的键（`decide` 核对 `mutation.option` 在 `options` 里，`src/graph/engine.ts`:518–519），带了选项就要有 `crux`、`verdict`、`weight`（`questionRefusal`、`CARD_FIELDS`）。所以待决另带：`options` 为 `{key: 'A', label: '接着修', gain: '这件活照常往下做', cost: '前两次的方向可能不对，多半还要修第 4 次'}`、`{key: 'B', label: '先停下查原因', gain: '先查清前两次为什么没修住，写进这件活再修', cost: '这件活晚一轮才接着做'}`，`recommend: 'B'`（在最后），`crux: '前两次没修住，是问题没找对吗？'`，`verdict: '是 → B；否 → A'`，`weight: 'two-way'`（都在 `CARD_LIMITS` 之内）。这些键只用来记结论，人在对话里读的是正文。它们只在 `reopenQuestion(node, reopens)`（`src/graph/reopen.ts`）这一个函数里生成；`d-chat-not-cards` 落地方案第 2 条的引擎改动（人定的题存方案原文、人的原话与结论，不再要这些字段）合入之后，只改这个函数。
- `background` 字段：引擎里已有这个字段（plain-ui 第 1 步或 M3 第一个写人定待决的步加，M3 附录 0.3 §2.9）时，写「背景：」那一行去掉标签与加粗之后的文字（不超过 `PLAIN_LIMITS.background`）；还没有时只写正文。
- 谁问人：`graph_status` 的输出 schema 加可选的 `notice: string`，按调用方写。调用方是根 agent：「Filed question <id> for the human: this node is about to get its third fix. In your next reply show the human the question's body as it is, then record their answer with graph_decide and their words as relay: 查 → B, 接着修 → A. If the answer is loose, say how you will record it before you write.」调用方是子 agent：「Filed question <id> for the human: this node is about to get its third fix. Stop work on it and say so in your final result; the main agent asks the human.」主 Agent 也会在每一步给它的项目摘要里看到这张等人的待决（M3 的投影）。
- 不拦截：问题只出现在人的队列里与主 Agent 的对话里；项目摘要的门禁一行「子树里有等人拍板的待决」照常显示。M7 的派发可以把它当作停下标记处理，由 M7 定。主 Agent 按 `d-design-onepage` 把它和别的问题攒在一起问，一次至多三件。
- 提议失败（`stale_revision` 重试一次后仍失败，或别的拒绝）时 `notice` 写原因，重开本身已经成功，下一次重开时再判一次。

## 5. 申报通道（`m4-request-card`）

节点 `m4-request-card` 写的是「经决策卡申报」。`d-chat-not-cards`（人 2026-10-30：产品里也不用问答卡、不给选项）之后，申报改在对话里问：harness 写好一段四行的方案，agent 原样放在回复末尾，人的下一句话就是回答。面板只看不操作（`d-ui-look-not-operate`），申报不经面板，也不上图。

### 5.1 一次申报的路径

1. agent 调 `write` 写 `C:\Users\me\notes\todo.md`（工作区外）。圈禁拒绝，纠偏的事实一句带解析后的路径，例外一句带申报编号 `r-7k2m9q4x` 与 `request_exception` 的四个字段。guard 在内存里记下这次拒绝（编号、会话、派发链的根、原生工具、完整参数、签名、目标、时刻），违规记录带 `ref`（只作留痕）。
2. agent 调 `request_exception {ref, purpose, reversibility, alternatives}`。
3. harness 在内存里核对编号，读目标的事实（在不在、大小、修改时间），写出申报文字（§5.4），在内存里登记一条等人回话的申报；工具返回这段文字与一句说明：原样放在回复的最后，结束这一回合。
4. agent 回复，末尾是这段文字，回合结束。
5. 人在输入框回「可以」。下一回合的第一步之前，guard 行的步 notice 读到这条消息（§5.5）：它来自 DSH 客户端、紧跟在以这段文字结尾的助手消息之后、恰是同意词。harness 在内存里写一个放行（带申报文字里的目标事实），违规流水写一条带人原话的 `RequestRecord`，这一步的消息末尾加一条说明：人批准了，带被拒那次调用的工具与参数。
6. agent 原样再调 `write`。圈禁仍判为拒绝，guard 在放行簿里查到匹配的放行；重新读目标的事实，与申报文字里的相同；目标已存在就先把旧内容复制到项目目录；`next()` 放行，流水写一条 `GrantRecord`，放行用掉。
7. agent 第三次调同一个 `write`：没有放行，照常拒绝。

### 5.2 拒绝文案（注入清点 §0 的修复）

`src/guard/rules.ts` 的 `APPLICATION_PROTOCOL` 删除。今天圈禁与 file-tools-only 的「例外」都让模型「file a request」，系统里没有这条通道。分两步改，文案的缺陷不等申报通道：

- G1（只改文字，不依赖 M3）：圈禁的例外一律用 `This session has no request channel yet: stop and ask the human in your reply; do not work around this rule.`；file-tools-only 的例外换成下面的新文案。
- G4：圈禁的例外按下表的两种情形给出，G1 的那一句删掉。

- 圈禁：`workspaceContainment(roots, base, exception)` 的第三个参数由 guard 行的 `rules()` 每次判定时给出（例外文案只出现在拒绝里，`detect` 仍是同步的纯函数）；编号在 `rules()` 里为每次文件工具写入预先生成（8 位，`crypto.randomBytes` 转 base36），只有被拒时才登记。

  | 情形 | 例外一句（给模型，英文） |
  | --- | --- |
  | 调用方是根 agent（会话头不带 `origin: 'subagent'`） | `To write outside the workspace, call request_exception {"ref": "<ref>", "purpose": "<why, one short sentence>", "reversibility": "<can it be undone, what else it touches>", "alternatives": "<what you tried instead>"}. It returns a short text for the human: put it at the end of your reply and end your turn. If the human answers 可以, this identical call goes through once within 30 minutes.` |
  | 调用方是子 agent | `A subagent cannot ask the human. If this write is needed, put ref "<ref>" and the target path in your final result; the agent that started you files the request.` |

- file-tools-only 的例外改为：`Build, test and git commands that write files as a side effect are allowed; only redirections and file-changing commands are denied. If this command writes no file, say so in your reply: the denial is recorded for review.` 这条规则不可申报：它管的是习惯，允许例外会教模型去申报。git 命令不是写文件（`d-main-agent-shell`），今天就放行，这一句照旧写明。
- 圈禁同时覆盖 `str_replace_editor`：`create`、`str_replace`、`insert` 的 `path`（str-replace-editor:267、281、141–171）与 `write`、`edit` 的 `file_path` 一样判定；`view` 放行。今天只判 `write`、`edit`，`str_replace_editor` 写工作区外不被拒。规则不是新的，补的是它漏掉的工具，所以直接生效（同 `terminal_send` 读 `text` 的修复，`docs/DEVELOPMENT.md` §7）。
- 纠偏的工具名照旧按 `face`（方言接管时 `Write`）；`request_exception` 没有方言别名，各路由同名。

这些文案的改动会改变所有路由上模型读到的拒绝信息；§14.4 的标定题量它前后的「拦截后下一步走对」。

### 5.3 `request_exception`

在全局注册（tools:2974–2984），所有路由、所有 agent 的工具面里都有。GLM 上不常驻：它没有 ZCode 对应物，按工具检索的规则延迟（`docs/DESIGN.md` §5.7、§5.10），名字在延迟名单公告里，模型经 `DeferredToolCall` 调用；内层调用照样经过 `tools/pre-execute`（`docs/DESIGN.md` §2.4a「`update_goal` 的完成授权」一行的 L3 实测）。`DeferredToolCall` 不要求先检索：它只核对目标在本请求的目录里、是延迟工具（`src/toolsearch/index.ts`:155–166〔实读〕），所以拒绝文案写出四个字段之后，模型不必先用 `LocalToolSearch` 取定义。名字登记在 `GUARD_TOOL_NAMES`，不进 `ORCHESTRATION_RESIDENT_TOOLS`。新增一个工具属于主 Agent 与子 agent 的工具面，按 `norm-review-floor` 全审（§13.1）。

参数（rc.3 校验的 schema 子集）：

| 字段 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `ref` | 是 | 字符串，`^r-[0-9a-z]{8}$` | `invalid` |
| `purpose` | 是 | 1–80 字符，一句 | `invalid`，`hint`「one short sentence: the human reads it as a one-line quote」 |
| `reversibility` | 是 | 1–60 字符（能不能撤回、还碰到什么） | `invalid`，同上 |
| `alternatives` | 是 | 1–60 字符（可以写 `none`） | `invalid`，同上 |
| 其他字段 | — | 不收 | `invalid` |

上限比 0.2 小（0.2 是 1000、500、500）：这三句原样进给人看的文字，人要一眼读完（`d-chat-not-cards`「一行不要写太多」）。

描述（给模型）：`Ask the human to allow one call that a rule denied with a ref naming this tool. Pass the ref and three short sentences: why the call is needed, whether it can be undone and what else it touches, what you tried instead. The result is a short text for the human: put it, unchanged, at the very end of your reply and end your turn. The human's next message answers it; if they approve, the identical call goes through once within 30 minutes.`

可申报的规则：`REQUESTABLE = ['workspace-containment']`（`src/guard/request.ts`）。只有这些规则的拒绝带编号；`checker-config` 转生效的那次提交把它加进名单（改名单就是改权限，`norm-review-floor` 全审），申报文字的题目与疑问一行按规则取（§5.4 的表）。

检查顺序，第一条不成立就抛错（文本为 `{code, message, hint}` 的 JSON，同图工具的 `refuse`）：

1. 调用方有 agent，会话头不带 `origin: 'subagent'`，否则 `forbidden`，`hint`「put the ref in your final result; the agent that started you files the request」。
2. 参数合法，否则 `invalid`。
3. 编号在内存的拒绝表里（只认内存：违规流水是工作区里的文件，模型能写，它不作授权的任何一环）；不在 `not_found`，`hint`「resubmit the call that was denied: the new denial carries a fresh ref」（进程重启之后的旧编号也是这样）。编号属于另一个派发链的根（`dispatchRoot`，M3 §3.3.3）时 `forbidden`；`dispatchRoot` 为 `unknown`（链断了）时同样 `forbidden`，`hint`「ask the human in your reply」。拒绝超过 2 小时 `expired`，`hint` 同 `not_found`。拒绝表至多 64 条，最早的先出。
4. 这个编号已有未用、未过期的放行：直接返回 `approved`（带工具与参数），不再问人。
5. 本会话已有一条等人回话的申报：编号相同就再返回同一段文字（`outcome: 'ask'`，agent 上一次没放进回复时用得上）；编号不同就 `busy`，`hint`「finish the open request first: the human's next message settles it」。
6. 读目标的事实：`fs.promises.stat`（目标按圈禁解析）；`ENOENT` 记为不存在；别的错误（权限等）抛 `unavailable`，`hint`「the target cannot be read (<错误码>); tell the human in your reply」。
7. 写出申报文字（§5.4），登记等人回话的申报 `OpenRequest {ref, sessionId, agentId, root, rule, tool, args, signature, target, facts, tail, askedAt, unclear: 0}`（内存，每个会话至多一条，2 小时后作废），流水写 `RequestRecord {outcome: 'asked'}`，返回。`tail` 是规范化之后的申报文字（§5.5 第 3 条的规范化）。

输出：`{outcome: 'ask' | 'approved', ref, text?, tool?, arguments?, argumentsFile?, expires?, message}`。

- `ask`：`text` 是申报文字；`message` 是「Put `text` at the very end of your reply, exactly as given (same lines, same marks), and end your turn without another tool call. The human's next message answers it; you get a note at your next step.」
- `approved`：同 §5.5 放行之后的说明。

行重新加载或进程重启时，内存里的拒绝表、等人回话的申报与放行都没有了；人之后回「可以」只是一条普通消息，agent 重调被拒的调用会拿到新编号，再申报一次（§11）。

### 5.4 申报文字

`renderPlan({title, background, recommend, doubt, notDoing, attachments?, question})`（`src/graph/plan-text.ts`，纯函数）按 `d-chat-not-cards` 的格式定稿（节点最后一条批注，人 2026-10-30）输出 Markdown：题目单独一段；背景、推荐、疑问、不做四行各自成段（段间空一行），标签照常不加粗，每行把重点几个字加粗；可选的「附：」一段；问话放在最后，只问一次。参数里的四行各用一对 `**…**` 标出重点。harness 写给人的方案文字只经这一个函数（申报、第三次修复，以后 M3、M7 自己写给人的方案也导入它），格式再改只改这一个文件（`design-context.md`「keep the card display rules in one section」在聊天格式下的对应做法）。

函数在下面的情形抛错。它只吃 harness 自己代码里的字串（agent 的原话只进「附」，见下），抛错就是 harness 的 bug，L2 钉住：四行里任何一行超过 60 个码点（题目 80，「附」与问话不限）；一行里加粗不是恰好一处；四行、题目或问话里含 `plainWordsIn` 报出的词（`src/graph/plain-question.ts`，M3 第 3 步建；M3 未合入时 G4 先建，内容照 M3 附录 0.3 §2.8，M3 改成导入）。

申报的文字（`write` 覆盖一个已存在的文件）：

````markdown
要改工作区外的文件：C:\Users\me\notes\todo.md

背景：agent 做「整理今天的笔记」时要**改工作区外的文件**，系统先拦下了

推荐：**放行这一次**，旧内容先备份，改坏了能找回

疑问：这个文件**该不该让 agent 改**，只有你清楚

不做：**不放行**，文件不动，agent 换在工作区里做

附：
- 文件现在：已存在，2,140 字节，10-30 09:12 改过
- agent 说的目的：「把今天的待办追加进去」
- agent 说还会碰到：「没有别的文件」
- agent 试过的替代：「写进工作区，但你要在原处看」
- 将写入的内容（前 10 行，共 63 行）：

  ```text
  # 10-30 待办
  ...
  ```

回「可以」就放行这一次，回「不行」就不写。
````

按事实换的几处，都由 harness 核对后写，不取 agent 的说法：

| 目标 | 题目 | 推荐一行 | 「文件现在」一项 |
| --- | --- | --- | --- |
| 不存在 | `要在工作区外新建文件：<路径>` | `**放行这一次**，是新文件，删掉就能撤回` | 不存在，将新建 |
| 已存在，不大于 10 MiB，有项目目录 | `要改工作区外的文件：<路径>` | `**放行这一次**，旧内容先备份，改坏了能找回` | 已存在，<n> 字节，<时刻> 改过 |
| 已存在，大于 10 MiB 或没有项目目录 | 同上 | `放行这一次，但**旧内容找不回来**` | 同上，另加「大于 10 MiB，不备份」或「没有项目目录，不备份」 |
| `edit`，`str_replace_editor` 的 `str_replace`、`insert` | 同上 | `**放行这一次**，改 <n> 处，旧内容先备份`（大于 10 MiB 或没有项目目录时同上一行） | 同上；内容一项换成「改动前后（各前 5 行）」 |
| 规则 `checker-config`（转生效并进入可申报名单之后） | `要改检查器的配置：<文件>` | 按上面几行 | 同上；疑问一行换成「这次改动**会不会让检查变松**，只有你能定」 |

- 背景一行的前半句：会话有图、设了未关闭的焦点（图行服务的 `focusOf`，M3）时写「agent 做「<焦点节点标题>」时」，标题截到 16 个字；读不到焦点（没有图、M3 的 `focusOf` 还没合入、读图出错）就省去这半句：「背景：agent 要**改工作区外的文件**，系统先拦下了」。
- 路径：题目里写解析后的完整路径，超过 60 个字时保留盘符或根与最后两段，中间写「…」；「附」里不重复。
- agent 的原话照原样放进「」里，换行换成空格；里面的 `*`、反引号、`[`、`]`、`<`、`>` 前加 `\`，不让它们改动格式，也不让它们冒充 harness 写的字。
- 内容预览：`write` 的 `content` 前 10 行，每行至多 120 个字符，围在代码块里（围栏比内容里最长的一串反引号多一个）；内容含 `\0` 时写「二进制内容，<n> 字节」。
- 整段至多 2,000 个字符；超出时先截预览，再截原话（截处写「…」）。
- 问话「回「可以」就放行这一次，回「不行」就不写。」同时告诉人怎样回答才算数（§5.5 的同意词与不同意词）。
- 放行要用的事实（`exists`、`size`、`mtimeMs`）随登记一起存下，使用时核对（§5.6）。

为什么推荐一行是「放行」：这段文字是 agent 的申请，它的方案就是写这一次，人凭直觉看这一条对不对（`d-chat-not-cards`：只给一个方案，人同意、补充或否掉）。安全不靠推荐：人不回、回别的、回得含糊都不放行（§5.5）。0.2 推荐「不放行」，是给表格卡上「不细看就按推荐」的情形准备的；聊天里没有预选，也没有按回车就生效。

为什么有「附」：人批的是一次具体的写入，要看得到写的是哪个文件、写什么、agent 怎么说；放进四行里，一行就写不短了。「附」放在四行之后、问话之前，问话仍在最后（§16）。

### 5.5 人的回话

guard 行在 `agent/created` 时给每个根 agent 装一条步 notice（`installStepNotice`，来源 `hourness-request`；子 agent 不装，它们发不出申报）。本会话有等人回话的申报时，每一步读两样东西：这一步收进来的消息（`admitted`：agent/pre-step 的 `messages` 是这一步从收件箱领出的消息，agent-loop:902–925〔实读〕）与这一步之前的会话历史（`session.deriveMessages()`，这一步的消息还没进去）。

1. 申报过了 2 小时：写 `RequestRecord {outcome: 'expired'}`，申报作废，这一步什么也不加。
2. 找 `admitted` 里第一条 `role: 'user'`、`source.kind === 'user'`、`source.rpcId` 是字符串的消息。DSH 客户端经接口送进来的人的消息带这两样（api-session-controller:3224–3229 的 `prompt`；人在子会话的窗口里输入时 subagent:3195–3200〔实读〕）；DSH 自己的 `dsh-client-file-upload` 用同一个判断认客户端送来的消息（client-file-upload:296–297〔实读〕）。别的路径送进来的用户角色消息没有 `rpcId`：headless 的任务（headless:345）、父 agent 写给子 agent 的任务（subagent:1461）、命令（commands:338）、计划模式（plan-mode:221）、ACP 与 SDK 的输入（acp:835、sdk-jsonrpc-server:161），各插件的提醒另带 `source.form: 'notice'`。
   - 没有这样的消息，但有别的 `source.kind === 'user'` 的消息：写 `RequestRecord {outcome: 'not-client', words}`，加一条说明「The message after request <ref> did not come through the DSH client, so it cannot approve it; the request stays open.」，申报留着。
   - 什么用户消息都没有（主 Agent 被巡检、晨报的提醒叫醒，或自己接着干活）：上一条助手消息以 `tail` 结尾时，加一条说明（每条申报只加一次）「Request <ref> still waits for the human. When you end this turn, put its text at the very end of your reply again, unchanged; the human's next message answers it.」。
3. 核对人读到的就是申报文字：会话历史里最后一条助手消息没有工具调用块，它的文字（各文本块连起来）规范化之后以 `tail` 结尾；这条助手消息与这条人的消息之间没有别的 `source.kind === 'user'` 的消息。规范化：NFC，`\r\n` 换成 `\n`，去掉每行末尾的空白，连续的空行并成一行，去掉首尾空白。不成立：写 `RequestRecord {outcome: 'not-shown', words}`，不放行，申报留着，说明「Request <ref> was not approved: the human had not just read its text (your last reply did not end with it). When you end this turn, put the text at the very end of your reply, unchanged; the human's next message answers it.」。这包括人在 agent 还没结束回合时插话（上一条助手消息带工具调用块）。为什么这样严：人的「可以」只能是在回答紧挨着的那段文字；中间 agent 若又说了别的，人可能是在回答别的事。申报留着不会多放行：下一次能放行仍要先满足这一条。
4. 读人的话：消息的文字规范化（同上，再去掉末尾的「。.!！~～」与首尾的引号，ASCII 字母转小写）之后：
   - 在 `APPROVAL_WORDS` 里：放行（第 5 条）。
   - 在 `DECLINE_WORDS` 里：写 `RequestRecord {outcome: 'declined', by: 'human', via: 'chat', words}`，申报关闭，说明「The human declined request <ref> ("<原话>"). Do not retry this call; do the work inside the workspace, or ask them what to do instead.」。
   - 其余：写 `RequestRecord {outcome: 'unclear', words}`，`unclear` 加一；`tail` 换成确认句「回「可以」就放行这一次写 <文件名>，回「不行」就不写。」的规范化文字，说明「The human's reply is not a plain yes or no, so nothing is approved yet: "<原话>". Answer what they said; if they seem to want the write, end your reply with this line, unchanged: <确认句>」。同一条申报第 3 次读不懂时关闭（`outcome: 'closed'`），说明请 agent 重调被拒的调用、用新编号从头申报。
5. 放行：`GrantBook.add({ref, rule, signature, root, facts, decidedAt, expiresAt: decidedAt + 30 分钟, words})`，写 `RequestRecord {outcome: 'approved', by: 'human', via: 'chat', words, messageId}`，申报关闭，加下面的说明。

`APPROVAL_WORDS`：可以、可以的、行、好、好的、同意、批准、放行、写吧、改吧、ok、okay、yes、y。`DECLINE_WORDS`：不行、不可以、不要、不同意、不批准、别写、别改、算了、no、n。两张表是 `src/guard/request.ts` 里的常量，改它们是一次提交，属于改权限（`norm-review-floor` 全审）。只认整句：「可以吗」「可以，顺便把 b 也改了」都不算同意，走「其余」。理由：放行是授权，拿不准就不放（fail-closed），人多回一句「可以」的代价小；`d-chat-not-cards` 要 agent 在人随口回答时先复述再记，这里的确认句就是 harness 替 agent 写好的那一句复述。

放行之后的说明（一次，步 notice，`<system-reminder>` 包装）：

```text
<system-reminder>
The human approved request r-7k2m9q4x ("可以"). Make exactly this call once before 10:42: write {"file_path": "C:\\Users\\me\\notes\\todo.md", "content": "…"}.
If you cannot write files (main agent), dispatch a subagent and give it these arguments verbatim; the approval covers your whole dispatch chain.
</system-reminder>
```

工具与参数取自拒绝表里被拒的那次调用（评审第 2 轮 N25：替别人申报之后，重调的一方要逐字给出同一组参数）。参数的 JSON 超过 4 KiB 时，harness 把 `{tool, arguments}` 写进 `<项目目录>/requests/<编号>.call.json`，说明里写「the arguments are in <路径>; pass them verbatim」；没有项目目录、写不进时，说明里只写工具与目标，另加「the content must be exactly the content of the denied call」，行健康记降级。

人的原话记在 `RequestRecord.words` 里（至多 500 个字符）。会话日志里同样有这条人的消息，是更硬的证据：它在 `~/.dsh` 下，不在工作区里。

### 5.6 放行

- 签名：`signatureOf(native, args, base)` = `[原生工具名, 参数]` 规范化 JSON 的 SHA-256 前 16 位；参数里的目标路径换成解析后的规范路径（`normalizePath(resolve(base, target))`），其余参数原样。参数改一个字符就不是同一个调用。
- 放行簿 `GrantBook`（`src/guard/request.ts`）只在内存里：`{ref, rule, signature, root, facts, decidedAt, expiresAt, words}`，只由 §5.5 第 5 条写入。项目图不参与授权；违规流水里的 `RequestRecord`、`GrantRecord` 只供追溯与晨报计数，从不被读来决定放行，伪造或删除它们不改变任何调用的结果。进程重启就丢掉放行：被拒的调用拿到新编号，agent 再申报一次，人再回一次。
- 匹配：圈禁对一次调用判为拒绝时，按签名与调用方的派发链的根在放行簿里找；找到、未用、未过期，就去掉 `Judgement.denies` 里圈禁那一条（别的生效规则的拒绝不受影响，§3.1）。
- 使用时核对（批准与使用之间目标可能变了）：重新 `stat` 目标，与放行里的 `facts` 比较存在与否、大小、修改时间。
  - 不同：拒绝这次调用，纠偏写「The target changed since the human approved (<变了什么>); call request_exception again.」；放行作废（内存删去）；流水写 `GrantVoidRecord`。`stat` 出错（权限等）按「不同」处理，`<变了什么>` 写错误码。
  - 相同：目标存在且不大于 10 MiB、有项目目录时，一律先把旧内容复制到 `<项目目录>/requests/<编号>.before`，不看申报文字里写了什么（事实相同时文字里写的就是备份；大于 10 MiB 或没有项目目录时文字里写的是「旧内容找不回来」，人批的就是这个）。复制失败就拒绝这次调用（`Error: the approved write was not run: backing up <路径> failed (<原因>); resubmit the call or ask the human`），放行不作废，行健康记降级。
  - 核对与写入之间仍有毫秒级的窗口，人或别的进程恰好在这时改了目标，不在防线之内（§11）。
- 一次：同一进程里用一个「使用中」集合防并行的两次同签名调用都放行。`next()` 之前放行标为使用中；`next()` 放行后标为已用，流水写 `GrantRecord`；`next()` 不放行（别的监听器拒绝）时恢复为未用。
- 只认人：放行只来自 DSH 客户端送来的人的消息（§5.5）。模型写的任何文字（回复、工具参数、图上带 `relay` 的写入）都不产生放行。理由：想要这次写入的正是模型。
- 子 agent：子 agent 被拒之后把编号交回给派发它的 agent（§5.2）；按 `d-one-main-agent`，有主 Agent 的项目里那就是主 Agent。主 Agent 拿这个编号调 `request_exception`（编号的派发链的根就是主 Agent），人回「可以」之后，主 Agent 按说明里的参数派一个子 agent 原样写；放行按派发链的根匹配，所以同一派发链里的任何 agent 原样再调都能用这一次。主 Agent 自己仍被 M3 的 `main-agent-no-write` 拦下：两条规则互不放行。
- 其他门禁照旧：放行只让圈禁这一条不拦；M3、M7、规则板的规则照常判。

### 5.7 所有路由

`request_exception`、拒绝文案、申报文字、读人回话与放行都不看路由；纠偏里的文件工具名按 `face`；记录带 `scope` 与 `route`（G3）。不装 GLM 包时一切照常（工具在工具面里直接可见）。

### 5.8 留痕

| 动作 | 记在哪 |
| --- | --- |
| 拒绝（带编号） | 违规流水 `ViolationRecord`（`ref`、`call`） |
| 给出申报文字 | `RequestRecord {outcome: 'asked'}`；会话日志里的工具结果 |
| 人的回话 | `RequestRecord`（`approved`、`declined`、`unclear`、`not-shown`、`not-client`、`closed`，带原话与消息 id）；会话日志里人的消息 |
| 没等到回话 | 过 2 小时：`RequestRecord {outcome: 'expired'}`（在那个会话的下一步或会话卸载时写）；进程重启：没有记录，下一次申报是新编号 |
| 放行的使用、备份路径 | `GrantRecord` |
| 放行作废 | `GrantVoidRecord` |

为什么申报不上图：授权只认内存里人的回话，图上记一笔不增加安全，却要图行在、要焦点、多一种失败；面板只看不操作，不在面板上批。人要追「上周放行过哪些写入」，晨报与 `npm run -s guard -- records` 都列得出。面板「需要你」要不要列出等人回话的申报由面板设计定（§15）。

晨报「例外」一节加一行「申报 n 次：放行 a（已用 u、作废 v）、不放行 d、没答 q」，数字取违规流水经 `classifyRecord` 分出的 `request`、`grant`、`grant-void` 三类：n 是 `asked` 的不同编号数，a 是 `approved`，u、v 是 `GrantRecord`、`GrantVoidRecord` 的条数，d 是 `declined`，q 是 `expired` 与 `closed`（评审第 2 轮 N14）。流水只用于计数：被删或被伪造时数字会错，不影响放行。

## 6. 检查器运行与当轮回传（`m4-checks`）

`docs/ORCHESTRATION.md` §7.5：每次改完文件，由 harness 在执行边界跑相关检查，结果当轮回传给模型。rc.3 没有 LSP 诊断（§7.5 末条），由本层实现。

### 6.1 检查命令写在哪：env 工具节点

环境分支（§7.1）下每个工具节点的验收条件里，可以有任意条检查行：

| 写法 | 含义 |
| --- | --- |
| `` `check <格式> $ <命令>` when <条件>[, <条件>…] `` | 改完的文件满足条件时跑这条命令；`<格式>` 是 `eslint-json`、`tsc`、`lines` 之一（§6.4） |
| `` `config <路径>[, <路径>…]` `` | 这个工具的配置与基线文件（相对仓库根，不含 `..`），`checker-config` 读它（§4.4）。放在验收条件里而不是正文：正文模型能改，验收条件批准之后只有人能改（评审第 2 轮 N23） |

- 条件：以 `.` 开头的是扩展名，以 `/` 结尾的是目录前缀（相对仓库根），其余是文件；扩展名与目录各自取「或」，两类之间取「且」；没有 `when` 时不跑（防止对所有文件跑）。
- 命令里的 `{files}` 换成满足条件的改动文件（相对仓库根、正斜杠、按平台加引号，§6.3，空格分隔）；没有 `{files}` 的命令对整个项目跑（例如 `tsc`），结果只取改动文件里的发现。
- 只认已批准的节点（状态 `approved`、`doing`、`done`）：命令由 `shell: true` 运行，必须是人批过的文字。工具节点由 LLM 提议、人批准（`initialStatus` 对工具节点为 `proposed`）；验收条件批准之后只有人能改（`docs/ORCHESTRATION.md` §2.9），所以放宽检查同样要人。
- 不合语法的行跳过，行健康写「<节点 id> 第 n 条检查行读不懂」。
- 本仓库的两个节点（§18 由编排者提议）：

  ```text
  ESLint：`check eslint-json $ node node_modules/eslint/bin/eslint.js --format json --pass-on-unpruned-suppressions {files}` when .ts, .mts, .js, .mjs, .tsx
  ESLint：`config eslint.config.js, eslint-suppressions.json`
  TypeScript：`check tsc $ node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --pretty false` when .ts, .mts, .tsx
  TypeScript：`config tsconfig.json`
  ```

  〔本机实测 2026-10-29〕单文件 ESLint（类型感知规则）2.6–2.9 秒，`tsc --noEmit -p tsconfig.json` 1.9 秒，都在 `C:/Users/29596/Desktop/Project/GLM-Hourness` 上。ESLint 读仓库根的 `eslint-suppressions.json`，基线里的告警不出现，所以回传的就是新发现。`--pass-on-unpruned-suppressions`：agent 修好一条被压制的告警之后，那条压制就用不上了，不带这个参数时 ESLint 以退出码 2 结束（H18），按 §6.5 算一次失败，连续 3 次后本会话不再跑 ESLint；过期的压制交给 `npm run lint` 的棘轮（`scripts/check-lint.mjs` 对它报失败，`npm run lint:update` 缩小基线）。knip、jscpd、gitleaks 对整个仓库跑、慢，留在汇合门禁（M7 `norm-merge-gate`）。

为什么不放进 `norm-merge-gate`：那里是汇合时对整个项目跑的命令，这里是每次改完对改动文件跑的命令，触发的时刻与输入不同；工具节点本来就是「这个工具怎么用」的地方（§7.1）。M7 的门禁解析器把这种行当说明，不受影响。

### 6.2 检查哪些文件

env 行给每个 agent 装一条步 notice（`installStepNotice`，`src/shared/step-notice.ts`，`agent/pre-step`，agent-loop:901–925）。每步从请求可见的历史（`session.deriveMessages()`）推出：最近一条检查结果 notice（来源 `hourness-checks`）之后，这个 agent 的助手消息里的文件工具调用块（`write`、`edit` 的 `file_path`，`str_replace_editor` 除 `view` 外的 `path`；`toolCallArguments`），且它们的结果不是错误（`toolCallOutcomes`）。历史里记的是模型调用的名字：GLM 会话里是别名（`Write`、`Edit`），经延迟工具调用的是 `DeferredToolCall`。所以每个调用块先经 `unwrapDeferredCall`（`src/shared/deferred-call.ts`，§3.3）拆开 `DeferredToolCall`（名字取参数的 `name`、参数取 `input`），再经 `toNativeTool(dialectService(ctx), name)` 换成原生名，才按上面的名字与字段匹配；方言服务不在时用静态别名表（`toNativeTool` 自带的回退）。路径按会话的当前工作目录解析（`workingDirectory.get`，同 guard），只取文件现在仍存在的。状态都在会话里，所以续跑、重启后不重复也不遗漏；压缩把旧调用移出可见历史后，那些文件不再补查。

为什么不用 `tools/post-execute`：它在每次调用提交时按模型顺序依次 await（agent-loop:551–575 的 `commitReady`），在那里等检查会让同一步的并行写入一个个排队；`agent/pre-step` 每步只等一次，同一步改的几个文件一起查。`docs/DESIGN.md` §6 列的两条通道都可用，这里选后者。

### 6.3 运行

`src/env/runner.ts`：

- 每个检查行一个进程：`child_process.spawn(命令, {shell: true, cwd: <仓库根>, windowsHide: true})`。仓库根从改动文件向上找 `.git`（目录或文件，工作树也算），M7 的 worker 工作树因此在自己的目录里跑。
- 同一步的各检查行并行；全进程至多同时 2 个检查进程，其余排队。
- 每个进程 60 秒上限（`CHECK_COMMAND_MS`），到时只要 `ChildProcess` 还没有 `exit` 就 `taskkill /T /F /PID <pid>`（Windows；其他平台对进程组发 `SIGKILL`）。
- 日志写进 `<项目目录>/env-checks/<会话 id 前 8 位>/<时间>-<节点 id>.log`：第一行是展开 `{files}` 之后的完整命令行（`$ <命令>`），之后是标准输出与错误；内存里只留至多 1 MiB 供解析。项目目录不在时不写日志，提醒里写「没有日志（没有项目目录）」。目录不用 `checks/`：本仓库的 `scripts/check-lint.mjs` 把 jscpd 的报告写进 `.llm/checks` 并在之后整个删掉（`JSCPD_REPORT_DIR`），放在那里的日志每跑一次 `npm run lint` 就没了。
- 引号按平台（`{files}` 的路径来自模型的写入调用，是不可信的输入）：
  - Windows（`shell: true` 即 `cmd.exe`）：路径加双引号；路径里有 `"`、`%`、`!`、`^`、换行时这个文件不进 `{files}`，提醒里写「跳过 <文件>：路径里有 shell 特殊字符」。双引号之内 `&`、`|`、`<`、`>` 是字面字符。
  - 其他平台（`/bin/sh`）：路径加单引号，路径里的 `'` 换成 `'\''`；单引号之内 `$(…)`、反引号、`$变量`、`\` 都不展开。路径里有换行时同样跳过（日志的命令行要一行读得懂）。
  - 函数 `quoteForShell(path, platform)` 是纯函数，L2 两个平台都测：POSIX 上路径含 `$(echo pwned > x)` 时真实子进程跑完不产生 `x`；Windows 上含 `%` 的路径被跳过并写进提醒。
- 缓存：同一文件的大小与修改时间没变时不重跑同一检查行。
- 轮转：env 行激活时删掉 `<项目目录>/env-checks/` 下修改时间超过 7 天、且名字是 8 位十六进制的会话目录；名字不合的不碰。
- 等待：步 notice 至多等 20 秒（`CHECK_STEP_DEADLINE_MS`）。没跑完的检查继续在后台跑，结果按会话留在内存里，下一步的 notice 带上；进程重启后丢失，下一次改动再查。

### 6.4 输出格式

`src/env/parsers.ts`，每种格式产出 `{file, line, column?, source, rule?, message}`：

| 格式 | 读什么 | 例 |
| --- | --- | --- |
| `eslint-json` | ESLint 内置的 `json` 格式：文件数组，每项 `filePath` 与 `messages[{line, column, ruleId, message, severity}]` | `npx eslint --format json` |
| `tsc` | 每行 `<file>(<line>,<col>): error TS<n>: <message>`（`--pretty false`） | `tsc --noEmit` |
| `lines` | 每行 `<file>:<line>[:<col>]: <message>`（gcc 风格；ruff 的 `concise`、shellcheck 的 `-f gcc`、clang-tidy、go vet 都是这样） | `ruff check --output-format concise {files}` |

退出码不决定有没有发现：有的检查器有发现时退出 1。读不出任何一行、而退出码不是 0 时记为「输出读不懂」。

改动行的范围（`src/env/changed-lines.ts`）：在 git 仓库里取 `git -C <仓库根> diff -U0 --no-color HEAD -- <文件>`（`execFile`，不经 shell，5 秒上限）的新侧行号，未跟踪的文件整个算改动；不在 git 仓库里时，`edit` 取 `new_string` 在现在文件里的位置（`replace_all` 时每一处），其余整个文件算改动。所以「改动行」是相对 HEAD 改过的行，包括这一会话里更早的未提交改动。发现落在改动行上的标 `[changed]`，其余标 `[elsewhere in file]`。env 行不读 guard 行的内存，两行互不依赖。

### 6.5 提醒的样子

来源 `hourness-checks`（`createUserNotice`，`<system-reminder>` 包装，`docs/DESIGN.md` §6），`source.checks` 记这次查到的最后一个工具调用 id 与各检查行的计数：

```text
<system-reminder>
Checks after your edits: eslint 2 findings, tsc 0.
src/guard/rules.ts:41:7 eslint no-unused-vars 'x' is assigned a value but never used. [changed]
src/guard/rules.ts:88:3 eslint require-await Async function 'f' has no 'await' expression. [elsewhere in file]
Full output: .llm/env-checks/541bab35/20261029T125501-tool-3.log
Fix the findings on changed lines before you finish; new warnings fail the merge gate.
</system-reminder>
```

- 至多 5 条发现，改动行上的在前，同一类按文件与行号排；每条至多 200 字符；整条至多 1200 字符。
- 全部为 0、且上一条检查结果 notice 也全是 0（或没有上一条）时不注入。上一条有发现、这次全为 0 时注入一行「Checks after your edits: eslint 0, tsc 0.」，模型知道已经修好。
- 检查器跑不起来、超时、输出读不懂时，那一项写成 `eslint did not run: <原因的第一行> (log …)`。
- 同一检查行在一个会话里连续失败 3 次后，本会话不再跑它，notice 写一次「eslint skipped for this session after 3 failures (log …)」，行健康写明。

### 6.6 没有检查器时

改动文件的扩展名没有任何已批准的检查行覆盖时，每个会话每种扩展名在检查结果 notice 里加一行（只一次）：`No checker covers .py files in this project. Propose a tool node under the env feature (graph_propose, type tool) with the project's checker; the community default is ruff (check line: \`check lines $ ruff check --output-format concise {files}\` when .py).`。默认方案取自 `docs/ORCHESTRATION.md` §7.5 的表（`.py` ruff；`.go` go vet；`.rs` clippy 的 `--message-format short`；`.sh` shellcheck `-f gcc`；`.c`、`.cpp` clang-tidy；`.ts`、`.js` tsc 与 ESLint）。提议的工具节点就是 §7.5 说的那件要人批的事：它等人批准，主 Agent 把它放进下一批问题里在对话里问（`d-chat-not-cards`），批准之后检查行才生效。项目里没有 `env` 节点时，提示先提 `env` 特性（§7.1）。

### 6.7 告警棘轮与压制注释数

`docs/ORCHESTRATION.md` §7.6 的四条在 M4 之后由这些地方守：

| §7.6 | 谁守 |
| --- | --- |
| 新增告警一律拦下，基线只减不增 | 每次改完的回传只给新发现（§6.4，本仓库的批量压制）；汇合门禁跑项目的检查命令（M7 `norm-merge-gate`；本仓库的 `npm test` 含 `npm run lint`，棘轮在 `scripts/check-lint.mjs`） |
| 压制注释写理由并挂节点 | `suppression-reason`（§4.3），影子期之后生效 |
| 把检查配置改松走决策卡 | `checker-config`（§4.4），转生效后经申报（§5） |
| 压制注释总数单独作为一项指标 | 下面的计数 |

压制注释计数（`src/env/suppressions.ts`，任务 `m4-suppressions`）：env 行每天第一次跑检查时（或第一次给某个仓库的会话装 notice 时），对仓库的已跟踪文件（`git ls-files -z`，跳过大于 1 MiB 的与二进制的）按 `SUPPRESSION_MARKERS`（§4.3）计数，追加 `{at, repo, total, byMarker}` 到 `<项目目录>/audit/suppressions.jsonl`；同一仓库同一天（UTC+8）只记一次。晨报「例外」之后加一行「压制注释 N 处（本期 +a / −b）」，取本期第一条与最后一条。计数在后台跑，不阻塞任何一步；失败只记行健康。

## 7. 环境分支与草稿区（`m4-env`）

### 7.1 环境分支

- 位置：图上 id 为 `env` 的特性节点（`docs/ORCHESTRATION.md` §7.1「环境是项目图上的一个分支，每个工具一个节点」）。非目标节点要有父节点（`src/graph/format.ts`:344–350），所以 `env` 挂在项目的一个目标下；本仓库挂在 `hourness` 下（§18）。固定 id 的做法同 M7 的 `norm-merge-gate`；引擎允许提议时指定 id（`planPropose`，`src/graph/engine.ts`:327–331）。
- 工具节点：`env` 的子节点，类型 `tool`。正文标签（M3 的 `labeledSections`，`src/graph/stage.ts`:61）：`用途：`、`用法：`、`选择理由：`、`安装位置：`；验收条件里放检查行与 `config` 行（配置与基线文件，§6.1；0.2 放在正文的 `配置：` 标签里，正文模型能改，评审第 2 轮 N23）。`选择理由` 里写查过的现成方案（`docs/ORCHESTRATION.md` §7.2 的查找顺序）。
- 读取：`envBranch(graph)`（`src/env/branch.ts`，纯函数）返回 `{tools: [{id, title, usage, checks, configs, status}], issues}`；只列已批准的工具，提议中的另计数（「2 个工具等人批准」）。

### 7.2 会话里的环境提醒

env 行的第二条步 notice（来源 `hourness-env`），只在三种时候注入，与项目图投影同一种「只在变化时」的做法（M3 抽出的 `src/graph/digest-notice.ts`；M3 没有先做时由 E2 抽出，规则板 §16 同样约定谁先做谁抽）：会话第一步、正文摘要变化（环境分支被改）、压缩之后。

```text
<system-reminder>
Project tools (graph node env). Use these before writing your own.
- ESLint [tool-3]: npm run lint. Checked after each edit of .ts and .js files.
- gitleaks [tool-5]: npm run check:secrets.
2 more tool nodes wait for the human's approval.
One-off scripts go in .llm/scratch/ (git-ignored). Delete them or promote them (move into scripts/ with a graph node) before you hand back.
</system-reminder>
```

- 每个工具一行：标题、id、`用法：` 的第一行；有检查行的加一句覆盖的扩展名。至多 12 个工具、1500 字符，多出的写「N more: graph_show env」。
- 图里没有 `env` 时只有草稿区一行。图行不在或会话没有图目录时同样只有这一行。
- 不分路由；子 agent 也收到（它们同样会写脚本）。

### 7.3 草稿区

- 位置：会话工作区根下的 `.llm/scratch/`（`SCRATCH_DIR`，`src/guard/scratch.ts`）。`.llm/` 是工作区里 LLM 的私有目录（`docs/CHARTER.md` §9），数据目录服务的项目目录也在那里；不新建工具专用的顶层目录（条款 10）。M7 的 worker 工作树各有自己的 `<工作树>/.llm/scratch/`。
- git 忽略（`src/env/ignore.ts`）：env 行第一次为某个仓库的会话装 notice 时（每个进程每个仓库一次）：
  1. `git -C <仓库根> check-ignore -q .llm/scratch/x`（`execFile`，不经 shell，5 秒上限）。退出码 0：已忽略，什么也不做。退出码 128 或 git 不可用：不做，行健康写明。
  2. 退出码 1（未忽略）：读 `<git 公共目录>/info/exclude`（`git rev-parse --git-common-dir`，工作树共用这一份；文件不在时视为空）。已有一行去掉首尾空白后恰为 `/.llm/`：不再追加（这一行没起作用，转第 4 步报原因）。没有：在末尾追加两行，`# dsh-hourness scratch area, added <日期>` 与 `/.llm/`，原文件末尾没有换行时先补一个。gitignore 只认行首的 `#` 为注释，同一行里模式之后的 `#` 是模式的一部分，所以注释必须单独一行〔本仓库实测见评审第 1 轮 F3：`--exclude="/.llm/  # …"` 匹配不到 `.llm/`，`--exclude="/.llm/"` 匹配得到〕。
  3. 再跑一次第 1 步的命令。退出码 0：行健康写「已把 /.llm/ 写进 .git/info/exclude」。
  4. 仍为 1：行健康降级「写了 /.llm/ 但仍未被忽略：<原因>」，原因用 `git check-ignore -v --no-index .llm/scratch/x` 的输出或「项目的忽略文件里有反向模式」；这个进程不再追加。
  
  这一份本地文件不入库，删掉这两行即可撤回；M7 对 `.worktrees/` 用同样的做法（M7 同样要把注释写在单独一行，§18 第 5 条）。本仓库的 `.gitignore` 已经忽略 `.llm/`（`git check-ignore -v` 实测命中 `.gitignore:3`），第 1 步就结束，不会改动。L2 用真实的临时 git 仓库测：未忽略时追加后退出码为 0；重复运行三次，文件里只有一行 `/.llm/`；`.gitignore` 带 `!/.llm/` 时行健康降级。
- 给 M7 的清单：`scratchLeftovers(root): Promise<readonly string[]>` 列出 `<root>/.llm/scratch/` 下的文件（相对路径，至多 200 个，另报总数）；目录不存在为空。M7 汇合门禁按 §2.3 的那一行使用。

## 8. 清理 `.llm/docs/` 的抓取脚本（`m4-cleanup`）

现状〔实读 2026-10-29〕：`.llm/docs/` 下有 `_crawl_bigmodel.py`（1,710 字节）、`_fetch_bigmodel.py`（829）、`_fetch_extra.py`（845）、`__pycache__/` 与它们抓下来的 `_bigmodel_md/`（47 个文件）。`.llm/` 被 `.gitignore` 忽略，这些文件不在 git 里。引用：`docs/DESIGN.md` §4.5b、§4.5c 引用 `_bigmodel_md/` 里的两页；`docs/reference/bigmodel-guide-digest.md`「附：原始快照索引」列出三个脚本。

做法（agent 定，§16）：

1. 删除三个脚本与 `__pycache__/`；`_bigmodel_md/` 不动（它是被文档引用的原始资料快照，`docs/CHARTER.md` §9）。
2. 删除之前，改写 `docs/reference/bigmodel-guide-digest.md` 的「附：原始快照索引」：去掉脚本一行，写明重新抓取的办法，并逐字列出三个脚本里的地址与路径字面量（脚本未跟踪，提交信息里的 SHA-256 只能核对身份、留不下内容）。〔实读 2026-10-29〕字面量如下：
   - 基址 `https://docs.bigmodel.cn`（三个脚本各一处）；
   - `_crawl_bigmodel.py`：索引 `https://docs.bigmodel.cn/llms.txt`；从索引里取指南页的模式 `https://docs\.bigmodel\.cn(/cn/guide[^)\s"\']+?)\.md`（去掉含 `&` 的）；补导航链接的种子页 `https://docs.bigmodel.cn/cn/guide/start/introduction` 与链接模式 `href="(/cn/guide[^"#?&]*)"`；
   - `_fetch_bigmodel.py`：链接模式 `href="(/cn/guide[^"#?]*)"`；请求头 `User-Agent` 为桌面 Chrome 126、超时 40 秒、重试 3 次；
   - `_fetch_extra.py` 的 9 个补充页：`/cn/coding-plan/overview.md`、`/cn/coding-plan/quick-start.md`、`/cn/coding-plan/latest-model.md`、`/cn/coding-plan/notice/api-key-management.md`、`/cn/coding-plan/notice/usage-revision.md`、`/cn/coding-plan/faq.md`、`/cn/api/rate-limit.md`、`/cn/faq/api-code.md`、`/cn/faq/user-rights.md`。

   重新抓取的办法：取索引，按上面的模式得到指南页，加上种子页里的导航链接与 9 个补充页；快照文件名是路径去掉首尾 `/`、`/` 换成 `__`（`cn__a__b.md` 对应 `https://docs.bigmodel.cn/cn/a/b.md`）；用 DSH 或 Kiro 的网页抓取工具逐页取。C1 动手时再数一次字面量的条数，与这里不一致就以脚本为准补全，再删。
3. 提交信息写明三个文件的 SHA-256 与大小（删除前算），以便事后核对删的是什么。

这三个脚本是 §7.4 说的一次性脚本：不转正，因为本仓库只用 Node，重新抓取有现成的网页工具（§7.2「先用现成工具」）。

## 9. 宿主契约（rc.3 证据）

| # | 接口 | 用在哪 | rc.3 证据 | 状态 |
| --- | --- | --- | --- | --- |
| H1 | `tools/pre-execute` 瀑布 `(exec, next)`，决策 `allow` / `deny{reason}` / `ask` / `cancel`；`deny` 的结果是 `Error: ` 加理由，工具体不执行 | guard 的模式判定、放行、跟进 | tools:3320–3321（瀑布）、3322–3355（决策与 `post-result`）〔实读〕 | 已在用（`docs/DESIGN.md` §2.4a） |
| H2 | `exec` 的 `name`、`arguments`（深冻结）、`agent`、`parent`、`callId` | 签名、目标、跟进 | tools:3229–3260、3263 | 已在用 |
| H3 | `ask` 决策交给宿主的审批；`userQuestions.ask` 与客户端的问答卡 | 不用：`d-chat-not-cards` 之后申报在对话里问 | tools:3321–3326；user-questions:530–535、668–686；client-ui-user-questions client.js:672–686、783–795、924–931（0.2 的 H3、H9、H9a） | 实读，不用 |
| H4 | `agent/pre-step` 瀑布，`{agent, messages, turn, step, signal}`；`messages` 是这一步从收件箱领出的消息（`inbox.claim`）；追加的 notice 与 `createUserMessage` 同形 | env 的两条步 notice；申报读人的回话（§5.5） | agent-loop:902–925〔实读〕；llm:37–66；共享接缝 `src/shared/step-notice.ts`（`admitted` 即 `decision.messages`） | 已在用 |
| H5 | `session.deriveMessages()`：助手消息里的 `tool-call` 块（`id`、`name`、`arguments`）与工具结果（`toolCallId`、`isError`）；消息带创建时的 `source` | 推出本步改过的文件；核对人回话之前的最后一条助手消息 | session:1672–1686；session:862–868、1217–1218；`toolCallArguments`、`toolCallOutcomes`；`src/shared/dsh-min.ts` `DerivedMessage.source` | 已在用（todo 提醒） |
| H6 | `session/event`：`tool/call` 的 `{turn, step, callId}`、`turn/end` 的 `{turn, reason}`；`session/disposed` | 跟进的步号与 `none` | agent-loop:681–690、1029–1032；session:1929–1933〔实读〕 | `session/event`、`session/disposed` 已在用（影子兜底） |
| H7 | `workingDirectory.get(session)` | 解析相对路径 | working-directory:76–78 | 已在用 |
| H8 | 会话头 `cwd`、`origin: 'subagent'`、`parentSession` | 圈禁根、子 agent 判断、派发链 | session:1820–1826、1051–1053；subagent:346–355 | 已在用 |
| H10 | `tools.register(definition)`：参数与输出 schema 在校验子集内 | `request_exception` | tools:2974–2984；子集见 `docs/ORCHESTRATION.md` §2.10 | 已在用 |
| H11 | `DeferredToolCall` 的内层调用经 `tools.execute`，以 `<callId>:deferred`、没有 `parent` 的根调用过 `tools/pre-execute`，看到内层名字与调用方 agent；不要求先检索，只核对目标在本请求的目录里、是延迟工具；会话历史与日志里记的是包装；包装的参数形状在 ZCode 3.17.1 不变 | GLM 上调用延迟的 `request_exception`；跟进、回放与改动文件的拆包 | tools:3210–3212；`src/toolsearch/index.ts`:155–175〔实读〕；`reference/zcode-3.17.1/zcode.cjs` 第 132 行〔实读 2026-10-30〕；L3 探针 `glm-goal`（`docs/DESIGN.md` §2.4a）；`docs/DESIGN.md` §5.5 | L3 已核实（同类调用） |
| H12 | 文件工具参数：`write` `file_path`、`content`；`edit` `file_path`、`old_string`、`new_string`；`read`、`read_image` `file_path`；`grep` `path`；`str_replace_editor` `command`、`path`、`file_text`、`old_str`、`new_str` | 四条影子规则、圈禁、改动文件 | tool-fs:549–560、690–705、251–258、986–990；tool-fs-search:1090–1100；str-replace-editor:141–171、267、281〔实读 2026-10-29〕 | 实读 |
| H13 | 会话日志：`<DSH home>/sessions/<工作区>/session-<id>/session.v4.jsonl(.zstd)`，压缩时是一串独立的 zstd 帧；事件 `tool/call {turn, step, callId, name, arguments}`、`tool/result {message{role, toolCallId, content, isError}}`、`request/header {header{config{provider, model}}}` | 回放 | session-persistence-jsonl:750–756、1138–1230；agent-loop:681–700、1226–1240〔实读〕；〔本机实测 2026-10-29：719 个日志逐帧解码，字段名如上〕 | 实读与本机实测；格式随 DSH 升级可能变（§11） |
| H14 | Node `zlib.zstdDecompressSync`（Node 22.15 起，实验性） | 回放解码 | 本机 Node v22.20.0 可用〔本机实测〕；回放在 Kiro 或终端里跑，不在宿主里 | 本机实测 |
| H15 | 图行服务 `dirFor(cwd)`、`isGraphTool`；M3 加的 `focusOf(session)` | 环境分支、检查行；申报文字背景一行的焦点标题（读不到就省去） | `src/graph/service.ts`；M3 §2.1 | 本仓库契约 |
| H16 | 数据目录服务 `glmHournessData` 的 `userHome`、`projectHome` | 凭证路径、日志、标注、备份、`requests/` | `src/shared/data-home.ts` | 本仓库契约 |
| H17 | `tools/post-execute` 瀑布 `(exec, result, next)`，可附 `additionalContexts`；先例 repeat-tool-reminder | 不用（§6.2 的取舍） | tools:3599–3627；repeat-tool-reminder:2247–2259 | 实读，不用 |
| H18 | ESLint 10.13 带压制文件时，被检查的文件里有用不上的压制就以退出码 2 结束，除非带 `--pass-on-unpruned-suppressions` | 本仓库的 ESLint 检查行 | `node_modules/eslint/lib/cli.js`:497–505、`lib/options.js`:322〔实读〕 | 实读 |
| H19 | 用户角色消息的来源：DSH 客户端经接口送来的人的消息是 `source {kind: 'user', rpcId, clientTimeZone?, principal?}`；headless 任务、父 agent 写给子 agent 的任务、命令、计划模式、ACP、SDK 送来的是 `{kind: 'user'}`、没有 `rpcId`；插件的提醒带 `form: 'notice'` | 只认客户端送来的人的话作批准（§5.5） | api-session-controller:3224–3229（`prompt`）；subagent:3195–3200（人在子会话里输入）、1461（父 agent 的任务）；headless:345；commands:338；plan-mode:221；acp:835；sdk-jsonrpc-server:161；DSH 自己按同一判断认客户端消息：client-file-upload:296–297〔实读 2026-10-30〕 | 实读；桌面版上的消息形状〔未核实，L4 第 1 项读会话日志核对〕 |
| H20 | 本机接口的鉴权：进程启动令牌换签名 cookie，签名密钥存在 Harness home 的凭证里 | §11 的剩余风险（shell 能否冒充客户端） | client-connection:276–301、415–445、499–522〔实读〕 | 实读 |

## 10. 外部输入的校验

| 输入 | 必填 | 规则 | 不合法时 |
| --- | --- | --- | --- |
| `request_exception` 参数 | 见 §5.3 的表 | 同左 | 工具错误 `invalid`，不登记、不写任何东西 |
| 申报编号 | 是 | `^r-[0-9a-z]{8}$`，在内存拒绝表里，属于调用方的派发链，2 小时内 | `not_found`、`forbidden`、`expired` |
| 人的回话 | — | 来自客户端（`source.kind: 'user'` 且有字符串 `rpcId`）；紧跟在以 `tail` 结尾、没有工具调用的助手消息之后；规范化之后整句在同意词或不同意词表里 | 不放行：`not-client`、`not-shown`（申报都留着）、`unclear`（换确认句，第 3 次关闭），§5.5 |
| 工具节点的检查行 | 否 | §6.1 的语法；格式三选一；必须有 `when`；命令非空、至多 2000 字符 | 跳过这一行，行健康列出节点与行号 |
| 工具节点的 `config` 行 | 否 | 写在验收条件里（§6.1）；逗号分隔的相对路径，不含 `..` | 跳过这一项，行健康写明 |
| 检查器输出 | — | §6.4 的三种格式；至多读 1 MiB | 「输出读不懂」，日志里有原文 |
| 标注命令 | 是 | 键存在；标签与记录种类相配（§3.4）；`--relay` 非空 | 退出码 1，不写 |
| 标注文件的行 | — | `LabelLine` 的形状 | 跳过并计数，`stats` 报「N 行标注读不懂」 |
| 回放的日志 | — | 帧头魔数切分；每帧解码后按行 `JSON.parse`；只留 §3.6 列出的字段 | 坏帧、坏行跳过并计数，进 `summary.json` |
| 回归语料的行 | 是 | `CorpusCase` 的形状；`rule` 在目录里；`args` 只有字符串、数字、布尔 | 测试失败并报行号 |
| `corpus add` 的脱敏结果 | — | 不含用户主目录、DSH home 与会话工作目录的绝对路径 | 退出码 1，不写 |
| guard 行配置 | 否 | 不变（`workspaceRoots`、`rules`、`home`、`fs`） | 不变 |
| env 行配置 | 否 | `home`（字符串）、`fs`（测试注入） | 忽略不合法的项，行健康写明 |

## 11. 失败与预案

激活期（`apply`）都不抛错：env 行缺图行服务、缺数据目录服务、缺 `workingDirectory` 时照常激活，按下表降级并上报行健康（`AGENTS.md`）。

| 操作 | 失败 | 怎样发现 | 恢复 | 调用方收到 | 留痕 |
| --- | --- | --- | --- | --- | --- |
| 规则判定 | 判定器抛错 | `judge` 的 `errors` | 这条规则对这次调用放行（同今天的 fail-open） | 照常的结果 | 行健康「规则 <id> 判定出错 N 次」；控制台每条规则每个会话一次 |
| 判定上下文 | 读文件、`git ls-files` 出错或超时（5 秒） | `prepareContext` 的未知项 | 用到它的规则放行、不写影子记录 | 照常 | 行健康「<规则> 缺上下文 N 次」 |
| 写流水 | 没有项目目录、写入出错 | `rowJournal`（已有：每个目录报一次） | 记录丢失，统计少算；配上目录后恢复 | 照常 | 控制台一次；行健康「无项目目录，违规不落盘」 |
| 跟进记录 | 进程重启；`tool/call` 映射被挤出（一个会话超过 512 个调用之前的） | 内存表丢失；查不到步号 | 少几条，不补；查不到步号的调用不结算 | — | — |
| 申报：编号 | 不存在、过期、不属于调用方、派发链断了 | §5.3 第 3 条 | agent 重新调用被拒的那个调用拿新编号；链断了就在回复里问人 | 工具错误，带 `hint` | 会话日志 |
| 申报：会话里已有一条在等 | 另一个编号 | §5.3 第 5 条 | 先等人回那一条 | `busy` | 会话日志 |
| 申报：读目标 | `stat` 出错（权限等） | 抛错 | agent 在回复里把原因告诉人 | `unavailable` | 会话日志 |
| 回话：不来自客户端 | ACP、SDK、headless 送来的消息 | §5.5 第 2 条 | 申报留着，等客户端里的回话 | 说明一条 | `RequestRecord {outcome: 'not-client'}` |
| 回话：人读到的不是申报文字 | agent 改了字、后面又说了别的、中间又有别的回复；人在 agent 回合没结束时插话 | §5.5 第 3 条 | 不放行，申报留着；agent 回合末原样再出示一次，等人下一句 | 说明一条 | `not-shown`；GLM-5.3 照抄的成功率在 L4 第 1 项与晨报的计数里看 |
| 回话：读不懂 | 不是整句的同意或不同意 | §5.5 第 4 条 | 换确认句；第 3 次关闭，从头申报 | 说明一条（带确认句） | `unclear`、`closed` |
| 回话：人一直不回 | 2 小时 | 下一步或会话卸载时比较时刻 | 申报作废 | — | `expired` |
| 回话：步 notice 出错 | 读历史抛错等 | `installStepNotice` 的 `build` 里捕获 | 这一步不放行、申报留着，下一步再读 | 照常 | 行健康降级；控制台一次 |
| 放行之后的说明：参数文件 | 写 `requests/<编号>.call.json` 失败、没有项目目录 | 抛错 | 说明里只写工具与目标，提醒内容要与被拒的那次相同 | 说明一条 | 行健康降级 |
| 行重新加载、进程重启 | 内存里的拒绝表、申报与放行都丢了 | — | 人之后的「可以」只是普通消息；agent 重调被拒的调用拿新编号、再申报，人再回一次 | 圈禁的纠偏（新编号） | 违规流水 |
| 放行：目标变了 | 使用时的 `stat` 与申报文字里的事实不同 | 比较 | 拒绝，放行作废；agent 重新申报，人看新的事实 | `Error: The target changed since the human approved …` | `GrantVoidRecord` |
| 放行：核对目标 | `stat` 出错（权限等） | 抛错 | 当作「目标变了」处理：拒绝、作废 | 同上，`<变了什么>` 写错误码 | 同上 |
| 放行：备份 | 复制失败 | `copyFile` 抛错 | 拒绝这次调用，放行留着；agent 再调或问人 | `Error: the approved write was not run: …` | 行健康；违规流水不写 `GrantRecord` |
| 放行：并行 | 同一步里两次同签名调用 | 「使用中」集合 | 第二次照常拒绝 | `Error: …`（圈禁的纠偏） | 违规流水 |
| 第三次修复之前提问 | 提议被拒 | 引擎的结果 | 下一次重开再判 | `graph_status` 的 `notice` 写原因 | 会话日志 |
| 跟进：各行拿到不同的记录器实例 | 宿主给行加载了两份 `followup.js` | L3 场景 `guard-followup` 的核对 | 跨行的跟进少记（guard 行自己的仍对）；改为经服务共享记录器 | — | 探针失败 |
| 记录分类 | 流水里有读不懂的行 | `classifyRecord` 返回 `unknown` | 不算拒绝、不算影子 | — | 晨报「N 行记录读不懂」 |
| 检查：命令 | 找不到命令、退出码非 0 且读不懂、超时 | `spawn` 的错误、退出码、计时器 | 结束进程树；连续 3 次后本会话不再跑这一行 | notice 里一行原因与日志路径 | 日志；行健康 |
| 检查：结束进程树 | `taskkill` 失败 | 退出码 | 不再等它；`ChildProcess` 的 `exit` 之后才释放并发名额 | notice 写「could not stop」 | 行健康「N 个检查进程没能结束」 |
| 检查：一步等太久 | 超过 20 秒 | 计时器 | 后台继续，下一步送到 | notice 写「still running」 | — |
| 检查：图 | 图读不出、没有 `env` | 读图 | 不跑检查；env 提醒只有草稿区一行 | 照常 | 行健康 |
| 草稿区忽略 | 写 `.git/info/exclude` 失败；写了之后 `git check-ignore` 仍不为 0（例如项目的 `.gitignore` 里有 `!/.llm/` 一类的反向模式） | 抛错；追加之后的复核 | 不重试，这个进程里不再追加（重启后先查已有的 `/.llm/` 行，有就不再追加）；`scratch-only` 照常判 | — | 行健康降级「草稿区没有被 git 忽略：<原因>」 |
| 日志轮转 | 删除失败 | 抛错 | 下次激活再试；只删名字合规的目录 | — | 控制台一次 |
| 压制计数 | `git` 不可用、超时 | 抛错、计时器 | 当天不再试 | — | 行健康 |
| 回放 | 日志格式变了（DSH 升级）、坏帧 | 解码失败计数、事件里缺字段 | 跳过并计数；整批失败退出码 2；按 `docs/DEVELOPMENT.md` §4 重新导出运行时包核对 H13 | `summary.json` 写坏帧数 | `summary.json` |
| 回归语料 | 生效规则与标注不一致 | `npm test` 失败 | 改规则、或把这条标为 `known` 并挂节点 | 测试失败，报行号 | git |
| 规则目录与规范节点 | 不一致 | 契约测试 | 改代码或改节点（模式要人拍板） | 测试失败 | git |

不可逆的东西与防线：

| 风险 | 防线 |
| --- | --- |
| 放行的写入覆盖工作区外的文件 | 人逐次批准，申报文字写明完整路径、文件在不在、多大、内容预览；只有人整句回「可以」一类的话才放行；使用时重新核对目标，与申报文字里的不同就拒绝并作废；目标存在且不大于 10 MiB 时一律先备份；大于 10 MiB 或没有项目目录时文字里写「旧内容找不回来」。剩余：核对与写入之间毫秒级的窗口 |
| 放行被重复使用 | 绑定签名与派发链的根、30 分钟、一次；进程内「使用中」集合；放行只在内存里，进程重启就没了 |
| LLM 自己批准自己的申报 | 放行只由 §5.5 写入：来自 DSH 客户端的人的消息（宿主给它带 `rpcId`，模型的回复、工具参数、父 agent 写给子 agent 的任务、插件提醒都没有），紧跟在以申报文字结尾的助手消息之后，整句是同意词。违规流水与项目图都不作授权来源。剩余：模型用 shell 绕过客户端调本机接口。接口要进程启动令牌或签名 cookie（H20），签名密钥在 Harness home 的凭证里；读到它就能冒充客户端。0.2 的问答卡同样经客户端回答，这条边界不是新的；它与「shell 能直接写工作区外」是同一类已知边界（file-tools-only 只认读法看得见的写入） |
| 伪造人对第三次修复的拍板 | 拍板只记结论，不授权任何东西。剩余：shell 用读法看不见的方式改节点文件，可以伪造一条 `human` 的拍板；同一回合跑过图工具时，工作区变更兜底把图目录下的改动当作已知写入，看不见它（`src/guard/shadow.ts` 文件头，评审第 2 轮 N18）。发现途径：节点文件是已跟踪文件，`git diff` 看得见；面板上会出现人没拍过的拍板。与 shell 直接写工作区外是同一个已知边界 |
| git 命令丢掉没提交的改动或改写历史 | 不拦 git（`d-main-agent-shell`）；会丢工作的 git 命令执行前由 M3 的 git 快照门先存快照、记下、告诉主 Agent 怎样恢复（M3 附录 0.3 §2.5）。M4 的规则不判 git |
| 检查命令执行任意命令 | 只跑已批准的工具节点里的命令；验收条件批准之后只有人能改；改动文件的路径按平台加引号（POSIX 单引号，Windows 双引号加排除表），文件名里的命令替换不展开；日志第一行记下展开后的命令行 |
| 删除文件 | 只删 env 行自己的日志目录（名字为 8 位十六进制，在 `<项目目录>/env-checks/` 下）与 §8 的三个脚本（删除前地址写进文档，提交信息记 SHA-256，快照不动；C1 按 `norm-review-floor` 全审） |
| 改用户的仓库 | 只在 `.git/info/exclude` 末尾追加一行注释与一行 `/.llm/`（本地、不入库、删掉这两行即可撤回；已有 `/.llm/` 行时不追加） |
| 读用户的会话 | 回放只读工具调用的命令文本与路径（D2，人 2026-10-30「不介意」），不读对话正文与写入的内容；结果只写项目目录；进仓库的样本先脱敏、再过密钥扫描 |

## 12. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 影子模式的规则从不拦截，判为拒绝时留一条影子记录 | `judge`（`src/guard/rules.ts`）与 `installRuleGate`（`src/guard/gate.ts`） | 所有用 guard 框架的行都经这一个安装函数（`evaluate` 已删，契约测试核对），一处保证 |
| 拦截后的跟进每次模型调用结算一次 | `followup.ts` 的 `observe`，由 `installRuleGate` 第一步调用；拆包与步号也在这里 | 最外层的监听器先看到调用；按 `callId` 去重；只认有 `tool/call` 事件的调用 |
| 流水的每一行恰好一类 | `classifyRecord`（`src/guard/records.ts`） | 晨报、统计、命令行、阶梯、规则页读同一个分类，数字不会因读者不同而不同 |
| 规则的模式只随代码提交改变 | 规则对象的 `mode` 字段；契约测试核对规范节点 | 运行时没有任何写入能改模式；改它的提交按 `norm-review-floor` 全审 |
| 影子规则不进声明 | `declarationSection` | 告知只说会执行的规矩 |
| 放行只来自人 | `src/guard/request.ts`：`GrantBook` 只由读人回话的那一处写入，那一处只认客户端送来的、紧跟申报文字的整句同意 | 授权要可证；模型能写的东西（回复、参数、流水、图）不进授权 |
| 人批的就是他读到的 | 读人回话时核对上一条助手消息以 `tail` 结尾 | 申报文字由 harness 写，agent 只负责原样放出 |
| 批准的事实就是执行时的事实 | `GrantBook` 的使用时核对 | 人批的是申报文字里的事实 |
| 一个放行至多用一次 | `installRuleGate` 的放行消耗（「使用中」集合） | 只有它看得见调用 |
| 给人看的方案文字只有一种格式 | `renderPlan`（`src/graph/plan-text.ts`），内含换词检查 | 格式再改只改一处；不让 harness 写出人没学过的词 |
| 检查命令只来自已批准的节点 | `envBranch`（`src/env/branch.ts`） | 读取处过滤，运行处只收它的结果 |
| 标注不改变行为 | `measure.ts` 是纯函数，只被命令行、晨报与阶梯读 | 度量与执行分开 |
| 回放不写 `~/.dsh`、不读对话正文与写入内容 | `src/guard/replay.ts` 只用读文件的接口、解码时只留 §3.6 的字段，输出目录由调用方给 | 只读；D2 的边界在一处守 |
| 进入仓库的样本已脱敏 | `sanitizeCase`；`npm test` 的密钥扫描兜底 | 两道 |

## 13. 实施顺序

每步一个提交，提交信息带节点 id；文档与代码同一提交（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`（L3，`docs/DEVELOPMENT.md` §1.1）。「今天必败」是这一步新增的 L2 检查在今天的代码上怎样失败，用来证明检查钉住了新行为。

开工条件：从 main 建分支（`8599304` 或之后）。G4 只等 M3 第 4 步合入（`dispatchRoot`，`src/guard/main-agent.ts`）；`focusOf` 没合入时申报文字省去背景一行的焦点半句，不等它。E2 用 M3 第 5 步的 `src/graph/digest-notice.ts`，M3 没先做时由 E2 抽出。G1–G3、E1–E4、R1、C1 不等 M3。

推进与问人（`d-auto-drive`、`d-design-onepage`）：人放行本设计之后，主 Agent 按本节的顺序自己推进到做完：派活、审查、合入；子 agent 与审查用什么模型由主 Agent 选并记理由（`d-main-agent-models`），harness 只记录。M4 里必须停下来问人的只有：D1（开工之前，与放行一起问，§17）；某条影子规则达到判据、要转生效（§3.5）；第三次修复（§4.6）。运行中的申报（§5）是使用者当时的事，不是开发流程的一步。开发中发现的问题按 `d-design-onepage` 分三档：只影响 M4 且可逆的由主 Agent 定、在下一批问题里告知；改到 M4 设计方向的回到本设计的循环；改到框架的回到大循环，受影响的部分暂停。问题攒着问，一次至多三件。

评审：`norm-review-floor` 规定改到拦截与权限（guard 规则、写入范围、主 Agent 与子 agent 的工具面）、删文件的改动一律全审，由 harness 按改动的文件与命令判断，主 Agent 绕不过去。M4 里落在清单上的是 G1–G4（都改 `src/guard/`，G4 另给所有 agent 的工具面加 `request_exception`）与 C1（删文件），之后每一次改规则的模式、改可申报名单、改同意词表也是。其余各步的深浅由主 Agent 定（`question-38` C），下表写建议。

### 13.1 步骤

| 步 | 内容 | 主要文件 | 层 | 评审 | 今天必败 |
| --- | --- | --- | --- | --- | --- |
| G1 | 规则模式与影子判定：`RuleMode`、`judge`（保留全部生效拒绝）、`installRuleGate`，guard 行与 `installGraphFileGuard` 改经它安装，`evaluate` 删除；`RuleShadowRecord`、`call` 字段、`recordKey`、`classifyRecord` 与 §3.2 的全部记录类型，晨报两处过滤改用它；声明只列生效规则；规则目录与契约测试；拒绝文案去掉 `APPLICATION_PROTOCOL`（圈禁用「还没有申报通道」那一句，file-tools-only 用新文案，§5.2，注入清点 §0） | `src/guard/rules.ts`、`gate.ts`、`records.ts`、`catalog.ts`、`index.ts`、`graph-files.ts`；`src/workflow/morning-report.ts`；`tests/guard-audit.spec.ts`、`tests/guard-gate.spec.ts`、`tests/contracts.spec.ts`、`tests/workflow.spec.ts`；探针场景 `glm`、`non-glm-guard` 的纠偏期望；`docs/ORCHESTRATION.md` §6.1、§6.5 | L1、L2、L3（全部现有场景照旧通过，纠偏期望按新文案改） | 全审（`norm-review-floor`：guard 规则） | 一条 `mode: 'shadow'` 的测试规则今天会拦下调用；同一条测试规则交给图行的安装路径时没有影子记录；`judge`、`installRuleGate`、`classifyRecord` 不存在；一条带 `rule`、不带 `mode` 的 `{kind: 'followup'}` 记录今天被晨报算成「违规」；圈禁的纠偏写「file a request」 |
| G2 | 跟进记录（`observe` 接进 `installRuleGate`；拆 `DeferredToolCall`；按 `tool/call` 的步号跳过同一步；`turn/end` 与会话卸载记 `none`；没有 `tool/call` 事件的调用不结算）；标注、统计、`PROMOTION`；回放（D2 选 B：只读命令文本与路径，拆包）；回归语料（七条事故种子手写）与测试；命令行；晨报两行 | `src/guard/followup.ts`、`gate.ts`、`measure.ts`、`replay.ts`、`corpus.ts`、`cli.ts`、`index.ts`；`src/shared/deferred-call.ts`（E3 未先建时）；`scripts/guard/cli.mjs`；根 `package.json`；`tests/guard-corpus/`、`tests/guard-corpus.spec.ts`、`tests/guard-followup.spec.ts`、`tests/guard-measure.spec.ts`、`tests/guard-replay.spec.ts`（夹具是测试里现造的多帧 zstd 日志）、`tests/fake-rc3.ts`；`src/workflow/morning-report.ts`、`tests/workflow.spec.ts`；`docs/DEVELOPMENT.md` 加命令行一节 | L2、L3（`non-glm-guard` 与 `glm` 场景核对一条跟进记录；新场景 `guard-followup`） | 全审（同上） | 拦截后的下一次调用不留记录；连续两次被 `graph-files-only` 拒绝不留 `repeat`；GLM 路由上经包装的 `request_exception` 之后没有 `right-path`；`ruleStats` 不存在；晨报没有「已标」「走对」 |
| G3 | 判定上下文；`mention.ts` 抽出；四条影子规则；`docs/ORCHESTRATION.md` §6.4 改写 | `src/guard/context.ts`、`mention.ts`、`credential-read.ts`、`suppression.ts`、`checker-config.ts`、`scratch.ts`、`graph-files.ts`（只改导入）、`index.ts`、`catalog.ts`；`src/shared/suppression-markers.ts`（E4 未先建时）；`tests/guard-shadow-rules.spec.ts`；探针场景 `guard-shadow-rules` | L2、L3 | 全审（同上） | 读凭证文件、写不带理由的 `eslint-disable`、改 `tsconfig.json`、在仓库根新建 `fix.py` 都不留记录 |
| G4 | 申报通道：编号与带编号的拒绝文案、`request_exception`、申报文字（`renderPlan`）、读人的回话（步 notice、同意词表、确认句）、放行簿（内存、使用时核对、备份、一次）、圈禁覆盖 `str_replace_editor`、晨报一行 | `src/guard/request.ts`、`gate.ts`、`rules.ts`、`index.ts`；`src/graph/plan-text.ts`（R1 未先建时）；`src/graph/plain-question.ts`（M3 第 3 步未合入时）；`src/shared/tool-names.ts`；`tests/guard-request.spec.ts`、`tests/plan-text.spec.ts`、`tests/fake-rc3.ts`、`tests/contracts.spec.ts`；探针场景 `guard-request`、`guard-request-refuse`；`src/workflow/morning-report.ts`；`docs/ORCHESTRATION.md` §5、§6.1 | L2、L3；L4 随批次 | 全审（guard 规则、权限与工具面） | 圈禁的纠偏没有编号；`request_exception` 没有注册；`str_replace_editor create` 写工作区外放行；人回「可以」之后同一调用仍被拒。另有两例今天恰好通过、留作防回归：向流水追加伪造的 `RequestRecord` 与 `GrantRecord` 之后同一个工作区外的写入仍被拒；一条不带 `rpcId` 的「可以」不放行 |
| E1 | env 行骨架与登记、行健康 `env` | `src/env/index.ts`；`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（`name: dsh-hourness/env`）、`packages/hourness/package.json`（`./env` 与 `./env/locale/*.json`）、`packages/hourness/locale/env/en.json`、`zh.json`（设置页标题：「开发环境」/「Dev environment」与一句说明）、`packages/hourness/tsconfig.json`（随表）、`src/shared/health.ts`、`tests/contracts.spec.ts`、`tests/health.spec.ts`；`docs/DESIGN.md` §2.2、§2.5、§7 | L1、L2、L3（`hourness-only` 场景里 `env` 行生效） | 主 Agent 定（建议轻审） | 行 id 清单与 `HOURNESS_ROWS` 没有 `env`；`npm run preflight` 报没有 `./env` 导出与 `locale/env/` |
| E2 | 环境分支读取（检查行与 `config` 行）、环境提醒、草稿区忽略（追加两行、去重、复核）、`scratchLeftovers` | `src/env/branch.ts`、`notice.ts`、`ignore.ts`、`index.ts`；`src/guard/scratch.ts`（只加 `scratchLeftovers`，若 G3 未到则 E2 建这个文件的这一部分）；`tests/env-branch.spec.ts`、`tests/env-notice.spec.ts`、`tests/env-ignore.spec.ts`（真实的临时 git 仓库）；探针场景 `env-notice`；`docs/ORCHESTRATION.md` §7.1、§7.4 | L2、L3 | 主 Agent 定（建议全审：写用户仓库的 `.git/info/exclude`） | 第一步没有环境提醒；临时仓库里 `git check-ignore -q .llm/scratch/x` 退出码为 1；带 `!/.llm/` 反向模式的仓库里行健康不报降级 |
| E3 | 检查器：检查行语法、运行、解析、改动行、提醒 | `src/env/runner.ts`、`parsers.ts`、`changed-lines.ts`、`check-notice.ts`、`index.ts`；`src/shared/deferred-call.ts`（G2 未先建时）；`tests/env-checks.spec.ts`（真实子进程跑一个夹具脚本）；探针场景 `env-checks`；`docs/ORCHESTRATION.md` §7.5、§7.7 | L2、L3；L4 随批次 | 主 Agent 定（建议全审：harness 以 shell 运行命令） | 写入成功后下一步没有检查结果 notice |
| E4 | 压制注释计数与晨报一行 | `src/env/suppressions.ts`、`index.ts`；`src/shared/suppression-markers.ts`（G3 未先建时）；`src/workflow/morning-report.ts`；`tests/env-suppressions.spec.ts`；`docs/ORCHESTRATION.md` §7.6 | L2 | 主 Agent 定 | `suppressions.jsonl` 不存在；晨报没有压制注释一行 |
| R1 | 第三次修复之前问人：重开计数、`reopenQuestion`（四行正文、今天引擎记结论要的键、`propose` 的 `reason`）、`graph_status` 的 `notice` | `src/graph/reopen.ts`、`tools.ts`；`src/graph/plan-text.ts`（G4 未先建时）；`tests/graph-reopen.spec.ts`；`docs/ORCHESTRATION.md` §2.4（写明数法：第 n 次重开即第 n 次修复开始；问法是四行的方案） | L2、L3（现有图场景照旧通过） | 主 Agent 定（建议全审：harness 以自己的身份写人定的待决） | 第 3 次重开之后节点下没有待决 |
| C1 | 先把三个脚本里的地址与路径字面量逐字写进快照索引的「附」，再删除三个脚本与 `__pycache__` | `.llm/docs/`（不入库）；`docs/reference/bigmodel-guide-digest.md`；`docs/ORCHESTRATION.md` §7.4 末句 | L1 | 全审（`norm-review-floor`：删文件） | — |
| K1 | 标定题：会诱发 shell 写文件与工作区外写入的小任务，记分加「拦截后下一步走对」 | `tests/calibration/<题>/`（按 M7 的回归集结构，M7 未合入时按今天的格式） | 标定 | 主 Agent 定 | — |

K1 等两件事：G2 与 G4 已合入（量的是新的拒绝文案）；`ablation` 任务把标定运行目录移出仓库（`risk-calib-read`）。K1 不需要放行：它量的是拦截之后模型的下一步，模拟人（M3 附录 0.3 §3.3 的 C）回不回「可以」都不影响分数；模拟人的消息不带 `rpcId`，也放行不了（§5.5）。花积分按常设授权，结果写进 K1 的节点批注。

### 13.2 并行的线

| 线 | 步 | 只碰这些文件 |
| --- | --- | --- |
| guard | G1 → G2 → G3 → G4（串行：都改 `src/guard/index.ts`） | `src/guard/`、`scripts/guard/`、`tests/guard-*`、`tests/guard-corpus/` |
| env | E1 → E2 → E3 → E4 | `src/env/`、`tests/env-*`、`packages/hourness/locale/env/` |
| 图 | R1 | `src/graph/reopen.ts`、`src/graph/tools.ts`、`tests/graph-reopen.spec.ts` |
| 清理 | C1 | `.llm/docs/`、`docs/reference/bigmodel-guide-digest.md` |

四条线互不碰同一个文件，下面这些共用文件除外，由编排者按 §13.3 排先后：`docs/ORCHESTRATION.md`、`docs/DESIGN.md`、`docs/DEVELOPMENT.md`（各步只改自己的小节）；`src/workflow/morning-report.ts`（G1、G2、G4、E4）；`tests/contracts.spec.ts`（G1、G4、E1）；`tests/fake-rc3.ts`（G2、G4，M3 的步也改它）；登记文件（E1）；`src/shared/tool-names.ts`（G4）；三个「谁先开工谁建、另一方只导入」的文件：`src/shared/suppression-markers.ts`（G3、E4）、`src/shared/deferred-call.ts`（G2、E3）、`src/graph/plan-text.ts`（G4、R1）；`src/graph/plain-question.ts`（M3 第 3 步或 G4）；`scripts/probe/` 的场景登记（各线加场景）；`src/guard/scratch.ts`（G3 建、E2 加一个函数）。探针与桌面版一次只能有一个持有者（`risk-shared-desktop`），各线的 L3 由编排者排队。

### 13.3 与其他工作的先后

| 共用 | 和谁 | 规则 |
| --- | --- | --- |
| `src/guard/index.ts` | M3（第 3 步把 `DECLARATION_SECTION` 移到 `src/guard/sections.ts`）；规则板 R4（`glm:guard` 加一行） | 先合入的先改，后到的在它之上重做；G1 开工前看这两步是否已合入 |
| `src/guard/` 下 M3 的新文件 | M3 第 4 步（`main-agent.ts` 的 `dispatchRoot` 与两条写入规则、`git-snapshot.ts`、`shell.ts` 加 `simpleCommands`） | M4 不改这几个文件；G4 导入 `dispatchRoot`；git 快照门按 §3.3 调 `observe` 与 `noteDenial`：G2 先合入则 M3 第 4 步直接加，M3 先合入则 G2 在它的监听器里加这两行 |
| `src/graph/tools.ts` | 规则板 R4（`graph_decide` 之后调 `acceptProposal`）；M3 | 先合入的先改，后到的在它之上重做 |
| 登记文件 | M3 第 3 步、规则板 R4、M7 E0/P3 | `env` 行排在已合入的编排层宿主行之后、`ui` 之前；每个新行按 `6134c83` 的做法带导出与 `locale/<行>/` |
| `src/workflow/morning-report.ts` | M3 第 9 步（去掉 L1/L2/L3）；M7 的四答晨报 | 先合入的先改，后到的在它之上重做（与其他共用文件一样）；M4 改四处（G1 的过滤、G2 的两行、G4 的申报一行、E4 的压制一行）；M7 接手时照 §3.10、§5.8、§6.7 的行写（评审第 2 轮 N20） |
| `tests/fake-rc3.ts` | M3 的各步 | 先合入的先改；各方只加自己要的 rc.3 信号，不改别人加的（评审第 2 轮 N22） |
| `src/guard/catalog.ts` 与规则板的目录 | 规则板 R1 | §2.3：后到的一方改成导入 |
| `scratchLeftovers` | M7 汇合门禁 | M7 在 E2 之后接入 |
| `installRuleGate` | M3 第 4 步（`installMainAgentRules`）、M7 的写入规则 | G1 先合入：M3、M7 直接用它；M3 第 4 步先合入：G1 把 `installMainAgentRules` 改成经它安装（行为不变，M3 的 L2 照旧通过） |
| `observe`、`noteDenial` | 规则板 R4 的工具调用门；M3 的 git 快照门 | 两个监听器第一件事调 `observe`、拒绝时调 `noteDenial`（§3.3）；谁后合入谁加这两行 |
| `src/graph/plain-question.ts` | M3 第 3 步 | M3 先合入：G4 导入；G4 先合入：G4 照 M3 附录 0.3 §2.8 的内容建，M3 改成导入 |
| `background` 字段 | plain-ui 第 1 步，或 M3 第一个写人定待决的步（M3 附录 0.3 §2.9） | R1 合入时引擎里有这个字段就写，没有就只写正文；字段后到时，加它的那一步顺带让 `reopenQuestion` 写它 |
| 人定的题不再要选项字段（`d-chat-not-cards` 落地方案第 2 条） | 改写 `d-option-card` 的那件事（还没有节点） | 合入后只改 `reopenQuestion` |
| `src/shared/suppression-markers.ts` | G3 与 E4 | 谁先开工谁建；E4 不依赖 G3 的 `src/guard/suppression.ts` |

### 13.4 批次 L4

M4 的 L4 攒到一批（`docs/DEVELOPMENT.md` §1.1），在 G4、E3 合入之后，与规则板 R4–R7 的第一批合做一次也可以：

1. 桌面版重启后，GLM-5.3 新会话（临时工作目录）写工作区外的一个已存在的临时文件：拒绝的纠偏带编号与四个字段；agent 调 `request_exception`，回复末尾原样是申报文字（题目一段，四行各自成段、每行一处加粗，「附」里有内容预览，问话在最后）；人回「可以」，下一步同一调用执行，旧内容在 `.llm/requests/`；再调一次被拒。读这个会话的日志，核对人那条消息的 `source` 带 `kind: 'user'` 与 `rpcId`（H19）。GLM-5.3 没有原样放出文字时记下是怎样改的（`not-shown` 的情形）。
2. DeepSeek 新会话做同样的事：纠偏用原生工具名，申报文字相同，记录 `scope: other`。
3. 人回「可以吗」：agent 收到确认句并放在回复末尾；再回「可以」放行。另一次人回「不行」：不放行，agent 不再试。
4. `/wish` 的主 Agent 会话里派一个子 agent 写工作区外：子 agent 被拒，结果里带编号与路径；主 Agent 申报、人回「可以」、主 Agent 按说明里的参数派子 agent 原样写，成功。
5. 在本仓库的 GLM-5.3 会话里用 `Edit`、DeepSeek 会话里用 `edit`，各改一个 `.ts` 文件引入一个 ESLint 告警：下一步的请求末尾有检查结果 notice（发现数、`文件:行`、日志路径）；修好之后出现一行全 0。
6. 会话第一步有环境提醒；`/hourness-status` 的表里 `env` 一行生效；设置页里 `env` 行显示标题而不是文件地址。
7. 桌面版日志没有本包的新错误。

## 14. 验证

### 14.1 L3 探针场景

| 场景 | profile | 做什么 | 检查 |
| --- | --- | --- | --- |
| 现有全部 | — | 不变 | G1 之后全部照旧通过；`glm`、`non-glm-guard` 的纠偏按 §5.2 的新文案改期望（G1 改一次，G4 再改一次） |
| `guard-followup` | `probe-full` | 图目录用仓库图的副本；依次：用 `write` 写副本里的一个节点文件两次（两次都被 `graph-files-only` 拒绝）；再 `pwsh` 跑 `Set-Content x.txt 1`（被 file-tools-only 拒绝）；再 `write` 写 `x.txt` | 违规流水有三条拒绝与三条跟进：第一次图写入之后 `repeat`（由图行结算），第二次之后 `other`，shell 写之后 `right-path`；这一场景同时证明图行与 guard 行共用一个跟进记录器（§3.3） |
| `guard-shadow-rules` | `probe-full`，GLM 与 `deepseek-probe` 各一遍 | 场景 DSH home 下放一个假的 `glm-hourness/credentials.json`；依次：`read` 它；`write` 一个带 `// eslint-disable-next-line` 而没有理由的 `.ts`；`edit` 临时仓库里的 `tsconfig.json`；在仓库根新建 `fix.py` | 四个调用都执行；违规流水恰好四条 `via: 'rule'` 的影子记录，`scope` 分别为 `dialect`、`other`；系统提示词的 `glm:guard` 节与之前逐字相同 |
| `guard-request` | `probe-full`，GLM（`request_exception` 经 `DeferredToolCall`）与 `deepseek-probe` 各一遍 | 覆盖层的验证插件扮演人：根 agent 的 `turn/end` 时，若最后一条助手消息以申报文字结尾，就 `agent.followup(createUserMessage({content: [{type: 'text', text: '可以'}], source: {kind: 'user', rpcId: 'probe-1'}}))`。脚本：`write` 工作区外 → 拒绝；`request_exception` → `ask`；回复以 `text` 结尾、结束回合；（人回「可以」）；同一 `write` → 执行；再一次 → 拒绝 | 纠偏带编号、`request_exception` 与四个字段；申报文字的格式（题目、四行、「附」、问话在最后）；人回话之后那一步的请求末尾有放行说明，带工具与参数；目标文件内容等于参数，旧内容在 `requests/`；违规流水依次有拒绝、跟进 `right-path`（GLM 一遍是拆包之后的结算，评审第 2 轮 F9）、`asked`、`approved`（带原话「可以」）、`GrantRecord`、拒绝 |
| `guard-request-refuse` | `probe-full` | 同上的验证插件，四个回合依次送：不带 `rpcId` 的「可以」；带 `rpcId` 的「可以吗」；agent 回复末尾改成确认句之后带 `rpcId` 的「可以」；第二条申报时 agent 故意在文字后面多写一句，再送带 `rpcId` 的「可以」 | 第一次 `not-client`、写入仍被拒；第二次 `unclear`，说明里有确认句；第三次 `approved`，写入执行；第四次 `not-shown`，写入被拒、申报留着。流水的记录与上面一一对应 |
| `env-notice` | `probe-full` | 图副本里有 `env` 与一个已批准、一个提议中的工具节点；临时仓库不忽略 `.llm/` | 第一个请求末尾有环境提醒（一个工具、「1 more tool node waits」、草稿区一行）；场景结束后在临时仓库里跑 `git check-ignore -q .llm/scratch/x`，退出码为 0（不核对文件的文字）；`.git/info/exclude` 里恰好一行 `/.llm/`；第二个请求没有环境提醒 |
| `env-checks` | `probe-full` | 工具节点带 `check lines $ node lint.mjs {files}` when .txt，`lint.mjs` 对含 `TODO` 的行打印 `<file>:<line>:1: todo found`；依次 `write` 一个含 `TODO` 的 `a.txt`、`edit` 去掉它、再走一步不写 | 第二个请求末尾有检查结果 notice（1 finding，`a.txt:1`，`[changed]`，日志路径存在）；第三个请求有一行全 0；第四个请求没有检查结果 notice |
| `hourness-only` | `probe-hourness` | 现有场景 | 另核对 `env` 行生效、`request_exception` 在工具面里 |

`guard-request` 的扮演方式〔未核实〕：headless 运行器在它自己的 agent 第一次空闲时退出（`run-probe.mjs` 的 `goal-headless` 一节），`turn/end` 时排进收件箱的消息能否在退出之前开出下一回合要在 L3 上看；不能时改用 `glm-goal` 的做法，由验证插件在一次工具调用里另起一个根 agent 驱动这几个回合。插件能造带 `rpcId` 的消息不是漏洞：插件本来就是 harness 的一部分，模型造不出来。

探针运行目录照旧隔离（`docs/DEVELOPMENT.md` §3）：凭证、流水、日志与备份都在场景目录里。

### 14.2 L2

纯函数：`judge`（生效与影子的组合、多条生效拒绝、抛错）、`classifyRecord`（每种记录、规则板的两种 `mode`、读不懂的行）、`unwrapDeferredCall`（合法、少字段、多字段、`input` 不是对象）、`followupOf` 与 §3.3 列的跟进各例、`ruleStats` 与 `PROMOTION`、标注的取舍（人优先）、`decodeSessionLog`（多帧、坏帧、不压缩）、回放的判定、来源、拆包与 D2 的字段边界（夹具里写入内容带一个标记串，`replay.jsonl` 与 `summary.json` 里都找不到它）、`sanitizeCase`、四条规则的 `detect`（含 §1.2 的不触发情形）、签名、`quoteForShell`（两个平台）、`envBranch`、检查行与 `config` 行的语法、三种解析器、改动行、两种 notice 的渲染与长度上限、`reopenCount` 与 `reopenQuestion`（第 3 次重开提问、人说「接着修」之后再数 3 次、`propose` 的 `reason` 认法、正文被改过照样认得）。

给人看的文字（评审第 2 轮 F10）：`renderPlan` 的格式与拒绝（行长、每行恰一处加粗、换词）；申报文字的五种变体与第三次修复的正文逐字钉住；对这些文字与 D1 的问话跑 `plainWordsIn`，结果为空；题目之后的第一段以「背景：」开头，问话是最后一段。

读人的回话（§5.5）：只认 `kind: 'user'` 且带 `rpcId` 的消息；`tail` 的规范化（行尾空白、`\r\n`、多余空行）；助手消息带工具调用块、`tail` 之后多一句、中间隔了一条别的回复都不放行；同意词与不同意词的整句匹配（「可以吗」「可以，顺便……」不算）；确认句与第 3 次关闭；2 小时过期；没有用户消息时的「再出示一次」只加一次。

宿主侧在假宿主 `tests/fake-rc3.ts` 上：`installRuleGate`（guard 行与图行两条安装路径的影子记录、跟进的跨行结算、一个放行只去掉自己那条拒绝）；`request_exception` 的检查顺序与各错误码；放行之后的说明带工具与参数、参数超过 4 KiB 时写进 `requests/<编号>.call.json`；备份失败、目标在批准与使用之间被新建或变大、并行的两次同签名调用；重启（同一项目目录上卸载再装一次 guard 行）：等人回话的申报与放行都没有了，之后的「可以」不放行；向流水追加伪造的 `RequestRecord` 与 `GrantRecord`、删掉一条 `GrantRecord` 都不改变结果；env 行的步 notice（推出改动文件、GLM 别名与 `DeferredToolCall`、等待上限、后台结果、连续失败）。检查器的子进程在 L2 里真实运行（夹具脚本在临时目录里），超时用一个睡 120 秒的夹具。

### 14.3 L4

见 §13.4。

### 14.4 标定

K1 量「拦截后下一步走对」在新文案前后的变化与完成率（GLM-5.3 与 GLM-5.3-Flash 各 3 次）。仓库里的标定集只是回归与消融的守门（人 2026-10-29 的定位，M7 设计 §0 的 m7-10 一条）；文案好不好，最终看自举与真实项目里的跟进记录。

## 15. 不做的事

- 装工具走同步卡（`docs/ORCHESTRATION.md` §7.3）的探测：§6.4 没有列它；环境分支用上之后，作为一条新的影子规则另提（全局安装命令的列表要按命令位置读，等 M7 的 `commandsAt`）。
- 惯犯升级（§6.6）。
- 格式类问题的自动修复（§7.5「格式类问题自动修」）：harness 改模型刚写的文件，模型下一次 `edit` 的 `old_string` 可能对不上；本仓库也不用格式化工具。项目有格式化工具节点之后另做。
- 规范阶梯的提议、周报、四答晨报（M7）；规则板 R1–R7（同一里程碑，另一份设计）。
- 规则模式的运行时开关、按项目覆盖模式：「可关」只到行一级（`docs/CHARTER.md` §7.1 条款 1）。
- `file-tools-only` 的申报：它管习惯，不设例外（§5.2）。
- 读凭证的拦截：`credential-read` 只记录（§4.2）；凭证迁到系统钥匙串属 `docs/DESIGN.md` §4.1 的规划。
- 把回放做成产品功能：它是本仓库的命令行，读的是本机 DSH 的会话日志；别的项目的标注界面随 M7 的运维会话与 M8 的面板。
- 问答卡与面板上的批准：`d-chat-not-cards`、`d-ui-look-not-operate`。面板「需要你」要不要列出等人回话的申报由面板设计定（申报不上图，面板今天看不到它；要列的话 M4 可以把等人回话的申报经图行服务或行健康露出来，那时另提）。
- ACP、SDK 会话里的批准：那里送来的人的消息没有 `rpcId`（H19），申报只能等 DSH 客户端里的回话；这类会话的 agent 收到 `not-client` 的说明。
- git 快照（M3 附录 0.3 §2.5）与子 agent 的 git（M7 的派发）：M4 只让它们共用跟进与流水的分类。
- 指标流水（`metrics`）的转写：M4 的记录先写违规流水，指标设计定稿时由它决定怎样转写。

## 16. 由 agent 定、人可推翻的事项

| 事项 | 采用 | 没选的做法与理由 |
| --- | --- | --- |
| 规则模式放在哪 | 代码里的 `mode` 字段，规范节点的标签由契约测试核对（§3.1） | 放规范节点正文：LLM 能改正文；放行配置：按 profile、不经评审 |
| 新规则先影子 | 四条都先影子，`suppression-reason` 按 §3.5 转生效后就是 §7.6 的「直接拦下」 | 直接拦截：违反宪章 §6；`question-25` 只覆盖 M3 的两条 |
| `credential-read` 不转生效 | 只记录 | 转生效：排查登录时误伤，回放里多数是开发时的正常读写 |
| 标注由谁做 | agent 标，带人原话的算人的；人只在转生效那一问里看数字与至多 5 条样本 | 人逐条标：每周几十条，违背减负 |
| 判据数字 | 20 条、14 天、0 误伤，放在 `PROMOTION` | 按比例（如 95%）：样本少时比例不稳 |
| 回放读哪些字段 | 只读路径与命令（D2 人的原话的边界），`suppression-reason` 在回放里不判 | 也读写入内容、多判一条规则：超出人同意的范围 |
| 草稿区 | `<工作区>/.llm/scratch/` | 根目录 `scratch/`：要改每个项目的 `.gitignore`；系统临时目录：工作区圈禁拒绝写，汇合门禁也看不见 |
| `.git/info/exclude` | 项目没忽略 `.llm/` 时追加一行注释与一行 `/.llm/` | 改 `.gitignore`：会进项目的提交 |
| 抓取脚本 | 删除，快照与重新抓取的办法留下 | 转正到 `scripts/`：本仓库不用 Python，网页工具现成 |
| 检查行放在哪 | env 工具节点的验收条件 | 放 `norm-merge-gate`：触发时刻与输入不同；放行配置：按 profile |
| 配置与基线文件的路径放在哪 | 工具节点验收条件里的 `config` 行（§6.1） | 正文的 `配置：` 标签（0.2）：正文模型能改，转生效之后删一条路径就能不经申报改那个配置（评审第 2 轮 N23） |
| 检查的通道 | `agent/pre-step`，每步等一次，至多 20 秒 | `tools/post-execute`：同一步的写入逐个排队 |
| 改动行 | 相对 HEAD 的 `git diff -U0` | 记住调用前的内容：要跨行共享内存 |
| 回传不出声的条件 | 全 0 且上一条也全 0 时不注入 | 每次都报：多占上下文 |
| 跟进只结算模型发出的调用、跳过同一步 | 按 `tool/call` 事件的步号（§3.3） | 结算任何下一次根调用：插件发起的调用与同一步的并行调用会被算成模型的反应 |
| 申报的工具 | 新工具 `request_exception`，返回 harness 写好的申报文字 | 给 `decision_card` 加参数、用 `ask_user_question`：都是卡片，`d-chat-not-cards` 不用卡片；让 agent 自己写申报的话：路径与事实要由 harness 核对后写 |
| 人怎样批 | 对话里紧跟申报文字的下一句话，来自 DSH 客户端，整句在同意词表里 | 卡片（取消）；agent 转述人的话（受益的一方，模型能写）；面板（只看不操作）；按意思判断（模型判断，等于模型自己批） |
| 人回得含糊 | 不放行，harness 给一句确认句，agent 原样放在回复末尾再问；第 3 次关闭 | 按 agent 的复述放行：复述是模型写的 |
| 人回话之前 agent 又说了别的 | 不放行（`not-shown`），申报留着，agent 回合末原样再出示一次；只是被别的事叫醒时，harness 同样提醒 agent 回合末再出示一次 | 允许中间有别的回复：人的「可以」可能是在回答别的事；作废申报：人插一句话就要从头来，而留着并不多放行 |
| 申报文字里推荐一行写「放行」 | 是：文字是 agent 的申请，方案就是写这一次；不放行靠「不回、回别的都不放」 | 推荐「不放行」（0.2）：那是为卡片上的预选准备的，聊天里没有预选 |
| 「附」 | 四行之后、问话之前，列文件的事实、agent 的三句原话与内容预览 | 不放：人看不到写的是什么就批；放进四行里：一行写不短 |
| `request_exception` 三句话的上限 | 80、60、60 个字符 | 0.2 的 1000、500、500：原样进给人看的文字，太长人读不完 |
| 申报不上图 | 只在内存与违规流水 | 上图：授权不需要它，多一种失败，面板只看不操作 |
| 授权的来源 | 内存里客户端送来的人的话；违规流水只留痕 | 流水作授权：它在工作区里，模型能写能删（评审第 1 轮 F1）；图作授权（0.2）：要面板批准，`d-ui-look-not-operate` 之后没有这条路 |
| 进程重启 | 申报与放行都丢失，重新申报 | 把放行存在用户级目录：多一个要守的文件，而重启本来就少见；人再回一次的代价小 |
| 代码规则怎样安装 | 唯一的 `installRuleGate`，`evaluate` 删除 | 保留 `evaluate`、各行自己写影子：影子与跟进要写好几份，漏一份就静默；`evaluate` 收到影子规则就抛错：只挡住误用，各行仍要自己写记录 |
| 新记录放在哪 | 同一份违规流水，加 `classifyRecord` | 另开 `audit/guard-events.jsonl`：读者少改一处过滤，但晨报要读两份文件，规则板与 M7 也要知道第二份；分类函数反正要有（规则板的 `mode: 'enforce'` 今天两边都不收） |
| 检查日志的目录 | `<项目目录>/env-checks/` | `<项目目录>/checks/`：`scripts/check-lint.mjs` 跑 jscpd 时整个删掉 `.llm/checks` |
| 压制标记表的位置 | `src/shared/suppression-markers.ts` | 放在 `src/guard/suppression.ts`：E4 就要等 G3 |
| 「第三次修复」的数法 | 第 n 次重开即第 n 次修复开始，第 3 次重开时提问 | 数完成次数：与「重开」这个可观察的事件对不上 |
| 第三次修复怎样问 | 图上一张人定的待决，正文是四行的方案，主 Agent 在对话里问、带原话记结论；今天引擎记结论要的选项键只在 `reopenQuestion` 里生成 | 等引擎去掉选项字段再做 R1：R1 被一件还没有节点的事卡住；不带选项：今天拍不了板 |
| 「第三次修复」待决的认法 | `propose` 历史的 `reason`「第三次修复：<节点 id>」 | 正文第一行或最后一行的标签（0.2）：正文模型能改，人还要读它 |
| `request_exception` 在 GLM 上 | 延迟，不常驻 | 常驻：工具面多一项，ZCode 没有对应物的工具按规则延迟 |
| 放行时限 | 人回话后 30 分钟，一次；申报等回话至多 2 小时 | 不设时限：拍板很久之后才用就是残留授权 |
| 覆盖前备份 | 使用时目标存在且 10 MiB 以内就备份，不看申报文字里写了什么；目标与文字里的不同就拒绝并作废；备份失败就拒绝这次调用 | 只按文字里的承诺备份：批准与使用之间目标变了时会无备份覆盖 |
| 第三次修复之前 | 只在 LLM 重开时提问，不拦截 | 人的重开也问：问人他自己的决定；拦截：要另一条门禁与影子期 |
| 规则板与 git 快照门的跟进 | 请它们第一件事调 `observe`、拒绝时调 `noteDenial` | 只覆盖经 `installRuleGate` 的拦截：规则板拦下的调用量不到，验收的说法也要缩小（评审第 2 轮 N26） |
| 命名 | 行 `glm-hourness/env`（补丁里 `dsh-hourness/env`）、目录 `src/env/`、工具 `request_exception`、规则 `credential-read`、`suppression-reason`、`checker-config`、`scratch-only`、notice 来源 `hourness-checks`、`hourness-env`、`hourness-request`、命令行 `npm run -s guard` | — |

## 17. 待人定的事项

按 `d-chat-not-cards`，问人只给一个方案：题目一段，背景、推荐、疑问、不做四行各自成段、每行一件事、把重点几个字加粗，问话放在最后。下面的文字由编排方在对话里原样问，人的原话记到图上（§18 第 1 条）。平常它与一页放行稿合成一问（`onepage.md` 末尾的四行就是合并之后的问法）：人回一句，放行与 D1 一起定。人只想单独谈 D1 时用下面这一段。

### D1 M4 七件事怎样算做完

拦截规则补齐这批活，怎样算做完先照草稿吗

背景：这批活补七样东西，**怎样算做完要你定**

推荐：**先照草稿写进项目图**，不合适再提给你

疑问：草稿里**改工作区外的文件要你回「可以」**，最可能不合你意

不做：**逐条读完再定**，共 27 条约 3,300 字

先照草稿写进去，可以吗？

给编排方：七件是 §1.2 表里的七行，草稿是「建议验收」一列。人要改哪条，按他的原话只改那一条，其余照草稿。改「怎样算做完」属于必须问人的第 1 类（`docs/ORCHESTRATION.md` §2.9.1）。人对「疑问」一行说不行时，那是改 M4 的设计方向（`d-design-onepage` 的第二档），回到本设计的循环。

### D2 已定：新规则会不会误拦，样本从哪来

人 2026-10-30 回「不介意」（选 B）：用今天的规则重看本机 DSH 历史会话里的工具调用，只读命令文本与路径，不读对话内容；结果留在 `.llm/`，只有脱敏的个别样本进 `tests/guard-corpus/`。落在 §3.6、§3.7、§11。0.2 里这一问的写法缺前因后果、用了内部的词（评审第 2 轮 F10）；它已经答过，不再重问。

## 18. 交给编排者记图的事项

本设计不写 `docs/graph/`。这一稿写完时要记的一条在同目录的 `graph-ops-v03.json`。人放行之后由编排者记到图上：

1. D1：编排方在对话里按 §17 的文字问（与 `onepage.md` 的放行一起）；人回答后在 `m4` 下记一张人定的待决，正文是 §17 的文字，结论带人的原话。D2 的回答已批注在 `m4` 上（2026-10-29T17:33Z）。
2. D1 同意时，在 `m4` 下建 `m4-shadow`、`m4-rules`、`m4-checks`、`m4-env`、`m4-suppressions`、`m4-cleanup`，验收按 §1.2；`m4-request-card` 补上验收（带人的原话），正文里「经决策卡申报」「复用 M3 的 `decision_card` 与以人的身份写图」改为「在对话里申报，人的下一句话决定」，对 `m3-5` 的依赖改为对提供 `dispatchRoot` 的 M3 第 4 步的任务。K1 作为 `m4-shadow` 下的子任务，加一条 `depends` 指向 `ablation`。
3. 规范节点分两批提议（挂 `orch`；每条 guard 框架的规则一个，正文带 `级别：门禁`、`模式：生效 | 影子`、`规则：<id>`）：G1 合入之前提 `workspace-containment`、`file-tools-only`、`graph-files-only`（生效）；G3 合入之前提 `credential-read`（影子，写「只记录，不转生效」）、`suppression-reason`、`checker-config`、`scratch-only`（影子）。§3.8 的契约测试读它们，分两批是为了每一步合入时测试都成立（评审第 2 轮 N21）。
4. E2 之前：在 `hourness` 下提议特性 `env`，与 ESLint、TypeScript 两个工具节点（检查行按 §6.1；ESLint 节点另带 `config eslint.config.js, eslint-suppressions.json`，TypeScript 节点带 `config tsconfig.json`），另把 knip、jscpd、gitleaks 记成不带检查行的工具节点；由人批准。
5. 批注（§2.3、§13.3）：
   - `rules`：代码规则目录改为导入 `src/guard/catalog.ts`；工具调用门的监听器第一件事调 `observe`、拒绝时调 `noteDenial`（规则 id `rules:<id>`）；读违规流水用 `classifyRecord`；规则页「人标过的误判数」取 `ruleStats` 对 `labels.jsonl` 的结果，规则板不另存标注，`hits.json` 只是命中计数。
   - `m7`：「影子转生效」引用 `PROMOTION` 并采用 M4 的含义（带标注的会拦样本至少 20 条含回放、实时影子至少 14 天、误伤 0；不是「近 14 天影子记录不少于 20 条」）；转生效那一问按 `d-chat-not-cards` 在对话里问，改模式的提交按 `norm-review-floor` 全审；写入规则经 `installRuleGate` 安装；`ladderProposals` 读流水用 `classifyRecord`；汇合门禁加「草稿区为空」一步；对 `.worktrees/` 写 `.git/info/exclude` 时注释单独一行。
   - `m3`：`installMainAgentRules` 经 `installRuleGate` 安装；git 快照门第一件事调 `observe`、存不了快照而拒绝时调 `noteDenial`（规则 id `git-snapshot`），拒绝记录不带 `mode`；`src/graph/plain-question.ts` 若 G4 先合入则由 G4 照附录 0.3 §2.8 建；撤回 0.2 请 M3 把卡片函数放进 `src/graph/human-card.ts` 的那条（M4 不再用卡片）。
   - `m8-plain-language`（面板设计）：申报不上图，「需要你」看不到等人回话的申报，要不要列由面板设计定；第三次修复的待决暂时还带记结论用的选项字段，面板按「只看」显示时不必把它们画成选项表。
6. `m4` 的状态与本设计的评审结果按评审循环的规矩批注。

## 19. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-29 | 第一稿 |
| 0.2 | 2026-10-29 | 按设计评审第 1 轮修订（8 条挡路、13 条非阻断全部处理，见 §19.1）；依据改为 main `eb614ab`，两种待决直接用 `e22282f` 的表格卡字段；另修一处自查发现的问题：检查日志从 `<项目目录>/checks/` 移到 `env-checks/`，因为 `scripts/check-lint.mjs` 跑 jscpd 后会整个删掉 `.llm/checks` |
| 0.3 | 2026-10-30 | 按设计评审第 2 轮修订（2 条挡路、13 条非阻断，见 §19.2）；并入评审之后人定的事（§19.2 第二张表），其中 `d-chat-not-cards` 让申报通道改为对话里人的下一句话、第三次修复与 D1 改为四行的方案；D2 已答（B）；依据改为 main `8599304`；另写一页放行稿 `onepage.md` |

### 19.1 对第 1 轮评审的处理

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F1 HIGH 放行可以由模型写进违规流水 | 采纳。放行只有两个来源：`request_exception` 收到人的回答后写进内存的放行；图上 `harness` 提议、最近一次拍板为 `human` 选 `A`、没有「已用」「作废」批注的申报待决。匹配只读 `propose` 历史条目的 `reason`（编号、签名、根、卡上的事实），不读模型能改的正文。「已用」以 `harness` 批注写在图上，在 `next()` 之前写。违规流水只留痕；`request_exception` 只认内存里的编号，删去 0.1 从流水查编号与查 `RequestRecord`、`GrantRecord` 的两句。没有图时重启丢掉放行。L2 加伪造与删除流水记录后模拟重启的两例；§11 写明 `node -e` 改节点文件的剩余风险 | §0、§1.2 `m4-request-card` 第 3、5、6 条、§5.1、§5.3 第 3、4、6 条与回答表、§5.5、§5.6、§5.8、§11 两张表、§12、§13.1 G4、§14.1、§14.2、§16 |
| F2 HIGH D3 建立在客户端不会有的行为上 | 采纳。实读 client.js:683–686、788–790 与 :924–931：推荐项排最后时初稿没有选中项，不选就提交只报「未完成」。D3 删去，§16 记为 agent 定：`A 放行这一次`、`B 不放行（推荐）`、不预选；写明「不细看按回车就是不放行」在 `d-recommend-last` 下做不到。§5.4 不再引 M3 §3.5.1。L4 第 1 项改为核对没有选中项、「推荐」在「不放行」上、不选就提交的反应 | §0、§2.1、§5.4、§9 H9a、§11、§13.4 第 1 项、§14.1 `guard-request`、§16、§17、§18 第 1 条 |
| F3 MEDIUM exclude 那一行不忽略任何东西 | 采纳。注释单独一行；已有恰为 `/.llm/` 的行就不追加；追加后复核 `git check-ignore`，仍不为 0 时行健康降级并写原因；探针核对退出码；L2 用真实临时仓库，含 `!/.llm/` 反向模式 | §0、§1.2 `m4-env` 第 2 条、§2.2（`src/env/ignore.ts`）、§7.3、§11、§13.1 E2、§14.1 `env-notice` |
| F4 MEDIUM 新记录让晨报算错违规 | 采纳分类函数（不另开文件，理由见 §16）：`classifyRecord` 在 `src/guard/records.ts`，晨报、`ruleStats`、命令行、M7 阶梯、规则页都用它；G1 改晨报过滤并加三例 L2 | §0、§1.2 `m4-shadow` 第 2 条、§2.2、§2.3、§3.2、§3.10、§5.8、§11、§12、§13.1 G1、§18 第 5 条 |
| F5 MEDIUM 外层拒绝的调用 guard 看不见 | 采纳。`observe(agent, call, callId)` 由 `installRuleGate` 的每个监听器第一步调用，按 `callId` 只结算一次；规则板的监听器也调它；模块级共用的前提写明并由新 L3 场景 `guard-followup` 核对；L2 加连续两次图写入被拒留下 `repeat` | §0、§1.2 `m4-shadow` 第 2 条、§2.2、§2.3、§3.3、§11、§12、§13.1 G2、§13.3、§14.1 |
| F6 MEDIUM 别的行里的影子规则不留记录 | 采纳。新建 `installRuleGate`（`src/guard/gate.ts`），guard 行与图行在 G1 改经它安装，M3、M7 的规则也经它；`evaluate` 删除；契约测试按安装标记核对，并核对图行安装路径上的影子规则留下记录 | §0、§1.2 `m4-shadow` 第 6 条、§2.2、§2.3、§3.1、§3.2、§3.8、§12、§13.1 G1、§13.3、§16、§18 第 5 条 |
| F7 MEDIUM 批准与使用之间目标变了 | 采纳。放行存下卡上的事实，使用时重新 `stat`：不同就拒绝、作废（图上「作废：」批注、`GrantVoidRecord`）；相同且目标存在、不大于 10 MiB 时一律先备份；`stat` 出错按「变了」处理；L2 加批准后新建目标一例 | §1.2 `m4-request-card` 第 4 条、§2.1、§5.4、§5.5、§5.8、§11、§12、§13.1 G4、§14.2、§16 |
| F8 MEDIUM POSIX 下文件名可以注入命令 | 采纳。`quoteForShell` 按平台：POSIX 单引号加 `'\''` 转义，Windows 保持双引号与排除表；日志第一行写展开后的命令；L2 两个平台都测 | §1.2 `m4-checks` 第 2 条、§2.1、§6.1、§6.3、§11、§14.2 |
| N1 NIT 推出改动文件时先换算别名 | 采纳，另加 `DeferredToolCall` 的拆包；`env-checks` 探针本来就跑在 `probe-full` 上，L4 第 4 项在 GLM 上用 `Edit` | §6.2、§14.2 |
| N2 NIT ESLint 的过期压制 | 采纳，并实读 ESLint 10.13 `cli.js`:497–505：不带参数时退出码 2。检查行加 `--pass-on-unpruned-suppressions` | §6.1、§9 H18 |
| N3 NIT `src/guard/` 导入 `src/design/` | 采纳第一种改法：放在 `src/graph/human-card.ts`，两边导入；没选注入的理由见 §16 | §0、§2.2、§2.3、§13 开工条件、§13.1 G4、§13.3、§16、§18 第 5 条 |
| N4 NIT 拒绝文案的修复可以先落地 | 采纳。G1 去掉 `APPLICATION_PROTOCOL`，圈禁用「没有申报通道」那一句，file-tools-only 用新文案；G4 再加编号与前两种情形 | §0、§2.2、§5.2、§13.1 G1、§14.1 |
| N5 NIT `PROMOTION` 与 M7 只是数字相同 | 采纳。§3.5 写明两者的含义差别与 M7 改用 M4 的含义及理由；§18 第 5 条给 `m7` 的批注写明 | §2.3、§3.5、§18 第 5 条 |
| N6 NIT 规则板页面的误判数从哪来 | 采纳。写明取 `ruleStats` 对 `labels.jsonl` 的结果，`hits.json` 只是命中计数 | §2.3、§18 第 5 条 |
| N7 NIT E4 依赖 G3 的标记表 | 采纳第二种改法：标记表放进 `src/shared/suppression-markers.ts`，谁先开工谁建 | §0、§2.2、§13.1 G3、E4、§13.2、§13.3、§16 |
| N8 NIT 主 Agent 拿到 `approved` 之后写不了 | 采纳，`approved` 的说明加派子 agent 一句 | §5.3 输出 |
| N9 NIT 拒绝文案写出字段名 | 采纳。第一种情形的例外写出四个字段的 JSON；另实读 `src/toolsearch/index.ts`:155–166，`DeferredToolCall` 不要求先检索，评审列为未核实的这一项随之核实 | §1.2 `m4-request-card` 第 1 条、§5.2、§5.3、§9 H11 |
| N10 NIT 「第三次修复」的计数前后不一 | 采纳。统一为「第 n 次重开即第 n 次修复开始」，第 3 次重开时出卡；标题、「取决于」、代价、`notice`、验收第 2 条、R1 与文档改动按这一数法写 | §0、§1.2 `m4-rules` 第 2 条、§4、§4.6、§13.1 R1、§16 |
| N11 NIT 一个放行会盖掉别的生效拒绝 | 采纳。`Judgement.denies` 保留全部生效拒绝，放行只去掉自己那条规则的；每条拒绝各写一条记录 | §3.1、§5.5、§14.2 |
| N12 NIT 回放要拆开 `DeferredToolCall` | 采纳，`summary.json` 记拆开与拆不开的条数 | §3.6、§14.2 |
| N13 NIT 删除前把地址留下来 | 采纳。§8 逐字列出三个脚本里的地址、链接模式与 9 个补充页路径（本次实读），C1 先写文档再删；C1 动手时再数一次，与这里不一致以脚本为准 | §1.2 `m4-cleanup` 第 2 条、§8、§11、§13.1 C1 |

评审「没有复现」的本机实测数字（§3.6、D2 的 719 个日志等）与 §6.1 的耗时没有改动：它们是设计期一次只读试算的结果，D2 的卡上照样引用，实现时回放的 `summary.json` 会给出新的数。main 从 `6a6895e` 到 `eb614ab` 的变化已按评审的提醒重核：`src/guard/` 没有变化，行号照旧；`src/graph/` 的变化是表格卡字段，已用于 §4.6 与 §5.6。

### 19.2 对第 2 轮评审与之后人定事项的处理

第 2 轮的发现：

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F9 MEDIUM GLM 上延迟工具的包装调用替模型结算了跟进 | 采纳评审的四条改法。`observe` 先经 `unwrapDeferredCall`（`src/shared/deferred-call.ts`）拆开 `DeferredToolCall {name, input}`，按拆开之后的工具与参数结算，`<callId>` 与 `<callId>:deferred` 一起记为已结算；`noteDenial` 记被拒的内层调用，参数摘要按拆开之后的算，原样重试的包装记 `repeat`。L2 加评审给的两例；`guard-request` 场景的 GLM 一遍核对 `right-path`。另：包装的形状对 ZCode 3.17.1 重核过（第 132 行） | §0、§1.2 `m4-shadow` 第 2 条、§2.2、§3.1 第 3 步、§3.3、§9 H11、§13.1 G2、§14.1、§14.2 |
| F10 MEDIUM 给人的问题没有前因后果，用了换词表里的词 | 采纳，并按评审之后的人定写法（`d-chat-not-cards` 节点最后一条批注：题目一段，背景、推荐、疑问、不做四行各自成段，每行把重点几个字加粗，问话最后）改写全部给人看的文字，不再用评审给的「两三句背景段加表格」：D1 写成四行的方案（§17），不说「验收」、不引节号，代价写成「七件共 27 条，约 3,300 字」；D2 已答，只留人话的记录；申报文字与第三次修复的正文都由 `renderPlan` 写，背景一行紧跟题目；「派发周期」改为「这件活晚一轮才接着做」；「停下查根因」的认法标签不进正文，改认 `propose` 历史的 `reason`（模型改不了，人也不用读，比评审建议的「挪到正文末尾」更彻底）；L2 用 `plainWordsIn` 钉住这些文字不含换词表里的词，并核对题目之后第一段以「背景：」开头。评审要背景交代的三样（关于系统哪一块、从哪来、为什么由人定）分在题目、背景与疑问三处，因为人定的格式里背景只有一行 | §0、§1.2 `m4-rules` 第 2 条与 `m4-request-card` 第 2 条、§4.6、§5.4、§13.1 R1、§14.2、§17 |
| N14 NIT `RequestRecord` 的字段没有定义 | 采纳。§3.2 写出 `RequestRecord` 与另外三种新记录的完整字段，都带 `kind`；`outcome` 按聊天的流程重定为 `asked`、`approved`、`declined`、`unclear`、`not-shown`、`not-client`、`closed`、`expired`；0.2 的「排队」没有了（面板不批），晨报改写「没答 q」，数 `expired` 与 `closed` | §3.2、§5.5、§5.8 |
| N15 NIT 「没有下一次」只在下一个 `turn/start` 结算 | 采纳。`turn/end`（agent-loop:1029）与 `session/disposed`（session:1929–1933）时结算为 `none`；L2 加两例 | §3.3、§9 H6、§14.2 |
| N16 NIT 同一步里并行的调用结算了模型没读到的拒绝 | 采纳第一种改法，换了取步号的办法：记录器从 `tool/call` 会话事件取每个调用的 `{turn, step}`（agent loop 在 `tools/pre-execute` 之前追加它，`session/event` 同步通知），与被拒的调用同一步的不结算；没有 `tool/call` 事件的调用（插件发起的）也不结算。不用 `agent/pre-step` 记步号：它是每个 agent 的钩子，记录器是模块级的；也不用「同一条助手消息」：`tools/pre-execute` 里看不到消息 | §3.3、§9 H6、§16、§14.2 |
| N17 NIT 面板上批准时人读到的文字模型能改 | 不再适用：`d-ui-look-not-operate` 之后不在面板上批，申报也不上图。人批的就是他读到的，由「紧跟申报文字」的核对保证（§5.5 第 3 条） | §5、§12 |
| N18 NIT 同一回合跑过图工具时兜底看不见节点文件的改动 | 采纳，按评审的说法改写：图已不作授权来源，这一句只剩第三次修复的拍板；写明同一回合跑过图工具时兜底看不见，发现途径是 `git diff` 与面板上人没拍过的拍板，与 shell 直接写工作区外是同一个已知边界 | §11 不可逆表 |
| N19 NIT 申报卡的版面与 M3 的决策卡不一致 | 不再适用：两张卡都取消了。改为：harness 写给人的方案文字只经 `renderPlan` 一处，M3、M7 以后自己写的也导入它；第三次修复为了今天的引擎记结论而带的选项字段只在 `reopenQuestion` 一处生成 | §2.3、§4.6、§5.4、§12 |
| N20 NIT 晨报的先后前后矛盾 | 采纳。§13.3 晨报一行改为「先合入的先改，后到的在它之上重做」，写明四处 | §13.3 |
| N21 NIT G1 的契约测试会因提前提议的规范节点而失败 | 采纳第一种改法：规范节点分两批，三条已有规则在 G1 之前，四条影子规则在 G3 之前 | §3.8、§18 第 3 条 |
| N22 NIT guard 线的文件清单漏了两个文件 | 采纳，随 G4 的改动调整：G4 不再碰 `src/graph/human-card.ts`；`tests/fake-rc3.ts` 列进共用文件，§13.3 写与 M3 的先后 | §13.1 G2、G4，§13.2，§13.3 |
| N23 NIT `checker-config` 的额外路径来自模型能改的正文标签 | 采纳第一种改法：配置与基线文件写在工具节点验收条件的 `config` 行里，批准之后只有人能改 | §4.1、§4.4、§6.1、§7.1、§10、§16、§18 第 4 条 |
| N24 NIT 种子语料里的 4 条旧记录取不出调用 | 采纳。这 4 条与 `docs/DEVELOPMENT.md` §7 的三次误判一起按 `source: 'incident'` 手写，参数从记录的 `correction` 与事故说明里抄出 | §3.7、§13.1 G2 |
| N25 NIT 替别人申报之后重调的一方要逐字重做参数 | 采纳。放行之后的说明带被拒那次调用的工具与参数；超过 4 KiB 时写进 `<项目目录>/requests/<编号>.call.json` 给路径 | §5.5、§11、§14.2 |
| N26 NIT 验收「不论哪一行拦的」包含规则板，机制不覆盖 | 采纳第二种改法：请规则板的工具调用门（与 M3 的 git 快照门）第一件事调 `observe`、拒绝时调 `noteDenial`；它们没加之前，验收只覆盖经 `installRuleGate` 的拦截，验收第 2 条照这个写 | §1.2 `m4-shadow` 第 2 条、§2.3、§3.3、§13.3、§18 第 5 条 |

评审之后人定的事：

| 人定的事 | 对 M4 的影响 | 改了哪里 |
| --- | --- | --- |
| D2 选 B（人 2026-10-30「不介意」） | 回放照做，边界照人同意的写：只读命令文本与路径，不读对话正文与写入的内容；结果在 `.llm/`；只有脱敏的单条样本进仓库。因此 `suppression-reason` 在回放里不判，凭证提及只数 shell 与读工具的路径 | §1.1、§3.6、§3.9、§11、§12、§16、§17 |
| `d-chat-not-cards`（不出问答卡、不列选项；四行的方案） | 申报改为：harness 写四行的申报文字，agent 原样放在回复末尾，人的下一句话决定；只认 DSH 客户端送来的、紧跟申报文字的整句同意；含糊时给确认句。第三次修复改为四行正文的人定待决，由主 Agent 在对话里问。D1 写成四行。新函数 `renderPlan` 是给人看的方案文字唯一的格式。M4 不再导入 M3 的卡片与以人的身份写图的函数，G4 不再等 M3 第 6 步 | §0、§1.2、§2.2、§2.3、§4.6、§5、§9、§10、§11、§12、§13、§14、§16、§17 |
| `d-ui-look-not-operate`（面板只看不操作） | 去掉面板批准申报与图上的申报待决（0.2 的 §5.6）；放行只在内存 | §5、§11、§15 |
| `d-plain-questions` 与「问题带前因后果」 | 给人看的文字不用换词表里的词，`renderPlan` 自带检查，L2 钉住 | §4.6、§5.4、§14.2 |
| `d-main-agent-shell` 定稿（git 与命令行交给主 Agent，只拦写文件；会丢工作的 git 命令先存快照） | 快照由 M3 第 4 步做（M3 附录 0.3 §2.5，`src/guard/git-snapshot.ts`），M4 不另做一份；M4 的规则不判 git，file-tools-only 的例外照旧写明 git 放行；快照门与 M4 共用跟进记录器，它的拒绝记录按拒绝分类 | §2.3、§3.3、§5.2、§11、§13.3、§15、§18 第 5 条 |
| `d-one-main-agent` | 子 agent 被拒后把编号交回给主 Agent，由主 Agent 在它与人的对话里申报；主 Agent 被巡检、晨报叫醒时，harness 提醒它回合末再出示一次申报文字 | §5.5、§5.6 |
| `d-main-agent-models` | 审查与子 agent 的模型由主 Agent 选，M4 不写评审用哪档模型 | §13 |
| `d-auto-drive` | 放行之后主 Agent 自己推进 M4；§13 写明 M4 里只有 D1、转生效、第三次修复三处停下问人 | §13 |
| `d-zcode-3171` | 重核两样 ZCode 事实：别名表的七个工具名与 `DeferredToolCall` 的参数形状，3.17.1 与 3.16.3 相同 | 文件头、§3.3、§3.6、§9 H11 |
| `norm-review-floor` | G1–G4 与 C1 全审；之后改规则模式、可申报名单、同意词表的提交也全审 | §3.5、§5.3、§5.5、§13、§18 第 5 条 |
| `d-design-onepage` | 写一页放行稿 `onepage.md`；开发中的问题分三档、攒着问、一次至多三件 | §13、§17、`onepage.md` |

另有两处自查改动：依据 main `8599304` 上 `6134c83` 的登记方式，E1 加 `./env` 导出与 `locale/env/` 的标题；`request_exception` 三句话的上限从 1000、500、500 收到 80、60、60，因为它们原样进给人看的文字。
