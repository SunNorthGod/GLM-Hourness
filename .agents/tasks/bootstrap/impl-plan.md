# 接管（bootstrap）实施计划

设计：同目录 `design.md` 0.6（已放行，`d-bootstrap-released`）。D1、D3 人 2026-11-02 已答：41 条做完条件照草稿算数；接管来的待做活开工前不出一页放行稿（`bootstrap` 节点 2026-11-02T06:59Z 的批注）。本计划只排顺序、写验收与依赖，不改设计方向；设计里没说、要人定的点列在第 7 节，答复到了照原话记在那里。

干净区：本文件不写人设与语气词。

## 1. 基线

- 工作树 `C:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\bootstrap`，分支 `bootstrap`，已快进到 `origin/main` `78f45e3`（`1a6eb15..78f45e3` 只改了 `docs/graph/`）。计划写完时 `origin/main` 又前进到 `e8d57a4`，也只改了 `docs/graph/`；B0 开工前已快进到 `e8d57a4`（没有合并提交）。
- 计划步在该提交上跑过：`npm run build` 0、`npm run preflight` 0、`npm test` 0（2939 通过、0 失败、1 跳过），棘轮 eslint 73 / knip 18 / jscpd 1。任务书写的 76 / 19 / 1 是旧数；不许上升指的是不超过现值 73 / 18 / 1。探针在计划步没有跑。
- `tests/lessons-seed.spec.ts` 要读被 `.gitignore` 忽略的 `.agents/tasks/m5/lessons-seed.json`。新工作树里没有这个文件，计划步从主检出把它复制进本工作树（只读主检出，SHA-256 前 12 位 `E10A3247BBA0`，与其他工作树相同）。以后新建检出要照做。
- 日志：`.llm\logs\bs-plan-{install,build,preflight,test}.log`。

## 2. 每批的门禁规程

所有命令在工作树根目录跑（相对路径会落到主检出，不要省 cwd）。每批一个提交，提交信息带任务 id（如 `feat(bootstrap): … (bootstrap-scan)`），文档与代码同一提交。

1. 开工前：`git fetch origin`；main 前进了就 `git merge origin/main`（不 rebase），合并后先跑一遍全量门禁，绿了再动代码。`pnpm-lock.yaml` 变了就先 `pnpm install --frozen-lockfile`。
2. 门禁四道，日志写 `.llm\logs\bs-<批次>-<道>.log`，退出码在每条 `cmd /c` 之后立即用 `$LASTEXITCODE` 取：
   - `cmd /c "npm run build > .llm\logs\bs-B2-build.log 2>&1"`；`$LASTEXITCODE`
   - `cmd /c "npm run preflight > .llm\logs\bs-B2-preflight.log 2>&1"`；`$LASTEXITCODE`
   - `cmd /c "npm test > .llm\logs\bs-B2-test.log 2>&1"`；`$LASTEXITCODE`（棘轮三项在这份日志里：`eslint: ok (N suppressed)`、`knip: ok (N in the baseline)`、`jscpd: ok (N clone(s)…)`）
   - 探针：先取锁 `New-Item -ItemType Directory C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\probe-lock`，失败试 `…\.llm\probe-lock-2`，两个都在就每 60 秒重试，建于 45 分钟以前的锁目录视为残留可删；记下主检出 `.llm\loops\view.json` 的修改时间与 SHA-256；`cmd /c "npm run -s probe > .llm\logs\bs-B2-probe.log 2>&1"`；`$LASTEXITCODE`；再记一次 `view.json`，变了就写进报告（不当失败）；删掉自己取的锁。探针运行中不在本检出重建。
3. 只改 `.agents/tasks/` 下 md 的批次（B0、B1）同样跑四道。
4. 机器负载高时的纯计时失败：先单独 `node --experimental-strip-types tests/<spec>.spec.ts` 重跑该 spec 3 次，3 次都绿才归为抖动，写进报告。
5. 四道退出码都是 0、探针全绿：`git push origin bootstrap`（第一次 `git push -u origin bootstrap`）。只推本分支，不推 GitHub 镜像，不强推。
6. 回填第 3 节总表的「提交」「门禁」两列：提交号、build/preflight/test/probe 四个退出码、测试通过/失败/跳过数、棘轮三数、探针通过数。

新测试文件要加进 `package.json` 的 `test:2` 链（测试按文件名逐个列出，不是通配）。

## 3. 批次总表

状态取值：待做 / 顺延-等谁 / 已推。验收号是设计 §1.4 的「任务 #条」。

| 编号 | 内容 | 设计 §1.4 验收 | 设计 §16 | 状态 | 提交 | 门禁 |
| --- | --- | --- | --- | --- | --- | --- |
| B0 | 本计划入库 | — | — | 已推 | `4bd7328` | build 0、preflight 0、test 0（2939 通过 / 0 失败 / 1 跳过）、probe 0（376/376）；棘轮 73 / 18 / 1；首轮的两处计时失败见第 9 节 |
| B1 | 设计稿收尾：D1、D3 的人答写进 §0、§0.1、§18、§20 | — | — | 已推 | 随下一批回填 | build 0、preflight 0、test 0（2955 通过 / 0 失败 / 1 跳过）、probe 0（382/382）；棘轮 73 / 18 / 1 |
| B2 | 扫描、判路、危险命令、底线清单草稿、「不许碰」路径 | scan #1–#4；scan #5 的格式部分（`parseFloor` 往返核对在 B7） | B1 | 待做 | | |
| B3 | `/graph-run start` 把已批准的任务转进行中 | run-start #1 | B2 | 待做 | | |
| B4 | 接管行、服务（`prepare`、`holds`）、接管流水、共用的确定性部分、三个规范模板、`/hourness-init`、登记文件；只走过渡路 | row #1、#3–#8（#1、#4、#7 按过渡路的写法，见第 4 节 B4） | B3（不含 M3 的两处接缝） | 待做 | | |
| B5 | 两条路的提醒、默认表（按 Q1 的答复带测试命令）、两件事的草稿与 `cost`、`touch` 的 `attach`、`floor.md`、`rule-draft.json`、`ATTACH_BOARDS` 的 `bootstrap:` 一行；设计稿按 Q1 同批改 | paths #1、#2、#3（M4、M7 往返核对除外，在 B7）、#5、#6、#7、#9 | B4 | 待做 | | |
| B6 | 试跑：克隆、白名单环境、沙盒包装、限时、残留清扫、`matchedLine`、`bootstrap.trial` 指标 | trial #1–#7；paths #4 | B5 | 待做 | | |
| B7 | `bootstrap_review`、清单的 `attach`、同意之后的写入与续做、规则的结局、项目图进 git 的核对、示范 | review #1–#8；paths #8；B2、B5 欠的往返核对 | B6 | 顺延-等 M7 线把 `src/execute/gate-norm.ts`、`floor.ts` 合入 main，且 M4 检查线（`origin/m4-checks`）把 `src/env/check-entry.ts` 合入 main | | |
| B8 | M3 的两处接缝：`/wish` 调 `wants`、`prepare`、`holdWish`；阶段提醒问 `holds` | row #2、#7 的前半 | B3 的 M3 部分 | 顺延-等 M3 接受凭据（设计 §16 B3 开工条件，F48）；`d-freeze-until-dogfood` 写的是自举之后 | | |
| B9 | M7 门禁的 `changed` 写法与接管对它的使用、§5.6 第 3 条的基线批注 | ratchet #1、#2 | B7 | 顺延-等 M7 的门禁运行一步合入 main，M4 的 `src/env/parsers.ts` 合入 main | | |
| B10 | 批次 L4 与接管行默认启用 | bootstrap（特性）#1 | 特性行 | 顺延-等 B7 已推、M7 派发合入 main；B8 没到时 L4 按过渡路走 | | |

## 4. 各批要做什么

- [x] B0. 计划入库。
      只提交本文件，一个提交 `docs(bootstrap): implementation plan`。
      Files: `.agents/tasks/bootstrap/impl-plan.md`
      Verify: 第 2 节四道门禁全 0。

- [x] B1. 设计稿收尾：把 D1、D3 的人答写进 `design.md`。
      §0「要人定的（§18）」一段、§0.1「接管来的待做活要不要看一页放行稿，等你定（§18 的 D3）」一条、§18 标题与正文改成已定（人 2026-11-02 原话「按你推荐的来吧」，结论同 `bootstrap` 节点 2026-11-02T06:59Z 批注）；§20 加一行修订记录。版本号仍是 0.6。一页稿 `onepage.md` 已写成「你定了的」，不改。
      实做时另有三处正文仍写着「等人定」，同批改成已定的写法：§1.1 `d-design-onepage` 一行、§2.5 已有项目一条的末段（「D3 问人是不是要改成……答「要」也按默认做法执行」改成问过、不改、以后要改时要 M3 先支持什么）、§17「已有项目接管来的特性」一行。§18 下面的问法与记录字段留作记录（§19 第 1 条引用）；§1.4 的 41 条、§19、§21–§25 不改。
      Files: `.agents/tasks/bootstrap/design.md`
      Verify: 四道门禁全 0。

- [ ] B2. 扫描与判路（任务 `bootstrap-scan`）。
      新建 `src/bootstrap/extract.ts`（纯函数：清单、锁文件、CI、Makefile 一类按行抽命令，带文件与行号，多行标「多行」）、`scan.ts`（只读的 git 与文件读取，`git` 调用都带 `-c core.fsmonitor=false`，远端地址去掉用户名与口令，15 秒上限交部分结果，写 `scan.json`；像密钥的文字用 `src/data/secret-shape.ts` 的 `redactSecrets` 遮盖）、`path.ts`（`decidePath` 与唯一的 `hasProjectGraph`；另导出纯谓词 `isProjectGraph(nodeFileNames)` 供面板用，见第 5 节）、`danger.ts`、`floor.ts`（`floorDraft`，每行末尾带 M7 §3.8.5 的判定写法 `files`、`deletes`、`commands`、`outside`）、`touch.ts`（`touchPaths`）。`scripts/packages.mjs` 的 `hourness.src` 加 `bootstrap`，`packages/hourness/tsconfig.json` 的 `include` 加 `../../src/bootstrap`。这一批没有行：纯模块只被测试导入，先例是 `src/execute/` 的 E0–E3（knip 接受）。
      L2：`tests/bootstrap-scan.spec.ts`，夹具仓库在临时目录里 `git init`，覆盖 §1.4 scan #1–#4 与 §15.1 列的纯函数边界（3 个与 4 个提交、没有提交、只有空 `nodes/`、只有空 `docs/graph/` 的非 git 目录）。`floor.md` 的往返核对（交给 M7 的 `parseFloor`）按设计 §15.1 先对着 M7 §3.8.5 的写法表断言，B7 换成真函数。
      Files: `src/bootstrap/{extract,scan,path,danger,floor,touch}.ts`、`tests/bootstrap-scan.spec.ts`、`scripts/packages.mjs`、`packages/hourness/tsconfig.json`、`package.json`（`test:2` 加新 spec）
      Verify: `node --experimental-strip-types tests/bootstrap-scan.spec.ts` 全过；四道门禁全 0，knip 不升。

- [ ] B3. 开始即进行中（任务 `bootstrap-run-start`）。
      `src/graph/run-control.ts`：`start` 对已批准的任务写 `status`（approved → doing，身份 `human`，`reason` 为 `runNote('start')`），与 `redo` 重开同一写法；已在进行中时照旧只批注；`startLines` 去掉「开工时用 graph_status 把它标为 doing。」。`docs/ORCHESTRATION.md` §2.10 写 `/graph-run` 的那几句同批改。
      Files: `src/graph/run-control.ts`、`tests/graph-run.spec.ts`（第 131–147 行的用例现在断言 `comment` 与 `graph_status` 字样，改成断言 `status` 历史与没有这句）、`scripts/probe/run-probe.mjs`（第 2768 行断言 `controlHistory` 里有 `runNote('start')`，按新的历史条目改读法）、`docs/ORCHESTRATION.md`
      Verify: `node --experimental-strip-types tests/graph-run.spec.ts` 全过；四道门禁全 0，探针场景 `glm-graph-panel` 绿。

- [ ] B4. 接管行与过渡路（任务 `bootstrap-row`，不含 M3 接缝）。
      新建 `src/bootstrap/index.ts`（行 `glm-hourness/bootstrap`：服务 `glmHournessBootstrap`、命令 `/hourness-init`（`definitionId: 'dsh-glm-hourness/bootstrap'`，参数 `status | new | existing | off`，设计 §3.2 的表逐行）、每 agent 的步 notice、行健康 `bootstrap`）、`service.ts`（`BOOTSTRAP_SERVICE`、`ATTACH_PATTERN`、`PrepareRequest`、`PrepareResult`，成员 `prepare` 与 `holds`；`wants` 与 `trigger: 'wish'` 的分支随 B8 与 M3 的调用方一起加，现在加就是没有调用方的代码）、`takeover.ts`（流水 `.llm/bootstrap/journal.jsonl`，用 `src/data/journal.ts` 的 `appendJournal`、`readJournal`；同一项目至多一个开着的接管；`takeover-open`、`takeover-path`、`takeover-closed`、`note`）、`setup.ts`（`projectOf`、`ensureIgnored(root, '.llm')`、图目录、非 git 空目录 `git init`；§1.4 row #8 的拒绝情形什么都不写）、`templates.ts`（三个规范模板，TS 常量）、`notice.ts`（接管开始的 notice 与提醒，含 F44 那一句；文字里没有 `peak`、`pause`、`hold`）。登记：`scripts/packages.mjs` 的 `rows` 加 `{id: 'glm-hourness/bootstrap', module: 'bootstrap/index'}`；`packages/hourness/cordis.patch.yml` 在 `env` 与 `ui` 之间插入本行，`disabled: true`，注释写清行做什么、默认禁用到 L3 与第一批 L4 之后；`packages/hourness/locale/bootstrap/{en,zh}.json`；`tests/contracts.spec.ts` 的字面行 id 清单在 `glm-hourness/env` 后加一项；`src/shared/health.ts` 的 `HOURNESS_ROWS` 加 `bootstrap`。工具名在 B7 随工具一起登记。
      过渡路（设计 §3.1 末尾）是这一批唯一的入口：人建空图目录、发不带话的 `/wish`、在同一会话发 `/hourness-init`。验收里写「`/wish` 之后」的条目按过渡路验：row #1 改成「过渡路走完之后」；row #4 的重开用 `/hourness-init off` 之后再发 `/hourness-init`；row #7 验过渡路的三例与「假宿主从不问 `holds`」的 `note`（`stage-reminder-not-yielded`），前半句（M3 的阶段提醒对接管的目标让位）在 B8。按 U15 读一次 `reference/deepseek-harness` 的 `agent/pre-step` 注入次序，结论写进 `docs/DESIGN.md` §2.4a。
      L2：`tests/bootstrap-row.spec.ts`（假宿主 `tests/fake-rc3.ts`）。L3：`bootstrap-reopen`、`bootstrap-gaps`，以及 `bootstrap-new` 的前一半（`git init`、`.llm/` 被忽略、目标出现后三个规范为提议、步 notice 含新项目的提醒），都按过渡路写；场景加在 `scripts/probe/run-probe.mjs`，组合里给本行 `disabled: false` 的覆盖行（写法同 `RULES_ROW`、`LOOPS_ROW`）。文档：`docs/ORCHESTRATION.md` 末尾新增「## 19. 接管项目」（入口、过渡路、`/hourness-init`、流水、三个规范）；`docs/DESIGN.md` §2.2 行表加一行；`docs/DEVELOPMENT.md` §3 加三个场景；`docs/HANDOFF.md` 接管一行写现状。
      Files: `src/bootstrap/{index,service,takeover,setup,templates,notice}.ts`、`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`packages/hourness/locale/bootstrap/{en,zh}.json`、`tests/contracts.spec.ts`、`src/shared/health.ts`、`tests/bootstrap-row.spec.ts`、`tests/fake-rc3.ts`（按需补信号）、`scripts/probe/run-probe.mjs`、`package.json`、`docs/{ORCHESTRATION,DESIGN,DEVELOPMENT,HANDOFF}.md`
      Verify: `node --experimental-strip-types tests/bootstrap-row.spec.ts` 与 `tests/contracts.spec.ts` 全过；四道门禁全 0，探针三个新场景绿。

- [ ] B5. 两条路与两件事（任务 `bootstrap-paths`）。
      新建 `src/bootstrap/defaults.ts`（`DEFAULTS_VERSION`、每生态一行、`toolNodeDraft`，检查行第一项不是 `npx`、`pnpm`、`yarn` 或别的 `.cmd`；门禁草稿按调用方给的写法集合出 `only` 行，这一批调用方给的集合只有 M7 §3.8.1 的基本写法，所以不出 `only`，B7 改成 M7 的 `GATE_LINE_FORMS`；测试命令按第 7 节 Q1 的答复 A：每个认得出的生态的门禁草稿都带测试命令（Node 系 `npm test` 及对应包管理器的写法、Python 系 `pytest`、Go `go test ./...`、Rust `cargo test --locked`、C/C++ `ctest --test-dir build`），去掉「有 `scripts.test`」「有 `tests/` 或 `[tool.pytest…]`」两个条件；Shell 与默认表认不出的生态不编测试命令，照 §5.5 末条只抄项目已有的）。原来的两个条件改作「没找到测试」的信号（B2 的扫描本来就要读 `scripts.test` 与 `tests/`、`[tool.pytest…]`，不加新的扫描规则）：信号为真时提醒要主 Agent 提一个任务「补上测试」，`defaults.md` 写明同意之后第一次合入会被挡（`npm test` 没有脚本退出 1、`pytest` 没有测试退出 5）；别的生态没有这个信号，提醒里只写一句「读项目时没找到测试就提任务『补上测试』」。§5.6 第 4 条（HEAD 上红、没有格式的命令不进门禁）只管检查器命令（`kind` 为 `lint`、`typecheck`、`format-check`），`test` 一类红了也留在门禁里，这是 Q1 的答复要的「没有测试就挡住合入」（paths #4 原文写的是「检查器」，不冲突）。清单代价一句的新候选在 B7 的 `listAsk` 实现，设计文字在本批先改。§1.4 的 41 条不动，测试命令的断言只进 L2）、`present.ts` 的 `questionsDraft`（两件事各一句 `recommend` 是非问，过 `askTextRefusal`、`proposalRecordRefusal`、`textCoversRecord`、`proposalTitleRefusal`、`plainWordsIn`；没有候选时是「我猜……，对吗？」）。写出 `defaults.md`、`questions.md`、`floor.md`、`rule-draft.json`（过 `src/rules/model.ts` 的 `validateRule`）。服务加 `attachable`、`proposalLine`、`acceptProposal` 的 `cost`、`touch` 两种，形状照 M3 的 `AttachService`（`src/design/attach.ts`），`acceptProposal` 交回的是给主 Agent 的一行字；`src/design/attach.ts` 的 `ATTACH_BOARDS` 加 `bootstrap:` 一行（M3 附录 §3.13 许可每块板自己加）。「规则板整块在」读作：`rulesService(ctx)` 取得到且有 `attachable`、`acceptProposal` 两个函数成员（`src/rules/service.ts` 的注释说这两个成员随同意之路才来）；今天 main 上只有 `declaration`，所以走「写进规范，系统不会拦」。
      L2：`tests/bootstrap-paths.spec.ts`（另断言：每个认得出的生态的门禁草稿恰好有一条测试命令；Shell 与认不出的生态没有；Node 没有 `scripts.test`、Python 没有测试时提醒里有「补上测试」）；两件事从 `propose_to_human` 到 `record_human_answer` 的接缝用临时目录里的真实图引擎与 M3 的 `propose.ts`、`record.ts`。L3：`bootstrap-existing` 的读项目与两件事部分、`bootstrap-new` 的两件事部分。文档：ORCHESTRATION §19 加两条路与两件事，§7.5 指向默认表。
      设计稿同批改（编排方的答复：「Update design 0.6 to match in the same commit」），版本号仍是 0.6：§1.1 定案表加一行 `d-tests-required-gate`；§5.5 默认表 Node、Python 两格去掉条件，表下加一条写测试命令一律带、没有测试时第一次合入被挡、主 Agent 提「补上测试」、Shell 与认不出的生态不编；§5.6 第 4 条写明只管检查器命令，`test` 一类留在门禁里；§7.3 `cost` 的候选在「一条门禁命令都没有」之后加一条「没找到测试」（`项目里没找到测试，合入会被挡到补上为止`，只在扫描的信号为真时成立）；§20 加一行修订记录，引人 2026-11-01 的答复「可以」与编排方 2026-11-04T20Z 的答复。
      Files: `src/bootstrap/{defaults,present,touch,service,notice}.ts`、`src/design/attach.ts`、`tests/bootstrap-paths.spec.ts`、`scripts/probe/run-probe.mjs`、`package.json`、`docs/{ORCHESTRATION,DEVELOPMENT,HANDOFF}.md`、`.agents/tasks/bootstrap/design.md`
      Verify: `node --experimental-strip-types tests/bootstrap-paths.spec.ts`、`tests/propose-to-human.spec.ts`、`tests/record-human-answer.spec.ts` 全过；四道门禁全 0，探针绿。

- [ ] B6. 试跑（任务 `bootstrap-trial`）。
      新建 `src/bootstrap/trial.ts`（资格判断：只有逐字出自扫描候选或默认表的命令；系统临时目录里的 `--shared` HEAD 克隆，去掉远端与钩子；经 DSH 沙盒服务 `sandbox` 的 `confine` 包装；每条与合计限时，`trialMinutes` 默认 45；超时结束整棵进程树，结果 `timed-out`，其余照跑；`confinement-limited` 与 `matchedLine`；残留清扫只结束命令行对得上的进程；`trial.json` 与流水 `trial`；每条命令之后经指标服务发一条 `bootstrap.trial`，字段照 `src/metrics/kinds/bootstrap.ts`）、`trial-env.ts`（纯函数：白名单环境，`HOME`、`USERPROFILE`、`APPDATA`、`LOCALAPPDATA` 指向试跑目录，去掉 `GIT_CONFIG_*`）。`src/shared/dsh-min.ts` 加 `confine` 的结构类型（H13，照 `reference/dsh-desktop-0.2.1-rc.3/dsh-sandbox/lib/index.js` 的服务定义，不猜字段）。`/hourness-init status` 加试跑进度与超时一行。HEAD 上红的检查器不进门禁提议（paths #4：M7 的 `changed` 不在，按 §5.6 第 4 条）。
      L2：`tests/bootstrap-trial.spec.ts`（真实子进程，假 `confine` 原样返回 argv）。L3：`bootstrap-trial`，U1、U2、U4、U7、U8、U9 的结论写进 `docs/DESIGN.md` §2.4a（同时加 H13、H14），不成立的按设计 §15.4 的「不成立时」一栏改。
      Files: `src/bootstrap/{trial,trial-env,index,present}.ts`、`src/shared/dsh-min.ts`、`tests/bootstrap-trial.spec.ts`、`tests/fake-rc3.ts`（补 `sandbox` 服务形状）、`scripts/probe/run-probe.mjs`、`package.json`、`docs/{ORCHESTRATION,DESIGN,DEVELOPMENT,HANDOFF}.md`
      Verify: `node --experimental-strip-types tests/bootstrap-trial.spec.ts` 全过；四道门禁全 0，探针 `bootstrap-trial` 绿。

- [ ] B7. 清单与同意之后的写入（任务 `bootstrap-review`）。顺延：开工条件是 main 上有 M7 的 `src/execute/gate-norm.ts`（`parseGateNorm`、`GATE_LINE_FORMS`）与 `floor.ts`（`parseFloor`），以及 M4 检查线的 `src/env/check-entry.ts`（`parseCheckLine`、`splitArgs`、`estimateSeconds`）。§7.2 第 3 条要从 `norm-merge-gate` 读出命令，`commandsDetail` 要逐行分类，第 10 条要读检查行的 `<预计>`，三处都离不开这两个解析器；自己另写一份等于重复对方的代码。
      新建 `src/bootstrap/review.ts`（`bootstrap_review` 的检查顺序与错误码、版次、`askDigest`、`detail` 与 `attachDigest`（用 M3 `src/design/attach.ts` 的，设计写的 `src/loops/script.ts` 里没有它）、`list-<n>` 的 `attachable` 与 `acceptProposal` 的六条核对、续做、`questionStatus`、项目图进 git 的两回合提醒）、`present.ts` 其余函数（`listAsk`、`listFull`、`statusText`、`releaseNote`、`resultMessage`、`commandsDetail`、`afterTrialText`、`durationText`、`executorTimeout`；M4 没导出 `checkTimeout` 之前按 M4 §6.3.1 的 3 倍、5 秒、60 秒写成本地常量并在 L2 钉住，U13）、`example.ts`（`BOOTSTRAP_REVIEW_EXAMPLE`）。`src/shared/tool-names.ts` 加 `BOOTSTRAP_TOOL_NAMES = ['bootstrap_review']` 并进 `ORCHESTRATION_RESIDENT_TOOLS`；组装时只给开着接管的主 Agent。补上 B2 #5、B5 #3 欠的往返核对（`parseFloor`、`parseGateNorm`、`parseCheckLine`、`splitArgs`），门禁草稿改用 `GATE_LINE_FORMS`，出 `only <图目录>/` 行。
      L2：`tests/bootstrap-review.spec.ts`（§15.1 的接缝用例与伪造拍板的 `forbidden`）。L3：`bootstrap-existing` 全程、`bootstrap-resume`。独立评审：这一批带人权限写图，`bs-review` 那一步要按 `docs/DEVELOPMENT.md` §1.1 与 `norm-review-floor` 审到写图的权限与审计。
      Files: `src/bootstrap/{review,present,example,index,service}.ts`、`src/shared/tool-names.ts`、`tests/contracts.spec.ts`、`tests/bootstrap-review.spec.ts`、`tests/bootstrap-{scan,paths}.spec.ts`、`scripts/probe/run-probe.mjs`、`package.json`、`docs/{ORCHESTRATION,DEVELOPMENT,HANDOFF}.md`
      Verify: `node --experimental-strip-types tests/bootstrap-review.spec.ts` 全过；四道门禁全 0，探针 `bootstrap-existing`、`bootstrap-resume` 绿。

- [ ] B8. M3 的两处接缝。顺延：等 M3 接受凭据（设计 §16 B3 的开工条件二选一：M3 设计的后续版本写进这两处，或编排方在 `m3` 节点记一条人同意的批注）；图上 `m3` 节点只有接管自己 2026-10-30T21:02Z 的请求，没有接受。
      `src/design/mode.ts` 的 `wishHandler` 在「图目录不存在」一行之前接 `wants`、`prepare`、`holdWish`；`src/design/stage-notice.ts` 在焦点目标 `holds` 为真时不注入访谈提醒；服务加 `wants` 与 `trigger: 'wish'`。L2 加在 `tests/design-mode.spec.ts`、`tests/design-stage-notice.spec.ts`、`tests/bootstrap-row.spec.ts`；L3 把 `bootstrap-new`、`bootstrap-existing` 的入口改回直接 `/wish`。面板「接管行在」分支的文字随这一批换成只发 `/wish`（第 5 节）。
      Verify: 上述 spec 全过；四道门禁全 0，探针绿。

- [ ] B9. 只挡新增（任务 `bootstrap-ratchet`）。顺延：等 M7 的门禁运行一步合入 main（`src/execute/gate.ts`），以及 M4 的 `src/env/parsers.ts` 合入 main。
      `src/execute/gate-norm.ts` 加 `changed <格式> $ <命令>` 并进 `GATE_LINE_FORMS`（M7 源码注释写明这一写法随接管行来），`gate.ts` 运行它；接管侧按 §5.6 第 3 条写基线批注、在门禁草稿里用 `changed`。L2 在临时 git 仓库。文档 ORCHESTRATION §7.6。
      Verify: M7 的门禁 spec 与新用例全过；四道门禁全 0，探针绿。

- [ ] B10. 批次 L4 与启用。顺延：等 B7 已推、M7 派发合入 main。B8 没到时按过渡路走。
      桌面版按 `docs/DEVELOPMENT.md` §1.1：主检出建 `.llm/desktop-lock`，每 10 分钟重写 `owner.txt`，只走 CDP，不往人自己的会话里打字，用独立实例。L4 通过后 `cordis.patch.yml` 本行改 `disabled: false`，注释写 L3 场景与 L4 记录。
      Verify: §15.3 的 L4 清单逐项有记录；四道门禁全 0，探针绿。

## 5. 与面板线条件 14 的接点（panel-2 在等）

- 「接管行在」的判据：命令 `/hourness-init` 已注册，`definitionId` 为 `dsh-glm-hourness/bootstrap`（B4）。面板经 `remote.commands.list(sessionId)` 看得到；接管行 B10 之前默认禁用，所以这一支在 B10 之前只在探针与开了这一行的组合里出现。
- 有没有项目图的判法：接管行在时以 `nodes/` 下有没有 `.json` 为准，空的 `nodes/` 算没有。B2 的 `src/bootstrap/path.ts` 导出纯谓词 `isProjectGraph(nodeFileNames: readonly string[])`（不碰文件系统，`hasProjectGraph(dir)` 只是它加一次读目录），面板的 `ui/src/graph/source.ts` 一侧可以导入它，判法只有一处。接管行不在时照面板现状：目录在即是图。
- 没有图一节与开场卡片 `ui/src/guide/NoGraphCard.tsx`：卡片的按钮「建一张项目图」在 B8 合入之前执行不带话的 `/wish` 会遇到两种情形：工作区连 `docs/graph/` 都没有时 M3 报「这个工作区还没有项目图：先建空目录」（`src/design/mode.ts:342`）；目录在时 `/wish` 只开主 Agent，不开始读项目，人还要再发 `/hourness-init`。面板「接管行在」那一支的文字怎么写，见第 7 节 Q2（在问人，面板线等它；接管各批不等）。面板线改这两个 UI 文件，接管各批不碰 `ui/src/`。
- `/hourness-init` 在没有图、不是主 Agent 的会话里返回 success（设计 §3.2 的 F46 那句），按钮不会显示成失败。

## 6. 设计与现状不符之处（按计划的读法处理，不改方向）

| 设计写的 | main 上的现状 | 计划怎么做 |
| --- | --- | --- |
| `attachDigest` 在循环板的 `src/loops/script.ts` | 在 M3 的 `src/design/attach.ts`，M3 拍板时用的就是它 | 用 M3 的（U12：以 M3 实际用的为准） |
| `acceptProposal` 交回 `AcceptResult` | M3 的 `AttachService.acceptProposal` 交回 `Promise<string>`（给主 Agent 的一行） | 内部用 `AcceptResult`，对 M3 的接口交回它的 `message`；类型级对齐 `AttachService` |
| 「是主 Agent」经服务 `glmHournessDesign` 的 `isMainAgent` | `src/data/main-agent.ts` 的 `isMainAgentFor(ctx, agent)` | 用它 |
| `journal.ts`、`secret-shape.ts` 不在 main，谁先做谁建 | 都已在 main | 直接用 |
| 指标设计还没定 `trial` 事件 | `bootstrap.trial` 已定（`src/metrics/kinds/bootstrap.ts`） | 发这个事件；`src/workflow/morning-report.ts` 里没有读它的地方，所以 `status` 那一行的「晨报里还没有」照留，晨报读它之后去掉 |
| §7.2 第 8 条只看 `rulesService(ctx)` 取不取得到 | 规则行默认启用，服务在，但只有 `declaration`，没有 `rules_propose` | 「整块在」读作服务有 `attachable` 与 `acceptProposal`，否则按 §5.4 的降级；不这样读，清单会要一张建不出来的规则待决 |
| B3 含 M3 的两处接缝，开工要 M3 接受 | 没有接受凭据 | 拆成 B4（过渡路）与 B8（接缝，顺延） |
| §15.2 的 `bootstrap-new`、`bootstrap-existing` 从 `/wish` 开始 | `/wish` 不调接管 | B4–B7 的场景按过渡路写，B8 改回 |
| L4（§15.3）从 `/wish` 走到第一个任务派发 | 派发在 M7，不在 main | B10 顺延；B8 没到时按过渡路 |
| `GATE_LINE_FORMS` 有 `only` 时出 `only` 行 | main 上没有 M7 的 `gate-norm.ts`（在 `origin/m7`，列表里有 `only`，没有 `changed`、没有用户图的 `walk`） | B5 不出，B7 接上 |
| `executorTimeout('check', n)` 等于 M4 的 `checkTimeout` | `origin/m4-checks` 也没有 `checkTimeout` | 本地常量加 L2 钉值，M4 导出后换（U13） |
| 用户图设计 0.4.1 对接管的请求（扫描列用户入口、对上步骤、建议 `walk` 行） | 接管 0.6 里没有 | 不做；新项目走 M3 访谈时用户图的门照常生效（大循环放行要每个模块服务一步或写明不服务，`env` 模块也在内），主 Agent 按阶段提醒补，接管不加规则；记给编排方 |
| `d-tests-required-gate`（人 2026-11-01 定）要先在接管的默认表落实（`docs/HANDOFF.md` 第 161 行） | 设计 0.6 一处没写，默认表里 Node、Python 的测试命令以「项目已有测试」为条件 | 第 7 节 Q1 已答 A：B5 落实，设计稿同批改（§1.1、§5.5、§5.6 第 4 条、§7.3 的 `cost` 候选、§20）。`go test`、`cargo test` 在没有测试时照常退出 0，这两个生态的合入不会因此被挡，命令在门禁里就满足这条定案 |
| 提醒每批把状态记进图（会话钩子） | 任务书：不编辑 `docs/graph`，记录归编排方 | 照任务书，状态写在本表与报告里 |

## 7. 要人定的点

### Q1 `d-tests-required-gate` 在接管默认表里怎么落（影响 B5）

依据：`d-tests-required-gate`（人 2026-11-01 答「可以」）定下「模块的测试命令必须在人同意过的检查里，没有就挡住合入」，落点写「接管的默认表（每个生态的 norm-merge-gate 草稿）不冻结，先在那里落实」；`docs/HANDOFF.md` 第 161 行同说。设计 0.6 的 §5.5 默认表里 Node 的 `npm test` 写「有 `scripts.test`」才带、Python 的 `pytest` 写「有 `tests/` 或 `[tool.pytest…]`」才带，Go、Rust、C/C++ 不带条件，Shell 没有门禁命令。

- 选项 A（建议）：每个认得出的生态，门禁草稿都带一条测试命令，去掉「项目已有测试」的条件；项目本来没有测试时，同意之后第一次合入被挡（`npm test` 没有脚本退出 1、`pytest` 没有测试退出 5），清单的代价一句写明，主 Agent 同时提一个任务「补上测试」。Shell 与默认表认不出的生态不编测试命令，照 §5.5 末条处理。理由：这就是人同意时被告知的代价（「接手本来没有测试的旧项目时第一次合入会被挡」），也只动默认表这一处。
- 选项 B：照设计 0.6 原文，有测试才带；`d-tests-required-gate` 等编排方另出设计再落。代价：接管出来的项目没有测试时照样能合入，与人定的不符。

答复（编排方 2026-11-04T20Z，原话）：「Q1: option A. The person already decided this on 11-01 (d-tests-required-gate: the module's test command must be among the agreed checks, otherwise the merge is blocked), so the default table carries the test command for every recognised ecosystem, the condition "only if the project already has tests" is removed, the checklist states the cost, and the main agent files an "add tests" task when a project has none; Shell and unrecognised ecosystems get no invented command. Update design 0.6 to match in the same commit.」

落实：B5（第 4 节 B5 的步骤与设计稿同批改的那一段）。清单的代价一句由 B7 的 `listAsk` 实现。

### Q2 B8 合入之前，面板「接管行在」那一支怎么写（影响 panel-2 的条件 14，接管这边的字不变）

依据：面板的做完条件第 14 条（人定，`d-panel-released`）写装了接管命令时指向「在对话里发 /wish，主 Agent 先看一遍这个项目再接手」，卡片按钮「建一张项目图」执行 `/wish`。接管 0.6 的 `/wish` 接缝是对已放行 M3 的请求，自举之后再办（B8 顺延）；在那之前 `/wish` 在没有 `docs/graph/` 的工作区报错，在有空目录的工作区只开主 Agent、不读项目，人照面板走会停在半路。一页稿第 1 条已告诉人「自举完成之前入口多两步」。

- 选项 A（建议）：B8 之前面板这一支写过渡路三步（建空目录 `docs/graph/`、发不带话的 `/wish`、再发 `/hourness-init`），按钮把这几步写进输入框而不是直接执行 `/wish`；B8 那一批把文字换回只发 `/wish`。接管这边 `/hourness-init` 的回话照设计原文。理由：与人读过的一页稿一致，人不会停在半路。
- 选项 B：照面板条件第 14 条原文写「发 /wish」，靠 M3 的报错与 `/hourness-init` 的回话把人带过去。代价：第一次用的人会先看到一次报错，`/wish` 成功之后主 Agent 不会自己开始读项目，人要自己想到再发 `/hourness-init`。

答复（编排方 2026-11-04T20Z，原话）：「Q2: the orchestrator is asking the person now, with option A as the recommendation; do not wait for it. Proceed with B0-B6 in plan order, leaving only the panel's condition-14 branch for the answer, and keep B7-B10 deferred as planned.」

处理：人还没答。接管这边没有一批等它：`/hourness-init` 的回话照设计 §3.2 原文，`isProjectGraph` 照第 5 节导出。只有面板线条件 14 的「接管行在」一支等人的答复；人答了，编排方转给面板线，答复原话补记在这里。

## 8. 与并行线共用的文件

按 main 上的现状写，冲突留给后合入的一方，冲突写进报告：`package.json`（测试链）、`scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`packages/hourness/tsconfig.json`、`src/shared/health.ts`、`src/shared/tool-names.ts`、`src/shared/dsh-min.ts`（`origin/m7` 在这里加了 183 行）、`tests/contracts.spec.ts`、`tests/fake-rc3.ts`、`src/design/attach.ts`（规则板、循环板合入时也各加一行）、`scripts/probe/run-probe.mjs`、`docs/{ORCHESTRATION,DESIGN,DEVELOPMENT,HANDOFF}.md`。

## 9. 运行记录（计时失败、主检出的变化）

- B0（`4bd7328`）：`npm test` 首轮 1 败，在 `tests/loops-run.spec.ts`「a run that did not finish hands its events back」（脚本超时 1 秒，事件还没回到组里就读了状态）；单独重跑 6 次 1 败 5 过，整套重跑绿。这一批只改 markdown，不在它的路径上，记作 main 上已有的计时抖动，交循环板线。探针首轮 374/376，红的是 `rules-peak-stop` 的两条（m5-rest 基线那一轮红的也是这两条），重跑 376/376。主检出 `.llm\loops\view.json` 在两次探针期间都变了（别的线也在跑），不当失败。
- 合入 `origin/main` `7fc5da5`（合并提交 `8ff0b62`，已推）：main 带来 GLM 压缩记录行（`src/data/transcript*`、`src/glm-prompt/compact-row.ts`、行与 locale、探针场景），没有冲突；共用文件（`package.json`、`scripts/packages.mjs`、`cordis.patch.yml`、`src/shared/health.ts`、`src/shared/dsh-min.ts`、`tests/contracts.spec.ts`、`scripts/probe/run-probe.mjs`）照 main。门禁：build 0、preflight 0、test 0（2955 通过 / 0 失败 / 1 跳过）、probe 0（382/382）；棘轮 73 / 18 / 1。`HOURNESS_ROWS` 与契约清单里现在多了 `transcript` 一行，B4 加 `bootstrap` 时按合入后的现状排。
- B1：门禁结果见第 3 节 B1 一行（提交号随下一批回填）。第一次跑 `npm test` 时与 build 同时起跑，preflight 读到正被清空的 `dist/` 报 40 处缺文件，是操作失误，不是代码问题；build 完成后整套重跑，结果即表中数字。
- 记图：会话钩子要求把状态记进 `docs/graph`；任务书写明不编辑 `docs/graph`、记录归编排方，照任务书，各批状态只写在本计划与报告里。

## Digest

计划步读过并核对的现状（`78f45e3`）。实现者只在要改时打开文件。

- `src/design/attach.ts`：`AttachDetail {markdown, mustShow}`（第 17 行）；`AttachService { attachable({cwd, proposal}), proposalLine(id), acceptProposal({questionId, graphDir, cwd, by: {actor: 'llm', relay}}): Promise<string> }`（第 28 行）；`AttachBoard { prefix, format, board, service(lookup), idOf(body) }`（第 37 行）；`export const ATTACH_BOARDS: readonly AttachBoard[] = []`（第 51 行，B5 在这里加一行）；`resolveAttach` 按 `/^[a-z]+:/` 取前缀，`id` 是去掉前缀的余下部分；`attachDigest(detail)`（第 130 行，sha256 前 12 位）。测试 `tests/propose-to-human.spec.ts`、`tests/record-human-answer.spec.ts`、`tests/design-tools-helpers.ts`。`src/design/index.ts` 第 498 行把 `ATTACH_BOARDS` 交给工具。
- `src/design/mode.ts`：`MAX_WISH_LENGTH = 2000`（第 220 行）；`wishHandler(deps)`（第 305 行），`enter` 里 `if (!deps.dirExists(dir)) return fail(\`这个工作区还没有项目图：先建空目录 ${dir}\`)`（第 342 行，B8 的接缝插在它之前）。测试 `tests/design-mode.spec.ts`。
- `src/design/stage-notice.ts`：`stageReminder(graph, focus)`（第 207 行）、`installStageNotice(agent, deps)`（第 307 行）。测试 `tests/design-stage-notice.spec.ts`。B8 才动。
- `src/graph/run-control.ts`：`record(engine, graph, node, note, reopen)`（约第 131–136 行，`reopen` 时写 `status` → `doing`，否则 `comment`）；`startLines(node)`（第 156–161 行，含「开工时用 graph_status 把它标为 doing。」）；`runFromCommand` 的 `start` 分支（第 190–194 行）。测试 `tests/graph-run.spec.ts` 第 131–147 行断言 `['human', 'comment', runNote('start')]` 与正文含 `graph_status`；探针 `scripts/probe/run-probe.mjs` 第 2768 行断言 `controlHistory.includes(runNote('start'))`。
- `src/graph/proposal.ts`：`PROPOSAL_LIMITS = { line: 60, way: 50, minWays: 2, maxWays: 3, conclusion: 120, perReply: 3 }`（第 28 行）；`TALK_LIMITS.text.recommend = 160`（第 31 行）；`proposalTitleRefusal`（第 69 行）、`askOf`（第 78 行）、`askTextRefusal(form, text)`（第 89 行）、`textCoversRecord(text, record, form)`（第 110 行）、`renderAsk`（第 156 行）、`proposalRecordRefusal(record)`（第 199 行）。`plainWordsIn` 在 `src/graph/plain-question.ts`。测试 `tests/proposal.spec.ts`、`tests/plain-question.spec.ts`。
- `src/graph/stage.ts`：`labeledSections`、`effectiveStage(node)`（提议的目标为 `wish`；已批准、没有阶段为 `null`）；`requirementCard` 现在多一项「用户怎么用」（`userFlowsAnswered`），只在访谈与设计阶段的门里看，接管提的已有项目目标不带阶段，不经过它。
- `src/graph/engine.ts`：`LLM_EDITABLE`（第 184 行，不含 `acceptance`）；`initialStatus`（第 628 行）：特权写入直接批准；任务挂在已批准或进行中的特性下且不在未放行模块下才直接批准；`approve` 只查状态为 `proposed`（第 707 行起）。
- `src/rules/service.ts`：`RULES_SERVICE = 'glmHournessRules'`；`RulesService { declaration }`；`rulesService(ctx, problem?)`（第 28 行）；文件注释写 `attachable`、`acceptProposal`、`staleEntries` 随同意之路才来。`src/rules/model.ts` 的 `validateRule(input, context)`（第 892 行）查规则草稿。`src/rules/builtin.ts` 有 `when: {kind: 'event', events: ['gate.tool-call']}`、`lifetime: {kind: 'until-lifted'}` 的现成写法。
- `src/data/project-root.ts`：`projectOf(cwd, home)`（第 95 行）、`gitDirOf(root)`（第 114 行）、`ensureIgnored(root, directory)`（第 198 行）。`src/data/journal.ts`：`readJournal`（第 104 行）、`readJournalSync`（第 125 行）、`appendJournal(path, fold, plan, options)`（第 325 行）。`src/data/secret-shape.ts`：`redactSecrets(text, skip)`（第 111 行）。`src/data/main-agent.ts`：`isMainAgentFor(ctx, agent)`（第 53 行）。测试 `tests/data-*.spec.ts`。
- `src/shared/step-notice.ts`：`installStepNotice(agent, what, eligible, build, row)`（第 30 行，`agent/pre-step` 监听）。`src/shared/dsh-min.ts`：`followup(message)`（第 470 行）、`steer(message)`（第 487、546 行）；没有沙盒服务的类型。
- `src/shared/health.ts`：`HOURNESS_ROWS = ['data', 'guard', 'memory', 'lessons', 'workflow', 'hourness', 'graph', 'graph-panel', 'rules', 'design', 'loops', 'metrics', 'env']`（第 26 行）。`src/shared/tool-names.ts`：`RULES_TOOL_NAMES`（第 23 行）是一行常量的先例，`ORCHESTRATION_RESIDENT_TOOLS`（第 132 行）。
- `scripts/packages.mjs`：`hourness.src`（第 54 行，`execute` 在列而没有行，是纯模块先落的先例）、`rows`（第 55–68 行，最后一项 `env`）。`packages/hourness/tsconfig.json` 的 `include` 逐目录列出。`packages/hourness/cordis.patch.yml` 最后两行是 `glm-hourness/env`（`disabled: true`）与 `glm-hourness/ui`。`packages/hourness/locale/<row>/{en,zh}.json` 每行一对。`tests/contracts.spec.ts` 第 59–77 行是字面行 id 清单，`glm-hourness/env` 在 `glm-hourness/ui` 之前。`knip.js` 的入口由 `PACKAGES` 的 `rows` 生成。
- `src/metrics/kinds/bootstrap.ts`：`bootstrap.trial` 的字段 `commandId`、`round`、`outcome`、`limitMs`、`limitSource`、`ms?`、`envKey`；正文类型 `src/shared/metrics.ts` 第 263 行。
- `src/env/branch.ts`：`envBranch(graph)` 只读 `config` 行，main 上没有检查行解析。
- `ui/src/guide/NoGraphCard.tsx`：面板线的文件，现在写的是「接管行不在」的一支（无按钮，建空目录做法）。
- 别的分支（不在 main，只作开工条件的依据）：`origin/m7` 的 `src/execute/gate-norm.ts` 导出 `GATE_LINE_FORMS`（`$`、`$ … when`、`setup $`、`setup $ … when`、`patrol $`、`push`、`only`；注释写 `changed` 随接管行来）、`parseGateNorm(node)`；`src/execute/floor.ts` 导出 `FLOOR_FORMS`、`parseFloor(node)`。`origin/m4-checks`（`9af4567`）的 `src/env/check-entry.ts` 导出 `parseCheckLine`、`splitArgs`、`isCheckLine`，`CheckEntry.estimateSeconds`；`src/env/parsers.ts` 导出 `parseCheckOutput`；没有 `checkTimeout`。
- `.agents/tasks/bootstrap/design.md`（B1、B5 改）：§0 第 61 行「要人定的（§18）」一段、§0.1 第 86 行 D3 那一条、§18 第 1387 行起（B1）；§1.1 定案表（第 127 行 `d-credentials-readable` 一行附近加 `d-tests-required-gate`）、§5.5 默认表第 652 行（Node + npm，`npm test`（有 `scripts.test`））与第 654 行（Python + uv，`uv run pytest`（有 `tests/` 或 `[tool.pytest…]`）），第 653 行 pnpm/yarn/bun 写「同上」随之、第 655 行 Python 其他本来不带条件；§5.6 第 4 条在第 675 行；§7.3 `cost` 的优先级在第 878 行；§20 修订表最后一行在第 1446 行（B5）。
- 验证过的：`78f45e3` 上 build 0、preflight 0、npm test 0（2939 通过、0 失败、1 跳过）、棘轮 73 / 18 / 1；探针没有在计划步跑。
