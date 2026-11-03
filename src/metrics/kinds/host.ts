/**
 * The field tables of the metrics design's own kinds (§4.2 first table) —
 * the kinds the metrics row observes itself, plus `rule`, `followup`,
 * `request`, `lift` and `count`, which the guard framework hands in, and
 * `graph`/`graph-fail`, which the graph engine's observer hands in. The
 * compile-time check at the bottom pins the tables to src/shared/metrics.ts.
 */
import type { HostBodies } from '../../shared/metrics.ts'
import type { BodiesOf, Equal, Expect, KindTable } from '../schema.ts'

const TABLES = [
  { name: 'start', fields: [
    { name: 'host', type: ['desktop', 'headless', 'cli'] },
    { name: 'pid', type: 'int' },
    { name: 'node', type: 'id' },
    { name: 'electron', type: 'id', optional: true },
  ] },
  { name: 'stop', fields: [
    { name: 'written', type: 'int' },
    { name: 'dropped', type: 'int' },
    { name: 'rejected', type: 'int' },
  ] },
  { name: 'gap', fields: [
    { name: 'lost', type: 'int' },
    { name: 'from', type: 'int' },
    { name: 'to', type: 'int' },
    { name: 'lastH', type: 'id' },
  ] },
  { name: 'reject', fields: [
    { name: 'of', type: 'id' },
    { name: 'field', type: 'id' },
  ] },
  { name: 'prune', fields: [
    { name: 'before', type: 'id' },
    { name: 'files', type: 'int' },
    { name: 'lines', type: 'int' },
  ] },
  { name: 'session', fields: [
    { name: 'parent', type: 'id', optional: true },
    { name: 'origin', type: ['subagent'], optional: true },
    { name: 'depth', type: 'int', optional: true },
  ] },
  { name: 'turn', fields: [
    { name: 'turn', type: 'int' },
    { name: 'phase', type: ['start', 'end'] },
    { name: 'end', type: 'id', optional: true },
  ] },
  { name: 'llm', fields: [
    { name: 'turn', type: 'int', optional: true },
    { name: 'step', type: 'int', optional: true },
    { name: 'provider', type: 'id' },
    { name: 'model', type: 'id' },
    { name: 'purpose', type: 'id', optional: true },
    { name: 'input', type: 'int', optional: true },
    { name: 'output', type: 'int', optional: true },
    { name: 'cacheRead', type: 'int', optional: true },
    { name: 'cacheWrite', type: 'int', optional: true },
    { name: 'reasoning', type: 'int', optional: true },
    { name: 'total', type: 'int', optional: true },
    { name: 'ms', type: 'int' },
    { name: 'ttft', type: 'int', optional: true },
    { name: 'fin', type: ['stop', 'tool-calls', 'max-tokens', 'aborted', 'error', 'none', 'other'] },
    { name: 'calls', type: 'int' },
    { name: 'text', type: 'int' },
    { name: 'retries', type: 'int', optional: true },
    { name: 'credits', type: 'num', optional: true },
    { name: 'peak', type: 'bool', optional: true },
  ] },
  { name: 'tool', fields: [
    { name: 'turn', type: 'int' },
    { name: 'step', type: 'int' },
    { name: 'call', type: 'id' },
    { name: 'name', type: 'id' },
    { name: 'cat', type: ['read', 'write', 'search', 'shell', 'graph', 'dispatch', 'memory', 'web', 'todo', 'question', 'mcp', 'other'] },
    { name: 'out', type: ['ok', 'error', 'denied', 'declined', 'none'] },
    { name: 'ms', type: 'int', optional: true },
    { name: 'chars', type: 'int', optional: true },
    { name: 'target', type: 'id', optional: true },
    { name: 'cmd', type: 'id', optional: true },
  ] },
  { name: 'rule', fields: [
    { name: 'call', type: 'id', optional: true },
    { name: 'rule', type: 'id' },
    { name: 'effect', type: ['deny', 'late'] },
    { name: 'ref', type: 'id', optional: true },
  ] },
  { name: 'followup', fields: [
    { name: 'rule', type: 'id' },
    { name: 'denial', type: 'id' },
    { name: 'outcome', type: ['right-path', 'repeat', 'other', 'none'] },
  ] },
  { name: 'request', fields: [
    { name: 'rule', type: 'id' },
    { name: 'ref', type: 'id' },
    { name: 'step', type: 'id' },
  ] },
  { name: 'lift', fields: [
    { name: 'rule', type: 'id' },
    { name: 'action', type: ['lift', 'restore'] },
    { name: 'via', type: 'id' },
    { name: 'units', type: 'int' },
    { name: 'ref', type: 'id', optional: true },
  ] },
  { name: 'approval', fields: [
    { name: 'id', type: 'id' },
    { name: 'phase', type: ['asked', 'decided'] },
    { name: 'tool', type: 'id', optional: true },
    { name: 'call', type: 'id', optional: true },
    { name: 'outcome', type: ['allowed-once', 'rejected', 'cancelled', 'unavailable'], optional: true },
  ] },
  { name: 'command', fields: [
    { name: 'cid', type: 'id' },
    { name: 'name', type: 'id' },
    { name: 'phase', type: ['run', 'done'] },
    { name: 'result', type: ['success', 'error'], optional: true },
  ] },
  { name: 'ask', fields: [
    { name: 'q', type: 'id' },
    { name: 'qs', type: 'int' },
    { name: 'opts', type: 'int' },
    { name: 'units', type: 'int' },
    { name: 'ref', type: 'id', optional: true },
  ] },
  { name: 'answer', fields: [
    { name: 'q', type: 'id' },
    { name: 'ms', type: 'int' },
    { name: 'end', type: ['answered', 'aborted', 'no-provider', 'timed-out', 'error'] },
    { name: 'pick', type: 'id', optional: true },
  ] },
  { name: 'said', fields: [
    { name: 'units', type: 'int' },
    { name: 'attachments', type: 'int' },
    { name: 'source', type: 'id' },
  ] },
  { name: 'graph', fields: [
    { name: 'node', type: 'id' },
    { name: 'type', type: 'id' },
    { name: 'op', type: 'id' },
    { name: 'hi', type: 'int' },
    { name: 'actor', type: ['human', 'llm', 'harness'] },
    { name: 'rev', type: 'int', optional: true },
    { name: 'relay', type: 'bool', optional: true },
    { name: 'from', type: 'id', optional: true },
    { name: 'to', type: 'id', optional: true },
    { name: 'src', type: 'id', optional: true },
  ] },
  { name: 'graph-fail', fields: [
    { name: 'actor', type: ['human', 'llm', 'harness'] },
    { name: 'err', type: 'id' },
    { name: 'op', type: 'id', optional: true },
    { name: 'node', type: 'id', optional: true },
    { name: 'field', type: 'id', optional: true },
  ] },
  { name: 'report', fields: [
    { name: 'kind', type: ['status'] },
    { name: 'units', type: 'int' },
    { name: 'ms', type: 'int' },
  ] },
  { name: 'count', fields: [
    { name: 'what', type: 'id' },
    { name: 'value', type: 'int' },
    { name: 'byKey', type: 'map', optional: true },
  ] },
] as const satisfies readonly KindTable[]

type Tables = typeof TABLES
const tablesMatchHostBodies: Expect<Equal<BodiesOf<Tables>, HostBodies>> = true
void tablesMatchHostBodies

export const HOST_KINDS: readonly KindTable[] = TABLES
