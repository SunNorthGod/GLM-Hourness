# schedule face 适配实施进度（rc.3 → rc.1，循环行）

依据：`.agents/tasks/schedule-recon/findings.md`（71af0301）。单提交交付。

## Stage 0：读证（完成）

- fetch origin，HEAD `71af0301`，工作树有其他 lane 的改动（docs/FACTS.md、scripts/probe/run-probe.mjs 不碰）。
- rc.1 源码复核：create 2233（缺省 target `new_once` 2237）、list 2269（宿主级分页）、edit 2404（空 patch 拒 invalid_rule；`expectedUpdatedAt !== void 0 && !== (current.updatedAt ?? null)` → conflict，undefined 跳过检查、null 匹配缺省行）、entry 形状 types/index.js:630-644、status 'active'|'paused'|'ended'（rc.1 解码另有 'inactive' 兼容 1660）、timing update.js:4-14（恰好两键 + rrule）、target storage.js:43-48（new_once 的 sessionId optional，resolve 时预留）、record 含 rrule（domain.js:993，字段 `rrule`）、view 2305、notify 只发 involved 的活会话且跳过 actor。
- `dsh-tool-schedule` 不在 rc.1 导出（export-manifest 无此包）：schedule_edit 的工具参数形状保持 UNVERIFIED，代码按服务面推断（顶层 `id`），注释标 L4 待核。
- 文档定位：ORCHESTRATION 的 schedule 实文在 §11.4（1381/1433 行的边界描述）与 §18.10/§18.11；§10.2 与 §16.12 无 schedule 内容（任务指令的节号按实文落点执行）。

## Stage 1：dsh-min.ts 契约类型（完成）

`ScheduleRecordLike` 加 `rrule` kind 与 `rrule?`、`afterSeconds?` 字段（rc.1 domain.js 实读）；新增 `ScheduleTarget`（storage.js:43-48 三形）；`ScheduleCatalogEntry` 整条重写（target、involvedSessionIds、status 三态、createdAt/updatedAt、executionActive/deliveryFloorEndsAt）；`ScheduleSelector` 加 after_seconds 与 rrule 两支；`ScheduleChange` 更名 `ScheduleTiming`；删 `ScheduleUpdateResult`，新增 `ScheduleEditRequest`/`ScheduleEditResult`（entry | {deleted:true} | {code}）；`ScheduleService` 换 rc.1 面：create(request, actorSessionId?)（target 类型上必传且只收 session target，注释写明 rc.1 缺省 new_once 的灾难）、catalog、view、edit；不收 list（板不再用）。

## Stage 2：bind.ts（完成）

scheduleOf 名单 `['create','edit','catalog']`；`create` 显式 `{kind:'session'}` target + actor=holder；`repair` 单次 edit + `expectedUpdatedAt`（catalog 自带；undefined 缺省时整字段省略），list 调用与 F7 注释删净；`'inactive'` → `'ended'`；新增 paused 分支：不动、不搬、不删重建，item 0（holder 消失）也跳过 paused，孤儿清理跳过 paused，结尾按 `sayOnce` 每天一句「人暂停的提醒：N 条」（合成键 `loops:paused`）。fingerprintOf 兜底分支注释写明 rrule 恒判 drift（收敛到改回）。

## Stage 3：remove.ts / guard.ts / index.ts（完成）

remove.ts：`schedule.delete` → `edit({id, action:'delete', expectedUpdatedAt?}, holder.session)`；`RemovedTaskLine.sessionId` 改可选（来自 `targetSessionIdOf(task)`，new target 无会话）；新增导出 `targetSessionIdOf`。guard.ts：`SCHEDULE_TOOL_NAMES = ['schedule_create','schedule_edit']`，detect 按 `args.id` 读并注释标注工具参数形状 L4 待核（dsh-tool-schedule 不在 rc.1 导出）；纠偏文字改「You tried to change the reminder …」。index.ts：taskOf 换 `schedule.view({id})`（单键读、catalog 兜底删除）。

## Stage 4：tests（完成）

fake-rc3.ts：`fakeSchedule` 整段按 rc.1 重写（行结构 target/involved/status/createdAt/updatedAt、两键 timing 校验、edit 冲突语义 undefined-skip/null-match-absent、fire 一次性 → 'ended'、seed 可传 `updatedAt: null` 造未写行、新增 `pause`/`resume`/`conflictOnce`，calls 记 actor/action/expectedUpdatedAt；KEYS/decodes 整键解码删净）。loops-host.ts NATIVES 换 `schedule_view`/`schedule_edit`。loops-bind.spec：F7 用例翻转为「单次 edit + catalog 戳、无 list 调用」；新增 paused 三例（不动+一天一句、认回不删、resume 后照常）、conflict 删了重建、create 无 target 被 fake 拒、absent-updatedAt 语义直钉（null 对已写行冲突、错戳冲突、省略跳过检查、null 配未写行）。loops-guard.spec：工具名单逐字 pin 换新、`schedule_edit` 双 action 用例、纠偏文字逐字比、`breakOp('view')`。

## Stage 5：docs（完成）

- `docs/ORCHESTRATION.md`：§11.4 的 schedule 边界整条按 rc.1 重写（create 带 timing/target、缺省 new_once、validateTarget 拒归档/不存在/委派子会话）与表格行；§18.10 节首批注加 rc.1 适配一句；「到点的任务」「一次对账」「删任务的规矩」三条按新面重写（显式 target、actor=holder、单次 edit + `expectedUpdatedAt`、F7 条款删除、rrule 收敛句、actor 通知行为）；新增「人暂停的提醒」一条（定案句标注待人复核）；「到点之后」后接定案；`loops:schedule-tools` 一条换两种调用与 L4 待核句；§18.11 L2 段的假宿主与用例描述换 rc.1，L3 段「三种调用」→「两种」。
- `docs/HANDOFF.md` §10 新增第 6 项（schedule 面适配落地、paused 定案待人复核、L4 待办），原「别动」改为第 7 项。
- 未动（不在本 lane 文件清单）：`docs/DESIGN.md` §2.4a 接口表第 183 行 schedule 行的尾注「loops 行接新面前要按 rc.1 重对…fakeSchedule 仍按 rc.3 建模」现在已过时，待认领它的 lane 或下一批更新。

## 门禁

- build：过（root + glm + hourness + ui，2026-11-13）。
- preflight：过（2 包 17 目录 22 行）。
- npm test：见下。


