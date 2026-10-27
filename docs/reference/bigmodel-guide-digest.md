# BigModel 文档站 guide 板块消化文档

> 状态：参考原文，2026-10-27 迁入本仓库（来源 `.llm/docs/bigmodel-guide-digest.md`，原样导入见提交 `f2e0b36`）。下文「本目录 `_bigmodel_md/`」现位于工作区 `.llm/docs/_bigmodel_md/`（不入库）。旧文档编号对应：01 → `zcode-capabilities.md`；02（工具 schema）→ `zcode-tool-schemas.md`；02（差异底账）→ `../DESIGN.md` §5.8；03 → `../DESIGN.md` 与 `../ORCHESTRATION.md`；04 → `../FACTS.md`；05 → `zcode-verbatim.md`。与 `../FACTS.md` 冲突时以 FACTS 为准。


> 来源：https://docs.bigmodel.cn 的 `cn/guide` 子树全量（37/37 页），按任务最高优先级补抓 guide 子树外的计费/套餐/错误码/限流 9 页（`cn/coding-plan`、`cn/api`、`cn/faq`，已单独标注）。
> 抓取方式：站点为 Mintlify，任意页面 URL 追加 `.md` 返回原始 Markdown；全量索引在 https://docs.bigmodel.cn/llms.txt 。原始快照存于本目录 `_bigmodel_md/`。
> 抓取时间：2026-10-27。所有端点、字段名、数值照抄原文，未做推断。

## 1. 页面清单

### 1.1 cn/guide 子树（37 页，全部已读 ✅，0 失败）

| # | URL | 标题 | 阅读深度 |
| - | --- | --- | - |
| 1 | https://docs.bigmodel.cn/cn/guide/start/introduction | 平台介绍 | 全读 |
| 2 | https://docs.bigmodel.cn/cn/guide/start/model-overview | 模型概览 | 全读 |
| 3 | https://docs.bigmodel.cn/cn/guide/start/pricing | API 定价 | 全读 |
| 4 | https://docs.bigmodel.cn/cn/guide/start/quick-start | 快速开始 | 全读 |
| 5 | https://docs.bigmodel.cn/cn/guide/start/concept-param | 核心参数 | 全读 |
| 6 | https://docs.bigmodel.cn/cn/guide/start/migrate-to-glm-new | 迁移至 GLM-5.3 | 全读 |
| 7 | https://docs.bigmodel.cn/cn/guide/develop/http/introduction | HTTP API 调用 | 全读 |
| 8 | https://docs.bigmodel.cn/cn/guide/develop/python/introduction | 官方 Python SDK | 速读（SDK 用法样板） |
| 9 | https://docs.bigmodel.cn/cn/guide/develop/java/introduction | 官方 Java SDK | 速读（SDK 用法样板） |
| 10 | https://docs.bigmodel.cn/cn/guide/develop/claude/introduction | Claude API 兼容 | 全读（高优先级） |
| 11 | https://docs.bigmodel.cn/cn/guide/develop/openai/introduction | OpenAI API 兼容 | 速读（端点抽取） |
| 12 | https://docs.bigmodel.cn/cn/guide/develop/responses/introduction | Response API 兼容 | 半读（端点+差异抽取） |
| 13 | https://docs.bigmodel.cn/cn/guide/develop/langchain/introduction | LangChain 集成 | 速读（端点抽取） |
| 14 | https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3 | GLM-5.3 | 全读 |
| 15 | https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2 | GLM-5.2 | 半读（规格+调用段全读） |
| 16 | https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash | GLM-5.3-Flash/FlashX（含 FlashX-Legal） | 半读（规格+接入段全读） |
| 17 | https://docs.bigmodel.cn/cn/guide/models/vlm/glm-ocr | GLM-OCR | 速读（端点抽取） |
| 18 | https://docs.bigmodel.cn/cn/guide/models/image-generation/glm-image | GLM-Image | 速读（端点+参数抽取） |
| 19 | https://docs.bigmodel.cn/cn/guide/capabilities/thinking | 深度思考 | 全读 |
| 20 | https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode | 思考模式 | 全读 |
| 21 | https://docs.bigmodel.cn/cn/guide/capabilities/streaming | 流式消息 | 速读（样板代码） |
| 22 | https://docs.bigmodel.cn/cn/guide/capabilities/stream-tool | 工具流式输出 | 速读（参数抽取） |
| 23 | https://docs.bigmodel.cn/cn/guide/capabilities/function-calling | 工具调用 | 速读（OpenAI tools 格式，无特殊事实） |
| 24 | https://docs.bigmodel.cn/cn/guide/capabilities/cache | 上下文缓存 | 半读（机制+计费字段抽取） |
| 25 | https://docs.bigmodel.cn/cn/guide/capabilities/struct-output | 结构化输出 | 要点抽取 |
| 26 | https://docs.bigmodel.cn/cn/guide/tools/web-search | 联网搜索 | 半读（参数+响应抽取） |
| 27 | https://docs.bigmodel.cn/cn/guide/tools/batch | 批量处理 | 要点抽取 |
| 28 | https://docs.bigmodel.cn/cn/guide/tools/file-parser | 异步解析 | 速读（端点抽取） |
| 29 | https://docs.bigmodel.cn/cn/guide/tools/file-parser-sync | 同步解析 | 速读（端点抽取） |
| 30 | https://docs.bigmodel.cn/cn/guide/tools/zhipu-ocr | OCR 服务 | 速读（端点抽取） |
| 31 | https://docs.bigmodel.cn/cn/guide/tools/knowledge/multimodal-retrieval | 知识处理及检索 | 速读 |
| 32 | https://docs.bigmodel.cn/cn/guide/tools/knowledge/price | 知识库服务计费 | 速读（价格在 pricing 页汇总） |
| 33 | https://docs.bigmodel.cn/cn/guide/tools/knowledge/contextual | 上下文增强技术报告 | 速读 |
| 34 | https://docs.bigmodel.cn/cn/guide/tools/knowledge/retrieval | 对话调用知识库 | 速读 |
| 35 | https://docs.bigmodel.cn/cn/guide/platform/equity-explain | 用户权益 | 全读 |
| 36 | https://docs.bigmodel.cn/cn/guide/platform/filing | 模型备案 | 半读 |
| 37 | https://docs.bigmodel.cn/cn/guide/platform/securityaudit | 内容安全 | 速读 |

注：guide 导航中存在 `tools/knowledge/q&a`（URL 含 `&`，经 Mintlify 转义），其内容即上表 31-34 的知识库系列；llms.txt 索引未单列。

### 1.2 补充页（guide 子树外，9 页，全部已读 ✅）

任务优先级最高的「计费/套餐/额度/福利/错误码/限流」实际都不在 guide 子树内，分布如下，已补抓：

| # | URL | 标题 | 状态 |
| - | --- | --- | - |
| S1 | https://docs.bigmodel.cn/cn/coding-plan/overview | 套餐概览（积分额度/抵扣系数） | ✅ 全读 |
| S2 | https://docs.bigmodel.cn/cn/coding-plan/quick-start | Coding Plan 快速开始（专属端点） | ✅ 全读 |
| S3 | https://docs.bigmodel.cn/cn/coding-plan/latest-model | 如何切换模型（Claude Code 配置） | ✅ 全读 |
| S4 | https://docs.bigmodel.cn/cn/coding-plan/notice/api-key-management | API Key 分类管理说明 | ✅ 全读 |
| S5 | https://docs.bigmodel.cn/cn/coding-plan/notice/usage-revision | 老用户权益说明（V1/V2 套餐） | ✅ 全读 |
| S6 | https://docs.bigmodel.cn/cn/coding-plan/faq | 套餐常见问题（体验卡/重置卡） | ✅ 全读 |
| S7 | https://docs.bigmodel.cn/cn/api/rate-limit | 速率限制 | ✅ 全读 |
| S8 | https://docs.bigmodel.cn/cn/faq/api-code | 错误码 | ✅ 全读 |
| S9 | https://docs.bigmodel.cn/cn/faq/user-rights | 用户权益 FAQ | ✅ 全读 |

### 1.3 未覆盖清单

- guide 子树：无未覆盖，无 403/404。
- 补充子树（存在于 llms.txt 但本次未抓，与 GLM-Hourness 关联较弱）：`cn/coding-plan` 其余页（usage-notes、team、tool/*、mcp/*、learning-resources/*、extension/*、transition）、`cn/managed-agents` 全部（其中 vaults.md 涉及 MCP OAuth 凭据管理，见第 3 章注记）、`cn/api/introduction`、`cn/faq` 其余页、`cn/best-practice`、`cn/terms`、`cn/update`、全部 api-reference 页。

## 2. 关键事实

### 2.1 认证方式

- **API Key 鉴权（主通道）**：请求头 `Authorization: Bearer YOUR_API_KEY`。Anthropic 兼容端点用 Anthropic 惯例头 `x-api-key: YOUR_API_KEY`。
- **JWT Token 鉴权（可选）**：API Key 形如 `{id}.{secret}`；用 PyJWT 生成 HS256 token，payload 为 `{"api_key": id, "exp": 毫秒, "timestamp": 毫秒}`，headers 为 `{"alg": "HS256", "sign_type": "SIGN"}`，secret 即 API Key 后半段。适合不暴露完整 Key 的场景。
- **无 OAuth**：模型 API 侧（paas/v4、anthropic、v1、coding/paas/v4）文档只描述 API Key/JWT 两种鉴权，没有任何 OAuth 授权码/设备码流程。OAuth 仅出现在智谱 Managed Agents 的 MCP OAuth Credential（vaults 体系，子树外）。
- **API Key 分类（2026-10-16 起）**：标准 API Key（`https://bigmodel.cn/usercenter/proj-mgmt/apikeys` 创建，走余额/资源包）、个人套餐 Key（`https://bigmodel.cn/apikey/coding-plan-per`）、团队套餐 Key（`https://bigmodel.cn/apikey/coding-plan-team`）三类互不通用；新 Key 用哪类额度由 Key 类型决定，与端点无关。历史 Key 密钥值不变、系统自动分类为团队/兼容/标准 Key；**兼容 Key 用哪类额度取决于调用端点**（见 2.2 表）。
- 实名认证：Batch API 强制实名；认证成功赠 500 万 tokens。

### 2.2 端点路由（Base URL 一字不差）

| 通道 | Base URL | 计费/额度归属 |
| --- | --- | --- |
| OpenAI Chat Completion（标准按量） | `https://open.bigmodel.cn/api/paas/v4` | 账户余额/资源包，不吃套餐 |
| OpenAI Chat Completion（Coding 套餐） | `https://open.bigmodel.cn/api/coding/paas/v4` | 套餐额度（Coding Plan 专属） |
| Anthropic Message 协议 | `https://open.bigmodel.cn/api/anthropic`（完整路径 `…/api/anthropic/v1/messages`） | 新 Key：由 Key 类型决定；历史兼容 Key：曾拥有套餐则吃套餐额度 |
| OpenAI Response 协议 | `https://open.bigmodel.cn/api/v1`（`…/api/v1/responses`） | 同上 |
| 工具 | batch: `…/api/paas/v4/batches`；文件解析: `…/api/paas/v4/files/parser/create`、`…/files/parser/sync`、`…/files/parser/result/{taskIid}/{format_type}`；OCR: `…/api/paas/v4/files/ocr`；文档版式解析: `…/api/paas/v4/layout_parsing`；图像生成: `…/api/paas/v4/images/generations` | 按量 |
| 搜索 MCP 代理 | `https://open.bigmodel.cn/api/mcp-broker/proxy/web-search/mcp?Authorization=Your Zhipu API Key` | 按次 |

- Codex 走 `https://open.bigmodel.cn/api/v1`；Claude Code / Goose 走 anthropic 端点；其余 OpenAI 兼容工具走 `https://open.bigmodel.cn/api/coding/paas/v4`。
- GLM-5.3 页警告：**订阅过 Coding Plan（含已过期）的账号暂时只能通过 OpenAI Chat Completion 协议调 GLM-5.3 模型 API**（官方称近期迭代，抓取日仍有效）。
- Response API 差异：默认 `store=false`；流式结束不发 `data: [DONE]`；无 cancel；响应 id 有效期 7 天；请求超时 7200 秒。

### 2.3 Anthropic 兼容端点细节

- base_url 替换为 `https://open.bigmodel.cn/api/anthropic`，`x-api-key` 头，`model` 用智谱编码（如 `glm-5.3`/`glm-5.2`），其余 Anthropic SDK 代码不动。官方文档明确「某些场景下仍存在差异，但不影响整体兼容性」，未列出差异明细。
- Claude Code 切模型：`%USERPROFILE%\.claude\settings.json` 的 `env` 段写 `ANTHROPIC_DEFAULT_HAIKU/SONNET/OPUS_MODEL`（如 `glm-5.3-flash[1m]`）+ `CLAUDE_CODE_AUTO_COMPACT_WINDOW: "1000000"`。**模型名后缀 `[1m]` 是开启 1M 上下文的开关**；Claude Code 不识别该后缀时需升级 Claude Code。
- 思考强度映射（Anthropic/Claude Code 侧官方表）：`thinking.type` 未传/true/enabled/adaptive→`max`；false/disabled/none/off→`low`（仍轻量思考，不报错）；`reasoning_effort` 为 minimal/light/low→`low`，medium/high→`high`，xhigh/max/ultra→`max`，未知串回退 `max` 并记录提示。优先级：显式 Effort > thinking 开关 > 默认 max。Claude Code 用 `thinking.type`、`output_config.effort`；Codex 用 `reasoning.effort`。
- 会话内 `/effort` 命令切换思考强度，默认 max。

### 2.4 模型目录（窗口/输出/思考）

旗舰与主力文本/多模态（model code 全小写）：

| model code | 上下文 | 最大输出 | 思考 | 输入模态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `glm-5.3` | 1M | 128K | 强制 enabled；`reasoning_effort`: `low`/`high`/`max`（默认 max） | 文本 | 传 `thinking.type:"disabled"` 直接报错 |
| `glm-5.3-flash` | 1M | 128K | 同上强制思考 | 图片、视频、文件、文本 | 320B 总参/18B 激活；Coding Plan 内额度为 glm-5.3 的 3 倍 |
| `glm-5.3-flashx` | 1M | 128K | 同上 | 同上 | 200 tokens/s；Coding Plan 暂未开放 |
| `glm-5.3-flashx-legal` | 1M | 128K | 同上 | 同上 | 企业定向开放，需申请 |
| `glm-5.2` | 1M | 128K | enabled 默认自动判断，可 disabled；`reasoning_effort` 支持 `max`(默认)/`xhigh`/`high`/`medium`/`low`/`minimal`/`none`（none/minimal 放弃思考；low/medium 映射 high；xhigh 映射 max） | 文本 | |
| `glm-5.1` | 200K | 128K | 支持 thinking | 文本 | API 侧旧模型，套餐内自动切 glm-5.3 |
| `glm-5` / `glm-5-turbo` | 200K | 128K | 支持 | 文本 | 套餐内自动切 glm-5.3-flash |
| `glm-5v-turbo` | 200K | 128K | 支持 | 视觉+文本 | 多模态 Coding 基座 |
| `glm-4.7` / `glm-4.7-flash` / `glm-4.7-flashx` | 200K | 128K | glm-4.7 强制思考 | 文本 | glm-4.7-flash 免费 |
| `glm-4.6` / `glm-4.6v` | 200K | 128K（4.6v 32K） | 混合自动 | 文本/视觉 | |
| `glm-4.5` 系列 | 128K | 96K（4.5v 16K） | 4.5 及以上支持 thinking | | |
| `glm-ocr` | 单图 ≤10MB / PDF ≤50MB / ≤100 页 | — | — | 图/文档 | `layout_parsing` 端点 |
| `glm-image` | — | — | — | 文本 | `size` 如 `1280x1280`，自定义 512-2048px 且 32 倍数 |

`max_tokens` 默认/上限：glm-5.x / glm-4.7 / glm-4.6 系默认 65536、上限 131072；glm-4.6v 系 16384/32768；glm-4.5 系 65536/98304；glm-4.5v 16384/16384。

思考相关字段（Chat Completion 协议）：
- `thinking: {"type": "enabled"|"disabled", "clear_thinking": false}`。`clear_thinking: false` 开启「保留式思考（Preserved Thinking）」——把 assistant 历史 `reasoning_content` 原样回传可提高缓存命中率与效果；**Coding Plan 端点默认开启，标准 API 端点默认关闭**。glm-5.3-flash 官方建议 `thinking.clear_thinking: false`。
- 交错式思考（Interleaved）自 GLM-4.5 起默认支持；使用工具时必须保留并回传 `reasoning_content`。
- 流式响应 `delta.reasoning_content` 为思考流，`delta.content` 为正文流；usage 在最后一个 chunk。
- 采样推荐：`temperature: 1.0`、`top_p: 0.95` 二选一调参；glm-5.3-flash 建议同时开 `stream: true` 与 `tool_stream: true`。
- 结构化输出：`response_format: {"type": "json_object"}`。
- 上下文缓存：隐式自动，重复前缀建议 ≥500 token 才易命中；命中量看 `usage.prompt_tokens_details.cached_tokens`；缓存存储限时免费。

### 2.5 计费与套餐

**按量定价（元/百万 tokens，输入/输出）**：GLM-5.3 = 8/28；GLM-5.3-Flash = 0.8/2.8；GLM-5.3-FlashX = 2/7；GLM-5.2 = 8/28；GLM-5.1 分档 6/24（<32K 输入）与 8/28（≥32K）；GLM-5 / 5-Turbo 同样 32K 分档；GLM-4.7-Flash 免费；缓存命中价为输入价 1/4（如 5.3 为 2）；缓存存储限时免费。GLM-Image 0.1 元/次；搜索工具 Search-Std 0.01、Search-Pro 0.03、Search-Pro-Sogou/Quark 0.05 元/次；Batch API 5 折。Token:汉字 ≈ 1:1.6。

**GLM Coding Plan（个人版，积分制）**：
- 档位：Lite 2,000 积分/5h + 10,000/周；Pro 12,000/5h + 60,000/周；Max 28,000/5h + 140,000/周。V2 参考价：Lite 49 / Pro 149 / Max 469 元每月（包季 9 折、包年 8 折）。
- 积分计算：`（输入 Token × Input 系数 + 缓存命中 Token × Cached 系数 + 输出 Token × Output 系数）/ 10000`。系数：GLM-5.3 = 6.9/1.7/24；GLM-5.3-Flash（含视觉理解 MCP）= 2.3/0.56/8；MCP 工具（联网搜索/网页读取/开源仓库）= 每次调用 × 1.2。
- 高峰时段 = 周一至周五 14:00-18:00（UTC+8）；**非高峰（含周末全天）按 50% 积分抵扣**。
- 5 小时额度为动态刷新（消耗起点计 5h）；周额度自下单起 7 天周期；升级立即刷新额度、续费不重置。额度耗尽不落余额扣费，等周期恢复。
- 仅限官方指定工具（ZCode、AutoClaw、Claude Code、Codex、OpenCode、WorkBuddy、Cursor、Kilo Code、Cherry Studio、Cline 等）+ 正确 Base URL 才吃套餐额度；ZCode 与 AutoClaw 标注 1.5 倍用量。OpenClaw（本插件项目形态同类）为次级调度、尽力交付、动态排队限流。
- 历史 V2 套餐系数备查：GLM-5.3 非高峰 1 倍/高峰 3 倍；GLM-5.3-Flash 非高峰 0.4 倍/高峰 1.2 倍。
- 团队版：席位制，历史套餐 5h/周 token 上限表在 usage-revision 页；团队超额付费可配置。

**用户权益（按量侧并发等级）**：消耗现金余额/购买资源包 1:1 得积分；V0 [0,2000)、V1 [2,000,10,000)、V2 [10,000,50,000)、V3 ≥50,000；T+1 日 06:00 更新，按近三个月最高积分定当月等级；等级只影响并发。赠金消耗不计积分。

**福利/发放机制（「鸡蛋」对应物）**：
- 体验卡：每张 2,000 积分，可用 GLM-5.3 / GLM-5.3-Flash，用完即止；领取入口在个人编程套餐页。
- 额度重置卡：活动期发放，分 5 小时重置与周重置两种；周卡使用时 5h 额度同步回满且不占 5h 重置次数；使用后刷新周期从使用时刻重算；每张有独立有效期；在套餐用量统计页面查看/使用。
- 实名认证赠 500 万 tokens（Batch API 入口）。
- 免费模型常驻：glm-4.7-flash、glm-4.5-flash、glm-4-flash-250414、glm-4.6v-flash、glm-4.1v-thinking-flash、glm-4v-flash、CogView-3-Flash、CogVideoX-Flash 等。
- 扣费顺序：赠金余额 → 现金余额 → 绑定的第三方支付。套餐不支持退款；取消自动续费需提前至少 3 天。

### 2.6 限流与错误码

限流形态是**并发数**（同一时刻处理中请求数），按模型×账户权益等级（按量）或套餐等级（Coding Plan，Max>Pro>Lite，低峰动态上浮）限制；速率查看页 `https://bigmodel.cn/usercenter/proj-mgmt/rate-limits`；按量用户可申请提额（10 个工作日审核），Coding Plan 不可申请。工作负载建议：Lite 单项目、Pro 1-2、Max 2+ 并发项目。

业务错误码（HTTP + body 内 code）关键项：1000/1001/1003/1005 = 401 鉴权失败族；1113 = 429 欠费；1210-1215 = 400 参数族；1211 模型不存在；1261 Prompt 超长；1301 内容安全；1302 = 429 账户级限流；1305 = 429 平台过载；1308 = 429 达到用量上限（`${next_flush_time}` 重置）；1309 = 429 Coding Plan 已到期；1310 周/月上限；1311 套餐未开放该模型；1313 公平使用策略限频（可申请解除）；1314 企业套餐失效；1315 Key 与产品类型不匹配（企业编程套餐场景）；1316-1321 = 团队/子账号各类上限+超额付费不可用组合。错误体形如 `{"error":{"code":"1001","message":"…"}}`；SSE 中途异常不返错误码而是体现在 `finish_reason`。

## 3. 对 GLM-Hourness 的启示（映射 dsh-llm-glm）

前提：DSH（DeepSeek Harness）内置 Anthropic 兼容客户端形态（Claude Code 同源）。以下按模块映射。

1. **端点路由：双渠道三端点矩阵**
   - bigmodel 按量渠道：Chat `https://open.bigmodel.cn/api/paas/v4`；startplan（Coding Plan）渠道：Chat `https://open.bigmodel.cn/api/coding/paas/v4`。**两者都是 OpenAI Chat Completion 协议**，可直接复用同一个 OpenAI 兼容 adapter，只切 base_url 与 Key。
   - Anthropic 兼容端点 `https://open.bigmodel.cn/api/anthropic` 是给 Claude Code 原生工具用的；对 DSH 这类「自带 Anthropic 形态客户端」的宿主，走 `/api/anthropic`（`x-api-key` 头）可零改造接入；但注意 2.2 的警告：**曾订阅过 Coding Plan 的账号在模型 API 上暂只能用 Chat Completion 协议**，因此 dsh-llm-glm 的稳健默认应是 OpenAI Chat 通道（`coding/paas/v4` 或 `paas/v4`），anthropic 通道作为第二选项。
   - 历史兼容 Key 的额度归属由端点决定（anthropic/v1/coding 端点→吃套餐；paas/v4→吃余额），新 Key 由 Key 类型决定。渠道选择逻辑要提示用户「Key 类型 × 端点」双因子，避免 FAQ 1113 类工单（买了套餐却扣余额是最常见事故）。
2. **身份头/签名**
   - 无需任何 OAuth 工程：`Authorization: Bearer <api_key>` 即全通；Anthropic 通道换 `x-api-key`。若做 OAuth Vault，可支持 JWT(HS256, sign_type=SIGN) 签名模式作为「不落完整 Key」的变体——payload/headers 结构见 2.1，实现成本一段代码。
   - Key 管理建议在 provider 配置里区分 keyClass（standard/personal-plan/team-plan），并在 UI 上阻止「标准 Key + coding 端点」这类白扣费组合。
3. **模型目录**
   - 推荐目录：`glm-5.3`（默认，reasoning 强制开、effort max）、`glm-5.3-flash`（多模态+套餐 3 倍额度）、`glm-5.2`（唯一可 disabled 思考的旗舰，轻量轮次 fallback）。上下文 1M 需模型名后缀 `[1m]`（Anthropic 通道约定；Chat 通道直接 1M）。max_tokens 默认给 65536 合理。
   - 请求翻译层必须处理：宿主若发 `thinking.type:"disabled"`，对 glm-5.3 系要改写为 `enabled`+`reasoning_effort:"low"`，否则 400；reasoning_effort 归一化直接抄 2.3 官方映射表。回传历史时保留 `reasoning_content` 并设 `clear_thinking:false`（对齐 Coding Plan 默认行为，提缓存命中）。多轮工具循环需原样回传 `reasoning_content`。
   - 流式：`delta.reasoning_content` 与 `delta.content` 双流；`tool_stream:true` 建议随 `stream:true` 开启；usage 在末 chunk。
4. **计费/额度**
   - 双渠道计费模型完全不同：按量 = 元/百万 token 三段价（输入/缓存命中/输出）；startplan = 积分制（系数表 2.5），且非高峰 5 折。额度恢复语义（5h 动态刷新+周周期）意味着「额度查询」要做时间感知展示；错误码 1308/1310/1316-1321 的 `next_flush_time` 是可直接展示的恢复时间，dsh-llm-glm 应解析并透出。
   - 1313（公平使用限频）与 OpenClaw 的「次级调度」提示：DSH 若不在官方指定工具清单内，用套餐端点存在被 1313 限频或视为超范围使用的风险；工程上应准备 paas/v4 按量兜底与自动降级。
5. **鸡蛋（福利）直接领取的可行性**
   - 文档侧证据：体验卡（2,000 积分）与额度重置卡均为「控制台页面领取/使用」型权益（入口 `bigmodel.cn/coding-plan/personal/*`、用量统计页），**没有公开的领取 API**；自动领取只能走控制台 Web 会话（Cookie/登录态）模拟，属于账号自动化操作，无官方接口背书。实名赠 500 万 tokens 同理（认证流程本身是实名提交，不适合脚本）。
   - 可行的零风险替代：目录内置免费模型（glm-4.7-flash 等）作为「无额度可用」兜底；监听 1308/1113 错误码提示用户去控制台领卡。若一定要做「领取」，建议只做「检测+跳转链接」而非自动操作。
6. **杂项**
   - 官网体验中心不吃套餐额度（调试时别用它验证套餐）。
   - Codex 通道用 `/api/v1`（Response 协议），如果 DSH 未来接 Responses 形态需注意 `store=false` 默认、无 `[DONE]`、7200s 超时。
   - 搜索/网页读取/开源仓库 MCP（套餐内含，系数 1.2/次）可作为 DSH 工具层补给，MCP 代理 URL 见 2.2。

## 附：原始快照索引

- 全量索引：`.llm/docs/_bigmodel_md/_llms.txt`
- guide 37 页 + 补充 9 页 Markdown 原文：`.llm/docs/_bigmodel_md/cn__*.md`（文件名 = URL 路径斜线替换为 `__`）
- 抓取脚本：`.llm/docs/_fetch_bigmodel.py`、`.llm/docs/_crawl_bigmodel.py`、`.llm/docs/_fetch_extra.py`
