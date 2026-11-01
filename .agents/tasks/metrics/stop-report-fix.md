# metrics fix 轮停止报告：设计 0.6 已放行，一页放行稿两遍未放行

日期：2026-11-01
设计版本：0.6 第二遍（`.agents/tasks/metrics/design.md`，2026-11-01 10:13）。第一遍稿存为 `design-0.6-pass1.md`。
设计评审：`design-review-fix.md`、`design-gate-fix.json`。结论 APPROVED（HIGH 0，MEDIUM 0），共 2 遍。第 1 遍关闭 F49，结论 CHANGES_REQUESTED（挡路 F57）；第 2 遍关闭 F57–F62 与第 4 轮带过来的 F50–F56，结论 APPROVED。第 2 遍新记 F63–F65，均为 NIT，不挡路。
一页放行稿评审：`onepage-review-fix.md`、`onepage-gate-fix.json`。共 2 遍，已用完。第 1 遍：HIGH 0，MEDIUM 3（O1–O3），NIT 4（O4–O7），CHANGES_REQUESTED。第 2 遍：O1–O7 全部关闭；HIGH 0，MEDIUM 1，NIT 1，CHANGES_REQUESTED。挡路数由 3 降到 1。
`onepage.md`（2026-11-01 10:39，3398 B）是第 2 遍评审的版本，未放行，不能交人。

## 留下的发现

| 编号 | 级别 | 一句话 |
| --- | --- | --- |
| O8 | MEDIUM（挡路） | 样稿让人在照片整理工具项目里敲 `npm run metrics -- summary`，这条命令只是插件仓库 `package.json` 的脚本；改为在插件仓库的命令行敲 `npm run metrics -- summary --project <照片整理工具的目录>`。 |
| O9 | NIT | 覆盖行写「丢了 0 条」，设计 §7.3 只数本进程；改为「这次启动以来丢了 0 条」。 |
| F63 | NIT（设计，不挡路） | §7.3 引面板设计 1.3 的行号已失效；改为引 §1.5 与 §12 第 29 条。 |
| F64 | NIT（设计，不挡路） | `isPruneCall` 只看段首一词，`& npm …`、`cmd /c npm …`、`env X=1 npm …` 会漏拦；补切分与前缀跳过，加两条验收例。 |
| F65 | NIT（设计，不挡路） | 规矩六说 `TimeoutLine` 没有 `kind`，与 M4 不符；`ValueLine` 到 `timeout.set` 的映射缺 `entry`、`kind`、`prevMs`、`told`。 |

## 本步没有动的文件

`design.md`、`onepage.md`、`docs/graph/` 都没有写，没有提交。

## 交给编排者的事

1. 是否给一页放行稿第 3 遍。剩下的 O8 改一句命令写法、O9 改几个字，改法评审已给，不动已放行的设计，不需要人定。
2. F63–F65 可在设计下一次修订时一并处理。
