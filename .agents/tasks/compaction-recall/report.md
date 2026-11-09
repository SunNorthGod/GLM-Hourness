# 压缩后会话上下文查询：DSH 现状调查

只读调查，未改代码、未提交。基线：DSH 源码 `reference/deepseek-harness`（相关包版本 0.2.1-rc.3），装机副本 `reference/dsh-desktop-0.2.1-rc.3`（只有 `lib/index.js`，没有 `.d.ts`），ZCode 3.17.1 pristine bundle `reference/zcode-3.17.1/zcode.cjs`，ZCode 3.16.2 源码 `reference/ZCode`。

可靠度标记：**[实读]** 读到了文件:行；**[推断]** 由读到的代码推出，没有运行验证。下文 `DSH/` 指 `reference/deepseek-harness/`，`rc3/` 指 `reference/dsh-desktop-0.2.1-rc.3/`。

## 0. 结论摘要

1. **DSH 有给模型用的会话历史查询工具，但默认不开。** 实验包 `@deepseek-ai/dsh-tool-session-query` 注册五个只读工具：`session_search`、`session_event_search`、`session_trace`、`session_event_trace`、`session_event_read`。其中 `session_event_search`（不传 `session_id` 即当前会话，可按 `surfaces: ['shadowed']` 过滤）和 `session_event_read` 能搜、能读当前会话里已被压缩遮蔽的原始事件。开关是官方 bundle `@deepseek-ai/dsh-experimental-session-search`（桌面版「插件 → Official → Session search」），Web 与桌面默认关闭。[实读] 本机 `~/.dsh/profiles` 下没有找到开启它的配置 [推断：只搜了 yml/yaml/json 里的包名]。编排方此前"没找到面向模型的查询工具"的检索结论不成立：工具存在，在 `packages/experimental/` 下，不在默认组合里。
2. **专为"压缩后召回"设计的工具还不存在。** `history_read` / `history_search`（拟建包 `dsh-tool-recall`）只在 proposed 笔记里，源码中没有该包。[实读]
3. **给人用的：** 聊天界面的压缩标记不替换被遮蔽的消息行，人可以往上翻看原文 [实读源码，未在桌面版实测]；会话头菜单 `Copy Session as Markdown`、`Download session log` 和 `/export` 命令读完整原始日志，压缩不会让早先消息消失 [实读源码；桌面版挂载为推断]。
4. **压缩机制：** 默认后端 `compaction-basic`。四种触发：步前压力（阈值 `floor(min(W×0.8, W−O−65536))`）、换模型、上下文溢出、人发 `/compact`。一次额外的 `ctx.llm.stream()` 调用生成摘要。压缩后模型看到：system prompt、工具、一条 checkpoint user 消息（DSH 前言 + `<compacted-summary>…</compacted-summary>`）、保留的近期原文。checkpoint 里没有任何指向被遮蔽原文的指针。原始事件仍在只追加日志 `~/.dsh/sessions/<项目键>/session-<uuid>/session.v4.jsonl.zstd` 里（JSONL，默认 zstd 压缩）。[实读]
5. **插件能读压缩前原文的官方接口：** `ctx.sessionQuery`（`filterEvents` / `readEvent` / `traceEvent` / `listEvents` / `readSession`）、会话投影 `ctx.sessionProjections.register`（逐事件折叠，事件被遮蔽前就已折进状态）、`session/event` 实时事件、已弃用的 `session.snapshotEvents()`。`session.deriveMessages()` 只给压缩后的内容。[实读]
6. **本仓库现状：** `toolsearch`、`todo-reminder`、`peak-reminder` 读 `deriveMessages()`，是压缩后内容（按设计）。设计行的 `hournessTalk` 投影逐事件折叠，保留压缩前人的原话（上限 200 000 码点），只用于引用校验，不给模型看原文；它的退路 `snapshotEvents()` 读完整原始日志。`glm-compact` 不读会话日志。[实读]
7. **ZCode 3.17.1 没有历史检索工具。** 它的压缩续接消息构造函数有一个 `transcriptPath` 选项，会追加一句"before compaction … read the full transcript at: <path>"。但 3.17.1 和 3.16.2 的生产调用点都不传这个选项，模型实际收不到这句话。[实读]

## 1. 工具、命令与界面（问题 1）

### 1.1 模型工具：`@deepseek-ai/dsh-tool-session-query`

- 包：`DSH/packages/experimental/tool-session-query`，`package.json` 版本 0.2.1-rc.3；装机副本 `rc3/dsh-tool-session-query/` 存在。[实读]
- 注册：`src/index.ts:19` `inject = ['tools', 'systemPrompt', 'sessionQuery', 'agents']`；`:51` 固定提示段 `PROMPT_TEXT`（section 名 `tool:session-query`）；`:66` `session_search`、`:76` `session_event_search`、`:86` `session_trace`、`:96` `session_event_trace`、`:109` `session_event_read`。[实读]
- 查本会话压缩前内容的路径：
  - `session_event_search` 不传 `session_id` 时目标是调用方自己（`src/workspace-access.ts:70-71` `targetId`）。参数 `surfaces` 取值 `current` / `shadowed` / `log-only`（`src/input.ts:77`），`shadowed` 就是被压缩替换掉的事件。对当前会话，搜索范围自动截到本步开始之前（`src/operations.ts:129` `lastStepStartSeq`）。[实读]
  - `session_event_read` 返回一条未删节的事件 JSON 和可选的前后事件摘要，底层是 `ctx.sessionQuery.readEvent`（`src/operations.ts:227`）。[实读]
  - `session_search` 总是排除调用方会话（`operations.ts` 中 `hit.header.id !== caller.id`），所以它不能查本会话。[实读]
- 搜索依赖 FTS 后端：两个 search 工具调用 `ctx.sessionQuery.searchSessions/searchEvents`，由 `session-query-sqlite` 实现。默认 base 里 `session-query-sqlite` 配置为 `openAt: never`（`rc3/dsh-base/cordis.patch.yml:149-161`，注释写明搜索调用失败为 `SESSION_QUERY_SEARCH_DISABLED`）。实验 bundle 自带一个隔离的 `sessionQuery` 提供者：`path: ':memory:'`、`openAt: first-search`（`rc3/dsh-experimental-session-search/cordis.patch.yml:1-14`，`isolate: { sessionQuery: true }`）。[实读]
- 授权：跨会话只允许 `cwd` 字符串完全相同；没有 `cwd` 的调用方只能看自己（包 README "Use this package"）。[实读]
- 默认不挂载：决定记录在 `DSH/.agents/notes/archived/feature/2026-08-02-session-search-not-shipped-default.md`（shipped TUI/Web/headless 不挂，任何 shipped preset 不带）；`DSH/packages/bundle/**` 中 grep `tool-session-query` 无结果；bundle README 写明 Web 与桌面默认关闭。[实读]
- 输出体量：工具本身不截断；默认 base 挂了 `spill-policy`，`maxInlineTokens: 12500`（`rc3/dsh-base/cordis.patch.yml:415-418`），超出部分换成预览加定位符。[实读]

### 1.2 专门的召回设计：未实现

- `DSH/.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md`，Status: proposed。问题陈述：压缩对模型当前上下文不可逆；模型看到的摘要不带被遮蔽范围的引用（`shadowedRange` 只在 log-only 的 `compaction/summary` 事件上）；没有工具能读回被遮蔽的片段。提议：新包 `@deepseek-ai/dsh-tool-recall`，工具 `history_read(checkpoint, offset?)` 与 `history_search(query, checkpoint?, limit?)`；冻结的索引 stub 加一个可变的 state checkpoint；每个 checkpoint 带代码拼出的尾注 `[checkpoint c<summarySeq>: shadows conversation span #<start>–#<end>; originals retrievable via history_read]`。[实读]
- 源码中文件名搜索 `tool-recall` 无结果。[实读]
- `DSH/.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md` 末尾说明该提议保留召回设计，但历史读取要改成异步分页。[实读]

### 1.3 给人用的

- 聊天界面：`DSH/packages/client/ui-chat/src/client/chat/CompactionItem.tsx:1-2` 注释为 "A compaction marker does not replace shadowed transcript rows. It is expandable only when the current window includes its cited summary." 压缩后人在界面里仍能看到被遮蔽的原消息，压缩标记可展开看摘要。[实读源码，未在桌面版实测]
- 导出：`@deepseek-ai/dsh-session-log-export`。会话头菜单 `Copy Session as Markdown`、`Download session log`，以及 `/export` 命令（ZIP）。README 写明 formatter 读已提交的原始日志，压缩的 surface 替换不会移除早先消息。挂载点 `rc3/dsh-web-app/cordis.patch.yml:75-76`（id `session-log-download`）。`rc3/dsh-desktop-host/package.json:17` 依赖 `@deepseek-ai/dsh`，`rc3/dsh/package.json:88` 依赖 `@deepseek-ai/dsh-web-app`，据此桌面版应有这个菜单。[挂载实读；桌面版可用为推断]
- `/compact`（`command-compact`）只触发压缩，不查询。[实读]
- 直接看文件：会话文件默认 zstd 压缩（见 2.5），文本工具读不了。

### 1.4 搜过的地方

- `DSH/packages/session-query/**`（`session-query`、`session-query-sqlite`、`session-log-export`）
- `DSH/packages/experimental/**`（包目录列表，`tool-session-query`、`session-search`）
- `DSH/packages/compaction/**`（`compaction`、`compaction-basic`、`command-compact`、`compaction-tool-result-pruner`、`compaction-image-offload`）
- `DSH/packages/bundle/**`、`rc3/dsh-base/cordis.patch.yml`、`rc3/dsh-web-app/cordis.patch.yml`、`rc3/dsh-experimental-session-search/`
- `DSH/.agents/notes/**` 中文件名含 session-search / session-query / compaction / persistence / spill 的笔记
- `DSH/packages/client/ui-chat`（压缩标记）、`DSH/packages/context/session-reference`（只读当前 surface，见 3）
- `~/.dsh/profiles`（是否开启实验 bundle）、`~/.dsh/sessions`（文件形状）

## 2. DSH 的压缩怎么做（问题 2）

### 2.1 组合

默认 base 挂载 `compaction-basic`（`rc3/dsh-base/cordis.patch.yml:351-352`）、`command-compact`（`:356-357`）、`compaction-tool-result-pruner`（`:426`，`thresholdChars: 8192`）、`compaction-image-offload`（`:435`）。[实读]

### 2.2 触发条件

均在 `DSH/packages/compaction/compaction-basic/src/index.ts`，`auto` 默认 `true`。[实读]

- 步前压力：`agent/pre-step` 监听（`:157`）调用 `compactIfNeeded(agent, 'pressure')`。阈值 `floor(min(W × thresholdRatio, W − O − headroomTokens))`，默认 `thresholdRatio = 0.8`（`src/config.ts:20`）、`headroomTokens = 65_536`（`src/config.ts:75`）；保留尾 `retainRatio = 0.16` × (W − O)（`src/config.ts:23`）。W 是上下文窗口，O 是请求输出上限。失败时记 warn，本轮继续。
- 换模型：`agent/request` 监听（prepend），按目标模型的容量测压，不够就先压缩；失败抛 `MODEL_SWITCH_COMPACTION_FAILED`。
- 上下文溢出：`agent/request-error` 监听（`:213-217`），只对 `CONTEXT_WINDOW_EXCEEDED`；绕过阈值与保留尾，做一次最大的平衡头部压缩后重试，`maxOverflowRetries` 默认 1。
- 人：`/compact` 立即压缩一次。

挂了 pruner 时，先无模型地裁剪超大工具结果；裁剪后低于阈值就不再摘要（包 README）。[实读]

### 2.3 摘要怎么生成

- 一次 `ctx.llm.stream()` 调用，`purpose: 'compaction'`。输入为 surface 第 0 个 `system/message` 推出的 system prompt、上次路由请求的工具、被遮蔽区间的消息原文，最后一条 user 消息是 `COMPACTION_INSTRUCTION`（`src/summarizer.ts:32`）。只保留返回的文本，推理和工具调用不进 checkpoint。[实读]
- 指令要求输出固定 Markdown 结构（Primary Request and Intent / Key Technical Concepts / Files and Code / Errors and Fixes / Pending Jobs / Current Work / Next Step / Critical Context）。若对话里已有 `<compacted-summary>` 块，要求合并成一份，不原样照抄。[实读]
- GLM 路由上，本仓库 `glm-compact` 行把这条指令换成 ZCode 的 `buildCompactPrompt`，并用 `formatCompactSummary` 处理输出（`src/glm-prompt/compact-row.ts:40` 判定，`:105` 注册 `llm/stream` 监听）。触发策略、保留尾和 checkpoint 外框仍归 `compaction-basic`（同文件头注释）。[实读]

### 2.4 写进日志的事件

`DSH/packages/compaction/compaction-basic/src/region.ts`：[实读]

- `:210` append `compaction/start`（锁）。
- `:491` append `compaction/summary`：`summary`、`rawOutput`、`shadowedRange { start, end }`、`shadowedSeqs`、`shadowedTokenCount`、`provider`、`model`、`maxTokens?`、`usage?`。类型定义在 `DSH/packages/compaction/compaction/src/types.ts:34-69`，注释写明 log-only、不进 surface。
- `:506-509` append `user/message` `checkpointMessage`，`surfaceOp: { op: 'replace', startSeq: start, endSeq: end }`，`sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs]`。
- 之后 append `compaction/end`。
- checkpoint 正文由 `frameSummary`（`src/summarizer.ts:188`）构造：`CHECKPOINT_PREAMBLE`（`:70`，"This is an automatically generated checkpoint condensing an earlier span of the conversation …"）+ `<compacted-summary>`（`:22`）+ 摘要 + `</compacted-summary>`。消息 source 为 `compactCheckpointSource(compactionId, sourceCommandId)`（`region.ts:412`），`kind: 'compact-checkpoint'`（`DSH/packages/compaction/compaction/src/checkpoint.ts:33-51`）。

### 2.5 压缩后模型的上下文

[实读，组合关系为推断]

- system prompt：每步重新组装；surface 第 0 个 `system/message` 永不被选进压缩区间（包 README "Automatic triggers"）。
- 工具 schema：不受压缩影响。
- 历史：`session.deriveMessages()` 从当前 surface 节点派生（`DSH/packages/core/session/src/index.ts:999-1002`）。被替换区间变成一条 checkpoint user 消息，后面是保留的近期消息原文。
- checkpoint 里没有被遮蔽范围的 seq、没有工具提示、没有文件路径。模型从上下文本身无从得知原文还在、也无从得知怎么取回（与 recallable 笔记的问题陈述一致）。
- 多次压缩：上一次的 checkpoint 处在下一次区间的开头，会被再次摘要合并（指令最后一条规则）。

### 2.6 原始事件存在哪里

- 日志只追加。被遮蔽事件仍在日志里，查询服务把每个事件分类为 `current` / `shadowed` / `log-only`（`DSH/packages/session-query/session-query/src/types.ts:24`；分类逻辑在 `src/tracing.ts` `analyzeEventLog` 与 `src/documents.ts` `classifySurface`，都基于 `foldSurface` 的 `replacements[].shadowedSeqs`）。[实读]
- 路径形状：`~/.dsh/sessions/<由 cwd 编码的项目键，如 --C-Users-29596-AppData-Local-Temp-glmh-l4-ws-->/session-<uuid>/session.v4.jsonl.zstd`。[实看本机一例]
- 格式：JSONL，默认 zstd 压缩（`DSH/packages/session/session-persistence-jsonl/src/index.ts:69` `DEFAULT_COMPRESSION = 'zstd'`；`src/format.ts:42` `logSuffix` 返回 `.jsonl.zstd` 或 `.jsonl`）。[实读]
- 每行一个事件 `{type, seq, time, data, surfaceOp?, sourceEventSeqs?}`。[推断：依据 `src/shared/dsh-min.ts:174` `SessionEventLike` 与 `region.ts` 的 append 参数，未解压实看]

## 3. 第三方插件能用的官方接口（问题 3）

签名取自同版本源码（装机副本没有 `.d.ts`）；rc.3 装机副本 `rc3/dsh-session-query/lib/index.js:1064`（`observeSession`）、`:1081`（`readSession`）、`:1143`（`listEvents`）、`:1152`（`filterEvents`）、`:1168`（`readSurface`）、`:1210`（`readEvent`）确认这些方法在运行时存在。[实读]

| 接口 | 读到什么 | 签名（源码） | 限制 |
|---|---|---|---|
| `session.deriveMessages()` | 当前 surface，**压缩后** | `deriveMessages(): Message[]`（`DSH/packages/core/session/src/index.ts:999`） | 拿不到被遮蔽内容 |
| `session.snapshotEvents()` / `eventAt()` / `ownEvents()` | 完整原始日志，**含压缩前** | 见 dsh-session | `@deprecated`，新的生产调用禁止（2026-09-09 弃用笔记）；目前实现仍全量驻留内存 |
| `ctx.on('session/event', (session, event) => …)` | 每个提交的事件，原消息在被遮蔽之前就已送达 | 本仓库 `src/shared/dsh-min.ts:187` `SessionEventHost` | 只有实时事件，不回放历史 [推断：resume 后不重放] |
| `ctx.sessionProjections.register(def)` | 逐事件折叠的自定义状态，可把原消息折进去 | `init(header, inheritedEventCount)`、`apply(state, event)`（`DSH/packages/session/session-projection/src/index.ts:81-94`）；`session/event` 驱动（`:277`）；恢复时从日志重新折叠（`:666-676`、`:754-755`） | 弃用笔记推荐的"resume 后所需状态"做法；状态常驻内存，存大段原文会占内存，投影缓存行为未查 [推断] |
| `ctx.sessionQuery.readSurface(id)` | 当前 surface，**压缩后** | `Promise<SessionSurfaceSnapshot>`（`session-query/src/index.ts:310`） | 每次重放并校验整个日志 |
| `ctx.sessionQuery.filterEvents(id, filters)` | 语义文本文档，可只取 `shadowed` 并做字面搜索 | `(SessionId, readonly SessionEventResultFilter[]) => Promise<SessionEventSearchDocument[]>`（`:280`）；filter 含 `{kind:'surface', values}`、`{kind:'text', text}`、`seq`/`time`/`type`（`types.ts:216-221`） | 字面、大小写不敏感、不排序；每次加载整个日志；proposed 精简笔记明确保留它 |
| `ctx.sessionQuery.readEvent(req, signal?)` | 一条完整事件加原始日志窗口 | `({sessionId, seq, before?, after?}) => Promise<SessionEventWindow>`（`:355`） | `before`/`after` ≤ `readWindowMax`，默认 50 |
| `ctx.sessionQuery.traceEvent(req, signal?)` | 从 checkpoint 的 seq 拿到它替换掉的 seq 列表，或反查某原事件被谁替换 | 返回 `replacedBy`、`replacementChain`、`replacedEventSeqs`、`sourceEventSeqs`、`derivedEventSeqs`（`types.ts` `SessionEventTrace`） | 同上，整日志 |
| `ctx.sessionQuery.listEvents(id)` | 每事件的 `{seq, type, time, surface}` | `Promise<SessionEventRecord[]>`（`:269`） | 有删除提议 |
| `ctx.sessionQuery.readSession(id)` | 完整原始日志 | `Promise<SessionLogSnapshot>`（`:184`） | 有删除提议 |
| `ctx.sessionQuery.searchEvents/searchSessions` | FTS 排序搜索 | 抽象方法（`:164`） | 默认 base `openAt: never`，调用失败 |
| `ctx.sessionPersistence` | 低层存储句柄 | `create/open(id, access)/flush/stat/list`（`DSH/packages/session/session-persistence/src/index.ts:144-210`） | 本仓库只用 `list` 读头 |
| `compaction/summary` 事件 | 每次压缩遮蔽了哪些 seq | `shadowedSeqs`、`shadowedRange`（`compaction/src/types.ts:34-41`） | log-only，需从 `session/event` 或日志读 |

`ctx.sessionQuery` 的公共限制 [实读，`session-query/README.md`]：
- 没有调用方授权，是受信任的上下文级服务；做模型工具要自己限制可读的会话。
- 优先读 live 会话，live 会话不读持久层。
- 结果都是克隆。
- 删除提议：`DSH/.agents/notes/proposed/simplification/2026-09-19-trim-session-query-convenience-api.md` 拟删 `readSession`、`readTitle`、`readTitleSnapshot`、`listEvents`；保留 `filterEvents`、`observeSession`、`readTitleSnapshots`、`readSurface`、`readEvent`、列表、搜索与 trace。

另：`DSH/packages/context/session-reference/src/projection.ts:43` 用 `isCompactCheckpointSource` 渲染当前 surface（`readSurface`），属于压缩后视图。[实读]

## 4. 本仓库现有读取点（问题 4）

| 位置 | 读什么 | 压缩前 / 后 |
|---|---|---|
| `src/toolsearch/index.ts:114-118` | `session.deriveMessages()` | 压缩后（按设计；`src/toolsearch/exposure.ts` 头注释：压缩后已加载工具要重新宣告与搜索） [实读] |
| `src/glm-prompt/todo-reminder.ts:17`、`src/glm-prompt/peak-reminder.ts:12` | `session.deriveMessages()` | 压缩后（注释写明"so resume and compaction see what the model sees"） [实读] |
| `src/design/index.ts:208`、`src/memory/answers.ts:39` | 投影 `hournessTalk` 的状态（`stateOf(session, TALK_PROJECTION)`） | **压缩前**：`talkApply`（`src/design/talk.ts`）逐事件折叠，人的消息保留到 `PEOPLE_LIMIT = 200_000` 码点（最旧先丢），`propose_to_human` 记录保留 `SHOWN_KEPT = 64` 条，不受压缩影响。只用于 `personSaid` 引用校验，不把原文给模型。 [实读] |
| `src/design/index.ts:216`、`src/memory/answers.ts:45-47` | 退路 `talkFold(session.header, session.snapshotEvents())` | **压缩前**，完整原始日志，含被遮蔽事件；只在投影注册失败时用；调用的是已弃用 API（`src/shared/dsh-min.ts:46-53` 已注明） [实读] |
| `src/glm-prompt/compact-row.ts`（`glm-compact` 行） | 不读会话日志 | 只拦截 `purpose: 'compaction'` 的 `llm/stream` 请求，换最后一条指令、格式化输出。压缩那一刻请求里带着即将被遮蔽的原文，但该行不保存 [实读] |
| `src/design/mode.ts:240`、`src/design/index.ts:403` | `sessionPersistence.list` | 只读会话头 [实读] |
| `hournessLessons`、`hournessMemory` 投影 | 各自领域状态 | 未逐行读，据名称与用途推断不保留消息原文 [推断] |

## 5. ZCode 对照

- 3.17.1 bundle：续接消息构造函数（压缩名 `Bxt`，`zcode.cjs:14380-14389`）开头 "This session is being continued from a previous conversation that ran out of context."；有 `transcriptPath` 选项时追加 "If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${t.transcriptPath}"（`:14384`）。全文大小写敏感搜索 `Bxt(` 只有定义和一个调用点 `:14730`：`Bxt(Oe,{preservedMessagesKept:k.length>0,suppressFollowup:!0})`，不传 `transcriptPath`；全文 `transcriptPath:` 出现 0 次。[实读]
- 3.16.2 源码：`apps/zcode-cli/packages/core/src/compact/prompt.ts:133-149` 有同样的选项；唯一生产调用 `src/runtime/methods/compact-active.ts:579-581` 只传 `suppressFollowup: true`；只有测试 `tests/runtime-compact.test.ts:402` 传 `transcriptPath`。[实读]
- hooks：ZCode 给 hook 进程写临时 `transcript.jsonl` 并传 `transcript_path`（`src/hooks/configured-runner-input.ts:26-29`；bundle `zcode.cjs:2271`），对象是 hook 进程，不是模型。[实读]
- 工具：`zcode.cjs` 中 `history_read`、`history_search`、`session_search`、`conversation_search`、`SearchHistory`、`ReadTranscript` 均为 0 次。[实读]
- 结论：ZCode 3.17.1 压缩后模型同样只有摘要加保留尾，没有查回原文的工具。ZCode 自己的文本里有"指向完整 transcript 的一句话 + 用 Read 读文件"这条路，但生产路径没启用。GLM 训练时见过这句话的频率未知。[结论实读；训练分布为推断]
- 旁注：GLM 路由上 checkpoint 的外框仍是 DSH 的 `CHECKPOINT_PREAMBLE` + `<compacted-summary>`，不是 ZCode 的 "This session is being continued…" 续接消息（`compact-row.ts` 头注释）。这与查询问题无关，但下面选项 C 会碰到这一层。

## 6. 在本仓库加"查压缩前原文"的做法（问题 5，只列选项）

### 选项 A：用官方实验 bundle `dsh-experimental-session-search`

- 做法：本仓库零代码，人在桌面版插件页启用 Session search。AGENTS.md 规则 6 不允许本仓库改用户 profile，只能由人自己开。
- 隐私：模型能读同一 `cwd` 下**所有其他会话**的全部内容，不止当前会话；第一次搜索时在内存里为所有可见会话建 FTS 索引。
- 上下文占用：每个请求常驻 5 个 schema 和 1 段固定英文提示。GLM 路由上，`glm-prompt` 行装载的 toolsearch（`src/glm-prompt/index.ts:40`）会把没有 ZCode 对应物的 DSH 工具延迟（`src/toolsearch/exposure.ts:51` `isConfiguredDeferred`），schema 因此不常驻；提示段会被 `rewriteDialectSections` 原样保留（`src/glm-prompt/assembly.ts:60`），仍常驻。[推断，未实测]
- 结果体量：`session_event_read` 返回未删节事件 JSON，靠 `spill-policy` 的 12 500 token 上限截流。
- 训练分布：ZCode 没有这五个工具，工具名、事件 JSON 格式、提示文本都在 ZCode 分布外。recallable 笔记的 Risks 一节也承认未训练的模型会少用新工具。
- 其他：两个 search 工具每次都要排序搜索；精确读每次重放整个日志。

### 选项 B：本仓库加一个窄工具，只读当前会话、只读被遮蔽事件

- 做法：新行，默认 `disabled: true`，inject `sessionQuery`。
  - 字面搜索：`filterEvents(sessionId, [{kind:'surface', values:['shadowed']}, {kind:'text', text}])`。
  - 取原文：`readEvent` 取窗口；`traceEvent` 从 checkpoint seq 拿被替换的 seq 列表。
  - 渲染成 `User:` / `Assistant:` / `Tool result:` 文本，不直接给事件 JSON。
  - 只用删除提议保留的 API（避开 `readSession`、`listEvents`）。
  - `dsh-min.ts` 加最小类型，并用 `AdapterContractCheck` 模式与官方类型对齐；`sessionQuery` 缺席时降级为 no-op 并上报行健康。
- 隐私：范围限于调用会话本身，模型本来见过这些内容。需另定：子 agent 会话、fork 继承前缀（`inheritedEventCount`）是否可查。
- 上下文占用：一个 schema（GLM 上可被 toolsearch 延迟）。召回结果落在上下文尾部，要自设上限或依赖 spill-policy。每次调用重放整个日志，成本随会话长度线性增长。
- 训练分布：ZCode 无对应工具，属于分布外。可以把参数做成类似 Read 的分页形态，但仍是新工具。模型不知道有这工具时不会用，需要在 checkpoint 或提示里告诉它，这又涉及改 ZCode 镜像文本。

### 选项 C：ZCode 原句 + 可读的明文 transcript 文件

- 做法：GLM 压缩时，在 `compact-row.ts` 的 `formatSummaryStream` 输出末尾追加 ZCode 原句 "If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: <path>"。同时把会话 transcript 导出成明文文件，模型用 Read（ZCode 原生工具）分页读。导出方式二选一：
  - 用 `session-log-export` 导出的纯函数 `formatSessionMarkdown(events, sourcePath?)` 处理完整事件；
  - 逐事件增量写（`session/event` 或投影）。
- 隐私：会话全文（含工具输出里的密钥、文件内容）在磁盘上多一份明文副本。DSH 原文件是 zstd 压缩的，目前磁盘上没有明文副本。存放位置必须被 git 忽略，还要有清理策略。
- 上下文占用：只在模型读文件时占用，Read 自带分页；每次压缩摘要多一行。
- 训练分布：句子是 3.17.1 bundle 里的逐字文本，可以只认 pristine 副本过逐字门禁；读取工具是 Read。三个选项里这一项形态最贴近 ZCode。但 3.17.1 生产调用不传 `transcriptPath`，GLM 实际见过多少这类句子未知。
- 机制成本：
  - 这句话会落在 DSH 的 `<compacted-summary>` 外框里，与 ZCode 原排版位置不同。
  - 压缩那一刻要拿到完整日志：`readSession` 有删除提议，`snapshotEvents` 已弃用，所以要么增量写，要么用 `filterEvents` / `readEvent` 拼。
  - 文件随会话增长。

### 不在本仓库做：等上游 recallable compaction

proposed 状态，无代码、无时间表；它要换掉压缩后端（`dsh-compact-recallable`），落地后本仓库的 `glm-compact` 接缝需要重新核对。

## 7. 拍板前要先回答的问题

1. 模型能否读同工作区的**其他**会话（A 允许，B、C 不需要）。
2. 能否接受磁盘上多一份明文会话副本（只有 C 需要）。
3. 召回能力要不要留在 ZCode 3.17.1 的工具面与文本内（C 最贴近；A、B 都是新工具）。
4. 人侧需求是否已被现有界面满足：往上翻看原文、Copy as Markdown、`/export` 都已存在，只差模型侧。

## 8. 未核实项

- 实验 bundle 在 GLM 路由上的实际表现（工具是否被延迟、提示段是否保留），未运行。
- 桌面版会话头菜单与压缩标记展开行为，未在桌面版实测。
- 会话 JSONL 行结构未解压实看。
- 投影缓存（`session-projection-cache`）对大状态的处理，未读。
