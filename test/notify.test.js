const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMessage } = require('../lib/notify');

test('formatMessage includes school, address and date', () => {
  const msg = formatMessage(
    'Goethe-Institut Istanbul',
    'Yeni Carsi Cd. No: 32 Beyoglu/Istanbul',
    '24.10.2026'
  );
  assert.match(msg, /Goethe-Institut Istanbul/);
  assert.match(msg, /Yeni Carsi Cd\. No: 32 Beyoglu\/Istanbul/);
  assert.match(msg, /24\.10\.2026/);
});
