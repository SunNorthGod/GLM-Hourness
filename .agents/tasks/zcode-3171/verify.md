# zcode-3171-follow 运行时验证

本文件只记头名、形式与形状，不含任何凭证、PAT、key、secret、签名、设备 ID 的值。

## 1. L3 探针（`npm run probe`，worktree `zcode-3171` @ `eaed98d`）

- 2026-10-30 05:31（UTC+8），worktree 的 `dist` 由 `eaed98d` 构建（最后一个提交只改文档与 locale，构建产物里 `ZCODE_APP_VERSION = '3.17.1'`）。`ZCODE_DATA_BASE_DIR` 指向临时目录，跑完删除。
- 结果：退出码 0，`probe: 118/118 passed`。日志 `probe.log`，运行目录 `.worktrees/zcode-3171/.llm/probe-runs/2026-10-29T21-31-36-763Z/`。
- 按场景（检查名前缀，全部 PASS）：sandbox 1；glm-only 7；hourness-only 7；client-modules 2；glm boot 1；glm prompt 2；glm tools 7；glm announcement 2；glm search 1；glm deferred call 1；glm execution 8；glm image 2；glm-flash image 1；glm-flash wire 1；glm todo 3；glm peak 2；glm peak (real clock) 1；non-glm peak 1；glm compact 2；glm-no-dialect 3；graph panel 3；graph live 2；graph row 11；graph run 5；memory usage 2；data 1；guard 6；guard shadow 2；guard paths 2；guard scope 2；health 7；workflow 1；pricing 1；calibration limits 2；dispatch (a) 4；dispatch (b) 3；goal (c) 4；goal (headless) 1；non-glm boot 1；non-glm prompt 1；non-glm tools 2。
- `glm` 场景第一条请求的系统提示词（`probe-markers.mjs`）：有 CLI 前缀 `You are ZCode, an interactive agent`，没有 `interactive coding agent`；有身份新句 `You are an agent working with the user toward their goals, …`；Harness 首条为 ` - Text you output … DeepSeek Harness Web GUI.`，系统轮那条以 `Hooks may intercept tool calls; treat hook output as user feedback.` 结尾；有 Dynamic Behavior 第一段；Context management 为两段，没有 3.16.3 的 `You are operating autonomously.`；Read 描述带 3.17.1 的新行。Environment 节不在：探针没有给 glm-prompt 行配置 `env`，按设计跳过该节。

## 2. 沙盒真实请求（glm-zcode，coding-plan，glm-5.3-flash）

- 2026-10-30 05:33（UTC+8），运行器 `wire-run.mjs`，tap 插件 `wire-tap.mjs`（undici 诊断通道取线上头名顺序与状态，fetch 包装只取 `/v1/messages` 正文的形状），汇总 `wire-summary.mjs`。运行目录 `wire-run/2026-10-29T21-33-16-013Z/`。
- profile 在运行目录下生成（`DSH_HOME`，`probe-full` 两包布局，junction 指向 worktree），没有读写 `~/.dsh/profiles/`；运行后 junction 已删。凭证按字节复制到运行目录的 `cred-home/`，未打开，运行后删除；全目录没有 `credentials.json`，tap 与运行目录里没有 JWT 或 `Bearer` 加令牌形的串。真实凭证、`~/.zcode/v2/telemetry-state.json`、真实用量流水运行前后大小与修改时间都没变。主检出 `git status` 前后都只有 `?? .kiro/`、`?? msg-refdir-gate.txt`（`.agents/` 在 `.gitignore` 里）。
- 任务：只读权限，fixture `bugfix-csv-quotes` 的 git 副本；LocalToolSearch 一次、Read 三次，再写摘要。退出码 0，28.9 秒，stderr 空，回合 `completed`，4 次工具调用都 `completed`。用量流水 6 条，全部 `glm-zcode/glm-5.3-flash`（标题 1、主步 5）。
- 运行时：DSH 桌面运行时的 node 模式，`process.version` `v24.21.0`，`navigator.userAgent` `Node.js/24`。

| # | 请求 | 状态 | 鉴权形状 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | `POST bigmodel.cn/…/api_keys/<id>/access_tokens`（项目令牌铸造） | 200 | Bearer / jwt（非 PAT） | 凭证是 v2 记录，直接铸造，没有列 key |
| 2 | `GET zcode.z.ai/api/v1/agent/configs`（端点路由配置） | 200 | 无 | `User-Agent: ZCode/3.17.1`，`X-ZCode-App-Version: 3.17.1` |
| 3 | `POST open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`（签名握手） | 200 | raw / jwt（PAT） | |
| 4 | 模型请求，会话标题 | 200 | Authorization Bearer/PAT，x-api-key raw/PAT 同令牌，X-ZCode-Authorization Bearer/ZCode JWT | 已签名；`x-zcode-session-features: tool_search_local` |
| 5–9 | 模型请求，主步 1–5 | 5/5 200 | 同上 | 5/5 已签名；主步 1 为 `tool_search_local`，LocalToolSearch 返回后主步 2–5 为 `tool_search_called,tool_search_local` |

- 签名：5/5 模型请求带完整签名块 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow`，全部 200，没有 401，没有 VERIFY 梯子的重发；ultra 网关接受签名。
- User-Agent：主步 `ZCode/3.17.1 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`；会话标题 `ZCode/3.17.1 ai/6.0.193 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`；路由配置 `ZCode/3.17.1`。`x-zcode-app-version` 为 `3.17.1`，`X-Title` 为 `Z Code@electron`。
- 模型请求线上头名顺序（6/6 相同，只差 `x-zcode-query-source` 的取值）：

```
host, connection, anthropic-version, authorization, content-type, http-referer, user-agent, x-api-key,
x-client-language, x-client-timezone, x-os-category, x-os-version, x-platform, x-query-id,
x-release-channel, x-request-id, X-Session-Id, x-title, x-zcode-agent, x-zcode-app-version,
x-zcode-query-source, x-zcode-session-features, x-zcode-session-type, x-zcode-trace-id,
X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow,
X-ZCode-Authorization, accept, accept-language, sec-fetch-mode, accept-encoding
```

  `x-zcode-session-features` 在归因头里排在 `x-zcode-query-source` 之后、`x-session-id` 之前；AI SDK 链按字母序排后，线上落在 `x-zcode-query-source` 与 `x-zcode-session-type` 之间（`DESIGN.md` §4.5b 的预期）。其余与 3.16.3 的线上顺序相同（`zcode-parity/wire-evidence.md` §4）。
- 归因头顺序与 3.17.1 包对照（`attr-order.mjs` 读主检出 `reference/zcode-3.17.1/zcode.cjs`）：
  - 包里产出的顺序：`createModelRequestAttributionHeaders`（`Uft` @4106291）返回的对象依次是 `[LXs]` `x-request-id`、`[BXs]` `x-zcode-session-type`、`[NXs]` `x-zcode-trace-id`、`[jXs]` `x-query-id`（有值时）、`[zyn]` `x-zcode-query-source`（有值时）、`[$yn]` `x-zcode-session-features`（`GXs` @4106679 给出值时；`$yn` 定义在 @3879451）、`[FXs]` `x-session-id`（有值时），最后 `x-opencode-session`（只在 baseURL 是 opencode.ai 的 `/zen/go/v1` 时，本通道不会出现）。
  - 本包产出的顺序：`buildTraceHeaders` 为 `x-request-id, x-zcode-session-type, x-zcode-trace-id, x-query-id, x-zcode-query-source, x-zcode-session-features, x-session-id`，与 `Uft` 逐个相同（`tests/glm-transport.spec.ts` 钉住）。
  - 线上顺序：3.17.1 的 AI SDK 在发出前经 `withUserAgentSuffix`（`Cyn` @3792459，另一份 `dD` @3543435 同形）把头放进 `new Headers(...)` 再 `Object.fromEntries(headers.entries())`；`Headers` 按小写名排序迭代，所以 3.17.1 自己发出的也是字母序，归因头在线上为 `x-query-id … x-request-id, X-Session-Id … x-zcode-query-source, x-zcode-session-features, x-zcode-session-type, x-zcode-trace-id`。本机 Node 对同一组头 `new Headers` 迭代得到 `x-request-id, x-session-id, x-zcode-query-source, x-zcode-session-features, x-zcode-session-type`。
  - 实测线上顺序（上面的代码块）与此一致：`x-zcode-session-features` 在 `x-zcode-query-source` 之后、`x-zcode-session-type` 之前；diff.md D-1 的「在 `x-zcode-query-source` 与 `x-session-id` 之间」是 `Uft` 的产出顺序，排序后线上落在 `x-zcode-session-type` 之前，两者不矛盾，不需要修。
- 路由配置请求头名（2026-10-30 05:33 这次运行）：`User-Agent, X-ZCode-App-Version, HTTP-Referer, X-Title, X-Platform, X-Release-Channel, X-Client-Language, X-Client-Timezone, X-Os-Category, X-Os-Version, X-Device-Mid, x-api-key-id, Accept`（前有 `host, connection`），与 3.16.3 相同。
- 正文：主步键序 `model, max_tokens, metadata, system, messages, tools, tool_choice, stream, thinking, output_config`，`model` `GLM-5.3-Flash`，`max_tokens` 128000，effort `high`，工具 29 个（含 `LocalToolSearch`、`DeferredToolCall`）；标题键序 `model, max_tokens, metadata, system, messages, thinking, output_config`，`max_tokens` 5000，effort `low`。
- 主步系统提示词（8716 字符，5/5 相同）：CLI 前缀 3.17.1、身份新句、Harness GUI 首条与 Hooks 句、Dynamic Behavior、两段 Context management 都在，3.16.3 的 `interactive coding agent` 与 Context management 后四段都不在。Environment 节不在（运行时 profile 没有给 glm-prompt 配 `env`）。

## 3. Rebase 与门禁

- 05:36 `git -C .worktrees/zcode-3171 rebase main`：14 个提交无冲突地放到 `ecdee9d` 上（main 在合并基 `9904f71` 之后只有 `docs/graph/` 的提交，分支不碰 `docs/graph/`），分支头 `b5d9fcb`。
- 在 worktree 里依次 `npm run build`、`npm run preflight`、`npm test`（日志 `rebase-gate.log`）：三个退出码都是 0；preflight `OK`（2 个包、13 行组合、两个客户端面已构建）；`check-verbatim: OK against reference 3.17.1 (489 verbatim, 0 known deviations, 292 lines checked)`；eslint 250 条压制、knip 21、jscpd 2 处 16 行，与基线相同；gitleaks 扫 HEAD 上 356 个提交及暂存、未暂存改动，无泄露；`graph:smoke` ok；spec 661 通过、0 失败。
- 主检出没有快进（编排方批桌面槽位时的指示：L4 经 junction 指向 worktree，main 留到合入步）。写本节时 main 为 `bc9d2cd`（编排方又加了一个只改 `docs/graph/` 的提交），合入前分支要再 rebase 一次。

## 4. 桌面版 L4（junction 指向 worktree）

做法照 `.agents/tasks/row-titles/l4.md`。

- 备份（05:39，改动之前，桌面版关闭）：`l4-backup-20261030T053921/`，含 desktop profile 的 `package.json`、`pnpm-lock.yaml`、`cordis.patch.yml`、`cordis.yml`、`desktop-next.cordis.patch.json`、`desktop-next.runtime.patch.json`、`pnpm-workspace.yaml`、`node_modules` 链接清单，以及 `m1-l4/` 原有的 `dsh-out.txt`、`dsh-err.txt`；结构快照 `desktop-shape-before-l4.json`（13 个 bundle、2 个依赖、5 个其余清单键、12 条 patch 条目）。
- 唯一的改动：`~/.dsh/profiles/desktop/node_modules/` 下 `dsh-glm-zcode` → `.worktrees/zcode-3171/packages/glm`，`dsh-hourness` → `.worktrees/zcode-3171/packages/hourness`（`rmdir` 只删链接，再 `mklink /J`）。worktree 的产物是 `b5d9fcb` 的构建（05:37，上一节的 `npm run build`）。
- 启动：`.agents/tasks/m1-l4/restart.ps1`，05:40 启动，CDP 9333。stderr 只有 `DevTools listening on ws://127.0.0.1:9333/...`；stdout 是更新检查、inspector 与 web 地址、`[llm-deepseek-account] model listing … loaded 2 model(s)`，没有本项目的输出（`l4-dsh-out.txt`、`l4-dsh-err.txt`，`m1-l4/` 下原来的两个文件已放回）。`%APPDATA%\@deepseek-ai\dsh-desktop\logs` 没有新的 crash log（最新仍是 `crash-2026-10-29T05-43-05-346Z-web-boot.log`）。
- 会话：工作区 GLM-Hourness 的空白新会话 `session-068dde6e-818c-4d3e-b9be-ae0cfc2331e6`（2026-10-29 选回模型时留下的那个），经模型菜单选「GLM（ZCode 原生通道）」组的 GLM-5.3-Flash（`l4-02-model-submenu.png`），发一条只读提示（`l4-msg1.txt`：读 `m1-l4/scratch/gamma.md`，说出数字）。05:41:59 发出，1 轮 2 步：Read 一次，`err=false`，回答 3 份地图与 48 个座位，与文件一致；`turn/end completed`，用时 12 秒（`l4-03-after-send.png`）。会话标题由 `glm-zcode/glm-5.3-flash` 生成（「只读验证 gamma.md 中的数字」，`source.kind: provider`）。`request/header` 路由 `glm-zcode/glm-5.3-flash`，工具 30 个。
- 系统提示词（会话文件 seq 9 的 `system/message`，13640 字符，`l4-sess.mjs` 只读解码）：前三行是 `You are ZCode, an interactive agent`、空行、`You are an agent working with the user toward their goals, using your own judgment along the way.`。以下都在：Harness 的 ` - Text you output … DeepSeek Harness Web GUI.` 与 ` - Tools run behind a user-selected permission mode;`（bullet 行首空格）、系统轮那条 `` - `<system-reminder>` tags … not the user. Hooks may intercept tool calls; treat hook output as user feedback.``、Dynamic Behavior 第一段、Context management 两段（标题后接 `When the conversation grows long …`，再接 `When you have enough information to act, act.`）、Environment 节的 `You have been invoked in the following environment: ` 加 ` - Primary working directory:` 与 untrusted-files 一条、Session guidance 的 ` - When a skill`。以下都不在：`You are ZCode, an interactive coding agent`、`powered by DeepSeek Harness`、`You are operating autonomously.`、旧的无空格 bullet `- Text you output outside of tool use`。
- `/glm-status`（同一会话，seq 30）：首行「glm-zcode：已登录（套餐 coding-plan，Key <前缀>，账号 <账号>）」；glm-llm 生效（上游已应答，套餐 coding-plan）；glm-login、glm-prompt（GLM 路由 glm-zcode/glm-5.3-flash：ZCode 提示词与工具面，工具检索 local）、data、guard、memory、workflow、graph-panel 生效；glm-compact、hourness、graph 为「已加载，本会话未触发」。11 行，没有失败或未加载的行。界面上的 `/glm-status` 截图含 Key 前缀与账号 id，已删除。
- 桌面版的流量没有截包；版本号与头序以第 2 节的沙盒真实请求为证（同一份 worktree 构建）。
- 模型菜单复原：选 GLM 时 `cordis.patch.yml` 的 `agent-default-model` 变为 `glm-zcode` / `glm-5.3-flash` / `high`（DSH 自己写的）；之后点「新会话」，在模型菜单选回「DeepSeek 账号」组的 DeepSeek-V4.1-Flash（`l4-05-deepseek-submenu.png`、`l4-06-model-restored.png`），输入框显示「DeepSeek-V4.1-Flash 1017 High」，`agent-default-model` 回到 `deepseek-account` / `deepseek-flash` / `high`，文件 SHA-256 与备份相同。
- 关闭与复原：05:45 关闭桌面版（`CloseMainWindow` 后强制结束，进程数 0）。两个 junction 改回主检出 `packages/glm`、`packages/hourness`，worktree 的包目录仍在。`node scripts/profile-shape.mjs compare desktop .agents/tasks/zcode-3171/desktop-shape-before-l4.json`：`no differences`，退出码 0。备份里 7 个文件与 profile 现状的 SHA-256 逐个相同（`cordis.patch.yml`、`cordis.yml` 被重写过，内容不变）。profile 目录没有新增文件。桌面版保持关闭。
- 侧栏多了一个会话「只读验证 gamma.md 中的数字」（原来的空白新会话）；选回模型时点的「新会话」可能另留一个空白会话，没有核对。

## 5. 修复提交

无。所有检查一次通过，没有改代码。
