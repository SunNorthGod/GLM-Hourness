/**
 * The refusal of a tool in the shape the graph tools' and the design tools' have:
 * a tool error whose text is `{code, message, field?, hint}`, which the model reads
 * after "Error: ".
 */

/** Throw a refusal: the model reads the structured error after "Error: ". */
export function refuse(code: string, message: string, hint: string, field?: string): never {
  throw new Error(JSON.stringify(field === undefined ? { code, message, hint } : { code, message, field, hint }))
}