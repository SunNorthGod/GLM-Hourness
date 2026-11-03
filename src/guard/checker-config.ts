/**
 * checker-config (m4-gate G3, design §4.4): a file-tool write whose target
 * is a checker configuration or baseline file is denied — loosening a check
 * is an unplanned decision, and the rule cannot tell loosening from
 * tightening, so every hit is denied and the way out is the request channel
 * (G4 wires the tool; the correction already names it with the ref the gate
 * pre-generated for this call). The targets: the built-in file-name table,
 * plus the `config` acceptance lines of the project graph's env tool nodes
 * (repository-relative), which the judgment context carries and which are
 * only consulted when the graph was readable. Unknown facts pass the call.
 */
import { basename } from 'node:path'
import { fileToolTargetOf, type Correction, type GuardRule, type RuleVerdict } from './rules.ts'
import { checkoutRootOf } from '../data/project-root.ts'
import { pathKey } from './mention.ts'
import { relativeToRoot, type RuleContext } from './context.ts'

const ALLOW: RuleVerdict = { kind: 'allow' }

/** One name row of the built-in table (design §4.4): an exact name or a prefix pattern with one `*`. */
const BUILTIN: readonly string[] = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc', '.eslintrc.*', 'eslint-suppressions.json',
  'knip.js', 'knip.ts', 'knip.json', 'knip-baseline.json',
  '.jscpd.json', '.jscpd-baseline.json',
  'tsconfig.json', 'tsconfig.*.json',
  '.gitleaks.toml', 'ruff.toml', '.ruff.toml', 'mypy.ini', '.clang-tidy', '.shellcheckrc',
]

/** Whether the file's base name is one of the built-in checker configuration names. */
function isBuiltinConfig(name: string): boolean {
  const lower = name.toLowerCase()
  return BUILTIN.some(pattern => pattern.includes('*')
    ? lower.startsWith(pattern.split('*')[0]) && lower.endsWith(pattern.split('*')[1]) && lower.length >= pattern.length - 1
    : lower === pattern)
}

const correctionOf = (file: string, ref: string): Correction => ({
  fact: `You tried to change the checker configuration \`${file}\`.`,
  violation: 'Changes to checker configuration and baselines need the human: loosening a check is an unplanned decision.',
  rightPath: `Fix the findings instead; if the configuration must change, call request_exception with ref "${ref}" and say what the change does to the checks.`,
  exception: 'Shrinking a baseline with the project\'s update script (for example `npm run lint:update`) is not a configuration edit.',
})

/** The rule over one call's prepared context; `ref` is the denial's request ref (design §5.2). */
export function checkerConfigOnly(context: RuleContext, ref: string): GuardRule {
  return {
    id: 'checker-config',
    declare: 'Checker configuration and baselines change only through the request channel.',
    detect(call) {
      const target = fileToolTargetOf(call)
      if (target === undefined) return ALLOW
      const name = basename(target)
      if (isBuiltinConfig(name)) return { kind: 'deny', rule: 'checker-config', correction: correctionOf(target, ref) }
      // The env tool nodes' config lines are repository-relative: the target
      // is compared relative to the checkout it sits in, and only when the
      // graph was readable (design §4.1: the graph unreadable, built-ins
      // only).
      const envConfigs = context.envConfigs
      if (envConfigs !== undefined && envConfigs.length > 0) {
        const root = checkoutRootOf(target)
        const rel = root === undefined ? undefined : relativeToRoot(root, target)
        if (rel !== undefined && envConfigs.some(path => pathKey(path) === pathKey(rel))) {
          return { kind: 'deny', rule: 'checker-config', correction: correctionOf(target, ref) }
        }
      }
      return ALLOW
    },
  }
}
