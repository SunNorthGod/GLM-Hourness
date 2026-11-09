# 指标流水的代码规则 metrics-files-only（第 7 步评审，第三轮）

第三轮评审的对象是 91d64a1 对第二轮七条发现（`review-s7-r2.md`、`review-s7-r2.json`）的修正，以及当前 HEAD 下 `src/metrics/rules.ts` 与 `tests/metrics-rules.spec.ts`，对照设计 0.7 §3.4、§15.32、§15.42。两条阻断发现按处理意见改到了：交给 `cmd /c|/k` 的引号整段会再读一遍，第二轮列的五条删除、移动和一条重定向重新被拦；纠偏文字不再提读流水和 `summary`，有断言钉住。非阻断的 S7R2-3、-4、-6、-7 也都改到了，S7R2-5 的 L3 仍欠着。新问题出在同一处：再读一遍只发生在 `cmd` 后面紧跟 `/c` 或 `/k` 的时候，`cmd` 带别的开关，或交给 cmd 的整段以 `if exist …` 开头时，删除仍然认不出。这些写法 3f59b61 都拦，file-tools-only 也不拦，是 S7R2-1 那处回退没有收全；第二轮评审只列了紧跟 `/c` 的写法，这两种当时漏看了。

Watch for：`cmd /d /s /c "rd /s /q .llm\metrics"`、`cmd /s /c del .llm\metrics\view.json`（不带引号也放行）、`cmd /c "if exist .llm\metrics rd /s /q .llm\metrics"` 放行，3f59b61 拦（confirmed，回退）。

**Verdict**: NEEDS_CHANGES（review-s7.json 记为 CHANGES_REQUESTED）

## High-level view

门禁结果取自 91d64a1 的提交说明：build、preflight、npm test（156 个套件，2808 通过，0 失败，1 跳过）、probe 372/372，退出码都是 0。跳过的那一条是面板契约测试，在等 `src/graph/plain.ts`，与本规则无关。第二轮的六条已改发现都按处理意见落地，各自的状态记在 review-s7.json 的 `priorFindings` 里。

回退没收全的有两种写法。一种是 `cmd` 在 `/c` 之前带了别的开关（`/s`、`/d`、`/q`、`/v:on`），Node 在 Windows 上起 shell 用的就是 `cmd.exe /d /s /c "…"`；这时规则找不到命令词，后面那段不管带不带引号都不读。另一种是交给 cmd 的整段以 `if exist <路径>` 或 `if not exist <路径>` 开头，这是 cmd 里先判断再删的标准写法，再读时 `exist` 被当成命令名，真正的 `rd`、`del` 落在参数位置。两种都删得掉流水，默认安装下没有别的门拦。改完这两种之后，cmd 其余的语法（`if "%x%"=="y" …`、`/c` 与引号之间不留空格、`start /b cmd …`）作为认了的缺口写进 §10.6 就够，本轮不把它们算阻断。

不挡路的还有三处。`isPruneCall` 同样只跳过紧跟 `/c`、`/k` 的 `cmd`，`cmd /s /c npm run metrics -- prune` 放行；设计 §3.4 原文写的就是「紧跟着的 `/c` 或 `/k`」，实现与设计一致，改 `headOf` 时可以顺带共用同一种跳法，并在 §10.6 记一句偏离设计原文。写入别名表之外仍有 `ac`（Add-Content 的别名）、`Invoke-WebRequest -OutFile`、`curl -o`、`tar -C` 这类写法放行；3f59b61 也放行，file-tools-only 也不认得它们，不是回退。§12 第 7 步要的 L3 还没有。

<details>
<summary>Issues (4)</summary>

1. **cmd 带别的开关、或整段以 `if exist` 开头时，删除仍放行**（阻断，confirmed，回退）：`cmd /s /c …`、`cmd /d /s /c …`、`cmd /q /c …`、`cmd /v:on /c …`（带不带引号都一样）与 `cmd /c "if exist X rd /s /q X"`、`cmd /c "if not exist Y del X"` 放行，3f59b61 拦。`headOf` 跳过 `cmd` 后面 `/c|/k` 之前的开关（形如 `/[a-z](:\S+)?` 的词）；cmd 那一遍读时跳过 `if`、可选的 `/i` 与 `not`，以及 `exist|defined|errorlevel` 连同它后面的一个词；补上这几条测试；§10.6 写明这两种写法也读，`if "%x%"=="y" …`、`/c` 后不留空格、`start /b cmd …` 记为认了的缺口。
2. **`isPruneCall` 不跳过 cmd 的其他开关**（非阻断，confirmed）：`cmd /s /c npm run metrics -- prune` 放行。设计 §3.4 写的是「紧跟着的 `/c` 或 `/k`」，实现与设计一致。改第 1 条时可以让 `isPruneCall` 用同一种跳法，并在 §10.6 写一句偏离设计原文的记录；不改也行，那就把这个写法记进认不出的写法。
3. **写入别名表之外的写法**（非阻断，confirmed）：`ac .llm/metrics/view.json x`、`Invoke-WebRequest … -OutFile .llm/metrics/view.json`、`curl -o .llm/metrics/view.json …`、`tar -xf x.tar -C .llm/metrics` 放行，3f59b61 同样放行，不是回退。建议把 `ac` 加进本规则的写入别名表，并在 §10.6 写明这张表列的是常见写法，不求全。
4. **第 7 步的 L3 还欠着**（非阻断，confirmed，沿用 S7R2-5）：探针里仍没有碰这条规则的场景。判第 7 步做完之前补一个场景，覆盖拦下、`rule` 事件、`guard_lift` 撤下与 `lift` 事件。

</details>

<details>
<summary>Details</summary>

### cmd 的开关和 `if exist` 让删除重新认不出

`headOf` 只在 `cmd` 后面紧跟 `/c` 或 `/k` 时往后跳。`cmd /s /c del …` 的词是 `["cmd", "/s", "/c", "del", …]`，第二个词是 `/s`，`head` 停在 0，命令名是 `cmd`，两张表里都没有，`head > 0` 的再读也不触发。引号包起来的 `cmd /s /c "del …"` 同理。

`if exist` 的问题在再读那一遍。整段 `if exist .llm\metrics rd /s /q .llm\metrics` 交给 `simpleCommands` 按 pwsh 或 posix 读，`if` 在保留字表里被跳过，下一个词 `exist` 成了命令名，`rd` 只是参数。cmd 的 `if` 后面先是条件、再是命令，两种方言的读法都不按这个结构读。

直接调用三个版本的规则（根 `C:/work/app`，会话在根），最后一列是同一调用在 file-tools-only 下的判定：

```
3f59b61  5975658  91d64a1  fto    命令
deny     allow    allow    allow  cmd /s /c "del .llm\metrics\view.json"
deny     allow    allow    allow  cmd /d /s /c "rd /s /q .llm\metrics"
deny     allow    allow    allow  cmd /q /c "del .llm\metrics\view.json"
deny     allow    allow    allow  cmd /v:on /c "del .llm\metrics\view.json"
deny     allow    allow    allow  cmd /s /c del .llm\metrics\view.json
deny     allow    allow    allow  cmd /d /c rd /s /q .llm\metrics
deny     allow    allow    allow  cmd /c "if exist .llm\metrics rd /s /q .llm\metrics"
deny     allow    allow    allow  cmd /c "if exist .llm\metrics\view.json del .llm\metrics\view.json"
deny     allow    allow    allow  cmd /c "if not exist x.txt del .llm\metrics\view.json"
deny     allow    allow    allow  cmd /c if exist .llm\metrics rd /s /q .llm\metrics
deny     allow    allow    allow  cmd.exe /s /c "del .llm\metrics\view.json"    (bash 工具)
```

5975658 一列说明这两种写法从换成按命令名判起就放行，第二轮评审只拿紧跟 `/c` 的写法比了两个版本，没有发现。按第二轮的判据，`cmd /c "rd /s /q <目录>"` 是 Windows 上删目录的常见写法，不属于 §3.4 所说的有意绕过；`if exist <目录> rd /s /q <目录>` 是同一件事加上存在检查，`/d /s /c` 是 Node 起 cmd 的固定写法，同样不是有意绕过。§3.4 承认认不出的引号写法只针对 `prune`。

修法有两处，都在 `src/metrics/rules.ts`。`headOf` 遇到 `cmd` 时，跳过它后面形如 `/[a-z](:\S+)?` 的开关，直到 `/c` 或 `/k`。再读那一遍（`nested` 为真）对头一个简单命令先跳过 `if`、可选的 `/i` 与 `not`，再跳过 `exist`、`defined`、`errorlevel` 中的一个连同它后面的一个词，剩下的从命令词起照常判。测试补上表里的写法各一条，另加一条 `cmd /c "if exist .llm\metrics\view.json type .llm\metrics\view.json"` 放行，免得改过头把读也拦了。

### 测试覆盖

Not tested：`cmd` 在 `/c|/k` 前带别的开关；交给 cmd 的整段以 `if exist`、`if not exist` 开头；`cmd` 带开关的 `prune`；§12 第 7 步的 L3（探针里没有场景，§10.6 与 HANDOFF 已记为欠着）。

</details>

<details>
<summary>File map</summary>

范围与方法：只评 91d64a1，加上当前 HEAD 下 `src/metrics/rules.ts` 与 `tests/metrics-rules.spec.ts`；3f59b61 与 5975658 作为比较的基线。门禁结果取 91d64a1 的提交说明，没有重跑；跳过的那一条从 `.llm/logs/metrics-s7r2-test.log` 里核对过。文中的拦与放结果来自直接调用三个版本 `metricsFilesOnly` 的一次性脚本（放在系统临时目录，不在仓库里）。第二轮的评审文档与 JSON 原样另存为 `review-s7-r2.md`、`review-s7-r2.json`。

- `src/metrics/rules.ts`：`headOf` 跳过 `cmd /c|/k`，`changesFiles` 对其后连成的一段再判一层（删除移动表、写入别名表、`find -delete`、`git clean -x/-X`、`shellWrites`）；新增写入别名表 `WRITES`；`filesCorrection` 的 `rightPath` 改写；文首节号改为 §10.6。
- `tests/metrics-rules.spec.ts`：cmd 引号整段的六条拒绝与一条放行、五个写入别名与 `find -delete`、两种纠偏文字不含 `summary` 与 `read`、门级的 `run_code` 子调用与无项目会话。
- `docs/ORCHESTRATION.md` §10.6：写入别名表、cmd 整段再读、两类代价、纠偏文字不提 `summary`。
- `docs/HANDOFF.md`：指标行记下第二轮修正与评审文档的新文件名。
- `packages/hourness/cordis.patch.yml`：指标行注释里的规则名改为 `metrics-files-only`。

完整改动：`git -C .worktrees/metrics show 91d64a1`

</details>
