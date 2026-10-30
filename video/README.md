# 宣传视频（Remotion）

dsh-hourness 的介绍视频，全部用代码画（[Remotion](https://www.remotion.dev)，React 组件按帧渲染成 MP4），不录屏。独立的 Node 项目，有自己的依赖与检查，不进本仓库插件的构建、preflight 与 test（根目录 `eslint.config.js` 忽略本目录）。

现有一支样片 `Sample`：24 秒，30 帧，四段（标题 4 秒、一句话许愿 8 秒、放行后自己往下做 8 秒、片尾 4 秒），讲编排层，GLM 通道只在片尾带一句。画面按 1920×1080 排版，渲染时整体缩放出 2K、4K，代码不用改。

## 用法

```bash
npm i
npm run music                    # 生成配乐 public/music/sample.wav
npm run dev                      # 先生成配乐，再开 Remotion Studio 预览
npm run render                   # 1920×1080，out/Sample.mp4
npm run render -- Sample 2k      # 2560×1440，out/Sample-2k.mp4
npm run render -- Sample 4k      # 3840×2160，out/Sample-4k.mp4
npm run lint                     # ESLint 与 tsc
```

## 文件

- `src/Root.tsx`：登记 `Sample` 这一支。
- `src/Sample.tsx`：四段的先后与时长，每段对齐配乐的小节（120 BPM，一小节 2 秒）。
- `src/scenes/`：每段一个组件。画面里的出现、打勾、进主干落在拍子上（一拍 15 帧）。
- `src/parts.tsx`：背景（深底、两团慢慢漂移的光晕、淡网格、颗粒、暗角）、淡入淡出、渐变字、毛玻璃卡片、描边胶囊、四行方案的加粗写法。
- `src/theme.ts`：配色（雾蓝到淡紫一组渐变作主色；进行中浅青、通过薄荷绿、强调杏色）、字体（英文 Segoe UI，中文微软雅黑）、缓动。
- `scripts/make-music.mjs`：配乐，从零合成，不用任何采样或第三方录音，所以没有本仓库以外的版权。风格是明亮的电子流行：七个微失谐的锯齿波叠成和弦并随底鼓抽吸，拨弦主旋律，低频贝斯，四拍底鼓与拍手，进副歌前的上升音效与落地的低频冲击。十二小节：前两小节铺垫，第 3–6 小节进副歌，第 7–10 小节最满（主旋律加高八度），最后两小节鼓退出、收在 Cadd9。和声 F–G｜Am–F–C–G ×2｜F–Cadd9。生成的 wav 不入库。
- `scripts/render.mjs`：渲染，带 1080p、2k、4k 三档。先重新生成配乐，再调 Remotion；把 Chrome 的临时目录指到本目录的 `.tmp/`：本机上无头浏览器在系统临时目录里建不了缓存，渲染会在中途以 `write EOF` 退出。

## 内容的规矩

画面里的每一句都要在已放行的设计里找得到出处（`.agents/tasks/*/onepage.md` 与 `design.md`），不编没有定过的功能，不放没有来源的数字。示例用的项目是会议室预约，与练习题（记账小工具）不相干。对外发布之前，先复核 GLM 通道移植代码的许可与 GLM Coding Plan 的条款（项目图 `field-trial` 节点）。
