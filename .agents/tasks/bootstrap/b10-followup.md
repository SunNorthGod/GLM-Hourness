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
