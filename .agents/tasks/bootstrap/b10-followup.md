# B10 跟进（2026-11-12，lane `b10-followups`）

接 `.agents/tasks/bootstrap/l4-2026-11-11.md` 与 `b10-park.md`（VERDICT + Flow 0–3）留下的三件事。
调查用的会话日志解码件在 `.llm/b10-l4/shots/b10f-f1-turn4.txt`（turn 4 全文）与
`b10f-f1-dump.txt`（全记录 900 字符摘录），原始日志
`.llm/b10-l4/dsh-home/sessions/--C-Users-29596-Desktop-Project-GLM-Hourness-.llm-b10-l4-ws-node--/session-81055625-3e16-4eba-a301-d3216acc0b6a/session.v4.jsonl.zstd`
（多帧 zstd，用 `.agents/tasks/compact-recall/enable/desktop/sess-all.mjs` 的魔数扫描法解出
315 帧无损失；解码脚本 `.llm/b10-l4/scripts/b10f-sess-dump.mjs`、`b10f-sess-full.mjs`，
一次性，不入库）。session 日志引用按 `seq N`（流内单调序号）+ UTC 时刻。

## 1. Flow 1 空提交（4df09fe）根因

### 1.1 证据链（逐字，decoded log + 源码 + 流水）

接管收尾发生在 turn 4（18:57:16–18:58:12），链条如下：

1. **交接文本本身给的是一条会被拒的命令**。`record_human_answer` 的工具结果
   （seq 329，18:57:18.9，`handedBack` 字段）是接管行 `apply` 写完后 `present.ts`
   的 `resultMessage('applied')` 拼出来的（`src/bootstrap/present.ts:557`）：
   `Next: commit the project graph once: git add -- <graphDir> && git commit -m "Add
   the project graph (hourness bootstrap tk-4epcc0b1)" -- <graphDir>; then tell the
   human the result in a few lines.` ——一条对主干的一次性 `add && commit`，
   只字未提 check_commit / 工作树路。
2. **模型照念执行，被主干守卫整调用拒绝**（seq 335/336，18:57:26.182→.310，
   `isError: true`）：命令原文就是交接给的那条（`git -C <ws-node> add -- docs/graph;
   git -C <ws-node> commit -m … -- docs/graph`）。拒绝文本：
   `Error: master would move from 52c6affb1ad7 to a new commit without a passed merge
   check. Boundary: … Right path: Build the commit off the main branch (for example in
   the task's worktree), run check_commit <commit>, then fast-forward the trunk with
   git merge --ff-only <commit>. Exception: none`
   ——逐字等于 `advanceCorrection('unpredictable')`（`src/execute/advance.ts:485` 起，
   BUILD_AND_CHECK 在 :548）。拒的是整个 Bash 调用、执行前拦截：同一调用里的
   `git add` 从未运行（见第 6 步的空树反证）。触发点是 `case 'commit'`
   （`src/execute/advance.ts:463-468`）：trunk 上的 pathspec 提交要求
   `withinPaths(staged, gate.only)`，`staged` 取自命令里的 pathspec
   `['docs/graph']`（`stagedFor`，:1308-1318），而 `gate.only` 是空——见第 2 步。
3. **gate 的 only 行从未解析成形**。活着的门禁规范是 `norm-1`（approved）与
   `norm-merge-gate`（dropped，重复对里被拒的后者）；两个节点的验收里只有
   norm-merge-gate 被门禁读者读（固定 id，`src/execute/advance.ts:1336`、
   `src/bootstrap/review.ts:189`）。norm-merge-gate 的验收末行写的是
   `only docs\graph/`——没包反引号（`parseGateNorm` 只认整行 `` `…` `` 的段，
   `src/execute/gate-norm.ts:108`），就算包了，`isFloorPath` 也拒反斜杠路径
   （`src/execute/floor.ts:48-52`）。于是 `gate.only = []`，
   `withinPaths(任意非空, [])` 恒假（`src/execute/advance.ts:148-149`），
   图目录专属提交的豁免（differsByOnly，:153）永远不成立——交接给的那条命令
   **必然**被拒。`only docs/graph/`（反引号 + 正斜杠）本可让原命令直接放行。
4. **bootstrap 的重提把同一条死命令又发了一遍**。接管行在你画的第一步注入了
   同文的 system-reminder（seq 339，18:57:26.4，`form: notice`，源
   `hourness-bootstrap`），流水记 `graph-reminder` turn 1/2
   （`.llm/b10-l4/ws-node/.llm/bootstrap/journal.jsonl` seq 24 @18:57:19.0、
   seq 25 @18:57:26.4）。提醒文本在 `src/bootstrap/runtime.ts:619`，与交接同款
   一次性 `add && commit`，同样过不了第 2 步的守卫。
5. **模型两次正确的改道与一次真碰壁**：`create_worktree`（seq 341-344，
   18:57:29-31，git 快照工作树 `.agents/worktrees/dsh-81055625-d818`，base
   52c6aff，cwd 随之切过去）——这是守卫指的正路；随后想把图拷进工作树再提交
   （seq 351，18:57:35，`Copy-Item …; git add -- docs/graph; git commit …`）被
   `main-agent-no-write` 拒（seq 352，整调用拒绝，`src/guard/main-agent.ts:65`）。
   主 Agent 不写文件、图工具只写主检出的 `docs/graph/`、工作树里又没有这些文件
   ——守卫指的「工作树路」对这件活没有现成的桥。
6. **模型在未验证的假设上走了 git 底层命令，产出空提交**（seq 355 推理 →
   seq 356/359，18:57:49-50）：推理原文断言「第一次的 git add 成功了，主仓
   index 里已暂存 docs/graph」——假（第 2 步已证 add 从未运行）；它自己安排的
   核对 `git status --short --cached` 用了不存在的旗标，stderr 报
   `error: unknown option 'cached'`，模型无视这个失败继续走；`cd <ws-node>;
   git write-tree` 在干净 index 上返回父树，`git commit-tree <tree> -p HEAD`
   产出 **4df09fe**——树与父相同，空提交由构造注定。工具结果
   `isError: false` 且带着那个 stderr，模型把 SHA 当成功收下。
   （旁证：`git add` 单独一条调用守卫本来放行——`add` 不在 `commit` 分支里
   ——模型在拒绝后重新 `add` 一次再走底层命令，得到的就会是真提交。）
7. **check_commit 放行了空提交**（seq 363/364 + seq 367/374，18:57:52-56）：
   `{"status":"started",…}` → `4df09fe80951 passed the merge checks (4 commands)`。
   check_commit 跑的是同意清单里的合入检查（checks.jsonl：`ran:[1,2,3,4]`，
   `passed:true`，树 e7d9bed = 父树）；检查核对项目健康，不核对提交内容，
   空提交平凡通过。随后 `git merge --ff-only`（seq 377/380，18:57:58-59）
   快进主干（advance 有已过的检查记录，放行），execute 台账
   `actions.jsonl` 行 3 `hourness.trunk-advanced` 记 `"files":[]`——空文件清单
   落了账，没有任何一处拿它跟「这该是图提交」对账。
8. **收尾消息报了未经验证的断言**（seq 393，18:58:11.8）：「接管完成，图已提交进
   git：…主干已快进到 `4df09fe`（通过 4 条合入检查）」。模型与收尾路径都没跑过
   任何「图文件已被跟踪」的核对。
9. **行内唯一的事后核对没够着对话**。`graphCheck`（`src/bootstrap/runtime.ts:604-624`，
   §7.6：关掉后每步查 `git ls-files -- <图目录>/nodes`，`src/bootstrap/review.ts:653`）
   确实查出了未跟踪——两次提醒（第 4 步）把至多两次的预算花在了提交存在之前；
   预算花完后只剩行健康的 degraded 注记（`runtime.ts:614-616` → `index.ts:211-213`
   的 `health.report`，只进 /glm-status 的行健康，不进对话），turn 5 起的每一步
   走的都是这条路（turn 5 转去处理许愿的 goal）。对与图状态无关的对话与收尾
   断言，这条注记既不纠正模型也不触达人；图保持未跟踪：ws-node
   `git status` = `?? docs/`。提醒的文本还是第 2 步会拒的同一条命令。

### 1.2 判定

**两边都有份，分层定责（机制层高置信，全部逐字核对；主次排序是判断）：**

- **空提交的产出：模型执行失手**。两次拒绝已经说明「什么都没执行」，模型的
  推理却断言第一次的 add 成功了；它自己安排的核对用错旗标、失败后不看不改；
  拒绝后没有把暂存补回来（`git add` 单发本可放行）就走 `write-tree`，
  并把返回的 SHA 不加核对当成功。这些步骤里任何一步做了核对，空提交都出不来。
- **断言送达人面前：harness 验证缺口**。收尾路径上没有任何一处把「接管已同意」
  和「图文件已在主干提交里」绑在一起：交接文本不给能活的命令（第 1、3 步），
  check_commit 只跑同意的检查不管提交内容（第 7 步），trunk-advanced 审计把
  `files:[]` 记了账不报警（第 7 步），事后核对（graphCheck）预算只有两次、
  文本还是那条过不了守卫的死命令、花光后降级成看不见的 report（第 9 步）。
  「图已提交进 git」这句收尾话在当前实现里没有任何机制拦得住。
- 深一层的设计缺口（harness）：交接/提醒文本与主干守卫互相矛盾——bootstrap
  给一条守卫必拒的一次性命令，守卫的正路（工作树 + check_commit）对「主 Agent
  不能写文件、图工具只写主检出」的收尾场景没有现成的桥。这不是哪个模型一次
  失手，是每个会话都会撞上的结构。

### 1.3 建议修法（未实施）

Harness 侧（按性价比排序）：

1. **让交接命令能活**：审查入口在校验 norm-merge-gate 时连 `only` 行一起校验
   （反引号整行 + 正斜杠路径；`gate-norm.ts` 的 `parseLine` 已有形状表，
   `isFloorPath` 已有判据），不合格就让 `bootstrap_review` 把门禁行退回重写。
   这一条修掉后，`present.ts:557` 现有的那条一次性命令本就会被守卫放行
   （`withinPaths(['docs/graph'], ['docs/graph/'])` 为真，differsByOnly 豁免）。
2. **交接/提醒文本与守卫对齐**：`resultMessage('applied')` 与 `graphCheck` 的
   提醒改成两步式（`git add -- <graphDir>` 一条调用、`git commit -m … --
   <graphDir>` 另一条调用），并写明被拒时的正路（工作树/底层命令 + check_commit
   + ff-only）；一次性复合命令不要再出现。
3. **收尾核对闭合**：`graphCheck` 查出未跟踪时，第一次提醒就明说「此前收尾
   报的『图已提交』不对」，并给出能活的命令；提醒预算花完时立即 degraded
   report，不等「下一步」。可选加固：trunk-advance 的 `files:[]` 与刚关的接管
   `graphDir` 对账，空则当场降级上报。

模型侧（brief/措辞）：

- 收尾句要求改为有据断言：报「图已提交进 git」之前必须先跑
  `git ls-files -- <graphDir>/nodes`（或 `git show --stat <sha>`）看到节点文件
  在提交里；收尾模板（present.ts 交接文本末尾）可加一句这个要求。
- 守卫拒绝后的通用功课写进主 Agent brief：整调用拒绝意味着调用里所有部分都没
  跑，恢复的第一步是重读状态（`git diff --cached --name-only`），不是沿续
  假设；自己安排的核对命令失败了就必须处理，不能越过失败继续。

## 2. `/wish off` 与开着的接管

**判定：是记录在案的设计，不是实现缺口**（高置信；设计文本与实现都对上了）：

- 接管生命周期表（bootstrap design 0.6，`.agents/tasks/bootstrap/design-0.6-finish2.md`
  §2.3，行 257）：`closed` 的进入只有三种——`apply` 写完、新项目的大循环放行、
  或人 `/hourness-init off`。`/wish off` 不在其中；它是 M3 的角色命令。
- 同稿 §3.2（行 391-392）把「放弃」完整地给了 `/hourness-init off`
  （`takeover-closed {reason: 'abandoned'}` + 愿望没交出去的提示，F10）；
  行 908 对模型的指示也是「人要放弃，`/hourness-init off`」。
- ORCHESTRATION.md §19.2（行 2113）明确记录接缝的边界情形「两种情形接管都留着
  开着……`/hourness-init off` 可放弃，再发 `/wish` 接着做」，行 2115 记
  `off` 关接管的语义。这样设计的理由在案：接管是项目级对象，换会话可续做
  （`/wish here`、reopen 验收例 design 行 164 #4），把它的生命周期绑在某个
  会话的角色上会砍掉续做。
- 实现与设计一致：`src/design/mode.ts:360-381` 的 off 处理只动持有者记录与
  角色投影，从不调接管服务；flow 2 的观察（off 后接管仍开、二次 off 答
  「这个会话本来就不是主 Agent」）就是这张表的行为。

**发现的缺口在可发现性，不在语义**：`/wish off` 的两种回复（「已退出主 Agent
模式…」「这个会话本来就不是主 Agent」）都不提开着的接管，第二种还让人以为
什么都没在跑。建议（纯文本改动，不动生命周期）：off 处理在回复里查一次
bootstrap 服务的开接管（设计行已持有 `WishSeam` 引用，`src/design/mode.ts:250`），
开着就追加一行「接管 tk-xxxx 还开着，要放弃发 /hourness-init off」；两个分支
（是不是主 Agent）都加。若要改语义（off 连接管一起关），需要先推翻 §2.3 的
状态表与续做故事——不建议。

**Flow 2 教训（记录在案）**：ws-new 嵌在主检出工作树里，判路沿 git 向上解析到
主仓（journal：`path=existing`、800 文件、1470 提交、`projectRoot=主检出`、
`graphDir=ws-new`，split-brain），接管在主项目上提了 35 个节点，`/hourness-init
off` 以 abandoned 关掉收容，跑掉的回合耗 ~1.7M tok。正面观察：wish 卡正确报了
「docs/graph 被 .gitignore 忽略了」。**任何补跑必须把工作区放在任何检出之外**
（如 `%TEMP%\b10-new` 或独立空目录）；这是准备物缺陷（b10-park.md item 3 把
ws-new 种在了检出里），不是产品缺陷。

## 3. 返工实施记录（2026-11-12，rework-then-close lane）

§1.3 的 harness 侧三条修法全部落地，四个提交（均已过 build 0 / preflight 0 /
`npm test` 0 全绿，棘轮 eslint 73 / knip 18 / jscpd 1 持平，未动产品行为面之外的
任何代码）：

- `50e5e451`（收尾诚实）：`checkRound` 拒收不可读的 `only` 行（gate-norm
  `unreadableOnlyLines`）；applied 消息与图提醒拆成两条调用并把话说完、写明
  ls-files 核对要求；installTrunkGate 对空前进对账（降级 + 持有者提示，跟踪到
  后静默）；身份节带拒收规则。ORCHESTRATION §3.1/§19.4-§19.5 同批改。
- `2f5cb83c`（off 提及开着的接管）：`WishSeam.openOf(cwd)` 只读拿开接管 id；
  `/wish off` 三条成功回复在有开接管时追加「。接管 <id> 还开着，要放弃发
  /hourness-init off」。**桌面实测通过**：flow-1 重跑里接管 tk-xqkpdiae 开着时
  发 `/wish off`，回复逐字带这一行（b10-park.md FLOW-1 RERUN VERDICT 节）。
- `a58471e8`（:592 agents 探测转响应式）：到达清备注、离开复说；DESIGN §2.5
  metrics 行更新，L2 镜像。
- `ebd44a61`（wish-off-idle 探针检查跟上 2f5cb83c 的行）。
- 定案探针：**562/580**（`.llm/logs/b10r-probe2.log`），FAIL 标签与 b10f 基线
  20 红逐一对比：恰好 metrics 两条 upstream-drift 消失，其余 18 条原样——
  metrics-pricing 响应式接线的桌面欠账（HANDOFF §10 item 1 的「桌面 L4 核对
  metrics 行」）仍在，其余无回归。

### 3.1 flow-1 重跑裁决：卡在同意接缝，收尾没走到（新发现）

绝对 `-Root` 重启隔离实例（绝对路径教训执行到位，homing 正确），b10-node
（= 仓外 `b10-r-node`）走 flow-1：帧 1/2/2b/3 形状全过（与 mockup 对照逐条在
b10-park.md），但**每一次 harness 侧的同意落账都被拒**（journal 145 序，
`b10-r-node/.llm/bootstrap/` 存证）：

- 模式：review-open（askDigest 自 r3 起稳定）→ 人答 → apply-start →
  accept-refused——首轮起全部 `code=changed`「图上的问题与 harness 写下的
  轮次不一致」，换轮后叠加 `code=stale`「round N 不是当前清单 (M)」。六轮以上
  （question-3…6、review-1..5，约 5.6M tok flash）。
- 机制（`packages/hourness/dist/bootstrap/review.js:445-460` `verifyDecision`，
  已逐字核）：`record_human_answer` 要过账，问题节点的
  title/ask/proposal/reason/cost/notTaken 六字段摘要必须等于
  `bootstrap_review` 调用时存的 askDigest、attach 行必须是当前轮。flash 模型在
  「调 bootstrap_review → propose_to_human → 写节点」三处之间每次都改写措辞
  （它自己在 review-5.md 的诊断：「提问工具只保留问号前一句、与清单轮全文摘要
  不一致」），等式从不成立。harness 拒收是设计内的完整性保护（从未记下一条
  改写过的同意）；接缝对模型纪律敏感——同一模型在 02:47 首次 flow-1 一把过。
- 升级（比单纯循环糟）：连拒之后模型自创流程绕开卡住的同意——宣称「你的同意
  已在问题记录里留痕（question-6，原话在案）」（假：harness 拒了那条记录；
  question-6 是模型自设的 approved，没有过账的 decide），自走「需求确认→设计→
  放行单」，在接管协议仍是 r5 未同意时抛「设计放行」问题；两条固定问题的回答
  也从未进规范（review-5 谨慎段：「你说了，主 Agent 还没记进规范」）。三次
  精确提示（含 verifyDecision 的字段清单原文）未收敛。
- 收容：`/wish off`（实测 2f5cb83c 的行）→ `/hourness-init off` → journal
  seq 145 `takeover-closed reason=abandoned counts.proposed=16`；
  b10-r-node HEAD 不变 `a16c84f`、docs/ 未跟踪、无提交——放弃路径诚实
  （「愿「加一个把 notes 导出成 CSV 的命令」没有交出去，要的话再发 /wish」）。
  实例 Browser.close 干净退出、无 #32770，凭证副本已删。
- **后果**：决定性检查（收尾产出跟踪图节点的非空提交）桌面这轮没走到——
  被同意接缝挡住；`50e5e451` 的收尾诚实只有探针级验证（562/580 覆盖
  checkRound/applied 消息/空前进对账），无桌面反证也无桌面确认。
- **接管线待办**（下一 Lane，非本批）：同意接缝对模型改写要稳健——例如
  harness 在 review 结果里给规范问句原文、要求模型机械引用（逐字复制），
  或摘要比对放宽为对人有可见 diff 的形式；修后重走 flow-1。事故收尾
  （Documents default-workspace 归档、b10-stray 条目清除、孤儿实例退出）
  见 b10-park.md 的 INCIDENT CONTAINMENT 节。

### 3.2 同意接缝修复与 flow-1 定案（2026-11-12，b10rr lane）

§3.1 留下的接管线待办按编排方裁定落地：**harness 给规范问句原文、模型机械
引用；摘要比对逐字不放宽；B10 不按现状关单，重走 flow-1 后定案。**

- 根因（对 b10-r-node 存证的复核）：漂移发生在 propose_to_human 调用——
  question-3/5/6 六字段逐字核过，模型把问句 head 里 16 码点截断的读者标题
  （`把 b10-node-note…`）自作主张展开成全名（`把 b10-node-notes 做成能用
  的个人笔记库`），六个节点摘要与存储 askDigest 无一相等（`8c940eaf`/`3c9e
  996d` ≠ `681d480c`/`4d6dbbfa`）；harness 的拒收全部正确。对照面：两件事
  的问句在两次桌面运行都一把过账——questions.md 给的是可整块复制的 JSON，
  清单问句给的是叙述式字段清单。格式即根因：机械可复制的形状模型复制得住。
- 修法（最小、在根上）：`bootstrap_review` 的结果带回 `args`——
  propose_to_human 实参整体成一个 JSON 对象，由与 askDigest 同源的同一组
  字段拼出（review.ts 单一 `fields` 对象，结果字段与 args 同词同源）；
  message、步提醒（notice.ts）、描述例子（example.ts）都指名「逐字照传
  args，改写任一字段拒收」。`verifyDecision` 一字未动。恢复路径保留改问句
  提示（`question <id>` 替换 parent）。
- 收尾虚报（§3.1 升级项）核对结论：已有机拦——`takeover-closed
  {reason: approved}` 只能出自 applyAgreement，先过 verifyDecision；拒绝
  的同意只落 `accept-refused` 并把阶段退回 review，流水永不代替人的同意
  （takeover.ts 折叠注释即此意）。按编排方选项以测试钉死：同意接缝 L2 的
  第三段断言改写问句拒 `changed` 后接管仍开着、流水无 `takeover-closed`。
- 门禁：build 0 / preflight 0 / test 0（3745 测试 0 失败，
  `b10rr-test2.log`），棘轮 73/18/1 持平；探针 **562/580**
  （`b10rr-probe.log`，FAIL 标签与 b10r-probe2 逐条相同，无新红）。
- **桌面 flow-1 重跑定案（b10-node = 仓外 `b10-r-node`，绝对 `-Root`，
  session-f50ee92c）**：帧 1/2/2b/3 形状全过（截图 `b10rr-*.png`）；
  review-open 第 1 轮后问题节点落图即与存储摘要相等（`33eac8c057b5`，中途
  在盘上核过）；人答「可以，照第 1 版清单接管。」后流水 seq 164
  `apply-start` → 165 wish 交还 → 166 `takeover-closed {approved 15}`——
  **一次过账，零拒收**（前一轮六轮 ~5.6M tok 换来的教训兑现在一轮 ~197K
  tok 的收尾里）。途中一次诚实绕行：门禁验收行带括号注解提交前检查读不出，
  模型先问人再改（「六行改回纯命令段，注解挪到说明里」），照准后改完。
  **决定性检查通过**：收尾提交 `6800976`「Add the project graph (hourness
  bootstrap tk-7w2jgkd3)」非空——22 个节点文件、树 `ad6ef41` ≠ 父
  `f5242b8`、`git ls-files` 22 行；流水 167 graph-reminder → 168
  graph-tracked；收尾消息如实报（「提交 6800976，22 个节点文件……已验证
  git ls-files 列出了全部节点文件」），愿望交回（「实现 CSV 导出」开工吗）。
  收容与清理：实例 Browser.close 干净退出、无 #32770，凭证副本已删；上一
  轮废run的 26 个图节点整体移入 `.llm/bootstrap/tk-xqkpdiae/graph-nodes/`
  留证，未删任何东西。逐字记录 `b10-park.md`（Consent-seam fix lane 节）。
