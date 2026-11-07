# glm-subdir-instructions：GLM 路由上子目录 AGENTS.md 送不到模型

版本：0.1（2026-11-07）。项目图节点 `glm-subdir-instructions`（父节点 `bottom`），分支 `glm-subdir-instructions`。
证据写法：「包:行」指 `reference/dsh-desktop-0.2.1-rc.3/dsh-<包>/lib/index.js` 的行；`zcode.cjs:行` 指 `reference/zcode-3.17.1/zcode.cjs`（pristine 3.17.1）。〔实读〕读过源码；〔实测〕L2、L3 跑过；〔推断〕由源码推出、没有运行。
干净区：本文件不写人设与语气词。

## 0. 结论

1. ZCode 3.17.1 不送子目录指令〔实读，全包检索〕。它只在会话开始解析一次用户指令：`~/.zcode/AGENTS.md` 加上从工作目录向上到项目根的最近一份 `AGENTS.md`；没有向下发现，没有由 Read、Write、Edit 触发的加载。所以 GLM 路由现状（子目录的 AGENTS.md 不进上下文）与 ZCode 一致；补上它是对 ZCode 请求的偏离。
2. 缺口本身属实〔实读 + 实测〕：rc.3 的触发表只认原生工具名，别名执行的 `exec.name` 是 `Read`、`Write`、`Edit`。别名路径上没有任何子目录文件进入上下文，用户自己写的也一样。
3. 修法已在分支上做到评审与 L3 可验证的程度（§5、§6），不合入。决定权在人：是否为送子目录指令偏离 ZCode 请求（§7，一句话问题）。
4. 契约接缝盘点（§3）：没有能让别名调用触发宿主机制的零副作用接缝。选了「步前通知」：对工具面、别名执行、宿主的 agent-instructions 都零改动，只在请求里多一条 user 消息。

## 1. ZCode 3.17.1 的做法〔实读〕

| 事实 | 行 |
| --- | --- |
| 默认候选名单只有 `AGENTS.md`（`sPs=["AGENTS.md"]`），单文件读取上限 100 KiB（`aPs`） | zcode.cjs:1996 |
| 解析用户指令 `cPs`：用户级 `mPs`（`~/.zcode/AGENTS.md`，HOME 取 `HOME` 或 `USERPROFILE`）加工作区级 `fPs`；`fPs` 从 `workingDirectory` 起每层试候选名，命中即返回，走到项目根（`a8r`，`zpn`）或文件系统根停止，即只向上、只取最近一份；两份内容按用户、工作区合并（`pPs`） | zcode.cjs:1994（`cPs`）、1996（`fPs`、`mPs`、`resolveContextSources`） |
| 调用时机：`y9o` 以 `contextInitialized` 为真时直接返回，所以整个会话只在开局解析一次；子 agent 带父会话的快照，`injectAgentsMd` 为假的内置探索类 agent 不带 | zcode.cjs:14678（`y9o`）、14504、14676（子 agent 的 `injectAgentsMd`） |
| 送法：`Mxt` 把用户指令包成 `Request User Context`（`injectionTarget: "meta_user"`，`cacheHint: "dynamic"`），开头「Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior…」 | zcode.cjs:14352、14358 |
| 压缩后读文件恢复（`BOn`）把用户指令文件排除在外，不是另一条子目录通道 | zcode.cjs:14607 |
| 全包里不分大小写的 `AGENTS.md`、`CLAUDE.md`、`AGENTS.local` 只出现在：`/init` 命令说明与提示（88、15512、15513）、上面的用户指令解析（1996）、记忆提示的「已写进 AGENTS.md 的不必存」与 `CLAUDE.md` 一处提及（14361、14675）、子 agent 的禁改声明（14498、14534）；没有 `CLAUDE.md` 候选，没有「Additional instructions」「Instructions from:」类文案，没有 Read、Write、Edit 完成后读邻近指令文件的代码 | 全文检索：`AGENTS.md`、`CLAUDE.md`、`AGENTS.local`、`Additional instructions|Instructions from:`、`nested`、`subdir`、`priorityFiles`、`userInstructions`、`injectAgentsMd`、`contextInitialized`（零匹配或只命中上列各行） |

结论的可靠度：高。检索覆盖了字面文件名、`priorityFiles`、`userInstructions`、系统提醒与「nested/subdirectory」。没有跑 ZCode 本体（没有实测）。

## 2. 缺口的现状〔实读 + 实测〕

宿主一侧（`dsh-agent-instructions`）：触发表 `FILE_TOUCH_TOOL_NAMES = {read, write, edit}`，参数取 `file_path`，在 `tools/result` 里按 `exec.name` 匹配（agent-instructions:1210–1221、1425–1445）。时机：触碰在 `step/end` 之后排一次对账，结果放进收件箱，下一次 `agent/pre-step` 把消息插在认领的消息之后（agent-instructions:1384–1445）。内容：工作目录（不含）到文件所在目录每一层的 `AGENTS.md`、`CLAUDE.md`、`AGENTS.local.md`、`CLAUDE.local.md`，同目录修剪后内容相同的只留一份，整批 64 KiB。

GLM 一侧：别名以 ZCode 名字注册为工具，执行时 `exec.name` 就是调用名（tools:3232），别名的 `execute` 直接调原生工具体（`src/glm-prompt/aliases.ts` `buildAlias`）；宿主的 `tools/result` 监听器看到的名字是 `Read`、`Write`、`Edit`。

实测：`docs-at-hand` 设计 §1.2（分支 `docs-at-hand`，7a46dd2）的 headless 沙盒，非 GLM 路由原生 `read` 之后下一次请求多一条来源 `agent-instructions` 的消息；GLM 路由同样 7 步，8 次请求都只有基线 1 条。本分支的 L3 探针（`glm-subdir-instructions`、`non-glm-subdir-instructions`）复现并覆盖修法（§6）。

## 3. 契约接缝盘点

| # | 接缝 | 能否让别名调用触发 | 对请求与运行的影响 | 判定 |
| --- | --- | --- | --- | --- |
| a | agent-instructions 的触发表是否可配置 | 否：`FILE_TOUCH_TOOL_NAMES` 是模块常量，`Config` 只有 `projectRootMarkers`、`maxBytes`、`maxSourceBytes`、`instructionFileCandidates`、`localInstructionFileCandidates`（agent-instructions:17–40、1210） | — | 不可用〔实读〕 |
| b | 别名以原生名执行、对模型仍显示别名 | 否：注册表按名字取定义，`exec.name` 取调用名（tools:3232）；`tools/result` 由注册表发出，插件没有改名的位置 | — | 不可用〔实读〕 |
| c | 别名的 `execute` 经注册表再派一次原生调用，带 `parent`（`run_code` 的先例，tools:1362–1376） | 能：子调用的触碰冒泡到父调用（agent-instructions:1435–1441） | 工具面不变，请求形状等于原生路由；代价是 `tools/pre-execute`、`tools/post-execute` 上的监听器（guard、规则板、指标、经验、权限询问）各多看到一次原生调用，写入类调用可能二次询问授权；嵌套执行的错误与结果文本要重新映射回别名的结果渲染。没有在真实审批下验证过 | 可行但副作用面大，未选〔推断〕 |
| d | 在 `tools/execute` 瀑布里改写 `exec.name` | 理论上能 | 改宿主的执行对象，`tool/call` 事件与结果事件里的名字分裂 | 不碰宿主对象，未选〔推断〕 |
| e | 插件自己对一个合成的原生 `read` 执行发 `tools/result` | 能触发 | 向 `tools/result` 的其余监听器（`dsh-subagent` 的提交捕获、`dsh-tool-present`）发合成执行；等于伪造宿主事件 | 违反「不 mock DSH 契约」，未选 |
| f | 追加来源为 `agent-instructions` 的同形消息 | 能进请求，但 `compose` 每次 pre-step 会把收件箱里的 `agent-instructions` 待发消息当自己的移除并重算（agent-instructions:1349–1370），对账读 `changes` 的内部形状 | 与宿主内部状态耦合，升级即坏 | 未选 |
| g | 自己的来源类型加 `agent/pre-step` 步前通知（`installStepNotice`，与 todo 提醒、峰时提醒同一接缝） | 能：从请求可见历史读成功的别名调用，自己读文件 | 请求多一条 user 消息；工具面、别名执行、宿主机制零改动 | 采用 |
| h | `import` dsh-agent-instructions 的导出（`renderAgentInstructions`、`loadBaselineInstructions`） | 能复用渲染 | 包不在 peerDependencies，运行时耦合；无头配置可能没有这个包 | 未选 |
| i | 不修，在差异表写明 | — | 请求与 ZCode 一致；用户子目录的 AGENTS.md 在 GLM 路由上用不上 | 选项（§7 A） |

对模型可见的工具名、描述、schema：除 c、d 外的所有方案都不动；采用的 g 也不动，L3 探针里有核对（三次请求的工具面名字集合相同、含 `Read`、不含 `read`）。

## 4. 修法与对请求的影响

### 采用：g，步前通知

- 触发：GLM 步、`Read`、`Write`、`Edit` 的成功调用（历史里有结果且不是错误），`file_path` 在会话工作目录之下（相对路径按工作目录解析；工作目录取 `workingDirectory` 服务，没有就取会话头的 `cwd`）。
- 内容：宿主同一组候选、同一顺序与去重；段落文字取宿主 `additionalSectionText` 的原文；整批 64 KiB，超出先丢浅层再截最深一份；外包 `<system-reminder>`。
- 位置：被认领消息之后、其余提醒之前，与宿主自己的消息同位。
- 状态：来自历史（通知的来源事实 `dirs`、宿主 `agent-instructions` 消息的 `changes[].path`），压缩后重触碰才重送；没有文件的目录在进程内记一次。
- 配置：`subdirInstructions`，缺省开；设 `false` 关。
- 与宿主不同：只送一次，不做「文件改了整份替换」「文件删了声明移除」。

对发给 GLM 上游的请求的影响（同一份说明，评审按这里核）：

| 项 | 变化 |
| --- | --- |
| 请求头、签名、系统提示词、工具定义 | 无 |
| 消息 | 触碰子目录文件的下一次请求起，多一条 user 消息（来源 `glm-subdir-instructions`），一次一个批次；之后留在历史里，随历史重发 |
| 没有触碰、触碰在工作目录之外、触碰目录无指令文件、配置为 false、非 GLM 路由 | 请求与现状逐项相同 |
| 缓存 | 新增消息出现在被认领消息之后：触碰的那一步之后的请求里，这条消息之后的前缀与现状不同；之前的前缀不变。每个目录只送一次，所以只在首次触碰时断一次缓存前缀 |
| 与 ZCode 的差异性质 | ZCode 没有这条通道。形态上与已有的 DSH 基线消息（ZCode 把指令放进 `Request User Context` 元消息，不是 `agent-instructions` 消息）、峰时提醒、图投影同类：都是 ZCode 请求里没有的 user 通知 |

### 未采用但可作选项

- c：请求形状等于原生路由，但副作用面大（§3）。若人要求「与 DSH 原生路由逐字一致」且愿意核对 guard、规则、指标、经验、权限的二次调用，c 是出路；需要单独设计与 L4。
- i：不修。

## 5. 实施与门禁

分支 `glm-subdir-instructions`（基于 origin/main 150a4790）：

- `src/glm-prompt/subdir-instructions.ts`（新）、`src/glm-prompt/index.ts`（配置键与安装）。
- L2：`tests/subdir-instructions.spec.ts` 11 条（真实临时目录，不 mock 文件系统；没有行接线时 8 条失败，接上全绿）：别名 Read 触及子目录、Write 与 Edit、失败调用与原生名与工作目录之外与 Grep、Bash 不触发、相对路径与工作目录在子目录、已送不重发、压缩后重送、宿主已送不重发、同目录同内容只送一份与无文件目录、非 GLM 与关闭开关与无触碰、通知位置、纯函数、预算。
- L3：探针场景 `glm-subdir-instructions`（GLM，别名 Read）与 `non-glm-subdir-instructions`（`deepseek-probe`，原生 `read`），脚本相同；4 条检查（§6）。
- 文档：`DESIGN.md` §5.8 第 22 项与 §5.11，`FACTS.md` §1 与 §3 各一行。

门禁（分支提交 0ca8b04f）：`npm run build` 通过；`npm run preflight` 通过；`npm test` 全绿（子进程汇总 3289 条通过、0 失败；ESLint 73 条压制、knip 基线 18、jscpd 基线 1 个克隆，与 main 相同，棘轮没涨）；逐字门禁 502 条、0 已知偏离。worktree 里 `tests/lessons-seed.spec.ts` 需要主检出的 `.agents/tasks/m5/lessons-seed.json`（被忽略的运行产物，worktree 没有），跑门禁前复制进来，没有入库。

## 6. L3 探针与评审

（见分支上的后续提交与图节点批注；探针按 `DEVELOPMENT.md` §1.1 取锁，其间两把锁都被别的任务占用。）

## 7. 给人的问题

要不要为了把子目录的 AGENTS.md 送进 GLM 路由而让请求偏离 ZCode（ZCode 3.17.1 自己不送）？

- A 不送：请求与 ZCode 一致，用户与 docs-at-hand 的组件 `AGENTS.md` 在 GLM 路由上仍进不来；代价是 docs-at-hand 的第二件要自己补送。
- B 合入、缺省送：GLM 会话与 DSH 原生路由的行为一致，子目录规则生效；代价是请求多一条 ZCode 没有的 user 消息，对 1.5 倍用量（`risk-signing`）没有验证手段，只能凭「已有同类通知」判断风险不高。
- C 合入、缺省关（`subdirInstructions: false`）：合入后请求与现状逐项相同，要用的 profile 自己开；代价是默认状态下缺口仍在，开关多一个。

推荐 C：合入不改变默认请求，开关由人在需要子目录规则的 profile 里打开，L4 在 GLM 真会话里看一次再决定缺省值。改成 C 只需把 Config 里 `subdirInstructions` 的缺省改为 `false`、代码里 `config.subdirInstructions === false` 改为 `!== true`，并改 DESIGN §5.11 与探针场景的配置。
