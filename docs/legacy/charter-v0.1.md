# GLM-Hourness 项目宪章

版本：0.1（2026-10-27）
命名：**GLM-Hourness** = GLM + House + Harness。GLM 说要盖新房子，而 Harness 工程是房子的承重结构。工作名 dsh-glm-dialect 废弃。

## 1. 项目目标（三轴，缺一不可）

1. **无损**：GLM 以官方 ZCode 训练分布接入 DSH——模型质量与官方一致，不为照顾 harness 裁剪。
2. **治顽疾**：借重写接入层的机会修复 ZCode 已知痛点（MCP schema 行李、上下文膨胀、记忆陈旧无清理等），做得比 ZCode 更好。
3. **自由度**：完全遵守 DSH 开放、万物皆插件的生态——每个能力独立插件行、可单独禁用、失败 fail-open、不污染其他 provider。

## 2. 度量（产品层面，明确非字节级）

- **字节级 diff 不是验收标准**。追求与某一侧逐字节一致违背本项目初心；diff 只作为 transport 层调试工具存在。
- 验收度量是产品性的：模型行为质量（长任务完成率、todo 纪律、指令遵循）、无损性（用户体感与官方无差）、顽疾是否修复（token 效率、上下文卫生）、DSH 生态融合度（可组合、可退化）。
- **本项目是长期优化项目**："和 DSH 一样"或"和 ZCode 一样"都不构成达标条件；持续演进是常态。

## 3. 项目约定（卫生理念，内建于产品设计）

- 文档放项目目录的 `.docs/`；项目级记忆放 `.memory/`；**仓库内不长任何 IDE / 工具专用目录**；个人配置放用户级目录（仓库外）。
- 不留死代码、不留多余路径、过时记忆必须清理更新——文档整洁与记忆卫生是产品功能，不是纪律口号。
- 模型与用户的协作习惯（代码卫生、记忆更新纪律、文档收束）由 harness 层主动维护。
- 支持用户偏好的 multitask 编排模式。

## 4. 形态

DSH bundle（npm 包 + `cordis.patch.yml`），四插件行 + 一可选 web provider：

| 行 | 职责 | 轴 |
|---|---|---|
| dsh-llm-glm | transport：身份头/签名/路由/OAuth/模型目录/thinking 组装/beta 头 | 无损 |
| dsh-glm-prompt | content：提示词镜像/工具投影/todo 提醒回路/日期感知 | 无损 |
| dsh-glm-toolsearch | 机制：deferred 懒加载 + ToolSearch（治 ZCode MCP 行李） | 治顽疾 |
| dsh-glm-memory | 机制：记忆体系（卫生纪律内建，全局库可与 ZCode 共享） | 无损+治顽疾 |

内容改写只走构建层（`ctx.systemPrompt` / 工具声明投影），transport 只动冻结请求的伴随元数据——深冻结铁律内合法。

## 5. 文档地图

| 文件 | 内容 |
|---|---|
| `00-charter.md` | 本宪章 |
| `01-zcode-capabilities-reference.md` | ZCode 能力技术参考（逆向实读，含 §10 深挖与挂账清单） |
| `02-zcode-tool-schemas.md` | 八件套完整 JSONSchema + 三段文案原文 + 调查批注 |
| `02-dsh-zcode-divergence.md` | DSH×ZCode 差异对照、处置矩阵、增量定案 |
| `../GLM-House/docs/DESIGN.md` | 早期设计稿 v0.1（已部分被 02 系列取代，历史参考） |
| `../GLM-House/reference/zcode-api/` | TriDefender/zcode-api 全量源码（签名/身份头/路由/OAuth 可读实现） |

## 6. 当前状态（2026-10-27）

- S1（方言层）原材料齐备：八件套 schema 全量、身份节文案、todo 提醒参数、priority 三枚举（high/medium/low）、deferred 文案均已录档。
- 待办本地核对：K7（DSH 工具声明 per-provider 过滤钩子，最关键未知数）、K6（pi-ai 目录 glm 条目 thinking 声明）、K1（repeat-tool-reminder 参数）。
- 挂账（外部）：effort↔budget 映射表、OutputStyle 风格列表、实跑 temperature、模型表数值、直连闸门（需运行中 ZCode 的 secret/token）、ToolSearch 打分实现（低优先）。
- 关键勘误已录：credentials.json 为 enc:v1 AES-256-GCM 信封（key=sha256(secret)，secret 优先 env `ZCODE_CREDENTIAL_SECRET` 否则 platform fallback）——Vault 设计必须自带登录产凭据，不能假设可读 Desktop 写入的密文。
