# split 第 7 步设计：guard 按 question-14 G3 拦全部路由

版本 0.1（2026-10-29）。依据：

- question-14 选 G3，人的原话：「围栏到时候跟着编排层走吧，拦全部的。开编排层就全生效，不开就全不生效。」
- `design.md` 0.3 §4.2.3 的 G3 一行与 §4.2.4 的 G3 一条：「删去两处范围判定，所有路由都拦；声明加到所有路由（N、O 上用原生工具名）；影子兜底对所有路由记录，`scope` 照 G2 填写」。
- `design-addendum-q17b.md` §4.6（A14）：L4 第一轮第 4 项里 guard 的期望与「系统提示词没有规则声明」一句由本设计替换（§10）。

C、N、O 三类沿用 `design.md` §4.2.1：C 是 GLM 路由且 `glm-prompt` 已在这个 agent 上装好方言；N 是 GLM 路由但方言不在；O 是非 GLM 路由。

证据写法：`tools:行` 指 `reference/dsh-desktop-0.2.1-rc.3/dsh-tools/lib/index.js`；`scope:行`、`system-prompt:行`、`agent:行`、`agent-loop:行`、`session:行`、`llm-deepseek:行`、`persona:行`、`cordis:行` 分别指同目录下 `dsh-scope`、`dsh-system-prompt`、`dsh-agent`、`dsh-agent-loop`、`dsh-session`、`dsh-llm-deepseek`、`dsh-persona`、`cordis` 的 `lib/index.js`；`minimal.patch.yml:行` 指 `dsh-web-app/presets/minimal.patch.yml`。本仓库文件按 worktree `40190cf` 的行号写。〔实读〕读过源码；〔实测〕有运行记录；〔推断〕由源码推出、没有运行验证。

## 0. 摘要

- 拦截：删去 `src/guard/index.ts` 里 `tools/pre-execute` 监听器的模型族判定（:175–182）。每次根调用（没有 `parent`）都按规则判定，不看路由；带 `parent` 的传输层子调用照旧放行。宿主的派发本来就不分路由（H1、H2），guard 删掉自己的判定后 C、N、O 一样被拦。
- 声明：删去组装监听器里的模型族判定（:225）。每个 agent 的每次组装都在最后加 `glm:guard` 一节；工具名照第 2 步的规则取：方言接管时（C）用 `Write`、`Edit`、`Read`，否则（N、O）用 `write`、`edit`、`read`。
- 影子兜底：所有路由都记笔记、都可能写影子记录。影子记录加 `scope`（`dialect` 或 `other`）与 `route`，照 G2 的写法。
- 违规记录：guard 行与图文件门禁的拒绝记录也加 `scope` 与 `route`（agent 的提议，理由见 §4）。晨报把 `scope: other` 的记录另行计数。
- 行健康：所有调用都报 `guardHealth`；`outOfScopeHealth` 删除。
- 不装编排层包时什么都没有：guard 行、图行（图文件门禁）、影子兜底都是 `dsh-hourness` 的行，GLM 包没有任何拦截或声明（§6）。
- `docs/ORCHESTRATION.md` §6.2「先只作用于 GLM 会话」的定案由 question-14 的定案取代，整节重写（§7）。

## 1. 用到的宿主契约

| # | 契约 | 证据 | 本设计怎样用 |
| --- | --- | --- | --- |
| H1 | 模型发出的每个工具调用都经同一条路径进入 `tools/pre-execute`：agent 循环为每个调用块构造 `{callId, name, arguments, agent, signal}`，`agent` 是发起这一步的 agent（agent-loop:506–517），逐个交给调度器的 `prepare`（agent-loop:582）；`prepare` 进 `prepareExecution`（tools:2768、3307–3309），后者在 `scopeTarget(this, exec.agent)` 上跑 `tools/pre-execute` 瀑布（tools:3320–3321）。载荷里没有 provider 或 model。决策为 `deny` 时，调用的结果是 `Error: ` 加理由，工具体不执行（tools:3337–3353） | 〔实读〕 | 拦截不依赖路由；删掉 guard 自己的模型族判定，C、N、O 的调用走同一套判定与拒绝 |
| H2 | 瀑布按载体过滤监听器：`dispatch` 只保留 `global` 或通过载体 `Context.filter` 的监听器（cordis:258–263）；`scopeTarget` 的过滤先走服务原有的过滤，再对没有作用域标记的上下文一律放行（scope:327–335）；服务的原有过滤只比较 isolate（cordis:1785–1787） | 〔实读〕；桌面版组合上〔实测〕：2026-10-28 的 L4 里 guard 拦下了 DeepSeek 会话的写入（`docs/DEVELOPMENT.md` §7 事故表），之后的 GLM 会话一直被拦 | guard 行在宿主层的 `ctx.on('tools/pre-execute')` 收到每个 agent 的调用，不分路由；这一点今天在桌面版上两类路由都见过 |
| H3 | `agent/created` 对每个登记的 agent 串行发一次，载荷 `{agent, source, signal?}`（agent:574–585）；载荷里没有路由，路由按步选择 | 〔实读〕 | 声明监听器照旧在每个 agent 创建时装一次，判不判、怎么写都在每次组装里决定 |
| H4 | 系统提示词组装在 `scopeTarget(this, scope)` 上跑 `system-prompt/assemble` 瀑布（system-prompt:398）；模型选择的监听器在 `next()` 之后写 `variables.provider`、`variables.model`（agent:166–180） | 〔实读〕 | guard 的 prepend 监听器在 `next()` 之后读路由，只用来决定工具名与 C 类判断，不再决定要不要加这一节 |
| H5 | 渲染只拼节的 `text`，节名不进提示词；`interpolate: false` 的节原样输出（system-prompt:117–118） | 〔实读〕 | 节名 `glm:guard` 模型看不到，非 GLM 路由上沿用这个名字没有可见影响（§3） |
| H6 | 有 `complete: true` 的节时，瀑布之后只保留这一节（system-prompt:381–384、391、399–403）；persona 行的 `complete` 配置就是这个开关（persona:26、40）；预设 minimal 打开它（minimal.patch.yml:15），并关掉 `write`、`edit`、`read`（minimal.patch.yml:18–23） | 〔实读〕 | 用 complete persona 的 agent 上声明被宿主丢弃，拦截不受影响；minimal 预设上纠偏里的正路指向它没有的工具（§3.3） |
| H7 | agent 循环每步渲染一次提示词（agent-loop:907、1049），模型声明 `systemPromptUpdate: "in-history"` 时把提示词的变化作为历史里的系统更新提交（agent-loop:1057–1058）；DeepSeek 官方两个模型都这样声明（llm-deepseek:19–25），序列化时第一条之后的系统文本作为历史中的 `system` 消息发出（llm-deepseek:1603、1677–1678） | 序列化〔实读〕；`systemPrompt.project` 怎样算出变化没有读，〔推断〕 | 已有的 DeepSeek 会话在升级后的下一步收到一次系统更新，前缀缓存不断（§3.2） |
| H8 | `session.requestHeader()` 折叠 `request/header` 事件（session:1612），agent 循环在每步调用模型之前写入，变化时才写（agent-loop:1226–1240）；第一次请求之前为 undefined | 〔实读〕（`docs/DESIGN.md` §2.4a 已登记） | 只用来决定纠偏的工具名与记录里的 `route`，不再决定拦不拦 |

H1 与 H2 合起来说明：guard 今天只拦 GLM，完全是 `src/guard/index.ts` 自己的两处 `isGlmModel` 造成的，宿主没有按路由分发。删掉它们就是 G3。

## 2. 拦截

### 2.1 范围

`tools/pre-execute` 监听器：

1. `payload.parent !== undefined`：`next()`，不判、不记（不变，传输层子调用，`docs/DESIGN.md` §2.4a）。
2. 其余每次调用：读方言服务；`call.name` 经 `toNativeTool` 换成原生名；`route = sessionRoute(payload.agent?.session)`；`names = dialectNames(dialect, payload.agent, route, problem)`；`face = names ?? NATIVE_FACE`；按 `activeRules` 判定（不变）。
3. `deny`：写违规记录（§4）并返回 `deny`（不变）。`allow`：`next()`，放行后交给影子兜底（§5）。

路由未知（会话还没有请求头）与没有 agent 的调用同样判定。理由：G3 的拦截不看路由。H1 说明 rc.3 里模型发出的根调用都带 agent，并且在请求头写入之后才执行（agent-loop:1226 在调用模型之前），所以这两种情况在今天的组合里遇不到〔推断：参考目录里没有别的包调用 `tools.execute` 或调度器的 `prepare`，检索 `tools.execute(` 无结果〕。万一遇到，没有 agent 时圈禁根取不到，圈禁照旧跳过，file-tools-only 照判。

子 agent 的调用是它自己 agent 的根调用，照旧判定；圈禁根是它会话头的 `cwd`（不变，`docs/HANDOFF.md` 第 23 项）。

### 2.2 纠偏的工具名

与第 2 步相同：C 上用方言名，逐字同今天；N 与 O 上用原生名。O 类调用拿到的纠偏与 N 类今天拿到的逐字相同（`Right path: Read the target with read, then apply the change with write or edit.`）。

### 2.3 行健康

所有判定过的调用都报 `guardHealth(roots, projectHome, shadow, dialectUnusable)`（不变的函数）。DeepSeek 会话上 guard 一行从「未生效：非 GLM 路由 …，门禁不介入」变为「生效：门禁生效（file-tools-only，圈禁根 …）；违规记入 …；影子兜底 …」。`outOfScopeHealth` 没有使用者，删除。`docs/DESIGN.md` §2.5 的行健康表改写 guard 一行。

## 3. 声明

### 3.1 机制

组装监听器（每个 agent 在 `agent/created` 时装一次，H3；prepend，H4）在 `next()` 之后：

1. `route = assemblyRoute(assembled)`；
2. 规则 `activeRules({...config, workspaceRoots: rootsFor(agent, config)})`（不变）；图行启用时加 `graph-files-only` 一行（不变）；
3. `face = dialectNames(dialectService(ctx, warn), agent, route, warn) ?? NATIVE_FACE`（不变）；
4. 无条件追加 `declarationSection(rules, others, face)`。

删去的只有 :225 的 `if (!isGlmModel(route.model)) return assembled`。三类路由上的结果：

| 类 | 这一节 | 与今天相比 |
| --- | --- | --- |
| C | `Write`/`Edit` 的那一版 | 逐字相同 |
| N | `write`/`edit` 的那一版 | 逐字相同（第 2 步起就是这样） |
| O | `write`/`edit` 的那一版，与 N 逐字相同 | 新增 |

节名保留 `glm:guard`（`DECLARATION_SECTION`）：H5 说明模型看不到它；`design.md` §3.3 把提示词节名列为不改的持久化标识，名字里的 `glm` 读作项目名；测试与探针按它找这一节。

### 3.2 提示词缓存

- C、N：文本不变，缓存不受影响。
- O：新会话从第一步起就带这一节，之后只在图行加载或卸载、或会话目录变化时变（与 GLM 今天相同；会话目录不可变）。
- 升级前已经开始的 O 会话：重启后下一步的提示词多出这一节。DeepSeek 官方模型按 H7 把变化作为历史里的系统更新发出，前缀不断〔推断，同 H7〕；不声明 in-history 的其他 provider 会整段换掉系统提示词，丢一次前缀缓存〔推断〕。只发生一次。

### 3.3 已知边界（不在第 7 步处理）

- complete persona（H6）：这类 agent 的提示词只剩 persona 一节，声明被宿主丢掉，拦截照常。GLM 今天在这类 agent 上也是这样。
- 预设 minimal：关掉了 `write`、`edit`、`read`（H6），shell 写文件被拒后，纠偏里的正路是它没有的工具。今天 GLM 在这个预设上有同样的问题；G3 把它带到其他模型。处理办法（例如按 agent 的工具面决定 file-tools-only 是否适用）是新的规则特性，要另做决定，本步只在 `docs/ORCHESTRATION.md` §6.2 记下这条边界。用户桌面版的会话用哪个 agent 预设，本轮没有核对〔未核实〕。

## 4. 违规记录加路由（agent 的提议）

```ts
// src/guard/origin.ts（新文件）
/** Whether the GLM dialect claimed the calling agent on the call's route (C), or not (N and O). */
export type RouteScope = 'dialect' | 'other'
export interface CallOrigin {
  readonly scope: RouteScope
  /** The route of the step that issued the call; absent when the session had none. */
  readonly route?: Route | undefined
}
export function originOf(claimed: boolean, route: Route | undefined): CallOrigin
```

- `ViolationRecord` 加 `scope?: RouteScope` 与 `route?: Route`，类型上可选：第 7 步之前写下的记录没有这两个字段。guard 行写 `originOf(names !== undefined, route)`；图文件门禁（`installGraphFileGuard`）同样取会话路由与方言的 `claims`，写同样两个字段。
- 理由：G3 的代价是「file-tools-only 的探测按 GLM 与 ZCode 的习惯调过，在其他模型上误伤率未知」（`design.md` §4.2.3）。拒绝记录不带路由，就只能拿会话 id 去翻会话日志才知道被拦的是哪个模型；带上之后晨报能把其他路由上的拒绝单独计数（§5.2），误伤是否可接受由人看着数据判断。
- 放在新文件里：guard 行、影子兜底与图文件门禁三处都用它；放进 `index.ts` 会让 `shadow.ts` 反过来导入 `index.ts`。
- 不选的做法：只给影子记录加 `scope`（G2、G3 原文只写到这里）。这样拒绝记录看不出路由，误伤率仍然量不出来。评审若认为这超出第 7 步，删掉 §4 与 §5.2 中拒绝记录的部分，其余不变。

## 5. 影子兜底与晨报

### 5.1 影子兜底（照 G2 填写）

- `observe(payload, origin)` 多一个参数，guard 行放行之后传入本次调用的 `CallOrigin`。所有路由都记笔记（今天只有 GLM）。
- `TurnNotes` 记下本轮 shell 调用的 `scope` 与路由：一轮里只要有一次 shell 调用的 `scope` 是 `dialect`，这一轮记 `dialect`，全部是 `other` 才记 `other`；`route` 是本轮最后一次记下的 shell 调用的路由（`design.md` §4.2.4 G2 的写法）。
- `ShadowRecord` 加 `scope?: RouteScope` 与 `route?: Route`；新写的记录总有 `scope`，`route` 在会话没有请求头时省略。已落盘的旧记录没有 `scope`，按 `dialect` 计：第 7 步之前只有 GLM 路由写影子记录，今天的组合里它们都属于 C。

### 5.2 晨报

`src/workflow/morning-report.ts` 的 `countByRule` 按规则计数时，`scope: 'other'` 的记录另成一组，规则名后加「（其他路由）」：

```
## 例外（先看）
- 违规 file-tools-only × 2
- 违规 file-tools-only（其他路由） × 1

## 影子记录（只记录，未拦截）
- file-tools-only（其他路由） × 1
```

没有 `scope` 或 `scope: 'dialect'` 的记录照今天的写法，所以只有 GLM 记录时晨报逐字不变。

## 6. 不装编排层包时

- 拦截与声明只来自三处：guard 行（`tools/pre-execute` 与组装监听器）、图行注册的图文件门禁（`installGraphFileGuard`）、guard 行里的影子兜底。三者都在 `packages/hourness/cordis.patch.yml`（`glm-hourness/guard`、`glm-hourness/graph`）。〔实读〕
- GLM 包的源码（`src/glm-llm/`、`src/glm-prompt/`、`src/toolsearch/`）里没有 `tools/pre-execute` 监听器；它唯一的组装监听器是方言改写（`src/glm-prompt/index.ts`:195），不加规则节。〔实读，检索 `tools/pre-execute` 与 `system-prompt/assemble`〕
- 所以只装 GLM 包时没有拦截、没有声明、没有违规流水；L3 场景 `glm-only` 加一条检查：系统提示词里没有 `# Workspace rules`（§9）。
- 装了编排层包、但人在插件管理器里禁用了 `guard` 行：这是行级的选择，图文件门禁照旧跟着图行走（`docs/ORCHESTRATION.md` §2.7）。人的原话说的是包，行级开关保持今天的含义。

## 7. 取代 `docs/ORCHESTRATION.md` §6.2 的定案

- 旧定案：「先只作用于 GLM 会话，误伤清零后再考虑放开〔定案〕」；2026-10-28 L4 中 guard 拦下 DeepSeek 会话的写入后按它实现（`docs/DEVELOPMENT.md` §7 事故表那一行，以及 §6.2 的「实现〔2026-10-28〕」一段）。
- 新定案〔2026-10-29，question-14 G3，人定〕：guard 跟着编排层包走。包启用时，所有路由、所有模型的根调用都按规则拦截，所有路由的系统提示词都有规则声明；包不装时都没有。子 agent 的出界请求默认拒绝、由主 Agent 汇总申报一句不变。
- §6.2 整节重写：定案、实现（不看路由；路由只决定工具名与记录里的 `scope`、`route`）、取代了什么（2026-10-28 的定案与实现，旧文本在 git 历史里）、已知边界（§3.3）、误伤怎样看（晨报的「其他路由」计数）。
- 一并改写的其他文档：
  - `docs/ORCHESTRATION.md` §2.7 的「声明」一条（不再限于 GLM 系统提示词）；§6.1「告知已接通」一句（GLM 路由 → 每条路由）；§6.5 影子记录的字段；§6.5.2 的验证一句（「GLM 系统提示词带规则声明、非 GLM 不带」）。
  - `docs/DESIGN.md` §2.5 行健康表的 guard 一行；§3「第二个信号」一段里「guard 按它只拦 GLM 调用」；§5 提示词节表下 `glm:guard` 一段的「只在 GLM 路由上出现」；§8 降级表「GLM 包缺席」一行里「guard 行今天只判 GLM 调用，这时不拦截」。
  - `docs/HANDOFF.md` 行状态表的 guard 一行与第 3 项；`README.md` 行配置一段的「GLM 会话的系统提示词末尾列出生效的规则」。
  - `docs/DEVELOPMENT.md` §7 是事故记录，记的是当时的修复，不改。
- 代码注释：`src/guard/index.ts` 文件头的 Declaration 与 Scope 两段、监听器里的注释；`src/guard/rules.ts` `GuardRule.declare` 的说明（「GLM system prompts」）；`src/guard/graph-files.ts` 监听器里「unlike the guard row」一句；`src/guard/shadow.ts` 文件头加一句「every route」。

## 8. L2 测试

`tests/guard-audit.spec.ts`：

- 替换「non-GLM calls and calls without a route pass untouched」：DeepSeek 路由上 `write` 写工作区外被圈禁拒绝，`pwsh` 的 `Set-Content` 被 file-tools-only 拒绝，纠偏用原生名，记录带 `scope: 'other'` 与 DeepSeek 路由；没有 agent 的调用照样被 file-tools-only 拒绝，记录没有 `route`；会话还没有请求头时同样拒绝，记录没有 `route`。
- 替换「the route is read per call」：会话中途从 DeepSeek 换到 GLM，两次都拒绝；方言服务接管这个 agent 时，第二条记录的 `scope` 是 `dialect`、纠偏换成 ZCode 名。
- 替换「shadow: a non-GLM turn leaves no shadow record」：非 GLM 的一轮留下一条 `scope: 'other'`、带 DeepSeek 路由的影子记录；同一轮里一次 C 上的 shell 调用加一次 O 上的，记 `dialect`，`route` 是后一次的。
- 现有影子记录的逐项比对加 `scope` 与 `route`（那个用例没有方言服务，GLM 路由属于 N，记 `other`）。
- 方言接管时拒绝记录的 `scope` 是 `dialect`。
- 声明用例：DeepSeek 的组装最后一节是 `glm:guard`，`write`/`edit` 版，与没有方言时 GLM 的那一节逐字相同；GLM（C）那一节逐字不变。
- `guardHealth` 的用例不变；删去对 `outOfScopeHealth` 的依赖（今天没有直接用例）。

`tests/graph-guard.spec.ts`：一条拒绝记录带 `scope` 与 `route`（有、无方言服务各一）；DeepSeek 路由上 guard 行也拒绝图目录以外的 shell 写入。

`tests/health.spec.ts`：DeepSeek 会话上 guard 的行健康是「生效」，不再是「非 GLM 路由，门禁不介入」。

`tests/workflow.spec.ts`：`scope: 'other'` 的拒绝与影子记录在晨报里带「（其他路由）」另行计数；没有 `scope` 的旧记录照今天的写法。

## 9. L3 探针

| 场景 | 第 7 步之前 | 第 7 步之后 |
| --- | --- | --- |
| `non-glm-guard`（`probe-full`，`deepseek-probe`） | 相对写入与 `pwsh` 写文件都放行，无记录；guard 健康「未生效」 | 相对写入（工作区内）放行；`pwsh` 的 `Set-Content` 被拒，纠偏用原生名，文件没写出；一条 `file-tools-only` 记录，`tool: 'pwsh'`、`scope: 'other'`、`route` 为 `glm-probe/deepseek-probe`；guard 健康「生效」 |
| `non-glm`（`deepseek-probe`） | 系统提示词没有规则声明 | 系统提示词最后一节是规则声明，用 `write`/`edit` |
| `glm-no-dialect`（覆盖层禁用 `glm-prompt`） | 拒绝、原生名纠偏、原生名声明 | 同左，另核对记录 `scope: 'other'` |
| `glm`（C） | 拒绝、ZCode 名纠偏、声明在方言节之后 | 同左，另核对记录 `scope: 'dialect'`、`route` 为 `glm-probe/glm-5.3` |
| `glm-shadow`（C，挂 `workspace-changes`） | 一条影子记录 | 同左，另核对 `scope: 'dialect'` |
| `hourness-only`（`probe-hourness`，`deepseek-probe`） | 图目录写入被 `graph-files-only` 拒绝；`pwsh` 写文件放行、无记录；没有规则声明 | 图目录写入照旧被拒；`pwsh` 写文件被 file-tools-only 拒绝、文件没写出；两条记录都是 `scope: 'other'`；系统提示词有规则声明，含 `write`/`edit` 与 `graph-files-only` 一行 |
| `glm-only`（`probe-glm`） | 无相关检查 | 新增：系统提示词没有 `# Workspace rules`（只装 GLM 包时没有 guard） |

探针脚本文件头与场景注释里「guard 只判 GLM」的说法一并改写。

## 10. L4 第一轮（替换 `design.md` §7.6 第 4 项里 guard 的期望与「没有规则声明」一句）

- 第 3 项（GLM-5.3-Flash）不变，另核对违规流水那一条带 `scope: "dialect"` 与 `glm-zcode` 路由。
- 第 4 项改为：DeepSeek 新会话，工作目录是同一个临时目录：图工具在；`graph_show` 可用；有投影；`pwsh` 的 `Set-Content` 写临时目录被拒，纠偏写的是 `read`、`write`、`edit`；违规流水多一条 `file-tools-only`，`tool` 是 `pwsh`，带当时所选的 DeepSeek 路由与 `scope: "other"`；会话日志里系统提示词的最后一节是「# Workspace rules」，用原生工具名。
- 第 5 项不变（换模型触发一次重载，日志没有本项目的新告警）。

## 11. 门禁、基线与回滚

- 门禁（`design.md` §7.1 第 7 步）：`npm run build`、`npm run preflight`、`npm test`；探针在 worktree 上用生成的 `probe-full`、`probe-glm`、`probe-hourness`，不与别的探针或标定同时跑。
- 基线：逐字门禁不变（不碰镜像文件）；ESLint 压制、knip、jscpd 不应增加。新文件 `src/guard/origin.ts` 在 `src/guard/` 下，目录表不变。
- 回滚：撤销这一个提交。违规流水里多出的 `scope`、`route` 字段对旧代码无害（晨报按规则名计数，不读这两个字段）。

## 12. 未核实与风险

| # | 内容 | 怎么处理 |
| --- | --- | --- |
| R1 | file-tools-only 在 DeepSeek 等模型上的误伤率未知（G3 的已知代价） | 晨报「其他路由」计数；L4 第 4 项先看一次真实的拒绝文案；误伤多时由人按 §6.2 决定 |
| R2 | 升级前开始的 DeepSeek 会话收到声明的方式（H7 的推断部分） | L4 第 4 项用新会话，不依赖这一点；推断写进 §6.2 |
| R3 | 没有 agent、或没有请求头的根调用在今天的组合里不存在（§2.1 的推断） | 照判，L2 覆盖这两种输入 |
| R4 | complete persona 与 minimal 预设（§3.3） | 记为已知边界，不在本步处理 |
