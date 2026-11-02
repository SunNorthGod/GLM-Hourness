# M4 第一批实现评审（pass 1）

- 范围：`1dd4c80..d012455`（分支 `m4`，worktree `.worktrees/m4`），7 个提交：154ecaa（m4-cleanup）、0855155（m4-env E1+E2）、9149286 + 07f0a4c（探针检查修正）、e85daf0（m4-suppressions E4）、d879c8f（package-lock 移出）、d012455（m4-gate G1 地基）。
- 结论：**APPROVED**，无 blocker。
- 说明：任务给的格式样例 `.agents/tasks/m5/reviews/impl-S11-pass1.md` 不存在，本记录按任务描述的栏目（标题/范围/结论、证据、逐条验收、非阻塞观察、循环状态）自拟。评审时 `origin/m4` 已在 d012455 之后多出 3cba295（audit-paths spec 的失败优先修正，19:25），不在本范围；main 的 5b30404 已记录本批落到 m4 分支。本记录的结论只覆盖 1dd4c80..d012455。

## 证据

- 设计 0.6-finish2（`.agents/tasks/m4/design.md`）相关节：§2.2 构件表、§2.4 存放、§3.2 判定与记录、§3.10 晨报、§3.11 指标事件、§6.7 压制计数、§7 环境分支与草稿区、§8 清理、§13 实施顺序与步骤表、§14.1/§14.2 验证。
- 验收数组：`docs/graph/nodes/m4.json`、`m4-cleanup.json`、`m4-env.json`、`m4-suppressions.json`、`m4-gate.json`、`m4-rules.json`、`m4-checks.json`、`m4-request-card.json`。
- 实施披露：`.agents/tasks/m4/impl-progress.md`。
- 七个提交逐个 `git show`；全量 diff `1dd4c80..HEAD`（35 文件，+1467/−63）。
- main 检出（5b30404）上的跳过原因核对；探针工件 `.worktrees/m4/.llm/probe-runs/2026-11-02T11-04-03-595Z/`；基线文件（eslint-suppressions.json、knip-baseline.json、.jscpd-baseline.json）；eslint.config.js 边界规则。
- 门禁数字按记录读数与内部一致性核对，未重跑（另一进程在 tip 上重跑）。

## 逐条验收（三个 done 任务）

### m4-cleanup（1 条，全部满足）

| 条件 | 判定 | 证据 |
| --- | --- | --- |
| 「`.llm/docs/` 下的三个一次性抓取脚本和 `__pycache__` 删掉，抓下来的文件留着；删之前把重新抓取的办法、三个脚本里的地址和路径原样抄进一份参考文档；提交信息记下三个脚本的指纹。」 | 满足 | 主检出 `.llm/docs/` 只剩 `_bigmodel_md/`（47 文件），三个脚本与 `__pycache__/` 已不在；`docs/reference/bigmodel-guide-digest.md` 附节写了重新抓取办法与全部字面量（基址、llms.txt 索引、两个链接模式、种子页、UA/40 秒/重试 3 次、9 个补充页逐条），与设计 §8 的清单逐项一致；154ecaa 提交信息带三个文件的 SHA-256 与大小（1710/829/845 字节）。ORCHESTRATION §7.4 末句改写到位。 |

### m4-env（3 条）

| 条件 | 判定 | 证据 |
| --- | --- | --- |
| 第 1 条（第一步与环境分支变动后的下一步列出工具、至多 12 个 1500 字、检查一行、草稿区一行） | 满足 | `src/env/branch.ts`（env 特性的 tool 子节点，approved/doing/done 列出、proposed 计数、config 行语法与「<节点 id> 第 n 条 config 行读不懂」）、`src/env/notice.ts`（TOOL_LIMIT 12、BODY_LIMIT 1500、N-more 行、NO_CHECKS_LINE 按 E2 阶段固定、SCRATCH_LINE 固定）；first/changed/compaction 三种理由从请求可见历史推导（做法同图投影），env-notice.spec.ts 用假宿主走 preStep 钉住第一步注入/第二步不重复/分支变化重注入/压缩再锚定/无 env 节点只剩草稿区行；探针场景 env-notice 在真宿主上复核（工件里的请求含 hourness-env 提醒、工具行、无检查行、草稿区行）。 |
| 第 2 条（草稿区确实被 git 忽略；没忽略时第一次往项目 `.llm/` 写之前追加一行、已有不重复、追加后核对、仍可见降级写明原因） | 满足 | `src/data/llm-ignore.ts`：每进程每仓库一次（Map memo），`ensureIgnored` 追加 `.llm/`（四种等价拼写去重，project-root.ts 改为返回是否追加），`git check-ignore -q .llm/scratch/x` 复核，`visible`/`unwritable` 两种降级带原因；envHealth 输出「已把 .llm/ 写进 .git/info/exclude」与降级文案。env-ignore.spec.ts 用真实临时 git 仓库覆盖：追加后 check-ignore 退出 0、重复运行只一行、`!/.llm/` 反向模式降级且原因含 .gitignore、四种已有拼写不重复、仓库外 no-git。guard 行一侧的调用随 G1（条件是「guard 行或 env 行」，env 行已满足「或」）。 |
| 第 3 条（有办法列出草稿区文件，供 M7 用） | 满足 | `src/guard/scratch.ts` 的 `scratchLeftovers`：相对路径、至多 200、`{files, total}` 另报总数，目录不存在为空；env-ignore.spec.ts 覆盖嵌套、上限、缺失目录。披露的签名偏差（`readonly string[]` → `{files, total}`）与设计 §7.3 正文「另报总数」一致，构件表的旧签名本身与该句矛盾，取正文是对的。 |

### m4-suppressions（2 条）

| 条件 | 判定 | 证据 |
| --- | --- | --- |
| 第 1 条（跳过检查的注释总数每天至多记一次、写在项目 `.llm/` 下、按标记分类；装了指标服务时同时交计数事件） | 部分满足 | 计数侧满足：`src/env/suppressions.ts` 按仓库 + UTC+8 天至多一条（进程 memo + 流水末行双保险，测试覆盖同日跳过、次日再记），`{at, repo, total, byMarker}` 追加进 `<root>/.llm/audit/suppressions.jsonl`（经 `auditPaths.suppressions`），>1 MiB 与二进制跳过（有测试）；标记最长先数并从文本移除，`eslint-disable-next-line` 不重复算 `eslint-disable`（countMarkers 有测试）。指标事件未交：指标服务的行不存在，按设计 §3.11「服务不在时什么都不做」暂时为空操作，impl-progress 已披露；指标落地时须补交计数事件（见循环状态）。 |
| 第 2 条（晨报写「跳过检查的注释 N 处（本期 +a / −b）」） | 满足（带披露偏差） | `suppressionLineOf` 输出该行，晨报在「例外（先看）」节之后插入（有测试断言位置与「无记录不出行」）。偏差：+a/−b 按当期逐日记录的增量累加，设计 §6.7 写的是「取本期第一条与最后一条」；净零有涨跌的期间两种算法不同。披露在案（impl-progress 偏差 3），属 §13.5 第一档（实现取值与呈现），验收行的形状保留；无涨跌时省略括号是呈现取舍，一并记在这里。 |

### m4-gate G1 地基（非任务完成，两项核查）

- 分类表钉住：`tests/guard-records.spec.ts`（4 test）逐例对上设计 §3.2 的枚举——无 mode 拒绝、`enforce`+`block` 拒绝、`enforce`+`queue` 排队（deferral）、`rules:`+`record` 只记录、`file-tools-only` 与 `rules:` 开头的 `late` 都算晚到拦下、带 `paths` 的旧 `shadow` 算晚到、其余 `late`/无 `paths` 的 `shadow`/非规则板的 `record`/未知 `kind` 都算读不懂、`lift`/`gap` 各归其类；`recordKey`/`keyOf`（12 位十六进制、稳定、逐行不同、keyOf=recordKey(JSON.stringify)）与 `subjectOf`（shell 文本截 8192、file_path/path 目标、裸工具）都有断言。与 §14.2 对 classifyRecord 的 L2 清单吻合。
- 不破坏今天的行为：d012455 只搬类型（guard/index.ts 改再导出）、加纯函数（classifyRecord/recordKey/keyOf/subjectOf 尚无 src 消费方，仅测试用）、晨报把 violations 输入收窄为三个今日类型，过滤逻辑（`mode === undefined || 'enforce'` / `'shadow'`）一字未动；`ViolationRecord` 新增的 `call`/`ref` 是可选字段。现有 guard 行、graph-files、loops/guard 两道门的 evaluate 路径未被触碰。六个记录类型（followup/request/grant/grant-void/lift/gap）按披露留给 G1 的门提交（设计 §3.2 原意是 G1 一次建好，仓库的死代码规矩挡在前面，取舍已披露）；**G1 的门提交必须把这六个类型补齐**，否则与设计不符。

## 跳过原因核对（main@5b30404 实读）

1. m4-request-card：`src/guard/main-agent.ts` 在 main 上不存在（ls 报 No such file）——属实，G4 依赖 M3 第 4 步的 `dispatchRoot`。跳过成立。
2. m4-checks：`src/loops/run.ts` 的 script/check 条目一律 refused（`unadopted`/`check-missing`），带引注的注释「Nothing is started: the shared script executor and the approval path are not built」在（约 563–567 行）；`src/loops/script.ts` 不存在；其声称已在的依赖（trigger.ts 的 `matchesFilter`、service 的 contribute/emit/listens/recordRun）核实存在。跳过成立，且不另写第二套执行器符合设计 §2.2「不加的东西」。
3. m4-rules 第 2 条（R1）：`src/graph/proposal.ts` 只导出 `ProposalText`/`renderProposal`，`src/graph/tools.ts` 无 `propose_to_human`——属实，M3 第 6 步未合入。三条新规则与验收第 3 条随 G3，符合设计步骤表。跳过成立。

## 棘轮与门禁数字

- eslint-suppressions.json：范围起点 249 → HEAD 244（逐提交实算）；唯一删项是 `src/workflow/morning-report.ts` 的 no-unsafe-argument ×3 + no-unsafe-return ×2，与 readJsonl/inPeriod 泛型化删掉四处断言对应，无新增压制。
- knip-baseline.json 21 条 findings、.jscpd-baseline.json 2 个指纹，与记录的基线一致；两文件在范围内无提交触碰。
- preflight 数字内部一致：env 后 14 src dirs（3 GLM + 11 hourness）、17 rows（15 宿主行 + 2 客户端行）；cleanup 提交的 13/16 是 env 之前的值。
- 探针 213/213（07f0a4c）：checks 数组实数 192 直项 + designChecks 21（5 + 2 路由 × 6 + 4）= 213，与记录吻合；检查 PASS 行只进控制台、不落盘，数字采信记录 + 工件旁证（运行目录含 45 个场景，env-notice 的请求里确有 hourness-env 提醒与草稿区行、`info/exclude` 有一行 `.llm/`）。

## 卫生

- 新增 1467 行中无人设/语气词；无 eslint-disable/@ts-*/TODO/FIXME（命中的 14 处全是标记表数据与它的测试注释）。
- env 行 `disabled: true`，patch 里排在 loops 之后、ui 之前；`./env` 与 `./env/locale/*.json` 导出、locale 标题（Dev environment／开发环境）、packages.mjs、tsconfig、HOURNESS_ROWS、contracts 与 health 的行清单全部落位；`gitDirOf` 的 no-git、`.git` 非目录分支与设计 §7.3 步骤 1 一致。
- 提交信息：四个 feat 提交带 Gates 行；9149286、07f0a4c、d879c8f 没有（两笔探针修正以随后的整轮探针为证，chore 不碰代码——记为小疵）。
- 无夹带：35 个文件逐一过目，全部落在三个 done 任务的构件表与登记清单内；d879c8f 对 package-lock 的处理诚实且单独成提交。

## 失败优先

未逐字执行，披露在案（impl-progress 偏差 7）。步表「今天必败」栏核为可信：E1 的 contracts ROW_IDS 字面清单与 HOURNESS_ROWS 字面测试、preflight 导出检查；E2 的探针场景与真实临时仓库检查；E4 的晨报行。范围外紧跟的 3cba295（「the spec on d012455 fails with the actual carrying the extra suppressions key」）显示失败优先在其后已在真实执行。G1 剩余部分改既有行为，下一批必须按设计做真正的失败优先，进度文档已作此承诺。

## 非阻塞观察

1. `envBranch` 的 `issues`（读不懂的 config 行）已计算并有测试，但没有任何消费方——设计 §7.1 说这类行要进行健康。当前行健康只报图目录与忽略结果。建议下一批触碰 `src/env/` 时把它接进 `envHealth`（E3 加检查行问题时同一路径）。不在 m4-env 冻结验收的三条之内，故不算 blocker。
2. env 行健康的「仍可见」文案与设计 §7.3 引句不同（实现「项目的 .llm/ 没有被 git 忽略：<原因>」，设计「写了 .llm/ 但仍未被忽略：<原因>」）；验收条件只要求「降级并写明原因」，已满足。
3. 探针 env-notice 场景与设计 §14.1 有两处出入：未播提议中的工具节点（「1 more tool node waits」只被 L2 覆盖，未在 L3 走到）；「第一个请求末尾」改为按来源 hourness-env 找（真宿主把 skills 提醒排在步末，修正是对的且已披露）。另外 §14.1 写 exclude 行是 `/.llm/` 而 §7.3 写 `.llm/`，实现与探针按 §7.3，设计内部两处不一致，以 §7.3 为准。
4. 报告数字小疵：impl-progress 说 env-branch.spec 6 个、env-notice.spec 6 个，实为 5 与 7；154ecaa…d012455 的提交信息说 env-branch.spec (12)，实为 5。「缩小 8 条（249→244）」把删掉的 8 行 JSON 与 5 个压制问题数混写（249→244 准确，8 是行数）。都不影响验收，记录口径宜修。
5. `classifyRecord`/`recordKey`/`keyOf`/`subjectOf` 在 G1 门落地前只有测试消费（knip 因测试引用而通过）；这是有意地基，不是死代码，但下一批不动它们就应重来审视。
6. src/guard/records.ts 的 RecordedCall 之后有四行连续空行（格式小疵，lint 未拦）。

## 循环状态（留给下一批 M4）

- m4-gate G1 剩余（一整步）：`installRuleGate`（gate.ts）+ `judge`；guard 行、graph-files.ts、loops/guard.ts 全部改经它并删 `evaluate`；晨报过滤换 `classifyRecord`；六个记录类型补齐；按项目写流水（projectHomeFor/projectJournal/gap/flush/GapRecord）、`RowHealth.note`、`GUARD_RULES` 目录与契约测试、`tests/guard-rules.spec.ts` 事故种子、探针 glm/non-glm-guard/hourness-only 纠偏期望逐字改。开工前重读设计 §3 全节、`src/loops/guard.ts` 与 `src/rules/gate.ts` 的判定路径；本批先做真正的失败优先 spec。
- m4-rules：三条规则与 ORCHESTRATION §6.4 改写随 G3；R1 等 M3 第 6 步（`propose_to_human` 等，已核实 main 上没有）。
- m4-checks（E3）：等循环板 S1/S3 的共用执行器（`src/loops/script.ts` 不在 main，已核实）。
- m4-request-card（G4）：等 M3 第 4 步（`src/guard/main-agent.ts` 不在 main，已核实）。
- m4-suppressions 残项：指标服务落地时补计数事件（§3.11）。
- 顺手项：`envBranch.issues` 接进 env 行健康；records.ts 空行；报告口径的测试数修正可随下一批文档提交带上。
- 解阻条件：G1/G3 无外部依赖；R1←M3 第 6 步；E3←循环板 S1/S3；G4←M3 第 4 步。
