const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "js/sync-realtime.js"), "utf8");
const channels = [];
const removed = [];
const documentListeners = {};
let authListener;

function channel(topic) {
  const value = {
    topic,
    handler: null,
    sends: [],
    on(_type, _filter, handler) { this.handler = handler; return this; },
    subscribe(handler) { this.statusHandler = handler; handler("SUBSCRIBED"); return this; },
    async send(payload) { this.sends.push(payload); return "ok"; }
  };
  channels.push(value);
  return value;
}

const window = {
  crypto: { randomUUID: () => "device-a" },
  document: {
    visibilityState: "visible",
    addEventListener(name, handler) { documentListeners[name] = handler; }
  },
  appAuth: {
    subscribe(handler) { authListener = handler; handler({ authenticated: false, user: null }); },
    createRealtimeChannel: (topic) => channel(topic),
    removeRealtimeChannel(value) { removed.push(value.topic); return Promise.resolve("ok"); }
  },
  setTimeout,
  clearTimeout,
  addEventListener() {}
};

const context = vm.createContext({ window, Promise, Date, Math, Set, Map });
vm.runInContext(source, context, { filename: "sync-realtime.js" });

(async () => {
  let libraryPulls = 0;
  const eventPulls = [];
  const chatPulls = [];
  window.syncRealtime.initialize({
    library: () => { libraryPulls += 1; },
    event: (eventId) => { eventPulls.push(eventId); },
    chat: (eventId) => { chatPulls.push(eventId); }
  });
  authListener({ authenticated: true, user: { id: "user-1" } });
  window.syncRealtime.setEventIds(["event-1", "event-2"]);

  assert.deepEqual(channels.map((item) => item.topic), [
    "roudy-sync-v1:user:user-1",
    "roudy-sync-v1:event:event-1",
    "roudy-sync-v1:event:event-2"
  ]);

  const userChannel = channels[0];
  const eventChannel = channels[1];
  userChannel.handler({ payload: { source: "device-b" } });
  userChannel.handler({ payload: { source: "device-b" } });
  eventChannel.handler({ payload: { source: "device-b" } });
  await new Promise((resolve) => setTimeout(resolve, 240));
  assert.equal(libraryPulls, 1, "avisos consecutivos da biblioteca devem ser agrupados");
  assert.deepEqual(eventPulls, ["event-1"]);

  userChannel.handler({ payload: { source: "device-a" } });
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(libraryPulls, 1, "o aparelho não deve reagir ao próprio aviso");

  assert.equal(await window.syncRealtime.publishLibrary(), true);
  assert.equal(userChannel.sends.length, 1);
  assert.equal(userChannel.sends[0].payload.source, "device-a");
  assert.equal(userChannel.sends[0].payload.kind, "library");

  assert.equal(await window.syncRealtime.publishPersonalEvent("event-2"), true);
  assert.equal(userChannel.sends[1].payload.kind, "event");
  assert.equal(userChannel.sends[1].payload.eventId, "event-2");

  assert.equal(await window.syncRealtime.publishChat("event-1"), true);
  assert.equal(eventChannel.sends.at(-1).payload.kind, "chat");
  eventChannel.handler({ payload: { source: "device-b", kind: "chat" } });
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.deepEqual(chatPulls, ["event-1"]);

  window.syncRealtime.setEventIds(["event-2"]);
  assert.ok(removed.includes("roudy-sync-v1:event:event-1"), "canais de eventos antigos devem ser fechados");

  window.document.visibilityState = "hidden";
  documentListeners.visibilitychange();
  assert.ok(removed.includes("roudy-sync-v1:user:user-1"), "os canais devem fechar com o app em segundo plano");

  console.log("sync-realtime.test.js: OK (conta, eventos, debounce, eco e ciclo de vida)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
