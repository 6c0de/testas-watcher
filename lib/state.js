const fs = require('fs');
const { TARGET_SCHOOLS } = require('./targets');

function defaultState() {
  const state = {};
  for (const school of TARGET_SCHOOLS) state[school] = 'closed';
  return state;
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) return defaultState();
  const raw = fs.readFileSync(statePath, 'utf8');
  return JSON.parse(raw);
}

function writeState(statePath, state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

module.exports = { readState, writeState, defaultState };
