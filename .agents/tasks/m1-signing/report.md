# m1-signing 调查报告：签名握手地址与失败缓存

调查日期 2026-10-28。只读调查：未改代码、未发网络请求、未读凭证文件、未碰 DSH 桌面版与 `~/.dsh`。

## 0. 结论摘要

1. 握手地址错在本包，不在凭证。ZCode 3.16.3 的握手 URL 是 `new URL("/api/paas/c1f3a7e2/v2/client", <provider baseURL 的 origin>)`。coding-plan（bigmodel 族）的 baseURL 是 `https://open.bigmodel.cn/api/anthropic`，所以握手发往 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`；z.ai 族发往 `https://api.z.ai/api/paas/c1f3a7e2/v2/client`。签名层包在端点路由外面，它看到的是路由改写之前的 URL。本包 `src/glm-llm/zcode.ts:297` 把路由改写之后的 URL（`zcode.z.ai/api/v1/ultra/...`）交给签名层，握手 origin 因此变成 `zcode.z.ai`，必然 404。这个错误从基线导入（`9266fb6`）起就在；`reference/zcode-api` 的 handler 用的是改写前的 URL（`handler.ts` 约 296 行注释），是移植时丢的。HANDOFF §5 第 5 条、DESIGN §4.3 写的「握手对当前凭证失败」归因不成立。
2. `c1f3a7e2` 是字面常量，不按版本、凭证或请求计算。3.15.1、3.15.2、3.15.3、3.16.1、3.16.2、3.16.3 六个 pristine 包里都是同一个字面量。
3. 3.16.3 自己对握手失败**不做任何缓存**：所有握手错误都 fail-open（本次无签发送），失败后不留负缓存，没有 TTL，也没有退避，下一个可签名请求立即重新握手；只有并发请求共享同一个进行中的握手。成功拿到的私钥按（apiKey, 握手 origin）缓存在进程级 key cache 里，没有 TTL，只有 401 VERIFY 拒绝才作废。所以「照 3.16.3 的方式缓存失败」本身就意味着每次请求都重试。验收要求「失败时不再每次请求重试」，本包需要加一个 3.16.3 没有的失败冷却，并在 DESIGN 里写明这是偏离。
4. 建议修法（第 4 节）：签名改用路由前 URL；握手经端点路由解析（与 3.16.3 的 transport 链一致）；start-plan 不挂签名器（3.16.3 `requiresClientRequestSigning`）；握手失败后对该（origin, 凭证）冷却 60 秒；JWT 形式握手的 `Authorization` 改为原样凭证（3.16.3 逐字）。握手在正确地址上能否返回 200、签名请求能否通过 ultra 网关校验，只能靠 L4 实测确认。

证据源：
- 3.16.3 pristine CLI 包：`C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3163\zcode.cjs.pristine`（15,242,397 B，MD5 `51257C0D11DA7DC56C157D92E7048146`，与 `C:\Program Files\ZCode\resources\glm\zcode.cjs.orig-3163.bak` 同 MD5）。下文「@数字」是该文件按 UTF-8 读入后的字符偏移。
- 本机安装版 `C:\Program Files\ZCode\resources\glm\zcode.cjs`（用户打过补丁）：签名模块整段（`createHandshakeSignature` 到 `isFailOpenEligible`，11,711 字符）与 pristine 逐字相同（片段 MD5 均为 `395530f629a089ea557bd51cb07034fb`），偏移整体 +333。补丁不涉及签名。
- `reference/ZCode` 是开源仓库（3.16.2）。签名实现在开源版里是空壳：`apps/zcode-cli/packages/adapters/src/model/request-security-edition/index.ts` 的 `protectTransport` 直接返回原 transport，`packages/shared/src/request-security-edition/policy.ts` 全部返回 false。签名语义只能从安装包读；开源仓库只能用来确认 transport 组装顺序、baseURL、路由表与 E2E 夹具。
- 顺带：`docs/FACTS.md:19` 写「3.16.3 pristine 副本本地没有」，实际有（上面那份）。是否未经修改，依据是文件名与安装前备份同 MD5，未与官方发布哈希比对。

## 1. 3.16.3 的握手 URL、方法、请求体与请求头

### 1.1 URL 构造

| 符号（混淆名 / 原名） | 位置 | 内容 |
| --- | --- | --- |
| `GUs` | @3823630 | `GUs="/api/paas/c1f3a7e2/v2/client"`，同一模块里 `HUs="get_sign_key"`、`mQr="zcode"`、`JUs=1e4`（握手超时 10 s）、`hQr=16`（nonce 字节数）、`KUs=8`（PoW 位数） |
| `ZUs` / `resolveHandshakeUrl` | @3823123 | `n=new URL(baseURL)`；非 https 抛 `invalid-config`；`return new URL(GUs, n.origin).toString()`。baseURL 的路径部分（如 `/api/anthropic`）被丢掉，只取 origin |
| `Pgn` / `ClientRequestSigningV4Signer` 构造器 | @3825391、@3825716 | `this.handshakeUrl=ZUs(t.baseURL,…)`，`this.businessOrigin=new URL(this.handshakeUrl).origin`，`this.keyState=o.keyCache?.resolve(this.apiKey,this.handshakeUrl)` |
| `Pgn.request` | @3826538、@3826631 | 请求 URL 的 origin 与 `businessOrigin` 不同就 `sendUnsigned(o,"origin_mismatch")`，不握手 |

`t.baseURL` 来自 `Rgn.protectTransport`（@3833810）：`signingManager.createFetch({apiKey:n.apiKey??"",baseURL:n.baseURL,clientVersion:e5s(n.headers,"X-ZCode-App-Version")??B1,providerId:t},o)`，即 provider 配置里的 baseURL，不是路由后的 URL。

transport 组装顺序（`createFactory` @3851919，与开源 `model-execution.ts:283-301` 一致）：

```
b = endpointRoutingPort ? Ngn({fetch: 网络 transport, routingPort, apiKeyId}) : 网络 transport   // 路由 fetch
S = requestSecurity.protectTransport({providerId, providerConfig: n, transport: b})              // 签名 fetch，包在路由外
x = E5s({fetch: S, …})                                                                            // 业务错误包装
```

由此得到两条性质：
- 签名器看到的模型请求 URL 是路由前的 `https://open.bigmodel.cn/api/anthropic/v1/messages`，与 `businessOrigin` 相同，正常签名。签好的请求交给 `b`，由路由改写到 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages` 并追加 `X-ZCode-Authorization`。所以线上这个头排在签名头之后。
- 握手请求本身走 `this.transport(this.handshakeUrl, …)`（@3830437 附近），也就是同一个路由 fetch `b`。路由按完整 URL 精确匹配（`ProviderEndpointRoutingService.resolve` @4199746 起，键为 `https://host:port/path`，`hso`/`endpointKey`）。服务端映射表里没有 `https://open.bigmodel.cn:443/api/paas/c1f3a7e2/v2/client` 这一项时，握手原样发往 open.bigmodel.cn。映射表当前内容本地没有存档〔待 L4〕；开源静态网关表 `official-coding-plan-gateway.ts:9-12` 只有两条 messages 映射，没有握手项〔实读，推断服务端同样没有〕。

生产路径上路由端口总是存在：桌面 app-server 里 `re=e.providerEndpointRoutingPort??_5e({…,sourceTitle:"electron"})`（@15096523），`_5e`（@14469496）调用 `createProviderEndpointRoutingPort`，配置地址 `/api/v1/agent/configs`；成功缓存 300 s、失败冷却 30 s（`EGs=300*1e3,AGs=30*1e3` @4198956）。

### 1.2 按档位与地区的握手地址

| 档位 / 访问方式 | provider baseURL | 握手 URL | 依据 |
| --- | --- | --- | --- |
| bigmodel 个人 / 团队 coding plan（OAuth 账号模式），bigmodel coding-plan 手工 Key | `https://open.bigmodel.cn/api/anthropic` | `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client` | `reference/ZCode/packages/services/src/model-provider/legacyZCodeConfigProviderReader.ts:64,502-503`（生产 baseURL）；`packages/desktop/wdio.conf.ts:2280-2287,2363-2369`（E2E 注释「签名默认开启后，Account 用例的测试凭据也会发起握手」，夹具 host `open.bigmodel.cn`、path `/api/paas/c1f3a7e2/v2/client`）〔实读〕 |
| z.ai 个人 / 团队 coding plan | `https://api.z.ai/api/anthropic` | `https://api.z.ai/api/paas/c1f3a7e2/v2/client` | `official-coding-plan-gateway.ts:11` 的源键 `https://api.z.ai:443/api/anthropic/v1/messages`；`reference/zcode-api/src/proxy/client-signing.test.ts:13-15`（握手 URL 与 LLM URL 同为 api.z.ai）〔实读 + 推断，本包只支持 bigmodel 族〕 |
| start-plan、off-peak、highspeed（`zhipu-account` 这三种 mode） | `zcode.z.ai/api/v1/zcode-plan/…` 等 | 不握手、不签名 | `QUs`/`requiresClientRequestSigning` @3832832：这三种 mode 直接返回 false；baseURL 落在 z.ai/bigmodel.cn 时走 `createAccessModeUnsignedFetch`，只记一条 `unsigned_sent reason=access_mode` |
| 其余 provider | 自身 baseURL | 自身 origin + 常量路径 | `QUs`：`zhipu-coding-plan-api-key`、`individual-coding-plan`、`team-coding-plan`、`Irt(baseURL)!==null`（主机属于 `z.ai` / `bigmodel.cn` 根域，`Irt` @1024579）、或主机为 `api.chatglm.site` / `zcode.chatglm.site` 时签名 |

### 1.3 `c1f3a7e2`

字面常量。逐包核对（`zcode-patch/pristine-*/zcode.cjs.pristine`）：3151 @3785205、3152 @3785226、3153 @3785226、3161 @3821643、3162 @3821908、3163 @3823635，每个包恰好出现一次，都在签名模块的常量区，没有任何拼接或哈希运算。zcode-api 注释称 3.12.3 起即如此（`client-signing.ts:1-11`）。它在服务端是否由某种哈希生成无从得知，对客户端没有影响。

### 1.4 方法、请求头、请求体（`performHandshake` @3829991）

- `POST`，`redirect: "manual"`，10 s 超时（AbortController）。
- 请求头：`Authorization: t.credential`（**原样凭证，两种形式都不加 `Bearer `**），`Content-Type: application/json`。3.15.1 相同（@3791363）。
- 请求体：`JSON.stringify({[t.handshakeField]: t.credential, nonce, sig, ts})`。
  - `ts = String(Date.now())`，`nonce` = 16 字节随机 hex。
  - `sig = base64(HMAC-SHA256(HKDF-SHA256(secret, salt="WD_CLIENT_SIGN_KDF_SALT", info="getSignKey_hmac"), "get_sign_key\n{apiKeyId}\n{ts}\n{nonce}"))`（`aQr` @3820374 附近，`qUs="getSignKey_hmac"`）。
- 凭证解析 `D1r`/`parseClientSigningCredential`（@1087575）：三段且 header 满足 `{alg:"HS256",typ:"JWT",sign_type:"SIGN"}`、payload 满足 `{token_use:"project_access",api_key:非空}` 时为 JWT 形式，`handshakeField:"accessToken"`，`secret` 与 `credential` 都是整段 JWT；否则按唯一的 `.` 拆成 `{apiKeyId}.{secret}`，`handshakeField:"apiKey"`，`credential` 为整串。
- 响应：HTTP 必须 200；JSON 信封 `code===500` 视为服务端错误，`code!==200` 视为业务拒绝（`msg` 匹配 `^HANDSHAKE_[A-Z_]+$` 时记为 reason）；`data.privateCipher` 必须是非空字符串；解密：AES-GCM，key = HKDF(secret, info `ed25519_priv`)，iv 为前 12 字节，AAD 为 apiKeyId，明文是 base64 的 PKCS8 Ed25519 私钥（`cQr`）。

## 2. 3.16.3 的失败处理与缓存

### 2.1 失败分级

`fye`/`ClientRequestSigningV4Error` 带 `failOpenEligible`。`getKeyOrSendUnsigned`（@3827749）：错误 `failOpenEligible` 时 `sendUnsigned(t,"handshake_failed")`，否则重新抛出，请求失败（fail-closed）。

| 情况 | kind | failOpenEligible | 结果 |
| --- | --- | --- | --- |
| HMAC 计算失败 | `cryptography` | 是 | 无签发送 |
| 网络错误 / 超时 | `handshake-network` / `handshake-timeout` | 是 | 无签发送 |
| HTTP ≠ 200（含 404、3xx） | `handshake-protocol`，带 `httpStatus` | 是 | 无签发送 |
| JSON 无效 | `handshake-protocol` / `handshake-timeout` | 是 | 无签发送 |
| `code===500` | `handshake-server` | 是 | 无签发送 |
| `code!==200` | `handshake-business` | 是 | 无签发送 |
| 缺 `privateCipher` / 私钥解不开 | `handshake-protocol` / `cryptography` | 是 | 无签发送 |
| 凭证解析失败（无分隔符、非 SIGN JWT） | `invalid-config` | 否 | 请求抛错 |
| 请求缺 `X-Session-Id` | `invalid-config` | 否 | 请求抛错 |
| PoW / Ed25519 签名失败 | `cryptography` | 否 | 请求抛错 |
| 握手期间 epoch 变化 / 签名器已 dispose | `disposed` | 否 | 请求抛错 |

结论：404 与网络错误都 fail-open。每次失败记 `handshake_failed` 观测，`logger.warn("Client signing handshake failed", {errorKind, httpStatus, businessCode, reason})`，随后 `logger.info("Client request sent without signature", {reason:"handshake_failed"})`（`Rgn.observeClientSigning`，@3833479 之后）。

### 2.2 缓存了什么、多久

- 成功：`keyState.privateKey`。`keyState` 由 `ClientRequestSigningV4KeyCache`（`Xut` @3824083）按 `apiKey → 握手 origin` 两级 Map 取得。`mye()` 每调一次 new 一个 `Xut`；模型适配器工厂 `eEt`/`createModelAdapter` 统一传入模块级 `Krc=mye()`（@14093628），所以生产路径上是进程级共享。没有 TTL，也不淘汰。apiKey 换了（比如 PAT 续签）就落到新的 keyState，重新握手。
- 进行中：`keyState.handshakePromise`。并发请求共享同一个握手；`clearHandshake`（@3829942）在 resolve 和 reject 后都把它清掉。
- 失败：**什么都不缓存**。`ensurePrivateKey`（@3829024）只在成功分支写 `privateKey`；reject 分支只做观测再抛出，promise 随即被清掉。没有负缓存、TTL、退避或计数。
- 作废：`invalidatePrivateKey`（@3828875）在 401 VERIFY 拒绝后执行，条件是 `privateKey` 仍是本次用的那把：`epoch+=1`，清掉 `privateKey` 与 `handshakePromise`。dispose 只在 `ownsKeyState`（没有传 keyCache）时清，生产路径传了 keyCache，不清。
- 旁路：`bypassSigning` 是签名器实例字段（@3827229），日志原文 `Client signing entered BYPASS for current signer generation`。生产路径上每次 `createFactory` 都 new 一个路由 fetch 闭包，`resolveSigner`（@3825013）比较 `a.transport===o` 不等，于是每次 `createFactory` 都换一个签名器实例（key 仍从共享 keyCache 取）。`createFactory` 由 `resolveRequest` 触发，开源 `runner.ts:251-285` 显示它按请求（需要刷新运行时头时按 attempt）调用〔组装实读，调用频率按源码推断〕。旁路因此只在一次请求内有效，下一次请求会重新走签名梯。

### 2.3 什么时候重试

任何下一次可签名的模型请求都会重试：`request` → `getKeyOrSendUnsigned` → `ensurePrivateKey` 发现没有 `privateKey` 也没有进行中的握手，立刻新开一次握手。重试频率等于模型请求频率，只有并发请求会合并。401 VERIFY 拒绝时，同一次 `request` 内作废私钥、重新握手、再签一次（`signedAttempt:2`）；第二次仍然被拒就进入本代旁路，无签重发（`verify_refresh_exhausted`）。VERIFY 判定（`cin`/`$rt` @1089505）：HTTP 401，且 `msg` / `reason` / `data.reason` / `error.reason` / `error.message` 中有一个等于 `VERIFY_SIGNATURE_INVALID` 或 `VERIFY_APIKEY_EXPIRED`。

所以握手持续失败时，3.16.3 同样在每个请求前握手一次。

## 3. 本包现状与差异

### 3.1 现状（`src/glm-llm/`）

- `zcode.ts:292-302`：先 `routing.resolve(upstreamBase)` 得到 `routed.url`，再 `sendWithClientSigning(this.signer, { url: routed.url, headerPairs: {...headers, ...routed.headers}, … })`。签名层拿到的是改写后的 `https://zcode.z.ai/api/v1/ultra/anthropic/v1/messages`。
- `signing.ts:211`：`stateKey = ${parsed.origin}\n${credential}`，origin 为 `https://zcode.z.ai`；`signing.ts:420`：握手 `fetchImpl(${origin}${HANDSHAKE_PATH})`，即 `https://zcode.z.ai/api/paas/c1f3a7e2/v2/client`，404。
- `signing.ts:229-230`：失败时 `noteOnce` 后 `invalidateState(stateKey)`（epoch+1，清私钥与进行中的握手），返回无签。没有负缓存，所以每个请求都重新握手。截包（`.agents/tasks/cache-2026-10-28/runs/tap-1793168439212/{1,2}/tap.jsonl`）：每个 main 请求前都有一次 `zcode.z.ai/api/paas/c1f3a7e2/v2/client` 404，耗时 67–436 ms，多数 83–108 ms，且串行排在模型请求之前；同时发出的标题请求与 main 请求只握手一次（合并生效）。
- `signing.ts:406`：进行中握手合并，与 3.16.3 一致。
- `signing.ts:25`：PAT 铸造失败负缓存 60 s（`MINT_FAILURE_COOLDOWN_MS`）；成功的 PAT 缓存到 exp 前 5 分钟。截包只记录 messages / configs / v2/client，铸造请求（bigmodel.cn）是否成功没有记录〔未知〕。
- `signing.ts:440-444`：`noteOnce` 按 `stateKey` 去重，同一（origin, 凭证）只会出一条通知，先出的通知会吞掉后面不同原因的通知。生产构造（`index.ts:56-61`、`login-row.ts:36`）都没有传 `onEvent`，签名通知在生产里不可见。
- `zcode.ts:296`：start-plan 也挂签名器。`isUnsignedPath` 只豁免 `zcode-plan` / `off-peak` 路径，而本包 start-plan 的请求 URL 同样是 `open.bigmodel.cn/api/anthropic/v1/messages`（路由后为 ultra），不在豁免集里，所以 start-plan 现在也在握手。

### 3.2 差异表

| 项 | ZCode 3.16.3 | 本包 | 影响 |
| --- | --- | --- | --- |
| 签名层看到的 URL | 路由前（provider baseURL） | 路由后（`zcode.z.ai`） | **根因**：握手 origin 错，404 |
| 握手是否经路由 | 经路由 fetch（精确匹配，通常不改写） | 直连 | 映射表含握手项时才有差别〔待 L4〕 |
| 失败缓存 | 无，每请求重试 | 无，每请求重试 | 与验收冲突，需偏离 |
| 签名档位门 | start-plan / off-peak / highspeed 不签 | 路径豁免，start-plan 仍签 | start-plan 多余握手 |
| JWT 形式握手 `Authorization` | 原样 JWT | `Bearer <jwt>`（`signing.ts:422`，沿用 zcode-api，其注释称 2026-10-12 实测可用） | 逐字差异〔待 L4〕 |
| `X-ZCode-Authorization` 位置 | 签名头之后（路由在签名内层） | 签名头之前（先并入 headerPairs，签名头追加在后） | 头顺序差异 |
| 旁路范围 | 当次请求的签名器代 | （origin, 凭证）进程级永久 | 本包更保守，避免每请求走三次发送的梯子；建议保留并记为偏离 |
| 凭证不可解析 / 缺会话 id | fail-closed 抛错 | 跳过签名 | zcode-api 起的有意偏离，不在本任务验收内 |
| JWT 解析 | 还校验 `typ:"JWT"` | 不校验 `typ` | 小差异，不在本任务验收内 |

### 3.3 每请求重试的原因

两件事叠加：地址错（origin 取了路由后的 `zcode.z.ai`），握手必然失败；失败路径不留状态（与 3.16.3 相同），下一个请求照样再握手。合并只能去掉并发重复，挡不住串行请求。

## 4. 修复建议

推荐一次提交、两处源文件，外加测试与文档。每一项都注明是对齐 3.16.3 还是本包偏离。

### 4.1 `src/glm-llm/zcode.ts`（对齐 3.16.3）

1. 签名用路由前 URL，发送用路由后 URL：`sendWithClientSigning` 的 `url` 改为 `upstreamBase`；`send` 仍发往 `routed.url`；`routed.headers` 不再预先并入 `headerPairs`，改在 `send` 里追加到签名后的 pairs 末尾（3.16.3 线上顺序，也是 zcode-api `handler.ts` 的做法）。
2. 档位门：`plan === 'start-plan'` 时签名器传 `null`（3.16.3 `QUs` 对 start-plan 返回 false）。
3. 握手经路由：构造 `ClientSigningManager` 时传 `handshakeFetch`，先用 `this.routing.resolve(url)` 解析握手 URL，再用 `fetchImpl` 发出（`routed.headers` 存在时合并进 init.headers）。mint（bigmodel.cn）仍走 `fetchImpl`，3.16.3 的 PAT 铸造本来就不在模型 transport 链上。

### 4.2 `src/glm-llm/signing.ts`

1. 失败冷却（本包偏离，验收要求）：
   - 常量 `HANDSHAKE_FAILURE_COOLDOWN_MS = 60_000`，与同文件 `MINT_FAILURE_COOLDOWN_MS` 取值一致。理由：404 这类确定性失败重试没有意义；网络抖动 60 s 内也会恢复；一次失败最多每分钟多花一次约 90 ms。
   - `SignerState` 增加 `failedUntil?: number | undefined`。
   - `ensurePrivateKey`：`performHandshake` reject 且 `state.epoch === epoch` 时写 `state.failedUntil = this.now() + HANDSHAKE_FAILURE_COOLDOWN_MS`，再抛出。epoch 已变（VERIFY 作废或新 PAT 到手）的那次失败不写冷却。
   - `signWithStatus`：在 bypass、凭证解析、会话 id 三项检查之后，`ensurePrivateKey` 之前，`state.failedUntil !== undefined && this.now() < state.failedUntil` 时直接返回 `{ pairs, signed: false }`，不发网络请求。
   - 删掉 `signWithStatus` 握手 catch 里的 `this.invalidateState(stateKey)`：失败时私钥本来就是空的，进行中的握手也已由 `clear` 清掉；留着它会推进 epoch，还会把刚写的冷却清掉。
   - `invalidateState` 同时清 `failedUntil`。效果：`invalidate()`（VERIFY 拒绝后）与 PAT 铸造成功后都能立刻重新握手，前者与 3.16.3 的立即重握手一致。
   - 握手成功时清 `failedUntil`。
2. `handshakeFetch?: typeof fetch` 构造选项，缺省等于 `fetchImpl`，只给 `performHandshake` 用。
3. JWT 形式握手的 `Authorization` 改为原样 `authValue`，去掉 `Bearer `（3.16.3 @3830437 逐字 `Authorization:t.credential`）。L4 若被拒，回退并在 FACTS 记录。这一项与地址修复分开验收：L4 看到 401/400 时，先确认是不是这一项引起的。
4. `noteOnce` 键改为按原因区分（如 `${stateKey}\nhandshake`），通知带上失败原因（如 `handshake_http_404`）和冷却时长，避免被同 key 的早先通知吞掉。生产里 `onEvent` 仍未接线，签名状态可见性属于 DESIGN §4.3 条款 7 的规划项，不在本任务内。
5. 文件头注释与 `sendWithClientSigning` 注释同步：失败冷却 60 s 是偏离 3.16.3；永久旁路是比 3.16.3「本代旁路」更保守的偏离。

### 4.3 `tests/glm-signing.spec.ts`

改：
- `a full handshake signs the pairs with the V4 header block`：`seen[0].url` 从 `endsWith` 改为精确等于 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`；记录并断言握手请求头 `Authorization === 'id.secret'`、`Content-Type === 'application/json'`、方法 `POST`。

新增（`now` 用构造选项注入）：
- 失败后冷却期内不再握手：握手返回 404，连续三次 `signWithStatus` 只发一次 fetch，三次都是 `signed:false` 且 pairs 原样返回；`now` 前进 60_001 ms 后第四次再握手一次（计数 2）。
- 并发共享一次失败握手：两次并行 `signWithStatus` 只发一次 fetch。
- VERIFY 作废解除冷却：失败后调用 `invalidate(url, credential)`，下一次 `signWithStatus` 立即握手。
- 冷却按（origin, 凭证）隔离：凭证 A 失败后，凭证 B 立即握手。
- `handshakeFetch` 只承载握手：带 `oauthAccessToken` 时，getCustomerInfo / access_tokens 走 `fetchImpl`，`/v2/client` 走 `handshakeFetch`。
- JWT 形式握手（采纳 4.2 第 3 项时）：铸造夹具返回 `{code:200,data:{accessToken:<SIGN JWT>}}`，握手请求头 `Authorization` 为原样 JWT，请求体键为 `accessToken`。

### 4.4 `tests/glm-zcode.spec.ts`（适配器组装）

夹具：fetch 按 URL 分派。`agent/configs` 返回映射 `open.bigmodel.cn/api/anthropic/v1/messages → zcode.z.ai/api/v1/ultra/anthropic/v1/messages`；`/api/paas/c1f3a7e2/v2/client` 返回 200 + `privateCipher`（复用 glm-signing.spec 里的 Ed25519 + HKDF + AES-GCM 夹具）；bigmodel.cn 铸造接口返回失败（现有凭证带 `oauthAccessToken`，不处理会落到 SSE 分支）；messages 返回 SSE。
- coding-plan 按 provider origin 握手、按路由后 URL 发送：握手 URL 精确等于 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`；模型请求 URL 为 ultra；模型请求带 `X-Client-Sig`；第二次 stream 不再握手（握手计数仍为 1）。
- 握手失败时连续两次 stream 只握手一次。
- start-plan 不握手（握手计数 0）。
- 映射带 `zcodeAuthorizationHeader` 时，`X-ZCode-Authorization` 出现在签名头之后。注意 `send` 用 `Object.fromEntries` 生成 headers，断言用键的插入顺序。

现有 `coding-plan stream walks the full chain` 不受影响：`makeUpstream` 对所有 URL 都回 SSE，握手解析 JSON 失败后 fail-open，`captured.url` 最后一次写入仍是模型请求。

### 4.5 文档（与行为同一提交，AGENTS.md）

- `docs/DESIGN.md` §4.3 整条重写：握手 URL 规则（provider baseURL origin + 常量路径）、签名在路由外层、档位门、3.16.3 不缓存失败、本包 60 s 冷却与永久旁路两处偏离、`Authorization` 原样。§4.5b 第 320 行「每次都返回 404」一句同步改。
- `docs/HANDOFF.md` §5 第 5 条：归因改为「地址错」，写修复状态与 L4 结论。
- `docs/FACTS.md`：增加 3.16.3 事实（握手 URL 构造、失败不缓存、旁路按签名器代、`Authorization` 原样、`c1f3a7e2` 为跨版本常量）；更正第 19 行「3.16.3 pristine 副本本地没有」。
- `docs/DEVELOPMENT.md` 事故表加一行：移植把路由后 URL 交给签名层（基线 `9266fb6` 起），握手 origin 错；单测只断言 `endsWith`，没有组装层测试。

### 4.6 验证

- L2：`npm run build` → `npm run preflight` → `npm test`，三道全绿。
- L4（需真请求，用户已授权 agent 自验与重启 DSH）：装上 fetch-tap 行（`.agents/tasks/cache-2026-10-28/fetch-tap.mjs` 的正则已覆盖 `/v2/client`），重启后跑一个 GLM 会话，至少 5 个请求：
  1. 握手 host 应为 `open.bigmodel.cn`。
  2. 返回 200：之后的模型请求 `signed:true`，不再有握手记录；同时检查没有 401 VERIFY 梯子（三次发送）。
  3. 返回非 200：握手间隔不小于 60 s，模型请求照常成功。

## 5. 待 L4 确认的事项

1. 当前凭证在 `https://open.bigmodel.cn/api/paas/c1f3a7e2/v2/client` 是否返回 200 + `privateCipher`（PAT 形式或 `id.secret` 形式）。zcode-api 曾实测成功（`client-signing.ts:1-11` 注释），本包从未在正确地址上试过。
2. 服务端映射表是否含握手 URL（只影响握手是否被改写）。
3. JWT 形式握手 `Authorization` 原样与 `Bearer` 哪个被接受（3.16.3 用原样）。
4. ultra 网关是否接受「`Authorization` 为 apiKey、签名用 PAT 派生 apiKeyId」的签名请求。3.16.3 账号模式下模型请求与签名都用 PAT，本包模型请求用 apiKey（`headers.ts` `buildAuthHeaders`）。被拒时梯子会在首个请求上发三次，之后永久旁路。
5. PAT 铸造当前能否成功（截包没有记录 bigmodel.cn）。
6. 签名对 coding-plan 1.5 倍用量的影响（risk-signing）。
