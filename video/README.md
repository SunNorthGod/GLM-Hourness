# 宣传视频（Remotion）

dsh-hourness 的介绍视频，全部用代码画（[Remotion](https://www.remotion.dev)，React 组件按帧渲染成 MP4），不录屏。独立的 Node 项目，有自己的依赖与检查，不进本仓库插件的构建、preflight 与 test（根目录 `eslint.config.js` 忽略本目录）。

现有一支样片 `Sample`：24 秒，1920×1080，30 帧，四段（标题、一句话许愿、放行后自己往下做、片尾），讲编排层，GLM 通道只在片尾带一句。

## 用法

```bash
npm i
npm run music      # 生成配乐 public/music/sample.wav
npm run dev        # 先生成配乐，再开 Remotion Studio 预览
npm run render     # 先生成配乐，再渲染 out/Sample.mp4
npm run lint       # ESLint 与 tsc
```

## 文件

- `src/Root.tsx`：登记 `Sample` 这一支。
- `src/Sample.tsx`：四段的先后与时长，时长按配乐的小节（100 BPM，一小节 2.4 秒）。
- `src/scenes/`：每段一个组件。
- `src/parts.tsx`、`src/theme.ts`：背景、淡入淡出、加粗写法、配色与字体。
- `scripts/make-music.mjs`：配乐，从零合成（铺底和弦、琶音、贝斯、轻鼓，十小节），不用任何采样或第三方录音，所以没有本仓库以外的版权。生成的 wav 不入库。
- `scripts/render.mjs`：渲染。把 Chrome 的临时目录指到本目录的 `.tmp/`：本机上无头浏览器在系统临时目录里建不了缓存，渲染会在中途以 `write EOF` 退出。

## 内容的规矩

画面里的每一句都要在已放行的设计里找得到出处（`.agents/tasks/*/onepage.md` 与 `design.md`），不编没有定过的功能，不放没有来源的数字。示例用的项目是会议室预约，与练习题（记账小工具）不相干。对外发布之前，先复核 GLM 通道移植代码的许可与 GLM Coding Plan 的条款（项目图 `field-trial` 节点）。
