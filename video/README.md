# 宣传视频（Remotion）

dsh-hourness 的介绍视频，全部用代码画（[Remotion](https://www.remotion.dev)，React 组件按帧渲染成 MP4），不录屏。独立的 Node 项目，有自己的依赖与检查，不进本仓库插件的构建、preflight 与 test（根目录 `eslint.config.js` 忽略本目录）。

现有两支，都讲编排层，GLM 通道只在片尾带一句：

- `Sample`：横版样片，24 秒，30 帧，四段（标题 4 秒、一句话许愿 8 秒、放行后自己往下做 8 秒、片尾 4 秒）。按 1920×1080 排版，用 `make-music.mjs` 的合成配乐。它是画面风格的基准。
- `Short`：竖版短视频，40 秒，30 帧，按 1080×1920 排版，用 `make-score.mjs` 的采样配乐，每一刀都落在配乐的小节线上（一小节 2 秒）。

渲染时整体缩放出 2K、4K，代码不用改。

## 用法

```bash
npm i
npm run music                    # 生成样片配乐 public/music/sample.wav
npm run score                    # 下载音色库（第一次），生成整片总谱 score.mid 并渲染成 score.wav
npm run dev                      # 先生成两份配乐，再开 Remotion Studio 预览
npm run render                   # 1920×1080，out/Sample.mp4
npm run render -- Sample 2k      # 2560×1440，out/Sample-2k.mp4
npm run render -- Sample 4k      # 3840×2160，out/Sample-4k.mp4
npm run render -- Short 2k       # 1440×2560，out/Short-2k.mp4
npm run lint                     # ESLint 与 tsc
```

## 竖版 `Short` 的结构

| 小节 | 秒 | 画面 | 配乐 |
| --- | --- | --- | --- |
| 1–2 | 0–4 | 钩子：第 0 帧就是项目图最满的样子（第 15–16 小节的画面提前放），配一句问题「它怎么保证不乱改？」 | 声音标志 E–D–G–C |
| 3–6 | 4–12 | 许愿：一句话、四行方案、点头后复述、主 Agent 没有写文件的工具 | 主歌 |
| 7–10 | 12–20 | 项目图：目标分成三块，逐块放行；没放行的派不出活 | 预副歌，逐步加满 |
| 11–16 | 20–32 | 子 Agent 领活、只写划给它的文件、独立审查、主干只收检查过的提交；越界的写入被挡下。问题在这里得到回答 | 副歌 |
| 17–18 | 32–36 | 规则板与循环板 | 副歌后半 |
| 19–20 | 36–40 | 片尾一句话与包名，背景回到第 0 帧的项目图，循环播放时接缝看不出来 | 尾声，收在 Cadd9 |

为完播率定的规矩（改画面时照着核对）：

- 第 0 帧必须是全片最好看的一帧，字幕在第 0 帧已经出现，不做淡入。
- 开头抛出的问题要在后面回答；回答之前不放片尾。
- 每 2 秒（一小节）换一次字幕或画面，关掉声音也看得懂。
- 字幕标题不超过 10 个字（88 px 一行放得下），细节放到副标题。
- 安全区：字幕在上方，内容卡片在中部；画面下方约五分之一留空，给平台的标题、按钮与进度条。项目图横向不超出 x 945（1080 宽），右侧留给点赞、评论按钮。
- 最后一帧回到第 0 帧的画面，循环播放无缝。

## 文件

- `src/Root.tsx`：登记 `Sample` 与 `Short` 两支。
- `src/short/`：竖版。`timeline.ts` 是小节与字幕表（每句字幕的出处写在注释里）以及项目图上每件事发生的帧；`Graph.tsx` 是项目图的一个按时刻求值的画面（钩子、主体与片尾共用它）；`Chat.tsx` 许愿对话；`Boards.tsx` 规则板与循环板；`End.tsx` 片尾；`Caption.tsx` 字幕；`Short.tsx` 把各段排在小节线上并挂上配乐。
- `src/Sample.tsx`：四段的先后与时长，每段对齐配乐的小节（120 BPM，一小节 2 秒）。
- `src/scenes/`：每段一个组件。画面里的出现、打勾、进主干落在拍子上（一拍 15 帧）。
- `src/parts.tsx`：背景（深底、两团慢慢漂移的光晕、淡网格、颗粒、暗角）、淡入淡出、渐变字、毛玻璃卡片、描边胶囊、四行方案的加粗写法。
- `src/theme.ts`：配色（雾蓝到淡紫一组渐变作主色；进行中浅青、通过薄荷绿、强调杏色）、字体（英文 Segoe UI，中文微软雅黑）、缓动。
- `scripts/make-music.mjs`：配乐，从零合成，不用任何采样或第三方录音，所以没有本仓库以外的版权。风格是明亮的电子流行：七个微失谐的锯齿波叠成和弦并随底鼓抽吸，拨弦主旋律，低频贝斯，四拍底鼓与拍手，进副歌前的上升音效与落地的低频冲击。十二小节：前两小节铺垫，第 3–6 小节进副歌，第 7–10 小节最满（主旋律加高八度），最后两小节鼓退出、收在 Cadd9。和声 F–G｜Am–F–C–G ×2｜F–Cadd9。生成的 wav 不入库。
- `scripts/make-score.mjs`：整片的配乐。总谱在代码里写成 MIDI（`public/music/score.mid`，任何 MIDI 编辑器或宿主软件都能打开），再用真实乐器的采样渲染（`public/music/score.wav`，48 kHz）。20 小节、120 BPM、40 秒、C 大调：两小节钩子（四个音的声音标志 E–D–G–C）、四小节主歌、四小节预副歌、八小节副歌、两小节尾声；和声带副属和弦（E7/G#→Am7）、通往下属的 ii–V（Gm7 C7→Fmaj7）、借用的小调 iv（Fm6）与 V/ii（A7）。乐器：钢琴（伴奏与主旋律）、慢弦乐铺底、弦乐对位、指弹贝斯、钢片琴、拨弦、干净电吉他、定音鼓、反向镲与鼓组。采样渲染用 [SpessaSynth](https://github.com/spessasus/spessasynth_core)（Apache-2.0，npm 依赖）。
- `scripts/get-soundbank.mjs`：下载音色库 [GeneralUser GS](https://github.com/mrbumpy409/GeneralUser-GS) 及其许可到 `assets/`（不入库），按 GitHub 公布的 blob 编号校验。它的许可写明可以不受限制地用于自己的音乐创作，私用与商用都行。
- `scripts/render.mjs`：渲染，带 1080p、2k、4k 三档。先重新生成这一支的配乐（`Sample` 用 `make-music.mjs`，`Short` 先取音色库再跑 `make-score.mjs`），再调 Remotion；把 Chrome 的临时目录指到本目录的 `.tmp/`：本机上无头浏览器在系统临时目录里建不了缓存，渲染会在中途以 `write EOF` 退出。

## 内容的规矩

画面里的每一句都要在已放行的设计里找得到出处（`.agents/tasks/*/onepage.md` 与 `design.md`），不编没有定过的功能，不放没有来源的数字。示例用的项目是会议室预约，与练习题（记账小工具）不相干。对外发布之前，先复核 GLM 通道移植代码的许可与 GLM Coding Plan 的条款（项目图 `field-trial` 节点）。
