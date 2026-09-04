(function (global) {
  "use strict";

  const IDENTITY_KEY = "sc_collaboration_identity_v1";
  const PERSONAL_QUEUE_KEY = "sc_collaboration_personal_queue_v1";

  function generatedId() {
    const value = global.crypto && typeof global.crypto.randomUUID === "function" ? global.crypto.randomUUID().replace(/-/g, "") : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return "user_" + value;
  }

  function readIdentity() {
    const value = global.storage && global.storage.get(IDENTITY_KEY, null);
    return value && value.user && value.user.id ? value : null;
  }

  function readPersonalQueue() {
    const value = global.storage && global.storage.get(PERSONAL_QUEUE_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function queuePersonalOperation(eventId, itemId, action, changes) {
    const operation = {
      eventId: String(eventId), itemId: String(itemId),
      action: action === "delete" ? "delete" : "upsert",
      changes: action === "delete" ? null : {
        title: String(changes && changes.title || ""), artist: String(changes && changes.artist || ""),
        key: String(changes && changes.key || ""), capo: String(changes && changes.capo || ""),
        chordSheet: String(changes && changes.chordSheet || ""), notes: String(changes && changes.notes || "")
      },
      queuedAt: new Date().toISOString()
    };
    const queue = readPersonalQueue().filter((item) => !(String(item.eventId) === operation.eventId && String(item.itemId) === operation.itemId));
    queue.push(operation);
    global.storage.set(PERSONAL_QUEUE_KEY, queue);
    return operation;
  }

  function clearPersonalOperation(eventId, itemId) {
    const queue = readPersonalQueue().filter((item) => !(String(item.eventId) === String(eventId) && String(item.itemId) === String(itemId)));
    global.storage.set(PERSONAL_QUEUE_KEY, queue);
  }

  function ensureLocalIdentity(fallback) {
    const current = readIdentity();
    if (current) return current;
    const source = fallback && typeof fallback === "object" ? fallback : {};
    const legacyId = String(source.id || "local-user");
    const user = {
      id: legacyId === "local-user" ? generatedId() : legacyId,
      name: String(source.name || "Você").trim() || "Você",
      role: String(source.role || "Liderança").trim() || "Liderança",
      avatarUrl: source.avatarUrl || null
    };
    const identity = { user, accessToken: null, status: "local", legacyUserIds: legacyId === user.id ? [] : [legacyId] };
    global.storage.set(IDENTITY_KEY, identity);
    global.storage.set("sc_current_user_v1", user);
    return identity;
  }

  function endpoint(path) {
    if (!global.apiConfig || typeof global.apiConfig.collaborationEndpoint !== "function") return "";
    return global.apiConfig.collaborationEndpoint(path);
  }

  class CollaborationError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = "CollaborationError";
      this.status = Number(status) || 0;
      this.code = code || "erro_colaboracao";
      this.offline = this.status === 0;
    }
  }

  const REMOTE_IDENTIFIER = /^[A-Za-z0-9_.:-]{3,120}$/;
  const ENCODED_SONG_ID_PREFIX = "scid64_";

  function base64UrlEncode(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return global.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlDecode(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = global.atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  }

  function toRemoteSongId(value) {
    if (value != null && typeof value !== "string" && !(typeof value === "number" && Number.isSafeInteger(value))) {
      throw new CollaborationError("Uma música do repertório possui identificador local incompatível.", 400, "song_id_local_incompativel");
    }
    const localId = String(value == null ? "" : value);
    if (REMOTE_IDENTIFIER.test(localId) && !localId.startsWith(ENCODED_SONG_ID_PREFIX)) return localId;
    if (!localId.trim()) throw new CollaborationError("Uma música do repertório não possui identificador.", 400, "song_id_ausente");
    const encoded = ENCODED_SONG_ID_PREFIX + base64UrlEncode(localId);
    if (!REMOTE_IDENTIFIER.test(encoded)) {
      throw new CollaborationError("Uma música do repertório possui identificador local incompatível.", 400, "song_id_local_incompativel");
    }
    return encoded;
  }

  function fromRemoteSongId(value) {
    const remoteId = String(value == null ? "" : value);
    if (!remoteId.startsWith(ENCODED_SONG_ID_PREFIX)) return value;
    try {
      const decoded = base64UrlDecode(remoteId.slice(ENCODED_SONG_ID_PREFIX.length));
      return decoded && toRemoteSongId(decoded) === remoteId ? decoded : value;
    } catch (_error) {
      return value;
    }
  }

  async function request(path, options) {
    const identity = readIdentity();
    const url = endpoint(path);
    if (!url) throw new CollaborationError("Backend colaborativo não configurado.", 0, "backend_indisponivel");
    const headers = { "Content-Type": "application/json", ...options && options.headers };
    const externalToken = global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken();
    const accessToken = externalToken || identity && identity.accessToken;
    if (accessToken) headers.Authorization = "Bearer " + accessToken;
    let response;
    try {
      response = await global.fetch(url, { ...options, headers });
    } catch (_error) {
      throw new CollaborationError("Sem conexão com o backend colaborativo.", 0, "offline");
    }
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const error = body && body.erro || {};
      throw new CollaborationError(error.mensagem || "Não foi possível sincronizar o evento.", response.status, error.codigo);
    }
    return body;
  }

  async function ensureRegistered(fallback) {
    let identity = readIdentity() || ensureLocalIdentity(fallback);
    if (global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken()) {
      const legacyToken = identity.accessToken;
      if (legacyToken && identity.status !== "supabase") {
        await request("/identity/claim", { method: "POST", body: JSON.stringify({ legacyToken }) });
      }
      const user = await request("/me", { method: "GET" });
      identity = { ...identity, user: { ...identity.user, ...user }, accessToken: null, status: "supabase", legacyUserIds: [...new Set([...(identity.legacyUserIds || []), identity.user.id].filter(Boolean))] };
      global.storage.set(IDENTITY_KEY, identity);
      global.storage.set("sc_current_user_v1", identity.user);
      return identity;
    }
    if (identity.accessToken) return identity;
    const response = await request("/users", {
      method: "POST",
      body: JSON.stringify({ id: identity.user.id, name: identity.user.name, avatarUrl: identity.user.avatarUrl })
    });
    identity = { ...identity, user: { ...identity.user, ...response.user }, accessToken: response.accessToken, status: "registered" };
    global.storage.set(IDENTITY_KEY, identity);
    global.storage.set("sc_current_user_v1", identity.user);
    return identity;
  }

  function toRemotePayload(event) {
    const normalized = global.eventModel.create(event);
    return {
      id: String(normalized.id),
      title: normalized.title,
      date: normalized.date,
      time: normalized.time,
      location: normalized.location,
      eventLocation: normalized.eventLocation,
      bandId: normalized.bandId,
      description: normalized.description,
      leaderId: String(normalized.leaderId),
      remoteVersion: normalized.remoteVersion,
      members: normalized.members.map((member) => ({ id: String(member.id), name: member.name, role: member.role, avatarUrl: member.avatarUrl })),
      repertoire: normalized.repertoire.map((item) => ({ id: String(item.id), songId: toRemoteSongId(item.songId), order: item.order, shared: item.shared }))
    };
  }

  function fromRemote(value) {
    const identity = readIdentity();
    const userId = identity && identity.user && String(identity.user.id);
    return global.eventModel.create({
      ...value,
      syncState: "synced",
      pendingShared: false,
      repertoire: (value.repertoire || []).map((item) => ({
        ...item,
        songId: fromRemoteSongId(item.songId),
        personalEdits: item.personal && userId ? { [userId]: item.personal } : {}
      }))
    });
  }

  async function listEvents(fallback) {
    await ensureRegistered(fallback);
    const body = await request("/events", { method: "GET" });
    return (body.events || []).map(fromRemote);
  }

  async function saveSharedEvent(event, fallback) {
    await ensureRegistered(fallback);
    const normalized = global.eventModel.create(event);
    const body = await request("/events" + (normalized.remoteVersion == null ? "" : "/" + encodeURIComponent(normalized.id)), {
      method: normalized.remoteVersion == null ? "POST" : "PUT",
      body: JSON.stringify(toRemotePayload(normalized))
    });
    return fromRemote(body);
  }

  async function saveSharedItem(event, itemId, changes, fallback) {
    await ensureRegistered(fallback);
    const body = await request("/events/" + encodeURIComponent(event.id) + "/repertoire/" + encodeURIComponent(itemId) + "/shared", {
      method: "PATCH",
      body: JSON.stringify({ ...changes, remoteVersion: event.remoteVersion })
    });
    return fromRemote(body);
  }

  async function savePersonalItem(event, itemId, changes, fallback) {
    await ensureRegistered(fallback);
    const body = await request("/events/" + encodeURIComponent(event.id) + "/repertoire/" + encodeURIComponent(itemId) + "/personal", {
      method: "PUT",
      body: JSON.stringify(changes)
    });
    clearPersonalOperation(event.id, itemId);
    return fromRemote(body);
  }

  async function clearPersonalItem(event, itemId, fallback) {
    await ensureRegistered(fallback);
    const body = await request("/events/" + encodeURIComponent(event.id) + "/repertoire/" + encodeURIComponent(itemId) + "/personal", { method: "DELETE" });
    clearPersonalOperation(event.id, itemId);
    return fromRemote(body);
  }

  async function flushPersonalQueue(fallback) {
    await ensureRegistered(fallback);
    const synchronized = [];
    for (const operation of readPersonalQueue()) {
      const path = "/events/" + encodeURIComponent(operation.eventId) + "/repertoire/" + encodeURIComponent(operation.itemId) + "/personal";
      const body = await request(path, operation.action === "delete" ? { method: "DELETE" } : { method: "PUT", body: JSON.stringify(operation.changes) });
      clearPersonalOperation(operation.eventId, operation.itemId);
      synchronized.push(fromRemote(body));
    }
    return synchronized;
  }

  async function deleteEvent(event, fallback) {
    await ensureRegistered(fallback);
    await request("/events/" + encodeURIComponent(event.id), { method: "DELETE" });
    return true;
  }

  function currentAccessToken() {
    return global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken() || readIdentity() && readIdentity().accessToken || null;
  }

  global.eventCollaboration = Object.freeze({ identityKey: IDENTITY_KEY, personalQueueKey: PERSONAL_QUEUE_KEY, readIdentity, ensureLocalIdentity, ensureRegistered, listEvents, saveSharedEvent, saveSharedItem, savePersonalItem, clearPersonalItem, queuePersonalOperation, readPersonalQueue, flushPersonalQueue, deleteEvent, toRemotePayload, fromRemote, toRemoteSongId, fromRemoteSongId, currentAccessToken, CollaborationError });
})(window);
