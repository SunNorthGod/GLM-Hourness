# 外部事实账

版本：0.2（2026-10-27）
状态：生效。取代外部事实账 v0.1（`.llm/docs/04-external-facts.md`，原文见 git 历史提交 `c518317`）。
本文件只放结论与索引，细节查 `reference/` 下的原文。证据标注同 `DESIGN.md`。

## 1. ZCode

| 事实 | 来源 |
| --- | --- |
| 本机安装 ZCode 3.16.3 | 卸载注册表〔实读 2026-10-27〕 |
| 方言基线为 3.16.3 协议采样；ZCode master 的演进只作机制参考 | 用户定案；`reference/zcode-verbatim.md` §4 |
| 本机安装版 `C:\Program Files\ZCode\resources\glm\zcode.cjs`（MD5 `c7d641da7407083165533fb29fb29a9e`）被用户打过补丁，不得作为官方原文 | `reference/zcode-verbatim.md` 开头；用户确认 2026-10-27 |
| ZCode 官方源码 `reference/ZCode`：`package.json` 版本 3.16.2，最近提交 2026-10-20「chore: sync ZCode source」；逐字文本以它为准 | 〔实读〕 |
| 方言逐字文本复核：身份类与 context management 是原文；工具描述、deferred 声明段、ToolSearch 描述大部分不是原文；todo 提醒正文与 compact 提示词有小处偏差。后两者与工具检索文本已按原文重建，deferred 声明段已删除 | `DESIGN.md` §5.9 |
| 3.16.3 的 `X-Title` 来源标题：agent 进程参数含 `app-server` / `agent-server` 时为 `electron`，否则为 `cli`；桌面版以 `app-server --stdio` 启动 agent 进程 | 安装包 `detectDefaultProviderSourceTitle`、agent 运行时描述〔实读〕 |
| 3.16.3 的签名 `clientVersion` 与项目令牌 `clientVersion` 共用常量 `__ZCODE_VERSION__`（构建期注入，安装包文本中未替换）；`X-ZCode-App-Version` 取自环境变量 `ZCODE_APP_VERSION` | 安装包〔实读〕；实际取值未验证 |
| 官方原文权威源：pristine 3.15.1 副本 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3151\zcode.cjs`（MD5 `87225203a43f8009e403c57532922f4c`）；3.16.3 pristine 副本 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3163\zcode.cjs.pristine`（15,242,397 字节，MD5 `51257C0D11DA7DC56C157D92E7048146`），与安装前备份 `C:\Program Files\ZCode\resources\glm\zcode.cjs.orig-3163.bak` 同 MD5；判断未经修改的依据只有文件名与这份备份，未与官方发布哈希比对。本表的「@数字」是这份 3.16.3 副本按 UTF-8 读入后的字符偏移，指向符号的声明处 | `zcode-patch` 目录〔实读 2026-10-28〕 |
| 3.16.3 签名握手 URL 为 `new URL('/api/paas/c1f3a7e2/v2/client', <provider baseURL 的 origin>)`，baseURL 的路径丢弃；bigmodel coding-plan 为 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`，z.ai 为 `https://api.z.ai/api/paas/c1f3a7e2/v2/client`（z.ai 的 baseURL 按源码路由表推断）。签名 fetch 包在端点路由 fetch 外面：签名器看到路由前的 URL，握手也经路由 fetch 发出 | 3.16.3 pristine 包 `resolveHandshakeUrl`（`ZUs` @3823123）、握手路径常量 `GUs` @3823630、`ClientRequestSigningV4Signer`（`Pgn` @3825391）、`protectTransport` @3833810、`createFactory` @3851919〔实读 2026-10-28〕；源码 `model-execution.ts` 283–301 行、`packages/desktop/wdio.conf.ts` 的握手夹具；`DESIGN.md` §4.3 |
| `c1f3a7e2` 是字面常量：3.15.1、3.15.2、3.15.3、3.16.1、3.16.2、3.16.3 的 pristine 包里各出现一次，在签名模块常量区，没有拼接或哈希 | `zcode-patch/pristine-*/zcode.cjs.pristine`〔实读 2026-10-28〕 |
| 3.16.3 握手：`Authorization` 是原样凭证（`{apiKeyId}.{secret}` 或 project_access JWT，都不加 `Bearer `），请求体 `{apiKey 或 accessToken, nonce, sig, ts}`，超时 10 秒；3.15.1 相同。业务拒绝（信封 `code` 不是 200）的 `msg` 只在匹配 `^HANDSHAKE_[A-Z_]+$` 时记为 reason；`handshake_failed` 观测只带 `errorKind`、`httpStatus`、`businessCode`、`reason`，不带错误消息 | 3.16.3 pristine 包 `performHandshake` @3829991、reason 过滤函数 `N1r` @1089432、`ensurePrivateKey` 的 `handshake_failed` 观测〔实读 2026-10-28〕；被服务端接受的形式待 L4 |
| 3.16.3 不缓存握手失败：网络错误、超时、非 200、业务拒绝都放行为无签发送，不留负缓存、没有退避，下一个可签名请求立即再握手，只有并发请求共享进行中的握手。私钥按（apiKey, 握手 origin）进程级缓存，没有 TTL，401 VERIFY 拒绝才作废 | 3.16.3 pristine 包 `ensurePrivateKey` @3829024、`getKeyOrSendUnsigned` @3827749、`ClientRequestSigningV4KeyCache`（`Xut` @3824083）〔实读 2026-10-28〕 |
| 3.16.3 只对标记 `failOpenEligible` 的错误放行（握手的网络、超时、协议、服务端、业务错误）；凭证解析失败与请求缺 `X-Session-Id`（`invalid-config`）、PoW 或 Ed25519 签名失败（`cryptography`）、握手进行中 epoch 变化或签名器已 dispose（`disposed`）不放行，请求抛错 | 3.16.3 pristine 包 `getKeyOrSendUnsigned` @3827749、`ClientRequestSigningV4Error`〔实读 2026-10-28〕 |
| 3.16.3 两次 VERIFY 拒绝后的旁路是签名器实例字段，只对当前签名器代有效；生产路径每次 `createFactory` 都换一个签名器，旁路因此只管一次请求 | 3.16.3 pristine 包 `bypassSigning` @3827229、`resolveSigner` @3825013〔实读 2026-10-28〕；`createFactory` 的调用频率按源码 `runner.ts` 251–285 行推断 |
| 3.16.3 对 `zhipu-account` 的 start-plan、off-peak、highspeed 三种 mode 不签名 | 3.16.3 pristine 包 `requiresClientRequestSigning`（`QUs` @3832832）〔实读 2026-10-28〕 |
| 官方开源仓库 zai-org/ZCode，Apache-2.0 | `README.md` |
| 身份节组装、安全声明官方原文、Harness 节 | `reference/zcode-verbatim.md` |
| 八件套工具定义原文在源码 `apps/zcode-cli/packages/core/src/tool/handlers/`；`reference/zcode-tool-schemas.md` 中的工具描述与 deferred 声明段无法追溯出处，SessionGuidance、Skills 引导段待同样复核 | `DESIGN.md` §5.9 |
| TodoWrite `priority` 为字符串三枚举 `high` / `medium` / `low` | `reference/zcode-capabilities.md` §11.3 |
| todo 提醒双阈值 10/10，GLM 启用 | `reference/zcode-capabilities.md` §4.2 |
| todo 提醒按助手消息计轮（一条助手消息一轮，不论工具调用数），每次模型请求前从历史重新计算；本回合工具有 TodoWrite 才检查；作为 `todo_reminder` 附件递送并持久化；3.16.3 对 id 含 `claude` 的模型不提醒；`supportsMidConversationSystem` 为真时投影为对话中段 system 消息，否则为 `<system-reminder>` 用户消息，GLM 的取值来自远端配置 | 安装包 `XNa`、`U4o`、`z4o`、`Rwe`；源码 `runtime/helpers/runtime-reminders.ts`、`runtime/methods/turn-loop.ts`、`runtime/helpers/provider-mid-conversation-system.ts`〔实读 2026-10-28〕；`DESIGN.md` §5.5 |
| compact：默认窗口 200k，输出预留 min(maxOutputTokens, 21k)，autoCompact 阈值 166k；microcompact 公式 | `reference/zcode-capabilities.md` §11.2 |
| 默认 `max_tokens` 32000；thinking 启用时剥离采样参数 | `reference/zcode-capabilities.md` §10.1、§11.7 |
| effort：anthropic 通道 `output_config.effort` 五档词汇；GLM 实用三档 low / high / max | `reference/zcode-capabilities.md` §11.1；用户定案 |
| 记忆目录结构与 project-hash 算法 | `reference/zcode-capabilities.md` §10.6 |
| 工具检索模式默认 `off`（桌面版设置 `toolSearchMode` 与 CLI `--toolsearch-mode` 均如此）；deferred 工具名以 `<system-reminder>` 公告递送，不写进系统提示词 | `DESIGN.md` §5.10〔实读〕 |
| 3.16.3 的 local 模式把检索工具暴露为 `LocalToolSearch`，描述与提醒文案与 3.16.2 源码不同 | 安装包 `toolSearchNameForMode`〔实读〕；`DESIGN.md` §5.10 |
| off-peak 是服务端排队协议（`x-off-peak-ticket-id`、429/3105 排队豁免重试、3102 续跑），客户端没有本地峰谷窗口常量 | S1 进度台账 Round 17（git 历史） |
| 使用统计口径（summary、heatmap、按模型、按工具） | `reference/zcode-capabilities.md` §12 |

## 2. BigModel

### 2.1 端点与认证

- 端点：按量 `/api/paas/v4`；套餐 `/api/coding/paas/v4`；Anthropic 兼容 `/api/anthropic`（`x-api-key`）；Responses `/api/v1`。
- 2026-10-16 起新 Key 分三类，互不通用；历史兼容 Key 的额度由调用端点决定。
- 模型 API 认证只有 Bearer API Key 与可选 JWT；ZCode 的「OAuth」是账号登录体系，不是模型 API 的标准 OAuth。
- 文档称曾订阅 Coding Plan 的账号暂只能用 Chat Completion 协议；本账号走 Anthropic 通道端到端成功〔实测 2026-10-27〕。

### 2.2 模型参数

- GLM-5.3 系强制思考，`thinking.type` 只接受 `enabled`。
- 输入模态：GLM-5.3 没有视觉塔，只接受文本；GLM-5.3-Flash 是多模态（用户提供，2026-10-28）。GLM-5.3-Flash 经 Anthropic 兼容通道接受 base64 图片块〔实测 2026-10-28，一次请求，`DESIGN.md` §4.5a〕。
- Preserved Thinking（`clear_thinking: false`）：套餐端点默认开，标准端点默认关；回传 `reasoning_content` 提高缓存命中。
- 1M 上下文：Anthropic 通道在模型名后加 `[1m]`。

### 2.3 渠道

- 只有官方指定工具（ZCode、AutoClaw、Claude Code、Codex 等）加正确 Base URL 才消耗套餐额度；ZCode 与 AutoClaw 标注 1.5 倍用量。
- 1.5 倍加成只在个人套餐（coding-plan）档；start-plan（体验套餐）没有（用户提供）。
- 非官方工具（如 OpenClaw）被定位为次级调度、尽力交付、动态排队限流；身份头保真是降低限频风险的手段，这是本项目的固有风险。

### 2.4 计费、额度与峰谷

用户套餐为新版积分制〔定案 2026-10-27〕。

- 积分 = （输入 Token × Input 系数 + 缓存命中 Token × Cached 系数 + 输出 Token × Output 系数）/ 10000。

| 对象 | Input | Cached | Output |
| --- | --- | --- | --- |
| GLM-5.3 | 6.9 | 1.7 | 24 |
| GLM-5.3-Flash（含视觉理解 MCP） | 2.3 | 0.56 | 8 |
| MCP 工具（联网搜索、网页读取、开源仓库） | 每次调用 × 1.2 | — | — |

- 高峰时段：周一至周五 14:00–18:00（UTC+8）。非高峰（含周末全天）按 50% 抵扣。
- 缓存命中：GLM-5.3 缓存命中系数约为普通输入的 25%，命中部分约省四分之三。

| 档位 | 每 5 小时 | 每周 |
| --- | --- | --- |
| Lite | 2,000 | 10,000 |
| Pro | 12,000 | 60,000 |
| Max | 28,000 | 140,000 |

- 5 小时额度从消耗起点动态刷新；周额度自下单起 7 天一个周期；升级立即刷新，续费不重置；额度耗尽不扣余额，等周期恢复。
- 用户的具体档位未记录，面板从通道取数或由配置给出。
- 历史 V2 套餐（GLM-5.3 非高峰 1 倍 / 高峰 3 倍）不适用于本用户，仅备查。
- 来源：`reference/bigmodel-guide-digest.md`。

### 2.5 限流与错误码

- 1308 / 1310 / 1316–1321 携带 `next_flush_time`，可直接展示恢复时间。
- 1313 为公平使用限频。

### 2.6 福利

体验卡、额度重置卡、实名赠送 tokens 只有控制台页面入口，没有公开领取 API。处置：检测并跳转控制台，不模拟登录态。

### 2.7 训练分布印证

- 官方文档以 Claude Code 生态为参照（CLAUDE.md、Plan Mode、Hooks、Skills），GLM coding 训练分布的假想宿主是 Claude Code 式 CLI agent，支持镜像 ZCode 的方向。
- MEMORY.md 前 200 行自动进入 subagent 系统提示（官方两处互证）。
- 任务结构化输入的官方建议：Goal / Context / Constraints / Done when（用于简报四栏）。
- 来源：`reference/bigmodel-coding-plan-digest.md`。

## 3. DSH

| 事实 | 来源 |
| --- | --- |
| 桌面版运行时接口以 `reference/dsh-desktop-0.2.1-rc.3/` 为准：无 `tools.executable()`、`register()` 无激活谓词、组装先于 pre-step、请求工具取自 `assembly.tools` | `DESIGN.md` §2.4a〔实读〕 |
| rc.3 桌面版在 `agent/created` 与 `agent/pre-step` 上：`agent.model.current()` 返回空对象；主会话 agent 的 `pre-step` 载荷 `modelSelection` 为空（会话标题 agent 有 provider） | 桌面方言排查记录（git 历史，`docs/legacy/desktop-dialect-triage.md`）〔实测〕 |
| 路由信息在 `system-prompt/assemble` 瀑布的 `variables.provider` / `variables.model` 中可见 | `src/glm-prompt/assembly.ts`〔实读〕 |
| 会话存储：`~/.dsh/sessions/<workspace-slug>/<session>/session.v4.jsonl.zstd`，多帧 zstd；`system/message` 事件含完整组装后的系统提示词 | 排查记录〔实测〕 |
| 桌面版完全重启才加载新的 dist，重开窗口不够 | 排查记录〔实测〕 |
| 桌面版 `dsh` 不在 PATH；headless 沙盒用 Electron 的 node 模式调用；`--profile desktop` 被拒绝 | `DEVELOPMENT.md` §3 |
| headless 的 `--json` 输出按会话事件投影成逐行 JSON：`session`、`status`（`turn_start`、`step_start`、`step_end` 带该步用量、`turn_end` 带结束原因）、`tool_call`、`tool_result`、`text`、`thinking`、`final`；任务写 `-` 时从 stdin 读 | `reference/dsh-desktop-0.2.1-rc.3/dsh-headless` json-stream 172 行起、startup 35 行〔实读〕 |
| headless 模板的沙盒策略行与审批行读环境变量 `DSH_PERMISSION_MODE`（缺省 `workspace-write`，审批 `ask`；`danger-full-access` 时审批 `never`）；用户桌面版 profile 的默认预设是 `danger-full-access`，审批 `never` | `glmsandbox --dump-config`、`~/.dsh/profiles/desktop/cordis.patch.yml`〔实读 2026-10-28〕 |
| `workspace-write` 下 pwsh 经 Windows ACL 沙盒运行，`node --test` 派生测试子进程报 `spawn EPERM`（单独 `node <文件>` 可以运行）；`danger-full-access` 下正常 | 标定试跑 2026-10-28（`ORCHESTRATION.md` §10.5.1）〔实测〕；`dsh-sandbox-windows-acl` 791 行的注释描述了同一类失败 |
| `agent/pre-step` 返回 `{ kind: 'reject' }` 时回合以 `blocked` 结束；`agent.cancel` 的取消原因有 `user`、`parent`、`disposed`、`hook`（带 `reason`） | `dsh-agent-loop` 961 行、815 行、731 行〔实读〕；探针 `limits-steps`、`limits-time`〔实测〕 |
| client-modules 一包一源约束 | `DESIGN.md` §2.3 |
| 静态包 client 半：factory 只拿到 `require` 模块表，表里有 `@deepseek-ai/dsh-client-ui-primitives`；导出的 `inject` 与 `apply(ctx)` 拿到声明过的客户端服务；`remote.workspaceFiles` 只读；客户端的 Remote 能力集合构建时固定，第三方不能新增转发的 waterfall，自定义 Remote 服务对第三方不现实 | `dsh-web-frontend` `index-BXV-oxvX.js` 的 `OZ()`；`dsh-api-workspace-files/README.md` 12 行；`dsh-api-remotes/README.md` 77–78 行〔实读 2026-10-28〕；`DEVELOPMENT.md` §5.6 |
| 第三方客户端的落点：右侧栏标签页、全局页面、输入框上方条 `conversation.input.dock`、回合末尾卡片 `conversation.chat.turnTail`、独立聊天节点、按工具名的工具行视图 `tool.call.toolview`；Desktop 默认启用 Browser 标签页，客户端插件可 `ctx.sidebarRight.openTab('browser', { params: { url } })`，页面在 Electron webview 里 | `dsh-client-ui-sidebar-right/README.md` 81–84 行；`dsh-client-ui-sidebar-browser/README.md` 43 行；`dsh-web-app/cordis.patch.yml` 296–298 行〔实读 2026-10-28〕；真机未验证，`ORCHESTRATION.md` §13 |
| 宿主插件可注册会话投影，但只能折叠已有的会话事件；仓库外插件不得调用 `appendPluginRecord` 追加自定义事件 | `dsh-session/README.md` 70 行〔实读 2026-10-28〕 |
| `@deepseek-ai/schemastery` 在已安装的 profile bundle 中无法解析；插件管理器只把原生 Schemastery `Config` 导出投影成表单 | `README.md` |
| rc.3 桌面版没有 LSP 包；DSH 主干的 `packages/lsp` 只有跳转定义、查引用、查实现、悬停，没有诊断 | rc.3 `dsh`、`dsh-web-app` 的 `package.json`；`reference/deepseek-harness/packages/lsp/*/package.json`〔实读〕 |
| Agent Team 为实验功能（Lead、具名队友、收件箱、持久任务 DAG，需持久会话存储），所在可选包默认关闭。队友由 `subagents.startActivation` 创建、不带 `agentPreset`，工具面与 Lead 相同；作用于 profile 里每个根 agent。profile 层只禁用四个顶层行 id，碰不到 Desktop `preset-standard` 内的委派工具，`subagent`、`subagent_fork` 仍在；Team 工具在根 agent 作用域以同名遮蔽 `send_message`、`list_agents`、`interrupt_agent`（工具面结果为推断，未在真机确认） | `dsh-experimental-agent-team-profile/cordis.patch.yml` 4–14 行；`dsh-experimental-agent-team` 1032 行；`dsh-app-boot` 61–68、579 行；`dsh-experimental-tool-agent-team/README.md` 12 行〔实读 2026-10-28〕 |
| `tool-ralph`：每轮一个全新子 agent，只传有界结构化报告，工作区即长期记忆；报告不做独立验证。它是模型调用的前台工具，阻塞调用方回合直到全部轮次结束；提示词规定人明确要求才用；依赖 `workflowEngine` 与固定脚本；所在可选包默认关闭 | `dsh-tool-ralph/README.md` 12、162 行，lib 13、36 行〔实读 2026-10-28〕 |
| `plan-mode` 只靠提示词，所有工具照常可调；唯一配置 `section`（提示词节 `plan:policy`）；`exit_plan_mode` 经 `userQuestions.ask` 发 `plan-review` 审阅卡，批准返回 `{ approved: true }`；Desktop 上在 `preset-standard` 的 `planning` 组里，`planMode` 隔离在组内，宿主层读取要经 `agentPresets.serviceFor(agent, 'planMode')` | `dsh-plan-mode/README.md` 184 行，lib 148、257、275 行；`dsh-web-app/presets/standard.patch.yml` 45–49 行；`dsh-agent-preset-registry` 725 行〔实读 2026-10-28〕 |
| `userQuestions.ask` 只接受 live root，子 agent 抛 `DELEGATED_CALLER`；`intent` 只有 `plan-review`；插件自己调 `askTimed`，超时后晚到的答复丢失（投影只跟踪 timed 模式下名为 `ask_user_question` 的调用）；同一时间只显示一张卡，没有侧栏收件箱 | `dsh-user-questions` 199–201、534、552、613、668 行；`dsh-client-ui-user-questions/README.md` 118–119 行〔实读 2026-10-28〕 |
| `subagents.startActivation` 的请求带 `prompt`、`parent`、`cwd`、`agentPreset`、`agentOptions`、`outputSchema`、`maxDepth`，`delivery` 为 `parent` 或 `caller`；spawn 后端支持 `agentOptions`、`agentPreset`、`outputSchema`、`depthLimit`，fork 后端拒绝 `agentPreset`；不选 preset 的子 agent 加入父 agent 的 preset；`maxDepth` 默认 1，`maxActiveSubagents` 默认 8 | `dsh-subagent` 346、373、2979–2980、3036 行；`dsh-subagent-spawn-in-process` 21–27 行〔实读 2026-10-28〕 |
| `workflowEngine` 在 Desktop `preset-standard` 的 `delegation` 组内隔离，宿主层插件取不到；脚本的 `agent()` 没有 preset 选项 | `dsh-web-app/presets/standard.patch.yml` 83–87 行〔实读 2026-10-28〕 |
| goal：每个 goal 都有轮次上限，`maxGoalRounds` 只接受正整数，缺省取服务配置 `defaultMaxGoalRounds`（256）；服务层 `create` / `resume` 只检查 agent 是否 live，「由人直接发起」只在 `dsh-tool-goal` 里检查。goal-round-driver 在 agent 空闲时以 `agent.followup` 投递 `<goal_round>` 消息，每轮之前等待该 agent 的子 agent 结束；会话恢复或 fork 后不自动 arm | `dsh-goal` 455、588、635、686 行；`dsh-goal-round-driver` 11、132、164 行，README 57 行〔实读 2026-10-28〕 |
| 宿主层插件 inject `subagents` 后调用 `startActivation`（spawn、`delivery: 'parent'`）能启动后台子 agent，调用在子 agent 被接受时返回；预留的 `childId` 就是子 agent 的 id 与会话 id。子 agent 的会话头 `cwd` 是父 agent 的目录，请求里的 `cwd` 只成为子 agent 的工作目录（首条消息前有一条「working directory changed」通知）；子 agent 的文件沙盒根仍是父会话的工作区。完成通知是一条用户消息：「Background subagent <id> finished …」，没有收尾文字时写「It left no closing message.」，有结构化结果时另起一行「Structured result: <JSON>」 | 探针 `glm-dispatch`〔实测 2026-10-28〕；`dsh-subagent` 346–355、526、3036 行〔实读〕 |
| headless 一次性运行器在自己 agent 第一次静止空闲时退出（子 agent 都结束、会话序号不再变化）：任务回合里创建并 arm 的 goal 在退出前得不到任何一轮 | 探针 `goal-headless`〔实测 2026-10-28〕；`dsh-headless` 349–351 行〔实读〕 |
| 插件经 `goals.create` 给一个空闲的根 agent 建 goal，驱动器照常投递目标轮；在 agent 作用域的 `agent/pre-step` 里于 `next()` 之后追加的 notice 随目标轮进入该步，不影响驱动器的预约校验，下一轮照常开始；GLM 路由上 `update_goal` 经 DeferredToolCall 调用时，`tools/pre-execute` 看到的是 `update_goal` 本身，可以拒绝 `complete`，拒绝以工具错误回到模型，goal 保持 active | 探针 `glm-goal`〔实测 2026-10-28〕；`dsh-goal-round-driver` 249、286–350 行〔实读〕 |
| `schedule`：提醒只投递到创建它的会话，不支持每次新开会话；宿主必须在运行，投递失败不自动重试；`every_seconds` 至少 60 秒；子 agent 的会话拒绝；提醒消息来源 `{ kind: 'schedule' }` | `dsh-schedule/README.md` 153、157 行，lib 1594、2083 行〔实读 2026-10-28〕 |
| `workspace-changes` 的数据只在宿主进程内存里，会话释放或宿主重启后没有；非 git 目录只记录文件工具的改动 | `dsh-workspace-changes` 1019 行起〔实读 2026-10-28〕 |
| `user-approval`：`approval.request` 返回 `allowed-once`、`rejected`、`cancelled`、`unavailable`，必须在打开的回合内调用；只有一次性授权，请求不带工具参数；没有应答者时失败即拒；委派出去的子 agent 审批策略固定为 `never` | `dsh-user-approval` 30、128–130 行，README 154–155 行；`dsh-subagent`（`captureDelegatedPolicyOverrides`）〔实读 2026-10-28〕 |
| rc.3 已有包：`plan-mode`、`goal`、`goal-round-driver`、`schedule`、`workspace-changes`、`token-meter`、`session-stats`、`mcp-client`、`user-questions`、`tool-ask-user`、`repeat-tool-reminder`。行动卡片 `action-cards` 只在 DSH 主干，rc.3 没有 | rc.3 导出目录〔实读 2026-10-28〕；接口见上面各行，`token-meter`、`session-stats` 只核到服务名与投影键，`mcp-client` 只读了 README |
| DeepSeek V4.1-Flash-1017 针对 DSH 专项优化，需 DSH 0.2.1-rc.1 以上；主打「许愿式编程」 | [量子位，2026-10-17](https://www.qbitai.com/2026/10/504067.html) |

## 4. 许可与来源

| 来源 | 许可 | 本仓库的使用 |
| --- | --- | --- |
| zai-org/ZCode | Apache-2.0 | 事实源；提示词与工具 schema 逐字镜像 |
| TriDefender/zcode-api（`reference/zcode-api`） | CC BY-NC-SA | 多个通道模块移植自其实现（签名、身份头、凭证存储、start-plan 组装、系统提示词文本）。用户定案 2026-10-27：不受约束。本包许可为 MIT；若对外发布需复核 |
| DSH `vendor/schemastery` | MIT | `src/shared/schemastery.ts` 为其拷贝，差异见 `README.md` |

## 5. 挂账

| 项 | 阻塞条件 | 验证路径 |
| --- | --- | --- |
| native ToolSearch 透传（K2） | 需活 token | 实测 |
| 服务端 web 工具直连闸门（K4） | 需活 token | 实测 |
| 签名握手在 provider origin 上的结果：是否返回 200 与 `privateCipher`，ultra 网关是否接受签名请求，原样 JWT 的 `Authorization` 是否被接受（根因已查明：握手地址错，`DESIGN.md` §4.3） | 需真请求 | L4 截包 |
| OutputStyle 风格列表 | 服务端下发 | 抓取 |
| 实跑 temperature / top_p 值 | 需实跑请求体 | 抓包 |
| start-plan 与 coding-plan 渠道差异（K9） | 无 | zcode-api 源码 |
| repeat-tool-reminder 文案与门控（K1） | 无 | DSH 源码 |
