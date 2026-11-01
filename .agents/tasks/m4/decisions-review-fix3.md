# M4 设计 0.6（第三遍 finish2 修订，fix3）的复评

评审对象：`.agents/tasks/m4/design.md` 0.6（2026-11-01，第三遍 finish2 修订，版本号仍 0.6；处理记录在 §19.10）。
上一遍评审：同目录 `decisions-review-finish2.md` 与 `decisions-gate-finish2.json`（finish2 复评第 2 遍：CHANGES_REQUESTED，MEDIUM 1 条 F16，NIT 6 条 N24–N29）；再上一遍 `decisions-review-finish2-pass1.md`（F15、N18–N23）；更早 `decisions-review.md`（第 3 轮 F13、F14、N15–N17）。
改之前的被评审稿原样存在同目录 `design-0.6-finish2.md`（CRLF，与上一遍评审的字节一致，已逐字比对）。
范围（编排方指定）：§3.10、§3.5 的 L2、§6.3.1 的「调高上限」与「看得见」、§16 新加的三行、§17、§19.10，以及 §2.2 与 §13.1 G3 行里被 `ReportOptions.root` 牵动的几处。
依据：`design.md` 当前稿、`design-0.6-finish2.md`、`.agents/tasks/plain-ui/design.md` 1.3（第三遍，§8.2、§11 第 2、4 条）、`.agents/tasks/design-context.md`；源码 `src/data/project-root.ts`、`src/shared/data-home.ts`、`src/report/index.ts`、`src/workflow/morning-report.ts`、`src/shared/dsh-min.ts`、`src/guard/graph-files.ts`、`scripts/packages.mjs`、`src/data/index.ts`；数字用 node 脚本重数，`path.resolve` 的盘符行为实跑核对。没有运行测试。

## 结论

APPROVED。HIGH 0 条，MEDIUM 0 条，NIT 2 条（NIT-01、NIT-02）。

上一遍的八条（F16、N24–N29、P13-01）都已改到位：F16 的对账与「撤下的规则」改成读整份流水、`ReportOptions.root`/`RenderOptions.root` 定义清楚、`/hourness` 的处理函数用 `projectOf(cwd)?.root` 填、无 `root` 与读错误都优雅降级并有 L2；N24–N29 逐条落实，数字重数一致；P13-01 选的做法与 `plain-ui` 1.3 现在说的一致（取 `limits.jsonl` 这一项最后一行，不取 `ValueLine.cap`）。F13、F14、F15、N15–N23 没有被这一遍的改动重新打开。

两条 NIT 都不阻断：一条是上一稿就有、上一遍评审已接受的「未提交」提醒，这一遍把判法写成具体的 `git status` 之后，它在纯函数报告管线里的运行位置与数据流仍没写出；一条是新引入的 `liftStatesOf` 返回形态对「逐行对账」是否够用没写清。两者都已被 §3.5 的 L2 或优雅失败约束住，实现时测试会暴露，所以记为 NIT。

## 上一遍发现的复核

| 编号 | 级别 | 上一遍的问题 | 状态 | 依据 |
| --- | --- | --- | --- | --- |
| F16 | MEDIUM | 对账没说读整份流水，晨报只读当天，撤下超过一天的规则每天误报；对账的输入（项目根）没定义 | 已关闭 | §3.10 第 775–782 行：对账与「撤下的规则」不受报告期限制，流水一侧取整份 `violations.jsonl` 里 `classifyRecord` 为 `lift` 的行、按规则取最后一条，`morningReport` 的输入多一项 `lifts`，其余各节仍只拿当天；文件一侧经同一个 `ReportFs.readFile` 读 `<root>/docs/guard/lifts.jsonl`、解析用 `liftStatesOf`；`ReportOptions` 加可选 `root`、`RenderOptions` 加同名成员、`/hourness` 处理函数用 `projectOf(cwd)?.root` 填（`src/report/index.ts` 已证明 `renderHourness` 会把 `reportOptions` 传进 `reportFromFiles`，加一行 `root` 可行）；无 `root` 不对账、不写「未提交」、不抛错；`ENOENT` 以外读错误写一行「读不出」。L2 ⑭ 加报告期之前的撤下、换回旧版本、不带 `root` 三例，§19.10 另钉 `reportFromFiles` 的输入、`EACCES`/`ENOENT` 两种。§1.2 `m4-gate` 第 4 条、§2.2、§11、§12、§13.1 G3、§13.3、§16 同步 |
| N24 | NIT | D1 的话没有理由，代价一句指向人没见过的「申请」 | 已关闭 | §17 框里的话重写：理由进句子（「清单已过五遍评审，哪条不对再单独改就行」），代价改成人看得到的事（每次让 agent 改工作区外的文件都回一句「可以」）；重数 124 个码点（脚本核对），不含 `验收`、`标定`、`门禁`、`影子`、`投影`、`补遗`；「五遍」= 决定评审第 1、2、3 轮 + finish2 两遍，设计自带「再有一遍随之改」 |
| N25 | NIT | `ownRules` 第五行写 33，实际 35 | 已关闭 | §6.8 改成 35，脚本核对「同时最多跑 2 项检查；排队超过 60 秒的这一次不跑，下一次改动再查」= 35 个码点；§14.2、§19.9 注明只按 80 的上限查、不钉具体码点数 |
| N26 | NIT | L2 ⑪ 的提交顺序没写清（要两次提交） | 已关闭 | §3.5 L2 ⑪：撤下→提交 A（一行 `lift`），恢复→提交 B（两行），再从提交 B 起 `git checkout A`、`git restore --source=A`、`git revert --no-edit B` 各一遍，三次同一结果 |
| N27 | NIT | 「根属于会话的项目」的比较没写规范化，Windows 盘符大小写可放行工作树目标 | 已关闭 | §3.5 文件工具一条：两个根先经 `pathKey`（正斜杠、小写）再比，理由写明（`gitdir:` 经 `resolve` 保留盘符大小写、`cwd` 来自 DSH）；实跑 `path.resolve('C:/..')` 确认保留大写，理由成立；L2 ⑯ 两个方向各一例、只在 Windows 跑 |
| N28 | NIT | `checkoutRootOf` 只登记在 §2.2、§19.9 | 已关闭 | §13.3 项目根一行末尾加「G3 在此文件加一个导出 `checkoutRootOf`，谁先改谁加」；§18 第 5 条加一项给编排方；§13.1 G3 文件列也列了它 |
| N29 | NIT | 换电脑之后对账的提醒每天每条规则一行、永不消失 | 已关闭 | §3.10：文件里严格早于本机流水第一条记录（任何一类的 `at`，缺口记录另算 `since`，流水为空时每行都算）的行不进逐行比较；只在这些行里出现、流水里也没有任何 `LiftRecord` 的规则合成一行、列规则名至多 5 个；之后在新机上撤下的规则照常逐条比；带旧 `at` 经 git 混进来的行也落在这一行、规则名照列。L2 ⑭ 换电脑一例改成合成一行并加「之后撤下第三条」，⑫ 写明 `at` 晚于流水第一条 |
| P13-01 | MEDIUM（面板转来） | 明细与晨报「上限被调高」按 `ValueLine.cap` 写，而 `ValueLine` 只在超时的数变时写，调高/撤回而数不变时不反映 | 已关闭 | §6.3.1「调高上限」末段与「看得见」、§6.8 `details`：都改取 `limits.jsonl` 这一项最后一行（`raise` 写，`reset` 或无行不写，设置一变立刻变），不取 `ValueLine.cap`；`ValueLine.cap` 注释改为「只记来历、不判现在是否调高」；晨报那一句逐字「上限已由主 Agent 调高到 <capS> 秒 · <日期>：<理由>；要改回，跟主 Agent 说」。与 `plain-ui` 1.3 §8.2 `capRaised`、§11 第 2 条一致；没选的做法（`check_limit` 每次成功补写 `ValueLine`）记进 §16；L2 加调高/撤回后不跑的两例（§19.10） |
| F13 | — | 丢掉的违规记录数的持久落点 | 仍关闭 | §3.1、§3.2 的相关段这一遍未动 |
| F14 | — | `lift-files-only` 覆盖每一份检出 | 仍关闭 | §3.5 判法（字符串尾部便宜判断 + `checkoutRootOf` + 根属于会话的项目）未变，N27 只加了比较前的规范化，不改覆盖面 |
| F15 | — | git 写不出新撤下不成立；对账只查一个方向 | 仍关闭（F16 在其上扩展） | §3.5、§3.10 的双向对账仍在；F16 把「读哪段流水」从当天扩成整份，没有削弱 F15 的双向比 |
| N15–N23 | — | 第 3 轮、finish2 第 1 遍的非阻断 | 仍关闭 | 相关文字这一遍未改（N23 的 `checkoutRootOf` 这一遍只补了 §13.3、§18 的登记，即 N28） |

## 对 `plain-ui` 1.3 的 P13-01 交叉核对

- `plain-ui` 1.3 §8.2（第 814 行）与开头第 5 行：`capRaised` 取这一项现在生效的设置，即 M4 `limits.jsonl` 里这一项的最后一行（`action` 为 `raise` 时交 `{capS, at, reason}`，为 `reset` 或没有这一项时不交），不取 `ValueLine.cap`；设置一变页面数据就跟着变，不等下一次运行；调高到下一次运行之间数可与 `capS` 对不上，面板不告警。M4 §6.3.1 选的正是这一种。一致。
- `plain-ui` 1.3 §11 第 2 条（第 1027 行）：循环板给面板的映射 `capRaised` 取 `limits.jsonl` 最后一行、不取 `ValueLine.cap`。M4 未改循环板给面板的映射，只对齐自己的两处显示（明细、晨报），与此不冲突。一致。
- `plain-ui` 1.3 §11 第 4 条 (i)(ii)（第 1029 行）：请 M4 的明细与晨报按 `limits.jsonl` 最后一行写、晨报用 §4.7 的字；另两件（`ValueLine` 加被下限抬高的标记、循环板交结构化数据后 `details` 去掉超时半句）是别的事。M4 §6.3.1、§6.8、§18 第 5 条 `m8-plain-language` 一节逐条照办，并把另两件明确留给下一次修订。一致。

## 发现

### NIT-01：晨报「lifts.jsonl 有未提交的撤下」一行的 `git status` 运行位置与数据流在纯函数报告管线里没写出

位置：§3.10（对账块内「`lifts.jsonl` 有未提交的改动时另加一行……判法是在 `root` 里跑 `git status --porcelain -- docs/guard/lifts.jsonl`，5 秒上限，失败不写这一行」）。

问题：`morningReport` 是纯函数、同步返回 `string`（`src/workflow/morning-report.ts` 文件头声明 Pure），`reportFromFiles` 只拿到 `ReportFs`（仅 `readFile`），`renderHourness` 的注入 `fs` 也只有 `readFile`（`src/report/index.ts`）。整条管线没有可以跑子进程的入口。交给 `morningReport` 的 `lifts` 输入列为「`LiftRecord`、整份流水里最早的时刻、`lifts.jsonl` 原文或读错误码」，不含「未提交」这个事实。照字面，这一行没有地方产出；§19.10 钉的 `reportFromFiles` 输入与 `EACCES`/`ENOENT` 两例也没覆盖它。这一行在上一稿已存在、上一遍评审只要求补 `root`，所以不阻断 F16；但这一遍把判法写成具体的 `git status` 之后，运行它的位置与结果怎样进到渲染里仍缺。

修法：写明 `git status` 由 `renderHourness`（非纯、`async`、在 `src/report/index.ts`，可为测试注入一个 git 探测器）跑，结果作为一个布尔（或在 `lifts` 输入里新增一项 `uncommitted`）传进 `morningReport`；在 §19.10 的 L2 用注入的假 git 探测器断言这一行的出现、缺失与「失败不写」。一两句话即可闭合。

### NIT-02：`liftStatesOf` 对「逐行对账」是否够用没写清

位置：§3.10（文件一侧「用 `liftedRules` 的同一个解析 `liftStatesOf`（每条规则以最后一行的 `action` 为准，坏行跳过）」）；§2.2 `lift.ts` 行（「文本的解析是导出的纯函数 `liftStatesOf(text)`，晨报的对账用同一个」）。

问题：对账 ① 终态比较只需每条规则的终态，`liftStatesOf` 按名字与描述给的就是这个；但 ② 逐行比较要「文件里有而流水里没有的行」（键是 `at`、`rule`、`action`），需要文件里逐条解析后的行，而不是终态。实现者若照名字与「每条规则以最后一行的 `action` 为准」把 `liftStatesOf` 做成只返回终态（`Map<rule, action>`），② 就无从算起，要再解析一遍，与「用同一个解析」相违。L2 ⑪–⑭ 钉住了对账输出，测试时会暴露，所以不阻断。

修法：写明 `liftStatesOf`（或对账这一侧）同时给出逐条解析后的行（过滤坏行后的 `LiftLine` 列表），`liftedRules` 的终态与对账 ② 的逐行都从这一份派生。一句话即可。

## 已核实的假设

- `plain-ui` 1.3（第 5 行、§8.2 第 814 行、§11 第 1027、1029 行）：`capRaised` 取 `limits.jsonl` 最后一行、不取 `ValueLine.cap`，晨报字样「上限已由主 Agent 调高到 <秒数> 秒 · <日期>：<理由>；要改回，跟主 Agent 说」。M4 选的做法与之逐项一致，没选的做法（补写 `ValueLine`）记在 §16。
- `ownRules` 第五行脚本重数 = 35 个码点，不含黑名单词；契约测试按 80 上限查（N25）。
- §17 框里的话脚本重数 = 124 个码点，不含 `验收`、`标定`、`门禁`、`影子`、`投影`、`补遗`（N24）。
- `src/data/project-root.ts`：`gitEntry` 私有、`locate` 不导出、工作树 `.git` 为文件时 `rootOfWorkTree` 跟 `commondir` 回主检出、`statSync` 对不存在目录返回 `undefined` 可往上走。`checkoutRootOf`（往上找 `.git`、不跟 `commondir`、返回工作树自己的根）复用 `gitEntry`、约十行可行；现有函数与行为不改。登记这一遍补齐在 §2.2、§3.5、§13.1 G3、§13.3、§18 第 5 条（N28）。
- `path.resolve('C:/repo/x')` 实跑保留大写盘符、`resolve('c:/..')` 保留小写，所以 N27 的理由（`gitdir:` 大写、`cwd` 小写）成立；`pathKey`（`src/guard/graph-files.ts`：正斜杠、小写）规范化两边，L2 ⑯（仅 Windows）钉住。
- `src/report/index.ts`：`renderHourness` 组 `reportOptions` 再调 `reportFromFiles`，加 `RenderOptions.root` 并透传是一行改动；`/hourness` 的处理函数可读 `invocation.agent.session?.header?.cwd`（`src/shared/dsh-min.ts` `CommandInvocationLike`），据此算 `projectOf(cwd)?.root` 可行。
- `src/workflow/morning-report.ts`：`morningReport` 纯函数；`reportFromFiles` 先把整份文件读进来再 `inPeriod` 过滤，所以在过滤前抽整份 `lift` 行给 `lifts` 可行（F16）。
- §3.5 L2：⑪（两次提交，N26）、⑫（`at` 晚于流水第一条，N29）、⑭（报告期之前撤下一致 / 三天前撤下两天前恢复再换回旧版本 / 不带 `root` / 换电脑合成一行再撤第三条，F16+N29）、⑯（盘符大小写两向，N27）都在当前稿。
- §19.10 P13-01 L2：`raise` 后不跑→两处写调高句（取 `limits.jsonl`）、`reset` 后不跑→两处都没了而 `ValueLine.cap` 仍是 `{by:'setting',capS:120}`（断言两处不读它）、最后一行坏行→取前一行、读不出→按没设置、`check_limit` 成功后 `timing.jsonl` 不多行。与 P13-01 的决定一致。
- §16 新加三行（F16 读哪段流水、N29 换电脑提醒、P13-01 取哪份数据）按 §16 的「选项 / 没选的做法」两列格式写，与已放行决定一致。
- 范围自查：这一遍的改动都落在上述章节与必要的交叉引用（§0、§1.2 引言、§11、§12、§13.1/§13.3、§14.2、§18、§19.9/§19.10），没有越出八条 + P13-01 的范围，没有新增无关特性。

## 错误或未核实的假设

- 未独立精确核到 8,126：`建议验收` 七个单元格我按码点数得 8,140（差 14，属计数口径噪声，设计自写「约 8,100」并标注问人前再数），上一遍评审对 7,953 是逐字相符，故不作为发现。
- NIT-01：晨报「未提交」一行的 `git status` 运行位置与结果数据流在纯函数管线里未写出（上一稿已有、这一遍只把判法写具体）。
- NIT-02：`liftStatesOf` 的返回形态对逐行对账是否够用未写清。
- 未运行任何代码或测试；所有「关闭」「已核实」来自读设计稿、上一稿、`plain-ui` 1.3 与源码，数字用 node 脚本重数，`path.resolve` 实跑。
- 这一遍 delta 之外、随前几轮带下来的未核实点（压缩后 `deriveMessages` 是否仍含人的原消息、规则板读 `kind: 'gap'` 行、GLM-5.3 是否抄超时一句）不在本遍范围，状态同前。
