/**
 * The request channel's shared constants and books (m4-request-card, design
 * §5.2-§5.6): which rules may be asked about, the word lists that decide a
 * human's reply, the per-caller exception sentences a denial carries, the
 * call signature a grant matches, and the two in-memory books — the grants
 * (`GrantBook`) and the helper that normalizes what the human wrote and what
 * the agent showed. Everything here is process memory: a restart drops every
 * grant and open request, and the agent re-files with a fresh ref (design
 * §5.6). Changing the word lists or the requestable rules is a permission
 * change (norm-review-floor full review); the journal's request, grant and
 * grant-void records are bookkeeping only and are never read to authorize
 * anything.
 */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { normalizePath } from './rules.ts'

/** The rules whose denial may be asked about (design §5.3); file-tools-only judges a habit and suppression-reason's way out is its right path. */
export const REQUESTABLE: ReadonlySet<string> = new Set(['workspace-containment', 'checker-config', 'scratch-only'])

/** The whole replies that approve (design §5.5); only whole sentences count — 可以吗 or 可以，顺便… walk the unclear path. */
export const APPROVAL_WORDS: ReadonlySet<string> = new Set(['可以', '可以的', '行', '好', '好的', '同意', '批准', '放行', '写吧', '改吧', 'ok', 'okay', 'yes', 'y'])

/** The whole replies that decline (design §5.5). */
export const DECLINE_WORDS: ReadonlySet<string> = new Set(['不行', '不可以', '不要', '不同意', '不批准', '别写', '别改', '算了', 'no', 'n'])

/** How long a grant lives after the human approved it (design §5.1 step 6). */
export const GRANT_TTL_MS = 30 * 60 * 1000

/** How long an open request waits for the human (design §5.5 step 1). */
export const REQUEST_TTL_MS = 2 * 60 * 60 * 1000

/** How many refused calls the memory keeps (design §5.3 step 3); the oldest leaves first. */
export const REFUSAL_LIMIT = 64

/** The worked example the tool description ends with (design §5.3, `d-agent-examples` F20); L2 feeds it through the parameter checks and `renderPlan`. */
export const REQUEST_EXAMPLE = 'request_exception {"ref": "r-3k9d2m7q", "purpose": "把今天新添的曲目追加到播放器读的歌单文件", "reversibility": "旧文件先备份，改坏了能找回；不碰别的文件", "alternatives": "试过写在工作区里，但播放器只读它自己的目录"}'

/** The tool description (design §5.3, verbatim), composed around the example. */
export const REQUEST_DESCRIPTION = `Ask the human to allow one call that a rule denied with a ref naming this tool. Pass the ref and three short sentences: why the call is needed, whether it can be undone and what else it touches, what you tried instead. The result is a short text for the human: put it, unchanged, at the very end of your reply and end your turn. The human's next message answers it; if they approve, the identical call goes through once within 30 minutes. Write the three sentences in the language the human uses: the human reads them as quotes. Example: ${REQUEST_EXAMPLE}`

/**
 * The exception sentence of a denial of a requestable rule, by who is being
 * denied (design §5.2's table). The root agent files the request itself; a
 * plain subagent hands the ref back to whoever dispatched it; the M7
 * worker's sentence arrives from M7's own outer gate through the requests
 * service (outsideDenial), never from here. `ref` is this call's own.
 */
export function exceptionOf(caller: RefusalVia, ref: string): string {
  if (caller === 'root') return `To write outside the workspace, call request_exception {"ref": "${ref}", "purpose": "<why, one short sentence>", "reversibility": "<can it be undone, what else it touches>", "alternatives": "<what you tried instead>"}. It returns a short text for the human: put it at the end of your reply and end your turn. If the human answers 可以, this identical call goes through once within 30 minutes.`
  if (caller === 'worker') return `To write outside the workspace, ask the main agent with ask_main: give ref "${ref}" and the target path. When it answers that the human approved, make this identical call again. If no answer comes, hand back with the ref and the target under questions.`
  return `A subagent cannot ask the human. If this write is needed, put ref "${ref}" and the target path in your final result; the agent that started you files the request.`
}


/** The signature of one denied call (design §5.6): the first 16 hex digits of the SHA-256 over the canonical JSON of [native tool, arguments], the target path swapped for its resolved normal form. One changed character is another call. */
export function signatureOf(native: string, args: unknown, base: string | undefined): string {
  const source = typeof args === 'object' && args !== null && !Array.isArray(args) ? args as Readonly<Record<string, unknown>> : {}
  const normalized: Record<string, unknown> = { ...source }
  const target = typeof normalized.file_path === 'string' ? normalized.file_path : typeof normalized.path === 'string' ? normalized.path : undefined
  if (target !== undefined) normalized[typeof normalized.file_path === 'string' ? 'file_path' : 'path'] = normalizePath(base === undefined ? resolve(target) : resolve(base, target))
  return createHash('sha256').update(JSON.stringify([native, normalized])).digest('hex').slice(0, 16)
}

/** Normalize a human's message or the agent's shown text for comparison (design §5.5 step 3): NFC, CRLF folded, line-end blanks gone, blank runs collapsed, ends trimmed. */
export function normalizeShown(text: string): string {
  return text
    .normalize('NFC')
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The human's words as the decision reads them: `normalizeShown`, then the trailing sentence punctuation and the wrapping quotes gone, ASCII letters lowercased (design §5.5 step 4). */
export function normalizeWords(text: string): string {
  return normalizeShown(text)
    .replace(/[。.!！~～]+$/, '')
    .replace(/^["'「『]+/, '')
    .replace(/["'」』]+$/, '')
    .replace(/[A-Z]/g, letter => letter.toLowerCase())
}

/** One human-approved write (design §5.6), kept in memory only. */
export interface GrantEntry {
  readonly ref: string
  readonly rule: string
  readonly signature: string
  /** The dispatch chain's root the refusal recorded; the grant matches calls of the same root. */
  readonly root: string
  /** The target facts the plan text stated, re-checked at use time. */
  readonly facts: { readonly exists: boolean, readonly size?: number | undefined, readonly mtimeMs?: number | undefined }
  readonly decidedAt: number
  readonly expiresAt: number
  readonly words: string
  /** Where the use-time backup copied the old content (design §5.6); set by the guard row when the grant is spent, read by the GrantRecord. */
  backupPath?: string | undefined
}

/**
 * The book of human-approved writes (design §5.6): found by signature and
 * dispatch root, used once, voided when the target moved. `inUse` keeps one
 * process from running two identical granted calls in parallel: marked
 * before `next()`, consumed after it allowed, released when it did not.
 */
export class GrantBook {
  private readonly grants = new Map<string, GrantEntry>()
  private readonly inUse = new Set<string>()

  add(entry: GrantEntry): void {
    this.grants.set(entry.ref, entry)
  }

  /** The unused, unexpired, not-in-use grant for a signature and dispatch root, or undefined. */
  find(signature: string, root: string): GrantEntry | undefined {
    const now = Date.now()
    for (const grant of this.grants.values()) {
      if (grant.signature !== signature || grant.root !== root) continue
      if (this.inUse.has(grant.ref)) continue
      if (grant.expiresAt <= now) {
        this.grants.delete(grant.ref)
        continue
      }
      return grant
    }
    return undefined
  }

  get(ref: string): GrantEntry | undefined {
    return this.grants.get(ref)
  }

  void(ref: string): GrantEntry | undefined {
    const grant = this.grants.get(ref)
    this.grants.delete(ref)
    this.inUse.delete(ref)
    return grant
  }

  markInUse(ref: string): void {
    this.inUse.add(ref)
  }

  consume(ref: string): void {
    this.grants.delete(ref)
    this.inUse.delete(ref)
  }

  release(ref: string): void {
    this.inUse.delete(ref)
  }
}

/** Who was denied (design §5.2): the root files itself, the plain subagent hands the ref back, the M7 worker's sentence comes from the outer gate. */
export type RefusalVia = 'root' | 'subagent' | 'worker'

/** One refused call the human may yet ask about (design §5.3 step 3). */
export interface RefusalEntry {
  readonly ref: string
  readonly rule: string
  /** The DSH native the call ran, and the call itself, verbatim for the approval note (design §5.5). */
  readonly tool: string
  readonly args: Readonly<Record<string, unknown>>
  readonly signature: string
  /** The resolved absolute target. */
  readonly target: string
  readonly at: number
  /** The calling agent (the 2h closing reminder and the approval note's second line read it). */
  readonly agentId: string | undefined
  readonly sessionId: string | undefined
  /** The dispatch chain's root (src/guard/design-release.ts); grants match by it. */
  readonly dispatchRoot: string
  /** Who was denied, as the exception sentence and the approval note's second line read it (design §5.2, §5.5). */
  readonly via: RefusalVia
}

/** The memory of refused calls a request may cite (design §5.3 step 3): at most `REFUSAL_LIMIT`, the oldest out. */
export class RefusalBook {
  private readonly refusals = new Map<string, RefusalEntry>()

  add(entry: RefusalEntry): void {
    this.refusals.set(entry.ref, entry)
    while (this.refusals.size > REFUSAL_LIMIT) {
      const oldest = this.refusals.keys().next().value as string
      this.refusals.delete(oldest)
    }
  }

  get(ref: string): RefusalEntry | undefined {
    return this.refusals.get(ref)
  }

  remove(ref: string): void {
    this.refusals.delete(ref)
  }
}
