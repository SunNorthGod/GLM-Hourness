# split 设计评审第 3 轮 LOW 意见的处理（R28–R32）

依据：`design-review.md`（第 3 轮，APPROVED）；人对 question-13..18 的决定（question-17 已答 B：两个插件，没有伞包与占位包）；`split` 分支起点 main `53750c8`。
范围：本文件只记决定与落点。`design.md` 不改：question-17 B 的设计增补（`design-addendum-q17b.md`）正在另一条线上按 `design.md` 0.3 写作，改动基准文本会让增补与它的评审对不上；下面的勘误随本文件生效，增补与后续步骤以本文件为准。

| id | 决定 | 理由 | 影响的步 |
| --- | --- | --- | --- |
| R28 | 调整：事实全部接受，按勘误记在本文件，不改 `design.md` | 结论不变；只是依据与并行状态过时。`design.md` 的 §3.1–§3.7、第 5、6 步与合入顺序本来就要被 question-17 B 的增补取代，在基准文本上改条数与状态没有收益，还会挪动增补的引用 | 第 0–2 步无代码影响；第 6、8 步开工时重核 `ui/src/graph/**` 的行号；合入时的结构快照 |
| R29 | 接受 | 主检出上有别的运行的未提交改动时，`npm run build` 会把它们编进产物，L4 验的就不是合入的提交；这条在评审期间已经实际发生过（m8-ui-audit 直接在主检出上改文件） | 合入顺序与 L4 第二轮；第 0–2 步无影响 |
| R30 | 接受 | question-18 选 A：V-01 等 split 合入之后再做、第 5、6 步行名保持路径形式，按 §7.0 的字面会互相等待 | 第 3 步开工前的 UI-MERGE CHECK；第 5 步开工前的行名核对 |
| R31 | 接受 | 事实成立；question-17 B 之后客户端行的位置由 profile 里 `dsh-hourness` 的位置决定，同样会提前 | 第 6 步的文档；L4 第一轮；question-17 B 增补的 profile 切换 |
| R32 | 接受 | 只从目录表推出的「固定行 id」挡不住表与 patch 一起改名；写死的字面清单让改名在评审里一眼可见 | 第 5、6 步（第 2 步建的 `tests/contracts.spec.ts` 那时还没有行可比，不加这条断言） |

## R28 勘误（取代 `design.md` 0.3 的对应文字）

- 依据：第 0–2 步以 main `53750c8` 为起点。`05f0139..53750c8` 是 m8-ui-audit 的修复与项目图提交，碰到的源码是 `src/glm-llm/zcode.ts`、`src/graph/labels.ts`、`panel-row.ts`、`run-control.ts`、`run.ts`、`src/shared/dsh-min.ts`（+2 行）、`src/ui/index.ts` 与 `ui/**`、`locale/*.json`、`knip.jsonc`；第 1、2 步要改的 `src/guard/**`、`src/glm-prompt/**`、`src/toolsearch/**`、`src/graph/reminder.ts`、`live.ts`、`src/shared/graph-service.ts`、`scripts/check-verbatim.mjs` 都不在其中，§2.4 的跨包耦合清单与 §7.0 的行号照旧成立（开工时按 `53750c8` 重核）。
- §3.4：其余覆盖项是七条（`ui-settings-account`、`ui-chat`、`ui-settings`、`agent-default-model`、`permission`、`ui-conversation`、`plugin-market`），`llm-pi-ai` 已由 m1-cleanup 去掉；§0、§4.2.1、§10 里「将由 m1-cleanup 去掉」「m1-l4-and-cleanup 占用桌面时段」都已是过去的事。question-17 B 之后 §3.4 整节由增补重写。
- §10：m8-ui-audit 的修复直接提交在 main 上，进行中；V-01 已暂缓，按 question-18 A 在 split 合入之后做。
- §6.1：`headlineGoal` 在 `ui/src/graph/model.ts`:240；`ui/src/graph/**` 的行号在第 6、8 步开工时按当时的 main 重核。
- §10 增一条：m3-design（`wf_071ccd31136e09c0`）的设计以 split 的目录表、公共库两条规则与 §9 的结构为前提；split 改这些时由编排者通知它。

## R29 的落点

合入顺序（question-17 B 的增补重写合入顺序时照此并入）：
1. 申请桌面时段时，编排者同时确认没有别的运行在主检出上工作。
2. 第 4 项（rebase 与 worktree 门禁）之前、第 5 项构建之前，各查一次 `git -C <主检出> status --porcelain`：只允许 `?? .kiro/`；有别的输出就停下，等对方提交，或交人。
3. L4 第二轮（启用 `glm-hourness/glm-ui` 的那次合入与构建）按同样的顺序查。
4. §7.7 风险表加一行：主检出上的未提交改动被编进 L4 验证的产物 → 上面第 2 条。

## R30 的落点

- 第 3–6 步与第 8 步的开始条件：m8-ui-audit 修复计划（`.agents/tasks/ui-audit/findings.md` §7）里除 V-01 之外的提交都已在 main 上；V-01 按 question-18 A 排在 split 合入之后。
- 第 3 步开工前的 UI-MERGE CHECK 按这一条问，不等 V-01。
- 第 5 步开工前仍读 main 上的 patch：行名是路径形式就按设计做（question-18 A 下应当如此）；已变成包说明符就停下交人。

## R31 的落点

- 宿主行的相对次序不变：profile 里 `dsh-glm-zcode`、`dsh-hourness` 依次占 `dsh-glm-hourness` 原来的位置时，组合出的宿主行顺序与今天相同。
- 客户端行 `glm-hourness/ui` 今天由 `dsh-glm-hourness-ui`（桌面 profile 的第 13 项，9 个 experimental bundle 之后）插入；拆包后由 `dsh-hourness` 的 patch 插入，位置提前到 experimental bundle 之前，`glm-hourness/glm-ui` 同样。插槽带显式 `order`（`ui/src/channel.js` 的设置页与 pill），不受影响；按注册次序排列的界面（右侧栏页面类型列表）可能变。
- 第 6 步：文档写明上面两点。
- L4 第一轮第 6 项加：右侧栏「开始」页里「项目图」入口的位置记录在 L4 记录里，之前打开的面板标签照常恢复（U8）；位置变了只记录，不算失败。

## R32 的落点

- 第 5 步：`tests/contracts.spec.ts` 断言 `scripts/packages.mjs` 里的 11 个宿主行 id 加上 `ui/cordis.patch.yml` 插入的客户端行 id（这时客户端行还不在表里），等于一个写死的数组（今天的 12 个）；preflight 的表自检与组合检查照旧从表读。
- 第 6 步：客户端行进表，比较改为表里的全部行 id 加客户端行 id；数组加 `glm-hourness/glm-ui`，共 13 个。
- 以后加行（§9 B1 的 `glm-hourness/bootstrap`）同时改这个数组。
- 落实（第 5、6 步）：`tests/contracts.spec.ts` 的 `ROW_IDS`，第 5 步 12 项（`f28ca70`），第 6 步加 `glm-hourness/glm-ui` 共 13 项，比较对象改为每个包的宿主行加客户端行。

# split 设计附录第 5 轮评审 NIT 的处理（E01–E03）

依据：`addendum-review.md`（附录 0.5，第 5 轮，APPROVED，NIT 3 条）。三条都只涉及不入库的切换脚本与演练（附录 §2.6），第 5、6 步的提交里没有对应代码；评审写明可以在实现切换脚本或 A3 评审时处理，不需要再出一稿附录。下面的决定随本文件生效，切换脚本按它写，A3 评审按它核对。

| id | 决定 | 理由 | 落点 |
| --- | --- | --- | --- |
| E01 | 接受 | 本机试验的事实成立：`readlinkSync` 返回 `path.resolve(建立时给的目标)`；拿传给 `symlinkSync` 的正斜杠字符串作基准，演练会在没有问题时判失败。绝对目标的目录符号链接与 junction 在 Node 里分不出，按 junction 重建会改变链接类型，要在报告里写明 | 外部事实：`docs/FACTS.md` §3 的 junction 一行已按更正写入（第 5 步 `f28ca70`）。切换脚本：R2 每建一个 `@local` 链接立即 `readlinkSync` 一次，结果记进 `rehearsal.json` 作基准，R3、续跑、R4 与这个基准比较；O 组第 1 条的括号改为「相对目标的是符号链接，按 junction 重建会改变它」，并写明绝对目标的目录符号链接与 junction 分不出、按 junction 重建，点名「重建」时注明「按 junction」 |
| E02 | 接受 | 两个文件都恢复之后、完成标记写出之前中断，重跑 `rollback` 没有分支接受，只能交人；先写「恢复中」能让续跑认出这个状态，判据仍是文件与备份逐字节相同，不放宽 | 切换脚本 `rollback` 第 1 小步：第一次写入之前在记录里写「恢复中」，两个文件都恢复、写锁释放之后改为「完成」；「续跑回滚」接受「恢复中」或「完成」，条件是两个文件都与备份逐字节相同，备份记为「无」的锁文件要求当前不存在；只恢复了一个的仍判为其余情形，退出码 2，交人。附录 §5.1 的 `rollback` 一行按此读 |
| E03 | 接受 | 1800 秒工具超时的不变量只覆盖了 pnpm 那一步；工具调用超时返回后编排者的下一步没有写，立即重跑虽在安全的一侧，但没有给出怎样确认进程已退出 | 切换脚本：第 6 小步与 `rollback` 第 4 小步的 `--dump-default-config` 设 120 秒时限，超时 `taskkill /PID <子进程号> /T /F`，确认进程已不在，退出码 1，重跑从 S2「只重做核对」。合入时段（附录 §4.2 第 8 项、§4.4 整体回滚第 6 项）：工具调用超时返回时不运行任何新命令，先用 `tasklist` 等到运行脚本的 `node` 与 `DeepSeek Harness.exe` 进程都已不在，再读 stdout 已有的部分与最后一次运行的输出文件，按 §4.4 的对应行处理；进程不退出就交人。附录 §5.3 那一行同时引用第 4 小步与第 6 小步的时限 |

第 5、6 步实现中对附录的两处读法（不改设计，记在这里供评审核对）：
- README 的「呈现」一行：附录 §3.4 把它列在第 5 步。第 5 步时客户端仍是 `ui/` 的单包，所以第 5 步只加「包」列并写明 `ui/` 的客户端包，改为两个客户端包放在第 6 步，与代码同一提交，文档不先于行为。
- 客户端源码表：设计 0.3 §2.7 给 GLM 客户端列的是 `ui/src/channel.js`、`ui/src/glm-client.js`；m8-ui-audit 之后 `ui/src/channel-model.ts`（pill 的状态解析，`channel.js` 导入它）也在 `ui/src/` 下，按表自检第 3 条（`ui/src/` 下每个文件恰好属于一个客户端包）登记给 GLM 客户端。
