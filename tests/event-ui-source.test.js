const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
assert.match(html, />🎵 Playlist</);
assert.match(html, />📅 Eventos</);
assert.match(html, /event-model\.js/);
assert.match(html, /event-repository\.js/);
assert.match(html, /event-chat\.js/);
assert.match(html, /id="event-chat-view"/);
assert.match(html, /Edição pessoal|edição pessoal|A edição pessoal/);
assert.match(html, /Compartilhado/);
assert.match(html, /createPoll/);
assert.match(html, /eventRepository\.load/);
console.log("event-ui-source.test.js: OK");
