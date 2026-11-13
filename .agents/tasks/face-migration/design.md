# 面层迁移设计（face-migration）

版本 0.1 —— 2026-11-11,面层迁移车道。runtime 基线:桌面 nightly 0.2.2-rc.1(main @ 00872c38)。
所有运行时结论出自只读导出的安装 asar(`%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar`),引用写作 `包:行`。

## 0. 结论

工具面改写从 `system-prompt/assemble` 瀑布迁到 **GLM 通道 adapter 的 wire 面**:8 处面改写合并为一个纯函数 `wireFace()`,由 glm bundle 的真 adapter(`ZcodeAdapter.stream`)与探针 adapter(`probe-llm.mjs`)在发出请求前应用;角色层(design/execute/bootstrap/memory/lessons 的判断)留在 hourness bundle 各行,经 cordis 服务 `glmHournessFaces` 交给 wire 层。`tools.restrict()` 不用:它在 rc.1 是真执行边界(见 §2.2),会把「面上去掉但按名可调、guard 拦下并纠偏」的既有语义变成 UNKNOWN_TOOL,破坏探针钉住的 guard 纠偏文案与违规流水,也偏离 question-26 C 的设计(面不是边界)。

兼容性决定:**TARGET = rc.1 only**。rc.3 兼容从测试与类型里删掉(`AssemblePayload.tools` 字段删除、`tests/fake-rc3.ts` 按 rc.1 建模);`engines.dsh` 随最终批改成新基线。真桌面非 GLM 路由(DeepSeek 原生 adapter,不是我们的代码)拿不到角色面改写——降级为「面保持全集、guard 照常按名拦」,探针的非 GLM 场景经探针 adapter 照常断言角色面(探针 adapter 也应用 wireFace);人的机器只跑 GLM 路由,L4 的 DeepSeek 一半验收不要求(HANDOFF §8)。

## 1. rc.1 运行时事实(实读 2026-11-11)

> 勘误(2026-11-13):十条事实已对照 `reference/dsh-desktop-0.2.2-rc.1/` 导出全量复核,10/10 成立,下文行为描述照旧;仅两处行号位移——事实 4 的 `executable` 从 `dsh-tools/lib/index.js:537-543` 移到 :530-534(`toolSet.view(scope).get(name)` 在 :531);事实 7 的 cordis waterfall 从 :937-944 移到 :903-918(`next` 定义在 :910-914,仍无参)。抽检表见该导出的 `README.md`。其余引用行号(:354、:358-413、:367-381、:396-400、:401、:402-412、:416-425、:453-468、:492、:497-501、:560-570、agent-loop :673、:679、:685-694、:868、:1041-1052、:1345-1346、dsh-llm :776-833、:787、:2353-2359、:2402)全部原行号命中。

1. **assemble 载荷无工具面**。`dsh-system-prompt/lib/index.js:358-413`:`assemble()` 组装 `{sections, contexts, variables}`(396-400),跑瀑布(401),然后返回 `{...transformed, tools}`(402-412)——`tools` 来自 `toolProviders`(367-381),瀑布写回的 tools 字段被丢弃;文档行 354 原话「tool declarations stay provider-owned」。瀑布仍可改 sections/contexts/variables。
2. **请求面的来源**。`dsh-tools/lib/index.js:416-425`:ToolsService 构造时把自己注册为 systemPrompt 的 tool provider,`({scope, toolSet}) => selectExecutor(scope).describe(definitions(scope, toolSet))`——请求面 = 工具注册表对该作用域 + 本步准入的视图。
3. **restrict() 的契约**。`dsh-tools/lib/index.js:453-468`:只能经 agent 作用域上下文调用;`{allow?, deny?}` 名字集合;名字必须 ∈ `view(scope).restrictableNames`(只认继承来的全局与祖先作用域注册);返回 disposer,撤销即解除;跨层相交(`view()` 492:`layers.every(layer => layer.admits(name))`),本作用域自己的注册豁免且遮蔽同名继承(497-501)。
4. **restrict() 在 rc.1 是执行边界**。`dsh-tools/lib/index.js:537-543`:`executable(name, scope, toolSet)` = `toolSet.view(scope).get(name)`;toolSet 的视图(560-570)把准入名字经 `current.visible` 过滤——被 restrict 去掉的名字不在 `visible` 也不在 `registrations`,调用按 UNKNOWN_TOOL 失败。rc.3 的「面上去掉、按名照常执行」在 restrict 上不成立。
5. **每步流水**。`dsh-agent-loop/lib/index.js:673`(`tools.resolve`)→ :679(`systemPrompt.assemble`,上下文带 `modelSelection`、`toolSet`)→ :685-694(`agent/pre-step` 载荷 `{messages, turn, step, signal, modelSelection}`,无 assembly)→ :868(`buildRequest(config, preparedCall, assembly.tools, …)`),`request/header` 记的 `header.tools`(:1041-1052)是运行时面——**不是** wire 面。
6. **路由变量仍在**。`dsh-agent-loop/lib/index.js:1345-1346`:`systemPrompt.variable("provider"/"model", …)` 按 `context.modelSelection` 求值;assemble 监听器的路由判断(`assemblyRoute`)照常工作。`agent/pre-step` 载荷带 `modelSelection`,步前监听器也能判路由。
7. **llm/stream 监听器改不了请求**。`dsh-llm/lib/index.js:2402`:瀑布默认续体 `() => this.adapterStream(options, prepared)` 闭包捕获原始 options;cordis waterfall 的 `next()` 不接受参数(`cordis/lib/index.js:937-944`)。监听器只能包 stream,不能改 options。**adapter 的 `stream(options)` 是 wire 面的唯一可改写点**,它收到完整 options 含 `tools`(dsh-llm:2353-2359)。
8. **运行时自己的延迟机制不掺和**。`dsh-llm/lib/index.js:776-833`(`projectToolUpdates`)只在路由的 `modelInfo.toolUpdate` 声明时启用;glm 路由不声明(探针 `resolveModel` 同形注释「no in-history updates」)。我们的 ZCode 式延迟留在 wire 侧 + 提示词侧公告,不会双重公告。
9. **同名遮蔽**。`dsh-tools/lib/index.js:497-501`:作用域自己的注册总是可见并遮蔽继承同名。别名工具(glm-prompt 按 agent 注册的 Read/Write/…)照旧按名解析执行——rc.1 上别名机制不变,变的只有面。
10. **rc.1 上别名/原生同面的现状(降级期)**:别名与控件工具(glm-prompt 每会话注册)和原生工具同时出现在每个请求面。迁移后 wire 面恢复旧改写的输出。

## 2. 架构决策

### 2.1 接缝:wire 面(adapter)而非 restrict()

判据(全部来自探针已钉住的行为,`scripts/probe/run-probe.mjs`):

- 「design main: a Write and a shell write are refused by name with the main agent's correction」(run-probe:4101 一带):模型按名调 Write,guard 的 `main-agent-no-write` 拦下并给纠偏文案,违规进流水。restrict 会让调用在 `executable()` 处失败(UNKNOWN_TOOL),guard 永远看不到,纠偏与指标全丢。wire 面改写完全保留旧语义:面上去掉、注册仍在、按名执行、guard 拦。
- 面集合断言是精确的(`isDeepStrictEqual(faceOf(steps[2]), …)`,run-probe:4096):wireFace 必须逐工具复现旧改写输出(§4)。
- 探针的可观察点:probe-llm.mjs:680 dump `request.tools`,且它已从构建产物导入 glm dist 的真编码器(probe-llm.mjs:62-64, 644-649)——探针 adapter 应用同一个 wireFace 后,dump 显示的就是真通道会发出的面,断言保持端到端。
- 探针场景的 GLM 路由是 provider `glm-probe`(ProbeAdapter),真 ZcodeAdapter 不参与——wireFace 必须是两个 adapter 共用的纯函数,不能藏在 ZcodeAdapter 里。

### 2.2 为什么不是 restrict()

§1.4 的执行边界语义变化之外:restrict 的 allow/deny 是注册期静态集合,角色随 /wish 中途变化时要拆装;别名工具是本作用域注册(restrict 管不到),主 Agent 的 Write 别名仍会出现在面上,还得另拆别名注册——比 wire 面改写多一套状态机,语义还更差。restrict 在本次迁移中没有使用场景。

### 2.3 跨 bundle 边界

glm bundle 编译 `src/glm-llm|glm-prompt|toolsearch`(packages/glm/tsconfig.json);角色判断(isMain、worker 登记、接管状态)在 hourness bundle。跨 bundle 只能经 cordis 服务。因此:

- **wire 函数在 glm bundle**(`src/glm-llm/face-wire.ts`):输入运行时面 + 会话策略 + 路由,输出 wire 面。ZcodeAdapter 与 probe-llm.mjs 共用。
- **角色策略经服务过桥**:glm-llm 行提供注册表服务 `glmHournessFaces`;design/execute/bootstrap/memory/lessons 各行经 `ctx.inject` 在子 fiber 里注册自己的 source。某行缺席(禁用/未注册上)→ 它那部分改写缺席,行健康写明——与今天的降级同构。
- **方言层(别名覆盖、延迟 resident/deferred 拆分)不需要过桥**:常量与判断都在 glm bundle(wire 函数直接用);行配置差异(toolSearchMode: off)经面形状守卫自然生效(控件工具不在面上就不延迟)。

## 3. 接缝图(8 处改写 → 去向)

| 旧改写 | 旧接缝 | 新接缝 | 批次 |
| --- | --- | --- | --- |
| glm-prompt 别名覆盖(GLM 面去被覆盖原生) | assemble tools | wireFace 方言层(别名在场守卫) | A |
| toolsearch 延迟(44 个非驻留工具出面)+ 控件 | assemble `expose()` | wireFace 方言层(控件在场守卫;无 deferred 时控件出面,照旧) | A |
| toolsearch 公告(A3:首次请求列出延迟名) | pre-step notice(读 assemble 期 `current`) | pre-step notice 不变;exposure 改在步前监听器开头由 wireFace(schemas(agent)) 自算(§4.4) | A |
| glm-prompt 节(身份、方言节、glm:memory 节、todo 资格) | assemble sections + assembled.tools 判断 | assemble sections 不变;节判断与 todo 资格改读 wireFace(agent.ctx.tools.schemas(agent)) 的投影面(§4.5) | A |
| design 主 Agent 面(write/edit/ask_user_question 出面、str_replace_editor 收 view)+ 身份/人设节 | assemble | 身份/人设节留 assemble;面进 wireFace 角色层(design source) | B |
| design 普通面(propose_to_human/record_human_answer 出非主面) | assemble | wireFace 角色层(design source) | B |
| execute faceOfRole(主/worker/reviewer/派发链九图写) | assemble | wireFace 角色层(execute source) | C |
| bootstrap REVIEW_TOOL(bootstrap_review 只留有开着接管的主 Agent) | assemble | wireFace 角色层(bootstrap source) | D |
| memory 子会话藏记忆+学习工具 | assemble | wireFace 角色层(memory source,子会话按 header.origin) | D |
| lessons 子会话藏 lessons_merge | assemble | wireFace 角色层(lessons source) | D |

guide(§2.4a 的对照表行)与各面监听器一起删;`src/shared/dsh-min.ts` 的 `AssemblePayload.tools` 删除(§5)。

## 4. 机制规格

### 4.1 服务契约(`src/shared/face-policy.ts`,纯类型)

```ts
export const FACES_SERVICE = 'glmHournessFaces'
export interface ToolNarrowing { readonly tool: string, readonly parameter: string, readonly values: readonly string[] }
export interface FacePolicySource {
  /** 本行从该会话 wire 面去掉的注册名(原生名);方言覆盖的原生名连带别名一起出。 */
  removals(sessionId: string): ReadonlySet<string>
  /** 参数枚举收窄(主 Agent 的 str_replace_editor → view);形状不认识时整工具去掉并回调报行健康。 */
  narrowing?(sessionId: string): ReadonlyArray<ToolNarrowing>
  onUnknownShape?(sessionId: string, tool: string): void
}
export interface FacePolicyRegistry { registerSource(source: FacePolicySource): () => void }
```

类型文件两个 bundle 各编译一份(类型即结构,运行期无模块共享问题);服务按名字经 cordis 解析。glm-llm 行 `ctx.provide(FACES_SERVICE, registry)`;各行注册时失败的告警进各自行健康,不改激活条件。

### 4.2 wire 函数(`src/glm-llm/face-wire.ts`,纯)

```ts
wireFace(tools: readonly WireTool[], session: {
  readonly glm: boolean,                       // isGlmModel(request.model)
  readonly sessionId: string,
  readonly policy: FacePolicyRegistry | undefined,   // ctx.get(FACES_SERVICE),缺席 = 无角色层
}): readonly WireTool[]
```

组合次序钉死(= 旧监听器嵌套次序:角色层在内、方言在外):

1. **角色层**:所有 source 的 `removals(sessionId)` 求并;每个被去掉的原生名若被方言覆盖(DIALECT_FACES 有别名),其别名也从面去掉(= 旧 `toNativeTool` 换算后的普通面/主面行为;GLM_CUT/PLAIN_CUT 都由此得出)。narrowing:参数形状是 `properties.<parameter>.enum` 才收窄,否则整工具去掉并 `onUnknownShape`。
2. **方言层(GLM 路由)**:别名覆盖——某别名在面上才去掉它覆盖的原生名(守卫:方言行没装上时面全是原生,一个都不去);延迟——控件工具(LocalToolSearch/DeferredToolCall)都在面上才启用,启用时非驻留名(`RESIDENT_TOOLS` ∪ 控件)全部出面;无 deferred 或控件不全时控件出面(照旧 `buildToolExposure` 的 disabled 分支)。
3. **方言层(非 GLM 路由)**:别名出面(旧 `rewriteToolFace` 的 glm=false 分支),控件出面(旧 `hide()`)。

WireTool = `{name, description, parameters, deferLoading?}`(= dsh-min 的 AssembledTool 去 tools 语义;真 adapter 收到的 schemas 无回调体)。

### 4.3 真 adapter(`src/glm-llm/zcode.ts`)

`stream(request)` 开头:`const tools = wireFace(options.tools ?? [], {glm: isGlmModel(request.model), sessionId, policy: this.options.facePolicy?.()})`,后续 `encodeRequest({...options, tools, messages}, …)`;attribution(zcode.ts:553)改用 wire 后的 tools——rc.3 上 adapter 收到的本就是改写后(options.tools = 瀑布输出),这样恢复逐字节 parity。glm-llm 行 apply 时以 `sessionHeaders` 同款惰性闭包交 `facePolicy: () => ctx.get(FACES_SERVICE)`。

### 4.4 toolsearch(`src/toolsearch/index.ts`)

- `installToolSearch(agent)` 增加 policy/路由读取(闭包经 installDialect 传入);其 pre-step 监听器在 `next()` **之前**自算 `current = buildToolExposure(wireFace(agent.ctx.tools.schemas(agent), {glm: isGlmModel(modelSelection.model), …}))`——exposure 不再依赖 assemble 期写回。公告、LocalToolSearch/DeferredToolCall 执行、`announcementDelta`/`loadedDefinitions` 机制全部不动。
- `agent.ctx.tools.schemas(agent)` 是注册表视图(无本步 `when` 准入);本包不注册条件工具,差异仅限宿主自带的 when 工具,设计里记录为准。

### 4.5 glm-prompt(`src/glm-prompt/index.ts`)

assemble 监听器保留节改写(§1.1);删除面改写与 `withSections.tools === undefined` 降级分支;`memorySectionApplies`/lessons 句判断与 `todoReminderEligible` 改判 wireFace 投影面(子会话的 glm:memory 节随角色层缺席,照旧)。

### 4.6 行健康

各 source 注册失败或服务缺席时,该行的面改写部分在行健康写明(与 85970b6b 的降级说明同构);design 的 `MAIN_AGENT_ACTIVE` 文案、execute/bootstrap 的 active 文案照旧(面改写经服务在 wire 层生效,健康语义不变)。

## 5. rc.3 兼容删除清单

- `src/shared/dsh-min.ts`:`AssemblePayload.tools` 字段删除;`PreStepPayload` 补 `modelSelection`。
- 8 处监听器:design/execute/bootstrap/memory/lessons 的面监听器、glm-prompt 的面改写分支、toolsearch 的 `expose()/hide()` 面参数——删净,不留降级分支(85970b6b 的守卫随监听器一起消失)。
- `tests/fake-rc3.ts` 按 rc.1 建模(assemble 载荷无 tools;步前载荷带 modelSelection);断言旧面行为的 L2 迁到 wireFace 与 source(design-mode / execute-row / memory-row / lessons-row / toolsearch / dialect-wiring / graph-tools / propose-to-human)。
- `engines.dsh`(packages/*/package.json)与 README 的 runtime 表述随最终批。

## 6. 批次与门禁

每批:`npm run build` → `npm run preflight` → `npm test`(L2 全绿)→ `npm run probe`(GIT_CONFIG_* 清空;探针锁 `.llm/probe-lock`/`-2`;非面场景保持绿;面类红名单按批转绿)。knip/eslint 基线 73/18/1 每批重测,只许降不许升。一批一提交,docs 同批;全部绿后才推 origin/main(三绿纪律,不推半迁移态)。

- **A 方言 wire 层**:契约 + 注册表服务 + wireFace(方言层 + 角色层应用骨架,无 source)+ 真 adapter + 探针 adapter + toolsearch exposure + glm-prompt 节判断。转绿:glm tools 三条、non-glm tools 两条、A3、subdir、memory/lessons 的 GLM 公告半边。
- **B 角色层 + design**:design source,删其面监听器。转绿:design main(GLM+非 GLM)、design idle、design one-main、propose/record 普通面。
- **C execute**:source + 删监听器。转绿:exec dispatch/plan 的 worker 面、main 面无 worker 工具。
- **D bootstrap + memory + lessons**:三个 source + 删监听器。转绿:memory worker 子面、lessons_merge 子面、bootstrap_review 面。
- **E 收尾**:engines.dsh、README、DESIGN.md §2.4a 改写、HANDOFF §10 更新、棘轮重测、全量探针、推 origin/main。

## 7. 风险与边界

- `agent.ctx.tools.schemas(agent)`(注册表视图)与请求面(步准入)在宿主自带 `when` 工具上可能有出入;本包不注册条件工具,公告侧按注册表视图算。记录为准。
- `request/header` 的 `tools` 是运行时面,wire 面只存在于上游请求体。消费 header.tools 的只有运行时自身(toolsChanged)与探针(读 dump,不读 header),无影响;DESIGN.md §2.4a 记这一事实。
- 探针 adapter 应用 wireFace 后,脚本按位置驱动不受面内容影响;守卫类断言(guard 纠偏文案)依赖按名执行,不受面影响。
- 真桌面非 GLM 路由的角色面降级(§0);工具检索方言本来就只跟 GLM 路由,无新增损失。
