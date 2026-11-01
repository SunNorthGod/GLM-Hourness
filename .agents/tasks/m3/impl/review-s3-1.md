# 持有者记录不再比会话的模式活得久：评审第 3 步发现 S3-1 的修复

评审日期 2026-10-31。对象是分支 `m3`（`.worktrees/m3`）顶端的唯一提交 `5d47374`（`fix(m3-1): holder record no longer outlives the session's main agent mode`），父提交是 `bd91f2c`（第 4 步）。没有更早一轮的 `review-s3-1.md`，所以没有需要逐条核对的旧发现。我读了完整差异、改动后的 `src/design/mode.ts`、`src/design/index.ts`、`src/graph/main-agent-holder.ts`，对照简报、`review-step3.md` 里的 S3-1、附录 0.5 §2.4、`onepage.md` 与 `design-context.md`。没有重跑套件：build、preflight 退出码 0，test 67 个 spec 文件、1039 个用例全过，eslint 压制 250、knip 21、jscpd 2 与基线相同，graph:smoke 通过，以上取自提交说明。`npm run probe` 提交说明写明没有跑。另做了只读复现：脚本放在系统临时目录，用 `tests/design-host.ts` 的假宿主，用完即删，仓库没有任何改动。

## 摘要

提交按评审的处方按事件清理：会话的 `/wish` 被取消后，由它下一次读自己的角色时删记录（`roleOf`）；会话重新创建时，模式关着而记录指向它，创建时删（`alignOnCreation`）；别的会话发 `/wish` 遇到指向「开着却没有开主 Agent 模式」的会话的记录，直接接管（`standingOf` 的 `lapsed`）。评审里复现过的那一条路径（取消的 `/wish` 之后，别的会话被指过去）已经修好并有测试钉住。`isMainAgent` 一直要「模式为真且记录指向本会话」，所以执行边界从没信过一条过期记录。这次修复没有引入让一个项目同时有两个主 Agent 的路径（每条删除或接管都经同一份记录，最终读取会拒绝记录已换人的认领），有一条并发路径会让它一个也没有（问题 3）。差异里没有任何会在高峰时段拦住主 Agent 的代码。过程规矩全部满足。

Watch for：（1）`mainAgentOf` 仍只读记录，没有被清理的过期记录会被它原样返回；文档写的「到该会话下一次读角色之前」只对「被取消」成立，`/wish` 在写下记录之后因别的原因返回错误时窗口没有上限（confirmed，已复现）。（2）新加的 `lapsed` 接管与 `/wish here` 的「等别的会话退出」那段 `await` 相撞：并发的两个 `/wish` 会让项目最后没有主 Agent，而第二个会话收到的是成功回复（confirmed，已复现）。（3）接入 `mainAgentOf` 的步骤（M5、M7、循环板）要么经一个对照会话模式的读法，要么接受上面两个窗口（confirmed）。

**Verdict**: APPROVED

## 高层视图

修复沿用「按事件愈合」而不是「读时校验」。记录仍是单独的一份文件，`roleOf`、`alignOnCreation` 与 `standingOf` 各在自己的时机里把它和会话投影对一遍，对不上就删或接管。执行边界（身份节、工具面、guard 规则）读的是 `roleOf`，它要求投影为真且记录指向本会话，所以这次修复收窄的只是 `mainAgentOf` 与「别的会话的 `/wish` 被指向谁」这两个读者能看到的过期窗口。

窗口没有消失。取消路径上，窗口从取消持续到该会话下一次组装或工具调用；空的 `/wish` 把 agent 留在空闲时，这可能是很久。崩溃路径上，会话没被重开就没人删，`standingOf` 对存着但没打开的会话只答 `closed`，读不到它存着的投影。`/wish` 在写下记录之后返回错误（这一版最现实的触发是记录文件旁的临时文件删不掉）时，没有挂起的待生效状态，`roleOf` 的取消分支不会触发。提交说明和文档写明了第一类窗口，第三类没写。

`lapsed` 接管把「打开着的会话一律指路」改成了「按模式判」。判断依据是「模式关且没有待生效状态」，而 `/wish here` 与读不到记录的覆盖路径在写下新记录之后、设置待生效状态之前有一段 `await demoteOthers`，这段里写下记录的会话看起来正好是 `lapsed`。

高峰：差异里没有出现 `peak`，新加的代码是同步的文件读写和一次内存读，没有新的等待。

<details>
<summary>Issues (4)</summary>

1. **`/wish` 写下记录后返回错误，留下无人清理的过期记录**（MEDIUM，非阻塞，confirmed）：`enter()` 在 `claimHolder`/`replaceHolder` 之后、`setPending` 之前出错（`claimHolder` 的 `finally` 删临时文件失败，即 S3-3；`here` 与覆盖路径里的 `demoteOthers` 抛错）时，记录指向模式关着的本会话，没有待生效状态，`roleOf` 的 `mode.cancelled` 分支不触发，会话也不报健康。在 `enter()` 的失败返回处，若本次调用写过记录，就尽力 `releaseHolder`，吞掉清理错误；顺手修 S3-3；补一个「写入后失败」的测试；ORCHESTRATION §3.1 与 HANDOFF 里「到该会话下一次读角色之前」的说法改成覆盖这一类。
2. **`mainAgentOf` 仍不校验，窗口由读它的步骤承担**（MEDIUM，非阻塞，接入前的条件，confirmed）：取消之后到该会话下一次读角色之前、崩溃之后会话没被重开之前，它返回一个模式关着的会话；向这个会话投递的提醒会唤醒它，它的第一次组装才删记录，所以第一条提醒落在一个普通 agent 上。M5、M7、循环板接入时，用设计行里一个对照 `agents.get(id)` 与会话模式的读法（模式关且没有待生效状态按 `none` 处理），或在各自的设计里写明接受这个窗口。
3. **`lapsed` 接管与 `/wish here` 的退出等待相撞，最后没有主 Agent**（MEDIUM，非阻塞，confirmed）：会话 s1 发 `/wish here`（或覆盖读不到的记录）后在 `await demoteOthers` 里等别的会话退出，这时记录已指向 s1、s1 没有待生效状态；s2 同时发普通 `/wish`，`standingOf` 判 s1 为 `lapsed`，s2 接管记录并收到成功回复；s1 的 `demoteOthers` 接着遍历到 s2（待生效状态为开），对它执行 `/wish off`，`leave` 删了 s2 的记录；s1 的最终读取发现记录没了，报「别的会话同时在抢」。结果：记录删除、两个会话都不是主 Agent、两次 `/wish` 都白做，s2 先收到成功再收到退出通知。`demoteOthers` 跳过记录当前指向的会话；再让 `enter()` 从写记录起就标记「进行中」，`standingOf` 对进行中的会话答 `open`。补一个并发的测试。
4. **文档说「日志里没有收尾的 `/wish`」，代码删得更宽**（NIT，confirmed）：创建时只要模式关、记录指向本会话、会话状态读得出就删，不限于崩溃。ORCHESTRATION §3.1 的措辞改成代码的判据。

</details>

<details>
<summary>Details</summary>

### 愈合的三个时机各自覆盖什么

取消路径：`readMode` 把「待生效的 `/wish` 已结算而投影为假」读成 `cancelled: true`，`roleOf` 在 `deps.release(session)` 里删记录（`mode.ts` 第 188–195 行）。取消标记只被第一个调用 `modeOf` 的读者看到一次。`roleOf` 之外的读者是 `enter()`（有意先结算）、`leave()`（在 `roleOf` 之后）、`demoteOthers`（读别的会话，此时记录已换人）和 `alignOnCreation`（新会话没有待生效状态），没有一个会在需要删记录时把标记吃掉。

崩溃路径：日志里只有 `command/run`，`alignOnCreation` 在重开时删（`index.ts` 第 247–256 行）。会话没有被重开就没有读者：另一个会话的 `/wish` 遇到的是 `closed`（`standingOf` 对存着的会话只查 `persistence.list()`，读不到它存着的投影），得到指路回复，要靠 `/wish here` 搬过来，`mainAgentOf` 在这段时间里一直返回它。提交说明与文档写的是「那个会话重开时删」，所以这一点是说明过的。

接管路径：`standingOf` 对打开着的会话用 `peekMode`，不消耗待生效状态，被接管的会话自己下一次读角色时仍能报出 `CANCELLED_ON`，`releaseHolder` 看到记录已换人就不删（测试第 3 条钉住）。`stateOf` 只在键没注册时返回 `undefined`，所以「读到关」与「读不到」分得开，`lapsed` 不会因一次空读误接管。

### 写下记录之后出错：没有愈合路径

`enter()` 在写下记录与 `setPending` 之间有这些出口：`claimHolder` 的 `finally { unlinkSync(temporary) }` 抛错（`main-agent-holder.ts` 第 134–136 行，S3-3，提交说明明确没做）、`here` 与读不到记录两条路径里 `deps.demoteOthers` 抛错、最终读取发现记录不是本会话的。前两种让 `catch` 返回 `fail('主 Agent 的持有者记录写不了：…')`，记录却在盘上，指向本会话。

复现（假宿主，只让 `.tmp` 的 `unlinkSync` 抛 EPERM，其余真实；输出节选，记录一行只留会话 id）：

```
reply: {"kind":"error","text":"主 Agent 的持有者记录写不了：EPERM: held by scanner"}
record after: held by s1
s1 projection: {"active":false,"running":null,"settled":"cmd-1"}
mainAgentOf after two assemblies of s1: s1
s1 health: undefined
```

两次组装之后记录仍指向 s1，s1 没有健康说明。这时别的会话发 `/wish` 会走 `lapsed` 接管（复现过：回复「原来记的主 Agent 会话其实没有开着主 Agent 模式…」，持有者变 s2），s1 再发 `/wish` 沿用记录，会话重开时删。所以可恢复，人也看到了那条错误回复，不挡路；但 `mainAgentOf` 在这段时间里一直返回 s1，而文档写的上限（「到该会话下一次读自己的角色之前」）对这一类不成立。S3-3 在这台 Windows 机器上是现实的触发（杀毒或索引器占着刚建的临时文件），让它与 S3-1 纠缠在一起，值得在同一个后续提交里一并处理。

### `lapsed` 接管与 `/wish here` 的 `await` 相撞

`enter()` 里 `here` 分支与读不到记录分支都是 `replaceHolder(file, record)` 后 `await deps.demoteOthers(key, session.id)`（`mode.ts` 第 349–360 行），`setPending` 在第 377 行，两者之间的这段 `await` 里，写下记录的会话 `readMode` 读到的是：没有待生效状态，投影为假，于是 `standingOf` 答 `lapsed`。`demoteOthers`（`index.ts` 第 287–299 行）遍历 `registry.roots()`，条件是同项目、非子 agent、`modeOf(...).active`，对每个执行 `/wish off`。它不排除记录当前指向的会话。

复现（s0 已是主 Agent；s1 发 `/wish here`，s2 在 s1 还在等的时候发 `/wish`）：

```
s1 /wish here -> error 主 Agent 的持有者记录写不了：别的会话同时在抢，记录还没写上
s2 /wish -> success 原来记的主 Agent 会话其实没有开着主 Agent 模式，已让这个会话的 agent 当主 Agent…
executed by the row: [{"agentId":"s0","line":"/wish off"},{"agentId":"s2","line":"/wish off"}]
holder: none
on s0/s1/s2: false false false
```

输出节选，回复文字截断。

这一步之前，`standingOf` 对打开着的会话一律答 `open`，s2 会得到指路回复，s1 的 `/wish here` 照常完成，所以这个结果是本提交引入的。后果是可恢复的：s1 收到明确的错误，s2 的 agent 收到退出通知，人重发一次 `/wish` 即可，没有数据丢失，同一时刻最多一个主 Agent 仍然成立（这里是零个）。触发需要同项目的两个会话在 `demoteOthers` 的等待期（对每个要退出的会话最多 10 秒）内都发 `/wish`，所以概率低。修法很小：`demoteOthers` 对记录当前指向的会话不执行 `/wish off`，这一条就让 s2 保住记录，s1 的最终读取报错，结果是 s2 为主 Agent。再让 `lapsed` 只对「没有进行中的 `/wish`」成立，进行中从写记录起算，而不是从 `setPending` 起算。提交说明里的「in flight (pending state)」是后一种定义。

### 测试

「claiming a project twice at once」被改写，原因成立：旧版构造的是一条指向无 `/wish` 会话的记录，正是现在要接管的过期情形。没有测试覆盖的：`/wish` 写入记录后返回错误（问题 1）、`here` 与覆盖路径上的并发 `/wish`（问题 3）。其余新分支（取消、取消后别人先接管、同一会话重发、`/wish off` 紧跟取消、崩溃、模式未知、删不掉）都有用例，文件系统的 mock 只打补丁 `fs.unlinkSync`。

### 过程规矩

规矩逐条对过：单个提交且信息写明 `m3-1`；三份文档与代码同批，旧句子整条重写；`apply` 路径上的新代码都在 `try/catch` 里（`alignOnCreation` 在监听器的 `try/catch`，`releaseStale` 自带，`roleOf` 把 `release` 的错误变成健康说明）；差异里没有新增 `eslint-disable`、`@ts-` 压制，三份基线文件不在改动清单里；复用 `releaseHolder`、`readHolder`，没有另写文件锁或项目根算法。`npm run probe` 提交说明写明没跑；本提交改的是设计行（碰 DSH 运行时的代码），按 DEVELOPMENT.md §1.1 合入 main 之前要跑一次 L3。

### 没有覆盖的

多进程（两个 DSH 窗口）下 `agents.get` 看不到对方进程里的会话，只会答 `closed`；`releaseHolder` 的「读后删」在两个进程之间不是原子的，这一点在 `/wish off` 里早已存在；真实运行时里取消的 `/wish` 是否产生 `command/done` 错误只有 L2 的假宿主覆盖。

</details>

<details>
<summary>文件清单</summary>

提交 `5d47374`，6 个文件，+253 −33。完整差异：`git -C .worktrees/m3 show HEAD`。

- `src/design/mode.ts`：`modeOf` 拆成 `readMode`、`modeOf`、`peekMode`；`roleOf` 取消时删记录；`standingOf` 加 `lapsed`；`enter()` 开头先结算旧命令；`staleRecordKept`。
- `src/design/index.ts`：`RoleDeps.release`、`releaseStale`、`alignOnCreation` 删过期记录。
- `tests/design-mode.spec.ts`：50 → 58 个用例，改写「claiming a project twice at once」。
- `docs/ORCHESTRATION.md` §3.1、`docs/DESIGN.md` §2.5 与降级表、`docs/HANDOFF.md` 设计行：与代码同批。

</details>
