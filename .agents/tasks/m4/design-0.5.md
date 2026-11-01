# M4 设计：guard 补齐与环境

版本：0.5（2026-10-30），第五稿。0.4 经设计评审第 4 轮（`design-review.md` 第 4 轮、`design-review.json`：CHANGES_REQUESTED，挡路 4 条 F17–F20，都是 MEDIUM；非阻断 8 条 N35–N42；第 3 轮的 14 条关 13 条，N33 部分关）。各轮挡路 8、2、6、4。0.4 是人准的最后一稿，评审后按约定停下；人 2026-10-30 回「行」，同意再给一稿并进 `d-alignment-rounds` 的对齐轮（`m4` 节点的批注），排在循环板定稿之后，这一稿带一轮独立评审，仍有挡路就停下问人。本稿逐条处理 F17–F20 与 N35–N42，并照对齐轮的依据改：循环板 0.6、规则板 0.10、M3 附录 0.5、M7 0.6 与 `design-context.md` 的「Check entries seam」。逐条的处理见 §19.4（第 1–3 轮的处理见 §19.1–§19.3，原样保留，其中说到的节号是当时版本的）。0.4 原文留在 `design-0.4.md`，0.3 原文与它的放行稿留在 `design-0.3.md`、`onepage-0.3.md`（`.agents/` 不进 git）。给人看的一页放行稿是同目录的 `onepage.md`，仍是 0.3 的，评审通过之后另写。0.5 改的几处：
- F17（挡路）：人加的检查是循环板上人的普通条目（动作 `check`，命令原文取自环境工具节点），由循环板的执行器跑，走与脚本同一条同意的路，同意时人亲眼看到命令原文；M4 不执行它们，只给三样东西：按工具节点读出一条检查命令的读法、填占位的纯函数、整理输出的纯函数。M4 自己执行的只有它自带的检查器（环境工具节点上人批准的检查行，在板上是插件交来的一项只能看的 `env.checks-after-edit`）。0.4 里「M4 请循环板改五处」的第 ①②④ 点撤回，第 ③ 点由循环板的 glob 接住，第 ⑤ 点由 `runCommand` 的 `queue` 接住（§6、§18）。
- F18（挡路）：harness 写给人的字串里嵌了图上的标题与调用的路径，这两样是数据，不是 harness 的常量。新的纯函数 `personTitle` 在标题带不合格的词时返回空，申报与第三次修复都有退路写法；`renderPlan` 只查 harness 自己写的那几段；`request_exception` 遇到任何抛错都不登记，返回 `unavailable`（§4.6、§5.3、§5.4）。
- F19（挡路）：`outsideDenial` 按项目判「工作区外」：worker 写进项目里但出了工作树的文件由 M7 的 `worker-scope` 纠偏，不发编号、不问人；只有出了项目才发编号（§5.9）。
- F20（挡路）：`request_exception` 的说明带一道示范（把新曲目追加到音乐播放器读的歌单文件，见 §5.3），领域与练习题无关，L2 让它过真实的参数检查与 `renderPlan`；方向清单自查补上 `d-agent-examples`、`d-memory-scope`、`d-script-timeout`（§1.5）。
- 规则板 0.10 对 M4 的三项请求（`m4` 节点 2026-10-30T10:13Z 的批注）：代码规则目录 `GUARD_RULES` 的内容与映射（§3.8）；违规流水的 `mode: 'record'` 与 `mode: 'late'` 由 `classifyRecord` 认（§3.2）；规则板的门调 `observe` 与 `noteDenial`（§3.3）。
- 对照已进 main 的东西：项目根与「让 `.llm/` 不进 git」用 `src/data/project-root.ts` 的 `projectOf`、`gitDirOf`、`ensureIgnored`，不再另建（§2.2、§2.4、§7.3）。

依据：main `9c346fb`。相对 0.4 的依据 `820eb78`，`src/` 里与 M4 相关的改动有：`src/data/project-root.ts` 已在（`projectOf(cwd, home?)`、`gitDirOf(root)`、`ensureIgnored(root, directory)`〔实读〕，规则板的最小一片建的，注释写明「仓库唯一的项目根模块」）；`src/graph/proposal.ts` 已在但只有 `renderProposal` 与 `ProposalText`（`PROPOSAL_LABELS`、`proposalLineRefusal`、`splitBold` 随 M3 的 `propose_to_human` 来）；`src/graph/plain-question.ts` 已在（`PLAIN_WORDS`、`plainWordsIn`：中文按子串、英文按整词不分大小写，英文词里有 `gate`、`acceptance`，所以含 `gate.ts` 的路径也会被报）；`src/guard/sections.ts` 接走 `DECLARATION_SECTION`，`src/guard/index.ts` 因此多一行导入（`rootsFor` 现在是 :92–96，`activeRules` :87–89）。`src/guard/rules.ts`、`src/memory/audit.ts`、`src/toolsearch/index.ts` 没有变化，0.4 引的行号照旧。`src/guard/followup.ts`、`gate.ts`、`records.ts`、`catalog.ts` 与整个 `src/env/` 仍不存在。ZCode 基线 3.17.1（`d-zcode-3171`）：本设计用到的 ZCode 事实有两样，都已对 `reference/zcode-3.17.1/zcode.cjs` 重核〔实读 2026-10-30〕：别名表 `ZCODE_ALIAS_NATIVES` 的七个工具（`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Read`、`TodoWrite`）各有一处 `name:"<名字>"` 的定义；`DeferredToolCall` 的参数在第 132 行是 `V.object({name: V.string().min(1), input: V.record(V.unknown())}).strict()`。

对齐轮读的相邻设计（都是已放行或已定稿的版本，本稿不改它们的任何文件，要它们改的事写成接缝请求，等 dogfood 之后处理，`d-freeze-until-dogfood`）：循环板 `.agents/tasks/schedules/design.md` 0.6（§2.3 的 `LoopCheckAction`、§4.4 的 `env.files-edited`、§5.3、§6.6 的 `runCommand`/`resolveProgram`、§7.1 的提议与同意、§17 给 M4 的四条）；规则板 `.agents/tasks/rules/design.md` 0.10（§10.1 的代码规则目录、§10.7 的「M4 设计 0.4」一节）；M3 `.agents/tasks/m3/design-addendum.md` 0.5（§3.4 `propose_to_human` 含「再给人看一次」、§3.5 的第 5a 步、§3.11 `MAIN_AGENT_RULES`）；M7 `.agents/tasks/m7/design.md` 0.6（§3.2.1 `worker-scope`、§12.1 `EXECUTE_RULES`、§18.2 对 M4 四件的安排）；plain-ui 0.7（§5.3 写法检查）；指标流水 0.2。`.agents/tasks/design-context.md` 读到末节「Rules thin slice: orchestrator rulings after its review」。图上 `m4` 节点 2026-10-30 的批注（循环板 0.5、0.6 给 M4 的接缝，规则板 0.10 的三件，M3 附录 0.5 与 M7 0.5 的回答）与 `d-alignment-rounds`、`d-agent-examples`、`d-memory-scope`、`d-script-timeout`、`d-main-agent-peak-exempt` 各节点已读。

证据写法：同 M3 设计。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行。〔实读〕读过源码；〔推断〕由源码推出、没有运行；〔未核实〕列进 §14 的 L3 或 L4 项；〔本机实测〕设计期间做过的只读试验：读本机 `~/.dsh/sessions/` 下的会话日志，只在内存里统计条数，没有输出命令原文，没有写任何文件；量了单文件 ESLint 与 `tsc` 的耗时。

范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/` 与 `~/.dsh`，不用桌面版。要记到图上的事写成同目录的 JSON 草稿，由编排者执行：本稿的是 `graph-ops-align.json`（0.4 的是 `graph-ops-v04.json`）。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

M4 在编排层包 `dsh-hourness` 里加一行 `glm-hourness/env`（源码 `src/env/`，默认禁用），其余改动落在 guard 行（`src/guard/`）与图工具（`src/graph/tools.ts`）。按 `docs/ROADMAP.md` M4 与节点 `m4`、`m4-request-card` 的条目：

- 影子模式机制（§3）。guard 框架里的每条规则带一个写在代码里的模式 `enforce` 或 `shadow`。所有用 guard 框架的行（guard 行、图行的 `graph-files-only`、循环板的 `loops:schedule-tools` 与 `loops:files-only`、指标流水的 `metrics-files-only`）都经同一个安装函数 `installRuleGate`（`src/guard/gate.ts`）挂监听器，影子判定、拒绝记录与跟进因此只有一份实现，`evaluate` 删除；M3 的八条（`MAIN_AGENT_RULES`）与 M7 的门（`EXECUTE_RULES`）各有自己的常量表，在它们改经 `installRuleGate` 安装之前照原样装（M3 附录 0.5、M7 0.6 都没有接这一条，留给它们的对齐，§3.1、§18）。影子规则从不拦截：判为违规时调用照常执行，违规流水里多一条 `mode: 'shadow', via: 'rule'` 的记录（规则、工具、命令或目标、来源 `scope` 与路由）。流水里各种记录由唯一的分类函数 `classifyRecord` 区分，晨报、统计、命令行与 M7 的阶梯都用它；它也认规则板写进同一份流水的 `mode: 'record'`（人选的只记录，不算违规）与 `mode: 'late'`（晚到的拦下，算违规、另列一行）（§3.2，规则板 0.10 §10.7）。每次经 `installRuleGate` 的拦截之后，同一 agent 下一步里模型发出的第一次调用记一条跟进记录（走对了正路、原样重试、别的、没有下一步），不论这次调用被哪一行拒绝；GLM 上经 `DeferredToolCall` 包装的调用先拆开再比，同一步里并行发出的调用不算，回合结束或会话卸载时还没有下一步的记为「没有」。量的是「拦截后下一步走对的比例」（`docs/ORCHESTRATION.md` §6.3，摘要 §4 第 7 条）。agent 用命令行给流水里的记录标「该拦 / 误伤 / 说不准」，带人原话的标注算人的；统计按规则与来源（GLM 方言接管的路由 / 其他路由）给出精确率与召回率（摘要 §4 第 8 条），这也就是 G3 在非 GLM 路由上的误伤率。历史会话回放（人已定，D2 选 B）：用今天的规则重判本机 DSH 会话日志里的工具调用，当天就有样本；只读工具名、命令文本、路径，与当时的模型、工作目录、调用有没有报错，不读对话正文与任何工具输出，「当时拦没拦」从项目自己的违规流水对出来（§3.6，F16）。标注过的样本脱敏后进入仓库里的回归语料，`npm test` 里有一道检查：生效的规则与语料的标注不一致就失败。影子转生效的判据（至少 20 条带标注的样本、至少 14 天实时影子、0 条误伤）由 M4 定为一个常量，M7 的周报阶梯引用它提议，人拍板，改代码里的模式。
- `docs/ORCHESTRATION.md` §6.4 的规划规矩（§4）。四条新规则都以影子模式上线：`credential-read`（读凭证文件，摘要 §4 第 9 条，按设计只记录）、`suppression-reason`（新增的压制注释没有理由或没挂节点）、`checker-config`（改检查器配置与基线文件）、`scratch-only`（在草稿区以外新建一次性脚本）。「同一处第三次修复要问人」落在图工具上：一次修复是一次重开（从完成改回进行中）之后的工作，LLM 第 3 次重开同一节点、第 3 次修复即将开始时，harness 在它下面提一张提议式的人定待决（M3 附录 §3.3：题目与背景、推荐、疑问、不做四行，不带任何选项字段），主 Agent 把它放进下一批交给人的事里（一次至多三件），只问一个方案「先停下查原因，可以吗？」，按人的原话记下（§4.6，F12）；题目里的节点标题带人没学过的词、编号或文件名时，题目改写成「这件活要修第 3 次了」，标题移进「附」（§4.6，F18）。这一项在循环板上列出（`graph.third-rework`，§6.8）。表里其余三行归 M3（主 Agent 不写文件、设计期只读）与 M7（子 agent 只写写入范围）。
- 申报通道（§5，任务 `m4-request-card`）。工作区圈禁拒绝时，纠偏带一个申报编号，正路写明调用新工具 `request_exception` 与它的四个字段。按 `d-chat-not-cards`，不出问答卡：工具返回一段由 harness 写的方案文字（题目，背景、推荐、疑问、不做四行，一句问话；四行的规则与 M3 的提议式待决是同一份 `src/graph/proposal.ts`；路径、文件在不在、多大、会不会备份都由 harness 核对后写进去，agent 的理由用原话标明），agent 把它原样放在回复的末尾，结束这一回合。题目里的路径与背景一行里的焦点标题是数据，不是 harness 的常量：焦点标题不合格就省去那半句，文字写不出时工具不登记、返回 `unavailable`（§5.4，F18）；工具说明带一道示范，L2 让它过真实的检查（§5.3，F20）。人的下一条消息就是回答：harness 在下一步之前读到它，只在三件事都成立时放行：这条消息来自客户端的输入（`source.kind: 'user'` 且带 `rpcId`）、它之前的最后一条助手消息以这段文字结尾、消息恰是「可以」一类的明确同意词。放行之后，同一派发链里恰好同一个调用（同一工具、同一组参数）在 30 分钟内放行一次，harness 在那一步给 agent 一条说明，带上被拒调用的工具与参数；其余回话都不放行。放行只存在内存里，只由 harness 读人的消息之后写入；违规流水只留痕，项目图不参与授权；进程重启或插件重新加载就丢掉，agent 重新申报。使用时重新核对目标：与申报文字里的事实不同就拒绝并作废放行，目标存在且不大于 10 MiB 时一律先备份；再调一次仍被拒。普通的子 agent 不问人，纠偏让它把编号交回给派发它的 agent。装了 M7 的项目里写文件的是 worker，它的写入先被 M7 的写入范围拦下：M7 的门向 guard 行的服务要一个编号（`outsideDenial`；目标出了项目才给，写进项目里但出了工作树的文件，例如主检出，由 M7 自己的纠偏处理、不问人，F19），worker 用 `ask_main` 把编号交给主 Agent 并等着，主 Agent 申报、人回「可以」之后主 Agent 回 worker，worker 原样再调一次；M7 的门先查放行簿（`peekGrant`），放行仍由 guard 行核对与用掉（§5.6，F13）。申报开着时，M7 把主 Agent 的自动推进停下等人（`openRequests`，§5.9，F14），申报的开与关都写在会话日志里，面板「需要你」列出它（§5.8，F15）。拒绝文案：`61be79a` 已让两条规则的例外改为告诉人，G1 只换 file-tools-only 的文案，带编号的部分随 G4。圈禁顺带补上 `str_replace_editor` 的写入。
- 检查器运行与当轮回传（§6）。检查分两种，谁同意、谁跑都分开（`design-context.md`「Check entries seam」，循环板 0.6 §2.3、§5.3、§7.1）。**M4 自带的检查器**：环境工具节点的验收条件里人批准的检查行（名字、输出格式、命令参数表、适用的文件），在板上是 env 行交来的一项只能看的 `env.checks-after-edit`（`self`）；agent 用文件工具写成功之后，它的下一步之前 env 行在这些文件上跑适用的检查，至多等 20 秒，把结果以一条 `<system-reminder>` 放在这一步的消息末尾：每个检查的发现数、至多 5 条带 `文件:行` 的发现（落在本次改动行上的排前面）、完整输出的日志路径（摘要 §4 第 6 条）。没有发现时不出声，除非上一条结果有发现。命令不经 shell，改动文件只作为单独的参数传给程序。进程由循环板的共用执行器起（`runCommand` 的 `queue: 'direct'`，不排在循环板的脚本后面，并发由 M4 管）。**人加的检查**：循环板上人的普通条目，动作 `check`，命令原文取自同一个工具节点的检查行，由循环板的执行器跑，走与脚本同一条同意的路（`loop_propose` 返回命令原文与注意事项，`propose_to_human` 把它们原样给人看，`record_human_answer` 在核对到人看过原文之后才写入），结果按条目的设置交给主 Agent 或改文件的那个会话；M4 不执行它们，只给三样东西：按工具节点读出一条检查命令的读法 `checkCommandOf`、填占位的纯函数 `fillCheckArgv`、整理输出的纯函数 `formatCheckOutput`（§6.1）。`env.files-edited` 是循环板事件表里的一个事件，env 行在每一步算出改过的文件之后经 `emit` 交进收件箱（没人听时不交，§6.2）。env 行另把两项交给循环板（§6.8，F11）：「改完文件就跑检查」，展开写出检查器自己的四条规矩（一步至多等 20 秒、每个检查 60 秒、跑不起来或输出读不懂连续 3 次后这个会话不再跑、没有检查覆盖的语言每个会话提醒一次），数由代码里的常量生成；与图工具的「同一件活第三次返工之前停下问你」。每跑完一次检查、每提一次第三次修复的问题都报给循环板。
- 告警棘轮与压制（§6.7）。棘轮由四处一起守：每次改完的检查只报新发现（本仓库的 ESLint 批量压制让基线里的告警不出现）；汇合门禁跑项目的检查命令（M7 `norm-merge-gate`）；`checker-config` 记下对配置与基线的改动；`suppression-reason` 记下没写理由的新压制。压制注释的总数每天记一次，晨报显示总数与本期变化。
- 环境分支与草稿区（§7）。图上 id 为 `env` 的特性节点是环境分支，子节点是工具节点（用途、用法、选择理由、安装位置、配置文件）。每个 agent 在会话第一步、以及环境分支变化后的下一步收到一条提醒：项目里有哪些工具、怎么用，改完哪些文件会跑检查，草稿区在哪。草稿区是工作区的 `.llm/scratch/`；项目没有忽略它时，env 行经 `ensureIgnored`（`src/data/project-root.ts`）把一行 `.llm/` 追加进 `.git/info/exclude`，追加之后用 `git check-ignore` 复核，仍未忽略时行健康降级。M7 汇合门禁的第 6 条（草稿区的临时脚本已删除或转正）调用 M4 的 `scratchLeftovers`。
- 清理 `.llm/docs/` 的三个抓取脚本与 `__pycache__`（§8）：删除，保留抓下来的 `_bigmodel_md/`，删除之前把脚本里的地址与重新抓取的办法写进 `docs/reference/bigmodel-guide-digest.md`。
- 不在 M4 里做、M4 要接上的：会丢工作的 git 命令先存快照（`d-main-agent-shell` 定稿）由 M3 第 4 步做（M3 附录 0.5 §2.5），M4 不另做一份。M4 的规则不判 git；快照门与别的门共用跟进记录器，它的拒绝在流水里按拒绝分类（§2.3、§3.3）。
- 存放（`d-rules-in-repo`、`d-memory-scope`，§2.4）。M4 按项目存的东西都在项目里：定义进仓库（环境工具节点上的检查行与项目图里的环境分支、循环板上人加的检查条目、代码里的规则模式、本仓库的回归语料），运行时的东西进这个项目自己的 `.llm/`，不进 git（违规流水、标注、回放结果、放行之前的备份、检查日志、压制计数）。项目由会话的工作目录往上找 git 根定（`src/data/project-root.ts` 的 `projectOf`），工作树与主检出是同一个项目；0.3 的违规流水写在数据行配置的一个固定目录里，换成按会话找项目之后，每个项目的晨报只数自己的。M4 不在用户级目录存任何东西；申报、放行与跟进的待判只在内存里。关于人本人的记忆留在用户级、项目经验（含通用的踩坑经验）都在项目里（`d-memory-scope`）：M4 不存经验与记忆，与它无关。
- 高峰（`d-main-agent-peak-exempt`，§2.5）。M4 不加任何高峰逻辑，不让主 Agent 等高峰：申报、第三次修复的提问与它们的回话任何一档都照常；改完文件就跑的检查是本机进程、不花 GLM，任何一档都照常跑。练习题（K1）是重活，归规则板按高峰模式挪开。
- 两层循环（`d-design-onepage`，§13.5）。开发 M4 时，只影响 M4 且可逆的问题由主 Agent 定、在下一批告诉人；改到 M4 设计方向的回本设计的循环；改到框架的回大循环。产品里 M4 给人的两种问话（申报、第三次修复）都在主 Agent 的对话里，进同一批，一次至多三件；申报单独放在回复最后，所以那一条回复只有它一件。

实施（§13）：四条并行的线，互不碰同一个文件。guard 线 G1–G4 串行（影子判定、安装函数、按项目存流水、file-tools-only 的新文案 → 跟进、标注与统计 → 四条影子规则 → 申报通道）；env 线 E1–E4（新行 → 环境分支与草稿区 → 检查器与交给循环板的两项 → 压制计数；压制标记表放在 `src/shared/`，E4 不等 G3）；图线 R1（第三次修复之前问人）；清理线 C1。登记文件、晨报与文档由编排者按 §13.3 排先后合入。G4 等 M3 第 4 步（`dispatchRoot`）；R1 等 M3 第 6 步（提议式待决）与它的「原样再给人看」一种（§4.6）；E3 等循环板的共用执行器、事件表与服务（`src/loops/`，§6.1、§13.3）；人加的检查要 E3 的读法与纯函数合入才跑得起来，在那之前这类条目一律 `refused`（循环板 0.6 的 S3 已这样写）。M7 那一侧的两处接缝（写入范围的门要编号与查放行、申报开着时停下自动推进）谁后合入谁加。人放行之后由主 Agent 自己推进到做完（`d-auto-drive`），只在 D1、影子规则转生效与第三次修复三处停下问人；G1–G4 与 C1 按 `norm-review-floor` 全审。

要人定的事（§17）：只剩 D1，七个任务节点「怎样算做完」（改这一项属于必须问人的第 1 类），按 `d-chat-not-cards` 写成一段四行的方案。D2 人已答（选 B）。0.1 的 D3 在 0.2 删去。申报改为对话里回「可以」、人加的检查是人在对话里看过命令原文同意的循环板条目、M4 自带的检查器取自人批准的工具节点，是 agent 照人定的方向与编排方的接缝裁定定的（§16），写在一页放行稿里请人看一眼。D1 与一页放行稿 `onepage.md` 的问话合成一次问。

## 1. 需求与验收

### 1.1 来源

- `docs/ROADMAP.md` M4：§6.4 的规划规矩；影子模式机制；检查器运行与当轮回传；告警棘轮与压制规则；环境分支与草稿区；清理 `.llm/docs/` 下的抓取脚本。
- 节点 `m4-request-card`（依赖 `m3-5`、`split`，来源 `question-24` 选 A）：圈禁拒绝之后经决策卡申报，写明目标、目的、可逆性与影响面、考虑过的替代；人批准只放行当次，再次调用仍被拒；复用 M3 的 `decision_card` 与以人的身份写图；按所有路由设计。验收在设计时提给人（D1）。其中「经决策卡」「复用 `decision_card`」被之后的 `d-chat-not-cards`（人 2026-10-30：「产品里也不用问答卡、不给选项」）取代：申报改在对话里问，人用下一句话回答（§5）；节点正文与对 `m3-5` 的依赖由编排者按 §18 第 2 条改。
- `docs/ORCHESTRATION.md` §5（同步卡：出工作区操作，批准只放行当次，不产生残留授权）、§6.1（规矩即数据的五样：告知、探测、纠偏、申报、记录）、§6.2（G3）、§6.3（正路与「拦截后下一步走对的比例」）、§6.4、§6.5（影子模式）、§7.1–§7.6（环境、草稿区、检查器、告警）、§10.2（压制注释数、修在根上）。
- `docs/CHARTER.md` §6「新门禁先以影子模式运行」「告警必须修」；§7.1 条款 4（修在根上）、7（失败要出声）、10（不长工具专用目录）、11（处处留痕）。
- 阅读摘要 §4 第 6 条（检查器回传只给几行，全文写日志）、第 7 条（量纠偏是否教会了模型）、第 8 条（用带标注的语料量精确率与召回率，尤其 G3 新覆盖的非 GLM 路由）、第 9 条（凭证读取先记影子）。
- 人在 2026-10-29 的定案：`question-14` G3；`d-failure-plans` 与 `docs/DEVELOPMENT.md` §1.1 的挡路标准；`question-28` C 的并行；验证用的积分预先授权；规则只由人写（`d-rules-human-only`，针对规则板）；问人的话带前因后果（`.agents/tasks/design-context.md`「Questions for the person carry their background」）。
- 人在 2026-10-30 的定案：`d-chat-not-cards`（问人改成聊天；格式定稿见节点的最后一条批注：题目单独一段，背景、推荐、疑问、不做四行各自成段，标签不加粗，每行把重点几个字加粗，问话放在最后；只给一个方案，不编号、不给字母）；它取代 `d-option-card` 与 `d-recommend-last` 对人的问法，所以 0.2 里申报卡与第三次修复待决的表格写法都不再用；`d-ui-look-not-operate`（面板只看不操作，「需要你」只列在等人回话的事，点开跳到主 Agent 的对话）；`d-plain-questions`（验收说「怎样算做完」，标定说「练习题」，门禁说「合入前的检查」，投影、补遗说清是什么）；`d-one-main-agent`（每个项目恰好一个主 Agent，是人唯一的对话窗口）；D2 的回答（选 B，原话「不介意」：只读工具调用的命令文本与路径，不读对话正文，结果留在 `.llm/`，脱敏的个别样本进 `tests/guard-corpus/`）；`d-main-agent-shell` 定稿（主 Agent 随意用命令行与 git，只是没有写文件的工具；harness 只守主干前进的那一刻；编排方的落地细则：会丢掉没提交的改动或改写已推送历史的 git 命令执行前，harness 先存一份可恢复的快照（`git stash create` 加 `refs/hourness/snapshots/` 下的引用，改写历史时打标签）并记下，再放行）；`d-one-main-agent`（每个项目恰好一个主 Agent）；`d-main-agent-models`（子 agent 与审查的模型由主 Agent 选，harness 只记录）；`d-auto-drive`（设计放行之后主 Agent 自己推进到底）；`d-zcode-3171`（ZCode 基线 3.17.1）；`norm-review-floor`（改拦截与权限、删文件等几类改动一律全审，harness 按改动的文件与命令判断）；`d-design-onepage`（每个模块的设计对照方向清单，另写一页人话放行稿，人放行之后才开发；开发中的问题分三档、攒着问、一次至多三件）。
- 第 3 轮评审之后人定的（2026-10-30）：`d-rules-visible`（项目所有规则都在明面上，原话「没问题，项目所有规则确实应该都在明面上」：改完文件就跑的检查器放循环板）；`d-boards-as-hooks`（原话「我指的是，循环板和规则板都借鉴hook和dsh插件的理念，然主Agent编脚本写进去？」与「同意了直接运行就行」：两块板的每一条都是「什么时候 + 可选的筛选 + 动作」，动作是系统自带的或主 Agent 派子 agent 写的脚本，人看过原文同意后直接生效、不先试运行；代码里的规则原地不动、照旧列出；节点正文写明「规则板、循环板与 M4 的检查器照此改」）；`d-rules-in-repo` 与存放范围（原话「一样进仓库和项目目录」与「差不多都是进.llm，全局的似乎只剩下人设和登录信息之类的吧？」：定义进仓库，运行时的东西进项目的 `.llm/`，违规流水在列；之后的 `d-memory-scope`：关于人本人的记忆留用户级，项目经验含通用的踩坑经验都在项目里）；`d-main-agent-peak-exempt`（原话「主Agent应该不受高峰影响，随时回复的」）；`d-design-onepage` 用进产品（原话「两层循环加，我正想说这个事情呢」）；接缝裁定（`design-context.md`「Main agent and peak; stale entries; hook seam」：条目形状、事件表与脚本执行器归循环板，哪些事件拦路与脚本结果怎样进 `checkCall` 归规则板，两块板走同一条同意的路；周报列出 4 周没结果的人加条目并提议删掉）。
- 第 4 轮评审之后的定案与对齐轮（2026-10-30）：编排方对 F17 的接缝裁定（`design-context.md`「Check entries seam」：会跑东西的循环板条目不论谁带来都走同一条同意的路，同意时给人看原文；人加的检查是循环板的普通条目，由循环板的执行器跑，命令原文取自环境工具节点，节点与它的格式归 M4；M4 不执行人加的条目，自带的检查器仍是插件交来的数据、M4 可以继续执行）；`d-agent-examples`（主 Agent 写给人或交给 harness 的每一种东西，在写它的工具说明里配一道示范，领域与练习题无关）；`d-script-timeout`（不拦路的条目有自己的超时，超时的结果写「没跑完」、下一次触发照常再跑、超时计进周报）；`d-alignment-rounds`（人「全都没问题」）与人对这一稿的「行」（`m4` 节点 2026-10-30 的批注）；循环板 0.6、规则板 0.10 对 M4 的接缝（`m4` 节点 2026-10-30T08:12Z、10:13Z 两处批注）。

### 1.2 各任务的行为与建议验收（D1）

建议在 `m4` 下另建六个任务节点（§18），与已有的 `m4-request-card` 合起来七个。验收写进节点要人批准；在人定之前，实现与 L2、L3 的检查按下表做。各行带 F、N 编号的条目是 0.4 按第 3 轮评审、0.5 按第 4 轮评审与对齐轮改的。

| 任务 | 行为（本设计） | 建议验收 | 层 |
| --- | --- | --- | --- |
| `m4-shadow` 影子机制与度量 | 规则模式写在代码里；影子判定与记录；拦截后的跟进记录；标注、统计、回放、回归语料；规则目录与规范节点一致（§3） | 1. 模式为 `shadow` 的规则从不拦截：调用照常执行，违规流水里恰好一条 `mode: 'shadow'`、`via: 'rule'` 的记录，带规则、工具、命令或目标、`scope` 与路由；影子规则不出现在 `glm:guard` 声明里。2. 经 `installRuleGate` 安装的规则每拦下一次，同一 agent 下一步里模型发出的第一次调用留下恰好一条跟进记录，不论这次调用又被哪一行拒绝或放行，分为走对正路、原样重试、别的、没有下一步；GLM 上经 `DeferredToolCall` 包装的调用按拆开之后的工具与参数判；与被拦的调用同一步发出的调用不结算；拦截之后回合结束或会话卸载、还没有下一步时记「没有下一步」；晨报按规则写「拦截后下一步走对 x/y（另有 n 次停下来交给人或上级）」，`y` 不含「没有下一步」（N30）；跟进、申报、放行的记录不计入晨报的违规数，规则板 `mode: 'enforce'` 的拦截计入，规则板排队（`effect: 'queue'`）的记录不计入（N31），规则板的 `mode: 'late'` 计入违规数并另列一行，`mode: 'record'` 不计入、单列计数；规则板的门同样结算跟进，M3 的 git 快照门在它加 `observe`、`noteDenial` 之前不在这一条里。3. `npm run -s guard -- stats` 按规则与来源（方言 / 其他路由）给出记录数、已标数、该拦、误伤、说不准、精确率，有漏判来源的规则另给召回率；带 `--relay` 的标注算人的。4. `npm run -s guard -- replay` 只读本机会话日志里的工具名、shell 命令文本与目标路径，以及请求头里的模型名、会话头的工作目录与工具结果的 `isError`，不读写入的内容、对话正文与任何工具输出的文字（夹具里出错结果的文字带一个标记串，内存条目、`replay.jsonl` 与 `summary.json` 里都找不到它，F16）；「当时拦没拦」按同一会话、同一工具名、时刻相差 2 秒以内的违规流水记录判，对不上记「不明」；按规则与来源列出今天的规则会拦的历史调用，输出只写在项目的 `.llm/` 下；默认只读会话头 `cwd` 经 `projectOf` 归到目标项目的会话（`--sessions` 另给目录），因属于别的项目而跳过的会话数写进 `summary.json`（N39）。5. `tests/guard-corpus.spec.ts`：生效的规则对一条语料的判定与标注不一致、且这条没有标为已知误判时失败，并打印每条规则的精确率与召回率。6. `GUARD_RULES` 列出 guard 框架的全部规则（guard 行六条、图行、循环板两条、指标流水一条），都经 `installRuleGate` 安装，模式与规范节点的 `模式：` 标签相同；M3 的 `MAIN_AGENT_RULES` 与 M7 的 `EXECUTE_RULES` 各在自己的表里，三张表合起来 id 不重复；装在 guard 行以外的影子规则判为拒绝时同样留下影子记录。7. 违规流水、标注与回放结果写在会话所在项目的 `.llm/` 下：两个项目的会话各写各的，M7 worker 工作树里的会话写主检出那个项目的；行配置了 `home` 时写那里（§2.4） | L2、L3 |
| `m4-rules` 规划规矩 | 四条影子规则；第三次修复之前问人；§6.4 写明每行在哪（§4） | 1. `credential-read`、`suppression-reason`、`checker-config`、`scratch-only` 以影子模式上线：触发的调用照常执行、各留一条影子记录；相邻的不触发情形（读 `~/.dsh` 下别的文件、带 `-- 理由 [节点]` 的压制、改普通源文件、在已有同类文件的目录里新建 `.ts`）不留记录。2. LLM 第 3 次把同一节点从 `done` 改回 `doing`（第 3 次修复开始）时，节点下出现一张由 harness 提出、决定者为人的提议式待决：题目与背景、推荐、疑问、不做四行都过 `proposalLineRefusal`，节点上没有 `options`、`recommend`、`crux`、`verdict`、`weight`；题目、四行与正文里没有 `验收`、`标定`、`门禁`、`投影`、`补遗`；疑问一行写出一个一变方案就要换的事实（F12）；节点标题带人没学过的词、编号或文件名（例「M4 guard 补齐与环境」「补齐验收条件」）时，题目写「这件活要修第 3 次了」、节点标题移进「附」，这样的待决在 plain-ui 第二阶段的写法检查下交给真实引擎照样提得出来（F18）。`graph_status` 的结果让主 Agent 把它放进下一批交给人的事里（一次至多三件），问话只问「先停下查原因，可以吗？」，结果与正文里没有两个以上「回「…」」式的回复词；人同意、补充、否掉或说不用定了，都有记法（`record_human_answer` 拍板或批注，或带原话放弃）。这张待决未关闭时之后的重开不再加。循环板在时，它的页面列出这一项，每提一次报一次（F11）。3. `docs/ORCHESTRATION.md` §6.4 的每一行写明在哪一行实现、模式与状态 | L2、L3 |
| `m4-request-card` 申报通道 | 拒绝带编号；`request_exception` 返回 harness 写的方案文字，agent 原样问人；人的下一句话决定；一次性放行；使用时核对目标并备份；装了 M7 时 worker 经主 Agent 申报、自动推进停下等人；开与关都在会话日志里，面板列出；拒绝文案改写（§5） | 1. 圈禁拒绝的纠偏带申报编号，点名 `request_exception` 与它的四个字段；它从不指向本会话没有的通道（普通子 agent：把编号交回给派发它的 agent；M7 的 worker：用 `ask_main` 把编号交给主 Agent 并等回答）。2. `request_exception` 返回一段由 harness 写的方案文字：题目，背景、推荐、疑问、不做四行各自成段（四行过 `proposalLineRefusal`，N27），最后一句问话；写明解析后的路径、文件在不在、大小或行数、覆盖前会不会备份，agent 写的目的、可逆性与影响面、替代用「」标成原话；疑问一行写出一个一变就不该放行的事实（N28）；harness 自己写的部分不含 `验收`、`标定`、`门禁`、`投影`、`补遗`；题目里的路径与背景一行里的焦点标题是数据（路径原样显示，焦点标题不合格就省去那半句），所以焦点标题是「补齐验收条件」、路径含「门禁」时照样写得出合格的文字；文字写不出（任何抛错）时不登记、返回 `unavailable`（F18）。从最后一条人的消息以来本会话已出示过 `propose_to_human` 的结果时返回 `busy`（N29）。工具说明带一道示范，L2 让它过真实的检查（F20）。3. 只有人的下一条消息能批准：它来自客户端的输入（`source.kind: 'user'` 且带 `rpcId`），它之前的最后一条助手消息以这段文字结尾，消息去掉首尾空白与句末标点后恰是同意词表里的一个（如「可以」）；这时同一派发链里同一个调用（同一工具、同一组参数）在 30 分钟内放行一次，agent 在这一步收到一条说明，带被拒调用的工具与参数；第二次同样的调用与任何不同的调用仍被拒。别的回话、在这段文字之后又说了别的、文字被改过，都不放行，agent 各收到一条说明；申报开着、这一回合第一步没有人的消息时，每一回合都提醒 agent 回合末再出示一次，不论上一回合是不是以这段文字结束（F14，N35）。4. 放行只有这一个来源：向违规流水追加任何记录（含伪造的申报与回答）、改项目图、模型自己写的任何文字都不产生放行。5. 使用时目标的存在与否、大小、修改时间与申报文字里的不同时，这次调用被拒、放行作废；相同时，目标存在且不大于 10 MiB 就先把旧内容复制到项目的 `.llm/requests/`，复制失败时这次调用被拒、放行不作废。6. 进程重启或插件重新加载之后未答的申报与未用的放行都没有了，agent 重调被拒的调用拿新编号再申报；重启之后第一次给那个会话装提醒时，日志里还开着的申报收到一条「作废」的提醒（F15）。申报、人的回话（原话）、放行的使用与作废各在违规流水里记一条，写明何时、哪个会话；晨报计数。7. GLM 与非 GLM 路由上都成立；`str_replace_editor` 写工作区外与 `write`、`edit` 一样被圈禁拒绝。8. 装了 M7 的项目里，worker 写出了项目被 M7 的写入范围拦下时，纠偏带编号；主 Agent 申报、人回「可以」之后，worker 原样再调一次成功，第二次被拒（F13）。worker 写项目里但出了工作树的文件（例如主检出）被拦下时，纠偏是 M7 的，没有编号、不问人（F19）。9. 申报开着时，装了 M7 的主 Agent 的自动推进停下等人（goal 为 `blocked`，原因码 `hourness-waiting-human`，消息写编号），申报关闭后恢复；人在申报文字出现之后回「可以」，放行成功（F14）；人一直不回时，2 小时一到申报关闭并叫醒持有者，M7 恢复推进（N38）。10. 申报的开与关都写在会话日志里：开是 `request_exception` 的结果，关是带 `request: {ref, outcome}` 的提醒（`approved`、`declined`、`closed`、`expired`、`lapsed`）；面板「需要你」从会话日志读出开着的申报（F15） | L2、L3；L4 |
| `m4-checks` 检查器当轮回传 | 检查分两种。M4 自带的检查器取自环境工具节点上人批准的检查行，每次改完在下一步之前跑，紧凑回传；人加的检查是循环板上的普通条目，由循环板的执行器跑，同意时人看到命令原文，M4 只给读法与两个纯函数。交给循环板一项并报每次运行（§6） | 1. agent 的文件工具写入成功、改动的文件对得上一项已批准的检查行的适用范围时，这个 agent 的下一步带一条提醒：每个检查的发现数，至多 5 条 `文件:行` 的发现（落在改动行上的排前面），日志路径；完整输出在日志里；没有发现时不出提醒，除非上一条提醒有发现。2. 自带的检查只来自状态为 `approved`、`doing`、`done` 的工具节点上读得懂的检查行（读不懂的行跳过，行健康写明）。命令不经 shell：改动文件只作为单独的参数传给程序，文件名里的 `$(…)`、反引号、`$变量`、`%` 都原样到程序手里；程序是 shell 的命令不收文件参数。每个检查日志的第一行是展开之后的完整参数表；跑不起来、超时（60 秒）或输出读不懂时，提醒与行健康写明；同一检查在一个会话里因跑不起来或输出读不懂连续 3 次失败后本会话不再跑它，超时不算，下一次改动照常再跑，同一项上一次还在后台跑时不起第二个（N37，`d-script-timeout`）。3. 一步至多等 20 秒，跑得慢的结果在之后的步里送到。4. 改了没有任何检查覆盖的语言的文件时，每个会话每种语言提醒一次，写明社区默认的检查器与怎样请主 Agent 提一个带检查行的工具节点。5. 循环板在时，它的页面列出「改完文件就跑检查」一项，展开是本项目每个已批准的检查行一行与检查器自己的四条规矩，来源写「项目编排带来的 · 只能看」，四条规矩里的数由代码里的常量生成；每次把检查结果交给 agent 时，按每个检查报一次运行，超时报 `failed` 并写 `reason: 'timeout'`（F11，N37）。6. 人加的检查（F17）：`checkCommandOf` 对已批准节点上的一条检查行返回命令参数表（节点或那一行不在、不合语法、未批准、有几条而没指名时返回 `undefined`）；`fillCheckArgv` 把 `{files}` 换成每个文件一项，以 `-` 开头的名字前加 `./`；人加的条目提议时给人看的命令原文就是这条参数表，M4 不执行这类条目。7. `env.files-edited` 的载荷是 `files`（相对改动所在的检出的根）、`root`、`truncated`，经 `emit` 交进收件箱，没人听时不交；工作树里改 `src/a.ts` 时 `files` 是 `src/a.ts`，筛选 `src/` 的条目跑（N40） | L2、L3；L4 |
| `m4-env` 环境分支与草稿区 | 环境分支的格式与会话提醒；草稿区与 git 忽略；给 M7 的草稿区清单（§7） | 1. 图上 `env` 特性的工具子节点，在每个 agent 的会话第一步、以及环境分支变化（工具节点或它的检查行增删、改动）后的下一步列出（至多 12 个、1500 字符），带「改完哪些文件会跑检查」一行（M4 自带的检查器；循环板上人加的检查由循环板告诉主 Agent，不在这一行里）与草稿区一行。2. 会话所在仓库里 `git check-ignore -q .llm/scratch/x` 的退出码为 0；项目没有忽略时，guard 行或 env 行第一次往这个项目的 `.llm/` 写东西之前，经 `src/data/project-root.ts` 的 `ensureIgnored(根, '.llm')` 在 `.git/info/exclude` 末尾追加一行 `.llm/`（已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 任一行时不追加，重启多次也只有一份），追加之后用 `git check-ignore -q` 再核对一次，仍未忽略时行健康降级并写明原因。3. `scratchLeftovers(根目录)` 列出草稿区里的文件（M7 汇合门禁用） | L2、L3 |
| `m4-suppressions` 压制计数 | 每天记一次已跟踪文件里的压制注释数，晨报显示（§6.7） | 1. 压制注释数每天至多记一次（项目的 `.llm/audit/suppressions.jsonl`），按标记分类；指标服务在时同时交一条计数事件。2. 晨报写「压制注释 N 处（本期 +a / −b）」 | L2 |
| `m4-cleanup` 清理抓取脚本 | 删除三个脚本与 `__pycache__`，先把地址与重新抓取的办法写进文档（§8） | 1. `.llm/docs/` 下没有 `_crawl_bigmodel.py`、`_fetch_bigmodel.py`、`_fetch_extra.py` 与 `__pycache__`；`_bigmodel_md/` 不变。2. `docs/reference/bigmodel-guide-digest.md` 的「附」写明重新抓取的办法，并逐字列出三个脚本里的地址与路径字面量；提交信息记下三个脚本的 SHA-256 | L1 |
| `m4`（特性） | 上面七项合起来 | 不变（`m4` 没有验收字段，随子节点关闭）；批次 L4 通过（§14.3） | L4 |

### 1.3 非功能需求

- 不增加人的负担（`question-27` B）：M4 新增的给人的东西只有两种，都在对话里：申报（人本来就要批出工作区的写入，`docs/ORCHESTRATION.md` §5；人回一句「可以」）与第三次修复之前的一问。两种都是 harness 写好的四行方案，人凭直觉说对不对（`d-chat-not-cards`）。另有一种是一次性的：人要在循环板上加一项人加的检查时，主 Agent 在对话里按循环板的提议路径问一次（命令原文附在四行之后），人同意后一直生效；M4 自带的检查器随人批准环境工具节点而来，不另问。影子记录、标注、统计不打扰人；人只在 M7 的周报阶梯提出「影子转生效」时看一次数字与至多 5 条样本。
- 检查器回传占的上下文小：每条提醒至多 1200 字符；没有发现不出声。
- 代码里的每条新规则先影子（`docs/CHARTER.md` §6）。`d-boards-as-hooks` 只对人看过原文同意的板上条目免去影子期，代码里的规则原地不动（节点正文「代码里的规则原地不动，照旧列出」）；`docs/CHARTER.md` 0.7（§3.2 第 3 条、§6）已照这个分界写。§7.6 的「没写理由的新增压制直接拦下」是生效后的状态，按 §3.5 的判据转过去。检查不拦任何调用；人加的检查条目人同意即生效。
- 失败要出声：每一项降级都进行健康；拦截、影子、跟进、申报、放行的每一件事都在违规流水或图上留一条记录。
- 对所有路由与模型生效（G3）；不装 GLM 通道包时同样成立。

### 1.4 不做（详见 §15）

装工具走同步卡（`docs/ORCHESTRATION.md` §7.3）的探测、惯犯升级（§6.6）、格式化工具的自动修复、规范阶梯的提议与周报（M7）、规则板的实现（规则板设计的 R1–R7，与 M4 同一里程碑、另一条线）、循环板上条目的存放、同意的路径与脚本的执行器（循环板）、执行人加的检查条目（循环板的执行器跑，M4 只给命令的读法与两个纯函数）。

### 1.5 按方向清单自查（`d-design-onepage`，评审第 3 轮 F11 第 5 条）

方向清单是人定过的产品方向（`d-design-onepage` 的大循环产出，本仓库今天写在图上各个 `d-*` 决定与 `.agents/tasks/design-context.md` 里）。逐条：

| 人定的方向 | M4 怎样遵守 | 在哪 |
| --- | --- | --- |
| 两块板都像 hook：「什么时候 + 筛选 + 动作」，动作是自带的或人看过原文同意的脚本，同意即生效（`d-boards-as-hooks`），会跑东西的条目都走同一条同意的路、同意时给人看原文（接缝裁定 `Check entries seam`） | 人加的检查是循环板上人的普通条目：什么时候是 `env.files-edited`，筛选是路径与扩展名，动作 `check` 的命令原文取自环境工具节点；人在四行之后看到命令原文与注意事项、同意后直接生效，由循环板的执行器跑，M4 不自己起这类进程。M4 自带的检查器是插件交来的 `self` 条目（`env.checks-after-edit`），命令取自人批准的工具节点，板上只能看，由 M4 执行；M4 的四条代码规则原地不动，经规则目录列在规则板「写在代码里的规则」里 | §6.1、§3.8 |
| 属于项目的进项目：定义进仓库，运行时的东西进项目的 `.llm/`；全局只留登录凭证、设备号、人设、关于人的记忆、账号用量与插件配置（`d-rules-in-repo`、`d-memory-scope`） | 工具节点上的检查行、人加的检查条目、环境分支、规则模式、回归语料在仓库；违规流水、标注、回放、备份、检查日志、压制计数在项目的 `.llm/`；M4 没有用户级文件，不存经验与记忆 | §2.4 |
| 主 Agent 不受高峰影响（`d-main-agent-peak-exempt`） | M4 不加高峰逻辑，不让主 Agent 等；检查不花 GLM，任何一档照跑 | §2.5 |
| 两层循环，问题分三档、攒着问、一次至多三件（`d-design-onepage`，含产品） | 开发 M4 时三档各举 M4 的例子；产品里两种问话进同一批；一页放行稿 | §13、§13.5、§17 |
| 问人改成聊天：一个方案四行，不给选项（`d-chat-not-cards`） | 申报文字与第三次修复都是一个方案的四行；第三次修复存提议式待决，不带选项字段，问话不给两个回复词；人随口回答时 harness 给确认句或主 Agent 先复述 | §4.6、§5.4、§5.5 |
| 问话用人学过的词，带前因后果（`d-plain-questions`、问题带背景） | 给人看的文字经 `plainWordsIn`；背景一行紧跟题目 | §5.4、§4.6、§14.2 |
| 面板只看不操作，「需要你」列出等人回话的方案（`d-ui-look-not-operate`、`d-chat-not-cards` 落地方案第 4 条） | 申报不在面板上批；开与关写在会话日志里，请面板在「需要你」里列出开着的申报 | §5.8 |
| 项目所有规则在明面上（`d-rules-visible`） | 自带的检查器作为一项交给循环板，四个数写在 `ownRules`；代码规则经 `GUARD_RULES` 在规则板上只读列出 | §6.8、§3.8 |
| 默认条目只能看（`d-defaults-readonly`） | env 行与图行交的两项只能看；自带的检查器随工具节点增删，人加的检查条目只经对话增删 | §6.8 |
| 规则只由人定（`d-rules-human-only`） | 人加的检查条目只由循环板在人同意之后写，agent 只提议；自带的检查器取自人批准的工具节点，验收条件批准之后只有人能改；代码规则的模式只随带人拍板的提交改 | §6.1、§3.1 |
| 一个项目一个主 Agent（`d-one-main-agent`） | 子 agent 与 worker 的申报都经主 Agent，在它与人的对话里问 | §5.6、§5.9 |
| 设计放行后主 Agent 自己推进（`d-auto-drive`） | M4 只在 D1、转生效、第三次修复三处停下问人；申报开着时自动推进停下等人，关了接着走 | §13、§5.9 |
| 模型由主 Agent 选（`d-main-agent-models`） | M4 不写评审与子 agent 用哪档模型 | §13 |
| git 交给主 Agent，只守主干前进（`d-main-agent-shell`） | M4 的规则不判 git；快照门与别的门共用跟进 | §2.3、§3.3 |
| 高峰模式三档，默认少做（`d-peak-mode`） | 不碰档位；练习题按规则板的自报重活挪开 | §2.5 |
| 系统看得到的数由 harness 写（`metrics`） | 每条记录由 harness 写；指标服务在时交拦截、跟进与计数事件 | §2.3、§3.11 |
| 改拦截、权限、删文件的改动全审（`norm-review-floor`） | G1–G4、C1 全审；之后改模式、可申报名单、同意词表的提交也全审 | §13 |
| 对所有路由与模型生效（`question-14` G3） | 申报、拒绝文案、检查都不看路由 | §5.7 |
| 人的负担不增（`question-27` B） | 新增的问话都在对话里、四行、一次至多三件；人加的检查条目只问一次 | §1.3 |
| 主 Agent 写给人或交给 harness 的每一种东西，在写它的工具说明里配一道示范，示范过真输入同样的检查，领域与练习题无关（`d-agent-examples`，评审第 4 轮 F20） | `request_exception` 的三句话（目的、可逆性与影响面、替代）由 agent 写、原样进「附」，说明里带一道音乐播放器歌单文件的示范，L2 让它过参数检查与 `renderPlan`；检查行（agent 写进工具节点验收条件的）的示范放在没有检查器时的提醒里，L2 让它过 `checkLineRefusal`；人加的检查条目的示范归循环板的 `loop_propose` | §5.3、§6.6、§14.2 |
| 项目经验在项目里、关于人的记忆在用户级（`d-memory-scope`，评审第 4 轮 N36） | M4 不存经验与记忆 | §2.4 |
| 不拦路的条目有自己的超时，超时写「没跑完」、下一次触发照常再跑、超时计进周报（`d-script-timeout`，评审第 4 轮 N37） | 自带的检查器每个 60 秒超时，超时的结果交给改文件的那个 agent（`d-boards-as-hooks` 允许「条目指定的 agent」）并报 `recordRun` `failed`、`reason: 'timeout'`；超时不计入「连续 3 次失败后本会话不再跑」，下一次改动照常再跑；人加的检查的超时归循环板的执行器 | §6.3、§6.5、§6.8 |

## 2. 总体设计

### 2.1 依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）

- 度量：信息检索的精确率与召回率，按来源分层的抽样标注（每层样本数与误判条数一起报，不只报比例）；回放历史数据作为离线影子，与实时影子分开计数。
- 静态分析的工程经验：Sadowski 等对 Google Tricorder 的总结（ICSE 2015；CACM 61(4), 2018）：分析结果在开发者改代码的那一刻、只在改动处给出；开发者认为是误报的比例（effective false positive）超过约 10% 的检查会被关掉或不被理会。对应本设计的当轮回传、改动行优先、影子期先量误伤。ESLint 的禁用注释描述（`-- reason`）与 TypeScript 的 `@ts-expect-error`（不需要时报错）是压制注释写理由的现成做法。
- 安全工程：最小授权（一次性、绑定到一个调用、有时限）；授权只认模型写不进去的来源（客户端送进来的人的消息，由宿主标 `source.kind: 'user'` 与 `rpcId`），模型能写的文件与项目图只作留痕；人批的就是他读到的那段文字（文字由 harness 写，必须原样出现在人回话之前的最后一条助手消息末尾）；同意要明确（同意词表之外一律不放行，fail-closed）；判定器出错放行、授权缺证据即拒（fail-open 只给探测，授权 fail-closed）；批准的事实与执行时的事实一致才执行（检查时与使用时之间的变化，TOCTOU）；可逆优先（覆盖前备份）；外部命令不经 shell，不可信的文件名只作为单独的参数（argv）交给程序，程序本身是 shell 时不收文件名（命令注入的标准防法：不拼命令行）；人同意的脚本按内容摘要钉住，改过就要再同意（知情同意的对象就是要跑的那份原文）；会跑东西的循环板条目同意时给人看的是命令或脚本的原文，不是转述（循环板的 `commandDetail`、`scriptDetail`）。
- 插件架构：扩展点与登记表（宿主只定契约与校验，扩展方交数据，宿主不认识扩展方的内部）；hook 的约定（事件以 JSON 从标准输入进，结果从退出码与标准输出出，单独的进程、最少的环境）。M4 是循环板的扩展方：交事件 `env.files-edited` 的声明与载荷、自带检查器的 `self` 条目、环境工具节点上命令的读法与两个纯函数，条目的形状、同意的路径与执行器归循环板。
- 人因与认知负荷：问人只给一个方案，背景、推荐、疑问、不做四行（`d-chat-not-cards` 的依据：对一个具体方案凭直觉判断对不对，比逐条比较几个选项省力）；问话带前因后果、用人学过的词（`d-plain-questions`）；人回一句话就行，不点按钮；人只看数字与少量样本。
- 可靠性：外部进程有超时并结束整棵进程树；输出有上限；全部异步、不阻塞宿主事件循环；每条降级有行健康。
- 隐私与数据最少化：回放只读工具调用的名字、命令与路径和三样元数据（模型名、工作目录、有没有报错），不读任何工具输出，结果留在项目不入库的 `.llm/`；进入仓库的样本先脱敏，再过密钥扫描。数据按归属存放：属于项目的数据在项目里，不在用户级目录按项目分（`d-rules-in-repo`）。

### 2.2 构件与位置

全部在编排层包 `dsh-hourness`（`packages/hourness/`）。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `env`。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 规则模式 `RuleMode`、`GuardRule.mode`、`rightPath`；`judge(rules, call, face)`；`RuleDeny.ref?`；`evaluate` 删除；file-tools-only 的例外文案改写（G1；`61be79a` 已删掉 `APPLICATION_PROTOCOL`，N34），圈禁的例外加编号（G4）；圈禁覆盖 `str_replace_editor` | `src/guard/rules.ts` | 改（G1、G4） |
| 唯一的安装函数 `installRuleGate`：跟进的 `observe`、`judge`、放行、拒绝记录、`next()` 之后的影子记录、判定出错进行健康 | `src/guard/gate.ts` | 新建（G1；G2 接跟进，G4 接放行） |
| 流水记录的类型：`RuleShadowRecord`、`FollowupRecord`、`RequestRecord`、`GrantRecord`、`GrantVoidRecord`；`ViolationRecord` 加 `call` 与 `ref`；`GuardRecord` 联合类型移到这里；唯一的分类函数 `classifyRecord`（含规则板排队的 `deferral`，N31，与规则板写的 `rule-record`、`late-denial`，规则板 0.10）；`recordKey(line)` 与 `keyOf(record)`（`recordKey(JSON.stringify(record))`，`src/memory/audit.ts` 追加的就是这段文字；规则板用它取 `noteDenial` 的 `key`；指标流水先建时沿用它的）；`subjectOf(call)` | `src/guard/records.ts` | 新建（G1） |
| 按项目的目录：`projectHomeFor(ctx, configHome, cwd)`（行配置的 `home` → 会话所在项目根下的 `.llm` → 数据行的 `projectHome` → 没有）；按项目缓存的流水 `projectJournal(row, homesFor, fs)`（`rowJournal` 的按项目版，每个项目一份 `AuditJournal`） | `src/shared/data-home.ts`、`src/memory/audit.ts` | 改（G1，§2.4） |
| 项目根与让项目的 `.llm/` 不进 git 的追加：`projectOf(cwd)`（从工作目录往上找 `.git`，工作树归到主检出）、`gitDirOf(root)`、`ensureIgnored(root, '.llm')`（在 `.git/info/exclude` 末尾追加一行 `.llm/`，已有等价的行时不追加） | `src/data/project-root.ts`（规则板的最小一片已建，是仓库唯一的项目根模块；M5、循环板、指标流水都导入它，不另写） | 不改，导入（G1 起） |
| 让项目的 `.llm/` 不进 git 的核对：调 `ensureIgnored`，再用 `git check-ignore -q` 复核，每个进程每个仓库一次，把结果交给行健康（`ensureLlmIgnored(项目根)`）；guard 行写流水之前、env 行装 notice 时都调 | `src/shared/llm-ignore.ts` | 新建（G1 或 E2，谁先开工谁建，另一方导入） |
| 代码规则目录 `GUARD_RULES`（id、所在行、模式、标题；guard 框架里装规则的行的全部规则，M3 的 `MAIN_AGENT_RULES` 与 M7 的 `EXECUTE_RULES` 不在里面，§3.8） | `src/guard/catalog.ts` | 新建（G1） |
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
| 申报编号、`request_exception` 工具、申报文字、读人回话的判定 `answerOf`、同意词表 `APPROVAL_WORDS` 与 `DECLINE_WORDS`、放行簿 `GrantBook`（只在内存）、使用时的核对与备份；给别的行的三个函数 `outsideDenial`、`peekGrant`、`openRequests`（§5.6、§5.9） | `src/guard/request.ts` | 新建（G4） |
| 服务 `glmHournessRequests` 的类型、常量 `REQUESTS_SERVICE` 与读取函数 `requestsService(ctx, problem?)`（成员类型不对时为 `undefined`，同 `pricingService`；`RequestsServiceContractCheck` 钉住类型与实现一致）。M7 与 M3 只导入这个文件 | `src/guard/request-service.ts` | 新建（G4） |
| harness 写给人的方案文字 `renderPlan({title, lines, attachments?, question})`：只拼 M3 没有的三样（可带路径的题目，至多 80 个码点；「附」一段；问话一段），四行用 M3 的 `PROPOSAL_LABELS` 与 `proposalLineRefusal` 查、按 M3 的段落排法拼（N27）；只查 harness 自己写的那几段，不合时抛错，§5.4。另导出两个纯函数：`personTitle(title, {limit, issuesOf})`（图上的标题进给人看的字串之前先过它，不合格返回 `undefined`）与 `displayPath(path)`（路径进题目之前的转义与截短）（F18） | `src/graph/plan-text.ts` | 新建（G4） |
| 提议式待决的四行规则 `PROPOSAL_FIELDS`、`PROPOSAL_LABELS`、`PROPOSAL_LIMITS`、`proposalLineRefusal`、`splitBold`、`renderProposal` | `src/graph/proposal.ts` | M3 第 6 步建（附录 0.5 §3.3）；G4 先开工时照附录 §3.3 原样建，M3 改成导入 |
| 换词表 `PLAIN_WORDS` 与查词函数 `plainWordsIn`（`renderPlan` 与 L2 用） | `src/graph/plain-question.ts` | M3 第 3 步建（M3 附录 0.5 §2.8）；G4 先开工时照它的内容建，M3 改成导入 |
| guard 行：经 `installRuleGate` 判定、准备上下文、按项目写流水（G1）、注册 `request_exception`、提供服务 `glmHournessRequests`、每个根 agent 一条步 notice（读人的回话、给出放行或不放行的说明、每一回合的再出示提醒、申报关闭与作废的提醒，来源 `hourness-request`，事实字段 `request: {ref, outcome}`）、行健康 | `src/guard/index.ts` | 改（G1–G4） |
| 交给指标流水的事件（拦截、影子、跟进、申报、放行；服务不在时什么都不做，§3.11） | `src/guard/metrics.ts` | 新建（G2） |
| 第三次修复之前的待决（重开计数与提议式待决的构造，纯函数）；`graph_status` 成功后调用 | `src/graph/reopen.ts`；`src/graph/tools.ts` | 新建、改（R1） |
| 图行交给循环板的一份：事件 `graph.third-reopen`（只供列出）、条目 `graph.third-rework`；每提一次待决调 `recordRun`（F11） | `src/graph/loop-entry.ts`；`src/graph/index.ts`（`apply` 里交） | 新建、改（R1） |
| env 行入口：每 agent 装两条步 notice（检查结果、环境提醒）、草稿区忽略、压制计数、交给循环板、行健康 `env` | `src/env/index.ts` | 新建，行 `glm-hourness/env`，默认禁用（E1） |
| 环境分支的读取：工具节点、`config` 行与检查行的语法、`envBranch(graph)` 返回的工具与已批准的检查（纯函数） | `src/env/branch.ts` | 新建（E2；检查行的部分 E3 加） |
| 环境提醒的渲染 | `src/env/notice.ts` | 新建（E2） |
| 服务 `glmHournessEnv` 的类型、常量 `ENV_SERVICE`、读取函数 `envService(ctx, problem?)` 与循环板要的三样：读法 `checkCommandOf(cwd, tool, check?)`（服务成员，读项目图）、纯函数 `fillCheckArgv`、`formatCheckOutput`；`EnvServiceContractCheck` 钉住类型与实现一致。循环板只导入这个文件 | `src/env/env-service.ts` | 新建（E3） |
| env 行交给循环板的一份：事件 `env.files-edited` 的声明、默认条目 `env.checks-after-edit`（`ownRules` 由常量生成、`details` 列本项目已批准的检查行）；每步算出改动文件之后先问 `listens`、有人听才经 `emit` 交事件；每次送出结果后按每个检查调 `recordRun`。循环板的接口与 M4 要的不同时只改这个文件 | `src/env/loop-entry.ts` | 新建（E3） |
| 检查行的含义与校验（纯函数）：`CheckEntry`、`checkLineRefusal`、命令行的切分 `splitArgs`、`fillCheckArgv` 的实现、哪些程序算 shell | `src/env/check-entry.ts` | 新建（E3） |
| 自带检查器的运行：选出要跑的检查、经循环板共用执行器的 `runCommand({queue: 'direct'})` 起进程（不经 shell）、并发、每步等待、后台续跑、日志、轮转、连续失败 | `src/env/runner.ts` | 新建（E3） |
| 输出解析 `eslint-json`、`tsc`、`lines`（`formatCheckOutput` 用同一份）；改动行的范围 | `src/env/parsers.ts`、`src/env/changed-lines.ts` | 新建（E3） |
| 检查结果提醒的渲染 | `src/env/check-notice.ts` | 新建（E3） |
| 压制注释计数 | `src/env/suppressions.ts` | 新建（E4） |
| 晨报：读会话所在项目的流水；拒绝与影子两处过滤改用 `classifyRecord`；影子一节带标注数与误伤数；拦截后走对的比例（另数停下交人的次数）；申报与放行；压制注释数 | `src/workflow/morning-report.ts` | 改（G1 的过滤与目录、G2、G4、E4） |
| 行健康表加 `env` | `src/shared/health.ts` 的 `HOURNESS_ROWS` | 改（E1） |
| 工具名契约 `GUARD_TOOL_NAMES = ['request_exception']`（不常驻） | `src/shared/tool-names.ts`、`tests/contracts.spec.ts` | 改（G4） |
| 行登记：`env` 行排在编排层宿主行的最后、`ui` 之前，`disabled: true`；按 `6134c83` 的做法在补丁里写 `name: dsh-hourness/env`，导出 `./env` 与 `./env/locale/*.json`，设置页的标题与说明放在 `locale/env/` | `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`packages/hourness/package.json`、`packages/hourness/locale/env/en.json` 与 `zh.json`、`packages/hourness/tsconfig.json`（随表）、`tests/contracts.spec.ts` 的字面行 id 清单 | 改、新建（E1） |
| 回归语料 | `tests/guard-corpus/cases.jsonl`、`tests/guard-corpus.spec.ts` | 新建（G2） |
| 假宿主补 rc.3 的信号：根调用的 `tool/call` 事件先于 `tools/pre-execute`（G2）、`turn/end` 与 `session/disposed`（G2）、步 notice 的 `messages` 里客户端送来的人的消息（`source: {kind: 'user', rpcId}`，G4）、`agent/pre-step` 的 `turn` 与 `step`（G4，每一回合的再出示提醒用）；已有的不重复加 | `tests/fake-rc3.ts` | 改（G2、G4） |
| 探针场景 | `scripts/probe/` 下新场景（§14.1） | 改（G1–G4、E1–E3） |

`renderPlan` 放在 `src/graph/` 而不是 `src/shared/`：公共库编进两个包，不能导入图目录的换词表；它只给编排层包用，guard 目录今天就导入图目录（`src/guard/index.ts` 导入 `src/graph/service.ts`），方向不变。

不加的东西：图节点的新字段（工具节点的配置文件写在验收条件里；检查在循环板上，§6.1；申报不留在图上，§5.8）；图引擎的权限改动（第三次修复用 M3 第 6 步的提议式待决）；问答卡（`d-chat-not-cards`）；新依赖（会话日志的 zstd 解码用 Node 自带的 `zlib`）；M4 自己的脚本执行器（用循环板的，§6.3）。配置项：env 行只有与图行同形的 `home`、`fs`；guard 行不加配置项（`home` 照旧）。

### 2.3 与其他设计的分工（什么在哪）

| 东西 | 在哪 | 归谁 |
| --- | --- | --- |
| 代码规则的模式（影子 / 生效） | `GuardRule.mode`，写在代码里，改它是一次提交 | M4。guard 行的规则、图行的 `graph-files-only`、循环板与指标流水的门、M3 的 `MAIN_AGENT_RULES`、M7 的 `EXECUTE_RULES` 都用同一个字段；M3 的按 `question-25` 直接生效；M7 的八道门首日全部 `enforce`，是对「代码里的新门禁先影子」的有意例外，转生效的办法对着 M4 的 `RuleMode` 与 `PROMOTION`（M7 0.6 §12.1） |
| 代码规则的执行（判定、拒绝、影子记录、跟进、判定出错） | `installRuleGate`（`src/guard/gate.ts`） | M4。guard 框架里装规则的行都经它装 `tools/pre-execute` 监听器，不再各写一份：guard 行、图行（G1 改）、循环板的 `loops:schedule-tools` 与 `loops:files-only`（循环板 0.6 §2.4 第 16、16a 行）、指标流水的 `metrics-files-only`（指标设计，影子）。M3 的 `installMainAgentRules` 与 M7 的 `worker-scope` 等今天各装各的监听器、用 `evaluate`：M3 附录 0.5 与 M7 0.6 都没有接「经 `installRuleGate` 安装」，G1 删掉 `evaluate` 之后这两处要改，谁后合入谁改（§3.1、§18 第 5 条）。契约测试核对（§3.8） |
| 影子记录与拦截记录的流水 | 会话所在项目的 `.llm/audit/violations.jsonl`，影子带 `mode: 'shadow'`（§2.4） | 格式已有（split 第 7 步）；M4 加 `via: 'rule'` 与跟进、申报、放行、作废四种记录，和唯一的分类函数 `classifyRecord`（§3.2）。读这份流水的代码都用它：晨报、`ruleStats`、命令行、回放的「当时拦没拦」、M7 的 `ladderProposals`、规则板的规则页 |
| 人写的规则的执行方式、检测器的影子期 | 规则板的状态与它的 `judge`（规则板自己的 `tools/pre-execute` 监听器，`prepend`） | 规则板（规则板 0.10 §2.3、§5.5、§6.2）。M4 不实现人写的规则，规则板也不经 `installRuleGate`（它的判定、排队与等待单是另一套）。规则板写进同一份流水的记录（`rule: 'rules:<id>'`）用四种取值（规则板 0.10 §10.7 M4 一节第 2 条）：`mode: 'enforce'` 拦下（有 `effect: 'block'`）算拒绝，`mode: 'enforce'` 加 `effect: 'queue'` 算排队（`deferral`，不进「违规」，N31），`mode: 'record'` 是人选的只记录（`rule-record`，不进违规数、单列计数），`mode: 'late'` 是晚到的拦下（`late-denial`，进违规数、另列一行）；`rules:` 开头的 `mode: 'shadow'` 当规则影子读。规则板只说它需要的取值，格式与分类归 M4（§3.2）。M4 的标注与统计照样处理这些记录；规则页上「人标过的误判数」取 `ruleStats` 对 `labels.jsonl` 的结果，规则板不另存标注，`hits.json` 只是每天的命中次数。`PROMOTION` 与周报阶梯只管代码里 `mode: 'shadow'` 的规则，规则板条目的 `record` 与 `enforce` 由人选。规则板的监听器第一件事调 `observe`（§3.3），拒绝与开单拒绝时调 `noteDenial`（规则 id 为 `rules:<id>`，没有 `rightPath`），所以 guard 规则拦截之后下一次调用被规则板拦下时跟进记录不漏；规则板 0.10 已采纳这两项（M4 不在时不调，规则板的验收只覆盖经它自己的门的拦截）。在 M4 的 `classifyRecord` 合入之前，规则板的晨报一节（R7）自己数 `record` 与 `late` |
| 标注、精确率与召回率、回放、回归语料 | `src/guard/measure.ts`、`replay.ts`、`corpus.ts` | M4 |
| 影子转生效的判据数字 | `PROMOTION`（`src/guard/measure.ts`） | M4 定数与含义（§3.5）。M7 0.6 §12.1 已按 `RuleMode` 与 `PROMOTION` 写代码里的门的转生效；它的 §3.12.2 周报阶梯今天仍写「近 14 天影子记录不少于 20 条，且人没有标过误判」，数字与 M4 相同、含义不同（M4 数的是带标注的会拦样本，含回放；14 天是实时影子从第一条记录起的时长），M7 在 P2 开工之前改为引用 `PROMOTION` 并采用 M4 的含义（M7 0.6 §18.2 R4-F10，§18 第 5 条） |
| 何时提议转生效、问人 | 周报阶梯 `ladderProposals` | M7。M7 合入之前由编排者按 `stats` 的输出手动提 |
| 代码规则目录 | `src/guard/catalog.ts`（`GUARD_RULES`）；M3 的 `src/guard/main-agent-rules.ts`（`MAIN_AGENT_RULES`）；M7 的 `src/guard/execute-rules.ts`（`EXECUTE_RULES`） | M4 管 `GUARD_RULES`，M3、M7 各管自己的表。规则板 0.10 §10.1 的 `src/rules/builtin.ts` 导入这三张表并映射成 `CatalogEntry`（id 写成 `<行>:<规则 id>`，`mode` 取表里的），自己只另加 `rules:files-only`、默认规则与四条附属条目；先合入的一方建文件，后到的一方导入（§3.8） |
| 草稿区的位置与清单 | `SCRATCH_DIR`、`scratchLeftovers`（`src/guard/scratch.ts`） | M4。M7 汇合门禁在第 4 步之后加一步「草稿区为空」，不为空时拒绝 `scratch_left`（列文件，正路「删除或转正：移进 `scripts/`、挂节点、写明用途」）；M7 §11 的「等 M4 定草稿区」由此解除 |
| 汇合门禁跑的命令 | 规范节点 `norm-merge-gate` 的验收条件 | M7 |
| 每次改完跑的检查 | 两种（§6.1）。M4 自带的检查器：环境工具节点上人批准的检查行，env 行在改了文件的那个 agent 的下一步之前执行，在循环板上是 env 行交来的一项 `self`。人加的检查：循环板上人的普通条目，动作 `check`，命令原文取自同一个工具节点的检查行，由循环板的执行器跑 | 条目的形状、事件表与筛选、存放（仓库）、提议与同意的路径（同意时给人看命令原文）、页面、执行器（`runScript`、`runCommand`）归循环板（`design-context.md` 的接缝裁定与「Check entries seam」；循环板 0.6 §2.3、§5.3、§6.6、§7.1）。归 M4 的：环境工具节点与检查行的格式、事件 `env.files-edited` 的声明与载荷、自带检查器的运行与结果怎样交给 agent、命令的读法与两个纯函数 |
| 条目的形状、事件表、脚本执行器；哪些事件拦路、脚本结果怎样进 `checkCall` | 循环板（`Trigger`、事件表、筛选、执行器，一个共用模块）；规则板（拦路的含义） | 循环板与规则板。M4 的检查不拦任何调用，不是拦路的事件，所以只用循环板那一半；M4 的四条代码规则不是板上的条目；M4 导入循环板的 `matchesFilter`（筛选的比法）与 `runCommand`（自带检查器的进程，`queue: 'direct'`） |
| harness 写给人的方案文字的四行（题目，背景、推荐、疑问、不做） | `src/graph/proposal.ts`（M3 附录 0.5 §3.3） | M3。M4 的申报文字用它的 `PROPOSAL_LABELS` 与 `proposalLineRefusal`，`src/graph/plan-text.ts` 只加可带路径的题目、「附」与问话三样（N27）；第三次修复是一张提议式待决，由 M3 的 `propose_to_human` 渲染给人看（§4.6）。格式再改只改 `proposal.ts` 一处 |
| 原样再给人看一张已有的提议式待决（不写图，记进这一条回复的件数） | `propose_to_human {kind: 'question', question}`，不带题目与四行 | M3（附录 0.5 §3.4 已有这一种，含对 `loops:`、`rules:` 提议再问一次 `attachable`）。第三次修复要它；循环板「有事等你太久时再说一次」也要它。今天的引擎对什么都没改的 `edit` 返回 `invalid`（`set changes nothing`，`src/graph/engine.ts`:613〔实读〕），所以不能用 `edit` 凑 |
| 卡片、卡片回答的解析、以人的身份写图 | 不用 | M4 0.2 用 M3 的这几个函数出申报卡；`d-chat-not-cards` 之后申报在对话里问，人的回话由 harness 直接读，图不参与授权，所以 M4 不再导入 M3 的 `src/design/cards.ts`、`human-writes.ts`，也不再要求把它们移到 `src/graph/human-card.ts`（§18 第 5 条撤回给 `m3` 的那条批注） |
| 派发链的根 `dispatchRoot`；图行服务的 `focusOf` | `src/guard/main-agent.ts`；`src/graph/service.ts` | M3。申报用 `dispatchRoot`；`focusOf` 只用来在申报文字的背景一行写出焦点节点的标题，读不到时省去这半句 |
| 主 Agent 不写文件、设计期只读 | `main-agent-no-write`、`design-before-release` | M3 |
| 会丢工作的 git 命令先存快照（`d-main-agent-shell` 定稿） | `src/guard/git-snapshot.ts`（M3 附录 0.5 §2.5，M3 第 4 步） | M3（主 Agent 自己的 shell 调用）；子 agent 的 git 归 M7 的派发。M4 的规则不判 git：file-tools-only 今天就放行 git 命令（§5.2 的例外文案照旧写明），G3 的四条影子规则只看文件工具、读工具的路径与凭证提及。M4 要求快照门与别的门共用跟进：监听器第一件事调 `observe`，存不了快照而拒绝时调 `noteDenial`（规则 id `git-snapshot`）；M3 附录 0.5 没有加这两行，留给 M3 的对齐（`m3` 节点 2026-10-30T11:30Z 的批注），加之前快照门拒绝之后的跟进量不到；它的拒绝记录不带 `mode`，`classifyRecord` 算拒绝；快照记录在项目的 `.llm/snapshots.jsonl`，不进违规流水（§3.3、§18 第 5 条） |
| 必须全审的改动 | `norm-review-floor`（harness 按改动的文件与命令判断） | M7 执行。M4 的 G1–G4、C1，以及之后每一次改规则的模式、改可申报名单、改同意词表，都落在清单上（§13） |
| 设计放行之后谁推进、子 agent 用什么模型 | 主 Agent（`d-auto-drive`、`d-main-agent-models`） | M7。M4 只写哪几处必须停下问人（§13） |
| 子 agent 只写写入范围 | `worker-scope` 等 | M7。worker 写出了项目时，`worker-scope` 向 guard 行的服务要编号（`outsideDenial`）、先查放行（`peekGrant`）；写项目里但出了工作树的文件由 `worker-scope` 自己纠偏（M7 0.6 §3.2.1），不要编号；核对与用掉放行仍只在 guard 行（§5.6、§5.9，F13、F19） |
| 申报开着时停下自动推进、关了恢复 | M7 的推进监听器读 `openRequests(持有者会话)` | M7（`goals.block`，原因码 `hourness-waiting-human`，M7 0.6 §3.9.5）；M4 只给读取函数（§5.9，F14） |
| 人在面板上拍板 | 不用 | `d-ui-look-not-operate`：面板只看不操作；申报不经面板 |
| 面板「需要你」里的开着的申报 | 会话日志：`request_exception` 的 `ask` 结果与 `hourness-request` 提醒的 `request` 事实字段 | 面板（plain-ui 0.7 §4.3 的 (b) 一类，现场投影 `graphLive`）；M4 只保证开与关都写在会话日志里（§5.8，F15） |
| 系统看得到的数统一记进一份事件流水（`metrics`，已批，设计进行中） | 指标设计（0.2，与本稿同批对齐） | M4 的记录照旧写违规流水，每一行经 `classifyRecord` 都能归类；指标服务在时另交事件（§3.11）。事件的字段由指标设计定 |
| guard 声明里规则板的一行 | `glm:guard` 节 | 规则板 §6.4；M4 只让影子规则不进声明 |

### 2.4 存放：属于项目的进项目（`d-rules-in-repo`）

人定：规则、开关、人加的循环板条目与它们的脚本进仓库；在等的工作、计数、心跳、变更记录、违规流水、指标流水这类运行时的东西进项目自己的 `.llm/`，不进 git；全局只留 GLM 登录凭证、ZCode 设备号、人设、整个账号的额度与用量、DSH profile 里的插件配置（`design-context.md`「Both boards are hook-style; storage scope」）。M4 的每样东西：

| 东西 | 在哪 | 进 git 吗 |
| --- | --- | --- |
| 人加的检查条目（与改完文件就跑的脚本条目） | 循环板的仓库文件 `docs/loops/`（循环板 0.6 §9，只由循环板写；M4 不读也不写） | 进 |
| 环境分支与工具节点（用途、用法、选择理由、安装位置、`config` 行、`check` 检查行） | 项目图 `docs/graph/`（或项目自己的图目录） | 进 |
| 代码规则的模式、规则目录 | 代码（`GuardRule.mode`、`src/guard/catalog.ts`） | 进（本插件的仓库） |
| 回归语料 | `tests/guard-corpus/`（只在本仓库，脱敏的单条样本，D2） | 进 |
| 违规流水、标注 | 项目的 `.llm/audit/violations.jsonl`、`labels.jsonl` | 不进 |
| 回放结果 | 项目的 `.llm/guard-replay/<时间>/` | 不进 |
| 放行之前的备份、过长的参数 | 项目的 `.llm/requests/<编号>.before`、`<编号>.call.json` | 不进 |
| 检查日志 | 项目的 `.llm/env-checks/<会话 id 前 8 位>/` | 不进 |
| 压制注释计数 | 项目的 `.llm/audit/suppressions.jsonl` | 不进 |
| 草稿区 | 工作区（或 worker 工作树）的 `.llm/scratch/` | 不进 |
| 申报、放行、跟进的待判、检查结果的后台缓存 | 只在内存 | — |
| 用户级（全局） | M4 什么都不存。M4 读两样别人的全局数据：凭证文件的路径（`credential-read` 判提及，不读内容）与 DSH 的会话日志（回放，D2） | — |

「项目的 `.llm/`」怎样定：`projectHomeFor(ctx, configHome, cwd)`（`src/shared/data-home.ts`，G1）依次取行配置的 `home`（探针、测试与人显式指定时）；会话工作目录所在项目根下的 `.llm`，项目根由 `src/data/project-root.ts` 的 `projectOf(cwd)` 算（从 `cwd` 往上找 `.git`，M7 的工作树归到它的主检出，同规则板 §7.3、循环板 §2.1；这个模块已在 main，仓库里只有这一份）；会话没有工作目录或不在 git 仓库里时取数据行的 `projectHome`；都没有就不落盘，行健康照今天写「无项目目录，违规不落盘」。命令行（`npm run -s guard`）按 `--home`，否则按当前目录算同一个项目根。下文的「项目目录」（`<项目目录>/…`）都指这样定出的项目的 `.llm/`。

为什么改：0.3 与今天的代码把流水写进数据行配置的一个固定目录（`src/memory/audit.ts`:44–47 的 `projectHome`），一台机器上所有项目的拦截都进同一个文件，晨报与统计把别的项目的数也算进来；按会话找项目之后，每个项目的晨报只数自己的，换电脑或换人时项目的定义随仓库走，运行时的记录留在本机的项目目录里。

写进一个项目的 `.llm/` 之前，guard 行与 env 行先调 `ensureLlmIgnored(项目根)`（`src/shared/llm-ignore.ts`，它用 `src/data/project-root.ts` 的 `ensureIgnored` 追加并自己复核，§7.3），每个进程每个仓库一次：项目已经忽略 `.llm/`（接管项目时已加，本仓库 `.gitignore:3`）时什么都不做；没有时在 `.git/info/exclude` 末尾追加一行 `.llm/`，随后用 `git check-ignore -q` 复核。它写不进（抛错）或复核仍未忽略时照常写记录（记录不能丢），行健康降级并写明「项目的 .llm/ 没有被 git 忽略：<原因>」。

关于人本人的记忆留在用户级，项目经验（含通用的踩坑经验）都在项目里，新项目重新学（`d-memory-scope`，人「全都没问题」）。M4 不存经验与记忆，这一条不改 M4（评审第 4 轮 N36）。

### 2.5 高峰（`d-main-agent-peak-exempt`）

人定：主 Agent 不受高峰模式影响，任何一档都随时回话；高峰模式只管子 agent（少做的并发上限、不做的排队）与重活（练习题、消融、大的审查）。M4 对照：

- M4 不加任何高峰判断，不读档位，不让任何东西等高峰：申报、读人的回话与放行、第三次修复的提问、拒绝与跟进的记录，任何一档都照常。
- 改完文件就跑的检查是本机进程，不发 GLM 请求，不算重活，任何一档都照跑；它们跑在改了文件的那个 agent 的下一步之前，那个 agent 若是被规则板排队的 GLM 子 agent，它本来就不走步，检查也不会跑。人加的检查由循环板的执行器跑，同样不花 GLM，要不要挪开归循环板与规则板（循环板 0.6 §6.9），M4 不管。
- `npm run -s guard -- replay`、`stats`、`corpus add` 只读本机文件，不花 GLM。
- 练习题 K1（§13.1）是重活，按规则板的自报重活挪到高峰之后（规则板 0.10 §3.6），M4 不另写。
- 申报开着时 M7 停下自动推进（§5.9），原因码是 `hourness-waiting-human`，与高峰等待的 `hourness-peak-wait` 分开：高峰结束时循环板的「高峰结束」一项只恢复后一种，等人的那一种在申报关闭时由 M7 恢复。

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
/** `ref`: the request ref this denial carries (§5.2; M7's worker-scope through outsideDenial, §5.6); written into the ViolationRecord. */
export interface RuleDeny { readonly rule: string, readonly correction: Correction, readonly ref?: string }

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
7. `denies` 仍非空：每条拒绝写一条 `ViolationRecord`（一次调用被两条规则拒绝就是两条，各算各的规则；`RuleDeny.ref` 有值时写进记录的 `ref`）；`noteDenial` 记下模型读到的那一条（第一条）供跟进；返回 `deny`，理由是第一条的纠偏。
8. `decision = await next()`。`decision.kind === 'allow'` 时：消耗第 6 步的放行（§5.6）；对 `shadows` 里每一项写一条 `RuleShadowRecord`；调 `allowed`。内层不放行（别的监听器拒绝、`ask`、`cancel`）时不消耗放行、不写影子记录：调用本来就没执行，影子规则没有改变结果。

`installGraphFileGuard` 在 G1 改为调用 `installRuleGate({row: 'graph', prepend: true, rules: …})`，纠偏、记录与先后不变。循环板的 `loops:schedule-tools` 与 `loops:files-only`（循环板 0.6 §2.4 第 16、16a 行；它们的写法仍是 `GuardRule`、`evaluate`、`renderCorrection`，G1 删掉 `evaluate` 之后要改经 `installRuleGate`，N32）和指标流水的 `metrics-files-only` 同样经它安装（谁后合入谁改）。M3 的 `installMainAgentRules` 与 M7 的 `worker-scope` 等门（`prepend` 注册，今天用 `evaluate`）也要改，但 M3 附录 0.5 与 M7 0.6 都没有接这一条（`m3` 节点的批注留给 M3 的对齐轮；M7 0.6 §18.2 写明 M4 的 G1 合入时谁后合入谁改）：这两行改经 `installRuleGate` 之前，它们的拒绝照原样写进违规流水（不带 `mode`，`classifyRecord` 算拒绝），影子判定与跟进只覆盖经 `installRuleGate` 的规则；它们改完之后契约测试把这两行也纳入标记核对。`tests/contracts.spec.ts` 核对：`GUARD_RULES`（§3.8）里所在行不是 `guard` 的规则，所在行的入口经 `installRuleGate` 安装（L2：在假宿主上装各行，`tools/pre-execute` 的监听器都来自 `gate.ts`，做法是 `installRuleGate` 给它装的每个监听器打一个模块私有的标记，测试按标记数）；M3、M7 两张表的规则暂时只核对 id 在各自的表里、违规流水里出现的 `rule` 都在三张表之一。

声明：`declarationSection` 只列 `mode` 不是 `shadow` 的规则（`src/guard/index.ts`）。影子规则不告知模型：它不拦，告诉模型「会被拒绝」不是真的；转生效时声明随之多一行，这是所有路由上的一次提示词改动，转生效的那一问要写明这一点（摘要 §4 第 2 条）。

### 3.2 判定与记录

guard 行（`src/guard/index.ts`）改为调用 `installRuleGate({row: 'guard', prepend: false, rules, journal, grants, allowed, health})`（普通注册，位置同今天）：

- `rules(payload, call)`：取路由与 `face`、取圈禁根（不变）；准备判定上下文（§4.1，只有涉及文件或 shell 的调用才读文件系统）；返回 `activeRules(...)`；同时按今天的 `guardHealth` 报行健康。
- `grants`：申报通道的放行簿（§5.6，G4 起）。圈禁拒绝时，`ViolationRecord` 带这次的 `ref`（G4 起）。
- `allowed`：交给工作区变更兜底（不变）。
- `journal`：`projectJournal('guard', …)` 按这次调用所在会话的工作目录找项目（§2.4），写那个项目的流水；图行与经 `installRuleGate` 的其他行同样按会话找项目。

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
export type RecordClass = 'denial' | 'late-denial' | 'deferral' | 'rule-shadow' | 'rule-record' | 'fallback-shadow' | 'followup' | 'request' | 'grant' | 'grant-void' | 'unknown'

/**
 * One journal line's class. `kind` present: that kind ('followup', 'request', 'grant', 'grant-void'; any other kind is 'unknown').
 * No kind: `mode: 'shadow'` with `paths` is the workspace-change fallback, `mode: 'shadow'` otherwise a rule's shadow
 * (guard framework or rules board). With a `rule` that starts with `rules:` (only the rules board writes those): `mode: 'record'`
 * is a record-only action the human chose ('rule-record': not a violation, counted on its own), `mode: 'late'` is a block that
 * came after the script's timeout ('late-denial': a violation, listed on its own line), `mode: 'enforce'` with `effect: 'queue'`
 * is a deferral (the rules board queued the call, e.g. peak hours under 不做). Otherwise no `mode` or `mode: 'enforce'` is a denial.
 * `record` and `late` on a rule that does not start with `rules:`, and anything else, are 'unknown': counted and reported as an
 * unreadable line, never as a denial.
 */
export function classifyRecord(line: Readonly<Record<string, unknown>>): RecordClass
```

晨报的两处过滤、`ruleStats`、命令行的 `records` 都用它；M7 的 `ladderProposals` 与规则板的规则页读流水时同样用它（§2.3）。`late-denial` 同 `denial` 进「违规」，晨报另列一行，`ruleStats` 当拒绝统计；`rule-record` 不进「违规」，晨报单列「只记录 n 条」，`ruleStats` 当规则影子统计（标注的含义同影子记录，§3.4）；规则板在 M4 的 `classifyRecord` 合入之前自己数这两种，合入之后可以改用它，数字不会分叉（规则板 0.10 §10.7 M4 一节第 2 条）。`deferral` 不进「违规」、不进 M4 的统计，由规则板的晨报一节（规则板 R7）去数（评审第 3 轮 N31：规则板 0.10 §10.5 的记录带 `effect`，高峰不做档下 GLM 会话的调用记为 `mode: 'enforce'`、`effect: 'queue'`，0.3 的分类会把它写成「违规」）。G1 改晨报的过滤并加 L2：一条 `FollowupRecord` 与一条 `GrantRecord` 不增加「违规」计数；一条 `mode: 'enforce'`、`effect: 'block'` 的规则板记录算拒绝；一条 `mode: 'enforce'`、`effect: 'queue'` 的算排队、不算拒绝；一条 `rule: 'rules:p-1'`、`mode: 'record'` 的算只记录、不算违规；一条 `rules:` 开头、`mode: 'late'` 的算晚到的拦下、算违规；一条 `rule: 'x'`（不以 `rules:` 开头）、`mode: 'late'` 的算读不懂；一行 `{"kind": "x"}` 算读不懂、不算拒绝。

记录的键：`recordKey(line)` 是这一行 JSON 文本（不含换行）的 SHA-256 前 12 位十六进制。流水只追加不改写，所以键稳定；旧记录也有键，不需要改格式。

规则板的记录（规则板 0.10 §10.5、§10.7：`rule: 'rules:<id>'`、`mode: 'enforce' | 'record' | 'late'`，0.9 的 `shadow` 已改名 `record`，`effect: 'block' | 'queue'`）在同一份流水里，同样有键、能标注、进统计。规则板写这些记录经 M4 的 `projectJournal`（跟着搬到项目的 `.llm/`，§2.4），键用 `keyOf(record)`（§2.2），`noteDenial` 的 `key` 就是这一个。

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

跨行（评审第 1 轮 F5）。每个经 `installRuleGate` 装的监听器对根调用第一件事就调 `observe`；waterfall 从外往里走，最外层的监听器先看到这次调用并结算，之后的监听器对同一个 `callId` 什么也不做（记录器记着最近 512 个已结算的 `callId`）。下一次调用被外层的 `graph-files-only`、M3 的规则拒绝，guard 行看不见它，跟进照样由外层结算。不用 guard 框架的两个监听器也接同一个记录器：第一件事调 `observe`，拒绝时调 `noteDenial`。一是规则板的工具调用门：`observe(agent, call, callId)`，拦下与开单拒绝时 `noteDenial(agent, callId, {rule: 'rules:<id>', call, key, origin})`，没有 `rightPath`，`key` 是它写下的那条拒绝记录的 `keyOf`（§2.2）；晚到的拦下（`mode: 'late'`）不调，那次调用早已放行执行。规则板 0.10 §10.7 M4 一节第 3 条采纳了这两项（只这两项），M4 的 `gate.ts` 不在时它不调。二是 M3 的 git 快照门（规则 id `git-snapshot`，只在存不了快照时拒绝，`rightPath` 为同一条 git 命令，M3 附录 0.5 §2.5）：M3 附录 0.5 没有加这两行，留给 M3 的对齐轮，§18 第 5 条请它加。没加之前，§1.2 的验收只覆盖经 `installRuleGate` 的拦截与规则板的门（评审第 2 轮 N26）。

模块级的状态在各行之间共用：编排层包由 `tsc` 逐文件输出（`packages/hourness/tsconfig.json`，不打包），guard、图、设计各行导入的是同一个 `dist/guard/followup.js`，Node 对同一个文件 URL 只有一个模块实例〔推断：DSH 加载行时不给模块地址加查询串；L3 场景 `guard-followup` 核对图行拒绝之后的跟进记录，若各行拿到的是不同实例，这条记录不会出现〕。

结算时 `followupOf(denied, next, rule)` 给出：

| 结果 | 条件 |
| --- | --- |
| `repeat` | 同一原生工具、参数摘要相同（两边都按拆开之后的比） |
| `right-path` | 规则的 `rightPath(next, denied)` 为真 |
| `other` | 其余 |
| `none` | 拦截之后，这个 agent 的回合结束（会话事件 `turn/end`，agent-loop:1029〔实读〕）或会话卸载（`session/disposed`，session:1929–1933〔实读〕）时，还没有下一步的调用（评审第 2 轮 N15）。子 agent 交回结果、人不再说话，都在这里结算 |

各规则的 `rightPath`：file-tools-only 是下一次调用为文件工具的写入（`write`、`edit`、`str_replace_editor` 除 `view` 外）；圈禁是 `request_exception` 带这次的编号（GLM 上经包装，拆开之后判），或目标在工作区内的文件工具写入；`graph-files-only` 是图的写工具；M3、M7 的规则各自写自己的 `rightPath`，不写就只得到 `repeat`、`other`、`none`。拒绝方在 `installRuleGate` 第 7 步经 `noteDenial` 记下待判，所以凡经它安装的规则都自动有跟进，不需要各行另接。

有几种拒绝的正路就是停下：普通子 agent 被圈禁拒绝后把编号写进结果交回（§5.2）；file-tools-only 的例外是「在回复里说明」。这些做对了的情形结算成 `none`。M7 的 worker 被拒之后的下一次调用是 `ask_main`，不是「没有下一步」：被记下的拒绝是 `worker-scope` 的，结算用它的 `rightPath`，M7 的 `rightPath` 认带编号的 `ask_main` 时记 `right-path`，M7 加这一条之前记 `other`（评审第 4 轮 N41）。所以 `none` 不进「走对」的分母：晨报写「走对 x/y（另有 n 次停下来交给人或上级）」，`y` 是 `right-path`、`repeat`、`other` 之和，`n` 是 `none`（评审第 3 轮 N30）；`ruleStats` 的四类计数不变。

写一条 `FollowupRecord`（§3.2）。内存表按 agent 至多一条、全表至多 256 条（最早的先出）；进程重启丢失未判的那几条，记录少几条，不影响别的。

L2：

- 连续两次写图文件都被 `graph-files-only` 拒绝，留下恰好一条 `outcome: 'repeat'` 的跟进记录；guard 拦截之后下一次调用被一个外层的测试规则拒绝，同样留下一条。
- 晨报：三条 `right-path`、一条 `other`、两条 `none` 写成「走对 3/4（另有 2 次停下来交给人或上级）」。
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
| 拦截（含规则板晚到的拦下）、规则的影子记录（含规则板人选的只记录）、回放里「会拦」的调用 | `right` / `wrong` / `unsure` | 拦下它对不对（只记录的，是「要是拦下了对不对」） |
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

达到判据：带标注的「会拦」样本（实时影子加回放）至少 20 条；实时影子从第一条记录起至少 14 天；`wrong` 为 0（`unsure` 的条数写进问人的那段话里，由人判断）。这里是唯一出处。判据与周报阶梯只管代码里 `mode: 'shadow'` 的规则；规则板条目的 `record` 与 `enforce` 由人在规则板上选，不走阶梯，`ruleStats` 照样给它们的数，模式一栏写 `record`、`late` 或 `enforce`。M7 §3.12.2 今天写的是「近 14 天影子记录不少于 20 条，且人没有标过误判」：数字相同，含义不同（它数的是近 14 天的影子记录，不论有没有标注，也不含回放）。M7 那一行改为引用 `PROMOTION`，采用这里的含义：没有标注的记录不能证明没有误伤，回放的样本能让人不必干等 14 天的数量，而 14 天的实时影子保证规则在真实会话里跑过（§18 第 5 条）。

转生效的过程：M7 的周报阶梯在达到判据时提一张决定者为人的待决，主 Agent 在对话里按四行的方案问人（`d-chat-not-cards`；M7 的模板随之改），方案里写明所有路由的系统提示词会多一行声明；人同意之后，主 Agent 派一个任务：改代码里的 `mode`、把规范节点的 `模式：` 改为 `生效`、把标注过的样本加进回归语料，提交信息引用那张待决。这次提交改的是 guard 规则，按 `norm-review-floor` 全审。降回影子同样要人拍板。M7 合入之前，编排者看 `stats` 的「达到判据」一列手动提同样的待决。

`credential-read` 按设计一直是影子：它的目的是看见谁读了凭证，不是挡住排查登录问题的正常读取（§4.2），所以它的规范节点写「只记录，不转生效」，阶梯跳过它。

### 3.6 回放（离线影子，人已定 D2 选 B）

用今天的规则重判本机 DSH 会话日志里的历史工具调用，不等实时数据攒够。人 2026-10-30 回「不介意」（`m4` 2026-10-29T17:33Z 的批注），边界照他同意的写：只读工具调用的命令文本与路径，不读对话正文；结果留在 `.llm/`；只有脱敏的个别样本进 `tests/guard-corpus/`。判定另要三样元数据，不是对话正文也不是工具输出，写明在下面并写进一页放行稿：当时用的哪个模型（判来源）、会话在哪个目录（圈禁根）、这次调用有没有报错（一个布尔值）。0.3 还读出错结果的前 120 个字符来判「当时拦没拦」，出错的 shell 调用的结果就是命令的输出，可能有文件内容或密钥，超出了人同意的那一句（评审第 3 轮 F16），0.4 删掉，改从项目自己的违规流水对。

- 日志：`<DSH home>/sessions/<工作区>/session-<id>/session.v4.jsonl.zstd`（或不压缩的 `.jsonl`，session-persistence-jsonl:750–756）。默认只读会话头 `cwd` 经 `projectOf` 归到目标项目的会话（M7 工作树里的会话算主检出那个项目）；`--sessions` 另给目录时，目录里的会话同样按这一条筛；因属于别的项目而跳过的会话数写进 `summary.json`。结果写在目标项目的 `.llm/` 里，别的项目的命令文本不落进它（评审第 4 轮 N39）。压缩文件是一串独立的 zstd 帧，每帧是若干行 JSONL（session-persistence-jsonl:1138–1230 的逐帧解码器）。Node 自带的 `zlib.zstdDecompressSync` 对整文件只解出第一帧，所以 `decodeSessionLog(bytes)` 按帧头魔数 `28 b5 2f fd` 切开逐帧解码〔本机实测 2026-10-29：本仓库工作区最大的一个日志 5.7 MB、3,397 帧全部解码成功；全机 719 个日志〕。解码失败的帧跳过并计数。
- 读哪些事件、哪些字段（D2 的边界，`src/guard/replay.ts` 在解码的同一处丢掉其余内容，不进内存里的条目）：
  - `tool/call` 的 `data {turn, step, callId, name, arguments}`（agent-loop:681–690）。参数只留规则读的路径与命令：`file_path`、`path`、shell 的 `command`、`terminal_send` 的 `text`、`str_replace_editor` 的 `command`（子命令名）。`content`、`old_string`、`new_string`、`file_text`、`old_str`、`new_str` 等写入的内容一律丢掉。
  - `tool/result` 只读 `data.message.toolCallId` 与 `data.message.isError`（布尔值）；`content` 在解码的同一处丢掉，不进内存里的条目，不比较、不留存、不输出。
  - `request/header` 的 `data.header.config.model`（agent-loop:1226–1240），只用来判来源；会话头的 `cwd`，只用作圈禁根。
  - 每个事件的时刻（日志行的时间字段），只用来与违规流水对时。
  - 用户消息、助手消息、思考块、工具结果的文字与各插件的提醒一概不读。〔本机实测：上面的字段名与日志一致〕
- 拆包：GLM 会话里延迟工具的调用在日志里记的是模型发出的 `DeferredToolCall`，目标在参数 `{name, input}` 里（`docs/DESIGN.md` §5.5、§5.10；内层调用经 `tools.execute` 执行，不经 agent loop，不产生 `tool/call` 事件）。回放先经 `unwrapDeferredCall` 拆开（名字取 `name`、参数取 `input`，再按上一条只留路径与命令），再判定；`summary.json` 记拆开的条数与形状不对、拆不开的条数。
- 判定：调用名经静态别名表 `ZCODE_ALIAS_NATIVES` 换成原生名（历史里没有方言服务；表与 3.17.1 一致，见文件头）；来源按当时最近一个请求头的模型：`glm` 开头记 `dialect`，否则 `other`；圈禁根取会话头的 `cwd`；每条 guard 框架的规则（不论模式）判一次。要读写入内容或当时文件系统的规则不判：`suppression-reason` 要数新增的压制注释，得读写入的内容，D2 的边界不许，回放跳过它；`scratch-only` 要知道目标当时存不存在，同样跳过；两者的跳过条数进 `summary.json`。`credential-read` 只按读工具的路径与 shell 文本判。
- 历史结果：从这个项目的违规流水对（同一项目目录，§2.4）。流水里有一条拒绝记录（`classifyRecord` 为 `denial`），它的 `sessionId` 等于这个会话的 id、`tool` 等于这次调用的名字（模型调用的名字，GLM 会话里是别名；经 `DeferredToolCall` 的按拆开之后的名字）、`at` 与 `tool/call` 的时刻相差不超过 2 秒，就记 `historical: 'denied'`；`isError` 为假记 `'allowed'`；`isError` 为真而对不上记录记 `'unknown'`（当时出错的原因不是 guard，或那时的记录没有会话 id、没落盘）。同一条拒绝记录至多对上一次调用（取时刻最近的那次）。`summary.json` 按规则与来源给出三种的条数。
- 输出：`<项目目录>/guard-replay/<时间>/replay.jsonl`，每条 `{key, at, rule, mode, scope, route, tool, call, historical, session}`，`call` 是 `CallSubject`（命令文本至多 8 KiB，或解析后的目标路径），`historical` 是 `denied`、`allowed`、`unknown` 之一，`key` 是 `<会话 id>:<callId>:<规则>` 的 SHA-256 前 12 位；另写 `summary.json`（按规则与来源的条数、拆包与跳过的条数、`historical` 三种的条数）。命令行默认只打印 `summary`，不打印命令原文。
- L2（F16）：夹具日志里一个出错的 `tool/result` 的文字带一个标记串，回放的内存条目、`replay.jsonl` 与 `summary.json` 里都找不到它；夹具流水里一条同会话、同工具、相差 1.5 秒的拒绝让那次调用记 `denied`，相差 3 秒的记 `unknown`。
- 只读：不写 `~/.dsh` 下的任何东西；输出只写项目目录（工作区的 `.llm/`，已被 git 忽略）。进仓库的只有经 `corpus add` 脱敏的单条样本（§3.7）。

设计期的一次试算〔本机实测 2026-10-29，只统计条数；读的是全机的日志，不按项目筛，默认的回放按项目筛，条数会少〕：719 个日志里有 1,004 次 shell 调用（GLM 路由 892 次、其他路由 112 次）；今天的 file-tools-only 会拦其中 115 次（GLM 85、其他 30），命中最多的是 `Set-Content`（86 次）；当时的旧检测拦过 66 次，其中 21 次今天不会再拦（引号感知之前的误判）。另有 36 次调用的参数提到凭证文件或 `GLM_HOURNESS_CREDENTIAL_SECRET`（`pwsh` 27、`write` 7、`edit` 2）；`write` 与 `edit` 的 9 次是写入的内容里提到，按 D2 的边界回放不再读它们，只数 shell 的 27 次与读工具的路径。

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

`src/guard/catalog.ts` 导出 `GUARD_RULES: readonly {id, row, mode, title}[]`，列出 guard 框架里装规则的行的全部规则：guard 行的六条（`workspace-containment`、`file-tools-only`、§4 的四条）、图行的 `graph-files-only`、循环板的 `loops:schedule-tools` 与 `loops:files-only`、指标流水的 `metrics-files-only`。`id` 是规则对象自己的 id，`row` 是装它的行（`guard`、`graph`、`loops`、`metrics`），`mode` 取规则对象自己的字段，不另写一份；循环板与指标流水的规则随它们的步登记，后合入的一方在自己的那一步加。M3 的八条在 M3 自己的 `MAIN_AGENT_RULES`（`src/guard/main-agent-rules.ts`，M3 附录 0.5 §3.11），M7 的门在 M7 自己的 `EXECUTE_RULES`（`src/guard/execute-rules.ts`，M7 0.6 §12.1，首日全部 `enforce`），它们各管各的表，`GUARD_RULES` 不列。

规则板「写在代码里的规则」一节读这三张表（规则板 0.10 §10.1，§10.7 M4 一节第 1 条）：`src/rules/builtin.ts` 导入它们并映射成 `CatalogEntry`，id 写成 `<行>:<规则 id>`（guard 行的是 `guard:workspace-containment` 一类，M3 的是 `design:<id>`），`mode` 取表里的，不另写一份；自己只另加规则板的 `rules:files-only`、默认规则 `builtin:glm-peak-pricing` 与它的四条附属条目。所以 M4 的四条影子规则在规则页上看得到，按影子规则写「只记下，不挡」并标「项目编排带来的 · 只能看」（`d-rules-visible`、`d-defaults-readonly`）；它们是代码里的规则，不是板上的条目，`d-boards-as-hooks` 不改它们，规则板的 `mode: 'record'` 是人在板上条目里选的做法，与这里的 `shadow` 是两回事。先合入的一方建 `catalog.ts`，另一方导入。

`tests/contracts.spec.ts` 加三条：三张表合起来 id 不重复，并与各行实际装上的规则一致（加了规则忘了登记就失败；违规流水里出现的每个 `rule` 也都在三张表之一，`rules:` 开头的除外，那是规则板的）；`GUARD_RULES` 里所在行不是 `guard` 的规则，各行装规则都经 `installRuleGate`（§3.1 的标记），一条 `mode: 'shadow'` 的测试规则交给图行的安装路径时留下影子记录、不拦截；本仓库图上每个带 `规则：` 标签的规范节点，列出的规则都在三张表里，`模式：` 与代码一致；表里每条规则恰好出现在一个规范节点里。规范节点分两批提议（§18 第 3 条）：已有的三条规则在 G1 合入之前，四条影子规则在 G3 合入之前，所以这条测试在每一步合入时都成立（评审第 2 轮 N21）。M3 与 M7 的两张表合入之前，测试只核对已有的表。

### 3.9 命令行

`npm run -s guard -- <命令>`（`scripts/guard/cli.mjs` 经 `--experimental-strip-types` 跑 `src/guard/cli.ts`，只用 Node 内置模块，同项目图的命令行）。项目目录按 `--home`，否则 `<工作区>/.llm`。

| 命令 | 作用 | 退出码 |
| --- | --- | --- |
| `records [--since 14d] [--rule <id>] [--unlabelled] [--show]` | 列出记录的键、规则、模式、来源、工具与标注；`--show` 才带命令与目标 | 0；2 用法或目录不对 |
| `label <键> <标签> [--note <文字>] [--relay <原话>]` | 追加一行标注；键不存在时拒绝 | 0；1 键不存在或标签与记录种类不配；2 |
| `stats [--since 14d]` | §3.5 的表，JSON | 0；2 |
| `replay [--sessions <目录>] [--since <日期>]` | §3.6（D2 人已定 B；只读命令文本与路径；只读归到本项目的会话） | 0；2 读不出目录或写不进输出目录 |
| `corpus add <键> --expect deny\|allow --note <文字> [--known <id>]` | §3.7 | 0；1 已存在或脱敏后仍有绝对路径；2 |

在 DSH 会话里，agent 经 shell 运行这些命令：它们不是写文件命令，file-tools-only 不拦，与项目图的命令行一样。

### 3.10 晨报

`src/workflow/morning-report.ts` 的拒绝与影子两处过滤改用 `classifyRecord`（G1，§3.2）：`denial` 与 `late-denial` 进「违规」，后者在「违规」之后另写一行「其中晚到的拦下 k 条」，`rule-shadow` 与 `fallback-shadow` 进影子一节，`rule-record` 不进「违规」、在影子一节后单写一行「只记录 m 条（规则板上人选的做法）」，跟进、申报、放行、作废只进下面各自的行，`unknown` 在影子一节末尾写「N 行记录读不懂」。影子一节每行加标注：`- file-tools-only（其他路由） × 3 · 已标 3 · 误伤 1`；拦截一节之后加一行 `- 拦截后下一步走对：file-tools-only 4/5，workspace-containment 1/2（另有 3 次停下来交给人或上级）`（`y` 不含 `none`，§3.3）。数字取 `ruleStats`，标注文件读不出时只少这两段。`deferral` 不进这一节。晨报读的是会话所在项目的流水（§2.4），所以一个项目的晨报只有这个项目的数。M7 的四答晨报接手时，「例外」一节照这两行写。

### 3.11 交给指标流水的事件（`metrics`）

图上 `m4` 有指标设计 0.1 §14 的一条请求（2026-10-29T23:40Z）：`installRuleGate` 交 `rule` 事件（跟进的结局一起）；压制注释数改为每天一条计数事件，不建 `suppressions.jsonl`；`recordKey` 若指标流水先建，M4 沿用；新规则 `metrics-files-only` 进规则目录、影子。M4 的做法：

- `src/guard/metrics.ts` 的 `emitGuardMetric(ctx, event)` 经指标服务交事件（服务名与信封由指标设计定）；服务不在时什么都不做，不报错。交的时刻：`installRuleGate` 每写一条拒绝、影子记录之后；记录器每写一条 `FollowupRecord` 之后；申报每写一条 `RequestRecord`、`GrantRecord`、`GrantVoidRecord` 之后。只交规则 id、种类、结局、来源与会话 id，不交命令与路径（指标设计 0.1「路径记散列、命令只记第一个词」，以它为准）。
- E4 每天的压制计数同时交一条计数事件（`src/env/metrics.ts`）。`suppressions.jsonl` 这一稿照旧写：指标设计 0.1 第 1 轮没有通过（挡路 11 条），它的行出厂禁用，晨报的压制一行要在没有它时也写得出；指标设计定稿、它的行默认启用之后，去掉这份文件只改 E4 的 `src/env/suppressions.ts` 与晨报读它的一处，由指标设计的实施那一步做（§18 第 5 条给 `metrics` 的批注）。
- `recordKey` 与 `metrics-files-only`：照请求，谁先建谁建，后到的导入；`metrics-files-only` 经 `installRuleGate` 安装、登进规则目录。
- 违规流水不并进指标流水：`d-rules-in-repo` 把两者列为项目 `.llm/` 里的两样运行时记录；流水是授权之外的留痕与标注的对象，指标是计数。

## 4. §6.4 的规划规矩（`m4-rules`）

`docs/ORCHESTRATION.md` §6.4 表里标「规划」的各行：

| 规矩 | 在哪实现 | 模式 |
| --- | --- | --- |
| 设计阶段不写代码 | M3 `design-before-release`（`src/guard/main-agent.ts`） | 生效（`question-25`） |
| 主 Agent 不写文件 | M3 `main-agent-no-write` | 生效（`question-25`） |
| 临时脚本只在草稿区 | M4 `scratch-only`（§4.5） | 影子 |
| 压制注释必须写理由并挂节点 | M4 `suppression-reason`（§4.3） | 影子 |
| 放宽检查配置走决策卡 | M4 `checker-config`（§4.4）；转生效后经 `request_exception` 申报（§5） | 影子 |
| 同一处第三次修复走决策卡 | M4 图工具：第 3 次重开（第 3 次修复开始）时提一张提议式的人定待决，主 Agent 放进下一批问人（§4.6）；循环板列出 `graph.third-rework`（§6.8） | 只问人，不拦 |
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
| 检查器配置文件（`checker-config`） | 内置的文件名表加 env 工具节点验收条件里 `config` 行的路径（§7.1，批准之后只有人能改）；图按修订号缓存 | 图读不出时只用内置表 |

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

- 判什么：文件工具写入（`write`、`edit`、`str_replace_editor` 除 `view` 外）的目标是检查器的配置或基线。内置文件名表：`eslint.config.js`、`eslint.config.mjs`、`eslint.config.cjs`、`eslint.config.ts`、`.eslintrc`、`.eslintrc.*`、`eslint-suppressions.json`、`knip.js`、`knip.ts`、`knip.json`、`knip-baseline.json`、`.jscpd.json`、`.jscpd-baseline.json`、`tsconfig.json`、`tsconfig.*.json`、`.gitleaks.toml`、`ruff.toml`、`.ruff.toml`、`mypy.ini`、`.clang-tidy`、`.shellcheckrc`；另加 env 工具节点验收条件里 `config` 行的路径（§7.1）。改完就跑的检查条目与它们的脚本在循环板的仓库文件里，归循环板守（脚本按内容摘要钉住、改过不跑；条目文件谁能写由循环板定，同规则板对它自己文件的门），不在这条规则里。shell 改这些文件已被 file-tools-only 拦下；`npm run lint:update` 缩小基线不经文件工具，不在这条规则里（它本身拒绝放大基线，`docs/DEVELOPMENT.md` §10）。
- 模式：`shadow`。理由：这条规则分不清改松与改紧，改紧的写入也会命中。影子期的标注量的正是这件事：`wrong` 就是改紧或无关的改动。转生效后被拒的写入走申报通道（§5，规则进入可申报的名单），人在申报文字里看到改动内容再回话。
- 纠偏（生效之后）：事实「You tried to change the checker configuration `<文件>`.」；越界「Changes to checker configuration and baselines need the human: loosening a check is an unplanned decision.」；正路「Fix the findings instead; if the configuration must change, call request_exception with ref "<编号>" and say what the change does to the checks.」；例外「Shrinking a baseline with the project's update script (for example `npm run lint:update`) is not a configuration edit.」

### 4.5 `scratch-only`

- 判什么：文件工具新建文件（目标在调用前不存在：`write`，或 `str_replace_editor` `create`），扩展名是脚本（`.js`、`.mjs`、`.cjs`、`.ts`、`.mts`、`.cts`、`.py`、`.ps1`、`.psm1`、`.sh`、`.bash`、`.bat`、`.cmd`、`.rb`、`.pl`），目标不在 `<工作区根>/.llm/scratch/` 下，且目标所在目录里没有已跟踪的同扩展名文件。最后一条把「在已有源码目录里加一个新模块」与「在仓库根或新目录里丢一个脚本」分开；分得准不准由影子期量。
- 模式：`shadow`。
- 纠偏（生效之后）：事实「You created the script `<路径>` outside the scratch area.」；越界「One-off scripts live in .llm/scratch/ (git-ignored); a script that stays becomes part of the project.」；正路「Write it under .llm/scratch/; to keep it, move it into scripts/ (or the project's source tree), give it a graph node and say what it is for.」；例外「A new module in a directory that already holds files of its kind is not a one-off script; if this is one, say so in your reply: the denial is recorded for review.」
- 草稿区的位置与 M7 的清单见 §7.3。

### 4.6 第三次修复之前问人

`docs/ORCHESTRATION.md` §2.4「同一节点第三次修复，发决策卡「停下查根因」」。按 `d-chat-not-cards` 不出卡、不给选项：harness 在这个节点下提一张提议式的人定待决（M3 附录 0.5 §3.3：题目，背景、推荐、疑问、不做四行，只有一个方案），主 Agent 把它放进下一批交给人的事里问一句「先停下查原因，可以吗？」，人同意、补充或否掉都按人的原话记（M3 的 `record_human_answer`）。0.3 的问话末尾是「回「查」……，回「接着修」……」，把「不做」一行变成了一个可回的选项，图上还带 `options`、`recommend`、`crux`、`verdict`，人的补充（例「先查，但别超过半天」）无处可落（评审第 3 轮 F12）；0.4 去掉这些，R1 改为依赖 M3 第 6 步，不做选项式的过渡。重开就是状态从 `done` 改回 `doing`（引擎 `TRANSITIONS` 里 `done` 只能到 `doing`，`src/graph/engine.ts`:110–117〔实读〕，评审第 4 轮 N42），历史里是一条 `op: 'status'`、`from: 'done'`、`to: 'doing'`。

数法（全文统一）：节点第一次完成之后，每一次重开开始一次修复，第 n 次重开就是第 n 次修复开始。第 3 次重开时，第 1、2 次修复都完成过又被重开，即「前两次修复没修住」，第 3 次修复即将开始；问题在这一刻提出。

- 何时：`graph_status` 以 `llm` 身份把一个节点从 `done` 改为 `doing` 成功之后（`src/graph/tools.ts` 的 `writeTool`）。人自己重开不触发：那是人自己的决定。
- 判据：`reopenCount(node, since)`（`src/graph/reopen.ts`）数 `since` 之后的重开（不论谁重开）；`since` 是这个节点下最近一张已关闭（`done` 或 `dropped`）的「第三次修复」待决最后一条状态历史的时刻，没有就从头算。计数达到 3、这次重开由 `llm` 做、且节点下没有未关闭的「第三次修复」待决时提问。人同意之后、或说不用查（主 Agent 带原话放弃这张待决）之后，再重开 3 次才再问。
- 认法：父节点是这个节点，第一条历史是 `harness` 的 `propose`，且这条历史的 `reason` 恰为 `第三次修复：<节点 id>`。`reason` 由引擎写进历史（`planPropose`），模型改不了，人也不用读它。0.2 认的是正文第一行 `停下查根因：<节点 id>`：正文模型能改，这一行还挡在背景前面（评审第 2 轮 F10），所以不再放进正文。
- 待决：`reopenQuestion(node, reopens)`（`src/graph/reopen.ts`，纯函数）构造，以 `harness` 身份在这个节点下提议（节点正在进行中，待决直接为已批准，`initialStatus`），决定者为人，`reason` 恰为 `第三次修复：<节点 id>`。字段只有提议式的那几样（M3 附录 0.5 §3.3），没有 `options`、`recommend`、`crux`、`verdict`、`weight`：

  | 字段 | 内容 | 规则 |
  | --- | --- | --- |
  | `title` | `「<节点标题>」要修第 3 次了`；节点标题先过 `personTitle(标题, {limit: 24, issuesOf})`，通过的超过 24 个码点时截断加「…」。`personTitle` 返回 `undefined`（标题带换词表里的词、`M<数字>` 一类编号、图上的节点 id、文件名或标识符、英文状态词，或含 `*`）时，题目写 `这件活要修第 3 次了`，节点标题移进 `body` 的「附」第一行（F18） | 不超过 `PLAIN_LIMITS.title`（40），不含 `*`：至多 25（截断后加「…」）+ 2 + 8 = 35，退路写法 10 个码点。`issuesOf` 在 plain-ui 第二阶段合入后是 `text => plainIssues(text, 'title', ids)`（`ids` 是这张图上的节点 id），之前是 `plainWordsIn`；这样提议被引擎的写法检查拒掉的情形（评审第 4 轮数过，本仓库 84 个任务与特性的标题里有 11 个带 `M<数字>`）在 M4 一侧先被挡住 |
  | `background` | `这件活**修过两次又被重新打开**，同一处反复修不好，常常是问题没找对` | 去掉 `**` 之后 31 个码点，不超过 `PLAIN_LIMITS.background`；加粗 10 个码点 |
  | `proposal`（推荐） | `**先停下查原因**，查清了写进这件活再接着修` | 19 个码点；加粗 6 |
  | `doubt`（疑问） | `若**三次重开不是同一个问题**，接着修也行` | 18 个码点；加粗 11。写的是一变方案就要换的事实：三次重开的理由说的是不同的问题时，这不是同一处修不好（评审第 3 轮 F12 第 3 条） |
  | `notTaken`（不做） | `**直接接着修**，多半还要修第 4 次` | 16 个码点；加粗 5 |
  | `body` | 「附」：三次重开的时刻与理由，每次一行，例 `- 第 1 次重新打开：10-29 14:02「测试在 Windows 上挂了」` | 时刻与理由取自三条重开历史的 `at` 与 `reason`，理由截到 40 个码点，里面的 `*`、反引号、`[`、`]`、`<`、`>` 前加 `\`；题目走退路写法时第一行是 `- 这件活是「<节点标题>」`，标题里同样转义 |

  四行的数字都按 M3 的 `proposalLineRefusal` 的规则（每行恰好一处 2–12 个码点的加粗，不以标签开头，推荐、疑问、不做至多 40 个码点）。L2 把 `reopenQuestion` 的结果交给真实引擎提一次：节点上没有上面五个选项字段，四行过 `proposalLineRefusal`，题目、四行与 `body` 过 `plainWordsIn` 为空。节点标题是「补齐验收条件」「M4 guard 补齐与环境」「收拾 gate.ts」时，题目都是退路写法、标题进「附」，结果在 plain-ui 第二阶段的常量下交给真实引擎照样通过；plain-ui 第二阶段没合入时，带 `M<数字>` 的那一例跳过并在测试里写明。
- 给人看的样子由 M3 渲染，M4 不另拼：主 Agent 用 `propose_to_human {kind: 'question', question: <id>}`、不带题目与四行，M3 原样渲染这张已有的提议式待决、记进这一条回复的件数、不写图（M3 附录 0.5 §3.4 已有这一种，§2.3 那一行）。人在对话里读到的是：

  ```markdown
  ① 「Windows 上的路径解析」要修第 3 次了

  背景：这件活**修过两次又被重新打开**，同一处反复修不好，常常是问题没找对

  推荐：**先停下查原因**，查清了写进这件活再接着修

  疑问：若**三次重开不是同一个问题**，接着修也行

  不做：**直接接着修**，多半还要修第 4 次

  先停下查原因，可以吗？
  ```

  最后一句是主 Agent 的收尾问话（M3 的 `propose_to_human` 说明要它以一句问话收尾），`notice` 里给出这一句。问话只问这一个方案，正文与问话里没有「回「…」就…」式的回复词。
- 谁问人：`graph_status` 的输出 schema 加可选的 `notice: string`，按调用方写。调用方是根 agent：「Filed question <id> for the human: this node is about to get its third fix. Do not start the third fix yet. Put it to the human in your next batch (at most three matters in one reply) with propose_to_human {kind: "question", question: "<id>"}, which shows it unchanged; end that reply with one question such as 先停下查原因，可以吗？. Record the answer with record_human_answer (kind question, question <id>): agree → recordedAs 先停下查原因; add or reject → their exact words, then change the plan with propose_to_human (question <id>) and new lines. If they say it needs no decision (for example 接着修吧), drop the question with graph_status and their words as relay.」调用方是子 agent：「Filed question <id> for the human: this node is about to get its third fix. Stop work on it and say so in your final result; the main agent asks the human.」主 Agent 也会在每一步给它的项目摘要里看到这张等人的待决（M3 的投影，提议式待决带四行，M3 附录 0.5 §3.3 `projection.ts` 一条）。人同意之后主 Agent 去查原因，查清写进这件活再修；人补充时（例「先查，但别超过半天」）照 M3 的 `add` 一行批注，改方案再问；人否掉时照 `reject` 一行，换一个方案再问；人说不用定了，带原话放弃这张待决，下一次重开从放弃的时刻起数。
- 依赖：R1 要 M3 第 6 步（提议式待决、`record_human_answer` 的 `question` 一种）与上面那种不带四行的 `propose_to_human`。M3 第 6 步合入之前 R1 不开工，没有选项式的过渡（0.3 §13.3 的「等改写 `d-option-card` 的那件事」一行删去）。
- 不拦截：问题只出现在人的队列里与主 Agent 的对话里；项目摘要的门禁一行「子树里有等人拍板的待决」照常显示。M7 的 `await_human` 收提议式的人定待决（M7 0.6 §3.9.5），剩下的事都在等人时自动推进停下。主 Agent 按 `d-design-onepage` 把它和别的问题攒在一起问，一次至多三件。
- 循环板：图行在激活时把 `graph.third-rework` 一项交给循环板（§6.8），每提一次待决调一次 `recordRun`（结局 `reported`）。循环板不在时照常提问，只是没有地方列出。
- 提议失败（`stale_revision` 重试一次后仍失败，或别的拒绝）时 `notice` 写原因，重开本身已经成功，下一次重开时再判一次；`recordRun` 记 `failed`。

## 5. 申报通道（`m4-request-card`）

节点 `m4-request-card` 写的是「经决策卡申报」。`d-chat-not-cards`（人 2026-10-30：产品里也不用问答卡、不给选项）之后，申报改在对话里问：harness 写好一段四行的方案，agent 原样放在回复末尾，人的下一句话就是回答。面板只看不操作（`d-ui-look-not-operate`），申报不经面板批，也不上图；面板「需要你」从会话日志列出开着的申报（§5.8）。下面先写没有 M7 时的路径（§5.1–§5.8），装了 M7 时 worker 的路径与自动推进的停等在 §5.9。

### 5.1 一次申报的路径

1. agent 调 `write` 写 `C:\Users\me\notes\todo.md`（工作区外）。圈禁拒绝，纠偏的事实一句带解析后的路径，例外一句带申报编号 `r-7k2m9q4x` 与 `request_exception` 的四个字段。guard 在内存里记下这次拒绝（编号、会话、派发链的根、原生工具、完整参数、签名、目标、时刻），违规记录带 `ref`（只作留痕）。
2. agent 调 `request_exception {ref, purpose, reversibility, alternatives}`。
3. harness 在内存里核对编号，读目标的事实（在不在、大小、修改时间），写出申报文字（§5.4），在内存里登记一条等人回话的申报；工具返回这段文字与一句说明：原样放在回复的最后，结束这一回合。
4. agent 回复，末尾是这段文字，回合结束。
5. 人在输入框回「可以」。下一回合的第一步之前，guard 行的步 notice 读到这条消息（§5.5）：它来自 DSH 客户端、紧跟在以这段文字结尾的助手消息之后、恰是同意词。harness 在内存里写一个放行（带申报文字里的目标事实），违规流水写一条带人原话的 `RequestRecord`，这一步的消息末尾加一条说明：人批准了，带被拒那次调用的工具与参数。
6. agent 原样再调 `write`。圈禁仍判为拒绝，guard 在放行簿里查到匹配的放行；重新读目标的事实，与申报文字里的相同；目标已存在就先把旧内容复制到项目目录；`next()` 放行，流水写一条 `GrantRecord`，放行用掉。
7. agent 第三次调同一个 `write`：没有放行，照常拒绝。

### 5.2 拒绝文案（注入清点 §0 的修复）

`61be79a`（main 上，0.3 的依据之后）已删掉 `APPLICATION_PROTOCOL`：今天两条规则的例外都是 `ASK_THE_HUMAN`（「tell the human what you need, where and why; only the human can allow it.」，`src/guard/rules.ts`:56〔实读〕），不再指向不存在的通道，注入清点 §0 的缺陷已修（评审第 3 轮 N34）。还要改的两处：

- G1：file-tools-only 的例外换成下面的新文案（只改文字；这条规则不可申报，不必等 G4）。圈禁的例外 G1 不动。
- G4：圈禁的例外按下表的三种情形给出，取代 `ASK_THE_HUMAN` 那一句。

- 圈禁：`workspaceContainment(roots, base, exception)` 的第三个参数由 guard 行的 `rules()` 每次判定时给出（例外文案只出现在拒绝里，`detect` 仍是同步的纯函数）；编号在 `rules()` 里为每次文件工具写入预先生成（8 位，`crypto.randomBytes` 转 base36），只有被拒时才登记。

  | 情形 | 例外一句（给模型，英文） |
  | --- | --- |
  | 调用方是根 agent（会话头不带 `origin: 'subagent'`） | `To write outside the workspace, call request_exception {"ref": "<ref>", "purpose": "<why, one short sentence>", "reversibility": "<can it be undone, what else it touches>", "alternatives": "<what you tried instead>"}. It returns a short text for the human: put it at the end of your reply and end your turn. If the human answers 可以, this identical call goes through once within 30 minutes.` |
  | 调用方是子 agent（不是 M7 的 worker） | `A subagent cannot ask the human. If this write is needed, put ref "<ref>" and the target path in your final result; the agent that started you files the request.` |
  | 调用方是 M7 的 worker（这一句由 M7 的 `worker-scope` 经 `outsideDenial` 取得、接在它自己的纠偏后面，§5.9） | `To write outside the workspace, ask the main agent with ask_main: give ref "<ref>" and the target path. When it answers that the human approved, make this identical call again. If no answer comes, hand back with the ref and the target under questions.` |

- file-tools-only 的例外改为：`Build, test and git commands that write files as a side effect are allowed; only redirections and file-changing commands are denied. If this command writes no file, say so in your reply: the denial is recorded for review.` 这条规则不可申报：它管的是习惯，允许例外会教模型去申报。git 命令不是写文件（`d-main-agent-shell`），今天就放行，这一句照旧写明。
- 圈禁同时覆盖 `str_replace_editor`：`create`、`str_replace`、`insert` 的 `path`（str-replace-editor:267、281、141–171）与 `write`、`edit` 的 `file_path` 一样判定；`view` 放行。今天只判 `write`、`edit`，`str_replace_editor` 写工作区外不被拒。规则不是新的，补的是它漏掉的工具，所以直接生效（同 `terminal_send` 读 `text` 的修复，`docs/DEVELOPMENT.md` §7）。
- 纠偏的工具名照旧按 `face`（方言接管时 `Write`）；`request_exception` 没有方言别名，各路由同名。

这些文案的改动会改变所有路由上模型读到的拒绝信息；§14.4 的标定题量它前后的「拦截后下一步走对」。探针 `glm`、`non-glm-guard` 的纠偏期望在 `61be79a` 已按 `ASK_THE_HUMAN` 改过，G1 只改 file-tools-only 那一句的期望，G4 改圈禁的。

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

描述（给模型）：`Ask the human to allow one call that a rule denied with a ref naming this tool. Pass the ref and three short sentences: why the call is needed, whether it can be undone and what else it touches, what you tried instead. The result is a short text for the human: put it, unchanged, at the very end of your reply and end your turn. The human's next message answers it; if they approve, the identical call goes through once within 30 minutes. Write the three sentences in the language the human uses: the human reads them as quotes. Example: request_exception {"ref": "r-3k9d2m7q", "purpose": "把今天新添的曲目追加到播放器读的歌单文件", "reversibility": "旧文件先备份，改坏了能找回；不碰别的文件", "alternatives": "试过写在工作区里，但播放器只读它自己的目录"}`

示范（`d-agent-examples`，评审第 4 轮 F20）：三句话由 agent 写、原样放进给人看的「附」，是主 Agent 写给人的一种东西，所以说明里带一道做好的例子；工具说明由 `src/guard/request.ts` 的常量 `REQUEST_EXAMPLE` 拼出。例子的领域是音乐播放器的歌单文件，与练习题的领域无关；说的是已经定了的事：写工作区外的文件，人回「可以」，同一个调用放行一次。三句各在 80、60、60 个字符的上限之内。L2 把这道例子交给本节第 2 条的参数检查与 `renderPlan`（编号换成一次真实拒绝的编号，目标取一个临时目录里的歌单文件）：参数检查通过，`renderPlan` 写得出合格的申报文字；上限或四行规则一改，这一例跟着失败。

可申报的规则：`REQUESTABLE = ['workspace-containment']`（`src/guard/request.ts`）。只有这些规则的拒绝带编号；`checker-config` 转生效的那次提交把它加进名单（改名单就是改权限，`norm-review-floor` 全审），申报文字的题目与疑问一行按规则取（§5.4 的表）。

检查顺序，第一条不成立就抛错（文本为 `{code, message, hint}` 的 JSON，同图工具的 `refuse`）：

1. 调用方有 agent，会话头不带 `origin: 'subagent'`，否则 `forbidden`，`hint`「a subagent cannot ask the human: if you have ask_main, give the ref to the main agent with it; otherwise put the ref in your final result」。
2. 参数合法，否则 `invalid`。
3. 编号在内存的拒绝表里（只认内存：违规流水是工作区里的文件，模型能写，它不作授权的任何一环）；不在 `not_found`，`hint`「resubmit the call that was denied: the new denial carries a fresh ref」（进程重启之后的旧编号也是这样）。编号属于另一个派发链的根（`dispatchRoot`，M3 §3.3.3）时 `forbidden`；`dispatchRoot` 为 `unknown`（链断了）时同样 `forbidden`，`hint`「ask the human in your reply」。拒绝超过 2 小时 `expired`，`hint` 同 `not_found`。拒绝表至多 64 条，最早的先出。
4. 这个编号已有未用、未过期的放行：直接返回 `approved`（带工具与参数），不再问人。
5. 本会话已有一条等人回话的申报：编号相同就再返回同一段文字（`outcome: 'ask'`，agent 上一次没放进回复时用得上）；编号不同就 `busy`，`hint`「finish the open request first: the human's next message settles it」。
5a. 本会话从最后一条客户端送来的人的消息（§5.5 第 2 条的认法）以来，已有一次成功的 `propose_to_human` 调用（会话历史里助手消息的工具调用块，名字经 `toNativeTool` 换算、拆开 `DeferredToolCall` 之后是 `propose_to_human`，且它的结果不是错误）：`busy`，`hint`「end this reply with the proposals you showed; file the request after the human answers」（评审第 3 轮 N29：M3 的说明要主 Agent 以一句问话收尾问它出示的几件事，申报文字又要在最后，人的一句「可以」会同时落在两边）。只读本会话的历史，不依赖 M3 的投影。反过来的一侧由 M3 守：本会话有开着的申报时 `propose_to_human` 返回 `busy`（读 `openRequests`，§18 第 5 条给 `m3` 的请求）；M3 没加之前，申报文字之后又出示了提议时 `tail` 对不上，记 `not-shown`、不放行（fail-closed）。
6. 读目标的事实：`fs.promises.stat`（目标按圈禁解析）；`ENOENT` 记为不存在；别的错误（权限等）抛 `unavailable`，`hint`「the target cannot be read (<错误码>); tell the human in your reply」。
7. 写出申报文字（§5.4），登记等人回话的申报 `OpenRequest {ref, sessionId, agentId, agent, root, rule, tool, args, signature, target, facts, tail, askedAt, unclear: 0}`（内存，每个会话至多一条，2 小时后作废；`agent` 是申报的 agent，2 小时的定时器用它送关闭提醒，§5.5 第 1 条），流水写 `RequestRecord {outcome: 'asked'}`，返回。`tail` 是规范化之后的申报文字（§5.5 第 3 条的规范化）。第 6、7 步里任何一处抛错，包括 `renderPlan`（F18）：捕获，返回 `unavailable`，`hint`「the harness could not write the text for the human; tell the human in your reply what you need and why」，不登记申报、不写流水，行健康降级并写明原因（控制台每个会话一次）；这次工具调用与结果留在会话日志里。agent 重试得到同样的结果时，`hint` 已经让它改在回复里直接告诉人。

输出：`{outcome: 'ask' | 'approved', ref, text?, lines?, tool?, arguments?, argumentsFile?, expires?, message}`。

- `ask`：`text` 是申报文字；`lines` 是 `{title, background, proposal, doubt, notTaken}`（申报文字的题目与四行，带加粗记号，给面板「需要你」按四行显示，§5.8）；`message` 是「Put `text` at the very end of your reply, exactly as given (same lines, same marks), and end your turn without another tool call. Do not call propose_to_human in this reply. The human's next message answers it; you get a note at your next step. If a goal keeps you running and the harness does not pause it, tell the human in this reply to answer when you stop; the request stays open until they do.」（最后一句给没有 M7、人自己用 `/goal` 的会话，§5.9；有 M7 时推进会停下等人。）
- `approved`：同 §5.5 放行之后的说明。

行重新加载或进程重启时，内存里的拒绝表、等人回话的申报与放行都没有了；人之后回「可以」只是一条普通消息，agent 重调被拒的调用会拿到新编号，再申报一次（§11）。日志里还开着的申报在重启之后第一次给那个会话装提醒时收到一条「作废」的提醒（§5.5 第 6 条）。

### 5.4 申报文字

`renderPlan({title: {lead, data?}, lines, attachments?, question})`（`src/graph/plan-text.ts`，纯函数）按 `d-chat-not-cards` 的格式定稿（节点最后一条批注，人 2026-10-30）输出 Markdown：题目单独一段；背景、推荐、疑问、不做四行各自成段（段间空一行），标签照常不加粗，每行把重点几个字加粗；可选的「附：」一段；问话放在最后，只问一次。四行的规则只有一份，在 M3 的 `src/graph/proposal.ts`（附录 0.5 §3.3）：`lines` 是 `{background, proposal, doubt, notTaken}`，每行先过 `proposalLineRefusal`（恰好一处 2–12 个码点的加粗、不以标签开头；背景至多 `PLAIN_LIMITS.background`，其余三行至多 40 个码点，都不算 `**`），标签取 `PROPOSAL_LABELS`，段落排法与 `renderProposal` 相同（不带编号）。`plan-text.ts` 只加 M3 没有的三样：题目可带解析后的路径（至多 80 个码点，不受 `PLAIN_LIMITS.title` 管，因为路径要完整写出），「附」一段，问话一段（评审第 3 轮 N27：0.3 另定了每行 60、加粗不限长度的一套，格式再改要改两处）。`proposal.ts` 由 M3 第 6 步建；G4 先开工时照附录 §3.3 原样建，M3 改成导入。

函数在下面的情形抛错（评审第 4 轮 F18：0.4 写「它只吃 harness 自己代码里的字串」，而题目里的路径与背景一行里的焦点标题是外来的数据）。输入分两类。常量是 harness 自己代码里的字串：四行里固定的句子、题目的前半句（例「要改工作区外的文件：」）、问话、「附」的小标题。数据是调用的路径、图上焦点节点的标题与 agent 的三句话，进字串之前先过转换：路径经 `displayPath(path)`（控制字符换成 `?`，`*`、反引号、`[`、`]`、`<`、`>` 前加 `\`；转义之后超过 60 个字时保留盘符或根与最后两段、中间写「…」）；焦点标题经 `personTitle(title, {limit: 16, issuesOf})`（`src/graph/plan-text.ts`：去掉 `*` 与反引号，截到 `limit` 个字加「…」，`issuesOf(text)` 报出任何一条就返回 `undefined`；`issuesOf` 在 plain-ui 第二阶段合入后取它的 `plainIssues(text, 'title', ids)`，之前取 `plainWordsIn`，所以焦点标题是「补齐验收条件」「M4 guard 补齐与环境」「收拾 gate.ts」时都返回 `undefined`）；agent 的三句话只进「附」，不查。`renderPlan` 的参数里题目分两段：`title: {lead, data?}`，`lead` 是常量，`data` 是 `displayPath` 的结果。`renderPlan` 只查常量，在下面的情形抛错：四行里任何一行 `proposalLineRefusal` 不过；题目整段超过 80 个码点或含换行；`lead`、四行或问话里含 `plainWordsIn` 报出的词（`src/graph/plain-question.ts`，已在 main，M3 第 3 步建；中文按子串、英文按整词不分大小写，英文词里有 `gate`、`acceptance`）。`data` 原样显示、不查换词，所以含「门禁」或 `gate.ts` 的路径写得出合格的文字。`personTitle` 返回 `undefined` 时，背景一行省去焦点半句，与读不到焦点同一种写法。常量上的抛错是 harness 的 bug，L2 钉住；`request_exception` 对任何抛错都有退路（§5.3 第 7 步）。

申报的文字（`write` 覆盖一个已存在的文件）：

````markdown
要改工作区外的文件：C:\Users\me\notes\todo.md

背景：agent 做「整理今天的笔记」时要**改工作区外的文件**，系统先拦下了

推荐：**放行这一次**，旧内容先备份，改坏了能找回

疑问：这个文件若**不归这件活管**，就不该放行

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

放行这一次，可以吗？（回「可以」才算数）
````

按事实换的几处，都由 harness 核对后写，不取 agent 的说法：

| 目标 | 题目 | 推荐一行 | 「文件现在」一项 |
| --- | --- | --- | --- |
| 不存在 | `要在工作区外新建文件：<路径>` | `**放行这一次**，是新文件，删掉就能撤回` | 不存在，将新建 |
| 已存在，不大于 10 MiB，有项目目录 | `要改工作区外的文件：<路径>` | `**放行这一次**，旧内容先备份，改坏了能找回` | 已存在，<n> 字节，<时刻> 改过 |
| 已存在，大于 10 MiB 或没有项目目录 | 同上 | `放行这一次，但**旧内容找不回来**` | 同上，另加「大于 10 MiB，不备份」或「没有项目目录，不备份」 |
| `edit`，`str_replace_editor` 的 `str_replace`、`insert` | 同上 | `**放行这一次**，改 <n> 处，旧内容先备份`（大于 10 MiB 或没有项目目录时同上一行） | 同上；内容一项换成「改动前后（各前 5 行）」 |
| 规则 `checker-config`（转生效并进入可申报名单之后） | `要改检查器的配置：<文件>` | 按上面几行 | 同上；疑问一行换成「这次改动若**让检查变松**，就不该放行」 |

疑问一行写的是一个人能核对、一变就不该放行的事实（评审第 3 轮 N28；0.3 的「该不该让 agent 改，只有你清楚」是把问题原样推给人）。各行的长度（去掉 `**`）：背景至多 42 个码点（焦点标题截到 16 个字时），推荐 14–17，疑问 16–17，不做 22，都在 `proposalLineRefusal` 的上限之内，L2 对五种变体逐字钉住。

- 背景一行的前半句：会话有图、设了未关闭的焦点（图行服务的 `focusOf`，M3）时写「agent 做「<焦点节点标题>」时」，标题先过 `personTitle(…, {limit: 16, …})`；读不到焦点（没有图、M3 的 `focusOf` 还没合入、读图出错）或 `personTitle` 返回 `undefined`（标题带换词表里的词、编号、文件名，或含 `*`）就省去这半句：「背景：agent 要**改工作区外的文件**，系统先拦下了」。
- 路径：题目里写解析后的完整路径，经 `displayPath` 转义（超过 60 个字时保留盘符或根与最后两段，中间写「…」）；这是数据，原样显示、不查换词；「附」里不重复。题目整段的上限 80 个码点够用：`lead` 至多 12 个码点，路径至多 60 个字。
- agent 的原话照原样放进「」里，换行换成空格；里面的 `*`、反引号、`[`、`]`、`<`、`>` 前加 `\`，不让它们改动格式，也不让它们冒充 harness 写的字。
- 内容预览：`write` 的 `content` 前 10 行，每行至多 120 个字符，围在代码块里（围栏比内容里最长的一串反引号多一个）；内容含 `\0` 时写「二进制内容，<n> 字节」。
- 整段至多 2,000 个字符；超出时先截预览，再截原话（截处写「…」）。
- 问话「放行这一次，可以吗？（回「可以」才算数）」只问这一个方案，同时告诉人怎样回答才算数（§5.5 的同意词）；不给第二个回复词，「不做」一行是交代理由，不是一个可回的选项（`d-chat-not-cards` 17:08Z 的批注；0.3 的「回「不行」就不写」与第三次修复的二选一是同一个问题，评审第 3 轮 F12）。人回「不行」一类的话照旧认作不同意（§5.5 第 4 条），只是问话里不再把它当作选项列出。
- 放行要用的事实（`exists`、`size`、`mtimeMs`）随登记一起存下，使用时核对（§5.6）。

为什么推荐一行是「放行」：这段文字是 agent 的申请，它的方案就是写这一次，人凭直觉看这一条对不对（`d-chat-not-cards`：只给一个方案，人同意、补充或否掉）。安全不靠推荐：人不回、回别的、回得含糊都不放行（§5.5）。0.2 推荐「不放行」，是给表格卡上「不细看就按推荐」的情形准备的；聊天里没有预选，也没有按回车就生效。

为什么有「附」：人批的是一次具体的写入，要看得到写的是哪个文件、写什么、agent 怎么说；放进四行里，一行就写不短了。「附」放在四行之后、问话之前，问话仍在最后（§16）。

### 5.5 人的回话

guard 行在 `agent/created` 时给每个根 agent 装一条步 notice（`installStepNotice`，来源 `hourness-request`；子 agent 不装，它们发不出申报）。本会话有等人回话的申报时，每一步读两样东西：这一步收进来的消息（`admitted`：agent/pre-step 的 `messages` 是这一步从收件箱领出的消息，agent-loop:902–925〔实读〕）与这一步之前的会话历史（`session.deriveMessages()`，这一步的消息还没进去）。

1. 申报过了 2 小时：写 `RequestRecord {outcome: 'expired'}`，申报作废，加一条关闭的说明「Request <ref> expired: the human did not answer within 2 hours. If the write is still needed, make the denied call again for a fresh ref.」。过期不靠步：goal 停住推进之后主 Agent 只在被别的事叫醒时才走步，人一直不回时申报不会过期、`openRequests` 仍列着它、M7 不恢复，面板却在 2 小时后把它去掉（评审第 4 轮 N38）。所以登记申报时（§5.3 第 7 步）guard 行设一个 `unref` 的定时器，到 `askedAt` 之后 2 小时触发：写上面的 `expired` 记录，经 `agent.followup` 把这条关闭的说明作为 `hourness-request` 提醒送给申报的 agent（持有者被叫醒，装了 M7 时 M7 在那一步看到 `openRequests` 空了就恢复推进）；`openRequests` 不返回已过 2 小时的申报。定时器丢了（进程重启、会话卸载）时，仍按下一步或会话卸载时比较时刻的旧办法补写。
2. 找 `admitted` 里第一条 `role: 'user'`、`source.kind === 'user'`、`source.rpcId` 是字符串的消息。DSH 客户端经接口送进来的人的消息带这两样（api-session-controller:3224–3229 的 `prompt`；人在子会话的窗口里输入时 subagent:3195–3200〔实读〕）；DSH 自己的 `dsh-client-file-upload` 用同一个判断认客户端送来的消息（client-file-upload:296–297〔实读〕）。别的路径送进来的用户角色消息没有 `rpcId`：headless 的任务（headless:345）、父 agent 写给子 agent 的任务（subagent:1461）、命令（commands:338）、计划模式（plan-mode:221）、ACP 与 SDK 的输入（acp:835、sdk-jsonrpc-server:161），各插件的提醒另带 `source.form: 'notice'`。
   - 没有这样的消息，但有别的 `source.kind === 'user'` 的消息：写 `RequestRecord {outcome: 'not-client', words}`，加一条说明「The message after request <ref> did not come through the DSH client, so it cannot approve it; the request stays open.」，申报留着。
   - 什么用户消息都没有（主 Agent 被巡检、晨报、循环板的提醒或 goal 的下一轮叫醒，或自己接着干活）：这是这一回合的第一步（`agent/pre-step` 的 `step` 是这一回合的首步）时，每一回合都加一条说明「Request <ref> still waits for the human. When you end this turn, put its text at the very end of your reply again, unchanged; the human's next message answers it.」（评审第 3 轮 F14 第 2 条：0.3 每条申报只加一次，goal 一轮接一轮跑时之后的轮次不再提醒）；不是首步时不加。
3. 核对人读到的就是申报文字：会话历史里最后一条助手消息没有工具调用块，它的文字（各文本块连起来）规范化之后以 `tail` 结尾；这条助手消息与这条人的消息之间没有别的 `source.kind === 'user'` 的消息。规范化：NFC，`\r\n` 换成 `\n`，去掉每行末尾的空白，连续的空行并成一行，去掉首尾空白。不成立：写 `RequestRecord {outcome: 'not-shown', words}`，不放行，申报留着，说明「Request <ref> was not approved: the human had not just read its text (your last reply did not end with it). When you end this turn, put the text at the very end of your reply, unchanged; the human's next message answers it.」。这包括人在 agent 还没结束回合时插话（上一条助手消息带工具调用块）。为什么这样严：人的「可以」只能是在回答紧挨着的那段文字；中间 agent 若又说了别的，人可能是在回答别的事。申报留着不会多放行：下一次能放行仍要先满足这一条。
4. 读人的话：消息的文字规范化（同上，再去掉末尾的「。.!！~～」与首尾的引号，ASCII 字母转小写）之后：
   - 在 `APPROVAL_WORDS` 里：放行（第 5 条）。
   - 在 `DECLINE_WORDS` 里：写 `RequestRecord {outcome: 'declined', by: 'human', via: 'chat', words}`，申报关闭，说明「The human declined request <ref> ("<原话>"). Do not retry this call; do the work inside the workspace, or ask them what to do instead.」。
   - 其余：写 `RequestRecord {outcome: 'unclear', words}`，`unclear` 加一；`tail` 换成确认句「放行这一次写 <文件名>，可以吗？（回「可以」才算数）」的规范化文字，说明「The human's reply is not a plain yes or no, so nothing is approved yet: "<原话>". Answer what they said; if they seem to want the write, end your reply with this line, unchanged: <确认句>」。同一条申报第 3 次读不懂时关闭（`outcome: 'closed'`），说明请 agent 重调被拒的调用、用新编号从头申报。
5. 放行：`GrantBook.add({ref, rule, signature, root, facts, decidedAt, expiresAt: decidedAt + 30 分钟, words})`，写 `RequestRecord {outcome: 'approved', by: 'human', via: 'chat', words, messageId}`，申报关闭，加下面的说明。
6. 重启之后（评审第 3 轮 F15 第 1 条）：这个进程第一次给一个根 agent 装这条步 notice 时，扫一次它的会话历史：有 `request_exception` 的 `ask` 结果、之后没有同一 `ref` 的关闭说明（下一段的事实字段），而内存里没有这条申报的，加一条说明「Request <ref> lapsed: DSH or the plugin restarted, so the human's answer can no longer approve it. If the write is still needed, make the denied call again for a fresh ref.」，事实字段 `outcome: 'lapsed'`；违规流水不写（进程重启本来没有记录，§5.8）。扫的只是这个会话的历史，至多 2 小时之内的 `ask` 结果。

关闭的说明都是 `createUserNotice('hourness-request', <摘要>, <说明>, {request: {ref, outcome}})`（`src/shared/dsh-min.ts`:462，事实字段原样存进会话日志的 `source`），`outcome` 为 `approved`、`declined`、`closed`、`expired`、`lapsed` 之一；`not-shown`、`not-client`、`unclear` 与「仍在等」的说明带 `request: {ref, outcome: 'open'}`。所以一条申报从开到关，在会话日志里是一个 `ask` 结果加一条关闭的提醒，面板与核对都只读日志（§5.8）。

`APPROVAL_WORDS`：可以、可以的、行、好、好的、同意、批准、放行、写吧、改吧、ok、okay、yes、y。`DECLINE_WORDS`：不行、不可以、不要、不同意、不批准、别写、别改、算了、no、n。两张表是 `src/guard/request.ts` 里的常量，改它们是一次提交，属于改权限（`norm-review-floor` 全审）。只认整句：「可以吗」「可以，顺便把 b 也改了」都不算同意，走「其余」。理由：放行是授权，拿不准就不放（fail-closed），人多回一句「可以」的代价小；`d-chat-not-cards` 要 agent 在人随口回答时先复述再记，这里的确认句就是 harness 替 agent 写好的那一句复述。

放行之后的说明（一次，步 notice，`<system-reminder>` 包装）：

```text
<system-reminder>
The human approved request r-7k2m9q4x ("可以"). Make exactly this call once before 10:42: write {"file_path": "C:\\Users\\me\\notes\\todo.md", "content": "…"}.
If you cannot write files (main agent), dispatch a subagent and give it these arguments verbatim; the approval covers your whole dispatch chain.
</system-reminder>
```

第二行按被拒的那次调用从哪来写（拒绝表里记着被拒调用的 agent 与它是不是经 `outsideDenial` 登记的）：

| 被拒的是谁 | 第二行 |
| --- | --- |
| 收到说明的这个 agent 自己 | 没有第二行 |
| 普通子 agent（没有 M7，§5.6） | 上面例子里的那一句 |
| M7 的 worker（经 `outsideDenial` 登记，§5.9） | `The worker for task <任务 id> waits in ask_main with this ref: answer it with answer_worker, for example "The human approved request r-7k2m9q4x: make the identical call once now." If it has handed back already, dispatch the task again and tell the new worker with send_message to make exactly this call once.` |

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
- 子 agent：子 agent 被拒之后把编号交回给派发它的 agent（§5.2）；按 `d-one-main-agent`，有主 Agent 的项目里那就是主 Agent。主 Agent 拿这个编号调 `request_exception`（编号的派发链的根就是主 Agent），人回「可以」之后，主 Agent 按说明里的参数派一个子 agent 原样写；放行按派发链的根匹配，所以同一派发链里的任何 agent 原样再调都能用这一次。主 Agent 自己仍被 M3 的 `main-agent-no-write` 拦下：两条规则互不放行。这一段是没有 M7 时的路径；装了 M7 的项目里，派出去写文件的是 worker，主 Agent 用原生 `subagent` 叫出来的子 agent 只读（M7 的 `dispatch-chain-readonly`），路径见 §5.9。
- 其他门禁照旧：放行只让圈禁这一条不拦；M3、规则板的规则照常判；M7 的 `worker-scope` 只在 `peekGrant` 命中时让这一次调用往里走（§5.9），别的 M7 规则照常判。
- 只读的查看 `peekGrant(input)`：按与匹配相同的签名与派发链的根查放行簿，命中一条未用、未过期、不在「使用中」的放行时返回 `true`。它不改放行簿，不做使用时的核对；核对、备份与用掉仍只在 guard 行的 `installRuleGate` 第 6、8 步。外层的门凭它放行之后，调用若没走到 guard 行（中间别的门拒绝），放行不被用掉，下一次同样的调用照样要过一遍。

### 5.7 所有路由

`request_exception`、拒绝文案、申报文字、读人回话与放行都不看路由；纠偏里的文件工具名按 `face`；记录带 `scope` 与 `route`（G3）。不装 GLM 包时一切照常（工具在工具面里直接可见）。

### 5.8 留痕

| 动作 | 记在哪 |
| --- | --- |
| 拒绝（带编号） | 违规流水 `ViolationRecord`（`ref`、`call`） |
| 给出申报文字 | `RequestRecord {outcome: 'asked'}`；会话日志里的工具结果 |
| 人的回话 | `RequestRecord`（`approved`、`declined`、`unclear`、`not-shown`、`not-client`、`closed`，带原话与消息 id）；会话日志里人的消息 |
| 没等到回话 | 过 2 小时：`RequestRecord {outcome: 'expired'}`（在那个会话的下一步或会话卸载时写）与一条关闭提醒；进程重启：流水没有记录，会话日志里补一条 `lapsed` 提醒（§5.5 第 6 条），下一次申报是新编号 |
| 申报的开与关（给面板） | 会话日志：`request_exception` 的 `ask` 结果；`hourness-request` 提醒的 `request: {ref, outcome}` |
| 放行的使用、备份路径 | `GrantRecord` |
| 放行作废 | `GrantVoidRecord` |

为什么申报不上图：授权只认内存里人的回话，图上记一笔不增加安全，却要图行在、要焦点、多一种失败；面板只看不操作，不在面板上批。人要追「上周放行过哪些写入」，晨报与 `npm run -s guard -- records` 都列得出。

面板「需要你」里的申报（评审第 3 轮 F15）。人同意的落地方案第 4 条（`d-chat-not-cards` 17:08Z）是「面板只看不操作，『需要你』一节列出在等人回话的方案，点开跳到主 Agent 的对话」；申报文字就是一段在等人回话的方案，F14 的情形里它很快被后面的回复顶上去，面板是人还能看到它的地方。0.3 把它留在内存与流水里、交给面板设计定，而面板只读图上的待决与 `propose_to_human`、`record_human_answer` 的参数（plain-ui 0.7 §4.3 第 6 条、现场投影 `graphLive`），两边合起来哪里都不显示。0.4 的做法：开与关都写成会话日志里看得到的形状，由面板从日志读：

- 开：`request_exception` 的工具结果，`outcome: 'ask'`，带 `ref`、`text` 与 `lines`（题目与四行，§5.3）。
- 关：同一会话里带 `request: {ref, outcome}` 的 `hourness-request` 提醒（§5.5 末段），`outcome` 为 `approved`、`declined`、`closed`、`expired`、`lapsed`。
- 请面板（§18 第 5 条给 `m8-plain-language`）：「需要你」的 (b) 一类加上开着的申报：现场投影 `graphLive` 在 `tool/call` 与成功的 `tool/result` 里认出 `request_exception` 的 `ask` 结果就加上一项（`ref`、`lines`、时刻、会话），见到同一 `ref` 的关闭提醒、或过了 2 小时就去掉；显示题目与背景、推荐、疑问、不做四行，下面一行照 (b) 的写法「去主 Agent 的对话回话 ›」（申报所在的会话；有主 Agent 时就是主 Agent 的会话，worker 的申报也由主 Agent 提，§5.9）。面板仍不批：人回话只在对话里。
- 进程重启时内存里的申报没了，日志里却还开着：§5.5 第 6 条在下一次装提醒时补一条 `lapsed`；会话一直不再走步时，面板按 2 小时的上限自己去掉。

晨报「例外」一节加一行「申报 n 次：放行 a（已用 u、作废 v）、不放行 d、没答 q」，数字取违规流水经 `classifyRecord` 分出的 `request`、`grant`、`grant-void` 三类：n 是 `asked` 的不同编号数，a 是 `approved`，u、v 是 `GrantRecord`、`GrantVoidRecord` 的条数，d 是 `declined`，q 是 `expired` 与 `closed`（评审第 2 轮 N14）。流水只用于计数：被删或被伪造时数字会错，不影响放行。

### 5.9 装了 M7 时：worker 的申报与自动推进的停等（评审第 3 轮 F13、F14）

问题。`d-one-main-agent` 的项目里写文件的是 M7 的 worker。它写工作区外时，M7 的 `worker-scope`（`prepend` 注册，最外层，M7 0.6 §3.2.1 第 2 条：目标必须在本次派发的工作树之内）先拒绝，不调 `next()`，guard 行看不到这次调用，不发编号；就算有了编号、人回了「可以」，0.3 的放行说明叫主 Agent「派一个子 agent 原样写」，在 M7 下派出去的不是只写工作树的 worker，就是只读的普通子 agent（`dispatch-chain-readonly`），照样被拒（F13）。另一处：放行要人的回话紧跟在以申报文字结尾的助手消息之后，而 `d-auto-drive` 下主 Agent 带着 goal 推进，DSH 的 `dsh-goal-round-driver` 在它一空闲就排进下一轮（README「What each round does」，lib:144–164〔实读〕），人读到申报文字再打字时，前一条助手消息多半已经不是它（F14，轮次时机由 README 推出〔推断〕）。

服务 `glmHournessRequests`（guard 行在 `apply` 里 `ctx.provide`，同 `src/graph/index.ts`:79 的做法；类型与读取函数在 `src/guard/request-service.ts`，M7、M3 只导入这个文件）：

```ts
export const REQUESTS_SERVICE = 'glmHournessRequests'

export interface OutsideCall {
  readonly agent: AgentLike                          // exec.agent of the denied call
  readonly tool: string                              // DSH native name
  readonly args: Readonly<Record<string, unknown>>   // the call's arguments as executed
  readonly base: string                              // the caller's working directory (workingDirectory.get)
  readonly task?: string                             // M7: the worker's task id, used in the approval note
}

export interface RequestsService {
  /**
   * For an outer gate that is denying this write (M7's worker-scope): when the target is outside the project (F19: the nearest
   * existing directory of the target does not belong to the project of `call.base`, and no containment root configured on the
   * row holds it), register the denial exactly as §5.1 step 1 does and return the ref and the exception sentence for a worker
   * (§5.2's third case). A target inside the project but outside the worker's worktree (the main checkout, another worktree)
   * returns undefined: the outer gate corrects it by its own rules, the human is not asked. Never throws.
   */
  outsideDenial(call: OutsideCall): { readonly ref: string, readonly exception: string } | undefined
  /** Read only (§5.6): an unused, unexpired, not-in-use grant matches this call's signature and dispatch root. Never throws. */
  peekGrant(call: OutsideCall): boolean
  /** Requests waiting for the human in one session, oldest first (§5.3 step 7). Never throws. */
  openRequests(sessionId: string): readonly { readonly ref: string, readonly askedAt: string, readonly target: string }[]
}

/** undefined when the guard row is not loaded or a member has the wrong type (problem is called once), as pricingService. */
export function requestsService(ctx: ServiceLookup, problem?: (message: string) => void): RequestsService | undefined
```

worker 写工作区外的一次（M7 那一侧的做法由 M7 写进它的 §3.2.1，§18 第 5 条请它加；下面是两边要对上的事）：

1. worker 调 `write` 写项目外的文件（写项目里但出了工作树的文件见第 2 条的 `undefined`）。`worker-scope` 判出目标在工作树之外时，先调 `peekGrant`：为 `true` 就不拒绝，调 `next()`，往里走到 guard 行，圈禁判为拒绝、放行簿匹配、使用时核对与备份、用掉放行（§5.6），写 `GrantRecord`。
2. `peekGrant` 为 `false` 时 `worker-scope` 照常拒绝，并调 `outsideDenial`：返回值不为 `undefined`（目标出了项目）时，用返回的 `exception` 换掉它纠偏的「例外」一句，`RuleDeny.ref` 写返回的编号（违规记录因此带 `ref`，§3.1 第 7 步）；为 `undefined`（目标在项目里、只是出了工作树，例如主检出或别的工作树；或 guard 行没加载）时纠偏照 M7 原样（M7 0.6 §3.2.1：「ask the main agent with ask_main; it can widen the write scope, then resubmit your plan」），不发编号、不问人。
   - 判法（评审第 4 轮 F19）：guard 行自己的圈禁根是行配置的 `workspaceRoots`，没配就是调用方 agent 会话头的 `cwd`（`src/guard/index.ts`:92–96 的 `rootsFor`〔实读〕）；M7 起 worker 时 `cwd` 是工作树的绝对路径（M7 0.6 §3.1.2），所以 worker 的圈禁根就是它的工作树，与 `worker-scope` 拒绝的是同一条边界，按圈禁根判「工作区外」时 worker 写主检出也会拿到编号，人被多问一次，题目还把项目自己的文件说成工作区外的文件，人批的就不是他读到的那件事（§12），放行之后 worker 绕过工作树、写入范围、审查与合入前的检查直接写主检出。`outsideDenial` 因此按项目判：目标按调用方的工作目录解析成规范路径，取它最近一个存在的目录 `d`；`projectOf(d)` 与 `projectOf(call.base)` 的 `root` 相同（主检出与它的工作树是同一个项目，§2.4），或目标在这个 `root` 之下，返回 `undefined`；`projectOf(call.base)` 为 `undefined`（工作目录不在任何项目里）时退回按圈禁根判；其余（出了项目，并且不在行配置的 `workspaceRoots` 之内）才登记编号。guard 行自己的圈禁对 worker 不变（它本来就该拦），这条只改 `outsideDenial`；`peekGrant` 对项目里的目标永远查不到放行，因为没有编号。
3. worker 照例外一句调 `ask_main {question, assumption}`，问题里写编号与目标，`assumption` 写「没有回答就交回，把编号与目标写进 questions」；M7 的 `worker-scope` 的 `rightPath` 认这一次 `ask_main`（问题里有这个编号）为走对。
4. 主 Agent 收到 M7 送来的请求通知，拿编号调 `request_exception`。编号登记时记下的派发链的根是 worker 的 `dispatchRoot`，也就是主 Agent（M3 §3.3.3；worker 由 M7 的 `startActivation` 起，会话头的 `parentSession` 是主 Agent 的会话〔推断，L3 `guard-request-worker` 核对〕），所以 §5.3 第 3 条的「属于调用方的派发链」成立。主 Agent 把申报文字放在回复最后、结束回合。
5. 人回「可以」。guard 行在主 Agent 会话里放行（放行按根，也就是主 Agent），说明的第二行是 §5.5 表里 worker 的那一句：主 Agent 用 `answer_worker` 回那条请求，worker 的 `ask_main` 返回，worker 原样再调一次，走第 1 步。第二次同样的调用 `peekGrant` 为 `false`，又被拒、拿新编号。
6. 时限：`ask_main` 至多等 20 分钟（M7 的 `ASK_WAIT_MS`），申报至多等 2 小时，放行在人回话之后 30 分钟内有效。人 20 分钟之后才回时，worker 已照它的 `assumption` 交回，编号在交回的 questions 里；放行说明的同一句让主 Agent 重新派这件活、用 `send_message` 告诉新的 worker 原样调一次，参数在说明里或 `requests/<编号>.call.json`（§5.5）。放行按根匹配，新 worker 同样能用。

自动推进的停等（F14）：

1. M7 的执行行在它给持有者会话装的 `agent/pre-step` 监听器里（M7 0.6 §3.9.5 判「都在等人」的同一处）读 `requestsService(ctx)?.openRequests(<持有者会话>)`。非空、而持有者的 goal 在跑（不是 `paused`、`blocked`）时 `goals.block(agent, ref, {code: 'hourness-waiting-human', message: 'Waiting for the person: request r-7k2m9q4x (C:\\Users\\me\\notes\\todo.md).'})`，与 `await_human` 用同一个原因码。之后每一步，原因里列的申报都不在 `openRequests` 里了、列的待决也都拍板或废弃时 `goals.resume`（M7 0.6 §3.9.5 的恢复规则加「列出的申报都已关闭」一句）。人一直不回时，2 小时一到由 guard 行的定时器关闭申报并叫醒持有者（§5.5 第 1 条），M7 在那一步恢复，推进不会一直停到夜间巡检（评审第 4 轮 N38）。
2. 时机：`request_exception` 在第 k 步返回 `ask`；第 k+1 步之前 M7 的监听器看到开着的申报就停住 goal；模型在第 k+1 步写回复、结束回合；goal 已是 `blocked`，驱动器不排下一轮〔推断：goal-round-driver 只在 goal 活着时排轮，lib:144–164；L3 核对〕。人的回话开出新的一回合，guard 行在它的第一步之前读到。
3. 只有持有者会话要停：申报只能由根 agent 提（§5.3 第 1 条），装了 M7 的项目里根 agent 就是主 Agent。
4. 没有 M7、人自己用 `/goal` 时没人停住 goal：`ask` 的说明最后一句叫主 Agent 在回复里告诉人「停下之后再回」（§5.3），§5.5 第 2 条每一回合提醒它回合末再出示一次；人恰好在两轮之间回话才放行，其余记 `not-shown`、申报留着，晨报计数（§11）。
5. guard 行不在（服务不在）时 M7 两处都跳过：没有圈禁，也就没有申报。

谁后合入谁加：M7 先合入时 G4 加这个服务并在 M7 的两处接上（改 M7 的文件，由 G4 的提交带上，按 `norm-review-floor` 全审）；G4 先合入时 M7 照这里接。L3：`guard-request` 加一遍「主 Agent 有活着的 goal、装着 goal-round-driver」（§14.1）；M7 合入之后另有 `guard-request-worker`。

## 6. 检查器运行与当轮回传（`m4-checks`）

`docs/ORCHESTRATION.md` §7.5：每次改完文件，由 harness 在执行边界跑相关检查，结果当轮回传给模型。rc.3 没有 LSP 诊断（§7.5 末条），由本层实现。

### 6.1 检查从哪来、谁同意、谁跑（`d-boards-as-hooks`，评审第 3 轮 F11、第 4 轮 F17）

人定两块板的每一条都是同一个样子：什么时候 + 可选的筛选 + 动作，动作是系统自带的或主 Agent 派子 agent 写的脚本，人看到原文同意后直接生效。编排方对 F17 的接缝裁定（`design-context.md`「Check entries seam」）补了三件事：会跑东西的循环板条目（一条命令、一条检查命令或一段脚本），不论插件带来还是人加，都走同一条同意的路，同意时给人看的是原文，不是转述；人加的检查是循环板上人的普通条目，由循环板的执行器跑，检查的命令文字取自项目的环境工具节点，节点与它的格式归 M4；M4 不执行人加的条目，它自带的检查器仍是插件交来的数据，M4 可以继续执行，在板上列出、只能看。循环板 0.6 已照此写好它那一侧（§2.3 的 `LoopCheckAction`、§4.4、§5.3、§6.6 的 `runCommand` 与 `commandDetail`、§7.1、§17 M4 一节）。0.4 把每一项检查都定成人加的条目、由 env 行执行，与这条裁定相反，也漏了「给人看原文」这道防线（F17）；0.5 改回两种检查，各走各的路：

| | M4 自带的检查器 | 人加的检查 |
| --- | --- | --- |
| 是什么 | 环境工具节点验收条件里带适用范围（`when`）的检查行（§6.1.1），人批准节点之后生效；在板上是 env 行交来的一项只能看的 `env.checks-after-edit`（`self`，`by: 'glm-hourness/env'`） | 循环板上人的普通条目：`when` 为 `env.files-edited`，`filter` 为改到的文件，动作 `check {tool, check?, report, timeoutSeconds?, note?, to?, glmSpend?}`（循环板 0.6 §2.3），`argv` 由循环板在提议时经 `checkCommandOf` 读出、存进条目 |
| 命令文字在哪 | 工具节点的检查行 | 同一个工具节点的检查行（带不带 `when` 都行） |
| 谁同意 | 人批准那个工具节点（图的批准，验收条件批准之后只有人能改）；命令原文随时在板上看得到（`details`） | 循环板的一条路：`loop_propose` 返回命令原文与注意事项（`commandDetail`），`propose_to_human` 把它们原样接在四行之后给人看，`record_human_answer` 核对到人看过原文才让循环板写入，`acceptProposal` 没有「已给人看原文」的记号就 `invalid`（循环板 0.6 §7.1 第 1–4 步）；工具节点上的命令之后改过，条目不再跑（`check-changed`），要人再同意（`repin`） |
| 谁跑、什么时候 | env 行，在改了文件的那个 agent 的下一步之前，至多等 20 秒；进程经 `runCommand` 的 `queue: 'direct'` 起，不排在循环板的脚本后面，并发由 M4 管 | 循环板的执行器 `runCommand` 的 `queue: 'check'`，在 `env.files-edited` 进收件箱、过了去抖之后；一个项目同时至多 2 个、单独一队、工作目录是改动所在的检出、超时 5–1800 秒（循环板 0.6 §6.6） |
| 结果给谁 | 改文件的那个 agent，下一步之前，一条 `<system-reminder>`（§6.5） | 条目的 `to`：主 Agent 或事件里的那个会话（循环板 0.6 §6.4 末段），一般晚几步到 |
| 超时与失败 | §6.3、§6.5 | 循环板的执行器与条目写明的办法（`d-script-timeout`） |

同一个工具节点的一条带 `when` 的检查行，M4 自带的检查器一定会跑；人再给它加一条 `check` 条目，它在改完文件之后会再跑一次（异步、结果按条目的设置交）。`checkCommandOf` 的结果带 `own: true` 告诉循环板这一点，页面在人加的那一项下面写「M4 自带的检查器也跑这一条」（循环板 0.6 §5.3 末段）。不带 `when` 的检查行只是一条命令的定义，M4 自己不跑，只供人加的条目引用；人要一条检查只在某些情形下跑、或结果交给主 Agent 而不是改文件的 agent 时，用这种。

为什么自带的检查器仍从工具节点取，而不是也要人在四行里看一遍：裁定允许 M4 继续执行它自带的检查器（「M4 may keep executing them」），它们是插件交来的数据，不是人加的条目；在 `ownRules` 之外，`details` 把每条检查的命令前 60 个码点写在板上，人随时看得到跑的是什么。这条防线比人加的条目弱：人批准工具节点时看到的是节点（标题、用途、验收条件），不保证细读了命令；所以自带的检查器只读状态为 `approved`、`doing`、`done` 的节点，验收条件批准之后只有人能改（`docs/ORCHESTRATION.md` §2.9），命令不经 shell，执行器的环境里没有 DSH 凭证与 GLM 密钥，在项目目录里跑，超时结束整棵进程树，日志第一行记下展开后的参数表（§11 不可逆表）。人要这条防线和人加的条目一样硬时，把检查行写成不带 `when` 的定义、再加一条 `check` 条目引用它（这时同意时人看到的是命令原文），M4 就不会自己跑它。

#### 6.1.1 环境工具节点上的检查行（M4 的格式）

环境分支（§7.1）下每个工具节点的验收条件里，可以有任意条检查行：

| 写法 | 含义 |
| --- | --- |
| `` `check <名字> <格式> $ <命令>` when <条件>[, <条件>…] `` | M4 自带的检查：改完的文件满足任一条件时跑这条命令 |
| `` `check <名字> <格式> $ <命令>` `` | 只是一条命令的定义，M4 自己不跑，人加的 `check` 条目可以引用（`checkCommandOf` 的 `own` 为假） |
| `` `config <路径>[, <路径>…]` `` | 这个工具的配置与基线文件（相对仓库根，不含 `..`），`checker-config` 读它（§4.4） |

- `<名字>`：`^[a-z][a-z0-9-]{0,23}$`，同一个节点里不重复；循环板的 `check` 动作用它指哪一条（节点只有一条检查行时可以不写）。
- `<格式>`：`eslint-json`、`tsc`、`lines` 之一（§6.4）。
- `<命令>`（`splitArgs`，`src/env/check-entry.ts`，纯函数）：按空格切成参数表，一项可以用双引号括起来包含空格（引号去掉，项里不能再有双引号）；除此之外什么都不解释，`$`、`%`、反引号、`;`、`|`、`>` 都是普通字符；1–64 项，每项 1–2000 个字符，不含 NUL 与换行；第一项是程序，要能不经 shell 直接起（`node`、`git` 或 `.exe`；写成 `.cmd`、`.bat` 的被拒；Windows 上 `npx` 一类解析到 `.cmd` 的，执行器在起进程之前判出并记 `crashed`，原因写「请写成能直接起的程序，例 node 加脚本路径」，循环板 0.6 §6.6）；`{files}` 只能单独作为一项、至多一处；第一项的文件名（去掉扩展名、小写）是 `pwsh`、`powershell`、`cmd`、`sh`、`bash`、`zsh`、`fish`、`dash` 之一时，命令里不能有 `{files}`（这些程序会把后面的参数拼回一段命令再解释；要按改动文件跑 shell 逻辑就写成脚本条目，文件列表从标准输入的 JSON 拿）。不合语法的行由 `checkLineRefusal` 给出原因，跳过，行健康写「<节点 id> 第 n 条检查行读不懂：<原因>」。
- `<条件>`：循环板 `paths` 的写法（目录前缀以 `/` 结尾，文件，`*.<扩展名>` 在任何一层目录都算，`**` 匹配零个或多个目录；循环板 0.6 §2.2），比法用循环板的 `matchesFilter`（`src/loops/trigger.ts`），M4 不另写一份。0.3 的 `.ts` 写法随之改成 `*.ts`。
- 只认已批准的节点（状态 `approved`、`doing`、`done`）。工具节点由 LLM 提议、人批准（`initialStatus` 对工具节点为 `proposed`）。
- 本仓库的两个节点（§18 由编排者提议）：

  ```text
  ESLint：`check eslint eslint-json $ node node_modules/eslint/bin/eslint.js --format json --pass-on-unpruned-suppressions {files}` when *.ts, *.mts, *.js, *.mjs, *.tsx
  ESLint：`config eslint.config.js, eslint-suppressions.json`
  TypeScript：`check tsc tsc $ node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --pretty false` when *.ts, *.mts, *.tsx
  TypeScript：`config tsconfig.json`
  ```

  〔本机实测 2026-10-29〕单文件 ESLint（类型感知规则）2.6–2.9 秒，`tsc --noEmit -p tsconfig.json` 1.9 秒，都在 `C:/Users/29596/Desktop/Project/GLM-Hourness` 上。ESLint 读仓库根的 `eslint-suppressions.json`，基线里的告警不出现，所以回传的就是新发现。`--pass-on-unpruned-suppressions`：agent 修好一条被压制的告警之后，那条压制就用不上了，不带这个参数时 ESLint 以退出码 2 结束（H18），按 §6.5 算一次失败，连续 3 次后本会话不再跑 ESLint；过期的压制交给 `npm run lint` 的棘轮（`scripts/check-lint.mjs` 对它报失败，`npm run lint:update` 缩小基线）。两条都直接跑 `node`，不经 `npx`。knip、jscpd、gitleaks 对整个仓库跑、慢，留在汇合门禁（M7 `norm-merge-gate`）。

#### 6.1.2 人加的检查：M4 给循环板的三样东西

循环板 0.6 §17 M4 一节要三样，名字由 M4 定。它们放在 `src/env/env-service.ts`（循环板只导入这个文件，§2.2）：

```ts
export const ENV_SERVICE = 'glmHournessEnv'

export type CheckFormat = 'eslint-json' | 'tsc' | 'lines'

export interface CheckCommand {
  readonly tool: string                       // tool node id
  readonly check: string                      // the line's name
  readonly title: string                      // human words: "<tool title>：<name>"
  readonly argv: readonly string[]            // placeholders left in ({files}); argv[0] startable without a shell
  readonly format: CheckFormat
  /** The line has a `when`: M4's own checker runs it too (§6.1). The loop board writes "M4 自带的检查器也跑这一条" under the entry. */
  readonly own: boolean
}

export interface EnvService {
  /**
   * One check line of an approved tool node of the project of `cwd`, read from the graph now.
   * undefined: no graph, node missing or not approved, line missing or not valid (checkLineRefusal), or the node has several
   * check lines and `check` is not given. Never throws. The loop board calls it when a `check` entry is proposed and before every run;
   * a different argv than the entry holds makes the run `refused` (`check-changed`), undefined makes it `refused` (`check-missing`).
   */
  checkCommandOf(cwd: string, tool: string, check?: string): Promise<CheckCommand | undefined>
}

/** undefined when the env row is not loaded or a member has the wrong type (problem is called once), as pricingService. */
export function envService(ctx: ServiceLookup, problem?: (message: string) => void): EnvService | undefined

/**
 * Fill {files} of an argv from the changed files of one run (relative to the checkout root the run's cwd is; the loop board gives
 * the union of the run's events, already matched against the entry's filter). Pure. `{files}` becomes one item per file; a name that
 * starts with '-' gets './' in front, so a program does not read it as an option (review F53 of the loop board); a path with a
 * newline or NUL is skipped; the whole command line stays under COMMAND_LINE_LIMIT (28,000 characters): files that do not fit are
 * dropped, counted in `dropped`. An argv without {files} comes back unchanged.
 */
export function fillCheckArgv(argv: readonly string[], files: readonly string[]): { readonly argv: readonly string[], readonly used: number, readonly dropped: number }

/**
 * The result of one run as findings (§6.4), without the changed-line marks (those need git and the editing session).
 * undefined: the output is not readable in that format, and the exit code is not 0; the loop board then reports the exit code
 * and the tail of the output as it does for a script. At most 20 lines of at most 200 characters.
 */
export function formatCheckOutput(format: CheckFormat, run: { readonly stdout: string, readonly stderr: string, readonly exitCode: number }): { readonly findings: number, readonly lines: readonly string[] } | undefined
```

- `checkCommandOf` 在 env 行启用时才有（服务由 env 行 `ctx.provide`）；env 行没启用或 M4 没合入时循环板的 `check` 条目一律 `refused`（`check-missing`），页面写「跑检查要项目环境那一部分启用」（循环板 0.6 §6.6），循环板的 S3 步也已这样写。`fillCheckArgv` 与 `formatCheckOutput` 是纯函数，循环板直接导入。
- 人加的检查的提议、同意与写入全在循环板；M4 不读、不写、不执行这些条目，也不要求循环板给 M4 读条目的函数（0.4 §18 第 5 条的第 ①②④ 点作废）。
- 例：人说「改了 .ts 就跑一遍类型检查，没过告诉改文件的那个 agent」，主 Agent 用 `loop_propose` 提 `{when: {kind: 'event', events: ['env.files-edited']}, filter: {files: {paths: ['*.ts']}}, action: {kind: 'check', tool: '<TypeScript 工具节点的 id>', check: 'tsc', report: 'on-failure', to: 'event-session'}}`；循环板经 `checkCommandOf` 读出命令，返回的 `detail` 里有这条命令的原文与注意事项，主 Agent 原样接在四行之后给人看，人同意、主 Agent `record_human_answer`、循环板写入。

没有循环板时（循环行没启用、或这个进程没有会话控制器）：M4 自带的检查器不跑，env 行不交事件，环境提醒照常（§7.2），行健康写「循环板不在：改完文件不跑检查」。理由：检查是项目的规矩，要在板上看得到（`d-rules-visible`），板不在就没有地方列出，不让它悄悄跑；循环行与 env 行同在编排层包里，出厂都禁用，启用的次序由批次 L4 定（§13.4）。

本仓库的两项检查就是 §6.1.1 的两个工具节点：它们带 `when`，是 M4 自带的检查器。自举开始、本仓库的开发改在 DSH 里由主 Agent 做之后，由编排者按 §18 第 4 条提议这两个工具节点，人批准即生效；要再加异步的一份（例如 worker 的工作树里改完后另跑一遍全项目的 `tsc`），由人在主 Agent 的对话里提 `check` 条目。

为什么不放进 `norm-merge-gate`：那里是合入前对整个项目跑的命令，这里是每次改完对改动文件跑的命令，触发的时刻与输入不同；合入前的检查清单在规则板「会挡住动作的门」，改完就跑的检查在循环板（循环板 0.6 §2.4 第 1、3 行）。

### 6.2 检查哪些文件

env 行给每个 agent 装一条步 notice（`installStepNotice`，`src/shared/step-notice.ts`，`agent/pre-step`，agent-loop:901–925）。每步从请求可见的历史（`session.deriveMessages()`）推出：最近一条检查结果 notice（来源 `hourness-checks`）之后，这个 agent 的助手消息里的文件工具调用块（`write`、`edit` 的 `file_path`，`str_replace_editor` 除 `view` 外的 `path`；`toolCallArguments`），且它们的结果不是错误（`toolCallOutcomes`）。历史里记的是模型调用的名字：GLM 会话里是别名（`Write`、`Edit`），经延迟工具调用的是 `DeferredToolCall`。所以每个调用块先经 `unwrapDeferredCall`（`src/shared/deferred-call.ts`，§3.3）拆开 `DeferredToolCall`（名字取参数的 `name`、参数取 `input`），再经 `toNativeTool(dialectService(ctx), name)` 换成原生名，才按上面的名字与字段匹配；方言服务不在时用静态别名表（`toNativeTool` 自带的回退）。路径按会话的当前工作目录解析（`workingDirectory.get`，同 guard），只取文件现在仍存在的。状态都在会话里，所以续跑、重启后不重复也不遗漏；压缩把旧调用移出可见历史后，那些文件不再补查。

为什么不用 `tools/post-execute`：它在每次调用提交时按模型顺序依次 await（agent-loop:551–575 的 `commitReady`），在那里等检查会让同一步的并行写入一个个排队；`agent/pre-step` 每步只等一次，同一步改的几个文件一起查。`docs/DESIGN.md` §6 列的两条通道都可用，这里选后者。

推出的改动文件就是这一次 `env.files-edited` 的 `files`（评审第 4 轮 N40）：按文件所在的检出分组，每个文件向上找 `.git`（目录或文件，工作树也算）得到它所在的检出的根 `root`，`files` 写成相对这个 `root` 的路径、正斜杠，与 §6.3 跑检查用的 `cwd` 是同一个根。M7 的 worker 在 `<仓库>/.worktrees/t` 里改 `src/a.ts` 时，`files` 是 `src/a.ts`、`root` 是工作树的根，筛选 `src/` 的条目对得上；0.4 写成相对项目根（工作树归到主检出），会得到 `.worktrees/t/src/a.ts`，目录前缀对不上。一步里改的文件落在几个检出里就算几组，每组一个事件；至多 200 个文件，多的丢掉并置 `truncated`。

事件交给循环板的 `emit`（载荷 `files`、`root`、`truncated`，`session` 是改文件的那个会话，`cwd` 是它的工作目录）。键是 `files-edited:<会话>:<turn>-<step>`，`turn` 与 `step` 取自交这个事件的那次 `agent/pre-step` 的载荷（循环板 0.6 §4.4）；同一步有几组时第一组用这个键，其余各在 `step` 后加 `-<序号>`（从 2 起）；载荷里没有 `turn`（别的宿主版本）时写 `p<这个进程启动的毫秒>-<本进程里这个会话第几次交这个事件>`。先调 `loopsService(ctx)?.listens('env.files-edited', <cwd>)`：没人听（没有生效的人加条目听它）时不交，`emit` 的 `unheard` 返回也算没交；循环板不在时不交。交事件不影响 M4 自带的检查：它们不读收件箱，按下面一段当场跑。

env 行对每个 `CheckEntry`（§6.1.1 里带 `when` 的检查行，来自 `envBranch(graph)`）用循环板的筛选比法 `matchesFilter`（`src/loops/trigger.ts`，env 行导入它，不另写一份）在每一组的 `files` 里算出对得上的文件；一个也对不上的检查这一步不跑。有改动却没有任何检查对得上的扩展名，走 §6.6。每次运行经 `recordRun` 报（§6.8）。

### 6.3 运行

`src/env/runner.ts`（只跑 M4 自带的检查器；人加的检查由循环板的执行器跑，不经这里）：

- 进程由两块板共用的执行器起（接缝裁定：「the script runner in one shared module that both boards import」，归循环板，`src/loops/script.ts`）。M4 的每次运行是一次 `runCommand({queue: 'direct', project, cwd, argv, timeoutMs, maxOutputBytes, logFile})`（循环板 0.6 §6.6 的 `CommandRequest`）：`direct` 一路不排队，同时跑几个由 M4 自己管，信封可以没有（标准输入给空、立即关闭）。执行器负责：不经 shell 起进程（`argv`）；`argv[0]` 先经 `resolveProgram` 解析成 `PATH` 里项目之外的绝对路径，跳过项目根与工作树里同名的程序（libuv 在 Windows 上先看子进程的工作目录，放在那里的 `node.exe` 会顶替 `PATH` 上的那个，循环板 0.6 评审 F53）；在项目目录里跑、环境里只有名单上的变量，没有 DSH 凭证与 GLM 的密钥；超时结束整棵进程树；输出有上限。M4 不自己 `spawn`，`src/env/` 里别处不出现 `node:child_process`（L2 静态检查）。循环板里没有为 M4 加执行器的参数：`cwd`、超时、输出上限三个都是 `CommandRequest` 已有的字段，0.4 要它加的三项由 `queue: 'direct'` 接住。
  - `cwd` 是改动文件所在的检出的根（§6.2 的 `root`），M7 的 worker 工作树因此在自己的目录里跑；执行器要求它等于主检出或 `git worktree list` 里的一个根，否则 `refused`（`outside-project`），M4 写「没跑成」并写行健康。
  - 超时取 `CHECK_COMMAND_MS`，60 秒；输出上限 1 MiB（解析用），多的截掉，日志里写明截了多少。
  - 检查不是拦路的事件，`d-boards-as-hooks` 里「超时或崩溃时放行还是拦下」那一项对它不适用。对照 `d-script-timeout`（评审第 4 轮 N37）：不拦路的条目有自己的超时，超时的结果写「没跑完」交给人或 agent，下一次触发照常再跑，超时的次数进周报，反复超时的提议修。M4 的做法：结果交给改文件的那个 agent（`d-boards-as-hooks` 允许「条目指定的 agent」，改文件的人是它，它能立刻修）；超时写 `eslint did not finish: timed out after 60 s (log …)`（§6.5），`recordRun` 记 `failed` 并写 `reason: 'timeout'`，循环板的周报要数超时时有数据可读（循环板 0.6 §6.11 今天只数自己的脚本，M4 的 `self` 条目要不要也数是循环板的事，§18 第 5 条）；超时不算进「连续失败 3 次后本会话不再跑」，下一次改动照常再跑；同一项检查上一次还在后台跑（超时之前）时这一步不起第二个，等它的结果。连续 3 次的上限只用于跑不起来与输出读不懂这两种每次结果都一样的失败（§6.5）。
- `{files}` 的展开用 `fillCheckArgv`（§6.1.2，纯函数）：每个对得上的改动文件一项，相对 `cwd`、正斜杠，以 `-` 开头的名字前加 `./`；路径里有换行或 NUL 的文件不进参数表，提醒里写「跳过 <文件>：路径里有换行」；整条命令行不超过 28,000 个字符，放不下的文件丢掉并在提醒里写「还有 N 个文件没查」。不加任何引号：参数直接到程序手里。L2 用真实子进程：路径含 `$(echo pwned > x)`、反引号与 `%PATH%` 的文件名原样到夹具程序的 `process.argv` 里，跑完不产生 `x`；`argv[0]` 为 `pwsh` 且带 `{files}` 的检查行被 `checkLineRefusal` 拒绝；以 `-` 开头的文件名到程序手里是 `./-x.ts`。
- 同一步的各项检查并行；全进程至多同时 2 个检查进程，其余排队（M4 自己管，`direct` 一路不替它排队）。
- 日志写进 `<项目目录>/env-checks/<会话 id 前 8 位>/<时间>-<检查 id>.log`（`logFile`）：第一行是展开 `{files}` 之后的完整参数表（`$ ` 加上每一项，含空格的项加双引号，只为人读，不再交给任何 shell）与执行器解析出的程序路径；之后是标准输出与错误。项目目录不在时不写日志，提醒里写「没有日志（没有项目目录）」。目录不用 `checks/`：本仓库的 `scripts/check-lint.mjs` 把 jscpd 的报告写进 `.llm/checks` 并在之后整个删掉（`JSCPD_REPORT_DIR`），放在那里的日志每跑一次 `npm run lint` 就没了。
- 缓存：同一文件的大小与修改时间没变、检查行的内容没变（节点的 `rev` 没变）时不重跑同一项检查。
- 轮转：env 行激活时删掉 `<项目目录>/env-checks/` 下修改时间超过 7 天、且名字是 8 位十六进制的会话目录；名字不合的不碰。
- 等待：步 notice 至多等 20 秒（`CHECK_STEP_DEADLINE_MS`）。没跑完的检查继续在后台跑，结果按会话留在内存里，下一步的 notice 带上；进程重启后丢失，下一次改动再查。

### 6.4 输出格式

`src/env/parsers.ts`，每种格式产出 `{file, line, column?, source, rule?, message}`：

| 格式 | 读什么 | 例 |
| --- | --- | --- |
| `eslint-json` | ESLint 内置的 `json` 格式：文件数组，每项 `filePath` 与 `messages[{line, column, ruleId, message, severity}]` | `npx eslint --format json` |
| `tsc` | 每行 `<file>(<line>,<col>): error TS<n>: <message>`（`--pretty false`） | `tsc --noEmit` |
| `lines` | 每行 `<file>:<line>[:<col>]: <message>`（gcc 风格；ruff 的 `concise`、shellcheck 的 `-f gcc`、clang-tidy、go vet 都是这样） | `ruff check --output-format concise {files}` |

退出码不决定有没有发现：有的检查器有发现时退出 1。读不出任何一行、而退出码不是 0 时记为「输出读不懂」。三种解析器同时是 `formatCheckOutput`（§6.1.2）的实现：人加的检查由循环板的执行器跑完之后，循环板可以调它把输出整理成发现数与至多 20 行 `文件:行 说明`；它不标改动行（那要 git 和改文件的会话），读不懂返回 `undefined`，循环板照脚本的样子交退出码与输出末尾。

改动行的范围（`src/env/changed-lines.ts`）：在 git 仓库里取 `git -C <仓库根> diff -U0 --no-color HEAD -- <文件>`（`execFile`，不经 shell，5 秒上限）的新侧行号，未跟踪的文件整个算改动；不在 git 仓库里时，`edit` 取 `new_string` 在现在文件里的位置（`replace_all` 时每一处），其余整个文件算改动。所以「改动行」是相对 HEAD 改过的行，包括这一会话里更早的未提交改动。发现落在改动行上的标 `[changed]`，其余标 `[elsewhere in file]`。env 行不读 guard 行的内存，两行互不依赖。

### 6.5 提醒的样子

来源 `hourness-checks`（`createUserNotice`，`<system-reminder>` 包装，`docs/DESIGN.md` §6），`source.checks` 记这次查到的最后一个工具调用 id 与各项检查的计数：

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
- 检查跑不起来、输出读不懂时，那一项写成 `eslint did not run: <原因的第一行> (log …)`；超时写成 `eslint did not finish: timed out after 60 s (log …)`（N37）。
- 同一项检查在一个会话里因跑不起来或输出读不懂连续失败 3 次后，本会话不再跑它，notice 写一次「eslint skipped for this session after 3 failures (log …)」，行健康写明，`recordRun` 记 `skipped`；超时不计入这 3 次，下一次改动照常再跑（§6.3，`d-script-timeout`）。
- 检查行读不懂、或节点不再是已批准的，这一项不跑，行健康写明；不提醒模型（它改不了批准之后的验收条件）。人加的检查条目的命令在节点上改过时不跑、要人再同意，那是循环板的事（循环板页面写「命令改过，等你再同意」，循环板 0.6 §6.6）。
- 每项检查的名字用检查行的 `<名字>`（例 `eslint`、`tsc`）；notice 的 `source.checks` 记这次查到的最后一个工具调用 id 与各检查 id（`<工具节点 id>/<名字>`）的计数。

### 6.6 没有检查器时

改动文件没有被任何自带的检查（带 `when` 的检查行）覆盖时，每个会话每种扩展名在检查结果 notice 里加一行（只一次）。给主 Agent：`No check covers .py files in this project. Propose a tool node under the env branch with graph_propose and put the check line in its acceptance conditions, for example: check ruff lines $ ruff check --output-format concise {files} when *.py. The community default for Python is ruff. The check runs after your edits once the human approves the node. If you want a check to run another way (on a different trigger, with its result sent to the main agent), propose a loop board entry that points at the line with loop_propose.`；给子 agent：`No check covers .py files in this project; mention it in your final result so the main agent can propose one.`（`graph_propose` 的节点要人批准；`loop_propose` 只有主 Agent 能用，循环板 0.6 §7.3）。这一行同时是检查行的示范（`d-agent-examples`，F20）：主 Agent 写检查行时读到的就是它，例子的领域是 Python 项目的 ruff，与练习题无关；L2 让它过 `checkLineRefusal` 与 `splitArgs`，语法一改示范跟着失败。默认方案取自 `docs/ORCHESTRATION.md` §7.5 的表（`.py` ruff；`.go` go vet；`.rs` clippy 的 `--message-format short`；`.sh` shellcheck `-f gcc`；`.c`、`.cpp` clang-tidy；`.ts`、`.js` tsc 与 ESLint）。这就是 §7.5 说的那件要人定的事：主 Agent 把它放进下一批交给人的事里（`d-chat-not-cards`、`d-design-onepage`），人批准节点之后下一次改动就跑。循环板不在时这一行写「No checks run in this project: the loop board is not enabled.」，每个会话一次。

### 6.7 告警棘轮与压制注释数

`docs/ORCHESTRATION.md` §7.6 的四条在 M4 之后由这些地方守：

| §7.6 | 谁守 |
| --- | --- |
| 新增告警一律拦下，基线只减不增 | 每次改完的回传只给新发现（§6.4，本仓库的批量压制）；汇合门禁跑项目的检查命令（M7 `norm-merge-gate`；本仓库的 `npm test` 含 `npm run lint`，棘轮在 `scripts/check-lint.mjs`） |
| 压制注释写理由并挂节点 | `suppression-reason`（§4.3），影子期之后生效 |
| 把检查配置改松走决策卡 | `checker-config`（§4.4），转生效后经申报（§5）；删掉或改松一项自带的检查是改工具节点的验收条件，批准之后只有人能改；删掉或改动一项人加的检查是改循环板上的条目，只能经主 Agent 在对话里提、人同意（§6.1，循环板 0.6 §7.1） |
| 压制注释总数单独作为一项指标 | 下面的计数 |

压制注释计数（`src/env/suppressions.ts`，任务 `m4-suppressions`）：env 行每天第一次跑检查时（或第一次给某个仓库的会话装 notice 时），对仓库的已跟踪文件（`git ls-files -z`，跳过大于 1 MiB 的与二进制的）按 `SUPPRESSION_MARKERS`（§4.3）计数，追加 `{at, repo, total, byMarker}` 到 `<项目目录>/audit/suppressions.jsonl`；同一仓库同一天（UTC+8）只记一次；指标服务在时同时交一条计数事件（§3.11）。晨报「例外」之后加一行「压制注释 N 处（本期 +a / −b）」，取本期第一条与最后一条。计数在后台跑，不阻塞任何一步；失败只记行健康。

### 6.8 交给循环板的两项（`d-rules-visible`，评审第 3 轮 F11）

`d-rules-visible`（人 2026-10-30「没问题，项目所有规则确实应该都在明面上」）把改完文件就跑的检查器放到循环板，循环板 0.6 已写好它那一侧（§2.4 第 3–5 行、§4.4、§5.3 第 15、16 项、§17 M4 一节）。env 行与图行各交一份：

| | env 行（`src/env/loop-entry.ts`） | 图行（`src/graph/loop-entry.ts`） |
| --- | --- | --- |
| 来源 | `{plugin: 'dsh-hourness', row: 'glm-hourness/env'}` | `{plugin: 'dsh-hourness', row: 'glm-hourness/graph'}` |
| 事件 | `env.files-edited`（「一个 agent 改了文件」；字段 `files`，`strings`，筛选 `paths`；`root`，`string`；`truncated`，`boolean`，筛选 `is`；人能选，`personSelectable: true`，不是 `listedOnly`）：env 行每步算出改动文件之后经 `emit` 交进收件箱（§6.2），人加的条目听它；M4 自带的那一项不读收件箱，在那一步之前当场跑 | `graph.third-reopen`（「同一件活第三次重开」；没有字段；只供列出，`listedOnly`） |
| 条目 | `env.checks-after-edit`：`title`「改完文件就跑检查」，`why`「改完文件马上知道有没有新问题」，`when` 为 `env.files-edited`，`action` 为 `{kind: 'self', does: '跑这个项目里批过的检查，结果在那个 agent 的下一步交给它', by: 'glm-hourness/env'}` | `graph.third-rework`：`title`「同一件活第三次返工之前：停下问你」，`why`「同一处反复修不好，常常是问题没找对」，`when` 为 `graph.third-reopen`，`action` 为 `{kind: 'self', does: '在这件活下面提一件要你定的事，由主 Agent 在对话里问你', by: 'glm-hourness/graph'}` |
| `ownRules`（「<名字>自己的规矩」，由常量生成，不另写数字） | 四行：「一步至多等 <CHECK_STEP_DEADLINE_MS/1000> 秒，跑得慢的在之后的步里送到」「每项检查 <CHECK_COMMAND_MS/1000> 秒超时；超时算没跑完，下一次改动照常再跑」「跑不起来或输出读不懂连续 <CHECK_FAILURE_LIMIT> 次后，这个会话不再跑那一项」「改了没有检查覆盖的语言的文件时，每个会话每种语言提醒 <MISSING_CHECK_NOTICES> 次」 | 一行：「LLM 第 <REOPEN_LIMIT> 次重开同一件活时问你；你答过之后再数 <REOPEN_LIMIT> 次」 |
| `details(entry, project)` | 本项目每条带 `when` 的已批准检查行一行：「<工具标题>：改了 <`when` 的人话> 之后跑 · <命令前 60 个码点>」，至多 20 行；读不到时返回空表。不带 `when` 的检查行不列（它们不是自带的检查） | 不给 |
| `recordRun` | 每次把检查结果交给 agent（含后台送到的那次）报一次，`entry` 是 `env.checks-after-edit`：`{cwd, entry, outcome: 'ran'（都没有发现）或 'reported'（有发现）或 'failed'（有一项没跑成、超时或输出读不懂）或 'skipped'（连续失败后不再跑）, durationMs, exits: [这次各项检查的退出码], reason?}`；有一项失败时 `reason` 写 `<检查名>: <原因>`，超时写 `<检查名>: timeout` | 每提一次待决报一次：`{cwd, entry: 'graph.third-rework', outcome: 'reported'}`；提议失败报 `failed`，`reason` 写引擎的错误码 |

- 交法照循环板 0.6 §3.1：各行在 `apply` 里 `ctx.inject([LOOPS_SERVICE], sub => { const r = sub[LOOPS_SERVICE].contribute(source, contribution); if (r.ok) sub.effect(() => r.dispose) })`，循环行后到或重启时自动重交，卸载时自动撤回；循环板不在时什么都不做。`inject` 对本包 `ctx.provide` 的服务不生效时（循环板 0.6 §10.2 V12 的推断不成立），照它写的退路：每次 `agent/created` 时 `loopsService(ctx)?.contribute(...)`，同一个来源再交只是替换。
- `contribute` 返回 `ok: false`、`dropped` 非空、或 `recordRun` 抛错时：控制台告警一次，行健康写明「交给循环板的 <id> 没被收下：<原因>」，检查与提问照常。
- 常量：`CHECK_STEP_DEADLINE_MS = 20_000`、`CHECK_COMMAND_MS = 60_000`、`CHECK_FAILURE_LIMIT = 3`、`MISSING_CHECK_NOTICES = 1`（`src/env/runner.ts` 导出）；`REOPEN_LIMIT = 3`（`src/graph/reopen.ts` 导出）。`ownRules` 的句子由这些常量拼出，改常量就是改板上的字。
- `recordRun` 只认 `self` 条目的 id（循环板 0.6 §3.1），M4 只报自己的 `env.checks-after-edit`；人加的检查由循环板的执行器自己记（`loop-fired`、`loop-done`），M4 不报、也不需要循环板为 M4 加认人的条目的接口（0.4 §18 第 5 条的第 ④ 点作废）。
- L2 契约测试（`tests/env-loop-entry.spec.ts`、`tests/graph-loop-entry.spec.ts`）：两份交来的内容交给循环板的 `src/loops/model.ts` 校验，全部被接受，`ownRules` 的每一行等于由常量拼出的句子，长度在循环板 0.6 §2.1 的上限内（至多 6 行、每行至多 80 个码点）。它要导入循环板的模块，所以由 E3、R1 与循环板 S1（`src/loops/trigger.ts`、`model.ts`）里后合入的一方加；先合入的 M4 一侧只测自己那份的形状（字段齐、长度在上限内）。L4：走查一次循环板页面（§13.4 第 8 项）。

## 7. 环境分支与草稿区（`m4-env`）

### 7.1 环境分支

- 位置：图上 id 为 `env` 的特性节点（`docs/ORCHESTRATION.md` §7.1「环境是项目图上的一个分支，每个工具一个节点」）。非目标节点要有父节点（`src/graph/format.ts`:344–350），所以 `env` 挂在项目的一个目标下；本仓库挂在 `hourness` 下（§18）。固定 id 的做法同 M7 的 `norm-merge-gate`；引擎允许提议时指定 id（`planPropose`，`src/graph/engine.ts`:327–331）。
- 工具节点：`env` 的子节点，类型 `tool`。正文标签（M3 的 `labeledSections`，`src/graph/stage.ts`:61）：`用途：`、`用法：`、`选择理由：`、`安装位置：`；验收条件里放 `config` 行（配置与基线文件，写法 `` `config <路径>[, <路径>…]` ``，相对仓库根、不含 `..`，`checker-config` 读它，§4.4；0.2 放在正文的 `配置：` 标签里，正文模型能改，评审第 2 轮 N23）。`check` 检查行（M4 自带的检查器与人加的检查条目引用的命令，写法见 §6.1.1）也放在验收条件里，批准之后只有人能改。0.4 曾把检查行取消、整个搬到循环板上，与编排方的接缝裁定相反，0.5 改回（§6.1）。`选择理由` 里写查过的现成方案（`docs/ORCHESTRATION.md` §7.2 的查找顺序）。
- 读取：`envBranch(graph)`（`src/env/branch.ts`，纯函数）返回 `{tools: [{id, title, usage, configs, checks, status}], issues}`，`checks` 是读得懂的检查行 `{name, format, argv, paths | undefined}`；只列已批准的工具，提议中的另计数（「2 个工具等人批准」）；不合语法的 `config` 行与检查行跳过，行健康写「<节点 id> 第 n 条 config 行读不懂」「<节点 id> 第 n 条检查行读不懂：<原因>」。`checkCommandOf` 用同一份解析（§6.1.2）。

### 7.2 会话里的环境提醒

env 行的第二条步 notice（来源 `hourness-env`），只在三种时候注入，与项目图投影同一种「只在变化时」的做法（M3 抽出的 `src/graph/digest-notice.ts`；M3 没有先做时由 E2 抽出，规则板 §16 同样约定谁先做谁抽）：会话第一步、正文摘要变化（环境分支被改）、压缩之后。

```text
<system-reminder>
Project tools (graph node env). Use these before writing your own.
- ESLint [tool-3]: npm run lint.
- gitleaks [tool-5]: npm run check:secrets.
2 more tool nodes wait for the human's approval.
Checks run after each edit (listed on the loop board): eslint on *.ts, *.mts, *.js, *.mjs, *.tsx; tsc on *.ts, *.mts, *.tsx.
One-off scripts go in .llm/scratch/ (git-ignored). Delete them or promote them (move into scripts/ with a graph node) before you hand back.
</system-reminder>
```

- 每个工具一行：标题、id、`用法：` 的第一行。至多 12 个工具、1500 字符，多出的写「N more: graph_show env」。
- 检查一行：本项目 M4 自带的检查（已批准工具节点上带 `when` 的检查行，§6.1.1）的名字与适用范围，以「; 」连起来，至多 300 字符；没有这样的检查行时写「No checks run after edits in this project yet.」；循环板不在时写「No checks run after edits: the loop board is not enabled.」。人加的检查是循环板上的条目，结果由循环板送给主 Agent 或改文件的会话，不在这一行里（M4 不读那些条目）。检查行变了（增删、节点的 `rev` 变）也算环境变化，下一步重新注入。
- 图里没有 `env` 时只有草稿区一行。图行不在或会话没有图目录时同样只有这一行。
- 不分路由；子 agent 也收到（它们同样会写脚本）。

### 7.3 草稿区

- 位置：会话工作区根下的 `.llm/scratch/`（`SCRATCH_DIR`，`src/guard/scratch.ts`）。`.llm/` 是工作区里 LLM 的私有目录（`docs/CHARTER.md` §9），数据目录服务的项目目录也在那里；不新建工具专用的顶层目录（条款 10）。M7 的 worker 工作树各有自己的 `<工作树>/.llm/scratch/`。
- git 忽略（`ensureLlmIgnored(项目根)`，`src/shared/llm-ignore.ts`，§2.4）：追加这一步用 `src/data/project-root.ts` 的 `ensureIgnored(项目根, '.llm')`（规则板的最小一片已建，仓库里只留一份追加的实现；0.4 写的是自己追加两行，作废），M4 的 `ensureLlmIgnored` 只在它前后加「已做过」的记录与复核。env 行第一次为某个仓库的会话装 notice 时、guard 行第一次往某个项目的 `.llm/` 写记录之前（每个进程每个仓库一次，两行共用一份「已做过」的记录，模块级）：
  1. `gitDirOf(项目根)` 找 git 目录；不在 git 仓库里、或 `.git` 不是目录（项目根总是主检出，所以不会遇到工作树的 `.git` 文件）时什么都不做。
  2. 读 `<git 目录>/info/exclude`（文件不在时视为空）。已有一行去掉首尾空白后是 `.llm`、`.llm/`、`/.llm`、`/.llm/` 之一：不追加。没有：在末尾追加一行 `.llm/`，原文件末尾没有换行时先补一个。只有这一行，没有注释行：`ensureIgnored` 不写注释，gitignore 只认行首的 `#` 为注释，同一行里模式之后的 `#` 是模式的一部分（评审第 1 轮 F3），所以不把注释和模式写在同一行。
  3. 追加之后用 `git -C <项目根> check-ignore -q .llm/scratch/x`（`execFile`，不经 shell，5 秒上限）复核：退出码 0，行健康写「已把 .llm/ 写进 .git/info/exclude」。
  4. 复核仍为 1（项目的 `.gitignore` 里有反向模式 `!/.llm/` 一类）：行健康降级「写了 .llm/ 但仍未被忽略：<原因>」，原因用 `git check-ignore -v --no-index .llm/scratch/x` 的输出；这个进程不再追加。`ensureIgnored` 写不进（抛错）时同样降级，M4 照常写记录（留痕不能丢），下一次进程再试。

  这一份本地文件不入库，删掉这一行即可撤回；M7 对 `.worktrees/` 用同样的做法。本仓库的 `.gitignore` 已经忽略 `.llm/`（`git check-ignore -v` 实测命中 `.gitignore:3`），第 2 步就结束，不会改动。L2 用真实的临时 git 仓库测：未忽略时追加后 `git check-ignore -q` 的退出码为 0；重复运行三次，文件里只有一行 `.llm/`；`.gitignore` 带 `!/.llm/` 时行健康降级。
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
| H13 | 会话日志：`<DSH home>/sessions/<工作区>/session-<id>/session.v4.jsonl(.zstd)`，压缩时是一串独立的 zstd 帧；事件 `tool/call {turn, step, callId, name, arguments}`、`tool/result {message{role, toolCallId, content, isError}}`、`request/header {header{config{provider, model}}}` | 回放（只读 §3.6 列出的字段：`tool/result` 只读 `toolCallId` 与 `isError`） | session-persistence-jsonl:750–756、1138–1230；agent-loop:681–700、1226–1240〔实读〕；〔本机实测 2026-10-29：719 个日志逐帧解码，字段名如上〕 | 实读与本机实测；格式随 DSH 升级可能变（§11） |
| H14 | Node `zlib.zstdDecompressSync`（Node 22.15 起，实验性） | 回放解码 | 本机 Node v22.20.0 可用〔本机实测〕；回放在 Kiro 或终端里跑，不在宿主里 | 本机实测 |
| H15 | 图行服务 `dirFor(cwd)`、`isGraphTool`；M3 加的 `focusOf(session)` | 环境分支、`config` 行；申报文字背景一行的焦点标题（读不到就省去） | `src/graph/service.ts`；M3 §2.1 | 本仓库契约 |
| H16 | 数据目录服务 `glmHournessData` 的 `userHome`、`projectHome` | 凭证路径；会话不在 git 仓库里时项目目录的退路（§2.4） | `src/shared/data-home.ts` | 本仓库契约 |
| H17 | `tools/post-execute` 瀑布 `(exec, result, next)`，可附 `additionalContexts`；先例 repeat-tool-reminder | 不用（§6.2 的取舍） | tools:3599–3627；repeat-tool-reminder:2247–2259 | 实读，不用 |
| H18 | ESLint 10.13 带压制文件时，被检查的文件里有用不上的压制就以退出码 2 结束，除非带 `--pass-on-unpruned-suppressions` | 本仓库的 ESLint 检查条目 | `node_modules/eslint/lib/cli.js`:497–505、`lib/options.js`:322〔实读〕 | 实读 |
| H19 | 用户角色消息的来源：DSH 客户端经接口送来的人的消息是 `source {kind: 'user', rpcId, clientTimeZone?, principal?}`；headless 任务、父 agent 写给子 agent 的任务、命令、计划模式、ACP、SDK 送来的是 `{kind: 'user'}`、没有 `rpcId`；插件的提醒带 `form: 'notice'` | 只认客户端送来的人的话作批准（§5.5） | api-session-controller:3224–3229（`prompt`）；subagent:3195–3200（人在子会话里输入）、1461（父 agent 的任务）；headless:345；commands:338；plan-mode:221；acp:835；sdk-jsonrpc-server:161；DSH 自己按同一判断认客户端消息：client-file-upload:296–297〔实读 2026-10-30〕 | 实读；桌面版上的消息形状〔未核实，L4 第 1 项读会话日志核对〕 |
| H20 | 本机接口的鉴权：进程启动令牌换签名 cookie，签名密钥存在 Harness home 的凭证里 | §11 的剩余风险（shell 能否冒充客户端） | client-connection:276–301、415–445、499–522〔实读〕 | 实读 |
| H21 | `createUserNotice(kind, summary, text, facts)` 的事实字段原样存进消息的 `source`；步 notice 追加的消息随这一步提交进会话日志 | 申报的关闭与作废提醒（§5.5 末段），面板与重启之后的核对读它 | `src/shared/dsh-min.ts`:462–469〔实读〕；agent-loop:1066–1073（领出的消息在 `step()` 里写进会话） | 本仓库契约与实读 |
| H22 | `dsh-goal-round-driver`：agent 空闲、goal 活着且已 arm、轮次有余时经 `followup` 排进 `source {kind: 'goal'}` 的一轮；goal 为 `blocked` 时不排 | §5.9 自动推进的停等（M7 停 goal，M4 不碰 goal） | goal-round-driver README「What each round does」、lib:144–164〔实读，评审第 3 轮〕；「`blocked` 时不排」〔推断，L3 `guard-request` 的 goal 一遍核对〕 | 推断 |
| H23 | 循环板服务 `glmHournessLoops`：`contribute`（交事件声明与 `self` 条目，含 `details`、`ownRules`）、`emit`（`env.files-edited`）、`listens`（没人听就不交）、`recordRun`（只认 `self` 条目）；共用的筛选比法 `matchesFilter`（`src/loops/trigger.ts`） | §6.1、§6.2、§6.8 | 循环板 0.6 §3.1、§4.4、§2.2、§17 M4 一节；0.4 请加的读条目函数与扩展名筛选不再需要（扩展名由 0.6 的 glob 接住，读条目的函数随人加的检查归循环板而撤回） | 本仓库契约（循环板未实现） |
| H24 | 两块板共用的执行器 `src/loops/script.ts`：`runCommand({queue: 'direct' \| 'check', project, cwd, argv, timeoutMs, maxOutputBytes, logFile})`、`resolveProgram`、`commandDetail`；不经 shell、项目目录、无凭证的环境、超时结束进程树、输出上限 | §6.3（M4 自带检查器用 `direct`）；人加的检查由循环板用 `check`（M4 不调） | 循环板 0.6 §6.6、F50、F53 | 本仓库契约（循环板未实现） |
| H25 | 项目根模块：`projectOf(cwd, home?)`、`gitDirOf(root)`、`ensureIgnored(root, directory)` | 流水按项目找目录（§2.4）、`outsideDenial` 按项目判（§5.9）、回放按项目筛会话（§3.6）、让 `.llm/` 不进 git（§7.3） | `src/data/project-root.ts`〔实读 2026-10-30：规则板最小一片建，仓库唯一的项目根模块〕 | 已在 main |

## 10. 外部输入的校验

| 输入 | 必填 | 规则 | 不合法时 |
| --- | --- | --- | --- |
| `request_exception` 参数 | 见 §5.3 的表 | 同左 | 工具错误 `invalid`，不登记、不写任何东西 |
| 申报编号 | 是 | `^r-[0-9a-z]{8}$`，在内存拒绝表里，属于调用方的派发链，2 小时内 | `not_found`、`forbidden`、`expired` |
| 人的回话 | — | 来自客户端（`source.kind: 'user'` 且有字符串 `rpcId`）；紧跟在以 `tail` 结尾、没有工具调用的助手消息之后；规范化之后整句在同意词或不同意词表里 | 不放行：`not-client`、`not-shown`（申报都留着）、`unclear`（换确认句，第 3 次关闭），§5.5 |
| 工具节点的检查行（`check`，§6.1.1） | 否 | `<名字>` 合 `^[a-z][a-z0-9-]{0,23}$` 且节点内不重复；`<格式>` 三选一；命令切成 1–64 项，每项 1–2000 个字符、不含 NUL 与换行；`{files}` 只能单独作为一项、至多一处；第一项不是 `.cmd`、`.bat`；第一项的文件名是 shell（§6.1.1 的名单）时不能有 `{files}`；`when` 可以没有，有时至少一项，写法是循环板的 `paths`（`*.<扩展名>` 等） | `checkLineRefusal`（`src/env/check-entry.ts`）给出原因：这一行跳过，行健康写「<节点 id> 第 n 条检查行读不懂：<原因>」；`checkCommandOf` 对它返回 `undefined`，人加的 `check` 条目因此 `refused`（`check-missing`） |
| `checkCommandOf(cwd, tool, check?)` 的入参 | 是 | `cwd` 是绝对路径；`tool` 是节点 id；`check` 合名字的写法 | 返回 `undefined`，不抛错 |
| `fillCheckArgv(argv, files)` 的入参 | 是 | `argv` 是 `checkCommandOf` 给的那份；`files` 相对检出的根、正斜杠 | 带换行或 NUL 的路径跳过，放不下的文件丢掉并计数（`dropped`），不抛错 |
| `personTitle(title, {limit, issuesOf})` 与 `displayPath(path)` 的入参 | 是 | 图上的标题与调用的路径是数据，不信任 | 标题不合格返回 `undefined`；路径总能显示（转义、截短） |
| `outsideDenial`、`peekGrant` 的入参 | 是 | `tool` 是原生名；`args` 是对象；`base` 是绝对路径 | 不合时返回 `undefined` 或 `false`，控制台每个会话告警一次；不抛错（M7 的门照它原样拒绝）。目标在项目里（`projectOf` 相同）时 `outsideDenial` 也返回 `undefined`（F19） |
| 工具节点的 `config` 行 | 否 | 写在验收条件里（§6.1）；逗号分隔的相对路径，不含 `..` | 跳过这一项，行健康写明 |
| 检查器的输出 | — | §6.4 的三种格式；至多读 1 MiB | 「输出读不懂」，日志里有原文 |
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
| 回话：人一直不回 | 2 小时 | 登记申报时设的 `unref` 定时器到点；定时器丢了（重启、会话卸载）就在下一步或会话卸载时比较时刻 | 申报作废；经 `agent.followup` 送一条关闭提醒叫醒持有者，装了 M7 时 M7 在那一步恢复推进（N38） | 关闭提醒 | `expired` |
| 申报文字写不出 | `renderPlan` 抛错（常量不合格，harness 的 bug）、读目标之外的任何抛错 | `request_exception` 第 6、7 步的捕获 | 不登记申报、不写流水；agent 在回复里直接告诉人要什么、为什么（F18） | `unavailable`，`hint` 写明 | 会话日志；行健康降级并写明原因，控制台每个会话一次 |
| 回话：步 notice 出错 | 读历史抛错等 | `installStepNotice` 的 `build` 里捕获 | 这一步不放行、申报留着，下一步再读 | 照常 | 行健康降级；控制台一次 |
| 回话：goal 一轮接一轮跑（没有 M7，人自己用 `/goal`） | 人的回话落在下一轮的工具调用之后 | §5.5 第 3 条 | 不放行，申报留着；每一回合首步提醒 agent 回合末再出示；`ask` 的说明叫它告诉人停下之后再回 | 说明一条 | `not-shown`，晨报计数（§5.9 第 4 条） |
| 申报开着时 M7 没停住推进 | M7 那一侧没接 `openRequests`，或 `goals.block` 抛错 | L3 `guard-request` 的 goal 一遍；`not-shown` 计数上升 | 同上一行 | 同上 | M7 的行健康；`not-shown` |
| 关闭提醒没写进会话 | 会话卸载、之后不再走步 | 面板按 `ask` 结果的时刻算 2 小时 | 面板到时去掉；下一次走步时补 `expired` 或 `lapsed` | — | 流水的 `expired`（会话卸载时写） |
| 外层的门要编号、查放行 | guard 行没加载（服务不在）；入参不合 | `requestsService` 为 `undefined`；入参校验 | M7 照它原样拒绝，没有编号（没有圈禁也就没有申报）；入参不合返回 `undefined`、`false` | M7 的纠偏 | 控制台每个会话一次 |
| worker 等不到回答 | 人 20 分钟内没回 | M7 的 `ask_main` 超时 | worker 交回，编号在 questions 里；人之后同意时，说明叫主 Agent 重派这件活并让新 worker 原样调一次 | 交回 | M7 的交回记录；`RequestRecord` |
| 放行之后的说明：参数文件 | 写 `requests/<编号>.call.json` 失败、没有项目目录 | 抛错 | 说明里只写工具与目标，提醒内容要与被拒的那次相同 | 说明一条 | 行健康降级 |
| 行重新加载、进程重启 | 内存里的拒绝表、申报与放行都丢了 | — | 人之后的「可以」只是普通消息；agent 重调被拒的调用拿新编号、再申报，人再回一次 | 圈禁的纠偏（新编号） | 违规流水 |
| 放行：目标变了 | 使用时的 `stat` 与申报文字里的事实不同 | 比较 | 拒绝，放行作废；agent 重新申报，人看新的事实 | `Error: The target changed since the human approved …` | `GrantVoidRecord` |
| 放行：核对目标 | `stat` 出错（权限等） | 抛错 | 当作「目标变了」处理：拒绝、作废 | 同上，`<变了什么>` 写错误码 | 同上 |
| 放行：备份 | 复制失败 | `copyFile` 抛错 | 拒绝这次调用，放行留着；agent 再调或问人 | `Error: the approved write was not run: …` | 行健康；违规流水不写 `GrantRecord` |
| 放行：并行 | 同一步里两次同签名调用 | 「使用中」集合 | 第二次照常拒绝 | `Error: …`（圈禁的纠偏） | 违规流水 |
| 第三次修复之前提问 | 提议被拒 | 引擎的结果 | 下一次重开再判 | `graph_status` 的 `notice` 写原因 | 会话日志；`recordRun` 记 `failed` |
| 按项目找流水的目录 | 会话没有工作目录、不在 git 仓库里 | `projectRoot` 为 `undefined` | 退到数据行的 `projectHome`，再没有就不落盘 | 照常 | 行健康「无项目目录，违规不落盘」（同今天） |
| 项目的 `.llm/` 没被 git 忽略 | 追加 `.llm/` 失败（`ensureIgnored` 抛错）或复核仍未忽略 | `ensureLlmIgnored` 的结果 | 照常写记录（留痕不能丢）；这个进程不再追加 | 照常 | 行健康降级「项目的 .llm/ 没有被 git 忽略：<原因>」 |
| 交给循环板 | `contribute` 返回 `ok: false` 或有 `dropped`；`recordRun` 抛错；循环板不在 | 返回值、捕获 | 检查与提问照常；没有地方列出 | — | 控制台一次；行健康「交给循环板的 <id> 没被收下：<原因>」 |
| 自带检查器：循环板不在 | `loopsService` 为 `undefined`（循环行没启用，或这个进程没有会话控制器） | 读服务 | 这一步不跑检查，也不交 `env.files-edited`；环境提醒写「循环板不在」 | notice 一行（每个会话一次） | 行健康「循环板不在：改完文件不跑检查」 |
| 人加的检查：M4 的读法不在 | 循环板在，env 行没启用、`checkCommandOf` 返回 `undefined`（节点或那一行不在、节点未批准、检查行读不懂）或命令与条目里存的不同 | 循环板在提议时与每次跑之前调读法 | 循环板的事：提议返回 `invalid`，运行结局 `refused`（`check-missing`、`check-changed`），页面写原因（循环板 0.6 §2.3、§6.6）；M4 不执行这类条目，没有降级可做 | — | 循环板的记录与行健康；env 行读不出检查行时写自己的行健康 |
| 检查：检查行读不懂 | 节点上的检查行 `checkLineRefusal` 不过 | 解析环境分支时 | 这一行不跑，别的行照常 | — | 行健康「<节点 id> 第 n 条检查行读不懂：<原因>」 |
| 跟进：各行拿到不同的记录器实例 | 宿主给行加载了两份 `followup.js` | L3 场景 `guard-followup` 的核对 | 跨行的跟进少记（guard 行自己的仍对）；改为经服务共享记录器 | — | 探针失败 |
| 记录分类 | 流水里有读不懂的行 | `classifyRecord` 返回 `unknown` | 不算拒绝、不算影子 | — | 晨报「N 行记录读不懂」 |
| 检查：命令 | 找不到程序、起不来（含解析到 `.cmd`）、退出码非 0 且输出读不懂、超时 | 执行器报的启动错误、退出码、超时 | 执行器结束进程树。跑不起来与输出读不懂连续 3 次后本会话不再跑这一项；超时不计入，下一次改动照常再跑（`d-script-timeout`，N37） | notice 里一行原因与日志路径 | 日志；行健康；`recordRun` 记 `failed`（超时写 `reason: 'timeout'`）或 `skipped` |
| 检查：结束进程树 | 执行器报告没能结束 | 执行器的结果 | 不再等它；执行器报告进程退出之后才释放并发名额 | notice 写「could not stop」 | 行健康「N 个检查进程没能结束」 |
| 检查：一步等太久 | 超过 20 秒 | 计时器 | 后台继续，下一步送到 | notice 写「still running」 | — |
| 环境提醒：图 | 图读不出、没有 `env` | 读图 | 环境提醒只有检查一行与草稿区一行；自带的检查读不到检查行，这一步不跑（人加的检查不受影响，它们的命令由循环板在提议时读过、存在条目里，每次跑之前再读；读不出时 `refused`） | 照常 | 行健康 |
| 草稿区忽略 | 写 `.git/info/exclude` 失败；写了之后 `git check-ignore` 仍不为 0（例如项目的 `.gitignore` 里有 `!/.llm/` 一类的反向模式） | 抛错；追加之后的复核 | 不重试，这个进程里不再追加（重启后先查已有的等价行，有就不再追加）；`scratch-only` 照常判 | — | 行健康降级「草稿区没有被 git 忽略：<原因>」 |
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
| git 命令丢掉没提交的改动或改写历史 | 不拦 git（`d-main-agent-shell`）；会丢工作的 git 命令执行前由 M3 的 git 快照门先存快照、记下、告诉主 Agent 怎样恢复（M3 附录 0.5 §2.5）。M4 的规则不判 git |
| 检查命令执行任意命令 | 两道，对应两种检查（§6.1）。人加的检查：只有走循环板那一条路写入的条目才跑，`loop_propose` 返回命令原文与注意事项（`commandDetail`），`propose_to_human` 原样给人看，`record_human_answer` 核对到人看过原文才拍板，`acceptProposal` 没有「已给人看原文」的记号就 `invalid`（循环板 0.6 §7.1 第 1–4 步；这一道由循环板守，M4 的读法只负责给出命令）；节点上的命令之后改过，条目不再跑（`check-changed`），要人再同意。自带的检查器：只读已批准节点上带 `when` 的检查行，验收条件批准之后只有人能改，命令原文在板上随时看得到（`details`），比人加的条目弱——人批准节点时不一定细读命令，所以要像人加的条目一样硬时，把检查行写成不带 `when` 的定义、再加 `check` 条目引用它。两种共同的：命令不经 shell，改动文件作为单独的参数，程序是 shell 时不收文件参数，文件名里的命令替换无从展开；`argv[0]` 解析成 `PATH` 里项目之外的绝对路径；执行器的环境里没有 DSH 凭证与 GLM 密钥；超时结束整棵进程树；日志第一行记下展开后的参数表 |
| 删除文件 | 只删 env 行自己的日志目录（名字为 8 位十六进制，在 `<项目目录>/env-checks/` 下）与 §8 的三个脚本（删除前地址写进文档，提交信息记 SHA-256，快照不动；C1 按 `norm-review-floor` 全审） |
| 改用户的仓库 | 只在 `.git/info/exclude` 末尾追加一行 `.llm/`（经 `ensureIgnored`；本地、不入库、删掉这一行即可撤回；已有等价的行时不追加） |
| 读用户的会话 | 回放只读工具名、命令文本与路径（D2，人 2026-10-30「不介意」），另读模型名、工作目录与 `isError` 三样元数据；不读对话正文、写入的内容与任何工具输出（F16）；结果只写项目的 `.llm/`；进仓库的样本先脱敏、再过密钥扫描 |
| 写进别的项目 | 流水、标注、备份、日志只写会话所在项目的 `.llm/`，项目根从会话的工作目录算；写之前确认 `.llm/` 被 git 忽略（§2.4） |

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
| 给人看的四行只有一份规则 | `src/graph/proposal.ts`（M3）；`renderPlan` 只加题目、「附」与问话，内含对 harness 常量的换词检查；图上的标题与调用的路径是数据，进字串之前经 `personTitle`、`displayPath`，不让数据把 `renderPlan` 弄抛错；第三次修复由 M3 渲染 | 格式再改只改一处；不让 harness 写出人没学过的词 |
| 人加的检查只经循环板那一条同意的路写入，M4 不执行 | 循环板的存储与同意路径（`commandDetail` 的原文、「已给人看原文」的记号，循环板 0.6 §7.1）；M4 的 `src/env/` 里没有读人加条目的代码，也没有 `node:child_process` | 同意与存放只有循环板一处；会跑东西的条目同意时给人看的是原文（接缝裁定） |
| M4 自带的检查只来自已批准的工具节点上读得懂的检查行 | `envBranch(graph)`（只列 `approved`、`doing`、`done` 的节点，`checkLineRefusal` 过的行）；运行前再查一次 | 验收条件批准之后只有人能改；读取处过滤、运行处再查 |
| 改动文件名从不经 shell 解释 | `src/env/check-entry.ts` 的 `fillCheckArgv` 与 shell 名单；执行器不经 shell 起进程 | 不拼命令行，就没有引号要转义 |
| 外层的门凭 `peekGrant` 放行时，放行仍只在 guard 行核对与用掉 | `peekGrant` 只读；`GrantBook` 的消耗只在 `installRuleGate` 第 8 步 | 一个放行至多用一次的保证只在一处 |
| 申报只对出了项目的目标发编号 | `outsideDenial` 按 `projectOf` 判，项目里的目标返回 `undefined`（F19） | 项目里的文件归 M7 的写入范围、审查与合入前的检查管；人批的就是他读到的那件事，不把项目自己的文件说成工作区外 |
| 每个项目的运行时记录只在它自己的 `.llm/` | `projectHomeFor`（`src/shared/data-home.ts`） | 读与写都按会话的项目根算 |
| 标注不改变行为 | `measure.ts` 是纯函数，只被命令行、晨报与阶梯读 | 度量与执行分开 |
| 回放不写 `~/.dsh`、不读对话正文、写入内容与工具输出 | `src/guard/replay.ts` 只用读文件的接口、解码时只留 §3.6 的字段（`tool/result` 只留 `toolCallId` 与 `isError`），输出目录由调用方给 | 只读；D2 的边界在一处守 |
| 进入仓库的样本已脱敏 | `sanitizeCase`；`npm test` 的密钥扫描兜底 | 两道 |

## 13. 实施顺序

每步一个提交，提交信息带节点 id；文档与代码同一提交（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`（L3，`docs/DEVELOPMENT.md` §1.1）。「今天必败」是这一步新增的 L2 检查在今天的代码上怎样失败，用来证明检查钉住了新行为。

开工条件：从 main 建分支（`9c346fb` 或之后）。G4 等 M3 第 4 步合入（`dispatchRoot`，`src/guard/main-agent.ts`）；`focusOf` 没合入时申报文字省去背景一行的焦点半句，不等它；`src/graph/proposal.ts` 没合入时 G4 照附录 §3.3 建。R1 等 M3 第 6 步（提议式待决、`record_human_answer` 的 `question` 一种、不带四行的 `propose_to_human`，§4.6）。E3 等循环板里 M4 要导入的几样合入：`src/loops/trigger.ts`（`matchesFilter`）、`model.ts` 与 `service.ts`（`contribute`、`emit`、`listens`、`recordRun`）、两块板共用的执行器 `script.ts`（`runCommand` 的 `queue: 'direct'`、`resolveProgram`）（循环板 S1、S3，§6.1、§6.3、§13.3）；人加的检查要 E3 的 `glmHournessEnv` 与两个纯函数，循环板在那之前把这类条目一律判 `refused`（`check-missing`）。E2 用 M3 第 5 步的 `src/graph/digest-notice.ts`，M3 没先做时由 E2 抽出。G1–G3、E1、E2、E4、C1 不等别的设计。

推进与问人（`d-auto-drive`、`d-design-onepage`）：人放行本设计之后，主 Agent 按本节的顺序自己推进到做完：派活、审查、合入；子 agent 与审查用什么模型由主 Agent 选并记理由（`d-main-agent-models`），harness 只记录。M4 里必须停下来问人的只有：D1（开工之前，与放行一起问，§17）；某条影子规则达到判据、要转生效（§3.5）；第三次修复（§4.6）。运行中的申报（§5）是使用者当时的事，不是开发流程的一步。开发中发现的问题按 `d-design-onepage` 分三档，M4 的例子在 §13.5；问题攒着问，一次至多三件。

评审：`norm-review-floor` 规定改到拦截与权限（guard 规则、写入范围、主 Agent 与子 agent 的工具面）、删文件的改动一律全审，由 harness 按改动的文件与命令判断，主 Agent 绕不过去。M4 里落在清单上的是 G1–G4（都改 `src/guard/`，G4 另给所有 agent 的工具面加 `request_exception`）与 C1（删文件），之后每一次改规则的模式、改可申报名单、改同意词表也是。其余各步的深浅由主 Agent 定（`question-38` C），下表写建议。

### 13.1 步骤

| 步 | 内容 | 主要文件 | 层 | 评审 | 今天必败 |
| --- | --- | --- | --- | --- | --- |
| G1 | 规则模式与影子判定：`RuleMode`、`judge`（保留全部生效拒绝）、`installRuleGate`，guard 行与 `installGraphFileGuard` 改经它安装，`evaluate` 删除；`RuleShadowRecord`、`call` 字段、`recordKey`、`keyOf`、`classifyRecord`（含规则板的 `rule-record`、`late-denial`）与 §3.2 的全部记录类型，晨报两处过滤改用它；声明只列生效规则；规则目录与契约测试；file-tools-only 的例外换成新文案（§5.2；`APPLICATION_PROTOCOL` 已由 `61be79a` 删掉，圈禁的例外 G1 不动，N34）；按项目写流水与读流水（`projectHomeFor`、`projectJournal`、`ensureLlmIgnored`，项目根用 `src/data/project-root.ts` 的 `projectOf`，§2.4），晨报读会话所在项目的流水 | `src/guard/rules.ts`、`gate.ts`、`records.ts`、`catalog.ts`、`index.ts`、`graph-files.ts`；`src/shared/data-home.ts`、`src/shared/llm-ignore.ts`（E2 未先建时）；`src/memory/audit.ts`；`src/graph/index.ts`（流水按项目）；`src/workflow/morning-report.ts`；`tests/guard-audit.spec.ts`、`tests/guard-gate.spec.ts`、`tests/contracts.spec.ts`、`tests/workflow.spec.ts`；探针场景 `glm`、`non-glm-guard` 的纠偏期望；`docs/ORCHESTRATION.md` §6.1、§6.5 | L1、L2、L3（全部现有场景照旧通过，纠偏期望按新文案改） | 全审（`norm-review-floor`：guard 规则） | 一条 `mode: 'shadow'` 的测试规则今天会拦下调用；同一条测试规则交给图行的安装路径时没有影子记录；`judge`、`installRuleGate`、`classifyRecord` 不存在；一条带 `rule`、不带 `mode` 的 `{kind: 'followup'}` 记录今天被晨报算成「违规」；一条 `effect: 'queue'` 的规则板记录今天被算成「违规」；一条 `rules:` 开头的 `mode: 'record'` 或 `mode: 'late'` 的记录今天两边都不收（`src/workflow/morning-report.ts`:38–39 只认没有 `mode` 的拒绝与 `mode: 'shadow'`），晨报里看不到它们；两个临时仓库里的会话今天写进同一份流水（数据行的 `projectHome`）；file-tools-only 的例外今天是 `ASK_THE_HUMAN` |
| G2 | 跟进记录（`observe` 接进 `installRuleGate`；拆 `DeferredToolCall`；按 `tool/call` 的步号跳过同一步；`turn/end` 与会话卸载记 `none`；没有 `tool/call` 事件的调用不结算）；标注、统计、`PROMOTION`；回放（D2 选 B：只读命令、路径与三样元数据，拆包，「当时拦没拦」对项目的流水，F16）；回归语料（七条事故种子手写）与测试；命令行；晨报两行（走对 x/y 另数停下的次数，N30）；交给指标流水的事件（§3.11） | `src/guard/followup.ts`、`gate.ts`、`measure.ts`、`replay.ts`、`corpus.ts`、`cli.ts`、`metrics.ts`、`index.ts`；`src/shared/deferred-call.ts`（E3 未先建时）；`scripts/guard/cli.mjs`；根 `package.json`；`tests/guard-corpus/`、`tests/guard-corpus.spec.ts`、`tests/guard-followup.spec.ts`、`tests/guard-measure.spec.ts`、`tests/guard-replay.spec.ts`（夹具是测试里现造的多帧 zstd 日志）、`tests/fake-rc3.ts`；`src/workflow/morning-report.ts`、`tests/workflow.spec.ts`；`docs/DEVELOPMENT.md` 加命令行一节 | L2、L3（`non-glm-guard` 与 `glm` 场景核对一条跟进记录；新场景 `guard-followup`） | 全审（同上） | 拦截后的下一次调用不留记录；连续两次被 `graph-files-only` 拒绝不留 `repeat`；GLM 路由上经包装的 `request_exception` 之后没有 `right-path`；`ruleStats` 不存在；晨报没有「已标」「走对」；`decodeSessionLog` 与回放不存在（夹具里出错结果的标记串的检查因此先失败） |
| G3 | 判定上下文；`mention.ts` 抽出；四条影子规则；`docs/ORCHESTRATION.md` §6.4 改写 | `src/guard/context.ts`、`mention.ts`、`credential-read.ts`、`suppression.ts`、`checker-config.ts`、`scratch.ts`、`graph-files.ts`（只改导入）、`index.ts`、`catalog.ts`；`src/shared/suppression-markers.ts`（E4 未先建时）；`tests/guard-shadow-rules.spec.ts`；探针场景 `guard-shadow-rules` | L2、L3 | 全审（同上） | 读凭证文件、写不带理由的 `eslint-disable`、改 `tsconfig.json`、在仓库根新建 `fix.py` 都不留记录 |
| G4 | 申报通道：编号与带编号的拒绝文案（三种情形）、`request_exception`（含 `busy` 的 5a 条与 `lines`）、申报文字（`renderPlan` 用 `proposal.ts` 的四行规则；题目里的路径与背景里的焦点标题走 `displayPath`、`personTitle`，工具对任何抛错都有 `unavailable` 的退路，F18）、`request_exception` 说明里的示范 `REQUEST_EXAMPLE`（F20）、读人的回话（步 notice、同意词表、确认句、每一回合的再出示、关闭与作废的提醒带事实字段）、放行簿（内存、使用时核对、备份、一次、`peekGrant`）、服务 `glmHournessRequests`（`outsideDenial` 按项目判，`peekGrant`，`openRequests`；申报 2 小时的定时器，N38）、圈禁覆盖 `str_replace_editor`、晨报一行；M7 已合入时一并接上 M7 的两处（§5.9） | `src/guard/request.ts`、`request-service.ts`、`gate.ts`、`rules.ts`、`index.ts`；`src/graph/plan-text.ts`；`src/graph/proposal.ts`（M3 第 6 步未合入时）；`src/graph/plain-question.ts`（M3 第 3 步未合入时）；`src/shared/tool-names.ts`；`tests/guard-request.spec.ts`、`tests/plan-text.spec.ts`、`tests/fake-rc3.ts`、`tests/contracts.spec.ts`；探针场景 `guard-request`（含 goal 一遍）、`guard-request-refuse`；`src/workflow/morning-report.ts`；`docs/ORCHESTRATION.md` §5、§6.1 | L2、L3；L4 随批次 | 全审（guard 规则、权限与工具面） | 圈禁的纠偏没有编号；`request_exception` 没有注册；`str_replace_editor create` 写工作区外放行；人回「可以」之后同一调用仍被拒；`requestsService` 读不到；申报开着、一回合首步没有人的消息时没有再出示的提醒；焦点节点标题是「补齐验收条件」时今天（`renderPlan` 对整句查换词）申报文字写不出；`outsideDenial` 对 worker 写主检出的调用返回编号。另有两例今天恰好通过、留作防回归：向流水追加伪造的 `RequestRecord` 与 `GrantRecord` 之后同一个工作区外的写入仍被拒；一条不带 `rpcId` 的「可以」不放行 |
| E1 | env 行骨架与登记、行健康 `env` | `src/env/index.ts`；`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（`name: dsh-hourness/env`）、`packages/hourness/package.json`（`./env` 与 `./env/locale/*.json`）、`packages/hourness/locale/env/en.json`、`zh.json`（设置页标题：「开发环境」/「Dev environment」与一句说明）、`packages/hourness/tsconfig.json`（随表）、`src/shared/health.ts`、`tests/contracts.spec.ts`、`tests/health.spec.ts`；`docs/DESIGN.md` §2.2、§2.5、§7 | L1、L2、L3（`hourness-only` 场景里 `env` 行生效） | 主 Agent 定（建议轻审） | 行 id 清单与 `HOURNESS_ROWS` 没有 `env`；`npm run preflight` 报没有 `./env` 导出与 `locale/env/` |
| E2 | 环境分支读取（`config` 行）、环境提醒（检查一行在 E3 之前写「No checks run after edits in this project yet.」）、草稿区忽略（经 `ensureIgnored` 追加一行、去重、复核）、`scratchLeftovers` | `src/env/branch.ts`、`notice.ts`、`index.ts`；`src/shared/llm-ignore.ts`（G1 未先建时）；`src/guard/scratch.ts`（只加 `scratchLeftovers`，若 G3 未到则 E2 建这个文件的这一部分）；`tests/env-branch.spec.ts`、`tests/env-notice.spec.ts`、`tests/env-ignore.spec.ts`（真实的临时 git 仓库）；探针场景 `env-notice`；`docs/ORCHESTRATION.md` §7.1、§7.4 | L2、L3 | 主 Agent 定（建议全审：写用户仓库的 `.git/info/exclude`） | 第一步没有环境提醒；临时仓库里 `git check-ignore -q .llm/scratch/x` 退出码为 1；带 `!/.llm/` 反向模式的仓库里行健康不报降级 |
| E3 | 检查器：环境工具节点的检查行（语法、`checkLineRefusal`、`envBranch` 的 `checks`）；事件 `env.files-edited` 的声明与每步算出改动文件之后经 `emit` 交事件（按检出的根分组、先问 `listens`）；M4 自带检查器的运行（经共用执行器的 `runCommand({queue: 'direct'})`）、解析、改动行、提醒；服务 `glmHournessEnv`（`checkCommandOf`）与两个纯函数 `fillCheckArgv`、`formatCheckOutput`（给循环板的人加的检查，F17）；交给循环板 `env.checks-after-edit`（`ownRules`、`details`）并按每次送出的结果 `recordRun`（§6.8，F11） | `src/env/loop-entry.ts`、`env-service.ts`、`check-entry.ts`、`runner.ts`、`parsers.ts`、`changed-lines.ts`、`check-notice.ts`、`branch.ts`、`index.ts`；`src/shared/deferred-call.ts`（G2 未先建时）；`tests/env-checks.spec.ts`（真实子进程经执行器跑一个夹具程序）、`tests/env-check-entry.spec.ts`、`tests/env-service.spec.ts`、`tests/env-loop-entry.spec.ts`；探针场景 `env-checks`；`docs/ORCHESTRATION.md` §7.5、§7.7 | L2、L3；L4 随批次 | 主 Agent 定（建议全审：harness 运行人批准的命令） | 写入成功后下一步没有检查结果 notice；`pwsh` 带 `{files}` 的检查行没被拒绝；`checkCommandOf` 不存在；`fillCheckArgv` 不给以 `-` 开头的文件名加 `./`；循环板的执行表里没有 `env.checks-after-edit`；`env.files-edited` 没有交进收件箱 |
| E4 | 压制注释计数与晨报一行 | `src/env/suppressions.ts`、`index.ts`；`src/shared/suppression-markers.ts`（G3 未先建时）；`src/workflow/morning-report.ts`；`tests/env-suppressions.spec.ts`；`docs/ORCHESTRATION.md` §7.6 | L2 | 主 Agent 定 | `suppressions.jsonl` 不存在；晨报没有压制注释一行 |
| R1 | 第三次修复之前问人：重开计数（从上一张关闭的这类待决算起）、`reopenQuestion`（提议式待决的题目与四行、`body` 里的「附」、`propose` 的 `reason`，不带选项字段；节点标题先过 `personTitle`，不合格时走退路写法，F18）、`graph_status` 的 `notice`（用不带四行的 `propose_to_human` 交给人、用 `record_human_answer` 记）；交给循环板 `graph.third-rework` 并 `recordRun`（循环板已合入时；否则由循环板后到的那一步加，§13.3） | `src/graph/reopen.ts`、`tools.ts`、`loop-entry.ts`、`index.ts`；`tests/graph-reopen.spec.ts`、`tests/graph-loop-entry.spec.ts`；`docs/ORCHESTRATION.md` §2.4（写明数法：第 n 次重开即第 n 次修复开始；问法是一个方案的四行，不给选项） | L2、L3（现有图场景照旧通过） | 主 Agent 定（建议全审：harness 以自己的身份写人定的待决） | 第 3 次重开之后节点下没有待决；交给真实引擎的待决带 `options`（今天的引擎不收提议式待决，这一例在 M3 第 6 步之后才能跑，R1 因此排在它之后） |
| C1 | 先把三个脚本里的地址与路径字面量逐字写进快照索引的「附」，再删除三个脚本与 `__pycache__` | `.llm/docs/`（不入库）；`docs/reference/bigmodel-guide-digest.md`；`docs/ORCHESTRATION.md` §7.4 末句 | L1 | 全审（`norm-review-floor`：删文件） | — |
| K1 | 标定题：会诱发 shell 写文件与工作区外写入的小任务，记分加「拦截后下一步走对」 | `tests/calibration/<题>/`（按 M7 的回归集结构，M7 未合入时按今天的格式） | 标定 | 主 Agent 定 | — |

K1 等两件事：G2 与 G4 已合入（量的是新的拒绝文案）；`ablation` 任务把标定运行目录移出仓库（`risk-calib-read`）。K1 不需要放行：它量的是拦截之后模型的下一步，模拟人（M3 附录 0.5 §3.10）回不回「可以」都不影响分数；模拟人的消息不带 `rpcId`，也放行不了（§5.5）。花积分按常设授权，结果写进 K1 的节点批注。

### 13.2 并行的线

| 线 | 步 | 只碰这些文件 |
| --- | --- | --- |
| guard | G1 → G2 → G3 → G4（串行：都改 `src/guard/index.ts`） | `src/guard/`、`scripts/guard/`、`tests/guard-*`、`tests/guard-corpus/` |
| env | E1 → E2 → E3 → E4 | `src/env/`、`tests/env-*`、`packages/hourness/locale/env/` |
| 图 | R1 | `src/graph/reopen.ts`、`src/graph/tools.ts`、`src/graph/loop-entry.ts`、`tests/graph-reopen.spec.ts`、`tests/graph-loop-entry.spec.ts` |
| 清理 | C1 | `.llm/docs/`、`docs/reference/bigmodel-guide-digest.md` |

四条线互不碰同一个文件，下面这些共用文件除外，由编排者按 §13.3 排先后：`docs/ORCHESTRATION.md`、`docs/DESIGN.md`、`docs/DEVELOPMENT.md`（各步只改自己的小节）；`src/workflow/morning-report.ts`（G1、G2、G4、E4）；`tests/contracts.spec.ts`（G1、G4、E1）；`tests/fake-rc3.ts`（G2、G4，M3 的步也改它）；登记文件（E1）；`src/shared/tool-names.ts`（G4）；四个「谁先开工谁建、另一方只导入」的文件：`src/shared/suppression-markers.ts`（G3、E4）、`src/shared/deferred-call.ts`（G2、E3）、`src/shared/llm-ignore.ts`（G1、E2）、`src/graph/plan-text.ts` 里的 `personTitle`（G4、R1）；`src/graph/plain-question.ts`（M3 第 3 步或 G4）；`src/graph/proposal.ts`（M3 第 6 步或 G4）；`src/graph/index.ts`（G1 改流水的目录、R1 加交给循环板）；`src/shared/data-home.ts` 与 `src/memory/audit.ts`（G1；M5 也改 `src/memory/`）；`scripts/probe/` 的场景登记（各线加场景）；`src/guard/scratch.ts`（G3 建、E2 加一个函数）。探针与桌面版一次只能有一个持有者（`risk-shared-desktop`），各线的 L3 由编排者排队。

### 13.3 与其他工作的先后

| 共用 | 和谁 | 规则 |
| --- | --- | --- |
| `src/guard/index.ts` | M3（第 3 步把 `DECLARATION_SECTION` 移到 `src/guard/sections.ts`，已在 main）；规则板 R4（`glm:guard` 加一行） | 先合入的先改，后到的在它之上重做；G1 开工前看规则板 R4 是否已合入 |
| `src/guard/` 下 M3 的新文件 | M3 第 4 步（`main-agent.ts` 的 `dispatchRoot` 与两条写入规则、`git-snapshot.ts`、`shell.ts` 加 `simpleCommands`） | M4 不改这几个文件；G4 导入 `dispatchRoot`；git 快照门按 §3.3 调 `observe` 与 `noteDenial`：G2 先合入则 M3 第 4 步直接加，M3 先合入则 G2 在它的监听器里加这两行 |
| `src/graph/tools.ts` | 规则板 R4（`graph_decide` 之后调 `acceptProposal`）；M3 | 先合入的先改，后到的在它之上重做 |
| 登记文件 | M3 第 3 步、规则板 R4、M7 E0/P3 | `env` 行排在已合入的编排层宿主行之后、`ui` 之前；每个新行按 `6134c83` 的做法带导出与 `locale/<行>/` |
| `src/workflow/morning-report.ts` | M3 第 9 步（去掉 L1/L2/L3）；M7 的四答晨报 | 先合入的先改，后到的在它之上重做（与其他共用文件一样）；M4 改四处（G1 的过滤、G2 的两行、G4 的申报一行、E4 的压制一行）；M7 接手时照 §3.10、§5.8、§6.7 的行写（评审第 2 轮 N20） |
| `tests/fake-rc3.ts` | M3 的各步 | 先合入的先改；各方只加自己要的 rc.3 信号，不改别人加的（评审第 2 轮 N22） |
| `src/guard/catalog.ts` 与规则板的目录 | 规则板 R1；M3 的 `MAIN_AGENT_RULES`、M7 的 `EXECUTE_RULES` | `GUARD_RULES`、`MAIN_AGENT_RULES`、`EXECUTE_RULES` 三张表各管各的，规则板的 `builtin.ts` 导入三张并映射（§3.8）；后到的一方改成导入 |
| `scratchLeftovers` | M7 汇合门禁 | M7 在 E2 之后接入 |
| `installRuleGate` | M3 第 4 步（`installMainAgentRules`）、M7 的 `worker-scope` 等门；循环板的 `loops:schedule-tools`、`loops:files-only`；指标流水的 `metrics-files-only` | G1 先合入：后到的直接用它；它们先合入：G1 把它们改成经它安装（行为不变，各自的 L2 照旧通过）。M3 附录 0.5、M7 0.6 都没有接这一条，留给它们的对齐（§3.1、§18 第 5 条） |
| `observe`、`noteDenial` | 规则板的工具调用门（规则板 0.10 已采纳）；M3 的 git 快照门（M3 附录 0.5 没有加，留给 M3 的对齐） | 两个监听器第一件事调 `observe`、拒绝时调 `noteDenial`（§3.3）；`gate.ts` 在之后，谁后合入谁加这两行 |
| `src/graph/plain-question.ts` | M3 第 3 步 | M3 先合入：G4 导入；G4 先合入：G4 照 M3 附录 0.5 §2.8 的内容建，M3 改成导入 |
| 提议式待决、`background` 字段、不带四行的 `propose_to_human` | M3 第 6 步（附录 0.5 §3.3、§3.4、§2.9） | R1 依赖它，排在它之后（评审第 3 轮 F12）；0.3 的「等改写 `d-option-card` 的那件事」一行删去 |
| `src/graph/proposal.ts` | M3 第 6 步 | 先合入的建，G4 先开工时照附录 §3.3 原样建，M3 改成导入 |
| 本会话有开着的申报时 `propose_to_human` 返回 `busy` | M3 第 6 步 | 读 `requestsService(ctx)?.openRequests`；谁后合入谁加（N29 的另一侧） |
| 循环板的事件表、服务与执行器（`src/loops/trigger.ts` 的 `matchesFilter`、`model.ts`、`service.ts` 的 `contribute`、`emit`、`listens`、`recordRun`、`script.ts` 的 `runCommand`、`resolveProgram`） | 循环板 S1、S3（0.6 §16） | E3 排在这几样之后（§6.1）；`src/graph/loop-entry.ts`（R1）与 `src/env/loop-entry.ts` 里交默认条目的部分，由 R1、E3 与循环板 S1 里后合入的一方加，契约测试同（§6.8）。人加的检查条目的存储、提议与同意、`check` 动作的运行（`commandDetail`、`runCommand` 的 `queue: 'check'`）全是循环板的，M4 只提供 `glmHournessEnv` 与两个纯函数；它们没到之前循环板把 `check` 条目判 `refused`（`check-missing`），不影响 M4 自带的检查器 |
| `worker-scope` 调 `outsideDenial` 与 `peekGrant`；推进监听器读 `openRequests` 停住与恢复 goal | M7 的执行行 | 谁后合入谁加（§5.9）；L3 `guard-request-worker` 在 M7 合入之后 |
| 「需要你」列出开着的申报 | plain-ui（`m8-plain-language`）的现场投影 `graphLive` | 谁后合入谁加；M4 一侧只要求 G4 的 `ask` 结果与关闭提醒合 §5.8 的形状 |
| 项目根 `projectOf(cwd)` | `src/data/project-root.ts`（已在 main，规则板的最小一片建；M5、循环板、指标流水也导入它） | 导入，不另建（§2.4）；这个模块需要异步读或注入文件系统时，加选项而不是写第二份（`AGENTS.md`、`design-context.md`「Rules thin slice」） |
| 交给指标流水的事件 | 指标流水的行 | 服务不在时什么都不做，不等它（§3.11） |
| `classifyRecord`（含 `deferral`、`rule-record`、`late-denial`） | 规则板 R1、R4、R7 | 规则板写 `mode: 'enforce' \| 'record' \| 'late'` 与 `effect`；M4 的 G1 合入之前规则板的晨报一节自己数 `record` 与 `late`，之后可以改用 `classifyRecord`（§3.2） |
| `src/shared/suppression-markers.ts` | G3 与 E4 | 谁先开工谁建；E4 不依赖 G3 的 `src/guard/suppression.ts` |

### 13.4 批次 L4

M4 的 L4 攒到一批（`docs/DEVELOPMENT.md` §1.1），在 G4、E3 合入之后，与规则板 R4–R7 的第一批合做一次也可以：

1. 桌面版重启后，GLM-5.3 新会话（临时工作目录）写工作区外的一个已存在的临时文件：拒绝的纠偏带编号与四个字段；agent 调 `request_exception`，回复末尾原样是申报文字（题目一段，四行各自成段、每行一处加粗，「附」里有内容预览，问话在最后）；人回「可以」，下一步同一调用执行，旧内容在 `.llm/requests/`；再调一次被拒。读这个会话的日志，核对人那条消息的 `source` 带 `kind: 'user'` 与 `rpcId`（H19）。GLM-5.3 没有原样放出文字时记下是怎样改的（`not-shown` 的情形）。
2. DeepSeek 新会话做同样的事：纠偏用原生工具名，申报文字相同，记录 `scope: other`。
3. 人回「可以吗」：agent 收到确认句并放在回复末尾；再回「可以」放行。另一次人回「不行」：不放行，agent 不再试。
4. `/wish` 的主 Agent 会话里（没有 M7）派一个子 agent 写工作区外：子 agent 被拒，结果里带编号与路径；主 Agent 申报、人回「可以」、主 Agent 按说明里的参数派子 agent 原样写，成功。M7 合入之后另做一遍（F13、F14、F19）：先让 worker 写主检出里的一个文件，纠偏是 M7 的（`ask_main` 请主 Agent 放宽写入范围），没有编号，主 Agent 也没有申报；再让主 Agent 带着自动推进，worker 写工作区外被拒、用 `ask_main` 交来编号；主 Agent 申报，自动推进停下（goal 为 `blocked`，原因码 `hourness-waiting-human`）；面板「需要你」里出现这条申报；人回「可以」，主 Agent `answer_worker`，worker 原样再调成功，推进恢复，「需要你」里这一条消失。
5. 项目图里已有 ESLint 与 TypeScript 两个工具节点，带 §6.1.1 的检查行（人批准）。在本仓库的 GLM-5.3 会话里用 `Edit`、DeepSeek 会话里用 `edit`，各改一个 `.ts` 文件引入一个 ESLint 告警：下一步的请求末尾有检查结果 notice（发现数、`文件:行`、日志路径）；修好之后出现一行全 0。再让主 Agent 加一项人加的检查（引用 TypeScript 节点上不带 `when` 的一条 `tsc` 检查行）：四行之后有命令原文，人看过原文同意（F17），之后改一个 `.ts` 文件，结果由循环板几步之后送给改文件的那个会话；把节点上的命令改一个字，下一次改动该条目 `refused`（`check-changed`）。
6. 会话第一步有环境提醒（带检查一行）；`/hourness-status` 的表里 `env` 一行生效；设置页里 `env` 行显示标题而不是文件地址。
7. 桌面版日志没有本包的新错误。
8. 循环板页面「碰到某件事就做的」一组有「改完文件就跑检查」与「同一件活第三次返工之前：停下问你」两项，来源一行「项目编排带来的 · 只能看」；前者展开是本项目每个已批准的带 `when` 的检查行一行与四条规矩，规矩里的数是 20 秒、60 秒、3 次、1 次；「本项目加的」一组里有第 5 项加的那一项 `check`，上次是第 5 项那次，下面一行写「M4 自带的检查器也跑这一条」或没有（取决于那条检查行带不带 `when`）（F11，F17）。
9. 违规流水与检查日志在本仓库的 `.llm/` 下；另开一个临时 git 仓库的会话触发一次圈禁拒绝，记录写在那个仓库的 `.llm/audit/` 里，本仓库的流水没有它（§2.4）。

### 13.5 两层循环：M4 的问题归哪一层（`d-design-onepage`）

人定的两层循环：大循环定框架、模块清单与方向清单；每个模块先写设计、过评审、人看一页放行再开发；开发中的问题分三档；问题攒着问，一次至多三件（产品里使用者的项目同样这样走，人 2026-10-30「两层循环加，我正想说这个事情呢」）。M4 在两处。

开发 M4 本身（M4 是本项目的一个模块）：

| 档 | 怎样认 | M4 里的例子 | 谁定、怎样告诉人 |
| --- | --- | --- | --- |
| 只影响 M4、可逆 | 改的是实现与 agent 定的数，人在一页放行稿里读到的东西不变，方向清单不碰 | 解析器的写法；20 秒、60 秒、2 个并发、512 条映射一类常量；文件名与模块的拆法；日志目录名；某个 L3 场景换一种驱动方式（§14.1 的〔未核实〕项不成立时）；回放多跳过一条规则 | 主 Agent 定，记成决定者为 agent 的待决；在下一批里告诉人一行 |
| 改到 M4 的设计方向 | 改了人在一页放行稿里读到的东西，或 §16 里一项取舍 | 同意词表、放行时限、要不要备份；申报文字或第三次修复的问法；回放读的字段；检查条目怎样同意；让 `credential-read` 会拦；第三次修复改成拦下 | 回本设计的循环：改设计、过评审、改一页放行稿，人在对话里同意后再开发；受影响的步暂停，其余步照常 |
| 改到框架 | 动了方向清单，或改了别的模块的接缝 | 授权不再只认客户端送来的人的话；两块板的条目形状要变；违规流水并进指标流水；guard 不再对所有路由生效 | 回大循环，受影响的步暂停，由编排方与人定 |

产品里（M4 的功能在使用者的项目里运行）：

- 申报：一次运行时的授权，不是开发中的问题，不分档。申报文字单独放在回复最后，同一条回复里不出示别的提议（§5.3 第 5a 条与 M3 那一侧的 `busy`），所以那条回复只有它一件。
- 第三次修复的提问：开发中发现的问题，是第二档的信号（同一处反复修不好，常常是那件活的方向不对）。问法是一个方案，进下一批，一次至多三件（§4.6）；查清之后要改那个模块的设计时，按使用者项目的三档走（M3、M7 的事）。
- 新加一项人加的检查：主 Agent 在对话里提一次（命令原文附在四行之后），进同一批；新加一个带检查行的工具节点（M4 自带的检查器）随人批准节点，也进同一批。
- 影子规则转生效：M7 的周报阶梯提，进那一批。

「至多三件」的计数：M3 的 `propose_to_human` 数一条回复里交给人的件数（附录 0.5 §3.4 第 4 条）；第三次修复与检查条目都经它，都算进去；申报不经它，用 `busy` 与别的件分开。

## 14. 验证

### 14.1 L3 探针场景

| 场景 | profile | 做什么 | 检查 |
| --- | --- | --- | --- |
| 现有全部 | — | 不变 | G1 之后全部照旧通过；`glm`、`non-glm-guard` 的纠偏按 §5.2 的新文案改期望（G1 改一次，G4 再改一次） |
| `guard-followup` | `probe-full` | 图目录用仓库图的副本；依次：用 `write` 写副本里的一个节点文件两次（两次都被 `graph-files-only` 拒绝）；再 `pwsh` 跑 `Set-Content x.txt 1`（被 file-tools-only 拒绝）；再 `write` 写 `x.txt` | 违规流水有三条拒绝与三条跟进：第一次图写入之后 `repeat`（由图行结算），第二次之后 `other`，shell 写之后 `right-path`；这一场景同时证明图行与 guard 行共用一个跟进记录器（§3.3） |
| `guard-shadow-rules` | `probe-full`，GLM 与 `deepseek-probe` 各一遍 | 场景 DSH home 下放一个假的 `glm-hourness/credentials.json`；依次：`read` 它；`write` 一个带 `// eslint-disable-next-line` 而没有理由的 `.ts`；`edit` 临时仓库里的 `tsconfig.json`；在仓库根新建 `fix.py` | 四个调用都执行；违规流水恰好四条 `via: 'rule'` 的影子记录，`scope` 分别为 `dialect`、`other`；系统提示词的 `glm:guard` 节与之前逐字相同 |
| `guard-request` | `probe-full`，GLM（`request_exception` 经 `DeferredToolCall`）与 `deepseek-probe` 各一遍 | 覆盖层的验证插件扮演人：根 agent 的 `turn/end` 时，若最后一条助手消息以申报文字结尾，就 `agent.followup(createUserMessage({content: [{type: 'text', text: '可以'}], source: {kind: 'user', rpcId: 'probe-1'}}))`。脚本：`write` 工作区外 → 拒绝；`request_exception` → `ask`；回复以 `text` 结尾、结束回合；（人回「可以」）；同一 `write` → 执行；再一次 → 拒绝 | 纠偏带编号、`request_exception` 与四个字段；申报文字的格式（题目、四行、「附」、问话在最后）；人回话之后那一步的请求末尾有放行说明，带工具与参数；目标文件内容等于参数，旧内容在 `requests/`；违规流水依次有拒绝、跟进 `right-path`（GLM 一遍是拆包之后的结算，评审第 2 轮 F9）、`asked`、`approved`（带原话「可以」）、`GrantRecord`、拒绝 |
| `guard-request-refuse` | `probe-full` | 同上的验证插件，四个回合依次送：不带 `rpcId` 的「可以」；带 `rpcId` 的「可以吗」；agent 回复末尾改成确认句之后带 `rpcId` 的「可以」；第二条申报时 agent 故意在文字后面多写一句，再送带 `rpcId` 的「可以」 | 第一次 `not-client`、写入仍被拒；第二次 `unclear`，说明里有确认句；第三次 `approved`，写入执行；第四次 `not-shown`，写入被拒、申报留着。流水的记录与上面一一对应 |
| `guard-request-goal` | `probe-full`，GLM 一遍（评审第 3 轮 F14 第 4 条） | 根 agent 带着一个活着的 goal（`glm-goal` 的做法），会话里装着 `dsh-goal-round-driver`；同 `guard-request` 的脚本与扮演方式，验证插件在申报文字出现之后的那次 `turn/end` 送带 `rpcId` 的「可以」 | 每一回合首步、没有人的消息时有「still waits」的说明；人回话之后放行成功；会话日志里 `ask` 结果与一条 `request: {ref, outcome: 'approved'}` 的提醒成对（F15）；M7 合入之后另核对申报开着时 goal 为 `blocked`（`hourness-waiting-human`）、关闭后恢复 |
| `guard-request-worker` | `probe-full`，M7 合入之后（F13） | 主 Agent 派一个 worker（`dispatch_task`），任务让它写工作区外的一个临时文件；验证插件扮演人 | worker 第一次被 `worker-scope` 拒绝，纠偏带编号与 `ask_main` 一句；主 Agent 的 `request_exception` 得到 `ask`；人回「可以」之后主 Agent 收到 worker 那一句说明并 `answer_worker`；worker 原样再调成功，旧内容在 `requests/`；第二次被拒。核对 `dispatchRoot(worker)` 是主 Agent。另一步（F19）：任务让 worker 写主检出里的 `src/a.ts`（工作树在 `<仓库>/.worktrees/` 下）：被 `worker-scope` 拒绝，纠偏是 M7 的（`ask_main` 请放宽写入范围），没有编号，主 Agent 没有可申报的东西 |
| `env-notice` | `probe-full` | 图副本里有 `env` 与一个已批准、一个提议中的工具节点；临时仓库不忽略 `.llm/` | 第一个请求末尾有环境提醒（一个工具、「1 more tool node waits」、检查一行、草稿区一行）；场景结束后在临时仓库里跑 `git check-ignore -q .llm/scratch/x`，退出码为 0（不核对文件的文字）；`.git/info/exclude` 里恰好一行 `/.llm/`；第二个请求没有环境提醒 |
| `env-checks` | `probe-full` | 探针进程没有会话控制器，循环板不提供服务（循环板 0.6 §3.1），所以覆盖层的验证插件提供一个最小的 `glmHournessLoops`：`listens('env.files-edited')` 为真，记下收到的 `contribute`、`emit`、`recordRun`。进程由真实的共用执行器起（循环板的 `src/loops/script.ts` 没合入时，验证插件里放一个等价的最小 `runCommand` 并在场景里写明）。图副本里有一个已批准的工具节点，验收条件含 `` `check lint lines $ node lint.mjs {files}` when *.txt ``，`lint.mjs` 对含 `TODO` 的行打印 `<file>:<line>:1: todo found`。依次 `write` 一个含 `TODO` 的 `a.txt`、`edit` 去掉它、再走一步不写；另 `write` 一个名为 `b$(echo x).txt` 的文件和一个名为 `-c.txt` 的文件 | 第二个请求末尾有检查结果 notice（1 finding，`a.txt:1`，`[changed]`，日志路径存在）；第三个请求有一行全 0；第四个请求没有检查结果 notice；`lint.mjs` 收到的参数里有原样的 `b$(echo x).txt` 和 `./-c.txt`，没有产生 `x`；验证插件收到 env 行交来的 `env.checks-after-edit`（`ownRules` 四行）、每次送出结果一条 `recordRun`（`entry` 是 `env.checks-after-edit`）、每个有改动的步一条 `emit`（`env.files-edited`，`files` 相对检出的根，键 `files-edited:<会话>:<turn>-<step>`）。再加一遍：同一个节点上的检查行不带 `when`，M4 自己不跑它（没有检查结果 notice），验证插件用 `checkCommandOf` 能读出它且 `own` 为假；节点的命令改一个字之后 `checkCommandOf` 读出的参数表随之变。循环板自己的存储与同意路径、`check` 条目的运行由循环板的 L3 管，真机上的整条路在 L4 第 5、8 项 |
| `hourness-only` | `probe-hourness` | 现有场景 | 另核对 `env` 行生效、`request_exception` 在工具面里 |

`guard-request` 的扮演方式〔未核实〕：headless 运行器在它自己的 agent 第一次空闲时退出（`run-probe.mjs` 的 `goal-headless` 一节），`turn/end` 时排进收件箱的消息能否在退出之前开出下一回合要在 L3 上看；不能时改用 `glm-goal` 的做法，由验证插件在一次工具调用里另起一个根 agent 驱动这几个回合。插件能造带 `rpcId` 的消息不是漏洞：插件本来就是 harness 的一部分，模型造不出来。

探针运行目录照旧隔离（`docs/DEVELOPMENT.md` §3）：凭证、流水、日志与备份都在场景目录里。

### 14.2 L2

纯函数：`judge`（生效与影子的组合、多条生效拒绝、抛错）、`classifyRecord`（每种记录、规则板的两种 `mode`、读不懂的行）、`unwrapDeferredCall`（合法、少字段、多字段、`input` 不是对象）、`followupOf` 与 §3.3 列的跟进各例、`ruleStats` 与 `PROMOTION`、标注的取舍（人优先）、`decodeSessionLog`（多帧、坏帧、不压缩）、回放的判定、来源、拆包与 D2 的字段边界（夹具里写入内容带一个标记串，`replay.jsonl` 与 `summary.json` 里都找不到它）、`sanitizeCase`、四条规则的 `detect`（含 §1.2 的不触发情形）、签名、`fillCheckArgv` 与 shell 名单、`checkLineRefusal` 与 `splitArgs`、`formatCheckOutput`、`personTitle` 与 `displayPath`、`envBranch`、`config` 行与检查行的语法、三种解析器、改动行、两种 notice 的渲染与长度上限、`reopenCount` 与 `reopenQuestion`（第 3 次重开提问、人同意或放弃之后再数 3 次、`propose` 的 `reason` 认法、正文被改过照样认得）。

给人看的文字（评审第 2 轮 F10）：`renderPlan` 的格式与拒绝（四行经 `proposalLineRefusal`、题目长度、换词）；申报文字的五种变体与第三次修复的题目与四行逐字钉住；问话只有一个回复词（「可以」）；对这些文字与 D1 的问话跑 `plainWordsIn`，结果为空；题目之后的第一段以「背景：」开头，问话是最后一段。

读人的回话（§5.5）：只认 `kind: 'user'` 且带 `rpcId` 的消息；`tail` 的规范化（行尾空白、`\r\n`、多余空行）；助手消息带工具调用块、`tail` 之后多一句、中间隔了一条别的回复都不放行；同意词与不同意词的整句匹配（「可以吗」「可以，顺便……」不算）；确认句与第 3 次关闭；2 小时过期；没有用户消息时的「再出示一次」每一回合首步加一次（F14）。

宿主侧在假宿主 `tests/fake-rc3.ts` 上：`installRuleGate`（guard 行与图行两条安装路径的影子记录、跟进的跨行结算、一个放行只去掉自己那条拒绝）；`request_exception` 的检查顺序与各错误码；放行之后的说明带工具与参数、参数超过 4 KiB 时写进 `requests/<编号>.call.json`；备份失败、目标在批准与使用之间被新建或变大、并行的两次同签名调用；重启（同一项目目录上卸载再装一次 guard 行）：等人回话的申报与放行都没有了，之后的「可以」不放行；向流水追加伪造的 `RequestRecord` 与 `GrantRecord`、删掉一条 `GrantRecord` 都不改变结果；env 行的步 notice（推出改动文件、GLM 别名与 `DeferredToolCall`、等待上限、后台结果、连续失败）。检查的子进程在 L2 里经共用执行器真实运行（夹具程序在临时目录里），超时用一个睡 120 秒的夹具。

0.4 加的（对应第 3 轮的发现）：

- F11：`src/env/loop-entry.ts` 与 `src/graph/loop-entry.ts` 交出的内容形状（字段齐、长度在循环板 0.6 §2.1 的上限内）、`ownRules` 每一行等于由常量拼出的句子；假的循环板服务收到 `contribute` 一次、每次送出检查结果 `recordRun` 一次（`entry` 是 `env.checks-after-edit`）、每提一次第三次修复的待决 `recordRun` 一次；`contribute` 返回 `ok: false` 时行健康写明、检查照常。与循环板 `src/loops/model.ts` 的契约测试按 §6.8 由后合入的一方加。
- F12：`reopenQuestion` 的结果交给真实引擎（M3 第 6 步之后）提一次，节点上没有 `options`、`recommend`、`crux`、`verdict`、`weight`；四行过 `proposalLineRefusal`；`notice` 与 `body` 里没有两个以上「回「…」」；人放弃之后再数 3 次才再问。
- F13：`peekGrant` 只读（调两次结果相同、放行簿不变）；`outsideDenial` 对项目里的目标返回 `undefined`（F19 一条另有三例），对项目外的登记一条可申报的拒绝（之后 `request_exception` 用它的编号得到 `ask`）；放行说明的第二行按被拒的是谁取三种之一。`RequestsServiceContractCheck` 钉住服务的类型。
- F14：申报开着时，一回合首步没有人的消息就有「still waits」，非首步没有；连着三个回合各有一条；`openRequests` 在 `ask` 之后有这一条、关闭之后没有。
- F15：每种关闭都有一条带 `request: {ref, outcome}` 的提醒；卸载再装一次 guard 行之后，历史里开着的申报得到一条 `lapsed`。
- F16：见 §3.6 末条。
- N29：从最后一条客户端消息以来有一次成功的 `propose_to_human` 时 `request_exception` 返回 `busy`；`propose_to_human` 失败了的那次不算。
- N30、N31：晨报的「另有 n 次」；`effect: 'queue'` 的记录是 `deferral`。
- `d-rules-in-repo`：`projectHomeFor` 的四级取法；两个临时仓库的会话各写各的流水；worker 工作树的会话写主检出的流水；`ensureLlmIgnored` 在 guard 行与 env 行之间只做一次。
- 检查行（0.5 改写）：`checkLineRefusal` 的每条规则各一例（`pwsh` 带 `{files}`、`{files}` 嵌在一项里、命令为空、第一项是 `x.cmd`、名字不合、同一节点里名字重复、`when` 为空表）；`splitArgs` 的引号分组与「什么都不解释」（`$(x)`、`%PATH%`、反引号原样）；`fillCheckArgv` 展开成每个文件一项、以 `-` 开头的名字前加 `./`、跳过带换行的路径、整条命令行超过 28,000 个字符时丢文件并计数。

0.5 加的（对应第 4 轮的发现与对齐轮）：

- F17：人加的检查的提议经假的循环板服务返回的 `detail` 含 `checkCommandOf` 读出的参数表的文字（`commandText`）；没有「已给人看原文」记号的拍板不生效（这一例由循环板合入 `commandDetail` 的一方加，M4 一侧用假服务钉住：`checkCommandOf` 读出的就是节点上的那一条）；`checkCommandOf` 对有几条检查行而没指名、节点未批准、行读不懂各返回 `undefined`；不带 `when` 的行 `own` 为假，M4 自己不跑它，带 `when` 的 `own` 为真。静态检查：`src/env/` 里没有 `node:child_process`，也没有读人加条目的代码。
- F18：申报文字五种变体在焦点标题是「补齐验收条件」、带 `*` 的标题、「M4 guard 补齐与环境」、路径含「门禁」与 `gate.ts` 时都写得出合格的文字（焦点半句省去、路径原样）；`request_exception` 在 `renderPlan` 被造成抛错时返回 `unavailable`、不登记申报、不写流水、行健康降级；`reopenQuestion` 的结果在 plain-ui 第二阶段的常量下对三个标题交给真实引擎都通过（§4.6 末，plain-ui 未合入时带 `M<数字>` 的一例跳过并写明）。
- F19：worker 会话 `cwd` 为 `<临时仓库>/.worktrees/t`，写 `<临时仓库>/src/a.ts` 时 `outsideDenial` 为 `undefined`，写另一个工作树里的文件同样；写 `<临时目录>/notes/todo.md` 时得到编号，之后 `request_exception` 用它得到 `ask`；工作目录不在任何项目里时退回按圈禁根判。`guard-request-worker` 另加一步（§14.1）。
- F20：`REQUEST_EXAMPLE` 里的例子交给 §5.3 第 2 条的参数检查和 `renderPlan`（编号换成一次真实拒绝的编号）都通过，三句各在 80、60、60 的上限内；没有出现练习题领域的词（词表取 `tests/calibration/` 各题的领域词；对 `REQUEST_EXAMPLE` 与 §6.6 的检查行示范各跑一遍）。
- N35：连着三个回合，申报开着、每个回合首步没有人的消息，各有一条再出示的提醒，不论上一回合是不是以申报文字结束。
- N37：一项检查超时后，`recordRun` 记 `failed` 且 `reason` 含 `timeout`，本会话下一次改动照常再跑；连续 3 次因输出读不懂失败后才不再跑；同一项检查还在后台跑时这一步不起第二个。
- N38：假定时器走到 2 小时，写 `expired`、送关闭提醒、`openRequests` 为空；已过 2 小时的申报不在 `openRequests` 里。
- N39：两个项目的会话日志放在同一个目录里，`replay` 只读本项目的，`summary.json` 记另一个项目的会话数。
- N40：工作树里改 `src/a.ts`，`env.files-edited` 的 `files` 是 `src/a.ts`、`root` 是工作树的根，筛选 `src/` 的检查跑；一步改了两个检出里的文件，各发一个事件，键不撞。
- N41：M7 的 `rightPath` 认带编号的 `ask_main` 时，worker 被拒之后的下一次调用记 `right-path`；没加之前记 `other`。
- 规则板 0.10：`classifyRecord` 对 `rules:` 开头的 `mode: 'record'`、`mode: 'late'`、`mode: 'enforce'` 加 `effect: 'queue'` 各给 `rule-record`、`late-denial`、`deferral`；不以 `rules:` 开头的 `record`、`late` 是读不懂；晨报写「其中晚到的拦下 k 条」与「只记录 m 条」，违规数不含后者；`keyOf(record)` 等于 `recordKey(JSON.stringify(record))`，与 `auditJournal` 追加的那一行一致；规则板的门调 `noteDenial` 时用这个键，之后的下一次调用留下恰好一条跟进。`GUARD_RULES` 与 `MAIN_AGENT_RULES`、`EXECUTE_RULES` 三张表合起来 id 不重复。

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
- 问答卡与面板上的批准：`d-chat-not-cards`、`d-ui-look-not-operate`。面板只列出开着的申报（§5.8），不批。
- M4 自己的脚本执行器、条目的存放与同意的路径、执行人加的检查条目：归循环板（接缝裁定）；M4 自带的检查器经循环板的共用执行器起进程，不自己 `spawn`。
- 把 M4 的四条代码规则改成板上的条目：`d-boards-as-hooks` 写明代码里的规则原地不动、照旧列出。
- 在没有会话控制器的进程（headless 运行、探针、练习题）里跑改完就跑的检查：那里没有循环板服务（循环板 0.6 §3.1），自带的检查器也不跑（§6.1.2）。
- 用户级的存放：M4 没有要全局存的东西（§2.4）；跨项目的经验与记忆不归 M4。
- ACP、SDK 会话里的批准：那里送来的人的消息没有 `rpcId`（H19），申报只能等 DSH 客户端里的回话；这类会话的 agent 收到 `not-client` 的说明。
- git 快照（M3 附录 0.5 §2.5）与子 agent 的 git（M7 的派发）：M4 只让它们共用跟进与流水的分类。
- 指标流水（`metrics`）的转写：M4 的记录先写违规流水，指标设计定稿时由它决定怎样转写。

## 16. 由 agent 定、人可推翻的事项

| 事项 | 采用 | 没选的做法与理由 |
| --- | --- | --- |
| 规则模式放在哪 | 代码里的 `mode` 字段，规范节点的标签由契约测试核对（§3.1） | 放规范节点正文：LLM 能改正文；放行配置：按 profile、不经评审 |
| 新规则先影子 | 四条都先影子，`suppression-reason` 按 §3.5 转生效后就是 §7.6 的「直接拦下」 | 直接拦截：违反宪章 §6；`question-25` 只覆盖 M3 的两条 |
| `credential-read` 不转生效 | 只记录 | 转生效：排查登录时误伤，回放里多数是开发时的正常读写 |
| 标注由谁做 | agent 标，带人原话的算人的；人只在转生效那一问里看数字与至多 5 条样本 | 人逐条标：每周几十条，违背减负 |
| 判据数字 | 20 条、14 天、0 误伤，放在 `PROMOTION` | 按比例（如 95%）：样本少时比例不稳 |
| 回放读哪些字段 | 工具名、命令与路径（D2 人的原话的边界），另三样元数据（模型名、工作目录、`isError`），写进一页放行稿；「当时拦没拦」对项目的流水；`suppression-reason` 在回放里不判 | 读出错结果的前 120 个字符（0.3）：shell 的输出可能有文件内容与密钥，超出人同意的那一句（F16）；也读写入内容、多判一条规则：同样超出 |
| 草稿区 | `<工作区>/.llm/scratch/` | 根目录 `scratch/`：要改每个项目的 `.gitignore`；系统临时目录：工作区圈禁拒绝写，汇合门禁也看不见 |
| `.git/info/exclude` | 项目没忽略 `.llm/` 时经 `ensureIgnored` 追加一行 `.llm/` | 改 `.gitignore`：会进项目的提交；自己追加注释加 `/.llm/` 两行（0.4）：仓库里已有现成的追加实现 |
| 抓取脚本 | 删除，快照与重新抓取的办法留下 | 转正到 `scripts/`：本仓库不用 Python，网页工具现成 |
| 检查放在哪、谁同意 | 两种（§6.1）：M4 自带的检查器取自环境工具节点上人批准的检查行（带 `when` 的），在板上是 `self` 的只读一项；人加的检查是循环板上人的普通条目，命令取自同一个工具节点，走循环板那条给人看原文的同意路。编排方的接缝裁定（`Check entries seam`），可推翻 | 0.4 的做法（每项检查都是人加的条目、由 env 行执行）：与裁定相反，会跑东西的条目没有「给人看原文」这道防线（F17）；0.3 的做法（只有工具节点）：人加的检查没有人看过原文的路，也没有「脚本钉住」；两种都只放工具节点或都放循环板：前者人没有第二条路，后者 M4 要自己执行人加的条目 |
| 检查行不带 `when` | 只是命令的定义，M4 自己不跑，人加的 `check` 条目可以引用；`own` 告诉循环板这一点 | 不带 `when` 也跑（对所有文件）：0.3 已经因为「对所有文件跑」而要求必须有 `when`；带 `when` 的才跑、不带的不跑，让人想要和人加的条目一样硬的防线时有地方放（§6.1） |
| 检查命令怎样跑 | 不经 shell，`argv` 交给共用执行器，改动文件作为单独的参数；程序是 shell 时不收文件参数 | 经 shell、按平台加引号（0.3）：要为两种 shell 各维护一份转义与排除表，漏一个字符就是命令注入；人写的命令本来就是参数表（循环板的 `runCommand` 同样不经 shell） |
| 检查条目在哪执行 | 自带的：env 行，在改了文件的那个 agent 的下一步之前，进程经共用执行器的 `queue: 'direct'` 起；人加的：循环板的执行器，`queue: 'check'`，事件之后异步，结果按条目的 `to` 交 | 自带的也交给循环板的 `check` 一队：结果要交给改了文件的那个 agent，而且要在它下一步之前，循环板的收件箱与去抖（缺省 30 秒）做不到；M4 自己 `spawn`：多一份进程环境与 `resolveProgram` 的实现，循环板 0.6 F50、F53 的修正要重做 |
| 没有循环板时 | 自带的检查器不跑，env 行不交事件，行健康写明 | 照样跑：检查是项目的规矩，要在板上看得到（`d-rules-visible`），板不在就没有地方列出，悄悄跑违背这一条 |
| 人加的检查的读法放在哪 | env 行提供的服务 `glmHournessEnv.checkCommandOf`（读项目图，需要 env 行启用），两个纯函数放同一个文件由循环板直接导入 | 循环板自己读图解析 M4 的格式：循环板不认得 M4 的格式（裁定「节点与它的格式归 M4」）；读法也做成纯函数：它要读项目图，纯函数拿不到 |
| 申报只对出了项目的目标发编号 | `outsideDenial` 按 `projectOf` 判（F19） | 按圈禁根判（0.4）：worker 的圈禁根就是它的工作树，写主检出也被引去问人，放行之后绕过 M7 的写入范围与审查；让 M7 的 `worker-scope` 自己判项目：M7 要导入 M4 的判法，两处会分叉 |
| 图上的标题与调用的路径进给人看的字串之前 | `personTitle` 不合格就省去或改写，路径经 `displayPath` 转义，`renderPlan` 只查 harness 的常量，`request_exception` 对任何抛错有退路（F18） | 让 `renderPlan` 对整句查换词（0.4）：焦点标题带「验收」就整句抛错，申报永远发不出；把标题里的词换成换词表里的说法：改了人读到的标题，与图上不一致 |
| 申报过期 | 登记时设 `unref` 的 2 小时定时器，到点写 `expired` 并经 `agent.followup` 送关闭提醒 | 只在下一步或会话卸载时比较时刻（0.4）：goal 停住之后没有下一步，申报不过期、M7 不恢复，面板却已去掉它（N38） |
| `GUARD_RULES` 的范围 | guard 框架里装规则的行的规则；M3 的 `MAIN_AGENT_RULES` 与 M7 的 `EXECUTE_RULES` 各管各的表，规则板的 `builtin.ts` 映射三张表（规则板 0.10 §10.1、M3 0.5 §3.11、M7 0.6 §12.1） | 把 M3、M7 的规则也登进 `GUARD_RULES`（0.4）：它们已各有自己的常量表，两处登记会各写一份 |
| 规则板的 `record` 与 `late` | `classifyRecord` 只认 `rules:` 开头的这两种，分别是 `rule-record`（不进违规）与 `late-denial`（进违规、另列） | 让规则板自己数、不经 `classifyRecord`（M4 加之前的做法）：读流水的数字会分叉；不限定 `rules:` 前缀：M4 自己的规则出现这两种取值时是 bug，该报读不懂 |
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
| 申报不上图 | 只在内存、违规流水与会话日志 | 上图：授权不需要它，多一种失败，面板只看不操作 |
| 授权的来源 | 内存里客户端送来的人的话；违规流水只留痕 | 流水作授权：它在工作区里，模型能写能删（评审第 1 轮 F1）；图作授权（0.2）：要面板批准，`d-ui-look-not-operate` 之后没有这条路 |
| 进程重启 | 申报与放行都丢失，重新申报 | 把放行存在用户级目录：多一个要守的文件，而重启本来就少见；人再回一次的代价小 |
| 代码规则怎样安装 | 唯一的 `installRuleGate`，`evaluate` 删除 | 保留 `evaluate`、各行自己写影子：影子与跟进要写好几份，漏一份就静默；`evaluate` 收到影子规则就抛错：只挡住误用，各行仍要自己写记录 |
| 新记录放在哪 | 同一份违规流水，加 `classifyRecord` | 另开 `audit/guard-events.jsonl`：读者少改一处过滤，但晨报要读两份文件，规则板与 M7 也要知道第二份；分类函数反正要有（规则板的 `mode: 'enforce'` 今天两边都不收） |
| 检查日志的目录 | `<项目目录>/env-checks/` | `<项目目录>/checks/`：`scripts/check-lint.mjs` 跑 jscpd 时整个删掉 `.llm/checks` |
| 压制标记表的位置 | `src/shared/suppression-markers.ts` | 放在 `src/guard/suppression.ts`：E4 就要等 G3 |
| 「第三次修复」的数法 | 第 n 次重开即第 n 次修复开始，第 3 次重开时提问 | 数完成次数：与「重开」这个可观察的事件对不上 |
| 第三次修复怎样问 | 一张提议式的人定待决（四行，不带选项），R1 排在 M3 第 6 步之后；主 Agent 用不带四行的 `propose_to_human` 给人看，问「先停下查原因，可以吗？」，用 `record_human_answer` 记 | 带选项字段做过渡（0.3）：问话里出现二选一，人的补充无处可落（F12）；M4 自己渲染四行放进 `notice`：不进 M3 的件数，编号会与同一条回复里的别的件撞 |
| 疑问一行写什么 | 一个人能核对、一变方案就要换的事实（「若三次重开不是同一个问题，接着修也行」；申报「这个文件若不归这件活管，就不该放行」） | 「前两次是不是方向错了，现在还拿不准」「该不该让 agent 改，只有你清楚」（0.3）：把问题原样推给人（F12、N28） |
| 申报的问话 | 「放行这一次，可以吗？（回「可以」才算数）」，一个回复词 | 「回「可以」就放行，回「不行」就不写」（0.3）：把「不做」变成一个可回的选项，与 F12 同一个问题 |
| 装了 M7 时 worker 的申报 | M7 的 `worker-scope` 调 `outsideDenial` 要编号、调 `peekGrant` 查放行，worker 经 `ask_main` 等主 Agent，人同意后原样再调；核对与用掉仍在 guard 行（§5.9） | 让 `worker-scope` 对工作区外的目标不判、交给 guard 行：M7 的写入范围要在 guard 行之后才判，次序与它的 `prepend` 相反，M7 的拒绝信息也要改；让主 Agent 替 worker 写：主 Agent 没有写文件的工具 |
| 自动推进时的申报 | 申报开着时 M7 以 `hourness-waiting-human` 停住 goal，关了恢复；每一回合首步提醒再出示 | 放宽「紧跟申报文字」：人的「可以」可能是在回答之后的别的话；只靠提醒：人要恰好在两轮之间打字（F14） |
| 面板与申报 | 开与关写在会话日志里，面板「需要你」从日志读 | 上图：授权不需要它；放在内存里给面板读：面板只读会话与图，进程重启就丢（F15） |
| 违规流水放在哪 | 会话所在项目的 `.llm/audit/`（`d-rules-in-repo`） | 数据行配置的一个固定目录（0.3 与今天的代码）：所有项目的拦截进同一个文件；用户级目录按项目分：人定「差不多都是进.llm」 |
| `suppressions.jsonl` 留不留 | 这一稿留，指标服务在时另交计数事件 | 照指标设计 0.1 的请求只交事件：它的行出厂禁用、设计还没通过，晨报的那一行在它之前写不出（§3.11） |
| 「第三次修复」待决的认法 | `propose` 历史的 `reason`「第三次修复：<节点 id>」 | 正文第一行或最后一行的标签（0.2）：正文模型能改，人还要读它 |
| `request_exception` 在 GLM 上 | 延迟，不常驻 | 常驻：工具面多一项，ZCode 没有对应物的工具按规则延迟 |
| 放行时限 | 人回话后 30 分钟，一次；申报等回话至多 2 小时 | 不设时限：拍板很久之后才用就是残留授权 |
| 覆盖前备份 | 使用时目标存在且 10 MiB 以内就备份，不看申报文字里写了什么；目标与文字里的不同就拒绝并作废；备份失败就拒绝这次调用 | 只按文字里的承诺备份：批准与使用之间目标变了时会无备份覆盖 |
| 第三次修复之前 | 只在 LLM 重开时提问，不拦截 | 人的重开也问：问人他自己的决定；拦截：要另一条门禁与影子期 |
| 规则板与 git 快照门的跟进 | 请它们第一件事调 `observe`、拒绝时调 `noteDenial` | 只覆盖经 `installRuleGate` 的拦截：规则板拦下的调用量不到，验收的说法也要缩小（评审第 2 轮 N26） |
| 命名 | 行 `glm-hourness/env`（补丁里 `dsh-hourness/env`）、目录 `src/env/`、工具 `request_exception`、规则 `credential-read`、`suppression-reason`、`checker-config`、`scratch-only`、notice 来源 `hourness-checks`、`hourness-env`、`hourness-request`、命令行 `npm run -s guard`、服务 `glmHournessRequests`、事件 `env.files-edited` 与 `graph.third-reopen`、条目 `env.checks-after-edit` 与 `graph.third-rework`、服务 `glmHournessEnv`、读法 `checkCommandOf`、纯函数 `fillCheckArgv`、`formatCheckOutput`、`personTitle`、`displayPath`（M4 定名）、人加的检查动作 `check`（循环板的名字） | — |

## 17. 待人定的事项

按 `d-chat-not-cards`，问人只给一个方案：题目一段，背景、推荐、疑问、不做四行各自成段、每行一件事、把重点几个字加粗，问话放在最后。下面的文字由编排方在对话里原样问，人的原话记到图上（§18 第 1 条）。平常它与一页放行稿合成一问（评审通过之后重写的 `onepage.md` 末尾的那一件就是合并之后的问法，至多三件、问话在最后）：人回一句，放行与 D1 一起定。人只想单独谈 D1 时用下面这一段。

### D1 M4 七件事怎样算做完

拦截规则补齐这批活，怎样算做完先照草稿吗

背景：这批活补七样东西，**怎样算做完要你定**

推荐：**先照草稿写进项目图**，不合适再提给你

疑问：若你**不想每次回「可以」**，申请那一条要重写

不做：**逐条读完再定**，共 34 条约 5,800 字

先照草稿写进去，可以吗？

四行按 M3 的 `proposalLineRefusal` 数过（去掉 `**`）：背景 17、推荐 17、疑问 20、不做 23 个码点，加粗 6–9 个码点；题目 20。0.3 的疑问一行加粗了 15 个码点（超过 12），条数与字数是 0.3 的（27 条、实为 2,973 个字符，评审第 3 轮 N33）；0.4 的「建议验收」一列是 32 条、约 4,500 个字符；0.5 加了 F17–F19 与对齐轮的几条，是 34 条、约 5,800 个字符（本稿写完时按单元格数的，评审的数法略有出入，编排方问人之前再数一次，有出入就改这一行的数）。疑问一行写的是一变方案就要换的事实：人若不想逐次回话，`m4-request-card` 的第 3 条就要重写。

给编排方：七件是 §1.2 表里的七行，草稿是「建议验收」一列。人要改哪条，按他的原话只改那一条，其余照草稿。改「怎样算做完」属于必须问人的第 1 类（`docs/ORCHESTRATION.md` §2.9.1）。人对「疑问」一行说不行时，那是改 M4 的设计方向（`d-design-onepage` 的第二档），回到本设计的循环。

### D2 已定：新规则会不会误拦，样本从哪来

人 2026-10-30 回「不介意」（选 B）：用今天的规则重看本机 DSH 历史会话里的工具调用，只读命令文本与路径，不读对话内容；结果留在 `.llm/`，只有脱敏的个别样本进 `tests/guard-corpus/`。落在 §3.6、§3.7、§11。0.4 照这一句收紧了读的范围（不再读出错结果的文字，F16），另读的三样元数据（模型名、工作目录、有没有报错）写进一页放行稿，让人看到；人说不行时那是改 M4 的设计方向（§13.5 第二档），不重问 D2 本身。0.2 里这一问的写法缺前因后果、用了内部的词（评审第 2 轮 F10）；它已经答过，不再重问。

## 18. 交给编排者记图的事项

本设计不写 `docs/graph/`。第 5 条是 agent 之间的接缝请求，不是人的决定，这一稿写完时就记（评审第 3 轮 N32），草稿在同目录的 `graph-ops-align.json`（0.4 的是 `graph-ops-v04.json`）；第 1–4 条在人放行之后由编排者记：

1. D1：编排方在对话里按 §17 的文字问（与 `onepage.md` 的放行一起）；人回答后在 `m4` 下记一张人定的提议式待决，四行是 §17 的文字，结论带人的原话。D2 的回答已批注在 `m4` 上（2026-10-29T17:33Z）。
2. D1 同意时，在 `m4` 下建 `m4-shadow`、`m4-rules`、`m4-checks`、`m4-env`、`m4-suppressions`、`m4-cleanup`，验收按 §1.2；`m4-request-card` 补上验收（带人的原话），正文里「经决策卡申报」「复用 M3 的 `decision_card` 与以人的身份写图」改为「在对话里申报，人的下一句话决定」，对 `m3-5` 的依赖改为对提供 `dispatchRoot` 的 M3 第 4 步的任务。K1 作为 `m4-shadow` 下的子任务，加一条 `depends` 指向 `ablation`。
3. 规范节点分两批提议（挂 `orch`；每条 guard 框架的规则一个，正文带 `级别：门禁`、`模式：生效 | 影子`、`规则：<id>`）：G1 合入之前提 `workspace-containment`、`file-tools-only`、`graph-files-only`（生效）；G3 合入之前提 `credential-read`（影子，写「只记录，不转生效」）、`suppression-reason`、`checker-config`、`scratch-only`（影子）。§3.8 的契约测试读它们，分两批是为了每一步合入时测试都成立（评审第 2 轮 N21）。
4. E2 之前：在 `hourness` 下提议特性 `env`，与 ESLint、TypeScript 两个工具节点（正文写用途、用法、选择理由、安装位置；验收条件里 ESLint 节点带 `config eslint.config.js, eslint-suppressions.json` 与 §6.1.1 的 `check eslint eslint-json $ …` 行，TypeScript 节点带 `config tsconfig.json` 与 `check tsc tsc $ …` 行，检查行带 `when`），另把 knip、jscpd、gitleaks 记成工具节点（不带检查行）；由人批准，批准即是 M4 自带的检查器生效。本仓库不另加人加的 `check` 条目；要时由人在主 Agent 的对话里提，同意时看到命令原文（§6.1）。
5. 给相邻设计的接缝请求（§2.3、§13.3）。它们都针对已放行的设计，本稿不改那些文件，按 `d-freeze-until-dogfood` 写成接缝请求，等 dogfood 之后处理（0.4 的 `graph-ops-v04.json` 里的几条随本稿作废或已被对方接住）：
   - `schedules`（循环板 0.6）：0.4 请它改的五处，第 ①②④ 点撤回（人加的检查由循环板的执行器跑，M4 不执行人加的条目，不要读条目的函数与认人的条目的 `recordRun`），第 ③ 点由 0.6 的 glob 接住，第 ⑤ 点由 `runCommand` 的 `queue` 接住；第 ⑦ 点（再给人看一张已有的提议式待决）M3 附录 0.5 已加。仍请它做的只剩三件小事：⑥ `loops:schedule-tools`、`loops:files-only` 经 `installRuleGate` 安装（G1 删掉 `evaluate`）、登进 `GUARD_RULES`，读流水用 `classifyRecord`；⑧ 页面在人加的 `check` 条目下写「M4 自带的检查器也跑这一条」时，取 `checkCommandOf` 结果里的 `own`（§6.1.2）；⑨ 周报的「反复超时」一节是否也数 `self` 条目的 `recordRun`（M4 的超时报 `outcome: 'failed'`、`reason` 含 `timeout`，§6.3），由循环板定。M4 已按 0.6 §17 的四条交 `env.checks-after-edit`（带 `ownRules` 与 `details`）、`env.files-edited`（`emit`，先问 `listens`）、`checkCommandOf` 与两个纯函数，并报每次送出的结果（§6.8）。
   - `rules`（规则板 0.10）：它在 §10.7 的「M4 设计 0.4」一节接住了 M4 的三件，M4 没有新的请求。M4 这一侧按它的取值做：`GUARD_RULES`（§3.8）、`classifyRecord` 认 `rules:` 开头的 `record` 与 `late`（§3.2）、`observe` 与 `noteDenial` 的调用形状（§3.3）。规则板 R7 在 M4 的 `classifyRecord` 合入之后可以改用它，数字不会分叉。
   - `m7`（M7 0.6）：写入规则经 `installRuleGate` 安装（0.6 §3.2 仍写 `evaluate`，§18.2 写明 M4 的 G1 合入时谁后合入谁改）；周报阶梯的「影子转生效」引用 `PROMOTION` 并采用 M4 的含义，在 P2 之前处置（0.6 §18.2 R4-F10）；`ladderProposals` 读流水用 `classifyRecord`；汇合门禁加「草稿区为空」一步；`worker-scope` 在目标出了工作树时先调 `peekGrant`（为真就放行这一次往里走），拒绝时调 `outsideDenial`：返回值不为空（目标出了项目）就用它的 `exception` 换掉纠偏的例外一句、`RuleDeny.ref` 写编号，返回 `undefined`（目标在项目里）就照 M7 自己的纠偏，不问人（F19）；`worker-scope` 的 `rightPath` 认带这个编号的 `ask_main`；推进监听器读 `openRequests(持有者会话)`，非空时以 `hourness-waiting-human` 停住 goal，申报都关了、列出的待决也都定了时恢复（§3.9.5 的恢复规则加一句；人一直不回时 2 小时的定时器会送关闭提醒叫醒持有者，N38）；worker 的简报或 `ask_main` 的说明里写明「项目外的写入经主 Agent 问人，等回答，再原样调一次」（§5.9）。
   - `m3`（M3 附录 0.5）：附录 §3.4 已含不带题目与四行、原样再给人看一张已有待决的 `propose_to_human`，M4 的第三次修复可以用，这一条不再是请求。仍请它做的三件（附录 §10 已记为留给 M3 对齐轮）：`installMainAgentRules` 经 `installRuleGate` 安装；git 快照门第一件事调 `observe`、存不了快照而拒绝时调 `noteDenial`（规则 id `git-snapshot`），拒绝记录不带 `mode`；本会话有开着的申报（`requestsService(ctx)?.openRequests`）时 `propose_to_human` 返回 `busy`（N29 的另一侧；M3 没加之前申报文字之后又出示了提议时 `tail` 对不上，记 `not-shown`、不放行，fail-closed）。`src/graph/proposal.ts` 里的 `PROPOSAL_LABELS`、`proposalLineRefusal`、`splitBold` 随 M3 第 6 步；G4 先开工时照附录 §3.3 原样建，M3 改成导入。
   - `m8-plain-language`（面板设计 0.7）：「需要你」的 (b) 一类加上开着的申报：现场投影 `graphLive` 认 `request_exception` 的 `ask` 结果（`ref`、`lines`、时刻、会话）就加一项，见到同一 `ref` 带 `request: {ref, outcome}` 的 `hourness-request` 提醒、或过了 2 小时就去掉；显示题目与四行，下面一行「去主 Agent 的对话回话 ›」指向申报所在的会话（§5.8）。第三次修复的待决是提议式的，按 (a) 一类照常显示四行。
   - `metrics`（指标流水 0.2）：M4 交拦截、影子、跟进、申报与放行的事件（只带规则 id、种类、结局、来源与会话 id），与每天一条压制计数事件（§3.11）；`suppressions.jsonl` 这一稿照旧写，等指标流水定稿、它的行默认启用之后由它的实施那一步去掉（改 `src/env/suppressions.ts` 与晨报一处）；`recordKey`、`metrics-files-only` 照它的请求。
6. `m4` 的状态与本设计的评审结果按评审循环的规矩批注。

## 19. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-29 | 第一稿 |
| 0.2 | 2026-10-29 | 按设计评审第 1 轮修订（8 条挡路、13 条非阻断全部处理，见 §19.1）；依据改为 main `eb614ab`，两种待决直接用 `e22282f` 的表格卡字段；另修一处自查发现的问题：检查日志从 `<项目目录>/checks/` 移到 `env-checks/`，因为 `scripts/check-lint.mjs` 跑 jscpd 后会整个删掉 `.llm/checks` |
| 0.3 | 2026-10-30 | 按设计评审第 2 轮修订（2 条挡路、13 条非阻断，见 §19.2）；并入评审之后人定的事（§19.2 第二张表），其中 `d-chat-not-cards` 让申报通道改为对话里人的下一句话、第三次修复与 D1 改为四行的方案；D2 已答（B）；依据改为 main `8599304`；另写一页放行稿 `onepage.md` |
| 0.4 | 2026-10-30 | 按设计评审第 3 轮修订（6 条挡路 F11–F16、8 条非阻断 N27–N34，见 §19.3 第一张表），人准的最后一稿；并入评审之后人定的 `d-boards-as-hooks`、`d-rules-in-repo` 与存放范围、`d-main-agent-peak-exempt`、`d-design-onepage` 用进产品与接缝裁定（§19.3 第二张表）；依据改为 main `820eb78`；0.3 原文与放行稿留在 `design-0.3.md`、`onepage-0.3.md` |
| 0.5 | 2026-10-30 | 按设计评审第 4 轮修订（4 条挡路 F17–F20、8 条非阻断 N35–N42，见 §19.4 第一张表），人准的再一稿，并进对齐轮；照循环板 0.6、规则板 0.10、M3 附录 0.5、M7 0.6 与「Check entries seam」对齐（§19.4 第二张表）；依据改为 main `9c346fb`；0.4 原文留在 `design-0.4.md` |

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
| `d-main-agent-shell` 定稿（git 与命令行交给主 Agent，只拦写文件；会丢工作的 git 命令先存快照） | 快照由 M3 第 4 步做（M3 附录 0.4 §2.5，`src/guard/git-snapshot.ts`），M4 不另做一份；M4 的规则不判 git，file-tools-only 的例外照旧写明 git 放行；快照门与 M4 共用跟进记录器，它的拒绝记录按拒绝分类 | §2.3、§3.3、§5.2、§11、§13.3、§15、§18 第 5 条 |
| `d-one-main-agent` | 子 agent 被拒后把编号交回给主 Agent，由主 Agent 在它与人的对话里申报；主 Agent 被巡检、晨报叫醒时，harness 提醒它回合末再出示一次申报文字 | §5.5、§5.6 |
| `d-main-agent-models` | 审查与子 agent 的模型由主 Agent 选，M4 不写评审用哪档模型 | §13 |
| `d-auto-drive` | 放行之后主 Agent 自己推进 M4；§13 写明 M4 里只有 D1、转生效、第三次修复三处停下问人 | §13 |
| `d-zcode-3171` | 重核两样 ZCode 事实：别名表的七个工具名与 `DeferredToolCall` 的参数形状，3.17.1 与 3.16.3 相同 | 文件头、§3.3、§3.6、§9 H11 |
| `norm-review-floor` | G1–G4 与 C1 全审；之后改规则模式、可申报名单、同意词表的提交也全审 | §3.5、§5.3、§5.5、§13、§18 第 5 条 |
| `d-design-onepage` | 写一页放行稿 `onepage.md`；开发中的问题分三档、攒着问、一次至多三件 | §13、§17、`onepage.md` |

另有两处自查改动：依据 main `8599304` 上 `6134c83` 的登记方式，E1 加 `./env` 导出与 `locale/env/` 的标题；`request_exception` 三句话的上限从 1000、500、500 收到 80、60、60，因为它们原样进给人看的文字。

### 19.3 对第 3 轮评审与之后人定事项的处理

第 3 轮的发现：

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F11 MEDIUM 检查器与第三次修复都不在循环板上 | 采纳，并照之后人定的 `d-boards-as-hooks` 做得更彻底：每项检查本身就是循环板上的条目（`env.files-edited` + 筛选 + 自带的检查命令或人同意的脚本），经循环板的提议路径由人同意、即刻生效；env 行与图行各交一份（`src/env/loop-entry.ts`、`src/graph/loop-entry.ts`），经 `ctx.inject([LOOPS_SERVICE])` 交 `env.checks-after-edit`（`ownRules` 四行由常量拼、`details` 列本项目的检查）与 `graph.third-rework`，按每项检查与每次提问 `recordRun`；`contribute` 或 `recordRun` 失败时告警一次、行健康写明；契约测试由后合入的一方加；§13.3 一行；§18 第 5 条给 `schedules` 的七条；方向清单自查一节 | §0、§1.2 `m4-checks` 第 5 条与 `m4-rules` 第 2 条、§1.5、§2.2、§2.3、§6.1、§6.2、§6.8、§7.2、§9 H23、§11、§13.1 E3、R1、§13.3、§13.4 第 8 项、§14.1 `env-checks`、§14.2、§16、§18 第 5 条 |
| F12 MEDIUM 第三次修复的问话让人二选一 | 采纳评审的改法：问话只问「先停下查原因，可以吗？」；`reopenQuestion` 写提议式待决（题目与四行过 `proposalLineRefusal`，「附」进 `body`），不带任何选项字段；`notice` 改为用不带四行的 `propose_to_human` 交给人、用 `record_human_answer` 记，人说不用定了时带原话放弃；疑问一行写可核对的事实（「若三次重开不是同一个问题，接着修也行」）；R1 依赖 M3 第 6 步，§13.3 那一行删去；L2 钉住。另：M4 不自己渲染四行，请 M3 第 6 步加「原样再给人看」一种，因为今天的引擎对什么都没改的 `edit` 返回 `invalid`（`src/graph/engine.ts`:613）。申报的问话同样只留一个回复词 | §0、§1.2 `m4-rules` 第 2 条、§4 表、§4.6、§5.4、§13、§13.1 R1、§13.3、§14.2、§16、§18 第 5 条 `m3` |
| F13 MEDIUM 装了 M3 与 M7 之后申报走不通 | 采纳评审给的一条改法：guard 行提供服务 `glmHournessRequests`，M7 的 `worker-scope` 拒绝工作区外的写入时调 `outsideDenial` 拿编号与给 worker 的例外一句，再调时先 `peekGrant`（只读），核对与用掉仍在 guard 行；worker 用 `ask_main` 等，主 Agent 申报、人同意后 `answer_worker`，worker 原样再调；放行说明按被拒的是谁写三种；worker 等不及时的退路；§2.3、§13.3 各一行，§18 第 5 条给 `m7`，验收第 8 条，L3 `guard-request-worker`，L4 第 4 项 | §0、§1.2 `m4-request-card` 第 1、8 条、§2.2、§2.3、§5.2、§5.3、§5.5、§5.6、§5.9、§10、§11、§12、§13.1 G4、§13.3、§13.4 第 4 项、§14.1、§16、§18 第 5 条 `m7` |
| F14 MEDIUM 自动推进时人的「可以」很难紧跟申报文字 | 采纳评审的四条改法：`openRequests(sessionId)`，M7 申报开着时以 `hourness-waiting-human` 停住 goal、关了恢复；「回合末再出示一次」改为每一回合首步都加；没有 M7、人自己用 `/goal` 时 `ask` 的说明多一句，§11 一行写明可能多次 `not-shown`；L3 `guard-request-goal` | §0、§1.2 `m4-request-card` 第 3、9 条、§2.3、§2.5、§5.3、§5.5 第 2 条、§5.9、§9 H22、§11、§14.1、§14.2、§16、§18 第 5 条 `m7` |
| F15 MEDIUM 等人回话的申报在「需要你」里看不到 | 采纳：开是 `request_exception` 的 `ask` 结果（另带 `lines`），关是带 `request: {ref, outcome}` 的 `hourness-request` 提醒，重启之后补 `lapsed`；§18 第 5 条请面板在 (b) 一类列出、2 小时为限、指向申报所在的会话；§15 那一条删去 | §1.2 `m4-request-card` 第 6、10 条、§2.3、§5.3、§5.5 第 1、6 条与末段、§5.8、§9 H21、§11、§14.1、§14.2、§15、§18 第 5 条 `m8-plain-language` |
| F16 MEDIUM 回放读了工具结果的文字 | 采纳：`tool/result` 只读 `toolCallId` 与 `isError`，「当时拦没拦」按同一会话、同一工具名、2 秒以内的流水记录判，对不上记 `unknown`；§3.6 写明读的每个字段，另读的三样元数据写进一页放行稿；L2 用出错结果里的标记串钉住 | §0、§1.2 `m4-shadow` 第 4 条、§2.1、§3.6、§9 H13、§11、§12、§16、§17 D2 |
| N27 NIT `renderPlan` 与 M3 的四行规则是两份 | 采纳：四行用 `src/graph/proposal.ts` 的 `PROPOSAL_LABELS` 与 `proposalLineRefusal`，`plan-text.ts` 只加题目、「附」与问话；G4 先开工时照附录 §3.3 建 `proposal.ts` | §2.2、§2.3、§5.4、§12、§13.1 G4、§13.3 |
| N28 NIT 申报文字的疑问一行没写会改方案的事实 | 采纳评审的两句 | §5.4、§16 |
| N29 NIT 同一条回复里既有 `propose_to_human` 又有申报文字 | 采纳：`request_exception` 第 5a 条返回 `busy`（只读本会话历史，不依赖 M3 的投影），`ask` 的说明加「Do not call propose_to_human in this reply.」；另一侧请 M3 在有开着的申报时返回 `busy` | §1.2 `m4-request-card` 第 2 条、§5.3、§13.3、§18 第 5 条 `m3` |
| N30 NIT 正路就是停下时「走对」的比例被拉低 | 采纳：晨报写「走对 x/y（另有 n 次停下来交给人或上级）」，`y` 不含 `none` | §1.2 `m4-shadow` 第 2 条、§3.3、§3.10、§14.2 |
| N31 NIT 规则板的「排队」被算成违规 | 采纳：`RecordClass` 加 `deferral`（`effect: 'queue'`），不进「违规」，由规则板的晨报一节去数；L2 一例 | §1.2 `m4-shadow` 第 2 条、§2.2、§2.3、§3.2、§3.10、§13.1 G1、§18 第 5 条 `rules` |
| N32 NIT 接缝请求要现在记；循环板的规则也要经 `installRuleGate` | 采纳：`loops:schedule-tools` 进 §2.3、§3.1、§3.8 的清单与 `GUARD_RULES`；§18 第 5 条的批注写进 `graph-ops-v04.json`，这一稿就记 | §1.2 `m4-shadow` 第 6 条、§2.3、§3.1、§3.8、§18 |
| N33 NIT 一页放行稿的几处说法 | 设计里的部分采纳：D1 的条数与字数按 0.4 重数（32 条、约 4,500 个字符），D1 的疑问一行改为合 `proposalLineRefusal`；「重启」都写成「DSH 重启或插件重新加载」；「派人审查」「先定为只记录、不拦」两处在一页放行稿里，放行稿在评审通过之后另写，照评审的说法改 | §0、§1.2 `m4-request-card` 第 6 条、§17；`onepage.md`（之后的一步） |
| N34 NIT 依据比 main 旧，G1 的「今天必败」有一条已不成立 | 采纳：依据改为 `820eb78`（`fe0bace` 之后 `src/` 没有改动）；G1 去掉「去掉 `APPLICATION_PROTOCOL`」与「圈禁写 file a request」两项，只换 file-tools-only 的文案（定在 G1）；圈禁的例外 G4 换成三种情形；`src/toolsearch/index.ts`:155–175 没变，§3.3 与 H11 的行号照旧 | 文件头、§2.2、§5.2、§13 开工条件、§13.1 G1 |

评审之后人定的事：

| 人定的事 | 对 M4 的影响 | 改了哪里 |
| --- | --- | --- |
| `d-rules-visible`（项目所有规则在明面上） | 两项交给循环板，检查器的四个数在 `ownRules`；四条代码规则经规则目录在规则板上看得到 | §3.8、§6.8 |
| `d-boards-as-hooks`（两块板像 hook，同意即生效）与接缝裁定 | 检查改成循环板上的条目，动作是自带的检查命令或人同意的脚本，形状、存放、同意的路与执行器归循环板，M4 只定事件、动作的含义与执行；命令不经 shell；检查不拦任何调用，没有试运行；代码里的四条影子规则原地不动；周报对 4 周没结果的检查条目提议删掉（循环板与 M7 做） | §0、§1.3、§1.5、§2.1、§2.2、§2.3、§6.1–§6.3、§6.5、§6.6、§6.8、§7.1、§7.2、§10、§11、§12、§15、§16、§18 第 4、5 条 |
| `d-rules-in-repo` 与存放范围 | 定义进仓库，运行时的东西进会话所在项目的 `.llm/`；流水从数据行的固定目录改为按会话找项目；写之前确认 `.llm/` 被忽略；M4 没有用户级文件；跨项目的经验与记忆这一点留着、不归 M4 | §0、§1.2 `m4-shadow` 第 7 条、§2.2、§2.4、§3.2、§7.3、§11、§12、§13.1 G1、§13.3、§13.4 第 9 项、§17 |
| `d-main-agent-peak-exempt` | M4 不加高峰逻辑，不让主 Agent 等；检查任何一档照跑；等人与等高峰两种停住分开 | §0、§2.5 |
| `d-design-onepage` 用进产品（两层循环） | 开发 M4 时三档各举例；产品里两种问话进同一批、一次至多三件，申报那一条回复只有它一件 | §0、§1.5、§13、§13.5 |
| 指标设计 0.1 对 M4 的请求（`m4` 2026-10-29T23:40Z 的批注） | 交拦截、跟进、申报、放行与压制计数的事件；`recordKey` 与 `metrics-files-only` 照请求；`suppressions.jsonl` 这一稿留着，理由在 §3.11 | §2.3、§3.8、§3.11、§6.7、§18 第 5 条 `metrics` |

0.4 的自查改动：申报文字与第三次修复都按 M3 的四行规则数过长度（§4.6、§5.4 写出数字）；L3 的 `env-checks` 场景在探针里没有循环板服务，改由验证插件提供一个最小的服务，真机的整条路在 L4。

### 19.4 对第 4 轮评审与对齐轮的处理

第 4 轮的发现（挡路 4 条，非阻断 8 条；第 3 轮 14 条里 13 条关闭，N33 部分关闭，其中放行稿的部分等 `onepage.md` 重写）：

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F17 MEDIUM 人加的检查条目要循环板改五处、漏请「给人看原文」，循环板 0.5 草稿走相反的路 | 采纳，并照编排方的接缝裁定（`Check entries seam`）与循环板 0.6 改：检查分两种。人加的检查是循环板上人的普通条目（动作 `check`，命令原文取自环境工具节点），由循环板的执行器跑，走与脚本同一条同意的路，同意时给人看命令原文（`commandDetail`，没有「已给人看原文」的记号就 `invalid`，循环板 0.6 §7.1），M4 不执行它们；M4 给三样东西：读法 `checkCommandOf`（服务 `glmHournessEnv` 的成员）、纯函数 `fillCheckArgv`（以 `-` 开头的文件名前加 `./`，循环板 F53）、纯函数 `formatCheckOutput`；工具节点上的检查行回来，格式是 M4 的（`check <名字> <格式> $ <命令>`，`when` 可有可无）。M4 自带的检查器是带 `when` 的检查行，板上是插件交来的 `self` 条目，M4 在下一步之前执行，进程经 `runCommand` 的 `queue: 'direct'`。0.4 §18 第 5 条的第 ①②④ 点撤回，③ 由 0.6 的 glob 接住，⑤ 由 `queue` 接住；§11 不可逆表那一行改写，写明两种检查各自的防线与自带检查器较弱的一点（人批准节点时不一定细读命令），以及怎样要同样硬的防线（不带 `when` 的定义加 `check` 条目）；`env.files-edited` 改为经 `emit` 交进收件箱，键 `files-edited:<会话>:<turn>-<step>`，先问 `listens`；L2 加假服务返回的 `detail` 含命令文字、没有记号不生效 | 文件头、§0、§1.2 `m4-checks`、§1.5、§2.2、§2.3、§6.1–§6.3、§6.5、§6.6、§6.8、§7.1–§7.2、§9 H23–H24、§10、§11、§12、§13 开工条件与 E3、§13.3、§13.4 第 5、8 项、§14.1 `env-checks`、§14.2、§15、§16、§18 第 4、5 条 |
| F18 MEDIUM harness 写给人的文字里嵌了节点标题和路径，`renderPlan` 会抛错，第三次修复的题目会被面板的写法检查拒掉 | 采纳评审的四条：`personTitle(title, {limit, issuesOf})`（`src/graph/plan-text.ts`）不合格返回 `undefined`，申报背景一行省去焦点半句，第三次修复的题目写「这件活要修第 3 次了」、节点标题移进「附」；题目分 `lead`（常量）与 `data`（`displayPath` 转义过的路径），`renderPlan` 只查常量；`request_exception` 第 6、7 步对任何抛错返回 `unavailable`、不登记、行健康降级；L2 加焦点标题「补齐验收条件」、带 `*`、路径含「门禁」与 `gate.ts` 的各例，以及三个标题交给真实引擎（plain-ui 第二阶段的常量下；未合入时 `M<数字>` 一例跳过）。`issuesOf` 在 plain-ui 第二阶段合入后取 `plainIssues(text, 'title', ids)`，之前取 `plainWordsIn`（实读：英文词里有 `gate`，所以含 `gate.ts` 的路径也会被报） | §0、§1.2 `m4-rules` 第 2 条与 `m4-request-card` 第 2 条、§2.2、§4.6、§5.3 第 7 步、§5.4、§10、§11、§12、§13.1 G4、R1、§14.2、§16 |
| F19 MEDIUM `outsideDenial` 用 worker 自己的圈禁根判「工作区外」，worker 写主检出也变成问人 | 采纳：`outsideDenial` 按项目判（`projectOf`），目标在项目里（主检出、别的工作树）返回 `undefined`，由 M7 的 `worker-scope` 纠偏（`ask_main` 请放宽写入范围），不发编号、不问人；只有出了项目才登记编号；工作目录不在任何项目里时退回按圈禁根判；guard 行自己的圈禁对 worker 不变。实读 `rootsFor`（`src/guard/index.ts`:92–96）：没配 `workspaceRoots` 时圈禁根就是会话头的 `cwd`，M7 起 worker 时它是工作树。L2 加三例，`guard-request-worker` 加一步 | §0、§1.2 `m4-request-card` 第 8 条、§2.3、§5.9、§10、§12、§13.4 第 4 项、§14.1、§14.2、§16、§18 第 5 条 `m7` |
| F20 MEDIUM `request_exception` 没有示范 | 采纳，领域换了：评审建议的示范与练习题是同一个领域，不用。例子是把新曲目追加到音乐播放器读的歌单文件（写工作区外，人回「可以」，同一个调用放行一次，都是已经定了的事），三句各在 80、60、60 的上限内，放进说明末尾（常量 `REQUEST_EXAMPLE`）；L2 让它过参数检查与 `renderPlan`，并核对例子里没有练习题领域的词；§1.5 补 `d-agent-examples`、`d-memory-scope`、`d-script-timeout`；没有检查器时的提醒同时是检查行的示范（Python 的 ruff），L2 让它过 `checkLineRefusal` | §1.5、§5.3、§6.6、§14.2、§16 |
| N35 「每一回合再出示」的条件，验收与 §5.5 不一致 | 采纳：验收第 3 条去掉「上一回合不是以这段文字结束时」，与 §5.5 第 2 条一致；L2 加连着三个回合各一条 | §1.2 `m4-request-card` 第 3 条、§14.2 |
| N36 跨项目的经验与关于人的记忆已经定了 | 采纳：各处改为引 `d-memory-scope`，删去 §17「留着的一点」 | 文件头、§0、§1.1、§1.5、§2.4、§17 |
| N37 检查的超时没有对照 `d-script-timeout` | 采纳：结果交给改文件的那个 agent（`d-boards-as-hooks` 允许）；超时报 `recordRun` `failed`、`reason: 'timeout'`；「连续 3 次后本会话不再跑」只用于跑不起来与输出读不懂，超时下一次照常再跑，同一项上一次还在后台时不起第二个；`ownRules` 第二、三行照此改写；周报是否数 `self` 条目的超时由循环板定（§18 第 5 条） | §0、§1.2 `m4-checks` 第 2、5 条、§1.5、§6.3、§6.5、§6.8、§11、§14.2、§18 |
| N38 申报停住推进之后，没有一步就不会过期，推进也不会恢复 | 采纳：登记申报时设 `unref` 的 2 小时定时器，到点写 `expired`、经 `agent.followup` 送关闭提醒叫醒持有者，M7 在那一步恢复；`openRequests` 不返回已过 2 小时的申报；定时器丢了仍按下一步比较时刻补写 | §1.2 `m4-request-card` 第 9 条、§5.3 第 7 步、§5.5 第 1 条、§5.9、§11、§14.2、§16 |
| N39 回放读哪些会话没有按项目限定 | 采纳：默认只读会话头 `cwd` 经 `projectOf` 归到目标项目的会话，`--sessions` 另给目录时同样筛，`summary.json` 记因属于别的项目而跳过的会话数；设计期试算读全机日志的说明补上 | §1.2 `m4-shadow` 第 4 条、§3.6、§3.9、§14.2 |
| N40 改动文件的路径相对主检出，worker 工作树里的改动对不上目录前缀 | 采纳：`files` 写成相对改动文件所在的检出的根，`root` 随载荷给，与 §6.3 跑检查的 `cwd` 同一个根；一步改了几个检出里的文件就发几个事件，键后加序号；L2 一例 | §1.2 `m4-checks` 第 7 条、§6.2、§6.8、§14.1、§14.2 |
| N41 worker 的 `ask_main` 怎样结算，§3.3 前后说法不一 | 采纳：改为被记下的拒绝是 `worker-scope` 的，用它的 `rightPath` 结算，M7 的 `rightPath` 认带编号的 `ask_main` 时记 `right-path`，之前记 `other`；从 `none` 的例子里拿出来 | §3.3、§14.2 |
| N42 一处行号 | 采纳：`TRANSITIONS` 在 `src/graph/engine.ts`:110–117（实读，`done: ['doing']` 在 :114） | §4.6 |

对齐轮之后的对照（编排方 2026-10-30 的批注与简报；这些都不是人新定的方向，是已定的方向与已放行设计落到 M4 上）：

| 依据 | 对 M4 的影响 | 改了哪里 |
| --- | --- | --- |
| 规则板 0.10 的三件（`m4` 节点 2026-10-30T10:13Z；规则板 §10.7「M4 设计 0.4」一节）：代码规则目录 `GUARD_RULES`；违规流水的 `record` 与 `late`；`observe` 与 `noteDenial` | `GUARD_RULES` 只列 guard 框架装规则的行（guard 六条、图行一条、循环板两条、指标流水一条），M3 的 `MAIN_AGENT_RULES` 与 M7 的 `EXECUTE_RULES` 各管各的表，规则板映射三张表、`mode` 取表里的；`classifyRecord` 认 `rules:` 开头的 `mode: 'record'`（`rule-record`，不进违规）与 `mode: 'late'`（`late-denial`，进违规、另列），晨报、`ruleStats`、契约测试与 L2 照此改，`keyOf(record)` 给规则板取 `noteDenial` 的键；规则板的门调 `observe` 与 `noteDenial` 的形状写进 §3.3；`PROMOTION` 只管代码里 `shadow` 的规则 | §0、§1.2 `m4-shadow` 第 2、6 条、§2.2、§2.3、§3.2、§3.3、§3.5、§3.8、§3.10、§13.1 G1、§13.3、§14.2、§16、§18 第 5 条 |
| 循环板 0.6 给 M4 的接缝更新（`m4` 节点 2026-10-30T10:13Z）：`runCommand` 的 `queue`、`env.files-edited` 的键与 `emit`/`listens`、`./` 前缀、不经 shell 的命令（`resolveProgram`，`.cmd` 起不了） | 自带检查器用 `queue: 'direct'`，不自己 `spawn`；`env.files-edited` 的键、载荷、`listens` 照 0.6 §4.4；`fillCheckArgv` 加 `./`；检查行的第一项不能是 `.cmd`、`.bat`；`ownRules` 与 `details` 的上限照 0.6 §2.1、§3.1 | §6.1.1、§6.1.2、§6.2、§6.3、§6.8、§9 H23–H24 |
| M3 附录 0.5（`m4` 节点 2026-10-30T11:30Z 的回答）：不带四行的 `propose_to_human` 已加；`busy`、`installMainAgentRules` 经 `installRuleGate`、git 快照门调 `observe`/`noteDenial` 留给 M3 的对齐轮 | 第三次修复可以直接用「再给人看一次」；其余三件仍是请求（§18 第 5 条 `m3`），M4 在它们没加时的行为写明（`tail` 对不上时 fail-closed、影子判定只覆盖经 `installRuleGate` 的规则） | §2.3、§3.1、§3.3、§4.6、§18 第 5 条 |
| M7 0.6（`m4` 节点 2026-10-30T11:58Z）：M4 写给 M7 的四件不在 0.5 处置，PROMOTION 在 P2 之前，其余在实现中「谁后合入谁改」；八道门首日 `enforce`；`EXECUTE_RULES` | `GUARD_RULES` 不列 M7 的门；§2.3 不再说「M7 的五条」；`PROMOTION` 一行写 M7 0.6 的安排 | §2.3、§3.8、§18 第 5 条 `m7` |
| 已进 main 的 `src/data/project-root.ts`（规则板最小一片） | 项目根与 `.llm/` 的追加用它的 `projectOf`、`gitDirOf`、`ensureIgnored`，不再另建；M4 只加复核（`ensureLlmIgnored`）。`.llm/` 的追加由两行（注释加 `/.llm/`）改为一行 `.llm/` | 文件头、§0、§1.2 `m4-env` 第 2 条、§2.2、§2.4、§7.3、§9 H25、§11、§13.3、§16 |
| `d-memory-scope`、`d-script-timeout`、`d-agent-examples`、CHARTER 0.7 | 见 N36、N37、F20；CHARTER 0.7 已写明「代码里的门先影子，板上人看过原文同意的条目即生效」，§1.3 不再请规则板写 | §1.1、§1.3、§1.5 |

对 0.4 的自查改动：§1.2 的建议验收一列因此变长（条数与字数见 §17 D1，已重数）；M4 自带的检查器与人加的检查各自执行，同一条带 `when` 的检查行两边都挂时跑两次，已在 §6.1 写明（`own`）。
