# 面板与新手引导：第二轮批次图（panel-2）

依据：决策 `d-panel-released`（设计 1.3 与 17 条做完条件，人话版 `.agents/tasks/plain-ui/onepage-done.md`）、`.agents/tasks/plain-ui/design.md` 1.3（§4.7、§5.2–§5.5、§6、§9.2、§10）、节点 `m8-plain-language`（验收第 1–10、17 条）与 `onboarding`（第 11–16 条）、上一轮批次图 `.agents/tasks/panel/impl-plan.md`（P0–P8，已随合并提交 `51ca652` 进 main）。相关已定决策：`d-ask-three-gates`、`d-desktop-direct-use`、`d-desktop-cdp-only`、`d-parallel-lanes-desktop-free`。

基座：分支 `panel-2`，工作树 `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\panel-2`，起点 origin/main `3276d0e`，规划时快进到 `c48e421`（含 loops-runner `a9adca8`、user-graph UG3–UG7 `91f1dbd`、metrics `31c9e0f`）。规划时实测：`npm run build` 退出码 0（`.llm/logs/p2-plan-build.log`），`npm run preflight` 退出码 0，`npm test` 结果见文末「规划时的基线」。

## 1. 现状对照（main `c48e421` 上，实读）

- P1–P8 的代码都在 main：`graphLive.awaiting`、`src/graph/plain-view.ts`、面板只读、首页五段与第二层、`seen.ts`、`useMainAgent`、上手页与两张卡、GLM 上手、hook 顺序修复。
- 板块登记表（`ui/src/graph/boards.ts`）现在有三块板：经验板（`ui/src/lessons/LessonsPage.tsx`）、循环板（`ui/src/loops/LoopsPage.tsx`，loops-runner 合入）、指标板（`ui/src/metrics/board.tsx`，metrics 合入）。没有规则板页面，任何分支上都没有。循环板走 `projectionBoard`，`homeLine` 恒为 `null`；它的页面没有脚本原文、超时来源、来历与超时记录（loops-runner 顺延的第 2、5 项）。所以上手页第 5 块此刻在运行时会出现，第 4 块不会；`docs/ORCHESTRATION.md` §2.10「上手」一条还写着「此刻登记表里只有经验板」，已过时。
- `src/graph/plain.ts` 不在；`GraphNode` 没有 `why`；`PLAIN_LIMITS` 只有 `title`、`background`（`src/graph/schema.ts`）。M3 的 `propose_to_human` 已对 `text`、`title`、`proposal`、`reason`、`cost`、`notTaken`、`ways` 跑 `plainWordsIn` 并直接拒绝（`src/design/propose.ts` 的 `checkPlain`）。`tests/propose-to-human.spec.ts` 末尾留着一条跳过的契约测试，写明「带来 plain.ts 的那个提交去掉跳过，并断言上面的几道题在第二阶段的常量下引擎不警告、不拒绝」。
- `tests/graph-plain-view.spec.ts` 里有一份本地的写法检查替身（`plainIssues`，四条正则），注释说它是「引擎检查落地之前 L2 能钉的那一部分」。
- 节点页（`ui/src/graph/NodeDetail.tsx`）没有「为什么」一节；首页与节点页的状态字取 `ui/src/graph/model.ts` 的 `statusText`，人定的待决写「等你拍板」，而设计 §5.4 的状态短语表与 `plain-view.ts` 的 `statusPhrase` 写「等你回话」（桌面走查记下的「措辞小项」）。流程条（`ui/src/flow/model.ts` 的 `waitDecide`，M3 的设计，`docs/ORCHESTRATION.md` 流程条一节）也写「等你拍板」，那是 M3 的字，本轮不动。
- 可见信号：`ui/src/graph/Panel.tsx` 的到达与离开仍按 `IntersectionObserver` 加 `document.visibilityState === 'visible'` 判断；桌面宿主的 `visibilityState` 恒为 `hidden`（`docs/FACTS.md` §3），所以「上次看之后」的本机记录在桌面版上从不写入，`useMainAgent` 只在挂载时读一次记录。换信号源要人定（`d-panel-released` 2026-11-04 批注的阻断②），图上没有答复。
- 接管命令 `/hourness-init` 不在 main；M7 的 `derivedStage`（E1b）只在 `origin/m7`；`execute/stopped-quota` 不在任何已合入的代码里；图上没有 `norm-directions`。
- 本仓库图（`c48e421`）：250 个节点，未关闭 126 个（任务 30、特性 16、决策 67、目标 1、规范 5、风险 7，没有未关闭的待决）；其中 29 个的标题按 §5.3 的规则会被报（编号、反引号、标识符、英文状态词、内部词或超过 40 个码点，规划时用正则粗数）。
- `tests/lessons-seed.spec.ts` 要读 `.agents/tasks/m5/lessons-seed.json`，这个文件按 `.gitignore` 不入库，新工作树里没有，`npm test` 在这一个 spec 停下（规划时第一次跑退出码 1）。别的工作树都从主检出拷了一份；规划步已把主检出的那份拷进本工作树（只读主检出）。
- 探针在工作树里跑时，循环行把不给 cwd 的场景认到主检出，改写主检出被忽略的 `.llm/loops/view.json`（loops-runner L4 发现 (b)，修法归 loops-machine 线，修好之前照跑并记录，编排方 2026-11-05 答复）。

## 2. 这一轮能做的批次

每批一个提交，文档同批；每批跑全量门禁（§4），四道退出码为 0、探针全绿后推 `origin/panel-2`。执行顺序 Q1、Q2、Q3、Q5、Q4（L4 在最后，核对的是最后的构建）。`提交与落地`一列：每批在下一批的提交里补记上一批的提交号，本批写「本批」。

人 2026-11-05 的答复（编排方转达，原话「没问题就把线全开吧」，同意编排方的三条建议）：一、可见信号换源（原 §3 第一行）照建议做，新增 Q5；二、第 1、6、9、17 条按 §5 改字，意思不变，新字写进 `.agents/tasks/plain-ui/onepage-done.md`，逐条对照写进 `.agents/tasks/panel/conditions-rewrite.md`，写进图归编排方；三、流程条的「等你拍板」随 Q1 统一为「等你回话」。

| 批 | 内容 | 覆盖的做完条件 | L2 / L3 | 同批改的文档 | 桌面 L4 | L4 能否只用本分支产物 | 提交与落地 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q0 | 本计划 | — | — | 本文件 | — | — | `95f10df`（规划步提交，随 Q1 推送） |
| Q1 | 状态字统一：`statusText` 对人定的待决写「等你回话」，与设计 §5.4 和 `statusPhrase` 同字；文档同步：§2.10「上手」一条改写登记表现状（经验板、循环板、指标板在，第 5 块随循环板出现，第 4 块等规则板页面），HANDOFF 面板一行改成合入后的状态并指向本计划 | 6（状态字与「等你回话」同字） | L2：`tests/graph-panel-model.spec.ts` 的 `statusText` 断言改字；L3 不涉及 | `docs/ORCHESTRATION.md` §2.10、`docs/HANDOFF.md` 面板一行 | 随 Q4 看首页与节点页的状态字 | 能 | `e27ca27`（门禁 0/0/0/0，test 2940 个 2939 过 0 败 1 跳过，probe 376/376，棘轮 73/18/1）。另含人 2026-11-05 答复的二、三两条：流程条 `waitDecide` 改「等你回话」（`tests/flow-bar.spec.ts` 同改，ORCHESTRATION 流程条一节同改；「待你拍板 N」不在答复里，没改）；第 1、6、9、17 条改字（`onepage-done.md`、`conditions-rewrite.md`）。第 9 条按 main 上的实际写：问话与那几行的换词表与长度从第一天起拒绝，其余规则先警告后拒绝，理由在 `conditions-rewrite.md` |
| Q2 | 写法检查第一阶段（设计 §5.2、§5.3、§9.2 第 1 步）：新文件 `src/graph/plain.ts`（`plainIssues`、按节点的检查、阶段常量 `PLAIN_PHASE = 1`）；`why` 字段（schema、读写校验、写出顺序紧跟 `title`、`LLM_EDITABLE` 加 `why`；目标的 `why` 沿用「目标 llm 不能改」的现有分支）；引擎对 `llm`、`harness` 的写入算 `warnings`（第一阶段照常写入；第二阶段的拒绝路径也写好，只经引擎选项 `plainPhase` 在测试里打开）；只改正文时的提醒；读入时未关闭节点的提示；图工具 schema 加 `why`、写结果加 `warnings`、`title`/`why` 说明加人话一段与换词表；节点页「为什么」一节与写法提示；`graph-plain-view.spec.ts` 的替身换成真检查；去掉 M3 留的契约测试跳过 | 9（第一阶段，标题与一句话理由；问话那几行见 §5）；2（给改写提供检查） | L2：新 `tests/graph-plain.spec.ts`（进 `npm test` 列表），改 `graph-engine`、`graph-tools`、`graph-plain-view`、`propose-to-human`、`graph-render` 几个 spec；L3：探针 `glm-graph` 场景加两步（工具 schema 带人话一段；标题含 `M3` 的提议拿到 `warnings`） | `docs/ORCHESTRATION.md` §2.6（`why` 字段与写法规则，编排方经命令行写图照它写）、§2.9（检查顺序、`warnings`、阶段常量）、§2.10（命令行与图工具的写结果、节点页「为什么」）、`docs/HANDOFF.md` | 随 Q4 看节点页「为什么」与写法提示 | 能 | `e60f80b`（门禁 0/0/0/0，test 2956 个全过 0 跳过，probe 378/378，棘轮 73/18/1；改了引擎写入权限，等工作流的独立评审）。落地与计划的不同：`graph_edit` 的写法一段放在 `set` 的说明里（工具说明有 600 字的上限测试）；节点页的写法提示用中文说规则（「标题带路线或章节编号」），不念英文规则名；`whyOf` 读目标正文「问题：」一节时用需求卡的整套标签（`stage.ts` 的 `CARD_LABELS` 改为导出），段落在下一个标签处结束；几处夹具图的「没有问题」断言改为只看形状问题（夹具标题多是 id，写法提示在 `graph-plain.spec.ts` 里测） |
| Q3 | 现有节点改写的对照表（设计 §5.5 的 agent 一半）：`.agents/tasks/panel/title-rewrite.md`，每个未关闭节点一行（id、旧标题、新标题或「不改」、`why`），新标题与 `why` 全部过 Q2 的 `plainIssues`；末尾一段按 `d-ask-three-gates` 的 `recommend` 问法写好交给人的话（问话、推荐、理由、不选的那种），附件即表。不写图 | 2（agent 一半；人回话与写图在等） | 无代码；核对用一次性脚本跑 `plainIssues`（不入库） | 本文件 §3 的等待表、`docs/HANDOFF.md` 面板一行 | 无 | — | 本批。取图 `d96d009`（合入 origin/main `cb7d02c`），修订号 `f8d50739d4f7`，未关闭 126 个，126 行；改标题 37 行（读入带写法提示的 34 个，加用了换词表上的词的 3 个），其余「不改」；每行都写 `why`；一次性脚本核对输出为空 |
| Q5 | 可见信号换源（人 2026-11-05 同意）：面板可见改为「挂载着、窗口有焦点，且 `IntersectionObserver` 没有报不相交」（观察器只作加强：桌面宿主里它连初始回调都不派发，`docs/FACTS.md` §3），不再读 `document.visibilityState`；`seen.ts` 加 `watchVisibility`（注入窗口焦点与观察器，纯逻辑）；`Panel.tsx` 的到达与离开改用它，挂载时补发 `mount`（此前从不发，第一次到达读不到本机记录）；`MainChat.tsx` 的读取时机抽成 `main-chat.ts` 的 `recordReads`：挂载时读一次（不管可见与否），变为可见时读，可见期间每 30 秒读 | 4（「上次看之后」在桌面版上能记下）；6 的「去哪回话」一行在桌面版上读得到主 Agent 记录 | L2：`tests/graph-panel-model.spec.ts` 加 `watchVisibility`（初值、焦点、观察器否决、只在变化时报、停止后不报）、`recordReads`（挂载读一次、变可见读并轮询、隐藏停轮询、可见挂载不重复读）与挂载到达读记录；L3 不涉及（客户端没有 L3） | 设计 §6.8 可见的定义、`docs/ORCHESTRATION.md` §2.10 版面一条的「上次看之后」与「主 Agent 的位置」一条、`docs/FACTS.md` §3 那一行的「可改用」改成已改 | Q4 里做走查 C/D（离开与回来后「上次看之后」的窗口、主 Agent 记录的读取） | 能 | — |
| Q4 | 桌面 L4（本分支 Q3 之后的构建）：隔离实例（独立 `--user-data-dir`、独立 `DSH_HOME`、独立 CDP 端口、命令行标记，两个包经 junction 指向本工作树的 `packages/`），按设计 §10.3 第 1、3、4、5（部分）、7、8、9、10、11 项核对，另记阻断②的现状；报告 `.agents/tasks/panel/l4-<日期>.md` | 1（首屏不滚动）、11、12（第 4 块除外）、13（未登录一支）、14（接管行不在的一支）、15、16；5、6、7 复核 | 无新 L2/L3 | `.agents/tasks/panel/l4-<日期>.md`、`docs/HANDOFF.md`、`docs/ORCHESTRATION.md` §2.10 验证一条、`docs/FACTS.md` §3（新的宿主事实，例如 `sidebarRight.openTab` 在开场画面的结果、`uiWorkspace` 是否注入） | 本批就是 | 能：实例只加载本工作树的产物；锁目录 `.llm/desktop-lock` 建在主检出（编排方 2026-11-05 准许，同 probe-lock 的例外） | — |

顺序依赖：Q3 要 Q2 的 `plainIssues` 与 `PLAIN_LIMITS.why`；Q5 只改客户端，与 Q2、Q3 互不依赖；Q4 在 Q1–Q3 与 Q5 之后，核对的是最后的构建。Q1 与 Q2 互不依赖，Q1 先做是因为它小，先把 HANDOFF 改到合入后的状态。

## 3. 仍要等的项

| 项 | 等什么 | 等谁 |
| --- | --- | --- |
| 第 1、6、9、17 条的新字写进图上的验收 | 新字已在 `onepage-done.md` 与 `conditions-rewrite.md`（Q1）；`docs/graph` 归编排方 | 编排方带人的原话写图 |
| 第 9 条第二阶段（拒绝）与 `graph_propose` 引用 `PLAIN_QUESTION_GUIDE`（§9.2 第 8 步） | 前提 (a) 现有节点改写已写入图；(b)(c) 每个以 `llm`/`harness` 写人要读的字段的入口各有契约测试，含接管的三个规范模板；第 9 条已按新问法改字（Q1）：问话与那几行的换词表与长度归 M3，从第一天起拒绝，写法检查在两个阶段里查 `proposal`、`notTaken`、`conclusion` 的其余规则 | 人回 Q3 的对照表、编排方带原话写图；接管线（bootstrap-implementation） |
| `background` 字段与 `background` 规则（§5.2、§5.3） | main 上没有任何写入方写 `background`（`propose_to_human` 的字段是 `ask`、`proposal`、`reason`、`cost`、`ways`、`notTaken`），加这条规则会让每道 M3 的题都报警。第 9 条按新问法改字（Q1）之后，没有哪条做完条件要求背景一行，这一字段与规则不做 | 编排方定要不要在设计稿 §5.2、§5.3 上划掉它（本线不改设计稿的这两节） |
| 第 2 条：现有节点的新标题与 `why` 写进图 | 对照表 `.agents/tasks/panel/title-rewrite.md` 已写（Q3），末尾是按 `recommend` 问法交给人的话；人同意或改、带原话写入；`docs/graph` 归编排方 | 编排方交人并写图 |
| 第 8 条：规则板页面（会挡住动作的门、写在代码里的规则的拦下记录与撤下一行、你定的规则、只记下不挡）与上手页第 4 块 | 规则板没有客户端页面，也没有哪条线在做；拦下与撤下的条目（`rules/denials`、`rules/lifts`）在 `origin/status-hub-2`，没进 main | 编排方排规则板页面；状态板块余批（status-hub-remaining 线） |
| 第 8 条：循环板条目的脚本原文、超时来源四种、来历与超时记录 | 循环板的页面数据还没有这些字段（loops-runner 顺延第 2、5 项：`scriptDetail`/`commandDetail`、`staleEntries`/`timeoutEntries`） | 循环板线（loops-machine 之后排） |
| 第 8 条 (d)：「推进停住」一行 | 停住原因与重置时刻的数据（M7 的 `execute/stopped-quota`）与状态板块的 M7 读路都不在 main；循环板 `homeLine` 恒为 `null` | M7 线（m7-seam-and-e7）、状态板块余批 |
| 第 14 条：接管行在的一支（「建一张项目图」按钮、指向 `/wish` 的那一节字、判图法） | `/hourness-init` 不在 main | 接管线（bootstrap-implementation） |
| 第 17 条：真图上的「框架与模块」与「在开发」一档 | 图上没有 `norm-directions`；`moduleStateOf` 的「在开发」要 M7 的 `derivedStage`（E1b，在 `origin/m7`） | 编排方与人写方向清单；M7 线 |
| 第 13 条：读到已登录一支的桌面核对 | 隔离实例里没有 GLM 凭证；不往隔离实例拷用户的凭证 | 合入后的批次 L4（用人的 profile）或人当场登录 |
| 上手页第 3 块「人设设置位」一行、「`/wish` 没注册」一支 | 要客户端看得见的设置在场信号与命令注册信号；Q4 只记录有没有这两种信号，不改代码 | Q4 的记录出来后由编排方排 |

## 4. 每批的门禁与纪律

- 每批开始前：`git -C <工作树> fetch origin`；origin/main 有新提交就 `git -C <工作树> merge origin/main`（不改写历史），合并后先跑完下面四道再改代码。
- 四道门禁串行，日志写 `.llm\logs\p2-<批>-<道>.log`，退出码在 `cmd /c "... > log 2>&1"` 之后取 `$LASTEXITCODE`：`npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`。
- 棘轮（`npm test` 开头 `check-lint` 的三行）：规划时实测 eslint 73 suppressed / knip 18 / jscpd 1，比任务给的上限 76 / 19 / 1 低，按实测值算，不许上升；新文件的导出都要有使用方。
- 探针锁：先 `New-Item -ItemType Directory C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\probe-lock`，失败试 `...\.llm\probe-lock-2`，两个都在就每 60 秒重试；建于 45 分钟以前的锁目录视为残留可删；结束后删掉自己取的那个；探针跑着时不重建本工作树。
- 探针与主检出的 `view.json`：跑探针前看 `git -C <工作树> log origin/main --format="%h %s" -- scripts/probe/run-probe.mjs`，有 loops-machine 线让场景目录各自成为 git 仓库的提交就先合并 origin/main；没有就照跑，前后各记一次 `C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\loops\view.json` 的修改时间与 SHA-256（`Get-FileHash`），变了写进报告，不算失败。
- 负载下的纯计时失败：先单独重跑该 spec 3 次再归因。
- 除 `.llm/probe-lock*` 与 Q4 的 `.llm/desktop-lock` 外不往主检出写任何东西；不编辑 `docs/graph`；不动 `~/.dsh`；不强推；一批一个提交，推 `origin/panel-2`，不推 GitHub（GitHub 只跟 main）。
- 提交信息照前一轮的样子：`feat(panel): …（plain-ui 1.3 Q2）` 一类，正文列改了什么、门禁数字。

## 5. 第 1、6、9、17 条换新问法时要改的地方（规划时只列；人 2026-11-05 同意改字，Q1 按下面几条改了，新字见 `conditions-rewrite.md`）

main 上的问法是 `d-ask-three-gates`：一句问话（`ask`），按四种问法 `recommend`、`choose`、`want`、`look` 带几行——推荐或猜测（`proposal`）、理由（`reason`）、代价（`cost`）、几种做法（`ways`）、不选的那种（`notTaken`）；主 Agent 在对话里交的还有 `confirm`（确认需求）与 `release`（放行方案）。面板按这个落地（P2、P4 的落地记录）。四条里写着旧问法的地方：

1. 第 1 条：「不用滚动就能看到『效果是』和『需要你』第一件的题目与背景」。新问法没有「背景」一行；要改成第一件的题目与那句问话（`ask`）。
2. 第 6 条：「图上等你回话的题（背景、推荐、疑问、不做四行）」，以及「第一件四行都显示，其余先显示题目和背景」。要改成：题目、问话与按问法给的那几行（推荐或猜测、理由、代价、几种做法、不选的那种），第一件整件显示，其余先显示题目和问话。主 Agent 在对话里交的确认需求与放行方案也按这个样子显示。
3. 第 9 条：「待决的背景和四行，违反写法规则时，先给警告，后来改成直接拒绝」。新问法的字段是问话与上面那几行；其中内部词与长度 M3 从第一天起就直接拒绝（`propose_to_human` 的 `checkPlain` 与长度检查），没有先警告的阶段，「先警告、后拒绝」只对标题与一句话理由（`why`）成立。要改的是「背景和四行」这几个字，以及要不要写明问话那几行一开始就拒绝。
4. 第 17 条：本身没有「四行」字样；它的「一个模块等你放行时进『需要你』」沿用第 6 条的卡片样子。第 6 条改了以后这条可以不改字；要写明的话，加半句「按那次放行交给你的问法显示」。

另：面板的状态字统一成「等你回话」（Q1）之后，流程条仍写「等你拍板」（M3 的字）；要不要也统一，随这一轮改字一起问。

## 6. 实施

- [x] 1. （Q0）提交本计划。规划步已做：本地提交，只含本文件，没有推送；推送随第 2 项一起。
      Files: `.agents/tasks/panel/impl-plan-2.md`
      Verify: `git -C <工作树> show --stat HEAD~0` 在第 2 项之前只有这一个文件。

- [x] 2. （Q1）`ui/src/graph/model.ts` 的 `statusText`：人定的未拍板待决返回「等你回话」（与 `plain-view.ts` 的 `statusPhrase`、设计 §5.4 状态短语表同字），agent 定的仍是「agent 来定」；`tests/graph-panel-model.spec.ts` 的断言跟着改。同一个提交改两处文档：`docs/ORCHESTRATION.md` §2.10「上手」一条把「此刻登记表里只有经验板」改成现状（登记的是经验板、循环板、指标板；第 5 块在循环板对这个会话可用时出现；第 4 块等规则板页面）；`docs/HANDOFF.md` 第 155 行面板一行改成：P0–P8 已随 `51ca652` 进 main，第二轮在分支 `panel-2`（工作树 `.worktrees/panel-2`），批次图 `.agents/tasks/panel/impl-plan-2.md`，排期在后的项按本计划 §3 写（去掉已过时的「GLM 上手在下一批」）。
      Files: `ui/src/graph/model.ts`、`tests/graph-panel-model.spec.ts`、`docs/ORCHESTRATION.md`、`docs/HANDOFF.md`
      Verify: §4 四道门禁退出码 0；`node --experimental-strip-types tests/graph-panel-model.spec.ts` 全过；棘轮不升。

- [x] 3. （Q2-a，检查本体与字段）新建 `src/graph/plain.ts`：纯函数，不用 Node 内置模块（客户端也导入）。导出 `plainIssues(text, field, ids)`（设计 §5.3 的 9 条规则里除 `background` 以外的 8 条：`code`、`id`、`identifier`、`enum`、`term`、`typeWord`（只对 `field === 'generated'`）、`jargon`（调 `plain-question.ts` 的 `plainWordsIn`，提示里给 `PLAIN_WORDS` 右边的说法）、`length`（`title` 40、`why` 80，含换行也算），返回 `{rule, field, message, hint}` 列表）；导出按节点的检查 `nodePlainIssues(node, ids, fields?)`：查 `title`、`why`，题目是提议式的（无 `options`）时另查 `proposal`、`notTaken`、`conclusion`；`jargon` 只对待决的这几项与状态为 `proposed` 的节点的 `title`、`why`；`reason`、`cost`、`ways`、`ask` 不查（M3 已直接拒绝）；导出 `PLAIN_PHASE: 1 | 2 = 1`。`src/graph/schema.ts`：`PLAIN_LIMITS` 加 `why: 80`；`GraphNode` 加 `readonly why?: string`；`NODE_FIELDS` 与 `EDITABLE_FIELDS` 都把 `why` 放在 `title` 后面。`src/graph/format.ts`：`FIELD_CHECKERS.why = line`；`checkNode` 里 `why` 超过 `PLAIN_LIMITS.why` 或出现在待决上报错误（跨字段错误）；`GraphIssue` 加可选的 `rule?: string`（只有写法提示带它）。`src/graph/parse.ts` 的 `parseGraph`：节点都读完之后，对状态不是 `done`、`dropped`、`superseded` 的节点跑 `nodePlainIssues`，每处一条 `severity: 'notice'`、带 `field` 与 `rule` 的提示；已关闭的不查。
      Files: `src/graph/plain.ts`（新）、`src/graph/schema.ts`、`src/graph/format.ts`、`src/graph/parse.ts`、`tests/graph-plain.spec.ts`（新，加进 `package.json` 的 `test:1`/`test:2` 链里 `graph-plain-view.spec.ts` 旁边）
      Verify: `node --experimental-strip-types tests/graph-plain.spec.ts` 全过：设计 §10.1 第一条列的命中与不命中（`M3`、`M8.1`、`3.1 `、`§4`、`V-01` 命中，`1.5 倍用量`、`2.5 小时` 不命中；图里有的 `m3-1` 命中、`split` 不命中；`graph_focus`、`graphLive`、反引号、`panel-row.ts` 命中，`/wish`、`ZCode`、`GLM-5.3`、`dsh-glm-zcode`、`macOS`、`iPhone` 不命中；英文状态词；「节点」报 `term`、「投影」只报 `jargon`；`typeWord` 只对 `generated`；`jargon` 对提议式待决的标题与几行、对提议节点的 `title`/`why` 命中，对进行中任务的标题不命中；长度按码点、含 emoji，40/41、80/81 两边）；加了 `why` 的节点文件读入再写出字节不变；待决带 `why` 报错误；读入提示只对未关闭的节点。`tests/graph-render.spec.ts` 第 388 行「node files are valid and canonical」对本仓库图的断言改成只排除带 `rule` 的写法提示（规范形状的提示仍要为空）。`npm run build` 退出码 0。

- [x] 4. （Q2-b，引擎与工具，依赖第 3 项）`src/graph/engine.ts`：`EngineOptions` 加 `plainPhase?: 1 | 2`（默认 `PLAIN_PHASE`，测试照 `now` 的样子钉它）；`LLM_EDITABLE` 加 `'why'`（目标的 `why` 走现有的「llm 不能改目标」分支，带原话照常可改）；`ApplyResult` 成功一支加可选的 `warnings: readonly string[]`（英文，写规则、字段路径如 `node.title`/`set.why`、改法）；写法检查排在 `commit` 里整图校验之后：只对 actor 为 `llm`（带不带转述都查）与 `harness` 的写入，`propose` 查新节点的上述字段，`edit` 只查改到的字段，提议式 `decide` 查 `conclusion`；第一阶段照常写入并带 `warnings`；第二阶段返回 `invalid`（`field` 是字段路径，`hint` 写规则与改法），`conclusion` 两个阶段都只警告；`edit` 改了 `body` 或 `acceptance` 而没改 `title`、`why` 时 `warnings` 多一条「title and why still say it?」一类的提醒，从不拒绝；`human` 写入不查。`src/graph/tools.ts`：`NODE` 加 `why`（一句话，至多 80 字，说为什么做、做成后有什么不同；待决不带），`title` 与 `why` 的说明加设计 §5.3 末尾那段人话（去掉讲 `background` 的半句，换词表逐项列 `PLAIN_WORDS`），`graph_edit` 的说明把 `why` 列进可改字段；`WRITE_OUTPUT` 加 `warnings: { type: 'array', items: { type: 'string' } }`。`src/graph/cli.ts` 不用改（原样输出 `apply` 的结果），文档里写上 `warnings`。`tests/propose-to-human.spec.ts` 末尾的跳过去掉，按它的注释断言：存下的四道例题 `nodePlainIssues` 为空，且在 `openEngine(dir, { plainPhase: 2 })` 下以 `llm` 提议同样字段的题成功、没有 `warnings`。`tests/graph-plain-view.spec.ts` 的本地 `plainIssues` 替身删掉，`clean` 改用真 `plainIssues(text, 'generated', ids)`；模板文字若被真检查报出，改模板文字，不放宽规则。
      Files: `src/graph/engine.ts`、`src/graph/tools.ts`、`tests/graph-engine.spec.ts`、`tests/graph-tools.spec.ts`、`tests/propose-to-human.spec.ts`、`tests/graph-plain-view.spec.ts`、`tests/graph-plain.spec.ts`
      Verify: 引擎用例全过（第一阶段 `llm`、`harness` 的提议与编辑拿到 `warnings` 且写入成功；`human` 不查；带转述的查；只改正文的提醒；`plainPhase: 2` 下 `invalid` 的 `field` 与 `hint`；`conclusion` 在第二阶段也只警告；`llm` 能改非目标节点的 `why`、不带原话不能改目标的 `why`）；`graph-tools.spec.ts` 的 schema 子集检查过（rc.3 收下带 `warnings` 的输出 schema）；`npm test` 退出码 0。这一项改的是 `src/graph/engine.ts` 的写入权限，属 `docs/DEVELOPMENT.md` §1.1 的独立评审范围，提交信息写明，评审由工作流的评审步做。

- [x] 5. （Q2-c，面板与探针、文档，依赖第 4 项，与第 3、4 项同一个提交）`ui/src/graph/NodeDetail.tsx`：正文之后加「为什么」一节，取 `plain-view.ts` 新导出的 `whyOf(node)`（节点的 `why`；目标没有 `why` 时取正文里以「问题：」开头的那一段，设计 §3.2）；节点页底部 id 那一块列出这个节点的写法提示（`graph.issues` 里文件是这个节点、带 `rule` 的），小字，只看。探针 `scripts/probe/run-probe.mjs` 的 `glm-graph` 场景（`runScenario('glm-graph', …)`）加两步：图工具 schema 里 `graph_propose` 的说明带人话一段；以标题含 `M3` 的节点调 `graph_propose`，结果 `ok` 且 `warnings` 里有 `code`。文档：`docs/ORCHESTRATION.md` §2.6 加 `why` 字段与写法规则（编排方经 `npm run -s graph` 写图照这几条写），§2.9 写检查顺序、`warnings` 与阶段常量，§2.10 的命令行与图工具表把写结果改成 `{ok, id, rev, revision, node, changed, warnings?}`、节点页一条加「为什么」与写法提示；`docs/HANDOFF.md` 面板一行与 `design` 行里「面板设计的写法检查第二阶段（`src/graph/plain.ts`）不在 main，契约测试里留了显式跳过」一句改成第一阶段已在、第二阶段等什么；`docs/DEVELOPMENT.md` §12 若写了命令行输出的形状，同改。
      Files: `src/graph/plain-view.ts`、`ui/src/graph/NodeDetail.tsx`、`tests/graph-plain-view.spec.ts`（`whyOf` 用例）、`scripts/probe/run-probe.mjs`、`docs/ORCHESTRATION.md`、`docs/HANDOFF.md`、`docs/DEVELOPMENT.md`（若需要）
      Verify: §4 四道门禁退出码 0，探针多出的两步通过、总数比合并后的基线多 2；`tests/graph-panel-model.spec.ts` 的只读断言仍过（`ui/src/graph` 下无 `commands.execute`）；棘轮不升。一个提交推 `origin/panel-2`。

- [x] 6. （Q3，依赖第 5 项）写 `.agents/tasks/panel/title-rewrite.md`：开头写取图的提交号与未关闭节点数；表头 `id | 类型 | 旧标题 | 新标题 | why`；每个未关闭节点一行（规划时 126 个，按取图时数），旧标题已过检查且不超过 40 个码点的「新标题」写「不改」；每行的 `why` 都写（一句，至多 80 个码点，说为什么做、做成后有什么不同，读节点正文写，不编）；目标 `hourness` 那一行标注「目标的标题与 why 只有人或带原话的 llm 能改」。表后一段写交给人的话，按 `recommend` 问法：问话一句（以一个问号结尾）、推荐（照表改）、理由、不选的那种（等以后改到再一个个改），并写明最没把握的几行是哪几行。不写图，不改 `docs/graph`。
      Files: `.agents/tasks/panel/title-rewrite.md`（新）、`docs/HANDOFF.md`（面板一行加「对照表已写，等人回话」）
      Verify: 一次性脚本（放 `.llm/panel-2/`，不入库，用完删）读表，对每个「新标题」（「不改」的取旧标题）与 `why` 跑 `plainIssues` 与 `PLAIN_LIMITS`，输出为空；表的行数等于取图时未关闭节点数（规划时 126）；§4 四道门禁退出码 0（只改文档，仍跑全量）。一个提交推 `origin/panel-2`。

- [ ] 8. （Q5，人 2026-11-05 同意；在第 6 项之后、第 7 项之前做）可见信号换源。`ui/src/graph/seen.ts` 加 `watchVisibility(host, onChange)`：`host` 给出 `hasFocus()`、窗口 focus/blur 的订阅与可选的相交观察；可见 = 窗口有焦点，且观察器没有报过不相交（观察器从不回调时不否决）；开始时报一次初值，之后只在变化时报，停止后不再报。`ui/src/graph/Panel.tsx`：到达与离开的效果改用它（真实窗口与 `IntersectionObserver` 的薄适配），开始时先发 `mount`（`since` 读本机记录），卸载或换键时发 `unmount`；`bodyVisible` 跟着它。`ui/src/graph/main-chat.ts` 加 `recordReads(read, visible, timers)`：开始时读一次，可见时每 30 秒读，变为可见时立刻读一次并开始轮询，变为不可见时停；`MainChat.tsx` 的 `useMainAgent` 用它（换记录路径时重建，可见变化时通知）。文档：设计 §6.8 可见的定义改写（旧文本留在 git 历史里），`docs/ORCHESTRATION.md` §2.10「主 Agent 的位置」与版面一条的「上次看之后」、`docs/FACTS.md` §3 那一行。
      Files: `ui/src/graph/seen.ts`、`ui/src/graph/Panel.tsx`、`ui/src/graph/main-chat.ts`、`ui/src/graph/MainChat.tsx`、`tests/graph-panel-model.spec.ts`、`.agents/tasks/plain-ui/design.md`、`docs/ORCHESTRATION.md`、`docs/FACTS.md`、`docs/HANDOFF.md`
      Verify: §4 四道门禁退出码 0；`node --experimental-strip-types tests/graph-panel-model.spec.ts` 全过；`ui/src/graph` 下不再出现 `visibilityState`；棘轮不升。一个提交推 `origin/panel-2`。Q4 里做走查 C/D。
- [ ] 7. （Q4，依赖第 6 项）桌面 L4，只用本工作树第 6 项之后的构建：
      - 准备：把 `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\panel\.llm\panel-310-l4\` 里的 `launch.ps1`、`install-bundles.mjs`、`cdp.mjs`、`drive.mjs` 等脚本只读拷到 `.worktrees\panel-2\.llm\panel-2\l4\`（不改旧工作树），改：标记 `glm-hourness-panel2-l4`、CDP 端口取一个空闲的（先查 `Get-NetTCPConnection -LocalPort`，9333、9336 不用）、`user-data-dir` 与 `dsh-home` 在新目录下、`install-bundles.mjs` 的仓库根改成从 `.llm/panel-2/l4` 往上三层（本工作树根）。装后核验 junction 指向本工作树的 `packages/glm`、`packages/hourness`。
      - 锁：主检出没有 `.llm\desktop-lock` 时才建，`owner.txt` 写 workflow id、步骤名与时间，至少每 10 分钟重写一次，用完删掉；`owner.txt` 超过 30 分钟没有重写才算残留，删时写进报告。不杀、不停人正在跑的桌面实例，只按标记结束自己的进程树；等旧进程退出与 userData 锁释放再起。
      - 操作只经 CDP（不注入系统鼠标键盘）；往会话里输入前经 CDP 核对当前会话是本任务建的临时会话。临时工作区建在 `.llm\panel-2\l4\ws-*`：没有图的、只有空 `nodes/` 的、一张没有身份 human 历史的临时图（经 `npm run -s graph -- --dir <临时图> --file <请求>` 以 llm 写一个目标、几个任务、一道提议式的人定待决、一道选项式的旧待决、一个带 `why` 的节点、一个标题含 `M3` 的节点）、本仓库 `docs/graph/nodes` 的拷贝（有 human 历史）。
      - 核对（设计 §10.3 编号）：第 1 项首页（五段次序、无页签、1280×800 与右侧栏默认宽度下不滚动看到「效果是」与第一件的题目和问话、320 px 无横向滚动、深浅主题各一套与减弱动效一张、点进第二层再回来列表不变）；第 3 项在临时工作区发不带话的 `/wish`、另一个会话里「去主 Agent 的对话回话 ›」是导航不是命令、`/wish off` 后「还没有主 Agent」；第 4 项计划页与节点页（「为什么」一节、写法提示、状态字「等你回话」）；第 5 项（部分）页脚有循环板、经验板、指标板入口，循环板页在框里打开，没有规则板；第 7 项上手页（临时图上自动出现，六块里第 4 块不在、第 5 块在；「去首页」后不再出现；页脚重开；仓库图拷贝上不自动出现；没有图与只有空 `nodes/` 都显示没有图的一节；没图卡片同一工作区第二个新会话不再出现；开场卡片「第一次用？」一行点了之后 `sidebarRight.openTab` 是打开了页签还是抛错换灰字，照实记；人设设置位与 `/wish` 注册两种信号客户端看不看得见，照实记）；第 8 项 GLM（「GLM · 上手」在开场画面与会话里、三步、跳过后收起、不点连开 3 个新会话后第 4 个不再出现、设置页重开、没登录时发消息先出中文报错；读到已登录一支不做，记进报告）；单装组合（第 11 条）在隔离实例自己的 profile 里关掉另一个包的客户端行再重启：只装编排层时上手页全文没有「GLM」、没有高峰几句，只装 GLM 时引导里没有项目图的字，测完恢复并核对那份 profile 与测前相同；第 9、10 项键盘与对比度抽查；第 11 项控制台没有本包的新错误、隔离实例的日志目录没有新的崩溃记录；阻断②现状：记 `document.visibilityState` 的值与「上次看之后」的本机键有没有写入，不修。
      - 截图与 CDP 记录放 `.llm\panel-2\l4\`（不入库）。关掉隔离实例、删锁之后写报告 `.agents/tasks/panel/l4-<日期>.md`：每项结论、对应的做完条件、截图文件名、控制台账目、桌面锁与主检出 `view.json` 的记录；同批改 `docs/HANDOFF.md` 面板一行、`docs/ORCHESTRATION.md` §2.10 验证一条（「新版面在桌面版的 L4 核对待做」改成本次结果）、`docs/FACTS.md` §3（新得到的宿主事实，按该表的格式带〔实证 日期〕）。
      Files: `.agents/tasks/panel/l4-<日期>.md`（新）、`docs/HANDOFF.md`、`docs/ORCHESTRATION.md`、`docs/FACTS.md`；`.llm\panel-2\l4\*`（不入库）
      Verify: 报告里每项有结论与证据；实例已关、锁已删；之后跑 §4 四道门禁退出码 0（隔离实例关掉之后才重建）。一个提交推 `origin/panel-2`。核对中发现的缺陷不在本项里修：写进报告，修法若改变人看到的东西，交编排方定。

## 7. 规划时的基线

- `npm run build`：退出码 0（`.llm/logs/p2-plan-build.log`）。
- `npm run preflight`：退出码 0（`.llm/logs/p2-plan-preflight.log`）。
- `npm test`：第一次退出码 1（`.llm/logs/p2-plan-test.log`，`tests/lessons-seed.spec.ts` 缺不入库的 `.agents/tasks/m5/lessons-seed.json`，见 §1）；从主检出拷入后重跑退出码 0（`.llm/logs/p2-plan-test2.log`）：2939 过、0 败、1 跳过（跳过的就是第 4 项要去掉的契约测试）；棘轮 eslint 73 suppressed / knip 18 / jscpd 1。
- 探针：规划步没有跑（没有取锁）；第 2 项的门禁给出合并后的基线数。

## Digest

- `ui/src/graph/model.ts` — `export function statusText(node: GraphNode, graph?: LoadedGraph): string`（第 148 行起，改字在第 155 行）：`if (OPEN_STATUSES.has(node.status) && node.status !== 'proposed') return deciderOf(node) === 'agent' ? 'agent 来定' : '等你拍板'` 改「等你回话」。消费方：`Home.tsx:51`、`NodeDetail.tsx:105`、`common.tsx:123`、`GraphCanvas.tsx:93/100`。测试 `tests/graph-panel-model.spec.ts:158` `assert.equal(statusText(question({})), '等你拍板')`。
- `src/graph/plain-view.ts` — `statusPhrase(node, graph, awaiting)`（第 267 行，第 286 行已写「等你回话」）；`export function quote(text)`（第 34 行）；`QuestionView`（第 719 行）字段 `ask/proposal/reason/cost/ways/notTaken`。新加 `whyOf(node)`。测试 `tests/graph-plain-view.spec.ts`：第 28–38 行本地 `plainIssues` 替身与 `clean`，由真检查取代。
- `src/graph/schema.ts` — `PLAIN_LIMITS = { title: 40, background: 60 } as const`（第 67 行）；`EDITABLE_FIELDS`（第 184 行起，`'title', 'parent', …`）；`interface GraphNode`（第 229 行起，`readonly title: string` 之后加 `why`）；`NODE_FIELDS`（第 284 行）。`PLAIN_LIMITS` 的使用方：`plan-text.ts:27`、`proposal.ts:70–73`、`tests/graph-proposal.spec.ts:114`、`tests/plain-question.spec.ts:46`、`tests/proposal.spec.ts`。
- `src/graph/format.ts` — `interface GraphIssue`（第 47 行，`severity: 'error' | 'notice'`）；`FIELD_CHECKERS`（第 293 行起，`title: line`）；`checkNode(value, file, issues)`（第 396 行）；`serializeNode`（第 616 行）。
- `src/graph/parse.ts` — `parseGraph(files, revision)`（第 51 行起）：循环里只对每个文件做形状与规范形状检查，循环后第 82 行 `issues.push(...validateGraph(nodes))`；写法提示加在这一句之后。
- `src/graph/engine.ts` — `interface EngineOptions`（第 44 行，`now?`）；`export type ApplyResult`（第 49 行）；`const LLM_EDITABLE = new Set<string>(['title', 'body', 'slope', 'decider', ...DISPATCH_FIELDS])`（第 184 行）；`apply(dir, actor, input, now)`（第 267 行）；`commit(dir, graph, plan)`（第 312 行：逐个 `checkNode`、`plan.writeRules`、`validateGraph(next)` 之后才 `writeNodes`，写法检查插在 `validateGraph` 之后、`writeNodes` 之前，返回值组装在函数末尾）；`planPropose`（第 649 行）；`planEdit`（第 880 行，`denied` 一句用 `LLM_EDITABLE`，目标不带原话直接 `forbidden`）；`case 'decide'`（第 751 行）与 `planConclude`（第 800 行）。测试 `tests/graph-engine.spec.ts`（第 171、412、600 行对 `graph.issues` 断言为空，用的是夹具图，标题若触发写法提示要按带 `rule` 的排除）。
- `src/graph/tools.ts` — `const NODE: JsonSchema`（第 151 行起，`title: { type: 'string', description: 'One line.' }`）；`WRITE_OUTPUT`（第 259 行起，`required: ['ok', 'id', 'rev', 'revision', 'node', 'changed']`）；`graph_edit` 的说明（第 286 行）与 `set: { type: 'object', … }`（第 290 行，不逐字段列 schema）。测试 `tests/graph-tools.spec.ts`。
- `src/design/propose.ts` — `checkPlain`（第 265 行起）与 `checkWords`：只读，说明 M3 已直接拒绝的字段，本轮不改。
- `tests/propose-to-human.spec.ts` — 第 904–908 行：注释与 `test('contract with the panel: the second phase of the writing check', { skip: … }, () => undefined)`；上方第 885–900 行存四道例题（`PLAIN_QUESTION_EXAMPLES[form]`、`node(\`question-${index}\`)`）。
- `tests/graph-render.spec.ts` — 第 387–388 行：`assert.deepEqual(graph.issues, [], 'node files are valid and canonical')`，读的是本仓库 `docs/graph`。
- `scripts/probe/run-probe.mjs` — 第 1033–1050 行：`repoGraph`、`graphCopy`（本仓库图的拷贝）、`runScenario('glm-graph', 'glm-5.3', [ … ])`；第 1309 行 `non-glm-graph`；第 1376 行 `repoGraphAfter`（探针前后本仓库图修订号不变）。
- `ui/src/graph/NodeDetail.tsx` — 第 133–155 行：`userEntry` 按钮、正文 `Folded`、待决「选项」、提议「要批准或不要」、`RunLine`、「怎样算完成」「不做什么」、`Builders`、「下面的节点」、「证据」、「最近发生的」。「为什么」加在正文之后。
- `ui/src/graph/boards.ts` — `BOARD_ORDER = ['rules', 'loops', 'lessons']`、`registerBoard`、`projectionBoard`（`homeLine: null`）；登记方 `ui/src/lessons/LessonsPage.tsx:201`、`ui/src/loops/LoopsPage.tsx:159`、`ui/src/metrics/board.tsx:118`。只读，本轮不改。
- `ui/src/graph/Panel.tsx` — 第 175–193 行可见判断（`IntersectionObserver` 与 `document.visibilityState`）。只读，等人定。
- `docs/ORCHESTRATION.md` — §2.10 在第 360–445 行；「上手」一条第 381 行（「此刻登记表里只有经验板」）；「验证」一条（「新版面在桌面版的 L4 核对待做」）；命令行契约表（`<op>` 成功时 `{ok: true, id, rev, revision, node, changed}`）；图工具表同。
- `docs/HANDOFF.md` — 第 155 行面板一行（还写着分支 `panel` 进行中、「GLM 上手在下一批」）；`design` 行里「写法检查第二阶段（`src/graph/plain.ts`）不在 main，契约测试里留了显式跳过」。
- `package.json` — `test` = `test:1 && test:2`；`tests/graph-plain-view.spec.ts` 在第 28 行的链里，新 spec 加在它旁边。
- 已核实：工作树快进到 `c48e421` 后 `pnpm install --store-dir .pnpm-store --no-frozen-lockfile` 退出码 0、`npm run build` 退出码 0、`npm run preflight` 退出码 0、`npm test` 退出码 0（2939 过、0 败、1 跳过，拷入 `lessons-seed.json` 之后）；棘轮 73 / 18 / 1。探针未跑。
