# 宣传视频改为纸面排版风（纸面底，状态色取自图纸风），第 2 轮

两支片（竖版 Short、横版 Sample）的样式层已换成人选定的风格：米白纸面平涂，宋体标题与字幕，近白卡片加黑色细线，朱红只标目标、加粗词、House、Harness、「周报」和出错的东西，状态色只有进行中琥珀与通过绿。第 2 轮按第 1 轮评审改了 `Graph.tsx`、`Ask.tsx`、`Drive.tsx` 三个文件：竖版项目图上一行任务卡上移、「日历视图」下移，三个「● 子 Agent」标签统一离卡 14 px；进度条在审查通过那一刻由琥珀转绿；「点头 ✓」挪到「你」头像上方；两支片右上角徽标贴到卡片右上角。重渲的两支 2K 成片写出时间晚于最后一次代码改动，36 张抽帧里第 1 轮指出的四处问题都已消失，没有看到新的遮挡、错位或读不清的字。相对工作树 HEAD 仍只改 `video/` 下 17 个文件，这一轮只动了坐标、颜色和内边距，时刻、文字、字幕与配乐都没动。

Watch for：提交前要先把分支快进到 origin/main，现在落后 68 个提交（confirmed）；任务目录里 15.4 MB 图片是否入库待编排方定（confirmed）；`video/README.md` 与 `choice.md` 说 `dsh-hourness` 用 Cascadia Mono，横版片尾那一处仍是黑体（confirmed，非阻塞）。

**Verdict**: APPROVED

## High-level view

第 1 轮的阻塞项已解决。「● 子 Agent A」标签上下都露出「冲突检查」到「日历视图」的连线，三个标签离各自任务卡的距离相同。代价是「日历视图」下沿到第 20 小节红标签上沿的余量从 23 px 缩到 13 px（1080 基准），以后再挪这一列要先看这条余量。

状态色与 `choice.md` 的绑定表一致了：第 17 小节通过的「冲突检查」是绿框加绿条，另两件仍是琥珀虚线框加琥珀条；第 18–20 小节三件都是绿。横版 Drive 没有进度条，不涉及。

「点头 ✓」离开了目标到「预约」连线的拐角；徽标贴到右上角以后，左沿离连线落点 16–50 px（2K），连线不再像接在徽标上。

剩下三条都不阻塞。分支基点与图片入库属于提交那一步；`dsh-hourness` 的字体说法与横版片尾画面有一处出入，画面照的是纸面样张，改代码或改文档都行。

<details>
<summary>Issues (3)</summary>

1. **分支落后 origin/main 68 个提交** — 提交那一步先快进到 origin/main 再提交，避免提交看起来在回退上游工作；上游这段时间没碰 `video/` 与本任务目录，不会冲突。
2. **任务目录图片入库量** — 36 张抽帧（11.2 MB）与 30 张样张（4.2 MB）未跟踪，提交前由编排方定哪些入库、是否缩小。
3. **`dsh-hourness` 字体说法与横版片尾不符** — 在 `End.tsx` 给片尾的 `dsh-hourness` 套上 `MONO`（文字不变），或把 `video/README.md` 那句收窄到「标题页的 `dsh-hourness`」；改哪边都不影响验收，可与提交同批。

</details>

<details>
<summary>Details</summary>

### 竖版项目图这一列已经没有余量

`TASKS` 里「冲突检查」「到点通知」中心 y 由 1100 改为 1072，「日历视图」由 1265 改为 1275，标签偏移提成常量 `CHIP_GAP = 14`。从 `short-bar16-f0940.png` 放大看，A 标签上方和下方都能看到连线，与 verify.md 记的 20 px、47 px（2K）一致。

B 标签现在占 y 1341–1391，第 20 小节红标签的落点在 y 1340，两者在位置上相接。它们不会同时出现，靠的是时刻：B 在 `T.reviewed[1] + 8`（第 17 小节末）淡出，红标签在 `T.rogue`（第 20 小节起）才进。上面是模块卡下沿到「冲突检查」上沿，下面是「日历视图」到红标签的 13 px，这一列以后不管挪坐标还是改时刻，都要重看这两处。

### `dsh-hourness` 的字体

`choice.md` 的落地风格写「`main`、`dsh-hourness`、场景编号 Cascadia Mono」，`video/README.md` 的 `theme.ts` 一条照抄了这句。横版标题页的 `dsh-hourness` 用了 `MONO`，横版片尾 `End.tsx` 的「dsh-hourness · DeepSeek Harness 编排层插件」整行仍是正文黑体（`sample-bar12-f0700.png` 可见）。纸面样张 `samples/paper/sample-4-end.png` 也是黑体，所以画面照的是样张，出入在文字说明。

### 提交前的分支基点与图片

工作树 HEAD `b3fa154` 仍是 origin/main 的祖先，现在落后 68 个提交（第 1 轮时 28 个）。`git diff origin/main` 里 `src/`、`tests/`、`ui/`、`docs/graph` 的大段删除全来自这些上游提交；`git diff HEAD origin/main -- video/ .agents/tasks/video-restyle/` 为空。verify.md 记明本步不快进，因为快进会改动本步不许碰的目录，留给提交那一步。

未跟踪的任务目录里有 36 张抽帧（11.2 MB）和 30 张样张（4.2 MB）。第 1 轮评审写的「31 张样张」数错了。

</details>

<details>
<summary>File map</summary>

本轮改动：

- `video/src/short/Graph.tsx`：任务卡坐标、`CHIP_GAP`、进度条颜色随卡片状态、`Badge` 贴右上角（`right: 0`）并把左右内边距收到 12 px。
- `video/src/short/Ask.tsx`：「点头 ✓」由 top 762 挪到 top 560。
- `video/src/scenes/Drive.tsx`：`Badge` 贴右上角（`right: 0`）。
- `.agents/tasks/video-restyle/choice.md`（未跟踪）：绑定表「通过」一行补上进度条及决定来源。

两轮合计相对工作树 HEAD 的改动：

- `video/src/theme.ts`：纸面配色与两种状态色，`SERIF`、`MONO`、`tint`；删 `ACCENT`、`PASSED`、`SILVER`；缓动改为 `Easing.out(Easing.cubic)`。
- `video/src/parts.tsx`：`Backdrop` 改平涂纸面加细框；删 `Glow`、`GradientText`、`GLASS`；新增 `Rule`、`CARD`、`USER_BUBBLE`、`pill`、`CardState`/`stateEdge`、`edgePath`；`Reveal` 上浮 24 → 12 px。
- `video/src/scenes/Title.tsx`、`Wish.tsx`、`End.tsx`、`Drive.tsx`：横版各段换成纸面样式。
- `video/src/short/Title.tsx`、`Caption.tsx`、`Avatar.tsx`、`Claim.tsx`、`Drift.tsx`、`Rework.tsx`、`Name.tsx`、`Ask.tsx`、`Report.tsx`、`Graph.tsx`：竖版各段换成纸面样式，去掉推镜、缩放、呼吸与发光。
- `video/README.md`：`parts.tsx`、`theme.ts` 两条说明重写，Short 表第 1–2 小节画面描述改写；本轮未改。
- `.agents/tasks/video-restyle/`（未跟踪）：`choice.md`、`verify.md`、`samples/`、`frames/`、本评审。

核对依据：成片 `Short-2k.mp4` 6,500,790 字节、`Sample-2k.mp4` 3,367,423 字节，与 verify.md 一致，写出于 00:54，晚于最后一次代码改动（`Graph.tsx` 00:52:40）；抽帧 Short 24 张、Sample 12 张。按任务要求没有重跑 lint 与渲染，lint 结果以 verify.md 为准。

完整改动：`git -C .worktrees/video-restyle diff HEAD -- video/`。与 origin/main 的差异混有 68 个上游提交，不要用它审本次改动。

</details>
