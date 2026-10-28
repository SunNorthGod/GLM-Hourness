/** Units from the largest down, in milliseconds. */
export const UNITS = [
  ['h', 3_600_000],
  ['m', 60_000],
  ['s', 1_000],
  ['ms', 1],
]

/**
 * Format a non-negative integer number of milliseconds as space-separated
 * segments from the largest unit down, skipping zero segments:
 * formatDuration(3723004) === '1h 2m 3s 4ms', formatDuration(0) === '0ms'.
 * Throws TypeError for anything that is not a non-negative safe integer.
 */
export function formatDuration(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new TypeError(`expected a non-negative integer number of milliseconds, got ${String(ms)}`)
  if (ms === 0) return '0ms'
  const segments = []
  let rest = ms
  for (const [unit, size] of UNITS) {
    const count = Math.floor(rest / size)
    if (count > 0) segments.push(`${count}${unit}`)
    rest -= count * size
  }
  return segments.join(' ')
}
