# docs-at-hand 合入前门禁与评审记录（2026-11-09）

范围：`6fff4c29` 收尾提交没跑过门禁；本运行按 HANDOFF §10 第 2 条追 main、跑四道全量门禁（DEVELOPMENT.md §5.9）、对照设计 0.3（同目录 `design.md`）做收敛评审。不合入 main（经验行出厂启用，合入改桌面版运行时，桌面窗口由编排方排）。

## 结论

APPROVED（四道门禁全绿、设计 0.3 各条已实现或按批次明确推迟、未发现阻断项）。合入前置条件不变：先关桌面版（DEVELOPMENT.md §5 第 4 条），由编排方在桌面关闭窗口合入。

## 合并

- `git fetch origin` 后 main 领先 1 个提交：`f3cc8bb5`（docs: handoff，只改 `docs/HANDOFF.md`）。
- 合并提交 `1f6edaf0`，ort 策略，无冲突。预期的 package.json test-chain 联合没有发生（main 新提交没碰 package.json）；`eslint-suppressions.json`、`knip-baseline.json`、`.jscpd-baseline.json` 与 main 无分歧，棘轮不需重定。

## 门禁（2026-11-09，工作树 `.worktrees/docs-at-hand`，合并提交 `1f6edaf0`）

探针前置：`GIT_CONFIG_COUNT`、`GIT_CONFIG_KEY_0`、`GIT_CONFIG_VALUE_0` 已清；主检出的三把锁全空，取 `.llm/probe-lock`（owner.txt 持有并每 4 分钟重写），跑完即删。日志在 `.llm/logs/dah-*.log`。

| 门禁 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run build` | 0 | `build-info` 落 `1f6edaf`；两包 dist 与 client 半重建 |
| `npm run preflight` | 0 | 目录表 2 包 16 源目录；dsh-glm-zcode 5 行、dsh-hourness 15 行、20 行组合 |
| `npm test` | 0 | 3,296 用例全过 0 失败；逐字门禁 502 段 0 已知偏差（301 行受检）；ESLint 73 条压制、knip 18 条、jscpd 1 处 7 行（与 main 棘轮相同，无上调）；gitleaks 8.30.1 无发现（HEAD 1,130 提交） |
| `npm run -s probe` | 0 | 450/450 通过；`glm-lessons-path`、`non-glm-lessons-path` 各 6 条核对全 PASS（U3 的「紧跟工具结果」顺带核销）；四个旧经验场景随本批重跑全 PASS（§5.8、评审 N3）；日志 `.llm/logs/dah-probe-20261109-191712.log` |

探针结果：450/450（上一基线 438 加两条新场景各 6 条核对）。

### 过程事故（不影响分支代码）

第一次后台启动探针的 shell 里命令替换失败把日志变量留空，重定向报错退出；但它的 `npm run -s probe` 进程留在了后台且无锁（PID 10332，运行目录 `…probe-2026-11-09T11-16-11-*`）。处置：杀掉该进程，按仓库惯例用 `rmdir /s /q` 拆掉其运行目录（junction 不跟随，工作树 `packages/*` 完好核对过），持锁重跑的一次（PID 62356）为正式测量。教训记一句：后台运行的脚本里，命令替换的结果不要串进关键路径（日志路径、锁路径），失败要显式报。

## 评审（对照 design.md 0.3）

设计四件在本支的去向：

| 件 | 设计条 | 状态 |
| --- | --- | --- |
| 一、组件目录旁放什么 | §4 | 格式部分实现：`ORCHESTRATION.md` 新增 §8.7（节次序、6 KB 建议、不放修改历史/待办/决策正文、无第二个文件）；生成部分（模板常量、简报句、接管扫描批注）按 §11 第 3、4 批推迟，理由即设计原文「等 M7 合入 main」「本轮不写没人用的代码」，图节点 `docs-at-hand-gen` 标题带「等 M7」 |
| 二、按路径送到手边 | §5 | 实现：`src/lessons/path.ts`（监听器）、`src/lessons/docs.ts`（纯函数）、`failure.ts` 共用记录、`storage.ts` 备注键 `path`、`index.ts` 装卸与行健康 |
| 三、同步核对 | §6 | 推迟（等 M7，§6 开头「本轮不实现」；`docsGaps` 未写，`src/execute/` 零改动），图节点 `docs-at-hand-sync` 标题带「等 M7」 |
| 四、每日漏提交漏推送 | §7 | 实现：`src/loops/defaults.ts` 一条 `loops.unsynced-daily` |

逐项核对：

1. **两条提醒共用一份已推送集合（任务点名项）**：`PushedBy = WeakMap<Session, Map<key, historyLength>>` 在 `index.ts` 创建一次、传给两个安装函数；`toldTo` 认两种来源（`FAILURE_SOURCE` 的 `lessons` 与 `PATH_SOURCE` 的 `keys`），键按「推出时历史长度 == 现在长度」算在途（同一步并行调用互斥），历史走了而键不在历史里算被压缩摘掉、可以重说——与 §5.4 的语义逐条对应。`lessons-path.spec` 的第 138、154 两条分别测了压缩重说与失败匹配说过的经验不再由路径提醒说；正文按「路径@内容摘要」去重（§5.4）、`keep` 句按会话加组件一次、正文改了重送，都有断言。
2. **18:05 条目（任务点名项）**：文字与 §7.1 逐字一致，`git --no-optional-locks status --short` 在内，无 `limits`、无 `quiet`、`wake: true`；`loops-bind.spec` 断言它经对账成为 DSH 的 `daily 18:05` 选择器、无占位符；`loops-registry.spec` 条目表 4→5、无宿主贡献时即 active。「不能在探针/标定运行目录里跑起来」成立，机制是 headless 模板既不挂 `dsh-schedule` 也不挂会话控制器（`run-probe.mjs` 探针场景自身断言「没有定时服务就没有板的任何提醒」），标定走同一 headless 模板；到点叫醒只待 L4（§7.4、§9 U5）。
3. **无新 `glm-hourness/docs` 行（任务点名项）**：`cordis.patch.yml` 相对 main 只改一段注释（四条改五条），行数 15 == 15；`src/shared/`、`ui/`、locale 零改动；经验行关则路径提醒随关，无独立开关（§5.6）。
4. **L2 覆盖**：`lessons-docs.spec`（组件认法各形状、决策节读法、图事实、渲染逐字、截断上限）、`lessons-path.spec` 十条（原生与别名、组件三种位置、无 DSH 基线补送、读 AGENTS.md 本身不带正文、一次调用一条、并行只一份正文、失败预案与行健康、行关则关）、`lessons-failure.spec` 断言零改动（本地 `tool()` 夹具上移共享 `lessons-row-host.ts`，与 §5.8「不改一条断言」一致）。
5. **L3 场景**：`glm-lessons-path` / `non-glm-lessons-path` 工作区带根 `AGENTS.md`（评审 N1 的基线缺口）、组件列一个决策 id、种图（决策 + 写入范围覆盖组件的任务带 source 连线）、一条带文件模式的经验；核对点含 U3（提醒紧跟工具结果）、正文只达模型一次（GLM 由行送、原生路由由宿主送）、第二次读不说、写后只多保持一句。
6. **文档归档（§12）**：`ORCHESTRATION.md` §8.6 路径提醒一条、§8.7 新节、§18.5 默认条目表五条；`DESIGN.md` §2.4a `tools/post-execute` 行加经验行路径提醒；`FACTS.md` §3 加一行（含 N1 的「基线不生成」一句与〔实读〕待 L3 补测的标注）。§11 第 2 步的「ORCHESTRATION 与 FACTS 同批」满足。
7. **旧经验探针场景合入前重跑（§5.8，评审 N3）**：已随本次全量探针重跑，四场景全 PASS，新提醒没有让它们的断言变红，工作区不需要避开带文件模式的路径。

非阻断观察（不改）：

- 跨向去重（路径提醒说过的经验不再由失败匹配说）由 `toldTo` 同一函数保证，显式断言只测了设计要求的方向（失败匹配说过的 → 路径不说）；两向共用一份键空间，风险按零记。
- §5.3 已接受的残留重复（同一组件既被别名触碰又被按名直接调用时正文两份）保持设计原状，别名缺口修好那批再改（§9 U7）。
- §9 未核实清单：U3 本轮 L3 已核（两路由的提醒都紧跟这次工具结果），可销；U1、U2、U5（L4）、U7、U8 仍开着（U8 补测脚本仍在 `%TEMP%`，锁空闲时可跑）。

## 提交

- `1f6edaf0` merge origin/main（`f3cc8bb5`）
- 本评审记录随下一个提交推 `origin/docs-at-hand`
