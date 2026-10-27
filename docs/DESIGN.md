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

本机 ZCode 安装版被用户打过补丁（用户确认 2026-10-27），只能作为机制参考，不能作为逐字文本来源。逐字文本以 ZCode 官方源码为准：`reference/ZCode`（`package.json` 版本 3.16.2，2026-10-20 同步）；在已比对的文本上，源码、本机 3.16.3 安装包与 pristine 3.15.1 三者一致（用户补丁的安全声明除外）。复核结果见 §5.9。

反向代理（`zcode-proxy.exe`，8317 端口）不在本项目范围内〔定案 2026-10-27〕。任何插件行都不识别、不依赖反代路由；代码与文档中与反代有关的判断和描述在路由收口时删除（`ROADMAP.md` M1）。

## 2. 架构总览

### 2.1 分层

```
GLM-Hourness
├─ 底层
│  ├─ 通道：glm-llm（adapter）、glm-login（命令）
│  └─ 方言：glm-prompt（提示词、工具面与工具检索）、glm-compact（压缩镜像）
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

### 2.4a 运行时契约来源〔实读 2026-10-27〕

`reference/deepseek-harness` 的源码版本号同样标 0.2.1-rc.3，但它是 2026-10-23 的主干，接口与桌面版运行时不同。桌面版运行时的包已从 `app.asar` 导出到 `reference/dsh-desktop-0.2.1-rc.3/`（只有编译后的 `lib`，没有 `.d.ts`），以它为准。已确认的差异与事实：

- 工具服务没有 `executable()`；按名查定义用 `get(name, scope)`（受限制隐藏的全局工具读作不存在）。
- `register(definition)` 没有第二个参数，不存在 `when` 激活谓词；作用域内注册遮蔽全局同名工具。
- `restrict()` 只能在作用域上下文调用，只过滤继承来的工具，不影响本作用域自己的注册；名字必须是已知的全局工具。
- 每一步先执行 `system-prompt/assemble`，再执行 `agent/pre-step`。发给模型的工具列表就是组装结果里的 `assembly.tools`（名称、描述、参数、`deferLoading`），组装瀑布可以逐请求改写它。
- 路由只出现在组装变量 `variables.provider` / `variables.model` 中（由 `installModelSelection` 注入）；`agent/pre-step` 载荷只有 `{agent, messages, signal, step}`。
- 工具执行按名在调用方作用域的可见定义中解析，与本次请求的工具面无关：不在工具面里的已注册工具被直接调用时照常执行。
- `tools.execute(input)` 让一次调用走完 pre-execute、guard、执行、post-execute 与结果渲染；带 `parent` 令牌的调用被各监听器视为传输层子调用（`run_code` 的先例），会话检查点等监听器跳过它。
- `agent/pre-step` 的决策 `messages` 会作为该步输入追加进会话；inbox 按消息 `id` 去重，重复或缺失 `id` 会抛错，因此合成 notice 必须带 `id` 与 `role`（与 `createUserMessage` 同形）。
- `session.deriveMessages()` 给出请求可见的历史（已应用压缩投影）。消息 `source` 只校验 `kind` 非空，其余字段原样保存。

影响：`glm-prompt` 与 `toolsearch` 依赖 `executable()` 捕获原生执行器，在桌面版运行时会抛错；`glm-prompt` 的异常被捕获后，提示词改写与别名都不会安装。L3 探针确认（2026-10-27）：GLM 路由下系统提示词仍是 DSH 原文，工具面是 28 个原生工具，模型调用 `Read` 得到 `unknown tool "Read"`；工具检索也没有延迟任何工具。

### 2.5 行健康〔规划〕

每行在每个会话中第一次触发时上报一条状态：已生效，或未生效及原因。`/glm-status` 与 UI 显示行健康表。真实会话里「哪几行在起作用」目前无法回答，这一机制补上该缺口。

## 3. 路由判定〔已实现 2026-10-27〕

现状〔实读〕：各行判断「是否 GLM 会话」的写法不一致。`glm-prompt` 认 provider `glm` 或模型名前缀 `glm`；`toolsearch` 在 `agent/created` 时只认 `agent.model.current().provider === 'glm'`；todo 提醒依赖 `agent.model.current()`。rc.3 桌面版在 `agent/created` 与 `agent/pre-step` 上给出的路由为空（`legacy/desktop-dialect-triage.md`，git 历史），唯一可靠的信号是 `system-prompt/assemble` 瀑布中 `variables.provider` / `variables.model`。原生通道的 provider id 是 `glm-zcode`。由此推断 todo 提醒与工具检索在真机上未生效〔推断〕。

定案：

1. 方言跟着模型族走：训练分布是模型的属性。判据为模型 id 属于 GLM 族。
2. 通道跟着路由走：ZCode 身份是传输层的属性。判据为 provider id 是本通道注册的 id（默认 `glm-zcode`）。
3. 判定函数只有一处（`src/shared/`），所有行共用。
4. 只对准 rc.3 的可靠信号；兼容旧构建的分支删除。
5. 单测里的假宿主必须给出与 rc.3 相同的信号，不得提供真宿主不提供的路由字段。

实现：`src/shared/route.ts`（`isGlmModel`、`assemblyRoute`、按 agent 记录路由的 `createRouteTracker`）；`glm-prompt` 在 `agent/created` 时于 agent 作用域注册别名，并注册一个 prepend 组装监听器，在 `next()` 之后按本次请求的路由改写提示词节与工具面，不再调用 `restrict()`，也不再挂载 / 卸载。同一步里的其他钩子（如 todo 提醒）读回该路由。单测替身 `tests/fake-rc3.ts` 只提供 rc.3 的接口。L3 探针 9/9：GLM 路由得到 ZCode 身份与别名面、`Read` 别名真实执行；非 GLM 路由保持 DSH 原文与原生工具。工具检索在同一个组装监听器里、别名改写之后执行（§5.7），探针扩到 15 项，全部通过。

## 4. 通道

请求流程（`ZcodeAdapter.stream`）〔实读〕：加载凭证 → deviceMid → 端点路由 → 组装身份头与鉴权头 → 签名 V4（失败放行）→ Anthropic Messages 传输。

### 4.1 凭证与登录

- 登录：ZCode 账号体系的 bigmodel 轮询登录（`/glm-login` 打开浏览器授权，5 分钟超时），解析出套餐 API Key，名称与 ZCode 客户端一致（`zcode-api-key`），两者共用同一把 Key〔实读〕。
- 存储：`<home>/credentials.json`，AES-256-GCM，原子写入〔实读〕。
- 风险：加密密钥由 `HOME`/`USERPROFILE`、平台与架构推导，看过源码即可算出；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖。凭证文件不入库，当前可接受。后续迁到系统钥匙串或 DSH 凭证服务〔规划〕。

### 4.2 身份头

LLM 平面（bundle `g6n` 形态）：`HTTP-Referer`、`User-Agent: ZCode/<ver>`、`X-ZCode-App-Version`、`X-Title: Z Code@cli`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-ZCode-Agent: glm`、`X-Platform`、`X-Os-Category`、`X-Os-Version`；不带 `X-Device-Mid`。上下文平面（bundle `TV`，用于端点路由与签名）带 `X-Device-Mid`，不带 `X-ZCode-Agent`。值经可打印 ASCII 规范化〔实读〕。

版本：统一为常量 `ZCODE_APP_VERSION = '3.16.3'`（`src/glm-llm/identity.ts`），供 `User-Agent`、`X-ZCode-App-Version`、OAuth 跳转参数 `app_version`、签名头 `X-Client-Version` 与项目令牌请求的 `clientVersion` 共用〔已实现 2026-10-27，此前分别为 3.14.0 与 3.15.1〕。

对照本机 3.16.3 安装包〔实读〕：

- LLM 平面身份头的组装函数（`buildCliZCodeSourceHeaders`）字段与顺序和本实现一致。
- `X-Title` 的来源标题：进程参数含 `app-server` 或 `agent-server` 时为 `electron`，否则为 `cli`。桌面版以 `app-server` 方式启动 agent 进程，所以桌面版真实流量是 `Z Code@electron`；本实现发 `Z Code@cli`，对应 ZCode CLI 的身份。是否改为 `electron` 待定（`FACTS.md` §1）。
- 签名与项目令牌共用一个版本常量（构建期 `__ZCODE_VERSION__`），`X-ZCode-App-Version` 取自环境变量 `ZCODE_APP_VERSION`。安装包文本中前者未被构建替换，实际取值未验证；本实现两处都用应用版本。

### 4.3 签名 V4

移植自 zcode-api 的 `client-signing`（对应 ZCode 3.15.1 `ClientRequestSigningV4Signer`）：握手 `POST /api/paas/c1f3a7e2/v2/client` → HKDF 派生 → Ed25519 业务签名 + PoW → 七个签名头。start-plan 与 off-peak 路径不签名。失败梯：握手失败无签发送；连续两次 401 VERIFY 拒绝后对该（origin, credential）永久旁路〔实读〕。

现状：握手对当前凭证失败，按设计无签发送，请求成功〔实测〕。签名对 coding-plan 1.5 倍用量的影响未验证。要求：签名结果对系统可见，即状态里显示签名情况，每条用量记录标注是否签名（条款 7）〔规划〕。

### 4.4 端点路由

`GET https://zcode.z.ai/api/v1/agent/configs`，按 `data.proxyEndpoint.mapping` 改写请求 URL；成功缓存 300 秒，失败冷却 30 秒，超时 3 秒；任何失败保持原 URL。同一快照携带 3.16.3 的请求验证（captcha）开关〔实读〕。

### 4.5 传输与档位

- 上游：`https://open.bigmodel.cn/api/anthropic/v1/messages`（路由改写前），`anthropic-version: 2023-06-01`〔实读〕。
- 档位：coding-plan（默认，签名，享 ZCode 渠道用量加成）与 start-plan（网关要求的三块系统提示、JWT 鉴权、currentDate 前缀）。start-plan 的三块系统提示属于底层：网关缺了就拒收（3012/405）。
- 状态：coding-plan 端到端真网成功，模型返回 `pong`〔实测，`scripts/smoke-zcode-authorized.mjs`〕；start-plan 只有单测。
- 系统提示词：DSH 把组装好的系统提示词作为历史开头的 `system` 消息下发，`GenerateOptions.system` 为空〔L3 探针实测〕。编码器把请求级文本与开头的全部 `system` 消息依次合并进 Anthropic 的 `system` 字段（与 DSH 自带 pi-ai 适配器同一规则）；之后出现的 `system` / `developer` 消息作为 `<system-reminder>` 包裹的用户轮发送。适配器不声明 `systemPromptUpdate: 'in-history'`，提示词变化时由 DSH 改写开头那条消息〔已实现 2026-10-27〕。此前编码器丢弃全部 `system` 消息而适配器又声明 in-history，原生通道在 DSH 会话里会发出没有系统提示词的请求；冒烟脚本直接传 `system` 参数，所以没有暴露。
- 消息编码〔已实现 2026-10-28，`src/glm-llm/anthropic.ts`〕：按 rc.3 的消息形状（`dsh-llm` `ContentBlockMap`）逐块编码，块序不变，空文本块丢弃，与 ZCode 的 AI SDK 转换一致：
  - 助手消息：`text` 块发文本，`tool-call` 块发 `tool_use`（参数解析失败时为 `{}`）；`reasoning` 块在本通道没有可回放的签名，不回传。
  - 工具结果：`tool_result`，纯文本结果为一个字符串，空结果为 `(no output)`；失败结果带 `is_error: true`（ZCode 的 error-text 输出）；带图片的结果见 §4.5a。
  - 用户消息：文本块各自成块；没有内容时发 ZCode 的占位 `(no content)`（3.16.3 安装包 `toAiSdkUserContent`），不再发空文本块。
  - 相邻同角色的消息合并为一轮，与 ZCode 经 AI SDK Anthropic provider 发出的形态一致：并行调用的多个工具结果与其后的提醒落在同一个用户轮里。
  - 曾有缺陷：编码器按 `reference/deepseek-harness` 主干的 `toolCalls` 字段读工具调用，rc.3 没有这个字段（全部运行时包中无一处使用），工具调用在 `content` 里以 `tool-call` 块出现。结果是助手的工具调用全被丢弃，下一条 `tool_result` 引用的 `tool_use` 从未发出。原生通道尚未在 DSH 会话中跑过，所以没有暴露；L3 探针的请求摘要现在读 `tool-call` 块，实测每条助手消息都带工具调用块。

### 4.5a 图片〔已实现 2026-10-28〕

- 形态：DSH 的图片是持久附件引用（`image` 块）。适配器经附件服务读出每个附件的请求版本（`AttachmentStore.readImageRequest`，rc.3 pi-ai 适配器的同一调用），编码为 Anthropic base64 图片块 `{type: 'image', source: {type: 'base64', media_type, data}}`。用户消息里的图片在用户轮内容中；工具结果里的图片放进 `tool_result` 的内容数组，与文本块按原顺序排列。这是 ZCode 对 Anthropic 路由的放法（3.16.3 安装包：AI SDK Anthropic provider 把工具结果的 `image-data` 转为同样的图片块；源码 `adapters/src/model/transform.ts`）。DSH 的 `read_image` 结果本身带一段文字信封（路径、尺寸、字节数），随图片一起发送。
- 不加 DSH 的附件把手文本：pi-ai 在每张图片前插一句附件标识与只读路径（`requestImageHandleText`），ZCode 不加（工具结果只保留媒体块），本通道随 ZCode。
- 请求版本的上限按 ZCode 的模型图片上限：长边 2000 像素（`READ_IMAGE_MAX_DIMENSION`、`MAX_IMAGE_ATTACHMENT_DIMENSION`），原始字节不超过 5 MiB 的四分之三，即 base64 不超过 5 MiB（`READ_IMAGE_TARGET_BYTES`）。`imageRequestTarget` 返回同一目标，满足 `LlmAdapter` 合同「与请求序列化所用目标一致」的要求。ZCode 对 Read 读出的图片另有 25,000 估算 token 的上限（base64 长度乘 0.125）；DSH 的目标按路由、模型与图片给出，分不出图片来自 Read 还是附件，所以不用这一条。
- 卸载：带 `offloaded` 标记的图片不读字节，发送 DSH 的占位文本（`offloadedImageText`，能解析只读路径时附路径）。卸载集合是会话的持久事实，每个路由都按同一集合发送。运行时包不能从本仓库解析，占位文本按 `dsh-llm` 0.2.1-rc.3 原文复制在 `src/glm-llm/images.ts`，注明出处。
- 附件服务与 `fs` 服务按请求经 `ctx.get` 读取，不注入（与 pi-ai 相同）；请求带图片而附件服务不存在时，请求失败并说明原因。
- 请求级图片预算：本通道不发 `IMAGE_OFFLOAD_REQUIRED`。ZCode 没有请求级的图片总量上限，GLM 端点的上限未知（§9）。
- 验证：编码器与适配器单测；L3 探针在 GLM-5.3-Flash 上读 PNG，探针 provider 用本通道的真实编码器与运行时附件服务编码同一请求，图片以 base64 PNG 出现在 `tool_result` 中；真网一次（coding-plan，`glm-5.3-flash`，32×32 纯红 PNG，问颜色），模型答「Red」，用量输入 41、输出 32 token〔实测 2026-10-28〕。只有一次请求，猜中的可能不能完全排除。

### 4.6 模型目录与思考档位

- 目录：`glm-5.3`（GLM-5.3）、`glm-5.3-flash`（GLM-5.3-Flash）；上下文窗口 512,000；默认 `max_tokens` 32000〔实读〕。
- 输入模态按模型如实声明（`src/glm-llm/lm-min.ts` `GLM_MODELS`）：GLM-5.3 没有视觉塔，只声明文本；GLM-5.3-Flash 声明文本与图像〔用户提供的事实 2026-10-28〕。目录外的模型 id 只声明文本。此前两个模型都声明图像。只声明文本的路由上，DSH 在适配器之前把请求里的图片换成文字占位（`dsh-llm` `projectImagesForTextModel`：「[image omitted because this model accepts text only; attachment sha256:…]」），`read_image` 拒读（「… does not declare image input; switch to an image-capable model to read images」），会话控制器拒收用户附图。
- 思考：GLM-5.3 系强制思考；effort 三档 `low` / `high` / `max`，默认 `high`〔定案 2026-10-27，五档词汇 API 接受但 GLM 不用〕。

### 4.6a 用量块

DSH 的 `TokenUsage` 各计数互不重叠：`inputTokens` 只算未命中缓存的输入，缓存读写分别记在 `cacheReadTokens` / `cacheWriteTokens`（官方类型注释）。Anthropic 流的 `message_start` 带 `input_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`，`message_delta` 只带 `output_tokens`。

曾有缺陷：解码器在 `message_delta` 上发出 `{inputTokens: 0, outputTokens}`，下游取最后一个用量块，于是输入计为 0；缓存读写从未解析。积分口径依赖这三项（`FACTS.md` §2.4）。现在整个流只在 `finish` 前发一个合并后的用量块，含 `cacheReadTokens` / `cacheWriteTokens`〔已实现 2026-10-27；真网冒烟实测 `inputTokens: 24, outputTokens: 3, cacheReadTokens: 0`〕。此前写入的用量流水中输入计数均为 0，不能用于积分统计。

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

原先的 `glm:deferred-tools` 节（order 2500）已删除：ZCode 的系统提示词里没有 deferred 声明段，deferred 名单以 `<system-reminder>` 公告递送（§5.7）。

### 5.3 本地化清单（coding-plan）

| # | 节 | 处理 |
| --- | --- | --- |
| ① | Harness 块 | 「终端显示」改为「DSH Web GUI 显示」，其余逐字 |
| ② | Session guidance | 技能规则改写为 DSH 技能接缝 |
| ③ | Environment | ZCode 骨架，填 DSH 真实目录、git、平台、shell |
| ④ | Desktop context | DSH 无对应特性的部分裁掉 |
| ⑤ | Skills 引导 | DSH 技能清单 |
| ⑥ | 工具描述与 schema 中的行为断言 | 垫片必须兑现描述与 schema 的承诺，兑现不了就改写或删去该句；七个别名的处理见 §5.4。Grep 删去原生做不到的参数，Bash 改写 shell 与工作目录两行 |
| ⑦ | Context management | 逐字，承诺与 DSH 压缩一致 |
| ⑧ | Memory | 写入纪律改为 memory 工具族与工作区 `.llm` |
| ⑨ | Deferred 声明 | 不设；名单公告与工具检索按 ZCode 原文（§5.7） |

### 5.4 工具面

- 别名：`Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`TodoWrite`，执行时委托捕获的原生定义〔实读〕。七个别名的描述与 schema 都按 3.16.3 安装包重建，原文放在镜像文件 `src/glm-prompt/zcode-tool-text.ts`：第一批 `Read`、`Write`、`Edit`（含结果文本），第二批 `Glob`、`Grep`、`TodoWrite`、`Bash`（2026-10-28，含 Glob 与 Grep 的结果文本）。`Grep` 与 `Bash` 是本地化组合：镜像文件里是原文，删改在 `search-alias.ts` 与 `aliases.ts` 中完成，不属于逐字声明（别名规格标 `localized`）。
- 工具面：别名只遮住它实际包住的原生工具。`Read` 包住 `read`，组合里有 `read_image` 时也包住它；其余别名各包一个（`write`、`edit`、`glob`、`grep`、`pwsh`、`todo_write`）。被包住的原生工具从 GLM 请求的工具面中滤掉，非 GLM 请求则滤掉别名；两组都保持注册，逐请求在组装监听器里决定（§3）。L3 探针（2026-10-28）：GLM 首个请求 16 个工具（14 个常驻加两个检索控制工具），13 个延迟；非 GLM 请求 28 个原生工具。
- schema：七个工具都是 ZCode 发给模型的形态，即合同中的 zod 对象经 `toToolJsonSchema`（zod-to-json-schema 3.25.2，jsonSchema7，`effectStrategy: input`）转换后再加 `$schema`（2020-12）。所以有 `integer`、`minimum`、`exclusiveMinimum`、`minLength`、`additionalProperties: false`、`default`；Bash 的语义数字与语义布尔按输入类型转换为 `number`、`boolean`。rc.3 不校验原样注册的工具参数，这些关键字原样到达模型（L3 探针实测）。`Read` 用不带 PDF 的形态：ZCode 只对声明 PDF 输入的模型加 `pages` 参数与 PDF 说明行，GLM 不声明。
- 映射与兑现（Read，`src/glm-prompt/read-alias.ts`）：
  - 描述删去视频一行：DSH 没有视频输入。组合里没有 `read_image` 时再删去图片一行。其余各行逐字。
  - 结果按 ZCode 的 cat -n 形态渲染（`行号\t内容`），不用原生的 `行号: 内容` 外框。Edit 描述要求模型「去掉 Read 的行号前缀（行号加 tab）」，依赖这个形态。空文件回 ZCode 的空文件提醒。
  - 原生窗口受 2000 行与 50 KB 两个上限。窗口没读到文件末尾、且不是模型自己给的 `limit` 截住的，结果前加 ZCode 部分视图提醒的后两句（「Showing a partial view of lines …」「Use Read with offset … to continue …」）。第一句讲的是 ZCode 的 token 预算，与原生上限不符，不用。
  - `offset` 为 0 时按 ZCode 从第 1 行读（原生从 1 计）；`limit` 超过原生窗口 2000 行时截到 2000，结果用上面的提醒说明续读位置。垫片按原生默认配置写死 2000。
  - 图片扩展名（ZCode 的集合，与 `read_image` 相同）转给 `read_image`，`offset`、`limit` 对图片不适用，与 ZCode 一致；图片结果用 `read_image` 自己的渲染。
  - 图片一行不按模型取舍：ZCode 3.16.3 的 Read 描述只对声明 PDF 输入的模型加 PDF 一行（`resolveReadProviderDescription`），图片一行对纯文本模型也保留。所以 GLM-5.3 与 GLM-5.3-Flash 看到同一份描述（L3 探针实测）。两者在纯文本模型上的实际所得不同：ZCode 读图成功，请求里图片换成它的文字占位，后接一行「[Media omitted from provider request because the selected model does not support image input.]」（`createUnsupportedModelInputMediaText`）；DSH 的 `read_image` 在只声明文本的路由上直接报错，GLM-5.3 收到的是拒读错误（L3 探针实测）。两种结果都告诉模型看不到图片，本项目不改写这条错误。
  - ZCode 的二进制扩展名（`.exe`、`.zip` 等 19 个）与视频扩展名直接拒绝，组合里没有 `read_image` 时图片扩展名也拒绝；错误文本用 ZCode 的二进制拒读原文。
  - 输出合同：有 `read_image` 时是两个原生输出 schema 的 `oneOf`，渲染与 `presentationMeta` 交给产出该值的原生工具，参数先映射。
- 映射与兑现（Write、Edit，`src/glm-prompt/aliases.ts`）：
  - Write 映射 `file_path`、`content`。「覆盖没读过的已有文件会失败」由默认的 `fs-observation-policy` 保证：没观察过的目标按 create-if-absent 写，已有文件被拒（L3 探针实测，文件内容不变）。
  - Edit 映射 `file_path`、`old_string`、`new_string`；`replace_all` 按 ZCode 的语义布尔转换（`true`/`1`/`yes`/`y`/`on` 与对应的假值字符串，数字 1/0），其余值原样交给原生工具报错。「必须先 Read」「old_string 必须唯一」由原生 `edit` 与观察策略保证。
  - 原生 `write`、`edit` 在受限文件系统下多出 `sandbox_permissions`、`justification` 两个字段，沙盒拒绝时提示模型带上它们重试。原生声明了这两个字段时，别名把原生的字段定义原样追加到 ZCode schema 的 `properties` 末尾并转发；原生没有时 schema 与 ZCode 逐字一致。这是本地化，不属于逐字声明。
  - 结果文本用 ZCode 的原文（「File created successfully at: …」「The file … has been updated successfully.」「… All occurrences were successfully replaced.」，后接「(file state is current in your context — no need to Read it back)」）。值的形状不对时退回原生渲染。
- 映射与兑现（Glob，`src/glm-prompt/search-alias.ts`）：映射 `pattern`（按 ZCode 去掉首尾空白）与 `path`。原生按修改时间从旧到新列出全部匹配（`rg --sort=modified`），垫片倒序成 ZCode 的从新到旧，取前 100 条，超出时加 ZCode 的截断提示（「(Results are truncated. …)」），没有匹配时回「No files found」。路径按 ZCode `toDisplayPath` 显示：工作目录内的相对路径用 `/` 分隔，其余原样。原生与 ZCode 一样不认 `.gitignore`、排除 VCS 目录。
- 映射与兑现（Grep）：原生 `grep` 只接受 `pattern`、`path`、`include`，返回全部匹配行（`path`、`lineNumber`、`line`）。垫片兑现的参数：
  - `pattern` 按 ZCode 去首尾空白；`-i` 转成 ripgrep 的内联标志 `(?i)` 加在模式前。
  - `glob` 按 ZCode 的拆分规则（空白分隔；不含花括号的片段再按逗号分隔），`type` 按 ZCode 的类型表（如 `js` 为 `.js`、`.jsx`、`.mjs`、`.cjs`；表外类型当作扩展名；含非法字符的类型忽略），都变成原生的 `include`。ZCode 把它们作为多个 `--glob` 交给一次 ripgrep，命中任一即算；垫片对每个过滤条件各调一次原生，按「路径加行号」去重合并。类型的扩展名合成一个花括号模式（`*{.js,.jsx,.mjs,.cjs}`），不带斜杠的 ripgrep glob 在任意深度匹配文件名，与 ZCode 每个扩展名两条 glob 的效果相同。
  - `output_mode`（`content`、`files_with_matches` 默认、`count`）、`-n`（默认带行号）、`head_limit`（默认 250，0 为不限）、`offset` 在垫片里按 ZCode 的分页（`applyHeadLimit`，只在截断时报告 limit）与结果文本（`formatGrepModelContent`）实现；`count` 统计每个文件的匹配行数，与 ZCode 的 `rg -c` 一致。
  - 原生不向 ripgrep 传上下文、仅匹配与多行参数，所以 `-A`、`-B`、`-C`、`context`、`-o`、`multiline` 从 schema 删去，描述删去 multiline 一行，`output_mode` 的说明删去「-A/-B/-C context」。
- 映射与兑现（TodoWrite，`src/glm-prompt/todowrite.ts`，别名在 `index.ts`）：描述与 schema 逐字。原生 `todo_write` 每次整表替换，DSH 界面以 todo 面板显示（`dsh-client-ui-conversation`），与描述一致。`priority`（`high`/`medium`/`low`）校验后在执行边界剥离，原生只存 `content`、`status`。
- 映射与兑现（Bash，`src/glm-prompt/aliases.ts`）：本地化组合。
  - 描述按 ZCode 原文（默认超时策略 120000/600000、未启用 embedded search 的版本），只改两行：首行的 bash 改为 PowerShell；工作目录一行改为「每次调用在会话工作目录新起进程，`cd` 不保留，不加载用户 profile」。依据：原生每次以 `pwsh -NoLogo -NoProfile -NonInteractive -Command` 新起进程（`dsh-pwsh-local`），默认目录是会话工作目录（`dsh-tool-pwsh`）。其余行在 DSH 上成立：默认超时 120000、上限 600000 与原生执行器默认配置相同；后台命令结束时 `dsh-tool-jobs` 默认以 `wakeup` 方式唤醒空闲 agent。
  - schema 按 ZCode 原文，去掉 `dangerouslyDisableSandbox`：DSH 只能经原生带审批的 `sandbox_permissions`、`justification` 放宽沙盒，原生声明这两个字段时追加并转发（同 Write、Edit）。原生没有后台运行（组合里没有 job 注册表）时，同时去掉 `run_in_background` 字段与描述中的后台一行。
  - 映射：`timeout` 是毫秒，按 ZCode 的语义数字（数字字符串转数字）转 `timeoutMs`；ZCode 把 0 当作默认值，原生拒绝 0，所以 0 不转发；超过上限由原生截到上限，与 ZCode 一致。`run_in_background` 按 ZCode 语义布尔转换。`description` 在 ZCode 可选而原生要求非空，缺省时取命令首行（最长 80 字符）。原生的 `workdir` 不对模型暴露，ZCode 没有这个参数。默认值与上限按原生默认配置写死。
  - 结果文本用原生渲染（`[stderr]`、`[exit code: N]` 等标记，与 DSH 的 pwsh 提示节一致）。
  - 此前的 Bash 别名把 `timeout` 当秒换算并暴露 `working_dir`，取自无法追溯的旧文本，与 ZCode 不符，已替换。
- 与 ZCode 的已知差异（未移植）：
  - Read 的「文件未变」短路（`file_unchanged`）、超 token 预算报错与 Read 状态元数据；Edit 的模糊匹配与引号归一（ZCode 会兜底匹配，DSH 原生只做精确匹配，与描述一致）；Edit 用空 `old_string` 新建文件（原生拒绝空 `old_string`）。
  - Glob：修改时间相同的文件，先后顺序可能与 ZCode 不同。
  - Grep：`files_with_matches` 模式 ZCode 按修改时间排序，垫片保持 ripgrep 的输出顺序；ZCode 搜索隐藏文件（`--hidden`），原生不搜；ZCode 让 ripgrep 略去超过 500 列的行（`--max-columns 500`），原生返回整行；以 `!` 开头的排除模式原生拒绝，模型收到原生的报错。
  - TodoWrite：ZCode 的结果是 `{oldTodos, todos, summary}` 的 JSON，垫片用原生的「Updated todo list: …」。
  - Bash：结果形态与 ZCode 不同（见上）。
- 读图经原生通道：2026-10-28 之前 `glm-zcode` 的编码器丢弃图片块，经该通道读图只得到 `read_image` 的文字信封。现在 GLM-5.3-Flash 收到真实图片块（§4.5a），描述中的「presents them visually」成立；GLM-5.3 只声明文本，读图被拒（见上）。

### 5.5 todo 提醒

ZCode 双阈值 10/10：距上次 TodoWrite 与距上次提醒都达到 10 轮时，注入逐字提醒并回显当前 todo。

偏差〔实读〕：现在按完成的工具调用计数，官方按助手轮次计数，一轮并行调用多个工具会多计，提醒来得比官方早。路由收口后改为按轮次计数。提醒正文有两处与原文不一致（§5.9）。

todo 在编排层降级为项目图的视图（`ORCHESTRATION.md` §2.5），TodoWrite 本身保留，因为它是 GLM 的训练习惯。

### 5.6 压缩镜像

ZCode compact 提示词（`<analysis>` 先行、9 节摘要、安全指令保留；3 行偏差已修正，见 §5.9），产物经 ZCode `formatCompactSummary` 剥 `<analysis>`、`<summary>` 改写为「Summary:」。

接缝〔已实现 2026-10-27，L3 实测〕：DSH 的压缩由 `compaction-basic` 负责，它是本上下文唯一的 `ctx.compaction` 实现（`dsh-compaction` 规定每个上下文只载一个）。它通过 `ctx.llm.stream()` 发起摘要请求，`purpose` 为 `compaction`，回放对话后把自己的指令作为最后一条用户消息。每次调用都经过 `llm/stream` 瀑布，但 `next()` 不带参数，监听器换不了请求。`glm-compact` 行注册一个最外层的全局 `llm/stream` 监听器：模型属于 GLM 族、且最后一条是 `compaction-basic` 指令的压缩请求，复制一份、把末条换成 ZCode 提示词后重新派发，并对返回的文本做 ZCode 格式化；其他请求原样放行。触发策略、保留区间、检查点外框仍归 `compaction-basic`。

更正：原设计是挂一个 `BasicCompactionEngine` 子类。它在桌面版上从未挂载（从仓库路径解析不到 `@deepseek-ai/dsh-compaction-basic`），而且即使挂上也会成为第二个压缩引擎，并且只认 provider `glm`，不认原生通道 `glm-zcode`。已整体替换。

L3 探针：沙盒里把压缩阈值调低，摘要请求末条是 ZCode 提示词，下一次请求里的检查点内容为「Summary:\nprobe summary」，不含 `<analysis>`。外框仍是 DSH 的检查点前言加 `<compacted-summary>` 标签，与 ZCode 续接消息的写法不同，属于已知差异。ZCode 的 autoCompact 阈值（166k）与 microcompact 公式记录在 `reference/zcode-capabilities.md` §11.2，未接入。

压缩后的重新锚定属于编排层（`ORCHESTRATION.md` §2.5）。

### 5.7 工具检索〔已实现 2026-10-27〕

按 ZCode 3.16.3 的 local 模式移植（机制见 §5.10），属于方言，由 `glm-prompt` 驱动；原来独立的 `glm-hourness/toolsearch` 行已删除。原因：工具检索必须作用在别名改写之后的工具面上，才能按 ZCode 名字分常驻与延迟；两行各自注册组装监听器时先后顺序取决于 Loader，放进同一个监听器就没有顺序问题。

- 开关：`glm-prompt` 配置 `toolSearchMode`，`local`（默认）或 `off`。
- 安装：`agent/created` 时在 agent 作用域注册 `LocalToolSearch` 与 `DeferredToolCall`，并注册一个 `agent/pre-step` 监听器。
- 工具面：GLM 请求先做别名改写，再交给 `buildToolExposure`：延迟工具离开工具面，两个控制工具留下；没有延迟工具时控制工具也离开。非 GLM 请求只去掉控制工具。
- 分类：ZCode 常驻名单保持常驻；有 ZCode 对应物的 DSH 工具跟随对应物（`read_image`、`subagent`、`subagent_fork`、`skill`、`workflow`、`get_goal`、`ask_user_question`、`bash`、`str_replace_editor`）；记忆工具常驻（`ORCHESTRATION.md` §8）；其余 DSH 工具按 MCP 规则延迟。L3 探针中的 GLM 工具面（2026-10-27 为 28 个；2026-10-28 起 `read_image` 由 Read 别名包住，为 27 个），13 个延迟：TodoWrite、create_goal、exit_plan_mode、interrupt_agent、job_kill、job_list、job_output、list_agents、send_message、update_goal、web_fetch、web_search、working_directory。
- 公告：每步在 `agent/pre-step` 计算新增、恢复、移除的 deferred 名单，追加一条 `<system-reminder>` notice（来源 `glm-tool-search`）；增量事实存在 notice 的 `source.toolSearchAnnouncement`，与 ZCode 公告元数据一致。已公告状态每步从 `session.deriveMessages()` 重新推出，所以续跑、重启和压缩后都按模型实际看得到的历史计算。
- 检索结果：执行 `LocalToolSearch` 时按 ZCode 投影生成内容，即 `<functions>` 定义块、「Loaded: …」提醒、「Tool definitions already available …」提醒。「已加载」只认最近一条助手消息之前的成功检索结果（ZCode 同批不互相去重的语义）。
- `DeferredToolCall`：校验与拒绝文案按 ZCode `resolveDeferredToolCall`；通过后经 `tools.execute` 执行目标，不带 `parent` 令牌。ZCode 在派发前就把包装还原成目标调用，所以 guard、审计流水、todo 提醒、会话检查点看到的都应该是目标本身；todo 提醒跳过包装调用，避免重复计数。
- 文本：逐字镜像在 `src/toolsearch/zcode-text.ts`，逐字门禁按字面量片段检查整份文件（§5.9）。

与 ZCode 的差异：

- 只有 local 模式，没有 native 与 auto。
- ZCode 每次请求都从历史重新投影检索结果；DSH 的工具结果执行时生成一次后固定，之后工具定义变化不会回写旧结果。
- 没有移植压缩后把已加载工具提升为常驻（`preCompactDiscoveredTools`）：DSH 压缩之后，已加载的工具会重新公告，需要再检索一次。
- `LocalToolSearch` 入参校验失败的报错文案是本项目的（ZCode 由执行器的 schema 校验给出，格式未核实）；直接调用未加载的延迟工具时，ZCode 在校验失败的结果后附「Load the tool first …」提示，本项目未实现。

### 5.8 与 ZCode 的差异总表

| # | 能力 | 类 | 处置 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 工具命名与 schema | 方言 | 别名投影；七个别名按 3.16.3 重建并兑现，Grep、Bash 为本地化组合（§5.4） | 已实现，L3 探针通过，真机未验收 |
| 2 | TodoWrite 三字段 | 方言 | 垫片剥离 priority | 已实现 |
| 3 | 身份节 | 方言 | 同名替换 | 已实现 |
| 4 | todo 提醒 10/10 | 方言 | 逐字文案与阈值 | 已实现，计数口径有偏差，真机未确认生效 |
| 5 | 合成消息通道 | 同构 | 不动 | — |
| 6 | compact 提示词 | 方言 | `llm/stream` 上替换压缩指令并格式化产物（§5.6） | 已实现，L3 探针通过，真机未验收 |
| 7 | beta 能力头 | 通道 | 按能力集动态添加 | 未实现 |
| 8 | 工具懒加载 | 缺口 | glm-prompt 内的 local 工具检索（§5.7） | 已实现，L3 探针通过，真机未验收 |
| 9 | 服务端 web 工具 | 缺口 | 待实测 `web_search_prime` / webReader 直连闸门 | 挂账 |
| 10 | 持久记忆 | 缺口 | memory 行（编排层） | 已实现，未被真正使用 |
| 11 | 身份头、签名、路由 | 通道 | glm-llm | 已实现，版本待统一 |
| 12 | 模型目录、登录 | 通道 | glm-llm、glm-login | 已实现 |
| 13 | 日期与输出风格提醒族 | 方言 | 低成本可选 | 未实现 |
| 14 | 缓存断点参数 | 通道 | 低优先级 | 未实现 |
| 16 | thinking 与采样参数 | 通道 | effort 三档、thinking 时剥采样参数 | 已实现 effort |

第 1、2、4、6、8 项的文本对齐状态以 §5.9 为准。

### 5.9 逐字复核（2026-10-27）

方法：把方言里每段号称逐字的文本按行比对 ZCode 源码（`reference/ZCode/apps` 与 `packages`）、本机 3.16.3 安装包、pristine 3.15.1，以及 `reference/zcode-api`〔实读〕。源码路径相对 `apps/zcode-cli/packages/core/src/`。

| 文本 | 代码位置 | 结果 | 原文位置 |
| --- | --- | --- | --- |
| CLI 前缀 | `verbatim.ts` `CLI_PREFIX` | 一致 | `context/sections/cli-prefix.ts` |
| 身份开头两句 | `verbatim.ts` `IDENTITY_OPENING_*` | 一致 | `context/sections/identity.ts` |
| 官方安全声明 | `verbatim.ts` `SECURITY_NOTICE_OFFICIAL` | 与源码、pristine 一致；本机安装包此处为用户补丁 | `context/sections/identity.ts` |
| Harness 块 | `verbatim.ts` `HARNESS_BLOCK` | 一致 | `context/sections/identity.ts` |
| todo 提醒回显标题 | `verbatim.ts` `TODO_REMINDER_ECHO_HEADER` | 一致 | `runtime/helpers/runtime-reminders.ts` |
| todo 提醒正文 | `verbatim.ts` `TODO_REMINDER_BODY` | 曾有两处不一致（`to track progress`、`if has become stale`，原文语法如此），已按原文修正 | `runtime/helpers/runtime-reminders.ts` |
| Context management | `localize.ts` `CONTEXT_MANAGEMENT_DSH` | 一致 | 源码与安装包 |
| compact 提示词 | `compact.ts` | 曾有 3 行不一致（第 4、8、9 节漏词），已按原文修正。结尾的 `REMINDER` 行与 3.16.3 安装包、pristine 一致，与源码不同，按安装包保留 | `compact/prompt.ts` |
| ToolSearch 描述 | 旧 `toolsearch/index.ts` | 首句一致，之后不一致。已按 3.16.3 安装包重建为 `LocalToolSearch` 描述（2026-10-27） | 安装包；源码 `tool/search/description.ts` 是 3.16.2 版本 |
| Deferred 声明段 | 旧 `verbatim.ts` `DEFERRED_DECLARATION` | 任何来源中都找不到；ZCode 系统提示词没有这一段，已删除（2026-10-27） | — |
| 工具检索全部文本 | `toolsearch/zcode-text.ts` | 一致（门禁按字面量片段检查） | 安装包 |
| Read、Write、Edit 描述、schema 与结果文本 | `zcode-tool-text.ts`（镜像文件） | 旧文本任何来源中都找不到，已按 3.16.3 安装包重建（2026-10-28）；Read 描述按 §5.4 删去不能兑现的行。schema 用 ZCode 锁定的 zod-to-json-schema 3.25.2 复算，与安装包中的 zod 定义一致 | 安装包；源码 `tool/handlers/read.ts`、`write.ts`、`edit.ts`、`contracts/src/tools/` |
| Glob、Grep、TodoWrite 描述、schema 与 Glob、Grep 结果文本 | `zcode-tool-text.ts`（镜像文件） | 旧文本任何来源中都找不到，已按 3.16.3 安装包重建（2026-10-28）；Grep 按 §5.4 删去原生做不到的参数与 multiline 一行，删改在镜像文件之外。schema 用 zod-to-json-schema 3.25.2 复算 | 安装包；源码 `tool/handlers/glob.ts`、`grep.ts`、`todo.ts`，`adapters/src/fs/index.ts`（分页、类型表、glob 拆分） |
| Bash 描述与 schema | `zcode-tool-text.ts`（原文）、`aliases.ts`（本地化） | 旧文本是无法追溯的改写，已按 3.16.3 安装包原文重建（2026-10-28），只按 §5.4 改写 shell 与工作目录两行、去掉 `dangerouslyDisableSandbox`；不属于逐字声明 | 安装包；源码 `tool/handlers/bash-prompt.ts`、`contracts/src/tools/bash.ts` |

结论：身份类文本与 context management 是原文；todo 提醒正文、compact 提示词的小处偏差已修正；start-plan 三块系统提示中的静态文本与原文一致。工具描述、deferred 声明段与 ToolSearch 描述原先大部分不是 ZCode 3.16.x 的原文，只存在于 `reference/zcode-tool-schemas.md`，其「协议采样」的出处无法追溯；现已全部按安装包重建或删除，七个别名的参数 schema 都与安装包中的 zod 定义一致。

处置：

- 来源优先级：3.16.3 安装包为准（用户补丁的安全声明除外，该段以源码与 pristine 为准）；源码作为可读参考。源码（3.16.2）与安装包的已知差异：compact 结尾 `REMINDER` 行；工具检索的 local 模式（§5.10）；Read 部分视图提醒与正文之间，安装包用一个换行，源码用两个；Grep 结果的分页行与计数汇总行之前，安装包用一个换行，源码用两个。
- 逐字门禁 `scripts/check-verbatim.mjs`（`npm test` 的一道）：每段号称逐字的文本逐行必须出现在安装包或源码中；尚未重建的条目列为已知偏差，只许减少，某条一旦对上而未从名单删除也会失败，名单里的条目不再被检查时同样失败；机器上没有参考源时跳过〔已实现〕。
- 镜像文件：整份文件都是逐字声明的源文件（`src/toolsearch/zcode-text.ts`、`src/glm-prompt/zcode-tool-text.ts`），门禁抽出其中每个字符串与模板字面量片段逐行比对，模板按插值点切开。这样带插值的模板也能逐片检查。镜像文件里不能出现正则字面量和除法，扫描器不解析它们。本地化的组合（删去哪几行、改写哪几行、删去或追加哪些字段）写在镜像文件之外；标 `localized` 的别名规格（Grep、Bash）不再整段比对描述，由镜像文件的逐片检查覆盖其原文部分。
- 已知偏差：无（2026-10-28 起名单为空）。名单机制保留，以后出现新的待重建文本时仍按只减不增处理。

### 5.10 ZCode 的工具检索机制（3.16.3）

〔实读，3.16.3 安装包 `zcode.cjs` 与源码 `tool/search/`（3.16.2）〕

- 模式：`off` / `local` / `native` / `auto`。桌面版设置 `toolSearchMode` 默认 `off`，CLI 参数 `--toolsearch-mode` 默认也是 `off`。默认配置下所有工具直接加载，没有 ToolSearch，也没有 deferred。
- `native`：模型侧支持服务端工具检索时使用；工具名 `ToolSearch`，检索返回的 schema 加载后可直接调用。
- `local`：客户端检索。3.16.3 把检索工具改名为 `LocalToolSearch`（`toolSearchNameForMode`，注册名仍是 `ToolSearch`，`LocalToolSearch` 是别名），描述换成 local 版本；deferred 工具经 `DeferredToolCall({name, input})` 包装调用。3.16.2 源码里 local 模式仍叫 `ToolSearch`。
- 名单公告：deferred 工具名不写进系统提示词，而是作为附件以 `<system-reminder>` 包裹的用户消息递送。local 模式的开头是「The following deferred tools are available via LocalToolSearch. Use query … then call them through DeferredToolCall with {name, input}. Call resident tools directly:」，native 模式是「…are now available via ToolSearch…」。名单变化时补发新增、恢复、移除的公告；增量事实随公告落盘。系统提示词里没有 deferred 声明段。
- 哪些工具延迟：只有声明了 `shouldDefer` 的工具与 MCP 工具。常驻：Read、Write、Edit、Glob、Grep、Bash、ApplyPatch、Agent、Skill、Workflow、GoalRead、AskUserQuestion、ToolSearch、DeferredToolCall。延迟：TodoWrite、TodoRead、WebFetch、WebSearch、Cron 族、计划模式进出、SendMessage、TaskOutput、TaskStop、工作流管理族、`js` 等。
- 检索：`select:a,b` 精确选择（含别名，常驻工具也可选），否则按名称分词、描述与 searchHint 打分，`+词` 表示必须命中，默认返回 5 个；3.16.3 的描述与 `query` 参数说明都写明不支持正则。
- local 模式的结果：匹配到的定义以 `<functions>` 块内一行一个 `<function>{description,name,parameters}</function>` 回到工具结果里，后跟 `<system-reminder>` 包裹的「Loaded: … Call it now with DeferredToolCall … No additional LocalToolSearch is needed …」提示；最近一条助手消息之前已经交付过的定义再搜，回「Tool definitions already available …」提示；没有匹配时回「No matching deferred tools found. Loaded tools are not searchable here …」。
- `DeferredToolCall({name, input})`：只接受当前目录里的延迟工具；对常驻工具或控制工具本身回「Call X directly using its normal tool call; DeferredToolCall only accepts deferred tools.」。包装在派发前还原为目标调用，历史里记录目标身份。
- 更正（2026-10-27）：本节初版按 3.16.2 源码记载 local 模式的工具名与文案，与 3.16.3 安装包不符；移植时对照安装包发现并更正。
- 定案〔用户 2026-10-27〕：本项目默认开启工具检索，实现与 ZCode 一致。没有服务端检索能力时，ZCode `auto` 模式回落到 `local`，本项目按 `local` 语义实现。DSH 独有、ZCode 无对应的工具按 MCP 工具的规则处理（延迟）；有对应的随对应工具的常驻 / 延迟属性。

## 6. 注入约定〔定案〕

方言层与编排层都要往对话里放 harness 生成的内容（提醒、投影、检查结果、纠偏），约定如下：

1. 格式：用 GLM 熟悉的 `<system-reminder>` 形态，写短，位置固定。ZCode 自身以这种形态递送 deferred 名单与提醒（§5.10）。
2. 位置：动态内容放在对话末尾，不放进系统提示词。系统提示词保持稳定，以免每一步都让提示词缓存失效。按积分公式，GLM-5.3 缓存命中系数 1.7、普通输入 6.9，命中部分约省四分之三（`FACTS.md` §2.4）。
3. 通道：沿用 `tools/post-execute` 的 `additionalContexts`（带来源标签的合成 notice，与 DSH repeat-tool-reminder 同一机制），或 `agent/pre-step` 的消息修正（工具检索公告用这一条）。notice 必须带 `id` 与 `role`（`src/shared/dsh-min.ts` `createUserNotice`，§2.4a）。
4. 来源标签唯一，便于审计与用量归因。

## 7. 降级与上报

| 行 | 故障或禁用时 | 上报位置〔规划〕 |
| --- | --- | --- |
| glm-llm | GLM 通道不可用，其他 provider 不受影响 | 行健康、`/glm-status` |
| glm-llm 签名 | 无签发送 | 状态、用量记录的签名标注 |
| glm-llm 路由 | 保持原 URL | 状态 |
| glm-prompt | 退回 DSH 原生工具面与文案 | 行健康 |
| glm-compact | 压缩请求原样放行，profile 原有压缩照常 | 行健康 |
| 工具检索（glm-prompt 内） | `toolSearchMode: off` 或会话历史不可读时全量直载 | 行健康 |
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
| GLM 端点的请求级图片上限（张数、总字节）；超限时本通道不发 `IMAGE_OFFLOAD_REQUIRED`，会话会卡在上游报错（§4.5a） | 查 bigmodel 文档或实测；必要时按实测上限发卸载信号 |
| 原生通道读图在 DSH 真实会话中可用（GLM-5.3-Flash） | L4 真机读图 |
| native ToolSearch 透传（K2）、服务端 web 工具闸门（K4） | 需活 token 实测 |
| beta 头、OutputStyle 列表、实跑采样参数 | 抓包 |
