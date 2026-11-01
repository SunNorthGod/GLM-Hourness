# prompt-fixes 独立代码评审

评审对象：分支 `prompt-fixes`（worktree `.worktrees/prompt-fixes`），`git diff 4f6c06b..14820e0`，六个提交：939bf9a、0059e63、7b71a78、e278738、0c7a7a5、14820e0。
挡路标准：`docs/DEVELOPMENT.md` §1.1（验收没满足；不可逆损失没有预防；失败无法发现、无法恢复或查不到原因）。验收取项目图节点 `prompt-fixes` 的四条。

## 第 1 遍（2026-10-30）

挡路发现：0 条。

### 验收逐条

1. 在别的工作区开会话时 `glm:environment` 写那个工作区的目录：满足。`installDialect`（`src/glm-prompt/index.ts`:197–200）经 `sessionEnv`（:131–134）用 `agent.session.header.cwd` 覆盖配置的 `env.cwd`，会话没有记录目录时才用配置值。读的字段与 guard 圈禁根相同（`src/guard/index.ts`:92–96），该字段已经过 L4（2026-10-28 相对路径事故的修复）。rc.3 在 `ReactLoopAgent` 构造时设好会话（`reference/dsh-desktop-0.2.1-rc.3/dsh-agent-loop/lib/index.js`:771–774），`agent/created` 由 registry 的 `announce` 在之后发出（`dsh-agent/lib/index.js`:573–586），所以安装时能读到会话头；会话头不可变，节文本在会话内不变，提示词缓存每步稳定。子 agent 的会话头继承父会话的 `cwd`（`dsh-subagent/lib/index.js` `childSessionMeta`:344–355），子会话同样写对目录。L2：`tests/dialect-wiring.spec.ts` 新用例覆盖有、无会话目录两种情况，提交信息记录它在基线上失败。桌面版 profile 的 `glm-prompt` 行配了 `env.cwd` 为本仓库、`tier: coding-plan`（只读核对 `~/.dsh/profiles/desktop/cordis.patch.yml`:55–61），正是这次修复的场景。真机表现要在批次 L4 看。
2. guard 的拒绝信息里没有指向不存在通道的说法：满足。`src/guard/rules.ts` 删掉 `APPLICATION_PROTOCOL`，圈禁与 `file-tools-only` 的例外段改为 `ASK_THE_HUMAN`（:56、:94、:144）。`src/` 下已无 `file a request`、`application protocol`、`reversibility`；图文件门禁的例外段（`src/guard/graph-files.ts`:98）指向面板、relay 与人手改，都是存在的途径，本次未改。`ORCHESTRATION.md` §6.1 同批改写。
3. `DESIGN.md` §5.2、§5.3、§5.8 与实际一致，逐字门禁覆盖 `dynamicSections`：满足。§5.2 新表的次序与 `rewriteDialectSections`（`src/glm-prompt/assembly.ts`:26–55）一致：CLI 前缀最前，身份节原位替换，其余方言节按 `dialectSections()` 数组次序（environment、persona、session-guidance、memory、context-management）插在身份节后；表中列出的 `order` 值与代码一致（persona 2360，`src/glm-prompt/persona.ts`:24）。§5.3 加 Dynamic Behavior 一行，§5.8 加第 19 项，与 `buildStartPlanSystem`（`src/glm-llm/start-plan.ts`:100–109）只在 start-plan 通道发这一节相符。门禁 `loadItems`（`scripts/check-verbatim.mjs`）加入 `ZCODE_SYSTEM.dynamicSections` 的两节，`tests/check-verbatim.spec.ts` 断言前缀、稳定节与动态节的每段文本都在受检条目里；记录的运行 444 条、受检 285 行（基线 442 / 269）。
4. 门禁、探针全过：门禁部分满足。`pass1-build.log`、`pass1-preflight.log` 退出 0；`pass1-test.log` 中 check-verbatim `OK against bundle + source (main checkout)`，eslint、knip、jscpd 对照基线通过，check-secrets 无发现，全部 spec 没有 `fail` 非零或 `not ok`，graph:smoke ok；与 14820e0 提交信息记录的 `fix-*.log` 一致（652 过、0 失败）。探针由工作流的下一步（沙盒探针）跑，本遍不判；节点在探针通过前不能关。

### 两处本地变通

上一个代码步为让 `npm test` 通过做了两处变通（e278738 提交信息有记录）：

- 变通一：`ZCODE_BUNDLE` 指向 `zcode.cjs.orig-3163.bak`。已正式解决。0c7a7a5 新增 `scripts/reference-dir.mjs` 的 `referenceDir()`：检出自己有 `reference/` 就用自己的（主检出行为不变），否则用 `git rev-parse --path-format=absolute --git-common-dir` 的上一级，即主检出的 `reference/`；git 不可用或主检出也没有时返回自己的路径，门禁按"没有参考源"处理，与改动前相同。门禁默认的安装包路径没变。记录的运行不设 `ZCODE_BUNDLE`、worktree 里没有 `reference/`，门禁报告标 `source (main checkout)`，条目与受检行数与变通时的运行相同。`DESIGN.md` §5.9 删去 `ZCODE_BUNDLE` 的说法，并纠正了 7b71a78 里"安装包与 `zcode.cjs.orig-3171.bak` 同大小"的不实描述。
- 变通二：把 `reference/zcode-api/src/proxy/zcode_system.json` 复制进 worktree。已正式解决。14820e0 让 `tests/glm-startplan.spec.ts` 经 `referenceDir()` 读这个文件，断言不变；记录的运行里该文件没有复制进去，spec 7/7。`DEVELOPMENT.md` §9 写明 worktree 里读参考源的两处与做法。

两处解决都不复制、不链接、不设环境变量，也不放宽任何检查：主检出读到的仍是自己的 `reference/`，worktree 读到的是同一批文件。

### 非阻断

- `glm:environment` 里的 git 仓库、平台、shell、系统版本、`additionalDirectories` 仍取配置（`DESIGN.md` §5.3 ③ 已写明）。桌面版配置把 git 仓库写成是，所以在不是 git 仓库的工作区里开会话，这一行仍不对。验收只要求目录；要改可以另提节点。
- start-plan 通道的 Environment 节（`src/glm-llm/zcode.ts`:409 `resolveEnvPromptInfo(this.options.env)`）的工作目录仍取通道配置，不随会话。它不是 `glm:environment`，不在本节点验收里；桌面版用的是 coding-plan 档。
- 节点正文还有一项"M3 设计 §3.1.3 第 5 项与 §3.5.1 第 4 步的推荐项排序按 `d-recommend-last` 改写"，不在本分支，也不在验收里。M3 附录 0.2 的 §2.4、§2.7 已按 `d-recommend-last` 写；关节点时由编排方确认是否算已覆盖。
- 门禁在主检出与 worktree 里通过，靠的是 `reference/ZCode`（3.16.2 源码）补上安装包升到 3.17.1 后缺的 3.16.3 文本行。这是 main 上已有的状况，由 `zcode-3171-follow` 处理，不是本分支引入的。
- 不属于本分支的观察：主检出根目录有一个未跟踪文件 `msg-refdir-gate.txt`（2026-10-30 00:29:08，407 行），内容是 M3 设计附录 0.2，与本任务提交信息的文件名相同。它不影响快进合入；建议编排方查明来源后移到对应任务目录。
