const test = require('node:test');
const assert = require('node:assert/strict');
const { transitionsToOpen } = require('../lib/diff');

test('detects a closed-to-open transition', () => {
  const previous = { 'Goethe-Institut Istanbul': 'closed' };
  const current = { 'Goethe-Institut Istanbul': 'open' };
  assert.deepEqual(transitionsToOpen(previous, current), ['Goethe-Institut Istanbul']);
});

test('does not re-report a school that was already open', () => {
  const previous = { 'Goethe-Institut Istanbul': 'open' };
  const current = { 'Goethe-Institut Istanbul': 'open' };
  assert.deepEqual(transitionsToOpen(previous, current), []);
});

test('does not report a school that stays closed', () => {
  const previous = { 'ALKEV Privatschule Istanbul': 'closed' };
  const current = { 'ALKEV Privatschule Istanbul': 'closed' };
  assert.deepEqual(transitionsToOpen(previous, current), []);
});

test('treats a school missing from previous state as having been closed', () => {
  const previous = {};
  const current = { 'ALKEV Privatschule Istanbul': 'open' };
  assert.deepEqual(transitionsToOpen(previous, current), ['ALKEV Privatschule Istanbul']);
});
