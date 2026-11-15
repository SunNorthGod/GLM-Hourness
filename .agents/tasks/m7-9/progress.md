# M7 交付四个数车道进度（m7-9）

Worktree `.worktrees/m7-9`，分支 `m7-9`，基线 main `0490e3a9`（2026-11-16）。
任务：M7 交付的四个数——`dora(input)`（`src/report/metrics.ts`）、事件 `operate.dora` 写进指标流水、
L2 `tests/report-metrics.spec.ts`（M7 设计 0.6 §3.13、批次表 m7-9；图节点 m7-9）。

## 批次定义（读到的定案）

图节点 m7-9：每周合入几次、一件活从派出到进主干要多久、进主干后出问题的比例、主干变坏到修好要多久，
按固定口径从 harness 记的证据与项目图算出，写进指标流水；验收 L2 `report-metrics.spec.ts`。

§3.13 的四数口径与来源表（design.md:1155）：

| 指标 | 口径 | 来源 |
| --- | --- | --- |
| 交付频率 | 每周 `ok` 的主干前进次数 | `advances.jsonl`（指标流水的 `execute.advance`） |
| 变更前置时间 | 任务第一次派发到它进主干的时长，中位数 | 派发批注与进主干证据 |
| 变更失败率 | 进主干后 14 天内，任务被重开、或出现 `source` 指向它的修复任务、或主干全量检查失败且失败的提交是它之后的第一个，三者之一的前进所占比例 | 图的历史；检查记录（`kind: 'trunk'`） |
| 恢复时长 | 主干全量检查从失败到下一次通过的时长；批次 L4 失败到修复进主干的时长 | 检查记录；L4 批注 |

进对话的路径已被人的决定改道：`d-metrics-ratios-person-only`（2026-11-01）与 metrics 设计 0.7 §14 M7 ③
（`.agents/tasks/metrics/design.md:1038`）请周报只留四个减负数字，DORA 等比率拿掉、不进
`hourness_report` 的结果（进模型上下文违反 CHARTER §8）；指标板 §7.6 的数从流水算、不读 M7 的记录，
「还没接上」的行等 M7 给出算它们要的事件。所以本批次只做「从 harness 记的证据算出 + 写进指标流水」，
`weekly.ts` 不加节、不改文本；指标板/命令行的展示行等流水的读者长出来，不在本批。
§8.2 P2 把 m7-9 归在报告波（新建 `src/report/metrics.ts`），§8.2 清单（design.md:1499）钉 `dora` 为
L2 直测的纯函数。部署在本项目里指「主干经核对前进一次」（§3.13 引言）。

## 口径（本车道的读法，设计没钉的地方）

- 部署（deploys，交付频率的分子也是失败率的分母）：`advances.jsonl` 里 `ref === 'local'` 且 `ok === true`
  且 `at` 落在窗口 `[since, now)` 的记录数。远端 push 不算（发布不是部署，同一提交会双计）；
  `ok: false` 与缺 `at` 的旧行不算。
- 变更前置时间：对窗口内每个部署 D 的每个具名任务 T（`tasks` 来自尾注），旅程起点 = T 上第一条晚于
  「上一次把 T 送进主干的部署」时刻的派发批注（`parseDispatchComment`；没有上一次就是 T 的第一条），
  lead = `D.at − 起点`；窗口内全部 (D, T) 对的中位数，偶数取均毫秒取整（同 metrics calc 的约定）。
  没有派发批注的任务（图外改的）不进样本。重开后再派再合的第二次合入按新旅程算（起点晚于上一次合入）。
- 变更失败率：分母 = 窗口内部署数；分子 = 14 天窗 `[D.at, D.at+14d)` 内命中三者之一的部署数：
  ① D 的任一具名任务被重开（`reopensAfter` 的 done→doing，时刻在窗内）；
  ② 出现 `source` 指向该任务的任务节点（节点首条历史的 `at` 在窗内，状态不论——「出现」即算）；
  ③ 已核实的 `kind: 'trunk'` 检查记录失败（`passed === false`）且失败提交 === D 的后继提交——后继 =
  journal 里 D 之后第一条 `ref: 'local'` 且 `from === D.to` 的记录的 `to`（「它之后的第一个」）。
  没有后继（D 是最新部署）不算 ③。图读不到时分子不算（事件里省略 failed），分母照报。
- 恢复时长：已核实的 trunk 记录按 `at` 排，每条失败之后第一条通过的（任意提交）算一次已恢复事件，
  时长 = 两者 `at` 差；失败时刻在窗口内的进中位数（偶数取均）；失败后到计算时刻还没有通过的不算
  （未恢复的数巡检报，不进这条）。
- 「批次 L4 失败到修复进主干的时长」这一半今天没有耐久来源（L4 批注无结构化记录），不发明，
  缺一半记在这里与文件头（同 m7-p3 对没有耐久来源的行的做法），来源长出来再补口径。
- 事件 `operate.dora`（加进 `OperateBodies` 与 `src/metrics/kinds/operate.ts`，metrics-schema.spec 的
  operate 列表同步）：`deploys:int`、`leadTasks:int`、`leadMs:int?`、`failed:int`、`restoreN:int`、
  `restoreMs:int?`。`leadMs` 无样本、`restoreMs` 无已恢复事件、图读不到的 `failed` 各自整字段省略
  （可选字段缺席 = 没算出来，不写假事实）。流水的四数进的是事件，比率展示由读者除。
- 发射点：`hourness_report {kind: 'weekly'}` 每次调用算一条，窗口 = 工具 weekly 分支的 `since`
  （now−7d，与周报同窗）；morning 不算不发射。`src/operate/index.ts` 与 `tests/operate-row.spec.ts`
  本瞬间在 m7-7 手里（巡检飞行中）：本车道先在自己的分支上改，合入时按并发图 rebase 到当时的 main。
- 周报文本零改动：不加节（见上，人的决定）。

## 批次（每批一个提交，门禁 build → preflight → npm test → probe）

1. 批 1：`src/report/metrics.ts`（`dora` 纯函数 + 事件 body 构造）+ `shared/metrics.ts` 的
   `OperateBodies` 加 `operate.dora` + `src/metrics/kinds/operate.ts` 表 + `tests/metrics-schema.spec.ts`
   operate 列表 + L2 `tests/report-metrics.spec.ts`（四数口径逐条 + body + 确定性）+ package.json
   test:3 注册（knip 认测试文件）。
2. 批 2：operate 行 weekly 分支发射（`src/operate/index.ts`，m7-7 的文件）+ `tests/operate-row.spec.ts`
   发射一例。门禁在批 2 的树上跑。
3. 批 3：文档（ORCHESTRATION §12 DORA 行补落地、HANDOFF §10 M7 行、M7 设计 §19.4 修订记录——
   §3.12.4 的「周报含交付的四个数」被 `d-metrics-ratios-person-only` 改道这件事要记）+ 图批注 m7-9 +
   rebase main、合入、推 origin + github。

## 记录

- [2026-11-16] 开线。worktree 建好（0490e3a9），node_modules 接主检出 junction（eslint/knip/jscpd/
  typescript/typescript-eslint/esbuild/@types/@typescript-eslint/@esbuild/@eslint），strip-types 导入净。
  探针锁两个都空。设计读毕：M7 §1.2 m7-9、§3.12.3/§3.12.4、§3.13、§3.16、§8.2（P2 行与 L2 清单）、
  metrics 设计 0.7 §7.2/§7.6/§14 M7 ③、m7p3-progress、m7-7 progress 头、ORCHESTRATION §12。
  盘面：src/report 已有 four-answers/weekly/panel/status（m7-p3 落的），metrics.ts 不在（本批次建）；
  src/metrics 全量在 main（writer/kinds/calc/board），`operate.report`/`operate.patrol` 两 kind 在；
  execute 读取面 readChecks（VerifiedCheck，SHA 核实）/readAdvances（AdvanceRecord）齐全；
  图读取面 parseDispatchComment（第 N 次派发批注）/reopensAfter/source 边齐全；
  `d-metrics-ratios-person-only` 与 metrics 0.7 §14 M7 ③ 钉死四数不进周报文本。

- [2026-11-16] 批 1 + 批 2 代码完成。`src/report/metrics.ts`（`dora` 纯函数 + `doraBody`）：
  部署 = `ref:'local' && ok:true && at` 在窗内的 advances 行；旅程边界 = 该任务上一次进主干的部署
  （全 journal 范围，不限窗口——首版只看窗口内部署，被 L2 抓出第二段旅程从第一次派发起算的错，已修）；
  失败三标记（重开 / source 修复任务出现 / 后继提交的全量检查失败，各 14 天窗）；
  恢复 = 窗口内 trunk 失败到下一条通过的 trunk 记录，未恢复不进中位。
  `operate.dora` 进 `OperateBodies` 与 kinds 表（deploys/leadTasks/leadMs?/failed?/restoreN/restoreMs?，
  可选字段缺席 = 没算出来），metrics-schema.spec 的 operate 列表同步。
  发射点在 operate 行 weekly 分支（`src/operate/index.ts`，m7-7 的文件，合入时 rebase），
  发射断言放本车道自己的 `tests/report-metrics.spec.ts`（11 例：四数口径逐条 + body 缺席语义 +
  确定性 + weekly 发射/morning 不发射），不碰 m7-7 的 operate-row.spec.ts。
  周报文本零改动（d-metrics-ratios-person-only）。
- [2026-11-16] 门禁（.llm/logs/m79-build1 / m79-preflight1 / m79-test1、test2 / m79-lint1）：
  build 0、preflight 0（18 行 dsh-hourness）、npm test 首跑挂 lessons-seed 3 例（worktree 缺
  git 外的 `.agents/tasks/m5/lessons-seed.json`，从主检出拷入——m7-p3 同款）、重跑全绿 0 败；
  lint 棘轮持平 eslint 73 / knip 18 / jscpd 1。tsc 净。
  探针锁 `.llm/probe-lock` 被 m7-7 车道持有（2026-11-15T18:10:25Z 起，批 1 探针），probe 按纪律等锁。
