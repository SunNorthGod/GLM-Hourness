# 指标流水的代码规则 metrics-files-only（第 7 步评审，第二轮）

第二轮评审的对象是 5975658 对第一轮九条发现（`review-s7-r1.md`、`review-s7-r1.json`）的修正，以及当前 HEAD 下 `src/metrics/rules.ts`、`src/metrics/index.ts` 的接线与 `tests/metrics-rules.spec.ts`，对照设计 0.7 §3.4、§15.32、§15.42。九条都按各自的处理意见改到了：拦下现在是违规流水一行加一条 `rule` 事件，`ref` 对得上；门级 L2 覆盖了验收第 22 条 M4 部分列出的全部写法；删除、移动改成按简单命令的命令名判；`git clean -x/-X` 算删除。新问题有两处。删除改用 `simpleCommands` 之后，`cmd /c` 后面整段带引号的删除不再被认出，这个写法 3f59b61 是拦的。另一处是规则的纠偏文字让模型去读流水、去跑 `summary`，与 §15.42「没有任何提示引模型去读这些」相反。

Watch for：`cmd /c "del .llm\metrics\view.json"`、`cmd /c "rd /s /q .llm\metrics"`、`cmd /k "rmdir /s /q .llm\metrics"` 放行，3f59b61 拦（confirmed，回退）；拒绝时模型读到的 Right path 一行是「Reading the journal and npm run metrics -- summary or verify are allowed」，`summary` 输出的是 `scoresFor` 全表（confirmed）。

**Verdict**: NEEDS_CHANGES（review-s7.json 记为 CHANGES_REQUESTED）

## High-level view

规则 id 统一成不带前缀的 `metrics-files-only`，fix 步请本轮判断这一点：这样改是对的。guard 行自己的 `file-tools-only`、`graph-files-only` 在拒绝记录里也不带前缀；`guard_lift` 只按目录里的原 id 查，规则板那一路的 `resolveLiftRule` 两种写法都认，所以纠偏文字里的 id 两条撤下路都能直接用；验收第 22 条写的也是 `metrics-files-only`。指标行现在和 guard 行一样把跟进映射成 `followup`，跟进记录器全进程只有一个、每个会话只挂最后一个写入钩子，同一条跟进只经一个行写一次，不会重复计数。

删除与移动的判法换成 `simpleCommands` 之后，读命令参数里的词不再误拦，但引号包起来交给 `cmd /c` 的整段命令成了一个词。`commandOf` 跳过 `cmd /c` 后拿这个词的最后一段路径当命令名，于是 `del`、`rd`、`rmdir`、`move` 都认不出。guard 行的 file-tools-only 也不把这些当写入，所以这几条命令删得掉流水，没有任何一道门拦。§5.3 点名的删除动作里有 `del`，§3.4 承认认不出的引号写法只说 `prune`，没有说删除。

纠偏文字是拒绝时模型读到的那段话。Right path 一行告诉模型可以读流水、可以跑 `npm run metrics -- summary` 或 `verify`。§15.42 不拦读的理由之一是没有任何提示、工具说明或报告引模型去读这些，§7.6.4 第一行也写了「没有指向 `view.json` 或 `summary` 的话」，而 `summary` 打印的正是只给人看的打分（`d-metrics-ratios-person-only`）。改一行文字就够了。

fix 步留给本轮判断的 `Get-Content .llm/metrics/…; rm tmp.txt` 照旧被拒，本轮同意保留。这是 §3.4 按整条文本找 `.llm/metrics` 子串的代价，换成逐条命令判会漏掉 `cd .llm/metrics; rm *` 和管道进 `Remove-Item`；误拦现在会留下 `rule` 事件，§3.4 靠的正是这条事件发现误拦。同一代价还包括把流水拷到别处，写进 §10.6 的代价一句就行。

还有几处不挡路：写入那一半借的是 file-tools-only 的命令表，里面没有 `copy`、`cpi`、`ni` 这类 cmd 与 PowerShell 别名，`find -delete` 也不算删除，这些 3f59b61 起就放行；§12 第 7 步要的 L3 还没有；门级测试没有覆盖 `run_code` 子调用和无项目会话；两处注释写错了名字或节号。

<details>
<summary>Issues (7)</summary>

1. **`cmd /c` 引号包起来的删除放行**（阻断，confirmed）：`cmd /c "del …\.llm\metrics\…"`、`cmd /c "rd /s /q .llm\metrics"`、`cmd /k "rmdir /s /q …"`、`cmd.exe /c "move …"` 放行，3f59b61 拦。`deletesOrMoves` 里命令是 `cmd` 且带 `/c` 或 `/k` 时，把其后的词连成一段再判一次（删除移动表与写入两半都判），补这几条测试，并改 §10.6「穿过 `cmd /c|/k`」一句。
2. **纠偏文字引模型去跑 `summary`、读流水**（阻断，confirmed）：`filesCorrection` 的 `rightPath` 与 §15.42 的前提、§7.6.4 第一行相反。改成不提读流水和 `summary`（例如只说「告诉人你要什么、为什么」），并加一条断言：渲染后的纠偏文字里没有 `summary`。
3. **写入一半缺别名，`find -delete` 不算删除**（非阻断，confirmed）：`copy NUL .llm\metrics\view.json`、`cpi x .llm/metrics/view.json`、`ni -Force .llm/metrics/view.json`、`find .llm/metrics -name "*.jsonl" -delete` 放行（3f59b61 同样放行）。在规则自己的命令表里加写入别名（`copy`、`cpi`、`xcopy`、`ni`、`clc`）和带 `-delete` 的 `find`，不要去扩 file-tools-only 的表。
4. **整条文本子串的代价还包括把流水拷出去**（非阻断，confirmed）：`Copy-Item .llm/metrics/view.json C:/tmp/view.json`、`cp .llm/metrics/events-….jsonl /tmp/`、`Get-Content .llm/metrics/x > out.txt` 被本规则拒。代码不改，在 §10.6 的代价一句里补上这一类：file-tools-only 生效时这些调用本来就被拒，只有拒绝记在哪条规则名下不同，撤下 file-tools-only 之后才会实际挡住读。
5. **第 7 步的 L3 还欠着**（非阻断，confirmed）：§12 第 7 步的验证列是 L2 与 L3，探针里没有碰这条规则的场景。§10.6 和 HANDOFF 已记下；判第 7 步做完之前补一个场景，覆盖拦下、`rule` 事件、撤下与 `lift` 事件。
6. **门级测试少子调用与无项目会话**（非阻断，confirmed）：`judgeChildren: true` 下 `run_code` 的子调用被判、无项目会话直接放行，都没有门级 L2。在 `tests/metrics-rules.spec.ts` 的门级用例旁各加一条。
7. **两处注释不准**（非阻断，confirmed）：`src/metrics/rules.ts` 文首引 `docs/ORCHESTRATION.md §16.10`，那是规则板 `checkCall` 一节，指标流水在 §10.6；`packages/hourness/cordis.patch.yml` 指标行注释把规则写成 `metrics:metrics-files-only`，现在只有规则板目录用这个写法。各改一处。

</details>

<details>
<summary>Details</summary>

### `cmd /c` 后面整段带引号的删除从拦变成放

`deletesOrMoves` 对每个简单命令取 `commandOf(words)`，跳过 `cmd /c|/k` 之后取下一个词的命令名。`simpleCommands` 引号感知，`cmd /c "del .llm\metrics\view.json"` 的词是 `["cmd", "/c", "del .llm\\metrics\\view.json"]`，第三个词是整段引号里的内容；`commandName` 取最后一个路径分隔符之后的部分，得到 `view.json`，不在删除移动表里。`src/guard/shell.ts` 的 `scriptOf` 会把 `bash -c`、`pwsh -Command` 的参数当脚本再读一遍，`cmd` 不在其中。直接调用两个版本的规则（根 `C:/work/app`，会话在根）：

```
3f59b61  5975658  file-tools-only  命令
deny     allow    allow            cmd /c "del .llm\metrics\view.json"
deny     allow    allow            cmd /c "del /q .llm\metrics\*"
deny     allow    allow            cmd /c "rd /s /q .llm\metrics"
deny     allow    allow            cmd /k "rmdir /s /q .llm\metrics"
deny     allow    allow            cmd.exe /c "move .llm\metrics\view.json x.json"
deny     deny     allow            cmd /c del .llm\metrics\view.json
```

file-tools-only 的写入命令表里没有 `del`、`rd`，所以默认安装下这些命令删得掉流水与清单，没有任何门拦。`cmd /c "rd /s /q <目录>"` 是 Windows 上删目录的常见写法，不属于 §3.4 所说的有意绕过；§3.4 承认认不出的「整条命令包在引号里交给另一个 shell」只针对 `prune`，§5.3 列的删除动作里有 `del`。第一轮 S7-3 的处理意见只要求换成 `simpleCommands`，没有点出这一点，这是换判法时带出来的回退。

修法：`commandOf` 遇到 `cmd /c|/k` 时，把其后的词用空格连成一段，交给同一判法再判一次（一层就够），删除移动表那一半认出 `del`、`rd`。写入那一半同样可以对这段文本调 `shellWrites`：`cmd /c "echo x > .llm\metrics\view.json"` 在两个版本里都放行，这不是回退，顺手能补上。测试补上表里前五条，§10.6「穿过 `cmd /c|/k`」一句改成写明引号包起来的整段也读。

### 纠偏文字把模型引向 `summary`

`filesCorrection` 的 `rightPath` 是「Reading the journal and npm run metrics -- summary or verify are allowed; tell the human what you need and why.」，`renderCorrection` 把它渲染成拒绝结果里的 `Right path:` 一行，模型每次被本规则的文件判法拒绝都会读到。`src/metrics/cli.ts` 的 `summary` 输出 `scoresFor(input)`，就是只给人看的打分。

§15.42 选择不拦读，理由之一是「没有任何提示、工具说明或报告引模型去读这些」；§7.6.4 第一行写系统提示词、提醒、工具说明里「没有指向 `view.json` 或 `summary` 的话」；`d-metrics-ratios-person-only` 定的是比率不进对话。纠偏文字是写入被拒之后才出现的，模型这时已经知道流水在哪；但这句话把「去跑 `summary`」当成正路推荐给模型，比率由此进入对话的路就是这条规则自己开的。第一轮把 `METRICS_DECLARATION` 不接进提示的理由写成了注释，纠偏文字是同一个理由没有管到的地方。

修法：`rightPath` 不提读流水、不提 `summary`，例如「Tell the human what you need and why; the harness alone writes these files.」。`verify` 是 §15.42 预期主 Agent 查自查发现时用的，不必写进纠偏文字。加一条断言：本规则两种纠偏文字渲染后都不含 `summary`。

### 写入那一半与删除表之外的写法

写入一半用 file-tools-only 的判定（`fileToolsOnly.detect` 与 `writesInto`），它的命令表 `WRITE_COMMANDS` 只有 POSIX 工具和 PowerShell cmdlet 全名。规则自己的删除移动表收了 `ri`、`del`、`mi`、`ren` 等别名，写入一侧没有对应的别名：

```
allow  copy NUL .llm\metrics\view.json
allow  cpi x .llm/metrics/view.json
allow  ni -Force .llm/metrics/view.json
allow  find .llm/metrics -name "*.jsonl" -delete
```

四条在 3f59b61 同样放行，不是回退。`view.json` 在本规则的保护范围内是为了让 agent 改不了板上的数（§3.4），`copy` 覆盖它是 cmd 与 PowerShell 都有的普通写法。建议在 `src/metrics/rules.ts` 加一张写入别名表（`copy`、`cpi`、`xcopy`、`ni`、`clc`），与删除移动表一起按命令名判；`find` 带 `-delete` 算删除。不建议改 file-tools-only 的表，那会改变 guard 行对所有 shell 写入的判定，评审范围也随之变大。

### 整条文本子串的代价比 §10.6 写的宽

整条文本含 `.llm/metrics` 且 file-tools-only 认作写入就拒，所以把流水读出来写到别处也被拒：`Copy-Item .llm/metrics/view.json C:/tmp/view.json`、`cp .llm/metrics/events-2026-11-04.jsonl /tmp/`、`Get-Content .llm/metrics/x > out.txt`。file-tools-only 生效时这些调用本来就会被拒，指标行的门在最外层先拒，只是记在 `metrics-files-only` 名下；撤下 file-tools-only 之后，它们才是 §15.42 意义上被挡住的读。代码不必改，§10.6 的代价一句补上这一类即可。

### 测试覆盖与文档

门级 L2 覆盖了验收第 22 条 M4 部分的全部写法，检测器测试覆盖了设计列出的拦与放两张表、读命令参数里的删除词、`git clean` 的拦与空跑。

Not tested：引号包起来交给 `cmd /c` 的删除（上文第一节，现在是放行）；纠偏文字不含 `summary`；`judgeChildren: true` 下 `run_code` 的子调用被本规则判；没有项目的会话直接放行；§12 第 7 步的 L3（探针里没有场景，§10.6 与 HANDOFF 已记为欠着，判第 7 步做完之前要补）。

`src/metrics/rules.ts` 文首引 `docs/ORCHESTRATION.md §16.10`，那一节是规则板的 `checkCall` 与命令行，指标流水在 §10.6；这处 3f59b61 就有，本轮改文首时没有改到。`packages/hourness/cordis.patch.yml` 指标行的注释说行安装 `metrics:metrics-files-only`，S7-6 之后只有规则板目录用这个写法。

</details>

<details>
<summary>File map</summary>

范围与方法：只评 3f59b61 与 5975658 中与 `metrics-files-only` 相关的部分；loops-peak 的 quiesce 改动、第 6 步其余接线不在范围内。fix 步报告里的跨线发现（图文件门与循环板门的拒绝也不出 `rule` 事件）不属于这条规则，留给编排方。门禁结果取 5975658 的提交说明（build、preflight、npm test 156 个套件 2807/0、probe 372/372，退出码均为 0），没有重跑；文中的拦与放结果来自直接调用两个版本 `metricsFilesOnly` 与 `isPruneCall` 的一次性脚本（放在系统临时目录，不在仓库里）。第一轮的评审文档与 JSON 原样另存为 `review-s7-r1.md`、`review-s7-r1.json`。

- `src/metrics/rules.ts`：删除移动改为按 `simpleCommands` 的命令名判（`DELETES_OR_MOVES`、`commandOf`、`deletesOrMoves`），`git clean -x/-X` 经 `cleansIgnored`；规则 id 统一为 `metrics-files-only`；`isPruneCall` 的 `NAME=value` 按整词判、去掉 `metrics` 与 `prune` 两端引号；删去 `now` 依赖；注释改写。
- `src/metrics/index.ts`：`report` 映射 `metricEventOf` 交 `sink`，返回 journal 的结果，`health` 交给门。
- `src/guard/git-snapshot.ts`：导出 `cleansIgnored`。
- `tests/metrics-rules.spec.ts`：带路径的 `NAME=value` 与带引号的 `prune`、根与子目录两种会话、读命令参数里的删除词、`git clean`，以及门级的验收第 22 条 M4 部分。
- `tests/contracts.spec.ts`：去掉 `now` 参数。
- `docs/ORCHESTRATION.md` §10.6、`docs/HANDOFF.md`：第 7 步条目与第一轮修正的记录，L3 欠着。

完整改动：`git -C .worktrees/metrics show 5975658`；第 7 步原提交：`git -C .worktrees/metrics show 3f59b61 -- src/metrics/rules.ts src/metrics/index.ts src/guard/catalog.ts tests/metrics-rules.spec.ts`

</details>
