/**
 * ZCode 3.17.1 compaction continuation text (verbatim mirror,
 * docs/DESIGN.md §5.9, docs/reference/zcode-verbatim.md §7): the
 * transcript branch of `Bxt` (reference/zcode-3.17.1/zcode.cjs:14382–14384),
 * `t.transcriptPath&&(n+=…)`, appended after the summary when a transcript
 * path is given. The glm-compact row ends a GLM compaction summary with it
 * while the transcript row provides the export (src/glm-prompt/compact-row.ts).
 */

/** The sentence `Bxt` appends for `transcriptPath`, two newlines first, with the path in place of `${t.transcriptPath}`. */
export function transcriptNote(transcriptPath: string): string {
  return `

If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${transcriptPath}`
}
