/**
 * Start-plan gateway prompt assembly (ported from reference/zcode-api
 * src/proxy/system-prompt.ts, mirroring the ZCode 3.16.3 ContextBuilder):
 * the gateway content-inspects the `system` field — without the ZCode
 * identity blocks it rejects with 3012/405 "unusual activity". The assembly
 * is EXACTLY 3 wire blocks:
 *   1. cli_prefix alone, no cache_control (since 3.15.1)
 *   2. stable sections (Agent Identity + Desktop Context) + the caller's own
 *      system text appended, joined with \n\n, ephemeral
 *   3. dynamic sections (beforeEnvironment + Environment + afterEnvironment)
 *      with an explicit \n\n block prefix, ephemeral
 * and the first user turn ALWAYS carries a currentDate context_prefix wrapped
 * in system-reminder tags.
 */
import { ZCODE_SYSTEM } from './zcode-system.ts'

/** Runtime environment values for the Environment section. */
export interface StartPlanEnvInfo {
  readonly cwd: string
  readonly platform: string
  readonly shell: string
  readonly osVersion: string
  readonly isGitRepository?: boolean
}

export interface SystemBlock {
  readonly type: 'text'
  readonly text: string
  readonly cache_control?: { type: 'ephemeral' }
}

/** Registry provider label for the poweredBy line (zai→"zai-api", bigmodel→"bigmodel-api"). */
export function providerLabel(provider: string): string {
  return provider === 'zai' ? 'zai-api' : 'bigmodel-api'
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Build the Environment section with real runtime values; the poweredBy line
 * closes the section. `cwd` is never "unknown" in real traffic — the caller
 * must pass a real directory so the prompt can never contradict the
 * X-Platform/X-Os-Version headers.
 */
export function buildEnvironmentSection(env: StartPlanEnvInfo, provider: string, model: string): string {
  const lines = [
    ZCODE_SYSTEM.environment.heading,
    ZCODE_SYSTEM.environment.invokedLine,
    `- ${ZCODE_SYSTEM.environment.cwdLabel}: ${env.cwd}`,
    `- ${ZCODE_SYSTEM.environment.gitLabel}: ${env.isGitRepository === undefined || env.isGitRepository === true ? 'yes' : ZCODE_SYSTEM.environment.gitNo}`,
    `- ${ZCODE_SYSTEM.environment.platformLabel}: ${env.platform}`,
    `- ${ZCODE_SYSTEM.environment.shellLabel}: ${env.shell}`,
    `- ${ZCODE_SYSTEM.environment.osVersionLabel}: ${env.osVersion}`,
    ZCODE_SYSTEM.environment.poweredByLine.replace('{provider}', providerLabel(provider)).replace('{model}', model),
  ]
  return lines.join('\n')
}

/**
 * Build the ZCode Desktop Context section. `visualizationDirectory` is the
 * desktop norm (3 lines including the JSON-stringified dir); the 1-line
 * fallback covers hosts without one.
 */
export function buildDesktopContextSection(visualizationDirectory: string | undefined): string {
  const views = ZCODE_SYSTEM.desktopContext.interactiveViews
  const viewsBlock = visualizationDirectory === undefined
    ? views.fallbackLine
    : [views.genUiLine, views.visualizationDirectoryLine.replace('{dir}', JSON.stringify(visualizationDirectory)), views.visualizeSkillLine, views.widgetLine].join('\n')
  return [ZCODE_SYSTEM.desktopContext.heading, views.heading, viewsBlock, ZCODE_SYSTEM.desktopContext.filesAndUrlsOnwards].join('\n')
}

/** Custom caller system text: trimmed string or the joined text blocks, cache_control dropped. */
export function customSystemText(system: unknown): string | undefined {
  if (system === null || system === undefined) return undefined
  if (typeof system === 'string') {
    const text = system.trim()
    return text.length > 0 ? text : undefined
  }
  if (!Array.isArray(system)) return undefined
  const parts: string[] = []
  for (const item of system) {
    if (typeof item === 'string') {
      if (item.trim().length > 0) parts.push(item)
    }
    else if (typeof item === 'object' && item !== null) {
      const block = item as { type?: unknown, text?: unknown }
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) parts.push(block.text)
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

/**
 * Assemble the 3-block start-plan system array. The caller's own system text
 * appends to the stable block (never a fourth block; the gateway rejects
 * unexpected shapes).
 */
export function buildStartPlanSystem(system: unknown, env: StartPlanEnvInfo, provider: string, model: string, visualizationDirectory?: string): ReadonlyArray<SystemBlock> {
  const stableParts = [...ZCODE_SYSTEM.stableSections, buildDesktopContextSection(visualizationDirectory)]
  const custom = customSystemText(system)
  if (custom !== undefined) stableParts.push(custom)
  const dynamic = [
    ZCODE_SYSTEM.dynamicSections.beforeEnvironment,
    buildEnvironmentSection(env, provider, model),
    ZCODE_SYSTEM.dynamicSections.afterEnvironment,
  ].join('\n\n')
  return [
    { type: 'text', text: ZCODE_SYSTEM.cliPrefix },
    { type: 'text', text: stableParts.join('\n\n'), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `\n\n${dynamic}`, cache_control: { type: 'ephemeral' } },
  ]
}

/** The currentDate context-prefix the client ALWAYS attaches to the first user turn. */
export function buildContextPrefixMessage(now = new Date()): { role: 'user', content: ReadonlyArray<{ type: 'text', text: string }> } {
  const body = [
    ZCODE_SYSTEM.contextPrefix.intro,
    `${ZCODE_SYSTEM.contextPrefix.currentDateHeading}\n${ZCODE_SYSTEM.contextPrefix.currentDateLine.replace('{date}', localDate(now))}`,
    ZCODE_SYSTEM.contextPrefix.outro,
  ].join('\n\n')
  return { role: 'user', content: [{ type: 'text', text: `${ZCODE_SYSTEM.systemReminder.open}\n${body}\n${ZCODE_SYSTEM.systemReminder.close}` }] }
}
