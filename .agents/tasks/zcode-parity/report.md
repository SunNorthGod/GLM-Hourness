# ZCode 3.16.3 与 bundle 编码套餐路线请求差异调查

状态：完成。摘要见 §0。

只读调查。基线：GLM-Hourness main a12d319；ZCode 3.16.3 pristine CLI 包
`C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3163\zcode.cjs.pristine`（下称 CLI 包，`@N` 为 UTF-8 字符偏移，已用 `/api/paas/c1f3a7e2` @3823635 与 m1-signing 报告对齐）；
同目录 `app.asar`（3.16.3 桌面壳，pristine 副本，只在内存里读归档内文件，`asar:<路径>+N` 为该文件内的字节偏移）。
开源 3.16.2 树 `reference/ZCode` 只用于组装顺序与内置目录（`config/provider/zcode-builtin.json`，revision 33）。
未发任何网络请求，未读凭据文件或任何鉴权值，未接触 DSH 桌面端、ZCode 安装目录与 `~/.dsh`、`~/.zcode`。

证据标注：〔实读〕代码已读；〔实测〕2026-10-28 截包（`.agents/tasks/m1-signing/network-verify.md`）；〔推断〕由代码推出、无截包。

## 0. 摘要

- **渠道载体已对齐**：bundle 与 3.16.3 的 coding-plan 模型请求走同一上游 `https://open.bigmodel.cn/api/anthropic/v1/messages`，经 `agent/configs` 映射改写到 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages`，带同一 `X-ZCode-Authorization: Bearer <zcodeJwt>`，带同构且被 ultra 网关接受的 V4 签名块，带同一套 ZCode 身份头（`X-ZCode-Agent: glm`、`X-ZCode-App-Version: 3.16.3` 等）〔实测 2026-10-28〕。
- **唯一最可能影响加成的差异**：模型请求的凭证类型。3.16.3 账号模式用**项目令牌 PAT**（`token_use: project_access` 的 JWT）填 `Authorization` 与 `x-api-key`，套餐额度也用 PAT 查；bundle 用**裸 apiKey** `{apiKeyId}.{secret}`（`headers.ts` `buildAuthHeaders`）。bundle 已经铸造 PAT，但只喂给签名，没用于模型请求认证。
- **150% 在客户端只是一条界面文案**，由服务端 `client/configs` 的 `codingPlanBillingDiscount` 下发（渲染层 i18n「150% 配额活动」，挂在购买/升级入口）。客户端不计算、不上报倍率。服务端按什么判定加成（凭证类型、渠道、签名、还是订阅购买渠道）从代码读不出〔推断〕。「做成和 ZCode 一样就能吃 150%」这一前提须实测验证。
- **次要差异**（影响小或与归属无关）：UA 尾段（bundle `ai-sdk/anthropic/3.0.81` vs 3.16.3 `ai-sdk/provider-utils/4.0.27 runtime/node.js/...`）、`X-Title`（bundle `Z Code@cli` vs 桌面 `Z Code@electron`）、缺 `x-query-id` / 每请求随机 `x-zcode-trace-id` / 缺 `x-zcode-query-source`、请求体 `model` 大小写、不发 `thinking`/`output_config`、system 单块无断点、`max_tokens` 不裁剪。
- **关不掉的差异**：`metadata.user_id` 的 device_id、PAT 的 apiKeyId、会话 id 等值类字段（环境产生，结构已一致）；`X-Title=electron`（会谎报形态，须用户拍板）；标题请求时机与提示词（DSH 控制）。
- **建议**：先用 PAT 只读查 `quota/limit` 量现状（§3.3）；若未拿到加成，再把模型请求凭证改为 PAT 并去掉 secret（§5.1、§5.2，改计费归属，须用户确认 + L4 验证）；指纹与请求体对齐（§5.3、§5.4）低成本可同批做。
- 本次**未抓 3.16.3 桌面流量**；标〔实测〕的只有 2026-10-28 的 bundle 沙盒截包。服务端判定一律〔推断〕。

## 1. 模型请求（coding-plan 路线，bigmodel 个人套餐，账号模式）

### 1.1 3.16.3 的组装链（桌面版）

桌面版以 `zcode.cjs app-server --stdio` 起 agent 进程，模型请求由 CLI 包发出；账号模式的请求凭证由桌面壳（`asar:out/host/index.js`）每次请求前经 `interaction/requestProviderRuntimeHeaders` 下发。

| 步 | 3.16.3 位置 | 内容 |
| --- | --- | --- |
| 1 | `createProviderRuntimeHeadersPort`（`cfi` @14817299） | 每个模型请求 attempt 前向桌面壳要 `{headersApplied, requestAuth:{apiKey, apiKeyId, accountScope, headers}}`（schema `ann` @870363） |
| 2 | 桌面壳 `AccountProviderRequestAuthService.resolveCurrent`（`asar:out/host/index.js+1200102` 起） | `individual-coding-plan`：`loadIndividualPlanMaterial` → `ProjectAccessTokenClient`，返回 `{apiKey: material.token（项目令牌 PAT）, apiKeyId, accountScope}`；`start-plan` 才返回 zcode JWT |
| 3 | `applyModelRequestAuth`（`x5s` @3843063） | 对 `zhipu-account`：先删掉配置头里的 `authorization` / `x-api-key`（`withoutModelAuthHeaders` `PQr`），`apiKey := requestAuth.apiKey`，再并入 `requestAuth.headers` |
| 4 | `toAiSdkProviderConfig`（`k5s` @3842560） | `zhipu-account` 没有静态 apiKey；baseURL 取目录 `api.baseUrl` |
| 5 | `captureModelSnapshot`（@3850860 附近） | 配置头 = `defaultHeaders`（`buildCliZCodeSourceHeaders` `Suc` @14423045）合并 `api.headers` |
| 6 | `createFactory`（@3851919） | 路由 fetch `Ngn` → 签名 fetch `protectTransport` → 业务错误 fetch `E5s` → 选项映射 fetch `TQr`（`createModelOptionMapFetch` @3836714）；Anthropic 分支 `sgn({apiKey, baseURL: normalizeAnthropicBaseURL(baseURL), headers: withAnthropicAuthorizationHeader(apiKey, headers)})` |
| 7 | `withAnthropicAuthorizationHeader`（`T5s` @3843231） | 没有 `Authorization` 时加 `Authorization: Bearer <apiKey>`，放在最前 |
| 8 | AI SDK `createAnthropic.getHeaders`（`sgn` @3569500） | `withUserAgentSuffix({"anthropic-version":"2023-06-01","x-api-key":apiKey,...headers}, "ai-sdk/anthropic/3.0.81")` |
| 9 | 调用级头（`Goo`/`Joo` @4104130） | `headers: {...withoutModelQuerySourceHeader(e_n(resolved.headers, toolSearchEnabled)), ...createModelRequestAttributionHeaders(statusContext)}`；`resolved.headers` 又是一份身份头 |
| 10 | AI SDK `postToApi`（`SZr` @3540599，provider-utils 4.0.27 `mZr` @3530239） | `headers: withUserAgentSuffix({"Content-Type":"application/json", ...合并头}, "ai-sdk/provider-utils/4.0.27", getRuntimeEnvironmentUserAgent())` |
| 11 | `TQr` | 把请求体 JSON.parse，按模型目录的 `optionSpecs` 映射做 JSON merge patch（`applyOrderedJsonMergePatches` `Jpr` @547136），再 JSON.stringify |

`withUserAgentSuffix`（`Y2` @3510311）把头先按小写键归一（后写的覆盖先写的），再 `Object.fromEntries(new Headers(...).entries())`：输出键全部小写、按字母序。第 10 步时配置头里的 `user-agent: ZCode/3.16.3 ai-sdk/anthropic/3.0.81` 被调用级的 `User-Agent: ZCode/3.16.3` 覆盖，再追加 provider-utils 与 runtime 两段〔实读，结果为推断〕。

### 1.2 逐字段对照

「bundle」列以 `src/glm-llm/` 现行代码为准，线上名称与顺序取自 2026-10-28 截包〔实测〕。

| 字段 | ZCode 3.16.3 | bundle | 结论 |
| --- | --- | --- | --- |
| 路由前 URL | `normalizeAnthropicBaseURL("https://open.bigmodel.cn/api/anthropic")` + `/messages` = `https://open.bigmodel.cn/api/anthropic/v1/messages`（`C5s` @3843405；baseURL 来自内置目录 `account:bigmodel-individual-coding-plan`，开源 r33 `zcode-builtin.json`；3.16.3 CLI 包里没有该字面量，目录由桌面壳 Bundled/Active release 下发，`asar:out/host/index.js+113476`） | `BIGMODEL_ANTHROPIC_BASE + '/v1/messages'`（`zcode.ts:38,236`） | 相同 |
| 路由后 URL | 映射表 `/api/v1/agent/configs` 改写为 `https://zcode.z.ai/api/v1/ultra/anthropic/v1/messages` | 同一映射，同一结果〔实测〕 | 相同 |
| 方法 | POST | POST | 相同 |
| `Authorization` | `Bearer <PAT>`（步 3、7） | `Bearer <apiKey>`，apiKey 为 `{apiKeyId}.{secret}`（`headers.ts` `buildAuthHeaders`，`credentialString`）〔实测：Bearer / id.secret〕 | **不同**：凭证类型不同 |
| `x-api-key` | `<PAT>`（步 8，AI SDK 用 apiKey 填） | `<apiKey>` | **不同** |
| `anthropic-version` | `2023-06-01` | `2023-06-01` | 相同 |
| `anthropic-beta` | 仅 `toolSearchEnabled` 时加 `advanced-tool-use-2025-11-20`（`e_n`、`fOr` @1502476）；账号模式 coding-plan 的 `defaultEnabled` 为真（`poo` @4074177），实际取决于会话的工具检索开关（FACTS：桌面默认 `off`） | 不发 | 默认相同；ZCode 开了工具检索才不同 |
| `content-type` | `application/json` | `application/json` | 相同 |
| `user-agent` | `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 runtime/node.js/<process.version>`〔推断，见 1.1 末〕 | `ZCode/3.16.3 ai-sdk/anthropic/3.0.81`（`headers.ts` `ANTHROPIC_SDK_UA`） | **不同**；runtime 段的 Node 版本只能截包确定 |
| `http-referer` | `https://zcode.z.ai`（`Kk(env)`） | `https://zcode.z.ai` | 相同 |
| `x-zcode-app-version` | 环境变量 `ZCODE_APP_VERSION`（桌面壳注入）否则 appVersion（`wuc` @14423045 附近） | `3.16.3` 常量 | 值预期相同；桌面实值未截包 |
| `x-title` | `Z Code@electron`（`kuc`：进程参数含 `app-server` 时为 electron） | `Z Code@cli`（`identity.ts` `DEFAULT_IDENTITY.sourceTitle`，DESIGN §4.2 用户 2026-10-27 定案保留） | **不同**（相对桌面版）；与 ZCode CLI 相同 |
| `x-release-channel` | `DF(env)`（production） | `production` | 相同 |
| `x-client-language` / `x-client-timezone` | `Intl` locale / timeZone | 同 | 相同 |
| `x-zcode-agent` | `glm` | `glm` | 相同 |
| `x-platform` / `x-os-category` / `x-os-version` | `process.platform-arch`、`windows`、`os.release()`（`Xli` @14421840） | 同（`identity.ts` `buildLlmIdentityHeaders`） | 相同 |
| `x-device-mid` | 模型请求不带 | 不带 | 相同 |
| `x-request-id` | 每请求 `crypto.randomUUID()`（`Gdt` @4067436） | 每请求 `randomUUID()` | 相同 |
| `x-zcode-session-type` | 主步 `main`，子代理 `subagent`，其余 `other`（`Y0n`） | 主步 `main`，带 `purpose` 的为 `other`；子代理会话也是 `main`（`headers.ts` `requestAttribution`） | 子代理不同 |
| `x-zcode-trace-id` | `traceContext.traceId`，子上下文继承父的 traceId（`Lw` @1422054），同一回合内各请求同值〔推断〕；格式 UUID（`iG`） | 每请求新 UUID | **不同** |
| `x-query-id` | 每回合一个：`queryId ?? inputId ?? query_<uuid>`，去掉 `query_` 前缀（`hae` @12815957、`GWs`）；回合内所有请求（含该回合的标题请求）同值 | 不发（`requestAttribution` 不给 queryId） | **不同**（m1-cache-flash 已报） |
| `x-zcode-query-source` | 每个请求都带：主步 `main_turn`、子代理 `subagent`、工作流子任务 `workflow_child`（`mDn` @13260037；主步 trace 属性 `querySource:f` @13321115），压缩 `compact`（@13389086），会话标题 `session_title`（`v2n` @13069774）。值经 trace 属性进入请求 metadata（`Gdt`），由 `createModelRequestAttributionHeaders` 写头；`withoutModelQuerySourceHeader` 只从 provider 配置头里删它 | 不发 | **不同** |
| `x-session-id` | 会话 id 去掉 `sess_` / `subagent_agent_` 前缀（`Hdt`）；在签名块里 | DSH 会话 id 去掉 `session-` 前缀；在签名块里 | 结构相同，值域不同（无法也无需相同） |
| 签名块 | `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Session-Id, X-Client-Nonce, X-App-Id, X-Client-Pow`；`X-Client-Version` 取请求头 `X-ZCode-App-Version`，缺省为常量 `B1`（`protectTransport` @3833810） | 同名同序〔实测〕；`X-Client-Version` = `identity.appVersion` | 结构相同；签名材料不同（见下行） |
| 签名所用 apiKeyId | PAT 的 `api_key` 声明（`requestAuth.apiKeyId`，`resolveSnapshot` 把它作为路由 `apiKeyId` 传入） | 铸造 PAT 后用 PAT 解析出的 apiKeyId；失败退回 `{id}.{secret}` 的 id | 成功时相同 |
| 签名覆盖的头 | 业务签名串 `{apiKeyId}\n{ts}\n{clientVersion}\n{sessionId}\n{nonce}`，只覆盖这五个值；不覆盖 URL、正文与其他头（m1-signing §1.4） | 同 | 相同 |
| `x-zcode-authorization` | 映射项带 `zcodeAuthorizationHeader` 时由路由 fetch 追加 `Bearer <zcodeJwt>`，在签名块之后 | 同，最后一个头〔实测〕 | 相同 |
| 头的线上顺序与大小写 | AI SDK 输出已是小写字母序；签名器（`zrt` 重建 `Headers` 后 `set` 签名头）、路由（`routedRequestInit` `f5s` @3839971 用 `new Headers(init.headers)` 复制后 `set` `X-ZCode-Authorization`）、undici `new Request` 每一跳都从 `Headers` 迭代器重建，而该迭代器按名排序并给出小写名。最终应为全部小写、整体字母序〔推断，依据 undici `Headers` 语义，未截包〕 | 普通对象的插入序：`HTTP-Referer, User-Agent, X-ZCode-App-Version, X-Title, …, x-api-key, authorization, anthropic-version, content-type, 签名块, X-ZCode-Authorization`〔实测名称与顺序；大小写按 undici 保留原样推断〕 | **不同**（顺序、大小写） |
| 请求体键序 | `model, max_tokens, metadata, system, messages, tools, stream, thinking, output_config`（AI SDK `getArgs` @3603306 的构造序；未定义键被 JSON.stringify 丢弃；`thinking`、`output_config` 由 `TQr` merge patch 追加在末尾，`max_tokens` 原位改写） | `model, max_tokens, stream, messages, system, tools, metadata`（`anthropic.ts` `encodeRequest`） | **不同** |
| `model` | `GLM-5.3` / `GLM-5.3-Flash`（目录 `builtinModelIds`；账号 provider 的模型 id 经 `normalizeOfficialGlmModelId` 规范为大写形式，`GZt` @526349 附近） | `glm-5.3` / `glm-5.3-flash`（`models.ts` `GLM_MODELS`，DSH 选中的 id 原样发） | **不同**（大小写） |
| `max_tokens` | 主步 `min(模型上限, contextWindow − 估算用量 − 1000)`（`resolveModelStepMaxOutputTokens` `aUo` @13216108，基线 `VZ` = 模型上限，缺省 32000 `Yja`）；r33 目录 GLM-5.3 上限 128000、上下文 1,000,000，通常为 128000；辅助请求（标题等）`min(5000, 上限)`（`auxiliaryModelOptions` `PP` @7759001） | DSH 给的 `maxTokens`，缺省 32000（`anthropic.ts`；`models.ts` `GLM_DEFAULT_MAX_TOKENS`） | **不同** |
| `stream` | 主步 `true`；标题请求走 `generateText`，不带 `stream` | 一律 `true` | 标题请求不同 |
| `thinking` | `{"type":"enabled"}`（r33 目录 `modelApiRules` `.*glm-5\.3.*`，模型匹配不区分大小写 `wYt` @557708，Flash 同样命中） | 不发（`anthropic.ts` 文件头「the real client sends no thinking field」与目录不符） | **不同** |
| `output_config` | `{"effort": <reasoningLevel>}`，档位 `low/high/max`；主步取会话选中的档位，辅助请求取 `values[0]` 即 `low` | 不发；DSH 的 effort 选择在线上丢失 | **不同** |
| `temperature` | 不发（thinking 启用时 AI SDK 剥离） | DSH 给了才发 | 一般相同 |
| `metadata.user_id` | `JSON.stringify({device_id, account_uuid:"", session_id})`，device_id 读 `~/.zcode/v2/telemetry-state.json` 的 `deviceMid`（`ZWs` @4073127、`ensureCliDeviceMid` `Qro` @4062052） | 同形，device_id 为 bundle 自生成的 `<home>/device-mid.txt` | 结构相同；**device_id 值不同**（只有 ZCode 本机知道） |
| `system` | 至多三块：`cli_prefix`「You are ZCode, an interactive coding agent」无断点；stable 段带 `cache_control: ephemeral`；dynamic 段以 `\n\n` 开头带断点（`assembleSystemMessages` @5057700 附近；子代理两块都带断点 @12772400 附近） | 一块，无断点（`zcode.ts` coding-plan 分支）；start-plan 才是三块 | **不同**（m1-cache-flash 已报） |
| 消息断点 | 最后一条非 system 消息带断点，AI SDK 落到该消息的最后一块（`finalizeLatestNonSystemMessageCacheControl` `kLa` @12972299） | 最后一条消息的最后一块（`markLastMessage`） | 相同 |
| `tools` | `{name, description, input_schema}`；ZCode 对每个函数工具显式 `eagerInputStreaming:false`（`EVs` @4101481），不出 `eager_input_streaming`；`cache_control` 未设置被丢弃 | `{name, description, input_schema}` | 形状相同；工具集合本身由 DSH 与方言决定，不在通道范围 |
| `tool_choice` | 未设置时不发 | 不发 | 相同 |
| 原生 WebSearch | `open.bigmodel.cn` 的站点规则 `supportsNativeWebSearch: true`；会话工具集含 provider-native WebSearch 时编码为 `web_search_20260209`（`AVs` @4101481 附近） | 无 | 视工具集而定 |

### 1.3 会话标题请求

| 项 | ZCode 3.16.3 | bundle（DSH 发起） |
| --- | --- | --- |
| 时机 | 回合开始时以 `deferIfProviderRuntimeHeadersRefresh:true` 尝试（@13367458）；账号模式要刷新运行时头（`O4a` 为真），于是推迟到首个回合 `TurnComplete` 之后才发（`ke&&re&&DBo.call(...)` @13370403）。不与第 1 步并发 | DSH 在第 1 步同时发出，并发〔实测：标题与 main-1 相差 17 ms〕 |
| 请求 | `generateText`：非流式；`system` 为标题提示词 `y4a`，`user` 为首条输入截到 1200 字符；`tools: []`；`max_tokens` 5000；reasoning `low`（`v4a` @13066475、`PP`） | DSH 自己的标题提示词，流式，`max_tokens` 由 DSH 给 |
| 头 | 同一会话 id；`x-zcode-session-type: other`；`x-zcode-query-source: session_title`；`x-query-id` 为该回合的 queryId | 同一会话 id；`other`；无 query source、无 query id |

这一项属于 DSH 的行为，通道只能改头和正文，改不了时机与提示词。

## 2. 握手、项目令牌铸造、端点路由配置

### 2.1 签名握手

| 项 | ZCode 3.16.3 | bundle |
| --- | --- | --- |
| URL | `new URL("/api/paas/c1f3a7e2/v2/client", <provider baseURL 的 origin>)` = `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`（`ZUs` @3823123、`GUs` @3823630） | 同〔实测 200〕 |
| 传输 | 经路由 fetch（签名器的 transport 是路由 fetch） | `routedHandshake` 经同一路由〔实测：映射表不改写握手〕 |
| 方法与超时 | POST，`redirect:"manual"`，10 s | 同 |
| 头 | `Authorization: <原样凭证>`、`Content-Type: application/json`（`performHandshake` @3829991） | 同〔实测 raw / jwt〕 |
| 凭证 | 账号模式的 apiKey 就是 PAT（JWT 形式，`handshakeField: accessToken`） | 铸造出的 PAT（JWT 形式）〔实测字段 `accessToken, nonce, sig, ts`〕 |
| 体 | `{accessToken, nonce, sig, ts}`，HMAC 规则见 m1-signing §1.4 | 同 |
| 私钥缓存 | 按（apiKey=PAT，握手 origin）进程级，无 TTL；VERIFY 拒绝才作废；PAT 续签即换 key，重新握手 | 按（origin，`credential.apiKey`）缓存（`signing.ts` `stateKey`）；新铸 PAT 时 `invalidateState` 清掉私钥。键不同，效果相同：PAT 一换两边都重新握手 |
| 失败 | 不缓存，每个可签名请求重试 | 60 s 冷却（DESIGN §4.3 已记为偏离） |

### 2.2 项目令牌（PAT）

桌面版的 PAT 由桌面壳铸造（`ProjectAccessTokenClient`，`asar:out/host/chunk-5YNPFY3L.js+855365`；CLI 包同构实现 `sge` @1080099–1087700），bundle 由 `signing.ts` `mintProjectJwt` 铸造。

| 项 | ZCode 3.16.3 | bundle |
| --- | --- | --- |
| 客户信息 | `GET https://bigmodel.cn/api/biz/customer/getCustomerInfo`，`{Authorization: <OAuth 访问令牌原样>, Content-Type: application/json}` | 同（`signing.ts` `mintProjectJwt`） |
| 机构/项目选择 | 桌面 `personalProjectSelection: "default"`：不过滤 `projectType`，取名含「默认机构」/「默认项目」者，否则第一个（`#n` @1085931 附近） | 铸造时先滤掉 `projectType === '2'` 再按同一规则选（`signing.ts`）；登录时（`resolver.ts`）不滤。账号有 type 2 项目时可能选到不同项目 |
| 定位缓存 | 机构、项目、apiKeyId 写入持久 `locationStore`（键 `project-key-location:v1:…`），之后不再查客户信息与 key 列表；404 时删掉定位 | 每个进程首次铸造都查一次客户信息；apiKeyId 取凭证里 `{id}.{secret}` 的 id |
| key 定位 | `GET …/organization/{org}/projects/{proj}/api_keys`（个人 `Authorization` 原样），按名 `zcode-api-key` 找；找不到就 `POST {name:"zcode-api-key", usageScene: 1}`（`ige.CODING_PLAN` @1079051） | 铸造不查列表；登录时（`resolver.ts` `findOrCreateApiKey`）找不到就 `POST {name:"zcode-api-key"}`，**没有 `usageScene`**（只影响由 bundle 新建 key 的账号） |
| key 密钥 | 不取。CLI 包与桌面壳里都没有 `api_keys/copy` | 登录时 `GET …/api_keys/copy/{apiKey}` 取 secret，存 `{apiKey}.{secret}`，模型请求用它。**3.16.3 账号模式根本不碰 secret** |
| 铸造请求 | `POST …/api_keys/{apiKeyId}/access_tokens`，`{Authorization: Bearer <OAuth 令牌>, Content-Type}`，体 `{clientType:"zcode", clientVersion:"3.16.3"}`（桌面壳 `ri="3.16.3"` @759261；CLI 包 `B1 = __ZCODE_VERSION__ ?? "0.0.0-dev"` @630004，CLI 文本里没有替换，独立 CLI 会发 `0.0.0-dev`） | 同头；体 `{clientType:'zcode', clientVersion: identity.appVersion}` = `3.16.3`，与桌面版相同 |
| 响应 | 接受 `code` ∈ {200, 0, "200", "0"}；`data` 缺 `enable` 时视为 true；`enable:false` 抛 `project_token_disabled`；有效期 `min(expiresAt, now+expiresIn)` | 只认 `code === 200`；不看 `enable`；有效期取 JWT `exp` |
| 缓存 | 到期前 120 s 再减 0–60 s 随机抖动时刷新；429/5xx/网络错误时旧令牌未过期就继续用，5 s 后再试；模型请求报 PAT 被拒时刷新一次重试（`Model PAT rejected; refreshing once before retry` @4145678） | 到期前 5 分钟刷新；失败冷却 60 s；没有「PAT 被拒刷新重试」 |
| 超时 | 15 s（桌面 `x_e=15e3`） | 15 s |

### 2.3 端点路由配置 `/api/v1/agent/configs`

| 项 | ZCode 3.16.3（`ProviderEndpointRoutingService` @4199746 附近，`buildConfigHeaders` `FGs` @4196232） | bundle（`endpoint-routing.ts` `refresh`） |
| --- | --- | --- |
| URL | `GET https://zcode.z.ai/api/v1/agent/configs`，无查询串 | 同 |
| 头 | `User-Agent: ZCode/<ver>`、`X-ZCode-App-Version`、来源头白名单（`HTTP-Referer, User-Agent, X-Client-Language, X-Client-Timezone, X-Device-Mid, X-Os-Category, X-Os-Version, X-Platform, X-Release-Channel, X-Title, X-ZCode-App-Version`，桌面 `X-Title: Z Code@electron`），**`x-api-key-id: <PAT 的 apiKeyId>`**，`Accept: application/json` | 上下文身份头（含 `X-Device-Mid`，`X-Title: Z Code@cli`）+ `Accept` + **`x-api-key: <完整 {id}.{secret}>`** |
| 结论 | — | **不同**：ZCode 只发 key id，bundle 把带 secret 的完整 key 发给 `zcode.z.ai`。这也是一处多余的凭证暴露 |
| 缓存 | 成功 300 s，失败冷却 30 s，超时 3 s，响应上限 256 KiB | 300 s / 30 s / 3 s |
| 解析 | `code === 0`；`proxyEndpoint.mapping`（≤256 项，`from/to` 只许纯 https，`zcodeAuthorizationHeader` 只许 `/api/v1/ultra*` 目标） | 同；另读 `configs.captcha` |
| `X-ZCode-Authorization` | 读凭据库里的 zcode JWT（`lv.zcodeJwtToken`），加 `Bearer ` | `credential.jwt`，加 `Bearer `（相同） |

另有一个 bundle 不发的请求：桌面壳每小时拉一次 `GET https://zcode.z.ai/api/v1/client/configs?app_version=3.16.3&platform=win32-x64`（`getClientConfigs` `asar:out/host/index.js+1160323`，`bRe` +1150899，缓存 `RRe` 1 h），其中 `data.configs.codingPlanBillingDiscount` 就是 150% 活动的界面文案（见 §3）。这是界面配置，不参与模型请求。

## 3. 套餐额度与 150% 的来源

### 3.1 3.16.3 怎么取额度

桌面壳 `BigModelUsageQuotaProvider`（`asar:out/host/index.js+1280250` 起）：

| 请求 | URL（个人版） | 认证 | 用途 |
| --- | --- | --- | --- |
| 额度 | `GET https://bigmodel.cn/api/monitor/usage/quota/limit`（`ZAe`，基址 `buildBigModelApiUrl`；可被 `ZCODE_BIGMODEL_USAGE_QUOTA_URL` 覆盖） | `authorization: <PAT>`，原样不加 Bearer（`createBigModelUsageHeaders` `Pl` +1295748；凭证来自 `resolveCurrent({reason:"usage"})`） | 5 小时 / 周额度 |
| 积分明细 | `GET /api/monitor/credit-usage/usage-detail?type=1&startTime=…&endTime=…&usageType=MODEL`（及 `MCP`） | 同 | 按模型的积分与命中率 |
| 活跃度 | `GET /api/monitor/credit-usage/activity?type=1&…` | 同 | 热力图 |
| 模型/工具用量 | `GET /api/monitor/usage/model-usage`、`/tool-usage`、`/model-performance-day` | 同 | 统计页 |
| 订阅 | `GET https://bigmodel.cn/api/biz/subscription/list` | OAuth 令牌 | 套餐名、周期、到期 |

额度响应被解析为 `{level, limits:[{type, unit, number, usage, currentValue, remaining, percentage, nextResetTime, usageDetails:[{modelCode, displayName, usage}]}]}`（`normalizeLimits` `zM` +1268200 附近）；成功判定 `success !== false && code ∈ {null, 0, 200}`（`QM` +1297015）。主显示取 `type === "TIME_LIMIT"` 那一项（`pickPrimaryLimit` `YY`）。积分明细的 `summary` 有 `totalCredits.value`、`cacheHitRate.value`（`WY`）。

客户端解析里没有任何倍率、加成、渠道字段：CLI 包里 `bonus`、`multiplier`、`1.5`、`150%` 与套餐无关；桌面壳 host/main 也没有。

### 3.2 150% 出现在哪里

- 唯一的字符串：渲染层 i18n `settings.modelProvider.codingPlan.billingDiscountInfo.open` = 「查看 150% 配额活动说明」/「View 150% quota campaign details」（`asar:out/renderer/assets/IntlProvider-Bw7hoRlp.js+168598`、+585591）。
- 它所在的组件只在服务端下发活动配置时显示：`billingDiscountActive` / `billingDiscountConfig`（徽标、卡片、说明的正文按语言下发，`jB`/`MB`/`NB`，`asar:out/renderer/assets/styles-CQuzX8si.js+2758741`），挂在套餐「升级」按钮上（`LUn` +6106688）和额度耗尽横幅上（`O1t` +3645216）。配置来源是 `client/configs` 的 `data.configs.codingPlanBillingDiscount`（`unwrapClientConfigBillingDiscount` `ZRe`，`asar:out/host/index.js+1169528`）。
- 同一服务的购买预览请求带 `salesChannel: "zcode"`（`preview`，+1155508 附近）。

由此能确定的只有：客户端把 150% 当作一项服务端开关的「配额活动」来展示，挂在购买/升级入口上；客户端本身不计算、不上报任何倍率。BigModel 文档只写「ZCode（1.5倍用量）」（`.llm/docs/_bigmodel_md/cn__coding-plan__quick-start.md:40`），没有说明机制；`docs.bigmodel.cn/cn/coding-plan/tool/zcode.md` 本地没有存档，本次没有联网。150% 由服务端按什么判定（请求的渠道、凭证类型、客户端签名，还是订阅的购买渠道）从客户端代码里读不出来〔推断边界〕。

### 3.3 怎样量出加成是否生效

用同一个只读接口在请求前后各取一次额度，用 usage journal 里的 token 数换算期望积分：

1. 读 `GET https://bigmodel.cn/api/monitor/usage/quota/limit`（`authorization: <PAT>`）的 `level` 与各项 `number`/`usage`/`currentValue`/`percentage`。先只对照一次：`number`（上限）若正好是档位表（FACTS §2.4：Lite 2,000 / Pro 12,000 / Max 28,000 每 5 小时）的 1.5 倍，说明加成落在账号上限上，与请求形态无关。
2. 若上限是原值：发一组固定请求（同一提示词、固定 token 数），在 `credit-usage/usage-detail` 的 `totalCredits` 与 `quota/limit` 的 `usage` 上看扣减，与 FACTS §2.4 公式（GLM-5.3：输入 6.9 / 命中 1.7 / 输出 24 每万 token，非高峰减半）算出的值比。扣减约为公式值 ÷ 1.5 即加成生效。
3. 改动前后各跑一次，同一时段（高峰与非高峰系数不同）。

额度接口本身由桌面壳调用，PAT 需要按 §2.2 铸造；bundle 现有的 `mintProjectJwt` 能拿到。只读，但仍是一次网络请求，需要编排方授权。

## 4. 哪些差异可能影响套餐归属或 150% 加成（按可能性排序）

客户端代码里读不到服务端如何判定加成（§3.2），以下全部是推理，证据强弱已标明。排序依据：越贴近「服务端用来判定来源/计费」的字段越靠前。

1. **Authorization / x-api-key 的凭证类型（apiKey vs PAT）** — 最可能。3.16.3 账号模式模型请求的 `Authorization` 与 `x-api-key` 都是项目令牌 PAT（`sk-...` 之外的、带 `token_use: project_access` 的 JWT）；bundle 发的是裸 apiKey `{apiKeyId}.{secret}`。套餐额度（`quota/limit`）在 3.16.3 里也是拿 PAT 去查的。若服务端按「调用所用凭证是不是项目令牌」判定套餐归属与倍率，这是唯一可能直接改变结果的差异。2026-10-28 ultra 网关接受了 bundle 的 apiKey 签名请求并正常计费〔实测〕，但 usage journal 看不到套餐扣减，是否按 1.5 倍计无法判定〔推断〕。证据：`AccountProviderRequestAuthService.resolveCurrent`（`asar:out/host/index.js+1200102`）、`headers.ts` `buildAuthHeaders`。
2. **端点路由与 `X-ZCode-Authorization`** — 次高。真正决定「走不走 ZCode 渠道」的是请求落到 `zcode.z.ai/api/v1/ultra/...`（由 `agent/configs` 映射改写），并携带 `X-ZCode-Authorization: Bearer <zcodeJwt>`。bundle 与 3.16.3 在这两点上一致〔实测〕，所以这一环大概率已经正确；列出是因为它是渠道归属的实际载体，一旦映射或 zcodeJwt 缺失，加成必然丢。
3. **签名 V4 是否通过** — 中。coding-plan 请求带 V4 签名块；3.16.3 用 PAT 的 apiKeyId 签，bundle 也用铸造出的 PAT 的 apiKeyId 签（成功时与 3.16.3 相同）。网关 2026-10-28 接受了签名、无 401 VERIFY〔实测〕。若加成要求签名有效，这一环目前是通的；风险在握手失败冷却期内会无签发送（§2.1 偏离），那些请求若不被计入加成，是一个可观测的回归点。
4. **`User-Agent` 尾段、`X-ZCode-App-Version`、`X-Title`** — 低偏中。bundle 的 UA 尾段是 `ai-sdk/anthropic/3.0.81`，3.16.3 是 `ai-sdk/provider-utils/4.0.27 runtime/node.js/...`（§1.2）；`X-Title` bundle 为 `Z Code@cli`、桌面为 `Z Code@electron`。这些是「客户端指纹」，服务端可能用它们做渠道白名单（FACTS §2.3「官方指定工具 + 正确 Base URL」）。但 `X-ZCode-App-Version: 3.16.3`、`X-ZCode-Agent: glm` 都一致，且加成的权威载体更可能是 2 与 1，所以列为中低。
5. **`x-query-id` / `x-zcode-trace-id` / `x-zcode-query-source` 缺失或不同** — 低。这些是归因/追踪头，3.16.3 每请求带 query id、回合内 trace id 稳定、带 query source，bundle 都不带或每请求随机（§1.2）。更像统计维度而非计费维度；对加成的影响最小，但它们是 ZCode 指纹的一部分，补齐成本低。
6. **请求体形态（model 大小写、thinking/output_config、system 分块、max_tokens、键序）** — 低。这些改变的是模型行为与缓存命中，不改变「这是不是 ZCode 渠道」。`model` 大小写（`glm-5.3` vs `GLM-5.3`）理论上可能影响服务端按模型匹配计费系数，但同一模型两种写法都在 BigModel 文档出现，风险低〔推断〕。

一句话判断：真正值得先验证的是第 1 项（PAT vs apiKey）。2、3 已与 3.16.3 对齐；4、5 是低成本的指纹补齐；6 与加成无关。

## 5. 把 coding-plan 请求对齐 3.16.3 的改动清单

每项标注 verbatim-known（代码即可确定）或 needs-capture（要真机抓包确认）。与加成直接相关的是 §5.1。

### 5.1 模型请求用项目令牌，而非 apiKey（verbatim-known 方向，needs-capture 验证）

- 现状：`headers.ts` `buildAuthHeaders` 对 coding-plan 把 `credentialString(cred)`（apiKey）同时填进 `x-api-key` 和 `Authorization: Bearer`。签名层另外铸造 PAT（`mintProjectJwt`）但只用于签名。
- 改为：coding-plan 的 `x-api-key` 与 `Authorization` 都用 PAT。PAT 已在 `ClientSigningManager.resolveParsedCredential` 里铸造并缓存，但当前只喂给签名；需要把它暴露给 `ZcodeAdapter.stream`，在发送前替换这两个头的值。
- 涉及文件/函数：`src/glm-llm/signing.ts`（新增取当前 PAT 的只读方法，或让 `sendWithClientSigning` 回传所用 PAT）、`src/glm-llm/zcode.ts`（`stream` 里用 PAT 覆盖 `x-api-key`/`authorization`）、`src/glm-llm/headers.ts`（`buildAuthHeaders` 接受可选 PAT 覆盖）。
- 风险与顺序：铸造可能失败（无 OAuth 令牌、网关拒绝）。失败时按 3.16.3 的账号模式本应 fail-closed（`ModelRequestAuthMissing`），但 bundle 的产品形态是尽量不中断；保守做法是铸造失败时退回当前 apiKey 行为并上报，保持现有可用性。这改变了用户可见的计费归属（目的就是拿加成），属于「需用户确认的行为变化」。
- 验证：needs-capture。L4 截包确认模型请求 `Authorization`/`x-api-key` 为 PAT；配合 §3.3 的额度对照确认扣减口径。单测：`buildAuthHeaders` 给定 PAT 覆盖时两个头都是 PAT；`stream` 在 PAT 可用/不可用两条路径下的头取值。

### 5.2 不发 secret：登录与 configs 都不带 `{apiKey}.{secret}` 的 secret（verbatim-known）

- 3.16.3 账号模式从不取 key 的 copy secret，模型请求也从不用 secret；凭证只需 OAuth 令牌 + 铸造出的 PAT。bundle 的 `resolver.ts` 取 secret 存进 `{apiKey}.{secret}`，并在 `endpoint-routing.ts` 把这串完整 key 作为 `x-api-key` 发给 `zcode.z.ai`（§2.3）。
- 改为：如果 §5.1 落地（模型请求用 PAT），secret 就只剩签名凭证解析的退路。可去掉 `getSecretKey` 的调用，`agent/configs` 改发 `x-api-key-id`（PAT 的 apiKeyId）而非完整 key，和 3.16.3 的 `buildConfigHeaders` 一致。
- 涉及文件：`src/glm-llm/auth/resolver.ts`（删 `getSecretKey`）、`src/glm-llm/endpoint-routing.ts`（`refresh` 的头从 `x-api-key` 改 `x-api-key-id`，值取 PAT 的 apiKeyId）。
- 验证：needs-capture（configs 请求头）。单测：configs fetch 带 `x-api-key-id`、不带 `x-api-key`。注意这改动与签名凭证解析耦合——若去掉 secret，`parseSigningCredentialForm` 对 `{id}.{secret}` 的那条退路失效，必须确保 PAT 铸造可靠或保留退路。建议与 §5.1 同批、且先过 L4。

### 5.3 请求体对齐（verbatim-known）

- `model`：按目标 provider 规范为 ZCode 的大小写（`GLM-5.3`/`GLM-5.3-Flash`）。改 `anthropic.ts` `encodeRequest` 或在 `zcode.ts` 组装前映射。
- `thinking` + `output_config`：按模型与 effort 发 `thinking:{type:"enabled"}` 与 `output_config:{effort:<low|high|max>}`（GLM-5.3 系的目录规则，§1.2）。effort 取 DSH 的 `reasoningEffort`（`GenerateOptions.reasoningEffort`，已在 `models.ts` 暴露三档），缺省 `high`（DESIGN §4.6）。`anthropic.ts` 文件头注释「the real client sends no thinking field」与 3.16.3 目录矛盾，需改。
- `max_tokens`：3.16.3 主步按上下文剩余裁剪（§1.2），bundle 用 DSH 给的值。对齐成本高、收益低（不影响归属），建议不动，只在报告记为已知差异。
- 键序与 `stream` 位置：JSON 键序不影响服务端解析，不必对齐；仅在要做字节级指纹时才改。
- 涉及文件：`src/glm-llm/anthropic.ts`（`encodeRequest` 增 `thinking`/`output_config`、model 规范化）、`src/glm-llm/models.ts`（effort→值映射）。
- 验证：verbatim-known。单测：`encodeRequest` 对 `glm-5.3` 高/中/低 effort 产出对应 `thinking`/`output_config`，model 规范为大写。无需真机。

### 5.4 指纹头补齐（verbatim-known）

- `User-Agent` 尾段：改为 `ai-sdk/provider-utils/4.0.27` + `runtime/node.js/<process.version>`（`headers.ts` `ANTHROPIC_SDK_UA`）。runtime 段的精确格式 needs-capture 确认（3.16.3 真实 UA 未截包），但构造规则 verbatim-known（`Y2`/`$ut` @3510311）。
- `x-query-id`：每回合一个、回合内（含标题请求）稳定。DSH 没有回合级标识直接可用；可用 `sessionId + turn 计数` 或在适配器内按会话缓存一个，退而求其次每请求一个（弱于 3.16.3）。`headers.ts` `buildTraceHeaders`/`requestAttribution` 增 queryId。
- `x-zcode-trace-id`：回合内稳定而非每请求随机（同上，需要回合标识）。
- `x-zcode-query-source`：主步 `main_turn`，`purpose==='compaction'`→`compact`，`purpose==='session-title'`→`session_title`，子代理 `subagent`（DSH 的 purpose 只有 compaction/session-title，子代理信息不在 `GenerateOptions` 里，这项只能部分对齐）。
- `x-zcode-session-type`：子代理应为 `subagent`——但 `GenerateOptions` 不提供子代理标志（只有 `purpose`），无法从通道区分主会话与子代理会话，这项补不全。
- 涉及文件：`src/glm-llm/headers.ts`、`src/glm-llm/identity.ts`。
- 验证：UA 为 verbatim-known 单测；query-source 映射单测；trace/query id 回合内稳定性单测。

### 5.5 从 bundle 关不掉的差异

- `metadata.user_id` 的 `device_id`、`X-ZCode-App-Version` 的真实注入值、PAT 的 apiKeyId、`x-session-id` 的会话 id：这些是**值**，由各自环境产生，无法也不必与 ZCode 本机相同。只有结构需要一致，结构已一致。
- `X-Title: Z Code@electron`：桌面版的值由进程参数决定；bundle 以 DSH 插件身份运行，发 `cli` 是用户 2026-10-27 的定案。若 L4 证明加成看 `X-Title`，再考虑改为 `electron`——但那会谎报运行形态，需用户拍板。
- 标题请求的时机（3.16.3 推迟、bundle 并发）与提示词：由 DSH 控制，通道改不了。
- `max_tokens` 的上下文裁剪：DSH 自己算 max tokens，通道只透传。

### 5.6 怎样安全地取一次真实 3.16.3 capture

本次未抓 3.16.3 桌面流量。安全做法（留给获授权的后续步，且另一个 run 正用桌面时不可做）：

- 在 bundle 已有的 headless 沙盒 fetch-tap（`.agents/tasks/m1-signing/` 的一次性 tap 脚本）基础上，另起一个只读 tap，记录 URL、方法、头名称与顺序、`Authorization`/`x-api-key` 的形式（raw/Bearer、jwt/id.secret）与请求体顶层键名，**不记任何值**。
- ZCode 侧：不改 ZCode 安装、不碰 `~/.dsh`；若要抓 ZCode 自身流量，应在一台不干扰当前 run 的机器或另一时间窗，用系统代理或 mitm 只看头名与形状，同样不记值。
- 优先用 bundle 沙盒的对照（同账号、同模型、bundle 改前/改后），比直接抓 ZCode 更安全，也足以验证 §5.1–5.4 是否生效。

## 6. 结论与建议

结论：bundle 的 coding-plan 请求与 3.16.3 在**渠道载体**上已经一致——同一上游 URL、同一端点路由改写到 ultra、同一 `X-ZCode-Authorization`、同构且被网关接受的 V4 签名、同样的 ZCode 身份头集合（`X-ZCode-Agent: glm`、`X-ZCode-App-Version: 3.16.3` 等）。真正没对齐、且最可能决定 150% 的是**模型请求所用凭证的类型**：3.16.3 账号模式用项目令牌 PAT 填 `Authorization` 与 `x-api-key`，bundle 用裸 apiKey（`{id}.{secret}`）。其次是若干客户端指纹（UA 尾段、`X-Title`、query/trace id、query source）与请求体形态（model 大小写、thinking/output_config），这些影响较小或与归属无关。

150% 在客户端只以一条界面文案存在（`settings.modelProvider.codingPlan.billingDiscountInfo` = 「150% 配额活动」），由服务端 `client/configs` 下发，挂在购买/升级入口上；客户端不计算、不上报任何倍率，无法从代码判定服务端按什么给加成。因此「改成和 ZCode 一样就能吃到 150%」这个前提本身需要实测验证，不能仅凭代码断定。

建议，按顺序：

1. 先量现状（§3.3）：用 PAT 读 `quota/limit`，看上限是否已是档位表的 1.5 倍、固定请求的扣减是否约为公式值 ÷ 1.5。这一步只读，决定后面要不要改。
2. 若现状未拿到加成：落地 §5.1（模型请求用 PAT）+ §5.2（去 secret、configs 发 key-id），这是与 3.16.3 差异最大、最可能相关的一处。因为它改变计费归属（用户可见），实现前向用户确认，L4 截包 + 额度对照验证。
3. 低成本指纹补齐（§5.3 的 thinking/output_config、§5.4 的 UA/query-source）可同批做，不单独阻塞；它们不改归属，但让请求更像 ZCode，降低被降级的风险（FACTS §2.3）。
4. §5.5 的值类差异与 `X-Title` 保持现状，除非 L4 明确指向它们。

本报告只做调查，未改任何代码（只写本文件）。所有结论要么来自实读（CLI 包 `@偏移`、asar `asar:文件+偏移`、`src/glm-llm/`、开源目录），要么来自 2026-10-28 的既有截包〔实测〕，服务端判定机制一律标为〔推断〕。



