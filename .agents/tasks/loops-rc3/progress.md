# loops-rc3 progress（桌面 rc.3 两处循环板适配）

Lane: loops-rc3（worktree `.worktrees/loops-rc3`，branch `loops-rc3` @ fcffef5d）。
任务来自 desktop-l4-new 的 finding 2 与 finding 3（`.agents/tasks/desktop-l4-new/progress.md`）。

## Stage 1 — 两处根因的实读（先于编码）

读过的源（路径留档）：

- 装机 rc.3 app.asar（只读）：`C:\Users\29596\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`，
  `npx asar extract` 到临时目录 `/tmp/lr3-rc3-asar/` 后读
  `dsh/node_modules/@deepseek-ai/dsh-schedule/lib/index.js`（行号都指这个文件）。
  对照 `reference/dsh-desktop-0.2.2-rc.1/dsh-schedule/lib/index.js`（同代码族，形状一致）。
- 本仓：`src/loops/bind.ts`、`src/loops/remove.ts`、`src/loops/reminder.ts`、`src/loops/run.ts`、
  `src/loops/index.ts`、`src/shared/dsh-min.ts`、`tests/loops-bind.spec.ts`、`tests/fake-rc3.ts`。
- 文档：`docs/ORCHESTRATION.md` §18.10、`docs/HANDOFF.md` §5/§10。

### Gap 1（对账漏记已投递的运行）——根因不是 lastDelivery 形状漂移

finder 的提示（rc.3 把 lastDelivery 放外层行、板读内层 record）**不成立**，实测：

- 存储 v2 行（`scheduleTaskSchema`，index.js:1590–1606）：`{record, target?, involvedSessionIds?,
  status, createdAt?, updatedAt?, lastDelivery?, deliveryHistory?, pendingDelivery?}` ——
  lastDelivery 在外层行；`record` 本体没有 lastDelivery（`createAtScheduleRecord`:688–695 等，
  record 只有 `{id, kind, title, prompt, scheduledAt…}`）。
- 插件面 `entry(task)`（index.js:2523–2536）：**拍平** `{...record, target, involvedSessionIds,
  status, createdAt?, updatedAt?, executionActive?, deliveryFloorEndsAt?, lastDelivery?}` ——
  lastDelivery 在位时目录行**带**它；remote FaceModel（typert.remote-client.js:37–42）同样带。
  `bind.ts:438` 的 `task.lastDelivery` 看得见它。

真正的链条：rc.3（rc.1 同）在**投递提交的那一刻**就把一次性任务置 `ended` ——
`advanced()`（index.js:1435–1445）：`status: occurrence.nextScheduledAt === void 0 ? 'ended' : 'active'`，
同一次提交经 `delivered()` → `appendDelivery()`（:1048–1064）写入 lastDelivery。
于是目录里这条任务是 `status:'ended'` **且**带 lastDelivery。

而 `bind.ts` 的逐条循环里 `task?.status === 'ended'` 分支（现行 :273，c6fbf24b 起为
`'inactive'`，3667ee67 改名 `'ended'`）排在 `afterDue` 的投递分支（:438）**之前**：只标
`binding.done`、写行健康「已跑过」，**不记运行**——没有 loop-fired/loop-done、没有
`state.last`、没有 `deliveredMessageId`。`loop_note` 的运行门（run.ts `binding()` 读
`state.last`）因此拒「这一项还没有交给你的运行」；step 行回退句「Loop board reminder for
u-09699c64.」（reminder.ts `stepLine`，run undefined）与此吻合。

w2 看起来「rc.1 上好好的」的原因：w2 的冷发观察是**重复条目**（operate.morning 日、周条），
重复任务投递后仍 `active`，走 afterDue 的投递分支，运行照记。一次性条目这条路从未被走过。
本缺陷自 c6fbf24b（2026-11-01）起就存在，与 rc.1/rc.3 无关；rc.3 桌面只是第一次实跑踩到。

**修法**：`ended` 分支里，`lastDelivery.messageId !== binding.deliveredMessageId` 时先记运行
（loop-fired + loop-done `delivered`/`dsh` + `state.last` + `deliveredMessageId`）再标 done；
「已跑过」行原样。同一投递只记一次（messageId 相等即不再记）。宿主停机期间投掉的，板在
下一拍补记（晚记不漏记）。rc.1 兼容：两代宿主同形状，一处修法两边吃，不分叉。

顺带观察（不在本车道修）：状态文件丢失后，ended 的一次性任务不被认回（认回跳过 ended），
逐条循环又建一条新的——已跑过的一次性条目会再投一次。挂账给 owner。

### Gap 2（[SCHEDULE CHANGE] 通知洪水）——洪水的引擎是我们自己的孤儿清理

finder 的提示「rc.3 的 actor 跳过没了」**不准确**：rc.3 `notify()`（index.js:2541–2568）仍跳
过 actor（`sessionId === actorSessionId → continue`）。但它遍历的是**任务的 involved 集合**
（`involved()`:1919–1924 = actor ∪ target；`delivered()`:1428 再并入投递目标；`revisedTask`
:1948 每次编辑再并入编辑者）——**别的板的写**涉及我们持有者会话时，通知照到我们头上。

洪水引擎在孤儿清理（bind.ts:316–338）：凡「板形状」（标题前缀 + 提示首行）而 `bindings`
没有的任务都删——

- 插件默认条目跨项目同 id（两块板的 operate.morning 同一条提示首行），对方任务绑在**对方**
  持有者会话上 → `item !== undefined && target !== session` → `drop('moved')` 删；
- 对方下一拍发现绑定的任务没了 → 重建；每次删除经 notify 打到对方持有者会话一条
  [SCHEDULE CHANGE]，双方上下文互淹，schedule.json 峰值同时躺三条重复任务；
- `entry-gone` 路同样中招：对方人加条目（u-… id 不在本项目执行表）的任务，暖机 + 两拍后
  被 `entry-gone` 删掉。

**修法（本层根防，依据 §18.10 删除规矩的「能证明是自己建的」）**：孤儿清理只删**绑在本项目
持有者会话上**的任务。板形状而绑在别的会话（或 `new` 靶）的，是别的组合的——不删、不进
`kept`（长期共存的邻居不是「这一拍没删」，进 kept 会让行健康永远报一句假警；DSH 任务页
上两条任务各自标着目标会话，人看得懂）。绑定证明（scheduleId 在 bindings）不受影响：
move / repair / not-delivered / 持有者消失四条路的删的都是绑定任务，原样。清理里原来的
`moved` 分支随之删除——它唯一正当场景（状态文件丢失 + 主 Agent 换会话）留下的旧提醒改由
人在 DSH 任务页删（文档写明这笔账）。

**效果推演**：两块板各自只留自己的任务 → 无跨删 → 无重建 → 无变更 → 自己的写
（actor = 目标 = 持有者，involved 只有持有者一人）被 notify 的 actor 跳过 → 一条通知都
不发 → 洪水在根上断。L2 钉法：单板两例（绑外会话 + wanted 条目 → 不删不进 kept；绑外
会话 + 非 wanted 条目 → 过了 entry-gone 窗口也不删）+ 双板模拟（一块假 schedule 服务、
两个项目各自对账轮替跑，稳态后无 edit 调用、任务数 2）。

### 其余核对

- rc.3 的 `schedule/changed` 事件名、`edit` 的 `expectedUpdatedAt`/`schedule_conflict`
  语义、catalog 排序，与 2026-11-13 适配的 rc.1 面一致，无需再动。
- `tests/loops-bind.spec.ts` 现有钉不受修法影响：一次性 fired 例要**加**运行记录断言；
  duplicate 例种子绑在本会话（守卫不拦）；unclear-holder 例种子也在本会话（守卫放行后
  照走原 kept 句）。
- sibling：`.worktrees/clock-fire` 已存在（diff 只动 `src/loops/inbox.ts`），落地前 rebase。

## Stage 2 — 实现（worktree `loops-rc3`）

- Fix 1（一次性投递漏记）：`src/loops/bind.ts` 的 `ended` 分支——`lastDelivery.messageId` 没记过就先记
  loop-fired + loop-done（`delivered`/`dsh`，messageId 随记录）+ `state.last` + `deliveredMessageId`，
  再标 done；「已跑过」行原样。文件头两段说明随之改写。L2：一次性 fired 例改钉运行记录四件
  （fired×1、done delivered/dsh、state.last、deliveredMessageId）+ 第二次对账不重记。
- Fix 2（互删洪水）：孤儿清理在「板形状」判定后加一道——`targetSessionIdOf(task) !== session`
  一律跳过（不删、不进 kept）；原 sweep 的 `moved` 分支删除（绑定任务的第 2 条 move 不受影响）。
  文件头第 4 条改写。L2 新钉三例：绑外会话 + wanted 条目（不删不进 kept）、绑外会话 + 非 wanted
  条目（过 entry-gone 窗口也不删）、同一假宿主双板轮替对账十轮（两任务零删除、binding 各归各）。
- 文档同批：`docs/ORCHESTRATION.md` §18.10 三处（involved 集合的说明、删除规矩的「绑在本会话」、
  到点之后的 ended 记运行）+ §18.11 L2 清单两处；`docs/HANDOFF.md` §5 新增第 30、31 条（两 finding
  的根因更正与修法，均「已修」）。finder 提示的两处更正（lastDelivery 形状、actor 跳过）都写进条目。
- worktree 环境：`node_modules` 以 NTFS junction 指主检出；`lessons-seed.json` 以硬链接进 worktree
  （`mklink /J` 对文件 Node 读不到，`/H` 才行——记给后续 worktree 车道）。

## Stage 3 — 门禁与落地

- 第一遍门禁（rebase 前，8d68d370）：build exit 0；preflight OK（2 包 23 行）；`npm test` exit 0
  （`.llm/logs/lr3-test-1.log`，全量 0 个 not ok；首轮跑过一次 loops-script 25 例中 1 例
  gating-script 计时抖动，复跑与第二次全量都绿——FLAKE 判定，同 rules-peak-stop 先例）；棘轮
  eslint 69 / knip 18 / jscpd 1 持平；探针 `npm run probe` **620/620，exit 0**
  （`.llm/logs/lr3-probe-1.log`，工件 `%TEMP%\glm-hourness-probe-2026-11-18T01-05-31-621Z-UR2YRE`）。
  期间 clock-fire 车道的探针在 probe-lock-2 上并行（加固后的 runner 自管双槽，互不干扰）。
- rebase：clock-fire 落地（39441048 clock.ts + 2ff16348 + 09cfa9dc），main 到 09cfa9dc；
  本车道分支 rebase 到其上（62bb7d7b），无冲突（clock-fire 动 clock.ts/run.ts/inbox.ts/
  records.ts/boards.ts/view.ts 与 §18.9 侧文档；与 bind.ts 的 ended 分支、sweep 守卫不相交）。
- 第二遍门禁（rebase 后，62bb7d7b）：build exit 0；preflight OK；`npm test` exit 0
  （`.llm/logs/lr3-test-2.log`，0 个 not ok；棘轮 69/18/1 持平）；探针复跑见 lr3-probe-2.log。
- worktree 备忘：`node_modules` 用 junction；`lessons-seed.json` 用硬链接（/J 对文件 Node 读不到）。
