# ZCode 逐字原文档案

> 状态：参考原文，2026-10-27 迁入本仓库（来源 `.llm/docs/05-zcode-verbatim.md`，原样导入见提交 `f2e0b36`）。正文中「02 文档」指 `zcode-tool-schemas.md`，「手册」指 `zcode-capabilities.md`。复核（2026-10-27）：本文件记录的 CLI 前缀、身份节、官方安全声明、Harness 块与 ZCode 源码（`reference/ZCode`，3.16.2）、pristine 3.15.1 逐字一致；本机 3.16.3 安装包除用户补丁的安全声明外也一致。用户确认安装版打过补丁。其余方言文本的复核见 `../DESIGN.md` §5.9。


证据源分级（2026-10-27 勘误后）：
- **pristine 3.15.1**：`C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3151\zcode.cjs`（15,126,820 B，MD5 87225203a43f8009e403c57532922f4c）——**官方原文权威源**。
- **本机安装版**：`C:\Program Files\ZCode\resources\glm\zcode.cjs`（15,247,142 B）——**用户打过补丁，只能当用户改动的参照，不得当官方原文**。
- 手册基准 3.16.3（15,245,023 B）pristine 副本本地没有，需要时另行获取。

**重大勘误（2026-10-27）**：此前从安装版提取的「逆向授权」安全声明是**用户的 ZCode 补丁**（也是用户全局 AGENTS.md 工程环境声明的英文原文），不是官方文案。官方安全段（pristine `Ydo`，buildSecurityNotice）是标准授权安全测试声明（见 §1a）。设计修正：start-plan 档用 OFFICIAL；coding-plan 档才替换为 USER（替换这才有了真实语义）。代码层：verbatim.ts 双常量 SECURITY_NOTICE_OFFICIAL / SECURITY_NOTICE_USER，identity.ts 按 variant 组装。

## 1. SECURITY_NOTICE 官方原文（Ydo，pristine 3.15.1 实证）

```
IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes. Dual-use security tools (C2 frameworks, credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases.
```

## 1a. SECURITY_NOTICE 用户变体（安装版补丁，用户工程环境声明英文原文）

见 `src/glm-prompt/verbatim.ts` SECURITY_NOTICE_USER（六段：逆向授权 / 本地可逆目标 / 术语非恶意推定 / 默认已授权 / 生产系统谨慎 / 拿不准问一句）。仅用于 coding-plan 档替换。

## 2. HARNESS 节（pristine Jvn = 安装版 okn，两源一致）——逐字原文

```
# Harness
- Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.
- Tools run behind a user-selected permission mode; a denied call means the user declined it — adjust, don't retry verbatim.
- The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results. Hooks may intercept tool calls; treat hook output as user feedback.
- Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.
- Reference code as `file_path:line_number` — it's clickable.
```

勘误：手册 §10.3 记「Harness 节六条」，实测本补丁版为**五条**（3.16.3 基准版可能六条或计数口径不同，以会话采样复核为准）。

## 3. Identity 节组装结构（iua）

`[开头句二选一, "", SECURITY_NOTICE(d0o), "", HARNESS_BLOCK(okn)].join("\n")`；开头句：OutputStyle 激活时为 "You respond to the user according to the active Output Style below..."，否则 "You are an interactive ZCode agent that helps users with software engineering tasks."。

## 4. 方言基线钉定（2026-10-27）

**训练分布基线 = 3.16.3 协议采样**（02 文档）。master（2026-10-20）的演进不进方言层，只做机制参考。已识别的 master 差异：
- deferred 机制：local 模式下引入 **DeferredToolCall** 包装（搜索加载 schema 后经 DeferredToolCall{name,input} 调用，非直接调用）；3.16.3 采样为「加载后直接调用」。逆向手册 §3.2 的 DeferredToolCall 挂账就此关闭（master 已实证其形态）。
- 注册表元数据有 aliases / searchHint——与 dsh-toolsearch 设计的别名表同构。
- 声明文案：master 的 added/removed 通知文案（exposure.ts:17-21,195-196）与 3.16.3 采样不同；方言层用 3.16.3 版。

## 5. 后续待录

- HARNESS_BLOCK（okn）全文（本次已捕获片段，待完整导出）
- WorkflowActorIdentity（cua 附近，"# Working inside a workflow" 段已见开头）
- 八件套 schema 在本补丁版的复核（以会话采样为准）
