# preboot-decisions lane brief

Four small items resolved by the person on 2026-11-20（relay「全按你推荐的来」，
decision records on graph nodes m7-3 / reading-digest）and now to implement
before the bootstrap go. Repo main at `8188dca9`.

## Items

1. **G15（drive 配额耗尽停等）**：graph m7-3 批注记录的定案——GLM 配额耗尽时
   自动推进停下、把重置时间告诉人、到点自动接着跑。现状：额度投影机器在
   `src/shared/quota.ts`（`exhausts` 投影带 `at` 与 basis；5 小时窗与周窗），
   drive（`src/execute/drive.ts`）只有轮次上限与等人两路停等，没有配额路。
   先写一页设计补记：触发信号选哪条（glm-login 的 quota 服务投影？适配器的
   上游限额流水？两路结合），停等形态复用 §3.9 的哪一档（对齐
   hourness-peak-wait 的做法），恢复计时谁管（循环板时间条目 vs harness 内
   定时），主 Agent 的告知文案（含重置时刻，来自 quota 投影）。然后实现。
   与 m7-3 验收第 5 条（高峰少做档）的形态对齐，但触发与恢复源不同。
2. **G18（目标完成的一行话）**：graph m7-3 批注定案——目标完成时在对话里给
   人一行话带审查结论。实读完成门（drive.ts 的 completion gate 与
   `execute.goal {op:'complete'}` 指标点）现在人在对话里能看到什么；缺一行
   就补：完成 tell 带整体审查的结论与目标题，一行，不刷屏。
3. **reading ②（标定结果记配置）**：`scripts/calibrate/` 的 result.json 加
   profile 行组合与提交号戳；`npm run -s calibrate -- compare`（或现行的对比
   入口）在配置不一致时拒绝并写明差异，不跨配置比较。
4. **reading ③（复审检查单加 grader 三件）**：M7 的复审任务书/检查单加
   grader 校准三件纪律——判据原子二元、边界写明、藏元数据（来源
   `.agents/tasks/reading-digest/2026-11-20.md` 第 1 篇）。落点在复审简报的
   生成处（`src/execute/` 审查简报组装）与 M7 设计 §3.7 的检查单文字。

## Verification

- L2 钉每件的判定分支；探针场景按最小增量补（G15 的停等形状、G18 的完成
  tell、③ 的复审任务书文字、② 的 compare 拒绝），地板从 626 往上长，全绿。
- 门禁：build / preflight / test 全绿，退出码直传；棘轮 eslint 57 / knip 18 /
  jscpd 1 不动。
- docs：ORCHESTRATION §3.9（G15/G18 两路停等）、M7 设计 §3.7（grader 三件）、
  标定文档（②）同批整段改写。

## Discipline

- 分批提交：G15 设计补记 → G15 → G18 → ② → ③ → docs，每批门禁全绿。
- Worktree `.worktrees/preboot -b preboot`（junction 主检出 node_modules，退
  役先拆）；门禁日志写主检出 `.llm/logs/pb-*.log`；探针锁 runner 自管、绝不
  手动删锁、跑前清 GIT_CONFIG_COUNT/GIT_CONFIG_KEY_0/GIT_CONFIG_VALUE_0。
- 分支推 origin（`https_proxy=http://127.0.0.1:7890`，允许改写）；不推 main
  不合并 main；不碰 `.worktrees/ablation-trial`、`.worktrees/comms-split`；
  不碰主检出跟踪文件；不碰桌面；不碰人的鼠标键盘与 `~/.dsh`。
- 进度记 `.agents/tasks/preboot-decisions/progress.md` 随分支提交；文件与
  commit 零人设零语气词。G15 若实读后发现触发信号在现行接口上拿不到，停下
  报告缺口（缺什么数据、从哪来），不硬造。
