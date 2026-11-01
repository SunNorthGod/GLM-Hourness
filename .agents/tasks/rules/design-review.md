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
| 0.6 第 1 轮 | 0.6 | 1 | 7 | 12 | CHANGES_REQUESTED |
| 0.7 第 1 轮 | 0.7 | 0 | 1 | 10 | CHANGES_REQUESTED |
| 0.8 第 1 轮 | 0.8 | 0 | 0 | 4 | APPROVED |
| 0.9 第 1 轮 | 0.9 | 0 | 4 | 5 | CHANGES_REQUESTED |
| 0.10 第 2 轮 | 0.10 | 0 | 0 | 2 | APPROVED |

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

# 0.6 第 1 轮（设计 0.6）

## 本轮审了什么

- 输入：`design.md` 0.6 全文（1810 行，下文行号按 UTF-8 逐行计）；`design-v0.5.md` 与它的评审（`design-review-v0.5.md`、`design-review-v0.5.json`，F42–F54）；`.agents/tasks/design-context.md` 最新几节（Main agent direction、Decided 2026-10-30、Questions become conversation、Peak mode and clock facts）；图节点 `d-peak-mode`、`d-defaults-readonly`、`d-rules-visible`、`d-chat-not-cards`、`d-one-main-agent`、`d-main-agent-models`、`d-main-agent-shell`、`d-auto-drive`、`d-design-onepage`、`metrics`、`m6`（2026-10-29T19:27:21Z 的编排方裁定）、`rules`（2026-10-29T20:02:48Z 的批注）、`norm-merge-gate`、`norm-review-floor`；`docs/DEVELOPMENT.md`:29（挡路的标准）。
- 兄弟设计，读的版本：M6 `.agents/tasks/m6/design.md` 0.3；循环板 `.agents/tasks/schedules/design.md` 0.1（未评审；图上 `dd2c01f` 记了 0.2 在重写，文件仍是 0.1）；plain-ui `.agents/tasks/plain-ui/design.md` 0.6（任务写的是 0.5；0.6 在 03:40 写入，0.5 原文在 `v0.5/design-0.5.md`，与本稿有关的 §6.4、§11 两版逐字相同，§4.7 的板块登记表接口在 0.6 改了）；M3 附录 `.agents/tasks/m3/design-addendum.md` 0.3。另读了 M7 `.agents/tasks/m7/design.md` 0.3：0.6 把少做的并行上限放在 M7 的派活工具里。
- 宿主源码（`reference/dsh-desktop-0.2.1-rc.3/`）：0.6 新写或改写的事实逐条读了 `dsh-goal`、`dsh-goal-round-driver`、`dsh-tool-goal`；其余沿用上一轮的核对。
- 仓库（main `436fbe7`）：`git log ed073d5..c2532e6` 与 `c2532e6..main`；`src/glm-prompt/peak-reminder.ts`、`src/shared/health.ts`、`src/guard/rules.ts`、`docs/ORCHESTRATION.md` §11.4。
- 完整性：按 `##`、`###` 小节把 0.6 与 0.5 逐字比对，并查了文首提到的附录 D、§20、`onepage.md` 与 `graph-ops-v06.json`。

## 0.6 是否写完整

没有写完（记为 F55，挡路）。文件在附录 C 的表格末行（第 1810 行）结束，没有半句话被截断，但：

- 文首第 3 行说「对每条发现与每项人定的处理见附录 D」「修订记录见 §20」，附录 D 不存在；§20 最后一条是 0.5（第 1681 行），没有 0.6。图上 `rules` 2026-10-29T20:02:48Z 的批注写「F42–F54 的处理与人定对照都在」，不对：只有文首一段概述。
- 逐字与 0.5 相同的节：§1.1、§1.3、§2.1、§2.2、§2.4、§4、§5.1、§5.4、§5.6、§5.7、§6.2、§7.1、§7.3、§7.6、§8、§9.4、§10.1–§10.7、§11.1–§11.3、§13–§20 与附录 A–C（§12 只改了几行）。其中 §1.1–§8 里列出的几节本来就不用改；§9.4、§10.4–§10.7、§11.2、§13–§19 与 0.6 改过的节相抵，见下面各条。
- 文首第 3 行说放行稿 `onepage.md` 在同目录，目录里没有；第 45 行说 `graph-ops-v06.json` 是本版的图操作草稿，那个文件（02:24 写入）是编排方记 0.5 评审结果的批注。

改过的节：文首、§0、§1.2、§1.4、§1.5、§2.3、§2.5、§2.6、§3.1–§3.6、§5.2、§5.3、§5.5、§6.1、§6.3–§6.6、§7.2、§7.4、§7.5、§9.1–§9.3、§12 的部分行。这些节本身读得通，下面的发现多数是它们与没改到的节之间的冲突。

## 0.5 第 1 轮发现的状态

| # | 状态 | 依据（`design.md` 0.6 行号） |
| --- | --- | --- |
| F42 出厂档位 | 部分关闭，仍挡路 | 已改：`effectivePeakMode`、`DEFAULT_PEAK_LEVEL`（第 732–733 行）、§3.6 表少做一行（第 336 行）、验收第 15 条（第 119 行）、高峰一行分来源（第 602–609 行）、§1.5、§3.4。仍开：§19 原样问人、推荐无影响（第 1640–1658 行），§16 开工条件（第 1572 行），附录 C（第 1802 行），§13（第 1521 行），没有用例。见下面 F42 |
| F43 少做没有减少并发 | 部分关闭，仍挡路 | 规则板一侧写全（`peakWorkerCap`、`stateFor`，第 961–994 行；第 336、349、602 行；验收第 16 条）。执行在 M7，§10.7 没有写给 M7，M7 0.3 写的是不加高峰逻辑。见下面 F43 |
| F44 新手引导 | Closed | `peakModeIntro`（第 992、1134–1137 行）、规则页一句（第 1113 行）、验收第 20 条（第 124 行）。plain-ui 0.6 §6.4 第 4 块同样讲了三档、默认少做与两种改法；两边的字不是一份，记为 F60（不挡路） |
| F45 GLM 包提醒叫模型不要推迟 | Closed | 按编排方裁定改：原文与各档措辞归 GLM 包（第 315、326 行），规则板那一行不引用它（第 612 行），`rules-peak` 钉住（验收第 23 条）；M6 0.3 已把末句改为不叫推迟（m6/design.md:115、225）。§10.6、§16 R4 与裁定相抵，记为 F58 |
| F46 表格卡 | 部分关闭，仍挡路 | 规则板一侧改成聊天（第 1178、1184–1188、1203–1224 行，验收第 7 条第 111 行，第 1492 行拒卡片字段）。M3 附录 0.3 没有这条路要的 `attach` 等三样，§10.7 也没写给 M3；0.5 的反向顺序还留在 §11.2、§13、§14。见下面 F46 |
| F47 goal 引用少 `id` | Closed | 第 509–510 行用 `{id: view.id, revision: view.revision}`，`pausedGoal` 记 `pause` 返回视图的两样；对 goal:760–765、goal-round-driver:44–47 核对过 |
| F48 语言文件 | Unchanged（一半） | 依据到 `c2532e6`，写明 `6134c83` 的要求（第 26 行）；§16 R4（第 1579 行）仍没有 `packages/hourness/locale/rules/` |
| F49 ZCode 3.17.1 的描述 | Unchanged | 第 1382 行原样 |
| F50 没引 `d-defaults-readonly` | Closed | 文首节点（第 5 行）、第 318、507、1106 行；第 507 行引的 §18 条目没写，并入 F55 |
| F51 门的来源 | Closed | `CatalogEntry.lists`（第 744 行）、门一组（第 1110 行）、验收第 21 条 |
| F52 `HealthRow` 没有 `rules` | Unchanged | §16 R1（第 1576 行）原样 |
| F53 R1 的 `openrouter` 用例 | Unchanged | 第 1553 行原样 |
| F54 没有计价服务也给高峰一行 | Closed | 第 305、612 行；验收第 15、18 条 |

## 对人定方向与编排方裁定的核对

| 方向 | 结论 |
| --- | --- |
| `d-peak-mode`：默认少做 | 部分满足：§3.6、§6.4、§7.2、验收第 15 条已是少做；§19 仍把它当待定的题、推荐无影响（F42） |
| `d-peak-mode`：少做是少开并行的 worker、不做重活 | 规则板一侧满足；执行方 M7 没收到要求（F43）；少做高峰挪活之后自动推进会停住（F59） |
| `d-peak-mode`：新手引导讲模式、默认少做、在哪里改 | 满足（规则页 `peakModeIntro`，plain-ui 0.6 §6.4 第 4 块）；两处字不是一份（F60，不挡路） |
| `d-peak-mode`：主 Agent 每步从 harness 知道是否高峰与档位 | 满足（第 602–612 行；出厂默认不写「set by the human」；没有计价服务不写） |
| `d-defaults-readonly`：插件带来的只能看，档位例外 | 满足（第 318、507、1106 行，§9.2 没有改默认条目的子命令）；插件名写法与 plain-ui 不一（F65，不挡路） |
| `d-rules-visible`：合入前检查清单与必须全审清单作为门显示 | 满足（第 1110 行，`CatalogEntry.lists`，验收第 21 条；M7 的 `execute:trunk-advance-checked` 确实两张都核对，m7/design.md:17、47）；没有用例（F57） |
| `d-chat-not-cards`：问人是对话，经 `propose_to_human`、`record_human_answer` | 规则板一侧满足；M3 附录 0.3 缺 `attach`、正文末行与拍板后的回调（F46）；§19 的编号选项（F42） |
| `d-ui-look-not-operate`：面板只看 | 满足（第 1106 行、§9.2 的表、验收第 22 条）；§11.2 与 §15 R5 还有点击与单选（F55、F57） |
| `d-auto-drive` | 不满足：少做高峰里挪开活之后，M7 的空转阻塞在高峰结束后没人解开（F59） |
| `d-main-agent-models` | 满足：规则板不选模型；上限按被派的模型数，由 M7 执行 |
| `d-main-agent-shell` | 满足（第 1347 行；没有 git 的出厂规则） |
| `d-one-main-agent` | 满足（唤醒落到派发链的根；`heldForPeak`）；循环板 0.1 没有用 `heldForPeak`（F60） |
| `d-design-onepage` | 不满足：§10.4 的方向自查缺 2026-10-30 的五条，§18 缺本版替人定的几项，放行稿据此写不全（F55）；放行稿按 §16 在评审通过后写，现在没有不算问题 |
| `metrics` | 部分满足：事件表在；`rules.check` 的规格没跟上裁定（F56） |
| 裁定：提醒原文与各档措辞归 M6，§11.4 由 M6 改写 | §3.4、§3.5 满足；§16 R4、§10.6、§10.7 相抵（F58） |
| 裁定：规则板管档位，经服务交出 | 满足（`glmHournessPeakMode`，第 961–994 行，验收第 23 条）；没有实施步骤（F57） |
| 裁定：`checkCall` 把脚本自查的判定写进指标流水 | 部分满足（F56） |

## 与兄弟设计的衔接

| 设计（读的版本） | 对得上的 | 对不上的 |
| --- | --- | --- |
| M6 0.3 | 高峰计算、`peakHours`、`nextPeakChange`；`gateOnRules` 调 `checkCall` 带 `signals` 与 `glmSpend`（m6/design.md:626）；提醒末句的改写 | M6 0.3 早于裁定：:994 仍把 §11.4 的排期一条记给规则板 R4（F58）；M6 验收第 15 条（:119）要的排队文字本稿没给（F62）；本稿不采用 M6-R5（:1013），理由与 M7 的空转规则不合（F59） |
| 循环板 0.1 | `Trigger` 子集（schedules/design.md:148–154、160）、共用 `command.ts`（§5.5）、循环板调 `checkCall`（:462） | 循环板自己读 `ProjectState.peakMode` 判不做档（:463），传 `glmSpend` 默认 `none`（:462，本稿 §12 判为用法错误）（F60） |
| plain-ui 0.6 | 板块位置、组的次序、只看与「要改」一行、换词、`PLAIN_LIMITS.background` 60（plain-ui:408、750，与第 1224 行相同） | 上手页第 4 块的字两份（plain-ui:549、557）；登记表接口改成 `subscribe` 与 `snapshot`（plain-ui:310–322），本稿第 1104 行还是 0.5 的三个方法（F60）；插件名的写法（F65） |
| M3 附录 0.3 | 提议式待决的四行、`renderProposal` 的排版、`record_human_answer` 的原话核对、否掉之后由人决定 `dropped` | `propose_to_human` 没有 `attach`、不写正文末行，`record_human_answer` 拍板后不回调规则板（m3/design-addendum.md:450–455、463、507）（F46） |
| M7 0.3 | `DISPATCH_TOOL_NAMES` 加 `dispatch_task`、代码规则目录的八道门、`heldForPeak`、`parseFloor`（m7/design.md:563） | :57「M7 不另加高峰逻辑」、:268「规则板不经服务参与」（F43）；:795 的空转阻塞（F59）；:744 把所有 `paused` 的 goal 读成人暂停的（F60） |

## 发现

### F55（HIGH）0.6 没写完：修订说明、§20 的 0.6 一条、§18 的新取舍与方向自查都缺

位置：文首第 3、45 行；§10.4（第 1338–1349 行）；§11.2（第 1431、1443、1452 行）；§18（第 1603–1638 行）；§20（第 1660–1693 行）；附录 C 之后（文件到第 1810 行为止）。

问题：

1. 附录 D 与 §20 的 0.6 一条不存在（见「0.6 是否写完整」）。F42–F54 每条怎样处理、`d-peak-mode` 的默认档、`d-defaults-readonly`、`d-rules-visible`、`d-chat-not-cards`、`d-ui-look-not-operate`、plain-ui 0.5 §11 的五条、循环板 0.1 §16 的请求与编排方对 M6 F8、F9 的裁定各改在哪里，只有文首一段概述。
2. §18 没有本版新的 agent 决定，而正文指向它：§3.6 第 349 行「（agent 定、人可推翻，§18）」的并行上限算法、第 507 行「人若认为算……（§18）」、第 345 行不采用 M6-R5。§18 现有两行与 0.6 相抵：「高峰少做管到哪」（第 1636 行）写「只管自报的脚本」，与第 336 行的并行上限相抵；「面板的位置」（第 1628 行）写「项目图页签的第五个视图」，与第 1104 行和 plain-ui 0.6 §4.7「没有第五个视图」相抵。
3. §10.4 的方向自查只有 `d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-one-main-agent` 与 `metrics`；2026-10-30 之后的 `d-peak-mode`、`d-defaults-readonly`、`d-rules-visible`、`d-chat-not-cards`、`d-ui-look-not-operate` 没有对照。第 1345 行「人要点的只有……」还是点。
4. §11.2 还是 0.5 的面板写入：第 1431 行「人点「这个会话本次高峰照常做」」，第 1443 行「点「照这条改」或「忽略」」，第 1452 行「面板写入被拒」一行。
5. 文首两处说法不实：第 3 行的 `onepage.md` 不在；第 45 行的 `graph-ops-v06.json` 不是本版的草稿。

为什么挡路：修订说明是 F42–F54 与几项人定的留痕，缺了就查不到每一处为什么这样改（`docs/DEVELOPMENT.md`:29「事后查不到原因」）。§18 与 §10.4 是一页放行稿里「替人定了哪些方向」的来源（`d-design-onepage`），缺了这几项，人放行时看不到 agent 替他定的并行上限算法、不采用 M6-R5 与单上两个操作的归类。任务也要求把截断记为挡路。

改法：把写稿那一步接着写完，已改好的节不动：

- 加附录 D「0.5 第 1 轮评审、2026-10-30 人定与编排方裁定的处理（0.6）」，格式同附录 C：F42–F54 每条一行（处理、改在哪）；人定与裁定每项一行，至少有 `d-peak-mode`（默认少做、少开并行、新手引导）、`d-defaults-readonly`、`d-rules-visible`、`d-chat-not-cards`、`d-ui-look-not-operate`、plain-ui 0.5 §11 的五条、循环板 0.1 §16、M6 第 3 轮 F8 与 F9 的裁定。附录 C 第 1802 行那一格标「已被 `d-peak-mode` 取代，见附录 D」。
- §20 加「0.6（2026-10-30）」一条，逐节写改了什么。
- §18 加四行：少做的并行上限 `max(1, floor(slots / 2))`；少做的高峰结束怎样接上挪开的活（随 F59 的结论）；放行这一次与本次高峰照常做不算开关默认条目；档位经 `glmHournessPeakMode` 交出、措辞归 GLM 包（编排方裁定）。改写「高峰少做管到哪」为「1. 只管自报的脚本：代价是少开并行全靠模型自觉。2. 脚本排队加 M7 的并行上限，挪哪件活由主 Agent 照提醒定（采用，§3.6）」；「面板的位置」改为「plain-ui 设计 §4.7 的第 2 层一页；plain-ui 合入之前是项目图面板里的一页（采用，§9.1）」。
- §10.4 加五行，例：「`d-peak-mode`：出厂少做（`effectivePeakMode`），少开并行由 M7 的派活工具执行（§3.6），主 Agent 每步知道是否高峰与档位（§6.4），新手引导一句（§9.1）」「`d-chat-not-cards`：规则提议经 `propose_to_human` 与 `record_human_answer` 到人面前，没有选项（§9.3）」；第 1345 行的「人要点的」改为「人要回话或打命令的」。
- §11.2：第 1431 行改为「人打 /rules let <单号> 或 /rules peak」；第 1443 行改为「在输入框打 /rules recovery <编号> 照改 或 /rules recovery <编号> 忽略」（与 §2.5 的说法相同）；第 1452 行整行改为「`/rules` 写入被拒 | 命令结果 | 回一行人能照着做的话（§9.2 的回话） | 命令事件」。
- 文首第 3 行删去放行稿已在的说法（放行稿按 §16 在评审通过后写）；第 45 行改为实际写下的草稿文件名，没有就写没有。

### F42（MEDIUM，0.5 起仍开）§19 还在问出厂档位，推荐无影响

位置：§19 第 1640–1658 行（推荐在第 1650 行）；§0 第 66 行；§16 开工条件第 1572 行；附录 C 第 1802 行；§13 第 1521 行；§15。

问题：0.6 把出厂档位改成了少做（见上表），可是 §19 原样是 0.5 的题：「没选之前先按「无影响」」，三个编号选项，第三项「推荐这个」。§0 第 66 行同时写「待人定（§19）：没有」，两处相反。§16 第 1572 行还写「§19 的一题与它一起问」：照做，放行时会把人已经定了的事再问一次，推荐的还是人没选的那一档。附录 C 第 1802 行「出厂暂定无影响、等人确认」没有标为被取代。§13 第 1521 行「默认规则不改变任何调用的判定」没有收窄：出厂少做时附属条目 `builtin:glm-peak-reduce` 会改变判定。§15 没有「从没设过档位」的用例。

为什么挡路：违背 `d-peak-mode`（人原话「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」，2026-10-29T17:45:14Z）；编号选项也违背 `d-chat-not-cards`。

改法：

- §19 整节换成：「没有待人定的事项。出厂档位少做由人定（`d-peak-mode`，2026-10-29T17:45:14Z），原话：「默认少做，新手教程提醒用户就行了，只挪重活对的。少做或者慢做，减少并发数量，不做重活之类的」。」后面保留 D1–D5 的状态与末段。
- §16 第 1572 行删去「§19 的一题与它一起问」。
- §13 第 1521 行改为「`builtin:glm-peak-pricing` 本身不改变任何调用的判定」；另加一行：「项目从没设过档位时按少做执行，高峰里只有带 `glmSpend: 'optional'` 的 `checkCall` 判为排队 | `effectivePeakMode` 一处定，L2 钉住 | `d-peak-mode`」。
- §15 R1 加：状态没有 `peakMode` 时 `effectivePeakMode` 给 `{level: 'reduce', origin: 'default'}`，`builtinRulesFor` 给出 `glm-peak-reduce`。R3 加：从没设过档位的项目在高峰 `check --glm-spend optional` 退出码 5（M6 0.3 验收第 15 条用的就是这一例，m6/design.md:119）。

### F43（MEDIUM，0.5 起仍开）少开并行由 M7 执行，可是没有告诉 M7，M7 0.3 写的是不加

位置：§3.6 第 336、349 行；§6.4 第 612 行；§10.7 M7 一条第 1387 行；验收第 16 条（第 120 行）；对照 m7/design.md:57、147、268、1387。

问题：规则板一侧写全了：`peakWorkerCap`、`glmHournessPeakMode.stateFor`、M7 在 `dispatch_task` 里判上限。可是 §10.7 的 M7 一条（第 1387 行）还是 0.5 的原文，没有这件事；M7 设计 0.3 写的正相反：「高峰档位的设置与执行归规则板；M7 不另加高峰逻辑」（:57），「规则板不经服务参与」（:268）。第 612 行「`slots` 读 M7 执行行服务的只读成员（§10.7）」：§10.7 与 M7 0.3 都没有这个成员，M7 的 `slots` 只是行配置（:147、:1387）。两份设计照现在的文字实现，少做的「减少并发数量」那一半没有人做。

为什么挡路：`d-peak-mode` 少做的前一半（「高峰时减少并发的 worker 数量」）落不到执行的一方，验收第 16 条后半没有人实现。

改法：§10.7 的 M7 一条加一段（其余几句保留）：

> 少做的并行上限（§3.6，`d-peak-mode`）：`dispatch_task` 在派模型为 GLM（`isGlmModel`）的子 agent 之前调 `peakModeService(ctx)?.stateFor(<主 Agent 的会话 id>)`；`peak === true && level === 'reduce'` 时，经它派出、还在跑的 GLM 子 agent（写任务、审查、检查都算）已有 `peakWorkerCap(slots)` 个就返回 `slots_full`，文字「GLM peak, reduce: at most N GLM subagents at once until HH:MM」（`until` 换成本机时区）；服务不在、`stateFor` 为 `undefined` 或 `peak` 不为真时不减。执行行的服务加只读成员 `slots(): number`，规则板的高峰一行读它；读不到时那一句不写数（§6.4）。M7 0.3 的第 57、268 行随之改写。

§16 写明：上限随 M7 的派活工具合入；验收第 16 条后半由 M7 的 L2 用例钉住（例：`slots` 3、少做、高峰、已有 1 个 GLM 子 agent 在跑，再派 GLM 子 agent 得 `slots_full`，派非 GLM 子 agent 照常；`peak` 为 `undefined` 时照常派）。

### F46（MEDIUM，0.5 起仍开）提议这条路要 M3 有三样东西，M3 附录 0.3 一样都没有

位置：§9.3 第 1185–1187 行（第 1185 行写「§10.7 对 M3 的要求」）；§10.7 M3 一条第 1389 行；§12 第 1493 行；§16 R4 第 1579 行；§13 第 1533 行；§11.2 第 1421、1422 行；§14 第 1545 行；§16 R3 第 1578 行；验收第 7 条（第 111 行）；对照 m3/design-addendum.md:450–455、463、473、507。

问题：

1. 规则板一侧已经改成聊天，但它要 M3 做三件事，M3 附录 0.3 都没有：`propose_to_human` 的 `attach` 参数（M3 的参数表 :450–455 没有它，:463「不收别的字段」，所以带 `attach` 的调用会被拒为 `invalid`）；把 `proposalLine(id)` 写进待决正文的末行（M3 的提议式待决只写题目与四行，§3.3、§3.4 都不写正文）；`record_human_answer` 拍板成功后调 `acceptProposal`（:507 那一行只写 `decide`）。第 1185 行说这是「§10.7 对 M3 的要求」，§10.7 的 M3 一条（第 1389 行）还是 0.5 时对 M3 附录 0.2 的那句（`PLAIN_QUESTION_GUIDE`），没有这三样；§16 R4 只改 `/graph-apply` 与 `graph_decide`，不碰 `src/design/propose.ts`、`src/design/record.ts`。
2. 0.5 的反向顺序（先提待决、成功才记提议）还留在几处：§13 第 1533 行的不变量「提议先有图上的待决，再有规则板的提议；待决被拒时没有提议」；§11.2 第 1421 行（`rules_propose` 提的待决被图引擎拒绝）与第 1422 行（待决已提出，记提议时取不到锁）；§14 第 1545 行与 §16 R3 第 1578 行的 `proposalQuestion`；§15 R3、R4 的卡片用例（见 F57）。

为什么挡路：验收第 7 条照两份设计现在的文字做不出来。主 Agent 带 `attach` 调 `propose_to_human` 会被 M3 拒绝；不带，就没有东西把那张待决连回规则板的提议，人同意之后规则不会生效。`d-chat-not-cards` 这条路在规则板上断了。

改法：

- §10.7 加一条给 M3 附录下一稿（第 6 步）的要求，写全：
  - `propose_to_human` 加可选参数 `attach?: string`，只配 `kind: 'question'`，格式 `^rules:p-[0-9a-f]{8}$`。提议之前调 `rulesService(ctx)?.attachable({cwd, proposal})`：服务不在时拒绝（`invalid`，`field: 'attach'`，`hint`「the rules board is not loaded: tell the human the proposal and that they can type /rules accept <id>」）；`ok: false` 时同样拒绝，`hint` 带它的 `message`。新提时待决的 `body` 为 `proposalLine(id)`；改同一张待决（`question` 加新的 `attach`）时把 `body` 换成新的一行。
  - `record_human_answer` 的 `question`、`agree` 拍板成功之后，`proposalIdOf(body)` 有值就调 `rulesService(ctx)?.acceptProposal({questionId, graphDir, cwd, by: {actor: 'llm', relay}})`，把 §9.3 结果表的那一行接在 `message` 末尾；服务不在时不写，由 §9.3 第 5 条每 60 秒的对照补写。
  - 退路：M3 只做了前一条时，规则仍由对照在 60 秒内补写生效；前一条也没有时，R4 的提议部分不开工。§16 的开工条件加「M3 第 6 步带 `attach` 已合入」。
- §13 第 1533 行改为：「提议先记在规则板（`open`），再由主 Agent 交给人；7 天里没有待决指向它就 `expired` | `src/rules/proposal.ts` 与 §9.3 第 5 条的对照 | 没有人看过的提议不会生效」。
- §11.2 第 1421、1422 行换成两行：「`propose_to_human` 带 `attach` 被 M3 拒绝（提议不是 `open` 或规则板不在）| M3 的工具结果 | 主 Agent 照 `hint` 重提，或把提议说给人、人打 `/rules accept` | 会话日志」；「`rules_propose` 记提议时 `busy`、`io` | 工具结果 | 什么都没记，主 Agent 重试一次，仍失败就告诉人 | 告警；行健康 degraded」。
- §14、§16 R3 删去 `proposalQuestion`；R3 的 `src/rules/proposal.ts` 写成：`rules_propose` 的校验、`describe` 与 `cautions` 的生成、`attachable`、`proposalLine`、`proposalIdOf`。

### F56（MEDIUM）`checkCall` 写判定事件的裁定只写进了摘要与验收，接口与不变量没跟上

位置：§3.5 第 327 行；§9.4 `CheckOptions`（第 1257–1271 行）与第 1314 行；§10.5 `rules.check` 一行（第 1375 行）；§12 第 1505 行；§13 第 1538 行；§15 R3；验收第 13 条（第 117 行）；对照 m6/design.md:899。

问题：编排方裁定（M6 第 3 轮 F9）让 `checkCall` 成为脚本自查判定的唯一记录者，M6 0.3 的留痕表就靠它（:899「规则 id、档位来源、时刻、`glmSpend`」）。0.6 只在 §3.5、§12 与验收第 13 条写了：

1. §3.5 与 §12 说 `gateOnRules` 经 `CheckOptions.waitedMs` 交等了多久，§9.4 的 `CheckOptions` 没有这个字段。
2. §9.4 第 1314 行「`check` 与 `show` 不取锁、不写任何文件」与 §13 第 1538 行「`check.ts` 只导入读路径」，与验收第 13 条「每一次判定……追加恰好一条 `rules.check`」相抵；写指标算不算写文件、`check.ts` 能不能导入 `metrics.ts`，没有写。
3. §10.5 第 1375 行 `rules.check` 的内容只有「执行方式、读不出的信号名、`glm-peak` 的来源、`glmSpend`」，没有命中的规则 id、档位与它的来源、退出码、`waitedMs`；M6 要的「规则 id、档位来源」不在里面。
4. 在 DSH 之外（命令行、M6 的脚本）`emitMetric` 写到哪、怎样找到项目，没有写；§15 R3 没有用例。

为什么挡路：裁定之后 M6 不再写判定事件。这里不补，脚本被档位或人设规则推迟、拦下的事实，除了那次运行的标准错误就查不到（`docs/DEVELOPMENT.md`:29「事后查不到原因」）。

改法：

- `CheckOptions` 加：

  ```ts
  /** gateOnRules 的 --wait：从第一次判定起等了多久（毫秒）；只进 rules.check，不改判定 */
  readonly waitedMs?: number
  ```

- 第 1314 行改为：「只读规则板：`check` 与 `show` 不取锁，不写规则板的任何文件（状态、流水、锁、心跳、`hits.json`、`recovered`）。`check` 每判一次调一次 `emitMetric`（`rules.check`）；写入口不在或写失败时什么都不写，判定与退出码不变」。第 1538 行的不变量同样改，所在层写「`check.ts` 不导入 `engine.ts` 的 `apply` 与 `lock.ts`，只多导入 `metrics.ts` 的 `emitMetric`」。
- §10.5 `rules.check` 的内容改为 `{effect, exitCode, rules: [<规则 id>], peakMode: {level, origin}, glmSpend?, glmPeakSource, unknownSignals: [<信号名>], waitedMs?, caller: 'cli' | 'library'}`，不带命令原文与参数（命令里可能有密钥）。
- `src/rules/metrics.ts` 写明两种出口：宿主里经指标流水的服务；DSH 之外按 `userDataHome()` 与 §7.3 的项目键找到指标流水的写入口（形状由指标流水的设计定），到位之前什么都不做。
- §15 R3 加：注入的出口对每次 `checkCall` 恰好收到一条，带 `waitedMs` 时原样带上；出口抛错时判定与退出码不变、告警一次；`check` 前后规则板目录的文件列表与内容不变。

### F57（MEDIUM）验证计划与实施步骤还是 0.5 的：用了删掉的命令，新验收没有用例

位置：§14 第 1545 行；§15 R1–R6（第 1553–1558 行）；§16 R1、R3、R4、R5（第 1576–1580 行）；对照 §9.2 第 1141 行。

问题：

1. 用了 0.6 删掉的东西。L3 场景 `glm-rules`、`rules-peak-stop`、`rules-detector` 都「经 `/rules-apply` 处理函数以人的身份」改开关、档位、检测器（第 1556、1558 行），§9.2 第 1141 行已删 `/rules-apply` 并写明探针改取 `/rules` 的处理函数。R4 的用例「`/rules-apply` 身份为人」「`rules_propose` 先提待决、成功之后才记提议」「`/graph-apply` 以人拍 `set`、拍 `skip`」（第 1556 行）；R3 的用例 `proposalQuestion`、缺 `crux`、`skip`、`set`、`label` 不超过 20 个码点、`background` 150 个码点（第 1555 行）；R5 的用例「恢复一节的条目与按钮」「高峰模式三个单选的选中」「按钮的文字」（第 1557 行），与验收第 22 条相反。§16 R4 仍要注册 `/rules-apply`（第 1579 行）。
2. 0.6 新加或改写的验收没有用例：第 15 条的「从没设过」（F42）；第 16 条后半（F43）；第 20 条（`peakModeIntro` 有无 `peakHours`、`plainWordsIn` 为空）；第 21 条（门一组从图读，两个节点缺一、都没有、M7 没合入时的说法，「harness 还认不出这一条」）；第 22 条（`ui/src/rules/` 不含 `commands.execute`）；第 23 条（`stateFor` 的契约；`rules-peak` 里没有 `keep working`、`postpone` 与 `PEAK_REMINDER_TEXT` 的任一句）；第 13 条的 `rules.check`（F56）。
3. §16 没有一步建 `src/shared/peak-mode.ts`（`PeakLevel`、`PEAK_MODE_SERVICE`、`peakModeService`、`peakWorkerCap`、`peakModeIntro`、`PEAK_LEVEL_WORDS`），也没有一步 `ctx.provide` 这个服务；R1 的 `model.ts` 却要从它导入 `PeakLevel`（第 698 行）。R5 没有门一组，也没写它对 M7 `src/execute/floor.ts` 的依赖。

为什么挡路：验收第 15、16、20–23 条没有任何检查钉住，验收没有满足的途径；三个 L3 场景按现在的写法跑不起来。

改法：

- L3 场景里以人的身份写入一律取 `/rules` 的处理函数：`/rules off <开关>`、`/rules peak 无影响`、`/rules detector <id> 生效`。R4 的「`/rules-apply` 身份为人」改为「`/rules` 身份为人，模型发不出」。§16 R4 删去 `/rules-apply`。
- R3 删去卡片用例，换成：每种 `kind` 的 `body` 校验；卡片字段按未知字段 `invalid`，`hint` 指向 `propose_to_human`；`describe` 与 `cautions` 的生成；`peak-mode` 与当前档位相同时 `invalid`；`rules_propose` 不写图；`attachable` 对 `open`、`via: 'graph'` 的提议为 `ok`，其余写原因。
- R4 的提议用例换成：`rules_propose` → 带 `attach` 的 `propose_to_human` → `record_human_answer`（`agree`）之后规则生效、`origin.relay` 是原话；`add`、`reject` 之后提议仍 `open`；待决 `dropped` 之后对照转 `rejected`；规则行不在时拍的板 60 秒内补写；M3 第 6 步没合入时这组跳过并写明原因。另加 `stateFor` 的契约（会话没有 `cwd` 为 `undefined`；从没设过为 `{level: 'reduce', origin: 'default'}`；没有计价服务时 `peak` 为 `undefined`；不抛错）与规则行卸载后服务消失。L3 `rules-peak` 加：规则板的每步提醒不含 `keep working`、`postpone` 与 `PEAK_REMINDER_TEXT` 的任一句。
- R5 换成：`ui/src/rules/` 下的源码不含 `commands.execute`（静态检查）；门一组用四种图夹具（两个节点齐全、缺一个、都没有、M7 没合入）；`norm-review-floor` 没有判定写法的条目旁有「harness 还认不出这一条，暂不强制」；`peakModeIntro` 有无 `peakHours.zh` 两种，`plainWordsIn` 为空；`homeLine`、`guideLine` 的几种值。
- R1 加 `src/shared/peak-mode.ts` 与单测（`peakWorkerCap` 对 0、1、2、3、4、6、`NaN` 给 1、1、1、1、2、3、1；`peakModeIntro` 两种）。R4 加 `ctx.provide(PEAK_MODE_SERVICE, …)` 与卸载时撤回。R5 写明门一组导入 M7 的 `parseFloor`，M7 没合入时只显示第 1110 行那句退路文字、不导入。

### F58（MEDIUM）§16、§10.6、§10.7 与编排方裁定相抵：规则板仍要改 §11.4，仍说 GLM 包不用改

位置：§16 R4 第 1579 行；§10.6 第 1382 行；§10.7 M6 一条第 1386 行；对照 §3.4 第 312 行、§3.5 第 326 行与 m6/design.md:994。

问题：裁定把高峰提醒原文、各档措辞与 `docs/ORCHESTRATION.md` §11.4 整节交给 M6，规则板只交档位。§3.4、§3.5 照此写了（第 326 行「规则板的任何一步都不改这些行」），但：

1. §16 R4 的文档改动仍有「§11.4 加一句「规则板把峰谷定价列为默认规则，告诉模型的仍是这条提醒」」。
2. §10.6「高峰模式不要 GLM 包改任何东西：档位与执行都在编排层包，读的仍只是 `peak(atMs)`」：裁定之后 GLM 包要读 `glmHournessPeakMode` 选措辞（验收第 23 条）。
3. §10.7 给 M6 的一条没有写 M6 要读 `stateFor`，也没有写 §11.4 整节归 M6；M6 0.3 的文档表还把第 1076 行的排期一条记为「规则板 R4 按高峰模式整条重写」（:994）。两份设计各照自己的文字做，规则板 R4 与 M6 R1 都会改 §11.4，第 1076 行谁改两边说法相反。

为什么挡路：违背任务要核对的编排方裁定，并留下两个包同改一节文档的冲突。

改法：

- §16 R4 的 `ORCHESTRATION.md` 改动只留「新增规则板一节、§6.4 规矩清单」；规则板一节里写一句「高峰提醒的原文与各档措辞见 §11.4（GLM 通道包）」，不进 §11.4。
- §10.6 那一句改为：「高峰模式要 GLM 包做一件事：高峰提醒按 `glmHournessPeakMode.stateFor(sessionId)` 的 `level` 与 `origin` 选措辞，措辞与 `docs/ORCHESTRATION.md` §11.4 归 M6（编排方裁定，2026-10-30）；读不到时照今天的原文。」
- §10.7 的 M6 一条加两句：「每次要发提醒时读一次 `stateFor`，不缓存（契约见 §7.2）」；「§11.4 整节（含第 1074、1076 行）由 M6 的 R1 改写，M6 0.3 文档表第 994 行那一格改为 M6 自己的步」。

### F59（MEDIUM）少做高峰里挪开活之后，主 Agent 的自动推进停住，高峰结束也没人接上

位置：§3.6 第 345 行；§10.4 第 1345 行；对照 m7/design.md:744、746、795、1022，m6/design.md:726、1013，dsh-tool-goal/lib/index.js:349、352，dsh-goal/lib/index.js:686–698。

问题：§3.6 不采用 M6-R5（少做的高峰结束时叫醒空闲的主 Agent），理由是主 Agent 下一步会读到「not now … Work moved out of peak can run now」，「它空闲时多半在等人」。按 M7 0.3 的自动推进，放行之后主 Agent 在 goal 里推进，不是在等人：少做档里它照提醒把剩下的大评审、练习题挪到 18 点之后，手上没有别的活时，目标轮连续 3 轮没有派发、交回、检查或主干前进，M7 就 `goals.block(…, {code: 'hourness-idle-rounds'})`，让主 Agent 去跟人说，人说「继续」才恢复（:795）。被阻塞的 goal 只有在有人输入的回合里模型才能恢复（dsh-tool-goal:349）。18 点之后没有哪一方会动它，挪开的活一直停着。出厂就是少做，所以每个工作日的高峰都可能这样。§10.4 第 1345 行「推进不因规则板停在等人」因此不成立。

为什么挡路：违背 `d-auto-drive`（放行之后主 Agent 自己推进到底，只在必须问人时停下）；高峰挪活不是必须问人的事。

改法（取一种，写进 §3.6、§10.7 的 M7 一条与 §18；推荐第一种）：

1. 推荐：M7 的空转判定在 `stateFor(主 Agent).peak === true && level === 'reduce'` 时改用原因码 `hourness-peak-moved`，不叫主 Agent 去问人。规则板在每段少做高峰结束时（拥有者每 5 秒的重判里看到 `peak` 由真变假），对本宿主上这个项目的主 Agent（M3 的 `mainAgentOf`），若它的 goal 为 `blocked`、原因码是 `hourness-peak-moved`，调 `goals.resume(agent, {id, revision})`（服务层的 `resume` 认 `blocked`，不查人的授权，goal:690–698、m7:1022；M7 自己对 `hourness-waiting-human` 也是这样恢复的，m7:746），再按 §6.3 选 `inject` 或 `followup` 发一句「[rules board] GLM peak hours are over. Work you moved out of peak can run now.」，记一条 `rules.peak-mode`（高峰结束）带恢复的会话数。
2. 只叫醒、不恢复（M6-R5 原样）：不够，被阻塞的 goal 要人的输入才能由模型恢复（dsh-tool-goal:349）。
3. 主 Agent 没有别的活时自己暂停 goal：模型不能恢复暂停的 goal（dsh-tool-goal:352），一样停住。

### F48（LOW，0.5 起未改）R4 没有这一行的语言文件

位置：§16 R4 第 1579 行；文首第 26 行。问题与改法同 0.5：文首已写明 `6134c83` 之后每个宿主行要有 `<包目录>/locale/<row>/en.json` 与 `zh.json`，R4 的文件清单里没有 `packages/hourness/locale/rules/`。preflight 会挡住，所以查得到。

### F49（LOW，0.5 起未改）§10.6 对 ZCode 3.17.1 的描述与位置号

位置：§10.6 第 1382 行。问题与改法同 0.5（`OffPeakCreate` 与 `off-peak` 账号模式说的是服务端空闲算力，与峰谷计价无关；`@554187`、`@12791216` 改为搜索串或注明字符位置）。

### F52（LOW，0.5 起未改）R1 的目录用了 `HealthRow` 里还没有的 `rules`

位置：§16 R1 第 1576 行；`src/shared/health.ts`:26（`HOURNESS_ROWS` 今天是 `data`、`guard`、`memory`、`workflow`、`hourness`、`graph`、`graph-panel`）。问题与改法同 0.5：R1 就把 `rules` 加进 `HOURNESS_ROWS`。

### F53（LOW，0.5 起未改）R1 的 `openrouter/z-ai/glm-4.6` 用例与 §2.3 相反

位置：§15 R1 第 1553 行。问题与改法同 0.5：用例改为「provider `openrouter`、model `z-ai/glm-4.6` 不命中 `*/glm*`，与 `isGlmModel` 相同；`*/z-ai/glm*` 命中」。

### F60（LOW）§10.7 少了几条不挡路的对外请求，还留着 0.5 的单选

位置：§3.6 第 350 行；§9.1 第 1104、1137 行；§10.7 plain-ui 一条第 1388 行；验收第 20 条；对照 plain-ui:310–322、549、557，schedules/design.md:462、463，m7/design.md:744。

问题：

- plain-ui：第 1137 行与验收第 20 条要上手页第 4 块调用 `peakModeIntro`，§10.7 没写。plain-ui 0.6 §6.4 第 4 块（:549）是自己的固定字，与 `peakModeIntro`（第 1134 行）不同（没有时段；「高峰时少派活」对「少开几个并行的活」），:557 写「第 4、5 块的文字固定在本稿」。两处都讲了三档、默认少做与两种改法，`d-peak-mode` 满足；只是验收第 20 条的「同一句」两边都做不到，L2 会查出来。plain-ui 0.6 §4.7 把板块登记表改成 `subscribe` 加 `snapshot`（返回 `{available, homeLine, guideLine}`），第 1104 行还是 0.5 的 `available(sessionId)` 等三个方法。第 1388 行「默认规则一组多了高峰模式的三个单选」「上手页第 4 块可以加半句」与 §9.1、验收第 22 条相反。
- 循环板：第 350 行说「§10.7 请它改读这个成员，不再自己读状态文件」，§10.7 没有循环板一条；循环板 0.1 §5.8 第 2 条（:463）自己读 `ProjectState.peakMode` 与计价服务判不做档。第 1 条（:462）给 `checkCall` 传 `glmSpend` 默认 `none`，按本稿第 1504 行是用法错误，循环板会把每次运行记成 `rules-unavailable` 照跑。
- M7：M7 0.3 §3.9.1 把所有 `paused` 的 goal 读成人暂停的（:744，提醒写「The person paused the drive」），不做档里规则板暂停的 goal 也会这样告诉主 Agent。

改法：§10.7 的 plain-ui 一条改写为「上手页第 4 块的高峰模式那几句改为 `peakModeIntro(peakHours?.zh)`，plain-ui :557 随之改；登记表按 plain-ui §4.7 的 `subscribe`、`snapshot` 实现」，删去单选与「可以加半句」；第 1104 行改用 `BoardState` 的写法。（另一种：放弃一处定字，验收第 20 条改为「两处都写明三档、默认少做与两种改法」。）加循环板一条：「不做档的判断改读 `peakModeService(ctx)?.stateFor(<主 Agent 会话>)`（`peak === true && level === 'stop'`）或 `rulesService(ctx)?.heldForPeak`；不自报时不传 `glmSpend`」。M7 一条加：「`heldForPeak(<主 Agent 会话>)` 为真时，那一句改为『Paused for GLM peak (the human chose stop); the harness resumes it when peak ends.』」。

### F61（LOW）§12 检测器触发的校验还是作废的写法

位置：§12 第 1485、1486 行；对照 §5.2 第 391 行。

问题：校验仍是 `interval`、`schedule`（`HH:MM` 列表、`days`、`tz` 为 `local` 或 `±HH:MM`）、`file.path`（绝对路径或相对项目根）。§5.2 已改为循环板 `Trigger` 的子集（`every`、`daily`、`weekly` 用 IANA 时区，`file-changed` 的 `filter.path` 为绝对路径），并写明三个旧名字作废。照 §12 校验会收 §5.2 不认的写法；检测器出错只让信号读作未知，查得到，不挡路。

改法：两行换成：`every.seconds` 整数，至少 60；`daily.time`、`weekly.time` 为 `HH:MM`，`timeZone` 是 `Intl.DateTimeFormat` 认得的 IANA 时区名，`weekly.weekdays` 为 1–7 的非空、不重复数组；`event` 只认 `file-changed`，`filter.path` 为绝对路径，是普通文件或尚不存在；`ttlMs` 至少两倍 `every` 间隔，`daily`、`weekly`、`file-changed` 至少 2 分钟，至多 7 天；`once`、`cron` 与其余事件 `invalid`，写「检测器只用 every、daily、weekly 与 file-changed」。

### F62（LOW）脚本命中两条附属条目时的文字没有写

位置：§6.4；§9.4 第 1312 行（「文字」一段）；对照 m6/design.md:119。

问题：§9.4 说命令行的文字是「门的文字」换两句。`builtin:glm-peak-reduce` 只在 `checkCall` 里命中，门里从不命中，没有门的文字可换；`builtin:glm-peak-stop` 的门文字是写给 GLM 会话的（「Write one line on where you stopped … resumes your goal」，第 588 行），不适合脚本。M6 0.3 验收第 15 条要标准错误里有条目 id、档位的来源与「18:00」。

改法：§6.4 加脚本一段：

```text
You tried to run "npm run calibrate".
Boundary: Would be deferred; the command line opens no ticket. GLM peak hours now until 18:00 (weekdays 14:00-18:00 UTC+8). Peak mode: reduce (the default; the human can change it). Rule builtin:glm-peak-reduce defers scripts that report optional GLM spending until peak ends.
Right path: Run it again after 18:00.
Exception: The human can change the peak mode (/rules peak).
```

人设过档位时第二段写 `Peak mode set by the human: reduce.`；不做档写 `Peak mode set by the human: stop. Rule builtin:glm-peak-stop defers scripts that report GLM spending until peak ends.`。

### F63（LOW）恢复失败时叫 agent「自己 resume」，rc.3 里模型做不到

位置：§6.3 第 510 行；§6.4 第 600 行；§11.2 第 1429 行；对照 dsh-tool-goal/lib/index.js:349、352。

问题：恢复失败的唤醒写「Ask the human, or resume it yourself.」。`update_goal resume` 先要本回合有人的输入（:349 `requireDirectHuman`），对 `paused` 的 goal 直接抛 `GOAL_TOOL_RESUME_PAUSED`（:352「the model cannot resume a paused goal; the user must resume it」）。agent 照做只会再失败一次。有降级与告警，不挡路。

改法：文字改为「Your goal could not be resumed: <原因前 80 字符>. Tell the human; they can resume it from the goal bar or with /goal resume.」，§6.3 第 510 行与 §11.2 第 1429 行同样改。

### F64（LOW）还没交给人的提议，规则页也写「在主 Agent 的对话里等你回话」

位置：§9.1 第 1122 行；§7.2 第 885 行。

问题：0.6 的顺序是先记提议、再交给人。主 Agent 记了却没调 `propose_to_human`（或子 agent 提了、主 Agent 没转）时，`via: 'graph'`、`open` 的提议在规则页上照样写「在主 Agent 的对话里等你回话」，人读到一件从没见过的事在等他，直到 7 天后 `expired`。

改法：§9.3 第 5 条的对照顺带记下有没有待决的正文末行指向它；有就写「在主 Agent 的对话里等你回话」，没有就写「主 Agent 还没交给你」。

### F65（LOW）默认规则写成「GLM 通道包带来的」

位置：验收第 1 条（第 105 行）；§9.1 第 1111 行；§7.2 `CatalogEntry.plugin`（第 746 行）；对照 plain-ui §4.7（plain-ui:333）、m6/design.md:724。

问题：默认规则与两条附属条目定义在编排层包的规则行（`src/rules/builtin.ts`）：只装 GLM 包时不存在，只装编排层包时照常列出。页上却写「GLM 通道包带来的 · 只能看」。plain-ui 要用插件管理器里的名字（「项目编排」「GLM 通道」）；`builtin:*`、`rules:*` 的 `plugin` 取什么没写。

改法：`builtin:*`、`rules:*` 的 `plugin` 为 `dsh-hourness`；默认规则一组写「项目编排带来的 · 只能看；高峰时段来自 GLM 通道」（与 M6 0.3 §8.3 的来源写法一致），「档位例外」一句照旧；验收第 1 条随之改。

### F66（LOW）不做档的高峰里，对话改档位这条路走不通

位置：验收第 15 条（第 119 行）；§3.6 不做一行（第 337 行）。

问题：不做档的高峰里，GLM 主 Agent 除 `RULES_TOOL_NAMES` 之外的工具调用都排队，`propose_to_human` 与 `record_human_answer` 也在内，人这时在对话里说「改成无影响」，主 Agent 记不下来，只能 `/rules peak`。排队文字已经让 agent 把 `/rules peak` 与 `/rules let` 告诉人，所以人有路；但验收第 15 条写两条路都能改。

改法：验收第 15 条加一句「不做档的高峰里，GLM 主 Agent 的对话一路要等高峰过去；这时改档位用 /rules peak，排队文字写明」。（另一种：把指向规则板提议的 `propose_to_human`、`record_human_answer` 排除在 `builtin:glm-peak-stop` 之外，要多一个判定，不推荐。）

### F67（LOW）规则行在不做档的高峰里卸载，被它暂停的 goal 一直停着

位置：§11.2 第 1451 行；§6.3 第 512 行；对照 m7/design.md:744。

问题：这一行写卸载时「没有进程级的副作用要恢复」，但不做档里规则行暂停过 goal。高峰中禁用或卸载规则行，被暂停的 goal 一直停着：心跳删掉之后单被别的写入按 `host-gone` 过期；接手只在 `agent/created` 上做，同一进程里重新启用规则行不重扫；M7 把这个 goal 读成人暂停的。人能 `/goal resume`，规则页列着这张单，可逆、看得到，所以不挡路，但预案没写。

改法：卸载时对本宿主上带 `pausedGoal`、没有 `resumedAt` 的不做档单逐个 `goals.resume`（规则板自己出问题时偏向放行，§11.2 总则），写 `ticket-update`（原因「规则行卸载」）；激活时对本宿主活会话的这类单做一次与 `agent/created` 相同的接手。§11.2 那一行照此改写。

## 已核实的假设

- goal：`expectCurrent` 先比 `ref.id` 再比 `revision`，不等抛 `GOAL_STALE_REVISION`（dsh-goal:760–765）；`withPhase` 让修订号加一（:811），`requireNextRevision` 核对这一点（:174，设计引的是这一行）；`get` 对不是活实例的 agent 抛错（:611–614），视图带 `id`、`revision`、`phase`（:880–888）；`pause` 只认 `active`（:676–678），返回新视图（:849–855）；`resume` 认 `active`、`paused`、`blocked`，已 armed 的 `active` 与轮次用完时抛错（:686–698）。驱动器：`goalRef` 组 `{id, revision}`（goal-round-driver:44–47）；`pause` 时只有发起者不是这个 agent 才 `cancel`（:246）。§6.3、§6.6 的这几处与源码一致（F47 关闭的依据）。
- `update_goal`：`pause`、`resume`、`edit` 要本回合有人的输入（dsh-tool-goal:49–52、62–65、343、349）；模型不能恢复暂停的 goal（:352）。用于 F59、F63。
- 依据：`git log ed073d5..c2532e6 -- src scripts packages tests ui` 恰好是文首列的六个提交；main 现在是 `436fbe7`，`c2532e6` 之后的提交只改 `docs/graph/`，碰代码的没有。
- 仓库：`PEAK_REMINDER_TEXT` 在 `src/glm-prompt/peak-reminder.ts`:28，第 5–7 行的注释如设计所引；`docs/ORCHESTRATION.md`:1074、1076 的原文如设计所引；`HOURNESS_ROWS` 在 `src/shared/health.ts`:26，没有 `rules`；guard 例外段的口径 `ASK_THE_HUMAN` 在 `src/guard/rules.ts`:56，与 §6.4 拦截文字的例外段一致。
- 图：`d-peak-mode` 正文与第二条历史（默认少做、减少并发、新手引导）；`d-defaults-readonly` 的例外（「档位当然能选。」）；`d-rules-visible`（两张清单作为门放规则板）；`d-chat-not-cards` 的批注（四行、每行一处加粗）；`m6` 2026-10-29T19:27:21Z 的裁定原文；`norm-merge-gate`、`norm-review-floor` 都是 `approved`，各有 `acceptance`；M7 的主干前进核对两张都看（m7/design.md:17、47）；`parseFloor` 在 m7/design.md:563。
- `PLAIN_LIMITS.background` 是 60（plain-ui:408、750）；M3 附录 0.3 正文写 150（m3/design-addendum.md:323），但 M3 的检查只读这个常量，以 plain-ui 为准。本稿第 1224 行写 60，与 plain-ui 一致；§9.3 的例子每行一处 2–12 码点的加粗、背景 18 个码点、其余三行不超过 40，合 M3 §3.3。
- M3 附录 0.3 的 `propose_to_human` 参数（:450–455）、「不收别的字段」（:463）、输出（:473）、`record_human_answer` 的 `question`、`agree` 只写 `decide`（:507），否掉之后由人决定 `dropped`（同表下一行）：与本稿第 1186 行的 `dropped` 说法一致；没有 `attach`（F46 的依据）。
- 循环板 0.1 的 `Trigger`（:148–154）与「一套写法两块板用」（:160）和本稿 §5.2、§7.2 的 `DetectorTrigger` 一致。

## 没有核实或不对的假设

- 不对：图上 `rules` 批注「F42–F54 的处理与人定对照都在」；文首的 `onepage.md` 已在、`graph-ops-v06.json` 是本版草稿（F55）。§19 的题与推荐（F42）。§10.7 已写给 M3、M7、循环板的要求（F43、F46、F60）。§10.6「高峰模式不要 GLM 包改任何东西」（F58）。「它空闲时多半在等人」（F59）。「resume it yourself」（F63）。规则行卸载时「没有进程级的副作用要恢复」（F67）。
- 没有核实：M7 下一稿是否接受 F43 与 F59 的改法（`slots()` 成员、`hourness-peak-moved` 原因码）；这两处需要 M7 那边的评审确认。
- 没有核实（沿用上一轮）：V12 在 `run_code` 子调用里是否成立；插件调 `goals.resume` 之后驱动器从哪一刻开下一轮；V3、V4、V11；§6.6 里 0.3 起沿用的 rc.3 行号。

## 结论

HIGH 1（F55）、MEDIUM 7（F42、F43、F46 仍开；F56、F57、F58、F59 新）、LOW 12（F48、F49、F52、F53 未改；F60–F67 新）。按规则：CHANGES_REQUESTED。

挡路的八条：0.6 没写完，附录 D、§20 的 0.6 一条、§18 的新取舍与 §10.4 的方向自查都缺（F55）；§19 还在问出厂档位并推荐无影响（F42）；少开并行要 M7 做，M7 没收到、0.3 写的是不加（F43）；提议这条路要的 `attach` 等三样 M3 附录 0.3 都没有（F46）；`checkCall` 写判定事件的裁定只进了摘要（F56）；验证计划与实施步骤还是 0.5 的（F57）；§16、§10.6、§10.7 与 §11.4 的归属裁定相抵（F58）；少做高峰挪活之后自动推进停住（F59）。F44、F45、F47、F50、F51、F54 关闭。

收敛：必须改的条数 0.5 第 1 轮 5 条，本轮 8 条，没有减少。`docs/DEVELOPMENT.md`:29 写「必须改的发现一轮没有减少，就停下交人」。8 条的来由：F55、F57 与 F42、F43、F46 余下的部分都是写稿中途停下（TLS 错误）没改到的节，改法不需要新的方向；F56、F58 来自 0.5 之后才有的编排方裁定；只有 F59 是本轮新查出的设计问题。这次截断的写稿算不算一轮、是先续写还是先交人，由编排方定。

# 0.7 第 1 轮（设计 0.7）

本节边审边写；写到一半中断时，已写下的发现有效，结论一节缺席即表示本轮没有审完。

## 本轮审了什么

- 输入：`design.md` 0.7 全文（2029 行，行号按 UTF-8 逐行计，下文「第 N 行」都指它）；`design-v0.6.md` 与它的评审 `design-review-v0.6.md`（F42、F43、F46、F48、F49、F52、F53、F55–F67）；`.agents/tasks/design-context.md` 最新几节与「Seam rulings between designs」；`onepage.md`；`docs/DEVELOPMENT.md` §1.1。
- 0.7 与 0.6 逐节比对：改过的节是文首、§0、§1.2、§1.4、§2.6、§3.3、§3.6、§5.2、§6.1、§6.3–§6.6、§7.2、§9.1、§9.4、§10.4–§10.7、§11.1、§11.2、§12–§20、附录 C；新增附录 D、E；其余与 0.6 逐字相同。
- 兄弟设计，读的版本：M6 `.agents/tasks/m6/design.md` 0.3（02:54）；循环板 `.agents/tasks/schedules/design.md` 0.3（05:27 写入，比规则板 0.7 晚 11 分钟；规则板 0.7 读的是 0.2，0.3 读的是规则板 0.7 的完稿）；plain-ui `.agents/tasks/plain-ui/design.md` 0.6；M3 附录 `.agents/tasks/m3/design-addendum.md` 0.3；M7 `.agents/tasks/m7/design.md` 0.3。
- 图节点（读 `docs/graph/nodes/` 与 `npm run -s graph -- show`）：`d-peak-mode`（含 2026-10-29T17:45:14Z 的改动）、`d-defaults-readonly`、`d-rules-visible`、`d-chat-not-cards`（含四条格式批注）、`d-one-main-agent`、`d-main-agent-models`、`d-main-agent-shell`、`d-auto-drive`、`d-design-onepage`、`metrics`。
- 宿主源码（`reference/dsh-desktop-0.2.1-rc.3/`）：0.7 新写的事实逐条读了 `dsh-tool-goal`:345–354、`dsh-goal`:172–176、609–616、669–700、758–766 与 `dsh-goal/README.md`:63、99、`dsh-goal-round-driver`:42–48、243–251、270–280；另为 F67 的改法读了 `cordis`:963–966（卸载函数不设时限）、`dsh-app-boot`:185–194（加载器停止时停掉整棵插件树）、`dsh-desktop-host`:263–267、`dsh-acp-app/README.md`:27、`dsh-agent-loop/README.md`:216。
- 仓库（main `ecdee9d`；`git log c2532e6..HEAD -- src scripts packages tests ui` 为空，依据仍成立）：`src/shared/pricing.ts`:31、`src/shared/health.ts`:26、58–62、79、`src/glm-prompt/peak-reminder.ts`:5–7、28、`src/guard/rules.ts`:56、77、131、`src/guard/graph-files.ts`:26；`reference/zcode-3.17.1/zcode.cjs` 与 `reference/zcode-3.16.3/zcode.cjs` 里 §10.6 列的串。

## 0.7 是否写完整

写完整了，没有截断：

- 文件以附录 E 末段「仍开着、要编排方看一眼的」（第 2029 行）结束，句子完整；`##`、`###` 小节齐全（§0–§20、附录 A–E）。
- 附录 D（第 1952–1986 行）：F42–F54 每条一行，2026-10-30 的人定与裁定 11 行。附录 E（第 1988–2029 行）：F42、F43、F46、F48、F49、F52、F53、F55–F67 每条一行，接缝裁定 7 行，另有「留到以后」与「仍开着」两段。
- §20 有 0.6 一条（第 1804 行，写明中断、没写到的部分）与 0.7 一条（第 1814 行，逐节）。
- 文首说的 `onepage.md` 与 `graph-ops-v07-written.json` 都在同目录。

## 0.6 第 1 轮发现的状态

| # | 状态 | 依据（`design.md` 0.7 行号） |
| --- | --- | --- |
| F55 0.6 没写完 | Closed | 附录 D、E 与 §20 两条（见上）；§18 新增十一行（第 1743–1755 行：上限的数、上限数哪些子 agent、上限在哪判、挪开的活怎样接上、档位怎样交给 GLM 包、单上两个操作不算开关条目、`peakStop`、不做档里对话改档位、卸载、判定事件谁写、命令行自查的文字等），「面板的位置」（第 1734 行）与「高峰少做管到哪」（第 1742 行）改写；§10.4 加六条方向对照（第 1403–1409 行）；§11.2 的点按钮说法改为 `/rules let`、`/rules recovery`（第 1526、1538 行），「`/rules` 的写入被拒」一行在（第 1548 行）；文首两处说法属实。残留两处「点」，记为 F70（LOW） |
| F42 §19 还在问出厂档位 | Closed | §19 第 1759 行「没有」并引人的原话；§16 开工条件（第 1675 行）「§19 没有要问人的题」；§13 第 1621、1622 行收窄并加「从没设过按少做」；附录 C 末注（第 1950 行）；§15 R1 的 `effectivePeakMode({})`、R3 的「从没设过档位的项目」两例 |
| F43 少开并行没告诉 M7 | Closed | §10.7 M7 第 1 条（第 1458 行）写明读法、`slots_full` 的文字、读不到时照原槽位，并点名 M7 0.3 第 57、268 行（已核对：m7/design.md:57「M7 不另加高峰逻辑」、:268「规则板不经服务参与」）；数改为常量 `PEAK_REDUCE_GLM_WORKERS`，只在少做档的高峰里经 `glmWorkerCap` 交出（第 345 行、§7.2）；§16 写明由 M7 的 L2 用例钉住。合编排方裁定「M7 adds this one read」 |
| F46 提议这条路缺 M3 的三样 | Closed | §10.7 M3 第 1–3 条（第 1469 行起）；§13 第 1636 行顺序反过来；§11.2 第 1516、1517 行换掉两行；§14、§16 R3 不再有 `proposalQuestion`（全文只剩修订记录与附录里的历史提法）；§16 写明 R4 等 M3 第 6 步带 `attach`。M3 附录 0.3 本身还没有 `attach`（m3/design-addendum.md 全文搜不到），这是接缝裁定交给 M3 下一稿的事，规则板以开工条件接住 |
| F56 `checkCall` 写判定事件 | Closed | `CheckOptions.waitedMs`、`peakUntil`、`caller`（第 1317 行一带）；第 1367 行「不写规则板的文件」与每次恰好一条 `rules.check`；§10.5 第 1435 行的字段；`emitMetric` 两个写者（第 1422 行）；§13、§15 R3 与 R7 的用例。另见 F75（LOW） |
| F57 验证计划还是 0.5 的 | Closed | §15 R3–R5 改写（`/rules` 的处理函数、提议一路、`peak-mode.ts`、`BoardState`、静态检查、两道门四份图样例）；§16 R1 加 `peak-mode.ts`，R4 去掉 `/rules-apply`、加 `ctx.provide` 与撤回；验收第 15、16、20–23 条各有用例 |
| F58 §11.4 的归属 | Closed | §16 R4（第 1682 行）只加规则板一节，一句指向 §11.4；§10.6 第 1444 行；§10.7 M6 第 1、2 条（M6 0.3 文档表第 994 行已核对） |
| F59 少做高峰挪活之后自动推进停住 | 部分关闭，仍挡路 | 高峰结束后的叫醒按接缝裁定交给循环板 `loops.peak-end`（§3.6 第 354 行、§10.4 第 1398 行、§18 第 1746 行）。仍开：恢复被空转阻塞的 goal 要 M7 的 `execute.resume-after-peak`，这件事裁定没给、M7 0.3 没有、规则板写成「要编排方看一眼」（第 2029 行）；高峰当中 M7 的空转规则就让主 Agent 去问人，三份设计都没处理，放行稿却写「除此之外不问」。见下面 F59 |
| F48 语言文件 | Closed | §16 R4 第 1682 行 `packages/hourness/locale/rules/en.json` 与 `zh.json` |
| F49 ZCode 3.17.1 的描述 | Closed | §10.6 第 1446 行改为搜索串与字符下标；逐个核对见「已核实的假设」 |
| F52 `HOURNESS_ROWS` 没有 `rules` | Closed | §16 R1 第 1679 行 |
| F53 `openrouter` 用例 | Closed | §15 R1 第 1656 行 |
| F60 §10.7 少了几条对外请求 | Closed | plain-ui 取第二种（两处意思一致，验收第 20 条）；登记表按 `subscribe`、`snapshot`（§9.1）；单选与半句删去；循环板 0.2/0.3 已改读服务；M7 那一条不请，理由写在附录 E。循环板 0.3 还挂着已被回绝的 `peakStop` 请求，见「与兄弟设计的衔接」 |
| F61 检测器触发的校验 | Closed | §12 第 1583 行 |
| F62 脚本命中附属条目的文字 | Closed | §6.4 第 613 行起；另见 F72（LOW） |
| F63 「resume it yourself」 | Closed | §6.4 第 611 行、§6.3、§11.2 |
| F64 没交给人的提议 | Closed | §9.1 第 1168 行，用面板已读到的图认 |
| F65 「GLM 通道包带来的」 | Closed | §9.1 第 1157 行、§7.2 `CatalogEntry.plugin`、验收第 1 条 |
| F66 不做档里对话改档位 | Closed | 验收第 15 条（第 128 行）、§11.2、§18 |
| F67 卸载时被暂停的 goal | Closed | §6.3 第 522、523 行，§11.2，§15 R4；改法引出的宿主退出一路见 F71（LOW） |

## 对人定方向与编排方裁定的核对

| 方向 | 结论 |
| --- | --- |
| `d-peak-mode`：照旧提醒模型；三档；默认少做；少做是少开并行、不做重活、必要的照做；新手教程讲；主 Agent 每步知道是否高峰与档位 | 满足：`effectivePeakMode` 一处定少做（§7.2）；并行上限 1 由 M7 执行（第 345 行）；自报可挪的脚本排队；GLM 包的提醒照旧（§3.4）；`peakModeIntro` 与 plain-ui 第 4 块（plain-ui:549）；主 Agent 的高峰一行（§6.4）。人原话「默认少做……减少并发数量，不做重活之类的」（图上 2026-10-29T17:45:14Z）已核对 |
| `d-defaults-readonly`：插件带来的只能看，档位能选 | 满足（§9.1 第 1157 行、§9.2 没有作用于默认条目的子命令、§3.4）；单上两个操作的归类写进 §18 与放行稿 |
| `d-rules-visible`：会挡住动作的门在规则板上看得到 | 满足（§9.1 第 1156 行一组、`CatalogEntry.lists`、验收第 21 条）；来源一行缺 plain-ui 要的写法（F73，LOW） |
| `d-chat-not-cards`：一个方案四行，经 `propose_to_human`、`record_human_answer` | 满足（§9.3；§19 没有选项）；放行稿末尾的放行题按四行、每行一处加粗 |
| `d-ui-look-not-operate` | 满足（§9.1、§9.2 的表、验收第 22 条） |
| `d-auto-drive`：放行之后自己推进到底，只在必须问人时停 | 不满足：出厂少做的高峰里，主 Agent 把可挪的活挪开、手上没别的活时，M7 的空转规则在高峰当中就阻塞 goal 并叫主 Agent 去问人（m7/design.md:795）；高峰结束后的恢复要 M7 的 `execute.resume-after-peak`，裁定没给、M7 0.3 没有（F59） |
| `d-main-agent-models` | 满足：规则板不选模型；上限按被派的模型数，由 M7 判 |
| `d-main-agent-shell` | 满足（§10.4 第 1400 行一带；没有 git 的出厂规则） |
| `d-one-main-agent` | 满足：唤醒与转交落到派发链的根；`heldForPeak` 扩到「还没开单」 |
| `d-design-onepage` | 部分满足：四块都有（看到什么、自己做什么、什么时候问你、替你定了什么），§10.4 的方向对照补全；但「什么时候问你」一节写「除此之外不问」，漏了 F59 那种问人（F59）；用词有三处可改（F77，LOW） |
| `metrics` | 满足：事件表全，数由 harness 写；`rules.check` 由 `checkCall` 写 |
| 裁定：提醒原文与各档措辞归 M6，§11.4 由 M6 改写 | 满足（§3.4、§3.5、§10.6、§10.7、§16 R4） |
| 裁定：`checkCall` 写脚本自查的判定事件 | 满足（§9.4、§10.5、§13） |
| 裁定：少做的上限归规则板，M7 只加这一次读 | 满足（§3.6、§7.2、§10.7 M7 第 1、4 条） |
| 裁定（修订后）：少做高峰结束的叫醒是循环板上编排层的默认条目，GLM 包只给高峰变化事件与时刻计算；规则板不叫醒 agent | 实质满足：规则板不叫醒，只交 `stateFor`（§3.6、§13 第 1624 行）。文首第 29 行与附录 E 第 2022 行还引修订之前的说法「GLM 一侧带到循环板上的一条默认条目」，§3.6 第 354 行的事件名与节号是循环板 0.2 的（F68，LOW） |
| 裁定：`attach` 由 `record_human_answer` 交回提议的一方 | 满足（§9.3、§10.7 M3 第 1–4 条、§16 开工条件） |
| 裁定：背景字段与上限归 plain-ui | 满足（§9.3 只读 `PLAIN_LIMITS.background`） |
| 裁定：`/wish` 归 M3 | 满足 |

## 与兄弟设计的衔接

| 设计（读的版本） | 对得上的 | 对不上的 |
| --- | --- | --- |
| M6 0.3 | 高峰计算、`peakHours`、`nextPeakChange`；`gateOnRules` 调 `checkCall`；§11.4 与第 994 行的归属（规则板 §10.7 M6 第 2 条请 M6 改，接得住）；第 899 行的留痕交给 `rules.check` | M6 验收第 15 条（m6/design.md:119）要标准错误里有「谁在何时设的」，§6.4 第 622 行的脚本文字只有「set by the human」，没有时刻（F72，LOW）。M6 0.3 第 58、205、1084 行还写「高峰开始与结束的执行交规则板」，M6 下一稿随裁定改，规则板这边不用动 |
| 循环板 0.3（比本稿晚写、读的是本稿 0.7；05:27 首次写入，本轮审到 05:38 时还在改，行号取 05:38 的文件） | §6.9 第 1 条 `checkCall` 不带主体、条目没写 `glmSpend` 时省去（schedules/design.md:777）；§6.9 开头写明只经 `heldForPeak`、`stateFor`、`stateForProject` 读、不读规则板的文件（:775）；第 13、14 项是编排层条目（§5.2，:582）；`pluginLabel` 共用；`PEAK_REDUCE_GLM_WORKERS` 只读公共库 | 事件改名 `channel.peak-changed`、第 14 项在 §5.2（:478、501、582），本稿第 354 行还是 `loops.peak-changed` 与「循环板设计 0.2 §5.4 第 14 项」（F68）。循环板 §6.9 已按本稿 0.7 的答复改，§17「规则板 0.6」第 1 条（:1244）与 :1274 仍请 `peakStop`，本稿 §10.7 已回绝并把空当并进 `heldForPeak`；功能上对得上，循环板写完时删去即可。循环板 §17 M7 第 6 条（:1240）向 M7 请 `execute.resume-after-peak`，与「M7 只加这一次读」相抵，见 F59 |
| plain-ui 0.6 | 板块登记表 `subscribe` 加 `snapshot`（plain-ui:310–324）；`homeLine`、`guideLine` 与 §11 第 5 条一致；上手页第 4 块的字归 plain-ui，意思与 `peakModeIntro` 一致（plain-ui:549、557） | §11 第 3 条（plain-ui:763）要门一组的来源一行「项目图上的规范「<标题>」· 你批过的」，§9.1 第 1156 行没有（F73）。plain-ui 删去 `/graph-apply`（plain-ui:33、97、155），本稿 §9.3 第 1238 行的一列、§16 R4 第 1682 行与 §15 R4 仍要改它、测它（F69） |
| M3 附录 0.3 | 提议式待决的四行与排版；`record_human_answer` 的原话核对；挂在 `src/design/record.ts` 一处（循环板也挂这里）；第 3–6 步在分支上一起合入（m3/design-addendum.md:97） | `attach` 等三样还没有，接缝裁定交给 M3 下一稿；本稿以 R4 的开工条件接住，不算对不上 |
| M7 0.3 | 八道门进代码规则目录；`heldForPeak` 的退路执行者；`parseFloor`；`slots_full`；重启后对 `active` 未 arm 的 goal 照常 `resume`（m7/design.md:743） | 第 57、268 行写的是不加高峰逻辑，本稿 §10.7 请它改成读一次 `glmWorkerCap`（照裁定）。空转规则（:795）在少做高峰里会让主 Agent 去问人，三份设计都没处理（F59） |

## 发现

### F59（MEDIUM，0.6 起仍开，部分关闭）出厂少做的高峰里，主 Agent 挪完活就被空转规则叫去问人；高峰后的恢复靠一个没人答应的动作；放行稿写「除此之外不问」

位置：§3.6 第 354 行；§6.4 第 627 行（少做一行）；§10.4 第 1398 行；§10.7 M7 第 4 条（第 1462 行）；§18 第 1746 行；§1.5 第 143 行；附录 E 第 2029 行；`onepage.md`「会自己发生的事」「什么时候问你」。对照 m7/design.md:795、743，schedules/design.md §6.9 第 4 条（:792）与 §17 M7 第 6 条（:1240），`.agents/tasks/design-context.md`「Seam rulings between designs」第 3、4 条，dsh-tool-goal:349。

问题：

1. 0.7 按裁定把「高峰结束时叫醒」交给循环板，这一半对了。0.6 评审 F59 说的另一半没有人接：少做档的高峰里，主 Agent 照每步提醒把练习题、对照实验、大的评审挪到 18 点之后（第 627 行），手上没有别的活时，M7 的空转判定在 3 个目标轮之后 `goals.block(…, {code: 'hourness-idle-rounds'})`，并「提醒主 Agent 在对话里说明；人说继续，主 Agent `update_goal resume`」（m7:795）。所以人在高峰当中（例如 15:00）就会收到一条「没事可做，要继续吗」；人回「继续」，主 Agent 再空转 3 轮、再被阻塞、再来问。出厂默认就是少做，每个工作日的高峰都可能这样，而这不是必须问人的事。
2. 高峰之后：循环板的 `loops.peak-end` 只有在 M7 交了 `execute.resume-after-peak` 时才恢复被空转阻塞的 goal，否则让主 Agent 告诉人、等人说继续（schedules §6.9 第 4 条的表）。这个动作要 M7 判断「阻塞是否发生在这一段高峰之内」，按裁定第 3 条「M7 adds this one read; it adds no other peak logic」它不该有，M7 0.3 也没有。附录 E 第 2029 行把它列为「要编排方看一眼」，同时说「规则板这边不依赖它」；可是 §10.4 第 1398 行对 `d-auto-drive` 的自查正是靠它成立的。
3. 每段空转的 3 个目标轮，主 Agent 是 GLM 时都按高峰全价计积分，正是少做要省的。
4. 放行稿「什么时候问你」写「除此之外不问」，「会自己发生的事」写「少做的高峰结束时，主 Agent 闲着，循环板叫醒它一次，接上挪开的活」，都没有这种问人，人会照这一页放行。§1.5 第 143 行「日常没有新的点击或回话（`d-plan-approval`）」在出厂档位下同样不成立。

为什么挡路：违背 `d-auto-drive`（放行之后主 Agent 自己推进到底，只在必须问人时停下）；放行稿的「什么时候问你」因此写错（`d-design-onepage`：模块设计违背方向清单即挡路）。

改法（这是 M7、循环板、规则板三方的接缝，要编排方定；推荐 1，规则板这边先照实写 3）：

1. 推荐：规则板在 `PeakModeState`（§7.2）加一项，与 `glmWorkerCap` 同样由规则板算好、M7 只读：

   ```ts
   /**
    * 只在 peak === true 且 level === 'reduce' 时为真：这段时间里主 Agent 没有可做的活，是照提醒把重活挪开了，不是卡住了。
    * M7 的空转判定读它（m7:§3.9.5）；与 glmWorkerCap 同一个函数填
    */
   readonly idleIsPeakMove?: true
   ```

   M7 的空转判定在 `stateFor(<主 Agent>)?.idleIsPeakMove` 为真时改用原因码 `hourness-peak-moved`，不叫主 Agent 去问人（提醒例「Nothing to do until GLM peak ends at 18:00; the harness resumes the drive then. Do not ask the human.」）；循环板 `loops.peak-end` 对原因码为 `hourness-peak-moved` 的 goal 调 `execute.resume-after-peak`，M7 这个动作只认这个原因码，不用判断阻塞发生在哪一段高峰。M7 因此多一次读，仍不读档位与时钟。要编排方把裁定第 3 条的「this one read」改为两次读；之后规则板在 §7.2、§10.7 M7 一条、§13、§18 与附录 E 照写，M7 与循环板的下一稿接。
2. 另一种：不动 M7，只在少做一行里叫主 Agent「没有必要的活时结束这一回合」。不够：goal 仍是 armed，驱动器照常开下一轮（`dsh-goal/README.md`:56 的自动继续），空转照样发生。不推荐。
3. 编排方定之前，照实写：§10.4 第 1398 行改为「少做档的高峰里主 Agent 挪完活会被 M7 的空转规则阻塞并问人；高峰后恢复要 `execute.resume-after-peak`；两处待编排方定（附录 E）」；附录 E 第 2029 行删去「规则板这边不依赖它」，加上第 1 点；放行稿「什么时候问你」删去「除此之外不问」，加一句「少做的高峰里，主 Agent 把重活挪完、手上没别的活时，现在会停下来问你要不要继续；这一处还在和派活那一块商量」，「会自己发生的事」的叫醒一句写明恢复被停下的推进还缺派活那一块的一个动作。

### F68（LOW）文首与附录 E 还引修订之前的裁定，§3.6 的事件名与节号是循环板 0.2 的

位置：第 29 行；附录 E 第 2022 行；§3.6 第 354 行；§10.4 第 1398 行。对照 `.agents/tasks/design-context.md`:73（修订后的第 4 条）、schedules/design.md:478、501、582。

问题：编排方 2026-10-30 按循环板第 2 轮评审 F19 修订了第 4 条：条目归编排层（显示为 `dsh-hourness` 带来的），GLM 包只给高峰变化事件与时刻计算。第 29 行仍写「GLM 一侧带到循环板上的一条默认条目」；附录 E 第 2022 行写「裁定写的是「GLM 一侧带到循环板上的条目」；循环板 0.2 把它放在循环行自己」。第 354 行写循环板在「`loops.peak-changed` 的 `end`」时叫醒，出处「循环板设计 0.2 §5.4 第 14 项」；循环板 0.3 改为 `channel.peak-changed`，第 14 项在 §5.2。规则板只交 `stateFor`，行为不受影响，查得到，不挡路。循环板 0.3 也请本稿改第 29 行（:478）。

改法：第 29 行改为「少做的高峰结束时叫醒主 Agent：循环板上一条编排层的默认条目（显示为项目编排带来的），GLM 包只给高峰变化事件与时刻计算（2026-10-30 按循环板第 2 轮评审 F19 修订）；规则板不叫醒 agent」；附录 E 那一格的处理写「照做；修订后的裁定与循环板的做法一致」；第 354 行与第 1398 行改为「`channel.peak-changed` 的 `end`」「循环板设计 0.3 §5.2 第 14 项、§6.9 第 4 条」。

### F69（LOW）plain-ui 0.6 删了 `/graph-apply`，本稿还要改它、测它

位置：§7.2 服务的使用方（第 938 行）；§9.3 结果表的 `/graph-apply` 一列（第 1238 行起）与「三个调用方」一句；§15 R4「`/graph-apply` 多写的那一行」；§16 R4 第 1682 行。对照 plain-ui:33、97（验收第 7 条）、155。

问题：plain-ui 0.6 去掉面板的全部写入，`/graph-apply` 随之删除。按 `question-28` C，plain-ui 在规则板之前合入，R4 开工时这个命令多半已不在；照 §16 做会去改一个已删的命令。多一步，实施时就会发现，不挡路。

改法：§16 R4 写「`graph_decide` 在拍板成功之后调 `acceptProposal`；`/graph-apply` 还在（plain-ui 没合入）时同样接上，已删就不接」；§9.3 表的第三列与 §7.2 那一句加「plain-ui 合入后不再有」；§15 R4 的那一例随之加条件。

### F70（LOW）还有两处「点」

位置：§6.2 第 6 步（第 494 行）「人对这张单点过「放行这一次」」；§10.4 第 1394 行「等待单与唤醒都不要人点。人点的只有提议」。

问题：0.6 评审 F55 第 3、4 条的改法只做了 §11.2 那几处。面板只看（`d-ui-look-not-operate`），放行这一次是 `/rules let`，提议是在对话里回话。

改法：第 494 行改为「人对这张单打过 /rules let（放行这一次）且没到期」；第 1394 行改为「等待单与唤醒都不要人做什么。人要回话的只有提议，它不是每次派发都要的」。

### F71（LOW）卸载时恢复 goal 的改法在宿主正常退出时也会跑，与「宿主重启」一条的前提相反

位置：§6.3 第 521、522 行；§11.2 第 1553 行「goal 的暂停是持久状态，宿主重启后由接手的宿主恢复」；§15 R4 的卸载一例。对照 cordis:963–966、dsh-app-boot:185–194、dsh-desktop-host:263–267、`dsh-acp-app/README.md`:27、`dsh-agent-loop/README.md`:216、`dsh-goal/README.md`:99、m7/design.md:743。

问题：

1. 宿主退出时加载器停掉整棵插件树（dsh-app-boot:192 `this.root.stop()`；`dsh-acp-app/README.md`:27「drain … the root profile tree before exit」），规则行的卸载函数因此在每次正常退出时都会跑〔推断，没有运行〕。不做档的高峰里退出桌面版：卸载函数把 goal 恢复成 `active`、单上记 `resumedAt`；重启后 `agent/created` 的接手跳过有 `resumedAt` 的单（第 521 行的条件），第 521 行写的「被暂停的 goal 留在会话里，新宿主接手，高峰结束时恢复与唤醒」在最常见的重启路径上不会发生。主 Agent 的 goal 由 M7 在重启后对「`active` 未 arm」照常 `resume`（m7:743），高峰里它的下一次工具调用重新开单、暂停，多花一步，可以接受；人自己在别的 GLM 会话里开的 goal，重启后停在 `active` 未 arm（README:99「every agent/created edge disarm continuation」），高峰结束时没有谁接着推，原来的接手本来会。退出时会话日志的写入者可能已关（agent-loop README:216），`resume` 也可能抛错；两种结局第 521、522 行都没写。
2. 第 522 行「这一步受卸载的时限约束」：cordis 的卸载函数直接调用，不设时限（cordis:963–966 `runDisposable`）；2 秒是规则板自己取锁的上限。

可逆、规则页看得到，不挡路。

改法：第 522 行写明卸载函数在宿主退出时同样运行，结局两种：恢复成功（单转 `done`、记 `resumedAt`；主 Agent 重启后由 M7 重新 arm，高峰里重新开单；别的 GLM 会话的 goal 停在 `active` 未 arm，规则页「在等的工作」写「宿主退出时已恢复，重启后要你在目标条上接着」）；或抛错（单留着，重启后按第 521 行接手）。「受卸载的时限约束」改为「规则板自己限 2 秒（取锁的上限），cordis 不设时限」；§11.2 第 1553 行的括号照改；§15 R4 加「高峰中卸载、恢复成功之后，新宿主不接手这张单」一例。

### F72（LOW）人设过档位时脚本的文字缺「何时设的」

位置：§6.4 第 622 行；§18 第 1753 行；对照 m6/design.md:119（M6 0.3 验收第 15 条：「档位的来源（出厂默认，或谁在何时设的；取自规则板的排队文字）」）。

问题：人设的档位第二段只写「Peak mode set by the human: reduce.」，没有时刻；§18 第 1753 行「M6 0.3 验收第 15 条要的三样都在」不全对。M6 的 L3 会查出来，不挡路。

改法：写成「Peak mode set by the human at <`peakMode.at` 的本机 YYYY-MM-DD HH:MM>: reduce.」，不做档同样；R3 的那一例加上时刻。主 Agent 的高峰一行（第 627 行起）不必带时刻。

### F73（LOW）门一组没有 plain-ui 要的来源一行

位置：§9.1 第 1156 行；§15 R5；对照 plain-ui:763（§11 第 3 条）。

问题：plain-ui 要「来源写「项目图上的规范「<标题>」· 你批过的」」。本稿组名用节点标题，组尾写由哪道门执行，下一行写改法，没有来源一行；人看不出这两张清单是他自己在图上批过的。

改法：每个清单组的组名下加灰字「项目图上的规范「<title>」· 你批过的」，与插件条目的「<插件名>带来的 · 只能看」同一位置；R5 的四份图样例核对这一行。

### F74（LOW）`stateForProject` 读不出状态时说成「出厂默认的少做」

位置：§7.2 第 1017 行。

问题：冷项目的快照读不出或要恢复时「按从没设过处理，origin 为 default」。人设过不做或无影响时，循环板页会显示「少做（出厂默认）」，`loops.peak-end` 也按少做判断要不要叫醒，错了却没有任何标记。宿主下一次读取会恢复，只错一阵子，不挡路。

改法：与 `checkCall` 同一做法：快照与流水不一致时在内存里按 §7.5 重放（`persist: false`，第 1367 行那一段的函数）；重放也不成时返回 `undefined`（调用方已有「读不到高峰模式」的说法），不冒充出厂默认。

### F75（LOW）宿主里调 `checkCall` 而规则行没激活时，`rules.check` 走哪个写者没写

位置：§9.4 第 1367 行；§10.5 第 1422 行；对照 schedules/design.md:777。

问题：写者「由 `metrics.ts` 一处选：在宿主里经指标流水的服务（规则行激活时经 `ctx.get` 取）」。循环行在宿主进程里直接导入 `src/rules/check.ts`；规则行禁用时 `metrics.ts` 没有宿主写者，照现在的写法会走「DSH 之外」的库写入口，与指标流水的服务在同一进程里各写一份。指标流水的设计还没成稿，会不会撞上说不准。

改法：`CheckOptions` 加 `readonly emit?: (event: RulesCheckEvent) => void`：宿主里的调用方（循环行）传自己经 `ctx.get` 取到的指标服务，给了就只用它；没给且规则行的宿主写者也不在时，才用库写入口。§10.7 指标流水一条加一句：库写入口要能与服务在同一进程里并存，或宿主里一律不用它。

### F76（LOW）证据的行号与下标有两处对不上

位置：§10.1 第 1379 行；§10.6 第 1446 行。

问题：`src/guard/rules.ts`:73、127 不是 `GuardRule.id`，两个 id 在 `61be79a`（本稿依据里有它）之后是第 77、131 行。§10.6「搜 `"team-coding-plan","off-peak"`，3.17.1 第一处在字符下标 554182」：搜索串本身从 554163 起，554182 是其中 `"off-peak"` 一项的位置。

改法：第 1379 行改为 :77、:131；第 1446 行写「`"off-peak"` 一项在字符下标 554182（搜索串从 554163 起）」。

### F77（LOW）放行稿有三处用词

位置：`onepage.md`「会自己发生的事」第 3 条、「替你定了的方向」第 1 条、末尾放行题的「背景」一行。

问题：

1. 「在 Kiro 里跑的练习题排队」：脚本自查不看是谁跑的，主 Agent 在命令行里跑、循环板跑、在 Kiro 里跑都一样排队（§3.6、§9.4）；写成「在 Kiro 里」，人会以为主 Agent 跑的不排。
2. 「没选「派活槽位的一半」」：「槽位」是内部词，人没学过（`d-plain-questions`）。
3. 背景「所有规矩都在一块板上」：`d-rules-visible` 是两块板分工，到点或碰到某件事就做的在循环板；这一页开头那句「项目里会挡住动作的规矩，都在这块板上看得到」才准。

改法：1 改为「自报可以挪的脚本（例如练习题），不管谁去跑，高峰里都先排队，18 点以后再跑」；2 改为「没选「同时能派的活的一半」」；3 改为「会挡住动作的规矩都在这块板上」（加粗不变，仍在 60 个码点以内）。

## 放行稿的人话

`onepage.md` 有 `d-design-onepage` 要的四块：你会看到什么、会自己发生的事、什么时候问你、替你定了的方向，另有交给别的模块的与放行题。除 F77 的三处，用词都是人学过的或页面自己会显示的词（「子 agent」「试运行」「变更记录」「存档」「会挡住动作的门」）；没有表格、没有编号选项。放行题照 `d-chat-not-cards` 的格式：题目一段，背景、推荐、疑问、不做四行各一段，标签不加粗，每行一处加粗；背景去掉加粗记号后 34 个码点（上限 60），推荐 29、疑问 30、不做 30（上限 40）；问话在最后、只问一次。内容上要改的是 F59 第 4 点（「除此之外不问」）。

## 已核实的假设

- goal：`update_goal` 的 `pause`、`resume` 要本回合有人的输入（dsh-tool-goal:349 `requireDirectHuman`），对 `paused` 的 goal 模型调 `resume` 抛错（:352）；`get` 对不是活实例的 agent 抛错（goal:611–614）；`pause` 只认 `active`（:676–678）；`resume` 认 `active`、`paused`、`blocked`，已 armed 的 `active` 与轮次用完时抛错（:686–698）；`expectCurrent` 先比 `id` 再比 `revision`（:760–765）；`requireNextRevision`（:174）；每个 `agent/created` 都 disarm（`dsh-goal/README.md`:99）。驱动器：`goalRef`（goal-round-driver:44–47）；`pause` 时只有发起者不是这个 agent 才 `cancel`（:246）；`turn/end` 只处理 `max-tokens` 与 `aborted`（:273–280）。§3.6、§6.3、§6.6 这几处与源码一致。
- cordis 的卸载函数直接调用、不设时限（cordis:963–966）；加载器停止时停掉整棵插件树（dsh-app-boot:185–194）。
- M7 0.3：:57「M7 不另加高峰逻辑」、:268「规则板不经服务参与」（本稿 §10.7 点名的两行属实）；:743 重启后对 `active` 未 arm 的 goal 照常 `resume`；:744 把 `paused` 读成人暂停的；:795 空转规则阻塞并叫主 Agent 在对话里说明。
- M6 0.3：:119 验收第 15 条的原文；:899 的留痕一行；:994 的文档表一格。
- plain-ui 0.6：`BoardState`、`Board` 的接口（:310–324）；上手页第 4 块（:549）与「第 4、5 块的文字固定在本稿」（:557）；§11 对规则板的五条（:759–765）；`/graph-apply` 删除（:33、97、155）。
- M3 附录 0.3：全文没有 `attach`；第 3 步到第 6 步在分支 `m3` 上、第 12 步（b）一起合入 main（:97），与 §15 R3 的说法一致。
- `.agents/tasks/design-context.md`「Seam rulings between designs」七条，含 :73 修订后的第 4 条。
- 仓库：main `ecdee9d`，`c2532e6` 之后没有碰代码的提交；`HOURNESS_ROWS` 没有 `rules`（`src/shared/health.ts`:26）；`RowHealthView.activation()`（:58–62）、`healthServiceName`（:79）；`PEAK_REMINDER_TEXT`（`src/glm-prompt/peak-reminder.ts`:28）与第 5–7 行的注释；`pricingService`（`src/shared/pricing.ts`:31）；`ASK_THE_HUMAN`（`src/guard/rules.ts`:56）；`GRAPH_FILES_RULE`（`src/guard/graph-files.ts`:26）；`src/shared/peak-mode.ts`、`src/shared/plugin-labels.ts` 还不存在（本稿与循环板说谁先实现谁建）。
- ZCode（§10.6，F49 的改法）：`x-off-peak-ticket-id` 在 3.17.1 字符下标 4158790，两版各 1 处；「Create a one-off idle-time task」在 7814389，两版各 1 处；`OffPeakCreate` 3.17.1 第一处 826761，两版各 15 处；3105 两版各 11 处，3102 为 3 对 2（3.17.1 多 1 处）；两版都搜不到 `14:00`、`18:00`；「`<system-reminder>` tags in messages and tool results are injected by the harness, not the user.」只在 3.17.1，下标 12791344。
- 图：`d-peak-mode` 正文与 17:45:14Z 的改动；`d-defaults-readonly` 的例外「档位当然能选。」；`d-rules-visible`；`d-chat-not-cards` 的四条格式批注（四行、各自成段、每行重点加粗）；`d-auto-drive`；`d-design-onepage` 的四块；`metrics`。

## 没有核实或不对的假设

- 不对：§10.4 第 1398 行 `d-auto-drive` 一条的「接上它的是循环板」在少做高峰当中不成立，附录 E 第 2029 行「规则板这边不依赖它」与 §10.4 相抵，放行稿「除此之外不问」（F59）。第 29 行与第 2022 行引的裁定文字是修订之前的（F68）。§18 第 1753 行「M6 0.3 验收第 15 条要的三样都在」（F72）。第 522 行「受卸载的时限约束」（F71）。`src/guard/rules.ts`:73、127（F76）。
- 推断、没有运行：宿主正常退出时规则行的卸载函数会跑（F71 的前提，依据是加载器停止整棵树与 acp 的说明）；退出时会话日志的写入者是否已关、`goals.resume` 会不会抛错。
- 没有核实：编排方、M7 与循环板是否接受 F59 推荐的 `idleIsPeakMove` 一读与 `hourness-peak-moved` 原因码；指标流水的库写入口能否与服务在同一进程里并存（F75）。
- 沿用上一轮、仍未核实：V3、V4、V11、V12；§6.6 里 0.3 起沿用的 rc.3 行号。

## 结论

HIGH 0、MEDIUM 1（F59，0.6 起仍开，部分关闭）、LOW 10（F68–F77，都是新的）。按规则：CHANGES_REQUESTED。

挡路的一条：出厂少做的高峰里，主 Agent 照提醒挪完重活、手上没别的活时，M7 的空转规则在高峰当中就阻塞推进并叫它去问人，高峰后的恢复又靠一个裁定没给、M7 没有的动作；`d-auto-drive` 在出厂档位下不成立，放行稿写的「除此之外不问」不对（F59）。这是 M7、循环板与规则板之间的接缝，要编排方定（推荐由规则板算好 `idleIsPeakMove`、M7 多读这一次）；定之前规则板先在 §10.4、附录 E 与放行稿里照实写。

关闭：F42、F43、F46、F48、F49、F52、F53、F55、F56、F57、F58、F60–F67。0.7 写完整，附录 D、E 与 §20 的两条都在。

收敛：必须改的条数 0.6 第 1 轮 8 条，本轮 1 条，在减少。

# 0.8 第 1 轮（设计 0.8）

本节边审边写；写到一半中断时，已写下的发现有效，结论一节缺席即表示本轮没有审完。上一次派出的评审在写任何东西之前因 TLS 错误中断，本节是重派后的第一次写入。

## 本轮审了什么

- 范围：聚焦审。0.8 是 0.7 的小修：按编排方对 0.7 评审 F59 的裁定（`.agents/tasks/design-context.md`「Seam rulings between designs」末条，第 77 行）改接缝，新成员 `glmHournessPeakMode.peakHoldFor(sessionId) -> {level, until} | undefined`；LOW F68–F77 能一句改的改，其余留下并在附录 F 写理由。没改的节不重审。
- 输入：`design.md` 0.8（2096 行，行号按 UTF-8 逐行计，下文「第 N 行」都指它）。0.7 原文没有另存，改动范围按文首、§20 的 0.8 一条（第 1852–1866 行）与附录 F（第 2066–2096 行）认，改过的句子逐处读了；`onepage.md`（0.8）；`docs/DEVELOPMENT.md` §1.1。
- 兄弟设计，只核对本稿引用的几处：M7 `.agents/tasks/m7/design.md` 0.3（03:12，还没有停住与 `resume-drive`）；循环板 `.agents/tasks/schedules/design.md` 0.3（05:47）与它的第 3 轮评审（`schedules/design-review.md` F34，正是这条裁定在循环板一侧的改法）。
- 图节点：`d-design-onepage`（`npm run -s graph -- show`）。

## 0.8 是否写完整

写完整了：文首版本说明、§20 的 0.8 一条逐节列出改过的句子，附录 F 每条发现一行，另有新裁定一表、交给 M7 与循环板的三件、留到以后的两件；文件以附录 F 末句结束，没有截断。

## 0.7 第 1 轮发现的状态

| # | 状态 | 依据（`design.md` 0.8 行号） |
| --- | --- | --- |
| F59 | Closed | 裁定照做，各处一致：文首接缝一条（第 32 行）、§0（第 65 行）、§1.4 第 23 条（第 137 行）、§1.5（第 143 行）、§3.6「高峰里等高峰结束」（第 355 行）与上限、档位两条（第 359、360 行）、§7.2 `PeakHold` 与 `peakHoldFor`（第 1010–1037、1052 行）、§10.4 `d-auto-drive`（第 1415 行）、§10.5（第 1455 行）、§10.7 M7 第 1、4 条与循环板第 8 点（第 1476、1479、1500 行）、§11.2（第 1567 行）、§13（第 1642 行）、§14、§15 R1、§16 R1、§17（第 1719 行）、§18 两行（第 1765、1766 行）、附录 E 的 F59 一行与末段 0.8 注、附录 F。规则板只交 `stateFor` 与 `peakHoldFor`，不叫醒、不调 M7 的动作，合裁定「The rules board only supplies the level and whether a held item is held for peak」；`execute.resume-after-peak` 全文只剩历史提法。放行稿「什么时候问你」在裁定下成立。余下的措辞与用例问题见 F78–F81，都不挡路 |
| F68 | Closed | 第 29 行按修订后的裁定写；§3.6、§10.4 用 `channel.peak-changed` 与循环板 0.3 §5.2、§6.9 第 4 条（循环板 0.3 第 582、782 行已核对）；附录 E 接缝表第 4 行。全文不再有 `loops.peak-changed` 与「0.2 §5.4」 |
| F69 | Closed | 第 939、961 行，§9.3 表头（第 1255 行），§15 R4（第 1678 行，`/graph-apply` 一列加条件），§16 R4（第 1701 行） |
| F70 | Closed | 第 495 行（打过 `/rules let`）、第 1411 行 |
| F71 | 第 2 点 Closed，第 1 点留下 | 第 523 行写明 2 秒是规则板取锁的上限、cordis 不设时限。第 1 点留到 R4 的理由成立（前提是推断，L3 先确认再写；代价可逆、看得到）。但这件待确认的事没进 §15 的核实项，见 F78 |
| F72 | Closed | 第 623 行、§15 R3（第 1677 行）、§18「命令行自查的文字」一行 |
| F73 | Closed | 第 1173 行、§15 R5（第 1679 行） |
| F74 | §7.2 Closed，§15 没跟上 | §7.2 第 1025 行改为内存重放、重放不成为 `undefined`；§15 R4 的用例仍写旧做法，见 F78 |
| F75 | 部分改，留下的理由成立 | §10.7 指标流水一条加了那一句（第 1502 行）；`CheckOptions.emit` 留到指标流水定稿：宿主里的出口取决于那份设计的服务形状，现在加等于替它定接口；`emitMetric` 吞掉写者的错误，判定与退出码不变（§13） |
| F76 | Closed | 第 1396 行（:77、:131）、第 1463 行（554163 与 554182） |
| F77 | Closed | 放行稿三处照改。放行题：背景去掉加粗记号 38 个码点（上限 60），推荐 29、疑问 30、不做 30（上限 40），每行一处加粗，问话在最后 |

## 发现

### F78（LOW）§15 R4 与核实项没跟上 0.8：`stateForProject` 的用例与 F74 的改法相抵，`peakHoldFor` 没有服务一侧的用例，F71 第 1 点没进核实项

位置：§15 R4 第 1678 行的 `glmHournessPeakMode` 一段；§7.2 第 1025 行；§15 R1 第 1675 行；§1.4 第 23 条（第 137 行）；§15 核实项表（第 1683–1690 行）；附录 F 第 2076 行。

问题：

1. R4 写「`stateForProject` 对冷的目录读一次快照，读不出或要恢复时按从没设过处理」。§7.2 第 1025 行按 F74 改成「与 checkCall 同一个做法在内存里按 §7.5 重放……重放也不成时为 undefined，不冒充出厂默认」。照 R4 写用例，实现就回到 F74 说的错：人选了不做或无影响，循环板页显示「少做（出厂默认）」，第 14 项按少做判断。
2. R1 只测填法，并写明「照常做这一项由 R4 的服务从会话的单上取」，R4 却没有 `peakHoldFor` 的用例：不做档单上的 `letOnceUntil` 没到期时为 `undefined`、到期后有值；会话没有工作目录或不在本宿主上为 `undefined`；规则行卸载后 `peakModeService` 为 `undefined`。验收第 23 条的「不做档另要这个会话没有本次高峰照常做」因此没有用例钉住。
3. 附录 F 把 F71 第 1 点留给「R4 的 L3 先确认宿主退出时规则行的卸载函数会不会跑、`goals.resume` 会不会抛错」，可是 §15 的核实项表与 R4 的 L3 一栏都没有这一项，实施 R4 的人照 §15、§16 做时看不到它。

都可逆、做到 R4 时会被发现，不挡路。

改法：

1. R4 那一句改为「`stateForProject` 对冷的目录读一次快照；快照读不出或与流水对不上时在内存里重放（`persist: false`），规则板目录逐字节不变；重放也不成时为 `undefined`」。
2. R4 在 `glmHournessPeakMode` 一段加：「`peakHoldFor`：不做档高峰里，会话的单打过 `/rules let` 且没到期时为 `undefined`，到期后为 `{level: 'stop', until}`；少做档高峰里为 `{level: 'reduce', until}`，与同一时刻 `stateFor` 的 `level`、`until` 相同；没有工作目录与不在本宿主上的会话为 `undefined`；卸载后 `peakModeService` 为 `undefined`；都不抛错」。
3. 核实项表加一行：「V13 | 宿主正常退出时规则行的卸载函数运行，其中的 `goals.resume` 成功 | L3（R4，`rules-peak-stop` 加一步：不做档高峰里正常关掉宿主再起） | 不跑：照现在的写法，单由新宿主接手；跑而 `resume` 成功：照 0.7 评审 F71 第 1 点补写 §6.3、§11.2 与用例」。

### F79（LOW）§10.7 给循环板的第 8 点替循环板定了「先看原因码再调」，持有者会话是冷的时候看不到原因码

位置：§10.7 循环板第 8 点（第 1500 行）「主 Agent 的 goal 以 M7 的原因码停住时，第 14 项先恰好调一次 M7 的 `resume-drive`」「判断要不要跑 `resume-drive` 看 goal 的原因码」。对照 `schedules/design-review.md` 第 3 轮 F34（第 319–327 行）与 `dsh-goal`:611–614（`get` 对不是活实例的 agent 抛错，0.7 轮已核实）。

问题：宿主在高峰里重启过时，18:00 那一刻持有者会话是冷的，循环板经 `goals.get` 读不到 goal，照第 8 点就不调 `resume-drive`，停住的推进要等人说话。循环板第 3 轮评审 F34 给了两种做法：不看原因码、直接调 `resume-drive`，由 M7 只认自己的原因码（幂等，`done` 或带原因的 `skipped`）；或者先 `resolveAgent` 再读原因码，M7 把原因码导出成常量。第 8 点只写了后一种，而且没写冷会话。`resume-drive` 本来就只恢复 M7 自己停住的 goal、幂等，规则板这边没有理由替循环板选。人从目标条能看到推进停着，说一句就接上，不挡路；循环板那一侧由它自己的 F34 挡着。

改法：第 8 点改为「第 14 项在高峰结束时恰好调一次 M7 的 `resume-drive`（经 M7 那一份的 `run`），M7 只恢复以自己的原因码停住的 goal，幂等，返回 `done` 或带原因的 `skipped`；持有者会话是冷的也照调。要不要先读原因码由循环板定（循环板第 3 轮评审 F34）。少做与不做两档都这样」；删去「判断要不要跑 `resume-drive` 看 goal 的原因码」，保留「不用读 `peakHoldFor`」。

### F80（LOW）循环板不在、不做档与中途换档三处的说法没跟上「两档都停住」

位置：§9.1 第 1176 行；§11.2 第 1567 行；`onepage.md`「什么时候问你」第 4 条；附录 F 第 2094 行。对照 §10.4 第 1415 行、§10.7 M7 第 4 条（第 1479 行）、循环板第 8 点（第 1500 行）。

问题：

1. 第 8 点写明少做与不做两档都由第 14 项跑 `resume-drive`（不做档里非 GLM 的主 Agent 没有规则板的单，也会被 M7 停住）。§9.1 那一行（「高峰结束时叫醒主 Agent、接上挪开的活，由循环板做」，循环板没装上时的另一种写法）与 §11.2 那一行（「少做档的高峰结束时循环板不在」）都只说少做；不做档里循环板不在时，规则页什么都不写。
2. 放行稿写「高峰里主 Agent 没别的活可做时也不问；循环板没装上时例外，页上写明」。设计没有定这个例外：§10.4 与 §10.7 M7 第 4 条写「这时停不停由 M7 定」，规则板只是建议照原来问人一次；页上写的是「循环板没装上：高峰结束后主 Agent 要等下一次有人或有事叫它」，没有说会来问人。M7 若定成照样停住，人既不会在高峰里被问，高峰后也没人接上，放行稿两头都不对。
3. 附录 F 对「高峰中途人把档位改成无影响或打了照常做」写「发现：规则页与目标条」。规则页不知道 M7 停住的推进（规则板只交 `peakHoldFor`，不读 goal），能看到的只有目标条。

推进停着时目标条看得到，人说一句就接上，不挡路。

改法：

1. §9.1 与 §11.2 两行的「少做档」改为「少做或不做档」；§9.1 的另一种写法照旧。
2. 放行稿那一句改为「高峰里主 Agent 没别的活可做时也不问。循环板没装上时，高峰结束没人接上推进，这时是照旧来问你一次还是等你开口，由派活那一块定，页上写明循环板没装上」。
3. 附录 F 那一句改为「发现：目标条（推进停着、原因码是 M7 的）；规则页只显示新档位」。

### F81（LOW）「没进展就当作在等高峰」这项取舍没进 §18，放行稿也没写

位置：§3.6 第 355 行「规则板不知道主 Agent 还剩哪些活……由 M7 推断：没进展的目标轮开始时 `peakHoldFor` 有值，就当作在等高峰。推断错的代价……至多 4 小时」；§10.7 M7 第 4 条（第 1479 行）；§18 第 1766 行；`onepage.md`「会自己发生的事」第 4 条与「替你定了的方向」。对照 `d-design-onepage`（放行稿要写「替人定了哪些方向」）。

问题：裁定的条件是「主 Agent 剩下的只有被高峰模式挡着的活」。harness 分不出主 Agent 是挪完了活在等，还是卡住了，本稿因此让 M7 把高峰里每个没进展的目标轮都当作在等高峰。代价是出厂少做档下，每个工作日 14:00–18:00 真卡住的主 Agent 要到高峰结束、`resume-drive` 之后再空转 3 轮才去问人。§3.6 写了这个代价，§18 却只有「挡着的是不是高峰怎样交出」一行，没有「怎样认出只剩被挡着的活」这一项与它的选项；放行稿写「高峰里主 Agent 把能做的做完、只剩挪到 18 点以后的活时，自动推进先停着」，读起来是系统认得出这件事。晚发现可以接受（看得到、能恢复，停住与恢复都在 goal 事件里），不挡路，但人放行时应当知道。

改法：

1. §18 加一行「高峰里怎样认出主 Agent 只剩被挡着的活」：1. 主 Agent 自己报（例如一个只在 `peakHoldFor` 有值时才收的「在等高峰」工具，M7 收到才停住）：代价是靠模型照做，没报的仍在高峰里被空转规则问一次。2. 高峰里没进展的目标轮一律当作在等（采用，§3.6）：代价是真卡住的要到高峰结束后才问人，至多晚 4 小时。第几轮停住与是否换成第 1 种由 M7 定。
2. 放行稿「替你定了的方向」加一条：「高峰里主 Agent 一停下来，系统就当它在等高峰，不分是挪完了活还是卡住了；真卡住的，要到 18 点接上之后才来问你。没选让主 Agent 自己报在等高峰：那要靠模型自觉」。「会自己发生的事」第 4 条可改为「高峰里主 Agent 停下来没事做时，自动推进先停着，不来问你」。

## 已核实的假设

- 裁定原文（`design-context.md` 第 77 行）：等高峰的目标轮不计入 M7 的空转判定、高峰当中不问人；M7 以自己的原因码（例 `hourness-peak-wait`）停住，经 `glmHournessExecute.runAction` 交 `resume-drive`；高峰结束时编排层的循环板条目跑它并提醒主 Agent；规则板只给档位与挡着的是不是高峰。本稿文首第 32 行、§3.6、§10.7、附录 F 的转述与它一致；第 3 条裁定「M7 adds this one read」在本稿限到派活处（第 28、359、1476 行），空转判定的那次读由末条裁定给出。
- `glmHournessExecute.runAction` 是循环板的执行契约（`contribute` 交来的 `run`，图节点 `schedules`、`m7` 的批注），不是本稿新造的名字。
- M7 0.3：§3.9.5「都在等人、空转与轮次上限」在第 791 行，空转规则在第 795 行（每个目标轮开始时比图修订号与执行活动计数，连续 3 轮没变以 `hourness-idle-rounds` 阻塞并叫主 Agent 去问人），所以「在一个没进展的目标轮开始时读一次」读得通。M7 0.3 还没有停住与 `resume-drive`，本稿以 §10.7 第 4 条请它的下一稿做。
- 循环板 0.3：第 14 项 `loops.peak-end` 听 `channel.peak-changed` 的 `end`（第 582 行）；§6.9 第 4 条（第 782 行）；§6.9 第 5 条（第 797 行）写计价服务不在或 `peak` 抛错时第 13、14 项不出现，与 §3.6「结束时刻读不出时 `peakHoldFor` 为 `undefined`、宁可照原来问人」的理由相符。
- `PeakHold` 与 `peakHoldFor` 的取值在 §7.2（第 1010–1037 行）、§1.4 第 23 条、§13（第 1642 行）、§15 R1（第 1675 行）四处相同：`peak === true`、结束时刻读得出、档位为少做或不做，不做档另要没有「本次高峰照常做」；与 `stateFor` 同一个函数算。
- 不做档里 GLM 主 Agent 的 goal 由规则板的单暂停，没有目标轮，M7 的空转判定不会碰到它；单解除时规则板自己恢复（§6.3），`resume-drive` 只认 M7 的原因码，两条路不打架。
- `onepage.md`：四块都在；「什么时候问你」与裁定一致；放行题的码点数与加粗见上表 F77 一行。
- 改过的 LOW 逐处核对过行文（上表）；全文搜不到 `loops.peak-changed`、「0.2 §5.4」、「点过」、「不要人点」、「受卸载的时限」、`rules.ts`:73、127。

## 没有核实或不对的假设

- 不对：§15 R4「`stateForProject` 读不出或要恢复时按从没设过处理」与 §7.2 第 1025 行相抵（F78）；附录 F「发现：规则页与目标条」里的规则页（F80）；放行稿「循环板没装上时例外」写成了已定（F80）。
- 没有核实：M7 与循环板是否照 §10.7 第 4 条、第 8 点改（两份都还没出下一稿；循环板第 3 轮评审 F34 已按同一条裁定挡住）；宿主正常退出时规则行的卸载函数会不会跑（F71 第 1 点，留到 R4，见 F78）。
- 沿用上一轮、仍未核实：V3、V4、V11、V12；§6.6 里 0.3 起沿用的 rc.3 行号。

## 结论

HIGH 0、MEDIUM 0、LOW 4（F78–F81，都是新的）。按规则：APPROVED。

F59 关闭：0.8 照编排方的末条裁定写，规则板只交档位与 `peakHoldFor`，停住与接上归 M7 与循环板，§3.6、§7.2、§10.4、§10.7、§13–§18、附录 E、F、§20 与放行稿说法一致；出厂少做的高峰里不再在中途问人，`d-auto-drive` 在规则板这一侧满足（另两侧等 M7 与循环板的下一稿）。F68–F70、F72–F74（§7.2）、F76、F77 关闭；F71 第 1 点与 F75 的 `CheckOptions.emit` 留下的理由成立。

不挡路的四条：R4 的用例与核实项没跟上 0.8（F78）；给循环板的第 8 点替它选了「先看原因码」，冷会话看不到（F79）；循环板不在、不做档与中途换档的几处说法（F80）；「没进展就当作在等高峰」的取舍没进 §18 与放行稿（F81）。都可以在实施 R4 之前一句一句改，不用再过一轮评审。

# 0.9 第 1 轮（设计 0.9）

本节边审边写；写到一半中断时，已写下的发现有效，结论一节缺席即表示本轮没有审完。本轮的严重程度只用 HIGH、MEDIUM、NIT 三级（前几轮的 LOW 相当于 NIT）。

## 本轮审了什么

- 范围：0.9 照人在 0.8 放行稿之后定的几件事（`d-boards-as-hooks`、`d-rules-in-repo`、`d-main-agent-peak-exempt`、`d-script-timeout`、`d-memory-scope`、`d-agent-examples`）、编排方的 hook 接缝裁定与「不再触发的条目」改写，改动遍及 §0–§20，另加附录 G。本轮审 0.9 改过的部分（按文首的 0.9 说明、§20 的 0.9 一条与附录 G 认），加上 `docs/CHARTER.md` 的四处改写（文首状态行、§3.2 第 3 条、§6 影子一句、§9 存放表）与记图草稿 `graph-ops-v09.json`。没改的节不重审。
- 输入：`design.md` 0.9（2599 行，下文「第 N 行」都指它）；`design-v0.8.md`；`docs/CHARTER.md` 工作区里的改动（对 HEAD 的差别，11 行增、7 行删）；`graph-ops-v09.json`（9 条批注，JSON 合法）；接缝核对报告 `seam-check-v09-v05.md`。
- 对照：`.agents/tasks/design-context.md` 全文，末几节为主（「Both boards are hook-style; storage scope」「Main agent and peak; stale entries; hook seam」里的 `d-memory-scope`、`d-alignment-rounds`、`d-script-timeout`，「Check entries seam」）；图节点 `rules`、`schedules`、`d-boards-as-hooks`、`d-rules-in-repo`、`d-main-agent-peak-exempt`、`d-memory-scope`、`d-peak-mode`、`d-defaults-readonly`、`d-rules-visible`、`d-design-onepage`、`d-chat-not-cards` 的正文与全部批注，`hourness` 的验收（读到 `rules` 与 `schedules` 上 2026-10-30T07:12Z 的 M4 批注）。
- 接缝：循环板 `.agents/tasks/schedules/design.md` 0.5 的 §2.2、§2.3、§3.1、§3.2、§4.1、§4.6、§6.6、§6.9、§6.11、§7.1、§9.1、§9.3。
- 邻居，只读接缝处：M4 `.agents/tasks/m4/design.md` 0.4（§2.3 的分工表、§3.8、§18 第 5 条；它的第 4 轮评审 CHANGES_REQUESTED）；M3 附录 0.4（§3.5 第 5a 步、`attachable` 的 `detail` 校验一行）；M7 0.4 的周报阶梯 `ladderProposals`；`docs/ORCHESTRATION.md` §6.5。
- 源码（main `aa55399`）：`src/guard/rules.ts`（`shellCommandOf`:115、`evaluate`:151、`renderCorrection`:163）、`src/shared/health.ts`:79 的 `healthServiceName`；`reference/dsh-desktop-0.2.1-rc.3/dsh-tools/lib/index.js`:3230–3242（执行对象带 `callId`）。`src/loops/trigger.ts`、`src/loops/script.ts`、`src/guard/catalog.ts`、`src/shared/peak-mode.ts` 都还不在 main 上，是设计里的新文件。

## 0.9 是否写完整

写完整了：文首的 0.9 说明逐条写了答哪一项人定或裁定；§20 有 0.9 一条；附录 G 有人定与裁定、图上批注、0.8 评审 F78–F81、接缝核对四张表；文件以附录 G 末表结束，没有截断。`design-v0.8.md` 与 `onepage-v0.8.md` 都在，`onepage.md` 仍是 0.8 的（按约定评审通过之后才重写）。

## 0.8 第 1 轮发现的状态

| # | 状态 | 依据（`design.md` 0.9 行号） |
| --- | --- | --- |
| F78 | Closed | §15 R4（第 2072 行）的 `stateForProject` 一例照 F74 的改法写（内存里重放、`.llm/rules/` 逐字节不变、重放不成为 `undefined`）；`peakHoldFor` 的各例（少做、不做对主 Agent、子 agent 的 `/rules let` 到期前后、没有工作目录、卸载之后）；核实项 V13（第 2097 行） |
| F79 | Closed | 0.8 写给循环板的第 8 点就地改为「高峰结束时恰好调一次 `resume-drive`，冷会话也照调，先不先读原因码归循环板」；循环板 0.5 §6.9 第 4 条第 3 行正是这样做的 |
| F80 | 设计里 Closed，放行稿那一点留到重写放行稿 | 第 1 点：§9.1「少做或不做档另一行」、§11.2 第 1945 行；第 3 点：附录 F 第 2545 行「发现：目标条……规则页只显示新档位」；第 2 点在 `onepage.md`，按约定由评审通过之后重写放行稿的一步照改（本轮不通过，这一点继续留着） |
| F81 | 设计里 Closed，放行稿那两句同上 | §18 第 2202 行加了「高峰里怎样认出主 Agent 只剩被挡着的活」一行，两种做法与代价都在；放行稿两句留到重写放行稿 |

## 对人定方向与裁定的核对

| 方向或裁定 | 结论 | 依据 |
| --- | --- | --- |
| `d-boards-as-hooks`：一个形状（什么时候 + 筛选 + 动作）；动作自带或子 agent 写的脚本；拦路的事件上退出码说放行、拦下、排队；人看过原文同意即生效；脚本在仓库、哈希钉住、改过要再同意；超时默认 10 秒、每条写明超时或崩溃时怎样（默认放行，板上显示）；单独进程、项目目录、没有凭证；不用 DSH 插件；代码里的规则原地不动、照旧列出 | 规则板这一侧做到了，三处没做到：仓库带来的脚本在新克隆与 `/rules recovery 文件 照改` 之后不经人看原文就跑（F84）；「代码里的规则原地不动」被 CHARTER 的改写越过了（F82）；M4 的四条代码规则在规则页上列不出来（F83） | §2.2、§2.3、§5.5、§6.7、§7.1、§9.3；F82–F84 |
| hook 的接缝裁定：形状、事件表、筛选、执行器归循环板，一个共用模块；规则板定哪些事件拦路、结果的意思、怎样进 `checkCall`；同意的路一条；各写对方的节号 | 做到了，接缝核对之后两边一致（下一节）；同意的路在「仓库带来的条目怎样认回」这一处两边不同（F84） | §2.2、§5.3、§6.7、§9.3、§10.7 循环板一节 |
| `d-script-timeout`：超时按条目的做法、默认放行；后台至多 10 分钟；晚到的拦下当场告诉主 Agent；跑满记为没跑完；主干前进之前默认拦下；进周报，反复超时的提议修 | 做到了 | §6.7「超时之后」、§6.4 两段文字、`notices`、§10.5；执行器的 `late`、`capped`、`GATE_HARD_CAP_MS` 与循环板 §6.6 一致 |
| `d-rules-in-repo`：规则、开关（含短时的）、脚本进仓库；运行时进 `.llm/`；删 0.8 §7.1 的用户级按项目目录 | 做到了，正文里留着几处 0.8 的用户级说法（F87） | §4、§7.1、§7.4 第 7a 步、§7.5 |
| `d-memory-scope`（比任务说明新，图上已定）：用户级恰好是 GLM 凭证、ZCode 设备号、人设、关于人的记忆、账号的额度与用量、DSH profile 的插件配置 | 做到了。任务说明让这一点留空，节点已定，设计照节点写，对 | 文首、§4、CHARTER §9 |
| `d-main-agent-peak-exempt`：高峰模式从不挡主 Agent；只管子 agent 与重活；「不做档主 Agent 也排队、换档只能 /rules peak」作废 | 正文做到了；§15 R1 的 0.8 用例仍按旧做法写（F85）；几处「主 Agent 的工具调用一律不受管」的说法没写派活那一次的例外（F86） | §3.6、§6.3、§1.4 第 15、17 条；F85、F86 |
| 不再触发的条目（agent 定）：4 周、一批至多 3 件、插件条目不算、删走同一条路 | 做到了。design-context 写的是两块板合成一条提议；0.9 改成各提各的、各至多 3 件，理由（一条提议只能带一块板的 `attach`）写在 §10.5 与附录 G，循环板 §6.11 同样写，草稿的 `schedules`、`m7` 两条记了 | §10.5、§10.7 M7 第 4 条 |
| `d-agent-examples`：一个拦路脚本的例子在工具说明里，过同一套校验，领域与练习题无关，只写已定的 | 做到了 | §9.3 末段两个例子与 §15 R3 的用例 |
| `d-rules-visible`、`d-defaults-readonly` | 规则页的分组、只能看与「要改」一行照旧；M4 的四条影子规则与指标流水的门不在代码规则目录里（F83） | §9.1、§10.1 |
| `d-chat-not-cards`、`d-plain-questions` | 做到了：提议只有四行加原文，没有选项；页上的换词表加了「哈希」「信封」 | §9.1 末段、§9.3 |
| `d-design-onepage` | 放行稿按约定留到评审通过之后重写；本轮不通过 | 附录 G「留给重写一页稿的一步」 |

## 与循环板 0.5 的接缝

接缝核对报告列的 19 处在两稿里都改了，本轮按归属逐处复核（循环板 0.5 的节号）：

- 条目形状：`HookShape`、`Trigger`、`EventFilter`、`FilterTest`（含 `matches`）、`ScriptRef`、`ScriptAction`、`validateWhen`（规则板传 `allowGate: true`）、`matchesFilter` 在 `src/loops/trigger.ts`（§2.2），规则板只引用。`ScriptLang` 为 `pwsh`、`node`、`python`、`bash`，与规则板 §12 的后缀一致；`timeoutSeconds` 拦路 1–30、缺省 10，两边同。`paths` 以 `/` 结尾是目录前缀，规则板例子二的 `locales/` 合这个写法。
- 事件：`gate.` 名字空间只给规则行，只收事件不收条目（§3.2、§4.6）；`gate.` 事件可以有 `session` 字段（§3.2，接缝核对时补）；`gateOnErrorDefault` 在 `LoopEventDeclaration` 上（§3.1）。
- 执行器：`runScript`、`ScriptRequest`（`purpose`、`signal`）、`ScriptResult` 四种、`LateScriptResult`（`exited`、`crashed`、`capped`）、`HookEnvelope`（`board` 为 `loops` 或 `rules`，拦路事件没有 `id`）、常量 `GATE_TIMEOUT_MS` 10 s、`GATE_TIMEOUT_MAX_MS` 30 s、`GATE_HARD_CAP_MS` 600 s、`GATE_LATE_MAX` 8、`ON_ERROR_DEFAULT`、环境名单与 `HOURNESS_BOARD`、`HOURNESS_ENTRY`、私有副本（§6.6）：规则板 §5.3、§6.7 的引用与它一致。`signal` 在超时之后中止时结束后台进程树（§6.6「超时之后怎样」第一条），规则板的 `checkCall` 靠的就是它。
- 同意的路：`AttachDetail` 6000 码点、`mustShow` 1–8 片每片至多 4000（§3.1）；`scriptDetail({lang, text, cautions})`（§6.6）；`attachDigest` 与「已给人看原文 <摘要>」（§7.1 第 3、4 步）；没有图时 accept 打两次、30 分钟内（§7.1 末段）：规则板 §9.2、§9.3 照同一个样子写了。`repin` 两边的写法不同（循环板把提议里存的字节写回仓库，规则板核对仓库里那份没再变过、变过就 `invalid`），两种都只跑人看过的字节，不算对不上。
- 存放：`docs/rules/`、`docs/loops/`、`.llm/rules/`、`.llm/loops/`；`loops:files-only` 已进规则板 §2.6（第 353 行）。
- 高峰：循环板 §6.9 第 2 条删了 `heldForPeak`，第 4 条第 3、5、7、10 行与规则板 §10.7 循环板第 8 点的说法一致（「第 7 行多半先成立、至多多一步」）。主 Agent 从不被停之后，`loops.peak-end` 两档同一张表、按「这段高峰里干过活、闲着、不在等人」叫醒，说得通。
- 对不上的一处：仓库里带来的条目怎样认回（循环板 §9.3 前四行按图上人的拍板认回、改过的要 `repin`；规则板 §7.5 照文件里的哈希信），见 F84。

接缝核对报告留给评审的几件：CHARTER §9 用户级一行没点名循环板的 `loops/machine/`（F90）；`repin` 两种写法（上面，不算对不上）；`/rules accept` 改为打两次（与循环板 §7.1 末段相同、合「同意的路一条」的裁定，人看得到的变化由重写放行稿的一步写进去）；`hourness` 验收第 3 条与改写后的宪章矛盾（并进 F82 的改法）；违规流水搬进项目 `.llm/` 在图上没有节点：M4 0.4 §2.4 已经这样做（`.llm/audit/violations.jsonl`，按会话找项目），并进 F83。

## 发现

### F82（MEDIUM）CHARTER §6 与 §3.2 第 3 条把「先影子」对所有门禁都取消了，超出 `d-boards-as-hooks` 的范围，与 `ORCHESTRATION.md` §6.5、M4 0.4、M7 0.4 相抵

位置：`docs/CHARTER.md` 第 77 行（§6「门禁经用户同意即生效，不先以影子模式运行……」）、第 44 行（§3.2 第 3 条末句）、第 4 行（状态行「把……『新门禁先影子后拦截』改为『人同意即生效』」）；`design.md` 第 1831 行（§10.7 M5 一条）；`graph-ops-v09.json` 的 `m5`（第二点）与 `hourness` 两条。对照：`d-boards-as-hooks` 正文「取代人同意的条目上的『影子先行』」「代码里的规则原地不动，照旧列出」；`docs/ORCHESTRATION.md` §6.5「新规矩先只记录、不拦截，测出误伤率，误伤足够低再生效」；M4 0.4 第 65 行与 §3.8（`credential-read`、`suppression-reason`、`checker-config`、`scratch-only` 四条代码规则以影子上线，`PROMOTION` 判据）；M7 0.4 第 962 行 `ladderProposals` 的「影子转生效」；图节点 `rules` 2026-10-30T07:12Z 的 M4 批注「同批改写 CHARTER §6 时请写明分界：代码里的新门先影子，人看过原文同意的板上条目即刻生效」。

问题：人定的是板上人看过原文同意的条目不先试运行；写在代码里的门禁照旧。改写后的 §6 一句话说「门禁经用户同意即生效，不先以影子模式运行」，没有限定在板上的条目，于是：

1. `docs/ORCHESTRATION.md` §6.5 与宪章直接相抵；M4 0.4 的四条影子规则、M7 0.4 的「影子转生效」阶梯照宪章读都成了违规。
2. §3.2 第 3 条末句写代码里的门禁「照开发流程过评审与测试，新行默认禁用、验证通过后才启用」，没说还先影子，读者会以为影子期整个没了。
3. 规则板据此请 M5 改它第一批经验的第 7 条（「start a new gate in shadow mode and count false denials before enforcing it」，第 1831 行与草稿 `m5` 第二点），而那一条说的正是一道代码里的 guard 规则，在限定之后的宪章下是对的。
4. 草稿 `hourness` 一条请人把根目标验收第 3 条整个换成板上条目的说法，代码里的门禁那一半跟着丢了。

这是对人定范围的越界，也让宪章与一份已跟踪的设计文档相抵，所以挡路。

改法：

1. CHARTER §6 那一条改为：「规范可升可降：记忆、提示词、阶段提醒、门禁四级。写在代码里的新门禁先以影子模式运行，测出误伤再生效（`ORCHESTRATION.md` §6.5）。规则板与循环板上用户看过原文同意的条目即刻生效，不先试运行；它的后果事先写明（超时或出错时放行还是拦下）、内容钉住（改过就停）、效果看得见（命中与失败进报告）、撤得快（一句话或一条命令），这四样代替影子期（§3.2 第 3 条）。用户想先看一条规矩会挡下什么，可以让它只记录、不拦，那是用户选的做法，不是必经的阶段。」
2. §3.2 第 3 条末句改为：「写在代码里的门禁照开发流程过评审与测试，先以影子模式运行、测出误伤再生效（§6），新行默认禁用、验证通过后才启用（`AGENTS.md`）。」状态行改为「0.7 把 §3.2 第 3 条与 §6 的『新门禁先影子后拦截』限定为写在代码里的门禁，规则板与循环板上用户看过原文同意的条目改为即刻生效，并写明代替影子期的四样保障……」。
3. `design.md` §10.7 删去 M5 那一条的后半（「M5 第一批经验里……请 M5 下一稿改那一行的解法」），只留项目根与锁两件；草稿 `m5` 一条删去第二点。
4. 草稿 `hourness` 一条改为请人把验收第 3 条改成「……不依赖 LLM 或人的自觉；写在代码里的新门禁先影子后拦截，规则板与循环板上人看过原文同意的条目即刻生效（后果写明、内容钉住、效果进报告、撤得快）」。
5. §5.5 与「依据的学科与标准」表「人同意的脚本」一行引 CHARTER §6 的地方不用改，它们说的本来就是板上的条目。

### F83（MEDIUM）M4 0.4 给规则板的接缝请求没有答复：代码规则目录列不出 M4 的四条规则，共用的违规流水的 `mode` 两边对不上

位置：`design.md` §10.1（第 1724 行起）、§2.3 第 257 行（「与 guard 的判定器抛错即放行相同（`src/guard/rules.ts` `evaluate`）」）、§1.4 第 5 条与 §10.5 第 1767 行（违规流水 `mode: 'enforce' | 'record' | 'late'`）、§10.7（没有 M4 一节）、附录 G（没有这条批注）；`graph-ops-v09.json`（没有 `m4` 一条）。对照：图节点 `rules` 2026-10-30T07:12Z 的批注（M4 设计 0.4 §2.3、§3.2、§3.3、§3.8、§18 第 5 条）；M4 0.4 第 123、176、588 行（`src/guard/catalog.ts` 的 `GUARD_RULES`）、第 175 行（规则板的记录由 `classifyRecord` 分类：`effect: 'queue'` 算排队，`mode: 'enforce'` 算拒绝，`mode: 'shadow'` 算规则影子）、第 118 行（G1 删掉 `evaluate`）、第 1578 行（给规则板的六件）。

问题：0.9 的依据写「图上 `rules` 的批注读到 2026-10-30T05:55Z」，之后 07:12Z 的 M4 批注是比本稿依据新的节点内容，本稿一件都没有接，也没有写不接的理由：

1. 代码规则目录：M4 0.4 建 `GUARD_RULES`，列 guard 框架的全部规则（guard 行六条，含四条影子规则，图行一条，以后 M3、M7、循环板、指标流水的门），并请规则板的目录导入它。0.9 §10.1 仍是 `src/rules/builtin.ts` 自己的一张表，列的是 guard 两条、图文件门禁、M3 八条、M7 的门、规则板自己的几条，没有 M4 的四条与 `metrics-files-only`。两张表照各自的设计实现，M4 的四条在规则页的「写在代码里的规则」里就看不到（`d-rules-visible`：项目里每条生效的规矩都要在板上看得到），或者同一件事两张表各写一份（CHARTER §7.1 条款 6）。
2. 违规流水是规则板与 guard 共用的一份（§10.5 第 1767 行自己写的「与 guard 同一份」）。0.9 把规则板记录的 `mode: 'shadow'` 改名 `record`，又加了 `mode: 'late'`；M4 0.4 的 `classifyRecord` 是读这份流水的唯一分类函数（晨报、`ruleStats`、命令行、回放、M7 的 `ladderProposals`、规则页都用它），它只认 `enforce`、`shadow` 与 `effect: 'queue'`。照两稿各自实现，规则板的「只记录」与「晚到的拦下」要么被分错类、进了违规数，要么被丢掉，晨报与 M7 的阶梯数据不对，而且没有任何一方会报错。
3. M4 请规则板的门第一件事调 `observe`、拒绝时调 `noteDenial`（规则 id `rules:<id>`），这样规则板的拦截也有跟进记录；0.9 没有提。M4 那边写了缺这两行时它的验收只覆盖经 `installRuleGate` 的拦截，所以单这一件不挡路，但应当写明接还是不接。
4. §2.3 第 257 行引的 `evaluate` 今天在 main 上（`src/guard/rules.ts`:151），M4 0.4 的 G1 删掉它，换成 `judge` 与 `installRuleGate`。
5. 违规流水搬进项目的 `.llm/`：§10.5 写「那是数据目录服务与 guard 的改动，不归规则板」，草稿 `rules` 一条说「没有专门节点、交编排方分派」；M4 0.4 §2.4 已经这样做（`.llm/audit/violations.jsonl`，项目根与规则板 §7.3 同一个函数），应当引它。

改法：§10.7 加「M4 设计 0.4（图上 `rules` 2026-10-30T07:12Z 的批注）」一节，逐件答复，附录 G 批注表加一行，草稿加一条 `m4` 的批注。建议的答复：

1. 代码规则目录：guard 框架的条目（guard 行、图行、M3、M7、循环板、指标流水的门）取自 `src/guard/catalog.ts` 的 `GUARD_RULES`，`builtin.ts` 只映射它，自己只另加规则板的 `rules:files-only`、默认规则与四条附属条目；目录项的 `mode` 取 `GUARD_RULES` 的，规则页对影子规则写「只记下，不挡」（照 §9.1 末段的换词表），后面照旧「<插件名>带来的 · 只能看」；先合入的一方建 `catalog.ts`。§10.1 的枚举、§1.4 第 12 条与 §2.6 的代码规则几行按它改（加 M4 的四条与 `metrics-files-only`）。
2. 违规流水：规则板写 `mode: 'record'` 与 `mode: 'late'`，请 M4 的 `classifyRecord` 认这两种：`rule` 以 `rules:` 开头且 `mode: 'record'` 的是「只记录」（人选的动作，不进违规数，单列计数），`mode: 'late'` 的是「晚到的拦下」（进违规数，另列一行）；在 M4 加上之前，规则板的 R7 自己数这两种，不经 `classifyRecord`。或者反过来规则板仍写 `shadow`，两种取一种，写进 §10.5。
3. `observe` 与 `noteDenial`：M4 的 `src/guard/gate.ts` 在时，规则板的监听器第一件事调 `observe`，拦截与开单拒绝时调 `noteDenial`（`rules:<id>`，没有 `rightPath`）；M4 不在时不调。
4. §2.3 第 257 行改为「与 guard 的判定出错即放行相同（M4 0.4 G1 之后是 `src/guard/gate.ts` 的 `installRuleGate`）」。
5. §10.5 与 §10.7「数据目录服务与 guard」一条改为引 M4 0.4 §2.4；草稿 `rules` 一条删去「没有专门节点」那一句。
6. 宪章 §6 的分界照 F82。

### F84（MEDIUM）仓库带来的脚本不经人看原文就跑：新克隆照 `rules.json` 的哈希开始，`/rules recovery 文件 照改` 只给人看一行差别；循环板 0.5 对同一种情形不跑

位置：`design.md` §7.5 末表第二行（第 1414 行：「`scripts` 里钉住的哈希照文件里的信（它们随 git 来，git 历史里有人同意时的提交）」）、第 1420 行（`repo-adopt`：「`scripts` 里的哈希照文件的」）、第 1712 行（`checkCall` 在 `.llm/rules/` 不在时照 `rules.json` 在内存里开始）、§1.4 第 28 条。对照：`d-boards-as-hooks`（人在四行方案里看到脚本原文并同意后才生效）；接缝裁定（两块板一条同意的路）；`d-rules-human-only`；循环板 0.5 §9.3 前四行（文件在循环板之外改过：不跑，`entry-changed`，要用就 `repin`，人看过原文再钉；id 在这台机器上从没见过：只按图上人的拍板认回，`source.question` 是一张 `done` 的提议式待决、正文末行是这条提议、拍板的身份是人或带原话的 `llm`，对不上就 `unadopted`、不跑）。

问题：

1. 新克隆、换电脑或 `.llm/` 被删之后，规则板照 `rules.json` 写 `base`，里面每个脚本的哈希都照信，下一次匹配的调用就跑它。`rules.json` 与脚本文件是谁写的，这时没有任何核对：一个 worker 用 file-tools-only 看不见的 shell 写法（§2.5 写明拦不全）在机器 A 上改了 `rules.json` 与 `scripts/`，A 上的规则板看出「被规则板以外改过」、不生效；但主 Agent 照常提交，B 上新克隆之后这段没人看过的脚本就在每次匹配的工具调用之前跑。换人时也一样：新的人从没看过这些脚本。
2. 有 `.llm/rules/` 的机器上，人打 `/rules recovery 文件 照改` 之后脚本按文件里的哈希生效。照改之前人看到的是「按条目一行：加了、删了、改了哪几项」（§9.1），不是脚本原文；队友拉来的一段新脚本，人打一条命令就让它跑了，没看过一个字。
3. 循环板 0.5 对这两种情形都不跑（上面对照的前四行），两块板在「同一条同意的路」上一个严、一个松。

可逆、看得见（规则页列出、命令文本在会话日志里），但它让「人看过原文才跑」在两条常见的路上不成立，而且与接缝裁定相抵，所以挡路。

改法（照循环板 §9.3 的做法，两块板一样）：

1. §7.5 末表第二行：照 `rules.json` 开始时，不带脚本的条目照旧读入；带脚本的条目（规则的 `script`、检测器的 `measure`）只在 `scripts[<id>].question` 指向图上一张 `done` 的提议式待决、它的正文末行是 `proposalLine` 的那条提议、最后一条 `decide` 的身份是人，或是带 `relay` 且 `reason` 里有「已给人看原文 <摘要>」的 `llm` 时，照文件里的哈希认回；对不上（没有这张待决、没拍、当初是 `via: 'board'` 同意的）就照读入，但脚本不跑，按条目的 `onError` 判（`gate.trunk-advance` 上拦下），规则页写「这段脚本在这台电脑上没有你看过原文的记录，先不跑；要用，跟主 Agent 说，它会把原文给你看」，主 Agent 用 `repin` 提。
2. 第 1420 行 `repo-adopt`：不带脚本的改动照文件生效；带脚本的条目里脚本有变化或是新加的，同上不跑、等 `repin`，`/rules` 的回话写出是哪几条。
3. `checkCall`（第 1712 行）的内存起点照第 1 点同样处理。
4. §1.4 第 28 条加一句：新克隆上一条带脚本、在图上有带记号拍板的规则照跑；没有的不跑、按 `onError`；`/rules recovery 文件 照改` 之后新加的脚本不跑，`repin` 同意之后才跑。§15 R2 加对应的两例。

### F85（MEDIUM）§15、§16 的表还照 0.8 写着几处 0.9 已推翻的做法，其中一处与人定的 `d-main-agent-peak-exempt` 相反

位置：§15 R1（第 2069 行）、R3 的 0.9 一行（第 2083 行）、R4 的 0.9 一行（第 2084 行）、R5（第 2073 行）、核实项 V4（第 2094 行）；§16 R4（第 2109 行）。

问题：§15 写「上表各行照 0.8 写，下面的增改并进去」，§16 写「下面的增改并进去」，可是上表里有几格与 0.9 相反，照它写用例或照它交付就会钉住已经作废的做法：

1. R1：「不做档在高峰对 GLM 会话的任意工具调用判为排队」「`builtinRulesFor` ……不做多 `glm-peak-stop`」。0.9 起不做档是三条附属条目，`builtin:glm-peak-stop` 只筛 `role: subagent`，GLM 主 Agent 的调用照常（`d-main-agent-peak-exempt`）；同一步 0.9 的增改（第 2081 行）又写主 Agent 三档下与无影响相同。两条用例同在一个文件里互相矛盾，照 0.8 那一格实现的就是人否掉的做法。
2. R3 的 0.9 一行：「`mustShow` 为 `[原文]`」。§9.3 第 2 条与 §7.2 在接缝核对时已改为脚本原文一片加每句注意事项（`scriptDetail` 的输出）；按这一格写的用例会钉住少核对注意事项的旧做法，人可能没看到「超时放行」那一句就同意了。
3. R4 的 0.9 一行：「后台满 20 个时直接结束」。执行器的 `GATE_LATE_MAX` 是 8（循环板 0.5 §6.6），§6.7 引的也是这个常量。
4. R5：用例要「旁边写『harness 还认不出这一条，暂不强制』」。§1.4 第 21 条与 §9.1 已按 M7 0.4 的从严做法与图上 `rules` 2026-10-30T05:41Z 的批注改成「这几条还没有机器认得的写法，暂时每件都全审」，0.8 那句作废。
5. §16 R4 的交付里还列着 `heldForPeak`；0.9 已删去（R3 的增改写了「`RulesService` 去掉 `heldForPeak`」，R4 的验收要核对它不在）。
6. V4 写「用户级目录里的文件」；0.9 起面板读的都在项目根下。

写用例的人对照正文能看出来，但验证计划是证明验收的地方，留着这几格就是给实施的人两份相反的指示，第 1 点还与人定的方向相反（`d-design-onepage`：违反方向清单就挡路）。

改法：把上面六格就地改掉，不再靠「并进去」：R1 那两句改为「不做档在高峰对 GLM 子 agent（`role: subagent`、`model` 为 GLM）的任意工具调用判为排队、对 `rules_show`、非 GLM 子 agent 与主 Agent（GLM 与非 GLM）放行；`builtinRulesFor` 不做档多 `glm-peak-stop`、`glm-peak-stop-dispatch`、`glm-peak-stop-scripts` 三条」；R3 改为「`mustShow` 是脚本原文一片加每句注意事项（`scriptDetail` 的输出），`remove` 时每条一行」；R4 改为「后台满 `GATE_LATE_MAX`（注入的小数）时直接结束」；R5 改为「旁边写『这几条还没有机器认得的写法，暂时每件都全审』」，`parseFloor` 前的跳过一句同改；§16 R4 删去 `heldForPeak`；V4 改为「面板能按绝对路径读与监视项目根下（`.llm/rules/` 与 `docs/rules/`）的文件」。

### F86（NIT）「主 Agent 的工具调用三档都不受管」几处没写派活那一次的例外

位置：文首第 9 行与 §3.6 第 425 行（「三档都不拦主 Agent 自己的工具调用」）、F17、§1.4 第 17 条（第 166 行「主 Agent 自己的工具调用在三档下的判定与无影响时相同」）、§13 第 2036 行（「主 Agent 从不被高峰模式排队或暂停」）。对照：同一条验收的 (a) 与 §3.6、§6.3：不做档里主 Agent 派 GLM 子 agent 的 `dispatch_task` 由 `builtin:glm-peak-stop-dispatch` 排队、单开在主 Agent 的会话上；少做档里 M7 按 `glmWorkerCap` 以 `slots_full` 拒绝它；R1 的 0.9 用例写的是「派活之外的每种调用」。

问题：派活那一次被排是在管子 agent，合 `d-main-agent-peak-exempt`（「高峰模式只管它派出去的子 agent」），但字面的「每一种调用相同」「从不排队」不成立，验收第 17 条自己前后两句相抵。

改法：几处都加半句「派 GLM 子 agent 的那一次调用除外（少做档的并行上限、不做档的派活排队，管的是子 agent）」；§13 那一行改为「主 Agent 从不被高峰模式暂停，它的调用只有派 GLM 子 agent 那一次会被排或拒」。

### F87（NIT）正文里留着几处 0.8 的说法

位置与改法：

1. §7.2 第 1163 行 `HostHeartbeat` 的注释仍写「心跳文件 projects/<key>/hosts/<pid>-<启动毫秒>.json」：改为「`<项目根>/.llm/rules/hosts/<pid>-<启动毫秒>.json`」（§5.4）。
2. §11.3 第 1957 行的降级原因列表第一项「没有用户级目录」：规则板 0.9 不用用户级目录，删去（后面已有「这个项目没有 .llm/ 目录」）。
3. §12 第 1966 行的第一行写「`when`、`lifetime.condition` …… §2.3 的条件」：0.9 起条件叫 `condition`，`when` 是下一行的 `Trigger`；改为「`condition`、`lifetime.condition`」。
4. §7.2 第 1085 行 `notices` 的 `kind: 'late-block' | 'script-killed'`：§6.7 与 §10.5 已把跑满上限叫 `capped`；改为 `'late-block' | 'script-capped'`，§6.4 的第二段同名。
5. §10.1 的枚举（第 1724 行）没有 `loops:schedule-tools` 与 `loops:files-only`，§1.4 第 12 条没有 `loops:files-only`，§2.6 两条都有：三处列同一组（F83 的改法会一并重写这一段）。

### F88（NIT）`remove` 提议的 `detail` 用了此刻的命中时刻，与「`detail` 只按存着的提议算」相抵

位置：§9.3 第 2 条（第 1529 行「`remove` 时 `markdown` 列出要删的几条与各自最近一次命中」）；§7.2 `attachable` 的注释（「detail 只按存着的提议（`Proposal.script` 与 `body`）算，不按此刻的文件系统」）。

问题：`Proposal.body` 在 `remove` 时只有 `{ids}`，最近一次命中在运行时的 `hits.json` 里；两次 `attachable` 之间某条规则又命中了，`markdown` 就变了。`mustShow` 只有「<id> <标题>」，摘要不变，核对不会出错，但人看到的与存下的不是同一份，和循环板为 F37 立的「提出时算好、存下、不重算」不一样。

改法：`rules_propose` 记 `remove` 提议时把 `[{id, title, lastHitAt?}]` 存进 `body`（或 `Proposal.detail`），`attachable` 只照它组 `markdown` 与 `mustShow`。

### F89（NIT）不带筛选的拦路脚本会在每一次工具调用之前跑，提议的注意事项没说

位置：§2.2 `filter` 一行（「没有即这个事件的每一次」）、§9.3 第 2 条规则板交的注意事项（路径、超时、失败做法、后台 10 分钟、晚到的拦下）、§12 脚本动作一行。

问题：一条 `when: gate.tool-call`、没有 `filter`、动作为脚本的规则，会在这个项目每个会话（含主 Agent）的每一次工具调用之前起一个进程，最多等 10–30 秒。人同意时看到的注意事项里没有「多常跑」这一句；循环板对同类代价有一句「每天大约叫醒主 Agent 48 次」。

改法：`cautions` 按内容加一句：没有 `filter` 时「每一次工具调用之前都会跑它（含主 Agent 的）」，`filter` 只按 `role` 或 `model` 筛时「<那一类会话>的每一次工具调用之前都会跑它」；或者在 §12 规定 `gate.tool-call` 上的脚本动作必须带 `tool`、`command` 或 `writes` 之一的筛选。

### F90（NIT）CHARTER 两处措辞

位置与改法：

1. §3.2 第 3 条（第 44 行）「每一条的命中、失败、超时与迟到的拦下进规则页、晨报与周报」：循环板的条目进的是循环板的页面；改为「进各自的板、晨报与周报」。
2. §9 用户级一行（第 142 行）列了 GLM 凭证、ZCode 设备号、关于用户的记忆、整个账号的额度与用量；循环板 0.5 §9.1 在用户级另有 `loops/machine/`（账号一级的运行锁、登录状态与 `loginRejectedSince`、额度快用完与登录失效「只说一次」的记录、最近走过步的主 Agent 在哪个项目）。它说的是整个账号的事，可以算在「整个账号的额度与用量」里，但 `d-memory-scope` 写的是「恰好这几样」。在这一格写明「整个账号的额度与用量，以及与之相关、只说一次的提醒状态（循环板）」，或由循环板把 `last-step.json` 搬进项目、其余在它的 §9.1 写明属于这一类。

## 已核实的假设

- `d-memory-scope`（2026-10-30T06:25Z）比任务说明「跨项目的经验与记忆还在问人」新；design-context 末节也记了它。0.9 文首、§4 与 CHARTER §9 照节点写，用户级的几样与节点一致（人设在用户全局配置一行，插件配置在 DSH profile 一行）。
- `d-script-timeout` 在 design-context 里是已定，不是待人定的默认；0.9 §19 写「没有」对。
- 共用执行器的接口：循环板 0.5 §6.6 的 `runScript`、`ScriptRequest.signal`、`ScriptResult` 四种、`LateScriptResult` 的 `capped`、`GATE_LATE_MAX = 8`、`HOURNESS_BOARD` 与私有副本，与规则板 §5.3、§6.7、§9.3 例子二的说法一致；规则板没有重抄执行器的契约。
- `FilterTest.matches`、`paths` 的目录前缀写法、`ScriptLang` 与后缀、`timeoutSeconds` 的范围（循环板 0.5 §2.2）与规则板 §2.3、§12 一致；`gate.` 事件可以带 `session` 字段（循环板 0.5 §3.2）。
- 同意的路：两块板的 `attachable` 都用 `scriptDetail`，`acceptProposal` 都核对「已给人看原文 <摘要>」（`attachDigest`），没有图时都打两次 accept、30 分钟内（循环板 0.5 §7.1 第 3、4 步与末段，规则板 §9.2、§9.3）；`AttachDetail` 的上限两边引同一处（循环板 0.5 §3.1）。M3 附录 0.4 的 `detail` 校验今天还是 800 码点、1–13 片每片 400（第 1044 行），两块板都请 M3 下一稿放宽，草稿 `m3` 一条写了。
- 循环板 0.5 §6.9 第 2 条删了 `heldForPeak`，第 4 条第 3、10 行与规则板 §10.7 第 8 点（第 7 行多半先成立、至多多一步）相符；主 Agent 从不被停之后两档同一张表说得通。
- `exec.callId` 在 rc.3 的执行对象上（`dsh-tools/lib/index.js`:3230、3241），M7 按它记 `trunkAdvanceFor` 可行。
- `src/guard/rules.ts` 今天有 `evaluate`（:151）、`shellCommandOf`（:115）、`renderCorrection`（:163）；`src/shared/health.ts`:79 有 `healthServiceName`。
- 两块板的「4 周没用过」各提各的：一条提议只能带一块板的 `attach`（M3 附录按前缀分派），合成一条要 M3 另加一种多前缀的写法；拆开之后各算周报的一件，仍在「一次至多三件」之内（循环板 0.5 §6.11 同样写）。这是对编排方「一批一条提议」的改动，理由写在 §10.5 与附录 G，草稿的 `schedules`、`m7` 两条记了，编排方记图时应同步 design-context 那一句。
- `hourness` 的验收第 3 条确实写「新门禁先影子后拦截」（图上 `hourness.acceptance[2]`）。
- 文件都是干净区：设计、CHARTER 的改动、草稿与接缝核对报告里没有人设用语。

## 没有核实或不对的假设

- 不对：CHARTER §6 的「门禁经用户同意即生效，不先以影子模式运行」对写在代码里的门禁不成立（`d-boards-as-hooks` 只取代人同意的条目上的影子先行；`ORCHESTRATION.md` §6.5、M4 0.4、M7 0.4 都还先影子），由此推出的「请 M5 改第 7 条经验」也不对（F82）。
- 不对：§7.5「`scripts` 里钉住的哈希照文件里的信（它们随 git 来，git 历史里有人同意时的提交）」：git 历史里只有提交，没有「人看过原文」的记录；那份记录在图上的拍板里，本稿没有去读（F84）。
- 不对：0.9 文首写图上的批注读到 05:55Z，之后 `rules` 上 07:12Z 的 M4 接缝请求没有接（F83）。
- 不对：§15、§16 的「照 0.8 写，下面的增改并进去」能得到一份一致的计划（F85）。
- 没有核实：M4 0.4 的 `classifyRecord` 会不会照 F83 的建议认 `record` 与 `late`（M4 0.4 第 4 轮评审未通过，还要再改一稿）；M3 下一稿是否放宽 `detail` 的上限、对 `rules:` 做第 5a 步；M7 是否加 `trunkAdvanceFor`（三件都是本稿对邻居的请求，按 `d-alignment-rounds` 在对齐轮里做）。
- 沿用上一轮、仍未核实：V3、V4（措辞要改，F85）、V11、V12、V13、V14；§6.6 里 0.3 起沿用的 rc.3 行号。

## 结论

HIGH 0、MEDIUM 4（F82–F85）、NIT 5（F86–F90）。按规则：CHANGES_REQUESTED。

0.8 第 1 轮的 F78、F79 关闭；F80、F81 在设计里关闭，放行稿的那几句留到重写放行稿时照改。

挡路的四条：

- F82：宪章把「先影子」对所有门禁都取消了，人定的只是板上人看过原文同意的条目；代码里的新门禁照旧先影子，`ORCHESTRATION.md` §6.5、M4、M7 都按这个写，M4 也请过写明分界。
- F83：M4 0.4 给规则板的接缝请求（代码规则目录导入 `GUARD_RULES`、共用违规流水的分类、`observe` 与 `noteDenial`、`evaluate` 删除）没有答复；M4 的四条规则在规则页上列不出，规则板写的 `record`、`late` 两种记录在 M4 的分类函数里没有归处。
- F84：仓库带来的脚本在新克隆与 `/rules recovery 文件 照改` 之后不经人看原文就跑；循环板对同一种情形不跑，同意的路两边不一致。
- F85：验证计划与实施表里还有六格是 0.8 的做法，其中一格让 GLM 主 Agent 在不做档里排队，与人定的方向相反。

四条都是局部的文字改动，改法都写在各条里，不用改规则板的结构；F82 要同批改 CHARTER 两句与草稿 `m5`、`hourness` 两条，F83 要加一节 §10.7 与一条 `m4` 的草稿。按任务约定本轮只审一次，不另起修改；放行稿不重写。

# 0.10 第 2 轮（设计 0.10）

本轮的严重程度只用 HIGH、MEDIUM、NIT 三级。挡路标准同前（`docs/DEVELOPMENT.md` §1.1；另按 `d-design-onepage`：模块设计违背方向清单即挡路，记为 MEDIUM）。

## 本轮审了什么

- 范围：0.10 只改 0.9 第 1 轮的九条发现（MEDIUM F82–F85，NIT F86–F90）、接住 M4 0.4 在 `rules` 节点 2026-10-30T07:12Z 的接缝请求，并新增 §16.1（自举前的最小一片，`d-rules-peak-slice`）。其余小节 0.9 已评、本轮不重审；只核这九条与 §16.1 改得对不对、有没有在改动处引入新问题。
- 输入：`design.md` 0.10（2664 行，下文「第 N 行」指它）；`design-v0.9.md`；记图草稿 `graph-ops-v010.json`（5 条批注，JSON 合法）；接缝核对报告 `seam-check-v010-v06.md`。
- 对照：`.agents/tasks/design-context.md`（「Both boards are hook-style; storage scope」「Main agent and peak; stale entries; hook seam」「Worked examples for the agent」「Check entries seam」）；方向清单 `node .agents/tasks/m1-l4/show-nodes.mjs rules schedules m4 d-boards-as-hooks d-script-timeout d-rules-in-repo d-memory-scope d-agent-examples d-main-agent-peak-exempt d-rules-peak-slice` 的节点正文与批注（`rules` 的 07:12Z M4 批注、08:47Z 人准这一稿，比本稿依据新，以节点为准）；`docs/CHARTER.md` 0.7（提交 `f2faa6f`）的 §6、§3.2 第 3 条、状态行、§9 存放表；M4 `.agents/tasks/m4/design.md` 0.4（`installRuleGate`、`evaluate` 删除、四条影子规则、`classifyRecord`、§2.4 违规流水入项目）；循环板 `.agents/tasks/schedules/design.md` 0.6（§6.6 执行器分队、§9.2 git 标记、§9.3 没在本机见过的条目）。
- 源码/图：`docs/graph/nodes/` 下各方向节点与 `rules.json`、`m4` 批注的正文（实读）。`src/guard/catalog.ts`、`src/shared/peak-mode.ts` 仍不在 main 上，是设计里的新文件。

## 0.10 是否写完整

写完整了：文首有 0.10 的逐条改动概述；§20 有 0.10 一条；附录 H 有 F82–F90 每条答哪里的对照表与不改项（F90）的理由；§16.1 新增、写了自举前最小一片；文件以附录 H 末表结束，没有截断。`design-v0.9.md` 在；`onepage.md` 仍是 0.8 的（按约定评审通过之后才重写）。`docs/CHARTER.md` 未被本稿改动（提交 `f2faa6f` 已定、任务要求不再动它）。

## 0.9 第 1 轮发现的状态

| # | 状态 | 依据（`design.md` 0.10 行号或节） |
| --- | --- | --- |
| F82 | Closed | §5.5（第 537–538 行）把 CHARTER 引用写明限定为板上条目、代码里的门禁照旧先影子；§10.1（第 1734 行起）开头一句写 M4 四条影子规则与 M7 升级阶梯照旧先影子后拦截、人同意即生效只对板上条目；§10.7 M5 一条撤回「请 M5 改第 7 条经验」、§19 保留 `hourness` 验收第 3 条不请人改；`graph-ops-v010.json` 的 `m5` 删第二点、无 `hourness` 一条。核实：`docs/CHARTER.md` 0.7 §6、§3.2 第 3 条、状态行、§9 已把「先影子」限定在代码门禁、板上条目即生效，设计与它一致 |
| F83 | Closed | §10.7 新增「M4 设计 0.4（图上 `rules` 2026-10-30T07:12Z 的批注）」一节逐件答复：代码规则目录导入 `src/guard/catalog.ts` 的 `GUARD_RULES`（§10.1、§1.4 第 12 条、§2.6）；违规流水写 `mode: 'record'`、`late`，请 M4 的 `classifyRecord` 认、M4 加上前 R7 自己数（§10.5）；采纳 `observe` 与 `noteDenial`、不采纳别的；§2.3 不再引 `evaluate`、改引 `installRuleGate`；违规流水入项目 `.llm/` 引 M4 0.4 §2.4；`graph-ops-v010.json` 加 `m4` 一条带 `classifyRecord` 请求。核实：M4 0.4 的 `installRuleGate`、`evaluate` 删除（G1）、四条影子规则 `credential-read`/`suppression-reason`/`checker-config`/`scratch-only`、`classifyRecord` 只认 enforce/shadow、§2.4 违规流水入项目都与设计所引一致；`src/guard/catalog.ts` 的 `GUARD_RULES` 来自 M4 07:12Z 批注（比 M4 文档正文新） |
| F84 | Closed | §7.5 末表「新克隆」一行与 `repo-adopt` 一段：带脚本的条目只在图上有一张 `done`、正文末行是 `proposalLine`、最后一条 `decide` 是人或带「已给人看原文 <摘要>」(= `attachDigest`) 的 `llm` 的提议式待决时才照哈希跑，否则读入但脚本不跑、按 `onError`（`gate.trunk-advance` 上拦下）、等 `repin`；`/rules recovery 文件 照改` 之后新加或改过的脚本同样不跑；§1.4 第 28 条、§15 R2 用例。与循环板 0.6 §9.3 一致（`seam-check-v010-v06.md` 第 5 点确认） |
| F85 | Closed | §15 R1 改为「不做档只排 GLM 子 agent（`role: subagent`、GLM）与派 GLM 子 agent，对 `rules_show`、非 GLM 子 agent 与主 Agent 放行」「`builtinRulesFor` 不做三条附属条目」；R3 `mustShow` 是 `scriptDetail` 的输出；R4 后台满 `GATE_LATE_MAX`（8）；R5 旁注改为「这几条还没有机器认得的写法，暂时每件都全审」；§16 R4 删 `heldForPeak`；V4 改为项目根下文件。§13 不变量与 §1.4 第 17 条亦与此一致 |
| F86 | Closed | 派活那一次的例外补在文首 0.9 一条、§3.6 第 437 行（「唯一的例外是它派 GLM 子 agent 的那一次调用……管的是被派的子 agent」）、§1.4 第 17 条（「唯一的例外是上面 (a) 派 GLM 子 agent 的那一次」）、§13 不变量（「它的调用只有派 GLM 子 agent 那一次会被排或拒」）。§1.2 功能需求 F17（第 148 行）仍写「三档都不拦主 Agent 的工具调用」而未显式写例外，但紧接「高峰模式只管 GLM 子 agent」传达了同一意思，不挡路 |
| F87 | Closed | `notices` 的 `script-killed`→`script-capped`（§7.2、§11.2 `rules.late-verdict`）；`HostHeartbeat` 心跳路径改到 `<项目根>/.llm/rules/hosts/`（§5.4 实读一致）；§12 `when`→`condition`；§11.3 降级原因删「没有用户级目录」。另两处未清的用户级旧说法见本轮 F91、F92（同类，不在 F87 枚举的范围内） |
| F88 | Closed | §7.2 `Proposal.body` 存 `[{id, title, lastHitAt?}]`、`attachable` 注释写「只按存着的提议算、不读此刻的 `hits.json`」；§9.3 第 2 条、§10.5、`rules_propose` 入参一致 |
| F89 | Closed | §9.3 第 2 条 `cautions` 按内容加「多常跑」：无 `filter` 时「每一次工具调用之前都会跑它（含主 Agent 的）」，只按 `role`/`model` 筛时「<那一类会话>的每一次」，筛了 `tool`/`command`/`writes` 的不写这一句 |
| F90 | Closed（本稿范围外，按任务不改宪章） | 设计不动 `docs/CHARTER.md`（提交 `f2faa6f` 已定、任务要求不再动它），§19 与附录 H 记明两处宪章措辞交编排方、`loops/machine/` 的点名归循环板。按简报「不再改 CHARTER、让设计与它一致」，设计与宪章一致（§10.5 的晨报/周报、§9.1 的规则页与宪章 §3.2 第 3 条的「进规则页、晨报与周报」相符）。F90 本身是宪章内部与循环板的事，规则板侧无需改动 |

## 对 F82–F90 与 thin-slice 的核对（按简报 item 1）

| 要求 | 结论 |
| --- | --- |
| F82：正文照已更正的 CHARTER（代码门禁照旧先影子，含 M4 影子规则与 M7 升级阶梯），撤回请 M5 改第 7 条经验，不请人替换 `hourness` 验收第 3 条 | 满足（§5.5、§10.1、§10.7 M5、§19；`graph-ops-v010.json` 的 `m5`） |
| F83：一份代码规则目录（采用 `GUARD_RULES` 为源）；违规流水 record 模式写出需要的取值并把请求放进草稿、不自造；显式采纳或拒绝 `observe`/`noteDenial`；停引 `evaluate` | 满足（§10.7 M4 一节、§10.1、§10.5、§2.3；草稿 `m4`） |
| F84：没在本机见过的条目/脚本，只在图上有人或带 relay 的 llm 拍的 `done` 提议才跑，否则列为未采用、不跑（同循环板 §9.3） | 满足（§7.5、§1.4 第 28 条、§15 R2；与循环板 0.6 一致） |
| F85：重写仍带 0.8 说法的验证与开工格 | 满足（§15 R1/R3/R4/R5、V4；§16 R4） |
| d-rules-peak-slice（thin slice）：说明哪一片在自举前先做，且是全设计的严格子集、不留要删的代码 | 满足。§16.1 写明三样（高峰档位、默认少做、少做并发上限与经服务交出的读法），逐样对到 R1–R4 里原样的函数/类型/服务成员，列出「不在这一片里」的部分，并写明自举后只加不改不删（`d-rules-peak-slice`）。节点正文写「按 0.9 定稿、0.9 评审通过后开工」，§16.1 更新为「按 0.10 定稿、0.10 评审通过后开工」，与 `rules` 节点 08:47Z 批注（0.9 未过、人准再给一稿 0.10）一致，是正确的更新 |

## 与循环板 0.6 的接缝（`seam-check-v010-v06.md`）

读了接缝核对报告：本轮两稿的修订只在规则板一侧落了两处（§6.7 的「两队」改引循环板 0.6 §6.6 的「几队」；§7.1、§1.4 第 28 条的 git 标记集加 `BISECT_LOG`，与循环板 0.6 §9.2 第 5 步对齐），循环板一侧无改。核对了设计正文与报告一致：§6.7 两处确为「几队」并注明 v010↔v06 接缝核对改；§1.4 第 28 条确有 `BISECT_LOG` 与「与循环板 0.6 §9.2 第 5 步对齐」。没在本机见过的条目的采用（F84）两板核心一致、机制各用各的（规则板核 `attachDigest`、循环板核脚本字节），归各自存储，报告列为「没有定下的」加强项、不挡路，与本轮判断一致。

## 发现

### F91（NIT）§10.7 给指标流水的请求仍按 `userDataHome()` 定位，与 §10.5 和 `d-rules-in-repo` 相抵

位置：§10.7「指标流水的设计（`metrics`）」一条（「DSH 之外的库写入口……按 `userDataHome()` 与项目键定位」）；对照 §10.5（「不在 DSH 里……经指标流水的库写入口，项目按 §7.3 的项目根定位（指标流水在项目的 `.llm/` 里，`d-rules-in-repo`；0.8 写的 `userDataHome()` 删去）」）与 `d-rules-in-repo` 补充（「指标流水……进项目的 `.llm/`」）。

问题：§10.5 已把命令行与 `gateOnRules` 经 `checkCall` 写 `rules.check` 的定位改为「按 §7.3 的项目根、落在项目 `.llm/`」，并明写 0.8 的 `userDataHome()` 删去；§10.7 给指标流水的那条请求仍写「按 `userDataHome()` 与项目键定位」。两节相抵，§10.7 这一句还把一条对邻居设计的请求写成用户级定位，若指标流水照它实现，命令行侧的 `rules.check` 会落到用户级、跨项目，违背 `d-rules-in-repo` 的存放范围。设计的实际存放决定（§10.5、§7.1、§13 不变量「规则板不写用户级目录」）是对的，这是一处没清干净的 0.8 旧说法（同 F87 那一类），所以记 NIT、不挡路。

改法：§10.7 指标流水一条改为「DSH 之外的库写入口（命令行与 `gateOnRules` 经 `checkCall` 写 `rules.check` 用，按 §7.3 的项目根定位、落在项目的 `.llm/`，`d-rules-in-repo`）」，与 §10.5 一致。

### F92（NIT）§13 第一条不变量的「理由」一栏仍写「规则文件在用户级目录」

位置：§13 第一条不变量（「只有人能增、改、解除、删除规则……」）的「理由」一栏（「人定；规则文件在用户级目录，引擎之外的写入还有文件门禁兜着」）；对照 §7.1、§11.3、`d-rules-in-repo`，以及 §13 自己后面的不变量「规则板不写用户级目录（0.9）」。

问题：0.9 起规则文件在仓库 `docs/rules/` 与项目 `.llm/rules/`，不在用户级；这条不变量的理由栏仍写「规则文件在用户级目录」，与同一张表后面的「规则板不写用户级目录（0.9）」直接相抵，也和 §7.1、§11.3 不符。这一栏只是理由文字，机制栏（`rules:files-only` 拦文件写入）正确，行为不受影响，所以记 NIT；但它是 F87 同类的 0.8 旧说法没清干净。

改法：理由栏改为「人定；规则文件在仓库 `docs/rules/` 与项目 `.llm/rules/`（`d-rules-in-repo`），引擎之外的写入还有文件门禁兜着」。

## 已核实的假设

- CHARTER 0.7（`f2faa6f`）：§6、§3.2 第 3 条、状态行把「先影子」限定为写在代码里的门禁，规则板与循环板上人看过原文同意的条目即生效、以四样保障代替影子期；§9 存放表的用户级一行是 GLM 凭证、关于人的记忆、账号额度与用量，ZCode 设备号在 `~/.zcode`。设计 §5.5、§10.1、§10.7 M5 与它一致（F82 的依据成立）。
- M4 0.4：`installRuleGate`（`src/guard/gate.ts`）是唯一安装函数、`evaluate` 删除（G1）；四条新规则 `credential-read`/`suppression-reason`/`checker-config`/`scratch-only` 以影子上线；`classifyRecord` 是读违规流水的唯一分类函数、只认 `enforce`/`shadow`/`effect: 'queue'`；违规流水 `.llm/audit/violations.jsonl` 按会话找项目（§2.4）。设计对这些的引用准确（F83）。
- `src/guard/catalog.ts` 的 `GUARD_RULES`：来自 `rules` 节点 2026-10-30T07:12Z 的 M4 批注（「代码规则目录改为导入 `src/guard/catalog.ts`，含四条影子规则」），比 M4 文档正文新，按「节点比文档新以节点为准」是权威来源；设计以「先合入的一方建 `catalog.ts`、另一方导入」的共用目录方式接它，框成接缝请求、不当作既有事实。
- 循环板 0.6（经 `seam-check-v010-v06.md` 与节点批注）：§6.6 执行器分 `gate`/`work`/`check`/`direct` 几队、`GATE_LATE_MAX = 8`、`LateScriptResult` 的 `capped`；§9.2 第 5 步 git 标记含 `BISECT_LOG`；§9.3 没在本机见过的条目按图上拍板认回。设计 §6.7、§1.4 第 28 条、§7.5 与之一致。
- `d-rules-peak-slice` 正文（节点 06:36Z）与 §16.1 的最小一片一致；节点写的「0.9 定稿/0.9 评审通过后开工」被更晚的 `rules` 节点 08:47Z 批注（0.9 未过、人准再给一稿 0.10）取代，§16.1 改为「0.10 定稿/0.10 评审通过后开工」，是正确更新。
- `graph-ops-v010.json`：5 条批注（`rules` 两条、`m4`、`m5`、`schedules`），JSON 合法；`m5` 已删「请 M5 改第 7 条经验」的第二点，无 `hourness` 一条；`m4` 带违规流水 `record`/`late` 的 `classifyRecord` 请求。与 F82、F83 的改法一致。
- 文件都是干净区：设计、草稿与接缝核对报告里没有人设用语。

## 没有核实或不对的假设

- 不对（本轮新发现，NIT）：§10.7 指标流水一条「按 `userDataHome()` 定位」与 §10.5、`d-rules-in-repo` 相抵（F91）；§13 第一条不变量的理由栏「规则文件在用户级目录」与设计自己的存放决定相抵（F92）。两处都是 0.8 旧说法没清干净，设计的实际存放决定是对的。
- 未核实（前向引用，不挡路）：`GUARD_RULES` 是否含 `metrics-files-only` 与循环板、M3、M7 的门——M4 07:12Z 批注只点名四条影子规则，设计把它们列进 `GUARD_RULES`（§10.1、§1.4 第 12 条，`metrics-files-only` 标「影子」）是前向的共用目录提案（「先合入的一方建 `catalog.ts`」），未在 M4 0.4 或指标流水 0.1 里确认；`metrics-files-only` 标「影子」与「新代码门禁先影子」的说法一致（CHARTER §6），可成立。按接缝框成请求，可接受。
- 未核实（本稿对邻居的请求，随对齐轮做）：M4 的 `classifyRecord` 是否认 `record`/`late`（M4 0.4 第 4 轮评审未过、还要再改）；M3 是否对 `rules:` 做第 5a 步并放宽 `detail` 上限；M7 是否加 `trunkAdvanceFor`。三件都在设计里写明「没合入时的退路」。
- 沿用前几轮、仍未核实：V3、V4、V11、V12、V13、V14 与 §6.6 里沿用的 rc.3 行号；本轮只核 0.10 改动处，未重数。

## 结论

HIGH 0、MEDIUM 0、NIT 2（F91、F92）。按规则：APPROVED。

0.9 第 1 轮的 F82–F90 九条全部关闭：F82（代码门禁照旧先影子、撤回对 M5 与 `hourness` 的两条请求）、F83（接住 M4 0.4 的接缝：导入 `GUARD_RULES`、违规流水 record/late 请 M4 分类、采纳 observe/noteDenial、改引 installRuleGate）、F84（仓库带来的脚本要图上带原文记号的拍板才跑）、F85（验证与开工表六格就地改）都已按简报 item 1 落实；NIT F86–F89 改掉，F90 按任务不动宪章、交编排方。`d-rules-peak-slice` 的最小一片在 §16.1 写明、是全设计的严格子集、不留要删的代码。与循环板 0.6 的接缝两处修正到位。

本轮两条 NIT 都是 0.8 的用户级旧说法没清干净（F87 同类，不在 F87 枚举范围内），设计的实际存放决定与 `d-rules-in-repo` 一致，不挡路，实施或下一次顺手改即可。按任务约定本轮只审一次：没有 HIGH 或 MEDIUM，规则板设计 0.10 通过，进放行稿一步。
