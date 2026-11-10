# 设计：策略修订重验证在跑的活（reval）

版本：0.1（2026-11-10），第一稿。机制 1（super-agent borrow，人 2026-11-10 批准）的设计草案：政策（worker 的活所依赖的规则面）修订时，按旧版派出去的在跑活被对照新版重验，而不是默默按旧规则跑完。本稿只定形状与问答，不开工；实现归 M7 执行行的后继批次。

依据：main `cc317412`（reval 分支同基）。原型仓库 `deepseek-ai/dsh-superagent-prototype`（2026-11-10 经代理克隆，HEAD 即当日默认分支），实读 `src/policy.ts`、`src/core/engine.ts`、`src/core/tickets.ts`、`src/core/evals.ts`、`src/app/settings.ts`、`docs/001-domain.md`、`docs/002-authorization.md`、`docs/007-architecture.md`；上一份阅读摘要 `.agents/tasks/reading-2026-11-10/digest.md` §2.1 第 3 篇、§4 第 4 条、§5 C2 是本稿的出发点。本项目 substrate 全部实读，引用见正文 `file:line`。〔实读〕读过源码；〔推断〕由源码推出、没有运行；〔未核实〕列进 §10。

范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/`、`~/.dsh`，不用桌面版。要记到图上的事写成同目录的 JSON 草稿，本稿 §9 只列条目。

干净区：本文件不写人设与语气词。符号原样；给模型看的文字用英文。

## 0. 摘要

原型（dsh-superagent-prototype）的政策版本化是三件事：政策面（规则、准入模式、各 Source 的政策部）哈希成一个 `policyVersion`，每个工单的 Mandate 记录它接受时的版本；设置保存时版本变了就逐工单算影响（`policyEffects`），受影响的在跑工单收到一条 `policy-changed` 输入、在跑的评估按新版重启，不受影响的不通知；复验只在三个时点（接受、恢复、开跑）做，不过才撤销授权，版本变化本身不撤销（§1）。

我们的底座已经有一半同构的东西：pins 把任务的意图链钉在派发批注里，交回时对不新鲜就进不了主干（§2.2）；合入前检查的记录带 `normDigest`，清单变了旧记录不算数（§2.3）。缺的是政策面：`norm-merge-gate`、`norm-review-floor`、规则板、checker 配置这些「评判用的规则」不在任何 pins 里——worker 的活写完之后，政策改了没有任何机制让审查者知道、按新版重判（§3 的核心缺口）。

本稿的改法是 pins 的同构扩展，不加新机制（§4、§5）：

1. **政策摘要**：`policy <id>@<digest> …` 一行，与 pins 行同形状，四类各一个 12 位摘要——`gate`（norm-merge-gate 的解析条目，复用 `normDigest`）、`floor`（norm-review-floor 的解析条目加 unparsed）、`rules`（规则板的导出文件内容）、`checker`（图上 env 工具节点的 config acceptance 行）。派发时算好写进派发批注与 Attempt 寄存器。
2. **触发**：交回时（§3.6.2 step 6 的旁边）重算对比；有差就往交回批注加一行政策差、交一条通知（informational，不动 done 流程）。任务**不自动杀**——与原型「版本变化不立即撤销在跑 Mandate」一致。
3. **重判**：审查派发时，审查简报按被审任务最新交回批注里的政策差加一节「政策自派发后变了」，审查者按新政策重判既有工作；挡路判据不变（新政策造成的发现照样要挂在 acceptance:<i> 或既有三类上才挡路）。审查已经存在，这近乎免费（§5.3）。
4. **检查面**：`normDigest` 的既有失效机制照旧，不加东西。

## 1. 原型的机制〔实读〕

### 1.1 政策版本是什么

`policyVersion(settings)`（`src/policy.ts:116-118`）＝ `key(POLICY_REVISION, JSON.stringify({rules, mode, sources}))`：评估规则数组、accept 模式、每个 Source 的政策部（allowed 名单、admission 表、bots），进一个哈希。`POLICY_REVISION = 'mandate-v3'`（`src/policy.ts:111`）是语义版本常数——复验语义本身变了才升。注释明说（`src/policy.ts:112-114`）：模型、并发、暂停状态、轮询间隔的变化**不**使既有决定失效。这就是「什么算政策」的答案原型：算政策的 = 授权与评判所依赖的、且会改变在跑工作该怎样被评判的东西；不算的 = 运行参数。

### 1.2 版本记在哪、变化时发生什么

每个 Mandate 记录接受时的版本（`docs/001-domain.md:34`：Mandate 携带 Policy version、scope、strength、matched rules；`docs/002-authorization.md`「Policy version」节：Every Mandate records the version under which it was accepted）。

设置保存（`src/app/settings.ts:183-185`）：算 before/after 两个版本，`policyChanged: before !== after` 连同通知名单存进设置历史（`src/app/store.ts:24` 的 SettingsVersion 记录），不等就调 `engine.policyChanged(before, after, effects)`。

`Engine.policyChanged`（`src/core/engine.ts:255-256`）原子地做两件：

- `tickets.policyChanged(from, to, effects)`（`src/core/tickets.ts:200-208`）：按接受顺序遍历所有开着的工单，`effects` 里有它的条目就投一条输入 `{kind: 'policy-changed', from, to, at, effect}`。键里带 `at`，同一对版本间的反复变化也各记一条（`tickets.ts:205` 的注释）。
- `evals.policyChanged(from, to)`（`src/core/evals.ts`）：每个在评估中的 thread 按新政策重评（reassess，理由码 `policyChanged`），并 emit `policy.changed` 事件（`docs/007-architecture.md:107` 的事件名单里有它）。

### 1.3 影响怎么算、通知里说什么

`policyEffects(tickets, old, now, scope)`（`src/policy.ts:144-165`）逐工单返回三类效果：工单依据的规则被禁用（`{id, name, change: 'disabled'}`）或文字变了（`{id, name, change: 'changed', instruction: 新文字}`）；请求者在新设置下不再能发起这项工作（`requesterAllowed: false`）；主动模式不再接受（`proactive: false`，auto 模式关掉时）。`docs/002-authorization.md:111-120`：policy-changed 输入向工单解释的是这三件事，**不受影响的工单收不到任何通知**，且「The change does not immediately revoke live Tickets' Mandates」——版本变化本身不动在跑的授权。

### 1.4 复验在什么时候做、不过会怎样

三处调 `revalidate(mandate)`：接受时（门内，`settingsPolicy` 构造的 Policy 自身）；恢复前（`src/core/tickets.ts:113`：非在跑工单 `revalidate` 不过抛 `mandateRevoked`）；开跑时（`tickets.ts:257`：不过则 refuse）。`docs/002-authorization.md`：「Only three operations change a Mandate: accept creates it, a person's stop withdraws it, and failed revalidation revokes it.」另有跨重启的兜底：评估收尾时发现 `policy().version !== evaluation.policyVersion` 就按 policyChanged 重排（`evals.ts` 的 requeue 分支）。

对本稿的三条可搬结论：政策版本 = 影响评判的面哈希，运行参数排除；在跑的活不因版本变化被杀，被杀只因为复验不过；变化的通知按影响投递、带新文字，不投给无关工单。

## 2. 我们的底座有什么〔实读〕

### 2.1 图修订与 pins

- `graphRevision`（`src/graph/store.ts:20-22`）：每个节点文件一行 `<id> <revision>` 按序哈希。简报页脚带它（`src/execute/brief.ts:509`：`brief <digest> · graph <revision>`），但它只随简报落盘、没有机制回头比对；且任何一次图写（别处一条批注）都动它——太粗，这正是 pins 存在的理由。
- pins（`src/graph/pins.ts`）：`pinsOf`（:85-93）＝ 任务 + 祖先链（至 goal）+ source 边指向的节点，每个 12 位语义摘要；字段按类型（:59-74）：task 是 acceptance/nonGoals/kind/gone，decision 是 overturned/status，question 是 decision/conclusion/status，其余（goal、feature、**norm 落进 default 分支**）是 acceptance/nonGoals/gone。标题、正文、slope、历史、writeScope 明确排除（:17-21）。读不出模块结构时按变了算（fail closed，:19-21）。
- 派发批注末行是 pins 行（`src/execute/attempts.ts:167-178` renderDispatchComment）；`Attempt` 寄存器带 `pins`（`attempts.ts:53`）。

### 2.2 交回与审查派发的 stale 路径

- 交回（`src/execute/handback.ts:356-357`）：`staleness(graph, attempt.pins, sha256Hex)` 在 lessons 之后、done 流程之前算；不为空则通知 `stale`，交回批注记在任务上，**工作进不了主干**，要重新派发（:444-449）。设计审查交回同（:823-826）。
- 审查派发门禁（`src/execute/attempts.ts:434-442` reviewTargetOf + `src/execute/brief.ts:348-350`）：被审任务的交回 pins 不新鲜 → `nothing_to_review` 拒派审查。
- staleness 的语义（`pins.ts:120-134`）：逐 pin 比摘要，节点没了算 missing，pins 行读不出算整行 missing——绝不把读不懂当新鲜。

### 2.3 政策面已有的机制

- `normDigest`（`src/execute/gate-norm.ts:123-130`）：norm-merge-gate 的**解析条目**（命令、push、only，prose 不算）的 12 位摘要。检查记录带它（`src/execute/check.ts:149-165`），trunk advance facts 带它（`src/execute/advance.ts:1013-1014`）：清单变了，旧记录不算数（advance.ts:1014 的 filter、check.ts:881）。这是「政策变了旧证据失效」的既有样板，但只覆盖检查记录，不覆盖在跑的 worker 与审查。
- norm-review-floor（`src/execute/floor.ts` 头注）：每条 acceptance 一类，判法是行内反引号段；判不了的行算 unparsed，整单从严全审。派发（`dispatch.ts:515-528` floor_unparsed/floor_requires_full）与交回（`handback.ts:366-389` floorHits）都**现读现判**——floor 改了之后确实按新 floor 判，但没有机制告诉任何人 floor 变了、让审查者带着新 floor 重看旧工作。
- 规则板（`src/rules/store.ts`）：append-only journal 是事实源（头注），`stateDigest`（:86-89）是整个 ProjectState 的 16 位摘要——含 rules、signals、detectors、scripts、proposals、tickets、notices、unresolved 与 peakMode（`src/rules/model.ts:203-226`）。人定的规则导出到 `docs/rules/rules.json`（`DEFAULT_RULES_DIR = 'docs/rules'`，store.ts:27-28），`state.repo.digest` 记上次导出的内容摘要，仓库里被人直接改走 diff 能认出（`src/rules/repo.ts:90-92`）。注意：`stateDigest` 全量哈希会把 tickets/notices 这类易变集合算进去，当政策摘要用会漂得没有意义——政策摘要要切窄（§4.2）。
- m4 两类（`src/guard/checker-config.ts`、`src/guard/suppression.ts`）：checker 配置与基线文件的写入被拒（BUILTIN 表 :21-28 + 图上 env 工具节点的 config acceptance 行 :54-66），新压制标记要理由加节点。它们定义了「政策的改动从哪来」：worker 改不了，只有人与申请通道能——所以政策漂移的来源是人的编辑，频率低、事后可考。
- git 快照（`src/guard/git-snapshot.ts`）：`refs/hourness/snapshots/<id>` 存危险 git 命令前的现场。派发的 `baseSha`（`attempts.ts:38`）钉住 worker 出发点的树；worker 改不了 checker 基线（m4 G3），基线若变必是主干上的提交——`git log baseSha..` 可考。
- 行的 revision 键缓存（`src/execute/dispatch.ts:73-89` createGraphCache，`src/execute/index.ts:57-58`）：读按 revision 复用，政策摘要在派发与交回各算一次即可，不值得缓存。

### 2.4 缺口

worker 的活所依赖的评判规则面（合入前的检查清单、全审底线、规则板的禁令、checker 配置）不在 pins 的任何一环里。一个任务派发时 source 只连它遵循的决策；norm 节点即便被连上也只算 default 分支的 acceptance。于是：政策改了 → 在跑 worker 交回 → pins 全新 → 审查照旧派出 → 审查简报里 `gateCommands` 是派发那一刻渲染的（`brief.ts:620`），审查者对政策一无所知。阅读摘要 §5 C2 记过同型缺口（writeScope 与审批并集的先后），本稿补的是政策这一类；摘要 §4 第 4 条「策略/范围变更影响在跑的活」的机制选择就在这里落地。

## 3. 政策摘要（policy digest）的定义

### 3.1 形状

与 pins 行同形状、同 canonical 化：

```
policy: gate@<12> floor@<12> rules@<12> checker@<12>
```

- 每类 = 12 位 SHA-256 前缀（`digest12`，`src/execute/digest.ts`），canonical JSON（与 `pins.ts:77` 的 `JSON.stringify(semanticFields(...))`、`rules/store.ts:79-80` 的 canonicalJson 同一纪律：字段固定序、空集合省略）。
- 类缺失（norm 节点不在图上、规则板读不出、env 节点读不出）按变了算，与 pins 的 releaseAt 读不出同一条 fail-closed 纪律（`pins.ts:19-21`）。
- 派发批注在 pins 行之后加这行；`parseDispatchComment`（`attempts.ts:206-223`）扩一截把它读回来（reconcile §3.9.6 重建派发时政策摘要跟着重建）。`Attempt` 加 `policy: string` 字段。

### 3.2 四类的内容

| 类 | 摘要的输入 | 出处 |
| --- | --- | --- |
| `gate` | `normDigest(parseGateNorm(nodes.get('norm-merge-gate')))`——已有的函数，不动 | `gate-norm.ts:88-130` |
| `floor` | parseFloor 的产物：entries（index+text+判法段）+ unparsed 清单，同 normDigest 的 entries 形状。prose 与判不了的行都进——unparsed 从严是政策的一部分 | `floor.ts` 头注、`handback.ts:366` |
| `rules` | 规则板导出文件 `docs/rules/rules.json` 的内容摘要（`textDigest`，`rules/store.ts:91-93` 的 16 位取 12）——见开放问题 Q1 | `repo.ts:73`、`store.ts:33-34` |
| `checker` | 图上 env 工具节点的 config acceptance 行（checker-config 的图半边，`checker-config.ts:54-66` 的 `envConfigs` 来源）；BUILTIN 表是代码常量，随包版本走，不进摘要——见 Q2 | `checker-config.ts:21-28` |

不用整个图修订号当政策摘要：它对无关写敏感（§2.1），而政策摘要要对「无关的图活动不漂移」负责——这是 pins 与 graph revision 分家的同一理由，反过来用在政策上。

## 4. 触发与在跑活的处置

### 4.1 三个时点

| 时点 | 做什么 | 与原型对应 |
| --- | --- | --- |
| 派发（§3.1.2 step 10） | 算四类摘要写进派发批注与寄存器 | Mandate 记录接受时的版本（§1.2） |
| 交回（§3.6.2 step 6 旁） | 重算对比；有差往交回批注加一行 `政策差：<类名单>`，通知（informational，`handback.ts:281` notify 的第四种），done 流程**照走** | policy-changed 输入＋「不立即撤销」（§1.3） |
| 审查派发（§3.7.1） | 被审任务最新交回带政策差时，审查简报加一节（§4.3）；门禁**不**拒派（政策差不是 stale，不进 reviewTargetOf 的判定） | 复验时点之一（§1.4），由审查者执行 |

重新派发天然带新摘要（派发现算），等价于原型的「恢复前复验」。检查记录的 normDigest 失效照旧（§2.3），不用动。

### 4.2 对比什么

交回与审查时都拿寄存器里那次派发的 `policy` 行对照**当前**四类摘要。逐类比，类不同才算差——`rules@xxxx` 变了而 gate 没变，就只报 rules。对比函数与 `staleness` 同型（`pins.ts:120-134`），返回逐类的 `{kind, from, to?}`。

### 4.3 审查者拿到什么

审查简报（`renderReviewBrief`，`brief.ts:600-637`）在被审任务的最新交回批注带政策差时多一节：

```
- Policy changed since the dispatch: <类名单>. The forms now in force:
  gate/norm-merge-gate and floor/norm-review-floor — read with graph_show;
  rules — the rules board page. Judge the change against the forms as they
  stand now.
```

审查者自己读现行文本（它有图与仓库），简报不搬运全文——与 docs-at-hand 的「结论由路径提醒按 id 现查」同一取舍（阅读摘要 §3.4）。挡路判据不变：政策差本身不是发现；新政策造成的发现仍要挂 acceptance:<i>、irreversible-loss、failure-plan 三类之一才挡路（`brief.ts:625`）。全审底线（floor）改严时，`floorHits` 在交回处现读现判（`handback.ts:376-389`），有效深浅已经按新 floor 走——这一半早已是「按新版重验」，本稿补的只是让审查者知情。

### 4.4 在跑 worker 不被打断

worker 会话不注入、不暂停、不重派。政策差的后果全部落在交回之后的评判层。这是与原型 `policy-changed` 投给在跑工单的唯一分歧，理由：原型的工单是常驻的（跨天），我们的 worker 是单任务会话（分钟级），中途注入的收益盖不过一次交互的代价——见开放问题 Q3。

### 4.5 通知与指标

- 通知：notify 的第四种（`handback.ts:281` 的 `'handback' | 'review' | 'stale'` 加 `'policy'`），一句话＋类名单，发给主 Agent 会话。
- 指标：`execute.policy-drift` {task, attempt, classes}。metrics 是每类一张闭表（`src/metrics/schema.ts:3,106`），实现时要加表——记进 §7 的实现依赖。

## 5. 谁付钱

审查已经存在，且无论如何都要跑：给它加一节输入是一次 `join` 的成本。worker 加一行交回批注。harness 在派发与交回各算四次小文本哈希（norm 节点 acceptance、rules.json、env config 行，都是 KB 级）。没有新进程、没有新文件、没有新循环板条目。唯一实质的新状态是派发批注里那行 `policy:`（图上，已被 parseDispatchComment 读回机制覆盖）与寄存器的一个字段（进程内，与 `pins` 同寿命）。

## 6. 数据与状态

- 派发批注加 `policy:` 行（graph，持久；`renderDispatchComment`/`parseDispatchComment` 成对改）。
- `Attempt.policy?: string`（寄存器，进程内）。
- 交回批注加 `政策差：…` 行（graph；`HandbackComment` 加字段，`renderHandbackComment`/`parseHandbackComment` 成对改，`attempts.ts:371-421`）。
- 审查简报的 delta 节（纯函数输入，`ReviewBriefInput` 加 `policyDelta?: readonly string[]`）。
- 无新运行时文件。规则板的 state 不动；`docs/rules/rules.json` 照旧。

## 7. 失败预案

- 交回时图读不出：整个对比降级，如 docs gaps 的先例说一次（`handback.ts:390-404` 的 degraded 模式），不拦交回。
- 规则板读不出（dispatch 或 handback 任一头）：该类摘要记 `unreadable` 标记；两头都读不出则该类不报差（无从比对），一头读不出按差报——fail closed 与 docs gaps 的「说一次」之间取 fail closed，因为漏报政策差比误报的代价高。
- norm 节点被删/被 supersede：摘要进 missing，按差报——底线清单被撤是在跑活最该知道的政策事件。
- 宿主重启丢了寄存器：reconcile（§3.9.6）从派发批注重建 `policy` 行，与 pins 同路。

## 8. 不做的事

- 不把政策差算进 `reviewTargetOf` 的 stale：政策差不否证工作本身，不挡审查派发。
- 不自动重跑检查或重派 worker：检查记录的 normDigest 失效已覆盖「旧证据不算数」。
- 不给 goal 验收审查与设计审查加 delta 节：它们的简报在派发时现渲染、审查者现读图（`brief.ts:534-575`），pins 已盖其 staleness。
- 不动 `stateDigest` 与规则板 journal。
- 不给 worker 中途注入政策差（Q3 开着；机制选了也不在本稿实现）。

## 9. 交给编排者记图的事项

- 决策一条：机制 1（super-agent borrow）的适配设计已出，指向本文件；政策摘要四类、触发三时点、在跑活不打断三条结论待人对 §10 后生效。
- 图节点 `reval`（design）由编排方按常规记录；本稿不写 `docs/graph/`。

## 10. 待人定的事项（开放问题）

| # | 问题 | 选项与推荐 |
| --- | --- | --- |
| Q1 | `rules` 类摘要用哪个源：导出的 `docs/rules/rules.json`（git 版本化、人可看 diff、但运行时 state 里人批的脚本 pin 不在里面），还是运行时 state 的政策切片（rules+signals 的人设值+scripts+peakMode，排除 tickets/notices/proposals 等易变集合） | 推荐 rules.json（git 可考、与仓库快照同源），scripts pin 若要并入则作为第二输入拼进同一摘要。纯 state 切片作为备选 |
| Q2 | checker 基线**文件**（knip-baseline.json 等，非图上 config 行）要不要进摘要：进则派发与交回要在 checkout 里读文件算哈希；m4 G3 已拦 worker 改，漂移只可能来自人的主干提交 | 推荐第一版不进（图上的 env config 行进），等真实发生过一次基线漂移再加——机制留了加类的位置 |
| Q3 | 在跑 worker 要不要中途收政策差（原型的 policy-changed 投给在跑工单）：走主 Agent 的 send_message 或循环板条目，每次一次交互 | 推荐第一版不做（§4.4 的理由）；worker 单任务会话短，交回与审查两点已把评判层对齐 |
| Q4 | 政策差要不要让审查挡路（算 stale） | 推荐不挡（§8 第 1 条）；若人要更严，可把「政策差未重审」变成完成门禁的一条，代价是完成门禁加一类 |
| Q5 | `norm-directions`（方向清单）算不算 worker 的政策类：它判的是设计审查，模块 releaseAt 与 pins 已部分覆盖其变化 | 推荐不进 worker 政策摘要（worker 不读方向清单；进了只会制造与设计审查无关的漂移） |

## 11. 未核实的假设

- `docs/rules/rules.json` 在本仓库当前为空或极小（`state.repo.digest` 为 null 的状态，`rules/model.ts:220`）——`rules` 类摘要对空文件也稳定成立，未实测。
- env 工具节点的 config acceptance 行数量（`checker-config.ts` 的 `envConfigs` 来源在本仓库图上的实际条数）未清点；摘要对空集合同样成立。
- `parseDispatchComment` 的行结构（`attempts.ts:180-184` 的正则）对新增一行 `policy:` 的容错：解析器按行首模式取件，加行不改首行与 pins 末行的假设——实现时以测试钉住。
- 原型 `evals.ts` 的 requeue 分支行号未逐行记（本稿只引行为），要引行号时回读克隆件（`.agents-tmp` 外的留存路径见阅读摘要来源清单）。
