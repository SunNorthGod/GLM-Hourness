# M5 实施计划：记忆（`m5`）与经验板块（`lessons`）

版本 1.0（2026-11-01）。依据：`.agents/tasks/m5/design.md` 0.7（0.6 另存 `design-0.6.md`；修订评审 `reviews/amend-review.json` APPROVED；R5-01 至 R5-08 在 `design-review.json`）、`onepage.md`、`onepage-done.md`。节点草稿在 `graph-ops-impl.json`（九个 `propose`，由编排者套用，本计划不写 `docs/graph`）。

干净区：本文件不写人设与语气词。路径都是工作树 `c:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\m5`（分支 `m5-memory-lessons`）下的路径；`.agents/` 被 `.gitignore` 忽略，本计划、设计、节点草稿、各步的评审与进度记录都不入库。

## 0. 基线（计划时实测）

- 分支基于 `origin/main`（`055189f`）。`origin/main` 现为 `f374f17`，与分支在 `src/`、`tests/`、`scripts/`、`packages/`、`ui/`、`docs/*.md`、`AGENTS.md`、`package.json` 上没有差别（只多了 `docs/graph` 与 `video/` 的提交），所以现在不需要变基。
- 在本工作树实测：`npm run build` 退出码 0（8 秒）；`npm run preflight` 退出码 0（2 个包、12 个源目录、15 行）；`npm test` 退出码 0（约 100 秒，含 `check:verbatim`、eslint/knip/jscpd 基线、`check:secrets`、`graph:smoke`）；`npm run probe` 退出码 0，149/149 通过（58 秒）。`node_modules` 在位，`reference/` 不在工作树内，门禁经 `scripts/reference-dir.mjs` 读主检出的那份（只读）。`$env:TEMP` 是系统临时目录 `C:\Users\29596\AppData\Local\Temp`，不要改。
- 邻居分支里和 M5 同文件的改动（只读 `git diff origin/main <分支>` 得到，没有碰它们的工作树）：`m6-glm-upkeep` 改了 `src/glm-prompt/index.ts`（33 行）、`src/memory/audit.ts`（6 行，加 `gaps` 路径）、`scripts/probe/run-probe.mjs`、`tests/contracts.spec.ts`、`package.json`；`m3` 改了 `package.json`、`scripts/probe/run-probe.mjs`、`tests/contracts.spec.ts`。`src/shared/answer-marks.ts` 与 `personSaid`、`TALK_PROJECTION` 在 `m3`、`m3-flow` 上也没有提交，`src/design/talk.ts` 在 main 上只有 `TALK_GUIDE`、`HIDDEN_FROM_MAIN_AGENT`、`ProposalKind`。
- 方向：`d-memory-scope`（关于人的记忆在用户级，项目事实与全部经验在项目的 `.llm/`）；`d-code-rules-enforce`（两行不注册任何拦截，S7、S8 用测试钉住）；`d-desktop-direct-use`（桌面验证是后面的步骤，本计划不排）；新行 `lessons` 在 `cordis.patch.yml` 里 `disabled: true`。

## 1. 步骤一览

计划顺序即执行顺序（循环按序取「可立即开始」的步，一步一轮）。「设计步」是 design.md §9.1 的步名。

| 步 | 设计步 | 节点 | 依赖 | 状态 | 评审 | 门禁 |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | A1 | m5-1、lessons-1 | 无 | 可立即开始 | 深 | build、preflight、test、probe |
| S2 | B1 | m5-1、m5-2 | S1 | 可立即开始 | 深 | build、preflight、test |
| S3 | C1 | lessons-1、lessons-2 | S1 | 可立即开始 | 深 | build、preflight、test |
| S4 | M1 | m5-1、m5-2、m5-5 | S1、S2 | 可立即开始 | 深 | build、preflight、test、probe |
| S5 | D1 | m5-3 | S4 | 可立即开始 | 常 | build、preflight、test、probe、check:verbatim |
| S6 | R1 | m5-5 | S4 | 可立即开始 | 常 | build、preflight、test、probe |
| S7 | L1 | lessons-1 | S1、S3（S4 只是登记文件的排队） | 可立即开始 | 深 | build、preflight、test、probe |
| S8 | L2 | lessons-2 | S7 | 可立即开始 | 常 | build、preflight、test、probe |
| S9 | G1 | m5-4 | S4、S7 | 可立即开始（习惯相关的验收归 S12） | 常 | build、preflight、test、probe |
| S10 | P1 | lessons-3 | S4、S7 | 可立即开始（习惯相关的几节归 S12） | 常 | build、preflight、test、probe |
| S11 | S1（第一批经验） | lessons-4 | S7 | 可立即开始 | 常 | build、preflight、test |
| S12 | H1 | m5-4（连带 m5-1 的坏行规则、lessons-3 的几节） | S4、S9、S10 与 M3 | 阻塞，见 §4 | 深 | build、preflight、test、probe |

评审级别：
- 深：评审员（不是作者）在父提交上跑本步的失败在先测试，确认它们失败，再在本步提交上确认通过；逐条核对该步「评审要点」里的不变量；跑四道门禁。
- 常：对照本步引用的验收条款与门禁证据看 diff，核对 §5 里归本步的 R 条。
- 两种都最多三遍「修—审」，三遍后仍有挡路项就停这一条线并汇报。评审与进度记录写到 `.agents/tasks/m5/impl/`（`review-S<n>-<遍>.md`、`progress.md`：提交号、各门禁退出码、评审结论、留给后面的事）；循环自己定的路径优先。

## 2. 每步通用规程

1. 先读：本步引用的设计章节；碰 DSH 契约（`tools/post-execute`、会话投影、`agent/created`）时先读 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 与官方 `.d.ts`，不凭设计里的行号猜字段（读主检出的 `reference/`，只读）。
2. 失败在先：先写测试，在改动前的树上跑，记下「今天必败」的样子（多数是导入失败），再实现。单个规格用 `node --experimental-strip-types tests/<名>.spec.ts`。
3. 门禁按表，顺序 `npm run build` → `npm run preflight` → `npm test`，碰 DSH 运行时行的步再 `npm run probe`；看退出码，输出走 stderr。探针与标定不同时跑。
4. 新增的 `tests/*.spec.ts` 追加进 `package.json` 的 `test` 脚本（接在 `tests/contracts.spec.ts` 之前）。
5. 不新增编译器、eslint、knip、jscpd 告警：基线只许缩小，不往 `knip-baseline.json`、`eslint-suppressions.json`、`.jscpd-baseline.json` 里加。一个导出等到后面的步才有人用时，按本步测试的用法留，或把它放到用它的那一步；做不到就停下汇报，不记基线。复用 `acquireLock`、`projectOf`、`ensureIgnored`，不写第二份。
6. 测试里不要让 `projectOf`、`ensureProjectDir`、`ensureIgnored` 对本工作树路径起作用：工作树的项目根经 `commondir` 解析到主检出，会往主检出的 `.git/info/exclude` 追加、往主检出的 `.llm/` 写。用 `mkdtemp` 建带自己 `.git` 目录的临时夹，或注入 `projectOverride`；需要「不在 git 里」的用例用 `tests/temp-outside-git.ts`。探针靠 `dataRows` 的 `projectOverride` 隔离（S1 加）。
7. 纯函数文件（`src/memory/model.ts`、`recall.ts`，`src/lessons/model.ts`、`match.ts`、`render.ts`，`src/data/evidence.ts`、`secret-shape.ts`）不引 `node:*`：经验页（S10）在浏览器里导入其中一部分。
8. 激活期不抛错：配置缺失降级为 warn 加 no-op 并写行健康；不 mock DSH 契约，假宿主 `tests/fake-rc3.ts` 只给 rc.3 真宿主会给的信号。
9. 文档与行为同一提交；每步一个提交，提交信息带节点 id，不写人设；不推送，不碰 `~/.dsh`，不动主检出的工作树。
10. 步末在 `progress.md` 记：提交号、各门禁退出码、探针通过数、评审结论、留给后面的事。

## 3. 步骤

- [ ] **S1. 存储底座与主 Agent 访问器**（A1；m5-1、lessons-1；依赖：无；可立即开始；评审：深）
  做什么：按 §5.1–§5.7 建只追加的流水（异步与同步读、按 stat 缓存、坏行、未写完的末行忽略并封口、进程内按路径排队、`acquireLock`、`seq`、`fsync`）、像密钥的判断、证据与出处的写法；在 `src/data/project-root.ts` 加 `projectDirOf(cwd, home?)`（只返回路径，同步，不写任何东西）与 `ensureProjectDir(dir)`（先 `ensureIgnored` 再建目录，忽略条目写不进就不建目录）；数据行加配置 `projectOverride` 与成员 `projectDirOf`；沙盒 `dataRows` 设 `projectOverride`。另建主 Agent 访问器 `src/data/main-agent.ts`（R5-01，见 §5）：唯一函数 `isMainAgentFor(ctx, agent)`，两行共用。判法：非根 agent（会话头 `origin: 'subagent'`）为否；`dir = graphService(ctx)?.dirFor(会话头 cwd)`，`userHome = holderHome(ctx)`；没有图服务、没有 `dir`、`mainAgentOf(userHome, dir)` 取不到记录（无记录、记录读不了）时按「设计行不在」处理：任何根 agent 都算，并带出原因给行健康；记录指向别的会话为否；记录指向本会话时再核对本会话的 `hournessMainAgent` 投影（`sessionProjections.stateOf(session, MAIN_AGENT_KEY)` 的 `active` 为真），为假或读不到为否并带出原因。核对放在这一个函数里，因为 `mainAgentOf` 按记录原样返回，可能指向模式已关的会话（M3 评审 R2）；M3 在 `mainAgentOf` 旁边的新读法合入 main 后，只改这一个文件，把自己的核对换成它（合入前的检查见 §7）。
  文件：新建 `src/data/journal.ts`、`secret-shape.ts`、`evidence.ts`（含 `isGroupKey`，N22）、`main-agent.ts`，`tests/data-journal.spec.ts`、`data-project-root.spec.ts`（只测新加的两个函数）、`data-secret-shape.spec.ts`、`data-evidence.spec.ts`、`data-main-agent.spec.ts`；改 `src/data/project-root.ts`、`src/data/index.ts`、`src/shared/data-home.ts`（`DataService`）、`scripts/sandbox.mjs`（`dataRows`）、`tests/data-home.spec.ts`、`package.json`（测试清单）、`docs/DESIGN.md` §2.4。不给 `lock.ts`、`project-root.ts` 加选项，不新建第二个项目根或锁模块。
  失败在先：导入失败；两个子进程各写 200 条之后 `seq` 为 1 至 400 连续（m5-1 第 8 条）；§5.6 的三组固定用例（`ghp_` 令牌、40 字符大小写数字混排令牌、PEM 头拒收；深路径、32 字符以上标识符、`coding-plan/start-plan` 放行）；§5.7 的写法（裸写与 `commit:` 的 40 位提交号放行，`commit:` 后不是 7 至 40 位十六进制为 `invalid`）；`isGroupKey`（1 至 80 字符、无换行、首尾无空白、形如 `edit:goal.stage`）；访问器的六种情形（本会话持有且模式开、持有但模式关、别的会话持有、无记录或无图目录、子 agent、投影读不出）；`ensureProjectDir` 在忽略条目写不进时没有建出 `.llm/`。
  验证：`npm run build`、`npm run preflight`、`npm test`、`npm run probe` 都退出码 0，探针通过数不少于 149；新规格在父提交上失败、本提交上通过。
  评审要点：崩溃后的半行与重复 `seq`；陈旧锁接手只在持有者不在时；密钥判据对路径与长标识符不误拒；`ensureProjectDir` 的先后；测试没有对主检出写；访问器是唯一一处主 Agent 判断，没有第二份核对散在别处。

- [ ] **S2. 记忆模型与索引**（B1；m5-1、m5-2；依赖：S1；可立即开始；评审：深）
  做什么：条目与两类（§3.1）、`classify`（`user`、`feedback` 恒为偏好）、`strength`（偏好恒为 1，事实 14 天半衰期，时钟注入）、校验（§3.2：`Why:` 行、`project` 出处、范围规则、`llm` 写 `user`/`feedback` 无 `relay` 为 `ask_first`、`learnedFrom` 的键按 `isGroupKey`）、相似判断、`applyRecord`（无凭据的 `user`/`feedback` 为坏行；同名更新按 §3.1 折叠，保留 `created`、`origin`、`confirmed`、`learnedFrom`，换成 `description`、`body`、`source`、`value`、`relay`、`relayChecked` 六项，N18；`forgotten` 之上的 `store` 是新条目）、旧格式转换、权限函数（删偏好须带 `relay` 或身份为人，同会话刚写的除外，按 `origin` 判，有 `confirmed` 的不适用）、索引渲染（偏好在前，淡忘的事实不列，至多 200 行与 25,000 字符，超出附截断说明）。
  文件：新建 `src/memory/model.ts`、`recall.ts`、`tests/memory-model.spec.ts`、`tests/memory-recall.spec.ts`；改 `package.json`。流水记录的形状取 S1 的 `journal.ts`。
  失败在先：导入失败，加 m5-1 第 1、3、4、7、9 条与 m5-2 第 1、4 条在纯函数层的用例（强度用注入时钟：偏好 60 天后为 1，事实 0 次复审 14 天后为 0.5；同名更新字段逐个断言；权限函数的每个分支）。
  验证：`npm run build`、`npm run preflight`、`npm test` 退出码 0。
  评审要点：权限函数的全部分支（随 S1 一并看）；折叠不丢 `origin` 与 `confirmed`；坏行规则；`model.ts` 无 `node:*` 导入。

- [ ] **S3. 经验模型与匹配**（C1；lessons-1、lessons-2；依赖：S1；可立即开始；评审：深）
  做什么：经验与候选的条目、签名、相似、权限、`applyRecord`（§4.1、§4.2）；派发打分 `relevant`（总分至少 2，只有工具命中的不入简报，同分按 28 天命中会话数与最近确认排序，行渲染不超过 300 字符，§4.3）、失败匹配、查询打分、复发判断（28 天内 3 个会话，§4.4–§4.6）、渲染；`learnedFrom` 的键按 `isGroupKey`。
  文件：新建 `src/lessons/model.ts`、`match.ts`、`render.ts`、`tests/lessons-model.spec.ts`、`tests/lessons-match.spec.ts`；改 `package.json`。
  失败在先：导入失败，加 lessons-1 第 1、4 条与 lessons-2 第 3 条在纯函数层的用例（通配对通配按 §4.3 的字面前缀规则，`docs/graph/**` 与 `docs/graph/nodes/x.json` 都命中；候选在查询结果里标未审）。
  验证：`npm run build`、`npm run preflight`、`npm test` 退出码 0。
  评审要点：签名去重与「人删过的」判断；权限函数；`relevant` 的分数边界（1 分不入、2 分入）；无 `node:*` 导入。

- [ ] **S4. 记忆行改线**（M1；m5-1、m5-2、m5-5；依赖：S1、S2；可立即开始；评审：深）
  做什么：重写 `src/memory/tools.ts` 的三个工具（新参数与规则，含 `value`；范围 `all` 只给 `user`、`feedback`，`feedback` 不写 `scope` 为 `invalid`；`llm` 写 `user`/`feedback` 的 `store` 记录一律记 `relayChecked: false`，`ask_first` 的 `hint` 与 `relay` 的参数说明教「只是猜的习惯不存、先不要自己去问」，不点名 `memory_habit`，S12 才改）；`src/memory/index.ts`：按会话定项目目录、子 agent 的工具面过滤（`agent/created` 时装 agent 作用域的 `system-prompt/assemble` 监听器，不用 `prepend`，§2.3）、开局与压缩后的索引提醒（来源 `glm-hourness-memory`，`installStepNotice`）、投影 `hournessMemory`、命令 `/memory`、迁移（旧 `.llm/memory.json` 第一次写入时改名为 `memory.json.migrated-<时间>`，读不出的不覆盖）、行健康（忽略 profile 里的 `home` 并说明）；服务 `glmHournessMemory`，其契约放 `src/shared/memory-service.ts`（设计把这个文件列在 R1，这里提前，因为行注册服务时要对着契约取类型，S6 只读它）；`src/memory/service.ts`（`stats`、`hygiene`，R5-07；`depth` 的同步读）；删 `src/memory/store.ts`、`defaultKnowableFromGit`、`shouldStore` 与行配置 `knowableFromGit`；探针场景 `glm-memory`、`non-glm-memory`、`glm-memory-compact`、`glm-worker-memory`；不改 `src/memory/audit.ts`（M6 分支在改它）。
  文件：改 `src/memory/tools.ts`、`src/memory/index.ts`、`src/shared/dsh-min.ts`、`src/shared/health.ts`（说明文字）、`tests/memory-audit.spec.ts`、`tests/contracts.spec.ts`、`scripts/probe/run-probe.mjs`；新建 `src/memory/service.ts`、`src/shared/memory-service.ts`、`tests/memory-tools.spec.ts`、`tests/memory-row.spec.ts`；删 `src/memory/store.ts`；改 `package.json`、`docs/ORCHESTRATION.md` §8.1–§8.4、`docs/DESIGN.md` §2.2、§2.4、§2.4a、§2.5、§7、`docs/ROADMAP.md` M5 一节（改成带节点 id 的表，同 M7 一节，设计 §13 第 10 条）。
  失败在先：含 `coding-plan/start-plan` 与 `src/shared/dsh-min.ts` 的文本今天被 `defaultKnowableFromGit` 拒（m5-1 第 2 条）；探针里子 agent 的请求今天带着记忆工具（m5-2 第 3 条）；其余按 m5-1 第 1 至 7 条与第 9 条、m5-2 第 1 至 4 条、m5-5 第 1 条在工具与行层的用例。
  验证：四道门禁退出码 0；探针新场景通过，探针结束时真实用户级 `memory/memory.jsonl` 与主检出 `.llm/` 下的流水没变；`tests/memory-row.spec.ts` 断言记忆行不注册 `tools/pre-execute` 监听器（`d-code-rules-enforce`、设计 0.6：两行不拦）。
  评审要点：迁移幂等且不覆盖读不出的旧文件；`ask_first` 与 `relay` 的出口；子 agent 过滤后 `memorySectionApplies` 为假；`all`/`project` 同名遮盖；`/memory forget` 身份为人；不再有 `knowableFromGit` 的残留。

- [ ] **S5. 方言的 Memory 节**（D1；m5-3；依赖：S4；可立即开始；评审：常）
  做什么：把 `MEMORY_SECTION_DSH` 改成 §3.5 写定的全文（带 `lessons_query` 时 2,213 字符，不带 2,114）。新建镜像文件 `src/glm-prompt/zcode-memory-text.ts`（`ZCODE_MEMORY_LINES`，十行，与 3.17.1 `buildMemorySection` 逐字相同）并登记进 `scripts/check-verbatim.mjs` 的 `MIRROR_FILES`；`localize.ts` 用 `MEMORY_Z2_LOCAL`、`MEMORY_Z6_LOCAL`、`MEMORY_L1`、`MEMORY_L2`、`MEMORY_BODY_PREFIX` 与镜像行拼出这一节，Z7 的两处替换用「恰好替换一次，否则抛错」的函数；`src/glm-prompt/index.ts` 里提到 `lessons_query` 的那一句只在本次 `next()` 的工具里有它时出现；探针常量 `MEMORY_SECTION_LINE` 改为新首句。
  文件：新建 `src/glm-prompt/zcode-memory-text.ts`；改 `src/glm-prompt/localize.ts`、`src/glm-prompt/index.ts`、`scripts/check-verbatim.mjs`、`tests/glm-prompt.spec.ts`、`scripts/probe/run-probe.mjs`、`docs/DESIGN.md` §5.2、§5.3 ⑧、§5.8。
  失败在先：保留原句的逐句断言今天失败（现有节只有 883 字符）；白名单断言（节里不是 ZCode 原文的文字只有 Z2、Z6 的改写句、`body: ` 前缀、`type:` 行去掉的缩进、Z7 的两处替换、L1、L2）。
  验证：`npm run check:verbatim` 退出码 0（只读 `reference/zcode-3.17.1/zcode.cjs`）；四道门禁退出码 0；探针 `glm` 场景看到新首句，`glm-only` 场景没有这一节（m5-3 第 4 条）。
  合入排队：M6 分支也改 `src/glm-prompt/index.ts`，`question-31` C、`prompt-fixes` 与 M3 的 `m3-main-persona` 同理；开工前 `git fetch origin` 看 `src/glm-prompt/` 在 main 上有没有新提交，有就先取过来；没有就照做，后合入的一方折叠另一方（§7）。
  评审要点：贴着 `check:verbatim` 的输出看，不凭记忆；全文字符数与换行数；Z5 的 `project` 一句在位。

- [ ] **S6. 汇报细度的读一侧**（R1；m5-5；依赖：S4；可立即开始；评审：常）
  做什么：GLM 包的汇报细度一节读服务 `glmHournessMemory` 的常设细度（偏好 `reporting-depth` 的值 > 配置 > `balanced`），只在新会话开局同步读一次；写入那个会话的系统提示词不变。节名与配置键用 main 上当时的（今天是 `glm:persona`、`persona`；M3 的 `m3-main-persona` 改名后跟着改，改名不属于本步）。
  文件：改 `src/glm-prompt/index.ts`、`src/glm-prompt/persona.ts`、`tests/glm-prompt.spec.ts`、`tests/memory-row.spec.ts`、`tests/contracts.spec.ts`、`scripts/probe/run-probe.mjs`（`glm-memory` 场景加新会话的细度断言）；服务契约用 S4 的 `src/shared/memory-service.ts`。
  失败在先：写入 `reporting-depth` 之后新会话的汇报细度一节今天仍是配置的默认（m5-5 第 2 条）。
  验证：四道门禁退出码 0；探针里新会话的细度一节是 `concise`，写入的那个会话的系统提示词逐步不变；`memory_forget reporting-depth` 之后下一个会话回到配置值（m5-5 第 3 条）。
  评审要点：GLM 包没有 import `src/memory/`（包边界）；读失败时降级为配置值并写行健康。

- [ ] **S7. 经验行**（L1；lessons-1；依赖：S1、S3；排在 S4 之后只是因为两行改同一批登记文件，先合入的先改；可立即开始；评审：深）
  做什么：新行 `glm-hourness/lessons`：工具 `lessons_query`（所有 agent，GLM 路由上常驻）与 `lessons_merge`（根 agent，延迟工具，九种动作，`delete`/`restore` 不带 `relay` 为 `user_only`）、服务 `glmHournessLessons`（`propose`、`relevant`、`stats`、`hygiene`，`propose` 对被拒的候选返回 `{status:'rejected', code}`，只有内部失败返回 `{error}`，不抛错）、候选提醒（只给 `isMainAgentFor` 判为主 Agent 的步，内容变了才再来）、命令 `/lessons`、投影 `hournessLessons`、导入 M7 退路批注 `[候选经验]`（修订变了且距上次检查超过 60 秒才导入）、命令行 `npm run -s lessons -- …`（含 `apply --file`）；行登记：`scripts/packages.mjs`（`hourness.src` 加 `lessons`，`rows` 加 `glm-hourness/lessons`）、`packages/hourness/cordis.patch.yml`（排在 `memory` 之后，`disabled: true`）、`packages/hourness/package.json`（`./lessons` 与 `./lessons/locale/*.json` 两条导出）、`packages/hourness/locale/lessons/{zh,en}.json`、`src/shared/health.ts` 的 `HOURNESS_ROWS`、`src/shared/tool-names.ts`（`LESSONS_TOOL_NAMES`，常驻名单加 `lessons_query`）。
  文件：新建 `src/lessons/index.ts`、`tools.ts`、`service.ts`、`notices.ts`、`import.ts`、`cli.ts`、`scripts/lessons/cli.ts`、`tests/lessons-row.spec.ts`；改 `scripts/packages.mjs`、`packages/hourness/cordis.patch.yml`、`packages/hourness/package.json`、`src/shared/health.ts`、`src/shared/tool-names.ts`、`tests/contracts.spec.ts`、`package.json`（`lessons` 脚本与测试清单）、`scripts/probe/probe-dispatch.mjs`（探针覆盖层里加一个调 `propose` 的验证插件）、`scripts/probe/run-probe.mjs`（`glm-lessons`、`non-glm-lessons`）、`docs/ORCHESTRATION.md` §8.6（新）、`docs/DESIGN.md` §2.2、§2.4、§2.4a、§2.5、§7、`docs/DEVELOPMENT.md` 在 §12 之后加命令行一节。
  失败在先：契约测试里 `LESSONS_TOOL_NAMES` 与注册不符；lessons-1 第 1 至 7 条的服务与行层用例，其中第 3 条按校正后的字句：持有者是别的会话时这个会话没有提醒，持有者记录指向本会话但模式已关时也没有（R5-06、R2）；带 `ghp_` 令牌的候选返回 `rejected` 且假的 M7 退路没有被调用；子 agent 调 `lessons_merge` 得 `role`。
  验证：四道门禁退出码 0；preflight 认得新行、导出与 locale；探针 `glm-lessons`、`non-glm-lessons` 通过，行健康表有 `lessons`；`tests/lessons-row.spec.ts` 断言经验行不注册 `tools/pre-execute` 监听器，也不向 guard 登记规则。
  评审要点：`lessons_merge` 的权限矩阵与 `delete`/`restore` 的快照；`propose` 不抛错；候选与密钥的路径（U14：导入时被拒的批注也写 `import` 记录，之后不再试）；`isMainAgentFor` 是提醒的唯一判断。

- [ ] **S8. 失败匹配与复发提醒**（L2；lessons-2；依赖：S7；可立即开始；评审：常）
  做什么：shell 调用（原生名 `pwsh`，GLM 路由上的别名 `Bash`）退出码非 0 且 stderr 含某条经验的报错片段时，下一次请求带至多 2 条提醒，同会话同一条只推一次，成功的调用从不触发；匹配代码抛错时工具结果不变、行健康降级；每次匹配记一次命中；28 天内同一条在 3 个会话里命中或并入时，只给主 Agent 一条复发提醒（建议用 `rules_propose` 与 `propose_to_human`，每个项目每周至多 2 条）；任何调用都不被拦。`src/shared/dsh-min.ts` 补 `tools/post-execute` 的类型：先读 rc.3 的 `dsh-tools` 源码与 `.d.ts`，把包与行记进 `docs/DESIGN.md` §2.4a；`tests/fake-rc3.ts` 的工具管线按真宿主的顺序补 post-execute（门、体、输出渲染、延后上下文）。
  文件：新建 `src/lessons/failure.ts`、`tests/lessons-failure.spec.ts`；改 `src/lessons/index.ts`、`src/lessons/notices.ts`、`src/shared/dsh-min.ts`、`tests/fake-rc3.ts`、`scripts/probe/run-probe.mjs`（`glm-lessons-failure`、`non-glm-lessons-failure`）、`package.json`、`docs/DESIGN.md` §2.4a、§7。
  失败在先：失败的 `pwsh` 调用之后下一次请求今天没有经验提醒；匹配抛错的用例；成功调用不触发的用例。
  验证：四道门禁退出码 0；探针里子 agent 的失败也带提醒（U1），提醒紧跟工具结果（U2）；两项任一不成立，按 design.md §14 U1、U2 的「不成立时」改，并在 `progress.md` 写明。
  评审要点：任何路径都不返回拒绝或取消；命中记录每会话一条；复发阈值的边界（第 2 个会话不提醒、第 3 个提醒）。

- [ ] **S9. 学习信号与每七天的摘要**（G1；m5-4；依赖：S4、S7；可立即开始，习惯相关的验收（m5-4 第 4 至 8 条）归 S12；评审：常）
  做什么：`correctionSignals`、`recurrences`（纯函数）、`learning_signals`（只读，根 agent，延迟工具）、每七天至多一次的摘要提醒（来源 `glm-hourness-learning`，`learn-notified` 记录）、服务 `learningDigest(session, {since?, until?, minCount?})`。工具名 `LEARNING_TOOL_NAMES = ['learning_signals']` 放进 `src/shared/tool-names.ts`，`learningTools(...)` 从 `src/memory/tools.ts` 导出，`MEMORY_TOOL_NAMES` 与 `memorySectionApplies` 不动（R5-02）。`src/shared/answer-marks.ts`：开工时先查 main 与 M3 分支有没有；没有就只建 M3 附录 §3.5 的最小一份（`ANSWER_MARKS` 的 `agree`、`add`、`reject` 三个字面与 `answerKindOf`），后合入的一方折叠另一方。这一步只做习惯以外的部分：返回里没有 `asked` 字段，也不读 `ask`/`decline` 记录，那些随 S12 加（不留死代码）。
  文件：新建 `src/memory/signals.ts`、`src/memory/learning.ts`、`src/shared/answer-marks.ts`（如上）、`tests/memory-signals.spec.ts`；改 `src/memory/tools.ts`、`src/memory/index.ts`、`src/memory/service.ts`、`src/shared/memory-service.ts`、`src/shared/tool-names.ts`、`tests/contracts.spec.ts`、`package.json`、`docs/ORCHESTRATION.md` §8.5、§8.6。
  失败在先：导入失败；`learning_signals` 在真实图上返回空而单元测试通过的情形，用真实引擎防：测试里的图历史由 `src/graph/engine.ts` 在临时目录写出再读回，样例是 m5-4 第 1 条那七种写入，其中重开写两次（人经 `engine.apply('human', …)`；`llm` 带 `relay`，R5-05），加一次带同意记号的 `edit`（不算信号，R5-04），加一次 `学自：<键>` 的 `graph_comment`（算已落点，R5-08），加摘要不变时到期也不再提醒的用例（R5-03）。契约测试：记忆行注册的名字等于 `[...MEMORY_TOOL_NAMES, ...LEARNING_TOOL_NAMES]`，常驻名单不含 `learning_signals`，子 agent 的过滤去掉两组。
  验证：四道门禁退出码 0；探针 `glm-worker-memory` 里子 agent 的请求也没有 `learning_signals`；子 agent 直接调用得 `role`。
  评审要点：§5 里 R5-02 至 R5-05、R5-08 的落点；`learning_signals` 不写流水也不写图；摘要节流的三个条件（距上次满 7 天、有未落点或又出现的组、组键集合与上次不同）。

- [ ] **S10. 经验页**（P1；lessons-3；依赖：S4、S7；可立即开始，习惯相关的几节归 S12；评审：常）
  做什么：`ui/src/lessons/LessonsPage.tsx`：经验（本项目生效的经验、候选数、折起的「agent 收起的」「你删掉的」）与记忆（偏好带原话，`relayChecked: false` 的标「原话未核对」；项目线索带出处与强度；汇报细度一行）；每条下面一行「要改」；页面不调用 `commands.execute`、没有按钮与表单；读两行的投影 `hournessLessons`、`hournessMemory`，流水追加后 15 秒内更新。板块登记 `ui/src/graph/boards.ts`：开工时先查 main 上有没有（plain-ui），没有就按 plain-ui 0.7 §4.7 的接口自建，只登记 `lessons`，并在现有面板底部放一行「经验 ›」作临时入口（design.md §8.2）。`scripts/packages.mjs` 的 `hourness.client.sources` 加 `ui/src/lessons/`（R5-07，preflight 检查 1 要求 `ui/src/` 下每个文件属于恰好一个客户端包）。「确认的习惯」「你说过不用记的习惯」两节随 S12。
  文件：新建 `ui/src/lessons/LessonsPage.tsx`、`tests/lessons-panel-model.spec.ts`（折叠与视图模型，加静态检查：`ui/src/lessons/` 下没有 `commands.execute`）；新建或改 `ui/src/graph/boards.ts`；改 `ui/src/hourness-client.tsx`、`scripts/packages.mjs`、`package.json`。
  失败在先：登记表里没有 `lessons`；静态检查找得到按钮或命令调用的样例。
  验证：`npm run build`（含 `tsc -p ui` 与 `build-ui`）、`npm run preflight`、`npm test`、`npm run probe` 退出码 0。DevTools 截图属于桌面第二批，不在这里。
  评审要点：页面没有写入路径；读失败时保留上一次内容并写原因；`boards.ts` 的形状对齐 plain-ui 0.7 §4.7，没有为 M5 另造联合类型。

- [ ] **S11. 第一批经验**（设计里的步名也叫 S1；lessons-4；依赖：S7；可立即开始；评审：常）
  做什么：按 §4.8 把 21 条写成操作文件 `.agents/tasks/m5/lessons-seed.json`（不入库，证据按 §5.7 的写法，第 7 条的解法写「引号感知解析、启用行之前把无害写法写进测试、规则启用即拦」，不写影子期，第 15 条不提租约）；仓库里只加固定数据的导入测试 `tests/lessons-seed.spec.ts`（两条样例，导入两次只多两条）。核对在一个带自己 `.git` 的临时夹里做：`npm run -s lessons -- apply --file <文件>`（cwd 是该临时夹）导入 21 条，再导入一次不新增；`lessons_query {text: "PowerShell encoding"}` 返回第 1 条；`relevant` 对写入范围 `docs/graph/**` 与路径 `docs/graph/nodes/x.json` 都返回第 19 条。不往真实存储导入：真实项目根解析到主检出，会写主检出的 `.llm/`，留给桌面第一批（§7）。
  文件：新建 `tests/lessons-seed.spec.ts`、`.agents/tasks/m5/lessons-seed.json`（不入库）；改 `package.json`。
  失败在先：导入两次多出重复的用例今天失败（没有导入命令）。
  验证：`npm run build`、`npm run preflight`、`npm test` 退出码 0；临时夹上的三项核对写进 `progress.md`。
  评审要点：评审员把 21 条逐格对 §4.8 的表；第 7、15 条按 0.6 之后的字句；证据没有无法解析的写法。

- [ ] **S12. 习惯先问再记**（H1；m5-4，连带 m5-1 的坏行规则与 `relay` 核对、lessons-3 的两节；依赖：S4、S9、S10，另需 M3 的 `talk.ts`；**阻塞**；评审：深）
  阻塞原因与解除条件见 §4。解除后按设计 §3.8 与 §9.1 的 H1 一行做：`memory_habit`（`ask`、`confirm`、`decline`）、`src/memory/habit.ts`、`src/memory/answers.ts`（本仓库里唯一 import `src/design/talk.ts` 的文件）、流水操作 `ask`/`decline`、`memory_store` 的 `relay` 核对（要出自人最近一条消息，记 `relayChecked`）、`ask_first` 的 `hint` 与 `relay` 说明改成点名 `memory_habit`、`learning_signals` 加 `asked`、`LEARNING_TOOL_NAMES` 加 `memory_habit`、面板的两节与「原话未核对」之外的标注、探针 `glm-memory-habit`。已知要一并落实的复核发现：N20（「已落点」= 生效的偏好，或 `until` 未过的「不用」，或写下不满 28 天的未回问话）、N22 的 `ask` 一侧校验。

## 4. 阻塞与降级

阻塞：

| 步 | 原因 | 解除条件 | 现在的降级 |
| --- | --- | --- | --- |
| S12（m5-4 第 4 至 8 条，其中第 7 条是 `memory_store` 对原话的核对；m5-1 第 3 条里点名 `memory_habit` 的 `hint`；lessons-3 的两节） | M3 的 `personSaid`、`TALK_PROJECTION`、`TalkState` 和设计行注册的 `hournessTalk` 还没在 main 上（`src/design/talk.ts` 只有 `TALK_GUIDE`、`HIDDEN_FROM_MAIN_AGENT`、`ProposalKind`；`m3`、`m3-flow` 分支也没有）；`src/graph/proposal.ts` 的 `CIRCLED` 还不是导出，`PROPOSAL_LIMITS` 不存在 | `origin/main` 上 `src/design/talk.ts` 导出 `personSaid`、`TALK_PROJECTION`、`TalkState`，`src/graph/proposal.ts` 导出 `CIRCLED`、`PROPOSAL_LIMITS`，`hournessTalk` 已由设计行注册（节点 `m3-5`、M3 附录第 6 步） | 系统不问人，也不核对原话；S4 的拒绝信息告诉模型不要存猜出来的习惯、先不要自己去问；所有 `llm` 写的 `user`/`feedback` 记 `relayChecked: false`，页面标「原话未核对」 |

其余步都可立即开始，下面这些验收或联动要等邻居，不挡步：

| 事项 | 等什么 | 现在怎么办 |
| --- | --- | --- |
| lessons-1 里 M7 一侧：派发简报调 `relevant`、交回处理调 `propose`（M7 的 E1b） | M7 的派发简报与交回处理还没做 | M5 一侧的 `relevant`、`propose` 与退路批注导入照做，S7 用探针覆盖层里的验证插件与真实引擎写出的 `[候选经验]` 批注测；简报里带经验这件事不在本批验收内 |
| `lessons` 合起来：周报里每条经验命中的会话数、经验存在后同一报错又出现的会话数（M7 的 E8） | 周报还没做 | `stats`、`hygiene`、`learningDigest` 做出并测过；这一条留在节点 `lessons` 上不关 |
| 主 Agent 判断里的模式核对 | M3 在 `mainAgentOf` 旁边加的新读法 | S1 自己核对，放在 `src/data/main-agent.ts` 一个函数里；新读法在 main 上出现后只改这个文件（§7） |
| 汇报细度一节的名字 | M3 的 `m3-main-persona`（`glm:persona` 改 `glm:reporting-depth`） | S6 用 main 上当时的名字；L3 里节名断言写成读常量，不写字面 |
| 板块登记表 `boards.ts` | plain-ui 首页 | S10 先自建，plain-ui 先合入则只登记 |
| GLM 提示词文字 | M6（`m6-glm-upkeep`）、`m3-main-persona`、`prompt-fixes`、`question-31` C | S5、S6 前先看 main；后合入的折叠 |

## 5. R5-01 至 R5-08（以及随修订评审留下的几条）落在哪里

| 发现 | 做什么 | 步 | 核对用的测试 |
| --- | --- | --- | --- |
| R5-01 访问器放错目录 | 访问器放 `src/data/main-agent.ts`（`src/shared/` 不许 import 包目录，`eslint.config.js` 的边界会让 `npm test` 红）；`dir = graphService(ctx)?.dirFor(cwd)`、`userHome = holderHome(ctx)`；没有 `dir` 算取不到；U19 的导出名与形状已对过 main（`mainAgentOf(userHome, dir): HolderRecord \| undefined`，`main-agent-holder.ts`:171），只有「持有者记录在哪一级」随 M3 | S1 建；S7、S9 用 | `data-main-agent.spec.ts` 六种情形；`npm test` 的 lint 边界 |
| R5-02 `learning_signals` 不在工具名契约里 | `LEARNING_TOOL_NAMES = ['learning_signals']`（S12 再加 `memory_habit`），`learningTools(...)` 导出；`MEMORY_TOOL_NAMES`、`memorySectionApplies` 不动 | S9 | `contracts.spec.ts`：注册名等于两组之和，常驻名单不含它，子 agent 过滤去掉两组 |
| R5-03 摘要不变仍每七天重发 | 到期后比较算出的组键集合与最近一条 `learn-notified` 的 `data`，相等不注入 | S9 | `memory-signals.spec.ts` 的不变摘要用例 |
| R5-04 同意算成纠正 | 历史项的 `reason` 经 `answerKindOf` 读作同意的不算信号；`learning_signals` 的说明示例换成真实出现的组（`edit:task.acceptance`） | S9 | 同意记号 `edit` 不是信号的用例 |
| R5-05 人身份写图的唯一处说错 | 注释与文档不再说「只有 `panel-row.ts` 写」；重开样例写两次：`engine.apply('human', …)` 与 `llm` 带 `relay`（`/graph-run` 在 `run-control.ts` 也以人身份写） | S9 | 两个重开样例都出信号 |
| R5-06 残句 | 验收第 3 条改 `isMainAgentFor` 并加「持有者是别的会话则无提醒」；锁的引用写函数名 `tryCreate`，不写行号；ORCHESTRATION §8.6 与 DESIGN 的新文字写现状 | S7（用例）、S1（`journal.ts` 注释） | `lessons-row.spec.ts` 的持有者用例；`graph-ops-impl.json` 里 lessons-1 第 3 条已是新字句 |
| R5-07 文件清单不全 | `src/memory/service.ts` 在 S4 新建；`scripts/packages.mjs` 的 `client.sources` 在 S10 加 `ui/src/lessons/` | S4、S10 | preflight 检查 1 |
| R5-08 候选标定题的落点不被读 | 落点写成 `graph_comment`，正文 `学自：<键>`；已落点的计数读 `learnedFrom` 与这类批注；`learningDigest` 只用对象参数 `(session, {since?, until?, minCount?})`，代码与 ORCHESTRATION §8.5、§8.6 一致 | S9 | 批注算已落点的用例；签名在 `shared/memory-service.ts` 里只有一种 |
| 修订评审 N18 | 折叠换掉六项（含 `source`、`value`） | S2 | 折叠用例逐字段 |
| 修订评审 N20 | 「已落点」按有效偏好、未过期的「不用」、不满 28 天的未回问话算 | S12 | `asked` 一侧的用例 |
| 修订评审 N22 | `learnedFrom` 的键 1 至 80 字符、无换行、首尾无空白、形如 `edit:goal.stage`，否则 `invalid`、`field: learnedFrom` | S1（`isGroupKey`）、S2、S3、S4、S7 | `data-evidence.spec.ts` 与各工具的拒绝用例 |
| 修订评审 N16、N17、N19、N21 | 只涉及 `onepage.md`、`design.md` 的文字，没有代码；N19 对应的测试只断言「不带原话又非人身份的删除不成功」，不断言原话被核实 | — | — |
| 简报 R2（M3 评审） | 模式核对放在 `isMainAgentFor` 里，M3 的新读法进 main 后换成它 | S1；§7 | 见 S1 |

## 6. 设计文字的校正（实施按此读，design.md 不改）

1. m5-1 第 9 条：折叠换掉的是六项 `description`、`body`、`source`、`value`、`relay`、`relayChecked`（§3.1 的写法，N18）。`graph-ops-impl.json` 里已是六项。
2. lessons-1 第 3 条：主 Agent 判断是 `isMainAgentFor`，不是 M3 的 `isMainAgent`（后者不导出，也不是入口）。`graph-ops-impl.json` 里已改。
3. `src/shared/memory-service.ts` 由 S4 建（设计列在 R1），因为记忆行在 M1 就注册这个服务。
4. 主 Agent 访问器在 `src/data/main-agent.ts`，不在 `src/shared/`（R5-01）。
5. 节点草稿 `graph-ops-impl.json` 的其余验收句子逐字取自 design.md §1.2 的表（用脚本按编号拆成数组，没有改字）。九条在一份临时复制的 `docs/graph` 上用真实引擎试过：全部被接受，状态 approved，依赖按 design.md §13 第 2 条（`lessons-3` 依赖 `lessons-1`、`m5-1`；`lessons-2`、`lessons-4` 依赖 `lessons-1`；`m5-3`、`m5-5` 依赖 `m5-1`；`m5-4` 依赖 `m5-1`、`lessons-1`、`m3-5`）。文件里的顺序保证被依赖的节点先建。

## 7. 交给后面的步骤（不在本计划的实施步骤里）

- 合入前（合入步骤做）：`git fetch origin`；若 M3 在 `mainAgentOf` 旁边的模式读法已进 main，把 `src/data/main-agent.ts` 里自己的投影核对换成它，不留两份，重跑门禁；`src/shared/answer-marks.ts` 若两边都建了，取并集；`src/glm-prompt/index.ts`、`scripts/probe/run-probe.mjs`、`tests/contracts.spec.ts`、`package.json` 的测试清单与 M6、M3 分支重叠，按「后合入的折叠先合入的」解决，重跑四道门禁。
- 桌面第一批（S4、S5、S7、S8、S11 合入后）与第二批（S10、S6、S9 合入后）按设计 §9.3；先在临时 profile 用 headless 沙盒验证 loader 组合和新行（`docs/DEVELOPMENT.md` §3），动 `~/.dsh` 前备份并在汇报里列每处改动与备份，装后重启并看桌面日志没有本包的新错误，`plugin_manager` 的 `applied` 不算数；`lessons` 行验证过之前保持 `disabled: true`；第一批里把 `lessons-seed.json` 导入真实项目的 `.llm/lessons.jsonl` 并查一次；用过模型菜单就换回 `agent-default-model`。
- 工作树删除前，把 `.agents/tasks/m5/` 下的 `impl-plan.md`、`graph-ops-impl.json`、`lessons-seed.json`、`impl/` 复制回主检出的同名目录（`.agents/` 不入库，工作树一删就没了）。
- 图：套用 `graph-ops-impl.json` 的九条；S12 阻塞和 M7 的 E1b、E8 两项要在 `m5`、`lessons` 上各留一条批注；节点 `m5-1` 要等 S12 才能整条验完（第 3、4 条里的 H1 句子）。

## Digest

已验证：工作树 `build`、`preflight`、`test` 退出码 0，`probe` 149/149；下面的行号是在本工作树 `055189f` 上读到的。

| 文件 | 要改的块（现状） | 覆盖的测试 | 步 |
| --- | --- | --- | --- |
| `src/data/project-root.ts` | 在 `ensureIgnored`（117 行）之后加 `projectDirOf(cwd, home?)`、`ensureProjectDir(dir)`；现有导出 `projectOf`（94）、`gitDirOf`（102） | `tests/data-project-root.spec.ts`（新） | S1 |
| `src/data/lock.ts` | 不改；`acquireLock(file, environment, options)`（157）带 `retryMs`、`waitMs`、`staleMs`、`bootToleranceMs`、`holder`、`keepStale` | `tests/data-journal.spec.ts` 经 `journal.ts` 用 | S1 |
| `src/data/journal.ts`、`secret-shape.ts`、`evidence.ts`、`main-agent.ts` | 新建；`main-agent.ts` 用 `mainAgentOf`（`src/graph/main-agent-holder.ts`:171）、`holderHome`（:70）、`MAIN_AGENT_KEY`（`src/graph/main-agent.ts`:11）、`graphService(ctx).dirFor`（`src/graph/service.ts`:19） | `tests/data-journal.spec.ts`、`data-secret-shape.spec.ts`、`data-evidence.spec.ts`、`data-main-agent.spec.ts`（新） | S1 |
| `src/data/index.ts` | `DataConfig`（16）加 `projectOverride`；`dataServiceFor`（27）加 `projectDirOf` | `tests/data-home.spec.ts` | S1 |
| `src/shared/data-home.ts` | `DataService`（38）加 `projectDirOf` | 同上 | S1 |
| `scripts/sandbox.mjs` | `dataRows(dir)`（121–126）给 data 行设 `projectOverride` | `npm run probe` | S1 |
| `package.json` | `test` 脚本（一行长链）追加本计划新建的每个规格；`lessons` 脚本 | `npm test` | S1–S11 |
| `src/memory/model.ts`、`recall.ts` | 新建 | `tests/memory-model.spec.ts`、`memory-recall.spec.ts`（新） | S2 |
| `src/lessons/model.ts`、`match.ts`、`render.ts` | 新建 | `tests/lessons-model.spec.ts`、`lessons-match.spec.ts`（新） | S3 |
| `src/memory/tools.ts` | 重写 `memoryTools`（65）；`storeIo`（17）、`defaultKnowableFromGit`（29）删除 | `tests/memory-tools.spec.ts`（新）、`tests/contracts.spec.ts`（57–67 行） | S4 |
| `src/memory/index.ts` | `MemoryConfig`（17）、`apply`（39）、`memoryHealth`（79）；现有 `llm/stream` 用量监听器保留 | `tests/memory-row.spec.ts`（新）、`tests/memory-audit.spec.ts` | S4 |
| `src/memory/store.ts` | 整个删除（146 行） | `npm run build`、`npm test` | S4 |
| `src/memory/service.ts`、`src/shared/memory-service.ts` | 新建 | `tests/memory-row.spec.ts` | S4（S9 加 `learningDigest`） |
| `src/shared/tool-names.ts` | `MEMORY_TOOL_NAMES`（17）不动；`ORCHESTRATION_RESIDENT_TOOLS`（25）加 `lessons_query`；加 `LESSONS_TOOL_NAMES`（S7）、`LEARNING_TOOL_NAMES`（S9） | `tests/contracts.spec.ts` | S7、S9 |
| `src/shared/health.ts` | `HOURNESS_ROWS`（26）在 `memory` 之后加 `lessons` | `tests/health.spec.ts`、preflight | S7 |
| `src/shared/dsh-min.ts` | `tools/pre-execute` 的类型在 108–130、260 行；S8 加 `tools/post-execute`（先读 rc.3） | `tests/lessons-failure.spec.ts`、`tests/fake-rc3.ts`（269 行起的管线） | S8 |
| `src/glm-prompt/localize.ts` | `MEMORY_SECTION_DSH`（93 行起）改为由镜像行与本地常量拼出 | `tests/glm-prompt.spec.ts` | S5 |
| `src/glm-prompt/zcode-memory-text.ts` | 新建，登记进 `scripts/check-verbatim.mjs` 的 `MIRROR_FILES`（49 行） | `npm run check:verbatim`、`tests/check-verbatim.spec.ts` | S5 |
| `src/glm-prompt/index.ts` | `MEMORY_SECTION`（84）、节表（102）、`memorySectionApplies`（120）；汇报细度的 `persona` 配置（51、64）与 `personaSection(persona)`（98） | `tests/glm-prompt.spec.ts` | S5、S6 |
| `scripts/probe/run-probe.mjs` | `MEMORY_SECTION_LINE`（406）与 988 行的断言；加 `glm-memory`、`non-glm-memory`、`glm-memory-compact`、`glm-worker-memory`、`glm-lessons`、`non-glm-lessons`、`glm-lessons-failure`、`non-glm-lessons-failure` | `npm run probe` | S4–S8 |
| `src/lessons/index.ts`、`tools.ts`、`service.ts`、`notices.ts`、`import.ts`、`cli.ts`、`failure.ts`、`scripts/lessons/cli.ts` | 新建 | `tests/lessons-row.spec.ts`、`lessons-failure.spec.ts`、`lessons-seed.spec.ts`（新） | S7、S8、S11 |
| `scripts/packages.mjs` | `hourness.src`（54）加 `lessons`；`rows`（55–65）加 `glm-hourness/lessons`；`client.sources`（69）加 `ui/src/lessons/`（S10） | `npm run preflight` | S7、S10 |
| `packages/hourness/cordis.patch.yml`、`package.json`、`locale/lessons/{zh,en}.json` | 在 `memory` 行（约 30 行）之后加 `lessons`，`disabled: true`；导出 `./lessons`、`./lessons/locale/*.json`；locale 文件新建 | `npm run preflight` | S7 |
| `src/memory/signals.ts`、`learning.ts`、`src/shared/answer-marks.ts` | 新建 | `tests/memory-signals.spec.ts`（新） | S9 |
| `ui/src/lessons/LessonsPage.tsx`、`ui/src/graph/boards.ts`、`ui/src/hourness-client.tsx` | 新建、新建（main 上不存在）、改 | `tests/lessons-panel-model.spec.ts`（新） | S10 |
| `docs/DESIGN.md` | §2.2、§2.4、§2.4a、§2.5、§5.2、§5.3 ⑧、§5.8、§7 | 随行为提交 | S1、S4、S5、S7、S8 |
| `docs/ORCHESTRATION.md` | §8.1–§8.4（S4）、§8.5（S9）、§8.6 新（S7） | 随行为提交 | S4、S7、S9 |
| `docs/DEVELOPMENT.md`、`docs/ROADMAP.md` | §12 之后加命令行一节（S7）；M5 一节改成带节点 id 的表（S4） | 随行为提交 | S4、S7 |
