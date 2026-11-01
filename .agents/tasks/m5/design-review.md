# M5 设计评审（记忆与学习，连同经验板块）

评审对象：`.agents/tasks/m5/design.md`。
挡路标准：`docs/DEVELOPMENT.md` §1.1「评审挡路的标准」，只有三类发现挡路：验收条件没有满足；不可逆损失（丢数据、毁掉检出或用户 profile、对外的动作）没有预防；失败了没有途径发现、发现了没有恢复办法，或事后查不到原因。
严重度：挡路的发现记 HIGH 或 MEDIUM，其余一律记 NIT（非阻断）。结论按挡路条数机械判定：大于 0 为 CHANGES_REQUESTED。
宿主契约按 `reference/dsh-desktop-0.2.1-rc.3/` 逐项抽查，ZCode 文字按 `reference/ZCode/apps/zcode-cli/packages/core/src/` 核对。

## 轮次统计

| 轮次 | 设计版本 | 挡路（HIGH/MEDIUM） | 非阻断（NIT） | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 0.1（2026-10-29） | 2 | 11 | CHANGES_REQUESTED |
| 2 | 0.2（2026-10-29） | 2 | 3 | CHANGES_REQUESTED |
| 3 | 0.3（2026-10-29） | 1 | 4 | CHANGES_REQUESTED |
| 4 | 0.4（2026-10-30，对齐轮） | 2 | 9 | CHANGES_REQUESTED |
| 5 | 0.5（2026-10-31，对齐轮） | 0 | 8 | APPROVED |

## 第 1 轮（设计 0.1）

挡路 2 条（MEDIUM 2），非阻断 11 条（NIT 11）。

### 挡路的发现

#### R1-01 MEDIUM 像密钥的判据会拒收深层路径与长标识符，重新带回「带路径就存不进」（§5.6；牵连 §3.2 第 3 步、§4.2、§7.4，m5-1 验收第 2、3 条）

问题：`looksSecret` 的最后一条是「32 个以上连续的十六进制或 base64 字符」。base64 字母表含大小写字母、数字与 `/`，所以普通的正斜杠路径与长驼峰标识符都会命中：

- `reference/ZCode/apps/zcode-cli/packages/core/src/context/sections/memory.ts` 里的 `cli/packages/core/src/context/sections/memory`，45 个字符；
- `buildProviderEndpointRoutingHeaders`（`docs/DESIGN.md` §4.4），35 个字符；
- `stripTopLevelMarkdownHtmlComments`（ZCode `memory/index-content.ts`），33 个字符。

这样的正文、说明、经验的坑与解法，以及写成深层文件路径的 `source` 出处（D2 选 C 时 `project` 类必填），都会被拒为 `secret_like`，提示还是「write a short commit id」。证据与出处的豁免只认整项是 7–40 位十六进制。m5 节点要取消的正是这一类拒绝（`docs/ORCHESTRATION.md` §8.1「句子里带斜杠或文件名就被拒」、§8.4「取消基于路径与文件名的拒绝判据」）；本设计删掉了 `knowableFromGit`，却经密钥判据把一部分路径与文件名又挡在门外，m5-1 的这项验收没有满足。m5-1 验收第 2 条只测 `coding-plan/start-plan` 与 `src/shared/dsh-min.ts` 两个短串，测不出来。

要改：

1. 去掉「32 个以上 base64 字符」这条，换成令牌形状的判据：至少 32 个字符取自 `[A-Za-z0-9+=_-]`（不含 `/` 与 `.`），并且同时含数字、大写字母与小写字母。十六进制一条保留（正文里 32 位以上的十六进制仍判为像密钥，整项 7–40 位的提交号照旧豁免），命名前缀、`Bearer `、PEM 头三条不变。
2. L2 加两组固定用例。必须收下：上面两个路径分别作正文与作 `source`，上面两个标识符，`coding-plan/start-plan`，作 `source` 的 40 位提交号。必须拒收：`ghp_` 开头的令牌，40 个字符的大小写加数字混排令牌，PEM 头。
3. m5-1 验收第 2 条加一句：「含深层路径（如上例）与 32 字符以上标识符的正文与出处存得进去」。
4. 拒绝信息写出命中的是哪一类（前缀、令牌形状、十六进制、PEM），只在十六进制一类时建议写短提交号。

#### R1-02 MEDIUM 被拒为像密钥的候选经验会经 M7 的退路写进图并推到远端（§4.2 第 1、2 步，§8.1 的 `ProposeResult` 与「请 M7 改的四处」第 3 条，§7.2 `propose` 一行）

问题：`propose` 的结果只有两种：收下（`candidate`、`merged`、`dropped`）和 `{error}`。校验不过、像密钥、写失败都返回 `{error}`。M7 §3.5.5 的规则是「服务不在或失败时，在任务上批注 `[候选经验] <problem> → <fix>…`」，本设计 §8.1 第 3 条还请 M7 在这条批注末尾带上候选的完整 JSON。于是 M5 以 `secret_like` 拒收的候选，会被 M7 原样写进图节点文件；图由主 Agent 提交并推到 Gitee `origin`，要删就得改写历史，而 `docs/DEVELOPMENT.md` §9 不许强推。§5.6 与 §7.3「范围 `all` 的经验……令牌被带到别处」给出的拒收理由，在这条路上落空，令牌反而进了更公开、删不掉的地方。这是对外的、不可逆的动作，设计里没有预防。另外 §4.2 第 2 步导入批注时会再过一次 `looksSecret`，被拒之后写不写 `import` 记录没有写明，可能每个进程都重试一次。

要改：

1. 结果改为三种：

   ```ts
   export type ProposeResult =
     | { readonly status: 'candidate' | 'merged' | 'dropped', readonly id: string }
     | { readonly status: 'rejected', readonly code: 'invalid' | 'secret_like', readonly field?: string }
     | { readonly error: string }   // 只用于服务内部失败：busy、io、没有项目目录
   ```

2. §8.1 的清单加第 5 条请 M7 照做：只有 `{error}` 走退路批注；`rejected` 不写批注，只在交回摘要的批注里记一个计数与代码（「1 条候选经验被拒：secret_like」）。退路批注写进图之前，M7 用同一个纯函数 `looksSecret`（从 `src/data/secret-shape.ts` 导出，同包可导入）检查每个字段，命中的字段换成「（像密钥，已略去）」。经验服务整行不在时 M7 也这样做。
3. §4.2 第 2 步：导入时被拒的批注照样写一条 `import` 记录，`data` 为 `{rejected: <code>}`，保证只试一次；卫生检查（§4.9）列出它所在的节点。
4. L2 加用例：`propose` 收到带 `ghp_` 令牌的候选返回 `rejected`，假的 M7 退路没有被调用；退路批注里命中的字段被略去。

### 非阻断的发现

#### R1-03 NIT 锁的陈旧判定与释放会让两次写同时进行，第二条已确认的写被折叠当坏行丢掉（§5.3 第 2、5 步，§5.2「`seq` 不大于上一条」）

开机时刻「取到分钟」后比相等：真实开机时刻落在分钟边界附近时，两次计算可能差一分钟；用户或时间同步改了墙钟时，`Date.now()` 变了而 `os.uptime()` 不变，算出的开机时刻也跟着变。这时一把正被持有的锁会被判为陈旧并改名，第二个写者拿到新锁；第一个写者在 `finally` 里删掉的是第二个写者的锁。两者都按同一份状态算出同一个 `seq`，后写的一行被 §5.2 判为坏行，状态里没有它，而调用方已经拿到成功。概率很低，坏行会计数、留在文件里、行健康可见，所以不挡路。改法：开机时刻比较带容差（相差超过 120 秒才算不同）；锁文件内容带一个随机令牌，释放时先读出、令牌是自己的才删；折叠时 `seq` 重复的两行按文件顺序都应用，行健康报「seq 重复」，不把第二行当坏行。

#### R1-04 NIT 会话开局存储为空时，索引会在第一次写入后的下一步出现（§3.3）

注入条件逐步判定「存储里有生效条目，且可见历史里没有 `glm-hourness-memory`」。开局为空的会话在第一次 `memory_store` 之后，下一步两条都成立，索引在会话中途出现，与同节「会话中途存储变了，索引不变」相抵。消息追加在末尾，不碍缓存。改法二选一并写明：每个 agent 只在第一个合格的步与压缩检查点之后的第一步判定一次（加一个按 agent 的标记）；或者承认「开局为空时，第一次写入后出现一次」，m5-2 验收第 1 条随之改写，L2 加这一例。

#### R1-05 NIT `propose` 的上下文要 `session`，但请 M7 改的四处没有这一条（§8.1）

`LessonProposeContext.session` 是必填，M7 §3.5.5 的调用是 `propose(candidate, {task, childId, commit?})`。清单第 1 条只给 `relevant` 加了 `session`。漏了这条，编译期会报错，运行时若绕过则每次都走退路批注。改法：第 1 条写成「`relevant` 的查询与 `propose` 的上下文都加 `session`（主 Agent 的会话）」。

#### R1-06 NIT GLM 路由上 shell 调用的名字是别名 `Bash`，失败匹配与探针都按 `pwsh` 写（§4.4 第 2 步、§10.1 `glm-lessons-failure`）

方言把 `pwsh` 包成别名 `Bash`，`tools/post-execute` 看到的 `exec.name` 是 `Bash`，结果值是 `pwsh` 的值（`src/glm-prompt/aliases.ts` 的 `buildAlias` 沿用原生的输出 schema）。§4.4 写「原生名 `pwsh`、`bash`」，没有写先换算；探针让模型调 `pwsh`，而 GLM 工具面上没有它（按名调用能执行，却不是真实路径）。改法：第 2 步写明先 `toNativeTool(dialect, exec.name)`（`src/shared/dialect.ts`）再判 shell；探针在 GLM 场景调 `Bash`，非 GLM 场景调 `pwsh`。

#### R1-07 NIT `feedback` 缺省落在项目目录，模型拿不到选范围的提示（§3.2 `scope` 一行、§3.5 L1）

`docs/ORCHESTRATION.md` §8.2 的定案是「关于人的偏好放用户级目录」。设计让 `feedback` 缺省为 `project`，Memory 节的新增句与工具说明都没讲什么时候填 `all`，跨项目的个人偏好会散在各个项目里。不丢数据、可改。改法：`memory_store` 的 `scope` 参数说明加一句「`all` for preferences that apply in every project; `project` for this project's facts and norms」；缺省值不变。

#### R1-08 NIT D1 的「取决于」问了两件事，其中一件人已经定过；表外多了一行（§12）

第二问「经验只给建议、不拦任何调用，复发才提醒去提规则」是 `lessons` 节点正文里人自己的话，不用再问。「以后改起来很贵：……」与 D2 的「双向门：……」两行不在 `d-option-card` 的格式里，`weight` 按 §13 第 1 条写进图字段即可。改法：D1 的「取决于」只留「agent 从你的改动里推测的偏好不问你、14 天淡忘，你同意吗？」；两行 `weight` 说明移到 §13。

#### R1-09 NIT 会话投影的 `init` 是同步的，项目根的文件读要写明同步（§4.7「读」、§5.5）

rc.3 把 `init(header, inheritedEventCount)` 的返回值直接当状态存（session-projection:58、296、368），`wire.view` 也是同步的。§5.5 的 `projectRootOf(cwd, fs)` 只说「文件读注入」，没说同步还是异步；异步的版本放进 `init` 会把 Promise 当状态。改法：写明投影用同步读（`statSync`、`readFileSync`）的同一个函数，按 `cwd` 缓存；工具与提醒用的异步版本共用解析逻辑。

#### R1-10 NIT `subagent_fork` 的子 agent 继承父会话的历史，里面有索引与写着 `lessons_merge` 的候选提醒（§2.3、m5-2 验收第 3 条）

fork 的子会话以父日志为前缀（`isSeeded`，subagent:346–355），所以它的请求里会有记忆索引与 `glm-hourness-lessons-pending` 提醒，而它没有 `lessons_merge`。工具体按 `role` 拒绝，能自愈。改法：§2.3 写明这一点；m5-2 验收第 3 条注明「fork 子 agent 继承的历史里可以有索引」，免得 L3 判错。

#### R1-11 NIT 派发打分没有定义「通配对通配」（§4.3，lessons-4 验收第 2 条）

M7 传的 `paths` 是写入范围，多为通配（`docs/graph/**`），经验里存的也是通配。「经验的某个文件模式匹配任务的某个路径」在两边都是通配时怎么判没有写，lessons-4 验收第 2 条正好依赖它。改法：任务路径带通配时取第一个通配符之前的字面前缀；两边的字面前缀一方是另一方的前缀，或经验的模式匹配任务的字面前缀，就算命中（3 分）。L2 用 `docs/graph/**` 对 `docs/graph/**` 与 `docs/graph/nodes/x.json` 各测一次。

#### R1-12 NIT 经验 id 只在单个文件里唯一；范围 `all` 的复发记录跨项目互相抑制（§4.1、§4.6、§4.7）

`L-`、`C-` 加 6 位随机十六进制，两份流水各自生成，`/lessons delete <L-id>` 不带范围，撞号时目标不确定。`recur-notified` 写在经验所在的流水里：范围 `all` 的经验在一个项目里发过复发提醒，28 天内其他项目都不再发，与「每个项目每周」的口径不一致。改法：新 id 在两份流水里都查重，撞了重取；`recur-notified` 的 `data` 带项目根，判定按项目过滤。

#### R1-13 NIT harness 改写已有的细度偏好，权限表里要有这一行（§3.7 第 1 步、§7.5）

`reporting-depth` 第二次拨档时是「更新一条偏好且没有 `relay`」。§3.2 第 5 步的 `preference_owner` 写在 `memory_store` 的流程里，`model.ts` 的权限表怎样对待 harness 没有写。改法：权限表加一行「`harness` 可以 `store` 偏好，只限名字 `reporting-depth`，证据必须含会话 id 与调用 id」；同时写明观察监听器不等写入完成（不让 `design_review` 的结果多等至多 2 秒的锁）。

### 核实过的假设

宿主（rc.3）：

- `tools/post-execute` 瀑布与决定的形状：`accept` 可带 `content` 或 `value`（两者不能同时），`block` 带 `feedback`，两者都可带 `additionalContexts`，与结果已有的合并；监听器抛错由外层捕获变成错误结果（tools:3588–3628，3597 的注释）。
- 被 `tools/pre-execute` 拒绝的调用以 `post-result` 继续，走 post-execute；工具体抛错同样走（tools:3337–3353、3416–3420）。
- `additionalContexts` 经 `acceptContext` 进下一步（agent-loop:504–506、572）；DSH 自己的 repeat-tool-reminder 在同一接缝追加 notice 并保留下游的上下文（repeat-tool-reminder:2247–2260）。
- `pwsh` 结果值 `exitCode`、`timedOut`、`aborted`、`stdout{text,truncated}`、`stderr{…}`（tool-pwsh:267–290）；`bash` 同形（tool-bash:303）。
- cordis：`prepend` 用 `unshift`、其余 `push`（cordis:335–345）；瀑布从列表头开始，最外层先跑（cordis:317–325）；分发按 `Context.filter` 过滤作用域（cordis:258–264）；`ctx.inject` 在依赖到达时起子 fiber（cordis:1597–1605）。由此，不带 `prepend` 的子 agent 过滤监听器在方言的 `prepend` 监听器之内，`memorySectionApplies` 看到的是过滤后的工具（组合效果仍按 U3 在 L3 核对）。
- `system-prompt/assemble` 瀑布与 `assembly.tools`（system-prompt:356–405）。
- `agent/created` 是 serial（agent:581–585）。
- 子会话头带父会话的 `cwd`、`parentSession`、`origin: 'subagent'`（subagent:346–355）；会话头 `origin` 只能是 `subagent`（session:1051–1053）；`cwd` 来自 `meta`（session:1820–1826）；`deriveMessages()`（session:1672）。
- 会话投影：`session/created` 且 `seq === 0` 时调 `init(header, inheritedEventCount)`，懒建与检查点恢复也调 `init`（session-projection:51–63、296、368、377）；`register` 的字段（68–102）；`snapshot`（约 141）。
- `remote.workspaceFiles`：文件的读与监视可以指向工作区外，按组合文件系统的读权限；目录列举与目录监视限在工作区；整文件读上限 32 MiB（`dsh-api-workspace-files/README.md`）。
- 命令名的正则与定义校验（commands:148–180）；`recordInput` 不为 `false` 时命令事件记下 `args`，来源 `user`（commands:337–339）。
- 子 agent 调 `userQuestions.ask` 报 `DELEGATED_CALLER`（user-questions:534）。
- `agent-instructions` 的候选文件是 `AGENTS.md`、`CLAUDE.md`（agent-instructions:17），Z8 原句里的 `CLAUDE.md` 在 DSH 里成立。

ZCode：

- Memory 节全文、四类定义、frontmatter、`[[name]]`、写入纪律与召回句（`context/sections/memory.ts`:30–64）；Z7、Z8、Z9 在源码里是同一个字符串，按 §3.5 的「恰好替换一次」做法可行。
- 索引在用户上下文，前一句「Contents of …/MEMORY.md (user's auto-memory, persists across conversations):」（`context/sections/request-user-context.ts`:73–85）。
- 索引上限 200 行、25,000 字符与截断警告（`memory/index-content.ts`:3–4、37）。

本仓库与相邻设计：

- `memorySectionApplies`（`src/glm-prompt/index.ts`:117–120）；`MEMORY_SECTION_DSH` 的内容与「memory_store refuses such entries」（`src/glm-prompt/localize.ts`）；`glm:persona` 在 `installDialect` 里按 agent 一次算出（`src/glm-prompt/index.ts`:184），所以按会话冻住的细度可行。
- 常驻名单已含三个记忆工具（`src/shared/tool-names.ts`）；`toNativeTool`、`ZCODE_ALIAS_NATIVES`（`src/shared/dialect.ts`）。
- 现有存储：衰减公式、新条目 `reviews` 从 1 起、读不出的旧文件报错而不重置（`src/memory/store.ts`）；记忆行今天只 `inject` `tools`，没有 `home` 时关工具（`src/memory/index.ts`）。
- `installStepNotice` 在 `next()` 之后把 notice 追加到本步消息末尾，notice 留在会话里（`src/shared/step-notice.ts`）。
- 探针常量 `MEMORY_SECTION_LINE`（`scripts/probe/run-probe.mjs`:374）；`dataRows`（`scripts/sandbox.mjs`:121）被标定运行器调用（`scripts/calibrate/run-calibrate.mjs`:103）。
- M7 §3.5.5 的 `relevant`、`propose` 签名与退路批注，`hourness-handback-v1` 的 `lessons` 没有 `errors`、`scope`（M7 §3.6.1）。
- M3 `design_review` 输出的 `outcome`（含 `more-detail`、`to-the-point`）与 `depth`，`answerPhrase`，`mainAgentActive`、`hournessMainAgent`（M3 §3.1.2、§3.4）。
- plain-ui 的板块登记表 `ui/src/graph/boards.ts` 与 `Board` 接口，`id` 目前是 `'rules' | 'lessons'`（plain-ui §7.6）。
- 第一批经验的证据：提交 `cae6ddf`（2026-10-29，改的是 `docs/graph/nodes/recommend-last.json`）；`recommend-last` 2026-10-29T11:39 与 `orch` 2026-10-29T12:41 的批注；`m1-parity` 的蓝屏批注；`docs/HANDOFF.md` §6 的编码、模型菜单、gitleaks、探针与标定不同时运行四条；`docs/DEVELOPMENT.md` §7 的各行。

### 未核实或有误的假设

- 有误：§5.6 认为 32 字符以上的 base64 串只会是密钥，实际会命中普通路径与标识符（R1-01）。
- 有误：§8.1 的四处改动足以接上 M7；`propose` 的上下文还缺 `session`（R1-05），拒收与失败没有分开（R1-02）。
- 有误：§4.4 与探针按原生名 `pwsh` 看 GLM 路由上的 shell 调用（R1-06）。
- 未核实：开机时刻取到分钟能稳定区分「同一次开机」（R1-03）。
- 未核实（本轮没读）：用户 profile 补丁第 67–69 行记忆行的 `home`；设计说只读看过，本评审未复核。
- 设计 §14 的 U1–U13 都已标为推断并给了核实层与退路，本评审同意它们的分类；其中 U1（host 级 post-execute 看得到子 agent 的调用）、U3（过滤与方言的组合）、U4（桌面版读工作区外的文件）对验收影响最大，L3、L4 要按设计写的场景核对。

### 设计依据的学科（§2.0）对照

- 可靠性工程与数据库：只追加日志、折叠、独占创建锁与坏行恢复，做法成立；锁的释放与陈旧判定见 R1-03。
- 认知心理学：偏好与事实分开衰减，沿用现有公式，成立。
- 提示词工程：Memory 节以 ZCode 原句为主、镜像文件进逐字门禁、索引放用户上下文，贴训练分布，成立。
- 事故复盘与知识管理：每条经验带证据与最近确认，第一批的证据已核实。
- 安全工程：最小权限（子 agent 只读经验、工具体再查调用方）成立；密钥拒收的出口不完整，见 R1-02。
- 认知负荷：人只看与删，M5 不新增给人的待决；D1 可再减一问，见 R1-08。

## 第 2 轮（设计 0.2）

挡路 2 条（MEDIUM 2），非阻断 3 条（NIT 3）。第 1 轮的 13 条全部关闭。

### 第 1 轮发现的复核

| 编号 | 状态 | 依据 |
| --- | --- | --- |
| R1-01 | Closed | §5.6 改为令牌形状判据（不含 `/` 与 `.`，同时有数字与大小写字母），返回类别，拒绝信息按类别写；两组固定用例；m5-1 验收第 2 条补上深层路径、长标识符与作出处的 40 位提交号 |
| R1-02 | Closed | `ProposeResult` 分三路（§4.2 第 1 步、§8.1）；§8.1 第 5 条：只有 `{error}` 与服务不在时写退路批注，写前逐字段过 `looksSecret`；导入被拒也写 `import` 记录；§7.3 新增一行；§14 U14 把第 5 条写成 M7 交回处理的合入条件 |
| R1-03 | Closed | `boot` 取毫秒、相差超过 120 秒才算陈旧；锁里带 `token`，释放时核对；`seq` 重复或回退的行照样应用并计入 `seqAnomalies` |
| R1-04 | Closed | 选「承认」，§3.3 写明理由；m5-2 验收第 1 条改写；§7.6 加用例 |
| R1-05 | Closed | §8.1 第 1 条：`relevant` 与 `propose` 都加 `session` |
| R1-06 | Closed | §4.4 第 2 步先 `toNativeTool`；探针分 `Bash`（GLM）与 `pwsh`（非 GLM）两个场景 |
| R1-07 | Closed | §3.2 `scope` 的参数说明 |
| R1-08 | Closed | D1 的「取决于」只留一问；`weight` 移到 §13 第 1 条 |
| R1-09 | Closed | §5.5 分出同步版本，§4.7 的 `init` 只算路径；另核对了检查点恢复（见下） |
| R1-10 | Closed | §2.3 与 m5-2 验收第 3 条写明 fork 继承的历史 |
| R1-11 | Closed | §4.3 的 `pathsMeet`、`globMatch` 与字面前缀规则，L2 用例 |
| R1-12 | Closed | id 在两份流水里查重；命令可带范围；`hit`、`into`、`recur-notified` 带项目根，复发按项目计 |
| R1-13 | Closed | §7.5 权限表的 `harness` 一行；§3.7 第 1 步写明不等写入完成 |

### 挡路的发现

#### R2-01 MEDIUM harness 自己补的证据 `commit:<sha>` 会被十六进制一类判为像密钥，带完整提交号的交回候选整条被拒（§4.1 `Candidate.evidence`，§4.2 第 1 步，§4.2.2 `new`、`into`，§5.6「哪些字段过它」与提交号例外，§7.4 `lessons_merge` 一行）

问题：§4.1 写 harness 给候选补上 `task:<id>`、`session:<childId>`、`commit:<sha>` 三种证据；§5.6 规定候选「证据的每一项」都过 `looksSecret`，提交号的例外只认「整项是 7–40 位十六进制」。`commit:` 加 40 位十六进制不是整项十六进制，而 `hex` 一类的判据是「至少 32 个连续的十六进制字符，前后不是 `[A-Za-z0-9]`」，冒号不在其中，于是命中。M7 交回的提交号按 7–40 位十六进制校验（M7 §3.6），worker 交回的多是完整的 40 位。照 §5.6 的字面实现，凡是上下文带完整提交号的交回，候选经验都返回 `rejected: secret_like`（`field: evidence`）。即使 `propose` 只查调用方给的字段，主 Agent 用 `lessons_merge new {candidate}` 或 `into` 时证据取自候选，§7.4 又给 `lessons_merge` 列了 `secret_like`，同样被拒，`into` 还要把这条证据追加进已有经验。经验板块的主来源是 worker 交回（`lessons` 节点），lessons-1 验收第 2、3 条在真实交回上不成立；§5.6 的固定用例只有裸提交号，L2 测不出来。

要改：

1. 证据项写成一套固定写法：`commit:<7–40 位十六进制>`、`task:<id>`、`session:<id>`、`node:<id>`、`call:<id>`、`command:<id>`，以及文档节与路径。§5.6 的提交号例外改为「整项是 7–40 位十六进制，或 `commit:` 后接 7–40 位十六进制」，两种都不判 `hex`；`commit:` 后面不是 7–40 位十六进制时按 `invalid` 拒（`field: evidence`）。记忆的 `source` 同样认这两种写法。
2. 也可以让 harness 补证据时只写 12 位短提交号（`commit:<前 12 位>`）。推荐第 1 条，两条可以同时做。
3. §5.6 的「必须收下」加：候选证据 `commit:` 加 40 位十六进制。§7.6 加用例：`propose` 的上下文带 40 位 `commit` 时返回 `candidate`；对这条候选做 `lessons_merge new {candidate}` 与 `into` 都成功。lessons-1 验收第 2 条加一句「上下文带完整提交号的候选成为候选」。

#### R2-02 MEDIUM 按 §3.5 写定的文字，Memory 节的原样字符约占 68%，m5-3 验收第 1 条的 70% 下限达不到（§3.5 表的 Z2、Z6、L1、L2 与「实现」段，§1.2 m5-3 第 1 条，§1.3）

问题：照 §3.5 的表把节拼出来（Z1；Z2 的改写句；代码块里 Z3 的四行，正文一行前加 `body: `；Z4；Z5；Z6 的改写句；Z7–Z9 那一段做两处替换；L1；L2），全节约 2,220 个字符（含换行），其中 ZCode 原文（ZCode context/sections/memory.ts:34–59，Z7 去掉被替换的 `existing file`、`update that file`，代码围栏算原样）约 1,510 个字符，占 68%。GLM 主 Agent 上 `lessons_query` 常驻，L2 一定出现；不带 L2 也只有 71%。§3.5「改后估计约 75%」与 §1.3「约 2,400 字符」都与此不符。D1 步（§9.1）照设计写完文字后，按 m5-3 验收第 1 条判占比的 L2 测试必然失败，实现者只能自己改文字或改阈值，验收在设计给定的文字下满足不了。占比怎样算（含不含换行、条件句算不算、代码围栏算不算原样）也没有写，两个实现者会算出不同的数。

要改（二选一，写进 §3.5 与 m5-3 验收第 1 条）：

1. 保留下限，写明算法并下调：「原样字符 = §3.5 表中标原样的各项在节里出现的字符数（Z7 去掉两处被替换的词）；分母 = 全节字符数（含换行），按所有条件句都出现时计；不低于 65%」；§1.3 与 §3.5 的估计改为约 2,200 字符、约 68%。
2. 去掉占比，只留逐句断言（每个标「原样」的句子整句出现在节里），再加一条白名单断言：节里不是原样的文字只有 Z2、Z6 的改写句，Z3 的 `body: ` 前缀，Z7 的两处替换，L1 与 L2。

推荐第 2 条：占比随 L1 的措辞浮动，白名单直接钉住「只改了这几处」，更贴「贴训练分布」的本意。

### 非阻断的发现

#### R2-03 NIT 退路批注只在每个进程第一次算候选提醒时导入，宿主运行期间新写的退路批注要等下一次重启（§4.2 第 2 步）

M7 走退路的时机正是经验服务返回 `{error}`（`busy`、`io`）的时候，这时宿主还在跑；按「每个进程对每个项目第一次」导入，这些候选在桌面版重启之前进不了候选提醒。批注在图上，不丢，所以不挡路。改法：导入的触发改为「图的修订变了」（经图服务读当前修订，与上一次导入时不同才重扫），或在 `propose` 失败之后的第一次成功时补扫一次；`import` 记录已保证同一条只试一次。

#### R2-04 NIT `depth(sessionId)` 是同步函数，「第一次问到时从存储读出」没有写读法（§3.7 第 2 步、§8.6）

`MemoryService.depth` 的返回值是同步的，§5 的读路径（`stat`、整读、折叠）是异步的。实现若用异步读加缓存，宿主重启后的第一个会话在缓存热起来之前拿到 `undefined`，回到配置的默认档，m5-5 验收第 1 条时好时坏。改法：写明 `depth` 用同步读（`statSync`、`readFileSync`，同 `projectRootOfSync` 的做法，只读用户级记忆流水并折叠），或记忆行激活时预读用户级状态、之后按 `stat` 变化刷新，`depth` 只读这份状态。

#### R2-05 NIT 不在 git 仓库里的工作目录也被当成项目根，会在那里建 `.llm/`（§5.5）

「找不到 `.git` 时用 `cwd` 本身」只排除了用户主目录与盘符根；在桌面、下载这类文件夹里开的会话，第一次写 `project` 记忆或经验就在那里建 `.llm/`。不丢数据、不对外，所以不挡路。改法：没有 `.git` 时只在 `cwd` 下已有 `.llm/` 时把它当项目根，否则没有项目（`project` 范围 `no_project`，`all` 照常），行健康写明原因。

### 核实过的假设（本轮新增）

- tools:3337–3353：被 `tools/pre-execute` 拒绝的调用以 `post-result` 继续，带 `isError` 与拒绝文字。tools:3588–3628 `postExecute`：`accept` 不能同时换 `value` 与 `content`，失败结果不能换 `value`，`additionalContexts` 与结果已有的合并，监听器抛错由 `execute` 外层的 try/catch 变成错误结果。§4.4 只追加 `additionalContexts`、自己接住异常，成立。
- session-projection:51–63、292–298、366–374：`init` 的返回值直接当状态；从检查点恢复时状态取 `stateSchema.parse(row.val)`，没有可用的检查点行才调 `init`。投影只存路径与问题（字符串），可序列化，§4.7 的同步 `init` 成立。
- subagent:346–355 `childSessionMeta`：子会话头带父会话的 `cwd`、`parentSession`、`isSeeded`、`origin: 'subagent'`，§2.3 对 fork 的描述成立。
- session:1798–1823：会话 id 是 `session-<序号>` 或调用方给的 id；session-controller 用 `session-${randomUUID()}`（dsh-api-session-controller:509、879），小写十六进制加连字符，不命中 `token` 与 `hex`；§5.6 把它列进「必须收下」，一致。
- `dsh-api-workspace-files/README.md`:12、40、58、65：文件的读与监视可指向工作区外，目录列举与目录监视限于工作区，整读上限 32 MiB。
- `src/shared/dialect.ts`：`ZCODE_ALIAS_NATIVES` 把 `Bash` 映射到 `pwsh`，`toNativeTool` 在方言服务不在时回落到它，§4.4 第 2 步成立。
- `scripts/packages.mjs`：`data` 在 `dsh-hourness` 的 `src` 里，同包的 M7 交回处理能导入 `src/data/secret-shape.ts`，§8.1 第 5 条可行。
- `src/memory/index.ts`：今天只 `inject` `tools`，`home` 缺省时关工具，`knowableFromGit` 是行配置；`src/shared/data-home.ts` 的 `dataHomes` 让行 `home` 优先于数据服务。§3.2、§5.1、§7.1 对现状的描述一致。
- M7 设计 §3.5.5：`relevant` 与 `propose` 现在都没有 `session`，退路批注不分拒收与失败，与 §8.1 请 M7 改的五处对得上。
- ZCode context/sections/memory.ts:34–59：Z1–Z9 的原文与 §3.5 的表一致，Z7、Z8、Z9 同在第 59 行一个字符串里。

### 未核实或有误的假设（本轮）

- 有误：§5.6 默认证据里的提交号都以整项十六进制出现，而 §4.1 harness 自己写的是 `commit:<sha>`（R2-01）。
- 有误：§3.5 与 §1.3 估计全节约 2,400 字符、原样约 75%；按表拼出约 2,220 字符、原样约 68%（R2-02）。
- 未核实：U1–U13 维持第 1 轮的判断。U14（M7 按 §8.1 第 5 条实现）是 R1-02 落地的前提，设计已把它写成 M7 交回处理的合入条件，并给出 M7 先合入时的补救顺序，本轮同意。

## 第 3 轮（设计 0.3）

挡路 1 条（MEDIUM 1），非阻断 4 条（NIT 4）。第 2 轮的 5 条全部关闭。挡路条数按轮为 2、2、1。本轮唯一的挡路发现来自设计 0.3 写成前后人新定的出题规矩，与存储、接缝和提示词无关。

### 第 2 轮发现的复核

| 编号 | 状态 | 依据 |
| --- | --- | --- |
| R2-01 | Closed | 新增 §5.7 证据与出处的写法和 `checkRefs`：`commit:` 加 7–40 位十六进制与裸写的提交号都不判 `hex`，`commit:` 后面不合语法按 `invalid` 拒；`session:`、`call:`、`command:` 只判 `prefix`、`bearer`、`pem`；harness 拼证据前按语法查，不合的那一项不写、候选照收并在 `notes` 里写明；`lessons_merge new {candidate}` 与 `into` 经同一函数（§4.2.2）。§5.6 的固定用例、§7.6 的 L2 用例、lessons-1 与 m5-1 验收第 2 条都补上 |
| R2-02 | Closed | 选第 2 种：去掉占比，§3.5 写定全文，加三条 L2 断言（全文、逐句、白名单）。本轮把 §3.5 的全文从设计里取出来量过：2,220 字符、21 个换行，去掉 L2 为 2,121，与设计一致。按 §3.5 写的白名单步骤（跳过四句本地文字、去掉 `body: `、Z7 两处换回原词、去掉行首空白）处理之后剩 10 行，与 ZCode context/sections/memory.ts:34–59 里保留的 10 行逐一相等、次序相同，断言在写定的文字上成立 |
| R2-03 | Closed | §4.2 第 2 步：每个进程第一次算候选提醒时扫；之后距上次检查超过 60 秒时按 `LoadedGraph.revision` 判是否重扫；`propose` 返回 `{error}` 之后不等 60 秒。lessons-1 验收第 7 条与 §7.6 补上 |
| R2-04 | Closed | §3.7 第 2 步与 §5.2：`journal.readSync`（`statSync`、`readFileSync`）与异步读共用缓存和折叠；读失败返回 `undefined` 并告警；§7.6 加「新进程第一次调用就读出」 |
| R2-05 | Closed | §5.5 分出 `projectDirOf`：不在 git 仓库里时只认已有的 `.llm/`，否则 `no_project`、不建目录，行健康写明怎样开启；主目录与盘符根在这一层排除 |

### 挡路的发现

#### R3-01 MEDIUM 待人定的两题没有照人 2026-10-29 新定的出题规矩写，D2 有两处文字超过引擎的卡面上限（§12；牵连 §13 第 1 条）

问题：

1. 人 2026-10-29 在 `d-option-card` 上补了两条规矩（批注 15:11:31Z 与 15:20:56Z；第一条同见 `.agents/tasks/design-context.md`「Questions for the person carry their background」，第二条只在图上）。第一条：给人的每道题先用两三句人话交代前因后果，说清关于系统的哪一块、从哪个决定或发现来的、为什么要人定而不是 agent 定，再给表；内部叫法不单独出现，节点 id 只和它的人话标题一起出现。第二条：题目里不出现人没学过的术语（验收、标定、补遗、改写语句），非用不可时当场用一句话解释。批注写明「各设计的待人定一节照此写」。按文件时间，0.3 稿最后保存于本地 23:15，在第一条（23:11）之后、第二条（23:20）之前。§12 没有照做：
   - D1、D2 都直接从「题目」开始，没有前因后果，也没写为什么要人定。
   - D1 的题目与选项用「验收」「验收条件」，没有解释；「取决于」里有 `m5-1`、`m5-4`，没有人话标题；选项 A 的代价写「要读 §1.2 的 9 行」，指的是文档的节，没有说那是什么。
   - D2 的题目带「（阅读摘要 C5）」；选项 A 的代价用「ZCode 的四类」「Memory 节的类型句」「`graph_comment`」，都是人没学过的叫法。

   人的原话是「没头没脑的来一句我不明白啊」。本设计的交付要求里有「待人定的事项，表格版」，按图上人定的出题规矩写是这一项验收的一部分，所以挡路。

2. 引擎的卡面上限：`src/graph/schema.ts`:55 的 `CARD_LIMITS` 规定 `label` 20、`gain` 60、`cost` 60、`crux` 60、`verdict` 120（按码点），`src/graph/engine.ts`:313–320、393–401 超出即拒。按 §12 原文量：D2 的「取决于」76 个码点，选项 A 的代价 80 个码点，都超出；§13 第 1 条让编排者「照这一节的字段写」，这两处写不进图。D1 各项都在上限内（取决于 44，代价至多 24）。

要改：

1. §12 每题开头加两三句人话，说这题关于系统的哪一块、从哪来、为什么要人定。D1 的例子：「这次设计把记忆与经验板块拆成 9 个小任务，每个任务做完时要满足的条件写在任务上。任务做完的标准只由你定，这是项目规则里必须问你的第 1 类。」「验收」第一次出现时用一句话解释，或换成「完成标准」；`m5-1`、`m5-4` 换成人话（「从你的改动里推测偏好」「学习流水线」），要留 id 就跟在人话标题后面；「§1.2 的 9 行」换成「设计里列的 9 条完成标准」。
2. D2 同样补前因后果。「阅读摘要 C5」去掉，或换成一句人话（「一份外部资料建议记忆只存做法与偏好，事实放在人审过的文档里」）。选项 A 的代价换成人懂的话并缩到 60 个码点以内（例「agent 想记的项目事实要先写进图或文档」）；「取决于」缩到 60 以内（例「项目里的事实，你是否只认图和文档，不要记忆里另记线索？」）。
3. D2 写明为什么要人定。§13 第 1 条给它的 `weight` 是 `two-way`；决策分级（`docs/ORCHESTRATION.md` §2.9.1）只有五类必须问人，`design-context.md` 也写「可逆的细节自己定，记成 agent 的决定」。写得出它属于哪一类就写明；写不出就把 D2 移到 §11，按推荐的 C 由 agent 定、人可推翻，§12 只留 D1，§3.2 末尾「D2 选别的选项时」一段与 §13 第 1 条随之改。
4. 改完逐项量长度：`label` 至多 20，`gain`、`cost`、`crux` 至多 60，`verdict` 至多 120 个码点。

### 非阻断的发现

#### R3-02 NIT §13 第 1 条的过渡写法现在会被引擎拒绝（§13 第 1 条）

`card-fields-table` 已合入（`e22282f`，`d-option-card` 2026-10-29T13:59 的状态记录），引擎认 `label`、`gain`、`cost`、`crux`、`verdict`、`weight`；新题的选项带 `consequence` 时引擎拒绝（`src/graph/engine.ts`:312「consequence is kept only on questions written before the table card」）。§13 第 1 条「表格版字段要等 card-fields-table 合入后引擎才认……在那之前……得到与代价合进选项的 consequence」已过时，照做会被拒。引擎报错并给正路，所以不挡路。改法：删掉过渡写法，写明直接写表格版字段。

#### R3-03 NIT 导入批注的 `import` 记录写进哪份流水、查重查哪份，没有写（§4.2 第 2 步）

批注末尾的 JSON 可以带 `scope: 'all'`，导入出的候选进用户级流水。`import` 记录写在哪一份、扫描时「还没导入过」查哪一份，设计没有写。实现若把记录写进候选所在的流水，而查重只看本项目流水，范围 `all` 的批注在候选离开 `open` 之后（`duplicateOf` 只比开着的候选）会在每个进程里再导入一次。重复的候选看得到、能丢弃，所以不挡路。改法：`import` 记录一律写进图所在项目的流水（图按项目），查重只看这一份；`data` 带导入出的候选 id 与范围。

#### R3-04 NIT `propose` 对「情况」的必填要求与 §4.1 不一致（§7.4 `propose` 一行；§4.1、lessons-1 验收第 1 条）

§4.1 与 lessons-1 验收第 1 条写「情况四项至少一项非空」，§7.4 写「`files`、`commands`、`tools` 至少一项非空」，不含 `errors`。只带报错片段的候选，两处判法相反。改法：§7.4 改为四项（含 `errors`）至少一项非空。

#### R3-05 NIT `childId` 不合语法时 `session:` 证据怎样取，没有写（§4.1 候选证据一段）

同一段写「不合语法的那一项不写」，又写「`session:` 一项总在」。`childId` 不合 §5.7 的语法时，是改用 `context.session` 的 id 还是不写这一项，没有说。rc.3 生成的会话 id 都合语法（session:1802，api-session-controller:509、879），实际很难碰到。改法：写明「`childId` 不合语法时用 `context.session` 的 id」。

### 核实过的假设（本轮新增）

宿主（rc.3）：

- agent-loop:509–516：`executeToolCalls` 把模型返回的 `block.id` 原样作 `exec.callId`，§5.7 不假定调用 id 短于 32 个字符的理由成立。
- session:1799–1804：没给 id 时会话 id 是 `session-<序号>`，给了就原样用；api-session-controller:509、879 用 `session-${randomUUID()}`。小写十六进制分组加连字符，没有 32 位以上的连续十六进制，§5.6 把它列进「必须收下」一致。
- commands:379–385：命令调用带 `commandId` 与 `agent`，§3.4、§4.7 的 `commandId` 留痕可行。
- tools:3406、3637–3641：工具体收到 `(exec.arguments, exec)`；返回值按输出 schema 校验，不合格抛 `ToolOutputError`。tools:3599–3600：`postExecute` 的瀑布按 `scopeTarget(this, exec.agent)` 分发，与 §6 和 U1 的描述一致。

本仓库：

- `src/graph/schema.ts`:194–196：`ID_PATTERN` 为 `^[a-z][a-z0-9-]{0,47}$`，`COMMIT_PATTERN` 为 `^[0-9a-f]{7,40}$`（只认小写；§5.7 写不分大小写、存为小写，与它兼容）。
- `src/graph/parse.ts`:17–23：`LoadedGraph` 有 `revision`（各节点文件修订号的摘要）；`src/graph/engine.ts`:54–55：`GraphEngine.load()`；`src/graph/service.ts` 的图服务只给 `dirFor(cwd)` 与 `isGraphTool`；`scripts/packages.mjs`:52 里 `graph` 与 `data` 同在 `dsh-hourness` 的 `src`。经验行可以经 `dirFor` 取目录、再用同包的 `openEngine(dir).load()` 读修订，§4.2 第 2 步可行。
- `scripts/check-verbatim.mjs`：`MIRROR_FILES`（43 行）、`MIN_LINE = 13`（46 行）；镜像文件的每个字面量按行去掉首尾空白，13 个字符以上的行要在 3.16.3 安装包或 `reference/ZCode` 源码里出现；镜像文件的值导入只许来自镜像文件（`importProblems`）。§3.5「更短的三行由全文与白名单断言管」成立。
- ZCode context/sections/memory.ts:34–59：按 §3.5 的全文与白名单步骤实际比对通过（见上表 R2-02）。
- `src/graph/schema.ts`:55 的 `CARD_LIMITS` 与 `src/graph/engine.ts`:312–320、393–401 的拒绝（R3-01、R3-02）。
- `d-option-card` 的两条批注（2026-10-29T15:11:31Z、15:20:56Z），以及 `.agents/tasks/design-context.md` 里与第一条对应的「Questions for the person carry their background」一节（R3-01）。

### 未核实或有误的假设（本轮）

- 有误：§12 的文字都写得进卡面；D2 的「取决于」76 个码点、选项 A 的代价 80 个码点，超过 60 的上限（R3-01）。
- 有误：§13 第 1 条认为引擎还不认表格版字段；`card-fields-table` 已在 `e22282f` 合入，新题带 `consequence` 反而被拒（R3-02）。
- 未核实：U1–U14 维持前两轮的判断。U15（模型服务的调用 id 合 `call:` 的语法）是本轮新增的推断，设计给了 L3 的核实处与退路（不合语法时写 `call:sha-<16 位>`，拨档照样记下），本轮同意它的分类。

### 设计依据的学科（§2.0）对照（本轮）

- 可靠性工程与数据库：证据写法统一之后，拒收、收下与失败三路在 `propose`、`lessons_merge`、导入三处判法一致；导入记录的落点见 R3-03。
- 提示词工程：白名单断言把「不是 ZCode 原文的只有这几处」钉成可执行的检查，比占比更贴训练分布的本意。
- 认知负荷：M5 不新增 harness 给人的待决，成立；给人的两道题还没照人新定的出题规矩写（R3-01）。

## 第 4 轮（设计 0.4）

挡路 2 条（MEDIUM 2），非阻断 9 条（NIT 9）。第 3 轮的 5 条（R3-01 至 R3-05）全部关闭。挡路条数按轮为 2、2、1、2。

本轮评审人不是 0.4 的作者。0.4 第一次对着已放行的邻居设计（M3 附录 0.5、M7 0.6、规则板 0.10、循环板 0.6、plain-ui 0.7）、CHARTER 0.7 和图上的新定案（`d-memory-scope`、`m5` 与 `lessons` 节点的批注）核对。两条挡路的发现都出在这次新对齐的接缝上：学习信号读的图历史形状，和 M7 周报没有的一节。第 1 至 3 轮已关闭的条目没有回退。

### 对照分支 B 的要点与共用规矩

| 要点 | 结果 | 依据 |
| --- | --- | --- |
| `d-memory-scope`：关于人本人的记忆留用户级，项目经验（含通用的坑）进项目 | 落实，一处缺省值留 NIT（R4-03） | 经验没有范围字段和用户级流水；`all` 只给 `user`、`feedback`；`reporting-depth` 强制 `all`；第一批 21 条全进项目；与 CHARTER 0.7 §9 的存放表、`d-memory-scope` 节点正文一致 |
| plain-ui 0.7 对 `lessons` 节点的批注：页面无写入控件，删除与恢复在对话里说，`/graph-apply` 已删 | 落实 | §4.7 重写；板块登记表照 plain-ui 0.7 §4.7 的 `subscribe`、`snapshot`、`BoardState`；`lessons_merge` 加 `delete`、`restore`（必须带 `relay`）；L2 静态检查对应 plain-ui 0.7 §1.4 验收第 7 条 |
| `m5` 节点裁定：一份项目根模块、一份锁模块，需要时给已有模块加选项 | 落实 | §5.5 写明用不到注入或异步（`projectOf` 同步，投影 `init` 要同步，测试用真实临时目录），只在 `src/data/project-root.ts` 加 `projectDirOf`、`ensureProjectDir` 两个函数；锁只传 `LockOptions`；已对着两个源文件逐项核对（见下） |
| 规则板撤回「请 M5 改第 7 条经验」 | 落实 | §4.8 第 7 条原文保留，并写明它说的是写在代码里的 guard 规则；与 CHARTER 0.7 §3.2 第 3 条、§6 一致 |
| D1 按规矩 6 重写 | 符合，两处措辞留 NIT（R4-10） | 标题加四段，标签不加粗，每行一处加粗、一句话，问题在最后，一件；按 M3 附录 0.5 §3.3 的 `proposalLineRefusal` 量过：背景 27、推荐 22、疑问 29、不做 26 个码点（限 40，背景限 60），加粗 3、5、12、7 个码点（限 2 至 12），题目 21 |
| 规矩 1：落实定案、修开着的发现，不另立方向 | 汇报细度闭环的新做法是 agent 决定，已记 §11 与 §15，可逆，接受；R3 五条已修 | §3.7；R3-01 至 R3-05 见下表 |
| 规矩 2：不改已放行设计，要改的写成 `m7` 等节点上的批注 | 一处遗漏 | 对 M7 去掉 `scope` 的请求有；M5 依赖 M7 周报的那一节没有请求，见 R4-02 |
| 规矩 3：留旧稿、记改动对应的定案或发现 | 符合 | `design-0.3.md` 是 0.3 原文；§15「0.4」逐条对应；行内仍有大量对 0.3 的叙述，见 R4-08 |
| 规矩 7、8：例子不用记账一类领域；文档无人设与语气词 | 符合 | 全文检索「记账」「ledger」「bookkeeping」「invoice」「budget」等与「喵」均无命中；索引示例与提醒示例是命令与签名规则一类 |
| 规矩 9：`graph-ops-align.json` 是纯数组、中文、`comment` | 格式符合，内容与 §13 对不齐，见 R4-09 | 6 项，节点 id `m5`、`lessons`、`m7`、`bootstrap`、`ablation`、`prompt-fixes` 都存在 |

### 第 3 轮发现的复核

| 编号 | 状态 | 依据 |
| --- | --- | --- |
| R3-01 | Closed | §12 只剩 D1，按四行方案写；D2 记为 agent 决定（评审要改的第 3 条），§3.2 与 §3.5 末尾改成「推翻时怎样改」；§13 第 1 条改写；不再有卡片字段，字数限制不再适用 |
| R3-02 | Closed | §13 第 1 条删去 `consequence` 的过渡写法 |
| R3-03 | Closed | §4.2 第 2 步：`import` 记录一律写进本项目的经验流水，查重只看这一份；经验只有一份流水之后问题本身消失 |
| R3-04 | Closed | §7.4 的 `propose` 一行改为情况四项（含 `errors`）至少一项非空，与 §4.1、lessons-1 一致 |
| R3-05 | Closed | §4.1：`childId` 不合 §5.7 语法时 `session:` 取 `context.session` 的 id，§7.4、§7.6 同写 |

### 挡路的发现

#### R4-01 MEDIUM 学习信号读的图历史形状，M3 附录 0.5 与 plain-ui 0.7 之后的真实图上不会出现（§3.6 信号表第 1、3 行；m5-4 验收第 1 条；§7.6；§14 U16）

问题：

1. 第 3 行（`chat:reject`、`chat:add`）的来源写「身份为 `llm` 带 `relay` 的批注，开头是 `ANSWER_MARKS.reject` 或 `ANSWER_MARKS.add`」。M3 附录 0.5 §3.5 第 6 步写明「批注不带 `relay`（引擎对 `comment` 丢掉 `relay`，:150），原话写进批注正文」。引擎实现是 `src/graph/engine.ts`:150 `const relay = mutation.op === 'comment' ? undefined : mutation.relay`，历史项只在 `relayed(context, entry)` 里带 `relay`（:236），而 `comment` 的 `context.relay` 恒为 `undefined`。所以真实的「人在对话里否掉」「人在对话里补充」批注没有 `relay` 字段，照这一行写的过滤在真实图上一条也匹配不到。
2. 第 1 行（`edit:`）只认 `actor: human` 的 `edit`。plain-ui 0.7 §9.1 删去 `/graph-apply`，`src/graph/panel-row.ts`:88 `engine.apply('human', …)` 是今天仓库里唯一以 `human` 写图的地方；图的命令行文件头写明身份恒为 `llm`。删除之后，人要改的字段只会以 `actor: llm` 加 `relay` 的形式写进图（引擎 :154 `privileged` 判据）。同一张表的第 2、4 行写的是「身份为人或带 `relay`」，第 1 行没有，写法不一致。该行里「被改字段的上一次写入的身份是 `llm` 或 `harness`」也要排除带 `relay` 的 `llm` 写入，那是人的话。
3. L2 测试（m5-4 验收第 1 条，§7.6）用「固定的图历史」和 `ANSWER_MARKS` 生成的样例，样例按本表的写法构造就会通过，错误要到自举才暴露，表现是周报里「没有这类纠正」，看不出是漏了。

后果：m5-4 验收第 1 条在手写样例上通过，真实数据上 `edit:*` 与 `chat:*` 两类信号恒为零。这是人最常见的两种纠正（改了字段、对方案说不行或补充）。§3.6 第 2 至 4 步没有输入，学习流水线失明，且没有告警。

要改：

1. 第 1 行改为：`op: edit`，写入者是 `human`，或是 `llm` 且该历史项带 `relay`；「上一次写入是 LLM 写的」改为「`llm` 或 `harness` 写的，且该项不带 `relay`」。
2. 第 3 行去掉「带 `relay`」：判据是 `op: comment`、`actor: llm`、正文以 `ANSWER_MARKS.reject` 或 `ANSWER_MARKS.add` 开头（`answerKindOf`）。
3. m5-4 验收第 1 条和 §7.6 的样例不手写历史项：用真实引擎写一次带 `relay` 的 `edit`、一次不带 `relay` 的 `comment`，再读历史；`correctionSignals` 的 L2 对这份历史断言。
4. U16 加一句：批注的历史项没有 `relay`（`engine.ts`:150），人的原话在批注正文里。

#### R4-02 MEDIUM M5 把周报里的「纠正与学习」一节和「复发由规范阶梯处理」写成 M7 已有的接缝，M7 0.6 两样都没有，也没有记请求（§3.6 第 2、4 步；§8.1 末段；m5-4 验收第 2 条；§9.1 G1；§13）

问题：

- §8.1 末段写「M7 的周报（P2）与巡检（P3）调 §4.9 的 `stats`、`hygiene` 与 §3.6 的 `correctionSignals`」；§3.6 第 2 步写周报有「纠正与学习」一节；第 3 步让主 Agent 在「周报的定时提醒到来时」起草。M7 0.6 §3.12.4 的 `weeklyReport` 输入里只有 M5 的 `stats`（有经验行时），§3.5.5 末条只写 `stats` 与 `hygiene`；全文检索 `correctionSignals`、`recurrences`、「纠正与学习」、「学习流水线」，M7 设计里都没有。`operate.weekly`（M7 §3.11.1）的提醒让主 Agent 转述 `hourness_report` 并把其中的提议（至多三件）交给人，没有给 M5 的组留位置。
- §3.6 第 4 步写「复发不降的组由 M7 的规范阶梯处理（升一级）」。M7 §3.12.2 的 `ladderProposals(norms, violations, decided)` 输入是规范节点和违规记录，M5 的组不是规范节点，进不了阶梯。
- §13 与 `graph-ops-align.json` 对 `m7` 只有去掉 `scope` 一条请求。规矩 2 要求：对齐 M5 需要 M7 改的地方，写成 `m7` 节点上的批注。

后果：m5-4 验收第 2 条的前提是「有 M7 的周报时，周报列出……」。M7 按 0.6 实现之后这个前提永远不成立，G1 的输出没有消费者。学习流水线在产品里不会运转，也没有告警。这条也和 M5 自己的约定冲突：§4.9 的 `stats`、`hygiene` 是 M7 采纳了的，`correctionSignals` 没有。

要改（推荐第 1 种）：

1. 在 §13 加一条，`graph-ops-align.json` 的 `m7` 批注里加一段（等自举之后，`d-freeze-until-dogfood`）：请 M7 的 `weeklyReport` 加一节「纠正与学习」，输入是 M5 的 `correctionSignals` 与 `recurrences`，节的内容和服务不在时的说法由 M5 §3.6 定。§3.6 第 4 步删去「由 M7 的规范阶梯处理」，改为「复发不降时，主 Agent 在下一周的草稿里换落点（例如经验升为规则提议）」。§8.1 末段、§9.1 G1 的依赖和 m5-4 验收第 2 条改为「M7 采纳该请求之后」，并写明采纳之前这一条只验 `correctionSignals`、`recurrences` 在 L2 的输出。
2. 不依赖 M7：M5 自己给主 Agent 一个只读工具（例如 `learning_signals`），周报到点后由经验行追加一条 notice 引导主 Agent 调它。代价是多一个工具和一条提醒；与冻结规则不冲突。

### 非阻断的发现

#### R4-03 NIT `feedback` 的缺省范围是 `project`，与 `d-memory-scope` 给的例子不符（§3.2 `scope` 一行；§2.1 内容去哪表）

`d-memory-scope` 的正文把「说话习惯、拍板偏好」归用户级。§2.1 的表把「人说过要怎样干活」（例「回复先给结论，少用术语」）归 `user`、`feedback`，而 §3.2 规定 `user` 缺省 `all`、`feedback` 缺省 `project`。模型写 `feedback` 而不填 `scope` 时，人的说话习惯落进项目，换个项目就没有，正是该决定要防的。不挡路：验收没有规定缺省，可逆，写错一条可以重写再删。改法：`feedback` 不设缺省，没填 `scope` 时返回 `invalid`，`hint` 写「"all" if it is about how the user likes to work in every project, "project" if it is a norm of this project」；`user` 仍缺省 `all`。

#### R4-04 NIT `projectDirOf` 只返回路径，规则板 0.10 §7.1 写的是它连带追加 `.git/info/exclude`（§5.5；§8.3「不要求规则板改什么」）

规则板 0.10 §7.1（项目根与项目目录一段）把「数据目录服务给的 `projectDirOf(cwd)`」描述成「git 仓库根下的 `.llm/`，没被忽略时追加进 `.git/info/exclude`」，并写明最小一片因为那时没有 `projectDirOf` 才自己在 `ensureRuntimeDir` 里调 `ensureIgnored`；§7.4 说 `openRulesBoard` 的 `projectDir` 参数随 `projectDirOf` 一起加。M5 0.4 的 `projectDirOf` 是纯路径函数，忽略和建目录在 `ensureProjectDir`。规则板整块合入时若照它自己的描述去掉 `ensureRuntimeDir`，别的项目里 `.llm/rules/` 会没有忽略条目。影响只是 `git status` 里多出一个目录。M5 §8.3 引的「规则板 0.10 §7.3」也该是 §7.1 与 §7.4。改法：§5.5 与 §8.3 写明「`projectDirOf` 不写任何东西；规则行建 `.llm/rules/` 之前继续调 `ensureIgnored`（或 `ensureProjectDir`）」，并在 `rules` 节点上记一条等自举之后的批注，请规则板 §7.1 的括号改成同样的话。

#### R4-05 NIT §3.6 落点表里「规则行不在时」的退路与 M3 附录 0.5 §3.4 和 M5 自己的 §4.6 不一致（§3.6 第 3 步表的规则提议一行）

写的是「主 Agent 用 `graph_propose` 记一张待决，再用 `propose_to_human` 交给人」。M3 附录 0.5 §3.4：`propose_to_human` 的 `kind: 'question'` 新提时自己提议待决节点；§3.3 的工具说明要求主 Agent 的人定待决用 `propose_to_human`，不用 `graph_propose`。先 `graph_propose` 会造出第二个节点。M5 的 §4.6 提醒文字已经是对的（「put the point to the user in plain words with propose_to_human」）。改法：这一行改成「用 `propose_to_human` 直接提一张待决（`kind: 'question'`，不带 `attach`）」。

#### R4-06 NIT 候选提醒用的 `isMainAgent` 从哪里取，没有写，也不在 §14 里（§4.2.1；§6 表「M3 附录 0.5 §2.4 的 `isMainAgent`」一行；§8.4）

M3 附录 0.5 §2.4 和 M3 0.4 §3.1.2 把 `isMainAgent` 写成导出函数，M7 同样依赖它。盘上第 3 步的实现里 `src/design/mode.ts`:174 的 `isMainAgent(deps, agent)` 没有导出，且依赖设计行内部的 `deps`。M5 写「调 M3 导出的判断」，没说是导入哪个模块、拿什么参数，也没有 U 项。设计行不在时的退路（任何根 agent 都算）有，但「设计行在而判断取不到」时的行为没有。改法：§14 加一项：lessons 行取 M3 的主 Agent 判断的方式（按 M3 实际导出的名字，或 M3 提供的服务成员），取不到时按「设计行不在」处理并在行健康里写原因；M3 的导出形状变了只改这一处。

#### R4-07 NIT 项目目录被删之后，「每个进程每个目录只调一次 `ensureProjectDir`」让写入一直返回 `io`，直到重启（§5.3 第 2 步；§5.5 `ensureProjectDir`）

`acquireLock` 要求锁文件所在目录已存在，目录被人或 `git clean -fdx` 删掉后，进程内的「已准备」标记不会让它重建。写入返回 `io`，能发现，重启能恢复，所以不挡路。改法：`append` 在创建锁遇到 `ENOENT` 时清掉该目录的标记，调一次 `ensureProjectDir` 再试一次。

#### R4-08 NIT 正文里有 41 行叙述 0.3 做过什么，违反「被取代的条款整条重写，旧文本留在 git 历史中」（全文；CHARTER 0.7 §10 第 2 条；`AGENTS.md`「文档」）

例如 §4.1 id 的生成一段末尾的括号、§4.6 复发一段末尾的括号、§5.3 第 3 步的「0.3 写的『不判进程死活』因此作废」、§5.5 的「0.3 在 §5.5 里描述的另一对函数……不再建」。这些对读者要理解的现行设计没有帮助，§15 的修订记录已经逐条写了。改法：正文只写现行做法，把这些叙述并入 §15「0.4」一段或删掉。

#### R4-09 NIT `graph-ops-align.json` 与 §13 对不上（`graph-ops-align.json`；§13 第 5、6 条）

§13 第 5 条写在 `ablation` 与 `risk-calib-read` 上批注，第 6 条写在 `question-31` 的后续实现、`prompt-fixes` 与 `m3-main-persona` 上批注；文件里只有 `ablation` 与 `prompt-fixes` 两条，这三个节点都存在。R4-02 的 `m7` 请求也要进 `m7` 那一条。改法：补齐或把 §13 改成与文件一致。

#### R4-10 NIT D1 的措辞两处可以更贴 `d-plain-questions`（§12 D1）

「不做」一行写「M7 那十张你也是逐条看的」，M7 是内部模块名，人没学过这个叫法；写成「之前开发流程那十张单子」。「疑问」一行的「你要先过目就说一声」与「推荐」已经是逐条给你看重复，疑问应点名会改变方案的事实：推测出的习惯 14 天没被用到就淡忘，你说一句就撤，如果这一条你不放心，单子里要单独写出来。

#### R4-11 NIT `memory_store`、`lessons_merge` 的工具说明没有示例，`d-agent-examples` 的清单没有点名 M5（§2.2、§4.2.2、§3.2）

`d-agent-examples` 写「主 Agent 写给人或交给 harness 的每一种东西，在写它的工具说明里带一个完整例子」，清单列了 M3、规则板、循环板、M7，没有 M5。`lessons_merge new` 和 `memory_store` 明显是主 Agent 交给 harness 的东西。不挡路，因为清单没点名。改法：由编排者定要不要补；要补时每个工具一例、过同样的校验、领域不用记账一类。

### 核实过的假设（本轮新增）

仓库代码：

- `src/data/project-root.ts`：`projectOf(cwd, home)` 返回 `ProjectLocation | undefined`；`git` 为假时只认 `<cwd>/.llm/`，用户主目录与盘符根永远不是项目；只有找到 `.git` 的结果按 `cwd` 缓存，所以「建了 `.llm/` 之后下一次就认出」成立。`gitDirOf(root)`；`ensureIgnored(root, directory)` 异步，不在 git 仓库里不做事，已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 之一不重复，写不进去时抛错。§5.5 的描述逐项一致；函数全是同步读，投影 `init` 可用，M5 确实不需要给它加选项。`tests/` 里没有 `data-project-root.spec.ts`，A1 的「新建」不冲突；`projectOf` 的现有测试在 `tests/rules-engine.spec.ts`。
- `src/data/lock.ts`：`acquireLock(file, environment, options)`，`LockOptions` 含 `retryMs`、`waitMs`、`staleMs`、`bootToleranceMs`、`holder`、`keepStale`；`WriteLock` 有 `held()`、`release()`（只删令牌是自己的锁）；陈旧判法含持有者进程已不在、`at` 过旧、开机时刻相差超过容差；锁所在目录须已存在。§5.3 的五个值与 `docs/ORCHESTRATION.md` §17.6 记的「M5 的值」一致。
- `src/graph/engine.ts`:150、154：`comment` 丢掉 `relay`，带 `relay` 的 `llm` 写入有人的权限（R4-01）。`src/graph/panel-row.ts`:88 是唯一以 `human` 写图的地方，plain-ui 0.7 §9.1 要删。
- `src/design/mode.ts`:174：`isMainAgent(deps, agent)` 当前不导出（R4-06）。M3 附录 0.5 §2.1 的主 Agent 工具面是去掉写文件类工具的拒绝名单，`lessons_merge`、记忆工具不在其中，主 Agent 保留它们。
- `scripts/check-verbatim.mjs`：逐字门禁只读 `reference/zcode-3.17.1/zcode.cjs`；`MIRROR_FILES` 现有 5 项，`MIN_LINE = 13`。

ZCode 3.17.1：

- §3.5 的全文代码块逐字取出量过：2,213 个字符、21 个换行；去掉 L2 与它前面的空行是 2,114；与 §0、§1.3 的数一致。用 `zcode.cjs` 里 `h3a` 的 `default-index` 一支求值，按 §3.5 的白名单步骤处理（跳过 Z2、Z6、L1、L2 四句，去掉 `body: ` 前缀，Z7 两处换回原词，去掉行首空白）后剩 10 行，与原文去掉 Z2、两行 `---`、`metadata:`、Z6 之后的 10 行逐一相等、次序相同。三处与 3.16.2 的不同（`description:` 行的逗号、四类定义的冒号、Z7 与 Z9 的句号）在 3.17.1 上成立。
- 「Contents of …/MEMORY.md (user's auto-memory, persists across conversations):」在偏移 12839520，警告「> WARNING: MEMORY.md is …」在 12837642，与 §3.3 一致。3.17.1 里另有「Persistent Agent Memory」（`cqa`）一套文字，属于带 `<MEMORY_ROOT>` 的按范围记忆，不是系统提示词里的 `# Memory` 节，M5 取的是对的那一支。

邻居设计与图：

- plain-ui 0.7：§4.7 的 `BoardState`（`available`、`homeLine`、`guideLine`、`peakApplies`）、`Board`（`id: 'rules' | 'loops' | 'lessons'`、`subscribe`、`snapshot`、`Page`）与页面约定；§1.4 验收第 7 条；§3.1 的两条路；末段「经验板：人删条目也在对话里说（M5 定）」。
- M3 附录 0.5：§2.2 去向表第 7、9 项（`design_review`、`depth` 作废）；§2.7 的 `reportingDepth`、`glm:reporting-depth` 改名与旧键 `persona` 照读；§3.4 `propose_to_human`（新提待决时自己提议节点，R4-05）；§3.5 `ANSWER_MARKS` 的三种说法和「批注不带 relay」；§3.3 `proposalLineRefusal` 的上限。
- M7 0.6：§3.5.5 与 §3.6.1 的五处（`session`、`errors`/`scope`、退路批注 JSON、`LESSONS_TOOL_NAMES`、三路结果）与 M5 §8.1 一致；`Hourness-Task` 尾注；§3.12.4、§3.12.2 的内容（R4-02）。
- 规则板 0.10：文首与 §10.7 M5 一条撤回改第 7 条经验；§9.3 的 `rules_propose` 加 `propose_to_human` 的 `attach` 路径；§7.1、§7.3、§7.4 与 `docs/ORCHESTRATION.md` §16.3 的项目根和项目目录（R4-04）。循环板 0.6 §6.6、§14 引用 `redactSecrets`。M4 0.4 §2.4 的违规流水位置。
- CHARTER 0.7 §3.2 第 3 条、§6（先影子限定为写在代码里的门禁）、§9 存放表（项目 `.llm/` 放记忆与经验，用户级放关于用户的记忆）。
- `d-memory-scope` 节点正文；`m5` 节点 13:04Z、13:12Z 批注；`lessons` 节点 06:11Z、06:25Z 批注。
- `design-0.3.md` 是 0.3 原文；`graph-ops-align.json` 是纯数组，6 项，节点 id 都存在。

### 未核实或有误的假设（本轮）

- 有误：§3.6 信号表认为人的否掉与补充批注带 `relay`、人改字段以 `actor: human` 写入（R4-01）。
- 有误：§8.1 末段与 §3.6 认为 M7 的周报会列 M5 的纠正组、M7 的规范阶梯会处理这些组的复发（R4-02）。
- 未核实：R4-06 的 `isMainAgent` 取法，设计没有列进 §14。
- 未核实（本轮没读）：用户 profile 补丁第 67 至 69 行记忆行的 `home`，维持前几轮的说明；`remote.workspaceFiles` 在桌面版上读工作区外文件（U4）维持第 1 轮的分类。
- U1 至 U5、U8 至 U11、U13、U14、U16 至 U18 维持前几轮和 0.4 的分类；U17、U18 是模型行为的不确定，设计给了退路。

### 设计依据的学科（§2.0）对照（本轮）

- 可靠性工程与数据库：流水、锁和项目目录改用仓库里已有的两个模块后，M5 一侧要证明的只剩传选项和 `held()` 的用法，与源码一致；学习信号的输入形状没有对着真实写入核对（R4-01）。
- 提示词工程：Memory 节全文按 3.17.1 重拼，白名单断言在新全文上成立。
- 认知负荷：M5 不新增 harness 给人的待决；D1 按四行方案写，行长在 M3 的上限内，措辞见 R4-10。
- 安全工程：删除经对话时 `relay` 不由 M5 核对，已记为 agent 决定并有墓碑与快照可恢复，接受。

## 第 5 轮（设计 0.5）

挡路 0 条，非阻断 8 条（NIT 8）。第 4 轮的 11 条（R4-01 至 R4-11）全部关闭，其中 R4-06、R4-08 各留一处余项，记为 R5-01、R5-06。挡路条数按轮为 2、2、1、2、0。结论 APPROVED。

本轮评审人不是 0.5 的作者。0.5 对着第 4 轮的两条挡路（学习信号的历史形状，M7 周报里没有的一节）和九条 NIT 改稿。评审把改法逐条对回引擎源码（`src/graph/engine.ts`、`src/graph/schema.ts`）、已在 main 的 `src/data/*` 与 `src/graph/main-agent-holder.ts`、`eslint.config.js`、`scripts/packages.mjs`，以及邻居设计的原文（M3 附录 0.5、M7 0.6、规则板 0.10、循环板 0.6、plain-ui 0.7 与 0.8、CHARTER 0.7）。8 条 NIT 没有一条属于挡路的三类（验收没有满足、不可逆损失没有预防、失败没有途径发现或恢复）。其中 R5-01、R5-02、R5-07 在实现者第一次跑 `npm test` 时由 ESLint、契约测试或 preflight 当场报出。

### 对照分支 B 的要点与共用规矩

| 要点 | 结果 | 依据 |
| --- | --- | --- |
| R4-01：学习信号读引擎实际写出的历史形状 | 落实，余项见 R5-04、R5-05 | §3.6 第 1 步表：第 1 行为 `op: edit`，写入者 `human` 或 `llm` 带 `relay`，上一次写入是不带 `relay` 的 `llm`/`harness`；第 3 行为 `op: comment`、`actor: llm`、正文以 `ANSWER_MARKS.reject`/`add` 开头。对引擎：`engine.ts`:150 `comment` 的 `relay` 恒为 `undefined`；:154 `privileged = actor === 'human' || relay !== undefined`；`relayed()` 只在 `context.relay` 有值时给历史项加 `relay`；`HUMAN_ONLY` = approve、reject、decide、supersede（:92）；`TRANSITIONS.done = ['doing']`（:114）且 `planStatus` 对 done→doing 不要求特权（agent 自己也能重开），所以第 4 行必须过滤 `human`/`relay`。M3 附录 0.5 §3.5 第 6 步原文「批注不带 `relay`（引擎对 `comment` 丢掉 `relay`，:150）」 |
| R4-02：不依赖 M7 周报里没有的一节 | 落实 | M7 0.6 §3.12.4 的 `weeklyReport` 只带 M5 的 `stats`，§3.5.5 只有 `stats`、`hygiene`，§3.12.2 的 `ladderProposals(norms, violations, decided)` 吃规范节点，全文检索 `correctionSignals`、`recurrences`、`learning_signals`、「纠正与学习」均无命中。0.5 的出口是记忆行的只读延迟工具 `learning_signals` 加每七天至多一次的摘要提醒，m5-4 验收第 2 条、G1、§8.1 末段都不再依赖 M7；M7 日后列同样的数是 `m7` 节点上的可选请求（§13 第 3 条，`graph-ops-align.json` 第 4 项）。余项：R5-02、R5-03、R5-08 |
| 规矩 2：不改已放行设计，要改的写成节点批注 | 符合 | `graph-ops-align.json` 是纯数组、12 项、都是中文 `comment`、节点 id 全部存在；`m7` 两条（去掉 `scope`；可选的周报一节）、`rules` 一条（§7.1 括号）、`m3` 一条（可选的 `isMainAgent` 服务）、`bootstrap` 一条通知，以及 `ablation`、`risk-calib-read`、`question-31`、`prompt-fixes`、`m3-main-persona`、`m5`、`lessons`；与 §13 第 3 至 8 条和第 10 条逐条对上。设计文本里没有改 M3、M7、规则板、循环板的任何内容 |
| M5 能就着 M3、M7 现有的接口改的都改了 | 符合 | M3：`mainAgentOf`、`holderHome`（`src/graph/main-agent-holder.ts`:70、:171，今天就在 main 上）、`ANSWER_MARKS`/`answerKindOf`（附录 0.5 §3.5）、`propose_to_human` 的 `kind: 'question'`（§3.4）；M7：`stats`、`hygiene`、`候选标定题：`栏名（M7 0.6 §3.15 固定标签）、交回结构的 `errors`。没有为 M5 另造 M3/M7 里没有的接缝，唯一新增的出口在 M5 自己的记忆行里 |
| `d-memory-scope` | 落实 | 用户级只有关于人本人的记忆；经验没有范围字段和用户级流水；`all` 只给 `user`、`feedback`；`feedback` 不写 `scope` 得 `invalid`（R4-03）；`reporting-depth` 强制 `user`、`all`、带 `relay`；`learn-notified` 只写项目的记忆流水；第一批 21 条全进项目 |
| plain-ui 0.7 对 `lessons` 节点的批注 | 落实，一处余句见 R5-06 | §4.7：页面无写入控件，L2 静态检查要求 `ui/src/lessons/` 不调用 `commands.execute`；删除与恢复是人对主 Agent 说，主 Agent 带原话调 `lessons_merge delete`/`restore` 或 `memory_forget`；板块登记照 plain-ui §4.7 的 `subscribe`、`snapshot`、`BoardState`（`available`、`homeLine`、`guideLine`、`peakApplies`）。plain-ui 现在是 0.8，§4.7 与 `lessons` 的约定未变 |
| `m5` 节点 13:04Z、13:12Z 的 `src/data/` 裁定 | 落实 | 只用已在 main 的 `project-root.ts`（`projectOf`、`gitDirOf`、`ensureIgnored`）与 `lock.ts`（`acquireLock`，选项 `retryMs`、`waitMs`、`staleMs`、`bootToleranceMs`、`holder`、`keepStale` 都在 `LockOptions` 里）；在 `project-root.ts` 里加 `projectDirOf`、`ensureProjectDir` 两个函数，不新建第二个项目根或锁模块，也不加选项（§5.3、§5.5）；§5.5 说明为什么用不到注入或异步 |
| 规则板撤回「请 M5 改第 7 条经验」 | 落实 | §4.8 第 7 条「新的门禁先在影子模式运行」原文保留，并说明它说的是写在代码里的 guard 规则，在 CHARTER 0.7 §6 下成立；与 `m5` 节点 10:13Z 批注一致 |
| D1 按规矩 6 重写 | 符合 | 标题加四段，标签不加粗，每行一处加粗、一句话，问题放在最后，一件。按 M3 附录 0.5 §3.3 的限制量（去掉 `**` 与标签）：题目 18、背景 27、推荐 22、疑问 31、不做 31 个码点（背景限 60，其余限 40，题目限 40），加粗 3、5、6、7 个码点（限 2 至 12）。「不做」写「上次开发流程那十张单子」，「疑问」点名「推测出的习惯 14 天不用就淡忘」；无「验收」「标定」「门禁」「影子」 |
| 规矩 1：不另立方向 | 符合，一处取舍记入 §11 | `learning_signals` 加摘要提醒是评审在 R4-02 里给的备选，作者选了它并写明代价（多一个延迟工具、每七天至多一条提醒）和没选的做法；不新增给人的待决 |
| 规矩 3：留旧稿、记改动对应的定案或发现 | 符合 | `design-0.4.md` 是评审过的 0.4 原文，`design-0.3.md` 是 0.3；§15「0.5」逐条对应 R4-01 至 R4-11；余一行叙述旧稿，见 R5-06 |
| 规矩 7、8：例子不用记账一类领域；文档无人设与语气词 | 符合 | `memory_store` 的示范是回复风格，`lessons_merge` 的示范是图片批处理，都按各自的字段规则走一遍通过（名字 kebab、`Why:` 行、`scope: all`、`relay`；证据 `commit:` 加 12 位十六进制、报错片段 27 个字符、坑 1–300、解法 1–600）；全文检索「记账」「ledger」「bookkeeping」「invoice」「budget」及语气词、波浪号均无命中 |

### 第 4 轮发现的复核

| 编号 | 状态 | 依据 |
| --- | --- | --- |
| R4-01 | Closed | 上表；§3.6 第 1 步表、m5-4 验收第 1 条（真实引擎写、读回，含不带 `relay` 的批注）、§7.6、U16 的「批注历史项没有 `relay`」、新增 U20 都已按改法写。余项是另外两处（R5-04、R5-05），不是原发现 |
| R4-02 | Closed | 上表。§3.6 第 2 步重写，第 3 步改为摘要提醒到来时起草，第 4 步删去「由规范阶梯处理」；§8.1 末段、G1 依赖、m5-4 验收第 2 条脱钩；§13 第 3 条留下可选请求 |
| R4-03 | Closed | §3.2 `scope` 行、§2.1、m5-1 验收第 3 条、§7.6、§11：`feedback` 无缺省，缺省时 `invalid` 并带评审给的 `hint`；`user` 仍缺省 `all` |
| R4-04 | Closed | §5.5、§8.3：`projectDirOf` 不写任何东西，规则行继续在建 `.llm/rules/` 前调 `ensureIgnored`；引文改为规则板 0.10 §7.1、§7.4（查过：§7.1 在「文件」一节，`openRulesBoard` 的 `projectDir` 在 §7.4「写入」）；`rules` 节点上有自举之后的批注 |
| R4-05 | Closed | §3.6 第 3 步表：规则行不在时直接 `propose_to_human`（`kind: 'question'`，不带 `attach`），与 M3 附录 0.5 §3.4 和 M5 §4.6 一致 |
| R4-06 | Closed | `isMainAgentFor` 调 M3 为 M5、M7 导出的 `mainAgentOf`，取不到按「设计行不在」处理并写行健康，U19，`m3` 节点上有可选批注。访问器放在哪个目录、`dir` 从哪来是新问题，记为 R5-01 |
| R4-07 | Closed | §5.3 第 2 步、§5.5、§7.2 新增一行。前提核对过：`src/data/lock.ts` 的 `tryCreate` 只吞 `EEXIST`，其他错误（含 `ENOENT`）抛出 |
| R4-08 | Closed，余一行 | 对正文（§15 以前）扫描「0.1 至 0.4」「原为」「取代」「删去」等叙述，只剩 §8.2 一行，见 R5-06 |
| R4-09 | Closed | `graph-ops-align.json` 与 §13 逐条一致 |
| R4-10 | Closed | §12 D1 两行按评审改法写，量过（上表） |
| R4-11 | Closed | 两个示范都在，写明过同一校验函数；§1.3 的常驻字符数 3,090 = 700 + 500 + 560 + 1,330 |

### 挡路的发现

无。

### 非阻断的发现

#### R5-01 NIT 主 Agent 访问器放在 `src/shared/`，违反仓库的导入边界，创建它的步又晚于第一个要用它的步（§4.2.1；§2.2 构件表；§6 表「M3 附录 0.5 §2.4」一行；§8.4；§9.1 L1、G1；§14 U19）

问题：

1. §4.2.1、§6、§8.4、§9.1 G1 把 `isMainAgentFor(ctx, agent)` 放在 `src/shared/main-agent.ts`，它要调 `mainAgentOf`。`mainAgentOf(userHome, dir)` 在 `src/graph/main-agent-holder.ts`:171，`graph` 在 `scripts/packages.mjs` 里属于 `hourness.src`。`eslint.config.js`:41 给 `src/shared/**` 设了 `no-restricted-imports`（error），禁止导入任何包目录（`scripts/packages.mjs` 文件头：「it imports no package directory」）。照设计写，`npm test` 里的 `check-lint` 当场失败。
2. 第一个要用它的是 L1（lessons-1 验收第 3 条的候选提醒）。文件在 G1 新建，G1 又依赖 L1。§2.2 构件表也没有这个文件。
3. `mainAgentOf` 的 `dir` 是图目录（`holderFileOf(userHome, dir)` 取 `projectKey(dir)`，`main-agent-holder.ts`:47–67）。设计只在「取不到」的清单里提到「没有图目录」，没写 `dir` 从哪来。今天的取法是 `ctx.get` 图服务 `glmHournessGraph` 的 `dirFor(cwd)`（`src/graph/service.ts`、`src/graph/index.ts`:77），`userHome` 取 `holderHome(ctx)`（:70）。
4. U19 写「M3 还没实现；导出名与返回形状没有核对」。`mainAgentOf(userHome: string, dir: string): HolderRecord | undefined` 与 `HolderRecord.sessionId` 现在就在 main 上（:25–35、:171–174），可以核对。

后果：不挡路。lint 错在实现者第一次跑 `npm test` 时就报出，换个目录即可；但 §9.1 的文件清单与依赖按现在的写法排不出来。

改法：

1. 把访问器放进编排层包内两行都能导入的目录，例如 `src/data/main-agent.ts`，随 A1 新建（A1 无依赖，M1、L1 都依赖它）；记入 §2.2 与 A1 的文件清单；删去 G1 里的 `src/shared/main-agent.ts`，§4.2.1、§6、§8.4、§14 U19 里的路径同改。
2. §4.2.1 写明：`dir` 取 `ctx.get('glmHournessGraph')?.dirFor(会话头 cwd)`，`userHome` 取 `holderHome(ctx)`；`dirFor` 给不出目录按「取不到」处理。
3. U19 的依据栏改成「导出形状已对过 main 上的 `src/graph/main-agent-holder.ts`」，未核实的只剩 M3 日后把持有者记录搬进 `.llm/` 时形状会不会变。

#### R5-02 NIT `learning_signals` 的名字没有进工具名契约；现有契约测试和 Memory 节的出现条件都按「三个记忆工具」写（§2.2「工具名契约」一行；§2.3；§3.5 与 m5-3 验收第 2 条；§6；§8.6）

问题：`src/shared/tool-names.ts` 的 `MEMORY_TOOL_NAMES` 是三个名字。`tests/contracts.spec.ts`:59 断言 `memoryTools(io).map(tool => tool.name)` 与它 `deepEqual`。`src/glm-prompt/index.ts`:121 的 `memorySectionApplies` 用 `MEMORY_TOOL_NAMES.every(...)`。§2.2 说 `src/memory/tools.ts` 注册「三个记忆工具，加只读的 `learning_signals`」，§8.6 说契约测试断言 `MEMORY_TOOL_NAMES` 等于记忆行注册的名字，§3.5 与 m5-3 验收第 2 条说「三个记忆工具都在才出这一节」。四处不能同时成立：`learning_signals` 进 `memoryTools` 的返回，现有断言失败；进 `MEMORY_TOOL_NAMES`，Memory 节的条件变成四个工具；都不进，契约测试管不到这个工具。

后果：不挡路。契约测试第一次跑就失败。

改法：在 `tool-names.ts` 加 `LEARNING_TOOL_NAMES = ['learning_signals']`，`src/memory/tools.ts` 另导出 `learningTools(...)`；`MEMORY_TOOL_NAMES`、`memorySectionApplies` 与 m5-3 不动。§8.6 的契约测试改为：记忆行注册的名字等于 `[...MEMORY_TOOL_NAMES, ...LEARNING_TOOL_NAMES]`，常驻名单不含 `learning_signals`；子 agent 的过滤去掉这两组。

#### R5-03 NIT m5-4 验收第 2 条要求「摘要没有变化时不来」，§3.6 第 2 步的注入条件里没有这一项（m5-4 验收第 2 条；§3.6 第 2 步；§7.6）

问题：验收第 2 条写「7 天内、没有符合条件的组、摘要没有变化时不来」。§3.6 第 2 步的条件是：有项目目录；最近一条 `learn-notified` 满 7 天或没有；至少一个组没落点或落点之后又出现。同一批没落点的组放着不管，每满 7 天就再来一次。这与验收的第三项相反，也与 §1.1 表里 K7（「提醒只在内容变化或事件发生时注入」）相反。§7.6 的节流用例（没有记录到点、6 天 23 小时不到点、满 7 天到点、到点但无组不注入、写失败不注入）没有「摘要没变」一例。`learn-notified` 的 `data` 已经存了组键摘要，条件可以直接用。

后果：不挡路。多出的是每七天一条重复提醒，主 Agent 可以忽略，不丢数据。但验收与机制写的是两件事，L2 只会按其中一个写。

改法（推荐）：第 2 步的条件加一项：到点时把算出的组键集合与最近一条 `learn-notified` 的 `data` 比，相同则不注入，变了才再来；§7.6 加这一例；验收第 2 条照此写。另一种：删去验收里「摘要没有变化」一项，承认每七天重复，并在 §1.1 表 K7 一行注明例外。

#### R5-04 NIT 第 1 行把人的「同意」写入也算成纠正，`meaning` 的示例也不准（§3.6 第 1 步表第 1 行与 `learning_signals` 的 `meaning` 示例）

问题：M3 附录 0.5 §3.5 在 `confirm`、`release` 同意时 `edit` 目标或模块的 `stage`，带 `relay`，`reason` 以 `ANSWER_MARKS.agree` 开头。M3 的退回（模块从 `release` 回 `design`，主 Agent 的 `graph_edit`，不带 `relay`，附录 0.5 §3.14.7 的表「模块 `release` 或之后 → `design`」）之后，下一次放行的 `edit stage: release` 满足第 1 行的全部条件：`llm` 带 `relay`，被改字段的上一次写入是不带 `relay` 的 `llm`。于是每个「退回再放行」的循环产生一个 `edit:feature.stage`，而它是人的同意，不是纠正。`meaning` 的示例 `edit:goal.stage`「the person changed the stage the agent had set」同样不对：目标的 `stage` 引擎不让 `llm` 不带 `relay` 写，改它的只有同意写入。

后果：不挡路。周摘要里多一个噪声组，主 Agent 白落一个点；不丢数据，不误导规则（只有规则要人批）。

改法：第 1 行再排除 `reason` 经 `answerKindOf` 判为 `agree` 的历史项（同意的写入归 `record_human_answer`，不是改动）。`meaning` 的示例换成真实会出现的组：按本稿第 1 行的判据扫本仓库 `docs/graph/nodes/`，得 `edit:task.acceptance` 约 7 次、`edit:task.body` 约 2 次（粗扫，上一次写入按提议者与是否带 `relay` 取），例如 `edit:task.acceptance` 写作 "the person changed the acceptance the agent had written"。§7.6 加一例：带 `agree` 记号的 `edit` 不成为信号。

#### R5-05 NIT 「今天唯一以 `human` 写图的是 `panel-row.ts`:88」不准确（§3.6 第 1 步下的说明段）

问题：`src/graph/run-control.ts`:134–135 的 `record()` 也以 `human` 写图：`/graph-run` 重开任务时写 `status` done→doing（note 作 `reason`），其余时候写 `comment`。对齐稿保留 `/graph-run`（brief 分支 D：引擎的写入方是图工具、命令行和人的 `/graph-run`）。结论不变：第 1、2、4 行两种写法都认；`/graph-apply` 删去后，`edit` 与 `reject` 里的 `human` 来源消失，`reopen` 里的仍在。要改的是理由，以及 m5-4 验收第 1 条的重开样例只写了「人发起的重开」，没写身份。

后果：不挡路，信号定义不受影响；样例若只写 `llm` 带 `relay` 的重开，`human` 的那条路径没有被测。

改法：说明段改为「`/graph-apply` 删去后，以 `human` 写图的只剩 `src/graph/run-control.ts` 的 `/graph-run`（重开任务的 `status`，和批注）」；m5-4 验收第 1 条与 §7.6 的重开样例，`human` 身份（经 `engine.apply('human', …)`，同 `record()`）与 `llm` 带 `relay` 各写一次。

#### R5-06 NIT 正文还有几处叙述旧稿或旧写法（R4-08 的余项；§8.2；lessons-1 验收第 3 条；§5.3 第 2 步的行号）

1. §8.2 第二条末句「0.3 的按钮、撤销提示和「同 `/graph-apply` 的通道」删去，`/graph-apply` 本身 plain-ui 0.7 已删」叙述 0.3，违反「被取代的条款整条重写，旧文本留在 git 历史中」（CHARTER 0.7 §10 第 2 条；`AGENTS.md`）。§15 说正文扫描已无余项，这是余下的一处。改成现状：「页面没有按钮，不经任何命令写；`/graph-apply` 已被 plain-ui 0.7 删去」。
2. lessons-1 验收第 3 条仍写「按 M3 的 `isMainAgent` 判」，现行做法是 `isMainAgentFor`（§4.2.1）。改成「按 `isMainAgentFor` 判」，并加一例：持有者是别的会话时，本会话收不到。
3. §5.3 第 2 步引 `src/data/lock.ts`:127–128 为「只吞 `EEXIST`」。M7 的 E3 系列提交（`af75fe8`、`adc2628`、`405cd87`）改过这个文件，现在这段在 `tryCreate`，第 139–140 行，行为没变。自举期间代码在动，行号会漂；改成函数名 `tryCreate`。

#### R5-07 NIT 步骤的文件清单缺两处（§2.2；§9.1 M1、G1、P1）

1. `src/memory/service.ts`（声明 `stats`、`hygiene`、`learningDigest`，§8.6）：§2.2 构件表没有这一行，M1 的清单没有，G1 写「改」，没有任何一步新建。M1 的清单加「新建」，§2.2 加一行。
2. `ui/src/lessons/`：preflight 第 1 项要求 `ui/src/` 下每个文件恰属一个客户端包（`scripts/preflight-bundle.mjs` 文件头），`scripts/packages.mjs` 的 `hourness.client.sources` 现在只有 `ui/src/hourness-client.tsx`、`ui/src/dsh.ts`、`ui/src/primitives.d.ts`、`ui/src/graph/`。P1 新建 `ui/src/lessons/LessonsPage.tsx`，清单里没有 `scripts/packages.mjs`。P1 清单加这一项，写明 `client.sources` 加 `ui/src/lessons/`。

后果：不挡路。第二项在 `npm run preflight` 当场报出。

#### R5-08 NIT `learned` 的读法没有覆盖「候选标定题」落点；`learningDigest` 的签名两处不同（§3.6 第 2、3 步；§8.1 末段；§8.6；§13 第 3 条）

1. §3.6 第 3 步表：候选标定题把 `学自：<键>` 写在复盘节点正文「候选标定题：」一栏后。第 2 步 `learned` 只数「带组键的 `learnedFrom` 的记忆与经验、`学自：<键>` 的节点批注」，不读节点正文。这一类落点因此永远不算已落点，同一组每次摘要都再出现。改法（推荐）：这一行也用批注（`graph_comment` 写 `学自：<键>`，与规则提议一行相同），M7 的栏名不动；或把复盘节点正文加进 `learned` 的读法。
2. `learningDigest` 在 §8.1 末段写 `learningDigest(session, since, until)`，在 §8.6、§13 第 3 条和 `graph-ops-align.json` 第 4 项写 `learningDigest(session, {since?, until?, minCount?})`。统一成后者。

### 核实过的假设（本轮新增）

仓库代码：

- `src/graph/engine.ts`：:150 `comment` 的 `relay` 恒为 `undefined`；:154 `privileged = actor === 'human' || relay !== undefined`；`relayed()` 只在 `context.relay` 有值时给历史项加 `relay`（所以带 `relay` 的 `propose` 也有）；`HUMAN_ONLY`（:92）；`TRANSITIONS.done = ['doing']`（:114）；`planStatus` 对 done→doing 不要求特权；`planEdit` 对非特权写只放行 `LLM_EDITABLE`（`title`、`body`、`slope`、`decider`、派发字段，:101）或自己的提议，所以 `stage`、`acceptance` 的 `llm` 写入只能带 `relay`；`openEngine(dir).load()`、`.apply(actor, mutation)` 是公开接口。
- `src/graph/schema.ts`：`HistoryEntry` 有 `text`（批注）、`changes`（`from`/`to`）、`from`、`to`、`relay`、`actor`、`op`；与 §3.6 表用到的字段逐项一致。
- `src/graph/panel-row.ts`:88 与 `src/graph/run-control.ts`:134–135 是仓库里仅有的两处以 `human` 调 `engine.apply` 写图（后者见 R5-05）；`src/rules/index.ts`:158 的 `board.apply('human', …)` 写的是规则板，不是图。
- 真实图（`docs/graph/nodes/`，粗扫）：`llm` 的 `edit` 带 `relay` 46 条、`llm` 的 `propose` 带 `relay` 69 条、`llm` 的 `comment` 662 条、`human` 的 `comment` 5 条；按 §3.6 第 1 行的判据有 `edit:task.acceptance` 约 7 次。所以 §9.3 第二批 L4「在本仓库的真实图上让主 Agent 调 `learning_signals`，返回里至少有一个组」可达成；`chat:*` 两类要等 M3 附录 0.5 第 6 步合入之后才有数据（`src/shared/answer-marks.ts` 现在不在 main 上，G1 的「没有时按 M3 附录 §3.5 建」是对的）。
- `src/data/lock.ts`：`acquireLock(file, environment, options)`；`LockOptions` 有 `retryMs`、`waitMs`、`staleMs`、`bootToleranceMs`、`holder`、`keepStale`，另有 E3 加的 `unreadableGraceMs`（缺省 0，不影响 M5）；`WriteLock` 有 `held()`、`release()`；`tryCreate` 只吞 `EEXIST`，`ENOENT` 抛出，R4-07 的前提成立；`realLockEnvironment.bootTime` 在。
- `src/data/project-root.ts`：`projectOf(cwd, home)` 同步，主目录与盘符根返回 `undefined`，不在 git 仓库里只认已有 `.llm/`；`gitDirOf(root)`；`ensureIgnored(root, directory)` 异步，已有 `.llm`、`.llm/`、`/.llm`、`/.llm/` 之一不重复，不在 git 仓库里不做事，写不进去时抛错。§5.5 的描述逐项一致。
- `src/graph/main-agent-holder.ts`：`mainAgentOf(userHome, dir): HolderRecord | undefined`（:171）、`holderHome(ctx)`（:70）、`HolderRecord.sessionId`、`graphDir`；图服务 `glmHournessGraph.dirFor(cwd)`（`src/graph/service.ts`、`src/graph/index.ts`:77）。
- `src/shared/tool-names.ts` 的 `MEMORY_TOOL_NAMES`（三个名字）、`tests/contracts.spec.ts`:56–60 的断言、`src/glm-prompt/index.ts`:121 的 `memorySectionApplies`（R5-02）。
- `eslint.config.js`:39–41 与 `scripts/packages.mjs` 文件头：`src/shared/**` 不得导入任何包目录；`scripts/preflight-bundle.mjs` 第 1 项：`ui/src/` 下每个文件恰属一个客户端包（R5-01、R5-07）。

邻居设计与图：

- M3 附录 0.5：§3.5 第 6 步（批注不带 `relay`）、三种固定说法与 `answerKindOf`（`ANSWER_MARKS.agree`「人在对话里同意」、`add`「人在对话里补充：」、`reject`「人在对话里否掉：」）、`confirm`/`release` 同意时 `edit` 的 `stage` 带 `relay` 且 `reason` 以 `agree` 开头；§2.4 导出 `mainAgentOf`、`holderHome`，并把持有者记录搬进 `.llm/` 的改动推迟；§3.14.7 的退回例外（模块 `release`→`design`，`graph_edit` 不带 `relay`）；§3.4 `propose_to_human` 的 `kind: 'question'`。
- M7 0.6：§3.12.4 的 `weeklyReport` 只带 M5 的 `stats`；§3.5.5 只有 `stats`、`hygiene`；§3.12.2 的 `ladderProposals(norms, violations, decided)`；§3.15 的固定栏名 `候选标定题：`；全文检索没有 `correctionSignals`、`recurrences`、`learning_signals`、`learningDigest`、「纠正与学习」。
- 规则板 0.10：§7.1（把 `projectDirOf` 写成连带追加 `.git/info/exclude`）、§7.4（`openRulesBoard` 的 `projectDir` 随 `projectDirOf` 加）、§10.7（M5 一条，撤回改第 7 条经验）；循环板 0.6 引用 `redactSecrets`、`src/data/project-root.ts`、`src/data/lock.ts`，与 M5 §5.3、§5.5、§5.6 一致。
- plain-ui 0.7 与 0.8：§4.7 的 `Board`/`BoardState`、经验板「人删条目也在对话里说（M5 定）」。
- 图：15 个被引节点（`m5`、`lessons`、`m7`、`rules`、`m3`、`bootstrap`、`ablation`、`risk-calib-read`、`question-31`、`prompt-fixes`、`m3-main-persona`、`d-memory-scope`、`d-freeze-until-dogfood`、`d-agent-examples`、`m8-plain-language`）都存在；`m5` 节点 2026-10-30T10:13Z、13:04Z、13:12Z 与 `lessons` 节点 06:11Z、06:25Z 的批注与 §1.1、§5.5、§8.3 的引用一致。

### 未核实或有误的假设（本轮）

- 有误：「`panel-row.ts`:88 是今天仓库里唯一以 `human` 写图的地方」（§3.6 说明段），还有 `run-control.ts`:134–135（R5-05）。
- 有误：把访问器放在 `src/shared/main-agent.ts`（R5-01）。
- 有误：§15 说正文扫描已无叙述 0.3 的余项，§8.2 还有一行（R5-06）。
- 有误：`meaning` 示例 `edit:goal.stage`（R5-04）。
- 未核实：`mainAgentOf` 在 M3 把持有者记录搬进 `.llm/` 之后的形状（U19）。当前导出形状已对过，见上。
- 未核实：M3 附录 0.5 第 6 步合入之后，`record_human_answer` 写的批注开头与 `src/shared/answer-marks.ts` 里的字面一致（U16，设计里已有契约测试兜底）。
- 未核实：主 Agent 在人要求改字段时会带 `relay`（U20，模型行为，设计里已写不带时信号偏少、不误报）。
- 未核实（本轮没读）：`DeferredToolCall` 路径上 GLM 主 Agent 能按提醒里的名字调到 `learning_signals`（与已有的 `lessons_merge` 同一机制，U18 的分类）；用户 profile 补丁第 67 至 69 行的 `home`；`remote.workspaceFiles` 在桌面版上读工作区外文件（U4）。维持前几轮的分类。
- 维持：U1 至 U5、U8 至 U11、U13、U14、U16 至 U20。

### 设计依据的学科（§2.0）对照（本轮）

- 可靠性工程与数据库：`learn-notified` 先写记录再注入，写失败不注入，重启与压缩不重复；项目目录被删后的重建靠 `ENOENT` 重试一次。差处只有摘要「没变化」时的行为（R5-03）。
- 提示词工程：新增的摘要提醒是对话末尾的 `<system-reminder>`，不动系统提示词；延迟工具不进常驻前缀。
- 认知负荷：不新增给人的待决；D1 按四行方案写，量过。
- 安全工程：`learning_signals` 只读，子 agent 被拒（`role`）；`examples` 只带节点 id 与时刻，`learn-notified` 的 `data` 只带组键，不带批注原文。
- 工程规范（`AGENTS.md`）：新增的文件清单要与仓库的导入边界和目录表一致（R5-01、R5-07）。
