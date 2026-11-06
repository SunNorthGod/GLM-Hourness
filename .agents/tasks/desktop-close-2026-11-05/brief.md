# 调查任务书：桌面版收到 Browser.close 后不退出

只读调查。不改代码、不改 docs/graph、不改 ~/.dsh、不提交。

## 背景

- 仓库：C:\Users\29596\Desktop\Project\GLM-Hourness（DeepSeek Harness 的第三方 bundle）。
- 改了行行为的合入步要经 CDP 端口 9333 重启人的桌面版（窗口标题 "DeepSeek Harness"），在 .llm/desktop-lock 下做，规程不允许杀进程。
- 2026-11-05 批次 L4：发 Browser.close 之后，桌面版约 12 分钟才退出。记录见 .agents/tasks/l4-batch-2026-11-05/l4.md 与 .agents/tasks/panel/l4-merge-2026-11-05.md。
- 2026-11-05 20:23，glm-context-window 的合入步（wf_d964b9e854bc29a0）经 9333 发 Browser.close。到 21:12，主进程 72104（15:41 启动，4 个子进程）仍在，窗口仍开，GET http://127.0.0.1:9333/json/version 仍回 200。关闭请求看起来没有被处理，不是慢。

## 要回答的问题

1. 桌面版是什么壳（Electron 或其他，版本），安装在哪里。从进程 72104 的可执行路径只读查。
2. 经 CDP 发 Browser.close 在这个壳里实际走哪条路径：是否被 before-quit / window-all-closed / close 事件处理器拦下（例如最小化到托盘、确认对话框、等待会话结束、等待插件 dispose）。到 reference/deepseek-harness 源码里找退出相关的处理，引用文件与行号。
3. 两次表现为什么不同（12 分钟后退出 与 49 分钟不退出）。能从源码或日志找到依据就给依据；找不到就写明是推断。桌面版的日志目录如能找到，只读查看 20:23 前后的记录。
4. 不杀进程、能可靠重启桌面版并让新插件行生效的办法有哪些：壳自带的重启或重载命令、plugin_manager 的重载、DSH 暴露的接口、命令行参数等。每个办法写清依据和风险。
5. 能否不重启人的桌面版完成插件行的真机核对：例如另起一个用临时 profile 的隔离实例（参照 docs/DEVELOPMENT.md §3 的 headless 沙盒）。写清做法和它覆盖不到的部分。
6. 给 docs/DEVELOPMENT.md §1.1 的 L4 行与桌面重启规程的改写建议（只写建议文本，不改文件）。

## 起点

- docs/DEVELOPMENT.md（§1.1、§3、桌面重启相关段落）、docs/FACTS.md、docs/HANDOFF.md。
- reference/deepseek-harness 源码（退出、窗口关闭、托盘、插件重载相关）。
- scripts/ 下用到 9333 或 Browser.close 的脚本（先搜索 9333）。
- 上面两份 L4 记录。

## 约束

- 不杀进程，不发任何会改变桌面版状态的 CDP 命令（不发 Browser.close、Page.reload、Runtime.evaluate 之类）。只允许 GET /json/version、GET /json/list。
- 不取 .llm/desktop-lock，不碰 .llm/probe-lock*。
- 不改人的 ~/.dsh，不改 docs/graph，不改仓库文件，不提交。
- 先建报告文件，边查边追加，防止上游截断丢失结果。

## 产出

报告写到 C:\Users\29596\Desktop\Project\GLM-Hourness\.agents\tasks\desktop-close-2026-11-05\report.md：

- 每个问题一节，结论在前，依据（文件:行号、命令输出原文）在后，写明是实读还是推断。
- 末尾给一个推荐的重启或核对办法，和 DEVELOPMENT.md 的改写建议。
