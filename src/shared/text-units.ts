/**
 * The one word count of the repository (metrics design §4.3, M7 §3.12.3):
 * every Han character, kana syllable, Hangul syllable and fullwidth
 * character counts as 1; every run of consecutive ASCII letters and digits
 * counts as 1 (one English word); punctuation and whitespace do not count.
 * Project graph texts, card texts, reports and the metrics journal's
 * `units` fields all measure with this function, so their numbers compare.
 */

/** Han, kana and Hangul script runs (one unit per character) or a fullwidth form; CJK punctuation and halfwidth forms do not count. */
const UNIT_PATTERN_SOURCE = '(\\p{Script=Han}|\\p{Script=Hiragana}|\\p{Script=Katakana}|\\p{Script=Hangul}|[\\uFF01-\\uFF60\\uFFE0-\\uFFE6])|([A-Za-z0-9]+)'

/** The count of `text` in the repository's units. */
export function textUnits(text: string): number {
  const pattern = new RegExp(UNIT_PATTERN_SOURCE, 'gu') // a fresh regex per call: `lastIndex` must not leak between texts
  let units = 0
  while (pattern.exec(text) !== null) units += 1
  return units
}
