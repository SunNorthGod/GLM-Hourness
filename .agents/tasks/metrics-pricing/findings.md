# metrics 行「积分口径：未提供」调查（HANDOFF §10 第 3 项 ①）

日期：2026-11-11。只读调查：静态读源码 + rc.3 运行时参考导出 + 本项目真实指标流水；未改任何被门禁跟踪的文件，未跑门禁。

## 1. 谜题重述

桌面版 L4（2026-11-10）发现 metrics 行健康带「积分口径：未提供」，出自 `src/metrics/index.ts:593` 的 `pricingService(ctx)` 取到 undefined；而同一桌面里计价服务实际在出数（额度读取、用量面板、指标流水里的积分都正常）。疑点是跨包激活时序：计价服务由 glm 包的 `glm-login` 行提供，metrics 行在 hourness 包。

## 2. 调用点与数据流（实读）

- `src/metrics/index.ts:593`：`if (pricingService(ctx) === undefined) say('积分口径：未提供', false)`。**apply 期一次性探测**：只在行激活时跑一次，`false` 表示进 `notes`（备注，不降级）。
- `src/metrics/index.ts:491`：`pricing: (): UsagePricing | undefined => pricingService(ctx, text => say(text, true))`。这是闭包，交给观察器；**每次 `llm` 事件结算时现读**（`src/metrics/observe.ts:463` `safely(() => { plan = pricing() }, ...)`）。
- `notes` 只进不出：`say` 的实现（`src/metrics/index.ts:254-258`）只在 `problems`/`notes` 里追加（带去重），全文件没有任何删除 `notes` 的代码。`notes` 进入两处健康文本：激活文本 `activation()`（:244-252）与每会话报告 `reportOf`（:364-370）。健康快照在 `reactivate` 时定格（`src/shared/health.ts:204-206`），`/glm-status` 的表读的就是这些快照（`src/shared/health.ts:235-245` `collectHealth`）。

结论：:593 一旦在 apply 期取到 undefined，这条备注就伴随进程终生，出现在之后每一次行健康渲染里——即使计价服务几毫秒后就到了、且按事件读一直读得到。

## 3. 提供方与读取函数（实读）

- 服务名 `glmHournessPricing`：`src/shared/pricing.ts:23`。
- 提供方：glm 包 `glm-login` 行。`src/glm-llm/login-row.ts:93` 在 apply 里调 `providePricing`，:67 `ctx.provide(PRICING_SERVICE, service)`；提供失败只 warn 并降级本行（:69-73, :94-96）。
- 读取函数：`src/shared/pricing.ts:68-75`——`ctx.get(PRICING_SERVICE)`，undefined 或形状不对都按「未提供」；形状不对时经 `problem` 回调报「wrong shape」。
- 本仓库的契约注释（`src/shared/cordis-min.ts:10`）：「cordis `ctx.get(name)`: an optional service without the inject requirement; **undefined until its fiber is active**」。这是全仓代码依据的语义。

## 4. cordis 解析语义与激活时序（实读，rc.3 运行时导出 `reference/dsh-desktop-0.2.1-rc.3`）

运行时把整个 profile 组成一棵 cordis 树：根配置是空表（`dsh/lib/profile-boot-C14i-8IN.js:121-125` 注释「the tree is composed as patches: each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, …」），两个 bundle 的行同处一棵树、同一根上下文。

关键语义（`cordis/src`）：

1. **严格 get**：`reflect.ts:233-243` `_getImpl(name, strict=true)`——提供方 fiber 不在 ACTIVE 态就返回 undefined。
2. **provide 立即登记、但通知要等 ACTIVE**：`reflect.ts:277-305`——impl 立即进根 store，:294 `if (this.ctx.fiber.state === FiberState.ACTIVE) this.notify([name])`；apply 执行期间 fiber 是 LOADING（`fiber.ts:625-639` `_setEpoch` 置 LOADING 后才跑 apply，`fiber.ts:646-673` `_reload`），所以 apply 里 provide 不触发通知；等 apply 收尾、fiber 转 ACTIVE 时，`fiber.ts:589-594` 对它名下每个 impl 补发 `reflect.notify`。
3. **行的启动方式**：loader 把合成后的行清单一次交给 Group（`cordis-plugin-loader/src/config/group.ts:86-89`），`EntryGroup.update` 用 `Promise.all` **并行**建所有 entry（group.ts:48-65）；每个 entry 各自异步 import 自己的模块再起 fiber（`config/entry.ts:210-238`，`config/tree.ts:112-128`）。**bundle 清单顺序只决定 patch 层叠顺序，不决定行激活顺序**。
4. **inject 等待**：有 `inject` 要求的行 PENDING 到所需服务可见（提供方 ACTIVE）才启动（`fiber.ts:597-623` `_checkImpl`/`_refresh`）；无 `inject` 的行模块 import 一解决就启动。
5. **无隔离**：服务名默认共享根隔离域（`reflect.ts:286`）；隔离只在 entry 显式声明 `isolate` 时发生（`config/isolate.ts`）。两个包的 `cordis.patch.yml` 与桌面 profile 的 `cordis.patch.yml` 都没有 `isolate`（实读：`packages/glm/cordis.patch.yml`、`packages/hourness/cordis.patch.yml`、`~/.dsh/profiles/desktop/cordis.patch.yml`）。

对齐到本案：

- metrics 行无 inject 要求：插件只导出 `name`（`src/metrics/index.ts:47`），patch 条目无 `inject`（`packages/hourness/cordis.patch.yml` 的 `glm-hourness/metrics` 条目）→ 它的 apply 在自己模块 import 解决后立刻跑。
- `glm-login` 行多一道门：静态 `export const inject = ['commands']`（`src/glm-llm/login-row.ts:52`）加 patch 条目 `inject: [commands]` → 它要等 `commands` 服务可见且提供方 ACTIVE 才启动，apply 之后还要一个微任务拍子才转 ACTIVE、计价服务才对严格 get 可见。
- 因此 metrics 的 apply 与「glm-login 变 ACTIVE」之间存在真实窗口；窗口输了，:593 取到 undefined。

## 5. 根因判定

**根因（置信度：高）**：apply 期一次性探测（:593）对上并行激活的行启动次序。metrics 行在 glm-login 的 fiber 转 ACTIVE 之前 apply，严格 `ctx.get('glmHournessPricing')` 按契约返回 undefined；备注进了只进不出的 `notes`，此后即使服务到达也永久显示「积分口径：未提供」。

证据链：

- 机制：§2、§3、§4 全部实读（本仓源码 + rc.3 运行时导出源码）。
- 实证 A：真实指标流水里计价按事件读得到——本项目 `.llm/metrics/events-2026-11-06.jsonl` 的 3 条真实 GLM 事件（`"provider":"glm-zcode"`，writer `63ba50aa`）全部带 `credits`，全库 0 条真实 GLM `llm` 事件缺 `credits`（grep 计数 3/3 与 0）。这说明同一进程、同一上下文里事件期严格 get 读得到该服务——只有 apply 期那一读输了窗口。
- 实证 B：L4（2026-11-10，隔离实例）行健康带该备注（HANDOFF §10 第 3 项 ①），且同桌面额度读取正常（HANDOFF §3，2026-11-01 面板读数记录）——提供成功、形状正确，排除「provide 失败」与「形状不对」两个备选（形状不对时 :491 会另外报 wrong shape 的 fault，健康文本会不同）。
- 推断 1：2026-11-10 桌面当时具体输在哪一步（glm-login 模块 import 更慢，还是 `commands` 激活更慢）无法静态判明，也不必判明——两种交错都落在同一窗口里。
- 推断 2：机制读的是 rc.3 导出；装机 runtime 2026-11-10 起 rc.1（HANDOFF §10）。rc.1 内部未核（本机无 asar 工具，装机的 cordis 在 app.asar 内），但「apply 期备注出现 + 事件期积分正常」这对实证与 rc.3 契约完全一致，本仓所有代码也按同一契约写（`cordis-min.ts:10`）；且该修复不依赖任何版本内部细节（见 §7）。

旁注（不在本修范围）：`src/metrics/index.ts:592` 对 `agents` 服务也是同一形态的 apply 期一次性探测。`agents` 是宿主侧服务，实践中先于用户 bundle 激活，L4 未见对应备注；留观，不动。

## 6. 为什么别处都正常（实读）

所有其它读者都是**用时现读**，读到时 glm-login 早已 ACTIVE：

- `/hourness` 面板与晨报：`src/report/index.ts:222`（状态条目）、:256（命令处理），每次命令现读。
- `llm` 事件的积分与高峰：`src/metrics/observe.ts:463` → `src/metrics/index.ts:491`，每次结算现读（实证 A 的 credits 即此路）。
- `/glm-status` 的额度段：glm-login 自己的 reader，不经服务查找（`src/glm-llm/login-row.ts:88-92, :111-117`）。
- rules / loops 的峰值与循环默认条目：按调用现读（`src/rules/peak.ts:70,92`、`src/loops/index.ts:255,261,295,349,401,634`）。

metrics 行是唯一在 apply 期做一次性服务探测并把它写成永久备注的地方。同文件里对**会晚到的服务**本来就有正确先例：循环板服务用响应式 inject（:574-583），sessionProjections 用 `whenPresent`（:589，实现在 `src/shared/row-support.ts:67-98`：服务到→装上并清等待槽，服务走→撤销并恢复等待槽）。计价口径是唯一漏掉这个处理的服务。

## 7. 建议修法（最小根修，未施加）

根因是「一次性探测 + 永久备注」，根修就是让这条备注跟着服务走：apply 期照旧探测记备注（保住无 glm 包组合与无 inject 宿主的行为），再用 cordis 响应式 inject 在服务到达时清掉备注、离开时重新记上。这与同文件循环板服务（:574-583）完全同一机制，不引入新宿主接口；health 的 `reactivate` 在到达/离开时即时刷新（`src/shared/health.ts:204-206`），比「渲染时现读」（要等下一次 reactivate 才会刷新快照）更准。

```diff
--- a/src/metrics/index.ts
+++ b/src/metrics/index.ts
@@ -31,7 +31,7 @@
-import { pricingService, type UsagePricing } from '../shared/pricing.ts'
+import { pricingService, PRICING_SERVICE, type UsagePricing } from '../shared/pricing.ts'
@@ -592,7 +592,25 @@
   if (agents() === undefined) say('没有 agents 服务，模型调用与问人的事件只计数', true)
-  if (pricingService(ctx) === undefined) say('积分口径：未提供', false)
+  // The pricing note sticks (notes are append-only), and the glm-login row of
+  // the other bundle may still be activating when this row applies: the loader
+  // starts every entry in parallel and a strict `ctx.get` reads undefined
+  // until the providing fiber is active. The inject clears the note when the
+  // service arrives and says it again when it leaves; the one-shot check stays
+  // for hosts without inject and for the service that never comes.
+  const pricingNote = '积分口径：未提供'
+  const injectPricing = ctx.inject as unknown as
+    | ((names: readonly string[], callback: (services: { readonly glmHournessPricing?: unknown }) => (() => void) | void) => unknown)
+    | undefined
+  if (typeof injectPricing === 'function') {
+    try {
+      injectPricing([PRICING_SERVICE], () => {
+        if (pricingService(ctx, text => say(text, true)) !== undefined) {
+          const at = notes.indexOf(pricingNote)
+          if (at >= 0) notes.splice(at, 1)
+          health.reactivate(...activation())
+        }
+        return (): void => say(pricingNote, false)
+      })
+    }
+    catch (error) {
+      say(`积分口径的接不上：${message(error)}`, false)
+    }
+  }
+  if (pricingService(ctx) === undefined) say(pricingNote, false)
   health.reactivate(...activation())
```

要点：

- 到达回调里复检形状（`pricingService(ctx, …)` 严格读）：形状不对的服务不让备注消失，形状 fault 由既有通路（:491 的 `say(text, true)`）另报，两行文本互不矛盾。
- 无 `inject` 的宿主（现 L2 夹具即如此，`tests/metrics-row.spec.ts:59`）只走一次性探测，行为与现状逐字节相同。
- `notes.indexOf` 精确命中本行自己写的那句；`say` 自带去重，离开/到达反复不会叠句。

**影响面**：

- 只动 metrics 行健康文本的产生方式。不改任何指标事件、写入器、观察器行为；不改其它行。
- 变化的场景：glm-login 晚于 metrics 激活的组合（桌面版实测输过窗口的那类）——备注在服务到达后消失；无 glm 包组合（探针 `hourness-only`）与 glm-login 被禁用的组合——备注照旧出现并保留（一次性探测保底）。
- 现有测试不受影响：`tests/metrics-row.spec.ts:487` 夹具无 `inject`，走一次性探测路径；contracts / hourness / health 各 spec 不经此路径。
- 建议随修补的测试：L2 在 `tests/metrics-row.spec.ts` 加一例——`fakeInjector` 先不给 `glmHournessPricing`、apply 后再补上，断言激活文本里该备注消失；撤销服务，断言备注回来。同一例顺带钉住到达时形状不对则备注保留。

**探针验证点**（`scripts/probe/run-probe.mjs`）：

- glm 侧 `metrics` 场景（两包齐装，glm-login 在场）：把 :4795 那条行健康检查加一个 `!health.metrics.reason.includes('积分口径：未提供')` 子句——修复后该备注不应在 glm 组合中出现。
- `hourness-only` 场景（只有编排包，计价确实不在）：断言 metrics 行健康**仍带**该备注（加一条新检查或复用 :4976 附近），钉住「真没提供时照说」不回归。

**桌面 L4 核对**：迁移车道清完后的桌面批次里，`/glm-status` 看 metrics 行说明：glm-login 生效的组合里不应再有「积分口径：未提供」。

## 8. 实施安全性

改动只触 `src/metrics/index.ts` 一个文件、一处探测逻辑；不碰面迁移的任何面（无 assemble、无工具面、无 wire 层）；`ctx.inject` 是同文件已在用的宿主接缝，无新契约面；不属逐字门禁范围。迁移车道放行检出后即可按仓库流程（build → preflight → test → probe）实施；与 face-migration 批次无文件交叠（该车道动的是方言 wire/design/execute/bootstrap/memory/lessons 与相关测试，本修只动 metrics 行），唯一共同点是门禁与锁归它所有——等它清场再跑门禁即可。

## 9. 实施记录（2026-11-11，已施加）

按 §7 施加，一处偏差：

- **到达回调读服务的来路**：§7 的 diff 用根 `ctx` 严格重读（`pricingService(ctx, …)`）。实施改为 §6 同文件循环板 inject 的既有形态——先读回调参数上的服务属性，属性不在再走参数上的 `get`（`services.glmHournessPricing ?? (services as ServiceLookup).get?.(PRICING_SERVICE)`），拿到值后经 `pricingService({ get: () => value }, …)` 做同一套形状复检。原因：fake-rc3 的注入器表与 base ctx 的 service store 是两张表（`tests/fake-rc3.ts:41-49`），根 ctx 重读在 L2 假宿主下永远 undefined，钉不住到达路径；真实 cordis 里根 ctx 与注入子 fiber 的上下文同读一棵根 store，两形态等价，而回调参数读法是 `InjectableServices` 之外服务名的既证先例（:579-580，桌面在跑）。形状语义不变：形状不对备注保留、fault 走 :491 的同一 problem 通路。
- 备注清除按 §7 原样：`notes.indexOf` + `splice` 真删，随后 `health.reactivate(...activation())` 重定格快照；离开经 `say`（自带去重）复记。
- 附带改动（同一提交）：`tests/metrics-row.spec.ts` 加一例（到达清备注、离开复记、形状不对备注保留且 wrong shape 入 fault、整轮备注不叠句）；`scripts/probe/run-probe.mjs` 两处验证点——`metricsChecks` 共用健康检查加 `!reason.includes('积分口径：未提供')` 子句（`metrics` 与 `non-glm-metrics` 都带 glm-login，都应无备注），`hourness-only` 加新检查断言 metrics 行说明仍带该备注；`docs/DESIGN.md` 行健康表 metrics 行补一句备注随服务走的语义。`:592` 的 agents 探测未动。
- 基线对齐说明：批 A 归因的上游漂移 metrics×2 红是「没有 agents 服务」（agents 探测降级 fault），不是计价备注；本修不动它，该两条预期仍红。`metricsChecks` 健康检查的失败详情里带完整 reason，可据此核对备注确已消失。
