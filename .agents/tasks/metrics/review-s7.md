# 指标流水的代码规则 metrics-files-only（第 7 步评审，第四轮）

本轮评审 49449b4 对第三轮四条发现（`review-s7-r3.md`、`review-s7-r3.json`）的修正，以及当前 HEAD 下的 `src/metrics/rules.ts`、`tests/metrics-rules.spec.ts` 和新的探针场景 `metrics-rule`，对照设计 0.7 §3.4、§15.32、§15.42。修正换了做法：命令名是 `cmd` 的简单命令，后面的文字整段按 3f59b61 的读法判，不再解析 cmd 的语法。第三轮列的十一种写法（含 bash 工具的一种）现在全部拦下，`isPruneCall` 跳过 `/c` 前的开关，写入别名表加了 `ac`，L3 场景也补上了。四条都已解决，没有剩下阻断项。整段读法带来的新问题有两类，都不阻断：一类是交给 cmd 的读命令里，开关和路径段会被当成动作词误拦；另一类是几种认不出的写法，还没记进 §10.6。

Watch for：`cmd /c "findstr /ni rule .llm\metrics\events-….jsonl"` 是读，却被拒（confirmed，新增的误拦，非阻断）。`cmd /c rm.exe -rf .llm\metrics` 放行，91d64a1 会拦（confirmed，非阻断）。

**Verdict**: APPROVED

## High-level view

门禁结果取自 49449b4 的提交说明，没有重跑：build 0，preflight 0，npm test 0（158 个套件，2852 个用例，2851 通过，0 失败，1 跳过；跳过的是面板契约测试，在等 `src/graph/plain.ts`），probe 0（376/376）。`metrics-s7r3-probe.log` 里 `metrics-rule` 的四项检查都是 PASS，覆盖拦下、`rule` 事件的 `ref`、`guard_lift` 与 `lift` 事件。

整段读法的左边界里有 `/`，比较前反斜杠又先换成了 `/`，所以 findstr 的组合开关（`/ni`、`/mi`、`/ri`）和名字像动作词的路径段（`C:\Users\mi\…`、`D:\cp\…`）也都算动作词。§10.6 的代价那句只提到文字里的「词」，没有提到开关和路径段。被误拦的是 §15.42 要求放行的读，但只发生在交给 cmd 的读里；模型在 pwsh 和 bash 里通常用 `Select-String`、`rg`、`grep`。误拦会留下 `rule` 事件，能被发现（§3.4），所以不算阻断。

整段读法的右边界不认 `.exe`，所以 `cmd /c rm.exe -rf .llm\metrics`（带不带引号都一样）放行。91d64a1 会拦，3f59b61 也放行。`Start-Process cmd -ArgumentList '/c','del …'` 和 `cmd /c "@rd /s /q .llm\metrics"` 同样放行。前者属于 §10.6 说的「`cmd` 不在命令名位置」这一类，但没有点名；后者三个版本都放行。照编排方的约定，这些记进 §10.6 认不出的写法，不算阻断。

合并提交 2dc368e 没有动 `src/metrics/rules.ts`、`src/guard/`、`tests/metrics-rules.spec.ts`。它对循环板读侧的改动（`recentRecords` 改读指标流水、`exits` 映射），以及 fix 步报告的 `loop-done.reason` 非 ASCII 被拒收问题，都不在本评审范围内，这里没有评。

<details>
<summary>Issues (3)</summary>

1. **交给 cmd 的读命令里，开关和路径段被当成动作词**（非阻断，confirmed）：`cmd /c "findstr /ni rule .llm\metrics\events-….jsonl"`、`cmd /c "dir D:\cp\app\.llm\metrics"` 被拒，91d64a1 与 3f59b61 都放行；`findstr /mi`、`findstr /ri`、`type C:\Users\mi\app\.llm\metrics\view.json` 被拒，3f59b61 也拒。修法二选一。一是收窄 `CMD_ACTION`：词左边的 `/` 前面是空白时（这是开关）不算动作词，词后紧跟 `/` 时（这是路径中间一段）也不算；这样仍能拦住 `del/q` 和 `C:\Git\usr\bin\rm`。二是不改代码，在 §10.6 的代价里写明开关与路径段也算。两种做法都补一条 `findstr /ni` 的测试。
2. **整段读法新漏掉或没有记进 §10.6 的写法**（非阻断，confirmed）：`cmd /c rm.exe -rf .llm\metrics` 放行，91d64a1 会拦。把 `CMD_ACTION` 的右边界改成允许后面跟一个可选的 `.exe` 就能补上，代价很小。`Start-Process cmd -ArgumentList '/c','del …'`（3f59b61 会拦）和 `cmd /c "@rd …"` 记进 §10.6 认不出的写法。
3. **合并 2dc368e 的循环板读侧不在本评审范围**（非阻断，范围说明）：`recentRecords` 改读流水、`exits` 映射、两个测试夹具的改写，以及 fix 步报告的 `loop-done.reason` 中文原因被写入器拒收，本轮都没有评。由编排方另派评审，或交给人决定改成原因码还是放宽字段类型。

</details>

<details>
<summary>Details</summary>

### 第三轮四条的落地情况

S7R3-1 的写法，三个版本的判定（fto 一列是同一调用在 file-tools-only 下的判定）：

```
3f59b61  91d64a1  49449b4  fto    命令
deny     allow    deny     allow  cmd /s /c "del .llm\metrics\view.json"
deny     allow    deny     allow  cmd /d /s /c "rd /s /q .llm\metrics"
deny     allow    deny     allow  cmd /v:on /c "del .llm\metrics\view.json"
deny     allow    deny     allow  cmd /s /c del .llm\metrics\view.json
deny     allow    deny     allow  cmd /c "if exist .llm\metrics rd /s /q .llm\metrics"
deny     allow    deny     allow  cmd /c "if not exist x.txt del .llm\metrics\view.json"
deny     allow    deny     allow  cmd.exe /s /c "del .llm\metrics\view.json"   (bash 工具)
deny     allow    deny     allow  cmd //c del .llm/metrics/view.json            (bash 工具)
```

S7R3-2：`cmd /e:on /v:off /k …`、`call cmd /d /c …`、`cmd /d /c env CI=1 …` 的 `prune` 都认得；引号整段的 `cmd /s /c "npm run metrics -- prune"` 照设计 §3.4 仍认不出。S7R3-3、S7R3-4 的状态见 High-level view 与 review-s7.json 的 `priorFindings`。

### 整段读法的边界

左边界放进 `/`，本意是认出带路径的命令名（`C:\Git\usr\bin\rm`）。findstr 的组合开关里，`/ni`（行号加忽略大小写）正好撞上 `ni`（New-Item 的别名），`/mi` 撞上 `mi`，`/ri` 撞上 `ri`。用户目录或项目上层目录叫 `mi`、`ni`、`cp`、`ac`、`tee` 时，绝对路径里的这一段也会触发：

```
3f59b61  91d64a1  49449b4  命令
allow    allow    deny     cmd /c "findstr /ni rule .llm\metrics\events-2026-11-04.jsonl"
deny     allow    deny     cmd /c "findstr /mi deny .llm\metrics\*.jsonl"
deny     allow    deny     cmd /c "type C:\Users\mi\app\.llm\metrics\view.json"
allow    allow    deny     cmd /c "dir D:\cp\app\.llm\metrics"
allow    allow    allow    cmd /c findstr /n /i rule .llm\metrics\events-2026-11-04.jsonl
```

`/ni` 与 `cp` 两行是 49449b4 新带来的：`ni` 来自第二轮加的写入别名表，`cp` 来自 file-tools-only 的写命令表，两者现在都进了整段读法的词表。

右边界不认 `.`，所以带扩展名的命令名在整段读法里认不出。`del` 是 cmd 的内建命令，没有 `del.exe`；但装了 Git for Windows 并把 `usr\bin` 放进 PATH 时，`rm.exe` 真实存在。91d64a1 走 `commandName`，会去掉 `.exe`。

### 测试覆盖

已测的有：第三轮的十一种 cmd 包法与 bash 工具两种、整段读法的代价一条、cmd 下四种读法放行、`isPruneCall` 带开关三种、`ac`，以及 L3 场景。

Not tested：cmd 下带 findstr 组合开关的读（`/ni`、`/mi`）；路径段撞上动作词的读；`cmd /c rm.exe …`；`Start-Process cmd -ArgumentList …`。

</details>

<details>
<summary>File map</summary>

范围与方法：只评 49449b4，加上当前 HEAD 下的 `src/metrics/rules.ts` 和 `tests/metrics-rules.spec.ts`；3f59b61 与 91d64a1 作为比较的基线。合并提交 2dc368e 只核对了它没有动本规则相关的文件。门禁取 49449b4 的提交说明，没有重跑；`metrics-rule` 的四项检查与 376/376 在 `.llm/logs/metrics-s7r3-probe.log` 里核对过，`metrics-rules.spec` 8/8 在 `.llm/logs/metrics-s7r3-rules.log` 里。文中的拦放结果来自一次性脚本，脚本直接调用三个版本的 `metricsFilesOnly`，根是 `C:/work/app`，会话在根目录。脚本放在系统临时目录，不在仓库里。第三轮的评审文档与 JSON 原样另存为 `review-s7-r3.md`、`review-s7-r3.json`。

- `src/metrics/rules.ts`：删除 `headOf` 与再读一层；新增 `CMD_ACTION`、`CMD_REDIRECT`、`cmdChanges`，命令名是 `cmd` 时按整段判；`WRITES` 加 `ac`；`isPruneCall` 跳过 `/c|/k` 之前的 cmd 开关（`CMD_SWITCH`）。
- `src/guard/shell.ts`：导出 `WRITE_COMMANDS`，给整段读法用。
- `tests/metrics-rules.spec.ts`：十一种 cmd 包法、bash 工具两种、代价一条、三种 cmd 读法放行、`isPruneCall` 带开关三种、`ac`。
- `scripts/probe/run-probe.mjs`：探针场景 `metrics-rule` 与四项检查。
- `docs/ORCHESTRATION.md` §10.6：cmd 整段读法与代价、写入别名表不求全、`isPruneCall` 偏离设计原文、认不出的写法一句、L3 场景。
- `docs/HANDOFF.md`：指标行记第三轮修正与第四轮评审。

完整改动：`git -C .worktrees/metrics show 49449b4`

</details>
