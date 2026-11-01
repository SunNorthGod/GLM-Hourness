# m1-signing 真实网络验证（headless 沙盒）

日期 2026-10-28。代码为 `main` @ `6af6c51`（`npm run build` 重建 dist 后运行，日志 `netverify-build.log`，退出码 0）。glmsandbox 的 `dsh-glm-hourness` 是指向本仓库的 junction，运行加载的就是这份 dist。未启动、未操作桌面版；未改 glmsandbox 或任何 `~/.dsh` profile 配置，tap 行只经本次运行的覆盖 patch 插入。start-plan 路由未发任何请求：覆盖行显式 `glm-hourness/glm-llm config: { plan: coding-plan }`，全部模型请求都发往 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages`。

## 1. 运行

- 运行 id：`net-1793188413414`
- 路径：`.agents/tasks/m1-signing/runs/net-1793188413414/`（`net.patch.yml`、`prompt.md`、`events.jsonl`、`stderr.txt`（空）、`tap.jsonl`、`dsh-home/glm-hourness/audit/usage.jsonl`、`ws/`）
- 方式：沿用标定 harness 的 `scripts/sandbox.mjs` 覆盖行（数据目录、附件存储、`limits.mjs` 边界行 maxSteps 20 / 600 s、workspace-changes），与 `cache-2026-10-28/tap-run.mjs` 同一接法，另插一行一次性 fetch tap。`run-calibrate.mjs` 本身不接受额外覆盖行，所以没有直接调用它。
- 模型 `glm-5.3-flash`，`DSH_PERMISSION_MODE=read-only`，工作区为 `tests/calibration/bugfix-csv-quotes/fixture` 的 git 副本。任务：依次读 4 个文件（每步一次 Read），再写摘要。
- 结果：退出码 0，用时 82 s，回合 `completed`，4 次 Read，工作区 `git status` 为空（无写入）。
- tap 记录：URL（去掉查询串，bigmodel 组织/项目/key id 替换为 `<id>`）、状态、耗时（到响应头）、请求头名称、`Authorization` 形式（raw / Bearer）与形状（jwt / id.secret）、握手请求体字段名、握手信封 `code`、`privateCipher` 是否存在、401 模型响应的 VERIFY 原因。不记录任何头值、凭证、签名或内容。tap 脚本是一次性文件，运行后已删除。
- 引用前检查：`tap.jsonl` 中长度 ≥32 的 token 形字符串只有两处 URL 路径片段，无 `eyJ` 开头的串，无凭证材料。

## 2. 请求序列（tap.jsonl，10 条）

| 时间（UTC） | 类别 | 方法 | 目标 | 状态 | 到响应头 ms | Authorization | 签名 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 11:53:35.555 | 路由配置 | GET | `zcode.z.ai/api/v1/agent/configs` | 200 | 108 | 无 | 否 |
| 11:53:35.668 | PAT 铸造（客户信息） | GET | `bigmodel.cn/api/biz/customer/getCustomerInfo` | 200 | 343 | raw / jwt | 否 |
| 11:53:36.012 | PAT 铸造（access_tokens） | POST | `bigmodel.cn/api/biz/v1/organization/<id>/projects/<id>/api_keys/<id>/access_tokens` | 200 | 194 | Bearer / jwt | 否 |
| 11:53:36.209 | 握手 | POST | `open.bigmodel.cn/api/paas/c1f3a7e2/v2/client` | 200 | 180 | raw / jwt | 否 |
| 11:53:36.393 | 模型（标题） | POST | `zcode.z.ai/api/v1/ultra/anthropic/v1/messages` | 200 | 911 | Bearer / id.secret | 是 |
| 11:53:36.410 | 模型 main-1 | POST | 同上 | 200 | 30954 | Bearer / id.secret | 是 |
| 11:54:13.251 | 模型 main-2 | POST | 同上 | 200 | 6308 | Bearer / id.secret | 是 |
| 11:54:20.697 | 模型 main-3 | POST | 同上 | 200 | 7547 | Bearer / id.secret | 是 |
| 11:54:29.518 | 模型 main-4 | POST | 同上 | 200 | 7955 | Bearer / id.secret | 是 |
| 11:54:40.902 | 模型 main-5 | POST | 同上 | 200 | 6445 | Bearer / id.secret | 是 |

模型请求 6 次（标题 1 + 主请求 5），每次 1 发；主请求的消息数依次为 1、3、5、7、9，没有同一请求的重发。

## 3. 检查项

- 握手次数：1。
- 握手 host：`open.bigmodel.cn`，路径 `/api/paas/c1f3a7e2/v2/client`，HTTP 200，信封 `code` 200，`data.privateCipher` 存在。握手请求头只有 `authorization`、`content-type`，没有路由头，即服务端映射表没有改写握手 URL（report.md §5 第 2 项）。
- 握手 `Authorization` 形式：raw（原样凭证，无 `Bearer ` 前缀），凭证为 JWT 形式（PAT），请求体字段 `accessToken, nonce, sig, ts`。被接受（HTTP 200 + 私钥密文）。Bearer 形式未试，也无需试；代码不改。
- 握手之后：5 个主请求与标题请求全部带签名头，再无握手。会话从首个请求到最后一个响应约 80 s，超过 60 s 冷却窗口，仍只握手一次（成功私钥按进程缓存）。
- 签名块头名称（模型请求，按线上顺序）：`x-client-ts`、`x-client-version`、`x-client-sig`、`x-session-id`、`x-client-nonce`、`x-app-id`、`x-client-pow`，排在 `content-type` 之后。其中 `x-session-id` 是签名器从原头里移入签名块的会话头，其余 6 个是签名器新加的头；`x-client-sign-verified` 未出现；`x-zcode-authorization` 是最后一个头，位于签名块之后（与 3.16.3 的组装顺序一致）。
- 模型请求完整头名称：`http-referer, user-agent, x-zcode-app-version, x-title, x-release-channel, x-client-language, x-client-timezone, x-zcode-agent, x-platform, x-os-category, x-os-version, x-request-id, x-zcode-session-type, x-zcode-trace-id, x-api-key, authorization, anthropic-version, content-type, x-client-ts, x-client-version, x-client-sig, x-session-id, x-client-nonce, x-app-id, x-client-pow, x-zcode-authorization`。
- 401 VERIFY 梯子：无。没有 401，没有同一请求的三次发送。ultra 网关接受「`Authorization` 为 apiKey、签名用 PAT 派生 apiKeyId」的签名请求（report.md §5 第 4 项）。
- PAT 铸造：两步都 200（report.md §5 第 5 项）。
- 失败冷却：本次握手成功，冷却路径未被触发，无可列的失败握手间隔。

## 4. 用量（usage.jsonl，每请求）

本次（签名）：

| 请求 | 完成时间（UTC） | input | cacheRead | cacheWrite | output | 命中率 |
| --- | --- | --- | --- | --- | --- | --- |
| session-title | 11:53:39.442 | 228 | 0 | 0 | 99 | 0% |
| main-1 | 11:54:13.208 | 15873 | 0 | 0 | 252 | 0% |
| main-2 | 11:54:20.656 | 401 | 15872 | 0 | 72 | 98% |
| main-3 | 11:54:29.477 | 26 | 16384 | 0 | 84 | 100% |
| main-4 | 11:54:40.868 | 455 | 16384 | 0 | 83 | 97% |
| main-5 | 11:54:55.892 | 12 | 17152 | 0 | 357 | 100% |

主请求合计：input 16767，cacheRead 65792，output 848，整体命中率 80%。所有记录 `reasoningTokens` 为 0 或缺省。

对照：`cache-2026-10-28/runs/` 下 5 次无签名 tap 运行（任务 bugfix-csv-quotes，workspace-write / danger-full-access，2026-10-28 04:48–06:24 UTC）：

| 运行 | 主请求数 | main-1 input | 主请求 input / cacheRead / output 合计 | 整体命中率 | 主请求到响应头 ms |
| --- | --- | --- | --- | --- | --- |
| tap-1793162885555/1 | 7 | 12093 | 15548 / 80960 / 2236 | 84% | 4014–4271 |
| tap-1793162885555/2 | 6 | 12093 | 14837 / 65344 / 1659 | 81% | 4103–5531 |
| tap-1793162885555/3 | 7 | 12093 | 18968 / 75776 / 1763 | 80% | 1495–4411 |
| tap-1793168439212/1 | 8 | 12178 | 15591 / 93952 / 1889 | 86% | 4193–5780 |
| tap-1793168439212/2 | 9 | 12178 | 17452 / 113856 / 3916 | 87% | 4076–4960 |
| net-1793188413414（签名） | 5 | 15873 | 16767 / 65792 / 848 | 80% | 6308–30954 |

结论：

- token 计量没有可见变化。签名运行与无签名运行同一形态：首个主请求 cacheRead 为 0，之后每个主请求命中 97–100%，cacheWrite 始终为 0，标题请求约 228–229 input、0 cache。整体命中率 80% 落在无签名运行的 80–87% 区间内（签名运行主请求少，首请求未命中的权重更大）。
- main-1 input 15873 比无签名运行的 12093 / 12178 多约 3.7k，任务提示词、权限模式（read-only）与提交都不同，签名头不进 token 计数，这个差值不归因于签名。
- 套餐额度（coding-plan 的 1.5 倍计费，report.md §5 第 6 项）在 usage journal 里不可见：journal 只记服务端返回的 token 数，不记套餐扣减。签名是否改变套餐计费，本次运行无法判断。
- 延迟（单样本观察，未归因）：签名运行主请求到响应头 6.3–8.0 s，首个主请求 31.0 s；无签名运行 1.5–5.8 s。时段不同（本次 19:53 UTC+8，非高峰；对照为 12:48–14:24 UTC+8），提示词也更长。tap 的计时起点在签名完成之后，PoW 等客户端签名耗时不在其中，所以差值在网络或服务端。需要多次运行或同时段 A/B 才能判断是否与签名有关。

## 5. 提交

无。握手原样 `Authorization` 被接受，不需要改为 Bearer；未发现需要改的行为。本步只新增本文件与 `runs/net-1793188413414/`（`.agents/` 被 git 忽略）。一次性脚本（tap、运行器、用量对照、组合检查）已删除。
