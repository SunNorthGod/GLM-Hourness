# 交接说明

版本：0.2（2026-10-27）
本文件记录当前状态，供接手者继续工作。设计以 `CHARTER.md`、`DESIGN.md`、`ORCHESTRATION.md` 为准，下一步以 `ROADMAP.md` 为准。

## 1. 项目概况

- 仓库：`C:\Users\29596\Desktop\Project\GLM-Hourness`；git，远端 Gitee 私有仓库 `NorthGod_BFDG/GLM-Hourness`，主分支 `main`。
- 目标：让 GLM 以 ZCode 训练分布住进 DeepSeek Harness（DSH），并在其上建一套编排层，把开发体系量化成由 harness 保证实施的标准（`CHARTER.md`）。
- 运行时：DSH Desktop `0.2.1-rc.3`，profile `desktop`；ZCode 基线 3.16.3。
- 安装形态：两个 bundle，均经 `plugin_manager install_bundle` 装入 profile：
  - `dsh-glm-hourness@0.2.0`：主包，9 行；
  - `dsh-glm-hourness-ui@0.1.0`：独立单入口 UI 包，1 行。

## 2. 仓库结构

```
src/           主包 TypeScript 源码
tests/         21 个 spec，140 用例
ui/            独立 UI bundle（纯 JS，不参与 tsc）
scripts/       preflight-bundle.mjs、smoke-zcode*.mjs；scripts/dev/ 为历史调试脚本
docs/          宪章、设计、编排、路线、事实账、流程、交接；docs/reference/ 为事实参考原文
AGENTS.md      仓库规则
cordis.patch.yml  主包 Loader patch
.llm/          不入库：credentials.json（加密凭证）、device-mid.txt、audit/、memory.json、docs/（原始资料快照与抓取脚本）
reference/     不入库：审计用参考源码（zcode-api、deepseek-harness、ZCode、zcode-plugins），约 2.5 GB
dist/          不入库：tsc 产物（profile 通过 pnpm link 使用）
```

## 3. 组件状态

| 行 | 状态 |
| --- | --- |
| `glm-llm` | 真网冒烟通过（coding-plan，模型返回 `pong`）；DSH 真实会话中尚未被使用 |
| `glm-login` | 可用 |
| `glm-prompt` | 已实现；真机上是否对原生路由生效未确认（路由判定问题，见 §5.1） |
| `glm-compact` | 已实现 |
| `toolsearch` | 已实现；在原生路由与 rc.3 下推断不触发 |
| `guard` | 拦截与纠偏可用；告知、申报、记录三段未接通 |
| `memory` | 工具与用量流水可用；记忆几乎未被使用 |
| `workflow` | 只记录派遣类调用 |
| `hourness` | `/hourness` 可用；峰谷口径错误 |
| `glm-hourness/ui` | 功能可用，视觉未被接受 |

装机：10 行均 `fiberPhase: active`，无激活错误。门禁 `npm run build`、`npm run preflight`、`npm test` 全绿。

## 4. 审计数据快照（2026-10-27）

- 仓库 `.llm/audit/usage.jsonl` 890 条：`glm/glm-5.3` 606，`deepseek-account/deepseek-flash` 274，`glm/glm-5.3-flash` 10。
- `~/.dsh/profiles/desktop/.llm/audit/usage.jsonl` 190 条，全部 `glm/glm-5.3`，时间 15:36–17:22（本地）；同目录 `memory.json` 1 条。
- 走原生路由 `glm-zcode` 的请求：0 条。上述 GLM 请求全部经旧的 `glm` 路由。
- 违规流水：无文件（已知拦截至少 3 次）。

## 5. 已知问题

1. 路由判定不一致：各行判断「是否 GLM 会话」的写法不同，rc.3 只在提示词组装变量里给出路由；todo 提醒与工具检索推断未生效（`DESIGN.md` §3）。
2. 版本基线已统一为 3.16.3；`X-Title` 用 `cli` 还是桌面版的 `electron` 待定（`DESIGN.md` §4.2）。
3. guard 闭环缺三段，且对 `=>`、`>>>`、`->` 误判（`ORCHESTRATION.md` §6）。
4. 数据目录分裂（§4）。
5. 签名握手对当前凭证失败，按设计无签发送；对 1.5 倍用量的影响未验证，签名状态不可见。
6. start-plan 档只有单测，未做真机授权验证。
7. 峰谷口径：面板把谷时写死为每天 0–8 点，并按调用次数统计（`ORCHESTRATION.md` §11.2）。
8. 记忆存储判据过严，路径或文件名样式的文字一律被拒（`ORCHESTRATION.md` §8.1）。
9. 方言逐字文本：工具描述、deferred 声明段、ToolSearch 描述的大部分不是 ZCode 原文，由逐字门禁列为已知偏差；todo 提醒正文与 compact 提示词已修正（`DESIGN.md` §5.9）。工具检索在 ZCode 默认关闭，本项目默认开启且未公告 deferred 工具名（`DESIGN.md` §5.10）。
10. UI 视觉未被接受。
11. cot-translation（DSH 官方实验行，非本项目组件）会把推理碎片显示到界面。
12. 凭证加密密钥可由本机信息推导（`DESIGN.md` §4.1）。
13. 真网冒烟返回的用量 `inputTokens` 为 0（2026-10-27 复测），输入 token 计数疑似未解析；它直接影响积分口径（`ORCHESTRATION.md` §11），待查。

反向代理已从项目范围移除（`DESIGN.md` §1）；profile 中指向 8317 的 pi-ai `glm` 路由属于用户配置，本项目不改。

## 6. 环境事实

- 凭证：`.llm/credentials.json`（AES-256-GCM；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖密钥）。
- 模型：`glm-zcode` 路由提供 GLM-5.3、GLM-5.3-Flash。
- 沙盒：profile `glmsandbox`，命令见 `DEVELOPMENT.md` §3。
- profile 目录中仍留有备份 `cordis.patch.yml.bak-1793101338423`（2026-10-27 启动崩溃后的恢复来源）。
- 旧工作名文件夹 `Desktop\Project\dsh-glm-dialect` 的文档已迁入本仓库，可由用户删除。

## 7. 下一步

`ROADMAP.md` M1（底层收口）。需要用户参与的事项见 `ROADMAP.md` §3。
