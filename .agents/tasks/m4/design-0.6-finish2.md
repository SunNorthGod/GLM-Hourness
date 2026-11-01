# M4 设计：guard 补齐与环境

版本：0.6（2026-10-31，2026-11-01 修订），第六稿；本稿现在答的是 finish2 复评（`decisions-review-finish2.md` 与 `decisions-gate-finish2.json`：CHANGES_REQUESTED，MEDIUM 1 条 F15，NIT 6 条 N18–N23；F13、F14、N15–N17 评审认为已关闭），逐条处理在 §19.9。此前一遍答的是决定评审第 3 轮（`decisions-review.md`，第 3 轮覆盖了第 2 轮的同名文件：CHANGES_REQUESTED，MEDIUM 2 条 F13、F14，NIT 3 条 N15–N17），逐条处理在 §19.8。此前一遍答的是决定评审第 2 轮（`decisions-review.md`、`decisions-review.json`，第 2 轮的两个文件覆盖了第 1 轮的同名文件：CHANGES_REQUESTED，MEDIUM 2 条 F11、F12，NIT 6 条 N9–N14），逐条处理在 §19.7。再此前一遍答的是决定评审第 1 轮（CHANGES_REQUESTED，MEDIUM 10、NIT 8，编号 F1–F10、N1–N8；评审文件已被覆盖，结论与处理仍在 §19.6），编排方同日的细化裁定（`d-one-lift-path`、`d-timeout-measured` 两个节点 2026-10-31T12:56Z 的批注）在那一遍并入。四遍都没有改版本号。0.5 经设计评审第 5 轮通过（对齐轮，`design-review.md`、`design-review.json`：APPROVED）。人 2026-10-31 读过 0.5 的一页稿之后定了三件事，编排方同日又裁定了撤下规则的路与拦路脚本的数（`d-one-lift-path`）；本稿只按这四样改，别的照 0.5。0.5 原文留在 `design-0.5.md`，0.4、0.3 的原文与 0.3 的放行稿留在 `design-0.4.md`、`design-0.3.md`、`onepage-0.3.md`（`.agents/` 不进 git）。给人看的一页放行稿是同目录的 `onepage.md`，现在是 0.5 的，本稿评审通过之后按新格式重写。逐条的改动在 §19.5，0.5 以前的处理记录（§19.1–§19.4）原样保留，其中说到的节号是当时版本的。0.6 改的三件事与一条裁定：
- 决定一 `d-code-rules-enforce`（人原话：「试运行规则啥的直接拦就行了，这样反而有问题好发现」）：写在代码里的规则从它所在的插件行启用那天起就拦，没有试运行期，没有转正的阶梯。删掉只为转正而存在的东西：规则模式 `RuleMode` 与 `GuardRule.mode`、影子判定与影子记录、标注与精确率召回率、转生效的判据 `PROMOTION`（带标注的会拦样本 20 条含回放、14 天、误伤 0）、历史会话回放、回归语料及其脱敏与命令、页面上「只记下，不挡」的标注、M7 周报阶梯的「影子转生效」一步。保留：新插件行默认禁用、验证过才启用（管的是行，不是规则）；每次拦下带规则 id 写进违规流水，晨报与规则页看得见，误拦因此能被发现（§3.6、§3.10）；「拦截后下一步走对」的度量（§3.3、§3.6）。补上：撤下一条代码规则，人只有一条路（`d-one-lift-path`）：对主 Agent 说一句话，或在规则板上打 `/rules lift <规则 id>`，M4 存记录、在门里查、不另设面向人的命令（§3.5）。只能事后发现的规则拦不住：file-tools-only 的工作区变更兜底（`src/guard/shadow.ts`）改成在那个 agent 的下一步之前送一条纠正提醒，并记一条晚到的拦下（§3.4）。随之 `checker-config` 与 `scratch-only` 的拦截要有出路，进可申报名单（§5.3）。
- 决定二 `d-credentials-readable`（人原话：「密钥文件能读。而且不是都能读吗？什么叫没拦？」）：agent 可以读登录密钥文件。`credential-read` 整条删掉，不作为只记录的规则保留（§4.2），四条新规则因此变三条。
- 决定三 `d-timeout-measured`（D-timeout，人原话：「超时那就这样定。不过还是我说的现在拿不准的事情，要做到优雅失败以及可追溯性」）：M4 自带检查器的超时 = 3 × 运行时间，不低于下限、不超过上限；第一次的运行时间由写检查行的 agent 估，人批准工具节点时看到的是超时，旁边写它从哪个估计算出来；跑过之后由 harness 按最近几次里最慢一次的 3 倍自动定；LLM 不手抄实测数。超时不让行崩、不丢工作，估错只影响下一次的值；每个超时值与每次超时都有记录，在循环板页与晨报里看得见；3 倍超过上限时保持上限，只告诉主 Agent，由主 Agent 自己处理（拆小或收窄检查，或把这一项的上限当作可撤回的设置调高并写明理由），不来问人。这条规则只在 §6.3.1 写一次，别处引用它。
- 裁定 `d-one-lift-path`（编排方 2026-10-31，来自用户旅程评审）：人撤下一条规则只有一条路：对主 Agent 说，或在规则板上打 `/rules lift <规则 id>`，板上的条目和代码里的规则都管。M4 留着自己的撤下记录和门里的查询，规则板把代码规则的撤下交给 M4 的服务 `glmHournessLifts`；M4 不另设面向人的命令，本稿第一版的 `/guard` 删掉；主 Agent 的工具 `guard_lift` 留下，记成同一笔撤下（§3.5）。同一条裁定更正拦路脚本的数：规则板 0.10 的默认是 10 秒、最大是 30 秒，`d-timeout-measured` 下实测值以最大 30 秒为上限（这个数归规则板那一侧写一处，M4 只在 §6.3.1 与 §18 提到）。
其余（申报通道、检查器的分工、环境分支、草稿区、清理、第三次修复）照 0.5。

依据：main `9c346fb`（0.6 另读了 main `040a9b0` 上的 `src/guard/index.ts`、`src/guard/shadow.ts`、`src/workflow/morning-report.ts` 与 `src/graph/engine.ts` 的状态转换表〔实读 2026-10-31〕）。相对 0.4 的依据 `820eb78`，`src/` 里与 M4 相关的改动有：`src/data/project-root.ts` 已在（`projectOf(cwd, home?)`、`gitDirOf(root)`、`ensureIgnored(root, directory)`〔实读〕，规则板的最小一片建的，注释写明「仓库唯一的项目根模块」）；`src/graph/proposal.ts` 已在但只有 `renderProposal` 与 `ProposalText`（`PROPOSAL_LABELS`、`proposalLineRefusal`、`splitBold` 随 M3 的 `propose_to_human` 来）；`src/graph/plain-question.ts` 已在（`PLAIN_WORDS`、`plainWordsIn`：中文按子串、英文按整词不分大小写，英文词里有 `gate`、`acceptance`，所以含 `gate.ts` 的路径也会被报）；`src/guard/sections.ts` 接走 `DECLARATION_SECTION`，`src/guard/index.ts` 因此多一行导入（`rootsFor` 现在是 :92–96，`activeRules` :87–89）。`src/guard/rules.ts`、`src/memory/audit.ts`、`src/toolsearch/index.ts` 没有变化，0.4 引的行号照旧。`src/guard/followup.ts`、`gate.ts`、`records.ts`、`catalog.ts` 与整个 `src/env/` 仍不存在。ZCode 基线 3.17.1（`d-zcode-3171`）：本设计用到的 ZCode 事实有两样，都已对 `reference/zcode-3.17.1/zcode.cjs` 重核〔实读 2026-10-30〕：别名表 `ZCODE_ALIAS_NATIVES` 的七个工具（`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Read`、`TodoWrite`）各有一处 `name:"<名字>"` 的定义；`DeferredToolCall` 的参数在第 132 行是 `V.object({name: V.string().min(1), input: V.record(V.unknown())}).strict()`。

对齐轮读的相邻设计（都是已放行或已定稿的版本，本稿不改它们的任何文件，要它们改的事写成接缝请求，等 dogfood 之后处理，`d-freeze-until-dogfood`）：循环板 `.agents/tasks/schedules/design.md` 0.6（§2.3 的 `LoopCheckAction`、§4.4 的 `env.files-edited`、§5.3、§6.6 的 `runCommand`/`resolveProgram`、§7.1 的提议与同意、§17 给 M4 的四条）；规则板 `.agents/tasks/rules/design.md` 0.10（§10.1 的代码规则目录、§10.7 的「M4 设计 0.4」一节）；M3 `.agents/tasks/m3/design-addendum.md` 0.5（§3.4 `propose_to_human` 含「再给人看一次」、§3.5 的第 5a 步、§3.11 `MAIN_AGENT_RULES`）；M7 `.agents/tasks/m7/design.md` 0.6（§3.2.1 `worker-scope`、§12.1 `EXECUTE_RULES`、§18.2 对 M4 四件的安排）；plain-ui 0.7（§5.3 写法检查）；指标流水 0.2。`.agents/tasks/design-context.md` 读到末节「Rules thin slice: orchestrator rulings after its review」。图上 `m4` 节点 2026-10-30 的批注（循环板 0.5、0.6 给 M4 的接缝，规则板 0.10 的三件，M3 附录 0.5 与 M7 0.5 的回答）与 `d-alignment-rounds`、`d-agent-examples`、`d-memory-scope`、`d-script-timeout`、`d-main-agent-peak-exempt` 各节点已读。

证据写法：同 M3 设计。「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行。〔实读〕读过源码；〔推断〕由源码推出、没有运行；〔未核实〕列进 §14 的 L3 或 L4 项；〔本机实测〕设计期间做过的只读试验：量了单文件 ESLint 与 `tsc` 的耗时，没有写任何文件。（0.5 以前还读过本机会话日志、统计条数；回放随决定一删掉，那一段试算一并删去。）

范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/` 与 `~/.dsh`，不用桌面版。要记到图上的事写成同目录的 JSON 草稿，由编排者执行：本稿的是 `graph-ops-decisions.json`（0.5 的是 `graph-ops-align.json`，0.4 的是 `graph-ops-v04.json`）。

干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文，符号原样。

## 0. 摘要

M4 在编排层包 `dsh-hourness` 里加一行 `glm-hourness/env`（源码 `src/env/`，默认禁用），其余改动落在 guard 行（`src/guard/`）与图工具（`src/graph/tools.ts`）。按 `docs/ROADMAP.md` M4 与节点 `m4`、`m4-request-card` 的条目：

- 拦截机制（§3，任务 `m4-gate`，0.5 叫影子模式机制 `m4-shadow`）。写在代码里的规则一律生效：判为拒绝就拦，从规则所在的插件行启用那天起，没有试运行期，没有转正的阶梯（`d-code-rules-enforce`）。所有用 guard 框架的行（guard 行、图行的 `graph-files-only`、循环板的 `loops:schedule-tools` 与 `loops:files-only`、指标流水的 `metrics-files-only`、接管行的 `bootstrap-read-no-shell`）都经同一个安装函数 `installRuleGate`（`src/guard/gate.ts`）挂监听器，判定、拒绝记录、撤下与跟进因此只有一份实现，`evaluate` 删除；M3 的八条（`MAIN_AGENT_RULES`）与 M7 的门（`EXECUTE_RULES`）各有自己的常量表，在它们改经 `installRuleGate` 安装之前照原样装，那时撤下与跟进只覆盖经 `installRuleGate` 的规则（M3 附录 0.5、M7 0.6 都没有接这一条，留给它们的对齐，§3.1、§18）。流水里各种记录由唯一的分类函数 `classifyRecord` 区分，晨报、统计、命令行与规则页都用它；它也认规则板写进同一份流水的 `mode: 'record'`（人选的只记录，不算违规）与 `mode: 'late'`（晚到的拦下，算违规、另列一行）（§3.2）。误拦靠看得见来发现：每次拦下带规则 id、工具、命令或目标与来源写进违规流水；晨报按规则写次数、拦截后下一步走对的比例和最近一次拦下的样子，规则页读同一份（§3.6、§3.10）。记录自己写不进流水时也不静默：丢了几条，一边附在会话的行健康上（不被同一行的下一次报告覆盖），一边在流水里下一次写成功时补一行缺口记录，晨报与规则页读流水，所以读得到（§3.2）。每次经 `installRuleGate` 的拦截之后，同一 agent 下一步里模型发出的第一次调用记一条跟进记录（走对了正路、原样重试、别的、没有下一步），不论这次调用被哪一行拒绝；GLM 上经 `DeferredToolCall` 包装的调用先拆开再比，同一步里并行发出的调用不算，回合结束或会话卸载时还没有下一步的记为「没有」（§3.3）。这个度量不是为转正而设的：拦截从第一天起就生效，正路写得不清或者拦错了，最先表现为模型原样重试，所以保留（`docs/ORCHESTRATION.md` §6.3，摘要 §4 第 7 条）。人撤下一条代码规则只有一条路（`d-one-lift-path`）：对主 Agent 说一句话（主 Agent 调 `guard_lift`，带人的原话；harness 照 M3 核对人的回话的办法核对：原话必须是客户端送来的最近一条人的消息里的一段，还必须是一句要放开这条规则的话，一条人的消息至多换来一次撤下），或在规则板上打 `/rules lift <规则 id>`（规则板把这一笔交给 M4 的服务 `glmHournessLifts`），恢复同理；M4 不另设面向人的命令；撤下记在仓库的 `docs/guard/lifts.jsonl`，由新规则 `lift-files-only` 护住，agent 写不进：主检出里的那一份和 M7 worker 工作树里已提交的副本都护（§3.5）。只能事后发现的规则拦不住：file-tools-only 的工作区变更兜底（`src/guard/shadow.ts`，改名 `fallback.ts`）在一轮结束时才看到 shell 写出的、没有文件工具碰过的文件，改成在那个 agent 的下一步之前送一条纠正提醒，并记一条晚到的拦下（§3.4）。
- `docs/ORCHESTRATION.md` §6.4 的规划规矩（§4）。三条新规则启用即拦：`suppression-reason`（新增的压制注释没有理由或没挂节点）、`checker-config`（改检查器配置与基线文件）、`scratch-only`（在草稿区以外新建一次性脚本）。读凭证文件没有规则：agent 可以读（`d-credentials-readable`，§4.2）。`checker-config` 与 `scratch-only` 的拦截有出路，进可申报名单，人回「可以」放行这一次（§5.3）。「同一处第三次修复要问人」落在图工具上：一次修复是一次重开（从完成改回进行中）之后的工作，LLM 第 3 次重开同一节点、第 3 次修复即将开始时，harness 在它下面提一张提议式的人定待决（M3 附录 §3.3：题目与背景、推荐、疑问、不做四行，不带任何选项字段），主 Agent 把它放进下一批交给人的事里（一次至多三件），只问一个方案「先停下查原因，可以吗？」，按人的原话记下（§4.6，F12）；题目里的节点标题带人没学过的词、编号或文件名时，题目改写成「这件活要修第 3 次了」，标题移进「附」（§4.6，F18）。这一项在循环板上列出（`graph.third-rework`，§6.8）。表里其余三行归 M3（主 Agent 不写文件、设计期只读）与 M7（子 agent 只写写入范围）。
- 申报通道（§5，任务 `m4-request-card`）。工作区圈禁拒绝时，纠偏带一个申报编号，正路写明调用新工具 `request_exception` 与它的四个字段。按 `d-chat-not-cards`，不出问答卡：工具返回一段由 harness 写的方案文字（题目，背景、推荐、疑问、不做四行，一句问话；四行的规则与 M3 的提议式待决是同一份 `src/graph/proposal.ts`；路径、文件在不在、多大、会不会备份都由 harness 核对后写进去，agent 的理由用原话标明），agent 把它原样放在回复的末尾，结束这一回合。题目里的路径与背景一行里的焦点标题是数据，不是 harness 的常量：焦点标题不合格就省去那半句，文字写不出时工具不登记、返回 `unavailable`（§5.4，F18）；工具说明带一道示范，L2 让它过真实的检查（§5.3，F20）。人的下一条消息就是回答：harness 在下一步之前读到它，只在三件事都成立时放行：这条消息来自客户端的输入（`source.kind: 'user'` 且带 `rpcId`）、它之前的最后一条助手消息以这段文字结尾、消息恰是「可以」一类的明确同意词。放行之后，同一派发链里恰好同一个调用（同一工具、同一组参数）在 30 分钟内放行一次，harness 在那一步给 agent 一条说明，带上被拒调用的工具与参数；其余回话都不放行。放行只存在内存里，只由 harness 读人的消息之后写入；违规流水只留痕，项目图不参与授权；进程重启或插件重新加载就丢掉，agent 重新申报。使用时重新核对目标：与申报文字里的事实不同就拒绝并作废放行，目标存在且不大于 10 MiB 时一律先备份；再调一次仍被拒。普通的子 agent 不问人，纠偏让它把编号交回给派发它的 agent。装了 M7 的项目里写文件的是 worker，它的写入先被 M7 的写入范围拦下：M7 的门向 guard 行的服务要一个编号（`outsideDenial`；目标出了项目才给，写进项目里但出了工作树的文件，例如主检出，由 M7 自己的纠偏处理、不问人，F19），worker 用 `ask_main` 把编号交给主 Agent 并等着，主 Agent 申报、人回「可以」之后主 Agent 回 worker，worker 原样再调一次；M7 的门先查放行簿（`peekGrant`），放行仍由 guard 行核对与用掉（§5.6，F13）。申报开着时，M7 把主 Agent 的自动推进停下等人（`openRequests`，§5.9，F14），申报的开与关都写在会话日志里，面板「需要你」列出它（§5.8，F15）。拒绝文案：`61be79a` 已让两条规则的例外改为告诉人，G1 只换 file-tools-only 的文案，带编号的部分随 G4。圈禁顺带补上 `str_replace_editor` 的写入。可申报的规则除圈禁外还有 `checker-config` 与 `scratch-only`，它们一启用就拦，所以拦下之后要有出路（§5.3）。
- 检查器运行与当轮回传（§6）。检查分两种，谁同意、谁跑都分开（`design-context.md`「Check entries seam」，循环板 0.6 §2.3、§5.3、§7.1）。**M4 自带的检查器**：环境工具节点的验收条件里人批准的检查行（名字、输出格式、命令参数表、适用的文件），在板上是 env 行交来的一项只能看的 `env.checks-after-edit`（`self`）；agent 用文件工具写成功之后，它的下一步之前 env 行在这些文件上跑适用的检查，一步最多等多久、每个检查几秒超时都按 §6.3.1（先由写检查行的 agent 估，跑过之后由 harness 按实测定），把结果以一条 `<system-reminder>` 放在这一步的消息末尾：每个检查的发现数、至多 5 条带 `文件:行` 的发现（落在本次改动行上的排前面）、完整输出的日志路径（摘要 §4 第 6 条）。没有发现时不出声，除非上一条结果有发现。命令不经 shell，改动文件只作为单独的参数传给程序。进程由循环板的共用执行器起（`runCommand` 的 `queue: 'direct'`，不排在循环板的脚本后面，并发由 M4 管）。**人加的检查**：循环板上人的普通条目，动作 `check`，命令原文取自同一个工具节点的检查行，由循环板的执行器跑，走与脚本同一条同意的路（`loop_propose` 返回命令原文与注意事项，`propose_to_human` 把它们原样给人看，`record_human_answer` 在核对到人看过原文之后才写入），结果按条目的设置交给主 Agent 或改文件的那个会话；M4 不执行它们，只给三样东西：按工具节点读出一条检查命令的读法 `checkCommandOf`、填占位的纯函数 `fillCheckArgv`、整理输出的纯函数 `formatCheckOutput`（§6.1）。`env.files-edited` 是循环板事件表里的一个事件，env 行在每一步算出改过的文件之后经 `emit` 交进收件箱（没人听时不交，§6.2）。env 行另把两项交给循环板（§6.8，F11）：「改完文件就跑检查」，展开写出检查器自己的五条规矩（一步最多等多久、每个检查的超时怎么定、跑不起来或输出读不懂连续 3 次后这个会话不再跑、没有检查覆盖的语言每个会话提醒一次、同时最多跑几项检查和排队多久不再等），数由代码里的常量生成；与图工具的「同一件活第三次返工之前停下问你」。每跑完一次检查、每提一次第三次修复的问题都报给循环板。
- 告警棘轮与压制（§6.7）。棘轮由四处一起守：每次改完的检查只报新发现（本仓库的 ESLint 批量压制让基线里的告警不出现）；汇合门禁跑项目的检查命令（M7 `norm-merge-gate`）；`checker-config` 拦下对配置与基线的改动（人回「可以」才放行这一次）；`suppression-reason` 拦下没写理由的新压制。压制注释的总数每天记一次，晨报显示总数与本期变化。
- 环境分支与草稿区（§7）。图上 id 为 `env` 的特性节点是环境分支，子节点是工具节点（用途、用法、选择理由、安装位置、配置文件）。每个 agent 在会话第一步、以及环境分支变化后的下一步收到一条提醒：项目里有哪些工具、怎么用，改完哪些文件会跑检查，草稿区在哪。草稿区是工作区的 `.llm/scratch/`；项目没有忽略它时，env 行经 `ensureIgnored`（`src/data/project-root.ts`）把一行 `.llm/` 追加进 `.git/info/exclude`，追加之后用 `git check-ignore` 复核，仍未忽略时行健康降级。M7 汇合门禁的第 6 条（草稿区的临时脚本已删除或转正）调用 M4 的 `scratchLeftovers`。
- 清理 `.llm/docs/` 的三个抓取脚本与 `__pycache__`（§8）：删除，保留抓下来的 `_bigmodel_md/`，删除之前把脚本里的地址与重新抓取的办法写进 `docs/reference/bigmodel-guide-digest.md`。
- 不在 M4 里做、M4 要接上的：会丢工作的 git 命令先存快照（`d-main-agent-shell` 定稿）由 M3 第 4 步做（M3 附录 0.5 §2.5），M4 不另做一份。M4 的规则不判 git；快照门与别的门共用跟进记录器，它的拒绝在流水里按拒绝分类（§2.3、§3.3）。
- 存放（`d-rules-in-repo`、`d-memory-scope`，§2.4）。M4 按项目存的东西都在项目里：定义进仓库（环境工具节点上的检查行与项目图里的环境分支、循环板上人加的检查条目、人撤下代码规则的记录 `docs/guard/lifts.jsonl`），运行时的东西进这个项目自己的 `.llm/`，不进 git（违规流水、放行之前的备份、检查日志与超时记录、压制计数）。项目由会话的工作目录往上找 git 根定（`src/data/project-root.ts` 的 `projectOf`），工作树与主检出是同一个项目；0.3 的违规流水写在数据行配置的一个固定目录里，换成按会话找项目之后，每个项目的晨报只数自己的。M4 不在用户级目录存任何东西；申报、放行与跟进的待判只在内存里。关于人本人的记忆留在用户级、项目经验（含通用的踩坑经验）都在项目里（`d-memory-scope`）：M4 不存经验与记忆，与它无关。
- 高峰（`d-main-agent-peak-exempt`，§2.5）。M4 不加任何高峰逻辑，不让主 Agent 等高峰：申报、第三次修复的提问与它们的回话任何一档都照常；改完文件就跑的检查是本机进程、不花 GLM，任何一档都照常跑。练习题（K1）是重活，归规则板按高峰模式挪开。
- 两层循环（`d-design-onepage`，§13.5）。开发 M4 时，只影响 M4 且可逆的问题由主 Agent 定、在下一批告诉人；改到 M4 设计方向的回本设计的循环；改到框架的回大循环。产品里 M4 给人的两种问话（申报、第三次修复）都在主 Agent 的对话里，进同一批，一次至多三件；申报单独放在回复最后，所以那一条回复只有它一件。

实施（§13）：四条并行的线，互不碰同一个文件。guard 线 G1–G4 串行（安装函数、记录与分类、按项目存流水、file-tools-only 的新文案 → 跟进、统计、晨报与指标事件 → 判定上下文、三条规则、撤下、事后纠正 → 申报通道）；env 线 E1–E4（新行 → 环境分支与草稿区 → 检查器与交给循环板的两项 → 压制计数；压制标记表放在 `src/shared/`，E4 不等 G3）；图线 R1（第三次修复之前问人）；清理线 C1。登记文件、晨报与文档由编排者按 §13.3 排先后合入。G4 等 M3 第 4 步（`dispatchRoot`）；R1 等 M3 第 6 步（提议式待决）与它的「原样再给人看」一种（§4.6）；E3 等循环板的共用执行器、事件表与服务（`src/loops/`，§6.1、§13.3）；人加的检查要 E3 的读法与纯函数合入才跑得起来，在那之前这类条目一律 `refused`（循环板 0.6 的 S3 已这样写）。M7 那一侧的两处接缝（写入范围的门要编号与查放行、申报开着时停下自动推进）谁后合入谁加。人放行之后由主 Agent 自己推进到做完（`d-auto-drive`），只在 D1 与第三次修复两处停下问人；G1–G4 与 C1 按 `norm-review-floor` 全审。

要人定的事（§17）：只剩 D1，七个任务节点「怎样算做完」（改这一项属于必须问人的第 1 类），按 `d-ask-three-gates` 写成一项「确认一个推荐」：一个是非问句，推荐与理由在句子里，真有代价时加一句，与放行合成一项（评审 finish2 轮 N22，§17）。D2（回放）随决定一作废，D-timeout 人已定，0.1 的 D3 在 0.2 删去。申报改为对话里回「可以」、人加的检查是人在对话里看过命令原文同意的循环板条目、M4 自带的检查器取自人批准的工具节点，是 agent 照人定的方向与编排方的接缝裁定定的（§16），写在一页放行稿里请人看一眼。本稿新补的撤下一条规则的路（§3.5）与事后纠正（§3.4）也是 agent 定的（§16），同样写进一页放行稿。D1 与一页放行稿 `onepage.md` 的问话合成一次问。

## 1. 需求与验收

### 1.1 来源

- `docs/ROADMAP.md` M4：§6.4 的规划规矩；影子模式机制（随 `d-code-rules-enforce` 改为拦截机制与撤下，ROADMAP 的字句等编排方的文档提交改）；检查器运行与当轮回传；告警棘轮与压制规则；环境分支与草稿区；清理 `.llm/docs/` 下的抓取脚本。
- 节点 `m4-request-card`（依赖 `m3-5`、`split`，来源 `question-24` 选 A）：圈禁拒绝之后经决策卡申报，写明目标、目的、可逆性与影响面、考虑过的替代；人批准只放行当次，再次调用仍被拒；复用 M3 的 `decision_card` 与以人的身份写图；按所有路由设计。验收在设计时提给人（D1）。其中「经决策卡」「复用 `decision_card`」被之后的 `d-chat-not-cards`（人 2026-10-30：「产品里也不用问答卡、不给选项」）取代：申报改在对话里问，人用下一句话回答（§5）；节点正文与对 `m3-5` 的依赖由编排者按 §18 第 2 条改。
- `docs/ORCHESTRATION.md` §5（同步卡：出工作区操作，批准只放行当次，不产生残留授权）、§6.1（规矩即数据的五样：告知、探测、纠偏、申报、记录）、§6.2（G3）、§6.3（正路与「拦截后下一步走对的比例」）、§6.4、§6.5（影子模式，已被 `d-code-rules-enforce` 取代）、§7.1–§7.6（环境、草稿区、检查器、告警）、§10.2（压制注释数、修在根上）。
- `docs/CHARTER.md` §6「告警必须修」（§6「写在代码里的新门禁先以影子模式运行」与 `docs/ORCHESTRATION.md` §6.5 已被 `d-code-rules-enforce` 取代，文字由编排方的文档提交改）；§7.1 条款 4（修在根上）、7（失败要出声）、10（不长工具专用目录）、11（处处留痕）。
- 阅读摘要 §4 第 6 条（检查器回传只给几行，全文写日志）、第 7 条（量纠偏是否教会了模型）。第 8 条（用带标注的语料量精确率与召回率）与第 9 条（凭证读取先记影子）不做：前者随试运行期一起删（`d-code-rules-enforce`），后者随 `d-credentials-readable` 删。
- 人在 2026-10-29 的定案：`question-14` G3；`d-failure-plans` 与 `docs/DEVELOPMENT.md` §1.1 的挡路标准；`question-28` C 的并行；验证用的积分预先授权；规则只由人写（`d-rules-human-only`，针对规则板）；问人的话带前因后果（`.agents/tasks/design-context.md`「Questions for the person carry their background」）。
- 人在 2026-10-30 的定案：`d-chat-not-cards`（问人改成聊天；格式定稿见节点的最后一条批注：题目单独一段，背景、推荐、疑问、不做四行各自成段，标签不加粗，每行把重点几个字加粗，问话放在最后；只给一个方案，不编号、不给字母）；它取代 `d-option-card` 与 `d-recommend-last` 对人的问法，所以 0.2 里申报卡与第三次修复待决的表格写法都不再用；`d-ui-look-not-operate`（面板只看不操作，「需要你」只列在等人回话的事，点开跳到主 Agent 的对话）；`d-plain-questions`（验收说「怎样算做完」，标定说「练习题」，门禁说「合入前的检查」，投影、补遗说清是什么）；`d-one-main-agent`（每个项目恰好一个主 Agent，是人唯一的对话窗口）；D2 的回答（选 B，原话「不介意」：只读工具调用的命令文本与路径，不读对话正文，结果留在 `.llm/`，脱敏的个别样本进 `tests/guard-corpus/`；0.6 起回放与语料随 `d-code-rules-enforce` 删掉，这一条作废）；`d-main-agent-shell` 定稿（主 Agent 随意用命令行与 git，只是没有写文件的工具；harness 只守主干前进的那一刻；编排方的落地细则：会丢掉没提交的改动或改写已推送历史的 git 命令执行前，harness 先存一份可恢复的快照（`git stash create` 加 `refs/hourness/snapshots/` 下的引用，改写历史时打标签）并记下，再放行）；`d-one-main-agent`（每个项目恰好一个主 Agent）；`d-main-agent-models`（子 agent 与审查的模型由主 Agent 选，harness 只记录）；`d-auto-drive`（设计放行之后主 Agent 自己推进到底）；`d-zcode-3171`（ZCode 基线 3.17.1）；`norm-review-floor`（改拦截与权限、删文件等几类改动一律全审，harness 按改动的文件与命令判断）；`d-design-onepage`（每个模块的设计对照方向清单，另写一页人话放行稿，人放行之后才开发；开发中的问题分三档、攒着问、一次至多三件）。
- 第 3 轮评审之后人定的（2026-10-30）：`d-rules-visible`（项目所有规则都在明面上，原话「没问题，项目所有规则确实应该都在明面上」：改完文件就跑的检查器放循环板）；`d-boards-as-hooks`（原话「我指的是，循环板和规则板都借鉴hook和dsh插件的理念，然主Agent编脚本写进去？」与「同意了直接运行就行」：两块板的每一条都是「什么时候 + 可选的筛选 + 动作」，动作是系统自带的或主 Agent 派子 agent 写的脚本，人看过原文同意后直接生效、不先试运行；代码里的规则原地不动、照旧列出；节点正文写明「规则板、循环板与 M4 的检查器照此改」）；`d-rules-in-repo` 与存放范围（原话「一样进仓库和项目目录」与「差不多都是进.llm，全局的似乎只剩下人设和登录信息之类的吧？」：定义进仓库，运行时的东西进项目的 `.llm/`，违规流水在列；之后的 `d-memory-scope`：关于人本人的记忆留用户级，项目经验含通用的踩坑经验都在项目里）；`d-main-agent-peak-exempt`（原话「主Agent应该不受高峰影响，随时回复的」）；`d-design-onepage` 用进产品（原话「两层循环加，我正想说这个事情呢」）；接缝裁定（`design-context.md`「Main agent and peak; stale entries; hook seam」：条目形状、事件表与脚本执行器归循环板，哪些事件拦路与脚本结果怎样进 `checkCall` 归规则板，两块板走同一条同意的路；周报列出 4 周没结果的人加条目并提议删掉）。
- 第 4 轮评审之后的定案与对齐轮（2026-10-30）：编排方对 F17 的接缝裁定（`design-context.md`「Check entries seam」：会跑东西的循环板条目不论谁带来都走同一条同意的路，同意时给人看原文；人加的检查是循环板的普通条目，由循环板的执行器跑，命令原文取自环境工具节点，节点与它的格式归 M4；M4 不执行人加的条目，自带的检查器仍是插件交来的数据、M4 可以继续执行）；`d-agent-examples`（主 Agent 写给人或交给 harness 的每一种东西，在写它的工具说明里配一道示范，领域与练习题无关）；`d-script-timeout`（不拦路的条目有自己的超时，超时的结果写「没跑完」、下一次触发照常再跑、超时计进周报）；`d-alignment-rounds`（人「全都没问题」）与人对这一稿的「行」（`m4` 节点 2026-10-30 的批注）；循环板 0.6、规则板 0.10 对 M4 的接缝（`m4` 节点 2026-10-30T08:12Z、10:13Z 两处批注）。
- 人在 2026-10-31 的定案（读过 0.5 的一页稿之后，`m4` 节点 2026-10-31T05:20Z 的批注与 `d-timeout-measured`）：`d-code-rules-enforce`（原话「试运行规则啥的直接拦就行了，这样反而有问题好发现」：写在代码里的规则启用即拦，不设试运行期与转正的阶梯；保留新插件行默认禁用，拦下带规则 id 记录且看得见，人一句话或一条命令撤下一条规则；只能事后发现的规则拦不住，由 M4 定它变成什么；「拦截后下一步走对」的度量由设计者定去留；已放行的设计不改稿，请求写成节点批注）；`d-credentials-readable`（原话「密钥文件能读。而且不是都能读吗？什么叫没拦？」：agent 可以读登录密钥文件，M4 的读凭证规则整条删掉，不留作只记录）；`d-timeout-measured`（D-timeout，原话「超时那就这样定。不过还是我说的现在拿不准的事情，要做到优雅失败以及可追溯性」：脚本与检查的超时 = 3 倍运行时间，先由写它的 agent 估运行时间、人批准时看到超时和它从哪个估计算出来，跑过之后由 harness 按最近几次里最慢一次的 3 倍定，不低于下限、不超过现有上限，LLM 不手抄实测数；超时不让行崩、不丢工作，每个超时值与每次超时都有记录且看得见，3 倍超过上限时保持上限，只告诉主 Agent，由它自己处理，不问人。后一半由编排方 2026-10-31T12:56Z 的细化裁定补）。

### 1.2 各任务的行为与建议验收（D1）

建议在 `m4` 下另建六个任务节点（§18），与已有的 `m4-request-card` 合起来七个。验收写进节点要人批准；在人定之前，实现与 L2、L3 的检查按下表做。各行带 F、N 编号的条目是 0.4 按第 3 轮评审、0.5 按第 4 轮评审与对齐轮改的。0.6 重写了第一行（`m4-shadow` 改名 `m4-gate`），改了 `m4-rules` 的第 1 条，给 `m4-request-card` 的第 1 条加了一句，给 `m4-checks` 加了第 8 条（§19.5）；决定评审第 1 轮之后又改了 `m4-gate` 的第 1、4、6 条与 `m4-checks` 的第 8 条（§19.6）；第 2 轮又改了 `m4-gate` 的第 1、4 条与 `m4-checks` 的第 8 条（§19.7）。

| 任务 | 行为（本设计） | 建议验收 | 层 |
| --- | --- | --- | --- |
| `m4-gate` 拦截机制与撤下（0.5 叫 `m4-shadow`） | 规则一律生效；唯一的安装函数；记录与分类；拦截后的跟进；撤下一条规则；事后才看得见的拦截变成下一步的纠正；规则目录与规范节点一致（§3） | 1. `GuardRule` 没有 `mode` 字段，经 `installRuleGate` 安装的规则判为拒绝就拦：调用不执行，在能定出项目目录的会话里（§2.4）违规流水里每条拒绝恰好一条记录，带规则 id、时刻、工具、命令或目标（`call`）、`scope` 与路由、纠偏的原因（写不进的记录：写入结果由 `projectJournal` 的 `violation` 返回，§3.2；`installRuleGate` 按会话数，并用 `RowHealth.note` 把「N 条违规没有落盘」附在这个会话的行健康上，同一行的下一次 `report` 不会把它冲掉；流水里下一次写成功时，在丢记录的地方多一行 `kind: 'gap'` 的缺口记录（丢了几条、哪段时间、各是哪一类），晨报与规则页读流水，所以读得到；没有项目目录的会话不计入，照今天只在行健康里写「无项目目录，违规不落盘」）；流水里没有 `mode: 'shadow'` 的新记录；`glm:guard` 声明列出所有没被撤下的规则。2. 经 `installRuleGate` 安装的规则每拦下一次，同一 agent 下一步里模型发出的第一次调用留下恰好一条跟进记录，不论这次调用又被哪一行拒绝或放行，分为走对正路、原样重试、别的、没有下一步；GLM 上经 `DeferredToolCall` 包装的调用按拆开之后的工具与参数判；与被拦的调用同一步发出的调用不结算；拦截之后回合结束或会话卸载、还没有下一步时记「没有下一步」；晨报按规则写「拦截后下一步走对 x/y（另有 n 次停下来交给人或上级）」，`y` 不含「没有下一步」（N30）；跟进、申报、放行、撤下的记录不计入晨报的违规数，规则板 `mode: 'enforce'` 的拦截计入，规则板排队（`effect: 'queue'`）的记录不计入（N31），规则板的 `mode: 'late'` 计入违规数并另列一行，`mode: 'record'` 不计入、单列计数；规则板的门同样结算跟进，M3 的 git 快照门在它加 `observe`、`noteDenial` 之前不在这一条里。3. 误拦看得见：晨报按规则写拦下次数、拦截后下一步走对的比例与最近一次拦下的样子（工具、命令或目标的前 60 个字符、时刻），原样重试过的另写一行「原样重试 k 次」；`npm run -s guard -- records --rule <id> --show` 列出这条规则每次拦下的完整记录；`ruleStats` 是纯函数，晨报、命令行和规则页读同一份数。4. 撤下一条规则（§3.5）：`guard_lift {rule, words}` 只有根 agent 能调；本会话里最近一条用户来源的消息不是客户端送来的人的话，或 `words` 不是它里面的一段（起止落在边界上，同 M3 §3.6），或不含撤下意图词表里的词（词前紧挨着否定词的命中不算，§3.5），或不足 4 个字符，或这条人的消息已经换来过一次成功的撤下，都返回 `not_said`、什么都不写；成功时 `docs/guard/lifts.jsonl` 追加一行，之后同一项目里（含 M7 worker 的工作树）这条规则不再拦、不在 `glm:guard` 声明里；规则 id 不在 `GUARD_RULES` 里时拒绝并列出可撤下的 id，`lift-files-only` 对 `guard_lift` 返回 `forbidden`、指向规则板的 `/rules lift`；规则板的 `/rules lift <规则 id>` 与 `/rules restore <规则 id>` 经 M4 的服务 `glmHournessLifts`（`setLifted`）同样撤下与恢复，M4 不注册面向人的斜杠命令（规则板那一侧的接线等 dogfood 之后，此前在 L2 里由假的规则板调服务）；agent 用文件工具或 shell 写任何一份检出里的 `docs/guard/lifts.jsonl`（主检出的，M7 worker 工作树里已提交的副本也是）被 `lift-files-only` 拦下；撤下与恢复各在违规流水里留一条 `kind: 'lift'` 的记录（原话、经哪条路），晨报写「撤下的规则」；`lifts.jsonl` 被 git 命令（`git apply`、`git cherry-pick`、`git merge` 带进新行，`git checkout`、`git restore`、`git revert` 换回旧版本）改成与流水不一致时，下一份晨报对每条对不上的规则写一行「lifts.jsonl 与流水对不上」，点名规则与两边的状态，两个方向都查（F15）。5. 事后才看得见的拦截（§3.4）：file-tools-only 的工作区变更兜底在一轮结束时发现 shell 写出了没有文件工具碰过的文件，违规流水里一条 `mode: 'late'` 的记录（带 `paths`、`calls`），同一 agent 的下一步之前收到一条纠正提醒（点名文件、写明这些写入已经发生、正路是文件工具）；没有下一步时只有记录；组合里没有 `workspace-changes` 时不做、行健康写明。6. `GUARD_RULES` 列出 guard 框架的全部规则（guard 行六条、图行一条、循环板两条、指标流水一条、接管行一条 `bootstrap-read-no-shell`），都经 `installRuleGate` 安装，条目没有模式一栏，规范节点的规则标签与它一一对应；M3 的 `MAIN_AGENT_RULES` 与 M7 的 `EXECUTE_RULES` 各在自己的表里，三张表合起来 id 不重复。7. 违规流水写在会话所在项目的 `.llm/` 下：两个项目的会话各写各的，M7 worker 工作树里的会话写主检出那个项目的；行配置了 `home` 时写那里（§2.4）；`docs/guard/lifts.jsonl` 在项目根（主检出）的仓库里，harness 只读写这一份；它在每一份检出（含 worker 工作树）里的路径都被 `lift-files-only` 护住（第 4 条）；`lift-files-only` 按目标所在检出的根判，根由 `src/data/project-root.ts` 新加的 `checkoutRootOf` 给出（N23），不用 `projectOf` 内部那个跟 `commondir` 的 `locate` | L2、L3 |
| `m4-rules` 规划规矩 | 三条规则启用即拦；不设读凭证的规则；第三次修复之前问人；§6.4 写明每行在哪（§4） | 1. `suppression-reason`、`checker-config`、`scratch-only` 启用即拦：触发的调用被拒、不执行，各留一条拒绝记录；相邻的不触发情形（带 `-- 理由 [节点]` 的压制、改普通源文件、在已有同类文件的目录里新建 `.ts`）放行、不留记录；`checker-config` 与 `scratch-only` 的拒绝带申报编号（§5.3）。读 `~/.dsh` 下的凭证文件放行，也没有记录：没有 `credential-read` 这条规则（`d-credentials-readable`）。2. LLM 第 3 次把同一节点从 `done` 改回 `doing`（第 3 次修复开始）时，节点下出现一张由 harness 提出、决定者为人的提议式待决：题目与背景、推荐、疑问、不做四行都过 `proposalLineRefusal`，节点上没有 `options`、`recommend`、`crux`、`verdict`、`weight`；题目、四行与正文里没有 `验收`、`标定`、`门禁`、`投影`、`补遗`；疑问一行写出一个一变方案就要换的事实（F12）；节点标题带人没学过的词、编号或文件名（例「M4 guard 补齐与环境」「补齐验收条件」）时，题目写「这件活要修第 3 次了」、节点标题移进「附」，这样的待决在 plain-ui 第二阶段的写法检查下交给真实引擎照样提得出来（F18）。`graph_status` 的结果让主 Agent 把它放进下一批交给人的事里（一次至多三件），问话只问「先停下查原因，可以吗？」，结果与正文里没有两个以上「回「…」」式的回复词；人同意、补充、否掉或说不用定了，都有记法（`record_human_answer` 拍板或批注，或带原话放弃）。这张待决未关闭时之后的重开不再加。循环板在时，它的页面列出这一项，每提一次报一次（F11）。3. `docs/ORCHESTRATION.md` §6.4 的每一行写明在哪一行实现与状态 | L2、L3 |
| `m4-request-card` 申报通道 | 拒绝带编号；`request_exception` 返回 harness 写的方案文字，agent 原样问人；人的下一句话决定；一次性放行；使用时核对目标并备份；装了 M7 时 worker 经主 Agent 申报、自动推进停下等人；开与关都在会话日志里，面板列出；拒绝文案改写（§5） | 1. 圈禁拒绝的纠偏带申报编号，点名 `request_exception` 与它的四个字段；它从不指向本会话没有的通道（普通子 agent：把编号交回给派发它的 agent；M7 的 worker：用 `ask_main` 把编号交给主 Agent 并等回答）。`checker-config` 与 `scratch-only` 的拒绝同样带编号，点名的字段相同（§5.3）。2. `request_exception` 返回一段由 harness 写的方案文字：题目，背景、推荐、疑问、不做四行各自成段（四行过 `proposalLineRefusal`，N27），最后一句问话；写明解析后的路径、文件在不在、大小或行数、覆盖前会不会备份，agent 写的目的、可逆性与影响面、替代用「」标成原话；疑问一行写出一个一变就不该放行的事实（N28）；harness 自己写的部分不含 `验收`、`标定`、`门禁`、`投影`、`补遗`；题目里的路径与背景一行里的焦点标题是数据（路径原样显示，焦点标题不合格就省去那半句），所以焦点标题是「补齐验收条件」、路径含「门禁」时照样写得出合格的文字；文字写不出（任何抛错）时不登记、返回 `unavailable`（F18）。从最后一条人的消息以来本会话已出示过 `propose_to_human` 的结果时返回 `busy`（N29）。工具说明带一道示范，L2 让它过真实的检查（F20）。3. 只有人的下一条消息能批准：它来自客户端的输入（`source.kind: 'user'` 且带 `rpcId`），它之前的最后一条助手消息以这段文字结尾，消息去掉首尾空白与句末标点后恰是同意词表里的一个（如「可以」）；这时同一派发链里同一个调用（同一工具、同一组参数）在 30 分钟内放行一次，agent 在这一步收到一条说明，带被拒调用的工具与参数；第二次同样的调用与任何不同的调用仍被拒。别的回话、在这段文字之后又说了别的、文字被改过，都不放行，agent 各收到一条说明；申报开着、这一回合第一步没有人的消息时，每一回合都提醒 agent 回合末再出示一次，不论上一回合是不是以这段文字结束（F14，N35）。4. 放行只有这一个来源：向违规流水追加任何记录（含伪造的申报与回答）、改项目图、模型自己写的任何文字都不产生放行。5. 使用时目标的存在与否、大小、修改时间与申报文字里的不同时，这次调用被拒、放行作废；相同时，目标存在且不大于 10 MiB 就先把旧内容复制到项目的 `.llm/requests/`，复制失败时这次调用被拒、放行不作废。6. 进程重启或插件重新加载之后未答的申报与未用的放行都没有了，agent 重调被拒的调用拿新编号再申报；重启之后第一次给那个会话装提醒时，日志里还开着的申报收到一条「作废」的提醒（F15）。申报、人的回话（原话）、放行的使用与作废各在违规流水里记一条，写明何时、哪个会话；晨报计数。7. GLM 与非 GLM 路由上都成立；`str_replace_editor` 写工作区外与 `write`、`edit` 一样被圈禁拒绝。8. 装了 M7 的项目里，worker 写出了项目被 M7 的写入范围拦下时，纠偏带编号；主 Agent 申报、人回「可以」之后，worker 原样再调一次成功，第二次被拒（F13）。worker 写项目里但出了工作树的文件（例如主检出）被拦下时，纠偏是 M7 的，没有编号、不问人（F19）。9. 申报开着时，装了 M7 的主 Agent 的自动推进停下等人（goal 为 `blocked`，原因码 `hourness-waiting-human`，消息写编号），申报关闭后恢复；人在申报文字出现之后回「可以」，放行成功（F14）；人一直不回时，2 小时一到申报关闭并叫醒持有者，M7 恢复推进（N38）。10. 申报的开与关都写在会话日志里：开是 `request_exception` 的结果，关是带 `request: {ref, outcome}` 的提醒（`approved`、`declined`、`closed`、`expired`、`lapsed`）；面板「需要你」从会话日志读出开着的申报（F15） | L2、L3；L4 |
| `m4-checks` 检查器当轮回传 | 检查分两种。M4 自带的检查器取自环境工具节点上人批准的检查行，每次改完在下一步之前跑，紧凑回传；人加的检查是循环板上的普通条目，由循环板的执行器跑，同意时人看到命令原文，M4 只给读法与两个纯函数。交给循环板一项并报每次运行（§6） | 1. agent 的文件工具写入成功、改动的文件对得上一项已批准的检查行的适用范围时，这个 agent 的下一步带一条提醒：每个检查的发现数，至多 5 条 `文件:行` 的发现（落在改动行上的排前面），日志路径；完整输出在日志里；没有发现时不出提醒，除非上一条提醒有发现。2. 自带的检查只来自状态为 `approved`、`doing`、`done` 的工具节点上读得懂的检查行（读不懂的行跳过，行健康写明）。命令不经 shell：改动文件只作为单独的参数传给程序，文件名里的 `$(…)`、反引号、`$变量`、`%` 都原样到程序手里；程序是 shell 的命令不收文件参数。每个检查日志的第一行是展开之后的完整参数表；跑不起来、超时（时长按 §6.3.1）或输出读不懂时，提醒与行健康写明；同一检查在一个会话里因跑不起来或输出读不懂连续 3 次失败后本会话不再跑它，超时不算，下一次改动照常再跑，同一项上一次还在后台跑时不起第二个（N37，`d-script-timeout`）。3. 一步最多等多久按 §6.3.1，跑得慢的结果在之后的步里送到。全进程同时至多 2 个检查进程，上限被调高的检查合起来至多占其中 1 个；还没开始跑的检查，提醒写「queued behind N running checks」；排了 `CHECK_QUEUE_WAIT_MS` 仍没开始的检查不再等，记一条「没跑」，提醒与晨报写明，下一次改动照常再排（N17，§6.3）。4. 改了没有任何检查覆盖的语言的文件时，每个会话每种语言提醒一次，写明社区默认的检查器与怎样请主 Agent 提一个带检查行的工具节点。5. 循环板在时，它的页面列出「改完文件就跑检查」一项，展开是本项目每个已批准的检查行一行与检查器自己的五条规矩，来源写「项目编排带来的 · 只能看」，五条规矩里的数由代码里的常量生成；每次把检查结果交给 agent 时，按每个检查报一次运行，超时报 `failed` 并写 `reason: 'timeout'`（F11，N37）。6. 人加的检查（F17）：`checkCommandOf` 对已批准节点上的一条检查行返回命令参数表（节点或那一行不在、不合语法、未批准、有几条而没指名时返回 `undefined`）；`fillCheckArgv` 把 `{files}` 换成每个文件一项，以 `-` 开头的名字前加 `./`；人加的条目提议时给人看的命令原文就是这条参数表，M4 不执行这类条目。7. `env.files-edited` 的载荷是 `files`（相对改动所在的检出的根）、`root`、`truncated`，经 `emit` 交进收件箱，没人听时不交；工作树里改 `src/a.ts` 时 `files` 是 `src/a.ts`，筛选 `src/` 的条目跑（N40）。8. 超时（`d-timeout-measured`，取值、下限、上限与全部数只在 §6.3.1 与 `src/env/timeout.ts` 的常量里）：人批准环境工具节点时，给人看的方案里每条检查行旁边有一句超时（`timeoutText`，如「超时 9 秒（估 3 秒，乘 3）」），写明它从哪个估计算出来，没有估计时写明用上限；第一次的超时由估计按 §6.3.1 算，跑过之后按最近几次里最慢的一次算；超时的那一次按「不短于当时的上限」计入，下一次的值随之升高；3 倍超过上限时保持上限，只告诉主 Agent（环境提醒里一行，只给根 agent），由主 Agent 决定：用 `check_limit` 把这一项的上限调高并写明理由（调高不问人），或把检查拆小、收窄（那是改检查行，属工具节点的改动，照常要人批准），提醒里把这两样分开写，调高的那一句直接写出完整的检查键 `<工具节点 id>/<检查名>`（N16）；每个超时值写一条记录（来源、时间、旧值、依据的运行），每次超时写一条记录（检查、上限、实际耗时、结局），循环板页的明细与晨报都看得到；给 agent 的超时提醒写明检查名、上限、实际耗时与接下来会怎样；超时不让 env 行出错、不丢别的检查的结果 | L2、L3；L4 |
| `m4-env` 环境分支与草稿区 | 环境分支的格式与会话提醒；草稿区与 git 忽略；给 M7 的草稿区清单（§7） | 1. 图上 `env` 特性的工具子节点，在每个 agent 的会话第一步、以及环境分支变化（工具节点或它的检查行增删、改动）后的下一步列出（至多 12 个、1500 字符），带「改完哪些文件会跑检查」一行（M4 自带的检查器；循环板上人加的检查由循环板告诉主 Agent，不在这一行里）与草稿区一行。2. 会话所在仓库里 `git check-ignore -q .llm/scratch/x` 的退出码为 0；项目没有忽略时，guard 行或 env 行第一次往这个项目的 `.llm/` 写东西之前，经 `src/data/project-root.ts` 的 `ensureIgnored(根, '.llm')` 在 `.git/info/exclude` 末尾追加一行 `.llm/`（已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 任一行时不追加，重启多次也只有一份），追加之后用 `git check-ignore -q` 再核对一次，仍未忽略时行健康降级并写明原因。3. `scratchLeftovers(根目录)` 列出草稿区里的文件（M7 汇合门禁用） | L2、L3 |
| `m4-suppressions` 压制计数 | 每天记一次已跟踪文件里的压制注释数，晨报显示（§6.7） | 1. 压制注释数每天至多记一次（项目的 `.llm/audit/suppressions.jsonl`），按标记分类；指标服务在时同时交一条计数事件。2. 晨报写「压制注释 N 处（本期 +a / −b）」 | L2 |
| `m4-cleanup` 清理抓取脚本 | 删除三个脚本与 `__pycache__`，先把地址与重新抓取的办法写进文档（§8） | 1. `.llm/docs/` 下没有 `_crawl_bigmodel.py`、`_fetch_bigmodel.py`、`_fetch_extra.py` 与 `__pycache__`；`_bigmodel_md/` 不变。2. `docs/reference/bigmodel-guide-digest.md` 的「附」写明重新抓取的办法，并逐字列出三个脚本里的地址与路径字面量；提交信息记下三个脚本的 SHA-256 | L1 |
| `m4`（特性） | 上面七项合起来 | 不变（`m4` 没有验收字段，随子节点关闭）；批次 L4 通过（§14.3） | L4 |

### 1.3 非功能需求

- 不增加人的负担（`question-27` B）：M4 新增的给人的东西只有两种，都在对话里：申报（人本来就要批出工作区的写入，`docs/ORCHESTRATION.md` §5；人回一句「可以」）与第三次修复之前的一问。两种都是 harness 写好的方案文字，人凭直觉说对不对；文字的版式由 M3 的渲染器定，`d-ask-three-gates` 取代四行加粗版式之后随 M3 改，M4 交给它的是记录的字段，不是排好的版面（§16 末尾一项）。另有一种是一次性的：人要在循环板上加一项人加的检查时，主 Agent 在对话里按循环板的提议路径问一次（命令原文附在四行之后），人同意后一直生效；M4 自带的检查器随人批准环境工具节点而来，不另问。拦截记录与统计不打扰人，撤下一条规则是人一句话的事（§3.5）；人不需要标注任何记录，也不需要在某个时点看数字再决定转正。
- 检查器回传占的上下文小：每条提醒至多 1200 字符；没有发现不出声。
- 代码里的每条规则启用即拦（`d-code-rules-enforce`，取代 `docs/CHARTER.md` §6 与 `docs/ORCHESTRATION.md` §6.5 的先影子后拦截；这两处文字由编排方的文档提交改）。新插件行默认禁用、验证过才启用不变（`AGENTS.md`，管的是行，不是规则）。板上人看过原文同意的条目照 `d-boards-as-hooks` 同意即生效。没有试运行期，代价由三样东西承担：每次拦下带规则 id 写进违规流水，晨报与规则页看得见（§3.6、§3.10）；每条拦截都有写明的正路，`checker-config` 与 `scratch-only` 另有申报这条出路（§5.3）；人一句话撤下一条规则（对主 Agent 说，或在规则板上打 `/rules lift`，§3.5）。检查不拦任何调用；人加的检查条目人同意即生效。
- 失败要出声：每一项降级都进行健康；拦截、跟进、撤下、申报、放行、超时的每一件事都在违规流水、超时记录或图上留一条记录。
- 对所有路由与模型生效（G3）；不装 GLM 通道包时同样成立。

### 1.4 不做（详见 §15）

装工具走同步卡（`docs/ORCHESTRATION.md` §7.3）的探测、惯犯升级（§6.6）、格式化工具的自动修复、规范阶梯的提议与周报（M7）、规则板的实现（规则板设计的 R1–R7，与 M4 同一里程碑、另一条线）、循环板上条目的存放、同意的路径与脚本的执行器（循环板）、执行人加的检查条目（循环板的执行器跑，M4 只给命令的读法与两个纯函数）。

### 1.5 按方向清单自查（`d-design-onepage`，评审第 3 轮 F11 第 5 条）

方向清单是人定过的产品方向（`d-design-onepage` 的大循环产出，本仓库今天写在图上各个 `d-*` 决定与 `.agents/tasks/design-context.md` 里）。逐条：

| 人定的方向 | M4 怎样遵守 | 在哪 |
| --- | --- | --- |
| 两块板都像 hook：「什么时候 + 筛选 + 动作」，动作是自带的或人看过原文同意的脚本，同意即生效（`d-boards-as-hooks`），会跑东西的条目都走同一条同意的路、同意时给人看原文（接缝裁定 `Check entries seam`） | 人加的检查是循环板上人的普通条目：什么时候是 `env.files-edited`，筛选是路径与扩展名，动作 `check` 的命令原文取自环境工具节点；人在四行之后看到命令原文与注意事项、同意后直接生效，由循环板的执行器跑，M4 不自己起这类进程。M4 自带的检查器是插件交来的 `self` 条目（`env.checks-after-edit`），命令取自人批准的工具节点，板上只能看，由 M4 执行；M4 的代码规则原地不动，经规则目录列在规则板「写在代码里的规则」里 | §6.1、§3.8 |
| 属于项目的进项目：定义进仓库，运行时的东西进项目的 `.llm/`；全局只留登录凭证、设备号、人设、关于人的记忆、账号用量与插件配置（`d-rules-in-repo`、`d-memory-scope`） | 工具节点上的检查行、人加的检查条目、环境分支、撤下记录 `docs/guard/lifts.jsonl` 在仓库；违规流水、备份、检查日志与超时记录、压制计数在项目的 `.llm/`；M4 没有用户级文件，不存经验与记忆 | §2.4 |
| 主 Agent 不受高峰影响（`d-main-agent-peak-exempt`） | M4 不加高峰逻辑，不让主 Agent 等；检查不花 GLM，任何一档照跑 | §2.5 |
| 两层循环，问题分三档、攒着问、一次至多三件（`d-design-onepage`，含产品） | 开发 M4 时三档各举 M4 的例子；产品里两种问话进同一批；一页放行稿 | §13、§13.5、§17 |
| 问人改成聊天：一个方案四行，不给选项（`d-chat-not-cards`） | 申报文字与第三次修复都是一个方案的四行；第三次修复存提议式待决，不带选项字段，问话不给两个回复词；人随口回答时 harness 给确认句或主 Agent 先复述 | §4.6、§5.4、§5.5 |
| 问话用人学过的词，带前因后果（`d-plain-questions`、问题带背景） | 给人看的文字经 `plainWordsIn`；背景一行紧跟题目 | §5.4、§4.6、§14.2 |
| 面板只看不操作，「需要你」列出等人回话的方案（`d-ui-look-not-operate`、`d-chat-not-cards` 落地方案第 4 条） | 申报不在面板上批；开与关写在会话日志里，请面板在「需要你」里列出开着的申报 | §5.8 |
| 项目所有规则在明面上（`d-rules-visible`） | 自带的检查器作为一项交给循环板，数写在 `ownRules`（五行）；代码规则经 `GUARD_RULES` 在规则板上列出，规则的内容只读，撤下与恢复是 `d-defaults-readonly` 的例外（`d-one-lift-path`），经规则板的 `/rules lift` 与 `/rules restore` | §6.8、§3.8 |
| 默认条目只能看（`d-defaults-readonly`） | env 行与图行交的两项只能看；自带的检查器随工具节点增删，人加的检查条目只经对话增删。例外：插件自带的写在代码里的规则，人可以撤下与恢复（编排方 2026-10-31 的 `d-one-lift-path`），其余仍只读 | §6.8、§3.5 |
| 规则只由人定（`d-rules-human-only`） | 人加的检查条目只由循环板在人同意之后写，agent 只提议；自带的检查器取自人批准的工具节点，验收条件批准之后只有人能改；代码规则只有人能撤下（原话核对加规则板的 `/rules lift`，记录由 `lift-files-only` 护住，§3.5），改规则本身随带人拍板的提交 | §6.1、§3.5 |
| 一个项目一个主 Agent（`d-one-main-agent`） | 子 agent 与 worker 的申报都经主 Agent，在它与人的对话里问 | §5.6、§5.9 |
| 设计放行后主 Agent 自己推进（`d-auto-drive`） | M4 只在 D1 与第三次修复两处停下问人；申报开着时自动推进停下等人，关了接着走 | §13、§5.9 |
| 模型由主 Agent 选（`d-main-agent-models`） | M4 不写评审与子 agent 用哪档模型 | §13 |
| git 交给主 Agent，只守主干前进（`d-main-agent-shell`） | M4 的规则不判 git；快照门与别的门共用跟进 | §2.3、§3.3 |
| 高峰模式三档，默认少做（`d-peak-mode`） | 不碰档位；练习题按规则板的自报重活挪开 | §2.5 |
| 系统看得到的数由 harness 写（`metrics`） | 每条记录由 harness 写；指标服务在时交拦截、跟进与计数事件 | §2.3、§3.11 |
| 改拦截、权限、删文件的改动全审（`norm-review-floor`） | G1–G4、C1 全审；之后改规则、可申报名单、同意词表、`guard_lift` 与服务 `glmHournessLifts` 的提交也全审 | §13 |
| 对所有路由与模型生效（`question-14` G3） | 申报、拒绝文案、检查都不看路由 | §5.7 |
| 人的负担不增（`question-27` B） | 新增的问话都在对话里、四行、一次至多三件；人加的检查条目只问一次 | §1.3 |
| 主 Agent 写给人或交给 harness 的每一种东西，在写它的工具说明里配一道示范，示范过真输入同样的检查，领域与练习题无关（`d-agent-examples`，评审第 4 轮 F20） | `request_exception` 的三句话（目的、可逆性与影响面、替代）由 agent 写、原样进「附」，说明里带一道音乐播放器歌单文件的示范，L2 让它过参数检查与 `renderPlan`；检查行（agent 写进工具节点验收条件的）的示范放在没有检查器时的提醒里，L2 让它过 `checkLineRefusal`；`guard_lift` 的示范（人的原话，§3.5）与 `check_limit` 的示范（`reason` 原样给人看，§6.3.1）各带一道，L2 让它们过各自的参数检查；人加的检查条目的示范归循环板的 `loop_propose` | §3.5、§5.3、§6.3.1、§6.6、§14.2 |
| 项目经验在项目里、关于人的记忆在用户级（`d-memory-scope`，评审第 4 轮 N36） | M4 不存经验与记忆 | §2.4 |
| 脚本与检查的超时先由写它的 agent 估、跑过之后由 harness 按实测定，超时优雅失败、可追溯（`d-timeout-measured`；其前身 `d-script-timeout`：不拦路的条目有自己的超时，超时写「没跑完」、下一次触发照常再跑、超时计进周报，评审第 4 轮 N37） | 检查行带预计秒数，人批准工具节点时看到的是超时，旁边写它从哪个估计算出来；之后每个检查的超时由 harness 按实测定；超时的结果交给改文件的那个 agent（`d-boards-as-hooks` 允许「条目指定的 agent」）并报 `recordRun` `failed`、`reason: 'timeout'`；超时不计入「连续 3 次失败后本会话不再跑」，下一次改动照常再跑；每个超时值与每次超时有记录，循环板页和晨报看得见；人加的检查的超时归循环板的执行器（`checkCommandOf` 把预计秒数一并交给它） | §6.3.1、§6.5、§6.8 |
| 写在代码里的规则启用即拦，不设试运行期（`d-code-rules-enforce`） | 规则对象没有模式；拦下带规则 id 记进违规流水，晨报与规则页看得见；人一句话（对主 Agent 说，或在规则板上打 `/rules lift`）撤下一条规则，撤下记在仓库里、agent 写不进；只能事后发现的规则（file-tools-only 的兜底）在 agent 的下一步之前送纠正提醒；新插件行默认禁用不变 | §3.1、§3.4、§3.5、§3.6 |
| agent 可以读登录密钥文件（`d-credentials-readable`） | 没有读凭证的规则，读了也不记；密钥不进提交（`check:secrets`）与写凭证文件受圈禁照旧；违规流水不遮盖命令原文（流水在 `.llm/`，不进 git；与该节点正文「密钥不进日志」的出入请编排方裁定，§4.2、§15） | §4.2 |

## 2. 总体设计

### 2.1 依据的学科与标准（`docs/ORCHESTRATION.md` §4.3 架构栏）

- 度量：只量系统里看得到的数：每条规则拦下几次、拦截之后下一步走对的比例（行为结局指标，量纠偏有没有教会模型）、原样重试的次数；不做抽样标注与精确率召回率，因为没有试运行期，规则一启用就拦（`d-code-rules-enforce`），误拦靠记录与统计看得见、靠撤下止住。
- 静态分析的工程经验：Sadowski 等对 Google Tricorder 的总结（ICSE 2015；CACM 61(4), 2018）：分析结果在开发者改代码的那一刻、只在改动处给出；开发者认为是误报的比例（effective false positive）超过约 10% 的检查会被关掉或不被理会。对应本设计的当轮回传、改动行优先，以及没有试运行期时的两道补救：每次拦下带规则 id 记录且看得见，人一句话撤下一条被开发者认为是误报的规则。ESLint 的禁用注释描述（`-- reason`）与 TypeScript 的 `@ts-expect-error`（不需要时报错）是压制注释写理由的现成做法。
- 安全工程：最小授权（一次性、绑定到一个调用、有时限）；授权只认模型写不进去的来源（客户端送进来的人的消息，由宿主标 `source.kind: 'user'` 与 `rpcId`），模型能写的文件与项目图只作留痕；人批的就是他读到的那段文字（文字由 harness 写，必须原样出现在人回话之前的最后一条助手消息末尾）；同意要明确（同意词表之外一律不放行，fail-closed）；判定器出错放行、授权缺证据即拒（fail-open 只给探测，授权 fail-closed）；批准的事实与执行时的事实一致才执行（检查时与使用时之间的变化，TOCTOU）；可逆优先（覆盖前备份）；外部命令不经 shell，不可信的文件名只作为单独的参数（argv）交给程序，程序本身是 shell 时不收文件名（命令注入的标准防法：不拼命令行）；人同意的脚本按内容摘要钉住，改过就要再同意（知情同意的对象就是要跑的那份原文）；会跑东西的循环板条目同意时给人看的是命令或脚本的原文，不是转述（循环板的 `commandDetail`、`scriptDetail`）。
- 插件架构：扩展点与登记表（宿主只定契约与校验，扩展方交数据，宿主不认识扩展方的内部）；hook 的约定（事件以 JSON 从标准输入进，结果从退出码与标准输出出，单独的进程、最少的环境）。M4 是循环板的扩展方：交事件 `env.files-edited` 的声明与载荷、自带检查器的 `self` 条目、环境工具节点上命令的读法与两个纯函数，条目的形状、同意的路径与执行器归循环板。
- 人因与认知负荷：问人只给一个方案，背景、推荐、疑问、不做四行（`d-chat-not-cards` 的依据：对一个具体方案凭直觉判断对不对，比逐条比较几个选项省力）；问话带前因后果、用人学过的词（`d-plain-questions`）；人回一句话就行，不点按钮；人只看数字与少量样本。
- 可靠性：外部进程有超时并结束整棵进程树；输出有上限；全部异步、不阻塞宿主事件循环；每条降级有行健康。
- 隐私与数据最少化：违规流水只记工具名、命令或目标与规则 id，不记对话正文与工具输出，留在项目不入库的 `.llm/`；M4 不读 DSH 的会话日志。数据按归属存放：属于项目的数据在项目里，不在用户级目录按项目分（`d-rules-in-repo`）。

### 2.2 构件与位置

全部在编排层包 `dsh-hourness`（`packages/hourness/`）。目录归属表 `scripts/packages.mjs` 的 `hourness.src` 加 `env`。

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| `GuardRule` 去掉模式（删 `RuleMode` 与 `GuardRule.mode`），保留 `rightPath`；`judge(rules, call, face)`；`RuleDeny.ref?`；`evaluate` 删除；file-tools-only 的例外文案改写（G1；`61be79a` 已删掉 `APPLICATION_PROTOCOL`，N34），圈禁的例外加编号（G4）；圈禁覆盖 `str_replace_editor` | `src/guard/rules.ts` | 改（G1、G4） |
| 唯一的安装函数 `installRuleGate`：跟进的 `observe`、`judge`、放行、拒绝记录、撤下的查询、判定出错进行健康 | `src/guard/gate.ts` | 新建（G1；G2 接跟进，G4 接放行） |
| 流水记录的类型：`FollowupRecord`、`RequestRecord`、`GrantRecord`、`GrantVoidRecord`、`LiftRecord`、记录自己没写进去的缺口 `GapRecord`（F13），晚到的拦下 `LateRecord`（取代兜底原来的 `ShadowRecord`）；`ViolationRecord` 加 `call` 与 `ref`；`GuardRecord` 联合类型移到这里；唯一的分类函数 `classifyRecord`（含规则板排队的 `deferral`，N31，与规则板写的 `rule-record`、`late-denial`，规则板 0.10）；`recordKey(line)` 与 `keyOf(record)`（`recordKey(JSON.stringify(record))`，`src/memory/audit.ts` 追加的就是这段文字；规则板用它取 `noteDenial` 的 `key`；指标流水先建时沿用它的）；`subjectOf(call)` | `src/guard/records.ts` | 新建（G1） |
| 按项目的目录：`projectHomeFor(ctx, configHome, cwd)`（行配置的 `home` → 会话所在项目根下的 `.llm` → 数据行的 `projectHome` → 没有）；按项目缓存的流水 `projectJournal(row, homesFor, fs)`（`rowJournal` 的按项目版，每个项目根一个 `rowJournal` 实例，控制台告警因此按项目、按写入类别各报一次）；`violation(record)` 返回 `Promise<JournalOutcome>`（`'written'`、`'failed'`、`'no-home'`，§3.2）：今天的 `rowJournal` 把写入失败吞掉、照样正常返回，调用方分不出丢了的记录，`installRuleGate` 靠这个返回值数丢掉的记录；`rowJournal` 另在内存里留一份待写的缺口，下一次追加成功时写成一行 `GapRecord`（F13，§3.2），`flush()` 在会话卸载时单独把它写出；`usage`、`decision` 不变 | `src/shared/data-home.ts`、`src/memory/audit.ts` | 改（G1，§2.4） |
| 项目根与让项目的 `.llm/` 不进 git 的追加：`projectOf(cwd)`（从工作目录往上找 `.git`，工作树归到主检出）、`gitDirOf(root)`、`ensureIgnored(root, '.llm')`（在 `.git/info/exclude` 末尾追加一行 `.llm/`，已有等价的行时不追加） | `src/data/project-root.ts`（规则板的最小一片已建，是仓库唯一的项目根模块；M5、循环板、指标流水都导入它，不另写） | 导入（G1 起）；加一个导出 `checkoutRootOf(path)`（G3，评审 finish2 轮 N23）：从路径往上找最近的 `.git` 条目，返回它所在的目录，不跟 `commondir`，所以工作树返回自己的根；现有的函数与行为不变，谁先改这个文件谁加，后到的合入时机械合并（§13.3）。`lift-files-only` 用它认「目标在哪一份检出里」（§3.5） |
| 让项目的 `.llm/` 不进 git 的核对：调 `ensureIgnored`，再用 `git check-ignore -q` 复核，每个进程每个仓库一次，把结果交给行健康（`ensureLlmIgnored(项目根)`）；guard 行写流水之前、env 行装 notice 时都调 | `src/shared/llm-ignore.ts` | 新建（G1 或 E2，谁先开工谁建，另一方导入） |
| 代码规则目录 `GUARD_RULES`（id、所在行、标题、能否撤下；guard 框架里装规则的行的全部规则，M3 的 `MAIN_AGENT_RULES` 与 M7 的 `EXECUTE_RULES` 不在里面，§3.8） | `src/guard/catalog.ts` | 新建（G1） |
| 拦截后的跟进：模块级的共用记录器 `observe`、`noteDenial`、`sessionEvent`、`sessionDisposed`、`followupOf` | `src/guard/followup.ts` | 新建（G2） |
| `DeferredToolCall` 的拆包 `unwrapDeferredCall(name, args)`（纯函数，跟进与改动文件两处共用） | `src/shared/deferred-call.ts` | 新建（G2 或 E3，谁先开工谁建，另一方导入） |
| `graph-files-only` 改经 `installRuleGate` 安装（行为不变） | `src/guard/graph-files.ts` | 改（G1） |
| 统计 `ruleStats`（每条规则的拦下次数、跟进四类计数、原样重试次数、最近一次拦下的样子，按来源分；另给整个项目的 `unrecorded`，即这段时间里缺口记录合计丢了几条；纯函数） | `src/guard/measure.ts` | 新建（G2） |
| 命令行（只读：`records`、`stats`） | `src/guard/cli.ts`、`scripts/guard/cli.mjs`；根 `package.json` 加脚本 `guard` | 新建、改（G2） |
| 每次调用的判定上下文（目标是否存在、旧内容、已跟踪文件、配置文件名） | `src/guard/context.ts` | 新建（G3） |
| 路径提及的匹配（从 `graph-files.ts` 抽出 `mention`、`pathKey`） | `src/guard/mention.ts`；`src/guard/graph-files.ts` 改为导入 | 新建、改（G3，行为不变） |
| 三条规则与保护撤下记录的规则 | `src/guard/suppression.ts`、`checker-config.ts`、`scratch.ts`（另导出 `SCRATCH_DIR`、`scratchLeftovers`）、`lift-files.ts`（`lift-files-only`，按目标所在检出的根判，主检出与每个工作树里的副本都算，§3.5） | 新建（G3） |
| 撤下一条规则：读 `docs/guard/lifts.jsonl` 得出被撤下的规则集合（按项目根缓存，文件变了才重读）、追加一行的写入口、工具 `guard_lift`、服务 `glmHournessLifts`（规则板的 `/rules lift` 调它，§3.5） | `src/guard/lift.ts`、`src/guard/lift-service.ts`；`src/guard/index.ts` 注册工具与服务 | 新建、改（G3） |
| 工作区变更兜底（原 `shadow.ts`）：一轮结束时发现没有文件工具碰过的 shell 写入，写一条晚到的拦下并排一条纠正提醒；提醒由 guard 行的 `hourness-guard` 步 notice 在那个 agent 的下一步之前送出（§3.4） | `src/guard/fallback.ts`（`git mv src/guard/shadow.ts`）、`src/guard/index.ts`；原有的兜底测试随改 | 改名、改（G3） |
| 压制注释的标记表 `SUPPRESSION_MARKERS`（纯数据，`suppression-reason` 与压制计数共用） | `src/shared/suppression-markers.ts` | 新建（G3 或 E4，谁先开工谁建，另一方导入） |
| 申报编号、`request_exception` 工具、申报文字、读人回话的判定 `answerOf`、同意词表 `APPROVAL_WORDS` 与 `DECLINE_WORDS`、放行簿 `GrantBook`（只在内存）、使用时的核对与备份；给别的行的三个函数 `outsideDenial`、`peekGrant`、`openRequests`（§5.6、§5.9） | `src/guard/request.ts` | 新建（G4） |
| 服务 `glmHournessRequests` 的类型、常量 `REQUESTS_SERVICE` 与读取函数 `requestsService(ctx, problem?)`（成员类型不对时为 `undefined`，同 `pricingService`；`RequestsServiceContractCheck` 钉住类型与实现一致）。M7 与 M3 只导入这个文件 | `src/guard/request-service.ts` | 新建（G4） |
| harness 写给人的方案文字 `renderPlan({title, lines, attachments?, question})`：只拼 M3 没有的三样（可带路径的题目，至多 80 个码点；「附」一段；问话一段），四行用 M3 的 `PROPOSAL_LABELS` 与 `proposalLineRefusal` 查、按 M3 的段落排法拼（N27）；只查 harness 自己写的那几段，不合时抛错，§5.4。另导出两个纯函数：`personTitle(title, {limit, issuesOf})`（图上的标题进给人看的字串之前先过它，不合格返回 `undefined`）与 `displayPath(path)`（路径进题目之前的转义与截短）（F18） | `src/graph/plan-text.ts` | 新建（G4） |
| 提议式待决的四行规则 `PROPOSAL_FIELDS`、`PROPOSAL_LABELS`、`PROPOSAL_LIMITS`、`proposalLineRefusal`、`splitBold`、`renderProposal` | `src/graph/proposal.ts` | M3 第 6 步建（附录 0.5 §3.3）；G4 先开工时照附录 §3.3 原样建，M3 改成导入 |
| 换词表 `PLAIN_WORDS` 与查词函数 `plainWordsIn`（`renderPlan` 与 L2 用） | `src/graph/plain-question.ts` | M3 第 3 步建（M3 附录 0.5 §2.8）；G4 先开工时照它的内容建，M3 改成导入 |
| guard 行：经 `installRuleGate` 判定、准备上下文、按项目写流水（G1）、注册 `request_exception`、提供服务 `glmHournessRequests`、每个根 agent 一条步 notice（读人的回话、给出放行或不放行的说明、每一回合的再出示提醒、申报关闭与作废的提醒，来源 `hourness-request`，事实字段 `request: {ref, outcome}`）、行健康 | `src/guard/index.ts` | 改（G1–G4） |
| 交给指标流水的事件（拦截、跟进、撤下、申报、放行；服务不在时什么都不做，§3.11） | `src/guard/metrics.ts` | 新建（G2） |
| 第三次修复之前的待决（重开计数与提议式待决的构造，纯函数）；`graph_status` 成功后调用 | `src/graph/reopen.ts`；`src/graph/tools.ts` | 新建、改（R1） |
| 图行交给循环板的一份：事件 `graph.third-reopen`（只供列出）、条目 `graph.third-rework`；每提一次待决调 `recordRun`（F11） | `src/graph/loop-entry.ts`；`src/graph/index.ts`（`apply` 里交） | 新建、改（R1） |
| env 行入口：每 agent 装两条步 notice（检查结果、环境提醒）、草稿区忽略、压制计数、交给循环板、行健康 `env`；E3 起另注册工具 `check_limit`（所有路由都有，只有根 agent 能调） | `src/env/index.ts` | 新建，行 `glm-hourness/env`，默认禁用（E1；`check_limit` 的注册 E3 加） |
| 环境分支的读取：工具节点、`config` 行与检查行的语法、`envBranch(graph)` 返回的工具与已批准的检查（纯函数） | `src/env/branch.ts` | 新建（E2；检查行的部分 E3 加） |
| 环境提醒的渲染 | `src/env/notice.ts` | 新建（E2） |
| 服务 `glmHournessEnv` 的类型、常量 `ENV_SERVICE`、读取函数 `envService(ctx, problem?)` 与循环板要的三样：读法 `checkCommandOf(cwd, tool, check?)`（服务成员，读项目图）、纯函数 `fillCheckArgv`、`formatCheckOutput`；`EnvServiceContractCheck` 钉住类型与实现一致。循环板只导入这个文件 | `src/env/env-service.ts` | 新建（E3） |
| env 行交给循环板的一份：事件 `env.files-edited` 的声明、默认条目 `env.checks-after-edit`（`ownRules` 由常量生成、`details` 列本项目已批准的检查行）；每步算出改动文件之后先问 `listens`、有人听才经 `emit` 交事件；每次送出结果后按每个检查调 `recordRun`。循环板的接口与 M4 要的不同时只改这个文件 | `src/env/loop-entry.ts` | 新建（E3） |
| 检查行的含义与校验（纯函数）：`CheckEntry`（含可选的预计秒数 `estimateSeconds`）、`checkLineRefusal`、命令行的切分 `splitArgs`、`fillCheckArgv` 的实现、哪些程序算 shell | `src/env/check-entry.ts` | 新建（E3） |
| 自带检查器的运行：选出要跑的检查、经循环板共用执行器的 `runCommand({queue: 'direct'})` 起进程（不经 shell）、并发与排队（全进程 2 个名额，上限被调高的检查合起来占 1 个，排队有等待上限，N17）、每步等待、后台续跑、日志、轮转、连续失败 | `src/env/runner.ts` | 新建（E3） |
| 检查超时的算法与记录：纯函数 `checkTimeout`（预计秒数、最近几次实测、上下限、倍数 → 超时值与来源）、`timing.jsonl` 的读写与整理（含排队太久没跑的 `QueueLine`）、超时提醒与晨报用的说法（§6.3.1） | `src/env/timeout.ts` | 新建（E3） |
| 调高某项检查上限的工具 `check_limit`：参数检查、检查顺序、`limits.jsonl` 的读（一项检查的设置以最后一行为准）、追加与整理、给模型的描述与示范 `CHECK_LIMIT_EXAMPLE`（§6.3.1） | `src/env/limit-tool.ts` | 新建（E3） |
| 输出解析 `eslint-json`、`tsc`、`lines`（`formatCheckOutput` 用同一份）；改动行的范围 | `src/env/parsers.ts`、`src/env/changed-lines.ts` | 新建（E3） |
| 检查结果提醒的渲染 | `src/env/check-notice.ts` | 新建（E3） |
| 压制注释计数 | `src/env/suppressions.ts` | 新建（E4） |
| 晨报：读会话所在项目的流水；拒绝过滤改用 `classifyRecord`，去掉影子一节；每条规则一行（拦下次数、最近一次拦下的样子、原样重试次数）；拦截后走对的比例（另数停下交人的次数）；流水的缺口（丢了几条，F13）；撤下的规则；申报与放行；压制注释数；检查的超时值与超时（§6.3.1） | `src/workflow/morning-report.ts` | 改（G1 的过滤与目录、G2、G3 的撤下一行、G4、E3 的超时一节、E4） |
| 行健康的持久说明 `RowHealth.note(sessionId, key, text \| undefined)`：附在会话的行健康上，同一行之后的每一次 `report` 都带着它，状态至少是 `degraded`（§3.1）。丢掉的违规记录数与判定出错的规则靠它留住（F13）；每一行自己的 `provideRowHealth` 都得到这个能力，不必各写一份合并 | `src/shared/health.ts`、`tests/health.spec.ts` | 改（G1） |
| 行健康表加 `env` | `src/shared/health.ts` 的 `HOURNESS_ROWS` | 改（E1） |
| 工具名契约 `GUARD_TOOL_NAMES = ['request_exception', 'guard_lift']` 与 `ENV_TOOL_NAMES = ['check_limit']`。三个工具都不常驻：不往 `ORCHESTRATION_RESIDENT_TOOLS` 里加，该文件头写明不在常驻名单里的编排工具在 GLM 上默认延迟。`tests/contracts.spec.ts` 把名字钉到注册上，少登记一个就失败 | `src/shared/tool-names.ts`、`tests/contracts.spec.ts` | 改（G3 加 `guard_lift`，G4 加 `request_exception`，E3 加 `check_limit`；三步改同一个文件，按 §13.3 排先后） |
| 行登记：`env` 行排在编排层宿主行的最后、`ui` 之前，`disabled: true`；按 `6134c83` 的做法在补丁里写 `name: dsh-hourness/env`，导出 `./env` 与 `./env/locale/*.json`，设置页的标题与说明放在 `locale/env/` | `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`packages/hourness/package.json`、`packages/hourness/locale/env/en.json` 与 `zh.json`、`packages/hourness/tsconfig.json`（随表）、`tests/contracts.spec.ts` 的字面行 id 清单 | 改、新建（E1） |
| 事故用例（手写的表驱动测试，取代回归语料；§3.7） | `tests/guard-rules.spec.ts` | 新建（G1 起，各步加自己的） |
| 假宿主补 rc.3 的信号：根调用的 `tool/call` 事件先于 `tools/pre-execute`（G2）、`turn/end` 与 `session/disposed`（G2）、步 notice 的 `messages` 里客户端送来的人的消息（`source: {kind: 'user', rpcId}`，G4）、`agent/pre-step` 的 `turn` 与 `step`（G4，每一回合的再出示提醒用）；已有的不重复加 | `tests/fake-rc3.ts` | 改（G2、G4） |
| 探针场景 | `scripts/probe/` 下新场景（§14.1） | 改（G1–G4、E1–E3） |

`renderPlan` 放在 `src/graph/` 而不是 `src/shared/`：公共库编进两个包，不能导入图目录的换词表；它只给编排层包用，guard 目录今天就导入图目录（`src/guard/index.ts` 导入 `src/graph/service.ts`），方向不变。

不加的东西：图节点的新字段（工具节点的配置文件写在验收条件里；检查在循环板上，§6.1；申报不留在图上，§5.8）；图引擎的权限改动（第三次修复用 M3 第 6 步的提议式待决）；问答卡（`d-chat-not-cards`）；新依赖（M4 不读 DSH 的会话日志，不需要解码库，§2.1）；M4 自己的脚本执行器（用循环板的，§6.3）。配置项：env 行只有与图行同形的 `home`、`fs`；guard 行不加配置项（`home` 照旧）。

### 2.3 与其他设计的分工（什么在哪）

| 东西 | 在哪 | 归谁 |
| --- | --- | --- |
| 代码规则一律生效（不设模式） | 规则对象没有 `mode` 字段；`installRuleGate` 判为拒绝就拦 | M4。guard 行的规则、图行的 `graph-files-only`、循环板与指标流水的门、M3 的 `MAIN_AGENT_RULES`、M7 的 `EXECUTE_RULES` 都是这样；M3 的按 `question-25` 本来就直接生效，M7 的八道门首日全部生效（M7 0.6 §12.1 的 `RuleMode` 与 `PROMOTION` 两处引用随 `d-code-rules-enforce` 作废，§18） |
| 代码规则的执行（判定、拒绝、撤下、跟进、判定出错） | `installRuleGate`（`src/guard/gate.ts`） | M4。guard 框架里装规则的行都经它装 `tools/pre-execute` 监听器，不再各写一份：guard 行、图行（G1 改）、循环板的 `loops:schedule-tools` 与 `loops:files-only`（循环板 0.6 §2.4 第 16、16a 行）、指标流水的 `metrics-files-only`（指标设计）。M3 的 `installMainAgentRules` 与 M7 的 `worker-scope` 等今天各装各的监听器、用 `evaluate`：M3 附录 0.5 与 M7 0.6 都没有接「经 `installRuleGate` 安装」，G1 删掉 `evaluate` 之后这两处要改，谁后合入谁改（§3.1、§18 第 5 条）。契约测试核对（§3.8） |
| 拦截记录的流水 | 会话所在项目的 `.llm/audit/violations.jsonl`（§2.4） | 格式已有（split 第 7 步）；M4 加 `call`、`ref` 与跟进、申报、放行、作废、撤下五种记录，晚到的拦下用 `mode: 'late'`，和唯一的分类函数 `classifyRecord`（§3.2）。读这份流水的代码都用它：晨报、`ruleStats`、命令行、规则板的规则页 |
| 人写的规则的执行方式 | 规则板的状态与它的 `judge`（规则板自己的 `tools/pre-execute` 监听器，`prepend`） | 规则板（规则板 0.10 §2.3、§5.5、§6.2）。M4 不实现人写的规则，规则板也不经 `installRuleGate`（它的判定、排队与等待单是另一套）。规则板写进同一份流水的记录（`rule: 'rules:<id>'`）用四种取值（规则板 0.10 §10.7 M4 一节第 2 条）：`mode: 'enforce'` 拦下（有 `effect: 'block'`）算拒绝，`mode: 'enforce'` 加 `effect: 'queue'` 算排队（`deferral`，不进「违规」，N31），`mode: 'record'` 是人选的只记录（`rule-record`，不进违规数、单列计数），`mode: 'late'` 是晚到的拦下（`late-denial`，进违规数、另列一行）；`mode: 'shadow'`（规则板 0.9 的旧名，0.10 已改 `record`，不会再写）按旧记录处理，见 §3.2。规则板只说它需要的取值，格式与分类归 M4（§3.2）。M4 的统计照样处理这些记录（`ruleStats` 按规则给次数与跟进四类计数）；规则页上「人标过的误判数」一栏没有了（标注随决定一删掉），规则页改读 `ruleStats` 的次数与撤下状态；`hits.json` 只是每天的命中次数。规则板条目的 `record` 与 `enforce` 由人选，与代码规则无关。规则板的监听器第一件事调 `observe`（§3.3），拒绝与开单拒绝时调 `noteDenial`（规则 id 为 `rules:<id>`，没有 `rightPath`），所以 guard 规则拦截之后下一次调用被规则板拦下时跟进记录不漏；规则板 0.10 已采纳这两项（M4 不在时不调，规则板的验收只覆盖经它自己的门的拦截）。在 M4 的 `classifyRecord` 合入之前，规则板的晨报一节（R7）自己数 `record` 与 `late` |
| 代码规则目录 | `src/guard/catalog.ts`（`GUARD_RULES`）；M3 的 `src/guard/main-agent-rules.ts`（`MAIN_AGENT_RULES`）；M7 的 `src/guard/execute-rules.ts`（`EXECUTE_RULES`） | M4 管 `GUARD_RULES`，M3、M7 各管自己的表。规则板 0.10 §10.1 的 `src/rules/builtin.ts` 导入这三张表并映射成 `CatalogEntry`（id 写成 `<行>:<规则 id>`），自己只另加 `rules:files-only`、默认规则与四条附属条目；先合入的一方建文件，后到的一方导入（§3.8） |
| 撤下一条代码规则 | 人只有一条路：对主 Agent 说，或在规则板上打 `/rules lift <id>`，板上的条目和代码里的规则都管（`d-one-lift-path`）。M4 这一侧：仓库文件 `docs/guard/lifts.jsonl`、门里的查询、工具 `guard_lift`、服务 `glmHournessLifts`（§3.5） | 规则板接人的命令：板上的条目它自己撤，目录里 `<行>:<规则 id>` 的代码规则交给 M4 的服务；M4 存记录、查记录、写 `LiftRecord`，不另设面向人的命令。规则页读服务的 `lifted` 显示「已撤下」 |
| 检查与脚本的超时怎么定 | 先由写它的 agent 估、跑过之后由 harness 按实测定（`d-timeout-measured`）；M4 的检查写在 §6.3.1 | M4 管自己的检查。循环板的脚本与 `check` 条目、规则板的拦路脚本、M7 的合入前检查，各按自己的设计写一处（§18） |
| 草稿区的位置与清单 | `SCRATCH_DIR`、`scratchLeftovers`（`src/guard/scratch.ts`） | M4。M7 汇合门禁在第 4 步之后加一步「草稿区为空」，不为空时拒绝 `scratch_left`（列文件，正路「删除或转正：移进 `scripts/`、挂节点、写明用途」）；M7 §11 的「等 M4 定草稿区」由此解除 |
| 汇合门禁跑的命令 | 规范节点 `norm-merge-gate` 的验收条件 | M7 |
| 每次改完跑的检查 | 两种（§6.1）。M4 自带的检查器：环境工具节点上人批准的检查行，env 行在改了文件的那个 agent 的下一步之前执行，在循环板上是 env 行交来的一项 `self`。人加的检查：循环板上人的普通条目，动作 `check`，命令原文取自同一个工具节点的检查行，由循环板的执行器跑 | 条目的形状、事件表与筛选、存放（仓库）、提议与同意的路径（同意时给人看命令原文）、页面、执行器（`runScript`、`runCommand`）归循环板（`design-context.md` 的接缝裁定与「Check entries seam」；循环板 0.6 §2.3、§5.3、§6.6、§7.1）。归 M4 的：环境工具节点与检查行的格式、事件 `env.files-edited` 的声明与载荷、自带检查器的运行与结果怎样交给 agent、命令的读法与两个纯函数 |
| 条目的形状、事件表、脚本执行器；哪些事件拦路、脚本结果怎样进 `checkCall` | 循环板（`Trigger`、事件表、筛选、执行器，一个共用模块）；规则板（拦路的含义） | 循环板与规则板。M4 的检查不拦任何调用，不是拦路的事件，所以只用循环板那一半；M4 的四条代码规则不是板上的条目；M4 导入循环板的 `matchesFilter`（筛选的比法）与 `runCommand`（自带检查器的进程，`queue: 'direct'`） |
| harness 写给人的方案文字的四行（题目，背景、推荐、疑问、不做） | `src/graph/proposal.ts`（M3 附录 0.5 §3.3） | M3。M4 的申报文字用它的 `PROPOSAL_LABELS` 与 `proposalLineRefusal`，`src/graph/plan-text.ts` 只加可带路径的题目、「附」与问话三样（N27）；第三次修复是一张提议式待决，由 M3 的 `propose_to_human` 渲染给人看（§4.6）。格式再改只改 `proposal.ts` 一处 |
| 原样再给人看一张已有的提议式待决（不写图，记进这一条回复的件数） | `propose_to_human {kind: 'question', question}`，不带题目与四行 | M3（附录 0.5 §3.4 已有这一种，含对 `loops:`、`rules:` 提议再问一次 `attachable`）。第三次修复要它；循环板「有事等你太久时再说一次」也要它。今天的引擎对什么都没改的 `edit` 返回 `invalid`（`set changes nothing`，`src/graph/engine.ts`:613〔实读〕），所以不能用 `edit` 凑 |
| 卡片、卡片回答的解析、以人的身份写图 | 不用 | M4 0.2 用 M3 的这几个函数出申报卡；`d-chat-not-cards` 之后申报在对话里问，人的回话由 harness 直接读，图不参与授权，所以 M4 不再导入 M3 的 `src/design/cards.ts`、`human-writes.ts`，也不再要求把它们移到 `src/graph/human-card.ts`（§18 第 5 条撤回给 `m3` 的那条批注） |
| 派发链的根 `dispatchRoot`；图行服务的 `focusOf` | `src/guard/main-agent.ts`；`src/graph/service.ts` | M3。申报用 `dispatchRoot`；`focusOf` 只用来在申报文字的背景一行写出焦点节点的标题，读不到时省去这半句 |
| 主 Agent 不写文件、设计期只读 | `main-agent-no-write`、`design-before-release` | M3 |
| 会丢工作的 git 命令先存快照（`d-main-agent-shell` 定稿） | `src/guard/git-snapshot.ts`（M3 附录 0.5 §2.5，M3 第 4 步） | M3（主 Agent 自己的 shell 调用）；子 agent 的 git 归 M7 的派发。M4 的规则不判 git：file-tools-only 今天就放行 git 命令（§5.2 的例外文案照旧写明），G3 的三条规则只看文件工具的写入。M4 要求快照门与别的门共用跟进：监听器第一件事调 `observe`，存不了快照而拒绝时调 `noteDenial`（规则 id `git-snapshot`）；M3 附录 0.5 没有加这两行，留给 M3 的对齐（`m3` 节点 2026-10-30T11:30Z 的批注），加之前快照门拒绝之后的跟进量不到；它的拒绝记录不带 `mode`，`classifyRecord` 算拒绝；快照记录在项目的 `.llm/snapshots.jsonl`，不进违规流水（§3.3、§18 第 5 条） |
| 必须全审的改动 | `norm-review-floor`（harness 按改动的文件与命令判断） | M7 执行。M4 的 G1–G4、C1，以及之后每一次改规则、改可申报名单、改同意词表、改撤下的写入口，都落在清单上（§13） |
| 设计放行之后谁推进、子 agent 用什么模型 | 主 Agent（`d-auto-drive`、`d-main-agent-models`） | M7。M4 只写哪几处必须停下问人（§13） |
| 子 agent 只写写入范围 | `worker-scope` 等 | M7。worker 写出了项目时，`worker-scope` 向 guard 行的服务要编号（`outsideDenial`）、先查放行（`peekGrant`）；写项目里但出了工作树的文件由 `worker-scope` 自己纠偏（M7 0.6 §3.2.1），不要编号；核对与用掉放行仍只在 guard 行（§5.6、§5.9，F13、F19） |
| 申报开着时停下自动推进、关了恢复 | M7 的推进监听器读 `openRequests(持有者会话)` | M7（`goals.block`，原因码 `hourness-waiting-human`，M7 0.6 §3.9.5）；M4 只给读取函数（§5.9，F14） |
| 人在面板上拍板 | 不用 | `d-ui-look-not-operate`：面板只看不操作；申报不经面板 |
| 面板「需要你」里的开着的申报 | 会话日志：`request_exception` 的 `ask` 结果与 `hourness-request` 提醒的 `request` 事实字段 | 面板（plain-ui 0.7 §4.3 的 (b) 一类，现场投影 `graphLive`）；M4 只保证开与关都写在会话日志里（§5.8，F15） |
| 系统看得到的数统一记进一份事件流水（`metrics`，已批，设计进行中） | 指标设计（0.2，与本稿同批对齐） | M4 的记录照旧写违规流水，每一行经 `classifyRecord` 都能归类；指标服务在时另交事件（§3.11）。事件的字段由指标设计定 |
| guard 声明里规则板的一行 | `glm:guard` 节 | 规则板 §6.4；M4 让被撤下的规则不进声明 |

### 2.4 存放：属于项目的进项目（`d-rules-in-repo`）

人定：规则、开关、人加的循环板条目与它们的脚本进仓库；在等的工作、计数、心跳、变更记录、违规流水、指标流水这类运行时的东西进项目自己的 `.llm/`，不进 git；全局只留 GLM 登录凭证、ZCode 设备号、人设、整个账号的额度与用量、DSH profile 里的插件配置（`design-context.md`「Both boards are hook-style; storage scope」）。M4 的每样东西：

| 东西 | 在哪 | 进 git 吗 |
| --- | --- | --- |
| 人加的检查条目（与改完文件就跑的脚本条目） | 循环板的仓库文件 `docs/loops/`（循环板 0.6 §9，只由循环板写；M4 不读也不写） | 进 |
| 环境分支与工具节点（用途、用法、选择理由、安装位置、`config` 行、`check` 检查行） | 项目图 `docs/graph/`（或项目自己的图目录） | 进 |
| 代码规则、规则目录 | 代码（`src/guard/catalog.ts`） | 进（本插件的仓库） |
| 人撤下代码规则的记录 | 项目根（主检出）的 `docs/guard/lifts.jsonl`（只由 `guard_lift` 与服务 `glmHournessLifts` 追加，`lift-files-only` 护住，§3.5） | 进（人的决定随仓库走） |
| 违规流水 | 项目的 `.llm/audit/violations.jsonl` | 不进 |
| 放行之前的备份、过长的参数 | 项目的 `.llm/requests/<编号>.before`、`<编号>.call.json` | 不进 |
| 检查日志与超时记录 | 项目的 `.llm/env-checks/<会话 id 前 8 位>/`（日志）、`.llm/env-checks/timing.jsonl`（估计、超时值与超时的记录，§6.3.1）、`.llm/env-checks/limits.jsonl`（主 Agent 调高某项检查上限的设置与理由，§6.3.1；只在本机，因为它取决于这台机器跑得多快） | 不进 |
| 压制注释计数 | 项目的 `.llm/audit/suppressions.jsonl` | 不进 |
| 草稿区 | 工作区（或 worker 工作树）的 `.llm/scratch/` | 不进 |
| 申报、放行、跟进的待判、检查结果的后台缓存 | 只在内存 | — |
| 用户级（全局） | M4 什么都不存，也不读别人的全局数据 | — |

「项目的 `.llm/`」怎样定：`projectHomeFor(ctx, configHome, cwd)`（`src/shared/data-home.ts`，G1）依次取行配置的 `home`（探针、测试与人显式指定时）；会话工作目录所在项目根下的 `.llm`，项目根由 `src/data/project-root.ts` 的 `projectOf(cwd)` 算（从 `cwd` 往上找 `.git`，M7 的工作树归到它的主检出，同规则板 §7.3、循环板 §2.1；这个模块已在 main，仓库里只有这一份）；会话没有工作目录或不在 git 仓库里时取数据行的 `projectHome`；都没有就不落盘，行健康照今天写「无项目目录，违规不落盘」；这时拦下照常生效，只是没有记录，所以「每条拦下都有一条记录」（§1.2 `m4-gate` 第 1 条）只在能定出项目目录的会话里成立。写入出错时（权限、磁盘）`projectJournal` 的 `violation` 在每个项目第一次失败时报一次控制台，之后丢掉的记录不再出声；它同时把结果返回给调用方（`'failed'`；今天的 `rowJournal` 把失败吞掉、照样正常返回，调用方看不到，§3.2）。丢掉的数留在两个地方（F13）：`installRuleGate` 收到 `'failed'` 就在内存里按会话累加，用 `RowHealth.note` 把「N 条违规没有落盘」附在这个会话的行健康上（§3.1 第 7 步），这是活着的进程里的信号；`rowJournal` 同时记下待写的缺口，流水下一次写成功时在丢记录的地方多写一行缺口记录（§3.2），这一行在项目的 `.llm/audit/violations.jsonl` 里，进程重启之后还在，晨报与规则页本来就读这份流水。写入一直不恢复时（权限被收走、目录没了），缺口写不出去，信号只剩行健康与控制台，这是用同一个落点记录「这个落点写不进」的固有限制，不再另找落点（§15）。会话没有项目目录时返回 `'no-home'`，不计入这个数，行健康照写「无项目目录，违规不落盘」。命令行（`npm run -s guard`）按 `--home`，否则按当前目录算同一个项目根。下文的「项目目录」（`<项目目录>/…`）都指这样定出的项目的 `.llm/`。

为什么改：0.3 与今天的代码把流水写进数据行配置的一个固定目录（`src/memory/audit.ts`:44–47 的 `projectHome`），一台机器上所有项目的拦截都进同一个文件，晨报与统计把别的项目的数也算进来；按会话找项目之后，每个项目的晨报只数自己的，换电脑或换人时项目的定义随仓库走，运行时的记录留在本机的项目目录里。

写进一个项目的 `.llm/` 之前，guard 行与 env 行先调 `ensureLlmIgnored(项目根)`（`src/shared/llm-ignore.ts`，它用 `src/data/project-root.ts` 的 `ensureIgnored` 追加并自己复核，§7.3），每个进程每个仓库一次：项目已经忽略 `.llm/`（接管项目时已加，本仓库 `.gitignore:3`）时什么都不做；没有时在 `.git/info/exclude` 末尾追加一行 `.llm/`，随后用 `git check-ignore -q` 复核。它写不进（抛错）或复核仍未忽略时照常写记录（记录不能丢），行健康降级并写明「项目的 .llm/ 没有被 git 忽略：<原因>」。

关于人本人的记忆留在用户级，项目经验（含通用的踩坑经验）都在项目里，新项目重新学（`d-memory-scope`，人「全都没问题」）。M4 不存经验与记忆，这一条不改 M4（评审第 4 轮 N36）。

### 2.5 高峰（`d-main-agent-peak-exempt`）

人定：主 Agent 不受高峰模式影响，任何一档都随时回话；高峰模式只管子 agent（少做的并发上限、不做的排队）与重活（练习题、消融、大的审查）。M4 对照：

- M4 不加任何高峰判断，不读档位，不让任何东西等高峰：申报、读人的回话与放行、第三次修复的提问、拒绝与跟进的记录，任何一档都照常。
- 改完文件就跑的检查是本机进程，不发 GLM 请求，不算重活，任何一档都照跑；它们跑在改了文件的那个 agent 的下一步之前，那个 agent 若是被规则板排队的 GLM 子 agent，它本来就不走步，检查也不会跑。人加的检查由循环板的执行器跑，同样不花 GLM，要不要挪开归循环板与规则板（循环板 0.6 §6.9），M4 不管。
- `npm run -s guard -- records`、`stats` 只读本机文件，不花 GLM；撤下（`guard_lift`、服务 `glmHournessLifts`）只追加一行文件，也不花 GLM。
- 练习题 K1（§13.1）是重活，按规则板的自报重活挪到高峰之后（规则板 0.10 §3.6），M4 不另写。
- 申报开着时 M7 停下自动推进（§5.9），原因码是 `hourness-waiting-human`，与高峰等待的 `hourness-peak-wait` 分开：高峰结束时循环板的「高峰结束」一项只恢复后一种，等人的那一种在申报关闭时由 M7 恢复。

## 3. 拦截机制与撤下（`m4-gate`）

0.5 叫「影子模式机制」（`m4-shadow`）。`d-code-rules-enforce` 之后这一节没有影子：规则一启用就拦，人不用等样本，也不用标注；它要回答的是三个问题：判定与记录只在哪一处做（§3.1、§3.2）、拦下之后怎样知道模型学没学会（§3.3、§3.6）、拦错了或不要了怎样止住（§3.5）。只能事后发现的规则拦不住，也在这一节说清楚它变成什么（§3.4）。

### 3.1 规则一律生效

`src/guard/rules.ts`：

```ts
export interface GuardRule {
  readonly id: string
  readonly declare: string | ((face: ToolFace) => string)
  detect(call: ToolCall, face: ToolFace): RuleVerdict
  /** Whether `next` took this rule's right path after `denied` was denied (§3.3); absent: never counted as right. */
  rightPath?(next: ToolCall, denied: ToolCall): boolean
}
```

没有模式字段（`d-code-rules-enforce`）。0.5 的规则有 `enforce` 与 `shadow` 两种模式：影子规则只记录、不拦截，攒够带标注的样本和天数后由人拍板转生效。人 2026-10-31 定：写在代码里的规则从它所在的插件行启用那天起就拦，不设试运行期，误拦靠看得见来发现。所以 `RuleMode`、`GuardRule.mode`、`Judgement.shadows` 和一切只为转正而存在的东西都删掉。新插件行默认禁用、验证过才启用不变（`AGENTS.md`）：那一道管的是行，规则在行启用之前根本没有装上。判定器抛错照旧放行（fail-open，§11）；拦错了怎么办，靠三样：记录让人看见（§3.6），撤下让人一句话止住（§3.5），拦截的纠偏写明正路、可申报的规则另有申报这条出路（§5.3），agent 当场不会卡死。

`judge(rules, call, face): Judgement`：

```ts
/** `ref`: the request ref this denial carries (§5.2; M7's worker-scope through outsideDenial, §5.6); written into the ViolationRecord. */
export interface RuleDeny { readonly rule: string, readonly correction: Correction, readonly ref?: string }

export interface Judgement {
  /** Every rule that denies, in rule order; the model reads the first one left after grants (§5.6). */
  readonly denies: readonly RuleDeny[]
  /** Rules whose detector threw (fail-open: they do not deny). */
  readonly errors: readonly string[]
}
```

每条规则都判一次；拒绝全部列出（一个放行只去掉它自己那条规则的拒绝，§5.6）；抛错的规则放行并记下 id。

`evaluate` 删除。它只返回第一个拒绝，别的行用它装监听器时，后面的拒绝悄无声息地丢掉，跟进和撤下也要各行自己写一份。取而代之的是唯一的安装函数（`src/guard/gate.ts`）：

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
  /**
   * Writes one ViolationRecord (§3.2). The payload tells the row which session, hence which project (§2.4). A journal that returns
   * a promise reports 'failed' writes to the gate, which counts them per session (step 7); one that returns nothing is not counted.
   */
  readonly journal: (record: GuardRecord, payload: ToolExecutionPayload) => Promise<JournalOutcome> | void
  /** Guard row only (§5.6): may lift an enforced deny of a requestable rule for this one call. */
  readonly grants?: GrantBook
  /** After the inner listeners allowed the call (the guard row feeds its workspace-change fallback). */
  allowed?(payload: ToolExecutionPayload, origin: GateRules['origin']): void
  /**
   * The row's health (src/shared/health.ts). The gate attaches its two lasting problems with `note`, because a plain `report`
   * is stored once per session and replaced by the row's next report (the guard row reports its status on every call):
   * key 'violations-lost' ("N 条违规没有落盘") and key 'rule-errors' ("规则 a、b 判定出错"). The session id is `sessionIdOf(payload.agent)`,
   * the key row health uses.
   */
  readonly health?: Pick<RowHealth, 'note'>
  /** Writes the journal's pending gap record on its own (§3.2). The gate calls it on `session/disposed`; absent: nothing is flushed. */
  readonly flush?: () => Promise<void>
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
5. 从 `rules` 里去掉被人撤下的规则（`liftedRules(项目根)`，读 `docs/guard/lifts.jsonl`，§3.5；每行都经这一处，所以图行、循环板、指标流水的规则同样能撤下），再 `judge`；`errors` 用 `health.note(会话, 'rule-errors', …)` 附在行健康上（最多点名 3 条规则，其余写「等」），控制台每条规则每个会话告警一次。
6. `grants`（只有 guard 行有）对 `denies` 里可申报的规则查放行（§5.6），匹配的那一条拒绝去掉；去掉之前做 §5.6 的使用时核对与备份，其中任何一步要求拒绝时，这条拒绝换成 §5.6 写的那条理由，不去掉。
7. `denies` 仍非空：每条拒绝写一条 `ViolationRecord`（一次调用被两条规则拒绝就是两条，各算各的规则；`RuleDeny.ref` 有值时写进记录的 `ref`）；`noteDenial` 记下模型读到的那一条（第一条）供跟进；返回 `deny`，理由是第一条的纠偏。写记录不等结果，拒绝立即返回；`journal(record, payload)` 返回的承诺落定之后，结果是 `'failed'` 的，`installRuleGate` 把这个会话丢掉的条数加 1，并调 `health.note(sessionIdOf(payload.agent), 'violations-lost', 'N 条违规没有落盘')`（N 是这个会话到现在丢的总数）。这一调用发生在承诺落定的时刻，不靠下一次调用顺带带上，所以写失败之后会话不再有调用时行健康里也已经有它（F13）。丢掉的记录补不回来，所以写入恢复之后这个数不清零，行健康一直留着它（`note` 不会被这一行之后的 `report` 冲掉，见下）；`'no-home'` 与返回空的行不计；承诺被拒绝（`projectJournal` 不抛，不应出现）按 `'failed'` 计。同一批丢掉的记录，流水一侧由 `rowJournal` 在下一次写成功时补一行缺口记录（§3.2），这是进程重启之后还在的那一份。拦下本身不受影响：不论记录写没写进去，调用都被拒。
8. `decision = await next()`。`decision.kind === 'allow'` 时：消耗第 6 步的放行（§5.6），调 `allowed`。内层不放行（别的监听器拒绝、`ask`、`cancel`）时不消耗放行：调用本来就没执行。

行健康的持久说明（评审第 3 轮 F13）。`provideRowHealth(...).report(sessionId, state, reason)` 每个会话只存一条，同状态同原因才跳过，否则整条替换（`src/shared/health.ts`）；guard 行在每一次调用里重算状态并报一次（`src/guard/index.ts` 第 189 行），所以只调一次 `report` 的说明，下一次调用就被冲掉，丢失数也不例外。每一行都有自己的 `provideRowHealth`（图行、循环板、指标流水、接管行同样走 `installRuleGate`），让各行在每次 `report` 前记得把网关的问题并进自己的原因（评审给的另一条路：`installRuleGate` 导出 `gateProblems(sessionId)`），要写很多份，漏一行就复发。所以在 `provideRowHealth` 里做一次，`report` 的调用方不用改：

```ts
export interface RowHealth {
  report(sessionId: string | undefined, state: HealthState, reason: string): void
  /**
   * Attach a lasting problem to one session's report. The stored report is always the latest `report` call (the row's activation
   * status if there has been none) with every note of the session appended to its reason, joined by '；', and its state raised
   * to at least 'degraded' ('inactive' stays). A later `report` keeps the notes. `text` undefined withdraws the note. Like
   * `report`, a call without a session id is dropped. At most 4 notes per session (a fifth key is dropped), each cut to 80
   * code points. Notes leave with the session's report when the 64-session limit evicts it.
   */
  note(sessionId: string | undefined, key: string, text: string | undefined): void
  reactivate(state: HealthState, reason: string): void
  dispose(): void
}
```

实现：`report` 把最近一次的原始 `{state, reason}` 存成底，`note` 把说明存进按会话的表，给 `view.session()` 读的是由底和说明合成的那一条；合成之后同状态同原因才跳过，所以一个会话里底不变、说明不变时不重复盖时间戳。`/hourness-status` 读的 `collectHealth` 不改。

`installRuleGate` 的 `session/disposed` 订阅除了交给记录器，另调 `options.flush`（§3.2），在会话结束时把待写的缺口记录写出来。

`installGraphFileGuard` 在 G1 改为调用 `installRuleGate({row: 'graph', prepend: true, rules: …})`，纠偏、记录与先后不变。循环板的 `loops:schedule-tools` 与 `loops:files-only`（循环板 0.6 §2.4 第 16、16a 行；它们的写法仍是 `GuardRule`、`evaluate`、`renderCorrection`，G1 删掉 `evaluate` 之后要改经 `installRuleGate`，N32）和指标流水的 `metrics-files-only` 同样经它安装（谁后合入谁改）。接管行的 `bootstrap-read-no-shell`（接管设计 0.6 §8.2，`src/guard/bootstrap-read.ts`，接管读项目期间拦主 Agent 的命令行与网页抓取）也经它安装并登记在 `GUARD_RULES`，行值 `bootstrap`：接管设计 0.6 已向人承诺这一条能用 `guard_lift` 或 `/rules lift bootstrap:bootstrap-read-no-shell` 撤下，目录里没有它就兑现不了，违规流水里它的拒绝记录也会让 §3.8 的契约测试失败（评审 F3）。M3 的 `installMainAgentRules` 与 M7 的 `worker-scope` 等门（`prepend` 注册，今天用 `evaluate`）也要改，但 M3 附录 0.5 与 M7 0.6 都没有接这一条（`m3` 节点的批注留给 M3 的对齐轮；M7 0.6 §18.2 写明 M4 的 G1 合入时谁后合入谁改）：这两行改经 `installRuleGate` 之前，它们的拒绝照原样写进违规流水（不带 `mode`，`classifyRecord` 算拒绝），撤下与跟进只覆盖经 `installRuleGate` 的规则，`guard_lift` 对它们的 id 返回 `invalid`；它们改完之后契约测试把这两行也纳入标记核对。`tests/contracts.spec.ts` 核对：`GUARD_RULES`（§3.8）里所在行不是 `guard` 的规则，所在行的入口经 `installRuleGate` 安装（L2：在假宿主上装各行，`tools/pre-execute` 的监听器都来自 `gate.ts`，做法是 `installRuleGate` 给它装的每个监听器打一个模块私有的标记，测试按标记数）；M3、M7 两张表的规则暂时只核对 id 在各自的表里、违规流水里出现的 `rule` 都在三张表之一。

声明：`declarationSection` 列所有没被撤下的规则（`src/guard/index.ts`），图行的 `GRAPH_FILES_DECLARATION` 同样按 `graph-files-only` 有没有被撤下取舍。撤下或恢复一条规则会让所有路由上的系统提示词少一行或多一行，这个会话的提示词缓存因此失效一次；`guard_lift` 的返回里写明这一点（摘要 §4 第 2 条）。

声明的头部（`# Workspace rules` 之后）给根 agent 加一句：`If the human asks you to stop enforcing one of these rules, call guard_lift with the rule id and the human's own words (the tool may be deferred: look it up first).`（评审 N7）。「对主 Agent 说」是人撤下规则的两条路之一，主 Agent 得知道人这句话该对应哪个工具；`guard_lift` 在 GLM 上延迟、不常驻，没有这一句，主 Agent 只能碰运气。子 agent 的声明不加这一句（它们调不了，§3.5 第 1 步）；判法与第 1 步相同，会话头不带 `origin: 'subagent'` 才加。L3 `guard-lift` 场景在没有这一句时必败（§14.1）。

### 3.2 判定与记录

guard 行（`src/guard/index.ts`）改为调用 `installRuleGate({row: 'guard', prepend: false, rules, journal, grants, allowed, health, flush})`（普通注册，位置同今天）：

- `rules(payload, call)`：取路由与 `face`、取圈禁根（不变）；准备判定上下文（§4.1，只有涉及文件或 shell 的调用才读文件系统）；返回 `activeRules(...)`；同时按今天的 `guardHealth` 报行健康。
- `grants`：申报通道的放行簿（§5.6，G4 起）。申报规则（§5.3）拒绝时，`ViolationRecord` 带这次的 `ref`（G4 起）。
- `allowed`：交给工作区变更兜底（§3.4，不变）。
- `journal(record, payload)`：`projectJournal('guard', …)` 按 `payload` 里这次调用所在会话的工作目录找项目（§2.4），写那个项目的流水，返回 `JournalOutcome`；图行与经 `installRuleGate` 的其他行同样按会话找项目。规则板写它的记录也经 `projectJournal`，返回值它可以不看。
- `health`：这一行自己的 `RowHealth`（`provideRowHealth` 的返回值），网关只用它的 `note`（§3.1）；`rules()` 里每次调用报的 `report(sessionIdOf(payload.agent), …guardHealth(…))` 照旧，`note` 附上的说明不会被它冲掉。图行与经 `installRuleGate` 的其他行各传自己的 `RowHealth`。
- `flush`：`projectJournal` 的 `flush()`，对这一行缓存的每个项目根的 `rowJournal` 实例各调一次（§3.2 下面的缺口）。

写入结果（`src/memory/audit.ts`）：

```ts
/**
 * What one violation write came to. rowJournal catches a failed append and resolves normally, so today a caller cannot tell a
 * lost record from a written one. 'no-home': no project directory could be resolved, nothing was attempted (row health says so).
 */
export type JournalOutcome = 'written' | 'failed' | 'no-home'
```

`rowJournal(...).violation(record)` 返回 `Promise<JournalOutcome>`：`auditPaths(homes()).violations` 为空（目录算不出）返回 `'no-home'`，追加成功返回 `'written'`，追加抛错时先照旧 `report('violations')`（这个实例第一次失败报一次控制台）再返回 `'failed'`。控制台告警不变，只多了返回值。`AuditJournal`（`auditJournal` 的原始写入口，失败时拒绝）、`usage`、`decision` 不改；今天的调用方都是 `void journal.violation(...)`，返回类型变宽不影响它们。`projectJournal` 为每个项目根建一个 `rowJournal` 实例并缓存，告警的去重键是实例里的写入类别，所以每个项目每个类别报一次。评审第 2 轮 F11 建议返回 `boolean`；这里多一个 `'no-home'`，因为验收第 1 条要把没有项目目录的会话排在计数之外，三个值省得网关再算一遍项目目录；计数按会话而不是按项目，因为行健康本来就按会话报，而一个会话只属于一个项目，两者不会混。

丢掉的记录要留在流水里（评审第 3 轮 F13）。行健康只活在这个进程里（§3.1 的 `note` 解决的是它被覆盖），晨报与规则页读的是流水，进程重启之后行健康也没了。所以丢失数同时写进流水，放在丢记录的地方，这样三处都读得到：这个会话活着时的行健康、之后每一天的晨报、规则页。落点选流水自己，而不是另开一个文件或放进用户级目录：晨报与规则页已经读它，经 `classifyRecord` 就分得出，不多一条读路径；记录写不进的原因多半是这个项目的 `.llm/` 暂时写不了（磁盘满、杀毒软件占着文件），恢复之后同一个文件就能写；另开的落点在同一个目录里，同样写不进（§15）。

`rowJournal` 的每个实例（`projectJournal` 里每个项目根一个）在内存里留一份待写的缺口。`violation` 追加失败时，把这条记录并进去：条数、按 `classifyRecord` 分的各类条数、第一条与最后一条的 `at`、最后一次失败的错误码。下一次追加之前，先取走并清空待写的缺口（取走与清空发生在 `await` 之前，同一个 tick 里，所以并发的两次写不会各写一行缺口），再把一行 `GapRecord` 与这次要写的记录用换行连起来，合成一次 `appendFile`：缺口在前，两行同时落盘或同时不落盘，所以缺口恰好站在丢记录的地方。合并追加成功返回 `'written'`；失败就把取走的缺口和这条新记录并回去，返回 `'failed'`。`flush()` 是没有新记录可带时的出口：有待写的缺口就单独追加那一行，失败并回、不抛错。`installRuleGate` 在 `session/disposed` 时调 `options.flush`，所以最后一次失败之后会话就结束的情形，缺口在这时补写。写入一直不恢复时缺口写不出去；进程在恢复之前退出时待写的缺口随进程丢失。这两种情形的信号只剩行健康（`note`）与控制台告警，是这个设计留下的残余，写在 §11 与 §15。`keyOf(record)` 只取被写的那条记录的文本，不含缺口行，所以记录的键不受影响。

记录（`src/guard/records.ts`）：

```ts
/** What one call touched, as the journal keeps it: shell text up to 8 KiB, or the resolved target. */
export interface CallSubject {
  readonly tool: string            // DSH native
  readonly command?: string
  readonly target?: string
}
```

`ViolationRecord` 加可选的 `call?: CallSubject` 与 `ref?: string`，旧记录没有这两个字段。`GuardRecord` 联合类型移到 `records.ts`（加上下面几种新记录），`src/guard/index.ts` 再导出，`src/workflow/morning-report.ts` 与 `src/memory/audit.ts` 的导入不变。

工作区变更兜底原来的 `ShadowRecord`（`mode: 'shadow'`，有 `paths`）改为晚到的拦下（§3.4），字段不变，`mode` 换成 `'late'`、多一个 `via`：

```ts
/** §3.4: after a turn, file-tools-only found files that a shell call changed and no file tool targeted. Nothing was blocked: the call had run. */
export interface LateRecord {
  readonly at: string
  readonly rule: 'file-tools-only'
  readonly mode: 'late'
  readonly via: 'turn-end'
  readonly sessionId: string
  readonly agentId?: string | undefined
  readonly scope?: RouteScope | undefined
  readonly route?: Route | undefined
  readonly turn: number
  readonly paths: readonly string[]
  readonly unlisted?: number | undefined
  readonly calls: ReadonlyArray<{ readonly tool: string, readonly command: string }>
}
```

新记录都带 `kind`，字段全部写在这里（评审第 2 轮 N14），G1 一次建好类型，G2、G3、G4 只往流水里写：

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

/**
 * F13: records the harness could not write. Written by the first append that succeeds afterwards, directly before the record
 * that append carries, or alone by flush() when the session ends. It is not a violation and not a denial.
 */
export interface GapRecord {
  readonly kind: 'gap'
  /** When this line was written. */
  readonly at: string
  /** The row whose journal lost the records: 'guard', 'graph', ... */
  readonly row: string
  /** Records lost since this journal instance's previous gap line, or since it started. */
  readonly lost: number
  /** Lost records per class (classifyRecord), e.g. { denial: 2, followup: 1 }. */
  readonly classes: Readonly<Record<string, number>>
  /** The `at` of the first and of the last lost record. */
  readonly since: string
  readonly until: string
  /** The error code of the last failed append (EACCES, ENOSPC, ...), at most 40 characters; absent when the error had none. */
  readonly code?: string
}

/** §3.5: the human lifted or restored a code rule. */
export interface LiftRecord {
  readonly kind: 'lift'
  readonly at: string
  readonly rule: string
  readonly action: 'lift' | 'restore'
  /** chat: the main agent called guard_lift with the human's words; board: the rules board handed over /rules lift or /rules restore through glmHournessLifts. */
  readonly via: 'chat' | 'board'
  readonly sessionId?: string | undefined
  /** chat: the human's words as the tool received them; board: the command text the board passed. At most 500 characters. */
  readonly words: string
}
```

分类。今天的晨报把没有 `mode` 的记录算拒绝、`mode === 'shadow'` 的算影子（`src/workflow/morning-report.ts`:38–39）；新记录没有 `mode`、其中几种带 `rule`，照今天的过滤会被算成违规，规则板 `mode: 'enforce'` 的拒绝又两边都不收。所以读流水的代码一律经同一个函数分类：

```ts
export type RecordClass = 'denial' | 'late-denial' | 'deferral' | 'rule-record' | 'followup' | 'request' | 'grant' | 'grant-void' | 'lift' | 'gap' | 'unknown'

/**
 * One journal line's class. `kind` present: that kind ('followup', 'request', 'grant', 'grant-void', 'lift', 'gap'; any other kind is 'unknown').
 * No kind, `mode: 'late'`: 'late-denial' (a violation the harness saw after the call ran) when the rule is `file-tools-only`
 * (the workspace-change fallback, §3.4) or starts with `rules:` (only the rules board writes those: a block that came after
 * the script's timeout). `mode: 'shadow'` with `paths` is a record the fallback wrote before 0.6: also 'late-denial', the same
 * facts under the old name; `mode: 'shadow'` otherwise is 'unknown'. With a `rule` that starts with `rules:`: `mode: 'record'`
 * is a record-only action the human chose ('rule-record': not a violation, counted on its own), `mode: 'enforce'` with
 * `effect: 'queue'` is a deferral (the rules board queued the call, e.g. peak hours under 不做). Otherwise no `mode` or
 * `mode: 'enforce'` is a denial. `record` and `late` on any other rule, and anything else, are 'unknown': counted and
 * reported as an unreadable line, never as a denial.
 */
export function classifyRecord(line: Readonly<Record<string, unknown>>): RecordClass
```

晨报的过滤、`ruleStats`、命令行的 `records` 都用它；规则板的规则页读流水时同样用它（§2.3）。`late-denial` 同 `denial` 进「违规」，晨报另列一行，`ruleStats` 当拒绝统计；`rule-record` 不进「违规」，晨报单列「只记录 n 条」；规则板在 M4 的 `classifyRecord` 合入之前自己数这两种，合入之后可以改用它，数字不会分叉（规则板 0.10 §10.7 M4 一节第 2 条）。`deferral` 不进「违规」、不进 M4 的统计，由规则板的晨报一节（规则板 R7）去数（评审第 3 轮 N31：规则板 0.10 §10.5 的记录带 `effect`，高峰不做档下 GLM 会话的调用记为 `mode: 'enforce'`、`effect: 'queue'`，0.3 的分类会把它写成「违规」）。`lift` 不进「违规」，晨报「撤下的规则」一行读它。`gap` 不进「违规」，也不算读不懂：晨报「流水的缺口」一行与 `ruleStats` 的 `unrecorded` 读它（§3.6、§3.10）。G1 改晨报的过滤并加 L2：一条 `FollowupRecord` 与一条 `GrantRecord` 不增加「违规」计数；一条 `mode: 'enforce'`、`effect: 'block'` 的规则板记录算拒绝；一条 `mode: 'enforce'`、`effect: 'queue'` 的算排队、不算拒绝；一条 `rule: 'rules:p-1'`、`mode: 'record'` 的算只记录、不算违规；一条 `rules:` 开头、`mode: 'late'` 的算晚到的拦下、算违规；一条 `rule: 'file-tools-only'`、`mode: 'late'` 的同样算晚到的拦下；一条带 `paths` 的 `mode: 'shadow'`（0.5 以前写下的）也算晚到的拦下；一条 `rule: 'x'`、`mode: 'late'` 的算读不懂；一行 `{"kind": "x"}` 算读不懂、不算拒绝；一条 `kind: 'lift'` 的算撤下、不算违规；一条 `kind: 'gap'` 的算缺口，不算违规、不算读不懂。

记录的键：`recordKey(line)` 是这一行 JSON 文本（不含换行）的 SHA-256 前 12 位十六进制。流水只追加不改写，所以键稳定；旧记录也有键，不需要改格式。

规则板的记录（规则板 0.10 §10.5、§10.7：`rule: 'rules:<id>'`、`mode: 'enforce' | 'record' | 'late'`，0.9 的 `shadow` 已改名 `record`，`effect: 'block' | 'queue'`）在同一份流水里，同样有键、进统计。规则板写这些记录经 M4 的 `projectJournal`（跟着搬到项目的 `.llm/`，§2.4），键用 `keyOf(record)`（§2.2），`noteDenial` 的 `key` 就是这一个。

### 3.3 拦截之后的下一步

`docs/ORCHESTRATION.md` §6.3 的度量「拦截后下一步走对的比例」量的是门禁有没有教会模型。0.5 里它和影子样本一起，是转正前的证据之一；`d-code-rules-enforce` 之后它不再为转正服务，但仍然留着，理由写在 §3.6。`src/guard/followup.ts` 导出一个模块级的记录器：

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

1. `observe` 先拆包。原生名是 `DeferredToolCall`、参数恰为 `{name: 非空字符串, input: 对象}`（ZCode 3.17.1 的 schema 同形，见文件头的依据）时，用 `{name: toNativeTool(dialect, input.name), arguments: input.input}` 结算，并把 `<callId>` 与 `<callId>:deferred` 一起记为已结算；形状不对时按包装原样结算。拆包的纯函数 `unwrapDeferredCall(name, args): {name, arguments} | undefined` 在 `src/shared/deferred-call.ts`，改动文件（§6.2）也用它。
2. `noteDenial` 记下的是被拒的那次执行，也就是内层调用（`<callId>:deferred`），参数摘要按拆开之后的参数算。下一次包装调用拆开之后才比得上，所以原样重试记 `repeat`。
3. 内层调用随后进 `observe` 时，它的 `<callId>:deferred` 已经被包装结算过，什么也不做。

同一步的调用（评审第 2 轮 N16）。模型一步发出几个调用时，第一个被拒之后，同一步的其余调用是在模型读到拒绝之前就发出的。结算前比较两次调用的 `{turn, step}`：与被拒的调用相同就跳过、不结算。所以量的是「拦截之后模型下一步里的第一次调用」，与 `docs/ORCHESTRATION.md` §6.3 的说法一致。

跨行（评审第 1 轮 F5）。每个经 `installRuleGate` 装的监听器对根调用第一件事就调 `observe`；waterfall 从外往里走，最外层的监听器先看到这次调用并结算，之后的监听器对同一个 `callId` 什么也不做（记录器记着最近 512 个已结算的 `callId`）。下一次调用被外层的 `graph-files-only`、M3 的规则拒绝，guard 行看不见它，跟进照样由外层结算。不用 guard 框架的两个监听器也接同一个记录器：第一件事调 `observe`，拒绝时调 `noteDenial`。一是规则板的工具调用门：`observe(agent, call, callId)`，拦下与开单拒绝时 `noteDenial(agent, callId, {rule: 'rules:<id>', call, key, origin})`，没有 `rightPath`，`key` 是它写下的那条拒绝记录的 `keyOf`（§2.2）；晚到的拦下（`mode: 'late'`）不调，那次调用早已放行执行（兜底的晚到拦下同理，§3.4）。规则板 0.10 §10.7 M4 一节第 3 条采纳了这两项（只这两项），M4 的 `gate.ts` 不在时它不调。二是 M3 的 git 快照门（规则 id `git-snapshot`，只在存不了快照时拒绝，`rightPath` 为同一条 git 命令，M3 附录 0.5 §2.5）：M3 附录 0.5 没有加这两行，留给 M3 的对齐轮，§18 第 5 条请它加。没加之前，§1.2 的验收只覆盖经 `installRuleGate` 的拦截与规则板的门（评审第 2 轮 N26）。

模块级的状态在各行之间共用：编排层包由 `tsc` 逐文件输出（`packages/hourness/tsconfig.json`，不打包），guard、图、设计各行导入的是同一个 `dist/guard/followup.js`，Node 对同一个文件 URL 只有一个模块实例〔推断：DSH 加载行时不给模块地址加查询串；L3 场景 `guard-followup` 核对图行拒绝之后的跟进记录，若各行拿到的是不同实例，这条记录不会出现〕。

结算时 `followupOf(denied, next, rule)` 给出：

| 结果 | 条件 |
| --- | --- |
| `repeat` | 同一原生工具、参数摘要相同（两边都按拆开之后的比） |
| `right-path` | 规则的 `rightPath(next, denied)` 为真 |
| `other` | 其余 |
| `none` | 拦截之后，这个 agent 的回合结束（会话事件 `turn/end`，agent-loop:1029〔实读〕）或会话卸载（`session/disposed`，session:1929–1933〔实读〕）时，还没有下一步的调用（评审第 2 轮 N15）。子 agent 交回结果、人不再说话，都在这里结算 |

各规则的 `rightPath`：file-tools-only 是下一次调用为文件工具的写入（`write`、`edit`、`str_replace_editor` 除 `view` 外）；圈禁是 `request_exception` 带这次的编号（GLM 上经包装，拆开之后判），或目标在工作区内的文件工具写入；`checker-config` 与 `scratch-only` 是 `request_exception` 带这次的编号，`suppression-reason` 是同一目标的文件工具写入且新增的压制带理由与节点；`graph-files-only` 是图的写工具；M3、M7 的规则各自写自己的 `rightPath`，不写就只得到 `repeat`、`other`、`none`。拒绝方在 `installRuleGate` 第 7 步经 `noteDenial` 记下待判，所以凡经它安装的规则都自动有跟进，不需要各行另接。

有几种拒绝的正路就是停下：普通子 agent 被圈禁拒绝后把编号写进结果交回（§5.2）；file-tools-only 的例外是「在回复里说明」。这些做对了的情形结算成 `none`。M7 的 worker 被拒之后的下一次调用是 `ask_main`，不是「没有下一步」：被记下的拒绝是 `worker-scope` 的，结算用它的 `rightPath`，M7 的 `rightPath` 认带编号的 `ask_main` 时记 `right-path`，M7 加这一条之前记 `other`（评审第 4 轮 N41）。所以 `none` 不进「走对」的分母：晨报写「走对 x/y（另有 n 次停下来交给人或上级）」，`y` 是 `right-path`、`repeat`、`other` 之和，`n` 是 `none`（评审第 3 轮 N30）；`ruleStats` 的四类计数不变。

写一条 `FollowupRecord`（§3.2）。内存表按 agent 至多一条、全表至多 256 条（最早的先出）；进程重启丢失未判的那几条，记录少几条，不影响别的。

L2：

- 连续两次写图文件都被 `graph-files-only` 拒绝，留下恰好一条 `outcome: 'repeat'` 的跟进记录；guard 拦截之后下一次调用被一个外层的测试规则拒绝，同样留下一条。
- 晨报：三条 `right-path`、一条 `other`、两条 `none` 写成「走对 3/4（另有 2 次停下来交给人或上级）」。
- GLM 路由（F9）：圈禁拒绝之后，`DeferredToolCall {name: 'request_exception', input: {ref: <这次的编号>, …}}` 留下恰好一条 `right-path`，内层调用不再加记录；经包装的 `str_replace_editor` 被拒之后原样再发一次包装调用，留下 `repeat`。
- 同一步（N16）：一步里两个调用，第一个被拒，第二个不结算；下一步的第一个调用结算。
- 没有下一步（N15）：拒绝之后回合结束，留下 `none`；拒绝之后会话卸载，留下 `none`。
- 插件经 `tools.execute` 发起、没有 `tool/call` 事件的调用不结算。

### 3.4 事后才看得见的拦截：工作区变更兜底

`src/guard/shadow.ts`（0.6 改名 `fallback.ts`）是 file-tools-only 的兜底。`dsh-workspace-changes` 在每个顶层回合结束时给出这一回合改过的文件（回合开始与结束时 git 工作树的快照，加文件工具编辑前后的整文件）；兜底把它和这一回合里文件工具的目标、被放行的 shell 调用比：回合里跑过 shell 调用、又有改过的文件不是任何文件工具的目标，就说明 shell 用引号感知的读法看不见的写法写了文件（.NET 调用、`cmd /c`、解释器单行命令）。0.5 以前它写一条 `mode: 'shadow'` 的记录，量读法漏看多少。

它在回合结束之后才看得见，那时 shell 调用早已执行，拦不住（`d-code-rules-enforce`：只能事后发现的规则不能拦）。M4 定它变成两样：

1. 一条晚到的拦下（`LateRecord`，§3.2）：字段同旧记录，`mode: 'late'`、`via: 'turn-end'`。它进「违规」、晨报另列一行「其中晚到的拦下 k 条」，不进跟进（那一次调用早已放行，模型没有读到过拒绝）。
2. 一条纠正提醒，在那个 agent 的下一步之前送到。guard 行在 `agent/created` 时给每个根 agent 装第二条步 notice（来源 `hourness-guard`，第一条是 §5.5 的 `hourness-request`），每一步读内存里这个会话待送的纠正（`pendingCorrections`，按会话 id，至多 8 条，进程重启丢掉，记录已在流水里），送出就清掉。文字（工具名按 `face`，GLM 上是 `Write` 与 `Edit`）：

   ```text
   <system-reminder>
   file-tools-only: in your last turn, shell commands changed files that no file tool wrote: src/a.ts, notes/todo.md (commands: pwsh "Set-Content …"). Those writes already happened. Check that the files are what you meant. From now on write files with write or edit: a shell command that writes a file is denied when the harness can read it, and recorded when it cannot.
   </system-reminder>
   ```

   至多列 10 个文件（路径经 `displayPath`）、3 条命令（各截到 80 个字符），整条至多 600 个字符；一个回合至多一条。agent 没有下一步（会话结束、人不再说话）时只有记录。顶层会话以外没有摘要，所以提醒只送给根 agent。

没有 `workspace-changes` 服务（组合里没有）时兜底整个不工作，行健康写「事后纠正未启用（组合里没有 workspace-changes）」，同今天对影子兜底的写法。

不选的做法：把这个会话的下一次 shell 调用拦下，直到 agent 说明。判错的代价高（已经写出的文件不是下一次调用的错），而且 harness 无法判断那些文件对不对。

L2：夹具里一个回合跑了 shell 调用、摘要列出一个没有文件工具碰过的文件：留下恰好一条 `mode: 'late'` 的记录，同一 agent 的下一步有一条纠正提醒，再下一步没有；回合里的 shell 调用没有改文件、或改的文件都是文件工具的目标时什么都不留；摘要列出图目录下的文件而这一回合跑过图工具时不算（照今天的已知写入）；GLM 路由上提醒里写 `Write` 与 `Edit`。

### 3.5 撤下一条规则

为什么要有：规则一启用就拦，判错了、或这个项目不要它时，人要能一句话止住。0.5 没有这条路：「可关」只到行一级（`docs/CHARTER.md` §7.1 条款 1），关掉整行会把别的规则一起关掉；规则板的 `/rules` 只管板上人写的条目，不管代码里的规则。

人只有一条路（`d-one-lift-path`，编排方 2026-10-31 的裁定，来自用户旅程评审）：对主 Agent 说一句话，或在规则板上打 `/rules lift <规则 id>`；两样都管板上的条目和代码里的规则。落到 M4 目录（`GUARD_RULES`）里的规则上：

- 对主 Agent 说：主 Agent 调工具 `guard_lift`，带上人的原话。这个工具是主 Agent 用的，不是给人的命令；它和规则板的路写同一种撤下，记成同一笔（`LiftRecord` 加 `lifts.jsonl` 的一行，只有 `via` 不同）。
- 在规则板上打 `/rules lift <规则 id>`：规则板认出这是 M4 目录里的规则（它的目录条目 id 是 `<行>:<规则 id>`），把这一笔交给 M4 的服务 `glmHournessLifts`（下面），自己只显示结果。命令只有人在输入框里能打，身份由规则板核对（规则板 0.10 §2.5），M4 不再核对原话。规则板那一侧的接线是已放行设计的改动，写成接缝请求（§18），等 dogfood 之后；在那之前人只有对主 Agent 说这一条路。
- M4 不注册面向人的斜杠命令（本稿第一版有 `/guard lift`，按这条裁定删掉）。`npm run -s guard` 的命令行只读（`records`、`stats`），没有撤下命令：agent 能经 shell 运行它。

`guard_lift` 是新工具，在 guard 行注册，所有路由都有，GLM 上同 `request_exception` 不常驻、延迟；名字登记在 `GUARD_TOOL_NAMES`。参数：

| 字段 | 必填 | 类型与上限 | 不合法时 |
| --- | --- | --- | --- |
| `rule` | 是 | `GUARD_RULES` 里的规则 id | `invalid`，`hint` 列出可撤下的 id |
| `words` | 是 | 1–500 字符，人的原话 | `invalid` |
| `action` | 否 | `lift`（缺省）或 `restore` | `invalid` |
| 其他字段 | — | 不收 | `invalid` |

描述（给模型）：`Lift or restore one of the harness's code rules because the human asked for it in their latest message. Pass the rule id and the clause where the human asks for it, copied exactly. One human message lifts at most one rule. Do not call it on your own: a rule that blocks you is a reason to use its right path or to ask the human, not to lift it. The result says what to tell the human. Example: guard_lift {"rule": "scratch-only", "words": "新建脚本那条先别拦了"}`

示范（`d-agent-examples`）：例子的规则是 `scratch-only`，领域与练习题无关；L2 把它交给上面的参数检查和 `words` 核对（夹具里人的消息就是示范里的那句话），上限或字段一改这一例跟着失败。

检查顺序，第一条不成立就抛错（文本为 `{code, message, hint}` 的 JSON）：

1. 调用方是根 agent（会话头不带 `origin: 'subagent'`），否则 `forbidden`，`hint`「a subagent cannot lift rules: report to the main agent」。
2. 参数合法，否则 `invalid`。
3. `rule` 在 `GUARD_RULES` 里，否则 `invalid`（不在目录里，或是 M3、M7 表里的规则：它们改经 `installRuleGate` 之前撤不了；`bootstrap-read-no-shell` 在目录里，撤得下）。`liftVia` 为 `'board'` 的规则（现在只有 `lift-files-only`）对 `guard_lift` 返回 `forbidden`，`hint`「this rule protects the lift record itself, so only the human can lift it, with /rules lift lift-files-only once the rules board offers that for code rules; until then it cannot be lifted」（提示不叫人现在就去打那条命令：规则板接线之前它还管不了代码规则，评审第 2 轮 N13）。这是同一条路：人只有「对主 Agent 说」和 `/rules lift` 两种说法，护住撤下记录的这一条不能让 agent 自己经工具撤，否则 agent 一撤它就能写记录、撤任何规则；它只走规则板那一说法，由规则板核对人的身份。规则板接线在 dogfood 之后（§18），在那之前这一条没有撤下的路，这是有意留的缺口（§16）。提示里不指点人手改 `lifts.jsonl`：手写的行没有合法的 `via`，晨报会把它当篡改（评审 F4）。
4. 核对原话，同 M3 核对人的回话的办法（M3 附录 0.5 §3.6 的 `personSaid`：取人发来的消息，不信模型的转述）。先定「最近一条人的消息」，只有一种读法（评审第 2 轮 N11）：在本会话 `session.deriveMessages()` 里取最后一条 `role: 'user'`、`source.kind === 'user'` 且没有 `source.form` 的消息。M3 的 `isPersonMessage` 同样排除带 `form` 的；插件的 notice 与快照的 `source.kind` 是插件名，不在这一类里，所以夹在中间的 `hourness-guard` 提醒不影响。这条消息的 `source.rpcId` 必须是字符串（同 §5.5 第 2 条的认法），否则返回 `not_said`。也就是说，最后一条用户来源的消息不是客户端送来的人的话时（headless 的任务消息、父 agent 写给子 agent 的任务、`/goal` 带的附件，都是 `kind: 'user'` 而没有 `rpcId`），就撤不了，也不会退回去找更早的一条带 `rpcId` 的消息。比 M3 多要求 `rpcId`，因为这里授权的是放开一条规则。下面四条都成立才往下走，任何一条不成立都返回 `not_said`，什么都不写：
   1. 两边做 NFKC、空白合一之后，`words` 是这条消息的一段，起止落在边界上（起点是消息开头或前一个字符是空白或 `\p{P}`，终点是消息结尾或后一个字符是空白或 `\p{P}`，同 M3），所以摘不出半句话改了原意；
   2. `words` 含撤下意图词表里的一个词：`action` 为 `lift` 时取 `LIFT_WORDS`（别拦、不拦、不用拦、先别拦、撤下、关掉、放开、解除、去掉、还给你、`lift`、`unblock`、`stop blocking`、`disable`），为 `restore` 时取 `RESTORE_WORDS`（恢复、拦回来、重新拦、`restore`），英文不分大小写。命中的词前面紧挨着（去掉空白后）一个否定词的不算，否定词表是 `NEGATIONS`（不要、别、不能、不可、不许、不准、千万别、`don't`、`do not`、`never`；撇号 `'` 与 `’` 都认）：「别关掉那条」「don't disable it」里的「关掉」「disable」不算命中，而「先别拦了」里的「别拦」本身是词表里的词、它前面的「先」不是否定词，算命中；同一个词出现多处时，有一处不被否定就算命中。三张表都是 `src/guard/lift.ts` 里的常量，权限相关，改它们走 `norm-review-floor` 全审；排除否定而不是只靠后手兜底，是因为多放行一次撤下的代价（规则停拦直到有人发现）高于多拒绝一次（主 Agent 请人把话再说一遍）；
   3. `words` 去掉空白后至少 4 个码点；
   4. 这条人的消息（以 `rpcId` 为键，内存里记最近 64 个）还没有换来过一次成功的撤下或恢复。一次成功指返回 `lifted` 或 `restored`；`noop` 与各种错误不算。人一句话里说了几条规则时，主 Agent 撤其中一条，在回复里告诉人撤了哪条、请人把另一条再说一遍。进程重启丢了这张表时，最坏是同一条消息多换一次，前三条仍然约束。
   会话里没有用户来源的消息、或最后一条不是客户端送来的（目标轮、巡检叫醒的会话常是这样）同样 `not_said`。`hint`「quote the clause where the human asks to stop or restore this rule, exactly as they wrote it; if they did not ask for this, do not call it; if they asked for several rules, lift one and ask them to say the others」。
5. 状态已经是目标状态（已撤下再撤下、没撤下就恢复）：返回 `noop`，什么都不写。
6. 追加一行到 `docs/guard/lifts.jsonl`（见下）；写不进（权限、目录不在又建不出）时 `unavailable`，`hint`「tell the human the rule could not be lifted (<错误码>); they can ask again (once the rules board offers it for code rules, /rules lift <id> there is another way)」。规则板对代码规则接线之前，提示和返回里不把它当作现成的办法写（评审第 3 轮 N15）。
7. 违规流水写一条 `LiftRecord`（`via: 'chat'`）。

返回 `{outcome: 'lifted' | 'restored' | 'noop', rule, title, blocks, message}`：`blocks` 是这条规则拦什么的一句话（取自目录），`message` 是「Tell the human in your reply that <title> is now lifted for this project and no longer blocks <blocks>. To put it back, the human says so and you call guard_lift again with action "restore" and their words; once the rules board offers it for code rules, /rules restore <id> there does the same. Steps from now on do not list the rule in the system prompt, so this session's prompt cache is rebuilt once.」。

规则板这一路用服务 `glmHournessLifts`（`src/guard/lift-service.ts`，guard 行在 `apply` 里 `ctx.provide`，读取函数同 `requestsService` 的写法：成员类型不对时为 `undefined`；`LiftServiceContractCheck` 钉住类型与实现一致）。它是插件之间的调用，agent 没有经它的路：

```ts
export const LIFT_SERVICE = 'glmHournessLifts'

export interface LiftService {
  /**
   * The rules board hands over a lift or restore the human typed (/rules lift <id>, /rules restore <id>). The command is the
   * human's own, so there is no words check (the board checks who typed it), and a rule with liftVia 'board' can be lifted here.
   * `rule` is resolved in this order, so ids that contain a colon (`loops:schedule-tools`, whose row is `loops`) are unambiguous:
   * 1. the whole string exactly as an id in GUARD_RULES;
   * 2. else the string with one leading `<row>:` removed, where <row> is a row value in GUARD_RULES, exactly as an id;
   * 3. else `unknown_rule`.
   * So `loops:schedule-tools` is rule 1 (a GUARD_RULES id) and `loops:loops:schedule-tools` is rule 2. Never throws.
   */
  setLifted(call: {
    readonly cwd: string, readonly rule: string, readonly action: 'lift' | 'restore',
    readonly command: string,           // the command text, at most 500 characters
    readonly sessionId?: string
  }):
    | { readonly ok: true, readonly outcome: 'lifted' | 'restored' | 'noop', readonly rule: string, readonly title: string }
    | { readonly ok: false, readonly code: 'unknown_rule' | 'not_liftable' | 'unavailable', readonly message: string }

  /** The rules lifted now in the project of `cwd`, with when, by which route and the words. For the rules page and the morning report. Never throws. */
  lifted(cwd: string): readonly { readonly rule: string, readonly at: string, readonly via: 'chat' | 'board', readonly words: string }[]
}

/** undefined when the guard row is not loaded or a member has the wrong type (problem is called once), as pricingService. */
export function liftService(ctx: ServiceLookup, problem?: (message: string) => void): LiftService | undefined
```

`setLifted` 做上面的第 3、5、6、7 步（第 7 步的 `LiftRecord` 是 `via: 'board'`，`words` 写命令原文）；规则 id 不合时返回 `unknown_rule` 或 `not_liftable`，`message` 列出可撤下的 id，规则板原样显示给人。

状态文件 `docs/guard/lifts.jsonl`，在项目根（`projectOf(cwd).root`，M7 的工作树归到主检出，所以 harness 为 worker 会话读和写的也是主检出里的这一份；worker 的工作树里另有一份已提交的副本，harness 不读它，但 agent 写它同样会被 `lift-files-only` 拦下，见下，F14）的仓库里，只追加：

```ts
interface LiftLine {
  readonly at: string
  readonly rule: string
  readonly action: 'lift' | 'restore'
  readonly via: 'chat' | 'board'
  readonly words: string              // at most 500 characters; via board: the command text
  readonly session?: string
}
```

一条规则的状态是它最后一行的 `action`；`liftedRules(根)`（`src/guard/lift.ts`）返回当前处于 `lift` 的 id 集合，按项目根缓存，文件的大小与修改时间变了才重读，每次判定只多一个 `stat`。坏行跳过并计数（行健康写「lifts.jsonl 有 N 行读不懂」）；文件不在等于没有撤下；读不出（权限等）时一条都不撤，规则照常拦，行健康降级。为什么进仓库：撤下是人对这个项目的决定，`d-rules-in-repo` 把规则与开关放进仓库，进 git 就带着原话和时刻，可以被评审，换电脑不丢；运行时的 `.llm/` 不进 git，不适合放一个人的决定。

护住这个文件：新规则 `lift-files-only`（`src/guard/lift-files.ts`，用 `src/guard/mention.ts`；对 shell 文本的判法同 `graph-files-only`，但「是不是这个文件」不比一个绝对路径，按下面的办法认）。只认 `docs/guard/lifts.jsonl` 这个确切的相对路径，不认整个 `docs/guard/` 目录，所以别的项目自己的 `docs/guard/` 文档不会被误拦（评审 N2）。

每一份检出里的这个文件都认（评审第 3 轮 F14）。`lifts.jsonl` 进 git，M7 的 worker 在 `<主检出>/.worktrees/<名>/` 里各有一份已提交的副本：worker 用 `write` 改自己那一份，提交，被主 Agent 合入，主检出里就多一行没有人说过话的撤下，规则停拦。`graphFilesOnly` 的做法是把目标解析成绝对路径后与规则对象里的一个绝对路径比，用在这里只护得住主检出那一份，所以改成按「目标相对它所在检出的根」判，与循环板对 `docs/loops/` 的做法一样（`loops:files-only`：目标在任何一份检出里的 `docs/loops/` 之下，循环板 0.6 §13、§14.2 第 32 条）：

1. 文件工具（`write`、`edit`、`str_replace_editor` 除 `view` 外）：目标按调用方的 `cwd` 解析成绝对路径，规范化（正斜杠、小写，同 `pathKey`），先做一个便宜的字符串判断：规范化后的目标以 `/docs/guard/lifts.jsonl` 结尾，不是就放行，别的写入不多一次磁盘读。是的话，用 `checkoutRootOf(目标所在的目录)` 找检出的根。`checkoutRootOf` 是 `src/data/project-root.ts` 新加的一个导出（评审 finish2 轮 N23，选了这一种而不是尾部匹配加 `projectOf`：尾部匹配会把项目里任何子目录下的同名路径也拦住，这一种只认检出根下的确切路径）：从给定路径往上找最近的 `.git` 条目（目录或文件，工作树的 `.git` 是文件），返回它所在的目录；不跟 `commondir`，所以工作树返回工作树自己的根，不是主检出（`projectOf` 内部的 `locate` 不导出，且跟 `commondir`，返回主检出，不能用来认「这是哪一份检出」）；只读文件、不起 git 进程；目录还不存在时 `statSync` 失败，照样往上走；找不到返回 `undefined`。它复用该文件私有的 `gitEntry`，约十行，不另写第二份项目根逻辑（§13.3）。目标相对 `checkoutRootOf` 返回的根（路径相对化、正斜杠、小写）是 `docs/guard/lifts.jsonl`，并且这个根属于会话的项目（`projectOf(那个根)?.root` 等于 `projectOf(cwd)?.root`）时拦。主检出、用 `git worktree add` 建在任何位置的工作树（不论放在 `.worktrees/` 还是别处，不论是会话开始之后才建的）、调用方 `cwd` 所在的检出，三类都在这一条里，不需要列举工作树，也就不会漏掉新建的。往上找不到 `.git` 时（项目在 git 之外），只认 `projectOf(cwd).root` 下的那一个。
2. shell 文本（`shellCommandOf`）：只查 file-tools-only 判为写的命令（同 `graph-files-only`），文本里提到 `docs/guard/lifts.jsonl` 就拦，前面带什么前缀都算（`./`、`../`、相对写法、任何一份检出的绝对路径），只要紧挨着它的前一个字符不是文件名字符（`x-docs/guard/lifts.jsonl` 不算），后面不接文件名字符（`lifts.jsonl.bak` 不算）；反斜杠与正斜杠、大小写在比较前统一。shell 文本里认不出是哪个检出，所以不分检出：别的项目恰好有同名文件时，写它的命令也会被这一条拦住，代价很小（路径很具体，也只在 file-tools-only 已判为写的命令里发生）。

文件工具的读不拦，读它用 `read`；shell 里的读（`cat` 一类）不是写，也不拦。git 命令不判（M4 的规则一律不判 git，§2.3）：`git add`、`git commit`、`git diff`、`git log` 照常可用。这是一个已知边界，不是「写不出」（评审 finish2 轮 F15）：`git apply`、`git am`、`git cherry-pick`、`git merge` 能把任意新的一行带进文件；`git checkout`、`git restore`、`git revert`、`git stash pop` 能把文件换回一个旧版本，旧版本里还有 `lift X`，后来那行 `restore X` 没了，一条人已经恢复的规则于是静默地重新处于撤下状态。它与读法看不见的 shell 写法同属已知边界（§11、§15），靠晨报的对账发现：对账比每条规则的终态，两个方向都查，换回旧版本也在内（§3.10）。门不拒绝流水里没有记录的行（没选的做法，§16）。提交办法：`lifts.jsonl` 进 git（§2.4），谁来提交也要有人负责，所以晨报在这个文件有未提交的改动时加一行「lifts.jsonl 有未提交的撤下，随下一次提交带上」，提交由持有 git 的主 Agent 做（`d-main-agent-shell`），撤下对人的决定生效不等提交。纠偏（四部分逐字，评审第 3 轮 N15）：事实「You tried to change the lift record `<路径>`.」（路径是这次调用提到的那个，主检出的或工作树里的）；越界「That file is the record of the rules the human has lifted, and the harness writes it.」；正路「Do not edit this file. Only the human can lift or restore rules. If you think a rule blocks you wrongly, say so in your reply.」；例外 `none`。这条纠偏单独成文，不写任何撤下的办法：「对主 Agent 说就能撤」那一句通用的话对其他规则成立，对 `lift-files-only` 自己不成立（`guard_lift` 撤不了它，规则板对代码规则接线之前它没有撤下的路，评审第 2 轮 N13）；「或者在规则板上打 `/rules lift`」在接线之前同样是还不存在的办法。0.6 的前一稿说这条纠偏不写那句通用的话，钉住的正路原文却正是那一句，L2 只查「telling the main agent」几个字，原文里是「asks the main agent」，测试照样通过，说明与文字对不上；现在正路里没有任何撤下的办法，L2 钉整段的四个部分，并断言渲染出的纠偏里不出现 `guard_lift`、`main agent`、`/rules`。`guard_lift` 撤不了这条规则，它也不在可申报名单里（评审 finish2 轮 N18；规则板接线之后 `/rules lift lift-files-only` 能撤，见上）。harness 自己写这个文件用 Node 的文件接口，不经 `tools/pre-execute`，所以不受这条规则管。剩余的边界：用读法看不见的 shell 写法改这个文件，与 `graph-files-only` 是同一个已知边界（§11）；发现办法有两条：文件是已跟踪文件，`git diff` 看得见，合入主检出的分支带来的改动也一样；晨报把主检出里 `lifts.jsonl` 此刻的状态和违规流水里的 `LiftRecord` 比，比每条规则的终态（文件里最后一行的 `action`，没有行等于没撤下；流水里最后一条 `LiftRecord` 的 `action`），也比逐行（文件里有而流水没有的行、流水里有而文件里没有的记录，被回退掉的 `restore` 属于后一类），对不上时每条规则写一行，点名规则与两边各自的状态，所以合入之后、换回旧版本之后的下一份晨报照样查到，不只在写入当时查（§3.10，F15）。

效果：见 §3.1 第 5 步（判定前去掉）与声明（少一行）；规则板的规则页读服务的 `lifted` 显示「已撤下 · 时刻 · 原话」（§18 给 `rules` 的请求）；撤下之前已记下的跟进待判不受影响。

留下的风险：经 `guard_lift` 的一路，核对证明的是三件事：这句话是人在客户端里发的最近一条消息的一整段，它含放开或恢复的意思，这条消息只换来一次撤下。它不证明人指的是哪一条规则：规则 id 与原话之间没有绑定（规则 id 的叫法人不会说，绑定要为每条规则维护一份说法表，维护成本高于这条防线的价值）。所以剩余的风险是人说了一句放开某条的话、模型撤下了另一条。意图词表也不理解整句话：它只排除紧挨在词前面的否定词，所以「别关掉那条」不再通过，但「这条不要动，那条撤下吧」里「撤下」前面是「那条」，算命中，人指的规则与模型撤的规则仍可能对不上，也是这一种。还有一种：人说完话之后主 Agent 自己推进了很久，那条话仍是最后一条用户来源的消息，仍可被引用一次（一条消息至多一次）。三道后手：每次撤下的返回里写明撤下了哪条规则的标题与它拦什么，要求主 Agent 在回复里原样告诉人（人当场就看见撤错了）；撤下写进仓库、记原话、晨报列出；一句话恢复，且恢复同样受 `RESTORE_WORDS` 与一条消息一次的约束。这与图上 `relay` 的边界同一类（M3 附录 0.5 §3.6）。规则板一路没有这个问题，命令是人自己打的，写明了规则 id。

`GUARD_RULES` 的每项带 `liftVia: 'any' | 'board'`（§3.8）：`any` 的两条路都能撤，`board` 的只有规则板那一路（现在只有 `lift-files-only`）。规则板那一路不核对原话，所以没有上面这些限制。

L2：`guard_lift` 的每个错误码各一例（子 agent、`not_said`〔原话不在最近一条人的消息里、人的消息没有 `rpcId`、没有人的消息〕、`lift-files-only` 返回 `forbidden` 并指向规则板、目录外的 id、`noop`）；核对原话的各例（评审 F2）：人的消息是「继续」、`words` 是「继续」，返回 `not_said`（不含撤下意图词）；人的消息是「新建脚本那条先别拦了」，`words` 取同一句，撤下 `scratch-only`；`words` 取这句话里的「别拦了」（起点前一个字是「先」，不在边界上）返回 `not_said`；人的消息是「别拦」，`words` 是「别拦」（不足 4 个码点）返回 `not_said`；同一条人的消息上第二次 `guard_lift`（另一条规则）返回 `not_said`，下一条人的消息又能换一次；`action: 'restore'` 的 `words` 含「别拦」但不含恢复意图词时返回 `not_said`；`noop` 与错误不用掉这条消息的那一次；`bootstrap-read-no-shell` 在目录里，`guard_lift` 与 `setLifted`（`bootstrap:bootstrap-read-no-shell`）都撤得下、之后接管行的门不再拦（F3）；撤下之后同一项目里另一个会话（含 worker 工作树）对应的调用不再被拦、声明少一行；恢复之后又拦；`lifts.jsonl` 有坏行时其余行照常生效；读不出时规则照拦；`write`、`edit` 写 `docs/guard/lifts.jsonl` 被 `lift-files-only` 拦下，`pwsh` 的写命令（`Set-Content` 之类）提到它被拦下，`pwsh` 的 `cat` 与 `read` 放行（评审 finish2 轮 N20）；假的规则板调 `setLifted`（用 `<行>:<规则 id>` 的写法）同样写一行 `via: 'board'`，`lifted(cwd)` 读得到，两个错误码各一例；`setLifted` 撤得下 `lift-files-only`（`liftVia: 'board'`）；规则 id 的解析顺序各例（N3）：`loops:schedule-tools`（整串精确命中）与 `loops:loops:schedule-tools`（去一个 `loops:` 前缀后命中）都撤下同一条规则，`loops:nonexistent` 返回 `unknown_rule`；`lifts.jsonl` 的行没有 `via` 或 `via` 不在 `chat`、`board` 里（手写的行）时跳过并计数，晨报写「lifts.jsonl 有 N 行读不懂」；`write`、`edit`、`pwsh` 对 `docs/guard/` 下别的文件（例如项目自己的 `docs/guard/README.md`）放行，`git add docs/guard/lifts.jsonl` 放行（N2）；`guard_lift` 与 `setLifted` 写出的 `LiftLine` 与 `LiftRecord` 除 `via` 与 `words` 外逐字段相同。评审第 2 轮 N11、N13 加的各例：人的消息是「别关掉那条」、`words` 取同一句，返回 `not_said`（「关掉」前面是否定词）；人的消息是 `don't disable that rule`（`don’t` 同）、`words` 取同一句，返回 `not_said`；人的消息是「那条先别拦了」，`words` 取同一句，撤下；`action: 'restore'` 的 `words` 是「别恢复」返回 `not_said`；一条带 `rpcId` 的人的消息之后又有一条 `kind: 'user'`、没有 `rpcId` 的消息（headless 任务一类），`words` 取前一条人的消息里的话，返回 `not_said`；人的消息之后夹了一条 `form: 'notice'` 的 `hourness-guard` 提醒，`words` 取人的话，照常撤下；对 `lift-files-only` 调 `guard_lift`，`hint` 指向 `/rules lift lift-files-only` 并说明规则板接线之前撤不了；拦下 `lift-files-only` 的纠偏四部分逐字钉住，渲染出的文本里没有 `guard_lift`、`main agent`、`/rules`（评审第 3 轮 N15）。评审第 3 轮 F14、N15 加的各例（真实的临时 git 仓库，工作树用 `git worktree add` 建）：①会话 `cwd` 在 `<仓库>/.worktrees/t`，`write` 相对路径 `docs/guard/lifts.jsonl`，被 `lift-files-only` 拒绝，拒绝记录的规则 id 是它；②同一个会话 `write` 工作树里的绝对路径 `<仓库>/.worktrees/t/docs/guard/lifts.jsonl`，同样被拒；③主检出的会话 `write` 工作树里那一份的绝对路径，被拒；④工作树建在 `.worktrees/` 之外（`<临时目录>/other-wt`），会话开始之后才建，写它的 `docs/guard/lifts.jsonl` 被拒；⑤`pwsh` 的 `Set-Content ../docs/guard/lifts.jsonl`（`cwd` 在 `src/`）与 `Set-Content .\docs\guard\lifts.jsonl`（反斜杠）被拒，`cat docs/guard/lifts.jsonl` 与 `git add docs/guard/lifts.jsonl` 放行；⑥`docs/guard/README.md`、`docs/guard/lifts.jsonl.bak`、`docs/guard/x-lifts.jsonl` 在主检出与工作树里都放行；⑦另一个项目（别的临时仓库）里的 `docs/guard/lifts.jsonl` 对这个会话的 `write` 放行；⑧项目在 git 之外时只认 `projectOf(cwd).root` 下的那一个；⑨工作树里的副本被改过并提交、再合入主检出（测试里直接把一行写进主检出的文件，不经 harness）：之后的判定读到它（`liftedRules` 照读主检出的文件），晨报写一行「lifts.jsonl 与流水对不上」，点名那条规则（§3.10）；⑩`guard_lift` 成功的返回里与 `unavailable` 的 `hint` 逐字钉住（N15）：写明用 `guard_lift` 再调、带 `action: "restore"`，规则板的 `/rules restore`、`/rules lift` 都带「once the rules board offers it for code rules」。评审 finish2 轮 F15、N23 加的各例（同样用真实的临时 git 仓库，晨报读的是真实的流水与文件，git 命令真跑）：⑪换回旧版本：经服务 `setLifted` 先撤下后恢复 `scratch-only`（文件两行，流水两条 `LiftRecord`），把这个状态提交，再经 `git checkout <撤下那次提交> -- docs/guard/lifts.jsonl` 换回只含 `lift` 一行的版本（不经 harness）；`liftedRules` 读到它仍处于撤下，晨报有且只有一行「lifts.jsonl 与流水对不上：scratch-only，文件里最后一行是撤下，流水里最后一条是恢复」，不作废那次撤下；`git restore --source=<撤下那次提交> -- docs/guard/lifts.jsonl` 与 `git revert <恢复那次提交>` 各再做一遍（每次从提交过恢复的状态起），同一结果；⑫带进新行：`git apply` 一份往主检出的 `lifts.jsonl` 加一行 `lift` 的补丁，规则 id 是 `checker-config`（流水里没有它的任何记录），晨报写「文件里最后一行是撤下，流水里没有这条规则的记录」，`git cherry-pick` 与 `git merge` 带进同样一行各一例；⑬文件被回退到不存在：流水里 `scratch-only` 最后一条是撤下，文件没了，晨报写「文件里没有这条规则的行，流水里最后一条是撤下」，规则照拦；⑭不误报：撤下再恢复的一致状态晨报没有这一行；流水不在（换了电脑，文件里有 `lift`）晨报写一行提醒，那次撤下仍然生效；一次撤下的流水记录没写进去（有 `GapRecord`）同样只写这一行，撤下仍然生效；⑮`checkoutRootOf`：主检出里的路径返回主检出根；`git worktree add` 出来的工作树里的路径返回工作树自己的根，不是主检出（同一个路径的 `projectOf(...).root` 仍是主检出，两个函数的差别在测试里并排断言）；工作树里还不存在的子目录返回工作树的根；不在任何 git 检出里的路径返回 `undefined`。

### 3.6 误拦怎样被发现

没有试运行期，所以误拦靠看得见来发现（人的原话：「这样反而有问题好发现」）。三样东西，都由 harness 写，不靠人去标：

- 记录。每次拦下一条 `ViolationRecord`：规则 id、模型调用的工具名、`call`（命令文本至多 8 KiB，或解析后的目标）、来源 `scope` 与路由、给模型的纠偏。
- 统计 `ruleStats(records, {now, since})`（`src/guard/measure.ts`，纯函数）：按「规则 × 来源（`dialect` / `other`）」给出拦下次数；跟进 `right-path`、`repeat`、`other`、`none` 的计数；原样重试次数（`repeat`）；最近一次拦下的样子（时刻、工具、命令或目标的前 60 个字符）。撤下状态由读的一方另给。整个项目另给一个 `unrecorded: {records, gaps, last?}`：这段时间里 `gap` 记录合计丢了几条、几处缺口、最近一处缺口的 `until`；没有缺口时 `records` 为 0。晨报、命令行、规则板的规则页读同一份数，所以规则页不必自己认 `gap`，只要显示这一个数（F13，§18 给 `rules` 的请求）。
- 信号。同一条规则拦下之后模型原样再来一遍（`repeat`），是拦错了或正路没写清的最直接迹象；晨报把它单列，k 大于 0 时附最近一次的样子。人觉得拦错了就撤下，撤下也记在晨报里。

删掉的东西（`d-code-rules-enforce`）：抽样标注与标注文件 `labels.jsonl`、`guard label` 命令、精确率与召回率、转生效的判据 `PROMOTION`、历史会话回放与它读的 DSH 会话日志、回归语料与脱敏命令。它们都只为「攒够样本再转正」服务。

拦截后下一步走对的度量（§3.3）留下，原因有三：不依赖试运行，拦截第一天就生效；规则板 0.10 已采纳 `observe` 与 `noteDenial`，删它要改已放行的设计；拦截一启用就生效，纠偏文案写得好不好直接决定 agent 会不会卡住，这是唯一的自动信号。K1 的标定题量的也是它（§13.1）。

### 3.7 上线前的用例

没有试运行期，规则的误拦要在启用它所在的行之前用测试挡掉。`tests/guard-rules.spec.ts` 是一张手写的表驱动测试：每条规则至少有应拦的写法和相邻的不该拦的写法。种子：`docs/DEVELOPMENT.md` §7 记下的三次 `=>`、`>>>`、`->` 被当成重定向的误判，本仓库流水里现有的 4 条记录（2026-10-28 两条圈禁、2026-10-29 两条 file-tools-only）的命令写法（参数从记录的 `correction` 与事故说明里抄出，注明出处），以及 §4 三条规则各自「不触发」的情形。用例手写，不需要脱敏和语料格式；命令里有密钥形状的字符串时 `check:secrets` 照常挡。新增或改一条规则的提交同时加用例（`AGENTS.md` 文档与行为同批）；之后每发现一次误拦，先把那条写法加进这张表，再改规则。

### 3.8 规则目录与规范节点

`src/guard/catalog.ts` 导出 `GUARD_RULES: readonly {id, row, title, blocks, liftVia}[]`，列出 guard 框架里装规则的行的全部规则：guard 行的六条（`workspace-containment`、`file-tools-only`、§4 的三条、`lift-files-only`）、图行的 `graph-files-only`、循环板的 `loops:schedule-tools` 与 `loops:files-only`、指标流水的 `metrics-files-only`、接管行的 `bootstrap-read-no-shell`（评审 F3）。`id` 是规则对象自己的 id，`row` 是装它的行（`guard`、`graph`、`loops`、`metrics`、`bootstrap`），`title` 是一句话（给规则页与 `guard_lift` 的错误提示），`blocks` 是这条规则拦什么的一句话（`guard_lift` 的返回用它），`liftVia` 是 `'any'`（`guard_lift` 与规则板的 `/rules lift` 都能撤）或 `'board'`（只有规则板那一路能撤，现在只有 `lift-files-only`，§3.5 第 3 步）。循环板、指标流水与接管行的规则随它们的步登记，后合入的一方在自己的那一步加；接管行的那一项是 `{id: 'bootstrap-read-no-shell', row: 'bootstrap', liftVia: 'any'}`，规则页上的 id 是 `bootstrap:bootstrap-read-no-shell`。M3 的八条在 M3 自己的 `MAIN_AGENT_RULES`（`src/guard/main-agent-rules.ts`，M3 附录 0.5 §3.11），M7 的门在 M7 自己的 `EXECUTE_RULES`（`src/guard/execute-rules.ts`，M7 0.6 §12.1），它们各管各的表，`GUARD_RULES` 不列，这两张表的规则改经 `installRuleGate` 之后才能撤下。

规则板「写在代码里的规则」一节读这三张表（规则板 0.10 §10.1，§10.7 M4 一节第 1 条）：`src/rules/builtin.ts` 导入它们并映射成 `CatalogEntry`，id 写成 `<行>:<规则 id>`（guard 行的是 `guard:workspace-containment` 一类，M3 的是 `design:<id>`）；自己只另加规则板的 `rules:files-only`、默认规则 `builtin:glm-peak-pricing` 与它的四条附属条目。所以 M4 的三条新规则在规则页上看得到，标「项目编排带来的 · 只能看」，旁边写撤下状态（`d-rules-visible`）。「只能看」指规则的内容人在板上改不了；人可以撤下与恢复它们，这是对 `d-defaults-readonly` 的例外（编排方 2026-10-31 的 `d-one-lift-path`：插件自带的写在代码里的规则，人可以撤，N4），规则页在这类规则旁边给撤下与恢复的入口，不给改内容的入口；它们是代码里的规则，不是板上的条目，`d-boards-as-hooks` 不改它们，规则板的 `mode: 'record'` 是人在板上条目里选的做法，与代码规则无关。先合入的一方建 `catalog.ts`，另一方导入。

`tests/contracts.spec.ts` 加三条：三张表合起来 id 不重复，并与各行实际装上的规则一致（加了规则忘了登记就失败；违规流水里出现的每个 `rule` 也都在三张表之一，`rules:` 开头的除外，那是规则板的）；`GUARD_RULES` 里所在行不是 `guard` 的规则，各行装规则都经 `installRuleGate`（§3.1 的标记）；本仓库图上每个带 `规则：` 标签的规范节点，列出的规则都在三张表里，表里每条规则恰好出现在一个规范节点里。规范节点不再有 `模式：` 标签（M7 0.6 §3.12.1 的标签随阶梯一起作废，§18）。规范节点分两批提议（§18 第 3 条）：已有的三条规则在 G1 合入之前，三条新规则与 `lift-files-only` 在 G3 合入之前，所以这条测试在每一步合入时都成立（评审第 2 轮 N21）。M3 与 M7 的两张表合入之前，测试只核对已有的表。

### 3.9 命令行

`npm run -s guard -- <命令>`（`scripts/guard/cli.mjs` 经 `--experimental-strip-types` 跑 `src/guard/cli.ts`，只用 Node 内置模块，同项目图的命令行）。项目目录按 `--home`，否则 `<工作区>/.llm`。命令行只读，没有撤下命令：agent 能经 shell 运行它，撤下只经 `guard_lift` 与规则板的 `/rules lift`（§3.5）。

| 命令 | 作用 | 退出码 |
| --- | --- | --- |
| `records [--since 14d] [--rule <id>] [--show]` | 列出记录的键、规则、类别（`classifyRecord`）、来源与工具；`--show` 才带命令与目标 | 0；2 用法或目录不对 |
| `stats [--since 14d]` | `ruleStats` 的表，JSON | 0；2 |

在 DSH 会话里，agent 经 shell 运行这些命令：它们不是写文件命令，file-tools-only 不拦，与项目图的命令行一样。

### 3.10 晨报

`src/workflow/morning-report.ts` 的拒绝过滤改用 `classifyRecord`（G1，§3.2），影子一节去掉：`denial` 与 `late-denial` 进「违规」，后者在「违规」之后另写一行「其中晚到的拦下 k 条」，`rule-record` 不进「违规」、单写一行「只记录 m 条（规则板上人选的做法）」，跟进、申报、放行、作废、撤下只进下面各自的行，`unknown` 末尾写「N 行记录读不懂」。每条被拦过的规则一行（G2）：

```text
- 拦下 checker-config × 3（最近一次：edit tsconfig.json · 10-31 14:02）· 拦截后下一步走对 2/3 · 原样重试 1 次
```

「拦截后下一步走对」另有汇总一行：`- 拦截后下一步走对：file-tools-only 4/5，workspace-containment 1/2（另有 3 次停下来交给人或上级）`（`y` 不含 `none`，§3.3）。「撤下的规则」一行（G3）：`- 撤下的规则：scratch-only（10-31 14:02，经对话，原话「新建脚本那条先别拦了」；经规则板的写命令原文「/rules lift guard:scratch-only」）`。这一行之后是对账的结果（评审 finish2 轮 F15，取代 0.6 前稿只查「文件里有、流水里没有」的一个方向）。对账读的是主检出里 `lifts.jsonl` 此刻的状态，不是写入当时的一次性检查，所以主 Agent 把带着改过的 `lifts.jsonl` 的分支合入主检出之后、`git checkout`、`git restore`、`git revert`、`git apply` 之后（`lift-files-only` 不判 git，§3.5），下一份晨报就查得到（F14）。比两样，每条出现在文件或流水里的规则一次：①终态：文件里这条规则最后一行的 `action`（没有行等于没撤下）对流水里最后一条 `LiftRecord` 的 `action`；②逐行：文件里有而流水里没有的行，与流水里有而文件里没有的记录（被回退掉的 `restore` 属于后一类），键是 `at`、`rule`、`action`。①②任何一样对不上，这条规则写一行：`- lifts.jsonl 与流水对不上：scratch-only，文件里最后一行是撤下，流水里最后一条是恢复`；终态相同、只有逐行不同时写 `- lifts.jsonl 与流水对不上：scratch-only，文件里有 1 行流水没有的，流水里有 0 条文件没有的`。两边的状态用「撤下」「恢复」「没有这条规则的行」「没有这条规则的记录」四种说法。对不上不改变任何一条规则的撤下状态（门只读文件），这一行只是提醒：换电脑、切分支之后流水或文件天然不同，一次撤下的流水记录没写进去（有 `GapRecord`，§3.2）时也一样，两种情形都不作废真实的撤下。门不因为流水里没有记录就拒绝文件里的行（没选的做法，§16）；`lifts.jsonl` 有未提交的改动时另加一行「lifts.jsonl 有未提交的撤下，随下一次提交带上」，提醒持有 git 的主 Agent（N2，判法是 `git status --porcelain -- docs/guard/lifts.jsonl`，5 秒上限，失败不写这一行）。「流水的缺口」一行（G1，F13）：`- 流水有缺口：这段时间有 3 条记录没写进来（拦下 2、跟进 1），最近一处到 11-01 02:10；当时的拦截都照常生效`，数取 `ruleStats` 的 `unrecorded` 与 `gap` 记录的 `classes`；没有缺口不写这一行。写失败还没恢复、缺口还在内存里时晨报看不到它，那时只有行健康与控制台（§11）。检查的超时值与超时（E3）单列一节，写法在 §6.3.1。数字取 `ruleStats`。`deferral` 不进这一节。晨报读的是会话所在项目的流水（§2.4），所以一个项目的晨报只有这个项目的数。M7 的四答晨报接手时，「例外」一节照这几行写。

### 3.11 交给指标流水的事件（`metrics`）

图上 `m4` 有指标设计 0.1 §14 的一条请求（2026-10-29T23:40Z）：`installRuleGate` 交 `rule` 事件（跟进的结局一起）；压制注释数改为每天一条计数事件，不建 `suppressions.jsonl`；`recordKey` 若指标流水先建，M4 沿用；新规则 `metrics-files-only` 进规则目录。M4 的做法：

- `src/guard/metrics.ts` 的 `emitGuardMetric(ctx, event)` 经指标服务交事件（服务名与信封由指标设计定）；服务不在时什么都不做，不报错。交的时刻：`installRuleGate` 每写一条拒绝之后；记录器每写一条 `FollowupRecord` 之后；兜底每写一条晚到的拦下之后；撤下每写一条 `LiftRecord` 之后；申报每写一条 `RequestRecord`、`GrantRecord`、`GrantVoidRecord` 之后；每写一行 `GapRecord` 之后（只交行名与丢的条数）。只交规则 id、种类、结局、来源与会话 id，不交命令与路径（指标设计 0.1「路径记散列、命令只记第一个词」，以它为准）。
- E3 每次检查的超时值调整与超时同样交一条事件（`src/env/metrics.ts`，只带检查名、上限、实际耗时与结局，§6.3.1）；E4 每天的压制计数交一条计数事件。`suppressions.jsonl` 这一稿照旧写：指标设计 0.1 第 1 轮没有通过（挡路 11 条），它的行出厂禁用，晨报的压制一行要在没有它时也写得出；指标设计定稿、它的行默认启用之后，去掉这份文件只改 E4 的 `src/env/suppressions.ts` 与晨报读它的一处，由指标设计的实施那一步做（§18 第 5 条给 `metrics` 的批注）。
- `recordKey` 与 `metrics-files-only`：照请求，谁先建谁建，后到的导入；`metrics-files-only` 经 `installRuleGate` 安装、登进规则目录。
- 违规流水不并进指标流水：`d-rules-in-repo` 把两者列为项目 `.llm/` 里的两样运行时记录；流水是授权之外的留痕，指标是计数。

## 4. §6.4 的规划规矩（`m4-rules`）

`docs/ORCHESTRATION.md` §6.4 表里标「规划」的各行：

| 规矩 | 在哪实现 | 状态 |
| --- | --- | --- |
| 设计阶段不写代码 | M3 `design-before-release`（`src/guard/main-agent.ts`） | 生效（`question-25`） |
| 主 Agent 不写文件 | M3 `main-agent-no-write` | 生效（`question-25`） |
| 临时脚本只在草稿区 | M4 `scratch-only`（§4.5） | 启用即拦；可申报 |
| 压制注释必须写理由并挂节点 | M4 `suppression-reason`（§4.3） | 启用即拦 |
| 放宽检查配置走决策卡 | M4 `checker-config`（§4.4）；被拒的写入经 `request_exception` 申报（§5） | 启用即拦；可申报 |
| 同一处第三次修复走决策卡 | M4 图工具：第 3 次重开（第 3 次修复开始）时提一张提议式的人定待决，主 Agent 放进下一批问人（§4.6）；循环板列出 `graph.third-rework`（§6.8） | 只问人，不拦 |
| 子 agent 只写任务节点的写入范围 | M7 `worker-scope` | M7 定 |

§6.4 表在 G3 一步里改写成上面的样子（每行加「状态」一列）。读凭证文件不在表里，也没有规则（§4.2）。

### 4.1 判定上下文

`detect` 是同步的，三条规则要的外部事实由 guard 行在判定之前异步准备（`src/guard/context.ts` 的 `prepareContext(call, session, services)`），只在调用是文件工具写入、读工具或 shell 时才做：

| 事实 | 怎么取 | 上限与失败 |
| --- | --- | --- |
| 写入目标是否已存在、大小 | `fs.promises.stat`（目标按 §6.1 的圈禁解析） | 出错记为未知 |
| `write` 目标的旧内容（`suppression-reason` 比较标记数） | `fs.promises.readFile`，只在目标存在且不大于 1 MiB 时 | 大于 1 MiB 或出错记为未知 |
| 仓库里已跟踪的文件（`scratch-only`） | `git -C <仓库根> ls-files -z`（`execFile`，不经 shell），仓库根从目标向上找 `.git`；结果按仓库根缓存 60 秒 | 5 秒超时；不在 git 仓库里、没有 git 或超时记为未知 |
| 检查器配置文件（`checker-config`） | 内置的文件名表加 env 工具节点验收条件里 `config` 行的路径（§7.1，批准之后只有人能改）；图按修订号缓存 | 图读不出时只用内置表 |

事实为未知时，用到它的规则对这次调用放行、不写拒绝记录；行健康写「<规则> 有 N 次缺上下文」。整个准备至多等 5 秒，超时的项按未知处理。

### 4.2 读凭证文件：没有规则（`d-credentials-readable`）

人 2026-10-31 读到 0.5 一页稿里「读登录密钥文件只记录，永远不拦」那一句时说：「密钥文件能读。而且不是都能读吗？什么叫没拦？」今天没有任何东西拦 agent 读文件，0.5 的 `credential-read` 只是在读的时候往违规流水记一笔。人的意思是能读，所以这条规则整条删掉，不作为只记录的规则保留：没有判定器、没有记录、不进声明、不在规则目录里。阅读摘要 §4 第 9 条与 `docs/ORCHESTRATION.md` §6.4 里「读凭证先记影子」的说法随之作废，文字等编排方的文档提交改。

不变的几样都不依赖这条规则：密钥不进提交（`npm run check:secrets` 扫已跟踪文件）；写凭证文件在工作区外，仍受圈禁（§5）；GLM 登录信息只在用户级目录，本包通道行读它不经工具调用。M4 因此不再有「凭证文件路径」这一项判定事实（§4.1）。0.5 设想的「注入或越权读取要能被发现」这个目的，人已选择不要。

M4 的违规流水不遮盖命令原文（评审 F10，0.6 初稿曾把 M5 的 `looksSecret` 当作流水的防线，这不成立：`looksSecret` 是 M5 设计 §5.6 的函数，用在记忆、经验、候选、`relay`、证据与出处的写入口，M4 不调它，`src/` 里目前也没有它）。被拦的调用在 `ViolationRecord.call.command` 里留命令原文，至多 8 KiB；agent 能读登录密钥文件之后，被拦的命令里带令牌的可能比 0.5 大一点。流水在项目的 `.llm/` 里，不进 git（§2.4），不在 `check:secrets` 的扫描范围；晨报只写命令的前 60 个字符，`guard records --show` 才写全文。M4 不为此加遮盖：遮盖要依赖 M5 还没有的 `redactSecrets`，`hex` 类还会把完整提交号判成密钥而误伤命令；这个暴露面与密钥文件本来就在同一台机器上相当，列在 §15，由人推翻时再加。它与 `d-credentials-readable` 节点正文里「密钥不进日志与提交」有出入（违规流水是日志的一种）：这一点已写成对该节点的批注（`graph-ops-decisions.json`），请编排方裁定接受，或改为要遮盖（做法见 §15）；裁定之前按不遮盖做（评审第 2 轮 N14）。

### 4.3 `suppression-reason`

- 判什么：文件工具写入新增的压制注释。新增 = 新文本里某种标记的个数多于旧文本：`edit` 比 `new_string` 与 `old_string`（tool-fs:690–705）；`str_replace_editor` 比 `new_str` 与 `old_str`，`create` 比 `file_text` 与目标旧内容（str-replace-editor:141–171）；`write` 比 `content` 与目标旧内容（§4.1）。
- 标记（`SUPPRESSION_MARKERS`）：`eslint-disable`、`eslint-disable-line`、`eslint-disable-next-line`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`# noqa`、`# type: ignore`、`# pyright: ignore`、`NOLINT`、`NOLINTNEXTLINE`、`#[allow(`、`//nolint`、`# shellcheck disable=`、`jscpd:ignore-start`、`gitleaks:allow`。
- 合格的写法：同一行在标记之后有理由（拉丁字母至少 3 个词，或汉字至少 6 个；ESLint 用它自己的描述语法 `-- <理由>`）与一个方括号里的节点 id（匹配图的 `ID_PATTERN`，图读得出时还要存在）。例：`// eslint-disable-next-line require-await -- the waterfall awaits every listener [m4-checks]`。
- 不合格时的纠偏（模型看到的）：事实「You added `<标记>` without a reason and a graph node.」；越界「New suppressions need a reason and a node id on the same line.」；正路「Fix the finding instead; if the suppression is right, add `-- <why> [<node id>]` (ESLint) or a reason and `[<node id>]` after the marker.」；例外「If no node fits, propose one with graph_propose first.」
- 启用即拦。`docs/ORCHESTRATION.md` §7.6 写的「没写理由的新增压制直接拦下」就是这个状态；`docs/CHARTER.md` §6 与 ORCHESTRATION §6.5 的「先影子」已被 `d-code-rules-enforce` 取代，不再有转生效的一步。出路是纠偏里的正路：修掉告警，或把理由与节点写上；所以这条规则不进可申报名单。

### 4.4 `checker-config`

- 判什么：文件工具写入（`write`、`edit`、`str_replace_editor` 除 `view` 外）的目标是检查器的配置或基线。内置文件名表：`eslint.config.js`、`eslint.config.mjs`、`eslint.config.cjs`、`eslint.config.ts`、`.eslintrc`、`.eslintrc.*`、`eslint-suppressions.json`、`knip.js`、`knip.ts`、`knip.json`、`knip-baseline.json`、`.jscpd.json`、`.jscpd-baseline.json`、`tsconfig.json`、`tsconfig.*.json`、`.gitleaks.toml`、`ruff.toml`、`.ruff.toml`、`mypy.ini`、`.clang-tidy`、`.shellcheckrc`；另加 env 工具节点验收条件里 `config` 行的路径（§7.1）。改完就跑的检查条目与它们的脚本在循环板的仓库文件里，归循环板守（脚本按内容摘要钉住、改过不跑；条目文件谁能写由循环板定，同规则板对它自己文件的门），不在这条规则里。shell 改这些文件已被 file-tools-only 拦下；`npm run lint:update` 缩小基线不经文件工具，不在这条规则里（它本身拒绝放大基线，`docs/DEVELOPMENT.md` §10）。
- 启用即拦，进可申报名单（§5.3）。这条规则分不清改松与改紧，改紧的写入也会命中；没有试运行期来量这件事，出路是申报：被拒的写入走申报通道，人在申报文字里看到改动内容再回话，改紧的改动人回「可以」就放行这一次；人觉得整条规则在这个项目里不合适，一句话撤下（§3.5）。
- 纠偏：事实「You tried to change the checker configuration `<文件>`.」；越界「Changes to checker configuration and baselines need the human: loosening a check is an unplanned decision.」；正路「Fix the findings instead; if the configuration must change, call request_exception with ref "<编号>" and say what the change does to the checks.」；例外「Shrinking a baseline with the project's update script (for example `npm run lint:update`) is not a configuration edit.」

### 4.5 `scratch-only`

- 判什么：文件工具新建文件（目标在调用前不存在：`write`，或 `str_replace_editor` `create`），扩展名是脚本（`.js`、`.mjs`、`.cjs`、`.ts`、`.mts`、`.cts`、`.py`、`.ps1`、`.psm1`、`.sh`、`.bash`、`.bat`、`.cmd`、`.rb`、`.pl`），目标不在 `<工作区根>/.llm/scratch/` 下，且目标所在目录里没有已跟踪的同扩展名文件。最后一条把「在已有源码目录里加一个新模块」与「在仓库根或新目录里丢一个脚本」分开；分得准不准由 §3.7 的用例在启用之前挡一遍，之后看拦下的记录（§3.6）。
- 启用即拦，进可申报名单（§5.3）：目标目录没有同类已跟踪文件、而这确实是新模块时，agent 申报，人回「可以」放行这一次。
- 纠偏：事实「You created the script `<路径>` outside the scratch area.」；越界「One-off scripts live in .llm/scratch/ (git-ignored); a script that stays becomes part of the project.」；正路「Write it under .llm/scratch/ if it is a one-off; if it should stay, create it with the write tool in scripts/ (or the project's source tree) next to files of its kind, give it a graph node and say what it is for.」；例外「A new module in a directory that already holds files of its kind is not a one-off script. If this really is a new module in a new place, call request_exception with ref "<ref>" and say what the file is for.」
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

- 圈禁：`workspaceContainment(roots, base, exception)` 的第三个参数由 guard 行的 `rules()` 每次判定时给出（例外文案只出现在拒绝里，`detect` 仍是同步的纯函数）；编号在 `rules()` 里为每次文件工具写入预先生成（8 位，`crypto.randomBytes` 转 base36），只有被拒时才登记。`checker-config` 与 `scratch-only` 同样在 `rules()` 里预先生成编号、被拒时才登记：调用方是根 agent 时例外一句用 §4.4、§4.5 写的那一句，普通子 agent 与 M7 的 worker 用下表的第二、第三种（它们在工作树里写检查器配置或新脚本被这两条规则拒绝时，编号由 guard 行直接发，不经 `outsideDenial`）。

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

可申报的规则：`REQUESTABLE = ['workspace-containment', 'checker-config', 'scratch-only']`（`src/guard/request.ts`）。只有这些规则的拒绝带编号。`checker-config` 与 `scratch-only` 一启用就拦（`d-code-rules-enforce`），所以从第一天起就在名单里：它们的拦截有误伤的可能（改紧配置的写入、在新目录里加一个真正的新模块），没有试运行期可以先量，拦下之后的出路就是申报。`suppression-reason` 的出路是纠偏里的正路（把理由与节点写上），`file-tools-only` 管习惯，都不进名单。改名单就是改权限，`norm-review-floor` 全审；申报文字的题目与疑问一行按规则取（§5.4 的表）。

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
| 规则 `checker-config` | `要改检查器的配置：<文件>` | 按上面几行 | 同上；疑问一行换成「这次改动若**让检查变松**，就不该放行」 |
| 规则 `scratch-only` | `要在项目里新建脚本：<路径>` | `**放行这一次**，是新文件，删掉就能撤回` | 不存在，将新建；疑问一行换成「这个脚本若**只用一次**，就该放草稿区」 |

疑问一行写的是一个人能核对、一变就不该放行的事实（评审第 3 轮 N28；0.3 的「该不该让 agent 改，只有你清楚」是把问题原样推给人）。各行的长度（去掉 `**`）：背景至多 42 个码点（焦点标题截到 16 个字时），推荐 14–17，疑问 16–17，不做 22，都在 `proposalLineRefusal` 的上限之内，L2 对六种变体逐字钉住。

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
- 匹配：可申报的规则（§5.3）对一次调用判为拒绝时，按签名与调用方的派发链的根在放行簿里找；找到、未用、未过期，就去掉 `Judgement.denies` 里那条规则的拒绝（别的规则的拒绝不受影响，§3.1）。
- 使用时核对（批准与使用之间目标可能变了）：重新 `stat` 目标，与放行里的 `facts` 比较存在与否、大小、修改时间。
  - 不同：拒绝这次调用，纠偏写「The target changed since the human approved (<变了什么>); call request_exception again.」；放行作废（内存删去）；流水写 `GrantVoidRecord`。`stat` 出错（权限等）按「不同」处理，`<变了什么>` 写错误码。
  - 相同：目标存在且不大于 10 MiB、有项目目录时，一律先把旧内容复制到 `<项目目录>/requests/<编号>.before`，不看申报文字里写了什么（事实相同时文字里写的就是备份；大于 10 MiB 或没有项目目录时文字里写的是「旧内容找不回来」，人批的就是这个）。复制失败就拒绝这次调用（`Error: the approved write was not run: backing up <路径> failed (<原因>); resubmit the call or ask the human`），放行不作废，行健康记降级。
  - 核对与写入之间仍有毫秒级的窗口，人或别的进程恰好在这时改了目标，不在防线之内（§11）。
- 一次：同一进程里用一个「使用中」集合防并行的两次同签名调用都放行。`next()` 之前放行标为使用中；`next()` 放行后标为已用，流水写 `GrantRecord`；`next()` 不放行（别的监听器拒绝）时恢复为未用。
- 只认人：放行只来自 DSH 客户端送来的人的消息（§5.5）。模型写的任何文字（回复、工具参数、图上带 `relay` 的写入）都不产生放行。理由：想要这次写入的正是模型。
- 子 agent：子 agent 被拒之后把编号交回给派发它的 agent（§5.2）；按 `d-one-main-agent`，有主 Agent 的项目里那就是主 Agent。主 Agent 拿这个编号调 `request_exception`（编号的派发链的根就是主 Agent），人回「可以」之后，主 Agent 按说明里的参数派一个子 agent 原样写；放行按派发链的根匹配，所以同一派发链里的任何 agent 原样再调都能用这一次。主 Agent 自己仍被 M3 的 `main-agent-no-write` 拦下：两条规则互不放行。这一段是没有 M7 时的路径；装了 M7 的项目里，派出去写文件的是 worker，主 Agent 用原生 `subagent` 叫出来的子 agent 只读（M7 的 `dispatch-chain-readonly`），路径见 §5.9。
- 其他门禁照旧：放行只让被申报的那条规则不拦；M3、规则板的规则照常判；M7 的 `worker-scope` 只在 `peekGrant` 命中时让这一次调用往里走（§5.9），别的 M7 规则照常判。
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
| 超时与失败 | §6.3.1、§6.5 | 循环板的执行器与条目写明的办法（`d-script-timeout`） |

同一个工具节点的一条带 `when` 的检查行，M4 自带的检查器一定会跑；人再给它加一条 `check` 条目，它在改完文件之后会再跑一次（异步、结果按条目的设置交）。`checkCommandOf` 的结果带 `own: true` 告诉循环板这一点，页面在人加的那一项下面写「M4 自带的检查器也跑这一条」（循环板 0.6 §5.3 末段）。不带 `when` 的检查行只是一条命令的定义，M4 自己不跑，只供人加的条目引用；人要一条检查只在某些情形下跑、或结果交给主 Agent 而不是改文件的 agent 时，用这种。

为什么自带的检查器仍从工具节点取，而不是也要人在四行里看一遍：裁定允许 M4 继续执行它自带的检查器（「M4 may keep executing them」），它们是插件交来的数据，不是人加的条目；在 `ownRules` 之外，`details` 把每条检查的命令前 60 个码点写在板上，人随时看得到跑的是什么。这条防线比人加的条目弱：人批准工具节点时看到的是节点（标题、用途、验收条件），不保证细读了命令；所以自带的检查器只读状态为 `approved`、`doing`、`done` 的节点，验收条件批准之后只有人能改（`docs/ORCHESTRATION.md` §2.9），命令不经 shell，执行器的环境里没有 DSH 凭证与 GLM 密钥，在项目目录里跑，超时结束整棵进程树，日志第一行记下展开后的参数表（§11 不可逆表）。人要这条防线和人加的条目一样硬时，把检查行写成不带 `when` 的定义、再加一条 `check` 条目引用它（这时同意时人看到的是命令原文），M4 就不会自己跑它。

#### 6.1.1 环境工具节点上的检查行（M4 的格式）

环境分支（§7.1）下每个工具节点的验收条件里，可以有任意条检查行：

| 写法 | 含义 |
| --- | --- |
| `` `check <名字> <格式> [<预计>] $ <命令>` when <条件>[, <条件>…] `` | M4 自带的检查：改完的文件满足任一条件时跑这条命令 |
| `` `check <名字> <格式> [<预计>] $ <命令>` `` | 只是一条命令的定义，M4 自己不跑，人加的 `check` 条目可以引用（`checkCommandOf` 的 `own` 为假） |
| `` `config <路径>[, <路径>…]` `` | 这个工具的配置与基线文件（相对仓库根，不含 `..`），`checker-config` 读它（§4.4） |

- `<名字>`：`^[a-z][a-z0-9-]{0,23}$`，同一个节点里不重复；循环板的 `check` 动作用它指哪一条（节点只有一条检查行时可以不写）。
- `<格式>`：`eslint-json`、`tsc`、`lines` 之一（§6.4）。
- `<预计>`（可选，`d-timeout-measured`）：`^[1-9][0-9]{0,2}s$`，写在检查行里 `<格式>` 与 `$` 之间，是写检查行的 agent 估的这条命令跑一次要几秒（预计的运行时间，不是超时），整秒，例 `4s`。它在检查行里，所以随验收条件一起被人批准、批准之后只有人能改。接管项目时，接管把试跑这条命令实际用的时间（向上取整到整秒，至少 1 秒）写在这里当预计（接管设计 0.6，§18 第 5 条 `bootstrap`）。第一个超时 = 3 × 预计，不低于下限（5 秒）、不超过上限（60 秒），算法只在 §6.3.1；只有没写预计的检查行，第一个超时才直接取上限。人批准工具节点时，harness 把算出的超时和它从哪个估计算来的写成一句话（`timeoutText`，§6.3.1）放在这条检查行旁边，人看到的是超时，不是裸的估计。跑过之后由 harness 按实测接手（§6.3.1）。写得离谱（3 倍之后超过上限）只会被上限截住，不会让检查行读不懂；写成别的形状（`4`、`4 s`、`0s`、`1000s`）时这一行读不懂，由 `checkLineRefusal` 给出原因。
- `<命令>`（`splitArgs`，`src/env/check-entry.ts`，纯函数）：按空格切成参数表，一项可以用双引号括起来包含空格（引号去掉，项里不能再有双引号）；除此之外什么都不解释，`$`、`%`、反引号、`;`、`|`、`>` 都是普通字符；1–64 项，每项 1–2000 个字符，不含 NUL 与换行；第一项是程序，要能不经 shell 直接起（`node`、`git` 或 `.exe`；写成 `.cmd`、`.bat` 的被拒；Windows 上 `npx` 一类解析到 `.cmd` 的，执行器在起进程之前判出并记 `crashed`，原因写「请写成能直接起的程序，例 node 加脚本路径」，循环板 0.6 §6.6）；`{files}` 只能单独作为一项、至多一处；第一项的文件名（去掉扩展名、小写）是 `pwsh`、`powershell`、`cmd`、`sh`、`bash`、`zsh`、`fish`、`dash` 之一时，命令里不能有 `{files}`（这些程序会把后面的参数拼回一段命令再解释；要按改动文件跑 shell 逻辑就写成脚本条目，文件列表从标准输入的 JSON 拿）。不合语法的行由 `checkLineRefusal` 给出原因，跳过，行健康写「<节点 id> 第 n 条检查行读不懂：<原因>」。
- `<条件>`：循环板 `paths` 的写法（目录前缀以 `/` 结尾，文件，`*.<扩展名>` 在任何一层目录都算，`**` 匹配零个或多个目录；循环板 0.6 §2.2），比法用循环板的 `matchesFilter`（`src/loops/trigger.ts`），M4 不另写一份。0.3 的 `.ts` 写法随之改成 `*.ts`。
- 只认已批准的节点（状态 `approved`、`doing`、`done`）。工具节点由 LLM 提议、人批准（`initialStatus` 对工具节点为 `proposed`）。
- 本仓库的两个节点（§18 由编排者提议）：

  ```text
  ESLint：`check eslint eslint-json 3s $ node node_modules/eslint/bin/eslint.js --format json --pass-on-unpruned-suppressions {files}` when *.ts, *.mts, *.js, *.mjs, *.tsx
  ESLint：`config eslint.config.js, eslint-suppressions.json`
  TypeScript：`check tsc tsc 2s $ node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --pretty false` when *.ts, *.mts, *.tsx
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
  /** The line's `<预计>` in seconds (§6.1.1): the expected run time, not a timeout. Absent when the line has none. The loop board shows it with the command text; its first timeout is 3 × this number, between its floor and its maximum (§6.3.1, §18). */
  readonly estimateSeconds?: number
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
  - 超时按 §6.3.1（先由检查行里的预计定，跑过之后由 harness 按实测定）；输出上限 1 MiB（解析用），多的截掉，日志里写明截了多少。
  - 检查不是拦路的事件，`d-boards-as-hooks` 里「超时或崩溃时放行还是拦下」那一项对它不适用：检查从不拦任何调用。超时的结局、给 agent 的话、记录与展示都按 §6.3.1。
- `{files}` 的展开用 `fillCheckArgv`（§6.1.2，纯函数）：每个对得上的改动文件一项，相对 `cwd`、正斜杠，以 `-` 开头的名字前加 `./`；路径里有换行或 NUL 的文件不进参数表，提醒里写「跳过 <文件>：路径里有换行」；整条命令行不超过 28,000 个字符，放不下的文件丢掉并在提醒里写「还有 N 个文件没查」。不加任何引号：参数直接到程序手里。L2 用真实子进程：路径含 `$(echo pwned > x)`、反引号与 `%PATH%` 的文件名原样到夹具程序的 `process.argv` 里，跑完不产生 `x`；`argv[0]` 为 `pwsh` 且带 `{files}` 的检查行被 `checkLineRefusal` 拒绝；以 `-` 开头的文件名到程序手里是 `./-x.ts`。
- 同一步的各项检查并行；全进程（所有会话合起来）至多同时 2 个检查进程，其余排队（M4 自己管，`direct` 一路不替它排队）。排队有三条规矩（评审第 3 轮 N17：`check_limit` 把一项检查的上限调到 600 秒之后，一项卡住的检查会占一个名额十分钟，两项就占满，其余检查没开始跑，没有超时，也没有任何消息）：
  1. 上限被调高的检查（现在生效的上限高于 `CHECK_TIMEOUT_CAP_MS`，§6.3.1）合起来至多占 1 个名额：已经有一项这样的检查在跑时，第二项留在队里，不挡在它后面的普通检查；普通检查每个至多跑 `CHECK_TIMEOUT_CAP_MS`，所以另一个名额最迟 60 秒后一定空出来。按到达顺序开始，被跳过的那一项留在队里原来的位置。
  2. 还没开始跑的检查，这一步的提醒写出来：`eslint has not started: it is queued behind 2 running checks. Its result arrives in a later step.`（数是排在它前面的、正在跑的检查数）。这是步里等待的结局，不是失败：不计入连续失败，不写超时记录。
  3. 排队超过 `CHECK_QUEUE_WAIT_MS`（`3 × CHECK_STEP_DEADLINE_MS`，60 秒）仍没开始的检查不再等：不起进程，写一行 `QueueLine`（§6.3.1，结局「没跑」），提醒写 `eslint did not run: it waited 60 s behind 2 running checks and was dropped. It runs again after your next edit.`，`recordRun` 记 `failed`、`reason: '<检查名>: queue 60s'`，晨报「检查的超时」一节列出，不计入连续 3 次失败。这条规矩和名额数一起写在循环板页「改完文件就跑检查」展开的 `ownRules` 第五行（§6.8，评审 finish2 轮 N21），不只在提醒和晨报里。这个数是 agent 定的，可推翻（§16）：它取 3 倍的一步等待，是因为再长的排队，结果送到时改动多半已经过时。
- 日志写进 `<项目目录>/env-checks/<会话 id 前 8 位>/<时间>-<检查 id>.log`（`logFile`）：第一行是展开 `{files}` 之后的完整参数表（`$ ` 加上每一项，含空格的项加双引号，只为人读，不再交给任何 shell）与执行器解析出的程序路径；之后是标准输出与错误。项目目录不在时不写日志，提醒里写「没有日志（没有项目目录）」。目录不用 `checks/`：本仓库的 `scripts/check-lint.mjs` 把 jscpd 的报告写进 `.llm/checks` 并在之后整个删掉（`JSCPD_REPORT_DIR`），放在那里的日志每跑一次 `npm run lint` 就没了。
- 缓存：同一文件的大小与修改时间没变、检查行的内容没变（节点的 `rev` 没变）时不重跑同一项检查。
- 轮转：env 行激活时删掉 `<项目目录>/env-checks/` 下修改时间超过 7 天、且名字是 8 位十六进制的会话目录；名字不合的不碰。
- 等待：步 notice 最多等多久按 §6.3.1。没跑完的检查继续在后台跑，结果按会话留在内存里，下一步的 notice 带上；还在排队、没开始跑的检查，notice 写排队（上面第 2 条）；进程重启后丢失，下一次改动再查。

#### 6.3.1 超时（`d-timeout-measured`，D-timeout，人 2026-10-31 已定）

人的原话：「超时那就这样定。不过还是我说的现在拿不准的事情，要做到优雅失败以及可追溯性」。这一小节是 M4 自带检查器的超时规则在设计里唯一的写处：别的节只写「按 §6.3.1」，不重复数字；`ownRules` 与工具说明里的数字由下面的常量生成。范围是 M4 自己跑的检查。harness 自己起的 `git` 命令（改动行、`ls-files`、`check-ignore`，各 5 秒）不是 agent 写的检查，不在此列，仍是固定值。人加的检查条目的超时归循环板的执行器，同一条规则对它适用，由循环板的设计写一处（§18）；M4 只把检查行里的预计秒数随 `checkCommandOf` 交给它（§6.1.2）。

**取值。**

1. 超时一律等于 3 倍运行时间，不低于下限、不超过上限（最大值）：超时 = `CHECK_TIMEOUT_FACTOR`（3）× 运行时间，下限 `CHECK_TIMEOUT_FLOOR_MS`（5 秒），上限 `CHECK_TIMEOUT_CAP_MS`（60 秒）。下限写在上限旁边是编排方 2026-10-31 的细化裁定（每份设计把自己的下限写在自己的最大值旁）；5 秒的下限保留，理由是冷启动与杀毒扫描会让一个平时 1 秒的检查偶尔慢几秒，3 倍之后不到 5 秒的值只会因机器抖动超时。
2. 运行时间怎么来。第一次由写检查行的 agent 估：检查行里的 `<预计>`（§6.1.1）；接管项目时是试跑用的实际时间。检查行没写预计时，没有可乘的数，第一次的超时直接取上限。跑过之后由 harness 定，LLM 不手抄实测数（harness 手里本来就有）：运行时间取最近 `CHECK_RECENT_RUNS`（10）次里最慢的一次耗时。没有实测之前，把预计当作「最慢的一次」。检查行里的预计跑过之后不回头改（验收条件批准之后只有人能改，也没有必要）。
3. 人批准工具节点时看到的是超时，旁边写它从哪个估计算出来（`timeoutText`，`src/env/timeout.ts` 的纯函数，用第 1、2 条的常量算，不手写）。四种情形，文字不超过 40 个码点（合 M3 四行里一行的上限，`PROPOSAL_LIMITS.line`），例：估 3 秒 → `超时 9 秒（估 3 秒，乘 3）`；估 1 秒、3 倍不足下限 → `超时 5 秒（估 1 秒，乘 3 不足 5 秒）`；估 25 秒、3 倍超过上限 → `超时 60 秒（估 25 秒，乘 3 超过 60 秒）`；没写预计 → `超时 60 秒（没有估计，先用最长的）`。`graph_propose` 与 `graph_edit` 对环境工具节点的结果，为每条读得懂的检查行附一个 `timeouts` 数组（`[{check, text}]`，harness 写，改 `src/graph/tools.ts`，归 E3）；两个工具的说明要求主 Agent 把 `text` 原样放在它给人看的方案里、检查行的旁边。这一步靠说明，没有硬核对：M3 对 `rules:`、`loops:` 提议已有的「给人看过原文」核对（`detail.mustShow`）还没有覆盖环境工具节点，请求在 §18 第 5 条的 `m3` 一条（评审第 2 轮 N12），每条 `text` 已经是一个现成的、不超过 40 个码点的字串，可以直接当 `mustShow` 的一片。给人看的方案如果是四行的提议，`text` 放进背景一行或「附」，它的长度合一行的上限，所以装得下；`propose_to_human` 放不下时的请求在 §18 第 5 条的 `m3` 一条，放得下之前以工具结果里的字段为准。
4. 一步最多等多久：取这一步要跑的检查里最大的超时与 `CHECK_STEP_DEADLINE_MS`（20 秒）中小的那个。超时调高不会让一步等得更久：慢一些的检查在后台继续跑，结果在之后的步里送到。
5. 「最近几次」只数结束了的运行：进程自己退出的一次（不论退出码）记它的耗时；因超时被结束的一次按「不短于当时的上限」记，值取当时的上限，所以预计估得太低、或输入变大了之后，下一次的值是上一次的 3 倍，最多长到上限。命令（`argv`）改过之后旧的实测不再用，从预计重新开始（记录按 `argv` 的摘要分开）。
6. 3 倍超过上限时保持上限，harness 不自己抬高，并且只告诉主 Agent，由它自己处理，不问人（编排方 2026-10-31 的细化裁定）。「不问人」指调高上限：那是主 Agent 的决定，用 `check_limit`，不需要人批准。拆小、收窄检查是改检查行，验收条件批准之后只有人能改（§6.1、§16），所以那一条路照常要人批准，提醒里照实写，不把它说成不用问人（评审第 2 轮 N10）：记录里写明「想要 X 秒，被上限截在 60 秒」；环境提醒（§7.2）只给根 agent（会话头不带 `origin: 'subagent'`）加一行，只在这个状态变化时注入。第一次的值来自估计时（还没有实测）：`Check eslint is held at its ceiling of 60 s: three times your estimate (25 s) would be 75 s. Raising this check's ceiling is your decision and needs no approval from the human: call check_limit with check "tool-3/eslint", seconds (61 to 600) and a reason. Making the check cheaper or narrower means changing its check line, which is a tool-node change and needs the human's approval as usual.` 引号里的键由工具节点 id 与检查名拼成（`<节点 id>/<名字>`，与 `check_limit` 的 `check` 参数、`timing.jsonl` 的键是同一个写法），主 Agent 照抄就是合法的参数，不会得到 `unknown_check`（评审第 3 轮 N16）；两个工具节点各有一项叫 `lint` 的检查时，两行提醒的键不同。来自实测时把 `your estimate (25 s)` 换成 `its slowest recent run (24 s)`，`75 s` 换成 `72 s`（N8）。子 agent 与 M7 的 worker 不收这一行，它们自己那次超时的提醒（优雅失败一节）写明「这一项已在上限，主 Agent 已被告知」，不写「问人」。

   **调高上限（设置）。** 主 Agent 处理第 6 条的办法之一是把这一项检查的上限当作一个可撤回的设置调高：工具 `check_limit`（env 行注册，实现在 `src/env/limit-tool.ts`，只有根 agent 能调，所有路由都有）。GLM 上它延迟、不常驻：`src/shared/tool-names.ts` 文件头写明，不在 `ORCHESTRATION_RESIDENT_TOOLS` 里的编排工具默认按延迟处理，所以这里不往常驻名单里加；名字登记在 `ENV_TOOL_NAMES = ['check_limit']`（同一个文件，E3 加），`tests/contracts.spec.ts` 把它钉到注册上（§2.2）。参数，其他字段不收（`invalid`）：

   | 字段 | 必填 | 类型与上限 | 不合法时 |
   | --- | --- | --- | --- |
   | `check` | 是 | `<工具节点 id>/<名字>`，必须是现在读得懂的已批准检查行 | `unknown_check`，`hint` 列出现有的 |
   | `seconds` | `raise` 时必填 | 整数，`CHECK_TIMEOUT_CAP_MS` 以上、`CHECK_TIMEOUT_RAISED_MAX_MS` 以下，即 61–600 秒，并且高于这一项现在生效的上限（600 秒是 agent 定的硬顶，与拦路脚本放行后在后台至多再跑的 10 分钟同一个量） | `invalid`，`hint` 写现在生效的上限 |
   | `reason` | `raise` 时必填 | 1–300 字符，写为什么。原样写进 `limits.jsonl`，并出现在循环板页与晨报上给人看，所以要用人的话写：过 `plainWordsIn`，不为空就 `invalid`，`hint` 列出换词 | `invalid` |
   | `action` | 否 | `raise`（缺省），或 `reset` 恢复缺省上限（此时 `seconds` 与 `reason` 可不写） | `invalid` |

   描述（给模型）：`Raise or reset the time limit of one check that runs after your edits, when that check is held at its ceiling (the environment notice tells you when). Pass the check as <tool node id>/<check name>, the new limit in seconds (61 to 600) and why. The reason is shown to the human on the loop board and in the morning report, so write it in the human's language and in plain words. It works only on a check that is held at its current ceiling now, or was stopped at it within the last 7 days. A subagent cannot call it. To undo it, call it again with action "reset". Example: check_limit {"check": "tool-3/eslint", "seconds": 120, "reason": "整个项目跑带类型信息的规则，在这台机器上要 40 秒左右"}`

   示范（`d-agent-examples`，评审第 2 轮 F12）：例子的检查是 ESLint，领域与练习题无关。`reason` 是主 Agent 写、原样给人看的东西，所以示范要过真输入同样的检查：L2 把它交给上面的参数检查，`reason` 过 `plainWordsIn` 为空，不含练习题领域的词（词表同 §14.2 F20 一条），数或字段一改这一例跟着失败。示范写成常量 `CHECK_LIMIT_EXAMPLE`，描述里的例子由它生成。

   检查顺序，第一条不成立就抛错（文本为 `{code, message, hint}` 的 JSON）：
   1. 调用方是根 agent（会话头不带 `origin: 'subagent'`），否则 `forbidden`，`hint`「a subagent cannot change check limits: report to the main agent」。
   2. 参数合法（上表），否则 `invalid`。
   3. `check` 在读得懂的已批准检查行里，否则 `unknown_check`。
   4. `raise` 时这一项现在必须被当前生效的上限截住，否则 `not_held`（没有被截住的检查没有可调的，免得顺手把所有检查都放宽）。「被截住」指下面两样有一样成立，而且都只数晚于 `limits.jsonl` 里这一项最后一行（`raise` 与 `reset` 都算；没有这样的行就不设下限）的记录：这一项最近一条 `value` 记录带 `capped`；或有一条 `timeout` 的 `limitMs` 等于当前生效的上限、且发生在最近 7 天内。所以调高（或 `reset`）之后，原来上限处的旧超时不再算数，要在新的上限处再被截住或再超时一次才能再调（评审第 2 轮 N9）。`reset` 不要求被截住，但这一项现在没有设置时返回 `noop`，什么都不写。
   5. 写 `limits.jsonl` 失败 `unavailable`，`hint`「tell the human the limit could not be changed (<错误码>); you can try again or narrow the check」。

   成功返回 `{outcome: 'raised' | 'reset' | 'noop', check, capS, previousCapS, message}`。设置只调这一项检查的超时上限，不改一步最多等多久（第 4 条），不改别的检查。效果：之后这一项检查的 `checkTimeout` 以设置值为 `capMs`；撤回就是 `reset`，或人说一句话由主 Agent 调 `reset`。
   `<项目目录>/env-checks/limits.jsonl`（只追加，不进 git，取决于这台机器跑得多快）每行 `{at, check, action, capS, previousCapS, reason, session?}`，一项检查的设置以它最后一行为准（`reset` 行的 `capS` 是缺省上限 60、`reason` 可空，最后一行是 `reset` 就等于没有设置）；坏行跳过并计数，读不出按没有设置处理。调高写在 `value` 记录的来源里（`cap: {by: 'setting', capS, at, reason}`，没设置时 `cap: {by: 'default'}`），循环板页的明细与晨报「检查的超时」一节都写出「上限已调高到 <n> 秒：<理由>」，所以人能看见、能说一句话撤回。没有为这个设置再加保护规则：它只影响这台机器上一项本机检查最长跑多久，上限 600 秒，每一次调高都有记录和理由；子 agent 用文件工具手改这个文件不会被拦，但效果和记录一样可见（残余，§15）。

**优雅失败。**

- 超时不让行崩、不丢工作：进程树被结束，日志留着，别的检查的结果照常交，agent 已经改好的文件不受影响；env 行不报错、不降级（降级只因跑不起来与输出读不懂，§6.5）。
- 结局按检查的性质：检查不拦任何调用，所以结局是「没跑完」：结果交给改文件的那个 agent（`d-boards-as-hooks` 允许「条目指定的 agent」，改文件的人是它，它能立刻修），下一次改动照常再跑，不计入「连续 3 次失败后本会话不再跑」（那一条只给每次结果都一样的失败，§6.5）；同一项检查上一次还在后台跑时这一步不起第二个，等它的结果。拦路的结局（放行并在后台接着跑到 10 分钟，晚到的「不行」告诉主 Agent；主干前进之前的超时缺省拦下，`d-script-timeout`）是循环板、规则板的脚本和 M7 的合入前检查的，M4 的检查没有。规则板拦路脚本的数是默认 10 秒、最大 30 秒（规则板 0.10），在 `d-timeout-measured` 下超时是 3 倍运行时间，不超过最大 30 秒（编排方 2026-10-31 的更正：封顶的是最大值 30 秒，不是默认值 10 秒），下限同样写在最大值旁边，这些由规则板那一侧写一处（§18）。
- 给 agent 的话写明是哪一项检查、上限多少、跑了多久、接下来怎样：`eslint did not finish: stopped after 12.1 s (limit 12 s, three times its slowest recent run of 4 s; log …). It runs again after your next edit, with a limit of 36 s.` 「接下来的值」就是按第 5 条算出的下一次的值，不是猜的。下一次的值已经在上限时改写最后一句：`It is at its ceiling of 60 s; the main agent has been told.`（不写「问人」，第 6 条）。这条话的四样内容（检查名、上限、实际耗时、接下来怎样）加日志路径就是「消息写明条目、上限、耗时、下一步」的要求，L2 逐字钉住。
- 估错只影响下一次的值：估得太低，第一次超时，下一次是 3 倍；估得太高，只是第一次等得久，跑过一次就降下来。
- 超时值的账读不出（文件不在、坏行、权限）：按没有实测处理，用预计或上限，检查照跑，行健康写明。

**可追溯。** `<项目目录>/env-checks/timing.jsonl`（只追加，不进 git）有五种行（`run`、`value`、`timeout`、`estimate`、`queue`），检查的键是 `<工具节点 id>/<名字>`，另带命令摘要（`argv` 的 SHA-256 前 8 位）：

```ts
/** A run that ended by itself, or was cut at its limit (censored: true; ms is then the limit). */
interface RunLine { kind: 'run', at: string, check: string, argv: string, ms: number, censored?: true }

/**
 * An estimate on a check line was written or changed. The graph history entry has no session field
 * (src/graph/schema.ts HistoryEntry: at, actor, op, reason, relay, changes ...), so src/graph/tools.ts records the session here
 * when graph_propose or graph_edit returns the `timeouts` of §6.3.1 item 3. `actor` and `historyAt` copy the history entry the
 * engine just wrote.
 */
interface EstimateLine {
  kind: 'estimate', at: string, check: string, argv: string, estimateS: number,
  node: string, actor: 'llm' | 'human', historyAt: string, session?: string
}

/** A timeout value took effect. */
interface ValueLine {
  kind: 'value', at: string, check: string, argv: string, limitMs: number, previousMs?: number,
  /** The maximum that applied: the constant, or the main agent's setting (check_limit). */
  cap: { by: 'default' } | { by: 'setting', capS: number, at: string, reason: string },
  /** Set when three times the run time was above the maximum and the value was held there. */
  capped?: { wantedMs: number },
  source:
    | { by: 'estimate', node: string, rev: string, actor: 'llm' | 'human', at: string, session?: string, estimateS: number }
    | { by: 'harness', runs: number[], factor: number, floorMs: number }
    | { by: 'ceiling' }              // no estimate and no run yet: the maximum
}

/** A check was stopped at its limit. */
interface TimeoutLine { kind: 'timeout', at: string, check: string, argv: string, limitMs: number, elapsedMs: number, session?: string, outcome: 'not-finished' }

/** A check waited CHECK_QUEUE_WAIT_MS for a process slot and was dropped without running (§6.3). */
interface QueueLine { kind: 'queue', at: string, check: string, argv: string, waitedMs: number, running: number, session?: string, outcome: 'not-run' }
```

- 来源：估计的来源怎样记（评审 F9）。①选哪条历史：读该节点的图历史，取最后一条 `op: 'edit'` 且 `changes.acceptance.to` 含这一整行检查行的条目；没有这样的 `edit` 就取 `op: 'propose'` 的那一条（`propose` 的历史不带 `changes`，检查行就在节点创建时的验收条件里）。②记什么：节点 id、那条历史的 `actor` 与 `at`、读取时该节点的版本 `rev`（图的修订表，不是历史字段）。`actor` 取历史里的值，不写死 `agent`：验收条件批准之后只有人能改，批准之后改过 `<预计>` 的那条 `edit` 的 `actor` 是 `human`，来源因此记成人改的。③会话：图历史没有会话字段，`src/graph/tools.ts` 在 `graph_propose`、`graph_edit` 返回前把会话 id 写进 `EstimateLine`（`timing.jsonl` 里，与 `ValueLine` 同一份账），`ValueLine` 的来源按 `node` 与 `historyAt` 找到它并带上 `session`；找不到（节点是别处改的，例如手改文件、命令行，或 M4 合入之前建的）时不写 `session`，页面与晨报写「会话未记」，不猜。harness 调整的，记依据的那几次运行的耗时、倍数、下限；`capped` 记想要的值。每次取值变化写一条 `ValueLine`，带旧值与时刻；每次超时写一条 `TimeoutLine`（检查、上限、实际耗时、结局）。
- 整理：env 行激活时重写一遍，每个键只留最近 `CHECK_RECENT_RUNS` 条 `run`、最近 20 条 `value`、`timeout` 与 `queue`、最近 5 条 `estimate`（临时文件加改名，失败就不整理）。
- 看得见：循环板页的明细（`details`，§6.8）每个检查多一行「超时 <n> 秒 · <来源一句话> · 原 <m> 秒」，上限被调高的再加「上限已调高到 <k> 秒：<理由>」；晨报多一节「检查的超时」，每个检查一行：当前值与来源（估计的带谁估的、会话未记时写明）、近 7 天超时几次（最近一次的上限与实际耗时）、排队太久没跑几次（`queue`）、被上限截住的写明、上限被调高的写理由（§3.10）；E3 另交一条指标事件（§3.11）。

**常量**（`src/env/timeout.ts` 导出，`ownRules`、`timeoutText` 与说明里的数字由它们生成，本节之外的地方引用这一节，不重复数）：`CHECK_TIMEOUT_FACTOR = 3`、`CHECK_RECENT_RUNS = 10`、`CHECK_TIMEOUT_FLOOR_MS = 5_000`、`CHECK_TIMEOUT_CAP_MS = 60_000`、`CHECK_STEP_DEADLINE_MS = 20_000`、`CHECK_TIMEOUT_RAISED_MAX_MS = 600_000`（调高设置的硬顶）、`CHECK_QUEUE_WAIT_MS = 3 * CHECK_STEP_DEADLINE_MS`（排队的等待上限，60 秒）、`CHECK_SLOTS = 2`、`CHECK_RAISED_SLOTS = 1`（`src/env/runner.ts` 导出）。倍数 3 与 60 秒、20 秒两个值来自人 2026-10-31 的原话与编排方的裁定；下限 5 秒是编排方 2026-10-31 细化裁定里保留的 M4 下限，写在上限旁；「harness 不自己抬高，3 倍超过上限只告诉主 Agent」是人定的，抬高只经主 Agent 的设置（`check_limit`）。纯函数 `checkTimeout({estimateS?, recentMs, factor, floorMs, capMs}) → {limitMs, basis, capped?: {wantedMs}}`（没有估计也没有实测时 `limitMs` 就是 `capMs`）与 `timeoutText(estimateS?) → string` 放在同一个文件，L2 钉住（§14.2）。

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
- 检查跑不起来、输出读不懂时，那一项写成 `eslint did not run: <原因的第一行> (log …)`；超时的写法与含义见 §6.3.1（`eslint did not finish: stopped after 12.1 s (limit 12 s, …)`）；还在排队的写成 `eslint has not started: it is queued behind 2 running checks. Its result arrives in a later step.`，排太久被丢掉的写成 `eslint did not run: it waited 60 s behind 2 running checks and was dropped. It runs again after your next edit.`（§6.3，N17，两句都不计入连续失败）。
- 同一项检查在一个会话里因跑不起来或输出读不懂连续失败 3 次后，本会话不再跑它，notice 写一次「eslint skipped for this session after 3 failures (log …)」，行健康写明，`recordRun` 记 `skipped`；超时不计入这 3 次，下一次改动照常再跑（§6.3.1）。
- 检查行读不懂、或节点不再是已批准的，这一项不跑，行健康写明；不提醒模型（它改不了批准之后的验收条件）。人加的检查条目的命令在节点上改过时不跑、要人再同意，那是循环板的事（循环板页面写「命令改过，等你再同意」，循环板 0.6 §6.6）。
- 每项检查的名字用检查行的 `<名字>`（例 `eslint`、`tsc`）；notice 的 `source.checks` 记这次查到的最后一个工具调用 id 与各检查 id（`<工具节点 id>/<名字>`）的计数。

### 6.6 没有检查器时

改动文件没有被任何自带的检查（带 `when` 的检查行）覆盖时，每个会话每种扩展名在检查结果 notice 里加一行（只一次）。给主 Agent：`No check covers .py files in this project. Propose a tool node under the env branch with graph_propose and put the check line in its acceptance conditions, for example: check ruff lines 3s $ ruff check --output-format concise {files} when *.py. The 3s is your estimate of one run; the time limit is three times it, and the human sees that limit and the estimate it came from next to the command when approving the node (graph_propose returns the sentence: put it in your plan). After real runs the harness sets the limit from the measured times. The community default for Python is ruff. The check runs after your edits once the human approves the node. If you want a check to run another way (on a different trigger, with its result sent to the main agent), propose a loop board entry that points at the line with loop_propose.`；给子 agent：`No check covers .py files in this project; mention it in your final result so the main agent can propose one.`（`graph_propose` 的节点要人批准；`loop_propose` 只有主 Agent 能用，循环板 0.6 §7.3）。这一行同时是检查行的示范（`d-agent-examples`，F20）：主 Agent 写检查行时读到的就是它，例子的领域是 Python 项目的 ruff，与练习题无关；L2 让它过 `checkLineRefusal` 与 `splitArgs`，语法一改示范跟着失败。默认方案取自 `docs/ORCHESTRATION.md` §7.5 的表（`.py` ruff；`.go` go vet；`.rs` clippy 的 `--message-format short`；`.sh` shellcheck `-f gcc`；`.c`、`.cpp` clang-tidy；`.ts`、`.js` tsc 与 ESLint）。这就是 §7.5 说的那件要人定的事：主 Agent 把它放进下一批交给人的事里（`d-chat-not-cards`、`d-design-onepage`），人批准节点之后下一次改动就跑。循环板不在时这一行写「No checks run in this project: the loop board is not enabled.」，每个会话一次。

### 6.7 告警棘轮与压制注释数

`docs/ORCHESTRATION.md` §7.6 的四条在 M4 之后由这些地方守：

| §7.6 | 谁守 |
| --- | --- |
| 新增告警一律拦下，基线只减不增 | 每次改完的回传只给新发现（§6.4，本仓库的批量压制）；汇合门禁跑项目的检查命令（M7 `norm-merge-gate`；本仓库的 `npm test` 含 `npm run lint`，棘轮在 `scripts/check-lint.mjs`） |
| 压制注释写理由并挂节点 | `suppression-reason`（§4.3），启用即拦 |
| 把检查配置改松走决策卡 | `checker-config`（§4.4），启用即拦，被拒的写入经申报（§5）；删掉或改松一项自带的检查是改工具节点的验收条件，批准之后只有人能改；删掉或改动一项人加的检查是改循环板上的条目，只能经主 Agent 在对话里提、人同意（§6.1，循环板 0.6 §7.1） |
| 压制注释总数单独作为一项指标 | 下面的计数 |

压制注释计数（`src/env/suppressions.ts`，任务 `m4-suppressions`）：env 行每天第一次跑检查时（或第一次给某个仓库的会话装 notice 时），对仓库的已跟踪文件（`git ls-files -z`，跳过大于 1 MiB 的与二进制的）按 `SUPPRESSION_MARKERS`（§4.3）计数，追加 `{at, repo, total, byMarker}` 到 `<项目目录>/audit/suppressions.jsonl`；同一仓库同一天（UTC+8）只记一次；指标服务在时同时交一条计数事件（§3.11）。晨报「例外」之后加一行「压制注释 N 处（本期 +a / −b）」，取本期第一条与最后一条。计数在后台跑，不阻塞任何一步；失败只记行健康。

### 6.8 交给循环板的两项（`d-rules-visible`，评审第 3 轮 F11）

`d-rules-visible`（人 2026-10-30「没问题，项目所有规则确实应该都在明面上」）把改完文件就跑的检查器放到循环板，循环板 0.6 已写好它那一侧（§2.4 第 3–5 行、§4.4、§5.3 第 15、16 项、§17 M4 一节）。env 行与图行各交一份：

| | env 行（`src/env/loop-entry.ts`） | 图行（`src/graph/loop-entry.ts`） |
| --- | --- | --- |
| 来源 | `{plugin: 'dsh-hourness', row: 'glm-hourness/env'}` | `{plugin: 'dsh-hourness', row: 'glm-hourness/graph'}` |
| 事件 | `env.files-edited`（「一个 agent 改了文件」；字段 `files`，`strings`，筛选 `paths`；`root`，`string`；`truncated`，`boolean`，筛选 `is`；人能选，`personSelectable: true`，不是 `listedOnly`）：env 行每步算出改动文件之后经 `emit` 交进收件箱（§6.2），人加的条目听它；M4 自带的那一项不读收件箱，在那一步之前当场跑 | `graph.third-reopen`（「同一件活第三次重开」；没有字段；只供列出，`listedOnly`） |
| 条目 | `env.checks-after-edit`：`title`「改完文件就跑检查」，`why`「改完文件马上知道有没有新问题」，`when` 为 `env.files-edited`，`action` 为 `{kind: 'self', does: '跑这个项目里批过的检查，结果在那个 agent 的下一步交给它', by: 'glm-hourness/env'}` | `graph.third-rework`：`title`「同一件活第三次返工之前：停下问你」，`why`「同一处反复修不好，常常是问题没找对」，`when` 为 `graph.third-reopen`，`action` 为 `{kind: 'self', does: '在这件活下面提一件要你定的事，由主 Agent 在对话里问你', by: 'glm-hourness/graph'}` |
| `ownRules`（「<名字>自己的规矩」，由常量生成，不另写数字） | 五行（评审 finish2 轮 N21 加了第五行，上限 6 行）：「一步最多等这一步所有检查超时里最长的那个，不超过 <CHECK_STEP_DEADLINE_MS/1000> 秒，跑得慢的在之后的步里送到」「每项检查的超时由系统按最近几次的实际耗时定：最慢一次的 <CHECK_TIMEOUT_FACTOR> 倍，不低于 <CHECK_TIMEOUT_FLOOR_MS/1000> 秒、不超过 <CHECK_TIMEOUT_CAP_MS/1000> 秒；超时算没跑完，下一次改动照常再跑」「跑不起来或输出读不懂连续 <CHECK_FAILURE_LIMIT> 次后，这个会话不再跑那一项」「改了没有检查覆盖的语言的文件时，每个会话每种语言提醒 <MISSING_CHECK_NOTICES> 次」「同时最多跑 <CHECK_SLOTS> 项检查；排队超过 <CHECK_QUEUE_WAIT_MS/1000> 秒的这一次不跑，下一次改动再查」（拼出来是「同时最多跑 2 项检查；排队超过 60 秒的这一次不跑，下一次改动再查」，33 个码点） | 一行：「LLM 第 <REOPEN_LIMIT> 次重开同一件活时问你；你答过之后再数 <REOPEN_LIMIT> 次」 |
| `details(entry, project)` | 本项目每条带 `when` 的已批准检查行两行：「<工具标题>：改了 <`when` 的人话> 之后跑 · <命令前 40 个码点>」与「超时 <n> 秒 · <来源一句话> · 原 <m> 秒」（来源一句话取 `timing.jsonl` 最近一条 `ValueLine`：「写检查的 agent 估 <x> 秒」「没有估计，用上限」「系统按最近 <k> 次，最慢 <y> 秒」「想要 <w> 秒，被上限截在 <n> 秒」，上限被主 Agent 调高的另加「上限已调高到 <k> 秒」，§6.3.1），至多 10 个检查、20 行，每行至多 160 个码点；读不到时返回空表。不带 `when` 的检查行不列（它们不是自带的检查） | 不给 |
| `recordRun` | 每次把检查结果交给 agent（含后台送到的那次）报一次，`entry` 是 `env.checks-after-edit`：`{cwd, entry, outcome: 'ran'（都没有发现）或 'reported'（有发现）或 'failed'（有一项没跑成、超时或输出读不懂）或 'skipped'（连续失败后不再跑）, durationMs, exits: [这次各项检查的退出码], reason?}`；有一项失败时 `reason` 写 `<检查名>: <原因>`，超时写 `<检查名>: timeout <上限>s/<实际耗时>s` | 每提一次待决报一次：`{cwd, entry: 'graph.third-rework', outcome: 'reported'}`；提议失败报 `failed`，`reason` 写引擎的错误码 |

- 交法照循环板 0.6 §3.1：各行在 `apply` 里 `ctx.inject([LOOPS_SERVICE], sub => { const r = sub[LOOPS_SERVICE].contribute(source, contribution); if (r.ok) sub.effect(() => r.dispose) })`，循环行后到或重启时自动重交，卸载时自动撤回；循环板不在时什么都不做。`inject` 对本包 `ctx.provide` 的服务不生效时（循环板 0.6 §10.2 V12 的推断不成立），照它写的退路：每次 `agent/created` 时 `loopsService(ctx)?.contribute(...)`，同一个来源再交只是替换。
- `contribute` 返回 `ok: false`、`dropped` 非空、或 `recordRun` 抛错时：控制台告警一次，行健康写明「交给循环板的 <id> 没被收下：<原因>」，检查与提问照常。
- 常量：超时相关的五个在 `src/env/timeout.ts`（§6.3.1）；`CHECK_FAILURE_LIMIT = 3`、`MISSING_CHECK_NOTICES = 1`、`CHECK_SLOTS = 2`（`src/env/runner.ts` 导出）；第五行用到的 `CHECK_QUEUE_WAIT_MS`（60 秒）同在 §6.3.1 的常量表里，随那一组导出，`ownRules` 从那里导入（N21）；`REOPEN_LIMIT = 3`（`src/graph/reopen.ts` 导出）。`ownRules` 的句子由这些常量拼出，改常量就是改板上的字。
- `recordRun` 只认 `self` 条目的 id（循环板 0.6 §3.1），M4 只报自己的 `env.checks-after-edit`；人加的检查由循环板的执行器自己记（`loop-fired`、`loop-done`），M4 不报、也不需要循环板为 M4 加认人的条目的接口（0.4 §18 第 5 条的第 ④ 点作废）。
- L2 契约测试（`tests/env-loop-entry.spec.ts`、`tests/graph-loop-entry.spec.ts`）：两份交来的内容交给循环板的 `src/loops/model.ts` 校验，全部被接受，`ownRules` 恰好五行（N21），每一行等于由常量拼出的句子（第五行是「同时最多跑 `CHECK_SLOTS` 项检查；排队超过 `CHECK_QUEUE_WAIT_MS/1000` 秒的这一次不跑，下一次改动再查」，把常量改成别的值，测试里的期望句子随之变），长度在循环板 0.6 §2.1 的上限内（至多 6 行、每行至多 80 个码点）。它要导入循环板的模块，所以由 E3、R1 与循环板 S1（`src/loops/trigger.ts`、`model.ts`）里后合入的一方加；先合入的 M4 一侧只测自己那份的形状（字段齐、长度在上限内）。L4：走查一次循环板页面（§13.4 第 8 项）。

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
One-off scripts go in .llm/scratch/ (git-ignored). Delete them or promote them (create them again under scripts/ with the write tool and give them a graph node) before you hand back.
</system-reminder>
```

- 每个工具一行：标题、id、`用法：` 的第一行。至多 12 个工具、1500 字符，多出的写「N more: graph_show env」。
- 检查一行：本项目 M4 自带的检查（已批准工具节点上带 `when` 的检查行，§6.1.1）的名字与适用范围，以「; 」连起来，至多 300 字符；没有这样的检查行时写「No checks run after edits in this project yet.」；循环板不在时写「No checks run after edits: the loop board is not enabled.」。人加的检查是循环板上的条目，结果由循环板送给主 Agent 或改文件的会话，不在这一行里（M4 不读那些条目）。检查行变了（增删、节点的 `rev` 变）也算环境变化，下一步重新注入。
- 超时被上限截住的检查（§6.3.1 第 6 条）：每个这样的检查一行，文字按 §6.3.1 第 6 条（值来自估计与来自实测各一种写法，N8；写明调高上限是主 Agent 自己的决定、不用人批准，收窄检查行本身要人批准，N10），只给根 agent，也就是主 Agent；会话头带 `origin: 'subagent'` 的子 agent 与 M7 的 worker 不收这一行（它们没有办法抬高上限，也不能问人，F8）。只在这个状态变化时重新注入（算作环境变化）；没有这样的检查时没有这一行。
- 图里没有 `env` 时只有草稿区一行。图行不在或会话没有图目录时同样只有这一行。
- 不分路由；子 agent 也收到（它们同样会写脚本），除上一条的上限提醒只给根 agent。

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
| H1 | `tools/pre-execute` 瀑布 `(exec, next)`，决策 `allow` / `deny{reason}` / `ask` / `cancel`；`deny` 的结果是 `Error: ` 加理由，工具体不执行 | guard 的判定、撤下、放行、跟进 | tools:3320–3321（瀑布）、3322–3355（决策与 `post-result`）〔实读〕 | 已在用（`docs/DESIGN.md` §2.4a） |
| H2 | `exec` 的 `name`、`arguments`（深冻结）、`agent`、`parent`、`callId` | 签名、目标、跟进 | tools:3229–3260、3263 | 已在用 |
| H3 | `ask` 决策交给宿主的审批；`userQuestions.ask` 与客户端的问答卡 | 不用：`d-chat-not-cards` 之后申报在对话里问 | tools:3321–3326；user-questions:530–535、668–686；client-ui-user-questions client.js:672–686、783–795、924–931（0.2 的 H3、H9、H9a） | 实读，不用 |
| H4 | `agent/pre-step` 瀑布，`{agent, messages, turn, step, signal}`；`messages` 是这一步从收件箱领出的消息（`inbox.claim`）；追加的 notice 与 `createUserMessage` 同形 | env 的两条步 notice；申报读人的回话（§5.5） | agent-loop:902–925〔实读〕；llm:37–66；共享接缝 `src/shared/step-notice.ts`（`admitted` 即 `decision.messages`） | 已在用 |
| H5 | `session.deriveMessages()`：助手消息里的 `tool-call` 块（`id`、`name`、`arguments`）与工具结果（`toolCallId`、`isError`）；消息带创建时的 `source` | 推出本步改过的文件；核对人回话之前的最后一条助手消息 | session:1672–1686；session:862–868、1217–1218；`toolCallArguments`、`toolCallOutcomes`；`src/shared/dsh-min.ts` `DerivedMessage.source` | 已在用（todo 提醒） |
| H6 | `session/event`：`tool/call` 的 `{turn, step, callId}`、`turn/end` 的 `{turn, reason}`；`session/disposed` | 跟进的步号与 `none` | agent-loop:681–690、1029–1032；session:1929–1933〔实读〕 | `session/event`、`session/disposed` 已在用（工作区变更兜底） |
| H7 | `workingDirectory.get(session)` | 解析相对路径 | working-directory:76–78 | 已在用 |
| H8 | 会话头 `cwd`、`origin: 'subagent'`、`parentSession` | 圈禁根、子 agent 判断、派发链 | session:1820–1826、1051–1053；subagent:346–355 | 已在用 |
| H10 | `tools.register(definition)`：参数与输出 schema 在校验子集内 | `request_exception` | tools:2974–2984；子集见 `docs/ORCHESTRATION.md` §2.10 | 已在用 |
| H11 | `DeferredToolCall` 的内层调用经 `tools.execute`，以 `<callId>:deferred`、没有 `parent` 的根调用过 `tools/pre-execute`，看到内层名字与调用方 agent；不要求先检索，只核对目标在本请求的目录里、是延迟工具；会话历史与日志里记的是包装；包装的参数形状在 ZCode 3.17.1 不变 | GLM 上调用延迟的 `request_exception`；跟进与改动文件的拆包 | tools:3210–3212；`src/toolsearch/index.ts`:155–175〔实读〕；`reference/zcode-3.17.1/zcode.cjs` 第 132 行〔实读 2026-10-30〕；L3 探针 `glm-goal`（`docs/DESIGN.md` §2.4a）；`docs/DESIGN.md` §5.5 | L3 已核实（同类调用） |
| H12 | 文件工具参数：`write` `file_path`、`content`；`edit` `file_path`、`old_string`、`new_string`；`read`、`read_image` `file_path`；`grep` `path`；`str_replace_editor` `command`、`path`、`file_text`、`old_str`、`new_str` | 三条规则、圈禁、改动文件 | tool-fs:549–560、690–705、251–258、986–990；tool-fs-search:1090–1100；str-replace-editor:141–171、267、281〔实读 2026-10-29〕 | 实读 |
| H15 | 图行服务 `dirFor(cwd)`、`isGraphTool`；M3 加的 `focusOf(session)` | 环境分支、`config` 行；申报文字背景一行的焦点标题（读不到就省去） | `src/graph/service.ts`；M3 §2.1 | 本仓库契约 |
| H16 | 数据目录服务 `glmHournessData` 的 `userHome`、`projectHome` | 会话不在 git 仓库里时项目目录的退路（§2.4） | `src/shared/data-home.ts` | 本仓库契约 |
| H17 | `tools/post-execute` 瀑布 `(exec, result, next)`，可附 `additionalContexts`；先例 repeat-tool-reminder | 不用（§6.2 的取舍） | tools:3599–3627；repeat-tool-reminder:2247–2259 | 实读，不用 |
| H18 | ESLint 10.13 带压制文件时，被检查的文件里有用不上的压制就以退出码 2 结束，除非带 `--pass-on-unpruned-suppressions` | 本仓库的 ESLint 检查条目 | `node_modules/eslint/lib/cli.js`:497–505、`lib/options.js`:322〔实读〕 | 实读 |
| H19 | 用户角色消息的来源：DSH 客户端经接口送来的人的消息是 `source {kind: 'user', rpcId, clientTimeZone?, principal?}`；headless 任务、父 agent 写给子 agent 的任务、命令、计划模式、ACP、SDK 送来的是 `{kind: 'user'}`、没有 `rpcId`；插件的提醒带 `form: 'notice'` | 只认客户端送来的人的话作批准（§5.5）与核对撤下的原话（§3.5） | api-session-controller:3224–3229（`prompt`）；subagent:3195–3200（人在子会话里输入）、1461（父 agent 的任务）；headless:345；commands:338；plan-mode:221；acp:835；sdk-jsonrpc-server:161；DSH 自己按同一判断认客户端消息：client-file-upload:296–297〔实读 2026-10-30〕 | 实读；桌面版上的消息形状〔未核实，L4 第 1 项读会话日志核对〕 |
| H20 | 本机接口的鉴权：进程启动令牌换签名 cookie，签名密钥存在 Harness home 的凭证里 | §11 的剩余风险（shell 能否冒充客户端） | client-connection:276–301、415–445、499–522〔实读〕 | 实读 |
| H21 | `createUserNotice(kind, summary, text, facts)` 的事实字段原样存进消息的 `source`；步 notice 追加的消息随这一步提交进会话日志 | 申报的关闭与作废提醒（§5.5 末段），面板与重启之后的核对读它 | `src/shared/dsh-min.ts`:462–469〔实读〕；agent-loop:1066–1073（领出的消息在 `step()` 里写进会话） | 本仓库契约与实读 |
| H22 | `dsh-goal-round-driver`：agent 空闲、goal 活着且已 arm、轮次有余时经 `followup` 排进 `source {kind: 'goal'}` 的一轮；goal 为 `blocked` 时不排 | §5.9 自动推进的停等（M7 停 goal，M4 不碰 goal） | goal-round-driver README「What each round does」、lib:144–164〔实读，评审第 3 轮〕；「`blocked` 时不排」〔推断，L3 `guard-request` 的 goal 一遍核对〕 | 推断 |
| H23 | 循环板服务 `glmHournessLoops`：`contribute`（交事件声明与 `self` 条目，含 `details`、`ownRules`）、`emit`（`env.files-edited`）、`listens`（没人听就不交）、`recordRun`（只认 `self` 条目）；共用的筛选比法 `matchesFilter`（`src/loops/trigger.ts`） | §6.1、§6.2、§6.8 | 循环板 0.6 §3.1、§4.4、§2.2、§17 M4 一节；0.4 请加的读条目函数与扩展名筛选不再需要（扩展名由 0.6 的 glob 接住，读条目的函数随人加的检查归循环板而撤回） | 本仓库契约（循环板未实现） |
| H24 | 两块板共用的执行器 `src/loops/script.ts`：`runCommand({queue: 'direct' \| 'check', project, cwd, argv, timeoutMs, maxOutputBytes, logFile})`、`resolveProgram`、`commandDetail`；不经 shell、项目目录、无凭证的环境、超时结束进程树、输出上限 | §6.3（M4 自带检查器用 `direct`）；人加的检查由循环板用 `check`（M4 不调） | 循环板 0.6 §6.6、F50、F53 | 本仓库契约（循环板未实现） |
| H25 | 项目根模块：`projectOf(cwd, home?)`、`gitDirOf(root)`、`ensureIgnored(root, directory)` | 流水按项目找目录（§2.4）、`outsideDenial` 按项目判（§5.9）、撤下记录按项目根找（§3.5）、让 `.llm/` 不进 git（§7.3） | `src/data/project-root.ts`〔实读 2026-10-30：规则板最小一片建，仓库唯一的项目根模块〕 | 已在 main |
| H26 | 规则板的 `/rules lift <id>`（人在规则板上打的命令，规则板核对人的身份）交给服务 `glmHournessLifts` 的 `setLifted`；M4 自己不注册斜杠命令 | 撤下与恢复（§3.5） | 服务的提供与读取同 `requestsService`、`pricingService` 的写法〔实读〕；规则板 0.10 §2.5 对 `/rules` 的身份假设；L3 里探针 provider 经 `commands.find` 取到处理函数、以人的身份打命令的做法见 `docs/DEVELOPMENT.md` §3 | 本仓库契约（规则板那一侧未接，等 dogfood 之后） |

## 10. 外部输入的校验

| 输入 | 必填 | 规则 | 不合法时 |
| --- | --- | --- | --- |
| `request_exception` 参数 | 见 §5.3 的表 | 同左 | 工具错误 `invalid`，不登记、不写任何东西 |
| 申报编号 | 是 | `^r-[0-9a-z]{8}$`，在内存拒绝表里，属于调用方的派发链，2 小时内 | `not_found`、`forbidden`、`expired` |
| 人的回话 | — | 来自客户端（`source.kind: 'user'` 且有字符串 `rpcId`）；紧跟在以 `tail` 结尾、没有工具调用的助手消息之后；规范化之后整句在同意词或不同意词表里 | 不放行：`not-client`、`not-shown`（申报都留着）、`unclear`（换确认句，第 3 次关闭），§5.5 |
| 工具节点的检查行（`check`，§6.1.1） | 否 | `<名字>` 合 `^[a-z][a-z0-9-]{0,23}$` 且节点内不重复；`<格式>` 三选一；`<预计>` 可选，合 `^[1-9][0-9]{0,2}s$`；命令切成 1–64 项，每项 1–2000 个字符、不含 NUL 与换行；`{files}` 只能单独作为一项、至多一处；第一项不是 `.cmd`、`.bat`；第一项的文件名是 shell（§6.1.1 的名单）时不能有 `{files}`；`when` 可以没有，有时至少一项，写法是循环板的 `paths`（`*.<扩展名>` 等） | `checkLineRefusal`（`src/env/check-entry.ts`）给出原因：这一行跳过，行健康写「<节点 id> 第 n 条检查行读不懂：<原因>」；`checkCommandOf` 对它返回 `undefined`，人加的 `check` 条目因此 `refused`（`check-missing`） |
| `checkCommandOf(cwd, tool, check?)` 的入参 | 是 | `cwd` 是绝对路径；`tool` 是节点 id；`check` 合名字的写法 | 返回 `undefined`，不抛错 |
| `fillCheckArgv(argv, files)` 的入参 | 是 | `argv` 是 `checkCommandOf` 给的那份；`files` 相对检出的根、正斜杠 | 带换行或 NUL 的路径跳过，放不下的文件丢掉并计数（`dropped`），不抛错 |
| `personTitle(title, {limit, issuesOf})` 与 `displayPath(path)` 的入参 | 是 | 图上的标题与调用的路径是数据，不信任 | 标题不合格返回 `undefined`；路径总能显示（转义、截短） |
| `outsideDenial`、`peekGrant` 的入参 | 是 | `tool` 是原生名；`args` 是对象；`base` 是绝对路径 | 不合时返回 `undefined` 或 `false`，控制台每个会话告警一次；不抛错（M7 的门照它原样拒绝）。目标在项目里（`projectOf` 相同）时 `outsideDenial` 也返回 `undefined`（F19） |
| 工具节点的 `config` 行 | 否 | 写在验收条件里（§6.1）；逗号分隔的相对路径，不含 `..` | 跳过这一项，行健康写明 |
| `guard_lift` 的参数 | 是 | 见 §3.5 的表：`rule` 在 `GUARD_RULES` 里，`liftVia` 为 `board` 的（`lift-files-only`）返回 `forbidden`；`words` 1–500 字符，本会话里最近一条用户来源的消息必须是客户端送来的人的话（带 `rpcId`，§3.5 第 4 步），`words` 是它的一段（NFKC 与空白合一之后，起止在边界上），含对应动作的意图词（词前紧挨着否定词的命中不算）、至少 4 个码点，这条消息还没换来过一次成功的撤下；`action` 缺省 `lift`；调用方是根 agent | `invalid`、`forbidden`、`not_said`、`unavailable`（§3.5），什么都不写 |
| `check_limit` 的参数 | 是 | 见 §6.3.1 的表：`check` 是 `<工具节点 id>/<名字>`，现在读得懂的已批准检查行；`seconds` 整数 61–600 且高于现在生效的上限（`reset` 时可不写）；`reason` 1–300 字符、过 `plainWordsIn`（`reset` 时可不写）；`action` 缺省 `raise`；`raise` 时这一项被当前生效的上限截住（晚于这一项在 `limits.jsonl` 里最后一行的 `capped` 值或上限处的超时）；调用方是根 agent；其他字段不收 | `forbidden`、`invalid`、`unknown_check`、`not_held`、`unavailable`，什么都不写；`reset` 而这一项没有设置时不是错误，成功返回 `noop` |
| `limits.jsonl` 的行 | — | `{at, check, action, capS, previousCapS, reason, session?}`；一项检查的设置以它最后一行为准；`raise` 行的 `capS` 在 61–600，`reset` 行的 `capS` 是 60、`reason` 可空 | 跳过并计数；读不出按没有设置处理，行健康写明 |
| `setLifted` 的入参 | 是 | `cwd` 是绝对路径；`rule` 是 `GUARD_RULES` 里的 id，或规则板的 `<行>:<id>` 写法；`action` 是 `lift` 或 `restore`；`command` 1–500 字符 | 返回 `{ok: false, code: 'unknown_rule'、'not_liftable' 或 'unavailable', message}`，`message` 列出可撤下的 id，什么都不写，不抛错 |
| `docs/guard/lifts.jsonl` 的行 | — | `LiftLine` 的形状（§3.5）；一条规则的状态是它最后一行的 `action` | 跳过并计数，行健康写「N 行读不懂」；读不出时一条都不撤 |
| `timing.jsonl` 的行 | — | `RunLine`、`ValueLine`、`TimeoutLine`、`EstimateLine` 的形状（§6.3.1）；`ms`、`limitMs`、`elapsedMs` 为有限正数 | 跳过并计数；读不出时按没有实测处理 |
| 检查器的输出 | — | §6.4 的三种格式；至多读 1 MiB | 「输出读不懂」，日志里有原文 |
| guard 行配置 | 否 | 不变（`workspaceRoots`、`rules`、`home`、`fs`） | 不变 |
| env 行配置 | 否 | `home`（字符串）、`fs`（测试注入） | 忽略不合法的项，行健康写明 |

## 11. 失败与预案

激活期（`apply`）都不抛错：env 行缺图行服务、缺数据目录服务、缺 `workingDirectory` 时照常激活，按下表降级并上报行健康（`AGENTS.md`）。

| 操作 | 失败 | 怎样发现 | 恢复 | 调用方收到 | 留痕 |
| --- | --- | --- | --- | --- | --- |
| 规则判定 | 判定器抛错 | `judge` 的 `errors` | 这条规则对这次调用放行（同今天的 fail-open） | 照常的结果 | 行健康「规则 <id> 判定出错 N 次」；控制台每条规则每个会话一次 |
| 判定上下文 | 读文件、`git ls-files` 出错或超时（5 秒） | `prepareContext` 的未知项 | 用到它的规则放行、不写拒绝记录 | 照常 | 行健康「<规则> 缺上下文 N 次」 |
| 写流水 | 没有项目目录、写入出错 | `projectJournal` 的 `violation` 返回 `'no-home'` 或 `'failed'`（§3.2；今天的 `rowJournal` 吞掉失败，调用方看不见） | 记录丢失，统计少算；拦下照常生效；配上目录或写入恢复之后新记录照常落盘，丢掉的补不回来，只补一行缺口记录说明丢了几条 | 照常 | 控制台一次（每个项目每个写入类别）；没有目录：行健康「无项目目录，违规不落盘」，不计数；写入出错：`installRuleGate` 按会话累加，用 `RowHealth.note` 把「N 条违规没有落盘」附在行健康上，恢复之后数不清零，也不被同一行的下一次 `report` 冲掉（F11、F13）；流水一侧由 `rowJournal` 记下待写的缺口，下一次写成功时在丢记录的地方补一行 `GapRecord`，会话卸载时 `flush()` 单独补写（§3.2）。写入一直不恢复、或进程在恢复之前退出时，缺口写不出，信号只剩行健康与控制台，这是同一个落点记不了「这个落点写不进」的固有残余 |
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
| 记录分类 | 流水里有读不懂的行 | `classifyRecord` 返回 `unknown` | 不算拒绝 | — | 晨报「N 行记录读不懂」 |
| 检查：命令 | 找不到程序、起不来（含解析到 `.cmd`）、退出码非 0 且输出读不懂、超时 | 执行器报的启动错误、退出码、超时 | 执行器结束进程树。跑不起来与输出读不懂连续 3 次后本会话不再跑这一项；超时的处理按 §6.3.1（不计入，下一次改动照常再跑） | notice 里一行原因与日志路径 | 日志；行健康；`recordRun` 记 `failed`（超时写 `reason: 'timeout …'`）或 `skipped` |
| 检查：结束进程树 | 执行器报告没能结束 | 执行器的结果 | 不再等它；执行器报告进程退出之后才释放并发名额 | notice 写「could not stop」 | 行健康「N 个检查进程没能结束」 |
| 检查：一步等太久 | 超过一步最多等的时间（§6.3.1） | 计时器 | 后台继续，下一步送到 | notice 写「still running」；还没开始跑的写「queued behind N running checks」 | — |
| 检查：排队太久没跑 | 名额被占满（两项调高了上限的检查卡住，或很多检查同时来），一项检查排了 `CHECK_QUEUE_WAIT_MS` 仍没开始（§6.3） | 排队计时器 | 不起进程，下一次改动照常再排；不计入连续失败；调高了上限的检查合起来只占 1 个名额，所以普通检查不会被它们整个挡住 | notice 写「did not run: it waited 60 s behind N running checks」 | `QueueLine`、`recordRun` `failed`、晨报「检查的超时」一节 |
| 环境提醒：图 | 图读不出、没有 `env` | 读图 | 环境提醒只有检查一行与草稿区一行；自带的检查读不到检查行，这一步不跑（人加的检查不受影响，它们的命令由循环板在提议时读过、存在条目里，每次跑之前再读；读不出时 `refused`） | 照常 | 行健康 |
| 草稿区忽略 | 写 `.git/info/exclude` 失败；写了之后 `git check-ignore` 仍不为 0（例如项目的 `.gitignore` 里有 `!/.llm/` 一类的反向模式） | 抛错；追加之后的复核 | 不重试，这个进程里不再追加（重启后先查已有的等价行，有就不再追加）；`scratch-only` 照常判 | — | 行健康降级「草稿区没有被 git 忽略：<原因>」 |
| 日志轮转 | 删除失败 | 抛错 | 下次激活再试；只删名字合规的目录 | — | 控制台一次 |
| 压制计数 | `git` 不可用、超时 | 抛错、计时器 | 当天不再试 | — | 行健康 |
| 规则目录与规范节点 | 不一致 | 契约测试 | 改代码或改节点 | 测试失败 | git |
| 撤下：写 `lifts.jsonl` | 权限、磁盘、目录建不出 | 写入抛错 | 不撤下，规则照拦 | 工具返回 `unavailable`，规则板一路由规则板回一句话（`setLifted` 的 `unavailable`），都写明可以再试 | 控制台一次；行健康 |
| 撤下：读 `lifts.jsonl` | 文件读不出，或有读不懂的行 | `liftedRules` 的结果 | 读不出时一条都不撤，规则照拦；坏行跳过，其余照常 | — | 行健康「lifts.jsonl 读不出」「有 N 行读不懂」 |
| 撤下：原话核对不过 | 最近一条用户来源的消息不是客户端送来的人的话（或没有这样的消息），原话不在它里面（或不在边界上），不含撤下意图词（或命中词前紧挨着否定词），不足 4 个码点，或这条消息已经换来过一次撤下 | `guard_lift` 第 4 步 | 不写；agent 在回复里问人（一句话里说了几条规则时，撤一条、请人把另一条再说一遍） | `not_said` | 会话日志 |
| 超时设置：写 `limits.jsonl` | 权限、磁盘 | 写入抛错 | 不调高，这一项仍按原上限；主 Agent 可以再试或收窄检查 | 工具返回 `unavailable` | 控制台一次；行健康「超时设置写不进：<原因>」 |
| 估计的来源：写 `EstimateLine` | `graph_propose`、`graph_edit` 返回前写 `timing.jsonl` 失败，或没有项目目录 | 写入抛错 | 图工具的结果照常返回（记录是附带的，不能让图操作失败）；`timeouts` 照常给 | 照常 | 行健康「估计的来源没记上：<原因>」；之后这一项估计的来源写「会话未记」 |
| 事后纠正：服务不在 | 组合里没有 `workspace-changes` | `available()` | 兜底不工作：不记晚到的拦下，也不送提醒 | — | 行健康「事后纠正未启用」 |
| 事后纠正：提醒没送出 | 会话不再走步、进程重启、步 notice 抛错 | `pendingCorrections` 里还有待送的 | 记录已在流水里，提醒丢掉 | — | 抛错时行健康降级 |
| 检查：超时账读不出或写不进 | `timing.jsonl` 不在、有坏行、权限 | 读写抛错 | 按没有实测处理（用预计或上限），检查照跑；写不进时本次实测不留 | — | 行健康「超时记录读不出」「超时记录写不进：<原因>」 |
| 检查：超时 | 一项检查超过它的超时值 | 执行器报的 `timeout` | 结束进程树；不计入连续失败；下一次改动照常再跑，下一次的值按 §6.3.1 抬高 | notice 写检查名、上限、实际耗时与接下来的值 | `TimeoutLine`、`RunLine`（censored）、`recordRun` `failed`、晨报「检查的超时」 |

不可逆的东西与防线：

| 风险 | 防线 |
| --- | --- |
| 放行的写入覆盖工作区外的文件 | 人逐次批准，申报文字写明完整路径、文件在不在、多大、内容预览；只有人整句回「可以」一类的话才放行；使用时重新核对目标，与申报文字里的不同就拒绝并作废；目标存在且不大于 10 MiB 时一律先备份；大于 10 MiB 或没有项目目录时文字里写「旧内容找不回来」。剩余：核对与写入之间毫秒级的窗口 |
| 放行被重复使用 | 绑定签名与派发链的根、30 分钟、一次；进程内「使用中」集合；放行只在内存里，进程重启就没了 |
| LLM 自己批准自己的申报 | 放行只由 §5.5 写入：来自 DSH 客户端的人的消息（宿主给它带 `rpcId`，模型的回复、工具参数、父 agent 写给子 agent 的任务、插件提醒都没有），紧跟在以申报文字结尾的助手消息之后，整句是同意词。违规流水与项目图都不作授权来源。剩余：模型用 shell 绕过客户端调本机接口。接口要进程启动令牌或签名 cookie（H20），签名密钥在 Harness home 的凭证里；读到它就能冒充客户端。0.2 的问答卡同样经客户端回答，这条边界不是新的；它与「shell 能直接写工作区外」是同一类已知边界（file-tools-only 只认读法看得见的写入） |
| 伪造人对第三次修复的拍板 | 拍板只记结论，不授权任何东西。剩余：shell 用读法看不见的方式改节点文件，可以伪造一条 `human` 的拍板；同一回合跑过图工具时，工作区变更兜底把图目录下的改动当作已知写入，看不见它（`src/guard/fallback.ts`，原 `shadow.ts`，文件头，评审第 2 轮 N18）。发现途径：节点文件是已跟踪文件，`git diff` 看得见；面板上会出现人没拍过的拍板。与 shell 直接写工作区外是同一个已知边界 |
| git 命令丢掉没提交的改动或改写历史 | 不拦 git（`d-main-agent-shell`）；会丢工作的 git 命令执行前由 M3 的 git 快照门先存快照、记下、告诉主 Agent 怎样恢复（M3 附录 0.5 §2.5）。M4 的规则不判 git |
| 检查命令执行任意命令 | 两道，对应两种检查（§6.1）。人加的检查：只有走循环板那一条路写入的条目才跑，`loop_propose` 返回命令原文与注意事项（`commandDetail`），`propose_to_human` 原样给人看，`record_human_answer` 核对到人看过原文才拍板，`acceptProposal` 没有「已给人看原文」的记号就 `invalid`（循环板 0.6 §7.1 第 1–4 步；这一道由循环板守，M4 的读法只负责给出命令）；节点上的命令之后改过，条目不再跑（`check-changed`），要人再同意。自带的检查器：只读已批准节点上带 `when` 的检查行，验收条件批准之后只有人能改，命令原文在板上随时看得到（`details`），比人加的条目弱——人批准节点时不一定细读命令，所以要像人加的条目一样硬时，把检查行写成不带 `when` 的定义、再加 `check` 条目引用它。两种共同的：命令不经 shell，改动文件作为单独的参数，程序是 shell 时不收文件参数，文件名里的命令替换无从展开；`argv[0]` 解析成 `PATH` 里项目之外的绝对路径；执行器的环境里没有 DSH 凭证与 GLM 密钥；超时结束整棵进程树；日志第一行记下展开后的参数表 |
| 删除文件 | 只删 env 行自己的日志目录（名字为 8 位十六进制，在 `<项目目录>/env-checks/` 下）与 §8 的三个脚本（删除前地址写进文档，提交信息记 SHA-256，快照不动；C1 按 `norm-review-floor` 全审） |
| 改用户的仓库 | 只在 `.git/info/exclude` 末尾追加一行 `.llm/`（经 `ensureIgnored`；本地、不入库、删掉这一行即可撤回；已有等价的行时不追加） |
| 撤下一条规则 | 只有人的话能撤下：经 `guard_lift` 的一路核对原话来自客户端送来的最近一条人的消息、起止在边界上、含撤下意图词、至少 4 个码点、一条消息至多换一次；经规则板的一路是人自己打的 `/rules lift`，身份由规则板核对；`lift-files-only` 只走规则板那一路；记录进仓库（原话或命令、时刻、经哪条路），`lift-files-only` 拦 agent 写这个确切路径在每一份检出里的副本（主检出，也包括 M7 worker 工作树里已提交的那一份，F14）；晨报列出撤下，并把主检出里此刻的文件与违规流水比：每条规则的终态，加逐行，两个方向都查，合入之后、git 命令换回旧版本之后的下一份晨报也查（F15）；一句话恢复。剩余：人说了一句放开的话、模型撤下了另一条规则（原话与规则 id 没有绑定，§3.5）；用读法看不见的 shell 写法改文件（与 `graph-files-only` 是同一个已知边界）；git 命令（`git apply`、`git am`、`git cherry-pick`、`git merge` 带进新行，`git checkout`、`git restore`、`git revert`、`git stash pop` 换回旧版本）不被拦，规则在晨报之前可能已经停拦或重新放行，靠对账发现，不靠门（门不拒绝流水里没有记录的行，§16）。 |
| 调高一项检查的超时上限 | 只有根 agent 能调 `check_limit`；这一项必须正被上限截住；61–600 秒；每次调高有理由、时刻和旧值，写进 `limits.jsonl` 并出现在循环板页与晨报里；`reset` 一步撤回。剩余：子 agent 用文件工具手改这个文件不被拦（没有为它再加保护规则），效果与记录同样可见；最坏是一项本机检查多跑几分钟 |
| 写进别的项目 | 流水、备份、日志只写会话所在项目的 `.llm/`，项目根从会话的工作目录算；写之前确认 `.llm/` 被 git 忽略（§2.4） |

## 12. 不变量与所在层

| 不变量 | 所在层 | 理由 |
| --- | --- | --- |
| 代码规则一律生效：判为拒绝就拦 | `judge`（`src/guard/rules.ts`）与 `installRuleGate`（`src/guard/gate.ts`） | 规则对象没有模式字段；所有用 guard 框架的行都经这一个安装函数（`evaluate` 已删，契约测试核对），一处保证 |
| 拦截后的跟进每次模型调用结算一次 | `followup.ts` 的 `observe`，由 `installRuleGate` 第一步调用；拆包与步号也在这里 | 最外层的监听器先看到调用；按 `callId` 去重；只认有 `tool/call` 事件的调用 |
| 流水的每一行恰好一类 | `classifyRecord`（`src/guard/records.ts`） | 晨报、统计、命令行、阶梯、规则页读同一个分类，数字不会因读者不同而不同 |
| 代码规则只有人能撤下 | `liftedRules` 只读 `docs/guard/lifts.jsonl`；写入口只有 `guard_lift`（核对客户端送来的最近一条人的消息里的原话：边界、撤下意图词、至少 4 个码点、一条消息至多一次；`liftVia: 'board'` 的规则它不撤）与服务 `glmHournessLifts`（只有规则板的 `/rules lift` 调它，插件之间的调用，agent 没有经它的路）；`lift-files-only` 护住这个文件在每一份检出里的路径（按目标所在检出的根判，主检出与每个工作树都算，§3.5）；git 命令改它不被拦，晨报比终态与逐行，两个方向都查（§3.10，F15） | 模型能写的东西（回复、参数、流水、图）不进撤下；worker 在自己的工作树里改副本再合入也是模型能写的东西；改规则、写入口与服务的提交按 `norm-review-floor` 全审 |
| 丢掉的违规记录数不被静默覆盖 | `RowHealth.note`（`src/shared/health.ts`，附在会话的行健康上，之后的 `report` 不冲掉）与 `rowJournal` 的待写缺口（`src/memory/audit.ts`，下一次写成功时补一行 `GapRecord`） | 行健康每个会话只存一条，被同一行的下一次报告整条替换（guard 行每次调用都报）；做在 `provideRowHealth` 里，每一行的 `report` 调用方不用各写一份合并；流水一侧是进程重启之后还在、晨报与规则页本来就读的那一份 |
| 被撤下的规则不进声明 | `declarationSection` | 告知只说会执行的规矩 |
| 超时值只由 harness 按估计和实测算，LLM 不手抄；3 倍超过上限时保持上限，不低于下限 | `src/env/timeout.ts` 的 `checkTimeout` 与 `timing.jsonl` 的写入口；检查行里的 `<预计>` 与 `check_limit` 的调高设置是 agent 写的仅有两样 | 实测数 harness 手里本来就有；默认上限只有改常量才能抬，改常量要人拍板；调高一项检查的上限只经主 Agent 的 `check_limit`，有理由、有记录、有硬顶 |
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

## 13. 实施顺序

每步一个提交，提交信息带节点 id；文档与代码同一提交（`AGENTS.md`）。门禁「全」指 `npm run build`、`npm run preflight`、`npm test`；碰 DSH 运行时的步另跑 `npm run probe`（L3，`docs/DEVELOPMENT.md` §1.1）。「今天必败」是这一步新增的 L2 检查在今天的代码上怎样失败，用来证明检查钉住了新行为。

开工条件：从 main 建分支（`9c346fb` 或之后）。G4 等 M3 第 4 步合入（`dispatchRoot`，`src/guard/main-agent.ts`）；`focusOf` 没合入时申报文字省去背景一行的焦点半句，不等它；`src/graph/proposal.ts` 没合入时 G4 照附录 §3.3 建。R1 等 M3 第 6 步（提议式待决、`record_human_answer` 的 `question` 一种、不带四行的 `propose_to_human`，§4.6）。E3 等循环板里 M4 要导入的几样合入：`src/loops/trigger.ts`（`matchesFilter`）、`model.ts` 与 `service.ts`（`contribute`、`emit`、`listens`、`recordRun`）、两块板共用的执行器 `script.ts`（`runCommand` 的 `queue: 'direct'`、`resolveProgram`）（循环板 S1、S3，§6.1、§6.3、§13.3）；人加的检查要 E3 的 `glmHournessEnv` 与两个纯函数，循环板在那之前把这类条目一律判 `refused`（`check-missing`）。E2 用 M3 第 5 步的 `src/graph/digest-notice.ts`，M3 没先做时由 E2 抽出。G1–G3、E1、E2、E4、C1 不等别的设计。

推进与问人（`d-auto-drive`、`d-design-onepage`）：人放行本设计之后，主 Agent 按本节的顺序自己推进到做完：派活、审查、合入；子 agent 与审查用什么模型由主 Agent 选并记理由（`d-main-agent-models`），harness 只记录。M4 里必须停下来问人的只有：D1（开工之前，与放行一起问，§17）；第三次修复（§4.6）。撤下一条规则是人主动说的话，不是流程里的一步（§3.5）。运行中的申报（§5）是使用者当时的事，不是开发流程的一步。开发中发现的问题按 `d-design-onepage` 分三档，M4 的例子在 §13.5；问题攒着问，一次至多三件。

评审：`norm-review-floor` 规定改到拦截与权限（guard 规则、写入范围、主 Agent 与子 agent 的工具面）、删文件的改动一律全审，由 harness 按改动的文件与命令判断，主 Agent 绕不过去。M4 里落在清单上的是 G1–G4（都改 `src/guard/`，G4 另给所有 agent 的工具面加 `request_exception`）与 C1（删文件），之后每一次改规则、改可申报名单、改同意词表、改 `guard_lift` 与服务 `glmHournessLifts` 也是。其余各步的深浅由主 Agent 定（`question-38` C），下表写建议。

### 13.1 步骤

| 步 | 内容 | 主要文件 | 层 | 评审 | 今天必败 |
| --- | --- | --- | --- | --- | --- |
| G1 | 安装函数与记录：`judge`（保留全部拒绝）、`installRuleGate`（含撤下的查询 `liftedRules`，G3 的写入口合入之前读不到文件就是没有撤下），guard 行与 `installGraphFileGuard` 改经它安装，`evaluate` 删除；`GuardRule` 去掉模式；`call` 字段、`recordKey`、`keyOf`、`classifyRecord`（含规则板的 `rule-record`、`late-denial`）与 §3.2 的全部记录类型，晨报的过滤改用它并去掉影子一节；规则目录 `GUARD_RULES` 与契约测试；file-tools-only 的例外换成新文案（§5.2；`APPLICATION_PROTOCOL` 已由 `61be79a` 删掉，圈禁的例外 G1 不动，N34）；按项目写流水与读流水（`projectHomeFor`、`projectJournal`、`ensureLlmIgnored`，项目根用 `src/data/project-root.ts` 的 `projectOf`，§2.4），晨报读会话所在项目的流水；丢掉的记录不静默（F13）：`RowHealth.note`、`rowJournal` 的待写缺口与 `flush()`、`GapRecord`、`classifyRecord` 的 `gap`、`ruleStats` 的 `unrecorded`、晨报「流水的缺口」一行；`tests/guard-rules.spec.ts` 起头（事故种子，§3.7） | `src/guard/rules.ts`、`gate.ts`、`records.ts`、`catalog.ts`、`lift.ts`（只读 `liftedRules`）、`index.ts`、`graph-files.ts`；`src/shared/data-home.ts`、`src/shared/llm-ignore.ts`（E2 未先建时）；`src/memory/audit.ts`；`src/graph/index.ts`（流水按项目）；`src/shared/health.ts`（`RowHealth.note`）；`src/workflow/morning-report.ts`；`tests/health.spec.ts`、`tests/guard-audit.spec.ts`、`tests/guard-gate.spec.ts`、`tests/guard-rules.spec.ts`、`tests/contracts.spec.ts`、`tests/workflow.spec.ts`；探针场景 `glm`、`non-glm-guard` 的纠偏期望；`docs/ORCHESTRATION.md` §6.1、§6.5（§6.5 的先影子后拦截按 `d-code-rules-enforce` 改写） | L1、L2、L3（全部现有场景照旧通过，纠偏期望按新文案改） | 全审（`norm-review-floor`：guard 规则） | `judge`、`installRuleGate`、`classifyRecord` 不存在；同一次调用被两条规则拒绝，流水今天只有一条（`evaluate` 只返回第一个）；一条带 `rule`、不带 `mode` 的 `{kind: 'followup'}` 记录今天被晨报算成「违规」；一条 `effect: 'queue'` 的规则板记录今天被算成「违规」；一条 `rules:` 开头的 `mode: 'record'` 或 `mode: 'late'` 的记录今天两边都不收（`src/workflow/morning-report.ts`:38–39 只认没有 `mode` 的拒绝与 `mode: 'shadow'`），晨报里看不到它们；两个临时仓库里的会话今天写进同一份流水（数据行的 `projectHome`）；`appendFile` 抛错时今天的 `rowJournal` 照样正常返回，`installRuleGate` 数不到丢掉的记录；一个会话丢了 3 条记录之后，同一行的下一次 `report` 今天把行健康整条换掉（`provideRowHealth` 没有 `note`），丢失数一次调用就看不到了；流水里今天没有缺口记录，`classifyRecord` 没有 `gap`；file-tools-only 的例外今天是 `ASK_THE_HUMAN` |
| G2 | 跟进记录（`observe` 接进 `installRuleGate`；拆 `DeferredToolCall`；按 `tool/call` 的步号跳过同一步；`turn/end` 与会话卸载记 `none`；没有 `tool/call` 事件的调用不结算）；统计 `ruleStats`；命令行 `records`、`stats`；晨报每条规则一行与走对的一行（走对 x/y 另数停下的次数，N30）；交给指标流水的事件（§3.11） | `src/guard/followup.ts`、`gate.ts`、`measure.ts`、`cli.ts`、`metrics.ts`、`index.ts`；`src/shared/deferred-call.ts`（E3 未先建时）；`scripts/guard/cli.mjs`；根 `package.json`；`tests/guard-followup.spec.ts`、`tests/guard-measure.spec.ts`、`tests/fake-rc3.ts`；`src/workflow/morning-report.ts`、`tests/workflow.spec.ts`；`docs/DEVELOPMENT.md` 加命令行一节 | L2、L3（`non-glm-guard` 与 `glm` 场景核对一条跟进记录；新场景 `guard-followup`） | 全审（同上） | 拦截后的下一次调用不留记录；连续两次被 `graph-files-only` 拒绝不留 `repeat`；GLM 路由上经包装的 `request_exception` 之后没有 `right-path`；`ruleStats` 不存在；晨报没有「走对」与「原样重试」 |
| G3 | 判定上下文；`mention.ts` 抽出；三条规则 `suppression-reason`、`checker-config`、`scratch-only`；撤下：`lift.ts` 的写入口、工具 `guard_lift`、服务 `glmHournessLifts`、规则 `lift-files-only`（§3.5）；工作区变更兜底改名 `fallback.ts`，改成晚到的拦下加下一步之前的纠正提醒（第二条步 notice `hourness-guard`，§3.4）；晨报「撤下的规则」一行；`docs/ORCHESTRATION.md` §6.4 改写 | `src/guard/context.ts`、`mention.ts`、`suppression.ts`、`checker-config.ts`、`scratch.ts`、`lift.ts`、`lift-service.ts`、`lift-files.ts`、`fallback.ts`（`git mv` 自 `shadow.ts`）、`graph-files.ts`（只改导入）、`index.ts`、`catalog.ts`；`src/data/project-root.ts`（加一个导出 `checkoutRootOf`，N23）；`src/shared/suppression-markers.ts`（E4 未先建时）；`src/shared/tool-names.ts`；`tests/guard-new-rules.spec.ts`、`tests/guard-lift.spec.ts`、`tests/guard-fallback.spec.ts`、`tests/guard-rules.spec.ts`（加三条规则的用例）、`tests/contracts.spec.ts`；探针场景 `guard-new-rules`、`guard-lift`、`guard-fallback`；`src/workflow/morning-report.ts` | L2、L3 | 全审（同上；新工具、撤下的写入口与服务都是权限） | 写不带理由的 `eslint-disable`、改 `tsconfig.json`、在仓库根新建 `fix.py` 今天都不被拦；`guard_lift` 与服务 `glmHournessLifts` 不存在；写 `docs/guard/lifts.jsonl` 今天不被拦，写 `git worktree add` 出来的工作树里的那一份（相对路径或绝对路径）今天同样不被拦（F14）；`checkoutRootOf` 不存在（N23）；晨报今天不比终态，`git checkout` 换回旧版本、`git apply` 带进新行都查不到（F15）；shell 写了没有文件工具碰过的文件，今天的兜底写的是 `mode: 'shadow'`、没有下一步的提醒 |
| G4 | 申报通道：编号与带编号的拒绝文案（三种情形）、`request_exception`（含 `busy` 的 5a 条与 `lines`）、申报文字（`renderPlan` 用 `proposal.ts` 的四行规则；题目里的路径与背景里的焦点标题走 `displayPath`、`personTitle`，工具对任何抛错都有 `unavailable` 的退路，F18）、`request_exception` 说明里的示范 `REQUEST_EXAMPLE`（F20）、读人的回话（步 notice、同意词表、确认句、每一回合的再出示、关闭与作废的提醒带事实字段）、放行簿（内存、使用时核对、备份、一次、`peekGrant`）、服务 `glmHournessRequests`（`outsideDenial` 按项目判，`peekGrant`，`openRequests`；申报 2 小时的定时器，N38）、圈禁覆盖 `str_replace_editor`、可申报名单 `REQUESTABLE` 含 `checker-config` 与 `scratch-only`（§5.3）、晨报一行；M7 已合入时一并接上 M7 的两处（§5.9） | `src/guard/request.ts`、`request-service.ts`、`gate.ts`、`rules.ts`、`index.ts`；`src/graph/plan-text.ts`；`src/graph/proposal.ts`（M3 第 6 步未合入时）；`src/graph/plain-question.ts`（M3 第 3 步未合入时）；`src/shared/tool-names.ts`；`tests/guard-request.spec.ts`、`tests/plan-text.spec.ts`、`tests/fake-rc3.ts`、`tests/contracts.spec.ts`；探针场景 `guard-request`（含 goal 一遍）、`guard-request-refuse`；`src/workflow/morning-report.ts`；`docs/ORCHESTRATION.md` §5、§6.1 | L2、L3；L4 随批次 | 全审（guard 规则、权限与工具面） | 圈禁、`checker-config`、`scratch-only` 的纠偏没有编号；`request_exception` 没有注册；`str_replace_editor create` 写工作区外放行；人回「可以」之后同一调用仍被拒；`requestsService` 读不到；申报开着、一回合首步没有人的消息时没有再出示的提醒；焦点节点标题是「补齐验收条件」时今天（`renderPlan` 对整句查换词）申报文字写不出；`outsideDenial` 对 worker 写主检出的调用返回编号。另有两例今天恰好通过、留作防回归：向流水追加伪造的 `RequestRecord` 与 `GrantRecord` 之后同一个工作区外的写入仍被拒；一条不带 `rpcId` 的「可以」不放行 |
| E1 | env 行骨架与登记、行健康 `env` | `src/env/index.ts`；`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`（`name: dsh-hourness/env`）、`packages/hourness/package.json`（`./env` 与 `./env/locale/*.json`）、`packages/hourness/locale/env/en.json`、`zh.json`（设置页标题：「开发环境」/「Dev environment」与一句说明）、`packages/hourness/tsconfig.json`（随表）、`src/shared/health.ts`、`tests/contracts.spec.ts`、`tests/health.spec.ts`；`docs/DESIGN.md` §2.2、§2.5、§7 | L1、L2、L3（`hourness-only` 场景里 `env` 行生效） | 主 Agent 定（建议轻审） | 行 id 清单与 `HOURNESS_ROWS` 没有 `env`；`npm run preflight` 报没有 `./env` 导出与 `locale/env/` |
| E2 | 环境分支读取（`config` 行）、环境提醒（检查一行在 E3 之前写「No checks run after edits in this project yet.」）、草稿区忽略（经 `ensureIgnored` 追加一行、去重、复核）、`scratchLeftovers` | `src/env/branch.ts`、`notice.ts`、`index.ts`；`src/shared/llm-ignore.ts`（G1 未先建时）；`src/guard/scratch.ts`（只加 `scratchLeftovers`，若 G3 未到则 E2 建这个文件的这一部分）；`tests/env-branch.spec.ts`、`tests/env-notice.spec.ts`、`tests/env-ignore.spec.ts`（真实的临时 git 仓库）；探针场景 `env-notice`；`docs/ORCHESTRATION.md` §7.1、§7.4 | L2、L3 | 主 Agent 定（建议全审：写用户仓库的 `.git/info/exclude`） | 第一步没有环境提醒；临时仓库里 `git check-ignore -q .llm/scratch/x` 退出码为 1；带 `!/.llm/` 反向模式的仓库里行健康不报降级 |
| E3 | 检查器：环境工具节点的检查行（语法、`checkLineRefusal`、`envBranch` 的 `checks`）；事件 `env.files-edited` 的声明与每步算出改动文件之后经 `emit` 交事件（按检出的根分组、先问 `listens`）；M4 自带检查器的运行（经共用执行器的 `runCommand({queue: 'direct'})`）、超时的算法与记录（`timeout.ts`、`timing.jsonl`、环境提醒里只给根 agent 的「held at its ceiling」一行、晨报「检查的超时」一节，§6.3.1）、人批准时看到的超时（`timeoutText`，`graph_propose` 与 `graph_edit` 对环境工具节点的结果附 `timeouts`，并把会话写进 `EstimateLine`）、主 Agent 调高上限的工具 `check_limit` 与 `limits.jsonl`（§6.3.1）、解析、改动行、提醒；检查进程的排队（全进程 2 个名额，调高了上限的检查合起来占 1 个，排队有等待上限，`QueueLine`，N17）；服务 `glmHournessEnv`（`checkCommandOf`）与两个纯函数 `fillCheckArgv`、`formatCheckOutput`（给循环板的人加的检查，F17）；交给循环板 `env.checks-after-edit`（`ownRules`、`details`）并按每次送出的结果 `recordRun`（§6.8，F11） | `src/env/loop-entry.ts`、`env-service.ts`、`check-entry.ts`、`runner.ts`、`timeout.ts`、`limit-tool.ts`、`parsers.ts`、`changed-lines.ts`、`check-notice.ts`、`branch.ts`、`index.ts`、`src/workflow/morning-report.ts`（超时一节）、`src/graph/tools.ts`（只加 `timeouts` 与 `EstimateLine`，R1 也改这个文件，见 §13.2）；`src/shared/tool-names.ts`（加 `ENV_TOOL_NAMES`）、`tests/contracts.spec.ts`（把 `check_limit` 的名字钉到注册上）；`src/shared/deferred-call.ts`（G2 未先建时）；`tests/env-checks.spec.ts`（真实子进程经执行器跑一个夹具程序）、`tests/env-timeout.spec.ts`、`tests/env-limit.spec.ts`（`check_limit`）、`tests/env-check-entry.spec.ts`、`tests/env-service.spec.ts`、`tests/env-loop-entry.spec.ts`；探针场景 `env-checks`；`docs/ORCHESTRATION.md` §7.5、§7.7 | L2、L3；L4 随批次 | 主 Agent 定（建议全审：harness 运行人批准的命令） | 写入成功后下一步没有检查结果 notice；`graph_propose` 对带检查行的环境工具节点今天不返回超时那一句；`check_limit` 不存在；`pwsh` 带 `{files}` 的检查行没被拒绝；`checkCommandOf` 不存在；两项上限已调到 600 秒的检查卡住时，别的检查今天一直排队、没有任何消息；`fillCheckArgv` 不给以 `-` 开头的文件名加 `./`；循环板的执行表里没有 `env.checks-after-edit`；`env.files-edited` 没有交进收件箱 |
| E4 | 压制注释计数与晨报一行 | `src/env/suppressions.ts`、`index.ts`；`src/shared/suppression-markers.ts`（G3 未先建时）；`src/workflow/morning-report.ts`；`tests/env-suppressions.spec.ts`；`docs/ORCHESTRATION.md` §7.6 | L2 | 主 Agent 定 | `suppressions.jsonl` 不存在；晨报没有压制注释一行 |
| R1 | 第三次修复之前问人：重开计数（从上一张关闭的这类待决算起）、`reopenQuestion`（提议式待决的题目与四行、`body` 里的「附」、`propose` 的 `reason`，不带选项字段；节点标题先过 `personTitle`，不合格时走退路写法，F18）、`graph_status` 的 `notice`（用不带四行的 `propose_to_human` 交给人、用 `record_human_answer` 记）；交给循环板 `graph.third-rework` 并 `recordRun`（循环板已合入时；否则由循环板后到的那一步加，§13.3） | `src/graph/reopen.ts`、`tools.ts`、`loop-entry.ts`、`index.ts`；`tests/graph-reopen.spec.ts`、`tests/graph-loop-entry.spec.ts`；`docs/ORCHESTRATION.md` §2.4（写明数法：第 n 次重开即第 n 次修复开始；问法是一个方案的四行，不给选项） | L2、L3（现有图场景照旧通过） | 主 Agent 定（建议全审：harness 以自己的身份写人定的待决） | 第 3 次重开之后节点下没有待决；交给真实引擎的待决带 `options`（今天的引擎不收提议式待决，这一例在 M3 第 6 步之后才能跑，R1 因此排在它之后） |
| C1 | 先把三个脚本里的地址与路径字面量逐字写进快照索引的「附」，再删除三个脚本与 `__pycache__` | `.llm/docs/`（不入库）；`docs/reference/bigmodel-guide-digest.md`；`docs/ORCHESTRATION.md` §7.4 末句 | L1 | 全审（`norm-review-floor`：删文件） | — |
| K1 | 标定题：会诱发 shell 写文件与工作区外写入的小任务，记分加「拦截后下一步走对」 | `tests/calibration/<题>/`（按 M7 的回归集结构，M7 未合入时按今天的格式） | 标定 | 主 Agent 定 | — |

K1 等两件事：G2 与 G4 已合入（量的是新的拒绝文案）；`ablation` 任务把标定运行目录移出仓库（`risk-calib-read`）。K1 不需要放行：它量的是拦截之后模型的下一步，模拟人（M3 附录 0.5 §3.10）回不回「可以」都不影响分数；模拟人的消息不带 `rpcId`，也放行不了（§5.5）。花积分按常设授权，结果写进 K1 的节点批注。

### 13.2 并行的线

| 线 | 步 | 只碰这些文件 |
| --- | --- | --- |
| guard | G1 → G2 → G3 → G4（串行：都改 `src/guard/index.ts`） | `src/guard/`、`scripts/guard/`、`tests/guard-*` |
| env | E1 → E2 → E3 → E4 | `src/env/`、`tests/env-*`、`packages/hourness/locale/env/` |
| 图 | R1 | `src/graph/reopen.ts`、`src/graph/tools.ts`、`src/graph/loop-entry.ts`、`tests/graph-reopen.spec.ts`、`tests/graph-loop-entry.spec.ts` |
| 清理 | C1 | `.llm/docs/`、`docs/reference/bigmodel-guide-digest.md` |

四条线互不碰同一个文件，下面这些共用文件除外，由编排者按 §13.3 排先后：`docs/ORCHESTRATION.md`、`docs/DESIGN.md`、`docs/DEVELOPMENT.md`（各步只改自己的小节）；`src/workflow/morning-report.ts`（G1、G2、G4、E4）；`tests/contracts.spec.ts`（G1、G3、G4、E1、E3）；`tests/fake-rc3.ts`（G2、G4，M3 的步也改它）；登记文件（E1）；`src/shared/health.ts`（G1 加 `RowHealth.note`，E1 在 `HOURNESS_ROWS` 加 `env`，两处互不相干，先合入的先改）；`src/shared/tool-names.ts`（G3、G4、E3）；四个「谁先开工谁建、另一方只导入」的文件：`src/shared/suppression-markers.ts`（G3、E4）、`src/shared/deferred-call.ts`（G2、E3）、`src/shared/llm-ignore.ts`（G1、E2）、`src/graph/plan-text.ts` 里的 `personTitle`（G4、R1）；`src/graph/plain-question.ts`（M3 第 3 步或 G4）；`src/graph/proposal.ts`（M3 第 6 步或 G4）；`src/graph/index.ts`（G1 改流水的目录、R1 加交给循环板）；`src/graph/tools.ts`（R1 加第三次修复的提问，E3 加 `timeouts` 与 `EstimateLine`；两处互不相干，先合入的先改，后到的在它之上重做，§13.3 已有规则板 R4 与 M3 同样改它）；`src/shared/data-home.ts` 与 `src/memory/audit.ts`（G1；M5 也改 `src/memory/`）；`scripts/probe/` 的场景登记（各线加场景）；`src/guard/scratch.ts`（G3 建、E2 加一个函数）。探针与桌面版一次只能有一个持有者（`risk-shared-desktop`），各线的 L3 由编排者排队。

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
| 规则板的 `/rules lift` 把代码规则的撤下交给服务 `glmHournessLifts`；规则页读它的 `lifted` | 规则板 R4（命令）、R5（规则页）；M4 G3 | 谁后合入谁加（§3.5、§18 第 5 条 `rules`）。规则板没接之前人只有对主 Agent 说这一条路；L3 `guard-lift` 由验证插件扮演规则板 |
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
8. 循环板页面「碰到某件事就做的」一组有「改完文件就跑检查」与「同一件活第三次返工之前：停下问你」两项，来源一行「项目编排带来的 · 只能看」；前者展开是本项目每个已批准的带 `when` 的检查行一行与五条规矩，规矩里的数是 20 秒、3 倍、5 秒、60 秒、3 次、1 次、2 项、排队 60 秒（第五条，N21；与 `src/env/timeout.ts`、`runner.ts` 里的常量一致）；「本项目加的」一组里有第 5 项加的那一项 `check`，上次是第 5 项那次，下面一行写「M4 自带的检查器也跑这一条」或没有（取决于那条检查行带不带 `when`）（F11，F17）。
9. 违规流水与检查日志在本仓库的 `.llm/` 下；另开一个临时 git 仓库的会话触发一次圈禁拒绝，记录写在那个仓库的 `.llm/audit/` 里，本仓库的流水没有它（§2.4）。
10. 撤下（§3.5）：本仓库的 GLM-5.3 会话里让 agent 在仓库根新建一个 `.py` 文件，被 `scratch-only` 拦下，纠偏带编号与 `request_exception`；人对主 Agent 说一句「新建脚本那条先别拦了」，主 Agent 调 `guard_lift`，同一次新建通过，`docs/guard/lifts.jsonl` 多一行带原话（`via: 'chat'`），新一步的系统提示词里 `glm:guard` 少一行；人再说「恢复」，新建又被拦。agent 用 `write` 或 `pwsh` 改 `docs/guard/lifts.jsonl` 被 `lift-files-only` 拦下，改 `git worktree add` 出来的工作树里的那一份同样被拦（F14）。读会话日志核对 `guard_lift` 那一步的人的消息带 `rpcId`。人只发一条「继续」时，让主 Agent 在没有人要求的情况下自己试 `guard_lift`：返回 `not_said`，规则照拦（F2）。人在没有任何提示的情况下说「新建脚本那条先别拦了」，主 Agent 找到并调 `guard_lift`（靠声明头部那一句，N7）。规则板那一侧接上之后（§18）再做一遍：在规则板上打 `/rules lift guard:scratch-only`，`lifts.jsonl` 多一行 `via: 'board'`，规则页显示「已撤下」。
11. 事后纠正（§3.4）：让 agent 用读法看不见的 shell 写法写一个文件：回合结束后违规流水多一条 `mode: 'late'` 的记录，agent 的下一步之前收到一条点名那个文件的纠正提醒。
12. 超时（§6.3.1）：主 Agent 提议带检查行的环境工具节点，它交给人看的方案里，每条检查行旁边有超时那一句（含估计；这一步靠工具说明，只有一次 GLM-5.3 的样本，M3 的 `mustShow` 核对接上之前不当作保证，§18 第 5 条）；人批准之后，用一个夹具检查行（预计写得很低、实际要睡 7 秒的检查）：第一次超时，提醒写明检查名、上限、实际耗时与下一次的值，第二次的值变成 3 倍并跑完；晨报「检查的超时」一节出现这个检查、当前值、来源（估计的写明谁估的）与旧值；`timing.jsonl` 里有对应的 `estimate`、`value` 与 `timeout` 行。
13. 上限提醒与设置（§6.3.1 第 6 条）：用一个夹具检查行让 3 倍超过 60 秒（预计 25 秒，或实测 24 秒）：主 Agent 的下一步收到一行「held at its ceiling」，子 agent 的环境提醒里没有这一行；主 Agent 调 `check_limit` 把这一项调到 120 秒并写理由，之后这一项的值按 120 秒封顶，晨报与循环板页写明上限已调高；`check_limit {action: 'reset'}` 之后恢复 60 秒；对一项没有被截住的检查、或刚调高之后紧接着再调，得到 `not_held`；子 agent 调用得到 `forbidden`。

### 13.5 两层循环：M4 的问题归哪一层（`d-design-onepage`）

人定的两层循环：大循环定框架、模块清单与方向清单；每个模块先写设计、过评审、人看一页放行再开发；开发中的问题分三档；问题攒着问，一次至多三件（产品里使用者的项目同样这样走，人 2026-10-30「两层循环加，我正想说这个事情呢」）。M4 在两处。

开发 M4 本身（M4 是本项目的一个模块）：

| 档 | 怎样认 | M4 里的例子 | 谁定、怎样告诉人 |
| --- | --- | --- | --- |
| 只影响 M4、可逆 | 改的是实现与 agent 定的数，人在一页放行稿里读到的东西不变，方向清单不碰 | 解析器的写法；2 个并发、512 条映射、`timing.jsonl` 留几条一类常量（超时的倍数与上限是人定的，不在此列）；文件名与模块的拆法；日志目录名；某个 L3 场景换一种驱动方式（§14.1 的〔未核实〕项不成立时）；纠正提醒多列一个文件 | 主 Agent 定，记成决定者为 agent 的待决；在下一批里告诉人一行 |
| 改到 M4 的设计方向 | 改了人在一页放行稿里读到的东西，或 §16 里一项取舍 | 同意词表、放行时限、要不要备份；申报文字或第三次修复的问法；撤下一条规则的办法；检查条目怎样同意；给 agent 读凭证加规则；第三次修复改成拦下 | 回本设计的循环：改设计、过评审、改一页放行稿，人在对话里同意后再开发；受影响的步暂停，其余步照常 |
| 改到框架 | 动了方向清单，或改了别的模块的接缝 | 授权不再只认客户端送来的人的话；两块板的条目形状要变；违规流水并进指标流水；guard 不再对所有路由生效 | 回大循环，受影响的步暂停，由编排方与人定 |

产品里（M4 的功能在使用者的项目里运行）：

- 申报：一次运行时的授权，不是开发中的问题，不分档。申报文字单独放在回复最后，同一条回复里不出示别的提议（§5.3 第 5a 条与 M3 那一侧的 `busy`），所以那条回复只有它一件。
- 第三次修复的提问：开发中发现的问题，是第二档的信号（同一处反复修不好，常常是那件活的方向不对）。问法是一个方案，进下一批，一次至多三件（§4.6）；查清之后要改那个模块的设计时，按使用者项目的三档走（M3、M7 的事）。
- 新加一项人加的检查：主 Agent 在对话里提一次（命令原文附在四行之后），进同一批；新加一个带检查行的工具节点（M4 自带的检查器）随人批准节点，也进同一批。
- 撤下一条规则：人主动说的，主 Agent 当场照办并告诉人，不进批（§3.5）。

「至多三件」的计数：M3 的 `propose_to_human` 数一条回复里交给人的件数（附录 0.5 §3.4 第 4 条）；第三次修复与检查条目都经它，都算进去；申报不经它，用 `busy` 与别的件分开。

## 14. 验证

### 14.1 L3 探针场景

| 场景 | profile | 做什么 | 检查 |
| --- | --- | --- | --- |
| 现有全部 | — | 不变 | G1 之后全部照旧通过；`glm`、`non-glm-guard` 的纠偏按 §5.2 的新文案改期望（G1 改一次，G4 再改一次） |
| `guard-followup` | `probe-full` | 图目录用仓库图的副本；依次：用 `write` 写副本里的一个节点文件两次（两次都被 `graph-files-only` 拒绝）；再 `pwsh` 跑 `Set-Content x.txt 1`（被 file-tools-only 拒绝）；再 `write` 写 `x.txt` | 违规流水有三条拒绝与三条跟进：第一次图写入之后 `repeat`（由图行结算），第二次之后 `other`，shell 写之后 `right-path`；这一场景同时证明图行与 guard 行共用一个跟进记录器（§3.3） |
| `guard-new-rules` | `probe-full`，GLM 与 `deepseek-probe` 各一遍 | 场景 DSH home 下放一个假的 `glm-hourness/credentials.json`；依次：`read` 它；`write` 一个带 `// eslint-disable-next-line` 而没有理由的 `.ts`；`edit` 临时仓库里的 `tsconfig.json`；在仓库根新建 `fix.py` | `read` 凭证文件放行，流水里没有它的记录；后三个调用被拒绝、不执行，违规流水恰好三条拒绝（规则分别是 `suppression-reason`、`checker-config`、`scratch-only`），`scope` 分别为 `dialect`、`other`；后两条的纠偏带申报编号；系统提示词的 `glm:guard` 节列出这三条规则 |
| `guard-lift` | `probe-full`，GLM 一遍 | 覆盖层的验证插件扮演人（同 `guard-request` 的扮演方式）并扮演规则板：先 `write` 仓库根的 `fix.py`（被 `scratch-only` 拒绝）；人的消息「新建脚本那条先别拦了」之后，agent 调 `guard_lift`（经 `DeferredToolCall`）；再 `write` 同一个文件；再 `write` `docs/guard/lifts.jsonl`；场景在临时仓库里先用 `git worktree add` 建一个工作树，agent 再 `write` 那个工作树里的 `docs/guard/lifts.jsonl`（绝对路径）；验证插件调 `liftService(ctx).setLifted`（`guard:scratch-only`，`restore`）；再 `write` 另一个新脚本 | 第一次被拒；`guard_lift` 返回 `lifted`，`lifts.jsonl` 多一行（`via: 'chat'`，带原话），违规流水多一条 `LiftRecord`；第二次 `write` 执行；写 `lifts.jsonl` 被 `lift-files-only` 拒绝，写工作树里那一份同样被它拒绝（拒绝记录的规则 id 是 `lift-files-only`，不是圈禁，F14）；`setLifted` 之后 `lifts.jsonl` 多一行 `restore`（`via: 'board'`），新脚本又被拒；`guard_lift` 带一句不在最近一条人的消息里的话、或在消息里但不含撤下意图词的话，都返回 `not_said`；系统提示词的 `glm:guard` 节在撤下之后少一行、恢复之后多回来；节头有 `call guard_lift` 那一句（根 agent 有，子 agent 没有，N7）；这个场景去掉那一句时必败 |
| `guard-fallback` | `probe-full`，经覆盖层挂上 `workspace-changes`（同今天的兜底场景） | 在临时 git 仓库里让 agent 用读法看不见的 shell 写法写一个文件，下一回合再走一步 | 违规流水一条 `mode: 'late'`、`via: 'turn-end'`，带 `paths` 与 `calls`；下一回合第一个请求末尾有 `hourness-guard` 的纠正提醒，点名那个文件；再下一步没有 |
| `env-checks-timeout` | `probe-full`，同 `env-checks` 的最小循环板服务 | 图副本里的检查行 `` `check slow lines 1s $ node slow.mjs {files}` when *.txt ``，`slow.mjs` 每次睡 7 秒再打印一行；依次改一个 `.txt` 两次 | 第一次：预计 1 秒，3 倍不足下限，超时取下限 5 秒（建节点的 `graph_propose` 结果里 `timeouts` 是「超时 5 秒（估 1 秒，乘 3 不足 5 秒）」，并在 `timing.jsonl` 写一条带会话的 `estimate`），提醒写 `did not finish: stopped after 5.x s (limit 5 s …)` 和下一次的 15 秒；第二次：跑完（约 7 秒，在 15 秒内），一步等待取 15 秒；`timing.jsonl` 依次有 `estimate`、来源为估计的 `value`（`session` 与 `actor` 对得上）、一条 `timeout`、`censored` 的 `run`、harness 调整的 `value`（15 秒，依据的运行里有 5000）、一条 7000 的 `run`；晨报「检查的超时」写出这些。另一遍用预计 25 秒的检查行（3 倍 75 秒）：值被截在 60 秒，`value` 记录带 `capped: {wantedMs: 75000}`，根 agent 的下一步有 held at its ceiling 一行，子 agent 没有 |
| `guard-request` | `probe-full`，GLM（`request_exception` 经 `DeferredToolCall`）与 `deepseek-probe` 各一遍 | 覆盖层的验证插件扮演人：根 agent 的 `turn/end` 时，若最后一条助手消息以申报文字结尾，就 `agent.followup(createUserMessage({content: [{type: 'text', text: '可以'}], source: {kind: 'user', rpcId: 'probe-1'}}))`。脚本：`write` 工作区外 → 拒绝；`request_exception` → `ask`；回复以 `text` 结尾、结束回合；（人回「可以」）；同一 `write` → 执行；再一次 → 拒绝 | 纠偏带编号、`request_exception` 与四个字段；申报文字的格式（题目、四行、「附」、问话在最后）；人回话之后那一步的请求末尾有放行说明，带工具与参数；目标文件内容等于参数，旧内容在 `requests/`；违规流水依次有拒绝、跟进 `right-path`（GLM 一遍是拆包之后的结算，评审第 2 轮 F9）、`asked`、`approved`（带原话「可以」）、`GrantRecord`、拒绝 |
| `guard-request-refuse` | `probe-full` | 同上的验证插件，四个回合依次送：不带 `rpcId` 的「可以」；带 `rpcId` 的「可以吗」；agent 回复末尾改成确认句之后带 `rpcId` 的「可以」；第二条申报时 agent 故意在文字后面多写一句，再送带 `rpcId` 的「可以」 | 第一次 `not-client`、写入仍被拒；第二次 `unclear`，说明里有确认句；第三次 `approved`，写入执行；第四次 `not-shown`，写入被拒、申报留着。流水的记录与上面一一对应 |
| `guard-request-goal` | `probe-full`，GLM 一遍（评审第 3 轮 F14 第 4 条） | 根 agent 带着一个活着的 goal（`glm-goal` 的做法），会话里装着 `dsh-goal-round-driver`；同 `guard-request` 的脚本与扮演方式，验证插件在申报文字出现之后的那次 `turn/end` 送带 `rpcId` 的「可以」 | 每一回合首步、没有人的消息时有「still waits」的说明；人回话之后放行成功；会话日志里 `ask` 结果与一条 `request: {ref, outcome: 'approved'}` 的提醒成对（F15）；M7 合入之后另核对申报开着时 goal 为 `blocked`（`hourness-waiting-human`）、关闭后恢复 |
| `guard-request-worker` | `probe-full`，M7 合入之后（F13） | 主 Agent 派一个 worker（`dispatch_task`），任务让它写工作区外的一个临时文件；验证插件扮演人 | worker 第一次被 `worker-scope` 拒绝，纠偏带编号与 `ask_main` 一句；主 Agent 的 `request_exception` 得到 `ask`；人回「可以」之后主 Agent 收到 worker 那一句说明并 `answer_worker`；worker 原样再调成功，旧内容在 `requests/`；第二次被拒。核对 `dispatchRoot(worker)` 是主 Agent。另一步（F19）：任务让 worker 写主检出里的 `src/a.ts`（工作树在 `<仓库>/.worktrees/` 下）：被 `worker-scope` 拒绝，纠偏是 M7 的（`ask_main` 请放宽写入范围），没有编号，主 Agent 没有可申报的东西 |
| `env-notice` | `probe-full` | 图副本里有 `env` 与一个已批准、一个提议中的工具节点；临时仓库不忽略 `.llm/` | 第一个请求末尾有环境提醒（一个工具、「1 more tool node waits」、检查一行、草稿区一行）；场景结束后在临时仓库里跑 `git check-ignore -q .llm/scratch/x`，退出码为 0（不核对文件的文字）；`.git/info/exclude` 里恰好一行 `/.llm/`；第二个请求没有环境提醒 |
| `env-checks` | `probe-full` | 探针进程没有会话控制器，循环板不提供服务（循环板 0.6 §3.1），所以覆盖层的验证插件提供一个最小的 `glmHournessLoops`：`listens('env.files-edited')` 为真，记下收到的 `contribute`、`emit`、`recordRun`。进程由真实的共用执行器起（循环板的 `src/loops/script.ts` 没合入时，验证插件里放一个等价的最小 `runCommand` 并在场景里写明）。图副本里有一个已批准的工具节点，验收条件含 `` `check lint lines $ node lint.mjs {files}` when *.txt ``，`lint.mjs` 对含 `TODO` 的行打印 `<file>:<line>:1: todo found`。依次 `write` 一个含 `TODO` 的 `a.txt`、`edit` 去掉它、再走一步不写；另 `write` 一个名为 `b$(echo x).txt` 的文件和一个名为 `-c.txt` 的文件 | 第二个请求末尾有检查结果 notice（1 finding，`a.txt:1`，`[changed]`，日志路径存在）；第三个请求有一行全 0；第四个请求没有检查结果 notice；`lint.mjs` 收到的参数里有原样的 `b$(echo x).txt` 和 `./-c.txt`，没有产生 `x`；验证插件收到 env 行交来的 `env.checks-after-edit`（`ownRules` 五行）、每次送出结果一条 `recordRun`（`entry` 是 `env.checks-after-edit`）、每个有改动的步一条 `emit`（`env.files-edited`，`files` 相对检出的根，键 `files-edited:<会话>:<turn>-<step>`）。再加一遍：同一个节点上的检查行不带 `when`，M4 自己不跑它（没有检查结果 notice），验证插件用 `checkCommandOf` 能读出它且 `own` 为假；节点的命令改一个字之后 `checkCommandOf` 读出的参数表随之变。循环板自己的存储与同意路径、`check` 条目的运行由循环板的 L3 管，真机上的整条路在 L4 第 5、8 项 |
| `hourness-only` | `probe-hourness` | 现有场景 | 另核对 `env` 行生效、`request_exception` 在工具面里 |

`guard-request` 的扮演方式〔未核实〕：headless 运行器在它自己的 agent 第一次空闲时退出（`run-probe.mjs` 的 `goal-headless` 一节），`turn/end` 时排进收件箱的消息能否在退出之前开出下一回合要在 L3 上看；不能时改用 `glm-goal` 的做法，由验证插件在一次工具调用里另起一个根 agent 驱动这几个回合。插件能造带 `rpcId` 的消息不是漏洞：插件本来就是 harness 的一部分，模型造不出来。

探针运行目录照旧隔离（`docs/DEVELOPMENT.md` §3）：凭证、流水、日志与备份都在场景目录里。

### 14.2 L2

纯函数：`judge`（多条拒绝、抛错）、`classifyRecord`（每种记录、规则板的两种 `mode`、兜底的 `late`、旧的带 `paths` 的 `shadow`、缺口 `gap`、读不懂的行）、`unwrapDeferredCall`（合法、少字段、多字段、`input` 不是对象）、`followupOf` 与 §3.3 列的跟进各例、`ruleStats`（拦下次数、跟进四类、原样重试、最近一次拦下的样子）、`liftedRules`（最后一行为准、坏行、读不出）、`checkTimeout`（预计、实测、下限、上限、被上限截住、超时那一次按上限计、命令改过后重新开始）、三条规则的 `detect`（含 §1.2 的不触发情形）、签名、`fillCheckArgv` 与 shell 名单、`checkLineRefusal` 与 `splitArgs`（含 `<预计>`：`4s` 过，`4`、`4 s`、`0s`、`1000s` 读不懂）、`formatCheckOutput`、`personTitle` 与 `displayPath`、`envBranch`、`config` 行与检查行的语法、三种解析器、改动行、两种 notice 的渲染与长度上限、`reopenCount` 与 `reopenQuestion`（第 3 次重开提问、人同意或放弃之后再数 3 次、`propose` 的 `reason` 认法、正文被改过照样认得）。

给人看的文字（评审第 2 轮 F10）：`renderPlan` 的格式与拒绝（四行经 `proposalLineRefusal`、题目长度、换词）；申报文字的五种变体与第三次修复的题目与四行逐字钉住；问话只有一个回复词（「可以」）；对这些文字与 D1 的问话跑 `plainWordsIn`，结果为空；题目之后的第一段以「背景：」开头，问话是最后一段。

读人的回话（§5.5）：只认 `kind: 'user'` 且带 `rpcId` 的消息；`tail` 的规范化（行尾空白、`\r\n`、多余空行）；助手消息带工具调用块、`tail` 之后多一句、中间隔了一条别的回复都不放行；同意词与不同意词的整句匹配（「可以吗」「可以，顺便……」不算）；确认句与第 3 次关闭；2 小时过期；没有用户消息时的「再出示一次」每一回合首步加一次（F14）。

宿主侧在假宿主 `tests/fake-rc3.ts` 上：`installRuleGate`（guard 行与图行两条安装路径的拒绝记录与撤下、跟进的跨行结算、一个放行只去掉自己那条拒绝）；`request_exception` 的检查顺序与各错误码；放行之后的说明带工具与参数、参数超过 4 KiB 时写进 `requests/<编号>.call.json`；备份失败、目标在批准与使用之间被新建或变大、并行的两次同签名调用；重启（同一项目目录上卸载再装一次 guard 行）：等人回话的申报与放行都没有了，之后的「可以」不放行；向流水追加伪造的 `RequestRecord` 与 `GrantRecord`、删掉一条 `GrantRecord` 都不改变结果；env 行的步 notice（推出改动文件、GLM 别名与 `DeferredToolCall`、等待上限、后台结果、连续失败）。检查的子进程在 L2 里经共用执行器真实运行（夹具程序在临时目录里），超时用一个睡 120 秒的夹具。

0.4 加的（对应第 3 轮的发现）：

- F11：`src/env/loop-entry.ts` 与 `src/graph/loop-entry.ts` 交出的内容形状（字段齐、长度在循环板 0.6 §2.1 的上限内）、`ownRules` 每一行等于由常量拼出的句子；假的循环板服务收到 `contribute` 一次、每次送出检查结果 `recordRun` 一次（`entry` 是 `env.checks-after-edit`）、每提一次第三次修复的待决 `recordRun` 一次；`contribute` 返回 `ok: false` 时行健康写明、检查照常。与循环板 `src/loops/model.ts` 的契约测试按 §6.8 由后合入的一方加。
- F12：`reopenQuestion` 的结果交给真实引擎（M3 第 6 步之后）提一次，节点上没有 `options`、`recommend`、`crux`、`verdict`、`weight`；四行过 `proposalLineRefusal`；`notice` 与 `body` 里没有两个以上「回「…」」；人放弃之后再数 3 次才再问。
- F13：`peekGrant` 只读（调两次结果相同、放行簿不变）；`outsideDenial` 对项目里的目标返回 `undefined`（F19 一条另有三例），对项目外的登记一条可申报的拒绝（之后 `request_exception` 用它的编号得到 `ask`）；放行说明的第二行按被拒的是谁取三种之一。`RequestsServiceContractCheck` 钉住服务的类型。
- F14：申报开着时，一回合首步没有人的消息就有「still waits」，非首步没有；连着三个回合各有一条；`openRequests` 在 `ask` 之后有这一条、关闭之后没有。
- F15：每种关闭都有一条带 `request: {ref, outcome}` 的提醒；卸载再装一次 guard 行之后，历史里开着的申报得到一条 `lapsed`。
- N29：从最后一条客户端消息以来有一次成功的 `propose_to_human` 时 `request_exception` 返回 `busy`；`propose_to_human` 失败了的那次不算。
- N30、N31：晨报的「另有 n 次」；`effect: 'queue'` 的记录是 `deferral`。
- `d-rules-in-repo`：`projectHomeFor` 的四级取法；两个临时仓库的会话各写各的流水；worker 工作树的会话写主检出的流水；`ensureLlmIgnored` 在 guard 行与 env 行之间只做一次。
- 检查行（0.5 改写）：`checkLineRefusal` 的每条规则各一例（`pwsh` 带 `{files}`、`{files}` 嵌在一项里、命令为空、第一项是 `x.cmd`、名字不合、同一节点里名字重复、`when` 为空表）；`splitArgs` 的引号分组与「什么都不解释」（`$(x)`、`%PATH%`、反引号原样）；`fillCheckArgv` 展开成每个文件一项、以 `-` 开头的名字前加 `./`、跳过带换行的路径、整条命令行超过 28,000 个字符时丢文件并计数。

0.5 加的（对应第 4 轮的发现与对齐轮）：

- F17：人加的检查的提议经假的循环板服务返回的 `detail` 含 `checkCommandOf` 读出的参数表的文字（`commandText`）；没有「已给人看原文」记号的拍板不生效（这一例由循环板合入 `commandDetail` 的一方加，M4 一侧用假服务钉住：`checkCommandOf` 读出的就是节点上的那一条）；`checkCommandOf` 对有几条检查行而没指名、节点未批准、行读不懂各返回 `undefined`；不带 `when` 的行 `own` 为假，M4 自己不跑它，带 `when` 的 `own` 为真。静态检查：`src/env/` 里没有 `node:child_process`，也没有读人加条目的代码。
- F18：申报文字五种变体在焦点标题是「补齐验收条件」、带 `*` 的标题、「M4 guard 补齐与环境」、路径含「门禁」与 `gate.ts` 时都写得出合格的文字（焦点半句省去、路径原样）；`request_exception` 在 `renderPlan` 被造成抛错时返回 `unavailable`、不登记申报、不写流水、行健康降级；`reopenQuestion` 的结果在 plain-ui 第二阶段的常量下对三个标题交给真实引擎都通过（§4.6 末，plain-ui 未合入时带 `M<数字>` 的一例跳过并写明）。
- F19：worker 会话 `cwd` 为 `<临时仓库>/.worktrees/t`，写 `<临时仓库>/src/a.ts` 时 `outsideDenial` 为 `undefined`，写另一个工作树里的文件同样；写 `<临时目录>/notes/todo.md` 时得到编号，之后 `request_exception` 用它得到 `ask`；工作目录不在任何项目里时退回按圈禁根判。`guard-request-worker` 另加一步（§14.1）。
- F20：`REQUEST_EXAMPLE` 里的例子交给 §5.3 第 2 条的参数检查和 `renderPlan`（编号换成一次真实拒绝的编号）都通过，三句各在 80、60、60 的上限内；没有出现练习题领域的词（词表取 `tests/calibration/` 各题的领域词；对 `REQUEST_EXAMPLE`、`guard_lift` 的示范、`CHECK_LIMIT_EXAMPLE`（§6.3.1，交给 `check_limit` 的参数检查，`reason` 过 `plainWordsIn` 为空）与 §6.6 的检查行示范（带 `3s`，过 `checkLineRefusal`）各跑一遍）。
- N35：连着三个回合，申报开着、每个回合首步没有人的消息，各有一条再出示的提醒，不论上一回合是不是以申报文字结束。
- N37：一项检查超时后，`recordRun` 记 `failed` 且 `reason` 含 `timeout`，本会话下一次改动照常再跑；连续 3 次因输出读不懂失败后才不再跑；同一项检查还在后台跑时这一步不起第二个。
- N38：假定时器走到 2 小时，写 `expired`、送关闭提醒、`openRequests` 为空；已过 2 小时的申报不在 `openRequests` 里。
- N40：工作树里改 `src/a.ts`，`env.files-edited` 的 `files` 是 `src/a.ts`、`root` 是工作树的根，筛选 `src/` 的检查跑；一步改了两个检出里的文件，各发一个事件，键不撞。
- N41：M7 的 `rightPath` 认带编号的 `ask_main` 时，worker 被拒之后的下一次调用记 `right-path`；没加之前记 `other`。
- 规则板 0.10：`classifyRecord` 对 `rules:` 开头的 `mode: 'record'`、`mode: 'late'`、`mode: 'enforce'` 加 `effect: 'queue'` 各给 `rule-record`、`late-denial`、`deferral`；不以 `rules:` 开头的 `record`、`late`（`file-tools-only` 的 `late` 除外）是读不懂；晨报写「其中晚到的拦下 k 条」与「只记录 m 条」，违规数不含后者；`keyOf(record)` 等于 `recordKey(JSON.stringify(record))`，与 `auditJournal` 追加的那一行一致；规则板的门调 `noteDenial` 时用这个键，之后的下一次调用留下恰好一条跟进。`GUARD_RULES` 与 `MAIN_AGENT_RULES`、`EXECUTE_RULES` 三张表合起来 id 不重复。

0.6 加的（对应三个决定与一条裁定）：

- 决定一（`d-code-rules-enforce`）：`GuardRule` 没有 `mode` 字段；经 `installRuleGate` 的任何规则判为拒绝都拦，guard 行与图行两条安装路径各一例；声明列出没被撤下的规则；`GUARD_RULES` 没有模式一栏；三条规则各一张表驱动的用例（应拦与相邻不该拦，§3.7）；`ruleStats` 与晨报每条规则一行；兜底的晚到的拦下与下一步之前的纠正提醒（§3.4）；撤下的各例（§3.5 末的 L2）；`checker-config` 与 `scratch-only` 的拒绝带申报编号，`request_exception` 用它得到 `ask`（`REQUESTABLE`）。
- 决定二（`d-credentials-readable`）：读 `~/.dsh` 下凭证文件的调用放行，违规流水里没有任何记录；规则目录里没有 `credential-read`。
- 决定三（`d-timeout-measured`）：假执行器上一项检查先超时再跑完，下一次的值是上一次的 3 倍，到上限不再涨，并在环境提醒里出现「held at its ceiling」一行（只在状态变化时）；`timing.jsonl` 的 `run`、`value`、`timeout`、`estimate`、`queue`（N17）五种行各一例，`value` 的来源三种（估计的带节点、版本、actor、时刻与会话；harness 调整的带依据的运行、倍数、下限；没有估计也没有实测的 `ceiling`），旧值与新值对得上；坏行、读不出、写不进时检查照跑、行健康写明；命令改过之后旧实测不再用；一步等待取这一步所有检查超时里最大的、不超过 20 秒；`checkCommandOf` 返回 `estimateSeconds`；超时的提醒写明检查名、上限、实际耗时与下一次的值；`ownRules` 的句子由常量拼出。评审 F5、F6、F8、F9 加的各例：①`checkTimeout`：预计 1 秒得下限 5 秒、预计 3 秒得 9 秒、预计 25 秒得 60 秒并带 `capped: {wantedMs: 75000}`、没有预计也没有实测得上限 60 秒、实测最慢 24 秒得上限 60 秒（72 秒被截）、超时那一次按上限计入、下一次是它的 3 倍；②`timeoutText` 四种情形（估 3 秒：`超时 9 秒（估 3 秒，乘 3）`；估 1 秒：`超时 5 秒（估 1 秒，乘 3 不足 5 秒）`；估 25 秒：`超时 60 秒（估 25 秒，乘 3 超过 60 秒）`；没有估计：`超时 60 秒（没有估计，先用最长的）`），每句不超过 40 个码点、过 `proposalLineRefusal` 的一行长度上限、`plainWordsIn` 为空，文字里的数与 `checkTimeout` 算出的一致（常量一改文字跟着变）；③`graph_propose`、`graph_edit` 对环境工具节点每条读得懂的检查行附 `timeouts`，对别的节点不附，并各写一条 `EstimateLine`（带会话 id、`actor`、`historyAt`）；④估计的来源：节点由 `propose` 创建，来源是 `propose` 那条历史、`actor` 为 `llm`；之后人把 `<预计>` 改了，来源是那条 `edit`、`actor` 为 `human`；没有 `EstimateLine`（手改文件）时来源仍可记、`session` 缺省、页面写「会话未记」；⑤上限提醒：根 agent 与子 agent 读到不同的环境提醒（子 agent 没有 held at its ceiling 一行，自己那次超时的提醒不含「问人」）；来自估计与来自实测的文字不同；⑥`check_limit`：根 agent 调高、`reset`、子 agent `forbidden`、没被截住 `not_held`、不存在的检查 `unknown_check`、`seconds` 超出 61–600 `invalid`、写不进 `unavailable`；调高之后同一项的 `checkTimeout` 以设置值为 `capMs`，`value` 记录带 `cap: {by: 'setting', …}`，一步最多等多久仍不超过 20 秒。
- 评审 F1、F3、F4：`LiftRecord` 与 `LiftLine` 的 `via` 只有 `'chat'` 与 `'board'`（类型检查加一个把两个类型互相赋值的编译期用例）；`GUARD_RULES` 含 `bootstrap-read-no-shell`（行值 `bootstrap`），违规流水里出现的每个 `rule` 都在三张表之一；`lift-files-only` 对 `guard_lift` 返回 `forbidden`，`hint` 不含 `by hand`、`lifts.jsonl` 的编辑办法，指向 `/rules lift`。
- 决定评审第 2 轮（§19.7）加的：
  - F11：假文件系统的 `appendFile` 抛错，同一会话里连续三次拒绝：三次拒绝都生效，控制台告警一次，`projectJournal` 的 `violation` 三次都返回 `'failed'`，行健康写「3 条违规没有落盘」（这一例在真实的 `provideRowHealth` 上做，断言见下面的 F13 一条）；`appendFile` 恢复之后再拒绝一次，新记录落盘、返回 `'written'`、行健康仍写 3；会话没有项目目录时拒绝生效、返回 `'no-home'`、不计入丢失数、行健康写「无项目目录，违规不落盘」；两个项目的会话各数各的；`journal` 返回空的行（假的旧行）不计数；`rowJournal` 的 `usage`、`decision` 行为不变。
  - F12：`check_limit` 的描述与示范；`ENV_TOOL_NAMES` 与注册一致（`tests/contracts.spec.ts`：少登记一个名字就失败）；`check_limit` 不在 `ORCHESTRATION_RESIDENT_TOOLS` 里，GLM 路由上走延迟；`reason` 含 `plainWordsIn` 的词时 `invalid`；`seconds` 不高于现在生效的上限时 `invalid`，`hint` 写现在的上限；多余字段 `invalid`；`reset` 而这一项没有设置时返回 `noop`。
  - N9：被上限截住后 `raise` 到 120 秒成功；紧接着再 `raise` 到 200 秒返回 `not_held`；之后这一项在 120 秒处又超时一次，再 `raise` 成功；`reset` 之后紧接着 `raise` 返回 `not_held`；60 秒处七天前的超时不算数。
  - N10：根 agent 的上限提醒逐字钉住，写明调高上限不用人批准、改检查行要人批准，不含 `without asking the human` 之类让主 Agent 以为改检查行也不用问人的话。
  - N12：`timeouts[].text` 每条不超过 40 个码点，可原样当 `mustShow` 的一片（M3 一侧的核对由 M3 的 L2 钉住）。
  - N11、N13：各例写在 §3.5 末的 L2 里（否定词、最后一条用户来源的消息、`lift-files-only` 的提示与纠偏）。
  - N14：无代码改动；`graph-ops-decisions.json` 里有对 `d-credentials-readable` 的批注（格式合 JSON 数组、目标节点文件存在）。
- 决定评审第 3 轮（§19.8）加的：
  - F13（评审第 3 轮）：全部在真实的 `provideRowHealth` 上做，不用假的健康对象。①`RowHealth.note`：`report` 之后 `note`，`view.session(id).reason` 是「原因；说明」，状态至少 `degraded`；`note` 之后同状态同原因的 `report` 不冲掉说明；`note(id, key, undefined)` 撤回；没有底报告的会话由激活状态加说明合成；第 5 个键被丢掉，超过 80 个码点的说明被截；没有会话 id 的调用被丢掉；`inactive` 的行加说明仍是 `inactive`；超过 64 个会话时最旧的会话连同它的说明一起离开。②guard 行：`appendFile` 抛错，同一会话里三次拒绝；然后同一会话再来一次被放行的调用和一次被拒的调用，两次之后 `view.session(id).reason` 里都还有「3 条违规没有落盘」（今天的做法在第一次放行的调用之后就看不到了）；承诺落定的那一刻就有，会话之后没有任何调用时也有；图行（`installGraphFileGuard` 经 `installRuleGate`）同样一例；判定器抛错的规则在同一会话的下一次 `report` 之后仍点名（`rule-errors`）。③缺口记录：`appendFile` 抛错三次（两条 `denial`、一条 `followup`），恢复之后下一次写入：文件里依次是一行 `kind: 'gap'`（`lost` 为 3，`classes` 为 `{denial: 2, followup: 1}`，`since`/`until` 是第一条与最后一条丢掉的记录的 `at`，`code` 是假文件系统抛出的错误码）和那条新记录，二者在同一次 `appendFile` 里；`violation` 返回 `'written'`；`classifyRecord` 给 `gap`；晨报「流水的缺口」写 3 条，违规数不含它，「N 行记录读不懂」不含它；`ruleStats` 的 `unrecorded` 是 `{records: 3, gaps: 1}`；之后再写不再带缺口。④合并追加本身失败：缺口并回，新记录也计入（`lost` 为 4），返回 `'failed'`。⑤并发：失败之后两次 `violation` 同时调用，只有一行缺口。⑥`flush()`：失败之后会话结束（`session/disposed`），文件里单独多一行缺口；没有待写缺口时什么都不写；写入仍失败时缺口并回、不抛错。⑦没有项目目录：不产生缺口、不计数。⑧`keyOf(record)` 不受缺口行影响。
  - F14（评审第 3 轮）：见 §3.5 末的各例（真实的临时 git 仓库加 `git worktree add`）：工作树里的相对路径与绝对路径、主检出的会话写工作树里那一份、`.worktrees/` 之外且会话开始后才建的工作树、shell 的几种写法、同名但不是这个确切路径的文件、别的项目的同名文件、项目在 git 之外、合入后的晨报对账。
  - N15：`guard_lift` 成功的返回与 `unavailable` 的 `hint` 逐字钉住，规则板命令只带「once the rules board offers it for code rules」；`lift-files-only` 的纠偏四部分逐字钉住，不含 `guard_lift`、`main agent`、`/rules`。
  - N16：上限提醒逐字钉住，含完整的 `check "tool-3/eslint"`；把提醒里引号中的键原样交给 `check_limit`，不返回 `unknown_check`；两个工具节点各有一项叫 `lint` 的检查时两行提醒的键不同。
  - N17：假执行器上两个名额被占满：①第三项检查这一步的提醒是「queued behind 2 running checks」，不写超时记录、不计入连续失败；②排了 `CHECK_QUEUE_WAIT_MS` 仍没开始的检查不起进程，`timing.jsonl` 多一行 `queue`，提醒是「did not run」，`recordRun` 记 `failed` 且 `reason` 含 `queue`，下一次改动照常再排；③两项上限已调到 600 秒的检查：第二项留在队里，不挡在它后面的普通检查，普通检查在 60 秒内开始；④没有调高上限的检查，行为同 0.5（最坏等 60 秒）；⑤`timing.jsonl` 整理时 `queue` 行留最近 20 条；晨报「检查的超时」一节列出排队太久没跑的次数；⑥循环板页上「改完文件就跑检查」展开的 `ownRules` 里有第五行，排队丢弃这条规矩在明面上（`d-rules-visible`，评审 finish2 轮 N21）。
  - 评审记下的未核实点（不是发现）：压缩之后 `session.deriveMessages()` 是否仍含最近一条人的原消息，`guard_lift` 与 `request_exception` 读人的回话都依赖它。L2 在假宿主上压缩一次再调：仍含时照常；不含时 `guard_lift` 返回 `not_said`、申报读不到回话而不放行（两者都是失败时拒绝，不会多放行）。真机上是否含，留在 L4 第 10 项观察。
- 裁定（`d-one-lift-path`）：M4 没有注册任何斜杠命令（静态检查：`src/guard/` 里没有 `commands.register`）；假的规则板调 `liftService(ctx).setLifted`（`<行>:<规则 id>` 与纯 id 两种写法）写一行 `via: 'board'`，`lifted(cwd)` 读得到；经 `guard_lift` 与 `setLifted` 的撤下，在门里、声明里、晨报里效果相同；规则板没有接线时 `guard_lift` 这一路照常可用。

### 14.3 L4

见 §13.4。

### 14.4 标定

K1 量「拦截后下一步走对」在新文案前后的变化与完成率（GLM-5.3 与 GLM-5.3-Flash 各 3 次）。仓库里的标定集只是回归与消融的守门（人 2026-10-29 的定位，M7 设计 §0 的 m7-10 一条）；文案好不好，最终看自举与真实项目里的跟进记录。

## 15. 不做的事

- 装工具走同步卡（`docs/ORCHESTRATION.md` §7.3）的探测：§6.4 没有列它；环境分支用上之后，作为一条新规则另提（全局安装命令的列表要按命令位置读，等 M7 的 `commandsAt`）。
- 惯犯升级（§6.6）。
- 格式类问题的自动修复（§7.5「格式类问题自动修」）：harness 改模型刚写的文件，模型下一次 `edit` 的 `old_string` 可能对不上；本仓库也不用格式化工具。项目有格式化工具节点之后另做。
- 规范阶梯的提议、周报、四答晨报（M7）；规则板 R1–R7（同一里程碑，另一份设计）。
- 规则的试运行与按项目覆盖：没有（`d-code-rules-enforce`）。「可关」到行一级（`docs/CHARTER.md` §7.1 条款 1）；单条代码规则的撤下见 §3.5。
- `file-tools-only` 的申报：它管习惯，不设例外（§5.2）。
- 读凭证的任何规则（拦截或只记录）：agent 可以读（`d-credentials-readable`，§4.2）；凭证迁到系统钥匙串属 `docs/DESIGN.md` §4.1 的规划。
- 遮盖违规流水里的命令原文：不做（评审 F10，§4.2）。流水在项目的 `.llm/`，不进 git；遮盖要依赖 M5 还没有的 `redactSecrets`，`hex` 类还会把完整提交号判成密钥。人要加时，在 `subjectOf(call)` 里把 `command` 与 `target` 过一遍 `redactSecrets` 再入记录，并在 §13.3 加一行对 M5 的依赖。`d-credentials-readable` 节点正文写「密钥不进日志」，与这里的不遮盖有出入，请编排方裁定（批注在 `graph-ops-decisions.json`，评审第 2 轮 N14）。
- 把撤下记录与调高上限的设置做成人手改文件的入口：不做。撤下只有 `guard_lift` 与规则板的 `/rules lift` 两种说法（`d-one-lift-path`），`lift-files-only` 的拦截提示不指点手改（F4）；调高上限只有 `check_limit`。
- 给 `limits.jsonl` 加保护规则：不做（§6.3.1、§11）。它只影响一项本机检查最长跑多久，有硬顶和记录。
- 问答卡与面板上的批准：`d-chat-not-cards`、`d-ui-look-not-operate`。面板只列出开着的申报（§5.8），不批。
- M4 自己的脚本执行器、条目的存放与同意的路径、执行人加的检查条目：归循环板（接缝裁定）；M4 自带的检查器经循环板的共用执行器起进程，不自己 `spawn`。
- 把 M4 的四条代码规则改成板上的条目：`d-boards-as-hooks` 写明代码里的规则原地不动、照旧列出。
- 在没有会话控制器的进程（headless 运行、探针、练习题）里跑改完就跑的检查：那里没有循环板服务（循环板 0.6 §3.1），自带的检查器也不跑（§6.1.2）。
- 用户级的存放：M4 没有要全局存的东西（§2.4）；跨项目的经验与记忆不归 M4。
- ACP、SDK 会话里的批准：那里送来的人的消息没有 `rpcId`（H19），申报只能等 DSH 客户端里的回话；这类会话的 agent 收到 `not-client` 的说明。
- git 快照（M3 附录 0.5 §2.5）与子 agent 的 git（M7 的派发）：M4 只让它们共用跟进与流水的分类。
- 指标流水（`metrics`）的转写：M4 的记录先写违规流水，指标设计定稿时由它决定怎样转写。
- 为「记录写不进流水」另找落点（用户级目录、另一个文件、系统日志）：不做（评审第 3 轮 F13）。写不进的原因多半在 `.llm/` 所在的磁盘或权限，另开的落点在同一处，同样写不进；用户级目录违背 `d-memory-scope`（M4 在用户级什么都不存）。写入一直不恢复、或进程在恢复之前退出时，待写的缺口丢失，信号只剩行健康与控制台。
- 列举 `git worktree list` 来护工作树里的 `lifts.jsonl` 副本：不做（F14）。按目标相对它所在检出的根判，新建的工作树自动在内（§3.5）。
- 让排队的检查无限等：不做（N17）。排队有上限，调高了上限的检查合起来至多占一个名额（§6.3）。
- 拦 git 命令对 `lifts.jsonl` 的改动，或让门拒绝流水里没有记录的行：不做（评审 finish2 轮 F15）。M4 的规则一律不判 git；换电脑之后流水不在，门拒绝无记录的行会作废人真实的撤下。靠晨报的对账发现，是已知边界（§3.5、§3.10、§11）。

## 16. 由 agent 定、人可推翻的事项

| 事项 | 采用 | 没选的做法与理由 |
| --- | --- | --- |
| 规则要不要有模式 | 没有：写在代码里的规则一律生效，从所在的插件行启用那天起就拦（`d-code-rules-enforce`，人定） | 先影子后拦截（0.5 与宪章 0.7 的做法）：人定不要；规则模式放在规范节点正文或行配置：LLM 能改正文、行配置绕过评审（0.5 的理由，随模式一起不再需要） |
| 新规则启用即拦 | 三条新规则（`suppression-reason`、`checker-config`、`scratch-only`）与护住撤下记录的 `lift-files-only` 都一启用就拦；`checker-config`、`scratch-only` 进可申报名单，让拦截有出路（§5.3） | 不进可申报名单：没有试运行期去量误伤，被误拦的 agent 会卡住；`suppression-reason` 不进：它的正路就是把理由写上 |
| 读凭证文件 | 不设规则，也不记录（`d-credentials-readable`，人定） | 保留只记录的规则做审计（0.5）：人要的是能读 |
| 草稿区 | `<工作区>/.llm/scratch/` | 根目录 `scratch/`：要改每个项目的 `.gitignore`；系统临时目录：工作区圈禁拒绝写，汇合门禁也看不见 |
| 误拦怎样被发现 | 拦下带规则 id 记进违规流水；晨报按规则写次数、走对的比例、最近一次的样子、原样重试次数；规则页读同一份 `ruleStats`（§3.6） | 抽样标注与精确率召回率：只为转正服务，标注要人或 agent 逐条做 |
| 「拦截后下一步走对」的度量留不留 | 留：不依赖试运行；规则板 0.10 已采纳 `observe`、`noteDenial`；拦截一启用就生效，纠偏文案的好坏是唯一的自动信号（§3.6） | 删掉：省 `followup.ts` 一大半，但要改已放行的规则板设计，而且正路写得清不清只剩人事后读流水才知道 |
| 撤下一条规则的办法 | 人只有一条路（`d-one-lift-path`）：对主 Agent 说，或在规则板上打 `/rules lift <id>`。M4 存记录（仓库的 `docs/guard/lifts.jsonl`，只追加）、在门里查，给主 Agent 一个工具 `guard_lift`（照 M3 核对人的回话的办法核对原话：客户端送来的最近一条人的消息里的一段、起止在边界上，另要含撤下意图词、至少 4 个码点、一条消息至多换一次撤下），给规则板一个服务 `glmHournessLifts`（§3.5） | M4 自己注册面向人的 `/guard` 命令（本稿第一版）：人有了第二条路，违背裁定；记录放在 `.llm/`：不进 git，一个人的决定没有留痕与评审，换电脑丢；命令行 `npm run -s guard -- lift`：agent 能经 shell 运行，等于 agent 可以自己撤；像申报那样再确认一次：人已经说了要撤，再问一遍多一步 |
| 撤下记录的保护 | 新规则 `lift-files-only`，判法同 `graph-files-only` 但只认 `docs/guard/lifts.jsonl` 这个确切路径、不判 git，不可申报；`guard_lift` 撤不了它（`liftVia: 'board'`），只有规则板的 `/rules lift` 撤得下，规则板接线之前它没有撤下的路（§3.5） | `guard_lift` 也能撤它：agent 撤掉它就能写记录，再撤任何规则，核对原话的防线一撤就整体失效；让人手改 `lifts.jsonl`（评审指出的第三条路）：手写的行没有合法的 `via`，晨报会当篡改；不保护：agent 改一行文件就能撤下任何规则；把记录放进项目图：图引擎的 `relay` 在普通会话里不核对 |
| 撤下原话的核对强度 | 边界（同 M3）加撤下意图词表（命中词前紧挨着否定词的不算）加至少 4 个码点加一条消息至多一次（§3.5） | 只核对「是人的消息的一段」（0.6 初稿）：人说「继续」，模型引用「继续」就能撤下圈禁，等于 agent 自己能撤；给每条规则维护一份说法表来绑定规则与原话：维护成本高于它挡住的风险，剩余风险由撤下回告人加晨报加一句话恢复兜住 |
| 违规流水里命令原文的遮盖 | 不遮盖，写明暴露面（§4.2、§15） | 调用 M5 的 `redactSecrets`：M5 还没有，`hex` 类误伤提交号；写 `looksSecret` 在流水里起作用（0.6 初稿）：M4 不调它，说法不成立 |
| 估计的来源怎样记会话 | `graph_propose`、`graph_edit` 返回前把会话 id 写进 `timing.jsonl` 的 `EstimateLine`（图历史没有会话字段），找不到时写「会话未记」，不猜（§6.3.1） | 请 M3 给 `HistoryEntry` 加会话字段：改已放行的图设计，等 dogfood；写进图节点：图是人定的东西，不放 harness 的记录 |
| 只能事后发现的规则怎么办 | file-tools-only 的兜底改成晚到的拦下记录加下一步之前的纠正提醒（§3.4） | 拦下下一次 shell 调用直到 agent 说明：已经写出的文件不是下一次调用的错，判错的代价高；只留记录不提醒：agent 不知道有文件被改了；删掉兜底：读法的漏洞就没有任何迹象 |
| 超时怎么定 | 超时 = 3 倍运行时间，第一次由预计、跑过之后由实测定，不低于下限 5 秒、不超过上限 60 秒（§6.3.1，`d-timeout-measured`，人定；下限由编排方 2026-10-31 的细化裁定保留，各设计把下限写在最大值旁） | 固定上限（0.5）；LLM 跑完一次后手写实测时间：抄数会错，harness 手里本来就有 |
| 检查行的预计 | 可选的 `<预计>` 写在检查行里（§6.1.1），是预计的运行时间；第一个超时是它的 3 倍，只有没写预计才用上限；人批准时看到算出的超时和这个估计（§6.3.1） | 必填：接管项目的默认工具节点与已有节点都要改；图节点加字段：检查行已是验收条件的一部分，人批准节点时能看到 |
| 超时账放哪 | `.llm/env-checks/timing.jsonl`，只追加，整理时留最近的（§6.3.1） | 写进图节点：图是人定的东西，harness 的实测数不该写进去；放进循环板的运行记录：M4 自带的检查不经循环板的执行记录 |
| 3 倍超过上限时 | 保持上限，只告诉主 Agent（环境提醒，只给根 agent），由主 Agent 自己处理：用 `check_limit` 把这一项的上限当作可撤回的设置调高（61–600 秒、写理由、有记录），不问人；或者拆小、收窄检查，那是改检查行，照常要人批准（§6.3.1，编排方 2026-10-31 的细化裁定，后一条是 agent 对裁定里「拆小或收窄」的读法，可推翻） | harness 自动抬高上限：人定了不自己抬高；每个 agent 都收到并写「问人」（0.6 初稿）：子 agent 不能问人，读到只能忽略；改代码里的常量要人拍板（0.6 初稿）：为一项本机检查慢一点就走一次全审，太重 |
| 上线前怎样挡误拦 | 手写的表驱动用例（`tests/guard-rules.spec.ts`，事故种子加每条规则的不触发情形），新增或改规则的提交同时加用例（§3.7） | 沿用回归语料（格式、脱敏、`corpus add`）：语料的来源是标注和回放，两样都删了，剩下的只是一张手写表，不需要那一套格式 |
| 任务名 | `m4-shadow` 改名 `m4-gate`（拦截机制与撤下）；七个任务的数不变 | 保留旧名：名不符实；节点还没建，改名不用动图 |
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
| 规则板的 `record` 与 `late` | `classifyRecord` 只认 `rules:` 开头的这两种（`late` 另认 `file-tools-only` 的晚到的拦下），分别是 `rule-record`（不进违规）与 `late-denial`（进违规、另列） | 让规则板自己数、不经 `classifyRecord`（M4 加之前的做法）：读流水的数字会分叉；不限定 `rules:` 前缀：M4 自己的规则出现这两种取值时是 bug，该报读不懂 |
| 配置与基线文件的路径放在哪 | 工具节点验收条件里的 `config` 行（§6.1） | 正文的 `配置：` 标签（0.2）：正文模型能改，规则启用之后删一条路径就能不经申报改那个配置（评审第 2 轮 N23） |
| 检查的通道 | `agent/pre-step`，每步等一次，最多等多久按 §6.3.1 | `tools/post-execute`：同一步的写入逐个排队 |
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
| 代码规则怎样安装 | 唯一的 `installRuleGate`，`evaluate` 删除 | 保留 `evaluate`、各行自己写：跟进与撤下要写好几份，漏一份就静默；`evaluate` 只返回第一个拒绝，别的拒绝悄无声息地丢掉 |
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
| 第三次修复之前 | 只在 LLM 重开时提问，不拦截 | 人的重开也问：问人他自己的决定；拦截：要另一条门禁，而且一启用就拦，误拦的代价落在被卡住的 agent 身上 |
| 规则板与 git 快照门的跟进 | 请它们第一件事调 `observe`、拒绝时调 `noteDenial` | 只覆盖经 `installRuleGate` 的拦截：规则板拦下的调用量不到，验收的说法也要缩小（评审第 2 轮 N26） |
| 丢掉的违规记录数放哪（评审第 3 轮 F13） | 两处：①行健康的持久说明 `RowHealth.note`，附在会话的行健康上，做在 `provideRowHealth` 里，各行的 `report` 不用改（活着的进程里的信号）；②流水里的 `GapRecord`，`rowJournal` 记下待写的缺口，下一次写成功时补一行，会话卸载时 `flush()`（进程重启之后还在，晨报与规则页本来就读这份流水，`ruleStats` 的 `unrecorded` 给规则页一个数）。落点选流水自己（§3.2） | 只用行健康、让各行合并 `installRuleGate` 导出的 `gateProblems(sessionId)`（评审给的另一条）：每行的每次 `report` 都得记得合并，漏一行复发，而且进程一退就没了，晨报与规则页看不到；另开一个文件或放进用户级目录：多一条读路径，与 `.llm/` 同处会同样写不进，用户级违背 `d-memory-scope`；每次失败立刻抛给调用方：写记录不能挡住拦下，拦下照常生效 |
| worker 工作树里已提交的 `lifts.jsonl` 副本怎么护（F14） | `lift-files-only` 按「目标相对它所在检出的根是 `docs/guard/lifts.jsonl`」判，主检出、任何工作树（含会话开始后才建的）、调用方所在的检出都在内；shell 文本里提到这个路径尾巴的写命令也拦（§3.5） | 比规则对象里的一个绝对路径（0.6 前稿，护不住副本）；列举 `git worktree list` 或读 `.git/worktrees`：新建的工作树会漏，每次判定多一次读；只靠 M7 的写入范围：范围含 `docs/` 的 worker 挡不住 |
| 检查进程排队的等待上限与名额（N17） | 排队超过 `CHECK_QUEUE_WAIT_MS`（3 × 一步等待，60 秒）就不再等，记「没跑」；上限被调高的检查合起来至多占 2 个名额里的 1 个；数是 agent 定的，可推翻（§6.3） | 不设上限：两项卡住的 600 秒检查让全进程的检查静默排队；每项调高的检查各占一个名额：同样会占满；排队超时之后自动重排：结果送到时改动多半已过时 |
| git 命令改了 `lifts.jsonl`（`git apply`、`git cherry-pick`、`git merge` 带进新行，`git checkout`、`git restore`、`git revert` 换回旧版本）怎么发现（评审 finish2 轮 F15） | 门不判 git，写成已知边界；晨报比每条规则的终态与逐行，两个方向都查，对不上的规则各写一行，只是提醒，不改撤下状态（§3.5、§3.10） | 门拒绝流水里没有记录的行：换电脑之后流水不在，人真实的撤下会全部作废；门在读文件时对账：换电脑同样误判，且每次判定多读一份流水；按循环板的做法把对不上的条目当成「在外面变了」而不跑（循环板有自己的 `repo-written.json` 指纹，`lifts.jsonl` 没有，加一份指纹文件就多一个要护的东西） |
| 申报文字与第三次修复的问话给人看的版式（评审 finish2 轮 N22） | 沿用现在的做法：M4 只给记录的字段（题目、背景、推荐、疑问、不做、问话），排版与检查在 M3 的 `src/graph/proposal.ts`（`renderProposal`、`proposalLineRefusal`）；`d-ask-three-gates` 把人读到的版式改成「确认一个推荐」的一个是非问句时，M3 改渲染器，M4 只改钉住版式的那几例 L2（§5.4、§14.2 的 `renderPlan` 一条），不改记录的字段。两种问话本来就是只问一个是非问句：「可以」放行这一次，「先停下查原因，可以吗？」 | 现在就在 M4 里自己改版式：与 M3 已放行的附录 0.5 §3.3 是两份规则（评审第 3 轮 N27 已经把它们合成一份）；等 M3 改完再设计 M4：M4 的开发不依赖这一件 |
| 撤下的返回与提示里规则板的命令（N15） | 写出可用的办法（再调 `guard_lift`），规则板的命令一律带「once the rules board offers it for code rules」 | 接线之前不提：接线之后还要再改一次文案；用一个开关常量：把 M4 的文案绑在规则板合入的那一个提交上 |
| 命名 | 行 `glm-hourness/env`（补丁里 `dsh-hourness/env`）、目录 `src/env/`、工具 `request_exception`、规则 `suppression-reason`、`checker-config`、`scratch-only`、`lift-files-only`、工具 `guard_lift`、服务 `glmHournessLifts`、任务 `m4-gate`、notice 来源 `hourness-guard`、纯函数 `checkTimeout`、`timeoutText`、`liftedRules`、`RowHealth.note`、记录 `GapRecord`、常量 `CHECK_QUEUE_WAIT_MS`、工具 `check_limit`、notice 来源 `hourness-checks`、`hourness-env`、`hourness-request`、命令行 `npm run -s guard`、服务 `glmHournessRequests`、事件 `env.files-edited` 与 `graph.third-reopen`、条目 `env.checks-after-edit` 与 `graph.third-rework`、服务 `glmHournessEnv`、读法 `checkCommandOf`、纯函数 `fillCheckArgv`、`formatCheckOutput`、`personTitle`、`displayPath`（M4 定名）、人加的检查动作 `check`（循环板的名字） | — |

## 17. 待人定的事项

按 `d-ask-three-gates`（人 2026-10-31，试行；取代 `d-chat-not-cards` 与 `d-plain-questions` 的四行加粗版式，评审 finish2 轮 N22）：只问人的事，一项一个是非问句，推荐与理由写在句子里，真有代价时加一句，人回「可以」就是接受。人读到的话与图上的记录分开：记录保留问了什么、推荐、理由、代价、没选的做法、人的原话这六个字段，人读到的只有下面框里的那句话。D1 属于「确认一个推荐」一类。平常它与一页放行稿合成一项（重写后的 `onepage.md`「要你定的」里那一件就是合并之后的问法，至多三件、放在最后）：人回一句「可以」，放行与 D1 一起定。人只想单独谈 D1 时用下面这一句。

### D1 M4 七件事怎样算做完（与放行合成一项）

人读到的话（104 个码点，不含 `验收`、`标定`、`门禁`、`投影`、`补遗`；35 是 §1.2 表里的条数）：

> 这批补齐拦截规则的七件活，我拟了怎样算做完的清单，共 35 条，人话版另附。建议就按这份清单定下来，并放行开工，哪条不对再单独改；可以吗？代价：你要是不想每次放行工作区外的写入都回「可以」，申请那一条要重写。

图上的记录（不给人看）：问了什么：七个任务怎样算做完的清单（草稿是 §1.2 表里「建议验收」一列）照草稿定下并放行；推荐：照草稿；理由：草稿经决定评审改过四遍，人逐条改比从零写省力；代价：人若不想逐次回「可以」，`m4-request-card` 的第 3 条要重写；没选的做法：先逐条读完再定（35 条，按 §1.2 表里七个任务行「建议验收」单元格重数是 7,953 个字符，约 8,000）；人的原话：照录。清单的人话版是同目录的 `onepage-done.md`，由重写一页放行稿的那一步写；它写出之前，「建议验收」一列是它的原料。条数与字数在编排方问人之前再数一次，有出入就改这一段的数。

给编排方：七件是 §1.2 表里的七行，草稿是「建议验收」一列。人要改哪条，按他的原话只改那一条，其余照草稿。改「怎样算做完」属于必须问人的第 1 类（`docs/ORCHESTRATION.md` §2.9.1）。人对「代价」那一句说不行时，那是改 M4 的设计方向（`d-design-onepage` 的第二档），回到本设计的循环。

### D2 作废：回放已删

人 2026-10-30 回「不介意」（选 B）：用今天的规则重看本机 DSH 历史会话里的工具调用，只读命令文本与路径，不读对话内容。这一问是为影子期攒样本而设的；人 2026-10-31 定 `d-code-rules-enforce`（规则启用即拦，不设试运行期）之后，回放、标注与回归语料都删掉（§3.6），M4 不再读 DSH 的会话日志，也没有要放进 `tests/guard-corpus/` 的样本。人当时的同意不需要收回，也不需要重问；一页放行稿里不再写那三样元数据。

### D-timeout 已定：脚本与检查的超时怎么定

人 2026-10-31 的原话：「超时那就这样定。不过还是我说的现在拿不准的事情，要做到优雅失败以及可追溯性」（图上 `d-timeout-measured`）。他定的是编排方的推荐：写脚本或检查的 agent 先估一个运行时间，超时 = 3 倍运行时间，人同意时看到的是超时，旁边写它从哪个估计算出来；跑过之后由 harness 按最近几次里最慢一次的 3 倍定，不低于下限、不超过上限（编排方同日的细化裁定）；LLM 不手抄实测数。他加的两条：优雅失败（超时不让行崩、不丢工作，给 agent 的话写明是哪一项、上限多少、跑了多久、接下来怎样，估错只影响下一次的值）；可追溯（每个超时值记来源、时间与旧值，每次超时记检查、上限、实际耗时与结局，页面和晨报里看得见，3 倍超过上限时保持上限并告诉主 Agent）。M4 的落点只有 §6.3.1 一处，别处引用它；循环板、规则板、M7 各写自己的一处，请求在 §18 第 5 条。这一条已定，一页放行稿里不再就它提问，只告诉人 M4 的检查行多了一个可选的预计秒数，他批准工具节点时看到的是算出的超时和它的来源（§6.3.1）；超时被上限截住时由主 Agent 自己处理，不来问人。

## 18. 交给编排者记图的事项

本设计不写 `docs/graph/`。第 5 条是 agent 之间的接缝请求，不是人的决定，这一稿写完时就记（评审第 3 轮 N32），草稿在同目录的 `graph-ops-decisions.json`（0.5 的是 `graph-ops-align.json`，0.4 的是 `graph-ops-v04.json`）；第 1–4 条在人放行之后由编排者记：

1. D1：编排方在对话里按 §17 的那一句问，一项「确认一个推荐」（与 `onepage.md` 的放行合成一项，不另起一问）；人回答后在 `m4` 下记一张人定的提议式待决，字段（问了什么、推荐、理由、代价、没选的做法）取 §17「图上的记录」，结论带人的原话（评审 finish2 轮 N22）。D2 的回答已批注在 `m4` 上（2026-10-29T17:33Z），随回放删掉作废（§17）；D-timeout 已定（`d-timeout-measured`），不再问。
2. D1 同意时，在 `m4` 下建 `m4-gate`（0.5 叫 `m4-shadow`，节点还没建）、`m4-rules`、`m4-checks`、`m4-env`、`m4-suppressions`、`m4-cleanup`，验收按 §1.2；`m4-request-card` 补上验收（带人的原话），正文里「经决策卡申报」「复用 M3 的 `decision_card` 与以人的身份写图」改为「在对话里申报，人的下一句话决定」，对 `m3-5` 的依赖改为对提供 `dispatchRoot` 的 M3 第 4 步的任务。K1 作为 `m4-gate` 下的子任务，加一条 `depends` 指向 `ablation`。
3. 规范节点分两批提议（挂 `orch`；每条 guard 框架的规则一个，正文带 `级别：门禁`、`规则：<id>`，不再有 `模式：` 标签）：G1 合入之前提 `workspace-containment`、`file-tools-only`、`graph-files-only`；G3 合入之前提 `suppression-reason`、`checker-config`、`scratch-only`、`lift-files-only`。§3.8 的契约测试读它们，分两批是为了每一步合入时测试都成立（评审第 2 轮 N21）。
4. E2 之前：在 `hourness` 下提议特性 `env`，与 ESLint、TypeScript 两个工具节点（正文写用途、用法、选择理由、安装位置；验收条件里 ESLint 节点带 `config eslint.config.js, eslint-suppressions.json` 与 §6.1.1 的 `check eslint eslint-json 3s $ …` 行，TypeScript 节点带 `config tsconfig.json` 与 `check tsc tsc 2s $ …` 行（3s、2s 是写节点的 agent 对一次运行的估计，超时是它的 3 倍，不低于 5 秒；人批准节点时看到的是超时和它从哪个估计算出来：`graph_propose` 的结果里有这一句，§6.3.1），检查行带 `when`），另把 knip、jscpd、gitleaks 记成工具节点（不带检查行）；由人批准，批准即是 M4 自带的检查器生效。本仓库不另加人加的 `check` 条目；要时由人在主 Agent 的对话里提，同意时看到命令原文（§6.1）。
5. 给相邻设计的接缝请求（§2.3、§13.3）。它们都针对已放行的设计，本稿不改那些文件，按 `d-freeze-until-dogfood` 写成接缝请求，等 dogfood 之后处理（0.4 的 `graph-ops-v04.json` 里的几条随本稿作废或已被对方接住）：
   - `schedules`（循环板 0.6）：0.4 请它改的五处，第 ①②④ 点撤回（人加的检查由循环板的执行器跑，M4 不执行人加的条目，不要读条目的函数与认人的条目的 `recordRun`），第 ③ 点由 0.6 的 glob 接住，第 ⑤ 点由 `runCommand` 的 `queue` 接住；第 ⑦ 点（再给人看一张已有的提议式待决）M3 附录 0.5 已加。仍请它做的只剩四件小事（⑥⑧⑨⑩）：⑥ `loops:schedule-tools`、`loops:files-only` 经 `installRuleGate` 安装（G1 删掉 `evaluate`）、登进 `GUARD_RULES`，读流水用 `classifyRecord`；⑧ 页面在人加的 `check` 条目下写「M4 自带的检查器也跑这一条」时，取 `checkCommandOf` 结果里的 `own`（§6.1.2）；⑨ 周报的「反复超时」一节是否也数 `self` 条目的 `recordRun`（M4 的超时报 `outcome: 'failed'`、`reason` 含 `timeout`，§6.3.1），由循环板定；⑩ 人加的 `check` 条目的超时同样按 `d-timeout-measured`。已放行的循环板 0.6 把 `timeoutSeconds` 当超时本身（§6.6：5–1800 秒，缺省 60 秒），与裁定有一处差别，等 dogfood 之后处理：`checkCommandOf` 把检查行的预计秒数 `estimateSeconds`（预计的运行时间，不是超时）交给循环板，循环板的执行器第一个超时取预计的 3 倍，跑过之后取最近几次里最慢一次的 3 倍，都不低于循环板写在自己最大值旁的下限（现有取值范围的下限是 5 秒）、不超过 `timeoutSeconds` 的上限；没有预计时取缺省值；3 倍超过上限时保持上限并只告诉主 Agent，由它自己处理，不问人；每个值与每次超时有记录、页面和晨报看得见；写在循环板自己的设计里一处。M4 0.6 初稿写成「以预计为第一个值」，与裁定相反，已更正。M4 已按 0.6 §17 的四条交 `env.checks-after-edit`（带 `ownRules` 与 `details`）、`env.files-edited`（`emit`，先问 `listens`）、`checkCommandOf` 与两个纯函数，并报每次送出的结果（§6.8）。
   - `rules`（规则板 0.10）：它在 §10.7 的「M4 设计 0.4」一节接住了 M4 的三件，那一部分没有新的请求。M4 这一侧按它的取值做：`GUARD_RULES`（§3.8）、`classifyRecord` 认 `rules:` 开头的 `record` 与 `late`（§3.2）、`observe` 与 `noteDenial` 的调用形状（§3.3）。规则板 R7 在 M4 的 `classifyRecord` 合入之后可以改用它，数字不会分叉。0.6 新增的请求（`d-code-rules-enforce`、`d-credentials-readable`、`d-one-lift-path`、`d-timeout-measured`，都等 dogfood 之后）：一、§10.1 的代码规则目录与映射里，guard 行的规则是 `workspace-containment`、`file-tools-only`、`suppression-reason`、`checker-config`、`scratch-only`、`lift-files-only`，没有 `credential-read`；条目没有 `mode` 一栏；规则页上不写「只记下，不挡」，也不显示「人标过的误判数」（改读 `ruleStats` 的次数与撤下状态）。二、人在规则板上打 `/rules lift <规则 id>` 与 `/rules restore <规则 id>` 时，目录里 `<行>:<规则 id>` 的代码规则交给 M4 的服务 `glmHournessLifts.setLifted`（§3.5），规则页读它的 `lifted` 显示「已撤下 · 时刻 · 原话」；M4 不另设面向人的命令（规则板怎样接 `/rules lift` 的整体请求由用户旅程那一侧写在规则板的节点上，这里只列 M4 一侧的接口，不重复）。三、`mode: 'late'` 的记录除 `rules:` 开头的以外，还有 `file-tools-only` 的晚到的拦下（§3.2），规则页与晨报按晚到的拦下读。四、拦路脚本的超时按 `d-timeout-measured`。已放行的规则板 0.10（`.agents/tasks/rules/design.md` 第 155、870、1995 行）把条目写的秒数当超时本身（默认 10 秒，每条可写 1–30 秒），与裁定有一处差别，等 dogfood 之后处理：条目里写的是写脚本的 agent 估的运行时间，第一个超时是它的 3 倍，跑过之后是最近几次里最慢一次的 3 倍，都不低于规则板写在最大值旁的下限（现有取值范围的下限是 1 秒）、不超过最大 30 秒；没有估计时用缺省 10 秒；3 倍超过最大时保持最大并只告诉主 Agent，由它自己处理，不问人；超时放行并在后台跑到 10 分钟、晚到的「不行」告诉主 Agent；每个超时值与每次超时有记录，规则页与晨报看得见；写在规则板自己的设计里一处。五、（评审第 3 轮 F13，等 dogfood 之后）规则页读 `ruleStats` 时一并显示它的 `unrecorded`：`records` 大于 0 时在页脚写「有 N 条拦截记录没写进流水」，规则页不用自己认流水里的 `gap` 记录，也不必为它改读流水的代码；`classifyRecord` 已经把 `gap` 归为自己的一类，规则板在 M4 的 `classifyRecord` 合入之前自己数记录时，把 `kind: 'gap'` 的行当作既不是违规也不是读不懂的一行跳过。
   - `m7`（M7 0.6）：写入规则经 `installRuleGate` 安装（0.6 §3.2 仍写 `evaluate`，§18.2 写明 M4 的 G1 合入时谁后合入谁改）；周报阶梯的「影子转生效」一步和 §12.1 里对 `RuleMode`、`PROMOTION` 的引用整条删掉（`d-code-rules-enforce`；0.6 §18.2 R4-F10 要在 P2 之前处置的那一条因此不再需要，代码里的门首日全部生效不变）；规范节点的 `模式：` 标签不再用；`ladderProposals` 读流水用 `classifyRecord`；合入前检查的超时按 `d-timeout-measured`：每条检查的超时第一次是写它的 agent 估的运行时间的 3 倍，跑过之后是最近几次里最慢一次的 3 倍，不低于 M7 写在最大值旁的下限、不超过最大 30 分钟，没有估计时用缺省值；人同意时看到的是超时和它从哪个估计算出来；3 倍超过最大时保持最大并只告诉主 Agent，由它自己处理，不问人；写在 M7 自己的设计里一处；汇合门禁加「草稿区为空」一步；`worker-scope` 在目标出了工作树时先调 `peekGrant`（为真就放行这一次往里走），拒绝时调 `outsideDenial`：返回值不为空（目标出了项目）就用它的 `exception` 换掉纠偏的例外一句、`RuleDeny.ref` 写编号，返回 `undefined`（目标在项目里）就照 M7 自己的纠偏，不问人（F19）；`worker-scope` 的 `rightPath` 认带这个编号的 `ask_main`；推进监听器读 `openRequests(持有者会话)`，非空时以 `hourness-waiting-human` 停住 goal，申报都关了、列出的待决也都定了时恢复（§3.9.5 的恢复规则加一句；人一直不回时 2 小时的定时器会送关闭提醒叫醒持有者，N38）；worker 的简报或 `ask_main` 的说明里写明「项目外的写入经主 Agent 问人，等回答，再原样调一次」（§5.9）。
   - `m3`（M3 附录 0.5）：附录 §3.4 已含不带题目与四行、原样再给人看一张已有待决的 `propose_to_human`，M4 的第三次修复可以用，这一条不再是请求。仍请它做的三件（附录 §10 已记为留给 M3 对齐轮）：`installMainAgentRules` 经 `installRuleGate` 安装；git 快照门第一件事调 `observe`、存不了快照而拒绝时调 `noteDenial`（规则 id `git-snapshot`），拒绝记录不带 `mode`；本会话有开着的申报（`requestsService(ctx)?.openRequests`）时 `propose_to_human` 返回 `busy`（N29 的另一侧；M3 没加之前申报文字之后又出示了提议时 `tail` 对不上，记 `not-shown`、不放行，fail-closed）。`src/graph/proposal.ts` 里的 `PROPOSAL_LABELS`、`proposalLineRefusal`、`splitBold` 随 M3 第 6 步；G4 先开工时照附录 §3.3 原样建，M3 改成导入。另有一件（评审 F6，等 dogfood 之后）：人批准环境工具节点时，主 Agent 要把 `graph_propose`/`graph_edit` 结果里的超时那一句（`timeouts[].text`，每句不超过 40 个码点，合一行的上限）放进给人看的方案；这些方案若走 `propose_to_human` 而背景一行与「附」放不下时，请 M3 给一个放它的位置；在那之前主 Agent 把这一句放在回复里检查行的旁边，以工具结果里的字段为准。另请 M3 把这一步做成硬核对（评审第 2 轮 N12，等 dogfood 之后）：M3 对 `rules:`、`loops:` 提议已有「给人看过原文」的核对（附录 0.5 §3.5 第 5a 步：`detail.mustShow` 的每一片都在人看过的文字里，否则 `not_shown`），人批准环境工具节点时同样把 `graph_propose`、`graph_edit` 结果里每条 `timeouts[].text` 当作 `mustShow` 的一片，人看过的文字里没有就不记批准。每条 `text` 是现成的字串，不超过 40 个码点；接到哪一步（分派表 `src/design/attach.ts` 现在只有 `rules:`、`loops:` 两行）由 M3 定。在它做之前，主 Agent 抄不抄这一句只靠工具说明，L4 第 12 项只有 GLM-5.3 一次样本，不当作保证。
   - `m8-plain-language`（面板设计 0.7）：「需要你」的 (b) 一类加上开着的申报：现场投影 `graphLive` 认 `request_exception` 的 `ask` 结果（`ref`、`lines`、时刻、会话）就加一项，见到同一 `ref` 带 `request: {ref, outcome}` 的 `hourness-request` 提醒、或过了 2 小时就去掉；显示题目与四行，下面一行「去主 Agent 的对话回话 ›」指向申报所在的会话（§5.8）。第三次修复的待决是提议式的，按 (a) 一类照常显示四行。
   - `metrics`（指标流水 0.2）：M4 交拦截、跟进、撤下、申报与放行的事件（只带规则 id、种类、结局、来源与会话 id），与每天一条压制计数事件、检查超时值调整与超时的事件（§3.11、§6.3.1）；`suppressions.jsonl` 这一稿照旧写，等指标流水定稿、它的行默认启用之后由它的实施那一步去掉（改 `src/env/suppressions.ts` 与晨报一处）；`recordKey`、`metrics-files-only` 照它的请求。
   - `bootstrap`（接管设计 0.6）：①默认工具节点里的检查行（`toolNodeDraft`）带 `<预计>` 秒数，写在 `<格式>` 与 `$` 之间，格式见 §6.1.1（`check eslint eslint-json 3s $ …`）。`<预计>` 是预计的运行时间：接管把试跑这条命令实际用的时间向上取整到整秒（至少 1 秒）写进去；第一个超时是它的 3 倍，不低于 5 秒、不超过 60 秒；只有不带预计的检查行才从上限开始。人批准工具节点时看到的是这个超时和它的来源，不是裸的估计（§6.3.1）。②读项目门禁 `bootstrap-read-no-shell` 登记在 M4 的 `GUARD_RULES`，行值 `bootstrap`、`liftVia: 'any'`，规则页上的 id 是 `bootstrap:bootstrap-read-no-shell`；经 `installRuleGate` 安装；人说一句话由主 Agent 调 `guard_lift`，或打 `/rules lift bootstrap:bootstrap-read-no-shell`，都撤得下（§3.1、§3.8）。
6. `m4` 的状态与本设计的评审结果按评审循环的规矩批注。

## 19. 修订记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| 0.1 | 2026-10-29 | 第一稿 |
| 0.2 | 2026-10-29 | 按设计评审第 1 轮修订（8 条挡路、13 条非阻断全部处理，见 §19.1）；依据改为 main `eb614ab`，两种待决直接用 `e22282f` 的表格卡字段；另修一处自查发现的问题：检查日志从 `<项目目录>/checks/` 移到 `env-checks/`，因为 `scripts/check-lint.mjs` 跑 jscpd 后会整个删掉 `.llm/checks` |
| 0.3 | 2026-10-30 | 按设计评审第 2 轮修订（2 条挡路、13 条非阻断，见 §19.2）；并入评审之后人定的事（§19.2 第二张表），其中 `d-chat-not-cards` 让申报通道改为对话里人的下一句话、第三次修复与 D1 改为四行的方案；D2 已答（B）；依据改为 main `8599304`；另写一页放行稿 `onepage.md` |
| 0.4 | 2026-10-30 | 按设计评审第 3 轮修订（6 条挡路 F11–F16、8 条非阻断 N27–N34，见 §19.3 第一张表），人准的最后一稿；并入评审之后人定的 `d-boards-as-hooks`、`d-rules-in-repo` 与存放范围、`d-main-agent-peak-exempt`、`d-design-onepage` 用进产品与接缝裁定（§19.3 第二张表）；依据改为 main `820eb78`；0.3 原文与放行稿留在 `design-0.3.md`、`onepage-0.3.md` |
| 0.5 | 2026-10-30 | 按设计评审第 4 轮修订（4 条挡路 F17–F20、8 条非阻断 N35–N42，见 §19.4 第一张表），人准的再一稿，并进对齐轮；照循环板 0.6、规则板 0.10、M3 附录 0.5、M7 0.6 与「Check entries seam」对齐（§19.4 第二张表）；依据改为 main `9c346fb`；0.4 原文留在 `design-0.4.md` |
| 0.6 | 2026-10-31 | 按人读一页稿后定的三件事（`d-code-rules-enforce`、`d-credentials-readable`、`d-timeout-measured`）与编排方的裁定 `d-one-lift-path`（撤下一条规则只有一条路；拦路脚本的数是默认 10 秒、最大 30 秒）修订，见 §19.5；0.5 原文留在 `design-0.5.md`。同日按决定评审第 1 轮（CHANGES_REQUESTED：F1–F10、N1–N8）与编排方的细化裁定再改一遍，版本号不变，处理见 §19.6；之后按决定评审第 2 轮（CHANGES_REQUESTED：F11、F12、N9–N14）又改一遍，版本号仍不变，处理见 §19.7；再按决定评审第 3 轮（CHANGES_REQUESTED：F13、F14、N15–N17）改一遍，版本号仍不变，处理见 §19.8 |

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
### 19.5 对三个决定与一条裁定的处理（0.6）

0.5 经第 5 轮评审通过之后，人 2026-10-31 读一页稿，定了三件事；编排方又在用户旅程评审之后裁定了撤下的路与脚本超时的数（`d-one-lift-path`，同日）。本稿第一版只按这些改，没有评审发现要处理；这一稿带独立评审（`decisions-review.json`），评审第 1 轮的结论与处理在 §19.6，第 2 轮的在 §19.7。上表里 `d-timeout-measured` 一行写的「人批准时看到」「不低于 5 秒（agent 加的下限）」「环境提醒告诉每个 agent」是第一版的写法，现行写法以 §6.3.1 与 §19.6 为准。

| 依据 | 对 M4 的影响 | 改了哪里 |
| --- | --- | --- |
| `d-code-rules-enforce`（人原话：「试运行规则啥的直接拦就行了，这样反而有问题好发现」） | 删掉只为转正而存在的东西：`RuleMode` 与 `GuardRule.mode`、`Judgement.shadows`、`RuleShadowRecord`、影子判定、标注（`labels.jsonl`、`guard label`）、精确率与召回率、`PROMOTION`（20 条含回放、14 天、误伤 0）、历史会话回放（`replay.ts`、`decodeSessionLog`）、回归语料（`corpus.ts`、`corpus add`、脱敏）、页面上「只记下，不挡」、M7 周报阶梯的「影子转生效」一步（请求在 §18）。保留：新插件行默认禁用；每次拦下带规则 id 记进违规流水，晨报按规则列次数与最近一次拦下的样子，规则页读同一份；「拦截后下一步走对」的度量（理由：不依赖试运行，规则板 0.10 已采纳，拦截一启用就生效、纠偏好坏只有它量得到，§3.6）。补上：撤下一条代码规则的路（§3.5）；上线前的用例取代语料（§3.7）；`checker-config` 与 `scratch-only` 一启用就拦，所以进可申报名单（§5.3）。file-tools-only 的工作区变更兜底（`shadow.ts`）只能事后发现，不能拦：改成晚到的拦下记录加下一步之前的纠正提醒（§3.4）。 | 文件头、§0、§1.1–§1.3、§1.5、§2.1–§2.5、§3（整节重写：§3.4 与 §3.5 换了内容，§3.6、§3.7 取代标注、统计与回放、回归语料）、§4 的表与 §4.1、§4.3–§4.5、§5.2–§5.4、§5.6、§6.7、§7.2、§9、§10、§11、§12、§13.1–§13.5、§14、§15、§16、§17 的 D2、§18 |
| `d-credentials-readable`（人原话：「密钥文件能读。而且不是都能读吗？什么叫没拦？」） | `credential-read` 整条删掉，不留作只记录：没有判定器、没有记录、不进声明、不在规则目录；四条新规则变三条；判定上下文去掉凭证路径；阅读摘要 §4 第 9 条随之作废。密钥不进日志与提交、写凭证文件受圈禁照旧（§4.2） | §0、§1.1、§1.2 `m4-rules` 第 1 条、§2.2、§4、§4.1、§4.2（改写成「没有规则」一节）、§13.1、§14.1、§15、§16 |
| `d-timeout-measured`（D-timeout，人原话：「超时那就这样定。不过还是我说的现在拿不准的事情，要做到优雅失败以及可追溯性」） | 规则只在 §6.3.1 写一次：检查行带可选的预计秒数（`<预计>`），人批准工具节点时看到；跑过之后超时是最近 10 次里最慢一次的 3 倍，不低于 5 秒（agent 加的下限）、不超过 60 秒；一步最多等取这一步检查里最大的超时，不超过 20 秒；超时那一次按「不短于当时的上限」计，下一次的值升高；3 倍超过上限时保持上限，环境提醒告诉每个 agent；优雅失败与可追溯的写法见 §6.3.1（`timing.jsonl` 三种行，循环板页明细与晨报「检查的超时」一节）。`ownRules` 的句子与常量由 `src/env/timeout.ts` 生成 | §0、§1.2 `m4-checks` 第 2、3、8 条、§1.5、§2.2、§6.1.1、§6.1.2、§6.3、§6.3.1（新）、§6.5、§6.8、§7.2、§9、§10、§11、§12、§13、§14、§16、§17（D-timeout 已定）、§18 |
| `d-one-lift-path`（编排方 2026-10-31 的裁定，来自用户旅程评审 DR3） | 人撤下一条规则只有一条路：对主 Agent 说，或在规则板上打 `/rules lift <规则 id>`，板上的条目与代码里的规则都管。M4 留着自己的撤下记录与门里的查询，不另设面向人的命令：第一版的 `/guard lift`、`/guard restore`、`/guard rules` 删掉；主 Agent 的工具 `guard_lift` 留下，记成同一笔（`via: 'chat'`）；规则板那一路经新服务 `glmHournessLifts` 的 `setLifted` 交给 M4（`via: 'board'`），接线是规则板的接缝请求（§18） | §0、§1.2 `m4-gate` 第 4 条、§1.3、§1.5、§2.2、§2.3、§3.2、§3.5（改写）、§3.9、§3.10、§9 H26、§10、§12、§13、§14、§16、§18 |
| 规则板 0.10 拦路脚本的数：默认 10 秒、最大 30 秒（编排方 2026-10-31 的更正） | 在 `d-timeout-measured` 下，拦路脚本的实测值以最大 30 秒为上限；M4 没有拦路脚本，只在 §6.3.1 和 §18 写明这个数与它归规则板那一侧写一处，不照抄成 M4 的数 | §6.3.1、§18 第 5 条 |

0.6 里 agent 自己定、人可推翻的几处，都进了 §16：「拦截后下一步走对」的度量去留；撤下记录放仓库、由 `lift-files-only` 护住；`guard_lift` 的原话核对；超时下限 5 秒（决定评审之后编排方裁定保留，§6.3.1）；检查行的 `<预计>` 可选；`checker-config` 与 `scratch-only` 进可申报名单；file-tools-only 兜底改成纠正提醒；任务 `m4-shadow` 改名 `m4-gate`（节点还没建，不用改图）。

### 19.6 对决定评审第 1 轮的处理（0.6 修订一遍）

评审：`decisions-review.md`、`decisions-review.json`，CHANGES_REQUESTED，HIGH 0、MEDIUM 10、NIT 8。四项决定的主干评审认为落对了，挡路的集中在撤规则、超时与一句无依据的话。编排方在评审进行期间给了细化裁定（图上 `d-one-lift-path`、`d-timeout-measured` 2026-10-31T12:56Z 的批注），其中两处与评审的改法不同：F5 保留下限（评审建议删），F8 的上限提醒只给主 Agent 且由它自己处理（评审建议按调用方分两条、都写「问人」）。这一遍按裁定做；与裁定不同的评审改法在表里写明没采纳的部分。

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F1 `LiftRecord` 仍是已删的 `/guard` | 采纳评审给的类型块：`via: 'chat' \| 'board'`，注释改成规则板交来的 `/rules lift`、`/rules restore`；§11 失败表的「命令回一句话」改成规则板回一句话；§14.2 加编译期用例，钉住 `LiftRecord`、`LiftLine` 的 `via` 取值相同 | §3.2、§11、§14.2 |
| F2 `guard_lift` 的原话核对弱到 agent 能自撤 | 采纳，并照裁定对齐 M3 核对人的回话的办法：原话必须是客户端送来的最近一条人的消息里的一段，起止落在边界上（同 M3 `personSaid`）；另加评审的三条：撤下意图词表（`LIFT_WORDS`、`RESTORE_WORDS`，`src/guard/lift.ts`，改它走全审）、至少 4 个码点、一条人的消息至多换一次成功的撤下。不加的：规则 id 与原话之间的绑定（要为每条规则维护说法表，成本高于价值），剩余风险改写成「人说了放开某条、模型撤了另一条」，三道后手（返回里写明撤了哪条并要求告诉人、记原话与晨报、一句话恢复）。声明头部加一句让主 Agent 知道该调 `guard_lift`（N7） | §0、§1.2 `m4-gate` 第 4 条、§3.1、§3.5（第 4 步与风险段）、§10、§11、§12、§13.4 第 10 项、§14.1 `guard-lift`、§14.2、§16 |
| F3 `bootstrap-read-no-shell` 不在 `GUARD_RULES` | 采纳：`GUARD_RULES` 加一项，行值 `bootstrap`，经 `installRuleGate`；`guard_lift` 与 `setLifted`（`bootstrap:bootstrap-read-no-shell`）都撤得下；L2 加撤下例与契约测试；§18 的 `bootstrap` 请求和 `graph-ops-decisions.json` 里的批注写明登记 | §0、§1.2 `m4-gate` 第 6 条、§3.1、§3.8、§14.2、§18 第 5 条 |
| F4 `lift-files-only` 撤不了，提示还指点手改 | 采纳评审的方向并照裁定：`GUARD_RULES` 的 `liftable` 改成 `liftVia: 'any' \| 'board'`，`lift-files-only` 为 `board`：`guard_lift` 返回 `forbidden`，提示指向 `/rules lift lift-files-only`，不提手改；`setLifted` 撤得下；规则板接线之前它没有撤下的路，写明是有意留的缺口（§16）；手写的 `lifts.jsonl` 行没有合法 `via`，按坏行跳过 | §1.2、§3.5（第 3 步、`LiftService`）、§3.8、§14.2、§16 |
| F5 下限 5 秒违反「一律 3 倍」 | 按编排方裁定：不采纳评审的删除（方案 A），下限保留，写在上限旁边，常量 `CHECK_TIMEOUT_FLOOR_MS` 与 `checkTimeout` 的 `floorMs` 不动；§6.3.1 第 1 条写出「3 倍运行时间，不低于 5 秒、不超过 60 秒」和保留理由，§16 把「agent 加的」改成裁定保留；给循环板、规则板、M7 的请求都要求各自把下限写在最大值旁 | §6.3.1、§13.4 第 8 项、§16、§18 第 5 条、`graph-ops-decisions.json` |
| F6 人批准时只看到估计 | 采纳：`timeoutText`（纯函数，由常量生成）把超时和它的估计写成一句（四种情形，不超过 40 个码点，合一行上限）；`graph_propose` 与 `graph_edit` 对环境工具节点的结果附 `timeouts`，说明要求主 Agent 把它原样放进给人看的方案；M3 的 `propose_to_human` 放不下时的请求写进 §18 的 `m3` 一条；L2、L3、L4 各加一项；§1.2、§6.1.1、§16、§17、§18 第 4 条改成「人看到超时和它的来源」 | §1.2 `m4-checks` 第 8 条、§1.5、§6.1.1、§6.3.1 第 3 条、§13.1 E3、§13.4 第 12 项、§14、§16、§17、§18 |
| F7 接缝请求没写「第一个数是估计的 3 倍」，循环板一条写反 | 采纳：循环板 ⑩、规则板第四点、M7 都改成「已放行的设计把条目里的数当超时本身，应改成 3 倍运行时间，下限写在最大值旁，没有估计时用缺省值」，循环板那条与初稿相反的话更正；§6.1.2 的 `estimateSeconds` 注释同改；`graph-ops-decisions.json` 里对应的三条批注原地重写（还没有被应用） | §6.1.2、§18 第 5 条、`graph-ops-decisions.json` |
| F8 上限提醒给每个 agent，文字写「问人」 | 按编排方裁定，不采纳评审的分两条写法：只给根 agent（主 Agent），由它自己处理，不问人。主 Agent 的办法：拆小或收窄检查（改检查行走工具节点批准，与别的工具节点一样），或用新工具 `check_limit` 把这一项检查的上限当作可撤回的设置调高（61–600 秒，写理由，`limits.jsonl`，`reset` 撤回，只对正被截住的检查可调）。子 agent 与 worker 不收这一行，自己那次超时的提醒写「已在上限，主 Agent 已被告知」。§1.2、头部、§6.3.1、§7.2、§16 同改，加 L2、L3、L4 | 头部、§1.2 `m4-checks` 第 8 条、§2.4、§6.3.1、§7.2、§10、§11、§12、§13.4 第 13 项、§14、§15、§16 |
| F9 估计的来源依赖图历史里没有的字段 | 采纳评审的选法并照编排方「历史没有的就自己记」：选哪条历史写明（最后一条含这一整行检查行的 `edit`，没有就取 `propose`）；`ValueLine.source` 改为 `estimate`、`harness`、`ceiling` 三种，`actor` 取历史里的值，不写死 `agent`；图历史没有会话字段，`src/graph/tools.ts` 在 `graph_propose`、`graph_edit` 返回前把会话写进 `timing.jsonl` 的 `EstimateLine`，找不到时写「会话未记」。没有采纳「请 M3 给历史加会话字段」（改已放行的设计，且这里已自己记） | §6.3.1、§11、§13.1 E3、§14.2、§16 |
| F10 `looksSecret` 保护流水的说法无依据 | 采纳评审的第一种改法：删掉这个说法和 §1.5 里的 `looksSecret`，§4.2 写明违规流水不遮盖命令原文及原因，§15、§16 各记一笔；人要加遮盖时的做法写在 §15 | §1.5、§4.2、§15、§16 |
| N1 违规流水范围与写失败计数 | 采纳：验收第 1 条写成「在能定出项目目录的会话里」；`installRuleGate` 在内存里数丢掉的记录，行健康写「N 条违规没有落盘」 | §1.2、§2.4、§11 |
| N2 `lift-files-only` 范围与 `lifts.jsonl` 入库 | 采纳：规则只认确切路径 `docs/guard/lifts.jsonl`；git 命令不判（M4 的规则一律不判 git），所以 `git add`、`git commit` 可用；晨报在文件有未提交改动时加一行提醒，由持有 git 的主 Agent 随下一次提交带上 | §3.5、§3.10、§14.2 |
| N3 `setLifted` 解析带冒号的 id | 采纳：先整串精确命中目录里的 id，不中再去掉一个 `<行>:` 前缀，仍不中 `unknown_rule`；L2 加 `loops:schedule-tools` 与 `loops:loops:schedule-tools` | §3.5、§14.2 |
| N4 例外没有记在说「只读」的地方 | 采纳：§1.5 与 §3.8 两处各加半句，写明内容只读、撤下与恢复是 `d-defaults-readonly` 的例外 | §1.5、§3.8 |
| N5 §2.2 的回放依赖句 | 采纳，改成「M4 不读 DSH 的会话日志，不需要解码库」 | §2.2 |
| N6 超时的数在 §6.3.1 之外复述；§18 计数 | 采纳：§1.2 第 8 条改成指向 §6.3.1 与常量；§18 的「三件小事」改成四件（⑥⑧⑨⑩），`rules` 一条前半句改成「那一部分没有新的请求」。§13.4 第 8 项保留 L4 要核对的具体数字（那是验收的期望值，不是规则的第二处定义） | §1.2、§13.4、§18 |
| N7 没有一句让主 Agent 把「人要放开这条规则」对上 `guard_lift` | 采纳：`declarationSection` 头部给根 agent 加一句；L3 `guard-lift` 在没有这一句时必败 | §3.1、§13.4 第 10 项、§14.1 |
| N8 上限提醒的文字在只有估计时不准 | 采纳：两种写法，来自估计的写 `three times your estimate (<e> s) would be <3e> s` | §6.3.1 第 6 条 |

另有一条由编排方通知并入的要求（接管评审 F8）：检查行可以带预计（预计的运行时间），第一个超时是它的 3 倍，只有不带预计的检查行才从上限开始；§6.1.1 写明预计在检查行的 `<格式>` 与 `$` 之间、接管把试跑用的时间向上取整到整秒写进去、人批准时看到算出的超时；§18 的 `bootstrap` 请求同写。

没有按评审改、按裁定改了的：F5（保留下限）、F8（只给主 Agent，不问人，可调高上限）。评审的 N7、F2 的词表是 agent 定的，列在 §16，人可推翻。

### 19.7 对决定评审第 2 轮的处理（0.6 再修订一遍）

评审：`decisions-review.md`、`decisions-review.json`（第 2 轮的两个文件覆盖了第 1 轮的同名文件，编号沿用，新发现从 F11、N9 起），CHANGES_REQUESTED，HIGH 0、MEDIUM 2、NIT 6。第 1 轮的 18 条评审认为 17 条已关闭，N1 关闭一半（就是 F11）；四项决定和三条裁定的主干评审认为写对了。这一遍没有裁定要处理，八条发现都采纳，与评审给的改法不同的地方在表里写明。编排方 2026-10-31 的裁定在这一遍没有变（超时 = 3 倍运行时间，上限，不问人，撤下只有一条路，拦下都进项目违规流水）。

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F11 「写不进的记录在内存里计数」没有信号可数 | 采纳。`rowJournal` 的 `violation` 返回新类型 `JournalOutcome`（`'written'`、`'failed'`、`'no-home'`），`projectJournal` 每个项目根一个 `rowJournal` 实例，控制台告警因此每个项目每个写入类别一次；`RuleGateOptions.journal` 改为 `(record, payload) => Promise<JournalOutcome> \| void`，`installRuleGate` 对 `'failed'` 按会话累加，用 `health` 写「N 条违规没有落盘」，恢复写入之后数不清零（丢掉的补不回来）；没有项目目录返回 `'no-home'`，不计数，行健康文字照今天。与评审的两处不同：返回三个值而不是 `boolean`（验收第 1 条要把无项目目录的会话排除，用 `'no-home'` 省得网关再算一遍项目目录）；计数按会话而不是按项目（行健康本来按会话报，一个会话只属于一个项目）。`journal` 多一个 `payload` 参数，让各行能按会话的工作目录找项目，原先这一步没有写出来。L2 加评审给的那一例，另加无目录、两个项目、旧行返回空三例 | §1.2 `m4-gate` 第 1 条、§2.2、§2.4、§3.1（`RuleGateOptions.journal`、第 7 步）、§3.2、§11、§13.1 G1、§14.2 |
| F12 `check_limit` 的说明不全 | 采纳。§6.3.1 补参数表（`check`、`seconds`、`reason`、`action`，其他字段不收）、给模型的描述、示范 `CHECK_LIMIT_EXAMPLE`（ESLint，`reason` 用中文写，因为它原样给人看）、编号的检查顺序与返回；`reason` 加 `plainWordsIn` 的检查，`seconds` 必须高于现在生效的上限（这两条是评审没要的，前一条因为 `reason` 出现在页面和晨报上，后一条因为 `raise` 只往高调、往低用 `reset`）。`ENV_TOOL_NAMES = ['check_limit']` 在 `src/shared/tool-names.ts` 定义，E3 与 §13.2 的共用文件清单加上它和 `tests/contracts.spec.ts`（G3、G4、E3 三步都改这个文件）；§2.2 加 `src/env/limit-tool.ts` 一行并在 env 入口一行写上注册；写明不加进 `ORCHESTRATION_RESIDENT_TOOLS`，GLM 上默认延迟；§1.5 的 `d-agent-examples` 一行与 §14.2 的 F20 一条把 `guard_lift`、`check_limit` 的示范列进去 | §1.5、§2.2、§6.3.1、§10、§13.1 E3、§13.2、§14.2 |
| N9 `not_held` 条件没有绑定到当前生效的上限 | 采纳评审的写法：只数晚于这一项在 `limits.jsonl` 里最后一行（`raise`、`reset` 都算）的、当前生效的上限处的 `capped` 值或超时；L2 加「调高之后紧接着再调返回 `not_held`」等例 | §6.3.1、§10、§14.2 |
| N10 提醒说「不问人」而第一个办法要人批准 | 采纳。提醒原文改成：调高上限是主 Agent 的决定、不用人批准；让检查更便宜或更窄要改检查行，是工具节点的改动，照常要人批准。§6.3.1 第 6 条、§1.2 `m4-checks` 第 8 条、§7.2、§16 同改。注意这一处读法：编排方裁定里的「拆小或收窄」在机制上仍要人批准（验收条件批准之后只有人能改），所以「不问人」只落在调高上限上；已在 `graph-ops-decisions.json` 里向编排方说明，请裁定 | §1.2、§6.3.1、§7.2、§16、`graph-ops-decisions.json` |
| N11 `guard_lift` 里「最近一条人的消息」有两种读法，词表核对不看否定 | 采纳。读法写明为一种：取最后一条 `role: 'user'`、`source.kind === 'user'`、没有 `source.form` 的消息，它必须带 `rpcId`，否则 `not_said`，不退回去找更早的一条（插件的 notice 与快照来源不是 `'user'`，夹在中间不影响；评审建议的「历史里最后一条用户角色消息」会把 `hourness-guard` 的提醒也算进去，所以限定在用户来源）。否定词：加 `NEGATIONS`，命中词前紧挨着否定词的不算，「别关掉那条」「don't disable it」返回 `not_said`；这样选而不是只记残余，因为多放行一次撤下的代价高于多拒绝一次。残余写进「留下的风险」：词表不理解整句话，人说完话之后主 Agent 自行推进很久时那条话仍可被引用一次。L2 加六例 | §1.2、§3.5（第 4 步、风险段、L2）、§10、§11、§16 |
| N12 人批准时看到超时靠主 Agent 抄进方案 | 采纳。§18 第 5 条的 `m3` 请求加一项：环境工具节点的批准同样走 `mustShow` 核对，每条 `timeouts[].text` 是一片；§6.3.1 第 3 条写明这一步现在靠说明、没有硬核对；§13.4 第 12 项注明只有一次 GLM-5.3 样本、不当作保证。M4 一侧没有办法把它做成硬的（批准发生在 M3 的 `record_human_answer`），所以写成请求；另在 `graph-ops-decisions.json` 加一条 `m3` 批注 | §6.3.1、§13.4、§18 第 5 条、`graph-ops-decisions.json` |
| N13 `lift-files-only` 的提示指向规则板上还不存在的命令 | 采纳。`guard_lift` 返回 `forbidden` 的 `hint` 改成「只有人能撤，规则板对代码规则接线之后用 `/rules lift lift-files-only`，在此之前撤不了」；拦下 `lift-files-only` 的纠偏单独成文，不写「对主 Agent 说就能撤」（对其他规则成立，对它自己不成立）。L2 逐字钉住 | §3.5 |
| N14 `d-credentials-readable` 正文写「密钥不进日志」，违规流水不遮盖命令原文，图上没有批注 | 采纳。`graph-ops-decisions.json` 加一条 `d-credentials-readable` 的批注：说明流水不遮盖及原因、遮盖要怎么加、请裁定；§4.2、§15、§1.5 各加一句指向它，裁定之前按不遮盖做 | §1.5、§4.2、§15、`graph-ops-decisions.json` |

`graph-ops-decisions.json` 这一遍加了五条批注（`m4` 的第 2 轮说明、`m3` 的 `mustShow` 请求、`d-credentials-readable`、`d-timeout-measured` 里对「拆小或收窄」的读法、`rules` 里 `projectJournal` 返回值的一句接口说明），原有的十条没有动。规则板写记录也经 `projectJournal`，`violation` 的返回值它可以不看，所以最后一条不是新请求。

没有采纳的：评审 F11 的 `boolean` 返回值与按项目计数（改法见表）；N11 里建议的「历史里最后一条用户角色消息」的读法（改成限定在用户来源）。

### 19.8 对决定评审第 3 轮的处理（0.6 第三遍修订）

评审：`decisions-review.md`（第 3 轮覆盖第 2 轮的同名文件，编号沿用，新发现从 F13、N15 起），CHANGES_REQUESTED，HIGH 0、MEDIUM 2、NIT 3。上一轮的 8 条里评审认为 6 条已关闭，F11 的信号已关闭而下游转为 F13，N13 的提示已关闭而纠偏文字转为 N15。这一遍没有新的人定事项或裁定要处理，五条发现都采纳；与评审给的改法不同的地方在表里写明。

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F13 MEDIUM 丢掉的违规记录数靠行健康留下，行健康每个会话只存一条、被下一次调用整条替换 | 采纳，并按任务书把计数放到晨报与规则页读得到的地方，分两处：①行健康一侧：评审给了两条路（网关用整张问题表调 `report`，或导出 `gateProblems` 让各行合并），都要每一行在每次 `report` 里记得合并，图行、循环板、指标流水、接管行各有自己的 `provideRowHealth`，漏一行复发；这里选第三条，在 `provideRowHealth` 里加 `RowHealth.note(sessionId, key, text)`，说明附在会话的行健康上，之后的每次 `report` 都带着，状态至少 `degraded`，各行的 `report` 调用方不用改；`installRuleGate` 的 `health` 选项改成 `Pick<RowHealth, 'note'>`，写失败的结果落定时就调一次 `note`，不靠下一次调用顺带，判定器出错用另一个键。②durable 一侧：落点选违规流水自己：晨报与规则页本来就读它，经 `classifyRecord` 分得出，进程重启之后还在；`rowJournal` 在内存里记下待写的缺口，下一次追加成功时把一行 `GapRecord`（`lost`、各类条数、`since`/`until`、错误码）和那条记录合成一次 `appendFile`，缺口恰好站在丢记录的地方；并发的两次写不会各写一行（取走缺口在 `await` 之前）；会话卸载时 `flush()` 单独补写。晨报新增「流水的缺口」一行，`ruleStats` 新增 `unrecorded`，规则页读它（给规则板的请求在 §18）。写入一直不恢复、或进程在恢复之前退出时缺口写不出，信号只剩行健康与控制台，记为残余（§11、§15）。验收里的「行健康仍写 3」改成在真实的 `provideRowHealth` 上断言 | 头部、§0、§1.2 `m4-gate` 第 1 条、§2.2（`health.ts`、`records.ts`、`audit.ts`、`measure.ts`、晨报各一行）、§2.4、§3.1（选项、第 5、7 步、`RowHealth.note` 一段）、§3.2（`GapRecord`、缺口的写法、`classifyRecord`）、§3.6、§3.10、§3.11、§11、§12、§13.1 G1、§13.2、§14.2、§15、§16、§18 |
| F14 MEDIUM `lift-files-only` 只护主检出里的 `docs/guard/lifts.jsonl`，worker 工作树里已提交的副本没护住 | 采纳。判法改成「目标相对它所在检出的根是 `docs/guard/lifts.jsonl`」：文件工具的目标从所在目录往上找最近的 `.git`（目录或文件，只读文件、不起 git 进程），那个目录是检出的根，并且属于会话的项目；这样主检出、`git worktree add` 出来的任何工作树（含会话开始之后才建的）、调用方所在的检出三类都在内，不需要列举工作树，列举 `git worktree list` 会漏掉新建的。shell 文本里提到这个路径尾巴的、file-tools-only 判为写的命令也拦，不分检出。晨报的对账写明读主检出里此刻的文件，合入之后的下一份晨报也查到，不只在写入当时。L2 加评审要的两例（工作树里的相对路径、绝对路径）和另外八例，`README.md` 仍放行。一处顺手更正：原文同时写「判法同 `graph-files-only`」「git 命令不判」与「shell 里读它会被拦」，`graph-files-only` 只查 file-tools-only 判为写的 shell 命令，读（`cat`）不是写，所以改成读不拦，与前两句一致；这是文字上的自洽，不是放宽（写它的命令照拦） | §0、§1.2 `m4-gate` 第 4、7 条、§2.2、§3.5（状态文件一段、「护住这个文件」一段、L2）、§3.10、§11、§12、§13.1 G3、§14.1 `guard-lift`、§13.4 第 10 项、§15、§16 |
| N15 告知人去用规则板上还没接线的命令；`lift-files-only` 的纠偏文字与说明对不上 | 采纳。`guard_lift` 成功的 `message` 与 `unavailable` 的 `hint` 写出现在可用的办法（再调 `guard_lift`，带 `action: "restore"`），规则板的命令一律带「once the rules board offers it for code rules」；`lift-files-only` 的纠偏四部分重写：越界一句只说这个文件是什么，正路用评审给的「Do not edit this file. Only the human can lift or restore rules. If you think a rule blocks you wrongly, say so in your reply.」，不含任何撤下的办法；L2 钉整段的四个部分（事实一句、越界一句、正路三句、例外 `none`；finish2 复评 N18 更正了「四句」的说法），并断言渲染出的纠偏里不出现 `guard_lift`、`main agent`、`/rules`。没有采纳「接线之前干脆不提」：接线之后还要再改一次文案 | §3.5（第 6 步、返回、纠偏、L2）、§14.2、§16 |
| N16 上限提醒没有给出 `check_limit` 要的 `check` 键 | 采纳。提醒里写 `check "tool-3/eslint"`，键由工具节点 id 与检查名拼成，与 `check_limit` 的参数和 `timing.jsonl` 的键同一个写法；L2 把引号里的键原样交给 `check_limit`，并加两个节点各有一项叫 `lint` 的检查的一例 | §1.2 `m4-checks` 第 8 条、§6.3.1 第 6 条、§14.2 |
| N17 检查进程排队没有等待上限，调高后的上限会让两个名额被占满十分钟且没有消息 | 采纳，三条：还没开始跑的检查，提醒写「queued behind N running checks」；排了 `CHECK_QUEUE_WAIT_MS`（3 × `CHECK_STEP_DEADLINE_MS`，60 秒）仍没开始的检查不再等，`timing.jsonl` 多一种 `queue` 行（结局「没跑」），提醒与晨报「检查的超时」一节列出，不计入连续失败；上限被调高的检查合起来至多占 2 个名额里的 1 个，普通检查每个至多 60 秒，所以另一个名额最迟 60 秒后空出来，不被挡住。60 秒这个数是 agent 定的，可推翻 | §1.2 `m4-checks` 第 3 条、§2.2、§6.3、§6.3.1（`QueueLine`、整理、看得见、常量）、§6.5、§11、§13.1 E3、§14.2、§15、§16 |

评审记下、没有当作发现的一点：压缩之后 `session.deriveMessages()` 是否仍含最近一条人的原消息。已在 §14.2 加一条 L2（失败时拒绝，不会多放行），真机观察留在 L4 第 10 项。

D1 的字数按 §1.2 表里七个任务行重数：改了 `m4-gate` 的第 1、4、7 条与 `m4-checks` 的第 3、8 条，条数仍是 35 条，字数是 7,670，§17 已改为约 7,700。

给编排方的接缝请求只有一条新的：`rules`（规则板 0.10）的规则页显示 `ruleStats` 的 `unrecorded`（§18 第 5 条 `rules` 的第五点），等 dogfood 之后。这一遍没有写 `graph-ops-decisions.json`，该请求由最后的汇总一步记入新的 graph-ops 草稿。

### 19.9 对 finish2 复评的处理（0.6 第四遍修订）

评审：`decisions-review-finish2.md`、`decisions-gate-finish2.json`（上一轮 `decisions-review.md` 不覆盖，编号沿用，新发现从 F15、N18 起），CHANGES_REQUESTED，HIGH 0、MEDIUM 1、NIT 6。F13、F14、N15、N16、N17 评审认为已关闭；N15 的措辞问题转为 N18。七条发现都采纳。没有新的人定事项或裁定。

| 发现 | 处理 | 改了哪里 |
| --- | --- | --- |
| F15 MEDIUM 「git 写不出新的撤下」不成立，晨报的对账只查「文件里有、流水里没有」，换回旧版本查不到 | 采纳，照评审的四步。①那句话改成已知边界：git 命令不判，`git apply`、`git am`、`git cherry-pick`、`git merge` 能带进新行，`git checkout`、`git restore`、`git revert`、`git stash pop` 能把文件换回含 `lift X`、少了后来 `restore X` 的旧版本；与读法看不见的 shell 写法同属已知边界。②对账改成比终态加逐行，两个方向都查：每条出现在文件或流水里的规则，文件最后一行的 `action`（没有行等于没撤下）对流水最后一条 `LiftRecord` 的 `action`；另查文件有而流水没有的行、流水有而文件没有的记录（被回退掉的 `restore`）；对不上的规则各写一行，点名规则和两边的状态；换电脑、切分支、一次撤下的流水记录没写进去（有 `GapRecord`）都只是提醒，不作废撤下，门只读文件。③L2 加四例（⑪换回旧版本，用 `git checkout`、`git restore --source`、`git revert` 真跑；⑫`git apply`、`git cherry-pick`、`git merge` 带进新行；⑬文件被回退到不存在；⑭不误报：一致状态、流水不在、流水有缺口），评审要的两例（换回旧版本、`git apply` 加 Y）都在内；⑨改成新的晨报行。④「门拒绝流水里没有记录的行」记进 §15 与 §16 作没选的做法（换电脑之后流水不在，会作废人真实的撤下），§16 同时写明没学循环板把对不上当成「在外面变了」而不跑：循环板有自己的指纹文件，`lifts.jsonl` 没有，再加一份就多一个要护的东西 | §3.5（git 一句、剩余边界、L2 ⑨⑪–⑮）、§3.10、§1.2 `m4-gate` 第 4、7 条、§11（撤下一条规则的剩余栏）、§15、§16 |
| N18 纠偏一段写「整段四句」「它不能撤下」 | 采纳：改「四个部分」；「`guard_lift` 撤不了这条规则，它也不在可申报名单里」，并注明规则板接线之后 `/rules lift lift-files-only` 能撤，与 `liftVia: 'board'` 一致。§19.8 N15 一行里的「四句」同改 | §3.5、§19.8 |
| N19 L2 里 `''written''`、`''failed''` | 采纳，改成 `'written'`、`'failed'` | §14.2（缺口记录第③、④点） |
| N20 §3.5 L2 第一句说 `pwsh` 提到该文件被拦，第⑤点说 `cat` 放行 | 采纳：`write`、`edit` 写它被拦，`pwsh` 的写命令（`Set-Content` 之类）提到它被拦，`pwsh` 的 `cat` 与 `read` 放行 | §3.5（L2 第一句） |
| N21 排队丢弃这条新规矩不在板上的 `ownRules` | 采纳：加第五行「同时最多跑 `CHECK_SLOTS` 项检查；排队超过 `CHECK_QUEUE_WAIT_MS/1000` 秒的这一次不跑，下一次改动再查」，由常量拼出，拼出来 33 个码点，五行在循环板 0.6 §2.1 的 6 行上限内；§13.4 第 8 项的数补上 2 项、排队 60 秒，契约测试钉恰好五行；摘要、`m4-checks` 第 5 条的「四条规矩」改「五条」 | §0、§1.2 `m4-checks` 第 5 条、§1.5、§6.3 第 3 条、§6.8（`ownRules` 一行、常量一条、契约测试）、§13.4 第 8 项、§14.2 |
| N22 D1 与 §18 第 1 条仍是被取代的四行加粗版式，且让编排方「原样问」 | 采纳：D1 改成一项「确认一个推荐」，合并放行：一个是非问句，推荐与理由在句子里，一句真代价（不想每次回「可以」，申请那一条要重写），104 个码点，不含黑名单词；四个字段（加理由、没选的做法、人的原话）只留在图上的记录里。§18 第 1 条同改。人读到的申报文字与第三次修复的问话沿用 M3 渲染器的版式，M4 只给记录的字段，版式随 `d-ask-three-gates` 由 M3 改，记入 §16，没有在 M4 里另改一份。D1 的条数与字数重数：35 条，7,953 个字符，取约 8,000（评审数 7,632，设计前稿写 7,670：这一遍 `m4-gate` 的第 4、7 条加了字，口径是 §1.2 表里七个任务行「建议验收」单元格的长度） | §0、§1.3、§16、§17 D1、§18 第 1 条 |
| N23 「往上找最近的 `.git`」写成「同 `locate`」，但 `locate` 不导出、跟 `commondir`；§2.2 说该文件不改 | 采纳，选导出而不是尾部匹配：尾部匹配会把项目里任何子目录下的同名路径也拦住，并要为项目在 git 之外的情形再写一条。`src/data/project-root.ts` 加一个导出 `checkoutRootOf(path)`，复用该文件私有的 `gitEntry`，不跟 `commondir`，所以工作树返回自己的根；`lift-files-only` 先做一个字符串尾部的便宜判断（别的写入不多一次磁盘读），再用它找根。§2.2 的那一行改成「加一个导出」。L2 ⑮并排断言 `checkoutRootOf` 与 `projectOf(...).root` 的差别 | §2.2、§3.5（文件工具一条、L2 ⑮）、§1.2 `m4-gate` 第 7 条 |

评审记下、没有当作发现的几点（压缩之后的人消息、规则板 0.10 读到 `kind: 'gap'` 的行怎样处理、GLM-5.3 是否抄进超时一句）：处理同上一遍，不变。

给编排方的接缝请求新增一处：`src/data/project-root.ts` 多一个导出 `checkoutRootOf`（§2.2）。它是对规则板最小一片已建文件的加法，不改现有函数，不是对已放行设计文字的改动，谁先改谁加，后到的合入时机械合并，不需要新的评审。这一遍没有写 `graph-ops-decisions.json`，也不写 `graph-ops-finish2.json`，后者由最后的汇总一步写。