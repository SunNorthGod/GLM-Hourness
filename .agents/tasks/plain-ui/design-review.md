# 面板说人话与新手引导：设计评审

评审对象：`.agents/tasks/plain-ui/design.md` 与同目录的五张草图（`mockup-home.svg`、`mockup-plan.svg`、`mockup-drilldown.svg`、`mockup-onboarding.svg`、`mockup-wish.svg`）。
判级标准：`docs/DEVELOPMENT.md` §1「评审挡路的标准」（2026-10-29 用户定，`d-failure-plans`）。只有三类发现定为 HIGH 或 MEDIUM 并挡路：验收条件没有满足（含任务说明、`m3-1` 验收第 4 条、人新给的要求与本稿 §1.4 自己写的验收）；会造成不可逆损失而没有预防；失败了没有途径发现、没有恢复办法或事后查不到原因。其余记为 LOW，不挡路，下一稿改掉或转成提议节点。每条发现写明属于哪一类。
宿主证据以 `reference/dsh-desktop-0.2.1-rc.3/` 为准，写作「包 文件:行」，包名省略 `dsh-` 前缀。

## 第 1 轮（2026-10-29，design.md 0.1）

另收编排方转来的三条人新给的要求（作者写完 0.1 之后才到）：反方一行 `d-counter-line`（人原话「我指的是反方，为什么不选另一个选择」）、计划上的一行事前验尸（等人看样子）、经验板在信息架构里的位置。三条按「验收条件没有满足」一类处理，见 P1-04 到 P1-06。

### HIGH

#### P1-01 开场卡片放进 `conversation.hero.options`，这个槽是工作区那一行右端的紧凑选项区，放不下草图里的卡片

- 类别：验收条件没有满足（`m3-1` 验收第 4 条「显眼的提示」，本稿 §1.4 第 10 条）。
- 位置：§7.5.1 C、§7.5.2、§8「开场卡片」一行、§11.3 L4 第 4 项；`mockup-wish.svg` 场景 ①、`mockup-onboarding.svg` 中部卡片。
- 问题：rc.3 把这个槽渲染在开场画面的工作区行里，排在工作区芯片与 `conversation.hero.agentPreset` 之后（ui-conversation client.js:17852–17884）。这一行是 `display:flex; align-items:center` 的单行（`.heroWorkspaceRow`），槽的容器是 `flex:none; margin-left:auto; display:flex` 的右对齐横排（`.heroOptions`，client.js:17386 的样式表），设计给紧凑的选项控件用。草图把一张约 520×222 的卡片画在工作区行上方、占满输入框宽度，这个位置在 rc.3 里没有对应的槽；照 §7.5.2 实现，卡片会挤在工作区芯片右边，把那一行撑高。本稿要靠这张卡片满足「醒目」，L4 才会发现做不出来，没有预案。
- 改法（二选一，写进 §7.5.2、§8 与两张草图）：
  - A（推荐）卡片放 `conversation.input.dock`（list，session 作用域）。rc.3 在开场画面里也渲染它，位置在工作区行与输入框之间（client.js:17909，`zone` 为 `{session, input}`，会话与输入都在时才渲染）。组件只在会话还是空白时显示卡片，否则返回 `null`；空白的判法写死一条（例：标准 hook `useConversation` 读到的对话没有任何回合，hook 由 client.js:19897–19911 的 `ctx.uiSession.provide` 提供，第三方组件能否拿到与 `inputActions` 同属〔推断〕，L4 核对）。order 写明，排在目标条 10、排队条 20、M3 流程条（本稿 §12 建议 30）之后，例如 40。卡片随会话的第一句话消失这一点改由「空白判定」保证，不再依赖开场画面的卸载。
  - B 槽 `conversation.hero.options` 里放一个与 GLM 按钮同样大小的芯片「交给主 Agent」，点开是与输入框下方 `/wish` 按钮相同的弹层（说明、模型提醒、两个按钮）。合槽的原意，但不如 A 醒目，要在 §14 P5 里写明这一点。
  - 两种都给 L4 第 4 项加一条：截图核对卡片或芯片在开场画面里的实际位置与宽度（窄窗口 1280 宽、右侧栏打开时各一张）。

### MEDIUM

#### P1-02 开场画面里没有输入框下方那一排：「GLM · 上手」与 `/wish` 按钮都不会出现在第一屏

- 类别：验收条件没有满足（任务说明「what the person sees first」与「must work for each plugin alone」，本稿 B1、B4、§1.4 第 9、12 条）。
- 位置：§7.1 表、§7.2、§8「`/wish` 按钮、主 Agent 按钮」一行（写成「是否渲染未核实」）、§11.3 L4 第 4、6 项；`mockup-onboarding.svg` 的「0 轮 · 0 tok」与「GLM · 上手」。
- 问题：rc.3 只在 `variant === "composer"` 时渲染 `conversation.composer.dock`（ui-conversation client.js:19347），开场画面传的是 `variant: "hero"`（client.js:17888）；README 169 行也写「The empty hero dock remains collapsed when it has no content」。这一点读源码就能定，不必等 L4。结果：新会话的第一屏没有 GLM 的入口；只装 `dsh-glm-zcode` 的人在开场画面里看不到任何引导，选 GLM 模型直接发第一句话会先拿到「没登录」的报错，之后才出现按钮。草图画的是不存在的界面。
- 改法：§8 那一行改为〔实读〕「开场画面不渲染」并引上面两处。GLM 在开场画面里另给一个入口：槽 `conversation.hero.options`（session 作用域，正适合紧凑芯片）注册芯片「GLM · 上手」，只在本机没有 `glm-hourness.onboarding.glm.v1` 记录时出现，点开是同一个对话框（芯片拿得到 `sessionId`，可以执行 `/glm-login`）；上手完成或跳过后芯片消失，输入框下方的按钮照旧。§7.1 表、§7.2、§1.4 第 12 条、L4 第 6 项与 `mockup-onboarding.svg` 同步改；两个插件都装时，P1-01 选 B 的话两个芯片在同一个槽里按 order 排开，写明先后。

#### P1-03 定期任务回到已批准后，`graph_open` 立刻把它列为「可以开工」，主 Agent 会马上再派一次

- 类别：失败了没有途径发现（每次运行花积分、读外部网页，事后才在历史里看得出来）。
- 位置：§4.4 `blockersOf` 与 `openItems` 一句（「LLM 与人看到同一个口径」）、§6 D 的细则、§11.1 `tests/graph-repeat.spec.ts`。
- 问题：`listOpenItems` 的 `ready` 是「已批准的任务、没有未关闭的子节点、依赖全部完成」（`src/graph/projection.ts`:296–300）。按 §6，带 `repeat` 的任务跑完一次就带证据回到已批准，于是马上满足 `ready`；主 Agent 的每拍动作就是派发可以开工的叶子（`docs/ORCHESTRATION.md` §2.8）。本稿没有任何地方让引擎或投影知道「还没到期」：人在计划里看到「下次 11 月 5 日」，LLM 在 `graph_open` 里看到的是「可以开工」，两边口径不同，与 §4.4 的说法相反。
- 改法：§6 加一条并进 §4.4、§10.1：`ready` 不列下次到期日在今天之后的定期任务；`openItems` 另给 `recurring`（每项带节点引用、上次跑完的时间、下次到期日、是否已到期），`graph_open` 的工具说明写明「定期任务到期才做」；到期日的计算与 §6「下次到期」同一个函数，宿主与客户端共用，引擎用 `openGraph` 已有的 `now`。`tests/graph-repeat.spec.ts` 加两例：没到期的不在 `ready`、在 `recurring` 里且 `due: false`；到期的在 `ready`。

#### P1-04 反方一行（`d-counter-line`）没有落到面板

- 类别：验收条件没有满足（人新定的要求）。
- 要求（编排方转述）：每张有推荐、由人定的待决带一行字段 `counter`，写选另一个选项的最强理由，引擎会强制（在 m3-base 一并实现）。面板在「需要你」的卡片与节点页显示它，位置在推荐项（最后一项）的下面，用人话，不给眼睛跳到推荐项的捷径。
- 位置：§3.8、§3.5 待决一行、§4.3（写法规则只列了 `title`、`why`、`label`、`consequence`）、§4.4 `optionView`、§1.4 第 7 条、§11.1、`mockup-home.svg` 的卡片。
- 改法：
  - §3.8 写明显示：在最后一个选项的框下面单独一行，字号与颜色同后果，不加框、颜色、图标；前缀用人话（例「不选推荐的理由：」，字句由作者定，写进词表）；读屏顺序在推荐那一行之后；已拍板的待决照样显示；旧待决没有 `counter` 时不显示这一行，不写「没写」。
  - §4.4 `optionView` 多一个 `counterNote: string | null`，仍然没有样式字段；§4.3 的写法检查与图工具说明把 `node.counter`（以及 `graph_edit` 的 `set.counter`）列进人话字段，长度上限写明（建议同 `consequence` 的 120 个码点）。
  - 字段名、类型与引擎核对以 m3-base 合入后的 `src/graph/schema.ts` 为准；本稿写明依赖它，并在 §12 衔接里加一条。
  - §1.4 第 7 条加一句「反方一行在最后一项之下」，L2 钉住 `optionView` 的输出，L4 截一张卡片；`mockup-home.svg` 的卡片补上这一行（与 P1-05 的新草图可以合用一张）。

#### P1-05 计划上的一行事前验尸没有设计，也没有给人看的样子

- 类别：验收条件没有满足（人要先看样子再定，编排方要求本稿给出可选的一行与一张草图）。
- 要求（编排方转述）：方案带一行「如果这件事失败了，最可能是因为……」，作为可选行；给一张同时显示反方一行与这一行的草图。
- 改法：
  - 写明存在哪里（新可选字段，例 `premortem`，一行，长度上限；或设计决策正文里以固定前缀开头的一行，二者选一并说理由）、谁写（agent，过 §4.3 的写法检查）、在哪些节点上出现（目标、特性与设计决策的节点页「怎么做」一节；M3 的放行卡由 M3 决定，写进 §12 衔接）、缺的时候不显示（与「四节总在」的规则区分开）。
  - 在 §14 加一组待人定（例 P7：要不要这一行；放在哪种节点上），推荐放最后。
  - 新增一张独立 SVG（例 `mockup-counter-premortem.svg`），用本项目真实的一张待决与一个特性：卡片上的反方一行、节点页上的事前验尸一行，都用人话。

#### P1-06 信息架构没有给经验板留位置

- 类别：验收条件没有满足（人新给的要求）。
- 要求（编排方转述）：人想要一块经验板（本项目踩过的坑与修法，免得每个子 agent 重新踩），由 M5 以后设计；面板的信息架构要在规则旁边给它留一个位置，它是给人看的，不是给人操作的。
- 位置：§3.2 四层表、§3.3 第 6 条页脚、§7.4 上手页、§7.6、§8、`mockup-home.svg` 页脚。
- 改法：页脚改为「规则 › 经验 › 整张图 › 上手说明 ›」（名字由作者定，用人话）；经验板是第 2 层的一页、只读；没有装上时这一项不显示，判法与规则相同（§7.6 的「在不在、打开它」入口写成两个板块共用的约定）；§1.5 写明经验板本身不在本稿（M5）；首页草图页脚补上。

### LOW

#### P1-07 目标的新标题超过本稿自己的长度上限

§4.5 对照表里 `hourness` 的新标题「让 GLM 在 DSH 里跟在 ZCode 里一样好用，并让 AI 按一套规矩自己推进大项目」是 46 个码点，§4.3 `length` 规则是 `title` 不超过 40。它是首页第一行，P3 改写时（第 4 步，第一阶段）就会拿到警告，切到第二阶段后任何一次带转述改目标标题都会被拒。改法：缩到 40 以内（例「GLM 在 DSH 里跟在 ZCode 里一样好用，AI 按规矩推进大项目」，37 个码点），草图同步；或者给目标单设上限并写进规则表。

#### P1-08 `blockersOf` 把废弃、被取代的依赖算作已解除，并要求 `openItems` 跟着改

§3.4 与 §4.4 把「状态不是完成、废弃、被取代」的依赖算作挡路，`openItems` 也改用它。现行规则是「依赖全部完成」（`docs/ORCHESTRATION.md` §2.9，2026-10-28 批准的原型），代码里 `listOpenItems` 与投影门禁 `gatesOf` 都按 `status === 'done'` 判（`src/graph/projection.ts`:197、300）。这是对已批准规则的改动，§13 第 6 条只写了「算上祖先的依赖」，没提这一点；改了 `openItems` 而不改 `gatesOf`，节点页「它在等的」与投影门禁会说两样话。改法：二选一写明。保持只认完成（依赖不做了时状态行写「等「X」（它不做了，让 agent 看一下）」）；或者把这条改动列进 §13 并让 `gatesOf` 与 §2.9 文档同批改。

#### P1-09 「要等别的先做完」一组的排序在挡路节点不在本页时没有定义

§3.4 写「第一个挡住它的那件在本页的位置，再按创建时间」。挡路节点可以不在本页：不是叶子的特性（例 `m3` 补上依赖后挡 `m3-1` 到 `m3-6` 的是 `split`，今天 `split` 是叶子，以后拆出子任务就不是）、等人批准的提议、别的目标下的节点。改法：写一条后备规则，例「挡路节点不在本页时，取它子树里在本页编号最小的一件；子树里也没有，排在本组最后，再按创建时间」，进 `planOf` 的 L2 用例。

#### P1-10 验收第 2 条的检查测不到它列的全部内容，用的快照也没定

验收第 2 条要求首页、计划、变化三段里没有类型名「特性」「任务」「待决」与英文状态词，检查办法是对生成的文字跑 `plainIssues` 结果为空。`plainIssues` 的 `term` 词表只有「待决、投影、修订号、派发属性、写入范围、决定者」，没有「特性」「任务」，这两个词出现了也测不出来。另外 L2 用「本项目 `docs/graph/nodes` 的快照」：第 2 步写模板时图还没改写（第 4 步才改），快照里有「M3 设计循环最小闭环」这类标题，这个测试在第 4 步之前必然失败。改法：生成文字另跑一个类型词检查（或给 `plainIssues` 加一个只用于生成文字的字段种类，把类型名放进去；「目标」在界面词里另作处理）；写明第 2、3 步用造的图，第 4 步提交时把改写后的真实快照加进测试。

#### P1-11 「上次看之后」在下钻再回来时怎么算没有定

§7.10 把「离开首页」定为首页连续可见 5 秒后变为不可见，又说「打开时读一次」。打开第 2 层的页时首页不再可见，按这条会写下当前时间；回到首页时如果首页重新挂载并重读，刚才没看完的变化就全没了。改法：写明 `since` 在面板页签正文挂载时读一次、在内存里一直用到卸载；第 2 层来回不重读；写下的时间只给下一次挂载用。`tests/graph-panel-model.spec.ts` 加一例。

#### P1-12 没有项目图的工作区里，上手页第 3 块的按钮会引到 M3 的报错

§7.4 的按钮只看 `/wish` 是否已注册；没有项目图时 M3 的 `/wish` 返回「这个工作区还没有项目图：先建空目录 <目录>」（M3 设计 §3.1.1 表）。同一个工作区里输入框下方的按钮按 §7.5.4 不显示，两处规则不一致。第一次打开项目图时，上手页与 §7.8 的没有图的说明谁先显示也没有写（`tests/graph-panel-model.spec.ts` 的规则「没有记录且图上没有人的历史」在没有图时成立）。改法：第 3 块的按钮只在有项目图时出现，没有图时这一块改说「先建一张项目图」并给 §7.8 的入口；写明没有图时第一次打开先显示哪一屏。

#### P1-13 没有项目图的开场卡片在每个没有图的工作区、每个新会话里都出现

§7.5.2 与 §7.9 让这张卡片永久出现。随手开的临时工作区也会一直顶着「这个工作区还没有项目图」，与 B3「不唠叨」相悖。改法：没有图的这一种只在编排层上手记录不存在时出现，或每个工作区只出现一次（本机按工作区路径记一条）；之后只在面板里说明。

#### P1-14 拿不到 `inputActions` 时的退路说了 M3 没有的行为

§7.5.3 与 §9.1 的退路是直接执行不带话的 `/wish`，并提示「主 Agent 接手了，你的下一句话就是愿望」。M3 对空输入的处理是注入「先 `graph_open`，按阶段提醒推进」（M3 设计 §3.1.1 表），没有「下一句话当愿望」这一条，而且这等于把「写一句你想做的」换成了「接着推进现有项目」。改法：退路不执行命令，只显示「在输入框打 /wish，后面跟一句你想做的」并带一个复制按钮（ui-primitives `writeClipboard`，`ui/src/primitives.d.ts`:52）；或在 §12 的 M3 衔接里加一条要 M3 支持这种语义。

#### P1-15 输入框下方那一排会更挤

`conversation.composer.dock` 上已有 DSH 的两个统计（order 0、1）与 GLM 按钮（150）；本稿加「/wish 交给主 Agent」（160），规则设计 §9.1 在同一个槽加在场按钮（「你在 · 2 单在等」）。右侧栏打开时 DSH 的统计今天已经被截断（`ui-audit/final-window-start.png`：「6 轮 13 步 ·...」「282K tok · 缓...」）。改法：标签缩短（例「交给主 Agent」）；写明在场按钮的 order（例 170）与三者的先后；给窄宽度一条规则（例主面板窄于某个宽度时只显示图标与「/wish」）；L4 加一张右侧栏打开时的截图。规则设计已写「实现时一起排版」，这里给出排法。

#### P1-16 规则板放在哪，两份设计互相推给对方

规则设计 §9.2 写「放在哪个位置随那份设计（`m8-plain-language`）……在它定稿之前，最小版按第五个视图实现」；本稿 §7.6 写规则在哪里显示由规则设计定。本稿删掉了四个页签，「第五个视图」没有地方放。改法：本稿 §3.2、§3.3、§7.6 写明规则板是第 2 层的一页，从首页页脚「规则 ›」与上手页第 4 块进入；规则提议与等你放行的等待单是否进「要你定的」写一句（规则设计 §9.2 说提议在「需要你」里拍板）；在场按钮的位置见 P1-15。

#### P1-17 「全部 17 件按先后排好了」说得比实际满

计划里有依赖关系的才按依赖排，其余组内按创建时间（§3.4 表）。首页那句「按先后排好了」会让人把创建先后读成主 Agent 的打算；说明那一句只在第 2 层页头。任务说明要求人话「保持真」。改法：首页写「讲细点 · 全部 17 件」；计划页灰字改为「有依赖的按依赖排，其余按加进来的先后；agent 改了依赖，这里跟着变」。

#### P1-18 新字段的引擎改动没列全

`repeat` 是数，`src/graph/schema.ts` 的 `FieldValue` 没有数这一种；`EDITABLE_FIELDS`、`engine.ts` 的 `LLM_EDITABLE`、`NODE_FIELDS`、`format.ts` 的 `FIELD_CHECKERS`（历史里 `changes` 的校验也走它）、`tools.ts` 的 `graph_propose`/`graph_edit` 参数 schema 与 `graph_edit` 的说明（`tools.ts`:243 列了能改的字段）都要加 `why` 与 `repeat`。改法：§10.1 的「`why`、`repeat`、转换、警告」一行把这些位置写全。

#### P1-19 几处引用不准

`dsh-client-ui-sidebar-right/README.md` 讲 localStorage 的是 74 行，不是 75 行（§7.10、§8）。§8「README 93–97 行（……没有会话在屏上时命令抛错）」：93 行写的是没有注册的 kind 会抛错，「没有会话就没有面板」在 144 行（「No surface without a session」）。改法：改正引用。

### 核实过的假设

- `conversation.hero.options` 是 list、session 作用域，只在有会话的开场画面里渲染（ui-conversation client.js:19954–19957 声明、17880–17883 渲染、17612 开场条件），本稿的行号正确；但它的容器样式是工作区行右端的紧凑横排（P1-01）。
- 开场画面不渲染 `conversation.composer.dock`（client.js:19347、17888，README 169 行），与本稿「未核实」的说法相反（P1-02）。
- `conversation.input.dock` 在开场画面与普通会话里都渲染（client.js:17909）；排队条 order 20（client.js:17269）。
- 会话槽的标准 prop `inputActions` 含 `setDraft`、`insertText`、`captureInsertion`（client.js:14941–14953），由 `ctx.uiSession.provide` 提供 hooks `conversation`、`input` 与 props `inputActions`（client.js:19897–19911）；DSH 自己的 `InputBar` 作为槽组件就是这样收到它的（client.js:18940），第三方组件同样收到仍属推断。
- `sidebarRight` 服务与 `openTab(kind, options)`（ui-sidebar-right client.js:4966、2243）；ui-plan client.js:614 注入、647 调用 `openResource`；没有注册的 kind 会抛错（README 93 行）。
- `remote.commands.list(sessionId)`：ui-commands client.js:1409–1419 要求会话已保留且已打开，子 agent 会话返回空表；宿主侧是 `@Remote list(agent)`（commands typert.host.js:211）。
- `readBytes` 返回 stat 加内容，含 `absolutePath`（workspace-files README 32–35 行，本仓库 `ui/src/dsh.ts`:32）。
- `graphLive` 带 `focus`、`model`（来自 `request/header`）、`tool`（名字与开始时间）、`turnSince`（`src/graph/live.ts`），足够写 `liveLine` 与便宜档提醒。
- 引擎的转换表不许进行中回到已批准（`src/graph/engine.ts`:106 `TRANSITIONS`）；LLM 不能改目标（`engine.ts`:438），带转述可以；`LLM_EDITABLE` 是 `title`、`body`、`slope`、`decider` 与派发属性（`engine.ts`:97）。
- 状态与验证词、操作名与本稿 §4.3 `enum` 一致（`src/graph/schema.ts`）；`projection.ts` 的阶段继承最近祖先（:220），本稿 §12 发现 3 成立。
- 推荐标签与倾向文字的位置：`ui/src/graph/common.tsx`:270、`ui/src/graph/Decisions.tsx`:29；`Panel.tsx` 的 `trail`、`Problems`、`SegmentedTabs`；`model.ts` 的 `presenceText`、`historyText`；`tab.tsx` 的 `Boundary`；`source.ts` 的 `holdSource`。
- GLM 按钮 order 150、设置页 `settings.section`（`ui/src/channel.js`）；「第一次打开、还没读过状态时自动读一次 `/glm-status`」是唯一的自动运行；设置页没有会话。
- 没登录的英文报错在 `src/glm-llm/zcode.ts`:385。
- split 0.3 §2.7 的 GLM 客户端 `sources` 只有 `ui/src/channel.js`、`ui/src/glm-client.js`，不含 `ui/src/channel-model.ts`，本稿 §12 的发现成立；插件页描述在附录「显示信息」表里。
- M3 设计：`design_review`、`decision_card`、投影 `hournessMainAgent`、流程条在 `conversation.input.dock` order 20（M3 设计 §3.6.4）；`/wish` 没有项目图时报错。
- `m3-1` 验收第 4 条的原文在图上（`docs/graph/nodes/m3-1.json`）。
- `/glm-status` 等命令经 `remote.commands.execute` 执行，结果写进会话（`ui/src/channel.js` `runCommand`）。

### 未核实或不成立的假设

- 不成立：开场卡片能以草图里的样子放进 `conversation.hero.options`（P1-01）。
- 不成立：「GLM · 上手」能出现在新会话的第一屏（P1-02）。
- 不成立：`blockersOf` 与现行 `openItems` 同口径（P1-08）；定期任务回到已批准后 LLM 不会马上再做（P1-03）。
- 不成立：空 `/wish` 之后「你的下一句话就是愿望」（P1-14）。
- 未核实（本稿已列进 L4，可以接受）：第三方会话槽组件收到 `inputActions` 与 `useConversation`；`setDraft` 写入的 `/wish ` 回车后被认成命令；`IntersectionObserver` 在右侧栏里的行为。
- 未核实：DSH 自己的首次引导「盖住整个工作区」（settings-account README 62–64 行只说欢迎页与额度页的流程）；不影响本稿的结论。
- 本稿的图数字取自 2026-10-29 上午（122 个节点）；评审时的图已有 129 个节点、开着的 49 个，属于正常变化，P3 执行时按当时的图重新数。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13

结论：CHANGES_REQUESTED。

## 第 2 轮（2026-10-29，design.md 0.2）

评审对象：`design.md` 0.2 与同目录六张草图（新增 `mockup-cards.svg`）。判级标准同第 1 轮。
另收编排方在本轮转来的一条人定（作者写完 0.2 之后才到）：选项卡用表格版（人原话「是表格版」；图上 `m8-plain-language` 2026-10-29T11:42:26Z 的批注，提交 `62562d0`）。按「验收条件没有满足」一类处理，见 P2-01、P2-02。

### 第 1 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P1-01 HIGH 开场卡片放不进 `conversation.hero.options` | 已解决 | 卡片改放 `conversation.input.dock`（order 40）。rc.3 在开场画面里按 `HeroShell`、工作区行、`conversation.input.dock`、输入框的顺序排在同一个 `composerStack` 里（ui-conversation client.js:17901–17911），`zone` 要会话与输入都在（17846–17849）；槽是 list、session 作用域（19938–19941）。消失条件改由会话快照的 `blank`、`promptAttempted`（api-session-controller lib/types/client/sessions/session.js:832–835）与主 Agent 状态保证，退路与 L4 都写了 |
| P1-02 MEDIUM 开场画面不渲染输入框下方那一排 | 已解决 | §8 改为〔实读〕并引 client.js:19347、17888；GLM 开场小按钮放 `conversation.hero.options`（19954–19957，`.heroOptions:empty{display:none}` 在 17386 的样式表里，已核对） |
| P1-03 MEDIUM 定期任务回到已批准后马上被派发 | 已解决 | `listOpenItems(graph, now)` 的 `ready` 不列没到期的，另给 `recurring`；调用方 `engine.ts`:64、`tools.ts`:339、`cli.ts`:74 都列了（核对过只有这三处） |
| P1-04 MEDIUM 反方一行 | 已解决（按改写后的 `d-counter-line`，只对单向门） | §3.8.1 第 4 条、`optionView.counterNote`、§4.3；会被 P2-01、P2-02 的表格版与「取决于」变体重新改写 |
| P1-05 MEDIUM 事前验尸 | 已解决 | 人已定 `question-29` C；存为设计决策正文标签 `如果失败：`，`mockup-cards.svg` ⑦ 画出 |
| P1-06 MEDIUM 经验板的位置 | 已解决 | 页脚、第 2 层只读页、`boards.ts` 登记表 |
| P1-07 LOW 目标标题超长 | 已解决 | 新标题 37 个码点（复数过）；表格格子里的「（37）」见 P2-11 |
| P1-08 LOW 依赖口径 | 已解决 | 只认完成（与 `projection.ts`:197、300 一致），祖先依赖列进 §13 第 6 条并与 `gatesOf`、§2.9 同批 |
| P1-09 LOW 「要等」的排序 | 已解决 | §3.4 排序键与 L2 用例 |
| P1-10 LOW 验收第 2 条测不到类型名 | 已解决；真实快照的用法见 P2-06 | `typeWord` 规则；分步用的图写明了 |
| P1-11 LOW 下钻再回来的「上次看之后」 | 已解决 | `nextSeen` 状态机，按面板可见性算 |
| P1-12 LOW 没有图时上手页第 3 块 | 已解决 | §7.4 |
| P1-13 LOW 没图卡片永久出现 | 已解决 | 每个工作区一次，键取 `sessions.list` 的 `cwd`（api-session-controller lib/client.js:4163，已核对） |
| P1-14 LOW 退路说了 M3 没有的行为 | 已解决 | 复制退路，`writeClipboard`（`ui/src/primitives.d.ts`:52） |
| P1-15 LOW 输入框下方那一排更挤 | 已解决 | order 0、1、150、160、170；520 px 短标签；`data-composer-dock` 在 client.js:19346 |
| P1-16 LOW 规则板位置互推 | 已解决 | 第 2 层的页，§5 末行与 §12 规则一条 |
| P1-17 LOW 计划的说法太满 | 已解决 | 首页与 `mockup-plan.svg` 页头都改了 |
| P1-18 LOW 引擎改动没列全 | 已解决 | §10.1 写全；`FieldValue` 今天确无数（`schema.ts`:77），`HISTORY_FIELDS`（:155）、`FIELD_CHECKERS`（`format.ts`:240）都在 |
| P1-19 LOW 引用不准 | 已解决 | sidebar-right README 74、93、144 行已核对 |

### HIGH

无。

### MEDIUM

#### P2-01 选项卡要改成表格版（人定「是表格版」），0.2 全稿仍是逐项框的卡片版

- 类别：验收条件没有满足（人新定的要求）。
- 要求（编排方转述）：表头「选项 / 怎么做（加粗短语）/ 得到 / 代价」，至多再加一列选项之间真正有差别的维度；所有格子都相同的列删掉；格子用数字与具体例子，不用评价词；每个选项都要给出别的选项给不了的东西，不放凑数的选项。对话里的载体仍是 DSH 问题卡（放不下表格）：按钮是加粗短语，说明里写得到与代价。面板里「讲细点」展开成完整表格。
- 位置：§0 第 3 条、§2.2 词表的选项卡一列、§2.3、§3.8.1、§3.8.2、§3.9.2、§3.9.3、§4.2 选项字段、§4.3 写法规则与长度、§4.4 `optionView`、§1.4 第 7、8 条、§11.1 `optionView` 用例、§11.3 L4 第 1、2 项、§13 第 14 条、§14（本稿自己的待人定也按选项卡格式写）、`mockup-cards.svg` ①–④、`mockup-home.svg` 的卡片。
- 问题：0.2 的每个选项是一个框，加粗短语一行、效果是一行（`consequence`）。表格版把效果拆成得到、代价两列，还允许一列维度，字段、视图模型、可访问性与窄面板排版都要变。m3-base-card 分支上的选项字段只有一个 `consequence: string`（`src/graph/schema.ts` 的 `CARD_LIMITS.consequence` 为 120），这个分支还没合入 main，现在定字段最便宜。
- 改法（下一稿写明）：
  1. 字段，二选一并写理由：(a) `DecisionOption` 加 `gain`、`cost`（各一行，上限进 `CARD_LIMITS`），`consequence` 只留给旧待决读（推荐）；(b) 保留 `consequence`，约定写成「得到：…；代价：…」再由代码拆开（隐式格式，不推荐）。维度列：待决上可选 `dimension`（列名），选项上可选 `value`（格子）。§12 m3-base 衔接加一条：m3-base-card 合入前一起改，或写明本稿在它之后迁移以及旧待决怎样显示。
  2. 视图模型：`optionView` 输出 `columns`（选项、怎么做、得到、代价，加可选的维度列）与 `rows`；某一列所有行的值相同时去掉这一列（L2：两项代价相同时没有代价列）；仍然没有样式字段，推荐行只多 `recommendNote`。
  3. 详略：写明「说重点」「默认」「讲细点」各显示哪些列与行（例：说重点只留选项与怎么做；默认是选项、怎么做、得到、代价；讲细点加维度列、题目的来由与依据）。
  4. 写法规则：§4.3 加「格子用数字与具体例子，不用评价词」。评价词表（例：更好、更稳、更简单、最、优雅、合理、推荐）作为常量规则只查 `gain`、`cost`、`value`；「每个选项给出别的选项给不了的东西」机器查不了，写进图工具说明，引擎只查两项的得到格不能完全相同。
  5. 可访问性与窄面板：写明表格里的单选怎样实现（例：原生 `<table>`、列头 `<th scope="col">`、每行第一格一个同名原生单选，方向键在同名单选之间移动；或 `role="radiogroup"` 内每行 `role="radio"`、`aria-describedby` 指向得到与代价格），读屏顺序写出来。右侧栏可窄到 320 px，四到五列放不下，WCAG 1.4.10 不许二维滚动：给一个宽度阈值，窄于它时每行改竖排（怎么做加粗，下面「得到：…」「代价：…」两行），读屏顺序不变。
  6. 对话里的卡（§3.8.2）：按钮「A · 怎么做」，说明「得到：…；代价：…」；维度列不进对话，或写进说明末尾，二选一。
  7. 先想后看（§3.9）：表格的行按 `neutralOrder` 排，标号按显示位置（另见 P2-03）；推荐行、反方或 P2-02 的结论行折起。
  8. 草图：`mockup-cards.svg` 的面板卡改画成表格（一张删掉了同值列，一张带维度列），并画窄面板的竖排；`mockup-home.svg` 的卡片同步；用本项目真实的题，格子里是数字与例子。
  9. §1.4 第 7、8 条与对应的 L2、L4 项按上面改写。

#### P2-02 「取决于」一行加「是 → X；否 → Y」的变体没有设计，也没有列为待人定

- 类别：验收条件没有满足（同一条人定的未决部分：编排方要求两种都设计、都画进 `mockup-cards.svg`，由人选）。
- 要求：变体一是 0.2 现在的写法（推荐项一行「agent 推荐：…」，单向门再一行反方）。变体二是题目下一行「取决于：<只有人能回答的那一个关键问题>」，表格最后一行「是 → X；否 → Y」，替换为什么与反方两行。
- 改法：
  1. 字段：变体二要 `crux`（一句问题，进 `CARD_LIMITS`）与结论映射（例 `ifYes`、`ifNo` 各是一个选项键；三项以上的题用 `branches: [{answer, key}]`）。写明变体二里 `recommend` 还在不在（agent 对关键问题的猜测）、`why` 与 `counter` 是否不再必填、单向门与双向门是否都用；引擎核对哪些（键存在、两个键不同）由 m3-base 做。
  2. 面板：两行的位置与样式（同表格正文样式，不让某一行更显眼）；先想后看时结论行折不折（它直接指向某一项时等于露出推荐）。
  3. 对话：DSH 问题卡的正文在选项之上，「最后一行」放不到选项之后。写明放在正文末行，还是拆进对应选项的说明里。顺带：0.2 §3.8.2 把「agent 推荐 C：<why>」写在正文、选项之前，人读选项之前先读到推荐，而面板上推荐只在最后一项里出现，两处与 `d-recommend-last`（「靠这种方式强制人读完」）的关系不一致；下一稿两种变体都写明对话里推荐或结论行在选项之前还是之后，以及理由。
  4. §14 加一组待人定（例 P8「为什么与反方，还是取决于」），按 §14 的格式写，推荐放最后；§2.3 与 §13 第 14 条按两种变体分写。
  5. `mockup-cards.svg` 用同一道真实的题并排画两种变体（面板一张、对话一张）。

### LOW

#### P2-03 先想后看按显示位置重排字母，人在对话里用字母回答时会和存储的键对不上

- 类别：失败能被发现、能恢复（变化里写「选 B「说法」」，说法与人想的不同；可以推翻）。
- 位置：§3.9.2 第 3 条、§3.9.3、§13 第 15 条。
- 问题：先想后看时面板上的「B」是显示位置，存储键可能是 C。人在对话里说「选 B」，agent 按键写入，记下的是另一项。本稿 §2.3 自己写了「人用字母回答」。
- 改法：先想后看期间改用数字 1、2、3 标号，与存储的字母不冲突，拍板后回到字母（推荐，最简单）；或者每步投影那一行加一句「这道题人看到的是重排后的字母，按选项说法确认」，卡上也写明。

#### P2-04 只在对话里转述的拍板也会记成「先想后看」，对照数据不准；DSH 之外的编排方拿到 `thinkFirst` 却没有照做的指令

- 类别：事后核对口径不准；`shownOrder` 缺席可以区分，所以不挡路。
- 位置：§3.9.1「计数的拍板」与「复位」、§3.9.3 末句、§3.9.4、§10.1 `tools.ts` 一行、§12。
- 问题：今天的拍板几乎都是对话转述（§1.1）。按 §3.9.4，只要写入前 `thinkFirstOf` 指向这张，引擎就写 `think-first`，哪怕人在对话里看到的是带推荐的普通问法；窗口随之清零，这次阻力其实没加上。本仓库现在的编排方在 DSH 之外，从命令行 `open` 读到 `thinkFirst`，但 AGENTS.md 与图工具说明里没有要它照做的文字。
- 改法：`presentation` 定义为「harness 要求的问法」，另加由请求决定的实际问法（带 `shownOrder` 的面板、卡片拍板为 `think-first`，转述为 `unknown`），只有实际问法是 `think-first` 才清零窗口；`graph_open` 与命令行 `open` 的说明写一句「`thinkFirst` 非空时，问这道题先请人说自己的看法」，§12 加一条给 DSH 之外编排方的衔接。

#### P2-05 便宜档按子串认，`gemini` 里含 `mini`

- 位置：§7.5.5、§9.2 末行、§11.1 便宜档判断。
- 问题：`gemini-2.5-pro` 含子串 `mini`，会被当成便宜档，流程条与首页一直顶着「建议换强一点的模型」；每个会话要点一次「这次就用它」。
- 改法：模型 id 按 `[-_./:\s]` 切成词再比（`gpt-4o-mini`、`GLM-5.3-Flash` 命中，`gemini-2.5-pro` 不命中），L2 加这几例。

#### P2-06 验收第 2 条在真实快照上的测试依赖 `since`，已关闭节点的旧标题会让它变红

- 位置：§1.4 第 2 条、§10.2 第 4 步、§11.1 `tests/graph-plain-view.spec.ts`。
- 问题：模板把标题与选项说法嵌进句子（「做完了「…」」「agent 自己定了「问题」：选 B「说法」」）。P3 选 C 只改开着的节点，已关闭的节点与已拍板待决保持原文（例 `question-18`「V-01（设置页行名）和拆包谁先」）。`changesSince` 的窗口一旦盖到第 4 步之前关闭的节点，输出就含 `V-01` 这类写法，测试失败却与模板无关。
- 改法：测试写明 `since` 取改写提交的时间；对模板输出先把嵌入的标题与说法换成占位符再跑 `plainIssues`，开着的节点的标题与 `why` 另按字段规则查一遍。验收第 2 条措辞改为「模板自己写的文字」。

#### P2-07 已登录的老用户会在每个新会话的开场画面看到「GLM · 上手」，直到点开一次

- 类别：B3「不唠叨」与验收第 15 条的边界。
- 位置：§7.3「已经登录过的老用户」、§1.4 第 13、15 条。
- 问题：开场小按钮不自动读状态；记录只在会话里打开对话框、读到已登录、关上之后写下。从不点 GLM 按钮的老用户每个新会话都看到它，会话里的按钮也一直写「GLM · 上手」。
- 改法：给一个不用点的退出条件，例：小按钮出现过 3 个会话或第一次出现后 7 天就当作跳过并写记录；或 GLM 按钮任何一次读到已登录都写记录。写进 §7.3 与第 13 条。

#### P2-08 跟随率的数字与图不符

- 位置：§0 第 4 条、§1.1、§2.3、§3.9.1、§14 P7、`mockup-cards.svg` ③④⑥。
- 问题：评审时的图（139 个节点）上，带推荐、由人或带转述拍板的待决 35 张，29 张选了推荐；按拍板时间最近 10 张里 9 张选了推荐（`question-30` 推荐 C、选了 B，2026-10-29T11:24Z）。0.2 写「32 张里 29 张」「最近 10 张全部」，草图写「10 次都选了推荐」。上线后第一张卡就触发的结论不变。
- 改法：按图重算并写明口径与取数时间；草图那句改为「10 次里 9 次」，与 §3.9.2 的例句一致。

#### P2-09 「框线不低于 3:1」与 DSH 原生样式、草图都不符

- 位置：§1.3 第 1 条、§11.3 L4 第 10 项、各草图的选项框。
- 问题：WCAG 2.2 1.4.11 只要求辨认控件与状态所需的非文字部分达到 3:1。DSH 原生框线很浅（本仓库 `ui/src/channel.js` 的 `.glmh-card` 用 `--dsw-alias-border-l1`，退路 `rgba(255,255,255,.1)`）；草图里 #3a3a40 的框线在 #1f1f23 上约 1.4:1。照 §1.3 字面实现就要偏离 DSH 原生样式。
- 改法：§1.3 改为「单选圈与选中状态的标记不低于 3:1；选项框线与表格线是装饰，按 DSH token」，L4 第 10 项按此抽查。

#### P2-10 长度上限与 m3-base-card 分支不一致；`identifier` 规则会误伤 macOS、iPhone

- 位置：§4.2、§4.3 `length` 与 `identifier`、§9.2。
- 问题：m3-base-card 分支的 `src/graph/schema.ts` 已有 `CARD_LIMITS = { label: 20, consequence: 120, why: 200, counter: 200 }`，本稿写 `why` 80。本稿规定「以 m3-base 为准」，但首页与计划按一行 80 字排版，200 字的 `why` 放不进一行。`\b[a-z]+[A-Z][A-Za-z0-9]*\b` 会命中 `macOS`、`iOS`、`iPhone`，第二阶段会拒绝合理的人话。
- 改法：在 m3-base-card 合入前和它定一个数，或把 80 写成显示截断（全文在讲细点）而不是写入上限；常量表沿用已有的 `CARD_LIMITS`。`identifier` 加一张放行词表（macOS、iOS、iPadOS、iPhone、iPad），L2 加用例。

#### P2-11 草图与正文的小出入

- `mockup-drilldown.svg` 的祖先一行写「效果是 › 让 AI 自己推进项目…」，那是特性 `orch`（`split` 的父节点），目标 `hourness` 没有出现；§3.5「目标写作「效果是 › …」」既可读成「效果是」代替目标标题，也可读成前缀。写明一种并让草图一致。
- `mockup-drilldown.svg` 没有 §3.5 的「进展」一行（「27 条记录，最近一条 1 小时前」）。
- `mockup-home.svg` 变化的最后一行少了 §4.4 模板的书名号（应为「新加了一件：「经验：…」」）。
- `mockup-plan.svg` 定期一行多了「没到期，agent 不会提前再跑」，§3.4 的状态行没有这一句；二者取一。
- §4.5 对照表 `hourness` 新标题格里的「（37）」像标题的一部分，移到说明里。

### 核实过的假设（本轮新增或复核）

- 开场画面的布局：`composerStack` 里依次是 `HeroShell`、工作区行、`conversation.input.dock`、输入框（ui-conversation client.js:17901–17911）；开场判断 `conversationPhase`（17381–17383）与 `hero`（17612）；`conversation.hero.options` 只在有会话时渲染（17880–17883）。
- `conversation.composer.dock` 只在 `variant === "composer"` 时渲染，容器带 `data-composer-dock`（client.js:19346–19347）；开场画面传 `variant: "hero"`（17888）；README 169 行「The empty hero dock remains collapsed」。
- 槽声明：`conversation.input.dock` list/session（19938–19941）、`conversation.hero.options` list/session（19954–19957）、`conversation.composer.dock` list/session（20113–20116）。order：待办 0（19487）、目标 10（ui-goal client.js:604–609）、排队 20（17269）；chat README 71 行统计 order 0、1。
- 会话快照有 `blank`、`promptAttempted`、`awaitingFirstTurn`（api-session-controller lib/types/client/sessions/session.js:832–835）；列表行有 `blank`、`cwd`（lib/client.js:4158、4163）；DSH 的排队条以 `useSession`、`useProjection` 为 prop（ui-conversation client.js:16954）。
- `remote.commands.list` 要求会话已保留且 `openState === "open"`（ui-commands client.js:1412、1415）；`execute` 在 1718。`sidebarRight` 服务（ui-sidebar-right client.js:4966）与 `openTab`（2243）。conversation README 87 行：`ctx.uiSession.provide()` 提供 `inputActions` 标准 prop；89 行：空白会话保留右侧栏开关。
- 本仓库：`engine.ts`:59（`now` 选项）、:64；`TRANSITIONS`（:106）；`projection.ts`:197、220、296–300；`tools.ts`:162、238、243、332、339；`cli.ts`:74；`ui/src/graph/agents.ts`:30–37、60；`common.tsx`:270（蓝色「推荐」标签）；`Decisions.tsx`:29（「倾向」）；`zcode.ts`:385；`channel.js`:350（GLM 按钮 order 150，组件从 props 读 `sessionId`，:187）。
- split 分支 `40190cf` 的 `scripts/packages.mjs`：GLM 客户端 `sources` 含 `ui/src/channel-model.ts`（:45）；编排层客户端 `sources` 是 `ui/src/hourness-client.tsx`、`ui/src/dsh.ts`、`ui/src/primitives.d.ts`、`ui/src/graph/`（:66），不含 `ui/src/wish/`，本稿 §12 的说法成立。
- 图：139 个节点、开着的 54 个（1 个目标、15 个特性、13 个任务、16 个决策、3 个规范、6 个风险），与 §0 的分类数一致；`m3-1` 验收第 4 条原文在图上；`split` 的父节点是 `orch`，`orch` 的父节点是 `hourness`；`reading-digest` 是进行中的任务；`question-18`、`question-26`、`question-28` 的选项与草图里的改写对得上。
- m3-base-card 分支有 `WEIGHTS`、`CARD_LIMITS`、待决的 `why`、`weight`、`counter`；main 上还没有这些字段。
- §2.6 的标准条款与作者的记法一致：WCAG 2.2 的 1.4.10（320 CSS px）、1.4.11、2.4.11（焦点不被遮挡，最低）、2.5.8（目标 24×24）属 AA；ISO 9241-110:2020 的交互原则与 ISO 9241-112:2017 的呈现原则名目对得上；Buçinca、Malaya、Gajos 2021 的标题与结论如本稿所述。

### 未核实或不成立的假设

- 不成立：图上「最近 10 次全部选了推荐」（P2-08）。
- 不成立：长度上限可以由本稿先定为 `why` 80（m3-base-card 已定 200，P2-10）。
- 未核实（本稿已列进 L4 并有退路，可以接受）：第三方 `conversation.input.dock` 组件收到 `useSession`、`inputActions`、`useInput`；`setDraft` 写入的 `/wish ` 回车后被认成命令；在空白会话里执行命令后是否离开开场画面。
- 未核实：§2.3 引的「Anthropic 2026-10-27 的研究，86% 跟随 agent 的倾向」，评审没有原文可查；不影响本稿的取舍。
- 未核实：§2.6 的标准条款作者写明没有联网复核原文，由实现者复核；评审凭对这些标准的了解核对了条款名目，见上。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9

结论：CHANGES_REQUESTED（第 1 轮的 19 条全部解决；P2-01、P2-02 来自作者写完 0.2 之后人新定的表格版，下一稿要覆盖）。

## 第 3 轮（2026-10-29，design.md 0.3）

评审对象：`design.md` 0.3 与同目录的草图（本轮按任务要求审 `mockup-home.svg`、`mockup-plan.svg`、`mockup-drilldown.svg`、`mockup-onboarding.svg`、`mockup-wish.svg`，并核对正文引用的 `mockup-cards.svg`）。判级标准同第 1 轮。这是 `question-11` 规定的第三轮。

本轮核对时的外部事实（0.3 取数在 2026-10-29T13:04Z，之后有变化，属于正常变化，只在影响结论处写成发现）：

- split 已合入 main（`4c7f79b`、`3a75472`），`ui/src/` 的路径没变，0.3 引的本仓库行号在当前 main 上逐条复核过。
- card-fields-table 的分支 `card`（`799fab1`）已实现并经独立评审 APPROVED（`.agents/tasks/card/review.json`，图上 `bfe9f26`），等 split 的 L4 结束后合入。它定下的字段形状与 0.3 的假设有一处不同（P3-01）。
- 人在 13:25Z 纠正规则板的范围（`question-35` 转为不做时的原话：「其余用电脑啊，llm限速啊默认额度啥的都只是我给你举的例子，没让你真加进我们项目里。唯一一个加进去的默认规则是峰谷定价的事情」；`.agents/tasks/design-context.md` 同日记下：在场检测、CPU 与内存限速、默认预算不做成默认，也不依赖它们）。同一时刻 `question-32` 拍了 C，`question-33` 到 `question-35` 不做了，`question-36` 由 agent 重拍为 B。此刻开着的人定待决只剩 `question-37`。

### 第 2 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P2-01 MEDIUM 选项卡改成表格版 | 已解决 | §2.3、§3.8.1–§3.8.4：四列加至多一列维度、同值列删掉、怎么做加粗、格子用数字与例子（`evaluative` 规则）、`fieldset` 加 `table` 加同名原生单选、窄于 40 + 110 × 内容列数时竖排、对话里按钮「A · 怎么做」与说明「得到：…；代价：…」、先想后看对表格行用 `neutralOrder`；验收第 6–8 条、§11.1、§11.3 第 1、2 项与 `mockup-cards.svg` ①–⑧、`mockup-home.svg` 的两张卡都改了。字段形状与已评审的 card 分支有一处不符，另立 P3-01 |
| P2-02 MEDIUM 「取决于」变体 | 已解决 | 人已定取决于加结论行，0.3 照写：`crux`、`verdict`、`weight`，推荐只在结论行末尾；先想后看时结论行折起；对话里结论行在 `detail` 末行、读在选项之前，§3.8.4 写明面板与对话位置不同的原因（client-ui-user-questions client.js:1079–1084 的 `detail` 在选项之前，已核对） |
| P2-03 LOW 先想后看重排字母 | 已解决 | §3.9.2 面板改用数字 1、2、3，§3.9.3 对话按钮不带字母；`mockup-cards.svg` ⑥ 的结论行「卡到不能用 → 3；卡但能忍 → 2；只是风扇响 → 1 · agent 推荐 2」与显示顺序 B、C、A 逐项对得上 |
| P2-04 LOW 转述的拍板记成先想后看 | 已解决 | `asked` 由引擎算、`shown`、`shownOrder`、`peeked` 只收 `human`；`thinkFirstHint` 进 `graph_open` 与命令行 `open`；`AGENTS.md` 那一句交编排者（§15 第 8 条） |
| P2-05 LOW 便宜档按子串认 | 已解决 | §7.5.5 按 `[-_./:\s]` 切词；`gemini-2.5-pro` 切成 `gemini`、`2`、`5`、`pro`，不命中 |
| P2-06 LOW 验收第 2 条依赖 `since` | 已解决 | `quote` 占位，验收第 2 条改为「模板自己写的文字」，`since` 取改写提交的时间 |
| P2-07 LOW 老用户一直看到「GLM · 上手」 | 已解决 | 任何一次读到已登录就完成；开场小按钮在 3 个不同会话里出现过之后自动收起（`glm-hourness.onboarding.glm.seen.v1`） |
| P2-08 LOW 跟随率数字 | 已解决 | 按 13:04Z 的图写明口径：35 次里 29 次，最近 10 次里 9 次 |
| P2-09 LOW 框线 3:1 | 已解决 | §1.3、§3.8.3、§11.3 第 10 项：3:1 只管单选圈、选中标记与焦点框 |
| P2-10 LOW 长度上限、`identifier` 误伤 | 已解决 | 选项卡字段只读 `CARD_LIMITS`，另建 `PLAIN_LIMITS`；放行词表含 macOS、iOS、iPadOS、iPhone、iPad。§4.2、§12 里建议的数值已被 card 分支定成别的数，见 P3-03 |
| P2-11 LOW 草图与正文的小出入 | 已解决 | 祖先一行「效果是：」加从根目标起的每段标题（`mockup-drilldown.svg` 第一段是 `hourness` 的新标题）；节点页有「进展」；首页变化行带书名号；计划的定期一行只写上次与下次；§4.5 表格里不再标码点数 |

### HIGH

无。

### MEDIUM

#### P3-01 `verdict` 在已评审的 card 分支上是一行文字，0.3 要求它是「回答 → 键」对，退路又放弃了验收第 8 条的显示数字

- 类别：验收条件没有满足（本稿 §1.4 第 8 条「结论行与推荐折起，人选了一项或点「看推荐」后才出现（用显示数字）」）；依赖的兄弟设计契约与实际不符。
- 位置：§4.2「面板对形状的要求」、§4.4 `cardOf` 的 `Card.verdict`、§3.9.2 第 4 条、§9.1「card-fields-table 的字段形状与 `cardOf` 的假设不同」一行、§12 card-fields-table 第 1 条、§11.1 `cardView` 用例、`mockup-cards.svg` ⑥。
- 问题：card 分支 `799fab1` 的 `src/graph/schema.ts`:165 是 `readonly verdict?: string`（「the 是 → X；否 → Y line naming option keys, one line」），上限 `CARD_LIMITS.verdict` 120；引擎用 `verdictKeys`（`src/graph/engine.ts`:295–297，正则 `/→\s*([A-Za-z0-9][A-Za-z0-9-]{0,31})/gu`）取每个 `→` 后面的键，核对键都存在、推荐键在其中（:403–410）。这个分支已经 APPROVED，§12 第 1 条「存成有序的对」的请求不会发生。0.3 的退路是「先想后看时结论行整行折起、揭开后照原文显示（字母不换成数字）」：表格行这时标的是 1、2、3，结论行写「→ C」，人对不上哪一行是 C，正好发生在先想后看要人自己想清楚的那张卡上；验收第 8 条与 ⑥ 也就做不到。
- 改法：
  1. §4.2 改写：`verdict` 是 card-fields-table 定的一行文字，格式由引擎核对：每个 `→` 后面是一个选项键。面板不另定格式，用同一个解析：请 card-fields-table 把 `verdictKeys` 移到宿主与客户端都能导入的纯函数模块（例 `src/graph/card.ts`，或放进 `schema.ts`），改为返回每个键的位置，例 `verdictMarks(verdict): {key, index, length}[]`。「规则只实现一次」照旧成立。
  2. `cardOf` 的 `Card.verdict` 改为 `{text: string, marks: readonly {key: string, index: number, length: number}[]} | null`；`cardView.verdictLine` 按 `marks` 把每个键换成这一行的 `mark`（平时是字母，先想后看时是显示数字），其余文字原样；末尾照旧接「 · agent 推荐 X」。
  3. §9.1 那一行改为：只有读到的文件里某个 `→` 后面的键不是选项键（旧文件或手改的文件，引擎写入时会拒绝）时，先想后看把结论行整行折起，人选了之后照原文显示，底账提示；其余情况一律换成显示标号。
  4. §12 card-fields-table 第 1 条改成「请导出解析函数」，删去「存成有序的对」。
  5. §11.1 `cardView` 加用例：「是 → C；否 → A」；`question-34` 那种三个箭头的；键是 `G3` 的；同一个键出现两次的；回答文字里有大写字母的（「只吃 CPU → A」里的 `CPU` 不被替换）。验收第 8 条不用改。

#### P3-02 访谈里的选择题走 DSH 的 `ask_user_question`，由模型自己写；DSH 的工具说明要它把推荐放第一并加 `(Recommended)`，0.3 当成由 M3 的卡片构造写

- 类别：验收条件没有满足（人定 `d-recommend-last`「推荐的放到最后一个选项」，共用清单「给人看的每一组选项都是表、推荐在最后」，本稿 §1.2 A6）；另有一处失败没有途径发现（M3 标定里的模拟人会悄悄改选别的项）。
- 位置：§3.8.4 首句「主 Agent 的 `decision_card` 与访谈里的问题经 DSH 自己的问题卡（`userQuestions.ask`）出……文字由 M3 的卡片构造写」、§12 M3 第 1 条与第 3 条末句「访谈里问人的选择题也按 §3.8.4 写」。
- 问题：
  - M3 设计把八步访谈的提问交给 DSH 原生工具 `ask_user_question`（M3 设计第 15、38、86、241、752 行），参数由主 Agent 自己写，不经 `src/design/cards.ts`。
  - DSH 这个工具的参数说明对模型写的是「If you recommend one, put it first and append "(Recommended)" to that label」（tool-ask-user lib/index.js:94、250）。客户端认出 `(Recommended)`、`(推荐)`、`（推荐）` 后缀就加「推荐」标签（client-ui-user-questions client.js:672–682、1122–1125），第一项带它时在初稿里预选（684–687、788–791），人直接提交就选了推荐。
  - 0.3 只请 M3 改 §2.2 第 3 步那一句（第 86 行）。主 Agent 同时读到 M3 身份文本与 DSH 工具说明两条相反的指令，不能保证照哪一条做；访谈又是 `/wish` 之后人最先、最常见到的选择题。
  - M3 标定的模拟人「有选项时选说法带 `(Recommended)` 的一项、没有就选第一项」（M3 设计第 972 行），`m3-2` 验收第 3 条（人经 `question-22` 批准）写的是「模拟人总选推荐项」。推荐挪到最后、去掉后缀以后，模拟人会选第一项，也就是不推荐的那一项。标定照跑照记基线，没有任何地方报错。M3 的 L4 第 3 项（第 1050 行）还写着「访谈中 `ask_user_question` 的卡片标出推荐项」。
- 改法（§3.8.4 与 §12 M3 写明选哪一种）：
  - A 访谈里的选择题改由 harness 出卡：给主 Agent 一个卡片工具（扩展 `decision_card` 的一种模式，或新的 `interview_choice`），参数是选项（`label`，可选 `gain`、`cost`）与 `recommend`，由 `cards.ts` 经 `userQuestions.ask` 按 §3.8.4 写（推荐在最后、不加后缀、按钮「A · …」）；主 Agent 的工具面去掉 `ask_user_question`，做法与 `question-26` C 在组装时去掉写工具相同（按角色过滤工具，M3 设计 §3.1.3 `installAgentHooks` 已按角色过滤两个设计工具），不带选项的追问也经 `userQuestions.ask`（它支持没有选项的问题）。推荐 A：与 §1.2 A7「由 harness 执行，不靠 agent 自觉」同一个思路。
  - B 保留 `ask_user_question`：身份文本写明「推荐放最后、不加 `(Recommended)` 或（推荐）」并承认与 DSH 工具说明相反；标定与 L3 记下违反的次数（推荐不在最后、说法带后缀的调用各算一次），作为可以发现的失败；人看到推荐在第一项时照样能选别的。
  - 两种都要改模拟人：待决卡按图上这张题的 `recommend` 选（先想后看时先选「先看推荐再选」，重问之后再按 `recommend` 选）；访谈题选最后一项（推荐总在最后）。并列出 M3 设计要改的五处：第 86 行（§2.2 第 3 步）、第 241 行（身份文本第 5 条）、第 752 行（契约表）、第 972 行（模拟人）、第 1050 行（L4 第 3 项），写进 §12 M3，交编排者转给 M3。

### LOW

#### P3-03 §4.2 与 §12 给 card-fields-table 的请求已经过时

card 分支已定：`CARD_LIMITS = { label: 20, gain: 60, cost: 60, dimensionName: 12, cell: 20, crux: 60, verdict: 120 }`（`schema.ts`:55）；维度所有格相同时引擎就拒绝（`engine.ts` `dimensionRefusal`，与 §12 第 2 条「不必查同值的列」相反，无害）；已决的待决不迁移，此刻开着的 `question-37` 仍是 `consequence` 写法（面板按旧格式显示，不出错）。改法：§4.2 与 §12 第 2、3、5 条按分支的实际改写；`minTableWidth` 的 110 px 一格按 8 个字估，60 个字的格子会到 8 行，L4 第 1 项加一张每格都写满上限的卡。

#### P3-04 人纠正了规则板的范围，0.3 仍拿在场检测与 CPU 限速作例子、给在场按钮排位置

依据：`question-35` 转为不做时人的原话（见本轮开头）与 `.agents/tasks/design-context.md`（「do not design them in as defaults or depend on them」）。0.3 没有依赖它们，但有几处写给人看的字会说出产品没有的能力：§3.3 第 3 条「2 件事在等规则放行（你在用电脑）」；§4.5 `rules` 的 `why`「比如你在用电脑时，不许 agent 占太多 CPU 和内存」（第 4 步会写进图）；§7.4 第 4 块「比如「我在用电脑时，别占太多 CPU」」与 `mockup-onboarding.svg` 同一句；§7.5.4 与 §12 规则一条的「在场按钮 order 170」与它的窄宽度短标签；`mockup-wish.svg` ② 的「你在 · 2 单在等」与 ⑤ 的「◉ 2」。改法：例子换成规则板唯一自带的那条（GLM 峰谷定价），字句随规则设计改稿；输入框下方那一排写成「规则板若在这里加按钮，用 order 170，标签与短标签由规则设计定」；`rules` 的 `why` 改写规则这个概念本身（例「你定的规矩，agent 每一步都照做，改了马上生效」），第 4 步对照表照常由人过目。

#### P3-05 §2.3 对讲细点、说重点的说法与 §0、§3.8.1、§13 第 14 条、验收第 7 条不一致

§2.3 写「讲细点（展开完整表格与依据）、说重点（只留加粗短语）」；§0、§3.8.1 与验收第 7 条是默认就显示整张表，说重点留取决于、选项与怎么做两列、结论行，讲细点加来由与依据。实现者照 §2.3 会做出另一种卡。改法：§2.3 那一条照 §3.8.1 改写；§13 第 14 条注明它与第 2 轮编排方转述的「面板里「讲细点」展开成完整表格」不同及理由（取决于与结论行本身就是最短的路，默认少了表格人就要多点一次），人可推翻。

#### P3-06 读屏的读法有一处做不到；对话卡的两处宿主限制没写

- §3.8.3 说单选读作「……；得到：跨项目的规则只写一次；代价：……」。`aria-describedby` 只指向数据格时读不出「得到」「代价」两个列头。改法：`aria-describedby` 依次指向列头与数据格（例 `th-gain cell-A-gain th-cost cell-A-cost`，有维度时再加一对），或在格内放视觉隐藏的「得到：」「代价：」前缀；L2 钉住 id 的顺序。
- DSH 的问题卡给每个选项按钮设了 `aria-label` 为说法（client-ui-user-questions client.js:1096），说明（得到与代价）不进可访问名称，读屏只读「A · 只限速」；说法的字重是 500（`_optionLabel`），不是加粗。改法：§3.8.4 与 §8 记为宿主限制（对话里读屏用户要靠追问讲细点），L4 第 9 项加一条核对。

#### P3-07 §14 两张卡的字句

- P4 的取决于「……你就不需要它有一个自己的状态名了吗？」是带倾向的反问句，与先想后看「不推着人走」的意思相反（ISO 24495-1 简明语言）。改法：「取决于：计划里单列「定期的事」、写着上次和下次，对你够不够？」，结论行「够 → D；不够，要一个自己的状态名 → C」。
- P6 B 的代价「其中 10 条要在桌面版上截图核对」对 A 同样成立，不是 B 独有的代价。改法：换成只有 B 有的代价，例「你没逐条读过的 15 条也成了验收，哪条不对要再找你改一次」。

#### P3-08 LLM 能给进行中的任务加 `repeat`，再带一条证据把它挪回已批准

§6 让 `repeat` 与派发属性同权。agent 可以给一件卡住的进行中任务设 `repeat: 366`，带任意一条通过的检查回到已批准：它从「在做」消失、不算进还剩几件，下次到期在一年后。变化里会有「做完一次「…」，下次 …」一行，所以看得见、能改回，不挡路。改法：`repeat` 只在 `propose` 时设，或由人与带原话的 LLM 改；`edit` 给状态为进行中的任务设 `repeat` 时拒绝（`hint`「定期任务在提出时设 repeat，或由人改」）；`changesSince` 列出 `repeat` 的改动（「「…」改成每 N 天一次」）。§6、§9.2、§11.1 同步。

#### P3-09 先想后看的洗牌种子会在卡片开着时变

§3.9.2 的种子是待决 id 加「窗口里最后一次拍板的时间」。目标卡开着时，别的题上来一次计数的拍板（编排方在对话里转述就会这样），窗口的最后一次拍板时间就变了，这张卡的行当着人重排，`shownOrder` 与人最初看到的顺序不同。改法：种子取待决 id 加上一次复位点（最近一次 `asked` 为先想后看的计数拍板的 `at`，没有时取空串），窗口复位之前顺序不变；L2 加一例：别的题上的计数拍板不改变目标卡的 `neutralOrder`。

#### P3-10 验收第 1 条的「第一屏」说不清

首页草图里两张表格卡约 280–360 px 高，「现在」从约 1000 px 处开始，右侧栏一屏放不下五节；按「一屏之内」理解，第 1 条在 L4 上必然不过，按「页面上的先后」理解又没有给一眼能看到多少的标准。改法：改为「首页从上到下依次是……」，另加一条可量的：例「1280×800 的窗口、右侧栏默认宽度下，第一屏看得到效果是一节与要你定的第一张卡的题目、取决于与结论行」；或首页上的卡默认用说重点的样子（agent 可定，记进 §13）。

#### P3-11 几处规则与草图的小缺口

- `mockup-home.svg` 与 §3.3 的例句写「主 Agent 在「拆成两个插件」上」，节点标题是「拆成两个插件：GLM 通道和项目编排各装各的」，`liveLine` 经 `quote` 写的是标题全文，没有截短规则。改法：定一条（例取第一个「：」之前的部分）或草图用全文。
- `mockup-home.svg` 有进度条与「21 / 21」「17 / 38」，以及「另有 1 个子 agent 在跑」，§3.3 都没写。改法：写进 §3.3 第 1、3 条，或从草图删去。
- `mockup-plan.svg` 第 6 件右边少了「讲细点」。
- §3.4「要等」的排序键只看「在做」「可以开工」的编号；挡路的也在「要等」里时（第 21 件等第 19 件），它还没有编号，按规则排到最后。这里结果对，但 Z 等 X、X 等第 1 件这样的链会按创建时间排，可能出现「第 15 件 · 等第 18 件」。改法：「要等」一组按依赖先后编号（拓扑序，同层按排序键再按创建时间），进 `planOf` 的 L2。

### 核实过的假设（本轮新增或复核）

- client-ui-user-questions client.js：`header` 渲染成眉标、`question` 是 `h2` 标题（1015–1023）；`detail` 以 `MarkdownText` 渲染在选项之前（1079–1084）；单选组 `role="radiogroup"`，每个按钮左边的数字是 `optionIndex + 1`（1089–1112）；按钮 `aria-label` 是说法（1096）；推荐标签（1122–1125）；`parseRecommendedLabel` 认 `(Recommended)`、`(推荐)`、`（推荐）`（672–682）；只在第一项带推荐时预选（684–687、788–791）；`_optionLine` 为 `flex-wrap`、`_optionLabel` 字重 500（608 的样式表）。0.3 §3.8.4 的这些引用成立。
- tool-ask-user lib/index.js:94、250：选项参数说明要模型「put it first and append "(Recommended)"」。dsh-user-questions 与 dsh-tool-ask-user 都没有选项个数上限（没有 `maxItems`），先想后看在 4 项的题上加「先看推荐再选」成 5 个按钮可以发出。
- M3 设计：访谈用 `ask_user_question`（第 15、38、86、241、752 行）；`decision_card` 原写法「推荐项排第一并加 (Recommended)」（第 564 行，0.3 §12 M3 第 1 条已请它改）；模拟人的选法（第 972 行）；L4 第 3 项（第 1050 行）；§15 的人定表。
- card 分支 `799fab1`：`WEIGHTS`、`CARD_LIMITS`（`schema.ts`:51–55）；`DecisionOption` 的 `gain`、`cost`、`consequence`（:62–72）；`CardDimension {name, values}`（:75–78），与 0.3 `cardOf` 的维度形状一致；`verdict?: string`（:165）；`verdictKeys`（`engine.ts`:295–297）；新写入带 `consequence` 被拒、推荐在最后、维度全同被拒、人定的题必须有 `crux`、`verdict`、`weight`、结论行的键存在且含推荐（`engine.ts` `optionRefusal`、`dimensionRefusal`、`questionRefusal`）；评审 APPROVED，评审备注「已决的不迁移」。
- 当前 main（`3a75472`，split 已合入）：`ui/src/channel.js`:187、350；`ui/src/graph/common.tsx`:270；`ui/src/graph/Decisions.tsx`:29；`ui/src/graph/agents.ts`:30、60；`ui/src/primitives.d.ts`:52；`scripts/packages.mjs`:45、66；`src/graph/tools.ts`:162、238、243、332、339；`src/graph/engine.ts`:59、64、97、106；`src/graph/projection.ts`:197、220、296–300；`src/graph/cli.ts`:74；`src/glm-llm/zcode.ts`:385，逐条与 0.3 所述一致。
- 会话快照除 `blank`、`promptAttempted`、`awaitingFirstTurn`（api-session-controller lib/types/client/sessions/session.js:832–835）外还有 `running`（:817），§7.5.2 第 1 条的三个字段都在。
- 开场画面：`conversation.hero.options` 只在有会话时渲染在 `.heroOptions` 容器里（ui-conversation client.js:17880–17883）；`composerStack` 依次是 `HeroShell`、工作区行、`conversation.input.dock`、输入框（17901–17911）；输入框传 `variant: hero`（17888）。
- 图：`norm-merge-gate` 仍是提议；`question-37` 开着、选项仍是 `consequence`；`reading-digest` 进行中，最后一条历史在 2026-10-29；`m3-1` 到 `m3-6` 仍在「可以开工」（§12 发现 1 成立）；`rules` 依赖 `split`。
- §14 的格式与共用清单一致：每组题目下一行取决于、一张两行的表、表下一行结论、推荐在最后；P2 的「引擎多 7 条写法检查」与 §4.3 表里除 `typeWord`（只查模板文字）之外的 7 条对得上。

### 未核实或不成立的假设

- 不成立：`verdict` 存成「回答 → 键」对（P3-01）。
- 不成立：访谈里的问题由 M3 的卡片构造经 `userQuestions.ask` 写出（P3-02）。
- 已过时（取数之后的正常变化，实现时按当时的图重算，除 P3-04 外不另立发现）：§1.1 与 §3.9.1 的「此刻开着 5 张人定待决」「上线后第一张先想后看是 `question-35`」；`mockup-home.svg`、`mockup-cards.svg` 用的 `question-32` 到 `question-35` 已拍板或不做；`mockup-home.svg` 变化里 `question-36` 选 C 已被重拍为 B。
- 未核实（本稿已列进 L4 并有退路，可以接受）：第三方 `conversation.input.dock` 组件收到 `useSession`、`inputActions`、`useInput`；`setDraft` 写入的 `/wish ` 回车后被认成命令；在空白会话里执行命令后是否离开开场画面。
- 未核实：槽里的组件返回 `null` 时 `.heroOptions` 是否仍算 `:empty`（取决于 `renderSlot` 是否给每一项包一层元素）；只影响 GLM 小按钮收起后工作区那一行的间距，L4 第 7 项能看到。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9

结论：CHANGES_REQUESTED。第 2 轮的 11 条全部解决；本轮新的 2 条 MEDIUM，一条来自 0.3 写完前后才定下的外部事实（card 分支的 `verdict` 是一行文字），一条来自没核对到的 M3 机制（访谈走 DSH 的 `ask_user_question`，由模型自己写选项）。挡路的条数与第 2 轮持平（2 → 2），这是 `question-11` 规定的第三轮：按 `question-11` 与 `docs/DEVELOPMENT.md` §1「必须改的发现一轮没有减少，就停下交人」，循环到上限，停下交人。两条的改法都已写明，P3-01 只改本稿与 card 分支导出一个函数，P3-02 要在 A、B 之间选一种并交 M3。

## 第 4 轮（2026-10-30，design.md 0.4）

评审对象：`design.md` 0.4 与同目录的草图（按任务要求审 `mockup-home.svg`、`mockup-plan.svg`、`mockup-drilldown.svg`、`mockup-onboarding.svg`、`mockup-wish.svg`，并核对正文引用的 `mockup-cards.svg`）。判级标准同第 1 轮。这一轮是人在第 3 轮停下之后给的（2026-10-29T14:12Z，原话「B」），同时人定了 `d-interview-cards`。

本轮核对时的外部事实：

- main 是 `f47629c`。`e22282f`（选项卡字段）、`44e8601`（推荐放最后）、`3cb0873`（split 记完成）都在它的历史里；`82bf33c` 之后 `src/`、`ui/`、`scripts/` 没有改动，本轮按 `f47629c` 核对源码。
- M3 附录 `.agents/tasks/m3/design-addendum.md` 0.2（2026-10-30 00:26）在 M3 设计 0.4 之上定了访谈选择题（`ask_human`）、表格卡、问人的话（`src/graph/plain-question.ts`）与 `/wish` 入口的实现，并在 §8 第 4、5 条给本稿回话；同样的回话在图上 `m8-plain-language` 2026-10-29T16:31:53Z 的批注里，与本稿 0.4 写完的批注同一秒写入。本稿 0.4（00:29）没有引用这份附录。
- 规则设计已到 0.5（`.agents/tasks/rules/design.md`，00:32），`rules_propose` 的输入是 `{kind, body, summary, reason, crux, skip, set}`（附录 C 的改动摘要）。
- `d-option-card` 16:21Z 的批注：人说「那你先试试新问法」，编排方在对话里试不画表、一行一个选项的问法；「面板、问题卡与引擎字段（取决于、结论行改为可选）等试用结果出来再改」。

### 第 3 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P3-01 MEDIUM 结论行是一行文字，先想后看时对不上数字 | 已解决 | §4.2 `verdictMarks` 返回键与位置，`index = match.index + match[0].length - key.length` 成立（捕获组在匹配的末尾，`engine.ts`:296 的正则）；`cardOf` 的 `verdict` 是 `{text, marks, known}`，`cardView` 从后往前换标号，`CPU` 这类回答文字不被换；L2 列了三个箭头、`G3`、重复键、大写字母、有无空格、没有箭头。验收第 8 条现在做得到。M3 附录把同一个函数移到另一个模块，另立 P4-03 |
| P3-02 MEDIUM 访谈选择题走 `ask_user_question` | 已解决 | 按 `d-interview-cards` 写 §3.8.4、§8、§9.1、§9.3、§11.2 与 §12 M3 第 1 条：harness 出卡、主 Agent 的工具面按角色去掉 `ask_user_question`、推荐不在最后时 `invalid`、模拟人在待决卡上按 `recommend` 选、访谈题选最后一项；M3 设计的行号（15、38、86、226、241、564、752、972、1040、1050）逐行核对属实。与 M3 附录 0.2 的出入另立 P4-01、P4-02、P4-04 |
| P3-03 LOW 给 card-fields-table 的请求过时 | 已解决 | §4.2 的 `CARD_LIMITS` 与 `src/graph/schema.ts`:55 逐字相同；宽排任一格超过 5 行切竖排；L4 第 1 项有写满上限的卡 |
| P3-04 LOW 规则板的例子 | 已解决 | §3.3、§4.5、§7.4、§7.6 用峰谷定价；`mockup-wish.svg` ②⑤ 已去掉在场按钮；order 170 空着，与规则设计 0.5 第 1041 行一致 |
| P3-05 LOW 详略说法不一致 | 已解决 | §2.3、§3.8.1、§13 第 14 条都是三档，首页从说重点起步、节点页与先想后看从默认起步 |
| P3-06 LOW 读屏读不出列头；宿主限制 | 已解决 | `describedBy` 成对指向列头与数据格；DSH 问题卡按钮 `aria-label` 只是说法（client-ui-user-questions client.js:1096，已核对）记进 §3.8.4、§8，L4 第 9 项核对 |
| P3-07 LOW §14 两张卡的字句 | 已解决 | P4 的取决于与结论行、P6 B 的代价按改法改写 |
| P3-08 LOW `repeat` 能藏起卡住的任务 | 已解决 | 只在 `propose` 时设或自己仍为提议时改（`engine.ts`:584–587 的 `ownProposal`），其余要人或带原话；`forbidden` 带 `set.repeat`；变化里列 `repeat` 的改动 |
| P3-09 LOW 洗牌种子会变 | 已解决 | 种子是待决 id 加 `resetPointOf`；L2 有「别的题拍板不改顺序」 |
| P3-10 LOW 「第一屏」说不清 | 已解决 | 验收第 1 条可量；`mockup-home.svg` 里第一张卡的取决于在 y≈488，面板正文从 y=60 起，800 高的窗口里不滚动就看得到 |
| P3-11 LOW 小缺口 | 已解决 | `shortTitle`、进度条与两个数、子 agent 一行、`mockup-plan.svg` 第 6 件的讲细点、「要等」按 Kahn 拓扑序编号，都写进了正文与 L2 |

### HIGH

无。

### MEDIUM

#### P4-01 背景（`background`）的存法与长度和 M3 附录、规则设计 0.5 不一致；照现在的写法，主 Agent 与规则板提的题在面板上没有背景，切到第二阶段后这两处提题都会被拒

- 类别：验收条件没有满足（人定「给人的每一道题先交代前因后果」，`.agents/tasks/design-context.md`「Questions for the person carry their background」与 `d-plain-questions`；本稿验收第 1 条「第一张卡的题目、背景与取决于」、第 7 条）。
- 位置：§4.2 `background`；§4.3 `background` 与 `length` 两条；§9.2 待决 `background` 一行；§10.2 第 7 步；§12 M3 第 1 条与规则一条；`graph-comment-v04.json` 对 `d-plain-questions` 的批注。
- 问题：
  - 本稿把背景存为待决的新字段 `background`：一行、不超过 150 个码点（`PLAIN_LIMITS.background`）。面板只读这个字段，不从正文拆（§3.8.1 第 2 条、§13 第 26 条）。人定的待决缺它时，第一阶段警告，第二阶段拒绝。
  - M3 附录 0.2 §2.4 定 `decision_card` 的参数 `background`「非空，至多 600 码点，可以多行；它是待决的正文」，提议的节点是 `{type: 'question', …, body: background, …}`，没有 `background` 字段。`ask_human` 同样是 600 码点、可以多行（§2.7 第 2 条）。图上 `d-plain-questions` 16:31:53Z 的两条批注把这两种定法并排记着。
  - 规则设计 0.5 的 `rules_propose` 输入没有背景。本稿 §12 只写了一句「`rules_propose` 带的待决同样要 `background`」，规则设计没有接。
  - 结果：今后人最常见到的题由 `decision_card` 与 `rules_propose` 提出。面板首页与节点页上，这些卡都没有背景段（背景在正文里，只在讲细点里出现），这种卡排第一时验收第 1 条做不到。本稿第 7 步切到第二阶段之后，引擎会以 `invalid` 拒绝这两处提出的每一张人定待决（缺 `background`），长于 150 个码点或带换行的背景也被拒。拒绝看得见，但两处工具的调用方没有参数能写进这个字段，模型照提示也改不了，只能等代码改。
- 改法（写进 §4.2、§10.2 第 7 步与 §12，交编排者转给 m3-implement 与 rules-design）：
  1. 定一个契约，三处照写。推荐：节点字段 `background` 是背景唯一的存放处。`decision_card` 把参数 `background` 写进节点的 `background`，正文只放细节（可以为空），不再 `body: background`；`rules_propose` 加必填参数 `background`，写进它提的待决。长度与形状二选一并写明理由：(a) 维持 150 个码点、一行，M3 附录把 `decision_card`、`ask_human` 的 600 码点、多行改成同一个上限；(b) 本稿放宽（例 300 个码点，允许一处换行），`length` 规则与 `PLAIN_LIMITS` 跟着改，面板的背景段照原样换行。两边都从 `src/graph/schema.ts` 的 `PLAIN_LIMITS.background` 读数，不各写一个数。
  2. §10.2 第 7 步加前提：切第二阶段之前，`decision_card` 与 `rules_propose` 已按上面写 `background`，并且 M3 的 L3 场景 `glm-decision-card` 与规则设计里提待决的那条探针在第二阶段的常量下通过；没满足就不切。
  3. 过渡期的样子写一句：人定的待决没有 `background` 字段时不显示背景段（今天的规则），底账提示「这道题没写背景」，不从正文拆。
  4. L2 加一例：按 M3 附录例题的形状经 `decision_card` 写入的节点，`cardView` 给出的 `background` 非空。

#### P4-02 `/wish` 入口两份设计都要实现；本稿的规格缺「空白会话里已是主 Agent」这一屏，`m3-1` 验收第 4 条的后半句在这一屏做不到

- 类别：验收条件没有满足（`m3-1` 验收第 4 条「开启后看得到当前是主 Agent 以及怎样 /wish off 退出」）。
- 位置：§1.4 第 11 条（「发出第一句话或开启主 Agent 后卡片消失」）；§7.5.2 第 2 条；§7.5.3「接着推进现有项目」；§9.1「在空白会话里执行命令后会话离开开场画面」一行；§10.1 `ui/src/wish/` 一行；§10.2 第 9 步；§11.3 第 4 项（「执行 `/wish`，之后卡片消失」）；`mockup-wish.svg`。
- 问题：
  - 人点「接着推进现有项目」会执行不带话的 `/wish`；主 Agent 开启后，卡片按 §7.5.2 第 2 条消失。M3 设计对空输入只 `inject` 一条说明、不开回合（`.agents/tasks/m3/design.md`:165、168），会话可以仍是空白、仍停在开场画面。开场画面不渲染 `conversation.composer.dock`（conversation client.js:19347、17888，本稿 §8 已实读），所以「主 Agent」按钮也看不到。这一屏上既没有卡片，也没有任何东西说明当前是主 Agent、怎样退出。本稿 §9.1 只为「执行命令后离开开场画面」做了预案，相反的情形没有退路；会话会不会离开开场画面，本稿自己列为〔未核实〕。
  - M3 附录 0.2 §2.5 已经补上这一屏（第 2 种情形：卡片换成「这个会话的 agent 是主 Agent」与「退出主 Agent（/wish off）」），并定 `WishCard`、`WishPill`、`ui/src/wish/model.ts` 在 M3 第 11 步实现；§8 第 4 条请本稿把第 9 步缩成上手页与没有图的卡片。本稿 §10.1、§10.2 第 9 步仍把这三个文件以及开场卡片、按钮、主 Agent 按钮、模型提醒列为本稿实现。两份设计对同一批文件各给一份规格，本稿验收第 11 条写的行为与 M3 相反。
- 改法：
  1. §7.5 改为引用 M3 附录 §2.5 作为 `/wish` 入口的实现规格（卡片的三种情形、按钮、弹层、短标签、模型提醒）。本稿只保留属于引导与面板的部分：「第一次用？看看项目图怎么用」一行、没有项目图时的卡片（§7.8）、面板首页「现在」的一句（§7.5.6）、上手页第 3 块的按钮。
  2. 写明这几样怎样挂上 M3 的组件，二选一：(a) 本稿另注册一个 `conversation.input.dock` 项（例 id `hourness-nograph`、order 41），只管没有项目图的卡片；「第一次用？」一行由 M3 的 `WishCard` 调本稿导出的一个纯函数决定显示（例 `ui/src/graph/seen.ts` 的 `isFirstVisit()`，与上手页同一条规则）。(b) 两样都并进 M3 的 `WishCard`，本稿只给文字与显示规则，`ui/src/wish/model.ts` 归 M3。推荐 (a)：没有图的卡片与 `/wish` 注没注册无关，分开注册时 M3 不用知道没有图的情形（M3 附录 §2.5 末条就是这样说的）。
  3. §1.4 第 11 条改为「发出第一句话后卡片消失；开启主 Agent 后、会话仍是空白时，卡片换成「这个会话的 agent 是主 Agent」与退出按钮」；§11.3 第 4 项照此改，并截这一屏。
  4. §10.1、§10.2 第 9 步删去 `WishCard.tsx`、`WishPill.tsx` 与 `ui/src/wish/model.ts`，换成 (a) 或 (b) 里本稿自己的文件；`mockup-wish.svg` 加这一屏，或在图上写明以 M3 附录为准。

### LOW

#### P4-03 同一条规则，两份设计各建一个模块：结论行的解析与换词表

- 结论行的解析：本稿第 2 步把 `verdictKeys` 移到 `src/graph/verdict.ts` 并改成 `verdictMarks`（§4.2）；M3 附录 0.2 §2.7 在「访谈选择题」一步把它与 `codePoints`、`shortLine`、几条 `*_HINT`、`optionRefusal` 与 `dimensionRefusal` 的检查一起移到 `src/graph/card-rules.ts`。两步都从 `engine.ts` 删掉它，后合入的一方会冲突，或者留下两份解析，与本稿自己引的「规则只实现一次」相反。合并时看得见，所以不挡路。
- 换词表与例题：本稿 §4.3 的 `jargon` 在 `src/graph/plain.ts` 里有自己的词表，`graph_propose` 的说明带 `question-38` 改写的例题；M3 附录 §2.8 在 M3 第 3 步建 `src/graph/plain-question.ts`（`PLAIN_WORDS`、`plainWordsIn`、`PLAIN_QUESTION_EXAMPLE`、`PLAIN_QUESTION_GUIDE`，并写「plain-ui 的写法检查以后可以直接调用」），例题是预约那一道。两张表的说法也不同：附录里目标一级说「怎样算做成」、任务一级说「怎样算做完」；本稿 §3.5 的节点页对目标也写「效果是 · 怎样算做完」。
- 改法：`verdictMarks` 放进 `src/graph/card-rules.ts`，谁先合入谁建这个模块，另一方只加导出；`jargon` 调 `plainWordsIn`，词表只在 `PLAIN_WORDS` 里；`graph_propose` 的说明引用 `PLAIN_QUESTION_GUIDE`，或两边约定用同一道例题；目标一级的说法与附录取同一个，§2.2 换词表与 §3.5 一起改。§10.1 与 §10.2 第 1、2 步同步。

#### P4-04 M3 附录给本稿的其余回话没有落进 0.4

依据：M3 附录 0.2 §8 第 4 条与图上 `m8-plain-language` 16:31:53Z 的批注。

- 对话卡的第二问「都不要或补充」（§3.8.4、§12 M3 第 1 条）：M3 定为保持一问，「都不要」「补充」在输入行里写字就是回答（附录 §2.4，理由是每张卡少点一次「跳过」）。改法：采纳并改这两处，或写明不同意的理由交编排者。
- 黄字「主 Agent 用强一点的模型（如 GLM-5.3）」：§7.5.2 与 `mockup-onboarding.svg` 带括号，`mockup-wish.svg` 与 M3 附录不带。编排层包单装时这句也会出现，点名 GLM 的模型与 `hourness` 目标的非目标「不含任何模型的方言」、与 B4（单装也成立）都不合。改法：去掉括号，两张草图一致。
- P2 选 D 时目标的 `why` 承接访谈第 2 步的「问题」；M3 说改 `requirementCard` 的 `problem` 一项与它的 `hint` 由本稿的实现做，§10.1 与 §10.2 没有这一项。改法：加进 P2 定了之后的那一步，写明改 `src/graph/stage.ts` 的哪一项、L2 怎样钉。
- `ask_human` 的归属：§12「M7 与晨报：`ask_human` 的说明同样带 §4.3 的例题与换词表」与 `graph-comment-v04.json` 对 `d-plain-questions` 的批注都把它写成 M7 的工具。`ask_human` 是 M3 附录 §2.7 的提问工具；M7 设计里 worker 问主 Agent 用 `ask_main`，主 Agent 的工具是 `dispatch_task`、`answer_worker`、`merge_task`、`await_human`（`.agents/tasks/m7/design.md`:18、97），没有 `ask_human`。改法：这一条挪进 §12 的 M3 一节，批注改写；M7 有没有给人写题的工具另查一遍再写。

#### P4-05 写法检查的条数写错，而且写进了给人看的 P2

§4.3 的规则表有 10 行（`code`、`id`、`identifier`、`enum`、`term`、`typeWord`、`evaluative`、`jargon`、`background`、`length`），表下却写「一共 9 条规则，`typeWord` 只查模板文字，引擎查 agent 写入的是其余 8 条」；§14 P2 D 的代价写「系统多 8 条写法检查」。引擎查的是 9 条。改法：改成 10 条与 9 条，P2 那一格同改；或把 `background` 写成必填而不算一条规则，两处说法一致。

#### P4-06 P6 没告诉人：有几条「怎样算做完」取决于正在试用的卡片写法

`d-option-card` 16:21Z 的批注说人在试一种不画表的问法，「面板、问题卡与引擎字段（取决于、结论行改为可选）等试用结果出来再改」。§3.8 开头写了格式改了只动四处，同时又写「不动的：引擎的字段与核对」，与这条批注相反。验收第 7 条整条写的是表格版，第 1 条要看到取决于，第 6、8 条带取决于与结论行。人在 P6 选 B，这几条今天就写进节点，试用结果出来又要找人改，这正是 P6 背景里说的「写进去以后再改要你出手」。改法：P6 B 的代价加一句（例「其中 1 条讲卡片长什么样，卡片的写法正在试，定了还要再找你改一次」），或写成先写其余 14 条、第 7 条等试用结束再写；§3.8 那句改为「引擎字段若改为可选，`cardView` 已按缺字段显示（§3.8.1 第 4、6 条），只动显示」。

#### P4-07 引用的行号与版本过时

本稿说依据 main `82bf33c`，但在那个提交上：`src/graph/engine.ts` 的 `now` 选项在 :36（本稿写 :59），`openItems` 调 `listOpenItems` 在 :68（写 :64），`LLM_EDITABLE` 在 :101（写 :97），`TRANSITIONS` 在 :110（写 :106，§1.1 与 §6 都引了）；`src/graph/tools.ts` 的 `graph_status` 说明在 :260（写 :238），`graph_edit` 说明在 :265（写 :243），`graph_open` 在 :354（写 :332），调 `listOpenItems` 在 :361（写 :339）。这些是 `e22282f` 合入之前的行号。§12 规则一条引「规则设计 0.4 第 837 行」「第 976 行」，规则设计已是 0.5，对应的是第 901 行与第 1041 行。改法：按 `f47629c` 重核一遍。

#### P4-08 等你批准的提议卡没有背景；草图里用了「探针」

人要「每次给问题的时候带上前因后果」。提议卡也要人点批准或拒绝，本稿只给标题、「等你批准 · agent 提的」与一行 `why`（§3.3 第 2 条），`background` 只在待决上（§4.2）。`mockup-home.svg` 的提议卡写「每次合入前自动跑构建、检查、测试和探针」，「探针」是内部叫法，人没学过；`jargon` 只查待决，查不到它。改法：写明提议卡的 `why` 就是它的背景（一行），并让 `jargon` 也查状态为提议的节点的 `title` 与 `why`（人要读它们才能批）；或给要人批的提议也加 `background`。草图换成人话（例「每次合入前自动跑构建、检查、测试，再在桌面版上实跑一遍」）。

#### P4-09 草图与正文的小出入

- `mockup-onboarding.svg` 上手页第 2 块只解释了「取决于」；§7.4 要第 2 块解释主 Agent、子 agent、取决于、底账四个词。
- `mockup-plan.svg` 页底写「8–13 在今天的图上没有等拆包的依赖连线……补上（§12 发现 1）后会挪到「要等」」，§12 发现 1 已标为过时（split 13:51Z 完成）。改成「画的是 13:04Z 的图，那时……」。

### 核实过的假设（本轮新增或复核）

- main `f47629c` 的历史含 `e22282f`、`44e8601`、`3cb0873`、`82bf33c`；`82bf33c` 之后 `src/`、`ui/`、`scripts/` 没有提交。
- `src/graph/schema.ts`：`CARD_LIMITS`（:55）与本稿逐字相同；`DecisionOption`（:62）、`CardDimension`（:75）、`crux?`、`verdict?`、`weight?`（:163、165、167）；`FieldValue`（:101）没有数这一种；`EDITABLE_FIELDS`（:95）、`NODE_FIELDS`（:177）、`HISTORY_FIELDS`（:190）都在。
- `src/graph/engine.ts`：`verdictKeys` 与正则（:295–297）、`*_HINT`（:299–307）、`optionRefusal`（:309）、`dimensionRefusal`（:326）、`questionRefusal`（:363，结论行核对 :403–410）、`ownProposal`（:584–587）、`LLM_EDITABLE`（:101）是 `title`、`body`、`slope`、`decider` 与派发属性。
- `src/graph/projection.ts`：`gatesOf` 只认完成（:197）、阶段取最近的祖先（:220）、`listOpenItems(graph)`（:292）没有 `now`，`ready` 只取任务（:296–300）。`src/graph/tools.ts`:162 的选项说明要求 2–4 行、推荐在最后；`graph_propose` 的字段说明没有一道给人的完整例题，`acceptance` 的说明是「How to tell it is done」（:151），本稿 §4.3 的发现成立。
- client-ui-user-questions client.js：预选（783–795，`recommendedFirstOption`）、`header`（1016）、`detail`（1078–1083）、选项（1084–1133）、`aria-label`（1096）、自由文字输入行（1139）。
- 本仓库 UI：`ui/src/graph/agents.ts`:39（`subagentCatalog` 去掉 `external`）、:60（`useNow`）；`ui/src/channel.js`:187、350；`common.tsx`:270 的「推荐」标签；`Decisions.tsx`:29 的「倾向」。
- M3 设计 0.4 第 15、38、86、226、241、564、752、972、1040、1050 行如本稿 §12 所述；第 165、168 行：空的 `/wish` 只 `inject`、不唤醒。
- M3 附录 0.2：§2.4（`decision_card` 参数、`body: background`、600 码点、一问）、§2.5（`/wish` 入口三种情形、在 M3 第 11 步实现）、§2.7（`ask_human`、`card-rules.ts`、`main-agent-ask-card`、模拟人 `pickChoice`）、§2.8（`plain-question.ts`）、§8 第 4、5 条。
- 规则设计 0.5：第 901 行按本稿 §7.6 放第 2 层并登记板块表；第 1041 行没有在场按钮、order 170 空出、例子换成峰谷定价；`rules_propose` 的输入里没有背景。
- 图：`question-38` 已由人带转述拍了 C，选项与 §4.3 例题的改写对得上；`m3-1` 验收第 4 条原文如上；`reading-digest` 仍在进行中，最后一条批注写着缺「定期、空闲中」的状态；`d-option-card` 已完成，带 16:21Z 的试用批注；`d-plain-questions` 已批准，带 M3 与本稿两条落法批注。
- `mockup-home.svg`：第一张卡的题目、背景与取决于在 y 322–488，面板正文从 y 60 起，验收第 1 条在 800 高的窗口里做得到。

### 未核实或不成立的假设

- 不成立：背景的存法与长度是三份设计共用的契约（P4-01）。
- 不成立：`/wish` 入口由本稿实现；主 Agent 开启后卡片消失，`m3-1` 验收第 4 条在所有情形下都成立（P4-02）。
- 不成立：`ask_human` 是 M7 的工具（P4-04）。
- 不成立：卡片格式的商量不会动引擎字段（P4-06，`d-option-card` 16:21Z）。
- 未核实（本稿已列进 L4，可以接受）：在空白会话里执行命令后会话会不会离开开场画面；第三方 `conversation.input.dock` 组件收到 `useSession`、`inputActions`、`useInput`；`setDraft` 写入的 `/wish ` 回车后被认成命令。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9
round 4: HIGH 0, MEDIUM 2, LOW 7

结论：CHANGES_REQUESTED。第 3 轮的 11 条全部解决。本轮两条 MEDIUM 都来自与本稿同时写成的兄弟设计：M3 附录 0.2 与规则设计 0.5 对背景的存法和 `/wish` 入口的归属定得不同，M3 附录给本稿的回话（图上 16:31:53Z）没有落进 0.4。挡路条数仍是 2（第 1 轮到第 4 轮：6、2、2、2）。这一轮是人在上限之后额外给的；按 `question-11` 与 `docs/DEVELOPMENT.md` §1「必须改的发现一轮没有减少，就停下交人」，停下交人。两条的改法都只是对齐契约：P4-01 定背景的字段、长度与切第二阶段的前提，交 M3 与规则设计；P4-02 把 `/wish` 入口的实现规格交给 M3 附录 §2.5，本稿只留引导与面板的部分。

## 第 5 轮（2026-10-30，design.md 0.5）

评审对象：`design.md` 0.5，同目录的六张草图（`mockup-home.svg`、`mockup-plan.svg`、`mockup-drilldown.svg`、`mockup-boards.svg`、`mockup-onboarding.svg`、`mockup-wish.svg`）与 `graph-comment-v05.json`。判级标准是 `docs/DEVELOPMENT.md` §1.1「评审挡路的标准」：验收条件没有满足；会造成不可逆损失而没有预防；失败了发现不了、发现了没有恢复办法或事后查不到原因。按 `d-design-onepage`，违背方向清单也挡路。这是 plain-ui-design-v05 循环（`wf_2c8ad9b8a0912d7e`）的第一遍。

本轮核对时的外部事实：

- main 是 `16d6c2c`。本稿说依据 `21bc64f`；`21bc64f` 是它的祖先，之后 `src/`、`ui/`、`scripts/`、`packages/` 只有 `c17ff5d`（`src/glm-prompt/`）、`61be79a`（`src/guard/`）、`2618f37` 与 `87a4f21`（逐字门禁）四个提交，本稿引用的 `src/graph/` 与 `ui/src/` 行号按 HEAD 核对。
- M3 附录 0.3（`.agents/tasks/m3/design-addendum.md`，02:14）：§2.9 写 `PLAIN_LIMITS.background` 为 150，并写「P4-01 若改了数值，M3 跟着读常量」；§3.3 的 `proposalLineRefusal` 对背景一行只读这个常量。
- 规则设计 0.5（`.agents/tasks/rules/design.md`，01:59）第 1 轮评审为 CHANGES_REQUESTED（02:21）。`rules_propose` 的背景写「两三句前因后果」、150 个码点（第 56 行）；规则页有三个单选（第 322、1013 行）与新规则表单（第 1033 行）。
- 循环板设计 0.1（`.agents/tasks/schedules/design.md`，03:00，未经评审）在本稿 0.5（02:57）之后写成，依据的是本稿 0.4。
- 图：177 个节点；身份 human 的历史 21 条，带原话的历史 155 条（本轮数 `docs/graph/nodes`）。`m8-plain-language` 16:49:49Z 的批注记着第 4 轮两条的裁定；`d-chat-not-cards` 17:27:49Z 的批注是四行格式的定稿。

### 第 4 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P4-01 MEDIUM 背景的存法与上限 | 关闭（Closed） | §5.2 定节点字段 `background`：只在待决上，一行，去掉 `**` 后至多 60 个码点，`PLAIN_LIMITS.background` 一个常量。M3 附录 0.3 §2.9、§3.3 已把四行里的背景写进这个字段并只读这个常量，数值改了不用改代码；规则设计 0.5 第 56 行已写进这个字段，背景的长短由 §11 规则第 4 条转去。第二阶段有三个前提（§5.3），过渡期的显示写了，L2 有 M3 例题一例。新出现的两处写入方见 P5-05 |
| P4-02 MEDIUM `/wish` 入口两份设计都实现 | 关闭 | §1.5、§6.5、§6.6、§11 M3 第 1 条以 M3 附录 §2.6 为准；M3 附录 §2.6 第 2 种情形有「这个会话的 agent 是主 Agent」与退出按钮；文件表里没有 `ui/src/wish/`；没有图的卡片单独登记（`hourness-nograph`，order 41）；`mockup-wish.svg` 写明规格归 M3 |
| P4-03 LOW 两个模块管同一条规则 | 关闭 | `verdict.ts` 删去；`jargon` 调 `plainWordsIn`；例题只用 `PLAIN_QUESTION_GUIDE`；目标一级说「怎样算做成」（§3.3） |
| P4-04 LOW M3 附录的其余回话 | 关闭 | 第二问随卡片去掉；正文与草图不点名模型；目标页的「为什么」用 `labeledSections`（`src/graph/stage.ts`:61）读「问题：」一节；`ask_human` 不再出现 |
| P4-05 LOW 规则条数 | 关闭 | §5.3 的表 9 行，`typeWord` 只查模板，引擎查 8 条，前后一致 |
| P4-06 LOW 卡片写法在试用 | 关闭 | 卡片整体去掉，验收不再写表格、取决于与结论行 |
| P4-07 LOW 行号过时 | 关闭 | 本轮逐个核对，见「核实过的假设」 |
| P4-08 LOW 提议没有背景、草图用了「探针」 | 关闭 | §4.3 写明提议的 `why` 就是背景；`jargon` 查状态为提议的节点的 `title` 与 `why`；`mockup-home.svg` 没有「探针」 |
| P4-09 LOW 草图与正文的出入 | 关闭 | `mockup-onboarding.svg` 第 2 块解释主 Agent、子 agent、底账；`mockup-plan.svg` 页底改写，没有「定期」一组 |

### 方向清单逐条核对

| 方向 | 结果 |
| --- | --- |
| `d-chat-not-cards`：不出卡、不列选项 | 符合。面板没有选项、字母、推荐标签与写入按钮；四行按 17:27Z 的定稿显示：题目一段，四行各一段，标签不加粗，`splitBold` 取出的字加粗。节点页对选项式待决仍写选项字母，见 P5-06 |
| 同上：「需要你」列出在等人回话的方案，点开到主 Agent 的对话 | 不完全符合：确认与放行在人说任何一句话之后就不再列出，见 P5-01 |
| 同上：五键变成人说的五种话；随口的回答先复述再记 | 符合。面板上没有批准、拒绝、补充；讲细点、说重点只作展开与收起（§12 第 1 条，人可推翻）；待决的节点页显示「你说的」与「主 Agent 记成」 |
| 同上：跟随率改为原样同意、补充、否掉的比例，进指标流水 | 符合。先想后看与跟随率删去，三种记号在 `src/shared/answer-marks.ts`；计数单位见 P5-10 |
| `d-one-main-agent` | 符合。按持有者记录认主 Agent，读不出时有退路并标明；非主 Agent 对话里的叫法见 P5-12 |
| `d-defaults-readonly` | 符合。插件带来的条目只能看；档位照旧能选，改法是对主 Agent 说或打 `/rules peak`。面板上不放单选是本稿替人定的一处，§12 第 24 条写明它最可能不对，放行稿要列出 |
| `d-rules-visible` | 本稿这一侧符合：规则板有「会挡住动作的门」一组（`norm-merge-gate`、`norm-review-floor`），循环板有检查器、晨报、周报、夜间巡检。循环板设计 0.1 的页面与本稿的约定不同，见 P5-04 |
| `d-peak-mode`：默认少做；新手引导告诉人有这个模式、默认是少做、在哪里改 | 内容符合（上手页第 4 块）；送达不符合：新用户多半看不到上手页，见 P5-02。验收第 12 条的说法见 P5-03 |
| `d-design-onepage` | 符合。§2 逐条自查；§13 只有一件，按四行写：题目一段，四行各一段、各一处 4–7 个码点的加粗，背景 32 个码点，其余三行 15–21 个码点，整条末尾一句问话；放行稿在评审通过之后写 |
| `d-main-agent-models` | 符合。只提醒主 Agent 用强一点的模型，子 agent 的模型由它选 |
| `d-auto-drive` | 符合。面板没有开始、停止、推进的按钮；上手页写放行之后主 Agent 自己推进 |
| `metrics` | 符合。面板不写流水、不显示比例 |
| `schedules` | 符合。原 P4 由循环板回答，`repeat` 与「定期」一组删去，计划页底部指向循环板 |
| `d-ui-look-not-operate` | 符合。`ui/src/graph/apply.ts` 删去，运行控制换成说法与命令，L2 静态检查钉住 |
| 编排方对第 4 轮的两条裁定 | 符合。背景字段与上限由本稿定（60）；`/wish` 入口归 M3 |
| 原 P2、P4、P6 | P2 由 `m8-plain-language` 的正文回答，记为 agent 定、人可推翻（§12 第 16 条）；P4 由循环板回答；P6 按四行重问（§13） |

### HIGH

无。

### MEDIUM

#### P5-01 「需要你」里的确认与放行在人说任何一句话之后就消失；人说「讲细点」之后它还在等，却不再列出

- 类别：违背方向清单（`d-chat-not-cards` 第四点「『需要你』一节列出在等人回话的方案」，本稿 A4、A5）。
- 位置：§4.9 `awaiting` 第三条（人的 `user/message` 且 `isPersonMessage` 为真时清空）；§4.10 第 7 条；§1.4 验收第 6 条（b）；§12 第 21 条；§10.1 `tests/graph-live.spec.ts`；§10.2 第 4 步；`graph-comment-v05.json` 第一条（「人发消息即清空」）。
- 问题：
  - M3 附录 §3.7 把五键变成人说的五种话：人说「讲细点」「说重点」时，主 Agent「展开理由、证据与没选的做法，再问一次；不调工具」。确认需求与放行方案这时仍在等人回话，但按 §4.9，人的那句「为什么这样？」已经把 `awaiting` 清空；主 Agent 没有再调 `propose_to_human`，这一件不会回到「需要你」。人在主 Agent 的对话里说一句别的事（「先等等」「顺便看下 X」）也一样。
  - 结果：放行之前主 Agent 停着等人（`d-auto-drive` 要等放行才推进），面板「需要你」却写「现在没有要你回话的事」。主 Agent 对话里的流程条仍写「等你批准」（M3 附录 §2.6），所以不是完全看不见；但「需要你」正是人定下来看「在等我的事」的地方。
  - §12 第 21 条写的代价只有「人回话之后、主 Agent 复述等确认的那一会儿」，没有写讲细点、说重点与别的话，这几种比复述更常见。
- 改法：按会话里真的发生了什么来去掉一项，不按「人说过话」。
  1. `foldLive` 里，`awaiting` 的一项只在两种情形下去掉：同一个会话里 `record_human_answer` 的调用（经 `shownName`；常量 `RECORD_HUMAN_ANSWER` 与 `PROPOSE_TO_HUMAN` 一起放 `src/shared/tool-names.ts`）参数的 `kind` 与 `goal` 和这一项相同，且结果不是错误（三种 `answer` 都算：同意之后不再等；补充、否掉之后主 Agent 会改了再提）；或者一次新的 `propose_to_human` 成功，`kind` 与 `goal` 相同（新的一版换掉旧的）。去掉「人的消息清空」一条，`src/shared/person-message.ts` 在本稿里也就不需要了（它是否留给 M3 的 `personMessages`，由 M3 定）。
  2. `needsOf` 读 `awaiting` 时再按图过滤一次：`goal` 已关闭，或它的有效阶段已不是这一种要的阶段（`confirm` 要 `wish` 或 `interview`，`release` 要 `design`），就不列。主 Agent 没调 `record_human_answer` 而阶段被别的路改了时，也不会留下过时的一件。
  3. 验收第 6 条（b）改为「…交给人、同一目标同一种的 `record_human_answer` 还没成功的确认需求与放行方案」；§4.10 第 7 条、§12 第 21 条（代价改为「主 Agent 不调 `record_human_answer` 时这一件一直列着，直到目标的阶段变了」）、§10.1（讲细点之后仍在；`record_human_answer` 成功后消失、出错时仍在；同目标的新一版换掉旧的；目标关闭或阶段前进后 `needsOf` 不列）、§10.2 第 4 步（模拟人先问一句「为什么这样」再回话，两次之间 `awaiting` 仍有一项）与 `graph-comment-v05.json` 同批改。`stateVersion` 照旧升到 3。

#### P5-02 新用户的上手页与「第一次用？」一行多半不会自己出现：判「人用过这张图」的条件把接管与第一次 `/wish` 写下的原话也算进去了

- 类别：违背方向清单（`d-peak-mode`「新手教程里告诉人有这个模式、默认是少做、在哪里改」）；需求 B1 没有满足。
- 位置：§6.4「不自动出现的情况」第二条；§6.5 `firstVisit(storage, graphHasHumanHistory)`；§12 第 10 条；§1.4 验收第 12、15 条；§10.1 `tests/graph-panel-model.spec.ts`。
- 问题：
  - 上手页与 `FirstVisitLine` 用同一个判断：本机没有「上手页已看」，且图上没有身份 human 或带原话转述的历史。后一半是为了「今天的用户升级后不被打扰」。
  - 新用户的图很快就有带原话的历史：接管项目的 `bootstrap_apply` 以 `llm` 带人的原话批准这一版的全部节点（`.agents/tasks/bootstrap/design.md` §7.4）；新项目第一次 `/wish` 之后，`record_human_answer` 的确认需求以带原话的 `approve` 与 `edit` 写图（M3 附录 §3.5）。开场画面上 M3 卡片的主按钮是「写一句你想做的」，人最自然的顺序是先许愿、后打开右侧栏；那时图上已经有原话，上手页不再自动出现，`FirstVisitLine` 也不再显示（它只在空白会话里出现，而 `firstVisit` 已经为假）。
  - 高峰模式只在上手页第 4 块讲，GLM 包的上手不讲（§6.3 末段）。走上面这条路的人不会被告知高峰模式、默认少做与改法，除非自己点首页页脚「上手说明」。
  - 今天的图有 21 条身份 human 的历史（0.5 之前面板的拍板与运行控制写的）。0.5 的面板不再写图，新用户的图上几乎不会有身份 human 的历史；只看身份 human 就能认出今天的用户。
- 改法：
  1. 第二条改为「图上已有身份 human 的历史」（只看 `actor: 'human'`，不看 `relay`）。§12 第 10 条写明理由：0.5 之前面板以 human 写图，今天的用户有这类历史；0.5 的面板不写图，新用户只有带原话的历史，不会被挡住；人自己打 `/graph-run` 也写 human，这样的人已经会用这张图。
  2. 或者去掉第二条，只看本机记录：今天的用户升级后看到一次上手页，点一次「去首页」。二选一，推荐 1。
  3. 验收第 12、15 条的说法与 §10.1 的用例同批改：只有带原话历史的图上，上手页照样自动出现、`FirstVisitLine` 照样显示；有身份 human 历史的图上不出现。

### LOW

#### P5-03 验收第 12 条与 §6.4 第 4 块对「读不到是不是高峰」时的说法不一致

验收第 12 条写「第 4 块在规则板装上时出现，写明高峰模式有无影响、少做、不做三档……并写出此刻的档位」；§6.4 第 4 块与 §10.1 写规则板读不到是不是高峰时（没有 GLM 的计价服务）`guideLine` 为 `null`，高峰模式那几句不显示。只装编排层包（B4、验收第 11 条要求能单装）正是这种情形，照验收第 12 条做 L4 会判失败。另外第 4 块的固定文字「GLM 高峰时段更费积分」写在编排层包里，§2 末行说编排层的引导「不点名任何模型」。改法：验收第 12 条加「规则板给出此刻档位时（装了 GLM 包、读得到是不是高峰）」；§2 末行写明这几句只在有 GLM 的计价服务时显示，或者第一句改由规则板的 `guideLine` 一起给。

#### P5-04 循环板设计 0.1 已经写出，与本稿的板块约定有四处不同

本稿 §0 依据里说循环板设计「本稿写作时还没有文件」。0.1（03:00）现在在，依据的是本稿 0.4，与 0.5 的约定不同：

- 页面有写入控件：「你加的」一组有「新建一项」表单，每行「改」「删除」，「最近删掉的」里有「恢复」，经 `/loops-apply` 写（循环板设计 §6.1、§6.3、§7.2 第 5 条）。本稿 §4.7 与验收第 8 条要求页面没有写入控件，人加的条目改法写成对主 Agent 说的话。
- 名字：循环板设计 §7.1 的 `label` 是「循环」，页脚「规则 › 循环 › 经验 › 整张图 › 上手说明 ›」；本稿是「循环板」「规则板 › 循环板 ›」（人的叫法）。
- 上手页的字：循环板设计 §7.3 由它提供一句，经登记表给上手页；本稿 §6.4 末条说第 5 块的字固定在本稿，登记表只给 `guideLine`。
- 背景：`loop_propose` 的 `background` 写「两三句前因后果」，引擎改动合入之前按选项写「不加」「加上」（循环板设计 §6.2 第 1、2 条）；本稿 §5.2 定背景一行、至多 60 个码点，`d-chat-not-cards` 之后人定的题不列选项。

本稿的约定来自 `d-chat-not-cards` 第四点，应由循环板设计照改，所以不挡本稿。改法：§11 循环板一节与 `graph-comment-v05.json` 的 `schedules` 一条按上面四处逐条写明要求（页面没有表单，`/loops-apply` 没有面板这个调用方，人加的条目只经对话；`label` 为「循环板」；第 5 块的字归谁定，二选一写死；`loop_propose` 改为提议式四行，背景合 60 个码点），§0 依据改为引用 0.1，交编排者裁定。

#### P5-05 第二阶段的前提只列了 M3 与规则板，别的写人定待决的路没有列

§5.3 切到第二阶段的前提 (b)、(c) 只核对 `propose_to_human` 与 `rules_propose`。今天的设计里另有几处以 `llm` 或 `harness` 写人定的待决：循环板设计 §6.2 的 `loop_propose`（背景两三句）；接管项目设计里主 Agent 提的人定待决；编排方用命令行写图（身份 `llm`）。切早了这几处的提题会被拒，拒绝看得见，退回只改一个常量，所以不挡路。改法：(c) 写成通则「切换的那个提交列出当时代码里每一处以 `llm` 或 `harness` 提人定待决的工具（至少 `propose_to_human`、`rules_propose`、`loop_propose` 与接管项目的写图），每一处的契约测试在第二阶段的常量下通过」，§8.1「第二阶段切早了」一行同改。

#### P5-06 节点页对选项式待决写「选了 B「说法」」，带了选项字母

§4.5「怎么做」一节与待决节点页的选项式写「选了 B「说法」」，`mockup-drilldown.svg` 写「选了 G3：全拦…」「选了 A：…」；§5.4 `statusPhrase` 与 §4.8 写的是「选了「说法」」。改法：§4.5 与草图统一为「选了「说法」」，键只在底账里。

#### P5-07 板块登记表的几个函数是同步的，没有写数据变了怎样让首页重画

§4.7 的 `available`、`homeLine`、`guideLine` 是普通函数。规则板的数据来自投影，循环板的 `homeLine` 来自宿主写的 `view.json`，页面经 `readBytes` 异步读（循环板设计 §7.4）。三份设计都按这个接口写，接口里没有订阅，实现者只能各自缓存、首页不知道什么时候重画。改法：二选一写进 §4.7：(a) 三个都是 React 钩子（`useAvailable(sessionId)`、`useHomeLine(sessionId)`、`useGuideLine(sessionId)`），首页对每块登记过的板都调用；(b) 加 `subscribe(sessionId, listener): () => void`，三个函数只读板自己的缓存。

#### P5-08 「第一次用？」一行在开场画面上可能打不开右侧栏

sidebar-right README:144 写「No surface without a session ... the hero screen shows nothing on the right」；`openTab` 先调 `require()`（lib/client.js:2243–2245），没有挂着的会话界面时抛「sidebarRight: no session surface is mounted」（:2594–2597，:2098–2104 的注释说没有会话在屏上的命令「fails loudly」）〔推断：开场画面上空白会话的右侧栏没有被采用〕。§6.5 写了抛错时的退路，但退路的话「可以从右侧栏打开「项目图」」指向开场画面上没有的右侧栏。改法：L4 第 7 项明写核对在空白会话的开场画面上 `openTab` 能不能打开项目图；退路改为「发出第一句话之后，在右侧栏打开「项目图」」；L4 证实总是失败时，这一行改为点了只写一条本机记录，面板第一次打开时按它显示上手页（与 P5-02 的改法一起看）。

#### P5-09 §9.2 第 1、8 步改 `src/graph/engine.ts` 的写入权限与拒绝，没有标独立代码评审

`docs/DEVELOPMENT.md` §1.1 的「独立评审」一行包括「图引擎的权限与审计（`src/graph/engine.ts`……）」。第 1 步给 `LLM_EDITABLE`（`src/graph/engine.ts`:101）加 `why`、`background`，目标的 `why` 另有权限；第 8 步把警告换成拒绝。改法：两步标「独立代码评审」（M3 附录给它的第 6 步就这样标）。

#### P5-10 三种记号的计数单位没写清：一次放行会写下许多条带「同意」记号的 `approve`

M3 附录 §3.5：确认需求时写一条 `approve` 与一条 `edit`，放行方案时对放行集合里每个节点写一条 `approve`，再写一条 `edit`，`reason` 都以「人在对话里同意」开头。§5.6 说「指标流水按 `answerKindOf` 数」，§11 又说「由 harness 在 `record_human_answer` 写图的同时记」。按历史条目数，一次放行 20 个节点会记成 21 次同意，比例就歪了。改法：§5.6 与 §11 写明一次 `record_human_answer` 调用记一次（种类取它的 `answer` 参数），`answerKindOf` 只给变化一节认历史用；§4.8 对确认需求同样把目标自己的 `approve` 合进「你在对话里确认了……」那一行，与放行的写法一致。

#### P5-11 `/graph-apply` 没有了面板这个调用方，去留没写

本稿删 `ui/src/graph/apply.ts`，宿主命令 `/graph-apply`（`src/graph/panel-row.ts`）还在。M3 附录 §2.4 的「面板拍板的回写」、规则设计 R4 与循环板设计 §6.2 第 5 条都挂在「`/graph-apply` 拍板成功之后」。人不会在输入框里打 JSON，这几处之后只剩 `graph_decide` 一条路有用（AGENTS.md「不留死代码」）。改法：§9.1 或 §11 写明 `/graph-apply` 留下（写明谁还会调用它）还是连同这几处挂钩一起删，并转告 M3、规则板与循环板。

#### P5-12 非主 Agent 的对话里，「现在」一句可能把这个对话的 agent 叫成「主 Agent」

`ui/src/graph/agents.ts`:40 今天把面板所在会话的根 agent 一律标「主 Agent」；§4.2 第 3 条的例句以「主 Agent 在……」开头，§5.4 `liveLine` 没有写这个对话不是主 Agent 时怎么叫。按 `d-one-main-agent` 只有持有者会话的 agent 是主 Agent。改法：`liveLine` 多一个输入「这个对话是不是主 Agent」（§4.9 的结果），不是时写「这个对话的 agent 在……」，L2 加一例。

#### P5-13 小处

- M3 例题的背景「高峰时 GLM **更费积分**，现在会提醒模型」去掉 `**` 后是 20 个码点，§5.2 与 §11 M3 第 2 条写 18。
- 选项式待决的说明「这道题还按旧的选项写着」对 `rules_propose`、`loop_propose` 新提的选项式待决不准（它们不旧），改为「这道题列了选项，在主 Agent 的对话里回话就行」。
- `mockup-wish.svg` ② 的脚注仍写「规则设计 0.4」；这张图的规格归 M3，转给 M3 改。

### 核实过的假设（本轮新增或复核）

- ui-workspace：README:74（`openSession(target)` 同步替换主区域的会话，目标可以是已知的会话 id）；lib/client.js:1380（服务名 `uiWorkspace`）、:1471（`openSession`）。
- ui-subagent：lib/client.js:936–942（`inject` 含 `"uiWorkspace"` 与 `"sidebarRight"`）、:966（`ctx.uiWorkspace.openSession(address)`）；package.json 的 `client.inject` 含 `@deepseek-ai/dsh-client-ui-workspace`。
- session-projection：lib/index.js:53–63（`session/created` 且 `seq === 0` 时 `init(session.header, session.inheritedEventCount)`）、:73（注册时的 `init` 包装）、:126–131（`stateOf`）；README:58–65、:69（检查点）。
- 人的消息：api-session-controller lib/index.js:3224–3229（`source: {kind: "user", rpcId, …}`）；headless lib/index.js:345（`source: {kind: "user"}`）；dsh-session lib/index.js:138（`user/message`）。DSH 到点投来的提醒是 `source: {kind: "schedule"}`（dsh-schedule lib/index.js:1594），时间上下文是 `{kind: <插件名>, form: "snapshot"}`（dsh-time-context lib/index.js:236–239），本仓库的 notice 带 `form: 'notice'`（`src/shared/dsh-min.ts`:467）；都不会被 `isPersonMessage` 当成人的话。
- conversation lib/client.js：:19938（`conversation.input.dock` 声明）、:17909（开场画面里渲染）、:19954 与 :17882（`conversation.hero.options`）、:17386（样式表含 `.heroOptions:empty`）、:19347（`conversation.composer.dock` 只在 `variant === "composer"` 时渲染）、:20113、:19484 与 :17266（DSH 自己在 `input.dock` 登记）。
- api-session-controller lib/client.js：:3612（`projectionsBySession`）、:3899（`refreshProjections`，不打开会话读投影）、:4148–4166（`byId` 带 `blank`、`projectionValues`、`cwd`、`displayTitle`）。
- sidebar-right：lib/client.js:2243（`openTab`）、:4966（`provide("sidebarRight", …)`）、:2594–2597（`require()`）；README 74、83、93、144 行。
- ui-commands lib/client.js:1409–1419（`commands.list` 要求会话已保留且已打开）。
- workspace-files README:28–36（方法表）、:40（接受绝对路径；服务不对读文件做工作区范围的限制）、:58（`changes`）。
- 本仓库（HEAD `16d6c2c`）：`src/graph/engine.ts`:36、68、101、110；`src/graph/tools.ts`:354、361；`src/graph/projection.ts`:197、292、300；`src/graph/stage.ts`:61、90、97；`src/graph/run.ts`:13；`src/graph/panel-row.ts`:16–18、122–130；`ui/src/graph/common.tsx`:270；`ui/src/graph/Decisions.tsx`:29；`ui/src/graph/apply.ts`:20；`ui/src/graph/NodeDetail.tsx`:52；`ui/src/channel.js`:350；`ui/src/primitives.d.ts`:52；`src/glm-llm/zcode.ts`:385；`packages/hourness/package.json` 的 `client.inject` 含 sidebar-right。`src/graph/live.ts` 的折叠读 `tool/call {callId, name, arguments}` 与 `tool/result {message: {isError, source: {callId}}}`，`shownName` 认 `DeferredToolCall`，`turn/end` 清空 `pending`，`stateVersion` 为 2。
- M3 附录 0.3：§2.4（持有者记录的路径与形状 `{version: 1, sessionId, graphDir, since, commandId}`、`mainAgentOf`、「客户端不读记录」）；§2.6（`/wish` 入口三种情形、黄字不带模型名）；§2.8（`PLAIN_WORDS`、`plainWordsIn`、`PLAIN_QUESTION_GUIDE`）；§2.9；§3.3（`proposalLineRefusal`、`splitBold`、`renderProposal`）；§3.4（`propose_to_human` 的参数与输出）；§3.5（三种说法的字面与 `ANSWER_MARKS` 一致）；§3.7（讲细点、说重点不调工具）。
- 规则设计 0.5：`/rules peak <无影响|少做|不做>` 与 `/rules let <单号>`（第 1033 行）；档位出厂暂定无影响（第 57、107 行）。
- 图节点：`d-chat-not-cards`（含 17:21Z–17:27Z 的四条格式批注与 18:17Z 的 M3 落法）、`d-one-main-agent`、`d-defaults-readonly`（17:59Z 加的档位例外）、`d-peak-mode`（默认少做）、`d-rules-visible`、`d-design-onepage`、`d-main-agent-models`、`d-auto-drive`、`metrics`、`schedules`、`d-ui-look-not-operate`、`m8-plain-language`（16:49:49Z 的裁定、18:17:28Z 的 M3 契约）、`onboarding`，正文与本稿的引述一致。
- 草图：`mockup-home.svg` 没有写入按钮与「探针」，四行带加粗，第一件在 y 316–532，面板正文从 y 60 起；`mockup-boards.svg` 两页都没有控件，规则板有门一组，高峰模式有改法一行；`mockup-onboarding.svg` 不点名模型，第 2 块解释三个词；`mockup-plan.svg` 页底已改。

### 未核实或不成立的假设

- 不成立：「人在主 Agent 的对话里发过消息」等于「确认与放行不再等人」（P5-01）。
- 不成立：图上有带原话的历史就说明是今天的老用户（P5-02）。
- 已过时：「循环板设计本稿写作时还没有文件」（P5-04）。
- 未核实，可能不成立：在开场画面上 `sidebarRight.openTab` 能打开项目图（P5-08）。
- 未核实（本稿已列进 L4，可以接受）：第三方客户端包经 `inject` 拿到 `uiWorkspace`；桌面版的文件系统允许面板经 `readBytes` 读用户目录下的持有者记录；第三方 `conversation.input.dock` 组件收到 `useSession`；在空白会话里执行命令后会话会不会离开开场画面。

### 交给编排者记图的事项

本步只写评审文件，不写 `docs/graph/`。建议给 `m8-plain-language` 的批注：「设计评审第 5 轮（design.md 0.5，plain-ui-design-v05 第一遍）：CHANGES_REQUESTED，HIGH 0、MEDIUM 2、LOW 11；第 4 轮 9 条全部关闭。挡路的两条：P5-01 『需要你』里的确认与放行按『人发过消息』清空，人说讲细点、说重点或别的话之后它仍在等却不再列出（d-chat-not-cards 第四点），改为同一目标同一种的 record_human_answer 成功或新一版 propose_to_human 时才去掉，并按目标阶段过滤；P5-02 上手页与『第一次用？』一行在图上有带原话的历史时不自动出现，新用户在接管或第一次 /wish 之后就有这种历史，高峰模式与默认少做送不到（d-peak-mode），改为只看身份 human 的历史。另记 P5-04：循环板设计 0.1 的页面有表单与 /loops-apply，与面板『页面没有写入控件』的约定不同，待编排者裁定。」

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9
round 4: HIGH 0, MEDIUM 2, LOW 7
round 5: HIGH 0, MEDIUM 2, LOW 11

结论：CHANGES_REQUESTED。第 4 轮的 9 条全部关闭，两条 MEDIUM 来自 0.5 新写的部分：P5-01 是现场投影里 `awaiting` 的去掉规则，P5-02 是上手页自动出现的条件。两条的改法都在本稿内，不用等兄弟设计：P5-01 改折叠规则与 `needsOf` 的过滤，P5-02 改一个判断条件。这是本循环的第一遍；挡路条数与上一个循环的最后一轮（第 4 轮）同为 2，但不是同一批发现，本循环是否停下按 brief 在第二遍之后看条数有没有减少。

## 第 6 轮（2026-10-30，design.md 0.6）

评审对象：`design.md` 0.6，同目录六张草图（本轮改过的 `mockup-home.svg`、`mockup-drilldown.svg`、`mockup-boards.svg`、`mockup-onboarding.svg`、`mockup-wish.svg`，未改的 `mockup-plan.svg`）与 `graph-comment-v06.json`。判级标准同第 5 轮：`docs/DEVELOPMENT.md` §1.1「评审挡路的标准」（验收条件没有满足；会造成不可逆损失而没有预防；失败了发现不了、发现了没有恢复办法或事后查不到原因），按 `d-design-onepage` 违背方向清单也挡路。这是 plain-ui-design-v05 循环（`wf_2c8ad9b8a0912d7e`）的第二遍。

本轮核对时的外部事实：

- main 是 `480e264`。`21bc64f..480e264` 里碰 `src/graph/`、`ui/src/`、`src/shared/` 的提交没有；`scripts/probe/run-probe.mjs` 被 `15233dd`（zcode-3171-follow）改过，本稿引的 `/graph-apply` 两处（:594–612、:843–844）按 HEAD 核对仍在原行。
- 兄弟设计都已前进：规则设计 0.8（`.agents/tasks/rules/design.md`，06:04；图上提交 `2581225`「rules board design 0.8 approved; waits for the person's release」）；循环板设计 0.4（`.agents/tasks/schedules/design.md`，07:35，第 3 轮之后人准了再改一稿）；M3 附录 0.4（`.agents/tasks/m3/design-addendum.md`，07:38 起在写，§3.12 等节还没写成）；接管项目设计 0.2（02:12）。本稿 0.6（07:30）引的还是规则 0.5、循环板 0.1、M3 0.3，见 P6-01。
- 图：177 个节点；身份 human 的历史 21 条，带原话的 155 条（本轮重数 `docs/graph/nodes`，与本稿 §15.3 一致）。`graph-comment-v06.json` 的七条批注指向的节点都在图上；前两条（`m8-plain-language`、`onboarding`）已在 2026-10-29T23:40:24Z、23:40:25Z 写进图。

### 第 5 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P5-01 MEDIUM 确认与放行在人说任何一句话后消失 | 关闭 | §4.9：`awaiting` 以 `{kind, goal}` 为键，`propose_to_human` 成功时加上、同键换新，同键的 `record_human_answer` 成功时去掉（三种 `answer` 都算，出错不去掉），不看 `user/message` 与 `turn/end`；`needsOf` 再按目标阶段过滤（§4.3）。M3 附录 §3.4 的检查失败一律抛错（结果 `isError`），§3.5 的 `gate_unmet`、`not_shown`、`invalid`、`unavailable` 同样，所以「出错时不去掉」认得出。`release` 的 `partial` 是成功结果、阶段不变：这一项去掉，主 Agent 改好再提时由「加上」放回，这期间轮到的是主 Agent，不是人，不列是对的。验收 6(b)、§4.10、§8.1、§8.3、§12 第 21 条、L2（`graph-live.spec.ts`、`needsOf`）、L3（`glm-design-interview` 先问「为什么这样」）、L4 第 2 项同批改 |
| P5-02 MEDIUM 新用户的上手页被带原话的历史挡住 | 关闭 | §6.4、§6.5 只看 `actor: 'human'`。逐个核对新用户的图会被谁写：接管项目的规范模板以 `harness` 提议（bootstrap §4.2，第 386 行），`bootstrap_apply` 以 `llm` 带 `relay` 批准与拍板、以 `harness` 关任务与批注（§7.4 第 1–5 步，第 728–733 行）；M3 `record_human_answer` 全部以 `llm` 写（附录 §3.5 第 6 条）；`/wish` 本身不写图，由主 Agent 提议目标；命令行的身份固定为 `llm`（`src/graph/cli.ts`:3）。只有人自己打 `/graph-run` 写 `human`。验收第 12、15 条、§12 第 10 条与 L2、L4 第 7 项同批改 |
| P5-03 LOW 验收第 12 条与读不到高峰时的显示 | 关闭 | 验收第 12 条加了「规则板给出此刻的档位时」；§2 末行写明「GLM 高峰」只在读得到 GLM 计价服务时出现；L2 加「全文不含 GLM」一例；`mockup-onboarding.svg` 脚注一致。剩下的一处边角见 P6-02 |
| P5-04 LOW 循环板设计与板块约定四处不同 | 关闭 | §11 循环板写成四条要求。循环板设计 0.2–0.4 已照改（见 P6-01） |
| P5-05 LOW 第二阶段前提只列了两处 | 关闭 | §5.3 (c) 改为通则，列出已知五处与找入口的办法；§8.1、§9.2 第 8 步、§11 同改 |
| P5-06 LOW 节点页带选项字母 | 关闭 | §4.5 两处、`questionView` 与 `mockup-drilldown.svg` 都是「选了「说法」」，键只在底账 |
| P5-07 LOW 登记表没有变化信号 | 关闭 | §4.7 改为 `subscribe` 加 `snapshot`，面板侧 `useSyncExternalStore`（今天 `ui/src/graph/agents.ts`:32 就这样读会话列表），抛错时这块板当作不在；规则设计 0.8 §9.1（第 1167 行）已按这个接口登记 |
| P5-08 LOW 开场画面上 `openTab` 打不开 | 关闭 | §6.5 的引文本轮复核属实（见「核实过的假设」）；退路字句改了；L4 第 7 项明写核对 |
| P5-09 LOW 引擎权限两步没标独立评审 | 关闭 | §9.2 第 1、8 步都标了 |
| P5-10 LOW 记号的计数单位 | 关闭 | §5.6 末段一次调用记一次；`answerCallOf` 认 M3 附录 §3.5 表里每条写入都带的「（record_human_answer <callId>）」，认不出时退回 5 分钟合行；§4.8、§11 指标流水、L2 同改 |
| P5-11 LOW `/graph-apply` 没有调用方 | 关闭 | 删去，§9.1 列了文件、测试、探针与文档，§11 转告 M3、规则板与循环板；规则设计 0.8 第 939、1255 行已注明「plain-ui 合入后不再有」，循环板设计 0.4 第 132 行已删 `/loops-apply`。波及面还有几处没列，见 P6-03 |
| P5-12 LOW 非主 Agent 的对话里也叫「主 Agent」 | 关闭 | `liveLine` 多了 `mainHere`，`agents.ts`:40 的固定名字改为按它取；`mockup-home.svg` 写「这个对话的 agent」；L2 一例 |
| P5-13 LOW 小处 | 关闭 | 例题背景重数为 20 个码点；选项式的说明改为「这道题列了选项……」；`mockup-wish.svg` ② 的脚注已改 |

### 方向清单逐条核对

| 方向 | 结果 |
| --- | --- |
| `d-chat-not-cards`：不出卡、不列选项；一个方案四行，各自成段，重点几个字加粗 | 符合。面板上没有选项、字母、推荐标签与写入按钮；四行按 17:27Z 的定稿显示（§4.3）。§13 的问题按四行写：题目一段，背景 32 个码点、推荐 15、疑问 21、不做 20（去掉 `**` 后，本轮用脚本数），每行一处 4–7 个码点的加粗，末尾一句问话 |
| 同上：「需要你」列出在等人回话的方案，点开到主 Agent 的对话 | 符合。第 5 轮 P5-01 已改：人说讲细点、说重点或别的话之后仍列着，主 Agent 记下回话、提出新的一版或阶段过了才去掉 |
| 同上：五键变成人说的五种话；随口的回答先复述再记 | 符合。面板没有批准、拒绝、补充；讲细点、说重点只作展开收起；节点页显示「你说的」与「主 Agent 记成」；上手页第 2 块写「随口说的它会先复述再记」 |
| 同上：跟随率改为原样同意、补充、否掉的次数 | 符合。先想后看与跟随率删去；一次 `record_human_answer` 记一次，由 harness 记进流水，面板不显示比例 |
| `d-one-main-agent` | 符合。按持有者记录认主 Agent 的对话，读不出时有标明的退路；别的对话里叫「这个对话的 agent」 |
| `d-defaults-readonly` | 符合。插件带来的条目只能看；档位能改，改法是对主 Agent 说或 `/rules peak`（§12 第 24 条写明最可能不对的就是这一处） |
| `d-rules-visible` | 符合。规则板有「会挡住动作的门」（`norm-merge-gate`、`norm-review-floor`），循环板有检查器、合入后的完整检查、晨报、周报、夜间巡检；两份兄弟设计已按这个分组写（规则 0.8 §9.1、循环板 0.4 §2.4 去向表） |
| `d-peak-mode`：默认少做；引导告诉人有这个模式、默认是少做、在哪里改 | 符合。上手页第 4 块写三档、默认少做、少做是什么、两种改法与此刻档位，新用户的上手页会自动出现（P5-02 已改）。读不到是不是高峰时这几句也不显示，边角见 P6-02 |
| `d-design-onepage` | 符合。§2 逐条自查；一次至多三件；§13 只一件、按四行；放行稿在评审通过后写 |
| `d-main-agent-models` | 符合。只提醒「主 Agent 用强一点的模型」，子 agent 的模型由它选 |
| `d-auto-drive` | 符合。面板没有开始、停止、推进的按钮；上手页写放行之后主 Agent 自己推进 |
| `metrics` | 符合。面板不写流水；计数单位交给 harness |
| `schedules` | 符合。原 P4 由循环板回答，`repeat` 与「定期」一组删去 |
| `d-ui-look-not-operate` | 符合。面板没有任何写入，`apply.ts` 与 `/graph-apply` 删去，L2 静态检查钉住 `ui/src/graph/`；开场卡片「建一张项目图」与 GLM 对话框的「登录」不在面板里，是人在开场画面上的一次点击，与 M3 的 `WishCard` 同一种 |
| 编排方的两条裁定（背景字段归本稿、`/wish` 入口归 M3） | 符合。`PLAIN_LIMITS.background` 为 60，M3 附录 0.4 第 12 行已只读它；`/wish` 入口的规格归 M3 附录 §2.6 |
| 原 P2、P4、P6 | 符合。P2 由节点正文回答（§5.1，§12 第 16 条人可推翻）；P4 由循环板回答；P6 按四行重问（§13） |

### HIGH

无。

### MEDIUM

无。

### LOW

#### P6-01 本稿引的兄弟设计版本已过时，§11 与 §14 还在请编排者转达对方已经落实的事

- 位置：版本行之后的「依据」一段；§5.2（循环板「0.1 §11 写的是 150，下一稿改读这个常量」）；§6.4 末条；§11 规则板一节的标题与第 1–6 条、循环板一节的标题与第 1–4 条；§14 第 3、4 条；`graph-comment-v06.json` 的 `rules`、`schedules` 两条。
- 事实：规则设计已是 0.8（图上 `2581225` 记为通过，等人放行）：§9.1 按 `subscribe` 加 `snapshot` 登记（第 1167 行），页面没有单选与写入控件（第 1169 行），`/rules-apply` 删去（第 1204 行），默认少做只在 `effectivePeakMode` 一处定（第 361 行），§10.7 逐条答复了本稿 0.6（第 1482–1486 行）。循环板设计已是 0.4：`label: '循环板'`（第 922 行），页面上的写入与 `/loops-apply` 删去（第 132 行、验收第 18 条），`guideLine` 恒为 `null`（第 925 行），`loop_propose` 只记提议、经 `propose_to_human` 交给人（第 858 行），§17 答复了本稿 0.6（第 1287 行）。
- 后果：编排者照 §14 第 3、4 条转达，会把已经落实的要求再发一遍；循环板一节第 3 条说 `guideLine`「可选，例『有 1 项连着没过』」，循环板 0.4 定的是恒为 `null`，两边读法不一样（显示上不冲突：`null` 时第 5 块不出那一行）。不挡路：都是可逆的文字，不影响实现的正确性。
- 改法：依据一段改为规则 0.8、循环板 0.4、M3 附录 0.4（在写）；§11 两节改写为「已落实（规则 0.8 §9.1–§9.3、§10.7；循环板 0.4 §7.1、§8.1、§17），剩下要对方做的：……」，只留真正还开着的；§11 循环板第 3 条照循环板 0.4 写「`guideLine` 为 `null`，第 5 块不显示此刻一行」；§14 第 3、4 条与两条批注草稿改为「核对已落实」或删去。

#### P6-02 上手页第 4 块的高峰模式几句以 `guideLine` 为不为空判定，把「没装 GLM 包」与「装了但这一刻读不到」当成一回事

- 位置：§6.4 第 4 块；§11 规则板第 5 条（`guideLine`「读不到是不是高峰时为 `null`」）；验收第 12 条；`mockup-onboarding.svg` 脚注。
- 问题：上手页只自动出现一次。规则设计 0.8 §9.1 分得开两种情形：没有计价服务（第 1176 行「装了 GLM 通道包才有高峰时段」）与读不出是不是高峰（「读不到是不是高峰（<原因>），这一档现在不生效」）。本稿两种都给 `null`，第 4 块的高峰模式几句都不显示。装了 GLM 包的新用户第一次打开项目图时，计价服务恰好读不出（服务还在激活、抛错），人点「去首页」之后，引导再也不会讲高峰模式（`d-peak-mode`「新手教程里告诉人有这个模式」）。别的渠道：首页「现在」一行在读不出时同样没有；规则板页面写着，但人不一定点进去。没有任何地方发现「这个人没被告知过」。
- 为什么不挡路：只在读不出的那一刻第一次打开时发生；之后在高峰时首页有「GLM 高峰中 · 高峰模式：少做」一行，点开就是规则板上的三档与改法；首页页脚「上手说明」能重开。
- 改法：二选一。(a) 推荐：`BoardState` 加 `peakApplies: boolean`（规则板有 GLM 计价服务就为真，读得出读不出都算），第 4 块的高峰模式几句按它显示；`guideLine` 在读不出时给「现在读不到是不是高峰（<原因>）」而不是 `null`；只装编排层包时 `peakApplies` 为假，§2 末行「不点名任何模型」照旧成立。(b) 点「去首页」时若高峰模式几句没显示过，另记一条本机记录，之后 `peakApplies` 第一次为真时首页顶上出现一次「高峰模式默认是少做 · 讲细点」。L2 各加一例。

#### P6-03 删去 `/graph-apply` 的波及面没有列全

- 兄弟设计：
  - M3 附录 0.4 第 6 步（第 459 行）还要改 `src/graph/panel-row.ts`：「`/graph-apply` 的 `decide` 结果说法对提议式写……」。本稿 §11 M3 第 6a 条只撤了第 7 步，第 6 步这一处在本稿第 5 步会被删掉，M3 不必做。另：M3 附录 0.4 §2.4（第 201 行）仍写「面板拍板的回写」。
  - M5 设计 0.3（`.agents/tasks/m5/design.md` 第 574 行）：经验板「面板不写文件，按钮发命令（`remote.commands.execute`，同 `/graph-apply` 的通道），身份为人」。本稿 §4.7 的板块约定「页面没有写入控件」写明「规则板、循环板、经验板的设计照做」，§11 经验板一条也说「页面照 §4.7 的约定」；M5 现在的按钮与它冲突，`graph-comment-v06.json` 里没有给 `m5` 或 `lessons` 的一条。
  - 指标流水设计（`.agents/tasks/metrics/design.md` 第 57 行）把 `/graph-apply` 列为引擎的写入方之一。
- 本仓库：§9.1 没有列 `packages/hourness/locale/graph-panel/zh.json`:4 与 `en.json`:4（插件管理器里这一行的描述「面板背后的 /graph-apply 与 /graph-run 命令」，人看得到）、`packages/hourness/cordis.patch.yml`:52 的注释、`tests/graph-run.spec.ts`:131 的用例标题；`docs/DESIGN.md`:58 与 `docs/HANDOFF.md`:55 的 `glm-hourness/ui` 一行还写着四个页签。`src/graph/run-control.ts` 里的原文是「人在面板上点了」（:145）与「人在面板上暂停了」（:208），§9.1 写的是「人在面板里点了」，照原文改。
- 删去之后，以 `human` 身份写图的只剩人自己打的 `/graph-run`；命令行固定为 `llm`（`src/graph/cli.ts`:3）。§12 第 30 条可以补一句主 Agent 记不下人的回话时的退路（换一个会话 `/wish here`；任何会话的图工具带人的原话照样有人的权限，`src/graph/engine.ts`:150–154），这样「删掉之后人还能怎样直接定」有答案。
- 不挡路：漏改的都是文字或别的设计里的一处挂钩，合入时构建与测试会报出用例，余下的在 L4 走查里看得到。改法：§9.1 补上这几处文件；§11 M3 第 6a 条加「第 6 步对 `/graph-apply` 结果说法的改动不做」；§11 加 M5 一条（经验板的删除、恢复改为对主 Agent 说，页面没有按钮）与指标流水一句；`graph-comment-v06.json` 加给 `lessons`（或 `m5`）的一条。

#### P6-04 `mockup-boards.svg` 上两行来源与兄弟设计不一致

左页「默认规则 · GLM 高峰时段按全价计积分」下写「GLM 通道带来的 · 只能看」；规则设计 0.8 §9.1（第 1175 行，0.6 评审 F65）定的是「项目编排带来的 · 只能看；高峰时段来自 GLM 通道」。右页「高峰开始与结束时，按高峰模式收放活」下写「GLM 通道带来的 · 只能看」；循环板设计 0.4 验收第 2 条（第 93 行）与 design-context「Seam rulings」第 4 条定的是「项目编排带来的 · 依据 GLM 通道的高峰时刻与规则板的高峰模式 · 只能看」。草图会给人看，来源说错就是「插件带来的只能看」这一条讲错了对象。改法：两行照两份设计改。

#### P6-05 `awaiting` 与 M3 附录 0.4 新加的会话投影 `hournessTalk` 认的是同一件事

M3 附录 0.4 第 13 行宣布把「人的消息与交给人的提议」改从会话投影 `hournessTalk` 读（§3.2 在写）。本稿的 `awaiting` 在 `graphLive` 里另折叠一遍「`propose_to_human` 成功了」：本稿按工具名（经 `shownName`）加结果不是错误认，M3 0.3 §3.2 的 `shownProposals` 按结果正文里的 `tool: 'propose_to_human'` 认。两套认法以后可能走样（例如别名或结果形状变了只改了一处），后果只是面板多列或少列一件，L3 第 4 步能发现。改法：M3 附录 0.4 §3.2 写成后，把「这次调用是不是交给人成功了」的判定抽成 `src/shared/` 里的一个纯函数，两处共用（图目录不能导入设计目录，所以放公共库）；或在 §4.9 写明两处的认法各自的依据与 L3 怎样对照。

#### P6-06 小处

- L4 第 7 项开头「清掉记录后在有图的工作区第一次打开，六块……」：按 0.6 的规则，本仓库的图有 21 条身份 human 的历史，上手页不会自动出现。改为「在一张没有身份 human 历史的临时图上第一次打开」，本仓库的图上核对「不自动出现」与页脚重开。
- §4.10「`record_human_answer` 出错：仍在；主 Agent 在对话里说明原因，人照样知道在等他」：出错是 `gate_unmet`（人同意了、需求卡或放行门禁重查不过）时，轮到的是主 Agent 补齐再提，这一件以「等你确认」列着会让人以为还要再说一遍。补半句「门禁重查不过时，主 Agent 补齐后再提会换掉它」即可，不用改规则。

### 核实过的假设（本轮新增或复核）

- sidebar-right lib/client.js:2098–2104（没有会话在屏上的命令「fails loudly」）、:2243–2245（`openTab` 先 `require()`）、:2594–2597（抛「sidebarRight: no session surface is mounted」）、:4966（`ctx.reflect.provide("sidebarRight", controller)`）；README:144（「No surface without a session ... the hero screen shows nothing on the right」）。
- ui-workspace README:74（`openSession(target)` 同步替换主区域，目标可以是会话 id）、lib/client.js:1471（`openSession`）。
- `packages/hourness/package.json`:36–39 的 `client.inject` 有 sidebar-right、workspace-files、remotes，没有 ui-workspace（本稿 §7 已标「是否必须，L4」）。
- 本仓库 HEAD `480e264`：`src/graph/live.ts` 的 `turn/end` 清空 `pending`（:117），`shownName` 认 `DeferredToolCall`，`stateVersion` 为 2；`src/graph/panel-row.ts`:48（`APPLY_COMMAND`）、:122–130（`graphLive` 注册）、:175–176（`/graph-apply` 注册与描述）、:181–183（`/graph-run`，描述「项目图面板用：开始、暂停或重做一个任务」）；`src/graph/run.ts`:13（`RUN_ACTIONS`）；`src/graph/labels.ts`:91–92；`src/graph/engine.ts`:101（`LLM_EDITABLE`）、:150–154（带 `relay` 的 `llm` 写入有人的权限）；`src/graph/cli.ts`:3（命令行身份固定为 `llm`）；`ui/src/graph/agents.ts`:32（`useSyncExternalStore`）、:40（根 agent 固定叫「主 Agent」）；`ui/src/graph/apply.ts` 是 `commands.execute` 在 `ui/src/graph/` 下的唯一调用点，`common.tsx`:16 与 `NodeDetail.tsx`:52 经它写；`scripts/probe/run-probe.mjs`:594–612、:843–844 是 `/graph-apply` 的两步与两条判据。
- 图的计数：177 个节点，身份 human 的历史 21 条，带 `relay` 的 155 条。
- §13 四行的码点数与加粗（脚本数）：背景 32（加粗 6），推荐 15（7），疑问 21（4），不做 20（7）；题目 9。M3 例题的背景 20。都合 §5.2 与 M3 附录 §3.3 的上限。
- M3 附录：§3.4 检查失败一律抛错；§3.5 参数 `answer: 'agree' | 'add' | 'reject'`、全部以 `llm` 写、表里每条写入带「（record_human_answer <callId>）」；0.4 第 12 行背景上限只读 `PLAIN_LIMITS.background`。
- 接管项目设计 0.2：规范模板以 `harness` 提议（§4.2，第 386 行）；`bootstrap_apply` 以 `llm` 带 `relay` 批准、拍板、拒掉，以 `harness` 关任务与批注（第 728–733 行）；没有以 `human` 写图的地方。
- 规则设计 0.8 与循环板设计 0.4 的行号见 P6-01；规则 0.8 第 939、1255 行已注明 `/graph-apply`「plain-ui 合入后不再有」。
- 草图：`mockup-home.svg` 没有写入按钮，「现在」写「这个对话的 agent」，需要你第一件四行带加粗；`mockup-drilldown.svg` 六道题都是「选了「…」」，没有字母；`mockup-boards.svg` 两页没有控件，脚注写明；`mockup-onboarding.svg` 第 4 块高峰几句与条件、第 5 块「交回之后提醒派审查」、开场画面的退路灰字；`mockup-wish.svg` ② 脚注「order 170 空着（规则设计 0.5 去掉了在场按钮）」。

### 未核实或不成立的假设

- 不成立（已过时）：规则设计「0.5，在改」、循环板设计「0.1，未经评审」（P6-01）。
- 未核实，本稿已列进 L4，可以接受：开场画面上 `sidebarRight.openTab` 能不能打开项目图（L4 第 7 项）；第三方客户端包经 `inject` 拿到 `uiWorkspace`；桌面版允许面板经 `readBytes` 读用户目录下的持有者记录；第三方 `conversation.input.dock` 组件收到 `useSession`；空白会话里执行命令后会不会离开开场画面。
- 未核实：M3 附录 0.4 的 `hournessTalk` 的形状（§3.2 还没写成，P6-05）。

### 交给编排者记图的事项

本步按 brief 只写评审文件，不写 `docs/graph/`。建议给 `m8-plain-language` 的批注：「设计评审第 6 轮（design.md 0.6，plain-ui-design-v05 第二遍）：APPROVED，HIGH 0、MEDIUM 0、LOW 6；第 5 轮 13 条全部关闭，挡路条数 2 → 0。不挡路的六条留给写放行稿或实现前顺手改：P6-01 引的规则设计、循环板设计版本过时（已是 0.8、0.4，§11 的要求对方已落实）；P6-02 上手页的高峰模式几句在装了 GLM 包但这一刻读不到高峰时也不显示，建议 BoardState 加 peakApplies；P6-03 删 /graph-apply 的波及面补 M3 第 6 步、M5 经验板的按钮、指标流水、插件描述与两份文档的 ui 一行；P6-04 规则板与循环板草图上的两行来源照兄弟设计改为「项目编排带来的」；P6-05 awaiting 与 M3 0.4 的 hournessTalk 共用一个判定；P6-06 小处。下一步写 onepage.md 给人看。」另建议给 `lessons`（或 `m5`）一条：「plain-ui 0.6 §4.7：经验板页面照板块约定没有写入控件，人删除、恢复条目改为在主 Agent 的对话里说；M5 设计 0.3 第 574 行的面板按钮与它冲突，下一稿改。」

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9
round 4: HIGH 0, MEDIUM 2, LOW 7
round 5: HIGH 0, MEDIUM 2, LOW 11
round 6: HIGH 0, MEDIUM 0, LOW 6

结论：APPROVED。第 5 轮的 13 条全部关闭，挡路条数由 2 降到 0。0.6 新写的部分（`awaiting` 的去掉规则与阶段过滤、只看身份 human 的上手条件、`subscribe` 加 `snapshot`、删去 `/graph-apply`、计数单位）逐条核对过宿主源码与兄弟设计，没有新的挡路发现。六条 LOW 都可逆、看得见、有改法，留给写放行稿或实现前处理，不要求再出一稿。

## 第 7 轮（2026-10-31，design.md 0.8）

评审对象：`design.md` 0.8（含 0.7 的全部内容）。0.7 当时只有单步写稿、没有跑过独立评审（图上 `m8-plain-language` 2026-10-30T06:11Z 的批注），所以这一轮是 0.7 与 0.8 的第一次独立评审；上一个通过的是第 6 轮（0.6）。0.8 属于对齐轮（`d-alignment-rounds`，工作流 `wf_3794f89cc38873d4` 的 G 支），写稿中途被账号用量上限打断过一次，接手的作者重做了正文。判级标准同第 5、6 轮：`docs/DEVELOPMENT.md` §1.1「评审挡路的标准」（验收条件没有满足；会造成不可逆损失而没有预防；失败了发现不了、发现了没有恢复办法或事后查不到原因），违背方向清单也挡路。第三档在前几轮写作 LOW，这一轮起写 NIT，是同一级。本轮只读文件，不重跑作者做过的事，不改设计。

范围是简报点名的五件：（1）持有者记录的位置；（2）「影子→试运行」一条作废，板上条目要显示脚本原文、改过要等再同意、超时或崩溃时怎样；（3）高峰模式几句写明主 Agent 任何一档都随时回话；（4）§11「两层循环」对 M3 附录 0.5 的每模块放行与 M7 设计 0.6 的 `derivedStage` 的核对，不合的按规则 2 记成请求；（5）被打断草稿的处理。另复查第 6 轮六条，并读了图上比 0.8 新的批注。

本轮核对时的外部事实：

- main 是 `e57e744`（`m7` 分支同名）。设计核对用的 `419b6ea` 之后，`src/graph/`、`ui/src/`、`src/shared/` 没有任何改动（`git diff --name-status 419b6ea HEAD` 为空）。`21bc64f` 之后 `src/graph/` 新增 `execute-stage.ts`、`main-agent-holder.ts`、`pins.ts`、`plain-question.ts`、`proposal.ts`，与依据段一致。`src/shared/answer-marks.ts`、`src/graph/modules.ts`、`plain.ts`、`plain-view.ts` 还不存在，`src/shared/tool-names.ts` 里还没有 `PROPOSE_TO_HUMAN`、`RECORD_HUMAN_ANSWER`、`shownProposalOf`，设计都按待建写。
- M3 附录 0.5（`.agents/tasks/m3/design-addendum.md`）§2.4 仍把持有者记录放在 `<userHome>/main-agent/<sha256(projectKey) 前 16 位>.json`；§10 末「留给对齐轮的」第一条写明「持有者记录搬进项目的 `.llm/`」本版没有做，只有快照流水搬了（§2.5 第 6 步，R5-M1）。所以简报与节点 06:11Z 批注里「照 M3 附录 0.5 现在写的，记录在项目的 `.llm/`」与事实不符；设计 §15.5 已如实指出。`design-context.md`「Both boards are hook-style; storage scope」与宪章 0.7 §9 的表确实把「主 Agent 是哪个会话的记录」放在项目的 `.llm/`。
- `m8-plain-language` 在设计 0.8 写完之后又有两处批注：2026-10-30T21:02Z 接管设计 0.5 的请求（节点与 `onboarding` 各一条，点名「请对齐轮（G 支）一并处理」），与 21:23Z M4 设计 0.5 的请求（07:12Z 那条的重申，M4 自己写「等 dogfood 之后处理」）。接管设计停在 0.5（`bootstrap/align-resume-gate.json`：CHANGES_REQUESTED，F44 MEDIUM；`graph-ops-orch-ruling.json`：自举之后再改）。

### 第 6 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P6-01 引的兄弟设计版本过时 | 关闭，接管项目一处例外，见 P7-02 | 依据段与 §11 现在引规则 0.10、循环板 0.6、M3 附录 0.5、M7 0.6，与盘上版本一致；依据段仍写接管项目 0.3 |
| P6-02 上手页高峰几句漏讲 | 关闭 | `BoardState.peakApplies`（§4.7）、验收 12、§6.4 第 4 块、§10.1 都在；0.8 在其上加主 Agent 一句 |
| P6-03 删 `/graph-apply` 的波及面 | 关闭 | §9.1 列了插件描述两处、`cordis.patch.yml`、测试标题、`run-control.ts`:145、:208（本轮对 HEAD 核对，原文是「人在面板上点了」「人在面板上暂停了」）、M5 与指标流水各一条；两份文档的行号已漂移，见「未核实」 |
| P6-04 草图两行来源 | 关闭 | `mockup-boards.svg` 的两行来源与规则 0.10 §9.1、循环板 0.6 §8.2 第 3 项一致 |
| P6-05 `awaiting` 与 `hournessTalk` 两套认法 | 关闭 | 共用 `shownProposalOf`，M3 附录 0.5 §3.2、§3.14.9 接住；余一句过时文字见 P7-04 |
| P6-06 小处 | 关闭 | L4 第 7 项改用没有 human 历史的临时图；§4.10 有 `gate_unmet` 一句 |

### 简报点名的五件

| 点 | 结果 | 依据 |
| --- | --- | --- |
| 持有者记录在项目的 `.llm/` | 设计的处理正确，简报的前提不成立 | M3 0.5 没有搬（见上）。设计没有替 M3 写死新位置：§4.9 第 1 步把路径只放在 `panel-row.ts` 的一个薄包装 `holderPathOf`，搬家前转调 main 上已有的 `holderFileOf(holderHome(ctx), dir)`（`src/graph/main-agent-holder.ts`:65、:70 核对属实），搬家后换成 M3 导出的按项目根定位的函数；§2、§12 第 39 条、§15.5、§16 都写明，§11 请求 1 请 M3 搬家时同时给出绝对路径。这符合节点 06:11Z 批注里编排方的原意（「随 M3 下一稿改，面板只改取路径那一处」）。余 P7-08 |
| 「影子→试运行」一条作废 | 符合 | §4.7 删去这条换词，加「带脚本或检查的条目」一组：路径与原文、是不是你同意的那一版（改过就不跑、等再同意）、超时与出错时怎样、效果看得见与撤得快；字句与规则 0.10 §9.1（脚本路径、「和你同意的那一版一样/不一样」、超时或出错时放行还是拦下、7 天计数）和循环板 0.6 §8.2 第 5 项（「脚本：你 <日期> 同意的那一版」「超时 60 秒：超时算没跑完，告诉主 Agent，这次的事件下次再跑；崩溃算没过」「脚本改过了，先不跑」）逐条对过，对得上。验收 8、12 与 L2、L4 同改；`mockup-boards.svg` 与 `mockup-onboarding.svg` 全文搜不到「影子」「试运行」；设计正文里这两个词只出现在「作废」「不出现」的说明里。余 P7-03 |
| 高峰模式几句 | 符合 | §0、验收 12、§2、§4.7 新段、§6.4 第 4 块、§10 的 L2 与 L4、`mockup-boards.svg`（规则板高峰模式一组，y=574）、`mockup-onboarding.svg`（第 4 块，y=640–660）都写明「三档都不影响主 Agent：它任何时候都照常回话，高峰模式只管它派出去的子 agent 与重活」；改档位写两条路（跟主 Agent 说，或 `/rules peak`），没有「只能」。与规则 0.10 §3.6（派 GLM 子 agent 的那一次调用除外，管的是被派的子 agent）和 `src/shared/peak-mode.ts` 的 `peakModeIntro`（「主 Agent 不受影响，随时回话」）一致。首页「现在」的高峰一行仍是规则板的 `homeLine`，设计写明字归规则设计 |
| §11「两层循环」对 M3 0.5、M7 0.6 | 符合，余几处小的 | M3 一侧：`modulesOf`、`frameworkOf`、`directionsOf` 与 §3.14.1 逐项相同；大循环放行的四步次序（先给候选写 `design`、再批准、最后写目标 `release`，§3.14.2）、模块放行的 `module` 参数与 `reason` 记号（§3.14.3、§3.14.4）、退回两档的写路径（§3.14.7、§3.14.8）、「新提的直接特性批不了」（§3.8 第二条 c、§3.14.1）都与设计对照表一致。M7 一侧：`derivedStage` 的取值顺序（完成为 `operate`；分了模块的目标没有模块放行为 `release`；有进行中或可开工的任务为 `execute`；都关了或都在等审查与门禁为 `merge`；没有任务或都缺派发属性为 `decompose`）与 `moduleStateOf` 的五行对得上；`src/graph/execute-stage.ts` 头注释确写「no file system and no Node built-ins」，它引的 `format`、`parse`、`projection`、`schema`、`stage` 五个文件也没有 `node:` 导入，客户端可导入属实，请求 2 成立。设计记了两条请求（持有者记录的绝对路径、`execute-stage.ts` 可导入的一句），面板这一侧改了三处，核对表逐行有出处。余 P7-01、P7-04、P7-07 |
| 被打断草稿的处理 | 符合 | 见下「核实过的假设」第 1、2 条。余 P7-09 |

### 方向清单逐条核对

| 方向 | 结果 |
| --- | --- |
| `d-boards-as-hooks`、宪章 0.7 §3.2 第 3 条与 §6 | 符合：页面无试运行这一说，四样代替影子期都在；见 P7-03 |
| `d-rules-in-repo`、宪章 0.7 §9 | 符合：运行时状态含持有者记录归项目 `.llm/`；本机界面记录（看过没有）留在浏览器，设计写明不是项目状态 |
| `d-main-agent-peak-exempt` | 符合（上表） |
| `d-agent-examples`（规则 7，不得用记账作示例） | 符合：`mockup-home.svg` 的需求名换成「读书会报名」，`mockup-wish.svg`、`mockup-onboarding.svg` 的工作区名换成 `reading-club`；设计里「记账」「expense-cli」只出现在 §0 草图段、§15.5 与 §16 的 0.8 行里说明换掉了什么的地方（本轮对 `plain-ui/` 下除 `v0.*/` 外的文件全文搜过，草图里没有）；草图与正文里的其余例子（服务器巡查、`migrations/`、备份检查）都与记账无关 |
| `d-freeze-until-dogfood`、规则 2 | 符合：设计只写自己目录；对 M3、M7 各一条请求记在 §11 末与 §14 第 17、18 条，等编排者写入图。`graph-ops-align.json` 此刻还不在 `plain-ui/` 里，设计写明由后一步写出 |
| `d-alignment-rounds`（只改与新决定冲突的地方） | 符合：与 `v0.7/design-0.7.md` 的差异是 123 行增、37 行删，落点全在 §0 头部、验收 6/8/12/17、§2 三行、§4.3、§4.7–§4.9、§4.11、§5.4、§6.4、§8.2、§9.1、§10、§11、§12 第 39–42 条、§13、§14 第 16–19 条、§15.5、§16，别处原样 |
| 规则 6（§13 的格式）、规则 8（干净区） | 格式符合：一件，标题加背景、推荐、疑问、不做四段，标签不加粗，每行一处加粗，问句在最后；全文没有人设与语气词；用词余 P7-05 |

### HIGH

无。

### MEDIUM

#### P7-01 「新提的模块不列成等你批准」这条过滤没有按两层循环的开关生效，在本仓库今天的图上会让一个提议在面板上哪里都看不到

- 位置：§4.3 表「等批准的提议」一行（0.8 新加的「也不是已放行的、分了模块的目标的直接特性子节点」）；验收第 6 条（c）；§10.1「0.8，持有者路径与两层循环的几处小改」里 `needsOf` 一句。对照：验收第 17 条、§4.11 边界情况「本仓库今天的图」、§12 第 35 条。
- 问题：两层循环的显示以图上有 `norm-directions` 为开关（§4.11、§12 第 35 条），新提模块改列在「框架与模块」页（§4.3 说「它改列在『框架与模块』页」）。但这条过滤本身写在 `needsOf` 的通用规则里，验收第 6 条（c）也没有带这个前提，只有验收第 17 条的同一句受「图上有方向清单时」限制。两处不一致。
- 本仓库的形状（本轮查了 `docs/graph/nodes`）：目标 `hourness` 是 `stage: execute`、已放行，下面有带 `stage` 的特性 `orch`（`design`，已批准）；目标 `glm-house` 下有 `bottom`（`execute`，进行中）。按 §11 对照表「另用 `modulesOf` 判断有没有模块」，这两个目标今天都是「分了模块」的。今天没有开着的提议特性，但只要有人往 `hourness` 下提一个新特性，面板一实现这条过滤，这个提议就不进「需要你」；而「框架与模块」页没有 `norm-directions` 时不出现，所以它在面板上哪里都看不到。M3 附录 0.5 §3.8 第二条 c 的拦截属于 `main-agent-graph-stage`（M3 第 8 步），合入之前批准是做得到的，人却看不见有东西等他。这是「失败了发现不了」。
- 另一处没写死：「分了模块」「已放行」用哪个函数。M3 的 c 条件用 `isSplit`（有模块**或模块候选**，§3.14.1），设计 §11 却说面板用 `modulesOf` 判断；两者在「已放行、没有模块、新提了一个特性」时不同（新提的特性自己就是候选，`isSplit` 为真）。
- 改法：
  1. §4.3 表、验收第 6 条（c）、L2 的 `needsOf` 一句都写明：这条过滤只在 `directionsOf(graph)` 有值（两层循环的显示打开）时生效；没有方向清单时照 0.7 列成「等你批准」。
  2. 条件与 M3 §3.8 第二条 c 一字对上：父节点是目标、类型特性、状态提议、没有 `stage`，目标的有效阶段为 `release` 或其后（`isPostRelease`），且 M3 的 `isSplit(goal)` 为真；§11 对照表那行「另用 `modulesOf` 判断有没有模块」改成同一个函数。
  3. L2 加一例：本仓库形状（`stage: execute` 的目标，下有带 `stage` 的 `orch`，再加一个无 `stage` 的提议特性）。没有 `norm-directions` 时 `needsOf` 仍列它；有 `norm-directions` 时不列、`modulesView` 的「新提的」里有它。
  4. 如果这样让本仓库往已放行的目标下加新里程碑特性变成批不了，那是 M3 的 c 与 `isSplit` 的定义带来的，按规则 2 在 §11 末再记一条给 M3 的请求（c 只对 `modulesOf` 非空的目标生效，或写明本仓库怎么加里程碑），面板不绕。

#### P7-02 图上比 0.8 新的批注没有接：接管设计 0.5 点名要 G 支处理的三件，与 M4 设计 0.5 的请求

- 位置：依据段「接管项目设计 0.3（命令 `/hourness-init`，它另有对齐轮在改）」；验收第 14 条；§6.6；§7 的 `/hourness-init` 一行；§10.3 第 7 项末句；§5.3 第二阶段前提 (c) 的入口清单与 §11「接管项目」一段；验收第 6 条、§4.3 的「三种事」。
- 事实：
  - 节点 `m8-plain-language` 与 `onboarding` 2026-10-30T21:02Z 各有一条（接管设计 0.5 §3.1、§3.2、§4.2、§15.1）：（一）接管行在时，没有项目图一节与验收第 14 条改为指向 `/wish`（「在对话里发 /wish：主 Agent 先看一遍这个项目再接手」），卡片按钮执行 `/wish` 或把它写进输入框；（二）判有没有项目图的是 `nodes/` 下有没有 `.json`，「建一个空目录就是一张空图」在接管行在时不再成立；（三）第二阶段前提 (c) 里接管不再以 `llm` 或 `harness` 写人定的待决，剩下要契约测试的只有接管提的三个规范模板的 `title` 与 `why`。该批注写明「0.7 改之前 `/hourness-init` 在没有图、不是主 Agent 的会话里返回成功的回复并写明发 /wish，按钮不会显示成失败」，所以现在不会出错，但验收第 14 条是 §13 里要人签的 17 条之一，人签完再改要人再出手。
  - 节点 07:12Z 与 21:23Z 的 M4 请求：「需要你」(b) 一类再加开着的申报（`request_exception` 的 ask 结果）。M4 自己写「等 dogfood 之后处理」，所以不要求现在做；但它会把验收第 6 条的「三种事」变成四种，也是一处要人改的验收字句。
  - 接管那两条是 21:02Z 写入，晚于 0.8 的完稿，不是作者漏读；M4 那条的 07:12Z 版早于完稿。设计里没有这些请求的记录，依据段还写着接管 0.3。
- 改法（只记录与条件分支，不改方向；接管设计未放行、停在 0.5，M4 自己推迟，所以不照单全收）：
  1. 依据段改为接管设计 0.5（G 支读时停在 0.5，F44 开着，自举之后再改）、M4 设计 0.5。
  2. 验收第 14 条、§6.6、§10.3 第 7 项末句写成条件分支：接管行装上、`/wish` 能开接管时，面板与没图的卡片指向 `/wish`（卡片按钮执行或写进输入框）；没装时保持现在的做法。「建一个空目录就是一张空图」只在没有接管行时成立，判有没有图以 `nodes/` 下有没有 `.json` 为准。
  3. §5.3 前提 (c) 与 §11「接管项目」一段改成：接管不再以 `llm`、`harness` 写人定的待决，剩下要契约测试的是接管提的三个规范模板的 `title` 与 `why`；`bootstrap_apply` 不挡上手页的一句保留。
  4. §11 加一小段 M4：请求内容（graphLive 认 `request_exception` 的 ask 结果，同一 `ref` 见到 `hourness-request` 的 `request: {ref, outcome}` 或过 2 小时去掉，显示题目与四行，链到申报所在会话）、M4 推迟到自举之后、到时验收第 6 条的「三种事」改成四种并由人改。§14 加一条给 `m8-plain-language` 与 `onboarding` 的批注，写明这三件与 M4 一件已读入及处理。

### NIT

#### P7-03 §4.7 把「最近 7 天跑了几次、失败几次、超时几次」写成两块板的页面都要有，循环板 0.6 的页面没有这一项

- 位置：§4.7「效果看得见与撤得快」一条；验收第 8 条的「命令的路径」。
- 事实：规则 0.10 §9.1「你定的规则」一组有 7 天的跑了几次、最长用时、失败、超时、晚到的拦下；循环板 0.6 §8.2 第 5 项对脚本条目写路径、「脚本：你 <日期> 同意的那一版」、一行超时、展开是脚本原文、「要改」一行，每项点开有最近 5 次运行；7 天内超时 3 次以上的是周报的一节（§6.11）。`mockup-boards.svg` 画的也是规则板有 7 天计数、循环板只有「上次」。检查类条目没有脚本路径，写的是工具节点与命令。
- 后果：§4.7 写「两块板的页面对这类条目都写这四样」，等于对已放行的循环板提了一条它没有的页面要求，又没按规则 2 记成请求。不影响实现，验收第 8 条没有要求 7 天计数。
- 改法：该条改成分板写：规则板写 7 天计数；循环板写上次的结果，点开有最近 5 次运行，7 天内的超时次数在周报。验收第 8 条「脚本或命令的路径」改为「脚本的路径，检查类写它用的工具节点与命令」。

#### P7-04 §11 M3 第 6 条的正文仍写 `shownProposalOf` 返回 `{kind, goal, module?}`，同一节开头已改为返回整个结果对象

- 位置：§11 M3 一节开头（「返回整个结果对象」）与第 6 条（「成功时返回正文里的 `{kind, goal, module?}`」）。M3 附录 0.5 §3.14.9 的对照行写的是「返回整个结果对象，面板只读那三个字段」。
- 改法：第 6 条末句改为「成功时返回解析出的结果对象，面板只读 `kind`、`goal`、`module`」。

#### P7-05 §13 的问题里用了「节点」，本稿自己的 `term` 规则会把它判为内部词

- 位置：§13 背景一行「写进节点后再改要你出手」。§5.3 的 `term` 规则（查全部人话字段）列了「节点」；这件事将来由主 Agent 经 `propose_to_human` 交给人，第二阶段下它的 `background` 会被拒。第 6 轮核对这一段时看的是码点数与加粗，没有按 `term` 过。
- 改法：「写进节点后」改为「定下之后」，其余不动。

#### P7-06 §4.7 列的规则板分组次序缺「信号与检测器」，两块板的页面要链到主 Agent 的对话，面板没有写它导出什么

- 位置：§4.7「规则板分组的次序」；§9.1 的 `MainChat.tsx` 一行。
- 事实：规则 0.10 §9.1 的分组有「信号与检测器」（在「写在代码里的规则」与「在等的工作」之间），验收第 8 条也提到「你定的信号检测器」；规则 0.10 §9.1 提议一组写「链到主 Agent 的对话，plain-ui 的 `mainAgentOf`」，循环板 0.6 §8.2 第 1 项页头「点开跳到那个会话，同 plain-ui」。面板设计里没有 `mainAgentOf`，§4.9 的解析在 `MainChat.tsx` 里，没说两块板的页面能不能用。
- 改法：分组次序补上「信号与检测器」；§4.9 或 §9.1 写明 `MainChat.tsx` 导出一个 `useMainAgent(sessionId)`（结果三种加退路、`open()`），面板首页、两块板的页头与规则板的提议一组共用。

#### P7-07 模块放行的「等你放行」不查目标阶段，目标被退回大循环之后会列一件做不成的事

- 位置：§4.3 表「确认与放行」一行里带 `module` 的那一支；§4.11「等你放行」一行。
- 事实：M3 §3.14.3 门禁第 1 条要目标的有效阶段在 `release` 或之后；§3.14.8 退回大循环时目标回到 `design`、模块的阶段不动。`awaiting` 里早先交给人的那一项不会因此被清掉，面板现在只查「目标存在、没关闭」，于是写「框架在改」的同时还写「等你放行「<模块>」」，人同意后 `record_human_answer` 得到 `gate_unmet`，轮到的是主 Agent。
- 改法：带 `module` 的那一支加一条「目标的有效阶段为 `release` 或其后」，对不上的不列，L2 加一例。

#### P7-08 §4.9 第 2 步对搬家后位置的两句话是推断，且 `holderPathOf` 的入参没写

- 位置：§4.9 第 2 步括号「在工作树里的会话读主检出的 `.llm/`（项目根主检出与各工作树共用一份，M3 附录 0.5 §2.5 的快照流水同此）」；第 1 步 `holderPathOf(ctx, dir)`。
- 事实：共用一份的是快照流水（`<项目根>/.llm/snapshots.jsonl`，项目根按 `projectOf`）；持有者记录今天按 `projectKey(图目录)` 分，M3 §2.4 明写「同一个仓库的两个工作树各有自己的 `docs/graph/`，算两个项目」。搬家后记录怎么按项目根分、两个工作树是共用一份还是各一份，由 M3 的对齐轮定。另外 `panel-row.ts` 手里只有图目录（`dirFor(header.cwd)`），搬家后的函数要项目根。
- 改法：把「共用一份」改成「取决于 M3 搬家时的定位，仍属推断」；§4.9 第 1 步写一句：搬家后 `holderPathOf` 的入参由 M3 导出的项目根函数（`projectOf`）从 `header.cwd` 取，换的仍只是这一个函数。

#### P7-09 对规则 3 的两处小缺口：`mockup-modules.svg` 的 0.7 版没有留底，被打断的草稿头部没有另存

- 位置：§0 草图段、§15.5。
- 事实：`v0.7/` 有 `design-0.7.md` 和四张草图，没有 `mockup-modules.svg`（设计自己写了「没有另存副本」，只加了一行）；打断时盘上稿的头部（0.7 正文加新头部）被重写后没有留底，只有 §15.5 的文字描述。同一次对齐轮的 E 支把打断的草稿另存成了 `design-0.4-cutoff-draft.md`。没有已完成的内容因此丢失：正文是 0.7 原样（见下），头部是没有做完的草稿。
- 改法：从现稿删掉新增的那一行，存成 `v0.7/mockup-modules.svg`；§15.5 加一句头部的原文没有留底、描述以本节为准。

### 核实过的假设（本轮新增或复核）

1. `v0.7/design-0.7.md` 是 0.7 原文：首行写「版本：0.7（2026-10-30）」，全文没有「对齐轮」「holderPathOf」；文件时间 2026-10-30 14:09:39 与 0.7 完稿一致（`graph-comment-v07.json` 14:09:12，图上 0.7 批注 06:11Z）；`git diff --no-index` 的差异是 123 行增、37 行删，落点见上表「`d-alignment-rounds`」一行，没有别处被动。
2. 没有未写完的节：§0 到 §16 的标题齐全，§15.5 与 §16 的 0.8 行完整收尾（最后一行以「评审另一步做；`graph-ops-align.json` 另一步写 |」结束）；全文没有 TODO、待补一类标记；头部的四条缘起与正文每一处的改动一一对应。变更记录（§15.5「接手被打断的草稿」、§16 的 0.8 行）写了发现什么（盘上只有头部写过，正文是 0.7 原样，头部有三处与事实不符）和怎么处理（保留版本框架与四条缘起，头部按实际改写，正文全部重做并重新核对）。
3. M3 附录 0.5：§2.4（持有者记录位置）、§10（搬家留给对齐轮）、§3.14.1（读法与 `isSplit`）、§3.14.2（四步次序）、§3.14.3–§3.14.4（模块放行的门禁与写入）、§3.14.7–§3.14.8（写路径与两条退回）、§3.14.9（对照表）、§3.8 第二条 c 与 d；设计 §11 对照表十三行逐行读过，与原文一致；和这张表相关的缺口是 P7-01、P7-07。
4. M7 设计 0.6 §2.4 的 `derivedStage` 表与 `isDesignReview` 的定义、§3.9.7 的批注身份（`harness`）与文字、`execute-stage.ts` 里 `isDesignReview`:200、`scopedTasks`:232、`releaseOf`:165 与替身块（`modulesOf` 等五个读法，M3 的文件合入时删）。`derivedStage` 还没写（E1b），设计写的就是这样。
5. 规则 0.10 §3.6、§9.1、§10.7（持有者记录一条在第 3 点）与循环板 0.6 §8.1（`label`「循环板」、`guideLine` 为 `null`）、§8.2 第 1–5 项、§17 M3 第 10 条；宪章 0.7 第 44 行（§3.2 第 3 条的四样）与第 77 行（§6）。
6. 草图：`mockup-boards.svg` 的 y=574（主 Agent 不受影响）、y=658–732（规则板脚本条目：路径、「和你同意的那一版一样」、超时 10 秒、放行、7 天计数）、y=766–876（循环板脚本条目：「脚本：你 10 月 29 日同意的那一版」「超时 60 秒……」）；`mockup-onboarding.svg` 第 4 块 y=580–660；`mockup-modules.svg` 的「新提的、等下一次定框架时一起定」一行。
7. 本仓库的图：`norm-directions` 不存在；`hourness`（`stage: execute`）下有 `orch`（`design`），`glm-house`（`stage: execute`）下有 `bottom`（`execute`），没有开着的提议特性（P7-01 的形状）。

### 未核实或不成立的假设

- 不成立：简报与节点 06:11Z 批注里「持有者记录已按 M3 附录 0.5 搬到项目的 `.llm/`」。设计已纠正，不是设计的错。
- 已过时：依据段的「接管项目设计 0.3」（P7-02）。
- 未核实，不在本轮范围：0.5、0.6 已有的 DSH rc.3 行号引用（0.8 没有新增）；〔推断〕项（第三方客户端包注入 `uiWorkspace`、`readBytes` 能否读用户目录或工作树里的 `.llm/`、`useSession`、开场画面上 `openTab`）都在 §10.3 的 L4，有退路。`holderHome(ctx)` 在 `panel-row.ts` 的投影 `init` 里能否拿到 `ctx` 没有读代码核对（今天 `liveProjection` 的注册在 `ctx.inject` 回调里），写 `holderPathOf` 时由实现者确认。
- 行号漂移，不立发现：§9.1 写的 `docs/DESIGN.md`:55、:57 与 `docs/HANDOFF.md`:53、:54（按 HEAD `e9e2296`），在 HEAD `e57e744` 上是 `docs/DESIGN.md`:56、:60 与 `docs/HANDOFF.md`:57；设计已写明按当时的 HEAD，实现时重核。

### 交给编排者记图的事项

本步按 brief 只写评审文件，不写 `docs/graph/`。建议给 `m8-plain-language` 的批注：「设计评审第 7 轮（design.md 0.8，对齐轮 G 支的第一遍；0.7 此前没有独立评审）：CHANGES_REQUESTED，HIGH 0、MEDIUM 2、NIT 7；第 6 轮六条全部关闭。持有者记录：M3 附录 0.5 没有搬（§2.4 仍在用户级目录，§10 留给对齐轮），简报与 06:11Z 批注的前提不成立，设计经 holderPathOf 一处薄包装处理，处理正确。挡路两条：P7-01 新提模块的过滤没按两层循环的开关生效，在本仓库的图上会让一个提议哪里都看不到；P7-02 21:02Z 接管 0.5 与 21:23Z M4 0.5 的请求没有接。其余七条是小处。」另提醒：简报规则 4 允许再改一遍再评审，两条挡路都只是文字与条件分支。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9
round 4: HIGH 0, MEDIUM 2, LOW 7
round 5: HIGH 0, MEDIUM 2, LOW 11
round 6: HIGH 0, MEDIUM 0, LOW 6
round 7: HIGH 0, MEDIUM 2, NIT 7

挡路条数（HIGH 加 MEDIUM）：6、2、2、2、2、0、2。

结论：CHANGES_REQUESTED。第 6 轮的六条全部关闭。简报点名的五件里，持有者记录、「影子→试运行」、高峰模式几句和被打断草稿的处理都符合，§11 对 M3 0.5 与 M7 0.6 的核对也与两份设计的原文一致；挡路的两条不在这五件的核心里：P7-01 是 0.8 新加的过滤没有跟两层循环的开关绑在一起，P7-02 是图上比 0.8 晚到的请求。这是 G 支的第一遍，按简报规则 4 可以再改一遍再评审；两条的改法都只动文字、条件分支和一条 L2。七条 NIT 不挡路，作者顺手改。

## 第 8 轮（2026-10-31，design.md 0.9）

评审对象：`design.md` 0.9（第 9 稿，2026-10-31 13:18 写完；含 0.8 的全部内容）。0.9 是对第 7 轮（0.8，CHANGES_REQUESTED，挡路 2 条 P7-01、P7-02，NIT 7 条）的修订，也是简报规则 4 许可的「再改一遍再评审」，所以本轮若仍有挡路发现，这一支就停下报告。判级标准同第 5 至 7 轮：`docs/DEVELOPMENT.md` §1.1「评审挡路的标准」（验收条件没有满足；会造成不可逆损失而没有预防；失败了发现不了、发现了没有恢复办法或事后查不到原因），违背方向清单也挡路。本轮只读文件，不重跑作者做过的事，不改设计，没有写 `docs/graph/`。

核对方法：

- `v0.8/design-0.8.md` 与 `design.md` 逐块对比（`git diff --no-index -U0`：81 行增、43 行删），全部块读过。落点是头部（版本、依据、范围）、§1.4 第 6、8、14、17 条、§4.3 两行、§4.7、§4.9、§4.10、§4.11、§5.3、§5.4 的 `modulesView` 一行、§6.6、§7、§8.1、§9.1、§10.1、§10.3 第 7 项、§11、§12 第 40、43、44 条、§13、§14 第 20 至 22 条、§15.5、§15.6、§16；别处原样。
- `v0.7/design-0.7.md` 与 `v0.8/design-0.8.md` 的差异仍是 123 行增、37 行删，与第 7 轮记录的相同，所以存档的 0.8 与被评审的 0.8 是同一份。
- 草图：`v0.8/` 里的五张与顶层的五张逐字节相同（SHA-256 比过），符合头部「草图 0.9 没有改」；`v0.7/mockup-modules.svg` 与顶层相比只少 y=662 的一行「新提的、等下一次定框架时一起定：晨报的订阅设置 · …」。

本轮核对时的外部事实：

- main 是 `040a9b0`（2026-10-31 13:22）。自第 7 轮的 `e57e744` 起，`src/`、`ui/`、`tests/`、`scripts/`、`packages/` 只有 `src/execute/gate-lock.ts` 改了 3 行；`src/graph/`、`ui/src/`、`src/shared/`、`src/data/` 没有变化，设计里的行号与「还不在 main 上」的文件清单（`modules.ts`、`plain.ts`、`plain-view.ts`、`answer-marks.ts`）仍成立。
- 已放行设计的文件时间都早于第 7 轮结束的 05:42：规则板 10 月 30 日 21:09、循环板 10 月 30 日 17:09、M3 附录 10 月 30 日 21:10、M7 10 月 31 日 04:46、宪章 10 月 30 日 16:11。0.9 的作者在 05:42 之后才动手，这些文件的时间都在它之前，所以 0.9 没有改它们，符合规则 2。
- 图上比 0.8 草稿新的批注：第 7 轮已读 21:02Z 接管 0.5 与 21:23Z M4 0.5 两条，0.9 已处理；此后新增 21:57:59Z M6 0.5 的建议（上手页写钟点就取 `peakHours.zh`）、21:58:01Z 用户图 0.5 的三条说明、05:20Z 编排方的一条（面板 0.9 写在两条新决定之前，评审之后由编排方另补）。两条新决定 `d-code-rules-enforce`、`d-credentials-readable` 状态为已批准，晚于 0.9 的写稿；本轮全文搜过，面板设计没有对写在代码里的规则承诺试运行期，也没有讲读密钥的规则，与它们不冲突。M5 设计现在是 0.6。

### 第 7 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P7-01 新提模块的过滤没按两层循环的开关生效 | 关闭，余 P8-02 | 过滤只在 `directionsOf(graph)` 有值时生效（§4.3 第三行、验收第 6 条（c）、§4.11 模块一条、§10.1、§12 第 43 条）；谓词与 M3 附录 0.5 §3.8 第二条 c 的第三支逐项对上（父节点是目标、直接特性子节点、自己没有 `stage`、目标已放行、`isSplit`）；§11 对照表改读 `isSplit`；§4.11 给「已放行、因候选而 `isSplit` 为真、自己没有模块」的目标留一段，被藏起的提议在有方向清单时总有地方看；记了 M3 请求 3。我对 M3 原文核过：§3.14.1 把「目标的直接子节点、类型特性、状态提议，带不带 `stage` 都算」定为模块候选，`isSplit` 是「模块或模块候选不空」，所以被判的提议特性自己就让 `isSplit` 为真，请求 3 的读法成立 |
| P7-02 图上新批注没接 | 关闭，余 P8-01、P8-06 | 依据段改引接管 0.5 与 M4 0.5；验收第 14 条、§6.6（面板与没图卡片）、§4.10 空图一条、§5.3 前提 (c)、§7 与 §8.1 的两行、§10.3 第 7 项、§11 接管项目四点与 M4 一段、§14 第 21、22 条都按条件分支写好；M4 一段的内容（`ref`、结局五种、两小时到期由 guard 行的定时器写 expired 并送关闭提醒）与 M4 0.5 §5.5 末段、§5.8、第 875 行逐项相同；接管一侧与接管 0.5 §3.1（`hasProjectGraph`：`nodes/` 里至少一个 `.json`）、§3.2 命令表相同 |
| P7-03 7 天计数写成两块板都有 | 关闭 | §4.7 分板写，验收第 8 条改为脚本路径、检查类写工具节点与命令；循环板一侧「最近 5 次运行」在 0.6 §8.2 的「每项点开」一段，7 天内超时 3 次以上进周报在 §6.11，对得上 |
| P7-04 `shownProposalOf` 返回值两处不一致 | 关闭 | §11 M3 第 6 条已改为返回解析出的结果对象，面板读三个字段，与 M3 附录 0.5 §3.14.9 的对照行相同 |
| P7-05 §13 背景行用了「节点」 | 关闭 | 现为「定下之后再改要你出手」，31 个码点，一处加粗 |
| P7-06 规则板分组缺一组、没有导出名 | 关闭 | §4.7 的次序含「信号与检测器」，与规则 0.10 的摘要（第 104 行）和 §9.1（第 1474 行起）的次序相同；§4.9 第 3 步与 §9.1 写明 `MainChat.tsx` 导出 `useMainAgent(sessionId)`，首页、两块板的页头与规则板提议一组共用 |
| P7-07 模块放行不查目标阶段 | 关闭 | §4.3 第二行、§4.9、§4.11 状态表「等你放行」一行与 §10.1 的一例都加了「目标的有效阶段为 `release` 或其后」；与 M3 §3.14.3 门禁第 1 条、§3.14.8 相符 |
| P7-08 搬家后位置是推断、`holderPathOf` 入参没写 | 关闭 | §4.9 第 1 步改为 `holderPathOf(ctx, dir, header.cwd)`，搬家后项目根由 `projectOf(cwd)` 取；`src/data/project-root.ts`:94 的 `projectOf` 返回 `{root, git}` 或 `undefined`，`root` 是主检出，与设计的描述一致；第 2 步把工作树里读哪一份 `.llm/` 写成取决于 M3 的定位，仍属推断；`src/data` 与 `src/graph` 同在 `dsh-hourness` 包（`scripts/packages.mjs`），导入不越包 |
| P7-09 规则 3 的两处缺口 | 关闭，余 P8-05 | `v0.7/mockup-modules.svg` 在，与顶层只差新加的一行；被评审的 0.8 与五张草图另存在 `v0.8/`；§15.5 写明头部原文没有留底、描述以该节为准 |

### 简报点名的五件

| 点 | 结果 | 依据 |
| --- | --- | --- |
| 持有者记录在项目的 `.llm/` | 设计的处理正确，简报的前提仍不成立 | M3 附录 0.5 §2.4 仍把记录放在 `<userHome>/main-agent/…`，§10「留给对齐轮的」第一条写明搬家本版没做；图上 `m3` 21:58:00Z 的用户图批注（G24）也写着仍等 M3 对齐轮合并处理。设计没有替 M3 写死新位置：路径只在 `panel-row.ts` 的 `holderPathOf` 一处取，搬家前转调 `holderFileOf(holderHome(ctx), dir)`，搬家后换成 M3 导出的按项目根定位的函数；请求 1 请 M3 搬家时同时给出绝对路径。0.9 又把 `cwd` 一开始就传进去并写明项目根的来源（P7-08） |
| 「影子」→「试运行」一条作废 | 符合 | §4.7 删去这条换词；带脚本或检查的条目写路径与原文、是不是你同意的那一版（改过一个字就不跑，要等人在对话里再同意）、超时与出错时怎样；字句与规则 0.10 §9.1（第 1470 行：「和你同意的那一版一样」「不一样，没在跑；要用改过的这一版，跟主 Agent 说，它会把新的原文给你看」「脚本文件不见了」、超时与出错时放行还是拦下）和循环板 0.6 §8.2 第 5 项（「脚本：你 <日期> 同意的那一版」「超时 60 秒：超时算没跑完，告诉主 Agent，这次的事件下次再跑；崩溃算没过」、展开是脚本原文、`homeLine` 的「脚本改过了，先不跑」）逐条对过。设计里「影子」「试运行」只出现在说明作废的句子里；两块板的页面与上手页的固定字串不含这两个词（L2 与 L4 都要查）。`d-code-rules-enforce`（05:20Z 批准）取消写在代码里的规则的试运行期，面板设计没有相反的承诺 |
| 高峰模式几句 | 符合 | 0.9 没有改这些句子。全文搜「排队」「暂停主」「只能……/rules peak」：只在说明作废的句子（§2 第 151 行、§4.7、L2）里出现；§0、验收第 12 条、§4.7 新段、§6.4 第 4 块、草图都写「三档都不影响主 Agent，它任何时候都照常回话」，改档位写跟主 Agent 说或 `/rules peak` 两条路 |
| §11「两层循环」对 M3 0.5 的每模块放行与 M7 0.6 的 `derivedStage` | 符合，三条请求已记 | 本轮重读 M3 附录 0.5 §3.14.1（读法与 `isSplit`）、§3.14.3（模块放行门禁，第 1 条要目标已放行）、§3.14.8（两条退回）、§3.14.9（对照表）、§3.8 第二条 c；M7 0.6 §2.4 的 `derivedStage` 与 `scopedTasks`、`isDesignReview`。面板一侧的 `moduleStateOf` 五行与这些相符。请求三条：持有者记录要绝对路径（M3）、`execute-stage.ts` 可被客户端导入（M7）、c 里的 `isSplit` 把被判的提议自己也数进去（M3，0.9 新记）；都是对已放行设计的请求，写成图上批注、自举之后再办，面板不绕，符合规则 2 与 `d-freeze-until-dogfood` |
| 被打断草稿的处理 | 符合 | `v0.7/design-0.7.md` 首行版本为 0.7，全文无「对齐轮」「holderPathOf」，与 `v0.8/design-0.8.md` 的差异 123 行增、37 行删，所以 0.7 正文被保留；§0 至 §16 标题齐全，§16 的 0.9 行完整收尾，全文搜不到 TODO、待补一类标记（「未完成」只出现在讲依赖和讲被打断草稿的句子里），§1.4 第 1 至 17 条、§12 第 1 至 44 条、§14 第 1 至 22 条编号连续；§15.5 写了发现什么（盘上稿只有头部写过，正文是 0.7 原样，头部三处与事实不符）和怎么处理（框架与缘起保留，头部按实际改写，正文全部重做并重新核对），0.9 补了没有留底的两处 |

### 方向清单逐条核对

| 方向 | 结果 |
| --- | --- |
| `d-boards-as-hooks`、宪章 0.7 §3.2 第 3 条与 §6 | 符合：页面无试运行这一说，四样代替影子期都在（P7-03 之后各取各板的字） |
| `d-rules-in-repo`、宪章 0.7 §9 | 符合：持有者记录归项目 `.llm/`，路径只来自 M3 的一个定位函数 |
| `d-main-agent-peak-exempt` | 符合（上表） |
| `d-agent-examples`（规则 7） | 符合：设计与草图的示例没有记账、账本题材；「记账」「expense-cli」只在说明换掉了什么的句子里出现；「底账」是面板自己的页名，不是示例 |
| `d-freeze-until-dogfood`、规则 2 | 符合：只写自己的目录，对 M3、M7 的三条请求只记在图上批注的草稿里。`graph-ops-align.json` 此刻不在 `plain-ui/`，设计写明评审通过后由另一步写出 |
| `d-alignment-rounds` | 符合：与 `v0.8/` 的差异全部落在第 7 轮九条的处理上，别处原样 |
| 规则 6（§13 的格式）、规则 8（干净区） | 格式符合：一件，题目加背景、推荐、疑问、不做四段，标签不加粗，每行一处加粗，问句在最后；全文没有人设与语气词（搜过喵、呐、啦、诶、唔、主人，只有 `~/.dsh` 里的 `~`） |
| 图上更新的人定（`d-code-rules-enforce`、`d-credentials-readable`、`d-build-all-released`） | 与 0.9 不冲突；晚于写稿，编排方说评审之后另补，见 P8-04 |

### HIGH

无。

### MEDIUM

无。

### NIT

#### P8-01 `mockup-onboarding.svg` 的没图卡片注释仍写「按钮执行 /hourness-init」，与 0.9 的验收第 14 条、§6.6 不符

- 位置：`mockup-onboarding.svg` y=800 的一行「按钮执行 /hourness-init；它没注册时换成一行建空目录的做法。」；设计头部「草图 0.9 没有改」；§15.6 的 P7-02 一行没有列草图。
- 事实：0.9 的验收第 14 条与 §6.6 写的是接管行在时按钮执行 `/wish` 或把它写进输入框，面板写「在对话里发 /wish：……」；接管行不在时没有按钮，只写建空目录的做法。草图这一行是旧说法。前几轮对草图与正文的出入都按 NIT（LOW）记（P4-09、P6-04）。
- 改法：把这一行改成「接管行在时，按钮执行 /wish 或把它写进输入框；不在时没有按钮，换成一行建空目录的做法。」；头部「草图 0.9 没有改」改为「0.9 只改了 `mockup-onboarding.svg` 的这一行注释」，旧图已在 `v0.8/`。

#### P8-02 §10.1 的 L2 句子要求「谓词每一项各破坏一次、都应当列」，其中三项做不到

- 位置：§10.1 第 828 行（0.9 加的「谓词的每一项……各用一张只破坏这一项的图测一次，都应当列」）。
- 事实：六项是父节点是目标、类型特性、状态提议、无 `stage`、目标有效阶段为 `release` 或其后、`isSplit` 为真。破坏「状态提议」的节点不再是提议，不在这一行里；破坏「目标已放行」就是目标在 `wish`、`interview`、`design`，这时节点在设计中目标的子树里，由 §4.3 同一行前半的子树条款挡掉，也不列；`isSplit` 单独破坏不了，因为被判的提议特性自己就是候选，只要其余项成立 `isSplit` 必为真（这正是请求 3 的理由）。能独立破坏且仍应列出的只有父节点、类型、`stage` 三项。
- 后果：写 L2 的人做不出这三例，会自己改句子；不影响行为，也不影响验收。
- 改法：该句改为「父节点不是目标（挂在已放行的模块下的提议特性）、类型不是特性（提议的任务）、自己带 `stage`（提议的特性），三张图各只破坏一项，都应当列；状态是这一行的进入条件，目标在设计阶段由子树条款挡掉，`isSplit` 由其余各项蕴含，这两项用已有的『已放行、没有模块、只有这一个提议特性』一例覆盖」。

#### P8-03 §11 的「经验板（M5，设计 0.3，0.7 按 P6-03 补）」一段已过时

- 位置：§11 该段（「`.agents/tasks/m5/design.md` 第 574 行让经验板页面上的按钮……下一稿改为……」）。
- 事实：M5 设计现在是 0.6，§0 第 18 行、§3 第 31 行、`lessons-3` 的验收和第 84 行不做事项都写了经验页没有按钮、不经任何命令写、删除与恢复是人对主 Agent 说；图上 `lessons` 21:57:57Z 的批注同写。那一条冲突已经由 M5 自己解决，第 574 行也不存在。
- 改法：该段改成一句「M5 设计 0.6 已按本稿 §4.7 写（经验页没有按钮，删除与恢复在主 Agent 的对话里说），没有要它改的了」；§14 若有对应转达项一并去掉（本轮没有找到）。

#### P8-04 图上比 0.8 草稿新的三处批注没有写进 0.9 的依据与 §14

- 位置：依据段；§11；§14 第 21 条。
- 事实：M6 0.5（21:57:59Z）建议上手页讲高峰档位若要写钟点就取计价服务的 `peakHours.zh`；用户图 0.5（21:58:01Z）三条说明：没图时的 `/hourness-init` 同接管（0.9 已处理）、面板一页稿 `onepage.md`（10-30 14:08）写在两层循环与主 Agent 不受高峰影响之前、随放行稿重写时加上、用户图 G20 的「已对上」靠本稿正文。0.9 的上手页第 4 块没有写钟点，所以没有要改的字，一页稿则是评审通过之后的单独一步。这些没有后果，但 0.9 的缘起里没有它们，下一个读的人要再查一遍。
- 改法：§14 第 21 条的批注里加一句：已读 M6 0.5 与用户图 0.5 的批注，上手页不写钟点（以后要写取 `peakHours.zh`，不另写一份），一页稿在评审通过后按新格式重写；`d-code-rules-enforce`、`d-credentials-readable` 晚于本稿，已核对无冲突，编排方另补。

#### P8-05 §15.5 的草图一行把原位置写成 y=652

- 位置：§15.5 草图（0.8）一段「改前这一处只有『按定清单时的先后排……』一行，位置在 y=652」。
- 事实：`v0.7/mockup-modules.svg` 里那一行在 y=646，新加的一行在 y=662（对比过两份文件）。
- 改法：改为「原有那一行在 y=646，新加的一行在 y=662」。

#### P8-06 「接管行在」不等于 `/wish` 已经能开始接管，M3 的两处接缝没办之前面板那一行说得过头

- 位置：验收第 14 条；§6.6（面板与没图卡片）；§11 接管项目第 1、4 点。
- 事实：面板用 `/hourness-init` 是否注册判「接管行在」（§6.6）。接管 0.5 §3.1 写明 M3 的 `/wish` 在没有图目录时今天报「这个工作区还没有项目图：先建空目录 <图目录>」，让 `/wish` 先调接管是对 M3 的请求，自举之后再办；接缝没办之前走过渡路（建空目录、发不带话的 `/wish`、再发 `/hourness-init`）。所以接管行装上而接缝没办的那段时间，面板写「在对话里发 /wish：主 Agent 先看一遍这个项目再接手」，人照做会先得到 M3 的报错。报错看得见，也带着做法，没有不可逆的后果；§11 第 4 点已承认这段时间，并按编排方在 21:02Z 的原话照办。
- 改法：§10.3 第 7 项加一条：在接管行在、M3 接缝未办的环境里记录没有图目录的工作区发 `/wish` 实际回什么；与面板那一行不符时，这一行按接管设计 §3.1 的过渡路写，等接缝办完再换。不改验收字句。

### 核实过的假设（本轮新增或复核）

1. `v0.8/design-0.8.md` 就是被第 7 轮评审的 0.8：与 `v0.7/design-0.7.md` 的差异是 123 行增、37 行删（第 7 轮记录的数字）；0.9 相对它的 81 行增、43 行删全部落在第 7 轮九条的处理上。
2. M3 附录 0.5：§2.4（记录仍在 `<userHome>/main-agent/`）、§10（搬家留给对齐轮）、§3.8 第二条 c 第三支、§3.14.1（候选的定义与 `isSplit`）、§3.14.3 第 1 条、§3.14.8、§3.14.9 对照表第六行（`shownProposalOf` 返回整个结果对象）。
3. `src/data/project-root.ts`:94 `projectOf(cwd, home)` 返回 `ProjectLocation | undefined`，`ProjectLocation` 为 `{root, git}`，`root` 是仓库的主检出；`scripts/packages.mjs` 里 `data` 与 `graph` 同属 `dsh-hourness`。
4. 规则板 0.10 §9.1：分组次序（第 104 行含「信号与检测器」）、你定的规则一组的字（第 1470 行）、提议一组写 plain-ui 的 `mainAgentOf`（第 1477 行）。循环板 0.6 §8.2 第 1、5 项与「每项点开」一段，§6.11（第 1161 行起）周报两张单子。
5. 接管 0.5：§3.1（`hasProjectGraph`、对 M3 的两处请求、过渡路、对面板的请求段）、§3.2 命令表第四行（不是主 Agent 时回「发 /wish 开始接管」）、`graph-ops-orch-ruling.json`（自举之后再改）、`align-stop-report.md`（停在 0.5，F44 开着）。
6. M4 0.5：第 63、205、873–887、938–950、1696 行（`request_exception` 的 ask 结果、`hourness-request` 提醒与 `request: {ref, outcome}`、五种结局、两小时到期、第三次修复题目的退路写法）。
7. 本仓库的图：`m8-plain-language` 的 `acceptance` 为空，所以 §13 说「这些条还没有写进节点、你没有签过任何一版」成立；`d-code-rules-enforce`、`d-credentials-readable`、`d-build-all-released` 状态为已批准。
8. 草图：`v0.8/` 五张与顶层逐字节相同；`v0.7/mockup-modules.svg` 与顶层相差 y=662 一行。

### 未核实或不成立的假设

- 不成立：简报与节点 06:11Z 批注里「持有者记录已按 M3 附录 0.5 搬到项目的 `.llm/`」。设计已纠正，不是设计的错。
- 没有运行：M3 第 8 步（`main-agent-graph-stage`）还没合入，请求 3 对 c 的读法是按 M3 原文推出的；我核过原文，推理成立，作者也标了〔推断〕。
- 未重核，不在本轮范围：0.5 至 0.8 已有的 DSH rc.3 行号引用（0.9 没有新增）；〔推断〕项（第三方客户端包注入 `uiWorkspace`、`readBytes` 能否读用户目录或工作树里的 `.llm/`、`useSession`、开场画面上 `openTab`）都在 §10.3 的 L4，有退路；`holderHome(ctx)` 在 `panel-row.ts` 的投影 `init` 里能否拿到 `ctx`，写 `holderPathOf` 时由实现者确认。
- 接管设计与 M4 设计都未放行，之后改了，面板的条件分支要按放行版本再核（设计已写明）。

### 交给编排者记图的事项

本步按 brief 只写评审文件，不写 `docs/graph/`。建议给 `m8-plain-language` 的批注：「设计评审第 8 轮（design.md 0.9，对齐轮 G 支的追加一遍）：APPROVED，HIGH 0、MEDIUM 0、NIT 6；第 7 轮九条全部关闭，挡路条数 2 → 0。简报点名的五件（持有者记录、『影子』『试运行』一条作废与带脚本条目的几样、高峰模式几句、§11 两层循环对 M3 0.5 与 M7 0.6、被打断草稿的处理）都符合；持有者记录一条的前提仍不成立（M3 0.5 没搬），设计经 holderPathOf 处理。三条对已放行设计的请求（M3 持有者记录要绝对路径、M7 execute-stage.ts 可被客户端导入、M3 的 c 与 isSplit）见设计 §11，待写入图。六条 NIT 作者顺手改（草图注释一行、L2 一句、两处过时说明、一处位置数字、接管过渡期一条 L4 记录）。」另有三件后续：一，`graph-ops-align.json` 此刻不在 `plain-ui/`，设计写明通过后由另一步写出，内容见设计 §14 第 16 至 22 条；二，面板 `onepage.md`（10-30 14:08）是旧稿，通过之后按 `d-onepage-concrete`（`d-design-onepage` 05:20Z 批注）的新格式重写，并加上两层循环与主 Agent 不受高峰影响两处；三，`d-code-rules-enforce`、`d-credentials-readable` 晚于 0.9，本轮核对面板设计没有要改的地方。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9
round 4: HIGH 0, MEDIUM 2, LOW 7
round 5: HIGH 0, MEDIUM 2, LOW 11
round 6: HIGH 0, MEDIUM 0, LOW 6
round 7: HIGH 0, MEDIUM 2, NIT 7
round 8: HIGH 0, MEDIUM 0, NIT 6

挡路条数（HIGH 加 MEDIUM）：6、2、2、2、2、0、2、0。

结论：APPROVED。第 7 轮的九条全部关闭，挡路条数由 2 降到 0。0.9 新写的部分（新提模块过滤与方向清单的绑定、与 M3 的 c 一字对上的谓词、没有模块的已放行目标在「框架与模块」页的一段、接管与 M4 的条件分支、`holderPathOf` 收 `cwd`、模块放行加目标阶段）逐条对过 M3 附录 0.5、接管 0.5、M4 0.5、规则板 0.10、循环板 0.6 与 main 上的代码，没有新的挡路发现。六条 NIT 都可逆、看得见、有改法，留给写放行稿或实现前顺手处理，不要求再出一稿。

## 第 9 轮（2026-10-31，design.md 1.0，第一遍）

评审对象：`design.md` 1.0（第 10 稿，2026-10-31 14:48 写完）。1.0 是对 0.9（第 8 轮 APPROVED，挡路 0，NIT 6）按人 2026-10-31 的五条决定做的修订，加第 8 轮的六条 NIT。简报允许最多两遍，这是第一遍。判级标准同第 5 至 8 轮：`docs/DEVELOPMENT.md` §1.1「评审挡路的标准」，违背方向清单也挡路。本轮只读文件，不改设计，没有写 `docs/graph/`。

核对方法：

- `v0.9/design-0.9.md` 与 `design.md` 逐块对比（`git diff --no-index -U0`：107 行增、26 行删，全部块读过）。`v0.9/design-0.9.md` 的 SHA-256 是 `05F97905…D182E68`，与 §15.7 写的相同；它的第 828 行就是第 8 轮 P8-02 引的那一句，所以存档的 0.9 就是被评审的 0.9。
- 改动落点：头部、依据、范围、§0 两处、§1.4 第 8、10、11、12 条、§2 六行、§4.2 第 3 条、§4.3 一句、§4.7 四处、§4.8 一条、§6.4 第 6 块、§8.1、§8.2 各一行、§10.1 两条、§10.3 开头与第 7、8、13 项、§11 两处、§12 第 45 至 50 条、§13、§14 第 13、21 条与新增第 23 至 29 条、§15.5、§15.7、§16。别处原样。每一处都能归到五条决定或六条 NIT，没有发现决定之外的行为改动。
- 草图：`mockup-home.svg`、`mockup-boards.svg`、`mockup-onboarding.svg` 与 `v0.9/` 里的旧版逐行对比，并用无头浏览器渲染了前两张看版面；`mockup-modules.svg`、`mockup-wish.svg`、`mockup-plan.svg`、`mockup-drilldown.svg` 的时间戳早于 1.0 的写稿，头部说没有改。
- 对着读的材料：项目图上四个决策节点 `d-code-rules-enforce`、`d-credentials-readable`、`d-timeout-measured`、`d-desktop-direct-use` 的正文；`docs/CHARTER.md` 0.8（`cd257a7`）§3.2 第 3 条与 §6；用户图 `journey.md` 0.6 的 §5.2、S10、§6.1 的 G15、G18、G26 至 G28、§6.3；M4 设计 0.6（文件时间 14:50，比 1.0 的写稿还晚）§3.4、§3.5、§4.2、§6.3.1；规则板 0.10 §1.4 第 12 条、§2.3 动作表、§9.1；循环板 0.6 §8.1 至 §8.3；M7 0.6 §3.8.1、§3.9.3、§3.9.4。指标流水设计 1.0 没有读（1.0 说同一批在改，面板不依赖它的种类名）。

### 第 8 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P8-01 没图卡片注释 | 关闭 | `mockup-onboarding.svg` y=800 现为「接管命令在：按钮发 /wish 或写进输入框；不在：没有按钮，写建空目录的做法。」，与验收第 14 条、§6.6 一致；头部不再说草图没改 |
| P8-02 §10.1 谓词各项 | 关闭 | 现名三张图（父节点、类型、`stage`），另三项各写一句缘由，与我第 8 轮的改法相同 |
| P8-03 M5 一段过时 | 关闭 | §11 与 §14 第 13 条改为 M5 0.6 已照 §4.7 写 |
| P8-04 三处较新批注 | 关闭 | 写进 §14 第 21 条 |
| P8-05 y 坐标 | 关闭 | `v0.7/mockup-modules.svg` 原行在 y=646，现稿多的一行在 y=662，§15.5 已改正 |
| P8-06 接管过渡期 | 关闭 | §10.3 第 7 项加了 L4 一步，写明记录 `/wish` 实际回什么、不符时按接管设计 §3.1 的过渡路改面板那一行 |

### 五条决定逐条核对

| 决定 | 结果 | 依据 |
| --- | --- | --- |
| 1 `d-code-rules-enforce` | 大部分到位，两处有问题：P9-01、P9-02 | 到位的：0.9 本来就没有影子专用的事件、计数、转正指标，全文搜过（`转正` 只出现在「没有转正进度」一类的句子里）；「写在代码里的规则」一组改称「启用即拦」；拦下记录带规则 id，点开最近 5 条，规则页与晨报都写（晨报归 M7 与 M4，M4 0.6 §3.10 已有每条规则一行）；撤下一行转述 M4 0.6 §3.5 的 `guard_lift` 与 `/guard lift <规则 id>`；「晚到的拦下」与 M4 0.6 §3.4 的 `LateRecord`、规则板 0.10 的 `late-denial` 相同；新插件行默认关闭，页面不讲，与决定一致 |
| 2 `d-credentials-readable` | 到位 | 页面、拦下记录、晨报不列读密钥的规则；规则板 0.10 §1.4 第 12 条与 §9.1 确实还列着 `credential-read`（第 170 行），§11 第 1 条请它删；M4 0.6 §4.2 同样删了这条 |
| 3 `d-timeout-measured` | 大部分到位，来源的写法有缺口：P9-03、P9-04 | 到位的：数与来源、来历、最近 5 次超时、7 天超时数、超过上限时保持上限并告诉主 Agent、缺格写「没有记录：<原因>」且出声、优雅失败的话在对话里面板不重复、事件种类归指标流水 1.0 面板只依赖板的页面数据、显示位置在两块板条目所在处；与宪章 0.8 §3.2 第 3 条和 M4 0.6 §6.3.1 的取值、上限、记录三种行逐项对过 |
| 4 用户图两件 | 到位 | 首页「现在」的「推进停住」一行放在循环板的 `homeLine` 里：循环板 0.6 §8.3 的 `homeLine` 是至多 60 个码点的一行、按顺序取第一个成立的，示例一行 34 个码点，「在它别的几种之前」也说得通；不进「需要你」；数据没有哪份已放行设计写（用户图 G15），面板只定显示，没有数据就没有这一行，诚实标出。「上次看之后」两种新行：目标的直接特性子节点状态变为完成、目标状态变为完成，各自单列；里程碑在图上不是节点类型（`src/graph` 里没有），设计把它定义为没有 `stage` 的直接特性子节点，与 §4.3 原有的写法一致；整体审查的结论由 M7 0.6 §3.9.4 与完成门禁第 5 条写成目标上的批注，面板只指路，成立。上手页第 6 块两句，额度那句只在 `peakApplies` 为真时出现，编排层单装时仍不点名模型 |
| 5 `d-desktop-direct-use` | 到位 | 全文搜「先问」「先告诉」「重启」：说到人被先告知或先同意的只有验收第 11 条与 §10.3 第 8 项，都已改成先备份、测完恢复、写进运行报告；§10.3 开头一段与决定节点正文（AGENTS.md 顺序照旧、备份、运行报告、重启后看日志、`applied` 不算启动成功、主 profile 不留多余改动）逐项相同 |

### 简报要求的其他核对

- 决定之外的改动：只有一处不在五条决定与六条 NIT 里，即 §13 的三行（背景换词、推荐加「人话版另有一页」、疑问改为第 8 条最长）和同目录新增的 `onepage-done.md`（17 条的人话版）。作者的交付说明把它列在「The 17 items」下，看来是简报给的；§15.7 的两张表没有这一项，只在头部、§0、§13、§16 里提了。我读了 `onepage-done.md`：17 条齐全，第 8、10、12 条已含 1.0 的内容，意思与 §1.4 一致（第 8 条带着 P9-02 的问题）。不另记发现。
- 与已放行设计的关系：1.0 没有改规则板 0.10、循环板 0.6、M3 附录 0.5、M7 0.6 的任何文件，只在 §11 与 §14 写了六条可直接转成批注的请求；符合 `d-freeze-until-dogfood`。请求 1 里对规则板 0.10 的描述（「没有解除，也没有任何改法」「`credential-read`」「只记下，不挡」）与它的第 170 行和第 1481 行原文相同；请求 2 引的循环板 §8.2 第 5 项原来不另列计数，确认；请求 3 引的 M7 §3.8.1（每条合入前检查 30 分钟）、§3.9、§3.10、§3.12 在 M7 0.6 里存在。
- 变更记录（§16）是否属实：§2 加六行、§12 加第 45 至 50 条、§11 加六条请求、§14 加第 23 至 29 条、草图三张改了、`v0.9/` 里留了三张旧图，都与文件一致。只有「验收第 8、10、12 条字句改了」少了第 11 条，见 P9-06。
- 干净区：全文没有人设与语气词。

### HIGH

无。

### MEDIUM

#### P9-01 「每条写在代码里的规则下面一行要撤下」与 M4 0.6 的撤下范围不符，页面会给出撤不了的命令

- 位置：§4.7 新段「拦下的记录与撤下」（「写在代码里的规则这一组，每条下面一行『要撤下：……/guard lift <规则 id>』」）；§4.7 页面没有写入控件一条里「唯一的例外」；§1.4 第 8 条 (a)；§10.3 第 13 项 (a)；§11 请求 1（「每条一行撤下的说法」）；`mockup-boards.svg` 的「写在代码里的规则 · 启用即拦」一组。
- 事实：M4 0.6 §3.5 第 3 条：`guard_lift` 只认 `GUARD_RULES` 里能撤下的规则，M3 的 `MAIN_AGENT_RULES` 与 M7 的 `EXECUTE_RULES` 在它们改经 `installRuleGate` 之前撤不了，返回 `invalid`；`lift-files-only` 撤不了，返回 `forbidden`；`GUARD_RULES` 每项有 `liftable` 字段。接管的 `bootstrap-read-no-shell` 靠另一条命令 `/hourness-init unlock-shell`。用户图 G26 把这个缺口记为仍开着：M3 的八条、M7 的门不在 M4 的办法里，规则板 0.10 还写「没有解除」。而规则板 0.10 的「写在代码里的规则」一组（第 170、1471 行）恰好把 M3 的八条、M7 的门、`rules:files-only` 都列在里面。作者读过 G26（依据段列了它），§4.7 没有处理这个范围。草图里挂撤下一行和拦下计数的例子「主 Agent 没有写文件的工具」，看内容像是 M3 那一类（若是，撤它会得到 `invalid`）。
- 后果：人照页面打 `/guard lift <id>` 或对主 Agent 说「撤下……」，对覆盖不到的规则得到错误，而决定 1 的要求是「撤得下」。页面声称每条都能撤，说的与事实不符。
- 改法：撤下一行改为板给的数据决定。每条规则的页面数据带 `liftHow`（可撤下的写「撤下：跟主 Agent 说「撤下<规则名>」，或打 /guard lift <规则 id>」；`bootstrap-read-no-shell` 写它自己的命令），为 `null` 时那一行写「这一条现在还不能一句话撤下（<原因>）」，不给命令。§4.7、§1.4 第 8 条 (a)、§10.3 第 13 项 (a) 同改，L2 加一例（`liftHow` 为 `null` 的规则不出现 `/guard lift`），§11 请求 1 加一句请规则板的目录条目带 `liftable`（取自 `GUARD_RULES`，M3 与 M7 的表合入后同样带），草图的例子换成一条可撤下的规则。

#### P9-02 删掉 0.9 里「人自己选只记录」的句子并全页禁用「只记下，不挡」，与宪章 0.8、规则板 0.10 仍保留的人选只记录冲突，验收条件无法同时满足

- 位置：§4.7 末条（「1.0 把这一条放宽到所有规则……0.9 写的『用户想先看一条规矩会挡下什么时，让它只记下、不挡（页面写「只记下，不挡」）』整句删去」）；§1.4 第 8 条 (a)（「页面没有『只记下，不挡』……」）；§10.1 的 1.0 一条（「全文与全部固定字串（页面、上手页）……不含『只记下，不挡』」）；§10.3 第 13 项 (a)（「全文搜不到『只记下，不挡』」）；`onepage-done.md` 第 8 条。
- 事实：决定 `d-code-rules-enforce` 的范围是「每一条写在代码里的规则」，删的是只为转正存在的东西（M4 的 PROMOTION、影子判定、页面上的标注、M7 周报阶梯的「影子转生效」）。宪章 0.8（已推送，`cd257a7`）§6 仍写：「用户想先看一条板上的规矩会挡下什么，可以让它只记录、不拦，那是用户选的做法，不是必经的阶段。」规则板 0.10 的动作表仍有 `record`（第 295 行），验收第 5 条写「只记录是人选的动作，不是试运行」，§9.1 的换词表把「只记录」写成「只记下，不挡」（第 1481 行）；M4 0.6 §3.10 的晨报仍单列「只记录 m 条（规则板上人选的做法）」。没有哪条人定的决定取消这个动作。
- 后果：人在「你定的规则」里选了只记录的规则，页面按规则板的字应当写「只记下，不挡」，而 1.0 的验收第 8 条 (a)、L2 与 L4 的「不含」检查都要求全页没有这个词。实现者只能让检查失败，或把这类规则的标注改成别的词（那就是面板自己另写一份，违背「字句取规则板与循环板设计」），或把它隐去（人看不出这条规则不拦）。
- 改法：二选一，先定哪一种。(a) 保留人选的只记录：在 §4.7 末条补回一句，限在「你定的规则」「你加的循环条目」，写明这类条目按规则板的字写「只记下，不挡」并说是你选的做法、不是试运行阶段；验收第 8 条 (a)、§10.1、§10.3 第 13 项 (a) 的「不含」检查限定在「写在代码里的规则」一组、上手页和任何转正进度，并给「你定的规则」一组留一个例外；`onepage-done.md` 第 8 条同改。(b) 若人的意思是连人选的只记录也不要了，这不在决定节点的文字里，就写成一条要人确认的事，并给规则板 0.10 §2.3、§9.1 与宪章 0.8 §6 各记一条请求，确认之前面板不删这句。

#### P9-03 超时来源只认两种写法，M4 0.6 与现有板子里的正常取值会被判成「没有记录」

- 位置：§4.7「超时的数与超时记录」第一条（「来源，两种」）；§8.2 新增一行（「来源为『agent 估的』……或『系统按 N 次运行定』……不合的一项不显示，该格写『没有记录：<原因>』，`console.warn` 一次」）；§1.4 第 8 条 (c)；§10.1 的 1.0 一条。
- 事实：M4 0.6 §6.3.1 第 2 条与第 1069 行：检查行里的预计秒数是可选的，「检查行也没写预计时，超时就是上限」，这是一种正常取值，既不是 agent 估的，也不是按几次运行定的；`ValueLine` 的来源联合类型里也没有它的位置。另外，决定要求的先估后测还没进规则板 0.10、循环板 0.6、M7 0.6（用户图 G28：它们还写固定的数，拦路脚本 10 秒、不拦路缺省 60 秒封顶 1800 秒、M7 每条 30 分钟，改法是自举之后的请求）。这些板上条目的超时数没有来源也没有历史。按 §8.2 这两种情形都是形状不合，格里写「没有记录」且每个条目每种原因出一次 `console.warn`。
- 后果：在三份已放行设计采纳之前，两块板上带超时的条目几乎都显示「没有记录」并产生一串告警，把「缺数据」和「设计里就是固定值」混在一起；决定 3 要的可追溯在这段时间里恰恰看不出来。
- 改法：来源的写法加两种，并区分于「缺」：「没写估计，按上限 Y 秒」（M4 的那一种）和「设计里定的固定值」（板子还没有先估后测时，数取自设计，不告警）；§8.2 的校验把这三种与原来两种都算合法，只有板给了数却连这几种都不是，或来历与记录项形状不对，才写「没有记录：<原因>」并告警；L2 各加一例。

### NIT

#### P9-04 「点开列这个数的每一次变化」「全部来历」与 M4 0.6 的保留量不符

- 位置：§4.7 超时来历一条；§12 第 46 条（「点开列全部来历」）。
- 事实：M4 0.6 §6.3.1「整理」：每个键只留最近 20 条 `value` 与 `timeout`。板能给的来历至多是留下来的这些。
- 改法：改为「板留着的全部来历」，在说明里加一句条数由各板定（M4 的检查每个至多 20 条）。

#### P9-05 引用的宪章条款仍是 0.7，依据段没有读宪章 0.8

- 位置：§4.7 末条与新段（「取代宪章 0.7 §3.2 第 3 条后半句的先影子后拦截」）、§1.4 第 8 条（「宪章 0.7 §3.2 第 3 条」）、§2 表 0.8 起一行；1.0 的「另读」清单。
- 事实：`docs/CHARTER.md` 现在是 0.8，已在 §3.2 第 3 条与 §6 写明启用即拦、超时怎么定、可追溯，且与 `d-code-rules-enforce` 的取代对象相同；清单里没有宪章 0.8。写稿时它已推送。
- 改法：引用改为宪章 0.8 §3.2 第 3 条与 §6，「另读」清单加上它。读到 §6 那一句（人选的只记录仍保留）也会提前发现 P9-02。

#### P9-06 验收字句改动的清单漏了第 11 条

- 位置：§13（「1.0 又改了第 8、10、12 条的字句」）；§14 第 23 条（「验收字句并进第 8、10、12 条」）；§16 的 1.0 行（「验收第 8、10、12 条字句改了」）。
- 事实：第 11 条也改了（加了 `d-desktop-direct-use` 的括号），§2 表和头部提到了，上面三处没有。§13 是人要签的那一件，漏一条让人少看一处。
- 改法：三处都写「第 8、10、11、12 条」。

#### P9-07 `mockup-boards.svg` 的撤下与拦下计数只画了一组一行，示例数字与 M4 的取值规则相抵

- 位置：`mockup-boards.svg` 左页「写在代码里的规则 · 启用即拦」（y=960 一行拦下计数、y=978 一行撤下）和「你定的规则」的超时三行（y=696 至 y=732）。
- 事实：§4.7 与验收第 8 条写每条规则下面各有拦下数和撤下一行，草图只给整组一条撤下、四条里一条的拦下数。另外示例写「系统按最近 5 次最慢的 2 秒的 3 倍定」，同时记着当天 11:02 一次超时「限 6 秒，用了 6 秒」；M4 0.6 §6.3.1 第 4 条规定因超时被结束的一次按当时的上限记，所以这次超时之后最慢的一次是 6 秒，不是 2 秒，数字对不上。草图声明「时间、结果与条目都是示意」，所以不挡路。
- 改法：草图至少给两条规则各画拦下数，撤下一行写成每条下面的形状（并按 P9-01 画一条「现在还不能一句话撤下」的）；超时示例改成不互相矛盾的数。

#### P9-08 `mockup-home.svg` 的说明行在 560 宽的画布上被截，疑问行与 §13 不同

- 位置：`mockup-home.svg` 底部的说明行（包括 1.0 新加的两行和改写的一行）；y=432 的疑问行。
- 事实：渲染后这些说明行在右边缘被截断，1.0 新加的「1.0：『上次看之后』里一个模块或里程碑……」读不全；0.9 的几行本来也有同样问题。草图的疑问行是「人话版里第 8 条最长，我拿不准有没有说清」，§13 是「……，你读到那里多看一眼」，头部说示例四行与 §13 对上。
- 改法：说明行拆成两行或加宽画布；疑问行补全或 §13 去掉尾巴。

#### P9-09 验收第 8 条 (d) 标 L4，但这一行的数据没有来源，L4 怎么造没写

- 位置：§1.4 第 8 条 (d)；§10.3 第 13 项 (c)（「用假的额度状态……看首页『现在』多一行」）。
- 事实：停住原因与重置时刻现在没有哪份设计写出来（G15），所以真实桌面版上不会出现这一行；§10.3 说用假的额度状态，没有说假数据放在哪里（循环板的页面数据来自 `view.json`，§8.4，而 `view.json` 里没有额度字段）。
- 改法：第 13 项 (c) 写明造法（例如在临时项目的 `.llm/loops/view.json` 里手写 `homeLine`，或在 L4 构建里登记一块带 `homeLine` 的测试板），并把验收第 8 条 (d) 的 L4 标成「循环板给出该数据之后」，在那之前以 L2 为准。

### 核实过的假设（本轮新增或复核）

1. 四个决定节点的正文与 1.0 的转述一致，尤其 `d-timeout-measured` 的取值、三个上限（拦路脚本 10 秒、M4 每检查 60 秒与一步 20 秒、M7 每条 30 分钟）、「3 倍超过上限保持上限并告诉主 Agent」；`d-desktop-direct-use` 的备份与运行报告。
2. 宪章 0.8 §3.2 第 3 条与 §6：启用即拦、撤下一句话或一条命令、超时怎么定与可追溯；只能事后发现的检查不能当规则用，由 M4 定。
3. M4 0.6：`guard_lift` 与 `/guard lift`、`/guard restore`（§3.5）；`GUARD_RULES` 的 `liftable`；`LateRecord`（§3.4）；超时三种行 `RunLine`、`ValueLine`、`TimeoutLine` 与「整理」每键留 20 条（§6.3.1）；`credential-read` 删除（§4.2）。
4. 循环板 0.6 §8.2 第 5 项的超时一行字句、§8.3 `homeLine` 的次序与 60 码点上限、§8.1 `homeLine` 登记。
5. M7 0.6 §3.9.3 第 5 条与 §3.9.4：目标上有整体审查批注，完成门禁认它。
6. `STATUSES`（`src/graph/schema.ts`）含 `done`；`src/graph` 里没有里程碑这个节点类型。
7. 规则板 0.10 §1.4 第 12 条（第 170 行）原文含 `credential-read`、「只记下，不挡」、「没有解除，也没有任何改法」。

### 未核实或不成立的假设

- M4 设计 0.6 未评审，文件在 1.0 写完之后（14:50）还在改；`guard_lift`、`/guard lift` 的名字面板已写「以 0.6 定稿为准」，成立，但 P9-01 的范围核对也以此刻的 0.6 为准。
- 指标流水设计 1.0 没有读；面板不依赖它的事件种类名，这一点由 §4.7 与 §8.2 自身成立，不需要读它。
- `impl-rules-loops-boards` 已直接按 `d-code-rules-enforce` 做（§11 的一句）：依据是决定节点正文与用户图 G26 的同一句话，没有读那个实现节点。
- 没有重跑设计里的〔推断〕项与 L4；没有核对 main 的新提交。
- 作者交付说明里「A search of 0.9 found no credential-read rule」：成立（0.9 全文无此规则），我核过。

### 交给编排者记图的事项

本步按简报只写评审文件，不写 `docs/graph/`。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9
round 4: HIGH 0, MEDIUM 2, LOW 7
round 5: HIGH 0, MEDIUM 2, LOW 11
round 6: HIGH 0, MEDIUM 0, LOW 6
round 7: HIGH 0, MEDIUM 2, NIT 7
round 8: HIGH 0, MEDIUM 0, NIT 6
round 9: HIGH 0, MEDIUM 3, NIT 6

挡路条数（HIGH 加 MEDIUM）：6、2、2、2、2、0、2、0、3。

结论：CHANGES_REQUESTED。五条决定都折进了设计，第 8 轮的六条 NIT 全部关闭，没有决定之外的行为改动，变更记录除漏一条验收编号外属实，也没有改动已放行设计。三条挡路发现都出在决定 1 与 3 的折入方式上：撤下一行没有区分能撤与不能撤的规则（P9-01）；全页禁用「只记下，不挡」越过了决定的范围，与宪章 0.8 和规则板 0.10 仍保留的人选只记录冲突（P9-02）；超时来源只认两种，M4 0.6 与现有板子的正常取值会被判成缺数据（P9-03）。三条都能在本设计内改好，不需要改已放行设计。

## 第 10 轮（2026-10-31，design.md 1.1，第二遍）

评审对象：`design.md` 1.1（第 11 稿，2026-10-31 21:00 写完）。1.1 是对 1.0 的修订，答第 9 轮的九条（挡路 3：P9-01 到 P9-03；NIT 6：P9-04 到 P9-09）。简报允许最多两遍，这是第二遍。判级标准同第 5 至 9 轮：`docs/DEVELOPMENT.md` §1.1「评审挡路的标准」，违背方向清单也挡路。本轮只读文件，不改设计，没有写 `docs/graph/`（本步简报只让写评审文件与闸门文件）。

核对方法：

- `v1.0/design-1.0.md` 与 `design.md` 逐块对比（`git diff --no-index -U0`：76 行增、33 行删，30 个块，全部读过）。`v1.0/design-1.0.md` 为 318300 字节，写入时间 14:48:11，与第 9 轮评审的 1.0 稿时间一致；`v0.9/design-0.9.md` 的 SHA-256 仍是 `05F97905…D182E68`，与第 9 轮记的相同。`design.md` 1.1 的 SHA-256 是 `2BA26B55…97016`。
- 改动落点：头部（新增 1.1 段，1.0 段内加 1.1 注）、依据、新增「1.1 另读」、§1.4 第 8 条 (a)(c)(d)、§2 三行、§4.7 六处、§8.1 一行、§8.2 两行、§10.1 一条、§10.3 第 5 与 13 项、§11 抬头与第 1、2、4 条、§12 第 45、46 条与新增第 51 条、§13 一句、§14 第 23、24、25、27 条与新增第 30 至 32 条、§15.5 一行、新增 §15.8、§16 的 1.0 行改字与新增 1.1 行。别处原样（§4.2、§4.3、§4.8、§6.4、§10.3 第 8 项均无改动）。每一处都能归到第 9 轮的九条之一，没有发现九条之外的行为改动。
- 草图：`mockup-boards.svg`、`mockup-home.svg` 与 `v1.0/` 里的旧版对比，并用无头浏览器（Edge）按画布尺寸渲染（1120×1456、560×1610）。其余五张的时间戳早于 1.1 的写稿，头部说没有改。
- 一页稿：读了 `onepage-done.md`（21:00:04）第 8 条，与 §1.4 第 8 条逐句对过。
- 对着读的材料（本轮重新读的盘面，晚于第 9 轮）：M4 设计 0.6（文件时间 21:05，比 1.1 写完还晚 5 分钟）§3.5、§3.8、§3.10、§6.3.1；规则板 0.10 §2.3、§5、§9.1；循环板 0.6 §8.1、§8.3、§8.4；接管设计 0.6（20:50）复核 F2；用户图 `journey.md`（20:56）头部修订记录 R2 与 G26、§6.3；宪章 0.8；项目图上 `d-code-rules-enforce`（全部历史）、`bootstrap`、`user-journey` 三个节点的批注。

### 第 9 轮发现的复查

| 发现 | 结果 | 依据 |
| --- | --- | --- |
| P9-01 撤下一行对每条规则写同一条命令 | 关闭，但改法里带进了过时事实：见 P10-01 | 撤下一行改由板的页面数据给（`liftHow`、`notLiftableBecause`、`liftedAt`、`restoreHow`），形状在 §8.2 新增一行；`null` 时写「这一条现在还不能一句话撤下（<原因>）」且该行没有命令；字段整个不在时写同一句并只记一条 info；已撤下写日期与 `restoreHow`。命令名取 M4 现稿 `/rules lift`、`/rules restore`（M4 §3.5 逐字相同），`/guard lift` 已全部去掉（全文仍有 13 处提到它，都是说它已被删或 1.0 的旧写法）。M4 现稿 `guard_lift` 对 M3 的 `MAIN_AGENT_RULES`、M7 的 `EXECUTE_RULES` 返回 `invalid` 与 `lift-files-only` 的说法也与 M4 §3.5 第 3 条相符 |
| P9-02 全页禁用「只记下，不挡」 | 关闭 | 选 (a)。禁用范围缩到写在代码里的规则一组、两道门、上手页、转正进度；「你定的规则」里动作为 `record` 的条目写「只记下，不挡」加「这是你选的做法，不是试运行阶段」，循环板没有这个动作。与规则板 0.10 §2.3 动作表（`shadow` 改名 `record`）、§5 第 5 条（「只记录是人选的动作，不是试运行」）、§9.1 换词表、宪章 0.8 §6 末句、M4 0.6 §3.10 晨报单列「只记录 m 条」逐处对过，引文逐字相同。§1.4 第 8 条 (a)、§10.1、§10.3 第 5 与 13 项、`onepage-done.md` 第 8 条、§12 第 51 条同改，互相一致；§12 第 51 条给了「人要连这个动作也取消」时怎样收 |
| P9-03 超时来源只认两种 | 关闭，但第三种的来历要求与 M4 的数据不合：见 P10-02 | 来源改四种（`agent-estimate`、`measured`、`ceiling-no-estimate`、`fixed-by-design`）；固定值不要求来历与超时记录，不告警；整个来源字段不在而数在按固定值显示、每块板一条 info；「没有记录」留给数据缺或形状不对。第三种取自 M4 §6.3.1 第 2 条，第四种取自规则板 0.10 的 10 秒与 30 秒、循环板 0.6 的 60 秒封顶 1800 秒、M7 0.6 的 30 分钟（用户图 G28），数字与来源对得上 |
| P9-04 「每一次变化」 | 关闭 | 改为「板留着的全部来历」，条数由各板定，页面不声称「全部」是自条目建立以来的每一次；最早一条写「第一个值」。M4 §6.3.1「整理」每键留最近 20 条 `value` 与 `timeout`，说法相符 |
| P9-05 引宪章 0.7 | 关闭 | 现行条文引宪章 0.8 §3.2 第 3 条与 §6，「1.1 另读」把宪章 0.8 与 §6 末句列入。0.8 对齐轮留下的历史行（读的是 0.7）保持原样并加了注，说得过去 |
| P9-06 清单漏第 11 条 | 关闭 | §13、§14 第 23 条、§16 的 1.0 行都写第 8、10、11、12 条 |
| P9-07 草图示例 | 关闭，另见 P10-04 | 四条代码规则各有拦下数与撤下一行（两条能撤、两条今天撤不了）；超时示例改为「估 2 秒，超时一次按限 2 秒算，下一次是 3 倍 = 6 秒」，与 M4 §6.3.1 第 4 条相合；加了没写估计、固定值、人选只记录三个例子 |
| P9-08 首页草图截断与疑问行 | 关闭 | 560 宽渲染后说明行全部在画布内；「需要你」疑问行是「人话版里第 8 条最长，我拿不准有没有说清，你读到那里多看一眼」，与 §13 一字相同 |
| P9-09 L4 假数据放哪里 | 关闭，造法本身有问题：见 P10-03 | 验收第 8 条 (d) 先以 L2 为准，循环板给出数据后再加 L4；§10.3 第 13 项 (c) 写了造法，且说明这一步只核对面板读数、不证明数据存在 |

### 五条决定逐条核对（1.1 相对 1.0 没有改动决定 2、4、5 的落点）

| 决定 | 结果 | 依据 |
| --- | --- | --- |
| 1 `d-code-rules-enforce` | 到位，另有一条过时事实：P10-01 | 组名「启用即拦」、7 天拦下数、最近 5 条记录带规则 id、撤下一行、无转正进度、新插件行默认关闭不讲，均保留；撤下一行现在可对着 M4 现稿 §3.5/§3.8 核对（`GUARD_RULES` 的可撤范围、`lift-files-only` 只走规则板）；人选的只记录按 P9-02 处理 |
| 2 `d-credentials-readable` | 到位 | 1.1 未动；全文搜 `credential-read` 只出现在「请规则板删」的请求与说明里 |
| 3 `d-timeout-measured` | 到位，另有一条要求与 M4 数据不合：P10-02 | 取值、3 倍、上限、保持上限并告诉主 Agent、来历与最近 5 次超时、7 天超时数、「没有记录」出声，均保留；来源改四种后与 M4 §6.3.1 的取值（估、实测、无估计取上限）对得上 |
| 4 用户图两件 | 到位 | 1.1 未动 §4.2、§4.3、§4.8、§6.4；§10.3 第 13 项 (c)(d) 只改了 (c) 的造法 |
| 5 `d-desktop-direct-use` | 到位 | 1.1 未动 §10.3 第 8 项与验收第 11 条；第 13 项末句「直接在桌面版上做，包括重启」保留 |

### 简报要求的其他核对

- 决定之外的改动：除九条发现的处理外，只有 §14 新增第 30 至 32 条（给图上的批注草稿）与 §11 请求 4 随 M4 现稿改写，都在 §15.8 末段说明。`onepage-done.md` 第 8 条按 1.1 改过，句子与设计一致。
- 与已放行设计的关系：规则板 0.10（10-30 21:09）、循环板 0.6（10-30 17:09）、M3 附录 0.5（10-30 21:10）、M7 0.6（10-31 04:46）的写入时间都早于 1.1，没有被改；§11 对它们仍是只记一条批注的请求。符合 `d-freeze-until-dogfood`。
- 变更记录（§15.8、§16 的 1.1 行）是否属实：九条的处理与文件一致，只有草图说明里的「一条」与实际画了两条不符，见 P10-04。§16 的 1.0 行改了「验收第 8、10、11、12 条」并注明 1.1 补，属实。
- 干净区：全文没有人设与语气词。
- `git status` 显示 `docs/graph/` 下有 `m5.json`、`m6.json`、`orch.json`、`graph.svg` 等未提交修改，且 `user-journey.json` 在 21:16 写过。这些不是面板设计的文件，我无法把它们归到本步，也不影响本设计的判断。

### HIGH

无。

### MEDIUM

#### P10-01 撤下一行的几处说明写着已被删掉的 `/hourness-init unlock-shell`，并把裁定 `d-one-lift-path` 的批注记在错的节点上

- 位置：
  1. 「1.1 另读」一段对用户图 G26 的转述：「规则板 0.10 没有 `/rules lift`……接管的 `unlock-shell` 另有命令」。
  2. §4.7「拦下的记录与撤下」里「为什么要由板给」一条：「接管的 `bootstrap-read-no-shell` 靠它自己的命令 `/hourness-init unlock-shell`」。
  3. §11 请求 1：「`bootstrap-read-no-shell` 写它自己的 `/hourness-init unlock-shell`」。
  4. §14 第 32 条：「`d-one-lift-path`（编排方的裁定，图上没有同名节点，批注挂在 `user-journey` 上）」与「规则板 0.10 没有 `/rules lift`」。
  5. `mockup-boards.svg` y=1188 的示例原因「要改只能你手工改记录文件」。
- 事实：
  - 接管设计 0.6（文件时间 20:50）的复核 F2 删去了 `/hourness-init unlock-shell` 与流水的 `shell-unlocked`，读项目门禁改走 M4 的唯一一条路（`guard_lift`、`/rules lift`、服务 `glmHournessLifts`），不分接管。项目图 `bootstrap` 节点 08:17Z 的批注写「不设 unlock-shell」。`d-code-rules-enforce` 节点 12:56Z 的批注写「`bootstrap-read-no-shell` 按接管 0.6 的承诺登进 `GUARD_RULES`」。M4 0.6 §3.5 第 3 条同样写「`bootstrap-read-no-shell` 在目录里，撤得下」。
  - 用户图 `journey.md`（20:56）头部 R2：G26 里 M4 的 `/guard lift` 与接管的 `unlock-shell` 两项已关掉；「规则板 0.10 没有 `/rules lift`」是旧错，规则板 0.10 已有 `/rules lift <id>`，只管板上条目，代码规则目录里的条目只读（§1.4 第 12 条），S7、S8、G26、§6.3 已改正。
  - `d-one-lift-path` 的裁定原文（07:04Z、12:56Z）记在 `d-code-rules-enforce` 节点上。`user-journey` 节点历史的批注正文里搜不到这个名字。
  - M4 0.6 §3.5 第 3 条：`lift-files-only` 是 `liftVia: 'board'`，只走规则板那一路，规则板接线（dogfood 之后）之前没有路；同条写「提示里不指点人手改 `lifts.jsonl`：手写的行没有合法的 `via`，晨报会把它当篡改」。`d-code-rules-enforce` 12:56Z 的批注同样写「拦下时的提示不得指点人去手改撤下记录文件」。
- 后果：§11 请求 1 和 §14 第 24 条是要转成批注给规则板的文字。照它办，规则板会给 `bootstrap-read-no-shell` 一条根本不存在的撤下命令，页面上出现一条撤不了的命令，这正是 P9-01 要消除的毛病。§14 第 32 条把批注挂到不含这条裁定的节点上，图上的追溯会断。草图示例让页面教人手改撤下记录文件，与 M4 和编排方的约束相反。决定 1 要求页面说的撤下办法属实，这几处过时事实直接削弱它。
- 改法：
  - §4.7 那一条删去 `unlock-shell` 一句，改写为「`bootstrap-read-no-shell` 按接管 0.6 登进 `GUARD_RULES`，与 M4 的其他规则一样可撤，走同一条路；`lift-files-only` 只走规则板那一路（`liftVia: 'board'`），规则板接线之前没有路」。
  - §11 请求 1 删去「`bootstrap-read-no-shell` 写它自己的……」一句，改为「接管登进 `GUARD_RULES` 之后，它与其他可撤的规则一样给 `liftHow`」。
  - 「1.1 另读」和 §14 第 32 条把 G26 改述为「规则板 0.10 的 `/rules lift` 只管板上条目，代码规则目录里的条目只读；M3 的八条与 M7 的门不在 M4 的办法里」，去掉 `unlock-shell`。
  - §14 第 32 条改为挂在 `d-code-rules-enforce` 上（07:04Z、12:56Z 两条批注已在那里，面板设计的补充只需新写一条），删去「批注挂在 `user-journey` 上」。
  - 草图 y=1188 的原因改成不指点手改记录文件的说法，例「（它护着撤下记录本身，只能在规则板上撤，规则板还没接上）」。

#### P10-02 第三种来源「没写估计，按上限」被要求带来历，M4 的数据没有这一条

- 位置：§4.7「数与来源」末段（「前三种的条目要有来历（至少当前这个数的那一条）和最近 7 天超时次数，缺了同样写『没有记录』」）；§8.2 超时一行（「前三种要有来历（至少一项）与 7 天超时次数」）；§1.4 第 8 条 (c)（「前三种的条目，点开有……」）；§10.1 的 1.1 一条（来源四种各一例，只有固定值一例不带来历）。
- 事实：M4 0.6 §6.3.1 的 `ValueLine`「每次取值变化写一条」，它的 `source` 只有两种：`by: 'agent'`（带 `estimateS`）和 `by: 'harness'`（带 `runs`、`factor`、`floorMs`）。第 2 条写明检查行没写预计也没有实测时，超时就是上限。这一种既没有估计也没有运行，M4 的账里没有一种 `source` 能写它，所以第一次运行改变这个值之前没有一条合法的来历行。第 9 轮 P9-03 的理由正是这一种是 M4 的正常取值，不能当缺数据；1.1 把它列为合法来源，又要求它带来历。
- 后果：M4 的每个没写预计的检查，在第一次运行之前，页面上会写「没有记录：缺来历」并出一条 `console.warn`。这是 P9-03 指出的毛病在 P9-03 新加的那一种上重现，而且这一种在 M4 里是可选项，不会少。L2 的假数据自己造了来历，测不出来。
- 改法：第三种与第四种同样处理，来历和超时记录可以缺，缺则不显示这两格、不告警，给了就显示并按同样规则检查；7 天超时次数不要求（M4 的 `TimeoutLine` 可数，为 0 时写「最近没有超时」）。改 §4.7 末段、§8.2 超时一行、§1.4 第 8 条 (c)、§12 第 46 条，§10.1 加一例「没写估计、不带来历」的数据，页面不出现「没有记录」。第一次运行把值改成实测值之后来源变为第二种，那时才要求来历。

### NIT

#### P10-03 §10.3 第 13 项 (c) 的两种造法，一种行不通，一种会撞上登记表的去重

- 位置：§10.3 第 13 项 (c)。
- 事实：循环板 0.6 §8.1：板的 `available` 为「投影 `hournessLoops` 在这个会话上有值且 `projectKey` 不为空」，投影由循环板的宿主行注册（§8.4）。造法二写「临时项目的 `.llm/loops/view.json` 里手写 `homeLine`……循环板的行关着就不会被它重写」。行关着时没有投影，板 `available` 为假，面板不会读那个文件；行开着时宿主在内容变化时重写 `view.json`（至多每 2 秒一次），手写的字段留不住。造法一写「在 L4 构建里登记一块 id 为 `loops` 的测试板」。本稿 §8.1 写明登记表按 `id` 去重，同一个 `id` 第二次登记时报错、不覆盖；真正的循环板也往同一张表里登记自己。
- 改法：删去造法二；造法一写明测试板登记时真正的循环板尚未在这个构建里（或用一个别的 id 的测试板，并写明首页「现在」读哪块板的 `homeLine`），不再要求关循环板的行。或者两种都留，各加一句它成立的前提。

#### P10-04 变更记录说草图里「一条」撤不了，实际画了两条

- 位置：头部 1.1 段（「其中一条是『现在还不能一句话撤下』」）；§15.8 的 P9-07 一行（「一条画成『现在还不能一句话撤下』」）。
- 事实：`mockup-boards.svg` 的四条规则里，「主 Agent 没有写文件的工具」（y=1002）和「撤下记录只经撤下的办法改」（y=1188）都画成不能撤；草图底部 y=1440 的说明写「左边四条里两条能撤、两条今天撤不了」。作者的交付说明写的也是两条能撤、两条不能。
- 改法：两处都写「两条」。

### 核实过的假设（本轮新增或复核）

1. M4 0.6 现稿 §3.5：人撤下一条代码规则只有一条路（跟主 Agent 说，或 `/rules lift <规则 id>`，恢复 `/rules restore <规则 id>`，经服务 `glmHournessLifts`）；`guard_lift` 对不在 `GUARD_RULES` 的规则（含 M3、M7 的表）返回 `invalid`；`/guard` 已删；M4 不注册面向人的斜杠命令。
2. M4 0.6 §3.8：`GUARD_RULES` 含 guard 行六条、`graph-files-only`、`loops:schedule-tools`、`loops:files-only`、`metrics-files-only`；`liftable` 除 `lift-files-only` 外为真。§3.5 同时写了 `liftVia: 'any' | 'board'`，两处用词不同，M4 稿还在改。面板不绑定 M4 的字段名，只绑定板给的 `liftHow` 等，所以不受影响。
3. M4 0.6 §6.3.1：取值第 1、2、4、5 条与 1.1 的转述一致（`CHECK_RECENT_RUNS` 为 10；超时那次按当时的上限记；预计可选；3 倍超过上限保持上限）；`RunLine`、`ValueLine`、`TimeoutLine` 三种行；整理每键留最近 20 条 `value` 与 `timeout`。
4. 规则板 0.10 §2.3（`shadow` 改名 `record`）、§5 第 5 条与「撤得快」一条（`/rules delete`、`/rules lift`，人选的只记录「不是一个阶段」）、§9.1 换词表（「只记录」写「只记下，不挡」）。规则板 0.10 里没有 `/rules restore`；设计里的 `restoreHow` 示例用它，示例明说以板给的为准，成立。
5. 循环板 0.6 §8.1 板块登记（`subscribe`、`snapshot`、`homeLine`、`available`）、§8.3 `homeLine` 至多 60 码点按次序取第一个成立的、§8.4 `view.json` 由宿主写、页面经 `readBytes` 读。循环板没有「只记录」这个条目动作（规则对循环动作的判定里有只记录，但那是规则板的规则）。
6. 宪章 0.8（`cd257a7`）§3.2 第 3 条与 §6 末句：「用户想先看一条板上的规矩会挡下什么，可以让它只记录、不拦，那是用户选的做法，不是必经的阶段」，与 1.1 引文逐字相同。
7. 项目图 `d-code-rules-enforce` 的正文与 07:04Z、12:56Z 两条批注；`bootstrap` 节点 08:17Z 批注。
8. 草图渲染：`mockup-home.svg` 与 `mockup-boards.svg` 在各自画布内，说明行没有截断；两张草图的文字与 §4.7、§1.4 第 8 条、§13 一致（除 P10-01 第 5 项与 P10-04）。

### 未核实或不成立的假设

- M4 设计 0.6 未评审，文件在 1.1 写完之后（21:05）还在改；本轮对 M4 的核对以 21:05 的版本为准，其中 `liftable` 与 `liftVia` 并存说明稿还在动。
- 接管设计 0.6 的复核（F2）按用户图的记法在盘上 16:26 已改完，文件现为 20:50；本轮读的是 20:50 的版本。
- 没有读代码，也没有跑桌面版；1.1 自己也没有（头部已声明）。设计里的〔推断〕项与 L4 照旧未重跑。
- `impl-rules-loops-boards` 的实现节点没有读；§11 说它已直接按 `d-code-rules-enforce` 做，依据是决定节点正文。
- 指标流水设计 1.0 没有读；面板不依赖它的事件种类名。

### 交给编排者记图的事项

本步按简报只写评审文件与闸门文件，不写 `docs/graph/`。供编排者决定是否记：`d-one-lift-path` 的裁定批注在 `d-code-rules-enforce` 上，不在 `user-journey` 上（P10-01）；M4 0.6 正文里 `liftable` 与 `liftVia` 并存，定稿前需统一（面板不受影响）。

### 本轮计数

round 1: HIGH 1, MEDIUM 5, LOW 13
round 2: HIGH 0, MEDIUM 2, LOW 9
round 3: HIGH 0, MEDIUM 2, LOW 9
round 4: HIGH 0, MEDIUM 2, LOW 7
round 5: HIGH 0, MEDIUM 2, LOW 11
round 6: HIGH 0, MEDIUM 0, LOW 6
round 7: HIGH 0, MEDIUM 2, NIT 7
round 8: HIGH 0, MEDIUM 0, NIT 6
round 9: HIGH 0, MEDIUM 3, NIT 6
round 10: HIGH 0, MEDIUM 2, NIT 2

挡路条数（HIGH 加 MEDIUM）：6、2、2、2、2、0、2、0、3、2。

结论：CHANGES_REQUESTED。九条里八条完全关闭，P9-01 到 P9-03 的机制都按评审的改法做对了，没有决定之外的行为改动，也没有改动已放行设计。挡路 3 降到 2，两条都是文字层面的修补，不需要改已放行设计：P10-01 是撤下说明里沿用的过时事实（`unlock-shell` 已删、裁定批注的位置、草图里教人手改记录文件），P10-02 是「没写估计」这一种来源被要求带 M4 并不产生的来历。简报规定最多两遍，两遍已用完，后续由编排者决定是否再给一轮或交人。
