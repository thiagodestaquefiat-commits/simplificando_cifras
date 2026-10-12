const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const css = fs.readFileSync(path.resolve(__dirname, "..", "js", "event-chat-song.css"), "utf8");
const chat = fs.readFileSync(path.resolve(__dirname, "..", "js", "event-chat.js"), "utf8");

assert.match(html, /Enviar no chat do evento/);
assert.match(html, /openSongShareChoices/);
assert.match(html, /Compartilhar em outros apps/);
assert.match(html, /renderEventChatSong\(bubble,message\)/);
assert.match(html, /Adicionar a evento/);
assert.match(html, /eventChatSongInLibrary/);
assert.match(html, /youtubePlayer\.play\(\)/);
assert.match(css, /\.event-chat-song-action\.is-playing/);
assert.match(css, /@keyframes event-chat-song-eq/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(chat, /function sendSong/);

console.log("event-chat-song-ui.test.js: OK");
