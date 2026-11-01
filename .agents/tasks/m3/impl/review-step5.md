# 阶段提醒与设计期只读：附录第 5 步的独立评审

评审对象是 `.worktrees/m3`（分支 `m3`）上这一步唯一的提交 `e48fc70`，叠在第 4 步和 S3-1 修复之后。我读了整个提交：`src/graph/modules.ts`、`digest-notice.ts`、`reminder.ts` 与 `service.ts` 的改动、`src/design/stage-notice.ts`、`src/guard/design-release.ts`、`main-agent.ts` 的改动、`design/index.ts` 的接线、`stage.ts` 的两条 `hint`、五份文档的改动、探针脚本、`design-guard.spec.ts` 与 `design-host.ts` 的改动，以及两个新 spec 的用例清单。对照附录 0.5 的 §2.1、§2.3、§3.14.1、§3.14.6、§4 第 5 步，`design.md` §3.3.3，`onepage.md`，`design-context.md`，图上 `m3-3`、`m3-6` 的验收条件和 `docs/DEVELOPMENT.md` §1.1。没有重跑套件，采用提交说明记录的结果：build、preflight 退出码 0；test 1091 通过 0 失败；eslint、knip、jscpd 与基线相等，提交没有碰基线文件，diff 里没有新增压制注释；probe 165/165。这一步没有更早一轮的评审文件，没有旧发现要逐条核对。工作树干净。

## 摘要

这一步做两件事。一是主 Agent 每一步在被接纳的消息之后带一条阶段提醒（`agent/pre-step` 的 notice，来源 `glm-design-stage`），写明焦点所在目标的阶段、本阶段怎么做、还缺什么、下一步问人什么；分了模块的目标另有框架写法、模块清单和模块里的写法。二是第四条主 Agent 规矩 `design-before-release`：主 Agent 派出去的各层子 agent，在焦点所在的目标（分了模块的目标是焦点所在的模块）放行之前，写文件的调用被拒。实现与附录逐条对得上，文档与代码同批，设计行仍是 `disabled: true`。没有阻塞项。

Watch for：（1）PTC 预设下，带 `parent` 的嵌套调用在监听器第一行就放行，子 agent 在放行之前可以经 `run_code` 写文件；文档在 §6.8 如实写了，§6.4、§6.7 与身份节的说法仍是无条件的，编排方对 S4-1 的裁定写的是「第一个再碰这个文件的步骤里修」，这一步碰了（confirmed，读代码；触发条件 likely，要选 PTC 预设）。（2）规则在每次写入时按根的当前焦点判，不记派发时的焦点；主 Agent 派出去之后把焦点移到已放行的模块或目标一级，先前派给未放行模块的子 agent 的写入就过了，§6.8 的残余清单只写了目标一级焦点这一种（confirmed，读代码）。

**Verdict**: APPROVED

## 高层视图

「派出去的 agent 是否放行前只读」：默认的原生工具模式下成立。监听器只在会话头带 `origin: 'subagent'` 且调用本身是写入时才沿 `parentSession` 找根，根是主 Agent 才按它的焦点判；孙 agent 与 `subagent_fork` 的会话走同一条链，与 `maxDepth` 无关。判不出的一类（没有 `agents` 服务、链断了、成环、图行不在、读图抛错）放行并在子会话和根会话上报 degraded。缺口是嵌套调用不判（S5-1）和按写入时的焦点判（S5-2）。

「主 Agent 有没有写文件的办法」：这一步没有动工具面，对 `main-agent-no-write` 只做了等价提取，判写顺序没变。缺口仍是第 4 步评审的 S4-1，现在同一个缺口也覆盖子 agent 的只读。

「阶段提醒」：正文从图和焦点读出，「下一步」取步号最小的缺项。「只在变化时带」的规则从 `reminder.ts` 抽到 `digest-notice.ts`，两处共用，`graph-reminder.spec.ts` 没改。读图失败这一步不带提醒，进程里警告一次，会话健康写明。

「高峰」：没有东西拦主 Agent。新代码不读高峰档位，不排队、不等子 agent；主 Agent 这条路上新增的等待只有每步读一次图目录，子 agent 写入时的整图读取只拖慢子 agent 自己的那次调用。

「人的原话」：这一步不碰。没有 `relay`、没有 `record_human_answer`，原话核对在第 6 步；一条旧路需要第 6 步的评审核对，见 Details。

<details>
<summary>Issues (4)</summary>

1. **S5-1 嵌套调用不判，子 agent 的只读在 PTC 预设下不成立**（MEDIUM，非阻塞，confirmed 读代码，触发条件 likely）：`main-agent.ts` 对带 `parent` 的调用一律 `next()`，第 4 步评审的 S4-1 已指出主 Agent 自己有同样的洞。编排方的裁定是 S4-1 在第一个再碰同一文件的步骤里、以独立提交修；这一步碰了该文件，提交说明把它推到「下一个能带它的提交」。请把 S4-1 作为独立提交排在第 6 步之前，让嵌套的写工具调用同样过规则（对子 agent 的会话也是，`judgeDelegated` 同一条路），或在工具模式为 `ptc` 时行健康降级；并把 §6.4、§6.7、§6.8 与身份节的无条件说法改成与实际相符。
2. **S5-2 按写入时的焦点判，残余清单少一种**（LOW，非阻塞，confirmed）：`judgeDispatchedWrite` 每次写入都读根当前的焦点。主 Agent 派出写模块 B 的子 agent 之后把焦点移到已放行的模块 A 或目标一级，B 的子 agent 之后的写入就放行。附录 §3.14.6 第一段写了「焦点在已放行模块 A、子 agent 写模块 B」，`ORCHESTRATION.md` §6.8 的残余只写了目标一级焦点一种。在 §6.8 的残余里补上这一种（含「派发之后焦点移动」），M7 的 `releaseOf` 接手这一行的判定时一并收掉。
3. **S5-3 提醒点名的工具和 `kind` 在这条分支上还不存在或不收**（NIT，非阻塞，confirmed）：「下一步」写 `propose_to_human (kind confirm)`、`(kind release)`，访谈第 7 步写 `record_human_answer`；工具在第 6 步才有，第 6 步按附录对 `confirm`、`release` 先返回 `invalid`（`not yet`），到第 8、9 步才打开。提交说明只写了「第 4 步与第 6 步在分支上之前设计行保持禁用」。条件改成：第 8、9 步也在分支上之前，不在沙盒、田野试验或任何真实会话里启用设计行；合入 main 是第 12 步，main 看不到这一段。
4. **S5-4 要编排方落笔的事**（过程，非阻塞）：提交说明的 11 条解释里，第 3 条（L2 的「模块是目标下直接的特性」一句钉成英文原文加 `norm-directions`）、第 4 条（分了模块的目标在 `design` 阶段只给框架写法，候选按目标一级读，目标退回 `design` 时即使焦点在模块里也显示目标一级文字）、第 6 条（未判写入的健康同时报在子 agent 和主 Agent 会话）、第 7 条（探针场景的请求序号与 0.4 脚本不同、新增 `glm-design-released`）按「由 agent 定、人可推翻」记进图。S4-1 到 S4-4、S3-1 评审的 R1 到 R4 仍欠（这一步没有碰相关文件），都要在合并步骤之前清掉。

</details>

<details>
<summary>Details</summary>

### 子 agent 的写入怎么判，判在哪一层

监听器先放行带 `parent` 或没有会话的调用，再看调用本身，不是写入的在问会话之前放行。会话头带 `origin: 'subagent'` 的走 `judgeDelegated`，是写入才调 `judgeDispatchedWrite`；这个函数从不抛错，任何一步抛了都落进 `{kind: 'allow', unjudged}`。

```
子 agent 的写入 ──> dispatchRoot ──> 根不是主 Agent ──> 放行
                      │
                      ├─ 链断 / 成环 / 根不活 ──> 放行 + degraded
                      └─ 根是主 Agent ──> focusOf(根会话) + loadGraph(dir)
                                              └─ releaseVerdict ──> 拒绝 / 放行
```

`releaseVerdict` 的次序与附录一致，纠偏四段的文字与附录逐字一致。已被废弃的模块不是模块（状态不在已批准、进行中、完成里），它下面的节点按「不在任何模块里」处理，只受目标一级的判定管。

两个范围上的限制。第一，判的是根此刻的焦点，不是派发那一刻的焦点（S5-2）：`focusOf` 在每次写入时重读，主 Agent 在子 agent 还在跑时移走焦点，规则随之改判。第二，目标一级焦点在大循环放行之后放行，这是附录 §3.14.6 第二段的有意残余（R5-N1），提示靠阶段提醒里的 `graph_focus to the module or the task it belongs to` 一句，L2 和 L3 都钉了。

### 嵌套调用

`payload.parent !== undefined` 在监听器第一行放行，这与 guard 的其他规则一致，也是 `design.md` §3.3.3 写明的做法。默认的原生工具模式里 `run_code` 不在工具面上，这没有后果。选了 `dsh-web-app` 带的 PTC 预设之后，`run_code` 里的 `tools.write(...)`、`tools.pwsh(...)` 作为带 `parent` 的子调度经过 `tools/pre-execute`，主 Agent 和它的子 agent 的写入都不被判。§6.8 的残余第一条如实写了这件事并指向 S4-1；§6.4 的「已实现」和 §6.7 的残余清单没改，身份节第一部分对主 Agent 说「你没有写文件的工具」「子 agent 只读」，也没有条件。修法在第 4 步评审已经给了两条路；要点是 `judgeDelegated` 与主 Agent 的一支共用同一个入口，一次修两处。

### 阶段提醒的两处取舍

提醒的资格取自本步组装时记下的判定，组装在 `agent/pre-step` 之前，所以 `/wish`、`/wish off`、主 Agent 被移走都在同一步生效。焦点取 `focusOf`：会话可见历史里最近一次成功的 `graph_focus` 或投影 notice，再看内存里 `graph_focus` 留下的那一个，与每步投影同源。我把 `projectionHistory` 与新拆出的 `noticeHistory`、`changeReason`、`focusFromHistory` 逐分支对过，结果一致。

`stage.ts` 里 `lastDecidedByHuman` 仍把任何带 `relay` 的拍板当作人定的。需求卡的「岔路」一项和放行门禁的「人定待决」靠它，所以提醒里的「已填 8 项」可以由一条编的 `relay` 凑出来。这条旧路在 main 上就有，由第 6 步的 `main-agent-graph` 第一条（编的原话被拒）和 `record_human_answer` 的核对收口；设计行在第 6 步之前保持禁用，这一步不构成缺口，第 6 步的评审要核对这一点。

### 附录点名的用例与过程规则

附录第 5 步点名的 L2、L3 用例都写了，四个没写的在提交说明里给了理由，我认可：「读模块抛错放行并报健康」没有注入口，`moduleOf` 是纯函数，读图失败走同一个 catch 且那一个用例写了；「焦点链上没有目标」引擎写不出这种图，改在内存图上直接测 `releaseVerdict`；`/graph-apply` 的阶段推进场景随第 7 步取消；大循环门禁与事前验尸行属于第 8、9 步，测试断言它们此时不存在。旧用例「委派子会话不判」改成「别的项目与普通会话不判」，子会话的父指向普通会话，没有被削弱。

过程规则逐项：一个提交，标题 `feat(m3-3)`，正文点名 `m3-3`、`m3-6`；文档与代码同批；设计行仍禁用；`installStageNotice` 在 try 里，失败只警告并报健康；基线文件未动，没有新压制；`tests/graph-memory.ts` 复用 `execute-helpers.ts` 的 `node`、`graphOf`，jscpd 没增加。M7 的 STAND-IN 保留不动，换成 `./modules.ts` 留给合并，`ORCHESTRATION.md` §17.2 写了。

</details>

<details>
<summary>File map</summary>

完整 diff：`git -C .worktrees/m3 show e48fc70`。

- `src/graph/modules.ts`（新）：`DIRECTIONS_ID`、`directionsOf`、`frameworkOf`、`modulesOf`、`moduleCandidatesOf`、`moduleOf`、`isReleased`、`isSplit`
- `src/graph/digest-notice.ts`（新）：从 `reminder.ts` 抽出的「只在变化时带」读法
- `src/graph/reminder.ts`：改用 `digest-notice.ts`，导出 `focusFromHistory`
- `src/graph/service.ts`、`src/graph/index.ts`：图行服务新成员 `focusOf`，读取方 `graphFocus`
- `src/graph/stage.ts`：两条 `hint` 改写，`isClosed` 导出
- `src/design/stage-notice.ts`（新）：阶段提醒的正文、对照表、历史判断、安装
- `src/design/index.ts`：按组装结果装提醒，把 `agents` 与焦点服务交给规则
- `src/guard/design-release.ts`（新）：`dispatchRoot`、`releaseVerdict`、`releaseCorrection`、`judgeDispatchedWrite`
- `src/guard/main-agent.ts`、`main-agent-rules.ts`：同一监听器判委派会话的写入，第四条规矩登记
- `docs/ORCHESTRATION.md`、`DESIGN.md`、`DEVELOPMENT.md`、`HANDOFF.md`：§3.1、§4.8、新 §4.9、新 §6.8 与相关行
- `package.json`：测试脚本加两个新 spec
- `scripts/probe/*`：三个 L3 场景与 `designStage` 记录
- `tests/`：两个新 spec、`design-guard.spec.ts` 扩充、`graph-memory.ts`、`design-host.ts`、`graph-row.spec.ts`、`graph-stage.spec.ts`、`contracts.spec.ts`

</details>
