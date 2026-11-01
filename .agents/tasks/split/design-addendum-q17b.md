# split 设计附录：question-17 B（两个插件，不要伞包与占位包）

版本：附录 0.5（2026-10-29），第五稿。按第 4 轮评审（`.agents/tasks/split/addendum-review.md`，附录 0.4，CHANGES_REQUESTED，D01–D05）与父任务转来的事实变化（桌面版 profile 的三个孤立 `@local` 链接已删，G13）修订，逐条处理见 §9.4；第 3 轮（C01–C08）的处理见 §9.3，第 2 轮（B01–B07）见 §9.2，第 1 轮（A01–A17）见 §9.1。
对应：`design.md` 0.3（第 3 轮评审 APPROVED，`design-review.md`）。question-17 选 B 之后，本附录取代 0.3 的 §3.1–§3.7、第 5 步与第 6 步、§7.1 的合入顺序与回滚段，以及 §7.6 里依赖伞包或占位包的条目。0.3 其余各处怎样处理见 §7。
人的决定：question-17 选 B，转述「分，彻底改成两个插件」（`.agents/tasks/split/graph-ops-q17.json`）。要求：桌面版与 glmsandbox 的 profile 直接列 `dsh-glm-zcode` 与 `dsh-hourness`，不留伞包与占位包；根 `package.json` 只作开发工作区根；`ui/` 不再是包（占位清单与 patch 删去，客户端源码仍在 `ui/src`）；行 id 不变，profile 的 `cordis.patch.yml` 覆盖项照常按 id 匹配；改每个 profile 的 `package.json` 之前先备份，只改 bundles 与 dependencies；profile 切换放在合入的桌面时段里。
依据：main `0e79cdd`。附录 0.4 依据的 `7148448` 之后，main 上只有一个图提交（`git diff --name-only 7148448 0e79cdd` 只有 `docs/graph/` 下的两个文件）。附录 0.3 依据的 `8f1a4c6` 之后，main 上只有图提交与 m8-ui-audit 的 `20ed994`（只改 `ui/src/graph/Panel.tsx` 的焦点处理）；m8-ui-audit 已完成，V-01 留作 split 之后的任务 `m8-row-titles`。`git diff --stat 8f1a4c6 main` 对各个 `package.json`、两份 patch、`locale/`、图标与 `scripts/` 为空，本附录用到的仓库事实照常成立。再往前，附录 0.2 依据的 `28ce4f4` 之后，main 上有 m8-ui-audit 的两个提交（`2240b70`、`ef536a3`：改 `ui/src/channel-model.ts`、`ui/src/channel.js`、`ui/src/graph/Panel.tsx`、`ui/src/graph/styles.ts`、两个测试文件，以及 DESIGN.md §2 与 ORCHESTRATION.md §2.10 各一段说明文字）与图提交；`git diff --stat 28ce4f4 main` 对各个 `package.json`、两份 patch、`locale/`、图标与 `scripts/` 为空，本附录用到的仓库事实照常成立。相对 0.3 评审所依据的 `05f0139`，m8-ui-audit 的 F-35 已合入（`53750c8`）：`ui/package.json` 加了 `./locale/*.json` 与 `./icon` 导出，新增 `ui/locale/{en,zh}.json` 与 `ui/icon.svg`，根 `locale/*.json` 的描述改过。worktree `.worktrees/split`：第 0 步 `ab031b7`、第 1 步 `00d1bd5`、第 2 步 `0fe76a5` 已提交，第五稿修订时仍停在 `0fe76a5`，工作区干净；本附录只读了它的提交，没有改。宿主契约来源同 0.3：`reference/dsh-desktop-0.2.1-rc.3/`（优先级见 `docs/DEVELOPMENT.md` §4）；另只读了本机桌面版安装目录里的命令行启动器、自带 pnpm 的位置与它的产物代码，以及 PATH 上 pnpm 的产物代码（G21）。
范围：只有设计。没有改产品代码、`docs/graph/`、worktree 与任何 `~/.dsh` profile。两个 profile 只读了：键名、行 id、bundle 名、依赖名与链接类型、`node_modules` 的条目名与链接类型、几个文件的时间戳，以及两个 `pnpm-lock.yaml` 的格式版本号 `lockfileVersion`（格式元数据，不是配置值）；依赖值只做了形状判断（是否 `link:` 开头、是否盘符开头的绝对路径、分隔符种类），没有打印；没有读其他配置值，没有读凭证文件。第三稿修订时又只读核对了一次两个 profile 的键名、bundle 名、依赖名与 `node_modules` 的条目名和链接类型，与 §2.4、§2.5、G13、G18 所列相同；两个 profile 目录里仍没有 `.bak-*`、`package.json.lock` 与 `.plugin-manager/run.json`。第四稿修订时再只读核对一次：两个 profile 的 bundle 名与依赖名与 §2.4、§2.5 相同；目录里没有 `.bak-*`、`package.json.lock`、`.plugin-manager/run.json` 与 `compatibility.json`（只查是否存在）；desktop 有 `node_modules/.modules.yaml`，glmsandbox 没有（G18）。第四稿另读了 `dsh-plugin-manager` 的 `runProfilePnpm` 全段与 `reconcile`、`dsh` 的 plugin 命令，以及两种 pnpm 产物里的 CI 判定、清空询问与 frozen-lockfile 报错（G25–G27）。第五稿修订时再只读核对一次：desktop 的 `node_modules` 顶层为 `.ignored/`、`.pnpm/`、`@local/`、本项目两个 junction、`.modules.yaml`、`.pnpm-workspace-state-v1.json`，`@local/` 下没有条目，`.ignored/` 下仍是 `@deepseek-ai`、`@openai`、`@standard-schema`、`zod`；glmsandbox 的顶层仍是 `.pnpm/` 与本项目两个 junction；两个 profile 目录里没有 `.bak-*`、`package.json.lock`、`.plugin-manager/run.json` 与 `compatibility.json`（只查是否存在）。第五稿另读了 `dsh-app-boot` 的 `symlinksUnder` 与 `linkedProfileRoots`、`dsh-plugin-manager` 的 `bundleManifest`、`reconcile` 与 `activeRecordedRun`，以及 pnpm 11 的 `readModulesDir`、`findUnplannedDirs`、`isPackageDir`、`isRealDir`；并在 `.agents/tasks/split/` 下的临时目录里试了目标不存在的 junction 的建立、读取、重建与删除（G20），脚本与目录用完已删。

证据写法：沿用 0.3（`app-boot:行`、`client-modules:行` 等）。新增：`ops:行` 指 `dsh-plugin-manager/lib/types/operations.js`（该包的 `./operations` 导出指向它，`dsh plugin` 命令从这里导入）；`dsh-bin:行`、`dsh-plugin:行`、`profile-boot:行`、`dump-config:行` 分别指 `dsh/lib/` 下的 `bin.js`、`plugin-BiveYA7h.js`、`profile-boot-C14i-8IN.js`、`dump-config-CWs_HdOc.js`；`desktop-cli:行` 指 `dsh-desktop-host/lib/cli.js`；`atomic-write:行` 指 `dsh-atomic-write/lib/index.js`；`dsh-home-paths:行` 指 `dsh-home-paths/lib/index.js`；`sandbox:行`、`profile-shape:行`、`run-probe:行` 指 worktree 第 0 步提交 `ab031b7` 里的 `scripts/sandbox.mjs`、`scripts/profile-shape.mjs`、`scripts/probe/run-probe.mjs`；`pnpm11:行` 指安装自带的 pnpm 11.28.5 的产物 `<D>\resources\runtime\primary-runtime\dependencies\pnpm\dist\pnpm.mjs`，`pnpm8:行` 指 PATH 上的 pnpm 8.6.10 的产物 `%APPDATA%\npm\node_modules\pnpm\dist\pnpm.cjs`，这两个文件的行号按 ripgrep 与 `Select-String` 的计数（`Get-Content` 数出的行号会偏移），每处都同时写函数名，可以检索。路径记号：`<M>` 指主检出 `C:\Users\29596\Desktop\Project\GLM-Hourness`；`<D>` 指桌面版安装目录，即环境变量 `DSH_DESKTOP_DIR`，没有设置时为 `%LOCALAPPDATA%\Programs\DeepSeek Harness`（同 sandbox:19），其中有 `DeepSeek Harness.exe` 与 `resources\`。〔实读〕〔推断〕同 0.3；〔只读核对〕指对 profile、安装目录或仓库文件的只读查看；〔本机试验〕指在 `.agents/tasks/split/` 下的临时目录里用本机 Node 实际运行过，试完删除。

## 0. 摘要

- 布局。根 `package.json` 不再是 bundle：删去 `dsh`、`main`、`exports`、`files`，加 `private`；名字 `dsh-glm-hourness` 与 `peerDependencies` 保留（§2.2）。第 5 步删根 `cordis.patch.yml` 与根 `locale/`，根 `icon.svg` 移到编排层包；第 6 步删 `ui/` 的清单、patch、宿主半、locale 与图标，`ui/` 只剩 `tsconfig.json` 与 `src/`。两个宿主包各带 locale 与图标，插件页显示它们自己的标题、描述与图标（§2.2）。
- profile。桌面版 13 项 bundle 中，第 3 项 `dsh-glm-hourness` 原位换成 `dsh-glm-zcode`、`dsh-hourness` 两项，删去第 13 项 `dsh-glm-hourness-ui`；dependencies 的两项换成指向 `packages/glm`、`packages/hourness` 的两项，写法与今天相同，是 `link:` 加绝对路径（§2.4，G17）；glmsandbox 同样处理。五条本项目覆盖项不改，按 id 匹配（§2.4）。宿主行的组合顺序与今天相同；面板的客户端行随编排层包提前（第 3 轮 R31）。
- 切换方式。主检出 `.agents/` 下一个不入库的脚本取 DSH 自己的写锁，只改这两个键，再用 DSH 的 `dsh plugin … install` 让 pnpm 同步 `node_modules` 与锁文件（§2.6）。pnpm 删除依赖时对链接所在的路径做递归删除，遇到 junction 会不会进入目标没有核实（G21），所以每次运行 pnpm 之前，脚本先自己拆掉它将要删的、指回检出的链接，pnpm 只建链接、不删链接（§5.3）。`install` 中途失败或被 DSH 拒绝之后，profile 的清单与链接已经是新的、锁文件还是旧的，`apply` 按记录与锁文件续跑 `install`；是否通过同时看 DSH 的退出码与它的诊断行，因为重跑时 DSH 不再拒绝、只告警（G25）。不属于本项目的链接按 `readlinkSync` 读出的原始目标记录、比对与重建，目标不存在也照样处理（G13；真实桌面版 2026-10-29 起没有这类链接，演练里有一个目标存在、一个目标不存在的）。pnpm 卡住时由脚本自己按时限结束它（G26）。桌面版的 profile 只能经 `<D>` 里的桌面版命令行启动器操作（G1）。脚本不在分支里，真实切换之前先过独立代码评审，再在主检出 `.llm/l4-split/` 下生成的 DSH home 里把两种 profile 形状完整演练一遍（§4.1、§2.6.5）。演练建出的 junction 指向主检出与 worktree，清理只走先拆链、后删除的固定步骤，失败的演练也一样（§2.6.6）。切换前备份 `package.json` 与 `pnpm-lock.yaml`；回滚是恢复两个文件再按锁文件安装，必须在仓库撤销回旧布局之后做（G16）。
- 步骤。第 5 步建两个宿主包、根退出 bundle，`ui/` 暂时仍是今天的单行客户端包；第 6 步拆客户端，`ui/` 不再是包。固定行 id 改为测试里的字面清单（R32）。
- 合入。rebase、门禁、探针、脚本评审与演练放在申请桌面时段之前；时段内依次是：关桌面版、只读快照、合入并推送、删主检出的陈旧产物、主检出三道门禁、切换两个 profile、启动即 L4 第一轮；清理提交与启用 `glm-ui` 的提交放在第二轮的关闭窗口里（§4）。与父任务写的「关桌面版、切换、build、启动」相比，门禁移到切换之前：AGENTS.md 强制流程第 2 条要求安装前三道全绿，切换运行的 `install` 就是一次安装。预计桌面占用约 1.5 小时、两次重启（§4.5）。

## 1. 新核实的宿主事实与假设

### 1.1 事实

| # | 事实 | 证据 | 对设计的约束 |
| --- | --- | --- | --- |
| G1 | 经 `bin.js` 调用时，`dsh plugin --profile desktop` 被拒：`bin.js` 直接运行时 `runCli()` 不带参数（dsh-bin:252），plugin 子命令在 `manageDesktopProfile` 为假时调用 `rejectElectronProfile`（dsh-bin:119、35–38）。桌面版命令行启动器以 `manageDesktopProfile: true` 和安装自带的 pnpm 调用同一个 `runCli`（desktop-cli:94–108）；它把 `<D>\resources\runtime` 当作支持目录（desktop-cli:114–115），自带 pnpm 是其中的 `primary-runtime\dependencies\pnpm\bin\pnpm.mjs`（desktop-cli:100）。`<D>\resources\runtime\cli\bin\dsh.cmd` 设 `ELECTRON_RUN_AS_NODE=1`，以 `<D>\DeepSeek Harness.exe --expose-internals <D>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js` 运行它〔只读核对，安装目录〕。对 `desktop` 的启动、`--dump-config` 与 `--dump-default-config`，两种入口都拒绝（dsh-bin:112） | 〔实读〕〔只读核对〕 | 桌面版 profile 只能经桌面版启动器切换；它的组合只能靠启动桌面版看，或在演练里用同样的 bundle 名单组合（§2.6.5）。0.3 §3.6 写的 `dsh plugin --profile desktop add`，按 DEVELOPMENT.md §3 的 `bin.js` 调用走不通 |
| G2 | 对 `desktop`，plugin 命令只要求 `package.json` 存在，在它的写锁里调用 `runProfilePnpm`，不检查桌面版是否在运行（dsh-plugin:10–13、63–100，desktop 分支 :90–94）；其他 profile 走 `runPluginCommand`，同样先取写锁，profile 不存在时按模板初始化（ops:591–603） | 〔实读〕 | 「桌面版已关」要由本设计自己检查（§2.6.2） |
| G3 | `runProfilePnpm`（ops:299 起）开始时记下 `package.json` 与 `pnpm-lock.yaml`（:318）。pnpm 成功后，对这次改动过的每个直接依赖做兼容性检查：`node_modules` 里没有它的 `package.json` 就跳过，清单在但读不出也算不通过；不通过时恢复两个文件并按锁文件重装（:498–557，`--frozen-lockfile` 在 :542）。全部通过且 `activateNewBundles` 不为假时调用 `reconcile`（:559）。pnpm 自己失败（退出码非 0）时不恢复任何文件 | 〔实读〕 | pnpm 失败后的复原靠本设计自己的备份（§2.6.4）。DSH 恢复用的是它开始时读到的文件，也就是脚本已经改过的清单；拒绝之后 profile 的样子、重跑时的行为与续跑见 G25 |
| G4 | `reconcile`（ops:96–123）：曾是依赖、现在不是的 bundle 从名单里删去；新增的、声明了 `dsh.bundle` 的依赖追加到名单末尾；不是依赖的 bundle（安装自带的 base、web-app、experimental 等）原位保留；名单没变就不写文件；写时用 `saveManifest`，即 `JSON.stringify(…, 2)` 加换行（ops:92–94） | 〔实读〕 | 用 `add`/`remove` 切换，两个新包会排到 9 个 experimental bundle 之后，宿主行的组合顺序随之改变。先把两个键写成目标形状再 `install`，`reconcile` 看到依赖前后相同，不改名单（§2.6.1） |
| G5 | profile 模板的 pnpm 设置为 `nodeLinker: hoisted`、`autoInstallPeers: false`（app-boot:598–604，`initProfile` :611–628）。两个 profile 都有 `pnpm-workspace.yaml`（键 `packages`、`nodeLinker`、`autoInstallPeers`）与 `pnpm-lock.yaml`（`importers['.'].dependencies` 下只有本项目两项，各有 `specifier`、`version`）〔只读核对，键名〕。桌面版锁文件格式 9.0，glmsandbox 的是 6.0；安装自带的 pnpm 是 11.28.5，PATH 上的是 8.6.10〔只读核对〕 | 〔实读〕〔只读核对〕 | 子包的 peer 不会装进 profile。glmsandbox 的锁文件格式与 PATH 上的 pnpm 8 一致，DEVELOPMENT.md §3 也是经 `bin.js` 这样建它的〔推断〕：切换与回滚继续用这一套，锁文件格式不变；桌面版用安装自带的 pnpm（§2.6.2） |
| G6 | `loadProfileDirectory`（app-boot:1015–1052）：名单里某个包读不出清单或没有 `dsh.bundle`，这个 bundle 就被跳过（:1024、:1036），`reportSkippedBundles` 在 stderr 打印 `skipping profile bundle`（app-boot:537–540），其余照常启动；指向缺席行的覆盖项只告警（F2） | 〔实读〕 | 合入后 profile 若还是旧形状，桌面版不会崩，只是本项目的行全部缺席并告警，切换后恢复。「合入后、切换前」这段因此可以恢复，但桌面版仍不得在这段时间启动（§4.2） |
| G7 | bundle 先按安装锚点解析，再按 profile 目录解析（app-boot:995–1003）。安装自带的包里没有 `dsh-glm-zcode`、`dsh-hourness`（`reference/dsh-desktop-0.2.1-rc.3/` 的目录清单） | 〔实读〕 | 两个包名从 profile 的 `node_modules` 解析 |
| G8 | profile `node_modules` 顶层与 scope 下的每个 junction，真实路径在 profiles 目录之外的，都是 linked root（app-boot:648–700）。`routeLinked`（app-boot:1676–1720）对裸导入沿导入方真实目录的全部祖先逐级查找：先看该级 `package.json` 的 `peerDependencies`（:1684，`readPeerNames` :1347），列了就走安装版，否则找该级 `node_modules` 里的本地副本。仓库根 `node_modules` 里有 `@deepseek-ai/cosmokit` 与 `@standard-schema/spec`〔只读核对〕 | 〔实读〕（F8 已核，这里补 B 下的后果） | 切换后仓库根不再是 linked root，但仍是 `packages/*/dist/**` 的祖先。根的 `peerDependencies` 去掉以后，子包漏写的 peer 会加载根 `node_modules` 里的开发副本。C2（preflight）仍是主防线，根的 peer 保留作兜底（§2.2） |
| G9 | 插件页按包名读显示信息：`readPluginMeta`（app-boot:2216–2246）经包的 `exports` 读 `<包>/locale/en.json` 与同目录的其他语言，`meta.title`、`meta.description` 须为非空字符串；图标取清单的 `icon`（只有导出了 `./package.json` 时才读清单）或 `<包>/icon` 导出，图标文件须在名字相符的包目录之内（`assertPackageOwned`，app-boot:2113–2119），格式为 SVG、PNG、JPEG、WebP，不超过 256 KiB（`iconOf`，app-boot:2085–2111）。插件页列的是 profile 的 `dependencies`，带 bundle 与启用标记（`readProfilePlugins`，app-boot:1164–1179） | 〔实读〕 | 两个宿主包各带 `locale/{en,zh}.json`、`icon.svg` 与导出 `./locale/*.json`、`./icon`。客户端包不在 dependencies 里，插件页不列它们，不需要显示信息（§2.2） |
| G10 | `withFileLock` 以 `wx` 方式创建同目录的 `<文件>.lock`，内容为进程号，操作完删除；持有者进程已退出时可以接管（atomic-write:189–219）。`runProfilePnpm` 把正在跑的 pnpm 记在 `.plugin-manager/run.json`（ops:208–249） | 〔实读〕 | 切换脚本写 `package.json` 时取同一把锁，调用 DSH 命令之前释放；`run.json` 存在就不动手（§2.6.2） |
| G11 | `--dump-default-config` 只组合 bundle 层，不读用户层，不启动，不求值 `!!js`；跳过的 bundle 打印在 stderr；会重写 profile 的 `cordis.yml`（dsh-bin:83–84，dump-config:24–28，profile-boot:216–222） | 〔实读〕 | 非 desktop 的 profile 用它核对组合，输出里没有用户的配置值（§2.6.3） |
| G12 | 仓库根 `pnpm-lock.yaml`（格式 6.0，`autoInstallPeers: true`）把根 `peerDependencies` 的 `@deepseek-ai/cosmokit`、`@standard-schema/spec` 记在根项目的 `dependencies` 下，`specifier` 为 `*` | 〔只读核对〕 | 开发安装靠根的 peer 装上这两个包，`src/shared/schemastery.ts` 的类型检查要用它们。去掉根的 peer，下一次 `pnpm install` 会删掉它们 |
| G13 | 桌面版 profile 的 `node_modules` 在 2026-10-29 之前除本项目两个 junction 外，还有 `@local/dsh-engineering-notice`、`@local/dsh-multitask-preset`、`@local/mcp-servers` 三个 junction（建于 2026-10-27 16:54，同日 20:20、20:23 插件管理器的几次 pnpm 操作之后仍在）。第 4 轮评审只读核对到：它们的目标在用户目录下、检出之外，都不存在，`readlinkSync` 能读出目标，`realpathSync.native` 与 `realpathSync` 报 `ENOENT`（只查是否存在，不读目标）。编排者核对它们不在 `dsh.profile.bundles`、`dependencies`、`pnpm-lock.yaml` 与 `cordis.patch.yml` 里，是孤立的链接，2026-10-29 应人的要求删去了这三个链接（只删链接本身）。本稿只读核对：`@local/` 仍在，是空目录；其余条目为本项目两个 junction 与 pnpm 的内部条目 `.ignored/`、`.pnpm/`、`.modules.yaml`、`.pnpm-workspace-state-v1.json`。悬空链接在 DSH 与 pnpm 里的处理：DSH 启动时 `linkedProfileRoots` 对目标不存在的链接跳过（app-boot:664–691，`realModuleDirectory` 报 `ENOENT` 时 `continue`）；pnpm 11 的 `readModulesDir` 列出 scope 下的名字（pnpm11:9977–9998），计划外条目只有 `lstat` 为目录、且有 `package.json` 的才挪进 `.ignored/`（`isPackageDir`、`isRealDir`，pnpm11:213436–213449），junction 不论目标在不在都不挪 | 〔只读核对，条目名与是否存在〕〔实读〕 | 时段之前 profile 还可能再变，不属于本项目的链接可能再出现，目标也可能不存在。脚本对这类链接不用 `norm`（`realpathSync.native` 在目标不存在时抛错），改记 `readlinkSync` 的原始目标与目标是否存在，前后按原始目标比较，缺了按原始目标重建（§2.6.2）；演练里放一个目标存在、一个目标不存在的 `@local` 链接（§2.6.5 R2）。2026-10-27 的时间证据与两种 pnpm 的源码（G21）都说明 `install` 不删清单以外的名字；运行时的行为没有核实，所以仍要核对 |
| G14 | `~/.dsh/profiles/` 下列了本项目包的只有 `desktop` 与 `glmsandbox`；`headless` 没有 | 〔只读核对，bundle 名〕 | 只切这两个 |
| G15 | rc.3 的桌面程序（`app.asar` 内全部 `.js`、`.cjs`、`.mjs`，含 `lib/main.js` 与 dsh 运行时包）里没有 `desktopNext` 字样 | 〔只读核对，检索〕 | 桌面 profile 的 `dsh.desktopNextPlugins`、`desktopNextScheduleBundle`、`desktopNextOnboarding` 不被这一版读取，切换不动它们 |
| G16 | `reconcile` 只在依赖的包声明了 `dsh.bundle.patch` 时才把它留在名单里（ops:101–105；`bundleManifest` :83–86 看的是 `manifest.dsh?.bundle?.patch`，没有这个键就返回空；包目录没有 `package.json` 时 `resolveBundleDir` 抛错）；`install` 之后先做兼容性检查（G3），通过了才到 `reconcile`（ops:498–559） | 〔实读〕 | 切换必须在新布局已经在主检出上之后做（合入之后）；profile 回滚必须在主检出撤销回旧布局之后做，否则 `reconcile` 会把恢复出来的两个旧名从名单里删掉，或者整个命令失败（§4.4） |
| G17 | `anchorPathSpec`（ops:71–76）把以 `.` 开头的相对路径参数（可带 `file:`、`link:` 前缀）按调用目录换成绝对路径再交给 pnpm，绝对路径原样传，所以 `dsh plugin add` 写出的依赖总是绝对路径。两个 profile 今天的两项依赖都是 `link:` 加盘符开头的绝对路径、只用正斜杠〔只读核对，只判断形状〕。sandbox:71 生成 profile 时写 `link:` 加 `slash(join(repo, dir))`，同样是绝对路径、正斜杠 | 〔实读〕〔只读核对〕 | 新依赖用同一种写法（§2.4）。切换、演练、README 的安装方法与探针生成的 profile 得到的依赖写法相同 |
| G18 | 两个 profile 的 `node_modules` 形状不同：desktop 有 `.modules.yaml`、`.pnpm-workspace-state-v1.json`、`.pnpm/`、`.ignored/`（下有 `@deepseek-ai`、`@openai`、`@standard-schema`、`zod` 四个目录，2026-10-26 被 pnpm 挪进去）与 `@local/`（2026-10-29 起是空目录，G13）；glmsandbox 只有 `.pnpm/` 与本项目两个 junction，没有 `.modules.yaml`。两个 profile 目录里都没有 `.bak-*` 文件（m1-cleanup 删了备份） | 〔只读核对，条目名与链接类型〕 | pnpm 对没有 `.modules.yaml` 的目录怎样处理没有核实（U14），演练的沙盒形状 profile 要剪成同样的条目（§2.6.5 R2）。pnpm 在这类 profile 里挪过条目，切换前后都要看 `.ignored/`（§2.6.2） |
| G19 | 插件页的启用开关经 `writeProfileBundles`（app-boot:1187–1200）改写 `package.json` 的 `dsh.profile.bundles`，其余键原样保留 | 〔实读〕 | `apply` 之后 `package.json` 仍可能被插件页改写；`rollback` 整文件恢复之前要确认文件还是 `apply` 写出的那份，否则会冲掉这次写入（§2.6.2 的 `hash3`、`hash5`） |
| G20 | Windows PowerShell 5.1 的 `Remove-Item -Recurse` 会进入目录 junction，删除目标里的内容〔推断：PowerShell 5.1 的已知行为，本设计没有在本机试〕。Node 在 win32 上对 junction 的 `lstatSync` 报 `isSymbolicLink()` 为真，`unlinkSync` 只删链接本身：sandbox:87–101 的 `unlinkProfile` 靠这一点，探针在进程退出时调用它（run-probe:90），第 0 步起的每次探针运行都这样拆链。目标不存在的 junction（Node 22.20.0）：`symlinkSync(<绝对路径>, <路径>, 'junction')` 照样能建；`lstatSync` 报链接、`isDirectory()` 为假；`readlinkSync` 原样返回建立时给的绝对路径（没有 `\\?\` 前缀与末尾分隔符），按它重建后再读得到同一个字符串，目标存在的 junction 同样往返不变；`realpathSync.native` 与 `realpathSync` 报 `ENOENT`；`unlinkSync` 能删 | 〔推断〕〔实读〕〔本机试验〕 | 指回检出的链接所在的目录，只用 Node 按 §2.6.6 先拆链、再删除。不属于本项目的链接可以按 `readlinkSync` 的结果逐字符比较、按它重建（§2.6.2） |
| G21 | 删除：两种 pnpm 的 `install` 对当前锁文件登记过、清单里已经没有的直接依赖调用 `removeDirectDependency`（pnpm11:201837，经 `pruneImporterDirectDeps` :201904、`collectDepsToRemove` :201930、`shouldRemoveCurrentPkg` :201942；pnpm8:134658）。它先经该路径读包的 `package.json` 找 bin（`removeBinsOfDependency`，pnpm11:201802、pnpm8:74131），再在 Windows 上对 `node_modules/<名字>` 调用 `removeOnWin`（pnpm11:201780、pnpm8:74118），也就是对链接所在的路径做递归删除：pnpm 11 用 `fs.promises.rm(p, { recursive: true, force: true, maxRetries: 3 })`（`rimraf`，pnpm11:25919），pnpm 8 用 `@zkochan/rimraf@2.1.2` 包装的 `rimraf` 包（pnpm8:74064）。递归删除遇到 junction 时只删链接还是进入目标，取决于运行时的 `fs.rm` 与 `rimraf` 的出错回退分支，本设计没有核实。路径不存在时两者都直接返回（pnpm 11 有 `force`；pnpm 8 在 `ENOENT` 时返回），`removeBinsOfDependency` 读不到清单就返回。不删的：只有 `pnpm fetch` 与 `pnpm prune` 把 `pruneDirectDependencies` 设为真（pnpm11:245316、289984；pnpm8:193007、193338），按 `node_modules` 实际条目删去清单以外名字的那一段只在这时运行（pnpm11:201949 `addUnwantedDirectDeps`，由 :201937 的条件把关；pnpm8:134721 起）；`install` 只删锁文件登记过的直接依赖，`@local/*` 不在其中（与 G13 的观察一致）。隔离：pnpm 11 的 hoisted 链接只把 `lstat` 为目录、且有 `package.json` 的计划外条目挪进 `.ignored/`（`removeDirsOutsidePlan` :213222、`quarantineDir` :213235、`findUnplannedDirs` :213423、`isPackageDir` :213436、`isRealDir` :213441）；pnpm 8 只在条目不是链接时把它挪进 `.ignored/`（`safeIsInnerLink`，pnpm8:186663）。两种 pnpm 都不挪链接 | 〔实读，pnpm 产物〕；运行时对 junction 的行为〔未核实〕 | 指回检出的链接不交给 pnpm 删除：`apply` 在运行 pnpm 之前拆掉两个旧链接（第 3b 小步），`rollback` 拆掉两个新链接（第 2 小步），pnpm 的删除只会落在已经不存在的路径上（U16）。`.ignored/` 里不会出现链接，出现即核对不过（§2.6.2 条目核对） |
| G22 | `--dump-default-config` 的输出由 `renderConfigDump`（app-boot:4038）经 `groupedDump`（app-boot:4086）生成：连续同源的行为一组，组前一行 `# == <来源>`（:4092），组内容是 `yaml.dump(group, { schema, noRefs: true })`（:4093），即一个顶层序列，没有传 `sortKeys`。来源是该行所属层的标签，被后面的层改过时为 `<来源>, patched by <层>, …`（:4103）；bundle 层的标签是包名（dump-config:38 `label: layer.packageName`），基础配置是 profile 的 `cordis.yml`（profile-boot:127–128 `PROFILE_ROOT_FILENAME`，app-boot:4052 `basename`）。不带 `id` 的 `insert` 把条目追加在顶层（app-boot:87 `data.push(...insert)`），条目是 patch 解析结果的拷贝（app-boot:4054–4059 `structuredClone`）。今天的两份 patch 里，每条 insert 都以 `id` 开头〔只读核对〕 | 〔实读〕；js-yaml 不排序时按键的插入顺序输出〔推断〕 | 行 id 按行首的 `- id: ` 取，层按之前最近的 `# == ` 行取（§2.6.2 组合输出的读法）；两包的 patch 照今天的写法让每条 insert 以 `id` 开头（§3.1） |
| G23 | 本机 git 2.55.0.windows.3：在主检出里 `git rev-parse --git-common-dir` 输出相对路径 `.git`，在 worktree 里输出绝对路径；加 `--path-format=absolute` 后两处都输出正斜杠的绝对路径 | 〔只读核对〕 | 同仓判断用 `--path-format=absolute`，再按 `norm` 比较（§2.6.5 R0、§5.2） |
| G24 | `.agents/tasks/m1-l4/restart.ps1`：启动的是写死的 `%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe`；先对 `DeepSeek Harness` 进程 `CloseMainWindow`、等 3 秒、`Stop-Process -Force`（第 4–6 行），再以 `--remote-debugging-port=9333` 启动，stdout 与 stderr 写到 `$PSScriptRoot` 下的 `dsh-out.txt`、`dsh-err.txt` | 〔只读核对〕 | 直接运行原脚本会覆盖 m1-l4 的记录；放在 split 目录下的逐字节拷贝只因 `$PSScriptRoot` 不同而写到 split 目录（§4.1 A3、A5）。切换脚本的 `<D>` 必须与这个写死的路径相同（§4.2 第 1 项） |
| G25 | 重跑时 DSH 的兼容性检查只告警、不拒绝。`runProfilePnpm` 开始时记下 `package.json`、`pnpm-lock.yaml`（ops:318）与每个直接依赖在 `node_modules` 里的 `package.json`（ops:320）。pnpm 退出码为 0 之后逐个检查依赖：依赖的写法与开始时相同、装好的清单也与开始时相同的算「未改动」（ops:507），未改动的依赖不通过时只输出一段以 `dsh: warning: ` 开头的提示（ops:530），命令照常 `reconcile`（ops:559），以 0 退出。改动过的依赖不通过时才拒绝：`restore()` 写回开始时读到的两个文件（ops:540），运行修复安装 `install --frozen-lockfile`（ops:542–548），以 1 退出，并输出以 `dsh: installation rejected: ` 开头的一行（ops:553）。两类提示都经 `onOutput` 写到 stderr（dsh-plugin:86–88）。`install` 路径上另有两处 `dsh: warning:`：profile 的 `compatibility.json` 有问题（dsh-plugin:73，`readProfileCompatibility` app-boot:372 起，文件不存在时没有提示），以及新增的依赖没有 `dsh.bundle`（ops:111，只对开始时不是依赖的名字）。修复安装面对的是第 3 小步写出的 S1 清单与切换前的锁文件，两者不一致时 pnpm 报 `OUTDATED_LOCKFILE`（pnpm11:233081、233095，pnpm8:190289） | 〔实读〕；修复安装在建链接、删链接之前就失败，`node_modules` 里留着两个新 junction〔推断〕 | 第一次 `install` 被拒之后，清单是 S1、两个新 junction 在、锁文件是旧的，按 §2.6.2 的定义是 S2（C01）。重跑时两个新依赖都算未改动，同样的不兼容只剩告警、退出码 0，只看退出码会把拒绝绕过去。所以第 4 小步同时看退出码与这两类行，运行前检查排除 `compatibility.json`（§2.6.2） |
| G26 | CLI 执行方式下 pnpm 继承 DSH 的 stdout、stderr 与 stdin（ops:383–385），DSH 不给它设静默上限（ops:438–441：输出不经 DSH，没有可以观察的输出）。DSH 把 pnpm 的进程号写进 `.plugin-manager/run.json`（ops:444），只在自己看到运行结束时删除（ops:567）；下一次操作遇到这个文件，记下的进程还在就拒绝，已退出才删掉它（`activeRecordedRun`，ops:225–250）。desktop 的 plugin 命令在 `package.json.lock` 写锁里运行（dsh-plugin:90），其他 profile 同样（ops:591–603） | 〔实读〕 | pnpm 卡住时 DSH 不会自己停，时段里运行命令的又是编排者的工具调用，没有终端可以按 Ctrl+C。所以时限由脚本自己执行：本次输出文件连续 600 秒没有增长，或这次运行超过 1500 秒，脚本用 `taskkill /PID <DSH 子进程号> /T /F` 结束 DSH 及其全部子进程（§2.6.2 第 4 小步，D05）。DSH 被强行结束时不会删 `run.json` 与 `package.json.lock`，下一次运行由运行前检查第 3 条拦住，交人（§4.4） |
| G27 | 两种 pnpm 都用 ci-info 判断是否在 CI 里：`CI` 等于字符串 `false` 时跳过全部判定（pnpm11:177369，pnpm8:126791），否则 `CI`、`BUILD_ID`、`BUILD_NUMBER`、`CI_NAME` 等通用变量与各厂商的变量任一存在即判为 CI。判为 CI 时清空 `node_modules` 之前不询问（pnpm11:233993，pnpm8:127090、127295）。不判为 CI 时，pnpm 11 的 `confirmPurge` 在 stdin 不是 TTY 时抛 `ABORTED_REMOVE_MODULES_DIR_NO_TTY`（pnpm11:233739–233749）；pnpm 8 的 `purgeModulesDirsOfImporters` 用 enquirer 询问、默认值为是，不查 TTY（pnpm8:127231–127240）。pnpm 8 只在 `node_modules/.modules.yaml` 存在时才校验、才可能清空（`getContext`，pnpm8:127079–127080） | 〔实读〕；pnpm 8 在 stdin 为空设备时怎样回答询问〔未核实〕 | 子进程设 `CI=false`（U13）。DSH 在 CLI 方式下把 `process.env` 原样交给 pnpm（ops:330），这个设置能到 pnpm。desktop 用 pnpm 11，想清空时必然中止；glmsandbox 用 pnpm 8，不走清空路径（U13） |

### 1.2 假设（相对 0.3 §1.6 的增删）

| # | 假设 | 在哪核实 | 不成立时 |
| --- | --- | --- | --- |
| U4′（取代 U4） | 切换后插件页列出 `dsh-glm-zcode`、`dsh-hourness`，都启用，各有 §2.2 的标题、描述与图标，没有告警；不再列 `dsh-glm-hourness`、`dsh-glm-hourness-ui` | L4 第一轮 | 只是显示问题：按插件页的告警修 locale 或图标，下一次重启核对 |
| U5（改为在演练里核实） | `dsh plugin --profile <名> add <检出>/packages/glm <检出>/packages/hourness -w` 能把两个包装进一个新 profile，写出的依赖是 `link:` 加盘符开头的绝对路径、只用正斜杠（与切换写的相同，G17），`node_modules` 里是 junction（README 要写的安装方法） | 演练 R5 | README 写实际可用的做法；仍不行就交人 |
| U9 | 删除：没有伞包，不会出现伞包与子包同列 | — | — |
| U10 | `install --no-frozen-lockfile` 在两个键已改好、两个旧链接已由 `apply` 第 3b 小步拆掉的 profile 里：建两个新 junction，锁文件只改 `importers`，不动不属于本项目的链接（演练里的 `@local/*`；真实桌面版 2026-10-29 起没有这类链接，G13），不在顶层、`@*/` 与 `.ignored/` 之下建别的条目。pnpm 11 的源码支持「不删清单以外的名字、不挪链接」两点（G21、G13），其余是推断 | 演练 R3：桌面形状的演练 profile 里放两个 `@local` junction，一个指向放了哨兵文件的目录，一个目标不存在；`apply` 报告任何重建、目标变化或条目核对不过，R3 就不过；真实切换的前后核对 | 演练失败就不申请时段；真实切换后缺了不属于本项目的链接，按记录的原始目标重建并报告 |
| U11 | 两种入口（桌面版启动器、`bin.js`）的 plugin 命令都按 `DSH_HOME` 找 profile：`runPlugin` 用 `resolveProfileDir(profile)`（dsh-plugin:72），默认 home 取 `resolveDshHome()`（app-boot:546），读 `DSH_HOME`（dsh-home-paths:15）。源码如此，没有运行验证 | 演练 R6：`~/.dsh/profiles/` 下的名字与 R1 相同 | 演练立即停止；`rehearse` 的收尾按 §2.6.6 拆链后删除 R1 之后新出现的 `glmh-split-*` profile（只删这个前缀、只删新出现的）；不申请时段，交人 |
| U12 | 恢复后的 `package.json` 与锁文件，用写出它的那种 pnpm 执行 `install --frozen-lockfile`，能装回旧形状 | 演练 R4（两种 pnpm 各一遍） | 回滚改用 `--no-frozen-lockfile`；锁文件不再与备份逐字节相同，以结构比对为准 |
| U13（第四稿改写） | pnpm 打算清空 `node_modules` 时，不会在没有人确认的情况下清空。pnpm 11 一半已核实：子进程设 `CI=false`，pnpm 不判为 CI，询问不会被跳过，stdin 不是 TTY 就中止（G27）。pnpm 8 一半：它的询问不查 TTY，所以靠不走清空路径。glmsandbox 切换前没有 `.modules.yaml`，`validateModules` 不运行；回滚与续跑时读到的 `.modules.yaml` 由同一个 pnpm 8 以同样的设置写出，不会判为需要清空〔推断〕 | pnpm 11 一半不需要再核实；pnpm 8 一半由演练的沙盒形状 profile 走同样的路径：第一次 `apply` 之前剪掉 `.modules.yaml`（R2），续跑与回滚读 pnpm 8 自己写的那份（R3、R4） | pnpm 11 中止时 `apply` 第 4 小步不通过，退出码 1，按 §4.4 处理。pnpm 8 若清空，条目核对判不过；glmsandbox 没有 `@local/*`，旧链接在任何一次 pnpm 之前已经拆掉，这时 `node_modules` 里至多有指向 `packages/*` 的两个新链接，那里的内容都入库或可以重新构建（§5.3） |
| U14 | pnpm 8 在没有 `.modules.yaml` 的 `node_modules`（glmsandbox，G18）里执行 `install`，结果与有 `.modules.yaml` 时相同：建两个新 junction，顶层与 `.ignored/` 之下没有别的新条目（`.modules.yaml` 这类 pnpm 内部条目除外）〔推断〕。旧 junction 在 pnpm 运行之前已由第 3b 小步拆掉，附录 0.2 设想的「旧 junction 被挪进 `.ignored/`」不会再出现；两种 pnpm 本来也不挪链接（G21） | 演练 R2 把沙盒形状 profile 的 `node_modules` 剪成 glmsandbox 的条目名，R3、R4 在它上面跑 | 条目核对不过（§2.6.2），演练不过，不申请时段 |
| U15（新增） | `rollback` 先拆掉 `node_modules` 里 `dsh-glm-zcode`、`dsh-hourness` 两个链接，再执行 `install --frozen-lockfile`：pnpm 接受它上次登记过、现在已经不在 `node_modules` 里的条目，照常装回旧形状〔推断：pnpm 的行为〕 | 演练 R4 走的就是这条路径 | `rollback` 退出码 1，按 §4.4 交人，用备份手工恢复 |
| U16（新增） | 依赖已从清单删去、它在锁文件里登记过的链接也已不在 `node_modules` 里时，pnpm 照常完成 `install --no-frozen-lockfile`，并更新锁文件的 `importers` 与 `.modules.yaml`。删除那一段在两种 pnpm 里都容忍路径不存在（G21，〔实读〕），整个安装照常完成是推断 | 演练 R3，两种 pnpm 各一遍（桌面形状用 `carrier` 与 pnpm 11，沙盒形状用 `plain` 与 pnpm 8） | `apply` 第 4 小步退出码 1，按 §4.4 处理；演练里出现就不申请时段 |
| U17（第五稿新增） | pnpm 11 的 `install` 与 `install --frozen-lockfile` 遇到 scope 目录下目标不存在的 junction，照常完成，不删它、不挪它、不改它的目标，也不创建它的目标。源码上 `readModulesDir` 会列出它，`isRealDir` 用 `lstat`，不把它当作要隔离的目录（G13），其余代码路径会不会因读它而失败是推断 | 演练 R3、续跑与 R4：桌面形状的 `@local/rehearsal-dangling` 仍是链接、原始目标不变，它的目标 `<run>/missing` 仍不存在 | 演练不过，不申请时段；先查 pnpm 怎样处理，再回到设计。pnpm 8 一半没有演练：glmsandbox 没有不属于本项目的链接，沙盒形状按它剪（R2）；时段里 `plan` 发现 glmsandbox 有这类链接时停下交人（§4.2 第 8 项） |

U1–U3、U7、U8 不变。

## 2. 取代 §3.1–§3.7

### 2.1 目录（取代 §3.1）

```
package.json            dsh-glm-hourness：开发工作区根（scripts、devDependencies、peerDependencies），不是 bundle
tsconfig.json           同 0.3
tsconfig.knip.json      同 0.3
knip.js                 同 0.3
scripts/packages.mjs    目录表（0.3 §2.7）；PACKAGES 的顺序就是 profile 里两包的顺序
packages/
  glm/
    package.json        dsh-glm-zcode
    cordis.patch.yml    glm-llm、glm-login、glm-prompt、glm-compact，第 6 步加 glm-ui
    tsconfig.json
    locale/             en.json、zh.json：插件页的标题与描述（第 5 步）
    icon.svg            插件页图标（第 5 步，新画）
    dist/               构建产物，不入库
    ui/                 dsh-glm-zcode-ui（第 6 步）：package.json、index.js、client.js（产物，不入库）
  hourness/
    package.json        dsh-hourness
    cordis.patch.yml    data、guard、memory、workflow、hourness、graph、graph-panel，第 6 步加 ui
    tsconfig.json
    locale/             en.json、zh.json（第 5 步）
    icon.svg            由根 icon.svg 移来（第 5 步）
    dist/
    ui/                 dsh-hourness-ui（第 6 步）
ui/
  tsconfig.json         客户端源码的类型检查（不变）
  src/                  客户端源码（不变）
src/                    宿主源码（不搬家）
```

删除：
- 第 5 步：根 `cordis.patch.yml`（同 0.3）；根 `locale/`（内容由两个包的 locale 接替）；根 `icon.svg` 以 `git mv` 移到 `packages/hourness/icon.svg`；`knip.jsonc`（同 0.3）。
- 第 6 步：`ui/package.json`、`ui/cordis.patch.yml`、`ui/index.js`、`ui/locale/`、`ui/icon.svg`、`ui/src/client.tsx`。F-35 给 `ui/` 加的 locale 与图标随之删去，插件页的显示改由两个宿主包承担（§2.2）。

陈旧产物（根 `dist/`、根 `ui/client.js`，都不入库）：
- worktree：同 0.3，第 5 步构建后删根 `dist/`，第 6 步构建后删根 `ui/client.js`。
- 主检出：合入之后、跑门禁之前删除（§4.2 第 6 项），不再保留到 L4 第一轮。0.3 保留它们，是给「忘了关桌面版时还在跑的旧布局」兜底；B 下合入以后根清单没有 `dsh.bundle`，`ui/` 没有清单，旧 profile 的两项 bundle 都会被跳过（G6），这些文件已经不会被任何 profile 加载。整体回滚时先删主检出的 `packages/`（新布局的产物），再在撤销后的树上 `npm run build` 重新生成根的这两样（§4.4）。
- 忽略项（`eslint.config.js` 的 `'dist/'` 与 `'ui/client.js'`，`.gitignore` 的 `/ui/client.js`，`knip.js` 的 `ui/client.js`，`.jscpd.json` 的 `**/ui/client.js`）保留到清理提交。清理提交在 L4 第一轮通过之后、第二轮的关闭窗口里（§4.3 第 10 项），对应 0.3 合入顺序第 7 项。理由换成：别的检出（其他 worktree、主检出上并行的运行）各自还有陈旧产物，清理提交之前它们的 `npm test` 照常通过。清理提交的说明写明「其他检出先删自己的根 `dist/` 与 `ui/client.js`，再 rebase 到这个提交之后」。

### 2.2 清单（取代 §3.2）

| 清单 | 要点 |
| --- | --- |
| 根 `package.json`（第 5 步起） | `name` 仍是 `dsh-glm-hourness`，仍在第 2 行：探针把根 `package.json` 当作读文件与 grep 的夹具，期望第 2 行就是这一行（主检出的 `scripts/probe/run-probe.mjs`:149、155、657、670；worktree 第 2 步 `0fe76a5` 上为 :196、202、731、744）。加 `private: true`。`version` 0.3.0。`description` 改为英文一句：GLM-Hourness development workspace that builds and checks the two DSH bundles under packages/ (dsh-glm-zcode, dsh-hourness)。删去 `main`、`exports`、`files`、`dsh`。`type` module（`eslint.config.js`、`knip.js` 是 ESM）、`license`、`scripts`（0.3 §7.4）、`peerDependencies`、`devDependencies`、`dependencies` 不变。不加 `workspaces`，仓库里也不加 `pnpm-workspace.yaml`：子包没有自己的依赖要装，变成工作区成员会改变 pnpm 的安装方式与 knip 的分析单位（基线的键随之变化），没有收益 |
| `packages/glm/package.json` | 同 0.3，另加 `description`（英文一句）、`license` MIT，以及导出 `./locale/*.json` → `./locale/*.json`、`./icon` → `./icon.svg` |
| `packages/hourness/package.json` | 同 0.3，另加同样的三项 |
| `packages/*/ui/package.json` | 同 0.3。不带 locale 与图标：客户端包不在 profile 的 dependencies 里，插件页不列它们（G9） |
| `ui/package.json` | 第 5 步不动（仍是今天的单行客户端包 `dsh-glm-hourness-ui`，含 F-35 的 locale 与图标导出）；第 6 步删除 |

根保留 `peerDependencies` 的理由：开发安装靠它装上 `@deepseek-ai/cosmokit` 与 `@standard-schema/spec`（G12）；切换后根仍是 `packages/*/dist/**` 的祖先，子包漏写 peer 时运行时照样走安装版（G8）。它不再影响任何 bundle 的兼容性判定：根不在任何 profile 的名单里，F7 也只看 `engines.dsh` 与 `@deepseek-ai/dsh*`。不选的做法是改成钉版本的 `devDependencies`：要重写仓库锁文件，换了 pnpm 版本的人会得到整份锁文件的格式升级，收益只是字段名更贴切。

显示信息（第 5 步写；文字由 agent 起草，人可以改）：

| 包 | `meta.title`（en / zh） | `meta.description`（en / zh） | 图标 |
| --- | --- | --- | --- |
| `dsh-glm-zcode` | GLM ZCode channel / GLM ZCode 通道 | Runs GLM in DeepSeek Harness on its ZCode 3.16.3 training distribution: the native channel and login, the prompt and tool-surface mirror, lazy tool loading, compaction, and the GLM button and settings page. / 在 DeepSeek Harness 中按 ZCode 3.16.3 的训练分布运行 GLM：原生通道与登录、提示词与工具面镜像、工具懒加载、压缩，以及 GLM 按钮与设置页。 | 新画：与现有图标同一块底板（64×64，`#101826`、圆角 14 的方块），`#5eead4` 描边 3 画一个 Z 形通道（上下两条横线加一条对角线），对角线中点一个 `#f59e0b` 圆点；不用文字（SVG 文字依赖字体） |
| `dsh-hourness` | Hourness orchestration / Hourness 编排层 | Orchestration for any model in DeepSeek Harness: the project graph and its panel, guard rails, the audit journal, memory, and the /hourness report. / 对任何模型生效的编排层：项目图与右侧栏面板、执行边界、审计流水、记忆库与 /hourness 报告。 | 根 `icon.svg`（沙漏），与包名 hourness 对应 |

`ui/icon.svg`（面板里的小图）在第 6 步随 `ui/` 的包文件删去。

### 2.3 行 id 与其他持久化标识（取代 §3.3）

0.3 §3.3 的内容全部有效：行 id 不改，只新增 `glm-hourness/glm-ui`；cordis 服务名、notice 来源、提示词节名、命令名与 `definitionId`（`dsh-glm-hourness/*`）、cordis 插件名（`dsh-glm-hourness/<行>`）、用户级目录 `glm-hourness`、面板页面 id 与 kind、插槽 id 都不改。B 下多一条：根包名 `dsh-glm-hourness` 也不改（§2.2）。这些名字里的 `glm-hourness` 读作项目名，与哪个包无关。`split` 第二条验收的改写见 §7.4。

### 2.4 桌面版 profile：切换前后（取代 §3.4）

位置、读法同 0.3。`package.json` 顶层键为 `name`、`private`、`dsh`、`dependencies`；`dsh` 下为 `profile`、`desktopNextPlugins`、`desktopNextScheduleBundle`、`desktopNextOnboarding`，后三个不动（G15）。

`dsh.profile.bundles`：

| 位置 | 今天 | 切换后 |
| --- | --- | --- |
| 1–2 | `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` | 不变 |
| 3 | `dsh-glm-hourness` | `dsh-glm-zcode` |
| 4 | （第一个 experimental bundle） | `dsh-hourness` |
| 今天 4–12，切换后 5–13 | 9 个 experimental bundle | 不变，整体后移一位 |
| 13 | `dsh-glm-hourness-ui` | 删去 |

`dependencies`：删去 `dsh-glm-hourness`、`dsh-glm-hourness-ui`；加 `dsh-glm-zcode`、`dsh-hourness`，值为 `link:` 加 `<检出>/packages/glm`、`<检出>/packages/hourness` 的绝对路径，反斜杠换成正斜杠。这与两个 profile 今天的写法、`dsh plugin add` 与 `scripts/sandbox.mjs` 写出的形式相同（G17）。真实切换时 `<检出>` 是主检出，演练时是 worktree；路径取 `fs.realpathSync.native` 的结果（§2.6.2）。

两个包放在原伞包的位置、GLM 在前，理由是宿主行的组合顺序与今天完全相同：今天第 3 项的伞包按 GLM、编排层的顺序插入 11 个宿主行，各行的激活、监听器的注册，以及它们与 experimental bundle 的行之间的先后都不变。变的只有客户端行：`glm-hourness/ui` 由今天的第 13 项提前到第 4 项（R31），新的 `glm-hourness/glm-ui` 在第 3 项。不选「编排层包放在最后」：那样客户端行的位置不变，但编排层的 7 个宿主行会排到 9 个 experimental bundle 之后，guard 的 `tools/pre-execute` 监听器与组装监听器相对 experimental 行的先后都会变，影响面比客户端行的注册次序大。

`cordis.patch.yml`：不改。共 12 条顶层条目（m1-cleanup 去掉 `llm-pi-ai` 之后）。

| id | 覆盖的键 | 切换后的目标 | 结果 |
| --- | --- | --- | --- |
| `glm-hourness/glm-prompt` | `config`、`disabled` | `dsh-glm-zcode` 的 `packages/glm/cordis.patch.yml` 插入的同 id 行 | 匹配（F2，覆盖项没写 `name`，不比对模块路径）；`config` 整体替换，同今天 |
| `glm-hourness/glm-llm` | `disabled` | 同上 | 匹配 |
| `glm-hourness/memory`、`glm-hourness/workflow`、`glm-hourness/hourness` | `config.home` | `dsh-hourness` 的 `packages/hourness/cordis.patch.yml` | 匹配；`hourness` 行的模块变为 `packages/hourness/dist/report/index.js`，覆盖项不比对 |
| 其余 7 条（`ui-settings-account`、`ui-chat`、`ui-settings`、`agent-default-model`、`permission`、`ui-conversation`、`plugin-market`） | — | DSH 自己的行 | 与本项目无关 |

`glm-hourness/ui`、`glm-hourness/glm-ui` 在 profile 里没有覆盖项。`desktop-next.cordis.patch.json`、`desktop-next.runtime.patch.json` 只覆盖 DSH 自己的行（0.3 §3.4），不动。`cordis.yml` 每次启动重写，不比对。

`node_modules`：`dsh-glm-hourness`、`dsh-glm-hourness-ui` 两个 junction 换成 `dsh-glm-zcode` → `<主检出>/packages/glm`、`dsh-hourness` → `<主检出>/packages/hourness`；`@local/`（2026-10-29 起是空目录，原来的三个孤立链接已由编排者应人的要求删去，G13）、`.ignored/` 与 pnpm 的内部条目保持原样。时段之前若又出现了不属于本项目的链接，切换按 §2.6.2 记下它们的原始目标，前后比对，缺了就重建。`pnpm-lock.yaml` 的 `importers['.'].dependencies` 换成两个新名字，由 pnpm 写。

### 2.5 glmsandbox（取代 §3.5）

bundles 由 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`、`dsh-glm-hourness`、`dsh-glm-hourness-ui` 改为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`、`dsh-glm-zcode`、`dsh-hourness`；dependencies 同桌面版；patch 层为空，不动。拆包期间的验证不用它（0.3 §7.3 的生成 profile）。切换之后 `npm run calibrate` 照旧用它，标定的覆盖行按行 id 写，不受影响。切换与回滚用 `plain` 入口加 PATH 上的 pnpm（G5），组合用 `--dump-default-config` 核对（G11）。它的 `node_modules` 没有 `.modules.yaml`（G18），演练按这个形状准备（§2.6.5 R2）。

### 2.6 profile 切换（取代 §3.6）

#### 2.6.1 做法的选择

| 做法 | 结果 | 取舍 |
| --- | --- | --- |
| a. `add` 两个新包、`remove` 两个旧包（0.3 §3.6 的写法） | pnpm 写 dependencies；`reconcile` 把新包追加到名单末尾、删去旧包（G4）；两次 pnpm 运行 | 宿主行排到 experimental 之后，要恢复顺序还得再手改名单；桌面版还必须用启动器（G1） |
| b. 脚本只改 `dsh.profile.bundles` 与 `dependencies` 两个键，再运行一次 `install` | `package.json` 的改动正好是这两个键；`reconcile` 看到依赖前后相同，不改名单（G4）；pnpm 只同步 `node_modules` 与锁文件 | 选这个 |
| c. 只改两个键，手建 junction，不运行 pnpm | 锁文件与 `.modules.yaml` 和清单对不上，下一次插件页装东西时由 pnpm 重新收拾，结果没有验证过 | 不选 |

选 b。写清单时取 DSH 的写锁并原子替换，格式与 DSH 自己写清单时相同（G10、G4 的 `saveManifest`）；`node_modules` 与锁文件由 pnpm 改。脚本对 `node_modules` 只有四种动作，都只针对链接，删除一律用 `unlinkSync`：
1. `apply` 在运行 pnpm 之前拆掉两个旧 junction（第 3b 小步，G21、U16）。
2. `rollback` 在运行 pnpm 之前拆掉两个新 junction（第 2 小步，U15）。
3. 条目核对时，按记录的原始目标重建缺了的、不属于本项目的 junction（目标不存在也照样重建，D01）。
4. 条目核对时，拆掉新出现的、指回检出的链接；这不在预期之内（G21），命令随之退出码 1。

`apply` 与 `rollback` 对 `node_modules` 只有这四种动作，不删其中的目录与文件；`rehearse` 的 R2 只在演练 profile 里建 `@local/` 与其中两个链接、删文件条目，`remove` 按 §2.6.6（C08）。这样，`apply` 与 `rollback` 运行的每一次 pnpm 开始时，profile 里都没有 pnpm 要删除的、指回检出的链接（§5.3）。

#### 2.6.2 切换脚本

位置：`<M>/.agents/tasks/split/profile-switch.mjs`，同目录放一份 `profile-shape.mjs`，是分支上 `scripts/profile-shape.mjs` 的逐字节拷贝。两者都不入库（AGENTS.md：一次性脚本不留在仓库里），所以不在分支的实现—评审循环里，改由 §4.1 A3 的独立代码评审把关。Node 22 运行，只用内置模块。

脚本从自己的位置推出 `<M>`（往上三级），`<M>/.git` 必须是目录（主检出；worktree 的 `.git` 是文件），否则退出码 2。形状函数 `profileShape`、`compareShapes` 从同目录的拷贝导入：`plan`、`apply` 运行前核对拷贝的 SHA-256 等于 `<repo>/scripts/profile-shape.mjs`，不等就退出码 2；`rollback` 只用拷贝，因为整体回滚时主检出上的 `scripts/profile-shape.mjs` 已随撤销删去（§4.4）。

命令：

```
node <M>/.agents/tasks/split/profile-switch.mjs plan     --profile <名> --repo <检出> [--old <目录>] [--home <目录> --cli carrier|plain]
node <M>/.agents/tasks/split/profile-switch.mjs apply    --profile <名> --repo <检出> --record <文件> [--old <目录>] [--home <目录> --cli carrier|plain]
node <M>/.agents/tasks/split/profile-switch.mjs rollback --profile <名> --record <文件> [--home <目录> --cli carrier|plain]
node <M>/.agents/tasks/split/profile-switch.mjs rehearse --worktree <worktree> --run <目录>
node <M>/.agents/tasks/split/profile-switch.mjs remove   --path <目录> [--worktree <worktree>]
```

路径的比较：记 `norm(p)` 为 `fs.realpathSync.native(p)` 去掉末尾的分隔符（盘符根除外）。`p` 不存在（`lstatSync` 报 `ENOENT`）时，取最近一级存在的祖先做 `norm`，再接上其余各段；`p` 存在而 `realpathSync.native` 抛错（例如目标不存在的链接）时，`norm(p)` 算作「解析不出」，不走这条退路。两个路径「相等」指 `norm` 之后相等，win32 上不分大小写；「在 X 之下」指 `norm(p)` 以 `norm(X)` 加一个分隔符开头，同样不分大小写（A08）。`norm` 用于：`<M>`、`<D>`、`<repo>`、`<old>` 与各个路径参数；本项目四个名字的链接（S0、S2、第 3b 小步与 `rollback` 第 2 小步的判断）；新出现的链接的目标（见条目核对）。

不属于本项目的、`apply` 第 1 小步时已经在的链接不用 `norm`（D01）：记 `raw(p)` 为 `readlinkSync(p)` 返回的字符串，原样记录、原样比较（逐字符相等，区分大小写）；目标是否存在按 `existsSync(path.resolve(dirname(p), raw(p)))` 判断。Node 22.20.0 上 junction 的 `raw` 就是建立时给的绝对路径，按它重建后再读得到同一个字符串，目标不存在时也一样（G20），所以前后比较不需要规范化。

参数：
- `--repo`：新布局所在的检出，绝对路径。从它的 `scripts/packages.mjs` 读 `PACKAGES` 的 `name`、`dir`、`rows`、`client` 与顺序。
- `--old`：两个旧 junction 应当解析到的目录，默认等于 `--repo`；`dsh-glm-hourness` → `<old>`，`dsh-glm-hourness-ui` → `<old>/ui`。真实切换时两者都是 `<M>`；演练时旧布局是 `<M>`、新布局是 worktree。
- `--home`：DSH home。真实切换不给，用 `~/.dsh`，并从子进程环境里去掉 `DSH_HOME`。给了就只用于演练：必须等于 `<run>/dsh-root`，其中 `<run>` 是 `<M>/.llm/l4-split/` 的直接子目录、名字匹配 `^rehearsal-[0-9]+$`（与 `--run` 同一条规则，§2.6.5；C03）；不得等于 `~/.dsh`，也不得在它之下；profile 名必须以 `glmh-split-` 开头；`--cli` 必须显式给出。
- `--cli`：两种入口，都由脚本以 `<D>\DeepSeek Harness.exe` 直接起进程（不经 `cmd`），环境设 `ELECTRON_RUN_AS_NODE=1`：
  - `carrier`：exe 的参数为 `--expose-internals <D>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js`，再接 DSH 的参数，与 `<D>\resources\runtime\cli\bin\dsh.cmd` 相同；pnpm 用安装自带的那份（G1）。
  - `plain`：exe 的参数为 `<D>\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js`，再接 DSH 的参数，与 DEVELOPMENT.md §3、sandbox:19–21 与 37–41 相同；pnpm 取 PATH。
  `desktop` 固定 `carrier`，`glmsandbox` 固定 `plain`（G1、G5）；不带 `--home` 时可以不写，写了必须与之相符。
- `--record`：记录文件。不带 `--home` 时必须等于 `<M>/.llm/l4-split/switch-<profile>.json`；带 `--home` 时必须等于 `<run>/switch-<profile>.json`，`<run>` 是 `--home` 的父目录（A10；第四稿由「在 `<M>/.llm/l4-split/` 之下」收紧为固定路径，与 C03 同类）。改名留下的旧记录（`.stale-*`、`.rolled-back-*`）不再作为 `--record` 使用。
- `--run`、`--worktree`、`--path`：见 §2.6.5、§2.6.6。

本项目的两份行 id 清单写死在脚本里，内容与 `tests/contracts.spec.ts` 的字面清单（§3.3）相同（A09）：
- `OLD_IDS`（旧布局，12 个）：`glm-hourness/` 加 `glm-llm`、`glm-login`、`glm-prompt`、`glm-compact`、`data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel`、`ui`。
- `NEW_IDS`（新布局，13 个），分两组。GLM 组：`glm-llm`、`glm-login`、`glm-prompt`、`glm-compact`、`glm-ui`。编排层组：`data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel`、`ui`。

两份清单的核对：`plan`、`apply` 运行前，`NEW_IDS` 的两组分别等于 `<repo>/scripts/packages.mjs` 里两个包的 `rows` 的 id 加 `client.row`（集合相等，按 `PACKAGES` 的顺序对应 GLM 组、编排层组）。`rehearse` 的 R2 与 `rollback` 运行前，`OLD_IDS` 等于 `<old>/cordis.patch.yml` 与 `<old>/ui/cordis.patch.yml` 里 `- id: glm-hourness/…` 行的集合（逐行匹配 `^\s*- id: (glm-hourness/[a-z-]+)\s*$`，不解析 YAML）；只有这两处的 `<old>` 是旧布局，真实切换时主检出已经是新布局，不做这项。不等就退出码 2。

运行前的检查（任一不满足就退出码 2，不写任何文件）：
1. `<M>` 是主检出；profile 名合 `[A-Za-z0-9_-]+`；不带 `--home` 时只接受 `desktop`、`glmsandbox`，并且 `<D>` 按 `norm` 等于 `%LOCALAPPDATA%\Programs\DeepSeek Harness`（`restart.ps1` 启动的就是这个安装，G24）；`<D>\DeepSeek Harness.exe` 存在，`<D>\resources\app.asar` 是文件；`carrier` 另要求 `<D>\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.mjs` 存在。`cli.js` 与 `bin.js` 在 `app.asar` 归档里，脚本用普通 Node 运行时看不到，所以不查它们，由第一次调用暴露（同 sandbox:26–30 只查 exe）。
2. 不带 `--home` 时没有 `DeepSeek Harness.exe` 进程（`tasklist`）。桌面版、探针、标定与别的 DSH 命令都以这个程序运行，一并排除。演练不查这一条，它只碰运行目录里的 home。
3. profile 目录里没有 `package.json.lock`、`.plugin-manager/run.json`（G10、G26），也没有 `compatibility.json`。最后一项的理由：这个文件有问题时，plugin 命令输出 `dsh: warning:` 行（G25，dsh-plugin:73），第 4 小步会把它当作兼容性告警判不过，而那时 `install` 已经运行；在动手之前拦住更好。两个 profile 今天都没有这个文件；有的话交人，不在切换里处理。
4. `package.json` 能解析，`dsh.profile.bundles` 是字符串数组，`dependencies` 是对象。
5. `apply`、`plan`：`<repo>/<dir>/package.json` 的 `name` 与 `PACKAGES` 一致，声明了 `dsh.bundle.patch`，patch 文件存在；`<old>` 与 `<old>/ui` 是目录；`profile-shape.mjs` 拷贝的摘要与 `NEW_IDS` 的核对通过。
6. `rollback`：记录存在，profile 名与记录相同，两个备份文件存在且 SHA-256 与记录相同；记录里的 `<old>` 之下，`package.json` 与 `ui/package.json` 都能解析，`name` 分别为 `dsh-glm-hourness`、`dsh-glm-hourness-ui`，都声明了 `dsh.bundle.patch`（字符串或字符串数组；`reconcile` 经 `bundleManifest` 看的就是这个键，G16），指向的 patch 文件都存在；`OLD_IDS` 的核对通过。这一条在机制上保证回滚排在仓库撤销之后，条件与 `reconcile` 留下依赖的条件相同，撤销不完整时在 `install` 之前就停下（G16，D04）。

状态（路径按 `norm` 比较）：
- S0：两个旧名各在名单里出现一次、在 dependencies 里各有一项；两个新名不在名单、dependencies 与 `node_modules` 里；两个旧 junction 的真实路径等于 `<old>`、`<old>/ui`。
- S1：两个新名在名单里各出现一次、GLM 紧挨在编排层之前，在 dependencies 里各一项，值是 §2.4 的形式；两个旧名都不在名单与 dependencies 里；不看 `node_modules`。
- S2：S1，并且两个新 junction 的真实路径等于 `<repo>/packages/glm`、`<repo>/packages/hourness`，两个旧名不在 `node_modules` 里。
- 其他组合：退出码 2，打印每一项判定，交人。

`plan`：打印状态、名单与 dependencies 前后的名字、第 3b 小步将要拆掉的链接名、不属于本项目的链接的名字与目标是否存在（不打印目标）、将要运行的命令；不写文件。状态是 S2 时写明「`apply` 会按记录与锁文件决定续跑第 4 小步还是只重做核对」（见下文「从 S2 开始」）。

记录文件：JSON，每一小步完成后用临时文件加改名更新。内容：profile 名、`--cli`、`--home`（有就写）、`<repo>`、`<old>`；第 1 小步的形状、`node_modules` 条目清单与 `.modules.yaml` 是否存在；不属于本项目的链接的原始目标 `raw` 与目标是否存在（D01）；两个备份的文件名与 SHA-256；第 3 小步的 `hash3`、临时文件名、「写入中」或「完成」的标记与这时的形状（D03）；第 3b 小步拆掉的链接名与完成标记；第 4 小步的运行列表，每次运行一项：输出文件名、开始时间、DSH 的退出码、诊断行的类别（拒绝、告警、没有）、是否通过、是否已中断与中断后的进程确认（D02、D05）；第 5 小步通过时 `package.json` 的 SHA-256（`hash5`）与形状；每个小步的结果与没过的项；`rollback` 第 1 小步的完成标记与第 3 小步的运行列表（每项同第 4 小步）；`rollback` 第 4 小步通过时写入的 `rolledBack`（毫秒时间戳，C05）。下文说「第 4 小步没有通过」，指运行列表为空，或者最后一项没有结果、已中断、退出码非 0 或有诊断行。记录里有链接的原始目标，不打印，也不整份读出；运行进度看脚本的 stdout（§4.2 第 8 项）。

条目核对（`apply` 第 5 小步与 `rollback` 第 4 小步共用，B03）。「之前」指 `apply` 第 1 小步记下的条目清单；顶层与 `.ignored/` 之下名字以 `@` 开头、`lstat` 为目录（不是链接）的是 scope，本身不算条目，它下面的才是（例如桌面版的 `.ignored/@deepseek-ai/` 之下各项与 `.ignored/zod` 是条目；桌面版的 `@local/` 现在是空的 scope，没有条目）。名字以 `@` 开头的链接或文件本身是条目。条目分四组：
- P（本项目）：顶层的 `dsh-glm-hourness`、`dsh-glm-hourness-ui`、`dsh-glm-zcode`、`dsh-hourness`。由状态判定（S0、S2）处理，这里不核对。
- I（pnpm 内部）：顶层的 `.pnpm`、`.modules.yaml`、`.pnpm-workspace-state-v1.json`。不核对。这份名单是固定的；演练里 pnpm 若建了别的内部条目（例如 `.bin`），按 O 组第 4 条判不过，要改名单就改脚本，先过 §4.1 A3 的评审，再重跑演练。
- Q（隔离区）：`.ignored/` 与 `.ignored/@*/` 之下的条目。
- O（其他）：顶层与 `@*/` 之下不属于以上三组的条目（`.ignored` 本身不算，它的内容归 Q）。

规则：
- O 组：
  1. 之前有、现在缺：之前是链接的，按记录的原始目标重建：`symlinkSync(raw, <路径>, 'junction')`，再读一次 `raw` 必须与记录相同，点名「重建」。之前就悬空的链接同样重建，恢复成悬空（G20）。以下情形不重建，点名，退出码 1：记录的原始目标不是绝对路径（那不是 junction，按 junction 重建会改变它）；它所在的 scope 目录已不在（脚本不在 `node_modules` 里建目录）；`symlinkSync` 失败或重读不符。缺的不是链接：点名，退出码 1。
  2. 之前有、现在类型不同：点名，写明前后的类型，退出码 1。
  3. 之前有、前后都是链接（D01）：
     - 原始目标不同：点名「目标变了」，退出码 1，不改回。
     - 原始目标相同，之前目标存在、现在不存在：点名「目标消失」，退出码 1。pnpm 若进入链接的目标删除内容（G21），留下的就是这个样子。
     - 原始目标相同，之前目标不存在、现在存在：点名「目标出现」，只记录，不算失败。
     - 原始目标相同、目标是否存在也相同：没有变化，不点名。之前悬空、现在仍悬空的链接属于这一种。
  4. 之前没有、现在有：点名，写明类型，退出码 1。
- Q 组：
  1. 之前没有、现在有：点名，写明类型，退出码 1。
  2. 之前有、现在缺：点名，只记录，不算失败。`.ignored/` 是 pnpm 的隔离区，DSH 不从这里解析 bundle（G7）。
  3. 同名而类型不同：点名，退出码 1。前后都是链接的，按 O 组第 3 条比较。
- 新出现的链接（O 组第 4 条与 Q 组第 1 条里是链接的）：取目标 `t = path.resolve(dirname(<链接>), raw(<链接>))`，按 `norm(t)` 判断（`t` 不存在时走 `norm` 的退路）。等于 `<old>` 或 `<repo>`、或在它们之下的，`unlinkSync` 拆掉，点名「指回检出，已拆」；其余目标不存在的，点名「悬空」，不动；退出码都是 1。两种 pnpm 都不会这样做（G21），出现就说明假设不成立；拆掉是为了不在用户的 profile 里留下指回检出的链接（G20）。按目标路径而不按链接做 `norm`，是因为目标不存在时链接本身解析不出，而指向已删目录（例如整体回滚删掉的 `<M>/packages`）的链接仍要认出来。
- 输出只有相对 `node_modules` 的名字、类型与上面的标签，不打印链接目标。

组合输出的读法（`apply` 第 6 小步、`rollback` 第 4 小步、§2.6.5 R2、R3、R5 共用，B04；依据 G22）：
- 行 id：stdout 逐行匹配 `^- id: (glm-hourness/[a-z-]+)\s*$`，按出现的顺序取。只认行首、不缩进的：每组是一个顶层序列，本项目的行由不带 `id` 的 `insert` 追加在顶层，都是顶层条目；行的 `config` 里嵌套的列表项都有缩进，即使含 `glm-hourness/` 也不会被取到。
- 「恰好是 X」：取到的 id 没有重复，集合等于 X。某条 insert 不以 `id` 开头时它会漏取，结果只会是核对不过，不会误判为通过。
- 层：一行 id 属于它之前最近的一行 `^# == (.+)$`；这一层的来源是捕获文字在第一个 `, patched by ` 之前的部分。bundle 层的来源是包名，基础配置是 `cordis.yml`。
- 只打印取到的 id、它们的来源与判定，不打印输出的其余部分。

`apply`：
- 从 S0 开始，记录文件必须不存在。两种例外，记录都必须属于同一个 profile，上次的备份文件都留着不动：
  - 第 3 小步没有完成（上次停在第 1–3 小步，`package.json` 没有被替换：记录里没有第 3 小步的标记，或者标记是「写入中」而状态仍是 S0，即改名没有发生，D03）：把记录改名为 `<文件>.stale-<毫秒时间戳>`，从第 1 小步重来。旧记录里写着的临时文件若还在，点名「残留临时文件」，不删（DSH 不读它）。
  - 记录里有 `rolledBack`（上一次切换已由 `rollback` 回到 S0，例如整体回滚之后修好再合入，C05）：把记录改名为 `<文件>.rolled-back-<毫秒时间戳>`，从第 1 小步重来。
  第 3 小步已完成、没有 `rolledBack`，却又回到 S0（有人手工恢复过文件，或者上次的 `rollback` 没有成功），退出码 2，交人。
  1. 用 `profileShape` 取一次形状。列出 `node_modules` 的条目：顶层、`@*/` 之下、`.ignored/` 之下、`.ignored/@*/` 之下，每项记名字与类型（链接、目录、文件，用 `lstatSync`，不跟随链接）；对不属于本项目的链接另记原始目标 `raw` 与目标是否存在，不对它们做 `norm`，目标不存在也不算错（只进记录，不打印，D01）；记下 `node_modules/.modules.yaml` 是否存在（A17）。全部写进记录。
  2. 备份：`package.json` → `package.json.bak-<毫秒时间戳>`，`pnpm-lock.yaml` → `pnpm-lock.yaml.bak-<同一时间戳>`（`COPYFILE_EXCL`；没有锁文件就记「无」）；两个备份的 SHA-256 与 `<old>`、`<repo>` 写进记录。
  3. 取写锁（G10），读清单，生成目标：名单里旧主包的位置原位换成 `PACKAGES` 的两个名字，删去旧 UI 包；dependencies 删两个旧键，追加两个新键，值为 `link:` 加 `norm(<repo>/<dir>)`、反斜杠换成正斜杠（§2.4，A02）；其余键与顺序不动。逐键比对目标与原文，除这两个键外必须深度相等，否则不写，释放写锁，退出码 2。目标文本的格式为 `JSON.stringify(…, 2)` 加换行。依次（D03）：
     - 算目标文本的 SHA-256，记为 `hash3`（A12），连同临时文件名 `package.json.switch-tmp-<毫秒时间戳>` 与第 3 小步「写入中」的标记写进记录；
     - 写临时文件，改名替换 `package.json`；
     - 释放写锁；
     - 在记录里把第 3 小步标为「完成」。此时为 S1。
     中断落在取锁与释放之间时，留下的 `package.json.lock` 由运行前检查第 3 条拦住，交人；落在释放之后、标为完成之前时，重跑按「从 S1 开始」接着做；落在改名之前时，重跑按「从 S0 开始」的第一种例外重来。
  3b. 拆旧链接（B01）。pnpm 删除依赖时会对链接所在的路径做递归删除（G21），所以两个指回检出的旧链接由脚本自己拆，不交给 pnpm：
     - `node_modules` 顶层的 `dsh-glm-hourness`、`dsh-glm-hourness-ui`：是链接、且真实路径按 `norm` 分别等于 `<old>`、`<old>/ui` 的，逐个 `unlinkSync`，点名「已拆」；已经不在的，跳过并点名「已不在」。
     - 是链接、但真实路径不符或解析不出的：点名（不打印目标），退出码 1，不运行 pnpm，不动它。是目录或文件的：点名，退出码 1，不运行 pnpm。S0 的检查已经排除这两种情形，这里是兜底，只在从 S1 继续时可能遇到。
     - 两个新名字 `dsh-glm-zcode`、`dsh-hourness` 若已在 `node_modules` 里（上次的 `install` 已经建了），必须是链接、且真实路径等于 `<repo>/packages/glm`、`<repo>/packages/hourness`，否则点名，退出码 1，不运行 pnpm。这样 pnpm 也不会为了改指向而删除它们。
     - `unlinkSync` 失败：点名，退出码 1，不运行 pnpm。
     全部完成后在记录里写明 3b 完成。状态仍是 S1（S1 不看 `node_modules`）。
  4. 运行 `plugin --profile <名> install --no-frozen-lockfile`（按 `--cli`）。
     - 子进程：stdin 不接终端（`'ignore'`）；环境设 `CI=false`，另去掉 `CONTINUOUS_INTEGRATION`、`BUILD_NUMBER`、`RUN_ID`、`GITHUB_ACTIONS`、`TF_BUILD`。`CI=false` 让两种 pnpm 都不判为 CI，询问不会被跳过；pnpm 11 想清空 `node_modules` 时因为 stdin 不是 TTY 而中止（G27、U13）。只去掉变量不够：ci-info 还看 `BUILD_ID`、`CI_NAME` 等变量，只有 `CI=false` 能跳过全部判定（C02）。
     - 输出（D02）：每次运行新建一个输出文件 `<记录所在目录>/<名>-pnpm-<毫秒时间戳>.txt`，以 `wx` 打开（已存在就退出码 1，不运行 pnpm），文件描述符直接作为子进程的 stdout 与 stderr，不回显。起子进程之前，先在记录的第 4 小步运行列表里追加这次运行的一项（文件名、开始时间），并在 stdout 打印文件名。下面的报告、时限与判定都只看这次的文件；以前的文件留着，供 §4.4 追查。
     - 等待与时限（D05）：每 60 秒打印一行：已等待的秒数与本次文件的字节数，不含内容。DSH 不给 CLI 方式的 pnpm 设静默上限（G26），所以脚本自己执行时限：本次文件连续 600 秒没有增长，或这次运行超过 1500 秒，就运行 `taskkill /PID <DSH 子进程号> /T /F` 结束 DSH 及其全部子进程，等它退出（最多 30 秒），再用 `tasklist` 确认这个进程号已不在；profile 里有 `.plugin-manager/run.json`、`package.json.lock` 时，只读其中的进程号（`run.json` 的 `pid`，锁文件的内容是进程号，G10），同样确认。在这次运行的一项里写「已中断」与确认结果，打印这几个进程号是否还在、两个文件是否留下，退出码 1。1500 秒的总时限让 `apply` 整体在 1800 秒的工具超时之内结束（§4.2 第 8 项）；正常一次约 2 分钟（§4.5）。
     - 判定：DSH 的退出码为 0，并且本次文件里没有以 `dsh: installation rejected:` 或 `dsh: warning:` 开头的行，才算通过。只看退出码不够：重跑时同样的不兼容只剩告警、退出码 0（G25）；运行前检查第 3 条已经排除了 `compatibility.json` 带来的告警，其余 `dsh: warning:` 都指向两个新包。退出码、诊断行的类别与是否通过写进这次运行的一项；输出只写类别，不打印行的内容。
     - 不通过时本命令退出码 1。这时的状态：pnpm 在建链接之前失败或被中断，停在 S1；pnpm 建好链接之后失败或被中断，或者 DSH 拒绝（它已写回 S1 清单与旧锁文件，修复安装失败，两个新 junction 留下，G3、G25），看上去像 S2。重跑 `apply` 时两种都续跑第 4 小步（「从 S1 开始」与「从 S2 开始」的续跑一支）；DSH 的拒绝或告警按 §4.4 不重试；中断之后留下的 `run.json` 或 `package.json.lock` 先由人处理（§4.4）。
  5. 核对：
     - 处于 S2。
     - `package.json` 除两个键外与备份深度相等；两个键等于第 3 小步的目标（`reconcile` 没有改名单）；两个新依赖的值以 `link:` 开头、接盘符开头的绝对路径、只用正斜杠（只判断形状，不打印值，A02）。
     - 条目核对（见上）全部通过；重建只点名，不算失败（A11、A17、B03）。
     - 锁文件 `importers['.'].dependencies` 下的键名等于两个新名字（只扫键名）。
     - `compareShapes`（第 1 小步的形状对现在）的差异只有 bundles 与 dependencies 两类，覆盖项一条都没变。
     - 输出 `.modules.yaml` 切换前后是否存在，只作记录。
     全部满足：算 `package.json` 的 SHA-256 记为 `hash5`，连同这时的形状写进记录，进入第 6 小步；否则把没过的项写进记录，退出码 1。
  6. 只对非 desktop 的 profile：运行 `--dump-default-config`（`plain` 入口；带 `--home` 时设 `DSH_HOME`）。stderr 不得有 `skipping profile bundle`；按「组合输出的读法」取的行 id 恰好是 `NEW_IDS`，GLM 组的 5 个都在编排层组的 8 个之前，GLM 组的来源都是 `dsh-glm-zcode`，编排层组的来源都是 `dsh-hourness`。
  全部满足退出码 0，打印「已切换」；否则退出码 1。
- 从 S1 开始：记录必须存在、属于同一个 profile，第 3 小步的标记是「完成」或「写入中」，`package.json` 的 SHA-256 等于 `hash3`（上次停在第 3 小步的改名之后、第 3b 小步，或者第 4 小步的 pnpm 在建链接之前失败或被中断）。标记是「写入中」时先改为「完成」：摘要相等说明改名已经发生（D03）。然后重做第 3b 小步（旧链接已不在就跳过，还在的按第 3b 小步拆掉，新链接按第 3b 小步第 3 条核对），再从第 4 小步继续。不满足就退出码 2。
- 从 S2 开始（A03、C01）：记录必须存在且属于同一个 profile，否则退出码 2，交人。分两支：
  - 续跑第 4 小步：`package.json` 的 SHA-256 等于 `hash3`，并且记录里第 4 小步没有通过（运行列表为空，或者最后一项没有结果、已中断、DSH 的退出码非 0、或有诊断行），或者锁文件 `importers['.'].dependencies` 下的键名不等于两个新名字（只扫键名）。第 3 小步的标记是「写入中」时，同「从 S1 开始」先改为「完成」。这是第 4 小步半途停下的样子：pnpm 建好链接之后失败；DSH 的兼容性拒绝写回了第 3 小步写出的清单与切换前的锁文件，修复安装失败，两个新 junction 留下（G3、G25）；或者第 4 小步被脚本的时限或别的原因中断（G26、D05）。按「从 S1 开始」处理：重做第 3b 小步（两个旧链接已不在，跳过；已在的两个新链接必须指向 `<repo>/packages/*`，pnpm 要装的就是它们），再从第 4 小步继续。输出写明「续跑第 4 小步」。
  - 只重做核对：其余情形，即第 4 小步已通过且锁文件已更新，或者 `package.json` 的摘要不等于 `hash3`（`apply` 之后有人写过它，G19，不再运行 pnpm，交给核对判定）。重做第 5 小步（非 desktop 再做第 6 小步），由结果决定退出码；全部通过才打印「已切换」。上次 `apply` 在第 5、6 小步没过时 profile 停在 S2，重跑 `apply` 不能把它当作已完成。

`rollback`（A12）：
- 运行前检查同上。
- 起始状态：
  - S0：打印「无事可做」，退出码 0。
  - 名单与 dependencies 是 S1 的样子（包括 S2，以及整体回滚删掉 `<M>/packages` 之后两个新 junction 悬空的情形，§4.4），`package.json` 的 SHA-256 等于 `hash3` 或 `hash5`，`node_modules` 里四个本项目名字的条目要么不存在、要么是链接（目标在不在都可以）：继续。
  - 其余情形：退出码 2，不写文件。摘要不符时，打印记录里最后一份形状（有 `hash5` 时是第 5 小步的，否则是第 3 小步的）与当前形状的 `compareShapes` 差异（类别与名字，不打印值）。插件页的启用开关会改写名单（G19），整文件恢复会冲掉这类写入，所以交人决定，不自动处理。
  - 记录里已有 `rolledBack` 时只接受 S0（打印「无事可做」，退出码 0）；其余状态退出码 2，交人。回滚过的记录不再用来第二次恢复备份。
  - 续跑回滚：记录里有 `rollback` 第 1 小步的完成标记、没有 `rolledBack`（上一次 `rollback` 在第 2–4 小步停下，例如第 3 小步被时限中断），`package.json` 与锁文件和备份逐字节相同，`dsh-glm-zcode`、`dsh-hourness` 不存在或是链接，`dsh-glm-hourness`、`dsh-glm-hourness-ui` 不存在或是真实路径等于 `<old>`、`<old>/ui` 的链接：从第 2 小步继续，输出写明「续跑回滚」。这一支先于上面的 S0 判断：pnpm 中途停下时旧链接可能已经建好，看上去像 S0，但锁文件与 `.modules.yaml` 不一定一致，要重跑第 3 小步并核对。其余情形同上，退出码 2。
- 步骤：
  1. 取写锁，把两个备份复制回 `package.json`、`pnpm-lock.yaml`（各写临时文件再改名；锁文件的备份记为「无」时删去当前的锁文件），释放写锁，在记录里写第 1 小步的完成标记。两个文件只恢复了一个就中断时，起始状态哪一支都不符，下一次退出码 2，交人按备份手工恢复。
  2. `node_modules` 里 `dsh-glm-zcode`、`dsh-hourness` 是链接的（目标在不在都可以），逐个 `unlinkSync` 并点名（U15）；是目录或文件的，退出码 1，不运行 pnpm（起始状态的检查已经排除，这里只是兜底）。两个旧名字若还在（上次 `apply` 停在第 3b 小步之前），必须是链接、且真实路径等于 `<old>`、`<old>/ui`，这时 pnpm 要装的就是它们，不会去删；不符就点名，退出码 1，不运行 pnpm。`unlinkSync` 失败同样退出码 1，不运行 pnpm。与 `apply` 第 3b 小步对称：pnpm 运行时，profile 里没有它要删除的、指回检出的链接。
  3. 运行 `plugin --profile <名> install --frozen-lockfile`（同一个 `--cli`；stdin、环境、输出文件、等待与时限、诊断行的判定同 `apply` 第 4 小步）。每次运行新建输出文件 `<名>-pnpm-rollback-<毫秒时间戳>.txt`（`wx`），在记录的 `rollback` 第 3 小步运行列表里追加一项，判定只看这次的文件（D02）。不通过（含被时限中断，D05）时本命令退出码 1。
  4. 核对：处于 S0；两个文件与备份逐字节相同；条目核对（同 `apply`，「之前」仍是 `apply` 第 1 小步的清单）全部通过；`compareShapes`（第 1 小步的形状对现在）没有差异；非 desktop 再运行 `--dump-default-config`：没有 `skipping profile bundle`，按「组合输出的读法」取的行 id 恰好是 `OLD_IDS`。全部满足时在记录里写 `rolledBack`（毫秒时间戳，C05），退出码 0，打印「已回滚」；否则退出码 1，不写 `rolledBack`。

`remove`：见 §2.6.6。

输出：只有 profile 名、状态、包名、条目名与链接类型、目标是否存在、差异类别、行 id、备份文件名、输出文件名、进程号与记录路径；不打印 `package.json` 的其他值、依赖的值、`cordis.patch.yml` 的任何内容与链接的目标路径。DSH 与 pnpm 的输出只写进 `<名>-pnpm-<毫秒时间戳>.txt` 与 `<名>-pnpm-rollback-<毫秒时间戳>.txt`。

退出码：0 完成或无事可做；1 已经动手但核对不过，当前状态写在输出与记录里；2 运行前检查不过，或者第 3 小步取锁超时、逐键比对不过：`package.json`、锁文件与 `node_modules` 都没有动。后一种情形里第 1、2 小步的记录与备份已经写出，下一次从 S0 开始按「第 3 小步没有完成」处理。

#### 2.6.3 组合核对

- glmsandbox 与演练 profile：`apply` 第 6 小步，`rollback` 第 4 小步。
- desktop：DSH 不接受对它做组合输出（G1）。用两样代替：演练里「桌面形状」的 profile（名单与桌面版相同）在切换后的组合（§2.6.5 R3）；切换后启动桌面版，即 L4 第一轮（§4.6）。

#### 2.6.4 备份与回滚

- 备份在 profile 目录里，命名 `package.json.bak-<毫秒时间戳>`、`pnpm-lock.yaml.bak-<同一时间戳>`，沿用 DEVELOPMENT.md §5 第 3 条的 `.bak-*` 写法（两个 profile 今天都没有备份文件，G18）。`split` 关闭之前不删；之后删不删由人定（删用户目录里的文件属于要先问人的动作）。
- 记录文件 `<M>/.llm/l4-split/switch-<profile>.json`（`.llm/` 不入库），内容见 §2.6.2；清理提交在 HANDOFF.md 里写明备份文件名与切换时间。`rollback` 成功时只在记录里写 `rolledBack`，记录不改名，所以对同一个 profile 再运行 `rollback` 仍得到「无事可做」；以后重新合入时，`apply` 从 S0 开始把这样的记录改名为 `<文件>.rolled-back-<毫秒时间戳>`，再建新记录与新备份，上次的备份留着不动（C05）。
- 只回滚 profile 的命令见 §2.6.2；整次合入的回滚见 §4.4。profile 回滚只能排在仓库撤销之后（G16，运行前检查第 6 条）。

#### 2.6.5 演练（时段之前，不碰 `~/.dsh` 里已有的 profile）

命令为 `rehearse --worktree <worktree> --run <M>/.llm/l4-split/rehearsal-<毫秒时间戳>`。`<run>` 必须是 `<M>/.llm/l4-split/` 的直接子目录，名字匹配 `^rehearsal-[0-9]+$`，数字是开始演练时的毫秒时间戳；这条规则与 §2.6.6 的 K1、R0 的残留扫描、`--home` 的校验相同，失败的演练留下的目录因此总能被收尾与下一次 R0 找到（C03）。旧布局用合入前的主检出 `<M>`（根包与 `ui/`），新布局用已 build 的 worktree。`rehearse` 以子进程调用本脚本的 `apply`、`rollback`，显式传 `--home <run>/dsh-root`、`--cli`、`--record <run>/switch-<名>.json`，与真实切换走同样的命令行解析（A10）。演练里的每一条 DSH 命令（`add`、`install`、`--dump-default-config`）都在子进程环境里设 `DSH_HOME=<run>/dsh-root`。

- R0（运行前检查，不过就退出码 2）：`<M>` 是主检出；`--worktree` 与 `<M>` 属于同一仓库（`git -C <worktree> rev-parse --path-format=absolute --git-common-dir` 的输出按 `norm` 等于 `<M>/.git`；不加 `--path-format=absolute` 时输出可能是相对路径，G23，B07），`packages/glm/dist`、`packages/hourness/dist` 存在；`--run` 符合上面的规则且不存在；`~/.dsh/profiles/` 下没有 `glmh-split-` 开头的名字（有就是以前留下的，先用 `remove` 清掉）。`<M>/.llm/l4-split/` 下名字匹配 `^rehearsal-[0-9]+$` 的直接子目录里若还有 `dsh-root`（以前的演练被强行终止，收尾没有跑），先按 §2.6.6 清掉再开始。
- R1：记下 `<M>` 与 worktree 的 `git status --porcelain`，以及 `~/.dsh/profiles/` 下的名字（只记名字）。
- R2（旧形状）：
  - `glmh-split-rehearsal-desktop`：经 `carrier` 运行 `plugin --profile glmh-split-rehearsal-desktop add <M> <M>/ui -w`（profile 不存在时由 DSH 按默认模板初始化，G2）；再把它的名单改写成桌面版的形状（只读桌面版名单里的名字，§2.4 左列，旧包名留在原来的位置）；在它的 `node_modules/@local/` 下（目录不在就先建）用 `symlinkSync(<绝对路径>, <路径>, 'junction')` 建两个 junction：
    - `rehearsal-keep`，指向运行目录里的目录 `keep/`；`keep/` 里放一个哨兵文件 `sentinel.txt`，内容是 32 字节随机数的十六进制，SHA-256 记进 `rehearsal.json`（B01）。
    - `rehearsal-dangling`，指向 `<run>/missing`，这个目录从不创建（D01）。
    - 用意：`@local/*` 代表不属于本项目、仍交给 pnpm 处置的外部链接。哨兵能看出 pnpm 删了链接之外是否还进入了它的目标；悬空的那个覆盖目标不存在的情形。真实桌面版的 `@local/` 在 2026-10-29 之后是空的（G13），演练比它多两个链接，覆盖的是时段之前可能再出现的链接。
    - 这第一次 `add` 之后立即查一次 `~/.dsh/profiles/` 的名字是否与 R1 相同（U11），不同就停止，转到收尾。
  - `glmh-split-rehearsal-sandbox`：经 `plain` 同样 `add`，名单改写成 glmsandbox 的形状。再把 `node_modules` 顶层剪成 glmsandbox 的条目名（G18）：删去 glmsandbox 没有的文件条目（例如 `.modules.yaml`、`.pnpm-workspace-state-v1.json`），只删文件，不删目录。剪完以后两者的顶层条目名必须相同，否则 R2 不过（A17）。
  - `OLD_IDS` 与 `<M>` 的两份 patch 一致（§2.6.2）；两个 profile 各运行一次 `--dump-default-config`：按「组合输出的读法」取的本项目行 id 恰好是 `OLD_IDS`，没有跳过的 bundle。
- R3（切换）：对两个演练 profile 各运行 `apply --repo <worktree> --old <M>`：
  - 退出码 0；第 3b 小步点名拆掉了 `dsh-glm-hourness`、`dsh-glm-hourness-ui`（B01）；输出里没有任何「重建」「目标变了」「目标消失」「目标出现」「指回检出，已拆」「悬空」，条目核对全部通过（U10、U14、A11、B03）。两个演练 profile 分别用 pnpm 11（`carrier`）与 pnpm 8（`plain`），两者都通过即 U16 成立。
  - `keep/sentinel.txt` 存在，SHA-256 与 R2 记下的相同（B01）。
  - 桌面形状的 `@local/rehearsal-dangling` 仍是链接，`readlinkSync` 与 R2 建立时相同，`<run>/missing` 仍不存在（D01、U17）。`rehearse` 自己核对这三点，不只看 `apply` 的输出。
  - 两个新依赖的形式符合 §2.4（只判断形状，A02）。
  - 组合按 `apply` 第 6 小步。桌面形状的组合另查次序，按「组合输出的读法」（B04）：按出现顺序列出每一行 `# == ` 的来源，来源为 `dsh-glm-zcode`、`dsh-hourness` 的组连成一段，`dsh-glm-zcode` 在前；这一段之前只有来源为 `cordis.yml`、`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 的组，之后没有这三种来源的组。也就是本项目各行排在 `dsh-web-app` 的行之后、任何 experimental bundle 的行之前。
  - 对沙盒形状 profile 再运行一次 `apply`：从 S2 只重做核对，退出码 0，打印「已切换」（A03 的路径）。
  - 续跑（C01）：两个演练 profile 各用第 2 小步的锁文件备份（文件名取自记录）覆盖自己的 `pnpm-lock.yaml`，模拟第 4 小步建好链接、锁文件却没有更新；再运行一次 `apply`。要求：输出写明「续跑第 4 小步」；第 3b 小步对两个旧名字报「已不在」，两个新链接通过核对；第 4 小步通过；退出码 0，打印「已切换」；锁文件 `importers['.'].dependencies` 下的键名回到两个新名字；记录的第 4 小步运行列表多了一项，输出文件与上一次不同（D02）；输出里没有 R3 第一条列的那些标签，`keep/sentinel.txt` 的 SHA-256 不变，`rehearsal-dangling` 与 `<run>/missing` 同 R3 的第三条。评审建议只在沙盒形状上做；桌面形状也做，因为真实的 desktop 用 pnpm 11，续跑那一次也要在 pnpm 11 上跑过。`rehearse` 自己在演练 profile 里写的文件只有两样：R2 改写的 `package.json` 名单与这里覆盖的锁文件，都不在 `node_modules` 里；它在 `node_modules` 里的动作只有 R2 的几样（建 `@local/` 与其中两个链接，剪掉沙盒形状的文件条目），都在第一次 `apply` 之前。
- R4（回滚）：对两个演练 profile 各运行 `rollback`：回到 S0，两个文件与备份逐字节相同（U12），输出点名拆掉的两个新链接（U15），条目核对通过、没有「重建」与目标变化的标签，组合回到 `OLD_IDS`；`keep/sentinel.txt` 仍在、SHA-256 不变；`rehearsal-dangling` 与 `<run>/missing` 同 R3 的第三条。对沙盒形状 profile 再运行一次 `rollback`：打印「无事可做」，退出码 0。
- R5（全新安装，U5）：`glmh-split-rehearsal-fresh`：经 `carrier` 运行 `plugin --profile glmh-split-rehearsal-fresh add <worktree>/packages/glm <worktree>/packages/hourness -w`；名单为 `@deepseek-ai/dsh-base`、`dsh-glm-zcode`、`dsh-hourness`；两个依赖的形式与 §2.4 相同（`link:` 加盘符开头的绝对路径、只用正斜杠，A02）；`node_modules` 里是 junction，真实路径等于 worktree 的两个包目录；按「组合输出的读法」取的行 id 恰好是 `NEW_IDS`，没有跳过的 bundle。
- R6：`~/.dsh/profiles/` 下的名字与 R1 相同（U11）；按 §2.6.6 删除 `<run>/dsh-root`（带 `--worktree`；悬空的 `rehearsal-dangling` 与其他链接一样在遍历里被 `unlinkSync`，G20），之后 `keep/sentinel.txt` 仍在、SHA-256 不变（`keep/` 在 `dsh-root` 之外，删除只拆了指向它的链接），`<run>/missing` 仍不存在，`<M>` 与 worktree 的 `git status --porcelain` 与 R1 相同（pnpm 没有往被链接的检出里写东西，删除也没有碰到它们）。不同时输出前后不同的路径列表（只有路径，不含内容），便于归因（B05）。各步判定（不含任何值）写进 `<run>/rehearsal.json`。

收尾（A01）：`dsh-root` 建出之后，无论哪一步失败或抛错，`rehearse` 都在 `finally` 里按 §2.6.6 删除 `<run>/dsh-root`；U11 不成立时，再按同样的步骤删除 `~/.dsh/profiles/` 下 R1 之后新出现的 `glmh-split-*`。收尾本身不过（有链接拆不掉）时退出码 1，`rehearsal.json` 与输出写明「运行目录里仍有链接，不要手工删除」，留给下一次 `rehearse` 的 R0 或人用 `remove` 处理。`rehearse` 被强行终止时 `finally` 不会跑，由下一次的 R0 清理。

运行方式（D05）：`rehearse` 里有十来次 pnpm 运行，总时长会超过 1800 秒的工具超时，所以编排者在后台运行它，每隔几分钟读一次 `<run>/rehearsal.json`。`rehearse` 每做完一步就更新这个文件（步名、判定、时间，不含任何值），收尾之后写 `finished` 与总的结论；后台进程退出而文件里没有 `finished`，按演练失败处理，由下一次 R0 清理。其中的每一次 `apply`、`rollback` 带着第 4 小步（`rollback` 第 3 小步）自己的时限。

演练像探针一样排队，不与探针、标定同时运行（编排者排期）。演练期间也不能有别的运行在主检出或 worktree 上工作：R6 拿两处的 `git status` 与 R1 比，并行的正常编辑或提交会被当作演练的副作用，A4 因此不过，原因却与切换脚本无关（B05）。所以开始之前由编排者确认这一点，做法同 §4.2 第 1 项。桌面版可以开着，演练只碰运行目录里的 home。任何一步不过，就不申请桌面时段：修脚本（改动先过 §4.1 A3 的评审）或回到设计。

#### 2.6.6 拆链删除（A01）

演练 profile 的 `node_modules` 里有 junction：pnpm 建的 `dsh-glm-hourness` → `<M>`，`dsh-glm-hourness-ui` → `<M>/ui`，`dsh-glm-zcode`、`dsh-hourness` → worktree 的 `packages/*`；`rehearse` 建的 `@local/rehearsal-keep` → 运行目录里的 `keep/`，`@local/rehearsal-dangling` → 运行目录里不存在的 `missing`；pnpm 还可能把条目挪进 `.ignored/`。运行目录在 `<M>/.llm/` 下，那里有凭证、记忆与审计（DEVELOPMENT.md §9，`scripts/check-secrets.mjs`:6）。Windows PowerShell 5.1 的 `Remove-Item -Recurse` 会进入 junction 删除目标的内容（G20），删错的后果是主检出（含 `.llm/` 与未提交的 `.kiro/`）与 worktree 的内容丢失，无法恢复。

所以下面三类目录只用 `profile-switch.mjs remove` 删除，不用 `Remove-Item -Recurse`、`rd /s`、资源管理器或别的递归删除工具：
- K1：`<M>/.llm/l4-split/<run>/dsh-root`，`<run>` 是 `<M>/.llm/l4-split/` 的直接子目录、名字匹配 `^rehearsal-[0-9]+$`（与 `--run`、`--home` 的规则相同，§2.6.5，C03）。
- K2：`~/.dsh/profiles/glmh-split-*`（只有演练会建这个前缀；R0 保证演练开始时一个都没有）。
- K3：`<M>/packages`，只在整体回滚里用（§4.4）。条件是 `git -C <M> ls-files packages` 为空，且 `git -C <M> status --porcelain --ignored --untracked-files=all -- packages` 列出的每一项都在 `packages/*/dist/` 之下，或等于 `packages/*/ui/client.js`；否则说明 `packages/` 里有构建产物以外的东西，交人。

`remove --path <P> [--worktree <worktree>]` 的步骤，约定同 sandbox:87–101 的 `unlinkProfile`（先拆链，运行目录里不留指回检出的链接，删除或遍历它都碰不到检出）：
1. `P` 属于 K1–K3 之一（按 `norm` 判断），存在，是目录，本身不是链接；否则退出码 2，什么都不做。
2. 拆链：不跟随链接地遍历 `P`（`readdirSync` 列名，每项 `lstatSync`）。`isSymbolicLink()` 为真的（win32 上 junction 也这样报告，目标不存在的也一样，G20）逐个 `unlinkSync`，不进入；是目录的往下走；文件不动。`.ignored/`、`@*/`、`.pnpm/` 都在这次遍历之内。`unlinkSync` 失败的点名（相对 `P` 的名字，不打印目标），继续拆其余的。
3. 复查：同样不跟随链接地再遍历一次，数剩下的链接。不是零就点名，退出码 1，不删。
4. `rmSync(P, { recursive: true, force: true })`。这时 `P` 之下已经没有链接，`rmSync` 怎样对待 junction 不影响结果。
5. 删后断言：`<M>/package.json`、`<M>/.git`、`<M>/.llm` 都在；给了 `--worktree` 时 `<worktree>/package.json` 也在。打印 `<M>`（与 worktree）的 `git status --porcelain` 的路径列表。断言不过退出码 1。git 状态由调用方比对：`rehearse` 对 R1，整体回滚对「只有 `?? .kiro/`」（§4.4）。

退出码：0 已删除；1 有链接拆不掉，或删后断言不过；2 `P` 不在允许的范围内，没有动。

`<M>/.llm/l4-split/` 本身与其中名字匹配 `^rehearsal-[0-9]+$` 的运行目录留作运行记录，R6 之后里面不再有链接。`split` 关闭时（§4.3 第 11 项）再用同样不跟随链接的遍历确认 `<M>/.llm/l4-split/` 下没有链接，结果报给父任务；以后谁要删这个目录，先做这一步。

### 2.7 已有 profile 的迁移（取代 §3.7）

| profile | 要做的 | 依据 |
| --- | --- | --- |
| `desktop` | 合入时段内按 §2.6 切换（先备份，只改两个键），之后不再改；L4 里换过默认模型的，经同一菜单换回 | §2.4、§4 |
| `glmsandbox` | 同上，排在 desktop 之前 | §2.5 |
| `headless` 与其他 | 不动：没有列本项目的包 | G14 |
| 探针生成的 profile | 每次运行重建（0.3 §7.3），组合按本附录 §3.1、§3.2 | — |
| 以后由设置表单新写的本项目覆盖项 | 同 0.3 §3.7：会带模块路径（F18），布局再变时失配 | F2、F18 |

合入前对本项目覆盖项是否带 `name` 的核对同 0.3 §3.7，改在关桌面版之后做（§4.2 第 3 项），快照之后不会再有桌面版的写入。

## 3. 取代第 5、6 步

### 3.1 第 5 步：宿主包布局，根退出 bundle

内容：
- 同 0.3 第 5 步：两个包的清单、patch、tsconfig；`src/ui` → `src/report`；构建脚本与 `scripts/clean-dist.mjs`；`knip.js` 与 `tsconfig.knip.json`；ESLint 忽略项、jscpd 与 `.gitignore` 的处理；探针、标定与探针 provider 的导入改到 `packages/*/dist/`；worktree 上构建后删陈旧的根 `dist/`。
- 两个包的 locale 与图标（§2.2 显示信息）。
- 根退出 bundle：根清单按 §2.2 改；删根 `cordis.patch.yml`、根 `locale/`；根 `icon.svg` 移到 `packages/hourness/`。
- 两份 `packages/*/cordis.patch.yml` 照今天两份 patch 的写法：顶层一条不带 `id` 的 `- insert:`，其下每条以 `id` 开头（G22）。切换脚本与演练按行首的 `- id: ` 从组合输出里取行 id；写法不同只会让演练 R3 不过，不会让核对误判通过。
- `scripts/packages.mjs`：同 0.3 补 `name`、`dir`、`rows`，注释写明 `PACKAGES` 的顺序就是 profile 里两包的顺序（GLM 在前，§2.4）；另加一个只存在于第 5、6 步之间的导出：

  ```js
  /** 第 5 步加、第 6 步删：第 6 步之前客户端行仍由 ui/ 的旧客户端包提供 */
  export const LEGACY_CLIENT_BUNDLE = { name: 'dsh-glm-hourness-ui', dir: 'ui', row: 'glm-hourness/ui' }
  ```

  读它的有 preflight（bundle 清单与今天的客户端检查）、`scripts/sandbox.mjs`（`probe-full` 的名单）与 `tests/contracts.spec.ts`（字面清单）。
- preflight 与测试：§3.3。
- 探针：`probe-full` 列 `dsh-glm-zcode`、`dsh-hourness`、`dsh-glm-hourness-ui`（最后一项指 `ui/`，与桌面版今天的末项同位）；`probe-glm`、`probe-hourness` 与新场景 `glm-only`、`hourness-only` 同 0.3；0.3 的可选场景 `duplicate-listing` 删去（U9 删除）。根包名与第 2 行不变，探针的读文件与 grep 夹具照常通过（§2.2）。
- 文档：§3.4。

门禁：全；探针（三种组合）；knip 没有新发现（U7）。
开始条件：第 4 步完成；本附录评审 APPROVED；main 上的行名仍是路径形式（question-18 A 已定 V-01 推迟，正常应当成立；不成立就停下交人）；m8-ui-audit 修复计划（`findings.md` §7）里除 V-01 外的提交都已在 main 上。V-01 不在开始条件里（R30）。
回滚：撤销提交（只在 worktree 上）。

### 3.2 第 6 步：UI 拆分，`ui/` 不再是包

内容：
- 同 0.3 第 6 步：两个客户端包、两个入口、构建两份产物、`glm-hourness/glm-ui` 默认禁用；ESLint、`.gitignore`、`knip.js` 加 `packages/*/ui/client.js`，根 `ui/client.js` 的条目保留到清理提交（§2.1）；探针挂 client-modules 覆盖行（U3）；worktree 上构建后删陈旧的根 `ui/client.js`。
- `ui/` 不再是包：删 `ui/package.json`、`ui/cordis.patch.yml`、`ui/index.js`、`ui/locale/`、`ui/icon.svg`、`ui/src/client.tsx`。`ui/tsconfig.json` 与 `ui/src/` 留下：它用 `moduleResolution: Bundler`，没有清单不影响类型检查，esbuild 打包也不读它〔只读核对，`ui/tsconfig.json`〕。
- `scripts/packages.mjs`：同 0.3 补 `client`；删 `LEGACY_CLIENT_BUNDLE` 与它的全部读取方。
- 探针：`probe-full` 只列 `dsh-glm-zcode`、`dsh-hourness`，与切换后的 glmsandbox 相同。
- preflight 与测试：§3.3。
- 文档：§3.4。

门禁：全；探针（三种组合，加 client-modules 检查）。
开始条件：第 5 步。回滚：撤销提交。

### 3.3 第 5、6 步的检查与测试（取代 0.3 §7.2、§7.4、§5.5 里与伞包、占位包有关的条目）

preflight（按 0.3 §7.4 的编号）：
- 第 1 项（表自检）：不变。
- 第 2 项（bundle 清单）：清单列表改为从表生成，即 `PACKAGES` 的两个包目录，第 5 步另加 `LEGACY_CLIENT_BUNDLE.dir`。另加：根 `package.json` 没有 `dsh`、`main`、`exports` 字段，`private` 为真；根目录没有 `cordis.patch.yml`（第 5 步起）；`ui/` 下没有 `package.json` 与 `cordis.patch.yml`（第 6 步起）。理由：m8-ui-audit 也改过这些文件，rebase 解冲突时容易把删掉的文件带回来；带回来的清单即使没有 profile 列它，也是死文件（AGENTS.md），被列进 profile 时会与两包的行重复。
- 第 3 项（insert 行）：不变。
- 第 4 项（组合）：按 `PACKAGES` 的顺序（第 5 步再接 `LEGACY_CLIENT_BUNDLE`）拼接各 bundle 的 patch；insert 行的 id 不重复，id 与 `name` 的集合等于表里登记的行（第 5 步为 11 个宿主行加 `glm-hourness/ui`，第 6 步为 13 行）。0.3 的「伞包的行集合等于两个子包之并」「占位包没有行」删去。
- 第 5 项（产物与配置）：`type: module` 的检查对象为两个宿主包、两个客户端包与根（根的 `.js` 配置文件是 ESM）。另加显示信息检查（G9）：每个宿主包的 `locale/en.json` 与 `locale/zh.json` 存在、能解析、`meta.title` 与 `meta.description` 是非空字符串；`exports['./locale/*.json']` 为 `./locale/*.json`；`exports['./icon']` 指向的文件存在、扩展名为 `.svg`、`.png`、`.jpg`、`.jpeg`、`.webp` 之一、不超过 256 KiB。其余不变。
- 第 6 项（C2）：不变。
- 第 7 项（客户端，0.3 §5.5）：「宿主包、伞包与占位包都不得声明 `dsh.client`」改为「两个宿主包与根都不得声明 `dsh.client`」；第 5 步对 `LEGACY_CLIENT_BUNDLE` 做今天的单行客户端检查（今天 `scripts/preflight-bundle.mjs`:31–37 的做法）；第 6 步起按 0.3 §5.5 检查两个客户端包。

`tests/preflight.spec.ts` 的夹具（取代 0.3 §7.2 里涉及伞包与占位包的几条，其余夹具不变）：
- 删去：伞包通过；占位包含行失败；伞包组合与子包组合不一致失败。
- 第 5 步加：两包加旧客户端包的布局通过；根清单带 `dsh` 失败；根清单带 `exports` 失败；根目录有 `cordis.patch.yml` 失败；宿主包缺 `locale/en.json` 失败；`./icon` 指向的文件不存在失败。
- 第 6 步加：两包布局通过；`ui/package.json` 存在失败；`ui/cordis.patch.yml` 存在失败；根清单声明 `dsh.client` 失败。

`tests/contracts.spec.ts`（采纳 R32）：断言 `PACKAGES` 的全部行 id 加客户端行 id（第 5 步再加 `LEGACY_CLIENT_BUNDLE.row`）等于测试里写死的数组：第 5 步 12 项，第 6 步 13 项。preflight 仍按表核对组合；这个数组独立于表，表与 patch 一起改名时测试失败。以后加行（0.3 §9 B1 的 `glm-hourness/bootstrap`）要同时改它，改动在评审里看得见。0.3 §7.1 第 5、6 步与 §9 B1 所说的「固定行 id」就是这个数组。切换脚本里的 `OLD_IDS`、`NEW_IDS`（§2.6.2）与第 5、6 步的数组内容相同，是另一份独立的拷贝，脚本运行时再与表核对。

### 3.4 第 5、6 步与清理提交的文档（取代 0.3 §7.5 第 5、6 行）

| 步 | 文档 |
| --- | --- |
| 5 | 同 0.3 第 5 行，其中：DESIGN.md §2.1–§2.3 写「同仓两包，profile 直接列两包，根只是开发工作区」；§2.3 的「仓库不拆分〔定案〕」整条重写为「同仓两包〔定案：2026-10-28 question-10 选 A；2026-10-29 question-17 选 B，profile 直接列两包，不要伞包〕」；FACTS.md §3 另补本附录的 G1–G23 与 G25–G27（G24 讲的是 `.agents/` 下不入库的脚本，不是外部事实，C07）；DEVELOPMENT.md §3 写安装方法（`dsh plugin --profile <名> add <检出>/packages/glm <检出>/packages/hourness -w`；桌面版的 profile 只能在桌面版关闭时，经 `<D>\resources\runtime\cli\bin\dsh.cmd` 操作，G1），以及「glmsandbox 在合入时段切换为两包」；README.md 的安装段与行表（「呈现」一行改为两个客户端包）；AGENTS.md 首行改为「本仓库产出两个 DeepSeek Harness 第三方 bundle（dsh-glm-zcode、dsh-hourness）」；HANDOFF.md §1 的安装形态改为两个 bundle |
| 6 | 同 0.3 第 6 行，另：DESIGN.md §2.2 中 `glm-hourness/ui` 一行（F-37 写的「项目图页签与 meta 文件」）改为「客户端包 `dsh-hourness-ui`；插件页列的是宿主包，客户端包没有自己的显示信息」；ORCHESTRATION.md §2.10 的落点改为客户端包 `dsh-hourness-ui`（页面 id 仍是 `dsh-glm-hourness-ui/graph`，F13）；HANDOFF.md §1 补两个嵌套的客户端包 |
| 清理提交（L4 第一轮之后，第二轮的关闭窗口里，§4.3 第 10 项） | HANDOFF.md 记切换的事实：时间、两个 profile 的新名单（名字）、备份文件名；DEVELOPMENT.md §3 去掉「合入时段切换」的将来时 |

## 4. 合入顺序（取代 §7.1 的合入顺序与回滚段，并替换 §7.6 中依赖伞包或占位包的条目）

### 4.1 时段之前（不占桌面）

- A1：第 0–8 步完成，整个分支的评审通过。
- A2：worktree 上 rebase 到 main，跑全量门禁与探针（生成的 profile）；记下 rebase 所基于的 main 提交，下称 `B`。
- A3：写好 `profile-switch.mjs`、它同目录的 `profile-shape.mjs` 拷贝（与分支上的文件逐字节相同）、`.agents/tasks/split/desktop-close.ps1` 与 `.agents/tasks/split/restart.ps1`，交给独立代码评审（A05）。`restart.ps1` 是 `.agents/tasks/m1-l4/restart.ps1` 的逐字节拷贝：原脚本的输出路径取 `$PSScriptRoot`，拷贝放在 split 目录下，`dsh-out.txt`、`dsh-err.txt` 就写到 split 目录，不覆盖 m1-l4 的记录（G24）；`desktop-close.ps1` 只有原脚本的第 4–6 行。评审对照本附录 §2.6、§5.2 与 §2.6.6 的拆链删除规则，重点核对：不打印任何值；删除只走 §2.6.6；运行 pnpm 之前拆链（`apply` 第 3b 小步、`rollback` 第 2 小步）与条目核对的四组规则；组合输出的读法；状态判定、`hash3`/`hash5` 与退出码；「从 S2 开始」的两支与续跑的条件（C01）；`rolledBack` 与旧记录的改名（C05）；路径比较按 `norm`，`--run`、`--home`、`--record` 的固定形式（C03）；不属于本项目的链接只用原始目标记录、比较与重建，不经 `norm`，以及新出现的链接按目标路径判断（D01）；每次 pnpm 运行新建输出文件、判定只看这次的文件（D02）；`hash3` 在改名之前写进记录、「写入中」标记在 S0 与 S1 下的处理（D03）；`rollback` 运行前检查第 6 条与 `reconcile` 的条件一致（D04）；`rollback` 的「续跑回滚」一支与它先于 S0 的判断次序（§9.4）；子进程的 stdin 与环境（`CI=false`，C02）、等待时的报告、600 秒与 1500 秒的时限与 `taskkill` 之后的进程确认、诊断行的判定（G25、G26、D05）；写锁的取放；`restart.ps1` 的 SHA-256 等于原脚本，`desktop-close.ps1` 与原脚本第 4–6 行相同（B06）。评审记录写在 `.agents/tasks/split/switch-review.md`，结论写在末尾。有阻塞的发现就修了再审，轮次规则同分支的实现—评审循环（question-11：两轮之后仍有阻塞就自动做第三轮，再不过就停下报给父任务）。
- A4：编排者确认演练期间没有别的运行在主检出或 worktree 上工作，也没有探针、标定在跑（同 §4.2 第 1 项，B05）；然后在后台运行 `rehearse`（§2.6.5），轮询 `rehearsal.json` 直到 `finished`，全部通过。A3 之后改过任何一个脚本，改动先过 A3 的评审，再重跑完整的演练。
- A5：申请桌面时段（`risk-shared-desktop`，MERGE-SLOT REQUEST）。请求里写明：A3 的评审结论与记录文件；A4 演练的运行目录与结论，含两种 pnpm 下第 3b 小步、U16 与续跑第 4 小步（R3）的结果，以及 pnpm 11 下悬空的 `@local` 链接的结果（U17）；预计占用（§4.5）；门禁排在切换之前的次序（§4.2）需要父任务接受；「L4 用 `m1-l4/restart.ps1` 的逐字节拷贝 `.agents/tasks/split/restart.ps1`，CDP 9333 不变，只是输出写到 split 目录，避免覆盖 m1-l4 的记录」，这是对 brief 的偏离，同样需要父任务接受（B06）；「profile 切换按附录 §2.6.1 方式 b：脚本在 DSH 的写锁下只写 `dsh.profile.bundles` 与 `dependencies`，再运行 `dsh plugin install`；0.3 §3.6 的 add/remove 做法经 `bin.js` 走不通（G1），而且会改变名单顺序（G4）」，改的内容与 0.3 §3.6 列的相同，做法不同，同样需要父任务接受（C06）。这段时间里没有别的运行使用桌面版或主检出，也不跑探针、标定与演练。

### 4.2 时段内

1. 人同意后，编排者确认没有别的运行在主检出上工作（R29），也没有探针、标定、演练在跑。另看一眼环境变量 `DSH_DESKTOP_DIR`：没有设置，或者等于 `%LOCALAPPDATA%\Programs\DeepSeek Harness`。切换脚本按它找 `<D>`，而 `restart.ps1` 启动的是写死的这个路径（G24），两者必须是同一个安装；脚本的运行前检查第 1 条也会拒绝不同的 `<D>`，这里先看是为了不在关桌面版之后才发现。
2. 桌面版开着且 CDP 9333 可用时，先截一张右侧栏「开始」页（L4 第一轮第 6 项要对比）。关闭桌面版：`.agents/tasks/split/desktop-close.ps1`，内容是 `.agents/tasks/m1-l4/restart.ps1` 的第 4–6 行（`CloseMainWindow`、等 3 秒、`Stop-Process -Force`，G24），之后核对没有 `DeepSeek Harness` 进程、9333 端口不再监听。从这里到第 9 项不启动桌面版。
3. 只读快照：`node <worktree>/scripts/profile-shape.mjs snapshot desktop <M>/.llm/l4-split/desktop-shape.json`，glmsandbox 同样（这时主检出上还没有这个脚本，用 worktree 里第 0 步入库的那份；shell 里不设 `DSH_HOME`，脚本读 `~/.dsh`）。本项目的覆盖项带 `name` 就停下交人（0.3 §14.6）。
4. 主检出：`git -C <M> status --porcelain` 只有 `?? .kiro/`；`git -C <M> rev-parse main` 等于 `B`。main 动过：在 worktree 上重新 rebase 并跑全量门禁；新提交改了 `src/`、`scripts/`、`ui/src/` 或 `packages/` 时重跑探针，改了任何 `package.json` 或 patch 时重跑探针与演练。这段时间桌面版保持关闭；人想先开回去，就从第 2 项重来。
5. 在主检出 `git merge --ff-only split`，推送 `origin/main`（`$env:GCM_INTERACTIVE='never'; $env:GIT_TERMINAL_PROMPT='0'`，不强推）。`--ff-only` 失败说明 main 又动了，回到第 4 项。
6. 删除主检出根目录的陈旧产物 `dist/` 与 `ui/client.js`（§2.1）。这两样里没有链接。
7. 主检出再查一次 `status --porcelain`。`git -C <M> diff --name-only B main -- pnpm-lock.yaml` 不为空时（合入改了根依赖；`B` 取第 4 项最后确认的值），先在主检出运行 `pnpm install --frozen-lockfile`（PATH 上的 pnpm，与根锁文件的格式 6.0 一致，G12），否则门禁会因为缺包失败，被误读成代码问题（C04）。然后 `npm run build`、`npm run preflight`、`npm test`。
8. 切换：先 glmsandbox，后 desktop。各自先 `plan --repo <M>`，确认状态是 S0、计划与 §2.4、§2.5 一致，再 `apply --repo <M> --record <M>/.llm/l4-split/switch-<profile>.json`（`--old` 取默认，即 `<M>`；不带 `--home`，`--cli` 取固定值）。`plan` 列出的不属于本项目的链接：desktop 有没有、悬不悬空都照常进行，演练在 pnpm 11 上覆盖了两种（U17）；glmsandbox 有这类链接时停下交人，pnpm 8 没有演练过这种形状。`apply` 在前台运行，工具超时设为 1800 秒；脚本自己的时限（第 4 小步 600 秒没有增长或 1500 秒总时长，D05）保证它在这之内结束，编排者不需要另外中断。不用后台加轮询：记录里有链接的原始目标，不整份读出（§2.6.2），进度与结果看 `apply` 的 stdout。两个都退出码 0 之后，各取一次切换后的快照：`node <M>/scripts/profile-shape.mjs snapshot <profile> <M>/.llm/l4-split/<profile>-shape-switched.json`，shell 里不设 `DSH_HOME`（A10）。先做 glmsandbox：它出问题时桌面版的 profile 还没有动，而且它的组合能离线核对。
9. 启动桌面版：`.agents/tasks/split/restart.ps1`（`m1-l4/restart.ps1` 的逐字节拷贝，输出写到 split 目录，A3、A5；先关再开，`--remote-debugging-port=9333`），即 L4 第一轮（§4.6）。

次序的理由：
- 切换在合入之后：`install` 后的 `reconcile` 与兼容性检查要读新包的清单（G16），新布局必须已经在主检出上。
- 门禁在切换之前：AGENTS.md 强制流程第 2 条要求安装前 build、preflight、test 三道全绿，切换运行的 `install` 就是一次安装。切换本身只读清单与 patch，不读构建产物（G4、ops:258 起的 `bundleComponentManifests`），所以父任务写的「先切换、再 build」在技术上也可行，按仓库规则取前者。
- 相对 0.3 的其他变化：rebase、门禁、探针、脚本评审与演练移到申请时段之前（A2–A4），时段内只核对 main 没有动（第 4 项），桌面占用更短；快照改到关桌面版之后（第 3 项）；合入后立即删除主检出的陈旧产物（第 6 项，§2.1）；新增主检出干净的检查（第 1、4、7 项，R29）；清理提交挪进第二轮的关闭窗口（§4.3 第 10 项）。

### 4.3 第二轮与收尾

10. 第二轮的关闭窗口（A06）。清理提交与启用 `glm-ui` 的提交，门禁都要跑 `npm run build`：它先由 `scripts/clean-dist.mjs` 删各包的 `dist/` 再编译，并重写 `packages/*/ui/client.js`，正是运行中的桌面版加载的文件（DEVELOPMENT.md §7，2026-10-28 重建客户端半后刷新页面得到 404）。所以两个提交都在桌面版关闭时做：
    1. 关桌面版（第 2 项的脚本），核对没有进程、9333 不再监听。
    2. 主检出 `status --porcelain` 只有 `?? .kiro/`，`main` 与 `origin/main` 相同。
    3. 清理提交：§2.1 的忽略项，§3.4 的 HANDOFF.md 与 DEVELOPMENT.md；三道门禁。
    4. 启用 `glm-ui` 的提交：去掉 `packages/glm/cordis.patch.yml` 里 `glm-hourness/glm-ui` 的 `disabled: true`；三道门禁。
    5. 推送这两个提交（不强推）。
    6. 启动（第 9 项的脚本），即 L4 第二轮（§4.6）。不再切换 profile。
11. 收尾（A16）：经输入框的模型菜单把新会话默认模型换回 brief 给定的值，即 DeepSeek 账号组的 deepseek-flash、推理强度 high（`agent-default-model` 应为 `provider: deepseek-account`、`model: deepseek-flash`、`reasoningEffort: high`），以这三个值为准。然后 `node <M>/scripts/profile-shape.mjs compare desktop <M>/.llm/l4-split/desktop-shape-switched.json`：本项目相关的差异（`isProjectDifference`，profile-shape:253）为零。`agent-default-model` 的摘要与切换后快照不同时（切换前的默认模型不是这三个值，或者只是写法不同），由人在设置页核对这三个值，差异报给父任务，不判失败。按 §2.6.6 末段确认 `<M>/.llm/l4-split/` 下没有链接，结果报给父任务。桌面版保持运行，CDP 9333。`split` 按 §7.4 的验收带证据关闭。

### 4.4 回滚

| 出问题的地方 | 做法 |
| --- | --- |
| 第 4 项 rebase 冲突或门禁不过 | 没有改动落到 main；修好再来，或者把桌面版开回去、交人 |
| 第 7 项主检出门禁不过 | 先看是不是主检出的环境问题（陈旧文件、`node_modules`）；是代码问题就在 split 上修、过 worktree 门禁、再 `--ff-only` 合入；修不了做整体回滚 |
| 第 8 项 `apply` 退出码 2 | `package.json`、锁文件与 `node_modules` 都没有动（第 3 小步的逐键比对不过时，记录与备份已经写出，下一次按「第 3 小步没有完成」重来）；按输出能修就修了再来；修不了做整体回滚（glmsandbox 已切换时一并回滚它） |
| 第 8 项 `apply` 退出码 1 | 读最后一次运行的输出文件（文件名由 `apply` 打印，也在记录的运行列表里，D02）、`apply` 打印的没过的项与 profile 的 `.plugin-manager/logs` 里这次的日志。按下面的顺序判断：<br>1. 第 4 小步记下了 DSH 的拒绝或告警（G25）：不重试。这说明 DSH 不接受主检出上的包清单，重跑也只会再告警一次。交人，由人选整体回滚，或者在 split 上修好、过 worktree 门禁、再 `--ff-only` 合入并重跑第 7 项，然后重跑 `apply`（续跑第 4 小步）。<br>2. 第 3b 小步不过（链接指向不符等）：不重试，交人。<br>3. 其余可以重试的（锁冲突、偶发 I/O、pnpm 失败而没有 DSH 的诊断行）：再运行一次 `apply`。停在 S1 的，重做第 3b 小步后从第 4 小步继续；看上去像 S2、而记录里第 4 小步没有通过或锁文件没有更新的，同样续跑第 4 小步（C01）；其余 S2 只重做核对（A03）。<br>4. 重试一次仍不过：整体回滚 |
| 第 8 项 `install` 卡住 | 时限由脚本执行（第 4 小步：本次输出文件连续 600 秒没有增长，或这次运行超过 1500 秒；正常一次约 2 分钟，§4.5）：它结束 DSH 及其全部子进程，在记录的这次运行里写「已中断」，打印 DSH 子进程号以及 `run.json`、`package.json.lock` 里的进程号是否还在、这两个文件是否留下，退出码 1（G26，D05）。编排者不另外中断；`apply` 在前台以 1800 秒的工具超时运行（§4.2 第 8 项）。之后：<br>1. 脚本报告有进程还在：交人。<br>2. 留下 `run.json` 或 `package.json.lock`（DSH 被强行结束时都不删）：下一次运行在运行前检查第 3 条以退出码 2 停下。交人，由人按脚本打印的进程号确认它们已不在，再决定删除这两个文件（删用户目录里的文件要人同意）。<br>3. 然后重跑 `apply`：最后一次运行是「已中断」，按记录续跑第 4 小步（C02、D05）。<br>4. 续跑又被中断：按上一行第 4 条，整体回滚 |
| 第 9 项 L4 第一轮不过 | 整体回滚，从第 0 项关桌面版开始（这时桌面版正在运行） |
| 第 10 项清理提交或启用提交的门禁不过 | 桌面版还关着，还没推送。修好后另起一个提交再跑门禁；启用提交修不了就撤销它，清理提交修不了也撤销（忽略项照旧保留，只多几条用不到的条目）；推送已有的提交，启动，交人 |
| 第 10 项第二轮不过 | 关桌面版，`git revert` 启用 `glm-ui` 的那个提交（清理提交保留），三道门禁，推送，启动；profile 不动 |

整体回滚（先关桌面版，到第 8 项之前不启动）：
0. 桌面版在运行就用 `.agents/tasks/split/desktop-close.ps1` 关闭，核对没有 `DeepSeek Harness` 进程、9333 不再监听（B02）。运行中的桌面版加载的正是第 3 项要删除的 `<M>/packages/*`，第 1–5 项都不能在它开着时做；`rollback` 的运行前检查第 2 条只是兜底。从这里到第 8 项不启动桌面版。
1. 主检出 `git revert --no-edit` 从新到旧撤销 split 合入的全部提交（包括第 10 项已经提交的两个；有合并提交时用 `-m 1`），推送，不强推。
2. 撤销改动了根 `pnpm-lock.yaml` 时，先在主检出运行 `pnpm install --frozen-lockfile`。
3. 删除新布局的残留（A04）：确认 `git -C <M> ls-files packages` 为空、`packages/` 下只剩构建产物（§2.6.6 K3 的条件），然后 `node <M>/.agents/tasks/split/profile-switch.mjs remove --path <M>/packages`。profile 里指向它的两个 junction 随之悬空；删除只经目录本身，不经 junction。不删的话，撤销后的 `.gitignore` 与 `eslint.config.js` 不再忽略 `packages/*/dist/` 与 `packages/*/ui/client.js`（flat config 的 `'dist/'` 只匹配配置所在目录，0.3 §7.4 因此给子包另加了忽略项），`git status` 不干净，`npm test` 会让 ESLint 扫到产物而失败。
4. `npm run build`（旧布局重新生成根 `dist/` 与 `ui/client.js`），`npm run preflight`，`npm test`。`rollback` 也运行 `install`，门禁按 AGENTS.md 强制流程第 2 条排在它之前。
5. 主检出 `git status --porcelain` 只有 `?? .kiro/`（§5.3）。
6. 对已经切换过的 profile 逐个运行 `rollback`，先 glmsandbox、后 desktop（理由同 §4.2 第 8 项）。运行方式同 §4.2 第 8 项：前台，工具超时 1800 秒，第 3 小步带同样的时限（D05）；被时限中断时按上表「`install` 卡住」一行处理，再重跑 `rollback`，它按记录从第 2 小步续跑（§2.6.2「续跑回滚」）。
7. 结构比对：`node <M>/.agents/tasks/split/profile-shape.mjs compare <profile> <M>/.llm/l4-split/<profile>-shape.json`（第 3 项的快照；主检出上的 `scripts/profile-shape.mjs` 已随撤销删去，用切换脚本旁边的拷贝）。本项目相关的差异（`isProjectDifference`，profile-shape:253）为零；其余差异列出。L4 第一轮第 5 项经模型菜单换过模型时，`agent-default-model` 必然不同（A13），按 §4.3 第 11 项处理。
8. 启动桌面版（第 9 项的脚本），核对插件页回到 `dsh-glm-hourness` 与 `dsh-glm-hourness-ui`，交人。

第 1 项必须在第 6 项之前：恢复出来的两个旧依赖，只有在主检出的根清单与 `ui/package.json` 重新声明 `dsh.bundle.patch` 时才会留在名单里（G16）；`rollback` 的运行前检查第 6 条会拒绝反过来的次序。第 3、4 项也必须在第 6 项之前：门禁排在 `install` 之前，而门禁要求主检出上没有新布局的产物。

整体回滚之后修好再合入，两个记录不用手工处理：成功的 `rollback` 在记录里写了 `rolledBack`，下一次 `apply` 从 S0 开始时把它改名后重来（§2.6.2，C05）。某个 `rollback` 没有成功时它的记录没有 `rolledBack`，重新合入时 `apply` 以退出码 2 拒绝，交人。

### 4.5 时段的预计占用（MERGE-SLOT REQUEST 用）

| 段 | 估计 |
| --- | --- |
| 第 1–8 项 | 约 20 分钟（三道门禁约 5 分钟，两次切换各约 2 分钟；第 7 项要先装根依赖时再加几分钟） |
| 第 9 项，L4 第一轮 | 约 30–40 分钟 |
| 第 10 项，两个提交、两次门禁与 L4 第二轮 | 约 30 分钟（一次关闭与启动） |
| 第 11 项 | 约 5 分钟 |

合计约 1.5 小时，桌面版两次重启（第 9、10 项）。第 4 项发现 main 动过、要重跑探针与演练时，再加约 30 分钟。第 8 项若遇到 pnpm 卡住，脚本最多 25 分钟（1500 秒）后自行中断，之后交人，这段不在估计之内。A3 的评审与 A4 的演练在时段之前，不计入。时长是估计，没有测过。

### 4.6 §7.6 的替换条目

- 准备：§4.1 与 §4.2 第 1–3 项。
- 第一轮第 1 项：桌面版日志与 crash log 没有本项目的新错误；宿主 stderr（第 9 项脚本写的 `dsh-err.txt`）里没有 `skipping profile bundle`（G6）；插件页列出 `dsh-glm-zcode` 与 `dsh-hourness`，都启用，标题、描述、图标是 §2.2 的内容，没有告警，不再有 `dsh-glm-hourness`、`dsh-glm-hourness-ui`（U4′）。
- 第一轮第 2、3、5、7 项：同 0.3。
- 第一轮第 4 项（A14）：0.3 的这一项写着 guard 按 G2 核对，以及「会话日志里系统提示词没有规则声明」。question-14 G3 下，第 7 步要在非 GLM 路由的系统提示词里加 guard 规则声明，所以这一项里 guard 的期望与「没有规则声明」一句，一并由第 7 步的设计与评审结论替换，不在本附录。其余（图工具在、`graph_show` 可用、有投影）同 0.3。
- 第一轮第 6 项：同 0.3，另加（R31）：右侧栏「开始」页里有「项目图」入口；与第 2 项的截图相比，入口在列表里的位置若变了，记下来，不判失败（客户端行提前是 §2.4 写明的已知后果）；之前打开的面板标签照常恢复（U8）。
- 第一轮第 8 项：`node <M>/scripts/profile-shape.mjs compare desktop <M>/.llm/l4-split/desktop-shape-switched.json`：本项目相关的差异为零，即 bundles、dependencies 与五条本项目覆盖项不变；`agent-default-model` 这时允许不同。
- 第二轮：结构比对同第一轮第 8 项；其余同 0.3。
- 收尾：§4.3 第 11 项。

## 5. 错误处理、输入校验与不变量（相对 0.3 §8 的增量）

### 5.1 可失败的操作

| 操作 | 失败条件 | 能否恢复 | 调用方得到 | 记录 |
| --- | --- | --- | --- | --- |
| `profile-switch plan` | 运行前检查不过；状态是混合 | 能（没写文件） | 退出码 2，列出不满足的项 | stderr |
| `apply` 写清单 | 取锁超时（另有写入者）；除两个键外不相等；写临时文件或改名失败；进程在第 3 小步里被中断 | 能 | 前两种退出码 2，`package.json` 没有写；改名失败退出码 1，输出写明仍是 S0 还是已到 S1。记录里第 3 小步是「写入中」，重跑时 S0 按「第 3 小步没有完成」重来，S1 且摘要等于 `hash3` 时接着做（D03）；中断时还持有写锁的，留下的 `package.json.lock` 由运行前检查第 3 条拦住，交人 | stderr；记录文件 |
| `apply` 拆旧链接（第 3b 小步） | 旧名字是链接但真实路径不符或解析不出；旧名字是目录或文件；已有的新名字不是链接或指向不符；`unlinkSync` 失败 | 能 | 退出码 1，状态 S1，没有运行 pnpm；点名条目，不打印目标。修好后再运行 `apply`，从 S1 重做第 3b 小步；或者 `rollback` | stderr；记录文件 |
| `apply` 的 `install`（第 4 小步） | 输出文件以 `wx` 新建失败；pnpm 退出码非 0；DSH 兼容性拒绝（G3、G25：DSH 写回 S1 清单与切换前的锁文件，修复安装按旧锁文件失败，两个新 junction 留下）；重跑时 DSH 的兼容性告警（G25）；pnpm 卡住，被脚本的时限中断（G26、D05） | pnpm 失败与中断能；DSH 的拒绝或告警要先修包清单 | 退出码 1；状态 S1，或看上去像 S2 而记录里第 4 小步没有通过。重跑 `apply` 时续跑第 4 小步（C01）。拒绝或告警不重试，交人（整体回滚，或修好后再合入，§4.4）。中断后脚本打印进程是否还在；留下 `run.json` 或 `package.json.lock` 时，下一次运行退出码 2，交人 | 这次运行的 `<profile>-pnpm-<毫秒时间戳>.txt`（文件名在记录的运行列表里，D02）；记录文件；profile 的 `.plugin-manager/logs/operation-*/pnpm.log` |
| `apply` 的核对（第 5、6 小步） | 不是 S2；清单其他键变了；依赖的形式不对；条目核对不过（O 组的链接缺了且不能重建或重建失败、非链接缺了、类型变了、链接的原始目标变了、目标消失、有新条目；Q 组有新条目、类型变了、链接的原始目标变了或目标消失）；覆盖项变了；组合不对 | 部分能 | 退出码 1，记录里写明没过的项；重建成功、「目标出现」与 Q 组消失的条目只点名，不算失败；之前就悬空、现在仍悬空且原始目标相同的链接不点名；新出现的、指回检出的链接已拆掉并点名，仍算失败 | stderr；记录文件 |
| `apply` 从 S2 开始 | 没有记录或 profile 名不同；续跑一支的第 3b、4 小步不过；重做的核对不过 | 能 | 前者退出码 2；续跑一支同第 3b、4 小步两行；重做核对不过退出码 1，不打印「已切换」 | 同上 |
| `rollback` | 运行前检查不过（含主检出还不是旧布局：旧的两份清单名字不对、没有声明 `dsh.bundle.patch` 或 patch 文件不在，D04）；起始状态既不是 S0 也不是 S1 的样子；记录已有 `rolledBack` 而状态不是 S0；`package.json` 的摘要既不等于 `hash3` 也不等于 `hash5`（`apply` 之后有人写过，G19）；第 2 小步拆链不过（新名字是目录或文件、旧名字指向不符、`unlinkSync` 失败）；`install` 不通过（退出码、诊断行或被时限中断，同第 4 小步）；核对不过；第 1 小步只恢复了一个文件就中断 | 部分能 | S0 退出码 0「无事可做」；检查、状态或摘要不过退出码 2，并列出形状差异；第 2–4 小步停下的（含被时限中断），重跑时按「续跑回滚」从第 2 小步继续；其余退出码 1，交人，按备份手工恢复 | 同上 |
| `rehearse` | 任一步不过（含哨兵文件缺了或变了；`rehearsal-dangling` 缺了、原始目标变了，或 `<run>/missing` 出现了）；后台进程退出而 `rehearsal.json` 没有 `finished`；`~/.dsh/profiles/` 下出现演练 profile（U11）；R6 的 `git status` 与 R1 不同；收尾拆不掉链接 | 能 | 退出码 1，`rehearsal.json` 写明哪一步；R6 不同时列出前后不同的路径（只有路径）；`finally` 按 §2.6.6 删除 `dsh-root` 与新出现的 `glmh-split-*`；拆不掉时写明「不要手工删除」，由下一次 R0 或 `remove` 处理 | 运行目录 |
| `remove` | `P` 不在 K1–K3；`unlinkSync` 失败；复查还有链接；删后断言不过 | 能 | 退出码 2 没有动；退出码 1 不删，或删后报告，点名条目 | stderr |
| 启动后插件页没有两个包，或 stderr 有 `skipping profile bundle` | 切换没有生效，或包的清单不对 | 能 | L4 第一轮不过 | L4 记录；按 §4.4 |
| 合入后、切换前误启动了桌面版 | 本项目的行全部缺席，覆盖项告警（G6）；开着时 profile 被写入，dsh-hmr 会按磁盘重组（F17） | 能 | 关掉，从 §4.2 第 7 项继续 | L4 记录写明 |

### 5.2 外部输入的校验

| 输入 | 规则 | 不满足时 |
| --- | --- | --- |
| 脚本所在的检出 `<M>` | `<M>/.git` 是目录 | 退出码 2 |
| `--profile` | 必填（`rehearse`、`remove` 除外）；`[A-Za-z0-9_-]+`；不带 `--home` 时只能是 `desktop`、`glmsandbox`；带 `--home` 时以 `glmh-split-` 开头 | 退出码 2 |
| `--repo` | `plan`、`apply` 必填；绝对路径；有 `scripts/packages.mjs` 与 `scripts/profile-shape.mjs`，后者与脚本旁的拷贝 SHA-256 相同；`PACKAGES` 恰好两项，名字为 `dsh-glm-zcode`、`dsh-hourness`，行 id 与客户端行等于 `NEW_IDS` 的两组 | 退出码 2 |
| `--old` | 可选，默认等于 `--repo`；`<old>` 与 `<old>/ui` 是目录；用于 R2 与 `rollback` 时两份 patch 的行等于 `OLD_IDS` | 退出码 2 |
| `--home` | 可选；绝对路径；按 `norm` 等于 `<run>/dsh-root`，`<run>` 是 `<M>/.llm/l4-split/` 的直接子目录、名字匹配 `^rehearsal-[0-9]+$`（C03）；不等于 `~/.dsh`，也不在它之下；给了就必须给 `--cli` | 退出码 2 |
| `--cli` | `carrier` 或 `plain`；desktop 只能 `carrier`，glmsandbox 只能 `plain`；带 `--home` 时必填 | 退出码 2 |
| `--record` | `apply`、`rollback` 必填；按 `norm` 等于固定路径：不带 `--home` 时为 `<M>/.llm/l4-split/switch-<profile>.json`，带 `--home` 时为 `<run>/switch-<profile>.json`（`<run>` 是 `--home` 的父目录）；`apply` 从 S0 开始时不存在，或者是第 3 小步没有完成的旧记录、写明 `rolledBack` 的记录（两者先改名，§2.6.2）；从 S1、S2 继续时存在且 profile 名相同（S1 与 S2 的续跑一支另要求 `package.json` 的摘要等于 `hash3`）；`rollback` 时存在，两个备份的 SHA-256 与记录相同，写明 `rolledBack` 时只接受 S0 | 退出码 2 |
| `--run` | `rehearse` 必填；按 `norm` 是 `<M>/.llm/l4-split/` 的直接子目录，名字匹配 `^rehearsal-[0-9]+$`，数字为毫秒时间戳（C03）；不存在 | 退出码 2 |
| `--worktree` | `rehearse` 必填，`remove` 可选；绝对路径；与 `<M>` 属于同一仓库（`git -C <worktree> rev-parse --path-format=absolute --git-common-dir` 的输出按 `norm` 等于 `<M>/.git`，G23）；`rehearse` 另要求两个包的 `dist/` 存在 | 退出码 2 |
| `--path` | `remove` 必填；属于 K1–K3（§2.6.6），存在，是目录，本身不是链接 | 退出码 2 |
| profile 的 `package.json` | 能解析；`dsh.profile.bundles` 是字符串数组；`dependencies` 是对象 | 退出码 2 |
| profile 目录 | 没有 `package.json.lock`、`.plugin-manager/run.json`（G10、G26）与 `compatibility.json`（G25）；只查是否存在，不读内容 | 退出码 2 |
| `<名>-pnpm-<毫秒时间戳>.txt`、`<名>-pnpm-rollback-<毫秒时间戳>.txt`（DSH 与 pnpm 的输出） | 每次运行新建，`wx` 打开；判定只读这次的文件，只按行首匹配 `dsh: installation rejected:` 与 `dsh: warning:` 两类，记类别；内容不进 stdout 与记录（D02） | 新建失败：退出码 1，不运行 pnpm。有任一类行：第 4 小步（或 `rollback` 第 3 小步）不通过 |
| 不属于本项目的链接（`apply` 第 1 小步时已在） | 记 `readlinkSync` 的原始字符串与目标是否存在，不做 `norm`，目标不存在不算错；前后逐字符比较；要重建时原始目标必须是绝对路径、所在的 scope 目录必须在（D01） | 原始目标变了、目标消失、不能重建或重建失败：第 5 小步（或 `rollback` 第 4 小步）不通过，退出码 1 |
| `.plugin-manager/run.json`、`package.json.lock` 里的进程号 | 只在第 4 小步（`rollback` 第 3 小步）被时限中断之后读，只取进程号（`run.json` 的 `pid` 须为正整数，锁文件内容须为正整数加换行，atomic-write:197），用于确认进程已不在；不删这两个文件 | 读不出：打印「进程号读不出」，照常退出码 1，交人 |
| 桌面版安装目录 `<D>` | `<D>\DeepSeek Harness.exe` 存在，`<D>\resources\app.asar` 是文件；`carrier` 另要求 `<D>\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.mjs` 存在（`DSH_DESKTOP_DIR` 可改 `<D>`，同 sandbox:19）；不带 `--home` 时 `<D>` 按 `norm` 等于 `%LOCALAPPDATA%\Programs\DeepSeek Harness`（G24） | 退出码 2 |

### 5.3 不变量与所在层

| 不变量 | 负责的层 | 理由 |
| --- | --- | --- |
| 根与 `ui/` 都不是 bundle：根清单没有 `dsh`、`main`、`exports`，根目录没有 `cordis.patch.yml`；第 6 步起 `ui/` 没有清单与 patch | preflight | rebase 冲突可能带回删掉的文件；被列进 profile 时会与两包的行重复 |
| 行 id 等于字面清单（12 或 13 项） | L2 `tests/contracts.spec.ts`；preflight 只核对组合与表一致；切换脚本的 `OLD_IDS`、`NEW_IDS` 运行时与表和 patch 核对 | R32：表与 patch 一起改名时 preflight 看不出来 |
| 每个宿主包都有插件页的显示信息 | preflight（§3.3 第 5 项） | G9；F-35 修过的显示问题不能回退 |
| profile 里两包相邻、GLM 在前、位于原伞包的位置 | 切换脚本（一次）；之后 profile 归人所有，探针守卫与 L4 结构比对能看到变化 | 宿主行的组合顺序与今天相同 |
| 切换只改两个键 | 切换脚本的逐键比对与 `compareShapes` | 人的要求与 AGENTS.md 第 6 条 |
| 切换在合入之后，profile 回滚在仓库撤销之后 | 合入顺序（§4.2、§4.4）；`rollback` 的运行前检查第 6 条 | G16 |
| `rollback` 不冲掉 `apply` 之后别人对 `package.json` 的写入 | `rollback` 的摘要检查（`hash3`、`hash5`） | G19 |
| 演练结束后（含失败），运行目录与 `~/.dsh/profiles/` 下没有演练建的链接与 profile，主检出与 worktree 的 `git status` 与 R1 相同 | `rehearse` 的 R0 与 `finally`，经 `remove` 的步骤 | A01：链接指回主检出与 worktree |
| 指回检出的链接所在的目录只经 §2.6.6 删除，不用 PowerShell 的递归删除 | `remove` 的允许范围（K1–K3）与本附录的操作约定 | G20：PowerShell 5.1 的递归删除会进入 junction |
| 指回检出的链接只由本脚本的 `unlinkSync` 删除，pnpm 只建不删：脚本运行的每一次 pnpm（`apply` 第 4 小步、`rollback` 第 3 小步，以及演练里的 `add`）开始时，profile 里没有它要删除的、指回检出的链接 | `apply` 第 3b 小步、`rollback` 第 2 小步；条目核对拆掉意外出现的这类链接；演练 R3、R4、R6 的哨兵文件与 `git status` 比对 | B01、G21：pnpm 删除依赖时对链接所在的路径做递归删除，遇到 junction 的行为没有核实；旧链接指向主检出根，那里有 `.llm/` 与未提交的 `.kiro/`，删错无法恢复。例外是 DSH 兼容性拒绝之后它自己运行的修复安装（G3），不在脚本控制之内；新包没有 `engines.dsh` 与 `@deepseek-ai/dsh*` peer（F7），兼容性检查对它们放行（第 2 轮评审 §5 对 G3 的核实），正常不会走到这里；即使走到，修复安装面对 S1 清单与旧锁文件会以 `OUTDATED_LOCKFILE` 失败（G25，推断它在删链接之前失败），旧链接也已由第 3b 小步拆掉，剩下的新链接只指向 `packages/*`，那里的内容都入库或可以重新构建 |
| DSH 的兼容性判断不会因为重跑而被绕过：第 4 小步只有在 DSH 退出码为 0、输出里没有拒绝行与告警行时才算通过 | `apply` 第 4 小步与 `rollback` 第 3 小步的诊断行判定；运行前检查第 3 条排除 `compatibility.json` | G25：重跑时两个新依赖算未改动，同样的不兼容只剩告警、退出码 0；续跑（C01）让重跑成为正常路径，这条判定因此必须在 |
| 不属于本项目的链接在切换与回滚前后仍在、原始目标不变；之前目标存在的，之后仍存在 | 条目核对的 O、Q 两组（`apply` 第 5 小步、`rollback` 第 4 小步）；演练 R3、R4 的 `rehearsal-keep`、`rehearsal-dangling` 与哨兵 | G13：profile 归人所有，这类链接在两轮评审之间就变过（三个悬空链接被删），时段之前还可能再变；按原始目标比较，目标在不在都能判断（D01） |
| 第 4 小步与 `rollback` 第 3 小步的判定只依据这一次运行 | 每次运行新建输出文件，记录的运行列表只看最后一项（D02） | 同一个 profile 上 `apply` 会运行多次（续跑、§4.4 的修好后重跑、R3）；追加写会让旧的拒绝行一直判不过，覆盖写会丢掉要追查的输出 |
| 一次卡住的 pnpm 运行最多 25 分钟就被结束，`apply`、`rollback` 在 1800 秒的工具超时之内返回 | 第 4 小步与 `rollback` 第 3 小步的时限（600 秒、1500 秒）与 `taskkill` | G26：DSH 不给 CLI 方式的 pnpm 设上限；时段里运行命令的是编排者的工具调用，没有终端（D05） |
| 整体回滚后主检出没有新布局的残留：`packages/` 不存在，`git status --porcelain` 只有 `?? .kiro/` | 整体回滚第 3、5 项（§4.4） | A04：撤销后的忽略项不再覆盖新布局的产物，下一个在主检出上工作的运行会撞上 |

0.3 §8.3 的「伞包组合等于两个子包组合之并」「占位包不含行」两行删去，其余行不变。

### 5.4 可测性

preflight 的新检查与字面清单在 L2 测（`tests/preflight.spec.ts`、`tests/contracts.spec.ts` 的夹具）。切换脚本不入库，没有 L2。它由两道关验证：一是独立代码评审（§4.1 A3），挡住判定本身写错与输出漏打值这类演练看不出的问题；二是演练（§2.6.5），用真实的 DSH 命令、真实的两种 pnpm 与生成的 DSH home，覆盖切换（含运行 pnpm 之前拆旧链接）、从 S2 重做核对、续跑第 4 小步、回滚、从 S0 回滚、全新安装与拆链删除；哨兵文件与两处 `git status` 的比对能看出 pnpm 或删除是否进入了被链接的目录。条目核对里「新出现的、指回检出的链接」与第 3b 小步的兜底分支在演练里正常不会走到，由评审核对代码路径。续跑第 4 小步由 R3 用两种 pnpm 各走一遍，走的是锁文件没有更新的那一支；记录里第 4 小步没有通过的那一支、DSH 的拒绝与告警行的判定（G25）以及等待时的报告（G26）由评审核对代码路径：演练里造不出 DSH 的拒绝，要造就得改 worktree 上的包清单，而 R6 拿 `git status` 与 R1 比。评审之后改过脚本就重跑完整演练。整体回滚的 `remove --path <M>/packages` 与本项目的新 junction 悬空的情形没有在演练里跑到，由评审核对代码路径。不属于本项目的悬空链接由 R2 的 `rehearsal-dangling` 覆盖（D01）：桌面形状上经 pnpm 11 的切换、续跑与回滚，以及 R6 的拆链删除；pnpm 8 没有覆盖，glmsandbox 有这类链接时时段里停下交人（U17）。O 组第 1 条的重建在演练里正常不会走到（链接没有缺），重建对悬空目标可行由本稿的本机试验支持（G20），代码路径由评审核对。每次运行新建输出文件由 R3 的续跑看得到（运行列表多一项、文件名不同，D02）；`hash3` 的「写入中」标记（D03）、时限中断（D05）与「续跑回滚」在演练里造不出，由评审核对代码路径。插件页的显示、客户端行次序的可见影响只在 L4。

## 6. 风险（相对 0.3 §7.7 的增删）

删去两行：「伞包与子包被同时列出」（没有伞包）；「m8-ui-audit 的 V-01 把行名改成包说明符，与伞包布局冲突」（question-18 A 已定推迟；B 下桌面 profile 的 dependencies 就是两个包，V-01 以后可以直接用子包说明符写宿主行名，例如 `dsh-glm-zcode/glm-llm`，F22 的映射对 dependencies 里的包成立；客户端行仍只能是路径形式，F11。这是给 V-01 设计的输入，不是 split 的工作）。

新增：

| 风险 | 缓解 |
| --- | --- |
| 合入后、切换前误启动桌面版 | 时段内第 2–8 项不启动；即使启动也只是缺行加告警（G6），关掉继续 |
| 切换中 pnpm 失败或被 DSH 拒绝，profile 停在半途 | 两个文件有备份；记录里有状态、摘要与第 4 小步的结果；`apply` 可以从 S1 继续，看上去像 S2 而 `install` 没有完成时续跑第 4 小步（C01），其余 S2 重做核对；`rollback` 可以回到 S0；演练先跑过同样的命令，含续跑 |
| 重跑把 DSH 的兼容性拒绝变成告警，切换判为成功，启动时两个包被拒 | 第 4 小步同时看退出码与诊断行（G25）；L4 第一轮第 1 项看插件页与 stderr |
| pnpm 卡住，DSH 不会自己停，时段里也没有终端可以中断 | 脚本自己执行时限：输出文件 600 秒没有增长或运行超过 1500 秒就结束 DSH 及其子进程，确认进程已不在；`apply` 在前台以 1800 秒的工具超时运行；留下的 `run.json`、写锁由运行前检查拦住，交人（G26，D05，§4.4） |
| pnpm 动了不属于本项目的链接，或把条目挪进 `.ignored/` | 源码上两种 pnpm 的 `install` 都不删清单以外的名字、不挪链接（G21、G13）；子进程不接终端、设 `CI=false`（U13、G27）；条目核对按四组前后比对，链接按原始目标比较，缺了的按原始目标重建并报告；演练里出现任何重建、目标变化、新条目或哨兵变化就不申请时段 |
| 不属于本项目的链接悬空，脚本按真实路径处理时在第 1 小步抛错（D01） | 这类链接只记原始目标，不做 `norm`（§2.6.2）；演练的桌面形状带一个悬空链接（R2）。真实桌面版的三个悬空链接已于 2026-10-29 删去（G13），这一条防的是时段之前再出现 |
| pnpm 删除两个旧 junction 时进入目标，删掉主检出根（含 `.llm/` 与未提交的 `.kiro/`）或 `ui/` 的内容 | pnpm 的删除是对链接路径的递归删除，junction 下的行为没有核实（G21）；`apply` 第 3b 小步在运行 pnpm 之前自己 `unlinkSync` 两个旧链接，`rollback` 第 2 小步对新链接做同样的事，pnpm 只会删到已经不存在的路径（U16，§5.3）；演练 R3 的旧布局就是真实的主检出，有了第 3b 小步，演练里两种 pnpm 同样碰不到指向主检出的链接 |
| 两种 pnpm 的锁文件格式不同（9.0 与 6.0） | 每个 profile 用建立它的那种 pnpm（G5）；演练两种都跑 |
| 回滚次序反了：先回滚 profile、再撤销合入 | §4.4 写明次序与理由（G16）；`rollback` 的运行前检查拒绝 |
| 删除演练目录时穿过 junction，删掉主检出（含 `.llm/`）或 worktree 的内容 | 只经 §2.6.6 先拆链、复查、再删除；失败的演练也在 `finally` 里这样清理；本附录禁止对这些目录用 PowerShell 的递归删除（G20） |
| 切换脚本自身的判定写错，演练按错的判定通过 | 独立代码评审（§4.1 A3）；演练覆盖从 S2 重做核对、续跑第 4 小步与从 S0 回滚这几条容易写错的路径 |
| 包名进了 profile，改名成本变高 | 以后改包名要再切换一次 profile，用同一套脚本与演练；0.3 §14.4「伞包布局下改名不涉及 profile」不再成立 |
| 插件页的显示信息回退 | 两个宿主包各带 locale 与图标，preflight 检查，L4 第一轮核对（U4′） |
| 桌面版的 profile 只能在关闭时经启动器切换，切换后的组合不能离线核对（G1） | 演练用同样的名单组合；L4 第一轮 |

## 7. 0.3 其余各处的处理

### 7.1 不变、继续有效的部分

- §1：F1–F23 全部仍成立。F6 不再被设计用到（没有伞包与子包同列）；F4、F5、C1、C2 照旧适用于两个宿主包。§1.6 的 U1–U3、U7、U8 不变；U4、U5、U9 按本附录 §1.2。
- §2 边界全部：§2.1 行与包表、§2.2 源码目录、§2.3 公共库、§2.4 跨包耦合清单、§2.5 行健康与 `/hourness-status`、§2.6 工具名契约、§2.7 目录表与边界强制、§2.8 脚本与测试的归属。§2.7 只多两处：`PACKAGES` 顺序的注释与第 5 步的 `LEGACY_CLIENT_BUNDLE`（§3.1）。
- §4 编排层的模型无关全部；guard 的行为由第 7 步按 question-14 G3 另行设计。
- §5.1、§5.3、§5.4、§5.6 不变；§5.2 除「`ui/` 只留占位清单」一句外不变；§5.5 按本附录 §3.3 第 7 项。
- §6 项目目标（question-13 A 已定）。
- §7.0 前置与并行：除第 3 条外不变；第 5 步的开始条件按本附录 §3.1。
- §7.1 第 0–4 步、第 7、8 步与表下关于第 7、8 步的段落。
- §7.2：本附录 §3.3 之外的条目（`profile-shape`、`contracts`（另加字面清单）、`check-verbatim`、其余修改）。
- §7.3：生成的 profile、守卫、`profile-shape.mjs`、deviceMid、新场景 `glm-no-dialect`、`glm-only`、`hourness-only`、client-modules 检查；`probe-full` 的组合按本附录 §3.1、§3.2。
- §7.4：本附录 §3.3 之外的部分（构建命令、tsconfig、逐字门禁、ESLint、knip、jscpd、`.gitignore`、清理提交的内容）。
- §7.5：第 0–4、7、8 步的文档。
- §7.6：本附录 §4.6 替换的条目之外不变。
- §8.1、§8.2 原有各行；§8.3 除删去的两行外；§8.4。
- §9 bootstrap：不变；B1 的「preflight 的固定行 id 随表增加」读作「字面清单同时加一项」。
- §10 并行工作：除 m8-ui-audit 一条外不变。
- §11：「改用户的桌面 profile 或 glmsandbox（§3.6 只是可选的后续）」改为「除 §2.6 的两键切换外，不改用户 profile 的任何文件（`cordis.patch.yml`、其他键、其他 profile）」；其余不变。
- §13 评审处理的记录（历史）。
- §14.1、§14.2、§14.6、§14.8。

### 7.2 因 B 失效、按本附录改读的地方

| 0.3 位置 | 改读 |
| --- | --- |
| §0 第 2 段「布局」：根改伞包、`ui/` 改占位包 | 根只作开发工作区，`ui/` 不再是包（§2.1） |
| §0「交付」：探针测伞包 | `probe-full` 测两包同列 |
| §0「已有 profile」：桌面版 profile 不用改 | 桌面版与 glmsandbox 按 §2.6 切换 |
| §0.1 第 5 项 | 已定 B |
| §1.6 U4、U5、U9 | §1.2 |
| §3.1–§3.7 | §2 |
| §5.2「`ui/` 只留占位清单……」 | 删去：`ui/` 没有清单（§3.2）。「不选的做法」里第三条（`ui/` 的 patch 引用 `../packages/*/ui/...`）照旧不选 |
| §5.5 末句：伞包与占位包不得声明 `dsh.client` | §3.3 第 7 项 |
| §7.1 第 5、6 步两行 | §3.1、§3.2 |
| §7.1 合入顺序与回滚段 | §4 |
| §7.2 `tests/preflight.spec.ts` 中伞包、占位包的夹具 | §3.3 |
| §7.3「组合」一条与 `duplicate-listing` | §3.1、§3.2 |
| §7.4 preflight 第 2、4、5、7 项 | §3.3 |
| §7.5 第 5、6 行与 DESIGN.md §2.3 定案的改写 | §3.4 |
| §7.6 准备、第一轮第 1、4（guard 与规则声明一句）、6、8 项、第二轮与收尾的比对对象 | §4.6、§4.3 |
| §7.7「伞包与子包被同时列出」「V-01……与伞包布局冲突」 | §6 |
| §8.3「伞包组合……」「占位包不含行」 | §5.3 |
| §12「伞包加占位包而不改 profile」 | §8 |
| §14.3 选项 A 文字中的「伞包 profile」「桌面版 profile 不改」 | §7.4 |
| §14.4「伞包布局下改名不涉及 profile」 | 包名在 profile 里，改名要再切换一次（§6） |
| §14.5 | 已定 B |
| §14.7 | question-18 A 已定；B 下 V-01 的输入见 §6 |

### 7.3 与第 3 轮 LOW（R28–R32）的关系

实现者按任务要求逐条决定这五条（决定记在 `.agents/tasks/split/low-decisions.md`）；本附录改写的部分已经处理了其中四条：
- R28（依据与并行状态过时）：本附录的依据是 `7148448`，用到的事实已更新：m1-cleanup 已完成，profile 的 patch 为 12 条、其余 7 条；m8-ui-audit 的 F-35 已合入，m8-ui-audit 已完成；V-01 由 question-18 A 定为推迟，留作 split 之后的任务 `m8-row-titles`。0.3 正文里其余过时的地方由实现者按 R28 处理，不影响本附录。
- R29（主检出干净）：纳入合入顺序（§4.2 第 1、4、7 项；§4.3 第 10 项同样）。
- R30（V-01 与开始条件互相等待）：第 5 步的开始条件写明不含 V-01（§3.1）；question-18 A 已定，矛盾不再存在。
- R31（客户端行提前）：§2.4 写明原因与取舍，L4 第一轮第 6 项核对（§4.6）。
- R32（固定行 id 的来源）：采纳评审建议，字面清单放在 `tests/contracts.spec.ts`（§3.3）。

### 7.4 对人定事项的影响

- question-15 A（验收按设计的验证手段改写）在 B 下的文字，第 8 步的 `graph-step8.json` 用这一版：
  1. 「两个包单独装上、单独启用都不报错（以探针生成的 `probe-glm`、`probe-hourness` 与两包同列的 `probe-full` 为准）；只装编排层包时，非 GLM 会话里项目图与面板生效，guard 按 question-14（G3）对所有路由生效」
  2. 「行 id 不变；桌面版与 glmsandbox 的 profile 只改了 `package.json` 的 bundles 与 dependencies（改前备份），五条本项目覆盖项照常生效（L4 结构比对）」
  3. 「门禁、探针全过；桌面版批次 L4 通过」（不变）

  与人选 A 时看到的后果文字相比，第 1 条的「伞包 profile」换成 `probe-full`，第 2 条的「桌面 profile 不改」换成两键切换。这是同一个选项在 B 布局下的写法；编排者落图之前在对话里向人说明这两处差异。
- question-16 A：包名现在写进两个 profile，以后改名要再切换一次（§6）。
- question-17 B：本附录。
- question-18 A：不变；B 让 V-01 以后的做法更简单（§6）。

## 8. 由 agent 自定、人可推翻的事项（本附录新增）

切换方式 b，只改两个键再 `install`（§2.6.1）；两个包放在原伞包的位置、GLM 在前（§2.4）；新依赖写 `link:` 加绝对路径（§2.4）；先 glmsandbox 后 desktop，回滚同样先 glmsandbox（§4.2、§4.4）；desktop 用安装自带的 pnpm、glmsandbox 用 PATH 上的 pnpm（§2.6.2）；根保留名字与 `peerDependencies`、加 `private`、不设工作区（§2.2）；图标的分配（沙漏给编排层，GLM 新画）与两个包的标题、描述文字（§2.2）；`ui/` 的 locale 与图标删去（§2.1）；主检出的陈旧产物在合入后立即删除，忽略项仍等清理提交（§2.1）；rebase、门禁、探针、脚本评审与演练放到申请时段之前（§4.1）；门禁在切换之前（§4.2）；快照在关桌面版之后（§4.2）；清理提交与启用 `glm-ui` 的提交都在第二轮的关闭窗口里（§4.3）；`LEGACY_CLIENT_BUNDLE` 只存在于第 5、6 步之间（§3.1）；字面的行 id 清单（§3.3）；切换脚本与演练不入库，由独立代码评审代替分支评审（§2.6.2、§4.1）；脚本带一份 `profile-shape.mjs` 拷贝供回滚使用（§2.6.2）；`rollback` 在运行 pnpm 之前拆掉两个新链接（§2.6.2，U15）；`apply` 在运行 pnpm 之前拆掉两个旧链接，并要求已有的新链接指向 `<repo>/packages/*`（第 3b 小步）；条目核对分四组、意外出现的指回检出的链接拆掉但仍判失败（§2.6.2）；组合输出只认行首的 `- id: `，比评审建议的 `^\s*` 更严（§2.6.2）；演练的哨兵文件放在 `@local` 链接指向的目录里（§2.6.5）；`restart.ps1` 用逐字节拷贝（§4.1 A3）；不带 `--home` 时 `<D>` 必须是默认安装目录（§2.6.2）；`remove` 只接受 K1–K3 三类目录（§2.6.6）；演练的沙盒形状 profile 剪成 glmsandbox 的条目名（§2.6.5）；备份在 `split` 关闭之前不删（§2.6.4）。第四稿新增：看上去像 S2 而 `install` 没有完成时续跑第 4 小步，条件按记录与锁文件判断（§2.6.2，C01）；第 4 小步同时看 DSH 的退出码与拒绝、告警行，运行前检查排除 `compatibility.json`（G25）；子进程设 `CI=false`（G27）；等待时每 60 秒报告输出文件大小（G26；第四稿的「10 分钟没有增长由人中断」在第五稿改为脚本自己执行时限，见下）；`rollback` 成功时在记录里写 `rolledBack`、记录不改名，下一次 `apply` 从 S0 开始时改名（C05）；`--run`、`--home`、`--record` 都是固定形式（C03）；续跑的演练两种形状都做（R3）。第五稿新增：不属于本项目的链接按原始目标逐字符比较、重建时不在 `node_modules` 里建目录、原始目标不是绝对路径的不重建，另加「目标消失」判失败与「目标出现」只记录两条（§2.6.2，D01）；新出现的链接按目标路径做 `norm`（§2.6.2）；`plan` 列出不属于本项目的链接，glmsandbox 有这类链接时停下交人（§4.2 第 8 项）；`apply`、`rollback` 在前台以 1800 秒的工具超时运行，另设 1500 秒的总时限，`rehearse` 在后台运行并轮询 `rehearsal.json`（§2.6.2、§2.6.5、§4.2，D05）；中断之后留下的 `run.json` 与写锁仍交人删除，不由脚本删（§4.4）；`rollback` 在第 1 小步之后写标记，停下后按「续跑回滚」从第 2 小步继续（§2.6.2）。

## 9. 评审意见的处理

### 9.1 第 1 轮（附录 0.1，A01–A17）

第 1 轮评审（附录 0.1，CHANGES_REQUESTED）的 17 条全部处理，没有推迟，也没有不采纳的；第 2 轮评审确认全部关闭。下表是附录 0.2 的处理记录，落点按附录 0.2 的写法；其中 A11、A17 的条目核对在附录 0.3 改由 §2.6.2 的「条目核对」承担（B03），U14 的「旧 junction 被挪进 `.ignored/`」一支在附录 0.3 删去（B01）。§9.1–§9.4 里的「0.1」至「0.5」都指附录的版本，不是 `design.md` 的版本。

| # | 级别 | 处理 | 落点 |
| --- | --- | --- | --- |
| A01 | HIGH | 采纳。新增拆链删除的固定步骤：Node 不跟随链接地遍历，逐个 `unlinkSync` 链接，复查没有链接才 `rmSync`，删后断言主检出与 worktree 的关键文件在、git 状态由调用方比对；只接受三类目录（演练的 `dsh-root`、`~/.dsh/profiles/glmh-split-*`、整体回滚时的 `<M>/packages`）；`rehearse` 的 R0 先清理以前留下的、`finally` 在任何失败后清理，U11 的清理只删 R1 之后新出现的 `glmh-split-*`；禁止对这些目录用 PowerShell 的递归删除。遍历比评审建议的列出几层更宽：覆盖整个目录树，`.pnpm/` 等也在其中 | §2.6.5、§2.6.6、G20、U11、§5.1、§5.3、§6 |
| A02 | MEDIUM | 采纳。新依赖写 `link:` 加绝对路径、正斜杠，与今天的写法、`dsh plugin add`（`anchorPathSpec`）和 `scripts/sandbox.mjs` 相同；删去相对路径的推断；`apply` 第 5 小步、R3、R5 按形状核对 | G17、§2.4、§2.6.2、§2.6.5 |
| A03 | MEDIUM | 采纳。S2 上必须有同一 profile 的记录，重做第 5、6 小步并按结果给退出码，通过才打印「已切换」；没有记录的 S2 退出码 2。§4.4 那一行改写；演练 R3 加一次从 S2 重跑 | §2.6.2、§2.6.5 R3、§4.4、§5.1 |
| A04 | MEDIUM | 采纳。整体回滚改为：撤销并推送；按需 `pnpm install --frozen-lockfile`；确认 `packages/` 不再被跟踪、只剩产物后经 `remove` 删除；build、preflight、test；查主检出干净；先 glmsandbox 后 desktop 逐个 `rollback`；结构比对；启动核对。§5.3 加不变量。删 `packages/` 后两个新 junction 悬空，`rollback` 接受这种起始状态，并在运行 pnpm 之前拆掉它们（U15） | §4.4、§2.6.2 `rollback`、§2.6.6 K3、§5.3 |
| A05 | MEDIUM | 采纳。A3 把切换脚本、它的 `profile-shape.mjs` 拷贝、`desktop-close.ps1` 与 split 的 `restart.ps1` 交给独立代码评审，记录写在 `.agents/tasks/split/switch-review.md`，轮次规则同分支评审；之后改过脚本就先评审再重跑完整演练；MERGE-SLOT REQUEST 写明两项结论 | §4.1 A3–A5、§5.4、§6 |
| A06 | NIT | 采纳第一种做法：清理提交挪进第二轮的关闭窗口，与启用 `glm-ui` 的提交一起做，各跑一次门禁，再推送、启动 | §4.3 第 10 项、§4.4、§4.5、§2.1、§3.4 |
| A07 | NIT | 采纳。统一用 `<D>` = `DSH_DESKTOP_DIR`；写明 exe、`carrier`、`plain` 的完整命令行与 `ELECTRON_RUN_AS_NODE=1`，`dsh.cmd` 的位置改为 `<D>\resources\runtime\cli\bin\dsh.cmd`。另改正 0.1 的一处错误：0.1 要求脚本检查 `cli.js` 与 `bin.js` 存在，但它们在 `app.asar` 归档里，普通 Node 看不到；现在只查 exe、`app.asar` 与自带 pnpm，与 sandbox:26–30 一致 | 证据写法段、G1、§2.6.2、§3.4、§5.2 |
| A08 | NIT | 采纳。定义 `norm`（`realpathSync.native`、去尾部分隔符、win32 不分大小写），所有路径相等与「在…之下」的判断按它 | §2.6.2、§2.6.6、§5.2 |
| A09 | NIT | 采纳。`OLD_IDS`、`NEW_IDS` 写死在脚本里，内容与 `tests/contracts.spec.ts` 相同；`NEW_IDS` 运行时与 `<repo>/scripts/packages.mjs` 核对。另加：`OLD_IDS` 在 R2 与 `rollback` 时与旧布局的两份 patch 核对 | §2.6.2、§3.3、§5.3 |
| A10 | NIT | 采纳。`--home`、`--record`、`--run` 都必须在 `<M>/.llm/l4-split/` 之下；`rehearse` 以子进程调用 `apply`、`rollback` 并显式传 `--cli`；第 8 项的快照命令写全。`rehearse` 去掉 `--main` 参数，`<M>` 由脚本位置推出 | §2.6.2、§2.6.5、§4.2 第 8 项、§5.2 |
| A11 | NIT | 采纳。R3 以 `apply` 的输出为准，出现任何「重建」就不过；重建失败时 `apply` 与 `rollback` 退出码 1，点名条目，不打印目标 | §2.6.2、§2.6.5 R3、U10 |
| A12 | NIT | 采纳。记录 `hash3` 与 `hash5`；`rollback` 接受 S0（无事可做，退出码 0）与「名单和依赖是 S1 的样子、摘要等于 `hash3` 或 `hash5`」的状态，其余退出码 2 并列出形状差异。按评审的分法，S1 与 S2 分别只对一个摘要；这里两个都接受，因为 `reconcile` 不写文件时两者相同，而整体回滚删掉 `packages/` 后状态既不是 S1 也不是 S2 | §2.6.2、G19、§5.1、§5.3 |
| A13 | NIT | 采纳。整体回滚的结构比对要求本项目相关的差异为零（`isProjectDifference`），其余列出 | §4.4 第 7 项 |
| A14 | NIT | 采纳。§4.6 写明第一轮第 4 项里 guard 的期望与「没有规则声明」一句一并由第 7 步替换 | §4.6、§7.2 |
| A15 | NIT | 采纳。备份命名改为沿用 DEVELOPMENT.md §5 第 3 条的 `.bak-*` 写法，并记下两个 profile 今天没有备份文件 | §2.6.4、G18 |
| A16 | NIT | 采纳。以 brief 的三个值为准；摘要与切换后快照不同时由人在设置页核对，差异报给父任务，不判失败 | §4.3 第 11 项 |
| A17 | NIT | 采纳。`apply` 第 1 小步记 `.modules.yaml` 是否存在、列出 `.ignored/` 的条目；第 5 小步点名 `.ignored/` 的新条目，本项目旧 junction 拆掉，其他新条目判失败；R2 把沙盒形状 profile 的 `node_modules` 剪成 glmsandbox 的条目名；新增假设 U14 | G18、U14、§2.6.2、§2.6.5 R2–R3 |

评审之外，修订时自查发现并改正两处：
- `rollback` 用的形状函数原先没有来源。0.1 让脚本从 `--repo` 的 `scripts/profile-shape.mjs` 导入，但 `rollback` 没有 `--repo`，整体回滚时主检出上的这个文件也已随撤销删去。现在脚本带一份逐字节相同的拷贝，`plan`、`apply` 核对拷贝与分支文件的摘要（§2.6.2），整体回滚的结构比对也用这份拷贝（§4.4 第 7 项）。
- 整体回滚删掉 `<M>/packages` 之后，两个新 junction 悬空，0.1 的 S0–S2 都描述不了这个状态，`rollback` 会以「其他组合」拒绝。现在 `rollback` 按名单、依赖与摘要判断起始状态，`node_modules` 里这两个条目只要求是链接或不存在，并在运行 pnpm 之前拆掉它们（§2.6.2，U15）。

### 9.2 第 2 轮（附录 0.2，B01–B07）

第 2 轮评审（`.agents/tasks/split/addendum-review.md`，附录 0.2，CHANGES_REQUESTED）的 7 条全部处理，没有推迟，也没有不采纳的。三处做法与评审的建议不完全相同，理由写在该行。

| # | 级别 | 处理 | 落点 |
| --- | --- | --- | --- |
| B01 | MEDIUM | 采纳，并先补上评审指出缺失的依据：读了两种 pnpm 的产物代码（G21）。`install` 删除不再需要的直接依赖时，对 `node_modules/<名字>` 做递归删除（pnpm 11 是 `fs.promises.rm` 加 `recursive`，pnpm 8 是 `rimraf` 包），遇到 junction 的行为取决于运行时，没有核实，评审的担心成立。做法：`apply` 加第 3b 小步，在写出 S1 之后、运行 pnpm 之前，`unlinkSync` 真实路径等于 `<old>`、`<old>/ui` 的两个旧链接并点名；是目录、文件、指向不符或解析不出的，退出码 1，不运行 pnpm；记录写明 3b 完成；从 S1 继续时先重做 3b。另加两条对称的检查：3b 要求已在的新链接指向 `<repo>/packages/*`，`rollback` 第 2 小步要求还在的旧链接指向 `<old>`、`<old>/ui`，否则不运行 pnpm，这样脚本运行的任何一次 pnpm 都没有要删的、指回检出的链接。新增 U16（两种 pnpm 在登记过的链接已不在时照常完成安装；删除那一段容忍路径不存在是实读，整体是推断），在 R3 用两种 pnpm 核实，不成立时 `apply` 退出码 1。U10、U14 改写，U14 的「旧 junction 被挪进 `.ignored/`」一支删去；源码上两种 pnpm 本来也不挪链接（G21）。§2.6.1 改为四种动作。与评审建议的不同：评审设想的第四种动作是保留附录 0.2 的「拆掉被挪进 `.ignored/` 的旧 junction、不算失败」；附录 0.3 把它换成「条目核对里新出现的、指回检出的链接一律拆掉，但仍判失败」，因为有了 3b 之后，这类链接出现只能说明假设不成立，不应当静默通过。§5.1 加 3b 一行，§5.3 加不变量「指回检出的链接只由本脚本的 `unlinkSync` 删除，pnpm 只建不删」，并写明 DSH 兼容性拒绝之后的修复安装不在脚本控制之内、为什么风险可以接受。演练的 `keep/` 里放哨兵文件，R3、R4、R6 之后核对它在、SHA-256 不变 | G21、U10、U14、U16、§0、§2.6.1、§2.6.2 第 3b 小步与 `rollback` 第 2 小步、§2.6.5 R2–R4、R6、§5.1、§5.3、§5.4、§6 |
| B02 | NIT | 采纳。整体回滚加第 0 项：桌面版在运行就用 `desktop-close.ps1` 关闭，核对没有进程、9333 不再监听，到第 8 项之前不启动；标题改为「先关桌面版，到第 8 项之前不启动」；表格里 L4 第一轮不过的一行指向第 0 项 | §4.4 |
| B03 | NIT | 采纳。`apply` 第 5 小步与 `rollback` 第 4 小步改用同一份「条目核对」：条目分 P（本项目）、I（pnpm 内部）、Q（`.ignored/`）、O（其他）四组；O 组缺了、类型变了、多出来都点名，多出来的写明类型，除可重建的链接外都退出码 1；Q 组新条目点名、写明类型、退出码 1，之前有现在缺的点名、只记录、不算失败，类型变了退出码 1。另写明 I 组名单是固定的，演练里遇到别的 pnpm 内部条目（例如 `.bin`）按多出来的条目判不过，改名单要过 A3 的评审 | §2.6.2 条目核对、§5.1 |
| B04 | NIT | 采纳，正则比建议的更严：取行 id 用 `^- id: (glm-hourness/[a-z-]+)\s*$`，只认行首。理由是 `groupedDump` 把每组写成顶层序列，本项目的行由不带 `id` 的 `insert` 追加在顶层（G22），只认行首就不会把 `config` 里嵌套的列表项当成行；建议里的 `^\s*` 会取到它们。「恰好」指没有重复、集合相等。层按之前最近的 `^# == (.+)$` 判断，来源取第一个 `, patched by ` 之前的部分；R3 的次序判断改写成按组的来源序列。§3.1 写明两包 patch 的每条 insert 以 `id` 开头；写法不同只会让核对不过 | G22、§2.6.2 组合输出的读法、第 6 小步、`rollback` 第 4 小步、§2.6.5 R2、R3、R5、§3.1 |
| B05 | NIT | 采纳。A4 加一条：编排者确认演练期间没有别的运行在主检出或 worktree 上工作，做法同 §4.2 第 1 项；§2.6.5 末段的排期写明原因；R6 不同时列出前后不同的路径，只有路径 | §2.6.5 末段与 R6、§4.1 A4、§5.1 |
| B06 | NIT | 采纳，写法更严：`.agents/tasks/split/restart.ps1` 是原脚本的逐字节拷贝。原脚本的输出路径取 `$PSScriptRoot`（G24），拷贝放在 split 目录下，输出自然写到 split 目录，不需要改任何一行；A3 的评审核对两者 SHA-256 相同，`desktop-close.ps1` 与原脚本第 4–6 行相同。A5 的请求写明这是对 brief 的偏离，需要父任务接受 | G24、§4.1 A3、A5、§4.2 第 2、9 项 |
| B07 | NIT | 采纳。两处都改为 `git -C <worktree> rev-parse --path-format=absolute --git-common-dir`，再按 `norm` 与 `<M>/.git` 比较。本机 git 2.55.0 上核实过：主检出里不加这个选项输出相对的 `.git`，加了输出绝对路径（G23） | G23、§2.6.5 R0、§5.2 |

评审之外，修订时自查发现并改正一处：`restart.ps1` 启动的是写死的 `%LOCALAPPDATA%\Programs\DeepSeek Harness\DeepSeek Harness.exe`（G24），切换脚本却按 `DSH_DESKTOP_DIR` 找 `<D>`；两者不同时，切换用的 pnpm 与命令行启动器和 L4 启动的桌面版不是同一个安装。现在不带 `--home` 时，运行前检查第 1 条要求 `<D>` 等于这个默认路径；§4.2 第 1 项在关桌面版之前先看一眼这个环境变量（§2.6.2、§4.2、§5.2）。

### 9.3 第 3 轮（附录 0.3，C01–C08）

第 3 轮评审（`.agents/tasks/split/addendum-review.md`，附录 0.3，CHANGES_REQUESTED，MEDIUM 1、NIT 7）的 8 条全部处理，没有推迟，也没有不采纳的。两处做法与评审的建议不完全相同（C01 的判定、C05 改名的时机），理由写在该行。

| # | 级别 | 处理 | 落点 |
| --- | --- | --- | --- |
| C01 | MEDIUM | 采纳，并补上一处评审没有提到的后果。「从 S2 开始」分两支：`package.json` 的摘要等于 `hash3`，并且记录里第 4 小步没有通过、或锁文件 `importers['.'].dependencies` 的键名不等于两个新名字时，按「从 S1 开始」处理（重做第 3b 小步：旧链接已不在就跳过，已在的新链接必须指向 `<repo>/packages/*`；再从第 4 小步继续），输出写明「续跑第 4 小步」；其余情形只重做第 5、6 小步。「DSH 的兼容性拒绝恢复了第 3 小步写出的文件」一句从「从 S1 开始」移到续跑一支。§4.4「第 8 项 `apply` 退出码 1」一行与 §5.1 的两行改写。R3 加续跑：用第 2 小步的锁文件备份覆盖 `pnpm-lock.yaml`，再运行 `apply`，要求重跑第 4 小步、退出码 0，然后进入 R4。与评审建议的不同有两处。一是续跑在两种形状上都做，评审只要求沙盒形状：真实的 desktop 用 pnpm 11，续跑也要在它上面跑过。二是续跑之后的判定：读 `runProfilePnpm` 发现，重跑时两个新依赖的写法与装好的清单都与开始时相同，DSH 把它们算作未改动，同样的不兼容只输出一行 `dsh: warning:`、退出码 0、照常 `reconcile`（G25，ops:507、530）。只看退出码，续跑会把第一次的拒绝绕过去。所以第 4 小步改为退出码为 0、并且输出里没有 `dsh: installation rejected:` 与 `dsh: warning:` 行才算通过；运行前检查第 3 条加「没有 `compatibility.json`」，排除这类告警的另一个来源（dsh-plugin:73）；§4.4 写明 DSH 的拒绝或告警不重试，交人选整体回滚或修好后再合入；§5.3 加不变量 | G25、§0、§2.6.2 记录、运行前检查第 3 条、第 4 小步、「从 S1 开始」「从 S2 开始」、`rollback` 第 3 小步、§2.6.5 R3、§4.1 A3、A5、§4.4、§5.1、§5.2、§5.3、§5.4、§6 |
| C02 | NIT | 采纳。子进程环境设 `CI=false`，另外五个变量照旧去掉；补上 G27（ci-info 的判定、两种 pnpm 的清空询问、pnpm 8 只在有 `.modules.yaml` 时才校验）。U13 按源码改写：pnpm 11 一半已核实，pnpm 8 一半靠不走清空路径（glmsandbox 切换前没有 `.modules.yaml`，回滚与续跑读到的那份由同一个 pnpm 8 写出）。另补 G26（CLI 方式下 DSH 不给 pnpm 设静默上限，`run.json` 只在 DSH 看到运行结束时删除），据此在第 4 小步加等待时的报告：每 60 秒一行，写已等待的秒数与输出文件的字节数，让「长时间没有输出」能在终端里看到。§4.4 加「`install` 卡住」一行：10 分钟没有增长就 Ctrl+C，留下 `run.json` 或 `package.json.lock` 时下一次运行前检查第 3 条退出码 2，交人 | G26、G27、U13、§2.6.2 第 4 小步、§4.4、§5.1、§6 |
| C03 | NIT | 采纳。`--run` 必须是 `<M>/.llm/l4-split/` 的直接子目录，名字匹配 `^rehearsal-[0-9]+$`，数字为毫秒时间戳；`--home` 给出时必须等于这样一个 `<run>` 下的 `dsh-root`；K1 与 R0 的残留扫描用同一条规则。同类的另一处一并收紧：`--record` 由「在 `<M>/.llm/l4-split/` 之下」改为固定路径（不带 `--home` 时为 `<M>/.llm/l4-split/switch-<profile>.json`，带 `--home` 时为 `<run>/switch-<profile>.json`） | §2.6.2 参数、§2.6.5 命令与 R0、§2.6.6 K1、§5.2 |
| C04 | NIT | 采纳。§4.2 第 7 项开头：`git -C <M> diff --name-only B main -- pnpm-lock.yaml` 不为空时，先在主检出用 PATH 上的 pnpm 运行 `pnpm install --frozen-lockfile`，再跑三道门禁；`B` 取第 4 项最后确认的值。§4.5 的估计相应加注 | §4.2 第 7 项、§4.5 |
| C05 | NIT | 采纳评审的第一种做法，改名的时机不同。照建议在 `rollback` 成功时就改名，R4 里第二次 `rollback`（期望「无事可做」、退出码 0）会因为运行前检查第 6 条找不到记录而以退出码 2 失败。所以 `rollback` 成功时只在记录里写 `rolledBack`（毫秒时间戳），记录不改名；`apply` 从 S0 开始遇到写了 `rolledBack` 的同一 profile 的记录，把它改名为 `<文件>.rolled-back-<毫秒时间戳>` 后从第 1 小步重来，上次的备份不动。`rollback` 遇到写了 `rolledBack` 的记录只接受 S0。§4.4 整体回滚末尾写明重新合入时不用手工处理记录 | §2.6.2 记录、`apply`「从 S0 开始」、`rollback` 起始状态与第 4 小步、§2.6.4、§4.4、§5.1、§5.2 |
| C06 | NIT | 采纳。A5 的请求加上评审给的那句，并写明改的内容与 0.3 §3.6 相同、做法不同，需要父任务接受 | §4.1 A5 |
| C07 | NIT | 采纳。范围改为 G1–G23，并加上本稿新增的 G25–G27；G24 不进 FACTS.md | §3.4 第 5 行 |
| C08 | NIT | 采纳评审给的写法：`apply` 与 `rollback` 对 `node_modules` 只有这四种动作，不删其中的目录与文件；`rehearse` 的 R2 只在演练 profile 里删文件条目，`remove` 按 §2.6.6 | §2.6.1 |

评审之外，修订时自查发现并改正三处：
- 第 4 小步只看退出码会让续跑绕过 DSH 的拒绝（G25）。这是 C01 一行里的「续跑之后的判定」，由读 `runProfilePnpm` 发现，评审的修正建议没有覆盖。
- 评审第 6 节的引用说明（`scripts/probe/run-probe.mjs` 的行号是主检出上的）：§2.2 改为同时写主检出 :149、155、657、670 与 worktree 第 2 步 `0fe76a5` 上的 :196、202、731、744（本稿按两处文件核对过）。
- 依据从 `8f1a4c6` 更新到 `7148448`：之间只有图提交与 m8-ui-audit 的 `20ed994`（只改 `ui/src/graph/Panel.tsx`），本附录用到的仓库事实不变；m8-ui-audit 已完成，V-01 留作任务 `m8-row-titles`（版本头、§7.3 R28）。

评审第 6 节列为未核实的几项，本稿的处理：pnpm 以非 0 退出时建链接与写锁文件的先后，不再需要知道：链接没建时是 S1，建了是看上去像 S2 而第 4 小步没有通过，两种情形都重做第 3b 小步再续跑第 4 小步；`.modules.yaml` 与 pnpm 11.28.5 不兼容时 pnpm 11 无 TTY 即中止，第 4 小步不通过，停在 S1，按 §4.4 处理，仍是安全的一侧；其余各项（运行时 `fs.rm` 遇到 junction 的行为、宿主 stderr 是否进入 `dsh-err.txt`、`SetConsoleCtrlHandler`、`desktopNextPlugins` 的值）不变，依旧由演练、L4 或运行前的设防兜住。

### 9.4 第 4 轮（附录 0.4，D01–D05）

第 4 轮评审（`.agents/tasks/split/addendum-review.md`，附录 0.4，CHANGES_REQUESTED，MEDIUM 1、NIT 4）的 5 条全部处理，没有推迟，也没有不采纳的。评审之后事实变了一处：父任务转告，桌面版 profile 的三个 `@local` junction 是孤立的链接（不在名单、依赖、锁文件与 `cordis.patch.yml` 里），编排者于 2026-10-29 应人的要求只删了这三个链接，`@local/` 现在是空目录（本稿只读核对过）。父任务要求保留评审给的通用修正，因为时段之前 profile 还可能再变。两处做法比评审的建议多走一步（D01 的目标存在性比较、D05 的总时限与运行方式），理由写在该行。

| # | 级别 | 处理 | 落点 |
| --- | --- | --- | --- |
| D01 | MEDIUM | 采纳。G13 按事实变化改写：写明三个链接曾经悬空，DSH 与 pnpm 11 怎样对待悬空链接（app-boot:664–691；pnpm11:9977–9998、213436–213449），以及它们已被删去、`@local/` 现为空目录。§2.6.2：写明 `norm` 的适用范围；路径存在而 `realpathSync.native` 抛错算「解析不出」，不走路径不存在时的退路。不属于本项目的、第 1 小步时已在的链接只记 `readlinkSync` 的原始字符串与目标是否存在，不做 `norm`；O 组按类型与原始目标逐字符比较，之前悬空、现在仍悬空且原始目标相同算没有变化；重建写成 `symlinkSync(raw, <路径>, 'junction')`，并重读核对。本稿在临时目录里核实了 Node 22.20.0 上目标不存在的 junction 可以建立、`readlinkSync` 往返不变、`unlinkSync` 能删（G20）。比评审的建议多两处。一是前后都是链接、原始目标相同时还比较目标是否存在：之前存在、之后不存在判「目标消失」并失败，因为 pnpm 进入链接目标删除内容时留下的正是这个样子（G21）；反过来的「目标出现」只记录。二是重建的边界：原始目标不是绝对路径的（不是 junction）与所在 scope 目录已不在的不重建，判失败，脚本不在 `node_modules` 里建目录。新出现的链接改为按目标路径做 `norm`（目标不存在时走退路），这样指向已删目录的链接也能认出是否指回检出。R2 在桌面形状的 `@local/` 下加 `rehearsal-dangling` → `<run>/missing`（从不创建）；R3、续跑与 R4 要求它仍是链接、原始目标不变、没有「重建」与目标变化的标签、`<run>/missing` 仍不存在，由 `rehearse` 自己核对；R6 的拆链删除照常拆掉它。新增 U17（pnpm 11 遇到悬空的 scope 链接照常完成）；pnpm 8 一半没有演练，glmsandbox 有这类链接时停下交人（§4.2 第 8 项），`plan` 因此列出不属于本项目的链接的名字与是否悬空。§5.4 写明覆盖范围；§5.2、§5.3、§6 各加一行 | G13、G20、U10、U17、§0、§2.4、§2.6.1、§2.6.2 路径的比较、`plan`、记录、第 1 小步、条目核对、§2.6.5 R2–R4、R6、§2.6.6、§4.1 A3、A5、§4.2 第 8 项、§5.1、§5.2、§5.3、§5.4、§6、§8 |
| D02 | NIT | 采纳。每次 pnpm 运行新建 `<名>-pnpm-<毫秒时间戳>.txt`（`rollback` 为 `<名>-pnpm-rollback-<毫秒时间戳>.txt`），`wx` 打开，文件描述符直接交给子进程。记录的第 4 小步（`rollback` 第 3 小步）改为运行列表，每次一项，「第 4 小步没有通过」按最后一项判断；判定、等待时的报告与时限只看这次的文件，以前的文件留着；`apply` 在 stdout 打印文件名。§4.4 与 §5.1 改为「读最后一次运行的输出文件」。R3 的续跑另查运行列表多了一项、文件名不同 | §2.6.2 记录、第 4 小步、「从 S2 开始」、`rollback` 第 3 小步、输出段、§2.6.5 R3、§4.4、§5.1、§5.2、§5.3 |
| D03 | NIT | 采纳。第 3 小步先算目标文本的 SHA-256，连同临时文件名与「写入中」标记写进记录，再写临时文件、改名、释放写锁，最后标为「完成」。「从 S1 开始」接受「写入中」且摘要等于 `hash3` 的记录，先补标「完成」；S0 加「写入中」按「第 3 小步没有完成」改名为 `.stale-*` 后重来，残留的临时文件点名、不删。另写明中断落在持锁期间时，留下的写锁由运行前检查第 3 条拦住 | §2.6.2 第 3 小步、「从 S0 开始」「从 S1 开始」「从 S2 开始」、§5.1 |
| D04 | NIT | 采纳。运行前检查第 6 条改为：记录里的 `<old>` 之下两份清单都能解析，名字分别为 `dsh-glm-hourness`、`dsh-glm-hourness-ui`，都声明了 `dsh.bundle.patch`，指向的 patch 文件都存在。本稿只读核对过主检出今天的两份清单满足这一条。G16 的「声明了 `dsh.bundle`」改为「声明了 `dsh.bundle.patch`」 | G16、§2.6.2 运行前检查第 6 条、§5.1 |
| D05 | NIT | 采纳，并选定运行方式。时限由脚本执行：本次输出文件连续 600 秒没有增长，或这次运行超过 1500 秒，就 `taskkill /PID <DSH 子进程号> /T /F`，等它退出，再确认 DSH 子进程号与 `run.json`、`package.json.lock` 里的进程号都已不在，在运行列表里写「已中断」，打印确认结果，退出码 1，之后按 §4.4。评审给了两种运行方式（前台 1800 秒，或后台轮询记录）。`apply`、`rollback` 选前台：记录里有链接的原始目标，不整份读出；1500 秒的总时限保证它们在 1800 秒之内返回。总时限是评审没有提的：只有 600 秒的静默时限时，一个一直有少量输出的 pnpm 可以超过工具超时。`rehearse` 有十来次 pnpm 运行，必然超过 1800 秒，所以在后台运行，轮询只含判定的 `rehearsal.json`，直到 `finished`。中断之后留下的 `run.json` 与写锁仍交人：DSH 自己能在持有者退出后接管写锁（atomic-write:206）、在进程树结束后删掉 `run.json`（`activeRecordedRun`，ops:225–250），但运行前检查第 3 条有意比它严，删用户目录里的文件也要人同意 | G26、§2.6.2 第 4 小步、`rollback` 第 3 小步、§2.6.5 运行方式、§4.1 A4、§4.2 第 8 项、§4.4「`install` 卡住」与整体回滚第 6 项、§4.5、§5.1、§5.2、§5.3、§6、§8 |

评审之外，修订时自查发现并改正三处：
- 退出码 2 的定义写的是「运行前检查不过，没有写任何文件」，而第 3 小步的取锁超时与逐键比对不过也以 2 退出，那时第 1、2 小步的记录与备份已经写出。现在退出码 2 写成「`package.json`、锁文件与 `node_modules` 都没有动」，并写明后一种情形下一次按「第 3 小步没有完成」重来（§2.6.2 退出码段、§5.1）。
- O 组原来的第 3 条（之前没有、现在有）因 D01 新增的比较改为第 4 条，引用它的两处（I 组的说明、新出现的链接）一并改了；Q 组第 3 条的链接比较指向新的 O 组第 3 条。
- `rollback` 在第 2–4 小步停下之后没有可走的续跑：第 1 小步已恢复两个文件，pnpm 中途停下时旧链接可能已建、也可能没建，起始状态要么判为「无事可做」而跳过核对，要么落进「其余情形」以退出码 2 交人。D05 让「第 3 小步被时限中断后重跑」成为写明的路径，这个缺口因此必须补上。现在 `rollback` 第 1 小步完成时写标记，起始状态加「续跑回滚」一支，先于 S0 判断，从第 2 小步继续（§2.6.2、§4.4 整体回滚第 6 项、§5.1）；演练造不出，由评审核对（§5.4）。

评审第 6 节的未核实项，本稿的处理：三个 `@local` 链接从何时开始悬空已不需要知道，它们已删去；pnpm 11 的 `ci` 能由配置显式给出一项不变（两个 profile 的 `pnpm-workspace.yaml` 没有 `ci` 键，清空还要先判为不兼容，而且第 3b 小步之后 profile 里指回检出的只有指向 `packages/*` 的新链接）；其余各项同 §9.3 末段。
