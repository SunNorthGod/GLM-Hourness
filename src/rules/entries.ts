/**
 * The checks of what the project state and the rules file hold besides rules
 * (docs/ORCHESTRATION.md §16; design §7.2): signals, script pins, detectors,
 * waiting tickets and notices. They answer "is this a stored entry of that
 * kind", never "is this a good thing to have decided": the engine checks a
 * request when it is made, and these checks only keep a hand-edited file or a
 * damaged snapshot from putting an entry in the state that nothing can read.
 * Pure; no Node built-in is imported (src/rules/model.ts, which imports this
 * file, is also meant for a client).
 */
import type { SignalType } from './model.ts'

export type Problem = string | undefined

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
export const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

export function unknownKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): Problem {
  const extra = Object.keys(record).find(key => !allowed.includes(key))
  return extra === undefined ? undefined : `${path}.${extra} is not a field`
}

export function textField(record: Record<string, unknown>, key: string, path: string): Problem {
  return record[key] === undefined || typeof record[key] === 'string' ? undefined : `${path}.${key} must be a string`
}

/** A time that may be absent. */
function timeField(record: Record<string, unknown>, key: string, path: string): Problem {
  return record[key] === undefined || isTime(record[key]) ? undefined : `${path}.${key} must be an ISO time`
}

/** A text that must be there. */
function requiredText(record: Record<string, unknown>, key: string, path: string): Problem {
  return typeof record[key] === 'string' && record[key] !== '' ? undefined : `${path}.${key} must be a string`
}

/** One of a fixed set of words. */
function oneOf(record: Record<string, unknown>, key: string, words: readonly string[], path: string): Problem {
  return typeof record[key] === 'string' && words.includes(record[key]) ? undefined : `${path}.${key} must be one of ${words.join(', ')}`
}

const stringList = (value: unknown): boolean => Array.isArray(value) && value.every(item => typeof item === 'string')

export function matchesType(type: SignalType, value: unknown): boolean {
  if (type.kind === 'boolean') return typeof value === 'boolean'
  if (type.kind === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === 'string' && type.values.includes(value)
}

function signalTypeProblem(type: unknown, path: string): Problem {
  if (!isRecord(type)) return `${path} must be an object`
  if (type.kind === 'boolean') return unknownKeys(type, ['kind'], path)
  if (type.kind === 'number') return unknownKeys(type, ['kind', 'unit'], path) ?? textField(type, 'unit', path)
  if (type.kind === 'enum') {
    return unknownKeys(type, ['kind', 'values'], path)
      ?? (Array.isArray(type.values) && type.values.length > 0 && type.values.every(value => typeof value === 'string' && value !== '') ? undefined : `${path}.values must be a list of words`)
  }
  return `${path}.kind must be boolean, number or enum`
}

/** A value of the signal's type, at a time (`since` for a measured one, `at` for a person's). */
function valueProblem(type: SignalType, value: unknown, path: string, timeKey: 'since' | 'at', allowed: readonly string[]): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  return unknownKeys(value, allowed, path)
    ?? (matchesType(type, value.value) ? undefined : `${path}.value must fit the type of the signal`)
    ?? (isTime(value[timeKey]) ? undefined : `${path}.${timeKey} must be an ISO time`)
    ?? timeField(value, 'expiresAt', path)
    ?? textField(value, 'relay', path)
}

/**
 * A signal as stored. A measured value (`detected`) is the runtime's: it is in the state and not in the rules file
 * (`allowDetected`).
 */
export function signalProblem(value: unknown, path: string, allowDetected: boolean): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const extra = unknownKeys(value, allowDetected ? ['type', 'description', 'detector', 'detected', 'manual'] : ['type', 'description', 'detector', 'manual'], path)
  if (extra !== undefined) return extra
  const typeProblem = signalTypeProblem(value.type, `${path}.type`)
  if (typeProblem !== undefined) return typeProblem
  const type = value.type as SignalType
  return textField(value, 'description', path)
    ?? textField(value, 'detector', path)
    ?? (value.detected === undefined ? undefined : valueProblem(type, value.detected, `${path}.detected`, 'since', ['value', 'since']))
    ?? (value.manual === undefined ? undefined : valueProblem(type, value.manual, `${path}.manual`, 'at', ['value', 'at', 'expiresAt', 'relay']))
}

/** The reference to a script (file, hash, language), with the time a person approved it when `approval` is allowed. */
export function scriptPinProblem(value: unknown, path: string, approval: boolean): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  return unknownKeys(value, approval ? ['file', 'sha256', 'lang', 'approvedAt'] : ['file', 'sha256', 'lang'], path)
    ?? requiredText(value, 'file', path)
    ?? (typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256) ? undefined : `${path}.sha256 must be 64 hex digits`)
    ?? oneOf(value, 'lang', ['pwsh', 'node', 'python', 'bash'], path)
    ?? (approval && value.approvedAt !== undefined && !isTime(value.approvedAt) ? `${path}.approvedAt must be an ISO time` : undefined)
}

/** Who set an entry and when: written by the engine, never by the request. */
export function originProblem(value: unknown, path: string): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const by = value.proposedBy
  return unknownKeys(value, ['actor', 'at', 'relay', 'proposedBy', 'question'], path)
    ?? oneOf(value, 'actor', ['human', 'llm'], path)
    ?? (isTime(value.at) ? undefined : `${path}.at must be an ISO time`)
    ?? textField(value, 'relay', path)
    ?? textField(value, 'question', path)
    ?? (by === undefined || (isRecord(by) && typeof by.sessionId === 'string' && typeof by.agentId === 'string' && Object.keys(by).length === 2) ? undefined : `${path}.proposedBy must be {sessionId, agentId}`)
}

const DETECTOR_ID = /^d-[a-z0-9][a-z0-9-]{0,45}$/

function detectorWhenProblem(when: unknown, path: string): Problem {
  if (!isRecord(when)) return `${path} must be an object`
  if (when.kind === 'every') {
    return unknownKeys(when, ['kind', 'seconds'], path)
      ?? (typeof when.seconds === 'number' && Number.isInteger(when.seconds) && when.seconds >= 60 ? undefined : `${path}.seconds must be a whole number of at least 60`)
  }
  if (when.kind === 'daily' || when.kind === 'weekly') {
    const weekdays = when.weekdays
    return unknownKeys(when, when.kind === 'daily' ? ['kind', 'time', 'timeZone'] : ['kind', 'time', 'weekdays', 'timeZone'], path)
      ?? (typeof when.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(when.time) ? undefined : `${path}.time must be HH:MM`)
      ?? textField(when, 'timeZone', path)
      ?? (when.kind === 'daily' || (Array.isArray(weekdays) && weekdays.length > 0 && weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7)) ? undefined : `${path}.weekdays must be days 1 to 7`)
  }
  if (when.kind === 'event') {
    const params = when.params
    return unknownKeys(when, ['kind', 'events', 'params'], path)
      ?? (Array.isArray(when.events) && when.events.length === 1 && when.events[0] === 'loops.file-changed' ? undefined : `${path}.events must be [loops.file-changed]`)
      ?? (isRecord(params) && Object.keys(params).length === 1 && typeof params.path === 'string' && params.path !== '' ? undefined : `${path}.params must be {path}`)
  }
  return `${path}.kind must be every, daily, weekly or event`
}

/** A detector as stored (design §5.2): when it measures, the script that measures, the signal it writes. */
export function detectorProblem(key: string, value: unknown, path: string): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const action = value.action
  const actionPath = `${path}.action`
  return unknownKeys(value, ['id', 'title', 'when', 'action', 'origin', 'status'], path)
    ?? (value.id === key && DETECTOR_ID.test(key) ? undefined : `${path}.id must be the key and look like d-<name>`)
    ?? requiredText(value, 'title', path)
    ?? detectorWhenProblem(value.when, `${path}.when`)
    ?? (!isRecord(action) || action.kind !== 'measure'
      ? `${actionPath} must be a measure action`
      : unknownKeys(action, ['kind', 'script', 'signal', 'ttlMs', 'timeoutSeconds'], actionPath)
        ?? scriptPinProblem(action.script, `${actionPath}.script`, false)
        ?? requiredText(action, 'signal', actionPath)
        ?? (typeof action.ttlMs === 'number' && Number.isInteger(action.ttlMs) && action.ttlMs > 0 ? undefined : `${actionPath}.ttlMs must be a positive whole number`)
        ?? (action.timeoutSeconds === undefined || isCount(action.timeoutSeconds) ? undefined : `${actionPath}.timeoutSeconds must be a count`))
    ?? originProblem(value.origin, `${path}.origin`)
    ?? oneOf(value, 'status', ['active', 'removed'], path)
}

const TICKET_STATES = ['deferred', 'cleared', 'done', 'cancelled', 'expired'] as const
const TICKET_FIELDS = ['id', 'state', 'rules', 'sessionId', 'agentLabel', 'host', 'signature', 'tool', 'summary', 'since', 'letOnceUntil', 'clearedAt', 'closedAt', 'expiredWhy', 'nested', 'scriptRules', 'pausedGoal', 'pauseFailed', 'resumedAt', 'handedFrom']

/** A waiting ticket as stored (design §6.3, §7.2). */
export function ticketProblem(key: string, value: unknown, path: string): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const host = value.host
  const goal = value.pausedGoal
  const from = value.handedFrom
  return unknownKeys(value, TICKET_FIELDS, path)
    ?? (value.id === key && /^q-\d+$/.test(key) ? undefined : `${path}.id must be the key and look like q-<number>`)
    ?? oneOf(value, 'state', TICKET_STATES, path)
    ?? (stringList(value.rules) ? undefined : `${path}.rules must be a list of rule ids`)
    ?? requiredText(value, 'sessionId', path)
    ?? requiredText(value, 'agentLabel', path)
    ?? (isRecord(host) && isCount(host.pid) && isCount(host.startedAt) && Object.keys(host).length === 2 ? undefined : `${path}.host must be {pid, startedAt}`)
    ?? requiredText(value, 'signature', path)
    ?? requiredText(value, 'tool', path)
    ?? textField(value, 'summary', path)
    ?? (isTime(value.since) ? undefined : `${path}.since must be an ISO time`)
    ?? timeField(value, 'letOnceUntil', path)
    ?? timeField(value, 'clearedAt', path)
    ?? timeField(value, 'closedAt', path)
    ?? (value.expiredWhy === undefined ? undefined : oneOf(value, 'expiredWhy', ['age', 'not-retried', 'host-gone'], path))
    ?? (value.nested === undefined || value.nested === true ? undefined : `${path}.nested must be true`)
    ?? (value.scriptRules === undefined || stringList(value.scriptRules) ? undefined : `${path}.scriptRules must be a list of rule ids`)
    ?? (goal === undefined || (isRecord(goal) && typeof goal.id === 'string' && isCount(goal.revision) && Object.keys(goal).length === 2) ? undefined : `${path}.pausedGoal must be {id, revision}`)
    ?? textField(value, 'pauseFailed', path)
    ?? timeField(value, 'resumedAt', path)
    ?? (from === undefined || (isRecord(from) && unknownKeys(from, ['sessionId', 'agentLabel', 'focus', 'at'], `${path}.handedFrom`) === undefined && typeof from.sessionId === 'string' && typeof from.agentLabel === 'string' && textField(from, 'focus', path) === undefined && isTime(from.at)) ? undefined : `${path}.handedFrom must be {sessionId, agentLabel, at}`)
}

/** What the main agent has still to be told and was not on this host (design §6.7). */
export function noticeProblem(value: unknown, path: string): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  return unknownKeys(value, ['kind', 'rule', 'text', 'at'], path)
    ?? oneOf(value, 'kind', ['late-block', 'script-capped'], path)
    ?? requiredText(value, 'rule', path)
    ?? requiredText(value, 'text', path)
    ?? (isTime(value.at) ? undefined : `${path}.at must be an ISO time`)
}

const PROPOSAL_KINDS: readonly string[] = ['rule', 'lift', 'switch', 'peak-mode', 'remove', 'repin']
const PROPOSAL_STATUSES: readonly string[] = ['open', 'accepted', 'rejected', 'superseded', 'expired']
const PROPOSAL_FIELDS = ['id', 'kind', 'body', 'script', 'describe', 'cautions', 'reason', 'via', 'shownAt', 'replaces', 'question', 'proposedBy', 'at', 'status', 'decidedBy']

/** The script a proposal carries, as stored: the text the human read, its hash and where it is to be written. */
function proposalScriptProblem(script: unknown, path: string): Problem {
  if (script === undefined) return undefined
  if (!isRecord(script)) return `${path} must be an object`
  return unknownKeys(script, ['text', 'sha256', 'file', 'lang', 'timeoutSeconds', 'onError'], path)
    ?? requiredText(script, 'text', path)
    ?? scriptPinProblem({ file: script.file, sha256: script.sha256, lang: script.lang }, path, false)
    ?? (script.timeoutSeconds === undefined || isCount(script.timeoutSeconds) ? undefined : `${path}.timeoutSeconds must be a count`)
    ?? (script.onError === undefined ? undefined : oneOf(script, 'onError', ['allow', 'block'], path))
}

/** Who decided a proposal, and when. */
function decidedByProblem(decided: unknown, path: string): Problem {
  if (decided === undefined) return undefined
  if (!isRecord(decided)) return `${path} must be an object`
  return unknownKeys(decided, ['actor', 'relay', 'at'], path)
    ?? oneOf(decided, 'actor', ['human', 'llm', 'harness'], path)
    ?? textField(decided, 'relay', path)
    ?? (isTime(decided.at) ? undefined : `${path}.at must be an ISO time`)
}

/** A proposal as stored (design §7.2, §9.3): what an agent proposed, which is not decided until it is `accepted`. */
export function proposalProblem(key: string, value: unknown, path: string): Problem {
  if (!isRecord(value)) return `${path} must be an object`
  const by = value.proposedBy
  return unknownKeys(value, PROPOSAL_FIELDS, path)
    ?? (value.id === key && /^p-[0-9a-f]{8}$/.test(key) ? undefined : `${path}.id must be the key and look like p-<8 hex digits>`)
    ?? oneOf(value, 'kind', PROPOSAL_KINDS, path)
    ?? (typeof value.body === 'object' && value.body !== null ? undefined : `${path}.body must be an object or a list`)
    ?? proposalScriptProblem(value.script, `${path}.script`)
    ?? requiredText(value, 'describe', path)
    ?? (stringList(value.cautions) ? undefined : `${path}.cautions must be a list of sentences`)
    ?? requiredText(value, 'reason', path)
    ?? oneOf(value, 'via', ['graph', 'board'], path)
    ?? timeField(value, 'shownAt', path)
    ?? textField(value, 'replaces', path)
    ?? textField(value, 'question', path)
    ?? (isRecord(by) && typeof by.sessionId === 'string' && typeof by.agentId === 'string' && Object.keys(by).length === 2 ? undefined : `${path}.proposedBy must be {sessionId, agentId}`)
    ?? (isTime(value.at) ? undefined : `${path}.at must be an ISO time`)
    ?? oneOf(value, 'status', PROPOSAL_STATUSES, path)
    ?? decidedByProblem(value.decidedBy, `${path}.decidedBy`)
}
