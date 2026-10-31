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

### 1.1 按风险分级〔2026-10-28 用户选定，项目图 `norm-verify-tiers`〕

| 项 | 规则 |
| --- | --- |
| L1、L2 | 每次改动都跑，不分级 |
| L3 | 改动碰到 DSH 运行时的代码就跑（宿主各行、探针覆盖的接缝），每个分支合入 main 之前跑一次 |
| L4 桌面版 | 不再逐个改动做。攒到批次点一起做：一个里程碑的收尾任务（M1 是 `m1-11`），或者一批互相依赖的改动都合入之后。验收条件只能在真机上看到的节点，合入后保持进行中，在节点上批注「待 L4」，批次 L4 通过后再关。凭证与签名的真实网络验证（沙盒里发真实请求）不算 L4，随改动做 |
| 独立评审 | 只给凭证、签名与认证（`src/glm-llm/` 的凭证、签名、登录）、guard 规则（`src/guard/`、`src/graph/` 的图文件门禁）、图引擎的权限与审计（`src/graph/engine.ts`、违规与决策流水）做；其余改动靠门禁 |
| 派出去的 worker | 规格写清楚的实现与集成任务用高档推理，调研、设计与含糊的任务用最高档 |
| 评审挡路的标准〔2026-10-29 用户定，项目图 `d-failure-plans`〕 | 原则：不怕失败，怕失败之后没有预案；预案包括优雅地重试，以及事后能追溯到原因（留痕足够修 bug）。设计评审与代码评审只有三类发现挡路：验收条件没有满足；会造成不可逆损失（丢数据、毁掉检出或用户 profile、对外的动作）而没有预防；失败了没有途径发现，发现了没有恢复办法（重试、降级、回滚、停下交人），或事后查不到原因。其余边角情况记成非阻断，或转成提议节点，不要求设计或代码穷举。可逆、能被发现、有恢复办法的失败，写清预案就够。必须改的发现一轮没有减少，就停下交人 |
| 设计依据的学科〔2026-10-29 用户同意〕 | 设计稿在方案五栏的「架构」一栏写明本设计依据的学科与标准（`ORCHESTRATION.md` §4.3），设计评审按列出的学科去审；不加新的人工步骤，挡路标准仍是上一行 |

合入并 build 后，桌面版重启时加载新代码；运行中的桌面版不等重启，在下一次 profile 写入（模型菜单、设置表单、插件管理器）时就按磁盘上的 bundle patch 就地重组（`FACTS.md` §3 的 dsh-hmr 一行）。所以改变 bundle 布局或启用新行的合入先关桌面版，再合入、build、启动（§5 第 4 条）。批次 L4 之前，汇报里写明哪些改动还没在桌面版上跑过。

## 2. 安装门禁

任何 `plugin_manager install_bundle` 之前，必须按顺序通过：

```powershell
npm run build        # 删各包的 dist/，tsc 全量类型检查（含 adapter 契约检查，见 §4），两个包各编一份到 packages/*/dist/，客户端类型检查与打包
npm run preflight    # 目录表、两包清单与 patch、组合、产物与显示信息、运行时裸导入、client 半一包一源
npm test             # preflight + 逐字门禁 + 检查器门禁 + 密钥扫描 + 全部 spec
```

`npm test` 的前四道是 preflight、逐字门禁（`npm run check:verbatim`，规则见 `DESIGN.md` §5.9）、检查器门禁（`npm run lint`，§10）与密钥扫描（`npm run check:secrets`，§10），最后一道是项目图入口脚本的冒烟（`npm run graph:smoke`，§12）；`npm run preflight` 单独跑用于安装前快检。

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

1. 新行先装进**临时 profile**（`dsh plugin --profile <tmp> add <检出>/packages/glm <检出>/packages/hourness -w`，只验一层就只装那个包），跑 headless；报错就地修，不碰主 profile。探针生成的 profile（见下）已经覆盖两包同列与只装一个包的三种组合，多数改动不需要另建。
2. 只有临时 profile headless 干净通过，才安装进主 profile。
3. 安装后先看 `plugin_manager` 返回的 `application` 与 `warnings`：`applied` 只代表 loader 接受了行，不代表启动/GUI 正常。**重启或刷新后必须再验一次**。

本机已备好沙盒环境（可复用）：

```powershell
# 首次：从 headless 模板创建，并装入两个包（pnpm 需要 -w）
& $exe $bin --profile glmsandbox --from-default-profile headless --dump-config
& $exe $bin plugin --profile glmsandbox add <repo>/packages/glm <repo>/packages/hourness -w
# 每次验证：带覆盖 patch 真实 boot（覆盖层只读，不改持久配置）
& $exe $bin --profile glmsandbox --patch <repo>\.llm\sandbox-enable.yml "Say hi in one word"
```

行为探针（`npm run probe`，`scripts/probe/`）：在每次运行生成的 profile 上真实启动桌面版运行时（见本节「探针的 profile」），用脚本化的探针 provider（`glm-probe`，模型 `glm-5.3`，不联网）替代真实模型，记录运行时发给模型的每个请求（系统提示词、工具面、消息摘要），并检查方言提示词、工具面、别名执行与 todo 提醒是否生效。脚本的每一步可以是一次工具调用、同一轮里的多个并行调用，或一段文本。探针 provider 的模型目录（含输入模态）与图片目标取自 `packages/glm/dist/glm-llm`，并用原生通道的真实编码器与运行时附件服务编码每个请求，记录图片块的落点，所以跑探针前先 `npm run build`。图片场景把附件存储指到场景目录（覆盖 `attachment-local` 的 `dshHome`），不写 `~/.dsh`。每个场景的数据目录行指向场景自己的目录（`dshHome` 为 `<场景>/dsh-home`，`projectHome` 为 `<场景>/home`；memory、workflow、hourness 的 `home` 也指向 `<场景>/home`，与用户 profile 补丁同形），探针在运行前后比对真实的 `~/.dsh/glm-hourness/audit/usage.jsonl`，变了就判失败。脚本里标了 `status` 的一步，探针 provider 经运行时的 `agents.get` 与 `commands.find` 取到会话的 agent 和本包的 `/glm-status` 处理函数并直接调用（不经命令生命周期事件，此时 agent 正在一步之中），输出记进该次请求的记录，用来检查行健康表（`DESIGN.md` §2.5）；`glm-login` 的 `home` 同样指向场景目录，探针不会读到真实凭证。guard 的影子场景在运行目录下新建一个临时 git 仓库，以它为会话工作目录启动，并经覆盖层挂上 `@deepseek-ai/dsh-workspace-changes`（桌面版 profile 经 `dsh-web-app` 有这个包，沙盒模板没有），用来检查工作区变更兜底（`ORCHESTRATION.md` §6.5.2）。每次运行的覆盖补丁、请求记录与日志写在 `.llm/probe-runs/<时间戳>/`。覆盖补丁由运行器按次生成，因为 Loader 在 `!!js` 求值前就校验行的 `name`。探针不进 `npm test`（需要本机桌面版）；涉及运行时行为的改动以它为 L3 门禁。探针另有两个场景检查标定运行的边界插件 `scripts/calibrate/limits.mjs`：步数上限为 2 时第 3 步被拒、回合以 `blocked` 结束；时间上限为 5 秒时一条 60 秒的 shell 命令被取消、之后不再有步。高峰提醒场景与非 GLM 场景经覆盖层插入探针时钟行 `scripts/probe/probe-clock.mjs`，把运行时的 `Date.now()` 平移到一个高峰时刻（周三 15:00 UTC+8，此后照常走时；`new Date()` 与定时器不受影响）；探针 provider 在每条请求记录里写下运行时的 `Date.now()`，按真实时钟运行的 GLM 场景据此判断提醒条数是否与请求所在的高峰时段一致（`ORCHESTRATION.md` §11.4）。每个场景的覆盖层还插入网络记录行 `scripts/probe/probe-net.mjs`（不属于 bundle），把宿主进程里经 fetch 发出的每个请求的 origin 与路径（不记查询串、头与正文）写进场景目录的 `net.jsonl`。它包的是 fetch 读取的全局 undici 调度器，不是 `globalThis.fetch`：额度读取与登录客户端在行激活时就取走了 `fetch` 引用，之后对 `globalThis.fetch` 的包装看不到它们。行激活后它向一个无人监听的本机端口发一次自己的请求，记录里有这一行才说明记录器在这个进程里是活的。额度相关的检查读这些记录与各场景的输出：所有场景都没有发往 `/api/monitor` 的请求（探针的 `glm-login` home 没有凭证）；只装 GLM 包时 `/glm-status` 有高峰行与「额度：未登录 GLM（/glm-login）」，只装编排层包时 `/hourness` 按 token 列、没有高峰行、额度一节与 GLM 的循环板条目、没有告警，两包都装时 `/hourness` 的额度一节写「未登录」；所有场景发给模型的请求正文（系统提示词、工具面、消息）里都没有额度一节的文字（`ORCHESTRATION.md` §11.3）。探针 provider 按会话分别应答：第一个发出脚本化请求的会话走 `script`，之后的会话（子 agent、验证插件新建的根 agent）按首次请求的顺序依次取 `others` 里的脚本；标了 `goal` 的一步从该会话当前的 goal 填入 `update_goal` 的 `goal_id` 与 `revision`。派发可行性验证的三个场景经覆盖层插入验证插件 `scripts/probe/probe-dispatch.mjs`（不属于 bundle），它把观察写进场景目录的 `dispatch.jsonl`：`glm-dispatch` 派一个后台子 agent，检查结构化交回与写入范围门禁；`glm-goal` 在第二个根 agent 上跑两轮 goal，检查目标轮注入与完成门禁；`goal-headless` 确认 headless 运行器不跑目标轮（`ORCHESTRATION.md` §2.1、§3.2）。

主 Agent 模式的探针（场景 `glm-design-wish-idle`、`non-glm-design-wish-idle`、`glm-design-main`、`non-glm-design-main`、`glm-design-one-main`，M3 第 3 步；`ORCHESTRATION.md` §3.1）：设计行默认禁用，覆盖层（`scripts/sandbox.mjs` 的 `designRows`）启用它，挂上 headless 模板没有的 `@deepseek-ai/dsh-tool-ask-user`（好看到主 Agent 的工具面里它被去掉），并插入模拟人 `scripts/calibrate/simulated-human.mjs`（不属于 bundle）。模拟人替人做两件事：在第一个根 agent 创建时发 `/wish`（配置 `wish`：`true` 或一句话；在串行的 `agent/created` 监听器里发，所以命令事件排在 headless 任务消息之前），并对每个 agent 的问答卡请求以 `ASK_CANCELLED` 拒绝、记 `unexpected-question`（主 Agent 不该出卡）；一切写进场景目录的 `human.jsonl`。探针 provider 的脚本多三个手段：`line: "/wish …"` 经 `commands.execute` 以人的身份发命令，`command/run` 与 `command/done` 进会话日志（`command` 步直接调处理函数、不产生命令事件，一步里两者互斥，`parseScript` 在场景开跑之前就抛错）；`other: {line}` 在同一工作区的第二个根会话里发命令（第一次用到时建会话，和人开第二个窗口一样）；`fork: true` 按会话控制器 fork 的做法（`agents.create` 带 `seed` 与 `inheritedEventCount`）在会话第一条已完成的命令处分出新会话，等设计行对它跑完 `/wish off`，记下它的投影，再发一条消息让它的第一个请求到探针（headless 组合没有会话控制器，所以不经控制器本身）。三者都把结果、命令期间会话日志里的事件类型与字节数记进该次请求的记录；`/wish` 这类会 `inject` 消息的命令，事件里除了 `command/run`、`command/done` 还有 `agent/inbox/spliced`。每个场景有自己的工作区（空的 `docs/graph/` 加 `README.md`），持有者记录在场景自己的 `dsh-home/glm-hourness/main-agent/` 下，探针直接读它。

标定运行（`npm run calibrate`，`ORCHESTRATION.md` §10.5.1）用 `glmsandbox`，走原生通道 `glm-zcode` 发真实请求，消耗积分，所以不是门禁，按需运行（harness 改动前后、DSH 升级、原生通道验收）。运行前先 `npm run build`。它以 `--json` 读 headless 的运行事件，任务提示词经 stdin 传入，`DSH_PERMISSION_MODE` 缺省传 `danger-full-access`（与用户桌面版的预设一致）。结果写在 `.llm/calibration-runs/<时间戳>/`。探针与标定共用 `scripts/sandbox.mjs`：桌面版路径、启动参数、生成 profile、把数据目录与附件存储指向运行目录的覆盖行、挂 `workspace-changes` 的覆盖行、边界插件的覆盖行、临时 git 仓库。两者不要同时运行。标定用 `glmsandbox`（环境变量 `DSH_SANDBOX_PROFILE` 可以换成别的 profile）；`glmsandbox` 的包是指向主检出的 junction，在 git worktree 里标定加载的仍是主检出的产物：要标定 worktree 的代码，另建一个临时 profile（复制 `glmsandbox` 的配置文件，junction 改指 worktree 里对应的目录），以 `DSH_SANDBOX_PROFILE` 给出它的名字，用完删除。`glmsandbox` 与桌面版 profile 直接列两个宿主包 `dsh-glm-zcode` 与 `dsh-hourness`（指向主检出的 `packages/glm`、`packages/hourness`）：2026-10-29 split 合入时段里切换，两个 profile 的 `package.json` 只改了 `dsh.profile.bundles` 与 `dependencies` 两个键，改前备份，覆盖项按行 id 照常匹配（切换时间、名单与备份文件见 `HANDOFF.md` §1）。profile 若还列着单包布局的 `dsh-glm-hourness` 或 `dsh-glm-hourness-ui`，这两项都会被跳过（stderr 的 `skipping profile bundle`），本项目的行全部缺席。桌面版的 profile 只能在桌面版关闭时，经安装目录里的 `resources\runtime\cli\bin\dsh.cmd`（桌面版命令行启动器，带安装自带的 pnpm）操作，上面的 `bin.js` 拒绝对 `desktop` 运行 plugin 命令（`FACTS.md` §3）。

探针的 profile（`scripts/sandbox.mjs` 的 `generateProfile` 与 `PROBE_PROFILES`，包名与目录取自 `scripts/packages.mjs`）：每次运行在运行目录下生成 DSH home `dsh-root/`，其中三个 profile 的 `package.json` 都先列 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`，再列本检出的包：`probe-full` 列 `dsh-glm-zcode`、`dsh-hourness`（与 split 合入后的桌面版、`glmsandbox` 相同；每个包的客户端面随它自己的 patch 进来），`probe-glm` 只列 GLM 通道包，`probe-hourness` 只列编排层包。`dependencies` 写 `link:`，`node_modules` 下的 junction 指向本检出里的包目录，`cordis.yml` 与 `cordis.patch.yml` 是空列表；运行时带 `DSH_HOME` 与 `--profile <名字>` 启动。场景 `glm-only` 跑在 `probe-glm` 上，`hourness-only` 与 `rules-peak-hourness` 跑在 `probe-hourness` 上，其余场景跑在 `probe-full` 上；覆盖层只改所选 profile 里有的行，单包运行不留没有目标的覆盖项。headless 模板没有 client-modules，场景 `client-modules` 经覆盖层在 `probe-full` 上挂 `@deepseek-ai/dsh-client-modules` 并启用 `glm-hourness/glm-ui`，探针 provider 在一步之中读 `clientModules.graph().entries`，核对两个包的客户端面各出现一次、没有组合错误（它在构造时扫描已加载的行，组合出错就抛错）。`client-modules`、`glm-only`、`hourness-only` 三个场景各有一步标了 `meta`：探针 provider 按设置页「内置插件」的读法（`pluginPackages.metaOf(行名, 行所在树的基准)`）取 Loader 里每个 `glm-hourness/*` 行的显示信息，运行器核对这个 profile 列的包的每一行恰好一条、标题等于它的 locale 文件（宿主行 `locale/<行>/`，客户端行是包的 `locale/`），没有多出的本项目行（`DESIGN.md` §2.3）。被测的就是探针脚本所在的检出：主检出与 git worktree 都直接 `npm run probe`，不读写 `~/.dsh/profiles/`；运行时的会话与存储也写在这个 DSH home 下（`dsh-root/sessions/`、`dsh-root/storages/`），不进 `~/.dsh`。运行结束时（失败退出也一样）删掉全部 junction，运行目录里不留指回检出的链接，删除或遍历运行目录都碰不到检出。

探针的守卫：运行前 `~/.dsh/profiles/` 下已有 `probe-full`、`probe-glm` 或 `probe-hourness` 时退出码 2，先查明是哪次运行留下的再删；生成 profile 失败（建目录或 junction 出错）同样退出码 2，不算探针结论。运行前后各取一次桌面版与 `glmsandbox` 两个 profile 的结构（`scripts/profile-shape.mjs`，见下段）：与本项目相关的部分（`dsh.profile.bundles`、`dependencies`、id 以 `glm-hourness/` 开头的覆盖项）变了，退出码 2，结论作废，重跑，重跑仍出现按探针缺陷处理（变化可能来自探针写错位置，也可能是人同时在设置里改了本项目的行）；其余条目的变化（多半是桌面版自己写的，例如模型菜单改 `agent-default-model`，或 `package.json` 的 `dsh.desktopNext*`）只列出，不影响退出码。第一条探针检查核对生成的三个 profile 确实都被启动：它们的 `cordis.yml` 都已被启动器改写（启动器每次启动都重写这个文件），且 `~/.dsh/profiles/` 下没有出现其中任何一个名字；不满足说明运行时没有按 `DSH_HOME` 找 profile，判失败。真实用量流水变了同样判失败。

`node scripts/profile-shape.mjs snapshot|compare <profile> <文件>`：只读，profile 在 `$DSH_HOME/profiles/<名字>`（未设置时 `~/.dsh`），名字只接受 `[A-Za-z0-9_-]+`。结构是 `package.json` 的 bundles、依赖名与其余清单键（顶层、`dsh` 下、`dsh.profile` 下），依赖与清单键各带值的 SHA-256 摘要；`cordis.patch.yml` 按顶层条目切块（行首的 `-` 开始一条），每条取 `id`、键名路径与规整后文本的 SHA-256（去掉行尾空白、空行与整行注释，标量去掉成对引号；不解析 `!!js`，不需要 YAML 依赖；有内联值的键下面更深的行属于这个值，不当成键）。`compare` 列出 bundles 与依赖的增删与顺序变化、依赖值与其余清单键的变化、按 id 的条目增删、键名变化与摘要变化。输出与快照只有 id、键名、包名、摘要与差异类别，不含任何值。退出码 0 已写入或无差异、1 有差异、2 参数不对或读不出 profile、快照。

注意：`--profile desktop` 会被拒绝（Electron 独占 profile），必须用独立 profile。沙盒里的 `MISSING_CREDENTIAL`、`home is not configured`、缺 compaction 引擎属于模板差异，不是被测插件的问题；判据是**没有出现被测插件的契约/激活错误**。

## 4. 契约校验（编译期）

DSH 官方类型已作为 devDependency 安装（`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-attachment`、`@deepseek-ai/cordis`，版本 `0.2.1-rc.3`，与运行时一致）。

- `src/glm-llm/zcode.ts` 底部有 `AdapterContractCheck`：`ZcodeAdapter` 必须结构兼容 `LlmAdapter` 的全部公开成员。任何签名/返回形状漂移 → `npm run build` 失败。
- 薄适配层（`src/shared/dsh-min.ts`、`src/shared/lm-min.ts`）里有两处同样的检查：`LlmStreamOptionsContractCheck`（官方 `GenerateOptions` 必须覆盖 `llm/stream` 监听器读取的字段）、`AttachmentsContractCheck`（官方 `AttachmentStore` 必须覆盖通道读图用的成员）。其余宿主接口没有已安装的官方类型，逐项证据见 `DESIGN.md` §2.4a 接口对照表。
- 新增 adapter / 服务实现时，同样用「官方类型 + 类型级断言」把契约钉死在 tsc 里，禁止只靠运行时手测。
- 契约来源优先级：桌面版运行时的包（`reference/dsh-desktop-0.2.1-rc.3/`，从 `app.asar` 导出）> 官方 `.d.ts` > `reference/deepseek-harness` 源码 > 运行时行为观察。`reference/deepseek-harness` 是更新的主干，版本号相同但接口不同，只用来理解设计意图（`DESIGN.md` §2.4a）。
- 重新导出运行时包（桌面版升级后）：用 Electron node 模式读 `resources/app.asar/dsh/node_modules/@deepseek-ai/` 并整目录复制到 `reference/dsh-desktop-<版本>/`（跳过嵌套 `node_modules`）。然后按 `DESIGN.md` §2.4a 接口对照表逐项复核，改动只落在薄适配层，再跑 `npm run probe`。
- 换 ZCode 基线（ZCode 自动更新之后）：安装目录的包随更新变化，门禁不读它。把新版的 pristine 包复制到 `reference/zcode-<版本>/zcode.cjs` 并记下大小与 MD5，旧版副本留作对照；按旧版到新版逐段比对本仓库引用的每段文本与代码（3.16.3 → 3.17.1 用压缩名归一后的偏移映射，差异清单在不入库的 `.agents/tasks/zcode-3171/diff.md`）。文本全部更新之后，最后一个提交把 `scripts/check-verbatim.mjs` 的 `REFERENCE_BUNDLE` 改指新副本，`AGENTS.md` 与各文档的基线条款同批改（`DESIGN.md` §5.9）。

## 5. 纪律

1. **默认 disabled**：bundle 里的新行一律 `disabled: true`；验证通过后才在 profile 里启用。
2. **一次一个变量**：一次交付只推进一层（适配器、UI、配置），不混合。混合会放大故障面。
3. **不静默改 profile**：除用户明确要求，不改用户的 `cordis.patch.yml`；改前先备份（`cordis.patch.yml.bak-*`）。
4. **装后必验**：`application: applied` ≠ 启动成功。热装后刷新/重启验证，或明确告知用户「重启后生效」。主检出是桌面版的加载源：桌面版运行时合入并 build，下一次 profile 写入就会按磁盘上的新 bundle patch 重组并比对模块（`FACTS.md` §3 的 dsh-hmr 一行），这次重组没有人验过。改变 bundle 布局或启用新行的合入，先关桌面版，再合入、build、启动。
5. **错误先归因**：同一症状连续两次修复无效时，停下来查契约/根因，不在现场打补丁。
6. **Client 半的接口**：静态 bundle 的 `client.js` 通过 `window.__ModuleLoader__.load({ factory(require) })` 加载，factory 只拿到 `require`。模块表（壳层冻结表，`reference/dsh-desktop-0.2.1-rc.3/dsh-web-frontend/dist/assets/index-BXV-oxvX.js` 中的 `OZ()`）：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`（React 18）、`@deepseek-ai/cordis`、`zod`、`@tanstack/react-virtual`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`；其他库要打进自己的 `client.js`。factory 导出的 `inject` 与 `apply(ctx)` 会被加载器调用，`ctx` 上是声明过的客户端服务（`slots`、`sidebarRightTabs`、`sidebarRight`、`uiConversation`、`resources`、`sessions`、`remote.*`；本仓库两个包的 `client.js` 已这样用 `slots` 与 `remote.commands`）。本仓库的两个包各自声明 `dsh.client`，客户端面在包的 `ui/` 下（宿主半 `ui/index.js` 是导出 `.`，产物 `ui/client.js` 是导出 `./client`），由包的 patch 以精确包名插入唯一一行；宿主行写子路径说明符，client-modules 不把它们算作来源（`DESIGN.md` §2.3）。`dsh.client.inject` 要列出这些服务所在、必须先到达的包：官方包用 `sidebarRightTabs` 时列 `@deepseek-ai/dsh-client-ui-sidebar-right`，用 `remote.workspaceFiles` 时列 `@deepseek-ai/dsh-api-workspace-files`（`dsh-client-modules/lib/client.js` 的 `arriveDependency`）。`styles` / `host` / `console` 是**动态包沙盒**（cordis-client-runner）的 Builtin，静态包不可用。样式用组件内 `<style>` 元素，颜色用 `--dsw-*` token。跨 host 的动作：读用 `remote.workspaceFiles`（只读，带变更订阅）与会话投影，写用命令通道 `remote.commands` 或工具；不走 `host.call`。客户端可调用的 Remote 能力集合在 `dsh-api-remotes` 构建时固定（README 77–78 行），自定义 Remote 服务要 Typert 生成的 contribution 与宿主侧注册，没有面向第三方的路径，不用；第三方也不能新增转发给客户端的 waterfall。
7. **Cordis inject 写完整服务路径链**：访问 `ctx.remote.commands` 时，`inject` 必须同时声明 `'remote'` 与 `'remote.commands'`（照抄官方 ui-commands：`['inputTriggers', 'sessions', 'remote', 'remote.commands', 'locale']`）。只声明嵌套名会在访问 `ctx.remote` 根时抛 `cannot get property "remote" without inject`。写 Client 半前先读对应官方包的 `inject` 声明，不猜。

8. **删用量记录要留缺口行**：用户级用量流水（`~/.dsh/glm-hourness/audit/usage.jsonl`）里的记录，谁删谁在同一天往同目录的 `usage-gaps.jsonl` 追加一行：`at`（删除的时刻）、`removed`（条数）、`reason`（为什么删、谁要求的）必填，`detail`（按 provider 与模型的条数）、`from`、`to`（被删记录的时间范围）、`ref`（留痕的出处）可选；字段与上限见 `DESIGN.md` §2.4。没有这一行，`/hourness` 的面板看不出删过记录，积分数会少得没有交代。改前备份、改后核对条数，与第 3 条同理；追加的行不改，要撤销就删掉那一行。
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
| `npm run check:secrets` | gitleaks 密钥扫描（§10） |

**边界**：官方没有 lint/doctor 类静态分析；运行时校验只有在真实宿主里才触发。因此本项目用「官方类型 + tsc」补编译期，用「headless 沙盒」补启动期，用 preflight 补产物与组合完整性，用 ESLint、knip、jscpd 补规范、死代码与重复检查，用 gitleaks 补密钥扫描。

## 7. 事故记录

| 日期 | 事故 | 暴露层 | 缺口 | 已补 |
|---|---|---|---|---|
| 2026-10-27 | memory 行激活期调用无参 `workingDirectory.ensure()`，host 启动崩 | L4 | 激活期代码无容错、无沙盒 | 激活期 fail-open 纪律（§5.4 相关），见各行实现 |
| 2026-10-27 | `dsh.client` 声明 + 多行同包 → client-modules `resolves from multiple active Loader sources`，启动失败 | L3→L4 | client 半「一包一源」约束未知 | preflight 增加该检查；UI 半必须独立单入口包 |
| 2026-10-27 | `listModels` 缺 `provider` 字段 → `adapter returned invalid or duplicate model` | L1→L4 | adapter 契约靠猜 | 接入官方 .d.ts + `AdapterContractCheck`，tsc 直接拦 |
| 2026-10-27 | 静态包 client 半用了 `styles` Builtin → `ReferenceError: styles is not defined` | L4 | 混淆了动态包沙盒 Builtin 与静态包模块表 | 静态包 client 半只有 `require`（React 等模块表）；样式用组件内 `<style>` 元素渲染 |
| 2026-10-27 | 15:36–17:22 的 190 条用量记录与 1 条记忆写进 `~/.dsh/profiles/desktop/.llm/`，`/hourness` 读不到 | 审计数据复查 | 各行各自配置 `home`，没有单一数据目录 | 2026-10-28：数据目录行与服务（`DESIGN.md` §2.4），记录已复制到新位置 |
| 2026-10-27 | guard 把 shell 命令文本里的 `=>`、`>>>`、`->` 当成重定向拦截，共 3 次 | L4 | 正则检测无引号感知 | 2026-10-28：引号感知检测，命令集不扩充；读不到的写法由工作区变更兜底在回合结束时记录，拦不住（`ROADMAP.md` M1.8、`ORCHESTRATION.md` §6.5.2）；L2 覆盖两种方言，L3 探针检查放行与影子记录 |
| 2026-10-27 | guard 已知拦截至少 3 次，违规审计 0 条 | 审计数据复查 | 违规回调无法从配置传入，降级没有上报 | 2026-10-28：guard 经数据目录服务落盘，缺目录时控制台报一次，探针检查拦截后的违规记录（`ROADMAP.md` M1.4）；各行的降级经行健康上报，`/glm-status` 显示（M1.5，`DESIGN.md` §2.5） |
| 2026-10-28 | 原生通道编码器按 `toolCalls` 字段读助手的工具调用，rc.3 以 `tool-call` 内容块传递，工具调用会被全部丢弃 | 读 rc.3 运行时包（修图片时） | `lm-min.ts` 的结构类型对照的是 `reference/deepseek-harness` 主干；通道只有单测和真网单轮冒烟，没有多轮工具调用的验证 | 结构类型按 rc.3 重写；探针请求摘要读 `tool-call` 块（`DESIGN.md` §4.5）；多轮工具调用的真机验证随 L4 |
| 2026-10-28 | guard 对 `terminal_send` 读 `command` 参数，rc.3 的参数名是 `text`，终端里的 shell 写入从未被检查（桌面版 profile 装了终端包） | 读 rc.3 运行时包（M1.8） | M1.6 的接口对照只核了钩子、服务与载荷，没有逐个核对工具参数名；单测用的是同一个错误字段 | 改读 `text`，按 bash 与 pwsh 两种方言判；接口对照表加 shell 工具与文件工具的参数行（`DESIGN.md` §2.4a） |
| 2026-10-28 | guard 违规记录的 `agentId` / `sessionId` 读自 `tools/pre-execute` 载荷上不存在的字段，永远为空；workflow 的派遣名单缺 base profile 的 `subagent_fork`，fork 派遣从未记录 | 读 rc.3 运行时包（M1.6 逐项对照） | 各行自带宿主结构类型，没有逐项对照 rc.3；探针没有覆盖审计流水 | 接口对照表（`DESIGN.md` §2.4a）；宿主类型收进薄适配层；探针加用量流水与派遣工具名检查 |
| 2026-10-28 | guard 把工作区内的相对路径写入（`.llm/l4-dsh/calc.mjs`）判为工作区外并拒绝；同一判定对 `C:\ws\..\elsewhere` 这类写法放行 | L4 | 圈禁只做大小写与分隔符归一化，没有按文件工具的方式解析路径；单测与探针只用绝对路径 | 相对路径按会话工作目录解析，`path.resolve` 折叠 `..`（`ORCHESTRATION.md` §6.1）；L2 覆盖相对路径、`..`、同前缀兄弟目录、`cd` 后的工作目录；L3 探针加 GLM 相对写入放行与 `..` 越界拒绝 |
| 2026-10-28 | 原生通道的提示词缓存常常没命中最新前缀：修复前的标定基线里 GLM-5.3-Flash 45 次后续请求有 16 次（4 次整段未命中），L4 桌面 GLM-5.3 会话 17 次有 5 次 | L4 与标定数据复查 | 从 zcode-api 移植到原生适配器时，按会话固定的 `x-session-id` 变成了每请求随机；「会话 id 是网关的缓存亲和键」没有记成接口事实；没有按步统计命中的检查 | 会话 id 按 DSH 会话固定（`DESIGN.md` §4.5b，实测表）；修复后 Flash 只剩会话第二步没命中，原因未明。另一次修复（标题请求另起会话 id）经完整标定证伪后撤回。修复前后的标定见 `DESIGN.md` §4.5b 实测表 |
| 2026-10-28 | 原生通道丢弃历史中的 reasoning；BigModel 要求 Coding Plan 端点上把 reasoning 原样传回 | 查缓存时读 BigModel 文档与 ZCode | 编码器注释断言「本通道没有可回放的签名」，没有实测过流里有没有签名 | 实测签名形态；解码把签名存进 DSH 回放信封，编码按 ZCode 回放（`DESIGN.md` §4.5c） |
| 2026-10-28 | 移植丢了 ZCode 请求的四处细节：`x-request-id`、`x-zcode-trace-id`、`metadata.user_id`、末条消息的缓存断点 | 同上 | 移植时没有对照 zcode-api 的请求体变换（`body-transformer.ts`）与追踪头逐项核对 | 补齐（`DESIGN.md` §4.5b）；与缓存命中无关，实测确认 |
| 2026-10-28 | guard 拦下 DeepSeek 会话的写入（§6.2 定案只管 GLM，未实现） | L4 | 定案写进文档但标着「尚未实现」，没有挂进待办；拦截处没有路由信号 | 按会话请求头判路由，只拦 GLM 调用（`ORCHESTRATION.md` §6.2）；非 GLM 会话的行健康写明不介入；L3 探针加非 GLM 会话的相对写入与 shell 写入都放行、无违规记录 |
| 2026-10-28 | 重新构建 `ui/client.js` 后刷新桌面版页面，`web boot: 1 entry did not activate`，`dsh-glm-hourness-ui: import failed`；请求的 `dsh-app://app/plugins/??dsh-glm-hourness-ui/client.js&rev=…` 返回 404 | L4（DevTools 协议看网络请求） | 〔推断，未读宿主源码核实〕宿主给客户端半的地址带修订号，文件变了而宿主记的修订号没变，地址就对不上。同一次运行里第一次重建后刷新拿到了新文件，第二次没有，什么时候更新修订号没查清 | 改了客户端半就重启桌面版，不靠刷新页面（§3 装后验证）；重启后恢复。只影响客户端半，宿主各行不受影响 |
| 2026-10-28 | 原生通道的签名握手每次 404，且每个模型请求前都串行重试一次（约 90 毫秒）；此前归因为「握手对当前凭证失败」 | 截包（查缓存时） | 移植时把路由改写后的 URL 交给签名层（基线 `9266fb6` 起），握手 origin 成了 `zcode.z.ai`；zcode-api 用的是路由前的 URL，移植没有逐项对照；签名单测只断言握手路径 `endsWith`，没有路由加签名的适配器组装测试；失败放行不报错，问题只表现为每请求的延迟 | 签名用路由前的 provider URL，握手经端点路由，start-plan 不签名，握手失败冷却 60 秒（偏离 3.16.3，`DESIGN.md` §4.3）；单测断言完整握手 URL，`tests/glm-zcode.spec.ts` 加组装测试（握手地址、路由头顺序、失败冷却、start-plan）；沙盒真实网络运行实测握手 200、签名请求被 ultra 网关接受（2026-10-28，`DESIGN.md` §4.3）；签名失败的通知仍没有接出（生产构造没有接 `onEvent`） |
| 2026-10-31 | 11 个已推送提交（`aaab499` 到 `534b4f0` 之间的图提交与 `7c2592e`）的提交说明以 U+FEFF（字节顺序标记）开头，`git log --oneline` 在中文控制台里显示成「锘縢raph」；同一写法写出的一份图操作草稿被 `JSON.parse` 拒收 | 编排方读提交历史 | Windows PowerShell 5.1 的 `Set-Content -Encoding utf8` 写文件带字节顺序标记，`git commit -F` 原样收进提交说明；提交前没有核对 | 提交说明与 JSON 草稿用不带字节顺序标记的写法（编排方的文件工具，或 `[IO.File]::WriteAllText` 配 `UTF8Encoding($false)`），提交后核对新提交的第一字符；已推送的提交按 §9 不改写 |

## 8. 变更检查清单

- [ ] `npm run build` 通过
- [ ] `npm run preflight` 通过
- [ ] `npm test` 通过
- [ ] 新行 `disabled: true`，或已在临时 profile 验证
- [ ] 临时 profile headless boot 干净（涉及 loader/激活/新包时必做）
- [ ] 装后验证：`application: applied` + 刷新/重启后无新错误
- [ ] 不新增编译器或检查器告警（`npm run lint`，已含在 `npm test` 中）；新增的压制注释写明理由
- [ ] 修掉了基线里的告警：`npm run lint:update` 缩小基线，与代码同一批提交
- [ ] 改了 `docs/graph/nodes/` 的，已重新出图，`graph.svg` 与节点文件同批提交（§12）
- [ ] 文档同步（`DESIGN.md` / `ORCHESTRATION.md` / `ROADMAP.md` / 本文件），与代码同一批提交

## 9. 版本控制

- 仓库：git，远端为 Gitee 私有仓库 `NorthGod_BFDG/GLM-Hourness`（`origin`），主分支 `main`。仓库由 Kiro 管理。
- 一件事一个提交；提交信息用技术话术写清改了什么、为什么、怎么验证的（干净区）。项目图上线后，提交信息带节点 id。
- 不强推，不改写已推送的历史，不跳过钩子。
- 不入库：`.llm/`（凭证、记忆、审计、原始资料）、`/reference/`（审计用参考源码）、`dist/`、`node_modules/`、`.pnpm-store/`。提交前扫描密钥（`npm test` 含密钥扫描，§10）。git worktree 里因此没有 `reference/`：读参考源的门禁与测试（逐字门禁 `scripts/check-verbatim.mjs` 读 `reference/zcode-3.17.1/zcode.cjs`；`tests/glm-startplan.spec.ts` 拿 start-plan 文本比对 `reference/zcode-api` 的 `zcode_system.json`）经 `scripts/reference-dir.mjs` 读主检出的 `reference/`，worktree 里不复制、不链接，也不设环境变量。
- 换行：`.gitattributes` 固定 LF。
- 被取代的文档直接删除，原文留在 git 历史中。

## 10. 检查器与告警

规则见 `ORCHESTRATION.md` §7.5–§7.7：新代码零告警，存量按棘轮只减不增；压制注释写理由；放宽检查配置需用户批准。工具由用户选定（`ROADMAP.md` M1.9 方案 A），精确版本、开发依赖，不做格式化。

| 检查 | 工具 | 配置 | 基线 |
| --- | --- | --- | --- |
| 规范（类型感知） | ESLint 10.13.0、`@eslint/js` 10.0.1（核心推荐规则）、typescript-eslint 8.72.1 | `eslint.config.js`；`tests/tsconfig.json` 给测试文件提供类型信息（开 `allowJs`：测试直接导入 `scripts/*.mjs` 的纯函数，类型取自它们的 JSDoc） | `eslint-suppressions.json`（ESLint 自带的批量压制，按文件与规则计数） |
| 死代码（未用文件、导出、依赖） | knip 6.43.0 | `knip.js`（宿主行入口按 `scripts/packages.mjs` 生成）、`tsconfig.knip.json`（引用两个包的 tsconfig，`packages/*/dist` 对回 `src/`） | `knip-baseline.json`（按类型、文件、名称，不含行号） |
| 重复 | jscpd 5.4.2 | `.jscpd.json` | `.jscpd-baseline.json`（jscpd 自带的克隆指纹） |
| 密钥 | gitleaks 8.30.1（独立二进制，§11） | 默认规则；误报才加 `.gitleaks.toml`（目前没有） | 无，任何发现都失败 |

- `npm run lint`（`scripts/check-lint.mjs`，已接入 `npm test`）：三项各自对照基线。基线之外的新发现使门禁失败；基线里已经不再出现的条目也使门禁失败，并提示运行 `npm run lint:update`。ESLint 这两种失败由它的批量压制自己给出（多出的违规退出码 1，未修剪的压制退出码 2）；knip 没有基线功能，由脚本比对清单；jscpd 的新克隆由它自己的基线判定，失效的指纹由脚本按数量判定。
- `npm run lint:update`：把基线缩到当前状态（ESLint `--prune-suppressions`、knip 重写清单、jscpd `--update-baseline`）。存在任何新发现时拒绝写入，所以基线只减不增。基线文件缺失时按当前状态新建；删掉基线再重建等于接受全部现有告警，需用户批准（`ORCHESTRATION.md` §7.6）。
- 修掉基线里的告警后，代码改动与 `npm run lint:update` 的基线变化同一批提交。
- 包边界〔2026-10-29，split 第 1 步；第 5 步补包名、包目录与行〕：`scripts/packages.mjs` 是「哪个 `src/` 目录属于哪个包、每个包插哪些行」的唯一出处（GLM 通道包 `dsh-glm-zcode`，`packages/glm`，`glm-llm`、`glm-prompt`、`toolsearch`；编排层包 `dsh-hourness`，`packages/hourness`，`data`、`guard`、`memory`、`workflow`、`report`、`graph`；公共库 `shared`）。`PACKAGES` 的顺序就是 profile 里两个包的顺序。`eslint.config.js` 按它生成 `no-restricted-imports`：一个包的源码不得导入另一个包的目录，`src/shared/` 不得导入任何包目录，类型导入同样禁止（tsc 会把越界的文件一起编进产物，不报错）。规则用 `regex`，`^(?:\.\./)+(?:src/)?(?:<另一个包的目录>)(?:/|$)`，与文件深度无关；代价是同名目录会误判，所以 `npm run preflight` 先做目录表自检：目录、包键、包名、包目录与行 id 不重复、每行的模块落在本包的源码目录里、`shared` 不归任何包、`src/` 下每个顶层目录都有归属、登记的目录都存在、包目录与 `src/shared/` 之下没有名为 `src` 或与另一个包顶层目录同名的目录（`tests/preflight.spec.ts`）。客户端源码〔split 第 6 步〕：表里每个包的 `client.sources` 列出 `ui/src/` 下属于它的文件与目录，`ui/src/` 下每个文件恰好属于一个客户端包；一半客户端源码不得导入另一个包的宿主目录，也不得导入另一半的文件或目录（第二个 `regex`：`^(?:\./|(?:\.\./)+)(?:<另一半的名字>)(?:/|\.[a-z.]+$|$)`，名字不带扩展名），表自检同样拒绝两半之间、一半与另一个包宿主目录之间的同名。上线时演示过一次：在未提交的改动里让 GLM 客户端入口导入 `./graph/tab.tsx` 与 `../../src/report/index.ts`、让面板的 `ui/src/graph/tab.tsx` 导入 `../channel.js` 与 `../../../src/glm-llm/zcode.ts` 的类型，四处都报 `no-restricted-imports`，还原后全绿。测试与脚本不受边界约束。上线时演示过一次：在未提交的改动里给 `src/glm-llm/auth/jwt.ts` 加一条到 `../../graph/` 的类型再导出、给 `src/graph/projection.ts` 加一条到 `../toolsearch/` 的类型再导出、给 `src/shared/route.ts` 加一条到 `../graph/` 的再导出，三处都报 `no-restricted-imports`，还原后全绿。
- 逐字门禁的导入规则（`DESIGN.md` §5.9）：镜像文件只在开头的导入块里写单行导入；值导入只许来自其他镜像文件，`import type` 只许来自 `src/shared/`；导入块之后不得再有导入语句。门禁只去掉导入块里的语句行，不放宽任何文本的检查。
- 范围：`src/`、`tests/`、`scripts/`、`ui/` 与根目录配置文件；不查 `packages/*/dist/`、`packages/*/ui/client.js`（构建产物）、`reference/`、`.llm/`、`.agents/`、`.worktrees/`、`.pnpm-store/`。`src/shared/schemastery.ts` 是 vendored 上游代码（文件头写明来源），不进 ESLint 与 jscpd，knip 照常检查对它的引用。配置上的取舍见 `ORCHESTRATION.md` §7.7。
- 基线（2026-10-28，删除历史调试脚本目录 `scripts/dev/`、升级 TypeScript 5.9.3 之后，项目图 `m1-followups`）：ESLint 303 条，分布在 36 个文件（`tests/` 246、`src/` 57）；按规则：`no-unnecessary-type-assertion` 174、`require-await` 76、`no-base-to-string` 15、`no-unsafe-member-access` 12、`unbound-method` 8、`no-unsafe-assignment` 7、`no-unsafe-argument` 4、`no-unsafe-return` 4，其余 3 条分属 2 条规则。knip 22 条：11 个未用导出、11 个未用导出类型（其中 3 个是编译期契约检查类型）。jscpd 3 处克隆，26 行。门禁上线时（提交 `33345dd`）是 ESLint 317 条、knip 35 条、jscpd 7 处 75 行，其中 ESLint 11 条、knip 9 条（9 个未用文件）、jscpd 4 处来自 `scripts/dev/`；TypeScript 5.9 的 Web Crypto 类型让测试里一处 `no-unsafe-argument` 不再出现。
- 门禁上线时演示过一次：临时加一条 `debugger`、一个未用导出、一段复制的函数，并删掉一处被压制的类型断言，三项检查都失败，`npm run lint:update` 拒绝写入、knip 与 jscpd 的基线文件不变；撤回后全绿。
- jscpd 5 是原生二进制，在本机写不进 `%TEMP%`（拒绝访问），门禁让它把 JSON 报告写到 `.llm/checks/`，读完即删。
- `npm run check:secrets`（`scripts/check-secrets.mjs`，`npm test` 里紧接检查器门禁）：gitleaks 扫 HEAD 可达的提交，再扫已跟踪文件的未提交改动（暂存区、工作区各一次）；未跟踪与被忽略的文件（`.llm/` 里的凭证等）不读。历史只到 HEAD，结果只取决于本检出，不受同仓库其他分支与工作树影响；gitleaks 读的是 `git log -p`，合并提交自身的改动不在其中。输出里的密钥一律遮盖。误报只在仓库根的 `.gitleaks.toml` 里按路径与正则精确放行；环境变量 `GITLEAKS_CONFIG`、`GITLEAKS_CONFIG_TOML` 不传给 gitleaks，行内 `gitleaks:allow` 注释不生效。找二进制的顺序：`GITLEAKS_PATH`、`%LOCALAPPDATA%\Programs\gitleaks\gitleaks.exe`、PATH；找不到就失败并提示安装方法（§11），不跳过。上线时（2026-10-28）HEAD 上 87 个非合并提交无发现，按 gitleaks 默认范围（全部引用）扫一次也无发现，所以没有 `.gitleaks.toml`。演示过一次：暂存的新文件与已跟踪文件的未暂存改动里各放一个随机生成的 GitHub token 形状字符串，两处都报出、门禁失败；`.llm/` 下的同样内容不报。

## 11. 依赖更新

`npm run deps:check`（`scripts/deps-check.mjs`）运行 `pnpm outdated` 与 `pnpm audit`，逐条写出处理方式，不改任何文件。没有待办时退出码 0，有待办时 1，pnpm 报不出结果时 2。它的输出是定期巡检（`ORCHESTRATION.md` §12）的一项输入。

处理规则：

1. 补丁与次版本升级：一次一个提交，过全部门禁（build、preflight、`npm test`；动到运行时会加载的依赖再加 `npm run probe`），提交信息写明升级前后的版本与变更要点。
2. 主版本升级：作为决策交给用户（决策分级第 4 类，`ORCHESTRATION.md` §2.9.1），不自行升级。
3. `@deepseek-ai/*`（`cordis` 与 `dsh-*`）钉在桌面版运行时所带的版本（`dsh-*` 为 `0.2.1-rc.3`，`cordis` 为 `4.0.5`，与 `reference/dsh-desktop-0.2.1-rc.3/` 一致），不跟注册表走，只在桌面版升级时一起动：按 §4 重新导出 `reference/dsh-desktop-<版本>/`，按 `DESIGN.md` §2.4a 接口对照表逐项复核，再跑 `npm run probe`。只经这些包进入本仓库的安全公告同样随桌面版处理。
4. 新增依赖一律精确版本（`pnpm add -D -E <包>@<版本>`），任何新增先问用户。
5. pnpm 的 store：本仓库的 `node_modules` 链接自仓库内的 `.pnpm-store/`（不入库），与本机全局 store 不同，所以 `pnpm add`、`pnpm update` 要在仓库根目录带 `--store-dir .pnpm-store`，否则报 `ERR_PNPM_UNEXPECTED_STORE`。`pnpm install --frozen-lockfile` 目前失败：根 `package.json` 的 `peerDependencies` 不在锁文件里（M1.9 之前即如此），尚未处理。
6. 升级检查器后重跑 `npm run lint`：新版规则带来的新告警按新代码处理，修掉；修不掉的交给用户决定，不扩大基线。
7. gitleaks（§10）不经 pnpm：本机装在 `%LOCALAPPDATA%\Programs\gitleaks\gitleaks.exe`，8.30.1（2026-10-28，项目图 `q-gitleaks`）。安装或升级：从 https://github.com/gitleaks/gitleaks/releases 下载最新版的 `gitleaks_<版本>_windows_x64.zip` 与 `gitleaks_<版本>_checksums.txt`，zip 的 SHA-256 与 checksums 文件里对应的一行一致才解压到该目录；装在别处时用 `GITLEAKS_PATH` 指向它。`npm run deps:check` 不报它的新版本，定期巡检时看 releases 页，升级按第 1、2 条处理，升级后重跑 `npm run check:secrets`。

2026-10-28 的结果：`typescript` 5.7.2 → 7.0.2 是主版本升级（typescript-eslint 8.72.1 只支持低于 6.1 的 TypeScript；5.x 线最新为 5.9.3），用户 2026-10-28 选先升到 5.9.3（项目图 `q-typescript`），已升，精确版本 `5.9.3`（`m1-followups`）。5.9 的 DOM 类型把 Web Crypto 的 `BufferSource` 限定为 ArrayBuffer 上的视图，签名模块的两个字节函数改为声明 `Uint8Array<ArrayBuffer>`，面板的修订号计算对远端字节先复制再求摘要。`pnpm audit` 报 1 条高危：zod 4.4.3（GHSA-mrhx-c7xc-m3w5，4.6.6 修复），只经 `@deepseek-ai/dsh-llm` 进入本仓库，那是只用于类型检查的开发依赖，随桌面版处理。

## 12. 项目图

设计见 `ORCHESTRATION.md` §2.6–§2.13，本项目的图在 `docs/graph/`（`nodes/` 是节点文件，`graph.svg` 是渲染结果）。引擎在 `src/graph/`，命令入口在 `scripts/graph/`，只用 Node 22 内置模块，经 `--experimental-strip-types` 直接从源码运行，不用先 build。`--dir` 默认是本仓库的 `docs/graph`。

| 命令 | 作用 |
| --- | --- |
| `npm run -s graph -- [--dir 图目录] show <id>` | 读一个节点的投影，JSON 输出 |
| `npm run -s graph -- [--dir 图目录] open` | 待办与决策队列，JSON 输出 |
| `npm run -s graph -- [--dir 图目录] <op> --file <请求文件>` | 以 `llm` 身份执行一次写操作（`ORCHESTRATION.md` §2.9），请求文件存为 UTF-8；退出码 0 成功、1 引擎拒绝、2 用法或输入错误 |
| `npm run graph:render -- [--dir 图目录] [--out 文件] [--root id] [--focus id] [--collapse id]…` | 出图，默认写 `<图目录>/graph.svg`；`--root`（子树）与 `--focus`（投影）只能给一个；图有校验错误照常出图，错误列在 stderr |
| `npm run graph:smoke` | 入口脚本的冒烟：在临时图上以独立进程跑命令行（批注、`open`、`show`）与出图，核对修订号、批注与图片；`npm test` 的最后一道 |

规则：

1. LLM（包括在 Kiro 里开发本仓库时）只经命令行写节点文件，不直接编辑（`ORCHESTRATION.md` §2.7）；在 DSH 里图行启用后，guard 规则 `graph-files-only` 拦直接写图目录。手改的文件下一次读就生效，但不留历史；改出校验错误时整张图拒绝写入，直到改回或用 git 还原。
2. 改了 `docs/graph/nodes/` 就运行 `npm run graph:render`，`graph.svg` 与节点文件同批提交。`npm test` 检查节点文件没有校验问题、`graph.svg` 与渲染器的输出逐字节相同，没重新出图会失败。
3. 读 JSON 输出用 `npm run -s`，否则 npm 先往 stdout 打两行命令回显。Windows PowerShell 5.1 下写请求一律用 `--file`：经管道送 stdin 时 `--` 被吞、中文变问号，参数里的 JSON 会丢引号（`ORCHESTRATION.md` §2.10）。
4. 试写不要用 `docs/graph`：复制到临时目录，命令加 `--dir`。
5. 引擎与命令行不碰 DSH，改它们只需过 `npm run build`、`npm run preflight`、`npm test`，不需要 `npm run probe`。接触 DSH 的是编排层包 `dsh-hourness` 里的图行（`src/graph/index.ts`、`tools.ts`、`reminder.ts`、`row-health.ts`，它提供给 guard 行的服务 `src/graph/service.ts`，以及它注册的门禁规则 `src/guard/graph-files.ts`，行 `glm-hourness/graph`，`ORCHESTRATION.md` §2.5、§2.7、§2.10）与面板行（`src/graph/panel-row.ts`、`live.ts`）：L2 在假宿主 `tests/fake-rc3.ts` 上，L3 是探针场景 `glm-graph`、`non-glm-graph`、`glm-graph-compact`、`glm-graph-goal`、`glm-graph-panel` 与派发场景里的现场检查，改了这些文件要跑 `npm run probe`。两行都默认启用（2026-10-28 经 L3、L4）。
