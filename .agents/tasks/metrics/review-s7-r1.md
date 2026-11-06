# 指标流水的代码规则 metrics-files-only（第 7 步评审）

第 7 步在指标行里装了一条经 `installRuleGate` 的代码规则 `metrics:metrics-files-only`，守住指标流水的文件，并把 `npm run metrics -- prune` 留给人在自己的终端里敲（设计 0.7 §3.4、§15 第 32 条）。文件工具写 `<root>/.llm/metrics/**`、`.llm/metrics-manifest.jsonl`、`.llm/metrics-key` 被拒；shell 文本含 `.llm/metrics` 且带写入或删除、移动动作被拒；`prune` 由纯函数 `isPruneCall` 按简单命令单独判，读放行（§15 第 42 条）。规则登进 `GUARD_RULES`（`liftVia: 'any'`），撤下走 `guard_lift`。`isPruneCall` 与 §3.4 的切分、前缀、头词规则逐条对得上，设计列出的拦与放两张表都有测试；问题出在拦下之后留下什么，以及删除、移动的判法。

Watch for：拦下不产生 `rule` 事件（confirmed），而 §3.4 靠这条事件让误拦被看见；shell 判法的删除、移动一半是整条文本的字面匹配，读命令里出现 `remove`、`del` 之类的词就被拒（confirmed，与 §15.42 不符）；`git clean -fdX .llm/metrics` 放行（confirmed，§5.3 点名要算）；验收第 22 条的 M4 部分（门级的拒绝留 `rule` 事件、`guard_lift` 之后放行留 `lift` 事件）没有测试（confirmed）。

**Verdict**: NEEDS_CHANGES（review-s7.json 记为 CHANGES_REQUESTED）

## High-level view

规则对象的 id 是 `metrics-files-only`，拒绝记录里带 `metrics:metrics-files-only`，与循环板 `files-only` / `loops:files-only` 同一约定；撤下按 `metrics-files-only` 过滤，`lift` 事件也带它。门在 `tools/pre-execute` 最外层，`judgeChildren: true`。项目根取 `projectOf`，工作树里的会话守的是主检出的流水。

拦下之后流水里没有 `rule` 事件。指标行把拒绝记录交给裸的 `projectJournal`，而把违规记录映射成 `rule` 事件的包装只在 guard 行自己的 journal 上。结果是一次拦下只有违规流水的一行和 `tool` 事件里的 `out: denied`，§7.2 按规则 id 计的拦截数里没有它。代码注释、提交说明和 ORCHESTRATION §10.6 都写着有这条事件。

shell 判法里写入那一半借 file-tools-only 的解析，引号感知、按命令判。删除与移动那一半是一条对整条文本的正则，不分引号也不分简单命令，所以读命令被误拦，`git clean` 又不在词表里。仓库里已有引号感知的 `simpleCommands` 可以替换它。

`isPruneCall` 有两处小缝：`NAME=value` 先去掉路径再比，值里带斜杠或反斜杠的前缀跳不过去；引号包着的 `'prune'` 认不出。两处都不在设计列出的写法里，修起来各是一行。

测试只覆盖检测器和监听器的登记。门级行为（违规流水一行、`rule` 事件、撤下后放行、`lift` 事件）没有 L2，探针 372 项里也没有一项碰这条规则，而 §12 第 7 步写的验证是 L2 与 L3。

<details>
<summary>Issues (9)</summary>

1. **拦下不产生 `rule` 事件**（阻断，confirmed）：`src/metrics/index.ts` 的 `report` 只调 `projectJournal.violation`。在同一处调 `metricEventOf(record)`（`src/guard/metrics.ts`），经指标行自己的 sink 写入，where 带 `sessionId` 与 cwd；同时定下 `rule` 事件里规则 id 的拼写（见第 6 条）。
2. **验收第 22 条的 M4 部分没有测试**（阻断，confirmed）：补门级 L2，覆盖文件工具写 `.llm/metrics/x`、`Remove-Item .llm/metrics/x`、两种 `prune` 写法、`&&` 与两种前缀写法各被拒并各留一条 `rule` 事件，`summary` 与两条放行写法放行，`guard_lift` 之后同样的调用放行并留一条 `lift` 事件；L3 的缺口在 HANDOFF 或 §10.6 里写明。
3. **读命令被删移动词误拦**（阻断，confirmed）：`Select-String … -Pattern 'remove'`、`rg -n "del" .llm/metrics`、`Get-Content .llm/metrics/…; rm tmp.txt` 都被拒，与 §15.42 不符。改用 `src/guard/shell.ts` 的 `simpleCommands` 按每个简单命令的命令词判，引号里的字不算。
4. **`git clean -x/-X` 放行**（阻断，confirmed）：`git clean -fdX .llm/metrics` 会删掉流水，规则放行；§5.3 把 `git clean` 带 `-x` 列为这条规则的删除动作。在第 3 条的命令词判法里加上 `git clean` 带 `-x` 或 `-X`。
5. **删上级目录与脚本内删除不在判法内**（非阻断，confirmed）：`rm -rf .llm`、`Remove-Item -Recurse .llm`、`node -e "…unlinkSync('.llm/metrics/view.json')"`、`[System.IO.File]::Delete(…)` 都放行。前一类是设计的子串判法本身没有覆盖，在 §3.4 写明是认了的缺口，或把删 `.llm` 本身也算进去；后一类属于 §3.4 认了的绕过写法。
6. **`rule` 与 `lift` 的规则 id 拼写不一**（非阻断，confirmed）：拒绝记录带 `metrics:metrics-files-only`，`lift` 事件带目录 id `metrics-files-only`，验收第 22 条写 `rule` 为 `metrics-files-only`。第 1 条修好后，事实里「拦下」与「撤下」两行会用两个 id 列同一条规则；修第 1 条时定一种，写进验收或文档。
7. **门的健康没接上**（非阻断，confirmed）：journal 回调返回 void，`installRuleGate` 也没收到 `health`，丢失的违规记录和检测器抛错（失败放行）都不上指标行的行健康，只有控制台告警。照 `src/guard/graph-files.ts` 把 promise 和 `health` 都交给门。
8. **`isPruneCall` 两处小缝**（非阻断，confirmed）：`PATH=/usr/bin npm run metrics -- prune`、`DSH_HOME=C:\tmp npm run metrics -- prune` 不拦，因为 `NAME_VALUE` 比的是去掉路径之后的词，改成比原词，并把 §3.4「比这些词时同样先去掉路径部分」限定到命令名；`npm run metrics -- 'prune'` 不拦，比 `prune` 之前去掉词两端的引号。
9. **注释与死代码**（非阻断，confirmed）：`METRICS_DECLARATION` 的注释说它会进每条路由系统提示的 guard 一节，实际没有任何地方加它；按 §15.42 的前提，提示里不该指向流水的位置，所以改注释，不接线。`rulesOf` 注释说「另一个工作树是它自己的项目」，与 `projectOf` 跟随 `commondir` 不符。`MetricsGuardDeps.now` 没有用到；`bare(words[head + 1]) === '/c'`（及 `/k`）永远为假。按 AGENTS.md「不留死代码」删掉。

</details>

<details>
<summary>Details</summary>

### 拦下只进违规流水，不进指标流水

guard 行在 `src/guard/index.ts` 里给自己的 journal 套了一层：写违规记录的同时 `metricEventOf(record)` 得出 `rule`（或 `followup`、`request`、`lift`）事件，经 `emitMetric` 交给指标行。`installRuleGate` 本身不发事件，它只把记录交给各行传进来的 `journal`。指标行这次照循环板的写法接线：

```ts
const journal = projectJournal(name, cwd => projectHomeFor(ctx, undefined, cwd))
const report = (record, cwd) => { void journal.violation(record, cwd) }
disposers.push(installMetricsFileGuard({ ctx, now, journal: report }))
```

```
guard 行   gate ─▶ violation() ─┬─▶ projectJournal.violation   （违规流水一行）
                                └─▶ metricEventOf ─▶ emitMetric （指标流水一条 rule）
指标行     gate ─▶ report() ──────▶ projectJournal.violation   （只有违规流水一行）
```

`src/metrics` 下找不到 `k: 'rule'` 的构造，观察者 `observe.ts` 只按 `tool/result` 的 `error.info.rule` 把 `tool` 事件标成 `denied`，不补 `rule` 事件。所以 §3.4「每次拦下带规则 id 记成 `rule` 事件（`ref` 指向违规流水那一行），规则页与晨报看得见，误拦因此能被发现」在这条规则上不成立，§7.2「拦截」一行按规则 id 也数不到它。`src/metrics/rules.ts` 文首（「a `rule` event through its wrapper」）、`src/metrics/index.ts` 的注释、提交说明和 ORCHESTRATION §10.6（「经规则行自己的 violation 包装」）都写成已有。

指标行本身就是写入者，修法不用经服务：在 `report` 里对同一条记录调 `metricEventOf`，交给行内的 sink，where 取记录的 `sessionId` 与 cwd。`ref` 由 `metricEventOf` 用 `keyOf(record)` 算，与违规流水那一行的键对得上。

修的时候要定规则 id 的拼写。拒绝记录的 `rule` 是 `METRICS_FILES_ONLY`（`metrics:metrics-files-only`），映射出的 `rule` 事件会照抄；`guard_lift` 写的 `LiftRecord` 与随后的 `lift` 事件带目录 id `metrics-files-only`；验收第 22 条写的是「`rule` 为 `metrics-files-only`」。`calc.ts` 的「拦下」和「撤下」都按 id 分组，不统一的话同一条规则会在事实里以两个名字出现。

同一处接线还丢了门的两项失败上报。`RuleGateOptions.journal` 返回 promise 时，门会把 `failed` 记到会话头上并用 `health.note` 写上行健康；`report` 返回 void，`health` 也没传，于是丢失的违规记录和检测器抛错只剩控制台的一次告警。`src/guard/graph-files.ts` 把两样都交给了门，可以照它改。

### shell 判法：删除、移动词按整条文本匹配

规则对 shell 调用先走 `writesInto`（file-tools-only 的解析加目录提及），再走自己的一步：

```ts
const normalized = shell.command.replace(/\\/g, '/').toLowerCase()
if (normalized.includes('.llm/metrics') && (DESTRUCTIVE.test(normalized) || fileToolsOnly.detect(call, NATIVE_FACE).kind === 'deny')) …
```

`DESTRUCTIVE` 是一条正则，前面允许空白、`/`、`;`、引号、`|`、`&`，后面允许空白、`/`、引号或结尾。它对整条文本跑，不区分命令词和参数，也不区分引号里外。直接调规则（根 `C:/work/app`，cwd 分别取根和 `ws/`）得到：

```
deny   Select-String -Path .llm/metrics/events-2026-11-04.jsonl -Pattern 'remove'
deny   rg -n "del" .llm/metrics
deny   Get-Content .llm/metrics/events-2026-11-04.jsonl; rm tmp.txt
allow  git clean -fdX .llm/metrics
allow  git clean -fdx
allow  Remove-Item -Recurse -Force .llm
allow  rm -rf .llm
allow  node -e "require('fs').unlinkSync('.llm/metrics/view.json')"
allow  [System.IO.File]::Delete('.llm/metrics/view.json')
```

前三条是读，或删的是别的文件，都被拒。§15.42 写明 `metrics-files-only` 只拦写、删、移，不拦读；§3.4 的条件是命令「带写入、删除或移动动作」，一个出现在搜索模式里的词不是动作。被误拦的 agent 会收到一段纠偏文字，而能让人发现误拦的 `rule` 事件又没有（上一节），两处叠在一起，误拦在流水里看不出来。

`git clean -fdX .llm/metrics` 会删掉流水目录里所有被忽略的文件，规则放行。§5.3 列这条规则 shell 判法要算进去的删除与移动时点名了「`git clean` 带 `-x`」。`clean` 不在 `DESTRUCTIVE` 里，file-tools-only 又把 git 子命令一律当作非写入。`git-snapshot` 规则会拒 `git clean -x`，但它只管主 Agent；worker 和普通会话不受它约束。

`src/guard/shell.ts` 导出的 `simpleCommands(command, dialect)` 引号感知，按简单命令给出从命令词起的各词，跳过赋值前缀与 `env`、`sudo` 一类包装，还会读进 `bash -c`、`pwsh -Command` 与子表达式。用它逐个命令比命令词（去路径与 `.exe`）是否在删除、移动词表里，再加一条「`git` 且子命令 `clean` 且带 `-x` 或 `-X`」，前三条误拦和 `git clean` 的漏拦一起解决；`.llm/metrics` 子串的条件照 §3.4 留在整条文本上。

后四条 allow 是设计判法之外的缺口。删 `.llm` 本身会连流水、清单、密钥一起删，文本里却没有 `.llm/metrics` 子串，设计的子串判法本来就拦不住；§3.4 认了的缺口是变量拼接、编码一类的绕过写法和 `prune` 的两种写法，没有提到删上级目录。要么在 §3.4 写明这一类同样靠 §5.4、§5.5 事后发现，要么把删 `.llm` 目录本身也算进去。`node -e` 和 .NET 调用属于 §3.4 认了的「规则不防有意绕过」，不要求改。

### isPruneCall 的两处小缝

`NAME_VALUE.test(word)` 里的 `word` 是 `bare()` 之后的词，路径部分已经去掉。`path=/usr/bin` 去掉之后剩 `bin`，不再像 `NAME=value`，于是不被跳过，这一段的头词成了它自己，整段放过。直接调用得到 `PATH=/usr/bin npm run metrics -- prune` 与 `DSH_HOME=C:\tmp npm run metrics -- prune` 都是 `false`，而 `env NODE_OPTIONS=--no-warnings npm run metrics -- prune` 是 `true`。§3.4 的原文「比这些词时同样先去掉路径部分」字面上也套到了 `NAME=value`，所以实现是照字面做的；这句话的用意是给 `call`、`cmd` 这些命令名去路径，套到赋值词上就跳不过带路径的值。改成对原词测 `NAME_VALUE`，§3.4 的那句限定到命令名。

`npm run metrics -- 'prune'` 与 `-- "prune"` 也是 `false`：按空白切出的词带着引号，与 `prune` 不相等。比较前去掉词两端成对的引号就够了。

`cmd` 的判断里 `bare(words[head + 1] ?? '') === '/c'` 与 `=== '/k'` 永远为假（`bare` 去掉了最后一个斜杠及之前的部分），真正起作用的是后面对原词的比较，前两项可以删掉。

### 声明、注释与依赖

`METRICS_DECLARATION` 的注释说它是「规则加到每条路由系统提示 guard 一节的那一行」。guard 行组装那一节时只加图文件门、规则板和循环板的声明，`METRICS_DECLARATION` 除了规则对象的 `declare` 字段与测试没有别的引用，所以这行字不会进提示。照 §15.42，不拦读的前提之一是「没有任何提示、工具说明或报告引模型去读这些」，而这行字点名了 `.llm/metrics/`。所以该改的是注释（写明不进提示和原因），不要接线。

`rulesOf` 里的注释说「另一个工作树是它自己的项目，有它自己的行」。`projectOf` 跟随 `commondir`，工作树归到主检出，守的也是主检出的流水，注释与行为相反。`MetricsGuardDeps.now` 从安装到判定都没有用到。

### 测试覆盖

`tests/metrics-rules.spec.ts` 测的是检测器（`isPruneCall` 的两张表，另加 `npm.EXE`、`call`、`--silent`、`pnpm`；四种受保护路径的文件写；五条 shell 拒绝与四条放行）和 `installMetricsFileGuard` 登记的监听器来自 `installRuleGate`。`tests/contracts.spec.ts` 核对目录 id 与规则对象 id 一致。

Not tested：经门的一次拒绝写出违规流水一行和一条 `rule` 事件（`ref` 等于那一行的键）；`guard_lift` 写下撤下之后同样的调用放行并留一条 `lift` 事件；`judgeChildren` 下 `run_code` 子调用被判；没有项目的会话直接放行；读命令里出现删除、移动词时放行；`git clean -x`。验收第 22 条的 M4 部分要的正是前两项，§12 第 7 步还写了 L3，探针里没有涉及这条规则的场景。

</details>

<details>
<summary>File map</summary>

范围与方法：只评提交 3f59b61 中与 `metrics-files-only` 相关的部分；第 6 步的其余接线与 loops-peak 的 quiesce 改动不在范围内。对照设计 0.7 §3.4、§15 第 32 条、§15 第 42 条，以及它们引到的 §5.3、§7.2、§12 第 7 步、验收第 22 条。本轮之前没有 review-s7 的发现，fix 步没有修正提交。门禁结果取提交说明（build、preflight、npm test 2806/0、probe 372/372，退出码均为 0），没有重跑套件；文中的拦与放结果来自直接调用 `metricsFilesOnly` 与 `isPruneCall` 的一次性脚本（放在临时目录，跑完即删）。

- `src/metrics/rules.ts`：新文件。规则 `metricsFilesOnly`、纯函数 `isPruneCall` 与切分 `splitCommands`、纠偏文字、`installMetricsFileGuard`。
- `src/metrics/index.ts`：指标行 `apply` 里安装门，违规记录交 `projectJournal`，宿主没有 `tools/pre-execute` 时写行健康。
- `src/guard/catalog.ts`：`GUARD_RULES` 加 `metrics-files-only`（行 `metrics`，`liftVia: 'any'`）。
- `src/guard/gate.ts`：`GateRules` 改为导出。
- `tests/metrics-rules.spec.ts`：新文件，检测器与监听器登记的 L2。
- `tests/contracts.spec.ts`：目录核对加指标行。
- `package.json`：`test:2` 加 `metrics-rules.spec.ts`。
- `packages/hourness/cordis.patch.yml`：指标行注释写上这条规则，行默认启用。
- `docs/ORCHESTRATION.md` §10.6：第 7 步条目。

完整改动：`git -C .worktrees/metrics show 3f59b61 -- src/metrics/rules.ts src/metrics/index.ts src/guard/catalog.ts src/guard/gate.ts tests/metrics-rules.spec.ts tests/contracts.spec.ts`

</details>
