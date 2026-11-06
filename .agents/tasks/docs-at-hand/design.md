# docs-at-hand 设计：组件旁的知识文档、按路径送到手边、同步核对与每日漏提交提醒

版本：0.3（2026-11-07）。0.1 经第 1 轮独立评审（同目录 `review.md`）：APPROVED，挡路 0 条，不挡路 10 条；0.2 处理了这 10 条。0.3 按人 2026-11-07 02:24 的话收敛（原话与四条收敛见 §13），第 2 轮评审只审改动处，记录见 §14。项目图节点 `docs-at-hand`（父节点 `orch`）。
依据：节点正文与两条验收；`orch` 节点 2026-11-06 的两条批注（缺口清单）；视频字幕（主检出 `.agents/tasks/docs-at-hand/source-transcript.md`，仓库外另有 `C:/Users/29596/Desktop/Project/工具目录/字幕提取-原子能-AI协作知识库.md`）；`docs/CHARTER.md` 0.9；`docs/ORCHESTRATION.md` §2.5、§8.6、§17、§18；`docs/DESIGN.md` §2.4a；M7 设计 0.6（`.worktrees/m3/.agents/tasks/m7/design.md`，代码在分支 `m7` 的 `031159a`，未合入 main）；接管设计 0.6（`.agents/tasks/bootstrap/design.md`）；循环板 `src/loops/`、经验板 `src/lessons/`（main `db160034`）。
范围：设计，加 §1 的一项事实实测。0.3 起第一、二、四件按本稿实现；第三件与第一件的生成部分等 M7 合入 main。
证据写法：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行，包名省略 `dsh-` 前缀（同 `DESIGN.md` §2.4a）。〔实读〕读过源码；〔实测〕本稿 §1.2 或已有探针跑过；〔推断〕由源码推出、没有运行；〔未核实〕列进 §9。
干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文。

## 0. 摘要

事实：DSH rc.3 的 `dsh-agent-instructions` 会加载子目录的 `AGENTS.md`，但只在原生文件工具 `read`、`write`、`edit` 成功触碰到会话工作目录之下更深的目录之后，在下一次请求里追加一条消息；shell、`grep`、`glob` 不触发，工作目录以外不触发，GLM 路由上的 ZCode 别名 `Read`、`Write`、`Edit` 也不触发（工具名对不上）。实读给出行号，headless 沙盒三个场景实测（§1）。

四件事的做法（0.3 的原则：不加新行、不加新文件、不加新规则，并进已有的东西）：

| 件 | 做法 | 放在哪 | 验证 |
| --- | --- | --- | --- |
| 一、组件目录旁放什么 | 约定「目录里有 `AGENTS.md` 就是一个组件」；一个文件，没有第二个：`AGENTS.md` 里是索引（是什么、边界、约束与不变量、所依据的决策 id）加「流程」（Mermaid）与「案例」（文字版端到端）两节。修改历史、待办、决策正文不进文档，只在图与 git 里，由提醒按路径现查 | 格式写进 `ORCHESTRATION.md` §8.7；模板常量随生成部分（第三批）进 M7 简报，本轮不写没人用的代码 | 第二件的 L2 读「决策」一节 |
| 二、按文件路径送到手边 | 并进经验行 `glm-hourness/lessons`（出厂启用，不新增行）：在它已有的 `tools/post-execute` 一侧再装一个监听器，成功的 `read`、`write`、`edit` 之后，把「按这条路径匹配到的经验」「该组件 `AGENTS.md` 列的决策 id 在图上的现状与开着的活」「DSH 没有送达时的组件 `AGENTS.md` 正文」合成一条提醒；失败的调用仍走原来的失败匹配，一次调用只有一条 | `src/lessons/path.ts`（监听器）、`src/lessons/docs.ts`（纯函数）；`failure.ts` 小改 | L2；L3 GLM 与非 GLM 两个场景；L4 随批次 |
| 三、同步核对 | 不加规则、不加门禁：交回结构里加一行 `docs`（文档是否仍对），交回处理在改了有文档的组件而没有这一行时往交回摘要批注里写一句，审查清单加一条核对它；这取代一页稿的岔路 2 | M7 的 `src/execute/handback.ts`、`schemas.ts`、`brief.ts`；纯函数 `docsGaps` | L2；L3 随 M7 执行探针；本轮不做 |
| 四、每日漏提交、漏推送提醒 | 循环板默认条目 `loops.unsynced-daily`：每天 18:05 的时间条目，告诉主 Agent 去查（读 git），有东西才跟人说，干净的那天不出声、不提交不推送；不新增事件、不新增扫描代码 | `src/loops/defaults.ts` 一条 | L2；L4 随批次 |

顺带发现（不在本节点范围）：GLM 路由上用户自己的子目录 `AGENTS.md` 一概不进上下文（§1.5）。第二件在 DSH 没有送达时补送组件 `AGENTS.md` 正文，根因属于 GLM 通道包的工具面，已有另一条线在查。

待人定：无。范围、第三件的做法与每日提醒的放法，人已授权按推荐与 02:24 的收敛定（§13）。

## 1. 事实实测：DSH 是否加载子目录的 AGENTS.md

### 1.1 实读（rc.3 运行时包 `dsh-agent-instructions`）

| 事实 | 依据 |
| --- | --- |
| 行在 `dsh-base` 里默认挂上，`maxBytes: 65536` | `reference/dsh-desktop-0.2.1-rc.3/dsh-base/cordis.patch.yml`:303–306 |
| 候选文件名：`AGENTS.md`、`CLAUDE.md`，叠加的 `AGENTS.local.md`、`CLAUDE.local.md`；项目根的标记 `.git` | agent-instructions:16–18 |
| 项目根：从会话工作目录往上找第一个含 `.git` 的目录（`stat` 成立即算，所以工作树根的 `.git` 文件也算） | agent-instructions:574–582、545–564 |
| 开局基线：用户级 `$DSH_HOME/AGENTS.md`、`~/.agents/AGENTS.md`，再加「项目根到工作目录」这条链上每层的候选，由浅到深 | agent-instructions:646–676、589–602 |
| 触发子目录加载的只有三个工具名：`read`、`write`、`edit`，取参数 `file_path` | agent-instructions:1210–1221 |
| 只看工作目录之下：从工作目录到被触碰文件所在目录之间的每一层（不含工作目录本身）；路径在工作目录之外时一层都没有 | agent-instructions:609–615、1052 |
| 时机：`tools/result` 收下触碰；步还开着就等 `step/end`，再排一次对账，把结果放进收件箱的 `next-step`，下一次 `agent/pre-step` 把它插在认领的消息之后 | agent-instructions:1425–1445、1384–1405、1346–1370、1406–1424 |
| 新目录的文件渲染成「Additional instructions from: <路径>」，前面一句「These instructions apply to work under `<目录>`…」；文件改了是「Updated instructions from: <路径>」带新内容；删了是「Instructions removed」 | agent-instructions:256–291、1155–1173 |
| 不合并文本：基线一条，之后每批变化一条 user 消息（来源 `agent-instructions`，带 `changes`）；同一目录里修剪空白后内容相同的候选只留一份；整批受 `maxBytes` 限，超出先丢浅的、再截最深的 | agent-instructions:879–909、730–746、361–440 |
| 内容没变的不再送；可见历史里的变化记录与版本缓存决定要不要重读 | agent-instructions:1126–1158 |
| 每次 `agent/pre-step` 都对账一次：可见历史里出现过的每个作用域（基线的与子目录的）按文件系统给的版本重查，版本变了就重读，内容变了出整份替换，文件没了出移除；没加载过的目录不在其中，要等触碰 | agent-instructions:1406–1410、1317、1046–1051、1116–1135 |
| 没有文件系统服务（`ctx.get('fs')`）时什么都不做 | agent-instructions:1237–1238 |
| GLM 路由上，ZCode 别名以自己的名字 `Read`、`Write`、`Edit` 注册成工具，执行时直接调原生工具体，不经工具服务再派一次；宿主给这次执行的 `exec.name` 就是调用名 | 本仓库 `src/glm-prompt/index.ts`:239、`src/glm-prompt/aliases.ts`:282、294；tools:3229–3260（`createExecution` 的 `name` 取调用名，3232） |

### 1.2 实测（2026-11-07 01:47 UTC+8，headless，不花模型积分）

做法：一次性脚本（放在 `%TEMP%`，不进仓库）用 `scripts/sandbox.mjs` 的 `generateProfile` 在系统临时目录生成 `probe-full` profile（两个包都装，junction 指向主检出的 `packages/*`，主检出 dist 为 `6b0b808` 的构建，与 main `54a4077` 代码相同，只读使用），挂探针 provider `scripts/probe/probe-llm.mjs`（脚本化回复，不联网），以 `DSH_HOME` 指向临时 DSH home（其中写一份含标记串的用户级 `AGENTS.md`）启动。工作区是新 `git init` 的临时仓库：根、`pkg/`、`pkg/sub/`、`other/`、`shell/`、`grep/` 各一份含不同标记串的 `AGENTS.md`，`pkg/` 另有 `AGENTS.local.md`，`grep/` 另有 `CLAUDE.md`。按 `DEVELOPMENT.md` §1.1 取 `.llm/probe-lock`（01:47:03 建、01:47:30 前删）。三次启动退出码都是 0。运行目录 `%TEMP%\glm-hourness-probe-nested-2026-11-06T17-47-06-148Z-wm1CiO`（不在仓库里，junction 已拆）。

| 场景 | 路由与工具名 | 工作目录 | 第几次调用、做什么 | 下一次请求里来源为 `agent-instructions` 的消息 |
| --- | --- | --- | --- | --- |
| native | `deepseek-probe`（非 GLM），原生 `read`、`pwsh`、`grep`、`write`、`edit` | 仓库根 | 第 1 次请求 | 基线 1 条：用户级、根 `AGENTS.md` |
| | | | 1：`read pkg/sub/file.txt` | 多 1 条：`pkg\AGENTS.md`、`pkg\AGENTS.local.md`、`pkg\sub\AGENTS.md`，各带「apply to work under」一句 |
| | | | 2：`pwsh Get-Content shell/x.txt` | 不变 |
| | | | 3：`grep` 搜 `grep/` | 不变（`grep/AGENTS.md`、`grep/CLAUDE.md` 都没进来） |
| | | | 4：`write other/new.txt` | 多 1 条：`other\AGENTS.md` |
| | | | 5：`read pkg/sub/AGENTS.md`（未改） | 不变 |
| | | | 6：`edit pkg/sub/AGENTS.md`（改标记串） | 多 1 条「Updated instructions from: pkg\sub\AGENTS.md」带新内容；旧的那条仍在历史里 |
| | | | 7：`read pkg/sub/file.txt` | 不变 |
| glm | `glm-5.3`，ZCode 别名 `Read`、`Bash`、`Grep`、`Write`、`Edit` | 仓库根 | 同上 7 步 | 8 次请求都只有基线 1 条；没有任何子目录的文件，编辑之后也没有更新 |
| subcwd | `deepseek-probe` | `pkg/` | 第 1 次请求 | 基线 1 条：用户级、根、`pkg\AGENTS.md`、`pkg\AGENTS.local.md` |
| | | | 1：`read ../other/note.txt`（工作目录之外） | 不变 |
| | | | 2：`read sub/file.txt`（相对路径） | 多 1 条：`pkg\sub\AGENTS.md` |

### 1.3 结论

1. 加载，有条件〔实读〕〔实测〕。原生 `read`、`write`、`edit` 成功触碰工作目录之下的文件后，下一次请求追加一条消息，列出从工作目录往下到该文件所在目录之间每一层的 `AGENTS.md`、`CLAUDE.md` 与两种 `.local` 叠加文件，由浅到深。
2. 不加载的情形〔实读〕〔实测〕：shell 读写、`grep`、`glob`；工作目录之外的路径（包括工作目录上级的兄弟目录）；GLM 路由上经 ZCode 别名的调用。最后一条的原因是触发表只认三个原生名，别名的 `exec.name` 是 `Read`、`Write`、`Edit`。
3. 何时〔实读〕〔实测〕：开局只有基线（用户级两处，加项目根到工作目录这条链）；子目录的在触碰之后、本步结束后的下一次请求里出现。已经加载过的文件（基线的与子目录的）每一步按版本重查：改了出整份替换，删了出「已移除」，不需要再触碰〔实读，未实测：评审指出之后准备的补测（加载后由 shell 改、删文件，不触碰再走一步）在 02:02–02:17 之间两把探针锁都被别的线占着，按规矩不抢，没有跑，列进 §9 U8〕；§1.2 第 6 步的「Updated」是经工具触碰得到的，不能区分两种机制；没加载过的目录要等原生文件工具触碰。包说明 README 的「Refresh is touch-driven」与代码不一致，以代码为准。
4. 怎样合并〔实读〕〔实测〕：不合并文本，按批追加 user 消息；旧消息留在历史里，替换靠新消息里的一句话。「更具体的优先」只是写给模型的一句，宿主不做覆盖。预算 64 KiB 一批。
5. 压缩之后〔推断〕：基线会重新加载（已实测，`FACTS.md` §3）；子目录的那几条被压缩掉以后，按可见历史对账，不会自动补回，要等再触碰那个目录。
6. 派出去的子 agent〔推断〕：按它的工作目录（`workingDirectory.ensure`）找项目根，工作树根的 `.git` 是文件，`stat` 成立，所以 M7 的 worker 在工作树里时基线读的是工作树里的根 `AGENTS.md`，子目录规则同第 1 条。

### 1.4 拟进 `docs/FACTS.md` §3 的文字（本轮不改 FACTS.md）

在 §3 表里紧接现有的 `dsh-agent-instructions` 压缩一行之后加一行：

| 事实 | 证据 |
| --- | --- |
| DSH 0.2.1-rc.3 的 `dsh-agent-instructions` 加载子目录的 `AGENTS.md`（同目录的 `CLAUDE.md`、`AGENTS.local.md`、`CLAUDE.local.md` 同样），只在原生文件工具 `read`、`write`、`edit` 成功触碰会话工作目录之下的文件之后：本步结束后的下一次请求追加一条来源为 `agent-instructions` 的 user 消息，列出工作目录到该文件所在目录之间每一层的候选，由浅到深，每份前面一句「These instructions apply to work under `<目录>`」。已经加载过的文件每一步按版本重查，不必再触碰：改过的以「Updated instructions from」整份替换、删掉的以「Instructions removed」声明，旧消息留在历史里（包说明写的「Refresh is touch-driven」与代码不一致）。shell、`grep`、`glob` 不触发新目录的加载，工作目录之外的路径不触发；GLM 路由上经 ZCode 别名 `Read`、`Write`、`Edit` 的调用不触发（触发表只认原生名，别名执行时 `exec.name` 是别名）。开局基线只含用户级两处与项目根（往上第一个 `.git`）到工作目录这条链 | headless 沙盒实测 2026-11-07（`docs-at-hand` 设计 §1.2：非 GLM 路由 7 步、GLM 路由同 7 步、工作目录在子目录 2 步，工作区各层放含标记串的候选文件；三次启动退出码 0）〔实测〕；已加载文件每一步按版本重查（外部改动与删除不必触碰）这半句只有〔实读〕，L3 补测之后再改标注；agent-instructions:16–18、589–615、646–676、1046–1051、1116–1135、1210–1221、1317、1384–1445〔实读〕；别名注册 `src/glm-prompt/index.ts`:239、`aliases.ts`:282、294，tools:3232〔实读〕 |

### 1.5 顺带发现：GLM 路由上子目录的 `AGENTS.md` 进不来

影响：任何项目在 GLM 路由上都拿不到 DSH 的子目录指令，包括用户自己写的、与本节点无关的那些。这是通道包工具面造成的宿主能力缺失，属于 `glm-house`（`DESIGN.md` §5.4 工具面、§5.8 差异总表），不在本节点范围，另有一条调查线在查。几条可能的修法，本稿不选：（甲）别名的 `execute` 经工具服务以带 `parent` 的子调用跑原生工具（`run_code` 的先例，tools:1362–1376；子调用的触碰会冒泡到父调用，agent-instructions:1435–1441），代价是 `tools/pre-execute` 与 `tools/post-execute` 上的监听器各多看到一次调用，guard、规则板、指标、经验的计数要逐个核对；（乙）通道包为别名调用重做一遍发现逻辑，重复宿主的代码；（丙）在 `DESIGN.md` 写明这一差异。第二件（§5）在 DSH 没有送达时由经验行补送组件的 `AGENTS.md` 正文（任何含 `AGENTS.md` 的子目录都算组件；`CLAUDE.md` 与 `.local` 叠加不补），所以这一缺口在装了编排层包时被部分补上；只装 GLM 通道包时照旧。「DSH 有没有送达」按这次调用的工具名与位置判（§5.3），判法对两种路由都成立，别名修好之后（甲）会让别名调用的判法变化，那条判法要同批改（§9 U7）。

## 2. 需求、目标与依据

### 2.1 从视频到四件

视频的要点与本稿的对应（字幕时间）：

- 代码说不出 why 与 how，决策散在会议与聊天里随人员流动丢失（1:26–1:58）：项目图已经承载 why（决策、取代、带原话的历史）；缺的是动手的 agent 在动某个文件时看不到它们（第二件）。
- 每个组件旁一份知识库：流程图、架构与选型对照、按 git 复原的修改历史、待办、面向 AI 的文字版端到端案例（2:33–2:50）：第一件定哪些放文档、哪些留在图与 git。
- AI 逐层向上找资料，把知识库放在代码旁边（3:07–3:14）：DSH 原生已有一半（§1）；第二件补上另一半。
- 多 agent 改代码时核实知识文档同步更新（5:44–5:58）：第三件。
- 每天下班前定时扫一遍漏 commit、漏 push（6:59–7:08）：第四件。

### 2.2 目标与非目标

目标：动手的 agent 一打开或改某个文件，手边就有这个组件的稳定说明、挂在这条路径上的决策与经验；文档不与图重复、不过期而无人知；每天漏提交、漏推送的改动有人提醒。

非目标：

- 不做向量库或全文检索式的知识库（与 `orch` 2026-11-06 批注一致，记忆与经验都是关键词与路径匹配）。
- harness 不替 agent 写文档内容；harness 只判定、提醒与记账，文字由 LLM 写、人在图上批。
- 不给图节点加新字段（同 M7 §2.1「不加的东西」）；路径与决策的关联只用已有的 `writeScope`、`source` 连线与组件文档里列的决策 id。
- 不改 DSH；不改 GLM 通道包的别名（§1.5）。
- 本节点不给本仓库自己的组件写文档；要不要写是范围的一部分，人定。

### 2.3 依据的学科与标准（评审按这里审）

- 文档即代码（docs-as-code）：文档与代码同仓、同一个改动里改、同一道检查里核；文档放在被描述的代码旁边（就近原则）。第一、三件。
- 架构决策记录（ADR，Nygard 2011）：决策一经记录不改写，用新的决策取代旧的并留链；本项目的决策节点、`supersedes` 连线与历史就是 ADR，组件文档只放指向它们的 id。第一、二件。
- 单一事实源（`docs/CHARTER.md` §10.1）：会变的状态（待办、进度、决策结论）只在图上；组件文档只放稳定的说明。第一件。
- 按需交付上下文（上下文工程，`docs/CHARTER.md` §6「工具与记忆放在模型手边」）：在使用点给相关的那一小份，而不是开局整份灌入；有去重与预算。第二件。
- 失效安全与可观测（`d-failure-plans`）：每处读失败都放行原调用、写明降级、事后可追溯。四件都适用。
- 事件驱动的幂等处理（循环板既有做法）：每次发生一个去重键，处理者按事实幂等。第四件。

## 3. 分工：哪类知识放哪里

| 知识 | 放在哪 | 谁写 | 谁在什么时候读到 |
| --- | --- | --- | --- |
| 目标、决策（选了什么、为什么、被谁取代、验证到哪）、待办与状态、带原话的历史 | 项目图（唯一的状态记录） | 主 Agent、人、harness | 每步投影（`ORCHESTRATION.md` §2.5）；第二件按路径列出相关决策与开着的活 |
| 组件是什么、边界、不变量、约束（含外部约束及出处）、所依据的决策 id | 组件目录的 `AGENTS.md`（索引部分） | 初建：接管之后或模块第一件活；更新：worker 随改动 | DSH 原生（原生文件工具、工作目录之下）；第二件（DSH 没有送达时） |
| 流程图（主流程与特殊分支，Mermaid）、文字版端到端案例（前提、操作、期望，几句话一条） | 同一个 `AGENTS.md` 的「流程」「案例」两节 | 同上 | 同上；审查与写测试时读 |
| 修改历史 | 不存文件：`git log` 加图上任务的 `why` 与提交证据 | — | 提醒里列相关决策；要细节时 agent 跑 `git log -- <目录>` |
| 踩过的坑与解法 | 经验板 `.llm/lessons.jsonl` | worker 交回、根 agent | 第二件按路径（同一条提醒）；失败匹配（§8.6）；M7 简报 |
| 项目级规则 | 根 `AGENTS.md`、规则板 | 人 | DSH 开局基线；规则板 |

判据：会随干活变化的放图，跟代码一起变的稳定说明放组件文档，踩坑放经验板。组件文档里出现待办清单、进度或决策的结论段落，就是放错了地方（第三件的审查一条里提示这一点，§6）。

## 4. 一、组件目录旁放什么

### 4.1 什么算组件

检出根（主检出或某个工作树的根）以下、不含根本身的一个目录里有 `AGENTS.md`，这个目录就是一个组件；一个文件所属的组件是离它最近、含 `AGENTS.md` 的上级目录。组件可以嵌套，最近的那个算数，上一层的组件在提醒里不列。不另设组件登记表，文件在就算。理由：DSH 原生按这个文件名逐层加载（§1）；别的工具也认 `AGENTS.md`；没有登记表就没有登记表与文件不一致的问题；约定只有一个文件，DSH 原生加载子目录 `AGENTS.md` 时，索引、流程与案例一并带上。

### 4.2 一个文件，几节

组件的 `AGENTS.md`，文字用项目自己的语言，建议 6 KB 以内（DSH 一批 64 KiB，第二件在 DSH 没有送达时至多送 2,500 字符正文，所以重要的节排在前面）。节的次序与内容：

1. 开头一段话：这个组件做什么、边界在哪。
2. 「约束与不变量」：每条写为什么与出处（决策 id、外部事实的来源、提交号）。
3. 「决策」（标题写 `Decisions` 或 `决策`，第二件按这个标题认节）：只列图上的决策 id，每行一个（`- <id>`，可跟一句说明），不写结论；结论与状态由第二件按 id 现查。
4. 「验证」：列覆盖它的测试与探针场景名。
5. 「流程」：Mermaid 时序图或流程图，主流程与特殊分支各一张；图上节点用代码里的符号名。
6. 「案例」：每条一个三级标题加三句话（前提、操作、期望），能自动化的写出对应的测试或探针场景名。

不放的：修改历史（git 与图已有，抄一份就会过期）、待办（图上的任务）、决策的结论与理由正文（图上的决策节点）。视频里「缓存从异步改同步」那段往事，在本框架里是一个决策节点（选项、理由、被谁取代），组件 `AGENTS.md` 的「决策」一节列它的 id。没有 `FLOW.md`、`CASES.md` 这类第二个文件：多一个文件就多一份要登记、要送达、要核对的东西。

### 4.3 与项目图不重复

- 文档里只有 id，没有状态：第二件把 id 换成图上此刻的标题、状态与验证（含「被推翻」「被 d-x 取代」），所以决策被推翻时文档不改也不会说错话。
- 待办与进度只在图上：第二件按路径列开着的活。
- id 写错或节点已删：第二件那一行写「not in the graph」，第三件的审查核对时一并看到。

### 4.4 谁生成、谁更新

| 时机 | 做法 | 依赖 |
| --- | --- | --- |
| 已有项目的接管之后 | 接管关上之后，主 Agent 按扫描给出的组件候选（`src/`、`packages/*` 之下的顶层目录与带自己清单文件的目录，至多 12 个）提一批 `kind: docs` 任务，每个组件一件，验收是文件按 §4.2 写成、决策 id 都在图上；人照常批、M7 派。接管的一次同意不因此变大 | 接管设计 0.6 是已放行的设计（`d-freeze-until-dogfood`）：扫描多出组件候选、接管结束的提醒多一句，是对它的请求，记成 `bootstrap` 节点上的批注；接管排在最后（`d-finish-then-bootstrap`）。第三批 |
| 新项目 | 两层循环里一个模块对应一个或几个组件目录；模块放行之后的第一件活的验收里带「按 §4.2 写这个组件的 `AGENTS.md`」，由主 Agent 分解时写进去 | M7 `execute.release` 的提示文字加一句（对已放行设计的请求）。第三批 |
| worker 改代码 | M7 简报的约束栏在写入范围碰到组件时加一行（英文）：`Component doc covering your scope: <C>/AGENTS.md. Keep it true: update it in the same commits when your change alters what it says; otherwise say in the handback field "docs" why it still holds.`；交回与核对见第三件 | M7 合入 main；`src/execute/brief.ts` 在 `BRIEF_LIMIT` 之内，裁剪次序排在经验之前。第三批 |
| 主 Agent 读到组件文档与图不一致 | 不改文档（主 Agent 没有写工具）；提一件 `kind: docs` 的活 | 无 |

模板常量（TS）随第三批进 `src/execute/brief.ts` 旁，用得上的时候再写；本轮格式只写在 `ORCHESTRATION.md` §8.7，不留没人调用的代码。

### 4.5 验证

- L2：`tests/lessons-docs.spec.ts` 的 `componentOf`（各种目录形状：根不算、嵌套取最近、Windows 反斜杠与大小写、工作树里的路径以工作树根为界）与「决策」一节的读法（两种标题、只收 id 形状、重复 id 只算一次、没有这一节）。
- L3：随第二件的场景（§5.8）。
- 本件没有 L4 要做。

## 5. 二、按文件路径送到手边

做法：并进经验行（`glm-hourness/lessons`，`src/lessons/`），不新增行。经验行已有的 `tools/post-execute` 监听器只看失败的调用（`src/lessons/failure.ts`）；本件在同一行里再装一个监听器看成功的文件调用，用同一个来源前缀、同一个按会话去重的做法，把「按路径匹配到的经验」与「该路径所属组件的文档与图上的现状」合成一条提醒。一次调用至多一条：失败的调用只走失败匹配，成功的 `read`、`write`、`edit` 只走本件。

并进来的理由：经验行已经按项目读 `.llm/lessons.jsonl`、已经读图（`src/lessons/import.ts` 经图行的服务找图目录）、已经在 `tools/post-execute` 上装监听器并有会话级去重与行健康，本件要的这几样它全有；另起一行要多出一行的登记、补丁条目、行健康、locale、开关与一份重复的去重逻辑。经验行是出厂启用的行，所以改它会改变桌面版运行时，合入按 `DEVELOPMENT.md` §5 第 4 条走桌面步骤（§11），并按 `norm-review-floor` 评审。

### 5.1 触发与范围

经验行装一个宿主一级的 `tools/post-execute` 监听器（与失败匹配同一做法，`src/lessons/failure.ts`）：

1. 只看成功的调用（`result.isError` 为假）、带 `agent` 与 `session`、不带 `parent` 的调用（`run_code` 的传输层子调用不看）。
2. 工具名换成原生名（经验行已有的 `env.native`，即 `src/shared/dialect.ts` 的 `toNativeTool`），只认 `read`、`write`、`edit`，路径取参数 `file_path`。
3. 相对路径按会话有效的工作目录解析（`workingDirectory.get(session)`，没有这个服务时用会话头的 `cwd`），再找文件所在检出的根（`src/data/project-root.ts` 的 `checkoutRootOf`：不跟 `commondir`，工作树回答它自己的根，所以 worker 看到的是工作树里的组件文档）；不在任何检出里就不管。仓库相对路径用 `src/execute/scope.ts` 的 `repoRelative`（main 上已有）。
4. 找组件 `C`（§4.1），读它的 `AGENTS.md`（至多 64 KiB，超出按读不出处理）。
5. 经验与图按项目找：经验行自己的 `env.dirOf(session)`，图经图行的服务 `glmHournessGraph.dirFor`（`src/graph/service.ts`）；只在文件所在项目等于会话的项目时列经验与图上的行，否则只给组件文档（文件在另一个项目里，不拿本会话项目的经验去配）。

所有 agent 都看：主 Agent、worker、审查者、普通会话，GLM 与非 GLM 路由一样。

### 5.2 送什么

一条提醒，经决策的 `additionalContexts` 紧跟在这次工具结果之后（tools:3599–3627），来源 `glm-hourness-lessons-path`，正文（英文，固定写法；没有内容的行不写，全部没有就不加提醒）：

```
<system-reminder>
Docs and lessons at hand for <path>[ (component <C>)]:
<C>/AGENTS.md:
<正文，至多 2,500 字符；超出写 (truncated; Read <C>/AGENTS.md for the rest)>
Decisions on this path (project graph): <id> "<title>" (<status>[, verified on <sandbox|device>][, superseded by <id>][, overturned]); ...
Open work on this path: <id> "<title>" (<status>); ...
Lessons for this path (advice, not rules): <经验的一行>; ...
Keep the component doc true: if your change alters what <C>/AGENTS.md says, update it in the same commit.
</system-reminder>
```

各行的来路与上限：

| 行 | 来路 | 上限 |
| --- | --- | --- |
| `AGENTS.md` 正文 | 组件文件；只在 DSH 不会送时给（§5.3） | 2,500 字符 |
| 决策 | 组件 `AGENTS.md`「决策」一节的 id，加上图里写入范围覆盖这条路径（`src/execute/scope.ts` 的 `within`，M7 写入门禁用的同一个判定）的任务的 `source` 连线指向的决策；按 id 读图此刻的标题、状态、验证与取代者；废弃的不列 | 5 条 |
| 开着的活 | 写入范围覆盖这条路径（同上）、状态为已批准或进行中的任务 | 3 条 |
| 经验 | 这个会话项目的经验账本，按 `src/lessons/match.ts` 的 `relevant`（M7 简报用的同一个函数；经验的文件模式与这条仓库相对路径、工具名 `read`/`write`/`edit` 对，文件 3 分、工具 1 分，至少 2 分才列），每条用 `render.ts` 的 `briefLine` | 3 条 |
| 最后一句 | 只在 `write`、`edit` 之后，且这个路径有组件 | — |

整条至多 4,000 字符。图读一次缓存 10 秒；经验账本每次读一遍（几十行，不缓存，失败匹配也是每次读）。

数据现状（2026-11-07 读本仓库）：图上 109 件任务没有一件带写入范围，只有 4 个节点有指向决策的 `source` 连线，所以「由任务推出的决策与活」这一路在 M7 用起来之前是空的，眼下决策只能来自组件文档里列的 id；经验板 21 条里 16 条带文件模式，按路径匹配今天就有东西（这也是出厂启用后桌面版上第一个看得到的变化：读到、改到某个有经验的文件时多一条提醒）。

### 5.3 与 DSH 子目录 AGENTS.md 的取舍：按工具名与路径分工，正文只补 DSH 没送的

| 内容 | 谁送 |
| --- | --- |
| 组件 `AGENTS.md` 正文，原生 `read`、`write`、`edit` 且组件目录在会话工作目录之下，且 DSH 那一行在 | DSH（§1.3 第 1 条），本件不送正文、只送其余各行 |
| 组件 `AGENTS.md` 正文，组件目录是工作目录本身或它的上级 | DSH 开局基线已带，本件不送正文 |
| 组件 `AGENTS.md` 正文，GLM 别名调用，或路径在工作目录之外，或 DSH 那一行不在 | 本件 |
| 决策、开着的活、经验、「保持文档为真」一句 | 本件（DSH 没有这些） |

「DSH 会送」四个条件同时成立才算：这次调用的工具名（`exec.name`）是 `read`、`write`、`edit` 三个原生名之一；组件目录在会话工作目录之下（与 DSH 的触发表与范围逐条对应，agent-instructions:1210–1221、609–615）；本会话可见历史里有来源 `agent-instructions` 的基线消息（说明 DSH 那一行在、文件系统服务在；用户在 profile 里关了那一行，或宿主没有 `fs` 时，agent-instructions:1237–1238，就由本件送）；被读写的文件不是组件 `AGENTS.md` 本身（工具结果里已经是它，不带正文）。只读消息的来源字段，不解析 DSH 的正文；DSH 对这次触碰的消息在下一步才出现，本件的提醒在这一步的工具结果之后，所以判定不能等它。判法对两种路由都成立：GLM 路由上别名调用的 `exec.name` 是 `Read`、`Write`、`Edit`，不在原生名里，DSH 不会送，本件送；原生路由上四个条件任何一个不成立，本件送。DSH 一批超过 64 KiB 而丢掉浅层文件的情形不判，接受。

没选的两种：

- 只靠 DSH：GLM 路由上一份都送不到（§1.2 glm 场景），也没有决策、活与经验。
- 组件文档换一个 DSH 不认的文件名、只走本件：放弃宿主与别的工具已有的加载，原生路由上反而多一个机制。

残留的重复：同一会话里既用原生名又用别名触碰同一组件（GLM 路由上原生工具被别名覆盖、不在工具面里，只有按名直接调才会发生）时，正文可能出现两份。GLM 路由的缺口修好之后（§1.5），别名调用的判法同批改（§9 U7）。

### 5.4 去重与预算

- 同一会话里同一组件的正文、同一个决策、活或经验只送一次：可见历史里本来源（以及失败匹配的来源，经验已经由失败匹配说过的不再说）的提醒列过的不再送，加上本进程已经推给这个会话的（经验行的失败匹配与本件共用同一份按会话的记录，`src/lessons/failure.ts` 的 `pushedBy`；调用的结果要到下一步才进历史，只看历史挡不住同一步里的并行调用）。压缩把它们摘掉之后，下一次触碰再送一次。正文按「组件路径加内容摘要」去重：会话里有人改了这份 `AGENTS.md`，下一次触碰这个组件时送新的一份。
- 一步里并行的几个调用碰到同一组件，只有第一个带正文（共用的记录在监听器同步部分写入，先到先得）。
- 「保持文档为真」那一句按会话加组件只送一次（第一次 `write` 或 `edit` 这个组件里的文件时带上）。
- 一条也没有可送的就不加提醒。

### 5.5 派活时同一套

M7 的简报（`src/execute/brief.ts` 的上下文栏，经验那一行之后）用同一个纯函数 `docsFor(paths)`，对写入范围列出组件文档的路径与决策行；超出 `BRIEF_LIMIT` 时先于经验被裁。这是对已放行的 M7 的请求，M7 合入后与第三件同批做（第三批）。

### 5.6 模块

| 构件 | 位置 | 新建或改动 |
| --- | --- | --- |
| 找组件、读组件「决策」一节、由图推出的决策与活、提醒的渲染与上限、去重键（纯函数，不读时钟；读文件的那一下由调用方注入） | `src/lessons/docs.ts` | 新建；导入 `src/execute/scope.ts` 的 `within`、`repoRelative` |
| 监听器、读组件文件、读图、读经验账本、会话去重、行健康 | `src/lessons/path.ts` | 新建 |
| 失败匹配与本件共用按会话的「已推送」记录；失败匹配的「已说过」读法认两个来源 | `src/lessons/failure.ts` | 小改 |
| 行健康的备注键 `path` | `src/lessons/storage.ts` | 小改 |
| 装上与卸下 | `src/lessons/index.ts` | 小改 |

没有新的行、补丁条目、locale、`HOURNESS_ROWS` 项与开关：经验行关了，本件随它一起关。

### 5.7 失败预案与行健康

| 失败 | 发现 | 预案 |
| --- | --- | --- |
| 读组件文件、读图、读经验账本出错 | 经验行健康 degraded 写明哪一样（备注键 `path`），每种告警一次 | 这一部分不送，其余照送；原调用的结果原样不动 |
| 监听器自己抛错 | 同上 | 结果原样返回（与失败匹配同一兜底），写一次告警 |
| 图行、方言服务、工作目录服务不在 | 行健康 info 写明 | 决策与活不列；别名按静态表换算；相对路径按会话头的 `cwd` |
| 组件文档里的 id 不在图里 | 提醒那一行写 `not in the graph` | 第三件的审查看得到 |
| 提醒太长 | — | 按 §5.2 的上限截，截掉的写 `(+N more)` |

本件不拦任何调用、不写任何文件（经验账本的 `hit` 记录只由失败匹配写）、没有规则；关掉经验行只少了提醒，没有只关路径提醒的开关（人要少加东西），出问题的回滚办法是还原提交或关掉经验行（后者连 `lessons_query`、失败匹配与简报里的经验一起失去）。事后追溯：提醒是会话日志里的一条消息，带来源与列出的 id。

已知缺口（接受，写进行说明）：项目根与用户级都没有 `AGENTS.md` 时 DSH 不生成基线消息（agent-instructions:1281，没有内容就不出），而子目录照样加载，此时「基线在」判成假，组件正文会重复送一次（按会话加组件只一次，几 KB），探针工作区因此放一份根 `AGENTS.md`；`within` 区分大小写、`repoRelative` 保留调用里的写法，Windows 上写成大小写不同的路径时决策与活静默地不出现（经验匹配的文件模式不受影响，按忽略大小写比）；可见历史读不出时按「DSH 没送」处理并写一次告警；带 `parent` 的子调用（`run_code` 里读写文件）本件不看，DSH 照送正文（它把子调用的触碰算给父调用，agent-instructions:1435–1441），决策、活与经验这几行拿不到；文件所在检出属于另一个项目时只给组件文档（§5.1 第 5 条）。

### 5.8 验证

- 旧场景：`glm-lessons`、`non-glm-lessons`、`glm-lessons-failure`、`non-glm-lessons-failure` 四个探针场景读写带文件模式的路径，新提醒会进它们的请求，合入前全部重跑，必要时让它们的工作区避开带文件模式的路径。
- L2 `tests/lessons-docs.spec.ts`（纯函数：组件的认法、「决策」一节、决策的四种状态与取代链、写入范围推出的决策与活、渲染逐字比、上限与 `(+N more)`、去重键）、`tests/lessons-path.spec.ts`（经验行的假宿主，工具管线已有 `tools/post-execute`）：原生名与别名各一例；组件在工作目录之下、之外、上级三种位置的正文取舍；可见历史里没有 DSH 基线时本件送正文；读的就是 `AGENTS.md` 本身不带正文；经验与组件文档合在一条提醒里；失败的调用只有失败匹配的提醒；去重（可见历史与本进程两路，含失败匹配说过的经验）；并行调用只带一次正文；失败的各条预案；子调用（带 `parent`）不看；经验行未启用时什么都不做；原有 `tests/lessons-failure.spec.ts` 不改一条断言。
- L3 探针两个场景，加在 `scripts/probe/run-probe.mjs`：`glm-lessons-path`（GLM 别名）与 `non-glm-lessons-path`（原生名）。工作区带一个组件（`AGENTS.md` 列一个决策 id）、一张种好的图（该决策、一件写入范围覆盖组件的进行中任务）、一条带文件模式的经验；脚本依次读组件里的文件、再读一次、写一个文件。核对：GLM 场景第一次读之后的请求里本来源的提醒一条，带 `AGENTS.md` 正文、决策行、活行、经验行，第二次读之后没有新的，写之后多「保持文档为真」一句；非 GLM 场景本来源的提醒不带正文，DSH 的「Additional instructions」恰好一条（正文只出现一次）；两场景都没有 DSH 之外的第二份正文。
- L4：随下一个桌面批次，在人的桌面版上开一个临时会话读本仓库有经验的文件，再读一个临时项目里的组件文件。经验行出厂启用，合入前先过 `DEVELOPMENT.md` §5 第 4 条（§11）。

## 6. 三、同步核对

第三批，等 M7 合入 main；本轮不实现。0.3 取代 0.2 的两种做法（审查记一条，或交回门禁加规则）：人要融合进现有流程、不加新东西，所以不加规则板的规则、不加 `tools/pre-execute` 上的门禁、不拒绝交回，只并进已有的交回结构与审查清单。

### 6.1 判定

纯函数 `docsGaps(change, componentAt)`（`src/lessons/docs.ts`，与第二件共用 `componentOf`）：`change` 是这次交回的改动清单（M7 交回处理已经读出，`src/execute/handback.ts` 的 `changeOf`，`git diff --no-renames --name-status`），`componentAt(path)` 按交回的那个提交找组件。对每个改动的文件 `F`（新增、修改、删除都算，组件自己的 `AGENTS.md` 除外）取它的组件 `C`；`C` 的 `AGENTS.md` 这一批没改，`C` 就是一个缺口。没有组件文档的项目没有缺口，第三件对它什么都不做。

### 6.2 做法

1. 交回结构（`hourness-handback-v1`）加一个可选字段 `docs`：一行文字（至多 300 字符），写「updated: <组件>」或「still true: <为什么仍成立>」。可选字段在 rc.3 `assertObjectJsonSchema` 的子集里，旧交回照常收下。
2. 交回处理算出缺口之后：有缺口而 `docs` 没写（或没提到这个组件），往交回摘要批注里写一句 `Docs: <C> changed code but its AGENTS.md was not touched and the handback says nothing about it.`；写了就把那一行原样记进批注。算不出缺口（git 失败或超时、按提交读不出组件）时批注写「文档缺口没算成：<原因>」，行健康 degraded。任何一种都不拒绝交回、不挡任何事。
3. 审查任务的简报带上批注里的这一句或 worker 写的那一行；审查清单（`src/execute/brief.ts` 里已有的那几条检查）加一条，英文：`Component docs: if the handback names a component whose AGENTS.md was not updated, check that "still true" holds; a doc that carries a to-do list, progress or decision conclusions is misplaced. A stale doc is a non-blocking finding unless an acceptance item covers docs.`
4. worker 简报的约束栏已有一句（§4.4）。

### 6.3 与 0.2 的取舍

| | 0.2 乙（门禁） | 0.3（交回一行加审查一条） |
| --- | --- | --- |
| 漏表态时 | 拒绝一次交回，worker 多一步请求 | 批注里留一句，审查看到 |
| 新东西 | 规则板一条代码规则、`tools/pre-execute` 判定、违规流水 | 一个可选字段、一句批注、一条审查清单 |
| 保证的强度 | 执行边界保证「有表态」（宪章 §3.2 第 3 条） | 靠批注与审查发现「没表态」，不保证；审查深浅为「不审」的活只看得到批注 |
| 依赖 | `structured_output` 被拒后可再交一次（原 U4） | 无 |

人定了融合优先，这一条的强度差是接受下来的代价；若日后审查数据显示漏表态常见，再提规则（经规则板的提议流程，不在本稿内）。

### 6.4 落点与验证

落点（M7 合入之后）：`src/lessons/docs.ts`（`docsGaps`）、`src/execute/schemas.ts`（`docs` 字段）、`src/execute/handback.ts`（`changeOf` 之后算缺口、写批注）、`src/execute/brief.ts`（worker 简报一句、审查简报与清单一条）。

- L2 `tests/lessons-docs.spec.ts` 的缺口判定（新增、修改、删除、只改文档、嵌套组件、没有组件文档的项目、改名按删加）；`tests/execute-*.spec.ts`：批注里的缺口句与 `docs` 行、审查简报里那一条逐字比、没有缺口时三处都没有、算不出缺口时的批注。
- L3：M7 执行探针加一个场景 `glm-exec-docs`：worker 改了组件里的代码不改文档，核对交回摘要批注带缺口句、审查简报里有那一条；带 `docs` 一行时批注记下它。
- L4：随 M7 的批次。

## 7. 四、每日漏提交、漏推送提醒

0.3 取代 0.2 的「循环行自己推出事件、自己扫 git」：0.2 要新增一个事件、一项 `state.json` 状态、一段拍外异步扫描与一种指标记录。人要少加东西。先看了能不能并进已有的默认条目或事件：现有四项里，`loops.deps-after-merge` 听主干前进的事件，`loops.remind-waiting` 听「有事等人」，`loops.peak-start`、`loops.peak-end` 管 GLM 高峰，没有一项是「每天到点看一眼」；M7 的 `operate.patrol`（02:30 夜间巡检，M7 设计 §3.11.2）管主干与派活的完整性，在 M7 合入前不在 main 上，时间与范围也不同（§7.3）。所以加一项默认条目，但用循环板已有的时间触发（`daily`，与 M7 的 `operate.morning` 同一形状，经 DSH 的定时提醒到点叫醒主 Agent），不新增事件、不新增代码。

### 7.1 条目

`src/loops/defaults.ts` 加一项默认条目（默认条目只能看、不能改、不能停，`d-defaults-readonly`；要停只能在插件管理器里关循环行）：

- `id: 'loops.unsynced-daily'`，标题「每天下班前：查有没有没提交、没推送的改动」，`why`「改完没提交、提交了没推送的东西容易被忘，这一项每天傍晚叫主 Agent 查一遍，有东西才告诉你」。
- `when: { kind: 'daily', time: '18:05' }`（宿主时区；18:05 在 GLM 高峰 14:00–18:00 之后，叫醒主 Agent 的那一次请求不落在高峰里）。
- `action: { kind: 'tell-main', wake: true, text }`，文字（英文，不含占位符）：`End-of-day check: look in this project for work that is not committed or not pushed. Read only: run git worktree list; in the main checkout and each listed worktree run git status --short (the task worktrees under .worktrees/hz-* belong to running dispatches, list them as such and do not count them); run git branch -vv for branches ahead of their upstream and for branches with no upstream whose commits are on no remote; run git stash list. If everything is committed and pushed, end your turn without telling the human anything. Otherwise tell the human in one short list what is left and whether it looks finished. Do not commit or push because of this reminder; the human decides. If this project is not a git repository, end your turn.`
- 没有 `limits`、没有 `quiet`（时间条目不允许 `quiet`，`src/loops/model.ts` `checkQuiet`）。

只汇报不动手：18:05 人可能不在，`hz-*` 工作树里可能是在跑的派发，M7 的主干前进核对还没合入，提交与推送留给主 Agent 平常的规范路径（`d-main-agent-shell`、`norm-merge-gate` 的 `push` 行）。人想换时间，可以自己加一条同形状的时间条目（默认那条仍在）。

与 0.2 的取舍：0.2 的数由系统自己用 `git status` 查出，干净的那天不叫醒任何人；0.3 的数由主 Agent 自己跑 git 查，每个有循环板的项目每天多一个短回合（干净时一句话都不说，回合内容是几条只读命令）。人要的是不加东西，这点代价接受；若主 Agent 的汇报不可靠，再回到 0.2 的系统扫描（0.2 的设计在 git 历史里）。

### 7.2 失败预案

| 失败 | 发现 | 预案 |
| --- | --- | --- |
| 主 Agent 不在（没有持有者）、会话归档或在另一个窗口 | 循环板既有的 `holderState` 与 `loop-holder` 记录 | 消息按循环板既有规则存着、之后交（`ORCHESTRATION.md` §18.10） |
| DSH 定时提醒没建成或被人删了 | 循环板既有的 `loop-drift` 记录与对账（`ORCHESTRATION.md` §18.9） | 对账补建 |
| 主 Agent 跑 git 出错或汇报不实 | 回合内容在会话日志里 | 人看得到；见上一节的取舍 |

### 7.3 与 M7 夜间巡检的分工

M7 的 `operate.patrol`（02:30）列「规范有 `push` 而主干领先上游」与不干净的 `hz-*` 工作树，管主干与派活的完整性；本条目管每天收工时所有工作树与分支的卫生，时间与范围都不同。主干领先上游会在两处各出现一次，接受；M7 的运维行落地时若要合并，由那一步定。

### 7.4 验证

- L2：`tests/loops-registry.spec.ts` 的默认条目数与状态表（4 改 5，新条目在没有任何宿主行贡献时就是生效的，它不听事件）、`tests/loops-bind.spec.ts` 里这条默认条目经对账得到一个 `daily` 选择器（`08:30` 的现有用例同形状）、文字逐字比并且不含占位符。
- L3：不覆盖。探针的 `LOOP_ENTRY_IDS` 来自通道包的 `GLM_LOOP_DEFAULTS`，不是本行的默认条目，headless 模板也没有定时服务；到点叫醒主 Agent 只在 L4 验。
- L4：随下一个桌面批次（到点投递叫醒空闲的主 Agent，§9 U5）。

## 8. 宿主接口与 rc.3 依据

| 接口 | 用在 | rc.3 依据 | 状态 |
| --- | --- | --- | --- |
| `tools/post-execute`（waterfall，`(exec, result, next)`，`accept` 可带 `additionalContexts`，结果自带的在前、决策的在后） | 第二件（经验行的第二个监听器） | tools:3599–3627；先例 repeat-tool-reminder:2247–2260；本仓库经验行的失败匹配已在用（`DESIGN.md` §2.4a） | 〔实读〕；失败结果上的提醒位置已实测（经验板探针 U2）；成功结果上的位置〔推断〕，§9 U3 |
| `exec` 的 `name`、`arguments`、`agent`、`parent` | 第二件 | tools:3229–3260 | 〔实读〕，guard 与经验行已在用 |
| `workingDirectory.get(session)` | 第二件（相对路径） | working-directory:76–78 | 〔实读〕，guard 已在用 |
| 会话的可见历史 `session.deriveMessages()` | 第二件（去重、DSH 基线判定） | session:1672–1686 | 〔实读〕，经验行与记忆行已在用 |
| 会话头 `cwd`、`origin` | 第二件 | session:1051–1053、1820–1826 | 〔实读〕 |
| `dsh-agent-instructions` 的触发表、范围与时机 | 第二件的并存规则（§5.3） | agent-instructions:1210–1221、609–615、646–676、1384–1445 | 〔实读〕〔实测〕（§1） |
| `outputSchema` 启动前按对象 schema 子集校验；可选字段 | 第三件的 `docs` 字段 | subagent:3046；子集见 M7 设计 §3.6.1 | 〔实读〕 |
| 循环板的时间条目：默认条目经对账建成 DSH 的定时提醒，到点投递给主 Agent | 第四件 | 没有新的宿主接口：`schedule` 服务与投递沿用 §18.10 已有的 `steer`、`followup`、`inject` 与 `sessionController.resolveAgent`（agent-loop:790–821，api-session-controller:2951–2952、3037–3039） | 〔实读〕；从本包的行里调用的效果有一部分未核实（`DESIGN.md` §2.4a 的 V1、V3），§9 U5 |

本稿没有用到 `tools/result`（只观察的事件，DSH 自己的行用它）：第二件需要把提醒放进这次的结果，`tools/post-execute` 才能做到。没有用 `tools/pre-execute` 的 `deny`、`structured_output` 的拒绝与再交（0.2 的第三件门禁已取消）。

## 9. 未核实清单

| 编号 | 假设 | 怎样核 | 何时 |
| --- | --- | --- | --- |
| U1 | 子目录的 DSH 指令被压缩摘掉之后，不触碰就不会补回（§1.3 第 5 条） | 探针加一步：低压缩阈值，触碰一次、压缩、不触碰再走两步 | 第二件的 L3 顺带 |
| U2 | M7 的 worker 在工作树里时，DSH 以工作树根为项目根（§1.3 第 6 条） | 执行探针里 worker 的第一次请求带工作树根 `AGENTS.md` 的标记 | 第三件的 L3 顺带 |
| U3 | 成功结果上的 `additionalContexts` 在下一次请求里紧跟这次工具结果（经验行只实测过失败的结果） | 第二件的 L3 | 第二件 |
| U5 | 循环行的默认时间条目在桌面版上按时叫醒空闲的主 Agent | 桌面批次 | 第四件的 L4 |
| U7 | GLM 路由的缺口修好之后，第二件「DSH 会送」的判法仍然对 | 改别名的那一批里重跑 `glm-lessons-path` | 那一批 |
| U8 | 已加载的子目录文件被外部改动或删除时，不触碰也在下一次请求出替换或移除（§1.3 第 3 条，评审 N1） | headless 补测：原生路由读一个子目录文件使它加载，再用 shell 改它、删另一个已加载的，之后两步只跑不碰文件的命令；脚本已写好（`%TEMP%\docs-at-hand-probe\probe-external.mjs`，不进仓库），等一把探针锁空出来 | 第二件的 L3 之前；结果改 §1.3 与 §1.4 的标注 |

0.2 的 U4（`structured_output` 被拒后再交）与 U6（超长路径仓库上 `git status` 输出可解析）随取消的做法一起删除。

## 10. 失败与不可逆

本稿四件都不删数据、不动用户 profile、不做对外的动作：第二件只追加提醒；第三件只往批注里写一句与审查多一条；第四件只叫主 Agent 读 git，不提交不推送，提交与推送仍是主 Agent 按规范做（`d-main-agent-shell`）。每件的失败与预案见 §5.7、§6.2、§7.2；共同的一条：读失败不挡原来的事，写明降级，留下能追的记录。

## 11. 实施顺序与工作量

| 步 | 内容 | 依赖 | 工作量（agent，含 L2、L3 与一轮评审） |
| --- | --- | --- | --- |
| 1 | 第四件：默认条目一项、L2 | 无（循环行在 main 上） | 约 0.2 天 |
| 2 | 第二件加第一件的格式部分：经验行的第二个监听器、`docs.ts`、`path.ts`、L2、L3 两场景、`ORCHESTRATION.md` 与 `FACTS.md` 同批；合入按 `DEVELOPMENT.md` §5 第 4 条走桌面步骤（经验行出厂启用，改它改变桌面版运行时：CDP 关桌面版、持 `.llm/desktop-lock`、合入并在主检出 build、再启动；见到 `#32770` 确认框就停下，桌面步骤留给人）；按 `norm-review-floor` 评审 | 无（经验行、图行在 main 上） | 约 1.5–2 天 |
| 3 | 第一件的生成部分加第三件：M7 简报两句、交回 `docs` 字段与批注、审查一条、L2、L3 | M7 合入 main | 约 1 天 |
| 4 | 对接管与 M7 放行设计的请求记成批注（扫描的组件候选、接管结束的提醒一句、`execute.release` 一句） | 第 3 步同批 | 0.5 小时 |

批次 L4 在第 2、3 步合入之后一起做。是否给本仓库自己的组件写文档不在上表，人另定（每个组件一件 `kind: docs` 活，约 0.5–1 小时 worker 时间）。

## 12. 定稿后归档到哪

- 第一、二件：`docs/ORCHESTRATION.md` §8.6 经验板里加一段「按路径送到手边」（经验行第二个监听器、与 DSH 的分工），新增 §8.7「组件 AGENTS.md 的格式」（§4.2）；`docs/DESIGN.md` §2.4a 接口对照表里 `tools/post-execute` 一行的使用者加经验行的路径提醒。
- 第三件：`docs/ORCHESTRATION.md` §17（执行层）里交回与审查的那一节（M7 合入时写），引 §8.7。
- 第四件：`docs/ORCHESTRATION.md` §18.5 默认条目表加一项。
- 实测的事实：`docs/FACTS.md` §3（§1.4 的文字）。
- §1.5 的发现：由 `glm-house` 下的节点定，到时进 `docs/DESIGN.md` §5.4 或 §5.8。
- 本仓库若日后给自己的组件写文档：那一批同批改 `docs/CHARTER.md` §11 文档地图与 `AGENTS.md` 的「文档」一节，写明组件文档的位置，以及组件 `AGENTS.md` 的「约束与不变量」与 `DESIGN.md`、`ORCHESTRATION.md` 的分工（组件文档只写稳定的、与代码同变的局部说明并指回这两份文档的节，不复述），免得出现孤儿文档或两处事实源（宪章 §10 第 1、4 条）。

## 13. 人的话与替人定的

人 2026-11-07 看过设计讲解后说：「你自己把握好这个度吧反正，尽量融合进我们的流程内而不是加越来越多的东西」。此前（睡前）说「尽量你自己拿决定别卡任务」，并定「按设计稿推荐的范围全部直接开工」。编排方据此收敛（可推翻），0.3 照办：

1. 不新增插件行；按路径送到手边并进经验行，一个会话里一条提醒；组件文档正文只在 DSH 没有送达时补送。
2. 文档格式不加新文件，流程与案例是组件 `AGENTS.md` 里的两节。
3. 每日提醒留在循环板，并成一项默认的时间条目，不新增事件与扫描代码（§7 开头写了为什么没有可并的）。
4. 第三件不在规则板加规则，并进交回结构的一行与审查清单的一条；取代一页稿岔路 2，不再问人。

原来待人定的三件：范围取 A（四件都做，先后第 4 → 2 → 3）；岔路 2 由第 4 条取代；岔路 3 取循环板自带的 18:05（甲），做法按第 3 条改为时间条目。

替人定、可推翻的：组件的认法（含 `AGENTS.md` 的目录）与「决策」节的标题；提醒的各项上限（正文 2,500、整条 4,000 字符，决策 5、活 3、经验 3）；18:05 与范围（主检出加每个工作树、分支）；`docs` 字段至多 300 字符；第三件只提示不拒绝。

## 14. 评审记录


第 1 轮（对 0.1，独立评审子 agent，记录在同目录 `review.md`）：APPROVED，挡路 0 条，不挡路 10 条。没有挡路项，按 `docs/DEVELOPMENT.md` §1.1 不需要第 2 轮；10 条在 0.2 里的去向：

| 条 | 去向 |
| --- | --- |
| N1 外部改动要等触碰的说法与代码不符 | 改：§1.1 加一行，§1.3 第 3 条与 §1.4 拟进事实账的文字按代码重写，标〔实读〕；补测脚本写好了，两把探针锁当时都被占着没有跑，列进 §9 U8 |
| N2 每日提醒的文字让主 Agent 可以提交推送，与一页稿不符 | 改：条目只汇报，文字写明不因这条提醒提交或推送（§7.1）；一页稿第 4 件同步 |
| N3 `git status` 会取 `index.lock` | 改：`--no-optional-locks`（§7.2） |
| N4 扫描在拍里会拖住运行锁；失败记在哪不对 | 改：扫描在拍外异步跑；失败记行健康与指标事件，不写 `loop-done`（§7.1、§7.4） |
| N5 门禁算不出缺口时怎么办、按什么算、（甲）没有验证 | 改：算不出放行并批注；按工作树的 git 算，不取自报；§6.4 补（甲）的 L2、L3 |
| N6 `find.ts` 说不导入 Node 内置模块，却导入 `scope.ts` | 改：删掉那句（§5.6） |
| N7 「DSH 会送」的判定没看 DSH 那一行在不在；子调用；读的就是 `AGENTS.md` 本身 | 改：加「可见历史里有 DSH 基线」一条，读 `AGENTS.md` 本身不带正文；子调用写成已知缺口（§5.3、§5.7） |
| N8 经验按会话的项目找，与「按项目找」的说法不一致 | 改：只在文件的项目等于会话的项目时列经验（§5.7 已知缺口） |
| N9 一页稿第 1 问 B 的字面范围不对 | 改：B 写成「第 2、4 件连同第 1 件的文档格式」 |
| N10 本仓库采用组件文档时要改宪章 §11 与 `AGENTS.md` | 改：§12 加一条 |

（N2–N4 针对的 0.2 做法在 0.3 取消。）

第 2 轮（对 0.3，只审改动处，独立评审子 agent，2026-11-07）：APPROVED，挡路 0 条，不挡路 12 条。逐条去向：N1 基线消息在没有根与用户级 AGENTS.md 时不生成，已写进 §5.7 已知缺口，探针工作区放根 AGENTS.md；N2 「保持文档为真」按会话加组件只送一次（§5.4）；N3 四个旧经验探针场景合入前重跑（§5.8）；N4 账本每次读、不缓存（§5.2）；N5 大小写缺口写进 §5.7；N6 §7.4 L3 改为不覆盖；N7 条目文字加非 git 目录结束回合一句；N8 §7.1 写明每个项目各一份；N9 §5.7 写回滚办法；N10 可见历史读不出按「DSH 没送」处理并告警（§5.7）；N11 旁证，不改；N12 本条。
