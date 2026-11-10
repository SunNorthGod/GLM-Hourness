# dreaming 设计：记忆的离线整固拍（窄版 B）

版本：0.2（2026-11-10）。分支 `dream`，基线 main `ac0a2cd2`（0.1 写于 `8a2ddf89`；实现落地前快进，两次基线之间 `src/memory`、`src/loops`、`src/data` 无改动，本稿行号不变）。权威输入：阅读摘要 2026-11-10 `.agents/tasks/reading-2026-11-10/digest.md` §6 候选 1（离线整固拍）、§2.2 第 1 篇（Anthropic「The components of agent memory」2026-11-06 的 findings：会话内抓取 + 空闲时离线整固的分工；「只记失败」的规定动作指令实测让两档模型变差）。摘要的选项 B 原义是「只做事实对证」；本稿的窄版 B 按派单取另一头——复发性要求的确定性候选，对证留给 §6 的 LLM 版。项目图节点 `reading-digest` 的记录为摘要正文的登记处；本稿不写图。
依据：`src/loops/`（model.ts、registry.ts、run.ts、harness.ts、peak.ts、defaults.ts、service.ts）、`src/memory/`（model.ts、storage.ts、notices.ts、tools.ts、habit-rule.ts、index.ts）、`src/data/transcript.ts`、`src/data/record.ts`、`src/data/words.ts`，main `ac0a2cd2`，全部实读。
证据写法：「文件:行」指本分支源码；〔实读〕读过源码；〔推断〕由源码与文档推出、没有运行。
干净区：本文件不写人设与语气词。给模型看的文字用英文，给人看的用中文。

## 0. 摘要

窄版 B（digest §6 候选 1 选项 B 的落地形态）：记忆行 `glm-hourness/memory` 每天一次跑一拍离线整固——读项目 `.llm/transcripts/` 近 48 小时的会话导出，从人的消息里确定性提取「在至少两个会话里说过的同类要求」，作为**候选**追加进项目的 `memory.jsonl`；候选以新的 harness 专属记录 `propose` 进流水（这是 harness 派生标记本身，见 §3.2），人确认后才经 `memory_store` 的正路变成真正的偏好条目，人丢弃则经 `memory_forget` 撤掉候选。候选不进召回、不进索引、不进 `/memory show` 的条目数：折叠里它们与条目是两张表，模型在一个候选被确认之前永远看不到它。

本拍是**确定性提取**：纯正则与词表匹配、`wordsOf`/`jaccard`（`src/data/words.ts`）聚类，拍内没有任何 LLM 调用。这是 digest 候选 1 的机制决定（脚本/检查条目跑的是命令，不是模型总结），也是窄版 B 的边界：v1 只做「复发模式的候选」，不做矛盾对证与提炼（§6 后续版本）。

「只记失败会伤表现」的 findings 落成一条提取规则：词表与两极都收——正向的「以后都…」「每次都…」（人要的工作方式）与负向的「不要…」「别再…」（人的纠正）同样成候选，聚类与计数不分正负（§4.2）。

在循环板上的形态：插件条目 `memory.dream-nightly`（`when: daily 18:35`，动作 `harness: memory.dream`），随记忆行出厂启用——与循环行五项默认条目（`LOOP_DEFAULTS`，第五项 docs-at-hand 加的）、图行 `graph.third-rework`、env 行 `env.checks-after-edit` 同一信任级（行内确定性代码，随 git 评审），不走人采纳脚本的那条路；理由与「未采纳不跑」的门在 §3.4。人第一次在循环板页面上看到它：条目标题「每晚把会话日志整理成记忆候选」，属主一行 `dsh-hourness 的 glm-hourness/memory`，打开后的明细列出当前开着的候选与证据；候选落进流水时主 Agent 在下一步收到一条不唤醒的转告（`wake: false`）。

## 1. 范围

做（v1，窄版 B）：

1. 每日一拍的确定性提取：transcript 导出解析 → 人的句子 → 词表匹配 → 跨会话聚类 → 候选（§4）。
2. 候选的流水与折叠：新操作 `propose`（只有 harness 能写）、确认（`store` 落地收走同名候选）、丢弃（`forget` 撤候选）、重复提议合并证据（§3.2、§3.3）。
3. 循环板接线：`src/memory/loop-entry.ts`（镜像 `src/graph/loop-entry.ts`、`src/env/loop-entry.ts`）+ 记忆行装配（§3）。
4. 呈现：循环板页面明细（contribution `details`）、主 Agent 的不唤醒转告、行健康（§5）。
5. 文档：`ORCHESTRATION.md` §8.5、§18.5、§18.9、§18.13（新）；`DESIGN.md` §2.4 行文本一处（§7）。

不做（v1 边界，各有理由）：

| 不做 | 理由 | 后续版本可以补什么 |
| --- | --- | --- |
| 拍内任何 LLM 调用（总结、矛盾判定、改写） | 窄版 B 的定义；脚本/检查条目不跑模型，harness 动作保持确定性才与 `loops.peak-end` 同信任级 | 用一次小模型做句子归并与「事实对证」（拿 transcript 对证记忆条目的出处，digest 选项 B 原义），跑在拍外、产出仍是候选 |
| 事实类（`project`/`reference`）候选 | 确定性提取事实会产出垃圾；`project` 条目要可认出的出处（§8.4），transcript 不是出处 | LLM 版对证后按既有出处规则提 |
| 新指标事件 | 指标闭表 90 种事件（§10.6），加事件要动 schema 与板视图，v1 的收益配不上 | 候选数、采纳率的计数，走 `count` 事件另议 |
| 跨天窗口的运行状态文件 | 48 小时窗口覆盖「昨晚 + 今天」；滚动窗口要一个「上次跑过哪」的标记文件，v1 不加 | `.llm/dream/` 下一个标记文件，窗口改为「自上次成功拍起」 |
| 矛盾对证（记忆条目出处 vs transcript） | 无语义判定能力 | LLM 版 |

## 2. 机制盘点〔实读〕

| 机制 | 现状 | 对本稿的意义 |
| --- | --- | --- |
| transcript 落盘 | `transcript` 行在 GLM 压缩时把整份日志导出为明文到 `<project data dir>/transcripts/<session id>.txt`（`src/data/transcript.ts:167`），五行头 + `=== #<seq> <kind> <ISO time>` 分条，凭证先经 secret-shape 遮掉（`renderTranscript`，`src/data/transcript.ts:107`），14 天清旧（`TRANSCRIPT_KEEP_DAYS`） | 抓取的一半已有；明文里像密钥的字符串已经不在，候选提取天然带一层防泄（§4.5 再加一道） |
| memory 流水写路径 | `writeScope`（`src/memory/storage.ts:181`）锁内折叠、计划、追加；记录形状 `NewRecord`（`src/data/record.ts:25`，`op` 是自由字符串）；折叠许可表 `WRITERS`（`src/memory/model.ts:443`）：`store` 只许 `human`/`llm`，`learn-notified`、`review`、`base` 是 harness 的 | harness **写不进** `store`——候选必须开新操作而不是放宽 `store` 的写者（§3.2 的决定） |
| 偏好的凭据 | `hasCredential`（`src/memory/model.ts:135`）：偏好要人的原话或人亲手写 | 候选在确认前不是偏好；确认走 `memory_store`，`relay` 由主 Agent 带人的原话补上，凭据语义一点不松 |
| 相似度 | `jaccard`（`src/data/words.ts:19`）+ `wordsOf`（英文按词、中文按相邻二字组），记忆查重阈值 0.6（`SIMILAR_AT`，`src/memory/model.ts:328`） | 整句中文改写在二字组下只有 0.3–0.4，聚类换「英文按词、汉字按字」的词表、阈值 0.5——实现时在夹具上实测：同请求改写 0.5–0.71、无关句 0.17 以下（§4.3 与设计 0.1 的差异记了一处） |
| 习惯词表 | `HABIT_CARD_WORDS` + `hasHabitWord`（`src/memory/habit-rule.ts:67`、`:74`）：汉字按子串、英文按整词 | 提取的正向标记沿用同一张表——「这句话是关于要一直这样做的要求」的判定，仓库里已经定过一次 |
| 循环板 harness 动作 | 插件条目动作三种：`tell-main`/`harness`/`self`（`src/loops/model.ts:23`）；`harness` 动作由交件方的 `run(action, event)` 执行（`src/loops/run.ts:928`→`src/loops/harness.ts:64`），六小时上限，`done` 的 `tell` 交给主 Agent（唤醒取 `action.tell?.wake ?? true`） | 拍的执行位；`event.project` 给出项目根（`src/shared/loop-records.ts:18`） |
| 插件条目的触发 | `daily` 对插件条目合法、不要求时区（`validateWhen`，`src/loops/trigger.ts:503`、`checkWallClock:322`） | 每晚的拍就是一条 daily 插件条目 |
| 交件机制 | `installContribution`（`src/loops/service.ts:155`）：inject 优先、`agent/created` 兜底；登记表按条目 id 记动作（`registry.ts` `actionOf`） | `src/memory/loop-entry.ts` 的模板，`graph`/`env` 两行已走过 |
| 循环行的默认条目 | `LOOP_DEFAULTS` 是循环行自己的数据，出厂启用、页面不可改（`d-defaults-readonly`，`src/loops/defaults.ts:2`） | 「默认条目随行出厂」的先例；本稿条目随**记忆行**出厂，同一逻辑 |
| 人采纳门 | `script`/`check` 动作只有人的条目能有，且未采纳的不跑（`src/loops/run.ts:971` `adopted(item)`；`src/loops/store.ts:27`） | 会跑外部命令的条目才需要每台机器的采纳；本拍不跑外部命令（§3.4） |
| 经验板的候选先例 | worker 交回成候选，`lessons_merge` 收编/丢弃，30 天过期（`ORCHESTRATION.md` §8.6） | 「候选→人拍板→正路落地」是本仓库已验证的形态；记忆候选对齐它 |

## 3. 设计

### 3.1 循环板条目

```ts
// src/memory/loop-entry.ts
export const DREAM_ENTRY_ID = 'memory.dream-nightly'
export const DREAM_ACTION = 'memory.dream'
{
  id: 'memory.dream-nightly',
  title: '每晚把会话日志整理成记忆候选',
  why: '要求散在会话里隔天就没，这一项夜里把多个会话里说过的同类要求整理成候选，你确认后才进记忆',
  when: { kind: 'daily', time: '18:35' },
  action: { kind: 'harness', action: 'memory.dream',
            tell: { text: '（占位：实际的文字由动作的结果给出）', wake: false } },
}
```

- **18:35 的理由**：GLM 高峰 14:00–18:00（`src/loops/defaults.ts:78` 的批注），`loops.unsynced-daily` 占了 18:05；daily 条目不设安静时段（`quiet` 只配 tell-main，`src/loops/model.ts:324`），转告不唤醒，落点在人还在工作日的时段，机器大概率开着。错过（关机）由 DSH 调度迟到补跑。
- **`wake: false` 的理由**：整固是后台账务，不值得为一个候选把人叫回来；`action.tell.wake: false` 同时管住动作结果 `tell` 的投递（`src/loops/run.ts:954` 用 `action.tell?.wake ?? true`）。
- **动作 id 与条目 id**：`PLUGIN_ID` 校验（`src/loops/model.ts:108`）通过；动作必须列在交件的 `actions` 里（`validateEntry` 的 `context.actions`，`src/loops/model.ts:279`），登记表按条目 id 找 `run`（`registry.ts` `actionOf`）。

### 3.2 候选的流水形态：新操作 `propose`

**决定：不动 `store` 的写者表，开新操作。** `WRITERS.store = ['human','llm']`（`src/memory/model.ts:445`）是偏好的凭据门（`hasCredential` 在折叠里兜底，`:597`）；把 `harness` 放进 `store` 等于让无凭据的偏好能从侧门进召回。`propose` 是 harness 专属：

| 字段 | 值 |
| --- | --- |
| `actor` | `harness`（许可表 `['propose', ['harness']]`；`llm`/`human` 写它算坏行） |
| `by` | `{ tool: 'dream' }`（来源标记，运行时身份是循环板的拍，没有会话） |
| `op` / `id` | `'propose'` / `project:<name>` |
| `data` | `{ name, type: 'feedback', scope: 'project', description, body, evidence }`（字段过 `validateFields` 的同一套校验；`evidence` 是会话导出的相对路径与会话 id 列表，至多 5 条） |
| `evidence`（记录一级） | 同上列表，供 `git`-外的读者一眼看到依据 |

**harness 派生的标记就是这条记录本身**：`actor: harness` + `op: propose`。不需要再加 origin 字段——折叠里候选与条目分两张表（§3.3），工具与召回都按表分界，不存在「harness 写的条目混进偏好」的路径。若有第三处要把候选当条目读，`type`/`actor` 的组合也读不出假的确认：确认条目的 `origin` 永远是落 `store` 记录的那一次（`newEntry` 的 `originOf(record)`，`src/memory/model.ts:563`），候选不携带 `created`/`origin`。

**折叠状态**：`MemoryState` 加一张表

```ts
proposals: ReadonlyMap<string, MemoryProposal>
// MemoryProposal = { name, type: 'feedback', scope: 'project', description, body,
//                    evidence: readonly string[], at: string, lastAt: string }
```

- `applyPropose`：数据过字段校验 + `findSecret`（`src/data/secret-shape.ts`，像密钥整行坏行——宁可坏行也不让凭证形状的文本留在流水里）；无名下候选则新增（`at = lastAt = 记录时刻`），有则**合并**：`evidence` 并集（保序去重，至多 5 条，多的丢最旧）、`description`/`body` 取新值、`lastAt` 更新、`at` 不动。合并意味着同一模式第二天再被提出来不会涨成一串候选。
- `applyStore` 落地同名条目时收走候选（`proposals.delete(name)`）——确认即消化，流水里留下「propose 在前、store 在后」的完整轨迹。
- `applyRevoke('forget')` 扩展：没有同名条目而有同名候选时，删候选（`data` 带候选快照，流水里留得住被删了什么）；`revokeRefusal` 不适用于候选——它不是偏好，撤它不需要人的原话（工具侧仍按 §3.3 的现路走）。
- `restore` **不**认候选（0.1 实现时的修正：折叠里已删的候选不在状态里，恢复要回溯历史记录，不值得）：模式再复发会被再提出来，这是更对的恢复。

### 3.3 确认与丢弃的路径（全部走现有工具）

| 人做什么 | 主 Agent 调什么 | 折叠里发生什么 |
| --- | --- | --- |
| 「这条收下」 | `memory_store { name, type: feedback, scope: project, description, body, relay: 人的原话 }` | `applyStore` 落条目（凭据校验、查重、`Why:` 行、密钥拒收全走现有正路）并删同名候选 |
| 「这条不要了」 | `memory_forget { name, scope: 'project' }` | `applyRevoke` 发现只有候选 → 删候选 |
| 什么都不做 | — | 候选留到下一次同名提议合并证据；**v1 不做过期**（经验的 30 天过期要一条 `expire` 机制，窄版先观察提案密度） |

`memory_forget` 的工具路径改一处：`found` 的查找（`src/memory/tools.ts:346`）从「活动条目」扩成「活动条目或候选」，计划函数相应分支；`revokeRefusal` 只对条目判。人的 `/memory forget`（命令行，身份 `human`）同路。

### 3.4 为什么随行出厂、不经人采纳（以及「未采纳不跑」的门在哪）

循环板对「会跑东西的条目」设采纳门的原因写得很直白：脚本/检查条目**运行外部命令**，必须在每台机器上有人的同意底稿（`src/loops/store.ts:27`）。本拍没有外部命令：提取是行内的纯函数（随 git 评审、随构建进包），写的是记忆行自己已经有权写的 `.llm/memory.jsonl`，信任级与循环行默认条目（`adopted` 对插件来源直接放行，`src/loops/run.ts:319`；`loops.peak-end` 是循环行自己的接续动作）、`graph.third-rework`（图行自己提问）、`env.checks-after-edit`（env 行自己跑检查）相同——这些先例全部随行出厂。digest 候选 1 表格里的「人看过脚本原文同意」这一收益，对行内代码由代码评审承担；收益的另一头（超时实测、哈希钉住）是外部脚本的防跑偏机制，行内动作由六小时上限（`src/loops/harness.ts:23`）与折叠校验承担。

「未采纳不跑」的门，在本设计里是三道，各有测试：

1. **交件门**：`installContribution` 只在循环板服务在时交件（`src/loops/service.ts:162`）；记忆行不在（禁用）则条目根本不出现在板上，动作没人提供，`actionOf` 返回 `undefined`，运行时 `action-missing` 失败（`src/loops/run.ts:930`）。
2. **动作名门**：条目的 `action.action` 必须在本份交件列出的动作集里，`validateEntry` 当场拒（`src/loops/model.ts:279`）；登记表按**条目 id** 配 `run`，别的条目冒用 `memory.dream` 拿不到这个 `run`。
3. **自身门**：`run` 对不是 `memory.dream` 的动作一律 `failed: action-missing`（`src/loops/peak.ts:306` 同款卫兵）。

人的脚本条目若有人照 digest 选项 A 自己写一个「跑外部整理脚本」的条目，采纳门照旧挡着它（`adopted(item)`，`src/loops/run.ts:971`）——本设计不移这道门。

### 3.5 提取器（`src/memory/dream.ts`，纯函数）

输入：`readonly { readonly session: string, readonly text: string, readonly mtimeMs: number }[]`（调用方从 `.llm/transcripts/` 读，48 小时窗口），`now: Date`。

```
parseTranscript(text)        → 条目列表 { seq, kind, time, text }   // 按 === #<seq> <kind> <time> 分条，五行的头跳过
personSentences(entries)     → 人的句子列表                          // kind === 'user' 的条目按句切分
matchedMarkers(sentence)     → 正向 / 负向 / 无                      // §4.2 的两张词表
extractProposals(sessions, now) → 候选列表
  1. 收每个会话的带标记句子（一条消息里同一标记只取第一句，防刷）
  2. 跨会话聚类：句子两两 jaccard ≥ 0.5 且来自 ≥ 2 个不同会话——词表是「英文按词、汉字按字」（整句改写在 `wordsOf` 的二字组下到不了 0.6，实现时按夹具实测换成这一对量法与阈值）
  3. 每个簇出一个候选：description = 簇里最短的原句（≤200 字，超长截断加 …）
     body = 原句逐条列出 + 空行 + **Why:** 人在 N 个会话里都说过这类要求（会话：<id 列表>）+ **How to apply:** 待人确认后生效
     name = dream-<sha256(规范化首句) 前 8 位十六进制>              // 同一模式稳定同名，跨天合并靠它
     evidence = 会话导出相对路径 + 会话 id，去重至多 5 条
  4. 名下已是活动条目的模式跳过（提案不会翻旧账）
  5. 候选至多 5 条/拍（超出按簇大小取前 5），写侧 findSecret 过滤
```

词表〔全抄现成判定，不自造〕：

- **正向**（人要的工作方式）：`HABIT_CARD_WORDS` 全表（`src/memory/habit-rule.ts:67`）——「习惯、偏好、记住、记下、以后都、以后每次、每次都、今后都、habit、preference、remember、from now on」。
- **负向**（人的纠正）：「不要、别再、不许、禁止、以后别、别总是、don't、do not、never、stop 」——同一匹配规则（汉字子串、英文整词）。

「只记失败伤表现」的落点：两张表同权，簇与候选不标正负、不分列表；确认后的条目就是普通偏好，正向负向都是「人要的」。另有一条纪律从 findings 直接推来：提取器**只认人的话**（`kind: user` 的条目），assistant 消息里的「我会记住」一类永远不成候选——记忆的显著性来自人，不来自 agent 的自我报告（digest §2.2 第 1 篇：显著性判断比穷举记录重要）。

### 3.6 拍的执行（`run(action, event)`）

```
卫兵：action !== memory.dream → failed 'action-missing'
places：event.project 是项目根；项目数据目录 = join(root, '.llm')（与记忆行 placesFor 的
        projectDirOf 同源，data 行在时走它的 projectDirOf）
transcripts：读 <项目数据目录>/transcripts/，mtime 在 48 小时内的 <id>.txt；
        没有 → skipped 'no-transcripts'
提取：§3.5；没有候选 → skipped 'no-candidates'
写：writeScope('project', dir, plan) —— plan 里对 state.proposals 查重合并，
        产出 proposeRecord 列表（新候选 + 合并的重复提议）
结果：done + tell（新 n 条、合并 m 条，含从哪看：循环板这一条目的明细）；
        全部是合并 → tell 也发（计数为 0 新），因为人还没拍板
```

错误全部落 `failed`（reason 进板记录与行健康），不抛——`installContribution` 与板的 `runAction` 都按不抛的契约接（`src/loops/service.ts:91`、`src/loops/harness.ts:17`）。

### 3.7 呈现

- **循环板页面**：contribution 的 `details(entry, project)`（`src/loops/service.ts:97`，≤20 行、每行 ≤160 码点）列出开着的候选：`dream-a1b2c3d4（N 个会话）：说明……`，加一行「收下：让主 Agent memory_store；不要：/memory forget <名字>」。
- **主 Agent 的转告**：拍的 `tell`（wake: false），一段：夜里的整固在 `.llm/memory.jsonl` 放了 n 条新候选（合并 m 条），明细在循环板的这一条目下，人拍板走 memory_store / memory_forget。不列候选原文（明细在板上，转告保持一条）。
- **行健康**：拍失败走板的 degraded 报告（`src/loops/run.ts:964`）；交件被拒走 `installContribution` 的 `report`（一次性）。

## 4. 校验与测试（`tests/memory-dream.spec.ts`、`tests/memory-loop-entry.spec.ts`）

| 组 | 断言 |
| --- | --- |
| 解析 | 五行头跳过；`===` 分条的 seq/kind/time；长行折行（TRANSCRIPT_LINE_MAX）合并回来；空文件、缺头的文件不炸 |
| 词表 | 正向/负向/无关三类各若干句；英文大小写与整词边界；汉字子串 |
| 聚类 | 同义改写（中/英）过 0.6；无关句子不过；单会话多句不成簇；≥2 会话成簇；簇取最短句 |
| 名与体 | `dream-` 名稳定（同输入同名）；kebab 校验过；description ≤200；body 带 `Why:`（`validateFields` 能过）；evidence 去重 ≤5 |
| 纪律 | assistant 消息不成候选；已是活动条目的模式跳过；每拍 ≤5 条；像密钥的句子被 findSecret 滤掉 |
| 折叠 | `propose` 落表；harness 之外写 `propose` 是坏行；重复提议合并 evidence/at/lastAt；`store` 同名收走候选；`forget` 删候选（无 restore——复发即再提议）；候选不进 `entries`（召回、索引、`/memory show` 的计数不受影响） |
| 工具 | `memory_forget` 能删候选（`not_found` 不再误报）；`memory_store` 确认后候选消失；偏好凭据门照旧（无 relay 的确认被拒） |
| 门 | `run` 对外来动作 `failed: action-missing`；条目过 `validateEntry`（插件、daily、harness、动作在列）——交件门与动作名门；同一份定义按人的来源交件被拒（`action.kind`——harness 动作只走插件这条随时跑的路，人的 script/check 采纳门不变，未采纳不跑由 loops-run/loops-store 现测） |
| 拍 | 无 transcripts → skipped；无候选 → skipped；写入用注入 fs（记忆行 `config.fs` 的既有做法），48 小时窗口过滤；重复跑合并不重复 |

## 5. 文档

- `ORCHESTRATION.md`：§8.4 写入判据加一条（`propose` 操作与候选的折叠形态）；§8.5 学习流水线加一条「离线整固拍（dreaming 窄版 B）」；§18 标题的状态行补一笔；§18.5 的「不在 `src/loops/` 里的」行清单加记忆行，静态检查名单同步加 `memory`，例外写明审计底座接缝（`tests/loops-registry.spec.ts` 的导入扫描正则、标题与 seam 同批改，文档的声称与检查器一致）；§18.13（新小节，随本批写实现记录）。§18.9 不动——harness 动作的运行时路已在，`memory.dream` 的描述放在 §18.13。
- `DESIGN.md` §2.4 的记忆行文本加一句离线整固拍。
- `packages/hourness/cordis.patch.yml` 的 memory 行批注加一段（行为随行走，无新行）。

## 6. 后续版本（本稿只登记，不实现）

1. LLM 版归并与对证（digest 选项 B 的完整义）：拍外小模型做句子归并、拿 transcript 对证既有条目出处、矛盾记成候选。
2. 事实类候选与出处规则。
3. 候选过期（30 天，对齐经验板）与滚动窗口的运行标记。
4. 指标闭表加「候选数 / 采纳率」。
5. digest §4 第 2 条：`glm:memory` 节的「讲用途」改写与消融——与本拍正交，另起线。

## 7. 风险

| 风险 | 缓解 |
| --- | --- |
| 候选垃圾淹没人 | 复发门槛（≥2 会话）+ 每拍 ≤5 条 + 只认人的话 + 词表白名单形态；首轮试跑后按密度调 |
| 提取误把一次性抱怨当偏好 | 负向词表只收「别/不要」的祈使形；确认在人，误报的代价是人在板上丢一条 |
| 折叠改动影响既有流水 | `propose` 是纯新增操作，旧二进制读新流水把该行计为坏行（`readJournal` 的 bad 计数），不炸读；`store`/`forget` 的改动向后兼容（无候选时行为逐字节不变） |
| 时区 | daily 不带 `timeZone` 按系统时区（`nextOccurrence`，`src/loops/trigger.ts:212`），与 `loops.unsynced-daily` 同一做法 |

## 8. 实施对账（2026-11-10，本批落地）

- 落地：§3 全部——`src/memory/dream.ts`（提取纯函数）、`src/memory/habit-words.ts`（习惯词表自 `habit-rule.ts` 抽出共享）、`src/memory/loop-entry.ts`（条目、拍、明细、交件）、`src/memory/model.ts`（`propose` 操作、`proposals` 表、确认收走、forget 删候选、无 restore）、`src/memory/tools.ts` 与 `commands.ts`（`memory_forget`、`/memory forget` 能删候选）、`src/memory/index.ts`（接线）、§5 的三处文档；测试 `tests/memory-dream.spec.ts`、`tests/memory-loop-entry.spec.ts`。
- 0.1 写作时的两处欠账，落地时补上：文档声称的静态检查（`src/loops/` 不导入其他行的目录）在 `tests/loops-registry.spec.ts` 的扫描正则里没有 `memory`，同批补上——门禁跑出两处真例外（`index.ts` 与 `machine.ts` 导入 `../memory/audit.ts`，违规流水的落盘底座，m4-gate G1 起就有），处理是把这处既有接缝写成检查器里的具名 seam（与 env 行的 `checksSeam` 同形，文件与路径都点名），不是放宽；§4 门测试表里「取现测复述一条」落成了更便宜的一条断言（人的来源交 `harness` 条目被拒，`action.kind`）。
- 基线快进：实现写于 `8a2ddf89`，落地前快进到 `ac0a2cd2`（阅读摘要随基线合入）；package.json 的 `test:2` 冲突两侧都保留。
