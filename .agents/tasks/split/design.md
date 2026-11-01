# split 设计：GLM 通道包与编排层包

版本：0.3（2026-10-29），设计第三稿：回应第二轮评审 `design-review.md` 的 R15–R27，逐条处理见 §13.2；第一轮 R01–R14 的处理见 §13.1
依据：main `0f9f284`。它的代码与 `a9f12e1` 相同：m1-parity 已在 `a9f12e1` 快进合入 main，其后的 `0f9f284` 只改项目图节点；本地分支 `m1-parity` 与工作树 `.worktrees/m1-parity` 已不在（§10）。桌面版运行时包 `reference/dsh-desktop-0.2.1-rc.3/`（契约来源优先级见 `docs/DEVELOPMENT.md` §4），bundle 路径拼接与行名锚定另与主干源码 `reference/deepseek-harness/packages/boot/app-boot/src/` 对过。项目图节点 `split`、`question-10`（选 A，转述「那就A吧」）、`bootstrap`、`orch`、`hourness`、`bottom`、`m6`、`m8-ui-audit`、`m1-11`、`m1-cleanup`。m8-ui-audit 的桌面走查清单 `.agents/tasks/ui-audit/findings.md`（不入库，2026-10-29 09:52 版，§10）。
范围：只有设计。本轮不改产品代码、`docs/graph/` 与任何 `~/.dsh` profile。桌面版与 glmsandbox 的 profile 本轮只读了键名、行 id、bundle 名与依赖的链接类型，没有读值；前两稿另读过本项目两条覆盖项的 `disabled` 布尔值（都是 `false`）。

证据写法：`app-boot:行` 指 `reference/dsh-desktop-0.2.1-rc.3/dsh-app-boot/lib/index.js`；`client-modules:行`、`loader:行`、`hmr:行`、`config-editor:行`、`plugin-manager:行` 分别指同目录下 `dsh-client-modules`、`cordis-plugin-loader`、`dsh-hmr`、`dsh-config-editor`、`dsh-plugin-manager` 的 `lib/index.js`。〔实读〕读过源码；〔实测〕在 `.agents/tasks/split/` 下用临时文件跑过，已删（F21 在第一稿，profile 的键名核对在本稿）；〔推断〕由源码推出、没有运行验证；未核实的假设集中在 §1.6。

## 0. 摘要

边界。GLM 通道包 `dsh-glm-zcode`（目录 `packages/glm/`）装宿主行 `glm-llm`、`glm-login`、`glm-prompt`、`glm-compact` 与 GLM 客户端半（通道 pill 与设置页），源码是 `src/glm-llm/`、`src/glm-prompt/`、`src/toolsearch/`，积分公式与高峰提醒也归它；m1-parity（已在 `a9f12e1` 合入）新增或改动的 `auth/project-token.ts`、`device-mid.ts`（按 question-9 选 A 写回 `~/.zcode` 的 deviceMid）、`token-budget.ts`、`zcode-wire.ts`、`headers.ts` 都在 `src/glm-llm/` 下，随目录归 GLM 包。编排层包 `dsh-hourness`（目录 `packages/hourness/`）装 `data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel` 与项目图面板客户端半，源码是 `src/data/`、`src/guard/`、`src/memory/`、`src/workflow/`、`src/report/`（由 `src/ui/` 改名）、`src/graph/`。公共库 `src/shared/` 在构建时编进两个包各自的产物，运行时不跨包导入。它放宿主结构类型、路由判定、数据目录、行健康、每步注入接缝、两包都用的两段 ZCode 原文（`<system-reminder>` 包装与 `DeferredToolCall` 名，放在受逐字门禁检查的镜像文件里），以及三份契约（工具名、计价服务、方言服务，方言契约里带一张 ZCode 别名到 DSH 原生工具的静态表）。两包之间没有导入，只经公共库的契约与 cordis 服务对话，缺了任一包另一包照常工作。哪个目录属于哪个包只写在一张表里（`scripts/packages.mjs`），ESLint、preflight、knip 与构建脚本都从它读。

布局。源码目录不搬家，包目录只放清单、patch、tsconfig 与构建产物。仓库根的 `dsh-glm-hourness` 改成伞包，`dsh.bundle.patch` 列出两个子包的 patch；`ui/` 的 `dsh-glm-hourness-ui` 改成不含行的占位包。行 id 全部不改，只新增 `glm-hourness/glm-ui`，默认禁用。

模型无关。项目图、投影、面板、现场、运行控制、记忆、派发记录与用量流水本来就不分路由。guard 的规则改为只认 DSH 原生工具名，调用名先问方言服务、再查公共库的静态别名表换算成原生名，拦截不依赖方言服务在不在；拦截范围在人定之前保持今天的样子（GLM 模型族）。方言没有接管的路由，即非 GLM 路由与没有 GLM 方言的 GLM 调用，guard 在上面怎么做由人定，推荐影子先行（§4.2）。积分面板读 GLM 包提供的计价服务，没有时按 token 列；高峰提醒留在 GLM 包；派发档位的词汇归编排层，档位到模型的映射由通道包提供（M7 实现）。

交付。在 `split` 分支（`.worktrees/split`）上分 9 步，每步一个提交、门禁全绿，碰运行时的步跑探针。探针改为在运行目录下生成 DSH home 与 profile，测伞包、只装 GLM 包、只装编排层包三种组合，不碰 `~/.dsh`。第 0–2 步现在就能做（m1-parity 已合入）；第 3–6 步与第 8 步改 m8-ui-audit 也在改的文件，排在它的界面改动合入之后；m8-ui-audit 的 V-01 若把行名改成包说明符，会与伞包布局冲突，第 5 步开工前要人定两者的先后（§14.7）；第 7、8 步还要等人定。合入时先关桌面版，再合入、build、启动，因为桌面版默认启用的 `dsh-hmr` 会在下一次 profile 写入时按磁盘上的新布局就地重组（F17）。之后做桌面版批次 L4，两次重启，第二次启用 `glm-hourness/glm-ui`。

已有 profile。桌面版 profile 一行都不用改：两项 bundle 仍解析到伞包与占位包；五条本项目覆盖项都没写 `name`，按 id 照常匹配（§3.4）。glmsandbox 同样不改。唯一的迁移风险来自设置表单：它给没有覆盖项的行新写覆盖项时会带上模块路径，拆包后对不上（F18）。今天没有这样的条目，合入前用只读脚本再查一次（§3.7）。m1-cleanup 计划从桌面 profile 去掉 8317 的 pi-ai `glm` 路由并删除备份文件，只动与本项目无关的条目，不影响上面的结论。

## 0.1 需要人定的事项（摘要；选项、后果与建议见 §14）

| # | 事项 | 建议 |
| --- | --- | --- |
| 1 | 两个项目目标的文字、验收与非目标；哪个目标沿用 id `hourness`；`bottom`、`q-old-folder`、`m6` 挂在哪 | 按 §6 草案拆成两个根目标，编排层沿用 `hourness` |
| 2 | guard 在方言没有接管的路由上怎么做 | G2 影子先行 |
| 3 | `split` 节点验收的改写（「各自装上」怎么验证，「行 id 改名有迁移」换成什么） | 按 §14.3 改写 |
| 4 | 包名 | `dsh-glm-zcode`、`dsh-hourness`，客户端包加 `-ui` |
| 5 | 桌面版 profile | 不改 |
| 6 | 条件性：合入前查到带 `name` 的本项目覆盖项；第 5 步 knip 出现新发现 | 出现时停下交人，平时不触发 |
| 7 | m8-ui-audit 的 V-01（设置页行标题，要把行名改成包说明符）与 split 第 5 步的先后（本稿新发现） | V-01 推迟到 split 合入之后，在新布局上设计 |

## 1. 设计依据：已核实的 DSH 与工具事实

### 1.1 Loader 组合与覆盖

| # | 事实 | 证据 | 对设计的约束 |
| --- | --- | --- | --- |
| F1 | 行 id 是 patch 里显式写的字符串，不由包名或 patch 文件推出。整棵树把 `dsh.profile.bundles` 中各 bundle 的 patch 依次拼成一个列表，再接 profile 的 `cordis.patch.yml`、DSH home 的 `cordis.patch.yml` 与 `--patch` 覆盖层，一次套用到空表上 | app-boot:1015–1051（loadProfileDirectory）、1127–1136（readProfilePatches）、61–110（applyEntryPatches） | 行搬到哪个包都可以，id 不变即可 |
| F2 | 非 insert 的覆盖项按 id 在整张表里找目标（含 group 子行）；没写 `name` 就不比对模块路径，写了且不同则跳过并告警；找不到目标只告警 | app-boot:65–71、91–103 | 桌面 profile 的本项目覆盖项都没写 `name`，行模块路径改了照样匹配 |
| F3 | 覆盖项按键整体赋值，不深合并 | app-boot:104–107 | 行的 config 形状不能变 |
| F4 | `dsh.bundle.patch` 可以是一个文件或文件列表，按 `join(packageDir, file)` 拼路径；`packageDir` 是 profile `node_modules` 下的 junction 路径，不取 realpath | app-boot:517–531、976–983、995–1003；主干 `profile.ts`:68–71、628 同 | `join` 与 `resolve` 是字面运算，路径里的 `..` 会在 junction 路径上退回 profile 的 `node_modules`。bundle 引用的 patch 文件与行文件必须在 bundle 目录之内（约束 C1） |
| F5 | insert 行中以 `./`、`../` 或绝对路径写的 `name`，以该 patch 文件所在目录为基准转成 file URL；覆盖项的 `name` 不转换，按字面比对 | app-boot:3971–3978；主干 `index.ts`:546–548 | 子包 patch 里写 `./dist/...`，被伞包引用时路径仍对 |
| F6 | 同一张表里重复的行 id：覆盖项落在最后一个；Loader 建条目时也只留最后一个（`Object.fromEntries`） | app-boot:67；loader:78–91 | 伞包与子包被同时列出时每行只装一次〔推断，没有运行，U9〕 |
| F7 | bundle 兼容性只看 `engines.dsh` 与 `@deepseek-ai/dsh*` peer | app-boot:279–332 | 新清单不声明这两类字段 |
| F8 | profile `node_modules` 下 junction 指向的目录是 linked root；其中模块的裸导入沿模块所在目录的全部祖先逐级先查该级 `package.json` 的 `peerDependencies`，列了就走安装版，否则在该级 `node_modules` 找本地候选 | app-boot:664–690、1337–1345、1676–1716（`routeLinked`） | 每个子包在自己的 `peerDependencies` 里列出运行时裸导入（今天只有 `@deepseek-ai/cosmokit`，来自 `src/shared/schemastery.ts`），即约束 C2。在本仓库里子包漏写时查找会继续到仓库根，根 `package.json` 的 peer 照样拦截到安装版；C2 保证子包脱离本仓库目录使用（复制或打包）时仍解析到安装版 |

### 1.2 客户端半

| # | 事实 | 证据 | 对设计的约束 |
| --- | --- | --- | --- |
| F9 | client-modules 对每个启用的行，按其模块位置找最近的祖先 package.json，声明了 `dsh.client`（platform web）的算该包的一个来源；禁用的行跳过 | client-modules:720–811、852–856 | 客户端包可以嵌在宿主包目录里，由宿主包的 patch 插行 |
| F10 | 同一客户端包有多个来源时抛 `resolves from multiple active Loader sources`；声明了 `dsh.client` 却缺 `./client` 导出或构建产物时抛错，注册表构造失败 | client-modules:890–900、736–738、555–563 | 每个客户端包恰好一行，由 preflight 静态检查 |
| F11 | 宿主包的 patch 可以给嵌在宿主包目录里的客户端包插行。行名是路径形式（`./`、`file:`、绝对路径）时，client-modules 经 Loader 的解析得到行模块的位置，向上找第一个有 `name` 的 `package.json`，以它为这一行所属的包（`locatePkgJson`、`nearestPackage`）；产物路径是该清单所在目录加它的 `./client` 导出，字节从文件读取，不按包名解析（`resolveMeta`）。今天 `ui/cordis.patch.yml` 的 `glm-hourness/ui` 行（`name: ./index.js`）就是这种形态。行名不能写成子路径说明符（例如 `dsh-hourness/ui`）：非路径、又不是精确包名的说明符直接返回空，这一行不算任何客户端包的来源 | client-modules:720–742、762–809（非路径说明符在 :766 返回） | 两个客户端包嵌在各自宿主包的 `ui/` 下，由宿主包的 patch 用 `./ui/index.js` 插行。第一稿把证据写成 `dsh-experimental-plugin-market-bundle` 用裸包名插行的先例，形态不同，已改 |
| F12 | client-modules 只在 `dsh-web-app` 的组合里，headless 模板没有 | `dsh-web-app/cordis.patch.yml`:228；`dsh-headless` 无此行 | L3 默认验不到客户端组合（补法见 §5.6） |
| F13 | 右侧栏页面类型的 `id` 在全部注册中唯一，第二次注册同一 `id` 抛错，用包名只是惯例；每个会话的布局（含标签身份）存在 localStorage 的 `dsh.sidebar-right.v1.<sessionId>` | `dsh-client-ui-sidebar-right/README.md`:74、83（本轮复核） | 面板的页面 id `dsh-glm-hourness-ui/graph` 与 kind `glm-hourness-graph`（`ui/src/graph/tab.tsx`:15–16）不改 |

### 1.3 其他

| # | 事实 | 证据 | 约束 |
| --- | --- | --- | --- |
| F14 | 系统提示词只渲染各节的 `text`，节名不进模型 | `dsh-system-prompt/lib/index.js`:117–118 | `glm:guard` 等节名对任何路由都不可见，不改名 |
| F15 | 目标节点不能有父节点；`parent` 不在 LLM 可改的字段里，改挂与改目标要人在面板里做，或 LLM 带人的原话转述 | `src/graph/format.ts`:345；`src/graph/engine.ts`:438 | 「两个目标」只能是两个根目标（§6） |
| F16 | `~/.dsh/cordis.patch.yml`（DSH home 层）不存在 | 只读核对 | 覆盖项只来自 profile 层 |
| F22 | 设置页「内置插件」与插件管理器按行名读显示信息（`metaOf`）。`readPluginMeta` 只处理包说明符，路径形式的行名（F5 锚定后的 file URL）直接返回空，标题退回为完整的模块 URL。包说明符形式的行名不经 F5 转换，由根 Include 经 `bareModuleBaseUrl` 与 profile 的包映射解析，profile 只映射它 `dependencies` 里的包 | app-boot:2216–2218（`readPluginMeta`）、1276–1277（`barePackageName` 对以 `.` 开头或含 `:` 的说明符返回空）、3971–3978、4126–4134（`mountRootInclude`）；`dsh-host-plugin-inventory/lib/index.js`:127、147；映射只含 profile 依赖一条为〔推断〕（F8 的 `findInterceptionLayer` 先判 profile 树） | 本项目各行今天在设置页显示为 file URL（m8-ui-audit V-01）。拆包不改变这一点，只是 URL 变为 `packages/<包>/dist/...`。把行名改成包说明符会与伞包布局冲突（§14.7） |
| F23 | dsh-base 默认组合里的 `plugin-package-inventory-deepseek` 在 DeepSeek 官方请求里附上活动插件包的名字与版本（请求字段 `dsh_plugin_packages`）。路径形式的行，按模块位置向上最近的 `package.json` 取身份 | `dsh-base/cordis.patch.yml`:85–86；`dsh-plugin-package-inventory-deepseek/lib/index.js`:52（`nearestManifest`）、90、146 | 拆包后 DeepSeek 会话的请求列出 `dsh-glm-zcode`、`dsh-hourness`、`dsh-hourness-ui`（启用 `glm-hourness/glm-ui` 后加 `dsh-glm-zcode-ui`）与版本 0.3.0，不再列 `dsh-glm-hourness`、`dsh-glm-hourness-ui` 0.2.0：包名是发给 DeepSeek 的数据（§14.4） |

### 1.4 profile 的重载与写入

| # | 事实 | 证据 | 约束 |
| --- | --- | --- | --- |
| F17 | 有 `profileContext` 的运行（桌面版、headless profile 运行）默认启用 `dsh-hmr`。它监视 profile 的 `cordis.patch.yml`、DSH home 的 `cordis.patch.yml` 与 profile `package.json` 的 `dsh.profile.bundles`；任一变化就执行 `reconcileProfile`：从磁盘重读全部 bundle 的 patch，比对已加载模块与磁盘，再调用 `recomposeProfile`，除非判定 `package-moved` 要重启，新的行表就地套用 | `dsh-base/cordis.patch.yml`:27–32；hmr:849–873、1330、1359；app-boot:3782、3797、3844、3853 | 主检出合入并 build 之后，运行中的桌面版在下一次 profile 写入（模型菜单、设置表单、插件管理器）时就按新布局重组。改变 bundle 布局的合入在桌面版关闭时进行（§7.1 合入顺序） |
| F18 | 设置表单改某行配置时先按当前文件重组一次，再写 profile patch：已有不带 `name` 的覆盖项就地改 `config`，仍不带 `name`；没有覆盖项时追加 `{id, name: entry.options.name, config}`，而 bundle 插入的行的 `name` 是 F5 锚定后的 file URL，即模块路径。插件管理器的启用开关只写 `{id, disabled}`，不带 `name` | config-editor:74–75、98、105–110、125；plugin-manager:1023–1078 | 拆包改变所有本项目行的模块路径（`dist/...` → `packages/<包>/dist/...`），带 `name` 的本项目覆盖项会按 F2 跳过并告警。桌面 profile 今天没有这样的条目（§3.4），合入前复查（§3.7） |

### 1.5 构建与检查器

| # | 事实 | 证据 | 约束 |
| --- | --- | --- | --- |
| F19 | ESLint 10.13 的核心规则 `no-restricted-imports` 的 `patterns` 条目可以写 `regex`（对字面的导入来源做 `RegExp.test`，`caseSensitive` 决定 `u` 或 `iu`），也可以写 `group`（`ignore` 库，`allowRelativePaths: true`）；`allowTypeImports` 默认关，类型导入同样受限 | `node_modules/eslint/lib/rules/no-restricted-imports.js`:121、163、319–347、800–801 | 边界规则用 `regex`，相对路径的匹配不依赖 gitignore 语义（第一轮的 U6 由此核实） |
| F20 | knip 6.43.0 读工作区的 `tsconfig.json`，或 `--tsConfig <文件>` 指定的文件；该文件的 `references` 指向的每个 tsconfig 若同时有 `outDir` 与 `rootDir`，就加一组「产物目录 → 源码目录」映射。解析用 get-tsconfig，不经 tsc。配置文件可以是 `knip.js` | `node_modules/knip/dist/graph/build.js`:81–82、117；`util/load-tsconfig.js`（`walkReferences`）；`util/create-options.js`:172；`util/cli-arguments.js`:14；`constants.js`:3–12 | 脚本从 `packages/*/dist/` 的导入要靠这组映射对回 `src/`（§7.4） |
| F21 | TypeScript 5.9.3 的 `tsc -p` 在 tsconfig 的 `references` 指向非 composite 项目时报 TS6306（同时报 TS6305），退出码 2 | 〔实测〕临时配置 | 两组映射不能放进根 `tsconfig.json`，只能放在只给 knip 读的 `tsconfig.knip.json` 里 |

### 1.6 未核实的假设

| # | 假设 | 在哪一步核实 | 不成立时 |
| --- | --- | --- | --- |
| U1 | 桌面版 `bin.js` 在 Electron node 模式下按 `$DSH_HOME` 找 `profiles/<名字>`（源码支持：`dsh/lib/profile-boot-C14i-8IN.js`:218、241 调 `loadProfile` 与 `createRuntimeResolution`，home 默认取 `resolveDshHome()`，`dsh-home-paths/lib/index.js`:109 读 `DSH_HOME`） | 第 0 步：运行后生成 profile 的 `cordis.yml` 已被启动器重写，`~/.dsh/profiles/` 下没有出现 `probe-full`、`probe-glm`、`probe-hourness` | 退回 `docs/DEVELOPMENT.md` §3 的临时 profile 做法：探针以退路模式运行（`DSH_PROBE_PROFILES=home`），在 `~/.dsh/profiles/` 下按次建 `glmh-split-<运行时间戳>-full`、`-glm`、`-hourness`，结束时删除；守卫在这种模式下只放行本次登记的名字（§7.3）；桌面与 glmsandbox 不动 |
| U2 | 手工生成的 profile 目录（`package.json`、内容为 `[]` 的 `cordis.yml` 与 `cordis.patch.yml`、`node_modules` 下的 junction，没有 pnpm 元数据）与 `link:` 安装加载方式相同（源码支持：app-boot:637–690、850–853、946–957） | 第 0 步 | 同上 |
| U3 | 用覆盖行在 headless 里挂 `@deepseek-ai/dsh-client-modules`（`static inject = ["loader"]`，client-modules:514），构造时会扫描组合并在组合出错时抛错，不需要 web 载体（源码支持：client-modules:562、570） | 第 6 步 | 客户端组合只靠 preflight 与 L4 |
| U4 | 插件管理器正常显示伞包（行解析到嵌套包）与不含行的占位包，没有告警。管理器读 bundle patch 处都用 `bundlePatchPaths`，列表形式的 patch 能读（plugin-manager:313、339、493、2077、2174、2310） | L4 第一轮 | 只是显示问题；必要时按 §3.6 改 profile（人批） |
| U5 | 用 `dsh plugin --profile <临时名> add packages/<包> -w`（`docs/DEVELOPMENT.md` §3 规则 1 的做法）把一个子包单独装进临时 profile 可用 | 不在本计划内，除非人在 §14.3 选 B | 验收以生成的 profile 为准 |
| U6 | 已由 F19 核实，不再是假设 | 不适用 | 不适用 |
| U7 | knip 改用 `knip.js` 的显式入口，并经 `tsconfig.knip.json` 取得两组源码映射后，`scripts/` 从 `packages/*/dist/` 的导入照今天一样对回 `src/`，基线不变 | 第 5 步 | 出现新发现就停下交人（§14.6），不扩大基线，不改键凑数 |
| U8 | 面板页面 id 与 kind 不变时，换了客户端包后已打开的面板标签照常恢复 | L4 第一轮 | 人重新打开一次面板 |
| U9 | F6 的重复行合并在运行时成立 | 第 5 步可选场景 | 文档写明伞包与子包不要同时列出，探针不再测这种组合 |

## 2. 边界

### 2.1 行与包

| 行 id | 包 | 源码入口 | 产物（相对包目录） | 默认 |
| --- | --- | --- | --- | --- |
| `glm-hourness/glm-llm` | `dsh-glm-zcode` | `src/glm-llm/index.ts` | `dist/glm-llm/index.js` | 禁用（同今天） |
| `glm-hourness/glm-login` | `dsh-glm-zcode` | `src/glm-llm/login-row.ts` | `dist/glm-llm/login-row.js` | 启用 |
| `glm-hourness/glm-prompt` | `dsh-glm-zcode` | `src/glm-prompt/index.ts` | `dist/glm-prompt/index.js` | 启用 |
| `glm-hourness/glm-compact` | `dsh-glm-zcode` | `src/glm-prompt/compact-row.ts` | `dist/glm-prompt/compact-row.js` | 启用 |
| `glm-hourness/glm-ui`（新） | `dsh-glm-zcode`（客户端包 `dsh-glm-zcode-ui`） | `ui/src/glm-client.js`（含 `ui/src/channel.js`） | `ui/index.js`、`ui/client.js` | 禁用，L4 第二轮启用 |
| `glm-hourness/data` | `dsh-hourness` | `src/data/index.ts` | `dist/data/index.js` | 启用 |
| `glm-hourness/guard` | `dsh-hourness` | `src/guard/index.ts` | `dist/guard/index.js` | 启用 |
| `glm-hourness/memory` | `dsh-hourness` | `src/memory/index.ts` | `dist/memory/index.js` | 启用 |
| `glm-hourness/workflow` | `dsh-hourness` | `src/workflow/index.ts` | `dist/workflow/index.js` | 启用 |
| `glm-hourness/hourness` | `dsh-hourness` | `src/report/index.ts` | `dist/report/index.js` | 启用 |
| `glm-hourness/graph` | `dsh-hourness` | `src/graph/index.ts` | `dist/graph/index.js` | 启用 |
| `glm-hourness/graph-panel` | `dsh-hourness` | `src/graph/panel-row.ts` | `dist/graph/panel-row.js` | 启用 |
| `glm-hourness/ui` | `dsh-hourness`（客户端包 `dsh-hourness-ui`） | `ui/src/hourness-client.tsx`（含 `ui/src/graph/**`、`ui/src/dsh.ts`） | `ui/index.js`、`ui/client.js` | 启用（沿用今天的 UI 行 id） |

两半客户端里必须有一半是新行，新行按 `AGENTS.md` 第 4 条默认禁用、验证后启用。面板是人每天用的界面，沿用已启用的 `glm-hourness/ui` 就没有面板缺席的窗口；GLM pill 与设置页只在 L4 两轮重启之间缺席。profile 对 `glm-hourness/ui` 没有覆盖项，这个 id 换了指向不影响 profile。

### 2.2 源码目录

源码不搬家。理由：`docs/DESIGN.md`、`docs/ORCHESTRATION.md` 里有数百处 `src/...` 路径；ESLint 与 knip 的基线按文件路径记；m8-ui-audit 等并行任务都在原路径上改。

| 目录 | 归属 |
| --- | --- |
| `src/glm-llm/`、`src/glm-prompt/`、`src/toolsearch/` | GLM 包 |
| `src/data/`、`src/guard/`、`src/memory/`、`src/workflow/`、`src/report/`（第 5 步之前是 `src/ui/`）、`src/graph/` | 编排层包 |
| `src/shared/` | 公共库，编进导入它的每个包 |
| `ui/src/channel.js`、`ui/src/glm-client.js` | GLM 客户端包 |
| `ui/src/graph/**`、`ui/src/dsh.ts`、`ui/src/primitives.d.ts`、`ui/src/hourness-client.tsx` | 编排层客户端包 |

这张表只在 `scripts/packages.mjs` 里写一次（§2.7）；客户端两行从第 6 步起才进表，在那之前 `ui/src/` 仍是今天的单个客户端包，`ui/src/client.tsx` 同时导入两半。唯一的目录改名是 `src/ui/` → `src/report/`（`/hourness` 报告行，第 5 步，表里的目录名同一提交改）：拆包后编排层包目录里同时有客户端包 `ui/` 与产物 `dist/ui/`，两个 `index.js` 容易改错。`src/ui/` 下的文件在 `eslint-suppressions.json` 与 `knip-baseline.json` 里都没有条目，第 1、3 步要搬的 `step-notice.ts`、`zcode-text.ts` 里的符号、`graph-service.ts`、`credits.ts`、`json.ts` 也没有〔实读，main `0f9f284`〕，搬动与改名不动基线。

### 2.3 公共库 `src/shared/`

| 文件 | 内容 | 本次变化 |
| --- | --- | --- |
| `dsh-min.ts` | 宿主钩子、服务、载荷的结构类型，`createUserNotice` | 无（m1-parity 给 `SessionLike.header` 加了 `parentSession`、`origin`，派发与 bootstrap 以后也用） |
| `lm-min.ts` | LLM 消息与流词汇、附件成员 | 无（m1-parity 加了 `RequestMessageLike.id`） |
| `route.ts` | `assemblyRoute`、`sessionRoute`、`isGlmModel` | 无。`isGlmModel` 的使用方是 GLM 包（方言、提醒、方言服务的 `claims`）与 guard 的两处范围判定；后者在第 7 步按人定的方案保留或删除（§4.2）。`docs/DESIGN.md` §3 定案 3 要求判定函数只有一处、在 `src/shared/`，所以留在这里 |
| `data-home.ts` | DSH home 解析、用户级目录 `glm-hourness`、`credentialHome`、`glmHournessData` 契约与 `dataHomes` | 无。用户级目录名不改，两包共用。m1-parity 的 `device-mid.ts` 读写 `~/.zcode`（question-9 选 A）是 GLM 包自己的事，不进公共库 |
| `health.ts` | 行健康服务与渲染 | 行表按包分组，表格加「包」一列（§2.5） |
| `step-notice.ts` | 每步 notice 接缝 `installStepNotice`、历史读取 `toolCallArguments`、`toolCallOutcomes` | 从 `src/glm-prompt/step-notice.ts` 迁入；参数 `row` 改为必填（今天默认 `'glm-prompt'`，`src/graph/reminder.ts`:223 已显式传 `'graph'`），理由是公共库不带某个包的默认行名 |
| `zcode-notice.ts`（新，镜像文件） | `DEFERRED_TOOL_CALL_NAME`、嵌套标签正则 `NESTED_SYSTEM_REMINDER_TAG`（不导出）、`wrapSystemReminder` | 代码与今天 `src/toolsearch/zcode-text.ts`:19、160–167 相同，加进 `scripts/check-verbatim.mjs` 的 `MIRROR_FILES`；两包都用（§2.4 X2、X3） |
| `json.ts` | `JsonValue`、`JsonRecord` | 从 `src/glm-prompt/json.ts` 迁入 |
| `tool-names.ts`（新） | `GRAPH_TOOL_NAMES`（13 个）、`MEMORY_TOOL_NAMES`（3 个）、`ORCHESTRATION_RESIDENT_TOOLS` | 契约（§2.6） |
| `pricing.ts`（新） | 计价服务名、接口与读取函数 | 契约（§4.3） |
| `dialect.ts`（新） | 方言服务名、接口与读取函数；ZCode 别名到 DSH 原生工具的静态表 `ZCODE_ALIAS_NATIVES`；换算函数 `toNativeTool` | 契约（§4.7）。静态表与 `DEFERRED_TOOL_CALL_NAME` 同类，是两包都用的 ZCode 事实：GLM 包的别名定义（`aliasSpecs` 等）由契约测试钉成与它一致，编排层包按它识别别名，拦截因此不依赖方言服务（§4.2.2） |
| `schemastery.ts` | vendored Schemastery | 无；只编进 GLM 包，模块级状态的例外见下 |

```ts
// src/shared/zcode-notice.ts：镜像文件（MIRROR_FILES），只放两包都用的 ZCode 原文
export const DEFERRED_TOOL_CALL_NAME = 'DeferredToolCall'
const NESTED_SYSTEM_REMINDER_TAG = new RegExp('<\\/?system-reminder\\b', 'gi')
/** 先中和嵌套标签再包装（bundle `kP`）；函数体与今天 zcode-text.ts:163–167 相同 */
export function wrapSystemReminder(body: string): string
```

迁出：`credits.ts` → `src/glm-llm/credits.ts`（GLM 积分公式与高峰时段）；`graph-service.ts` → `src/graph/service.ts`（图行与 guard 行之间的契约，两行都在编排层包）。

公共库的两条规则：不导入任何包目录；不持有跨行共享的模块级状态，跨包共享的状态只走 cordis 服务。两个包各有一份公共库的编译产物，模块实例各是一份。`health.ts`、`route.ts`、`data-home.ts`、`step-notice.ts`、`json.ts`、`dsh-min.ts`、`lm-min.ts` 与新文件只有常量、类型与纯函数，行健康的状态在各行 `provideRowHealth` 的闭包里〔实读〕。例外是 vendored `schemastery.ts`：模块级的 `resolvers` 表（:487），以及写 `globalThis.__schemastery_index__`、`globalThis.__schemastery_refs__`（:208–215、281、314–322）。这是上游原样代码，跨副本靠 `Symbol.for('schemastery')`（:6–7）识别、靠共享的 `globalThis` 计数分配 `uid`，上游包被装两份时也是这样。它今天只被 `src/glm-llm/index.ts` 与 `src/glm-prompt/index.ts` 导入，只编进 GLM 包。编排层的行以后用它声明 `Config` 时会出现两份副本：`uid` 由共享计数分配不会冲突，`Schema.extend` 注册进 `resolvers` 的扩展不共享。届时在 `docs/DESIGN.md` 记下这两点的核对结果，并给编排层包加 `@deepseek-ai/cosmokit` peer（C2）。

### 2.4 跨包耦合清单与处置

在 main `0f9f284` 上（m1-parity 已合入），编排层目录导入 GLM 目录的只有 X1–X4 四类七处，GLM 目录没有导入编排层目录〔实读〕。

| # | 现状（main `0f9f284`） | 处置 | 步 |
| --- | --- | --- | --- |
| X1 | `src/graph/reminder.ts`:22 导入 `../glm-prompt/step-notice.ts` | 迁入公共库 | 1 |
| X2 | `src/graph/reminder.ts`:24、`src/glm-prompt/peak-reminder.ts`:21、`src/glm-prompt/todo-reminder.ts`:28、`src/toolsearch/index.ts` 从 `../toolsearch/zcode-text.ts` 取 `wrapSystemReminder` | 定义迁到 `src/shared/zcode-notice.ts`，各处从这里导入；`zcode-text.ts` 自己的两个提醒函数也从这里导入（逐字门禁的导入规则，§7.4） | 1 |
| X3 | `src/graph/live.ts`:20 从 `zcode-text.ts` 取 `DEFERRED_TOOL_CALL_NAME` | 同上，定义迁到 `zcode-notice.ts`；`exposure.ts`、`toolsearch/index.ts`、`todo-reminder.ts` 改从这里导入 | 1 |
| X4 | `src/guard/index.ts`:42、`rules.ts`:8、`shadow.ts`:28、`graph-files.ts`:16 从 `../glm-prompt/json.ts` 取类型 | 迁入公共库 | 1 |
| X5 | `src/ui/panel.ts`:15 导入 `../shared/credits.ts`（GLM 积分公式） | 计价服务（§4.3） | 3 |
| X6 | `src/toolsearch/exposure.ts`:46–49 把记忆与图工具名写死为常驻 | 从 `tool-names.ts` 取（§2.6） | 2 |
| X7 | guard 的工具表写死 ZCode 别名：`rules.ts`:61（Write、Edit）与 91（Bash），`shadow.ts`:74–80，`graph-files.ts`:34 | 规则只认 DSH 原生工具名；调用名经 `toNativeTool` 换算，先问方言服务，再查公共库的静态别名表（§4.2.2、§4.7） | 2 |
| X8 | guard 用 `isGlmModel` 决定拦截范围（`src/guard/index.ts`:163、201） | 第 2 步不动；第 7 步按人定的方案保留（G1）或改为方言服务的 `claims`、或去掉（G2–G4） | 7 |
| X9 | 行健康表只能经 `/glm-status`（GLM 包的 `glm-login` 行）查看 | 编排层包加 `/hourness-status`（§2.5） | 4 |
| X10 | GLM 方言的 `glm:memory` 节（`src/glm-prompt/index.ts`:88，`localize.ts` `MEMORY_SECTION_DSH`）教模型用 memory 工具 | 只在本次组装 `next()` 返回的工具里有全部记忆工具时出现（§4.8） | 2 |
| X11 | `src/shared/health.ts`:20 `HEALTH_ROWS` 混列两包的行 | 分组（§2.5） | 4 |
| X12 | 用量面板认 provider `glm-zcode` 的修正前记录（`src/ui/panel.ts`:19 `NATIVE_PROVIDER`） | 不动。这是编排层自己的用量流水里一类已知坏记录的清洗规则，按记录里的 provider id 识别，不依赖 GLM 代码；没有 GLM 包时这些记录照样要剔除 | 无 |

拆完以后两包之间只剩四种约定：公共库里的契约类型与常量；cordis 服务名（`glmHournessData`、`glmHournessHealth/<行>`、`glmHournessGraph`、新增的 `glmHournessPricing` 与 `glmHournessDialect`）；持久化的标识（notice 来源、会话事件字段、用户级目录名）；patch 里的行 id。

### 2.5 行健康与状态命令

`src/shared/health.ts`：

- `GLM_ROWS` = `glm-llm`、`glm-login`、`glm-prompt`、`glm-compact`；`HOURNESS_ROWS` = `data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel`；`HEALTH_PACKAGES` 把两组与包名配对；`HEALTH_ROWS` 是两组相接，顺序同今天。`HEALTH_PACKAGES` 是运行时的一份拷贝，preflight 核对它与 `scripts/packages.mjs` 一致（§7.4）。
- `collectHealth` 不变。`renderHealthTable` 输出一张表，列为「包 | 行 | 状态 | 说明」；某个包的行全部「未加载」时，这个包只占一行，说明写「包未安装，或它的行全部禁用」。
- `/glm-status` 的第一行仍是凭证状态，空一行后是全表。设置页与 pill 的 `parseStatus`（`ui/src/channel.js`:123–128）在整段文字里匹配：先找「已登录（套餐 …）」，找不到再找「未登录」。所以全表里不得出现「已登录（套餐」，否则未登录会显示成已登录。今天表里唯一含「未登录」的说明是 `glm-llm` 行在凭证为空时报的「未登录：凭证为空，运行 /glm-login」（`src/glm-llm/zcode.ts`:377），它只会和未登录的凭证行同时出现，不改变解析结果。`tests/health.spec.ts` 钉住：渲染出的全表（含「包」列与包级合并行）不含「已登录（套餐」；本次新增的文字（「包」列的值、合并行的说明）不含「未登录」。
- m8-ui-audit 的 F-04 计划让 pill 把凭证行之后的部分按 Markdown 渲染或按表格行解析（`.agents/tasks/ui-audit/findings.md` F-04）。第 4 步排在它之后（§7.0），开工时按 main 上的 `ui/src/channel.js` 核对它怎样读这张表，加「包」列后照常显示；探针按新格式解析（§7.3）。
- 新命令 `/hourness-status`，由 `glm-hourness/hourness` 行注册（`definitionId` 为 `dsh-glm-hourness/hourness-status`），输出同一张全表，没有凭证行。输入去掉首尾空白后必须为空，否则返回 `error`。描述与用法错误的语言和写法跟第 4 步开工时 main 上同一行的 `/hourness` 一致：今天是英文（描述 `Morning report and usage panel from the audit journal`、用法 `Usage: /hourness (no arguments)`，`src/ui/index.ts`:62、65），对应写成 `Row health of both packages` 与 `Usage: /hourness-status (no arguments)`；m8-ui-audit 的 F-20 计划把 `/hourness` 的描述与用法改成中文，那时 `/hourness-status` 同样用中文。`hourness` 行的激活说明改为「/hourness、/hourness-status 已注册」。

理由：只装编排层包时要有地方看行健康；两条命令给同一张表，人不用记哪条命令管哪几行。

### 2.6 GLM 方言怎样服务编排层的工具，而不导入编排层

```ts
// src/shared/tool-names.ts
/** 图行注册的工具名（src/graph/tools.ts graphTools），13 个 */
export const GRAPH_TOOL_NAMES: readonly string[]
/** memory 行注册的工具名（src/memory/tools.ts memoryTools）：memory_store、memory_query、memory_forget */
export const MEMORY_TOOL_NAMES: readonly string[]
/** 在 GLM 工具检索里常驻的编排层工具；显式列出，新工具默认不在这里 */
export const ORCHESTRATION_RESIDENT_TOOLS: ReadonlySet<string>
```

- 常驻名单：`exposure.ts` 的 `RESIDENT_TOOLS` 由三段组成：ZCode 常驻名单、有 ZCode 对应物的 DSH 工具、`ORCHESTRATION_RESIDENT_TOOLS`。今天 `ORCHESTRATION_RESIDENT_TOOLS` 等于 `GRAPH_TOOL_NAMES` 与 `MEMORY_TOOL_NAMES` 之并（ORCHESTRATION.md §2.8、§8 的项目决定），但单独列出：编排层以后加的工具默认按 DSH 独有工具的规则延迟加载，要常驻须在契约里显式加名字。编排层包缺席时这些名字不在工具面里，对检索没有影响。
- 契约测试（`tests/contracts.spec.ts`）：`graphTools()` 注册的名字集合等于 `GRAPH_TOOL_NAMES`，`memoryTools()` 的等于 `MEMORY_TOOL_NAMES`，加了工具忘记登记就失败；`ORCHESTRATION_RESIDENT_TOOLS` 是两者之并的子集，常驻名单里不能留着已删的工具；GLM 一侧沿用 `tests/graph-tools.spec.ts` 的常驻用例，改为从契约读名字。
- `DeferredToolCall`：现场视图（`src/graph/live.ts`:100）按 `zcode-notice.ts` 里的名字认出方言的包装调用，显示被代跑的工具名。guard 与 workflow 不需要它：`DeferredToolCall` 经 `ctx.tools.execute` 不带 parent 执行目标，`tools/pre-execute` 看到的是目标本身（`src/toolsearch/index.ts`:168–169，`docs/DESIGN.md` §5.7）。
- 规则认工具名：调用名经 `toNativeTool` 换成原生名，先问方言服务，再查公共库的静态别名表 `ZCODE_ALIAS_NATIVES`，所以服务缺席时拦截不变；纠偏与声明里的用名取方言服务的 `faceName`（§4.2.2、§4.7）。静态表让编排层代码里不再写 ZCode 工具名，但编排层包仍随公共库带着这份 ZCode 事实，与 `DEFERRED_TOOL_CALL_NAME` 相同。
- `glm:memory` 节读 `MEMORY_TOOL_NAMES`（§4.8）。

不选的做法：GLM 包在运行时问编排层的服务「这是不是图工具」（`glmHournessGraph` 已有 `isGraphTool`）。记忆工具没有服务，要再造一个；名字是静态事实，放进契约更简单，也能被测试钉住。

### 2.7 边界的强制

| 检查 | 所在层 | 内容 | 为什么在这一层 |
| --- | --- | --- | --- |
| 目录表 `scripts/packages.mjs` | 唯一事实源 | 两包的包名、包目录、`src/` 下的源码目录、行（id 与源码模块）、客户端包（包名、行 id、入口、源码文件）；公共库目录名 | 下面各项检查都从它生成或与它比对；bootstrap 加目录只改这张表与它要求的文件（§9 B3） |
| ESLint `no-restricted-imports` | 源码，`npm run lint`（在 `npm test` 里） | 按表为每个包目录生成一组 `files` 配置，`patterns` 用 `regex`（F19），生成规则见下：GLM 目录不得导入编排层目录，反之亦然；`src/shared/` 不得导入任何包目录；第 6 步起，GLM 客户端源码不得导入编排层客户端源码与编排层目录，编排层客户端源码不得导入 GLM 客户端源码与 GLM 目录；类型导入同样禁止 | tsc 会把跨包导入的文件编进产物（`import type` 也会，程序里的每个源文件都输出），不报错；在源码处拦，信息最直接。用核心规则，不加依赖 |
| preflight 表自检 | `npm run preflight` 第 1 项（§7.4） | 见下面的表自检清单 | 规则从表生成，表漏登记或目录同名时规则会漏判或误判，只能在表这一层拦 |
| preflight 产物与配置核对 | 产物，`npm run preflight` | 各包 `dist` 顶层目录只许是表里该包的源码目录加 `shared`；包 tsconfig 的 `include` 与表一致；`HEALTH_PACKAGES`（产物里的 `dist/shared/health.js`）与表一致；行 id 与行模块与表一致 | 兜住规则漏掉的写法与表外的漂移 |
| 逐字门禁的导入规则 | `npm run check:verbatim` | 镜像文件的导入只在文件开头的导入块里、写成单行；值导入只许来自其他镜像文件，`import type` 只许来自 `src/shared/`；导入块之后不得再有导入语句（§7.4） | 导入不能把没检查过的文本带进镜像文件，去掉导入时也不能误删原文 |
| 契约测试 | L2 | §2.6 的名字集合；§4.3、§4.7 的服务提供方与使用方；静态别名表与 `aliasSpecs`、`nativeOf`、`faceName` 一致（§4.7） | 名字是字符串，导入规则看不见 |

```js
// scripts/packages.mjs：哪个目录属于哪个包的唯一事实源（最终形态）
export const SHARED_DIR = 'shared'
export const PACKAGES = [
  {
    key: 'glm', name: 'dsh-glm-zcode', dir: 'packages/glm',
    src: ['glm-llm', 'glm-prompt', 'toolsearch'],
    rows: [ /* { id: 'glm-hourness/glm-llm', module: 'glm-llm/index' } 等 4 行；产物为 ./dist/<module>.js */ ],
    client: { name: 'dsh-glm-zcode-ui', row: 'glm-hourness/glm-ui', entry: 'ui/src/glm-client.js', sources: ['ui/src/channel.js', 'ui/src/glm-client.js'] },
  },
  {
    key: 'hourness', name: 'dsh-hourness', dir: 'packages/hourness',
    src: ['data', 'guard', 'memory', 'workflow', 'report', 'graph'],
    rows: [ /* 7 行，其中 { id: 'glm-hourness/hourness', module: 'report/index' } */ ],
    client: { name: 'dsh-hourness-ui', row: 'glm-hourness/ui', entry: 'ui/src/hourness-client.tsx', sources: ['ui/src/hourness-client.tsx', 'ui/src/dsh.ts', 'ui/src/primitives.d.ts', 'ui/src/graph/'] },
  },
]
```

按步填写：

| 步 | 表里有什么 |
| --- | --- |
| 1 | `SHARED_DIR` 与两包的 `key`、`src`；编排层的 `src` 写 `ui`（今天的 `src/ui/`），不是 `report` |
| 5 | 补 `name`、`dir`、`rows`；`src/ui/` 改名 `src/report/`，表里的 `ui` 同一提交改为 `report` |
| 6 | 补 `client` |

生成规则（`eslint.config.js` 读表生成，与文件深度无关）。记 `D(p)` 为包 p 的 `src` 目录名，`alt(...)` 为转义后用 `|` 连接；`C(p)` 为包 p 客户端源码相对 `ui/src/` 的名字（文件去掉扩展名，目录写成 `graph`）：

| 文件 | 禁止的导入来源（`regex`） |
| --- | --- |
| `src/<d>/**`，d ∈ D(p) | `^(?:\.\./)+(?:src/)?(?:alt(D(q)))(?:/\|$)`，q 为另一个包 |
| `src/shared/**` | `^(?:\.\./)+(?:src/)?(?:alt(D(全部包)))(?:/\|$)` |
| p 的客户端源码（第 6 步起） | 另一个包 q 的宿主目录，写法同第一行；加 `^(?:\./\|(?:\.\./)+)(?:alt(C(q)))(?:/\|\.[a-z.]+$\|$)`，即另一半的客户端文件与目录 |

`(?:\.\./)+` 吃掉任意层的 `../`：`src/glm-llm/auth/` 下导入编排层要写 `../../graph/`，`ui/src/graph/` 下导入宿主源码要写 `../../../src/graph/`，两种都命中。`(?:src/)?` 覆盖从 `ui/src/` 或包目录外回到 `src/` 的写法。这种写法的代价是同名目录会误报：包 p 里若有一个与另一个包顶层目录同名的子目录（例如 `src/glm-llm/graph/`），`../graph/` 会被当成跨包导入；表自检拒绝这种同名（下一条）。今天的嵌套目录只有 `src/glm-llm/auth/` 与 `ui/src/graph/`，后者与 `src/graph/` 同属编排层，不冲突。

表自检（preflight 第 1 项）：
1. 包名、包目录、行 id 不重复；每个源码目录只属于一个包；`src` 里不出现 `shared`；每行的模块落在该包的源码目录里。
2. `src/` 下每个顶层目录要么是 `shared`，要么恰好属于一个包；表里登记的目录都存在。bootstrap 以后加 `src/bootstrap/` 时漏登记，这一条直接失败，不用等产物检查兜底。
3. 第 6 步起，`ui/src/` 下每个文件恰好属于一个客户端包的 `sources`。
4. 各包源码目录与 `src/shared/` 之下（任意深度）没有名为 `src` 的目录，也没有与另一个包的顶层目录同名的目录；两半客户端源码之间，以及一半客户端源码与另一个包的宿主目录之间，没有同名的文件或目录（扩展名不计）。这一条让上面的 `regex` 不误报。

读它的有 `eslint.config.js`、`knip.js`、`scripts/preflight-bundle.mjs`、`scripts/clean-dist.mjs`、`scripts/build-ui.mjs`、`scripts/sandbox.mjs`（生成 profile 时的包名与目录；第 0 步时表还不存在，沙盒写今天的两个包名，第 5 步改为读表）与 `tests/preflight.spec.ts`。`src/` 不读它（运行时代码不导入脚本），运行时需要的分组是 `HEALTH_PACKAGES`，由 preflight 核对。

### 2.8 脚本、测试与文档的归属

脚本：
- 仓库级（两包共用）：`scripts/preflight-bundle.mjs`、`scripts/build-ui.mjs`、`scripts/ui-modules.mjs`、`scripts/check-lint.mjs`、`scripts/check-secrets.mjs`、`scripts/check-verbatim.mjs`、`scripts/deps-check.mjs`、`scripts/sandbox.mjs`、`scripts/probe/`、`scripts/calibrate/`，新增 `scripts/packages.mjs`、`scripts/clean-dist.mjs`、`scripts/profile-shape.mjs`。探针按组合测两包；标定测的是 GLM 在整套 harness 上的表现，两包都用。
- GLM：`scripts/smoke-zcode.mjs`、`scripts/smoke-zcode-authorized.mjs`（m1-parity 改过后者）。
- 编排层：`scripts/graph/`。

测试（文件不拆，`tests/` 保持平铺；`package.json` 的测试列表按 GLM、编排层、组合三段排列）：
- GLM：`aliases`、`compact-row`、`compact`、`glm-auth`、`glm-channel`、`glm-prompt`、`glm-routing`、`glm-signing`、`glm-startplan`、`glm-transport`、`glm-zcode`、`todo-reminder`、`todowrite`、`toolsearch`、`reminder-wiring`（高峰提醒）、`credits`（只剩 GLM 积分公式），以及 m1-parity 加的 `glm-device-mid`、`glm-project-token` 与替身 `glm-fixtures.ts`。
- 编排层：`data-home`、`graph-cli`、`graph-engine`、`graph-guard`、`graph-live`、`graph-panel`、`graph-panel-model`、`graph-reminder`、`graph-render`、`graph-row`、`graph-run`、`graph-store`、`guard-shell`、`hourness`（含移过来的面板用例）、`memory-audit`、`workflow`。
- 组合（同时装两包的行，验契约）：`dialect-wiring`、`guard-audit`、`graph-tools`、`health`（m1-parity 在里面加了 GLM 凭证用例，测试不受 ESLint 边界规则约束，照常导入两边）、`s5`，新增 `contracts`。
- 门禁脚本：新增 `profile-shape`（第 0 步）、`check-verbatim`（第 1 步）、`preflight`（第 1 步建，第 5、6 步扩）。
- 共用替身：`tests/fake-rc3.ts`、`tests/graph-helpers.ts`。

文档不搬文件：`docs/DESIGN.md` 写总体架构、公共库与 GLM 包，`docs/ORCHESTRATION.md` 写编排层包，其余文档写全项目，逐节改动见 §7.5。

## 3. 包名、行 id 与布局

包名按 §14.4 的建议写；人另定名字时只改 `scripts/packages.mjs`、四个清单、`HEALTH_PACKAGES` 与文档，伞包布局下不涉及 profile。

### 3.1 目录

```
package.json            dsh-glm-hourness：伞包，兼开发工作区根（scripts、devDependencies）
locale/、icon.svg       伞包的显示信息（不变）
tsconfig.json           全量类型检查（noEmit），ESLint 也用它
tsconfig.knip.json      只给 knip 读：extends ./tsconfig.json，references 指向两个包的 tsconfig（F20、F21）
knip.js                 取代 knip.jsonc，入口从 scripts/packages.mjs 生成
scripts/packages.mjs    目录表（§2.7）
packages/
  glm/
    package.json        dsh-glm-zcode
    cordis.patch.yml    glm-llm、glm-login、glm-prompt、glm-compact、glm-ui
    tsconfig.json       extends ../../tsconfig.json；rootDir ../../src，outDir ./dist
    locale/             en.json、zh.json：本包的显示信息
    dist/               构建产物，不入库
    ui/
      package.json      dsh-glm-zcode-ui（dsh.client）
      index.js          宿主半，apply 为空
      client.js         构建产物，不入库
  hourness/
    package.json        dsh-hourness
    cordis.patch.yml    data、guard、memory、workflow、hourness、graph、graph-panel、ui
    tsconfig.json
    locale/
    dist/
    ui/
      package.json      dsh-hourness-ui（dsh.client）
      index.js
      client.js
ui/
  package.json          dsh-glm-hourness-ui：占位包，不含行
  cordis.patch.yml      []，注释写明占位原因
  tsconfig.json         客户端源码的类型检查
  src/                  客户端源码
src/                    宿主源码（不搬家）
```

删除：根目录 `cordis.patch.yml`（内容分到两个子包，第 5 步）；`ui/index.js`、`ui/src/client.tsx`（分别被两个客户端包的 `index.js` 与两个入口取代，第 6 步）；`knip.jsonc`（第 5 步）。

根目录未入库的旧产物 `dist/` 与 `ui/client.js`，新布局不再生成，`scripts/clean-dist.mjs` 也不删它们（它只删各包的 `dist/`）。两处检出分开处理：
- worktree：第 5 步的构建之后删除陈旧的根 `dist/`，第 6 步的构建之后删除陈旧的根 `ui/client.js`。worktree 不是任何 profile 的加载源；删掉以后，脚本里漏改的 `../../dist/...` 导入（今天 `scripts/probe/run-probe.mjs`:31–38、`probe-llm.mjs`:28–30、`probe-dispatch.mjs`:36、`scripts/calibrate/run-calibrate.mjs`:26 都这样导入）会在探针里直接报错，不会悄悄加载旧代码。
- 主检出：保留到 L4 第一轮通过（合入时桌面版已关闭，这些文件只为忘了关桌面版时运行中的旧布局兜底），之后删除，并用一个提交去掉只为它们保留的忽略项（§7.1 合入顺序第 7 项、§7.4）。在那之前 ESLint、knip、jscpd 与 `.gitignore` 都继续排除它们，所以主检出与其他运行在这段时间里跑 `npm test` 照常通过。

### 3.2 清单

| 清单 | 要点 |
| --- | --- |
| 根 `package.json` | `name` 不变；`version` 0.3.0；`description` 改为伞包的说明；`dsh.bundle.patch` = `["./packages/glm/cordis.patch.yml", "./packages/hourness/cordis.patch.yml"]`（GLM 在前，组合出的宿主行顺序与今天相同，各行激活与监听器注册的先后不变）；删去 `main`、`files` 与指向 `dist/` 的导出，保留 `./locale/*.json` 与 `./icon`；`peerDependencies`、`devDependencies` 不变；`scripts` 见 §7.4 |
| `packages/glm/package.json` | `name` `dsh-glm-zcode`；`version` 0.3.0；`type` module；`private` true；导出 `./glm-llm`、`./glm-login`、`./glm-prompt`、`./glm-compact` 指向 `./dist/...`，另有 `./locale/*.json`；`dsh.bundle.patch` `./cordis.patch.yml`；`peerDependencies` 只有 `@deepseek-ai/cosmokit`（C2：`dist` 的 `.js` 里唯一的运行时裸导入，来自 `src/shared/schemastery.ts`:2–3）；不声明 `dsh.client`、`engines.dsh` 与 `@deepseek-ai/dsh*` peer（F7） |
| `packages/hourness/package.json` | `name` `dsh-hourness`；`version` 0.3.0；`type` module；`private` true；导出 `./data`、`./guard`、`./memory`、`./workflow`、`./hourness`（→ `./dist/report/index.js`）、`./graph`、`./graph-panel`、`./locale/*.json`；`dsh.bundle.patch` `./cordis.patch.yml`；不写 `peerDependencies`：编排层的 `.js` 产物今天没有运行时裸导入，以后哪一行有了再按 C2 加（第二稿为以后预留的 `@deepseek-ai/cordis` 去掉，AGENTS.md 不留死代码）；不声明 `dsh.client`、`engines.dsh` 与 `@deepseek-ai/dsh*` peer |
| `packages/*/ui/package.json` | `name` 为客户端包名；`version` 0.3.0；`type` module；导出 `.` → `./index.js`、`./client` → `./client.js`；`dsh.client` 见 §5.3；不声明 `dsh.bundle` |
| `ui/package.json` | `name` `dsh-glm-hourness-ui`；`version` 0.3.0；`private` true；`description` 写明「占位：桌面版 profile 列着这个包；界面行已由伞包 dsh-glm-hourness 提供」；`dsh.bundle.patch` `./cordis.patch.yml`（内容 `[]`，glmsandbox 自己的 patch 层就是这个形状）；不声明 `dsh.client`。m8-ui-audit 的 F-35 若已先给这个包加了 locale 与图标（插件管理器里的显示信息），图标保留，locale 的描述同样改成占位说明 |

两个子包的 patch 文件里，行的 `config` 与注释照搬今天的根 `cordis.patch.yml`；`glm-hourness/data` 的默认 `projectHome`（`!!js` 拼出的本仓库 `.llm`）不改，原因见 §9 B4。

### 3.3 行 id 与其他持久化标识

行 id 全部不改，新增一个 `glm-hourness/glm-ui`。理由：profile 覆盖项按 id 匹配（F2），改名会让覆盖项静默失配（只有一条 Loader 告警）。`split` 第二条验收「行 id 改名有迁移，用户 profile 里已有的配置不丢」的前提因此不成立：没有改名，已有配置按 §3.4 逐条照常生效。这条验收怎样改写是人定的事（§14.3）。

其余持久化标识也不改：cordis 服务名；notice 来源（`glm-graph-projection`、`glm-peak-reminder`、`glm-todo-reminder`、`glm-tool-search`、`glm-graph-run`）；提示词节名（`glm:*`、`harness:identity`）；命令名与 `definitionId`（`dsh-glm-hourness/*`）；cordis 插件名（`dsh-glm-hourness/<行>`）；用户级目录 `glm-hourness`；面板页面 id 与 kind；设置页与 pill 的插槽 id（`glm-hourness-ui`、`glm-channel`，`ui/src/channel.js`:317、320）。焦点、高峰提醒去重、检索公告都从会话历史按来源推出，改名会让续跑的会话找不回状态。这些名字里的 `glm-hourness` 读作项目名。

### 3.4 桌面版 profile 逐项解析

位置 `C:\Users\29596\.dsh\profiles\desktop\`，2026-10-29 只读核对，下面只写键名与行 id。

`package.json`（顶层键 `name`、`private`、`dsh`、`dependencies`；`dsh` 下有 `profile`、`desktopNextPlugins`、`desktopNextScheduleBundle`、`desktopNextOnboarding`）：

| 键 | 今天所指 | 拆包后 |
| --- | --- | --- |
| `dsh.profile.bundles` 13 项中的 `dsh-glm-hourness`（第 3 项） | 经 `node_modules` 的 junction 到仓库根 | 仓库根 `package.json` 仍叫这个名字，`dsh.bundle.patch` 是两个子包 patch 的列表，两个文件都在仓库根之内（C1）；组合出 11 个宿主行与 2 个客户端行 |
| `dsh.profile.bundles` 中的 `dsh-glm-hourness-ui`（最后一项） | 到 `ui/` | `ui/package.json` 仍叫这个名字，patch 为空，贡献 0 行 |
| `dependencies` 的两项 `link:` | 同上 | 不变 |

`cordis.patch.yml` 中本项目的五条（全部没写 `name`；两条 `disabled` 的值都是 `false`，除这两个布尔值外没有读值）：

| id | 覆盖的键 | 拆包后的目标 | 结果 |
| --- | --- | --- | --- |
| `glm-hourness/glm-prompt` | `config`（其下 `persona`、`tier`、`skills`、`env`，`env` 下 `cwd`、`platform`、`shell`、`osVersion`、`isGitRepository`），`disabled` | `packages/glm/cordis.patch.yml` 插入的同 id 行，经伞包进入组合 | 匹配；`config` 整体替换，与今天相同；`Config` schema 不变 |
| `glm-hourness/memory` | `config.home` | `packages/hourness/cordis.patch.yml` | 匹配 |
| `glm-hourness/workflow` | `config.home` | 同上 | 匹配 |
| `glm-hourness/hourness` | `config.home` | 同上；行模块从 `dist/ui/index.js` 变为 `dist/report/index.js`，覆盖项不比对模块路径（F2） | 匹配 |
| `glm-hourness/glm-llm` | `disabled` | `packages/glm/cordis.patch.yml` | 匹配，照旧启用 |

profile 里其余八条覆盖项（`ui-settings-account`、`ui-chat`、`ui-settings`、`agent-default-model`、`permission`、`ui-conversation`、`llm-pi-ai`、`plugin-market`）都带 `name`，指向 DSH 自己的行，与本项目无关；其中 `agent-default-model` 会被模型菜单改写（HANDOFF.md §6），影响的是 L4 的核对方法（§7.6）；`llm-pi-ai` 里 8317 的 `glm` provider 由 m1-cleanup 去掉（先备份，`docs/graph/nodes/m1-cleanup.json`），这条覆盖项会变化或消失，也属于其余条目，合入时的结构快照取的是那之后的状态。`glm-hourness/ui` 与 `glm-hourness/glm-ui` 在 profile 里没有覆盖项。`desktop-next.cordis.patch.json`、`desktop-next.runtime.patch.json` 只覆盖 `agents-anywhere-bridge-next`、`desktop-next-webserver`、`connection`，与本项目无关。`cordis.yml` 由启动器每次启动重写，不需要比对。DSH home 层的 patch 不存在（F16）。

### 3.5 glmsandbox

`~/.dsh/profiles/glmsandbox` 的 bundles 为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless` 与本项目两项，dependencies 是本项目两项，patch 层为空。伞包布局下照常工作，不改。拆包期间的验证不用它（§7.3）；合入之后 `npm run calibrate` 照旧用它。

### 3.6 可选的后续 profile 切换（建议现在不做）

如果以后人想让桌面版直接列两个子包、删掉伞包与占位包：

- `package.json` 的 `dsh.profile.bundles`：`dsh-glm-hourness` 换成 `dsh-glm-zcode` 与 `dsh-hourness` 两项，删去 `dsh-glm-hourness-ui`。
- `package.json` 的 `dependencies`：两项 `link:` 换成指向 `packages/glm` 与 `packages/hourness` 的两项。
- `cordis.patch.yml`：不变（行 id 不变）。
- 做法：先把 `package.json` 备份为 `package.json.bak-<毫秒时间戳>`（profile 里已有的命名），再在桌面版关闭时用 `dsh plugin --profile desktop add <路径> -w` 加两个子包、用插件管理器移除旧的两项，不手改文件（桌面版运行时 `--profile desktop` 会被拒绝，`docs/DEVELOPMENT.md` §3）；`plugin remove` 的确切命令与关闭状态下 `--profile desktop` 是否被接受都没有核实。重启桌面版后按 §7.6 的 L4 第一轮核对。
- 回滚：用备份文件覆盖 `package.json`，执行 `dsh plugin --profile desktop install`，重启。

不建议现在做的理由：伞包已经让桌面版零改动，切换只换来少两个清单，却要人批准一次 profile 改动并多一次 L4。

### 3.7 已有 profile 的迁移

| profile | 拆包落地时要做的 | 依据 |
| --- | --- | --- |
| 桌面版 `desktop` | 不改任何文件。合入时关闭桌面版，合入并 build 后再启动（F17，§7.1）。L4 里换过默认模型的，经同一菜单换回（HANDOFF.md §6） | §3.4 |
| `glmsandbox` | 不改 | §3.5 |
| 探针生成的 `probe-full`、`probe-glm`、`probe-hourness` | 每次运行在运行目录下重建，没有迁移 | §7.3 |
| 以后由设置表单新写的本项目覆盖项 | 对今天没有覆盖项的本项目行（`glm-login`、`glm-compact`、`data`、`guard`、`graph`、`graph-panel`、`ui`）用设置表单改配置，会写入带 `name`（模块的 file URL）的覆盖项（F18）。拆包后模块路径变了，这条覆盖项按 F2 被跳过，只有一条 Loader 告警，行按 bundle 默认配置运行。已有覆盖项的五行经设置表单修改时就地改、不加 `name` | F2、F5、F18 |

合入前的核对（§7.1 合入顺序第 2 项）：`node scripts/profile-shape.mjs snapshot desktop .llm/l4-split/desktop-shape.json` 列出全部覆盖项的 id 与键名，不输出值。本项目的覆盖项都不带 `name` 就继续；有带 `name` 的就停下交人（§14.6）。设置表单对哪些行开放编辑由客户端决定，本轮没有读设置页源码〔未核实〕，所以按「任何没有覆盖项的本项目行都可能被写入」处理。glmsandbox 的 patch 层为空，同样查一次。

## 4. 编排层的模型无关

### 4.1 本来就不分路由的部分

图工具（全局注册，`src/graph/index.ts`）、每步投影（`src/graph/reminder.ts`，`eligible` 恒真）、图文件门禁 `graph-files-only`（所有路由都拦，`src/guard/graph-files.ts` 由图行注册，`docs/ORCHESTRATION.md` §2.7）、面板与 `/graph-apply`、现场投影 `graphLive`、运行控制 `/graph-run`、记忆工具、派发记录（`DISPATCH_TOOLS` 都是 DSH 原生名）、用量流水（`llm/stream` 上不分 provider 记录）、晨报的例外、决策曲线与 token 用量。拆包后这些代码只改导入路径；没有 GLM 包时在非 GLM 会话里照常工作，由第 5 步的「只装编排层包」组合验证。

### 4.2 guard

#### 4.2.1 现状〔实读〕

guard 只判 GLM 模型发出的调用。`src/guard/index.ts`:162–166 取会话最新请求头的路由，`isGlmModel` 不成立就放行，也不记影子笔记；影子兜底的 `observe` 只在 :185 调用，所以同样只看 GLM 调用。GLM 路由的系统提示词末尾加 `glm:guard` 规则声明（:196–205，范围判定在 :201）。两处判定都只看模型族，与方言装没装上无关。`docs/ORCHESTRATION.md` §6.2 的定案是「先只作用于 GLM 会话，误伤清零后再考虑放开」；2026-10-28 的 L4 里 guard 拦过 DeepSeek 会话的写入，当作缺陷修掉（`docs/DEVELOPMENT.md` §7）。

下面按方言是否接管，把调用分成三类：

| 类 | 含义 | 今天 |
| --- | --- | --- |
| C | GLM 路由，且 `glm-prompt` 已在这个 agent 上装好方言（今天桌面版的所有 GLM 会话） | 拦截，规则声明 |
| N | GLM 路由，但方言不在：`glm-prompt` 被禁用、这个 agent 上方言安装失败、或只装编排层包时经 pi-ai 的 `glm` 路由用 GLM（桌面 profile 里 8317 的 pi-ai `glm` 路由将由 m1-cleanup 去掉，之后桌面版上只剩前两种情形） | 拦截，规则声明（用的是模型看不到的 ZCode 工具名） |
| O | 非 GLM 路由（DeepSeek 等） | 不判、不记 |

#### 4.2.2 第 2 步：只换算工具名，拦截范围不变（不需要人定）

1. 工具名换算。`rules.ts`、`shadow.ts`、`graph-files.ts` 的工具表只留 DSH 原生名（`write`、`edit`、`str_replace_editor`、`pwsh`、`bash`、`terminal_send`）。匹配之前，调用名经 `toNativeTool`（`src/shared/dialect.ts`，§4.7）换成原生名：先问方言服务的 `nativeOf`，没有服务或它不认识这个名字时查公共库的静态别名表 `ZCODE_ALIAS_NATIVES`（`Write` → `write`、`Edit` → `edit`、`Bash` → `pwsh` 等），都没有就原样。
   - 为什么要静态表：方言装没装上与方言服务有没有提供是两回事。`installDialect` 在 `agent/created` 里注册别名（`src/glm-prompt/index.ts`:133–138、184–195），服务由同一行另行 `provide`；服务缺席或形状不对（§8.2）时方言照常改写，GLM 照常调用 `Write`、`Edit`、`Bash`。只按服务换算，这三个名字就不在只含原生名的表里：工作区圈禁与 file-tools-only 判为放行，graph-files-only 的 `writeTarget` 认不出 `Write`，影子兜底把 `Write`、`Edit` 写的文件当成 shell 写的。今天三张表同时列两套名字（`src/guard/rules.ts`:61、91，`src/guard/shadow.ts`:74–80，`src/guard/graph-files.ts`:34），拦截不依赖任何服务；静态表保住这一点。
   - 换算的位置：guard 行在 `tools/pre-execute` 里构造 `ToolCall` 时（`src/guard/index.ts`:167）；图文件门禁在 `installGraphFileGuard` 构造调用时（`src/guard/graph-files.ts`:116）；影子兜底在 `observe` 里查 `FILE_TOOLS` 与调 `shellCommandOf` 之前（`src/guard/shadow.ts`:125 起）。`graph.isGraphTool` 的判断不换算（图工具没有别名）。
   - 违规记录与影子记录里的 `tool` 仍写模型调用时用的名字。
   - 静态表不看路由，与今天两套名字并列的表相同：别的插件若注册了与 ZCode 别名同名的工具（例如另一个 `Write`），也按它对应的原生工具判定。DSH 的原生工具名都是小写，今天的组合里只有方言注册这些名字。
2. 文案用名。规则接口改为下面的形状。`claims(agent, route)` 为真时 `face` 取方言服务的 `faceName`（`write` → `Write`、`edit` → `Edit`、`read` → `Read`），否则取原名。C 类调用上的文案与今天逐字相同，提示词缓存不受影响；`tests/guard-audit.spec.ts` 钉住这一点。
3. 范围不动。`src/guard/index.ts` 保留两处模型族判定：`tools/pre-execute` 监听器里的 `isGlmModel(sessionRoute(...).model)`（:163）与声明监听器里的 `isGlmModel(assemblyRoute(assembled).model)`（:201）。这是编排层仅剩的两处模型族判定，第 7 步按人定的方案保留或删除（§4.2.4）。

```ts
// src/guard/rules.ts（第 2 步）
/** DSH 原生工具名 → 模型在这一次调用或这一次组装所在的路由上看到的名字 */
export type ToolFace = (native: string) => string
/** 方言没有接管时的取名：原名 */
export const NATIVE_FACE: ToolFace = native => native
export interface GuardRule {
  readonly id: string
  /** 规则声明的一行；函数形式按 face 写工具名 */
  readonly declare: string | ((face: ToolFace) => string)
  /** call.name 已是 DSH 原生工具名（toNativeTool）；纠偏文案里的工具名经 face 取；抛错按放行 */
  detect(call: ToolCall, face: ToolFace): RuleVerdict
}
/** 依次判定，第一个 deny 生效；face 缺省为 NATIVE_FACE */
export function evaluate(rules: readonly GuardRule[], call: ToolCall, face?: ToolFace): RuleVerdict
/** 规则声明的文本：字符串原样，函数按 face 渲染 */
export function declarationOf(rule: GuardRule, face: ToolFace): string
```

- `fileToolsOnly` 的 `declare`（`src/guard/rules.ts`:115）与纠偏的 `rightPath`（:126）改为按 `face('write')`、`face('edit')`、`face('read')` 写工具名；`workspaceContainment` 与 `graphFilesOnly` 的声明与纠偏不含文件工具名，保持字符串。
- `declarationSection(rules, others, face)`（`src/guard/index.ts`:120）多一个参数，逐条用 `declarationOf`。
- `graph-files.ts`:82 改为 `fileToolsOnly.detect(call, NATIVE_FACE)`，那里只看判定结果。
- 配置追加的规则（`GuardConfig.rules`，`src/guard/index.ts`:62）按今天的接口写也成立：字符串 `declare` 是新类型的一支，只收一个参数的 `detect` 可以赋给两个参数的签名。它们收到的 `call.name` 从第 2 步起是原生名；第 2 步对 `docs/ORCHESTRATION.md` §6.1 的改动写明这一点。桌面 profile 没有 guard 的覆盖项，今天没有这样的规则。

第 2 步唯一看得见的变化落在 N 类调用上：照样被拦，但纠偏与 `glm:guard` 声明改用模型实际看到的原生工具名。这是文字更正，拦不拦不变，所以由 agent 定（§12）。方言服务缺席时，C 类调用的纠偏与声明也改用原生名，拦截不变（§4.7、§8.1）。

第 2 步的 L2 用例（R15）：`tests/guard-audit.spec.ts` 在没有方言服务、GLM 路由时，`Write` 写工作区外被圈禁拒绝，`Bash` 跑 `Set-Content` 被 file-tools-only 拒绝，纠偏用原生名；同一回合 `Write` 的目标在影子兜底里算文件工具的目标，不产生影子记录。`tests/graph-guard.spec.ts` 在没有方言服务时，`Write` 写 `docs/graph/nodes/*.json` 与 `Bash` 的 `Set-Content docs/graph/...` 被 graph-files-only 拒绝。两处都另跑一遍有方言服务的同样用例，结果相同。

#### 4.2.3 要人定：方言没有接管的路由（N 与 O）

| 方案 | C | N | O | 好处 | 代价 |
| --- | --- | --- | --- | --- | --- |
| G1 维持 | 拦截 | 拦截 | 不判、不记 | 就是今天的行为，与 §6.2 定案一致，零风险 | O 上永远拿不到误伤数据，「误伤清零后再放开」无从谈起；编排层永久保留 `src/guard/index.ts` 的两处模型族判定；`split` 验收第一条里「guard 都生效」不成立，要改写 |
| G2 影子先行（推荐） | 拦截 | 影子 | 影子 | 不打扰其他模型，系统提示词不变；按 §6.5 先量误伤，数据够了由人按 §6.2 的判据决定放开；编排层不再有模型族判定 | 修改 §6.2 定案的一处：N 由拦截改为影子，要人批准；违规流水与晨报多出影子记录；这些调用的坏习惯暂时没人纠正；方言服务提供失败时 C 类的 GLM 调用也转为影子（工具名仍按静态表换算、判定照常，只是不拦，§8.1） |
| G3 全拦 | 拦截 | 拦截 | 拦截 | 规矩立刻一致 | 推翻 2026-10-28 的修复；file-tools-only 的探测按 GLM 与 ZCode 的习惯调过，在其他模型上误伤率未知；所有路由的系统提示词都多一节声明 |
| G4 分规则 | 拦截 | 圈禁拦截，file-tools-only 影子 | 同 N | 圈禁的语义确定，误伤面小 | 用户桌面版的默认权限预设是 `danger-full-access`（`docs/HANDOFF.md` §6、`docs/ORCHESTRATION.md` §10.5.1）；对其他模型拦工作区外写入，等于替人收紧他选的权限（`docs/CHARTER.md` §6「不替用户做主」） |

「影子」指：用同一套规则判定，判为违规的写一条影子记录（带路由与本会说出的纠偏），然后放行，不加规则声明；workspace-changes 兜底同样记录这些路由。graph-files-only 在所有方案下都照常拦截。

推荐 G2，理由：规则的误伤数据来自 GLM 在 ZCode 工具面上的行为（L3 探针与 L4）；N 类调用看到的是 DSH 原生工具面，误伤率没有测过，应与 O 同等对待；N 类今天只在禁用 `glm-prompt` 或方言安装失败时出现，在桌面版上实际不改变什么。人若想让 N 照常拦截，G2 可以改为按模型族定拦截范围（C、N 拦截，只有 O 影子），代价是编排层保留模型族判定。

人还没定时：第 7 步不合入，行为与今天相同（C、N 拦截，O 不判、不记），`split` 验收第一条不成立，`split` 不关。

#### 4.2.4 第 7 步：按选定的方案改

- G1：代码不动。`docs/ORCHESTRATION.md` §6.2 写明拦截范围永久按模型族、两处判定在 `src/guard/index.ts`，以及理由。
- G2：
  - `src/guard/index.ts`：拦截范围改为 `claims(agent, sessionRoute(session))`，删去两处 `isGlmModel`。为真时同今天：判为违规就拦截并写 `ViolationRecord`（不变）；不违规就 `next()`，放行后调用 `shadow.observe(payload, 'dialect')`。为假且路由已知时：调用名照样经 `toNativeTool` 换算，按 `NATIVE_FACE` 照常 `evaluate`；判为 `deny` 时写一条 `RuleShadowRecord` 再 `next()` 放行，这次调用不再交给兜底的 `observe`，因为它已经有记录；判为 `allow` 时 `next()`，放行后调用 `shadow.observe(payload, 'other')`。路由未知（没有 agent，或会话还没有请求头）时同今天：放行、不记。声明监听器只在 `claims(agent, assemblyRoute(assembled))` 为真时加 `glm:guard` 一节。
  - 记录类型：`RuleShadowRecord {at, rule, mode: 'shadow', scope: 'other', tool, agentId?, sessionId?, route: {provider?, model?}, correction}` 定义在 `src/guard/index.ts`；`GuardRecord` 改为 `ViolationRecord | ShadowRecord | RuleShadowRecord`。`src/memory/audit.ts` 与 `src/workflow/morning-report.ts` 只经这个联合类型引用，导入不变。
  - `src/guard/shadow.ts`：`observe(payload, scope)` 多一个参数；`TurnNotes` 记下本轮每次 shell 调用的 scope 与路由；`ShadowRecord` 加 `scope: 'dialect' | 'other'` 与 `route`（本轮最后一次记下的 shell 调用的路由）。一轮里只要有一次 shell 调用在方言接管的路由上就记 `dialect`，全部在其他路由上才记 `other`；这样「其他路由」一组只收确定不受方言影响的记录。
  - 已落盘的记录没有 `scope`：按 `dialect` 计。第 7 步之前只有 GLM 路由会写影子记录，今天的组合里它们都属于 C。
  - `src/workflow/morning-report.ts`：「影子记录（只记录，未拦截）」一节分「方言接管的路由」「其他路由」两组；每组里再按来源分开计数：规则判定（`RuleShadowRecord`，有 `tool` 与 `correction`）与工作区变更兜底（`ShadowRecord`，有 `turn` 与 `paths`），各按规则列出。同一轮里还有别的 shell 调用时，一次被规则判定的写入仍可能出现在兜底记录的 `paths` 里，分开计数就不会混算。
  - 行健康：N、O 上的调用报 `active`，说明写「影子模式：只判定并记录，不拦截（路由 provider/model）」。影子是设计内的状态，不是降级。
  - 测试：`tests/guard-audit.spec.ts` 覆盖两类影子记录的 `scope` 与路由、放行、N 与 O 上没有声明、一轮混合路由的归组、没有方言服务时 GLM 调用转影子（`Write`、`Bash` 仍按静态表换算后判定，影子记录里的 `correction` 是按原生名写的那段纠偏）；`tests/workflow.spec.ts` 覆盖分组与缺 `scope` 的旧记录归入方言组。
  - 放开的判据（agent 的提议，人可改）：晨报列出其他路由上每条规则的影子记录；agent 每周把新记录逐条标成「该拦」或「误伤」，批注在一个规范节点上；连续 14 天、至少 20 条、误伤为 0 时，agent 提一张决定者为人的待决，人决定是否放开到拦截。这对应 §6.2 的「误伤清零后再考虑放开」。
- G3：删去两处范围判定，所有路由都拦；声明加到所有路由（N、O 上用原生工具名）；影子兜底对所有路由记录，`scope` 照 G2 填写。
- G4：工作区圈禁对所有路由拦截；file-tools-only 在 C 上拦截、在 N 与 O 上按 G2 的做法记影子；声明只在 C 上列 file-tools-only。

### 4.3 晨报与积分面板

晨报（`morningReport`）的「用量」一节本来按 token 列，留在编排层不变。积分面板（`usagePanel`、`usagePanelLines`）改为读计价服务：

```ts
// src/shared/pricing.ts
export const PRICING_SERVICE = 'glmHournessPricing'
export interface UsagePricing {
  /** 面板首行的口径说明 */
  readonly basis: string
  /** 套餐名，用在「不计积分（不在 … 内）」一行 */
  readonly plan: string
  /** 一次调用在 atMs 时刻扣的积分；模型不在套餐里时为 undefined */
  charged(model: string, usage: TokenUsage, atMs: number): number | undefined
  /** atMs 是否在套餐的高峰时段 */
  peak(atMs: number): boolean
}
/** 读服务；行未启用或值的形状不对时为 undefined（形状不对时 console.warn 一次） */
export function pricingService(ctx: ServiceLookup): UsagePricing | undefined
```

- 提供方：`glm-hourness/glm-login`（`src/glm-llm/login-row.ts`），激活时 `ctx.provide(PRICING_SERVICE, value)`，值由 `src/glm-llm/credits.ts` 的 `creditRate`、`chargedCredits`、`peakWindowAt` 组成。选它的理由：它是账号与套餐的人机入口（`/glm-status` 显示套餐），bundle 默认启用，只在激活时起作用，不依赖路由；`glm-llm` 在 bundle 里默认禁用，经旧的 pi-ai `glm` 路由用 GLM 时它不在；`glm-prompt` 是方言行，禁用方言不该让面板丢掉积分。
- 使用方：报告行的 `usagePanel(raw, pricing?)`，第 3 步改在 `src/ui/panel.ts`，第 5 步随目录改名为 `src/report/panel.ts`。有服务时输出与今天相同（首行与「不计积分」一行的文字取自服务）；没有时每个模型列调用次数、未命中输入、缓存读、缓存写、输出与缓存命中率，另起一行「没有计价服务（GLM 通道包的 glm-login 行提供积分口径），只列调用与 token」。修正前记录与无法读取的记录两种情况都照今天处理（X12）。
- `hourness` 行的会话健康说明加一项「积分口径：已提供」或「积分口径：未提供，按 token 列」，状态不因此降级。
- 标定运行器（`scripts/calibrate/run-calibrate.mjs`:26）与探针（`scripts/probe/run-probe.mjs`:33）的导入：第 3 步改为 `../../dist/glm-llm/credits.js`（这时产物仍在根 `dist/`），第 5 步再改为 `../../packages/glm/dist/glm-llm/credits.js`。它们是脚本，不是行。
- m6 剩下的工作（5 小时窗口、周额度、预估耗尽时间，`DESIGN.md` §4.7 的通道取数）以后扩这份契约：通道包取数，编排层展示。本次不加字段，避免留下没有使用者的契约。

### 4.4 高峰提醒

留在 GLM 包（`glm-prompt` 行，`src/glm-prompt/peak-reminder.ts`）。正文讲的是 GLM 的积分，时段来自 GLM 套餐（`src/glm-llm/credits.ts` 的 `peakWindowAt`），只在方言接管的 GLM 步上发（`src/glm-prompt/index.ts`:147 的 `glmStep`）。编排层不需要它，也不另做通用的高峰提醒。

### 4.5 派发档位（`docs/ORCHESTRATION.md` §3.5，M7 实现，本次只改文档）

- 档位词汇 `hard`、`standard`、`simple` 在编排层（任务节点的 `tier` 字段已在 schema 里）。
- 档位到模型的映射归通道包。GLM 包在 M7 时提供一个服务，只对自己的路由给答案（难题 GLM-5.3 加 high 或 max，常规 GLM-5.3，简单 GLM-5.3-Flash，即 §3.5 现文）。服务名与接口在 M7 定，本次不加代码。
- 没有映射的路由：子 agent 继承父 agent 的路由（不给 `agentOptions.model`，`dsh-subagent` 在父路由之上合并，`docs/ORCHESTRATION.md` §3.2 的 L3 实测），不跨通道、不换套餐（`docs/CHARTER.md` §6）。
- 晨报披露每档实际用了哪个模型（§3.5 已有）。
- 文档改动排在第 5 步（§7.5）。

### 4.6 注入格式

`<system-reminder>` 包装（`wrapSystemReminder`）从 GLM 的镜像文件移到公共库的镜像文件 `src/shared/zcode-notice.ts`，逐字门禁照常检查它。它是本项目所有 harness notice 的格式，对所有路由一样。每步投影今天就这样注入非 GLM 路由，L3 场景 `non-glm-graph` 通过（`docs/ORCHESTRATION.md` §2.10）。不按路由换格式：没有证据表明其他模型需要别的格式。

### 4.7 方言服务

```ts
// src/shared/dialect.ts
export const DIALECT_SERVICE = 'glmHournessDialect'
/**
 * ZCode 3.16.3 别名 → 它委托的 DSH 原生工具：GLM 方言注册的别名
 * （src/glm-prompt/aliases.ts aliasSpecs，加 Read、TodoWrite）。两包都用的静态事实，
 * 与 DEFERRED_TOOL_CALL_NAME 同类；编排层用它识别别名，不依赖方言服务在不在。
 */
export const ZCODE_ALIAS_NATIVES: ReadonlyMap<string, string> = new Map([
  ['Write', 'write'], ['Edit', 'edit'], ['Glob', 'glob'], ['Grep', 'grep'],
  ['Bash', 'pwsh'], ['Read', 'read'], ['TodoWrite', 'todo_write'],
])
export interface DialectService {
  /** 本方言是否改写这个 agent 在 route 上的请求：已在 agent 上装好，且路由属于本方言的模型族 */
  claims(agent: AgentLike, route: Route | undefined): boolean
  /** 本方言的别名所委托的 DSH 原生工具；不是别名时为 undefined */
  nativeOf(tool: string): string | undefined
  /** 本方言在它接管的路由上给某个原生工具起的名字；没有别名时返回原名 */
  faceName(native: string): string
}
/** 读服务；行未启用或用到的三个成员不是函数时为 undefined（形状不对时 console.warn 一次） */
export function dialectService(ctx: ServiceLookup): DialectService | undefined
/** 调用名 → DSH 原生工具名：先问服务的 nativeOf（抛错按 undefined），再查 ZCODE_ALIAS_NATIVES，都没有就原样 */
export function toNativeTool(dialect: DialectService | undefined, name: string): string
```

- 提供方：`glm-prompt`（`src/glm-prompt/index.ts` 的 `apply`）。`nativeOf` 由 GLM 自己的定义组成：`aliasSpecs`（`zcodeName` → `nativeName`，`src/glm-prompt/aliases.ts`:174 起）加上 `Read` → `read`（`read-alias.ts` 的 `READ_NATIVE`）、`TodoWrite` → `todo_write`（`todo-reminder.ts` 的 `TODO_NATIVE`），不从静态表抄；`faceName` 是它的反查（`read_image` 也映射到 `Read`）。`claims` = `active.has(agent) && isGlmModel(route?.model)`，与方言自己按 `isGlmAssembly` 判路由用的是同一个模型族判定；`active` 是一个新的 `WeakSet`，在 `installDialect` 成功返回之后加入。今天的 `installed`（同文件 :180、186）在安装之前就加入，装失败的 agent 也在里面，不能复用。
- 静态表与服务的关系：两个包都从公共库编进一份 `ZCODE_ALIAS_NATIVES`。`nativeOf` 用 GLM 包自己的别名定义，所以两个包版本错开、GLM 包多了一个别名时，只要服务在，guard 照样认得；服务不在时，静态表认得的别名照样换算。`tests/contracts.spec.ts` 断言四者一致：`ZCODE_ALIAS_NATIVES` 恰好等于 `aliasSpecs` 的 `zcodeName → nativeName` 加 `Read`、`TodoWrite` 两项；`glm-prompt` 提供的 `nativeOf` 对表里每个名字给出同样的原生名，对表外的名字返回 undefined；`faceName` 对表里每个原生名给回别名。加了别名忘了登记就失败。
- 使用方：guard（`index.ts` 换算调用名、选文案用名；第 7 步按方案判范围）、影子兜底（`shadow.ts` 查表前换算）、图文件门禁（`graph-files.ts` 构造调用时换算）。三处都经 `toNativeTool`。
- 读取：每次调用与每次组装时现取，不依赖两行的加载顺序；`agent/created` 的先后也无关，因为 `claims` 在调用时才算。
- 服务缺席或形状不对时：换算由 `ZCODE_ALIAS_NATIVES` 兜底，拦截与有服务时相同；`faceName` 取原名、`claims` 恒假，所以 C 类调用的纠偏与 `glm:guard` 声明改用原生工具名（第 7 步之前只有这一处可见变化）；人选 G2 时 C 类调用按 N 处理，只记影子（§4.2.4、§8.1）。单次调用里某个方法抛错时，按服务缺席处理这一次调用，`console.warn` 一次。

不选的做法：guard 在自己的组装监听器里看工具面里有没有 `Write` 来判断词汇。两个 prepend 监听器的内外次序取决于行的加载顺序，guard 在内层时看到的是改写前的工具面。

### 4.8 GLM 方言里涉及编排层的文本

`glm:memory` 节（coding-plan 档）告诉模型用 `memory_store`、`memory_query`、`memory_forget`。改为：`glm-prompt` 的组装监听器在 `next()` 之后，按 `next()` 返回的 `assembled.tools` 判断，三个 `MEMORY_TOOL_NAMES` 都在才加这一节。

判定用的是哪一份工具列表：监听器里有三份（`src/glm-prompt/index.ts`:145–152）：`next()` 返回的 `assembled.tools`、别名改写后的 `face`、工具检索之后的 `toolSearch.expose(face)`。只能用第一份。被工具检索延迟加载的工具不在最后一份里，而 §2.6 允许以后把记忆工具移出常驻名单，按最后一份判定会在那时误删这一节；别名改写不碰记忆工具，第二份与第一份对它们没有区别，但没有理由依赖这一点。判定写成一个函数 `memorySectionApplies(assembled: AssemblePayload): boolean`，参数是 `next()` 的返回值本身，在 `rewriteToolFace` 之前调用。

编排层包缺席、memory 行禁用或没配 `home`（这时 memory 行不注册记忆工具，`src/memory/index.ts`:41–48）时，GLM 不会被教去用不存在的工具，后两种情况今天就是缺陷。`assembled.tools` 只在行启停时变化，所以一个会话里这一节通常不变，系统提示词也就不变。ZCode 原版的 Memory 段讲的是 ZCode 自己的记忆文件，DSH 里不存在，所以不回退到原版，直接不加。

L2 用例（`tests/glm-prompt.spec.ts`，第 2 步）：经组装监听器跑 `next()` 返回的工具有、缺一个、全缺记忆工具三种，`toolSearchMode` 取 `local` 与 `off` 各一遍；`memorySectionApplies` 的单测同样三种。「记忆工具在 `next()` 的返回里、却被工具检索延迟加载」今天在组合里造不出来：记忆工具在常驻名单里，常驻名单是公共库的常量，测试不改它。这一点由函数的参数（`next()` 的返回值本身）与调用位置（`rewriteToolFace` 之前）保证，源码注释写明；以后把记忆工具移出常驻名单的那个提交，要同时加一个经工具检索的端到端用例。

## 5. UI

### 5.1 决定：拆成两个客户端包

一个客户端包装两半时，只装一个宿主包的组合里另一半是坏的：GLM pill 调 `/glm-status` 得到未知命令，进入错误态（`ui/src/channel.js` 的 `PillBoundary` 显示「GLM ⚠」）；面板没有 `/graph-apply` 时能读不能写。这违反「各自装上不报错」。client-modules 按包组成，两个各一行的包是它原生支持的形态（F9–F11）。

### 5.2 布局

客户端包嵌在宿主包目录里，由宿主包的 patch 插行（F11 的形态），每个宿主包单独装上就带着自己的界面。`ui/` 只留占位清单：桌面 profile 列着 `dsh-glm-hourness-ui`，而 F4 不允许 `ui/` 的 patch 去引用 `../packages/...`。

不选的做法：
- 保留一个客户端包装两半：耦合两个包，见 §5.1。
- 两个客户端包放在 `ui/` 下、各自是 bundle，`ui/` 当客户端伞包：每个包单独装要装两个 bundle，界面与它的宿主包分在两处。
- `ui/` 的 patch 引用 `../packages/*/ui/...`：在 junction 安装下路径错（F4），bundle 被跳过。

### 5.3 入口与声明

| 客户端包 | 入口 | 入口导出的 `inject` | `dsh.client.inject` |
| --- | --- | --- | --- |
| `dsh-glm-zcode-ui` | `ui/src/glm-client.js`：`apply(ctx)` 调 `installChannel(ctx)` | `slots`、`remote`、`remote.commands` | `@deepseek-ai/dsh-api-remotes` |
| `dsh-hourness-ui` | `ui/src/hourness-client.tsx`：`apply(ctx)` 调 `installGraphTab(ctx)` | `slots`、`sidebarRightTabs`、`remote`、`remote.commands`、`remote.workspaceFiles`、`sessions` | `@deepseek-ai/dsh-client-ui-sidebar-right`、`@deepseek-ai/dsh-api-workspace-files`、`@deepseek-ai/dsh-api-remotes` |

两包都是 `platform: web`、`immediately: true`。`inject` 按 `docs/DEVELOPMENT.md` §5 第 7 条写全服务路径链；`channel.js` 只用 `ctx.slots` 与 `ctx.remote.commands`（:310、316、319）。`dsh.client.inject` 是今天合在一起的那张表（`ui/package.json`）按两半分开。宿主半 `index.js` 都只导出 `name` 与空的 `apply`。

### 5.4 构建

`scripts/build-ui.mjs` 按目录表对两个客户端包各打一份：读该包 `package.json` 的 `name` 与 `exports['./client']`，打包表里的入口，外包 `window.__ModuleLoader__.load({ id: <包名>, ... })`，模块表（`scripts/ui-modules.mjs`）不变。编排层客户端经 `src/graph/live.ts` 带进 `src/shared/zcode-notice.ts`，不再带进 GLM 的 `zcode-text.ts`。

### 5.5 preflight 的客户端检查

对每个客户端包：仓库里所有 patch 文件中恰好一行解析进它的目录，且是表里登记的那一行；`client.js` 已构建、外包的 `id` 等于包名、通过 `node --check`、只 `require` 模块表里的包；`dsh.client.platform` 与 `inject` 存在；`exports['./client']` 存在。宿主包、伞包与占位包都不得声明 `dsh.client`。

### 5.6 验证

L3 默认组合里没有 client-modules（F12）。第 6 步在探针覆盖层里挂一行 `@deepseek-ai/dsh-client-modules`，核对它的 fiber 激活、`graph().entries` 里有两个客户端包（U3）。不成立时客户端组合只靠 preflight 与 L4。

## 6. 项目目标（草案，由人定文字）

### 6.1 结构

目标节点不能有父节点（F15），所以 `question-10` 选 A 写下的「目标拆成两个」是两个根目标。项目图的布局与投影支持多个根：每个任务的祖先链停在自己的根目标上，GLM 的任务不再读到编排层的验收条件，反之亦然。

建议：编排层目标沿用 id `hourness`（包名 `dsh-hourness`，第一理念「在图上编程」在这边，`orch` 子树的大多数节点不用动）；GLM 目标新建，id `glm-house`。`hourness` 今天的直接子节点是 `bottom`、`d-graph-programming`、`m0`、`orch`、`q-old-folder`，改挂建议：

| 节点 | 建议 | 理由 |
| --- | --- | --- |
| `orch` | 留在 `hourness` | 编排层本身 |
| `d-graph-programming` | 留在 `hourness` | 第一理念属于编排层 |
| `m0` | 留在 `hourness` | 文档沉淀，已完成，跨两半 |
| `bottom` | 改挂 `glm-house` | 底层：通道与方言 |
| `q-old-folder` | 改挂 `glm-house` | 旧工作名 `dsh-glm-dialect` 的文件夹 |
| `m6`（在 `orch` 下） | 留在 `orch`，正文加一句「积分公式、额度取数与高峰提醒在 GLM 通道包，经计价服务给编排层用」 | m6 剩下的 5 小时窗口、周额度、预估耗尽时间与排期，都是通道取数、编排层展示与排期；整个节点改挂 `bottom`（备选）会让展示与排期读到 GLM 目标的验收，拆成两个节点（备选）要把一个里程碑的验收分到两边 |

面板标题：`headlineGoal`（`ui/src/graph/model.ts`:220）取「按 id 排序第一个未关闭的目标」，`glm-house` 排在 `hourness` 之前，拆成两个根目标后面板标题会只显示 GLM 目标。第 8 步改为 `headlineGoals`：列出全部未关闭的目标（id 序，全部关闭时取第一个目标），标题文字用「 · 」连接各目标的标题，悬停提示每行一个；`tests/graph-panel-model.spec.ts` 覆盖一个目标、两个未关闭目标、全部关闭三种情况。不靠挑 id 的字母序来决定显示哪个目标。

顺带的事实：CHARTER 0.4 加了 §2 以后章节顺延，`hourness` 节点里的引用没有跟着改。验收「工程美学」引的 §6 现在是 §7；非目标引的 §5（不替用户做主）现在在 §6，§8（人设不进插件）现在在 §9。下面的草案用新编号。

### 6.2 目标 A（新，id `glm-house`）

标题：GLM 住进 DSH：以 ZCode 3.16.3 的训练分布工作，质量与官方 ZCode 一致

正文：GLM-Hourness 里「House」的一半，由 GLM 通道包 `dsh-glm-zcode` 实现。模型权重不可改，能改的是模型所处的环境：通道让服务端把请求当作 ZCode 3.16.3 的请求接受与计费，方言让模型看到 ZCode 的提示词、工具面与提醒（CHARTER.md §1、§3）。

验收：
1. 无损：coding-plan 请求在代码级别与 ZCode 3.16.3 一致（身份头、签名、端点路由、请求体）；提示词与工具文本逐字镜像，或按本地化清单改写（DESIGN.md §5.3、§5.9），不为照顾宿主裁剪。
2. 治顽疾（方言部分）：工具 schema 负担由工具检索解决，压缩按 ZCode 的提示词与格式进行。
3. 只管 GLM：非 GLM 会话与其他 provider 不受影响；每行可单独禁用，故障时降级，在 /glm-status 上报。
4. 自成一体：不装编排层包时，通道、方言、高峰提醒与积分口径照常工作。
5. 工程美学：CHARTER.md §7 的条款是设计约束。

非目标：
- 不依赖反向代理：任何行都不识别、不依赖反代路由（AGENTS.md，DESIGN.md §1；仓库级规则，两个目标都适用）。
- 不替用户在模型、套餐、渠道上做主，不做自动切换（CHARTER.md §6）。
- 不承担编排：项目图、guard、记忆、派发与报告不在本包。
- 人设与个人习惯不进插件（CHARTER.md §9）。

### 6.3 目标 B（沿用 id `hourness`）

标题：开发体系由 harness 保证实施：任何模型在 DSH 里沿项目图干活，人在图上编程

正文：GLM-Hourness 里「Harness」的一半，由编排层包 `dsh-hourness` 实现，对所有模型生效。第一理念是在图上编程（CHARTER.md §2）；人负责发现需求、制定目标、设计架构与流程，代码、测试、运维、报告交给 LLM（CHARTER.md §4）。

验收：
1. 对所有模型生效：项目图工具、每步投影、面板、现场、运行控制、记忆、派发记录与晨报在 GLM 与非 GLM 会话里都可用；guard 的拦截范围与其余路由上的做法按 ORCHESTRATION.md §6.2 的定案。
2. 治顽疾（编排部分）：长程任务的目标漂移与计划过时由项目图与每步投影解决，记忆陈旧由记忆与学习解决，状态放在图上、会话可以丢弃，上下文因此不膨胀。
3. 调校：开发体系量化成标准与规范，由 harness 在执行边界保证实施，不依赖 LLM 或人的自觉；新门禁先影子后拦截。
4. 自由度：每个能力是独立插件行，可单独禁用，故障时降级，在 /hourness-status 上报；不装 GLM 通道包时照常工作。
5. 工程美学：CHARTER.md §7 的条款是设计约束。

非目标：
- 不依赖反向代理：任何行都不识别、不依赖反代路由（AGENTS.md，DESIGN.md §1；仓库级规则，两个目标都适用）。
- 不设积分与轮次预算，花费只披露（ORCHESTRATION.md §4.3）。
- 不替用户在模型、套餐、渠道上做主，不做自动切换（CHARTER.md §6）。
- 不含任何模型的方言：模型专属的提示词、工具别名与计价口径由各自的通道包提供。
- 人设与个人习惯不进插件（CHARTER.md §9）。

B1 只引用 §6.2 的定案，不写死方案；人定了 §14.2 之后，§6.2 由第 7 步改写，B1 的文字不用跟着改。

### 6.4 与现有验收、非目标的对应

| 现有条目（`hourness`） | 去处 |
| --- | --- |
| 验收「无损」 | A1 |
| 验收「治顽疾」：工具 schema 负担 | A2 |
| 验收「治顽疾」：上下文膨胀 | A2（压缩镜像）与 B2（状态在图上） |
| 验收「治顽疾」：记忆陈旧、目标漂移与计划过时 | B2 |
| 验收「自由度」 | A3、A4 与 B4 |
| 验收「调校」 | B3 |
| 验收「工程美学」 | A5、B5（引用改为 CHARTER.md §7） |
| 非目标「不替用户做主」 | A、B 各一条（引用改为 §6） |
| 非目标「不依赖反向代理」 | A、B 各一条 |
| 非目标「不设积分与轮次预算」 | B |
| 非目标「人设与个人习惯不进插件」 | A、B 各一条（引用改为 §9） |
| （新） | A「不承担编排」、B「不含任何模型的方言」：两个包的边界 |

### 6.5 落图与文档（第 8 步，人定稿之后）

- 人在面板里改，或 LLM 带人的原话（`relay`）执行：编辑 `hourness` 的标题、正文、验收、非目标；提议并批准目标 `glm-house`；`bottom`、`q-old-folder` 改 `parent`；`m6` 按人定的处理。改目标与开新分支属于决策分级第 1 类与计划外变更（ORCHESTRATION.md §2.7、§2.9.1），只能这样做。
- 同一个提交改 CHARTER.md §3（目标分两组）、§5（分层表加包名）、§9（用户级目录两包共用）、§11，README.md 首段，`ui/src/graph/model.ts` 的面板标题（§6.1），并重新出图。

## 7. 迁移与交付

### 7.0 前置与并行

- m1-parity 合入 main 之后才开工（`split` 在图上依赖 `m1-parity`）：已满足，m1-parity 在 `a9f12e1` 合入，本设计对照的就是合入后的 main（§10）。
- 开始条件只有一条规则：第 0–2 步现在就能开始；第 3–6 步与第 8 步改的是 m8-ui-audit 也在改的文件，等 m8-ui-audit 的界面改动合入 main 之后再做。按 m8-ui-audit 的修复计划（`.agents/tasks/ui-audit/findings.md` §7 的 13 个提交），重叠的是：`src/ui/index.ts`（F-20：`/hourness` 的描述与用法；第 3、4、5 步）、`ui/src/channel.js`（F-02–F-05、F-18、F-33、F-34、V-03；第 4、6 步）、`locale/*.json`、`ui/package.json`、根 `cordis.patch.yml` 与 `ui/cordis.patch.yml`（F-35、V-01；第 5、6 步）、`ui/src/graph/**` 与 `ui/src/client.tsx`（第 6 步）、`ui/src/graph/model.ts`（第 8 步）、`docs/DESIGN.md` §2.2 与 §2.5、`docs/HANDOFF.md`（F-37；第 4、5 步的文档）。编排者在 `split` 节点上批注这条规则，不加指向 `m8-ui-audit` 的 `depends` 边（理由见 §12）。
- 第 1、2 步碰到的文件里，属于 m8-ui-audit 节点范围（「宿主侧会显示到界面上的文字」）的有：guard 的健康说明（`src/guard/index.ts`:107 `outOfScopeHealth`、:137 `guardHealth`）与纠偏文案（`src/guard/rules.ts`:115、126），方言的健康说明（`src/glm-prompt/index.ts`:168–173 `dialectHealth`），通知包装 `wrapSystemReminder` 与每步 notice 接缝（`src/toolsearch/zcode-text.ts`:160–167、`src/glm-prompt/step-notice.ts`）。m8-ui-audit 的修复计划不改这些文字（F-21 通知摘要、F-36 健康表的 Markdown、F-41 工具行都列为不改），所以第 0–2 步可以与它并行。规则：如果 m8-ui-audit 先合入并改了其中任何一处，第 1、2 步 rebase 后按合入后的文字重钉 `tests/guard-audit.spec.ts` 的逐字断言（「C 上的纠偏与声明与今天逐字相同」改为与 rebase 后的 main 逐字相同），其余不变。第 0 步改的 `scripts/sandbox.mjs`、`scripts/probe/run-probe.mjs` 也是 m8-ui-audit 第 11 个提交（V-01）要跑、可能要改期望的文件，同样按 rebase 处理。
- 第 5 步开工前读 main 上的 patch：行名仍是路径形式（`./dist/...`、`./index.js`）就按本设计做；V-01 已把行名改成包说明符就停下交人（§14.7）。
- `split` 的合入排在 m1-parity 的批次 L4（`m1-11`）之后，一次重启不同时带两批布局或行为变化。m8-ui-audit 的修复本来就排在 `m1-11` 之后，按上一条的顺序这一点自然成立。
- 从 main 建分支 `split`，工作树 `.worktrees/split`，依赖按 m1-parity 工作树的做法在工作树里自备 `node_modules`。分支合入之前 main 不受影响。主检出是桌面版与 glmsandbox 的实际加载源（junction）：主检出上的改动在桌面版下次重启时生效，或者更早，在下一次 profile 写入时生效（F17）。

### 7.1 步骤

每步一个提交，提交信息带节点 id `split`；文档与代码同一提交（AGENTS.md）。门禁一列里「全」指 `npm run build`、`npm run preflight`、`npm test`；「探针」指在 worktree 上跑 `npm run probe`（第 0 步起用运行目录下生成的 profile，§7.3）。

| 步 | 内容 | 门禁 | 开始条件 | 回滚 |
| --- | --- | --- | --- | --- |
| 0 | 沙盒在运行目录下生成 DSH home 与 profile（`probe-full`，此时就是今天的单包）；探针默认用它测被测检出；探针守卫改为结构比对（新增 `scripts/profile-shape.mjs` 与它的 L2 用例 `tests/profile-shape.spec.ts`，后者加进 `package.json` 的测试列表）；文档写入 F17、F18 与新的合入纪律 | 全（含 `tests/profile-shape.spec.ts`）；探针（现有场景在 `probe-full` 上全部通过；生成 profile 的 `cordis.yml` 已被启动器重写，`~/.dsh/profiles/` 下没有 `probe-full` 等名字，即 U1、U2 成立） | 无（m1-parity 已合入） | 撤销提交；沙盒退回 glmsandbox |
| 1 | 公共库收口：X1–X4；新镜像文件 `src/shared/zcode-notice.ts` 加进 `MIRROR_FILES`；逐字门禁的导入规则；`graph-service.ts` 迁回 `src/graph/service.ts`；`installStepNotice` 的 `row` 必填；`scripts/packages.mjs`（先只有各包的源码目录，编排层写 `ui`）、ESLint 边界规则、preflight 的表自检与 `tests/preflight.spec.ts`（只含表自检） | 全；探针；提交信息写明逐字门禁前后的条目数（少 1）与受检行数（相同，§7.4），以及边界规则的违规演示结果（在未提交的改动上写一处跨包导入，看到 lint 失败后还原，演示代码不进提交，同 DEVELOPMENT.md §10 的 gitleaks 演示） | 同上 | 撤销 |
| 2 | 方言服务与工具名换算（X6、X7、X10）：`tool-names.ts`、`dialect.ts`（`ZCODE_ALIAS_NATIVES`、`toNativeTool`）、`nativeOf`、`faceName`、`claims`；规则接口加 `face`；规则表只留原生名；`glm:memory` 按 `next()` 返回的工具出现；拦截范围不变（§4.2.2、§4.7、§4.8） | 全；探针（新场景 `glm-no-dialect`） | 第 1 步 | 撤销 |
| 3 | 计价服务（X5）：`credits.ts` 迁到 `src/glm-llm/`，`glm-login` 提供，面板读取；标定与探针改从 `dist/glm-llm/credits.js` 导入 | 全；探针 | m8-ui-audit 的界面改动合入 | 撤销 |
| 4 | 行健康分组与 `/hourness-status`（X9、X11） | 全；探针（`/hourness-status` 与新表格式） | 第 3 步 | 撤销 |
| 5 | 宿主包布局：两个包的清单、patch、tsconfig；根改伞包；`src/ui` → `src/report`；构建脚本与 `scripts/clean-dist.mjs`；preflight（宿主部分；`ui/` 仍按今天的单行客户端包检查，固定行 id 是今天的 12 个）；`knip.js` 与 `tsconfig.knip.json`；ESLint 忽略项加 `packages/*/dist/`（保留 `'dist/'` 与 `'ui/client.js'`），jscpd 与 `.gitignore` 不变（§7.4）；探针、标定与探针 provider 的导入改到 `packages/*/dist/`；探针加「只装 GLM 包」「只装编排层包」两种组合与新场景；worktree 上本步构建之后删除陈旧的根 `dist/`（§3.1）。客户端仍是今天的 `ui/` 单包 | 全；探针（三种组合）；knip 没有新发现（U7） | 第 4 步；main 上的行名仍是路径形式（§7.0、§14.7） | 撤销 |
| 6 | UI 拆分：两个客户端包、`ui/` 改占位、两个入口、构建两份产物、preflight 的客户端与占位检查（固定行 id 加 `glm-hourness/glm-ui`，共 13 个）、`glm-hourness/glm-ui` 默认禁用；ESLint 忽略项加 `packages/*/ui/client.js`、`.gitignore` 加 `/packages/*/ui/client.js`、`knip.js` 的 `ignore` 加 `packages/*/ui/client.js`，三处都保留根 `ui/client.js` 的条目；探针挂 client-modules 覆盖行（U3）；worktree 上本步构建之后删除陈旧的根 `ui/client.js` | 全；探针（三种组合，加 client-modules 检查） | 第 5 步 | 撤销 |
| 7 | guard 在方言未接管路由上的行为，按人定的方案（§4.2.4） | 全；探针（按方案改 `non-glm-guard`、`glm-no-dialect`、`hourness-only` 的期望） | 人定 §14.2 | 撤销 |
| 8 | 目标与 CHARTER 按人定的文字；面板标题列出全部未关闭的目标（§6.1、§6.5） | 全 | 人定 §14.1；m8-ui-audit 合入 | 撤销 |
| 合入 | 见下面的合入顺序 | 全；探针 | 第 0–6 步完成 | 见下 |
| L4 | 桌面版批次 L4 两轮（§7.6） | 无 | 合入 | 同合入的回滚 |

第 7、8 步依赖人的决定。到合入时还没有决定，就不带它们合入：第 7 步缺席时行为与今天相同（§4.2.3），第 8 步缺席时目标不变。之后在 main 上各自补一个提交，按同样的合入顺序做；第 7 步照样先跑探针。`split` 在两步都完成、验收按 §14.3 定下的文字都满足后才关。

合入顺序（每次改变 bundle 布局或启用新行的合入都照此做）：

1. 编排者在对话里向人申请桌面时段（`risk-shared-desktop`），写明时长；这段时间里没有别的运行用桌面版，也不跑标定（glmsandbox 经 junction 读主检出）。
2. `node scripts/profile-shape.mjs snapshot desktop .llm/l4-split/desktop-shape.json` 与 `node scripts/profile-shape.mjs snapshot glmsandbox .llm/l4-split/glmsandbox-shape.json`：只读，记下每条覆盖项的 id、键名与摘要（`.llm/` 不入库）。本项目的覆盖项带 `name` 时停下交人（§3.7、§14.6）。
3. 人关闭桌面版。从这里到第 6 项结束不操作桌面版。
4. `split` rebase 到 main，在 worktree 上跑全量门禁与探针；本设计的文件清单按合入后的 main 重核一遍。
5. 合入 main，推送 `origin/main`；主检出跑 `npm run build`、`npm run preflight`、`npm test` 三道（AGENTS.md 强制流程第 2 条）。主检出上陈旧的根 `dist/` 与 `ui/client.js` 这时还在，由保留的忽略项排除（§3.1），三道照常通过。
6. 启动桌面版，即 L4 第一轮（§7.6）。
7. L4 第一轮通过后，删除主检出根目录已无引用的 `dist/` 与 `ui/client.js`（不入库，新布局不再生成它们）；再提交一个改动，去掉只为它们保留的忽略项：`eslint.config.js` 的 `'dist/'` 与 `'ui/client.js'`、`.gitignore` 的 `/ui/client.js`、`knip.js` 的 `ui/client.js`、`.jscpd.json` 的 `**/ui/client.js`（jscpd 的 `path` 是 `src`、`tests`、`scripts`、`ui`，不含 `packages`，子包产物本来就不在扫描范围里，这一项删除后不再匹配任何文件）。这个提交跑三道门禁，推送。

回滚：关闭桌面版；在 main 上用 `git revert` 撤销 `split` 的提交（快进合入时撤销整段提交，合并提交时用 `-m 1`），推送，不强推；`npm run build`（旧布局重新写根 `dist/`）；启动桌面版；`node scripts/profile-shape.mjs compare desktop .llm/l4-split/desktop-shape.json` 核对 profile 没有变。根 `dist/` 在第一轮通过之前一直保留，所以第一轮失败时的回滚只多一次构建。profile 没有动过，不用恢复。

### 7.2 测试改动（L2）

- 导入路径：随第 1、3、5 步机械修改。
- 新增 `tests/profile-shape.spec.ts`（第 0 步，加进 `package.json` 的测试列表）：`scripts/profile-shape.mjs` 的 `profileShape` 与 `compareShapes` 用字符串与临时目录夹具测：按行首 `- ` 切块；去掉行尾空白与整行注释、标量去掉成对引号后的规整；嵌套键的键名路径；`compareShapes` 的每类差异（bundles 与 dependencies 的增删与顺序、条目增删、键名变化、摘要变化）；夹具里放一个可辨认的假值，断言命令行输出与快照文件都不含它；profile 名不合 `[A-Za-z0-9_-]+` 时退出码 2。从第 0 步起探针守卫的退出码靠它判定，所以测试与它同一步上线。
- 新增 `tests/contracts.spec.ts`（第 2 步建，第 3 步扩）：工具名契约两侧（§2.6）；方言服务由 `glm-prompt` 提供，guard、影子兜底、图文件门禁读取，覆盖有服务、没有服务、形状不对、`claims` 对装失败的 agent 为假；`ZCODE_ALIAS_NATIVES`、`aliasSpecs`（加 `Read`、`TodoWrite`）、`nativeOf`、`faceName` 四者一致（§4.7）；没有服务时 `toNativeTool` 对表里每个别名的结果与有服务时相同；计价服务由 `glm-login` 提供、报告行读取，覆盖有服务、没有服务、形状不对、`charged` 抛错。
- 新增 `tests/check-verbatim.spec.ts`（第 1 步）：`scripts/check-verbatim.mjs` 的导入块切分与导入规则改为导出的纯函数，脚本的主体只在直接运行时执行。用例：导入块里值导入来自镜像文件放行、来自非镜像文件失败；`import type` 来自 `src/shared/` 放行、来自别处失败；多行导入失败；导入块之后再出现导入语句失败；导入块的行不进逐字条目；模板字面量里以 `import ` 开头的原文行仍是受检条目；形如 `src/glm-prompt/zcode-tool-text.ts`:340 的 `export const X = "… from the user's profile."` 仍是受检条目，不被当成再导出。
- 新增 `tests/preflight.spec.ts`（第 1 步建，只含表自检；第 5 步扩宿主布局，第 6 步扩客户端）：preflight 的检查改为导出的纯函数（`scripts/preflight-bundle.mjs` 仍是入口），在临时目录里搭夹具：伞包通过；patch 列表含 `..` 失败；行名含 `..` 失败；客户端包有两行失败；子包 `dist` 的 `.js` 里有不在 peer 里的裸导入失败；`.d.ts` 里有 `@deepseek-ai/dsh-llm` 之类的类型导入时通过；宿主包或客户端包的 `package.json` 缺 `type: module` 失败；产物顶层出现表外目录失败；包 tsconfig 的 `include` 与表不一致失败；`HEALTH_PACKAGES` 与表不一致失败；占位包含行失败；伞包组合与子包组合不一致失败；行 id 不在表里失败；表自身有重复目录或重复 id 失败；`src/` 下有未登记的顶层目录失败；包源码里有与另一个包顶层目录同名的子目录失败；第 6 步起 `ui/src/` 下有不属于任何客户端包的文件失败。`profile-shape` 的用例不放在这里。
- 修改：`credits.spec.ts` 只留 GLM 积分公式，面板用例移到 `hourness.spec.ts` 并分有、无计价服务两种（第 3 步）；`health.spec.ts` 覆盖分组表格与 `/hourness-status`，以及全表不含「已登录（套餐」、新增文字不含「未登录」（§2.5），m1-parity 加的凭证用例保留（第 4 步）；`guard-audit.spec.ts` 覆盖换算与文案（C 上的纠偏文本与今天逐字相同，N 上用原生名，范围不变，没有方言服务时照样拦截，§4.2.2）（第 2 步），第 7 步按方案改（G2 见 §4.2.4）；`graph-guard.spec.ts` 覆盖经换算的 `Write` 与 `Bash`，有、无方言服务各一遍（第 2 步）；`graph-tools.spec.ts` 的常驻用例改读契约（第 2 步），patch 行的断言改读 `packages/hourness/cordis.patch.yml`（第 5 步）；`glm-prompt.spec.ts` 覆盖 `glm:memory` 按 `next()` 返回的工具出现与消失（§4.8，第 2 步）；`workflow.spec.ts` 按方案覆盖影子记录的分组（第 7 步）；`graph-panel-model.spec.ts` 覆盖面板标题（第 8 步）。

### 7.3 探针改动（L3）

- 生成的 profile（第 0 步，`scripts/sandbox.mjs`）：DSH home 为 `<运行目录>/dsh-root`，profile 目录 `profiles/<名字>/` 下写 `package.json`（`dsh.profile.bundles` 为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless` 加被测包，`dependencies` 为对应的 `link:`）、内容为 `[]` 的 `cordis.yml` 与 `cordis.patch.yml`，`node_modules/<包名>` 建 junction 指向被测检出里的包目录；启动时传 `DSH_HOME` 与 `--profile <名字>`（U1、U2）。名字固定为 `probe-full`、`probe-glm`、`probe-hourness`，满足 DSH 对 profile 名的限制（app-boot `resolveProfileDir`）。包名与目录从 `scripts/packages.mjs` 读。
- 组合：`probe-full` 列伞包与占位包（同桌面版）；`probe-glm` 只列 GLM 包；`probe-hourness` 只列编排层包。被测检出是探针脚本所在的检出，主检出与 worktree 都能直接测，不再需要 `docs/DEVELOPMENT.md` §3 里改 junction 的临时 profile。`DSH_SANDBOX_PROFILE` 保留给标定与手工运行。
- 守卫（第 0 步）：
  - 运行前：`~/.dsh/profiles/` 下已有 `probe-full`、`probe-glm`、`probe-hourness`，或已有 `glmh-split-` 开头的条目（上次退路模式的运行没删干净）时退出码 2，列出名字，提示先查明来历再删除；对 `desktop` 与 `glmsandbox` 各取一次 `profileShape`。
  - 运行后：`~/.dsh/profiles/` 下出现了 `probe-full`、`probe-glm` 或 `probe-hourness`，说明 DSH 没有按 `DSH_HOME` 找 profile（U1 不成立），退出码 1；真实用量流水 `~/.dsh/glm-hourness/audit/usage.jsonl` 变了（现有检查），退出码 1。
  - 退路模式（U1 不成立时，`DSH_PROBE_PROFILES=home`）：不设 `DSH_HOME`，在 `~/.dsh/profiles/` 下建 `glmh-split-<运行时间戳>-full`、`-glm`、`-hourness`，名字登记在运行目录的 `profiles.json` 里，结束时（含失败退出）删除。守卫在这种模式下只放行登记过的名字：结束后它们仍在，或出现了未登记的 `glmh-split-*`、`probe-*` 条目，退出码 1。`~/.dsh/profiles/` 下其他条目的增删（别的运行建的临时 profile）只列出，不影响退出码。用量流水的检查不变，这种模式下数据目录行同样指向场景目录。
  - 两个 profile 中与本项目相关的结构（`dsh.profile.bundles`、`dependencies`、id 以 `glm-hourness/` 开头的覆盖项）变了：退出码 2，结论作废，列出变化的 id 与类别后重跑；重跑仍出现，按探针缺陷处理。这类变化可能来自探针写错位置，也可能来自人同时在设置里改了本项目的行。
  - 其余条目变了（多半是桌面版自己写的，例如模型菜单改 `agent-default-model`，或 `package.json` 的 `dsh.desktopNext*`）：只在报告里列出 id，不影响退出码。
- `scripts/profile-shape.mjs`（第 0 步新增，只读）：`profileShape(dir)` 读 `package.json` 的 `dsh.profile.bundles` 与 `dependencies`，把 `cordis.patch.yml` 按顶层条目切块（以行首的 `- ` 开始一条），每条取 `id` 与键名路径，并对规整后的条目文本求 SHA-256（规整：去掉行尾空白与整行注释，标量值去掉成对引号；不解析 `!!js`，不需要 YAML 依赖）；`compareShapes(before, after)` 返回差异列表（bundles 与 dependencies 的增删与顺序变化，按 id 的条目增删、键名变化、摘要变化）。命令行 `snapshot <profile> <文件>` 与 `compare <profile> <文件>`；profile 名只接受 `[A-Za-z0-9_-]+`，目录是 `$DSH_HOME/profiles/<名字>`（未设置时 `~/.dsh`）。输出与快照文件只含 id、键名、包名、摘要与差异类别，不含任何值。退出码 0 无差异、1 有差异、2 读不出 profile。
- 导入路径：`run-probe.mjs`:31–38、`probe-llm.mjs`:28–30、`probe-dispatch.mjs`:36 第 5 步改到两个包的 `dist/`（`probe-dispatch.mjs` 的 `createUserNotice` 取编排层包的 `dist/shared/dsh-min.js`）。worktree 上同一步删除陈旧的根 `dist/`，漏改的导入直接报错（§3.1）。`HEALTH_ROWS` 改为按包分组的表；状态解析适配新的「包」列（第 4 步）。
- deviceMid：m1-parity 的 `a9f12e1` 让通道在请求路径上生成并写回 ZCode 的 deviceMid（`src/glm-llm/zcode.ts`:394 的 `ensureCliDeviceMid`，写 `<ZCODE_DATA_BASE_DIR 或用户目录>/.zcode/v2/telemetry-state.json`，`src/glm-llm/device-mid.ts`:24、35）。生成的探针环境不启用 `glm-hourness/glm-llm`（它在 bundle 里默认禁用，探针用自己的 provider，`probe-llm.mjs`:28–30 只用通道的编码器），所以探针不写 `~/.zcode`。以后若有探针场景启用通道行，在启动环境里把 `ZCODE_DATA_BASE_DIR` 设到运行目录。标定启用通道行，会写 `~/.zcode`，这是 question-9 选 A 的既定行为，与拆包无关。
- 新场景：
  - `glm-no-dialect`（第 2 步，`probe-full`，覆盖层禁用 `glm-prompt`，模型 `glm-5.3`）：工具面里没有 `Bash`，`pwsh` 的 `Set-Content` 照旧被 file-tools-only 拦下，纠偏写的是 `read`、`write`、`edit`；系统提示词的 `glm:guard` 一节用原生工具名。第 7 步按方案改期望（G2：放行，违规流水多一条 `scope: other` 的影子记录，没有 `glm:guard` 一节）。
  - `glm-only`（第 5 步，`probe-glm`，模型 `glm-5.3`）：ZCode 身份与别名面、检索控制工具在；工具面里没有 `graph_*` 与 `memory_*`；`glm:memory` 节不在；`/glm-status` 的表里编排层包只占一行「未加载」；探针时钟行下第一个请求带一条高峰提醒；场景目录里不出现用量流水（memory 行不在）。
  - `hourness-only`（第 5 步，`probe-hourness`，模型 `deepseek-probe`）：工具面里 `graph_*`、`memory_*` 与原生 `write`、`pwsh` 在，没有 `Write`、`Bash`、`LocalToolSearch`；`graph_focus` 之后的请求以投影结尾；`write` 写图目录副本被 graph-files-only 拒绝并记进违规流水；`pwsh` 的 `Set-Content` 在第 7 步之前放行且无记录，之后按方案（G2：放行并留一条 `scope: other` 的影子记录）；系统提示词里没有规则声明；`/hourness-status` 的表里 GLM 包只占一行「未加载」；`/hourness` 的面板按 token 列。
  - 可选 `duplicate-listing`（第 5 步，profile 同时列伞包与编排层包）：无激活错误，图工具只注册一份（U9）。
- client-modules 检查（第 6 步，U3）：在 `probe-full` 组合上，覆盖层插一行 `name: '@deepseek-ai/dsh-client-modules'`，并启用 `glm-hourness/glm-ui`；场景结束前经探针 provider 读 `ctx.get('clientModules')?.graph().entries`（服务名见 client-modules:538），核对两个客户端包都在、没有组合错误。
- 第 7 步：`non-glm-guard` 场景按方案改期望（G2：文件写出，且各有一条带路由 `glm-probe/deepseek-probe`、`scope: other` 的影子记录）。

### 7.4 门禁与构建改动

- 目录表 `scripts/packages.mjs`（§2.7）：第 1 步建（各包的 `src` 目录，编排层写 `ui`，供 ESLint 与表自检用），第 5 步补包目录与行并把 `ui` 改为 `report`，第 6 步补客户端包。
- `npm run build`：`node scripts/clean-dist.mjs && tsc -p tsconfig.json && tsc -p packages/glm/tsconfig.json && tsc -p packages/hourness/tsconfig.json && tsc -p ui/tsconfig.json && node scripts/build-ui.mjs`。`clean-dist.mjs` 按表删各包的 `dist/`（tsc 不删陈旧产物，删掉的模块不能留在可加载的位置）。根 `tsconfig.json` 加 `noEmit: true`、去掉 `outDir`，保留 `rootDir: "src"` 与其余选项，保证每个源文件都过类型检查，ESLint 也继续用它；`declaration` 与 `noEmit` 同时打开在 TypeScript 5.9.3 下不报错（第一轮已用临时配置试过）。包的 tsconfig 继承根配置，设 `rootDir` `../../src`、`outDir` `./dist`、`noEmit` false、`include` 为表里本包的目录（`../../src/<目录>`）；tsc 顺着导入把用到的公共库文件编进 `dist/shared/`。
- `npm run preflight`（`scripts/preflight-bundle.mjs`，检查改为导出函数）：
  1. 表自检：§2.7 的四条（不重复与归属；`src/` 下每个顶层目录都有归属；第 6 步起 `ui/src/` 下每个文件都有归属；没有会让边界 `regex` 误报的同名目录或文件）。第 1 步建表时就加进 preflight（preflight 今天就是 `npm test` 的第一道），只依赖表与 `src/`、`ui/src/` 的目录结构，不依赖第 5 步的包布局。
  2. 列出仓库里的 bundle 清单：根、`ui/`、`packages/glm`、`packages/hourness`；`dsh.bundle.patch` 是字符串或字符串数组，每个路径以 `./` 开头、不含 `..`、落在清单目录之内、文件存在（C1）。
  3. 每个 patch 文件里 insert 行的 `id` 与 `name`：`name` 以 `./` 开头、不含 `..`，以 patch 文件所在目录为基准存在（F5、C1）；行 id 与模块与表一致。
  4. 组合：伞包的行集合等于两个子包行集合之并，同 id 同 name；占位包没有行；全部行 id 恰好是表里的 13 个，组合内不重复。
  5. 产物与配置：导出的路径存在；两个包 `dist` 的顶层目录在表允许的范围内；包 tsconfig 的 `include` 与表一致；产物 `dist/shared/health.js` 的 `HEALTH_PACKAGES` 与表一致；两个宿主包与两个客户端包的 `package.json` 都写 `type: module`（`dist` 里的行模块与 `packages/*/ui/index.js` 都是 ESM，Node 按最近一级 `package.json` 的 `type` 判定模块格式；今天的行模块靠根 `package.json` 的 `type`，拆包后最近一级是子包清单）。
  6. C2：每个包 `dist` 下 `.js` 文件里的运行时裸导入（静态 `import`、`export … from` 与 `import()` 的包说明符，`node:` 内置模块除外）都在该包的 `peerDependencies` 里。`.d.ts` 不计：其中的类型导入运行时不加载，今天的产物里就有 `dist/shared/dsh-min.d.ts`:1 的 `@deepseek-ai/dsh-llm`（来自 `src/shared/dsh-min.ts`:16 的 `GenerateOptions`，用于类型级契约检查）、`dist/shared/lm-min.d.ts` 的 `@deepseek-ai/dsh-attachment`（`src/shared/lm-min.ts`:8）、`dist/shared/schemastery.d.ts` 的 `@standard-schema/spec`（`src/shared/schemastery.ts`:4）与 `dist/glm-llm/zcode.d.ts` 的两项；计入的话 preflight 要么失败，要么逼出 `@deepseek-ai/dsh*` peer，触发 F7 的兼容性判定。包 tsconfig 继承的 `declaration: true` 不改。今天 `.js` 里唯一的运行时裸导入是 `@deepseek-ai/cosmokit`（`dist/shared/schemastery.js`:2–3）。
  7. 客户端：§5.5。
- `npm run check:verbatim`：
  1. `MIRROR_FILES` 加 `src/shared/zcode-notice.ts`（m1-parity 合入后清单为 `zcode-text.ts`、`zcode-tool-text.ts`、`zcode-wire.ts` 与它）。
  2. 导入块：镜像文件开头、第一个既不是单行导入语句（`import …`、`export … from …`）也不是注释或空行的位置之前，是这个文件的导入块。切字面量之前只去掉导入块里的语句行，导入块之后的内容一个字符都不去：模块路径从来不是逐字声明，而导入块之后可能是原文。按行去掉全文的「导入语句行」会误删原文：`literalChunks` 跨行扫描模板字面量（`scripts/check-verbatim.mjs`:62–101），多行的 ZCode 原文模板里以 `import ` 开头的一行会被当成语句删掉；`src/glm-prompt/zcode-tool-text.ts`:340 的 `export const BASH_WORKDIR_LINE = "… initialized from the user's profile."` 按行匹配 `export … from` 也会被当成再导出删掉，而它是受检的原文。
  3. 导入块之后不得再有导入语句：扫描器在切字面量的同一遍里产出一份代码文本（注释去掉，字面量内容换成空白），在这份文本里找语句开头的 `import` 与带 `from` 子句的 `export`，找到就失败。字面量里的文字因此不会被当成语句。
  4. 导入块里的语句（`import` 与 `export … from` 一样处理）：值导入只许来自 `MIRROR_FILES` 里的文件；`import type` 只许来自 `src/shared/`；写成多行的导入会让导入块在它的第一行结束，随后被第 3 条判为失败。今天 `zcode-tool-text.ts` 的 `import type { JsonRecord }`（:25，迁移后来自 `../shared/json.ts`）合规，`zcode-wire.ts` 与 `zcode-text.ts` 今天没有导入，`zcode-text.ts` 迁移后只从 `../shared/zcode-notice.ts` 导入值。
  5. 通过信息加印受检行数（不短于 `MIN_LINE` 的行），便于比较前后。
  覆盖面：离开 `zcode-text.ts` 的 8 段字面量（`'DeferredToolCall'`、正则源串与 `'gi'`、`wrapSystemReminder` 里的 5 段）原样出现在 `zcode-notice.ts`，照旧逐段检查，受检行数不变。门禁报告的条目数少 1：`zcode-tool-text.ts` 的模块路径 `'./json.ts'` 今天也算一个条目，它不足 13 个字符，从来没有一行受检，去掉导入行后不再计入。第 1 步的提交信息写明前后的条目数与受检行数。这一改不放宽任何文本的检查，不需要按 DEVELOPMENT.md §10 申请。
- `npm run lint`：
  - ESLint：加边界规则（§2.7，按表生成，`regex` 模式，F19，第 1 步起）；`globalIgnores` 第 5 步加 `packages/*/dist/`，第 6 步加 `packages/*/ui/client.js`，今天的 `'dist/'` 与 `'ui/client.js'`（`eslint.config.js`:16、18）保留到合入顺序第 7 项：主检出上陈旧的根产物在那之前还在，去掉忽略项 ESLint 会对打包产物报 `no-undef`（`window`、`require`）；`packages/*/ui/index.js` 与 `knip.js` 用 Node 全局名。
  - knip：`knip.jsonc` 换成 `knip.js`（第 5 步），从表生成入口：11 个宿主行的源码入口、两个客户端入口、两个 `packages/*/ui/index.js`，加上现有的探针与标定入口；`project` 加 `packages/*/ui/index.js`（第 6 步去掉已删的 `ui/index.js`）；`ignore` 保留 `ui/client.js`，第 6 步加 `packages/*/ui/client.js`。`scripts/check-lint.mjs` 给 knip 传 `--tsConfig tsconfig.knip.json`；`tsconfig.knip.json` 为 `extends: "./tsconfig.json"` 加 `references` 指向 `packages/glm` 与 `packages/hourness`，knip 由此取得 `packages/glm/dist` → `src`、`packages/hourness/dist` → `src` 两组映射（F20）；它不进任何 `tsc -p`，因为 tsc 会拒绝非 composite 的引用（F21）。基线只改键、不扩大；出现新发现就停下交人（U7、§14.6），按 `scripts/check-lint.mjs` 的棘轮与 ORCHESTRATION.md §7.6，接受新发现是人的决定。
  - jscpd：`.jscpd.json` 第 0–6 步都不动。它的 `path` 是 `src`、`tests`、`scripts`、`ui`（:2），不含 `packages`，子包产物不在扫描范围里；`ignore` 的 `**/ui/client.js`（:4）排除的是根 `ui/client.js`，这个陈旧产物打包了 `ui/src/channel.js` 与 `src/graph/live.ts` 等源码，不排除就会与源码形成新克隆，`scripts/check-lint.mjs` 的 jscpd 判为失败。合入顺序第 7 项删掉根产物之后，这一项不再匹配任何文件，随同一提交去掉；`**/src/shared/schemastery.ts` 不动。
- `.gitignore`：第 6 步加 `/packages/*/ui/client.js`，`/ui/client.js`（:10）保留到合入顺序第 7 项（陈旧产物在那之前仍在主检出上，worktree 上到第 6 步才删；去掉会显示为未跟踪文件，有误提交的风险）；`dist/`（:2）不带前导斜杠，已覆盖 `packages/*/dist/`，不动。
- 合入顺序第 7 项的清理提交：去掉 `eslint.config.js` 的 `'dist/'` 与 `'ui/client.js'`、`.gitignore` 的 `/ui/client.js`、`knip.js` 的 `ui/client.js`、`.jscpd.json` 的 `**/ui/client.js`；门禁三道。

### 7.5 文档改动

| 步 | 文档 |
| --- | --- |
| 0 | DEVELOPMENT.md §3（生成的 profile、三种组合、worktree 直接可测、结构比对的守卫）、§1.1 与 §5 第 4 条（合入并 build 后，运行中的桌面版在下一次 profile 写入时就按磁盘上的 bundle patch 重组；改变布局的合入先关桌面版）；FACTS.md §3 补 F17、F18 |
| 1 | DESIGN.md §2.4a（适配层文件清单）、§5.5、§5.7（文件路径）、§5.9（新镜像文件与导入规则）、§6（注入工具在公共库）、§8；ORCHESTRATION.md §2.5、§2.7（文件路径）；DEVELOPMENT.md §10（边界规则、逐字门禁的导入规则）、§12（图行文件清单） |
| 2 | ORCHESTRATION.md §6.1（规则只认原生名；调用名先经方言服务、再经公共库的静态别名表换算；配置追加的规则收到原生名）、§6.2 的实现段（范围不变，两处模型族判定的位置）、§6.5.2（兜底按原生名记文件工具的目标）；DESIGN.md §5.2、§5.3 ⑧（`glm:memory` 按 `next()` 返回的工具出现）、§5.4（别名表在公共库有一份静态副本，契约测试钉住两边一致） |
| 3 | ORCHESTRATION.md §11.2、§11.3、§11.4；DESIGN.md §2.2 中 `glm-login` 的说明 |
| 4 | DESIGN.md §2.5；README.md |
| 5 | DESIGN.md §2.1–§2.3 重写、§2.2 表加「包」列、§7 降级表加「包缺席」两行；ORCHESTRATION.md §3.5（档位到模型的映射归通道包，没有映射时继承父路由，§4.5）；DEVELOPMENT.md §2、§5 第 6 条、§12；HANDOFF.md §1–§3（含「拉取之后先关桌面版、build、再启动」）；FACTS.md §3 补 F1–F13、F19–F23；AGENTS.md 首行；README.md；ROADMAP.md §2 注明 M3 起在 `dsh-hourness` 里做 |
| 6 | DESIGN.md §2.3（客户端包）；ORCHESTRATION.md §2.10（落点、打包）、§13（约束）；DEVELOPMENT.md §5 第 6 条 |
| 7 | ORCHESTRATION.md §6.2、§6.4、§6.5，按选定的方案 |
| 8 | CHARTER.md §3、§5、§9、§11；README.md 首段 |

DESIGN.md §2.3 原文「仓库不拆分〔定案〕」整条重写为「同仓两包与伞包〔定案 2026-10-28，question-10 选 A〕」，旧文本留在 git 历史里（CHARTER.md §10）。

### 7.6 批次 L4

准备：合入顺序第 1、2 项（申请桌面时段；对桌面与 glmsandbox 的 profile 记结构快照）。

第一轮（合入顺序第 6 项的那次启动）：
1. 启动：桌面版日志与 crash log 没有本项目的新错误；插件管理器列出 `dsh-glm-hourness` 与 `dsh-glm-hourness-ui`，没有告警（U4）。
2. `/glm-status` 与 `/hourness-status`：两包的行都在，状态符合预期。
3. GLM-5.3-Flash 新会话，工作目录是一个临时目录：ZCode 身份与别名面；`LocalToolSearch` 可用；图工具常驻；`graph_focus` 后有投影；`Bash` 的 `Set-Content` 写临时目录被拒，纠偏写的是 `Write`、`Edit`，违规流水有记录；`/hourness` 的面板有积分。
4. DeepSeek 新会话，同样的临时目录：图工具在；`graph_show` 可用；有投影；guard 按 main 上当时的方案核对（第 7 步未合入时 `pwsh` 写文件放行、不记；G2 合入后放行并多一条带 DeepSeek 路由、`scope: other` 的影子记录）；会话日志里系统提示词没有规则声明。
5. 第 3、4 项经模型菜单换模型，会写 profile 并触发一次重载（F17）：日志里没有本项目的新告警。
6. 面板：右侧栏「项目图」由 `dsh-hourness-ui` 提供，四个视图读到本项目的图；之前打开的面板标签恢复（U8）；在一个已完成的节点（例如 `m0`）的详情里批注一条，立刻用 git 还原该节点文件，再在 `split` 上批注「L4 第一轮在 m0 上写过一条测试批注，已用 git 还原」（CHARTER.md §7.1 条款 11）。
7. GLM pill 与设置页不在（`glm-hourness/glm-ui` 未启用），符合预期。
8. `node scripts/profile-shape.mjs compare desktop .llm/l4-split/desktop-shape.json`：`dsh.profile.bundles`、`dependencies` 与五条本项目覆盖项不变；`agent-default-model` 这时允许不同，收尾时再核对。
通过后：合入顺序第 7 项。

第二轮：在 main 上提交一个改动，去掉 `packages/glm/cordis.patch.yml` 里 `glm-hourness/glm-ui` 的 `disabled: true`；按合入顺序关闭桌面版、推送并 build、启动：pill 与设置页出现，经 pill 调 `/glm-status` 正常；没有客户端组合错误；结构比对同第一轮第 8 项。

收尾：经输入框的模型菜单把新会话默认模型换回验证前的值；再跑一次结构比对，这次 `agent-default-model` 也要与快照相同（HANDOFF.md §6 记过这个副作用）。摘要只因写法不同而对不上时（比对只看规整后的文本），由人在设置页核对这一项的 provider、model 与 reasoningEffort 三个值。SHA-256 不再用作验收条件：模型菜单换回之后，文件字节也不保证与原来相同。`split` 带证据（提交号、探针运行目录、L4 记录）关闭。

### 7.7 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 主检出是桌面版与 glmsandbox 的实际加载源；合入并 build 后，运行中的桌面版在下一次 profile 写入时按新布局就地重组（F17） | 合入顺序：先关桌面版，再合入、build、启动；合入窗口内不跑标定；根 `dist/` 保留到 L4 第一轮通过；HANDOFF.md 写明拉取之后先关桌面版、build、再启动 |
| bundle 路径里的 `..` 在 junction 路径上解析错（F4） | preflight C1 |
| 子包脱离本仓库使用时，裸导入找不到安装版（F8） | 子包声明 peer；preflight C2 |
| 客户端组合出错会让 web 启动失败（2026-10-27 事故） | preflight 静态检查；新客户端行默认禁用；L4 分两轮；回滚即撤销提交并重启 |
| 覆盖项因行 id 变化而失配，只有一条 Loader 告警 | 行 id 不改；preflight 按表钉住 13 个 id |
| 带 `name` 的本项目覆盖项因模块路径变化而失配（F18） | 合入前对两个 profile 做只读快照，查到就交人（§3.7） |
| 伞包与子包被同时列出 | F6 下每行只装一次（U9）；preflight 保证两者定义相同；文档写明不要同时列 |
| 运行目录下的 DSH home 不可行（U1、U2） | 第 0 步核实；退回 DEVELOPMENT.md §3 的临时 profile，按 §7.3 的退路模式运行（`glmh-split-` 前缀、登记、结束时删除） |
| 桌面版并发写 profile，让探针或 L4 误判 | 结构比对只看本项目相关部分，其余变化只列出（§7.3、§7.6） |
| knip 对 `packages/*/dist` 导入的映射不成立（U7） | 第 5 步核对；有新发现就停下交人，不扩大基线 |
| 与 m8-ui-audit 冲突 | §7.0 的开始条件与重叠文件清单；第 1、2 步与它的文字有交叠时 rebase 后重钉逐字断言；rebase 时按合入后的 main 重核本设计的文件清单 |
| m8-ui-audit 的 V-01 把行名改成包说明符，与伞包布局冲突（F22） | 第 5 步开工前核对 main 上的行名形式，变了就停下交人；建议 V-01 推迟到 split 合入之后（§14.7） |
| 陈旧的根 `dist/` 掩盖漏改的 `../../dist/...` 导入，探针悄悄加载旧代码 | worktree 上第 5、6 步删除陈旧的根产物；主检出上的陈旧产物不被任何门禁或行读到，只为忘了关桌面版时的旧布局兜底（§3.1） |
| 两份公共库产物带来两份模块实例 | 公共库不持跨行状态，跨包状态只走 cordis 服务；schemastery 的例外与核对项见 §2.3 |
| 方言服务提供失败，或两包版本错开让服务的形状检查失败 | 工具名换算由公共库的静态别名表兜底，拦截与今天相同；形状检查只看用到的三个方法（§8.2）；第 7 步之前可见变化只有 C 上纠偏与声明的用名，`glm-prompt` 行健康 `degraded`；人选 G2 时 C 上的调用按 N 处理，只记影子，`glm-prompt` 与 guard 的行健康都写明（§8.1） |
| 逐字门禁的导入例外被滥用，或误删原文 | 只去掉文件开头导入块里的单行导入语句，之后再出现导入就失败；值导入只许来自镜像文件，`import type` 只许来自 `src/shared/`（§7.4） |
| 探针与 m1-cleanup 并行：m1-cleanup 把仓库 `.llm` 里的用量补拷到真实的 `~/.dsh/glm-hourness/audit/usage.jsonl`，探针守卫会误判 | 编排者把 split 的探针运行排在 m1-cleanup 的补拷之后；误判时退出码 1 的报告写明用量流水变了，按并发重跑 |
| GLM pill 在两轮 L4 之间缺席 | 只在 L4 时段内；人想省一轮时可以决定让新行直接启用 |

## 8. 错误处理、输入校验与不变量

### 8.1 可失败的操作

| 操作 | 失败条件 | 能否恢复 | 调用方得到 | 记录 |
| --- | --- | --- | --- | --- |
| `glm-login` 提供计价服务 | 上下文没有 `provide`；`provide` 抛错（同名服务已在，例如第二份 `glm-login`） | 能 | 激活照常；面板按 token 列 | `console.warn` 一次；激活健康说明写「积分口径未提供：原因」 |
| 报告行读计价服务 | 服务缺席；值的形状不对 | 能 | 按 token 列 | 形状不对时 `console.warn` 一次 |
| `UsagePricing.charged` 抛错 | 提供方缺陷 | 能 | 该条记录计入「无法计价」条数，面板照常输出 | `console.warn` 一次 |
| `glm-prompt` 提供方言服务 | 同计价服务 | 能 | 方言照常改写。guard 一侧：工具名按公共库的静态别名表换算，拦截不变；`claims` 恒假，所以第 7 步之前 C 上的纠偏与 `glm:guard` 声明改用原生工具名；人选 G2 时 C 上的 GLM 调用按 N 处理，只记影子 | `console.warn` 一次；`glm-prompt` 激活健康 `degraded`「方言服务未提供：guard 的纠偏与规则声明用原生工具名」，G2 下加「guard 对 GLM 调用只记影子」 |
| guard、影子兜底、图文件门禁读方言服务 | 缺席；形状不对；`claims`、`nativeOf`、`faceName` 在一次调用里抛错 | 能 | 同上一行：名字按静态表换算、`claims` 为假、取原名；某个方法抛错时只这一次调用按缺席处理 | 形状不对或抛错时 `console.warn` 一次；guard 的会话健康说明写「方言服务不可用：工具名按静态别名表换算，纠偏用原生名」 |
| `/hourness-status` | 带了参数 | 能 | `error`：用法错误，语言与写法同 `/hourness`（§2.5；今天为 `Usage: /hourness-status (no arguments)`） | 不记 |
| 健康视图读取 | 某行的视图缺席 | 能 | 该行「未加载」，整包缺席时并成一行 | 不记 |
| G2 影子记录写入 | 没有项目目录；写失败 | 能 | 调用照常放行 | 每条流水第一次失败在控制台报一次（`rowJournal` 现有行为） |
| `npm run preflight` | 任一检查不过 | 不能（安装门禁） | 退出码 1，列出全部问题 | stderr |
| `npm run check:verbatim` | 逐字不符；镜像文件的导入违反规则 | 不能 | 退出码 1 | stderr |
| `npm run build` | tsc 或 esbuild 报错 | 不能 | 非零退出码 | stderr |
| 探针生成 profile | 建目录或 junction 失败（EPERM 等）；运行前 `~/.dsh/profiles/` 下已有 `probe-full`、`probe-glm`、`probe-hourness` 或 `glmh-split-*` | 不能（环境问题） | 退出码 2 并说明原因；不算探针结论 | stderr |
| 探针守卫 | 运行后 `~/.dsh/profiles/` 下出现 `probe-full`、`probe-glm` 或 `probe-hourness`；退路模式下登记的名字没删掉，或出现未登记的 `glmh-split-*`；真实用量流水变了 | 不能 | 退出码 1 | stderr |
| 探针守卫 | 桌面或 glmsandbox profile 中与本项目相关的结构变了 | 不能 | 退出码 2，结论作废，重跑 | stderr 列出变化的 id 与类别 |
| 探针守卫 | 两个 profile 的其余条目变了 | 能 | 不影响退出码 | 报告里列出 id |
| `scripts/profile-shape.mjs` | profile 名不合规；目录或文件不存在、读不出 | 不能 | 退出码 2 | stderr，只写 id 与路径 |

激活期仍然不抛错（DESIGN.md §7）：上表所有激活期的失败都降级为告警加行健康上报。

### 8.2 外部输入的校验

| 输入 | 规则 | 不满足时 |
| --- | --- | --- |
| `scripts/packages.mjs` | §2.7 的表自检四条：不重复与归属；`src/` 下每个顶层目录都有归属；第 6 步起 `ui/src/` 下每个文件都有归属；没有会让边界 `regex` 误报的同名目录或文件 | preflight 失败 |
| bundle 清单的 `dsh.bundle.patch` | 必填；字符串或字符串数组；每项以 `./` 开头、不含 `..`、文件存在且解析为 YAML 顶层数组 | preflight 失败 |
| patch 里的 insert 行 | `id` 必填，在表里；`name` 必填，以 `./` 开头，不含 `..`，目标文件存在，与表中该行的模块一致 | preflight 失败 |
| 客户端包清单 | `dsh.client.platform` 为 `web`；`inject` 为字符串数组；`exports['./client']` 为字符串且文件已构建 | preflight 失败 |
| 镜像文件的导入 | 只在文件开头的导入块里，单行；值导入来自 `MIRROR_FILES`；`import type` 来自 `src/shared/`；导入块之后没有导入语句 | 逐字门禁失败 |
| 子包与客户端包清单的 `type` | 两个宿主包与两个客户端包为 `module` | preflight 失败 |
| 子包 `dist` 的运行时裸导入 | `.js` 里的包说明符（`node:` 除外）都在本包 `peerDependencies` 里；`.d.ts` 不计 | preflight 失败 |
| cordis 服务值（计价、方言、数据目录、图、行健康） | 读取函数检查形状（与今天的 `dataService`、`graphService` 相同写法），只检查用到的成员是函数，多出的成员不算形状不对，两包版本错开时新增成员不会让旧读取方判为缺席 | 当作缺席，并 `console.warn` 一次 |
| `/hourness-status` 的输入 | 去掉首尾空白后为空 | 返回 `error` 用法 |
| 生成的 profile 名 | 固定名字，不含分隔符，不是 `.`、`..`、`node_modules` | 不会出现（写死） |
| `profile-shape.mjs` 的 profile 名 | `[A-Za-z0-9_-]+` | 退出码 2 |

### 8.3 不变量与所在层

| 不变量 | 负责的层 | 理由 |
| --- | --- | --- |
| 哪个目录、哪一行属于哪个包，只写在 `scripts/packages.mjs` | preflight（核对包 tsconfig、patch、`HEALTH_PACKAGES`）加 ESLint（规则由表生成） | 写在几处就会漂移，漏一处就是「编得进去、规则没管到」 |
| 行 id 恰好是表里的 13 个，组合内不重复 | preflight | profile 覆盖与面板布局按它找行；改名时其余门禁都会静默通过 |
| 两包之间没有导入（含类型导入） | ESLint 规则加 preflight 产物核对 | tsc 对跨包导入不报错 |
| bundle 引用的文件都在 bundle 目录之内 | preflight | F4 |
| 子包的运行时裸导入都在自己的 peer 里 | preflight | F8 |
| 每个客户端包恰好一行 | preflight | F10，违反时 web 启动失败 |
| 伞包组合等于两个子包组合之并 | preflight | 桌面版与单独安装必须是同一批行 |
| 占位包不含行 | preflight | 否则与伞包里的客户端行重复，触发 F10 |
| 镜像文件里每段号称逐字的文本都受检，导入带不进未检查的文本 | 逐字门禁 | DESIGN.md §5.9 |
| 工具名契约等于实际注册 | L2 契约测试 | 字符串契约，静态检查看不见 |
| guard 拦不拦由 guard 行决定 | guard 行 | 方言服务只报告事实（是否接管、名字怎么换），策略留在 guard，没有 GLM 包时依然成立 |
| guard 认得 ZCode 别名不依赖方言服务 | 公共库的 `ZCODE_ALIAS_NATIVES` 加 `toNativeTool`；L2 契约测试钉住它与 `aliasSpecs`、`nativeOf` 一致 | 方言装上与服务提供是两件事，服务缺席时方言照常改写；拦截不能随服务一起掉 |
| 面板只经计价服务计积分 | 报告行 | 编排层不内置任何套餐系数 |
| 公共库不导入包目录，不持跨行状态（schemastery 例外，§2.3） | ESLint 规则加评审 | 两份产物各有实例 |
| 验证不改用户 profile | 探针守卫与 L4 结构比对 | AGENTS.md 第 6 条 |

### 8.4 可测性

契约、两个服务、面板两种模式、guard 的换算与范围、健康分组、影子记录的分组都是纯逻辑或假宿主上的行为，在 L2 测。preflight 与逐字门禁的规则抽成函数后用临时目录与字符串夹具测；`profile-shape.mjs` 的切块与比较用字符串与临时目录夹具测，放在第 0 步与它同时上线的 `tests/profile-shape.spec.ts`。Loader 组合、三种安装组合、peer 解析、真实的 `tools/pre-execute` 次序与 DSH_HOME 下的 profile 只能在 L3 验。客户端组合在 U3 成立时有 L3 覆盖，否则只有 L4；插件管理器的显示、dsh-hmr 的重载与模型菜单写 profile 只在 L4。

## 9. bootstrap 需要编排层包提供的结构

| # | 需要 | 本次怎样留出来 |
| --- | --- | --- |
| B1 | 一个独立的行与人发起的入口：新项目初始化与已有项目接管走同一个命令 | 编排层包里新增行 `glm-hourness/bootstrap`（默认禁用，AGENTS.md 第 4 条），在 `scripts/packages.mjs` 里登记，preflight 的固定行 id 随表增加；命令沿用 `/hourness-*` 前缀（例如 `/hourness-init`），名字在 bootstrap 设计里定 |
| B2 | harness 身份的写入：确定性部分（建目录、规范节点、规则）与强提醒缺口（开工即标进行中、收工带证据关、派发与运行控制写状态） | 引擎已有 actor `harness`（`src/graph/schema.ts`:39），权限同 `llm`（ORCHESTRATION.md §2.7）；自动转移状态的逻辑放在 `src/graph/`，由图行、`/graph-run`（graph-panel 行）与 M7 的派发共用一份 |
| B3 | 规范节点与项目规则的模板 | 写成 `src/bootstrap/` 里的 TS 常量编进产物，不在运行时按模块位置读文件，避开 F4 的路径问题；本仓库的 `norm-*` 节点是由模板生成的实例。加这个目录只改目录表（`hourness.src` 加 `bootstrap`、`rows` 加一行）、`packages/hourness/tsconfig.json` 的 `include`、`packages/hourness/cordis.patch.yml` 与 `packages/hourness/package.json` 的导出，后三处由 preflight 对着表核对 |
| B4 | 项目目录跟着会话走 | 现在 `glm-hourness/data` 的默认 `projectHome` 与桌面 profile 给 memory、workflow、hourness 的 `home` 都钉在本仓库 `.llm`；在别的仓库里用编排层，违规、决策与记忆会写进本仓库。bootstrap 要让项目目录在没有显式配置时取会话工作目录下的 `.llm`；改默认值与 profile 的三条 `home` 覆盖是 bootstrap 里要人批的 profile 改动 |
| B5 | 对所有路由生效的提示词接缝：项目规则、M3 的主 Agent 身份 | 今天编排层唯一的提示词节是 guard 的声明，且只在 GLM 路由上出现。保留节名前缀 `hourness:` 给编排层，所有路由都加，排在方言节之后；接缝由编排层的一个组装监听器提供（M3 或 bootstrap 实现，本次只在 DESIGN.md §5.2 的节表里注明前缀归属） |
| B6 | 在没有 GLM 的组合里测接管 | 第 5 步的 `probe-hourness` 组合；接管一个夹具仓库的场景放在这里，模型用 `deepseek-probe` |
| B7 | 读项目的 LLM 部分不依赖 GLM | 用会话自己的模型；档位按 §4.5 |
| B8 | 强提醒对所有模型生效 | 用公共库的每步 notice 接缝 `installStepNotice`（`row` 必填，告警写 `bootstrap`），格式用 `zcode-notice.ts` 的 `wrapSystemReminder`，做法同每步投影 |
| B9 | 节点正文里「确定性的部分（建目录、规范节点、规则、钩子）由 harness 直接做」的钩子 | 钩子指什么在 bootstrap 设计里定：可能是写进被接管项目的 git hook，也可能是会话事件上的检查。编排层包这边沿用 B3 的做法：钩子模板写成 `src/bootstrap/` 里的常量，由 bootstrap 行写进项目，不需要别的结构。写进用户项目的 `.git/hooks` 属于难以撤销、要先问人的动作（CHARTER.md §6 不替用户做主），模板与写入都按 B2 的 harness 身份留痕。若钩子需要本仓库没有用过的宿主接缝（例如会话之外的事件），列为 bootstrap 的待定项，读 rc.3 源码核实之后再定，本次不预留接口 |

## 10. 并行工作的影响

- m1-parity：已在 `a9f12e1` 快进合入 main 并推送（`0f9f284` 在其后只改项目图节点，它的提交说明记录：评审第 3 轮 APPROVED，`npm test` 556 通过，探针 94/94），本地分支与工作树 `.worktrees/m1-parity` 已不在。第二稿对照的 `798361f` 在分支重建后不是 `a9f12e1` 的祖先：它的内容对应 main 上的 `0a2564b`，`a9f12e1` 另加了 deviceMid 回写（question-9 选 A：按 3.16.3 `ensureCliDeviceMid` 生成并写回 `<ZCODE_DATA_BASE_DIR 或用户目录>/.zcode/v2/telemetry-state.json`，`device-mid.txt` 不再读写）。相对第二稿的依据 `97840e0`，main 上改动的代码文件〔实读，`git diff 97840e0 0f9f284`〕：
  - `src/glm-llm/**`：新增 `auth/project-token.ts`、`device-mid.ts`、`token-budget.ts`、`zcode-wire.ts`，删除 `auth/resolver.ts`，修改 `anthropic.ts`、`auth/store.ts`、`auth/types.ts`、`endpoint-routing.ts`、`headers.ts`、`identity.ts`、`index.ts`、`login-row.ts`、`models.ts`、`signing.ts`、`zcode.ts`。
  - 公共库：`dsh-min.ts`（`SessionLike.header` 加 `parentSession`、`origin`）、`lm-min.ts`（`RequestMessageLike.id`）、`data-home.ts`（只改注释：用户级目录不再放 deviceMid）。
  - 客户端：`ui/src/channel.js` 的说明文字。
  - 其余：GLM 测试与替身（`glm-device-mid`、`glm-project-token`、`glm-fixtures.ts` 等）、`tests/health.spec.ts` 的凭证用例、`scripts/smoke-zcode-authorized.mjs`、`scripts/check-verbatim.mjs`（`MIRROR_FILES` 加 `src/glm-llm/zcode-wire.ts`，它没有导入，第 1 步的导入规则直接成立）、`package.json` 的测试列表、三份检查器基线（只涉及 `src/glm-llm/` 的条目）与文档（含 CHARTER.md §9 用户级目录一行）。
  新代码只导入 node 内置模块、`src/glm-llm/` 与 `src/shared/`；`glm-llm` 经 `ctx.get('agents')` 读会话头，不调用编排层的服务。这些都不跨本设计的边界，§2 的归属不变。deviceMid 回写对拆包的影响只在探针与标定，见 §7.3。
- main 工作区：除 `.kiro/` 外没有未提交改动。
- m1-11 与 m1-cleanup：运行 m1-l4-and-cleanup（wf_10cbbc919767c467）占用桌面时段，在主检出构建 `a9f12e1` 做 M1 的批次 L4，之后做清理，其中要改桌面 profile（去掉 8317 的 pi-ai `glm` 路由，先备份）、删除 profile 里的备份文件、把仓库 `.llm` 里的用量补拷到 `~/.dsh/glm-hourness/audit/usage.jsonl`。对 split 的影响：桌面 profile 里本项目的五条覆盖项不变，§3.4 的结论不变，合入时的结构快照取那之后的状态；探针运行排在用量补拷之后（§7.7）；`split` 的合入排在 `m1-11` 之后（§7.0）。
- m8-ui-audit（进行中）：桌面走查已完成，47 条问题，要改 40 条、不改 7 条（`.agents/tasks/ui-audit/findings.md`），修复分 13 个提交，等桌面时段。它与 split 的重叠文件与先后规则见 §7.0；其中第 11 个提交的 V-01 要改行名的形式，与伞包布局冲突，见 F22 与 §14.7。
- `risk-shared-desktop`：合入与两轮 L4 按 §7.1 合入顺序提前申请时段。
- 给编排者的提醒（不限于 split）：F17 对任何合入都成立。桌面版运行期间合入并 build 主检出，下一次模型菜单或设置写 profile 时，桌面版就会按磁盘上的 bundle patch 重组并比对模块。m1-parity 不改 bundle 布局，影响比 split 小，但同样会在重启之前部分生效。

## 11. 不做的事

- 改任何行 id、服务名、notice 来源、节名、命令名、插件名、用户级目录名、插槽 id。
- 改用户的桌面 profile 或 glmsandbox（§3.6 只是可选的后续）。
- 把源码搬进 `packages/*/src`；拆成两个仓库（question-10 已选 A）。
- 发布到 npm 或插件市场。
- 用 `cordis:group` 把一个包的行包成一组：会改变服务可见范围，收益只是一个总开关。
- 按路由换注入格式；按路由换提示词节名。
- guard 放开到拦截本身（§4.2.4 的判据满足后由人另定）。
- M7 的档位映射服务（§4.5 只定归属）；m6 的额度字段（§4.3）。
- 工作区圈禁不认 `str_replace_editor` 的 `path`（今天就有的缺口，记给 M4）。
- 项目目录跟着会话走（§9 B4，归 bootstrap）。
- 给编排层的行加 `Config` schema（会带进第二份 schemastery，§2.3）。

## 12. 由 agent 自定、人可推翻的事项

源码不搬家（§2.2）；伞包加占位包而不改 profile（§3）；UI 拆成两个嵌在宿主包里的客户端包（§5）；行 id 与其他持久化标识不改，面板沿用 `glm-hourness/ui`，GLM 客户端半用新行 `glm-hourness/glm-ui` 且默认禁用（§2.1、§3.3）；`src/ui` 改名 `src/report`（§2.2）；目录归属只写在 `scripts/packages.mjs`（§2.7）；两段共用的 ZCode 原文放进公共库的镜像文件 `zcode-notice.ts`，逐字门禁只跳过文件开头导入块里的单行导入语句，并限制导入来源（§2.3、§7.4）；计价服务由 `glm-login` 提供（§4.3）；方言服务由 `glm-prompt` 提供（§4.7）；工具名换算以公共库的静态别名表 `ZCODE_ALIAS_NATIVES` 兜底，拦截不依赖方言服务（§4.2.2、§4.7）；规则接口加 `face` 参数，配置追加的规则收到原生名（§4.2.2）；第 2 步只换算工具名、不改拦截范围，N 类调用的纠偏与声明改用原生工具名（§4.2.2）；`glm:memory` 按 `next()` 返回的工具出现（§4.8）；preflight 的 C2 只扫 `.js` 产物，编排层包不写 `peerDependencies`（§3.2、§7.4）；worktree 上第 5、6 步删除陈旧的根产物，主检出上保留到 L4 第一轮之后，相关忽略项随之保留、之后一并去掉（§3.1、§7.4）；探针退路模式的 profile 用 `glmh-split-` 前缀（§7.3）；`tests/profile-shape.spec.ts` 在第 0 步、`tests/preflight.spec.ts` 在第 1 步建（§7.2）；工具名契约分注册名单与常驻名单（§2.6）；ESLint 核心规则的 `regex` 模式做边界检查（§2.7）；knip 经 `tsconfig.knip.json` 取得源码映射（§7.4）；分支开发、一次合入，合入时先关桌面版（§7.1）；探针改用运行目录下生成的 DSH home 与 profile，守卫与 L4 改用结构比对（§7.3、§7.6）；新增 `/hourness-status`，描述与用法错误的语言跟同一行的 `/hourness` 一致（§2.5）；构建前清空两个包的产物目录（§7.4）；面板标题列出全部未关闭的目标（§6.1）；步骤顺序把方言服务排在计价服务之前（§7.1、§13.1）；`split` 对 m8-ui-audit 的部分依赖只在节点上批注、不加 `depends` 边，因为第 0–2 步不依赖它（它的修复计划不改第 1、2 步碰到的文字，改了就 rebase 重钉断言），加边会让整个 `split` 显示为被挡住（§7.0）。

## 13. 评审意见的处理

### 13.1 第一轮（R01–R14，第二轮评审核为全部关闭）

步号对照：第一轮的第 0、1 步仍是第 0、1 步；第一轮的第 3 步（方言服务与换算）改为第 2 步，第一轮的第 2 步（计价服务）改为第 3 步；第 4–8 步不变。调换的理由：方言服务不碰 m8-ui-audit 的文件，可以在 m1-parity 合入后先做；计价服务改 `/hourness` 的输出，排到 m8-ui-audit 之后（§7.0）。下面引用第一轮步号时注明「原」。

| id | 级别 | 处理 | 位置 |
| --- | --- | --- | --- |
| R01 | MEDIUM | 已改，采用评审建议的第 2 种做法。第 2 步（原第 3 步）只换算工具名，拦截范围仍按 GLM 模型族，即 `src/guard/index.ts`:163、201 的两处 `isGlmModel`；这两处是编排层仅剩的模型族判定，第 7 步按人定的方案保留（G1）或改为 `claims`、去掉（G2–G4）。方案表改按 C、N、O 三类路由写：G1 就是今天的行为，与 §6.2 定案一致；G2 把 N 由拦截改为影子，写明这修改 §6.2 定案的一处、要人批准。「人还没定时」改为「C、N 拦截，O 不判、不记」，现在成立。§12 删去「guard 的拦截范围改为方言接管的路由」。第 2 步唯一看得见的变化是 N 类调用的纠偏与声明改用原生工具名，属于文字更正，列入 §12 | §4.2.1–§4.2.4、§7.1、§12、§14.2 |
| R02 | MEDIUM | 已改，采用评审建议。新增镜像文件 `src/shared/zcode-notice.ts`（`DEFERRED_TOOL_CALL_NAME`、嵌套标签正则、`wrapSystemReminder`，代码与今天相同），加进 `MIRROR_FILES`；`step-notice.ts` 不再收这些符号，`tool-names.ts` 不放 `DEFERRED_TOOL_CALL_NAME`。离开 `zcode-text.ts` 的 8 段字面量都在新文件里受检，受检行数不变；条目数少 1，少的是 `zcode-tool-text.ts` 里从未受检的模块路径 `'./json.ts'`（§7.4 核对了这一点，评审建议里「条目数不变」的说法因此改为受检行数不变）；第 1 步的提交信息写明前后的条目数与受检行数。导入规则收紧为：单行、值导入只许来自镜像文件、`import type` 只许来自 `src/shared/`，并加 `tests/check-verbatim.spec.ts`。「不放宽」现在成立，不需要人批 | §2.3、§2.4 X2–X3、§7.2、§7.4 |
| R03 | MEDIUM | 已改。G2 下两类影子记录都加 `scope`，由 guard 在写入时按 `claims` 填；`RuleShadowRecord` 定义在 `src/guard/index.ts`，`GuardRecord` 改为三者之并；晨报按 `scope` 分组，缺 `scope` 的旧记录归入方言组；改动位置写成 `src/guard/index.ts`（范围判断与 `observe` 调用处）与 `shadow.ts` 的 `observe(payload, scope)`；一轮里路由混合时记 `dialect`；被规则判定后按影子放行的调用不再交给兜底，晨报在每组里按来源（规则判定、工作区变更兜底）分开计数；`tests/guard-audit.spec.ts`、`tests/workflow.spec.ts` 加旧记录用例 | §4.2.4、§7.2 |
| R04 | MEDIUM | 已改。SHA-256 不再作任何验收条件。新增只读工具 `scripts/profile-shape.mjs`（按条目的键名与规整后的摘要，不输出值）。L4 改为结构比对：bundles、dependencies、五条本项目覆盖项不变，`agent-default-model` 在收尾时恢复为快照值。探针守卫只比对本项目相关的结构，变化记退出码 2、结论作废；其余条目只列出；`~/.dsh/profiles/` 下出现 `probe-*` 才是退出码 1 | §7.3、§7.6、§8.1 |
| R05 | MEDIUM | 已改。dsh-hmr 的行为写成 F17；§7.1 规定合入顺序（申请时段、结构快照、关桌面版、rebase 与门禁、合入与 build、启动），启用 `glm-ui` 的第二轮同样；根 `dist/` 与 `ui/client.js` 在 L4 第一轮通过后再删；§7.0、§7.7 改为「下次重启，或下一次 profile 写入」；第 0 步把这条事实写进 FACTS.md §3 与 DEVELOPMENT.md §1.1、§5 第 4 条。核对时另发现设置表单给没有覆盖项的行新写覆盖项会带模块路径（F18），列为已有 profile 的迁移风险 | §1.4、§3.7、§7.0、§7.1、§7.5、§7.7、§10 |
| R06 | LOW | 已改。删去「`reminder.ts` 不传 `row`」的错误理由；`row` 必填的理由改为公共库不带某个包的默认行名 | §2.3 |
| R07 | LOW | 已改。C2 保留，理由改为子包脱离本仓库目录使用时仍能解析到安装版，并写明在本仓库里根 `package.json` 的 peer 会兜住；`tests/preflight.spec.ts` 的「子包缺 peer 失败」夹具照旧 | §1.1 F8、§7.7 |
| R08 | LOW | 已改。§2.3 写明 schemastery 的模块级状态是例外、理由（上游原样代码，跨副本靠 `Symbol.for` 与 `globalThis` 计数），以及编排层以后用它时要记的两项核对；§8.3 同步 | §2.3、§8.3、§11 |
| R09 | LOW | 已改。§10 按 `798361f` 重写，说明 `bac18b4` 因分支重建已不在分支上；`resolver.ts` 写为整个删除；`zcode-wire.ts` 是第三个镜像文件，没有导入，导入规则对它成立；删去 main 工作区未提交改动的说法；开始条件写成一条规则（第 0–2 步在 m1-parity 合入后，第 3–6 步与第 8 步在 m8-ui-audit 合入后）。是否加 `depends` 边：不加，只批注，理由是第 0–2 步不依赖 m8-ui-audit，加边会让整个 `split` 显示为被挡住；这不属于必须问人的五类事（ORCHESTRATION.md §2.9.1），列入 §12，人可推翻 | §7.0、§10、§12 |
| R10 | LOW | 已改。B1 改为只引用 §6.2 定案的写法；B 的非目标加「不依赖反向代理」并注明是仓库级规则；§6.4 补非目标的对应；改挂清单加 `m6`（建议留在 `orch`、正文注明分属，两种备选写明代价）；第 8 步把面板标题改为列出全部未关闭的目标 | §6.1、§6.3、§6.4、§6.5、§14.1 |
| R11 | LOW | 已改。`split` 验收第 1、2 条的改写单列为人定事项，给出建议文字，并把「各自装上以生成的 profile 为准」与 U5 的取舍写进选项 | §3.3、§14.3 |
| R12 | LOW | 已改。目录归属只写在 `scripts/packages.mjs`，ESLint 规则、knip 入口、preflight 白名单与构建脚本从它读，preflight 核对包 tsconfig 的 `include` 与 `HEALTH_PACKAGES`。knip 经 `tsconfig.knip.json` 引用两个包的 tsconfig 取得两组源码映射（F20）；它不放进根 tsconfig，因为 `tsc -p` 拒绝非 composite 的引用（F21，本轮实测 TS6306）。U7 的退路改为「出现新发现即停，交人决定」 | §1.5、§1.6、§2.7、§7.4、§9 B3 |
| R13 | LOW | 已改。契约改为 `GRAPH_TOOL_NAMES`、`MEMORY_TOOL_NAMES` 与单独列出的 `ORCHESTRATION_RESIDENT_TOOLS`；契约测试分别断言两份注册名字，常驻名单只要求是两者之并的子集；§4.8 读 `MEMORY_TOOL_NAMES`；新工具默认不常驻 | §2.6、§4.8、§7.2 |
| R14 | LOW | 已改。标定与探针的导入路径按步写（第 3 步，即原第 2 步，改为 `dist/glm-llm/credits.js`；第 5 步改为 `packages/glm/dist/glm-llm/credits.js`）；ORCHESTRATION.md §3.5 排进第 5 步的文档；`/hourness-status` 的用法错误用英文，与 `/hourness` 相同（第三稿改为跟随 `/hourness` 当时的写法，见 §13.2 R24）；违规演示在未提交的改动上做并还原，结果写进提交信息；L4 的测试批注撤销后在 `split` 上留痕。另外，第一轮的 U6 已由 F19 核实（ESLint 10.13 的 `no-restricted-imports` 支持 `regex`），不再是假设 | §1.5、§1.6、§2.5、§4.3、§7.1、§7.5、§7.6 |

### 13.2 第二轮（R15–R27）

| id | 级别 | 处理 | 位置 |
| --- | --- | --- | --- |
| R15 | MEDIUM | 已改，采用评审建议 a。公共库 `src/shared/dialect.ts` 加静态别名表 `ZCODE_ALIAS_NATIVES` 与换算函数 `toNativeTool`：先问服务的 `nativeOf`，再查表，都没有就原样。guard、影子兜底、图文件门禁三处都经它换算，位置写到行（`src/guard/index.ts`:167、`src/guard/graph-files.ts`:116、`src/guard/shadow.ts`:125 起）。`nativeOf` 由 GLM 自己的 `aliasSpecs` 等组成，不抄表；契约测试钉住表、`aliasSpecs`、`nativeOf`、`faceName` 四者一致。改正 §4.7「服务缺席时」、§8.1 两行与 §7.7 一行：服务缺席只影响 `claims` 与用名，拦截不变；G2 下 C 类调用按 N 处理的后果照旧写明。`tests/guard-audit.spec.ts`、`tests/graph-guard.spec.ts` 加没有方言服务时 `Write`、`Bash` 仍被拒绝、影子兜底不误记的用例。服务读取的形状检查只看用到的成员，两包版本错开时新增成员不会让服务被判缺席 | §2.3、§2.4 X7、§4.2.2、§4.7、§7.2、§7.7、§8.1–§8.3 |
| R16 | MEDIUM | 已改，采用评审建议，并加上 worktree 上的删除。jscpd 第 0–6 步不动。评审说 `**/ui/client.js`「同时覆盖子包产物」不成立：`.jscpd.json`:2 的 `path` 不含 `packages`，子包产物本来不在扫描范围里，所以合入顺序第 7 项删掉根产物之后这一项不再匹配任何文件，随清理提交去掉。ESLint 保留 `'dist/'` 与 `'ui/client.js'`（`eslint.config.js`:16、18），第 5、6 步加 `packages/*/dist/`、`packages/*/ui/client.js`；`.gitignore` 保留 `/ui/client.js`（:10），第 6 步加 `/packages/*/ui/client.js`；`knip.js` 的 `ignore` 同样两项都在。合入顺序第 5 项改为三道门禁；第 7 项删陈旧产物后，用一个提交去掉只为它们保留的忽略项。worktree 上第 5、6 步删除陈旧的根产物，免得它们掩盖漏改的 `../../dist/...` 导入（今天探针与标定脚本都这样导入） | §3.1、§7.1、§7.4、§7.7 |
| R17 | LOW | 已改。依据改为 main `0f9f284`（代码同 `a9f12e1`）；§10 重写 m1-parity 一段：已合入，`798361f` 对应 `0a2564b`，`a9f12e1` 加了 deviceMid 回写，相对 `97840e0` 的改动按 `git diff` 列出，归属结论不变；§7.0 写为已满足；§7.3 补 deviceMid：探针不启用 `glm-llm`，不写 `~/.zcode`，以后启用时设 `ZCODE_DATA_BASE_DIR`；标定会写，属 question-9 选 A 的既定行为 | 文首、§0、§7.0、§7.3、§10 |
| R18 | LOW | 已改，选「C2 只扫 `.js`」，`declaration: true` 不改。今天的产物 `dist/shared/dsh-min.d.ts`:1 确有 `@deepseek-ai/dsh-llm` 的类型导入（源码在 `src/shared/dsh-min.ts`:16，评审写的 :17 差一行）。`tests/preflight.spec.ts` 加「`.d.ts` 有类型导入时通过」的夹具。顺带：子包的 peer 只列 `.js` 里真有的运行时裸导入，GLM 包只留 `@deepseek-ai/cosmokit`，编排层包去掉第二稿为以后预留的 `@deepseek-ai/cordis`（AGENTS.md 不留死代码） | §3.2、§7.2、§7.4 preflight 第 6 项、§8.2 |
| R19 | LOW | 已改。`packages/hourness/package.json` 补 `type` module、`private` true，另补漏写的 `dsh.bundle.patch`；preflight 第 5 项检查四个包的 `type`，`tests/preflight.spec.ts` 加缺 `type` 的失败夹具 | §3.2、§7.2、§7.4、§8.2 |
| R20 | LOW | 已改，用评审给的形状。`ToolFace`、`NATIVE_FACE`、`GuardRule`（`declare` 为字符串或取名函数，`detect(call, face)`）、`evaluate(rules, call, face?)`、`declarationOf` 的签名写进 §4.2.2；写明哪条规则用函数形式、`declarationSection` 多一个参数、`graph-files.ts`:82 传 `NATIVE_FACE`；配置追加的规则按旧接口写照样类型成立，收到原生名，第 2 步对 ORCHESTRATION.md §6.1 的改动写明 | §4.2.2、§7.5 |
| R21 | LOW | 已改。写明用 `next()` 返回的 `assembled.tools`（`src/glm-prompt/index.ts`:145）；判定函数 `memorySectionApplies` 的参数就是这个返回值，在 `rewriteToolFace` 之前调用。评审要的「记忆工具被延迟加载时这一节仍在」今天在组合里造不出来（记忆工具在常驻名单里，名单是公共库常量），用例改为经监听器与直接调用各测有、缺一个、全缺三种，延迟加载的情形由参数与调用位置保证、源码注释写明，把记忆工具移出常驻名单的那个提交补端到端用例 | §2.4 X10、§4.8、§7.2 |
| R22 | LOW | 已改。§2.7 加按步填写的小表（第 1 步编排层写 `ui`，第 5 步改 `report`，第 6 步补客户端）；§4.3 写明第 3 步改的是 `src/ui/panel.ts`。表自检加三条：`src/` 下每个顶层目录都有归属；第 6 步起 `ui/src/` 下每个文件都有归属；没有会让 `regex` 误报的同名目录或文件。表自检从第 1 步起在 preflight 里跑，`tests/preflight.spec.ts` 随之第 1 步建。`regex` 的生成规则写成表，与文件深度无关，同名目录的代价与自检对策写明。客户端一侧的规则顺带改为对称：一半客户端不得导入另一个包的宿主目录与另一半客户端源码；第二稿写的「GLM 客户端不得导入 `src/`」比编排层一侧更严，没有理由，今天 `ui/src/channel.js` 也只导入 `react` | §2.2、§2.7、§4.3、§7.1、§7.2、§7.4、§8.2 |
| R23 | LOW | 已改，用评审的做法。只去掉文件开头导入块里的单行导入语句；导入块之后再出现导入语句就失败，判定在去掉注释、字面量内容换成空白的代码文本上做。另找到一处现成的风险：`src/glm-prompt/zcode-tool-text.ts`:340 的 `export const BASH_WORKDIR_LINE = "… from the user's profile."` 按行匹配 `export … from` 会被当成再导出删掉，而它是受检原文。`tests/check-verbatim.spec.ts` 加模板里 `import` 开头的原文行、:340 这种形状、导入块之后的导入三个用例 | §7.2、§7.4、§7.7、§8.2 |
| R24 | LOW | 已改。§7.0 列出第 1、2 步碰到的、属于 m8-ui-audit 文字范围的文件与行号，并对着它的修复计划（`findings.md` §7 的 13 个提交）核对：这些文字不在修复之列（F-21、F-36、F-41 列为不改），第 0–2 步可以并行；m8-ui-audit 先合入并改了这些文字时，rebase 后按合入后的文字重钉 `tests/guard-audit.spec.ts` 的逐字断言。核对中另发现两处与后面步骤的交叠：F-20 要把 `/hourness` 的描述与用法改成中文（`/hourness-status` 跟随，§2.5）；V-01 要改行名的形式（F22，新的待人定事项 §14.7）。不加 `depends` 边的决定保留 | §2.5、§7.0、§7.7、§10、§12、§14.7 |
| R25 | LOW | 已改。第 0 步新建 `tests/profile-shape.spec.ts`，覆盖评审列的各项，加进 `package.json` 的测试列表；`tests/preflight.spec.ts` 不收这些用例 | §7.1、§7.2、§8.4 |
| R26 | LOW | 已改，逐项。`parseStatus` 改写为「在全文里先找已登录、再找未登录」；评审建议的约束（表里不得含两个短语）与现状冲突：`src/glm-llm/zcode.ts`:377 的 `glm-llm` 健康说明就含「未登录」，它只与未登录的凭证行同时出现，所以约束定为「全表不含『已登录（套餐』，新增文字不含『未登录』」。插槽行号改为 :317、:320。F11 的证据改为 client-modules 的 `locatePkgJson`、`nearestPackage`、`resolveMeta`（:720–742、762–809），并写明客户端行不能用子路径说明符（:766）。U5 与 §14.3 统一为 `dsh plugin --profile <临时名> add <路径> -w`。U1 的退路改用 `glmh-split-` 前缀，守卫只放行本次登记的名字，结束时必须删除 | §1.2 F11、§1.6、§2.5、§3.3、§7.3、§8.1、§14.3 |
| R27 | LOW | 已改。§9 加 B9：钩子指什么在 bootstrap 设计里定；编排层包沿用 B3 的常量模板做法，不需要别的结构；写进用户项目的 git hook 要先问人；需要新宿主接缝时列为 bootstrap 的待定项 | §9 |

本轮另外核出、评审没有提到的事：设置页的行标题与行名形式的关系（F22），以及 m8-ui-audit 的 V-01 与伞包布局的冲突，列为新的待人定事项 §14.7；DeepSeek 官方请求会带上活动插件包的名字与版本（F23），作为包名的一项后果写进 §14.4。

## 14. 待人定的事项

### 14.1 两个项目目标（§0.1 第 1 项）

- 选项 A（建议）：两个根目标，文字按 §6.2、§6.3；编排层目标沿用 id `hourness`，GLM 目标新建 `glm-house`；`bottom`、`q-old-folder` 改挂 `glm-house`；`orch`、`d-graph-programming`、`m0` 留在 `hourness`；`m6` 留在 `orch`，正文注明哪部分在哪个包。后果：每个任务的祖先链只带自己那一半的验收；面板标题列出两个目标（§6.1）；第 8 步的 CHARTER 改动按此写。`m6` 的两种备选：整个改挂 `bottom`（展示与排期会读到 GLM 目标的验收），或拆出 GLM 部分成为 `bottom` 下的新节点（一个里程碑的验收分到两边）。
- 选项 B：两个根目标，GLM 目标沿用 `hourness`、编排层新建。后果：`orch` 子树（大多数节点）要改挂；节点历史里「目标 hourness」的含义从总目标变成 GLM 目标。
- 选项 C：保留一个根目标，只改写文字，由 `bottom` 与 `orch` 两个特性承载两半的验收（目标节点不能有父节点，F15，所以没有「子目标」这种节点）。后果：不改挂、面板标题不变；与 question-10 选 A 写下的「目标拆成两个」不符，GLM 任务的祖先链仍带编排层的验收。
- 文字本身（标题、正文、验收、非目标）由人改，草案只是起点。
- 不定时：第 0–7 步不受影响；第 8 步不做，`split` 不能关。

### 14.2 guard 在方言没有接管的路由上（§0.1 第 2 项）

三类路由见 §4.2.1：C 方言接管的 GLM 路由，N 没有方言的 GLM 调用，O 非 GLM 路由。

| 方案 | C | N | O | 后果 |
| --- | --- | --- | --- | --- |
| G1 维持 | 拦截 | 拦截 | 不判、不记 | 今天的行为；O 上永远没有误伤数据；编排层永久保留两处模型族判定；`split` 验收第一条要改成不含 guard |
| G2 影子先行（建议） | 拦截 | 影子 | 影子 | 修改 §6.2 定案的一处（N 由拦截改为影子）；晨报多出两组影子记录；按 §4.2.4 的判据积累数据后由人决定是否放开；方言服务提供失败时 C 类的 GLM 调用也只记影子（工具名仍按静态表换算，判定照常，只是不拦），`glm-prompt` 与 guard 的行健康写明 |
| G3 全拦 | 拦截 | 拦截 | 拦截 | 推翻 2026-10-28 的修复；其他模型上的误伤率未知；所有路由多一节规则声明 |
| G4 分规则 | 拦截 | 圈禁拦截，file-tools-only 影子 | 同 N | 对其他模型收紧了用户选的 `danger-full-access` 权限 |

建议 G2：误伤数据只来自 GLM 在 ZCode 工具面上的行为，N 与 O 看到的都是 DSH 原生工具面，没有测过；N 在桌面版上今天不会出现，实际改变很小；编排层由此不再有模型族判定。G2 的变体：N 照常拦截（范围仍按模型族），代价是保留模型族判定。同时要人认可的有 §4.2.4 的放开判据（14 天、至少 20 条、误伤为 0 时提待决）。不定时：第 7 步不合入，行为与今天相同，`split` 不能关。

### 14.3 `split` 节点验收的改写（§0.1 第 3 项）

今天的三条验收：「两个包各自装上、各自启用都不报错；只装编排层包时，非 GLM 会话里项目图、面板、guard 都生效」「行 id 改名有迁移，用户 profile 里已有的配置不丢」「门禁、探针全过；桌面版批次 L4 通过」。

- 选项 A（建议）：第 1 条改为「两个包单独装上、单独启用都不报错（以探针生成的 `probe-glm`、`probe-hourness` profile 与伞包 profile 为准）；只装编排层包时，非 GLM 会话里项目图与面板生效，guard 按 §14.2 定下的方案生效」；第 2 条改为「行 id 不变；桌面版 profile 不改，五条本项目覆盖项照常生效（L4 结构比对）」；第 3 条不变。后果：验收与本设计的验证手段一一对应。
- 选项 B：保留原文。后果：第 2 条要求的「迁移」没有可验证的对象；第 1 条要按单独安装来验（U5），需要加一步：用 `dsh plugin --profile <临时名> add packages/<包> -w`（与 U5 同一种做法，DEVELOPMENT.md §3 规则 1）分别装两个子包并跑 headless，用完删除临时 profile；临时名用 `glmh-split-` 前缀，探针守卫按 §7.3 的退路模式放行。
- 改验收属于必须问人的第 1 类（ORCHESTRATION.md §2.9.1）。不定时：`split` 不能按含「改名」前提的文字关闭。

### 14.4 包名（§0.1 第 4 项）

- 选项 A（建议）：`dsh-glm-zcode`、`dsh-hourness`，客户端包 `dsh-glm-zcode-ui`、`dsh-hourness-ui`。GLM 包名与 provider id `glm-zcode` 一致；编排层包名取项目名后半，不带模型名。
- 选项 B：带项目前缀，例如 `dsh-glm-hourness-channel`、`dsh-glm-hourness-harness`。一看就知道同属一个项目；编排层包名里带 `glm`，与「对所有模型生效」相悖。
- 选项 C：人另起名字。
- 后果（三者相同）：名字出现在插件管理器、`/glm-status` 与 `/hourness-status` 的「包」列、子包清单与文档里；伞包布局下改名不涉及 profile；只有将来按 §3.6 让 profile 直接列子包，名字才进 profile。名字与版本还会出现在 DeepSeek 官方请求的 `dsh_plugin_packages` 字段里（F23）：拆包后桌面版的 DeepSeek 会话列出的是两个子包与启用的客户端包，不再列 `dsh-glm-hourness`、`dsh-glm-hourness-ui`；选项 B 会让 DeepSeek 看到带 `glm` 的编排层包名。伞包 `dsh-glm-hourness`、占位包 `dsh-glm-hourness-ui`、行 id、插件名与 `definitionId` 不随包名改。
- 不定时：第 5 步按选项 A 写；以后改名是一个提交（目录表、清单、`HEALTH_PACKAGES`、文档）。

### 14.5 桌面版 profile（§0.1 第 5 项）

- 选项 A（建议）：不改。伞包与占位包让桌面版 profile 的两项 bundle、两项依赖与五条覆盖项原样生效（§3.4）。
- 选项 B：按 §3.6 改成直接列两个子包。改的只有 `package.json` 的 `dsh.profile.bundles`（`dsh-glm-hourness` 换成两个子包名，删 `dsh-glm-hourness-ui`）与 `dependencies`（两项 `link:` 换成指向 `packages/glm`、`packages/hourness`）；`cordis.patch.yml` 不变。备份为 `package.json.bak-<毫秒时间戳>`，回滚即用备份覆盖、`dsh plugin --profile desktop install`、重启。后果：多一次人批的 profile 改动与一次 L4，收益只是少两个清单。

### 14.6 条件性事项（§0.1 第 6 项，平时不触发）

- 合入前的结构快照里，本项目的覆盖项带 `name`（§3.7）：选项是删去这条覆盖项的 `name` 键（建议：删后按 id 匹配，与另外五条相同；按 AGENTS.md 第 6 条先备份为 `cordis.patch.yml.bak-<毫秒时间戳>`，只改这一行，回滚即用备份覆盖）、按新模块路径改写它的值（以后每次布局变动都要再改）、或推迟合入。
- 第 5 步 knip 出现新发现（U7）：选项是逐条接受进基线（按 ORCHESTRATION.md §7.6 由人决定），或改脚本的导入方式让它不再需要源码映射；建议按条决定，并先看是不是 U7 的映射没有生效。

### 14.7 m8-ui-audit 的 V-01 与 split 第 5 步的先后（§0.1 第 7 项，本稿新发现）

事实：设置页「内置插件」给本项目各行显示 file URL 标题，因为 `readPluginMeta` 只处理包说明符（F22）。V-01 的修法是把行名改成包说明符（例如伞包导出的 `dsh-glm-hourness/glm-llm`），排在 m8-ui-audit 的第 11 个提交，改的正是 split 第 5、6 步要改的文件（根 `cordis.patch.yml`、`ui/cordis.patch.yml`、`ui/package.json`、`locale/*.json`）。包说明符形式的行名经 profile 的包映射解析，桌面 profile 只映射 `dsh-glm-hourness` 与 `dsh-glm-hourness-ui`（F22，映射范围为推断）。于是：
- 子包 patch 写伞包的说明符：子包单独装上时 profile 里没有伞包，行解析不到，违反「各自装上」；
- 子包 patch 写子包自己的说明符（`dsh-glm-zcode/glm-llm`）：桌面 profile 解析不到子包，要改 profile；
- 客户端行在任何选项下都不能写子路径说明符（F11），只能是路径或精确包名。

选项：
- A（建议）：V-01 推迟到 split 合入之后，在新布局上单独设计；split 第 5、6 步的行名保持路径形式。后果：设置页的 file URL 标题多留一段时间，只影响显示；V-01 届时在两种做法里选：伞包另带一份由目录表生成、行名为 `dsh-glm-hourness/<行>` 的 patch，子包 patch 用子包自己的说明符，preflight 核对两份只差行名；或者按 §3.6 改 profile 直接列子包（人批的 profile 改动）。
- B：V-01 先做（行名改为伞包说明符），split 第 5 步随之改成上面第一种做法。后果：第 5 步多一份生成的 patch，三个宿主清单都要带每行的 `exports` 与 locale，探针的单包组合改按子包说明符解析；第 5 步要重新设计并评审一次。
- C：V-01 不做。后果：标题一直是 file URL，含用户目录路径（V-01 的记录）。

不定时：split 第 0–4 步不受影响；第 5 步开工前读 main 上的 patch，行名仍是路径形式就按本设计做，已改成包说明符就停下交人。这是 m8-ui-audit 与 split 两个任务之间的先后，由编排者向人提问。

### 14.8 需要人配合的事（不是决定）

- 合入与两轮 L4 的桌面时段：关闭桌面版，两次重启，L4 期间不用桌面版（`risk-shared-desktop`，§7.1 合入顺序）。
- 知会，bootstrap 时再定：项目目录跟会话走（§9 B4）要改 `glm-hourness/data` 的默认值与桌面 profile 的三条 `home` 覆盖，到时是一次人批的 profile 改动。
