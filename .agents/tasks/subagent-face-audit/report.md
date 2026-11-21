# 子代理注入与工具面核查报告（task-8）

基线：worktree hz/task-8 @ dce167f（main 同基线），桌面安装版 0.2.2-rc.5（`resources\runtime\primary-runtime\runtime.json` desktopVersion）。只查不改。所有 rc.5 证据出自对安装版 `app.asar` 的原地抽取（不改 asar），探针实测出自 `node scripts/probe/run-probe.mjs --only glm-dispatch,glm-worker-memory,glm-exec-dispatch`（2026-11-21 13:41，产物在 `%TEMP%\glm-hourness-probe-2026-11-21T05-41-08-006Z-CoMJyF`，各场景 `requests.jsonl` 逐请求记录 wire 后的消息与工具面）。

## 0. 结论（主人四问之一：人设泄漏的确切注入点）

**确切注入点：DSH 核心行 `dsh-base/agent-instructions`（`@deepseek-ai/dsh-agent-instructions`）的 `agent/pre-step` 监听器。** 它对每个 agent——不看会话头 `origin`，派发的子会话照收——组合「基线指令集」：用户级两处（`$DSH_HOME/AGENTS.md` 与 `$AGENTS_HOME/AGENTS.md`）加项目根（往上第一个 `.git`）到工作目录链上的 AGENTS.md / CLAUDE.md（含 `.local` 覆盖），渲染成一条 **user 消息**（来源 `agent-instructions`、`baseline: true`），紧随本步已领取的消息折入下一步批次。喵桃人设写在用户级全局指令里，所以每个子会话第一次请求就带它，压缩后每次重放（FACTS.md §3 两条已实测记录；本次对 rc.5 asar 逐行复核机制未变）。

**worker 面现在到底过滤了什么：** 工具面经 wire 层（`src/glm-llm/face-wire.ts`）按会话裁剪，角色层四个 source 全部实测吻合（见 §2）；**但没有任何一层过滤 host 注入的消息**——`agent-instructions` 基线是 user 消息，本仓库代码对它只有两个读者（lessons 的路径读、glm-prompt 子目录去重），没有过滤者。编排层自己的人设通道（design 行 `persona` 配置 → `hourness:output-style` 节）确实只给主 Agent，这一半是干净的；泄漏的是用户级 AGENTS.md 这一条上游通道。ORCHESTRATION.md §3.1（564 行）已写明「用户自己 `~/.dsh/AGENTS.md` 里的人设所有 agent 都读得到，那是用户配置，插件不动」——是已记录的设计姿态，与 question-31 C（「子 agent 只拿它需要的」）并存：question-31 的范围是编排层的节与面，不含用户级指令。要不要为它开车道（过滤或维持现状），留给主人拍板。

## 1. 组装路径逐行核查表

### 1.1 系统提示各段来源（worker 子会话实测，glm-exec-dispatch 的 worker `hz-task-1-a1-x698tc`，system 全文 7723 字符）

| 段 | 来源 | 核对 |
| --- | --- | --- |
| ZCode 身份开头 + 安全声明 + `# Harness` 块 | glm-prompt assemble 监听器（`src/glm-prompt/index.ts:261-291`）把 `harness:identity` 换成 `buildIdentitySection(false,'user','dsh')`（`src/glm-prompt/identity.ts`，`src/glm-prompt/dialect.ts` 内）；对所有装了方言的 agent 一视同仁，worker 照拿 ZCode 原文 | 实测吻合 |
| `# Reporting Depth` | glm-prompt `reportingDepthSection`（常设细度，非人设） | 实测在 |
| `# Session-specific guidance` | glm-prompt coding-tier 节（`dialectSections`，`src/glm-prompt/index.ts:109-130`） | 实测在 |
| `# Memory` | glm-prompt `glm:memory` 节，`memorySectionApplies` 按投影面判断（`src/glm-prompt/index.ts:143-145`）——worker 面无记忆工具，节不进 | 实测 worker 无、主 Agent 有 |
| `# Context management` | glm-prompt `glm:context-management` | 实测在 |
| `# Main agent` | design 行身份节（`src/design/index.ts:347`），只给主 Agent | 实测 worker 无、主 Agent 有 |
| `# Workspace rules` | DSH 核心静态段（沙盒前言），非 AGENTS.md | 实测在 |

### 1.2 消息注入清单（worker 第一步请求实测，按序）

1. `system-prompt`（上表各段）
2. `working-directory`（运行时：工作目录变更通知）
3. `user` = **简报原文**（`src/execute/brief.ts` `body()`，纯图数据 + 派发事实；实测 2002 字符，头部 `# Task task-1: Add the feed`，无 DSH 收尾指引——探针检查钉住 U1）
4. `runtime-context`（运行时）
5. `hourness-env`（env 行草稿区提醒）
6. `glm-tool-search`（延迟工具公告）
7. `skill-catalog`（技能目录）
8. （本轮场景 DSH home 无用户级 AGENTS.md，故无 `agent-instructions` 基线；基线到达子会话由 `glm-compact-instructions` 场景检查钉住：子会话第一次请求带用户级 + 项目两个标记，run-probe.mjs:5863）

### 1.3 工具面清单（实测名单 + 代码来源）

wire 层组合（`src/glm-llm/face-wire.ts`）：角色层（`glmHournessFaces` 各 source 的 removals/narrowing，按原生名）→ 方言别名层 → 工具检索曝光拆分；`ZcodeAdapter.stream`（`src/glm-llm/zcode.ts:675`）与探针 adapter 同一函数。面不是边界：去掉只是省面，按名可调，guard/工具体拦（ORCHESTRATION §3.1 557 行）。

| 会话 | 实测面（GLM 路由，LocalToolSearch 分裂后） | 与设计的差 |
| --- | --- | --- |
| 主 Agent（exec-dispatch） | Bash, DeferredToolCall, Glob, Grep, LocalToolSearch, Read, answer_worker, await_human, check_commit, dispatch_task, get_goal, lessons_query, memory_habit, propose_to_human, record_human_answer, skill, subagent, subagent_fork, workflow | 无 write/edit/ask_user_question（design source）；无 str_replace_editor 出面；worker 工具不在（execute source）——全部吻合 |
| 派发 worker（dispatch_task） | Bash, DeferredToolCall, Edit, Glob, Grep, LocalToolSearch, Read, Write, ask_main, ask_user_question, **bootstrap_review**, get_goal, lessons_query, skill, structured_output, subagent, subagent_fork, submit_plan, workflow | 图写九件 + graph 读全不在（execute source，A3 后延迟）；execute/operate 不在；propose/record 不在；submit_plan+ask_main 在——吻合；**bootstrap_review 在 = 缺口（§3.2）**；ask_user_question 在 = 设计如此但上游必拒（§3.3） |
| probe 派发子会话（probe_dispatch，非登记 worker） | 同上形：Write/Edit 在，bootstrap_review 在 | 同上 |
| 普通 `subagent` 只读子会话（派发链内） | Write/Edit/ask_user_question/bootstrap_review 在，无 worker 工具 | 面保持全集、写入靠 `dispatch-chain-readonly` 按名拒（设计如此，实测拒并落流水） |
| worker（glm-worker-memory） | 16 件，无 memory_store/query/forget、learning_signals、memory_habit、lessons_merge；lessons_query 在 | memory source（`src/shared/face-policy.ts:96-111` 按 origin）+ lessons source 裁剪全部吻合；`glm:memory` 节随面消失 |

### 1.4 guard 工具名拦截表（面之外的边界）

- 判定按原生名：调用名经方言服务 `toNativeTool` 换算（`src/guard/execute-rules.ts:61`、`src/shared/dialect.ts`）；纠正文案里的工具名按模型可见名（`face`，`src/guard/rules.ts:29`）。
- 表本身（guard 侧按名认的工具集合）：文件工具 `write/edit/str_replace_editor`（`fileToolTargetOf`、`isFileWrite`，rules.ts:71/215）+ `read/glob/grep` 记录面（execute-rules.ts:102）；shell `pwsh/bash/terminal_send`（rules.ts:128）；图写 `graph_propose…graph_walk` 十一件（execute-rules.ts:95）；消息 `send_message/interrupt_agent`（execute-rules.ts:99）；git 只读子命令清单（execute-rules.ts:182）。
- worker 会吃到的规则：`worker-scope`、`dispatch-chain-readonly`、`worker-graph-readonly`、`worker-git`（execute-rules.ts:75-85）；`worker-message-live-only` 与 no-wait 只判主 Agent（实测 worker 的 sleep 放行）。
- GLM 路由上被裁掉的工具经 `DeferredToolCall` 在 `tools/pre-execute` 之前拒收（ORCHESTRATION §3.1）。

## 2. 实测记录

- 三场景 36 检查 35 过：glm-dispatch（后台派发、父不等待、范围门禁）、glm-worker-memory（worker 记忆面）、glm-exec-dispatch（dispatch_task worker 全链）。
- 唯一 FAIL：`data: usage lands only in the user-level directory…`——真实 `C:\Users\29596\.dsh\glm-hourness\audit\usage.jsonl` 在探针运行期间长了约 2130 行。归因：并发写入。本核查会话自己就跑在桌面宿主的 GLM 路由上，探针跑的十几分钟里它的用量照常落账；非本次代码的行为。
- 探针锁事件（要向主人披露）：13:41 我取锁时，task-1 的全量探针声明（槽 1，`probe-runner` pid 15844，13:01 写入）经锁模块判定 **pid 已死**，按协议接管，旧声明保留为 `owner.txt.stale-1795194673174` 同目录旁证（接管前另有一份 00:12 的 stale）。**task-1 的全量探针要么已死要么已退出**，需要主人侧确认是否重跑。
- worker 实测补充：11 请求全在派发模型 glm-5.3-flash、独立 worktree；越界写拒、`.hourness/` 报告区放行、图 status 按名拒、push 拒、reset --hard 先快照——worker-scope/worker-graph-readonly/worker-git 全走通。

## 3. 发现，三类归因

### 3.1 上游行为（DSH 核心）＋设计如此（本仓库已记录的姿态）：用户级 AGENTS.md 进每个子会话

- 注入点（rc.5 asar `dsh/node_modules/@deepseek-ai/dsh-agent-instructions/lib/index.js`，与 rc.3 导出 `reference/dsh-desktop-0.2.1-rc.3/` 同目录同名文件逐函数同形；rc.3→rc.5 仅 `inject` 从 `["sessionProjections","workingDirectory"]` 变 `["agents","workingDirectory"]`）：
  - `ctx.on("agent/pre-step", …)`（拼接件行 2088）→ `compose(agent, …)`（行 1917）：对每个 agent、不看 origin；
  - 基线来源 `loadBaselineInstructionSet({ cwd, dshHome, agentsHome, projectRoot, … })`（行 1938-1950）；用户级两根 `$DSH_HOME/AGENTS.md`、`$AGENTS_HOME/AGENTS.md`（`USER_GLOBAL_DIRECTORIES`/`USER_GLOBAL_FILE`，行 753-776，1339）；
  - 产物是一条 user 消息 `{ source: { kind: "agent-instructions", form: "instructions", baseline: true, … } }`（行 1987-1996），`agent/pre-step` 里折进本步消息。
- 本仓库对它没有过滤层：`grep 'agent-instructions' src/` 只有 lessons（`src/lessons/path.ts:49-50` 读路径）与 glm-prompt 子目录去重（`src/glm-prompt/subdir-instructions.ts:231`）。
- 文档姿态：ORCHESTRATION §3.1 564 行「用户自己 `~/.dsh/AGENTS.md` 里的人设所有 agent 都读得到，那是用户配置，插件不动」；FACTS §3 两条实测（L3 场景 `glm-compact-instructions`，检查 run-probe.mjs:5861-5863 钉住子会话照收 + 压缩后重放）；图上 d-habits-into-framework 批注（2026-11-06）「子 agent 也收到」。
- 张力：主人预期（question-31 C「人设只给主 Agent、子 agent 只拿它需要的」）与这条上游通道的现状相反；但 question-31 的决定范围是编排层自己的节与面（glm:persona 节删并入 output-style、汇报细度、guard 重复声明），用户级指令当时不在清单里。**这不是谁忘了实现，是记录过的取舍**；若要改（例如为 worker 会话过滤 agent-instructions 基线，或文档明示依赖用户自己把人设挪进 design 行 persona 配置），另立车道。

### 3.2 实现缺口：委派子会话的工具面保留 `bootstrap_review`

- `src/bootstrap/index.ts:313-318`：`origin === 'subagent'` 时直接 `return NO_REMOVALS`（315 行）——所有委派子会话保留 `bootstrap_review`；同函数注释（307 行）与 face-migration design §6 D（「bootstrap_review 只留有开着接管的主 Agent」）、`src/shared/tool-names.ts:230` 的注释都说不该在。
- 实测：glm-dispatch 子会话面、glm-worker-memory worker 面、exec-dispatch worker 面与普通只读子会话面上都有它。
- 影响评估：无边界风险——`bootstrap_review` 工具体查调用者，非主 Agent 调用被拒；这是面噪音（给模型一件它永远用不了的工具），恰是 face-policy 契约声称要省掉的（`src/shared/role-face.ts:8` 「it spares the model a tool it cannot use」）。修法是把这个 early-return 反过来：origin 'subagent' 也回 `REVIEW_REMOVALS`（子会话不可能是主 Agent）。只查不改，留给主人/车道。

### 3.3 设计如此（含两处「面与可用性不一致」的记录）

- worker 面保留 `ask_user_question`（design source 对非主 Agent 只裁 propose/record，`src/design/role-face.ts:32`）：上游 `userQuestions.ask` 对委派调用者抛 `DELEGATED_CALLER`（ORCHESTRATION §3.2 583 行），worker 调必拒——与 3.2 同类的面噪音，但这是设计名单如此，非代码矛盾。
- 普通 `subagent` 只读子会话面保留 Write/Edit：写入靠 `dispatch-chain-readonly` 按名拒（实测拒、落流水、文件未写出）——「面不是边界」的既有语义（question-26 C）。
- 编排层自己的人设通道干净：design 行 `persona` 配置只给主 Agent 加 `hourness:output-style` 节（`src/design/index.ts:350-354`，`assembledAsMain` 门），普通会话与委派子会话都没有；实测 worker system 无任何 persona 节。
- worker 系统提示 = ZCode 原文 + 汇报细度 + 会话指引 + 上下文管理 + 工作区前言，无 `# Memory`、无 `# Main agent`、无 guard 节——与 question-31 C「子 agent 只拿 ZCode 原文、guard 一句与它要用的工具」相符（guard 在 worker 上是拒绝时才见文案，不占系统提示）。

## 4. 对照表：设计文本 ↔ 实现

| ORCHESTRATION §3 | 实现 | 状态 |
| --- | --- | --- |
| §3.1 557 主 Agent 面裁 write/edit/ask_user_question、str_replace_editor 收 view、非主裁 propose/record，wire 层执行 | `designFaceSource` + `wireFace` | 吻合（实测） |
| §3.1 564 用户级 AGENTS.md 所有 agent 读得到，插件不动 | 无过滤层 | 吻合（姿态如文档） |
| face-migration §6 B/C/D 各 source | design/execute/memory/lessons/bootstrap 五 source | 前四吻合；bootstrap 对 subagent 一支与文本矛盾（§3.2） |
| §3.2 581 子 agent 身份只有简报；工具面限制靠 guard | 简报即首条 user 消息；worker 面另有 execute source 裁剪（M7 后于该文本） | 吻合，文档该行写于面迁移前，字面已过时但方向未反 |
| §3.1 559 放行前子 agent 只读 | `design-before-release`（glm-design-* 场景，本轮未跑） | 既有 L3 绿，未复测 |
| FACTS §3 基线进子会话、压缩后重放 | rc.5 机制同形 | 吻合（asr 复核 + 既有 L3） |

## 5. 证据与可复现

- rc.5 抽取：`node <scratch>/extract-asar.mjs "dsh/node_modules/@deepseek-ai/dsh-agent-instructions" <out>`（asar 原地只读；脚本随 scratch 删除，格式是 asar 头 8+headerSize 偏移 + JSON 目录，可重写）。
- 探针：`npm run build` 后 `node scripts/probe/run-probe.mjs --only glm-dispatch,glm-worker-memory,glm-exec-dispatch`（自动取空锁槽）；产物目录见 §0，requests.jsonl 每行 `{sessionId, system, messages, tools}`。
- 逐行核查的代码：src/glm-prompt/{index,assembly,identity}.ts、src/design/{index,persona,identity,role-face}.ts、src/execute/{faces,brief,dispatch}.ts、src/glm-llm/{face-wire,zcode}.ts、src/shared/{face-policy,tool-names}.ts、src/guard/{rules,execute-rules}.ts、src/memory/index.ts、src/lessons/index.ts、src/bootstrap/index.ts、scripts/probe/{run-probe,probe-dispatch,probe-lock}.mjs。
