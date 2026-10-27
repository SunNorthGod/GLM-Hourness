# GLM-Hourness 总体架构与底层设计

版本：0.3（2026-10-27）
状态：生效。取代设计稿 v0.1（原 `docs/DESIGN.md`）、运行时设计 v0.1 的底层部分（`.llm/docs/03-runtime-design.md` §1/§2/§5/§6/§10）与差异底账 v0.1（`dsh-glm-dialect/docs/02-dsh-zcode-divergence.md`）。旧文本见 git 历史（提交 `c518317`、`9266fb6`）。
前置：`CHARTER.md`。编排层见 `ORCHESTRATION.md`。

标注：〔实读〕代码或源码已读；〔实测〕真网或真机验证过；〔推断〕由代码与数据推出，未在真机逐项验证；〔定案〕用户决议；〔规划〕尚未实现。

## 1. 范围与基线

| 项 | 基线 | 依据 |
| --- | --- | --- |
| ZCode | 3.16.3 | 用户定案 2026-10-27；本机安装版为 3.16.3（卸载注册表）〔实读〕 |
| DSH | Desktop 0.2.1-rc.3，profile `desktop` | 官方类型 `@deepseek-ai/dsh-llm@0.2.1-rc.3` 等作为 devDependency |
| 模型 | GLM-5.3、GLM-5.3-Flash | 通道目录 |

本机 ZCode 安装版被用户打过补丁，只能作为机制参考，不能作为逐字文本来源。逐字文本的权威来源见 `reference/zcode-verbatim.md`。

反向代理（`zcode-proxy.exe`，8317 端口）不在本项目范围内〔定案 2026-10-27〕。任何插件行都不识别、不依赖反代路由；代码与文档中与反代有关的判断和描述在路由收口时删除（`ROADMAP.md` M1）。

## 2. 架构总览

### 2.1 分层

```
GLM-Hourness
├─ 底层
│  ├─ 通道：glm-llm（adapter）、glm-login（命令）
│  └─ 方言：glm-prompt（提示词与工具面）、glm-compact（压缩镜像）、toolsearch（工具检索）
└─ 编排层
   ├─ guard、memory、workflow、hourness（用量与报告）
   └─ 呈现：独立 UI bundle
```

### 2.2 插件行（现状）

| 行 id | 入口 | 层 | 现状 |
| --- | --- | --- | --- |
| `glm-hourness/glm-llm` | `dist/glm-llm/index.js` | 通道 | 真网冒烟通过〔实测〕；DSH 真实会话尚未使用过〔实读审计数据〕 |
| `glm-hourness/glm-login` | `dist/glm-llm/login-row.js` | 通道 | `/glm-login`、`/glm-status`、`/glm-logout` |
| `glm-hourness/glm-prompt` | `dist/glm-prompt/index.js` | 方言 | 见 §5 |
| `glm-hourness/glm-compact` | `dist/glm-prompt/compact-row.js` | 方言 | 见 §5.6 |
| `glm-hourness/toolsearch` | `dist/toolsearch/index.js` | 方言 | 见 §5.7 |
| `glm-hourness/guard` | `dist/guard/index.js` | 编排 | 见 `ORCHESTRATION.md` §6 |
| `glm-hourness/memory` | `dist/memory/index.js` | 编排 | 见 `ORCHESTRATION.md` §8 |
| `glm-hourness/workflow` | `dist/workflow/index.js` | 编排 | 仅记录派遣类工具调用 |
| `glm-hourness/hourness` | `dist/ui/index.js` | 编排 | `/hourness` 命令 |
| `glm-hourness/ui` | `ui/`（独立包） | 呈现 | 设置页说明 + 输入框「GLM 通道」pill |

### 2.3 两个 bundle 与一包一源

主包 `dsh-glm-hourness` 是多行 cordis 插件包。DSH 的 client-modules 按包名组成 web 启动图，同一个包若被多个 active Loader 行解析且声明了 `dsh.client`，启动失败（`resolves from multiple active Loader sources`）〔实测，2026-10-27 事故〕。因此 client 半必须放在独立的单入口包 `dsh-glm-hourness-ui`，主包不得声明 `dsh.client`。preflight 固化了这条检查。

仓库不拆分〔定案〕：两层都属于同一个项目，同仓维护。

### 2.4 共享服务〔规划〕

现状问题：各行通过 YAML 各自配置 `home`，guard 的违规回调无法从配置传入，导致违规审计为空；2026-10-27 15:36–17:22（本地时间）期间用量记录写进了 `~/.dsh/profiles/desktop/.llm/`，共 190 条，`/hourness` 读不到〔实读〕。

设计：由一行提供数据目录与审计流水服务，其余行以可选依赖注入。

| 数据 | 位置 | 理由 |
| --- | --- | --- |
| 凭证、deviceMid、用量流水 | 用户级，一台机器一份 | 额度跟账号走，按项目拆开反而看不全 |
| 记忆（事实）、违规、决策 | 工作区 `.llm/` | 记录的是在这个项目里学到的东西与犯过的错，混在一起会互相污染 |
| 项目图 | 仓库内 | 项目知识，随 git 版本化（`ORCHESTRATION.md` §2.6） |

用户级的具体目录与偏好类记忆的归属见 `ORCHESTRATION.md` §15 待定项。

### 2.5 行健康〔规划〕

每行在每个会话中第一次触发时上报一条状态：已生效，或未生效及原因。`/glm-status` 与 UI 显示行健康表。真实会话里「哪几行在起作用」目前无法回答，这一机制补上该缺口。

## 3. 路由判定〔定案，待实现〕

现状〔实读〕：各行判断「是否 GLM 会话」的写法不一致。`glm-prompt` 认 provider `glm` 或模型名前缀 `glm`；`toolsearch` 在 `agent/created` 时只认 `agent.model.current().provider === 'glm'`；todo 提醒依赖 `agent.model.current()`。rc.3 桌面版在 `agent/created` 与 `agent/pre-step` 上给出的路由为空（`legacy/desktop-dialect-triage.md`，git 历史），唯一可靠的信号是 `system-prompt/assemble` 瀑布中 `variables.provider` / `variables.model`。原生通道的 provider id 是 `glm-zcode`。由此推断 todo 提醒与工具检索在真机上未生效〔推断〕。

定案：

1. 方言跟着模型族走：训练分布是模型的属性。判据为模型 id 属于 GLM 族。
2. 通道跟着路由走：ZCode 身份是传输层的属性。判据为 provider id 是本通道注册的 id（默认 `glm-zcode`）。
3. 判定函数只有一处（`src/shared/`），所有行共用。
4. 只对准 rc.3 的可靠信号；兼容旧构建的分支删除。
5. 单测里的假宿主必须给出与 rc.3 相同的信号，不得提供真宿主不提供的路由字段。

## 4. 通道

请求流程（`ZcodeAdapter.stream`）〔实读〕：加载凭证 → deviceMid → 端点路由 → 组装身份头与鉴权头 → 签名 V4（失败放行）→ Anthropic Messages 传输。

### 4.1 凭证与登录

- 登录：ZCode 账号体系的 bigmodel 轮询登录（`/glm-login` 打开浏览器授权，5 分钟超时），解析出套餐 API Key，名称与 ZCode 客户端一致（`zcode-api-key`），两者共用同一把 Key〔实读〕。
- 存储：`<home>/credentials.json`，AES-256-GCM，原子写入〔实读〕。
- 风险：加密密钥由 `HOME`/`USERPROFILE`、平台与架构推导，看过源码即可算出；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖。凭证文件不入库，当前可接受。后续迁到系统钥匙串或 DSH 凭证服务〔规划〕。

### 4.2 身份头

LLM 平面（bundle `g6n` 形态）：`HTTP-Referer`、`User-Agent: ZCode/<ver>`、`X-ZCode-App-Version`、`X-Title: Z Code@cli`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-ZCode-Agent: glm`、`X-Platform`、`X-Os-Category`、`X-Os-Version`；不带 `X-Device-Mid`。上下文平面（bundle `TV`，用于端点路由与签名）带 `X-Device-Mid`，不带 `X-ZCode-Agent`。值经可打印 ASCII 规范化〔实读〕。

版本不一致〔实读〕：身份头默认 `3.14.0`，签名平面的 `clientVersion` 为 `3.15.1`，提示词与工具面镜像 3.16.3。统一到 3.16.3，并按 3.16.3 复核三处协议是否有变化（`ROADMAP.md` M1.1）。

### 4.3 签名 V4

移植自 zcode-api 的 `client-signing`（对应 ZCode 3.15.1 `ClientRequestSigningV4Signer`）：握手 `POST /api/paas/c1f3a7e2/v2/client` → HKDF 派生 → Ed25519 业务签名 + PoW → 七个签名头。start-plan 与 off-peak 路径不签名。失败梯：握手失败无签发送；连续两次 401 VERIFY 拒绝后对该（origin, credential）永久旁路〔实读〕。

现状：握手对当前凭证失败，按设计无签发送，请求成功〔实测〕。签名对 coding-plan 1.5 倍用量的影响未验证。要求：签名结果对系统可见，即状态里显示签名情况，每条用量记录标注是否签名（条款 7）〔规划〕。

### 4.4 端点路由

`GET https://zcode.z.ai/api/v1/agent/configs`，按 `data.proxyEndpoint.mapping` 改写请求 URL；成功缓存 300 秒，失败冷却 30 秒，超时 3 秒；任何失败保持原 URL。同一快照携带 3.16.3 的请求验证（captcha）开关〔实读〕。

### 4.5 传输与档位

- 上游：`https://open.bigmodel.cn/api/anthropic/v1/messages`（路由改写前），`anthropic-version: 2023-06-01`〔实读〕。
- 档位：coding-plan（默认，签名，享 ZCode 渠道用量加成）与 start-plan（网关要求的三块系统提示、JWT 鉴权、currentDate 前缀）。start-plan 的三块系统提示属于底层：网关缺了就拒收（3012/405）。
- 状态：coding-plan 端到端真网成功，模型返回 `pong`〔实测，`scripts/smoke-zcode-authorized.mjs`〕；start-plan 只有单测。

### 4.6 模型目录与思考档位

- 目录：`glm-5.3`（GLM-5.3）、`glm-5.3-flash`（GLM-5.3-Flash），输入模态文本与图像；上下文窗口 512,000；默认 `max_tokens` 32000〔实读〕。
- 思考：GLM-5.3 系强制思考；effort 三档 `low` / `high` / `max`，默认 `high`〔定案 2026-10-27，五档词汇 API 接受但 GLM 不用〕。

### 4.7 额度数据〔规划〕

通道负责取数，编排层负责展示：5 小时窗口剩余、周额度、积分余额、MCP 余额，以及错误码 1308/1310/1316–1321 携带的 `next_flush_time`。计算口径见 `ORCHESTRATION.md` §11 与 `FACTS.md` §2.4。

## 5. 方言

### 5.1 原则〔定案〕

- 行为习惯类内容逐字镜像 ZCode 3.16.3（训练分布）。
- 宿主事实类断言（界面呈现、权限语义、shell、路径、记忆位置）必须与 DSH 实际行为一致；对不上就按 DSH 实况改写，措辞贴原句形态。
- start-plan 档：除 agentsMd 节外，系统提示词与 ZCode 逐字节一致。
- coding-plan 档：安全声明段替换为用户的工程环境声明，其余按 §5.3 本地化。
- 只作用于 GLM 会话（§3），非 GLM 会话零影响。

### 5.2 提示词节

`system-prompt/assemble` 瀑布上以 `prepend` 注册的监听器在 `next()` 之后读取路由变量并改写节列表（rc.3 唯一可行的接缝）〔实读〕。

| 节 | order | 档位 |
| --- | --- | --- |
| `glm:cli-prefix` | -1001 | 两档 |
| `harness:identity`（同名替换 DSH 身份节） | -1000 | 两档；安全声明按档位二选一 |
| `glm:environment` | -900 | coding-plan，需配置 `env` |
| `glm:session-guidance` | 2300 | coding-plan |
| `glm:memory` | 2350 | coding-plan |
| `glm:persona`（汇报细度） | 2360 | 两档 |
| `glm:context-management` | 2400 | coding-plan |
| `glm:deferred-tools` | 2500 | toolsearch 行启用时 |

### 5.3 本地化清单（coding-plan）

| # | 节 | 处理 |
| --- | --- | --- |
| ① | Harness 块 | 「终端显示」改为「DSH Web GUI 显示」，其余逐字 |
| ② | Session guidance | 技能规则改写为 DSH 技能接缝 |
| ③ | Environment | ZCode 骨架，填 DSH 真实目录、git、平台、shell |
| ④ | Desktop context | DSH 无对应特性的部分裁掉 |
| ⑤ | Skills 引导 | DSH 技能清单 |
| ⑥ | 工具 schema 中的行为断言 | Bash 实为 pwsh、超时单位、工作目录参数；垫片必须兑现 schema 的承诺，兑现不了就改写该句 |
| ⑦ | Context management | 逐字，承诺与 DSH 压缩一致 |
| ⑧ | Memory | 写入纪律改为 memory 工具族与工作区 `.llm` |
| ⑨ | Deferred 声明 | 与工具检索机制自证一致 |

### 5.4 工具面

- 别名：`Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`TodoWrite`，schema 逐字取自 3.16.3 协议采样（`reference/zcode-tool-schemas.md`），执行时委托捕获的原生执行器〔实读〕。
- 原生 `read`、`write`、`edit`、`glob`、`grep`、`pwsh`、`todo_write` 在 GLM 路由下隐藏，切走即恢复。
- 参数映射：`Bash` 的 `timeout`（秒）转 `timeoutMs`，`working_dir` 转 `workdir`；`Glob` 的 `ip` 原生无对应，丢弃；`TodoWrite` 的 `priority`（`high`/`medium`/`low`）在执行边界剥离。

### 5.5 todo 提醒

ZCode 双阈值 10/10：距上次 TodoWrite 与距上次提醒都达到 10 轮时，注入逐字提醒并回显当前 todo。

偏差〔实读〕：现在按完成的工具调用计数，官方按助手轮次计数，一轮并行调用多个工具会多计，提醒来得比官方早。路由收口后改为按轮次计数。

todo 在编排层降级为项目图的视图（`ORCHESTRATION.md` §2.5），TodoWrite 本身保留，因为它是 GLM 的训练习惯。

### 5.6 压缩镜像

ZCode compact 提示词逐字（`<analysis>` 先行、9 节摘要、安全指令保留），产物剥 `<analysis>`。挂在 DSH `BasicCompactionEngine.summarize()` 上，GLM 路由走镜像，其余委托基类；基类缺失时该行降级为不挂载〔实读〕。ZCode 的 autoCompact 阈值（166k）与 microcompact 公式记录在 `reference/zcode-capabilities.md` §11.2，未接入。

压缩后的重新锚定属于编排层（`ORCHESTRATION.md` §2.5）。

### 5.7 工具检索

ZCode deferred 机制的 local 模式：驻留面之外的原生工具进入延迟目录；`ToolSearch`（schema 逐字）支持 `select:<name>` 精确选择与关键词检索，结果以 `<functions>` 块回注，并以作用域内同名包装注册激活〔实读〕。

已知问题：激活只在 `agent/created` 时 provider 为 `glm` 才发生，原生通道与 rc.3 下不触发（§3）〔推断〕。记忆工具应常驻，不进延迟目录（`ORCHESTRATION.md` §8）。

### 5.8 与 ZCode 的差异总表

| # | 能力 | 类 | 处置 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 工具命名与 schema | 方言 | 别名投影 | 已实现 |
| 2 | TodoWrite 三字段 | 方言 | 垫片剥离 priority | 已实现 |
| 3 | 身份节 | 方言 | 同名替换 | 已实现 |
| 4 | todo 提醒 10/10 | 方言 | 逐字文案与阈值 | 已实现，计数口径有偏差，真机未确认生效 |
| 5 | 合成消息通道 | 同构 | 不动 | — |
| 6 | compact 提示词 | 方言 | 镜像引擎 | 已实现 |
| 7 | beta 能力头 | 通道 | 按能力集动态添加 | 未实现 |
| 8 | 工具懒加载 | 缺口 | toolsearch 行 | 已实现，真机未确认生效 |
| 9 | 服务端 web 工具 | 缺口 | 待实测 `web_search_prime` / webReader 直连闸门 | 挂账 |
| 10 | 持久记忆 | 缺口 | memory 行（编排层） | 已实现，未被真正使用 |
| 11 | 身份头、签名、路由 | 通道 | glm-llm | 已实现，版本待统一 |
| 12 | 模型目录、登录 | 通道 | glm-llm、glm-login | 已实现 |
| 13 | 日期与输出风格提醒族 | 方言 | 低成本可选 | 未实现 |
| 14 | 缓存断点参数 | 通道 | 低优先级 | 未实现 |
| 16 | thinking 与采样参数 | 通道 | effort 三档、thinking 时剥采样参数 | 已实现 effort |

## 6. 注入约定〔定案〕

方言层与编排层都要往对话里放 harness 生成的内容（提醒、投影、检查结果、纠偏），约定如下：

1. 格式：用 GLM 熟悉的 `<system-reminder>` 形态，写短，位置固定。ZCode 自身以这种形态递送 deferred 名单与提醒（`reference/zcode-tool-schemas.md` §8）。
2. 位置：动态内容放在对话末尾，不放进系统提示词。系统提示词保持稳定，以免每一步都让提示词缓存失效。按积分公式，GLM-5.3 缓存命中系数 1.7、普通输入 6.9，命中部分约省四分之三（`FACTS.md` §2.4）。
3. 通道：沿用 `tools/post-execute` 的 `additionalContexts`（带来源标签的合成 notice，与 DSH repeat-tool-reminder 同一机制），或 `agent/pre-step` 的消息修正。
4. 来源标签唯一，便于审计与用量归因。

## 7. 降级与上报

| 行 | 故障或禁用时 | 上报位置〔规划〕 |
| --- | --- | --- |
| glm-llm | GLM 通道不可用，其他 provider 不受影响 | 行健康、`/glm-status` |
| glm-llm 签名 | 无签发送 | 状态、用量记录的签名标注 |
| glm-llm 路由 | 保持原 URL | 状态 |
| glm-prompt | 退回 DSH 原生工具面与文案 | 行健康 |
| glm-compact | 不挂载，profile 原有压缩照常 | 行健康 |
| toolsearch | 全量直载 | 行健康 |
| guard | 无门禁 | 行健康（显式禁用除外） |
| memory | 无记忆、无审计 | 行健康 |
| workflow / hourness | 无记录、无报告 | 行健康 |

激活期（`apply`）不抛错：配置缺失降级为 warn 与 no-op，因为激活失败会拖垮宿主启动（2026-10-27 事故）。降级必须上报，不得只打一行警告（`CHARTER.md` §6.1 条款 7）。

## 8. 契约与适配层

- adapter：`ZcodeAdapter` 底部有编译期检查 `AdapterContractCheck`，对照官方 `LlmAdapter` 类型〔实读〕。
- 事件钩子与服务：其余行使用手写结构类型（`src/shared/dsh-min.ts`），没有对照官方类型。rc.3 已漂移过一次（路由字段为空）。改为对照官方 `.d.ts` 做类型级检查〔规划〕。
- 适配层：所有用到 DSH 接口的地方收进一层薄适配，宿主升级只改这一层〔规划〕。
- 回归：L3 沙盒真实启动加行为探针做成门禁；每次 DSH 升级先跑一遍（`DEVELOPMENT.md` §3、`ROADMAP.md` M1.7）。

## 9. 开放问题

| 项 | 验证路径 |
| --- | --- |
| 原生通道在 DSH 真实会话中端到端可用 | L4 真机（需用户） |
| 签名握手失败的根因与 3.16.3 协议变化 | 对照 zcode-api 与本机 ZCode 3.16.3 机制 |
| start-plan 真机授权 | L4 |
| `src/glm-prompt/verbatim.ts` 注释称文本取自本机安装 bundle（MD5 `c7d641da…`），而本机安装版被用户打过补丁 | 按 3.16.3 原文逐字复核来源 |
| native ToolSearch 透传（K2）、服务端 web 工具闸门（K4） | 需活 token 实测 |
| beta 头、OutputStyle 列表、实跑采样参数 | 抓包 |
