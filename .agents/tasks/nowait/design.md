# 主会话不长等（超代理借用，机制 2）设计

版本：0.1（2026-11-10）
状态：草案，待人拍板。
来源：人 2026-11-10 批准的借用清单机制 2。原型 `dsh-superagent-prototype`（commit `8c32a9d`，本机克隆在 `C:\Users\29596\.agents-proto\dsh-superagent-prototype\`）；自家代码与宿主参考源码的引用以 nowait worktree（基于 origin/main `cc317412`）为准。

## 1. 原型机制：借的是什么

原型的规则板（`docs/003-execution.md`、`prompts/orchestrator.md`、`src/app/sessions.ts`）三层落地「主会话（router）不做长活、不占长等」：

1. 预设层：主 Session 用 `dsh-superagent-router` 预设，前台 shell 命令与 job 等待都压到 5 秒（`cordis.patch.yml:125-172`：shell `timeoutMs: 5000` 在 :149、:155，`tool-jobs` `waitTimeoutMs/maxWaitTimeoutMs: 5000` 在 :171-172）。执行器（worker）预设同款 5 秒（:20-74），用途是「长命令不挡人的消息，下一步就能收到」（`docs/003-execution.md:27`）。
2. 守卫层：主 Session 的工具守卫 `noWait`（`src/app/sessions.ts:71-86`）拒绝三类调用，拒绝语就是正路（:63-68）——bash 命令含 `sleep` 或点名 `timeoutMs > 30s`、`standard` 预设下不带超时的前台命令（提示它给 timeout 或 `run_in_background`）、`job_output` 的 `wait: true` 超过 5 秒。守卫只装在主 Session（:262-264 `if (master)`）。
3. 提示词层：orchestrator 的一句「Worker reports, follow_up notices, new candidates and a background job's end, with its output, arrive by themselves as messages: never wait for them with sleep, polling or job waits; end the turn when nothing is left to do.」（`prompts/orchestrator.md:16`）。

等待变成通知的另一半在宿主已有：回合结束时还活着的后台 job 与 subagent 让 ticket 保持 working，job 完成把结果带回同一 worker slot（`docs/003-execution.md:31-35`）；整批后台活每回合后至多 30 分钟。

## 2. 等待盘点：主 Agent 今天在哪里等

逐处核对主 Agent（main agent 会话）的等待面。行的判法以「主会话的回合是否被一次长等待占住」为准；worker 侧的等待不算主会话的等待，但照列，因为它们与原型的差别要交代清楚。

| # | 等在哪 | 最长多久 | 引用 | 原型的判法 | 我们的判法 |
| --- | --- | --- | --- | --- | --- |
| 1 | `submit_plan` 的审批等待 | 30 分钟 | `src/execute/requests.ts:36`（`PLAN_WAIT_MS`）、:91-105（`awaitAnswer`）、:319（held call） | 不违背。原型的 `noWait` 守卫只装主 Session（`sessions.ts:262`）；等待在 worker 的调用里，主 Agent 随时可答 | **保留**。E5 的理由成立（requests.ts:6-10）：带 `outputSchema` 的派发回合不带结构化结果就按 error 结算、交回丢失，等待必须活在一个工具调用里，worker 回合因此保持打开、驱动器不抢下一拍。有界（30 分钟）、超时有预案（`PLAN_TIMEOUT_HINT`，:205）与指标（`waitedMs`，:321）。与原型的真实差别照实记：原型的 ticket 模型让 worker 以 report 收尾回合、等审是面板上的 stage（`docs/003-execution.md:12-14`），我们用 held call 把批准带进结构化交回；这是设计差异，不是违规 |
| 2 | `ask_main` 的答复等待 | 20 分钟 | `src/execute/requests.ts:37`（`ASK_WAIT_MS`）、:354、:386 | 同上 | **保留**。同 E5；超时按 worker 自报的假设继续（:206、:392） |
| 3 | `dispatch_task` | 不等 | `src/execute/dispatch.ts:614`（`registerAttempt`）与 :615-622（交回用 `void (…).then(...)` 挂在 activation 上，结算时处理） | 同构：派发即回，worker slot 并发 | **已合规** |
| 4 | goal 轮 | 不等 | 宿主 `reference/deepseek-harness/packages/goal/goal-round-driver/src/index.ts:111-118`（`readyToDrive` 要求 agent `idle`）、:145-148（`drive` 在静默时处理、至多预留一个下一轮） | 同构：router 的每轮是被消息唤醒的回合 | **已合规**。驱动器只在静默时驱动，一轮一个请求；requests.ts:191 说的「等那个 worker 再开一轮」是 idle 时的顺序预留，不是调用内的阻塞等待 |
| 5 | 高峰停档的等待单 | 高峰窗口内，至结束时刻 | `src/rules/builtin.ts:62-68`（stop 档排的是子代理的调用，filter `role: ['subagent']`）、:80（唯一例外：派 GLM 子代理的 dispatch 在派发者会话排队，主 Agent 也会中）、`src/rules/index.ts:104-106`（`PASS_MS = 5_000` 重判周期）、:465（每 5 秒重判） | 原型哲学允许：只有写下的规则才拦（`docs/000-philosophy.md:11`） | **保留**。有界（高峰窗口）、解除即唤醒（5 秒重判清单并 steer 运行中的 agent，ORCHESTRATION.md §16.12 验证段）、主 Agent 其余调用照常（`tests/rules-row.spec.ts` 钉住三档下主 Agent 调用照常执行） |
| 6 | 问人（`propose_to_human`、`await_human`） | 不等 | `src/design/propose.ts:123`（问完「end your turn」，人的回答是新消息）；`src/execute/drive.ts:1148-1179`（`await_human` 停 drive，goal 转 blocked，人定后续做） | 同构：等待变通知（`prompts/orchestrator.md:16` 的前半句就是这个形状） | **已合规**。人的输入本来就是回合之间的事 |
| 7 | 压缩 | 不占调用 | 宿主在请求边界做（compaction-basic，`docs/DEVELOPMENT.md` §3 探针场景同款组合） | 无对应 | **不算等待** |
| 8 | 主 Agent 直接跑的长 shell 与 job 等待 | 前台命令：宿主组合定（`standard` 预设 60 秒转后台，原型 patch 注释 `cordis.patch.yml:15-19`）；`job_output` 等待：默认 30 秒、上限 10 分钟（`reference/deepseek-harness/packages/jobs/tool-jobs/src/index.ts:44-46`） | 宿主有后台机制：`run_in_background`（`packages/shell/tool-bash/src/index.ts:39-42`，默认暴露）与 `promoteOnTimeout`（:45-49，默认 true，超时前台命令转后台 job 继续跑）；job 完成在会话内通知、忙等的 owner 被注入（tool-jobs :319、:355）、超时的等待返回 job 状态而非错误（:435）。但我们没有任何东西把主 Agent 往后台指：提示词没有一句，守卫没有一条 | **拒绝**：router 5 秒 shell、5 秒 job 等、拒 `sleep`（`sessions.ts:69-86`；patch :149、:155、:171-172） | **唯一缺口**。主 Agent 可以让一次十分钟的前台 build 占住回合（宿主会在超时点转后台，但那 60 秒以上的延迟与之后 model 可能连发的 `wait: true` 长等仍在回合里），也可以拒绝不了自己写 `sleep 300`。机制宿主全有，缺的是指向它的规范与拦截 |

盘点结论：**已大体合规**。七处等待里六处要么不在主会话（worker 侧、有界、超时有预案），要么本来就是「等待变通知」的形状（问人、goal 轮、派发）。原型规则与本仓请求工具的在调用内等待不矛盾——原型的守卫和预设都只压主 Session 的 shell 与 job 等待，管不到 worker 的请求等待。真正的缺口只有一个：主 Agent 直接跑的长 shell 与长 job 等待没有任何规范去指后台。

## 3. 设计改动（0.1 提议）

对齐原型三层里的两层，不动预设层：

1. **守卫一条（主体）**：按 `src/guard/main-agent-rules.ts` 的表模式加一条 code rule（subjects `main-agent`，enforcement `deny`），拦主 Agent 的三类调用，拒绝语给正路：
   - bash/pwsh 命令含命令位上的 `sleep`（原型的 `SLEEP` 正则形状，`sessions.ts:70`）；
   - bash/pwsh 点名 `timeoutMs > 30_000`（原型 router 守卫的值，`sessions.ts:81`）；
   - `job_output` 的 `wait: true` 且 `timeout_ms > 5_000`（原型 :84）。
   拒绝语文案取原型 `NO_WAIT` 的意思：「结果会自己作为消息到来；结束回合，别用等待占住它」。拒绝进违规流水，带规则 id，可 `/rules lift` 类撤下（§3.2 第 3 条的自带拦截从行启用日起生效）。
2. **提示词一句（伴随）**：`DRIVE_BODY`（`src/execute/drive.ts:104`）加一句：长命令用 `run_in_background` 放后台，job 的结果会作为通知到来，不 sleep、不轮询、不用长 `wait` 占住回合；回合里没有别的事就收尾。原型同款句在 `prompts/orchestrator.md:16`。
3. **不动**：请求工具的 30/20 分钟等待（E5）、高峰等待单、派发与 goal 轮驱动、问人路径、预设层（不自建 agent preset——桌面主 Agent 的会话用宿主预设，改组合影响整会话，收益与代价不成比例，留给开放问题 3）。

新行默认 `disabled: true`，L3 验证通过后启用；guard 与 drive 的改动按 `DEVELOPMENT.md` §12 规则跑 probe（`glm-design-main` 系场景覆盖主 Agent 工具面）。

## 4. 开放问题（待人拍板）

1. **阈值取哪一档**：shell 的拒绝线用原型 router 守卫的 30 秒（0.1 建议；只拦点名要长等的调用，`git status` 一类短命令不受影响），还是预设级的 5 秒（会把所有前台命令在 5 秒转后台——那是改宿主组合的事，不是我们行内的一条守卫）？job 等待同问（5 秒 vs 默认 30 秒）。
2. **`promoteOnTimeout` 已经把超时前台转后台**，守卫还要不要拦「点名长超时」：拦的理由是那 60 秒以上的延迟与占住的回合本身（原型的判词「a waiting step holds back the next」，`sessions.ts:64`）；不拦的理由是宿主已经兜底。0.1 建议拦，与原型一致。
3. **要不要连 worker 一起管**：worker 的 shell 已被宿主 `standard` 预设 60 秒转后台（原型 patch 注释），等待单已经是通知形态；0.1 只管主 Agent。若要 worker 同款 5 秒，得给派发指定预设或改组合，成本另算。
4. **等待要不要进指标**：`execute.plan`/`execute.ask` 已带 `waitedMs`（requests.ts:321、:387）；守卫拒绝自然进违规流水。是否再为主 Agent 的长 shell 记一条指标（供 §3.2 第 5 条的减负度量），0.1 不做，等度量方案一起定。
