const assert = require('node:assert/strict');

global.window = {};
require('../js/spotify-ui.js');

const message = window.spotifyUI.friendlyRequestError;
assert.match(message({ status: 401 }), /sessão.*expirou/i);
assert.match(message({ status: 403 }), /mesma conta proprietária/i);
assert.match(message({ status: 429, reason: 'QUOTA_EXCEEDED' }), /cota de desenvolvimento/i);
assert.match(message({ status: 429 }), /limite temporário/i);
assert.equal(message({ status: 500, message: 'Falha detalhada' }), 'Falha detalhada');

console.log('spotify-ui-error.test.js: OK');
