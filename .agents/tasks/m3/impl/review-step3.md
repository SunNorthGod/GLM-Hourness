# 主 Agent 模式、持有者记录与身份节：附录第 3 步的独立评审

评审日期 2026-10-31。对象是 `.worktrees/m3` 上这一步唯一的提交。我读了全部源码、测试、探针脚本和文档改动，对照附录 0.5 的 §2.1–§2.4、§2.8、§4 第 3 步与 §8、`design.md`、`onepage.md`、`addendum-r5b.md` 与 `addendum-r5.json`、`design-context.md`、`leftover-triage.md` §3.4。没有重跑套件，采用提交说明记录的结果：build、preflight 退出码 0，test 817 通过 0 失败，probe 149/149。另做了三件只读核对：用 `node --experimental-strip-types` 量身份节与例题的长度；用 `git merge-tree` 试合并到当前 main；用一段放在系统临时目录、用完即删的脚本，在 `tests/design-host.ts` 的假宿主上复现 I-1。仓库没有任何改动。

## 摘要

这一步新增默认禁用的行 `glm-hourness/design`：命令 `/wish`（含 `here`、`off`）、会话投影 `hournessMainAgent`、每个项目一份的持有者记录、身份节 `hourness:main-agent`，以及一个在组装时去掉 `write`、`edit`、`ask_user_question` 并把 `str_replace_editor` 收窄为 `view` 的监听器。实现与附录逐条对得上，triage §3.4 的五个缺陷都已改掉并各有测试钉住，R5b-N2 落在评审预测的 652/1350/2489。`src/data/project-root.ts` 与 `src/data/lock.ts` 本步没有碰，也没有另写一份；eslint、knip、jscpd 三份基线文件没动，没有新增压制。没有阻塞项。

Watch for：（1）工具面只是不让模型看见写工具，rc.3 按名执行，所以「主 Agent 没有写文件的办法」要到第 4 步的 `main-agent-no-write` 才成立；行必须保持禁用，直到第 4、6 步都在 `m3` 上（confirmed）。（2）`/wish` 被取消或崩溃之后，持有者记录可以指向一个自己不是主 Agent 的会话，别的会话会被指过去，`mainAgentOf` 也会把提醒投给它（confirmed，已复现）。（3）本步没有任何核对人原话的代码，引擎「带 `relay` 的 `llm` 写入有人的权限」的缺口要到第 6 步才关（confirmed）。

**Verdict**: APPROVED

## 高层视图

角色由 `/wish` 事件折叠出的会话投影和项目的持有者记录合成：投影为真且记录（有的话）指向本会话才算，委派出的子会话永远不是。我读到的每条失败路径都落在「按普通会话处理并报 degraded」一侧，没有把会话误升为主 Agent 的路径。缺口只有一个：记录会比投影活得久（I-1）。

「主 Agent 有没有写文件的办法」：本步没有，也没有声称有。工具面监听器不带 `prepend`，位于方言与工具检索的 `prepend` 监听器里层，它们看到的已是去掉之后的工具，顺序由 L2 与 L3 验过。但这只挡住模型的视线：按名调用 `Write`、`write`、`Edit` 与 shell 写入此刻都能执行，对应的拦截是第 4 步。所以这一行单独启用不安全（I-2）。

「人的原话是不是真核对过」：本步不含核对，核对是第 6 步的 `hournessTalk`、`personSaid` 与 `record_human_answer`。本步没有削弱它：唯一进入模型的人的文字是 `/wish <一句话>` 的 `rawInput`，它由人敲的斜杠命令带来，以 `form: 'notice'`、`kind: 'glm-design-wish'` 的 notice 交给 agent，不满足 §3.6 的 `isPersonMessage`，不会被误认成人的消息。

「高峰期有没有东西拦着主 Agent」：没有。本步的代码里 `peak` 只出现在例题与它的测试里；`/wish` 唯一的等待是对别的会话跑 `/wish off`（10 秒超时）和读 `sessionPersistence.list()`。例题把「主 Agent 照常回你话」写进不做一行，测试钉住。

共用模块：本步的 `projectKey` 是图目录的键（两个工作树算两个项目），语义与 `projectOf`（仓库根，工作树合一）相反，是附录 §2.4 要的，不算重复。持有者文件用 `link`/`rename` 的原子操作，没有读改写，用不着 `lock.ts`。

<details>
<summary>Issues (7)</summary>

1. **持有者记录比投影活得久**（MEDIUM，非阻塞，confirmed）：`/wish` 在认领记录之后被取消或失败、或崩溃时 `command/done` 还没落盘，记录指向的会话投影为假；别的会话的 `/wish` 被指到它，`mainAgentOf` 也返回它，该会话自己不报任何健康。在 `alignOnCreation` 与 `mode.cancelled` 分支里，记录指向本会话而投影为假时 `releaseHolder`；`enter` 在回指路回复之前，若持有者会话开着而它的投影为假，按 `gone` 接管。循环板设计里 `none` 会删绑在持有者会话上的到点提醒，这条应在循环板接入 `mainAgentOf` 之前改。
2. **工具面不是边界，启用要等第 4、6 步**（MEDIUM，非阻塞的合入条件，confirmed）：只有 `disabled: true` 在拦着，代码里没有机制保证它。合入 main 可以；任何启用本行的 profile（现在只有探针覆盖层）必须在第 4、6 步之后，第 12 步（b）「合入后第一个提交启用」不得提前。
3. **清理失败把成功的认领报成失败**（LOW，likely）：`claimHolder` 的 `finally { unlinkSync(temporary) }` 抛错时（Windows 上杀毒或索引器占着刚建的文件），`/wish` 报「持有者记录写不了」而记录已经写上；`replaceHolder` 的 catch 里的 `unlinkSync` 会盖掉原始错误。临时文件清理改成尽力而为，吞掉错误。
4. **健康报告不核对工具面监听器真的跑过**（LOW，likely）：`installAgentHooks` 在装两个监听器之前就 `installed.add(agent)`，第二个抛错时只剩身份节，`/wish` 不再补装，而每步的 `active` 报告仍写「写文件的工具……已从工具面去掉」。两个都装上才标记已装，失败时撤掉第一个；或让工具面监听器在 `step` 上留标记，身份节监听器没看到标记就报 degraded。
5. **读缓存只以 mtime 与 size 为键**（NIT，possible）：另一个进程在文件系统时间戳粒度内换成同长度的记录（会话 id 与 `since` 定长）时，本进程读到旧值。stamp 里加 `ino`（`rename` 换文件会变）。NTFS 上窗口约 100 ns，实际影响很小。
6. **`glm:guard` 声明与 `file-tools-only` 的纠偏把主 Agent 指向它没有的工具**（LOW，留给第 4 步，confirmed）：`src/guard/rules.ts` 第 132 行的声明与第 143 行的 `rightPath` 都说「用 Write/Edit」，而主 Agent 的身份节说它没有写文件的工具。第 4 步要保证主 Agent 的 shell 写入先被 `main-agent-no-write`（`prepend`）拒绝，并处理 `glm:guard` 里那一行声明。
7. **合到当前 main 会冲突四处**（合入前须知，confirmed）：`git merge-tree` 对 main（`99a42ef`）报 `packages/hourness/tsconfig.json` 的 `include`（main 加 `src/execute`，本步加 `src/design`）、`scripts/packages.mjs` 的 `src`（`execute` 与 `design`）、`package.json` 的 `test` 脚本（M7 E3 的 spec 与本步四个 spec）、`docs/HANDOFF.md`（main 改了 `rules` 行的文字，本步在其后加 `design` 行）冲突。每处两边都保留。

</details>

<details>
<summary>Details</summary>

### 持有者记录比会话投影活得久

`enter` 先 `claimHolder`，再 `setPending`，再唤醒或注入。之后若这条命令的请求被取消，DSH 把 `command/done` 记成 error，投影的 `active` 仍为假，`modeOf` 只把差异变成一条 `CANCELLED_ON` 健康说明（`mode.ts` 第 164 行），记录没人动。在假宿主上复现：s1 的 `/wish` 被取消后，记录是 `{kind: 'held', sessionId: 's1'}`，s1 投影 `{active: false}`；s2 随后 `/wish`，得到「这个项目的主 Agent 在另一个会话里（……会话 id s1）。要把它移到这里，输入 /wish here」。测试 `a /wish whose request was cancelled…` 断言了会话状态与健康，没有断言记录。

崩溃走同一条路径，而这台机器正在反复蓝屏：DSH 的 `command/run`、`command/done` 是只追加、随检查点落盘的日志事件，持有者文件是同步写的，重启后可能出现记录在、投影不在。反向的一支（`/wish off` 删了记录、`command/done` 丢了）会让会话凭投影重新成为主 Agent，健康写「持有者记录读不到」，有提示，可恢复。

下游受影响：`mainAgentOf` 与 `readHolder` 只看记录，不看投影；循环板按 `none`/`held` 决定删不删到点提醒，M5、M7 的晨报与巡检按它找会话。恢复靠在那个会话里再发 `/wish`（记录已指向它，直接通过）或在别处 `/wish here`，回复里有指路文字，所以不挡路。`enter` 一侧的修法（持有者会话开着而投影为假就接管）同时覆盖没人重开那个会话的情形，`alignOnCreation` 一侧只管重开的会话。

### 工具面不是边界：本步合入与启用的先后

现在只有 `disabled: true` 一道闸。具体坏在这几处：

- 主 Agent 按名调用 `Write`、`write`、`Edit` 能执行，`str_replace_editor` 的 `create`、`str_replace`、`insert` 也一样（收窄的只是模型看到的 schema）；`pwsh`、`bash`、持久会话与 `terminal_send` 的写入没有主 Agent 专属的拦截。
- guard 行开着时，通用的 `file-tools-only` 会拒绝 shell 写入，但纠偏说「改用 Write 或 Edit」（Issues 第 6 条），把模型指向它看不见却跑得了的工具。
- 身份节第二部分让模型用 `propose_to_human`、`record_human_answer`，这两个工具第 6 步才注册。
- `engine.ts` 第 154 行 `privileged = actor === 'human' || relay !== undefined`：任何 `llm` 写入带 `relay` 就有人的权限，没有核对。`graph_decide`、`graph_approve`、`graph_status` 与图命令行都走这条路，第 6 步的 `main-agent-graph` 第一条才关它。

`DeferredToolCall` 这条旁路是关着的：目录由 `expose(face)` 用裁剪之后的工具面建，被去掉的工具不在目录里，`DeferredToolCall` 对不在目录里的名字报「不可用」（`toolsearch/index.ts` 的 `candidate === undefined` 分支）。`str_replace_editor` 的收窄没有真实运行时的覆盖：rc.3 预设与 headless 模板里没有这个工具，只有 L2；形状不认识时整个去掉并报 degraded，方向是安全的。我没有穷尽枚举所有 `dsh-tool-*` 包与 MCP 工具有没有别的写文件手段，只确认了 `write`、`edit`、`str_replace_editor` 与 shell/终端这几类。

### 持有者文件的清理与读缓存

`claimHolder` 在 `finally` 里无条件 `unlinkSync(temporary)`。`link` 成功之后 `unlink` 抛错（EPERM/EBUSY），异常取代 `return true`，`enter` 把它当成写入失败返回 error，而记录已经写上。再发一次 `/wish`，记录指向本会话，直接通过，所以能自愈；但这一次的回复是错的，临时文件也留在用户目录里，没有清扫。`replaceHolder` 失败路径里同样的 `unlinkSync` 会盖掉真正的错误。`enter` 的 `try` 把 `demoteOthers` 抛出的异常也归到「持有者记录写不了」，同类，概率更低。

`readHolder` 的缓存键是 `mtimeMs/size`。本进程自己写之后会 `cache.delete`，所以只影响另一个进程（第二个 DSH 窗口、headless）在同一时间戳粒度内写入同长度记录的情形。

### 钩子装一半时的健康报告

`installAgentHooks` 先 `installed.add(agent)`，再装身份节监听器，再装工具面监听器。第二个 `on` 抛错时，外层的 try/catch（`agent/created` 与 `/wish` 各一处）会告警并报 degraded，但此后每步的身份节监听器都重新报 `active`，文字是「写文件的工具和 ask_user_question 已从工具面去掉」，而这个 agent 的工具面没人裁剪；`/wish` 再发也不补装，因为 `installed` 已有它。概率很低（`ctx.on` 在活的 agent 作用域上几乎不抛），但这是本步唯一一处报告与事实可以脱节的地方，修法很小。

### 人的原话：本步到哪里为止

`talk.ts` 在本步只有 `TALK_GUIDE`、`HIDDEN_FROM_MAIN_AGENT` 与 `ProposalKind`，没有投影、`isPersonMessage` 与 `personSaid`。`/wish` 的文字经 `createUserNotice` 交出，`source` 是 `{...facts, kind: 'glm-design-wish', form: 'notice', summary}`，`kind` 写在 facts 之后，facts 改不了它。所以第 6 步起这句愿望不能被 `record_human_answer` 引用为人的话；它进图靠提示词让模型逐字写进目标正文的 `需求：` 行，而 `stage.ts` 的 `need` 项只查这一行非空，访谈阶段的「需求」是模型的转述，没有核对。兜底在第 8 步的 `confirm`：需求卡八项齐了之后，人的原话经 `personSaid` 核对才推进。第 3 步到第 8 步之间，需求卡没有一项是 harness 核对过的，这又是这一行不能提前启用的一个理由。

onepage 承诺的「嗯」「行吧」先复述「那我记成：……」再记，在本步只是 `TALK_GUIDE` 里的一句话，harness 一侧没有强制；它由第 12 步（a）的标定指标（「原话不到 6 个码点、前面没有复述」）度量，不是门禁。

### 第 4 步要接住的矛盾

`rules.ts` 第 132 行的 `declare` 把「只用 Write/Edit 改文件」写进每个会话的 `glm:guard` 节，主 Agent 的 `glm:guard` 节紧跟在身份节之后：同一个提示词里一边说「你没有写文件的工具」，一边说「只用 Write/Edit」。基础设计 §3.1.4 的 `prepend` 设计解决了拒绝时的纠偏顺序；附录与基础设计里我没有找到对这一行声明的处理。第 4 步还需要一个导出的角色读法：`mode.ts` 里的 `isMainAgent` 是模块私有函数，导出的是 `roleOf` 与 `RoleDeps`；`mainAgentOf` 只读记录，不能代替它。

### 合入 main 时

冲突清单见 Issues 第 7 条；`docs/ORCHESTRATION.md` 自动合并成功。`HOURNESS_ROWS` 在 main 上没有被动过（M7 的 `execute` 只进了 `src` 列表，没有加行），不会冲突。R5b-N1（本仓库图上 `orch`、`bottom` 的旧 `stage`）与本步无关：评审建议在第 5 步合入 main 之前处理，简报把它放在第 9 步，请编排方在两者之间选定。持有者记录放在用户级目录，与 `design-context.md` 存储范围一节（持有者记录进项目 `.llm/`）相左；onepage 已向人说明「这次先不搬」并得到同意，`d-alignment-rounds` 记着对齐轮要搬。

### 没有覆盖的

取消的 `/wish` 之后记录的状态（I-1）；`str_replace_editor` 在真实运行时的收窄；`DeferredToolCall` 包一层的写入在真实运行时的拒绝（我只读了代码路径）；崩溃窗口里记录与投影的分歧。

</details>

<details>
<summary>文件清单</summary>

提交 e854399，37 个文件，+2923 −30。完整差异：`git -C .worktrees/m3 show HEAD`。

- `src/design/index.ts`：行入口，`/wish` 注册，投影注册，两个组装监听器，`agent/created` 的对齐。
- `src/design/mode.ts`：投影的折叠、待生效状态、`roleOf`、`/wish` 处理函数。
- `src/design/role-face.ts`：工具面裁剪与 `str_replace_editor` 收窄。
- `src/design/identity.ts`、`src/design/talk.ts`：身份节两部分，`TALK_GUIDE`、`HIDDEN_FROM_MAIN_AGENT`、`ProposalKind`。
- `src/graph/main-agent-holder.ts`：持有者记录的读、认领、替换、释放，`mainAgentOf`、`holderFileOf`、`holderHome`。
- `src/graph/plain-question.ts`、`src/graph/proposal.ts`：换词表、例题、指南；`renderProposal`。
- `src/guard/sections.ts`、`src/guard/index.ts`：`insertHournessSection`，`DECLARATION_SECTION` 搬家。
- `src/shared/dsh-min.ts`、`src/shared/health.ts`：薄类型，`HOURNESS_ROWS` 加 `design`。
- `packages/hourness/*`、`scripts/packages.mjs`、`knip.js`、`package.json`：行登记（`disabled: true`）、导出、测试清单。
- `tests/design-host.ts`、`tests/design-mode.spec.ts`、`tests/main-agent-holder.spec.ts`、`tests/plain-question.spec.ts`、`tests/guard-sections.spec.ts`，另 `tests/contracts.spec.ts`、`tests/guard-audit.spec.ts`、`tests/health.spec.ts` 的小改。
- `scripts/probe/*`、`scripts/sandbox.mjs`、`scripts/calibrate/simulated-human.mjs`：五个 L3 场景与模拟人骨架。
- `docs/ORCHESTRATION.md`、`DESIGN.md`、`DEVELOPMENT.md`、`HANDOFF.md`、`ROADMAP.md`：与代码同批的文档。

</details>
