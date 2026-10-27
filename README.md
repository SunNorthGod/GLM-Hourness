# dsh-glm-hourness

GLM 按 ZCode 训练分布无损接入 DeepSeek Harness（DSH）的插件包：glm 会话的提示词与工具面镜像 ZCode，非 glm 会话零打扰。单包多行，按 `cordis.patch.yml` 独立启停。

## 行

| 行 | 作用 | 状态 |
| --- | --- | --- |
| dsh-glm-llm | 通道：原生 ZCode 客户端（OAuth poll 登录 → 加密凭证库；身份头全套、签名 V4、端点路由、Anthropic Messages 传输、coding-plan/start-plan 双档），脱离 zcode-proxy 反代直连 ZCode 后端 | S2 |
| dsh-glm-login | 登录命令：`/glm-login`（浏览器授权，5 分钟超时）、`/glm-status`（凭证状态）、`/glm-logout` | S2 |
| dsh-glm-hourness-ui | 独立单入口 UI bundle：设置页「GLM Hourness」说明页 + 会话输入框下方「GLM 通道」pill（登录/刷新状态/登出按钮，经 `ctx.remote.commands.execute` 复用命令面；登录后自动轮询状态）。client 半与多行主包分离，满足 client-modules「一包一源」 | S2 |
| dsh-glm-prompt | 方言面：路由驱动的可逆同步——身份节同名影子、八件套别名、deferred 声明、todo 提醒 10/10 回路、画像滑杆节（三档 LLM 自选）；压缩镜像（ZCode compact 提示词 verbatim 库 + `summarize()` 钩子引擎，glm 路由走镜像、其余委托 base） | S1-S5 |
| dsh-toolsearch | 懒加载：非驻留原生首面隐藏进 deferred 目录，ToolSearch（schema 逐字）select/关键词查询→`<functions>` 回注→scoped 同名激活；DSH 自动发 tool-addition 通知 | S3 |
| dsh-memory | 审计基座＋记忆层：`.llm/audit/` 三流水（violations/usage/decisions JSONL，用量经只读 `llm/stream` 逐调用记账）；`.llm/memory.json` 记忆库（14 天半衰期+复审加成，检索按命中×强度排序，只存 git 查不到的） | S4-S5 |
| dsh-workflow | 自主调校：决策分级（L1 自主/L2 次日报备/L3 当次申报）+ 决策日志挂 team 派单面；五键卡片文案；晨报聚合（例外先行→曲线→用量）；hourness-ui 数据面（用量面板+峰谷徽章+派单面板，纯函数读审计流水） | S4-S5 |
| dsh-guard | 执行边界：工作区圈禁、文件修改专用工具；四段纠偏（事实/越界/正路/例外）+ 申报协议；违规审计回调 | S1 |

方言基线钉在 ZCode 3.16.3 协议采样（训练分布锚）；官方开源仓库（zai-org/ZCode，Apache-2.0）为文本权威源，master 演进只做机制参考。安全声明双档：start-plan 用官方原文，coding-plan 换操作者工程环境声明。

## 设计要点

- 激活 seam：`agent/created` 与每次 `agent/pre-step` 同步方言状态——同名 section 影子（`harness:identity`，order -1000）、`when({modelSelection})` 门控的别名注册、随路由翻转的原生 restrict（glm 路由时 deny、切走即解除，中途切 provider 不丢工具）。原生 executor 在隐藏前捕获闭包，垫片委托不受影响；第一个请求即方言面。
- 提醒通道：`tools/post-execute` 的 `additionalContexts` 装载带源标签（`glm-todo-reminder`）的合成 notice，与 DSH repeat-tool-reminder 同一机制。
- 构建零 DSH 依赖：`src/shared/dsh-min.ts` 结构化 duck-type 上游 API，正确性由上游测试环境里的集成探针保障（`Zcode\repos\deepseek-harness\packages\test-support\glm-hourness-probe`）。
- 全部行 fail-open：行禁用或探测器抛错都会退化放行，不阻断会话。

## 测试

```
npm run preflight  # 安装前门禁：产物齐全、patch 行文件存在、client 半一包一源
npm run build      # tsc（含 adapter 契约检查），产物在 dist/
npm test           # 21 个 spec / 140 用例：逐字文本、别名映射、提醒回路、guard 规则与审计、
                   # 原生通道全链（OAuth 流、加密凭证库、身份/签名/路由、Anthropic 编解码、
                   # start-plan 组装）、方言接线（含 rc.3 组装重写与路由翻转）、记忆/工作流/晨报
npm run smoke      # 真网探针：node --experimental-strip-types scripts/smoke-zcode.mjs
```

安装前后均须通过 `build` → `preflight` → `test` 三道门禁；涉及 loader 组合、新包、新行的改动先在临时 profile 用 headless 沙盒验证（见 `docs/DEVELOPMENT.md` §3）。

## 已知问题

- `guard` 对 shell 命令文本中的 `=>`、`>>>`、`->` 存在误判（正则检测，未做引号感知）；
- `glm-llm` 的签名 V4 握手对当前凭证失败时按 fail-open 无签发送（请求成功，对 coding-plan 用量加成的影响未验证）；
- `start-plan` 档代码与单测完整，未做真机授权验证；
- UI 面板功能完整，视觉未达预期用户要求。

## 安装（DSH 标准 bundle）

`package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 是 Loader 方言（`insert` 行）。对本地目录安装：

```
plugin_manager install_bundle <本仓库绝对路径>
```

行配置：`glm-prompt` 的 persona/tier 等是 Plugin Manager 里的可调项（导出了 Schemastery `Config`）；`guard` 的圈禁根默认取调用方 agent 的会话目录（`session.header.cwd`），无需配置；`memory`/`workflow`/`hourness` 的 `home` 必须显式配置（激活期无法推断工作区），缺失时该行告警并停用，不影响会话。`glm-llm`/`glm-login` 的 `home` 默认经 `!!js` 从 `USERPROFILE` 派生；首次使用在任意会话输入 `/glm-login` 完成浏览器授权，`/glm-status` 确认后模型选择器切换到该通道的 provider（默认 `glm-zcode`）。激活期任何行都不抛错：配置错误只让该行降级，不会拖垮 host 启动。

## 许可

MIT。ZCode 官方仓库（Apache-2.0）作为事实源使用，未复制其代码。

## Vendored schemastery

`src/shared/schemastery.ts` is vendored from DeepSeek Harness `vendor/schemastery` @ 3.18.5 (MIT, upstream https://github.com/deepseek-ai/deepseek-harness, directory `vendor/schemastery/src/index.ts`). The DSH plugin manager only projects native Schemastery `Config` exports into its forms, and `@deepseek-ai/schemastery` is not resolvable from an installed profile bundle, so the dialect row ships the schema factory itself. Local divergences from upstream, kept minimal and listed here: (1) the refs-branch `options.list`/`options.dict` assignments are guarded conditionals because the upstream `x = x && f(x)` form fails this repo's `exactOptionalPropertyTypes`; (2) `ValidationError` assigns `this.options` explicitly after `super()` instead of a TypeScript parameter property, which Node strip-type mode cannot execute. Runtime dependency: `@deepseek-ai/cosmokit` (peer).
