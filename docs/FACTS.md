# 外部事实账

版本：0.2（2026-10-27）
状态：生效。取代外部事实账 v0.1（`.llm/docs/04-external-facts.md`，原文见 git 历史提交 `c518317`）。
本文件只放结论与索引，细节查 `reference/` 下的原文。证据标注同 `DESIGN.md`。

## 1. ZCode

下表标 3.16.3 的行引用 3.16.3 pristine 包的符号与偏移。基线换到 3.17.1 时（2026-10-30，项目图 `zcode-3171-follow`）逐段比对过，记录在不入库的 `.agents/tasks/zcode-3171/diff.md`：这些行描述的代码（来源标题、签名、端点路由、设备号、项目令牌客户端、AI SDK 段、请求体、`max_tokens`、模型大小写）在 3.17.1 里逐字节一致，结论对 3.17.1 同样成立；3.17.1 改了的地方单列在标 3.17.1 的行里，用 3.17.1 包的压缩名，不给偏移。

| 事实 | 来源 |
| --- | --- |
| 本机安装 ZCode 3.17.1（2026-10-29 21:04 自动更新，此前为 3.16.3） | 卸载注册表 DisplayVersion〔实读 2026-10-30〕 |
| 方言与通道的基线为 ZCode 3.17.1（2026-10-30 起，此前为 3.16.3）：「你就彻底都换成新版zcode，工程环境声明那个照旧」；ZCode master 的演进只作机制参考 | 用户定案（项目图 `d-zcode-3171`）；`reference/zcode-verbatim.md` §4 |
| 本机安装版 `C:\Program Files\ZCode\resources\glm\zcode.cjs` 随自动更新变化，用户也给它打过补丁，不得作为官方原文；2026-10-30 它是 3.17.1，MD5 `A40956E7201623670EAA0E9409809801`，与下面的 3.17.1 pristine 副本不同 | `reference/zcode-verbatim.md` 开头；用户确认 2026-10-27；〔实读 2026-10-30〕 |
| ZCode 官方源码 `reference/ZCode`：`package.json` 版本 3.16.2，最近提交 2026-10-20「chore: sync ZCode source」；只作可读参考，逐字门禁不读它（它仍含 3.17.1 已删的 3.16.3 文本） | 〔实读〕；`DESIGN.md` §5.9 |
| 方言逐字文本复核：身份类与 context management 是原文；工具描述、deferred 声明段、ToolSearch 描述大部分不是原文；todo 提醒正文与 compact 提示词有小处偏差。后两者与工具检索文本已按原文重建，deferred 声明段已删除 | `DESIGN.md` §5.9 |
| 3.16.3 的 `X-Title` 来源标题：agent 进程参数含 `app-server` / `agent-server` 时为 `electron`，否则为 `cli`；桌面版以 `app-server --stdio` 启动 agent 进程。端点路由配置请求的来源头另由桌面 agent 传 `sourceTitle: "electron"`，来源头构造的缺省值也是 `electron` | 3.16.3 pristine 包 `detectDefaultProviderSourceTitle`（`kuc` @14423244）、模型请求身份头 `Suc` @14422777、配置请求来源头 `Frn` @968479（缺省 `electron`）与 `_5e(...)` @15096557〔实读 2026-10-28〕 |
| 3.16.3 的签名 `clientVersion` 与项目令牌 `clientVersion` 共用常量 `__ZCODE_VERSION__`（构建期注入，安装包文本中未替换）；`X-ZCode-App-Version` 取自环境变量 `ZCODE_APP_VERSION` | 安装包〔实读〕；实际取值未验证 |
| 官方原文权威源：3.17.1 pristine 副本 `reference/zcode-3.17.1/zcode.cjs`（15,405,921 字节，MD5 `331AB13D0CB2E9504EA25420FF9AE663`），逐字门禁只读它；3.16.3 pristine 副本另存一份在 `reference/zcode-3.16.3/zcode.cjs`，只作对照。以下为此前的权威源：pristine 3.15.1 副本 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3151\zcode.cjs`（MD5 `87225203a43f8009e403c57532922f4c`）；3.16.3 pristine 副本 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3163\zcode.cjs.pristine`（15,242,397 字节，MD5 `51257C0D11DA7DC56C157D92E7048146`），与安装前备份 `C:\Program Files\ZCode\resources\glm\zcode.cjs.orig-3163.bak` 同 MD5；判断未经修改的依据只有文件名与这份备份，未与官方发布哈希比对。本表的「@数字」是这份 3.16.3 副本按 UTF-8 读入后的字符偏移，指向符号的声明处 | `zcode-patch` 目录〔实读 2026-10-28〕 |
| 3.16.3 签名握手 URL 为 `new URL('/api/paas/c1f3a7e2/v2/client', <provider baseURL 的 origin>)`，baseURL 的路径丢弃；bigmodel coding-plan 为 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`，z.ai 为 `https://api.z.ai/api/paas/c1f3a7e2/v2/client`（z.ai 的 baseURL 按源码路由表推断）。签名 fetch 包在端点路由 fetch 外面：签名器看到路由前的 URL，握手也经路由 fetch 发出 | 3.16.3 pristine 包 `resolveHandshakeUrl`（`ZUs` @3823123）、握手路径常量 `GUs` @3823630、`ClientRequestSigningV4Signer`（`Pgn` @3825391）、`protectTransport` @3833810、`createFactory` @3851919〔实读 2026-10-28〕；源码 `model-execution.ts` 283–301 行、`packages/desktop/wdio.conf.ts` 的握手夹具；`DESIGN.md` §4.3 |
| `c1f3a7e2` 是字面常量：3.15.1、3.15.2、3.15.3、3.16.1、3.16.2、3.16.3 的 pristine 包里各出现一次，在签名模块常量区，没有拼接或哈希 | `zcode-patch/pristine-*/zcode.cjs.pristine`〔实读 2026-10-28〕 |
| 3.16.3 握手：`Authorization` 是原样凭证（`{apiKeyId}.{secret}` 或 project_access JWT，都不加 `Bearer `），请求体 `{apiKey 或 accessToken, nonce, sig, ts}`，超时 10 秒；3.15.1 相同。业务拒绝（信封 `code` 不是 200）的 `msg` 只在匹配 `^HANDSHAKE_[A-Z_]+$` 时记为 reason；`handshake_failed` 观测只带 `errorKind`、`httpStatus`、`businessCode`、`reason`，不带错误消息 | 3.16.3 pristine 包 `performHandshake` @3829991、reason 过滤函数 `N1r` @1089432、`ensurePrivateKey` 的 `handshake_failed` 观测〔实读 2026-10-28〕；BigModel 握手端点接受原样 JWT 形式（HTTP 200，返回 `privateCipher`；`Bearer` 形式未试）〔实测 2026-10-28，沙盒真实网络运行 `net-1793188413414`，`DESIGN.md` §4.3〕 |
| 3.16.3 不缓存握手失败：网络错误、超时、非 200、业务拒绝都放行为无签发送，不留负缓存、没有退避，下一个可签名请求立即再握手，只有并发请求共享进行中的握手。私钥按（apiKey, 握手 origin）进程级缓存，没有 TTL，401 VERIFY 拒绝才作废 | 3.16.3 pristine 包 `ensurePrivateKey` @3829024、`getKeyOrSendUnsigned` @3827749、`ClientRequestSigningV4KeyCache`（`Xut` @3824083）〔实读 2026-10-28〕 |
| 3.16.3 只对标记 `failOpenEligible` 的错误放行（握手的网络、超时、协议、服务端、业务错误）；凭证解析失败与请求缺 `X-Session-Id`（`invalid-config`）、PoW 或 Ed25519 签名失败（`cryptography`）、握手进行中 epoch 变化或签名器已 dispose（`disposed`）不放行，请求抛错 | 3.16.3 pristine 包 `getKeyOrSendUnsigned` @3827749、`ClientRequestSigningV4Error`〔实读 2026-10-28〕 |
| 3.16.3 两次 VERIFY 拒绝后的旁路是签名器实例字段，只对当前签名器代有效；生产路径每次 `createFactory` 都换一个签名器，旁路因此只管一次请求 | 3.16.3 pristine 包 `bypassSigning` @3827229、`resolveSigner` @3825013〔实读 2026-10-28〕；`createFactory` 的调用频率按源码 `runner.ts` 251–285 行推断 |
| 3.16.3 的 deviceMid：存在 `<base>/.zcode/v2/telemetry-state.json` 的 `deviceMid`，`<base>` 为去空白后非空的 `ZCODE_DATA_BASE_DIR`，否则为主目录（`~`、`~/` 展开，其余 `resolve`）。`metadata.user_id` 只对 anthropic 类 provider 生成，为 `JSON.stringify({device_id, account_uuid: "", session_id})`，每次模型请求尝试都取一次。`ensureCliDeviceMid` 先无锁读：文件不是 JSON 记录（数组也不算）或 `deviceMid` 不是非空字符串即为没有；没有时在同目录的 `telemetry-state.lock`（`open` 用 `"wx"`，写 `{createdAt, pid}`）内重读，仍没有就以 `crypto.randomUUID()` 生成，保留其他键写回：先 `mkdir -p`，两空格缩进的 JSON 写进同目录临时文件 `.<文件名>.<pid>.<毫秒>.<随机>.tmp` 再 `rename`，失败删临时文件。锁已存在时，不足 300 秒且属主记录读不出或属主存活（`kill(pid, 0)` 成功或报 `EPERM`）就等 10 毫秒，否则删锁立即重试；200 次后抛 `CLI telemetry state lock timeout`。任何失败都用本进程生成的值；按状态文件路径缓存 promise。配置请求的 `X-Device-Mid` 另行只读：路径不展开 `~`，值去空白、须为可打印 ASCII，只缓存成功的读取。同一状态文件另有写入者 `resolveStandaloneDeviceMid`，只在 OTLP 遥测启用时运行，锁规则不同（2 次尝试） | 3.16.3 pristine 包 `ensureCliDeviceMid`（`Qro` @4062043）、`CWs` @4062252、`EWs` @4062442、`AWs` @4062638、`eoo` @4062679、`too` @4062778、`PWs` @4062889、`RWs` @4063231、`DWs` @4063741、`OWs` @4063923、`MWs` @4064119、`NWs` @4064238、`roo` @4064491、常量 @4064703、`tG` @1013439、`ZWs` @4073127、`Ydt` @4073238（调用 @4155898、@4167304）、`Juc` @14468783、`Kuc` @14468898、`resolveStandaloneDeviceMid`（`jrc` @14089436）〔实读 2026-10-29〕 |
| 3.16.3 账号模式（`zhipu-account`）的模型请求凭证：每次尝试前向桌面壳取请求凭证；个人套餐为项目令牌（PAT）与其 `apiKeyId`。CLI 把它设为 provider 的 `apiKey`（AI SDK Anthropic provider 发 `x-api-key`），删掉配置头里的 `authorization`、`x-api-key`，再补 `Authorization: Bearer <PAT>`；签名器用同一个令牌 | 3.16.3 pristine 包 `refreshBeforeModelRequest` @14817299、`PQr` @3841940、`x5s` @3843063、`T5s` @3843231、AI SDK `createAnthropic`（`sgn` @3569529）的 `getHeaders`（使用处 @3570073）、`protectTransport` @3833810；桌面 `app.asar` `out/host/index.js` `AccountProviderRequestAuthService.resolveCurrent`（+1200545）〔实读 2026-10-28〕 |
| 3.16.3 账号模式拿不到请求凭证时请求失败，不退回别的凭证：CLI 抛 `ModelRequestAuthMissing`（`Account model request auth is unavailable: <provider>/<model>`），刷新失败包成不可重试的 `RuntimeHeadersRefreshError`；桌面壳的原因原文为 `Account request credential is unavailable: bigmodel`（无 OAuth 令牌）、`Account request credential is unavailable: <providerId>`（无账号身份）或 `project_token_*` 错误码；渲染层不翻译这些消息 | 3.16.3 pristine 包 @4193871 附近、`xpt` @4146619、`wie` @4147581；桌面 `out/host/index.js` +1200545、+441792、+443132、+510627；`IntlProvider-Bw7hoRlp.js`、`styles-CQuzX8si.js` 检索为 0〔实读 2026-10-28〕 |
| 3.16.3 `ProjectAccessTokenClient`：OAuth 令牌原样调 `getCustomerInfo`；个人套餐滤掉 `projectType "2"` 的项目，取「默认机构」/「默认项目」否则第一个；按名 `zcode-api-key` 找 key，没有就 `POST {name, usageScene: 1}`；`POST …/access_tokens` 以 `Bearer <OAuth>` 铸造，体 `{clientType: "zcode", clientVersion}`；成功码 `200|0|"200"|"0"`；缺 `enable` 视为启用；有效期 `min(expiresAt·1000, 开始 + expiresIn·1000)`，到期前 120 秒减随机 0–60 秒刷新；暂态失败（429、5xx、网络、15 秒超时）且旧令牌未到期时继续用、5 秒后再试；被拒令牌的 SHA-256 等于缓存指纹时强制重铸；404 删定位；定位以 `project-key-location:v1:<编码的作用域>` 持久化；bigmodel 生产 origin 为 `https://bigmodel.cn`；桌面版个人套餐不传 `personalProjectSelection`，所以会过滤 `projectType "2"` | 3.16.3 pristine 包 `Urt` @1080367、`sge` @1082916（定位键使用处 @1083993）；桌面 `out/host/chunk-5YNPFY3L.js` +849600–+856500（`wc`、`My`）、`K$`（`resolveBigModelApiOrigin`）与常量 `D$`（`https://bigmodel.cn`，+582546）；`out/host/index.js` `RM` +1203000、`_M` +1204641、`resolveProviderMaterial` +1729500〔实读 2026-10-28〕 |
| 3.16.3 PAT 被拒刷新一次：最终响应 401 且不是请求安全类失败（`VERIFY_APIKEY_EXPIRED`、`VERIFY_SIGNATURE_INVALID`、`3007`）时，以被拒令牌的指纹重取一次 PAT，作为新尝试重发，只重试一次 | 3.16.3 pristine 包 `AccountRequestRetry`（`$ye` @4144946）、`$Hs` @4144643、`Vrt` @1090655、`$rt` @1089606〔实读 2026-10-28〕 |
| 3.16.3 桌面登录只保存 OAuth 令牌集（访问令牌、ZCode JWT）与用户资料；项目 key 的定位在第一次取项目令牌时解析，存进凭证服务 | 桌面 `out/host/index.js` `loadOAuthTokenSet`、`loadUserProfile`、`createAccountProjectTokenClient` 的 `locationStore`（+1769704）〔实读 2026-10-28〕 |
| 3.16.3 模型请求归因头：`x-request-id`（每次尝试 `crypto.randomUUID()`）、`x-zcode-session-type`（`main` / `subagent` / `side_chat` / `other`，非 agent 步一律 `other`）、`x-zcode-trace-id`、`x-query-id`（去 `query_` 前缀）、`x-zcode-query-source`（须匹配 `^[A-Za-z0-9_.:-]{1,128}$`）、`x-session-id`（去 `sess_` / `subagent_agent_` 前缀）。trace id 来自会话运行时的根追踪上下文，会话内不变，子代理运行时继承父会话的追踪上下文；query id 是桌面输入的 id，压缩与标题沿用回合的 query id；查询来源：agent 步 `main_turn`（子代理 `subagent`、workflow 子会话 `workflow_child`），压缩 `compact`，会话标题 `session_title` | 3.16.3 pristine 包 `Vdt` @4065502、`Y0n` @4065835、`Gdt` @4067222、`iG` @1157940、`vT` @1421911、`Lw` @1422054、`hae` @12815948、`nS` @12816000、`mDn` @13259914、`zzo` @13357726、`this.rootTraceContext` @13515884、`O9` @14502646、`v2n` @13069774、compaction `querySource` @13389086〔实读 2026-10-28〕 |
| 3.16.3 模型请求的 User-Agent：AI SDK `withUserAgentSuffix`（`Y2`）把头键改小写、经 `Headers` 后返回排好序的普通对象；provider 级为 `ai-sdk/anthropic/3.0.81`，调用级的 `User-Agent: ZCode/3.16.3` 覆盖它，`postToApi` 再追加 `ai-sdk/provider-utils/4.0.27` 与运行时段（先取 `navigator.userAgent` 转小写，得 `runtime/<userAgent>`，没有时为 `runtime/node.js/<process.version>`；取值随宿主：DSH 桌面运行时 0.2.1-rc.3 的 Electron node 模式（`process.version` `v24.21.0`，`navigator.userAgent` `Node.js/24`）上为 `runtime/node.js/24`，本机 Node 22 上为 `runtime/node.js/22`；ZCode 桌面版自己的 agent 进程取值未核）；`generateText` 在调用级另加 `ai/6.0.193`，`streamText` 不加 | 3.16.3 pristine 包 `$ut` @3509781、`y4s` @3510098、`Y2` @3510311、`Rh` @3505152、`mZr` @3530239、`postToApi`（`SZr` @3540427，UA 追加使用处 @3540599）、`createAnthropic`（`sgn` @3569529）的 `getHeaders`（使用处 @3570073）、`generateText` 调用级头 @3949945、`Xno` @3991593〔实读 2026-10-28〕；DSH 桌面运行时上线上主步 `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`、会话标题 `ZCode/3.16.3 ai/6.0.193 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`（m1-parity 沙盒真实网络运行截包；批次 L4 以同一 exe 的 node 模式加载 `dist/glm-llm/headers.js` 得同一运行时段）〔实测 2026-10-29〕 |
| 3.16.3 头链与线上顺序：签名器先 `new Request`（`O1r` @1088463），`zrt` @1089207 以 `new Headers` 复制并删 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-Client-Pow, X-App-Id, X-Client-Sign-Verified`（`jfs` @1089964），`sendSigned` 依次 `set` 七个签名头（`X-Session-Id` 在第四个），无签时只做 `zrt`；路由 fetch `new Headers(prev)`、删 `host`、`set` 路由头。Node 22.20 的 undici 复制 `Headers` 时保留插入顺序与 `set` 的大小写（回环服务器 `rawHeaders` 实测） | 3.16.3 pristine 包 `sendSigned` @3827896（七个 `set` 的使用处 @3828487）、`f5s` @3840311、`Ngn` @3839971〔实读 2026-10-28〕；本机实测 2026-10-28 |
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
| 3.17.1 身份节：CLI 前缀 `You are ZCode, an interactive agent`；身份开头无 Output Style 时为 `You are an agent working with the user toward their goals, using your own judgment along the way.`，有时为 `You are an interactive agent that helps users according to your "Output Style", which describes how you should respond to user queries.`；官方安全声明与 3.16.3 相同；Harness 五条 bullet 的前缀改为 ` - `，系统轮那条按 `midConversationSystem !== false`（桌面缺省为真）在「mid-conversation system turns」与「`<system-reminder>` tags … injected by the harness, not the user.」两句里选一句，后接 ` Hooks may intercept tool calls; treat hook output as user feedback.` | 3.17.1 pristine 包 `uBa`、`dBa`、`pBa`、`nBo`、`SDn`、`fBa`、`wDn`〔实读 2026-10-30〕；`DESIGN.md` §5.3 |
| 3.17.1 系统提示词的节：Dynamic Behavior（`TBo`）改为三段、没有标题；Context management（`IBo`）只剩两段，以单换行连接，3.16.3 后面的四段在包里不再出现。顺序为 cli_prefix、身份、桌面上下文、Dynamic Behavior、session guidance、memory、Context management；环境、模型行与当前日期改为 meta_user 附件。Environment（`hSo`）的调用行末尾带空格，bullet 前缀 ` - `，git 标志打印布尔值 `true`/`false`（3.16.3 为 `yes`/`no`），`Additional working directories` 排在 git 行之后（3.16.3 为 `Additional directories`，在 git 行之前），末尾新增下载文件与解压内容按不可信数据处理的一条；模型行移到独立的 model 节（`YTn`） | 3.17.1 pristine 包 `CBo`、ContextBuilder `build` 与 `assembleSystemMessages`、`GDn`、`hSo`、`j_t`、`U_t`、`YTn`〔实读 2026-10-30〕；`DESIGN.md` §5.2、§5.3 |
| 3.17.1 归因头新增 `x-zcode-session-features`（`$yn`），排在 `x-zcode-query-source` 与 `x-session-id` 之间，只在会话有特征时发：去重排序后以逗号连接，每项须匹配 `^[a-z0-9_]{1,64}$`，总长不超过 256。特征是会话级集合（运行时 `sessionFeatures`，随会话持久化），每次模型调用读当时的集合：`tool_search_local` / `tool_search_native`（该步工具检索暴露开启）、`tool_search_called`（ToolSearch 或 LocalToolSearch 成功返回）、`workflow_auto`、`workflow_cmd`、`browser_use`、`computer_use` | 3.17.1 pristine 包 `Uft`、`GXs`、`WXs`、`VXs`、`pP`、`EBe`、`B1n`、`U1n`、`yTo`、`vTo`、`bTo`、`z1n`、`LSa`〔实读 2026-10-30〕；`DESIGN.md` §4.5b |
| 3.17.1 项目令牌请求失败按类别命名：网络错误 `project_token_network_error`、超时 `project_token_timeout`、HTTP 状态 `project_token_http_<状态码>`（100–599），其余仍为 `project_token_request_failed`；请求包装器把 429、5xx、网络与超时作为暂态失败，其他非 2xx 作为状态码失败，响应体不是 JSON 时为 `project_token_invalid_response` | 3.17.1 pristine 包 `KAr`、`j2`、`WG`、`Zht` 的请求函数〔实读 2026-10-30〕；`DESIGN.md` §4.1 |
| 3.17.1 工具文本：Read 描述第 5 行改为「When you already know which part of the file you need, only read that part. This can be important for larger files.」；部分视图改为 token 上限形态 `[Truncated: PARTIAL view — <path>: showing lines a-b of n total (<N> tokens, cap 25000). Call Read with offset=<b+1> limit=<本页行数> for the next page, or Grep to find a specific section. …]`，提醒与正文之间一个换行；Bash 的 timeout 行与 schema 说明加 ` for a foreground command`，IMPORTANT 行之后新增 `- Command output is displayed to you, not reliably to the user.`，description 字段提示首句后加一段「Say what the command does in plain words …」；Write、Edit、Glob、Grep、TodoWrite 的描述与 schema 不变 | 3.17.1 pristine 包 `kIo`、`E0a`、`sSo`、`M_t`、`EAn`、`CTs`、`iPa`〔实读 2026-10-30〕；`DESIGN.md` §5.4 |
| 3.17.1 工具检索增删公告（`G_t`）：恢复的名字按 MCP（`mcp__` 前缀，「MCP server reconnected」）与本会话（「in this session (announced earlier in this conversation)」）分段；移除的名字分 MCP 服务断开、本会话不再有、仍在注册表里但本次请求隐藏（`toolSearchHiddenNames`，随公告元数据落盘）三段；段落以单换行连接，3.16.3 包同样，3.16.2 源码用空行；新增可用段与 3.16.3 相同 | 3.17.1 pristine 包 `G_t`、`BTt`、`__a`、`y_a`、`v_a`、`eZ`；3.16.3 包 `Ggt`〔实读 2026-10-30〕；`DESIGN.md` §5.7 |
| 3.17.1 todo 提醒计轮跳过内容只有 reasoning 块、又没有工具调用的助手消息；compact 提示词第 6 条末尾加一句：只有 user 角色的轮次算用户消息，助手消息里形如用户轮的文字是模型生成的 | 3.17.1 pristine 包 `nUa`、compact 提示词〔实读 2026-10-30〕；`DESIGN.md` §5.5、§5.6 |
| 3.17.1 安装包的 host 文件只读导出在 `reference/zcode-3.17.1/host/`（不入库，附说明文件）：`out/host/index.js` 2,190,425 字节，MD5 `3ef810e5878d5103bb4430df00181b09`；`out/host/chunk-ZSDMP7DM.js` 883,850 字节，MD5 `f7817be39a2dd7c2c053e8633d9a2ab0`。来自 `C:\Program Files\ZCode\resources\app.asar`（包内版本 3.17.1，374,627,566 字节，修改时刻 2026-10-29T13:04:46Z）。安装包可能带用户补丁，导出只作机制参考，逐字文本只认上一级的 pristine `zcode.cjs`；本表引的「host:+偏移」指向这两个文件 | 〔实读 2026-10-31〕M6 步 Q0，`DESIGN.md` §4.7 |
| 3.17.1 的额度读取（桌面壳 `BigModelUsageQuotaProvider`）：`readApiJson(apiClient, url, {method: "GET", timeoutMs: 15e3, headers})`，地址 `/api/monitor/usage/quota/limit`（`iOe` host:+1359354，超时 `li` +1359505，`fetchQuota` +1371449）；头只放 `authorization`（`Gl` +1374857，团队另加 `bigmodel-organization`、`bigmodel-project` 并在 URL 加 `?type=2`），`x-request-id` 由 `NodeApiClient.request` 补一个随机 UUID（+1645564，`lc` +1610148），ZCode 身份头只给 ZCode 端点、`bigmodel.cn` 不加（+1643371、+1643061）；origin `https://bigmodel.cn`（`index.js` 的 `Zi` 即 `chunk-ZSDMP7DM.js` 的 `ma`，chunk:+591920–+594247）；请求凭证对账号套餐是 `resolveCurrent({reason: "usage"})` 的 `apiKey`，该原因不核账号作用域、不接受被拒指纹（+1278678）。成功判定 `success !== false` 且 `code` 为空、0 或 200（`QD` +1376124），行的解析 `jD` +1347113、`JX` +1347695。非 2xx 抛错（`Vt` +151499），不重试、不重铸：一条路径 `fetchQuota(d).catch(() => null)`（+1361885），另一条在 `getCodingPlanUsageSnapshot`（+1368278）里 `Promise.all` 不带 `catch`（+1368565） | 〔实读〕设计评审第 2 轮与本稿 0.5 在 3.17.1 包上复核，M6 步 Q0 对导出文件复核；3.16.3 的同名符号偏移不同、逻辑相同；`DESIGN.md` §4.7、§4.8 |
| 3.17.1 渲染层读额度的时机（V7）：`getCodingPlanUsageSnapshot` 在 `out/renderer/assets/styles-C9n_FfEX.js` 里只有一个调用方，是用量统计 hook（+6191366），挂载与参数变化时读，最近一次请求不足 60 秒直接用缓存（+6189443），可强制刷新；输入框旁的用量条（`codingPlanUsageRemaining`，+3192662、+3304684）经 `onAccess` 在打开时触发静默刷新（+3193010、+3296014、+3298799）。查过的范围内没有定时读额度：用量条所在一带唯一的 `setInterval` 是每秒更新的界面时钟，与额度无关。只查了这个调用方与那一带的定时器，没有穷尽整个渲染包 | 〔实读 2026-10-31〕M6 步 Q0，`DESIGN.md` §4.8 |
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
- 额度读取接口 `GET /api/monitor/usage/quota/limit` 返回的行（他人 2026-10-12 一次真实读取，max 档，对照官方面板，出自 `reference/zcode-api/`）：`TOKENS_LIMIT` 两行，是 5 小时与每周两个窗口；`TIME_LIMIT` 一行，是 MCP 工具调用窗口（`remaining` 是调用次数，`percentage` 是已用比例）。`number` 不是能与 `remaining` 比较的总量（`TIME_LIMIT` 一行 `remaining` 3836、`number` 1），`nextResetTime` 有秒也有毫秒，`unit` 的类型两边不一致（ZCode 只留数字，zcode-api 的夹具里是字符串）。上游网关对频繁查询限速。本包按「离重置还有多久」给窗口命名，不按重置先后排位。真机读取的核对随 `m6-l4`，读到的行记在这里。
- 历史 V2 套餐（GLM-5.3 非高峰 1 倍 / 高峰 3 倍）不适用于本用户，仅备查。
- 来源：`reference/bigmodel-guide-digest.md`。

### 2.5 限流与错误码

- 1308 / 1310 / 1316–1321 携带 `next_flush_time`，可直接展示恢复时间。
- 1313 为公平使用限频。
- 429 正文 `{"error": {"code": "1308", "message": "…"}}` 的形状出自 `open.bigmodel.cn` 的文档（`reference/bigmodel-guide-digest.md`）；本通道的模型请求经端点路由改写到 `zcode.z.ai/api/v1/ultra/...`，经这个网关时正文是不是同一个形状、消息里恢复时刻的格式与时区都没有实测。本包按 UTC+8 读消息里第一个 `YYYY-MM-DD HH:MM[:SS]`（`DESIGN.md` §4.7）。遇到第一次 1308 时，把正文形状和时刻格式记在这里。ZCode 的 host 包与 `zcode.cjs` 里都没有 `1308` 与 `next_flush_time`。

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
| 有 profile 上下文的运行（桌面版、headless 的 profile 运行）默认启用 `dsh-hmr`。它监视 profile 的 `cordis.patch.yml`、DSH home 的 `cordis.patch.yml` 与 profile `package.json` 的 `dsh.profile.bundles`，任一变化就从磁盘重读全部 bundle 的 patch、比对已加载的模块与磁盘，再重组行表；除非判定 `package-moved` 要求重启，新的行表就地套用。所以主检出合入并 build 之后，运行中的桌面版在下一次 profile 写入（模型菜单、设置表单、插件管理器）时就按磁盘上的新布局重组，不等重启 | `dsh-base/cordis.patch.yml` 27–32 行；`dsh-hmr` 849–873、1330、1359 行；`dsh-app-boot` 3782、3797、3844、3853 行〔实读，split 设计 F17，2026-10-29〕 |
| 设置表单改某行配置时先按当前文件重组一次，再写 profile patch：已有不带 `name` 的覆盖项就地改 `config`，仍不带 `name`；没有覆盖项时追加 `{id, name, config}`，`name` 取 bundle 插入这一行时锚定成的模块 file URL，即模块路径。覆盖项写了 `name` 而与目标行的模块路径不同时，Loader 跳过它并告警；没写 `name` 的按 id 匹配，不比对模块路径。插件管理器的启用开关只写 `{id, disabled}`，不带 `name` | `dsh-config-editor` 74–75、98、105–110、125 行；`dsh-plugin-manager` 1023–1078 行；`dsh-app-boot` 65–71、91–103 行〔实读，split 设计 F18、F2，2026-10-29〕 |
| 行 id 是 patch 里显式写的字符串，不由包名或 patch 文件推出。整棵树把 `dsh.profile.bundles` 中各 bundle 的 patch 依次拼成一个列表，再接 profile 的 `cordis.patch.yml`、DSH home 的 `cordis.patch.yml` 与 `--patch` 覆盖层，一次套用到空表上 | `dsh-app-boot` 1015–1051（`loadProfileDirectory`）、1127–1136、61–110 行〔实读，split 设计 F1〕 |
| 非 insert 的覆盖项按 id 在整张表里找目标（含 group 子行），找不到目标只告警；覆盖项按键整体赋值，不深合并 | `dsh-app-boot` 65–71、91–107 行〔实读，split 设计 F2、F3〕 |
| `dsh.bundle.patch` 可以是一个文件或文件列表，按 `join(packageDir, file)` 拼路径；`packageDir` 是 profile `node_modules` 下的 junction 路径，不取 realpath，所以路径里的 `..` 在 junction 路径上退回 profile 的 `node_modules`。insert 行中以 `./`、`../` 或绝对路径写的 `name` 以该 patch 文件所在目录为基准转成 file URL；覆盖项的 `name` 不转换，按字面比对 | `dsh-app-boot` 517–531、976–983、995–1003、3971–3978 行〔实读，split 设计 F4、F5〕 |
| 同一张表里重复的行 id：覆盖项落在最后一个，Loader 建条目时也只留最后一个 | `dsh-app-boot` 67 行；`dsh-loader` 78–91 行〔实读，split 设计 F6；运行时没有验证〕 |
| bundle 兼容性只看 `engines.dsh` 与 `@deepseek-ai/dsh*` peer | `dsh-app-boot` 279–332 行〔实读，split 设计 F7〕 |
| profile `node_modules` 下 junction 指向的目录是 linked root；其中模块的裸导入沿模块所在目录的全部祖先逐级先查该级 `package.json` 的 `peerDependencies`，列了就走安装版，否则在该级 `node_modules` 找本地候选。拆包后仓库根不再是 linked root，但仍是 `packages/*/dist/**` 的祖先，根 `peerDependencies` 因此兜住子包漏写的 peer | `dsh-app-boot` 648–700、1337–1347、1676–1720 行（`routeLinked`）〔实读，split 设计 F8、附录 G8〕 |
| client-modules 对每个启用的行，按其模块位置找最近的祖先 `package.json`，声明了 `dsh.client`（platform web）的算该包的一个来源，禁用的行跳过；同一客户端包有多个来源时抛 `resolves from multiple active Loader sources`，声明了 `dsh.client` 却缺 `./client` 导出或产物时抛错 | `dsh-client-modules` 555–563、720–811、852–856、890–900 行〔实读，split 设计 F9、F10〕 |
| client-modules 判定一行属于哪个包（`locatePkgJson`）：行名是路径形式（`./`、`file:`、绝对路径）时，经 Loader 的解析得到行模块的位置，向上找第一个有 `name` 的 `package.json`；行名是精确包名时，解析后向上找 `name` 等于这个包名的 `package.json`；其余裸说明符（子路径，例如 `dsh-hourness/graph`）直接返回空，不算任何包的来源。产物路径是那份清单所在目录加它的 `./client` 导出。rc.3 里读 `dsh.client` 的只有 client-modules。所以一个多行包可以自己声明 `dsh.client`：宿主行写子路径说明符，客户端面由唯一一行以精确包名插入 | `dsh-client-modules` 83、720–742、762–809 行；`reference/dsh-desktop-0.2.1-rc.3/` 全目录检索 `dsh.client`〔实读，split 设计 F11，m8-row-titles 补精确包名一支〕 |
| client-modules 只在 `dsh-web-app` 的组合里，headless 模板没有 | `dsh-web-app/cordis.patch.yml` 228 行〔实读，split 设计 F12〕 |
| 右侧栏页面类型的 `id` 在全部注册中唯一，第二次注册同一 `id` 抛错，用包名只是惯例；每个会话的布局（含标签身份）存在 localStorage 的 `dsh.sidebar-right.v1.<sessionId>` | `dsh-client-ui-sidebar-right/README.md` 74、83 行〔实读，split 设计 F13〕 |
| ESLint 10.13 的 `no-restricted-imports` 的 `patterns` 条目可以写 `regex`（对字面的导入来源做 `RegExp.test`）；`allowTypeImports` 默认关，类型导入同样受限 | `eslint/lib/rules/no-restricted-imports.js` 121、163、319–347、800–801 行〔实读，split 设计 F19〕 |
| knip 6.43.0 读 `--tsConfig <文件>` 指定的 tsconfig；它的 `references` 指向的每个 tsconfig 若同时有 `outDir` 与 `rootDir`，就加一组「产物目录 → 源码目录」映射，解析用 get-tsconfig，不经 tsc；配置文件可以是 `knip.js`。TypeScript 5.9.3 的 `tsc -p` 在 `references` 指向非 composite 项目时报 TS6306 与 TS6305，退出码 2，所以这组映射只能放在只给 knip 读的 `tsconfig.knip.json` 里 | `knip/dist/graph/build.js` 81–82、117 行，`util/load-tsconfig.js`（`walkReferences`）〔实读〕；tsc〔实测〕（split 设计 F20、F21） |
| 设置页「内置插件」按行名读显示信息（`pluginPackages.metaOf(行名, 行所在树的基准)`）：以 `.`、`/`、`\`、`#` 开头或含 `:` 的行名返回空，标题退回为行名本身，bundle patch 里的 `./` 行名已被锚定成含用户目录的 file URL。包说明符形式的行名读 `<说明符>/locale/en.json` 与同目录的其余 `.json`（每个都经 `<说明符>/locale/<文件名>` 解析，文件名须是语言 id，否则整条显示信息变成错误）；子路径说明符不读清单，图标只取 `<说明符>/icon`；标题是翻译表，没有显示信息时卡片显示 `moduleShortName(行名)`。基准是 profile 目录（根 Include 的 `ctx.baseUrl`；profile 启动不传 `bareModuleBaseUrl`），所以说明符只能写 profile `dependencies` 里的包，经 `<profile>/node_modules/<包>` 解析。官方先例：`@deepseek-ai/dsh-tool-subagent-control/list-agents`，导出 `./list-agents/locale/*.json` → `./locale/list-agents/*.json` | `dsh-app-boot` 133、1276–1283、1613–1660、2127–2246、3400、3971–3978、4125–4134 行；`dsh/lib/profile-boot-C14i-8IN.js` 302 行；`dsh-host-plugin-inventory` 127、147 行；`dsh-client-ui-settings-plugin-inventory/lib/client.js` 126、142 行；`dsh-base/cordis.patch.yml` 378 行〔实读，split 设计 F22，m8-row-titles 复核〕 |
| dsh-base 默认组合里的 `plugin-package-inventory-deepseek` 在 DeepSeek 官方请求里附上活动插件包的名字与版本（请求字段 `dsh_plugin_packages`）；裸名的行经 `pluginPackages.packageOf` 取包，路径形式的行按模块位置向上最近的 `package.json` 取身份。本项目的行都经包命名，DeepSeek 会话的请求列出 `dsh-glm-zcode`、`dsh-hourness` 与版本 0.3.0 | `dsh-base/cordis.patch.yml` 85–86 行；`dsh-plugin-package-inventory-deepseek` 52、90、146 行〔实读，split 设计 F23〕 |
| 插件页按包名读显示信息：`readPluginMeta` 经包的 `exports` 读 `<包>/locale/en.json` 与同目录的其他语言，`meta.title`、`meta.description` 须为非空字符串；图标取清单的 `icon`（只有导出了 `./package.json` 时才读清单）或 `<包>/icon` 导出，文件须在名字相符的包目录之内，格式为 SVG、PNG、JPEG、WebP，不超过 256 KiB。插件页列的是 profile 的 `dependencies`，带 bundle 与启用标记；启用开关经 `writeProfileBundles` 只改 `dsh.profile.bundles`，其余键原样保留 | `dsh-app-boot` 2085–2119（`iconOf`、`assertPackageOwned`）、2216–2246（`readPluginMeta`）、1164–1179、1187–1200 行〔实读，split 附录 G9、G19〕 |
| 名单里某个包读不出清单或没有 `dsh.bundle`，这个 bundle 被跳过，stderr 打印 `skipping profile bundle`，其余照常启动；bundle 先按安装锚点解析、再按 profile 目录解析，安装自带的包里没有 `dsh-glm-zcode`、`dsh-hourness` | `dsh-app-boot` 537–540、995–1003、1015–1052 行〔实读，split 附录 G6、G7〕 |
| `bin.js` 直接运行时，plugin 子命令对 `desktop` 调用 `rejectElectronProfile`；桌面版命令行启动器 `<安装目录>\resources\runtime\cli\bin\dsh.cmd` 设 `ELECTRON_RUN_AS_NODE=1`，以安装目录里的 `DeepSeek Harness.exe` 运行 `dsh-desktop-host/lib/cli.js`，它以 `manageDesktopProfile: true` 和安装自带的 pnpm（`resources\runtime\primary-runtime\dependencies\pnpm`）调用同一个 `runCli`。对 `desktop` 的启动、`--dump-config` 与 `--dump-default-config`，两种入口都拒绝 | `dsh/lib/bin.js` 35–38、112、119、252 行；`dsh-desktop-host/lib/cli.js` 94–115 行〔实读〕；安装目录〔只读核对〕（split 附录 G1） |
| 对 `desktop`，plugin 命令只要求 `package.json` 存在，在它的写锁 `package.json.lock` 里调用 `runProfilePnpm`，不检查桌面版是否在运行；其他 profile 走 `runPluginCommand`，同样先取写锁，profile 不存在时按模板初始化。写锁以 `wx` 创建、内容为进程号，持有者进程已退出时可以接管；正在跑的 pnpm 记在 `.plugin-manager/run.json`，只在 DSH 看到运行结束时删除，下一次操作遇到它时记下的进程还在就拒绝 | `dsh/lib/plugin-BiveYA7h.js` 10–13、63–100 行；`dsh-plugin-manager/lib/types/operations.js` 208–250、567、591–603 行；`dsh-atomic-write` 189–219 行〔实读，split 附录 G2、G10、G26〕 |
| `runProfilePnpm` 开始时记下 `package.json`、`pnpm-lock.yaml` 与每个直接依赖装好的清单；pnpm 退出码为 0 之后检查依赖兼容性：改动过的依赖不通过时写回开始时的两个文件、运行 `install --frozen-lockfile`、以 1 退出并在 stderr 写 `dsh: installation rejected: `；未改动的依赖不通过时只写 `dsh: warning: `，照常 `reconcile`、以 0 退出，所以重跑时同样的不兼容只剩告警。pnpm 自己失败时不恢复任何文件。CLI 方式下 pnpm 继承 DSH 的 stdio，DSH 不给它设时限 | `operations.js` 299、318–320、383–385、438–444、498–559 行；`plugin-BiveYA7h.js` 86–88 行〔实读，split 附录 G3、G25、G26〕 |
| `reconcile`：曾是依赖、现在不是的 bundle 从名单里删去；新增的、声明了 `dsh.bundle.patch` 的依赖追加到名单末尾；不是依赖的 bundle（安装自带的 base、web-app、experimental 等）原位保留；名单没变就不写文件。用 `add`、`remove` 换包会让新包排到名单末尾；先把名单与依赖写成目标形状再 `install`，`reconcile` 看到依赖前后相同，不改名单 | `operations.js` 83–86、92–123 行〔实读，split 附录 G4、G16〕 |
| `anchorPathSpec` 把以 `.` 开头的相对路径参数（可带 `file:`、`link:` 前缀）按调用目录换成绝对路径再交给 pnpm，绝对路径原样传，所以 `dsh plugin add` 写出的依赖总是绝对路径 | `operations.js` 71–76 行〔实读，split 附录 G17〕 |
| profile 模板的 pnpm 设置为 `nodeLinker: hoisted`、`autoInstallPeers: false`，子包的 peer 不会装进 profile。桌面版 profile 的锁文件格式 9.0、glmsandbox 的 6.0；安装自带的 pnpm 是 11.28.5，PATH 上的是 8.6.10；桌面版 profile 的 `node_modules` 有 `.modules.yaml`，glmsandbox 的没有 | `dsh-app-boot` 598–628 行〔实读〕；两个 profile 与安装目录〔只读核对，键名、格式版本与条目名〕（split 附录 G5、G18） |
| `--dump-default-config` 只组合 bundle 层，不读用户层，不启动，不求值 `!!js`，跳过的 bundle 打印在 stderr，会重写 profile 的 `cordis.yml`。输出里连续同源的行为一组，组前一行 `# == <来源>`，组内容是一个顶层 YAML 序列；bundle 层的来源标签是包名 | `dsh/lib/bin.js` 83–84 行；`dump-config` 24–28、38 行；`profile-boot` 216–222 行；`dsh-app-boot` 4038–4103 行〔实读，split 附录 G11、G22〕 |
| 仓库根 `pnpm-lock.yaml`（格式 6.0，`autoInstallPeers: true`）把根 `peerDependencies` 的 `@deepseek-ai/cosmokit`、`@standard-schema/spec` 记在根项目的依赖下，开发安装靠它们装上这两个包；去掉根的 peer，下一次 `pnpm install` 会删掉它们 | 仓库锁文件〔只读核对，split 附录 G12〕 |
| 两种 pnpm 的 `install` 对锁文件登记过、清单里已经没有的直接依赖调用 `removeDirectDependency`，在 Windows 上对 `node_modules/<名字>` 做递归删除（pnpm 11 `fs.promises.rm` 带 `recursive`，pnpm 8 `rimraf`），遇到 junction 时只删链接还是进入目标没有核实；路径不存在时直接返回。`install` 不删清单以外的名字（按 `node_modules` 实际条目删的那一段只在 `fetch`、`prune` 时运行）。pnpm 11 只把 `lstat` 为目录且有 `package.json` 的计划外条目挪进 `.ignored/`，pnpm 8 只挪不是链接的条目，两者都不挪链接，目标不存在的 junction 也不挪。DSH 启动时跳过目标不存在的链接 | `pnpm.mjs`（11.28.5）9977–9998、25919、201780–201949、213222–213449 行；`pnpm.cjs`（8.6.10）74064–74131、134658–134721、186663 行；`dsh-app-boot` 664–691 行〔实读；运行时对 junction 的删除行为未核实〕（split 附录 G13、G21） |
| 两种 pnpm 都用 ci-info 判断是否在 CI 里：环境变量 `CI` 等于 `false` 时跳过全部判定，否则 `CI`、`BUILD_ID` 等通用变量或厂商变量任一存在即判为 CI，判为 CI 时清空 `node_modules` 之前不询问。不判为 CI 时，pnpm 11 的 `confirmPurge` 在 stdin 不是 TTY 时抛 `ABORTED_REMOVE_MODULES_DIR_NO_TTY`；pnpm 8 用 enquirer 询问、默认值为是、不查 TTY，且只在 `node_modules/.modules.yaml` 存在时才校验、才可能清空 | `pnpm.mjs` 177369、233739–233749、233993 行；`pnpm.cjs` 126791、127079–127080、127231–127295 行〔实读，split 附录 G27〕 |
| Node 22.20.0 在 win32 上对 junction 的 `lstatSync` 报 `isSymbolicLink()` 为真，`unlinkSync` 只删链接本身；目标不存在的 junction 也能用 `symlinkSync(..., 'junction')` 建，`lstatSync` 报链接、`isDirectory()` 为假，`realpathSync` 报 `ENOENT`；`readlinkSync` 返回 `path.resolve(建立时给的目标)`，不带 `\\?\` 前缀与末尾分隔符，按它重建再读得到同一个字符串。Windows PowerShell 5.1 的 `Remove-Item -Recurse` 会进入目录 junction、删除目标里的内容，所以指回检出的链接所在的目录只用 Node 先拆链再删除 | 本机试验 2026-10-29〔实测〕；PowerShell 一条为推断（split 附录 G20 与第 5 轮评审 E01） |
| rc.3 的桌面程序（`app.asar` 内全部 `.js`、`.cjs`、`.mjs`）里没有 `desktopNext` 字样：桌面 profile 的 `dsh.desktopNextPlugins` 等键这一版不读 | 检索〔只读核对，split 附录 G15〕 |
| 本机 git 2.55.0.windows.3：在主检出里 `git rev-parse --git-common-dir` 输出相对路径 `.git`，在 worktree 里输出绝对路径；加 `--path-format=absolute` 后两处都输出正斜杠的绝对路径 | 〔只读核对，split 附录 G23〕 |
| `~/.dsh/profiles/` 下列了本项目包的只有 `desktop` 与 `glmsandbox`，`headless` 没有 | 〔只读核对，bundle 名，2026-10-29，split 附录 G14〕 |
| 桌面版 `dsh` 不在 PATH；headless 沙盒用 Electron 的 node 模式调用；`--profile desktop` 被拒绝 | `DEVELOPMENT.md` §3 |
| Electron node 模式下的 `bin.js` 按 `DSH_HOME` 找 `profiles/<名字>`，会话与存储也写在这个 DSH home 下；启动时重写该 profile 的 `cordis.yml`。手工生成的 profile（`package.json`、内容为 `[]` 的 `cordis.yml` 与 `cordis.patch.yml`、`node_modules` 下指向检出的 junction，没有 pnpm 元数据）与 `link:` 安装的加载方式相同 | 探针 2026-10-29（split 第 0 步，95/95）〔实测〕；`dsh/lib/profile-boot` `prepareProfile`、`dsh-home-paths` 109 行〔实读〕 |
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
