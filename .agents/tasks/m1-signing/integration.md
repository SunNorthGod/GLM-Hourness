# m1-signing 集成报告

日期 2026-10-28。依据：`review-9050e32.md`/`.json`（首轮评审）、`review-fix-loop.md`/`.json`（复审）、`fix-notes.md`、`gates.md`、`network-verify.md`，以及 `git log main` / `git log origin/main`（本报告写入前核对）。本文件不含任何凭证、`Authorization`、key 或签名的值。

## 1. 评审结论与处理

### 1.1 首轮评审（对 `9050e32`，CHANGES_REQUESTED，1 条阻塞 + 6 条低）

7 条全部在 `fce6f04` 修复，该提交 rebase 后为 `6af6c51`。复审逐条确认已解决。

| id | 问题 | 处理 |
| --- | --- | --- |
| 1（阻塞） | 握手通知原样拼接 `error.message` 与服务端 `msg`，Node 22 fetch 头校验错误会引用头值，即凭证 | 已修（`6af6c51`）。签名器自抛的错误改为私有 `SigningFailure`，消息是固定的代码自有种类；`failureReason()` 只返回该种类，其他错误只返回 `error.name`；握手通知与 `signing failed` 通知都用它。`handshake_rejected` 只在服务端 `msg` 匹配 `^HANDSHAKE_[A-Z_]+$` 时带上（同 3.16.3 `N1r`）。L2 测试：带 LF 的假凭证经真实 `Headers` 校验，通知恰为 `(TypeError)`；旧代码上该测试红 |
| 2 | 握手冷却期内项目令牌铸造照常发出，文档未写 | 已修（`6af6c51`）。DESIGN §4.3 偏离 1 与代码注释写明：冷却只挡握手，铸造只受自身 60 s 失败冷却约束，铸造成功即结束握手冷却。行为不变 |
| 3 | fail-open 偏离清单不全 | 已修（`6af6c51`）。DESIGN §4.3 失败梯列出 3.16.3 抛错而本包放行的四种情况：凭证不可解析、缺 `x-session-id`、PoW/Ed25519 失败、握手进行中状态作废；FACTS 增 3.16.3 `failOpenEligible` 行 |
| 4 | 按路径的不签名门在生产中不可达 | 已修（`6af6c51`）。删除 `UNSIGNED_PATHS`、`isUnsignedPath`、对应测试断言、文件头与 DESIGN 中的句子；档位门改为只按 plan 判定 |
| 5 | 被作废的进行中握手的 epoch 守卫无测试 | 已修（`6af6c51`）。新增测试：握手进行中 `invalidate()`，随后 404，下一次签名立即握手；去掉 `state.epoch === epoch` 条件后该测试红 |
| 6 | DESIGN 引用被 git 忽略的 report.md | 已修（`6af6c51`）。DESIGN §4.3 改指 FACTS；FACTS 定义 `@N`（pristine 3.16.3 副本中的 UTF-8 字符偏移）并收录 13 个符号偏移，复审逐个对照 pristine 包核实 |
| 7 | FACTS「官方原文权威源」行保留了被取代的文字 | 已修（`6af6c51`）。该行整行重写，旧文字只留在 git 历史 |

### 1.2 复审（对 `f98afa4..m1-signing`，APPROVED，7 条低，均不阻塞）

复审结论为 APPROVED，未再提交修复。各条现状（以 main @ `6af6c51` 实读为准）：

| id | 问题 | 现状 |
| --- | --- | --- |
| 1 | 握手通知总写「no new handshake for 60 s」，被作废的握手不启动冷却，且按（origin, 凭证）只发一次的键会吞掉之后真正冷却的通知 | 未改。潜在问题：生产构造未接 `onEvent`，当前无外显。随签名状态可见化（DESIGN §4.3 条款 7）一并处理 |
| 2 | 铸造通知 `code=${pt.code ?? ptResp.status}` 未校验服务端 `code` 类型；DESIGN 未写铸造通知是进程级、按原因各一次 | 未改。同上，生产未接 `onEvent`；泄露需服务端在 `code` 里回显请求内容 |
| 3 | `routedHandshake` 的入参类型比调用方宽，`init.headers` 强转会静默丢掉 `Headers` 或数组形式的头 | 未改。唯一调用方 `performHandshake` 传模板字符串与普通对象，当前路径不受影响 |
| 4 | DESIGN §4.3 偏离 2 写「直到进程重启」，实际行重新激活也会结束旁路 | 未改。文档比实际更严，方向安全 |
| 5 | 图节点 `risk-signing` 仍写被证伪的归因 | 未改。按规则只能经图工具更新，留给关闭 `m1-signing` 的编排方；本步不动 `docs/graph/` |
| 6 | 真实网络签名验证在 DESIGN §4.3、HANDOFF §5 第 5 项、FACTS 待定项行被标为 L4，与 main 的 `norm-verify-tiers`（DEVELOPMENT §1.1）不符 | 真实网络验证已在本次沙盒运行完成（见 §4）。文档标签未改：DESIGN §4.3「待 L4」、HANDOFF §5 第 5 项「L4 未做」、FACTS 待定项行「L4 截包」与第 21 行「被服务端接受的形式待 L4」、DEVELOPMENT 事故行「握手能否成功待 L4」仍在，待同步实测结果 |
| 7 | 合入 main 后重跑门禁、跑 L3、提交信息带节点 id | 门禁在 rebase 后按 main 基线 303/22/3 重跑并通过，L3 探针 89/89（见 §3）。节点 id：`b6367d3` 主题带 `(m1-signing)`，`6af6c51` 主题为 `(review of 9050e32)`，未带；合入为快进，没有合并提交，已推送的历史不改写 |

## 2. main 上的最终提交

- main 合入前：`e3305a67617324aa0304e36f842c154c9192eb87`。
- rebase：基底由 `f98afa4` 换为 `e3305a6`；`9050e32` → `b6367d3`（无冲突），`fce6f04` → `6af6c51`（`src/glm-llm/signing.ts` `base64ToBytes` 一处冲突，保留 main 的 `Uint8Array<ArrayBuffer>` 返回类型与分支的 `SigningFailure`）。
- 快进合入，8 个文件，417 行增、67 行删：
  - `b6367d30827b73d30a53f44a13144d06579af88b` fix(glm-llm): sign on the provider URL so the handshake reaches open.bigmodel.cn (m1-signing)
  - `6af6c517559bc25286aadc7348361c8c7d19a720` fix(glm-llm): keep credentials and server text out of signing notices (review of 9050e32)
- main = origin/main = `6af6c517559bc25286aadc7348361c8c7d19a720`（本报告写入前 `git rev-parse` 核对），无 ahead/behind，未强推。
- 真实网络验证后没有新提交：原样 `Authorization` 被接受，无需改为 Bearer。

## 3. 门禁

在 rebase 后的 `6af6c51` 上运行（worktree `.worktrees/m1-signing`）。

| 门禁 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run build` | 0 | tsc（root、ui）通过，`build-ui` 写出 `ui/client.js` |
| `npm run preflight` | 0 | `preflight: OK (13 exports, 1 patch, client half absent; ui bundle client half built)` |
| `npm test` | 0 | check-verbatim 397 段逐字、0 条已知偏差；36 个 spec 文件，483 用例，483 通过，0 失败；graph:smoke ok |

| 检查器 | 结果 | 基线 |
| --- | --- | --- |
| ESLint | 303 条压制 | 303 |
| knip | 22 条在基线内 | 22 |
| jscpd | 3 处克隆（26 行重复） | 3 |
| 密钥扫描 | gitleaks 8.30.1，HEAD 上 95 个提交及暂存/未暂存改动，无泄露 | — |

- L3 探针：`npm run probe`（离线，共用 `glmsandbox`，未改配置）退出码 0，`probe: 89/89 passed`，运行 `2026-10-28T11-47-36-974Z`。
- 环境说明（非代码问题）：worktree 的 `node_modules` 早于 main 的依赖变更，首次 `npm test` 在 ESLint 报 `no-unsafe-argument`；经 `pnpm install --frozen-lockfile --offline` 装到 TypeScript 5.9.3 后通过，lockfile 未变。worktree 没有 `reference/`，门禁以 `ZCODE_BUNDLE` 指向 pristine 3.16.3 包运行，`glm-startplan.spec` 用的 `zcode_system.json` 从主检出临时复制，运行后删除，`git status --short` 为空。

## 4. 真实网络握手（headless 沙盒）

运行 `net-1793188413414`，代码 main @ `6af6c51`（重建 dist 后运行），`glmsandbox`，模型 `glm-5.3-flash`，`DSH_PERMISSION_MODE=read-only`，只走 coding-plan（覆盖行显式 `plan: coding-plan`）。退出码 0，82 s，回合 `completed`，4 次 Read，工作区无写入。证据：`network-verify.md` 与 `runs/net-1793188413414/`。tap 只记 URL（去查询串、ID 替换为 `<id>`）、状态、耗时、头名称与 `Authorization` 的形式和形状，不记任何值；tap 与一次性脚本已删除。

- 握手：1 次，11:53:36.209Z，`POST open.bigmodel.cn/api/paas/c1f3a7e2/v2/client`，HTTP 200，信封 `code` 200，`privateCipher` 存在。握手请求头只有 `authorization`、`content-type`，无路由头，服务端映射表未改写握手 URL。
- 握手间隔：会话约 80 s，长于 60 s 冷却窗口，之后再无握手（成功私钥按进程缓存）。握手成功，冷却路径未触发，没有失败握手间隔可列。
- 握手 `Authorization`：raw 形式（无 `Bearer` 前缀），凭证为 JWT（PAT），请求体字段 `accessToken, nonce, sig, ts`，被接受。Bearer 未试，无 Bearer 切换提交。
- PAT 铸造：`getCustomerInfo` 200，`access_tokens` 200。
- 模型请求：6 次（标题 1 + 主请求 5），均发往 `zcode.z.ai/api/v1/ultra/anthropic/v1/messages`，均 HTTP 200，均已签名，每次只发一次。
- 签名块头名称（线上顺序，位于 `content-type` 之后）：`x-client-ts`、`x-client-version`、`x-client-sig`、`x-session-id`、`x-client-nonce`、`x-app-id`、`x-client-pow`。`x-session-id` 是从原头移入签名块的会话头，其余 6 个为签名器新增；`x-client-sign-verified` 未出现；`x-zcode-authorization` 是最后一个头，在签名块之后，与 3.16.3 组装顺序一致。
- 401 VERIFY 梯子：未出现，没有 401，没有同一请求的三次发送。ultra 网关接受「`Authorization` 为 apiKey、签名用 PAT 派生 apiKeyId」的组合。

每请求用量（`usage.jsonl`）：

| 请求 | input | cacheRead | cacheWrite | output | 命中率 |
| --- | --- | --- | --- | --- | --- |
| session-title | 228 | 0 | 0 | 99 | 0% |
| main-1 | 15873 | 0 | 0 | 252 | 0% |
| main-2 | 401 | 15872 | 0 | 72 | 98% |
| main-3 | 26 | 16384 | 0 | 84 | 100% |
| main-4 | 455 | 16384 | 0 | 83 | 97% |
| main-5 | 12 | 17152 | 0 | 357 | 100% |

主请求合计 input 16767、cacheRead 65792、output 848，整体命中率 80%。

- token 计量：与 `cache-2026-10-28/runs/` 下 5 次无签名运行同形态（首个主请求无缓存命中，之后 97–100%，cacheWrite 恒为 0）；整体命中率 80% 落在无签名运行的 80–87% 内。main-1 input 比无签名运行多约 3.7k，任务提示词、权限模式与提交都不同，签名头不计入 token，不归因于签名。
- coding-plan 用量：1.5 倍套餐扣减不在 usage journal 中（只记服务端返回的 token 数），签名是否改变套餐计费本次无法判断。
- 延迟（单样本，未归因）：签名运行主请求到响应头 6.3–8.0 s，main-1 为 31.0 s；无签名运行 1.5–5.8 s。计时起点在签名完成之后，差值在网络或服务端；时段与提示词不同，需同时段签名/不签名对照才能判断。

## 5. start-plan

只做了离线验证。start-plan 不签名，与 ZCode 3.16.3 一致：pristine 3.16.3 包中 `QUs`（@3832832）对 `zhipu-account` 的 `start-plan`、`off-peak`、`highspeed` 模式先返回 `false`，`protectTransport`（@3833810）随后走路由传输或不签名的 fetch（离线实读）。本包对 `plan === 'start-plan'` 不创建签名器，组装测试钉住该行为（旧代码上该测试看到 1 次握手，为红）。start-plan 没有额度，未发送任何真实请求；本次网络运行的全部模型请求都在 coding-plan 路由上。

## 6. 仍需桌面版的事项

本次运行未启动、未操作桌面版，未改任何 `~/.dsh` profile。按 `norm-verify-tiers`（DEVELOPMENT §1.1），以下并入 M2 里程碑收尾的批次 L4：

- 桌面版重启加载 `6af6c51`：确认 `glm-hourness/glm-llm` 行激活无新错误。重启前桌面版运行的仍是旧代码（旧握手地址）。
- 桌面版真实 GLM 会话（coding-plan）：确认签名请求在桌面运行时下同样被接受，且无 401 VERIFY。
- 签名状态在桌面界面可见（DESIGN §4.3 条款 7，规划中，未实现）。

不属于桌面版、仍未决的事项：

- 签名对 coding-plan 1.5 倍套餐扣减的影响：需套餐额度数据，usage journal 不含。
- 签名运行的响应头延迟偏高：需同时段签名/不签名对照。
- 文档同步：report.md §5 第 1–5 项已有实测结果，DESIGN §4.3、HANDOFF §5 第 5 项、FACTS 第 21 行与待定项行、DEVELOPMENT 事故行仍写「待 L4」，需按 §4 更新；图节点 `risk-signing` 需经图工具更新。
- 复审第 1–4 条（§1.2）未改。

worktree `.worktrees/m1-signing`（分支 `m1-signing` @ `6af6c51`）保留未删，由编排方移除。`.worktrees/m2-9` 与分支 `m2-9` 未动。
