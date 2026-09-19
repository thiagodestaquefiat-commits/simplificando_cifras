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
  function endpoint(eventId, suffix) {
    return global.apiConfig.collaborationEndpoint("/events/" + encodeURIComponent(eventId) + "/messages" + (suffix || ""));
  }
  async function request(eventId, suffix, options) {
    const token = global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken();
    if (!token) throw new Error("Entre com sua conta para sincronizar o chat.");
    const response = await global.fetch(endpoint(eventId, suffix), {
      ...(options || {}),
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + token, ...((options && options.headers) || {}) }
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body && body.erro && body.erro.mensagem || "Não foi possível sincronizar o chat.");
    return body;
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
  function replaceRemote(eventId, messages) {
    const all = allMessages();
    const pending = (all[String(eventId)] || []).filter((message) => message.pending);
    const remote = Array.isArray(messages) ? messages : [];
    const remoteIds = new Set(remote.map((message) => String(message.id)));
    all[String(eventId)] = [...remote, ...pending.filter((message) => !remoteIds.has(String(message.id)))].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    saveMessages(all);
    notify(eventId);
    return all[String(eventId)];
  }
  async function refresh(eventId) {
    assertAccess(eventId);
    const body = await request(eventId, "?limit=200", { method: "GET" });
    replaceRemote(eventId, body && body.messages);
    await flush(eventId);
    return allMessages()[String(eventId)] || [];
  }
  async function createRemote(message) {
    const saved = await request(message.eventId, "", { method: "POST", body: JSON.stringify({ clientId: message.id, type: message.type, content: message.content, replyTo: message.replyTo, poll: message.poll }) });
    write(message.eventId, (values) => values.map((value) => String(value.id) === String(message.id) ? saved : value));
    if (global.syncRealtime) global.syncRealtime.publishChat(message.eventId);
    return saved;
  }
  async function flush(eventId) {
    const pending = (allMessages()[String(eventId)] || []).filter((message) => message.pending);
    for (const message of pending) {
      try { await createRemote(message); } catch (_error) { break; }
    }
    return pending.length;
  }
  async function updateRemote(eventId, messageId, action) {
    const saved = await request(eventId, "/" + encodeURIComponent(messageId), { method: "PATCH", body: JSON.stringify(action) });
    write(eventId, (values) => values.map((value) => String(value.id) === String(messageId) ? saved : value));
    if (global.syncRealtime) global.syncRealtime.publishChat(eventId);
    return saved;
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
    return { id: uid("message"), eventId, type, sender: { id: user.id, name: user.name, avatarUrl: user.avatarUrl || null }, reactions: {}, createdAt: new Date().toISOString(), editedAt: null, pending: true };
  }
  function sendText(eventId, content, replyTo) {
    const cleaned = String(content || "").trim();
    if (!cleaned) throw new Error("Digite uma mensagem.");
    const message = { ...baseMessage(eventId, "text"), content: cleaned, replyTo: replyTo || null };
    write(eventId, (values) => [...values, message]);
    createRemote(message).catch(() => {});
    return message;
  }
  function sendSystem(eventId, content) {
    const message = { ...baseMessage(eventId, "system"), content: String(content || "") };
    write(eventId, (values) => [...values, message]);
    createRemote(message).catch(() => {});
    return message;
  }
  function createPoll(eventId, poll) {
    const options = (poll.options || []).map((label) => String(label || "").trim()).filter(Boolean).map((label) => ({ id: uid("option"), label }));
    if (!String(poll.question || "").trim() || options.length < 2) throw new Error("Informe uma pergunta e pelo menos duas opções.");
    const message = { ...baseMessage(eventId, "poll"), poll: { question: String(poll.question).trim(), options, multiple: Boolean(poll.multiple), showVoters: poll.showVoters !== false, votes: {} } };
    write(eventId, (values) => [...values, message]);
    createRemote(message).catch(() => {});
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
  function edit(eventId, messageId, content) { const cleaned=String(content||"").trim();updateOwn(eventId, messageId, (message) => ({ ...message, content: cleaned, editedAt: new Date().toISOString() }));updateRemote(eventId,messageId,{action:"edit",content:cleaned}).catch(()=>{}); }
  function remove(eventId, messageId) { updateOwn(eventId, messageId, (message) => ({ ...message, deleted: true, content: "", editedAt: new Date().toISOString() }));updateRemote(eventId,messageId,{action:"delete"}).catch(()=>{}); }
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
    updateRemote(eventId,messageId,{action:"react",emoji}).catch(()=>{});
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
    updateRemote(eventId,messageId,{action:"vote",optionId}).catch(()=>{});
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
    global.addEventListener("online", () => Object.keys(allMessages()).forEach((eventId) => flush(eventId)));
  }

  global.eventChat = Object.freeze({ initialize, refresh, list, sendText, sendSystem, createPoll, edit, remove, react, vote, markRead, unreadCount, subscribe });
})(window);
