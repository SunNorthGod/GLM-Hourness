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
| 3.16.3 的 `X-Title` 来源标题：agent 进程参数含 `app-server` / `agent-server` 时为 `electron`，否则为 `cli`；桌面版以 `app-server --stdio` 启动 agent 进程。端点路由配置请求的来源头另由桌面 agent 传 `sourceTitle: "electron"`，来源头构造的缺省值也是 `electron` | 3.16.3 pristine 包 `detectDefaultProviderSourceTitle`（`kuc` @14423244）、模型请求身份头 `Suc` @14422777、配置请求来源头 `Frn` @968479（缺省 `electron`）与 `_5e(...)` @15096557〔实读 2026-10-28〕 |
| 3.16.3 的签名 `clientVersion` 与项目令牌 `clientVersion` 共用常量 `__ZCODE_VERSION__`（构建期注入，安装包文本中未替换）；`X-ZCode-App-Version` 取自环境变量 `ZCODE_APP_VERSION` | 安装包〔实读〕；实际取值未验证 |
| 官方原文权威源：pristine 3.15.1 副本 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3151\zcode.cjs`（MD5 `87225203a43f8009e403c57532922f4c`）；3.16.3 pristine 副本 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3163\zcode.cjs.pristine`（15,242,397 字节，MD5 `51257C0D11DA7DC56C157D92E7048146`），与安装前备份 `C:\Program Files\ZCode\resources\glm\zcode.cjs.orig-3163.bak` 同 MD5；判断未经修改的依据只有文件名与这份备份，未与官方发布哈希比对。本表的「@数字」是这份 3.16.3 副本按 UTF-8 读入后的字符偏移，指向符号的声明处 | `zcode-patch` 目录〔实读 2026-10-28〕 |
| 3.16.3 签名握手 URL 为 `new URL('/api/paas/c1f3a7e2/v2/client', <provider baseURL 的 origin>)`，baseURL 的路径丢弃；bigmodel coding-plan 为 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`，z.ai 为 `https://api.z.ai/api/paas/c1f3a7e2/v2/client`（z.ai 的 baseURL 按源码路由表推断）。签名 fetch 包在端点路由 fetch 外面：签名器看到路由前的 URL，握手也经路由 fetch 发出 | 3.16.3 pristine 包 `resolveHandshakeUrl`（`ZUs` @3823123）、握手路径常量 `GUs` @3823630、`ClientRequestSigningV4Signer`（`Pgn` @3825391）、`protectTransport` @3833810、`createFactory` @3851919〔实读 2026-10-28〕；源码 `model-execution.ts` 283–301 行、`packages/desktop/wdio.conf.ts` 的握手夹具；`DESIGN.md` §4.3 |
| `c1f3a7e2` 是字面常量：3.15.1、3.15.2、3.15.3、3.16.1、3.16.2、3.16.3 的 pristine 包里各出现一次，在签名模块常量区，没有拼接或哈希 | `zcode-patch/pristine-*/zcode.cjs.pristine`〔实读 2026-10-28〕 |
| 3.16.3 握手：`Authorization` 是原样凭证（`{apiKeyId}.{secret}` 或 project_access JWT，都不加 `Bearer `），请求体 `{apiKey 或 accessToken, nonce, sig, ts}`，超时 10 秒；3.15.1 相同。业务拒绝（信封 `code` 不是 200）的 `msg` 只在匹配 `^HANDSHAKE_[A-Z_]+$` 时记为 reason；`handshake_failed` 观测只带 `errorKind`、`httpStatus`、`businessCode`、`reason`，不带错误消息 | 3.16.3 pristine 包 `performHandshake` @3829991、reason 过滤函数 `N1r` @1089432、`ensurePrivateKey` 的 `handshake_failed` 观测〔实读 2026-10-28〕；BigModel 握手端点接受原样 JWT 形式（HTTP 200，返回 `privateCipher`；`Bearer` 形式未试）〔实测 2026-10-28，沙盒真实网络运行 `net-1793188413414`，`DESIGN.md` §4.3〕 |
| 3.16.3 不缓存握手失败：网络错误、超时、非 200、业务拒绝都放行为无签发送，不留负缓存、没有退避，下一个可签名请求立即再握手，只有并发请求共享进行中的握手。私钥按（apiKey, 握手 origin）进程级缓存，没有 TTL，401 VERIFY 拒绝才作废 | 3.16.3 pristine 包 `ensurePrivateKey` @3829024、`getKeyOrSendUnsigned` @3827749、`ClientRequestSigningV4KeyCache`（`Xut` @3824083）〔实读 2026-10-28〕 |
| 3.16.3 只对标记 `failOpenEligible` 的错误放行（握手的网络、超时、协议、服务端、业务错误）；凭证解析失败与请求缺 `X-Session-Id`（`invalid-config`）、PoW 或 Ed25519 签名失败（`cryptography`）、握手进行中 epoch 变化或签名器已 dispose（`disposed`）不放行，请求抛错 | 3.16.3 pristine 包 `getKeyOrSendUnsigned` @3827749、`ClientRequestSigningV4Error`〔实读 2026-10-28〕 |
| 3.16.3 两次 VERIFY 拒绝后的旁路是签名器实例字段，只对当前签名器代有效；生产路径每次 `createFactory` 都换一个签名器，旁路因此只管一次请求 | 3.16.3 pristine 包 `bypassSigning` @3827229、`resolveSigner` @3825013〔实读 2026-10-28〕；`createFactory` 的调用频率按源码 `runner.ts` 251–285 行推断 |
| 3.16.3 的 deviceMid：存在 `<base>/.zcode/v2/telemetry-state.json` 的 `deviceMid`，`<base>` 为去空白后非空的 `ZCODE_DATA_BASE_DIR`，否则为主目录（`~`、`~/` 展开，其余 `resolve`）。`metadata.user_id` 只对 anthropic 类 provider 生成，为 `JSON.stringify({device_id, account_uuid: "", session_id})`；deviceMid 缺失时生成 UUID，在 `telemetry-state.lock` 锁内重读后原子写回（临时文件加 `rename`，锁陈旧阈值 300 秒，重试 200 次、每次 10 毫秒），任何失败都用本进程生成的值；按状态文件路径缓存 promise。配置请求的 `X-Device-Mid` 另行只读：路径不展开 `~`，值去空白、须为可打印 ASCII，只缓存成功的读取 | 3.16.3 pristine 包 `ensureCliDeviceMid`（`Qro` @4062043）、`CWs` @4062252、`EWs` @4062442、`too` @4062778、`PWs` @4062889、`RWs` @4063231、`NWs` @4064238、常量 @4064600、`ZWs` @4073127、`Ydt` @4073238、`Juc` @14468783、`Kuc` @14468898〔实读 2026-10-28〕 |
| 3.16.3 账号模式（`zhipu-account`）的模型请求凭证：每次尝试前向桌面壳取请求凭证；个人套餐为项目令牌（PAT）与其 `apiKeyId`。CLI 把它设为 provider 的 `apiKey`（AI SDK Anthropic provider 发 `x-api-key`），删掉配置头里的 `authorization`、`x-api-key`，再补 `Authorization: Bearer <PAT>`；签名器用同一个令牌 | 3.16.3 pristine 包 `refreshBeforeModelRequest` @14817299、`PQr` @3841940、`x5s` @3843063、`T5s` @3843231、AI SDK `createAnthropic`（`sgn` @3569529）的 `getHeaders`（使用处 @3570073）、`protectTransport` @3833810；桌面 `app.asar` `out/host/index.js` `AccountProviderRequestAuthService.resolveCurrent`（+1200545）〔实读 2026-10-28〕 |
| 3.16.3 账号模式拿不到请求凭证时请求失败，不退回别的凭证：CLI 抛 `ModelRequestAuthMissing`（`Account model request auth is unavailable: <provider>/<model>`），刷新失败包成不可重试的 `RuntimeHeadersRefreshError`；桌面壳的原因原文为 `Account request credential is unavailable: bigmodel`（无 OAuth 令牌）、`Account request credential is unavailable: <providerId>`（无账号身份）或 `project_token_*` 错误码；渲染层不翻译这些消息 | 3.16.3 pristine 包 @4193871 附近、`xpt` @4146619、`wie` @4147581；桌面 `out/host/index.js` +1200545、+441792、+443132、+510627；`IntlProvider-Bw7hoRlp.js`、`styles-CQuzX8si.js` 检索为 0〔实读 2026-10-28〕 |
| 3.16.3 `ProjectAccessTokenClient`：OAuth 令牌原样调 `getCustomerInfo`；个人套餐滤掉 `projectType "2"` 的项目，取「默认机构」/「默认项目」否则第一个；按名 `zcode-api-key` 找 key，没有就 `POST {name, usageScene: 1}`；`POST …/access_tokens` 以 `Bearer <OAuth>` 铸造，体 `{clientType: "zcode", clientVersion}`；成功码 `200|0|"200"|"0"`；缺 `enable` 视为启用；有效期 `min(expiresAt·1000, 开始 + expiresIn·1000)`，到期前 120 秒减随机 0–60 秒刷新；暂态失败（429、5xx、网络、15 秒超时）且旧令牌未到期时继续用、5 秒后再试；被拒令牌的 SHA-256 等于缓存指纹时强制重铸；404 删定位；定位以 `project-key-location:v1:<编码的作用域>` 持久化；bigmodel 生产 origin 为 `https://bigmodel.cn`；桌面版个人套餐不传 `personalProjectSelection`，所以会过滤 `projectType "2"` | 3.16.3 pristine 包 `Urt` @1080367、`sge` @1082916（定位键使用处 @1083993）；桌面 `out/host/chunk-5YNPFY3L.js` +849600–+856500（`wc`、`My`）、`K$`（`resolveBigModelApiOrigin`）与常量 `D$`（`https://bigmodel.cn`，+582546）；`out/host/index.js` `RM` +1203000、`_M` +1204641、`resolveProviderMaterial` +1729500〔实读 2026-10-28〕 |
| 3.16.3 PAT 被拒刷新一次：最终响应 401 且不是请求安全类失败（`VERIFY_APIKEY_EXPIRED`、`VERIFY_SIGNATURE_INVALID`、`3007`）时，以被拒令牌的指纹重取一次 PAT，作为新尝试重发，只重试一次 | 3.16.3 pristine 包 `AccountRequestRetry`（`$ye` @4144946）、`$Hs` @4144643、`Vrt` @1090655、`$rt` @1089606〔实读 2026-10-28〕 |
| 3.16.3 桌面登录只保存 OAuth 令牌集（访问令牌、ZCode JWT）与用户资料；项目 key 的定位在第一次取项目令牌时解析，存进凭证服务 | 桌面 `out/host/index.js` `loadOAuthTokenSet`、`loadUserProfile`、`createAccountProjectTokenClient` 的 `locationStore`（+1769704）〔实读 2026-10-28〕 |
| 3.16.3 模型请求归因头：`x-request-id`（每次尝试 `crypto.randomUUID()`）、`x-zcode-session-type`（`main` / `subagent` / `side_chat` / `other`，非 agent 步一律 `other`）、`x-zcode-trace-id`、`x-query-id`（去 `query_` 前缀）、`x-zcode-query-source`（须匹配 `^[A-Za-z0-9_.:-]{1,128}$`）、`x-session-id`（去 `sess_` / `subagent_agent_` 前缀）。trace id 来自会话运行时的根追踪上下文，会话内不变，子代理运行时继承父会话的追踪上下文；query id 是桌面输入的 id，压缩与标题沿用回合的 query id；查询来源：agent 步 `main_turn`（子代理 `subagent`、workflow 子会话 `workflow_child`），压缩 `compact`，会话标题 `session_title` | 3.16.3 pristine 包 `Vdt` @4065502、`Y0n` @4065835、`Gdt` @4067222、`iG` @1157940、`vT` / `Lw` @1421911、`hae` / `nS` @12815948、`mDn` @13259914、`zzo` @13357726、`this.rootTraceContext` @13515884、`O9` @14502646、`v2n` @13069774、compaction `querySource` @13389086〔实读 2026-10-28〕 |
| 3.16.3 模型请求的 User-Agent：AI SDK `withUserAgentSuffix`（`Y2`）把头键改小写、经 `Headers` 后返回排好序的普通对象；provider 级为 `ai-sdk/anthropic/3.0.81`，调用级的 `User-Agent: ZCode/3.16.3` 覆盖它，`postToApi` 再追加 `ai-sdk/provider-utils/4.0.27` 与运行时段（先取 `navigator.userAgent`，Node 22 为 `runtime/node.js/22`）；`generateText` 在调用级另加 `ai/6.0.193`，`streamText` 不加 | 3.16.3 pristine 包 `$ut` @3509781、`y4s` @3510098、`Y2` @3510311、`Rh` @3505152、`mZr` @3530239、`postToApi`（`SZr` @3540427，UA 追加使用处 @3540599）、`createAnthropic`（`sgn` @3569529）的 `getHeaders`（使用处 @3570073）、`generateText` 调用级头 @3949945、`Xno` @3991593〔实读 2026-10-28〕 |
| 3.16.3 头链与线上顺序：签名器先 `new Request`（`O1r` @1088463），`zrt` @1089207 以 `new Headers` 复制并删 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-Client-Pow, X-App-Id, X-Client-Sign-Verified`（`jfs` @1089964），`sendSigned` 依次 `set` 七个签名头（`X-Session-Id` 在第四个），无签时只做 `zrt`；路由 fetch `new Headers(prev)`、删 `host`、`set` 路由头。Node 22.20 的 undici 复制 `Headers` 时保留插入顺序与 `set` 的大小写（回环服务器 `rawHeaders` 实测） | 3.16.3 pristine 包 `sendSigned` @3827896（七个 `set` 的使用处 @3828487）、`f5s` / `Ngn` @3839971〔实读 2026-10-28〕；本机实测 2026-10-28 |
| 3.16.3 模型请求体：AI SDK `getArgs` 组 `{model, max_tokens, temperature, top_k, top_p, stop_sequences, [thinking], [output_config], …, metadata, …, system, messages, …}` 后返回 `{...args, tools, tool_choice, stream}`，`JSON.stringify` 丢掉 `undefined`；有工具时 `toolChoice` 缺省 `{type: "auto"}`，Anthropic provider 发 `tool_choice: {type: "auto"}`；anthropic 工具带 `eagerInputStreaming: false`；目录的选项映射由 fetch 包装解析正文后按 `Zpr` 合并、再序列化，新键排在末尾 | 3.16.3 pristine 包 `getArgs` @3599845（体字面量使用处 @3603239、返回使用处 @3607708）、`Jjs` @3543299、`nro` @3929119、`EVs` @4101395、`TQr` @3836714、`Jpr` @547136、`Zpr` @547735〔实读 2026-10-28〕 |
| 3.16.3 对账号 provider 把模型 id 规范为官方大小写（`GLM-5.3`、`GLM-5.3-Flash` 等 22 个） | 3.16.3 pristine 包 `GZt` @526265、`Cpr` @526343、`hne`〔实读 2026-10-28〕 |
| 内置目录（开源树 revision 33）GLM-5.3 系：模型规则 `.*glm-5\.3.*` 为 `contextWindow` 1,000,000、`maxOutputTokens.max` 128000、`reasoningLevel.values` `["low", "high", "max"]`；anthropic-messages 规则映射为 `{"thinking": {"type": "enabled"}, "output_config": {"effort": reasoningLevel}}`。规则匹配锚定、忽略大小写，后命中覆盖先命中 | `reference/ZCode/config/provider/zcode-builtin.json`（主检出）；3.16.3 pristine 包 `wYt` @557708、调用 @563982〔实读 2026-10-28〕；3.16.3 的活动目录由桌面壳下发，未核 |
| 3.16.3 会话标题与压缩：标题请求 `generateText({messages, tools: []})`，非流式，档位与输出上限取 `auxiliaryModelOptions`，提示词首条输入截 1200 字符；账号模式推迟到回合完成后发；压缩用会话模型与 `querySource: "compact"`，按流迭代；压缩模型按会话的模型选择建（`jT(this, {selection: this.getSessionModelSelection()})`），档位随会话，只有标题改用 `auxiliaryModelOptions` 的档位 | 3.16.3 pristine 包 `v4a` @13066475、`y4a`、回合开始的尝试 @13367458、推迟 @13370395、`c3a` @13387356、`jT` @12830530、`p3a` @13395552、`Xzo` @13380629〔实读 2026-10-28，引自 m1-parity 调研计划〕 |
| 3.16.3 端点路由配置请求的头：`User-Agent`、`X-ZCode-App-Version`、按白名单规范名的来源头（`HTTP-Referer`、`X-Title`、`X-Platform`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-Os-Category`、`X-Os-Version`、`X-Device-Mid`）、`x-api-key-id`（请求凭证的 `apiKeyId`）、`Accept`；不带任何 API Key。CLI 包与桌面 `index.js`、`chunk-5YNPFY3L.js` 里没有 `api_keys/copy` 与 `secretKey`：账号模式不取 API Key 的 secret | 3.16.3 pristine 包 `FGs` @4196232、`jGs` @4196407、`NGs` @4199110、`Frn` @968479、`Ngn` @3839971、`P5r` @2827718；检索〔实读 2026-10-28〕 |
| 3.16.3 对 `zhipu-account` 的 start-plan、off-peak、highspeed 三种 mode 不签名 | 3.16.3 pristine 包 `requiresClientRequestSigning`（`QUs` @3832832）〔实读 2026-10-28〕 |
| 官方开源仓库 zai-org/ZCode，Apache-2.0 | `README.md` |
| 身份节组装、安全声明官方原文、Harness 节 | `reference/zcode-verbatim.md` |
| 八件套工具定义原文在源码 `apps/zcode-cli/packages/core/src/tool/handlers/`；`reference/zcode-tool-schemas.md` 中的工具描述与 deferred 声明段无法追溯出处，SessionGuidance、Skills 引导段待同样复核 | `DESIGN.md` §5.9 |
| TodoWrite `priority` 为字符串三枚举 `high` / `medium` / `low` | `reference/zcode-capabilities.md` §11.3 |
| todo 提醒双阈值 10/10，GLM 启用 | `reference/zcode-capabilities.md` §4.2 |
| todo 提醒按助手消息计轮（一条助手消息一轮，不论工具调用数），每次模型请求前从历史重新计算；本回合工具有 TodoWrite 才检查；作为 `todo_reminder` 附件递送并持久化；3.16.3 对 id 含 `claude` 的模型不提醒；`supportsMidConversationSystem` 为真时投影为对话中段 system 消息，否则为 `<system-reminder>` 用户消息，GLM 的取值来自远端配置 | 安装包 `XNa`、`U4o`、`z4o`、`Rwe`；源码 `runtime/helpers/runtime-reminders.ts`、`runtime/methods/turn-loop.ts`、`runtime/helpers/provider-mid-conversation-system.ts`〔实读 2026-10-28〕；`DESIGN.md` §5.5 |
| compact：默认窗口 200k，输出预留 min(maxOutputTokens, 21k)，autoCompact 阈值 166k；microcompact 公式 | `reference/zcode-capabilities.md` §11.2 |
| 3.16.3 的 `max_tokens`：agent 步取 `min(目录 maxOutputTokens.max 或 32000, floor(上下文窗口 − 当前用量估算 − 1000))`，后者不大于 0 或输入无效时取前者；压缩 `min(VZ(max), 20000, max)`；辅助请求（会话标题）`min(5000, max)` 且档位取目录第一档。当前用量以最近一条带服务端用量的助手消息为基线，其后的消息按三字符一 token 估算（工具调用计名称加输入 JSON）。目录的 thinking 经选项映射追加，AI SDK 不知道它，不剥离采样参数 | 3.16.3 pristine 包 `VZ` @13215775、`aUo` @13215830、`Qja` @13216560、`Yja` @13216683、`pBa` @13320731、`p3a` @13395552、`I0t` @5070582、`PP` @7759001、`uzo` @13313841、`CDn` @13313415、`d5o` @13260048、`Xgt` @4979924、`Bla` @4980209、`TP` @5067698、`tsn` @1317782、`ere` @814022、`z0o` @5068462〔实读 2026-10-28〕；旧的 32000 与「剥离采样参数」出自 `reference/zcode-capabilities.md` §10.1、§11.7，与 3.16.3 不符 |
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
- ZCode 账号模式的个人套餐模型请求以项目令牌（project_access JWT，由 OAuth 登录铸造）同时填 `Authorization: Bearer` 与 `x-api-key`（§1）。
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
| 签名运行的响应头延迟偏高的原因（握手与签名请求已实测成功，`DESIGN.md` §4.3）。签名与请求形态对 1.5 倍套餐扣减的影响不再测量：用户 2026-10-28「看量或者扣减看不出来的。你就代码级别一样就行」，以代码级一致验收（`DESIGN.md` §4.8） | 延迟只有一个样本 | 同时段的签名与无签对照 |
| OutputStyle 风格列表 | 服务端下发 | 抓取 |
| 实跑 temperature / top_p 值 | 需实跑请求体 | 抓包 |
| start-plan 与 coding-plan 渠道差异（K9） | 无 | zcode-api 源码 |
| repeat-tool-reminder 文案与门控（K1） | 无 | DSH 源码 |
