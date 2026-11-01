# M3 实现：崩溃遗留工作的分诊

日期：2026-10-30。范围：勘察两个工作树里崩溃时未提交的起稿，把两个分支带到 main，在带着起稿的状态下跑 `npm run build`。本步没有提交，没有应用图改动，没有推送。

## 1. 结论

- main 的 HEAD 是 `0b6edf1`（graph: M3 implementation and M7 skeleton resumed after the crash），不是简报写的 `619b910`。`0b6edf1` 在 `619b910` 之上，只改 `docs/graph/` 下三个文件。
- `.worktrees/m3`（分支 `m3`）与 `.worktrees/m3-flow`（分支 `m3-flow`）现在都在 `0b6edf1`，都是快进到达，两个分支都没有自己的提交，`git stash list` 为空。
- 两个工作树里的遗留文件全部保留为起稿，没有丢弃任何一个。依据：逐文件读完全文与 diff，对照附录 §2.1–§2.8、§4 第 3 步与第 11 步、基础设计 §3.1、§3.6.4，没有发现与设计不能调和的半成品；`m3` 的起稿在带着它的状态下 `npm run build`、`npm run preflight` 通过，被它碰到的 `health`、`contracts`、`guard-audit`、`graph-main-agent`、`profile-shape`、`preflight` 六个 spec 全过；`m3-flow` 的起稿 build、preflight 通过，eslint 干净。
- 起稿都不完整：两边都没有任何 L2 测试、L3 场景和文档，`m3` 的起稿还有几处缺陷（§3.4）。它们是第 3 步和第 11 步的起点，不是成品，不能直接提交。
- 简报里的遗留文件数与实际不同：`m3` 简报写「十个已修改、七个未跟踪」，实际十个已修改、十二个未跟踪；`m3-flow` 简报写「四个已修改、两个未跟踪」，实际四个已修改、十一个未跟踪。所有文件的修改时间在 21:04–21:11 之间，勘察时（21:40 之后）没有进程在写它们。

构建结果（带着起稿）：

| 工作树 | HEAD | `npm run build` | 附带的诊断 |
| --- | --- | --- | --- |
| `.worktrees/m3` | `0b6edf164795ebc1928e6dff1e82a08bb7c76926` | 退出码 0 | preflight 通过；`npm run lint` 失败：eslint 3 条（全在 `tests/design-host.ts`），knip 17 条新发现（全因没有任何 spec 导入起稿而成「未使用」） |
| `.worktrees/m3-flow` | `0b6edf164795ebc1928e6dff1e82a08bb7c76926` | 退出码 0 | preflight 通过；`npm run lint` 失败：eslint 干净，knip 1 条（`ui/src/wish/model.ts` 的 `NARROW_BELOW_PX` 导出没有使用者，spec 会用到它） |

lint 报告的每一条都落在起稿自己的文件里（jscpd 与其余文件没有新发现），所以失败来自起稿没有测试，不是对既有代码的回归。主检出的 `node_modules` 里没有 `eslint`，`npm run lint` 在那里跑不起来（`scripts/check-lint.mjs`:34 `ERR_MODULE_NOT_FOUND`），本步没有在 main 上单独量基线，两个工作树的 `node_modules` 是完整的。第 3 步、第 11 步各自在加测试之后必须让 lint 回到基线。

## 2. 主检出

- `git status`：只有 `.kiro/` 与 `msg-refdir-gate.txt` 两项未跟踪，不是本步产生的，没有动。
- `git log --oneline -5`：`0b6edf1`、`619b910`、`a8c5f9b`、`c249769`、`aa7a013`。
- `git fsck --no-dangling` 没有输出，重建的索引正常。
- `git worktree list`：主检出、`.worktrees/m3`、`.worktrees/m3-flow`、`.worktrees/m7`。`.worktrees/m7`（另一个运行在用）没有碰。
- 周读钩子：`reading-digest` 最近一次读到 2026-10-29（Anthropic 到 10-27，OpenAI 到 10-23），今天 10-30，没到 7 天，下次 11-05。

## 3. `.worktrees/m3` → 第 3 步（m3-1：主 Agent 模式、持有者与身份）

### 3.1 怎样到 main

起点是 `a8c5f9b`（0 个自己的提交）。`git merge --ff-only main` 带着脏工作区执行：`a8c5f9b..0b6edf1` 只改 `docs/graph/` 下七个文件，与十个已修改文件没有交集，所以没有 stash。合并前后 `git status --porcelain` 逐行相同。崩溃遗留状态另存了一份字节拷贝：`.agents/tasks/m3/impl/notes/leftover-m3/`（`tracked.diff` 与 `untracked/` 下的 12 个文件），出问题时可以恢复。

### 3.2 逐文件处置

全部为「保留为起稿」。「已核」写的是做过什么核对；没有写测试，所以没有一个文件被运行时验证过，除非特别说明。

已修改的跟踪文件：

| 文件 | 起稿内容 | 处置与理由 |
| --- | --- | --- |
| `packages/hourness/cordis.patch.yml` | 在 `glm-hourness/rules` 之后、`glm-hourness/ui` 之前插 `{id: glm-hourness/design, name: dsh-hourness/design, disabled: true, inject: [commands]}`，附注释 | 保留。符合附录第 3 步第一条（位置在 graph-panel 之后、ui 之前）与「新行默认 disabled」。已核：preflight 通过，组合出 10 个编排层行。 |
| `packages/hourness/package.json` | `exports` 加 `./design` 与 `./design/locale/*.json` | 保留。与同级行的写法一致，preflight 通过。 |
| `packages/hourness/tsconfig.json` | `include` 加 `../../src/design` | 保留。build 通过。 |
| `scripts/packages.mjs` | `hourness.src` 加 `design`，`rows` 加 `{id: 'glm-hourness/design', module: 'design/index'}` | 保留。附录原文要求的就是这两处。 |
| `src/guard/index.ts` | 删去 `export const DECLARATION_SECTION`，改为从 `./sections.ts` 导入 | 保留。基础设计 §3.1.3 明文规定这一移动（`DECLARATION_SECTION` 与 `insertHournessSection` 放 `src/guard/sections.ts`，guard 与 `tests/guard-audit.spec.ts` 改为从那里导入，行为不变）。`guard-audit` spec 26/26 通过。 |
| `src/shared/dsh-min.ts` | 加 `SessionProjectionsService.stateOf`、`DesignAgentLike`（`ctx`、`steer`、`whenIdle`）、`DesignAgentsService`（`get`、`roots`）、`SessionPersistenceLike`、`DesignInvocationLike`、`CommandExecutionLike`、`CommandsExecutor` | 保留。已对照 `reference/dsh-desktop-0.2.1-rc.3/` 源码核实：`stateOf`（dsh-session-projection:126–131）、`roots()`（dsh-agent:623）、`steer`/`inject`/`followup`/`whenIdle`（dsh-agent-loop:806–875）、`sessionPersistence.list`（dsh-session-persistence-jsonl:2603）、`commands.execute` 的返回与 `command/run`、`command/done` 的字段（dsh-commands:327–395）。 |
| `src/shared/health.ts` | `HOURNESS_ROWS` 末尾加 `'design'` | 保留。设计 §6.6 与 preflight 都要求；`health` spec 22/22 通过。基础设计写「在 graph-panel 之后」，起稿放在 `rules` 之后（`rules` 行已在 main 上排在 graph-panel 之后），次序与 cordis 补丁里的行序一致。 |
| `tests/contracts.spec.ts` | 字面行 id 清单加 `'glm-hourness/design'` | 保留。`contracts` spec 12/12 通过。 |
| `tests/guard-audit.spec.ts` | `DECLARATION_SECTION` 改从 `../src/guard/sections.ts` 导入 | 保留。跟随 `src/guard/index.ts` 的移动。 |
| `tests/health.spec.ts` | 行清单断言加 `'design'` | 保留。跟随 `HOURNESS_ROWS`。 |

未跟踪的新文件：

| 文件 | 起稿内容 | 处置与理由 |
| --- | --- | --- |
| `packages/hourness/locale/design/zh.json`、`en.json` | 设置页标题与说明 | 保留。zh 说明比附录原句多「默认关闭。」，与同级 `rules` 行的写法一致；第 12 步（b）把设计行改为默认启用时要删这一句。 |
| `src/design/identity.ts` | `MAIN_AGENT_ROLE`、`MAIN_AGENT_TALK`、`MAIN_AGENT_IDENTITY`、`MAIN_AGENT_SECTION` | 保留。正文与附录 §2.2 第一部分逐字一致。实测长度：第一部分 1137（附录 1,137）、第二部分 1350、整节 2489，三个上限 1,500／1,400／2,700 都不超；不含 `ask_user_question`、`decision_card`、`design_review`、`ask_human`、`(Recommended)`、`(推荐)`、`（推荐）`、`depth`；含两个工具名与四个标签。 |
| `src/design/talk.ts` | `TALK_GUIDE`、`HIDDEN_FROM_MAIN_AGENT` | 保留，缺 `ProposalKind`（附录第 3 步明列本步有它，类型是 `'question' \| 'confirm' \| 'release'`）。`TALK_GUIDE` 实测 697，与附录一致。 |
| `src/design/role-face.ts` | `mainAgentFace`：按原生名去掉 `write`、`edit` 与 `HIDDEN_FROM_MAIN_AGENT`，把 `str_replace_editor` 的 `command.enum` 收窄为 `['view']`，形状不认识时去掉并返回问题 | 保留。逻辑与 §2.1 一致，报错字串与附录逐字相同。 |
| `src/design/mode.ts` | 会话投影 `hournessMainAgent` 的折叠、待生效状态、`modeOf`、`isMainAgent`、`/wish` 处理函数（含 `off`、`here [一句话]`、指路回复、接管已不存在的会话、记录损坏时覆盖） | 保留，有缺陷（§3.4）。对照附录 §2.4 的处理表逐行读过，行为与表一致；回复文字与附录给的字串一致。 |
| `src/design/index.ts` | 行入口：`name`、`inject`、`/wish` 注册、投影注册（`ctx.inject(['sessionProjections'])`）、`installAgentHooks`（身份节监听器带 `prepend`，`roleFace` 不带）、`agent/created` 的对齐（`whenIdle` 之后执行 `/wish off`，`undefined` 当失败） | 保留，有缺陷（§3.4）。结构符合 §2.1、§2.4、§2.2。 |
| `src/graph/main-agent-holder.ts` | `projectKey`、`holderFile`、`holderFileOf`、`holderHome`、`readHolder`（按 mtime 与 size 缓存）、`claimHolder`（`linkSync`）、`replaceHolder`、`releaseHolder`、`mainAgentOf` | 保留。与 §2.4 的接口表一致；位置在 `<userHome>/main-agent/<sha256(key) 前 16 位>.json`，与 onepage「这次先不搬进 `.llm/`」一致。 |
| `src/graph/plain-question.ts` | `PLAIN_WORDS`（5 项）、`PLAIN_QUESTION_EXAMPLE`、`plainWordsIn`、`PLAIN_QUESTION_GUIDE` | 保留。例题五个字段与附录逐字相同；`plainWordsIn(例题)` 为空，`gateway` 不算 `gate`；`PLAIN_QUESTION_GUIDE` 用 `renderProposal` 生成，段与段之间有空行，实测 652，不是附录写的 648（附录参考文本把五行排成单换行，少算 4 个换行）。简报的 R5b-N2 在这个文件里已经满足。 |
| `src/graph/proposal.ts` | `ProposalText`、`renderProposal(text, number)`，用空行分段 | 保留，是第 6 步的起点，不是第 3 步的内容。第 3 步只借 `renderProposal` 生成例题。缺 `PROPOSAL_FIELDS`、`PROPOSAL_LABELS`、`PROPOSAL_LIMITS`、`CIRCLED` 的导出、`proposalLineRefusal`、`splitBold`、`detail` 参数。输出形状与附录 §3.3 的 `renderProposal` 样例一致。 |
| `src/guard/sections.ts` | `DECLARATION_SECTION`、`insertHournessSection` | 保留。与基础设计 §3.1.3 的描述一致（在 `glm:guard` 之前插入，同名替换，没有时放最后）。没有单测。 |
| `tests/design-host.ts` | 假宿主：多个根 agent、命令生命周期、会话投影、`agents.get/roots`、`followup/steer/inject/whenIdle`、`sessionPersistence.list` | 保留，要先修 3 条 eslint 错误：第 141、142 行 `get: store.get`、`provide: store.provide`（`@typescript-eslint/unbound-method`，改箭头函数），第 174 行多余的类型断言（`no-unnecessary-type-assertion`）。它建模的 `commands.execute` 次序与 dsh-commands:327–395 一致。BASE_TOOLS 里没有 `str_replace_editor`，L2 需要时再加。 |

### 3.3 第 3 步：已起稿的与要从头做的

已起稿（保留，第 3 步在此基础上补完并提交）：

- 行登记：cordis 补丁、`package.json`、`tsconfig`、`scripts/packages.mjs`、locale、`HOURNESS_ROWS`、`contracts` 与 `health` 的清单。
- `/wish` 与持有者记录（含 `/wish here <一句话>`、`holderFileOf`、`holderHome`、`agent/created` 在 `whenIdle()` 之后对齐、`commands.execute` 返回 `undefined` 当失败）。
- 身份节与两个常量（`TALK_GUIDE`、`PLAIN_QUESTION_GUIDE`），`plain-question.ts`。
- `roleFace` 的主 Agent 一支。
- `/wish` 成功回复里「主 Agent 建议用强一点的模型」；报错字串「主 Agent 模式要用 DSH 的会话状态服务（sessionProjections），这个组合里没有」。

要从头做的：

- L2：`tests/design-mode.spec.ts`、`tests/main-agent-holder.spec.ts`、`tests/plain-question.spec.ts` 全部没有；`npm test` 脚本是显式文件清单，三个新 spec 都要加进去。`insertHournessSection` 也要有单测。
- L3：`glm-design-wish-idle`、`non-glm-design-wish-idle`、`glm-design-main`、`non-glm-design-main`、`glm-design-one-main` 五个场景，以及探针 provider 的 `other`、`fork` 字段、模拟人骨架（发 `/wish`、卡片请求以 `ASK_CANCELLED` 拒绝并记 `unexpected-question`），仓库里没有 `glm-design` 的任何痕迹。
- 文档：`docs/ORCHESTRATION.md` §3.1（一个项目一个主 Agent、`/wish here`）、§3.5（强一档模型两句）；`docs/DESIGN.md` 的行表与行健康表、`docs/HANDOFF.md` 的组件表。
- `talk.ts` 的 `ProposalKind`。
- 独立评审：本步要，起稿没有做过。

### 3.4 起稿里已知的缺陷（第 3 步必须改）

1. 行健康的降级被覆盖。`src/design/index.ts` 的身份节监听器（外层，`prepend`）在 `next()` 返回之后先调 `isMainAgent`（记录读不到时它报 `degraded`），紧接着无条件 `health.report(…, 'active', …)`；`roleFace` 监听器（内层）在 `next()` 之后报的「`str_replace_editor` 的参数形状不认识」也在外层恢复时被这条 `active` 盖掉。`RowHealth.report` 是按会话覆盖的（`src/shared/health.ts`:108–115）。已在假宿主上跑过：先 `/wish` 成为主 Agent，再把持有者记录改成坏 JSON，再组装一次，会话健康仍是 `active`、原因是「身份节已加上」。附录 §2.4 与第 3 步 L2 要求这两种情形报 `degraded`。修法由第 3 步定（例如只在这一步没有降级上报时才报 `active`）。
2. 读投影抛错时没有出声。`mode.ts` 的 `modeOf` 对 `stateOf` 抛错只 `catch { state = undefined }`，基础设计 §6.2「组装监听器：读投影抛错」要求告警一次、会话健康 `degraded`，AGENTS.md 要求失败要出声。
3. 激活期降级文字与 §2.8 不一致。`WAITING_STATE` 是「会话状态服务（sessionProjections）还没到，/wish 暂时用不了」，§2.8 与 L2 约定的是「主 Agent 模式要会话状态服务（sessionProjections）」；第 3 步 L2 对所有行健康说明做 `plainWordsIn`，改字句时一并核。
4. `design-host.ts` 的 3 条 eslint 错误（§3.2）。
5. 起稿没有被任何测试运行过。§3.2 里写「已核」的只是读代码、编译、以及一次性的冒烟（见 §5）；冒烟只覆盖 `/wish` 开启、指路、`here` 接管、原会话被 `/wish off`、持有者记录损坏时的健康状态，没有覆盖 `agent/created` 对齐、`fork`、并发 `claim`。

### 3.5 对后面步骤有用的起稿

- `src/graph/proposal.ts`、`src/design/talk.ts`：第 6 步在它们上面补全（`PROPOSAL_*` 常量、`proposalLineRefusal`、`splitBold`、`detail`、`isPersonMessage`、`talkApply` 等）。
- `src/guard/sections.ts`：第 4 步的 git 快照 notice 与后面各步不需要它；bootstrap 的项目规则节以后调用同一个 `insertHournessSection`。
- `src/graph/main-agent-holder.ts` 的 `mainAgentOf` 是给 M5、M7 的导出，本步只导出。

## 4. `.worktrees/m3-flow` → 第 11 步（m3-6：流程条与 `/wish` 入口）

### 4.1 怎样到 main

起点是 `dc49e11`（0 个自己的提交，落后 main 14 个提交）。`git merge --ff-only main` 带着脏工作区执行：`dc49e11..0b6edf1` 改的是 `docs/`、`src/`（`data`、`rules`、`shared`）、`tests/` 与 `.agents/tasks/rules/`，没有 `scripts/` 与 `ui/` 下的文件（`git diff --name-only dc49e11 main -- scripts ui` 为空），与四个已修改文件没有交集；没有分支自己的提交，所以不是变基而是快进，没有 stash。合并前后 `git status --porcelain` 逐行相同。字节拷贝在 `.agents/tasks/m3/impl/notes/leftover-m3-flow/`（`tracked.diff` 与 `untracked/` 下的 11 个文件）。

### 4.2 逐文件处置

全部为「保留为起稿」。

| 文件 | 起稿内容 | 处置与理由 |
| --- | --- | --- |
| `scripts/packages.mjs` | 客户端 `sources` 加 `ui/src/flow/`、`ui/src/wish/` | 保留。附录第 11 步原文。 |
| `ui/src/dsh.ts` | `CommandsRemote.list`、导出 `ProjectionValues`（加索引签名）、`UseSession`、`UseInput`、`InputActions`、`SessionSlotProps`、`sessions.list` 快照加 `byId` | 保留。附录 §4 第 11 步写「按需补 `useSession`、`inputActions`、`useInput` 与 `commands.list` 的薄类型」。已对照 `reference/dsh-desktop-0.2.1-rc.3/` 核实：`ctx.remote.commands.list`（dsh-client-ui-commands client.js:1416）、会话快照的 `blank`／`promptAttempted`（dsh-api-session-controller）、`setDraft`（dsh-client-ui-conversation client.js:14686、14951）、槽位 `conversation.input.dock`／`conversation.composer.dock` 与 `data-composer-dock`／`data-composer-input`（client.js:17909、19346–19347、18285）。 |
| `ui/src/hourness-client.tsx` | 注册 `installFlowBar`、`installWishCard`、`installWishPill`，文件头注释补充 | 保留。`inject` 清单不变（`remote.commands` 已在）。 |
| `ui/src/primitives.d.ts` | 声明 `react-dom` 的 `createPortal` | 保留。`scripts/ui-modules.mjs` 的客户端模块表里有 `react-dom`，产物 `client.js` 含它。 |
| `ui/src/flow/model.ts` | `flowBarText`（含 `cheapModel` 输入与 `modelNote`）、`isCheapModel`、全部给人看的字串、`FLOW_ORDER = 30` | 保留。文字与基础设计 §3.6.4、附录 §2.6 一致：「读不到阶段（项目图面板 glm-hourness/graph-panel 没有启用）」、便宜档按 `[-_./:\s]` 切词取整词、黄字「现在是 <模型>；主 Agent 建议换强一点的模型」、「这次就用它」；等待状态按「最后一条工具结果是 `propose_to_human` 且回合已结束」判，对应附录「含义改为主 Agent 在对话里等你回话」。`LiveView` 的 `recent`、`turnSince`、`model` 字段已对 `src/graph/live.ts` 核对。 |
| `ui/src/flow/FlowBar.tsx` | 停靠条组件与注册，`RenderGuard` 包裹，「这次就用它」按会话记在内存里 | 保留。 |
| `ui/src/flow/session.ts` | `useSessionValues`、`useGraph` | 保留。 |
| `ui/src/flow/shared.tsx`、`styles.ts` | `RenderGuard`、`WarnIcon`、样式 | 保留。 |
| `ui/src/wish/model.ts` | 开场卡片三种情形（`cardMode`）、按钮动作（`cardActions`、`draftPlan`）、`pillLabel`／`pillShown`、`outcomeOf`、命令列表读一次的状态机（`shouldReadCommands`、`afterRead`）、全部字串、`CARD_ORDER = 40`、`PILL_ORDER = 160`、`NARROW_BELOW_PX = 520` | 保留。字串与附录 §2.6 逐项一致（标题、正文、两个按钮、黄字「主 Agent 用强一点的模型」不含模型名与「便宜」、灰字、退出行、弹层两段说明）。 |
| `ui/src/wish/hooks.ts`、`Buttons.tsx`、`WishCard.tsx`、`WishPill.tsx`、`styles.ts` | 对应的 React 钩子与组件；`WishCard` 里 `FIRST_VISIT_LINE = false`（面板设计的 `FirstVisitLine` 还不在，附录 N4 允许不放） | 保留。 |

### 4.3 第 11 步：已起稿的与要从头做的

已起稿：附录第 11 步列的全部客户端文件（`ui/src/flow/`、`ui/src/wish/`）、客户端注册、`scripts/packages.mjs` 的 `sources`、`ui/src/dsh.ts` 的薄类型。

要从头做：

- L2：`tests/flow-bar.spec.ts`、`tests/wish-entry.spec.ts` 都没有；`npm test` 清单要加。`NARROW_BELOW_PX` 当前无人使用（knip 1 条），测试用上它。
- `plainWordsIn` 对所有给人看的字串为空的断言：`src/graph/plain-question.ts` 在 `m3` 分支，`m3-flow` 现在只有 main，导入不到。两条路：先在 `m3` 提交第 3 步，再把 `m3-flow` 变基到 `m3` 上做这一断言；或第 11 步先不带这条断言，合入 `m3` 之后再补。选哪条由第 11 步定，不能为此在 `m3-flow` 里另写一份 `plain-question.ts`。
- 文档：`docs/ORCHESTRATION.md` §4.8（流程条 order 由 20 改 30、开场卡片与按钮、黄字提醒），`docs/HANDOFF.md` 如有对应条目。
- 一个要在第 11 步审的点：`WishPill` 对每个会话都 `useGraph(remote, sessionId, true)`，普通会话也会持有图数据源，用来判断「有项目图」；附录写的显示条件需要这个信息，但是否值得每个会话都读图，没有被起稿论证。
- L4 随第 12 步（b）。本步无独立评审。

## 5. 做过的验证与一次性冒烟

- `npm run build`：两个工作树各一次，带着遗留文件，退出码 0。
- `npm run preflight`：两个工作树通过。
- `m3` 上的 spec：`health` 22/22、`contracts` 12/12、`guard-audit` 26/26、`graph-main-agent` 1/1、`profile-shape` 6/6、`preflight` 22/22。
- `npm run lint`（诊断，不是门禁）：见 §1 表格。
- 一次性脚本（用完即删，没有留在仓库里）：在 `m3` 上量了身份节长度；在 `tests/design-host.ts` 的假宿主上跑了 `/wish`、第二个会话 `/wish`（得到指路回复，工具面不变）、`/wish here`（原会话的 `/wish off` 由行执行，两个会话的身份节随之对调）、持有者记录损坏后的健康状态（暴露了 §3.4 第 1 条）。
- 没有跑完整 `npm test`：`npm test` 在 lint 一步就会因起稿失败而停止；没有跑 `npm run probe`。

## 6. 本步没做的

- 没有提交、没有 stash、没有推送、没有应用图改动。
- 没有改 `~/.dsh`，没有启动桌面版。
- `.agents/tasks/m3/impl/` 目录在本步开始时已存在（`brief.md`、`notes/step-map.md`，崩溃前的运行留下的），里面没有 `review-step*.json`，所以没有删除任何文件。本步新增 `notes/leftover-m3/`、`notes/leftover-m3-flow/`（两份字节拷贝）和本文件。
- 简报里的 R5b-N1（`orch`、`bottom` 带 `stage` 被新规矩读成未放行模块）属于第 6 步或定义模块与目标阶段写权限的那一步，起稿里没有碰。
