# m8-row-titles 代码审查（第 1 轮）

审查对象：`git diff 4f6c06b...HEAD`，分支 `row-titles`，提交 `0ec0b58`。本目录此前没有 `review.json`，这是第一轮，没有上一轮的阻断项可比。

结论：APPROVED，阻断项 0（按 DEVELOPMENT.md §1.1：验收未满足、不可逆损失无防护、失败无发现/恢复/追溯）。

## 证据

- 门禁（读 commit message 与本目录日志，未重跑）：`npm run build` 退出 0，`build.log` 写出 `packages/glm/ui/client.js`、`packages/hourness/ui/client.js`；`npm run preflight` 退出 0，`preflight.log` 为 "dsh-glm-zcode 5 rows, dsh-hourness 8 rows; 13 rows composed; client halves of dsh-glm-zcode, dsh-hourness built"；`npm test` 退出 0，45 个 spec 650 通过 0 失败，check-verbatim 442、gitleaks no leaks、graph:smoke ok（`test.log`）；`npm run probe` 退出 0，118/118（`probe.log`）。
- 验收第 1 条（「内置插件」13 行都显示标题，不出现 file URL 或用户目录）：rc.3 设置页按 `pluginPackages.metaOf(entry.options.name, entry.parent.tree.ctx.baseUrl)` 取显示信息（`dsh-host-plugin-inventory/lib/index.js` 125–126）；`readPluginMeta` 对以 `.`、`/`、`\`、`#` 开头或含 `:` 的名字返回空（`dsh-app-boot/lib/index.js` 1276、2216–2218），卡片标题退回 `moduleShortName(moduleName)`（`dsh-client-ui-settings-plugin-inventory/lib/client.js` 142）。改后 11 个宿主行名为 `<包名>/<行>`，2 个客户端行名为精确包名，均不以路径开头。探针 `client-modules (probe-full)` 13 行、`glm-only` 5 行、`hourness-only` 8 行用设置页同一调用取显示信息，en/zh 标题等于 locale 文件且无 `error`，三项 PASS。显示信息出错时标题退回说明符本身，仍不含路径。13 份 `zh.json` 的标题与描述已逐一读过，描述里只出现 `~/.dsh/glm-hourness` 这种通用写法，没有本机目录。
- 验收第 2 条（每个插件单独装上）：两个 patch 只引用本包名；`probe-glm`、`probe-hourness` 两个单包 profile 的标题检查 PASS，且没有多出的本项目行。
- 验收第 3 条（门禁与探针）：见第一项。桌面版 L4 截图由后续步骤做，不在本轮范围。
- 客户端组合不回归：rc.3 `locatePkgJson`（`dsh-client-modules/lib/index.js` 762–788）对既不是路径、也不是精确包名（`exactPackageSpecifier`，83 行）的行名直接返回空，子路径命名的宿主行不算任何包的来源；`reconcilePackage` 只在同包多个来源时抛错。rc.3 其余包里 `dsh.client` 只出现在注释中。探针 `client-modules` 场景组合出 `dsh-glm-zcode`、`dsh-hourness` 各一次，stderr 0 字节，PASS；preflight 检查 7 拦截同包第二个精确包名行，`tests/preflight.spec.ts` 有反例。
- 覆盖项：`desktop-shape.json` 中五条 `glm-hourness/*` 覆盖项的键只有 `id`、`config*`、`disabled`，没有 `name`，按 id 匹配不受行名影响；两个 profile 都没改。
- 持久化标识：行 id、cordis 插件名（`dsh-glm-hourness/*`）、设置区 id `glm-hourness-ui`、右侧栏页签 id `dsh-glm-hourness-ui/graph` 与 kind `glm-hourness-graph` 都没变，用户已存的侧栏布局不会失配。客户端模块 id 由 `dsh-glm-zcode-ui`、`dsh-hourness-ui` 变为宿主包名，`scripts/build-ui.mjs` 的外包 id 取宿主清单的 `name`，preflight 核对二者一致。

## 客户端行的决定（design.md §5，选 C）

判断：C 成立。

- A 让两行继续显示含用户目录的 file URL，验收第 1 条不满足。
- B 要给桌面版与 glmsandbox 的 `dependencies` 各加两项，属于改用户 profile（AGENTS.md 第 6 条，需人批）；单装一个插件要装两个包，与 question-17 B「profile 直接列两个包」相反。
- C 不改 profile，13 行都有标题。它取代的旧约束「宿主包不得声明 `dsh.client`」来自 2026-10-27 事故，当时所有行都是路径名，都按模块位置算来源；现在宿主行是子路径说明符，按 rc.3 源码不算来源。回归由探针的组合检查与 preflight 检查 7 兜住，剩余风险只在桌面版界面，由 L4 截图覆盖。
- 代价在 design 里写明：客户端行标题与插件页的包标题相同（精确包名只能读包的 `locale/`），卡片副标题仍显示行 id 以作区分。

## 非阻断备注

1. `docs/FACTS.md` §3 的 F9 行（「client-modules 对每个启用的行，按其模块位置找最近的祖先 `package.json`，声明了 `dsh.client`（platform web）的算该包的一个来源……」）没改，字面上仍是每一行都按模块位置算来源；紧随其后的 F11 行已按 `locatePkgJson` 改正。建议按「被取代的条款整条重写」把 F9 改为只写来源计数与报错，判定规则引用 F11。
2. 客户端行的标题与包标题相同（「GLM ZCode 通道」「Hourness 编排层」），在「内置插件」里与宿主行并列时，看标题认不出它是界面行；描述里写了「以及 GLM 按钮与设置页」「项目图与右侧栏面板」。rc.3 下不改包标题就没有别的写法，建议 L4 截图时请人确认能否接受。
3. 合入时机：主检出是桌面版的加载源，合入前先关桌面版，再合入、build、启动（design §4，DEVELOPMENT.md §5 第 4 条），由编排者执行。
4. `npm test` 借用主检出的 `reference/zcode-3.16.3/zcode.cjs`，并临时复制 `zcode_system.json`，跑完删除；记录完整，不影响结论。
5. DeepSeek 官方请求的 `dsh_plugin_packages` 不再列 `dsh-glm-zcode-ui`、`dsh-hourness-ui`（FACTS F23 已改写），是对外可见的变化，已有记录。
