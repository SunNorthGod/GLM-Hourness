# 交接说明

版本：0.2（2026-10-27）
本文件记录当前状态，供接手者继续工作。设计以 `CHARTER.md`、`DESIGN.md`、`ORCHESTRATION.md` 为准，下一步以 `ROADMAP.md` 为准。

## 1. 项目概况

- 仓库：`C:\Users\29596\Desktop\Project\GLM-Hourness`；git，远端 Gitee 私有仓库 `NorthGod_BFDG/GLM-Hourness`，主分支 `main`。
- 目标：让 GLM 以 ZCode 训练分布住进 DeepSeek Harness（DSH），并在其上建一套编排层，把开发体系量化成由 harness 保证实施的标准（`CHARTER.md`）。
- 运行时：DSH Desktop `0.2.1-rc.3`，profile `desktop`；ZCode 基线 3.16.3。
- 安装形态：两个 bundle，均经 `plugin_manager install_bundle` 装入 profile：
  - `dsh-glm-hourness@0.2.0`：主包，8 行（2026-10-27 起工具检索并入 `glm-prompt`，原 `toolsearch` 行删除）；
  - `dsh-glm-hourness-ui@0.1.0`：独立单入口 UI 包，1 行。

## 2. 仓库结构

```
src/           主包 TypeScript 源码
tests/         21 个 spec，165 用例；tests/fake-rc3.ts 为 rc.3 运行时替身
ui/            独立 UI bundle（纯 JS，不参与 tsc）
scripts/       preflight-bundle.mjs、check-verbatim.mjs、smoke-zcode*.mjs、probe/（L3 探针）；scripts/dev/ 为历史调试脚本，部分针对已不存在的接口
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
| `glm-prompt` | 在 rc.3 运行时上生效，含 ZCode 3.16.3 local 工具检索（L3 探针 15/15，2026-10-27）；桌面版需重启才加载 |
| `glm-compact` | 已实现；桌面版上镜像引擎未挂载（已知问题 15） |
| `guard` | 拦截与纠偏可用；告知、申报、记录三段未接通 |
| `memory` | 工具与用量流水可用；记忆几乎未被使用 |
| `workflow` | 只记录派遣类调用 |
| `hourness` | `/hourness` 可用；峰谷口径错误 |
| `glm-hourness/ui` | 功能可用，视觉未被接受 |

装机：10 行均 `fiberPhase: active`，无激活错误（2026-10-27 删除 `toolsearch` 行之前的记录）。门禁 `npm run build`、`npm run preflight`、`npm test` 全绿，`npm run probe` 15/15。

## 4. 审计数据快照（2026-10-27）

- 仓库 `.llm/audit/usage.jsonl` 890 条：`glm/glm-5.3` 606，`deepseek-account/deepseek-flash` 274，`glm/glm-5.3-flash` 10。
- `~/.dsh/profiles/desktop/.llm/audit/usage.jsonl` 190 条，全部 `glm/glm-5.3`，时间 15:36–17:22（本地）；同目录 `memory.json` 1 条。
- 走原生路由 `glm-zcode` 的请求：0 条。上述 GLM 请求全部经旧的 `glm` 路由。
- 违规流水：无文件（已知拦截至少 3 次）。

## 5. 已知问题

1. 路由判定已收口到 `src/shared/route.ts`，`glm-prompt`（含工具检索）与 todo 提醒都已改用（`DESIGN.md` §3）。
2. 版本基线已统一为 3.16.3；`X-Title` 用 `cli` 还是桌面版的 `electron` 待定（`DESIGN.md` §4.2）。
3. guard 闭环缺三段，且对 `=>`、`>>>`、`->` 误判（`ORCHESTRATION.md` §6）。
4. 数据目录分裂（§4）。
5. 签名握手对当前凭证失败，按设计无签发送；对 1.5 倍用量的影响未验证，签名状态不可见。
6. start-plan 档只有单测，未做真机授权验证。
7. 峰谷口径：面板把谷时写死为每天 0–8 点，并按调用次数统计（`ORCHESTRATION.md` §11.2）。
8. 记忆存储判据过严，路径或文件名样式的文字一律被拒（`ORCHESTRATION.md` §8.1）。
9. 方言逐字文本：六个工具描述不是 ZCode 原文，由逐字门禁列为已知偏差；todo 提醒正文、compact 提示词、工具检索文本已按原文重建，deferred 声明段已删除（`DESIGN.md` §5.9）。工具检索在 ZCode 默认关闭，本项目按用户定案默认开启；与 ZCode 的剩余差异见 `DESIGN.md` §5.7。
10. UI 视觉未被接受。
11. cot-translation（DSH 官方实验行，非本项目组件）会把推理碎片显示到界面。
12. 凭证加密密钥可由本机信息推导（`DESIGN.md` §4.1）。
13. 修正前写入的用量流水，原生通道请求的输入 token 均为 0（解码器缺陷已修，`DESIGN.md` §4.6a）；旧流水不能用于积分统计。
14. 2026-10-27 之前，`glm-prompt` 与 `toolsearch` 依赖桌面版运行时不存在的 `tools.executable()`，在桌面版上从未生效（L3 探针确认）。两者均已在 rc.3 接口上重写。桌面版重启后，GLM 会话将第一次真正看到 ZCode 方言与工具检索。
15. `glm-compact` 在桌面版上从未挂载：从仓库路径加载时解析不到 `@deepseek-ai/dsh-compaction-basic`，该行按设计降级（每次 L3 探针的 stderr 都有记录，`DESIGN.md` §5.6）。
16. 2026-10-27 之前创建的合成 notice 没有 `id` 与 `role`；同一步里有两条这样的 notice 待处理时，DSH inbox 会抛「already pending」。已修（`createUserNotice`）。

反向代理已从项目范围移除（`DESIGN.md` §1）；profile 中指向 8317 的 pi-ai `glm` 路由属于用户配置，本项目不改。

## 6. 环境事实

- 凭证：`.llm/credentials.json`（AES-256-GCM；`GLM_HOURNESS_CREDENTIAL_SECRET` 可覆盖密钥）。
- 模型：`glm-zcode` 路由提供 GLM-5.3、GLM-5.3-Flash。
- 沙盒：profile `glmsandbox`，命令见 `DEVELOPMENT.md` §3。
- profile 目录中仍留有备份 `cordis.patch.yml.bak-1793101338423`（2026-10-27 启动崩溃后的恢复来源）。
- 旧工作名文件夹 `Desktop\Project\dsh-glm-dialect` 的文档已迁入本仓库，可由用户删除。

## 7. 下一步

`ROADMAP.md` M1（底层收口）。需要用户参与的事项见 `ROADMAP.md` §3。
