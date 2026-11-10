/**
 * Acceptance for the graph-memory-reuse calibration task (the A3 adoption
 * check): the graph node carries one llm comment and the project memory
 * journal holds the round-tripped memory. One-off check of a temporary task;
 * not part of the shipped task set.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkerArgs } from '../lib.mjs'

const { workspace: ws, home } = checkerArgs()
const checks = []
const check = (name, ok, detail) => checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) })

// 1. The graph comment: the node file's history carries an llm comment.
const nodePath = join(ws, 'docs', 'graph', 'nodes', 'reuse-check.json')
try {
  const node = JSON.parse(readFileSync(nodePath, 'utf8'))
  const comments = (node.history ?? []).filter(entry => entry.actor === 'llm' && entry.op === 'comment')
  check('graph-comment', comments.length >= 1, comments.length === 0 ? 'no llm comment in the node history' : `${comments.length} comment(s)`)
}
catch (error) {
  check('graph-comment', false, String(error).slice(0, 120))
}

// 2. The memory round trip: the journal holds the memory. The batch's data
// redirect (scripts/sandbox.mjs dataRows) keeps the row's project journal in
// the run's home; without the redirect it is the project's own .llm.
const journal = home === undefined ? join(ws, '.llm', 'memory.jsonl') : join(home, 'memory.jsonl')
try {
  const records = existsSync(journal)
    ? readFileSync(journal, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
    : []
  const stored = records.some(record => JSON.stringify(record).includes('"graph-comment-check"'))
  check('memory-stored', stored, stored ? 'the journal names graph-comment-check' : `${records.length} record(s) in ${journal}, none names graph-comment-check`)
}
catch (error) {
  check('memory-stored', false, String(error).slice(0, 120))
}

console.log(JSON.stringify({ pass: checks.every(entry => entry.ok), checks }))
