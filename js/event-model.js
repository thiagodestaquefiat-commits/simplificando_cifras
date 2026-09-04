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
      isCurrentUser: Boolean(value.isCurrentUser),
      isLeader: Boolean(value.isLeader)
    };
  }

  function repertoireEdit(source) {
    const value = source && typeof source === "object" ? source : {};
    return {
      title: text(value.title),
      artist: text(value.artist),
      key: text(value.key),
      capo: text(value.capo),
      chordSheet: String(value.chordSheet == null ? "" : value.chordSheet),
      notes: text(value.notes),
      updatedAt: value.updatedAt || new Date().toISOString()
    };
  }

  function repertoireItem(source, index) {
    const value = typeof source === "object" && source !== null ? source : { songId: source };
    return {
      id: id(value.id, "repertoire"),
      songId: value.songId == null ? null : value.songId,
      order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
      shared: repertoireEdit(value.shared),
      personalEdits: Object.fromEntries(Object.entries(value.personalEdits && typeof value.personalEdits === "object" ? value.personalEdits : {}).map(([userId, edit]) => [text(userId), repertoireEdit(edit)]).filter(([userId]) => userId))
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

  function eventLocation(source) {
    if (!source || typeof source !== "object") return null;
    const latitude = Number(source.latitude);
    const longitude = Number(source.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return {
      name: text(source.name),
      formattedAddress: text(source.formattedAddress),
      street: text(source.street),
      streetNumber: text(source.streetNumber),
      district: text(source.district),
      city: text(source.city),
      state: text(source.state),
      postalCode: text(source.postalCode),
      country: text(source.country),
      latitude,
      longitude,
      placeId: text(source.placeId),
      provider: text(source.provider)
    };
  }

  function create(source) {
    const value = source || {};
    const legacySongs = Array.isArray(value.musicas) ? value.musicas : [];
    const repertoire = (Array.isArray(value.repertoire) ? value.repertoire : legacySongs).map(repertoireItem).sort((a, b) => a.order - b.order);
    let members = (Array.isArray(value.members) ? value.members : []).map(member);
    const requestedLeader = text(value.leaderId);
    const inferredLeader = members.find((item) => item.isLeader) || members.find((item) => /lider/i.test(item.role)) || members[0];
    const leaderId = members.some((item) => item.id === requestedLeader) ? requestedLeader : inferredLeader && inferredLeader.id || "";
    members = members.map((item) => ({ ...item, isLeader: Boolean(leaderId && item.id === leaderId) }));
    return {
      id: id(value.id, "event"),
      title: text(value.title) || "Novo evento",
      date: text(value.date),
      time: text(value.time),
      location: text(value.location),
      eventLocation: eventLocation(value.eventLocation),
      description: text(value.description),
      bandId: text(value.bandId) || null,
      repertoire,
      musicas: repertoire.map((item) => item.songId),
      members,
      leaderId,
      notifications: (Array.isArray(value.notifications) ? value.notifications : []).map(notification).slice(-50),
      remoteVersion: value.remoteVersion != null && Number.isFinite(Number(value.remoteVersion)) ? Number(value.remoteVersion) : null,
      syncState: ["synced", "pending", "error"].includes(value.syncState) ? value.syncState : "pending",
      pendingShared: value.pendingShared == null ? value.remoteVersion == null && value.syncState !== "synced" : Boolean(value.pendingShared),
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

  function isLeader(event, userId) {
    const normalized = create(event);
    return Boolean(normalized.leaderId && String(normalized.leaderId) === String(userId));
  }

  function canEditShared(event, userId) {
    return canAccess(event, userId) && isLeader(event, userId);
  }

  function requireMember(event, userId) {
    if (!canAccess(event, userId)) throw new Error("Somente integrantes podem editar este evento.");
  }

  function requireLeader(event, userId) {
    requireMember(event, userId);
    if (!isLeader(event, userId)) throw new Error("Somente o líder pode alterar o repertório compartilhado.");
  }

  function findRepertoireItem(event, itemId) {
    return event.repertoire.find((item) => String(item.id) === String(itemId));
  }

  function effectiveRepertoireItem(event, itemId, userId) {
    const normalized = create(event);
    const item = findRepertoireItem(normalized, itemId);
    if (!item) return null;
    const personal = item.personalEdits[String(userId)] || null;
    return {
      ...item,
      effective: {
        title: personal ? personal.title : item.shared.title,
        artist: personal ? personal.artist : item.shared.artist,
        key: personal ? personal.key : item.shared.key,
        capo: personal ? personal.capo : item.shared.capo,
        chordSheet: personal ? personal.chordSheet : item.shared.chordSheet,
        notes: personal ? personal.notes : item.shared.notes,
        scope: personal ? "personal" : "shared"
      }
    };
  }

  function applyPersonalEdit(event, itemId, userId, changes) {
    const normalized = create(event);
    requireMember(normalized, userId);
    if (!findRepertoireItem(normalized, itemId)) throw new Error("A música não pertence a este repertório.");
    return create({
      ...normalized,
      repertoire: normalized.repertoire.map((item) => String(item.id) !== String(itemId) ? item : {
        ...item,
        personalEdits: { ...item.personalEdits, [String(userId)]: repertoireEdit(changes) }
      })
    });
  }

  function clearPersonalEdit(event, itemId, userId) {
    const normalized = create(event);
    requireMember(normalized, userId);
    return create({
      ...normalized,
      repertoire: normalized.repertoire.map((item) => {
        if (String(item.id) !== String(itemId)) return item;
        const personalEdits = { ...item.personalEdits };
        delete personalEdits[String(userId)];
        return { ...item, personalEdits };
      })
    });
  }

  function applySharedEdit(event, itemId, actorId, changes) {
    const normalized = create(event);
    requireLeader(normalized, actorId);
    if (!findRepertoireItem(normalized, itemId)) throw new Error("A música não pertence a este repertório.");
    return create({
      ...normalized,
      repertoire: normalized.repertoire.map((item) => String(item.id) !== String(itemId) ? item : {
        ...item,
        shared: repertoireEdit(changes)
      })
    });
  }

  function migrateCurrentUser(event, currentUser, legacyIds) {
    const normalized = create(event);
    if (!currentUser || !currentUser.id) return normalized;
    const aliases = new Set((Array.isArray(legacyIds) ? legacyIds : []).map(String));
    aliases.add("local-user");
    const currentId = String(currentUser.id);
    let replaced = false;
    const members = normalized.members.map((item) => {
      const legacy = item.isCurrentUser || aliases.has(String(item.id));
      if (!legacy || replaced) return item;
      replaced = true;
      return { ...item, ...currentUser, id: currentId, isCurrentUser: true };
    });
    const hasCurrent = members.some((item) => String(item.id) === currentId);
    if (!hasCurrent && normalized.members.length === 0) members.push({ ...member(currentUser, 0), id: currentId, isCurrentUser: true, isLeader: true });
    const oldLeader = aliases.has(String(normalized.leaderId));
    return create({
      ...normalized,
      leaderId: oldLeader || !normalized.leaderId ? currentId : normalized.leaderId,
      members,
      repertoire: normalized.repertoire.map((item) => {
        const personalEdits = { ...item.personalEdits };
        for (const alias of aliases) {
          if (alias !== currentId && personalEdits[alias] && !personalEdits[currentId]) personalEdits[currentId] = personalEdits[alias];
          if (alias !== currentId) delete personalEdits[alias];
        }
        return { ...item, personalEdits };
      })
    });
  }

  global.eventModel = Object.freeze({ ROLES, create, normalizeCollection, withSharedChange, canAccess, isLeader, canEditShared, requireMember, requireLeader, effectiveRepertoireItem, applyPersonalEdit, clearPersonalEdit, applySharedEdit, migrateCurrentUser });
})(window);
