(function (global) {
  "use strict";

  const PREFIX = "roudy-sync-v1";
  const instanceId = global.crypto && global.crypto.randomUUID
    ? global.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const channels = new Map();
  const eventIds = new Set();
  const timers = new Map();
  let initialized = false;
  let authenticatedUserId = null;
  let handlers = { library: null, event: null, chat: null };

  function visible() {
    return !global.document || global.document.visibilityState !== "hidden";
  }

  function topic(kind, id) {
    return `${PREFIX}:${kind}:${String(id || "").replace(/[^A-Za-z0-9_-]/g, "_")}`;
  }

  function debounce(key, callback) {
    global.clearTimeout(timers.get(key));
    timers.set(key, global.setTimeout(() => {
      timers.delete(key);
      try {
        const result = callback();
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch (_error) {}
    }, 180));
  }

  function receive(kind, id, message) {
    const payload = message && message.payload || {};
    if (payload.source === instanceId) return;
    if (kind === "user" && payload.kind === "event" && payload.eventId && typeof handlers.event === "function") {
      debounce(`event:${payload.eventId}`, () => handlers.event(String(payload.eventId)));
    } else if (kind === "user" && typeof handlers.library === "function") debounce("library", handlers.library);
    if (kind === "event" && payload.kind === "chat" && typeof handlers.chat === "function") {
      debounce(`chat:${id}`, () => handlers.chat(id));
    } else if (kind === "event" && typeof handlers.event === "function") debounce(`event:${id}`, () => handlers.event(id));
  }

  function removeEntry(key) {
    const entry = channels.get(key);
    if (!entry) return;
    channels.delete(key);
    try { global.appAuth.removeRealtimeChannel(entry.channel); } catch (_error) {}
  }

  function ensure(kind, id) {
    if (!authenticatedUserId || !visible() || !global.appAuth || !global.appAuth.createRealtimeChannel) return null;
    const key = `${kind}:${id}`;
    if (channels.has(key)) return channels.get(key);
    let readyResolve;
    const ready = new Promise((resolve) => { readyResolve = resolve; });
    const channel = global.appAuth.createRealtimeChannel(topic(kind, id), { config: { broadcast: { self: false, ack: true } } });
    const entry = { channel, ready, readyResolve, subscribed: false };
    channels.set(key, entry);
    channel.on("broadcast", { event: "invalidate" }, (message) => receive(kind, id, message));
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && !entry.subscribed) {
        entry.subscribed = true;
        entry.readyResolve(true);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") entry.readyResolve(false);
    });
    global.setTimeout(() => entry.readyResolve(false), 3500);
    return entry;
  }

  function connect() {
    if (!authenticatedUserId || !visible()) return;
    ensure("user", authenticatedUserId);
    eventIds.forEach((eventId) => ensure("event", eventId));
  }

  function disconnect() {
    Array.from(channels.keys()).forEach(removeEntry);
  }

  async function publish(kind, id, details) {
    const entry = ensure(kind, id);
    if (!entry) return false;
    const subscribed = entry.subscribed || await entry.ready;
    if (!subscribed) return false;
    try {
      const response = await entry.channel.send({
        type: "broadcast",
        event: "invalidate",
        payload: { source: instanceId, at: new Date().toISOString(), ...(details || {}) }
      });
      return response === "ok" || response && response.status === "ok";
    } catch (_error) { return false; }
  }

  function publishLibrary() {
    return authenticatedUserId ? publish("user", authenticatedUserId, { kind: "library" }) : Promise.resolve(false);
  }

  function publishEvent(eventId) {
    const id = String(eventId || "").trim();
    return id ? publish("event", id, { kind: "event" }) : Promise.resolve(false);
  }

  function publishChat(eventId) {
    const id = String(eventId || "").trim();
    return id ? publish("event", id, { kind: "chat" }) : Promise.resolve(false);
  }

  function publishPersonalEvent(eventId) {
    const id = String(eventId || "").trim();
    return authenticatedUserId && id
      ? publish("user", authenticatedUserId, { kind: "event", eventId: id })
      : Promise.resolve(false);
  }

  function setEventIds(values) {
    const next = new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean));
    eventIds.clear();
    next.forEach((value) => eventIds.add(value));
    Array.from(channels.keys()).forEach((key) => {
      if (key.startsWith("event:") && !eventIds.has(key.slice(6))) removeEntry(key);
    });
    connect();
  }

  function initialize(options) {
    handlers = { ...handlers, ...(options || {}) };
    if (initialized) return;
    initialized = true;
    global.appAuth.subscribe((state) => {
      const nextUserId = state && state.authenticated && state.user ? String(state.user.id) : null;
      if (nextUserId !== authenticatedUserId) disconnect();
      authenticatedUserId = nextUserId;
      connect();
    });
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener("visibilitychange", () => visible() ? connect() : disconnect());
    }
    global.addEventListener && global.addEventListener("online", connect);
  }

  global.syncRealtime = Object.freeze({ initialize, setEventIds, publishLibrary, publishEvent, publishChat, publishPersonalEvent });
})(window);
