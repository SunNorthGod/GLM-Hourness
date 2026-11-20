# preboot-decisions lane progress

Branch `preboot`（worktree `.worktrees/preboot`，node_modules 为指向主检出的 junction，退役先拆）。基线 main `8188dca9`。四件人定案（图 m7-3 与 reading-digest 批注 2026-11-20T15:14Z，relay「全按你推荐的来」）在 bootstrap go 之前落地。

## 提交

| 提交 | 内容 |
| --- | --- |
| `2e3ccb4f` | G15 设计补记（`.agents/tasks/preboot-decisions/g15-design.md`）随车道 brief 入库 |
| `7562fb83` | G15：配额耗尽停等（`quotaWaitOf` 两路确认信号、`hourness-quota-wait` 对齐 `hourness-peak-wait`、三路恢复、L2 `tests/quota.spec.ts` + `tests/execute-quota.spec.ts`、L3 `glm-exec-quota`） |
| `a9707b9c` | reading ②：标定配置戳与 compare 拒绝（`scripts/calibrate/stamp.mjs`、run-calibrate 的 `compare` 入口在规则板之前、L2 `tests/calibrate-compare.spec.ts`、探针 check `calibration compare`） |
| `4d37ee55` | G18：目标完成的一行话（`completionTell` 在 goal/changed 凭据路与对账重判路、L2 `tests/execute-drive.spec.ts`、L3 `glm-exec-skeleton` 钉这一行、`glm-exec-drive` 钉门禁之外不给） |
| `9c396b4d` | test(probe-lock)：拆弹 spec 自己的临时目录命名——mkdtemp 的随机后缀可以 2 开头，让每条日志路径都带上 `probe-lock-2`，打掉区分两个槽位日志行的守卫（实测 25 跑 1 挂，修后 30 跑 0 挂）；`withRoot` 改用 `lock-spec-` 前缀。与本车道四件无关，满量门禁被它挡住，修在根上 |
| `eb85d10f` | reading ③：审查简报的 grader 三件（`src/execute/brief.ts` 的 `graderLines`，三份审查简报都带；M7 设计 §3.7.1 加检查单条目 + §19.4 第八次修订；L2 `tests/execute-brief.spec.ts` 三例；探针 `exec review (grader trio)` check） |
| `f1edfb3b` | docs：ORCHESTRATION §4.6（停住的另三种 + G18 一行话）、§17.13（preboot 批记录）、§10.5.1（配置戳与 compare 拒绝）；M7 设计修订记录；车道 progress 入库（本批 amend 一轮补探针结果与哈希刷新） |

提交顺序注：brief 写的是 G15 → G18 → ② → ③；实际落成 G15 → ② → G18 → ③——第一次提交时 `git add -A` 把 ② 的工作扫进了 G15 提交，reset 后按件重拆（② 与 G18 各自的文件级拆分见 stash 往返），顺序差一位，每件一个提交不变。分支未推，历史可改写：哈希变过三轮（fixup 把 script-gate 顺序钉子并进 ②、quota 场景脚本修进 G15、calibCompare check 断言修进 ②；最终链 7562fb83 / a9707b9c / 4d37ee55 / 9c396b4d / eb85d10f / f1edfb3b）。

## 判定与实现要点

- **G15 触发信号（实读后的定法）**：两路结合，都从计价服务的额度视图来（`pricingService` → `quotaOf` → `QuotaView`，`{waitMs: 0, read: false}` 只用缓存与额度日志，不在模型步路径发起网络读、不产生 `glm.quota-read`）。确认路径一：`view.limited`——glm-zcode 适配器对 429 限额码（1308/1310/1316-1321）写的上游限额记录；确认路径二：最近读数里 5 小时或每周窗口 `spent` 或 `usedPercent >= 100`。重置时刻 `limited.until` 优先，否则已用完窗口的 `resetAt`（取较早）；两条都拿不到或时刻已过则不停（预估 `exhausts` 不停车，那是循环板 `channel.quota-low` 的预警）。接口现实核对：`view.limited` 在比读数新的限额记录存在时可见（`quota.ts` compose），`resetAt` 由服务端 `nextResetTime` 来，两条路互补——触发信号在现行接口上拿得到，没有缺口。
- **G15 停等形态**：`hourness-quota-wait`，`ROW_CODES` 收编，`drive.jsonl` 记 `quota-wait`（`until` + `code`）；blocked 不算空转；主 Agent 不受影响。恢复三路：计时器（重置点 + 5 分钟宽限，`waitTimer` 与高峰共用一个助手函数，jscpd 棘轮因此保持 1）、步路径读回 `until`（重启兜底）、人说继续。恢复后服务端未重置 → 429 → 再停（自愈环，设计补记记了这条读法）。`execute.resume-drive` 保持高峰专用。
- **G18**：`completionTell` 在图上写完成成功后向持有者发 `glm-hourness-execute` 通知，一行 `目标「<标题>」（<id>）完成：整体验收审查第 <k> 轮通过，审查的主干提交 <12位>。`；`acceptanceRounds` 读不到时退化成「整体验收审查通过」（门禁保证存在，防御性）。门禁之外的完成只批注。
- **reading ②**：`profileStampOf(patchText)` 只读 `- id:` 与 `disabled:` 行（不读 config，所以运行目录路径不入戳）；per-run `result.json` 与整批 `results.json` 各带 `commit` + `profile{rows, arm, permission}`；`compare` 位置参数入口在规则板之前分支退出（不花积分、不取探针锁），差异逐条列出（提交、脏否、arm、权限、任务、模型、repeat、bounds、行组合按 id 排序比较），无戳旧批次一律拒绝。compare 前移动了 `parseArgs` 的位置，script-gate.spec.ts:459 的顺序钉子（gate 在 parseArgs 之前）随之改写成新契约：compare 分支（只读两个 results.json、不花积分）在板之前退出，板在 `requireDesktop` 与探针锁之前——钉子的本意（问过板才允许开始花钱的事）不变。改动以 `git commit --fixup` + autosquash rebase 并进 ②（分支未推），run-calibrate.mjs 顶部同主题注释一并改准。
- **reading ③**：`graderLines(items, owner)` 三句校准行进三份审查简报（任务审查、模块设计评审、目标整体审查）的约束栏；深浅句不动（管看多宽，三句管怎么判）。M7 设计 §3.7.1 加一条 + §19.4 第八次修订记录。

## 验证

- 每批 build / preflight / `npm test` 全绿，退出码直传；棘轮 eslint 57 / knip 18 / jscpd 1 不动（G15 期间 jscpd 报过一次新克隆：quotaBlock 与 peakBlock 的计时器段同形，抽成 `waitTimer` 共用后消掉）。
- 工作树环境补件：`tests/lessons-seed.spec.ts` 要求 `.agents/tasks/m5/lessons-seed.json` 在检出里（gitignored，git 里不留），新开的 worktree 没有它，第一次满量跑挂在它的三个用例上；从主检出复制进来后该 spec 3/3 过，与四件改动无关。
- 探针：新增场景 `glm-exec-quota`（场景 home 的 `audit/quota.jsonl` 种一条 5 小时窗 100% 的读数，重置点 3 分钟后）、新增无 boot check `calibration compare`、`glm-exec-skeleton` 与 `glm-exec-drive` 各加一条 G18 check、`glm-exec-review` 加 grader trio check。满跑 635/635 全绿、exit 0（主检出 `.llm/logs/pb-probe-3.log`；前两轮的失败与修复见事故记录），地板 626 → 635（+9：quota 4、compare 2、G18 两处各 1、grader trio 1）。跑绿后运行目录自动清空，profile 守卫零改动。

## 事故记录（自查入册）

- 2026-11-20T16:12Z：车道在验证 run-calibrate 参数解析时以无参数方式运行了 `node scripts/calibrate/run-calibrate.mjs`——`compare` 分支之后落进了正常跑批路径，runner 取走主检出 `.llm/probe-lock`（calibrate-runner, pid 48096）并开始真实标定批。约 1 分钟后发现，PowerShell 杀掉 runner 与 glmsandbox 子进程进程树；已确认无残留进程。代价：`bugfix-csv-quotes` on glm-5.3 一个完整运行（计费积分 14.96，原始 29.91），第二个运行（feature-parse-duration）中途被杀，积分在个位数；两份结果都在系统临时目录的批目录里，未拷回仓库。残留：主检出 `.llm/probe-lock` 里的死申明在当晚的满量探针里被 runner 按死申明接管规则自动接管（`taken over from calibrate-runner, pid gone`），无需人工清理；worktree `.llm/calibration-runs/2026-11-20T16-12-39-733Z/pending.json` 与系统临时目录的 `glm-hourness-calib-batch-fDenWA`、`glm-hourness-calib-dsh-r2C0JW`、`glm-hourness-calib-run-OOu6aj`、`glm-hourness-calib-run-jbGF79` 保留不删（都是 gitignored / 临时目录，不进仓库）。桌面主 profile 与 `~/.dsh` 未被触碰（标定运行的数据目录都指向运行目录）。教训：run-calibrate.mjs 无参数 = 跑整批真标定；验证参数解析一律带 `compare`/`--collect` 这类只读分支或 `--help` 等价的入口。
- 2026-11-21T01:11Z（第一次满量探针，631/635）：4 条失败里 3 条是 `glm-exec-quota` 的——场景主 Agent 的脚本 `quotaMain` 按 `[名字, 步骤]` 对的数组传给 `others`，而 probe-llm 消费的是平铺步骤（drive 场景的 `driveMain = driveSteps.map(([, step]) => step)` 做过映射）。对数组条目 `step.tool` 与 `step.text` 都取不到，脚本回放对每一步都回退成固定文本答复：主 Agent 从未执行 `graph_focus`，`step()` 在 `focusGoal === undefined` 处提前返回，release 动作不触发，goal 从未创建（等待方记 `goal:null` 超时）。修复把 `quotaMain` 平铺（`quotaStill` 单独持有供 check 定位），以 fixup 并进 G15。第 4 条失败是 `calibration compare` 的第二条——check 断言写成找 stdout 里的字面 `byModel`，而 runner 的并排输出打的是 `A: <byModel 数组的 JSON>`，字面词永远不出现，这条断言不可能过（车道写 check 时的错，与 runner 无关，runner 输出本身正确）。断言改为比对 `A:`/`B:` 两行的夹具摘要 JSON，修前先在临时目录对真 runner 验证过输出形状，fixup 并进 ②。第二次满量跑 634/635：quota 场景的 drive.jsonl 在启动后 4 秒写入 `quota-wait`（`until` 正是种子重置时刻），G15 的 L3 全过；只剩修过的 calibCompare 断言（第三次跑收口）。

## 待办

- 分支推 origin（https_proxy=http://127.0.0.1:7890），不推 main、不合并 main。
- 退役：拆 node_modules junction，`git worktree remove`。
