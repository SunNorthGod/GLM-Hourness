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
| P5 | 主 Agent 的位置：`src/graph/panel-row.ts` 注册投影 `hournessProject`（`holderPathOf` 薄包装转调 `main-agent-holder.ts` 的 `holderFileOf`）；`ui/src/graph/MainChat.tsx` 导出 `useMainAgent`（三种结果 + 退路 + `open()`）；需要你每件的跳转行、「现在」的 `mainHere` 主语；客户端 `inject` 加 `uiWorkspace` | 6（跳转行）、1（现在一句） | §4.9 |
| P6 | 编排层引导：`ui/src/guide/state.ts`（`firstVisit` 本机记录 + 图上身份 human 历史）、`ui/src/graph/Guide.tsx`（上手页六块，第 4/5 块只在对应板块登记时出现，高峰模式几句只在 `peakApplies` 时出现，含主 Agent 不受高峰影响一句）、第一次打开自动出现、页脚「上手说明」重开、`ui/src/guide/FirstVisitLine.tsx` + `WishCard.tsx` 接线（`FIRST_VISIT_LINE = true`）、`ui/src/guide/NoGraphCard.tsx`（`hourness-nograph`，order 41，每工作区一次）、面板没有图一节的字、`scripts/packages.mjs` sources 加 `ui/src/guide/` | 12、14（接管行不在的分支）、15、16 | §6.2、§6.4–§6.6、§6.8 |
| P7 | GLM 引导（GLM 包）：`ui/src/channel.js`/`ui/src/channel-model.ts` 会话按钮无记录时写「GLM · 上手」、三步对话框（登录/选模型/发一句话）、读到已登录或「跳过」或 3 个会话出现后记完成、设置页「重新看上手说明」；开场画面 `conversation.hero.options` 小按钮；`src/glm-llm/zcode.ts` 未登录中文报错 | 13、11（GLM 侧）、16 | §6.1、§6.3、§6.8 |

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
