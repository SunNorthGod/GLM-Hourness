# 交接说明（HANDOFF）

本文件记录 GLM-Hourness 项目的当前状态，供接手者审计与继续工作使用。所有内容以本仓库代码、测试与实测记录为准。

## 1. 项目概况

- 仓库：`C:\Users\29596\Desktop\Project\GLM-Hourness`（非 git 仓库，没有版本历史）
- 目标：把 GLM 按 ZCode 训练分布接入 DeepSeek Harness（DSH），并附带执行边界、审计、记忆、编排层
- 运行时：DSH Desktop `0.2.1-rc.3`；profile `desktop`
- 安装形态：两个 bundle，均由 `plugin_manager install_bundle` 装入 profile
  - `dsh-glm-hourness@0.2.0`：主包，多行 cordis 插件（9 行）
  - `dsh-glm-hourness-ui@0.1.0`：独立单入口 UI bundle（1 行）

## 2. 仓库结构

```
src/           主包 TypeScript 源码（组件实现）
tests/         21 个 spec，140 用例
ui/            独立 UI bundle（纯 JS，不参与 tsc）
scripts/       preflight-bundle.mjs、smoke-zcode*.mjs
scripts/dev/   历史调试脚本（归档，不参与构建）
docs/          DESIGN.md（设计）、DEVELOPMENT.md（流程/事故/报错机制）
AGENTS.md      仓库规则
cordis.patch.yml  主包 Loader patch
.llm/          运行时数据：credentials.json（加密凭证）、device-mid.txt、audit/、memory.json
reference/     审计用参考源码（zcode-api、deepseek-harness、ZCode），约 2.5 GB，不入版本控制
dist/          tsc 产物（profile 通过 pnpm link 直接使用）
```

## 3. 组件与状态

主包 9 行，全部 `fiberPhase: active`：

| 行 | 内容 | 状态 |
|---|---|---|
| `glm-llm` | 原生 ZCode 客户端适配器：OAuth 凭证 → deviceMid → 端点路由 → 身份头 → 签名 V4 阶梯 → Anthropic Messages 传输；coding-plan / start-plan 双档 | 功能完成，真网冒烟通过 |
| `glm-login` | `/glm-login`、`/glm-status`、`/glm-logout` 三个命令（中文输出） | 完成 |
| `glm-prompt` | 方言面：ZCode 身份节、八件套别名、todo 提醒 10/10、画像滑杆、start-plan 三块系统提示 | 完成 |
| `glm-compact` | 压缩镜像：ZCode compact 提示词 + `summarize()` 引擎，非 glm 路由委托 base | 完成 |
| `toolsearch` | 懒加载工具目录 + select/关键词回注 | 完成 |
| `guard` | 执行边界：工作区圈禁、file-tools-only、四段纠偏、违规审计 | 完成，有误伤（见 §5） |
| `memory` | 记忆库（14 天半衰期 + 复审加成）与三流水审计 | 完成 |
| `workflow` | 决策分级、决策日志、晨报聚合 | 完成 |
| `hourness` | `/hourness` 用量面板命令 | 完成 |

独立 UI bundle 1 行：

| 行 | 内容 | 状态 |
|---|---|---|
| `glm-hourness/ui` | 设置页「GLM Hourness」说明页 + 会话输入框下方「GLM 通道」pill（登录 / 刷新状态 / 登出，经 `ctx.remote.commands.execute` 复用命令面；登录后每 5 秒自动轮询状态） | 功能可用，视觉未达预期 |

## 4. 验证状态

- `npm run build`：通过（tsc strict + `exactOptionalPropertyTypes`；`ZcodeAdapter` 有编译期契约检查 `AdapterContractCheck`，对照官方 `@deepseek-ai/dsh-llm@0.2.1-rc.3` 类型）
- `npm run preflight`：通过（产物齐全、patch 行文件存在、client 半一包一源约束）
- `npm test`：21 spec / 140 用例全绿
- 真网冒烟（需凭证，已执行）：coding-plan 端到端成功，模型返回 `pong`（命令：`node --experimental-strip-types scripts/smoke-zcode-authorized.mjs`）
- 免登录真网探针（已执行）：`scripts/smoke-zcode.mjs`——agent/configs 路由表、OAuth init、上游 401 均符合预期
- 装机：主包 9 行与 UI 包 1 行均 `active`，无 activation 错误

## 5. 已知问题与未完成项

1. **UI 视觉**：功能完整（状态、登录、登出、自动刷新），但用户明确评价「不好看」。设计参考为 DSH 官方 `ui-chat` 的 StatsPills / stat-dialog 皮肤，当前实现照抄了 token 与结构，视觉仍未达标。
2. **guard 误伤**：shell 命令文本中的 `=>`、`>>>`、`->` 会被当作重定向拦截，实际发生 3 次（用户与助手的工作流都受影响）。检测是正则实现，未做引号/上下文感知。
3. **签名 V4**：握手对当前凭证失败，按设计 fail-open 无签发送，请求成功。签名对 coding-plan「150% 用量加成」的影响未验证。
4. **start-plan 档**：代码与单测完整（3 块系统提示、currentDate 前缀、JWT 鉴权），未做真机授权验证；已实测的是 coding-plan 档。
5. **cot-translation 插件**：会把模型推理碎片渲染到界面，曾导致用户误解（把「拖。」当成消息）。该插件是 DSH 官方实验行，非本项目组件。
6. **反代未退役**：`zcode-proxy.exe`（8317 端口）仍在运行，profile 的 pi-ai `glm` 路由指向它；原生通道已可用，用户尚未执行反代下线。
7. **profile 恢复记录**：2026-10-27 19:42 一次启动崩溃后，profile patch 被降级，已从备份 `~/.dsh/profiles/desktop/cordis.patch.yml.bak-1793101338423` 完整恢复；备份文件仍留在 profile 目录。

## 6. 运行环境事实

- 凭证：`C:\Users\29596\Desktop\Project\GLM-Hourness\.llm\credentials.json`（AES-256-GCM 加密；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖密钥）
- 模型：glm-zcode 路由提供 `GLM-5.3`、`GLM-5.3-Flash`；profile 另有反代 `glm` 路由与 `deepseek-account` 路由
- 沙盒验证：profile `glmsandbox`（从 headless 模板创建），命令见 `docs/DEVELOPMENT.md` §3
- 门禁：`npm run build` → `npm run preflight` → `npm test`，安装前后均须通过

## 7. 文档索引

- `README.md`：组件清单、安装、验证命令
- `docs/DESIGN.md`：设计文档（架构、fail-open 矩阵、里程碑、一包一源约束）
- `docs/DEVELOPMENT.md`：交付流程（验证金字塔、sandbox、契约校验）、DSH 报错机制速查、三次事故记录
- `AGENTS.md`：仓库规则（安装门禁、默认 disabled、不改用户 profile）

## 8. 验收方式（当前状态对应的操作）

1. 模型选择器切到 `glm-zcode` 路由 → 发消息，确认正常回复；
2. 会话页「GLM 通道」pill → 刷新状态，确认「已登录 / 套餐 / Key / 账号」；
3. glm-zcode 会话与 DeepSeek 会话分别问「你是谁」，确认方言面只作用于 glm 路由；
4. `/hourness` 查看用量报告；
5. 设置页「GLM Hourness」页与会话 pill 面板可用；
6. 全量门禁：`npm run build && npm run preflight && npm test`。
