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
npm test             # preflight + 逐字门禁 + 检查器门禁 + 全部 spec
```

`npm test` 的前三道是 preflight、逐字门禁（`npm run check:verbatim`，规则见 `DESIGN.md` §5.9）与检查器门禁（`npm run lint`，§10）；`npm run preflight` 单独跑用于安装前快检。

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

行为探针（`npm run probe`，`scripts/probe/`）：在 `glmsandbox` 上真实启动桌面版运行时，用脚本化的探针 provider（`glm-probe`，模型 `glm-5.3`，不联网）替代真实模型，记录运行时发给模型的每个请求（系统提示词、工具面、消息摘要），并检查方言提示词、工具面、别名执行与 todo 提醒是否生效。脚本的每一步可以是一次工具调用、同一轮里的多个并行调用，或一段文本。探针 provider 的模型目录（含输入模态）与图片目标取自 `dist/glm-llm`，并用原生通道的真实编码器与运行时附件服务编码每个请求，记录图片块的落点，所以跑探针前先 `npm run build`。图片场景把附件存储指到场景目录（覆盖 `attachment-local` 的 `dshHome`），不写 `~/.dsh`。每个场景的数据目录行指向场景自己的目录（`dshHome` 为 `<场景>/dsh-home`，`projectHome` 为 `<场景>/home`；memory、workflow、hourness 的 `home` 也指向 `<场景>/home`，与用户 profile 补丁同形），探针在运行前后比对真实的 `~/.dsh/glm-hourness/audit/usage.jsonl`，变了就判失败。脚本里标了 `status` 的一步，探针 provider 经运行时的 `agents.get` 与 `commands.find` 取到会话的 agent 和本包的 `/glm-status` 处理函数并直接调用（不经命令生命周期事件，此时 agent 正在一步之中），输出记进该次请求的记录，用来检查行健康表（`DESIGN.md` §2.5）；`glm-login` 的 `home` 同样指向场景目录，探针不会读到真实凭证。guard 的影子场景在运行目录下新建一个临时 git 仓库，以它为会话工作目录启动，并经覆盖层挂上 `@deepseek-ai/dsh-workspace-changes`（桌面版 profile 经 `dsh-web-app` 有这个包，沙盒模板没有），用来检查工作区变更兜底（`ORCHESTRATION.md` §6.5.2）。每次运行的覆盖补丁、请求记录与日志写在 `.llm/probe-runs/<时间戳>/`。覆盖补丁由运行器按次生成，因为 Loader 在 `!!js` 求值前就校验行的 `name`。探针不进 `npm test`（需要本机桌面版）；涉及运行时行为的改动以它为 L3 门禁。探针另有两个场景检查标定运行的边界插件 `scripts/calibrate/limits.mjs`：步数上限为 2 时第 3 步被拒、回合以 `blocked` 结束；时间上限为 5 秒时一条 60 秒的 shell 命令被取消、之后不再有步。高峰提醒场景与非 GLM 场景经覆盖层插入探针时钟行 `scripts/probe/probe-clock.mjs`，把运行时的 `Date.now()` 平移到一个高峰时刻（周三 15:00 UTC+8，此后照常走时；`new Date()` 与定时器不受影响）；探针 provider 在每条请求记录里写下运行时的 `Date.now()`，按真实时钟运行的 GLM 场景据此判断提醒条数是否与请求所在的高峰时段一致（`ORCHESTRATION.md` §11.4）。

标定运行（`npm run calibrate`，`ORCHESTRATION.md` §10.5.1）用同一个沙盒，但走原生通道 `glm-zcode` 发真实请求，消耗积分，所以不是门禁，按需运行（harness 改动前后、DSH 升级、原生通道验收）。运行前先 `npm run build`。它以 `--json` 读 headless 的运行事件，任务提示词经 stdin 传入，`DSH_PERMISSION_MODE` 缺省传 `danger-full-access`（与用户桌面版的预设一致）。结果写在 `.llm/calibration-runs/<时间戳>/`。探针与标定共用 `scripts/sandbox.mjs`：桌面版路径、启动参数、把数据目录与附件存储指向运行目录的覆盖行、挂 `workspace-changes` 的覆盖行、边界插件的覆盖行、临时 git 仓库。两者都只用 `glmsandbox`，不要同时运行。

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
6. **Client 半的接口**：静态 bundle 的 `client.js` 通过 `window.__ModuleLoader__.load({ factory(require) })` 加载，factory 只拿到 `require`。模块表（壳层冻结表，`reference/dsh-desktop-0.2.1-rc.3/dsh-web-frontend/dist/assets/index-BXV-oxvX.js` 中的 `OZ()`）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`（React 18）、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`；其他库要打进自己的 `client.js`。factory 导出的 `inject` 与 `apply(ctx)` 会被加载器调用，`ctx` 上是声明过的客户端服务（`slots`、`sidebarRightTabs`、`sidebarRight`、`uiConversation`、`resources`、`sessions`、`remote.*`；本仓库 `ui/client.js` 已这样用 `slots` 与 `remote.commands`）。`ui/package.json` 的 `dsh.client.inject` 要列出这些服务所在、必须先到达的包：官方包用 `sidebarRightTabs` 时列 `@deepseek-ai/dsh-client-ui-sidebar-right`，用 `remote.workspaceFiles` 时列 `@deepseek-ai/dsh-api-workspace-files`（`dsh-client-modules/lib/client.js` 的 `arriveDependency`）。`styles` / `host` / `console` 是**动态包沙盒**（cordis-client-runner）的 Builtin，静态包不可用。样式用组件内 `<style>` 元素，颜色用 `--dsw-*` token。跨 host 的动作：读用 `remote.workspaceFiles`（只读，带变更订阅）与会话投影，写用命令通道 `remote.commands` 或工具；不走 `host.call`。客户端可调用的 Remote 能力集合在 `dsh-api-remotes` 构建时固定（README 77–78 行），自定义 Remote 服务要 Typert 生成的 contribution 与宿主侧注册，没有面向第三方的路径，不用；第三方也不能新增转发给客户端的 waterfall。
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
| `npm run lint` | ESLint、knip、jscpd 对照基线（§10） |

**边界**：官方没有 lint/doctor 类静态分析；运行时校验只有在真实宿主里才触发。因此本项目用「官方类型 + tsc」补编译期，用「headless 沙盒」补启动期，用 preflight 补产物与组合完整性，用 ESLint、knip、jscpd 补规范、死代码与重复检查。

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
- [ ] 不新增编译器或检查器告警（`npm run lint`，已含在 `npm test` 中）；新增的压制注释写明理由
- [ ] 修掉了基线里的告警：`npm run lint:update` 缩小基线，与代码同一批提交
- [ ] 文档同步（`DESIGN.md` / `ORCHESTRATION.md` / `ROADMAP.md` / 本文件），与代码同一批提交

## 9. 版本控制

- 仓库：git，远端为 Gitee 私有仓库 `NorthGod_BFDG/GLM-Hourness`（`origin`），主分支 `main`。仓库由 Kiro 管理。
- 一件事一个提交；提交信息用技术话术写清改了什么、为什么、怎么验证的（干净区）。项目图上线后，提交信息带节点 id。
- 不强推，不改写已推送的历史，不跳过钩子。
- 不入库：`.llm/`（凭证、记忆、审计、原始资料）、`/reference/`（审计用参考源码）、`dist/`、`node_modules/`、`.pnpm-store/`。提交前扫描密钥。
- 换行：`.gitattributes` 固定 LF。
- 被取代的文档直接删除，原文留在 git 历史中。

## 10. 检查器与告警

规则见 `ORCHESTRATION.md` §7.5–§7.7：新代码零告警，存量按棘轮只减不增；压制注释写理由；放宽检查配置需用户批准。工具由用户选定（`ROADMAP.md` M1.9 方案 A），精确版本、开发依赖，不做格式化。

| 检查 | 工具 | 配置 | 基线 |
| --- | --- | --- | --- |
| 规范（类型感知） | ESLint 10.13.0、typescript-eslint 8.72.1 | `eslint.config.js`；`tests/tsconfig.json` 给测试文件提供类型信息 | `eslint-suppressions.json`（ESLint 自带的批量压制，按文件与规则计数） |
| 死代码（未用文件、导出、依赖） | knip 6.43.0 | `knip.jsonc` | `knip-baseline.json`（按类型、文件、名称，不含行号） |
| 重复 | jscpd 5.4.2 | `.jscpd.json` | `.jscpd-baseline.json`（jscpd 自带的克隆指纹） |

- `npm run lint`（`scripts/check-lint.mjs`，已接入 `npm test`）：三项各自对照基线。基线之外的新发现使门禁失败；基线里已经不再出现的条目也使门禁失败，并提示运行 `npm run lint:update`。ESLint 这两种失败由它的批量压制自己给出（多出的违规退出码 1，未修剪的压制退出码 2）；knip 没有基线功能，由脚本比对清单；jscpd 的新克隆由它自己的基线判定，失效的指纹由脚本按数量判定。
- `npm run lint:update`：把基线缩到当前状态（ESLint `--prune-suppressions`、knip 重写清单、jscpd `--update-baseline`）。存在任何新发现时拒绝写入，所以基线只减不增。基线文件缺失时按当前状态新建；删掉基线再重建等于接受全部现有告警，需用户批准（`ORCHESTRATION.md` §7.6）。
- 修掉基线里的告警后，代码改动与 `npm run lint:update` 的基线变化同一批提交。
- 范围：`src/`、`tests/`、`scripts/`、`ui/` 与根目录配置文件；不查 `dist/`、`reference/`、`.llm/`、`.agents/`、`.worktrees/`、`.pnpm-store/`。`src/shared/schemastery.ts` 是 vendored 上游代码（文件头写明来源），不进 ESLint 与 jscpd，knip 照常检查对它的引用。配置上的取舍见 `ORCHESTRATION.md` §7.7。
- 基线（2026-10-28，门禁上线时）：ESLint 317 条，分布在 41 个文件（`tests/` 248、`src/` 58、`scripts/dev/` 11）；按规则：`no-unnecessary-type-assertion` 175、`require-await` 77、`no-unsafe-member-access` 16、`no-base-to-string` 15、`unbound-method` 8、`no-unsafe-assignment` 8、`no-unsafe-argument` 5、`no-unsafe-return` 4，其余 9 条分属 5 条规则。knip 35 条：`scripts/dev/` 的 9 个未用文件、13 个未用导出、13 个未用导出类型（其中 3 个是编译期契约检查类型）。jscpd 7 处克隆，75 行（0.57%），4 处在 `scripts/dev/`。
- 门禁上线时演示过一次：临时加一条 `debugger`、一个未用导出、一段复制的函数，并删掉一处被压制的类型断言，三项检查都失败，`npm run lint:update` 拒绝写入、knip 与 jscpd 的基线文件不变；撤回后全绿。
- jscpd 5 是原生二进制，在本机写不进 `%TEMP%`（拒绝访问），门禁让它把 JSON 报告写到 `.llm/checks/`，读完即删。

## 11. 依赖更新

`npm run deps:check`（`scripts/deps-check.mjs`）运行 `pnpm outdated` 与 `pnpm audit`，逐条写出处理方式，不改任何文件。没有待办时退出码 0，有待办时 1，pnpm 报不出结果时 2。它的输出是定期巡检（`ORCHESTRATION.md` §12）的一项输入。

处理规则：

1. 补丁与次版本升级：一次一个提交，过全部门禁（build、preflight、`npm test`；动到运行时会加载的依赖再加 `npm run probe`），提交信息写明升级前后的版本与变更要点。
2. 主版本升级：作为决策交给用户（`ROADMAP.md` §3），不自行升级。
3. `@deepseek-ai/*`（`cordis` 与 `dsh-*`）钉在桌面版运行时所带的版本（`dsh-*` 为 `0.2.1-rc.3`，`cordis` 为 `4.0.5`，与 `reference/dsh-desktop-0.2.1-rc.3/` 一致），不跟注册表走，只在桌面版升级时一起动：按 §4 重新导出 `reference/dsh-desktop-<版本>/`，按 `DESIGN.md` §2.4a 接口对照表逐项复核，再跑 `npm run probe`。只经这些包进入本仓库的安全公告同样随桌面版处理。
4. 新增依赖一律精确版本（`pnpm add -D -E <包>@<版本>`），任何新增先问用户。
5. pnpm 的 store：本仓库的 `node_modules` 链接自仓库内的 `.pnpm-store/`（不入库），与本机全局 store 不同，所以 `pnpm add`、`pnpm update` 要在仓库根目录带 `--store-dir .pnpm-store`，否则报 `ERR_PNPM_UNEXPECTED_STORE`。`pnpm install --frozen-lockfile` 目前失败：根 `package.json` 的 `peerDependencies` 不在锁文件里（M1.9 之前即如此），尚未处理。
6. 升级检查器后重跑 `npm run lint`：新版规则带来的新告警按新代码处理，修掉；修不掉的交给用户决定，不扩大基线。

2026-10-28 的结果：`typescript` 5.7.2 → 7.0.2 是主版本升级（typescript-eslint 8.72.1 只支持低于 6.1 的 TypeScript；5.x 线最新为 5.9.3），已列入 `ROADMAP.md` §3。`pnpm audit` 报 1 条高危：zod 4.4.3（GHSA-mrhx-c7xc-m3w5，4.6.6 修复），只经 `@deepseek-ai/dsh-llm` 进入本仓库，那是只用于类型检查的开发依赖，随桌面版处理。
