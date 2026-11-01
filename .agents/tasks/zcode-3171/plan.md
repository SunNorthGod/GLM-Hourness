# 实施计划：GLM 通道跟到 ZCode 3.17.1（zcode-3171-follow）

依据 `.agents/tasks/zcode-3171/diff.md`（旧文/新文/镜像常量/改什么逐处给出）。在 worktree `c:\Users\29596\Desktop\Project\GLM-Hourness\.worktrees\zcode-3171`（分支 `zcode-3171`，从 Job 1 合入后的 main 建）里实现。**相对路径落在父工作区，务必用绝对路径或以 worktree 为 cwd。** `reference/` 不入库，worktree 没有，门禁与 start-plan sidecar 测试经 `scripts/reference-dir.mjs` 读主检出 `c:\Users\29596\Desktop\Project\GLM-Hourness\reference\`（`zcode-3.17.1/zcode.cjs`、`zcode-api/`）。

一件事一个提交，提交信息带节点 id `zcode-3171-follow`。每个提交后 `npm run build && npm run preflight && npm test` 全绿才进下一个。提交顺序把「门禁钉死到 3.17.1」放在所有文本更新之后：安装目录当前已是 3.17.1，文本更新阶段门禁读安装目录即按 3.17.1 校验，中间提交保持绿；最后一步把来源锁到 committed 副本并去掉 3.16.2 兜底，成为真关卡。

验证命令（项目真实命令，`DESIGN.md`/`DEVELOPMENT.md`）：`npm run build`（tsc + 契约 + 两包产物）、`npm run preflight`（目录表/清单/组合）、`npm test`（含 `check:verbatim`、`lint`、`check:secrets`、全部 spec、graph smoke）、`npm run probe`（L3，改运行时行为时）。grep 不算验证。

- [ ] 1. 版本号 3.16.3 → 3.17.1。
      `src/glm-llm/identity.ts` 的 `ZCODE_APP_VERSION` 改 `'3.17.1'`（diff §1）；把断言含 `3.16.3` 字面的测试改 `3.17.1`：`tests/glm-transport.spec.ts`、`tests/glm-zcode.spec.ts`、`tests/glm-auth.spec.ts`、`tests/glm-project-token.spec.ts`、`tests/glm-signing.spec.ts`。
      Files: src/glm-llm/identity.ts, tests/glm-transport.spec.ts, tests/glm-zcode.spec.ts, tests/glm-auth.spec.ts, tests/glm-project-token.spec.ts, tests/glm-signing.spec.ts
      Verify: `npm test` — 上述 spec 全过（通道身份/签名/令牌用例断言新版本）。

- [ ] 2. 身份节（CLI 前缀、身份两句、Harness 节重构）→ 3.17.1。
      `verbatim.ts`：`CLI_PREFIX`、`IDENTITY_OPENING_PLAIN`、`IDENTITY_OPENING_WITH_STYLE` 改新值，删 `HARNESS_BLOCK`（diff §3.1–§3.3）。新建镜像文件 `src/glm-prompt/zcode-harness-text.ts`（逐字片段 + `buildHarnessBlock(mid)`），加进 `scripts/check-verbatim.mjs` 的 `MIRROR_FILES`、从 `loadItems` 删 `HARNESS_BLOCK` 项。`localize.ts`：`HARNESS_BLOCK_DSH` 改为用镜像片段 + GUI 首 bullet + 系统轮分支 2。`identity.ts`：`buildIdentitySection` 改引用。测试：`tests/check-verbatim.spec.ts`（MIRROR_FILES）、`tests/glm-prompt.spec.ts`（身份/harness 文本）。
      Files: src/glm-prompt/verbatim.ts, src/glm-prompt/zcode-harness-text.ts, src/glm-prompt/localize.ts, src/glm-prompt/identity.ts, scripts/check-verbatim.mjs, tests/check-verbatim.spec.ts, tests/glm-prompt.spec.ts
      Verify: `npm test`（`check:verbatim` 对身份片段过；glm-prompt spec 过）；`npm run probe`（`glm` 场景系统提示词是 3.17.1 身份/harness）。

- [ ] 3. coding-plan 节文本 → 3.17.1：Context management 删 4 段，Environment/Session guidance bullet 对齐。
      `localize.ts`：`CONTEXT_MANAGEMENT_DSH` 改两段（diff §3.4），`buildEnvInfoSection` 改 ` - ` bullet + invokedLine 末尾空格 + untrusted-files bullet（§3.5），`SESSION_GUIDANCE_DSH` bullet 风格（§3.6，低优先）。coding-plan **不加** Dynamic Behavior（§3.4 决策 D-2）。测试：`tests/glm-prompt.spec.ts`。
      Files: src/glm-prompt/localize.ts, tests/glm-prompt.spec.ts
      Verify: `npm test`（`check:verbatim` 对 CONTEXT_MANAGEMENT_DSH 过）；`npm run probe`（`glm` 场景节文本）。

- [ ] 4. Read 别名文本 → 3.17.1：描述一行 + 部分视图提醒。
      `src/glm-prompt/zcode-tool-text.ts`：`READ_DESCRIPTION_LINES` 第 5 行换新（§5.1）；`readPartialViewRange`/`readPartialViewContinue` 换成 token-cap 片段（§5.2，省 tokens 子句）。`src/glm-prompt/read-alias.ts`：`renderReadWindow` 按 3.17.1 模板填 path/行区间/下一页/Grep，提醒与正文间 `\n\n`。测试：`tests/aliases.spec.ts`；`scripts/probe/run-probe.mjs` 若断言 Read 前缀/部分视图则同改。
      Files: src/glm-prompt/zcode-tool-text.ts, src/glm-prompt/read-alias.ts, tests/aliases.spec.ts, scripts/probe/run-probe.mjs
      Verify: `npm test`（`check:verbatim` 对 Read 片段过；aliases spec 过）；`npm run probe`（Read 工具描述与结果）。

- [ ] 5. 工具检索增删公告 → 3.17.1。
      `src/toolsearch/zcode-text.ts`：`renderToolSearchAnnouncement` 按 `G_t` 重写（MCP/会话/hidden 分支）+ 新逐字常量（§6）。`src/toolsearch/exposure.ts`：`announcementDelta` 补 `hiddenNames`。`src/toolsearch/index.ts`：notice metadata 带 `toolSearchHiddenNames`。测试：`tests/toolsearch.spec.ts`。
      Files: src/toolsearch/zcode-text.ts, src/toolsearch/exposure.ts, src/toolsearch/index.ts, tests/toolsearch.spec.ts
      Verify: `npm test`（`check:verbatim` 对公告片段过；toolsearch spec 过）；`npm run probe`（`glm` 场景延迟工具公告文本）。

- [ ] 6. start-plan 文本 → 3.17.1：`ZCODE_SYSTEM_TEXT` 与 sidecar 同步。
      `src/glm-llm/zcode-system.ts` 的 `ZCODE_SYSTEM_TEXT`：`cliPrefix`、`stableSections[0]`、`dynamicSections.beforeEnvironment`、`dynamicSections.afterEnvironment` 改 3.17.1（diff §4）。同步主检出 `reference/zcode-api/src/proxy/zcode_system.json`（逐键相等）。测试：`tests/glm-startplan.spec.ts`、`tests/check-verbatim.spec.ts`。`DESIGN.md` §4.8 记 start-plan env→meta_user 的结构局限（可并入步骤 8 文档）。
      Files: src/glm-llm/zcode-system.ts, reference/zcode-api/src/proxy/zcode_system.json（主检出）, tests/glm-startplan.spec.ts
      Verify: `npm test`（`check:verbatim` 对 start-plan cliPrefix/stable/dynamic 过；glm-startplan sidecar 逐键相等）。

- [ ] 7. （决策 D-3，保真可选，低优先）coding-plan 保真补齐。
      compact 第 6 条补句（`src/glm-prompt/compact.ts`）、Bash ` for a foreground command` + field-prompt 句（`src/glm-prompt/zcode-tool-text.ts`，不加 "Command output … not reliably to the user"）、todo reasoning-only 轮不计数（`src/glm-prompt/todo-reminder.ts`）、项目令牌新错误码（`src/glm-llm/auth/project-token.ts`、`src/glm-llm/zcode-wire.ts`）。按编排方取舍可整体跳过或拆分；跳过则在 `DESIGN.md` 记为已知差异。
      Files: src/glm-prompt/compact.ts, src/glm-prompt/zcode-tool-text.ts, src/glm-prompt/todo-reminder.ts, src/glm-llm/auth/project-token.ts, src/glm-llm/zcode-wire.ts（视取舍）
      Verify: `npm test`；改运行时则 `npm run probe`。

- [ ] 8. 逐字门禁钉死到 3.17.1（关卡，放在文本更新之后）。
      `scripts/check-verbatim.mjs` `loadReferences()`：只读 `<referenceDir()>/zcode-3.17.1/zcode.cjs`，去掉 `ZCODE_BUNDLE` 安装目录默认与 `reference/ZCode` 源码兜底；文件头注释重写（diff §2）。此步若因遗漏的旧文本变红，回前面补齐再提交。
      Files: scripts/check-verbatim.mjs
      Verify: `npm test`（`check:verbatim` 现只比 3.17.1 副本且全绿；安装目录与 3.16.2 源码都不再能让新版没有的行通过）。

- [ ] 9. 文档批改（同批，diff §9）。
      `AGENTS.md`、`docs/reference/zcode-verbatim.md`、`docs/DESIGN.md`、`docs/FACTS.md`、`docs/DEVELOPMENT.md`、`docs/CHARTER.md`、`README.md`、`docs/ROADMAP.md`、`docs/HANDOFF.md` 的基线/版本/逐字来源/新增能力/已知差异。被取代条款整条重写。
      Files: 上列文档
      Verify: `npm test`（graph smoke 与 svg 字节相同不受影响；文档改动过检查器范围外）；人读核对基线条款。

- [ ] 10. 项目图节点 + 出图（经引擎命令行，不直接编辑；`DEVELOPMENT.md` §12）。
      `zcode-3171`（review，doing）标 done 带证据（差异清单 + 门禁通过 + L4）；`zcode-3171-follow` 按实际状态推进并批注。`npm run graph:render` 出 `docs/graph/graph.svg`，与节点文件同批提交。
      Files: docs/graph/nodes/*.json, docs/graph/graph.svg
      Verify: `npm test`（graph smoke + svg 字节相同）。

验证金字塔（合入前，`DEVELOPMENT.md` §1.1）：
- L1/L2：每个提交 `npm run build`、`npm run preflight`、`npm test` 全绿。
- L3 沙盒探针：改了 `glm-prompt`/`toolsearch` 运行时行为的提交跑 `npm run probe`，`glm`/`glm-graph`/工具检索场景确认 3.17.1 系统提示词、工具面、公告生效。
- 沙盒真实网络：`glmsandbox` 走原生通道发真实请求（积分已预授权），确认返回 200、签名被 ultra 网关接受、`User-Agent: ZCode/3.17.1`（截包只记头名/形状，`.agents/tasks/zcode-3171/` 下不入库记录）。合入 main 前跑一次。
- L4 桌面版（CDP 9333，重启脚本 `.agents/tasks/m1-l4/restart.ps1`；模型选择器默认保持 deepseek-account / deepseek-flash / high）：先关桌面版再合入、build、启动（bundle 文本变、§5 纪律第 4 条）；重启后开一个 GLM 会话正常应答，其系统提示词带 3.17.1 文本（CLI 前缀「interactive agent」、身份新句、Harness 行首空格、Context management 两段）；`/glm-status` glm-llm 生效。节点批注「待 L4」到通过后关。

合入：独立代码评审（同挡路标准 `d-failure-plans`、收敛循环上限 2，针对凭证/签名/认证、guard、图引擎按 §1.1；本任务主要是提示词与门禁，评审覆盖门禁钉定与通道版本）。rebase 到最新 main（与 `m3-implement` 在 `verbatim.ts` 的 `IDENTITY_OPENING_WITH_STYLE` 重叠，后合入者解决冲突）。一个概念一个提交，push 到 Gitee `origin/main`，不强推。

风险与预案：
- start-plan 无额度不可测，只对齐文本、保结构（§4 已知局限）；若将来拿到 start-plan 额度再补结构。
- `x-zcode-session-features`、Dynamic Behavior(coding-plan)、保真补齐是决策项（diff §8），默认不实现/不加，交编排方；改了也可逆（纯文本/头）。
- 门禁钉定后若主检出 `reference/zcode-3.17.1/` 缺失，门禁跳过文本检查（与无参照机器一致），不误判通过——但合入前必须在有参照的主检出上跑过一次绿。

## Orchestrator decisions on diff.md §8 (2026-10-30, agent decisions under the person's instruction 「你就彻底都换成新版zcode，工程环境声明那个照旧」)

- D-1 `x-zcode-session-features`: follow. Compute it from the conversation history as 3.17.1 does (`$yn`, `z1n`, `vTo`, `bTo`), place it between `x-zcode-query-source` and `x-session-id`, send it only when the set is non-empty. Flags whose trigger cannot occur on this channel are simply never set; if a flag's derivation cannot be matched faithfully, leave that flag out and record it as a known deviation in docs/DESIGN.md §4.8. Add a step to the plan for it (own commit, L2 tests against the bundle's derivation, header order checked in the sandbox real request).
- D-2 Dynamic Behavior on coding-plan: follow. Add the 3.17.1 Dynamic Behavior section verbatim at its 3.17.1 position on the coding-plan route, covered by the verbatim gate. The later ablation (question-30) measures it against ZCode's own layout instead of starting from our gap.
- D-3: follow as recommended, including all listed fidelity items; leave out "Command output … not reliably to the user" because it is not true on DSH, and record that as a known deviation.
- The user's engineering environment declaration (SECURITY_NOTICE_USER, coding-plan only) stays exactly as it is.
