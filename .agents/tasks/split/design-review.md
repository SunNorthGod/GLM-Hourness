# split 设计评审（第 3 轮）

评审对象：`.agents/tasks/split/design.md` 版本 0.3（2026-10-29）
评审依据：main `05f0139`（评审开始时为 `e6fd0f2`，评审期间 m8-ui-audit 与编排者又推了 7 个提交）。`0f9f284..05f0139` 在 `src/`、`scripts/`、`package.json`、`cordis.patch.yml`、`ui/package.json`、`ui/cordis.patch.yml`、`ui/index.js`、`ui/src/channel.js`、`ui/src/client.tsx` 与检查器配置上没有改动，只改了 `docs/`、`ui/src/graph/**` 与 `tests/graph-panel-model.spec.ts`。本地分支 `m1-parity` 与工作树 `.worktrees/m1-parity` 都已不在（`git branch -a`、`git worktree list`），m1-parity 的改动已在 `a9f12e1` 合入。另依据桌面版运行时包 `reference/dsh-desktop-0.2.1-rc.3/`，项目图节点 `split`、`question-10`、`bootstrap`、`hourness`、`orch`、`m8-ui-audit`、`m3`，`.agents/tasks/ui-audit/findings.md`（11:14 版），以及第 2 轮评审 `design-review.md`、`design-review.json`（覆盖前已读）。
轮次说明：步骤提示写的是「现有评审文件为第一轮」，磁盘上的实际是第 2 轮（R15–R27，图上 `3f19665` 有记录）。本轮按第 3 轮处理：逐条复核 R15–R27，并确认 R01–R14 仍然关闭。
方法：只读核对源码、脚本、清单、文档与 rc.3 运行时源码。未运行构建、测试、探针与标定；没有使用桌面版；桌面版、glmsandbox 与 headless 三个 profile 只读取键名、行 id、bundle 名与链接类型，没有读取任何配置值；未读凭证文件。按步骤约束本步不改 `docs/graph/`，评审结论由编排者记到图上。
结论：APPROVED。HIGH 0 条，MEDIUM 0 条，LOW 5 条（R28–R32）。第 2 轮的 R15–R27 全部关闭。

## 1. 总体判断

- 第 2 轮的两条 MEDIUM 已按建议改好：
  - R15：公共库 `src/shared/dialect.ts` 加了静态别名表 `ZCODE_ALIAS_NATIVES` 与 `toNativeTool`，guard、影子兜底、图文件门禁三处都先经它换算；表的 7 项与 GLM 自己的别名定义一致；方言服务缺席时拦截不变，§4.7、§7.7、§8.1 的失败分析已改正，L2 补了无服务用例。
  - R16：第 0–6 步 jscpd 不动；ESLint、knip、`.gitignore` 对根 `dist/`、`ui/client.js` 的排除保留到合入顺序第 7 项；合入顺序第 5 项在主检出上跑三道门禁。第 2 轮建议里「jscpd 的 `**/ui/client.js` 同时覆盖子包产物」的前提不成立（`.jscpd.json`:2 的 `path` 不含 `packages`），设计的更正正确。
- 不改桌面 profile 的目标仍然成立。m1-cleanup 去掉 `llm-pi-ai` 之后，profile 的 patch 有 12 条顶层条目；本项目 5 条覆盖项都没有 `name`，id 在新布局里都有同 id 的行（§3）。
- 跨包导入仍只有 X1–X4 四类七处，都在第 1 步处理；GLM 目录不导入编排层目录，公共库不导入任何包目录；`dist` 的 `.js` 里唯一的运行时裸导入是 `@deepseek-ai/cosmokit`（§5）。
- 各步都能独立变绿（§6）。本轮 5 条 LOW 是文字与流程上的补充，不改变设计。

## 2. 第 2 轮意见复核

| id | 级别 | 状态 | 核对 |
| --- | --- | --- | --- |
| R15 | MEDIUM | Closed | `ZCODE_ALIAS_NATIVES` 的 7 项与 `src/glm-prompt/aliases.ts`:173–240 的 `aliasSpecs`（Write→write、Edit→edit、Glob→glob、Grep→grep、Bash→pwsh）、`read-alias.ts`:40 的 `READ_NATIVE`、`todo-reminder.ts`:39 的 `TODO_NATIVE` 一致。换算位置 `src/guard/index.ts`:167、`graph-files.ts`:116、`shadow.ts`:125 属实；三处都已有 `ServiceLookup`（guard `apply` 的 ctx、`installGraphFileGuard` 的 ctx、`shadowFallback` 的 `services`），能读方言服务。三处记录今天写的就是 `payload.name`（`index.ts` 的违规记录、`graph-files.ts` 的违规记录、`shadow.ts` 的 `calls`），「记录写模型调用时用的名字」不需要新字段。§4.7、§7.7、§8.1 改为服务缺席只影响 `claims` 与用名；无服务用例写进 §4.2.2 与 §7.2；`tests/contracts.spec.ts` 钉住表、`aliasSpecs`、`nativeOf`、`faceName` 四者一致 |
| R16 | MEDIUM | Closed | `.jscpd.json`:2 的 `path` 为 `src`、`tests`、`scripts`、`ui`，:4 的 `ignore` 含 `**/ui/client.js`，第 0–6 步不动。`eslint.config.js`:16、18 的 `'dist/'`、`'ui/client.js'`，`.gitignore`:10 的 `/ui/client.js`，`knip.jsonc`:21 的 `ignore` 都保留到合入顺序第 7 项，第 5、6 步只加子包条目；`.gitignore`:2 的 `dist/` 不带前导斜杠，已覆盖 `packages/*/dist/`。合入顺序第 5 项为三道门禁。worktree 上第 5、6 步删陈旧根产物，探针与标定今天的 `../../dist/...` 导入（`run-probe.mjs`:31–38、`probe-llm.mjs`:28–30、`probe-dispatch.mjs`:36、`run-calibrate.mjs`:26）漏改时会直接报错。`scripts/check-lint.mjs`:71–84 只读 knip JSON 的 `issues`，第 6 步之后 worktree 上 `ignore` 里不再匹配文件的 `ui/client.js` 不会成为发现 |
| R17 | LOW | Closed | 依据、§0、§7.0、§7.3、§10 已按 m1-parity 合入改写；`git diff --name-status 97840e0 0f9f284` 的代码文件清单与 §10 一致。设计写完之后的新变化见 R28 |
| R18 | LOW | Closed | C2 只扫 `.js`。今天产物里 `.d.ts` 的裸导入与 §7.4 第 6 项相符：`dist/shared/dsh-min.d.ts`:1、`lm-min.d.ts`:8、`schemastery.d.ts`:1–3、`glm-llm/zcode.d.ts`:6–7，另有 `glm-llm/index.d.ts`、`glm-prompt/index.d.ts` 里的 `import("@deepseek-ai/cosmokit")` 类型引用；`.js` 只有 `dist/shared/schemastery.js`:2–3。第 2 轮写的 `src/shared/dsh-min.ts`:17 应为 :16，设计的更正属实 |
| R19 | LOW | Closed | 编排层包补了 `type`、`private` 与 `dsh.bundle.patch`；preflight 第 5 项与 §8.2 查四个包的 `type`，`tests/preflight.spec.ts` 有失败夹具 |
| R20 | LOW | Closed | `ToolFace`、`NATIVE_FACE`、`GuardRule`、`evaluate`、`declarationOf` 的签名已给出；`rules.ts`:115、126 改用函数形式，`index.ts`:120 的 `declarationSection` 加 `face`，`graph-files.ts`:82 传 `NATIVE_FACE`；旧接口的规则在类型上可赋给新接口，收到原生名一事写进 ORCHESTRATION.md §6.1 的改动 |
| R21 | LOW | Closed | 判定用 `next()` 返回的 `assembled.tools`（`src/glm-prompt/index.ts`:145），`memorySectionApplies` 在 `rewriteToolFace`（:150）之前调用。「记忆工具被延迟加载」今天造不出来的理由成立：`src/toolsearch/exposure.ts`:46 把三个记忆工具列为常驻 |
| R22 | LOW | Closed | 按步填写的表、表自检四条、`regex` 生成规则都已写。今天 `src/` 的顶层目录为 data、glm-llm、glm-prompt、graph、guard、memory、shared、toolsearch、ui、workflow，嵌套目录只有 `src/glm-llm/auth` 与 `ui/src/graph`，第 1 步的表自检能通过；用几条典型导入（`src/glm-llm/auth/` 下的 `../../graph/`、`ui/src/graph/` 下的 `../../../src/graph/`、同目录的 `../shared/data-home.ts`）代入规则，判定都符合预期 |
| R23 | LOW | Closed | 只去掉文件开头导入块里的单行导入；导入块之后的导入在去掉注释、字面量换成空白的代码文本上判定。另核出的 `src/glm-prompt/zcode-tool-text.ts`:340 `BASH_WORKDIR_LINE` 确含 `from the user's profile.`，按行匹配 `export … from` 会误删 |
| R24 | LOW | Closed | §7.0 列出第 1、2 步碰到的 m8-ui-audit 文字范围；对照 findings.md §7：F-21、F-36、F-41 为不改；F-06 改的是 `src/graph/labels.ts`、`panel-row.ts`，不在第 1、2 步的文件里；rebase 后重钉逐字断言的规则已写。§7.0 与 §14.7 之间新出现的矛盾见 R30 |
| R25 | LOW | Closed | 第 0 步建 `tests/profile-shape.spec.ts` 并加进测试列表；`tests/preflight.spec.ts` 不收这些用例 |
| R26 | LOW | Closed | `parseStatus`（`ui/src/channel.js`:123–128）的说法与约束已改；`src/glm-llm/zcode.ts`:377 是表里唯一含「未登录」的说明，属实；插槽行号 :317、:320 属实；F11 改引 client-modules 的 `resolveMeta`、`locatePkgJson`、`nearestPackage`（:719–809），子路径说明符在 `locatePkgJson` 里返回空属实；U5 与 §14.3 用同一种安装命令；U1 退路用 `glmh-split-` 前缀，守卫只放行登记过的名字 |
| R27 | LOW | Closed | §9 加了 B9 |

R01–R14：第 2 轮已核为关闭。0.3 没有回退其中任何一条，抽查了 R01（第 2 步不改拦截范围，`src/guard/index.ts`:163、201 的两处 `isGlmModel` 留到第 7 步）、R02（`zcode-notice.ts` 进 `MIRROR_FILES`，`scripts/check-verbatim.mjs`:27 今天是三个镜像文件）、R04（结构比对取代 SHA-256）、R05（合入顺序先关桌面版）。

## 3. 桌面 profile 逐项核对（只记键名、行 id、bundle 名与链接类型）

`C:\Users\29596\.dsh\profiles\desktop\`：

- `package.json` 顶层键为 `name`、`private`、`dsh`、`dependencies`；`dsh` 下为 `profile`、`desktopNextPlugins`、`desktopNextScheduleBundle`、`desktopNextOnboarding`。`dsh.profile.bundles` 共 13 项：第 1、2 项为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`，第 3 项 `dsh-glm-hourness`，第 4–12 项为 9 个 experimental bundle，第 13 项 `dsh-glm-hourness-ui`。`dependencies` 只有本项目两项，都以 `link:` 开头；`node_modules` 下这两项都是 junction，分别解析到仓库根与仓库的 `ui/`。
- `cordis.patch.yml` 共 12 条顶层条目（第 2 轮时为 13 条，m1-cleanup 去掉了 `llm-pi-ai`）：
  - 本项目 5 条，都没有 `name`：`glm-hourness/glm-prompt`（`config` 下 `persona`、`tier`、`skills`、`env`，`env` 下 `cwd`、`platform`、`shell`、`osVersion`、`isGitRepository`；另有 `disabled`），`glm-hourness/memory`、`glm-hourness/workflow`、`glm-hourness/hourness`（都只有 `config.home`），`glm-hourness/glm-llm`（只有 `disabled`）。
  - 其余 7 条都带 `name`：`ui-settings-account`、`ui-chat`、`ui-settings`、`agent-default-model`、`permission`、`ui-conversation`、`plugin-market`。
- `desktop-next.cordis.patch.json` 只有 `agents-anywhere-bridge-next`；`desktop-next.runtime.patch.json` 只有 `desktop-next-webserver`、`connection`。
- DSH home 层 `~/.dsh/cordis.patch.yml` 不存在。
- glmsandbox：bundles 为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`、`dsh-glm-hourness`、`dsh-glm-hourness-ui`；patch 没有条目；两项 junction 解析到仓库根与 `ui/`。
- `~/.dsh/profiles/headless`：bundles 只有 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-headless`，没有本项目的包，拆包不影响它。设计没有提到这个 profile，不影响结论。

新布局下逐项：

| 项 | 解析 | 依据 |
| --- | --- | --- |
| bundle `dsh-glm-hourness` | 仓库根 `package.json`，名字不变；`dsh.bundle.patch` 为两个子包 patch 的列表，两个文件都在仓库根之内（C1） | F4（app-boot:517–531，第 2 轮已核） |
| bundle `dsh-glm-hourness-ui` | `ui/package.json`，名字不变；patch 内容 `[]`，贡献 0 行；不声明 `dsh.client` | `parsePatchList` 接受空数组（第 2 轮已核） |
| `glm-hourness/glm-prompt` | `packages/glm/cordis.patch.yml` 插入的同 id 行；覆盖项没有 `name`，不比对模块路径；`config` 整体替换，`Config` schema 不变 | F2、F3（app-boot:61–110） |
| `glm-hourness/memory`、`glm-hourness/workflow` | `packages/hourness/cordis.patch.yml` 插入的同 id 行 | 同上 |
| `glm-hourness/hourness` | 同上；模块从 `dist/ui/index.js` 变为 `packages/hourness/dist/report/index.js` | 同上 |
| `glm-hourness/glm-llm` | `packages/glm/cordis.patch.yml`；只覆盖 `disabled` | 同上 |
| 其余 7 条 | 指向 DSH 自己的行，与本项目无关 | — |
| `glm-hourness/ui`、`glm-hourness/glm-ui` | profile 里没有覆盖项 | — |

结论：桌面 profile 不需要改，glmsandbox 也不需要改。

## 4. 本轮发现

### R28 LOW 依据与并行状态在设计写完后又变了（结论不变）

位置：文首「依据」；§0 末段；§3.4；§4.2.1 N 类的说明；§6.1；§7.0；§10。

证据：
- main 现为 `05f0139`。`0f9f284..05f0139` 只改 `docs/`、`ui/src/graph/**`（m8-ui-audit 修复的 `e6fd0f2`、`5454d2e`、`7761f92`、`6020b6d`、`0ff426f`、`9ddf0a2`）与 `tests/graph-panel-model.spec.ts`；§2、§3、§5、§7.4 依据的源码、脚本、清单与配置没有变。
- m1-11 与 m1-cleanup 已完成（`28d5d38`、`8f4727c`、`77f85aa`、`97ecba1`）。桌面 profile 的 patch 现为 12 条，`llm-pi-ai` 已去掉：§3.4「其余八条覆盖项」现为七条；§0、§4.2.1、§10 里「将由 m1-cleanup 去掉」「运行 m1-l4-and-cleanup 占用桌面时段」已是过去的事。
- m8-ui-audit 的修复步直接在主检出上改文件并提交到 main。评审期间主检出上有 `ui/src/graph/*.tsx`、`model.ts`、`docs/DESIGN.md`、`docs/HANDOFF.md` 的未提交改动，之后以 `7761f92`、`6020b6d` 等提交落盘。§10「main 工作区：除 `.kiro/` 外没有未提交改动」不再成立（流程上的后果见 R29）。
- `headlineGoal` 现在在 `ui/src/graph/model.ts`:240，§6.1 写的是 :220。
- findings.md（11:14 版）的 V-01 已加 `Resolution: 暂缓，依赖 split 的包布局（split 设计 v0.3 §14），待人定`，图上 `97ecba1` 的提交说明同样写「V-01 held for split」；§10 与 §14.7 仍把 V-01 写成排在 m8-ui-audit 第 11 个提交里。
- `05f0139` 派出了 m3-design（`wf_071ccd31136e09c0`）：M3 的设计按「编排层包 / 公共库」划边界，实现等 split 合入后在编排层包里做（`docs/graph/nodes/m3.json` 的批注）。§10 没有这一条。

建议：依据改为 `05f0139`，或写明「`src/`、`scripts/`、清单与配置同 `0f9f284`」；§3.4 改为七条其余覆盖项并去掉 `llm-pi-ai` 的说明；§0、§4.2.1、§10 的 m1-cleanup 改为已完成；§10 的 m8-ui-audit 一条改为「修复第一轮进行中，提交直接落在 main 上；V-01 已暂缓，等 §14.7 人定」；§6.1 的行号改为 :240，并写明 `ui/src/graph/**` 的行号在第 6、8 步开工时按 main 重核；§10 加 m3-design 一条：split 的目录表、公共库规则与 §9 的结构是它的前提，以后 split 设计改这些时通知它。

### R29 LOW 合入顺序没有要求主检出干净

位置：§7.1 合入顺序第 1、4、5 项；§7.6「准备」与第二轮；§7.7。

问题：
- 合入顺序排除了桌面版与标定的并发使用，没有排除别的运行在主检出上的未提交改动。评审期间就观察到 m8-ui-audit 的修复步直接在主检出上编辑 `ui/src/graph/*` 与文档。
- 第 5 项在主检出上跑 `npm run build`：`tsc` 与 `scripts/build-ui.mjs` 会把工作区里未提交的 `src/**`、`ui/src/**` 改动一起编进 `packages/*/dist/` 与 `packages/*/ui/client.js`，第 6 项启动的 L4 第一轮验证的就不是合入的提交。快进合入只在未提交改动碰到同一批文件时才拒绝，其余情况照常完成；`npm test` 里的 gitleaks 也会扫这些改动（DEVELOPMENT.md §10）。

建议：合入顺序第 1 项加「申请时段时向编排者确认没有别的运行在主检出上工作」；第 4 项之前与第 5 项构建之前各查一次 `git -C <主检出> status --porcelain`，只允许 `?? .kiro/`，否则停下，等对方提交或交人；L4 第二轮按同样的顺序做。§7.7 风险表加一行。

### R30 LOW §7.0 的开始条件把 V-01 算进「m8-ui-audit 的界面改动」，与 §14.7 建议的选项 A 互相等待

位置：§7.0 第 2 条（重叠清单写「根 `cordis.patch.yml` 与 `ui/cordis.patch.yml`（F-35、V-01；第 5、6 步）」）；§7.1 第 3 步的开始条件「m8-ui-audit 的界面改动合入」、第 8 步的「m8-ui-audit 合入」；§14.7 选项 A。

问题：按 §7.0 的字面，第 3–6 步要等包括 V-01 在内的 m8-ui-audit 改动合入；按 §14.7 选项 A，V-01 要等 split 合入之后再做。两处一起读，两个任务互相等待。§7.0 第 3 条（第 5 步开工前看 main 上的行名形式）说明作者的意思是第 5 步可以在 V-01 之前做，但开始条件本身没有写出来；编排者照 §7.0 的规则批注到 `split` 节点上时，这个矛盾会原样带过去。

建议：开始条件改为「m8-ui-audit 修复计划（findings.md §7）里除 V-01 外的提交都已在 main 上；V-01 按 §14.7 处理」，§7.0 的重叠清单把 V-01 单列出来并指向 §14.7。人选 §14.7 的 B 时，再把 V-01 加回第 5 步的开始条件。

### R31 LOW 客户端行在组合里的位置提前了，设计没有写出来

位置：§3.2 根 `package.json` 一行（「组合出的宿主行顺序与今天相同，各行激活与监听器注册的先后不变」）；§7.6 第一轮。

证据：
- 桌面 profile 的 bundles 里 `dsh-glm-hourness` 是第 3 项，`dsh-glm-hourness-ui` 是第 13 项，中间是 9 个 experimental bundle（§3）。F1：各 bundle 的 patch 依次拼接后套用到空表上。今天 `glm-hourness/ui` 由第 13 项插入，排在 experimental bundle 的行之后；拆包后它由伞包引用的 `packages/hourness/cordis.patch.yml` 插入，位置提前到第 3 项，`glm-hourness/glm-ui` 同样。
- client-modules 按 Loader 条目的次序登记客户端包（client-modules:558 把 `ctx.loader.entries()` 依次加进 `dirty`，:854 起的 `processOne` 依次写 `table`），`compose()` 再对 `table` 的插入次序做 `orderByModuleGraph`（:668）。所以拆包后项目图面板的客户端半会排在 experimental bundle 的客户端半（例如插件市场）之前应用。插槽带显式 `order`（`ui/src/channel.js`:317、320），不受影响；按注册次序排列的界面（例如右侧栏的页面类型列表）可能变，本轮没有核实。
- 宿主行的相对次序确实不变，§3.2 的说法对宿主行成立。

建议：§3.2 补一句：客户端行随伞包提前到第 3 项的位置，宿主行次序不变；§7.6 第一轮第 6 项加一句，核对右侧栏「开始」页里「项目图」入口的位置与之前打开的标签照常；或者写明为什么不影响。

### R32 LOW 「行 id 恰好是表里的 13 个」从目录表推出，挡不住表与 patch 一起改名

位置：§7.4 preflight 第 4 项；§8.3「行 id 恰好是表里的 13 个」一行；§7.7「覆盖项因行 id 变化而失配」一行；§7.1 第 5、6 步与 §9 B1 的「固定行 id」。

问题：§8.3 写这条不变量的理由是「profile 覆盖与面板布局按它找行；改名时其余门禁都会静默通过」。如果 preflight 比对的是 `scripts/packages.mjs` 里登记的行，一次同时改了表与 patch 的改名照样通过，profile 覆盖项按 F2 失配，只有一条 Loader 告警。§7.1 第 5、6 步与 §9 B1 写的「固定行 id」读起来像一份独立的字面清单，§7.4 与 §8.3 写的却是「表里的」，两种读法实现出来不一样。

建议：写明固定行 id 是独立于目录表的字面清单。例如在 `tests/contracts.spec.ts` 里断言：`PACKAGES` 的全部行 id 加客户端行 id 等于一个写死的数组（第 5 步 12 项，第 6 步 13 项）；preflight 的表自检与组合检查照旧从表读。以后加行（§9 B1 的 `glm-hourness/bootstrap`）要同时改这个数组，改名在评审里一眼可见。

## 5. 跨包导入核对（main `05f0139`）

扫描 `src/` 与 `ui/src/` 的全部静态与动态导入：

| 方向 | 位置 | 设计处置 |
| --- | --- | --- |
| 编排层 → GLM | `src/graph/reminder.ts`:22 → `src/glm-prompt/step-notice.ts` | X1，第 1 步 |
| 编排层 → GLM | `src/graph/reminder.ts`:24 → `src/toolsearch/zcode-text.ts`（`wrapSystemReminder`） | X2，第 1 步 |
| 编排层 → GLM | `src/graph/live.ts`:20 → `src/toolsearch/zcode-text.ts`（`DEFERRED_TOOL_CALL_NAME`） | X3，第 1 步 |
| 编排层 → GLM | `src/guard/index.ts`:42、`rules.ts`:8、`shadow.ts`:28、`graph-files.ts`:16 → `src/glm-prompt/json.ts` | X4，第 1 步 |
| 编排层 → 公共库里的 GLM 内容 | `src/ui/panel.ts`:15 → `src/shared/credits.ts` | X5，第 3 步 |
| 公共库里的编排层内容 | `src/guard/index.ts`、`shadow.ts`、`graph-files.ts`、`src/graph/index.ts` → `src/shared/graph-service.ts` | 第 1 步迁到 `src/graph/service.ts`，同包 |
| GLM → 编排层 | 无，包括 m1-parity 新增的 `auth/project-token.ts`、`device-mid.ts`、`token-budget.ts`、`zcode-wire.ts` | — |
| GLM → 编排层服务 | 无：GLM 目录只读 DSH 的 `agents`、`attachments` 服务与公共库的 `credentialHome` | — |
| 公共库 → 包目录 | 无：`src/shared/*.ts` 只导入同目录文件、node 内置模块与 `@deepseek-ai/*`、`@standard-schema/spec` | — |
| 客户端 | `ui/src/channel.js` 只导入 `react`；`ui/src/graph/**`、`ui/src/dsh.ts` 只导入 `src/graph/*`（同包）、`react` 与 `@deepseek-ai/dsh-client-ui-primitives`；`ui/src/client.tsx` 同时导入两半 | `client.tsx` 第 6 步删除 |
| 运行时裸导入（`.js` 产物） | 只有 `dist/shared/schemastery.js`:2–3 的 `@deepseek-ai/cosmokit` | C2 |

`src/glm-prompt/zcode-tool-text.ts`、`aliases.ts`、`index.ts` 等 GLM 文件对 `./json.ts` 的导入在第 1 步随 `json.ts` 迁入公共库一起改。`tests/graph-tools.spec.ts`:13 从 `src/toolsearch/zcode-text.ts` 取 `DEFERRED_TOOL_CALL_NAME`，测试不受边界规则约束，按 §7.2「导入路径随步机械修改」处理。没有发现计划留在原处、被边界规则禁止的导入。

## 6. 各步能否独立变绿

| 步 | 判断 | 相关发现 |
| --- | --- | --- |
| 0 | 可以；依赖 U1、U2，退路已定；生成的 profile 名满足 `resolveProfileDir` 的限制（app-boot:546–550） | — |
| 1 | 可以；X1–X4 与 `json.ts` 迁移和边界规则在同一步，规则上线时没有遗留违规；表自检在今天的目录结构上成立；要搬或改名的文件在 `eslint-suppressions.json`、`knip-baseline.json` 里都没有条目 | — |
| 2 | 可以；拦截不依赖方言服务 | — |
| 3 | 可以；`src/shared/credits.ts` 的使用方只有 `src/ui/panel.ts`、`src/glm-prompt/peak-reminder.ts`:20、两个脚本与 `tests/credits.spec.ts`，迁移后 `peak-reminder.ts` 的导入仍在 GLM 包内 | — |
| 4 | 可以 | — |
| 5 | 可以；依赖 U7，有新发现即停；`scripts/graph/cli.ts`、`render.ts`、`smoke.ts` 从 `src/` 导入，删根 `dist/` 不影响图引擎命令与 `npm test` 末尾的 `scripts/graph/smoke.ts`；探针里读根 `package.json` 第 2 行的检查（`run-probe.mjs`:155、657、670）在伞包保留第 2 行 `"name": "dsh-glm-hourness",` 时照常通过；仓库根没有 `pnpm-workspace.yaml`，子包清单不会被 pnpm 或 knip 当成工作区 | R32 |
| 6 | 可以 | R31 |
| 7、8 | 依赖人定 | R30 |
| 合入 | 顺序成立；缺主检出干净的前提 | R29 |
| L4 | 校验方法成立 | R31 |

## 7. 待人定事项清单的核对

文首 §0.1 与文末 §14 列出：两个目标的文字、验收、非目标与 `bottom`、`q-old-folder`、`m6` 的去处（§14.1）；guard 在方言没有接管的路由上的行为与放开的判据（§14.2）；`split` 验收的改写（§14.3）；包名，含发给 DeepSeek 的 `dsh_plugin_packages` 一项后果（§14.4）；桌面版 profile（§14.5）；条件性事项（§14.6）；V-01 与第 5 步的先后（§14.7）。每项都有选项、后果与建议。正文按包名的建议写并写明了改名成本；第 0–6 步与探针期望对 guard 只写「第 7 步之前」与「按方案」，没有默认某个方案；目标文字只在第 8 步落地。§7.0 的开始条件对 V-01 的写法与 §14.7 选项 A 相矛盾，已作为 R30 列出，属于文字修正。本轮发现都可由 agent 处理，没有新增要人定的事项。

## 8. 已核实的假设

证据均为只读源码或文件。

- 桌面 profile、glmsandbox、headless 三个 profile 的结构见 §3；DSH home 层 patch 不存在（F16）。
- F22：`readPluginMeta`（app-boot:2216–2218）对非包说明符返回空；`barePackageName`（:1276–1277）对以 `.` 开头或含 `:` 的说明符返回空；`anchorInsertedPluginNames`（:3971–3978）把路径形式的行名转成 file URL；`mountRootInclude`（:4125–4136）对裸说明符经 `bareModuleBaseUrl` 解析；`dsh-host-plugin-inventory/lib/index.js`:127、147 按行名 `metaOf`。
- F23：`plugin-package-inventory-deepseek` 在 dsh-base 默认组合里（`dsh-base/cordis.patch.yml`:85–86）；路径形式的行按 `nearestManifest` 取最近的 `package.json`，`identityFromManifest` 只要求有 `name`，不过滤 `private`；只收启用且已激活的条目（`activeEntries`）。拆包后发给 DeepSeek 的包名属实。
- F11 与嵌套客户端包：`locatePkgJson` 对路径形式的行名经 Loader 解析后调 `nearestPackage`，取最近一个有 `name` 的 `package.json`；子路径说明符返回空；`resolveMeta` 以清单目录加 `./client` 导出为产物路径，缺导出时抛错；宿主行最近的清单没有 `dsh.client`，返回 null，不算客户端来源（client-modules:719–809）。
- 静态别名表与 GLM 别名定义一致（见 §2 R15 一行）；`exposure.ts`:41 的注释说明 Bash 只垫在 pwsh 上，静态表的 `Bash → pwsh` 与之相符。
- deviceMid 回写只在通道的请求路径上、凭证存在之后发生（`src/glm-llm/zcode.ts`:376–394）；`/glm-status` 走 `adapter.status()`（:348–363），端点路由的 `X-Device-Mid` 只读（:197、`device-mid.ts` 的 `readRoutingDeviceMid`）；探针没有覆盖项启用 `glm-hourness/glm-llm`，标定启用（`run-calibrate.mjs`:100–101）。§7.3 的结论成立。
- 设计引用的行号在 `05f0139` 上成立：`src/guard/index.ts`:42、62、107、120、137、162–167、185、199–205；`src/guard/rules.ts`:8、28–34、61、90–95、115、126；`src/guard/shadow.ts`:28、74–80、125；`src/guard/graph-files.ts`:16、34、82、116；`src/glm-prompt/index.ts`:88、133–138、144–153、168–173、180、184–188；`src/toolsearch/zcode-text.ts`:19、160–167；`src/toolsearch/exposure.ts`:45–49；`src/toolsearch/index.ts`:168–175；`src/graph/live.ts`:20、100；`src/graph/reminder.ts`:22、24、223；`src/glm-prompt/step-notice.ts`:27；`src/shared/health.ts`:20、25；`src/shared/dsh-min.ts`:16；`src/ui/index.ts`:62、65；`src/ui/panel.ts`:15、19；`src/glm-llm/zcode.ts`:377、394；`src/glm-llm/device-mid.ts`:24、35；`src/glm-prompt/zcode-tool-text.ts`:25、340；`src/memory/index.ts`:41–48；`src/graph/format.ts`:345；`src/graph/engine.ts`:438；`src/graph/schema.ts`:39；`ui/src/channel.js`:123–128、310、316–321；`ui/src/graph/tab.tsx`:15–16。例外是 `ui/src/graph/model.ts` 的 `headlineGoal`，见 R28。
- 文档引用：CHARTER.md §6 含「不替用户在模型、套餐、渠道上做主」（:61），§7 为工程美学，§9 为知识与文件组织（含「人设与个人习惯……不进插件」），§10 为文档标准，§11 为文档地图，§6.1 关于 `hourness` 节点旧编号的说法属实；DESIGN.md §2.3 有「仓库不拆分〔定案〕」（:57），§3 第 3 条要求判定函数只有一处；ORCHESTRATION.md §6.2 的定案原文与设计的引述一致。
- `package.json` 的测试列表共 39 个 spec 与 `scripts/graph/smoke.ts`，§2.8 的三段归类覆盖全部。
- `tests/tsconfig.json` 继承根配置并自设 `noEmit` 与 `rootDir: ".."`，根配置改 `noEmit`、去掉 `outDir` 不影响它。
- 第 2 轮已核、本轮未见变化的事实：F1–F10、F12–F21（app-boot、client-modules、dsh-hmr、config-editor、plugin-manager、ESLint、knip 的对应源码）。

## 9. 未核实或有误的假设

过时：依据、§3.4 的覆盖项条数、m1-cleanup 与 m8-ui-audit 的状态、§10 的工作区状态、§6.1 的行号，见 R28。

设计没有写到、本评审推出的问题：合入时主检出可能有别的运行的未提交改动（R29）；§7.0 与 §14.7 选项 A 的互相等待（R30）；客户端行在组合里提前，对按注册次序排列的界面可能有影响，本轮未核实实际影响（R31）；固定行 id 的来源有两种读法（R32）。

未核实，设计已列出并给了退路，不另计发现：U1、U2、U3、U4、U7、U8、U9；F22 里「profile 只映射它 `dependencies` 里的包」标为推断。U5 只在人选 §14.3 选项 B 时才需要。

本评审未复跑：F21（TypeScript 对非 composite 引用报 TS6306，设计称已用临时配置实测）。
