/**
 * The words that make a text one about a habit to keep (M5 design §3.8.1;
 * dream design §3.5): the one permission list both readers share. The guard
 * rule `habit-ask-first` matches card questions with it
 * (src/memory/habit-rule.ts), the nightly consolidation pass matches the
 * person's sentences with it (src/memory/dream.ts). Pure functions.
 */

/**
 * Words that mark a habit to keep. A permission list: han words match by
 * substring, English ones by whole word, case insensitive. A card that asks
 * something else with one of them is refused too; the correction says to ask
 * it in plain chat, and the human can lift the rule.
 */
const HABIT_CARD_WORDS: readonly string[] = ['习惯', '偏好', '记住', '记下', '以后都', '以后每次', '每次都', '今后都', 'habit', 'preference', 'remember', 'from now on']

const isHan = (word: string): boolean => /[\u4e00-\u9fff]/u.test(word)

/** Whether a text carries one of the habit words. */
export function hasHabitWord(text: string): boolean {
  const lowered = text.toLowerCase()
  return HABIT_CARD_WORDS.some(word => isHan(word)
    ? text.includes(word)
    : new RegExp(`(?:^|[^a-z])${word}(?![a-z])`, 'u').test(lowered))
}

/** Whether one word of the list is a han word (matched by substring, not as a whole word). */
export const hanWord = isHan
