import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, parseLine } from '../src/csv.js'

test('splits plain fields', () => {
  assert.deepEqual(parseLine('a,b,c'), ['a', 'b', 'c'])
})

test('keeps empty fields, including a trailing one', () => {
  assert.deepEqual(parseLine('a,,b,'), ['a', '', 'b', ''])
})

test('quoted fields may contain the delimiter', () => {
  assert.deepEqual(parseLine('"a,b",c'), ['a,b', 'c'])
})

test('supports another delimiter', () => {
  assert.deepEqual(parseLine('a;b;"c;d"', { delimiter: ';' }), ['a', 'b', 'c;d'])
})

test('parses lines with either line end', () => {
  assert.deepEqual(parse('a,b\r\nc,d\n'), [['a', 'b'], ['c', 'd']])
})
