# 投稿草稿（2026-11-04，未提交，待人批准）

三条通道可同时走；dsh-plugin.org 无自助通道不投。display name 与中文文案是拟稿，提交前定稿。

## A. awesome-dsh-plugin PR（2 个新文件）

`data/plugins/SunNorthGod__GLM-Hourness--packages-glm.yml`：

```yaml
url: https://github.com/SunNorthGod/GLM-Hourness/tree/main/packages/glm
name: SunNorthGod/GLM-Hourness#glm
category: model
description:
  en: 'ZCode-compatible GLM channel for DeepSeek Harness: native account login, identity headers, request signing, prompt and tool surface mirroring ZCode 3.17.1, lazy tool loading and compaction.'
  zh: 'DeepSeek Harness 的 ZCode 兼容 GLM 通道：原生账号登录、身份头与请求签名，提示词与工具面对齐 ZCode 3.17.1，工具懒加载与压缩。'
```

`data/plugins/SunNorthGod__GLM-Hourness--packages-hourness.yml`：

```yaml
url: https://github.com/SunNorthGod/GLM-Hourness/tree/main/packages/hourness
name: SunNorthGod/GLM-Hourness#hourness
category: workflow
description:
  en: 'Orchestration layer for DeepSeek Harness: project graph with sidebar panel, guard rails, audit journals, memory, the /wish main-agent flow, and the /hourness morning report.'
  zh: 'DeepSeek Harness 的编排层：项目图与侧栏面板、护栏、审计日志、记忆、/wish 主代理流程与 /hourness 晨报。'
```

PR 标题 `Add SunNorthGod/GLM-Hourness (glm, hourness)`，正文：

```
Two bundle entries from one monorepo, one data file each:

- packages/glm (npm: dsh-glm-zcode 0.3.0) — GLM model channel; category: model
- packages/hourness (npm: dsh-hourness 0.3.0) — orchestration layer; category: workflow

- [x] `dsh.bundle` with `patch: ./cordis.patch.yml` declared in both subpackage package.json files (the root package.json is a private workspace)
- [x] Real working code, published to npm
- [x] Repo created 2026-11-03 (older than 1 day at submission)
- [x] `dsh-plugin` topic present on the repository
- [x] Descriptions factual; categories chosen as model / workflow
```

（hourness 若被评审认为更贴 memory 或 dev，备选理由：审计日志/记忆占描述一半。）

## B. dsh-plugin-market PR（2 个新文件）

`plugins/dsh-glm-zcode.json`：

```json
{
  "id": "dsh-glm-zcode",
  "name": "GLM ZCode Channel",
  "description": [
    { "language": "en-US", "content": "ZCode-compatible GLM channel for DeepSeek Harness: native account login, identity headers, request signing, prompt and tool surface mirroring ZCode 3.17.1, lazy tool loading and compaction" },
    { "language": "zh-CN", "content": "DeepSeek Harness 的 ZCode 兼容 GLM 通道：原生账号登录、身份头与请求签名，提示词与工具面对齐 ZCode 3.17.1，工具懒加载与压缩" }
  ],
  "support_versions": ">=0.2.1-rc.3",
  "urls": {
    "homepage": "https://github.com/SunNorthGod/GLM-Hourness/tree/main/packages/glm#readme",
    "repository": "https://github.com/SunNorthGod/GLM-Hourness",
    "issues": "https://github.com/SunNorthGod/GLM-Hourness/issues"
  }
}
```

`plugins/dsh-hourness.json`：

```json
{
  "id": "dsh-hourness",
  "name": "Hourness Orchestration",
  "description": [
    { "language": "en-US", "content": "Orchestration layer for DeepSeek Harness: project graph with sidebar panel, guard rails, audit journals, memory, the /wish main-agent flow, and the /hourness morning report" },
    { "language": "zh-CN", "content": "DeepSeek Harness 的编排层：项目图与侧栏面板、护栏、审计日志、记忆、/wish 主代理流程与 /hourness 晨报" }
  ],
  "support_versions": ">=0.2.1-rc.3",
  "urls": {
    "homepage": "https://github.com/SunNorthGod/GLM-Hourness/tree/main/packages/hourness#readme",
    "repository": "https://github.com/SunNorthGod/GLM-Hourness",
    "issues": "https://github.com/SunNorthGod/GLM-Hourness/issues"
  }
}
```

（support_versions 由 engines 的 `dsh ^0.2.1-rc.3` 推出，提交前核对；不写也合法。）

## C. dsplugin.app 投稿 Issue（vbarter/dsh-plugin-registry，模板三字段）

```
Title: Plugin submission: SunNorthGod/GLM-Hourness

repository_url: https://github.com/SunNorthGod/GLM-Hourness
owner/repo: SunNorthGod/GLM-Hourness
notes: |
  Monorepo with two installable DSH bundles, both on npm at 0.3.0 (PolyForm Noncommercial 1.0.0):

  - packages/glm -> npm dsh-glm-zcode: ZCode-compatible GLM model channel
    (account login, identity headers, request signing, ZCode 3.17.1 prompt/tool surface,
    lazy tool loading, compaction). Manifest: dsh.bundle.patch = ./cordis.patch.yml
  - packages/hourness -> npm dsh-hourness: orchestration layer (project graph +
    sidebar panel, guard rails, audit journals, memory, /wish flow, /hourness morning report).
    Manifest: dsh.bundle.patch = ./cordis.patch.yml

  Root package.json is a private workspace without a dsh field; manifests live in the subpackages.
  Topics: deepseek-harness, dsh-plugin, glm.
  Suggested install: dsh plugin --profile web add dsh-glm-zcode / dsh plugin --profile web add dsh-hourness
```

## D. majiayu Harness Registry curated 条目（可选；优先等自动发现）

`sources/curated.json` 的 plugins 数组追加（`#子包` id 模式与其 vectorize-io/hindsight#coding-agents 一致）：

```json
{
  "id": "SunNorthGod/GLM-Hourness#glm",
  "name": "glm",
  "url": "https://github.com/SunNorthGod/GLM-Hourness/tree/main/packages/glm",
  "description": {
    "zh": "DeepSeek Harness 的 ZCode 兼容 GLM 通道：原生账号登录、身份头与请求签名，提示词与工具面对齐 ZCode 3.17.1，工具懒加载与压缩。",
    "en": "ZCode-compatible GLM channel for DeepSeek Harness: native account login, identity headers, request signing, prompt and tool surface mirroring ZCode 3.17.1, lazy tool loading and compaction."
  },
  "category": "model",
  "topics": ["deepseek-harness", "dsh-plugin", "glm"],
  "install": "dsh plugin --profile web add dsh-glm-zcode",
  "added": "2026-11-04"
}
```

（`#hourness` 条目同理，category `workflow`、install 换 `dsh-hourness`；stars/forks/icon 其同步任务回填。）
