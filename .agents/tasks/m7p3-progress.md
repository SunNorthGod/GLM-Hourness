# M7-P3 晨报车道进度（m7-6 四答晨报 + 状态板块第 6 批）

Worktree `.worktrees/m7-p3`，分支 `m7-p3`，基线 main `e09a269e`（2026-11-14）。
任务：M7 运维 P3 的晨报一半——`fourAnswers`/`weeklyReport`/`hourness_report` 读状态收集器
（HANDOFF §8 状态板块行「还缺什么」第 6 批），图节点 m7-6（验收经 question-37 A 人改写）。

## 口径（读到的定案）

- 验收 m7-6（图节点原文）：四段（目标/规划/理由/架构）+ 等你回话的事 + 花了多少 + 检查与审查 + 例外 + 模型使用；每个数 harness 从指标流水/图/git 算出；同样输入逐字同输出；晨报是循环板默认条目。
- 周报比率归属：`d-metrics-ratios-person-only`（2026-11-01，晚于 m7-8 验收措辞）——周报只转述四个减负数字（三个来自 `metrics/load` 条目，第四个 M7 从图算），其余比率在面板指标板，末尾一行指人去看（status-hub 设计 0.3 §6、§12 M7 行）。
- 同源规则（status-hub 0.3 §3.1、§12 M7 行）：`fourAnswers`/`weeklyReport` 的跨视图状态节次（高峰、额度、用量、推进停住、汇报、metrics/load、超时与撤下、两张单子）读 `collectStatus(ctx, sid, 'agent', now)`，不各自从流水/图重算；M7 自有的任务计数、DORA 等非共享项照旧在 M7 算。
- 「用量（今天）」两扇窗：设计未定口径（HANDOFF「届时定两扇窗的口径」）→ 本期切片不动，口径记为待人定问题，不自创。
- 已知接缝：loops `staleEntries`/`timeoutEntries` 未实现（循环板车道，impl-plan-3 §1）→ 周报两张单子留缝；`execute/stopped-quota`、`execute/progress` 条目未交（M7 余批）→ 收集器自然缺席；metrics 流水的 `execute.*` 事件未接（HANDOFF metrics 行）→ 四答从原始记录算（M7 §3.10 的回退路，同规则板 R7 做法）；lessons 条目本轮不改（§12 M5 行）。
- `/hourness` 不在本批切到 fourAnswers 文本（其输出被 tests/workflow.spec 逐字钉住的是 M6 S5 切片）；`hourness_report {kind:'morning'}` 出四答文本，与 `/hourness` 的合一记为后续项。

## 批次（每批一个提交，门禁 build → preflight → npm test）

1. 批 1：`src/report/four-answers.ts`（四答纯函数）+ `src/report/weekly.ts`（周报纯函数）+ L2（tests/four-answers.spec.ts、tests/weekly.spec.ts、status.spec 同源断言）。
2. 批 2：`src/operate/`（operate 行：`hourness_report` 工具 morning|weekly + 循环板 contribute operate.morning/operate.weekly）+ 行登记（packages.mjs、cordis.patch.yml、health.ts）+ contracts 测试。
3. 批 3：探针 L3（hourness_report 无 person 条目、无比率）+ 收尾门禁。
4. 批 4：文档（HANDOFF §8、ORCHESTRATION §12、M7 设计 §13 实施记录）+ 图批注 m7-6 + 合入推送。

## 记录

- [2026-11-14] 开线。worktree 建好（e09a269e）。设计读毕：M7 §3.10/§3.11/§3.12/§8.2、status-hub 0.3 全文、impl-plan-3、ORCHESTRATION §12/§16.14/§18.4/§18.7、HANDOFF §8。盘面：E0–E9 已在 main（src/execute 全量），src/operate 不存在；hub 条目现有 glm/usage、rules/peak、glm/quota、rules/denials、rules/lifts、env/suppressions、env/timeouts、metrics/load；执行记录读取面 readChecks/readAdvances/readDrive 齐全，`<exec>` = `<projectRoot>/.llm/execute`。
- [2026-11-14] 批 1 开工：读 graph schema 的历史操作词与派发属性，写 four-answers.ts / weekly.ts。
- [2026-11-14] 批 1 代码完成：src/report/four-answers.ts（四答九节 + 现在/例外承接 hub 条目 + placeholders）、src/report/weekly.ts（四个减负数字 + 拦下与撤下 + 两张单子按 loops/* 条目 + 指标板指路行）；tests/four-answers.spec.ts（11 例）、tests/weekly.spec.ts（5 例）、status.spec.ts 加两条同源断言（真实条目函数 → collectStatus → 报告逐字）。tsc 净，44 例全绿。
- [2026-11-14] 批 2 代码完成：src/operate/entries.ts（operate.morning daily 08:30、operate.weekly weekly 周一 09:00，tell-main wake:true，照设计 §3.11.1 原文；patrol 条目留缝给 m7-7）、src/operate/index.ts（hourness_report 工具 kind morning|weekly，主 Agent 限定，collectStatus 'agent' 档 + 图 + <exec> 三本账 + operate.report 指标；apply 注入 tools + contribute 两时间条目 + agent/created 重挂）；登记 packages.mjs / cordis.patch.yml（disabled: true）/ health.ts HOURNESS_ROWS（env 后插 operate）；tests/operate-row.spec.ts 9 例；contracts/health/status 行表补 operate。tsc 净。
- 探针锁：控制车道持有中（.llm/probe-lock owner=control-probe-ugraph-postmerge，08:55 续写）→ 按 DEVELOPMENT §5.10 等锁；build/preflight/test 串行门禁延到锁空闲。tsc --noEmit 不清 dist，照常跑。
- 偏差记录（写进 §13 前先记这里）：四答「用了哪些模型」「审查轮数分布」「计划批准次数」「worker 问了几次」「过期的派发」「卡住的」六行今天没有耐久来源（execute.* 指标事件未接、attempts 登记表进程内、requests 无流水）→ 不发明，节次缺行；/hourness 不在本批切 fourAnswers 文本；晨报口径 = 本地日切片、周报口径 = 近 7 天（设计未钉，与 /hourness 与指标板 relayed 组一致）；四答例外一节整本口径（条目即整本），与 M6 切片并存的差异已写进文件头注释。
- [2026-11-14] 棘轮修复：三个新 spec 进 package.json test:2 链（knip 靠它认测试文件）；entries.ts 的 MORNING_ID/WEEKLY_ID 与两份报告的 GraphUnreadable 改私有；operate/index.ts 的 loops 注入块改形（与 execute 行的 10 行同形块拆开）；spec 夹具抽 tests/report-helpers.ts（hubEntry/section/reportInput/decide/SINCE 共用），四答 input 体改形避免与周报 7 行同形。tsc 净、45/45 例绿、knip 18 基线、jscpd 1 基线；eslint 只剩 calibrate-ablation 一项，是 worktree 未 build 的 dist 缺失（main 上同文件 exit 0），build 后消失。
- 补遗：fourAnswers 接「规则提议的核对」（ORCHESTRATION §12 的既有要求，morning-report 的 readEffects 改导出，节照 effectCheckLines 原样，只在有话可说时出现）；文档三处落笔（ORCHESTRATION §12、HANDOFF §8 两行、M7 设计 §13 ③ 与 §19.4 第四次修订记录）。
- worktree 无 node_modules：照 metrics-s8 的做法把主检出 pnpm 库的 eslint/knip/jscpd/typescript/typescript-eslint/esbuild 接进 node_modules（junction）。
- [2026-11-14] 门禁落定：build 0、preflight 0（首跑抓出补登记的 6 项：patch 里 env 行的 name/inject/config 被插入挤掉（已修回）、package.json 的 ./operate exports 与 locale 两份、tsconfig include、locale/operate/{en,zh}.json）、npm test 3819 过 0 败（lessons-seed.json 从主检出拷入本检出，SHA E10A3247…41910 相同；test:2 链 8236 字符超 Windows cmd 上限整个没跑——拆成 test:2/test:3，test 串三段）。
- [2026-11-14] 探针第 1 跑 603/608：3 红是本车道的 operate-report 场景——根 agent 被 hourness_report 以 forbidden 拒（isMain 取了 execute 行的严式 `main && note===undefined`，场景没有设计行与持有者记录，isMainAgentFor 返回 main:true+note）；2 红是 design question/modules 的 glm-design-bypass 提醒缺失——**控制车道在 main @ e09a269e 的对照跑（.llm/logs/ugraph-main-postmerge-control-run2.log）同为 603/605、红的正是这两条**（拒绝被执行行的 worker-graph-readonly 抢先，设计行的提醒与部分生效不再出现），属 main 既有，不归本车道。
- [2026-11-14] 修复：运维行 isMain 放宽到 main 位（M5 §4.2.1 的同一回退，报告只读、不派工作），记入设计 §19.4 ⑦；重建后 operate-row spec 9/9；探针重跑中。
- [2026-11-14] 重跑 2 分诊：仍 603/608，但红的实质变了——3 条 operate 红是**检查接线错位**，不是行为错。探针的 `steps` 是「模型轮」不是「脚本步」：第 1 轮没有 tool 消息（晨报结果在第 2 轮的 messages 里，周报结果在第 3 轮），所以 `lastToolResult(steps[0])` 为空、`steps[1]` 取到的是晨报文本被当成周报断言。工件证实两份报告本体渲染全对（晨报 10 节齐、周报减负行 = metrics/load 条目逐字、指路行收尾）；call-3 hub 的 glm/usage（text + detail）与晨报「花了多少」段逐字相等（渲染与捕获之间无记账，都在 call 1+2 之后、call 3 记账之前，结构上稳定）。修法：脚本 done 步补 `hub: true`（周报渲染后有捕获点），检查索引 steps[0..1] → steps[1..2]，run-probe.mjs 加注说明。dist 未动，不重建（探针-构建纪律）。2 条 main 既有红不变（design question/modules，对照跑已证）。
- [2026-11-14] 探针第 3 跑 606/608（.llm/logs/m7p3-probe3.log）：606 PASS，仅剩两条红 = design question/modules，与控制车道在 main @ e09a269e 的对照跑（603/605）完全同红，main 既有、非本车道。本车道三条 operate-report 检查全绿（晨报 10 节齐、花费段与 glm/usage 条目逐字相等、周报减负行 = metrics/load 条目 + 指路行收尾、两种 kind 无 person 条目/无指标组）。探针锁准备释放。
- [2026-11-14] 图批注 m7-6 落格（graph CLI comment op，actor llm；graph:smoke ok），随批 2 提交 f358d581（19 文件，620+）。探针锁释放。
- [2026-11-14] 合 main：origin/main 在分支期间被设计车道推进（1a4311e5 修的正是我记录的两条既有红——worker-graph-readonly 遮蔽设计行监听；其分支探针 605/605 全绿；3f756378 docs）。合并提交 3c736431，无冲突（ORCHESTRATION §12 与 §17.9 异段自并）。
- [2026-11-14] main 门禁：build 0、preflight 0（18 行 dsh-hourness）；npm test 首跑挂 graph-render——m7-6 批注改了图修订号（8557000d57b8）而提交里的 graph.svg 还是旧图渲染（d723e7909af8）。这步本该随批 2 走，漏了。补 npm run graph:render + 单独小提交 3c8d425b；重跑 npm test 全绿 0 败。
- [2026-11-14] 合并后全量探针（main @ 3c8d425b，前缀 m7p3-postmerge-）进行中：合并树 = 本车道被探树 + 设计车道 execute-rules 修复，组合树未被探过；预期 608/608（两条既有红应随 1a4311e5 转绿）。绿了再推。
- [2026-11-14] 合并后探针 608/608 全绿（.llm/logs/m7p3-postmerge-probe.log，工件目录随全绿清除）：本车道三条 operate-report 检查全过；design question/modules 两红随 1a4311e5 消失——仓库第一次满绿探针。锁释放。
- [2026-11-14] 推送：origin main 3f756378..3c8d425b（Gitee）；github main 同区间（镜像，走代理）。HANDOFF §8 两处「分支 m7-p3」改为合并事实（3c736431）。本车道收工：M7 P3 报告半 + 状态板块第 6 批全部在 main；遗留待人定的口径（§13 ③）、循环板 staleEntries/timeoutEntries 接缝、巡检（m7-7）各自随批次。worktree .worktrees/m7-p3 保留（分支 m7-p3 已并入）。
