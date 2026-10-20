const assert=require('assert');
const {extractIdentity}=require('../js/event-qr-scanner.js');
assert.equal(extractIdentity('roudy://profile/user-42'),'user-42');
assert.equal(extractIdentity('https://roudy.app/profile/user-42'),'user-42');
assert.equal(extractIdentity('https://roudy.app/?userId=user-42'),'user-42');
assert.equal(extractIdentity('@mateus.v'),'@mateus.v');
assert.equal(extractIdentity('not a qr profile'),'');
console.log('event-qr-scanner.test.js: OK');
