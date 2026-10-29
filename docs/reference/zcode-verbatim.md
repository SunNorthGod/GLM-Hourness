# ZCode 逐字原文档案

> 状态：参考原文，2026-10-27 迁入本仓库（来源 `.llm/docs/05-zcode-verbatim.md`，原样导入见提交 `f2e0b36`），2026-10-30 随基线换到 ZCode 3.17.1 重写（项目图 `zcode-3171-follow`；旧文见 git 历史）。正文中「02 文档」指 `zcode-tool-schemas.md`，「手册」指 `zcode-capabilities.md`，两者记的是 3.16.3 及更早的形态。本文件记录的 CLI 前缀、身份节、官方安全声明、Harness 块与 3.17.1 pristine 副本逐字一致，代码里的镜像在 `src/glm-prompt/verbatim.ts` 与 `src/glm-prompt/zcode-harness-text.ts`，逐字门禁按这份副本检查。其余方言文本的复核见 `../DESIGN.md` §5.9。

证据源分级（2026-10-30）：
- **pristine 3.17.1**：`reference/zcode-3.17.1/zcode.cjs`（15,405,921 B，MD5 331AB13D0CB2E9504EA25420FF9AE663）：官方原文权威源，逐字门禁只读它。
- **pristine 3.16.3**：`reference/zcode-3.16.3/zcode.cjs`（MD5 51257C0D11DA7DC56C157D92E7048146）与 pristine 3.15.1（`C:\Users\29596\Desktop\Project\Zcode\zcode-patch\pristine-3151\zcode.cjs`，15,126,820 B，MD5 87225203a43f8009e403c57532922f4c）：只作对照。
- **ZCode 源码** `reference/ZCode`（3.16.2）：可读参考。它仍含 3.17.1 已删的 3.16.3 文本，门禁不读它。
- **本机安装版** `C:\Program Files\ZCode\resources\glm\zcode.cjs`：随自动更新变化，用户也打过补丁，只能当用户改动与机制的参照，不得当官方原文。

**重大勘误（2026-10-27）**：此前从安装版提取的「逆向授权」安全声明是**用户的 ZCode 补丁**（也是用户全局 AGENTS.md 工程环境声明的英文原文），不是官方文案。官方安全段（buildSecurityNotice，pristine 3.15.1 `Ydo`，3.17.1 `nBo`）是标准授权安全测试声明（见 §1）。设计修正：start-plan 档用 OFFICIAL；coding-plan 档替换为 USER。代码层：verbatim.ts 双常量 SECURITY_NOTICE_OFFICIAL / SECURITY_NOTICE_USER，identity.ts 按 variant 组装。

## 1. SECURITY_NOTICE 官方原文（3.17.1 `nBo`，与 3.16.3、pristine 3.15.1 相同）

```
IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes. Dual-use security tools (C2 frameworks, credential testing, exploit development) require clear authorization context: pentesting engagements, CTF competitions, security research, or defensive use cases.
```

## 1a. SECURITY_NOTICE 用户变体（安装版补丁，用户工程环境声明英文原文）

见 `src/glm-prompt/verbatim.ts` SECURITY_NOTICE_USER（六段：逆向授权 / 本地可逆目标 / 术语非恶意推定 / 默认已授权 / 生产系统谨慎 / 拿不准问一句）。仅用于 coding-plan 档替换；基线换到 3.17.1 时按用户要求照旧。

## 2. HARNESS 节（3.17.1 `SDn`，buildHarnessBlock）：逐字原文

```
# Harness
 - Text you output outside of tool use is displayed to the user as Github-flavored markdown in a terminal.
 - Tools run behind a user-selected permission mode; a denied call means the user declined it — adjust, don't retry verbatim.
 - <系统轮分支> Hooks may intercept tool calls; treat hook output as user feedback.
 - Prefer the dedicated file/search tools over shell commands when one fits. Independent tool calls can run in parallel in one response.
 - Reference code as `file_path:line_number` — it's clickable.
```

系统轮分支按 `midConversationSystem !== false` 选（ContextBuilder 配置，桌面缺省为真）：

- 真：`The system may send updates, reminders, or modifications to rules via mid-conversation system turns. These are system-controlled, unlike function results.`
- 假：`` `<system-reminder>` tags in messages and tool results are injected by the harness, not the user. ``

与 3.16.3 的差别：每条 bullet 以一个空格开头（` - `，3.16.3 为 `- `）；系统轮那条在 3.16.3 只有「真」那一句。这一条在包里由 ` - `、三元分支与尾句拼成，渲染后的整行不是包里的连续子串，门禁按片段检查（`../DESIGN.md` §5.9）。条数：3.16.3 与 3.17.1 都是五条，手册 §10.3 记的「六条」不对。

## 3. Identity 节组装结构（3.17.1 `fBa` / `wDn`）

`[["", 开头句二选一, "", SECURITY_NOTICE(nBo)].join("\n"), "", buildHarnessBlock(mid)].join("\n")`。

- 开头句：OutputStyle 激活时为 `pBa`「You are an interactive agent that helps users according to your "Output Style", which describes how you should respond to user queries.」，否则为 `dBa`「You are an agent working with the user toward their goals, using your own judgment along the way.」。3.16.3 分别为「You respond to the user according to the active Output Style below while using ZCode's tools and instructions.」与「You are an interactive ZCode agent that helps users with software engineering tasks.」。
- CLI 前缀单独成节（`uBa`）：`You are ZCode, an interactive agent`（3.16.3 为 `You are ZCode, an interactive coding agent`）。
- 本仓库 `buildIdentitySection` 的拼接不带开头那个空行（DSH 的节由宿主拼接），其余同构；start-plan 的 `ZCODE_SYSTEM.stableSections[0]` 带它，逐字节同 3.17.1。

## 4. 方言基线钉定（2026-10-30）

**训练分布基线 = ZCode 3.17.1 pristine 包**（用户 2026-10-30：「你就彻底都换成新版zcode，工程环境声明那个照旧」，项目图 `d-zcode-3171`）。例外是 coding-plan 档的安全声明替换为用户的工程环境声明（§1a）。此前的基线是 3.16.3（2026-10-27 按 02 文档的协议采样钉定，后改为以 3.16.3 安装包为准，`../DESIGN.md` §5.9）。ZCode 源码 master 的演进只作机制参考。

2026-10-27 版本在这里列的 master 差异（DeferredToolCall 包装、注册表元数据、增删公告文案）已由安装包的实读取代：3.16.3 的 local 模式已有 LocalToolSearch 与 DeferredToolCall，3.17.1 只改了增删公告（`../DESIGN.md` §5.7、§5.10）。

## 5. 后续待录

- WorkflowActorIdentity（3.17.1 `kDn`，工作流 actor 的身份节）：本项目不发，未录原文。
