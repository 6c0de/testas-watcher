const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readState, writeState, defaultState } = require('../lib/state');

test('readState returns defaultState when the file does not exist', () => {
  const missingPath = path.join(os.tmpdir(), `state-${Date.now()}-missing.json`);
  const result = readState(missingPath);
  assert.deepEqual(result, defaultState());
});

test('writeState then readState round-trips the same data', () => {
  const tmpPath = path.join(os.tmpdir(), `state-${Date.now()}-roundtrip.json`);
  const data = {
    'Goethe-Institut Istanbul': 'open',
    'ALKEV Privatschule Istanbul': 'closed',
  };
  writeState(tmpPath, data);
  const result = readState(tmpPath);
  assert.deepEqual(result, data);
  fs.unlinkSync(tmpPath);
});
