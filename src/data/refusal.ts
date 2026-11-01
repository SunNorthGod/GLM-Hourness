/**
 * What the memory and the lessons model say when they refuse a write, and
 * the two small checks every field table starts from. A refusal carries a
 * code that the caller maps to its tool error (each model has its own list
 * of codes), the reason in English because it reaches the model that wrote
 * the text, the field at fault and, where there is one, the way out. Pure
 * functions, no Node built-ins.
 */
export interface Refusal<Code extends string = string> {
  readonly code: Code
  readonly message: string
  readonly field?: string
  readonly hint?: string
}

export const refuse = <Code extends string>(code: Code, message: string, field?: string, hint?: string): Refusal<Code> => ({
  code,
  message,
  ...(field === undefined ? {} : { field }),
  ...(hint === undefined ? {} : { hint }),
})

export const invalid = (field: string | undefined, message: string, hint?: string): Refusal<'invalid'> => refuse('invalid', message, field, hint)

export const isRefusal = (value: object): value is Refusal => 'code' in value

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export const listOf = (value: unknown): unknown[] | undefined => Array.isArray(value) ? value as unknown[] : undefined
