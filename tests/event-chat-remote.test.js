const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "js/event-chat.js"), "utf8");
const remote = [];

function device(user) {
  const values = new Map();
  const event = { id: "event-1", members: [{ id: "user-a" }, { id: "user-b" }] };
  const window = {
    storage: {
      get(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : fallback; },
      set(key, value) { values.set(key, structuredClone(value)); return true; }
    },
    eventModel: { canAccess: (value, userId) => value.members.some((member) => member.id === userId) },
    apiConfig: { collaborationEndpoint: (suffix) => "https://api.test" + suffix },
    appAuth: { getAccessToken: () => "token" },
    syncRealtime: { publishChat() {} },
    addEventListener() {},
    async fetch(url, options) {
      if ((options && options.method) === "POST") {
        const body = JSON.parse(options.body);
        const message = { id: body.clientId, eventId: "event-1", type: body.type, content: body.content, replyTo: body.replyTo || null, poll: body.poll || null, reactions: {}, deleted: false, sender: { id: user.id, name: user.name, avatarUrl: null }, createdAt: new Date().toISOString(), editedAt: null };
        const existing = remote.find((item) => item.id === message.id);
        if (!existing) remote.push(message);
        return { ok: true, status: existing ? 200 : 201, json: async () => structuredClone(existing || message) };
      }
      return { ok: true, status: 200, json: async () => ({ messages: structuredClone(remote) }) };
    }
  };
  vm.runInContext(source, vm.createContext({ window, Promise, Date, Math, Set, Map, structuredClone, encodeURIComponent }), { filename: "event-chat.js" });
  window.eventChat.initialize({ getEvent: () => event, getCurrentUser: () => user });
  return window;
}

(async () => {
  const a = device({ id: "user-a", name: "Ana" });
  const b = device({ id: "user-b", name: "Beto" });
  a.eventChat.sendText("event-1", "Mensagem entre aparelhos");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(remote.length, 1);
  assert.equal(a.eventChat.list("event-1", 40)[0].pending, undefined, "a confirmação remove o estado pendente");
  await b.eventChat.refresh("event-1");
  assert.equal(b.eventChat.list("event-1", 40)[0].content, "Mensagem entre aparelhos");
  assert.equal(b.eventChat.unreadCount("event-1"), 1);
  console.log("event-chat-remote.test.js: OK (persistência, confirmação e segundo dispositivo)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
