# lessons-enable 第 1 步：只读核对（2026-11-06）

范围：项目图节点 `lessons-3` 的四条验收 (a)–(d)，与行 `glm-hourness/lessons` 自己的启用门（四个 L3 场景 `glm-lessons`、`non-glm-lessons`、`glm-lessons-failure`、`non-glm-lessons-failure`，加桌面版首轮验收），在 `origin/main` 上的现状。本步没有改任何入库文件，没有跑探针、构建或安装。

## 仓库状态

- `git fetch origin` 退出码 0。主检出 `HEAD` = `origin/main` = `eb45707a9d7e325e7831882b7a7f1bdb0bd53e1f`（"graph: m5-index-truncation-alarm approved by the human and started, AI knowledge-base answer recorded on lessons"）。本步开始时第一次 fetch 读到的是 `41471aed`，之后 origin 前进到 `eb45707`，只改了 `docs/graph/`（`graph.svg`、`lessons.json`、`m5-index-truncation-alarm.json`）。
- `git status --short --untracked-files=no` 输出为空，退出码 0：主检出没有入库文件的改动。未跟踪的只有 `.agents/tasks/*` 与根目录的 `.llm-*.log`。
- 另有 `stash@{0}`（"stray main-checkout edits 2026-11-06 (knip.js package.json src/design/propose.ts ui/src/loops/LoopsPage.tsx src/memory/effect.ts), parked by m4-checks-loop-details merge"），不是本运行的，不动。
- 工作树 `.worktrees/data-journal-lock-flake` 与本地分支 `m5-index-truncation-alarm` 指在 main 上，不相干。
- 主检出 `.llm/lessons.jsonl`：21 行，全部 `op: new`，最后写入 2026-11-05T14:47:44（lessons-4，合入 `b1485c8`）。

## check-lint 棘轮（读基线文件，未跑 `npm run lint`）

| 基线 | 数 | 文件 |
| --- | --- | --- |
| ESLint 压制 | 73（20 个文件） | `eslint-suppressions.json` |
| knip | 18 条 findings | `knip-baseline.json` |
| jscpd | 1 个指纹 | `.jscpd-baseline.json` |

与 lessons-4 合入时记的 73/18/1 相同。

## lessons-3 验收

| 条 | 现状 | 依据 |
| --- | --- | --- |
| (a) 经验一半：生效经验（坑、解法、情况、证据、最近确认）、候选数、「agent 收起的」「你删掉的」默认折起；记忆一半：偏好带原话与「原话未核对」、确认的习惯带问话与「要记的」、确认后改过的「内容在你确认之后改过」、项目事实带出处与强度、汇报细度一行、折起的「你说过不用记的习惯」（问话、原话、几号之前不再问）；每条一行「要改」 | 已满足（L2 + 隔离实例 L4） | 视图模型 `ui/src/lessons/model.ts`（`buildLessonsPage`、`memoryRows`、`habitOf`、`lessonsGroup`），页面 `ui/src/lessons/LessonsPage.tsx`（三个 `<details className="glml-fold">`，不带 `open`，默认折起）。L2 `tests/lessons-panel-model.spec.ts`：「the lessons half: counts, rows newest confirmed first, collapsed groups with restore lines」「the memory half: relay with the 原话未核对 tag, one reporting-depth line, facts with source and strength」「the habit rows: a confirmed habit with its question and 要记的 line, the changed-content line, and the folded declined habits (lessons-3)」。L4：`.agents/tasks/m5/l4-2026-11-05.md` 第 1 条通过（隔离实例，工作树 `m5-rest` `b9a066e`，三个折叠节 `open: false`） |
| (b) 没有按钮、开关或表单；L2 静态检查 `ui/src/lessons/` 不调 `commands.execute` | 已满足 | `tests/lessons-panel-model.spec.ts`「no file under ui/src/lessons/ calls commands.execute or renders a write control」（`WRITE_MARK = /commands\.execute|<(?:button|input|textarea|select|form)[\s/>]/i`，要求至少 4 个文件）与「the static check finds a planted command call or button」。L4 第 2 条：`.glml` 内 button/input/textarea/select/form/role=switch/role=button/contenteditable/a 全为 0 |
| (c) 流水追加之后 15 秒内页面更新 | 已满足 | `ui/src/graph/watched-files.ts` `POLL_MS = 15_000`；`ui/src/lessons/source.ts` 的 `LessonsSource` 走变化推送加轮询。L2：「the source folds the three journals, follows an append through the change feed…」「the poll re-reads only what the stat says changed…」「an append shows within 15 seconds without a change feed … (lessons-3 #3)」。L4 第 3 条：变化推送 0.254 秒到页 |
| (d) 经验行和记忆行装上之前，页脚不显示「经验」 | 已满足（L2），L4 未看 | `ui/src/lessons/board.ts` 的 `available`：`hournessLessons` 或 `hournessMemory` 在即为真（M5 设计 §4.7「两者有一个就算」）；`ui/src/graph/Panel.tsx` `BoardLine` 在 `!state.available` 时返回 null。L2：「the lessons board is available when either projection is there, with no home or guide line」「the lessons board asks once for the projections of a session that has none yet」 |

两处字面差异，不建议改（都在 11-05 L4 里按通过记）：

1. (d) 的简报写作「两行都装上才显示」，设计与实现是「有一个就显示」。记忆行已默认启用，经验行翻开之后两种读法在出厂组合里结果相同；只在人单独关掉经验行时不同。按设计保持现状。
2. 「你说过不用记的习惯」的条目末行是「要改：MM-DD 之后想记回来，跟主 Agent 再说一次」，没有「或在输入框打 ……」一半：`/memory` 只有 `show`、`forget`、`restore`（`src/memory/commands.ts`），没有对应的人命令。收起与删掉两节的末行写「要恢复：…或打 /lessons restore …」，是设计 §4.7 的写法。不加新命令。

lessons-3 欠的只有一项：在人的真实 profile 上的 L4（经验行出厂禁用，11-05 批次 L4 `wf_be2ff3a8b7d83155` 在人的桌面上只看到「这个项目还没有经验」，见 `.agents/tasks/l4-batch-2026-11-05/l4.md`「经验与记忆」一节）。

## 启用门

| 条件 | 现状 | 依据 |
| --- | --- | --- |
| L3 `glm-lessons`、`non-glm-lessons` | 定义在 main 上，最近一次通过 | 场景：`scripts/probe/run-probe.mjs` `seedLessons`、`lessonsScript`、`runScenario('glm-lessons' …)`、`runScenario('non-glm-lessons' …)`，断言 `lessonsChecks()` 每条路由 7 条；覆盖行 `LESSONS_ROW = ['- id: glm-hourness/lessons', '  disabled: false']`。最近一次全量运行：主检出根目录 `.llm-hp-probe.log`（2026-11-06 00:43，工作树 `habits-prompts`，合入 main 为 `51af510`）"probe: 420/420 passed"，14 条 lessons 断言全部 PASS |
| L3 `glm-lessons-failure`、`non-glm-lessons-failure` | 定义在 main 上，最近一次通过 | `runFailure(...)`、`failureScripts`，断言 `lessonsFailureChecks()` 每条路由 6 条；同一份日志 12 条全部 PASS（U1、U2 成立：子 agent 的失败也带提醒） |
| 桌面版首轮验收 | 部分 | 2026-11-05 在隔离实例上过了 lessons-3 第 1–3 条（`.agents/tasks/m5/l4-2026-11-05.md`，profile 只打开经验行），没有挡路发现；人的 profile 上没做（行出厂禁用）。本运行的计划是翻开之后由人在桌面版上对 21 条真实经验核对经验页，不过就新提交改回禁用 |

那份 420/420 是在 `origin/main` 更早的提交上跑的，之后 main 合入了别的线（inject-via-prestep `e45498f`、journal 锁 `829236b` 等）；翻开之后要在新的合并树上重跑整套探针。

## 要改的（实现者）

1. `packages/hourness/cordis.patch.yml`：`glm-hourness/lessons` 行删掉 `disabled: true`；注释改写为现状：L3 四个场景已过，出厂启用，桌面版首轮在人的 profile 上待做（同 rules、loops、env 行注释的写法）。
2. L2 钉住出厂启用：仿 `tests/contracts.spec.ts` 对 env 行（`assert.doesNotMatch(envRow, /^\s+disabled:/m, …)`）或 `tests/rules-row.spec.ts`、`tests/loops-registry.spec.ts` 的「the row ships enabled in the orchestration patch (no disabled key)」，在 `tests/lessons-row.spec.ts` 或 `tests/contracts.spec.ts` 加一条：lessons 行块里没有 `disabled:`、`inject: [tools]` 在。现有测试里没有断言 lessons 行禁用的，翻开不会直接打破 L2。
3. 探针：`LESSONS_ROW` 覆盖行在行默认启用后多余；可以删掉，场景照常（四个场景的项目流水由 `seedLessons`、`seedFailureLesson` 写，与覆盖无关），或保留并改注释。另需留意：经验行在所有启动场景里都会加载，GLM 请求的 Memory 节因为工具面里有 `lessons_query` 会多 `MEMORY_L2` 一句（`src/glm-prompt/index.ts`），子 agent 的工具面多 `lessons_query`；探针现有的 Memory 节断言只认前缀 `MEMORY_SECTION_LINE`，健康断言 `health: on the GLM route …` 不检查 lessons 的状态。是否还有断言按完整工具面或完整系统提示词比对，要靠全量 `npm run probe` 判。可加一条与 rules、loops 同形的断言：「lessons: the row ships enabled: the boot scenarios list it loaded on both routes」（`glmHealth.lessons`、`plainHealth.lessons` 不是「未加载」）。
4. 文档同批改写（被取代的条款整条重写）：
   - `docs/DESIGN.md` 行表 `glm-hourness/lessons` 一行末尾「默认禁用，L3 场景 … 通过后、桌面版首轮验收前保持禁用」→ 出厂启用，四个场景已过，桌面版首轮在人的 profile 上待做。
   - `docs/ORCHESTRATION.md` §8.6 标题方括号里的「行出厂仍禁用」。
   - `docs/HANDOFF.md` 行表 `lessons` 一行（「出厂禁用：…」）与里程碑表 M5 一行（「经验行出厂启用由编排方定 …」）。
   - `docs/DEVELOPMENT.md` §14 第 5 条只列了 `glm-lessons`、`non-glm-lessons`，补上两个失败场景（改 `failure.ts` 时也要跑）。
5. 门禁：`npm run build`、`npm run preflight`、`npm test`（含 `npm run lint` 棘轮，基线保持 73/18/1 或只缩小）、`npm run probe` 全绿，四个经验场景的 26 条断言全部 PASS。
6. 不改 lessons-3 的页面代码：(a)–(c) 已满足，(d) 按设计读法已满足；上面两处字面差异不改。

## 没有核实的

- 没有在 `eb45707` 上跑构建、测试、探针；L3 结论来自 2026-11-06 00:43 的日志，不是当前 main。
- 没有读 `scripts/preflight-bundle.mjs` 是否对出厂禁用的行另有检查；`npm run preflight` 会给答案。
