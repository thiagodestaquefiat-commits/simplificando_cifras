const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');

assert.match(html, /mainTitle\.textContent=tab==='setlists'\?'Eventos':'ROUDY'/);
assert.match(html, /event-month-heading/);
assert.match(html, /date\.weekday/);
assert.match(html, /class="setlist-item"/);
assert.match(html, /class="event-detail-back"/);
assert.doesNotMatch(html, /class="event-detail-back-label"/, 'o retorno do evento deve exibir somente o chevron');
assert.match(html, /function setupEventDetailHeaderMotion\(\)/);
assert.match(html, /view\.scrollTop\/78/);
assert.match(html, /--event-spotlight-opacity/);
assert.match(html, /event-more-button/);
assert.match(html, /event-meta-icon/);
assert.match(html, /--event-icon-scale/);
assert.match(html, /linear-gradient\(105deg,#f0f2f5/);
assert.match(html, /requestAnimationFrame\(renderHeader\)/);
assert.match(html, /prefers-reduced-motion:reduce/);
assert.match(sw, /v261-main-contextual-ux/);

console.log('events-library-header.test.js: OK');
