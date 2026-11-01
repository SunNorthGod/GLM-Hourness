# m8-row-titles 设计：设置页「内置插件」的行名（V-01）

版本：0.1（2026-10-29）。依据 main `4f6c06b`（split 已合入，两个 profile 直接列 `dsh-glm-zcode`、`dsh-hourness`，question-17 B）。
运行时契约来源：`reference/dsh-desktop-0.2.1-rc.3/`。证据写作「包:行」，包名省略 `dsh-` 前缀，指该包的 `lib/index.js`；`inventory-client` 指 `dsh-client-ui-settings-plugin-inventory/lib/client.js`，`profile-boot` 指 `dsh/lib/profile-boot-C14i-8IN.js`。〔实读〕读过源码；〔只读核对〕只读看过 profile 或仓库；〔推断〕未运行。

## 1. 改什么

| 项 | 今天 | 改后 |
| --- | --- | --- |
| 11 个宿主行的 `name` | 路径 `./dist/<模块>.js`，被 F5 锚定成含用户目录的 file URL | 本包的子路径说明符 `<包名>/<行>`（例 `dsh-glm-zcode/glm-llm`），经已有的 `exports["./<行>"]` 解析到同一个 `dist/` 文件 |
| 宿主行的显示信息 | 无 | 每行 `locale/<行>/{en,zh}.json`（`meta.title`、`meta.description`），导出 `./<行>/locale/*.json` → `./locale/<行>/*.json` |
| 2 个客户端行的 `name` | 路径 `./ui/index.js` | 宿主包的精确包名 `dsh-glm-zcode`、`dsh-hourness` |
| 客户端面 | 嵌套客户端包 `packages/*/ui/package.json`（`dsh-glm-zcode-ui`、`dsh-hourness-ui`） | 并入宿主包：宿主包清单声明 `dsh.client`（内容照搬），导出 `.` → `./ui/index.js`、`./client` → `./ui/client.js`；删去两个 `ui/package.json`。文件位置不变（`ui/index.js`、`ui/client.js`） |
| 客户端行的标题 | file URL | 包的 `locale/{en,zh}.json`，与插件页同一份 |
| 行 id、profile | — | 都不改；五条覆盖项照常按 id 匹配 |
| preflight | 行名必须是 `./` 路径；宿主包不得声明 `dsh.client`；每个客户端包恰好一行解析进它的目录 | 行名必须是本包的说明符，宿主行 `<包名>/<行>`、客户端行 `<包名>`；路径形式的行名报错；每行的 locale 导出与文件齐全、文件名是语言 id；宿主包声明 `dsh.client`，`ui/package.json` 不存在，全部 patch 里恰好一行以精确包名命名，是表里的客户端行 |
| 探针 | 无 | 三种组合各取一次 Loader 里本项目每行的显示信息（与设置页同一个调用），核对标题等于 locale 文件 |

## 2. 依据

| # | 事实 | 证据 | 对设计的约束 |
| --- | --- | --- | --- |
| H1 | 设置页的行卡片取 `pluginPackages.metaOf(entry.options.name, entry.parent.tree.ctx.baseUrl)`；标题是 `meta.title`（翻译表）或 `moduleShortName(meta.title ?? moduleName)`，后者只去掉 `cordis:`、`dsh-` 之类前缀 | host-plugin-inventory:127；inventory-client:126、142 | 没有显示信息的行，标题就是行名本身 |
| H2 | `readPluginMeta` 先 `barePackageName`：以 `.`、`/`、`\`、`#` 开头或含 `:` 的名字直接返回空。bundle patch 里以 `./` 写的行名被锚定成 file URL，所以今天每个本项目行的标题都是含用户目录的完整 URL（V-01） | app-boot:1276–1283、2216–2218、3971–3978 | 行名必须是包说明符 |
| H3 | 包说明符：经 Node ESM 解析器（带运行时拦截）解析 `<说明符>/locale/en.json`，再读同目录下每个 `.json`，逐个按 `<说明符>/locale/<文件名>` 解析且必须在同一目录；文件名不是语言 id，整份显示信息变成错误。子路径说明符不读 `package.json`，图标只取 `<说明符>/icon` 导出；精确包名只在导出了 `./package.json` 时才读清单 | app-boot:2127、2139、2168–2186、2188、2216–2246 | 每行一个 locale 目录，只放 `en.json`、`zh.json`；包级 `locale/` 下的子目录不是 `.json`，不影响包的那一份 |
| H4 | 官方先例：dsh-base 的行 `tool-subagent-list-agents` 名为 `@deepseek-ai/dsh-tool-subagent-control/list-agents`，该包导出 `./list-agents/locale/*.json` → `./locale/list-agents/*.json` | `dsh-base/cordis.patch.yml`:378；`dsh-tool-subagent-control/package.json` | 本设计的 locale 布局照它 |
| H5 | 解析的基准是 profile 目录：根 Include 的 `ctx.baseUrl` 是 profile `cordis.yml` 所在目录；profile 启动不传 `bareModuleBaseUrl`，Loader 按这个基准导入裸名。从 profile 目录解析时，拦截路由在 `<profile>/node_modules/<包>` 找到本地候选（junction 或目录），交给 Node 原生解析，读该包的 `exports` | app-boot:133、3400、4125–4134；profile-boot:302；app-boot:1613–1660（`routeScoped`，:1629） | 说明符只能写 profile `dependencies` 里的包；行模块经 junction 解析到与今天相同的真实文件 |
| H6 | client-modules 的 `locatePkgJson`：路径形式的名字按模块位置找最近的清单；精确包名解析后找最近的、`name` 等于该包名的清单；其余裸说明符（子路径）直接返回空，不算任何客户端包的来源。`resolveMeta` 读那份清单的 `dsh.client` 与 `exports["./client"]`。rc.3 里读 `dsh.client` 的只有 client-modules | client-modules:83、720–742、762–766、793–809；全目录检索 `dsh.client` | 宿主行改成子路径说明符之后，宿主包声明 `dsh.client` 也不会让它们成为来源；以精确包名命名的那一行是唯一来源 |
| H7 | 客户端行要显示标题，就得用包说明符；要算客户端来源，就只能是路径或精确包名（H6）；从 profile 目录能解析的包只有 profile 的依赖（H5）。嵌套客户端包不是 profile 的依赖，question-17 B 把依赖定为两个包 | H5、H6 | 不改 profile 的唯一写法：客户端行用宿主包的精确包名，宿主包自己声明 `dsh.client` |
| H8 | DeepSeek 请求的插件包清单：裸名经 `pluginPackages.packageOf` 取包目录，路径名按最近的清单取身份 | `dsh-plugin-package-inventory-deepseek/lib/index.js`:38–48、70–90 | 改后清单里是 `dsh-glm-zcode`、`dsh-hourness` 0.3.0，不再列 `dsh-glm-zcode-ui`、`dsh-hourness-ui` |
| H9 | 桌面版 profile 有五条 `glm-hourness/*` 覆盖项（`glm-prompt`、`memory`、`workflow`、`hourness`、`glm-llm`），都没有 `name` 键；glmsandbox 没有覆盖项 | `node scripts/profile-shape.mjs snapshot`（2026-10-29，只有 id 与键名）〔只读核对〕 | 覆盖项按 id 匹配，行名改了不失配（F2） |
| H10 | 设置表单给没有覆盖项的行新写覆盖项时带 `name: entry.options.name` | config-editor:105–110（split 设计 F18） | 改后写进 profile 的是说明符，不再是含用户目录的模块路径，以后包内挪文件也不失配 |

## 3. 每个包单独装上时

- 每个包的 patch 只写自己的包名：GLM 包 5 行都是 `dsh-glm-zcode` 或 `dsh-glm-zcode/<行>`，编排层包 8 行都是 `dsh-hourness` 或 `dsh-hourness/<行>`，两包互不引用。
- profile 列了某个 bundle，这个包就在它的 `dependencies` 里，`node_modules/<包>` 是 `link:` 的 junction（`dsh plugin add` 与探针生成的 profile）或复制进来的目录；两种都让 H5 的解析成立。只装一个包时另一个包的名字不出现在任何行里。
- 探针的三个 profile 正好是三种组合：`probe-full`（两包）、`probe-glm`、`probe-hourness`；新检查在 `client-modules`、`glm-only`、`hourness-only` 三个场景里各取一次显示信息，按各自列的包核对行数与标题。
- 客户端面：只装 GLM 包时 client-modules 只看到 `dsh-glm-zcode` 一个来源，反之亦然，与今天每包一个客户端包的效果相同。

## 4. 失败预案

| 失败 | 怎样发现 | 恢复 | 追溯 |
| --- | --- | --- | --- |
| 说明符解析不到（包目录缺导出、产物没构建） | preflight 检查 3、5（行名对应的导出与文件）；运行时 Loader 加载失败，启动审计列出未激活的行；探针各场景的 `quiet` 与本项目行检查 | 修导出或重新 build；不行就撤销提交，行名回到路径形式 | 启动审计的行 id 与说明符；探针运行目录的 stderr |
| 某行显示信息出错（locale 文件名不是语言 id、缺 `meta`、导出写错） | preflight 检查 5；设置页卡片显示 `metadataError`（inventory-client 的 `brokenNote`），标题退回说明符本身，不出现路径；探针的显示信息检查 | 修文件，重新 build；只影响显示 | 错误文本带说明符与文件路径 |
| 客户端组合出错（多出一个来源、缺 `./client` 产物） | preflight 检查 7；运行时 client-modules 抛 `multiple active Loader sources` 或缺产物错误；探针 `client-modules` 场景 | 修 patch 或产物；撤销提交 | 错误文本列出来源的行名与基准 |
| 以后出现带 `name` 的本项目覆盖项（设置表单写的旧 file URL） | 今天没有（H9）；出现时 Loader 告警并跳过该覆盖项，行按 bundle 默认配置运行 | 删掉覆盖项的 `name` 键（人批的 profile 改动） | 合入前再跑一次 `profile-shape snapshot` 看键名；探针每次运行前后也比对 |
| 运行中的桌面版在合入之后的下一次 profile 写入时按新行名重组（F17） | — | 合入时先关桌面版，再合入、build、启动（DEVELOPMENT.md §5 第 4 条）；这一条由编排者在合入时执行 | 合入提交与重启时间 |
| 并行的 m3-implement 在 `packages/hourness/cordis.patch.yml` 加路径形式的新行 | rebase 后 preflight 报行名不是说明符、缺 locale | 后合入的一方把新行改成 `dsh-hourness/<行>`，补导出与 `locale/<行>/` | preflight 输出 |
| 桌面版上标题仍不对（L3 看不到的 GUI 差异） | 批次 L4：设置页截图核对 13 行 | 按卡片上的 `metadataError` 修；必要时撤销 | 截图与 DevTools 记录 |

## 5. agent 定的事（人可推翻）

客户端行怎么命名

取决于：两行客户端行显示 file URL 能不能接受。

| 选项 | 怎么做 | 得到 | 代价 |
| --- | --- | --- | --- |
| A | **客户端行保持路径** | 只改 11 个宿主行，客户端包不动 | 两行仍是含用户目录的 file URL，验收第 1 条不满足，要人改验收 |
| B | **profile 加两个依赖** | 嵌套客户端包留着，客户端行写精确的客户端包名 | 改桌面版与 glmsandbox 的 `dependencies`（人批）；每个插件单独装要装两个包，与 question-17 B 的「两个插件」不符 |
| C | **客户端面并入宿主包** | 13 行都有标题；profile 不改；DeepSeek 请求少列两个包名 | 删两个嵌套清单；preflight 检查 7 与文档改写；客户端行的标题与插件页的包标题相同 |

是 → A；否 → C（本设计）。

其余：每行的中英文标题与描述由 agent 起草（`packages/*/locale/<行>/`），人可以改；宿主包的 `.` 导出指向客户端面的宿主半 `ui/index.js`（官方客户端包的做法，`.` 就是宿主半）。

## 6. 依据的学科与标准

- Node.js 包解析：`exports` 子路径与模式（一个 `*`）、ESM 解析经符号链接取真实路径。
- DSH rc.3 运行时契约（DEVELOPMENT.md §4 的来源优先级）：插件显示信息、client-modules 来源判定、Loader 的基准目录。
- 界面信息设计与隐私：设置页给人看的是行的名字与一句用途，不暴露本机用户目录。

## 7. 验证

- L1/L2：`npm run build`、`npm run preflight`、`npm test`（preflight 的新检查有正反用例）。
- L3：`npm run probe`（三种组合下的显示信息检查，加 `client-modules` 场景的组合检查）。
- L4：批次 L4 时在设置页「内置插件」截图核对 13 行；合入前关桌面版。

结果（提交 `0ec0b58`，分支 `row-titles`，基于 `4f6c06b`；main 之后只有 `docs/graph/` 的提交）：build 退出 0；preflight 退出 0（`dsh-glm-zcode 5 rows, dsh-hourness 8 rows; 13 rows composed`）；`npm test` 退出 0，45 个 spec 文件 650 通过 0 失败（`ZCODE_BUNDLE` 指主检出的 `reference/zcode-3.16.3/zcode.cjs`，`zcode_system.json` 临时复制进来，跑完删除）；`npm run probe` 退出 0，118/118，`client-modules (probe-full)` 13 行、`glm-only` 5 行、`hourness-only` 8 行的标题检查都通过，client-modules 组合出 `dsh-glm-zcode`、`dsh-hourness` 各一次。日志在本目录的 `build.log`、`preflight.log`、`test.log`、`probe.log`。

实现中改正的一处：preflight 的语言 id 检查原以为 `notes.json` 这类文件名会让设置页报错；rc.3 的 `LANGUAGE_ID` 接受 2–8 个字母的任何名字，所以只拦带点、下划线等不合规的名字（例 `en.old.json`、`zh_CN.json`），测试按此写。
