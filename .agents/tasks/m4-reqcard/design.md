# m4-request-card 设计补记（0.1，2026-11-19）

节点 `m4-request-card` 的十条验收是本车道的契约。开工前实读 main 现状（2818d130）
发现：申报通道的主体已由先前的 m4 分支实现并合入 main（11306b6e「feat(m4-request-card):
the request channel — refs, request_exception, plan text, grants (G4)」，2026-11-04；
随 0553cd40「merge: m4-gate — the gate design complete (G1-G4)」入树），M7 的两处接缝、
自动推进停等、晨报计数、L2 与 L3 都已在树。图节点状态停在 `approved` 没有走完收口。
因此本车道不重做第 1–9 条；剩余工作是第 10 条的面板半边与 ROADMAP M4 的一行，
加逐条核对与验证记录。

## 1. 与 brief 分批计划的差异

brief 的五批（纠偏+编号 → 申请工具与方案文字 → 批准与放行 → M7 路与自动推进 → docs）
对应第 1–9 条的实现批次，均已落树（证据见 §2）。改按两批落地：

1. 第 10 条面板半边（graphLive 折叠 + plain-view needs + 面板渲染 + L2）。
2. docs：ROADMAP M4 补申报通道一行（ORCHESTRATION §5/§6.1 已由 G4 批次更新，核对见 §2 第 10 条）。

## 2. 逐条判定（实读，不是推断）

| 条 | 判定 | 证据 |
| --- | --- | --- |
| 1 | 已实现 | `src/guard/index.ts` rules() 每次文件工具写入预生成编号、被拒才登记；`REQUESTABLE` = workspace-containment / checker-config / scratch-only（`src/guard/request.ts`）；checker-config、scratch-only 的纠偏带同号（`src/guard/checker-config.ts`、`src/guard/scratch.ts`）；三张例外句表按 root/subagent/worker（`exceptionOf`）；worker 的句由 `outsideDenial` 发（`src/guard/request-service.ts`）。子 agent 句指向「交回派它的 agent」；worker 句指向 ask_main |
| 2 | 已实现 | `request_exception` 全局注册（`src/guard/index.ts` 注册段），GLM 上经 DeferredToolCall 延迟；方案文字由 `buildPlan` + `renderPlan`（`src/graph/plan-text.ts`）写：题目带 displayPath 的解析路径、背景/推荐/疑问/不做四行、「附」里文件事实与三句引号原话、问话最后；疑问行按规则取（§5.4 表）；渲染抛错 → `unavailable` 不登记不写流水（F18）；本会话有等人回话的申报 → 同号重放、异号 `busy`；最后一条客户端消息之后出示过 propose_to_human → `busy`（§5.3 步 5a）；工具说明带 REQUEST_EXAMPLE，L2 有「示范过真实检查」一例（tests/guard-request.spec.ts） |
| 3 | 已实现 | `readReply`：只认 `source.kind === 'user'` 且带 rpcId 的客户端消息；上一条助手消息无工具调用块、文字规范化后以申报文字结尾、中间无别的用户消息；`APPROVAL_WORDS` 整句才放行；GrantBook 按 ref 存 30 分钟放行，签名 = 工具+参数 canonical JSON 的 SHA-256 前 16 位（键按码点排序递归，键序不算差异，同参数换键序的重试消耗同一放行，2026-11-20 根修：实现此前按插入序拼接，键序一变就漏掉放行）、目标换解析路径；批准说明带被拒调用的工具与参数（超 4 KiB 落 `requests/<ref>.call.json`）；`not-shown`/`not-client`/`unclear`（第 3 次读不懂关闭）各一条说明；申请开着且本回合第一步没有人消息时每回合提醒（step === 1）。放行消耗在 `src/guard/gate.ts`（markInUse → consume/release），第二次同调用仍拒 |
| 4 | 已实现 | 放行簿只在进程内存（GrantBook），唯一写入点是 `readReply` 收到同意词的那一处；违规流水的 request/grant/grant-void 记录无任何读取方参与授权（全仓 grep 核对：classifyRecord 只用于状态视图与晨报计数） |
| 5 | 已实现 | `prepareGrant`：使用时重 stat，存在/大小/mtime 不符 → 拒这次调用、放行作废（GrantVoidRecord）；相符且 ≤10 MiB、有项目目录 → 先复制旧内容到 `<项目目录>/requests/<ref>.before`，复制失败 → 拒这次调用、放行不作废 |
| 6 | 已实现 | 簿全内存、`dispose()` 清；重启后首次装提醒 `lapseOrphans` 扫会话日志补 `lapsed` 提醒；申报、人原话、放行、作废各写一条（RequestRecord/GrantRecord/GrantVoidRecord，带时刻与 sessionId）；晨报 例外 节有 申报行（`src/workflow/morning-report.ts` requestLineOf） |
| 7 | 已实现 | 工具与文案不看路由（无 face 换名）；`str_replace_editor` 的 create/str_replace/insert 判 path、view 放行（`src/guard/rules.ts`）；非 GLM 路由有探针 `guard-request-plain` |
| 8 | 已实现 | `src/guard/execute-rules.ts` worker-scope 拒绝前先 `peekGrant`（放行则 `next()` 交给 guard 行消耗），拒绝时 `outsideDenial`：目标出项目（按最近存在目录的项目根判，F19）→ 纠偏换 worker 申报句、记录带 ref；目标在项目里只是出工作树 → 返回 undefined，纠偏照 M7 原样、无编号。探针 `guard-request-worker` |
| 9 | 已实现 | `src/execute/drive.ts`：goal 活着且 `openRequests` 非空 → `goals.block` 原因码 `hourness-waiting-human`、原因里列编号与目标；恢复判定 `waitedDecided` 要求列出的 ref 都不在 openRequests；2 小时定时器（guard 行 armTimer）写 expired 并经 `agents.followup` 叫醒持有者，M7 在那一步恢复。探针 `guard-request-goal` |
| 10 | 半实现 | 会话日志半边已实现：开 = `request_exception` 的 ask 工具结果（带 text 与 lines），关 = `hourness-request` 提醒带 `source.request: {ref, outcome}`（approved/declined/closed/expired/lapsed，未关的带 open）。**面板半边未实现**：`src/graph/live.ts` 不认 ask 结果与关闭提醒，`needsOf`（src/graph/plain-view.ts）无 request 类，`ui/src/graph/NeedsYou.tsx` 不显示申报——plain-ui 0.9（.agents/tasks/plain-ui/design.md）明确把这块留给 M4：「M4 放行并办这件事时」。本车道补齐，设计见 §3 |

docs：ORCHESTRATION.md §5（同步卡的出工作区场景，行 879–882）与 §6.1（申报已接通段，行 915）已由 G4 批次写入并核对与现行一致；ROADMAP.md M4 节缺申报通道一行，本车道补。

## 3. 第 10 条面板半边的设计

面板只看不批（d-ui-look-not-operate）；「需要你」从会话日志读出还开着的申报。
落点与 plain-ui 0.9 的预留一致：现场投影 graphLive 折叠日志事件，`awaiting` 之外
多一个字段 `requests`（同一投影多一个来源），面板的 needs 计算加一类。

- `src/graph/live.ts`：
  - 新视图字段 `requests: readonly RequestLiveEntry[]`，`RequestLiveEntry = {ref, title, background, proposal, doubt, notTaken, at}`（at 为毫秒时刻）。至多 8 条，最旧出。
  - 折叠：`tool/call` 里经 DeferredToolCall 拆名后是 `request_exception` 的调用照常进 pending（现机制，不用改字段）；`tool/result` 成功且文本解析出 `{outcome:'ask', ref, lines:{title,四行}}` → 按 ref 加/替换；解析出 `outcome:'approved'` → 按 ref 去掉（已结算）；其余结果不改。
  - 折叠 `user/message`：`source.kind === 'hourness-request'` 且 `source.form === 'notice'` 且 `source.request.outcome ∈ {approved, declined, closed, expired, lapsed}` → 按 `source.request.ref` 去掉；`outcome === 'open'`（仍在等、not-shown、not-client、unclear）不动。其余 user/message 事件返回原状态（现测试钉住）。
  - `stateVersion` 3 → 4；stateSchema/viewSchema 校验新字段。
  - 已知残留：`lapseOrphans` 的一次提醒事实字段只带第一个 ref，其余靠面板 2 小时上限兜底（§5.8 的设计本意）；同会话多个未结算 ask 极少，不为它加面。
- `src/graph/plain-view.ts`：`needsOf(graph, awaiting, requests, now = Date.now())`；request 类条目 `at` 距 now 超 2 小时的不列（面板按 2 小时上限自己去掉，design §5.8）；`NeedKind` 加 `'request'`，条目带 `request` 与 `since`。
- 面板：`ui/src/graph/Panel.tsx` 的 requests 与 awaiting 走同一条 holder 管线（主 Agent 会话的 graphLive）；Home 的「需要你」计数与 NeedsPage 的卡片都经 needsOf，自动带上申报卡：题目一行、四行各一行（标签 背景推荐疑问不做，取 `PROPOSAL_LABELS`）、下面一行回话指引（MainChatLine，指到主 Agent 的对话）。首页至多 3 件的现行规则不变。
- L2：`tests/graph-live.spec.ts`（ask 加条、同 ref 替换、关闭提醒去掉、open 提醒不动、approved 结果去掉、普通 user/message 原状态、schema 拒收坏形状、stateVersion=4）；`tests/graph-plain-view.spec.ts`（needsOf 的 request 类与 2 小时上限）；`tests/graph-panel-model.spec.ts` 如有待决计数处跟随。

## 4. 记录在案的偏差（不返工，供编排方与人裁定）

- 同意词表：brief shaping guidance 说「按现行 talk.ts 的同意词表取集，缺的补进同一张表」；实现是 `src/guard/request.ts` 自己的 `APPROVAL_WORDS`/`DECLINE_WORDS`（比 answer-marks 的 AGREE_WORDS 多 可以的/同意/批准/放行/写吧/改吧/ok/okay/yes/y，少 就这样/就推荐的）。M4 设计 §5.5 把表值定死、人 2026-11-01 同意（「都没问题」）；改表属改权限（norm-review-floor 全审），本车道不动，记录待裁。
- 第 10 条「错过」的落名是 `lapsed`（重启后作废）。
- m8-plain-language 验收第 6 条「需要你只列三种事」在本车道落地后变四种事；验收只能由人改（plain-ui 0.9 的预留），本车道不改图，progress.md 里列为待人动作。

## 5. 验证

- 门禁：build / preflight / test，棘轮 69/18/1 只减不增；日志写主检出 .llm/logs/rc-*.log。
- 探针：地板 620/620。guard-request、guard-request-plain、guard-request-refuse、guard-request-goal、guard-request-worker 已在 run-probe.mjs；面板半边走 L2（UI 视图）与 L4（桌面真人，待人），不加新 L3 场景。
