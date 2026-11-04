# GLM-Hourness 仓库规则

本仓库产出两个 DeepSeek Harness 第三方 bundle（dsh-glm-zcode、dsh-hourness，都是多行 cordis 插件，在 `packages/` 下；根目录只是开发工作区），目标与原则见 [docs/CHARTER.md](docs/CHARTER.md)。开发与交付必须遵守 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)，实施顺序见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 强制流程

1. 改代码前：`npm run build` 能过；改的是 DSH 契约相关代码时，先读官方类型或 `reference/deepseek-harness` 源码，不猜字段。
2. 安装前：`npm run build` → `npm run preflight` → `npm test`，三道全绿。
3. 动主 profile 前：涉及 loader 组合、新包、新行的改动，先在临时 profile 用 headless 沙盒验证（见 DEVELOPMENT.md §3）。
4. 新行默认 `disabled: true`，验证通过后才启用。
5. 装后验证：`plugin_manager` 的 `application: applied` 只是 loader 接受行，不等于启动成功；必须刷新/重启后确认无新错误，或明确告知用户需要重启。
6. 不改用户的 `~/.dsh` profile 配置（除用户明确要求）；改前备份。
7. 一件事一个提交，推送到 Gitee `origin/main`，随后把同一个 `main` 推到 GitHub 镜像 `github`（只推 `main`）；不强推（DEVELOPMENT.md §9）。npm 等整体做完再由人发版。

## 基线

- ZCode 基线 3.17.1：身份头、签名、提示词与工具面以同一版本为准。逐字文本只认 pristine 副本 `reference/zcode-3.17.1/zcode.cjs`，逐字门禁只读它（来源分级见 `docs/reference/zcode-verbatim.md`）。本机安装版随自动更新变化、被用户打过补丁，`reference/ZCode`（3.16.2 源码）仍含旧版文本，两者都只作机制参考。
- 不依赖反向代理：任何行都不识别或依赖反代路由。

## 代码

- TypeScript strict + `exactOptionalPropertyTypes`；Node 22 strip-types 兼容（不用 TS 参数属性）。
- 插件激活期（`apply`）不抛错：配置缺失降级为 warn + no-op，并上报（失败要出声）。
- 不 mock DSH 契约本身；mock 只用于网络与文件系统；假宿主只提供 rc.3 真宿主会提供的信号。
- adapter / 服务实现必须与官方 `.d.ts` 保持类型级契约（`AdapterContractCheck` 模式）。
- 不留死代码；删除即删净。
- 告警必须修：不新增编译器或检查器告警，压制必须写理由。
- 先用现成工具，再考虑自己写；一次性脚本不留在仓库里。

## 文档

- 总体架构与底层设计进 `docs/DESIGN.md`；编排层设计进 `docs/ORCHESTRATION.md`；外部事实进 `docs/FACTS.md`；流程与事故进 `docs/DEVELOPMENT.md`；当前状态进 `docs/HANDOFF.md`。文档地图见 `docs/CHARTER.md` §11。
- 文档与行为改动同一批提交；被取代的条款整条重写，旧文本留在 git 历史中。
- 干净区：文件内不写人设、语气词。
