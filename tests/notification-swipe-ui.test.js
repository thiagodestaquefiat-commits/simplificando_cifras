const fs = require('fs');
const assert = require('assert');

const css = fs.readFileSync('js/event-detail-refactor.css', 'utf8');

assert.match(
  css,
  /\.notification-swipe\{[^}]*background:#080d12[^}]*\}/,
  'the swipe container must keep the notification surface color instead of painting the full row red'
);
assert.match(
  css,
  /\.notification-swipe-delete\{[^}]*right:0[^}]*width:92px[^}]*background:#e53e3e[^}]*\}/,
  'red must remain restricted to the delete action revealed on the right'
);
assert.match(
  css,
  /\.notification-swipe \.notification-row:active\{opacity:1\}/,
  'the foreground notification must stay opaque while swiping'
);

console.log('notification swipe UI checks passed');
