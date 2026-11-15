# M7 巡检车道进度（m7-7 夜间巡检）

Worktree `.worktrees/m7-7`，分支 `m7-7`，基线 main `a8db4928`（2026-11-15）。
任务：M7 运维的巡检批次——`hourness_report {kind: 'patrol'}`（`src/operate/patrol.ts` 的 `patrolRun`）、
循环板默认条目 `operate.patrol`、巡检记录 `<proj>/.llm/operate/patrol.jsonl`（M7 设计 0.6 §3.11.2、
批次表 m7-7；图节点 m7-7）。

## 批次定义（读到的定案）

设计批次表 m7-7（design.md:114）：夜间到点主 Agent 做一次巡检：harness 先查工作目录、分支、主干与
项目图的卫生，并对主干跑一遍完整的检查；能做的主 Agent 去做或派出去，要人定的攒进下一批问人；
漏跑的一次在下一次巡检时报出来；巡检是循环板上的一条默认条目，只能看。
验收：L2 `operate-patrol.spec.ts`（临时 git 仓库）、L3 `glm-operate-patrol`；冷会话投递随 L4。

§3.11.2 的分工表（harness 自己做的 / 列成发现的）逐行映射：

| 项 | harness 做 | 发现 |
| --- | --- | --- |
| 主干检查（后台） | 复用 `execute.trunk-check` 同一个 `trunkCheck`（覆盖规则、门禁锁、`kind: 'trunk'` 记录；design.md:163 明写「循环板的 execute.trunk-check 与巡检共用」），经执行行服务 `glmHournessExecute.runAction` 起；工具当场返回，不等 | 失败的命令与日志；锁被占跳过；连续两次跳过；执行行不在（本次没跑） |
| 巡检命令 | `patrol $` 行（parseGateNorm 已认）后台跑（`runLine`，日志在 `<exec>/patrol/`） | 退出码非 0 时输出的前 40 行 |
| 证据 | `advances.jsonl` 里有、图上缺的证据补写：执行行服务加可选成员 `reconcileTrunk`（advance.ts 已有实现，drive 的对账在用），巡检调它 | 完成却没有 harness 进主干证据（批注不以「进主干」开头）的写任务 |
| 工作树 | — | 任务已关（done/dropped）、干净的 `.worktrees/hz-*`；不干净的（列文件） |
| 分支 | — | 任务已完成、内容已进主干超过 14 天的 `hz/<id>` 与 `hz/<id>@<n>`；任务已关、内容没进主干的分支 |
| 主干 | `git ls-remote <上游> refs/heads/<主干>`（网络不通用 T 并写明）；对照 advances/checks | 规范有 `push` 而主干领先上游的提交数；远端主干与 `T` 不一致；带 `Hourness-Task` 尾注、没有任何成立的本地前进覆盖的提交；近 7 天碰必须全审清单、没有全审看过同样内容的提交（含 incomingFloor）；近 7 天既没有前进记录也没有拉取记录覆盖的提交数；还没补检查的没检查前进 |
| 图 | — | 进行中超过 24 小时、没有活着派发的任务；过期的派发（pins 失配）；等人超过 3 天的待决；图的校验错误 |
| 经验与记忆 | 「候选过期」由经验行自己做（M5 §4.9），harness 不做 | lessons 服务 `hygiene(session, now)` 的其余发现；服务不在时整节不出现（M7 §3.5.5） |
| 自身 | 每次运行追加一行 `.llm/operate/patrol.jsonl`，首写放 `.gitignore`（同指标流水的做法） | 距上次巡检超过 26 小时（漏跑） |

指标 `operate.patrol`（found/did/trunk，shared/metrics.ts 与 src/metrics/kinds/operate.ts 的表已在），
经 `metricsOf(lookup).emit`（与 `operate.report` 同一条道）。

## 口径（本车道的读法，设计没钉的地方）

- 主干检查的触发：巡检读本地主干 `L`，对它构造 `LoopEventRecord`（event `hourness.trunk-advanced`，
  key `trunk-advanced:<to>:patrol-<毫秒>`，payload `{from, to, tasks: ''}`，过 runAction 的 key 与
  payload 校验）调 `runAction('execute.trunk-check', record)`；已有 trunk 通过记录时 `trunkCheck` 自行
  返回 skipped；锁被占（refused gate_busy）记 skipped。结果不叫醒主 Agent：过了只写记录，失败经
  `createUserNotice('glm-hourness-execute', …)` 送持有者（§3.11.2 的写法）。
- 连续两次跳过：状态在 patrol.jsonl 里（每行的 trunk 字段），巡检读最近两行。
- 执行行不在（服务/成员缺）：主干检查与证据补写都不做，各记一条发现，行健康不降级（报告只读）。
- 违规流水里还没补检查的没检查前进：从 advances.jsonl 的 `ok: false` 行与 `ok: true` 无 check 行读
  （运行时表 design.md:1348 明写巡检读主干前进记录），不以违规流水纠偏句的英文文本反解析提交号；
  「已补检查」= checks.jsonl 有该提交的通过记录或其后有成立的本地前进覆盖它。
- 「内容已进主干超过 14 天」：`lastTaskCommit(主干, 任务)` 的提交时刻（committer date）超过 14 天。
- 「没有活着派发」：任务最近一次派发批注的 childId 在本进程的 agents 服务里不在（跨进程的丢失派发
  归对账，E8 已有）；派发时刻超过 24 小时。
- 7 天窗口的提交列表：git.ts 新增 `recentCommits`（`%H%x00%cI%x00%P`，限 200 条，新在前）与
  `commitDate`、`listBranches` 两个小操作，都只被巡检读。
- 全审覆盖的判定：尾注提交的任务在图上最近一次派发的 review 深浅不是 full（或没有派发记录）、
  且提交碰到 norm-review-floor 的路径时列为发现；拉来放过的 incomingFloor 行（近 7 天）一并列。
- 巡检文本与四答晨报同构（纯函数、同输入同输出、plain-words 干净、每节有数、至多 5 行细节）；
  「已在后台」一节写 job 与「结果送到你的下一步」。

## 批次（每批一个提交，门禁 build → preflight → npm test → probe）

1. 批 1：`src/operate/patrol.ts`（发现计算与文本渲染的纯函数 + patrolRun）+ git.ts 三个读操作 +
   execute-service 可选 `reconcileTrunk` + index.ts kind patrol + entries.ts patrol 条目 + L2
   `tests/operate-patrol.spec.ts`（临时 git 仓库）+ operate-row.spec 的接缝断言改形。
2. 批 2：探针 L3 场景 `glm-operate-patrol` + 检查。
3. 批 3：文档（HANDOFF §10 M7 行、ORCHESTRATION §17、M7 设计 §19.4 如有偏离）+ 图批注 m7-7 + 合入推送。

## 记录

- [2026-11-15] 开线。worktree 建好（a8db4928），node_modules 接主检出的 junction（esbuild/eslint/
  jscpd/knip/typescript/typescript-eslint/@types/@typescript-eslint/@esbuild/@eslint）。基线 build 0。
  探针锁两个都空，本车道锁 `.llm/probe-lock`。设计读毕：M7 §3.11.1/§3.11.2/§3.5.5/§8.2/批次表、
  M5 §4.9、status-hub 0.3 §12、m7p3-progress、ORCHESTRATION §12/§16.14/§17.12-§17.14、HANDOFF §8/§10。
  盘面：src/operate 只有 entries.ts+index.ts（morning/weekly，patrol 留缝）；execute 行全量在 main
  （trunkCheck/runAction/reconcileTrunk 可复用）；lessons 服务已有 stats/hygiene（M5 §4.9）；
  metrics 联合与 kinds 表里 operate.patrol 已在。
- [2026-11-15] 批 1 开工。
- [2026-11-16] 前实例中断（ZCode 重启），换实例续线。续线审计（纯读，未动文件）：
  - 盘面比交接简报多两件：`src/operate/patrol.ts`（514 行）与 `tests/operate-patrol.spec.ts`（350 行）
    都已存在（未跟踪），批 1 的 src 与 L2 骨架齐了；交接简报说 L2 不存在，已过时。
  - 7 个已改文件逐一对进度核过，全部正当：package.json 只在 `test:3` 链上注册新 spec；
    git.ts 导出既有 `uncleanFiles` 并加 `commitDate`/`recentCommits`/`listBranches`/`trailerCommits`
    （进度口径列三个，第四个 `trailerCommits` 是全审覆盖行要的，复用既有 TRAILER_FORMAT 与
    parseTaskTrailers，只被巡检读）；execute/index.ts 给服务接可选 `reconcileTrunk`
    （trunkGate 不在时 `Promise.resolve(0)`）；execute-service.ts 加可选成员 + 文档；
    entries.ts 加 `operate.patrol`（daily 02:30，tell-main，wake）并改措辞；operate/index.ts
    加 kind `patrol`、patrolDepsFrom（git/runLine 缺省用真件）、健康行措辞；operate-row.spec.ts
    三处接缝断言改形（kind 枚举、无效 kind 拒绝移除、三条目）。
  - patrol.ts 对口径逐行核过：26 小时漏跑、连续两次跳过读 journal；执行行不在 → trunk-check-absent
    发现 + 行不降级；违规流水补检查读 `ok:false` 与无 check 行（不从英文纠偏句反解析）；
    14 天按 committer date；活派发按本进程 agents 服务；7 天窗口 `recentCommits` 200 条限；
    全审覆盖 review !== 'full'（DispatchRecord.review 是 keyof DEPTH_WORDS，=== 'full' 成立）；
    漏跑与跳过结果不叫醒主 Agent（只写 journal），失败经 createUserNotice('glm-hourness-execute')
    送持有者；`floorHits` 调用与 dispatch.ts/handback.ts 同约定（calls 空数组，worktree 参数不参与
    files/deletes 判定）。runAction 的 key（`trunk-advanced:<to>:patrol-<ms>`）与 payload
    `{to, tasks:''}` 过 keyFaultOf/payloadFaultOf（TRUNK_ADVANCED 声明 fields 的子集）。
  - 已知小偏（留观不修）：trunkCheck 的 scratch 等待态（done 带 tell）被巡检记为 failed + 通知——
    保守方向，通知文本原样带 SCRATCH_HINT，可接受。
  - L2 覆盖面：schema/条目/渲染定序纯函数/漏跑与跳过纯函数/新鲜项目 journal+gitignore+指标/
    主干三行（真 remote）/工作树与分支两行/图两行/证据行（reconcileTrunk 经服务）/
    后台两 job（trunk-check 经 runAction、patrol 命令经注入 runLine）/hygiene 有无/漏跑回喂/
    非主 Agent 拒绝。trunk-floor/trunk-floor-incoming 行没有 L2 直测（需全审夹具，重）。
  - 门禁未跑：probe-lock-2 被 metrics-s8 持有（2026-11-15T16:16:08Z 起），按纪律 build 与 probe
    都等锁。main 已前进到 a5296ba0（a5296ba0 docs + 2f314a87 test(execute)，不只 docs），
    合入前 rebase 重跑门禁。
- [2026-11-16 01:49–02:35] 批 1 门禁与提交。等锁期间静态核验做完（进度口径逐行 + API 签名），
  一处要修的没躲过 build/test：tests/execute-git.spec.ts 的 E3-3 封闭集清单要同步五个新名
  （commitDate/recentCommits/listBranches/trailerCommits/uncleanFiles）——先实例漏改，test 第一跑
  红在这一条，改清单后全绿。环境缺口一件：本 worktree 缺 `.agents/tasks/m5/lessons-seed.json`
  （spec 明说不入库、要本检出自备），从主检出拷入（被 .gitignore 挡住，不入库）。
  build 0 / preflight OK / test 3832 ok 全绿，棘轮 eslint 73 / knip 18 / jscpd 1 持平；
  探针（`.llm/probe-lock` 本车道持有，日志 `.llm/m77b-b1-probe.log`）608/608，地板守住。
  提交 81799ba7（后 rebase 改写为 c0af42fd）。
- [2026-11-16 02:40–04:25] 批 2：探针场景 `glm-operate-patrol`（runScenario 'operate-patrol'）。
  第一版前提错：以为探针满配默认只开 operate 行，实际 execute 与 graph 行默认启用——真机跑出来
  是空图加活执行行的另一条路（trunk-outside 发现、后台检查真启动、journal trunk='started'），
  三条新检查全红（608/611）。修法：overlay 显式 `- id: glm-hourness/execute  disabled: true` 与
  `- id: glm-hourness/graph  disabled: true`，场景钉发货默认形态（只有 operate 行开）的降级路径；
  第二跑 611/611，真机文本与设计逐字对上（执行行不在、项目图读不到、已在后台 - 无）。
  build/preflight/test 复绿（两轮），棘轮持平。提交 5bd15968（后 rebase 改写为 a5a2b304）。
- [2026-11-16 04:30] rebase 到 main `efe930f0`（m7-8 规矩阶梯 + loops-seam 两张周清单已落）。
  冲突两处：package.json 的 test:3 链（取 main 的去重版，operate-patrol 插在 operate-row 后）；
  src/operate/index.ts 的工具文档注释块（保留 main 侧 readViolations 整块 + 本车道的 patrol 句）。
  rebase 后 build 0 / preflight 0 / test 3831 ok 全绿，棘轮 73/18/1 持平。
  探针复跑（日志 `.llm/m77b-b3-probe.log`）：611/611 全过（新地板，0 真红）。
- [2026-11-16] 批 3 文档：HANDOFF §8 M7 行尾（巡检落地 + 指向 §17.16）、§10 第 9 条、
  ORCHESTRATION §17.16。图批注 m7-7（节点标题/批注改动要人转交）随收尾报告带出。
