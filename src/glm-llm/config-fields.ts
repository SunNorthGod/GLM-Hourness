/**
 * The two knobs of the channel's rows that name where the credential lives
 * and which plan it is for: `glm-llm` and `glm-login` both take them, with
 * the same words in the plugin manager. The rows cannot read each other's
 * config, so the plan has to be set equal on both (packages/glm/cordis.patch.yml).
 */
import Schema from '../shared/schemastery.ts'

export const homeField = Schema.string().description('Credential directory: the encrypted credential store lives here. Default: <DSH home>/glm-hourness.')

export const planField = Schema.union([Schema.const('coding-plan'), Schema.const('start-plan')]).default('coding-plan').description('Plan tier: coding-plan (default, usage bonus) or start-plan (gateway 3-block prompt, JWT auth).')
