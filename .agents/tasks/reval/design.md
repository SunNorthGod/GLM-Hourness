# 设计：策略修订重验证在跑的活（reval）

版本：0.2（2026-11-13）。机制 1（super-agent borrow，人 2026-11-10 批准）的设计：政策（worker 的活所依赖的规则面）修订时，按旧版派出去的在跑活被对照新版重验，而不是默默按旧规则跑完。0.1（2026-11-10）只定形状与问答；0.2 按人对五个开放问题的拍板（2026-11-13，question-40，全按推荐）收口，并对照 main `8a647ef4` 复核全部引用（漂移清单见 §0.1），给出实施计划（§12）。实现归 M7 执行行的后继批次，本稿仍不开工。

依据：main `8a647ef4`（reval 分支已并入该提交，merge `09897366`）。原型仓库 `deepseek-ai/dsh-superagent-prototype`（2026-11-10 经代理克隆，HEAD 即当日默认分支），实读 `src/policy.ts`、`src/core/engine.ts`、`src/core/tickets.ts`、`src/core/evals.ts`、`src/app/settings.ts`、`docs/001-domain.md`、`docs/002-authorization.md`、`docs/007-architecture.md`；上一份阅读摘要 `.agents/tasks/reading-2026-11-10/digest.md` §2.1 第 3 篇、§4 第 4 条、§5 C2 是本稿的出发点。本项目 substrate 全部实读（0.2 逐条对照 `8a647ef4` 复核），引用见正文 `file:line`。〔实读〕读过源码；〔推断〕由源码推出、没有运行；〔未核实〕列进 §11。

范围：只有设计。不改产品代码、已跟踪文件、`docs/graph/`、`~/.dsh`，不用桌面版。要记到图上的事写成同目录的 JSON 草稿，本稿 §9 只列条目。

干净区：本文件不写人设与语气词。符号原样；给模型看的文字用英文。

## 0. 摘要

原型（dsh-superagent-prototype）的政策版本化是三件事：政策面（规则、准入模式、各 Source 的政策部）哈希成一个 `policyVersion`，每个工单的 Mandate 记录它接受时的版本；设置保存时版本变了就逐工单算影响（`policyEffects`），受影响的在跑工单收到一条 `policy-changed` 输入、在跑的评估按新版重启，不受影响的不通知；复验只在三个时点（接受、恢复、开跑）做，不过才撤销授权，版本变化本身不撤销（§1）。

我们的底座已经有一半同构的东西：pins 把任务的意图链钉在派发批注里，交回时对不新鲜就进不了主干（§2.2）；合入前检查的记录带 `normDigest`，清单变了旧记录不算数（§2.3）。缺的是政策面：`norm-merge-gate`、`norm-review-floor`、规则板、checker 配置这些「评判用的规则」不在任何 pins 里——worker 的活写完之后，政策改了没有任何机制让审查者知道、按新版重判（§2.4 的核心缺口）。

本稿的改法是 pins 的同构扩展，不加新机制（§4、§5）：

1. **政策摘要**：`policy <id>@<digest> …` 一行，与 pins 行同形状，四类各一个 12 位摘要——`gate`（norm-merge-gate 的解析条目，复用 `normDigest`）、`floor`（norm-review-floor 的解析条目加 unparsed）、`rules`（规则板导出文件 `docs/rules/rules.json` 的内容）、`checker`（图上 env 工具节点的 config acceptance 行）。派发时算好写进派发批注与 Attempt 寄存器。
2. **触发**：交回时（§3.6.2 step 6 的旁边）重算对比；有差就往交回批注加一行政策差、交一条通知（informational，不动 done 流程）。任务**不自动杀**——与原型「版本变化不立即撤销在跑 Mandate」一致。
3. **重判**：审查派发时，审查简报按被审任务最新交回批注里的政策差加一节「政策自派发后变了」，审查者按新政策重判既有工作；挡路判据不变（新政策造成的发现照样要挂在 acceptance:<i> 或既有三类上才挡路）。审查已经存在，这近乎免费（§5.3）。
4. **检查面**：`normDigest` 的既有失效机制照旧，不加东西。

### 0.1 对照 8a647ef4 的复核（0.2 新增）

逐条实读核对 0.1 的全部 `file:line` 引用。机制层面的结论一条都没有被推翻；漂移全部是行号与周边新增：

| 0.1 引用 | 8a647ef4 现状 | 定性 |
| --- | --- | --- |
| `gate-norm.ts:123-130` normDigest、`:88-130` parseGateNorm | normDigest :154-161、parseGateNorm :101-129 | 行号漂移 |
| gate 行形式 | 新增 `changed <format> $ <command>` 形式（takeover ratchet，`GATE_LINE_FORMS` :24-33 共八种）；`normDigest` 条目随之带 `changed`，`setup` 行的 watch 名单在解析时补默认（:88-91）进摘要 | 行为扩展，机制不变（摘要仍 = 解析条目，prose 不算） |
| gate-norm.ts 新增 | `unreadableOnlyLines`（:140-147）：`only` 行包反引号但路径判不了时给接管审查打回（50e5e451，`src/bootstrap/review.ts:314` checkRound 调用） | 新函数；与本稿正交，政策摘要的 gate 类不含它 |
| `check.ts:149-165` 记录带 normDigest、`:881` earlier 过滤 | parseRecord :142-157（normDigest 在 :151/:156）、earlier-pass 过滤 :882 | 行号漂移，行为同 0.1 所述 |
| `advance.ts:1013-1014` advance facts 带它、`:1014 的 filter` | digest :1033、`record.normDigest === digest` 过滤 :1034、facts 装配 :1056 | 行号漂移，行为不变；50e5e451 另加 `emptyAdvanceAgainstGraph`（:937）与 `reconcileTrunk`（:1582），与本稿正交 |
| `dispatch.ts:515-528` floor_unparsed/floor_requires_full | :503-509 | 行号漂移，判法不变 |
| `dispatch.ts:73-89` createGraphCache、`:614` registerAttempt、`:615-622` void then | :72-90、:614、:615-624 | ±1 行号漂移，行为不变 |
| `brief.ts:534-575`（goal 验收与设计审查简报） | renderDesignReviewBrief 仍在 :534-575；renderAcceptanceBrief 移到 :659-701；`ReviewBriefInput` 现在在 :579-593（加 `policyDelta` 的落点） | 行号漂移 |
| `rules/store.ts:33-34`（rules.json 出处） | `RulesPaths.rulesFile` 在 :43-44，路径在 :61 装配；`DEFAULT_RULES_DIR = 'docs/rules'` 仍在 :27-28 | 行号漂移 |
| `rules/model.ts:203-226` ProjectState、`:220` repo.digest | :203-231、:225 | 行号漂移；`stateDigest` 全量哈希含 tickets/notices 的判断仍成立 |
| `rules/repo.ts:90-92`（被人改走 diff 能认出） | outside 判定与 diff 装配在 :89-92 | 行号漂移 |
| `metrics/schema.ts:3,106`（每类一张闭表） | **结构性漂移**：schema.ts 现在只有信封、类型文法与行校验（头注 :3 明说）；每类闭表移到 `src/metrics/kinds/<namespace>.ts`（execute 表 `src/metrics/kinds/execute.ts`，`execute.review-depth` 在 :51）。加 `execute.policy-drift` 改 kinds 表，不改 schema.ts | 实现落点变了，计划按新落点写（§12 R3） |
| `attempts.ts`、`handback.ts`、`pins.ts`、`brief.ts` 其余、`graph/store.ts:20-22`、`checker-config.ts:21-28/:54-66`、`rules/store.ts:79-93`、`repo.ts:73`、`execute/index.ts:57-58` | 逐字核对无漂移（详见正文引用） | 无漂移 |

复核同时确认 0.1 的一个未核实假设现在有了答案：本仓库当前**没有** `docs/rules/` 目录——人没定过规则的项目没有这个文件（ORCHESTRATION.md:1502「人决定过什么之后才有这个文件」）。`rules` 类摘要必须把「文件不在」当稳定状态处理，不是 unreadable（§3.2、§7 已改）。

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

## 2. 我们的底座有什么〔实读，0.2 已对照 8a647ef4 复核〕

### 2.1 图修订与 pins

- `graphRevision`（`src/graph/store.ts:20-22`）：每个节点文件一行 `<id> <revision>` 按序哈希。简报页脚带它（`src/execute/brief.ts:509`：`brief <digest> · graph <revision>`），但它只随简报落盘、没有机制回头比对；且任何一次图写（别处一条批注）都动它——太粗，这正是 pins 存在的理由。
- pins（`src/graph/pins.ts`）：`pinsOf`（:85-93）＝ 任务 + 祖先链（至 goal）+ source 边指向的节点，每个 12 位语义摘要；字段按类型（`semanticFields` :59-74）：task 是 acceptance/nonGoals/kind/gone，decision 是 overturned/status，question 是 decision/conclusion/status，其余（goal、feature、**norm 落进 default 分支**）是 acceptance/nonGoals/gone。标题、正文、slope、历史、writeScope 明确排除（头注 :17-21）。读不出模块结构时按变了算（fail closed，头注 :19-21）。
- 派发批注末行是 pins 行（`src/execute/attempts.ts:167-178` renderDispatchComment，pins 由 `dispatch.ts:587` renderPins 渲染后作为批注末行）；`Attempt` 寄存器带 `pins`（`attempts.ts:53`）。

### 2.2 交回与审查派发的 stale 路径

- 交回（`src/execute/handback.ts:356-357`）：`staleness(graph, attempt.pins, sha256Hex)` 在 lessons 之后、done 流程之前算；不为空则通知 `stale`，交回批注记在任务上，**工作进不了主干**，要重新派发（:444-449）。设计审查交回同（:822-827）。
- 审查派发门禁（`src/execute/attempts.ts:434-442` reviewTargetOf + `src/execute/brief.ts:348-350`）：被审任务的交回 pins 不新鲜 → `nothing_to_review` 拒派审查。
- staleness 的语义（`pins.ts:120-134`）：逐 pin 比摘要，节点没了算 missing，pins 行读不出算整行 missing——绝不把读不懂当新鲜。

### 2.3 政策面已有的机制

- `normDigest`（`src/execute/gate-norm.ts:154-161`）：norm-merge-gate 的**解析条目**（命令、push、only，prose 不算）的 12 位摘要；`changed` 形式的 format 与 `setup` 行解析时补的 watch 名单都在条目里。检查记录带它（`src/execute/check.ts:142-157` parseRecord，normDigest 在 :151），trunk advance facts 带它（`src/execute/advance.ts:1033-1034` 的 digest 与 filter，facts 装配 :1056）：清单变了，旧记录不算数（advance.ts:1034 的 filter、check.ts:882 的 earlier-pass）。这是「政策变了旧证据失效」的既有样板，但只覆盖检查记录，不覆盖在跑的 worker 与审查。
- norm-review-floor（`src/execute/floor.ts` 头注）：每条 acceptance 一类，判法是行内反引号段；判不了的行算 unparsed，整单从严全审。派发（`dispatch.ts:503-509` floor_unparsed/floor_requires_full）与交回（`handback.ts:366-389` floorHits）都**现读现判**——floor 改了之后确实按新 floor 判，但没有机制告诉任何人 floor 变了、让审查者带着新 floor 重看旧工作。
- 规则板（`src/rules/store.ts`）：append-only journal 是事实源（头注），`stateDigest`（:87-89）是整个 ProjectState 的 16 位摘要——含 rules、signals、detectors、scripts、proposals、tickets、notices、unresolved 与 peakMode（`src/rules/model.ts:203-231`）。人定的规则导出到 `docs/rules/rules.json`（`DEFAULT_RULES_DIR = 'docs/rules'`，store.ts:27-28；`RulesPaths.rulesFile` :43-44、:61），`state.repo.digest` 记上次导出的内容摘要（`model.ts:223-225`），仓库里被人直接改走 diff 能认出（`src/rules/repo.ts:89-92`）。注意：`stateDigest` 全量哈希会把 tickets/notices 这类易变集合算进去，当政策摘要用会漂得没有意义——政策摘要要切窄（§4.2）。
- m4 两类（`src/guard/checker-config.ts`、`src/guard/suppression.ts`）：checker 配置与基线文件的写入被拒（BUILTIN 表 :21-28 + 图上 env 工具节点的 config acceptance 行 :54-66），新压制标记要理由加节点。它们定义了「政策的改动从哪来」：worker 改不了，只有人与申请通道能——所以政策漂移的来源是人的编辑，频率低、事后可考。
- git 快照（`src/guard/git-snapshot.ts`）：`refs/hourness/snapshots/<id>` 存危险 git 命令前的现场。派发的 `baseSha`（`attempts.ts:38`）钉住 worker 出发点的树；worker 改不了 checker 基线（m4 G3），基线若变必是主干上的提交——`git log baseSha..` 可考。
- 行的 revision 键缓存（`src/execute/dispatch.ts:72-90` createGraphCache，`src/execute/index.ts:57-58`）：读按 revision 复用，政策摘要在派发与交回各算一次即可，不值得缓存。

### 2.4 缺口

worker 的活所依赖的评判规则面（合入前的检查清单、全审底线、规则板的禁令、checker 配置）不在 pins 的任何一环里。一个任务派发时 source 只连它遵循的决策；norm 节点即便被连上也只算 default 分支的 acceptance（`pins.ts:68-71`）。于是：政策改了 → 在跑 worker 交回 → pins 全新 → 审查照旧派出 → 审查简报里 `gateCommands` 是派发那一刻渲染的（`brief.ts:620`，派发时由 `dispatch.ts:549` 传入），审查者对政策一无所知。阅读摘要 §5 C2 记过同型缺口（writeScope 与审批并集的先后），本稿补的是政策这一类；摘要 §4 第 4 条「策略/范围变更影响在跑的活」的机制选择就在这里落地。

## 3. 政策摘要（policy digest）的定义

### 3.1 形状

与 pins 行同形状、同 canonical 化：

```
policy: gate@<12> floor@<12> rules@<12> checker@<12>
```

- 每类 = 12 位 SHA-256 前缀（`digest12`，`src/execute/digest.ts:15-17`），canonical JSON（与 `pins.ts:77` 的 `JSON.stringify(semanticFields(...))`、`rules/store.ts:79-80` 的 canonicalJson 同一纪律：字段固定序、空集合省略）。
- 类缺失（norm 节点不在图上、env 节点读不出）按变了算，与 pins 的 releaseAt 读不出同一条 fail-closed 纪律（`pins.ts` 头注 :19-21）。`rules` 类的文件不在**不是**缺失：没有规则是合法状态，摘要取空内容的稳定值（§3.2）。
- 派发批注在 pins 行之后加这行；`parseDispatchComment`（`attempts.ts:206-223`）扩一截把它读回来（reconcile §3.9.6 重建派发时政策摘要跟着重建）。`Attempt` 加 `policy: string` 字段。解析器要从「末行即 pins」（`attempts.ts:209` 的 `lines.at(-1)`）改成按 `pins: `/`policy: ` 前缀从后向前找行——旧格式批注（无 policy 行）必须照常解析、`policy` 记 undefined（§12 R2 的兼容规则）。

### 3.2 四类的内容〔0.2：源已拍板〕

| 类 | 摘要的输入 | 出处 |
| --- | --- | --- |
| `gate` | `normDigest(parseGateNorm(nodes.get('norm-merge-gate')))`——已有的函数，不动；八种行形式（含 `changed`）与 prose 排除都是它的现行行为 | `gate-norm.ts:101-129`、`:154-161` |
| `floor` | parseFloor 的产物：entries（index+text+判法段）+ unparsed 清单，同 normDigest 的 entries 形状。prose 与判不了的行都进——unparsed 从严是政策的一部分 | `floor.ts` 头注、`handback.ts:366` |
| `rules` | 导出文件 `docs/rules/rules.json` 的内容摘要（`textDigest`，`rules/store.ts:91-93` 的 16 位取 12）。**已拍板（Q1，按推荐）**：源是导出的 rules.json（git 可考、与仓库快照同源），不是运行时 state 切片；脚本批准 pin 不在导出文件里（ORCHESTRATION.md:1502 的 RepoRules 只含 `{file, sha256, lang}`），v1 不并入，将来要并就以第二输入拼进同一摘要。文件不在（人没定过规则，本仓库现状）→ 摘 `textDigest('')`，稳定、可比，不进 unreadable 路径 | `repo.ts:73`、`store.ts:43-44/:61` |
| `checker` | 图上 env 工具节点的 config acceptance 行（checker-config 的图半边，`checker-config.ts:54-66` 的 `envConfigs` 来源）；BUILTIN 表是代码常量，随包版本走，不进摘要——**已拍板（Q2，按推荐）**：knip-baseline.json 等基线**文件** v1 不进，等真实发生过一次基线漂移再加，四类之外留加类的位置 | `checker-config.ts:21-28` |

`norm-directions`（方向清单）**不进** worker 政策摘要——**已拍板（Q5，按推荐）**：它判的是设计审查，worker 不读方向清单；模块 releaseAt 与 pins 已部分覆盖其变化，进了只会制造与设计审查无关的漂移。

不用整个图修订号当政策摘要：它对无关写敏感（§2.1），而政策摘要要对「无关的图活动不漂移」负责——这是 pins 与 graph revision 分家的同一理由，反过来用在政策上。

## 4. 触发与在跑活的处置

### 4.1 三个时点

| 时点 | 做什么 | 与原型对应 |
| --- | --- | --- |
| 派发（§3.1.2 step 10） | 算四类摘要写进派发批注与寄存器 | Mandate 记录接受时的版本（§1.2） |
| 交回（§3.6.2 step 6 旁） | 重算对比；有差往交回批注加一行 `政策差：<类名单>`，通知（informational，`handback.ts:281` notify 的第四种事件 `'policy'`），done 流程**照走** | policy-changed 输入＋「不立即撤销」（§1.3） |
| 审查派发（§3.7.1） | 被审任务最新交回带政策差时，审查简报加一节（§4.3）；门禁**不**拒派（政策差不是 stale，不进 reviewTargetOf 的判定）——**已拍板（Q4，按推荐）** | 复验时点之一（§1.4），由审查者执行 |

重新派发天然带新摘要（派发现算），等价于原型的「恢复前复验」。检查记录的 normDigest 失效照旧（§2.3），不用动。

### 4.2 对比什么

交回与审查时都拿寄存器里那次派发的 `policy` 行对照**当前**四类摘要。逐类比，类不同才算差——`rules@xxxx` 变了而 gate 没变，就只报 rules。对比函数与 `staleness` 同型（`pins.ts:120-134`），返回逐类的 `{kind, from, to?}`。派发批注没有 policy 行的旧派发（特性落地前派出的）无从比对，**不报差**——不是漏报，是派发时政策摘要还不存在；该豁免规则与寄存器被宿主重启丢掉后的重建（§3.9.6）共同保证只对「带着摘要出发」的活负责任。

### 4.3 审查者拿到什么

审查简报（`renderReviewBrief`，`brief.ts:600-637`；输入 `ReviewBriefInput` 在 :579-593）在被审任务的最新交回批注带政策差时多一节：

```
- Policy changed since the dispatch: <类名单>. The forms now in force:
  gate/norm-merge-gate and floor/norm-review-floor — read with graph_show;
  rules — the rules board page. Judge the change against the forms as they
  stand now.
```

审查者自己读现行文本（它有图与仓库），简报不搬运全文——与 docs-at-hand 的「结论由路径提醒按 id 现查」同一取舍（阅读摘要 §3.4）。挡路判据不变：政策差本身不是发现；新政策造成的发现仍要挂 acceptance:<i>、irreversible-loss、failure-plan 三类之一才挡路（`brief.ts:625`）。全审底线（floor）改严时，`floorHits` 在交回处现读现判（`handback.ts:376-389`），有效深浅已经按新 floor 走——这一半早已是「按新版重验」，本稿补的只是让审查者知情。

### 4.4 在跑 worker 不被打断

worker 会话不注入、不暂停、不重派。政策差的后果全部落在交回之后的评判层。**已拍板（Q3，按推荐）**：不做中途注入。理由（0.1 已述，拍板确认）：原型的工单是常驻的（跨天），我们的 worker 是单任务会话（分钟级），中途注入的收益盖不过一次交互的代价；交回与审查两点已把评判层对齐。

### 4.5 通知与指标

- 通知：notify 的第四种事件（`handback.ts:281` 的 `'handback' | 'review' | 'stale'` 加 `'policy'`），一句话＋类名单，发给主 Agent 会话。
- 指标：`execute.policy-drift` {task, attempt, classes}。metrics 每类一张闭表，**表在 `src/metrics/kinds/<namespace>.ts`**（0.1 引 schema.ts 的落点已漂移，见 §0.1）——实现时把新事件加进 `src/metrics/kinds/execute.ts` 的表（`execute.review-depth` 在 :51 同表），字段词表同步进 `src/shared/metrics.ts` 的编译期契约（§12 R3）。

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
- 规则文件读得出路径但读不出内容（非法 JSON 等，dispatch 或 handback 任一头）：该类摘要记 `unreadable` 标记；两头都读不出则该类不报差（无从比对），一头读不出按差报——fail closed 与 docs gaps 的「说一次」之间取 fail closed，因为漏报政策差比误报的代价高。**文件不在不算这一条**：空内容的稳定摘要（§3.2），两头一致就无事。
- norm 节点被删/被 supersede：摘要进 missing，按差报——底线清单被撤是在跑活最该知道的政策事件。
- 宿主重启丢了寄存器：reconcile（§3.9.6）从派发批注重建 `policy` 行，与 pins 同路；批注是旧格式（无 policy 行）时 `policy` 为 undefined，按 §4.2 豁免。
- 派发特性落地前的在跑批注：无 policy 行，豁免不报差（§4.2）。

## 8. 不做的事

- 不把政策差算进 `reviewTargetOf` 的 stale：政策差不否证工作本身，不挡审查派发（Q4 已拍板）。
- 不自动重跑检查或重派 worker：检查记录的 normDigest 失效已覆盖「旧证据不算数」。
- 不给 goal 验收审查与设计审查加 delta 节：它们的简报在派发时现渲染、审查者现读图（设计审查 `brief.ts:534-575`、验收审查 `brief.ts:659-701`），pins 已盖其 staleness。
- 不动 `stateDigest` 与规则板 journal。
- 不给 worker 中途注入政策差（Q3 已拍板：不做）。
- 不进 worker 政策摘要的类：checker 基线文件（Q2 已拍板，v1 不进）、`norm-directions`（Q5 已拍板，不进）。

## 9. 交给编排者记图的事项

- 决策一条：机制 1（super-agent borrow）的适配设计 0.2 已出，指向本文件；五问已按推荐拍板（question-40，2026-11-13），设计待评审后进实现批次。
- 图节点 `reval`（design）由编排方按常规记录；本稿不写 `docs/graph/`。

## 10. 已定的事项（0.1 §10 的五问，2026-11-13 人按推荐拍板，question-40）

| # | 问题 | 决定 |
| --- | --- | --- |
| Q1 | `rules` 类摘要用哪个源 | 导出的 `docs/rules/rules.json` 内容（git 版本化、人可看 diff、与仓库快照同源）。脚本批准 pin 不在文件里，v1 不并入；将来要并以第二输入拼进同一摘要。纯 state 切片否决 |
| Q2 | checker 基线**文件**（knip-baseline.json 等）进不进摘要 | v1 不进，图上的 env config 行进。机制留了加类的位置；等真实发生过一次基线漂移再加 |
| Q3 | 在跑 worker 要不要中途收政策差 | 不做。worker 单任务会话短，交回与审查两点已把评判层对齐（§4.4） |
| Q4 | 政策差要不要让审查挡路（算 stale） | 不挡（§8 第 1 条）。「政策差未重审」不进完成门禁 |
| Q5 | `norm-directions` 算不算 worker 的政策类 | 不进（§3.2）。方向清单判的是设计审查，worker 不读它 |

## 11. 未核实的假设

- ~~`docs/rules/rules.json` 在本仓库当前为空或极小~~——已核实（0.2）：本仓库没有 `docs/rules/`，文件不在是本仓库现状；「文件不在 → 空内容稳定摘要」进 §3.2/§7，L2 以测试钉住（§12 R1）。
- env 工具节点的 config acceptance 行数量（`checker-config.ts` 的 `envConfigs` 来源在本仓库图上的实际条数）未清点；摘要对空集合同样成立。
- ~~`parseDispatchComment` 的行结构对新增一行 `policy:` 的容错~~——已由 0.2 升级为设计要求：现行解析按末行取 pins（`attempts.ts:209`），加行前必须改成前缀找行，旧格式批注照常解析（§3.1、§12 R2，实现时以测试钉住）。
- 原型 `evals.ts` 的 requeue 分支行号未逐行记（本稿只引行为），要引行号时回读克隆件（`.agents-tmp` 外的留存路径见阅读摘要来源清单）。

## 12. 实施计划（0.2 新增）

四个批次，每个独立可合入；合入前过 L1（`npm run build` + `npm run preflight`）与 L2（`npm test`），碰到 DSH 运行时接缝的批次（R2-R4）加 L3 探针（DEVELOPMENT §1.1 的 L3 行）。不加新行、不改 profile：政策摘要全部落在现有 `glm-hourness/execute` 行内，无「默认 disabled」的启用步骤；每批的行为面用探针场景钉住后再进下一批。

### R1 纯函数层：政策摘要与对比

- 文件：`src/execute/policy-digest.ts`（新）。内容：四类摘要的计算（gate 复用 `normDigest(parseGateNorm(node))`；floor 取 `parseFloor` 的 entries+unparsed；rules 读 `rulesFile` 文本、不在/空都进 `textDigest('')` 一条稳定路径；checker 取 env 节点 config 行）；`policy: …` 行的 render/parse（前缀找行，与 §3.1 同款）；`policyStaleness` 逐类对比（返回 `{kind: 'changed'|'missing'|'unreadable', from, to?}`）。不 import node 内建之外的宿主服务；文件读取经注入的 reader，纯函数可测。
- L2：`tests/execute-policy.spec.ts`（新）——四类对无关图活动不漂移（只动别的节点、只动 tickets/notices，摘要不变）；单类变化只报该类；norm 节点删除/ supersede 报 missing；rules.json 不在、空文件、正常文件三种状态两两可比且不在↔空不报差；render/parse 往返；行首前缀容错（多余空白、缺类按变了算）。

### R2 派发半：批注行与寄存器

- 文件：`src/execute/attempts.ts`（`DispatchComment`/`DispatchRecord`/`Attempt` 加 `policy`，`renderDispatchComment` 在 pins 行后加 policy 行，`parseDispatchComment` 改前缀找行、policy 可缺）；`src/execute/dispatch.ts`（派发时算四类摘要，传进批注与寄存器）。
- 兼容规则：旧格式批注（无 policy 行）解析成功、`policy` undefined；寄存器里 `policy` 为 undefined 的活按 §4.2 豁免。
- L2：`tests/execute-attempts.spec.ts` 扩——render/parse 往返带 policy 行；旧格式（无 policy 行、多行尾部、尾部空行）全解析；policy 行缺失时 reconcile 重建出 `policy: undefined`。`tests/execute-reconcile.spec.ts` 扩——宿主重启后从派发批注重建 `policy`。

### R3 交回半：政策差、通知、指标

- 文件：`src/execute/handback.ts`（交回处现算当前四类摘要，对 `attempt.policy`（寄存器丢了就从派发批注回读）逐类对比；有差则交回批注加 `政策差：…` 行、notify 加 `'policy'` 事件、done 流程照走）；`src/execute/attempts.ts`（`HandbackComment` 加字段，render/parse 成对改）；`src/metrics/kinds/execute.ts` + `src/shared/metrics.ts`（`execute.policy-drift` {task, attempt, classes}，`classes` 用 `id[]`，编译期契约同批改）。
- L2：`tests/execute-handback.spec.ts` 扩——政策有差：批注带 `政策差：` 行、通知 `'policy'`、done 流程不中断；无差：批注与通知都没有该行；单类差只报该类；一头 unreadable 报差、两头 unreadable 不报；图读不出降级说一次不拦交回；旧派发（无 policy 行）不报差。`tests/execute-notice.spec.ts` 扩——`'policy'` 事件的载荷形状。

### R4 审查半：简报 delta 节

- 文件：`src/execute/brief.ts`（`ReviewBriefInput` 加 `policyDelta?: readonly string[]`，`renderReviewBrief` 在被审任务最新交回带政策差时加 §4.3 的一节）；`src/execute/dispatch.ts`（审查派发读被审任务最新交回批注的政策差传入；`reviewTargetOf` 不动）。
- L2：`tests/execute-brief.spec.ts` 扩——带差时 delta 节在、措辞与类名单逐字；无差/无字段时节不在；`tests/execute-review.spec.ts` 扩——审查派发把最新交回的政策差传进简报、门禁不因政策差拒派。

### 探针（L3，随 R2-R4 各跑一轮）

场景加在派发可行性验证的场景组上（`scripts/probe/probe-dispatch.mjs` 的 `glm-dispatch`，覆盖层不改）：在 worker 派发之后、交回之前用引擎改一处政策（首选 `norm-review-floor` 加一条可判类，次选 `norm-merge-gate` 换命令），钉四条：

1. **policy-digest row in dispatch comment**：派发批注末两行是 `pins: …` 与 `policy: gate@… floor@… rules@… checker@…`，四段各 12 位十六进制。
2. **policy-delta in handback**：任务上的交回批注带 `政策差：floor`（或实际改的类），持有者通知提到类名，任务照常走完 done 流程、审查任务照常提出。
3. **review-brief delta section**：随后的审查派发，探针记录的请求里审查简报含 "Policy changed since the dispatch" 一节且类名单正确。
4. **negative**：不改政策的对照组（现有 `glm-dispatch` 步骤补一条断言）——交回批注无 `政策差` 行、简报无 delta 节。

### 风险

1. **派发批注解析兼容**：pins 行不再是末行。前缀找行 + 旧格式 L2 全盖（R2）；探针钉真实批注形状。
2. **rules 类的语义噪音**：人改 rules.json（哪怕只改注释性文字）报 rules 差。v1 只报类级、不搬 diff（§4.3 审查者现读现行文本），接受这类噪音；真发生了再加子类。
3. **metrics 契约同步**：kinds 表与 `src/shared/metrics.ts` 词表必须同批改，漏一边编译失败（既有契约检查兜住，属好事）。
4. **fail closed 的误报面**：图读不出按差报 vs 降级说一次——本稿取「图整体读不出 → 降级说一次」（与 docs gaps 同案），单类读不出（节点没了）→ 按差报。两档边界在 R3 的 L2 里钉死。
5. **豁免规则的边界**：特性落地前的旧派发、寄存器丢失且批注是旧格式，两者都无基线可比。规则只有一条：没有 policy 行就没有政策差（宁缺毋错报）。

## 13. 实施记录（0.3 增补，2026-11-13）

按 §12 的四批全部落地，分支 `reval`，每批一个提交，全部门禁过后才进下一批。

| 批 | 提交 | 内容 |
| --- | --- | --- |
| R1 | `037f127a` | `src/execute/policy-digest.ts`：四类摘要（gate 复用 `normDigest(parseGateNorm)`；floor 取 `parseFloor` 的 entries+unparsed；rules 读导出文件文本、不在与空文件同一个稳定摘要、读不出记 unreadable；checker 取 `envBranch` 的 config 路径，与 guard 的图半边同源）；`policy:` 行 render/parse（按前缀找行，空白容错，最后一个生效）；`policyStaleness` 逐类对比。偏差：`GATE_NORM_ID`、`FLOOR_NORM_ID`、`POLICY_CLASSES` 保持模块内常量（knip 基线 18 不涨） |
| R2 | `e3c7b5d2` | `Attempt`/`DispatchComment`/`DispatchRecord` 加 `policy`，派发批注在 pins 行后写 policy 行，`parseDispatchComment` 改为 pins 与 policy 都按前缀从后向前找（旧格式照常解析、policy 缺省）；派发时算四类摘要进批注与寄存器（各角色一律）；`rulesReadOf` 放在 handback.ts（dispatch 值依赖 handback 的既有方向，不加新环）；reconcile 重建带 policy。偏差：`tests/execute-row.spec.ts` 一条既有断言随批注新形状更新 |
| R3 | `1ae02a9e` | 交回处现算当前四类摘要对 `attempt.policy` 逐类对比；有差则交回批注加 `政策差：` 行（`HandbackComment.policyDrift`，render/parse 成对）、notify 第四种事件 `'policy'`、`execute.policy-drift` {task, attempt, classes}（kinds 表 + shared 词表 + execute 层 MetricEvent 三处同批）、done 流程照走 |
| R4 | （reval 分支） | `ReviewBriefInput.policyDelta`，审查简报按 §4.3 措辞加 delta 节；审查派发把被审任务最新 done 交回的政策差传进简报；`reviewTargetOf` 未动 |

两处测试落点与 §12 的指定不同（理由在 progress.md）：`'policy'` 通知载荷形状断言放 `tests/execute-handback.spec.ts`（持有 sent 捕获的 rig 在那里；`execute-notice.spec.ts` 是派发状态通知，另一个主题）；审查派发接线测试放 `tests/execute-row.spec.ts`（`execute-review.spec.ts` 是 review.ts 纯函数 spec，没有派发 rig）。

实施中发现并修掉的一个寄存器窗口：policy 摘要的计算一度放在 `startActivation` 与 `registerAttempt` 之间，async 缝隙让「已启动未注册」的子会话存在——L2 的验收审查重派测试偶发红（测试的 `processed()` 在条目未注册时立刻放行，rig 清场后在途写撞上已删树）。修法是计算移到 `startActivation` 之前，start→register 保持同步连排（§3.1.4 的语义本就要求这样，生产里同一缝隙会削弱子会话首次调用的写护栏）。

探针钉四条落在 `glm-exec-review`（设计写的 `glm-dispatch` 是派发可行性三场景组，不跑执行行；真正走 `dispatch_task`、交回与审查派发的是 exec 场景族）与 `glm-exec-docs`（负对照）：场景加 `norm-merge-gate` 种子、派发与交回之间经 `probe_human_write` 给 `norm-review-floor` 加一条可判类（覆盖层不改 `probe-dispatch.mjs`，只在场景覆盖行加探针行）；检查读通知文本而不是 source 载荷——运行时请求记录只记 `source.kind`（probe-llm 的 summarizeMessage），载荷形状由 L2 在 UserNotice 对象上钉住。两轮探针：567/585（562/580 基线 + 5 条新检查全过，18 条基线红逐字不变）。指标 kinds 同步：`.agents/tasks/metrics/design.md` 的 M7 节 23→24 种、字段表加行，`tests/metrics-schema.spec.ts` 钉单同步——这处是 R3 遗漏、终局链补上（R3/R4 的全量链曾被 jscpd 挡在 test:1，spec 没跑全；终局链以退出码为准）。

门禁：每批 build/preflight/test 全绿，棘轮 eslint 73 / knip 18 / jscpd 1 逐批持平；`tests/execute-policy.spec.ts` 进 `package.json` 的 test:2 链。origin/main 两次并入（`09897366` 文档、`f0c0cd77` worker-git 索引拒绝 + 文档，后者带一次合并后全量链与一轮探针）。实施过程逐批记录在同目录 progress.md。
