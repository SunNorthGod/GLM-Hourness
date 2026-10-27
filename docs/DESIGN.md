# dsh-glm-dialect 设计文档

> **[归档标注 2026-10-27]** 项目已更名 **GLM-Hourness**，本文档为早期设计稿 v0.1，部分结论（工具对齐策略、字节级验收、凭据复用假设）已被 `dsh-glm-dialect/docs/` 下的宪章与 01/02 系列文档取代，仅作历史参考。现行权威：`00-charter.md`（理念与度量）、`01-zcode-capabilities-reference.md`（ZCode 事实）、`02-dsh-zcode-divergence.md`（差异与定案）、`02-zcode-tool-schemas.md`（schema 原文）。

版本：0.1（设计评审稿）
日期：2026-10-26
目标形态：DSH（DeepSeek Harness，0.2.1-rc 线）bundle 插件，npm 包 + `cordis.patch.yml`

---

## 1. 目标与非目标

### 1.1 总目标

**模型质量与官方 ZCode 完全一致，尽可能对齐 GLM 的官方训练分布；不为照顾 DSH harness 而裁剪。**

分解为两条保真轴：

| 轴 | 含义 | 验收标准 |
|---|---|---|
| 服务路径保真 | GLM 服务端无法区分我们的请求与官方 ZCode 客户端的请求 | 逐项对齐官方客户端的请求形态：身份头、签名、路由、凭据流 |
| 训练分布保真 | GLM 模型无法区分自己在 ZCode 里干活还是在 DSH 里干活 | 模型可见输入（系统提示词、工具名/描述/参数 schema、消息形态）逐项镜像 ZCode 官方 harness |

### 1.2 非目标

- 不做请求内容的"优化改写"——一切内容差异以 ZCode 官方形态为准，不做自创措辞
- 不做本地 HTTP 中间人代理——原反代（zcode-proxy.exe）的进程外职责全部内化，装完插件后反代可退役
- 不追求支持 DSH 全部 agent preset 的方言覆盖——按 agent 路由过滤，只覆盖有官方对齐范本的场景

### 1.3 事实来源（全部本地可验证）

| 机制 | 权威来源 | 位置 |
|---|---|---|
| OAuth 登录流 | ZCode 官方源码 | `repos/ZCode/packages/services/src/oauth/`（zai/bigmodel 双 adapter） |
| 身份头 | 官方源码 | `repos/ZCode/packages/shared/src/zcode-source-headers.ts` |
| V4 签名 | 官方发行 bundle | `zcode-patch/pristine-3163/zcode.cjs.pristine`（`ClientRequestSigningV4Signer`，已逐符号核实） |
| 端点路由 | 官方 bundle + 反代 config | `ProviderEndpointRoutingService` / `endpointRouting` 节 |
| 工具方言 | 官方 bundle | pristine bundle 内工具定义（PascalCase 工具名、`TodoWrite{content,status,priority}` 等） |
| 系统提示词 | 官方源码 + bundle | `packages/services/src/zcode-agent/` 组装逻辑 + bundle 内最终文本 |
| 反代行为基线 | `工具目录/zcode-api/config.yaml` + exe 实测 | 逆向结论与官方源码互相印证 |

> 注：TriDefender/zcode-api GitHub 仓库因网络不可达未直接读取；本机官方源码与 pristine bundle 是其上位替代，且更权威。

---

## 2. 总体架构

```
dsh-glm-dialect（bundle：npm 包声明 dsh.bundle + cordis.patch.yml）
│
├─ 插件行 1：dsh-llm-glm（Host 侧，llm adapter）
│   注册 provider "glm" 到 ctx.llm —— 服务路径保真
│
└─ 插件行 2：dsh-glm-prompt（Host 侧，system-prompt + tool 投影）
    仅 provider=glm 时生效 —— 训练分布保真
```

两行独立可禁用（patch 中各自一行）。若未来 pi-ai 上游原生支持 GLM 生态传输，插件行 1 整体下线，插件行 2 无感存活。

### 2.1 与 DSH 深冻结铁律的映射

| 层 | 操作对象 | 合法性 |
|---|---|---|
| transport（插件行 1） | 冻结请求的伴随元数据：URL、HTTP 头、签名、凭据 | 合法（transport 层） |
| content（插件行 2） | model-visible 字节：提示词节、工具声明 | 必须走构建层：`ctx.systemPrompt.section()/variable()` 与工具注册/装饰接口；发送后的冻结请求零改写 |

---

## 3. 插件行 1：dsh-llm-glm（transport）

### 3.1 Identity（身份头）

语义级移植 `buildZCodeSourceHeadersFromContext`（纯函数，70 行）：

- 固定集：`User-Agent: ZCode/<ver>`、`X-ZCode-App-Version`、`X-Title: Z Code@<source>`、`HTTP-Referer`
- 动态集：`X-Platform: <platform>-<arch>`、`X-Os-Category`、`X-Os-Version`、`X-Client-Language`、`X-Client-Timezone`、`X-Release-Channel`、`X-Device-Mid`
- 保留官方的 ASCII 可打印规范化（`normalizeZCodeSourceHeaderValue`），避免头部格式异常暴露非官方客户端
- `appVersion` 默认跟随当前 ZCode 稳定版（反代基线 3.14.0），`deviceMid` 生成一次永久复用
- 开放问题 A1：`X-ZCode-Agent` 头未出现在源码 `zcode-source-headers.ts`，需在 pristine bundle 中二次确认；若为发行版追加头则一并移植

### 3.2 SigningV4（clientSigning）

按 pristine bundle 逐符号移植（实现阶段直接对照反编译符号）：

1. **开关探测**：GET `{origin}/api/v1/agent/configs`（缓存 1h），仅当 `data.codingPlanSignature.enable=true` 才签名
2. **握手**：`POST {provider}/api/paas/c1f3a7e2/v2/client`，body `{[handshakeField]: credential, nonce, sig, ts}`，10s 超时
3. **密钥协商**：响应 `data.privateCipher` → HKDF-SHA256（salt=`WD_CLIENT_SIGN_KDF_SALT`，info=`ed25519_priv`，256bit）→ Ed25519 私钥
4. **业务签名**：`signBusinessMessage` 消息签名 + proof-of-work（前导零位难度 16bit，随机 hex nonce）
5. **fail-open 梯**（移植官方错误分类学）：每个失败点带 `failOpenEligible` 语义——两次 401 VERIFY 拒绝 → 永久无签名旁路；start-plan / off-peak 路径永不签名

### 3.3 Router（上游路由）

- 静态矩阵：BigModel `{anthropic: open.bigmodel.cn/api/anthropic, openai: open.bigmodel.cn/api/coding/paas/v4}` 主选；zai 同构端点备选
- anthropic 协议为主通道（pi-ai adapter 原生），openai 兼容端点为降级通道
- 动态路由：探测 `{origin}/api/v1/agent/configs` 的 `proxyEndpoint.mapping`，镜像官方 `ProviderEndpointRoutingService` 的 URL 重写（如 coding-plan anthropic → zcode.z.ai ultra 端点）；任何 fetch/parse 失败保持原 URL（fail-open）
- 开放问题 A2：ultra 端点映射语义需对照官方 bundle `ProviderEndpointRoutingService` 逐符号核实

### 3.4 Vault（凭据）

#### 3.4.1 双凭据模式

| 模式 | 凭据 | 适用 |
|---|---|---|
| OAuth 模式 | `~/.zcode-proxy/credentials.json`（与原反代共享登录态） | Coding Plan 用户（默认） |
| API key 模式 | 普通 BigModel/zai API key | 按 token 计费用户 / OAuth 不可用时降级 |

#### 3.4.2 登录流（"ZCode 怎么登录我们就怎么登录"）

复刻官方 OAuth 授权码流（`packages/services/src/oauth/`）：

```
login(provider: zai | bigmodel)
  1. 构造 authorize URL（zai: chat.z.ai/api/oauth/authorize；client_id 公开标识）
  2. 打开系统浏览器；回调捕获用本地 loopback 监听
     （官方桌面端为 zcode://oauth/callback deep-link；我们无协议注册权限，
      loopback 等价承载 code+state，其余字节不变）
  3. code → POST https://zcode.z.ai/api/v1/oauth/token 换 token
  4. provider=zai 时：追加官方的 /api/auth/z/login 业务 token 交换
     provider=bigmodel 时：落 JWT
  5. 按官方键结构持久化：oauth:<provider>:access_token / refresh_token / user_info
     （文件：~/.zcode-proxy/credentials.json，格式与原反代兼容）
  6. 拉取 userinfo 完成登录态确认
```

refresh 链、损坏态清理（解密失败→强制登出→可重登）均按官方 `oauthCredentialRepo` 行为复刻。

#### 3.4.3 凭据状态机

```
empty ──login──▶ authorized ──exchange──▶ active
                                    │ 401/过期
active ◀─refresh── expired ◀────────┘
active/expired ──refresh 失败──▶ re-login 提示
任意态可并行配置 API key 作为 fail-open 降级通道
```

- 进程内直连后，原反代的本地 `proxyApiKey` 客户端鉴权整体取消（它的唯一职责是中间人场景准入）
- 凭据文件读写加锁，避免与残留反代进程并发写

### 3.5 Catalog（模型目录）

- 静态清单 11 模型：`glm-4.5-air / 4.6 / 4.6v / 4.7 / 5 / 5-turbo / 5v-turbo / 5.1 / 5.2 / 5.3 / 5.3-flash`，随 provider 注册进 `ctx.llm`
- 每模型声明协议映射（anthropic 主 / openai 降级）、上下文窗、能力位（vision 标记于 4.6v / 5v-turbo）
- **登录即点亮**：provider 注册后模型即出现在 DSH 模型选择界面；凭据就绪前灰显（可配置为隐藏）；登录成功后全部激活，并可自动将默认模型设为 `glm-5.3-flash`（可关闭）
- 模型名静态管理：上游动态配置只用于路由，不作为模型目录来源（保证与会话记录/计费展示一致）；可选开关：登录后向上游请求最新模型列表补全目录

---

## 4. 插件行 2：dsh-glm-prompt（content）

生效条件：`provider=glm`（经 assemble context 按 agent 路由过滤）。其他 provider 零影响。

### 4.1 提示词方言（Prompt Dialect）

对齐方法论——**范本是提取的官方事实，不是猜的**：

1. 从本地官方源码（`zcode-agent` 组装逻辑）与 pristine bundle 提取 ZCode 各 agent 的最终系统提示词节
2. 与 DSH `ctx.systemPrompt` 组装产物逐节 diff
3. 每处分歧三选一：{ 镜像 ZCode 措辞 / 保留 DSH（ZCode 无对应节或与 DSH 机制强绑定）/ 有害分歧需适配 }
4. 仅第 1、3 类落进 `ctx.systemPrompt.section()/variable()` 覆盖，节 id 稳定命名，便于后续 diff 维护

已知需要处理的分歧（待提取后确认完整清单）：

- 引导措辞：ZCode 对 GLM 的习惯称呼/角色设定/输出风格节
- 合成消息形态：两家同族（user 轮合成、节式 system），基本无需改写，逐项确认即可

### 4.2 工具方言（Tool Dialect）——完全对齐 ZCode

**设计决策（用户裁定）：工具面以 ZCode 为唯一基准，不做"按 DSH 微调"。**

模型可见的工具声明（名称、描述、参数 schema）整体镜像 ZCode 官方 harness：

| 模型看到的（ZCode 形态） | DSH 内部对应 | 垫片策略 |
|---|---|---|
| `TodoWrite{content,status,priority}` | `todo_write{content,status}` | 垫片接受三字段，`priority` 透传 DSH todo 存储（若存储不支持则接受后忽略，模型侧永远合法） |
| `TodoRead` | todo 读取 | 直映射 |
| `Bash/Glob/Grep/Read` | `pwsh/glob/grep/read` 等工具 | 名称与描述投影；参数 schema 以 ZCode 为准，垫片做字段翻译 |
| `WebFetch/WebSearch` | `web_fetch/web_search` | 同上 |

实现机制（构建层，合法路径）：

- 在工具注册/装饰接口处按 provider 过滤，glm 会话的模型可见工具面替换为 ZCode 形态
- 垫片负责 ZCode 形态调用 → DSH 工具执行器的双向翻译（入参翻译、结果回填保持 ZCode 风格的输出格式）
- 原反代实测结论（GLM 正确读 DSH 两字段 schema）仍然成立，但既然目标是与官方完全一致，三字段形态是更强对齐：模型在其训练分布内零偏移
- 风险与对策：DSH 工具执行器若拒绝未知键，垫片在边界处完成剥离，执行器永远只见合法输入；投影层有单测锁定每工具的字段映射

### 4.3 明确不做

- 不给非 glm provider 的会话做任何投影（按 agent 路由 + provider 双重过滤）
- 不改 DSH 工具的存储/权限/沙箱语义——投影只动"模型可见面"，不动执行面

---

## 5. Fail-open 矩阵（全插件统一纪律）

| 故障点 | 降级行为 | 用户感知 |
|---|---|---|
| 签名探测/握手/签名失败 | 无签名直发（官方 fail-open 梯：两次 401 VERIFY 后永久旁路） | 无（服务端接受裸请求则正常） |
| agent/configs 路由探测失败 | 静态双端点矩阵 | 无 |
| OAuth refresh 失败 | 提示重登；若配了 API key 则自动切 key 模式 | 设置页横幅 |
| 工具投影垫片异常 | 该工具回退 DSH 原生形态（模型仍可用，口音略偏） | debug 日志 |
| 提示词节覆盖异常 | 该节保留 DSH 原文 | 无 |
| **任何一层** | **绝不回退到"改写请求内容"**——保真只降级 transport 强度，永不改变 model-visible 字节 | — |

---

## 6. 配置（Config schema 草案）

```
glm:
  provider: bigmodel | zai            # 上游，默认 bigmodel
  credentialMode: oauth | apikey      # 默认 oauth
  identity:
    appVersion: "3.14.0"              # 跟随 ZCode 稳定版
    sourceTitle: "cli"
    deviceMid: <auto-once>            # 生成一次永久复用
  clientSigning:
    enabled: true                     # 探测驱动 + fail-open
  endpointRouting:
    enabled: true                     # 探测驱动 + fail-open
  models:
    autoActivateOnLogin: true
    defaultOnLogin: glm-5.3-flash | null
    dynamicDiscovery: false           # 登录后拉上游列表补全（实验开关）
  dialect:
    prompt: true                      # 提示词方言
    tools: full | off                 # 工具方言投影，默认 full
```

凭据、签名私钥等敏感值不进 Config，走凭据文件。

---

## 7. 发布与安装形态

- npm 包（workspace 内开发），`package.json` 声明 `dsh.bundle`
- `cordis.patch.yml`：插入两 Host 插件行（`dsh-llm-glm`、`dsh-glm-prompt`）
- 经 `plugin_manager install_bundle` 安装进 profile，全 profile 会话生效、重启存活
- 显示元数据（标题/描述/图标/本地化资源）按 DSH host-plugin 规范齐全
- **安装门禁**：`npm run preflight`（`npm test` 的第一道）。检查 dist 产物齐全、patch 行文件存在、`dsh.client` 声明合法。门禁红 = 不许安装。
- **一包一源的硬约束**（2026-10-27 事故）：client-modules 按**包名**组成 web 启动图，若同一包被多个 active loader 行解析且声明了 `dsh.client`，boot 直接失败（`resolves from multiple active Loader sources`，`client-hmr` 等 `clientModules` 至死）。本包是多行架构，**其 UI 半必须放独立单入口包**，不得在本包 `package.json` 声明 `dsh.client`。preflight 已固化该检查。

---

## 8. 开放问题

| # | 问题 | 解决路径 |
|---|---|---|
| A1 | `X-ZCode-Agent` 头是否存在于发行 bundle | pristine bundle 二次 grep |
| A2 | ultra 端点映射（proxyEndpoint.mapping）精确语义 | 对照 bundle `ProviderEndpointRoutingService` |
| A3 | ZCode 系统提示词完整提取与 DSH 逐节 diff 清单 | 实现阶段第一步产出《方言对齐 diff 表》 |
| A4 | 工具投影与 DSH 各 agent preset（standard/ptc/minimal/cordis）的组合矩阵 | 按 preset 逐一验证，先覆盖 standard |
| A5 | credentials.json 与残留反代进程的并发写风险 | 文件锁 + 启动检测提示退役反代 |

---

## 9. 里程碑

1. **M0 方言对齐底账**：A1–A3 解决，产出身份头终版清单、签名移植笔记、提示词/工具 diff 表（本设计的附录）
2. **M1 transport MVP**：dsh-llm-glm——身份头 + 静态路由 + API key 模式 + 模型目录点亮
3. **M2 OAuth**：登录/refresh/共享 credentials.json + 签名 V4 + 动态路由
4. **M3 content**：提示词方言节 + 工具投影垫片（含单测锁定映射）
5. **M4 收尾**：fail-open 全矩阵验证、配置 UI、显示资源、文档
