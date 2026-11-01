# m1-parity 实施计划：coding-plan 请求与 ZCode 3.16.3 代码级一致

范围：项目图任务 `m1-parity`（含 `question-6` B、`question-7` B、`question-8` B）。工作树 `C:/Users/29596/Desktop/Project/GLM-Hourness/.worktrees/m1-parity`（分支 `m1-parity`，与 main 同为 `cc677af`）。本文件只是计划，不含实现。

证据约定：`@N` 是 pristine 3.16.3 CLI 包 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3163\zcode.cjs.pristine` 按 UTF-8 读入后的字符偏移（与 FACTS.md 同口径，本次逐个 `indexOf` 复核）；`asar:<文件>+N` 是同目录 `app.asar` 内该文件的字节偏移。内置目录取开源 3.16.2 树 `reference/ZCode/config/provider/zcode-builtin.json`（revision 33，只在主检出存在）。未读任何凭据文件、`~/.zcode/v2/telemetry-state.json`，未启动 DSH 或 ZCode。

## 0. 结论与证据推翻简报之处

十项都能在通道内做到代码级一致，缺口只剩 DSH 不给的输入（§2 第 5、7 项）与只由 DSH 控制的行为（第 10 项）。下列 3.16.3 证据与简报或调研报告不符，计划按证据执行：

1. 线上头顺序（第 8 项）不是「全部小写、整体字母序」。3.16.3 的链是：AI SDK 产出小写字母序的普通对象（`Y2` @3510311）→ 签名器 `new Headers(...)` 后按固定顺序 `set` 七个签名头（`sendSigned`，@3828487 附近）→ 路由 `new Headers(prev)` 后 `set("X-ZCode-Authorization")`（`f5s` @3840311）→ fetch。本机 Node 22.20 的 undici 复制 `Headers` 时保留插入顺序与原始大小写（127.0.0.1 本地服务器实测 `rawHeaders`），所以线上是：前段小写字母序（`x-session-id` 被签名器原位改名为 `X-Session-Id`），随后 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow`（原始大小写），最后 `X-ZCode-Authorization`。调研报告 §1.2 的「整体字母序」推断不成立；简报「Header names lower-case」只对前段成立。计划照搬同一条 `Headers` 链，不手排顺序。
2. `x-zcode-trace-id` 不是「回合内稳定、跨回合换新」。3.16.3 每个会话运行时建一次根追踪上下文（`this.rootTraceContext=o.traceContext??vT({sessionId:t})` @13515884；会话记录建在 `Hui` @14478407），用户输入经 `O9` @14502646 进入时不带追踪上下文，回合追踪上下文由 `nS` @12816000 / `Lw` @1422054 从根派生，`traceId` 不变。所以 trace id 是**会话级**（进程内每会话一个），子代理沿用父会话的 trace id（子运行时 `traceContext:t.traceContext`，@13195508 附近）。`x-query-id` 才是回合级。
3. User-Agent 的运行时段不是直接取 `process.version`。`$ut` @3509781 先看 `navigator.userAgent`：`runtime/${navigator.userAgent.toLowerCase()}`，没有才 `runtime/node.js/${process.version}`。Node 22 有 `navigator.userAgent = "Node.js/22"`，得到 `runtime/node.js/22`。另外会话标题请求走 `generateText`，它额外给调用级头加 `ai/6.0.193`（`Y2(_??{},\`ai/${Xno}\`)` @3949935，`Xno="6.0.193"` @3991593），主步与压缩走 `streamText` 不加。主步 UA 为 `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 <runtime>`，标题为 `ZCode/3.16.3 ai/6.0.193 ai-sdk/provider-utils/4.0.27 <runtime>`。
4. 桌面版个人套餐选项目时**会**滤掉 `projectType === "2"`。调研报告 §2.2 说桌面 `personalProjectSelection:"default"` 不过滤；实读桌面 `resolveProviderMaterial`（`asar:out/host/index.js+1729987`）调用 `tokenClient.resolve({origin,family,loginToken,accountId,rejectedProjectTokenFingerprint})`，不传 `personalProjectSelection`，于是走 `chunk-5YNPFY3L.js+855900` 的过滤分支。本包铸造路径的过滤是对的，登录路径（`resolver.ts`）不滤是错的。
5. 简报假设 `npm run probe` 编码了 X-Title、UA 与头顺序。实读 `scripts/probe/` 没有任何这类断言：探针 provider 是不联网的脚本化 provider，只借用 `dist/glm-llm` 的 `encodeRequest`、`splitSystemPrompt`、`GLM_MODELS`、`glmInputModalities`、`prepareRequestImages`、`asAttachments`、`glmImageRequestTarget`。旧线上形态写在 L2 测试里（§5）。
6. 第 9 项按用户 2026-10-28 追加决定执行（取代简报「只读、不在 ~/.zcode 建任何东西」）：完整移植 `ensureCliDeviceMid`，缺 `deviceMid` 时生成并在锁内原子写回。

另有一处不在简报里、但影响第 1、2 项的事实：3.16.3 端点路由配置请求的 `X-Title` 也是 `electron`，因为桌面 agent 建路由端口时传 `sourceTitle:"electron"`（`_5e(...)` @15096557）；模型请求的 `electron` 来自 `kuc` @14423244 读进程参数。

## 1. 工作约束与环境

- 一律用工作树绝对路径；相对路径会落到主工作区。
- 门禁：`npm run build`、`npm run preflight`、`npm test`（`package.json`）。`npm test` 是显式文件链，新 spec 必须追加进去。
- 工作树没有 `reference/`：`npm test` 前设 `$env:ZCODE_BUNDLE='C:/Users/29596/Desktop/Project/Zcode/zcode-patch/pristine-3163/zcode.cjs.pristine'`；`tests/glm-startplan.spec.ts` 读 `reference/zcode-api/src/proxy/zcode_system.json`，跑前从主检出临时复制到工作树同一相对路径，跑完删除（`m1-signing/integration.md` §3 的做法）。测试不得依赖 `reference/ZCode` 目录，期望值写死在测试里。
- 检查器门禁（`npm run lint`）对 knip/jscpd/ESLint 做棘轮：新增未用导出直接失败，所以每一步都要把新模块接上；删掉的代码让基线条目消失时，同一提交跑 `npm run lint:update`。
- L2 只 mock 网络与文件系统。任何构造 `ZcodeAdapter` 并走到发送的测试，`env` 必须带 `ZCODE_DATA_BASE_DIR=<os.tmpdir() 下 mkdtemp 的目录>`，否则设备 ID 模块会读写真实 `~/.zcode`。线上头顺序的断言用 `node:http` 在 127.0.0.1 起服务器读 `req.rawHeaders`（只看头名，属于网络替身）。
- 不读、不打印 `~/.dsh/glm-hourness/credentials.json`、`.llm/credentials.json`、`~/.zcode/v2/telemetry-state.json`，不打印任何 Authorization、PAT、key、secret、签名、设备 ID 的值。
- 不调用额度或用量接口（`/api/monitor/...`）。start-plan 路由不发任何真实请求。
- 一件事一个提交，只在本地分支提交，不推送（合入由收尾步骤做）。提交信息带节点 id `(m1-parity)`，技术话术，干净区。
- 文档与行为同一提交；被取代的条款整条重写，不追加。
- start-plan 范围：只有身份级改动（X-Title、设备 ID 来源、不再存在的 secret）波及它；请求头形态、请求体规则、归因头的改动只作用于 coding-plan，start-plan 保持现有线上形态（没有额度，无法验证），DESIGN 写明。

## 2. 逐项：3.16.3 行为、现状、改动、测试、缺口

### 第 1 项：模型请求用项目令牌（PAT）

3.16.3〔实读〕：
- 账号模式每个请求尝试前向桌面壳要请求凭证（`refreshBeforeModelRequest` @14817299，`interaction/requestProviderRuntimeHeaders`）。桌面 `AccountProviderRequestAuthService.resolveCurrent`（`asar:out/host/index.js+1200545`）对 `individual-coding-plan` 取 `loadIndividualPlanMaterial`，返回 `{apiKey: DY(a?.token, r), apiKeyId: a?.apiKeyId, accountScope}`。
- CLI 侧 `x5s` @3843063：`o=e.access.type==="zhipu-account"?PQr(n):n; return {...e, ...t.apiKey?{apiKey:t.apiKey}:{}, headers:Ugn(o,t.headers)}`，`PQr` @3841940 删掉配置头里的 `authorization`、`x-api-key`。
- `T5s` @3843231：`{[RQr]:\`Bearer ${e}\`,...t}`（没有 Authorization 时补 `Authorization: Bearer <apiKey>`）。AI SDK `createAnthropic` 的 `getHeaders`（@3570073）：`Y2({"anthropic-version":"2023-06-01",...f,...e.headers}, \`ai-sdk/anthropic/${gjs}\`)`，`f={"x-api-key":apiKey}`。结果 `authorization: Bearer <PAT>`、`x-api-key: <PAT>`。
- 签名器拿同一个 PAT 当凭证（`protectTransport` @3833810：`createFetch({apiKey:n.apiKey??"", ...})`）。
- PAT 客户端（桌面 `ProjectAccessTokenClient`，`asar:out/host/chunk-5YNPFY3L.js`）：常量 `Ic` 接受 `200|0|"200"|"0"`，`pi=1e3,eF=120*pi,tF=60*pi,nF=5*pi`（+849741）；缓存 `wc`（+850600 附近）：`refreshAt=b-eF-S`（到期前 120 s 再减 `random()*60 s`），有效期 `b=Math.min(h.expiresAt*pi,l+h.expiresIn*pi)`，缺 `enable` 视为 `true`，`enable:false` → `project_token_disabled`，暂态失败且旧令牌未到期时继续用旧令牌并 `refreshAt=Math.min(now+nF, expiresAt)`，`rejectedProjectTokenFingerprint` 等于缓存指纹（SHA-256 hex，`hR`）时强制重铸；铸造 `POST {bR(origin,loc)}/{apiKeyId}/access_tokens`，头 `{Authorization:\`Bearer ${a}\`,"Content-Type":"application/json"}`，体 `{clientType:"zcode",clientVersion:ri}`（+853300 起）；定位 `#n`（+855900）：`getCustomerInfo`（`Authorization` 原样）→ 非团队时滤掉 `projectType==="2"`、无项目的机构，取名含「默认机构」/「默认项目」者，否则第一个，找不到 → `project_token_project_unavailable`；key 列表 `GET .../api_keys`（bigmodel 族 `Authorization` 原样），按名 `zcode-api-key` 找，找不到 `POST {name:"zcode-api-key",usageScene:1}`；结果 `{organizationId,projectId,apiKeyId:_.data.apiKey}` 持久化为定位（`project-key-location:v1:...`），铸造返回 `{code:404}` 时删定位。请求包装 `RM`（`asar:out/host/index.js+1203500` 附近）：超时 15 s，404 → `{code:404}`，429/5xx/网络/超时 → 暂态错误。错误码映射（+855777）：`ProjectAccessTokenError` 的 code，或 `project_token_disabled|project_token_project_unavailable|project_token_invalid_response`，其余一律 `project_token_request_failed`。登录令牌为空或 accountId 为空 → `project_token_login_required`（+853442）。
- PAT 被拒刷新一次（`AccountRequestRetry` `$ye` @4144946）：响应 401 且不是请求安全类失败（`$Hs` @4144643 → `Vrt` @1090655：`VERIFY_APIKEY_EXPIRED`、`VERIFY_SIGNATURE_INVALID`、`"3007"`）时，带 `rejectedProjectTokenFingerprint` 重取一次 PAT 再发；只重试一次；重试是新 attempt，`x-request-id` 换新（`Jdt` @4068371）。

现状：`src/glm-llm/headers.ts` `buildAuthHeaders` 把 `credentialString(cred)`（`{apiKeyId}.{secret}`）填进 `x-api-key` 与 `authorization: Bearer`；`src/glm-llm/signing.ts` `ClientSigningManager.resolveParsedCredential`/`mintProjectJwt` 铸造 PAT 只喂签名，铸造失败退回 apiKey 形式，另有 60 s 铸造冷却（3.16.3 没有），只认 `code===200`，不看 `enable`，有效期取 JWT `exp`，到期前 5 分钟刷新。

改动：
- 新建 `src/glm-llm/auth/project-token.ts`：`ProjectAccessTokenClient` 移植上面全部语义（定位解析、缓存与抖动、暂态复用、指纹、错误码、15 s 超时、404 删定位）。入口 `resolve({oauthAccessToken, accountId, clientVersion, rejectedFingerprint?}) → {token, apiKeyId, organizationId, projectId, fingerprint}`；铸造前后比较存储里的 OAuth 令牌，变了抛 `project_token_scope_invalidated`（`_M` 的 `loadCodingPlanMaterial`，`asar:out/host/index.js+1204641` 附近）。定位在第 3 步只存内存，第 4 步接持久化。
- `src/glm-llm/signing.ts`：删掉铸造（`mintProjectJwt`、`resolveParsedCredential` 的铸造分支、`projectJwt`、`mintNegUntil`、`MINT_FAILURE_COOLDOWN_MS`、`BIGMODEL_HOST`、`SigningCredential.oauthAccessToken`）。签名凭证只剩 PAT，`parseSigningCredentialForm` 只保留 JWT 分支，并按 3.16.3 `D1r`（@1087575，m1-signing 报告 §1）补上 header `typ:"JWT"` 校验；`{id}.{secret}` 分支与其测试删除（通道不再持有这种凭证）。握手失败冷却、VERIFY 永久旁路两处偏离不在本任务内，原样保留（§8）。
- `src/glm-llm/headers.ts` `buildAuthHeaders(projectToken | jwt, ...)`：coding-plan 两个头都是 PAT；删 `credentialString`（`src/glm-llm/auth/types.ts`）。
- `src/glm-llm/zcode.ts` `stream`：coding-plan 先取 PAT（失败见第 2 项），签名凭证传 PAT；最终响应为 401 且正文不含 `VERIFY_APIKEY_EXPIRED|VERIFY_SIGNATURE_INVALID|3007` 时带指纹重取一次 PAT、换新 `x-request-id`、重新签名重发一次。

L2（旧代码上必红）：`tests/glm-zcode.spec.ts`「coding-plan 模型请求的 authorization 是 `Bearer <PAT>`、x-api-key 是 PAT，签名握手用 PAT（accessToken 形式）」；「401 非 VERIFY 时刷新 PAT 重发一次，第二次用新 PAT 与新 x-request-id，只重试一次」。新 `tests/glm-project-token.spec.ts`：响应码集合、缺 `enable`、`enable:false`、有效期取 `min(expiresAt*1000, start+expiresIn*1000)`、刷新窗口落在 [exp−180 s, exp−120 s]（注入 `now`、`random`）、暂态失败复用旧令牌且 5 s 后再试、指纹强制重铸、`projectType "2"` 被滤掉、`POST` 体含 `usageScene:1`、404 删定位后重新定位、错误码映射。

缺口：桌面 apiClient（`Wt` 所用的 `e.request`，`asar:out/host/index.js+145440`）是否给 bigmodel.cn 请求加默认头没核到底；通道按 3.16.3 传入的字面头发送（§8）。

### 第 2 项：拿不到 PAT 时照 3.16.3 报错（question-6 B）

3.16.3〔实读〕：`zhipu-account` 缺请求凭证抛 `new Ub(as.ModelRequestAuthMissing, \`Account model request auth is unavailable: ${i.providerId}/${i.modelId}\`)`（@4193871 附近）；`xpt` @4146619：`!o.headersApplied||!o.requestAuth` 抛 `Provider request auth was not returned before model request attempt.`，其余错误包成 `RuntimeHeadersRefreshError`（`wie` @4147581，消息取原错误）且不可重试。桌面壳失败时回 `{headersApplied:false,errorMessage:<错误消息>}`（`asar:out/host/index.js+441792`、`+443132`、`+510627`）。桌面错误消息：无 OAuth 访问令牌 → `Account request credential is unavailable: bigmodel`（`#t` 抛 `zc(t.family)`，+1200545 起）；无账号身份 → `loadIndividualPlanMaterial` 返回 null → `Account request credential is unavailable: account:bigmodel-individual-coding-plan`（`DY(a?.token,r)`）；PAT 客户端失败 → 上面的 `project_token_*` 码。渲染层没有为这些消息做本地化（`IntlProvider-Bw7hoRlp.js`、`styles-CQuzX8si.js` 无 `project_token`、`credential is unavailable`），原文直出。不退回 apiKey。

现状：铸造失败静默退回 apiKey，请求照发。

改动（`src/glm-llm/zcode.ts`）：coding-plan 取 PAT 失败时不发模型请求、不发路由与握手；`report('inactive', \`未拿到项目令牌（${code}），按 3.16.3 不发送；运行 /glm-login\`)`；抛 `new Error(\`glm-zcode: project access token unavailable (${code}) — run /glm-login to sign in again\`)`，`code` 是上面的 3.16.3 原文（逐字）。抛普通 `Error`，与现有「未登录」路径一致（运行时包不能从本仓库解析，不引入 `HarnessError`）。

L2（旧代码必红）：`tests/glm-zcode.spec.ts`「铸造返回 500（暂态）且无旧令牌时，流以 `project_token_request_failed` 与 `/glm-login` 失败，网关一条模型请求都没收到，行健康为 inactive」；「凭证没有 OAuth 令牌时消息为 `Account request credential is unavailable: bigmodel`」；`tests/health.spec.ts` 加 glm-llm 行的该原因。

### 第 3 项：agent/configs 只发 `x-api-key-id`；去掉 copy secret

3.16.3〔实读〕：`FGs` @4196232：`{"User-Agent":\`ZCode/${e??"unknown"}\`, ...e?{"X-ZCode-App-Version":e}:{}, ...jGs(t), ...o?{"x-api-key-id":o}:{}, Accept:"application/json"}`；`jGs` @4196407 按白名单 `NGs`（@4199110）把来源头改成规范名；来源头 `Aui` @14468324 → `Frn` @968479（`{...akr,"HTTP-Referer",...,"X-Device-Mid"}`，`akr` 先占 `User-Agent, HTTP-Referer, X-Title` 三个位置）。`refresh` 调 `FGs(this.appVersion, n, t.apiKeyId)`（@4201663 附近），`apiKeyId` 来自请求凭证（`Ngn` @3839971 的 `e.apiKeyId`，`createFactory` @3851919 的参数 `u`）。HTTP 客户端 `P5r` @2827718 `new Headers(e.headers)` 后交给 fetch，线上保留插入顺序与大小写：`User-Agent, X-ZCode-App-Version, HTTP-Referer, X-Title, X-Platform, X-Release-Channel, X-Client-Language, X-Client-Timezone, X-Os-Category, X-Os-Version, X-Device-Mid, x-api-key-id, Accept`。CLI 包、桌面 `index.js`、`chunk-5YNPFY3L.js` 都没有 `api_keys/copy` 与 `secretKey`（本次检索为 0）。签名凭证解析只需 PAT（JWT 形式下 HKDF 的 secret 就是整段 PAT）。所以 secret 在 3.16.3 账号模式里**哪里都不需要**。

现状：`src/glm-llm/endpoint-routing.ts` `refresh` 发 `x-api-key: <{id}.{secret}>`；`src/glm-llm/auth/resolver.ts` `getSecretKey` 调 `api_keys/copy/{apiKey}` 存 secret；配置请求不带 `X-Device-Mid`（路由服务构造时的身份没有 deviceMid）。

改动：
- 第 3 步（与第 1 项同提交）：`EndpointRoutingService.resolve(url, {apiKeyId?, zcodeJwt?})`，`refresh` 按 `FGs` 顺序组头，`x-api-key-id` 取 PAT 定位的 `apiKeyId`（可打印 ASCII 规范化，同 `Lpt`），不再发 `x-api-key`；`routedHandshake` 同样传 `apiKeyId`。start-plan 没有 apiKeyId，配置请求不带 key 头（与 3.16.3 start-plan 的请求凭证 `{apiKey:zcodeJwt}` 一致）。
- 第 4 步：存储去掉 secret（§3），删除 `src/glm-llm/auth/resolver.ts`，登录只存 OAuth 令牌。
- 第 6 步：配置请求头换成 `new Headers(FGs顺序对象)` 交给 fetch。

L2（旧代码必红）：`tests/glm-routing.spec.ts`「配置请求带 `x-api-key-id` 等于 PAT 的 apiKeyId，不带 `x-api-key`，没有任何头值含 secret」；第 4 步 `tests/glm-zcode.spec.ts`「登录流程不请求 `/copy/`，存储里没有 secret」。

### 第 4 项：X-Title `Z Code@electron`（question-8 B）

3.16.3〔实读〕：`Suc` @14422777 `"X-Title":\`Z Code@${n}\``，`n=t.sourceTitle??kuc()`；`kuc` @14423244：`process.argv.includes("app-server")||process.argv.includes("agent-server")?"electron":"cli"`；桌面以 `app-server --stdio` 起 agent。配置请求的来源头 `sourceTitle:"electron"`（@15096557）。

现状：`src/glm-llm/identity.ts` `DEFAULT_IDENTITY.sourceTitle: 'cli'`，DESIGN §4.2 记为 2026-10-27 定案。

改动：`DEFAULT_IDENTITY.sourceTitle = 'electron'`（模型请求与配置请求共用）。

L2（旧代码必红）：`tests/glm-transport.spec.ts`「LLM identity headers ...」断言 `X-Title === 'Z Code@electron'`；配置请求头断言同值。

### 第 5 项：max_tokens（question-7 B）

3.16.3〔实读〕：
- 主步（`pBa` @13320731）：`_=o.optionSpecs.maxOutputTokens.max`，`b=o.properties.contextWindow`，`je=VZ({modelMaxOutputTokens:_})`，`maxOutputTokens:aUo({baselineMaxOutputTokens:je,contextWindow:b,estimatedCurrentUsage:uzo(t.messages,t.sourceEntries),...})`（@13322324 附近）。`VZ` @13215775 `Qja(e.modelMaxOutputTokens)??Yja`，`Yja=32e3` @13216683。`aUo` @13215830：上下文窗口或估算无效时取基线；`t=Math.floor(e.contextWindow-e.estimatedCurrentUsage-1e3)`，`t<=0` 取基线，否则 `Math.min(基线,t)`。
- 估算 `uzo` @13313841：`CDn(e,t)?.tokenCount??TP(e)`。`CDn` @13313415：取 `d5o` @13260048（从后往前第一条带用量的助手条目）的基线；`a=o.contextUsageTokens===void 0?i:i+1`；`tokenCount=(o.contextUsageTokens??o.inputTokens)+TP(e.slice(a))`。`Xgt` @4979924：`input` 取 `tokens.input`（`Bla` @4980209：`input`，否则 `total−output`，否则 `cache.read+cache.write`），`contextUsageTokens = output>0 ? input+output : (total>=input ? total : undefined)`。ZCode 的 `tokens.input` 是 AI SDK 的总输入（含缓存读写，`G$` @4111537 `inputTokens:e?.inputTokens`；Anthropic 映射 `total:c+i+a` @3549947）。`TP` @5067698：每条消息 `Math.ceil(字符数/ere)`，`ere=3` @814022；字符 = `jda`（reasoning 取正文，其余经 `tsn` @1317782：text 原文、image `[Attached <mediaType>]` 等）以 `\n` 连接，加每个工具调用 `(name+JSON.stringify(input??{})).length`（`Fda` @5067856）。`TP` 统计的消息含系统消息（请求 `allowSystemInMessages:!0`，`Goo` @4102875）。
- 压缩（`c3a` @13387356 → `p3a` @13395552）：`Math.min(Math.min(VZ({modelMaxOutputTokens:max}),I0t),max)`，`I0t=2e4` @5070582。
- 辅助（`PP` @7759001，标题 `v4a` @13066475 `i.bind(PP(i))`）：`{reasoningLevel:values[0], maxOutputTokens:Math.min(5e3,max)}`。
- 目录（r33）：`.*glm-5\.3.*` → `contextWindow:1000000`、`maxOutputTokens.max:128000`、`reasoningLevel.values:["low","high","max"]`；匹配不区分大小写、锚定（`wYt` @557708，调用 @563982 传 `!0`），后命中的规则覆盖前者，Flash 同时命中。GLM-5.3 / Flash：主步通常 128000，压缩 20000，标题 5000。

现状：`src/glm-llm/anthropic.ts` `encodeRequest` 用 DSH 的 `maxTokens ?? 32000`；`models.ts` `GLM_DEFAULT_MAX_TOKENS=32000`；`resolveModel` 声明 `contextWindow: 512_000`。

改动：
- `src/glm-llm/models.ts`：移植 r33 中 GLM-5.3 系的目录规则（锚定、忽略大小写），给出 `contextWindow`、`maxOutputTokens.max`、`reasoningLevel.values` 与 thinking 映射；目录外 id 不匹配时保持现状（无 thinking 字段、`max_tokens` 用 DSH 值），DESIGN 写明。
- 新建 `src/glm-llm/token-budget.ts`：`VZ`、`aUo`、`uzo/CDn/d5o/Xgt/Bla/TP/jda/tsn/Fda` 的移植，作用在 DSH 请求消息上（含开头的 system 消息）。
- 用量基线：DSH 的 `GenerateOptions` 不带历史响应的用量。最接近的做法：解码器在每个响应的 `finish.replayState.response` 里记 `usage`（DSH 口径换算回 ZCode 口径：`input = inputTokens+cacheReadTokens+cacheWriteTokens`，`output`，`total`），信封改为只要知道模型就发（不再只在有 reasoning 时发），`version` 保持 1，`usage` 为可选字段；编码时从后往前找第一条信封带 `usage` 的助手消息当基线。
- `src/glm-llm/zcode.ts`：coding-plan 的 `max_tokens` 按请求类别取：主步 `aUo(...)`、`purpose==='compaction'` 取 `p3a`、`purpose==='session-title'` 取 `PP`；DSH 的 `maxTokens` 在 coding-plan 上不再使用。`resolveModel` 的 `contextWindow: 512_000` 与 `defaultMaxTokens: 32000` 不改（DSH 用它们做自己的压缩与预算，属于 DSH 控制的行为）。

L2（旧代码必红）：`tests/glm-transport.spec.ts`「`aUo` 边界：无效窗口、`t<=0`、`min`」「`TP` 按 3 字符一 token、工具调用计 name+JSON、图片计 `[Attached image/png]`」「`CDn` 用信封用量做基线、`contextUsageTokens` 缺失时从基线那条起算」；`tests/glm-zcode.spec.ts`「coding-plan 主步 `max_tokens` 为 128000 而非 DSH 给的 32000，压缩 20000，标题 5000」「历史估算逼近窗口时 `max_tokens = 1000000−估算−1000`」；解码测试「无 reasoning 的响应也带信封，信封含 usage」。

缺口（写进 DESIGN §4.6）：（a）基线只在本适配器产出、且运行时仍把 replayState 交给本适配器的助手消息上有；其他路由的历史只能整段 `TP` 估算；升级前的历史没有 usage。（b）ZCode 按 `sourceEntries` 与 `messages` 对齐取下标，DSH 只有一份消息列表，按它取。（c）ZCode 的消息模型（`toolCalls` 带已解析的 input、工具结果的文本）按 DSH 块近似：工具调用参数先 `JSON.parse` 再 `JSON.stringify`，解析失败计 `{}`；工具结果计其文本块与图片占位。（d）窗口取 3.16.3 目录的 1,000,000，DSH 在 512,000 前就会压缩，实际上主步恒为 128000；公式照移植。

### 第 6 项：请求体（model 大小写、thinking、output_config、键序、辅助请求）

3.16.3〔实读〕：
- `GZt` @526265：`aXi.get(e.toLowerCase())??e`，官方 id 表 `Cpr` @526343（`"GLM-5.3","GLM-5.3-Flash",...`）；`hne` 对账号 provider 用它规范 id。目录 `builtinModelIds:["GLM-5.3","GLM-5.3-Flash"]`。
- AI SDK `getArgs` @3603239：`Jt={model:this.modelId,max_tokens:It,temperature:o,top_k:a,top_p:i,stop_sequences:f,...thinking?,...output_config?,...,metadata?,...,system:dn.system,messages:dn.messages,...}`，返回 `{...Jt,tools:pr,tool_choice:$n,stream:I===!0?!0:void 0}`（@3607708）；空工具列表 `Jjs` @3543299 `e=e?.length?e:void 0` 返回 `tools:undefined`；`JSON.stringify` 丢掉 `undefined`。
- 选项映射 fetch `TQr` @3836714 解析正文、`maps.apply` 后再序列化；合并 `Jpr` @547136 / `Zpr` @547735：在克隆上逐键赋值，新键追加在末尾。目录 `modelApiRules` `.*glm-5\.3.*`（anthropic-messages）：`{"thinking":{"type":"enabled"},"output_config":{"effort":reasoningLevel}}`，后命中规则覆盖 `.*glm-5.*` 的 map（`Jpr` 同一路径两个选项写会抛错，所以每个选项只有一个生效的 map）。
- 结果键序：主步/压缩 `model, max_tokens, [temperature], metadata, system, messages, tools, stream, thinking, output_config`；标题 `model, max_tokens, metadata, system, messages, thinking, output_config`（无 `tools`、无 `stream`）。
- 档位：主步取会话选中的档位；压缩用会话模型（`c3a`：`o.model??jT(this,{selection:this.getSessionModelSelection()})`）；标题 `values[0]` 即 `low`。
- 标题走 `generateText`（非流式，`v4a`：`a.generateText({abortSignal:S,messages:h,tools:[]})`），压缩走流（`Xzo` @13380629 迭代流）。

现状：`encodeRequest` 键序 `model, max_tokens, stream, messages, system, tools, temperature, metadata`；`model` 原样（小写）；不发 thinking/output_config；标题也流式；文件头注释「the real client sends no thinking field」与目录不符。

改动：
- `src/glm-llm/anthropic.ts`：`encodeRequest(options, systemBlocks?, images?, userId?, wire?)`，前四个参数不变（探针 `scripts/probe/probe-llm.mjs` 照旧调用），`wire` 给出 `{model, maxTokens, stream, optionPatch?}`；有 `wire` 时按上面的键序组体，`optionPatch` 按 `Zpr` 语义追加；改正文件头注释。
- `src/glm-llm/models.ts`：`GZt` 与官方 id 表移植（id 表放进第 3 步建立的镜像文件 `src/glm-llm/zcode-wire.ts`，见第 11 条）。DSH 侧的模型 id 与回放信封里的 `model` 保持 `glm-5.3` / `glm-5.3-flash`，只有线上 `model` 用 ZCode 大小写。
- `src/glm-llm/zcode.ts`：coding-plan 的档位取 `request.reasoningEffort ?? 'high'`（DESIGN §4.6 定案的默认值），标题强制 `low`。
- 标题非流式（第 10 步）：`purpose==='session-title'` 时正文不带 `stream`，响应按非流式 JSON 解析，`decodeMessage(json, model)` 合成与流式相同的块序列（`block-start`/增量/`block-end`、合并后的用量、带信封的 `finish`）。

L2（旧代码必红）：`tests/glm-transport.spec.ts`「coding-plan 主步正文键序逐个等于上面的序列，`model` 为 `GLM-5.3` / `GLM-5.3-Flash`，`thinking:{type:'enabled'}`，`output_config.effort` 跟 DSH 档位（low/high/max），缺省 high」「标题请求键序无 `tools`、无 `stream`，effort 为 low」；`tests/glm-zcode.spec.ts`「标题请求非流式，网关回 JSON，DSH 收到的块与流式一致」。

缺口：DSH 若给 `temperature`，按 AI SDK 位置（`max_tokens` 之后）发送；3.16.3 的这类请求不设温度，是否设由 DSH 配置决定（DSH 控制）。`stop` 继续不发（3.16.3 不设 `stopSequences`）。系统提示的三块拆分不在十项之内（§8）。

### 第 7 项：User-Agent 与归因头

3.16.3〔实读〕：
- UA：`Y2` @3510311（`y4s` @3510098 先把键小写、后写覆盖先写，再 `new Headers`，`set("user-agent",[o,...t].filter(Boolean).join(" "))`，返回 `Object.fromEntries(n.entries())`）；provider-utils `mZr="4.0.27"` @3530239，`postJsonToApi` → `SZr`：`headers:Y2(t,\`ai-sdk/provider-utils/${mZr}\`,$ut())`，入参 `{"Content-Type":"application/json",...t}`；`Rh` @3505152 浅合并（provider 头在前、调用级头在后）；调用级头 `Hoo(e_n(e.resolved.headers,...),Vdt(e.statusContext))`（@4102834），`resolved.headers` 含 `Suc` 的 `"User-Agent":\`ZCode/${o}\``，所以 provider 级的 `ZCode/3.16.3 ai-sdk/anthropic/3.0.81` 被调用级覆盖。主步/压缩（`streamText`，调用级头原样）：`ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 <runtime>`；标题（`generateText` `Tro`，调用级头先过 `Y2(_??{},\`ai/${Xno}\`)`）：`ZCode/3.16.3 ai/6.0.193 ai-sdk/provider-utils/4.0.27 <runtime>`；`<runtime>` 见 §0 第 3 条。
- 归因头 `Vdt` @4065502：`x-request-id`、`x-zcode-session-type`（`coo` 合法值否则 `other`）、`x-zcode-trace-id`、`x-query-id`（`GWs` @4066115 去 `query_` 前缀）、`x-zcode-query-source`（须匹配 `/^[A-Za-z0-9_.:-]{1,128}$/u`）、`x-session-id`（`Hdt` @4066070 去 `sess_`/`subagent_agent_`）。`Gdt` @4067222：`requestId` 缺省 `crypto.randomUUID()`，`traceId: traceContext.traceId ?? metadata.traceId ?? iG()`，`queryId: traceContext.queryId ?? metadata.queryId`。会话类型 `Y0n` @4065835：非 AgentStep → `other`，主 agent → `main`，子代理 → `subagent`。查询来源：主步 `mDn` @13259914（`subagent_child`→`subagent`、`workflow_child`→`workflow_child`、否则 `main_turn`），压缩 `querySource:"compact"`（@13389086），标题 `v2n="session_title"`（@13069774）。回合 queryId：`zzo` @13357726 `b=n?.queryId??n?.inputId??hae()`，`hae` @12815948 `query_${crypto.randomUUID()}`；桌面输入 `O9` → `sendInput(..., {inputId:n.inputId, ..., queryId:n.inputId})`（@14502646），压缩与标题的追踪上下文由回合上下文 `nS` 派生，沿用同一 queryId。trace id 见 §0 第 2 条。

现状：`src/glm-llm/headers.ts`：UA 尾段 `ai-sdk/anthropic/3.0.81`；`requestAttribution` 只给 `sessionId` 与 `main|other`；trace id 每请求随机；不发 `x-query-id`、`x-zcode-query-source`；子代理也标 `main`。

改动：
- UA（第 6 步）：在 `headers.ts` 移植 `y4s`、`Y2`、`$ut`、`Rh`，按 3.16.3 的两级合并组头（provider 级 `Y2({"anthropic-version", "x-api-key":PAT, ...T5s(PAT, 身份头)}, "ai-sdk/anthropic/3.0.81")`，调用级 `{...身份头, ...归因头}`，标题调用级先 `Y2(…, "ai/6.0.193")`，最后 `Y2({"Content-Type":"application/json", ...Rh(provider级, 调用级)}, "ai-sdk/provider-utils/4.0.27", runtimeUA)`）。`$ut` 接受可注入的全局对象供测试。
- 归因（第 5 步）：适配器内按 DSH 会话保存 `{traceId, turnKey?, queryId}`（上限 256 个会话，最久未用者淘汰，淘汰后再出现的会话拿新 trace id，DESIGN 写明）。trace id：会话首次出现时 `randomUUID()`，子代理会话用父会话的。queryId：回合键 = 请求消息里最后一条 `role==='user'`、`source.kind==='user'`、带 `id` 的消息的 id；键变了就换新 queryId（`randomUUID()`）；标题请求没有回合键，用会话当前 queryId，会话还没有时先建一个并留给下一条主步认领（标题与第 1 步并发）。会话类型与来源：`purpose==='session-title'` → `other` + `session_title`；`compaction` → `other` + `compact`；否则子代理会话 → `subagent` + `subagent`，其余 `main` + `main_turn`。子代理判定：`ctx.get('agents')?.get(sessionId)?.session.header.origin === 'subagent'`（rc.3 dsh-session:1051–1053 校验 `parentSession`/`origin`，dsh-subagent:352–354 建子会话时写 `parentSession: parentHeader.id` 与 `origin: "subagent"`，dsh-agent:596 `get(id)`），父会话 id 取 `header.parentSession`；用户分叉的会话只有 `parentSession` 没有 `origin`，按主会话处理。`x-request-id` 每次发送新生成，PAT 刷新重试也换新，签名 VERIFY 阶梯的重发不换（3.16.3 的阶梯在同一 attempt 内）。
- `src/glm-llm/index.ts` 用 `ctx.get('agents')` 惰性取会话头传给适配器（同 `imageServices` 的做法）；`src/shared/dsh-min.ts` `SessionLike.header` 加 `parentSession?: string`、`origin?: 'subagent'`；`src/shared/lm-min.ts` `RequestMessageLike` 加 `id?: string`，`GenerateOptionsLike` 加 `sessionId?`、`purpose?`（`LlmStreamOptionsContractCheck` 照常约束）。

L2（旧代码必红）：`tests/glm-zcode.spec.ts`「同一会话两步：trace id 相同、query id 相同；新用户消息后 query id 变、trace id 不变；另一会话 trace id 不同」「标题请求带该会话当前 query id、`x-zcode-query-source: session_title`、`other`」「压缩 `compact` + `other`」「`agents` 报告 `origin:'subagent'` 的会话：`subagent` + `subagent`，trace id 等于父会话」「主步 UA 与标题 UA 两种字面值（注入的全局对象分别给 `navigator.userAgent` 与只有 `process.version`）」；`tests/glm-transport.spec.ts` `Y2` 小写与覆盖语义。

缺口：（a）回合边界：DSH 不给回合 id；goal 轮次、跟进消息若不以 `source.kind==='user'` 的用户消息开头，会沿用上一回合的 queryId（3.16.3 每个输入换新）。（b）3.16.3 的 queryId 是桌面输入的 commandId；通道生成 UUID，值域不同、结构相同。（c）3.16.3 的 `workflow_child`（会话类型 `other`、来源 `workflow_child`）在 DSH 里没有找到对应的会话标记，不映射。（d）`agents` 服务取不到会话时按主会话处理。（e）子代理回合的 queryId 由子运行时新建（`executeTurn(..., {traceContext:t.traceContext})`，未传 queryId；参数到 `zzo` 的对应属推断），通道同样在子会话第一条用户消息处新建。

### 第 8 项：头名大小写与线上顺序

3.16.3〔实读 + 本机 undici 实测〕：见 §0 第 1 条。签名器 `sendSigned`（@3828487 附近）：`c=zrt(t.headers)`（`zrt` @1089207：`new Headers(e)` 后删 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-Client-Pow, X-App-Id, X-Client-Sign-Verified`），然后依次 `c.set("X-Client-Ts")`、`"X-Client-Version"`、`"X-Client-Sig"`、`"X-Session-Id"`、`"X-Client-Nonce"`、`"X-App-Id"`、`"X-Client-Pow"`；`x-session-id` 已在前段，`set` 原位改值改名。请求先经 `O1r` @1088463 `new Request(e,t)`。路由 `f5s`：`let i=new Headers(t?.headers??o);i.delete("host");for(...)i.set(a,c)`。无签发送（握手失败）走 `zrt` 但不 `set`。有代理或自定义 CA 时网络层改走 `node:https`，头经 `Headers.forEach` 成为小写字母序（`rdt` @3837494、`d5s`）；本机没有代理环境变量，默认路径是 fetch。

本包实测（2026-10-28）：插入序 `http-referer, user-agent, x-zcode-app-version, x-title, ..., x-api-key, authorization, anthropic-version, content-type, x-client-ts, x-client-version, x-client-sig, x-session-id, x-client-nonce, x-app-id, x-client-pow, x-zcode-authorization`（`x-session-id` 被移进签名块）。

改动（第 6 步）：
- `src/glm-llm/signing.ts`：签名入口改收 `Headers`，按 `zrt` + 七次 `set` 原样产出 `Headers`；无签路径同样经 `zrt`。
- `src/glm-llm/zcode.ts`：AI SDK 阶段的普通对象（第 7 项的 `Y2` 产物）→ 签名 → `const routed = new Headers(signed); routed.delete('host'); routed.set('X-ZCode-Authorization', ...)` → `fetch(url, {headers: routed})`。不手排、不手动改大小写，靠同一条 `Headers` 链得到同一结果。
- `src/glm-llm/endpoint-routing.ts`：配置请求 `new Headers(FGs 顺序对象)` 交给 fetch（第 3 项）。

L2（旧代码必红）：`tests/glm-zcode.spec.ts` 用 127.0.0.1 本地服务器读 `rawHeaders`：签名成功时头名前缀逐个等于
`anthropic-version, authorization, content-type, http-referer, user-agent, x-api-key, x-client-language, x-client-timezone, x-os-category, x-os-version, x-platform, x-query-id, x-release-channel, x-request-id, X-Session-Id, x-title, x-zcode-agent, x-zcode-app-version, x-zcode-query-source, x-zcode-session-type, x-zcode-trace-id, X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow, X-ZCode-Authorization`；握手失败时为同一前段（`x-session-id` 小写）接 `X-ZCode-Authorization`；配置请求为第 3 项的序列。之后 undici 自加的 `accept`、`accept-language`、`sec-fetch-mode`、`accept-encoding`、`content-length` 不断言。

### 第 9 项：metadata.user_id 的 device_id（用户 2026-10-28 追加决定）

3.16.3〔实读〕：`Ydt` @4073238：只对 `providerKind==="anthropic"`，`await Qro({env:e.env})`，`ZWs` @4073127：`JSON.stringify({device_id:e.deviceMid,account_uuid:"",session_id:Hdt(e.sessionId)??""})`。`Qro` @4062043：按状态文件路径缓存 promise（`Xro`），`createId` 缺省 `tG`（@1013439，`globalThis.crypto.randomUUID()`，退路 `getRandomValues` 拼 v4）；`EWs(...).catch(()=>a())`，即任何失败都用本进程生成的 id。`CWs` @4062252：`baseDir = e.baseDir ?? env.ZCODE_DATA_BASE_DIR?.trim() ?? homedir()`，空串回落 `homedir()`，`join(NWs(base), ".zcode","v2","telemetry-state.json")`（`NWs` @4064238 展开 `~`、`~/`，否则 `resolve`）。`EWs` @4062442：先无锁读（`AWs`/`eoo`：`deviceMid` 为非空字符串），没有再在锁内重读并生成写回。`too` @4062778：JSON 解析失败或非对象返回 `{}`。`PWs` @4062889：`mkdir -p` 目录，临时文件 `.${basename}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`，`writeFile(JSON.stringify(t,null,2))` 后 `rename`，失败 `unlink` 临时文件再抛。`RWs` @4063231：锁文件 `telemetry-state.lock`（同目录），`open(...,"wx")`，写 `{createdAt,pid}`，执行回调，`close` 后 `unlink`；`EEXIST` 时 `DWs` @4063741 判断陈旧（`mtime` 未超 `TWs=300 s` 且属主进程存活则不陈旧；否则删锁重试），不陈旧就睡 `kWs=10 ms`，最多 `xWs=200` 次，然后抛 `CLI telemetry state lock timeout`；`OWs` @4063923 读锁属主，`MWs` @4064119 `process.kill(pid,0)`，`EPERM` 视为存活。常量 @4064703。配置请求的 `X-Device-Mid` 另走只读的 `Kuc` @14468898（路径 `Juc` @14468783：`env.ZCODE_DATA_BASE_DIR?.trim()||homedir()`；`deviceMid` 须为字符串，trim 后非空且可打印 ASCII，只缓存成功值）。

现状：`src/glm-llm/identity.ts` `ensureDeviceMid` 读写 `<home>/device-mid.txt`；模型请求 metadata 用它；配置请求不带 `X-Device-Mid`。

改动（第 2 步）：新建 `src/glm-llm/device-mid.ts`，逐函数移植 `Qro/CWs/EWs/AWs/eoo/too/PWs/RWs/DWs/OWs/MWs/NWs/tG` 与 `Juc/Kuc`，`env` 从适配器选项传入；模块级按路径缓存 promise。`zcode.ts` 的 metadata 用 `Qro` 结果；路由服务每次刷新时经 `Kuc` 取 `X-Device-Mid`（`Aui` 每次刷新都调用）。删除 `ensureDeviceMid` 与 `device-mid.txt` 的读写；已有的 `device-mid.txt` 不删（用户数据），文档记为不再使用。写回失败时 3.16.3 静默用临时 id；通道照此发送，并在行健康成功原因后注明「设备 ID 未能写入 ZCode 状态文件，本进程用临时 ID」（只加说明，不改状态）。

L2（旧代码必红，全部在 `mkdtemp` 临时目录里，经 `ZCODE_DATA_BASE_DIR` 指过去）：新 `tests/glm-device-mid.spec.ts`「已有 `deviceMid` 时原样使用且文件不变」「缺失时生成并写回、保留其他键、两空格缩进 JSON、目录里不留 `.tmp` 与锁」「同一路径并发两次只生成一个」「持有活进程锁时等待、陈旧锁（mtime 超 300 s）被删除」「写失败（目录换成同名文件）仍返回生成的 id」「`Kuc` 不生成、不缓存失败、要求可打印 ASCII」；`tests/glm-zcode.spec.ts`「metadata.user_id 的 device_id 等于状态文件里的值」「配置请求带同一 `X-Device-Mid`」。测试不打印 id 值，只比相等。

### 第 10 项：只由 DSH 控制的差异

写进 DESIGN §4 新增小节（第 4.8 节「与 3.16.3 的已知差异」），逐条：标题请求的时机（3.16.3 在回合开始时以 `deferIfProviderRuntimeHeadersRefresh:!0` 尝试 @13367458，账号模式推迟到回合完成后 `ke&&re&&DBo.call(` @13370395；DSH 与第 1 步并发）与提示词（3.16.3 `y4a`，首条输入截 1200 字符）；压缩的触发与提示词；DSH 声明给运行时的 `contextWindow 512000` 与 `defaultMaxTokens 32000`（DSH 的预算输入，线上 `max_tokens` 不受影响）；DSH 是否带 `temperature`；回合边界与 workflow 子会话（第 7 项缺口）；tools 集合与系统提示内容（DSH 与方言决定）。

## 3. 凭据存储迁移（第 4 步）

目标：存储里不再有 secret，登录（OAuth 令牌）一条都不丢。

- 记录格式 v2：`{version: 2, provider: 'bigmodel', oauthAccessToken?, userId?, jwt?, location?: {accountId, organizationId, projectId, apiKeyId}}`。`location` 是 3.16.3 `project-key-location:v1` 的对应物，键里有 `accountId`，读出时只在 `accountId` 等于当前 `userId` 时使用。
- 读：`loadCredential` 解密后若无 `version`（v1：`{apiKey, provider, userId?, jwt?, oauthAccessToken?}`）：
  - 有 `oauthAccessToken` 或 `jwt`：组 v2（丢弃 `apiKey`，连同其中的 secret；`oauthAccessToken`、`jwt`、`userId` 原样带过），用现有 `saveCredential`（临时文件 + `rename`）原子写回；写回失败继续用内存里的 v2，下次读再试；从不清空、从不删除文件。
  - 两者都没有：文件不动，按未登录 coding-plan 处理（取 PAT 时报 `Account request credential is unavailable: bigmodel`，提示 /glm-login）。
- 写：`ZcodeLogin.settle` 只存 `{version:2, provider, oauthAccessToken, userId?, jwt?}`，不再调 `getCustomerInfo`、`api_keys`、`copy`（3.16.3 桌面登录只存令牌，定位在首次需要 PAT 时惰性解析）。PAT 客户端解析出定位后读-改-写存储保存 `location`；铸造返回 404 时删 `location`。
- `/glm-status`：`keyPreview` 取 `location.apiKeyId` 前 6 位加「…」，未定位时为 `unresolved`（`ui/src/channel.js` `parseStatus` 的正则 `Key ([\w…]+)` 仍能解析）。设置页「登录有效期」文案 `coding-plan key 长期有效` 改为说明项目令牌自动续期、OAuth 失效需 /glm-login。
- 降级：v2 之后若装回旧版 bundle，旧代码要求 `apiKey` 字段，会显示未登录，需要 /glm-login。写进 DESIGN §4.1。
- 并存的旧副本：主检出 `.llm/credentials.json`（DESIGN §2.4，待 `m1-cleanup` 删除）不在迁移范围内，仍含 secret；在文档里点明，由 `m1-cleanup` 处理。
- 运行中的旧代码：桌面版重启前跑的是旧代码，它读同一个 `~/.dsh/glm-hourness/credentials.json`。迁移只在新代码首次读取时发生，所以合入后到批次 L4 重启前，任何新代码都不得读真实凭证目录（第 12 步的沙盒运行用副本）；`scripts/smoke-zcode-authorized.mjs` 会读真实目录，DESIGN 里注明重启前不要运行。
- L2（`tests/glm-auth.spec.ts`）：v1（含 secret）读取后返回 v2，重新解密文件得到的记录没有 `apiKey`、任何字段都不含 secret 子串，OAuth/jwt/userId 不变；写回失败（`rename` 抛错）时仍返回可用记录、原文件字节不变；v1 无 OAuth 无 jwt 时文件字节不变；v2 原样读出；损坏与解密失败照旧抛错；`location` 的 `accountId` 不符时不用。

## 4. 失败即停的文案

- 抛出：`glm-zcode: project access token unavailable (<3.16.3 原文>) — run /glm-login to sign in again`。
- `<3.16.3 原文>` 取值：`Account request credential is unavailable: bigmodel`（无 OAuth 令牌）、`Account request credential is unavailable: account:bigmodel-individual-coding-plan`（无 `userId`）、`project_token_login_required`、`project_token_disabled`、`project_token_project_unavailable`、`project_token_invalid_response`、`project_token_scope_invalidated`、`project_token_request_failed`（其余，含暂态失败且无可用旧令牌）。
- 行健康：`未拿到项目令牌（<原文>），按 3.16.3 不发送；运行 /glm-login`，状态 inactive。
- 依据：3.16.3 渲染层不翻译这些消息，原文直出（§2 第 2 项）；英文外壳沿用本通道现有错误的写法。

## 5. 编码了旧线上形态、必须改的测试与探针

- `scripts/probe/`：无断言需要改。`probe-llm.mjs` 调 `encodeRequest({...request, messages}, [], images)`、用 `GLM_MODELS`、`glmInputModalities`、`prepareRequestImages`、`asAttachments`、`glmImageRequestTarget`、`splitSystemPrompt`；这些导出名与前四个参数保持不变。`run-probe.mjs` 检查 `/glm-status` 首行以 `glm-zcode：未登录（套餐 coding-plan）` 开头，未登录文案保持不变。
- `tests/glm-transport.spec.ts`：`X-Title 'Z Code@cli'` 与身份头键序断言、`ANTHROPIC_SDK_UA`、`buildAuthHeaders` 双头取 `sk-full`、`encodeRequest` 的 `max_tokens: 4096` 与 `stream` 位置、`buildTraceHeaders` 的合成值、`ensureDeviceMid` 测试、回放信封「无 reasoning 不发信封」。
- `tests/glm-zcode.spec.ts`：`credential = {apiKey:'id.secret', oauthAccessToken}`、`authorization === 'Bearer id.secret'`、`User-Agent` 含 `ANTHROPIC_SDK_UA`、混合大小写的头名（`X-Client-Sig`、`X-ZCode-Authorization` 为对象最后一个键）、`gatewayFetch` 让铸造 500 后照发、`sealedSigningKey('secret','id')`（改为对 PAT 整段做 HKDF，AAD 为 PAT 的 `api_key` 声明）、登录测试里的 `/copy/` 与 `keyPreview 'kk.ss'`、`status` 的 `'id.sec'` 预览。
- `tests/glm-signing.spec.ts`：`{id}.{secret}` 解析与握手测试、两条铸造测试（移到 `tests/glm-project-token.spec.ts` 并按 3.16.3 改写）。
- `tests/glm-auth.spec.ts`：两条 resolver 测试（随 `resolver.ts` 删除，语义移到 project-token spec）。
- `tests/glm-routing.spec.ts`：配置请求头断言新增。
- `tests/health.spec.ts`：glm-llm 行新增 PAT 原因；未登录原因不变。

## 6. 文档改动清单（各步同提交，整条重写，不追加）

`docs/DESIGN.md`：
- §2.4 表与「凭证与 deviceMid」段：deviceMid 改为 ZCode 状态文件（第 2 步）；凭证内容去掉 API Key（第 4 步）。
- §2.4a 接口对照表：新增 `agents.get(id).session.header.origin` / `parentSession`（glm-llm，dsh-agent:596、dsh-session:1051–1053、dsh-subagent:352–354）一行（第 5 步）。
- §2.5 行健康表 glm-llm 行：加「未拿到项目令牌」原因与设备 ID 说明（第 2、3 步）。
- §4 开头请求流程句：改为「加载凭证 → 项目令牌（拿不到即失败）→ 设备 ID → 端点路由 → 头 → 签名 → 传输」（第 3 步）。
- §4.1：整节重写为 OAuth 登录只存令牌、PAT 客户端、定位持久化、v2 记录与迁移、降级说明、失败即停（第 3、4 步）。
- §4.2：`X-Title` 一条整条重写为用户 2026-10-28 定案 `electron`（question-8），取代 2026-10-27 的 `cli` 定案；UA 构造（第 6 步）；配置请求头（第 3、6 步）。
- §4.3：签名凭证只用 PAT；删「铸造失败退回 apiKey」「铸造冷却」相关句；「`x-zcode-authorization` 排在签名头之后……与 3.16.3 的组装顺序一致」与「头序」实测句整条按 §0 第 1 条重写（第 6 步）；实测段在第 12 步按新运行重写。
- §4.4：配置请求只发 `x-api-key-id`、带 `X-Device-Mid`、`X-Title electron`（第 3 步）。
- §4.5：请求体规则（键序、`model` 大小写、thinking/output_config、标题非流式）（第 8、10 步）。
- §4.5b「同批补上的请求细节」段：整段重写为新的归因规则（第 5 步）。
- §4.6：线上 id 大小写、目录规则来源（r33）、`max_tokens` 规则与估算缺口、512k/1M 的分工（第 8、9 步）。
- 新增 §4.8 与 3.16.3 的已知差异（第 10 项清单，加 start-plan 未改、目录取 r33 的假设）（第 11 步汇总，前面各步各自写入本步相关的条目）。
- §5.8 表第 16 行（thinking 与采样参数）、第 18 行（请求归因：子代理改为经会话头判定）（第 5、8 步）。
- §7 表 glm-llm 行：拿不到 PAT 时 GLM 不可用、行健康上报（第 3 步）。

`docs/FACTS.md`：
- §1：`X-Title` 行补「配置请求来源头 `sourceTitle:"electron"`（@15096557）」；新增事实行（每行带本计划核过的偏移）：账号模式请求凭证（`x5s`、`T5s`、`PQr`、桌面 `resolveCurrent`）；拿不到凭证的错误（`ModelRequestAuthMissing` 文案、`RuntimeHeadersRefreshError`、桌面错误原文、渲染层无本地化）；PAT 客户端常量与语义（`chunk-5YNPFY3L.js` 偏移）；PAT 被拒刷新一次（`$ye`、`$Hs`、`Vrt`）；配置请求头（`FGs`、`jGs`、`NGs`、`Frn`、`P5r`）；UA（`Y2`、`$ut`、`mZr`、`Xno`、`Tro` 与 `Aro` 的差别）；头链与线上顺序（`O1r`、`zrt`、`sendSigned`、`f5s`，本机 undici 实测）；请求体键序（`getArgs`、`TQr`、`Jpr`/`Zpr`、`Jjs`）；`GZt` 与官方 id 表；目录规则（r33 的 GLM-5.3 系、`wYt` 忽略大小写）；`max_tokens`（`VZ`、`aUo`、`Yja`、`p3a`、`I0t`、`PP`）与估算（`uzo`、`CDn`、`d5o`、`Xgt`、`Bla`、`TP`、`ere`、`G$`）；归因（`Vdt`、`Gdt`、`Y0n`、`mDn`、`hae`、`nS`/`Lw`、根追踪上下文、`O9`）；设备 ID（`Qro` 一族、`ZWs`、`Ydt`、`Kuc`）；标题与压缩（`v4a`、`y4a`、`c3a`、`Xzo`）；3.16.3 不调用 `api_keys/copy`。
- 「默认 `max_tokens` 32000；thinking 启用时剥离采样参数」一行整条重写：3.16.3 主步 `aUo`、压缩 20000、辅助 5000；thinking 经选项映射追加，AI SDK 不知道 thinking，不剥离采样参数。
- §2.1：补 ZCode 账号模式模型请求以 PAT 同时填 `Authorization: Bearer` 与 `x-api-key`。
- §5 挂账「签名对 coding-plan 1.5 倍套餐扣减的影响」一行整条重写：按用户 2026-10-28「看量或者扣减看不出来的。你就代码级别一样就行」不做额度测量，以代码级一致验收；延迟部分保留。

`docs/HANDOFF.md`：第 2 条（`X-Title` 保持 `cli`）、第 4 条与 §6（`device-mid.txt`、凭证内容）在对应步骤里整条重写；第 12 步写入 m1-parity 现状（已合入、待批次 L4、首次重启会迁移凭证、重启前不要运行读真实凭证的脚本）。

## 7. 实施顺序

每步结束：工作树 `git status` 只含本步文件，提交一次。`npm test` 前按 §1 设 `ZCODE_BUNDLE` 并临时复制 `zcode_system.json`，跑完删除。

# Implementation Plan

- [ ] 1. X-Title 改为 `Z Code@electron`（第 4 项）。
      `DEFAULT_IDENTITY.sourceTitle = 'electron'`；身份头测试改断言；DESIGN §4.2 的 X-Title 条与 HANDOFF 第 2 条整条重写（用户 2026-10-28 定案，question-8），FACTS §1 X-Title 行补配置请求来源头。
      Files: src/glm-llm/identity.ts, tests/glm-transport.spec.ts, docs/DESIGN.md, docs/FACTS.md, docs/HANDOFF.md
      Verify: `npm run build` 通过；`node --experimental-strip-types tests/glm-transport.spec.ts` 全过（旧代码上新断言红）；`npm test` 全绿。

- [ ] 2. 设备 ID 按 3.16.3 `ensureCliDeviceMid` 移植（第 9 项，用户追加决定）。
      新建 `device-mid.ts`（§2 第 9 项的全部函数、常量与锁语义，路径来自 `env.ZCODE_DATA_BASE_DIR` 或 homedir）；`zcode.ts` metadata 用它，删除 `ensureDeviceMid` 与 `device-mid.txt` 读写；路由刷新经 `Kuc` 端口带 `X-Device-Mid`；适配器把 `env` 传给两者；写回失败时行健康成功原因加说明。所有构造适配器的测试 `env` 带临时 `ZCODE_DATA_BASE_DIR`。新 spec 追加进 `package.json` 的 `test` 链。DESIGN §2.4、§2.5、§4.2、§4.5b（metadata 句）与 HANDOFF §6 重写；FACTS 加设备 ID 行。
      Files: src/glm-llm/device-mid.ts（新）, src/glm-llm/identity.ts, src/glm-llm/zcode.ts, src/glm-llm/endpoint-routing.ts, tests/glm-device-mid.spec.ts（新）, tests/glm-transport.spec.ts, tests/glm-zcode.spec.ts, tests/glm-routing.spec.ts, package.json, docs/DESIGN.md, docs/FACTS.md, docs/HANDOFF.md
      Verify: `npm run build`；`node --experimental-strip-types tests/glm-device-mid.spec.ts`、`tests/glm-zcode.spec.ts`、`tests/glm-routing.spec.ts` 全过；跑完检查 `%USERPROFILE%\.zcode\v2\` 的修改时间没有变化（只看时间戳，不读内容）；`npm test` 全绿。

- [ ] 3. coding-plan 模型请求改用 PAT，拿不到即失败，配置请求改发 `x-api-key-id`（第 1、2 项与第 3 项的线上部分；同一凭据路径，一个提交）。
      新建 `auth/project-token.ts`（3.16.3 PAT 客户端完整移植，定位暂存内存）；`signing.ts` 去掉铸造与 `{id}.{secret}` 分支、补 `typ:"JWT"` 校验；`headers.ts` 双头用 PAT、删 `credentialString`；`endpoint-routing.ts` `resolve(url, {apiKeyId, zcodeJwt})` 与 `FGs` 顺序；`zcode.ts` 先取 PAT、失败按 §4 报错与上报、401 非安全类失败时刷新 PAT 重发一次（新 `x-request-id`）、`routedHandshake` 传 apiKeyId。新建镜像文件 `src/glm-llm/zcode-wire.ts`（只含字面常量：`project_token_*` 码、`zcode-api-key`、`x-api-key-id` 等 CLI 包里能逐字找到的串）并加入 `scripts/check-verbatim.mjs` 的 `MIRROR_FILES`；`Account request credential is unavailable: ` 只在桌面壳里，放在 `project-token.ts` 并注明 asar 偏移。新 spec 进 `test` 链；删除代码使基线条目消失时 `npm run lint:update`。DESIGN §4、§4.1（PAT 部分）、§4.3、§4.4、§2.5、§7 与 FACTS 对应行重写。
      Files: src/glm-llm/auth/project-token.ts（新）, src/glm-llm/zcode-wire.ts（新）, src/glm-llm/signing.ts, src/glm-llm/headers.ts, src/glm-llm/auth/types.ts, src/glm-llm/endpoint-routing.ts, src/glm-llm/zcode.ts, scripts/check-verbatim.mjs, tests/glm-project-token.spec.ts（新）, tests/glm-zcode.spec.ts, tests/glm-signing.spec.ts, tests/glm-routing.spec.ts, tests/glm-transport.spec.ts, tests/health.spec.ts, package.json, eslint-suppressions.json / knip-baseline.json / .jscpd-baseline.json（仅当 lint:update 改动）, docs/DESIGN.md, docs/FACTS.md
      Verify: `npm run build`；`node --experimental-strip-types tests/glm-project-token.spec.ts`、`tests/glm-zcode.spec.ts`、`tests/glm-signing.spec.ts`、`tests/glm-routing.spec.ts`、`tests/health.spec.ts` 全过（§2 第 1–3 项列出的测试在旧代码上红）；`npm run check:verbatim` 报 OK 且条目数增加；`npm test` 全绿。

- [ ] 4. 凭据存储 v2：去掉 secret 与 copy 调用，迁移旧记录，定位持久化，登录只存令牌（第 3 项的存储部分，依赖第 3 步）。
      按 §3 实现读时迁移与写回、`location` 的读-改-写与 404 删除；`ZcodeLogin.settle` 只存令牌；删除 `auth/resolver.ts`（其 `requestBizApi` 的响应码判断已在 `project-token.ts` 里按 3.16.3 `Ic` 实现）；`status()` 的 `keyPreview` 规则；`ui/src/channel.js` 登录有效期文案。DESIGN §4.1（存储、迁移、降级、旧副本、重启前不跑真实凭证脚本）、§2.4 与 FACTS 重写。
      Files: src/glm-llm/auth/types.ts, src/glm-llm/auth/store.ts, src/glm-llm/auth/project-token.ts, src/glm-llm/zcode.ts, src/glm-llm/login-row.ts, src/glm-llm/auth/resolver.ts（删除）, ui/src/channel.js, tests/glm-auth.spec.ts, tests/glm-zcode.spec.ts, tests/glm-project-token.spec.ts, docs/DESIGN.md, docs/FACTS.md, docs/HANDOFF.md
      Verify: `npm run build`（含 `build-ui`）；`node --experimental-strip-types tests/glm-auth.spec.ts`、`tests/glm-zcode.spec.ts`、`tests/glm-project-token.spec.ts` 全过（§3 的迁移测试在旧代码上红：旧代码读 v1 后文件仍含 secret）；`npm test` 全绿。

- [ ] 5. 归因头：会话级 trace id、回合级 query id、查询来源、子代理会话类型（第 7 项除 UA 外）。
      `headers.ts` 新归因（§2 第 7 项规则，含 256 会话上限）；`zcode.ts` 每请求取会话状态、`x-request-id` 规则；`index.ts` 经 `ctx.get('agents')` 惰性提供会话头；`dsh-min.ts` 与 `lm-min.ts` 加字段。DESIGN §4.5b 段、§5.8 第 18 行、§2.4a 新行与 §4.8 相关条目；FACTS 归因行。
      Files: src/glm-llm/headers.ts, src/glm-llm/zcode.ts, src/glm-llm/index.ts, src/shared/dsh-min.ts, src/shared/lm-min.ts, tests/glm-zcode.spec.ts, tests/glm-transport.spec.ts, tests/glm-channel.spec.ts, docs/DESIGN.md, docs/FACTS.md
      Verify: `npm run build`（`LlmStreamOptionsContractCheck` 仍成立）；`node --experimental-strip-types tests/glm-zcode.spec.ts`、`tests/glm-transport.spec.ts`、`tests/glm-channel.spec.ts` 全过；`npm test` 全绿。

- [ ] 6. User-Agent 构造与头的线上形态（第 7 项 UA、第 8 项）。
      `headers.ts` 移植 `y4s`/`Y2`/`$ut`/`Rh` 并按两级合并组头（标题多一段 `ai/6.0.193`）；`signing.ts` 改为 `Headers` 入出、`zrt` + 七次 `set`；`zcode.ts` 路由 `new Headers(signed)` + `delete('host')` + `set`，以 `Headers` 交给 fetch；`endpoint-routing.ts` 配置请求以 `Headers` 发送。UA 版本串（`ai-sdk/provider-utils/`、`ai-sdk/anthropic/`）加入 `zcode-wire.ts`（版本号短于检查阈值，与前缀分开写）。测试用 127.0.0.1 本地服务器断言 §2 第 8 项的头名序列；其余测试读头改用 `new Headers(init.headers).get(...)`。DESIGN §4.2、§4.3（头序句）、FACTS UA 与头链行重写。
      Files: src/glm-llm/headers.ts, src/glm-llm/signing.ts, src/glm-llm/zcode.ts, src/glm-llm/endpoint-routing.ts, src/glm-llm/zcode-wire.ts, tests/glm-zcode.spec.ts, tests/glm-signing.spec.ts, tests/glm-routing.spec.ts, tests/glm-transport.spec.ts, docs/DESIGN.md, docs/FACTS.md
      Verify: `npm run build`；`node --experimental-strip-types tests/glm-zcode.spec.ts`（本地服务器头序测试在旧代码上红）、`tests/glm-signing.spec.ts`、`tests/glm-routing.spec.ts`、`tests/glm-transport.spec.ts` 全过；`npm test` 全绿。

- [ ] 7. 请求体：线上 model 大小写、thinking 与 output_config、3.16.3 键序，改正 anthropic.ts 文件头注释（第 6 项，`max_tokens` 暂用现值）。
      `models.ts` 移植 r33 的 GLM-5.3 系规则与 `GZt`（官方 id 表进 `zcode-wire.ts`）；`anthropic.ts` `encodeRequest` 加第 5 个可选参数 `wire`，按键序组体并按 `Zpr` 语义追加 `optionPatch`；`zcode.ts` coding-plan 传 `wire`（档位默认 high）；start-plan 与探针不传，形态不变。DESIGN §4.5、§4.6、§5.8 第 16 行；FACTS 请求体与目录行。
      Files: src/glm-llm/models.ts, src/glm-llm/anthropic.ts, src/glm-llm/zcode.ts, src/glm-llm/zcode-wire.ts, tests/glm-transport.spec.ts, tests/glm-zcode.spec.ts, docs/DESIGN.md, docs/FACTS.md
      Verify: `npm run build`；`node --experimental-strip-types tests/glm-transport.spec.ts`、`tests/glm-zcode.spec.ts` 全过（键序、`GLM-5.3`、thinking/output_config 断言在旧代码上红）；`npm run check:verbatim` OK；`npm test` 全绿。

- [ ] 8. max_tokens 按 3.16.3 规则，含估算器与用量基线（第 5 项，依赖第 7 步的目录规则）。
      新建 `token-budget.ts`（§2 第 5 项全部函数）；解码器每个响应都发回放信封并在 `response.usage` 记 ZCode 口径用量（流式 `decodeSse`，第 9 步的非流式同样）；`replayBlocksOf` 接受带或不带 `usage` 的 version 1；`zcode.ts` 主步/压缩/标题三种取值，coding-plan 不再用 DSH 的 `maxTokens`。DESIGN §4.6 与 §4.8 的估算缺口；FACTS `max_tokens` 与估算行，并整条重写「默认 `max_tokens` 32000」一行。
      Files: src/glm-llm/token-budget.ts（新）, src/glm-llm/anthropic.ts, src/glm-llm/zcode.ts, tests/glm-transport.spec.ts, tests/glm-zcode.spec.ts, docs/DESIGN.md, docs/FACTS.md
      Verify: `npm run build`；`node --experimental-strip-types tests/glm-transport.spec.ts`（含 rc.3 `BlockAssembler` 组装后信封仍对齐的用例）、`tests/glm-zcode.spec.ts` 全过；`npm test` 全绿。

- [ ] 9. 会话标题请求按 `generateText` 发送：非流式、无 tools、effort low、max_tokens 5000、标题 UA（第 6 项辅助请求，依赖第 6–8 步）。
      `anthropic.ts` 新增 `decodeMessage(json, model)` 合成块序列与信封；`zcode.ts` `purpose==='session-title'` 时正文不带 `stream`、按 JSON 读响应、非 2xx 走同一错误路径。DESIGN §4.5 与 §4.8（标题时机、提示词仍由 DSH 决定）。
      Files: src/glm-llm/anthropic.ts, src/glm-llm/zcode.ts, tests/glm-transport.spec.ts, tests/glm-zcode.spec.ts, docs/DESIGN.md
      Verify: `npm run build`；`node --experimental-strip-types tests/glm-transport.spec.ts`、`tests/glm-zcode.spec.ts` 全过（标题请求正文无 `stream` 的断言在旧代码上红）；`npm test` 全绿。

- [ ] 10. 汇总 DESIGN §4.8「与 3.16.3 的已知差异」与剩余偏离清单。
      把第 10 项的 DSH 控制项、第 5/7 项缺口、start-plan 未改、目录取 r33 的假设、§8 列出的十项之外的偏离写成一节（各步已写的条目在此合并去重，不重复两处）；HANDOFF 当前状态。
      Files: docs/DESIGN.md, docs/HANDOFF.md
      Verify: `npm test` 全绿（文档改动不影响门禁，跑一遍确认工作树干净）。

- [ ] 11. L1–L3 门禁与离线探针（不发真实请求）。
      `npm run build`、`npm run preflight`、`npm test`；按 DEVELOPMENT §3 建临时 profile（复制 `glmsandbox` 配置，两个 junction 指向本工作树与 `ui/`），`$env:DSH_SANDBOX_PROFILE=<临时 profile>` 跑 `npm run probe`，用完删除临时 profile。
      Files: 无（临时 profile 在 `~/.dsh/profiles/` 下，用完删除；不改 `glmsandbox` 与 `desktop`）
      Verify: 三道门禁退出码 0；`npm run probe` 退出码 0、全部通过且条数不少于 main 的基线（m1-signing 时为 89/89）。

- [ ] 12. 沙盒真实网络运行（coding-plan，`glm-5.3-flash`），按 3.16.3 形态核对截包，然后把结果写进文档。
      照 `.agents/tasks/m1-signing/network-verify.md` 的做法：一次性运行器与 fetch tap 放在 `.agents/tasks/zcode-parity/`（不入库，用完删除）；覆盖 patch 让 `glm-hourness/glm-llm` 与 `glm-hourness/glm-login` 的 `home` 指向运行目录下的 `cred-home/`，事先用 `Copy-Item` 把 `~/.dsh/glm-hourness/credentials.json` 按字节复制进去（不显示内容），迁移只改副本，运行后删除副本；`plan: coding-plan`，start-plan 不发请求；`~/.zcode/v2/telemetry-state.json` 由代码按 3.16.3 读取，不打印。tap 只记：URL（去查询串、id 换 `<id>`）、方法、状态、按发送顺序的头名、`authorization` 形式（Bearer/raw）与形状（jwt/id.secret）、`x-api-key` 形状及是否与 Authorization 令牌相同（布尔）、`user-agent`、`x-title`、`x-zcode-query-source`、`x-zcode-session-type` 的值、同一回合内 `x-query-id`/`x-zcode-trace-id` 是否相等（布尔）、正文顶层键序、`model`、`max_tokens`、`stream` 是否存在、`thinking`、`output_config`、`metadata.user_id` 的键名；配置请求的头名与是否含 `x-api-key-id`、不含 `x-api-key`。不记任何凭证、PAT、签名、设备 ID 的值，不调用额度与用量接口。结果写进 `.agents/tasks/zcode-parity/network-verify.md`，再整条重写 DESIGN §4.3 实测段与 HANDOFF 状态，提交文档。
      Files: docs/DESIGN.md, docs/HANDOFF.md（`.agents/` 下的记录不入库）
      Verify: 全部模型请求 200、都已签名、没有 401 梯子；头名序列与 §2 第 8 项一致；`authorization` 为 `Bearer`+jwt、`x-api-key` 为 jwt 且与之相同；配置请求无 `x-api-key`；标题请求正文无 `stream`、`max_tokens` 5000、effort low；主步 `max_tokens` 128000、`model` `GLM-5.3-Flash`；`git status` 只含两份文档；`npm test` 全绿。批次 L4（桌面版重启，首次读取时迁移真实凭证）不在本计划内，交给 M1 收尾批次，节点由编排方批注「待 L4」。

## 8. 十项之外仍与 3.16.3 不同的地方（供用户决定，本计划不改）

- 签名的三处既有偏离（DESIGN §4.3 定案 2026-10-28）：握手失败 60 s 冷却、两次 VERIFY 后永久旁路、凭证不可解析/缺会话 id/PoW 失败时放行（3.16.3 抛错）。
- 系统提示按 cli_prefix / stable / dynamic 拆三块并带断点（DESIGN §5.8 第 14 项）。
- PAT 获取这一平面上桌面 apiClient 可能附加的默认头（`Wt` → `e.request`，未核到底）。
- 3.16.3 有代理或自定义 CA 时网络层改走 `node:https`，头变为小写字母序；通道始终走 DSH 运行时的 fetch。
- OAuth 访问令牌刷新：桌面 `index.js` 里没有找到刷新调用（检索 `token/refresh|refreshAccessToken|oauth/refresh|grant_type` 为 0，chunk 文件未穷尽），两边都在 OAuth 令牌失效后需要重新登录；本通道在拿不到 PAT 时整条通道停用，可用性取决于这枚令牌的寿命。
- 3.16.3 实际运行的目录由桌面壳下发（`zcodeBuiltinProviderConfigFilePath` / CDN），pristine 副本里没有；本计划按开源 r33 的 GLM-5.3 规则实现，若 3.16.3 的活动目录不同，`max_tokens` 上限与 thinking 映射要跟着改。
