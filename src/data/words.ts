/**
 * The words of a text, for judging whether two short texts are about the
 * same thing: memory entries (src/memory/model.ts) and lessons
 * (src/lessons/model.ts) use the same measure. Pure functions, no Node
 * built-ins: the lessons page in the browser imports the models.
 */

/** English by word, Chinese by adjacent pair of characters (a lone character stands for itself). */
export function wordsOf(text: string): Set<string> {
  const words = new Set<string>()
  for (const run of text.toLowerCase().match(/[a-z0-9]+|[\u3400-\u9fff]+/g) ?? []) {
    if (/^[a-z0-9]/.test(run) || run.length === 1) words.add(run)
    else for (let index = 0; index + 1 < run.length; index += 1) words.add(run.slice(index, index + 2))
  }
  return words
}

/** Overlap of two word sets, 0 to 1; two empty sets overlap by 0. */
export function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const shared = [...left].filter(word => right.has(word)).length
  const union = left.size + right.size - shared
  return union === 0 ? 0 : shared / union
}
