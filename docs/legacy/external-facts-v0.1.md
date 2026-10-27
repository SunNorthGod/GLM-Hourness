# 外部事实账：BigModel 官方文档消化索引 + 关键事实

版本：0.1（2026-10-27）。单一事实源原则：细节一律查 digest 原文，本文件只做索引与结论。

## 1. 消化产出

| 文件 | 覆盖 | 原始快照 |
|---|---|---|
| `bigmodel-coding-plan-digest.md` | learning-resources 5/5 页（sitemap+侧栏双源验证） | `.llm/tmp_bm/` |
| `bigmodel-guide-digest.md` | cn/guide 37/37 + 计费/限流/FAQ 补抓 9 页 | `.llm/docs/_bigmodel_md/`（46 页 + llms.txt + 复抓脚本） |

未覆盖（弱相关，guide digest 内有清单）：cn/coding-plan 其余、cn/managed-agents（含 MCP OAuth vaults）、api-reference。

## 2. 关键事实（项目级结论）

### 端点与认证
- 四端点矩阵：按量 `/api/paas/v4`、套餐 `/api/coding/paas/v4`、anthropic `/api/anthropic`（x-api-key）、Responses `/api/v1`。
- 2026-10-16 起新 Key 三类分治互不通用；历史兼容 Key 额度归调用端点决定。
- 模型 API 认证仅 Bearer API Key + 可选 JWT（HS256，sign_type=SIGN，key 形如 id.secret）；无 OAuth 流程（ZCode 的"OAuth"是账号登录体系，非模型 API 标准 OAuth）。
- 曾订阅 Coding Plan 的账号暂只能用 Chat Completion 协议调模型 API。

### 模型行为参数
- GLM-5.3 系强制思考：`thinking.type` 仅接受 `enabled`；`reasoning_effort` GLM 实用档 **low/high/max**（默认 max；五档词汇 API 接受但 GLM 不使用——用户确认 2026-10-27，终裁关闭）；Claude Code 侧官方映射 disabled→low。
- Preserved Thinking（`clear_thinking:false`）套餐端点默认开、标准端点默认关；回传 reasoning_content 提缓存命中。
- 1M 上下文：anthropic 通道模型名后缀 `[1m]`。

### 渠道加成（用户提供的决策事实）
- **150% 用量加成仅在个人套餐（coding-plan）档**；start-plan（体验套餐）无加成。主通道 = coding-plan 反代档，双渠道（coding-plan / start-plan）都支持，实现参照 zcode-api 反代源码（start-plan 含阿里验证码池 + system blocks 前置，5 并发上限）。
- MCP 余额：Coding Plan 积分池中专门计给服务端 MCP 工具调用的额度（`MCP 消耗积分数 = 调用次数 × Output 抵扣系数`），与模型 token 积分分开；web provider 的服务端 web_reader 消耗此池，监控口径独立。

### 计费与限流
- Coding Plan 积分制：Lite/Pro/Max = 2000/12000/28000 积分每 5h；系数 glm-5.3 = 6.9/1.7/24、flash = 2.3/0.56/8（精度/速度/思考？见 digest 原表）；非高峰 5 折，高峰 = 工作日 14-18 点。
- 错误码 1308/1310/1316-1321 带 next_flush_time（可直接透出恢复时间）；1313 为公平使用限频——非官方工具用套餐端点有被限风险，DSH 形态官方定位为次级调度。

### 福利（鸡蛋）
- 体验卡 2000 积分、额度重置卡、实名赠 500 万 tokens：全部只有控制台页面入口，**无公开领取 API**。
- 处置定案：检测 + 跳转控制台，不模拟登录态；无额度时免费模型兜底（glm-4.7-flash 族）。

### 训练分布与 harness 结构印证
- 官方文档通篇以 Claude Code 生态为参照（CLAUDE.md、Plan Mode、/agents、Hooks、Skills、@path）——GLM coding 训练分布的假想宿主 = Claude Code 式 CLI agent；ZCode 方言镜像方向获背书。
- MEMORY.md 前 200 行自动进 subagent 系统提示（官方两处互证）——memory 插件裁剪预算定 200 行。
- 上下文成本表：规则文件全量常驻、Skills 仅描述常驻正文按取、Hooks 零成本；Skill frontmatter `disable-model-invocation: true` 可降为零成本。
- 多层级合并矩阵（CLAUDE.md 叠加取更具体、MCP local>project>user、Skills managed>user>project、Hooks 合并执行）可照抄进 memory/prompt 层级设计。
- 任务结构化输入官方建议：Goal/Context/Constraints/Done when——可作 workflow 规划态输出格式参考。

## 3. 挂账清单（全局汇总）

| 项 | 阻塞条件 | 验证路径 |
|---|---|---|
| anthropic 通道可用性（Coding Plan 老账号） | 无 | S2 首周直连实测（反代通道为主时优先级降） |
| native ToolSearch 透传（K2） | 需活 token | 运行中 ZCode 取 token 或反代新登录 |
| OutputStyle 风格列表 | 服务端下发 | 运行中 ZCode 抓取 |
| 实跑 temperature/top_p 值 | 需实跑请求体 | export-log 或反代抓包 |
| startplan/bigmodel 渠道差异（K9） | 无 | zcode-api 源码核对 |
| zcode-api LICENSE 相容性 | 无 | 动工前核（client-signing 移植前置） |
