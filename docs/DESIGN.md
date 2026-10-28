# GLM-Hourness 总体架构与底层设计

版本：0.3（2026-10-27）
状态：生效。取代设计稿 v0.1（原 `docs/DESIGN.md`）、运行时设计 v0.1 的底层部分（`.llm/docs/03-runtime-design.md` §1/§2/§5/§6/§10）与差异底账 v0.1（`dsh-glm-dialect/docs/02-dsh-zcode-divergence.md`）。旧文本见 git 历史（提交 `c518317`、`9266fb6`）。
前置：`CHARTER.md`。编排层见 `ORCHESTRATION.md`。

标注：〔实读〕代码或源码已读；〔实测〕真网或真机验证过；〔推断〕由代码与数据推出，未在真机逐项验证；〔定案〕用户决议；〔规划〕尚未实现。

## 1. 范围与基线

| 项 | 基线 | 依据 |
| --- | --- | --- |
| ZCode | 3.16.3 | 用户定案 2026-10-27；本机安装版为 3.16.3（卸载注册表）〔实读〕 |
| DSH | Desktop 0.2.1-rc.3，profile `desktop` | 官方类型 `@deepseek-ai/dsh-llm@0.2.1-rc.3` 等作为 devDependency |
| 模型 | GLM-5.3、GLM-5.3-Flash | 通道目录 |

本机 ZCode 安装版被用户打过补丁（用户确认 2026-10-27），只能作为机制参考，不能作为逐字文本来源。逐字文本以 ZCode 官方源码为准：`reference/ZCode`（`package.json` 版本 3.16.2，2026-10-20 同步）；在已比对的文本上，源码、本机 3.16.3 安装包与 pristine 3.15.1 三者一致（用户补丁的安全声明除外）。复核结果见 §5.9。

反向代理（`zcode-proxy.exe`，8317 端口）不在本项目范围内〔定案 2026-10-27〕。任何插件行都不识别、不依赖反代路由。代码、脚本输出、界面文字与文档中把反代说成在链路上或等待退役的描述已删除（2026-10-28，`ROADMAP.md` M1.3）。仍会出现的相关字样有三类，均不表示链路上有反代：移植模块的出处注释（`reference/zcode-api` 的 `src/proxy/...`；zcode-api 本身是一个反代工程，本项目只移植它的通道模块）；ZCode 服务端配置的 `proxyEndpoint` 字段，那是 ZCode 自己的端点路由（§4.4）；用户 profile 中指向 8317 端口的 pi-ai `glm` 路由属于用户配置；用户 2026-10-28 把清理交给 agent，L4 第二轮通过后删除（项目图 `m1-cleanup`）。`ORCHESTRATION.md` §4.2 的需求卡示例保留用户最初的一句话原话。

## 2. 架构总览

### 2.1 分层

```
GLM-Hourness
├─ 底层
│  ├─ 通道：glm-llm（adapter）、glm-login（命令）
│  └─ 方言：glm-prompt（提示词、工具面与工具检索）、glm-compact（压缩镜像）
└─ 编排层
   ├─ data（数据目录服务，§2.4）
   ├─ guard、memory、workflow、hourness（用量与报告）
   └─ 呈现：独立 UI bundle
```

### 2.2 插件行（现状）

| 行 id | 入口 | 层 | 现状 |
| --- | --- | --- | --- |
| `glm-hourness/glm-llm` | `dist/glm-llm/index.js` | 通道 | 真网冒烟通过〔实测〕；2026-10-28 桌面版 L4 真实会话通过（GLM-5.3 多轮工具调用、GLM-5.3-Flash 收图）〔实读会话记录〕；凭证目录见 §2.4 |
| `glm-hourness/glm-login` | `dist/glm-llm/login-row.js` | 通道 | `/glm-login`、`/glm-status`（凭证状态与行健康表，§2.5）、`/glm-logout` |
| `glm-hourness/glm-prompt` | `dist/glm-prompt/index.js` | 方言 | 见 §5；另带高峰提醒（本项目的 notice，`ORCHESTRATION.md` §11.4） |
| `glm-hourness/glm-compact` | `dist/glm-prompt/compact-row.js` | 方言 | 见 §5.6 |
| `glm-hourness/data` | `dist/data/index.js` | 编排 | 数据目录服务 `glmHournessData`，见 §2.4 |
| `glm-hourness/guard` | `dist/guard/index.js` | 编排 | 见 `ORCHESTRATION.md` §6 |
| `glm-hourness/memory` | `dist/memory/index.js` | 编排 | 见 `ORCHESTRATION.md` §8 |
| `glm-hourness/workflow` | `dist/workflow/index.js` | 编排 | 仅记录派遣类工具调用 |
| `glm-hourness/hourness` | `dist/ui/index.js` | 编排 | `/hourness` 命令：晨报与积分口径的用量面板（`ORCHESTRATION.md` §11.2、§11.3） |
| `glm-hourness/graph` | `dist/graph/index.js` | 编排 | 项目图工具、每步投影与图文件门禁（`ORCHESTRATION.md` §2.5、§2.7、§2.10）；2026-10-28 经 L3 探针与 L4 桌面版验收后默认启用 |
| `glm-hourness/graph-panel` | `dist/graph/panel-row.js` | 呈现 | 面板写入命令 `/graph-apply`、运行控制命令 `/graph-run` 与现场投影 `graphLive`（`ORCHESTRATION.md` §2.10） |
| `glm-hourness/ui` | `ui/`（独立包） | 呈现 | 设置页说明 + 输入框「GLM 通道」pill |

### 2.3 两个 bundle 与一包一源

主包 `dsh-glm-hourness` 是多行 cordis 插件包。DSH 的 client-modules 按包名组成 web 启动图，同一个包若被多个 active Loader 行解析且声明了 `dsh.client`，启动失败（`resolves from multiple active Loader sources`）〔实测，2026-10-27 事故〕。因此 client 半必须放在独立的单入口包 `dsh-glm-hourness-ui`，主包不得声明 `dsh.client`。preflight 固化了这条检查。

仓库不拆分〔定案〕：两层都属于同一个项目，同仓维护。

### 2.4 数据目录服务〔已实现 2026-10-28，`ROADMAP.md` M1.4〕

原问题〔实读 2026-10-27〕：各行通过 YAML 各自配置 `home`，guard 的违规回调无法从配置传入，违规审计为空；2026-10-27 15:36–17:22（本地时间）期间 190 条用量记录与 1 条记忆写进了 `~/.dsh/profiles/desktop/.llm/`，`/hourness` 读不到。

数据分两级：

| 数据 | 位置 | 理由 |
| --- | --- | --- |
| 用量流水、加密凭证、本包的后备 deviceMid（ZCode 状态文件没有 deviceMid 时才用，§4.5b）；以后还有偏好类记忆 | 用户级目录 `$DSH_HOME/glm-hourness/`，默认 `C:\Users\29596\.dsh\glm-hourness\` | 额度跟账号走，一台机器一份，按项目拆开反而看不全 |
| 记忆（事实）、违规、决策 | 项目目录，即工作区 `.llm/` | 记录的是在这个项目里学到的东西与犯过的错，混在一起会互相污染 |
| 项目图 | 仓库内 | 项目知识，随 git 版本化（`ORCHESTRATION.md` §2.6） |

用户级目录的定案〔用户 2026-10-28〕：按 DSH 自己的布局。DSH 把全部用户数据放在一个根目录下，解析顺序是显式配置 > `$DSH_HOME` > `~/.dsh`（rc.3 `dsh-home-paths` `resolveDshHome`，lib/index.js:109，空白的 `$DSH_HOME` 视为未设）；插件在根目录下占一个以自己命名的目录（先例：`dsh-llm-deepseek` 写 `$DSH_HOME/llm-deepseek/files-v3.json`，llm-deepseek:824）。偏好类记忆随之放用户级目录，项目事实与项目规范放工作区。运行时包不能从本仓库解析（`glm-compact` 遇到过的同一问题，§5.6），所以三步解析在 `src/shared/data-home.ts` 照抄并注明出处，不导入 `@deepseek-ai/dsh-home-paths`。宿主根上下文另有一个 `dshHomePath` 服务（app-boot:4526），它不接受显式配置，本包不用。

实现：

- 新行 `glm-hourness/data`（`dist/data/index.js`）经 `ctx.provide` 提供 cordis 服务 `glmHournessData`，值为 `{userHome, projectHome?}`。`userHome` 按上面的顺序解析，行配置 `dshHome` 是显式项，测试与探针用它指向临时目录；`projectHome` 取行配置，bundle 默认为本仓库的 `.llm`（与通道两行相同的 `USERPROFILE` 相对写法）。激活期不做 I/O，不抛错；流水在第一次写入时建目录。
- 流水路由（`src/memory/audit.ts`）：用量写 `<userHome>/audit/usage.jsonl`，违规与决策写 `<projectHome>/audit/`。各行的目录在每次写入时解析，所以数据行晚于使用者激活也不影响。写入失败不抛给调用方，每条流水第一次失败时在控制台报一次（缺目录也算失败）。
- 取值顺序：项目目录取行配置的 `home`（用户 profile 补丁给 memory、workflow、hourness 配了仓库 `.llm`，照旧生效），没有再取服务的 `projectHome`；用户级目录只取服务，没有数据行就不写用量，保证没有任何一行把用户级数据写到数据行没解析过的地方。
- 各行：guard 每次拦截都写违规流水，`onViolation` 回调删除；memory 的用量只经服务写用户级目录，记忆工具仍用行的 `home`，没有 `home` 时只关记忆工具；workflow 的决策与 hourness 的报告按上面的顺序取目录；`/hourness` 从用户级目录读用量，缺哪个目录就在输出里写明。
- 验证：L2 覆盖三步解析、服务提供与撤回、取值顺序、有无服务两种情况；L3 探针确认数据行在真运行时上提供服务，用量只落在场景的用户级目录、真实的 `~/.dsh/glm-hourness` 不变，guard 拦下的 shell 写入在场景项目目录留下违规记录（带规则、工具、agent 与会话 id）。数据行经探针证明后默认启用。

迁移〔2026-10-28〕：从 `~/.dsh/profiles/desktop/.llm/`（只读）与仓库 `.llm/audit/usage.jsonl` 复制，按整行去重。用户级用量流水共 1080 条：仓库 890 条加旧目录 190 条，两者没有重复，按时间排序，最晚一条 2026-10-27T12:29:08.993Z。旧目录的 1 条记忆（`glm-hourness-handoff`）并入仓库 `.llm/memory.json`；旧目录的 3 条决策在仓库决策流水里都已存在。源文件未改动，旧目录随清理删除（项目图 `m1-cleanup`）。桌面版重启加载新代码之前，运行中的旧代码仍会把用量追加到仓库 `.llm/audit/usage.jsonl`，重启后需补拷一次（同一节点）。

凭证与 deviceMid〔定案 2026-10-28，用户选 A；已实现 2026-10-28，L4 验收之后〕：保留加密凭证文件，搬到 `$DSH_HOME/glm-hourness/`，本包的 deviceMid 随行。请求实际发送的 deviceMid 自 m1-parity 起取 ZCode 状态文件里的那个，本包的只在 ZCode 没有时作后备（§4.5b）。加密密钥由 `GLM_HOURNESS_CREDENTIAL_SECRET` 或 `HOME`/`USERPROFILE`、平台、架构推导（§4.1，`src/glm-llm/auth/store.ts`），与文件路径无关，搬家后同一台机器照样能解密。

- 解析：`glm-llm` 与 `glm-login` 的 `home` 改为可选，`credentialHome(home)`（`src/shared/data-home.ts`）取非空的行 `home`，否则取用户级目录。两行不读数据目录服务：通道行激活时数据行可能还没激活，而凭证目录在激活时就要定下来。bundle patch 删去两行的 `home`；探针与测试仍显式传 `home` 指向临时目录。
- 文件：两份文件已复制到 `C:\Users\29596\.dsh\glm-hourness\`，与仓库 `.llm/` 里的原件逐字节相同。原件保留到桌面版重启、确认新代码从用户级目录读到凭证之后再删（项目图 `m1-cleanup`）：重启前运行中的旧代码仍读写仓库 `.llm/`，期间若重新登录，删之前要先把较新的一份补拷过去。

### 2.4a 运行时契约来源〔实读 2026-10-27〕

`reference/deepseek-harness` 的源码版本号同样标 0.2.1-rc.3，但它是 2026-10-23 的主干，接口与桌面版运行时不同。桌面版运行时的包已从 `app.asar` 导出到 `reference/dsh-desktop-0.2.1-rc.3/`（只有编译后的 `lib`，没有 `.d.ts`），以它为准。已确认的差异与事实：

- 工具服务没有 `executable()`；按名查定义用 `get(name, scope)`（受限制隐藏的全局工具读作不存在）。
- `register(definition)` 没有第二个参数，不存在 `when` 激活谓词；作用域内注册遮蔽全局同名工具。
- `restrict()` 只能在作用域上下文调用，只过滤继承来的工具，不影响本作用域自己的注册；名字必须是已知的全局工具。
- 每一步先执行 `system-prompt/assemble`，再执行 `agent/pre-step`。发给模型的工具列表就是组装结果里的 `assembly.tools`（名称、描述、参数、`deferLoading`），组装瀑布可以逐请求改写它。
- 路由只出现在组装变量 `variables.provider` / `variables.model` 中（由 `installModelSelection` 注入）；`agent/pre-step` 载荷只有 `{agent, messages, turn, step, signal}`。
- 工具执行按名在调用方作用域的可见定义中解析，与本次请求的工具面无关：不在工具面里的已注册工具被直接调用时照常执行。
- `tools.execute(input)` 让一次调用走完 pre-execute、guard、执行、post-execute 与结果渲染；带 `parent` 令牌的调用被各监听器视为传输层子调用（`run_code` 的先例），会话检查点等监听器跳过它。
- `agent/pre-step` 的决策 `messages` 会作为该步输入追加进会话；inbox 按消息 `id` 去重，重复或缺失 `id` 会抛错，因此合成 notice 必须带 `id` 与 `role`（与 `createUserMessage` 同形）。
- `session.deriveMessages()` 给出请求可见的历史（已应用压缩投影）。消息 `source` 只校验 `kind` 非空，其余字段原样保存。

影响：`glm-prompt` 与 `toolsearch` 依赖 `executable()` 捕获原生执行器，在桌面版运行时会抛错；`glm-prompt` 的异常被捕获后，提示词改写与别名都不会安装。L3 探针确认（2026-10-27）：GLM 路由下系统提示词仍是 DSH 原文，工具面是 28 个原生工具，模型调用 `Read` 得到 `unknown tool "Read"`；工具检索也没有延迟任何工具。

#### 接口对照表〔实读 2026-10-28，`ROADMAP.md` M1.6〕

本包用到的每个 DSH 钩子、服务成员与载荷字段，逐项对照 `reference/dsh-desktop-0.2.1-rc.3/<包>/lib/index.js`。证据写作「包:行」，包名省略 `dsh-` 前缀；`官方` 指已安装的官方 `.d.ts`（`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-attachment`）。结构类型集中在薄适配层：`src/shared/dsh-min.ts`（宿主钩子、服务、载荷）与 `src/shared/lm-min.ts`（LLM 消息与流的词汇、附件服务成员）；各行不再自带宿主类型。宿主升级时，先重新导出运行时包，再按本表逐项复核这两个文件。

插件与 Loader：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| 模块导出 `name`、`inject`、`Config`、`apply(ctx, config)` | 全部行 | cordis:1625–1635（读 `plugin.name`、`plugin.Config`、`plugin.inject`），cordis:1536（`plugin.apply`），cordis:956–961（`Config` 经 `~standard` 校验） | 一致 |
| Loader 行的 `inject` 与模块的 `inject` 合并 | glm-llm、glm-login、memory、hourness | cordis-plugin-loader:631 | 一致 |
| `ctx.on(name, listener, options)`；`prepend` 排到最外层，`global` 跳过分发过滤 | 全部行 | cordis:372–381、cordis:263；服务的过滤只认同一 isolate，cordis:1785–1787 | 一致 |
| `ctx.get(name)`：不需要 inject，提供方 fiber 未激活时为 `undefined` | glm-llm（`attachments`、`fs`）；guard、memory、workflow、hourness（`glmHournessData`，每次写入或命令调用时读）；glm-login（各行的 `glmHournessHealth/<行>`，`/glm-status` 调用时读） | cordis:763–766 | 一致；L3 探针实测 guard 与 memory 经它拿到数据行的目录，`/glm-status` 经它读到各行的健康视图 |
| `ctx.provide(name, value)`：服务归调用方 fiber，同名第二个提供方抛错，返回的 disposer 撤销服务，fiber 卸载时自动撤销 | data（`glmHournessData`）；全部主机行（`glmHournessHealth/<行>`，§2.5） | cordis:800–830（经 `fiber.effect` 注册）；同一用法 cmdline:29–31 | 一致；激活期的抛错被捕获，降级为 warn |
| `ctx.inject(names, callback)`：所列服务都在时在子 fiber 里调 callback，其中一个离开时卸载这个 fiber；callback 返回的函数是它的 disposer | graph-panel（`sessionProjections`；`agents` 与 `subagents` 一起，停子 agent 用） | cordis:1600、cordis:1071（返回 callback 的结果）、cordis:1142–1143（返回函数即收为 disposer） | 一致；L2 假宿主 `fakeInjector`（`tests/fake-rc3.ts`）按此建模 |

事件：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `agent/created`（serial，`{agent, source, signal?}`） | glm-prompt、guard、graph | agent:581–585 | 一致 |
| `system-prompt/assemble`（waterfall，`(assembly, context, next)`，按 agent 作用域分发） | glm-prompt、guard（规则声明节） | system-prompt:398；`assembly` 的 `sections{name, text, interpolate?}`、`contexts`、`tools{name, description, parameters, deferLoading?}`、`variables` 见 system-prompt:365–393；完整节在瀑布之后恢复，system-prompt:399–405；`interpolate: false` 的节原样渲染，system-prompt:109–118 | 一致 |
| 组装变量 `variables.provider` / `variables.model` | glm-prompt、guard（`src/shared/route.ts`） | agent:167–181（`installModelSelection` 在 `next()` 之后写入） | 一致 |
| `session/event`（只观察，`(session, event)`，在 `append` 内同步调用）；事件冻结为 `{type, seq, time, data}` | guard（影子兜底） | session:1517–1536（`append`）、session:1579–1598（`commit` 同步通知观察者）；`turn/start` 的 `data.turn` 见 agent-loop:945；`workspace/changes` 的 `data.turn` 见 workspace-changes:871 | 一致；观察者运行时摘要还没存进去（workspace-changes:871 先追加事件，873 才存摘要），所以晚一个微任务再读 |
| `session/disposed`（只观察，`(session)`） | guard（影子兜底） | session:1925–1936 | 一致 |
| `agent/pre-step`（waterfall，`{agent, messages, turn, step, signal}`；默认决策 `enter` 带本步认领的消息） | glm-prompt（工具检索公告、todo 提醒、高峰提醒）、graph（每步投影） | agent-loop:901–925；`agent` 由 agent:241–245 并入；空决策守卫照抄 agent:193–197 | 一致；本节上文原写载荷无 `turn`，已更正 |
| `tools/pre-execute`（waterfall，`(exec, next)`，默认 `allow`） | guard、workflow、graph（图文件门禁，`prepend` 注册） | tools:3320–3321；决策 `allow` / `deny{reason, info?}` / `ask` / `cancel`，tools:3322–3345；拒绝时结果为 `Error: ` 加理由，工具体不执行，tools:3337–3353 | 一致；guard 的决策类型补上 `ask`、`cancel` 透传 |
| `exec` 字段：`callId`、`rootCallId`、`name`、`arguments`、`signal`、`agent?`、`parent?`、`schema?`、`deferContext`、`concludeTurn` | guard、workflow | tools:3229–3260 | **偏差已修**：guard 从 `exec.agentId` / `exec.sessionId` 取违规记录的 id，rc.3 没有这两个字段，记录里永远为空；改为 `exec.agent.id` 与 `exec.agent.session.id` |
| `llm/stream`（waterfall，`(options, next)`） | memory（用量流水）、glm-compact | llm:2397；`options` 即 `GenerateOptions`（官方 types.d.ts:506–548：`provider`、`model`、`messages`、`sessionId?`、`purpose?`），编译期检查 `LlmStreamOptionsContractCheck` | 一致；memory 对 `provider` / `model` 的 `'unknown'` 兜底删除（两者必填）。L3 探针实测每个 GLM 步一条用量记录，带 `sessionId`；压缩调用带 `purpose: 'compaction'` |
| `tools/post-execute`、`ctx.systemPrompt` | 无 | tools:3600 | 已无行使用（todo 提醒改到 `agent/pre-step` 之后），结构类型删除 |

服务：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `tools.register(definition)`：校验 `output{schema, render, presentationMeta?}`，`run_code` 保留；经 `agent.ctx` 注册即作用域注册 | glm-prompt（别名、检索工具）、memory（记忆工具） | tools:2974–2984 | 类型偏差已修：memory 声明了不存在的第二参数 |
| `tools.get(name, scope)` | glm-prompt | tools:3091–3094 | 一致 |
| `tools.execute(input)`，最终结果 `{isError, content, error?, value?, additionalContexts?, concludesTurn?}` | DeferredToolCall | tools:3210–3212、tools:3229–3260；tools:3687–3706 | 一致 |
| 工具体 `execute(args, exec)`，`exec` 就是 `createExecution` 的对象，带调用方 `agent`；返回值按输出 schema 校验；`render(exec.arguments, value)`、`presentationMeta` | 全部别名与自有工具；图工具从 `exec.agent.session.header.cwd` 解析图目录 | tools:3227–3260、tools:3406、tools:3637–3640、tools:3644、tools:3650–3653 | 一致 |
| `llm.registerAdapter(providers, adapter)`，返回带 `replace` 的 disposer | glm-llm | llm:1842；adapter 本身由 `AdapterContractCheck` 对照官方 `LlmAdapter`（§8） | 一致 |
| `llm.stream(options)` | glm-compact（重新派发） | llm:2393–2396 | 一致 |
| `commands.register(definition)`：`name` 须匹配 `/^[a-z][a-z0-9_-]*$/u`，`description` 非空；调用参数 `{commandId, agent, rawInput, attachments, signal}`，本包读 `rawInput` 与 `agent`（行健康按 `agent` 取会话），`/graph-run` 另读 `commandId`（记进消息的 `graphRun`）；`recordInput` 不为 false 时 `command/run` 记 `args`；结果 `success`（`text` 可选）/ `error`（`text` 非空） | glm-login、hourness、graph-panel | commands:266–269、commands:78、commands:148–180、commands:333–346、commands:379–385、commands:186–206 | 一致；hourness 上下文类型里多余的 `effect?: never` 删除 |
| `sessionProjections.register(definition)`、`sessionProjections.snapshot(session, keys)`：前者是调用方 fiber 的 effect；后者读一个会话所选单元的一致切面，每个值过单元的 view schema，未注册的键不在 `values` 里 | graph-panel（注册 `graphLive`；`/graph-run` 读主会话的 `graphLive` 与 `subagentCatalog`、子会话的 `graphLive`） | session-projection:68、session-projection:141 | 一致；探针 `liveOf` 用同一个 `snapshot` 读现场（L3） |
| `subagentCatalog` 投影的值：每个直接子 agent 一条 `{id, createdAt, mode, label?}`，`mode` 为 `one-shot`、`continuable`、`external`、`unknown` | 面板现场、`/graph-run`（只停非 external 的） | subagent:703–803（条目 schema 703–730，view schema 731，`subagentCatalogEntries` 774，单元 787） | 一致 |
| `agents.get(id)`：会话 id 对应的活 agent，没有时为 undefined | graph-panel（`/graph-run` 取子 agent 的状态与会话） | agent:596 | 一致 |
| `subagents.interrupt(targetSessionId, {kind: 'user', parentSessionId})`：取消一个活的直接子 agent 当前的回合，保留它的收件箱；不在驻留表里时是无操作；别的父会话的子 agent 抛 `UNAUTHORIZED` | graph-panel（暂停、重做） | subagent:3105、subagent:1258–1277 | 一致；L3 场景只停主 Agent，停子 agent 待 L4 |
| `attachments.readImageRequest(ref, target, signal?)`、`attachments.imageHostPath(ref)` | glm-llm（读图） | attachment:290、attachment:338（抽象），attachment-local:1038、attachment-local:1053；编译期检查 `AttachmentsContractCheck` 对照官方 `AttachmentStore` | 一致 |
| `fs.processPathFromHostPath(hostPath)` | glm-llm（卸载图片的占位路径） | fs:95、fs-local:792–795；pi-ai 同一用法 llm-pi-ai:2908–2909 | 一致 |
| `workspaceChanges.summary(sessionId, seq)`：`{turn, cwd, files[{path, display, …}], total, …}`，`path` 在会话目录内为相对路径、目录外为绝对路径；只记录有工作目录的顶层会话 | guard（影子兜底，`ctx.get` 读，不需要 inject） | workspace-changes:1019–1022、workspace-changes:871–885、workspace-changes:958–961；包说明 README（非 git 目录只列文件工具的改动） | 一致；该包只在 `dsh-web-app` 的 patch 里（web-app `cordis.patch.yml`:357），桌面版组合有，沙盒模板没有，探针在影子场景经覆盖层挂载 |

对象与消息：

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| agent：`id`（与会话共用）、`ctx`（作用域上下文）、`session` | glm-prompt、guard、工具检索 | agent-loop:748–781 | 类型偏差已修：结构类型里的 `model` 成员在 rc.3 不存在，删除 |
| 活 agent（命令调用与 `agents.get` 给出的）：`status`（`idle` / `running`）；`followup` 排到下一回合并唤醒空闲的 agent，`inject` 排到下一步、不唤醒；取消之后到来的唤醒型投递改进下一回合并锁存唤醒；`cancel(cause, {keepInbox: true})` 中止正在跑的回合、保留收件箱，与停止按钮相同 | graph-panel（`/graph-run`） | agent-loop:790–791、agent-loop:800–821；api-session-controller:1065 | 一致；L3 场景 `glm-graph-run` 核对开始与暂停（未跑） |
| session：`id`（取自 `header.id`）、`header{id, createdAt, cwd?, parentSession?, isSeeded}`、`deriveMessages()` | guard（`header.cwd` 作包含根）、工具检索、todo 提醒 | session:1344–1346、session:1820–1826、session:1672–1686 | 一致 |
| session：`requestHeader()`，日志里 `request/header` 事件的折叠，`config` 为该步准备好的调用配置（含 `provider`、`model`）；第一次请求之前为 undefined | guard（工具调用的路由，`src/shared/route.ts` `sessionRoute`） | session:1612、session:637（`foldRequestHeader`）、`canonicalHeader`；agent 循环每步调用模型之前写入，变化时才写，agent-loop:1218–1240 | 一致（2026-10-28 核对；L3 探针的 GLM 拦截与非 GLM 放行经它判路由） |
| `workingDirectory.get(session)`：会话的当前工作目录，无 I/O；没有记录时取部署默认目录 | guard（相对路径的解析基准，`ctx.get` 读） | working-directory:76–78；文件工具按 `ensure(agent)` 的结果解析相对路径，tool-fs:172、fs-local `localDisplayPath`（win32 上为 `resolve(cwd, path)`） | 一致 |
| 派生消息：助手消息 `source{kind: 'model', provider, model}`，工具调用为 `tool-call` 块；工具结果带 `toolCallId`、`isError` | todo 提醒、工具检索 | llm:66–78（`createAssistantMessage`），session:862–868、session:1217–1218 | 一致 |
| 合成 notice 与 `createUserMessage` 同形（`id`、`role: 'user'`、冻结） | 工具检索公告、todo 提醒、每步投影、运行控制的消息（经 `followup` / `inject` 进收件箱，来源 `glm-graph-run`） | llm:37–66 | 一致 |
| 压缩检查点：替换被摘要区间的用户消息，`source{kind: 'compact-checkpoint', compactionId, sourceCommandId?}` | 每步投影（重锚） | compaction:109、compaction:116–122；compaction-basic:595–598 | 一致 |
| 目标轮消息：`agent.followup` 投递的用户消息，`source{kind: 'goal', goalId, revision, round}`，下一步作为认领的消息进入 `agent/pre-step` | 每步投影（每拍） | goal-round-driver:144–151、164 | 一致 |

工具名：

| 名字 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| 别名覆盖的原生工具 `read`、`write`、`edit`、`read_image`、`glob`、`grep`、`pwsh`、`todo_write` | glm-prompt | tool-fs:251、549、690、986；tool-fs-search:782、1090；tool-pwsh:466；tool-todo:96 | 一致 |
| shell 工具与命令文本字段：`pwsh` 与 `bash` 读 `command`，`terminal_send` 读 `text`（终端后端可以是 bash 或 pwsh，`terminal-bash` 的 `shellDialect`） | guard（file-tools-only）、graph（图文件门禁经 `shellCommandOf` 取同一字段） | tool-pwsh:466、474；tool-bash:493、501；tool-terminal:320、328；terminal-bash:28、39 | **偏差已修（2026-10-28，M1.8）**：guard 对 `terminal_send` 读 `command`，rc.3 没有这个参数，终端输入从未被检查；改读 `text`，两种方言都判 |
| 文件工具与目标字段：`write`、`edit` 读 `file_path`，`str_replace_editor` 读 `path` | guard（影子兜底记本回合的目标）、graph（图文件门禁判断目标是否在图目录里） | tool-fs:549–555、690；str-replace-editor:267、281 | 一致 |
| 派遣工具 `spawn_teammate`、`send_message`、`team_task_create`、`team_task_update`、`subagent`、`subagent_fork` | workflow | experimental-tool-agent-team:251、293、365、457；tool-subagent-control:23；tool-subagent:313（`toolName` 默认 `subagent`），base 的 `cordis.patch.yml`:384、395（`subagent`、`subagent_fork` 两行） | **偏差已修**：`subagent_fork` 不在名单里，fork 派遣从未记录。L3 探针实测运行时工具面同时有 `subagent` 与 `subagent_fork` |
| compaction-basic 的指令开头、`purpose: 'compaction'`、经 `ctx.llm.stream()` 摘要 | glm-compact | compaction-basic:244、320、323 | 一致 |

派发与驱动循环〔实测 2026-10-28，L3 派发可行性验证；`ORCHESTRATION.md` §2.1、§3.2〕：M7 后台派发与 goal 驱动要用的接口。现在只有探针覆盖层里的验证插件 `scripts/probe/probe-dispatch.mjs` 在用，它不属于 bundle，也不是产品功能；证据列的「探针」指 `npm run probe` 的场景。

| 接口 | 使用者 | rc.3 证据 | 结论 |
| --- | --- | --- | --- |
| `subagents.startActivation({provider, label, childId?, request{prompt, parent, cwd?, agentOptions?, outputSchema?, maxDepth?}, signal, delivery})` 返回 `{childId, messageId?, result, dispose}`；子 agent 被接受时即返回 | 验证插件（M7 派发工具的计划用法） | subagent:3036–3048、1391–1477；`agentOptions` 合并在父 agent 的路由之上，subagent:315；深度只在传了 `maxDepth` 时检查，subagent:279–283 | 成立（探针 `glm-dispatch`）：宿主层插件 inject `subagents` 即可调用；派发工具当场返回，主 Agent 继续走步 |
| 结构化交回：`outputSchema` 启动前按对象 schema 校验，子 agent 得到 `structured_output` 工具，提交后回合结束；完成通知带 `Structured result: <JSON>`，`result` 带 `structured` 与 `stopReason` | 同上 | subagent:3046、873、889–960、526 | 成立；GLM 路由上 `structured_output` 是延迟工具，经 DeferredToolCall 提交同样被捕获 |
| 子 agent 的会话头：`cwd` 取父会话头，另带 `parentSession`、`origin: 'subagent'`、`delegationDepth`；请求里的 `cwd` 只成为工作目录 | guard（包含根读会话头 `cwd`）；M7 写入范围 | subagent:346–355、1415 | 实测如此：子 agent 的 `header.cwd` 是父目录，guard 对子 agent 的包含根因而是父工作区；写入范围不能拿会话头判定 |
| `tools/pre-execute` 里子 agent 的调用：`exec.agent` 是子 agent，`exec.agent.id` 等于预留的 `childId` | 验证插件（写入范围门禁） | tools:3229–3260；agent id 必须等于会话 id，agent:514 | 成立：每次调用都能映射回任务，拒绝以工具错误回到子 agent |
| `goals.create(agent, {objective, maxGoalRounds?})`、`goals.get(agent)`（视图带 `id`、`revision`、`phase`、`roundsStarted`、`maxGoalRounds`、`activation`）；`goal/changed` 事件 `{agent, change{operation}}` | 验证插件（驱动循环） | goal:611、635、877；goal-round-driver:243 | 成立（探针 `glm-goal`）：插件建的 goal 由驱动器照常推进 |
| `agents.create({sessionId, meta{cwd}, agentOptions})` 返回带 `agent` 的句柄；`agents.withoutInitiator(op)`；`agents.roots()` | 验证插件 | agent:453、414、623；agent-loop:1893 | 成立：不传 `parentAgent` 时新 agent 是根 agent |
| goal-round-driver 的 `agent/pre-step` 预约校验（下游监听器前后各一次）与收件箱竞争判定 | glm-prompt 的步 notice（目标轮上同样追加）；M2.3 的投影注入 | goal-round-driver:249、286–350 | 成立：`next()` 之后追加到决策 `messages` 的 notice 不破坏预约，下一轮照常开始；经收件箱投递会被判为竞争输入 |
| `update_goal` 的完成授权（直接人类输入或当前目标轮）与收尾消息 `<goal_complete>` | 验证插件（完成门禁） | tool-goal:27、54、72、365 | 成立：经 DeferredToolCall 调用时 `tools/pre-execute` 看到的是 `update_goal`，可以拒绝 `complete` |
| headless 运行器的退出条件：agent 空闲、`waitForChildren` 为假、会话序号不变 | 探针、标定运行器 | headless:349–351 | 实测：第一次静止空闲就退出，任务回合里建的 goal 一轮都跑不到（探针 `goal-headless`） |

### 2.5 行健康〔已实现 2026-10-28，`ROADMAP.md` M1.5〕

原问题：真实会话里「哪几行在起作用」无法回答，降级只在控制台打一行警告。现在每行自报状态：激活时报一次，此后每次在某个会话里起作用时报该会话的状态，第一次与状态变化时记下。`/glm-status` 在凭证状态之后列出调用会话的行健康表。

机制（`src/shared/health.ts`）：

- 每行激活时经 `ctx.provide` 提供自己的只读视图，服务名 `glmHournessHealth/<行>`。视图含激活状态和按会话的最近一次报告，每行保留最近 64 个会话。
- `/glm-status` 经 `ctx.get` 逐行读视图，取不到的行显示「未加载」（行未启用，或激活没有完成）。读写双方不依赖加载顺序，也不依赖共享的模块实例；行卸载时视图随 fiber 撤销。行健康不经数据目录行，`data` 行未启用时其他行照样上报。
- 会话以 agent id 为键（rc.3 的 agent 与会话共用 id）：组装与工具调用取调用方 agent，`llm/stream` 一侧取请求的 `sessionId`，命令取调用参数里的 `agent`（commands:379–385）。没有会话 id 的报告丢弃。
- 报告只在主机进程内存里，不写文件，不进模型可见的对话；桌面版重启后清空。

状态分生效、部分生效、未生效三种；表里另有「已加载，本会话未触发」与「未加载」。激活时就未生效的行（例如数据目录服务提供失败）不看会话报告，直接显示激活原因；`glm-login`、`data` 与 `graph-panel` 不按会话起作用，只显示激活状态（`graph-panel` 的激活状态在现场投影注册完成或失败时更新一次，`RowHealth.reactivate`）。`graph` 行在每次图工具调用与每次读图做投影之后报告本会话：图目录、节点数、校验错误、焦点是否设了〔2026-10-28，`src/graph/row-health.ts`〕。

| 行 | 何时上报 | 生效 | 部分生效或未生效的原因 |
| --- | --- | --- | --- |
| glm-llm | 激活；每次请求 | 已注册路由，写明套餐与凭证目录；上游已应答（ZCode 状态文件没有 deviceMid 时注明设备 ID 用本包自己的，状态不降级） | 未登录（凭证为空）；凭证不可读；未拿到项目令牌（写明 3.16.3 的原因，§4.1）；上游返回非 2xx 状态码 |
| glm-login | 激活 | 三个命令已注册 | 无（凭证目录总能解析，§2.4） |
| glm-prompt | 激活；每步组装 | GLM 路由，ZCode 提示词与工具面，工具检索 local 或关闭 | 非 GLM 路由；工具检索未安装（会话历史不可读，部分生效）；方言安装失败 |
| glm-compact | 激活；每次压缩请求 | GLM 压缩请求改用 ZCode 指令与摘要格式 | 非 GLM 路由；未识别 compaction-basic 的指令（原样放行） |
| data | 激活 | 用户级目录与项目目录都已解析 | 项目目录未配置（部分生效）；服务提供失败 |
| guard | 激活；每次根调用 | GLM 调用：门禁生效，写明圈禁根、违规目录与影子兜底是否可用 | 非 GLM 路由或路由未知（未生效，门禁不介入，`ORCHESTRATION.md` §6.2）；会话没有工作目录（圈禁规则跳过）；无项目目录（违规不落盘）。组合里没有 workspace-changes 时说明写「影子兜底未启用」，状态不降级：影子兜底只记录，门禁本身不受影响 |
| memory | 激活；每次模型调用 | 用量记入用户级目录，记忆工具可用 | 数据目录行未启用（用量不记录）；`home` 未配置（记忆工具关闭） |
| workflow | 激活；每次根调用 | 派遣决策记入项目目录 | 无项目目录 |
| hourness | 激活；每次 `/hourness` | 两个目录都可读 | 缺项目目录或用户级目录 |

UI 包的行运行在客户端，不在表内。

`/glm-status` 的第一行仍是凭证状态（设置页按它解析登录状态），空一行后是 Markdown 表。设置页目前把整段文本原样显示，表格的界面呈现属于 M8。

验证：L2 覆盖每行的上报与 `/glm-status` 的输出（`tests/health.spec.ts`；通道请求的三种结果在 `tests/glm-zcode.spec.ts`）。L3 探针在 GLM、非 GLM、压缩三个场景的最后一步调用本包真实的 `/glm-status` 处理函数，检查表列出全部 9 行、各行状态与原因符合路由，并确认表的内容没有进入任何模型请求。探针里 `glm-llm` 显示未加载：bundle 默认禁用该行，探针用的是脚本化 provider。

## 3. 路由判定〔已实现 2026-10-27〕

现状〔实读〕：各行判断「是否 GLM 会话」的写法不一致。`glm-prompt` 认 provider `glm` 或模型名前缀 `glm`；`toolsearch` 在 `agent/created` 时只认 `agent.model.current().provider === 'glm'`；todo 提醒依赖 `agent.model.current()`。rc.3 桌面版在 `agent/created` 与 `agent/pre-step` 上给出的路由为空（`legacy/desktop-dialect-triage.md`，git 历史），唯一可靠的信号是 `system-prompt/assemble` 瀑布中 `variables.provider` / `variables.model`。原生通道的 provider id 是 `glm-zcode`。由此推断 todo 提醒与工具检索在真机上未生效〔推断〕。

定案：

1. 方言跟着模型族走：训练分布是模型的属性。判据为模型 id 属于 GLM 族。
2. 通道跟着路由走：ZCode 身份是传输层的属性。判据为 provider id 是本通道注册的 id（默认 `glm-zcode`）。
3. 判定函数只有一处（`src/shared/`），所有行共用。
4. 只对准 rc.3 的可靠信号；兼容旧构建的分支删除。
5. 单测里的假宿主必须给出与 rc.3 相同的信号，不得提供真宿主不提供的路由字段。

第二个信号〔2026-10-28，L4 之后〕：没有组装结果的钩子（工具执行）读会话的请求头折叠 `session.requestHeader().config`（`sessionRoute`，§2.4a 接口对照表）。agent 循环在每步调用模型之前写请求头，所以工具执行时它就是发出这次调用的那一步的路由。guard 按它只拦 GLM 调用（`ORCHESTRATION.md` §6.2）。不另建按 agent 记录路由的跟踪器：两个信号都来自运行时自己的记录，跟踪器是第二份状态。

实现：`src/shared/route.ts`（`isGlmModel`、`assemblyRoute`）；`glm-prompt` 在 `agent/created` 时于 agent 作用域注册别名，并注册一个 prepend 组装监听器，在 `next()` 之后按本次请求的路由改写提示词节与工具面，不再调用 `restrict()`，也不再挂载 / 卸载。同一步里的其他钩子读的是该监听器本步的判定（todo 提醒读「GLM 路由且工具面有 TodoWrite」，§5.5）；原先按 agent 记录路由的 `createRouteTracker` 随 todo 提醒改到 `agent/pre-step` 后不再有使用者，已删除（2026-10-28）。单测替身 `tests/fake-rc3.ts` 只提供 rc.3 的接口。L3 探针 9/9：GLM 路由得到 ZCode 身份与别名面、`Read` 别名真实执行；非 GLM 路由保持 DSH 原文与原生工具。工具检索在同一个组装监听器里、别名改写之后执行（§5.7），探针扩到 15 项，全部通过。

## 4. 通道

请求流程（`ZcodeAdapter.stream`）〔实读〕：加载凭证 → 项目令牌（coding-plan，拿不到即失败，§4.1）→ deviceMid → 端点路由 → 组装身份头与鉴权头 → 签名 V4（失败放行）→ Anthropic Messages 传输。

### 4.1 凭证与登录

- 登录：ZCode 账号体系的 bigmodel 轮询登录（`/glm-login` 打开浏览器授权，5 分钟超时）〔实读〕。
- 模型请求的凭证〔已实现 2026-10-28，m1-parity 第 1、2 项，`src/glm-llm/auth/project-token.ts`〕：coding-plan 的每个模型请求用项目令牌（PAT）同时填 `Authorization: Bearer <PAT>` 与 `x-api-key: <PAT>`，签名也用它，与 3.16.3 账号模式相同（CLI `x5s` @3843063 把请求凭证设为 provider 的 `apiKey`、删掉配置里的 `authorization`/`x-api-key`，`T5s` @3843231 补 `Authorization: Bearer`；桌面 `AccountProviderRequestAuthService.resolveCurrent` 对个人套餐返回 PAT 与它的 `apiKeyId`）。此前两个头放的是 `{apiKeyId}.{secret}`，PAT 只喂签名。
- 项目令牌按 3.16.3 `ProjectAccessTokenClient`（CLI `sge` @1083993，缓存 `Urt` @1080367；桌面 `out/host/chunk-5YNPFY3L.js` 同一份代码）移植：用 OAuth 访问令牌原样调 `getCustomerInfo`，滤掉 `projectType` 为 `"2"` 的项目与因此没有项目的机构，取名含「默认机构」/「默认项目」者，否则取第一个；列出该项目的 API Key，取名为 `zcode-api-key` 的，没有就以 `usageScene: 1` 新建；`POST …/api_keys/{apiKeyId}/access_tokens`（`Authorization: Bearer <OAuth>`，体 `{clientType: "zcode", clientVersion}`）铸造。响应码 `200`、`0`、`"200"`、`"0"` 视为成功；缺 `enable` 视为启用，`enable: false` 报 `project_token_disabled`；有效期取 `min(expiresAt, 开始时间 + expiresIn)`，到期前 120 秒再减随机 0–60 秒刷新；429、5xx、网络错误、15 秒超时是暂态失败，旧令牌未到期时继续用并 5 秒后再试；铸造回 404 时删掉定位，下次重新定位；同一登录、同一账号的并发获取共用一次；铸造期间登录变了报 `project_token_scope_invalidated`。错误一律归为 3.16.3 的错误码（`project_token_login_required`、`project_token_disabled`、`project_token_project_unavailable`、`project_token_invalid_response`、`project_token_scope_invalidated`，其余 `project_token_request_failed`），不带服务端文本与令牌。
- 令牌被拒：最终响应是 401 且不是请求安全类失败（信封里的消息、原因或错误码为 `VERIFY_APIKEY_EXPIRED`、`VERIFY_SIGNATURE_INVALID`、`3007`）时，以被拒令牌的 SHA-256 强制重铸一次，作为新的尝试重发一次（新 `x-request-id`），只重试一次（3.16.3 `AccountRequestRetry` `$ye` @4144946、`isProjectTokenRejection` `$Hs` @4144643、`isRequestSecurityFailure` `Vrt` @1090655）。`Vrt` 读的「provider 错误码」由 3.16.3 的错误解析器给出，本包按信封的 `code`、`error.code`、`error.message` 近似。
- 拿不到 PAT〔定案 2026-10-28，用户选 B，项目图 `question-6`〕：按 3.16.3 账号模式失败即停（`ModelRequestAuthMissing`），不退回 API Key：模型请求、端点路由配置请求与签名握手一个都不发，流以 `glm-zcode: project access token unavailable (<原因>) — run /glm-login to sign in again` 失败，行健康为未生效「未拿到项目令牌（<原因>），按 3.16.3 不发送；运行 /glm-login」。原因是 3.16.3 的原文：凭证没有 OAuth 令牌时为 `Account request credential is unavailable: bigmodel`，没有账号 id 时为 `Account request credential is unavailable: account:bigmodel-individual-coding-plan`（桌面 `AccountRequestCredentialUnavailableError`，`out/host/index.js` +1200545），其余为上面的错误码。3.16.3 渲染层不翻译这些消息，原文直出。
- 存储：`<home>/credentials.json`，AES-256-GCM，原子写入〔实读〕。`home` 默认是用户级目录 `$DSH_HOME/glm-hourness/`（§2.4）。
- 风险：加密密钥由 `HOME`/`USERPROFILE`、平台与架构推导，看过源码即可算出；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖。凭证文件不入库，当前可接受。后续迁到系统钥匙串或 DSH 凭证服务〔规划〕。

### 4.2 身份头

LLM 平面（bundle `g6n` 形态）：`HTTP-Referer`、`User-Agent: ZCode/<ver>`、`X-ZCode-App-Version`、`X-Title: Z Code@electron`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-ZCode-Agent: glm`、`X-Platform`、`X-Os-Category`、`X-Os-Version`；不带 `X-Device-Mid`。上下文平面（bundle `TV`，用于端点路由与签名）带 `X-Device-Mid`，不带 `X-ZCode-Agent`。值经可打印 ASCII 规范化〔实读〕。

版本：统一为常量 `ZCODE_APP_VERSION = '3.16.3'`（`src/glm-llm/identity.ts`），供 `User-Agent`、`X-ZCode-App-Version`、OAuth 跳转参数 `app_version`、签名头 `X-Client-Version` 与项目令牌请求的 `clientVersion` 共用〔已实现 2026-10-27，此前分别为 3.14.0 与 3.15.1〕。

对照本机 3.16.3 安装包〔实读〕：

- LLM 平面身份头的组装函数（`buildCliZCodeSourceHeaders`）字段与顺序和本实现一致。
- `X-Title` 的来源标题：进程参数含 `app-server` 或 `agent-server` 时为 `electron`，否则为 `cli`（`kuc` @14423244）。桌面版以 `app-server` 方式启动 agent 进程，端点路由的配置请求也传 `sourceTitle: "electron"`（@15096557），所以桌面版的模型请求与配置请求都是 `Z Code@electron`。〔定案 2026-10-28，用户选 B，项目图 `question-8`〕本实现两处都发 `Z Code@electron`（`DEFAULT_IDENTITY.sourceTitle`），取代 2026-10-27 保持 `cli` 的定案；事实见 `FACTS.md` §1。
- 签名与项目令牌共用一个版本常量（构建期 `__ZCODE_VERSION__`），`X-ZCode-App-Version` 取自环境变量 `ZCODE_APP_VERSION`。安装包文本中前者未被构建替换，实际取值未验证；本实现两处都用应用版本。

### 4.3 签名 V4

移植自 zcode-api 的 `client-signing`，按 ZCode 3.16.3 安装包的 `ClientRequestSigningV4Signer` 核对（2026-10-28，符号与安装包偏移见 `FACTS.md`）〔实读〕：

- 握手：`POST new URL('/api/paas/c1f3a7e2/v2/client', <provider baseURL 的 origin>)`，baseURL 的路径部分丢弃。coding-plan 的 baseURL 是 `https://open.bigmodel.cn/api/anthropic`，握手发往 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`。`c1f3a7e2` 是字面常量，3.15.1 到 3.16.3 的六个包相同。凭证是请求的项目令牌（§4.1；3.16.3 `protectTransport` @3833810 用请求凭证建签名 fetch），按 `parseSigningCredential`（`D1r` @1087575）的 JWT 形式解析：头 `{alg: HS256, typ: JWT, sign_type: SIGN}`，载荷 `token_use: project_access` 且 `api_key` 非空，整段令牌是 HKDF 的 secret。`D1r` 的 `{apiKeyId}.{secret}` 分支本包不再移植：本通道不再持有这种凭证。请求头 `Authorization` 是原样令牌（不加 `Bearer `），请求体 `{accessToken, nonce, sig, ts}`，超时 10 秒。响应里的 `privateCipher` 用 HKDF 派生的 AES-GCM 密钥解出 Ed25519 私钥；此后每个请求带 Ed25519 业务签名与 PoW，共七个签名头。
- 组装：签名 fetch 包在端点路由 fetch 外面。签名器看到路由前的 provider URL，握手 origin 由它决定；签好的请求交给路由改写到 `zcode.z.ai/api/v1/ultra/...`，`X-ZCode-Authorization` 排在签名头之后。握手本身也经同一个路由 fetch；路由表按完整 URL 匹配，没有握手 URL 的映射时原样发出（§4.4）。
- 档位门：start-plan 不挂签名器（3.16.3 `requiresClientRequestSigning` 对 start-plan、off-peak、highspeed 返回 false）。签名器只按这一档位门判断，不按请求路径豁免：它收到的 URL 总是 provider URL。
- 失败梯：握手的网络错误、超时、非 200、业务拒绝、缺 `privateCipher` 都放行，本次无签发送。3.16.3 在四种情况下抛错、请求失败，本包四种都放行：凭证无法解析与请求缺 `x-session-id` 时跳过签名（沿用 zcode-api）；PoW 或 Ed25519 签名失败、握手进行中签名状态被作废（VERIFY 拒绝）时本次无签发送。401 VERIFY 拒绝后作废私钥、立即重新握手再签一次；第二次仍被拒就进入旁路，无签重发。
- 通知：经 `onEvent` 发出，每个（origin, 凭证）每种原因一条。通知只写本包自定的失败类别（如 `handshake_http_404`）与错误名（如 `TypeError`），不写错误消息：fetch 校验请求头时的错误消息会引用头的值，握手请求头的值就是凭证。业务拒绝的 `msg` 只在匹配 `^HANDSHAKE_[A-Z_]+$` 时作为原因保留，与 3.16.3 的日志规则相同。生产构造目前没有接 `onEvent`。

缓存〔实读〕：3.16.3 按（apiKey, 握手 origin）在进程内缓存私钥，没有 TTL，只有 VERIFY 拒绝才作废；并发请求共享进行中的握手；握手失败什么都不缓存，下一个可签名请求立即再握手。本包同样按（origin, 凭证）缓存私钥并合并并发握手，另有两处偏离〔定案 2026-10-28〕：

1. 握手失败后，该（origin, 凭证）60 秒内不再握手，期间的请求直接无签发送（`HANDSHAKE_FAILURE_COOLDOWN_MS`）。按 3.16.3 原样，持续失败时每个请求前都要握手一次；404 这类确定性失败重试没有意义，每次约 90 毫秒，串行排在模型请求之前。VERIFY 作废结束冷却，立即重新握手；凭证是项目令牌，令牌刷新后是新的（origin, 凭证），也立即握手。项目令牌的获取与刷新不再由签名层负责，此前签名层里的铸造与它的 60 秒失败冷却已删除（§4.1）。
2. 两次 VERIFY 拒绝后，该（origin, 凭证）永久旁路，直到进程重启。3.16.3 的旁路只对当前签名器代有效，它的运行时每个请求重建签名器，按源码推断只管一次请求。永久旁路避免每个请求都走三次发送的梯子。

曾有缺陷（2026-10-28 修复，`b6367d3`）：适配器把路由改写后的 URL（`zcode.z.ai/api/v1/ultra/...`）交给签名层，握手 origin 成了 `zcode.z.ai`，每次 404；失败又不留状态，每个请求前都重试一次（§4.5b 截包）。这个错误从基线导入（`9266fb6`）起就在，原先「握手对当前凭证失败」的归因不成立。同批改动：start-plan 不再签名；JWT 形式握手的 `Authorization` 由 zcode-api 的 `Bearer <jwt>` 改为原样 JWT，按 3.16.3 逐字。

实测〔2026-10-28，headless 沙盒真实网络运行 `net-1793188413414`，代码 `6af6c51`，coding-plan，`glm-5.3-flash`；记录在不入库的 `.agents/tasks/m1-signing/network-verify.md`。这次运行在 m1-parity 之前，模型请求的两个鉴权头还是 API Key〕：

- 握手 1 次：`POST open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`，HTTP 200，信封 `code` 200，带 `privateCipher`。握手请求只有 `authorization`、`content-type` 两个头，没有路由头，即服务端映射表没有改写握手 URL。`Authorization` 是原样 JWT（项目令牌，不加 `Bearer `），被接受；`Bearer` 形式没有试，代码不改。
- 项目令牌铸造的两步 `getCustomerInfo`、`access_tokens` 都是 200。
- 模型请求 6 次（会话标题 1 次、主请求 5 次），都发往 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages`，都带签名，都是 200，每次只发一次，没有出现 401 VERIFY 梯子：ultra 网关接受「`Authorization` 是 apiKey、签名用项目令牌派生的 apiKeyId」这一组合。会话约 80 秒，长于 60 秒冷却窗口，全程只握手一次（私钥按进程缓存）。
- 头序：签名块排在 `content-type` 之后，依次是 `x-client-ts`、`x-client-version`、`x-client-sig`、`x-session-id`、`x-client-nonce`、`x-app-id`、`x-client-pow`。`x-session-id` 是从原请求头移进签名块的会话头，其余 6 个由签名器新增；`x-client-sign-verified` 没有出现。`x-zcode-authorization` 是最后一个头，在签名块之后，与 3.16.3 的组装顺序一致。
- 用量：token 计量与同日 5 次无签运行同一形态（首个主请求缓存读 0，之后每步命中 97–100%，`cacheWrite` 恒为 0；整体命中率 80%，无签运行 80–87%）。coding-plan 的 1.5 倍套餐扣减不在用量流水里（流水只记服务端返回的 token 数），签名对它有无影响未知。
- 延迟：主请求到响应头 6.3–8.0 秒（首个主请求 31.0 秒），无签运行 1.5–5.8 秒。只有一个样本，时段与提示词都不同；计时起点在签名完成之后，差值在网络或服务端，未归因。

start-plan 只做了离线验证：3.16.3 对 start-plan 不签名（`FACTS.md`），本包对 start-plan 不建签名器，组装测试钉住这一点。start-plan 没有额度，没有发过真实请求。

桌面版：2026-10-28 以这份代码重启（M2 批次 L4，记录在不入库的 `.agents/tasks/m2-9-research/integration.md`），`/glm-status` 中 glm-llm 生效，GLM-5.3-Flash 会话正常应答，日志里没有本包的错误。桌面运行时下签名是否成功看不到：生产构造没有接 `onEvent`，那次也没有截包。

未决：签名对 1.5 倍套餐扣减的影响（需要套餐额度数据）；签名运行的响应头延迟偏高（需要同时段的签名与无签对照）；签名结果对系统可见，即状态里显示签名情况，每条用量记录标注是否签名（条款 7）〔规划〕。

### 4.4 端点路由

`GET https://zcode.z.ai/api/v1/agent/configs`，按 `data.proxyEndpoint.mapping` 改写请求 URL；成功缓存 300 秒，失败冷却 30 秒，超时 3 秒；任何失败保持原 URL。同一快照携带 3.16.3 的请求验证（captcha）开关〔实读〕。

配置请求的头〔已实现 2026-10-28，m1-parity 第 3 项〕：按 3.16.3 `buildProviderEndpointRoutingHeaders`（`FGs` @4196232）依次是 `User-Agent`、`X-ZCode-App-Version`、来源头（`Frn` @968479，经 `NGs` @4199110 规范名：`HTTP-Referer`、`X-Title`、`X-Platform`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-Os-Category`、`X-Os-Version`、`X-Device-Mid`）、`x-api-key-id`（请求项目令牌的 `apiKeyId`，3.16.3 路由端口从请求凭证取，`Ngn` @3839971）、`Accept`。不再发 `x-api-key`：此前这里发的是完整的 `{apiKeyId}.{secret}`。start-plan 的请求凭证没有 `apiKeyId`，配置请求不带 key 头。签名握手经同一个路由 fetch，带同一个 `apiKeyId`。

### 4.5 传输与档位

- 上游：`https://open.bigmodel.cn/api/anthropic/v1/messages`（路由改写前），`anthropic-version: 2023-06-01`〔实读〕。
- 档位：coding-plan（默认，签名，享 ZCode 渠道用量加成）与 start-plan（网关要求的三块系统提示、JWT 鉴权、currentDate 前缀）。start-plan 的三块系统提示属于底层：网关缺了就拒收（3012/405）。
- 状态：coding-plan 端到端真网成功，模型返回 `pong`〔实测，`scripts/smoke-zcode-authorized.mjs`〕；start-plan 只有单测。
- 系统提示词：DSH 把组装好的系统提示词作为历史开头的 `system` 消息下发，`GenerateOptions.system` 为空〔L3 探针实测〕。编码器把请求级文本与开头的全部 `system` 消息依次合并进 Anthropic 的 `system` 字段（与 DSH 自带 pi-ai 适配器同一规则）；之后出现的 `system` / `developer` 消息作为 `<system-reminder>` 包裹的用户轮发送。适配器不声明 `systemPromptUpdate: 'in-history'`，提示词变化时由 DSH 改写开头那条消息〔已实现 2026-10-27〕。此前编码器丢弃全部 `system` 消息而适配器又声明 in-history，原生通道在 DSH 会话里会发出没有系统提示词的请求；冒烟脚本直接传 `system` 参数，所以没有暴露。
- 消息编码〔已实现 2026-10-28，`src/glm-llm/anthropic.ts`〕：按 rc.3 的消息形状（`dsh-llm` `ContentBlockMap`）逐块编码，块序不变，空文本块丢弃，与 ZCode 的 AI SDK 转换一致：
  - 助手消息：`text` 块发文本，`tool-call` 块发 `tool_use`（参数解析失败时为 `{}`）；`reasoning` 块按 §4.5c 作为 thinking 块回传（2026-10-28 之前不回传）。
  - 工具结果：`tool_result`，纯文本结果为一个字符串，空结果为 `(no output)`；失败结果带 `is_error: true`（ZCode 的 error-text 输出）；带图片的结果见 §4.5a。
  - 用户消息：文本块各自成块；没有内容时发 ZCode 的占位 `(no content)`（3.16.3 安装包 `toAiSdkUserContent`），不再发空文本块。
  - 相邻同角色的消息合并为一轮，与 ZCode 经 AI SDK Anthropic provider 发出的形态一致：并行调用的多个工具结果与其后的提醒落在同一个用户轮里。
  - 曾有缺陷：编码器按 `reference/deepseek-harness` 主干的 `toolCalls` 字段读工具调用，rc.3 没有这个字段（全部运行时包中无一处使用），工具调用在 `content` 里以 `tool-call` 块出现。结果是助手的工具调用全被丢弃，下一条 `tool_result` 引用的 `tool_use` 从未发出。原生通道尚未在 DSH 会话中跑过，所以没有暴露；L3 探针的请求摘要现在读 `tool-call` 块，实测每条助手消息都带工具调用块。

### 4.5a 图片〔已实现 2026-10-28〕

- 形态：DSH 的图片是持久附件引用（`image` 块）。适配器经附件服务读出每个附件的请求版本（`AttachmentStore.readImageRequest`，rc.3 pi-ai 适配器的同一调用），编码为 Anthropic base64 图片块 `{type: 'image', source: {type: 'base64', media_type, data}}`。用户消息里的图片在用户轮内容中；工具结果里的图片放进 `tool_result` 的内容数组，与文本块按原顺序排列。这是 ZCode 对 Anthropic 路由的放法（3.16.3 安装包：AI SDK Anthropic provider 把工具结果的 `image-data` 转为同样的图片块；源码 `adapters/src/model/transform.ts`）。DSH 的 `read_image` 结果本身带一段文字信封（路径、尺寸、字节数），随图片一起发送。
- 不加 DSH 的附件把手文本：pi-ai 在每张图片前插一句附件标识与只读路径（`requestImageHandleText`），ZCode 不加（工具结果只保留媒体块），本通道随 ZCode。
- 请求版本的上限按 ZCode 的模型图片上限：长边 2000 像素（`READ_IMAGE_MAX_DIMENSION`、`MAX_IMAGE_ATTACHMENT_DIMENSION`），原始字节不超过 5 MiB 的四分之三，即 base64 不超过 5 MiB（`READ_IMAGE_TARGET_BYTES`）。`imageRequestTarget` 返回同一目标，满足 `LlmAdapter` 合同「与请求序列化所用目标一致」的要求。ZCode 对 Read 读出的图片另有 25,000 估算 token 的上限（base64 长度乘 0.125）；DSH 的目标按路由、模型与图片给出，分不出图片来自 Read 还是附件，所以不用这一条。
- 卸载：带 `offloaded` 标记的图片不读字节，发送 DSH 的占位文本（`offloadedImageText`，能解析只读路径时附路径）。卸载集合是会话的持久事实，每个路由都按同一集合发送。运行时包不能从本仓库解析，占位文本按 `dsh-llm` 0.2.1-rc.3 原文复制在 `src/glm-llm/images.ts`，注明出处。
- 附件服务与 `fs` 服务按请求经 `ctx.get` 读取，不注入（与 pi-ai 相同）；请求带图片而附件服务不存在时，请求失败并说明原因。
- 请求级图片预算：本通道不发 `IMAGE_OFFLOAD_REQUIRED`。ZCode 没有请求级的图片总量上限，GLM 端点的上限未知（§9）。
- 验证：编码器与适配器单测；L3 探针在 GLM-5.3-Flash 上读 PNG，探针 provider 用本通道的真实编码器与运行时附件服务编码同一请求，图片以 base64 PNG 出现在 `tool_result` 中；真网一次（coding-plan，`glm-5.3-flash`，32×32 纯红 PNG，问颜色），模型答「Red」，用量输入 41、输出 32 token〔实测 2026-10-28〕。只有一次请求，猜中的可能不能完全排除。

### 4.5b 提示词缓存〔实测 2026-10-28〕

缓存的形态〔实测，coding-plan，`glm-5.3` 与 `glm-5.3-flash`〕：

- 隐式前缀缓存，按 64 token 一块对齐。命中只覆盖此前请求的提示词，不含输出：工具循环里第 N 步的命中最多是第 N−1 步提示词长度向下取整到 64 的倍数（下称「最新前缀」）。回放 thinking 不能把命中延伸到上一步的输出。
- 网关按 `x-session-id` 做缓存亲和路由。同一会话的请求落到同一处，就命中最新前缀；落到别处，只能命中那里已有的前缀：同一会话更早的一步、其他会话共用的系统提示词与工具段（标定里是 8192、8256、8320、6784 这几个值），或者什么都没有。
- 会话的请求是只追加的〔实测 2026-10-28，headless 沙盒 5 次截包运行〕：会话内 tools、system 与首条消息逐字节不变，后一步只在末尾追加消息。其中 2 次存了原始请求体，15 对相邻请求逐字节对比，原始 JSON 唯一的差异是缓存断点 `cache_control` 从上一步的末块移到新的末块（`anthropic.ts` `markLastMessage()`）；每一步都有这样的移动，而第 3 步起全部命中最新前缀，所以它不是未命中的原因。前缀里没有时间戳，也没有逐步变化的提醒。没命中最新前缀的原因在服务端，不在请求内容。
- 端点在缓存字段上的口径：`cache_read_input_tokens` 是命中数，`input_tokens` 只算未命中部分，`cache_creation_input_tokens` 不出现（§4.6a）。

原因与处置：

1. 已修：原生通道每个请求随机生成 `x-session-id`（zcode-api 原本按会话固定，移植时丢了；ZCode 3.16.3 每个请求都带会话 id）。现在取 DSH 会话 id，去掉 `session-` 前缀（`upstreamSessionId`），同一会话的全部请求同值，压缩与会话标题请求也一样。辅助请求（压缩、会话标题）的 `x-zcode-session-type` 是 `other`，这是 ZCode 给非对话步的类型；实测会话类型不参与亲和（压缩形态的请求标 `other` 与 `main` 各 8 次，都命中最新前缀）。
2. 未解决，没有找到客户端可做的改动（分析见不入库的 `.agents/tasks/m1-cache-flash/report.md`）。现象只在 GLM-5.3-Flash 上：修复会话 id 之后（两轮标定加 5 次截包运行），GLM-5.3 第 2 步 12/12 命中最新前缀；Flash 17 个会话只有 7 个，第 3 步起 101/101 命中，命中的都是第 2 步的提示词，没有一次回到第 1 步。第 2 步的未命中分两个子类：
   - 只命中跨会话前缀（8/17）：读到的值（8192、8256、8320、6784）恰好是与更早会话共用的前缀长度，每次损失 3.8k–5.4k token。
   - 整段未命中（2/17）：读 0，每次损失约 12.1k token。它与会话标题请求共用会话 id 有关联，证据弱：共用 id 时 4/25 次，标题另起 id 或不发标题时 0/20 次（Fisher 单侧 p≈0.085）；下面的重放不发标题请求，也出现了 1 次。`8a08c1f` 撤回标题另起会话 id（`0814234`）时没有区分这两个子类。

   更大的损失在第 1 步：修复后 Flash 第 1 步 19/19 缓存读 0（标定与截包 17 个会话，桌面 2 个），而 GLM-5.3 第 1 步 12 个会话有 10 个读到约 8.2k 的共用前缀（每批第一个会话为 0）。按全价，第 2 步的未命中平均每个 Flash 会话损失约 0.6 积分，约占一个标定 Flash 会话的 4%；第 1 步若能读到共用前缀，每会话约省 1.4 积分。

   重放〔实测 2026-10-28，`.agents/tasks/m1-cache-flash/runs/replay-1793184760972.jsonl`〕：GLM-5.3-Flash 重发一份截包会话的前三步，每个会话换新的会话 id，第 2 步在第 1 步结束后立即发出（A0 臂）或 10 秒后发出（A10 臂），每臂 8 个会话，另有 1 个热身会话。第 2 步只命中跨会话前缀 A0 3/8、A10 2/8，A10 另有 1 次整段未命中，与间隔无关，「第 1 步写入的缓存在第 2 步到达时还没有就绪」这一假设不成立。两臂第 1 步都是 6/8 读 0；第 1 步读到共用前缀的 4 个会话，第 2 步 4/4 命中最新前缀；第 3 步 15/16 命中最新前缀。这些数据与「服务端把新会话的前两步放到不同节点」相容，请求体、步间延迟与标题请求上都没有可改的地方。剩下没试的是先发一个短请求绑定会话（W 臂），验证约需 50 积分，agent 按决策分级定为不试（项目图 `question-5`）。

   「缓存异步生效」的出处是 BigModel 缓存文档里示例 curl 请求体中的示范知识库文本（`.llm/docs/_bigmodel_md/cn__guide__capabilities__cache.md`，「八、最佳实践」第 2 条），不在文档的说明正文里，作为依据偏弱。

实测记录（统计后续请求是否命中最新前缀）：

| 场景 | 变体 | 命中最新前缀 | 整段未命中 | 部分命中 |
| --- | --- | --- | --- | --- |
| 8 步工具循环，glm-5.3-flash，约 14k token，3 个会话 | 每请求随机 `x-session-id`（修复前） | 11/24 | 7 | 6 |
| 同上 | 随机 `x-session-id`，请求体按 ZCode（`metadata.user_id`、thinking 回放、末条缓存断点） | 12/24 | 4 | 8 |
| 同上 | 固定 `x-session-id`，请求体不变 | 24/24 | 0 | 0 |
| 同上 | 固定 `x-session-id`，请求体按 ZCode | 24/24 | 0 | 0 |
| 标题请求与第一步并发，glm-5.3-flash，只看第二步 | 标题用会话的 `x-session-id` | 9/11 | 2 | 0 |
| 同上 | 没有标题请求 | 11/11 | 0 | 0 |
| 标定（DSH 真实运行，每格 3 次），修复前（`4cb8799`） | glm-5.3 / glm-5.3-flash | 46/46、29/45 | 0、4 | 0、12 |
| 标定，只固定会话 id（`8a212cd` 的代码） | glm-5.3 / glm-5.3-flash | 42/42、41/46 | 0、2 | 0、3 |
| 标定，全部修改，标题另起会话 id（`0814234`） | glm-5.3 / glm-5.3-flash | 46/47、36/40 | 0、0 | 1、4 |

Flash 没命中的位置：修复前第二步 4 次、之后各步 12 次；固定会话 id 后第二步 5 次、之后 0 次；`0814234` 第二步 4 次、之后 0 次。GLM-5.3 在 `0814234` 那 1 次比最新前缀少 64 token。修复前的桌面版 L4 会话（GLM-5.3，2026-10-28）17 次后续请求里有 2 次整段未命中、3 次只命中更早的一步。

缓存断点 `cache_control`：BigModel 文档写的是隐式缓存，实测有无断点命中相同（上表第 1、2 行；另有 3 个两步对照）。为了与 ZCode 的请求形态一致，最后一条消息的最后一块带断点（zcode-api `applyAnthropicCacheControl`）。系统提示词没有按 ZCode 拆成 cli_prefix、stable、dynamic 三块（ZCode 后两块带断点）：coding-plan 下本通道只发一块，拆分要在方言里标出分界，命中不受影响，暂不做（§5.8 #14）。

同批补上的请求细节（与缓存无关，按 ZCode）：每个请求都带 `x-request-id`、`x-zcode-session-type`、`x-zcode-trace-id`（3.16.3 `createModelRequestAttributionHeaders`）；请求体带 `metadata.user_id`，即 `{device_id, account_uuid: "", session_id}`，会话 id 与请求头相同（`createAnthropicRequestMetadataUserId`）。

设备 ID〔已实现 2026-10-28，m1-parity 第 9 项，`src/glm-llm/device-mid.ts`〕：`device_id` 取 ZCode 自己的 deviceMid，按 3.16.3 `ensureCliDeviceMid`（`Qro` @4062043）的读法：`<base>/.zcode/v2/telemetry-state.json` 的 `deviceMid` 字段，`<base>` 是去空白后非空的 `ZCODE_DATA_BASE_DIR`，否则是用户主目录（`CWs` @4062252）；文件读不出、不是 JSON 对象或字段不是非空字符串都算没有，结果按状态文件路径在进程内缓存。端点路由配置请求的 `X-Device-Mid` 按 3.16.3 `Kuc` @14468898 另读一次：去空白、只收可打印 ASCII、只缓存成功的读取，每次刷新配置都读（`Aui`）。与 3.16.3 的差异〔定案，m1-parity 简报第 9 项〕：3.16.3 在状态文件没有 deviceMid 时生成一个并在锁文件保护下原子写回；本包只读，不在 `~/.zcode` 下建任何文件，这时两处都用本包自己的 `<home>/device-mid.txt`，行健康的成功原因注明这一点。本机状态文件有 deviceMid，所以实际发送的是 ZCode 的值。

签名：修复签名之前的截包里，握手发往 `zcode.z.ai/api/paas/c1f3a7e2/v2/client`，每次 404，适配器在每个请求前都重试一次握手（约 90 毫秒），随后无签发送；端点路由把请求改写到 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages`（§4.4）。握手地址错是因为适配器把路由后的 URL 交给了签名层，已修，修复后握手返回 200（§4.3）。本节的标定、截包与重放都在修复之前，请求都是无签的〔推断〕。修复后的签名沙盒运行（`net-1793188413414`，GLM-5.3-Flash）第 1 步读 0、第 2 步命中最新前缀，只有一个会话，看不出签名对缓存位置有无影响。

### 4.5c 保留式思考〔已实现 2026-10-28〕

BigModel 的思考文档写明：保留式思考在 Coding Plan 端点默认开启，要把完整、未修改的 reasoning 原样传回，否则效果与缓存命中都会下降；交错思考加工具时，必须在返回工具结果时一并返回 reasoning（`.llm/docs/_bigmodel_md/cn__guide__capabilities__thinking-mode.md`）。ZCode 照此回放（3.16.3 `adapters/src/model/reasoning-history-normalization.ts`、`anthropic-reasoning-metadata.ts`）。本通道此前丢弃全部 reasoning。

- 实测〔2026-10-28，coding-plan〕：GLM 只在需要时思考（简单的工具调用请求没有 thinking 块）；thinking 块在 `content_block_start` 带空的 `signature` 字段，签名经 `signature_delta` 送达，24 个字符。端点不校验签名：正确签名、空签名、无签名字段、乱码签名、改过正文的原签名、外来正文加空签名，六种回放全部 200。
- 解码：每个 thinking 块的签名记进 DSH 的回放信封（`finish.replayState`，`{response: {kind: 'glm-zcode', version: 1, model}, blocks}`，每个发出的块一项，按首次出现的顺序；DSH 自带的 deepseek-messages 适配器用同一形状）。只有出现过 reasoning 块的响应才带信封。开始事件上已有签名时也认，随后的 `signature_delta` 替换它（ZCode `anthropic-stream-compat` 的兼容处理）。助手消息由运行时组装时，信封随消息存进 `source.replayState`；不归本适配器的历史路由，运行时会先剥掉信封（rc.3 `LlmRuntime.forAdapter`）。
- 编码，按 ZCode 的历史归一化：
  - 信封可用（kind、version、模型与消息来源一致，块数与类型逐项对齐）且消息来自同一路由（provider 与模型都相同）时，reasoning 带原签名回放。
  - 带签名的 reasoning 只回给签发它的路由；换了模型就删掉（ZCode `removeCrossModelReasoning`：签名绑定模型）。
  - 没有签名的 reasoning（本次改动之前的历史、信封对不上、其他适配器的历史）以空签名回放（ZCode 用空签名表示保留的未签名 thinking）。
  - 空正文且无签名的 reasoning 是流里的空壳，丢弃；只剩 reasoning、没有文本与工具调用的助手消息整条丢弃；请求以助手轮结尾时，去掉结尾的 thinking 块（ZCode `removeReasoningOnlyAssistants`、`removeTrailingReasoning`）。
- 与 ZCode 的差异：ZCode 在端点以签名错误拒收时会删掉带签名的 reasoning 重试一次（`repairReasoningHistoryAfterSignatureRejection`）。端点实测不校验签名，本通道没有移植这一步；若出现点名 thinking 签名的 400，再移植。
- 对缓存与成本的影响：命中率不变，输入变多。缓存只存提示词，不存输出（§4.5b），所以上一步的 reasoning 在下一步是未命中的输入，再往后才进缓存。标定（每格 3 次）每次调用的平均值，只固定会话 id 时与加上回放后相比：GLM-5.3-Flash 未命中输入 2294 → 2582、命中输入 10218 → 12203、输出 567 → 702；GLM-5.3 未命中输入 987 → 937（它的 reasoning 很短）。Flash 的输出也变多了，积分的差别不能全算在回放上。BigModel 文档说保留式思考提高效果与命中率；命中率的说法与实测不符，效果在两个起步任务上看不出（两次都是 12/12 完成）。升级后已有会话的第一次请求，历史里多出 reasoning，前缀与上一次不同，会有一次未命中。
- 验证：解码与编码单测，其中一条用 rc.3 真实的 `BlockAssembler` 组装解码结果，再编码下一次请求，确认签名回到同一路由、换模型时删除（`tests/glm-transport.spec.ts`）；真网一次完整往返（真实适配器加 `BlockAssembler`，glm-5.3）：第二步发出 `thinking`（64 字符，24 字符签名）、`text`、`tool_use`，端点接受。

### 4.6 模型目录与思考档位

- 目录：`glm-5.3`（GLM-5.3）、`glm-5.3-flash`（GLM-5.3-Flash）；上下文窗口 512,000；默认 `max_tokens` 32000〔实读〕。
- 输入模态按模型如实声明（`src/glm-llm/models.ts` `GLM_MODELS`）：GLM-5.3 没有视觉塔，只声明文本；GLM-5.3-Flash 声明文本与图像〔用户提供的事实 2026-10-28〕。目录外的模型 id 只声明文本。此前两个模型都声明图像。只声明文本的路由上，DSH 在适配器之前把请求里的图片换成文字占位（`dsh-llm` `projectImagesForTextModel`：「[image omitted because this model accepts text only; attachment sha256:…]」），`read_image` 拒读（「… does not declare image input; switch to an image-capable model to read images」），会话控制器拒收用户附图。
- 思考：GLM-5.3 系强制思考；effort 三档 `low` / `high` / `max`，默认 `high`〔定案 2026-10-27，五档词汇 API 接受但 GLM 不用〕。

### 4.6a 用量块

DSH 的 `TokenUsage` 各计数互不重叠：`inputTokens` 只算未命中缓存的输入，缓存读写分别记在 `cacheReadTokens` / `cacheWriteTokens`（官方类型注释）。Anthropic 流的 `message_start` 带 `input_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`，`message_delta` 只带 `output_tokens`。

曾有缺陷：解码器在 `message_delta` 上发出 `{inputTokens: 0, outputTokens}`，下游取最后一个用量块，于是输入计为 0；缓存读写从未解析。积分口径依赖这三项（`FACTS.md` §2.4）。现在整个流只在 `finish` 前发一个合并后的用量块，含 `cacheReadTokens` / `cacheWriteTokens`〔已实现 2026-10-27；真网冒烟实测 `inputTokens: 24, outputTokens: 3, cacheReadTokens: 0`〕。此前写入的用量流水中输入计数均为 0，不能用于积分统计。那版解码器的用量块没有 `totalTokens`，修正后的总带它；用量面板据此（provider `glm-zcode`、输入 0、无 `totalTokens`）识别修正前的记录，不计入积分，只报条数（2026-10-28，`ORCHESTRATION.md` §11.2）。

### 4.7 额度数据〔规划〕

通道负责取数，编排层负责展示：5 小时窗口剩余、周额度、积分余额、MCP 余额，以及错误码 1308/1310/1316–1321 携带的 `next_flush_time`。计算口径见 `ORCHESTRATION.md` §11 与 `FACTS.md` §2.4。

## 5. 方言

### 5.1 原则〔定案〕

- 行为习惯类内容逐字镜像 ZCode 3.16.3（训练分布）。
- 宿主事实类断言（界面呈现、权限语义、shell、路径、记忆位置）必须与 DSH 实际行为一致；对不上就按 DSH 实况改写，措辞贴原句形态。
- start-plan 档：除 agentsMd 节外，系统提示词与 ZCode 逐字节一致。
- coding-plan 档：安全声明段替换为用户的工程环境声明，其余按 §5.3 本地化。
- 只作用于 GLM 会话（§3），非 GLM 会话零影响。

### 5.2 提示词节

`system-prompt/assemble` 瀑布上以 `prepend` 注册的监听器在 `next()` 之后读取路由变量并改写节列表（rc.3 唯一可行的接缝）〔实读〕。

| 节 | order | 档位 |
| --- | --- | --- |
| `glm:cli-prefix` | -1001 | 两档 |
| `harness:identity`（同名替换 DSH 身份节） | -1000 | 两档；安全声明按档位二选一 |
| `glm:environment` | -900 | coding-plan，需配置 `env` |
| `glm:session-guidance` | 2300 | coding-plan |
| `glm:memory` | 2350 | coding-plan |
| `glm:persona`（汇报细度） | 2360 | 两档 |
| `glm:context-management` | 2400 | coding-plan |
| `glm:guard`（guard 行添加） | 最后一节 | 两档；列出生效的规则，`interpolate: false`（`ORCHESTRATION.md` §6.1） |

`glm:guard` 不属于方言：由 guard 行在自己的组装监听器里追加，只在 GLM 路由上出现，文本是本项目的（不在镜像文件里，不属于逐字声明）。两个 prepend 监听器谁在外层都一样，这一节总在最后：guard 在外层时追加在方言改写之后；guard 在内层时方言改写保留其余节的顺序，只把方言节插到身份节之后。规则只随会话目录变化，会话目录不可变，所以每步的系统提示词不变，不影响提示词缓存。

原先的 `glm:deferred-tools` 节（order 2500）已删除：ZCode 的系统提示词里没有 deferred 声明段，deferred 名单以 `<system-reminder>` 公告递送（§5.7）。

### 5.3 本地化清单（coding-plan）

| # | 节 | 处理 |
| --- | --- | --- |
| ① | Harness 块 | 「终端显示」改为「DSH Web GUI 显示」，其余逐字 |
| ② | Session guidance | 技能规则改写为 DSH 技能接缝 |
| ③ | Environment | ZCode 骨架，填 DSH 真实目录、git、平台、shell |
| ④ | Desktop context | DSH 无对应特性的部分裁掉 |
| ⑤ | Skills 引导 | DSH 技能清单 |
| ⑥ | 工具描述与 schema 中的行为断言 | 垫片必须兑现描述与 schema 的承诺，兑现不了就改写或删去该句；七个别名的处理见 §5.4。Grep 删去原生做不到的参数，Bash 改写 shell 与工作目录两行 |
| ⑦ | Context management | 逐字，承诺与 DSH 压缩一致 |
| ⑧ | Memory | 写入纪律改为 memory 工具族与工作区 `.llm` |
| ⑨ | Deferred 声明 | 不设；名单公告与工具检索按 ZCode 原文（§5.7） |

### 5.4 工具面

- 别名：`Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`TodoWrite`，执行时委托捕获的原生定义〔实读〕。七个别名的描述与 schema 都按 3.16.3 安装包重建，原文放在镜像文件 `src/glm-prompt/zcode-tool-text.ts`：第一批 `Read`、`Write`、`Edit`（含结果文本），第二批 `Glob`、`Grep`、`TodoWrite`、`Bash`（2026-10-28，含 Glob 与 Grep 的结果文本）。`Grep` 与 `Bash` 是本地化组合：镜像文件里是原文，删改在 `search-alias.ts` 与 `aliases.ts` 中完成，不属于逐字声明（别名规格标 `localized`）。
- 工具面：别名只遮住它实际包住的原生工具。`Read` 包住 `read`，组合里有 `read_image` 时也包住它；其余别名各包一个（`write`、`edit`、`glob`、`grep`、`pwsh`、`todo_write`）。被包住的原生工具从 GLM 请求的工具面中滤掉，非 GLM 请求则滤掉别名；两组都保持注册，逐请求在组装监听器里决定（§3）。L3 探针（2026-10-28）：GLM 首个请求 16 个工具（14 个常驻加两个检索控制工具），13 个延迟；非 GLM 请求 28 个原生工具。
- schema：七个工具都是 ZCode 发给模型的形态，即合同中的 zod 对象经 `toToolJsonSchema`（zod-to-json-schema 3.25.2，jsonSchema7，`effectStrategy: input`）转换后再加 `$schema`（2020-12）。所以有 `integer`、`minimum`、`exclusiveMinimum`、`minLength`、`additionalProperties: false`、`default`；Bash 的语义数字与语义布尔按输入类型转换为 `number`、`boolean`。rc.3 不校验原样注册的工具参数，这些关键字原样到达模型（L3 探针实测）。`Read` 用不带 PDF 的形态：ZCode 只对声明 PDF 输入的模型加 `pages` 参数与 PDF 说明行，GLM 不声明。
- 映射与兑现（Read，`src/glm-prompt/read-alias.ts`）：
  - 描述删去视频一行：DSH 没有视频输入。组合里没有 `read_image` 时再删去图片一行。其余各行逐字。
  - 结果按 ZCode 的 cat -n 形态渲染（`行号\t内容`），不用原生的 `行号: 内容` 外框。Edit 描述要求模型「去掉 Read 的行号前缀（行号加 tab）」，依赖这个形态。空文件回 ZCode 的空文件提醒。
  - 原生窗口受 2000 行与 50 KB 两个上限。窗口没读到文件末尾、且不是模型自己给的 `limit` 截住的，结果前加 ZCode 部分视图提醒的后两句（「Showing a partial view of lines …」「Use Read with offset … to continue …」）。第一句讲的是 ZCode 的 token 预算，与原生上限不符，不用。
  - `offset` 为 0 时按 ZCode 从第 1 行读（原生从 1 计）；`limit` 超过原生窗口 2000 行时截到 2000，结果用上面的提醒说明续读位置。垫片按原生默认配置写死 2000。
  - 图片扩展名（ZCode 的集合，与 `read_image` 相同）转给 `read_image`，`offset`、`limit` 对图片不适用，与 ZCode 一致；图片结果用 `read_image` 自己的渲染。
  - 图片一行不按模型取舍：ZCode 3.16.3 的 Read 描述只对声明 PDF 输入的模型加 PDF 一行（`resolveReadProviderDescription`），图片一行对纯文本模型也保留。所以 GLM-5.3 与 GLM-5.3-Flash 看到同一份描述（L3 探针实测）。两者在纯文本模型上的实际所得不同：ZCode 读图成功，请求里图片换成它的文字占位，后接一行「[Media omitted from provider request because the selected model does not support image input.]」（`createUnsupportedModelInputMediaText`）；DSH 的 `read_image` 在只声明文本的路由上直接报错，GLM-5.3 收到的是拒读错误（L3 探针实测）。两种结果都告诉模型看不到图片，本项目不改写这条错误。
  - ZCode 的二进制扩展名（`.exe`、`.zip` 等 19 个）与视频扩展名直接拒绝，组合里没有 `read_image` 时图片扩展名也拒绝；错误文本用 ZCode 的二进制拒读原文。
  - 输出合同：有 `read_image` 时是两个原生输出 schema 的 `oneOf`，渲染与 `presentationMeta` 交给产出该值的原生工具，参数先映射。
- 映射与兑现（Write、Edit，`src/glm-prompt/aliases.ts`）：
  - Write 映射 `file_path`、`content`。「覆盖没读过的已有文件会失败」由默认的 `fs-observation-policy` 保证：没观察过的目标按 create-if-absent 写，已有文件被拒（L3 探针实测，文件内容不变）。
  - Edit 映射 `file_path`、`old_string`、`new_string`；`replace_all` 按 ZCode 的语义布尔转换（`true`/`1`/`yes`/`y`/`on` 与对应的假值字符串，数字 1/0），其余值原样交给原生工具报错。「必须先 Read」「old_string 必须唯一」由原生 `edit` 与观察策略保证。
  - 原生 `write`、`edit` 在受限文件系统下多出 `sandbox_permissions`、`justification` 两个字段，沙盒拒绝时提示模型带上它们重试。原生声明了这两个字段时，别名把原生的字段定义原样追加到 ZCode schema 的 `properties` 末尾并转发；原生没有时 schema 与 ZCode 逐字一致。这是本地化，不属于逐字声明。
  - 结果文本用 ZCode 的原文（「File created successfully at: …」「The file … has been updated successfully.」「… All occurrences were successfully replaced.」，后接「(file state is current in your context — no need to Read it back)」）。值的形状不对时退回原生渲染。
- 映射与兑现（Glob，`src/glm-prompt/search-alias.ts`）：映射 `pattern`（按 ZCode 去掉首尾空白）与 `path`。原生按修改时间从旧到新列出全部匹配（`rg --sort=modified`），垫片倒序成 ZCode 的从新到旧，取前 100 条，超出时加 ZCode 的截断提示（「(Results are truncated. …)」），没有匹配时回「No files found」。路径按 ZCode `toDisplayPath` 显示：工作目录内的相对路径用 `/` 分隔，其余原样。原生与 ZCode 一样不认 `.gitignore`、排除 VCS 目录。
- 映射与兑现（Grep）：原生 `grep` 只接受 `pattern`、`path`、`include`，返回全部匹配行（`path`、`lineNumber`、`line`）。垫片兑现的参数：
  - `pattern` 按 ZCode 去首尾空白；`-i` 转成 ripgrep 的内联标志 `(?i)` 加在模式前。
  - `glob` 按 ZCode 的拆分规则（空白分隔；不含花括号的片段再按逗号分隔），`type` 按 ZCode 的类型表（如 `js` 为 `.js`、`.jsx`、`.mjs`、`.cjs`；表外类型当作扩展名；含非法字符的类型忽略），都变成原生的 `include`。ZCode 把它们作为多个 `--glob` 交给一次 ripgrep，命中任一即算；垫片对每个过滤条件各调一次原生，按「路径加行号」去重合并。类型的扩展名合成一个花括号模式（`*{.js,.jsx,.mjs,.cjs}`），不带斜杠的 ripgrep glob 在任意深度匹配文件名，与 ZCode 每个扩展名两条 glob 的效果相同。
  - `output_mode`（`content`、`files_with_matches` 默认、`count`）、`-n`（默认带行号）、`head_limit`（默认 250，0 为不限）、`offset` 在垫片里按 ZCode 的分页（`applyHeadLimit`，只在截断时报告 limit）与结果文本（`formatGrepModelContent`）实现；`count` 统计每个文件的匹配行数，与 ZCode 的 `rg -c` 一致。
  - 原生不向 ripgrep 传上下文、仅匹配与多行参数，所以 `-A`、`-B`、`-C`、`context`、`-o`、`multiline` 从 schema 删去，描述删去 multiline 一行，`output_mode` 的说明删去「-A/-B/-C context」。
- 映射与兑现（TodoWrite，`src/glm-prompt/todowrite.ts`，别名在 `index.ts`）：描述与 schema 逐字。原生 `todo_write` 每次整表替换，DSH 界面以 todo 面板显示（`dsh-client-ui-conversation`），与描述一致。`priority`（`high`/`medium`/`low`）校验后在执行边界剥离，原生只存 `content`、`status`。
- 映射与兑现（Bash，`src/glm-prompt/aliases.ts`）：本地化组合。
  - 描述按 ZCode 原文（默认超时策略 120000/600000、未启用 embedded search 的版本），只改两行：首行的 bash 改为 PowerShell；工作目录一行改为「每次调用在会话工作目录新起进程，`cd` 不保留，不加载用户 profile」。依据：原生每次以 `pwsh -NoLogo -NoProfile -NonInteractive -Command` 新起进程（`dsh-pwsh-local`），默认目录是会话工作目录（`dsh-tool-pwsh`）。其余行在 DSH 上成立：默认超时 120000、上限 600000 与原生执行器默认配置相同；后台命令结束时 `dsh-tool-jobs` 默认以 `wakeup` 方式唤醒空闲 agent。
  - schema 按 ZCode 原文，去掉 `dangerouslyDisableSandbox`：DSH 只能经原生带审批的 `sandbox_permissions`、`justification` 放宽沙盒，原生声明这两个字段时追加并转发（同 Write、Edit）。原生没有后台运行（组合里没有 job 注册表）时，同时去掉 `run_in_background` 字段与描述中的后台一行。
  - 映射：`timeout` 是毫秒，按 ZCode 的语义数字（数字字符串转数字）转 `timeoutMs`；ZCode 把 0 当作默认值，原生拒绝 0，所以 0 不转发；超过上限由原生截到上限，与 ZCode 一致。`run_in_background` 按 ZCode 语义布尔转换。`description` 在 ZCode 可选而原生要求非空，缺省时取命令首行（最长 80 字符）。原生的 `workdir` 不对模型暴露，ZCode 没有这个参数。默认值与上限按原生默认配置写死。
  - 结果文本用原生渲染（`[stderr]`、`[exit code: N]` 等标记，与 DSH 的 pwsh 提示节一致）。
  - 此前的 Bash 别名把 `timeout` 当秒换算并暴露 `working_dir`，取自无法追溯的旧文本，与 ZCode 不符，已替换。
- 与 ZCode 的已知差异（未移植）：
  - Read 的「文件未变」短路（`file_unchanged`）、超 token 预算报错与 Read 状态元数据；Edit 的模糊匹配与引号归一（ZCode 会兜底匹配，DSH 原生只做精确匹配，与描述一致）；Edit 用空 `old_string` 新建文件（原生拒绝空 `old_string`）。
  - Glob：修改时间相同的文件，先后顺序可能与 ZCode 不同。
  - Grep：`files_with_matches` 模式 ZCode 按修改时间排序，垫片保持 ripgrep 的输出顺序；ZCode 搜索隐藏文件（`--hidden`），原生不搜；ZCode 让 ripgrep 略去超过 500 列的行（`--max-columns 500`），原生返回整行；以 `!` 开头的排除模式原生拒绝，模型收到原生的报错。
  - TodoWrite：ZCode 的结果是 `{oldTodos, todos, summary}` 的 JSON，垫片用原生的「Updated todo list: …」。
  - Bash：结果形态与 ZCode 不同（见上）。
- 读图经原生通道：2026-10-28 之前 `glm-zcode` 的编码器丢弃图片块，经该通道读图只得到 `read_image` 的文字信封。现在 GLM-5.3-Flash 收到真实图片块（§4.5a），描述中的「presents them visually」成立；GLM-5.3 只声明文本，读图被拒（见上）。

### 5.5 todo 提醒

ZCode 双阈值 10/10：距上次 TodoWrite 与距上次提醒都达到 10 轮时，注入逐字提醒并回显当前 todo。

ZCode 的做法〔实读，3.16.3 安装包 `XNa`、`U4o`、`z4o` 与回合循环的附件收集；源码 `runtime/helpers/runtime-reminders.ts`、`runtime/methods/turn-loop.ts`〕：每次模型请求之前，若本回合的工具里有 TodoWrite（工具检索延迟之前的全量工具），从历史末尾往前数助手消息，一条助手消息算一轮，不论它带几个工具调用；距最后一条调用 TodoWrite 的助手消息与距最后一条 `todo_reminder` 都不少于 10 轮时，生成提醒正文（逐字提醒加会话 todo 存储的回显），作为 `todo_reminder` 附件以 `<system-reminder>` 包裹递送，并持久化为合成用户消息，之后的请求从它起算。找不到标记时按整段历史的轮数计。经 `DeferredToolCall` 调用的 TodoWrite 在 ZCode 历史里记为目标名（包装只留标记），同样算 TodoWrite。3.16.3 安装包比源码多一个条件：模型 id 含 `claude` 时不提醒，与 GLM 无关。

实现〔已实现 2026-10-28，L3 实测〕：`src/glm-prompt/todo-reminder.ts`，由 `installDialect` 安装在每个 agent 上。`agent/pre-step` 监听器（判定、空首步保护、追加 notice）在 `src/glm-prompt/step-notice.ts`，与高峰提醒（`ORCHESTRATION.md` §11.4）、项目图的每步投影（`ORCHESTRATION.md` §2.5）共用；读历史的两个函数（工具调用的参数、有结果与失败的调用）也在这个文件里，todo 提醒与每步投影共用。

- 时机：`agent/pre-step`，即本步组装之后、请求之前，对应 ZCode 的附件收集。只在组装监听器判定本步为 GLM 路由、且别名改写后的工具面（工具检索延迟之前）有 TodoWrite 时检查；非 GLM 路由永远不提醒。
- 计数：每步从 `session.deriveMessages()`（请求可见历史，跟随压缩与续跑）重新推出，不在内存里累加。只有 GLM 模型产生的助手消息算轮次（rc.3 助手消息的 `source.model`）。todo 写入包括 TodoWrite、点名 TodoWrite 的 `DeferredToolCall`，以及非 GLM 步里的原生 `todo_write`（写的是同一份清单）。提醒标记是来源 `glm-todo-reminder` 的用户消息。
- 递送：`createUserNotice` 生成的 notice（来源 `glm-todo-reminder`），正文按 ZCode 的 `<system-reminder>` 包装（与工具检索公告共用 `wrapSystemReminder`），追加在本步已接纳的消息之后；同一步还有 deferred 名单公告时，提醒排在公告之前，与 ZCode 收集附件的先后一致。notice 写入会话，下一步的计数据此起算。
- 回显：取请求可见历史中最近一次成功的 todo 写入的清单。ZCode 读会话 todo 存储；DSH 没有对应的持久存储（`dsh-tool-todo` 的 `todos` 投影在每个回合开始时清空），所以从历史推出。
- 验证：L2 覆盖多调用轮、TodoWrite 重置、经 `DeferredToolCall` 的 TodoWrite、提醒标记、非 GLM 路由与非 GLM 轮次、工具面无 TodoWrite、空首步、与公告的先后；L3 探针：先记一条 todo，再连续 10 轮每轮两个并行 Read，提醒恰好出现在第 12 次请求、只出现一次，正文为包装后的原文加回显，位于最后一批工具结果之后。

与 ZCode 的差异：

- 递送形态：ZCode 在模型属性 `supportsMidConversationSystem` 为真（或配置强制）时，把 `todo_reminder` 投影成对话中段的 system 消息，否则是包在 `<system-reminder>` 里的用户消息。GLM 模型的这一属性来自远端配置，安装包里没有具体取值。本项目一律按后一种递送，与工具检索公告相同。
- 回显来源：见上；压缩把最近的 todo 写入移出可见历史后，回显为空，ZCode 仍能回显存储里的清单。
- 计数口径：非 GLM 步的助手消息不算轮次。ZCode 不区分模型，按全部助手消息计。

2026-10-28 之前的实现在 `tools/post-execute` 上按完成的工具调用计数，一轮并行调用多个工具会多计，提醒来得比 ZCode 早；提醒随工具结果的 `additionalContexts` 递送，没有 `<system-reminder>` 包装；回显取内存中最近一次 TodoWrite 的参数，续跑后丢失。已整体替换。

todo 在编排层降级为项目图的视图（`ORCHESTRATION.md` §2.5），TodoWrite 本身保留，因为它是 GLM 的训练习惯。

### 5.6 压缩镜像

ZCode compact 提示词（`<analysis>` 先行、9 节摘要、安全指令保留；3 行偏差已修正，见 §5.9），产物经 ZCode `formatCompactSummary` 剥 `<analysis>`、`<summary>` 改写为「Summary:」。

接缝〔已实现 2026-10-27，L3 实测〕：DSH 的压缩由 `compaction-basic` 负责，它是本上下文唯一的 `ctx.compaction` 实现（`dsh-compaction` 规定每个上下文只载一个）。它通过 `ctx.llm.stream()` 发起摘要请求，`purpose` 为 `compaction`，回放对话后把自己的指令作为最后一条用户消息。每次调用都经过 `llm/stream` 瀑布，但 `next()` 不带参数，监听器换不了请求。`glm-compact` 行注册一个最外层的全局 `llm/stream` 监听器：模型属于 GLM 族、且最后一条是 `compaction-basic` 指令的压缩请求，复制一份、把末条换成 ZCode 提示词后重新派发，并对返回的文本做 ZCode 格式化；其他请求原样放行。触发策略、保留区间、检查点外框仍归 `compaction-basic`。

更正：原设计是挂一个 `BasicCompactionEngine` 子类。它在桌面版上从未挂载（从仓库路径解析不到 `@deepseek-ai/dsh-compaction-basic`），而且即使挂上也会成为第二个压缩引擎，并且只认 provider `glm`，不认原生通道 `glm-zcode`。已整体替换。

L3 探针：沙盒里把压缩阈值调低，摘要请求末条是 ZCode 提示词，下一次请求里的检查点内容为「Summary:\nprobe summary」，不含 `<analysis>`。外框仍是 DSH 的检查点前言加 `<compacted-summary>` 标签，与 ZCode 续接消息的写法不同，属于已知差异。ZCode 的 autoCompact 阈值（166k）与 microcompact 公式记录在 `reference/zcode-capabilities.md` §11.2，未接入。

压缩后的重新锚定属于编排层（`ORCHESTRATION.md` §2.5，图行 `src/graph/reminder.ts` 按检查点重注投影）。

### 5.7 工具检索〔已实现 2026-10-27〕

按 ZCode 3.16.3 的 local 模式移植（机制见 §5.10），属于方言，由 `glm-prompt` 驱动；原来独立的 `glm-hourness/toolsearch` 行已删除。原因：工具检索必须作用在别名改写之后的工具面上，才能按 ZCode 名字分常驻与延迟；两行各自注册组装监听器时先后顺序取决于 Loader，放进同一个监听器就没有顺序问题。

- 开关：`glm-prompt` 配置 `toolSearchMode`，`local`（默认）或 `off`。
- 安装：`agent/created` 时在 agent 作用域注册 `LocalToolSearch` 与 `DeferredToolCall`，并注册一个 `agent/pre-step` 监听器。
- 工具面：GLM 请求先做别名改写，再交给 `buildToolExposure`：延迟工具离开工具面，两个控制工具留下；没有延迟工具时控制工具也离开。非 GLM 请求只去掉控制工具。
- 分类：ZCode 常驻名单保持常驻；有 ZCode 对应物的 DSH 工具跟随对应物（`read_image`、`subagent`、`subagent_fork`、`skill`、`workflow`、`get_goal`、`ask_user_question`、`bash`、`str_replace_editor`）；记忆工具与项目图工具常驻（`ORCHESTRATION.md` §8、§2.10）；其余 DSH 工具按 MCP 规则延迟。L3 探针中的 GLM 工具面（2026-10-27 为 28 个；2026-10-28 起 `read_image` 由 Read 别名包住，为 27 个），13 个延迟：TodoWrite、create_goal、exit_plan_mode、interrupt_agent、job_kill、job_list、job_output、list_agents、send_message、update_goal、web_fetch、web_search、working_directory。
- 公告：每步在 `agent/pre-step` 计算新增、恢复、移除的 deferred 名单，追加一条 `<system-reminder>` notice（来源 `glm-tool-search`）；增量事实存在 notice 的 `source.toolSearchAnnouncement`，与 ZCode 公告元数据一致。已公告状态每步从 `session.deriveMessages()` 重新推出，所以续跑、重启和压缩后都按模型实际看得到的历史计算。
- 检索结果：执行 `LocalToolSearch` 时按 ZCode 投影生成内容，即 `<functions>` 定义块、「Loaded: …」提醒、「Tool definitions already available …」提醒。「已加载」只认最近一条助手消息之前的成功检索结果（ZCode 同批不互相去重的语义）。
- `DeferredToolCall`：校验与拒绝文案按 ZCode `resolveDeferredToolCall`；通过后经 `tools.execute` 执行目标，不带 `parent` 令牌。ZCode 在派发前就把包装还原成目标调用，所以 guard、审计流水、会话检查点看到的都应该是目标本身。todo 提醒从会话历史计数，历史里记的是模型发出的 `DeferredToolCall`，所以按其参数里的目标名识别 TodoWrite（§5.5）。
- 文本：逐字镜像在 `src/toolsearch/zcode-text.ts`，逐字门禁按字面量片段检查整份文件（§5.9）。

与 ZCode 的差异：

- 只有 local 模式，没有 native 与 auto。
- ZCode 每次请求都从历史重新投影检索结果；DSH 的工具结果执行时生成一次后固定，之后工具定义变化不会回写旧结果。
- 没有移植压缩后把已加载工具提升为常驻（`preCompactDiscoveredTools`）：DSH 压缩之后，已加载的工具会重新公告，需要再检索一次。
- `LocalToolSearch` 入参校验失败的报错文案是本项目的（ZCode 由执行器的 schema 校验给出，格式未核实）；直接调用未加载的延迟工具时，ZCode 在校验失败的结果后附「Load the tool first …」提示，本项目未实现。

### 5.8 与 ZCode 的差异总表

| # | 能力 | 类 | 处置 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 工具命名与 schema | 方言 | 别名投影；七个别名按 3.16.3 重建并兑现，Grep、Bash 为本地化组合（§5.4） | 已实现，L3 探针通过，真机未验收 |
| 2 | TodoWrite 三字段 | 方言 | 垫片剥离 priority | 已实现 |
| 3 | 身份节 | 方言 | 同名替换 | 已实现 |
| 4 | todo 提醒 10/10 | 方言 | 逐字文案与阈值；按助手轮次从会话历史计数，`agent/pre-step` 递送（§5.5） | 已实现，L3 探针通过，真机未验收 |
| 5 | 合成消息通道 | 同构 | 不动 | — |
| 6 | compact 提示词 | 方言 | `llm/stream` 上替换压缩指令并格式化产物（§5.6） | 已实现，L3 探针通过，真机未验收 |
| 7 | beta 能力头 | 通道 | 按能力集动态添加 | 未实现 |
| 8 | 工具懒加载 | 缺口 | glm-prompt 内的 local 工具检索（§5.7） | 已实现，L3 探针通过，真机未验收 |
| 9 | 服务端 web 工具 | 缺口 | 待实测 `web_search_prime` / webReader 直连闸门 | 挂账 |
| 10 | 持久记忆 | 缺口 | memory 行（编排层） | 已实现，未被真正使用 |
| 11 | 身份头、签名、路由 | 通道 | glm-llm | 已实现，版本待统一 |
| 12 | 模型目录、登录 | 通道 | glm-llm、glm-login | 已实现 |
| 13 | 日期与输出风格提醒族 | 方言 | 低成本可选 | 未实现 |
| 14 | 缓存断点参数 | 通道 | 末条消息带断点；系统块按 ZCode 拆三块未做，实测不影响命中（§4.5b） | 部分实现 2026-10-28 |
| 16 | thinking 与采样参数 | 通道 | effort 三档、thinking 时剥采样参数 | 已实现 effort |
| 17 | 保留式思考：历史中的 reasoning 带签名回传 | 通道 | 签名只回同一路由；ZCode 的签名拒收重试未移植（端点不校验，§4.5c） | 已实现 2026-10-28 |
| 18 | 请求归因：会话 id、会话类型、请求与追踪 id、`metadata.user_id` | 通道 | 会话 id 取 DSH 会话（§4.5b），辅助请求标 `other`；子 agent 仍标 `main`，DSH 请求不带父会话信息 | 已实现 2026-10-28 |

第 1、2、4、6、8 项的文本对齐状态以 §5.9 为准。

### 5.9 逐字复核（2026-10-27）

方法：把方言里每段号称逐字的文本按行比对 ZCode 源码（`reference/ZCode/apps` 与 `packages`）、本机 3.16.3 安装包、pristine 3.15.1，以及 `reference/zcode-api`〔实读〕。源码路径相对 `apps/zcode-cli/packages/core/src/`。

| 文本 | 代码位置 | 结果 | 原文位置 |
| --- | --- | --- | --- |
| CLI 前缀 | `verbatim.ts` `CLI_PREFIX` | 一致 | `context/sections/cli-prefix.ts` |
| 身份开头两句 | `verbatim.ts` `IDENTITY_OPENING_*` | 一致 | `context/sections/identity.ts` |
| 官方安全声明 | `verbatim.ts` `SECURITY_NOTICE_OFFICIAL` | 与源码、pristine 一致；本机安装包此处为用户补丁 | `context/sections/identity.ts` |
| Harness 块 | `verbatim.ts` `HARNESS_BLOCK` | 一致 | `context/sections/identity.ts` |
| todo 提醒回显标题 | `verbatim.ts` `TODO_REMINDER_ECHO_HEADER` | 一致 | `runtime/helpers/runtime-reminders.ts` |
| todo 提醒正文 | `verbatim.ts` `TODO_REMINDER_BODY` | 曾有两处不一致（`to track progress`、`if has become stale`，原文语法如此），已按原文修正 | `runtime/helpers/runtime-reminders.ts` |
| Context management | `localize.ts` `CONTEXT_MANAGEMENT_DSH` | 一致 | 源码与安装包 |
| compact 提示词 | `compact.ts` | 曾有 3 行不一致（第 4、8、9 节漏词），已按原文修正。结尾的 `REMINDER` 行与 3.16.3 安装包、pristine 一致，与源码不同，按安装包保留 | `compact/prompt.ts` |
| ToolSearch 描述 | 旧 `toolsearch/index.ts` | 首句一致，之后不一致。已按 3.16.3 安装包重建为 `LocalToolSearch` 描述（2026-10-27） | 安装包；源码 `tool/search/description.ts` 是 3.16.2 版本 |
| Deferred 声明段 | 旧 `verbatim.ts` `DEFERRED_DECLARATION` | 任何来源中都找不到；ZCode 系统提示词没有这一段，已删除（2026-10-27） | — |
| 工具检索全部文本 | `toolsearch/zcode-text.ts` | 一致（门禁按字面量片段检查） | 安装包 |
| Read、Write、Edit 描述、schema 与结果文本 | `zcode-tool-text.ts`（镜像文件） | 旧文本任何来源中都找不到，已按 3.16.3 安装包重建（2026-10-28）；Read 描述按 §5.4 删去不能兑现的行。schema 用 ZCode 锁定的 zod-to-json-schema 3.25.2 复算，与安装包中的 zod 定义一致 | 安装包；源码 `tool/handlers/read.ts`、`write.ts`、`edit.ts`、`contracts/src/tools/` |
| Glob、Grep、TodoWrite 描述、schema 与 Glob、Grep 结果文本 | `zcode-tool-text.ts`（镜像文件） | 旧文本任何来源中都找不到，已按 3.16.3 安装包重建（2026-10-28）；Grep 按 §5.4 删去原生做不到的参数与 multiline 一行，删改在镜像文件之外。schema 用 zod-to-json-schema 3.25.2 复算 | 安装包；源码 `tool/handlers/glob.ts`、`grep.ts`、`todo.ts`，`adapters/src/fs/index.ts`（分页、类型表、glob 拆分） |
| Bash 描述与 schema | `zcode-tool-text.ts`（原文）、`aliases.ts`（本地化） | 旧文本是无法追溯的改写，已按 3.16.3 安装包原文重建（2026-10-28），只按 §5.4 改写 shell 与工作目录两行、去掉 `dangerouslyDisableSandbox`；不属于逐字声明 | 安装包；源码 `tool/handlers/bash-prompt.ts`、`contracts/src/tools/bash.ts` |

结论：身份类文本与 context management 是原文；todo 提醒正文、compact 提示词的小处偏差已修正；start-plan 三块系统提示中的静态文本与原文一致。工具描述、deferred 声明段与 ToolSearch 描述原先大部分不是 ZCode 3.16.x 的原文，只存在于 `reference/zcode-tool-schemas.md`，其「协议采样」的出处无法追溯；现已全部按安装包重建或删除，七个别名的参数 schema 都与安装包中的 zod 定义一致。

处置：

- 来源优先级：3.16.3 安装包为准（用户补丁的安全声明除外，该段以源码与 pristine 为准）；源码作为可读参考。源码（3.16.2）与安装包的已知差异：compact 结尾 `REMINDER` 行；工具检索的 local 模式（§5.10）；Read 部分视图提醒与正文之间，安装包用一个换行，源码用两个；Grep 结果的分页行与计数汇总行之前，安装包用一个换行，源码用两个。
- 逐字门禁 `scripts/check-verbatim.mjs`（`npm test` 的一道）：每段号称逐字的文本逐行必须出现在安装包或源码中；尚未重建的条目列为已知偏差，只许减少，某条一旦对上而未从名单删除也会失败，名单里的条目不再被检查时同样失败；机器上没有参考源时跳过〔已实现〕。
- 镜像文件：整份文件都是逐字声明的源文件（`src/toolsearch/zcode-text.ts`、`src/glm-prompt/zcode-tool-text.ts`），门禁抽出其中每个字符串与模板字面量片段逐行比对，模板按插值点切开。这样带插值的模板也能逐片检查。镜像文件里不能出现正则字面量和除法，扫描器不解析它们。本地化的组合（删去哪几行、改写哪几行、删去或追加哪些字段）写在镜像文件之外；标 `localized` 的别名规格（Grep、Bash）不再整段比对描述，由镜像文件的逐片检查覆盖其原文部分。
- 已知偏差：无（2026-10-28 起名单为空）。名单机制保留，以后出现新的待重建文本时仍按只减不增处理。

### 5.10 ZCode 的工具检索机制（3.16.3）

〔实读，3.16.3 安装包 `zcode.cjs` 与源码 `tool/search/`（3.16.2）〕

- 模式：`off` / `local` / `native` / `auto`。桌面版设置 `toolSearchMode` 默认 `off`，CLI 参数 `--toolsearch-mode` 默认也是 `off`。默认配置下所有工具直接加载，没有 ToolSearch，也没有 deferred。
- `native`：模型侧支持服务端工具检索时使用；工具名 `ToolSearch`，检索返回的 schema 加载后可直接调用。
- `local`：客户端检索。3.16.3 把检索工具改名为 `LocalToolSearch`（`toolSearchNameForMode`，注册名仍是 `ToolSearch`，`LocalToolSearch` 是别名），描述换成 local 版本；deferred 工具经 `DeferredToolCall({name, input})` 包装调用。3.16.2 源码里 local 模式仍叫 `ToolSearch`。
- 名单公告：deferred 工具名不写进系统提示词，而是作为附件以 `<system-reminder>` 包裹的用户消息递送。local 模式的开头是「The following deferred tools are available via LocalToolSearch. Use query … then call them through DeferredToolCall with {name, input}. Call resident tools directly:」，native 模式是「…are now available via ToolSearch…」。名单变化时补发新增、恢复、移除的公告；增量事实随公告落盘。系统提示词里没有 deferred 声明段。
- 哪些工具延迟：只有声明了 `shouldDefer` 的工具与 MCP 工具。常驻：Read、Write、Edit、Glob、Grep、Bash、ApplyPatch、Agent、Skill、Workflow、GoalRead、AskUserQuestion、ToolSearch、DeferredToolCall。延迟：TodoWrite、TodoRead、WebFetch、WebSearch、Cron 族、计划模式进出、SendMessage、TaskOutput、TaskStop、工作流管理族、`js` 等。
- 检索：`select:a,b` 精确选择（含别名，常驻工具也可选），否则按名称分词、描述与 searchHint 打分，`+词` 表示必须命中，默认返回 5 个；3.16.3 的描述与 `query` 参数说明都写明不支持正则。
- local 模式的结果：匹配到的定义以 `<functions>` 块内一行一个 `<function>{description,name,parameters}</function>` 回到工具结果里，后跟 `<system-reminder>` 包裹的「Loaded: … Call it now with DeferredToolCall … No additional LocalToolSearch is needed …」提示；最近一条助手消息之前已经交付过的定义再搜，回「Tool definitions already available …」提示；没有匹配时回「No matching deferred tools found. Loaded tools are not searchable here …」。
- `DeferredToolCall({name, input})`：只接受当前目录里的延迟工具；对常驻工具或控制工具本身回「Call X directly using its normal tool call; DeferredToolCall only accepts deferred tools.」。包装在派发前还原为目标调用，历史里记录目标身份。
- 更正（2026-10-27）：本节初版按 3.16.2 源码记载 local 模式的工具名与文案，与 3.16.3 安装包不符；移植时对照安装包发现并更正。
- 定案〔用户 2026-10-27〕：本项目默认开启工具检索，实现与 ZCode 一致。没有服务端检索能力时，ZCode `auto` 模式回落到 `local`，本项目按 `local` 语义实现。DSH 独有、ZCode 无对应的工具按 MCP 工具的规则处理（延迟）；有对应的随对应工具的常驻 / 延迟属性。

## 6. 注入约定〔定案〕

方言层与编排层都要往对话里放 harness 生成的内容（提醒、投影、检查结果、纠偏），约定如下：

1. 格式：用 GLM 熟悉的 `<system-reminder>` 形态，写短，位置固定。ZCode 自身以这种形态递送 deferred 名单与提醒（§5.10）。
2. 位置：动态内容放在对话末尾，不放进系统提示词。系统提示词保持稳定，以免每一步都让提示词缓存失效。按积分公式，GLM-5.3 缓存命中系数 1.7、普通输入 6.9，命中部分约省四分之三（`FACTS.md` §2.4）。
3. 通道：沿用 `tools/post-execute` 的 `additionalContexts`（带来源标签的合成 notice，与 DSH repeat-tool-reminder 同一机制），或 `agent/pre-step` 的消息修正（工具检索公告、todo 提醒、高峰提醒与项目图的每步投影用这一条）。notice 必须带 `id` 与 `role`（`src/shared/dsh-min.ts` `createUserNotice`，§2.4a）。
4. 来源标签唯一，便于审计与用量归因。

## 7. 降级与上报

行健康已实现（§2.5，2026-10-28）；签名与端点路由的状态、用量记录的签名标注仍属规划（§4.3）。

| 行 | 故障或禁用时 | 上报位置 |
| --- | --- | --- |
| glm-llm | GLM 通道不可用，其他 provider 不受影响；coding-plan 拿不到项目令牌时同样不可用，不退回 API Key（§4.1） | 行健康（`/glm-status`） |
| glm-llm 签名 | 无签发送 | 状态、用量记录的签名标注〔规划〕 |
| glm-llm 路由 | 保持原 URL | 状态〔规划〕 |
| glm-prompt | 退回 DSH 原生工具面与文案 | 行健康 |
| glm-compact | 压缩请求原样放行，profile 原有压缩照常 | 行健康 |
| 工具检索（glm-prompt 内） | `toolSearchMode: off` 或会话历史不可读时全量直载 | 行健康（glm-prompt 一行的说明） |
| data | 不写用量流水；违规与决策只由配了 `home` 的行写；`/hourness` 写明缺哪个目录 | 行健康、`/hourness` |
| guard | 无门禁 | 行健康（显式禁用除外） |
| guard 影子兜底 | 组合里没有 workspace-changes：只少影子记录，门禁照常 | 行健康（guard 一行的说明） |
| memory | 无记忆、无用量流水 | 行健康 |
| workflow / hourness | 无记录、无报告 | 行健康 |
| graph | 没有图工具、每步投影与图文件门禁；图目录缺失或图有校验错误时，工具照常注册并把问题报给模型，投影注入一条说明；读图抛错时本步不带投影；会话没有工作目录时门禁只判断绝对路径 | 告警、工具错误、行健康（§2.5） |
| graph-panel | 命令注册失败时面板写不进图；现场投影注册失败时面板没有现场，写入照常 | 告警、行健康 |

激活期（`apply`）不抛错：配置缺失降级为 warn 与 no-op，因为激活失败会拖垮宿主启动（2026-10-27 事故）。降级必须上报，不得只打一行警告（`CHARTER.md` §7.1 条款 7）。

## 8. 契约与适配层

- adapter：`ZcodeAdapter` 底部有编译期检查 `AdapterContractCheck`，对照官方 `LlmAdapter` 类型〔实读〕。
- 事件钩子与服务：结构类型逐项对照 rc.3 运行时包，证据见 §2.4a 接口对照表〔实读 2026-10-28〕。官方 `.d.ts` 只装了 `dsh-llm`、`dsh-attachment`、`cordis` 三个包（新增开发依赖须用户批准），装了的地方加编译期检查：`LlmStreamOptionsContractCheck`（`GenerateOptions` 覆盖 `llm/stream` 监听器读取的字段）、`AttachmentsContractCheck`（`AttachmentStore` 覆盖通道读图用的成员）。其余接口没有官方类型可对照，靠对照表与 L3 探针。
- 适配层：薄适配层是 `src/shared/dsh-min.ts`（宿主钩子、服务、载荷、命令、会话）与 `src/shared/lm-min.ts`（LLM 消息与流的词汇、附件服务成员）。各行只从这两个文件取宿主类型；GLM 模型目录在 `src/glm-llm/models.ts`，不属于适配层〔已实现 2026-10-28〕。
- 回归：L3 沙盒真实启动加行为探针做成门禁；每次 DSH 升级先跑一遍（`DEVELOPMENT.md` §3、`ROADMAP.md` M1.7）。

## 9. 开放问题

| 项 | 验证路径 |
| --- | --- |
| 原生通道在 DSH 真实会话中端到端可用 | L4 真机（需用户） |
| 签名握手失败的根因与 3.16.3 协议变化 | 对照 zcode-api 与本机 ZCode 3.16.3 机制 |
| start-plan 真机授权 | L4 |
| GLM 端点的请求级图片上限（张数、总字节）；超限时本通道不发 `IMAGE_OFFLOAD_REQUIRED`，会话会卡在上游报错（§4.5a） | 查 bigmodel 文档或实测；必要时按实测上限发卸载信号 |
| 原生通道读图在 DSH 真实会话中可用（GLM-5.3-Flash） | L4 真机读图 |
| native ToolSearch 透传（K2）、服务端 web 工具闸门（K4） | 需活 token 实测 |
| beta 头、OutputStyle 列表、实跑采样参数 | 抓包 |
