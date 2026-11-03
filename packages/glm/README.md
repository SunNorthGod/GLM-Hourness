# dsh-glm-zcode

ZCode-compatible GLM channel for DeepSeek Harness (DSH). The bundle runs GLM on its ZCode 3.17.1 training distribution: the native channel with account login and encrypted credentials, client identity headers, Signing V4 request signatures, endpoint routing, an Anthropic Messages transport, coding-plan / start-plan plans, and a prompt and tool surface that mirrors ZCode 3.17.1 (lazy tool loading, todo reminders, compaction). It is a third-party DSH bundle: one package, five independent rows, toggled per row in the plugin manager. Disabling a row degrades the session gracefully, and non-GLM sessions are unaffected.

## Install

Requires DeepSeek Harness 0.2.1-rc.3 (declared as `engines.dsh`; the plugin manager checks it and refuses incompatible versions).

Once published:

```
dsh plugin add dsh-glm-zcode
```

Together with the orchestration bundle (optional, model-agnostic):

```
dsh plugin add dsh-glm-zcode dsh-hourness
```

Until published, install from a checkout:

```
dsh plugin add <checkout>/packages/glm <checkout>/packages/hourness -w
```

The settings section and the GLM pill under the composer are the package's own client face (`ui/`); installing the package is enough. First use: `/glm-login` authorizes in the browser and stores the credential encrypted in the DSH user directory; `/glm-status` reports credential state and per-row health; the model selector then lists the `glm-zcode` route. Desktop DSH loads new code only after a full restart.

## Rows

Declared in `cordis.patch.yml` (DSH Loader dialect). Row ids keep the `glm-hourness/` prefix so profile overrides match by id.

| Row id | What it does | Ships |
| --- | --- | --- |
| `glm-hourness/glm-llm` | the native channel: login credential, identity headers, signing, endpoint routing, transport, coding-plan / start-plan | disabled |
| `glm-hourness/glm-login` | `/glm-login`, `/glm-status`, `/glm-logout` | enabled |
| `glm-hourness/glm-prompt` | prompt and tool-surface mirror, local tool search, todo reminders | enabled |
| `glm-hourness/glm-compact` | compaction mirror | enabled |
| `glm-hourness/glm-ui` | client face: GLM pill and settings section | enabled |

`glm-llm` ships disabled; enable it in the plugin manager once you accept it on your profile.

## License

The repository's own code is licensed under the PolyForm Noncommercial License 1.0.0 (licensor NorthGod): noncommercial use is granted, commercial use needs a separate grant (northgod@qq.com). Third-party material this bundle carries — in particular ZCode 3.17.1 prompt text reproduced verbatim and parts ported from TriDefender/zcode-api (CC BY-NC-SA) — is inventoried in the repository's `THIRD-PARTY-NOTICES.md` and is not covered by that license. Both files ship inside the package (`LICENSE`, `THIRD-PARTY-NOTICES.md`).

## 简体中文

`dsh-glm-zcode` 让 GLM 按 ZCode 3.17.1 的训练分布住进 DeepSeek Harness：原生通道与账号登录（加密凭证）、身份头、Signing V4 请求签名、端点路由、Anthropic Messages 传输、coding-plan / start-plan 双档，以及逐字镜像 ZCode 3.17.1 的提示词与工具面（工具懒加载、todo 提醒、压缩）。五个独立行按 `cordis.patch.yml` 声明，在插件管理器逐行启停，停用任意一行会话优雅降级，非 GLM 会话不受影响。发布后 `dsh plugin add dsh-glm-zcode` 安装（可与 `dsh-hourness` 一起装）；发布前用检出路径安装（见上）。首次使用 `/glm-login` 浏览器授权，`/glm-status` 看凭证与各行健康，模型选择器选 `glm-zcode` 路由。许可：本仓自有代码按 PolyForm Noncommercial 1.0.0 授权（`LICENSE`，商用需另行联系 northgod@qq.com）；逐字复现的 ZCode 文本与移植部分的出处见 `THIRD-PARTY-NOTICES.md`。
