/**
 * The names the plugin manager shows for the two packages (docs/ORCHESTRATION.md
 * §16.2; rules design §7.2), for every place that tells the person which
 * package brings an entry: "项目编排带来的 · 只能看". Pure, so the client and
 * both packages can import it; no Node built-in.
 */
const LABELS: Readonly<Record<string, string>> = {
  'dsh-hourness': '项目编排',
  'dsh-glm-zcode': 'GLM 通道',
}

/** The plugin manager's name for a package; a package it does not know is named by itself. */
export function pluginLabel(packageName: string): string {
  return Object.hasOwn(LABELS, packageName) ? LABELS[packageName] : packageName
}
