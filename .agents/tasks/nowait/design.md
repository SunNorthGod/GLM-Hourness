# 主会话不长等（超代理借用，机制 2）设计

版本：0.2（2026-11-13）。
状态：四岔已拍板（question-41，2026-11-13，全按推荐，§4）；引用对照 main `8a647ef4` 逐条复核完毕（漂移清单 §0），实施计划见 §5。实现归后继批次，本稿不开工。
来源：人 2026-11-10 批准的借用清单机制 2。原型 `dsh-superagent-prototype`（commit `8c32a9d`，本机克隆在 `C:\Users\29596\.agents-proto\dsh-superagent-prototype\`，0.2 复核时 HEAD 未动）；自家代码与宿主参考源码的引用以 nowait worktree（已并入 origin/main `8a647ef4`，merge `014e20fe`）为准；宿主参考源码经主检出 `reference/deepseek-harness` 读（worktree 无 `reference/`，`DEVELOPMENT.md` §9）。

## 0. 对照 8a647ef4 的复核（0.2 新增）

逐条实读核对 0.1 的全部 `file:line` 引用。盘点结论与设计改动一条都没有被推翻；漂移全部是行号或周边形状：

| 0.1 引用 | 8a647ef4 现状 | 定性 |
| --- | --- | --- |
| `main-agent-rules.ts` 的表模式 | 表在位：`MainAgentRule` `{id, title, enforcement, subjects, step}`（:12-21），`MAIN_AGENT_RULES` 九行（:33-43）。两个实现级事实 0.1 没写：`enforcement` 联合体只有 `'deny' | 'deny-when-no-snapshot'`（新规则用 `'deny'`，无碍）；`step` 是闭联合体 `3 | 4 | 5 | 6 | 8`（M3 步号，注释写明用途是 addendum 与测试）——新规则要扩这个联合体，进 §5 计划 | 无漂移＋两个实现细节 |
| `drive.ts:104` DRIVE_BODY | 逐字仍在 :104；E 系列 drive tiers 改的是两级循环的退回处理（`src/execute/tiers.ts`，`drive.ts:10-11`、`:140`、`:427-447`），没碰 DRIVE_BODY；`await_human` 现在在 :1148-1184（0.1 引 :1148-1179，块调用在 :1176） | 行号微漂，插入点成立 |
| `requests.ts:36/:37/:91-105/:191/:205/:206/:319/:321/:354/:386/:387/:392` | 全部逐位核对无漂移（`PLAN_WAIT_MS` :36、`ASK_WAIT_MS` :37、`awaitAnswer` :91、E5 头注 :6-10、驱动器等待 worker 的说明 :191、两个超时 hint :205-206、计划等待 :319 与 `waitedMs` :321、`ask_main` 工具描述 :354、答复等待 :386-387、超时记录 :392） | 无漂移 |
| `dispatch.ts:614` registerAttempt、`:615-622` void then | :614、:615-624 | ±2 行号 |
| goal-round-driver `:111-118` readyToDrive、`:145-148` drive | :110-117、:146-148 | ±1 行号，判法不变（idle 才驱动、至多预留一个下一轮） |
| tool-bash `:39-42` run_in_background、`:45-49` promoteOnTimeout | :38-43、:44-49（两处都是配置项的 doc 注释范围） | 无实质漂移 |
| tool-jobs `:44-46` 默认 30 秒/上限 10 分钟、`:319` 会话内通知、`:355` 忙等 owner 注入、`:435` 超时返回 job 状态 | :45-46、:315-320（系统提示词节）、:354-357、:435 | ±行号，语义全对 |
| `rules/builtin.ts:62-68` stop 档 filter、`:80` 派发例外 | 规则 :63-78、注释 :62；filter 形状从 `role: ['subagent']` 变为 `role: { in: ['subagent'] }`（:68）；派发例外注释仍 :80 | 形状漂移（行为同） |
| `rules/index.ts:104-106` PASS_MS、`:465` 每 5 秒重判 | `PASS_MS = 5_000` :105、`:104-106` ✓；重判的 `every(…, PASS_MS)` 现在在 :464 | ±1 行号 |
| `propose.ts:123` 问完「end your turn」 | 逐字在 :123（`showMessage`） | 无漂移 |
| 原型引用（patch `:15-19`、`:20-74`、`:149`、`:155`、`:171-172`；sessions.ts `:63-68`、`:70`、`:71-86`、`:81`、`:84`、`:262-264`；orchestrator.md `:16`；003 `:12-14`、`:27`、`:31-35`；000 `:11`） | 克隆 HEAD 仍 `8c32a9d`，逐位核对全部成立（`SLEEP` 正则 :70、30 秒判 :81、5 秒判 :84、`if (master)` :262） | 无漂移 |
| rc.1 的 `ctx.tools.execute` 批量形状（0.1 未引，本次任务补核） | 已实读核实：rc.1 的 `ctx.tools.execute` 收**调用批量**（`src/shared/dsh-min.ts:123-139` `ToolBatchExecuteInput.calls`，face 迁移 batch A 的契约），而守卫的接缝是**逐调用**的 `tools/pre-execute` waterfall（`src/guard/index.ts:4-6`；载荷 `ToolExecutionPayload` 按调用携带 callId 与参数，`dsh-min.ts:158-171`，注释写明 createExecution 为 pre-execute、body、post-execute 各建同一对象）——批量形状不影响守卫对 bash/job 调用的检查，设计判断成立 | 已核实，§2 收进正文 |

## 1. 原型机制：借的是什么

原型的规则板（`docs/003-execution.md`、`prompts/orchestrator.md`、`src/app/sessions.ts`）三层落地「主会话（router）不做长活、不占长等」：

1. 预设层：主 Session 用 `dsh-superagent-router` 预设，前台 shell 命令与 job 等待都压到 5 秒（`cordis.patch.yml`：shell `timeoutMs: 5000` 在 :149、:155，`tool-jobs` `waitTimeoutMs/maxWaitTimeoutMs: 5000` 在 :171-172）。执行器（worker）预设同款 5 秒（:20-74），用途是「长命令不挡人的消息，下一步就能收到」（`docs/003-execution.md:27`）。
2. 守卫层：主 Session 的工具守卫 `noWait`（`src/app/sessions.ts:75-86`）拒绝三类调用，拒绝语就是正路（:63-64）——bash 命令含命令位上的 `sleep`（正则 `SLEEP` 在 :70）或点名 `timeoutMs > 30s`（:81）、`standard` 预设下不带超时的前台命令（提示它给 timeout 或 `run_in_background`，:66-67 的 DEFAULT_WAIT）、`job_output` 的 `wait: true` 超过 5 秒（:84）。守卫只装在主 Session（:262-264 `if (master)`）。
3. 提示词层：orchestrator 的一句「Worker reports, follow_up notices, new candidates and a background job's end, with its output, arrive by themselves as messages: never wait for them with sleep, polling or job waits; end the turn when nothing is left to do.」（`prompts/orchestrator.md:16`）。

等待变成通知的另一半在宿主已有：回合结束时还活着的后台 job 与 subagent 让 ticket 保持 working，job 完成把结果带回同一 worker slot（`docs/003-execution.md:31-35`）；整批后台活每回合后至多 30 分钟。

## 2. 等待盘点：主 Agent 今天在哪里等

逐处核对主 Agent（main agent 会话）的等待面（0.2 按左列行号已复核）。行的判法以「主会话的回合是否被一次长等待占住」为准；worker 侧的等待不算主会话的等待，但照列，因为它们与原型的差别要交代清楚。

| # | 等在哪 | 最长多久 | 引用（8a647ef4） | 原型的判法 | 我们的判法 |
| --- | --- | --- | --- | --- | --- |
| 1 | `submit_plan` 的审批等待 | 30 分钟 | `src/execute/requests.ts:36`（`PLAN_WAIT_MS`）、:91-105（`awaitAnswer`）、:319（held call） | 不违背。原型的 `noWait` 守卫只装主 Session（`sessions.ts:262`）；等待在 worker 的调用里，主 Agent 随时可答 | **保留**。E5 的理由成立（requests.ts:6-10）：带 `outputSchema` 的派发回合不带结构化结果就按 error 结算、交回丢失，等待必须活在一个工具调用里，worker 回合因此保持打开、驱动器不抢下一拍。有界（30 分钟）、超时有预案（`PLAN_TIMEOUT_HINT`，:205）与指标（`waitedMs`，:321）。与原型的真实差别照实记：原型的 ticket 模型让 worker 以 report 收尾回合、等审是面板上的 stage（`docs/003-execution.md:12-14`），我们用 held call 把批准带进结构化交回；这是设计差异，不是违规 |
| 2 | `ask_main` 的答复等待 | 20 分钟 | `src/execute/requests.ts:37`（`ASK_WAIT_MS`）、:354、:386 | 同上 | **保留**。同 E5；超时按 worker 自报的假设继续（:206、:392） |
| 3 | `dispatch_task` | 不等 | `src/execute/dispatch.ts:614`（`registerAttempt`）与 :615-624（交回用 `void (…).then(...)` 挂在 activation 上，结算时处理） | 同构：派发即回，worker slot 并发 | **已合规** |
| 4 | goal 轮 | 不等 | 宿主 `reference/deepseek-harness/packages/goal/goal-round-driver/src/index.ts:110-117`（`readyToDrive` 要求 agent `idle`）、:146-148（`drive` 在静默时处理、至多预留一个下一轮） | 同构：router 的每轮是被消息唤醒的回合 | **已合规**。驱动器只在静默时驱动，一轮一个请求；requests.ts:191 说的「等那个 worker 再开一轮」是 idle 时的顺序预留，不是调用内的阻塞等待 |
| 5 | 高峰停档的等待单 | 高峰窗口内，至结束时刻 | `src/rules/builtin.ts:63-78`（stop 档排的是子代理的调用，filter `role: { in: ['subagent'] }` 在 :68）、:80（唯一例外：派 GLM 子代理的 dispatch 在派发者会话排队，主 Agent 也会中）、`src/rules/index.ts:105`（`PASS_MS = 5_000` 重判周期）、:464（每 5 秒重判） | 原型哲学允许：只有写下的规则才拦（`docs/000-philosophy.md:11`） | **保留**。有界（高峰窗口）、解除即唤醒（5 秒重判清单并 steer 运行中的 agent，ORCHESTRATION.md §16.12 验证段）、主 Agent 其余调用照常（`tests/rules-row.spec.ts` 钉住三档下主 Agent 调用照常执行） |
| 6 | 问人（`propose_to_human`、`await_human`） | 不等 | `src/design/propose.ts:123`（问完「end your turn」，人的回答是新消息）；`src/execute/drive.ts:1148-1184`（`await_human` 停 drive，goal 转 blocked，人定后续做） | 同构：等待变通知（`prompts/orchestrator.md:16` 的前半句就是这个形状） | **已合规**。人的输入本来就是回合之间的事 |
| 7 | 压缩 | 不占调用 | 宿主在请求边界做（compaction-basic，`docs/DEVELOPMENT.md` §3 探针场景同款组合） | 无对应 | **不算等待** |
| 8 | 主 Agent 直接跑的长 shell 与 job 等待 | 前台命令：宿主组合定（`standard` 预设 60 秒转后台，原型 patch 注释 `cordis.patch.yml:15-19`）；`job_output` 等待：默认 30 秒、上限 10 分钟（`reference/deepseek-harness/packages/jobs/tool-jobs/src/index.ts:45-46`） | 宿主有后台机制：`run_in_background`（`packages/shell/tool-bash/src/index.ts:38-43`，默认暴露）与 `promoteOnTimeout`（:44-49，默认 true，超时前台命令转后台 job 继续跑）；job 完成在会话内通知（tool-jobs :315-320 的系统提示词节）、忙等的 owner 被注入（:354-357）、超时的等待返回 job 状态而非错误（:435）。但我们没有任何东西把主 Agent 往后台指：提示词没有一句，守卫没有一条 | **拒绝**：router 5 秒 shell、5 秒 job 等、拒 `sleep`（`sessions.ts:75-86`；patch :149、:155、:171-172） | **唯一缺口**。主 Agent 可以让一次十分钟的前台 build 占住回合（宿主会在超时点转后台，但那 60 秒以上的延迟与之后 model 可能连发的 `wait: true` 长等仍在回合里），也可以拒绝不了自己写 `sleep 300`。机制宿主全有，缺的是指向它的规范与拦截 |

盘点结论（0.2 复核后不变）：**已大体合规**。七处等待里六处要么不在主会话（worker 侧、有界、超时有预案），要么本来就是「等待变通知」的形状（问人、goal 轮、派发）。原型规则与本仓请求工具的在调用内等待不矛盾——原型的守卫和预设都只压主 Session 的 shell 与 job 等待，管不到 worker 的请求等待。真正的缺口只有一个：主 Agent 直接跑的长 shell 与长 job 等待没有任何规范去指后台。

rc.1 的批量执行器不影响缺口判定：`ctx.tools.execute` 的批量形状（face 迁移 batch A，`src/shared/dsh-min.ts:123-139`）是执行器一侧的 API；守卫在 `tools/pre-execute` 逐调用判（`src/guard/index.ts:4-6`、`dsh-min.ts:158-171`），批量里每个 bash/job 调用各过一次 waterfall，照常可拒。批量只在「一个回合并发多个调用」时意味着守卫的拒绝也是逐调用的——一条命令被拒，同批其余调用照常执行，与单调用语义一致。

## 3. 设计改动（0.2 收口）

对齐原型三层里的两层，不动预设层：

1. **守卫一条（主体）**：按 `src/guard/main-agent-rules.ts` 的表模式加一条 code rule（`MainAgentRule` 行，subjects `main-agent`，enforcement `deny`），拦主 Agent 的三类调用，拒绝语给正路：
   - bash/pwsh 命令含命令位上的 `sleep`（原型的 `SLEEP` 正则形状，`sessions.ts:70`）——**已拍板（Q1）**：阈值取原型 router 守卫的值，shell 点名 `timeoutMs > 30_000`（:81）才拦，job 等待线取 5 秒（:84）；
   - bash/pwsh 点名 `timeoutMs > 30_000`——**已拍板（Q2）**：拦。`promoteOnTimeout` 已把超时前台转后台，但那 60 秒以上的延迟与占住的回合本身是要拦的东西（原型判词「a waiting step holds back the next」）；不带超时的前台命令不拦（宿主兜底，原型的 DEFAULT_WAIT 提示不搬）；
   - `job_output` 的 `wait: true` 且 `timeout_ms > 5_000`（原型 :84）。
   拒绝语文案取原型 `NO_WAIT` 的意思：「结果会自己作为消息到来；结束回合，别用等待占住它」。拒绝进违规流水，带规则 id；规则随 `design:<id>` 进规则板目录（`src/rules/builtin.ts:139` 的映射），`/rules lift design:<id>` 是现成的单规则撤下路径。
   **范围（Q3 已拍板）**：只管主 Agent（subjects `main-agent`）；worker 与普通子会话的 shell/job 调用不判。
2. **提示词一句（伴随）**：`DRIVE_BODY`（`src/execute/drive.ts:104`，逐字仍在位）加一句：长命令用 `run_in_background` 放后台，job 的结果会作为通知到来，不 sleep、不轮询、不用长 `wait` 占住回合；回合里没有别的事就收尾。原型同款句在 `prompts/orchestrator.md:16`。
3. **不动**：请求工具的 30/20 分钟等待（E5）、高峰等待单、派发与 goal 轮驱动、问人路径、预设层（不自建 agent preset——桌面主 Agent 的会话用宿主预设，改组合影响整会话，收益与代价不成比例）。
4. **指标（Q4 已拍板）**：不加。`execute.plan`/`execute.ask` 已带 `waitedMs`（requests.ts:321、:387）；守卫拒绝自然进违规流水，主 Agent 的长 shell 不另记指标，等 §减负度量的方案一起定。

行层面的事实（0.2 改正 0.1 的说法）：这不是新行——守卫规则是 `glm-hourness/design` 行现装的九条主 Agent 规则之外的第十条（`installMainAgentRules` 在 `src/design/index.ts:562` 装），提示词改动在 `glm-hourness/execute` 行。DEVELOPMENT §5.1 的「新行默认 disabled」不适用；先例一致：既有九条规则都无行配置开关、随行生效，灰度靠 `/rules lift design:<id>`。合入前按 §1.1 的 L3 行跑探针。

## 4. 已定的事项（0.1 §4 的四岔，2026-11-13 人按推荐拍板，question-41）

| # | 问题 | 决定 |
| --- | --- | --- |
| Q1 | 阈值取哪一档 | shell 的拒绝线 30 秒（只拦点名要长等的调用，`git status` 一类短命令不受影响），job 等待线 5 秒。预设级 5 秒（改宿主组合）否决 |
| Q2 | `promoteOnTimeout` 已兜底，还要不要拦「点名长超时」 | 拦，与原型一致：占住的回合与那 60 秒以上的延迟本身就是要拦的东西；不带超时的前台命令不拦 |
| Q3 | 要不要连 worker 一起管 | 只管主 Agent。worker 的 shell 已被宿主 `standard` 预设 60 秒转后台，等待单已是通知形态；worker 同款 5 秒要改派发预设或组合，成本另算，不做 |
| Q4 | 等待要不要进指标 | 不加。守卫拒绝进违规流水已够；度量方案另定 |

## 5. 实施计划（0.2 新增）

两个批次，每个独立可合入；合入前过 L1（`npm run build` + `npm run preflight`）与 L2（`npm test`），两批都碰 DSH 运行时的接缝（guard 的 pre-execute、drive 的提示词），按 DEVELOPMENT §1.1 的 L3 行各跑一轮探针。不新增行、不改 profile。

### N1 守卫规则

- 文件：`src/guard/main-agent-rules.ts`——`MainAgentRule.step` 联合体加一个本批次的字面量（字段注释写明用途是 addendum 与测试，扩大联合体保持文档价值）；`MAIN_AGENT_RULES` 加一行 `{ id: NO_WAIT_RULE, title: <一行中文>, enforcement: 'deny', subjects: 'main-agent', step: <新字面量> }`，`NO_WAIT_RULE = 'main-agent-no-wait'`。规则板目录自动收录（`builtin.ts:139` 的 `design:<id>` 映射），无需改 rules 半。
- 文件：`src/guard/main-agent.ts`——新 `GuardRule` 构造器（与 `mainAgentNoWrite` :82-91 同形，`detect(call, face)`）：命令文本经 `shellCommandOf`（`src/guard/rules.ts:129`，带方言表）取，`SLEEP` 式命令位正则判 sleep；`timeoutMs` 参数数值 > 30_000 判长等；`job_output` 的 `wait: true` 且 `timeout_ms > 5_000` 判长等。拒绝语四件套（fact / violation / rightPath / exception）取原型 `NO_WAIT` 的意思，rightPath 指名 `run_in_background` 与「结束回合」。subjects 由 `installMainAgentRules` 现有的 `isMainAgent` 判，不新增机制。
- L2：`tests/design-guard.spec.ts` 扩（main-agent 规则的既有家）——四条拒绝路径各一例（命令位 `sleep`、`timeoutMs: 120000`、`job_output wait:true timeout_ms:10000`、三者组合）；放行路径（短命令、`run_in_background: true`、不带 `wait` 的 `job_output`、worker 会话同调用放行、非 main-agent 会话放行）；拒绝记录进违规流水带规则 id；`design:main-agent-no-wait` 出现在规则板目录且可 lift。pwsh 方言与 bash 各至少一例（守卫方言表的两路）。
- 合同面（已实读核实）：`tests/contracts.spec.ts:248` 断言 `MAIN_AGENT_RULES.length === 9`（「the main agent's nine rules are unchanged」，变更探测器），第十行使它按设计变红，同批把断言改到 10；目录映射的核对（:152-156）对每行自动生效，不改。

### N2 提示词一句

- 文件：`src/execute/drive.ts`——`DRIVE_BODY`（:104）模板串加一句（英文，与 §3.2 的原型句同义）。句子落在 goal objective 里，随目标轮进主 Agent 的系统提示词；`SPLIT_SENTENCE`（:105）与两级循环（tiers）不碰。
- L2：`tests/execute-drive.spec.ts` 扩——objectiveOf 的产出含新句；句在 2000 字符截断下存活次序合理（截断切的是 `Not in scope` 优先，正文句不先没）。

### 探针（L3，每批一轮）

场景加在主 Agent 模式的探针组上（`glm-design-main` 与 `non-glm-design-main` 已覆盖主 Agent 工具面，DEVELOPMENT §3 第 4 步同款组合），钉五条：

1. **sleep denied**：主 Agent 会话发命令位带 `sleep 30` 的 shell 调用 → 工具结果是被拒的四件套纠偏，违规流水多一行 `main-agent-no-wait`。
2. **long-timeout denied**：主 Agent 会话发 `timeoutMs: 120000` 的前台命令 → 拒，同上。
3. **job wait denied**：主 Agent 会话发 `job_output {wait: true, timeout_ms: 10000}` → 拒，同上。
4. **short allowed**：主 Agent 会话发 `git status`（无 `timeoutMs`）→ 照常执行；worker 子会话发同类长调用 → 照常执行（Q3 的范围钉住）。
5. **prompt sentence**：`glm-design-main` 记录的某个请求里，goal 轮的系统提示词含新句（N2 合入后钉）；lift 路径：覆盖层 `/rules lift design:main-agent-no-wait` 后同类调用放行。

### 风险

1. **命令位正则的误伤**：`sleep` 出现在参数或字符串里（`grep sleep src/`）不该拦——原型的 `SLEEP` 正则只认命令位，本稿照搬；L2 与探针各钉一条「参数里的 sleep 放行」。pwsh 的命令位语法与 bash 不同，正则按方言分（`shellCommandOf` 已返回方言表），实现时两方言分别钉。
2. **阈值抱怨**：30 秒/5 秒是拍的值，真实使用里可能有合理长等（本仓探针场景自己就有 60 秒的 shell）。撤下路径现成（`/rules lift design:main-agent-no-wait`）；若日志显示高频 lift，再议阈值或白名单，不在 v1 做。
3. **与执行边界的交互**：主 Agent 的执行边界规则（no-write 等）与 no-wait 可能同调用双中——拒绝优先级按现有 waterfall 顺序，先到的先拒；无机制冲突，L2 钉一条组合调用。
4. **提示词预算**：DRIVE_BODY 加一句，objective 上限 2000 字符不变；长目标的截断次序已有测试习惯（切 `Not in scope` 先），新句放正文末尾不改变优先序。
5. **原型的 DEFAULT_WAIT 不搬**：`standard` 预设下不带超时的前台命令不拦（Q2 拍板）——这意味着「忘了写超时」的 60 秒延迟仍在回合里，是接受的残余风险；宿主 `promoteOnTimeout` 兜底把长命令转后台，回合损失有上界。
