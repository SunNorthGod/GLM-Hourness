# m1-parity 沙盒真实网络线上核对（计划第 12 步）

日期 2026-10-29（UTC+8 09:38–09:39）。代码为 `m1-parity` 工作树 @ `a9f12e1`，与 `main`、`origin/main` 相同；工作树的 `dist` 由上一步在同一提交上构建（`final-build.log`，退出码 0），本步未改任何源文件，没有提交。

本文件只记形状与头名，不含任何凭证、PAT、key、secret、签名、设备 ID 或 id 段的值。

## 1. 运行

- profile：临时 profile `glmsandbox-wire`（复制 `glmsandbox` 的配置文件，`dsh-glm-hourness` 与 `dsh-glm-hourness-ui` 两个 junction 指向工作树及其 `ui/`，DEVELOPMENT.md §3），以 `DSH_SANDBOX_PROFILE` 交给 `scripts/sandbox.mjs`。运行后先删 junction 再删 profile，已确认不存在。`glmsandbox` 与 `desktop` 未改。
- 覆盖行：标定 harness 的 `scripts/sandbox.mjs` 行（数据目录、附件存储、`limits.mjs` 边界 maxSteps 12 / 600 s、workspace-changes），另加：`agent-default-model` 为 `glm-zcode` / `glm-5.3-flash`；`glm-hourness/glm-llm` `disabled: false`、`plan: coding-plan`、`home: <运行目录>/cred-home`；`glm-hourness/glm-login` `home: <运行目录>/cred-home`；一行一次性 tap 插件。`run-calibrate.mjs` 不接受额外覆盖行，所以用一次性运行器调用同一组导出（与 m1-signing `network-verify.md` 相同做法）。
- 凭证：运行前以 `Copy-Item` 把 `~/.dsh/glm-hourness/credentials.json` 按字节复制进 `cred-home/`，未打开、未读取、未打印；代码只指向这份副本（首次读取把副本迁移为 v2 并写入项目 key 定位，只改副本）。运行后删除 `cred-home/`。真实凭证文件运行前后大小与修改时间相同。
- deviceMid：未设 `ZCODE_DATA_BASE_DIR`，代码按 3.16.3 从 homedir 读 `~/.zcode/v2/telemetry-state.json`。该文件运行前后大小与修改时间相同（状态文件已有 deviceMid，走无锁读取，未写回）。本步未读该文件。
- 运行时：DSH 桌面版运行时以 Electron node 模式启动，tap 记到的 `process.version` 为 `v24.21.0`，`navigator.userAgent` 为 `Node.js/24`。
- 任务：`DSH_PERMISSION_MODE=read-only`，工作区是 `tests/calibration/bugfix-csv-quotes/fixture` 的 git 副本；提示词要求依次读 `README.md`、`package.json`、`src/csv.js`（每步一次 Read），再写摘要。
- 结果：退出码 0，用时 47.6 s，stderr 为空，回合 `completed`，3 次 Read 全部 `completed`，工作区 `git status` 为空。用量流水 5 条（会话标题 1、主步 4）。

## 2. tap 的做法

- 头：订阅 undici 诊断通道 `undici:client:sendHeaders`，解析写进 socket 的请求头串，得到线上的头名顺序与大小写；状态取 `undici:request:headers`。不经 fetch 包装，所以构造时就捕获了 `fetch` 的路由服务与 PAT 客户端的请求也被记到。
- 正文：包装 `globalThis.fetch`，只对 `/v1/messages` 的字符串正文取形状，按 `x-request-id` 在内存里与诊断记录对应（id 值不写出）。
- 记录项：URL（去查询串，`organization` / `projects` / `api_keys` 后的段与长 id 段换成 `<id>`）、方法、状态、到响应头的毫秒数、线上头名顺序；`Authorization`、`x-api-key`、`X-ZCode-Authorization` 的形式（raw / Bearer）、形状（jwt / id.secret / other）、JWT 的 `token_use` 是否为 `project_access`（布尔），`x-api-key` 是否与 `Authorization` 的令牌相同（布尔）；`X-Title` 与 `User-Agent` 的值（经无令牌检查）；正文顶层键序、`model`、`max_tokens`、`stream` 是否存在、`thinking.type`、`output_config.effort`、`metadata` 键名、`metadata.user_id` 的键名与 `device_id` 是否非空（布尔）、消息条数与工具个数。非 2xx 响应只取类码字段。
- 引用前检查：tap 文件里没有 `eyJ` 开头的串，没有 `Bearer ` 后接令牌的串；长度不小于 32 的 token 形字符串只有 6 处，都是 URL 路径片段。
- tap 文件、运行器、编排脚本与整个运行目录在写完本文件后删除。

## 3. 请求序列（11 条 tap 记录中的 10 条请求，按发出顺序）

| # | 类别 | 方法 | 路径 | 状态 | 到响应头 ms | Authorization | x-api-key | 其他 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PAT 定位（客户信息） | GET | `bigmodel.cn/api/biz/customer/getCustomerInfo` | 200 | 244 | raw / jwt（非 PAT） | 无 | |
| 2 | PAT 定位（key 列表） | GET | `bigmodel.cn/api/biz/v1/organization/<id>/projects/<id>/api_keys` | 200 | 130 | raw / jwt（非 PAT） | 无 | |
| 3 | PAT 铸造 | POST | `bigmodel.cn/api/biz/v1/organization/<id>/projects/<id>/api_keys/<id>/access_tokens` | 200 | 128 | Bearer / jwt（非 PAT） | 无 | |
| 4 | 路由配置 | GET | `zcode.z.ai/api/v1/agent/configs` | 200 | 74 | 无 | 无 | 带 `x-api-key-id`、`X-Device-Mid` |
| 5 | 签名握手 | POST | `open.bigmodel.cn/api/paas/c1f3a7e2/v2/client` | 200 | 87 | raw / jwt（PAT） | 无 | |
| 6 | 模型 main-1 | POST | `zcode.z.ai/api/v1/ultra/anthropic/v1/messages` | 200 | 4819 | Bearer / jwt（PAT） | raw / jwt（PAT），与 Authorization 同一令牌 | 已签名 |
| 7 | 模型 会话标题 | POST | 同上 | 200 | 1759 | Bearer / jwt（PAT） | 同上 | 已签名 |
| 8 | 模型 main-2 | POST | 同上 | 200 | 7022 | Bearer / jwt（PAT） | 同上 | 已签名 |
| 9 | 模型 main-3 | POST | 同上 | 200 | 4209 | Bearer / jwt（PAT） | 同上 | 已签名 |
| 10 | 模型 main-4 | POST | 同上 | 200 | 7742 | Bearer / jwt（PAT） | 同上 | 已签名 |

会话标题（#7）在 main-1（#6）之后 34 ms 发出，两者并发（DSH 的时机，DESIGN §4.8）。模型请求 5 次，主步消息数依次为 1、3、5、7，每个请求只发一次。模型请求的 `X-ZCode-Authorization` 为 Bearer / jwt，`token_use` 不是 `project_access`（ZCode JWT，不是 PAT）。没有非 2xx 响应，tap 没有错误正文记录。

## 4. 对照 3.16.3

| 检查项 | 3.16.3 期望（依据） | 实测 | 一致 |
| --- | --- | --- | --- |
| 模型请求 `Authorization` | `Bearer <PAT>`（`T5s` @3843231；DESIGN §4.1） | 5/5 Bearer、jwt、`token_use` 为 `project_access` | 是 |
| 模型请求 `x-api-key` | PAT 原样（`createAnthropic` `getHeaders` @3570073） | 5/5 raw、jwt、PAT，与 `Authorization` 的令牌相同 | 是 |
| 配置请求的 key 头 | 只有 `x-api-key-id`，没有 `x-api-key`（`FGs` @4196232；DESIGN §4.4） | 有 `x-api-key-id`，没有 `x-api-key`，没有 `Authorization` | 是 |
| 配置请求头名顺序 | `User-Agent, X-ZCode-App-Version, HTTP-Referer, X-Title, X-Platform, X-Release-Channel, X-Client-Language, X-Client-Timezone, X-Os-Category, X-Os-Version, X-Device-Mid, x-api-key-id, Accept`（`FGs`、`Frn` @968479、`P5r` @2827718） | 逐个相同（前有 undici 的 `host, connection`，后有 `accept-language, sec-fetch-mode, accept-encoding`） | 是 |
| 模型请求头名顺序与大小写 | 前段小写字母序 `anthropic-version, authorization, content-type, http-referer, user-agent, x-api-key, x-client-language, x-client-timezone, x-os-category, x-os-version, x-platform, x-query-id, x-release-channel, x-request-id, X-Session-Id, x-title, x-zcode-agent, x-zcode-app-version, x-zcode-query-source, x-zcode-session-type, x-zcode-trace-id`，再 `X-Client-Ts, X-Client-Version, X-Client-Sig, X-Client-Nonce, X-App-Id, X-Client-Pow`，最后 `X-ZCode-Authorization`（`Y2` @3510311、`zrt` @1089207、`sendSigned` 七个 `set` @3828487、`f5s` @3840311；DESIGN §4.3；`tests/glm-zcode.spec.ts` 回环断言） | 5/5 逐个相同（前有 `host, connection`，后有 `accept, accept-language, sec-fetch-mode, accept-encoding`，`content-length` 在诊断串之后写出） | 是 |
| `X-Title` | `Z Code@electron`（`Suc` @14422777、`kuc` @14423244；配置请求 `sourceTitle:"electron"` @15096557） | 模型请求 5/5 与配置请求都是 `Z Code@electron` | 是 |
| 主步 User-Agent | `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 runtime/<navigator.userAgent 小写>`（`SZr`、`$ut` @3509781） | `ZCode/3.16.3 ai-sdk/provider-utils/4.0.27 runtime/node.js/24`，宿主 `navigator.userAgent` 为 `Node.js/24` | 是（按规则；见 §5 第 1 条） |
| 会话标题 User-Agent | 多一段 `ai/6.0.193`（`generateText`，`Y2(_??{},\`ai/${Xno}\`)` @3949935） | `ZCode/3.16.3 ai/6.0.193 ai-sdk/provider-utils/4.0.27 runtime/node.js/24` | 是 |
| 配置请求 User-Agent | `ZCode/3.16.3`（`FGs`） | `ZCode/3.16.3` | 是 |
| 主步正文键序 | `model, max_tokens, [temperature], metadata, system, messages, tools, tool_choice, stream, thinking, output_config`（`getArgs` @3603239、`Zpr` @547735；DESIGN §4.5） | 4/4 为 `model, max_tokens, metadata, system, messages, tools, tool_choice, stream, thinking, output_config`（DSH 未给 `temperature`），`stream` 为 true，工具 29 个 | 是 |
| 会话标题正文键序 | `model, max_tokens, metadata, system, messages, thinking, output_config`，无 `stream`、无 `tools`（`v4a` @13066475） | 相同，`stream` 与 `tools` 都不存在 | 是 |
| `model` | `GLM-5.3-Flash`（`GZt` @526265、`Cpr` @526343） | 5/5 `GLM-5.3-Flash` | 是 |
| `thinking` / `output_config` | `{"type":"enabled"}` / `{"effort": <档位>}`；主步取会话档位（DSH 缺省 `high`），标题取 `low`（r33 目录规则；`PP` @7759001） | 5/5 `thinking.type` 为 `enabled`；主步 effort `high`，标题 effort `low` | 是 |
| `max_tokens` | 主步 `min(128000, floor(1000000 − 估算 − 1000))`，此处为 128000（`aUo` @13215830）；标题 `min(5000, max)` = 5000（`PP`） | 主步 4/4 为 128000，标题 5000 | 是 |
| `metadata.user_id` | `JSON.stringify({device_id, account_uuid:"", session_id})`（`ZWs` @4073127） | 5/5 键为 `device_id, account_uuid, session_id`，`device_id` 非空 | 是 |
| 状态与签名 | 全部 200，带 3.16.3 的签名头，无 401 VERIFY 梯子 | 5/5 HTTP 200，5/5 带完整签名块，无 401，无重发 | 是 |
| 握手 | 原样 PAT，`POST open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`（DESIGN §4.3） | 1 次，raw / jwt（PAT），200 | 是 |
| 额度与用量接口 | 不调用 | 没有 `/api/monitor` 或其他额度请求 | 是 |
| start-plan | 不发请求 | 覆盖行显式 `plan: coding-plan`；5 个模型请求都是 PAT 鉴权并签名，没有 start-plan 形态的请求 | 是 |

网关没有拒绝任何项，不需要回退，没有提交。

## 5. 观察（不是拒绝，供文档后续处理）

1. User-Agent 的运行时段跟随宿主：DSH 桌面版运行时是 Node 24（Electron node 模式），所以线上是 `runtime/node.js/24`。DESIGN §4.2 的「结果」行写的是 `runtime/node.js/22`，那是本机 Node 22.20 下的取值，在 DSH 桌面宿主上不成立。3.16.3 桌面版自己的 agent 进程的运行时段取决于 ZCode 所带 Electron 的 Node 版本，本次没有截 ZCode 自身流量，无法确定两者是否相同。构造规则（`$ut` 先取 `navigator.userAgent`）与 3.16.3 相同。
2. PAT 定位多了一次 `GET …/api_keys`：凭证副本是 v1 记录，迁移后还没有项目 key 定位，所以第一次取 PAT 时按 3.16.3 依次 `getCustomerInfo` → 列 key（找到 `zcode-api-key`，没有新建）→ 铸造。桌面版重启（L4）后真实凭证第一次读取时同样会走这三步，之后定位从记录里读。
3. PAT 定位与铸造三个请求的头名是 `Authorization`、`Content-Type`（3.16.3 传入的字面头），其后是 undici 自加的 `accept, accept-language, sec-fetch-mode, user-agent, accept-encoding`，`user-agent` 为 `node`。3.16.3 桌面 API 客户端在这些请求上是否另加默认头没有核到底，已列在 DESIGN §4.8。
4. 握手请求同样只有 `Authorization`、`Content-Type` 两个调用方头，没有路由头：服务端映射表没有改写握手 URL，与 m1-signing 的运行相同。
5. 延迟（单样本，未归因）：主步到响应头 4.2–7.7 s，标题 1.8 s。

## 6. 清理

- 删除：tap 插件 `wire-tap.mjs`、运行器 `wire-run.mjs`、编排脚本 `wire-run.ps1`、运行日志 `wire-run.log`、整个运行目录 `wire-run/`（含 `tap.jsonl`、事件流、覆盖补丁、工作区副本与数据目录）；凭证副本 `cred-home/` 在运行结束时已删除。tap 自检脚本用的是假值，运行后即删除。
- 保留：本文件（不含任何值）。
