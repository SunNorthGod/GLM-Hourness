# schedule face 适配侦察（rc.3 → rc.1，循环行）

基准：main `1457830b`，0.2.2-rc.1 导出 `reference/dsh-desktop-0.2.2-rc.1/`。证据写法：`sch:<行>` 指 `reference/dsh-desktop-0.2.2-rc.1/dsh-schedule/lib/index.js`；`sch-t:<行>` 指 `lib/types/` 下的文件（update.js、domain.js、index.js 单独标注）；我们这边 `文件:行` 按 main 当前 HEAD。标记〔实读〕〔推断〕。

## 1. rc.1 服务面（全部实读）

`ScheduleService`（`sch:2116` 注册，基类 `TypertRemoteService`）：

| 成员 | 签名 | 证据 |
| --- | --- | --- |
| `create` | `(request, actorSessionId, signal?) → entry`；`request = {title, prompt, timing, target?}`，target 缺省 `{kind:'new_once'}` | sch:2233–2263（缺省 target 2237） |
| `list` | `(request = {}) → {items, shown, total, limit, offset}`；`request = {active?, limit? (1–500, 缺省 100), offset? (≥0, 缺省 0)}`；宿主级，不按会话过滤 | sch:2269–2280、1882–1890 |
| `catalog` | `() → entry[]`，active 排前（按 scheduledAt、id） | sch:2297–2299、2520–2522、1872 |
| `view` | `({id}) → entry \| {id, code:'schedule_not_found'}` | sch:2305–2311 |
| `history` | `({id, limit (1–100 必填), cursor?})` | sch:2317–2324 |
| `run` | `({id}, signal?) → entry \| {id, code:'schedule_execution_pending'\|'schedule_not_found'}`；不消耗当次 occurrence | sch:2346–2359 |
| `deleteInactive` | `() → {deleted: n}`，删全部 `status:'ended'` | sch:2375–2380 |
| `edit` | `(request, actorSessionId, signal?)`；`request = {id, action:'update'\|'delete', patch?, expectedUpdatedAt?}`；update 的 `patch = {title?, prompt?, timing?, target?, active?}`，空 patch 拒 `invalid_rule`；`expectedUpdatedAt !== (current.updatedAt ?? null)` → `{id, code:'schedule_conflict'}`；delete → `{id, deleted:true}`；update → entry；miss → `{id, code:'schedule_not_found'}` | sch:2404–2441（冲突 2415–2418，delete 2419–2428，空 patch 2405） |
| `deliveryLimits` | `() → {newSessionIntervalSeconds}` | sch:2207–2209 |
| `stopSessionTasks` | `(sessionId)`，`workspace/session-stop` 归档停会话时宿主自调，删该会话的 active 任务 | sch-t:index.js:675 起、sch:1897–1899、2192 |
| remote 包装 | `remoteCreate` / `remoteList` / `remoteHistory` / `remoteEdit`（人经 Web 调，`ScheduleInputError` 转 `RemoteError('schedule/input-invalid')`） | sch:2216、2286、2331、2387 |

事件 `schedule/changed`：仍在，提交后无载荷发（sch:2448–2454）。

关键子形状：

- timing（sch-t:update.js:5–12）：`{kind, <选择器键>}` 恰好两键；种类 `after{after_seconds}`、`at{at}`、`every{every_seconds}`、`daily{daily:{time,time_zone}}`、`weekly{weekly:{time,time_zone,weekdays}}`、`cron{cron:{expression,time_zone}}`、`rrule{rrule}`。选择器键名与 rc.3 平铺时相同。
- target（sch:2468–2494）：`{kind:'session', sessionId}`、`{kind:'new_once', sessionId, create:{cwd?, agentPreset?}}`、`{kind:'new', create}`。`session` target 过 `validateTarget`（sch:2496–2514）：归档会话拒（`invalid_rule`，2501——rc.3 接受归档会话，行为收紧）；委派子会话拒（`subagent_session`，2504、2513）；不存在的会话拒（2509、2512）。`new_once`/`new` 需要 `sessionController`（2516–2518）。
- entry（sch-t:index.js:630–644）：`{...record, target, involvedSessionIds, status, createdAt?, updatedAt?, executionActive?, deliveryFloorEndsAt?, lastDelivery?}`。record 字段名不变（`id, kind, title, prompt, scheduledAt, everySeconds?, time?, timeZone?, weekdays?, expression?`，sch-t:domain.js:276–384）。`updatedAt` 缺省时不出现（README.md:119〔实读〕）。
- status：`'active' | 'paused' | 'ended'`（sch:1595–1598）；一次性投递完 → `ended`（sch:1443、sch-t:runtime.js:394）；rc.3 存量 `'inactive'` 行解码为 `'ended'`（sch:1660）；`patch.active:false` → `paused`（sch:1941）。
- `involved(actorSessionId, target, previous)`（sch:1919–1924）：actor 与 target 会话进 `involvedSessionIds`。
- 通知（sch-t:index.js:646–668）：create/edit 成功后向 involved 的**活**会话（除 actor）inject 一条 `[SCHEDULE CHANGE]` notice 并 `sessions.flush`。
- rc.3 整记录 `expected` 全键解码检查（`hasExactKeys`，fake 复刻的 review F7 行为）在 rc.1 **不存在**，由 `expectedUpdatedAt` 乐观并发替代。
- `MIN_EVERY_INTERVAL_SECONDS = 60`（sch:21）；标题 ≤120、prompt 非空（sch-t:domain.js `scheduleTitle`、update.js:70–72）。

## 2. 逐调用点适配表（我们 → rc.1）

服务消费只在循环行。env 行的自有条目是事件触发（`src/env/loop-entry.ts:53`），不碰 schedule；execute 行的 `loop-link.ts:355` `schedule()` 是本地重排函数，同名不同物。

### 2.1 `src/shared/dsh-min.ts:884–966` — 契约类型（其余改动的根）

| 现在（rc.3） | rc.1 | 适配 |
| --- | --- | --- |
| `ScheduleRecordLike`（884–897） | record 字段名不变，新增 `kind:'rrule'` 可能出现 | 基本照抄；`kind` 联合加 `'rrule'`；`rrule?: string` 字段补上〔实读 record 形状〕 |
| `ScheduleCatalogEntry`（900–904，平铺 `sessionId`、`status:'active'\|'inactive'`） | entry 带 `target`、`involvedSessionIds`、`status:'active'\|'paused'\|'ended'`、`createdAt?`、`updatedAt?` | 整条重写：`sessionId` → `target: {kind:'session'\|'new_once'\|'new', sessionId?, create?}`；status 扩枚举；补 `updatedAt`、`involvedSessionIds` |
| `ScheduleSelector`（913–918） | 不变（键名一致），rc.1 多 `{rrule}` 一种 | 加 rrule 支（板自己不产 rrule，类型完整性） |
| `ScheduleChange`（921） | 就是 rc.1 的 `timing` 对象（`{kind, ...选择器}` 恰好两键，update.js:5–12） | 改名/别名 `ScheduleTiming`，语义注释更新 |
| `ScheduleUpdateResult`（931–934） | rc.1 无此形状：update 成功回 entry，失败回 `{id, code}` | 删，换 `ScheduleEditResult = entry \| {id, deleted:true} \| {id, code:'schedule_not_found'\|'schedule_conflict'}`（成功/失败用 `'code' in result` 与 `'deleted' in result` 判） |
| `ScheduleService`（952–966） | rc.1 面 | `create(request: {title, prompt, timing, target?}, actorSessionId?, signal?)`；删 `list`（板不再需要）、`delete`、`update`；加 `edit(request, actorSessionId?, signal?)`；`catalog()` 照旧；可选加 `view({id})`（guard 的 taskOf 改用它，见 2.6） |

### 2.2 `src/loops/bind.ts:60–67` — `scheduleOf` 形状检查

现在：`['create','list','catalog','delete','update']` 全为函数（64 行）。rc.1 服务没有 `delete`/`update` → 检查必败 → 整行降级「定时服务形状不对」，到点条目全不建。**这是 rc.1 上第一处断点。**

适配：成员名单换成 `['create','edit','catalog']`（板实际调用的全集）。〔实读：三者在 sch:2233、2404、2297〕

### 2.3 `src/loops/bind.ts:188` — `schedule.catalog()`

签名不变。但行内读的 entry 字段变：

- `task.sessionId`（251、254、272、313、318 行）→ `targetSessionIdOf(task)`：`task.target.kind !== 'new' ? task.target.sessionId : undefined`（new_once 有预留 sessionId，new 没有）。新建一个本地 helper 收一处。
- `task.status === 'inactive'`（249、266、308 行）→ `'ended'`。〔实读 sch:1660 一次性即 ended〕
- `task.scheduledAt`（268、422）、`task.lastDelivery`（254、412–413）、`task.title`、`task.prompt`、`fingerprintOf` 的全部 timing 字段（123–128）：record 平铺在 entry 里，字段名不变，**不动**。
- 新增 `'paused'` 的处置（见 §5 风险 3）。

### 2.4 `src/loops/bind.ts:338` — `create`

现在：`schedule.create(session, {title, prompt, ...selector})`。
rc.1：`schedule.create({title, prompt, timing: {kind: changeKindOf(when), ...selector}, target: {kind:'session', sessionId: session}}, session)`。

- `timing` 对象恰好是现在 `ScheduleChange` 的形状（`changeKindOf` 已把 `once→at` 映射好，97–107 行）。
- **target 必须显式 `{kind:'session', sessionId}`**：rc.1 缺省是 `{kind:'new_once'}`（sch:2237），漏传会让每条提醒开一个新会话。L2 要钉死（fake 对缺 target 拒绝）。
- `actorSessionId` 传 holder 会话：involved 集合反正会加它（sch:1919–1924），且通知跳过 actor（sch-t:index.js:658），避免每次对账给主 Agent 注入 `[SCHEDULE CHANGE]`。板不是会话，语义上「代表该会话写」。
- 返回从 record 变 entry：`fingerprintOf(record)`、`record.id` 照读（record 平铺），不用改。
- 归档竞态下 create 会被宿主拒（`invalid_rule ... is archived`，sch:2501）：rc.3 接受归档会话。板本来在 `canDeliver(holder)` 之外不建（220–236 行），只是报错文案/行健康可能多一种原因，无功能断。

### 2.5 `src/loops/bind.ts:367–374` — `repair` 的 `list` + `update`（最大的一处）

现在：`schedule.list({sessionId})` 取 fresh record 当 `expected`，`schedule.update({sessionId, id, expected, title, prompt, change})`；`updated:false` 无 code 视为「宿主归一化到原样」；整记录 `expected` 必须来自 `list`（注释引 review F7，348–352 行）。

rc.1：`list` 不再按会话过滤、返回分页对象，拿不到「这条任务的 record」语义；`update` 没了。适配为**直接 edit，list 调用整个删掉**：

```
schedule.edit({
  id: task.id,
  action: 'update',
  patch: { title: titleOf(item.entry), prompt: promptOf(item), timing: { kind, ...selector } },
  ...(task.updatedAt === undefined ? {} : { expectedUpdatedAt: task.updatedAt }),
}, session)
```

- `expected`（整记录、须来自 list）→ `expectedUpdatedAt`（catalog entry 自带 `updatedAt`，sch-t:index.js:640）。`updatedAt` 缺省时不传（不设防）而非传 null：`undefined` 完全跳过检查（sch:2415），传 `null` 才匹配缺省行——按缺省传会误判冲突，按缺失传最稳。
- 结果判定：`'code' in result` → 失败（`schedule_not_found` 走重建，`schedule_conflict` 与其余 code 沿用现在的「删了重建」分支）；`'deleted' in result` 不会出现在 update；否则成功，`fingerprintOf(result)` 照读（entry 平铺 record）。rc.3 的「归一化到原样回 `updated:false` 无 code」分支消失——rc.1 对等价 timing 也照写行、只 bump `updatedAt`（sch-t:update.js:73–90、sch:1938），返回 entry，fingerprint 不变，下一拍自然稳定，无行为差异。
- 367 行那次 `list` 调用与 348–352 行的 F7 注释一起删净（代码卫生：不留旧契约注释）。

### 2.6 `src/loops/remove.ts:110` — `delete`

现在：`schedule.delete({sessionId: task.sessionId, id: task.id})` → `{deleted, code?}`。
rc.1：`schedule.edit({id: task.id, action: 'delete', ...(task.updatedAt === undefined ? {} : {expectedUpdatedAt: task.updatedAt})}, task.sessionId 指向的 holder 会话)`。

- 结果：`{id, deleted:true}` 或 `{id, code}`。`result.deleted` 读法不变；`code` 判定照旧（128 行 `schedule_not_found` 静默）。
- actor 传 holder 会话（89 行已有的 `holder.session` 语义），避免给旧会话 inject 删除通知；被搬走的旧会话若活着会收到一条 `[SCHEDULE CHANGE] deleted`——rc.3 没有的新行为，无害，见 §5 风险 4。
- 失败兜底语义不变：写不进 `removed-tasks.jsonl` 先不删（102–106 行），删失败记 `loop-task-delete` deleted:false。

### 2.7 `src/loops/guard.ts:101,126–134,158–169` — `loops:schedule-tools` 工具名

现在：`SCHEDULE_TOOL_NAMES = ['schedule_create','schedule_update','schedule_delete']`（101 行），judgement 读 `args.prompt`、`args.id`。
rc.1 工具集：`schedule_create`、`schedule_list`、`schedule_view`、`schedule_edit`（dsh-schedule/README.md:30–37、197–201〔实读〕）。`schedule_update`、`schedule_delete` 合并为 `schedule_edit`。

适配：名单换 `['schedule_create','schedule_edit']`；`schedule_list`、`schedule_view` 只读照旧放行（README.md:30–37 明确 view 也是读）；detect 里 `schedule_edit` 按 `args.id` 判（131–134 行的分支合并）。**`schedule_edit` 的参数形状未核实**：`dsh-tool-schedule@0.2.2-rc.1` 没进导出（export-manifest.json 无此包〔实读〕），参数是否顶层带 `id`（还是包在 `{id, action, patch}` 的 request 里）是〔推断〕（照服务面 request 形状推测为顶层 `id`）。这条要 L4 或挂 Web 组合的 L3 场景核实；核实前 guard 的 `args.id` 读法按推断落地并在类型注释标注。

### 2.8 `src/loops/index.ts:529–539` — guard 的 `taskOf`

现在：全量 `schedule.catalog()` 找 id。
适配：可换 `schedule.view({id})`（sch:2305–2311，单键读、不激活会话），省一次全表扫；catalog 兜底也可，两者都对。顺带收益，非必需。

### 2.9 `src/loops/index.ts:565–567` — `schedule/changed` 监听、`574–576` — `workspace/session-stop`

两者 rc.1 不变（sch:2448–2454；session-stop 监听 sch:2192 调 `stopSessionTasks` 删该会话 active 任务，语义同 rc.3 我们注释里引的 schedule:2056–2058）。**不动**。

### 2.10 `src/loops/reminder.ts:76–88` — 投递帧解析

`source.kind === 'schedule'`（sch-t:index.js:667〔实读〕）、`schedule_id_json` / `reminder_prompt_json`（sch-t:domain.js:959–965）、批量 `reminders_json` 内 `schedule_id`（977–982）全部不变。**不动**。

## 3. fakeSchedule 差量（tests/fake-rc3.ts:356–543 + tests/loops-host.ts:72,118–119）

fake 现在完整复刻 rc.3 面（接口注释 362–374 行自述）。差量清单：

1. `service.create(sessionId, request)`（457–471）→ `create(request, actorSessionId)`：request 收 `timing`、必传 `target:{kind:'session',sessionId}`（fake 对缺 target / 非 session target 抛错，钉住 §2.4 的灾难分支）；校验平铺选择器（464 行 `selectors` 计数）改为校验 `timing.kind` + 恰好两键（对齐 update.js:5–12）。
2. `list({sessionId})`（472–476）→ 宿主级分页 `{items, shown, total, limit, offset}` + `active?` 过滤；**不按会话过滤**。板的 repair 不再调它后，fake 的 list 只服务于 person-page 语义，可以照 rc.1 实现。
3. `delete`/`update`（482–507）→ 单个 `edit(request, actorSessionId)`：update 按 `expectedUpdatedAt` 与行 `updatedAt`（缺省当 null）字符串比较出 `schedule_conflict`；delete 返回 `{id, deleted:true}`；miss 返回 `{id, code:'schedule_not_found'}`。会话归属检查（486 行 `row.sessionId !== request.sessionId`）取消——rc.1 无此检查。
4. 行结构（409）：加 `target`、`involvedSessionIds`、`createdAt`、`updatedAt`；平铺 `sessionId` 改 target；每次写 bump `updatedAt`（对齐 sch:1925–1928 的「严格晚于」）。
5. status（409、497、532）：`'active'|'inactive'` → `'active'|'paused'|'ended'`；`fire()` 一次性 → `'ended'`；加 `pause(id)`/`resume(id)` 测试助手（供 §5 风险 3 的语义用例）。
6. 整键解码 `KEYS`/`decodes`（423–438）与 review-F7 拒绝（494）**删除**——rc.1 没有这个检查。
7. `seed()`（513–519）：产 rc.1 形状行（target `{kind:'session'}`、involved `[sessionId]`、updatedAt）。
8. `calls` 的 `op` 联合（357）：`'create'|'list'|'catalog'|'delete'|'update'` → `'create'|'list'|'catalog'|'edit'`，可加 `actor` 字段。
9. KEYS 加 `rrule` 支（可选，低优先：板不产 rrule，只有 person-page 能造出）。
10. `changed()` 计数语义不变（emit 照 rc.1 每次成功写后发）。
11. `tests/loops-host.ts:72` `NATIVES`：`schedule_update`、`schedule_delete` → `schedule_edit`（+ 可选 `schedule_view`）；对齐 rc.1 工具目录（README.md:197–201〔实读〕）。

L2 用例摆动面：`tests/loops-bind.spec.ts:212–214`（F7：钉「expected 来自 list」）翻转成「不调 list、edit 带 expectedUpdatedAt」；`:145` 前后的修复用例改走 edit；`tests/loops-guard.spec.ts:174`（工具名逐字 pin）换新名单；`:188–218` 的 `schedule_update`/`schedule_delete` 调用换 `schedule_edit`；`tests/loops-row.spec.ts`、`loops-run.spec.ts` 经 fake 间接吃新形状，单独跑一遍看断言。

## 4. 实施批次大纲（建议一个实现提交）

服务类型一改，全部消费者同时编译红，拆开提交必然中间态不绿（仓库规则：安装前三道全绿）。一个提交，内部顺序：

1. **`src/shared/dsh-min.ts`**：§2.1 全部类型（ScheduleService rc.1 面、entry 形状、ScheduleTiming、ScheduleEditResult；删 ScheduleUpdateResult）。
2. **`src/loops/bind.ts`**：`scheduleOf` 名单；`targetSessionIdOf` helper；`create` 新签名 + 显式 session target + actor=holder；`repair` 删 list、改 edit+expectedUpdatedAt；`'inactive'`→`'ended'`；`'paused'` 处置（见风险 3 的定案）；删 F7 旧注释。
3. **`src/loops/remove.ts`**：delete → edit(action:'delete')。
4. **`src/loops/guard.ts`**：工具名单、detect 分支；`taskOf` 可顺带换 `view({id})`（index.ts:529–539）。
5. **tests**：fake-rc3.ts 差量 1–8、loops-host.ts NATIVES、loops-bind/loops-guard/loops-row 用例翻转。
6. **同批文档**：DESIGN.md §2.4a schedule 行结论列（loops 已重对）；ORCHESTRATION §18.10（edit/expectedUpdatedAt、list 删、status 枚举、工具名）；§2.4a 行 186 不动。

L2 钉什么：缺 target 的 create 被 fake 拒（灾难分支）；repair 走 edit、expectedUpdatedAt 不对时 fake 回 `schedule_conflict` 且板走删了重建；一次性 fire 后 `ended` 被 adopt 成 done；paused 任务不被碰（定案后）；guard 新工具名逐字 pin。

L3/L4：现有 `loops` 探针场景钉的是「headless 无会话控制器」那一面，schedule 工具在 headless 模板根本不注册（ORCHESTRATION.md:2094〔实读〕），服务面真值 L3 看不到；真验证是桌面 L4（循环行开着，看一条 daily 条目建上、到点投递、对账改回）。schedule_edit 的参数形状在此核实。

## 5. 风险

1. **list 不再按会话过滤——没有正确性依赖**〔实读全部调用点〕。rc.3 的 `catalog()` 本来就是宿主级，板的隔离靠 `isOurs`（标题前缀 + prompt 首行，remove.ts:133–135）、binding 状态与客户端 `task.sessionId` 比较，全在客户端；rc.3 的 `delete` 会话归属检查（fake:486）只是服务端二道防线，板删前已过 `isOurs` + `mayRemoveHolderTasks` + removed-tasks.jsonl 三道，删不掉防线。唯一用 `list` 的 repair 调用整个消失（其职责由 catalog 的 `updatedAt` 接管）。适配后多看一眼的：catalog 现在会带 `target.kind:'new'/'new_once'` 的别家任务，`targetSessionIdOf` 对它们返回 undefined/预留 id，走「非本会话」分支，不会误 adopt（entryIdOfPrompt 认不出 prompt 就 continue）。
2. **create 缺 target = 每条提醒开一个新会话**（rc.1 缺省 `new_once`，sch:2237）。适配必须显式传 session target，fake 拒绝缺 target 钉住。这是整张表里唯一「忘了就放大灾难」的点。
3. **`paused` 是新状态，板现在的逻辑会复活人暂停的提醒**〔推断〕：暂停任务 content 匹配、scheduledAt 过去 → afterDue 五分钟判 not-delivered → 删了重建，违背人暂停的意图。建议定案：`'paused'` 视为人的有意变更，板不碰、每天说一次（同 edited 的 sayOnce 案），恢复交给人/主 Agent。需要主人在实现批前拍板。
4. **管理写会向 involved 的活会话 inject `[SCHEDULE CHANGE]`**（sch-t:index.js:646–668，rc.3 没有的新行为）。actor=holder 消掉自通知；「搬到新会话删旧任务」时旧会话若活着会收到一条——无害但可见，文档里写一句。
5. **`schedule_edit` 参数形状未核实**（工具包没进导出，§2.7）：guard 的 `args.id` 读法是推断。风险低（读错顶多拦不住一次 rename，对账会改回），但要进 L4 核实单。
6. **归档会话 create 从「接受」变「拒绝」**（sch:2501）：板已被 `canDeliver` 挡住，只有报错文案多一种，无功能断。
7. **rrule**：人可在任务页把板的提醒改成 Custom（rrule）；fingerprintOf 的兜底分支按 cron 形状读，rrule 恒判 drift → 对账改回。与 rc.3 的「人改了改回」行为同向，收敛，不算新问题；文档提一句即可。

## 6. 结论

- 服务调用点 6 处（bind.ts 4 + remove.ts 1 + index.ts taskOf 1），外加 scheduleOf 形状检查 1 处、guard 工具名 1 处、契约类型 1 组。
- 最大适配是 repair（bind.ts:353–394）：list+update+整记录 expected 三件套 → 单次 edit + expectedUpdatedAt，调用数从 2 减到 1，F7 注释与分支整段删。
- 会话过滤依赖：无（§5.1）。
- schedule/changed、workspace/session-stop、投递帧解析、record 字段名、标题/prompt 限制、every_seconds ≥60 全部不变，相关代码不动。
