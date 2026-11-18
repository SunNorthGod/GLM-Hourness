# desktop-l4-rc3 lane progress (2026-11-18 wave, 2026-11-19 execution)

Lane: desktop-l4-rc3 (main checkout @ 2818d130, built dist 2818d13 dirty=false on
tracked files, untracked task docs only). Verification-only rc.3 desktop L4
batch, 9 checks in brief order. Isolated instance only: port 9356, marker
`--glm-hourness-l4rc3`, scratch root `%TEMP%\l4rc3\` (dsh-home + user-data-dir +
ws-a..ws-e), desktop lock `.llm/desktop-lock/owner.txt` claimed 17:48Z lane pid,
deleted at teardown. No probes run (no probe lock taken). Build per §5:
`.llm/logs/l4rc3-build.log`, exit 0, build-info `2818d13`.

Instance: `@deepseek-ai/dsh-desktop/0.2.2-rc.3` (Electron 44.7.0 / Chrome 152),
main pid 18820, started 17:53:09+08 via `.llm/l4rc3/start-l4rc3.ps1`. Profile
b10-shape as desktop-l4-bat (dsh-base + dsh-web-app + both packages + 9
experimental; patch: glm-zcode flash/low, danger-full-access, glm-llm +
operate enabled), junctions to this checkout's packages, 5 scratch workspaces
ws-a..ws-e git-inited, credential copies read-only (sizes 1374/36/551/37 B,
same as l4bat), values never printed.

Seeding before any session opened (`.llm/l4rc3/seed-scratch.mjs`, graph CLI as
llm with `relay` stand-in so seeded nodes land approved):
- ws-b: goal + `env` feature + tool `tool-nodetest` approved with acceptance
  `` `check nodetest lines 3s $ node -e "process.exit(0)" {files}` when *.md ``.
- ws-d: goal-1 (stage release) + norm-directions (3 directions) + framework
  decision + mod-a (design) + mod-b (execute), all approved.
- ws-e: probe `seedPathProject` shape (root AGENTS.md with ROOT mark, component
  `src/comp/AGENTS.md` with COMP mark + decision-1, a.ts/b.ts, graph goal +
  two decisions + task with writeScope `src/comp/`, `.llm/lessons.jsonl` lesson
  L-0c0ffe for `src/comp/**`).

## Checks (brief order)

1. **schedule_edit 参数形状 — PASS**（只读，未开实例时完成）。Electron node
   模式读装机 `app.asar`（0.2.2-rc.3），`dsh-tool-schedule/lib/index.js`
   （拷贝 `%TEMP%\l4rc3\asar-extract\dsh-tool-schedule\`，sha256
   af717a4e8e3d…；schema 摘录 `.llm/l4rc3/check1-schedule-edit-schema.txt`）：
   `schedule_edit` 的 parameters 里 `id` 是顶层 `type: string, required: true`
   （"Task id."），`action` enum ["update","delete"]，补丁字段
   title/prompt/rrule/target/active/expectedUpdatedAt 全部顶层。guard 的
   `args.id` 顶层读法（`src/loops/guard.ts:142`、`:171`）与 rc.3 工具形状
   相符；`guard.ts:139` 的 UNVERIFIED 注记可清（车道不改码，只记录）。
2. **/loops accept 两步与 reject — PASS（经 isolate 配方打开 board 路）+
   缺陷 1**。顺序与证据：
   - 先做了可达性核实：graph 行在场时 loop_propose 一律 via graph（l4bat 已
     证）；把 scratch patch 改成 `glm-hourness/graph disabled: true` 后 dsh-hmr
     就地重组生效（不重启，`/glm-status` 里 graph 行「未加载」），但 /wish 硬
     失败「项目图行 glm-hourness/graph 没有启用，主 Agent 没有图可用」，主
     Agent 当不上，loop_propose 两次 forbidden（ws-a 与 ws-d 会话，session
     日志 tool/result 原文在案）。结论：缺省组合下 `/loops accept` 两步在桌面
     不可达——它需要一个「是主 Agent 但图服务不在」的会话，而主 Agent 身份
     本身依赖图行。恢复 graph 行后用 loader 的 `isolate` 入口选项打开了这条
     路（见下「isolate 配方」）。
   - isolate 配方：scratch patch 加 `- id: glm-hourness/loops\n  name:
     dsh-hourness/loops\n  isolate: { glmHournessGraph: true }`（rules 行同
     形），dsh-hmr 就地生效，graph 行恢复「生效」，/wish 正常。loop_propose
     返回 message 变为 board 文（"The project graph is not available: … type
     /loops accept …"，proposal lp-f599f377，entry u-b87b117d）。
   - 两步 accept（ws-a 会话 95ecc713）：第一步整卡展示脚本原文与注意（拿不到
     凭证与 Key / 改一个字就不再跑 / 超 10 秒算没跑完）+「这条提议还没有生效。
     看过了，30 分钟内再打一次 /loops accept lp-f599f377 才生效」；第二步
     「已加上「l4rc3 一次性脚本条目」，下次 11月19日 03:20」。
   - 字节落盘与哈希钉住：`ws-a/docs/loops/entries/u-b87b117d.json`（source
     via board、proposal lp-f599f377、script.file + sha256 6f24cd13…）与
     `ws-a/docs/loops/scripts/u-b87b117d.mjs`；`sha256sum` 逐字节等于钉住值。
   - journal ops 序列（`ws-a/.llm/loops/journal.jsonl`，拷贝
     `.llm/l4rc3/ws-a-loops-journal.jsonl`）：propose(lp-f599f377) → show →
     add(u-b87b117d, relay「人用 /loops accept 同意了提议 lp-f599f377」) →
     accept → propose(lp-bd4c1e30) → reject；reject 回「这条提议不加了。」。
   - 时钟真火（追加核验，非简报要求）：19:20:12Z loop-fired {entry
     u-b87b117d, source person, trigger once occurrenceAt 19:20:00Z}，执行器
     运行前核对 sha256（run log 头行），脚本因车道提示词转义把字符串字面量
     弄成裸换行而 SyntaxError（车道种子缺陷，非产品），exit 1；loop-done
     outcome "reported"、exits [1]、delivery followup 投递主 Agent；view.json
     该项 last「没过，已告诉主 Agent」。`.llm/l4rc3/ws-a-script-run.log`、
     `ws-a-fire-metrics.jsonl`。
   - **缺陷 1（记录并归因，不修）**：`MESSAGES.board`（`src/loops/tools.ts:153`
     `MESSAGES.board(made.id)`）教人打 `/loops accept u-b87b117d`（entry id，
     u- 前缀），而 `/loops` 命令只认 `PROPOSAL_ID = /^lp-[0-9a-f]{8}$/`
     （`src/loops/commands.ts:25`）：照消息原样打 u- 形，回复是用法错误
     「用法：… /loops accept <lp-id>…」。lp- 形才走通。证据
     `.llm/l4rc3/ws-a-accept-u-defect.txt` + 会话日志。归因：tools.ts 的
     MESSAGES.board 引用 id 形与命令解析不一致。
3. **m4-checks 桌面 L4 — PASS（文件级真跑）**。ws-b 普通会话（无 /wish）Write
   `notes.md`：`.llm/env-checks/2f7a3813/20261118T182413-tool-nodetest-nodetest.log`
   （命令行 `node -e process.exit(0) notes.md`，41 ms）、
   `.llm/env-checks/timing.jsonl` value+run 两行（limit 9000 ms 来自估的 3 秒、
   run ms 41）、view.json `env.checks-after-edit` last {outcome "ran", 「跑完
   了，没事」} 且 checks[0] 带超时格（9 秒、来源 agent-estimate 3 秒、史
   「写检查的 agent 估 3 秒，会话未记」、timeouts 0）。环境首提醒入会话日志
   （source.hourness-env，reason first，含「Checks run after each edit… nodetest
   on *.md」）。观察（不追根）：agent 下一步复述称未收到检查结果（0 条）——投递
   已入板（recordRun）但对话侧未被 flash 复述，属投递呈现或模型注意，未归因。
4. **dtm 规则页超时行 — PASS**。ws-c 主 Agent（/wish tk-ek75qsst）rules_propose
   script 规则 r-l4rc3-slow（estimateSeconds 1，脚本实际 busy-wait 4 秒），
   message 为 board 文（isolate 配方生效，proposal p-470803be）；`/rules
   accept` 两步装上（第一步行内含脚本原文+「30 分钟内再打一次」；第二步「提议
   p-470803be 生效了…」）。落盘：`docs/rules/rules.json` 规则带
   `script.sha256 9a92856b…` 与 `docs/rules/scripts/r-l4rc3-slow.mjs` 实际
   sha256 相等；`.llm/rules/journal.jsonl` ops propose → proposal-show →
   proposal-accept；timing.jsonl 四种行全落（`.llm/l4rc3/ws-c-rules-timing.jsonl`）：
   estimate（propose 时，session 072e0739 记名）、run（rr-0412b33b，3003 ms，
   outcome timeout）、timeout（限 3 秒、实际 3 秒、outcome allowed——调用放行，
   trigger.md 写成）、value（12 秒，source by runs）。触发用 ws-c 普通会话
   （主 Agent 无写文件工具，dispatch 又因任务 proposed 被拒——两条 refused 路
   也如实记录）。规则板页呈现（ws-c，`.llm/l4rc3/ws-c-rules-detail.txt` +
   `shots/ws-c-rules-detail.png`）：条目行「脚本 · 超时 12 秒（系统按最近 1 次
   最慢的 4 秒的 3 倍定）｜最近 7 天超时 1 次｜超时或出错时放行（默认）」，
   讲细点含「脚本的来历（新的在前）：11月19日 03:07 · 12 秒 · 第一个值 · 按
   最近 1 次里最慢的 4 秒乘 3」「脚本最近的超时：… 限 3 秒 · 跑了 3 秒 · 这次
   调用放行了」「和你同意的那一版一样」。
5. **metrics L4 — PASS**。(a) 指标板页（ws-d）：topLine「11 月 19 日 02:11 算
   的 · 最近 7 天 / 前 7 天」，九组板块全渲染（你的负担/你怎么回的/问法/每一步
   （按模型）/工具/返工/派出去的任务/积分/记录范围），homeLine 三句在 healthy
   视图下不出现（读不出/没能更新/数停了的取句逻辑源码核对
   `ui/src/metrics/board.ts:69`）；引导页带 GUIDE_LINE 原句（`ws-d-panel-home.txt`）。
   (b) `/glm-status`（ws-d）：hourness 行「报告读取项目目录与用户级目录；积分
   口径：已提供；额度：已提供」——「额度：已提供」在场（简报说 metrics 行带此
   句，实际它属 hourness 行健康，metrics 行以「不再出现积分口径：未提供」呈现
   ——metrics-pricing 响应式修复的桌面欠账按两种口径都核到：metrics 行说明无
   「积分口径：未提供」（wrongPricingNote=-1，`ws-d-glmstatus-full.txt`）。
   (c) 真实会话落行：ws-e `.llm/metrics/events-2026-11-18.jsonl` 35 行
   （llm×3、turn×2、tool、said、graph×8、session/loop-holder 等）；ws-d 185 条
   →220 条；ws-c/wa 亦落。
6. **status-hub L4 — PASS**。循环板（ws-d /loops 卡 + 板页 + view.json）：
   operate.morning「晨报 · 每天 08:30 · 下次 11月19日 08:30」、operate.weekly
   「周报 · 每周一 09:00 · 下次 11月23日 09:00」（operate.patrol「夜间巡检 ·
   每天 02:30」同板；02:30 这一夜因拆臂未触发，板页「下次 11月20日 02:30」）。
   `/hourness` 两节逐字来自条目：`## 面板`（rules/peak 行「高峰：不是高峰；
   下一个高峰 14:00（GLM 积分套餐）」+ 口径行 + 范围行「范围：15 条用量记录，
   最早 02:11；只含经 DSH 发出的请求…」+ 用量行）、`## 额度`（glm/quota 条目
   「额度（服务端读数，含 ZCode 等其他客户端，读于 02:19）：5 小时已用 34% …
   每周已用 20%…」）。agent 档无 person 条目（数据目录行的项目目录未配置为
   scratch 配方已知项，与 l4bat 同，非缺陷）。
7. **M7 L4 余项 — PASS**。(a) ws-d 主 Agent hourness_report {kind:'morning'}
   出四答晨报（`.llm/l4rc3/ws-d-morning-report.txt`）：`# 晨报 2026-11-19`+
   现在（peak 行）+ 一、目标（两目标各带 M7 derivedStage 词：goal-1「分解」
   ——mod-b 已放行但无任务，按 execute-stage 表导出；goal-2「访谈」——自身
   stage）+ 二、规划/三、理由/四、架构（已采纳未验证决定 1 件）+ 在等你回话
   的 + 检查与审查 + 花了多少 + 例外。(b) 面板条件 17（ws-d，CLI 种图）：首页
   目标行模块行「2 个模块：1 个放行了 · 1 个设计中 ›」，点开「框架与模块」页
   列框架（框架：两层循环 · 已采纳）、每模块状态（模块 A 面板 · 设计中；模块 B
   检查 · 放行了）、方向清单三条逐字（`ws-d-panel-modules.txt`）。patrol spot
   与 m7-7 按 brief 不重跑。
8. **lessons path reminder — PASS**。ws-e 普通会话 Read `src/comp/a.ts`：工具
   结果后跟一条提醒，agent 逐字复述（`.llm/l4rc3/ws-e-lessons-reminder.txt`）：
   路径匹配经验 L-0c0ffe（when files src/comp/** → pitfall → fix）、组件
   AGENTS.md 决策的图上现状（decision-1 "Entries are data" (approved)、
   decision-2 (approved)）、开着的活（task-1 "Write the runner" (approved)）、
   且 GLM 路（宿主触发表不含 read）正文补上了组件 AGENTS.md 全文
   （COMP-DOC-MARK-7f3a 在场）——4b7b202c 的「宿主未送达时补正文」一支核到。
9. **loops.unsynced-daily 板面 — PASS（真火不在本车道）**。/loops 卡与板页：
   「每天下班前：查有没有没提交、没推送的改动 · 每天 18:05 · 还没跑过 · 下次
   11月19日 18:05」；view.json `action:"tell-main"`、when 每天 18:05、next
   2026-11-19T10:05:00.000Z（=18:05 UTC+8），defaults.ts 字面（title/action/
   wake:true 源码逐字核对）。18:05 真火由编排方在人的桌面另行观察。

## 缺陷与发现清单（只记录归因，不修）

1. **缺陷｜loops board 文教人打的 id 形与命令解析不一致**：MESSAGES.board 引用
   entry id（u-…），`/loops accept/reject` 只认 lp-…；照消息原样打得到用法错误。
   归因 `src/loops/tools.ts` MESSAGES.board vs `src/loops/commands.ts:25`。
2. **发现｜/loops accept 与 /rules accept 两步在缺省桌面组合不可达**：两步的
   board 路要求「主 Agent ∧ 图服务不在」；桌面主 Agent 身份由 /wish 授予，
   /wish 硬依赖图行（关行后报「项目图行没有启用，主 Agent 没有图可用」）。本
   车道用 loader `isolate` 入口选项（patch 条目 `isolate: {glmHournessGraph:
   true}`）打开了路，配方可复用；要不要把它变成缺省可达（或换一种授予主 Agent
   的方式）交编排方定。附：dsh-hmr 对 patch 的行禁用与 isolate 选项都就地生效，
   不需重启。
3. **观察｜DSH 提醒清理失败刷屏**：持臂/拆臂拍上，行健康累计「有 N 条 DSH 提醒
   这一拍没删」（N=1..11 乱序累计），板页「最近跑过的」一列重复「DSH 里的旧提醒
   没删成（多了一条 / 还没有主 Agent）」（16 条，02:12–02:24）。自动化任务页
   事后「没有已开启的自动化任务」（无存活孤儿）。归因区域：loops 绑定/对账清扫
   （bind/reminder 一侧），根因未查。
4. **观察｜env 检查结果的对话侧复述缺失**：真跑、落账、板项「跑完了，没事」俱
   在，但 agent 下一称未收到任何检查结果。投递入板有记录（recordRun），请求侧
   注入无法从会话日志判别；flash 注意与投递缺失两可，未追根。
5. **车道自伤（非产品）**：ws-a 脚本条目的 script 文本经 typefile 链后字符串
   字面量内成为裸换行，时钟真火时 SyntaxError exit 1；火路本身（到点、哈希核对、
   运行、失败上报 followup）全部按设计走。

## 预算

真实 GLM 回合 19 个（全部 glm-5.3-flash low）：ws-d 6（/wish 34s、三轮自动驱动
5+5+19s——种子目标放行模块触发驱动，agent 按指令挂起并三轮后 blocked、晨报 7s）、
ws-b 2（19s+3s）、ws-e 1（约 20s）、ws-c 4（/wish 35s、rules_propose、无写工具
的触发尝试、dispatch 被拒）、ws-a 5（forbidden 提议 16s、失败的 /wish、成功
/wish 35s、两次 propose 15s+7s）、ws-c 普通会话 1（12s）。另有脚本失败 followup
在 ws-a 待取（可能再耗回合）。/loops、/rules accept、/glm-status、/hourness 为
本地命令不计模型。额度读数：02:19 面板 5 小时 34%、每周 20%（含人的其他客户端）。

## 收尾状态（teardown）

- 凭证副本已删并递归名扫描核净（credentials.json / device-mid.txt /
  .credentials.yaml / .anonymous-user-id 四名全仓 `%TEMP%\l4rc3` 无命中）。
- 实例退出：Browser.close 三发（18:37Z、18:40Z、18:42Z）均出现壳退出确认框
  （#32770，题「DeepSeek Harness」，钮「退出/取消」，`.llm/l4rc3/shots/` 无框体
  时刻截图、`ws-d-board-remfail.txt` 同期的进程与窗口枚举在案），每发约 2 分钟
  后框自消、退出中止、应用回到存活态——按纪律不代点、不杀进程，车道在此停下：
  实例仍在跑（主 pid 18820，命令行带 `--glm-hourness-l4rc3` 标记），请人在框上
  点「退出」（或「取消」保留），之后整个 `%TEMP%\l4rc3` 可复查后删除。相位 B 的
  graph 行开关与 isolate 行仍写在 scratch patch 里（仅 scratch，不涉人的
  profile）。
- 桌面锁 `.llm/desktop-lock/owner.txt` 随收尾删除；`.llm/logs/l4rc3-build.log`
  与 `.llm/l4rc3/`（本文件引用的全部证据、cdp 日志、截图）留主检出。
- 人的 `~/.dsh` 只读复制凭证，值未打印；`.worktrees/ablation-trial`、
  `.worktrees/comms-split` 未触碰；主检出跟踪文件零改动（build 产物 dist 与
  本任务目录除外）。
