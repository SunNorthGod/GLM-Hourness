# dsh-hourness

The orchestration layer for DeepSeek Harness (DSH), for any model. It organizes work around a project graph (a project is its graph directory; one main agent per project), enforces execution boundaries (guard), keeps audit journals (dispatched-work decisions, memory, violations), aggregates them into the `/hourness` morning report and usage panel, and adds boards for project rules (with peak modes) and loops (what runs when something happens or the time comes). The design row makes one session the project's main agent via `/wish`. It is a third-party DSH bundle: one package, twelve independent rows, toggled per row in the plugin manager; disabling a row degrades the session gracefully. Works without `dsh-glm-zcode`.

## Install

Requires DeepSeek Harness 0.2.1-rc.3 (declared as `engines.dsh`; the plugin manager checks it and refuses incompatible versions).

Once published:

```
dsh plugin add dsh-hourness
```

Together with the GLM channel bundle (optional, GLM only):

```
dsh plugin add dsh-glm-zcode dsh-hourness
```

Until published, install from a checkout:

```
dsh plugin add <checkout>/packages/glm <checkout>/packages/hourness -w
```

The project graph tab of the right sidebar is the package's own client face (`ui/`); installing the package is enough. `/hourness` prints the morning report, `/hourness-status` lists per-row health for both packages, `/rules`, `/loops` and `/wish` drive their rows. Row config (`home`, `projectHome`, `persona`, `dir`) is set per row in the plugin manager. Desktop DSH loads new code only after a full restart.

## Rows

Declared in `cordis.patch.yml` (DSH Loader dialect). Row ids keep the `glm-hourness/` prefix so profile overrides match by id.

| Row id | What it does | Ships |
| --- | --- | --- |
| `glm-hourness/data` | data directory service: the user-level directory and the project `.llm` | enabled |
| `glm-hourness/guard` | execution boundary for tool calls | enabled |
| `glm-hourness/memory` | memory tools and the audit journal | enabled |
| `glm-hourness/lessons` | lessons board: pitfalls and fixes per project, `/lessons` | enabled |
| `glm-hourness/workflow` | decision journal of dispatched work | enabled |
| `glm-hourness/hourness` | `/hourness` morning report and usage panel | enabled |
| `glm-hourness/graph` | project graph tools for agents | enabled |
| `glm-hourness/graph-panel` | `/graph-apply`, the panel's write path | enabled |
| `glm-hourness/rules` | rules board with peak modes, `/rules` | enabled |
| `glm-hourness/design` | `/wish` main-agent mode | enabled |
| `glm-hourness/loops` | loops board: entries, events, run lock | enabled |
| `glm-hourness/transcript` | plain-text session export after a GLM compaction, under the project's git-ignored `.llm/transcripts/`, credential-shaped strings redacted | enabled |
| `glm-hourness/ui` | client face: right sidebar project graph panel | enabled |

The `data` row ships without a project directory; each session resolves its workspace `.llm` (set `projectHome` per row in the plugin manager to override).

## License

The repository's own code is licensed under the PolyForm Noncommercial License 1.0.0 (licensor NorthGod): noncommercial use is granted, commercial use needs a separate grant (northgod@qq.com). Third-party material this bundle carries is inventoried in `THIRD-PARTY-NOTICES.md` and is not covered by that license. Both files ship inside the package (`LICENSE`, `THIRD-PARTY-NOTICES.md`).

## 简体中文

`dsh-hourness` 是 DeepSeek Harness 的编排层，对任何模型生效：项目图及其右侧栏面板（一个项目一张图，一个项目一个主 Agent）、执行边界（guard）、审计流水（派遣决策、记忆、违规）、`/hourness` 晨报与用量面板，以及规范板（规则与峰值模式）与循环板（何时做什么）。设计行用 `/wish` 让一个会话成为项目的主 Agent。十二个独立行按 `cordis.patch.yml` 声明，在插件管理器逐行启停，停用任意一行会话优雅降级；不装 `dsh-glm-zcode` 也能用。发布后 `dsh plugin add dsh-hourness` 安装；发布前用检出路径安装（见上）。`data` 行的项目目录默认指向开发检出，装好后按行配置自己的 `projectHome`。许可：本仓自有代码按 PolyForm Noncommercial 1.0.0 授权（`LICENSE`，商用需另行联系 northgod@qq.com）；第三方材料见 `THIRD-PARTY-NOTICES.md`。
