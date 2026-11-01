# M3 设计附录的独立评审（第 2 轮，评 0.2）

评审对象：`.agents/tasks/m3/design-addendum.md` 0.2（2026-10-30 00:26 本地时间写入，即 2026-10-29T16:26Z）。

对照：M3 设计 `.agents/tasks/m3/design.md` 0.4 与 §15（D1–D6）；`.agents/tasks/design-context.md`；`AGENTS.md`；`docs/DEVELOPMENT.md` §1.1；plain-ui 设计 `.agents/tasks/plain-ui/design.md`（文件头 0.4）、`mockup-wish.svg`（22:24，未变）、`design-review.md`（P3-02，以及第 4 轮的 P4-01、P4-04）；`.agents/tasks/prompt-audit/report.md`；图节点 `m3`、`m3-1` 至 `m3-6`、`m3-main-persona`、`d-option-card`、`d-recommend-last`、`d-interview-cards`、`d-plain-questions`、`d-zcode-3171`、`question-19`、`question-26`、`question-29`、`question-31`、`question-39`，以及编排方在评审期间转来的四个新人定 `d-one-main-agent`、`d-main-agent-shell`、`d-main-agent-models`、`d-auto-drive`（都在 2026-10-29T16:34Z 写入，晚于附录 0.2）；main `b8aeb33`（与附录依据的 `9c71ed0` 之间只有 `docs/graph/` 的改动）；`reference/dsh-desktop-0.2.1-rc.3/`。

挡路标准：`docs/DEVELOPMENT.md` §1.1（`d-failure-plans`）。只有三类挡路：验收条件没有满足（本轮把派发说明列的覆盖要求与人定事项当作验收条件）；不可逆损失没有预防；失败了没有途径发现、没有恢复办法或事后查不到原因。主机制与人定直接相反的记 HIGH，其余挡路的记 MEDIUM，不挡路的记 NIT。编排方要求把附录与新人定的冲突记为发现，交下一稿处理。

结论：CHANGES_REQUESTED。HIGH 1，MEDIUM 2，NIT 9。第 1 轮的 4 条 MEDIUM 与 12 条 NIT 全部关闭；挡路的三条都来自附录写完之后才到的人定，或与并行设计共用的同一个字段。

## 第 1 轮发现的复核

| 第 1 轮 | 状态 | 依据 |
| --- | --- | --- |
| M1 `ask_human` 的选择题没有取决于与结论行 | 关闭 | §2.7 参数加 `background`、`crux`、`verdict`、`dimension`、`weight`；第 7 条规定带推荐的单选题必填 `crux`、`verdict` 与每项的 `gain`、`cost`；规则挪进 `src/graph/card-rules.ts`，引擎与 `ask_human` 共用，卡面用同一个 `choiceDetail`；L2、L3 都有缺 `crux` 被拒的一例。挪动的细节见 N2、N4 |
| M2 `reportingDepth` 带默认值，旧键读不到 | 关闭 | §2.6 两个键都不带默认值，`apply` 取 `reportingDepth ?? persona ?? 'balanced'`。核对 `src/shared/schemastery.ts`:535–544（只有 `meta.default` 存在时才填值）与 :814–823（值为空且原对象没有这个键时，结果里不放这个键）：规整之后哪个键在，就是用户写了哪个键，告警判据成立；L2 经 `Config(raw)` 规整后再调 `apply` |
| M3 「如果失败：」并进前一节 | 关闭 | 第 9 步加 `PARSED_LABELS`，`designColumns` 与五键卡都用它切节，门禁仍只看三栏；第 5 步不再提这一行；L2 有评审给的那段正文 |
| M4 拷回清单不全 | 关闭 | 第 8 步：每次运行一个系统临时目录，整批之后整棵树原样拷回（含 `ws/.git`），核对相对路径与字节数一致才删；只删 `pending.json` 里记着、在系统临时目录下、带前缀的路径；失败保留并可 `--collect`；§4、§5 有对应行。运行目录名今天是 `${task.id}--${model}[--k]`（`scripts/calibrate/run-calibrate.mjs`:227），`openRun(batch, name)` 照用即可 |
| N1 `DeferredToolCall` 一例 | 关闭 | 改为返回工具错误、文件不存在；核对 `src/toolsearch/exposure.ts`:39（`Write` 常驻）与 `src/toolsearch/index.ts`:161–165 |
| N2 `oneOf` 一句 | 关闭 | §10 已删 |
| N3 §7 漏行 | 关闭 | 加了 14、537、1095，另加 160、804；逐行核对 0.4（1,234 行）这些行号指到所说内容 |
| N4 plain-ui 版本 | 关闭 | 文件头写明 0.4 修订中、按当前草图核对；黄字按草图；P2 记进 §8 第 4 条 |
| N5 开场画面上看不到退出 | 关闭 | §2.5 第 2 种情形；L2 与 L4 截图各一项。核对 conversation client.js:17381–17383（阶段判定）、:17612（开场画面）、:19346–19347（`conversation.composer.dock` 只在 `variant === 'composer'` 时渲染） |
| N6 同节合并与同文件串行 | 关闭 | 第 11 步与 `m3-main-persona` 一步都写了 |
| N7 模拟人 `decisions` 说法 | 关闭 | §2.7 末段已统一 |
| N8 「下一步」的步序 | 关闭 | §2.3 对照表带步号；只缺 `goal:supersedes` 时不写；L2 两例。`choice` 一行的写法见 N5（本轮） |
| N9 `persona.name` 多行 | 关闭 | §2.6、§4、§5 |
| N10 写工具手写别名 | 关闭 | 按 `toNativeTool` 的原生名判，常量只有 `['write', 'edit']`；核对 `src/shared/dialect.ts`:30–33、:70–83 |
| N11 预选说法与后缀清单 | 关闭 | 「第一项带后缀时才预选」；各处清单都有三种后缀 |
| N12 第 12 步（b）问人的格式 | 关闭 | 按表格卡写好；人若改了卡片格式，按新格式写同样的内容 |

## 覆盖要求逐项

| 要求 | 附录位置 | 结果 |
| --- | --- | --- |
| `question-26` C：去掉 `Write`、`Edit` 与别名、`str_replace_editor` 的写操作，编排层组装时去掉，guard 照旧拦 shell 写入 | §2.1；第 3、4 步 | 覆盖。`d-main-agent-shell` 之后 git 改工作区的命令成了缺口（M1） |
| `m3-1` 验收第 4 条：`/wish` 入口醒目，按 plain-ui 的位置与字句、`conversation.input.dock` | §2.5；第 11 步；第 12 步（b）第 6 项 | 覆盖，plain-ui 0.4 修订中已注明。`d-one-main-agent` 之后，有主 Agent 的项目里别的会话发 `/wish` 的行为没有设计（H1） |
| `question-31` C：身份节只留角色与边界（约 1k–1.5k 字符），访谈与写图格式随阶段提醒与工具结果下发，会执行的规矩一句 | §2.2、§2.3 | 覆盖。第一部分实测 1,256 字符；整节约 2,420，多出的是 `d-plain-questions`（人定，点名了身份文本）要的例题与换词表，理由写在 §2.2 与 §10 |
| `m3-main-persona`：只给主 Agent；GLM 路由进 Output Style 槽位并换 `IDENTITY_OPENING_WITH_STYLE`，其他路由普通的节；子 agent 与文件不带；插件不带人设文字；汇报细度改名 | §2.6；`m3-main-persona` 一步 | 覆盖 |
| `d-option-card`：设计工具出的题用表格版字段，推荐放最后，建在 card-fields-table 之上 | §2.4、§2.7、§2.9 | 覆盖（`e22282f` 已在 main）。`background` 的形状与存法和 plain-ui 不一致（M2） |
| 主 Agent 用强一档模型，`/wish` 入口与流程条提醒 | §2.5 | 覆盖。后半句与 `d-main-agent-models` 有出入（N1） |
| §8 第 3–12 步的改法，按固定布局与评审名单 | §3 | 覆盖：3–10、访谈选择题、`m3-main-persona` 在 `.worktrees/m3` 串行；第 11 步在 `.worktrees/m3-flow` 并行、`m3-main-persona` 之后合入 `m3`；独立评审给 4、5、6、8、9 与访谈选择题 |
| P3-02：一个接缝、两种做法对照、归到访谈选择题、之前各步不写死推荐放第一或 `(Recommended)` | §2.7；第 3–10 步的约束 | 覆盖。图上 `d-interview-cards` 已是人定（relay「B」，即 P3-02 的 A），附录按人定实现 A 并保留接缝与 B 的对照，做法正确；B 落地时第 3、5 步的一条断言会失败（N6） |

## 发现

### H1 HIGH 每个会话都能开主 Agent，与 `d-one-main-agent` 相反

位置：附录 §0 没有这一项；§2.2 身份节第一句「the main agent of this session」；§2.5 的 `WishCard`、`WishPill` 按会话判定；第 3 步沿用 0.4 §3.1.1 的 `/wish` 表与 0.4 §2.3「一个工作区可以有多个主 Agent 会话」；第 7 步沿用 0.4 §3.5.2 的通知集合与「两个主 Agent 会话 A、B 焦点在不同目标下」的测试。

问题：`d-one-main-agent`（人定，relay「一个项目有且只有一个主Agent做为和人对话的窗口，开那么多会话没用」）定：每个项目恰有一个主 Agent 会话；已有主 Agent 时在别的会话发 `/wish`，告诉人主 Agent 在哪个会话，并可以把它移到当前会话，原会话变回普通会话；这一细节由编排方定、人可推翻。节点正文写明「M3 的 /wish 实现……随之改写」。附录 0.2 写完 8 分钟之后这条才到，所以附录里主 Agent 仍是纯会话级状态：投影 `hournessMainAgent` 只看本会话的命令事件，第二个会话发 `/wish` 照样成为主 Agent，同一张图上可以有任意多个主 Agent。这是 m3-1 的主机制，第 3、7、11 步与 L3 场景都建在它上面。

改法（写定下面这一种，记进 §10 作为编排方定、人可推翻的事；`d-one-main-agent` 正文把细节交给编排方）：

- 「项目」就是图目录：`service.dirFor(cwd)`，按 §3.5.2 的 `sameDir` 规整（realpath，win32 转小写）。
- 持有者记录：设计行在项目目录（与违规流水同一个，`dataHomes(ctx, config.home)`）下写 `design/main-agent.json`：`{sessionId, graphDir, since, commandId}`，先写临时文件再改名。
- `isMainAgent`：0.4 的判定（不是委派子会话，待生效状态或投影为真）之外，再要求记录的 `sessionId` 等于本会话 id。记录读不到或形状不对时只按投影判，行健康 degraded「主 Agent 的持有者记录读不到：<原因>」（写入规则照旧 fail-open，同 0.4 §6.2）。
- `/wish` 表在「图目录不存在」之后加三行：
  1. 记录指向别的会话，且那个会话还在（`agents.get` 活着，或 `sessions` 里有它）：success「这个项目的主 Agent 在会话「<标题>」（<id>）。在这里输入 /wish here 把它移过来，那个会话会变回普通会话」；本会话的角色不变，不写待生效状态。
  2. `/wish here`：把记录改为本会话，再按「空」或「一句话」一行开启；原会话活着时由 harness 对它执行 `commands.execute(原 agent, '/wish off', [], signal)`，它的投影随之为假；不活时，设计行在它下一次 `agent/created` 里发现「投影为真、记录不指向它」，同样执行一次 `/wish off`。所以客户端照旧只读投影（流程条、`WishCard`、`WishPill` 不改读法），同一时刻至多一个会话的投影为真（未打开的旧会话除外，它打开时就对齐）。
  3. 记录指向的会话已不存在：直接接管，回复里说一句「原来的主 Agent 会话已经不在了」。
  持有者执行 `/wish off` 时删记录。`/wish` 的 `input.hint` 改为「off | here | 一句话」。
- 身份节第一句改为「You are the main agent of this project: the human's one conversation with the project and its project manager.」（第一部分仍在 1,500 以内，单测照钉）。
- §3.5.2 的候选集合缩成持有者一个会话；第 7 步「两个主 Agent 会话 A、B 焦点在不同目标下」与「两个主 Agent 焦点在同一目标下都收到」两例改为「投影为真而不是持有者的会话收不到」；两个工作区的那一例保留。
- `WishCard` 第 1 种情形的正文不变（点了就是 `/wish`，指向与移动由命令的回复说）；`tests/wish-entry.spec.ts` 不受影响。
- L2（`tests/design-mode.spec.ts`）加：第二个会话发 `/wish` 得到指向、角色不变；`/wish here` 之后记录换人、原会话（活的）收到 `/wish off` 的命令事件；原会话不活时在下一次 `agent/created` 对齐；记录指向已不存在的会话时接管；记录损坏时按投影判并报 degraded。L3 加一个两会话场景（探针 provider 的 `line` 步对第二个根会话发 `/wish`、`/wish here`）。
- §9「不做的事」加一行：harness 到点提醒主 Agent 做晨报、周报与巡检（`d-one-main-agent` 后半）属于 M5/M7（`m7-7` 随之改写），M3 只保证同一时刻只有一个会话是主 Agent。
- §8 加一条给编排者：`m3-5` 验收第 2 条写的是「焦点在别的目标下的……主 Agent 会话」，一个项目只有一个主 Agent 之后，同一张图上这一半不再出现（别的工作区那一半照旧）；要不要改字句是改验收（必须问人的第 1 类），由编排者决定是否带人的原话改。

### M1 MEDIUM 主 Agent 用 git 改工作区文件不被拦，与 `d-main-agent-shell` 的理解不符，且有不可逆损失

位置：§2.1 第 3 段与 §6 第 1 行（「主 Agent 不写文件」由执行边界兜底）；第 4 步（规则、判写同 0.4）；§2.2 身份节第一部分第二段。

问题：

- `main-agent-no-write` 的 shell 判写沿用 file-tools-only 的 `shellWrites`，后者明确不把 git 当写命令（`src/guard/rules.ts`:123–126：「git subcommands are never write commands」）。0.4 §10 把「改工作树的 git 子命令」记为残余缺口。
- `d-main-agent-shell`（人定，relay「主Agent可以用git，命令行等，只是不能写文件而已」）放开了 git 与命令行，正文写编排方的理解（待人确认）：会改动工作区文件的命令（合并、回退、切分支、改写文件的脚本）本身就是写文件，照同一条规矩拦；只读的（log、status、diff、跑测试）都可以。git 被明说可用之后，主 Agent 会更常用它，而 `git checkout -- .`、`git reset --hard`、`git clean -fd`、`git stash` 会丢掉人或子 agent 还没提交的改动，属于 §1.1 第二类（毁掉检出，没有预防）。附录 §6 说「主 Agent 不写文件」有执行边界兜底，对这些命令不成立。

改法：

- `src/guard/main-agent.ts` 加 `gitWorktreeWrite(command, dialect)`，用 `src/guard/shell.ts` 同一个引号感知的切分，只认命令位置上的 `git`：子命令是 `checkout`、`switch`、`restore`、`merge`、`rebase`、`pull`、`cherry-pick`、`revert`、`am`、`clean`、`rm`、`mv`、`stash`（`list`、`show` 除外）、`apply`（带 `--check`、`--stat`、`--numstat`、`--summary` 之一时除外）、`reset`（带 `--hard`、`--merge`、`--keep` 之一时）、`worktree add|remove|move`、`submodule update` 时算写。`main-agent-no-write` 与 `design-before-release` 都调用它；file-tools-only 不改（普通会话的行为不变）。`status`、`log`、`diff`、`show`、`blame`、`grep`、`fetch`、`branch`（不带 `-d`、`-D`、`-m`）、`commit` 放行（0.4 第 4 步的「`git commit` 放行」一例保留）。
- 纠偏的事实一句：`You tried to change files in the working tree through git: "<命令>" (git <子命令>).`，越界、正路、例外同 0.4。
- 身份节第一部分第二段加一句：`You may run the shell and git to read, test and inspect; a command that changes files in the working tree counts as writing.`（第一部分仍在 1,500 以内）。
- §10 加一条：git 子命令清单是编排方对 `d-main-agent-shell` 的理解（节点正文写明待人确认），人推翻时删掉 `gitWorktreeWrite` 的调用即可；§8 加一条请编排者在问人时一并确认。
- L2（`tests/design-guard.spec.ts`）：主 Agent 的 `git status`、`git log`、`git diff`、`git commit -m x` 放行；`git checkout -- README.md`、`git reset --hard`、`git stash`、`git clean -fd`、`git merge x` 被拒并进违规流水；放行之前的子 agent 对同一组命令被 `design-before-release` 拒；普通会话的 `git checkout` 照常（file-tools-only 不变）。L3 `glm-design-main` 加两步：`Bash git status` 执行，`Bash git checkout -- README.md` 被拒。

### M2 MEDIUM `background` 的形状与存法和 plain-ui 定的待决字段不一致

位置：§2.4（`decision_card.background`「非空，至多 600 码点，可以多行；它是待决的正文」，提议 `body: background`）；§2.7 第 2 条（`ask_human` 同样 600 码点）；§5 第 1 行。

问题：

- plain-ui 0.4 §4.2（:433）把背景定为待决节点的新字段 `background`：一行、不超过 150 个码点（`PLAIN_LIMITS.background`），面板只读这个字段、不从正文拆（§3.8.1 第 2 条），人定的待决缺它时写法检查第一阶段警告、第二阶段拒绝。plain-ui 第 4 轮评审 P4-01 把这一点列为三份设计共用的契约，并指出 M3 附录的写法与它冲突。
- 照附录做，`decision_card` 留下的待决没有 `background` 字段：人关掉卡片之后，这张题在面板「需要你」里没有背景段，`d-plain-questions` 要的「每道题先交代前因后果」在面板上做不到（附录 §2.9 说两种卡是同一张表，这里不同）。plain-ui 切到第二阶段后，引擎拒绝 `decision_card` 提的每一张人定待决；工具不收 `background` 之外的写法，模型照提示改不了，只能等改代码（§1.1 第三类：没有恢复办法）。600 码点、多行的背景也会被 150、一行的上限拒绝。
- 今天的引擎拒绝未知字段（`src/graph/format.ts`:90–92「is not a known field」），所以在 plain-ui 第 1 步合入之前，`decision_card` 写不了这个字段。

改法：

- 长度与形状只有一个来源：`src/graph/schema.ts` 的 `PLAIN_LIMITS.background`，谁先合入谁建（M3 第 6 步先做时按 plain-ui §4.2 建 `PLAIN_LIMITS = { title: 40, why: 80, background: 150 }`，plain-ui 照用；plain-ui 按 P4-01 改了数值，M3 跟着读）。`decision_card` 与 `ask_human` 的 `background` 规则改为「去掉首尾空白后非空、一行、不超过 `PLAIN_LIMITS.background` 个码点」，§5 与第 6 步、访谈选择题的 L2 同改。附录例题的背景 53 个码点、一行，不用改。
- 存法：引擎认 `background` 字段之后（plain-ui 第 1 步），`decision_card` 提议时写 `background` 字段；之前写进 `body`。第 6 步按开工时 main 上的引擎二选一实现，并在 L2 钉住：有字段时 `node.background` 等于参数、`body` 不再重复它。
- §2.9 的表加一行「背景的形状与存法：`PLAIN_LIMITS.background` 与待决的 `background` 字段（plain-ui 第 1 步）」；§8 第 4 条给 plain-ui 的回话改为「M3 照 plain-ui 的字段与上限写，P4-01 定下的数值 M3 跟着读」。

### NIT

N1 `d-main-agent-models`（人定：所有子 agent 的模型由主 Agent 派活时选，主 Agent 自己用强一档模型的提醒照旧）之后，§2.5 黄字、`/wish` 成功回复与 `docs/ORCHESTRATION.md` §3.5 那一句里的后半「子 agent 用便宜的就行」告诉人去挑子 agent 的模型，与新定法不符。M3 还没有派活工具，子 agent 的模型今天由 DSH 的设置决定，所以改法是删去后半句，只留「主 Agent 用强一点的模型」；`docs/ORCHESTRATION.md` §3.5 补一句「子 agent 的模型由主 Agent 派活时选（`d-main-agent-models`，M7）」。字串都在 `ui/src/wish/model.ts` 与 `/wish` 的回复里，`tests/wish-entry.spec.ts` 的「黄字」断言同改。

N2 `verdictKeys` 会被挪两次：附录访谈选择题一步把它挪进 `src/graph/card-rules.ts`，plain-ui 第 2 步把它挪进 `src/graph/verdict.ts` 并改成 `verdictMarks(verdict): {key, index, length}[]`（plain-ui §4.2 :436、§10.2 第 2 步）。改法：`card-rules.ts` 不定义结论行的解析；`src/graph/verdict.ts` 不存在时，访谈选择题一步按 plain-ui §4.2 的签名建它（引擎改用 `verdictMarks(v).map(m => m.key)`），`card-rules.ts` 从它导入；已存在时直接导入。§7 或第「访谈选择题」一步的依赖写这一句。

N3 换词表会有两份：附录的 `PLAIN_WORDS`（`src/graph/plain-question.ts`）与 plain-ui `jargon` 规则的词表（`src/graph/plain.ts`，§4.3 :475，多一个「附录」，英文含 `gate`、`projection`）。§6 写「例题与换词表只定义一次」。改法：`PLAIN_WORDS` 的 `avoid` 按 plain-ui 的词表补齐（含「附录」与英文的 `gate`、`projection`、`addendum`），并在 §8 第 5 条写明 plain-ui 的 `jargon` 从 `PLAIN_WORDS` 读，不另写一份；谁先合入谁建、另一方导入。

N4 `card-rules.ts` 的选项检查要带一个「必填」参数：引擎的 `optionRefusal` 对缺 `gain`、`cost` 一律拒绝（`src/graph/engine.ts`:309–323），`ask_human` 只在带推荐的单选题上必填。另外引擎对 `label` 只查长度、不查一行，`ask_human` 第 5 条要一行。改法：§2.7 写出 `optionTextRefusal(option, subject, at, {required: boolean})`，引擎传 `true`、`ask_human` 按第 7 条传；`label` 的一行检查留在 `askHumanRefusal` 里（引擎的错误文字因此不变）。

N5 §2.3 对照表的 `choice` 一行写「Next: ask 「两三条路，各一句利弊，加上推荐」」：这是 §4.2 表对第 7 步的描述，不是问人的话，模型可能照字面问人。改法：`choice` 不走「ask 「<问句>」」的模板，写 `Next: present two or three ways with decision_card, each with what it gets and costs, the recommendation last.`；L2 加一例只缺 `choice` 时的正文。

N6 §2.7 说人若推翻改成 B，「之前各步不动」。但第 3 步钉「整节不含 `ask_user_question`」、第 5 步钉「所有阶段的正文都不含 `ask_user_question`」，而 B 的 `askLine` 要点名它，这两条断言在 B 下会失败。改法：两条断言改为对去掉 `INTERVIEW_CHANNEL.askLine` 之后的文字判断（第 3、5 步还没有 `askLine`，结果相同）。

N7 §8 第 1、2 条写「编排者正在写图」：图上 `m3-1`、`m3-2` 的第 3 条已在 2026-10-29T15:33Z 按建议文字改好，16:14Z 人重答仍是 B。改法：两条改为「已改（question-39 B）」，只保留「人若重答不同，只改第 3 步与访谈选择题的验收（修订后）」。

N8 第 3 步 L3 只改了 `glm-design-main`、`non-glm-design-main` 的期望。0.4 §9.1.3 的 `glm-design-wish-idle`、`non-glm-design-wish-idle` 请求 1 也写「有 `hourness:main-agent` 与两个设计工具」，第 3 步还没有设计工具。改法：L3 一段把这两个场景也列上：第 3 步只核对身份节，第 6、8 步起依次加上 `decision_card`、`design_review`。

N9 `d-auto-drive`（人定：设计放行之后主 Agent 自己推进，不用 `/drive`）的触发点在 M3：放行写入是 `design_review` 的「批准」一支以 `human` 身份把阶段改为 `release`（`reason` 含 `design_review` 与调用 id）。M3 不做推进，但附录可以在 §9 写一句，说 M7 的驱动循环从这一条历史认出放行，`release` 阶段提醒里「下一步是分解与派发，向人汇报」一句等 M7 落地时改写，免得 M7 另找信号。

## 核实过的假设

1. 依据：`git diff --name-only 9c71ed0 b8aeb33` 与 `eb614ab 9c71ed0` 去掉 `docs/graph/` 之后都为空；`.worktrees/m3`、`.worktrees/m3-flow` 都在 `eb614ab`。
2. 图：`d-interview-cards` approved（14:12:09Z，relay「B」）；`question-39` done、决定 B（15:33Z，16:14Z 重答仍 B），`m3-1`、`m3-2` 第 3 条已是附录建议的文字；`m3-1` 第 4 条原文与附录 §2.5 的理解一致；`d-option-card` 16:21Z 起在对话里试新问法，人回答之前不改；`d-plain-questions` 点名身份文本、`decision_card` 与 `ask_human` 的说明各带例题与换词表。
3. 四个新人定（`d-one-main-agent`、`d-main-agent-shell`、`d-main-agent-models`、`d-auto-drive`）都在 16:34:16Z 写入，晚于附录 0.2 的 16:26Z。
4. 参考文本实测：身份节第一部分 1,256 字符，`PLAIN_QUESTION_GUIDE` 963，A 的 `askLine` 201，合计约 2,420，在三个上限之内。
5. 例题按引擎规则可写入：`label` 7、11 个码点（上限 20），`gain` 8、10，`cost` 12、8（上限 60），`crux` 12（上限 60）；`verdict`「要 → A；不要 → B」按引擎的正则（`engine.ts`:295–297）解析出 `A`、`B`，含推荐 `B`，推荐在最后；`background` 53 个码点、一行；各字段不含换词表上的词。
6. `src/graph/stage.ts`：`labeledSections` 一节到下一个已知标签为止（:61–82），`COLUMN_LABELS` 三项（:146），`designColumns` 的「架构」一项要两节都非空（:157–160），两处要改的标签在 :161、:206。
7. 引擎：`codePoints`、`shortLine`、`verdictKeys` 与几条 `*_HINT` 在 :283–307，`optionRefusal` :309–323（缺 `gain`、`cost` 即拒，`label` 只查长度），`dimensionRefusal` :325–347，`questionRefusal` 的 `crux`、`verdict` 检查在 :390–413；`CARD_LIMITS`（`schema.ts`:55）、`OPTION_KEY_PATTERN`（:195）、`CARD_FIELDS`（:184）。
8. `src/graph/format.ts`:90–92 拒绝未知字段，今天的待决节点不能带 `background`。
9. `src/shared/dialect.ts`：`ZCODE_ALIAS_NATIVES` 把 `Write`、`Edit` 映射到 `write`、`edit`（:30–33）；`toNativeTool` 先问方言服务、再查静态表（:70–83）。
10. 方言把别名注册在 agent 作用域（`src/glm-prompt/index.ts`:189），组装结果里同时有原生名与别名，`rewriteToolFace` 按路由藏一边（`assembly.ts`）；不带 `prepend` 的 `roleFace` 在方言之内，按原生名去掉 `write`、`edit` 会同时去掉别名。
11. `src/shared/schemastery.ts`:466 有 `role` 注解；:535–544、:814–823 的规整行为见第 1 轮 M2 的复核。
12. `userQuestions` 的问题 schema 是严格的 `{id, question, detail?, header?, options?[{label, description?}], multiSelect?}`（user-questions lib/index.js:33–47），`id` 任意字符串，`hourness-decision:<id>` 可用。
13. conversation client.js：排队条 order 20（:17269），开场画面判定（:17381–17383、:17612），`conversation.composer.dock` 只在非开场画面渲染（:19346–19347）。
14. 标定运行器：`HUMAN_TOOLS = new Set(['ask_user_question'])`（:38），运行根在仓库 `.llm/calibration-runs/` 下（:89），运行目录名（:227）。
15. `src/guard/rules.ts`:123–126 的 file-tools-only 不把 git 子命令当写命令。
16. plain-ui 0.4：`background` 字段一行、150 个码点（§4.2 :433）；`jargon` 词表（§4.3 :475）；`verdict.ts` 的移动（§4.2 :436、§10.2 第 2 步）；plain-ui 第 4 轮评审 P4-01 记了同一处背景冲突，P4-04 记了 `ask_human` 归 M3。
17. 0.4 §7 表引用的行号（14、15、38、86、160、241、248、282、283、311、344、494、496、537、557、564、708、752、804、847、968、972、987、1030、1040、1050、1086、1095）都指到所说内容。
18. `mockup-wish.svg` 自第 1 轮之后没有改动（22:24），第 1 轮逐字核对的结论仍成立。

## 没有核实或不成立的假设

- 不成立：一个工作区可以有多个主 Agent 会话、每个会话各自 `/wish`（0.4 §2.3，附录沿用）。`d-one-main-agent` 之后每个项目恰有一个（H1）。
- 不成立：「主 Agent 不写文件」由执行边界兜底（附录 §6 第 1 行）。git 改工作区的命令不被拦（M1）。
- 不成立：`decision_card`、`ask_human` 的背景（600 码点、多行、存在正文）与面板读的待决字段是同一个东西（M2）。
- 不成立（小）：人推翻 P3-02 时之前各步不动（N6）；`m3-1`、`m3-2` 的验收还没写进图（N7）。
- 没有核实（附录已标〔推断〕并列进 L3 或 L4，可以接受）：不同插件在同一个 agent 作用域上的 `system-prompt/assemble` 监听器进同一张表；schemastery 子集里多行文本框的写法；第三方停靠组件收到 `useSession`、`inputActions`、`useInput`；Output Style 节的标题写法与次序在 3.17.1 里是否不变（附录写明实现时对照 `reference/zcode-3.17.1/zcode.cjs`）。
- 没有核实：在空白会话里执行 `/wish` 之后会话是否离开开场画面（§2.5 第 2 种情形不依赖它）。
- 没有核实：H1 改法里 harness 对另一个活会话执行 `commands.execute(…, '/wish off', …)` 在桌面版上的表现（命令事件来源、界面上是否出现这条命令）。探针的 `line` 步已经这样发命令（0.4 §9.1.1），L3 可以核对事件，界面表现要 L4 看。
