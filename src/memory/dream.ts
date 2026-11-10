/**
 * The nightly consolidation pass's extraction (dreaming, narrow version B;
 * design `.agents/tasks/dream/design.md` §3.5, digest
 * `.agents/tasks/reading-2026-11-10/digest.md` §6 candidate 1, option B):
 * from the session transcripts the transcript row exports
 * (src/data/transcript.ts), the requests the person stated in at least two
 * sessions become consolidation candidates — never what an agent said, and
 * both polarities alike (what worked and what to stop), because an
 * instruction to record failures only measurably hurts (digest §2.2, first
 * piece). Deterministic on purpose: word lists and the repository's one
 * similarity measure (src/data/words.ts), no model call; a later version may
 * add one outside the pass (design §6).
 *
 * Pure functions: the caller reads the files and decides what is written.
 */
import { createHash } from 'node:crypto'
import { findSecret } from '../data/secret-shape.ts'
import { jaccard } from '../data/words.ts'
import { hanWord, hasHabitWord } from './habit-words.ts'

/** How far back a pass reads: the transcripts written in the last two days. */
export const DREAM_WINDOW_MS = 48 * 3_600_000

/** The most candidates one pass brings; the biggest clusters first. */
export const DREAM_MAX_CANDIDATES = 5

/**
 * The overlap at which two sentences read as the same request. The measure
 * is the repository's own jaccard (src/data/words.ts), but over the
 * sentence's own tokens — English by word, one han character each — because
 * a request rephrased is far less similar as a whole sentence than a memory
 * name next to a description; 0.5 sits between the spec's same-request
 * rephrases (0.5–0.71) and its unrelated pairs (below 0.17), and the
 * recurrence gate of two sessions does the rest of the weeding.
 */
export const DREAM_CLUSTER_SHARE = 0.5

/** A candidate's name: opaque on purpose, stable for the same request, merged across days by it. */
const NAME_PREFIX = 'dream-'

/** Words of a correction, the negative polarity of a request. Han words match by substring, English ones by whole word — the habit list's own rule. */
const AVOID_WORDS: readonly string[] = ['不要', '别再', '不许', '禁止', '以后别', '别总是', "don't", 'do not', 'never', 'stop']

/** What a sentence asks for: keep it this way, stop doing this, or nothing. */
export type Marker = 'keep' | 'avoid'

export interface DreamInput {
  /** The session id the export is named after. */
  readonly session: string
  /** The export's path relative to the project's `.llm`, as the evidence carries it. */
  readonly file: string
  readonly text: string
  readonly mtimeMs: number
}

/** One candidate of one pass: the fields of a `propose` record, before the fold's checks. */
export interface DreamCandidate {
  readonly name: string
  readonly type: 'feedback'
  readonly scope: 'project'
  readonly description: string
  readonly body: string
  readonly evidence: readonly string[]
}

// --- Reading a transcript ---------------------------------------------------

/** One entry of an export: the line `=== #<seq> <kind> <ISO time>` and the text under it. */
export interface TranscriptEntry {
  readonly seq: number
  readonly kind: string
  readonly time: string
  readonly text: string
}

const ENTRY_HEAD = /^=== #(\d+) (\S+) (\S.*)$/

/**
 * The entries of one export, in order. The five header lines sit before the
 * first `===` line and are dropped; a line longer than the export's line
 * width continues on the next (src/data/transcript.ts), so an entry's text
 * is its lines joined with a space — the sentence boundaries survive.
 */
export function parseTranscript(text: string): readonly TranscriptEntry[] {
  const entries: TranscriptEntry[] = []
  let current: { seq: number, kind: string, time: string, lines: string[] } | undefined
  for (const line of text.split(/\r\n|\r|\n/)) {
    const head = ENTRY_HEAD.exec(line)
    if (head === null) {
      if (current !== undefined && line.trim() !== '') current.lines.push(line.trim())
      continue
    }
    if (current !== undefined) entries.push(finishEntry(current))
    current = { seq: Number(head[1]), kind: head[2] ?? '', time: head[3] ?? '', lines: [] }
  }
  if (current !== undefined) entries.push(finishEntry(current))
  return entries
}

const finishEntry = (entry: { seq: number, kind: string, time: string, lines: string[] }): TranscriptEntry =>
  ({ seq: entry.seq, kind: entry.kind, time: entry.time, text: entry.lines.join(' ') })

// --- Matching the person's requests -----------------------------------------

const cut = (text: string, limit: number): string => {
  const points = [...text.replace(/\s+/gu, ' ').trim()]
  return points.length <= limit ? points.join('') : `${points.slice(0, limit - 1).join('')}…`
}

/** Whether a text carries one of the correction words, with the habit list's matching rule. */
export function hasAvoidWord(text: string): boolean {
  const lowered = text.toLowerCase()
  return AVOID_WORDS.some(word => hanWord(word)
    ? text.includes(word)
    : new RegExp(`(?:^|[^a-z])${word}(?![a-z])`, 'u').test(lowered))
}

/** What one sentence asks for; anything else is not the person's request. */
export function markerOf(sentence: string): Marker | undefined {
  if (hasHabitWord(sentence)) return 'keep'
  if (hasAvoidWord(sentence)) return 'avoid'
  return undefined
}

/** The sentences of one text, cut on the sentence ends and the line ends the export kept. */
export function sentencesOf(text: string): readonly string[] {
  return text
    .split(/(?<=[。！？!?])\s*|\s*[\r\n]+\s*/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 4)
}

/**
 * The person's marked sentences of one export, at most one of each marker
 * per entry — one message does not feed a cluster several times.
 */
export function personSentences(entries: readonly TranscriptEntry[]): readonly string[] {
  const sentences: string[] = []
  for (const entry of entries) {
    if (entry.kind !== 'user' && entry.kind !== 'user/message') continue
    const seen = new Set<Marker>()
    for (const sentence of sentencesOf(entry.text)) {
      const marker = markerOf(sentence)
      if (marker === undefined || seen.has(marker)) continue
      seen.add(marker)
      sentences.push(sentence)
    }
  }
  return sentences
}

// --- Clustering -------------------------------------------------------------

/** The key a candidate's name is the digest of: the sentence, case and spacing folded away. */
const normalized = (sentence: string): string => sentence.toLowerCase().replace(/\s+/gu, ' ').trim()

const nameOf = (sentence: string): string =>
  `${NAME_PREFIX}${createHash('sha256').update(normalized(sentence)).digest('hex').slice(0, 8)}`

interface Cluster {
  readonly representative: string
  /** Built while clustering; read as a ReadonlyMap afterwards. */
  readonly sessions: Map<string, readonly string[]>
}

/** One cluster's sentences per session, deduped. */
const sentencesOfCluster = (cluster: Cluster): readonly string[] =>
  [...new Set([...cluster.sessions.values()].flat())]

/**
 * The tokens a cluster compares: English by word, a han character each —
 * order-free, so a rephrase that moves its words still meets itself.
 */
const tokensOf = (sentence: string): Set<string> => {
  const tokens = new Set<string>()
  for (const run of sentence.toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]/g) ?? []) tokens.add(run)
  return tokens
}

/**
 * Greedy clustering over the sessions in the order given: a sentence joins
 * the first cluster whose representative it reads like; the representative
 * is the cluster's first sentence, so the same input always gives the same
 * clusters and names.
 */
export function clusterSessions(sessions: ReadonlyMap<string, readonly string[]>): readonly Cluster[] {
  const clusters: Cluster[] = []
  for (const [session, sentences] of sessions) {
    for (const sentence of sentences) {
      const found = clusters.find(cluster => jaccard(tokensOf(cluster.representative), tokensOf(sentence)) >= DREAM_CLUSTER_SHARE)
      if (found === undefined) {
        clusters.push({ representative: sentence, sessions: new Map([[session, [sentence]]]) })
        continue
      }
      const own = found.sessions.get(session)
      found.sessions.set(session, own === undefined ? [sentence] : [...own, sentence])
    }
  }
  return clusters
}

// --- The candidates of one pass ---------------------------------------------

const WHY_LIMIT = 5

/** The body of a candidate: the person's sentences, then why and how, the store's field table's own shapes. */
function bodyOf(sentences: readonly string[], sessions: readonly string[]): string {
  const lines = sentences.slice(0, WHY_LIMIT).map(sentence => `- ${cut(sentence, 180)}`)
  const more = sentences.length > WHY_LIMIT ? [`- …and ${sentences.length - WHY_LIMIT} more of the same`] : []
  const who = sessions.slice(0, WHY_LIMIT).join(', ')
  return [
    ...lines,
    ...more,
    '',
    `**Why:** the person made this request in ${sessions.length} session(s) (${who}); the sentences above are their words from the transcripts.`,
    '**How to apply:** nothing yet — a proposal waits for the person to confirm it (memory_store) or drop it (memory_forget); until then treat it as unset.',
  ].join('\n').slice(0, 4000)
}

/**
 * The pass's candidates: the clusters that span at least two sessions of the
 * window, biggest first, at most DREAM_MAX_CANDIDATES, each through the
 * secret table — an export is redacted already, a candidate that still reads
 * like a credential is dropped, not written.
 */
export function extractCandidates(inputs: readonly DreamInput[], nowMs: number): readonly DreamCandidate[] {
  const fresh = inputs
    .filter(input => Number.isFinite(input.mtimeMs) && nowMs - input.mtimeMs <= DREAM_WINDOW_MS)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
  const sessions = new Map<string, readonly string[]>()
  const files = new Map<string, string>()
  for (const input of fresh) {
    const marked = personSentences(parseTranscript(input.text))
    if (marked.length === 0) continue
    sessions.set(input.session, marked)
    files.set(input.session, input.file)
  }
  const candidates: DreamCandidate[] = []
  const clusters = clusterSessions(sessions)
    .filter(cluster => cluster.sessions.size >= 2)
    .sort((left, right) => right.sessions.size - left.sessions.size)
  for (const cluster of clusters) {
    if (candidates.length >= DREAM_MAX_CANDIDATES) break
    const sentences = sentencesOfCluster(cluster)
    const who = [...cluster.sessions.keys()]
    // The cluster's one wording that names and describes it: the shortest, ties by code points —
    // independent of which session's export was newest, so the same family merges across days.
    const canonical = [...sentences].sort((left, right) => left.length - right.length || (left < right ? -1 : left > right ? 1 : 0))[0] ?? ''
    const description = cut(canonical, 200)
    const body = bodyOf(sentences, who)
    if (findSecret(description) !== undefined || findSecret(body) !== undefined) continue
    const name = nameOf(canonical)
    if (candidates.some(candidate => candidate.name === name)) continue
    candidates.push({
      name,
      type: 'feedback',
      scope: 'project',
      description,
      body,
      evidence: who.slice(0, WHY_LIMIT).map(session => files.get(session) ?? `transcripts/${session}.txt`),
    })
  }
  return candidates
}
