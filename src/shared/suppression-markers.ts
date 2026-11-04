/**
 * Suppression markers of the known checkers (M4 design §4.3): what the
 * `suppression-reason` rule judges new writes against and what the daily
 * count classes by. Pure data; the guard's rule (m4-rules) and the env
 * row's count (m4-suppressions) import this one table.
 */
export const SUPPRESSION_MARKERS: readonly string[] = [
  'eslint-disable',
  'eslint-disable-line',
  'eslint-disable-next-line',
  '@ts-ignore',
  '@ts-expect-error',
  '@ts-nocheck',
  '# noqa',
  '# type: ignore',
  '# pyright: ignore',
  'NOLINT',
  'NOLINTNEXTLINE',
  '#[allow(',
  '//nolint',
  '# shellcheck disable=',
  'jscpd:ignore-start',
  'gitleaks:allow',
]
