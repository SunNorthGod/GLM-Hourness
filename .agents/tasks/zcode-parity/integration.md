# m1-parity 集成报告：coding-plan 请求与 ZCode 3.16.3 代码级一致

日期 2026-10-29。项目图任务 `m1-parity`，相关决定：`question-6` B（拿不到 PAT 时失败即停）、`question-7` B（`max_tokens` 照 3.16.3）、`question-8` B（`X-Title` 用 `electron`）、`question-9` A（没有 deviceMid 时生成并写回 `~/.zcode`）、`question-11`（评审第三轮，最后一轮）。验收口径是用户 2026-10-28 的「看量或者扣减看不出来的。你就代码级别一样就行」，不做额度或扣减测量。

本文件不含任何凭证、PAT、key、secret、签名、设备 ID 或 id 段的值。来源：`git log origin/main`、本目录的 `plan.md`、`verification.md`、`review.md`、`review.json`、`wire-evidence.md`、`final-*.log`，worktree（等于 main）里的 `docs/DESIGN.md` §4 与 `docs/FACTS.md`，以及收尾步骤与线上核对步骤的结果。

## 0. 结论

- `main` 与 `origin/main` 的最新提交是 `a9f12e1`。分支 rebase 到 `a1d1e5c` 时没有冲突，以 ff-only 合入并推送，没有强推。worktree `.worktrees/m1-parity` 保留，内容与 main 相同。
- 评审第 3 轮 APPROVED。剩一条非阻断发现：DSH 手动压缩空闲会话时发出的是上一回合的 `x-query-id`，DESIGN 没有写这一条（§3），尚未处理。
- 十项：第 1、2、3、4、8、9 项与 3.16.3 一致；第 5、6、7 项在 DSH 给得出输入的范围内一致，输入不全处的近似与 DSH 控制的差异写在 DESIGN §4.5b、§4.6、§4.8；第 10 项（DSH 控制的差异写进 DESIGN）已完成，只缺上面那一条。
- 门禁全过（556 个测试通过、0 失败），离线探针 94/94，探针期望没有改动。
- 沙盒真实网络核对：10 个请求全部 200，5 个模型请求都带签名，鉴权形式、头名顺序与大小写、请求体与 3.16.3 一致。网关没有拒绝任何一项，没有回退提交。
- 未完成：批次 L4（项目图 `m1-11`）的桌面版重启（§6）；DESIGN §4.2、§4.3 实测段、FACTS 的 User-Agent 行与 HANDOFF 按本次线上运行重写（运行时段实测为 `node.js/24`，文档写的是 `node.js/22`）；项目图记录（本步不改 `docs/graph/`）。

## 1. 进入 main 的提交

按先后顺序。第二列是 rebase 前的分支哈希，`verification.md` 与 `review.md` 用的是这一列。

| # | main | rebase 前 | 标题 | 阶段 |
| --- | --- | --- | --- | --- |
| 1 | `5e68c80` | `60d59aa` | feat(glm-llm): X-Title Z Code@electron as the 3.16.3 desktop sends it (m1-parity) | 实现 |
| 2 | `73b487d` | `23292da` | feat(glm-llm): send ZCode's own deviceMid, read as 3.16.3 reads it (m1-parity) | 实现（第 9 项只读版，后被 #20 取代） |
| 3 | `e0dece5` | `59722e3` | feat(glm-llm): coding-plan requests carry the project access token; fail closed without it (m1-parity) | 实现 |
| 4 | `7e95096` | `926c1d0` | feat(glm-llm): store login tokens only; drop the API key secret with a lossless migration (m1-parity) | 实现 |
| 5 | `b5eb62e` | `0f507cf` | feat(glm-llm): 3.16.3 request attribution: session trace id, turn query id, query source, subagent type (m1-parity) | 实现 |
| 6 | `30bf291` | `8c92d84` | feat(glm-llm): 3.16.3 User-Agent and header chain, so the wire order matches (m1-parity) | 实现 |
| 7 | `0bb4050` | `01f128f` | feat(glm-llm): 3.16.3 request body: official model casing, key order, thinking and output_config (m1-parity) | 实现 |
| 8 | `3e91a29` | `7a5dd3e` | feat(glm-llm): max_tokens as 3.16.3 picks it, with its usage estimate (m1-parity) | 实现 |
| 9 | `cb0c23b` | `738c1df` | feat(glm-llm): send the session title the way 3.16.3 generateText does (m1-parity) | 实现 |
| 10 | `b14453f` | `28a0604` | docs: ZCode 3.16.3 parity summary and the remaining known differences (m1-parity) | 实现 |
| 11 | `9021664` | `2386f6e` | docs(facts): rebuild FACTS.md after the dollar-backtick splices (m1-parity review) | 评审第 1 轮修复 |
| 12 | `95651be` | `168b443` | docs: cite 3.16.3 declarations, not use sites, in DESIGN and comments (m1-parity review) | 评审第 1 轮修复 |
| 13 | `5dc8309` | `a598f4c` | fix(glm-llm): serialize credential store writes, unique temp files, keep a newer login (m1-parity review) | 评审第 1 轮修复（第 2 轮要求把 `2bfbeef` 与 `bac18b4` 合并成这一个） |
| 14 | `d2a55ed` | `53baff9` | fix(glm-llm): /glm-status calls a login coding-plan cannot use not logged in (m1-parity review) | 评审第 1 轮修复 |
| 15 | `be610a4` | `d4a740e` | refactor(glm-llm): drop the dead apiKey branch of the start-plan header set (m1-parity review) | 评审第 1 轮修复 |
| 16 | `2de8da3` | `b446209` | fix(glm-llm): cancel the rejected 401 body before the project-token retry (m1-parity review) | 评审第 1 轮修复 |
| 17 | `48fed7e` | `097bfda` | fix(glm-llm): compaction keeps the turn's x-query-id (m1-parity review) | 评审第 2 轮修复 |
| 18 | `136978e` | `529fe76` | fix(glm-llm): compaction uses the session's reasoning effort (m1-parity review) | 评审第 2 轮修复 |
| 19 | `0a2564b` | `798361f` | docs: give Lw, nS and f5s their own 3.16.3 offsets (m1-parity review) | 评审第 2 轮修复 |
| 20 | `a9f12e1` | `de6c171` | feat(glm-llm): write the ZCode deviceMid back as 3.16.3 ensureCliDeviceMid does (m1-parity) | 第 9 项更正（评审第 3 轮之前） |

## 2. 逐项对照

偏移口径：`@N` 是 pristine 3.16.3 CLI 包 `C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3163\zcode.cjs.pristine` 按 UTF-8 读入后的字符偏移，指向声明处（使用处另行标注）；`+N` 是同目录 `app.asar` 内所注文件的字节偏移。评审第 3 轮对第 6、7、9 项引用的偏移逐个重读；第 1–5、8 项的代码路径自第 2 轮以来没有变，沿用第 2 轮的读数。

「一致」指本包能控制的部分与 3.16.3 代码级相同；「已记录差异」指 DSH 不给输入或由 DSH 控制、写在 DESIGN 里的差异。

| 项 | 内容 | 状态 | main 提交 |
| --- | --- | --- | --- |
| 1 | 模型请求的 `Authorization` 与 `x-api-key` 用 PAT | 一致 | `e0dece5`、`2de8da3` |
| 2 | 拿不到 PAT 时失败即停（`ModelRequestAuthMissing`） | 一致（行为） | `e0dece5`、`d2a55ed` |
| 3 | agent/configs 只发 `x-api-key-id`；去掉 copy 取 secret；存储迁移 | 一致 | `e0dece5`、`7e95096`、`5dc8309` |
| 4 | `X-Title: Z Code@electron` | 一致 | `5e68c80` |
| 5 | `max_tokens` 规则 | 公式一致；用量基线与窗口为已记录差异 | `3e91a29` |
| 6 | `model` 大小写、`thinking`、`output_config`、正文键序、会话标题非流式 | 一致；会话无主步时的压缩档位为已记录差异 | `0bb4050`、`cb0c23b`、`136978e` |
| 7 | User-Agent、trace id、query id、query source、session type | 主步、标题、回合内压缩一致；回合边界等为已记录差异；手动压缩空闲会话一条未记录 | `b5eb62e`、`30bf291`、`48fed7e` |
| 8 | 头名大小写与线上顺序 | 一致 | `30bf291` |
| 9 | `metadata.user_id` 的 `device_id`：`ensureCliDeviceMid` 写回；`Kuc` 只读 | 一致（写回版） | `73b487d`、`a9f12e1` |
| 10 | 只由 DSH 控制的差异写进 DESIGN | 已写入 DESIGN §4.8，缺手动压缩一条 | `b14453f` 及各步 |

### 第 1 项：模型请求用 PAT

- 3.16.3：账号模式每次尝试前向桌面壳取请求凭证（`refreshBeforeModelRequest` @14817299；桌面 `AccountProviderRequestAuthService.resolveCurrent`，`out/host/index.js` +1200545）。`x5s` @3843063 把 PAT 设为 provider 的 `apiKey`，经 `PQr` @3841940 删掉配置头里的 `authorization`、`x-api-key`；`T5s` @3843231 补 `Authorization: Bearer <PAT>`；`createAnthropic`（`sgn` @3569529，`getHeaders` 使用处 @3570073）发 `x-api-key: <PAT>`；签名器用同一个令牌（`protectTransport` @3833810）。PAT 客户端 `ProjectAccessTokenClient`（`sge` @1082916，缓存 `Urt` @1080367；桌面 `out/host/chunk-5YNPFY3L.js` +849600–+856500）。401 且不是请求安全类失败时刷新一次（`AccountRequestRetry` `$ye` @4144946、`$Hs` @4144643、`Vrt` @1090655）。
- 本包：`src/glm-llm/auth/project-token.ts` 移植 PAT 客户端与缓存（定位、过滤 `projectType "2"`、`zcode-api-key` 与 `usageScene: 1`、成功码 `200|0|"200"|"0"`、缺 `enable` 视为启用、有效期 `min(expiresAt, 开始 + expiresIn)`、提前 120 s 再减 0–60 s 刷新、暂态失败复用未到期旧令牌并 5 s 后再试、404 删定位、指纹强制重铸、错误码映射）。`buildModelRequestHeaders` 两个头都放 PAT。签名凭证只剩 PAT 的 JWT 形式（按 `D1r` @1087575 校验 `typ: JWT`），签名层原有的铸造与 60 s 铸造冷却删除。401 不是 `VERIFY_APIKEY_EXPIRED`、`VERIFY_SIGNATURE_INVALID`、`3007` 时以被拒令牌指纹重铸一次，新 `x-request-id` 重发一次；重发前取消被拒响应的 body（3.16.3 `DQr` @3843990 把丢弃的响应体读空）。
- 状态：一致。
- 证据：线上 #6–#10 共 5/5 `Authorization` 为 `Bearer` + PAT，`x-api-key` 为原样 PAT 且与 `Authorization` 是同一令牌（§5）。L2：`tests/glm-zcode.spec.ts`、`tests/glm-project-token.spec.ts`、`tests/glm-signing.spec.ts`，旧代码上红（`old-code-results.txt`、`fix-old-run.log`）。

### 第 2 项：拿不到 PAT 时失败即停（question-6 B）

- 3.16.3：缺请求凭证抛 `ModelRequestAuthMissing`（`Account model request auth is unavailable: <provider>/<model>`，@4193871 附近）；`xpt` @4146619 在凭证未返回时抛错，刷新失败经 `wie` @4147581 包成不可重试的 `RuntimeHeadersRefreshError`。桌面给出的原因原文：无 OAuth 令牌为 `Account request credential is unavailable: bigmodel`，无账号身份为 `Account request credential is unavailable: account:bigmodel-individual-coding-plan`（`AccountRequestCredentialUnavailableError`，`out/host/index.js` +1200329），PAT 客户端失败为 `project_token_*` 码。渲染层不翻译这些消息，不退回 API Key。
- 本包：coding-plan 取不到 PAT 时，模型请求、端点路由配置请求与签名握手都不发。流以 `glm-zcode: project access token unavailable (<原文>) — run /glm-login to sign in again` 失败，行健康为 inactive「未拿到项目令牌（<原文>），按 3.16.3 不发送；运行 /glm-login」。凭证缺 OAuth 令牌或账号 id 时 `/glm-status` 显示未登录并带同一原因（`d2a55ed`）。存储里已没有 API Key，没有可退的凭证。
- 状态：一致（行为）。原因串逐字取 3.16.3；英文外壳、行健康与 `/glm-status` 的说明是本包自己的上报，不改变任何请求。
- 证据：L2「铸造返回 500 且无旧令牌时以 `project_token_request_failed` 失败，网关一条模型请求都没收到，行健康 inactive」与「无 OAuth 令牌时原因为 `Account request credential is unavailable: bigmodel`」（`tests/glm-zcode.spec.ts`、`tests/health.spec.ts`）。线上运行登录完整，没有触发这条路径。

### 第 3 项：agent/configs 与 secret

- 3.16.3：`buildProviderEndpointRoutingHeaders`（`FGs` @4196232）依次组 `User-Agent`、`X-ZCode-App-Version`、来源头（`Frn` @968479，经 `jGs` @4196407 按 `NGs` @4199110 规范名，含 `X-Device-Mid`）、`x-api-key-id`（请求凭证的 `apiKeyId`，`Ngn` @3839971）、`Accept`；HTTP 客户端 `P5r` @2827718 以 `new Headers` 交给 fetch。CLI 包与桌面 `index.js`、`chunk-5YNPFY3L.js` 里没有 `api_keys/copy` 与 `secretKey`：账号模式不取 API Key 的 secret。
- 本包：配置请求按 `FGs` 顺序，只发 `x-api-key-id`（PAT 定位的 `apiKeyId`），不发 `x-api-key`；此前这里发的是完整的 `{apiKeyId}.{secret}`。登录只存令牌：版本 2 记录 `{version: 2, provider, oauthAccessToken?, userId?, jwt?, location?}`，`/glm-login` 不再调 `getCustomerInfo`、`api_keys`、`api_keys/copy`，`auth/resolver.ts` 删除；项目 key 定位以 `project-key-location:v1:…` 存进 `location`，铸造回 404 时删除。
- 迁移：版本 1 记录有 OAuth 令牌或 JWT 时，在写入队列里重读、原子重写一次为版本 2，丢掉 `apiKey`（连同 secret），令牌与 `userId` 原样带过；并发的首次读取只迁移一次；重写失败时原文件字节不动，本次用内存里的版本 2；没有任何令牌的版本 1 记录不改写。同一凭证文件的全部写入在进程内排队，临时文件按 3.16.3 `PWs` @4062889 的规则命名（`5dc8309`）。
- 状态：一致。迁移是本包从旧格式过渡的步骤，3.16.3 没有对应物，不影响请求。
- 遗留：主检出 `.llm/credentials.json` 旧副本不在迁移范围内，仍含 secret（项目图 `m1-cleanup`）；迁移后装回旧 bundle 会显示未登录，需要重新 /glm-login（DESIGN §4.1）。
- 证据：线上 #4 有 `x-api-key-id`，没有 `x-api-key` 与 `Authorization`，头名顺序逐个相同；线上运行中凭证副本由版本 1 迁移为版本 2（只改副本）。L2：`tests/glm-routing.spec.ts`（`FGs` 顺序、无 secret）、`tests/glm-auth.spec.ts`（迁移、写失败原文件不变、并发首次读取只迁移一次）、`tests/glm-zcode.spec.ts`（登录不请求 `/copy/`、登录与定位并发不互相覆盖）。

### 第 4 项：X-Title（question-8 B）

- 3.16.3：`Suc` @14422777 发 `"X-Title": Z Code@${n}`，`n` 由 `kuc` @14423244 给出（进程参数含 `app-server` 或 `agent-server` 为 `electron`）；桌面以 `app-server --stdio` 起 agent；配置请求来源头传 `sourceTitle: "electron"`（`_5e(...)` @15096557）。
- 本包：`DEFAULT_IDENTITY.sourceTitle = 'electron'`，模型请求与配置请求共用，取代 2026-10-27 的 `cli` 定案。
- 状态：一致。线上 5 个模型请求与配置请求都是 `Z Code@electron`。

### 第 5 项：max_tokens（question-7 B）

- 3.16.3：主步 `resolveModelStepMaxOutputTokens`（`aUo` @13215830），基线 `VZ` @13215775（目录 `maxOutputTokens.max`，没有时 `Yja` 32000 @13216683）；窗口与估算都有效时取 `min(基线, floor(窗口 − 估算 − 1000))`，不大于 0 时取基线。压缩 `p3a` @13395552：`min(VZ(max), I0t, max)`，`I0t` 20000 @5070582。会话标题 `auxiliaryModelOptions`（`PP` @7759001）：`min(5000, max)`。估算 `uzo` @13313841、`CDn` @13313415、`d5o` @13260048、`Xgt` @4979924、`Bla` @4980209、`TP` @5067698（三字符一 token，`ere` @814022；工具调用 `Fda` @5067856）。
- 本包：`src/glm-llm/token-budget.ts` 移植以上函数；coding-plan 对目录内模型不再用 DSH 的 `maxTokens`。用量基线取解码器写进回放信封 `finish.replayState.response.usage` 的 ZCode 口径用量（输入含缓存读写）。
- 状态：公式一致。已记录差异（DESIGN §4.6、§4.8）：DSH 的请求不带历史响应的用量，基线只在本适配器产出、运行时仍交回回放状态的助手消息上有，其他路由与 m1-parity 之前的历史整段估算；ZCode 按会话条目与消息对齐取下标，DSH 只有一份消息列表；工具调用与结果按 DSH 块近似；窗口取目录的 1,000,000，DSH 按声明的 512,000 先压缩，所以主步实际恒为 128000。目录取开源 3.16.2 树 revision 33 的 GLM-5.3 规则，3.16.3 运行时的目录由桌面壳下发，没有核过。
- 证据：线上主步 4/4 为 128000，会话标题 5000。压缩没有出现在线上运行里，由 L2 覆盖（`tests/glm-zcode.spec.ts` 主步 128000、压缩 20000、标题 5000、逼近窗口时 `1000000 − 估算 − 1000`）。

### 第 6 项：请求体

- 3.16.3：模型 id 规范为官方大小写（`GZt` @526265，官方 id 表 `Cpr` @526343）。AI SDK `getArgs` @3599845（体字面量使用处 @3603239，返回使用处 @3607708）的键序是 `model, max_tokens, [temperature], metadata, system, messages, tools, tool_choice, stream`；有工具时 `tool_choice: {type: "auto"}`（`nro` @3929119、`Jjs` @3543299）。选项映射 fetch（`TQr` @3836714）按 `Zpr` @547735（`Jpr` @547136）在末尾追加 `thinking`、`output_config`；目录规则锚定、忽略大小写匹配（`wYt` @557708，调用 @563982）。会话标题走 `generateText`（`v4a` @13066475，`tools: []`）：非流式，正文没有 `stream` 与 `tools`。压缩用会话的模型选择（`c3a` @13387356 的 `jT(this, {selection: this.getSessionModelSelection()})`，`jT` @12830530）。
- 本包：`src/glm-llm/anthropic.ts` `WireShape` 按上面的键序组体并按 `Zpr` 语义追加；线上 `model` 为 `GLM-5.3` / `GLM-5.3-Flash`（DSH 侧与回放信封仍是小写）；`thinking: {type: "enabled"}`，`output_config.effort` 取 DSH 的 `reasoningEffort`（`low` / `high` / `max`，缺省 `high`）；会话标题 effort `low`、不带 `stream`、按 JSON 读响应，`decodeMessage` 合成与流式相同的块序列；压缩取会话最近一个主步的档位（`136978e`）。
- 状态：一致。已记录差异（DESIGN §4.5、§4.8）：会话在本进程里还没有主步时（例如重启后的手动压缩），压缩取压缩请求自己的档位，缺省 `high`；`temperature` 由 DSH 决定给不给，给了就按 AI SDK 的位置发（3.16.3 这类请求不设温度）。目录修订假设同第 5 项。
- 证据：线上主步 4/4 键序 `model, max_tokens, metadata, system, messages, tools, tool_choice, stream, thinking, output_config`（DSH 没给 `temperature`），`stream` 为 true；会话标题键序 `model, max_tokens, metadata, system, messages, thinking, output_config`，没有 `stream` 与 `tools`；`model` 5/5 为 `GLM-5.3-Flash`；`thinking.type` 5/5 为 `enabled`；effort 主步 `high`、标题 `low`。

### 第 7 项：User-Agent 与归因头

- 3.16.3 的 User-Agent：`withUserAgentSuffix`（`Y2` @3510311，键小写化 `y4s` @3510098）、浅合并 `Rh` @3505152、`postToApi`（`SZr` @3540427）追加 `ai-sdk/provider-utils/4.0.27`（`mZr` @3530239）与运行时段（`$ut` @3509781，先取 `navigator.userAgent`）；会话标题经 `generateText`，调用级再加 `ai/6.0.193`（@3949945，`Xno` @3991593）。
- 3.16.3 的归因头：`createModelRequestAttributionHeaders`（`Vdt` @4065502）；`x-request-id` 每次尝试新生成（`Gdt` @4067222）；trace id 会话级（根追踪上下文 `vT` @1421911、`this.rootTraceContext` @13515884，回合与辅助请求经 `Lw` @1422054、`nS` @12816000 派生，`traceId` 不变）；query id 回合级（`O9` @14502646、`zzo` @13357726、`hae` @12815948，头里经 `GWs` @4066115 去 `query_` 前缀）；`x-session-id` 经 `Hdt` @4066070；session type `Y0n` @4065835；query source `mDn` @13259914（`main_turn`、`subagent`）、压缩 `compact`（@13389086）、会话标题 `session_title`（`v2n` @13069774）。
- 本包：`src/glm-llm/headers.ts` 移植 `Y2`、`y4s`、`Rh`、`$ut`，按两级合并组头。`RequestAttributionTracker`：trace id 按 DSH 会话保存（进程内最多 256 个会话），委派子会话取父会话的；回合键是主步请求里最后一条 `source.kind: 'user'` 消息的 id，键变了换新 UUID；会话标题与压缩不取回合键，沿用会话当前的 query id，只有会话标题开的 id 会被下一个主步认领（`48fed7e`）；子代理由 `agents` 服务的会话头 `origin: 'subagent'` 判定，父会话取 `parentSession`。
- 状态：主步、会话标题、回合内压缩一致。已记录差异（DESIGN §4.5b、§4.8）：DSH 不给回合 id，goal 轮次与不以用户输入消息开头的跟进沿用上一回合的 query id（3.16.3 每个输入换新）；3.16.3 的 query id 是桌面命令 id，本包是 UUID，结构相同、值域不同；`workflow_child` 在 DSH 里没有对应的会话标记，不映射；`agents` 服务取不到会话头时按主会话处理。
- 未记录差异（评审第 3 轮非阻断发现，未处理）：DSH 对空闲会话的手动压缩（rc.3 compaction-basic `compactNow`）与压力压缩发出同样形状的请求，本包发上一回合的 `x-query-id`；3.16.3 的 `/compact` 是独立输入，`zzo` @13357726 派生自己的 query id 交给 `executeManualCompact`（@13361998），`czo` @13308966 开一个回合再压缩。只有这一个压缩请求不同，下一个输入两边都开新 id；这不是回归，`48fed7e` 之前的实现结果相同。处理方式是在 §4.5b 与 §4.8 写明；若本包能看到 DSH 当前没有回合在跑，也可以给这种压缩开新的 query id（未追查）。
- 运行时段：构造规则与 3.16.3 相同，取值跟随宿主。DSH 桌面运行时（Electron node 模式，`process.version` `v24.21.0`，`navigator.userAgent` `Node.js/24`）上线上是 `runtime/node.js/24`。DESIGN §4.2「结果」行与 FACTS 的 User-Agent 行写的是 Node 22.20 下的 `runtime/node.js/22`，需要改。ZCode 桌面版自己的 agent 进程取什么值取决于它所带 Electron 的 Node 版本，没有截 ZCode 自身流量，未确定。
- 证据：线上主步 UA `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`，会话标题 `ZCode/3.16.3 ai/6.0.193 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`，配置请求 `ZCode/3.16.3`。线上头名序列里有 `x-query-id`、`x-request-id`、`x-zcode-query-source`、`x-zcode-session-type`、`x-zcode-trace-id`，`wire-evidence.md` 没有记录这几个头的值；值的规则由 L2 覆盖（`tests/glm-zcode.spec.ts`、`tests/glm-transport.spec.ts`、`tests/glm-channel.spec.ts`：同会话 trace id 不变、新用户消息换 query id、标题 `other` + `session_title`、压缩 `other` + `compact`、子代理 `subagent` + `subagent` 且 trace id 等于父会话、DSH 形状的压缩沿用回合 query id）。

### 第 8 项：头名大小写与线上顺序

- 3.16.3：签名器先 `new Request`（`O1r` @1088463），`zrt` @1089207 以 `new Headers` 复制并删掉签名头，`sendSigned` @3827896 依次 `set` 七个签名头（@3828487：`X-Client-Ts`、`X-Client-Version`、`X-Client-Sig`、`X-Session-Id`、`X-Client-Nonce`、`X-App-Id`、`X-Client-Pow`）；路由 fetch（`f5s` @3840311）`new Headers(prev)`、删 `host`、`set` `X-ZCode-Authorization`。undici 复制 `Headers` 时保留插入顺序与 `set` 时的大小写。线上序列：前段小写字母序（`x-session-id` 原位改名为 `X-Session-Id`），随后签名块，最后 `X-ZCode-Authorization`。
- 本包：照搬同一条 `Headers` 链，不手排；无签发送时只经 `zrt`。
- 状态：一致（默认 fetch 路径）。3.16.3 在有代理或自定义 CA 时改走 `node:https`、头变成小写字母序（`rdt` @3837494），本包始终走 DSH 运行时的 fetch，列在 DESIGN §4.8 的范围外偏离里。
- 证据：线上 5/5 模型请求与配置请求的头名序列与 3.16.3 逐个相同（§5）；L2 回环服务器读 `rawHeaders`（签名与无签两种）。

### 第 9 项：device_id（question-9 A）

- 决定：用户 2026-10-28 选 A「照 ZCode 做：生成并写回 ~/.zcode」。
- 3.16.3：模型请求每次尝试调 `Ydt` @4073238 → `ensureCliDeviceMid`（`Qro` @4062043），`ZWs` @4073127 组 `{device_id, account_uuid: "", session_id}`。状态文件 `<base>/.zcode/v2/telemetry-state.json`，`<base>` 是去空白后非空的 `ZCODE_DATA_BASE_DIR`，否则 homedir（`CWs` @4062252、`NWs` @4064238）。`EWs` @4062442 先无锁读（`AWs` @4062638、`eoo` @4062679、`too` @4062778、`roo` @4064491），没有再在锁内重读并生成写回；锁 `telemetry-state.lock` 以 `open(…, "wx")` 建，内容 `{createdAt, pid}`（`RWs` @4063231）；陈旧判定 `DWs` @4063741（300 s，属主记录 `OWs` @4063923，存活 `MWs` @4064119 `kill(pid, 0)`，`EPERM` 视为存活）；每 10 ms 一次、最多 200 次（常量 @4064703）；写回 `PWs` @4062889：`mkdir -p`、两空格缩进 JSON 写同目录临时文件再 `rename`，失败删临时文件；任何失败都用本进程生成的 id（`tG` @1013439），按状态文件路径在进程内缓存。配置请求的 `X-Device-Mid` 走只读的 `Kuc` @14468898（路径 `Juc` @14468783），不生成，只缓存成功的读取。
- 本包：`src/glm-llm/device-mid.ts` 逐函数移植；配置请求只经 `Kuc` 读；`device-mid.txt` 不再读写（已有文件是用户数据，保留）。写回失败时照样发送生成的 id，行健康成功原因后加「设备 ID 未能写入 ZCode 状态文件，本进程用临时 ID」，状态不降级（3.16.3 静默，这是本包自己的上报）。
- 经过：`73b487d`（分支 `23292da`）只移植了读取，状态文件没有 deviceMid 时发本包自己的 `device-mid.txt`，提交与文档把它称为「已决定的偏离」；该提交的步骤提示词写于用户决定之前。评审第 1、2 轮按「question-9 A 的只读方案」放过。2026-10-29 编排方核对时发现与 A 不符，在评审第 3 轮之前以 `a9f12e1`（分支 `de6c171`）改为写回版，并删掉 DESIGN、FACTS、HANDOFF、CHARTER 与代码里称其为偏离的文字。第 3 轮逐函数对照 pristine 包确认一致，并写明第 2 轮的判断有误。
- 移植时的省略：`CWs` 的 `baseDir`（模型请求的唯一调用方只传 `{env}`）；`tG` 的 `getRandomValues` 与 `Math.random` 退路（Node 22 起 `crypto.randomUUID` 总在）；`OWs` 只保留 `pid`；返回值多一个 `temporary` 标记。这些都不改变写入的字节与发送的值。3.16.3 还有第二个写入者 `jrc` @14089436（只在配置了 OTLP 遥测时运行，锁规则不同），不在模型请求路径上，没有移植，FACTS §1 有记录。
- 从 3.16.3 继承的行为：状态文件存在但不是 JSON 对象时读作 `{}`，写回后只剩 `{deviceMid}`。只在文件没有可读 deviceMid 时发生；本机状态文件有 deviceMid，无锁读取直接返回，不写。
- 状态：一致。
- 证据：线上 5/5 `metadata.user_id` 的键为 `device_id, account_uuid, session_id`，`device_id` 非空；配置请求带 `X-Device-Mid`；本机状态文件运行前后大小与修改时间不变。L2：`tests/glm-device-mid.spec.ts` 8 条（写回、并发只生成一个、锁等待、陈旧锁与孤儿锁、写失败、写回后 `Kuc` 读到），其中 6 条在只读代码上红；`tests/glm-zcode.spec.ts` 新增 2 条在只读代码上红（`dm-old-device-mid.log`、`dm-old-zcode.log`）。全部状态文件在 mkdtemp 目录里，经 `ZCODE_DATA_BASE_DIR` 指过去；另以 `USERPROFILE`、`HOME` 指向空目录跑了 7 个会走到 deviceMid 的 spec，目录里没有出现 `.zcode`。

### 第 10 项：只由 DSH 控制的差异

- DESIGN §4.8 已写：会话标题的时机与提示词（3.16.3 回合开始时尝试 @13367458，账号模式推迟到回合完成后发 @13370395，提示词 `y4a` 截首条输入 1200 字符；DSH 与第一步并发，线上 #7 在 #6 之后 34 ms 发出）；压缩的触发时机与提示词；向 DSH 声明的上下文窗口 512,000 与默认 `max_tokens` 32000；`temperature`；工具集与系统提示内容；回合边界（第 7 项）。
- 本包的近似（§4.8）：`max_tokens` 用量基线来自回放信封；PAT 被拒判断里的 provider 错误码按信封 `code`、`error.code`、`error.message` 近似；会话无主步时的压缩档位。
- 十项之外的偏离（§4.8，留给用户决定）：签名的三处既有偏离（握手失败 60 s 冷却、两次 VERIFY 后永久旁路、凭证不可解析或缺会话 id 或 PoW 失败时放行）；系统提示没有拆成 cli_prefix / stable / dynamic 三块；工具定义不发 `defer_loading`（`EVs` @4101395）；桌面 API 客户端在 PAT 请求上可能附加的默认头未核到底；代理与自定义 CA 的传输路径；OAuth 访问令牌刷新（两边都没有，失效后需重新登录）；目录修订；start-plan 只改了身份级部分。
- 状态：已完成，缺手动压缩空闲会话一条（第 7 项）。

## 3. 评审与处理

### 第 1 轮（2026-10-28，分支尖 `28a0604`）：CHANGES_REQUESTED

十项按 pristine 包与 `app.asar` 偏移逐项核对，代码级都一致。

| 发现 | 级别 | 处理 |
| --- | --- | --- |
| `docs/FACTS.md` 被拼接损坏：`59722e3`（main `e0dece5`）与 `0f507cf`（main `b5eb62e`）在 `K$`、`D$`、`{1,128}$` 三处把文件开头整段插入（`String.replace` 的 `` $` `` 替换模式），标题与 §1 表头重复六次，72,533 字节（main 为 24,206），三行被截断 | 阻断 | `9021664`：从 `23292da` 的干净版本按原意重建，恢复字面的 `` $` `` |
| 凭证写入未串行化，迁移、定位写入与登录共用一个固定的 `credentials.json.tmp` | 非阻断 | `5dc8309`：进程内按文件排队，临时文件按 `PWs` 命名，迁移在队列里重读，定位只挂到解析它时的那次登录上 |
| 没有 OAuth 令牌或 `userId` 的记录在 `/glm-status` 显示已登录 | 非阻断 | `d2a55ed`：显示未登录并带 3.16.3 原因 |
| `buildAuthHeaders` 残留 apiKey 分支与误名测试 | 非阻断 | `be610a4`：删除分支与测试，断言并入 start-plan 测试 |
| 401 刷新重试前没有释放被拒响应的 body | 非阻断 | `2de8da3`：重发前取消 |
| FACTS 部分偏移指向函数内部而非声明处 | 非阻断 | `95651be`（DESIGN 与注释）、`9021664`（FACTS 新行） |

修复后：544 个测试通过，ESLint 256 / knip 21 / jscpd 2，逐字 443 段，gitleaks 干净。

### 第 2 轮（2026-10-28）：CHANGES_REQUESTED

第 1 轮的 6 条全部解决。第 1–4、8 项一致；第 9 项被判为「question-9 A 的只读方案」一致，这一判断错误（见第 9 项）。

| 发现 | 级别 | 处理 |
| --- | --- | --- |
| compaction-rekeys-turn：压缩请求也取回合键；DSH 压缩请求只含被压缩区段，区段里更早回合的用户消息让压缩拿到新的 `x-query-id`，本回合后续主步再换一个；3.16.3 压缩上下文由回合派生（`c3a` @13387356、`nS` @12816000），共用回合的 query id | 阻断 | `48fed7e`：辅助请求不取回合键、沿用会话当前 query id，只认领标题开的 id；补 DSH 形状的测试；DESIGN §4.5b 写明规则 |
| compaction-effort-high：压缩的 effort 恒为 `high`，3.16.3 用会话档位 | 非阻断 | `136978e`：按会话最近一个主步的档位实现（不只写文档），无主步时的近似写进 §4.8 |
| fixup-commit：`bac18b4` 是 `2bfbeef` 的 lint 修补 | 非阻断 | 合并为 `a598f4c`（main `5dc8309`），树不变 |
| facts-shared-offsets：三处一个偏移标两个符号 | 非阻断 | `0a2564b`：`Lw` @1422054、`nS` @12816000、`f5s` @3840311 重读后分别引用 |

两轮用完仍有阻断，按 `question-11` 加第三轮修复与评审（最后一轮，不过就停下等人）。修复在 2026-10-29 02:09 本机蓝屏前已完成（798361f 上 548 个测试通过）；原工作流状态丢失，新开工作流 `wf_fa55803c4c0e35bc` 续做。

### 第 9 项更正（评审第 3 轮之前）

`a9f12e1`（分支 `de6c171`）把只读版换成完整的 `ensureCliDeviceMid` 写回移植，提交信息写明取代 `23292da` 的「decided deviation, item 9」。DESIGN §2.4、§2.5、§4.5b、§4.8，FACTS §1，HANDOFF §2、§3、§6，CHARTER §9 同提交重写。`npm run lint:update` 使 ESLint 压制数 256 → 250（随删除的代码去掉 6 条）。

### 第 3 轮（2026-10-29）：APPROVED

第 2 轮的 4 条全部解决；第 9 项逐函数与 pristine 包一致。

| 发现 | 级别 | 状态 |
| --- | --- | --- |
| manual-compaction-query-id：DSH 手动压缩空闲会话发上一回合的 `x-query-id`，3.16.3 的 `/compact` 有自己的 query id；DESIGN §4.5b 说辅助请求「在当前回合里发出」，§4.8 没列这种情况 | 非阻断，confirmed | 未处理：在 §4.5b 与 §4.8 记为 DSH 控制的差异；若能观察到 DSH 没有回合在跑，可改为开新 query id |

第 3 轮列出的未测项：手动空闲会话压缩；两个进程同时写凭证存储；`decodeMessage` 带 `tool_use` 块经 rc.3 组装器；DSH 桌面宿主上的 UA 运行时段（已由线上核对补上，§5）；200 次锁超时路径（写失败测试覆盖同一退路）。

## 4. 门禁与离线探针

在 rebase 后的 `a9f12e1` 上，于 worktree 运行。`ZCODE_BUNDLE` 指向 pristine 3.16.3 包；`tests/glm-startplan.spec.ts` 需要的 `reference/zcode-api/src/proxy/zcode_system.json` 从主检出临时复制进 worktree，跑完删除，worktree 干净。

| 项 | 结果 | 基线 |
| --- | --- | --- |
| `npm run build` | 退出码 0 | |
| `npm run preflight` | 退出码 0：`preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)` | |
| ESLint | 250 条压制 | 256；`a9f12e1` 的 `lint:update` 随删除代码去掉 6 条，没有新增 |
| knip | 21 | 21 |
| jscpd | 2 处重复，16 行 | 2 |
| gitleaks（`check-secrets`） | gitleaks 8.30.1，HEAD 上 145 个提交及暂存、未暂存改动，无泄露 | |
| `check-verbatim` | 443 段逐字一致，0 条已知偏差 | 443 |
| `npm test` | 退出码 0，39 个 spec 文件，556 通过，0 失败 | rebase 前 `de6c171` 上 552 |

- 556 比 552 多的 4 条全部来自 `tests/graph-panel-model.spec.ts`（5 → 9），由 rebase 带进来的 main 提交新增；按 spec 逐个对比 `test.log` 与 `final-test.log`，m1-parity 相关 spec 的条数没有变。
- 第一次跑 `npm test` 有 1 条失败，原因是 worktree 里没有上面那份 `zcode_system.json`（测试夹具），不是代码问题；按计划 §1 的做法临时复制后重跑通过。
- 各阶段测试数：实现 539，第 1 轮修复后 544，第 2 轮修复后 548，第 9 项更正后 552，rebase 后 556。ESLint 压制数在实现期间 303 → 289 → 278 → 261 → 260 → 256，更正时 256 → 250；knip 22 → 21（`e0dece5`）；jscpd 3 → 2（`73b487d`）。

离线探针（`npm run probe`）：94/94 通过，与基线 `a12d319`（2026-10-28，`chore(probe): sandbox profile override for probes run from a git worktree`）的 94/94 相同；没有失败，探针期望一行没改，没有单独的期望变更提交。运行用临时 profile `glmsandbox-m1parity`（经 `DSH_SANDBOX_PROFILE`，指向 worktree），`ZCODE_DATA_BASE_DIR` 指向临时目录，各场景的登录目录指向场景自己的目录；运行后临时 profile 与临时目录都已删除。真实 `~/.zcode/v2/telemetry-state.json` 运行前后大小与修改时间不变，真实凭证目录没有被读。日志：`final-build.log`、`final-preflight.log`、`final-test.log`、`final-probe.log`。

## 5. 沙盒真实网络核对（计划第 12 步）

- 时间 2026-10-29 09:38–09:39（UTC+8），代码 `a9f12e1`（与 main、origin/main 相同）。临时 profile `glmsandbox-wire`（复制 `glmsandbox` 配置，两个 junction 指向 worktree 与 `ui/`），运行后删除。`glmsandbox` 与 `desktop` profile 未改。
- 覆盖：`agent-default-model` 为 `glm-zcode` / `glm-5.3-flash`；`glm-hourness/glm-llm` 启用、`plan: coding-plan`；`glm-llm` 与 `glm-login` 的 `home` 指向运行目录下的凭证副本。
- 凭证：真实 `~/.dsh/glm-hourness/credentials.json` 以 `Copy-Item` 按字节复制，未打开、未读取、未打印；迁移只改副本，运行后删除。真实凭证文件运行前后大小与修改时间相同。
- deviceMid：未设 `ZCODE_DATA_BASE_DIR`，代码按 3.16.3 读真实状态文件；文件已有 deviceMid，走无锁读取，没有写回，运行前后大小与修改时间相同。本步没有打开该文件。
- 运行时：DSH 桌面版运行时以 Electron node 模式启动，`process.version` `v24.21.0`，`navigator.userAgent` `Node.js/24`。
- 任务：`DSH_PERMISSION_MODE=read-only`，工作区是 `tests/calibration/bugfix-csv-quotes/fixture` 的 git 副本，依次读 3 个文件再写摘要。退出码 0，47.6 s，回合 `completed`，3 次 Read 都 `completed`，工作区无改动，用量流水 5 条（会话标题 1、主步 4）。
- 截包：订阅 undici 诊断通道取线上头名顺序与大小写，包装 `globalThis.fetch` 取 `/v1/messages` 正文形状；只记形状、形式、布尔与头名，id 段换成 `<id>`。截包脚本、运行器、日志与运行目录在写完 `wire-evidence.md` 后删除。

| # | 请求 | 路径 | 状态 | Authorization | x-api-key | 与 3.16.3 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | PAT 定位：客户信息 | `GET bigmodel.cn/api/biz/customer/getCustomerInfo` | 200 | 原样 / OAuth 令牌（JWT，非 PAT） | 无 | 一致（`getCustomerInfo` 原样传 OAuth 令牌） |
| 2 | PAT 定位：key 列表 | `GET bigmodel.cn/api/biz/v1/organization/<id>/projects/<id>/api_keys` | 200 | 原样 / OAuth 令牌 | 无 | 一致（bigmodel 族原样）；找到 `zcode-api-key`，没有新建 |
| 3 | PAT 铸造 | `POST …/api_keys/<id>/access_tokens` | 200 | `Bearer` / OAuth 令牌 | 无 | 一致 |
| 4 | 端点路由配置 | `GET zcode.z.ai/api/v1/agent/configs` | 200 | 无 | 无，只有 `x-api-key-id`；带 `X-Device-Mid` | 头名顺序逐个相同 |
| 5 | 签名握手 | `POST open.bigmodel.cn/api/paas/c1f3a7e2/v2/client` | 200 | 原样 / PAT | 无 | 一致；没有路由头 |
| 6 | 模型 main-1 | `POST zcode.z.ai/api/v1/ultra/anthropic/v1/messages` | 200 | `Bearer` / PAT | 原样 / PAT，与 Authorization 同一令牌 | 头名顺序逐个相同，已签名 |
| 7 | 模型 会话标题 | 同上 | 200 | `Bearer` / PAT | 同上 | 同上 |
| 8 | 模型 main-2 | 同上 | 200 | `Bearer` / PAT | 同上 | 同上 |
| 9 | 模型 main-3 | 同上 | 200 | `Bearer` / PAT | 同上 | 同上 |
| 10 | 模型 main-4 | 同上 | 200 | `Bearer` / PAT | 同上 | 同上 |

与 3.16.3 的逐项比对（`wire-evidence.md` §4）全部一致：

- 模型请求头名：前有 undici 的 `host, connection`，然后是小写字母序 `anthropic-version` … `x-zcode-trace-id`（含原位改名的 `X-Session-Id`），再 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow`，最后 `X-ZCode-Authorization`；其后是 undici 补的 `accept, accept-language, sec-fetch-mode, accept-encoding`。`X-ZCode-Authorization` 为 `Bearer` + ZCode JWT（`token_use` 不是 `project_access`）。
- 配置请求头名：`User-Agent, X-ZCode-App-Version, HTTP-Referer, X-Title, X-Platform, X-Release-Channel, X-Client-Language, X-Client-Timezone, X-Os-Category, X-Os-Version, X-Device-Mid, x-api-key-id, Accept`，逐个相同。
- `X-Title` 全部 `Z Code@electron`；User-Agent 见第 7 项；正文键序、`model`、`thinking`、`output_config`、`max_tokens`、`metadata.user_id` 见第 5、6、9 项。
- 5 个模型请求都是 HTTP 200，都带完整签名块，没有 401，没有重发。握手 1 次。没有调用 `/api/monitor` 或其他额度、用量接口；没有 start-plan 形态的请求。

网关拒绝：没有。没有非 2xx 响应，不需要回退，没有偏离提交。

运行中的观察（不是拒绝）：

1. UA 运行时段为 `runtime/node.js/24`，见第 7 项；DESIGN §4.2 与 FACTS 要改。
2. 第一次取 PAT 多一次 key 列表请求：凭证副本是版本 1 记录，迁移后还没有项目 key 定位，按 3.16.3 依次 `getCustomerInfo` → 列 key → 铸造。L4 重启后真实凭证第一次读取时同样会走这三步，之后定位从记录里读。
3. PAT 定位与铸造请求的调用方头只有 `Authorization`、`Content-Type`（3.16.3 传入的字面头），其后是 undici 的默认头，`user-agent` 为 `node`。3.16.3 桌面 API 客户端在这些请求上是否另加默认头没有核到底（DESIGN §4.8）。
4. 握手请求同样只有这两个调用方头，服务端映射表没有改写握手 URL，与 m1-signing 的运行相同。
5. 延迟单样本、未归因：主步到响应头 4.2–7.7 s，会话标题 1.8 s。

线上运行没有覆盖：压缩请求、委派子会话、失败即停、deviceMid 缺失时的写回、PAT 被拒后的刷新重发，以及 `x-query-id`、`x-zcode-trace-id`、`x-zcode-query-source`、`x-zcode-session-type` 的取值（只记了头名）。这些由 L2 覆盖。

计划第 12 步的文档部分没有做：DESIGN §4.3 的实测段仍是 m1-parity 之前的 `net-1793188413414` 运行，HANDOFF 状态也没有按本次运行重写；DESIGN §4.2 与 FACTS 的 `node.js/22` 要改成规则加本次实测的 `node.js/24`。线上核对步骤没有提交任何文件。

## 6. 批次 L4（项目图 `m1-11`）还要确认的事

前提：桌面版现在运行的是旧代码，它读写同一个 `~/.dsh/glm-hourness/credentials.json`。迁移在新代码第一次读取时发生，所以重启之前不要用新代码读真实凭证目录，不要运行 `scripts/smoke-zcode-authorized.mjs`。

1. 重启后没有新错误。`plugin_manager` 的 `application: applied` 只表示 loader 接受了行，要在重启后确认本包没有新错误；`/glm-status` 行健康全绿，glm-llm 生效，成功原因里没有「设备 ID 未能写入 ZCode 状态文件」（`m1-11` 验收：行健康全绿）。
2. 真实凭证第一次读取时的迁移。第一个 GLM 请求把版本 1 记录原子重写为版本 2，去掉 API Key 与 secret，OAuth 令牌、JWT、`userId` 保留；会话标题与第一步几乎同时发出，迁移应只发生一次。不打开、不打印凭证文件，经 `/glm-status` 看：仍为已登录，第一个请求前 Key 预览为 `unresolved`，之后为已定位 `apiKeyId` 的前缀。第一次取 PAT 应找到已有的 `zcode-api-key`，不新建 key。主检出 `.llm/credentials.json` 旧副本仍含 secret，由 `m1-cleanup` 删除。
3. 真实 DSH 会话标题请求。DSH 与第一步并发发标题，本包以非流式发送、按 JSON 读响应再合成块序列；确认桌面版里会话得到标题、界面没有报错。线上核对里标题请求为 200，但没有经过桌面 UI。
4. 委派子会话的 session type。在 GLM 会话里委派一个子任务，确认子任务正常完成。`subagent` + `subagent` 与父会话 trace id 只能靠截包看到，L4 没有截包；这一项要么接受 L2 的覆盖，要么另做一次带截包的沙盒运行，由编排方决定。
5. 失败即停在桌面 UI 里的呈现：流错误 `glm-zcode: project access token unavailable (<原因>) — run /glm-login to sign in again` 怎样显示，`/glm-status` 的未登录行与 inactive 行健康。不能为了触发它去破坏真实登录；要看就用单独的 profile 加一份缺 OAuth 令牌的凭证副本，否则接受 L2 的覆盖。
6. deviceMid 缺失时的写回。本机状态文件已有 deviceMid，写回路径在这台机器上不会运行；L4 只能确认本包没有改动 `telemetry-state.json`（看文件大小与修改时间；ZCode 桌面版运行时自己会改 `~/.zcode/v2` 目录，目录时间不能当证据）。缺失的情况只由 L2 覆盖，不要为测试删掉真实的 deviceMid。
7. `m1-11` 其余验收：会话文件中的系统提示词含方言；用量记录的 provider 为 `glm-zcode`。
8. 压缩在桌面版上正常完成（压力压缩或手动压缩）。手动压缩空闲会话的 query id 差异是待写文档的已知项，不是 L4 的失败条件。

## 7. 待办

- 评审第 3 轮的非阻断发现：DESIGN §4.5b、§4.8 写明手动压缩空闲会话的 query id 差异。
- DESIGN §4.2「结果」行、FACTS User-Agent 行改为规则加本次实测的 `runtime/node.js/24`；DESIGN §4.3 实测段与 HANDOFF 按本次线上运行重写。
- 项目图（本步不改 `docs/graph/`，由编排方记录）：`m1-parity` 评审第 3 轮 APPROVED，合入并推送到 `a9f12e1`，离线探针 94/94，线上核对全部一致；第 9 项由只读改为写回，更正 `question-9` 的执行情况；`m1-11` 等桌面版重启。
- 批次 L4（§6）；`m1-cleanup` 删除含 secret 的旧凭证副本。
