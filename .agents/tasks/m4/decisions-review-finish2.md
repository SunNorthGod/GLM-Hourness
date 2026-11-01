# M4 设计 0.6（第四遍修订）的复评，第 2 遍：F15、N18–N23 是否关闭，F13、F14、N15–N17 是否仍然关闭

评审对象：`.agents/tasks/m4/design.md` 0.6（2026-11-01 下午的稿，处理记录在 §19.9，版本号仍是 0.6）。
上一遍评审：同目录 `decisions-review-finish2-pass1.md` 与 `decisions-gate-finish2.json`（本遍之前的版本：CHANGES_REQUESTED，MEDIUM 1 条 F15，NIT 6 条 N18–N23）。更早的 `decisions-review.md`、`decisions-review.json`、`stop-report.md` 是第 3 轮（F13、F14、N15–N17）。编号沿用，本遍新发现从 F16、N24 起。
依据：图上 `d-code-rules-enforce`、`d-credentials-readable`、`d-timeout-measured`（含 2026-10-31 的各条批注，`d-one-lift-path` 的裁定挂在 `d-code-rules-enforce` 与 `d-timeout-measured` 的批注上，图上没有同名节点）、`d-desktop-direct-use`；`.agents/tasks/design-context.md` 全文，含 `d-ask-three-gates`；源码 `src/data/project-root.ts`、`src/report/index.ts`、`src/workflow/morning-report.ts`、`src/shared/data-home.ts`；循环板设计 `.agents/tasks/schedules/design.md` §2.1。
行号指 `design.md` 当前稿的 1 起行号。

## 结论

CHANGES_REQUESTED。HIGH 0 条，MEDIUM 1 条（F16），NIT 6 条（N24–N29）。

上一遍的七条发现（F15、N18–N23）都已在设计里改到位，F13、F14、N15–N17 仍然关闭。挡路的一条（F16）出在 F15 的新做法上：晨报的对账比的是「文件终态」与「流水里最后一条撤下记录」，而晨报只读当天的流水，设计没有说对账要读整份流水。照字面实现，任何一条在今天之前撤下的规则，从第二天起每份晨报都会报一行「对不上」，F15 要的检测因此变成每天的误报。F15 自己的 L2 四例都在同一天里造出撤下，抓不到这一点。

## 上一遍发现的复核

| 编号 | 上一遍的问题 | 状态 | 依据 |
| --- | --- | --- | --- |
| F15 | 「git 写不出新的撤下」不成立；晨报对账只查一个方向 | 已关闭（新做法的缺口见 F16） | §3.5 第 720 行把那句改成已知边界：`git apply`、`git am`、`git cherry-pick`、`git merge` 能带进新行，`git checkout`、`git restore`、`git revert`、`git stash pop` 能换回旧版本，旧版本少了后来的 `restore X`；§3.10 第 773 行改成每条规则比终态，再逐行双向比，对不上的规则各一行，点名规则与两边状态，换电脑、切分支、流水缺口只是提醒；L2 ⑪–⑭ 用真实的临时仓库和 `git checkout`、`git restore --source`、`git revert`、`git apply`、`git cherry-pick`、`git merge` 跑；§1.2 `m4-gate` 第 4、7 条、§11 第 1636 行、§12 第 1647 行、§13.1 G3 行、§15 第 1881 行、§16 第 1955 行同步。「门拒绝流水里没有记录的行」记为没选的做法，理由（换电脑后流水不在，会作废人真实的撤下）成立；不学循环板「当成在外面变了」也有理由（循环板有自己的 `repo-written.json` 指纹，`lifts.jsonl` 没有） |
| N18 | 「整段四句」「它不能撤下」 | 已关闭 | §3.5 第 720 行改成「四个部分」，「`guard_lift` 撤不了这条规则，它也不在可申报名单里」，并注明规则板接线后 `/rules lift lift-files-only` 能撤，与 `liftVia: 'board'` 一致；§19.8 N15 一行同改 |
| N19 | `''written''`、`''failed''` | 已关闭 | §14.2 缺口记录第③、④点现在是 `'written'`、`'failed'`；全文只剩 §19.9 N19 一行里引用旧写法的那一处 |
| N20 | §3.5 L2 第一句与第⑤点对 `pwsh` 的说法相反 | 已关闭 | 第 728 行：`write`、`edit` 被拦，`pwsh` 的写命令（`Set-Content` 之类）被拦，`pwsh` 的 `cat` 与 `read` 放行 |
| N21 | 排队丢弃的规矩不在 `ownRules` | 已关闭（字数见 N25） | §6.8 第 1446 行 `ownRules` 五行，第五行由 `CHECK_SLOTS`、`CHECK_QUEUE_WAIT_MS/1000` 拼出；上限 6 行、每行 80 个码点，我对照 `.agents/tasks/schedules/design.md` §2.1 的 `ownRules` 一行核对，五行最长 65 个码点；契约测试钉恰好五行；§0、§1.2 `m4-checks` 第 5 条、§1.5、§6.3、§13.4 第 8 项（2 项、排队 60 秒）、§14.2 同步，全文已无「四条规矩」 |
| N22 | D1 与 §18 第 1 条仍是四行加粗版式 | 已关闭（框里的话见 N24） | §17 第 1962–1972 行：D1 是一项「确认一个推荐」，一个是非问句，一句代价，与放行合成一项，清单人话版写在 `onepage-done.md`（还没写，由一页稿那一步写）；六个记录字段只留在图上；§18 第 1 条、§0 第 38 行、§1.3 同改。我重数：框里的话 104 个码点；§1.2 表里七个任务行「建议验收」单元格合计 35 条、7,953 个字符，与设计写的完全一致；不含 `验收`、`标定`、`门禁`、`投影`、`补遗`。申报文字与第三次修复的版式留给 M3 的渲染器，§16 第 1956 行记了做法与没选的做法，接缝清楚 |
| N23 | 「同 `locate`」不成立，§2.2 说该文件不改 | 已关闭（相邻小点见 N27、N28） | 选了导出 `checkoutRootOf(path)`，§2.2 第 135 行、§3.5 第 717 行、§13.1 G3 行、L2 ⑮ 都改了。对照 `src/data/project-root.ts`：`gitEntry` 是私有函数、`locate` 不导出且在 `.git` 为文件时经 `rootOfWorkTree` 读 `commondir`，所以现有函数确实认不出工作树自己的根；`gitEntry` 对不存在的目录 `statSync` 失败返回 `undefined`，往上走成立，设计写的「约十行」成立 |
| F13 | 丢掉的违规记录数的持久落点 | 仍然关闭 | 本遍没有改 §3.1、§3.2 的相关段；只有 N19 的引号 |
| F14 | `lift-files-only` 要覆盖每一份检出 | 仍然关闭 | §3.5 的判法现在是「字符串尾部便宜判断，再 `checkoutRootOf`，目标相对那个根是 `docs/guard/lifts.jsonl` 且根属于会话的项目」，主检出、任意位置的工作树、调用方所在检出都在内，与循环板 `loops:files-only` 同类；L2 ①–⑧ 与 ⑮ 覆盖 |
| N15 | 成功消息与不可用提示指向未接线的命令 | 仍然关闭 | 第 719–721 行的文字未变 |
| N16 | 上限提醒缺 `check` 键 | 仍然关闭 | §6.3.1 未变 |
| N17 | 排队没有等待上限 | 仍然关闭 | §6.3 未变 |

## 对照裁定的逐项结果

| 裁定与检查项 | 结果 | 依据 |
| --- | --- | --- |
| `d-code-rules-enforce`：规则启用即拦，每次拦下带规则 id 写进项目违规流水 | 通过 | `GuardRule` 无 `mode`；`RuleMode`、`PROMOTION` 只出现在「删掉了什么」的叙述里；§3.1 第 7 步每条拒绝一条记录；流水写失败时拦下照常生效，丢失数有缺口记录与行健康 |
| `d-credentials-readable` | 通过 | `credential-read` 只出现在「已删」的叙述与「放行、无记录」的验收里 |
| `d-timeout-measured`（3 倍、估计优先、M4 下限 5 秒、上限 60 秒、一步 20 秒；拦路脚本 10 秒、最大 30 秒；M7 30 分钟；接管试跑的耗时作预计） | 通过 | 常量 `CHECK_TIMEOUT_FACTOR = 3`、`CHECK_TIMEOUT_FLOOR_MS = 5_000`、`CHECK_TIMEOUT_CAP_MS = 60_000`、`CHECK_STEP_DEADLINE_MS = 20_000` 未动；第五行 `ownRules` 用的 `CHECK_QUEUE_WAIT_MS` 是等名额的时间，不是检查的超时，不改上述任何数 |
| `d-one-lift-path`：人撤规则只有「告诉主 Agent」与 `/rules lift <id>` 两种说法，M4 无专属命令 | 通过 | 全文无 `commands.register`，`/guard` 只出现在「已删」的叙述里；§3.5 的提示不指点人手改撤下记录 |
| `d-desktop-direct-use` | 通过 | §13.4 第 1 项直接写桌面版重启后验证，没有「先问人」的步骤 |
| 已放行设计（规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6）不改，`docs/` 与图不写 | 通过 | 本遍只改了 `design.md`，对相邻设计的请求仍在 §18 第 5 条；`checkoutRootOf` 是对已建代码文件的加法，不是对已放行设计文字的改动（登记位置见 N28） |
| `d-ask-three-gates`：只问人的事，至多三件，放在最后，按类别写 | 通过（框里的话见 N24） | D1 一项、确认一个推荐、与放行合成；§17 第 1962 行写明至多三件、放最后；旧四行版式在 D1 与 §18 里已清掉 |

## 发现

### F16 MEDIUM：对账读的流水没有说明不受报告期限制，照字面实现会让每条撤下超过一天的规则每天误报

位置：§3.10 第 773 行（对账：「流水里最后一条 `LiftRecord` 的 `action`」）；§3.5 第 728 行 L2 ⑪–⑭；§13.1 G3 行；§2.2 晨报一行；源码 `src/report/index.ts:50-54` 与 `src/workflow/morning-report.ts:111-141`。

问题：

- 今天的晨报只覆盖一个本地日历日。`renderHourness` 把当天零点作为 `since` 交给 `reportFromFiles`，后者对违规流水做 `inPeriod` 过滤，`morningReport` 拿到的 `violations` 只含当天的记录（`src/report/index.ts:50-54`，`src/workflow/morning-report.ts:132-141`）。
- 设计的对账要拿「文件里最后一行的 `action`」去比「流水里最后一条 `LiftRecord` 的 `action`」，并逐行比「文件里有而流水里没有的行」。设计没有说这一步读整份流水。实现者手里只有已过滤的 `violations`，按字面做，昨天或更早撤下的规则在今天的记录里没有 `LiftRecord`，晨报会写「文件里最后一行是撤下，流水里没有这条规则的记录」，而且每天都写，直到有人恢复这条规则。
- 这是最常见的情形：人撤下一条规则，之后几周都不动它。F15 要的是「静默停拦能被发现」，现在发现的信号会被每天的误报淹掉，人学会无视这一行，真正的 `git checkout` 回退也就看不出来了。
- L2 ⑪–⑭ 都在一个测试里先撤下、再对账，撤下和晨报在同一天，抓不到这一点。⑭「不误报」没有「撤下发生在报告期之前」这一例。
- 「撤下的规则」一行（第 773 行）有同样的含糊：示例里的时刻是 10-31 14:02，但没说它读当天的记录还是此刻处于撤下的全部规则；若只读当天的 `LiftRecord`，撤下的第二天这一行就消失，人看不到哪些规则仍处于撤下。
- 对账的输入也没有写：`reportFromFiles(fs, homes, period, since, options)` 只收到 `homes.projectHome`（项目的 `.llm`，或行配置的 `home`）和只有 `readFile` 的 `fs`（`src/workflow/morning-report.ts:111`），没有项目根；第 773 行已有的「`lifts.jsonl` 有未提交的撤下」那一行要跑 `git status`，同样需要根。设计没有说根从哪里来。

修法：

1. §3.10 加一句：对账与「撤下的规则」一行读整份 `violations.jsonl`，不受报告期限制；只取 `classifyRecord` 为 `lift` 的行，按规则取最后一条。「撤下的规则」一行列出此刻处于撤下的每一条规则（取 `liftedRules` 的结果），时刻与原话取这条规则最后一条撤下记录，不论撤下发生在哪一天；这条规则没有记录时只写规则名，不写时刻与原话。
2. 给 `ReportOptions` 加可选成员 `root?: string`（项目根）。`renderHourness` 的调用方用 `projectOf(cwd)?.root` 填；没有 `root` 时不做对账，也不写「未提交」一行，不抛错。`lifts.jsonl` 用同一个 `ReportFs.readFile` 读 `<root>/docs/guard/lifts.jsonl`。把这一条写进 §2.2 晨报一行与 §13.1 G3 行。
3. L2 ⑭ 加一例：撤下记录的 `at` 在三天前、报告期是今天，文件与流水一致，晨报没有「对不上」，「撤下的规则」一行仍列出这条规则。再加一例：撤下记录在三天前、文件被 `git checkout` 换回旧版本，晨报仍报这一条（整份流水里能找到 `restore`）。

### N24 NIT：D1 框里的话没有理由，代价一句指向读者没见过的东西

位置：§17 第 1968 行（框里的话）；§17 第 1962 行、§19.9 N22 一行都写「推荐与理由在句子里」。

框里的话有推荐（「建议就按这份清单定下来，并放行开工」），理由只出现在图上的记录里（「草稿经决定评审改过四遍，人逐条改比从零写省力」），人读不到。「哪条不对再单独改」说的是改起来方便，不是为什么建议这样定。代价一句说「放行工作区外的写入」「申请那一条」，人在这段话之前没见过「申请」这一项。

修法：把理由放进句子，例「清单经过四遍评审，哪条不对再单独改」；代价改成「你要是不想每次让 agent 改工作区外的文件都回一句「可以」，申请放行的那一条要重写」。改完重数码点，更新 §17 与 §19.9 里的 104。

### N25 NIT：`ownRules` 第五行写「33 个码点」，实际 35

位置：§6.8 第 1446 行；§19.9 N21 一行（第 2234 行）。

「同时最多跑 2 项检查；排队超过 60 秒的这一次不跑，下一次改动再查」逐字数是 35 个码点。上限 80，不影响接受，但数写错了会被契约测试的作者当成要钉的值。改成 35，或删掉这个数（上限检查由契约测试按 80 做，文档里不必写具体码点数）。

### N26 NIT：L2 ⑪ 的提交顺序没写清

位置：§3.5 第 728 行，⑪。

⑪ 写「先撤下后恢复……把这个状态提交，再经 `git checkout <撤下那次提交>`」。只提交一次的话没有「撤下那次提交」可用，`git revert <恢复那次提交>` 同理。写出顺序：`setLifted` 撤下，提交 A；`setLifted` 恢复，提交 B；然后 `git checkout A -- docs/guard/lifts.jsonl`、`git restore --source=A -- …`、`git revert B` 各从提交 B 的状态起做一遍。

### N27 NIT：「根属于会话的项目」的比较没写怎样规范化

位置：§3.5 第 717 行（`projectOf(那个根)?.root` 等于 `projectOf(cwd)?.root`）。

`projectOf` 返回的路径保持原样：工作树的根来自 `.git` 文件里 `gitdir:` 写的路径，经 `resolve` 之后盘符大小写不变（`src/data/project-root.ts` 的 `rootOfWorkTree`），而 `cwd` 来自 DSH。Windows 上两边的盘符大小写、斜杠方向可以不同，直接比字符串会把工作树里的目标判成「不属于这个项目」，放行，F14 在这种情形下复发。同一文件里有 `sameDir`（小写比较）但它不导出。写明：两个根按 `pathKey`（正斜杠、小写）规范化后再比；L2 加一例，`cwd` 的盘符大小写与工作树 `.git` 文件里的相反，写工作树里的 `lifts.jsonl` 仍被拦。

### N28 NIT：`checkoutRootOf` 这条接缝只登记在 §2.2 与 §19.9，§13.3 与 §18 没有

位置：§13.3 第 1724 行（项目根一行写「导入，不另建」）；§18 第 5 条；§2.2 第 135 行引用 §13.3。

§2.2 说「谁先改这个文件谁加，后到的合入时机械合并（§13.3）」，但 §13.3 的那一行没有这句话，§18 也没有登记，最后的汇总步按 §18 写 graph-ops，会漏掉。在 §13.3 第 1724 行末尾加「G3 在此文件加一个导出 `checkoutRootOf`，谁先改谁加」，并在 §18 第 5 条加一句指给编排方。

### N29 NIT：流水不在时，对账的提醒每天重复，没有收口

位置：§3.10 第 773 行（「换电脑……只是提醒」）。

换电脑或新克隆之后 `.llm/` 是空的，文件里每一条撤下、恢复都「流水里没有」，按设计每条规则每天写一行，永远不消失（流水里补不进那些记录）。改成：流水里一条 `lift` 记录都没有、文件里有行时，只写一行「流水里没有撤下记录（换了电脑？）：lifts.jsonl 里有 N 条规则的撤下或恢复」；流水里有一部分记录时才按规则分行写。

## 已核实的假设

- `src/data/project-root.ts`：`gitEntry` 私有，`locate` 不导出，工作树的 `.git` 是文件时 `rootOfWorkTree` 读 `commondir` 返回主检出根；`gitEntry` 对不存在的目录返回 `undefined`。设计对 `checkoutRootOf` 的描述与此一致。
- `src/report/index.ts:50-54`、`src/workflow/morning-report.ts:111-141`：报告期是当天，违规流水按 `since` 过滤，`ReportFs` 只有 `readFile`，`DataHomes` 只带 `projectHome`、`userHome`（F16 的依据）。
- `.agents/tasks/schedules/design.md` §2.1 `ownRules` 一行：至多 6 行、每行至多 80 个码点；设计里五行最长 65 个码点。
- D1 的数：框里的话 104 个码点；§1.2 七个任务行「建议验收」单元格 35 条、7,953 个字符，与设计写的相同。
- `d-ask-three-gates`：D1 是「确认一个推荐」一类，一个是非问句，不含黑名单词，与放行合成一项，至多三件放在最后。
- 图上四个决定节点的批注里没有晚于 2026-10-31 的新裁定；`d-one-lift-path` 没有同名节点，裁定在两个节点的批注里。
- 全文无 `credential-read` 规则、无 `commands.register`、无 `GuardRule.mode`。

## 错误或未核实的假设

- 错误：设计隐含地假定晨报能拿到全部 `LiftRecord`（F16）。今天的晨报只给当天的记录。
- 错误（数字）：`ownRules` 第五行「33 个码点」应为 35（N25）。
- 未核实：规则板 0.10 读到 `kind: 'gap'` 这种没有 `rule` 字段的行会怎样。设计的做法是请规则板在 M4 的 `classifyRecord` 合入之前跳过这类行（§18 第 5 条 `rules` 第五点）；规则板已放行、不改，今天 `src/rules/` 不读这份流水，眼下没有实际影响。
- 未核实：压缩之后 `session.deriveMessages()` 是否仍含最近一条人的原消息（设计已加 L2，失败时拒绝，真机在 L4 第 10 项）。
- 未核实：GLM-5.3 是否照说明把超时一句抄进方案（L4 第 12 项只有一次样本，设计自己不当作保证）。
- 未评审：`onepage.md` 仍是 0.5 稿，按任务分工在本设计通过之后另一步重写；`onepage-done.md` 还不存在。
- 没有运行任何代码或测试；所有「通过」来自读设计、源码、循环板设计与图节点，数字用脚本重数。
