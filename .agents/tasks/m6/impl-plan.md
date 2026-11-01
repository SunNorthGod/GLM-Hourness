# M6 实现计划（项目图 `m6`，设计 0.6）

分支 `m6-glm-upkeep`，工作树 `c:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\m6`，基线 `bd5e017`（origin/main）。设计 `c:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\m6\design.md` 第 16 节的步骤表是本计划的来源；本计划只回答三件事：哪些步现在能做、哪些被什么挡住、每步在代码里落在哪。FEAT 文件在 `c:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\m6\feats\task-m6-glm-upkeep\`（`task.json`、`context.json`、`features\FEAT-001..005.json`）。任务节点只写在草稿 `c:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\m6\graph-ops-impl.json`，不写 `docs/graph`。

## 0. 读到的事实（决定了顺序与拆法）

- main 上有规则板最小一片：`src/shared/peak-mode.ts`（`peakModeService`、`peakModeState`、`PEAK_REDUCE_GLM_WORKERS` 为 1）、`src/rules/{engine,index,model,peak,permissions,repo,row-health,store}.ts`、`src/shared/pricing.ts` 的 `nextPeakChange`、探针场景 `rules-peak` 与 `rules-peak-hourness`。没有 `src/rules/check.ts`（`checkCall`）、没有排队文字渲染、没有附属条目，也没有循环板与指标流水。所以 S1、S2、S3 与指标事件被挡，Q1、R1、Q2、P1、Q3 不挡。
- 本机 `main`（用户检出）比 `origin/main` 多一个只改文档的提交 `cd257a7`（`docs/ORCHESTRATION.md` §6.5 等，不碰 §11）。合入步要先 `git fetch`，把分支变基到本机 `main` 的当前值，否则 `merge --ff-only` 会失败。
- 桌面版从主检出的 `packages/*` 加载（`DEVELOPMENT.md` §3、§5 第 4 条），工作树里的产物桌面版看不到。所以真实桌面版核对（Q4、G1）只能在 ff 合入并在主检出 build 之后做；合入前用临时 profile 的 headless 沙盒验加载与真实额度读取。M6 不加行，主 profile 不需要改，G1 写的缺口文件是用户级数据文件，不是 profile。
- 门禁里的 knip、jscpd、ESLint 是对已提交基线的棘轮，新发现会让 `npm run lint`（`npm test` 内）失败，且不许自己改基线。knip 把 `package.json` 脚本里 `node … tests/x.spec.ts` 的文件当入口，所以新规格文件必须加进 `test` 脚本列表；新的探针覆盖文件要加进 `knip.js` 的 `entry`；设计里「照抄 `Config` Schema」可能触发 jscpd，到时抽共用定义，不收基线。
- `.agents/`、`reference/`、`.worktrees/` 被 git 忽略，只在主检出里；工作树里没有这些目录，一律用绝对路径读写。
- 规划时 `npm test` 的基线结果见 §6 Digest 末行。

## 1. 步骤总表

| 序 | 步 | 图节点 | 状态 | 线与档位 | 评审等级 | 做在哪个 FEAT |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Q1 公共契约 | `m6-quota-contract` | 现在能开 | standard，L1/L2 | B（标准独立评审） | FEAT-001 |
| 2 | R1 高峰提醒按档位 | `m6-reminder-text` | 现在能开 | standard，L2/L3 | B | FEAT-002 |
| 3 | Q0 导出 3.17.1 host 包 | `m6-host-export` | 现在能开 | simple，无测试 | 并入 FEAT-003 的评审 | FEAT-003 第 1 步 |
| 4 | Q2 额度读取与登录状态 | `m6-quota-read` | 现在能开（不含指标事件） | hard，L2 | A（凭证、网络、流水、登录判据；设计要求独立评审） | FEAT-003 |
| 5 | P1 面板与晨报 | `m6-panel` | 现在能开 | standard，L2 | B | FEAT-004 |
| 6 | Q3 探针 | `m6-probe` | 现在能开 | standard，L3 | B | FEAT-005 |
| 7 | Q4 批次 L4 | `m6-l4` | 现在能开，但必须在 ff 合入并在主检出 build 之后 | standard，L4 | 无代码，由汇报核对 | 工作流的 `desktop-live` 步 |
| 8 | G1 缺口行 | `m6-gap` | 同 Q4 | simple，L4 | 无 | 同上 |
| 9 | S1 规则板文字写出高峰结束时刻 | `m6-rules-text` | 被挡 | standard，L2 | B | 无 FEAT |
| 10 | S2 脚本自查 `gateOnRules` | `m6-script-gate` | 被挡 | standard，L2 | B | 无 FEAT |
| 11 | S3 探针：排队夹具与两段 notice | `m6-rules-probe` | 被挡 | standard，L3 | B | 无 FEAT |
| 12 | 指标事件（设计 §14.2 的四类） | `m6-metrics-events` | 被挡（设计表里没有这一步，本计划补） | standard，L2 | B | 无 FEAT |

评审等级 A 与 B 都要求「不同 agent 独立评审、修复与复审至多 3 轮」（简报）；A 的评审清单额外含：令牌与请求头不进输出和流水、请求恰两个头、401 不重铸、不带 Bearer、登录判据只认三种码、流水写失败不抛、凭证文件按 stat 变化才解密。所有步用模型 claude-sonnet-5.5、effort xhigh。

## 2. 现在能开的步骤（按依赖排序，每步一个 FEAT 一个提交）

- [ ] 1. Q1 公共契约（`m6-quota-contract`，FEAT-001）。`UsagePricing` 加三个可选成员与 `peakHoursOf`、`quotaOf`；新文件 `src/shared/quota.ts`（类型与 `formatMoment`、`peakLine`、`quotaLines`、`quotaLowOf`、`quotaLowLine`、`loginLine`）与 `src/shared/channel-loop.ts`（`loopDefaultsOf`）。`nextPeakChange` 已在 main，只补缺的时刻测试。
      Files: `src/shared/pricing.ts`、`src/shared/quota.ts`、`src/shared/channel-loop.ts`、`tests/quota.spec.ts`、`tests/contracts.spec.ts`、`tests/peak-mode.spec.ts`、`package.json`（测试列表）、`docs/HANDOFF.md`
      Verify: `npm run build && npm run preflight && npm test` 退出码 0；`node --experimental-strip-types tests/quota.spec.ts` 先在无模块时失败、实现后通过。依赖：无。

- [ ] 2. R1 高峰提醒按档位（`m6-reminder-text`，FEAT-002）。`credits.ts` 导出 `PEAK_HOURS`、`PEAK_END_LABEL`，`peak-reminder.ts` 的 `peakReminderText`、`readPeakMode`、`installPeakReminder` 多一个读档位的参数，`index.ts` 的 `apply` 读 `glmHournessPeakMode`；`ORCHESTRATION.md` §11.4 整节改写；探针 `rules-peak` 加正文检查、新场景 `rules-peak-stop`；承接 NIT N22–N26、N29（§4）。
      Files: `src/glm-llm/credits.ts`、`src/glm-prompt/peak-reminder.ts`、`src/glm-prompt/index.ts`、`tests/reminder-wiring.spec.ts`、`tests/credits.spec.ts`、`scripts/probe/run-probe.mjs`、`docs/ORCHESTRATION.md`、`docs/HANDOFF.md`；设计文本 `c:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\m6\design.md`（git 外）
      Verify: `npm run build && npm run preflight && npm test && npm run probe` 退出码 0；验收 13 的 L2 全过，`rules-peak`、`rules-peak-stop` 的检查通过，无规则行的场景仍是 `PEAK_NOTICE`。依赖：`src/shared/peak-mode.ts`（已在 main）；顺序上排在 1 之后（同一工作树串行）。合入顺序规则（N23）：R1 先于规则行去掉补丁里的 `disabled: true`；与整块规则板 R4 的先后不限。

- [ ] 3. Q0 + Q2 额度读取与登录状态（`m6-host-export`、`m6-quota-read`，FEAT-003）。Q0：安装版 ZCode 仍是 3.17.1 且 MD5 一致时，只读导出 host 包到主检出 `reference/zcode-3.17.1/host/`，MD5 记入 `FACTS.md` §1，顺带核 V7；不一致就只记观察值，不猜。Q2：`usageAuthorization()`、`quota.ts`、`quota-projection.ts`、`rateShareAt`、`loop-defaults.ts`、适配器的 `upstream-limit` 与 `login-rejected` 流水、`glm-login` 的 `plan` 与 `Config`、`/glm-status` 的一段与行健康、`BIGMODEL_API_ORIGIN` 移到 `zcode-wire.ts`。不含指标事件（第 12 步）。
      Files: `src/glm-llm/{quota,quota-projection,loop-defaults,credits,zcode,zcode-wire,login-row}.ts`、`packages/glm/cordis.patch.yml`（注释）、`tests/glm-quota.spec.ts`、`tests/{glm-zcode,health,credits,quota}.spec.ts`、`package.json`、`docs/DESIGN.md` §4.7、§2.4、§2.2、§4.8、`docs/FACTS.md` §1、§2.4、§2.5、`docs/HANDOFF.md`
      Verify: `npm run build && npm run preflight && npm test && npm run probe` 退出码 0（`npm test` 含 `check:secrets`）；验收 5–12、20、21 由具名测试钉住。依赖：1、2（同文件 `credits.ts`、`glm-prompt/*` 与其测试）。评审等级 A。

- [ ] 4. P1 面板与晨报（`m6-panel`，FEAT-004）。`usagePanelOf` 与 `usagePanelLines` 一份口径，晨报「用量（今天）」改积分并删 `usageByModel`；高峰行、范围行、缺口文件与 `auditPaths.gaps`、额度一节（3 秒上限）、行健康；`ORCHESTRATION.md` §11.3 与 §12、`DESIGN.md` §2.4、`DEVELOPMENT.md` 加「删用量记录要留缺口行」。
      Files: `src/report/{panel,index}.ts`、`src/workflow/morning-report.ts`、`src/memory/audit.ts`、`tests/{hourness,workflow,contracts}.spec.ts`、`docs/{ORCHESTRATION,DESIGN,DEVELOPMENT,HANDOFF}.md`
      Verify: `npm run build && npm run preflight && npm test && npm run probe` 退出码 0；验收 2、3、4（L2 部分）、7 通过。依赖：1（代码上只依赖 1；排在 3 之后只因 `DESIGN.md` §2.4 同节）。

- [ ] 5. Q3 探针（`m6-probe`，FEAT-005）。新覆盖层 `scripts/probe/probe-net.mjs`（并加进 `knip.js` 的 `entry`），`run-probe.mjs` 核对：任何场景都没有发往 `/api/monitor` 的请求；三种包组合的输出；模型请求正文没有额度一节。
      Files: `scripts/probe/probe-net.mjs`、`scripts/probe/run-probe.mjs`、`knip.js`、`docs/DEVELOPMENT.md` §3、`docs/HANDOFF.md`
      Verify: `npm run build && npm run preflight && npm test && npm run probe`（连跑两次）退出码 0。依赖：2、3、4。

- [ ] 6. 合入前的桌面沙盒核对（工作流 `desktop-sandbox` 步，对应 Q4 的前半）。按 `DEVELOPMENT.md` §3 建临时 profile（junction 指向工作树 `packages/glm`、`packages/hourness`），`--dump-config` 与 headless 各跑一次，核对 loader 组合、`glm-login` 新 `Config`（`home`、`plan`）与无新错误；用已授权的只读额度读取做一次真实读取（不花积分），把返回的行（`type`、字段名、离重置时长、`level`）记入 `docs/FACTS.md` §2.4，按它确认或改正 §4.3 的命名函数；记下 `/glm-status` 与 `/hourness` 的输出样子与耗时（V6）；用完删临时 profile。不改 `~/.dsh` 下任何现有文件。
      Verify: 临时 profile 的 headless 无被测插件的契约或激活错误；FACTS.md 的改动随一个文档提交进分支。

- [ ] 7. 合入（工作流 `merge` 步）。`git fetch`，分支变基到本机 `main`（含 `cd257a7`）与 `origin/main` 的当前值，重跑 `npm run build`、`npm run preflight`、`npm test`、`npm run probe`（碰了运行时行），在用户检出执行 `git -C c:\Users\29596\Desktop\Project\GLM-Hourness merge --ff-only m6-glm-upkeep`，推送 origin main，失败时 `pull --rebase` 后重试，最多 5 次，每次间隔 30 秒，不强推。共享登记文件（`package.json` 测试列表、`knip.js`）后合入的一方机械地并入对方的行。
      Verify: 合入后主检出 `git log` 含全部提交，`npm run build`、`preflight`、`test`、`probe` 在合入后的 main 上退出码 0，`git status` 对 origin/main 无差异。

- [ ] 8. 合入后的桌面版核对与缺口行（工作流 `desktop-live` 步，对应 Q4 的后半与 G1）。先关闭桌面版，在主检出 `npm run build`，启动桌面版；`plugin_manager` 的 `applied` 不算，必须重启后看桌面版日志没有新错误；`/glm-status` 与 `/hourness` 各打一次，核对高峰行、范围行、额度一节；然后做 G1：用一条一次性的 node 命令（不留脚本）往 `~/.dsh/glm-hourness/audit/usage-gaps.jsonl` 追加 §6.2 的那一行（`at` 由 `new Date(1793243554750).toISOString()` 算出，文件不存在则新建），确认 `/hourness` 显示「删去 806 条」。改动与备份逐条写进汇报：该文件是新建时写明「新建，撤销即删除」，已存在时先复制备份。任何 `~/.dsh` 下已有文件在改之前先备份。桌面版现在是不是高峰无关（`d-main-agent-peak-exempt`，主 Agent 不被管；这里也没有任何 GLM 请求被排队）。
      Verify: 重启后桌面版日志无本包的新错误；`/hourness` 显示缺口行；若 FACTS.md 或文档因此有改动，经同一套变基、门禁、ff、推送流程再合入一次。

- [ ] 9. 汇报（工作流 `report` 步）。写合入的提交号、各门禁结果、`~/.dsh` 改动与备份、需要解释的地方（§5）、被挡步骤与各自等什么；把图草稿 `graph-ops-impl.json` 补上各节点的完成批注与证据（仍只写草稿）。

## 3. 被挡的步骤与各自等什么

- 第 9 步 S1 `m6-rules-text`（规则板的排队、每步提醒与唤醒文字写出「until 18:00」）：等整块规则板 R1–R4 合入（run `wf_e3f665460875b14b`，工作树 `.worktrees/rules-loops`，目前该分支与 main 相同，`src/rules/` 里还没有渲染排队文字的文件）；另需第 1 步 Q1 已合入（满足于本次运行）。设计的缺省办法：没有计价服务或读不出时文字不写时刻。合入后在规则板的文字渲染函数加可选参数 `peakUntil`，用例写在规则板的测试文件里。
- 第 10 步 S2 `m6-script-gate`（`scripts/rules-gate.mjs`、两个脚本的调用点、`tests/rules-gate.spec.ts`、`DEVELOPMENT.md` 的练习题与真网冒烟两节、`ORCHESTRATION.md` §11.4 排期条一句）：等整块规则板 R1（附属条目与缺省档位）与 R3（`src/rules/check.ts` 的 `checkCall`、`RulesCheckError`、编译产物 `packages/hourness/dist/rules/check.js`）合入。设计自带的缺省办法（导入失败就在标准错误写一行并照常开始）只保证不崩，不等于可以现在接上调用点：接上之后每次练习题与冒烟都会多一行「rules board not available」，而且 `CheckOptions` 的形状还没落地，提前写会和规则板的实现对不上。还要等一件事：编排方通知的 MEDIUM（人定 `d-code-rules-enforce` 后，每次拦下必须带规则 id 记下，可在规则页与晨报里看到）。练习题与真网冒烟被 `checkCall` 拒绝（退出码 4 或 5）时，今天没有命中记录也没有违规流水行。本计划的处理：S2 要让每次拒绝写一条拦下记录（规则 id、时刻、脚本、档位、理由），位置等设计的修订稿指定；修订稿发出之前缺省写到守卫已在写的违规流水（`<projectHome>/audit/violations.jsonl`，`src/memory/audit.ts` 的 `auditJournal().violation`，记录形状 `src/guard/index.ts` 的 `ViolationRecord`，晨报已读它）。所以 S2 另等：修订稿指定位置，或编排方确认用违规流水。`d-timeout-measured` 已定，S2 不设超时，不受此事影响。
- 第 11 步 S3 `m6-rules-probe`（探针里人设排队规则夹具、18:00 的唤醒、少做档两条 notice 并存）：等 S1、本次的 R1，以及整块规则板 R4 的探针场景与每步提醒（最小一片的 `rules-peak` 已在 main，S3 加在它上面）。
- 第 12 步 `m6-metrics-events`（设计 §14.2 的 `glm.quota-read`、`glm.upstream-limit`、`glm.login-rejected`、`glm.peak-reminder` 四类事件，验收 22）：等指标流水（特性 `metrics`）的设计成稿，定服务名、信封，以及账号一级事件归哪份流水。main 上没有指标服务，名字没有定义，M6 不自己起名。Q2 与 R1 里留出的位置：事件的数据字段都已在流水与 notice 的 `source` 里有，补事件时只在这四处各加一次「服务在就交」。
- 不属于 M6 的步骤、但读 M6 交出的数据：循环板对 `loopDefaultsOf`、`quotaLowOf`、`quotaLowLine`、`loginLine` 的使用（M6-L1 至 L5，循环板自己的实现）；高峰结束叫醒、`resume-drive`（M7 与循环板）；规则行默认启用（规则板的事，条件是 R1 先合入）。
- 验收里只能在被挡步骤之后验的条目：13 的 S3 部分、14、15、16、17、22（真 `checkCall` 一遍）、24。其余条目（1–12、13 的 L2 与 R1 的 L3、18–21、23、25）在可开步骤内完成。

## 4. 设计评审 NIT N22–N29 的落点

| NIT | 内容 | 落在哪一步 |
| --- | --- | --- |
| N22 | §17 里「今天第 N 行」的行号只留引文；探针导入行是 53 不是 53–54 | 第 2 步：改写 `ORCHESTRATION.md` §11.4 时按引文定位而不按行号；设计文本三处（头部依据、§2 表、§17）由 FEAT-002 的设计文本订正步改 |
| N23 | R1 与规则板 R4 的先后只留一条：R1 先于规则行去掉 `disabled: true`，R1 与 R4 先后不限 | 第 2 步：提交信息写这条规则并点名 R4；设计文本里写法不一致的五处（图注、R1 段、§19 末行、§21 请求表第 1 行、摘要）由 FEAT-002 订正；合入步（第 7 步）在推送前核对 origin/main 的 `packages/hourness/cordis.patch.yml` 规则行是否已去掉 `disabled: true`，若已去掉而 R1 还没进，R1 与它同一次推送 |
| N24 | 峰值为 `undefined` 时记 `peak-unknown`，与 `false` 的 `not-peak` 分开；「四种记号、五种情形」的措辞 | 第 2 步代码与测试：`PeakModeNote` 加 `peak-unknown`。注意评审建议的措辞与它建议的改法相互矛盾（加了 `peak-unknown` 就是五种记号），FEAT-002 让代码、测试与设计措辞一致（五种记号、五种情形），在汇报里写明 |
| N25 | 改档位的说法补上「对主 Agent 说，它经 `rules_propose`（kind `peak-mode`）提议」这条路 | 第 2 步：`ORCHESTRATION.md` §11.4 改写的排期条；设计 §7.2 末句由 FEAT-002 订正。S2 写 `DEVELOPMENT.md` 的两节时同样写全三条路（第 10 步）。一页稿一侧归 N27 |
| N26 | 档位服务「读一次」改为「每发一次提醒读一次」，压缩后补发读当时的档位，加 L2 例 | 第 2 步：代码按「每发一个 notice 读一次」，L2 加压缩补发例（reduce 发出、压缩移走、档位变 stop、补发 stop 正文、假服务被调两次）；设计 §1.4 第 13 条与 §3.4 由 FEAT-002 订正 |
| N27 | 一页稿仍写在 0.4 上 | 不在本运行：并行运行 `wf_8180e53b6019bc5a` 重写一页稿。规划时 `onepage.md` 的修改时间还是 2026-10-31 05:30，内容仍是旧版（「高峰时练习题会先停下」，设计 `0.5`）。第 9 步汇报时再核一遍，仍未重写就列为编排方待办 |
| N28 | 对规则板、循环板、指标流水的批注草稿要写 | 已关闭：`graph-ops-align.json` 已存在，含 `m6`、`rules`、`schedules`、`metrics` 四条批注（规划时核过 id）。本运行的草稿 `graph-ops-impl.json` 不重复这四条 |
| N29 | §21 补一句：断掉的旧稿没留副本，以后先存 `design-v<旧版本>-cutoff.md` | 第 2 步的设计文本订正步 |

设计文本订正的做法（FEAT-002 的最后一个步骤）：`design.md` 在 git 外；先核对头部仍是 0.6 且修改时间不在变化（并行运行改过它），按引文逐处最小改，在 §21 记为「实施期订正」而不是新评审轮，不改版本号。并行运行仍在写它时跳过，把清单留在 FEAT-002 的 `findings` 里交汇报步。

## 5. 要解释的地方（汇报里逐条交代）

- 设计 §16 把 Q4（桌面版）放在合入之前，但桌面版从主检出加载；本计划把「沙盒与真实额度读取」放在合入前，「重启桌面版与缺口行」放在 ff 合入并在主检出 build 之后。M6 不加行、不改 profile，所以合入后才重启不会让主 profile 处于未验证的状态。
- 设计的 Q2 含四类指标事件，但指标服务不存在；Q2 不含它们，另立 `m6-metrics-events`。
- Q0 依赖本机 ZCode 仍是 3.17.1；不是就只记观察值，Q2 的代码不依赖它。
- 编排方 MEDIUM（拦下要带规则 id 记录）只影响被挡的 S2，已写进 §3；其余步骤不受影响。
- 评审等级：设计只要求 Q2 独立评审，简报要求每步都独立评审；按简报，Q2 用更严的清单。

## 6. Digest

每个被改文件：要改的块（签名与大致行）、覆盖它的测试、读到的与验证到的。「未读」表示规划时没有打开该文件，由 FEAT 的第一步去读。

| 文件 | 要改的块 | 覆盖的测试 | 规划时读到 |
| --- | --- | --- | --- |
| `src/shared/pricing.ts`（读全） | `UsagePricing`（`basis`、`plan`、`charged`、`peak`）加 `peakHours?`、`quota?`、`loopDefaults?`；加 `PeakHoursText`、`peakHoursOf`、`quotaOf`；`nextPeakChange(peak, fromMs, horizonMs?)` 与 `pricingService` 不动 | `tests/quota.spec.ts`（新）、`tests/contracts.spec.ts`、`tests/peak-mode.spec.ts`（现 102 行） | `pricingService` 只检查四个成员；`nextPeakChange` 已在 |
| `src/shared/peak-mode.ts`（读全） | 不改，只读：`peakModeService(ctx, problem?)`、`PeakModeState`、`peakModeState(input)`、`PEAK_REDUCE_GLM_WORKERS = 1` | `tests/peak-mode.spec.ts` | `stateFor`、`stateForProject`、`peakHoldFor` 三个成员 |
| `src/shared/quota.ts`、`src/shared/channel-loop.ts` | 新文件，签名在设计 §5 的代码块 | `tests/quota.spec.ts`、`tests/contracts.spec.ts` | 文件不存在 |
| `src/glm-llm/credits.ts`（读全，约 90 行） | `creditPricing`（冻结对象，`basis` 字符串、`plan`、`charged`、`peak`）；加 `PEAK_HOURS`、`PEAK_END_LABEL`、`rateShareAt`；`OFF_PEAK_RATE` 现在未导出，`peakWindowAt` 在第 36 行附近 | `tests/credits.spec.ts`（现 39 行） | `peakWindowAt` 周一至周五 14:00–18:00 UTC+8 |
| `src/glm-prompt/peak-reminder.ts`（读全，约 60 行） | 第 28 行附近 `PEAK_REMINDER_TEXT` 字面量；`peakWindowToAnnounce`；`installPeakReminder(agent, eligible, now)` 经 `installStepNotice` 发 notice，`source` 现在只有 `peakWindow`；头注释第 4–7 行 | `tests/reminder-wiring.spec.ts`（现 150 行） | 字面量现为设计 §2 所述的原文 |
| `src/glm-prompt/index.ts`（读锚点） | `installDialect(agent, config, health, now)` 第 200 行附近，第 232 行 `installPeakReminder(agent, () => glmStep, now)`；`apply(ctx, config, now)` 第 265 行附近 | `tests/dialect-wiring.spec.ts`、`tests/reminder-wiring.spec.ts` | `provideRowHealth`、`sessionIdOf` 已导入 |
| `src/glm-llm/login-row.ts`（读锚点，约 110 行） | `LoginConfig`（`home`、`fetchImpl`）第 22 行起；`providePricing` 第 40 行提供 `creditPricing`；`apply` 第 53 行，`new ZcodeAdapter({ home, fetchImpl? })` 第 56 行；`statusCommand` 第 102 行 | `tests/health.spec.ts`、`tests/glm-quota.spec.ts`（新） | 现没有 `Config` 导出，也没有 `plan` |
| `src/glm-llm/zcode.ts`（读锚点，约 600 行） | `BIGMODEL_API_ORIGIN` 第 46 行；`projectToken` 第 240 行；`status` 第 355 行；`stream` 的 401/429 路径第 436–469 行；`AdapterContractCheck` 在底部 | `tests/glm-zcode.spec.ts`（现 843 行） | `plan` 取自 `this.options.plan ?? 'coding-plan'` |
| `src/glm-llm/zcode-wire.ts`、`src/glm-llm/auth/project-token.ts`、`src/glm-llm/auth/store.ts`、`src/memory/audit.ts`、`src/report/panel.ts`、`src/report/index.ts`、`src/workflow/morning-report.ts` | 设计 §4.2、§4.9、§6 给出块与签名 | 见各 FEAT | 未读，只量了行数（`audit.ts` 约 110 行，`panel.ts` 约 220，`index.ts` 约 130，`morning-report.ts` 约 130）；`audit.ts` 第 36–45 行有 `violations` 与 `decisions` 路径、第 52 行有 `violation(record)` |
| `scripts/probe/run-probe.mjs`（读锚点，约 1150 行） | 第 53 行导入 `PEAK_REMINDER_SOURCE`、`PEAK_REMINDER_TEXT`；第 54 行导入 `peakWindowAt`；第 348 行 `PEAK_AT`；第 365 行 `PEAK_NOTICE`；第 395–405 行 `rules-peak`、`rules-peak-hourness`；第 1062–1065、1110–1118 行相关检查 | `npm run probe` | 场景表与检查表已列 |
| `scripts/probe/probe-net.mjs`、`knip.js` | 新文件；`knip.js` 的 `entry` 加一行 | `npm run probe`、`npm run lint` | `knip.js` 的 `entry` 现含 `probe-clock.mjs` |
| `package.json` | `test` 脚本列表追加 `tests/quota.spec.ts`、`tests/glm-quota.spec.ts` | `npm test` | 列表是手写的单行 |
| `packages/glm/cordis.patch.yml`（读全，41 行） | `glm-login` 行上方加注释；不加行、不改 `config: {}` | `npm run preflight` | 6 行里 `glm-llm` 是 `disabled: true`，`glm-login` 启用 |
| `docs/ORCHESTRATION.md` | §11.4 整节改写（引文：「进入高峰时提醒 LLM」「提醒只告知」「排期功能要有」）；§11.3 与 §12 由 P1 改；§16 不动 | 无（文档） | 读了 §11.4 全文 |
| `docs/DESIGN.md`、`docs/FACTS.md`、`docs/DEVELOPMENT.md`、`docs/HANDOFF.md` | 设计 §17 表逐行；`DESIGN.md` §2.2、§2.4、§4.7（第 475 行起）、§4.8（第 479 行起）；`FACTS.md` §1、§2.4（第 87 行）、§2.5（第 113 行） | 无 | 读了 `DEVELOPMENT.md` §1.1、§2、§3、§5 |

验证到的：`npm run build` 在工作树退出码 0（setup 步报告）；`npm ci` 不可用，用 `pnpm install --frozen-lockfile`。规划时没有改任何仓库文件。基线 `npm test`：见下一行。

基线 `npm test`（工作树 `bd5e017`，TEMP 为系统临时目录）：脚本是 `&&` 链，链尾的 `graph:smoke` 输出 `ok (revision d5f4c1c8c642 …)`，所以链上每一道都通过；日志 6566 行，没有非零的 `# fail`。进程退出码没有单独取到，各 FEAT 的 coder 在自己的运行里取退出码。`npm run probe` 和 `npm run lint` 的基线没有单独跑，`npm test` 内已含 lint。
