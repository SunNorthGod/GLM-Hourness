# GLM-Hourness

GLM + House + Harness，两个目标各由一个包实现（`docs/CHARTER.md` §3）。House：GLM 以 ZCode 3.17.1 的训练分布住进 DeepSeek Harness（DSH），质量与官方 ZCode 一致，由 GLM 通道包 `dsh-glm-zcode`（`packages/glm`）实现。Harness：任何模型在 DSH 里沿项目图干活，开发体系由 harness 保证实施，由编排层包 `dsh-hourness`（`packages/hourness`）实现。两个包同仓，都是 DSH 第三方 bundle，各自多行，按各自的 `cordis.patch.yml` 独立启停，可以只装其中一个；GLM 方言不影响非 GLM 会话。

## 分层

| 包 | 层 | 行 | 作用 |
| --- | --- | --- | --- |
| `dsh-glm-zcode` | 底层 · 通道 | `glm-llm`、`glm-login` | 原生 ZCode 客户端通道：账号登录与加密凭证、身份头、签名 V4、端点路由、Anthropic Messages 传输、coding-plan / start-plan 双档；`/glm-login`、`/glm-status`（凭证状态与各行健康）、`/glm-logout` |
| `dsh-glm-zcode` | 底层 · 方言 | `glm-prompt`、`glm-compact` | 提示词与工具面镜像 ZCode 3.17.1、local 工具检索（LocalToolSearch / DeferredToolCall）、todo 提醒 10/10、压缩镜像 |
| `dsh-hourness` | 编排层 | `data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel` | 数据目录服务、执行边界、记忆与审计流水、决策日志与晨报、用量报告、项目图；`/hourness`、`/hourness-status`（两个包各行的健康） |
| `dsh-glm-zcode`（客户端面） | 呈现 | `glm-ui` | 设置页与会话输入框 pill（默认启用） |
| `dsh-hourness`（客户端面） | 呈现 | `ui` | 右侧栏项目图面板 |

编排层的完整设计（项目图即主 Agent、设计循环、决策卡、规范体系等）见 `docs/ORCHESTRATION.md`，目前大部分处于规划阶段。

## 文档

| 文件 | 内容 |
| --- | --- |
| `docs/CHARTER.md` | 宪章：目标、三问四答、分层、调校原则、工程美学、度量 |
| `docs/DESIGN.md` | 总体架构与底层设计 |
| `docs/ORCHESTRATION.md` | 编排层设计 |
| `docs/ROADMAP.md` | 实施路线 |
| `docs/FACTS.md` | 外部事实账 |
| `docs/DEVELOPMENT.md` | 开发与交付流程 |
| `docs/HANDOFF.md` | 当前状态与已知问题 |

## 门禁

```
npm run build      # tsc（含 adapter 契约检查），产物在 packages/glm/dist/、packages/hourness/dist/
npm run preflight  # 目录表、两包清单与 patch、产物齐全、client 半一包一源
npm test           # preflight + 逐字门禁 + 检查器门禁 + 全部 spec
npm run lint       # ESLint、knip、jscpd 对照基线（只减不增）；lint:update 缩小基线
npm run deps:check # pnpm outdated 与 pnpm audit，标出处理方式（docs/DEVELOPMENT.md §11）
npm run smoke      # 免登录真网探针
npm run smoke:authorized  # 需凭证：coding-plan 端到端请求
```

安装前后均须通过 build、preflight、test；涉及 loader 组合、新包、新行的改动先在临时 profile 用 headless 沙盒验证（`docs/DEVELOPMENT.md` §3）。

## 安装

两个包各自的 `package.json` 声明 `dsh.bundle.patch`，`cordis.patch.yml` 是 Loader 方言（`insert` 行）；根 `package.json` 只是开发工作区，不是 bundle。先 `npm run build`，再把两个包装进 profile（`docs/DEVELOPMENT.md` §3）：

```
dsh plugin --profile <名字> add <本仓库绝对路径>/packages/glm <本仓库绝对路径>/packages/hourness -w
```

只要其中一层就只装那一个包。每个包的界面是它自己的客户端面（`ui/` 下），由它自己的 patch 插行，不用另装；`ui/src/` 只是客户端源码。桌面版自己的 profile `desktop` 只能在桌面版关闭时，经安装目录里的 `resources\runtime\cli\bin\dsh.cmd` 操作（`docs/FACTS.md` §3）。

行配置：`glm-prompt` 的 persona / tier 等在插件管理器中可调（导出了 Schemastery `Config`）；`guard` 对所有路由与模型生效，圈禁根默认取调用方 agent 的会话目录，每个会话的系统提示词末尾列出生效的规则，组合里有 `workspace-changes` 时另以影子模式记录 shell 写入（`docs/ORCHESTRATION.md` §6）；用户级目录与项目目录由 `data` 行提供，`memory`、`workflow`、`hourness` 配了 `home` 时以行配置为准（`docs/DESIGN.md` §2.4）。首次使用在任意会话输入 `/glm-login` 完成浏览器授权，`/glm-status` 确认后在模型选择器中选 `glm-zcode` 路由；`/glm-status` 同时按包列出各行在本会话是否生效及原因，`/hourness-status` 只列这张表，不装 GLM 通道包时也能看（`docs/DESIGN.md` §2.5）。激活期任何行都不抛错。

## 许可

MIT。参考源与移植来源的许可见 `docs/FACTS.md` §4。

## Vendored schemastery

`src/shared/schemastery.ts` is vendored from DeepSeek Harness `vendor/schemastery` @ 3.18.5 (MIT, upstream https://github.com/deepseek-ai/deepseek-harness, directory `vendor/schemastery/src/index.ts`). The DSH plugin manager only projects native Schemastery `Config` exports into its forms, and `@deepseek-ai/schemastery` is not resolvable from an installed profile bundle, so the dialect row ships the schema factory itself. Local divergences from upstream, kept minimal and listed here: (1) the refs-branch `options.list`/`options.dict` assignments are guarded conditionals because the upstream `x = x && f(x)` form fails this repo's `exactOptionalPropertyTypes`; (2) `ValidationError` assigns `this.options` explicitly after `super()` instead of a TypeScript parameter property, which Node strip-type mode cannot execute. Runtime dependency: `@deepseek-ai/cosmokit` (peer).
