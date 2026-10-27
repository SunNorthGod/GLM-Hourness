# 外部事实账

版本：0.2（2026-10-27）
状态：生效。取代外部事实账 v0.1（`.llm/docs/04-external-facts.md`，原文见 git 历史提交 `c518317`）。
本文件只放结论与索引，细节查 `reference/` 下的原文。证据标注同 `DESIGN.md`。

## 1. ZCode

| 事实 | 来源 |
| --- | --- |
| 本机安装 ZCode 3.16.3 | 卸载注册表〔实读 2026-10-27〕 |
| 方言基线为 3.16.3 协议采样；ZCode master 的演进只作机制参考 | 用户定案；`reference/zcode-verbatim.md` §4 |
| 本机安装版 `C:\Program Files\ZCode\resources\glm\zcode.cjs` 被用户打过补丁，不得作为官方原文 | `reference/zcode-verbatim.md` 开头 |
| 官方原文权威源：pristine 3.15.1 副本 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3151\zcode.cjs`（MD5 `87225203a43f8009e403c57532922f4c`）；3.16.3 pristine 副本本地没有 | 同上 |
| 官方开源仓库 zai-org/ZCode，Apache-2.0 | `README.md` |
| 身份节组装、安全声明官方原文、Harness 节 | `reference/zcode-verbatim.md` |
| 八件套工具 schema 原文、deferred 声明段、SessionGuidance、Skills 引导段 | `reference/zcode-tool-schemas.md` |
| TodoWrite `priority` 为字符串三枚举 `high` / `medium` / `low` | `reference/zcode-capabilities.md` §11.3 |
| todo 提醒双阈值 10/10，GLM 启用 | `reference/zcode-capabilities.md` §4.2 |
| compact：默认窗口 200k，输出预留 min(maxOutputTokens, 21k)，autoCompact 阈值 166k；microcompact 公式 | `reference/zcode-capabilities.md` §11.2 |
| 默认 `max_tokens` 32000；thinking 启用时剥离采样参数 | `reference/zcode-capabilities.md` §10.1、§11.7 |
| effort：anthropic 通道 `output_config.effort` 五档词汇；GLM 实用三档 low / high / max | `reference/zcode-capabilities.md` §11.1；用户定案 |
| 记忆目录结构与 project-hash 算法 | `reference/zcode-capabilities.md` §10.6 |
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
| rc.3 桌面版在 `agent/created` 与 `agent/pre-step` 上：`agent.model.current()` 返回空对象；主会话 agent 的 `pre-step` 载荷 `modelSelection` 为空（会话标题 agent 有 provider） | 桌面方言排查记录（git 历史，`docs/legacy/desktop-dialect-triage.md`）〔实测〕 |
| 路由信息在 `system-prompt/assemble` 瀑布的 `variables.provider` / `variables.model` 中可见 | `src/glm-prompt/assembly.ts`〔实读〕 |
| 会话存储：`~/.dsh/sessions/<workspace-slug>/<session>/session.v4.jsonl.zstd`，多帧 zstd；`system/message` 事件含完整组装后的系统提示词 | 排查记录〔实测〕 |
| 桌面版完全重启才加载新的 dist，重开窗口不够 | 排查记录〔实测〕 |
| 桌面版 `dsh` 不在 PATH；headless 沙盒用 Electron 的 node 模式调用；`--profile desktop` 被拒绝 | `DEVELOPMENT.md` §3 |
| client-modules 一包一源约束 | `DESIGN.md` §2.3 |
| 静态包 client 半只拿到 `require` 模块表 | `DEVELOPMENT.md` §5 |
| `@deepseek-ai/schemastery` 在已安装的 profile bundle 中无法解析；插件管理器只把原生 Schemastery `Config` 导出投影成表单 | `README.md` |
| LSP 包只有跳转定义、查引用、查实现、悬停，没有诊断 | `reference/deepseek-harness/packages/lsp/*/package.json`〔实读〕 |
| Agent Team 为实验功能：Lead、具名队友、收件箱、持久任务 DAG，需持久会话存储；启用其整包会关闭普通 subagent 委派 | `experimental/agent-team*` README〔实读〕 |
| `tool-ralph`：每轮一个全新子 agent，只传有界结构化报告，工作区即长期记忆；报告不做独立验证 | `experimental/tool-ralph` README〔实读〕 |
| `user-approval`：一次性权限决定，默认失败即拒 | 包说明〔实读〕 |
| 已有包：`plan-mode`、`goal`、`goal-round-driver`、`schedule`、`workspace-changes`、`token-meter`、`session-stats`、`mcp-client`、`user-questions`、`tool-ask-user`、`action-cards`（实验）、`repeat-tool-reminder` | 包说明〔实读〕；接口未读 |
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
| 签名握手失败根因 | 无 | 对照 zcode-api 与 3.16.3 机制 |
| OutputStyle 风格列表 | 服务端下发 | 抓取 |
| 实跑 temperature / top_p 值 | 需实跑请求体 | 抓包 |
| start-plan 与 coding-plan 渠道差异（K9） | 无 | zcode-api 源码 |
| repeat-tool-reminder 文案与门控（K1） | 无 | DSH 源码 |
