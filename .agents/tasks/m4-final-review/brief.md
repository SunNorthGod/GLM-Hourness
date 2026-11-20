# m4-final-review lane brief

The m4 block's closing review (graph node `m4`, acceptance: 七件都做完，整批再
过一次更强模型的逐条审查). All seven children are done and closed on the graph
(m4-gate, m4-rules, m4-env, m4-suppressions, m4-cleanup, m4-checks,
m4-request-card). Repo main at `20c7cc02` or later.

## Scope

Read-only per-clause review of the whole m4 block against the person's 35
done-conditions (`.agents/tasks/m4/onepage-done.md`，设计
`.agents/tasks/m4/design.md`)：

1. 逐条（35 条）对照现行 main 的代码与测试：每条给 成立 / 成立但证据弱 /
   不成立 三档判定 + 指向证据（文件:行、spec 名、探针检查标签、桌面批次检查
   号）。不接受「设计说有」——证据必须在当前树上真实存在。
2. 特别核对（历史遗留的三处）：
   - m4-request-card 第 10 条的面板半边（graphLive.requests 折叠、RequestCard）
     与 §5.8 设计的一致性；
   - suppressions 账本退役后的 env/suppressions 条目与晨报同源（metrics
     step 10 改动之后没有回退）；
   - guard 放行签名 canonical 化（79a5add8）后 §5.5/§5.6 的批准语义没有被改
     坏（不同参数仍是新申报）。
3. 找缺陷：任何「条款说有、树上没有」或实现与条款相反的点，记 defect +
   证据，**不修**——修复班由编排方开。
4. 结论：整块可关 / 缺 N 条（列 N 条与建议）。

## Deliverables

- `.agents/tasks/m4-final-review/review.md`：逐条表（35 行）+ 三处特别核对 +
  defect 清单 + 结论。随分支 `m4-final-review` 提交推 origin
  （`https_proxy=http://127.0.0.1:7890`），不推 main。
- 汇报编排方：结论 + defect 清单（若有）。

## Discipline

- 只读：不改任何 src/ tests/ docs/ 文件；不跑探针（读测试与最近探针日志即可，
  `.llm/logs/mb2-probe.log`、`gs2-probe.log` 是 626/626 的现存证据）。
- 文件与 commit 零人设零语气词；判定必须带树上证据，不写「应该」。
- 不碰 `.worktrees/*`、主检出跟踪文件、桌面、人的鼠标键盘与 `~/.dsh`。
- 本车道在主检出直接工作即可（只读 + 写本任务目录），**不要切换分支**——主
  检出是共享工作区，把 review.md 放本任务目录，最后由编排方带上分支提交；
  或者用 `git stash` 无关——总之：分支上的提交只允许含
  `.agents/tasks/m4-final-review/` 的文件。
