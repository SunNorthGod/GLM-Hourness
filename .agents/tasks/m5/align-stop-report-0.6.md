# M5 对齐轮停止报告

日期：2026-10-31
设计版本：0.6（`.agents/tasks/m5/design.md`）
判定：CHANGES_REQUESTED（`.agents/tasks/m5/decisions-review.json`，评审全文 `.agents/tasks/m5/decisions-review.md`，第 2 轮）
本步结果：不写 `onepage.md`，不动旧的 `onepage.md`，不建 `onepage-done.md`。此前没有 `align-stop-report.md`，所以没有旧报告需要改名。

## 为什么停

评审的判定不是 APPROVED，按本步的规则视为设计的阻断项在两轮修订与评审之后仍然存在。评审第 2 轮的统计是 HIGH 0 条、MEDIUM 1 条、NIT 3 条；MEDIUM 大于零，所以判定为 CHANGES_REQUESTED。评审之后没有任何文件被改：`design.md` 最后写入 13:46，`decisions-check.md` 13:47，`graph-ops-decisions.json` 13:49，评审结果写于 14:52。下面的三处原文位置本步又核对过，仍是评审指出的样子。

评审对 `design.md` 的实质内容没有意见：定案 `d-code-rules-enforce` 触到的位置（第一批经验第 7 条及引用它的几处）都已改对，定案 `d-credentials-readable` 与 `d-timeout-measured` 不触 M5。阻断项出在核对记录和要写进图的批注里。

## 仍然存在的阻断项

### F1（MEDIUM）核对记录和图批注说宪章与编排文档"仍写先影子后拦截"，当前 HEAD 已不是这样

位置：
- `.agents/tasks/m5/decisions-check.md` 第 4 节第一条。
- `.agents/tasks/m5/graph-ops-decisions.json` 第 1 个对象（`id` 为 `m5`）里的一句：「留给文档那一批：docs/CHARTER.md 0.7 §3.2 第 3 条后半句、§6 与 docs/ORCHESTRATION.md §6.5 仍写先影子后拦截，M5 的 0.6 已不再引用」。

问题：提交 `cd257a7`（2026-10-31 13:43:16）已按定案 `d-code-rules-enforce` 改写这三处。`docs/CHARTER.md` 现为 0.8，第 44 行（§3.2 第 3 条）和第 77 行（§6）写明没有影子期、试运行期，也没有从只记录转为拦截的台阶；`docs/ORCHESTRATION.md` 第 796 行（§6.5）写明没有只记录不拦的试运行期，并注明取代此前的定案。三份产物写于该提交之后，对 CHARTER 和 ORCHESTRATION 读的是旧版或没读。

评审给的改法：把批注里那一句、以及 `decisions-check.md` 第 4 节第一条，换成：

> 宪章与编排文档里"先影子后拦截"的条款已由提交 cd257a7（CHARTER 0.8 §3.2 第 3 条与 §6、ORCHESTRATION §6.5）取代，M5 对这些文档没有要改的请求。

第 4 节第二条（R5-01 至 R5-08 留到实现时）保留。

## 对项目的影响

- 图批注一旦照现状写上 `m5` 节点，图上会多一条与 HEAD 相反的记录，之后的人可能据此再排一批已经做完的文档改动。批注目前没有执行，所以图上还没有这条错误记录。
- `design.md` 的实质内容不受影响，M5 的实现排在 split 合入之后，不在自举关键路径上，没有被这一条耽误。
- 给人看的一页稿没有按 0.6 改写：现有 `onepage.md` 仍描述 0.5，第 53 行还写着"第 7 条里『新的合入前检查先试运行』保留"，与定案相反；那九条"怎样算做完"仍在旧 `onepage.md` 里，`onepage-done.md` 不存在。在重做之前，人读到的 M5 一页稿是过期的。

## 评审同时指出的三条 NIT（不阻断，修 F1 时顺手改，同一批文件）

- F2：`d-timeout-measured` 在图上已是 approved，三处仍写"D-timeout，待人定"：`design.md` §15 0.6 第三个子条、`decisions-check.md` 第 3 节标题、`graph-ops-decisions.json` 第 1 个对象。改为"脚本与检查的超时（`d-timeout-measured`）：不触本稿"。结论不变，只是标签错。
- F3：`design.md` 第 6 行依据写"`docs/CHARTER.md` 0.7（§3.2 第 3 条、§6、§9）"，这两条在 0.8 才被改写。改为 0.8；§1.1、§5.1 和 0.4、0.5 修订记录里的"CHARTER 0.7 §9"不动。
- F4：`graph-ops-decisions.json` 两条批注里「」中的话是转述，不是原文，读者找不到被取代的是哪一句。`m5` 批注改为引 `start a new gate in shadow mode and count false denials before enforcing it`；`lessons` 批注改为引 2026-10-30T21:57:57Z 那条批注里的原句"第一批 21 条与「新的门禁先在影子模式运行」的保留不变"，并说明它作废。

## 建议

1. 先按上面的改法修 F1 至 F4。改动共三个文件：`decisions-check.md`（第 3 节标题、第 4 节第一条）、`graph-ops-decisions.json`（第 1 个对象的两句、第 2 个对象的一句）、`design.md`（第 6 行、§15 0.6 第三个子条），都是句子级替换，不碰设计内容。
2. 再请评审只看这三个文件的上述位置，一轮即可。评审自己说重审范围就是这些位置。
3. 通过之后重跑本步：写 `onepage.md`（0.6 的新格式）和 `onepage-done.md`，旧稿另存为 `onepage-0.5.md`；改写时第 53 行那句必须去掉。

如果编排方愿意直接按评审给的原句修 F1 并跳过重审，风险只在 F1 的替换句本身，评审已把句子写好，可以逐字采用。这个取舍留给编排方。
