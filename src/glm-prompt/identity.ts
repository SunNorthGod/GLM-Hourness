/**
 * Identity-section assembly, mirroring the bundle's buildIdentityPrompt
 * (3.17.1 `fBa`) join structure: [opening, '', SECURITY_NOTICE, '',
 * '# Harness' block]. Pure functions — unit-tested against the captured
 * verbatim output shape.
 */
import {
  IDENTITY_OPENING_PLAIN,
  IDENTITY_OPENING_WITH_STYLE,
  SECURITY_NOTICE_OFFICIAL,
  SECURITY_NOTICE_USER,
} from './verbatim.ts'
import { buildHarnessBlock } from './zcode-harness-text.ts'
import { HARNESS_BLOCK_DSH } from './localize.ts'

/** Which security notice the identity section carries. */
export type SecurityNoticeVariant = 'official' | 'user'

/** Which harness block the identity section carries (ledger ①: host-fact lines). */
export type HarnessBlockVariant = 'verbatim' | 'dsh'

/**
 * Build the "Agent Identity" section body the way buildIdentitySection
 * (`wDn`) does in the bundle. The verbatim harness block takes the
 * mid-conversation-system branch, the desktop default
 * (`midConversationSystem !== false`).
 */
export function buildIdentitySection(
  outputStyleActive: boolean,
  notice: SecurityNoticeVariant = 'official',
  harness: HarnessBlockVariant = 'verbatim',
): string {
  const opening = outputStyleActive ? IDENTITY_OPENING_WITH_STYLE : IDENTITY_OPENING_PLAIN
  const security = notice === 'user' ? SECURITY_NOTICE_USER : SECURITY_NOTICE_OFFICIAL
  const harnessBlock = harness === 'dsh' ? HARNESS_BLOCK_DSH : buildHarnessBlock(true)
  return [opening, '', security, '', harnessBlock].join('\n')
}
