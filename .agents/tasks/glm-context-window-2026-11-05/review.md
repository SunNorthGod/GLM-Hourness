# 评审：glm-context-window（a2019c3，分支 glm-context-window）

范围：`git diff origin/main...HEAD`（合并基 56887cb，单提交 a2019c3，9 个文件）。对照任务原文与项目图节点 `glm-context-window` 的三条验收。挡路标准按 d-failure-plans：验收未满足、不可逆损失无预防、失败发现不了或恢复不了或事后查不到原因。

结论：APPROVED，无挡路发现。

## 验收逐条

1. 配置项与缺省：`src/glm-llm/index.ts` `Config.contextWindow` 缺省 512000，范围 128000..1000000 写进 schema 说明；`ZcodeAdapter` 不传时也取 `GLM_CONTEXT_WINDOW.default`（512000）。不配置时 `resolveModel` 声明 512000，与改动前的字面量相同。没有新增行，行内没有开关。满足。
2. 配置生效与降级：`resolveModel` 的 `context.contextWindow` 取配置值；`codingPlanWire` 主步窗口取 `Math.min(declaredWindow, rule.contextWindow)`；压缩（20000）、辅助（5000）、start-plan（DSH 的 `maxTokens`）路径没动，`token-budget.ts` 公式没动。非法值（越界、非整数、字符串、布尔、对象）经 `contextWindowOf` 回落 512000，激活状态 `degraded`，原因写出原值与范围，控制台告警一次，每次会话上报也带这句并把 `active` 降为 `degraded`。`contextWindowOf` 不抛错。满足。
3. 测试与探针：L2 钉住缺省 512000（声明与激活原因）、配置值生效（声明、主步 `min`、上限截到目录 1,000,000）、非法值降级并出声（五种值，含会话上报）、压缩与标题与 start-plan 不变。L3 探针 420/420。桌面版重启属于合入后的批次 L4，按 DEVELOPMENT.md §1.1 合入后节点保持进行中并批注「待 L4」，不挡本次评审。

## 抽查核对过的依据

- schema 的 `union([natural().min().max(), any()])`：读了 vendored schemastery 的 union 解析（逐个分支尝试，`any` 收下其余值）与 DSH `app-boot` 配置投影器（union 投影为 `anyOf`，前一个分支不改写输入，不报限制、不抛错）。越界值能到达 `apply`，Loader 不会整行拒收。
- 下限 128000 的理由：DSH `compaction-basic` `resolveCompactSpec` 在 128000 窗口、默认 `max_tokens` 32000、缺省余量 65536 下压力预算 30464 > 0，保留 15360 < 阈值，不抛错，与 DESIGN.md §4.6 的说法一致。
- 偏离说明的 3.17.1 事实：在 pristine `reference/zcode-3.17.1/zcode.cjs` 里读到 `W9a` 内 `v=o.properties.contextWindow` 交给 `P9o`，`P9o` 公式与 3.16.3 `aUo` 相同，`Rqa=32e3`，`contextWindow:` 后唯一字面量是 `2e5`。与提交说明、DESIGN.md §4.6、FACTS.md §1 新增两行一致。
- parity 测试的改动：原先钉 1,000,000 窗口的近窗用例改为缺省 512,000 下的值，并新增配置 1,000,000 还原 3.17.1 取值的用例；提交说明写明这是有意的行为变化。逐字文本与 `check:verbatim` 不受影响（没有提示词或工具文本改动）。
- 合并冲突：origin/main 自合并基以来只改了 `docs/graph/` 下的文件，本分支没碰，文档三处无重叠。

## 门禁记录（读提交说明，未重跑）

build 0；preflight 0；test 首跑 1（worktree 缺被 gitignore 的 `.agents/tasks/m5/lessons-seed.json` 夹具，与本改动无关），补夹具后重跑 0，182 个 spec、3161 通过、0 失败；lint 棘轮 eslint 73 / knip 18 / jscpd 1 未上升；probe 0，420/420。夹具是 gitignore 文件，不在提交里。

## 不挡路的记录

- 插件管理器表单：`contextWindow` 投影为 `anyOf[整数区间, 任意]`，表单未必渲染成普通数字框。探针里 glm-llm 行是禁用的，真宿主 Loader 收下越界值、行降级这条只在 L2 对 vendored schemastery 验过。批次 L4 时顺带看一眼该项在插件管理器里的样子，并试一个越界值确认行仍加载且显示部分生效。
- 缺省 512000 下，用量估算在 383,000 到 DSH 压缩阈值（约 409,600）之间时主步 `max_tokens` 低于 128000，这是任务要求的 `min` 行为，DESIGN.md §4.6 已写明。
- 用户若在 DSH 会话侧把 `maxTokens` 设到接近窗口，`compaction-basic` 会对该路由抛配置错误；这属于 DSH 侧配置，且错误可见，不在本改动范围。
- worktree 缺 gitignore 夹具导致 `npm test` 首跑失败，属于开 worktree 的流程问题，可另记。
