# loops-sweep-churn lane progress

Desktop L4 rc.3 batch observation 3 (持臂/拆臂的拍上清理失败刷屏 + 板页 16 条重复行，
事后无存活孤儿)。repo main @ `2818d130`，本车道分支 `loops-churn`。

## 复现（桌面证据实读，只读 `%TEMP%\l4rc3\` 与 `.llm/l4rc3/`）

`desktop-l4-rc3/progress.md` 尚未落盘，本车道直接实读了证据原件：

- 时间线（UTC，本地 = UTC+8）：18:11:18 `/wish`（ws-d，持臂，holder 记录写盘）；
  18:12:12.722 板第一次读到 holder ok，对账建任务（**风暴起点**）；18:22:24
  `/wish off`（ws-d，`releaseHolder` 删 holder 记录文件，`src/graph/main-agent-holder.ts:147`）；
  18:23:12 板记 `loop-holder none/no-record`（noRecordTwice 第一次）；18:24:12
  第二次成立，item 0 删绑定任务（**拆臂**）。
- 18:12:12.7–13.3（约 350 ms，一拍之内）：
  `%TEMP%/l4rc3/ws-d/.llm/metrics/events-2026-11-18.jsonl` 里 `loop-task-delete`
  80 条、`why='duplicate'`，`deleted` 真假交错；`removed-tasks.jsonl` 140 行，
  其中 `schedule-a90ed09…`（晨报）同一条任务被尝试删 14 次。operate.morning 建 2 条、
  operate.patrol 7 条、operate.weekly 5 条（upd 全落在 18:12:12.741–.832）。
- 18:24:12.422–12.470：`no-holder` 删除 10 条记录，每条任务 1–4 次尝试，
  先真后假（patrol 4 次：T,F,F,F）。
- 行健康（`.llm/l4rc3/ws-d-glmstatus.txt`）：loops 行里「有 1/2/3/4/5/6/7/9/10/11
  条 DSH 提醒这一拍没删」十行并存，外加「还没读到主 Agent 的记录，再看一拍才动
  那几条提醒」——后者在 noRecordTwice 早已通过之后仍在。
- 事后无孤儿：ws-d `state.json` 终态 `bindings: {}`；removed-tasks 收录全部 15 个
  建过的 scheduleId。DCE（自动化任务页）无存活孤儿 ✓。

## 根因（两个，缺陷，均已修）

1. **并发对账**（主根）：`settleTasks` 不进拍链。对账有四条路——钟拍（runBeat，
   在 `beatChain` 上）、`schedule/changed` 监听器、`workspace/session-stop` 监听器、
   步前对账——只有钟拍串行；`schedule/changed` 在宿主每次任务写后发，于是拍的
   create 触发新的对账，新对账读旧 catalog、看不到在途 create 的绑定，又 create
   → 同一条目多条任务；后续对账把「没绑定的」按 `duplicate` 删，删又触发对账……
   拆臂侧同理：成功的删触发对账，级联的对账拿着提交前的 catalog 重试同一条 id，
   宿主答 `schedule_not_found` → `deleted:false` 记录一条，这就是「删了但宿主报
   失败」与「重试风暴」的真相（brief 的三选一：两个都对，且是同一个根）。
2. **行健康的逐拍行只增不清**：`told()` 把「有 N 条没删」经 `report` 逐拍报，
   `say()` 只按整句去重，N 一变就多一行；条件过去后没有任何东西收走这些行
   （`notes` 只在启动路径 splice）。noRecordTwice 的 wait 行同病。

页面重复行不是视图缺陷：`recentRecords` 如实列出 journal 里的
`loop-task-delete`（每条任务每次尝试一条），风暴被修掉之后页面自然干净；
视图一侧不需要收（判定：缺陷在绑定一侧，不在 view 组装）。

## 修（`src/loops/run.ts`、`bind.ts`、`index.ts`；docs ORCHESTRATION §18.10 同批）

- 四条对账路全部排进 `beatChain`：`settleTasks` 排队，进行中的对账之后再跑，
  期间再来的触发置脏、跑完后至多补一趟（消 cascade）。
- 行健康新增 `reportState(family, text, level)` 通道：`loops-kept`（有 N 条没删）、
  `loops-wait`（等第一次 holder 记录）、`loops-holder`（holder 状态行与 elsewhere
  超 5 分钟行）按族替换、清状态即收行；`index.ts` 用 `states` Map 装配进
  activation，degraded 的状态行照旧压状态。bind 的对账开头先收上一趟的 wait 行。
- L2 钉：`tests/loops-run.spec.ts` 三支（拍内 settle 排队只建一条；拆臂级联每条
  任务一次尝试全真；kept/wait 行家族的替与收）；`tests/loops-row.spec.ts` 一支
  （行健康原文：恰好一行、第二拍不加行、成功后收行）；`tests/loops-bind.spec.ts`
  的 noRecordTwice 支改走 states。harness：`loopWorldOf` 加 `schedule`/`holder`
  选项与 `states` 沉淀。
- 红验证：还原 `src/loops/{run,bind,index}.ts` 跑同三支，级联支出
  `deleted:false` 重试记录、行健康支 wait 行残留（修复前实拍）；恢复后全绿。

## 门禁

- `npm run build` → `.llm/logs/lch-build.log` exit 0
- `npm run preflight` → `lch-preflight.log` exit 0
- `node scripts/check-lint.mjs` → `lch-lint.log` exit 0（棘轮 69/18/1 不动）
- `npm test` → `lch-test.log` exit 0（3982 项，0 fail；worktree 需拷入
  gitignored 的 `.agents/tasks/m5/lessons-seed.json`）
- `npm run probe` → `lch-probe.log` exit 0，**620/620 passed**（锁由 runner 自取：
  `.llm/probe-lock claimed for probe-runner`；跑前清
  `GIT_CONFIG_COUNT/GIT_CONFIG_KEY_0/GIT_CONFIG_VALUE_0`；运行目录
  `%TEMP%\glm-hourness-probe-2026-11-18T20-29-31-569Z-noSJJm`，全过已自删）

## 判定表（brief 的三选一与两侧形状）

- 「删了但宿主报失败」：成立，但失败是并发自身的影子——catalog 旧快照对已删行
  再删，宿主答 `schedule_not_found`（fail 不上报行健康的那个分支）。
- 「重试风暴」：成立，同根（级联对账各自带着旧 catalog 重试）。
- 「页面把已删的重复画出来」：证伪；页面如实渲染记录，坏在记录的产生侧。
