# 开发与交付流程（DSH 插件）

版本：0.2（2026-10-27）

本文固化 GLM-Hourness 的**验证与交付纪律**。背景：2026-10-27 连续三次真机事故，全部只在首次真实宿主运行时暴露，单测全绿也拦不住。流程因此改为「先沙盒预演、再主 profile」。设计见 `DESIGN.md`、`ORCHESTRATION.md`，实施顺序见 `ROADMAP.md`。

## 1. 验证金字塔（从下到上，任一层红则不许往上）

| 层 | 做什么 | 拦什么 | 命令 |
|---|---|---|---|
| L1 静态 | TypeScript 编译 + bundle 门禁 | 类型/契约漂移、产物缺失、一包多源 | `npm run build`、`npm run preflight` |
| L2 单测 | mock 网络边界的逻辑测试 | 我们自己的逻辑错误 | `npm test`（含 preflight） |
| L3 沙盒 | 临时 profile 装 bundle + headless 真实 boot | loader 组合错误、adapter 注册错误、激活期崩溃 | 见 §3 |
| L4 真机 | 主 profile 热装/重启后验收 | GUI 契约、client 半、真实链路 | 手动 + 冒烟脚本 |

L2 的 mock **只允许 mock 外部网络和文件系统**；不得 mock DSH 契约本身（契约用 L1 类型 + L3 真实 boot 验证）。单测里的假宿主只能提供 rc.3 真宿主会提供的信号（例：路由只出现在 `system-prompt/assemble` 的变量里），否则单测全绿而真机失效（`DESIGN.md` §3）。

执行环境：Kiro 会话内可以跑 L1–L3（L3 经 Electron node 模式，见 §3）；L4 需要用户重启桌面版并在真实会话里验收。

## 2. 安装门禁

任何 `plugin_manager install_bundle` 之前，必须按顺序通过：

```powershell
npm run build        # tsc：含 adapter 契约检查（见 §4）
npm run preflight    # dist 产物、patch 行文件、client 半一包一源约束
npm test             # preflight + 逐字门禁 + 全部 spec
```

`npm test` 的前两道是 preflight 与逐字门禁（`npm run check:verbatim`，规则见 `DESIGN.md` §5.9），最后一道是项目图查看器的冒烟（`npm run graph:smoke`，§11）；`npm run preflight` 单独跑用于安装前快检。

## 3. 测试 profile 沙盒（L3）

Desktop 版 `dsh` 不在 PATH，用 Electron 的 node 模式调用：

```powershell
$env:ELECTRON_RUN_AS_NODE='1'
$exe = 'C:\Users\29596\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
$bin = 'C:\Users\29596\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js'

# 组合检查（不启动）
& $exe $bin --profile <name> --dump-config
# 真实 boot 一次（不发模型请求也会执行 loader 组合、插件激活、adapter 注册）
& $exe $bin --profile <name> headless "hi"
```

规则：

1. 新行先装进**临时 profile**（`dsh plugin --profile <tmp> add <path>`），跑 headless；报错就地修，不碰主 profile。
2. 只有临时 profile headless 干净通过，才安装进主 profile。
3. 安装后先看 `plugin_manager` 返回的 `application` 与 `warnings`：`applied` 只代表 loader 接受了行，不代表启动/GUI 正常。**重启或刷新后必须再验一次**。

本机已备好沙盒环境（可复用）：

```powershell
# 首次：从 headless 模板创建，并装入 bundle（pnpm 需要 -w）
& $exe $bin --profile glmsandbox --from-default-profile headless --dump-config
& $exe $bin plugin --profile glmsandbox add <repo> -w
# 每次验证：带覆盖 patch 真实 boot（覆盖层只读，不改持久配置）
& $exe $bin --profile glmsandbox --patch <repo>\.llm\sandbox-enable.yml "Say hi in one word"
```

行为探针（`npm run probe`，`scripts/probe/`）：在 `glmsandbox` 上真实启动桌面版运行时，用脚本化的探针 provider（`glm-probe`，模型 `glm-5.3`，不联网）替代真实模型，记录运行时发给模型的每个请求（系统提示词、工具面、消息摘要），并检查方言提示词、工具面、别名执行与 todo 提醒是否生效。脚本的每一步可以是一次工具调用、同一轮里的多个并行调用，或一段文本。探针 provider 的模型目录（含输入模态）与图片目标取自 `dist/glm-llm`，并用原生通道的真实编码器与运行时附件服务编码每个请求，记录图片块的落点，所以跑探针前先 `npm run build`。图片场景把附件存储指到场景目录（覆盖 `attachment-local` 的 `dshHome`），不写 `~/.dsh`。每个场景的数据目录行指向场景自己的目录（`dshHome` 为 `<场景>/dsh-home`，`projectHome` 为 `<场景>/home`；memory、workflow、hourness 的 `home` 也指向 `<场景>/home`，与用户 profile 补丁同形），探针在运行前后比对真实的 `~/.dsh/glm-hourness/audit/usage.jsonl`，变了就判失败。脚本里标了 `status` 的一步，探针 provider 经运行时的 `agents.get` 与 `commands.find` 取到会话的 agent 和本包的 `/glm-status` 处理函数并直接调用（不经命令生命周期事件，此时 agent 正在一步之中），输出记进该次请求的记录，用来检查行健康表（`DESIGN.md` §2.5）；`glm-login` 的 `home` 同样指向场景目录，探针不会读到真实凭证。guard 的影子场景在运行目录下新建一个临时 git 仓库，以它为会话工作目录启动，并经覆盖层挂上 `@deepseek-ai/dsh-workspace-changes`（桌面版 profile 经 `dsh-web-app` 有这个包，沙盒模板没有），用来检查工作区变更兜底（`ORCHESTRATION.md` §6.5.2）。每次运行的覆盖补丁、请求记录与日志写在 `.llm/probe-runs/<时间戳>/`。覆盖补丁由运行器按次生成，因为 Loader 在 `!!js` 求值前就校验行的 `name`。探针不进 `npm test`（需要本机桌面版）；涉及运行时行为的改动以它为 L3 门禁。

注意：`--profile desktop` 会被拒绝（Electron 独占 profile），必须用独立 profile。沙盒里的 `MISSING_CREDENTIAL`、`home is not configured`、缺 compaction 引擎属于模板差异，不是被测插件的问题；判据是**没有出现被测插件的契约/激活错误**。

## 4. 契约校验（编译期）

DSH 官方类型已作为 devDependency 安装（`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-attachment`、`@deepseek-ai/cordis`，版本 `0.2.1-rc.3`，与运行时一致）。

- `src/glm-llm/zcode.ts` 底部有 `AdapterContractCheck`：`ZcodeAdapter` 必须结构兼容 `LlmAdapter` 的全部公开成员。任何签名/返回形状漂移 → `npm run build` 失败。
- 薄适配层（`src/shared/dsh-min.ts`、`src/shared/lm-min.ts`）里有两处同样的检查：`LlmStreamOptionsContractCheck`（官方 `GenerateOptions` 必须覆盖 `llm/stream` 监听器读取的字段）、`AttachmentsContractCheck`（官方 `AttachmentStore` 必须覆盖通道读图用的成员）。其余宿主接口没有已安装的官方类型，逐项证据见 `DESIGN.md` §2.4a 接口对照表。
- 新增 adapter / 服务实现时，同样用「官方类型 + 类型级断言」把契约钉死在 tsc 里，禁止只靠运行时手测。
- 契约来源优先级：桌面版运行时的包（`reference/dsh-desktop-0.2.1-rc.3/`，从 `app.asar` 导出）> 官方 `.d.ts` > `reference/deepseek-harness` 源码 > 运行时行为观察。`reference/deepseek-harness` 是更新的主干，版本号相同但接口不同，只用来理解设计意图（`DESIGN.md` §2.4a）。
- 重新导出运行时包（桌面版升级后）：用 Electron node 模式读 `resources/app.asar/dsh/node_modules/@deepseek-ai/` 并整目录复制到 `reference/dsh-desktop-<版本>/`（跳过嵌套 `node_modules`）。然后按 `DESIGN.md` §2.4a 接口对照表逐项复核，改动只落在薄适配层，再跑 `npm run probe`。

## 5. 纪律

1. **默认 disabled**：bundle 里的新行一律 `disabled: true`；验证通过后才在 profile 里启用。
2. **一次一个变量**：一次交付只推进一层（适配器、UI、配置），不混合。混合会放大故障面。
3. **不静默改 profile**：除用户明确要求，不改用户的 `cordis.patch.yml`；改前先备份（`cordis.patch.yml.bak-*`）。
4. **装后必验**：`application: applied` ≠ 启动成功。热装后刷新/重启验证，或明确告知用户「重启后生效」。
5. **错误先归因**：同一症状连续两次修复无效时，停下来查契约/根因，不在现场打补丁。
6. **Client 半只用模块表**：静态 bundle 的 `client.js` 通过 `window.__ModuleLoader__.load({ factory(require) })` 加载，factory 只拿到 `require`（React 等模块表）。`styles` / `host` / `console` 是**动态包沙盒**（cordis-client-runner）的 Builtin，静态包不可用。样式用组件内 `<style>` 元素；跨 host 的动作走 `ctx.remote`（官方 UI 包的做法）或自定义 Remote 服务，不走 `host.call`。
7. **Cordis inject 写完整服务路径链**：访问 `ctx.remote.commands` 时，`inject` 必须同时声明 `'remote'` 与 `'remote.commands'`（照抄官方 ui-commands：`['inputTriggers', 'sessions', 'remote', 'remote.commands', 'locale']`）。只声明嵌套名会在访问 `ctx.remote` 根时抛 `cannot get property "remote" without inject`。写 Client 半前先读对应官方包的 `inject` 声明，不猜。

## 6. DSH 的报错机制速查

### 运行时

| 层 | 机制 | 表现 |
|---|---|---|
| 启动审计 | `dsh-app-boot` 的 `auditStartupEntries` | `Failed plugins`（required 插件未激活）、`Plugins waiting for services` 表、完整堆栈；crash log 落盘 `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*.log`，含 host 诊断与 renderer console |
| 契约校验 | 各包在注册/解析时强校验 | 如 `INVALID_MODEL_INFO`、`DUPLICATE_ADAPTER`、`ClientPackageCompositionError`（一包一源），错误消息直接指出对象与原因 |
| 错误码 | `HarnessError` / `LlmError` | 稳定 code：`NO_ADAPTER`、`MISSING_CREDENTIAL`、`AUTH`、`RATE_LIMIT`、`CONTEXT_WINDOW_EXCEEDED`、`IMAGE_OFFLOAD_REQUIRED` 等；消费方按 code 路由，不按文案 |
| 运行时反射 | `cordis_inspect_query` | 查 Service 方法签名、Tool schema、Config schema、Slot 树、Theme token；写插件前用它拿**真契约** |

### 开发期

| 工具 | 用途 |
|---|---|
| `npm run build`（tsc） | 类型与契约检查（本项目已接入官方 .d.ts） |
| `dsh --dump-config` / `--dump-config-schema` | 组合与 schema 校验，不启动 |
| `dsh headless` | 真实 boot 的沙盒（见 §3） |
| `plugin_manager` 返回 | 行激活状态、warnings、安装期诊断 |
| `npm run preflight` | 本项目自定义门禁 |

**边界**：官方没有 lint/doctor 类静态分析；运行时校验只有在真实宿主里才触发。因此本项目用「官方类型 + tsc」补编译期，用「headless 沙盒」补启动期，用 preflight 补产物与组合完整性。

## 7. 事故记录

| 日期 | 事故 | 暴露层 | 缺口 | 已补 |
|---|---|---|---|---|
| 2026-10-27 | memory 行激活期调用无参 `workingDirectory.ensure()`，host 启动崩 | L4 | 激活期代码无容错、无沙盒 | 激活期 fail-open 纪律（§5.4 相关），见各行实现 |
| 2026-10-27 | `dsh.client` 声明 + 多行同包 → client-modules `resolves from multiple active Loader sources`，启动失败 | L3→L4 | client 半「一包一源」约束未知 | preflight 增加该检查；UI 半必须独立单入口包 |
| 2026-10-27 | `listModels` 缺 `provider` 字段 → `adapter returned invalid or duplicate model` | L1→L4 | adapter 契约靠猜 | 接入官方 .d.ts + `AdapterContractCheck`，tsc 直接拦 |
| 2026-10-27 | 静态包 client 半用了 `styles` Builtin → `ReferenceError: styles is not defined` | L4 | 混淆了动态包沙盒 Builtin 与静态包模块表 | 静态包 client 半只有 `require`（React 等模块表）；样式用组件内 `<style>` 元素渲染 |
| 2026-10-27 | 15:36–17:22 的 190 条用量记录与 1 条记忆写进 `~/.dsh/profiles/desktop/.llm/`，`/hourness` 读不到 | 审计数据复查 | 各行各自配置 `home`，没有单一数据目录 | 2026-10-28：数据目录行与服务（`DESIGN.md` §2.4），记录已复制到新位置 |
| 2026-10-27 | guard 把 shell 命令文本里的 `=>`、`>>>`、`->` 当成重定向拦截，共 3 次 | L4 | 正则检测无引号感知；新门禁没有影子期 | 2026-10-28：引号感知检测，命令集不扩充；读不到的写法由工作区变更兜底以影子模式记录（`ROADMAP.md` M1.8、`ORCHESTRATION.md` §6.5）；L2 覆盖两种方言，L3 探针检查放行与影子记录 |
| 2026-10-27 | guard 已知拦截至少 3 次，违规审计 0 条 | 审计数据复查 | 违规回调无法从配置传入，降级没有上报 | 2026-10-28：guard 经数据目录服务落盘，缺目录时控制台报一次，探针检查拦截后的违规记录（`ROADMAP.md` M1.4）；各行的降级经行健康上报，`/glm-status` 显示（M1.5，`DESIGN.md` §2.5） |
| 2026-10-28 | 原生通道编码器按 `toolCalls` 字段读助手的工具调用，rc.3 以 `tool-call` 内容块传递，工具调用会被全部丢弃 | 读 rc.3 运行时包（修图片时） | `lm-min.ts` 的结构类型对照的是 `reference/deepseek-harness` 主干；通道只有单测和真网单轮冒烟，没有多轮工具调用的验证 | 结构类型按 rc.3 重写；探针请求摘要读 `tool-call` 块（`DESIGN.md` §4.5）；多轮工具调用的真机验证随 L4 |
| 2026-10-28 | guard 对 `terminal_send` 读 `command` 参数，rc.3 的参数名是 `text`，终端里的 shell 写入从未被检查（桌面版 profile 装了终端包） | 读 rc.3 运行时包（M1.8） | M1.6 的接口对照只核了钩子、服务与载荷，没有逐个核对工具参数名；单测用的是同一个错误字段 | 改读 `text`，按 bash 与 pwsh 两种方言判；接口对照表加 shell 工具与文件工具的参数行（`DESIGN.md` §2.4a） |
| 2026-10-28 | guard 违规记录的 `agentId` / `sessionId` 读自 `tools/pre-execute` 载荷上不存在的字段，永远为空；workflow 的派遣名单缺 base profile 的 `subagent_fork`，fork 派遣从未记录 | 读 rc.3 运行时包（M1.6 逐项对照） | 各行自带宿主结构类型，没有逐项对照 rc.3；探针没有覆盖审计流水 | 接口对照表（`DESIGN.md` §2.4a）；宿主类型收进薄适配层；探针加用量流水与派遣工具名检查 |

## 8. 变更检查清单

- [ ] `npm run build` 通过
- [ ] `npm run preflight` 通过
- [ ] `npm test` 通过
- [ ] 新行 `disabled: true`，或已在临时 profile 验证
- [ ] 临时 profile headless boot 干净（涉及 loader/激活/新包时必做）
- [ ] 装后验证：`application: applied` + 刷新/重启后无新错误
- [ ] 不新增编译器或检查器告警；新增的压制注释写明理由
- [ ] 改了 `docs/graph/nodes/` 的，已重新出图，`graph.svg` 与节点文件同批提交（§11）
- [ ] 文档同步（`DESIGN.md` / `ORCHESTRATION.md` / `ROADMAP.md` / 本文件），与代码同一批提交

## 9. 版本控制

- 仓库：git，远端为 Gitee 私有仓库 `NorthGod_BFDG/GLM-Hourness`（`origin`），主分支 `main`。仓库由 Kiro 管理。
- 一件事一个提交；提交信息用技术话术写清改了什么、为什么、怎么验证的（干净区）。项目图上线后，提交信息带节点 id。
- 不强推，不改写已推送的历史，不跳过钩子。
- 不入库：`.llm/`（凭证、记忆、审计、原始资料）、`/reference/`（审计用参考源码）、`dist/`、`node_modules/`、`.pnpm-store/`。提交前扫描密钥。
- 换行：`.gitattributes` 固定 LF。
- 被取代的文档直接删除，原文留在 git 历史中。

## 10. 检查器与告警

规则见 `ORCHESTRATION.md` §7.5–§7.6：新代码零告警，存量按棘轮只减不增；压制注释写理由；放宽检查配置需用户批准。本仓库目前只有 tsc，规范、死代码、重复检查按 `ROADMAP.md` M1.9 补齐。

## 11. 项目图

设计见 `ORCHESTRATION.md` §2.6–§2.13，本项目的图在 `docs/graph/`（`nodes/` 是节点文件，`graph.svg` 是渲染结果）。引擎在 `src/graph/`，命令入口在 `scripts/graph/`，只用 Node 22 内置模块，经 `--experimental-strip-types` 直接从源码运行，不用先 build。`--dir` 默认是本仓库的 `docs/graph`。

| 命令 | 作用 |
| --- | --- |
| `npm run -s graph -- [--dir 图目录] show <id>` | 读一个节点的投影，JSON 输出 |
| `npm run -s graph -- [--dir 图目录] open` | 待办与决策队列，JSON 输出 |
| `npm run -s graph -- [--dir 图目录] <op> --file <请求文件>` | 以 `llm` 身份执行一次写操作（`ORCHESTRATION.md` §2.9），请求文件存为 UTF-8；退出码 0 成功、1 引擎拒绝、2 用法或输入错误 |
| `npm run graph:render -- [--dir 图目录] [--out 文件] [--root id] [--focus id] [--collapse id]…` | 出图，默认写 `<图目录>/graph.svg`；`--root`（子树）与 `--focus`（投影）只能给一个；图有校验错误照常出图，错误列在 stderr |
| `npm run graph:serve -- [--dir 图目录] [--port 端口]` | 起本机查看器，打印带令牌的地址 `http://127.0.0.1:<端口>/#token=<令牌>`；端口默认取空闲端口；Ctrl+C 停止 |
| `npm run graph:smoke` | 查看器服务的冒烟：在临时图上起服务，各经 HTTP 与命令行写一次，确认两次都实时通知；`npm test` 的最后一道 |

规则：

1. LLM（包括在 Kiro 里开发本仓库时）只经命令行写节点文件，不直接编辑（`ORCHESTRATION.md` §2.7）；在 DSH 里图行启用后，guard 规则 `graph-files-only` 拦直接写图目录。手改的文件下一次读就生效，但不留历史；改出校验错误时整张图拒绝写入，直到改回或用 git 还原。
2. 改了 `docs/graph/nodes/` 就运行 `npm run graph:render`，`graph.svg` 与节点文件同批提交。`npm test` 检查节点文件没有校验问题、`graph.svg` 与渲染器的输出逐字节相同，没重新出图会失败。
3. 读 JSON 输出用 `npm run -s`，否则 npm 先往 stdout 打两行命令回显。Windows PowerShell 5.1 下写请求一律用 `--file`：经管道送 stdin 时 `--` 被吞、中文变问号，参数里的 JSON 会丢引号（`ORCHESTRATION.md` §2.10）。
4. 试写不要用 `docs/graph`：复制到临时目录，命令加 `--dir`。
5. 引擎、命令行与查看器不碰 DSH，改它们只需过 `npm run build`、`npm run preflight`、`npm test`，不需要 `npm run probe`。接触 DSH 的只有图行（`src/graph/index.ts`、`tools.ts`、`reminder.ts`，以及它注册的门禁规则 `src/guard/graph-files.ts`，行 `glm-hourness/graph`，`ORCHESTRATION.md` §2.5、§2.7、§2.10）：L2 在假宿主 `tests/fake-rc3.ts` 上，行默认禁用，启用前按 §1 补 L3 探针与 L4 验收（沙盒里的启用方法、L3 检查清单与启用前的跟进项见 `ROADMAP.md` M2 进度）。
