# 规则板设计评审（`.agents/tasks/rules/design.md` 0.4 起）

挡路标准（`docs/DEVELOPMENT.md` §1.1，图 `d-failure-plans`）：只有三类发现挡路：验收条件或要求没有满足；不可逆损失而没有预防；失败了没有途径发现、没有恢复办法，或事后查不到原因。HIGH 与 MEDIUM 都属于这三类，其余记为 LOW（即 NIT，不挡路）。另按 `d-design-onepage`：模块设计违背人定的方向清单即挡路，记为 MEDIUM。

0.3 的三轮评审原样留在 `design-review-v0.3.md` 与 `design-review-v0.3.json`。本文件是 0.4 起的评审，每轮一节，按时间先后；`design-review.json` 只记最新一轮，前几轮的计数在它的 `history` 里。

## 轮次记录

| 轮 | 设计版本 | HIGH | MEDIUM | LOW | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | 0.1 | 1 | 5 | 13 | CHANGES_REQUESTED |
| 2 | 0.2 | 0 | 1 | 7 | CHANGES_REQUESTED |
| 3 | 0.3 | 0 | 0 | 5 | APPROVED |
| 0.4 第 1 轮 | 0.4 | 0 | 1 | 8 | CHANGES_REQUESTED |
| 0.5 第 1 轮 | 0.5 | 0 | 5 | 8 | CHANGES_REQUESTED |

# 0.4 第 1 轮（设计 0.4）

## 本轮审了什么

- 输入：`design.md` 0.4 全文；`design-v0.3.md`、`design-review-v0.3.md`、`design-review-v0.3.json`；`.agents/tasks/design-context.md`；`docs/DEVELOPMENT.md` §1.1。
- 对照的源码与图（main `eb614ab`）：`src/shared/pricing.ts`、`route.ts`、`health.ts`、`tool-names.ts`、`step-notice.ts`、`zcode-notice.ts`、`data-home.ts`、`dialect.ts`；`src/glm-prompt/peak-reminder.ts`、`index.ts`；`src/guard/index.ts`、`rules.ts`、`graph-files.ts`；`src/graph/service.ts`、`schema.ts`、`engine.ts`（表格卡校验）、`tools.ts`、`mutation.ts`、`stage.ts`、`main-agent.ts`；`scripts/packages.mjs`、`scripts/sandbox.mjs`、`scripts/probe/`；图节点 `question-32`、`question-36`、`d-rules-human-only`；M6 设计 0.1 §5、§7.2。
- 额外检查（任务要求）：移进附录 A 的东西，剩下的部分还要不要它。

## 0.3 第 3 轮发现的状态

| # | 状态 | 依据 |
| --- | --- | --- |
| F28 卡片格式 | Closed | `rules_propose` 输入为 `{kind, body, summary, reason, crux, skip, set}`；`Proposal` 同形；`verdict` 由规则板生成「是 → set；否 → skip」，合 `src/graph/engine.ts` 的 `verdictKeys`（箭头后取选项键，推荐键必须在其中）；`weight: 'two-way'` 在 `WEIGHTS` 里；上限取 `CARD_LIMITS`（label 20、gain 60、cost 60、crux 60、verdict 120）；`why`、`ifSet`、`ifSkip`、`counter` 按未知字段拒绝（§7.2、§9.3、§12、§15 R3）。第 4 点（`dsh-desktop` 引用常设授权）随租约移出，附录 A.5 写了常设授权 |
| F29 流水末行与缺字段的行 | Closed | 直接用快照的条件写清（最后一行以换行结尾且就是快照那条）；缺字段的行取 (a)：`digest-mismatch`、不断链；`base` 先核对摘要，不对就退到上一个文件或空状态；R2 的 (c) 与 (b) 之后比较（§7.5 第 1、2 步、表、§1.4 第 9 条、§15 R2） |
| F30 锚点覆盖的行 | Closed | `covered-by-anchor`、`coveredBy`，只能忽略；R2 有对应用例（§7.2、§7.5 第 5、7 步） |
| F31 替换能解析的快照 | Closed | 原样另存 `.rules.json.replaced-<时刻>`，路径进 `recovered.replaced` 与 `evidence`；新增 `journal-shorter`；`snapshot-modified` 的说法不再断定是快照被改；不可逆清单加了这一条（§7.5、§11.2） |
| F32 规则文件门禁对子调用 | Closed | `rules:files-only` 在规则行自己的门里判，不按 `parent` 跳过；明确不照抄 `graph-files.ts`（该文件第 114 行对带 `parent` 的调用直接 `next()`，已核对）；R4 有子调用用例（§2.5、§6.2 第 3 步、§13、§15 R4） |
| F1–F27 | 按附录 B | 抽查了 F5、F10、F11、F20、F23、F26 在 0.4 里的改法仍在原位；标「不再适用」的各项钉住的设计确实已移出 |

## 对任务要求的核对

| 要求 | 结论 |
| --- | --- |
| 保留概念：信号、规则（条件、主体、执行边界上的动作匹配、block/queue/shadow/inform、期限、来源）、固定可扩充的词汇、可执行与只告知 | 满足（§2.1–§2.4） |
| 只有人写、按身份核对（`d-rules-human-only`） | 满足（§2.5、§7.4 第 1 步、§13）；图节点的人原话「先不允许自己加规则吧，只有人能动」已核对 |
| 检测器只写信号、像 hook | 满足（§5） |
| 流水与重放（`applyRecord`、F20）与故障预案 | 满足（§7、§11.2） |
| 恰好一条默认规则：GLM 峰谷定价；写明默认执行方式、怎样读计价服务、只装编排层包时怎样 | 满足（§3）。另见 F33：命令行这条执行边界在 0.4 里读不到它 |
| 机器一级只放物理上只有一份的东西 | 满足：机器一级出厂为空，理由写明（§4、§1.4 第 14 条、§13 最后一行） |
| 面板与命令：列出规则（代码里的只读）、人加与解除 | 满足（§9.1、§9.2、§10.1）。另见 F34 |
| 在场、CPU 与内存限速、默认预算、Job Object 与辅助进程、错峰排队、约定做成产品规则：移进附录，不写实施步骤 | 满足（附录 A.1–A.7 只写概念位置与缺什么） |
| 去掉 D2–D5，D1 按 C | 满足（§19）；`question-32` 已核对为 C（原话「规则C」），`question-36` 已核对为 B（agent 定） |
| 缩短实施顺序、列出不再适用的旧发现 | 满足（§16 R1–R7、附录 B） |
| 剩下的待人定事项用 design-context 的表格格式 | 没有待人定事项（§19），不适用 |

移出的部分剩下的设计还要不要：逐节检索了租约、在场、预算、限速、`holdMs`、`admit`、机器一级、job、辅助进程、重活与槽位在附录之外的全部出现处。除下面 F33 一处，其余出现处都是「0.3 有、本版不做」的说明或对其他设计的影响清单（§10.7）。F33 是移出 0.3 的机器级内置检测器 `builtin:glm-peak` 之后留下的缺口。

## 发现

### F33（MEDIUM）命令行 `check` 读不到 `glm-peak`，与验收第 13 条和 M6-R3 冲突

位置：§1.4 第 13 条；§9.4 `check` 一行；§3.2；§7.2 `HostHeartbeat`；§10.7 M6 一条；附录 A.4；§15 R3。

问题：0.3 的 `glm-peak` 是机器级检测器写进状态的值，命令行读状态就能读到。0.4 按 M6-R1 改为宿主当场经计价服务算，§9.4 随之写「命令行不在 DSH 里，读不到计价服务，`glm-peak` 读不出」。可是：

1. 验收第 13 条要求命令行 `check` 给出「与工具调用门相同的判定、拒绝文字与退出码」。对任何引用 `glm-peak` 的规则，门判成立或不成立，命令行判读不出，按默认的 `onUnknown: skip` 放行。`glm-peak` 是出厂唯一的宿主信号，§3.4 的「以它为模板新建」正是引导人写这种规则，所以这条验收在主要用法上做不到。角色与阶段同理：命令行没有设计行与图行的服务，§9.4 没有说它们在命令行里怎么取。
2. §9.4 说「M6-R3 让脚本传入 GLM 包的 `peakWindowAt` 作为这个信号的来源」，但 `check` 的参数里没有传信号的入口，规则库也没有定义可以带信号值调用的函数，M6-R3 的 `gateOnRules` 接不上。
3. 后果是无声的：附录 A.4 与 §2.6 的例子「高峰时不跑标定」由人设好之后，仓库脚本经 `check` 自查时在高峰时段照样放行，输出里不写 `glm-peak` 读不出（§9.4 的输出只有执行方式、规则与拒绝文字）。这属于 §1.1 的「失败了没有途径发现」。

改法（推荐 a，b 与 c 一起做）：

- (a) `check` 取信号的顺序写成：项目状态里的开关与检测器信号与门相同；`glm-peak` 取 `projects/<键>/hosts/` 下 45 秒内更新过、`at` 最新的心跳文件的 `computed.glmPeak`（宿主算出的值，§7.2 已有这个字段）；没有这样的心跳时读不出，原因「没有活的宿主，命令行读不到计价服务」。另加可重复的 `--signal <名字>=<值>`，只允许覆盖宿主算的信号（`glm-peak`），以及 `--role main-agent|root|subagent`、`--stage <阶段>`；不给时角色与阶段读不出，原因「命令行没有设计行与图行」。
- (b) `check` 的输出加 `signals`：判定用到的每个信号的值或读不出的原因与来源（`state`、`heartbeat <pid>`、`flag`）。退出码不变。
- (c) 给 M6-R3 定义库入口，例如 `src/rules/check.ts`：

  ```ts
  export interface CheckOptions {
    readonly project: string                      // 目录，按 §7.3 算键
    readonly session?: string
    readonly model?: string                       // provider/model
    readonly role?: 'main-agent' | 'root' | 'subagent'
    readonly stage?: string
    /** 宿主算的信号的值；给了就不读心跳文件 */
    readonly signals?: Readonly<Partial<Record<'glm-peak', boolean>>>
  }
  export function checkCall(call: { readonly tool: string, readonly args: unknown }, options: CheckOptions): CheckResult
  ```

  命令行与 `gateOnRules` 都调它；M6 传 `peakWindowAt(Date.now()) !== undefined` 作 `glm-peak`。
- 验收第 13 条改为：「命令行 `check` 在相同的信号值下（输出的 `signals` 一栏）给出与工具调用门相同的判定、拒绝文字与退出码；读不出的信号写明原因。」
- §15 R3 加用例：一条 `glm-peak is true` 的排队规则；心跳文件样例 `glmPeak.value: true`（45 秒内）时退出码 5；心跳超过 45 秒时 `glm-peak` 读不出、退出码 0、`signals` 写原因；`--signal glm-peak=true` 时退出码 5；`--signal code-freeze=true`（不是宿主算的信号）返回用法错误、退出码 2。

### F34（LOW）代码规则目录的 id 与代码里的规则 id 对不上

位置：§10.1、§7.2 `CatalogEntry`、§2.6。

问题：目录写 `guard:workspace-containment`、`guard:file-tools-only`、`graph:files-only`，又要求「契约测试核对目录里的 id 与各行实际的规则 id 一致」。代码里的 id 是 `workspace-containment`、`file-tools-only`（`src/guard/rules.ts`:73、127）与 `graph-files-only`（`src/guard/graph-files.ts`:26 `GRAPH_FILES_RULE`）。加前缀可以按规则去掉，`graph:files-only` 与 `graph-files-only` 却是另一个名字，契约测试要么失败，要么要一张没写出来的映射。

改法：目录 id 写成 `<行>:<代码里的规则 id>`，即 `guard:workspace-containment`、`guard:file-tools-only`、`graph:graph-files-only`；契约测试去掉 `<行>:` 前缀后与 `GuardRule.id`、`GRAPH_FILES_RULE` 比较。§2.6 的表与 §9.1 的显示随之改。

### F35（LOW）面板从心跳文件读的两样东西没写清读哪一份、`active` 指哪一行

位置：§7.2 `HostHeartbeat.computed`、`catalog`；§9.1 信号一节与默认规则一组；§10.1。

问题：一个项目可能同时有几个宿主的心跳（桌面版加 headless）。§9.1 说 `glm-peak` 一行与「那一行是否生效」读自心跳文件，没说读哪一份。`catalog` 每项只有一个 `active`；默认规则的实现行是 `rules`、告诉模型的是 `glm-prompt`，§9.1 要显示的是后者是否生效，`active` 指哪一行没写。行健康的读法也没写（`RowHealthView` 有 `activation()` 与按会话的 `session()`）。

改法：§9.1 写「取 45 秒内更新过、`at` 最新的一份；没有时写『没有活的宿主』」。`catalog` 项改为 `{id, active, toldActive?}`：`active` 是 `row` 那一行的 `activation().state === 'active'`；有 `toldBy` 的项另写 `toldActive`，取 `toldBy` 那一行的 `activation()`；服务不在为 `false`，面板写「未加载」。

### F36（LOW）`glmHournessRules` 服务没有类型

位置：§6.4（guard 读 `declaration`）、§9.3（图行调 `acceptProposal`）、§6.6、§7.2。

问题：两个使用方读同一个服务，成员与返回值（`missing` 之外还有 `busy`、`io`、`forbidden` 等）散在正文里，没有接口，也没有像 `pricingService`、`graphService` 那样的形状检查读取函数。图行与 guard 的实现者要各自猜。

改法：§7.2 加

```ts
export const RULES_SERVICE = 'glmHournessRules'
export interface RulesService {
  /** guard 的 glm:guard 节末尾那一行（§6.4） */
  readonly declaration: string
  /** 图上拍板成功之后调用（§9.3）；by 是那次拍板的身份 */
  acceptProposal(questionId: string, by: { readonly actor: 'human' | 'llm', readonly relay?: string }): Promise<
    | { readonly ok: true, readonly proposal: string, readonly outcome: 'accepted' | 'rejected' }
    | { readonly ok: false, readonly code: 'missing' | 'busy' | 'io' | 'invalid' | 'forbidden', readonly message: string }>
}
/** 形状不对按不在处理，回调 problem（同 pricingService） */
export function rulesService(ctx: ServiceLookup, problem?: (message: string) => void): RulesService | undefined
```

并写明 `/graph-apply` 与 `graph_decide` 在 `ok: false` 时结果里加的那一行按 `code` 取哪句话。

### F37（LOW）§5.3 降低检测器子进程的优先级，§11.2 说不改任何进程的优先级

位置：§5.3「资源」一条、§11.2 不可逆清单。

问题：§5.3 对检测器命令的子进程调用 `os.setPriority(child.pid, PRIORITY_BELOW_NORMAL)`；§11.2 写「不改任何进程的优先级」，后一句又写检测器命令「在低于正常优先级运行」。两句互相矛盾，也容易被读成限速仍在出厂范围里。

改法：§11.2 改为「不改宿主、agent 与人启动的任何进程的优先级，不把任何进程放进 job；规则板自己起的检测器子进程以低于正常优先级运行（§5.3）」。

### F38（LOW）R4 测选举，选举函数在 R6

位置：§15 R4 的 L2 一栏（「心跳文件的内容与选举」）、§16 R6、§13 运行者一行。

问题：选举函数在 `src/rules/detectors.ts`，属于 R6；R4 的测试却要测选举。R4 写心跳时 `runner` 字段怎么填也没写。

改法：R4 的心跳一律写 `runner: false`，R4 只测心跳内容（会话、`computed`、`catalog`、60 秒没有活会话时删除、超过 1 小时的旧心跳被删）；选举与 `runner` 的取值只在 R6 实现与测试。

### F39（LOW）依据落后于 main，表格卡的退路已经用不上

位置：文首依据、§9.3「R3 开工时 `card-fields-table` 若还没合入」一段、§16 开工条件。

问题：设计写依据为 `5979aff`、卡片字段「等 split 的 L4 之后合入」。main 现在是 `eb614ab`，`e22282f`（表格卡：label、gain、cost、dimension、crux、verdict、weight）已合入，`d-option-card` 已 done。§9.3 的 `consequence` 退路与 §16 的那条开工条件已经不会走到。

改法：依据改为 `eb614ab`，写明 `e22282f` 已合入；删掉 §9.3 的退路一段与 §16 开工条件里关于 `card-fields-table` 的半句；§15 R3 的「交给真实的图引擎提一次」保留。

### F40（LOW）默认规则的主体 `*/glm*` 与 `isGlmModel` 不完全等价

位置：§3.1 `subjects`、§2.3 模型一行、§18「默认规则对谁」。

问题：设计说 `*/glm*` 与高峰提醒的口径相同（`isGlmModel`）。`isGlmModel` 只看模型 id 是否以 `glm` 开头（`src/shared/route.ts`；`src/glm-prompt/index.ts`:139 用它判 GLM 步）。§2.3 的通配在 `provider/model` 整串上做，`*` 是否跨过 `/` 没写；模型 id 自带斜杠时（例如 `openrouter` 上的 `z-ai/glm-4.6`）两者结果不同。只影响 `rules_show` 是否列出这条只告知的规则。

改法：§2.3 写明 `*` 不跨 `/`，模式按第一个 `/` 分成 provider 与 model 两段分别匹配；或者 §3.1 的主体直接写成「`isGlmModel(route.model)`」并在 `BuiltinRule` 里允许一个代码谓词。推荐前者，改动只在通配函数。

### F41（LOW）活着的宿主心跳没写成时，它的等待单会被别的宿主过期，agent 不会被告知

位置：§5.4、§6.3 过期一条、§7.4 第 5 步、§11.2。

问题：心跳文件经临时文件加改名写入，Windows 上读者开着文件时改名会 `EPERM`、`EBUSY`；§7.4 第 7 步给快照写了重试，心跳没写。宿主活着但连续 45 秒没写成（改名一直失败，或事件循环被长时间占住），任何一次写入的规划步骤都会把它的单按「宿主不在」过期。拥有者之后重判时只看到单已过期，原来的 agent 曾被告知「解除时会收到消息」，这条消息不会来。流水与面板有记录，所以查得到，但 §11.2 没有这一行预案。

改法：心跳改名用 §7.4 第 7 步同样的重试，失败告警一次；§11.2 加一行「宿主活着，心跳 45 秒没写成 → 别的写入把它的单过期 → 拥有者重判时发现自己的活会话有被按『宿主不在』过期的单：给 agent 发一次唤醒，写『q-N 因心跳超时被过期，条件可能仍然成立，再试一次会重新排队』，行健康 degraded 一次；留痕：流水的 `expire` 记录与这次唤醒」。

## 已核实的假设

- `pricingService(ctx, problem)` 读 `glmHournessPricing`，形状不对返回 `undefined` 并回调 `problem`；成员 `peak(atMs): boolean` 存在（`src/shared/pricing.ts`）。§3.2 的读法与降级与它一致。
- `nextPeakChange` 还不在 `src/shared/pricing.ts`；M6 设计 0.1 §5 定义了同一个签名（`(peak, fromMs, horizonMs?)`，默认 8 天）。设计写「谁先实现谁加」，与现状相符。
- 高峰提醒在 GLM 包：`src/glm-prompt/peak-reminder.ts`，来源 `glm-peak-reminder`，经 `installStepNotice`，用 `peakWindowAt`（`src/glm-llm/credits.ts`）；GLM 步按 `isGlmModel(route?.model)` 判（`src/glm-prompt/index.ts`:139、214）。
- `isGlmModel`、`sessionRoute`、`assemblyRoute` 在 `src/shared/route.ts`；`toNativeTool` 在 `src/shared/dialect.ts`；`installStepNotice` 在 `src/shared/step-notice.ts`；`wrapSystemReminder` 在 `src/shared/zcode-notice.ts`；`userDataHome` 在 `src/shared/data-home.ts`；`shellCommandOf`、`evaluate`（判定器抛错即放行）、`renderCorrection`（四段式）在 `src/guard/rules.ts`。
- `HOURNESS_ROWS` 今天是 `['data', 'guard', 'memory', 'workflow', 'hourness', 'graph', 'graph-panel']`，`ACTIVATION_ONLY` 不含将来的 `rules`，`collectHealth` 能按会话读新行（`src/shared/health.ts`）。
- `tool-names.ts` 今天没有 `DISPATCH_TOOL_NAMES` 与 `RULES_TOOL_NAMES`；设计把它们写成新常量，没有假设它们已存在。
- `GRAPH_FILES_DECLARATION` 与 guard 经 `graphService(ctx)` 是否存在决定加不加这一行的做法存在（`src/guard/index.ts`:226），§6.4 的声明一行照这个做法可行。
- `graph-files.ts`:114 对带 `parent` 的调用直接 `next()`，F32 的改法正确地没有照抄它。
- 表格卡校验：`CARD_LIMITS = { label: 20, gain: 60, cost: 60, dimensionName: 12, cell: 20, crux: 60, verdict: 120 }`、`WEIGHTS = ['one-way', 'two-way']`（`src/graph/schema.ts`）；`verdictKeys` 取箭头后的键，推荐键必须在其中（`src/graph/engine.ts`:294–409）。「是 → set；否 → skip」能通过。
- 图的转述：`relay` 至多 2000 字符（`src/graph/mutation.ts` `RELAY_LIMIT`），`graph_decide` 带 `relay` 时有人的权限（`src/graph/tools.ts`、`engine.ts`）。§2.5 的转述路径与它一致。
- `GraphService` 今天只有 `dirFor` 与 `isGraphTool`（`src/graph/service.ts`）；规则行与图行同在编排层包，提待决与读待决历史可以直接导入 `src/graph/` 的引擎，不需要给图服务加成员。
- `mainAgentActive`（`src/graph/main-agent.ts`）、`goalOf`、`effectiveStage`（`src/graph/stage.ts`）在 main 上。
- `scripts/packages.mjs` 的 `hourness.src` 与 `rows` 与 §16 要改的位置一致。
- 探针：`probe-hourness` 组合存在（`scripts/sandbox.mjs`:55）；探针时钟平移到周三 15:00 UTC+8（`scripts/probe/run-probe.mjs`:344）；探针 provider 经 `ctx.get('commands')?.find(agent, name)` 调真实命令（`scripts/probe/probe-llm.mjs`:105）；`probe-dispatch.mjs` 存在。R4 的 L3 场景依赖的这几样都在。
- 图节点：`question-32` done，选 C，原话「规则C」；`question-36` done，最后一次由 agent 选 B（13:25Z）；`d-rules-human-only` approved，原话「先不允许自己加规则吧，只有人能动」。

## 没有核实或不对的假设

- 不对：§9.4 与验收第 13 条在 `glm-peak`、角色、阶段上互相冲突（F33）。
- 不对：代码规则目录的 id 能与代码里的 id 直接比对（F34）。
- 不对：`*/glm*` 与 `isGlmModel` 口径相同（F40，只在模型 id 带斜杠时不同）。
- 过时：依据 `5979aff` 与「卡片字段等 split 的 L4 之后合入」（F39）。
- 没有核实（设计自己列为核实项）：V3（`inject` 不破坏 goal-round-driver 的预约）、V4（面板按绝对路径读与监视用户级文件）、V11（一次性子 agent 交回之后发出 `session/disposed`）。三项都有写明的退路。
- 没有核实（沿用 0.3 的实读，本轮没有重数 rc.3 行号）：§6.6 契约表里的 rc.3 行号。设计文首已写明沿用。
- 没有核实：plain-ui 设计 §7.6 的板块登记表与 order 170 的位置（只影响 R5 的入口位置，最小版有退路）。

## 结论

HIGH 0、MEDIUM 1（F33）、LOW 8（F34–F41）。按规则：CHANGES_REQUESTED。F33 一处改动（命令行取宿主信号的顺序、输出 `signals`、库入口 `checkCall`、验收第 13 条的措辞与 R3 用例）就能关掉；LOW 各项可以同一次修订顺手改。

# 0.5 第 1 轮（设计 0.5）

## 本轮审了什么

- 输入：`design.md` 0.5 全文（1694 行，下文行号按 UTF-8 逐行计）；上一轮（0.4 第 1 轮）的发现 F33–F41；`.agents/tasks/design-context.md` 最新几节（Main agent direction、Decided 2026-10-30、Questions become conversation、Peak mode and clock facts）；图节点 `d-peak-mode`、`d-defaults-readonly`、`d-chat-not-cards`、`d-ui-look-not-operate`、`d-design-onepage`、`d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-one-main-agent`、`d-rules-human-only`、`norm-merge-gate`、`norm-review-floor`、`schedules`、`d-option-card`；`docs/DEVELOPMENT.md` §1.1。
- 对照的宿主源码：`reference/dsh-desktop-0.2.1-rc.3/` 的 `dsh-goal`、`dsh-goal-round-driver`、`dsh-agent`、`dsh-agent-loop`、`dsh-tool-goal`、`dsh-session`、`dsh-session-projection`、`dsh-tools` 与 `dsh-agent/README.md`；0.5 新用的契约（goal 的暂停与恢复、驱动器对暂停的反应、`agent/pre-step` 的 `reject` 与 `claim`、`agent/created`、发起者作用域）逐条读了源码。
- 对照的 ZCode 包：`reference/zcode-3.17.1/zcode.cjs`（MD5 `331AB13D0CB2E9504EA25420FF9AE663`，与 `d-zcode-3171` 相符）与 `reference/zcode-3.16.3/zcode.cjs`，按 §10.6 的每个说法计数与取上下文。
- 对照的仓库（main `02d61ce`）：`src/shared/health.ts`、`route.ts`、`pricing.ts`、`dsh-min.ts`；`src/guard/rules.ts`、`graph-files.ts`；`src/graph/schema.ts`、`engine.ts`；`src/glm-prompt/peak-reminder.ts`；`docs/ORCHESTRATION.md` §11.4；`scripts/packages.mjs`、`scripts/preflight-bundle.mjs`、`scripts/probe/`；`.agents/tasks/m7/design.md` 的 `slots`；`git log ed073d5..HEAD`。

## 0.4 第 1 轮发现的状态

| # | 状态 | 依据（`design.md` 行号） |
| --- | --- | --- |
| F33 命令行读不到 `glm-peak` | Closed | 取法按 (a)：调用方的值优先，其次 45 秒内的心跳，都没有时读不出并写原因（第 280 行、第 1187 行的表）；`--signal` 只认 `HOST_SIGNALS`，给项目状态里的信号是用法错误、退出码 2（第 105、1382 行）；`--role`、`--stage`、`--model`、`--session` 都有，没给即读不出（第 1127 行的命令表、第 1187 行起的表）。(b)：`SignalReading` 与 `CheckResult.signals`、`subjects` 带值或原因与来源（第 1156–1175 行）。(c)：库入口 `checkCall`（第 1180 行），命令行与 `gateOnRules` 共用，与门共用 `judgeInput`、`judge`（第 1183 行、第 1421 行不变量）；M6-R3 的接法（第 1203 行）。验收第 13 条已改（第 105 行）。R3 用例覆盖评审列的五例并多出心跳取舍、取反、主体、阶段与只读几例（第 1440 行） |
| F34 目录 id | Closed | `<行>:<代码里的规则 id>`，`graph:graph-files-only`，契约测试去前缀后比较（第 236–241、690、1211 行）；代码里的 id 已核对（`src/guard/rules.ts`:73、127，`src/guard/graph-files.ts`:26） |
| F35 心跳读哪份、`active` 指哪行 | Closed | `catalog` 项为 `{id, state, toldState?}`，取 `RowState`（第 699、846 行）；`liveHeartbeats` 一处定取法（第 849–856 行）；读 `activation()`、不读 `session()`，理由写明（第 1211 行）；`RowHealthView.activation()` 已核对（`src/shared/health.ts`:58–62） |
| F36 服务没有类型 | Closed | `RULES_SERVICE`、`RulesService`、`AcceptRequest`、`AcceptResult`、`rulesService(ctx, problem?)`、`proposalIdOf`（第 862–897 行）；每个结果码两个调用方各多写哪一行（第 1098–1106 行）。`ServiceLookup` 确在 `src/shared/dsh-min.ts`:298 |
| F37 优先级两句矛盾 | Closed | 第 1340 行按评审的句子改 |
| F38 R4 测选举 | Closed | R4 的心跳一律 `runner: false`（第 382、846 行），R4 用例只测心跳内容（第 1441 行），选举在 R6 |
| F39 依据落后 | Closed（另见 F48） | 依据 `ed073d5`、表格卡已合入（第 20 行）；§9.3 的退路已删；开工条件删了 `card-fields-table`（第 1456 行）。本轮 main 又多了一个碰代码的提交，见 F48 |
| F40 `*/glm*` 与 `isGlmModel` | Closed（另见 F53） | 第 177 行：按第一个 `/` 分段，provider 段 `*` 不跨 `/`，model 段整段匹配；与 `isGlmModel`（`src/shared/route.ts`:31，小写后以 `glm` 开头）等价。R1 的用例把结论写反了，见 F53 |
| F41 心跳没写成时的单 | Closed | 心跳改名退避重试、告警一次（第 380 行）；拥有者对 `host-gone` 单补发一次唤醒、不重开、行健康 degraded 一次（第 464 行、第 538 行的文字、第 1312 行的预案）；R4 用例（第 1441 行） |

## 对人定方向的核对

| 方向 | 结论 |
| --- | --- |
| `d-peak-mode`：默认档是少做 | 不满足。0.5 出厂暂定无影响，§19 把它当待人定的题，推荐无影响（F42） |
| `d-peak-mode`：少做是少开并行的 worker、不做重活（练习题、消融、大的审查），必要的照做 | 部分满足：重活挪开有，少开并行没有（F43）；GLM 包的提醒同时叫模型不要推迟工作（F45） |
| `d-peak-mode`：新手教程告诉人有这个模式、默认少做、在哪里改 | 不满足：只写了「可以加半句」，不说默认档（F44） |
| `d-peak-mode`：主 Agent 每步从 harness 的提醒里知道是不是高峰与档位，不靠自己算时间 | 满足（第 318、566–569 行；只在变化、压缩之后与目标轮注入，之后留在上下文里）；出厂默认被写成「set by the human」（并入 F42） |
| `d-defaults-readonly`：插件带来的默认条目只能看，档位例外，「以它为模板新建」可以留 | 实际做法满足（默认规则没有解除、附属条目与代码规则只读、档位三个单选、模板保留，第 297、1013–1014 行），但全文没有引这条人定，单上的两个操作和它的关系没写（F50） |
| `d-chat-not-cards`：问人改成聊天，一个方案四行（背景、推荐、疑问、不做），不出选项表 | 不满足：`rules_propose` 仍按表格卡问人，验收第 7 条写死「表格卡待决」（F46）；§19 的选项题随 F42 删去 |
| `d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-one-main-agent` | 满足（第 1229–1234 行逐条对照；`heldForPeak` 给 M7 的到点提醒用；M7 的合入核对只读进目录；规则板不选模型、不加 git 规则） |
| 讨论中：合入前的检查清单与必须全审清单作为门显示在规则板上（不挡路） | 结构上放得下（代码规则目录只读），缺清单来源的指向，`norm-review-floor` 还不在目录里（F51） |

## 发现

### F42（MEDIUM）出厂档位仍是无影响，§19 还把已定的事交给人

位置：文首第 3、16 行；§0 第 48、57 行；§1.2 F5a 第 75 行；§1.4 第 15 条（第 107 行）；§1.5 第 118 行；§3.4 第 292 行；§3.6 表第 309 行、第 322 行；§6.4 第 566–569 行；§7.2 第 779 行；§13 第 1405 行；§19 第 1524–1542 行；附录 C 第 1686 行。

问题：人已定默认档为少做。`d-peak-mode` 第二条历史（2026-10-29T17:45:14Z，`op: edit`，提交 `d1d5a79`）的原话是「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」，正文随之改成「少做（默认档：……）」；`design-context.md` 的 Peak mode 一节同样写「少做 (the default …)」。0.5 用的是这次改动之前的转述（文首第 16 行「出厂暂定无影响，等人确认」），§19 推荐无影响。这是没有满足的要求。连带站不住的几句：

1. §1.5「高峰模式暂定无影响，不改变任何调用的判定」；§3.4 第 292 行与 §19 末段「比只告知更严的做法现在是人自己选的高峰档位，不是出厂替人定」。
2. §6.4 第一例「Peak mode set by the human: inform」在从没选过的项目里也这样写，把出厂值说成人选的；改成少做之后同样的写法会告诉模型「人选了少做」，模型可能据此对人说「你选了少做」。
3. §19 的题用编号选项写（第 1532–1534 行），也不合 `d-chat-not-cards`。

改法：

- 档位缺省为 `reduce`：§3.6 表第 309 行的「（出厂暂定，§19）」移到少做一行，写「少做（出厂默认，`d-peak-mode`）」；第 322 行与第 779 行写「没有这个字段时为 `reduce`」；§1.2 F5a、§0 两处与附录 C 随之改。§1.4 第 15 条改为「项目从没设过时档位是少做（`d-peak-mode`，人 2026-10-30）」。
- §19 改为「没有待人定的事项」，写一句 `d-peak-mode` 已定默认少做，原话照录；§16 开工条件删掉「§19 的一题与它一起问」。
- 高峰一行分来源：`peakMode` 没有时写 `Peak mode: reduce (the default; the human can change it on the rules page or with /rules peak).`，有 `origin` 时才写 `set by the human`。R4 的提醒用例加这两种写法。
- §1.5「不增加的」一条改为「出厂档位少做：高峰时只有自报可挪的脚本排队，主 Agent 被提醒少开并行、挪开重活；人随时可改」；§3.4 第 292 行与 §19 末段改为「默认规则本身只告知；出厂档位少做是人定的（`d-peak-mode`）」。§13 第 1405 行的不变量收窄为「`builtin:glm-peak-pricing` 本身不改变任何调用的判定」，另加一条「档位缺省时，高峰里被判为排队的只有带 `glmSpend: 'optional'` 的 `checkCall`」。§1.4 第 1 条末句保留（它的前提是档位为无影响）。
- §15 R1 加用例：状态没有 `peakMode` 时 `builtinRulesFor` 给出 `reduce` 的条目；R3 加：从没设过档位的项目在高峰里 `check --glm-spend optional` 退出码 5。
- R4 的文档改动加一条：`docs/ORCHESTRATION.md` §11.4 的「提醒只告知：不换模型、不换套餐、不拦截、不推迟任何工作」（第 1074 行）与「高峰期排不排、排哪些，到时候由用户决定〔定案〕」（第 1076 行）按高峰模式的定案整条重写（`AGENTS.md`：被取代的条款整条重写）。

### F43（MEDIUM）少做没有「减少并发」

位置：§3.6 表少做一行（第 310 行）；§6.4 少做一例（第 567 行）；§9.1 单选的半句（第 1013 行）；§1.4 第 16 条（第 108 行）；§18「高峰少做管到哪」（第 1520 行）；§10.7 M7 一条（第 1273 行）。

问题：人对少做的定义有两半：「少做或者慢做，减少并发数量」与「不做重活」（F42 引的原话）；`d-peak-mode` 正文写「高峰时减少并发的 worker 数量，不做重活，例如练习题、消融、大的审查，必要的活照做」。0.5 的少做只做了后一半：自报可挪的脚本排队，主 Agent 被提醒把重活挪到 18 点后。并发一处都没写：给主 Agent 的那一行不提少开并行，harness 不动派发上限，指标里也没有能看出做没做的数。M7 已有现成的并行上限：执行行的 `slots`，默认 3，只数写任务（`.agents/tasks/m7/design.md`:131、200）。

改法（推荐）：

- 并发由 harness 管，接在 M7 的槽位上。`RulesService` 加一个只读成员：

  ```ts
  /** 这个会话所属项目此刻的高峰与档位；只读内存，不抛错；会话不在本宿主上时 peak 为 undefined */
  peakState(sessionId: string): { readonly peak: boolean | undefined, readonly level: PeakLevel, readonly until?: string }
  ```

  §10.7 M7 一条加：派发 GLM 子 agent 之前读它；`peak === true` 且 `level === 'reduce'` 时，有效上限取 `max(1, floor(slots / 2))`（默认 3 得 1）；`peak` 为 `undefined` 时不减（读不出不拦，同 §3.6）；满了按 M7 现有的 `slots_full` 拒绝，文字写「高峰少做：同时至多 N 个」。这个折算记进 §18，agent 定、人可推翻。
- 第 567 行的少做一行加一句 `Run fewer workers at once: at most N GLM subagents in parallel until 18:00.`（N 取上面的折算，M7 没合入时不写数，只写 `fewer`）；§3.6 表与 §9.1 的半句同样写「少开几个并行的活」。
- §10.5 `rules.peak-mode` 在每段高峰结束时加「这一段里同时在跑的 GLM 子 agent 的最大数」（取自 M7 的派发记录）；§1.4 第 16 条加「M7 合入后，少做档的高峰里同时在跑的 GLM 子 agent 不超过 N」。
- 不在本版接 M7 的替代：只改提醒与指标，§17 写明「并发只靠主 Agent 照提醒控制」。这是替人定了「只靠自觉」，与 `hourness` 验收「由 harness 在执行边界保证实施」相抵，不推荐。

### F44（MEDIUM）新手教程那一句是「可以加」，也没写默认档

位置：§10.7 plain-ui 一条（第 1273 行）；§1.4 没有对应条目。

问题：`d-peak-mode` 正文要求「新手教程里告诉人有这个模式、默认是少做、在哪里改」，人的原话把它当作默认少做的条件（「默认少做，新手教程提醒用户就行了」）。0.5 只写「上手页第 4 块可以加半句『高峰时 GLM 的活怎么办，在规则里选』」：可选，不说默认是少做，也不说在哪里改。默认档会推迟可挪的脚本、减少并行；人没在教程里读到，就会在高峰时看到活变慢而不知道为什么。

改法：

- §10.7 plain-ui 一条改为必须：上手页第 4 块加一句固定字串（过 `plainWordsIn`）：「工作日 14 点到 18 点是 GLM 的高峰，默认少做：少开几个并行的活，练习题、对照实验、大的评审挪到 18 点后，必要的活照做。想改，在规则页的『高峰时 GLM 的活怎么办』里选，或在对话里输入 /rules peak 无影响、少做或不做。」
- plain-ui 的上手页合入之前，规则页默认规则一组顶上显示同一句（R5），R5 的面板模型测试钉住它；档位是人选的时，这一句换成「<谁> 在 <时刻> 选的」。
- 只装编排层包（没有计价服务）时，这一句换成「装了 GLM 通道包才有高峰时段」。
- §1.4 加一条：「上手页（plain-ui 合入之后）与规则页默认规则一组都有一句写明高峰模式、出厂默认少做、在哪里改。」

### F45（MEDIUM）同一段高峰里，GLM 包的提醒叫模型不要推迟工作

位置：§3.4 第 296 行（「两者内容不同，GLM 主 Agent 两样都收到」）；§10.6 第 1267 行（「高峰模式不要 GLM 包改任何东西」）；§16 R4 的文档改动（第 1463 行）。

问题：GLM 包的提醒正文是 `src/glm-prompt/peak-reminder.ts`:28 的 `PEAK_REMINDER_TEXT`，末句「This is for your information only: keep working on the current task, and do not switch models or plans, or pause or postpone work, unless the user asks.」；同文件第 5–6 行的注释（「the harness never … blocks or postpones work」）与 `docs/ORCHESTRATION.md`:1074 同义。档位为少做（出厂默认，F42）或不做时，GLM 主 Agent 在同一段高峰里收到两句相反的话：规则板那一行叫它挪开重活、少开并行或停下，GLM 包那一行叫它照常做、不要推迟。设计只说两者「内容不同」，没说哪一句优先，也没让 M6 改那半句。少做里 agent 那一部分全靠主 Agent 照提醒做（§3.6「管不到的」一栏），这处矛盾直接削弱出厂默认档；模型照 GLM 提醒去做时也不会留下任何记录，属于失败了没有途径发现。

改法（a 必做，b 记给 M6）：

- (a) 规则板的高峰一行在少做与不做两档末尾加一句 `This is the human's peak setting; it takes precedence over the GLM peak reminder's "keep working, do not postpone".`，无影响档不加。R4 的提醒用例与 L3 场景 `rules-peak` 钉住它。
- (b) §10.7 给 M6 加一条（M6 管提醒，`d-peak-mode`）：把提醒末句改为不与档位冲突的写法，例如 `This is for your information only: do not switch models or plans unless the user asks.`，「要不要推迟」交给规则板的那一行；只装 GLM 包时没有那一行，模型照常做。§3.4 第 296 行改写为这一分工。
- R4 的文档改动写明：`docs/ORCHESTRATION.md`:1074 与 `peak-reminder.ts` 第 5–6 行的注释随 (b) 整条重写，与 F42 的 §11.4 重写同一批。

### F46（MEDIUM）规则提议仍按表格卡问人，违背 `d-chat-not-cards`

位置：§1.4 第 7 条（第 99 行「表格卡待决」）；§9.3 `rules_propose` 的输入（第 1053 行）、例题表（第 1059–1066 行）、待决字段表（第 1078–1088 行）与「人在『需要你』里拍板，与其他待决一样一次点击」（第 1092 行）；§12 第 1376、1388 行；§7.2 `Proposal`；§15 R3。

问题：`d-chat-not-cards`（approved）：问人改成聊天，agent 提一个方案，不给选项、不出问答卡；人看到的是题目一行，下面背景、推荐、疑问、不做四行（节点批注 2026-10-29T17:25Z、17:27Z；用户原话「我指的是背景一行，推荐一行，疑问一行，不做一行」）；编排方的落地方案第二条写明人定的待决不再要求 `options`、`recommend`、`crux`、`verdict`、`weight`、`gain`、`cost`。`design-context.md` 同节：「Do not invest further in card formats; keep any card-related parts isolated.」0.5 把卡片组装收在 `proposalQuestion` 一个函数里，这一半做到了；可是 agent 写的输入仍是卡片字段（`crux`、`skip.gain`、`skip.cost`、`set.gain`、`set.cost`，§12 全部必填），验收第 7 条写死「表格卡待决」，人看到的是两个选项加「取决于」与结论行。按 `d-design-onepage`，违背方向清单即挡路。

改法：

- `rules_propose` 的输入改为四行方案：`{kind, body, summary, background, recommend, doubt, notDoing, reason}`。`summary` 是题目；`background` 不变（plain-ui 的字段与 150 码点上限）；`recommend` 一行写设了之后会怎样；`doubt` 一行写 agent 最没把握的一点，并点出哪件事成立就不该设；`notDoing` 一行写不设会怎样、为什么不选；三者各 1–60 个码点、一行。去掉 `crux`、`skip`、`set`。§12、§7.2 `Proposal`、§15 R3 随之改。
- `proposalQuestion` 把四行原样写进待决：`background` 进节点字段，推荐、疑问、不做三行进正文，末行仍是「规则板提议 `<id>`」。R3 开工时图引擎若仍按 `e22282f` 要求人定的题带卡片字段，就在这个函数里机械地补上（`label` 用现在的固定字，`gain` 取 `recommend`，`cost` 取 `notDoing`，`crux` 取 `doubt`，`verdict` 照旧生成），不进工具输入，不进规则页；引擎去掉这条要求之后删掉补字段的代码（删除即删净）。
- §1.4 第 7 条改为：「`rules_propose` 只产生图上一张决定者为人的待决与随后的一条提议：待决带 `background` 与推荐、疑问、不做三行，没有选项表；人在主 Agent 的对话里同意、补充或否掉，主 Agent 带人的原话经 `graph_decide` 记下；图不可用时人在规则页点『设为生效』『驳回』。」第 1092 行的「一次点击」删去；「需要你」怎样列出这张待决照 plain-ui 与 M3 的定稿。
- §9.3 规则板自己的例题改写成四行，仍过 `plainWordsIn`。

### F47（LOW）暂停与恢复 goal 的引用少了 `id`

位置：§6.3 第 472–473 行。

问题：写的是 `goals.pause(agent, {revision})` 与 `goals.resume(agent, {revision: pausedGoal.revision})`。rc.3 的引用是 `{id, revision}`：`expectCurrent` 先比 `ref.id`，不等就抛 `GOAL_STALE_REVISION`（`dsh-goal/lib/index.js`:760–765）；驱动器自己用 `goalRef(goal)` 组 `{id, revision}`（`dsh-goal-round-driver/lib/index.js`:44–47）。照字面实现，每次暂停都抛错、落到 `pauseFailed`。有降级与告警，不挡路。

改法：`const view = goals.get(agent)`，`goals.pause(agent, {id: view.id, revision: view.revision})`；`pausedGoal` 记 `pause` 返回的视图的 `{id, revision}`（暂停让修订号加一，`dsh-goal`:174）；恢复写 `goals.resume(agent, {id: pausedGoal.id, revision: pausedGoal.revision})`。R4 的假宿主按 `{id, revision}` 核对，`id` 不对时抛 `GOAL_STALE_REVISION`。

### F48（LOW）依据落后于 main：每一行要有自己的语言文件

位置：文首第 20 行；§16 开工条件第 1456 行、R4 第 1463 行。

问题：main 已到 `02d61ce`。`ed073d5..HEAD` 里碰代码的提交只有 `6134c83`（m8-row-titles），`src/` 没有变化，但它改了行的登记：`scripts/packages.mjs` 的注释写明每一行在补丁里按 `<name>/<row>` 子路径命名、设置页标题放在 `<dir>/locale/<row>/`；`scripts/preflight-bundle.mjs`:36–38、255–259 逐行检查 `locale/<row>/en.json` 与 `zh.json`。§16 只写了 `hourness.src`、`rows` 与补丁位置，没有 `packages/hourness/locale/rules/`。preflight 会挡住，所以查得到。

改法：依据改为 `02d61ce`，写明 `6134c83` 改了行的命名与语言文件；R4 加 `packages/hourness/locale/rules/en.json`、`zh.json`（`meta.title`、`meta.description`，同 `packages/hourness/locale/guard/`），补丁里的行按 `6134c83` 之后的写法命名。

### F49（LOW）§10.6 对 ZCode 3.17.1 的描述不全，两个位置号对不上

位置：§10.6 第 1267 行；附录 C 第 1690 行。

问题：`off-peak` 不只是服务端排队协议。两份 `zcode.cjs` 都有给模型的工具 `OffPeakCreate`（「Create a one-off idle-time task … when the server grants off-peak compute, at no plan-quota cost」，3.17.1 字符位置约 7814300），另有 `off-peak` 账号模式与 `off-peak-run` 一组消息。它说的是服务端空闲算力上的闲时任务，属于 `off-peak` 套餐，和 14–18 点的峰谷计价不是一回事，所以 §10.6 的结论（包里没有本地峰谷时段，`peak` 不必随基线改）仍成立。另外 `@554187` 与 `@12791216` 既不是字符位置也不是字节位置：套餐模式枚举那串从字符 554163 开始（此处字符与字节相同），`<system-reminder>` 那一句从字符 12791344、字节 12791422 开始。其余计数都对得上（见已核实的假设）。

改法：§10.6 加半句「`off-peak` 另有闲时任务工具 `OffPeakCreate` 与同名账号模式，说的是服务端空闲算力，与峰谷计价无关，规则板不用」；位置改用可复查的写法（搜索串，或改成上面的字符位置并注明是字符）。

### F50（LOW）没有引 `d-defaults-readonly`，单上的两个操作和它的关系没写

位置：文首相关节点（第 5 行）；§9.1 第 1013 行；§6.3「放行这一次」与「这个会话本次高峰照常做」（第 470、474 行）。

问题：设计的做法已经合 `d-defaults-readonly`：默认规则没有「解除」，两条附属条目与代码规则目录只读，档位能选，「以它为模板新建」保留。但全文没有引这条人定（也没有引 `d-peak-mode`），读者对不上。「放行这一次」与不做档的「这个会话本次高峰照常做」作用在默认条目开出的单上，算不算「开关默认条目」没有说明。

改法：文首相关节点加 `d-defaults-readonly`、`d-peak-mode`；§9.1 默认规则一组加一句「插件带来的条目只能看（`d-defaults-readonly`），例外是档位，由人选」；§6.3 写明这两个操作改的是一张单（一个会话，到这一段高峰结束为止），不改条目本身，所以不算开关默认条目；人若认为算，删掉「本次高峰照常做」，只留改档位。

### F51（LOW）合入前的检查清单与必须全审清单放上规则板：结构放得下，缺清单的来源

位置：§2.6 第 242 行；§7.2 `CatalogEntry` 第 689–695 行；§9.1 写在代码里的规则一组；§10.1。

问题（讨论中的方向，不挡路）：`schedules` 节点 2026-10-30 的批注提议把 `norm-merge-gate` 与 `norm-review-floor` 当作门显示在规则板上。0.5 已把 M7 的合入核对列进代码规则目录（第 242 行），只读，合 `d-defaults-readonly`。还缺两样：`CatalogEntry` 只有 id、标题、行、执行方式与 `toldBy`，没有字段指向清单所在的图节点，清单的条目（命令、改动类别）显示不出来；`norm-review-floor` 不在目录里。两份清单本身在图上由人改（`norm-merge-gate` 正文「改松这份清单要人同意」），规则板只该显示。

改法：`CatalogEntry` 加 `source?: string`（图节点 id），规则页对有 `source` 的条目显示节点的人话标题与条目（读图，不复制），点开跳到图；§2.6 与 §10.1 加一行「必须全审的改动（M7，`norm-review-floor`）」，M7 合入后登记。人定了这个方向再做，本版在 §10.7 记下这个接口即可。

### F52（LOW）R1 的目录用了 `HealthRow` 里还没有的行名

位置：§7.2 `CatalogEntry.row` 与 `toldBy`（第 693–695 行）；§16 R1、R4。

问题：`HealthRow` 取自 `HEALTH_ROWS`（`src/shared/health.ts`:23、26、40），今天没有 `rules` 与 `design`。R1 的 `builtin.ts` 里默认规则与附属条目写 `row: 'rules'`，在 R4 把 `rules` 加进 `HOURNESS_ROWS` 之前过不了类型检查，R1 的提交 `npm run build` 不过；M3 的 `design` 同理。

改法：R1 就把 `rules` 加进 `HOURNESS_ROWS`（R4 之前这一行显示为「未加载」，行健康本来就这样报缺席的行）；M3 的两条在 M3 加了 `design` 之后登记。§16 的 R1 与 R4 随之改。

### F53（LOW）R1 的 `openrouter/z-ai/glm-4.6` 用例与 §2.3 的规则相反

位置：§15 R1（第 1438 行末）；§2.3 第 177 行；§3.1 第 263 行。

问题：按 §2.3，`*/glm*` 的 model 段 `glm*` 整段匹配，对 `z-ai/glm-4.6` 不成立；`isGlmModel('z-ai/glm-4.6')` 也是假（`src/shared/route.ts`:31）。两者等价，这正是 F40 要的结果。R1 却写「`openrouter/z-ai/glm-4.6` 命中 `*/glm*`」：照这个用例实现，通配会被改回跨段匹配，又和 `isGlmModel` 不一致。

改法：用例改为「provider `openrouter`、model `z-ai/glm-4.6` 不命中 `*/glm*`，与 `isGlmModel` 相同；`*/z-ai/glm*` 命中」。

### F54（LOW）没有计价服务的项目，主 Agent 也收到一行 GLM 高峰

位置：§6.4 第 569 行；§3.6 第 318 行；§1.4 第 15、18 条。

问题：只装编排层包、不用 GLM 的项目，主 Agent 在压缩之后与每个目标轮都会收到「GLM peak: unknown (no pricing service …)」一行。这一行对它没有可做的事，档位也不起作用。

改法：没有计价服务（不是 `peak` 抛错）时不写高峰一行；`peak` 抛错时照写读不出，因为那时用的是 GLM。§1.4 第 15、18 条写清这两种情形。

## 已核实的假设

- goal 服务：服务名 `goals`（`dsh-goal`:592，`inject = ["agents", "sessionProjections"]` 在 :587）；`get` 先 `assertLive`，不是活实例时抛 `GOAL_AGENT_NOT_LIVE`（:611–614、:767–769）；视图展开 `goal`，带 `id`、`revision`、`phase`（:879–888）；`pause` 只认 `active`，转 `paused` 并 `disarmed`（:676 经 `transition`，:818–823）；`resume` 认 `active`、`paused`、`blocked`，已 armed 的 `active` 与轮次用完时抛错（:686–698）；每次变更修订号加一（:174）；变更发 `goal/changed`（:877）。§6.6 引的 goal:671–698 与 §6.3 的失败处理与此一致。
- 驱动器：`goal/changed` 为 `pause` 且 agent 在跑、`ctx.agents.currentInitiator() !== agent` 时才 `cancel({kind: 'user'}, {keepInbox: true})`（`dsh-goal-round-driver`:243–247）；进入下一回合收件箱的消息记为竞争输入（:249–256）；回合结束只处理 `max-tokens` 与 `aborted`（:273 起）。
- 发起者作用域：`currentInitiator()` 读 AsyncLocalStorage（`dsh-agent`:370–374）；每个驱动器的整个生命在 `withInitiator(this, …)` 里运行（`dsh-agent-loop`:868，`dsh-agent/README.md`:113）；`dsh-tool-goal`:30 在工具执行时要求 `currentInitiator() === agent`。所以直接的工具调用里 V12 的推断有依据。
- `agent/pre-step`：`preStep` 先 `claim` 再跑瀑布（`dsh-agent-loop`:901–925，`claim` 在 :906），`reject` 原样返回（:922），回合以 `blocked` 结束（:960–962）；`claim` 把消息移出收件箱（:103–112）；`dsh-agent/README.md`:85 同义。§3.6 不用 `reject` 的理由成立。
- `agent/created` 是 serial 事件（`dsh-agent`:581），`agents.get` 在 :596；`followup`、`steer`、`inject` 在 `dsh-agent-loop`:806–814；`session/disposed` 在 `dsh-session`:1930–1935；会话头 `parentSession`、`origin` 的校验在 `dsh-session`:1051–1053；`sessionProjections.register` 在 `dsh-session-projection`:68，`stateOf` 在 :126；`tools/pre-execute` 瀑布在 `dsh-tools`:3321。
- ZCode：3.17.1 的 MD5 与 `d-zcode-3171` 相同；两份包里 `14:00`、`18:00` 都是 0 处；`x-off-peak-ticket-id` 各 1 处；`3105` 各 11 处；`3102` 由 2 处变为 3 处；「`<system-reminder>` tags in messages and tool results are injected by the harness, not the user.」3.17.1 有 1 处（三元表达式的一个分支）、3.16.3 没有；套餐模式枚举含 `off-peak`。
- 仓库：`GuardRule.id` 在 `src/guard/rules.ts`:73、127；`GRAPH_FILES_RULE` 在 `src/guard/graph-files.ts`:26，带 `parent` 直接 `next()` 在 :114；`HealthState` 与 `RowHealthView` 在 `src/shared/health.ts`:47、58–62，`healthServiceName` 在 :79；`ServiceLookup` 在 `src/shared/dsh-min.ts`:298；`peak(atMs)` 与 `pricingService` 在 `src/shared/pricing.ts`:27、31；`isGlmModel` 在 `src/shared/route.ts`:31；`CARD_LIMITS` 与 `WEIGHTS` 在 `src/graph/schema.ts`:51、55；`verdictKeys` 在 `src/graph/engine.ts`:295；`PEAK_REMINDER_TEXT` 在 `src/glm-prompt/peak-reminder.ts`:28；探针的 `commands.find` 在 `scripts/probe/probe-llm.mjs`:107，`probe-clock.mjs` 与 `probe-dispatch.mjs` 都在；M7 的 `slots` 在 `.agents/tasks/m7/design.md`:131、200。
- `git log ed073d5..HEAD -- src` 为空：`src/` 自依据以来没有变；碰代码的只有 `6134c83`（F48）。
- `src/graph/plain-question.ts` 与 `PLAIN_LIMITS` 今天不在 main 上，与设计写的「R3 等 plain-ui 第 1 步与 M3 第 3 步」相符。

## 没有核实或不对的假设

- 不对：出厂档位与 §19 的题（F42）；少做只管重活、不管并发（F43）；新手教程那一句可选（F44）；规则板的高峰一行与 GLM 包的提醒不冲突（F45）；规则提议用表格卡问人（F46）；goal 引用只要 `revision`（F47）；依据 `ed073d5` 之后没有碰到规则板的改动（F48）；`off-peak` 只作服务端排队协议、两个位置号（F49）；R1 的 `openrouter` 用例（F53）。
- 没有核实：V12 在 `run_code` 子调用里是否成立。程序里的工具调用从程序运行时回到宿主时，发起者作用域是否还在，没有读到；不在时驱动器会 `cancel`（`keepInbox: true`），落到 V12 写好的退路。
- 没有核实（推断有依据）：插件调用 `goals.resume` 之后驱动器会开下一轮。`goal/changed` 之后驱动器调 `requestDrive`（`dsh-goal-round-driver`:247），`resume` 把 goal 设为 `armed`（`dsh-goal`:698），但下一轮从哪一刻开始没有运行过，留在 L3 `rules-peak-stop`。
- 没有核实（沿用上一轮）：V3、V4、V11；§6.6 里 0.3 起沿用、本轮没有重数的 rc.3 行号（本轮只重读了 0.5 新用的那些）。

## 结论

HIGH 0、MEDIUM 5（F42–F46）、LOW 8（F47–F54）。按规则：CHANGES_REQUESTED。

挡路的五条都出在 2026-10-30 的人定上：出厂档位要改成少做、§19 删题（F42）；少做补上减少并发（F43）；新手教程那一句改为必须并写明默认少做与改法（F44）；规则板的高峰一行要压过 GLM 包提醒里「不要推迟」那半句（F45）；规则提议改成四行方案，不出表格卡（F46）。0.4 的 F33–F41 全部关闭；F40 的 R1 用例写反了，另记 F53。LOW 各项可以在同一次修订里顺手改。
