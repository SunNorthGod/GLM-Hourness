# 评审：compact-recall-redact（分支 compact-recall-redact，7a5553d）

范围：`git diff origin/main...HEAD`（13 个文件，+236/-53），节点验收以 `scripts/graph/cli.ts show compact-recall-redact` 的 `projection.node` 为准（rev 7228e57c6bae）。门禁证据读 7a5553d 提交说明与工作树 `.llm/gates/*.log`，未重跑套件；只做了一处窄抽查（见不挡路第 1 条）。

结论：APPROVED，无挡路项。

## 逐项核对

| 项 | 证据 | 结果 |
|---|---|---|
| 复用现有识别，不另造规则 | `src/data/secret-shape.ts`：新增 `redactSecretsCounted`，`redactSecrets` 改为取它的 `.text`，同一张 `SECRET_CLASSES`；`src/data/transcript.ts` 只引 `redactSecretsCounted`、`REDACTED`。gitleaks 不在运行时用，DESIGN.md §2.4 写明理由 | 满足 |
| 占位固定、条数记录 | `REDACTED = '[redacted]'`；导出说明第四行 `Replaced in this export: N.`；行健康 `遮掉 N 处像凭证的字符串`（`transcript-row.ts` `transcriptHealth`） | 满足 |
| ZCode 续接原句未改 | `src/glm-prompt/zcode-compact-text.ts` 不在 diff 中；`compact-row.ts` 未改 | 满足 |
| 遮掉失败不写明文、降级、行健康写明 | `exportTranscript` 先 `renderTranscript`（try/catch，抛错返回 `skipped`，原因「遮掉像凭证的字符串失败，不写明文：…」），之后才 `mkdir`/`writeFile`；`compact-row.ts:126-127` 对 `skipped` 返回 `undefined`，摘要不带路径；`transcriptHealth` 对 `skipped` 报 `degraded`「压缩摘要不带原文路径：…」 | 满足 |
| 行仍出厂 disabled | `packages/hourness/cordis.patch.yml` 未改，`glm-hourness/transcript` 仍 `disabled: true` | 满足 |
| 文档同批 | DESIGN.md §2.2 行表、§2.4「会话原文」（格式五行、新增「遮掉凭证」条含核实记录）、§2.4 secret-shape 一条、§5.6；ORCHESTRATION.md §8.4（1131 行）；HANDOFF.md transcript 一行；DEVELOPMENT.md §3 探针段；locale zh/en | 满足 |
| L2 钉住 | `tests/data-transcript.spec.ts`：六类样例（具名前缀、AWS key id、Bearer、PEM 整块、混排令牌、64 位十六进制）导出后不含原串、计 6、其余逐行逐字相等（`REDACTED_ENTRIES`）；无凭证时正文与文档原样、计 0；抛错时不写文件、行健康 degraded；写出时行健康带计数。`tests/data-secret-shape.spec.ts`：计数与 `redactSecrets` 一致、PEM 整块、skip。test.log 中这些用例均 ok | 满足 |
| 夹具假凭证不让 check-secrets 红 | 样例全部分段拼接；`.gitleaks.toml` 未改；test.log `check-secrets: ok (gitleaks 8.30.1: 981 commits on HEAD, staged and unstaged changes, no leaks)` | 满足 |
| L3 探针核对 | `run-probe.mjs` `glm-compact-transcript` 任务文字带两个拼出的假凭证，新核对：进了第一个请求、导出里 0 个、任务行读作两处 `[redacted]`、说明行计数 >= 2、`/glm-status` 同数。改动前 probe-before.log：该核对 FAIL（left 2 of 2，header count none，420/421）；改动后 probe.log：PASS（left 0 of 2，header count 2，421/421） | 满足 |
| 验收 1 的核实记录 | DESIGN.md §2.4「遮掉凭证」写明改动前导出原样带出；probe-before.log 的时间（21:26）早于源文件改动（21:49 起） | 满足 |
| 凭证没进日志与提交 | 两个探针假串在 `.llm/gates/*.log` 中 0 处匹配；提交内的样例均为分段拼接 | 满足 |
| 棘轮 | test.log：eslint 73 suppressed、knip 18 in the baseline、jscpd 1 clone，与基线相同 | 满足 |
| 四道门禁 | build.log、preflight.log、test.log 退出 0；probe 421/421 | 满足 |
| 与当前 main 合并 | `git merge-tree` 对 origin/main（61adacb）无冲突；main 领先的 57 个文件没有新增 `renderTranscript`/`redactSecrets` 调用方，也没有钉住旧的行健康文字 | 可合 |

验收 2 的「改动在 main 上」由合并步骤完成，不属于本分支可证的内容；合并后按 DEVELOPMENT.md §5 第 9 条跑全量门禁。

## 不挡路（non-blocking）

1. GLM 自家密钥形状只遮掉一半。FACTS.md 23 行记的 `{apiKeyId}.{secret}`：抽查用拼出的假串（32 位十六进制 id + `.` + 16 位混排），结果 `replaced: 1`，id 被遮、`.` 后的 16 位 secret 留在原文。这属于 DESIGN.md §2.4 已写明的「被 `/` 或 `.` 切开的令牌认不出」，也是任务「不另造规则」约束下的已批准取舍；id 被遮后剩下的半段单独不可用。建议在 §2.4 那句里点名这个形状，是否给共用表加一类（同时影响记忆行 `secret_like` 与循环板输出）另开节点由人定。
2. PEM 类的正则扩到 END 行，作用于整张共用表：循环板输出现在也遮私钥正文（有利）；一段只有 BEGIN、后文另有别的 END 时，会把中间全部遮掉（过遮，安全方向）。多个无 END 的 BEGIN 头的耗时抽查：5000 个头、128 万字符 160 ms，可接受。
3. 十六进制类会遮掉导出里的完整提交号，模型回读时只剩短号可用；DESIGN.md §2.4 已写明。
4. 遮掉失败时，同一会话此前写出的导出文件不删也不重写，摘要不再点名它；改动前写出的明文旧导出要等下一次压缩重写或 14 天清理，DESIGN.md §2.4 已写明。
5. 首次 `npm test` 因工作树缺未跟踪的 `.agents/tasks/m5/lessons-seed.json` 退出 1，复制后重跑全绿，与本改动无关。
