# 面板与新手引导：实施批次图

依据：决策 `d-panel-released`（设计 1.3 与一页稿放行，17 条做完条件定稿，人话版 `.agents/tasks/plain-ui/onepage-done.md`）、`.agents/tasks/plain-ui/design.md` 1.3（§4.2–§4.11 面板、§6 引导、§9.1 归属、§9.2 顺序）、节点 `onboarding`（验收第 11–16 条）、`m8-plain-language`（验收第 1–10、17 条）。相关已定决策：`d-native-panel`、`d-metrics-ratios-person-only`、`d-recommend-last`、`d-ui-look-not-operate`、`d-chat-not-cards`、`d-code-rules-enforce`、`d-timeout-measured`、`d-main-agent-peak-exempt`。

基座：`panel` 分支，基于 `cbc90a5`（status hub 已合入：`src/shared/status.ts` 条目契约、`provideRowStatus`/`collectStatus`、`glm/usage`+`glm/quota`+`rules/peak` 条目、`BoardState.items`+`checkedBoardState`+`homeLineFromItem`（`ui/src/graph/boards.ts`））。status hub 还欠两批（env/rules 条目等 m4；M7 读路等 M7）——本线不做那两批的条目，依赖它们的做完条件标「顺延」。

工作树门禁（每批串行，退出码不吞，日志写 `.llm/logs/panel-<batch>-*.log`）：
`npm run build` → `npm run preflight` → `npm test` → `npm run -s probe`。
棘轮按本树基点实测（预期 eslint 220 压制 / knip 19 / jscpd 1），只降不升。

## 批次

| 批 | 内容 | 条件 | 依据 |
| --- | --- | --- | --- |
| P0 | 本计划（批次图与顺延清单） | — | §9.2 顺序 |
| P1 | 现场投影 `awaiting`：`src/graph/live.ts` 折叠 `propose_to_human`/`record_human_answer`（`tool-names.ts` 的常量与 `shownProposalOf`），`stateVersion` 2→3，`parseState`/`parseView` 加形状检查；`tests/graph-live.spec.ts` 加用例 | 6（第二种）、17（等你放行的模块） | §4.9 |
| P2 | 模板 `src/graph/plain-view.ts`：`remainingOf`、`planOf`、`statusPhrase`、`needsOf`、`questionView`、`changesSince`、`shortTitle`、`liveLine`、`quote`、`blockersOf`（`blockersOf` 同时进 `projection.ts` 的 `gatesOf` 与 `listOpenItems` 口径）；`modules.ts` 在 main，加 `moduleStateOf`、`modulesView`（`derivedStage` 不在，M7 E1b 之前「在开发/放行了」合并为放行后状态，M7 合入后补）；新 spec `tests/graph-plain-view.spec.ts` 进 `npm test` 列表 | 2（模板侧）、3、4（数据）、6、10、17 | §4.3、§4.4、§4.8、§4.11、§5.4 |
| P3 | 面板只读（第 7 条）：删 `ui/src/graph/apply.ts` 与面板全部写入控件（批准/否决/选项拍板/运行控制）；删宿主命令 `/graph-apply`（`panel-row.ts`、`run-control.ts` 文案、`labels.ts` 注释、locale、cordis.patch 注释、探针步骤、测试）；`ui/src/graph/` 静态检查不含 `commands.execute` | 7 | §3.1、§9.1、§9.2 第 5 步 |
| P4 | 首页改版：去页签，首页五节（效果是、需要你、现在、怎么做、上次看之后），页脚（板块入口 + 整张图）；第 2 层页：需要你全部、计划、现场、上次看之后、agent 自己定的事、框架与模块（图上无 `norm-directions` 时不出现）；`ui/src/graph/seen.ts`（`nextSeen` 状态机 + 本机记录，键为 nodes 目录绝对路径）；节点页的「运行」一节只剩一行说明（无按钮）。落地记录：上手说明页脚入口未加，P6 与上手页一起接（设计 §6.6 的位置）；`Doing.tsx` 与 `NeedsYou` 旧组件删净，`NeedsYou.tsx` 只剩 `NeedsPage` | 1、4、5、6（首页版式）、17 | §4.1–§4.6、§4.8、§4.11、§6.8 |
| P5 | 主 Agent 的位置：`src/graph/panel-row.ts` 注册投影 `hournessProject`（`holderPathOf` 薄包装转调 `main-agent-holder.ts` 的 `holderFileOf`）；`ui/src/graph/MainChat.tsx` 导出 `useMainAgent`（三种结果 + 退路 + `open()`）；需要你每件的跳转行、「现在」的 `mainHere` 主语；客户端 `inject` 加 `uiWorkspace`。落地记录：持有者记录的形状与解析抽到 `src/shared/holder-record.ts`（宿主与客户端同源，消 jscpd 克隆）；纯逻辑（`mainChatOf`、`cwdKeyOf`）在 `ui/src/graph/main-chat.ts`，测试吃得了（`node --experimental-strip-types` 不认 .tsx）；主 Agent 在别的会话时「需要你」改读它那份 `graphLive.awaiting`（缺值时 `refreshProjections` 一次）；记录读不到、投影不在各有退路与 reason，原因进控制台一次 | 6（跳转行）、1（现在一句） | §4.9 |
| P6 | 编排层引导：`ui/src/guide/state.ts`（`firstVisit` 本机记录 + 图上身份 human 历史）、`ui/src/graph/Guide.tsx`（上手页六块，第 4/5 块只在对应板块登记时出现，高峰模式几句只在 `peakApplies` 时出现，含主 Agent 不受高峰影响一句）、第一次打开自动出现、页脚「上手说明」重开、`ui/src/guide/FirstVisitLine.tsx` + `WishCard.tsx` 接线（`FIRST_VISIT_LINE = true`）、`ui/src/guide/NoGraphCard.tsx`（`hourness-nograph`，order 41，每工作区一次）、面板没有图一节的字、`scripts/packages.mjs` sources 加 `ui/src/guide/`。落地记录：第 2 块的字按落地的问法（`d-ask-three-gates`）写，四行版式等第 1、6、9、17 条重定；第 3 块没有「/wish 没注册」的分支（设计行默认启用，命令注册检查要 commands.list 异步，L4 定）；人设设置位一行没接（需要客户端可见的设置在场信号，随 L4）；登记表此刻只有经验板，第 4、5 块代码就位、运行时不出现（等规则板/循环板页面）；useBoard 抽到 `ui/src/graph/board-state.ts` 供面板与上手页共用；客户端 inject 加 `sidebarRight`（§6.5 的 openTab） | 12、14（接管行不在的分支）、15、16 | §6.2、§6.4–§6.6、§6.8 |
| P7 | GLM 引导（GLM 包）：`ui/src/channel.js`/`ui/src/channel-model.ts` 会话按钮无记录时写「GLM · 上手」、三步对话框（登录/选模型/发一句话）、读到已登录或「跳过」或 3 个会话出现后记完成、设置页「重新看上手说明」；开场画面 `conversation.hero.options` 小按钮；`src/glm-llm/zcode.ts` 未登录中文报错。落地记录：记录与三会话规则的纯函数在 `channel-model.ts`（`glmOnboardingDone`/`noteSessionSeen` 等），L2 在 `tests/glm-channel.spec.ts`；对话框开着时读到已登录，上手块这一次不收（第 1 步打勾），关上才恢复（§6.3 冻结在打开时刻）；开场小按钮不自动读 `/glm-status`，只有点「登录」执行命令（§6.3）；「重新看上手说明」只清 `glm.v1` 记录，seen 列表不清（三会话退出会重新累计）；未登录报错中文在前、原英文在后（无测试钉旧文本，L2 全绿） | 13、11（GLM 侧）、16 | §6.1、§6.3、§6.8 |
| P8 | 桌面 L4 阻断①的修复批：GraphPanel 跨工作区会话切换抛 React #310。根因不是走查猜的 sessions-store 快照读（`sessions.list` 是 `createSnapshotStore`，`getSnapshot` 返回 `i.getState()`，`projectionsBySession` 是稳定切片；官方包同样派生选择——`dsh-client-ui-subagent` 358 行 `useSessions(state => state.projectionsBySession)`；走查看到的每调用新 `Object.fromEntries` 是 manager 的 `getListSnapshot()`，经 `projectList()` 写回 store，React 侧从不接触），而是 hooks 顺序违规：`ui/src/graph/Panel.tsx` 的 `goalTitle` useCallback 在「无图早退」之后，桌面宿主 React 18.3.1（rc.3 `dsh-web-frontend` dist 实测版本号；其 #310 = "Rendered more hooks than during the previous render."，`react@v18.3.1` 源码 codes.json 核对）下，面板先以无图分支提交 27 个 hook、切到有图会话后渲染走到第 28 个 hook 即抛。修复：`goalTitle` 改普通闭包（唯一消费者 PlanPage 无 memo，标识本无用），条件区从此无 hook，正反两个切换方向都恒定。回归 L2 `tests/graph-panel-hooks.spec.ts`：esbuild 把真 `Panel.tsx` 编进 hook 数校验的 react shim（双向：多 hook = #310 文案，少 hook = #300 文案），无图工作区挂载→切有图会话→切回；修复前红（`take`→`useCallback`→`GraphPanel` 抛 #310 文案）、修复后绿；`fakeRemote`/`until` 从 `tests/graph-panel-model.spec.ts` 上移 `tests/graph-helpers.ts` 共用（消 jscpd 克隆）。门禁全绿：build/preflight/test/probe 退出码 0（日志 `.llm/logs/panel-310-*.log`），棘轮 217/19/1 零上升，probe 326/326。桌面复验（2026-11-04，本分支修复后 bundle，隔离实例：独立 `--user-data-dir`+`DSH_HOME`+CDP 9336+命令行标记 `glm-hourness-panel310-recheck`，不碰其他实例，只按标记杀进程，junction 装后核验）：ws-fresh（无图）与 ws-main（拷贝本仓 docs/graph 的 244 节点）两个工作区各建会话，项目图页签双侧打开，跨工作区切换循环 8 次外加页面重载后的 loading→ready 首挂路径，控制台零 React 报错（仅宿主 `plugins/events` 约 5 分钟一次的 ERR_FAILED，FACTS §3 既有记录）；整窗截图与控制台账目在 `.llm/panel-310-l4/`（10/13/15 号截图，cdp-log.jsonl）。宿主行为补记：这套 shell 里分栏页签的打开清单按会话面各记一份，经主视图工作区切换后目标面页签要重开一次；#310 的触发路径（无图分支提交→有图渲染）由「页签开着时源从未就绪到就绪」同一 hook 数变化覆盖 | — | 走查阻断①（d-panel-released 2026-11-04 批注） |

每批一个提交，文档（`docs/DESIGN.md`、`docs/ORCHESTRATION.md`、`docs/HANDOFF.md` 中受影响的行）随批同改；绿色后推 `origin/panel`。

## 顺延（本线不做、原因写明）

| 条件 | 顺延原因 | 等谁 |
| --- | --- | --- |
| 9（写法检查两阶段） | `d-panel-released` 遗留：四行问法是旧问法，面板按 `d-ask-three-gates` 落地后第 1、6、9、17 条的字要再请人改；且改引擎写入裁决需独立代码评审（`docs/DEVELOPMENT.md` §1.1）。本线先做模板侧自检（P2 的 `quote` + L2），引擎侧检查不写 | 人重定字句 + 编排方排批 |
| 2（现节点标题改写） | 要 agent 出对照表、经四门交人定——图数据改动，`d-panel-released` 明确「此后改动要人出手」；编排方按图操作，本线不改 `docs/graph/` | 编排方 + 人 |
| 8（两块板页面：会挡住动作的门、超时四来源、拦下记录、撤下 `liftHow`、只记下不挡） | 板页归规则板/循环板设计（已放行），板未在登记表上；超时与撤下条目依赖 status hub 欠的两批（env/rules 等 m4）；面板侧的入口（页脚、错误边界、`items` 透传）基座已有 | m4、规则板与循环板的行合入 |
| 8(d)「推进停住」一行 | 数据（停住原因、重置时刻）来自 M7（`execute/stopped-quota`），status hub 的 M7 读路欠着；基座的 `homeLineFromItem` 已备好，条目一到即显示 | M7 + status hub 欠批 |
| 13/11 的 L4（桌面版走查、单装组合） | 桌面版由另一线占有，本线不启动不关闭；L4 随批次 L4 做 | 批次 L4 |
| 14 的接管分支 | 接管行（`/hourness-init`）不在 main，按设计只实现「接管行不在」分支（建空目录做法、卡片无按钮）；接管行合入时补另一分支与判图法 | 接管项目合入 |
| 17 的 L4 与真图显示 | 仓库图没有 `norm-directions`，两层循环显示整个不出现（按设计）；代码 + 造图 L2 本线做，真图与桌面版核随后续 | 编排方写方向清单 + 批次 L4 |
| 验收第 1 条的首屏不滚动、第 16 条走查 | L4 读 DOM/截图，桌面版由另一线占有 | 批次 L4 |

## 设计与落地的差异（如实记）

- `blockersOf` 落在 `src/graph/projection.ts`（设计 §5.4 写在 `plain-view.ts`）：`gatesOf` 与 `listOpenItems.ready` 同批改用它，而 projection 不依赖 plain-view，反过来 plain-view 依赖 projection——放在 projection 避免互相 import。`gatesOf` 的依赖门与 `graph_open` 的「可以开工」从此算祖先的依赖，口径与面板一致（§5.4 的要求）。
- 提议式待决的四行（背景/推荐/疑问/不做）：M3 实际落地的是 `d-ask-three-gates`（`propose_to_human` 的 `recommend/choose/want/look` 问法与 `proposal/reason/cost/ways/notTaken` 字段），设计 1.3 §4.3 的四行版式没有对应字段。需要你的问题卡按落地 schema 显示（题目 + 问法字段原样、不显示选项键与推荐标记），四行版式等人重定第 1、6、9、17 条后再换（`d-panel-released` 已记此遗留）。
- `plain.ts`/`PLAIN_LIMITS`/`why`/`background` 字段：引擎侧随第 9 条顺延（见上）。模板不依赖它们。
- 模块的「在开发」状态：`derivedStage`（M7 E1b）不在 main，`moduleStateOf` 先把放行后的模块按「放行了/做完了」显示，M7 合入后同函数补两档（设计 §4.11 的表）。
- 上次看之后的离席判定：设计 §4.8 只说「人上次看到这里」，没有定计时。落地取：正文露出算到达（打开面板，或 hidden 超 10 分钟后再露出），露出满 5 秒后隐藏或卸载算离开；不到 5 秒不算（扫一眼不改窗口）。记录进浏览器本地存储，键是图 nodes 目录的绝对路径（同一图从不同工作区打开共享窗口）。
