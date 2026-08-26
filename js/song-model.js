(function (global) {
  "use strict";

  const EXTERNAL_FIELDS = Object.freeze([
    "album",
    "coverUrl",
    "spotifyTrackId",
    "spotifyUri",
    "isrc"
  ]);

  function cleanText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function optionalText(value) {
    const cleaned = cleanText(value);
    return cleaned || null;
  }

  function preserveText(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function normalizeForIdentity(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeDuration(value) {
    if (value === null || value === undefined || value === "") return null;
    const duration = Number(value);
    return Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : null;
  }

  function normalizeBlocks(value) {
    if (!Array.isArray(value)) return [];
    return value.map((block) => ({
      l: preserveText(block && block.l),
      c: preserveText(block && block.c)
    }));
  }

  function normalizeFullChordSheet(value) {
    if (!value || typeof value !== "object") return null;
    const content = preserveText(value.content).replace(/\r\n?/g, "\n").trim();
    if (!content) return null;
    return {
      visibility: "private",
      source: value.source === "user_text" ? "user_text" : "user_upload",
      content
    };
  }

  function normalizeAccessContext(value) {
    const context = value && typeof value === "object" ? value : {};
    const scope = context.scope === "team" ? "team" : "personal";
    return {
      scope,
      ownerId: optionalText(context.ownerId),
      teamId: scope === "team" ? optionalText(context.teamId) : null
    };
  }

  function create(input, options) {
    const source = input || {};
    const settings = options || {};
    const title = cleanText(source.title);
    if (!title) throw new TypeError("Song precisa de um título.");

    const now = settings.now || new Date().toISOString();
    const id = source.id !== null && source.id !== undefined
      ? source.id
      : (settings.generateId ? settings.generateId() : Date.now());

    return {
      ...source,
      id,
      title,
      artist: cleanText(source.artist),
      album: optionalText(source.album),
      duration: normalizeDuration(source.duration !== undefined ? source.duration : source.durationMs),
      coverUrl: optionalText(source.coverUrl),
      spotifyTrackId: optionalText(source.spotifyTrackId),
      spotifyUri: optionalText(source.spotifyUri),
      isrc: optionalText(source.isrc) ? optionalText(source.isrc).toUpperCase() : null,
      key: cleanText(source.key),
      capo: cleanText(source.capo),
      blocos: normalizeBlocks(source.blocos),
      accessContext: normalizeAccessContext(source.accessContext),
      fullChordSheet: normalizeFullChordSheet(source.fullChordSheet),
      createdAt: source.createdAt || now,
      updatedAt: source.updatedAt || source.createdAt || now
    };
  }

  function normalizeCollection(collection, options) {
    if (!Array.isArray(collection)) return [];
    return collection.map((song) => create(song, options));
  }

  function sameExternalId(left, right, field) {
    const leftValue = optionalText(left && left[field]);
    const rightValue = optionalText(right && right[field]);
    if (!leftValue || !rightValue) return false;
    return field === "isrc"
      ? leftValue.toLocaleUpperCase("en-US") === rightValue.toLocaleUpperCase("en-US")
      : leftValue === rightValue;
  }

  function hasSameTitleAndArtist(left, right) {
    const leftTitle = normalizeForIdentity(left && left.title);
    const rightTitle = normalizeForIdentity(right && right.title);
    if (!leftTitle || leftTitle !== rightTitle) return false;

    const leftArtist = normalizeForIdentity(left && left.artist);
    const rightArtist = normalizeForIdentity(right && right.artist);
    return leftArtist === rightArtist;
  }

  function findDuplicate(collection, candidate) {
    if (!Array.isArray(collection) || !candidate) return null;
    return collection.find((song) =>
      sameExternalId(song, candidate, "spotifyTrackId") ||
      sameExternalId(song, candidate, "isrc") ||
      hasSameTitleAndArtist(song, candidate)
    ) || null;
  }

  function enrich(existing, incoming, options) {
    const source = incoming || {};
    const additions = {};
    EXTERNAL_FIELDS.forEach((field) => {
      if (!optionalText(existing && existing[field]) && optionalText(source[field])) additions[field] = source[field];
    });
    if (existing && normalizeDuration(existing.duration) === null && normalizeDuration(source.duration) !== null) {
      additions.duration = source.duration;
    }
    return create({
      ...existing,
      ...additions,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: (options && options.now) || new Date().toISOString()
    }, options);
  }

  global.songModel = Object.freeze({
    create,
    normalizeCollection,
    normalizeAccessContext,
    normalizeForIdentity,
    findDuplicate,
    enrich
  });
})(window);
