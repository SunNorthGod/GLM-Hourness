# 终审审计(2026-11-13,HEAD 7638cc49)

范围:A 仓库与 git、B 账本对实、C 项目图、D 代码层、E 工作区残渣、F ZCode 侧改进清单。方法:只读;复测只跑 eslint/knip/jscpd 棘轮(`npm run lint`)与逐字门禁(`node scripts/check-verbatim.mjs`),输出留 `.llm/logs/audit-*`。树未动;本文件是本次唯一新增的跟踪文件。

## 结论

**0 阻塞 / 7 应修 / 14 备注。**「实现完毕、可进自举」的声明成立:HANDOFF §10 逐条抽到的提交全部存在且内容相符(7176e503、e04a67c0、febd9bad、50e5e451、2f5cb83c、a58471e8、ebd44a61、69757062、616356fd、d7befd76、211c9c85、89df23de、13e9db75、78d01651、d7a9f953、13f6a196、37b8657e、ab867f47、59b48543、ac6413cf、23acb4d1、1044890d 均实读);b10rr-probe.log 的 18 条 FAIL 与批次 A 归因逐标签吻合;棘轮 73/18/1、逐字 502/0、graph.svg 与节点逐字节一致,均复测证实。应修集中在「行出厂状态翻转后文档没跟上」与「rc.1 升级后流程文档没跟上」两类账实漂移,全是文档与注释,不碰运行时。

---

## A. 仓库与 git

- **双远端同步**。main = origin/main = github/main = 7638cc49(`git rev-list --left-right --count github/main...main` = 0/0)。注意 brief 里说的 HEAD 5de7c061 已被 7638cc49(docs(graph): 本人推迟 bootstrap)盖过,审计以 7638cc49 为准。
- **分支与工作树符合驻留定案**。comms-split(4b39fa66,ahead 2/behind 193)、reval(9e23cff5)、nowait(4ef89f41)三个设计驻留工作树干净;ablation-trial 钉在游离 db2bbc69,其 node_modules junction 确已悬空(`ls .worktrees/ablation-trial/node_modules` 按文件处理),与 HANDOFF §10 第 6 条一致。「改基之后才算合入→删」的定案已执行完:m3-flow、rules-board-page 三变体、四个旧里程碑分支在本地与 origin 都已不存在。无应合未合、应删未删的分支。
- **无残留锁**:`.llm/` 顶层无 desktop-lock / probe-lock / probe-lock-2;`.git` 下无 *.lock。
- **gitignore 健康**:1709 个跟踪文件;`.llm/`、`reference/`、`dist/`、`.worktrees/` 全部未跟踪;`.agents/tasks/**` 白名单只放 .md/.svg,运行产物(graph-ops-*.json、time-context-scan.mjs、zsize.mjs)按设计不可见。
- **dist 新鲜度**:两包 build-info.json = `{version 0.3.1, commit 00f7c42, dirty:true}`,建于 2026-11-12 11:49。HEAD 之后有两个代码提交(ebd44a61 探针测试、69757062 同意接缝)。**内容核过是新的**:69757062 新增的 "pass the JSON object verbatim" 等串都在 `packages/hourness/dist/bootstrap/review.js` 里——修复写于 11:49 build 之前、12:41 才提交,dirty 标记如实反映当时状态。b10rr 探针(12:16)与桌面 flow-1 重跑吃的就是这份含修复的 dist。只有 build-info 的 commit 字段落后,无需重build,下次合入步照 §1.1 会重建。
- **package.json**:两包 0.3.1、engines.dsh 均 `^0.2.2-rc.1`(616356fd 同批改双包,已实读 diff);依赖只有 peer `@deepseek-ai/cosmokit:*`,干净。备注:根工作区 package.json 停在 0.3.0(非 bundle,纯装饰性不同步)。

## B. 账本对实

### HANDOFF §10 逐条抽验(全过)

- 第 1 条 metrics-pricing:①根因与方案在入库的 `.agents/tasks/metrics-pricing/findings.md`(已实读存在);响应式接线实码 `src/metrics/index.ts`(L2 钉 `tests/metrics-row.spec.ts:497`,测名「到达清、离开复说、形状不对保留」与账面逐字对应);② locale `d7a9f953` 存在(execute row locale);③ `13f6a196` 存在;⑤ `37b8657e` 存在(tests/execute-row.spec.ts +26 行,bad_task 先于档位判定的回归钉)。
- 第 2 条 B10:启用提交 `7176e503` 实读——恰好只改 `packages/hourness/cordis.patch.yml`(去 disabled + 重写行注释,引 0cc628a5 探针 579/579 与 b10-probe3.log 557/580);回填 `e04a67c0`、四件返工 `50e5e451`/`2f5cb83c`/`a58471e8`/`ebd44a61`、接缝 `69757062` 全部实读,69757062 同批改了 ORCHESTRATION §19.5 相关段与 tests/bootstrap-review.spec.ts(+112);「同意接缝 L2 钉死」的测名在 spec:497 逐字对上(verbatim 复制过账 / 改写拒 changed 且不关接管)。逐字记录三件(b10-park.md 419 行、b10-followup.md 273 行、l4-2026-11-11.md 139 行)均已入库。空提交事故归档 `.llm/b10-l4/incident-archive/` 有完整 README(时间线、收容步骤、仓外零写入复核);事故里的空提交 `4df09fe` 在本仓不存在——它发生在仓外 ws-node,本仓图与 svg 无恙。
- 第 3 条 ablation:A2 落字在 `src/guard/sections.ts`(注释可见「消融 A2 后…缩成一句删去」,DESIGN §2.3 rules 行同句印证);A3 wire 实现随批次 D(13e9db75)。
- 第 4 条 subdir:`ab867f47` 是合入 merge;缺省关实码核过:`src/glm-prompt/index.ts:91` `Schema.boolean().default(false)`,DESIGN §5.11(906 行)与人定 C 的记录一致。
- 第 5 条 reval/nowait:origin 两支驻留在账;question-40/41 在队列(见 C)。
- 卫生清扫段:17+5 支合并分支与 8 工作树删除已验证(分支表无残留);`ac6413cf`(transcript 出厂启用)、`59b48543`(zcode-drift 证据稿)、`616356fd`(镜像补齐)均实读存在。**例外见应修 6:source-transcript.md 实际被跟踪**。
- 收尾行:`d-no-run-cap` 取代 `d-five-runs` 在图上核到(前者 approved、后者 superseded);`23acb4d1` 存在。
- 待人定各项都是真人决策(reval 五问、nowait 四岔、视频、subdir 缺省、消融注入文字、metrics-pricing ④ read-tree),无「该 agent 定的」混入;但注册缺口见备注 3。

### DEVELOPMENT.md

- §5 纪律十条、§1.1 分级、§3 沙盒规程与现行做法一致(bootstrap 行启用走了「先临时 profile 探针、后翻转」的既定路)。事故表(§7)最后一条 2026-11-06,之后的 rules-peak-stop 查结与 B10 两起桌面事故不在表里(备注 1)。**应修 5:§4 与 §11.3 的 rc.3 基线话术过时**。

### FACTS.md 抽样(6 处,含最新两行)

1. §1 3.17.1 AGENTS.md 行(zcode.cjs 1994/1996/14352–14358/14678):实读——1994 行内含 `function cPs`,1996 行内含 `resolveContextSources`+`function fPs`+`function mPs`,14352 行内含 `function Mxt`。行号与符号全对(minified 长行,符号在行中段)。
2. §1 3.17.1 压缩续接行(Bxt 14380–14389、调用处 14730 传 `{preservedMessagesKept, suppressFollowup: true}` 不传 transcriptPath):实读 14730 行 `Bxt(Oe,{preservedMessagesKept:k.length>0,suppressFollowup:!0}`——逐字吻合。
3. §1 最新两行(3.18.0 漂移、逐字基线复核):证据稿 `.agents/tasks/zcode-drift/findings.md` 在 59b48543 入库核到;「502 项、0 偏差」由本次重跑逐字门禁独立证实(`check-verbatim: OK against reference 3.17.1 (502 verbatim, 0 known deviations, 301 lines checked)`)。
4. §3 agent-instructions 行(引用 agent-instructions/src/index.ts 16–18 等):行存在,内容为导入块,与实读标注相容。
5. §3 ReplaceFileW/Win32 1175 行(引 fs-local/src/win32.ts、fsio.ts):win32.ts 存在,`ReplaceFileW` 在 17/30/54/132 行。
6. §3 pi-ai 声明式 provider 行:证据文件 `.agents/tasks/provider-verify/findings.md` 已在 main 跟踪(见备注 10 的出处措辞问题)。
- 抽样结论:FACTS 的 file:line 引用质量高,无一处虚指。备注 11:两行「应增未增」的事实(同意格式、metrics-pricing)见 F 清单。

### ROADMAP / CHARTER

- 无与 wire-face 契约、bootstrap 行启用、d-no-run-cap 冲突的条款。ROADMAP 借用组件清单的「待核实」项(2、10、11、13、14、15、17)是真实的 L4 欠账。CHARTER §3.2 第 3 条「新插件行默认禁用、验证通过后才启用」与 bootstrap 行的启用路径(先禁用、探针全绿后翻转)不矛盾。

## C. 项目图

- 队列恰好是 question-40(reval 五问)与 question-41(nowait 四岔),均 human decider、raisedBy 指向 approved 的 reval/nowait 特性节点,与 HANDOFF §10 第 5 条一致。agentQueue、proposals 空。
- 280 节点:approved 100 / doing 22 / done 149 / dropped 5 / superseded 4。graph.svg 对当前节点重新出图逐字节一致(revision de48f2426b4c,280 nodes),7638cc49 的 svg 与 d-finish-then-bootstrap 批注同批——svg 新鲜度无问题。
- **备注 2(最大的一处图滞后)**:m7-1、m7-2、m7-4、m7-6…m7-10 八个任务节点停在 approved,最后一条历史停在 2026-11-05 的标题改写;而 M7 E0–E9 已于 2026-11-07 合入 main(HANDOFF §8)。进度事实只活在 HANDOFF,违反 ROADMAP §1「进度只记在项目图上」。m7-3(自动推进)doing 是真欠账(L4)。glm-subdir-instructions 同病:代码已合(ab867f47),节点 approved,欠的只是 L4 后的缺省值决定。orch 的处置则相反方向:节点 stage 已在 331c2950 清掉(见应修 4),节点本体没留一句「已清」的批注。
- 迁移期陈旧名清查:全 docs(不含节点)grep `AssemblePayload.tools`、`tools.restrict`、`rewriteToolFace`、`hide()/expose()`——命中全是否定句(「已删除」「不用」),没有文档仍把迁移前世界当现状。facemigration 批 D 提交实读确认 AssemblePayload.tools 随最后一批删除。
- 备注 6:goal `glm-house`(done)标题仍写「以 ZCode 3.16.3 的训练分布工作」,基线 2026-10-30 已换 3.17.1。

## D. 代码层

### 行清单三方核对(patch / README / 行目录)

- glm 包:patch 5 行(4 宿主 + glm-ui),README 表 5 行,一致;glm-llm 在 patch 与 README 均出厂禁用(有意:通道行是 provider 接管,DESIGN §2.3 glm-login 行写明)。**但 patch 注释的理由过时**(应修 7)。
- hourness 包:patch 17 行,data/guard/memory/lessons/workflow/hourness/graph/graph-panel/rules/design/execute/loops/metrics/env/transcript/bootstrap + ui;`scripts/packages.mjs` 的 14 宿主行 + transcript + bootstrap + client 行与之一致,src 目录齐全。**README 表只有 13 行,缺 execute、metrics、env、bootstrap 四行,且 graph-panel 描述仍是「`/graph-apply`, the panel's write path」——`/graph-apply` 已随面板改只读删除**(应修 1)。
- **DESIGN §2.3 行契约表 21 行,缺 `glm-hourness/metrics`**(全文件 0 次出现该行 id;指标流水在 §94 有节,行表漏行)(应修 2)。**bootstrap 行在该表与 ORCHESTRATION §19 头部/§19.2、§3.1(555 行)仍是「默认禁用、B10 未做」**——行 2026-11-12 出厂启用(7176e503),启用提交与 69757062 都没碰这几处(应修 2、3)。
- bootstrap 行的 patch 注释本身已是启用后写法(「Ships enabled since the takeover enablement (2026-11-11)…」),但 (a) 日期与启用提交 7176e503 的 2026-11-12 不符,(b) 同注释里「Until the design row's /wish calls the takeover (not merged yet, plan B8)」是 B8 合入前的旧话(应修 7)。

### 卫生扫描

- `src/`、`ui/src/`、`scripts/`:TODO/FIXME/XXX/HACK 0 处真标记(命中全是 TodoWrite 工具名);console.log/debug 0 处;无注释掉的旧实现。STAND-IN 替身已按 §4.9 要求换掉(`src/graph/execute-stage.ts:20` 注释声明 STAND-IN block 已除)。
- 棘轮复测:`npm run lint` → eslint 73 压制 / knip 18 / jscpd 1(7 行),与账面持平。压制条目抽样(eslint-suppressions 20 文件、逐文件规则计数;knip-baseline 18 条 = 11 导出 + 7 类型):棘轮机制自身保证条目仍真实——多出的违规与失效的压制都会使门禁失败(ESLint 批量压制退出码 1/2 语义),本次全绿即「73 条都还压着真实的点」的机器证明。
- 测试:`tests/` 无 `.only(`;唯一 `.skip` 是 `tests/execute-git.spec.ts:943` 按 git 版本的条件跳过,合法。两颗 reactive L2 钉子都在且测名与描述一致(metrics-row.spec:497、bootstrap-review.spec:497)。

### b10rr-probe.log 的 18 条 FAIL 对归因

grep 出 20 个 "FAIL" 行,其中 2 行(581、583)是 PASS 行的断言载荷里含 'FAIL' 文件名;真实 FAIL 标签 18 条,分解**恰好**为:

| 类 | 条数 | 标签(log 行号) |
| --- | --- | --- |
| rc.1 headless 尾形 exit-1 簇 | 13 | guard request worker(231)、design release(483)、design modules(492)、exec dispatch GLM ×2(516/528)、exec dispatch 非 GLM ×2(531/543)、exec plan(555)、exec review(564)、exec docs(569)、exec merge(587)、exec merge upstream(594)、exec modules(616) |
| 规则票生命周期 | 3 | rules-peak-wake(354)、rules-handover ×2(358/359) |
| 上游运行时漂移(glm execution) | 2 | Write 覆盖未读文件(103)、Glob 顺序(106) |

face-migration progress.md 批 A 的清单逐标签对上(其「exec dispatch(GLM/non-GLM)」一行对应每场景两条 FAIL,13=1+2+4+6)。**归因没有因后续五个提交过时**:a58471e8 后恰如 b10-park 预告「两条 metrics 红转绿」(562/580);50e5e451/2f5cb83c/69757062 改的面(收尾核对、/wish off、bootstrap_review)在 18 条红里一条都不占;ebd44a61/febd9bad 的检查更新已把 design-row 三条红转绿。rules-peak-stop 那条已结案的抖动(HANDOFF §5)不在本 18 条里,两者是不同的标签集。

## E. 工作区与残渣

- `git status --porcelain` 0 行:无未提交、无未跟踪漏网。b10-park.md、b10-followup.md、l4-2026-11-11.md、impl-plan.md、metrics-pricing/findings.md 全部已入库。
- **应修 6**:`.agents/tasks/docs-at-hand/source-transcript.md`(视频字幕,18 KB)被 git 跟踪(6e2dbeb1「merge: ablation conclusions」2026-11-09 带入),而 HANDOFF §10 卫生清扫段写明「留主检出 `.agents/tasks/docs-at-hand/` 不入库」。账实二选一:`git rm --cached`(留工作副本,加白名单例外)或改 HANDOFF 承认入库。文件已在双远端历史里,删除提交不 rewrite 历史。
- `.llm/park/`:restart-2026-11-11{,b}.md 是重启存档,历史价值,内容与当时事实相符(迁移批 A 起点、镜像欠推——两者均已在后续完成,存档无需更新);`now.patch` 与 `b10-wip-2026-11-11.patch` 各 67 行,是 impl-plan B7/B8/B9 回填的残留 diff,内容已由 e04a67c0 提交,属可删残渣(备注 9)。
- 事故归档 `.llm/b10-l4/incident-archive/`(README + default-workspace)完整,时间线与 HANDOFF §10 第 2 条的叙述一致。

## F. ZCode 侧改进清单(按性价比排序,不动 DSH 桌面、不自举)

1. **同意格式事实入 FACTS**(约一提交)。flash 模型对自由文本问句的转述必然漂移、可复制 JSON 一次过账——这是 b10 两轮桌面跑、约 5.6M token 换来的根因,现在只活在 b10-followup §3 与 69757062 提交说明里。在 FACTS §3 或 ORCHESTRATION §19.5 记一行「问句以可逐字复制的 JSON 交模型,叙述即漂移」(证据:journal seq 164→166、verifyDecision 摘要比对)。性价比最高的原因:成本已付、写下来是零风险保险。
2. **文档对账一批清掉 7 条应修**(约一个下午)。README 行表补 4 行 + graph-panel 描述、DESIGN 行表补 metrics 行 + bootstrap 行启用措辞、ORCHESTRATION §19/§3.1:555/§4.9 的「默认禁用/B10 未做/stage 未清」、DEVELOPMENT §4/§11.3 的 rc.1 话术、两处 patch 注释、source-transcript.md 去留。纯文档与注释,门禁全绿即可。这批不清,下一个人接手还要重走本审计的追查路径。
3. **图节点对实一批**(约半小时)。m7-1/2/4/6/7/8/9/10 与 glm-subdir-instructions 按「L2/L3 已过、L4 待批」推进到 done 或带待 L4 批注;把 HANDOFF §10 的六个待人定里没进队列的四件(视频三件、subdir 缺省、消融注入文字、worker read-tree)落成 question 节点,让 `graph -- open` 恢复为唯一决策队列。
4. **rc.1 headless exit-1 簇(13 条红)收口**(1–2 天,绝对价值最高)。progress.md 批 A 已给出机制假说:主 Agent 末回合后 goal-round-driver 仍排进 `<goal_round>`,headless 收尾弃置该回合,rc.1 退出码取最后 turn/end。ZCode 侧可做两件事:其一,判定「可接受但意外」还是「真错」——对照 rc.3 同场景工件(progress.md 说 pmtRz4 尾形同构、rc.3 无此尾形);其二,若属探针可修,让 runner 在场景末步前解除 goal 预约或收尾前主动结算,13 条红转绿后探针恢复「红即缺陷」的门禁价值——rules-peak-stop 30ms 窗口那类悬案已经证明暧昧红的代价。
5. **glm-execution Glob 顺序(2 条红)**(半天)。核对 3.17.1 pristine 的 Glob 排序语义(mtime 新在前)与 rc.1 宿主的实际行为,要么修别名/断言、要么按 FACTS 规矩记一条上游漂移。顺带处理同族的 Write-over-unread(103 行)。
6. **规则票生命周期 3 条红**(1 天)。rules-peak-wake 与 rules-handover ×2 与已结案的 rules-peak-stop 是不同标签,按 §5 的判据(无唤醒/重复唤醒/文本错/早于恢复/主 Agent 收到)逐条判「真缺陷还是 rc.1 时序」,红的归因补进 HANDOFF §5 同款记录。
7. **rc.1 运行时参考导出与 DEVELOPMENT §4 规则对齐**(半天)。§4 自己规定桌面版升级后重导出 `reference/dsh-desktop-<版本>/`,rc.1 没导(reference/ 只有 0.2.1-rc.3);DESIGN §2.4a 的 rc.1 引用(dsh-system-prompt、dsh-tools lib 行号)指的是装机运行时。要么只导被引的几个包,要么改 §4 写明 rc.1 证据的出处约定,并定 devDeps 的 @deepseek-ai/* 是否跟到 rc.1。
8. **`.llm/park` 两个 patch 残渣删除**(一分钟)。

## 应修清单(汇总)

| # | 位置 | 问题 | 证据 |
| --- | --- | --- | --- |
| 1 | `packages/hourness/README.md:35-47` | 行表缺 execute/metrics/env/bootstrap 四行;graph-panel 描述仍是已删除的 `/graph-apply` | patch 17 行(node 实数);HANDOFF §3 graph-panel 行「/graph-apply 已随面板的写入删去」 |
| 2 | `docs/DESIGN.md` 行表(47–67 行一带) | 缺 `glm-hourness/metrics` 行(全文件 0 命中);glm-hourness/bootstrap 行(65 行)仍写「默认禁用…第一批 L4 之后才启用」,而行已启用、B10 已跑完 | grep 计数;7176e503;HANDOFF §10 第 2 条 |
| 3 | `docs/ORCHESTRATION.md:2096、2098、555` | §19 头部「B10 未做,行默认禁用」、§19.2「默认禁用」、§3.1 接管接缝「行默认禁用」均过时 | 7176e503(启用)、5de7c061/00f7c42b(B10 记录) |
| 4 | `docs/ORCHESTRATION.md:869`、`docs/HANDOFF.md:59` | 「orch 的 stage 图上的改动还没有做」——331c2950(2026-11-01 21:18)已清 orch 的 stage,ORCHESTRATION §4.9 仍保留待执行命令 | `git show 331c2950`;orch.json 现无 stage 字段 |
| 5 | `docs/DEVELOPMENT.md:103、108、239` | 「版本 0.2.1-rc.3,与运行时一致」自 2026-11-10 起不真(运行时 0.2.2-rc.1);§4 的重导出规则对 rc.1 未执行(reference/ 仅 0.2.1-rc.3) | HANDOFF §10 基线行;`ls reference/` |
| 6 | `.agents/tasks/docs-at-hand/source-transcript.md` | 已被 git 跟踪(6e2dbeb1 带入),HANDOFF 写明不入库 | `git log --follow` |
| 7 | `packages/glm/cordis.patch.yml`(glm-llm 注释)、`packages/hourness/cordis.patch.yml`(bootstrap 注释) | glm-llm「Ships disabled until the sandbox passes」的依据 2026-10-29 已满足;bootstrap 注释日期 2026-11-11 与启用提交 11-12 不符、内嵌「not merged yet, plan B8」为 B8 合入前旧话 | 注释原文;7176e503 日期 |

## 备注(不挡路)

1. HANDOFF §5 末尾的 rules-peak-stop 查结以「3.」编号挂在第 27 条后(编号与既有第 3 条相撞),且事故 home 应是 DEVELOPMENT §7——2026-11-09 至 11-12 的三起(该查结、空提交、嵌套 -Root)都没进 §7 表。
2. 图滞后:m7-1/2/4/6..10、glm-subdir-instructions 停在 approved 而代码已合入;进度只在 HANDOFF §8(ROADMAP §1 的「进度只记图上」被绕过)。
3. 决策队列注册缺口:HANDOFF §10 的六个待人定只有 question-40/41 在图队列;宣传视频三件连节点都没有。
4. HANDOFF §1/§2 冻结段漂移:0.3.0(实为 0.3.1)、hourness「9 宿主行」(实 16)、「worktrees 目录为空」(实 4)。冻结约定可解释,但 §1 是装机形态的第一入口。
5. question-40/41 正文指向 `.agents/tasks/reval/design.md`、`.agents/tasks/nowait/design.md`,main 上不存在(设计驻留分支的既定代价;拍板的人要切分支才能读到原文)。
6. goal glm-house(done)标题仍写 3.16.3。
7. dist build-info commit 字段落后 3 提交(构建时树 dirty);内容已验证含最新运行时代码,无需动作。
8. 根 package.json 0.3.0 vs 两包 0.3.1。
9. `.llm/park/now.patch`、`b10-wip-2026-11-11.patch` 是 e04a67c0 已提交内容的残留 diff,可删;restart 存档保留。
10. FACTS §3 pi-ai 行出处写「origin/provider-verify findings.md」,该分支已按清扫删除;证据文件本体已在 main(`.agents/tasks/provider-verify/findings.md`),出处措辞宜改指 main 路径。
11. FACTS 缺两行:同意格式事实(见 F-1)、metrics-pricing 定价口径的行(brief 预期有,实际只有任务文稿)。
12. 空提交事故的 `4df09fe` 在仓外 ws-node,本仓无影响(图、svg 复测干净)。
13. `docs/rules/`、`docs/loops/` 尚未诞生——按 HANDOFF §2 的条件存在条款属正常(人还没在本仓设过档位/条目)。
14. 复测全绿汇总:eslint 73 压制、knip 18、jscpd 1(7 行)、逐字 502/0、graph.svg 与重渲染逐字节一致(revision de48f2426b4c)。

## 对账清账（2026-11-13，doc-reconciliation lane）

### 提交 1（eed32ce1）——7 条应修 + 版本号

- 应修 1：`packages/hourness/README.md` 行表补 execute/metrics/env/bootstrap 四行（按 `cordis.patch.yml` 的 17 行排位），graph-panel 行改为「/graph-run；面板只读」（照 HANDOFF §3 的措辞）；引言的行数 twelve→seventeen（中英两处）。同文件顺带修了 engines 行：README 写 0.2.1-rc.3 而 `engines.dsh` 是 `^0.2.2-rc.1`——审计清单没列这处，属同类漂移，一并改真。
- 应修 2：`docs/DESIGN.md` §2.2 表补 `glm-hourness/metrics` 行（默认启用 2026-11-04 起，L3 三场景过，桌面核对欠）；bootstrap 行改为出厂启用（`7176e503` 2026-11-12、`0cc628a5` 579/579、B10 `5de7c061` 收档）。
- 应修 3：`docs/ORCHESTRATION.md` §19 节首、§19.2 引言、§3.1 接管接缝改为「已实现并出厂启用 + B10 已过」。
- 应修 4：`ORCHESTRATION.md` §4.9「本仓库的图」整条改为已处置（`331c2950`，2026-11-01），「要执行的命令」改「已执行的命令」，STAND-IN 句同步改已随 m3 换掉；`HANDOFF.md` §3 design 行的「已知残余」改「已知残余已清」。
- 应修 5：`docs/DEVELOPMENT.md` §4 与 §11 第 3 条改为如实：devDependencies 与 `reference/` 仍在 0.2.1-rc.3，运行时 2026-11-10 起 0.2.2-rc.1，rc.1 重导出挂账（本批不做）。
- 应修 6：`source-transcript.md` 已 `git rm --cached`（工作副本保留），`.gitignore` 在白名单之后加例外，`git check-ignore` 验证命中；处置写进提交说明。
- 应修 7：glm 包 glm-llm 注释改「Ships disabled by design, not by a pending gate」（沙盒与桌面 L4 已于 2026-10-28/29 过，出处 DESIGN §2.2/§2.5）；hourness 包 bootstrap 注释改为 /wish 入口（B8 已合入）、启用 2026-11-12、B10 桌面已过（`5de7c061`）。
- 根 `package.json` 0.3.0 → 0.3.1。
- 核查：tests/ 与 scripts/ 无引用旧注释原文的断言（grep 0 命中）；本提交为纯文档与注释，全量门禁按工单在整批对账完成后跑一次。

### 提交 2（06defe64）——FACTS 账本

- 备注 11 / F-1：§3 表新增同意格式事实一行（自由文本转述必漂移、可复制 JSON 一次过账；seq 145 与 seq 164→166 两案对照；`bootstrap_review` 回带 `args`、`verifyDecision` 不放宽，`69757062`）。
- 备注 11：§3 表新增 metrics-pricing 备注粘死一行（apply 期一次性探测输跨包激活竞态 + notes 只进不出；响应式接线 `cbc46d36`）。
- 备注 10：pi-ai 行出处改为 `.agents/tasks/provider-verify/findings.md`（main），并注明 `origin/provider-verify` 分支已随清扫删除。

### 提交 3（本次）——事故账本

- 备注 1：`DEVELOPMENT.md` §7 表补三行——(a) 2026-11-10 rules-peak-stop 查结（FLAKE、竞态约 30ms 窗口、断言按契约放宽 `888bd1b6`、复跑放行废除）；(b) 2026-11-12 flow-1 空提交虚报（双侧根因、`50e5e451`/`69757062`、桌面重跑 `6800976` 非空后 B10 收档 `5de7c061`）；(c) 2026-11-12 嵌套 home 桌面事故（相对 `-Root`、仓外零写入复核、绝对 `-Root` 教训）。
- `HANDOFF.md` §5 末尾重复的「3.」改为第 28 条并指向 DEVELOPMENT §7，注明 2026-11-13 改号缘由；查结全文只留在 DEVELOPMENT §7 一处。
