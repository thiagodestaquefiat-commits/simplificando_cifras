(function (global) {
  "use strict";

  const ROLES = Object.freeze(["Vocal", "Guitarra", "Violão", "Baixo", "Bateria", "Teclado", "Liderança", "Áudio", "Outra"]);

  function text(value) { return String(value == null ? "" : value).trim(); }
  function id(value, prefix) { return text(value) || prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }

  function member(source, index) {
    const value = source || {};
    return {
      id: id(value.id, "member"),
      name: text(value.name) || "Membro " + (index + 1),
      role: text(value.role) || "Outra",
      avatarUrl: text(value.avatarUrl) || null,
      isCurrentUser: Boolean(value.isCurrentUser)
    };
  }

  function repertoireItem(source, index) {
    const value = typeof source === "object" && source !== null ? source : { songId: source };
    return {
      id: id(value.id, "repertoire"),
      songId: value.songId == null ? value.id : value.songId,
      order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
      shared: { key: text(value.shared && value.shared.key), notes: text(value.shared && value.shared.notes) },
      personalEdits: value.personalEdits && typeof value.personalEdits === "object" ? value.personalEdits : {}
    };
  }

  function notification(source) {
    const value = source || {};
    return {
      id: id(value.id, "notification"),
      actorId: text(value.actorId),
      actorName: text(value.actorName) || "Alguém",
      kind: text(value.kind) || "event.updated",
      summary: text(value.summary) || "Atualizou o evento",
      createdAt: value.createdAt || new Date().toISOString()
    };
  }

  function create(source) {
    const value = source || {};
    const legacySongs = Array.isArray(value.musicas) ? value.musicas : [];
    const repertoire = (Array.isArray(value.repertoire) ? value.repertoire : legacySongs).map(repertoireItem).sort((a, b) => a.order - b.order);
    const members = (Array.isArray(value.members) ? value.members : []).map(member);
    return {
      id: id(value.id, "event"),
      title: text(value.title) || "Novo evento",
      date: text(value.date),
      time: text(value.time),
      location: text(value.location),
      description: text(value.description),
      repertoire,
      musicas: repertoire.map((item) => item.songId),
      members,
      notifications: (Array.isArray(value.notifications) ? value.notifications : []).map(notification).slice(-50),
      createdAt: value.createdAt || new Date().toISOString(),
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  }

  function normalizeCollection(values) { return (Array.isArray(values) ? values : []).map(create); }

  function withSharedChange(event, actor, kind, summary) {
    const normalized = create(event);
    const notice = notification({ actorId: actor && actor.id, actorName: actor && actor.name, kind, summary });
    return create({ ...normalized, notifications: [...normalized.notifications, notice], updatedAt: notice.createdAt });
  }

  function canAccess(event, userId) {
    const normalized = create(event);
    return normalized.members.length === 0 || normalized.members.some((item) => String(item.id) === String(userId));
  }

  global.eventModel = Object.freeze({ ROLES, create, normalizeCollection, withSharedChange, canAccess });
})(window);
