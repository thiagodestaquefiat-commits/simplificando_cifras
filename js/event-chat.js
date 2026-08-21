(function (global) {
  "use strict";

  const MESSAGE_KEY = "sc_event_messages_v1";
  const READ_KEY = "sc_event_chat_read_v1";
  const listeners = new Set();
  let context = { getEvent: () => null, getCurrentUser: () => ({ id: "local-user", name: "Você" }) };
  let channel = null;

  function uid(prefix) { return prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }
  function allMessages() { return global.storage.get(MESSAGE_KEY, {}); }
  function saveMessages(value) { return global.storage.set(MESSAGE_KEY, value); }
  function currentUser() { return context.getCurrentUser(); }
  function eventFor(eventId) { return context.getEvent(eventId); }
  function assertAccess(eventId) {
    const event = eventFor(eventId);
    if (!event || !global.eventModel.canAccess(event, currentUser().id)) throw new Error("Você não participa deste evento.");
    return event;
  }
  function notify(eventId) {
    listeners.forEach((listener) => listener(eventId));
    if (channel) channel.postMessage({ type: "event-chat.updated", eventId });
  }
  function list(eventId, limit, before) {
    assertAccess(eventId);
    let values = allMessages()[String(eventId)] || [];
    if (before) values = values.filter((message) => message.createdAt < before);
    return values.slice(-(Number(limit) || 40));
  }
  function write(eventId, updater) {
    assertAccess(eventId);
    const all = allMessages();
    const key = String(eventId);
    all[key] = updater(Array.isArray(all[key]) ? all[key] : []);
    saveMessages(all);
    notify(eventId);
    return all[key];
  }
  function baseMessage(eventId, type) {
    const user = currentUser();
    return { id: uid("message"), eventId, type, sender: { id: user.id, name: user.name, avatarUrl: user.avatarUrl || null }, reactions: {}, createdAt: new Date().toISOString(), editedAt: null };
  }
  function sendText(eventId, content, replyTo) {
    const cleaned = String(content || "").trim();
    if (!cleaned) throw new Error("Digite uma mensagem.");
    const message = { ...baseMessage(eventId, "text"), content: cleaned, replyTo: replyTo || null };
    write(eventId, (values) => [...values, message]);
    return message;
  }
  function sendSystem(eventId, content) {
    const message = { ...baseMessage(eventId, "system"), content: String(content || "") };
    write(eventId, (values) => [...values, message]);
    return message;
  }
  function createPoll(eventId, poll) {
    const options = (poll.options || []).map((label) => String(label || "").trim()).filter(Boolean).map((label) => ({ id: uid("option"), label }));
    if (!String(poll.question || "").trim() || options.length < 2) throw new Error("Informe uma pergunta e pelo menos duas opções.");
    const message = { ...baseMessage(eventId, "poll"), poll: { question: String(poll.question).trim(), options, multiple: Boolean(poll.multiple), showVoters: poll.showVoters !== false, votes: {} } };
    write(eventId, (values) => [...values, message]);
    return message;
  }
  function updateOwn(eventId, messageId, updater) {
    const user = currentUser();
    write(eventId, (values) => values.map((message) => {
      if (String(message.id) !== String(messageId)) return message;
      if (String(message.sender.id) !== String(user.id)) throw new Error("Você só pode alterar suas mensagens.");
      return updater(message);
    }));
  }
  function edit(eventId, messageId, content) { updateOwn(eventId, messageId, (message) => ({ ...message, content: String(content || "").trim(), editedAt: new Date().toISOString() })); }
  function remove(eventId, messageId) { updateOwn(eventId, messageId, (message) => ({ ...message, deleted: true, content: "", editedAt: new Date().toISOString() })); }
  function react(eventId, messageId, emoji) {
    const user = currentUser();
    write(eventId, (values) => values.map((message) => {
      if (String(message.id) !== String(messageId)) return message;
      const reactions = { ...(message.reactions || {}) };
      const voters = new Set(reactions[emoji] || []);
      if (voters.has(user.id)) voters.delete(user.id); else voters.add(user.id);
      reactions[emoji] = [...voters];
      return { ...message, reactions };
    }));
  }
  function vote(eventId, messageId, optionId) {
    const user = currentUser();
    write(eventId, (values) => values.map((message) => {
      if (String(message.id) !== String(messageId) || message.type !== "poll") return message;
      const votes = { ...(message.poll.votes || {}) };
      if (!message.poll.multiple) Object.keys(votes).forEach((key) => { votes[key] = (votes[key] || []).filter((id) => id !== user.id); });
      const selected = new Set(votes[optionId] || []);
      if (selected.has(user.id)) selected.delete(user.id); else selected.add(user.id);
      votes[optionId] = [...selected];
      return { ...message, poll: { ...message.poll, votes } };
    }));
  }
  function markRead(eventId) {
    const read = global.storage.get(READ_KEY, {});
    read[String(eventId)] = new Date().toISOString();
    global.storage.set(READ_KEY, read);
  }
  function unreadCount(eventId) {
    const readAt = global.storage.get(READ_KEY, {})[String(eventId)] || "";
    const user = currentUser();
    return (allMessages()[String(eventId)] || []).filter((message) => message.createdAt > readAt && String(message.sender.id) !== String(user.id)).length;
  }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  function initialize(options) {
    context = { ...context, ...(options || {}) };
    if ("BroadcastChannel" in global && !channel) {
      channel = new BroadcastChannel("simplificando-cifras-events");
      channel.addEventListener("message", (event) => { if (event.data && event.data.eventId) listeners.forEach((listener) => listener(event.data.eventId)); });
    }
    global.addEventListener("storage", (event) => { if (event.key === MESSAGE_KEY) listeners.forEach((listener) => listener(null)); });
  }

  global.eventChat = Object.freeze({ initialize, list, sendText, sendSystem, createPoll, edit, remove, react, vote, markRead, unreadCount, subscribe });
})(window);
