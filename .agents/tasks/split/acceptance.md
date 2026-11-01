L4 RESULT: PASS（第一轮 PASS，第二轮 PASS）

# split 验收证据：两个插件布局上的桌面版批次 L4

日期 2026-10-29（UTC+8）。项目图任务 `split`。检查单：`design.md` §7.6，按 `design-addendum-q17b.md` §4.3、§4.6 改写，第一轮第 4 项的 guard 期望按 `guard-g3-design.md` §10；验收条文按 `docs/graph/nodes/split.json` 的 `acceptance`（question-15 A，按 question-17 B 与 question-14 G3 写，编排者已在 `4c7f79b` 应用 `graph-step8.json`）。

本文件不含任何凭证、PAT、key、secret、签名、设备 ID 的值；`/glm-status` 与 GLM 按钮对话框里的 Key 预览与账号 id 在记录中替换为占位符，含这两项的界面没有截图。

## 1. 代码与门禁

| 时点 | main | 代码内容 |
| --- | --- | --- |
| 合入（上一步） | `de14525` | split 第 0–8 步，已推送 |
| 第一轮 | `ba3bdaa`、`bfe9f26`、`5979aff`（编排者的图提交） | 与 `de14525` 相比只改 `docs/graph/`（`git diff --name-only de14525 5979aff` 全部在 `docs/graph/` 下） |
| 第二轮 | `e1a82e2`（已推送，`5979aff..e1a82e2`） | 在 `5979aff` 上加本步的两个提交：`3a75472` 清理提交、`e1a82e2` 启用 `glm-ui` |

门禁（主检出，桌面版关闭时运行，日志在本目录）：

| 提交 | `npm run build` | `npm run preflight` | `npm test` |
| --- | --- | --- | --- |
| `3a75472`（`r2-cleanup-*.log`） | 0 | 0：2 个包、13 行组合、两个客户端半已构建 | 0：640 通过、0 失败；eslint 250 条压制、knip 21、jscpd 2 处 16 行、gitleaks 无泄露、graph:smoke ok |
| `e1a82e2`（`r2-glmui-*.log`） | 0 | 0，同上 | 0，同上 |

检查器计数与合入时（`merge-main-test.log`）相同，基线没有增长。探针：合入前在 worktree（`de14525`）上 115/115（`.worktrees/split/.llm/probe-runs/2026-10-29T12-38-52-227Z`，日志 `merge-wt-probe.log`）；本步没有再跑探针（第二轮的两个提交只改忽略项、文档与 `glm-ui` 的默认开关，探针的 `client-modules` 场景本来就经覆盖层启用 `glm-ui`）。

## 2. 第一轮

启动：2026-10-29 20:48:46 以 `.agents/tasks/split/restart.ps1` 启动（`m1-l4/restart.ps1` 的逐字节拷贝，SHA-256 相同，`--remote-debugging-port=9333`）。profile 已在合入步切换为两个插件。

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 1 启动：没有本项目的新错误；stderr 没有 `skipping profile bundle`；插件页列出两个包 | PASS | `%APPDATA%\@deepseek-ai\dsh-desktop\logs` 没有新 crash log（最新仍是 `crash-2026-10-29T05-43-05-346Z-web-boot.log`）。宿主 stderr（`r1-dsh-err.txt`）只有 `DevTools listening on ws://127.0.0.1:9333/…`；stdout 是更新检查、inspector 地址、web 地址与 `[llm-deepseek-account] model listing … loaded 2 model(s)`，没有本项目的输出。页面控制台（`r1-cdp-logs-boot.txt`、`r1-cdp-logs-after-model.txt`、`r1-cdp-logs-end.txt`）只有三类已知条目：inspector 的 `ws://127.0.0.1:9230/ingest` 连接失败、`dsh-app://app/plugins/events` 的 `net::ERR_FAILED`、旧会话的 `changes.summary` 404，与 m1-l4 记录的相同；合并的客户端地址里本项目只有 `dsh-hourness-ui/client.js`，没有 `dsh-glm-hourness-ui`。插件页「已安装插件」只有两项，都启用：「GLM ZCode 通道」（Z 形图标）与「Hourness 编排层」（沙漏图标），描述是附录 §2.2 的中文文字，没有告警（`shots/r1-03-plugins-ours.png`） |
| 2 `/glm-status` 与 `/hourness-status` | PASS | GLM 会话 `session-b8147f0b-426b-42d1-9fa4-bb71a53cfa35`（seq 51、53）：两条命令输出同一张表，11 行分属 `dsh-glm-zcode`（glm-llm 生效「上游已应答（套餐 coding-plan）」、glm-login 生效、glm-prompt 生效「GLM 路由 glm-zcode/glm-5.3-flash：ZCode 提示词与工具面，工具检索 local」、glm-compact 已加载未触发）与 `dsh-hourness`（data、guard、memory、workflow、graph、graph-panel 生效，hourness 已加载未触发）；`/glm-status` 首行为「glm-zcode：已登录（套餐 coding-plan，Key <前缀>，账号 <账号>）」 |
| 3 GLM-5.3-Flash 新会话 | PASS | 经模型菜单选「GLM（ZCode 原生通道）」下的 GLM-5.3-Flash（`agent-default-model` 随之写为 `glm-zcode` / `glm-5.3-flash` / `high`）。系统提示词以 `You are ZCode, an interactive coding agent` 开头；`request/header` 路由 `glm-zcode/glm-5.3-flash`，30 个工具：`Bash`、`DeferredToolCall`、`Edit`、`Glob`、`Grep`、`LocalToolSearch`、`Read`、`Write` 与 13 个 `graph_*`、3 个 `memory_*` 等；首个请求带 `glm-tool-search` 公告。`graph_show m0` 返回「M0 文档沉淀」done，`graph_focus split` 成功，下一步的请求带 `glm-graph-projection` 的焦点投影。`Bash` 执行 `Set-Content -Path .agents/tasks/split/l4-scratch/glm-shell.txt -Value l4` 被拒，纠偏为「Right path: Read the target with Read, then apply the change with Write or Edit.」，文件没有写出；违规流水新增一条 `file-tools-only`，`tool: Bash`，`scope: dialect`，`route` 为 `glm-zcode/glm-5.3-flash`（13:03:00.291Z）。系统提示词最后一节是 `# Workspace rules`，用 `Write`/`Edit`。`/hourness`（seq 57）的面板有积分：「合计：积分 104.41 · 高峰 17% · 缓存命中 80%」，晨报例外「违规 file-tools-only × 1」。用量流水：本会话 4 条主步、2 条标题，全部 `glm-zcode/glm-5.3-flash` |
| 4 DeepSeek 新会话（G3） | PASS | 经模型菜单选「DeepSeek 账号」下的 DeepSeek-V4.1-Flash，会话 `session-b336a0f5-c9f9-4069-8d06-70f52b437a81`。系统提示词以 `You are an AI agent powered by DeepSeek Harness` 开头；61 个原生工具，含 13 个 `graph_*`；`graph_show m0` 可用，`graph_focus split` 后下一步带 `glm-graph-projection` 投影。`pwsh` 执行 `Set-Content -Path .agents/tasks/split/l4-scratch/ds-shell.txt -Value l4` 被拒，纠偏为「Right path: Read the target with read, then apply the change with write or edit.」，文件没有写出；违规流水新增一条 `file-tools-only`，`tool: pwsh`，`scope: other`，`route` 为 `deepseek-account/deepseek-flash`（13:10:46.379Z）。系统提示词唯一也是最后一个 `#` 标题是 `# Workspace rules`，用 `write`/`edit`。`/hourness-status`（seq 56）：guard「生效：门禁生效（file-tools-only，圈禁根 …）」，glm-prompt「未生效：非 GLM 路由 deepseek-account/deepseek-flash，保持 DSH 原文与原生工具」 |
| 5 换模型触发的重载 | PASS | 两次经模型菜单换模型（20:57:34、21:09:09），`cordis.patch.yml` 的修改时间随之更新；之后 stdout 多一次 `[llm-deepseek-account] model listing … loaded`（重载），stderr 不变；控制台只有第 1 项的三类已知条目，没有本项目的告警 |
| 6 面板 | PASS | 右侧栏「项目图」由 `dsh-hourness-ui` 提供（合并客户端地址里的 `dsh-hourness-ui/client.js`）。重启前打开的面板标签在旧会话里照常恢复（`shots/r1-01-after-restart.png`）。「开始」页列出 6 个入口，「项目图」是第 4 个（工作区文件、新建终端、浏览器之后，`shots/r1-18-sidebar-start.png`）；合入步的截图 `before-switch.png` 截的是已打开的面板，不是「开始」页，所以位置没有前后对比（附录 §4.6 规定不判失败）。四个视图都读到本项目的图：需要你、agent 定的（「最近拍板的 · 20」）、正在做（现场与 12 个进行中）、图（`shots/r1-19`–`r1-22`）；头部列出两个根目标（第 8 步的 headlineGoals）。在 `m0` 的详情里批注一条（13:21:17.802Z），节点文件 `docs/graph/nodes/m0.json` 只多了一条 `actor: human`、`op: comment` 的历史，会话里 `/graph-apply` 返回「已批注「M0 文档沉淀」」；1.3 秒后用 `git checkout -- docs/graph/nodes/m0.json` 还原，`git status -- docs/graph` 为空，期间编排者的提交 `bfe9f26`（21:21:10）没有包含 `m0.json`。`split` 上的那条说明批注（CHARTER.md §7.1 条款 11）按本任务的约束不由本步写图，交给编排者（§7） |
| 7 GLM 按钮与设置页不在 | PASS | 输入框下状态栏没有 GLM 按钮（`shots/r1-09-glm-turn1.png`，合入前的 `before-switch.png` 状态栏有「GLM」）；设置页导航只有账号与余额、通用设置、模型、内置插件、Agent 预设 |
| 8 结构比对 | PASS | `node scripts/profile-shape.mjs compare desktop .llm/l4-split/desktop-shape-switched.json`：no differences，退出码 0；glmsandbox 同样 no differences。对切换前的快照（`desktop-shape.json`、`glmsandbox-shape.json`）各 8 处差异，全是 bundles 与 dependencies 里两个旧名删去、两个新名加入 |

## 3. 第二轮的关闭窗口

1. 21:26:47 以 `desktop-close.ps1` 关闭桌面版，核对没有 `DeepSeek Harness` 进程、9333 不再监听；主检出 `status --porcelain` 只有 `?? .kiro/`，`main` 等于 `origin/main`（`5979aff`）。
2. 清理提交 `3a75472`：去掉 `eslint.config.js` 的 `'dist/'` 与 `'ui/client.js'`、`.gitignore` 的 `/ui/client.js`、`knip.js` 的 `ui/client.js`、`.jscpd.json` 的 `**/ui/client.js`；HANDOFF.md §1 记切换的时间、两个 profile 的新名单与备份文件名，删去目录表里的根 `dist/`；DEVELOPMENT.md §3 改为现在时，§10 不再列根 `dist/`。门禁见 §1。
3. 启用提交 `e1a82e2`：去掉 `packages/glm/cordis.patch.yml` 里 `glm-hourness/glm-ui` 的 `disabled: true`；README.md、DESIGN.md §2 行表、HANDOFF.md §1 改为默认启用。门禁见 §1。
4. 两个提交都用 `git commit -- <路径>` 只提交自己的文件（编排者在同一个检出上并行提交 `docs/graph/`），推送 `5979aff..e1a82e2`，没有强推。

## 4. 第二轮

启动：21:38:01 以同一个 `restart.ps1` 启动。

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 启动没有新错误 | PASS | 没有新 crash log；stderr（`dsh-err.txt`）只有 DevTools 一行；stdout 没有本项目的输出；控制台（`r2-cdp-logs-boot.txt`、`r2-cdp-logs-end.txt`）只有 inspector ingest 的连接失败 |
| 没有客户端组合错误 | PASS | 合并客户端地址里本项目有 `dsh-glm-zcode-ui/client.js` 与 `dsh-hourness-ui/client.js` 各一次；控制台没有 `did not activate`、`import failed`、`resolves from multiple` |
| GLM 按钮出现，经它调 `/glm-status` 正常 | PASS | 状态栏出现「GLM」按钮（`shots/r2-01-after-restart.png`）；点开是「GLM 通道」对话框：已登录、套餐 coding-plan、模型 GLM-5.3 · GLM-5.3-Flash、凭证本机加密存储，以及本会话 11 行的健康；会话 `session-b336a0f5-…` 记下一次 `glm-status` 命令（seq 60），结果 `success` |
| 设置页出现 | PASS | 设置导航多出「GLM-Hourness」，页面标题「GLM-Hourness 通道」，有通道、凭证存放、登录有效期、登录与状态四块（`shots/r2-02-settings-glm.png`） |
| 面板 | PASS | 面板标签照常恢复（`shots/r2-01-after-restart.png`） |
| 结构比对 | PASS | desktop 与 glmsandbox 对切换后快照都是 no differences，退出码 0 |

## 5. 收尾

- 模型菜单：第一轮第 4 项在新会话里经模型菜单选回「DeepSeek 账号」下的 DeepSeek-V4.1-Flash。`C:\Users\29596\.dsh\profiles\desktop\cordis.patch.yml` 的 `agent-default-model` 为 `provider: deepseek-account`、`model: deepseek-flash`、`reasoningEffort: high`；第二轮重启后新会话的选择器显示「DeepSeek-V4.1-Flash 1017 High」（`shots/r2-03-model-default.png`）。结构比对连同 `agent-default-model` 在内与切换后快照没有差异。
- `.llm/l4-split/` 用不跟随链接的遍历检查：9 个条目，0 个链接（这次没有演练，目录里没有运行目录）。
- 桌面版保持运行，CDP 9333 在监听。侧栏多出本次的两个会话（「L4 验证：工具检查与受限写…」「检查 graph_show 和 graph_focus…」）与收尾时打开的一个空白新会话。
- 没有改 `docs/graph/`；`m0.json` 的测试批注已还原。

## 6. split 验收逐条

| 验收 | 结果 | 依据 |
| --- | --- | --- |
| 1 两个包单独装上、单独启用都不报错（以 `probe-glm`、`probe-hourness` 与两包同列的 `probe-full` 为准）；只装编排层包时，非 GLM 会话里项目图与面板生效，guard 按 G3 对所有路由生效 | PASS | 探针 115/115（`de14525`）：三个生成的 profile 都被启动、`~/.dsh/profiles` 下没有它们；`glm-only`（只装 `dsh-glm-zcode`）有 ZCode 身份、别名与检索控制，没有图与记忆工具，`/glm-status` 把编排层包列为一行「未加载」，没有跳过的 bundle、没有行告警、stderr 0 字节，系统提示词没有 `# Workspace rules`；`hourness-only`（只装 `dsh-hourness`，DeepSeek 探针模型）有图、记忆与原生工具，`graph_focus` 后有投影，图目录写入被 `graph-files-only` 拒、`pwsh` 写文件被 `file-tools-only` 拒且文件没写出、两条记录都是 `scope: other`，系统提示词用原生名声明规则（含 `graph-files-only`），`/hourness-status` 把 GLM 包列为一行「未加载」，没有跳过的 bundle、没有行告警；`client-modules` 在 `probe-full` 上启用 `glm-ui` 后两个客户端包各组合一次、没有错误；`non-glm-guard`、`glm`、`glm-no-dialect` 三类路由（O、C、N）都拦截。桌面版上 C 与 O 两类路由都拦截，规则声明都在（§2 第 3、4 项）。面板的客户端包只来自编排层包（§2 第 6 项） |
| 2 行 id 不变；桌面版与 glmsandbox 的 profile 只改了 `package.json` 的 bundles 与 dependencies（改前备份），五条本项目覆盖项照常生效（L4 结构比对） | PASS | `tests/contracts.spec.ts` 的字面清单（13 个行 id）在 `npm test` 里通过；桌面版 `/glm-status` 的 11 个宿主行 id 与拆包前相同。合入步的快照比对：两个 profile 各 8 处差异，全在 bundles 与 dependencies；备份 `desktop/package.json.bak-1793277813423`、`desktop/pnpm-lock.yaml.bak-1793277813423`、`glmsandbox/package.json.bak-1793277794809`、`glmsandbox/pnpm-lock.yaml.bak-1793277794809` 存在。两轮的结构比对对切换后快照都没有差异（含五条本项目覆盖项）；覆盖项生效的运行证据：bundle 默认禁用的 `glm-llm` 由 profile 的覆盖项打开，桌面版上它生效并「上游已应答」 |
| 3 门禁、探针全过；桌面版批次 L4 通过 | PASS | §1 的门禁与探针；§2、§4 两轮 L4 |

question-17 B 的终态：两个 profile 直接列 `dsh-glm-zcode` 与 `dsh-hourness`，没有伞包与占位包；根 `package.json` 不是 bundle（preflight「根不是 bundle」一项通过）；`ui/` 没有 `package.json` 与 `cordis.patch.yml`（preflight 同上）；插件页只列两个宿主包。

question-14 G3：编排层包启用时 C、N、O 三类路由都拦截（探针 `glm`、`glm-no-dialect`、`non-glm-guard`，桌面版 GLM 与 DeepSeek 会话），所有路由的系统提示词末尾都有规则声明；只装 GLM 包时没有规则声明（探针 `glm-only`），guard 与图文件门禁都是 `dsh-hourness` 的行。

## 7. 偏离与观察

- 会话工作目录：设计写的是临时目录。新建工作区要经「添加工作区…」的系统文件夹对话框，CDP 驱动不了，所以两个会话都在工作区 GLM-Hourness（仓库根）里，写入目标放在不入库的 `.agents/tasks/split/l4-scratch/`。file-tools-only 不看目标路径，拦截结论不受影响；两个目标文件都不存在。
- 附录 0.5 的 A3 独立评审与 A4 演练没有做，profile 切换用的是简化脚本（合入步已报告）。本步的两轮 L4 与结构比对没有发现切换留下的问题。
- GLM 会话第 2 轮的「已编辑 4 个文件」卡片列的是编排者同时改的 `docs/graph/graph.svg` 与三个节点文件，不是本会话的写入（本会话唯一的工具调用被拒）；`.llm/audit/` 下没有影子记录文件。
- `m0` 的测试批注写在共享的 `docs/graph/` 上，已还原；编排者在这段时间里并行提交 `docs/graph/`，没有带上它。
- 合入步的截图 `.llm/l4-split/before-switch.png` 里有 `/glm-status` 的 Key 预览（6 个字符的前缀）与账号 id。m1-l4 对这类截图的做法是删除；它不是本步产生的，留给编排者决定。
- 观察：`~/.dsh/sessions/` 下有 `--C-Users-29596-Desktop-Project-GLM-Hourness-.worktrees-m3-base-.llm-probe-runs-2026-10-29T11-36-06-091Z-*` 的会话目录（19:36），即 m3-base 那次探针的会话写进了真实的 DSH home；split 合入前的探针（12:38Z）没有这样的目录。与本任务无关，只报告。

## 8. 文件

- 本文件：`C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\split\acceptance.md`
- 截图：`shots/r1-01-after-restart.png` … `r1-25-settings.png`，`shots/r2-01-after-restart.png` … `r2-03-model-default.png`（GLM 按钮对话框没有截图）。
- 宿主输出：第一轮 `r1-dsh-out.txt`、`r1-dsh-err.txt`，第二轮 `dsh-out.txt`、`dsh-err.txt`（stdout 含本机 web 地址的令牌，不要外传）；控制台：`r1-cdp-logs-boot.txt`、`r1-cdp-logs-after-model.txt`、`r1-cdp-logs-end.txt`、`r2-cdp-logs-boot.txt`、`r2-cdp-logs-end.txt`（令牌已遮盖）。
- 门禁日志：`r2-cleanup-build.log`、`r2-cleanup-preflight.log`、`r2-cleanup-test.log`、`r2-glmui-build.log`、`r2-glmui-preflight.log`、`r2-glmui-test.log`；提交说明 `commit-r2-cleanup.txt`、`commit-r2-glmui.txt`。
- 一次性脚本：`drv.mjs`（由 `m1-l4/drv.mjs` 改来，加 `eval`、`clickxy`、`type`、`logs`）、`sess.mjs`（由 `m1-l4/sess.mjs` 改来，加 `tools`、`sysend`、`text`、`cmd`）、`plugins-text.js`、`pill-check.js`；提示词 `msg-glm-1.txt`、`msg-glm-2.txt`、`msg-ds-1.txt`、`msg-ds-2.txt`、`slash-*.txt`、`comment-m0.txt`。
