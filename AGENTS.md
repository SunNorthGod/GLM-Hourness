# GLM-Hourness 仓库规则

本仓库是 DeepSeek Harness 的第三方 bundle（多行 cordis 插件）。开发与交付必须遵守 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 强制流程

1. 改代码前：`npm run build` 能过；改的是 DSH 契约相关代码时，先读官方类型或 `reference/deepseek-harness` 源码，不猜字段。
2. 安装前：`npm run build` → `npm run preflight` → `npm test`，三道全绿。
3. 动主 profile 前：涉及 loader 组合、新包、新行的改动，先在临时 profile 用 headless 沙盒验证（见 DEVELOPMENT.md §3）。
4. 新行默认 `disabled: true`，验证通过后才启用。
5. 装后验证：`plugin_manager` 的 `application: applied` 只是 loader 接受行，不等于启动成功；必须刷新/重启后确认无新错误，或明确告知用户需要重启。
6. 不改用户的 `~/.dsh` profile 配置（除用户明确要求）；改前备份。

## 代码

- TypeScript strict + `exactOptionalPropertyTypes`；Node 22 strip-types 兼容（不用 TS 参数属性）。
- 插件激活期（`apply`）不抛错：配置缺失降级为 warn + no-op。
- 不 mock DSH 契约本身；mock 只用于网络与文件系统。
- adapter / 服务实现必须与官方 `.d.ts` 保持类型级契约（`AdapterContractCheck` 模式）。
- 不留死代码；删除即删净。

## 文档

- 设计决策进 `docs/DESIGN.md`；流程与事故进 `docs/DEVELOPMENT.md`。
- 干净区：文件内不写人设、语气词。
