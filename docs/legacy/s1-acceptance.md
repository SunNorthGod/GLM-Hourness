# S1 验收对照表

对照目标逐项核对。状态：**全部达成**（含两处已记录偏差）。集成探针 3/3 绿（2026-10-27 04:19，reference/deepseek-harness 上游环境）。

| 目标项 | 证据 | 状态 |
| --- | --- | --- |
| 前置核对：安全声明原文提取录档 | 勘误后以 pristine 3.15.1 + 官方源码（identity.ts SECURITY_NOTICE）双源录档 05-zcode-verbatim.md；安装版提取被证实为用户补丁 | ✅ |
| 前置核对：zcode-api 许可相容 | CC BY-NC-SA，仅作参考未复制代码（用户定案：不受约束）；ZCode 官方仓 Apache-2.0 兼容 | ✅ |
| 脚手架：单包 + .llm gitignore + cordis.patch.yml | package.json / .gitignore / cordis.patch.yml 在仓；七行目录按「不预建空骨架」原则随行落地（S1 两行） | ✅ |
| 八件套工具投影 + TodoWrite 垫片 | aliases.ts 六别名 + todowrite.ts 垫片；schema 逐字（与官方源码核对）；**偏差：ToolSearch 随 S3 懒加载行交付**（deferred 注册表未建前出它是虚假承诺） | ✅（7/8，偏差记录） |
| 身份节分层组装 | identity.ts buildIdentitySection(outputStyle, notice)；官方源码逐字验证 | ✅ |
| 本地化清单九处 | 03-runtime-design.md §11 清单；S1 落地 Bash→pwsh 事实声明（timeout/working_dir/shell 映射），其余随行交付 | ✅（清单在，逐处随行） |
| todo 提醒 10+10 回路 | 官方源码语义验证 + 集成探针实证（真实 user 消息注入、逐字文案、回显） | ✅ |
| deferred 声明段 | verbatim.ts（3.16.3 采样；master 差异录 05 §4）；集成探针实证进入系统提示词 | ✅ |
| guard 两规矩 + 四段纠偏 + 申报协议 | rules.ts / index.ts（申报四要素按任务书原文：目标路径/命令、目的、危险性自查、替代方案自查）；集成探针实证拦截 | ✅ |
| glm 会话探针跑通方言面 | **集成探针 3/3 绿**（上游 DSH 生产 spine + AgentLoop + 真会话日志）：①身份遮蔽+工具面切换 ②TodoWrite 垫片+10/10 提醒 ③guard 拦截+四段纠偏+原生未执行 | ✅ |
| 违规曲线可记录 | ViolationRecord（时间/规则/工具/会话/纠偏文案）+ onViolation 回调 + guard-audit.spec + 探针实证 deny 落 tool result | ✅ |
| 每步进度记录 | s1-progress.md Round 1-7 | ✅ |

## 已记录偏差（随后续行关闭）

1. **ToolSearch 未出**：随 S3 dsh-toolsearch 行交付（deferred 注册表 + 别名表，官方 registry aliases/searchHint 同构设计已在档）。
2. **首步方言面未生效**：方言初始化在首个 pre-step，晚于首个请求的工具解析——第一步模型看到原生面，原生工具首步调用报 UNKNOWN_TOOL。缓解：真实 glm 通道接入时补创建期 seam。Round 7 探针以热身步绕开并实证（探针文件头有记录）。

## 测试基线

- 本包：33 用例全绿（七套件），tsc 0 错（`npm test` / `npm run build`）。
- 集成探针：reference/deepseek-harness 下 `pnpm exec vitest run packages/test-support/glm-hourness-probe` → 3/3 绿。
