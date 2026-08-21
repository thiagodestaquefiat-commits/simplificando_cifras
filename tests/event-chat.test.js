const assert = require("node:assert/strict");

const values = new Map();
let user = { id: "u1", name: "João" };
const event = { id: "e1", title: "Culto", members: [{ id: "u1", name: "João", role: "Guitarra" }, { id: "u2", name: "Maria", role: "Vocal" }], musicas: [] };
global.window = {
  storage: {
    get(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : fallback; },
    set(key, value) { values.set(key, structuredClone(value)); return true; }
  },
  addEventListener() {}
};
require("../js/event-model.js");
require("../js/event-chat.js");
window.eventChat.initialize({ getEvent: () => event, getCurrentUser: () => user });

const first = window.eventChat.sendText("e1", "Olá, equipe!");
assert.equal(window.eventChat.list("e1", 40).length, 1);
window.eventChat.react("e1", first.id, "👍");
assert.deepEqual(window.eventChat.list("e1", 40)[0].reactions["👍"], ["u1"]);

const poll = window.eventChat.createPoll("e1", { question: "Qual tom?", options: ["C", "D"], multiple: false, showVoters: true });
window.eventChat.vote("e1", poll.id, poll.poll.options[0].id);
assert.deepEqual(window.eventChat.list("e1", 40)[1].poll.votes[poll.poll.options[0].id], ["u1"]);

user = { id: "u2", name: "Maria" };
window.eventChat.sendText("e1", "Confirmado", first.id);
user = { id: "u1", name: "João" };
assert.equal(window.eventChat.unreadCount("e1"), 1);
window.eventChat.markRead("e1");
assert.equal(window.eventChat.unreadCount("e1"), 0);

console.log("event-chat.test.js: OK");
