# 状态板块剩余批次与面板做完条件第 8 条：实施计划（第三轮）

运行 `wf_992ec82f32e990c0`（status-hub-3-and-panel-8），工作树 `.worktrees/status-hub-3`，分支 `status-hub-3`，基于 main `4bf9976`。设计：状态板块 0.3（`.agents/tasks/status-hub/design.md`，`d-status-hub-released`）；面板 1.3（`.agents/tasks/plain-ui/design.md`，`d-panel-released`）§4.7、§8.2、§10.1、§11「1.0 的对接」第 2、4 条；做完条件第 8 条原文在 `m8-plain-language` 的 acceptance。本文件只排批次，不改设计。

## 0. 基线（2026-11-05，main `4bf9976`）

- `git merge-base --is-ancestor`：`e88da27`（m4-checks 合并，含 B5 `f1b518f`、B6 `63388d5`）与 `3b24f1e`（rules-board-page 与 status-hub-2）是 HEAD 的祖先；`origin/m7` `77a0c87` 不是（main 上没有 `src/operate/`，`src/execute/` 只有 E0/E1a/E3 的八个文件）。
- 门禁：build 0、preflight 0、`npm test` 0（182 个 TAP 汇总，3156 过 / 0 败），棘轮 eslint 73 / knip 18 / jscpd 1。`npm test` 第一次 3 败，都在 `tests/lessons-seed.spec.ts`：它要的 `.agents/tasks/m5/lessons-seed.json` 被 `.gitignore` 的 `.agents/tasks/**/*` 挡在 git 外，spec 自己写着要把它放进本检出；从主检出拷进本工作树（SHA-256 `E10A3247…41910` 与主检出相同）后 3/3 过。探针基线没有单独跑：`3b24f1e` 合入时 420/420，之后 main 只多了 lessons-4 的文档与图文件。

## 1. 状态板块剩下的项

| 项 | 归类 | 证据 |
| --- | --- | --- |
| 第 6 批：M7 的 `fourAnswers`/`weeklyReport`/`hourness_report` 读 `collectStatus(..., 'agent')`、晨报「用量（今天）」两扇窗、周报转述 `metrics/load`、`hourness_report` 的 L3 | 还在等 M7 运维行 P3 | `origin/m7` 不是 main 的祖先；main 上没有 `src/operate/`、`four-answers.ts`、`weekly.ts`；`hourness_report` 只在 `OPERATE_TOOL_NAMES` 里有名字 |
| 规则板条目：规则板页面从 `snapshot().items` 列 `rules/*`；板块路一源 | 已做完 | `d1e1337`：`view.json` 的 `items` 是收集器 `owner === 'rules'` 的条目原样（`src/rules/view-build.ts`，`tests/rules-row.spec.ts` 深等同一时刻收集器的条目）；`cfdb8f1`：`ui/src/rules/board.ts` 的 `snapshot().items` 是文件里的 `items`（`tests/rules-panel-model.spec.ts` 第 14 个测试深等）；探针 `rules-page: glm-rules: the items hold rules/denials and rules/lifts, and the text of rules/peak is the first line of the 面板 section of the same run's /hourness`（`3b24f1e` 合入时 420/420） |
| M4 的超时条目：检查的超时的数、来源与上限调高，晨报「检查的超时」一节与面板那一格同一份（设计 §12 M4 行，P13-01 同源那一面） | 本线做：第 9 批 | 原来等 m4-checks B5，B5（`f1b518f`）已在 main：`limits.jsonl`、`check_limit`、`limitSetting`；今天晨报一节在 `src/workflow/morning-report.ts` 的 `timingSection` 里自己读 `timing.jsonl` 与 `limits.jsonl` 算，`src/env/status.ts` 只交 `env/suppressions`，循环板一侧没有读这份数据的地方 |
| 循环板的两张周清单 `loops/*` 与循环板 `snapshot().items` | 还在等：没有提供方 | 循环板服务 `LoopsService` 在 main 上只有 `declaration`、`contribute`、`emit`、`listens`、`recordRun`（`src/loops/service.ts`）；`staleEntries`、`timeoutEntries` 只出现在 `src/loops/service.ts:10-13` 与 `src/loops/metrics.ts:8` 的注释里，没有实现；循环板设计 §6.11 要的「每项的 `lastResultAt` 与最近 28 天的运行数」也不在 `state.json` 里；loops-runner 计划第 5 条把它们排在「随报告面那批」，消费方是 M7 的周报；删除走 `loop_propose`，同意的路也还没建 |
| 经验板条目 | 还在等 M5 下一稿 | 设计 §12 M5 行，`d-freeze-until-dogfood` |
| 做完条件第 1、2、3、6 条剩下的 M7 一半与 L4 | 还在等 M7 P3，L4 随批次 L4 | 节点 `status-hub` 2026-11-05T06:30 的批注 |

## 2. 面板做完条件第 8 条，逐样对照 main

| 样 | 归类 | 证据 |
| --- | --- | --- |
| 首页页脚「规则板 ›」「循环板 ›」打开那块板的第 2 层页面 | 已做完 | `ui/src/hourness-client.tsx:41-44` 登记规则板（`cfdb8f1`）与循环板（`8c9d74f`）；`ui/src/graph/Panel.tsx:83,267,361` 页脚按 `boards()` 列、打开登记的 `Page` |
| 插件带来的条目标「<插件>带来的 · 只能看」，页面没有写入控件，人能改的写一句怎样改 | 已做完 | 规则板 `CODE_FROM`、`personEntry` 的改法一行；循环板 `pluginFrom`、`changeLine`；静态检查 `tests/rules-panel-model.spec.ts` 第 16 个测试、`tests/loops-panel-model.spec.ts` 的「no file under ui/src/loops/ calls commands.execute or renders a write control」 |
| 规则板「会挡住动作的门」一组列两张清单 | 已做完 | `ui/src/rules/model.ts` 的 `gatesGroup`（编排方 2026-11-05 对规划 Q1 答 B），`tests/rules-panel-model.spec.ts:121-126` |
| 循环板上有改完文件就跑的检查器 | 已做完（条目在）；它的明细见下面 (c) | env 行出厂启用（`63388d5`），交 `env.checks-after-edit`（`src/env/loop-entry.ts`），循环板页「碰到某件事就做的」一组列它 |
| 循环板上有晨报、周报、夜间巡检 | 还在等 M7 | 这三项是 M7 运维行的条目（`operate.morning`、`operate.weekly`、`operate.patrol`，循环板设计 §5.1 第 8–10 项），`src/operate/` 不在 main |
| 两块板与上手页不出现「影子」「试运行」（人选的只记录那句除外） | 已做完 | `tests/rules-panel-model.spec.ts:290`；`personEntry` 的「这是你选的做法，不是试运行阶段」（`:252`）；循环板的固定字串过 `plainWordsIn` |
| (a) 写在代码里的规则：「启用即拦」、7 天拦下次数、最近 5 条、撤下一行照 `liftHow`；「你定的规则」里只记录的条目那一句 | 已做完 | `codeGroup`、`codeEntry`、`liftLine`（`fa3cd4a`），数据 `src/rules/view-build.ts`（`d1e1337`），`tests/rules-view.spec.ts` 与 `tests/rules-panel-model.spec.ts` |
| (b) 没有读登录密钥文件的规则 | 已做完 | `src/guard/catalog.ts` 没有 `credential-read`；`tests/rules-panel-model.spec.ts:290` 断言没有 `credential` |
| (c) 带超时的条目写超时的数与来源（四种、`held`、3 倍的核对、`capRaised`、来历、最近 5 次超时、最近 7 天超时次数）：**M4 改完文件就跑的检查** | 本线做：面板 8-1 | 数据都在 main（`timing.jsonl` 的取值行、超时行，`limits.jsonl`）；循环板页没有这一格：`Contribution.details`（`src/loops/service.ts:107`）有 env 行提供（`src/env/loop-entry.ts:63`），但 `src/loops/` 里没有任何地方调它，`buildView` 的条目也没有超时字段；`ownRules`（检查器自己的规矩，一步至多等 20 秒就在这里）同样不上页 |
| (c) 同上：规则板「你定的规则」里带脚本的规则 | 已做完到数据能给的地步 | `scriptLines` 写超时与来源（`设计里定的固定值`/`规则里写明的`）与失败做法（`fa3cd4a`）；来历与超时记录要脚本真跑过，规则板的拦路脚本在 main 上一律不跑（批准的路没有，ORCHESTRATION §16.10「脚本」一段），等同意的路 |
| (c) 同上：循环板上你加的脚本与检查条目，你定的信号检测器 | 部分本线做（面板 8-2），其余等同意的路 | 循环板人的条目今天只写「跑脚本 <路径>…」「跑项目图上「<工具>」的检查…」（`src/loops/view.ts` 的 `doesText`），没有「你 <日期> 同意的那一版」一行、超时一行、检查的命令；这几行只要条目文件与运行记录，本线做。估的秒数（`agent-estimate`）、来历与超时记录要同意的路（`loop_propose`，循环板 S5，还没建）带来估计、人同意后才跑；检测器没有写入路（main 上没有 `detector-set`，ORCHESTRATION §16.14 信号一组） |
| 带脚本的条目点开是原文 | 本线做：面板 8-2 | 规则板与循环板页都没有读脚本原文的地方（`ui/src/rules/`、`ui/src/loops/` 里没有对脚本文件的 `readBytes`）；规则设计 §9.1 写「只在人点开时读，至多 64 KiB」，读法用面板已有的 `remote.workspaceFiles.readBytes` |
| M7 合入前的检查的超时（「会挡住动作的门」一组） | 还在等 M7 | 数据是 M7 的门（E7 在 `origin/m7`） |
| (d) 额度用完、推进停住时首页「现在」一行 | 还在等 M7 | 停住原因（`execute/stopped-quota`）与读路都不在 main，任务书写明本线不做 |

## 3. 本线做的批次（按执行顺序，每批一个提交）

### 第 9 批（状态板块）：`env/timeouts`，检查的超时算一次

- 范围：把 `timingSection` 里按检查算的那部分搬进 `src/env/status.ts`（同第 4 批把 `ruleLines`、`liftLines` 搬进 `src/guard/status.ts` 的做法）：`checkTimeouts(timing, limits, nowMs)` 按检查给出这一项的事实（最近一条取值行、这一项现在生效的上限设置〔`limits.jsonl` 的最后一行，P13-01〕、取值行的全部来历、7 天内的超时与排队、最近 5 次超时）；`timeoutLines(facts, offsetMinutes)` 写晨报那几行，字不改。晨报的「检查的超时」一节改调这两个函数；env 行的状态视图在 `env/suppressions` 之外多交一条 `env/timeouts`（`audience: 'agent'`，`text` 是第一行，`detail` 是其余几行，每行至多 `STATUS_TEXT_MAX` 个码点；两份账都读不到行时不交），读的是 runner 写账的同一个项目目录（`projectHomeFor(ctx, undefined, cwd)`）。
- L2：`tests/env-status.spec.ts` 加：`timeoutLines(checkTimeouts(...))` 与晨报一节逐行相等（借 `tests/workflow.spec.ts` 已钉住的那份夹具的形状）、`env/timeouts` 经收集器读到、没有账时没有这一条、一行超长时截断且不触发收集器的告警。`tests/workflow.spec.ts` 已有的「检查的超时」测试不改期望。
- L3：探针 `env-checks-ceiling` 在 `check_limit` 之后那一步打 `hub`，检查 `env/timeouts` 在 `agent` 档里、它的几行有 `tool-1/full` 与「上限已由主 Agent 调高到 120 秒」。
- 文档：`docs/DESIGN.md` §2.6（标题与新段）、`docs/ORCHESTRATION.md` §7.5 晨报一句、`docs/HANDOFF.md` 状态板块一行。

### 面板 8-1：循环板上 M4 检查器的超时一格与它自己的规矩

- 数据：循环板的交接（`Contribution`）多一个只给页面的成员 `checks(entry, project)`：这一项此刻跑的检查，每项带名字、命令与超时（形状 `ViewCheck`，定义在 `src/loops/view.ts`，循环板不导入 `src/env/`）。env 行用第 9 批的同一个 `checkTimeouts` 照面板 §11「1.0 的对接」第 2 条的映射交：`harness` → `measured`（N、X 取 `runs`），`estimate` → `agent-estimate`（E、估的时刻、会话），`ceiling` → `ceiling`；`capped` → `held: {by: 'cap'}`；被下限抬高由这一侧按 `factor × max(runs)` 或 3×E 小于超时的数算出 `held: {by: 'floor'}`；`capRaised` 取 `limits.jsonl` 这一项最后一行（`raise` 才交）；来历是这一项全部的取值行（新的在前），超时记录是最近 5 次，另交 7 天超时次数。还没跑过的检查按检查行给：没写估计是 `ceiling`，写了估计是 `agent-estimate`，来历取图工具记下的那条估计。登记表加 `checksOf(entry, project)`（同 `actionOf` 的读法，抛错或不是数组当作没有），`buildView` 把它与条目的 `ownRules` 放进插件条目。
- 页面：`ui/src/loops/model.ts` 按面板 §4.7「超时的数与超时记录」与 §8.2 那一行写：四种来源各自的句子、下限句与上限句、3 倍的核对（差不超过 0.5 秒算相等，对不上写「没有记录：…对不上」并告警一次）、调高那一行（理由不合格时照写秒数与日期）、「最近 7 天超时 N 次」或「最近没有超时」、讲细点里的来历（「第一个值」）、最近 5 次超时与「检查器自己的规矩」；形状不对的格写「没有记录：<原因>」并告警一次，别的格照常。
- L2：`tests/loops-panel-model.spec.ts` 加面板 §10.1「1.0」一条里与这一格有关的例（四种来源、下限与上限、3 倍对不上的两种、`capRaised` 的几种、没写估计不带来历、来历与超时记录的形状）；`tests/loops-registry.spec.ts` 加 `checksOf`；`tests/env-loop-entry.spec.ts` 或 `tests/env-status.spec.ts` 加 env 一侧的映射（被上限截住、被下限抬高、调高与撤回立刻变、还没跑过）。
- L3：探针 `env-checks-ceiling` 的假循环板在 `contribute` 之后问一次 `checks`，记进日志；检查 env 一侧在真实运行时里交出 `capRaised` 与 `held: {by: 'cap'}`。循环板一侧（登记表到 `view.json`）只有 L2：现有场景里没有同时装着真循环行与带检查行的工具节点的。
- 文档：`docs/ORCHESTRATION.md` §18.4 交接一条、§18.7 页面一条、§7.5；`docs/DESIGN.md` 相关一行；`docs/HANDOFF.md` 面板一行。

### 面板 8-2：带脚本与检查的人的条目：同意的那一版、超时、命令，点开是原文

- 循环板人的条目：脚本类多一行「脚本：你 <日期> 同意的那一版」（文件对不上时写改过了、先不跑与怎样再让它跑）与超时一行（`timeoutSeconds` 或循环板的缺省 60 秒，来源写「设计里定的固定值」或「条目里写明的」，后半句「超时算没跑完，告诉主 Agent，这次的事件下次再跑；崩溃算没过」）；检查类多一行「检查：项目图上「<工具>」的命令，你 <日期> 同意的那一条」、命令原文与同样的超时一行。
- 两块板的脚本原文：讲细点展开时按项目根加条目给的路径经 `remote.workspaceFiles.readBytes` 读，至多 64 KiB，读不出写原因；不展开不读。
- L2：`tests/loops-panel-model.spec.ts`、`tests/rules-panel-model.spec.ts` 与 `tests/graph-panel-render.spec.ts` 的写法（渲染到同步的 React 替身）；静态检查仍过（不调命令、不写文件、没有按钮）。
- 文档：ORCHESTRATION §16.14、§18.7。

## 4. 每批的门禁与纪律

- 四道门串行：`npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`，各自 `cmd /c "... > .llm\logs\sh3-<批>-<道>.log 2>&1"`，退出码读 `$LASTEXITCODE`；build 不与别的门同时跑。棘轮看 `npm test` 开头 `check-lint` 的三行，不超过 73 / 18 / 1。
- 探针锁：主检出 `mkdir .llm\probe-lock`（不行试 `-2`），`owner.txt` 第一行 `wf_992ec82f32e990c0 code`，每 10 分钟内重写（重写前核对第一行），用完先停续写再删目录；30 分钟没重写才算残留。探针前后各记一次主检出 `.llm\loops\view.json` 的修改时间与 SHA-256。
- 负载下的纯计时失败先单跑该 spec 3 次再归因。
- 不改 `docs/graph`、`~/.dsh`；没有新行；文档与行为同一个提交；提交说明不带 BOM、写门禁退出码与棘轮数；只推 `origin/status-hub-3`。
