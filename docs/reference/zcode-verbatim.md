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

## 6. 不跟 3.17.1 的地方

主 Agent 的人设（设计行 `glm-hourness/design` 的 `persona` 设置，`docs/ORCHESTRATION.md` §3.1）在系统提示词里是一节 `hourness:output-style`（`src/shared/output-style.ts`），GLM 路由上由 `src/glm-prompt/assembly.ts` 的 `rewriteDialectSections` 摆放（`docs/DESIGN.md` §5.2）。3.17.1 对输出风格的做法与它有三处不同，取舍是项目图 `m3-main-persona` 一步定的（M3 附录 §2.7，2026-11-01 写入本文件）。**编排方同意之前，该步不合入 main**（`zcode-3171-follow` 验收第 1 条的做法）；编排方不同意时，只改 GLM 包的 `rewriteDialectSections`、`installDialect` 与本节，设计行不变。

3.17.1 的事实（pristine `reference/zcode-3.17.1/zcode.cjs`）：

- 系统提示词的组装里没有 Output Style 一节。风格激活时只换身份节的开头句：`fBa` 激活时用 `pBa`，否则用 `dBa`（§3）。`docs/reference/zcode-capabilities.md` 记的「Environment、Output Style、Context management」是 3.16.x 的次序。
- 风格正文由 `n8o` 生成：`# Output Style: ${name}`、一个换行、风格文字去掉首尾空白，中间没有空行。它作为上下文条目 `output_style_instructions` 只在主回合（`taskType` 为 `main_turn`）下发。
- 另有一条 `output_style` 条目，正文由 `r8o` 生成：`${name} output style is active. Remember to follow the specific guidelines for this style.`

本项目照 3.17.1 的地方：身份节的开头句在组装带人设一节时用 `pBa`（`IDENTITY_OPENING_WITH_STYLE`，逐字门禁已钉住），否则用 `dBa`；节的标题行与正文写法照 `n8o`，标题后单换行，风格文字去掉首尾空白。

不跟的三处，每处一句理由：

- (1) 风格正文放在系统提示词的一节里（GLM 路由上在 `glm:context-management` 之前；3.17.1 在这里没有节，选这里是因为 3.16.3 在这里，且这一节在会话内不变，放在动态内容之前不破坏提示词缓存），不作为主回合的上下文条目 `output_style_instructions`。理由：验收要求主 Agent 会话的系统提示词带人设一节，DSH 的节在每一步都在，不只主回合。
- (2) 不加 `r8o` 的每回合提醒。理由：正文每一步都在系统提示词里，3.17.1 的提醒是为只在主回合下发的条目补的，这里加它只多花每回合的 token。
- (3) 正文后面多一句范围说明：`This style applies to your replies to the human only. Text you put into tool calls (graph nodes, briefs for subagents) and anything written to files stays plain.` 理由：只让人设管对人说的话，子 agent 的简报、图节点与写进文件的东西保持朴素（验收第 2 条）。这一句是本项目的文字，不是 ZCode 的。

## 7. 压缩续接的原文路径一句（3.17.1 `Bxt`，2026-11-05 录入，任务 `compact-recall`）

`Bxt(e, t = {})`（pristine `zcode.cjs` 14380–14389 行）组压缩后的续接消息：开头一句「This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.」，空一行接摘要 `e`，再按选项依次追加：`t.transcriptPath`、`t.replStateCleared`、`t.suppressFollowup`、`t.preservedMessagesKept`。`transcriptPath` 一支在 14382–14384 行，追加的是两个换行加下面这一句，`${t.transcriptPath}` 换成路径：

```
If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${t.transcriptPath}
```

镜像文件 `src/glm-prompt/zcode-compact-text.ts` 的 `transcriptNote(路径)` 返回这两个换行加这一句，逐字门禁按片段检查它；`tests/compact-row.spec.ts` 从副本里按 `return t.transcriptPath&&(n+=` 那一段抽出模板正文，断言两者逐字节相同。

两处与 3.17.1 不同：

- 位置：本项目把这一句接在 GLM 压缩摘要（「Summary:」之后的正文）末尾，落在 DSH 检查点外框 `<compacted-summary>` 里面、`</compacted-summary>` 之前；ZCode 接在它自己的续接消息里，那条消息的开头句与另外三个选项本项目不用（检查点外框归 `compaction-basic`，`../DESIGN.md` §5.6）。
- 生产路径：3.17.1 包里 `Bxt` 只有一个调用处，14730 行 `Bxt(Oe,{preservedMessagesKept:k.length>0,suppressFollowup:!0})`，不传 `transcriptPath`。所以这句文本是原文，但在 3.17.1 的正式流量里不出现；ZCode 给 hooks 写的 `transcript.jsonl` 只作导出文件形状的参照，本项目的导出格式是自己的（`../DESIGN.md` §2.4「会话原文」）。
