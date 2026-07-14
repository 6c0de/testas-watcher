const path = require('path');

module.exports = {
  SEARCH_URL: 'https://www.gast.de/portal/center-search/center-search/testas/worldwide',
  TARGET_DATE: '24.10.2026',
  TARGET_SCHOOLS: ['Goethe-Institut Istanbul', 'ALKEV Privatschule Istanbul'],
  STATE_PATH: path.join(__dirname, '..', 'state.json'),
};
